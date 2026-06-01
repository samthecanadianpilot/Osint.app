// Production (Vercel) live data source — REAL data, zero backend server.
//
//   • Aircraft  → GET /api/aircraft   (serverless → OpenSky/adsb, refreshed 30s)
//   • Ships     → GET /api/ships       (serverless → AISStream/Fintraffic, 45s)
//   • Satellites→ GET /api/tle (full catalog) → propagated in a Web Worker
//                  (see trackRenderer/satWorker), NOT through the store.
//   • CCTV      → static seed points
//
// Aircraft/ships are dead-reckoned each second between polls for smooth motion;
// the renderer interpolates further to 60fps.
import { createWorld } from './simulator.js';
import { movePoint, KTS_TO_KMH } from './geo.js';

const AIRCRAFT_COLOR = '#ff9f0a';
const SHIP_COLOR = '#0a84ff';

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

  const world = createWorld();
  const cctv = world.tracks.filter(t => t.type === 'cctv');

  let aircraft = [];
  let ships = [];

  const all = () => [...aircraft, ...ships, ...cctv];

  s().setSnapshot({
    tracks: all(),
    arcs: [],
    feed: [{ ts: new Date().toISOString(), level: 'system', source: 'LIVE', message: 'Connecting to live ADS-B + AIS + orbital feeds…' }],
    mode: 'live',
  });
  s().setConnected(true);

  const refreshArcs = () => s().setArcs(computeArcs([...ships]).slice(0, 40));

  async function loadAircraft() {
    try {
      const j = await (await fetch('/api/aircraft')).json();
      if (Array.isArray(j.aircraft)) {
        aircraft = j.aircraft.map(a => ({ ...a, color: AIRCRAFT_COLOR }));
        s().addEvent({ ts: new Date().toISOString(), level: 'track', source: 'ADS-B', message: `Refreshed flight vectors: ${aircraft.length} live aircraft tracked.` });
      }
    } catch (e) { /* keep last good */ }
  }

  async function loadShips() {
    try {
      const j = await (await fetch('/api/ships')).json();
      if (Array.isArray(j.ships)) {
        ships = j.ships.map(v => ({ ...v, color: SHIP_COLOR }));
        refreshArcs();
        s().addEvent({ ts: new Date().toISOString(), level: 'track', source: 'AIS', message: `Maritime update: ${ships.length} live vessels (${j.region || 'AIS'}).` });
      }
    } catch (e) { /* keep last good */ }
  }

  // Satellite TLEs → store → GlobeView hands them to the renderer's worker.
  async function loadTLEs() {
    try {
      const j = await (await fetch('/api/tle?cap=20000')).json();
      const tles = (j.satellites || []).map(d => ({ tle1: d.tle1, tle2: d.tle2 }));
      s().setTLEs(tles);
      s().setSatCount(tles.length);
      s().addEvent({ ts: new Date().toISOString(), level: 'info', source: 'TLE', message: `Loaded ${tles.length} orbital elements from Celestrak.` });
    } catch (e) { /* none */ }
  }

  loadAircraft();
  loadShips();
  loadTLEs();
  const refetchAir = setInterval(loadAircraft, 30000);
  const refetchShips = setInterval(loadShips, 45000);
  const refetchTLE = setInterval(loadTLEs, 3600000); // hourly

  let tick = 0;
  const timer = setInterval(() => {
    tick++;
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
        message: `${a.callsign} FL${Math.round((a.altitude || 0) / 100)} @ ${Math.round(a.speed || 0)}kt`,
      });
    }
  }, 1000);

  return () => { clearInterval(timer); clearInterval(refetchAir); clearInterval(refetchShips); clearInterval(refetchTLE); };
}
