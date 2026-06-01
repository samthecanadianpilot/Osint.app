// Web Worker: propagates the FULL satellite catalog (SGP4) off the main thread,
// the satellitemap.space technique. Posts lat/lng/alt as a transferable
// Float32Array a few times a second; the main thread just converts to XYZ.
import * as satellite from 'satellite.js';

let recs = [];
let loop = null;

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') {
    recs = [];
    for (const t of m.tles) {
      try {
        const r = satellite.twoline2satrec(t.tle1, t.tle2);
        if (r && r.error === 0) recs.push(r);
      } catch (_) { /* skip bad TLE */ }
    }
    if (loop) clearTimeout(loop);
    tick();
  }
};

function tick() {
  const t0 = performance.now();
  const now = new Date();
  const gmst = satellite.gstime(now);
  const n = recs.length;
  const out = new Float32Array(n * 3);
  let k = 0;
  for (let i = 0; i < n; i++) {
    try {
      const pv = satellite.propagate(recs[i], now);
      const p = pv.position;
      if (!p) continue;
      const gd = satellite.eciToGeodetic(p, gmst);
      const lat = satellite.degreesLat(gd.latitude);
      let lng = satellite.degreesLong(gd.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      out[k * 3] = lat;
      out[k * 3 + 1] = lng;
      out[k * 3 + 2] = gd.height; // km
      k++;
    } catch (_) { /* skip */ }
  }
  self.postMessage({ type: 'pos', count: k, data: out }, [out.buffer]);
  // self-schedule, never overlapping; target ~3.3Hz but adapt to load
  const elapsed = performance.now() - t0;
  loop = setTimeout(tick, Math.max(60, 300 - elapsed));
}
