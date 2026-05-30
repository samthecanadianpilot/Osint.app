// In-browser world simulation — a port of the backend store's step logic.
// Used when no live backend is configured (Path B / Vercel deploy), so the
// globe is "live" with zero servers.
import { aircraft, ships, satellites, cctv, LAYER_COLORS } from '../data/seed.js';
import { movePoint, KTS_TO_KMH } from './geo.js';

export function createWorld() {
  const tracks = [];
  const load = (arr, type) =>
    arr.forEach(o => tracks.push({ ...o, type, color: LAYER_COLORS[type] }));
  load(aircraft, 'aircraft');
  load(ships, 'ship');
  load(satellites, 'satellite');
  load(cctv, 'cctv');

  const arcs = tracks
    .filter(t => Array.isArray(t.route) && t.route.length === 2)
    .map(t => ({
      id: t.id, type: t.type, color: t.color,
      startLat: t.route[0][1], startLng: t.route[0][0],
      endLat: t.route[1][1], endLng: t.route[1][0],
    }));

  let tick = 0;

  function step() {
    tick++;
    for (const t of tracks) {
      if (t.type === 'cctv') continue;
      if (t.type === 'satellite') {
        const degPerSec = 360 / ((t.period || 95) * 60);
        t.lng = ((t.lng + degPerSec + 540) % 360) - 180;
        t.lat = (t.inclination || 50) * Math.sin(tick / 40);
        continue;
      }
      const kmh = (t.speed || 0) * KTS_TO_KMH;
      const distKm = kmh / 3600;
      const next = movePoint(t.lat, t.lng, t.heading || 90, distKm);
      t.lat = next.lat;
      t.lng = next.lng;
    }
    return tick;
  }

  function randomEvent() {
    const movers = tracks.filter(t => t.type !== 'cctv');
    const t = movers[tick % movers.length];
    const kinds = {
      aircraft: [
        `${t.callsign} cruising FL${Math.round(t.altitude / 100)} @ ${Math.round(t.speed)}kt`,
        `${t.callsign} heading ${Math.round(t.heading)}° — ${t.from}→${t.to}`,
        `ADS-B refreshed: ${t.callsign} (${t.registration})`,
      ],
      ship: [
        `${t.name} SOG ${t.speed.toFixed(1)}kt → ${t.destination}`,
        `AIS report: ${t.name} (MMSI ${t.mmsi})`,
        `${t.name} on course ${Math.round(t.heading)}°`,
      ],
      satellite: [
        `${t.name} ground track ${t.lat.toFixed(1)}, ${t.lng.toFixed(1)}`,
        `TLE propagated: ${t.name} alt ${t.altitude}km`,
        `${t.name} velocity ${t.velocity}km/s`,
      ],
    };
    const msgs = kinds[t.type];
    return {
      ts: new Date().toISOString(),
      level: t.type === 'satellite' ? 'info' : 'track',
      source: t.source, objectId: t.id, type: t.type,
      message: msgs[tick % msgs.length],
    };
  }

  return { tracks, arcs, step, randomEvent, getTick: () => tick };
}
