// Production (Vercel) live data source — REAL data with zero backend server.
//
//   • Aircraft  → GET /api/aircraft   (serverless → adsb.lol, refreshed 30s)
//   • Satellites→ GET /api/tle         (serverless → Celestrak) then propagated
//                  in-browser with satellite.js SGP4 every second
//   • Ships     → simulated (no keyless global AIS source) + great-circle motion
//   • CCTV      → static seed points
//
// Between aircraft polls, aircraft/ships are dead-reckoned along their heading
// so motion stays smooth. Drives the exact same store actions as the WS source.
import * as satellite from 'satellite.js';
import { createWorld } from './simulator.js';
import { movePoint, KTS_TO_KMH } from './geo.js';

const AIRCRAFT_COLOR = '#ff9f0a';
const SAT_COLOR = '#34c759';

function computeArcs(tracks) {
  return tracks
    .filter(t => Array.isArray(t.route) && t.route.length === 2)
    .map(t => ({
      id: t.id, type: t.type, color: t.color,
      startLat: t.route[0][1], startLng: t.route[0][0],
      endLat: t.route[1][1], endLng: t.route[1][0],
    }));
}

export function startLive(store) {
  const s = () => store.getState();

  // Ships + CCTV come from the seed world (no free global AIS feed).
  const world = createWorld();
  const ships = world.tracks.filter(t => t.type === 'ship');
  const cctv = world.tracks.filter(t => t.type === 'cctv');

  let aircraft = [];          // mapped from /api/aircraft
  let sats = [];              // { id, name, noradId, satrec, track }

  const all = () => [
    ...aircraft,
    ...sats.map(x => x.track).filter(Boolean),
    ...ships,
    ...cctv,
  ];

  s().setSnapshot({
    tracks: all(),
    arcs: computeArcs(ships),
    feed: [{ ts: new Date().toISOString(), level: 'system', source: 'LIVE', message: 'Connecting to live ADS-B + orbital feeds…' }],
    mode: 'live',
  });
  s().setConnected(true);

  async function loadAircraft() {
    try {
      const r = await fetch('/api/aircraft');
      const j = await r.json();
      if (Array.isArray(j.aircraft)) {
        aircraft = j.aircraft.map(a => ({ ...a, color: AIRCRAFT_COLOR }));
        s().setArcs(computeArcs([...aircraft, ...ships]));
        s().addEvent({ ts: new Date().toISOString(), level: 'track', source: 'ADS-B', message: `Refreshed flight vectors: ${aircraft.length} live aircraft tracked.` });
      }
    } catch (e) { /* keep last good set */ }
  }

  async function loadSats() {
    try {
      const r = await fetch('/api/tle');
      const j = await r.json();
      sats = (j.satellites || []).map(d => ({
        id: d.id, name: d.name, noradId: d.noradId,
        satrec: satellite.twoline2satrec(d.tle1, d.tle2),
        track: null,
      }));
      s().addEvent({ ts: new Date().toISOString(), level: 'info', source: 'TLE', message: `Loaded ${sats.length} orbital elements from Celestrak.` });
    } catch (e) { /* none */ }
  }

  loadAircraft();
  loadSats();
  const refetch = setInterval(loadAircraft, 30000);

  let tick = 0;
  const timer = setInterval(() => {
    tick++;
    const now = new Date();

    // Propagate real satellites with SGP4.
    for (const x of sats) {
      try {
        const pv = satellite.propagate(x.satrec, now);
        if (!pv.position) continue;
        const gmst = satellite.gstime(now);
        const gd = satellite.eciToGeodetic(pv.position, gmst);
        let lng = satellite.degreesLong(gd.longitude);
        lng = ((lng + 180) % 360) - 180;
        const lat = satellite.degreesLat(gd.latitude);
        const vel = pv.velocity
          ? Math.sqrt(pv.velocity.x ** 2 + pv.velocity.y ** 2 + pv.velocity.z ** 2)
          : 7.6;
        x.track = {
          id: x.id, name: x.name, noradId: x.noradId,
          lat, lng,
          altitude: Math.round(gd.height),
          velocity: +vel.toFixed(2),
          inclination: satellite.radiansToDegrees(x.satrec.inclo).toFixed(1),
          period: (2 * Math.PI / x.satrec.no).toFixed(1),
          source: 'TLE', type: 'satellite', color: SAT_COLOR,
        };
      } catch (e) { /* skip */ }
    }

    // Dead-reckon aircraft + ships along heading at their speed.
    for (const t of [...aircraft, ...ships]) {
      const distKm = ((t.speed || 0) * KTS_TO_KMH) / 3600;
      const n = movePoint(t.lat, t.lng, t.heading || 90, distKm);
      t.lat = n.lat; t.lng = n.lng;
    }

    s().setTracks(all());

    if (tick % 6 === 0 && aircraft.length) {
      const a = aircraft[tick % aircraft.length];
      s().addEvent({
        ts: new Date().toISOString(), level: 'track', source: 'ADS-B',
        objectId: a.id, type: 'aircraft',
        message: `${a.callsign} FL${Math.round((a.altitude || 0) / 100)} @ ${Math.round(a.speed || 0)}kt — ${a.from}→${a.to}`,
      });
    }
  }, 1000);

  return () => { clearInterval(timer); clearInterval(refetch); };
}
