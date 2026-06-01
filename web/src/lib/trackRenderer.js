// Custom WebGL track layer — the FlightRadar24 / satellitemap.space technique.
//
// • ONE THREE.Points buffer holds every track; a shader rotates a sprite-atlas
//   icon per-point by heading and tints by type.
// • ONE THREE.LineSegments buffer draws a fading motion TRAIL behind each track
//   — this is what makes the globe read as "alive".
// • A requestAnimationFrame loop dead-reckons each track every frame from its
//   last velocity (resynced when real data arrives) → continuous 60fps motion.
import * as THREE from 'three';
import { buildIconAtlas, iconIndexFor, ATLAS_COLS, ICON } from './iconAtlas.js';

const EARTH_KM = 6371;

const ALT = { satellite: 0.16, aircraft: 0.05, ship: 0.006, cctv: 0.004 };
const altOf = t => ALT[t.type] ?? 0.01;

const TRAIL_LEN = 16;      // history points per track
const TRAIL_DT = 0.5;      // seconds between history samples

const VERT = `
  attribute vec3 aColor;
  attribute float aRot;
  attribute float aType;
  varying vec3 vColor;
  varying float vRot;
  varying float vType;
  uniform float uSize;
  void main() {
    vColor = aColor; vRot = aRot; vType = aType;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(uSize * (320.0 / max(1.0, -mv.z)), 5.0, 26.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  precision mediump float;
  uniform sampler2D uAtlas;
  uniform float uCols;
  varying vec3 vColor;
  varying float vRot;
  varying float vType;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot); float s = sin(vRot);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;
    float ci = mod(vType, uCols);
    float ri = floor(vType / uCols);
    vec2 uv = (vec2(ci, ri) + q) / uCols;
    vec4 tx = texture2D(uAtlas, uv);
    if (tx.a < 0.15) discard;
    gl_FragColor = vec4(vColor * (0.22 + 0.78 * tx.r), tx.a);
  }
`;

export function createTrackRenderer(globe) {
  const scene = globe.scene();
  const atlas = buildIconAtlas();
  const material = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uCols: { value: ATLAS_COLS }, uSize: { value: 17.0 } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthTest: true, depthWrite: false,
  });
  const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: true, depthWrite: false });

  const state = new Map();   // id -> { baseLat, baseLng, vlat, vlng, tBase, alt, idx, hdg, color, hist:[{lat,lng,alt}] }
  let order = [];
  let geom = null, points = null;
  let trailGeom = null, trail = null;
  let needRebuild = false;
  let raf = 0, lastTrail = 0;

  function reconcile(tracks) {
    const now = performance.now() / 1000;
    const seen = new Set();
    for (const t of tracks) {
      if (typeof t.lat !== 'number' || typeof t.lng !== 'number') continue;
      seen.add(t.id);
      let st = state.get(t.id);
      if (!st) {
        st = {
          baseLat: t.lat, baseLng: t.lng, vlat: 0, vlng: 0, tBase: now,
          alt: altOf(t), idx: iconIndexFor(t), hdg: (t.heading || 0),
          color: new THREE.Color(t.color || '#ffffff'), hist: [],
        };
        state.set(t.id, st);
        needRebuild = true;
      } else {
        const moved = t.lat !== st.baseLat || t.lng !== st.baseLng;
        if (moved) {
          const dt = Math.max(0.25, now - st.tBase);
          let dLat = t.lat - st.baseLat;
          let dLng = ((t.lng - st.baseLng + 540) % 360) - 180;
          if (Math.abs(dLat) < 5 && Math.abs(dLng) < 5) { st.vlat = dLat / dt; st.vlng = dLng / dt; }
          else { st.vlat = 0; st.vlng = 0; st.hist.length = 0; } // teleport → reset trail
          st.baseLat = t.lat; st.baseLng = t.lng; st.tBase = now;
        }
        st.alt = altOf(t); st.idx = iconIndexFor(t); st.color.set(t.color || '#ffffff');
        st.hdg = typeof t.heading === 'number' ? t.heading : (Math.atan2(st.vlng, st.vlat) * 180) / Math.PI;
      }
    }
    for (const id of [...state.keys()]) if (!seen.has(id)) { state.delete(id); needRebuild = true; }
    if (needRebuild) rebuild();
  }

  function rebuild() {
    needRebuild = false;
    order = [...state.keys()];
    const n = order.length;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aRot', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aType', new THREE.BufferAttribute(new Float32Array(n), 1));
    const col = g.attributes.aColor.array, typ = g.attributes.aType.array;
    order.forEach((id, i) => {
      const st = state.get(id);
      col[i * 3] = st.color.r; col[i * 3 + 1] = st.color.g; col[i * 3 + 2] = st.color.b;
      typ[i] = st.idx;
    });
    if (geom) geom.dispose();
    geom = g;
    if (points) points.geometry = geom;
    else { points = new THREE.Points(geom, material); points.frustumCulled = false; points.renderOrder = 12; scene.add(points); }

    // trail buffer: (TRAIL_LEN-1) segments × 2 verts per track
    const segs = n * (TRAIL_LEN - 1) * 2;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 3), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(segs * 3), 3));
    if (trailGeom) trailGeom.dispose();
    trailGeom = tg;
    if (trail) trail.geometry = trailGeom;
    else { trail = new THREE.LineSegments(trailGeom, trailMat); trail.frustumCulled = false; trail.renderOrder = 11; scene.add(trail); }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!points || !geom || !order.length) return;
    const now = performance.now() / 1000;
    const pos = geom.attributes.position.array;
    const rot = geom.attributes.aRot.array;
    const sampleTrail = now - lastTrail >= TRAIL_DT;

    for (let i = 0; i < order.length; i++) {
      const st = state.get(order[i]);
      if (!st) continue;
      const dt = now - st.tBase;
      let lat = Math.max(-89.9, Math.min(89.9, st.baseLat + st.vlat * dt));
      let lng = ((st.baseLng + st.vlng * dt + 540) % 360) - 180;
      const c = globe.getCoords(lat, lng, st.alt);
      pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z;
      rot[i] = (st.hdg * Math.PI) / 180;
      if (sampleTrail) {
        st.hist.unshift({ lat, lng, alt: st.alt });
        if (st.hist.length > TRAIL_LEN) st.hist.pop();
      }
    }
    geom.attributes.position.needsUpdate = true;
    geom.attributes.aRot.needsUpdate = true;

    if (sampleTrail && trailGeom) {
      lastTrail = now;
      updateTrails();
    }
  }

  function updateTrails() {
    const tpos = trailGeom.attributes.position.array;
    const tcol = trailGeom.attributes.color.array;
    let v = 0; // vertex index
    const perTrack = (TRAIL_LEN - 1) * 2;
    for (let i = 0; i < order.length; i++) {
      const st = state.get(order[i]);
      const base = i * perTrack * 3;
      let w = base;
      if (st && st.hist.length > 1) {
        for (let h = 0; h < st.hist.length - 1; h++) {
          const fade = 1 - h / TRAIL_LEN;            // newer = brighter
          const a = st.hist[h], b = st.hist[h + 1];
          const ca = globe.getCoords(a.lat, a.lng, a.alt);
          const cb = globe.getCoords(b.lat, b.lng, b.alt);
          tpos[w] = ca.x; tpos[w + 1] = ca.y; tpos[w + 2] = ca.z;
          tcol[w] = st.color.r * fade; tcol[w + 1] = st.color.g * fade; tcol[w + 2] = st.color.b * fade;
          w += 3;
          tpos[w] = cb.x; tpos[w + 1] = cb.y; tpos[w + 2] = cb.z;
          tcol[w] = st.color.r * fade; tcol[w + 1] = st.color.g * fade; tcol[w + 2] = st.color.b * fade;
          w += 3;
        }
      }
      // zero out unused segments for this track (degenerate → invisible)
      const end = base + perTrack * 3;
      while (w < end) { tpos[w] = 0; tcol[w] = 0; w++; }
    }
    trailGeom.attributes.position.needsUpdate = true;
    trailGeom.attributes.color.needsUpdate = true;
  }

  raf = requestAnimationFrame(frame);

  // ── Satellites: full catalog, propagated in a Web Worker, rendered in their
  // own buffer (count too high to route through React/store). ──
  let satWorker = null, satGeom = null, satPoints = null, satCap = 0;
  const satColor = new THREE.Color('#34c759');

  function ensureSatCapacity(n) {
    if (n <= satCap) return;
    satCap = Math.ceil(n * 1.15);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(satCap * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(satCap * 3), 3));
    g.setAttribute('aRot', new THREE.BufferAttribute(new Float32Array(satCap), 1));
    g.setAttribute('aType', new THREE.BufferAttribute(new Float32Array(satCap), 1));
    const col = g.attributes.aColor.array, typ = g.attributes.aType.array;
    for (let i = 0; i < satCap; i++) {
      col[i * 3] = satColor.r; col[i * 3 + 1] = satColor.g; col[i * 3 + 2] = satColor.b;
      typ[i] = ICON.sat;
    }
    if (satGeom) satGeom.dispose();
    satGeom = g;
    if (satPoints) satPoints.geometry = satGeom;
    else { satPoints = new THREE.Points(satGeom, material); satPoints.frustumCulled = false; satPoints.renderOrder = 12; scene.add(satPoints); }
  }

  function onSatPositions(data, count) {
    ensureSatCapacity(count);
    const pos = satGeom.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const lat = data[i * 3], lng = data[i * 3 + 1], altKm = data[i * 3 + 2];
      const c = globe.getCoords(lat, lng, altKm / EARTH_KM);
      pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z;
    }
    satGeom.setDrawRange(0, count);
    satGeom.attributes.position.needsUpdate = true;
  }

  function setSatelliteTLEs(tles) {
    if (!tles || !tles.length) return;
    if (!satWorker) {
      satWorker = new Worker(new URL('./satWorker.js', import.meta.url), { type: 'module' });
      satWorker.onmessage = e => { if (e.data.type === 'pos') onSatPositions(e.data.data, e.data.count); };
    }
    satWorker.postMessage({ type: 'init', tles });
  }

  function pick(ndc, camera) {
    if (!geom || !order.length) return null;
    const ray = new THREE.Raycaster();
    ray.params.Points.threshold = 2.2;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(points, false);
    return hits.length ? (order[hits[0].index] || null) : null;
  }

  return {
    update: tracks => reconcile(tracks),
    setSatelliteTLEs,
    setSatVisible: v => { if (satPoints) satPoints.visible = v; },
    pick,
    dispose() {
      cancelAnimationFrame(raf);
      if (satWorker) satWorker.terminate();
      if (points) { scene.remove(points); points.geometry.dispose(); }
      if (trail) { scene.remove(trail); trail.geometry.dispose(); }
      if (satPoints) { scene.remove(satPoints); satPoints.geometry.dispose(); }
      material.dispose(); trailMat.dispose(); atlas.dispose && atlas.dispose();
    },
  };
}
