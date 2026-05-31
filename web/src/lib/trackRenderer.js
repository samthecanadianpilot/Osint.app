// Custom WebGL track layer — the FlightRadar24 / satellitemap.space technique.
//
// • ONE THREE.Points buffer holds every track (planes, ships, sats).
// • A shader rotates a sprite-atlas icon per-point by heading and tints by type.
// • A requestAnimationFrame loop dead-reckons each point every frame from its
//   last known velocity, so motion is continuous (60fps) instead of 1Hz steps.
//   Real data resyncs the base position + velocity whenever it arrives.
//
// Added directly to react-globe.gl's scene; positions via globe.getCoords().
import * as THREE from 'three';
import { buildIconAtlas, iconIndexFor, ATLAS_COLS } from './iconAtlas.js';

const ALT = { satellite: 0.16, aircraft: 0.05, ship: 0.006, cctv: 0.004 };
const altOf = t => ALT[t.type] ?? 0.01;

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
    // tx.r ~1 in the white silhouette, ~0 in the dark halo → tinted icon w/ dark rim.
    gl_FragColor = vec4(vColor * (0.22 + 0.78 * tx.r), tx.a);
  }
`;

export function createTrackRenderer(globe) {
  const scene = globe.scene();
  const atlas = buildIconAtlas();
  const material = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: atlas }, uCols: { value: ATLAS_COLS }, uSize: { value: 17.0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const state = new Map();   // id -> { baseLat, baseLng, vlat, vlng, tBase, alt, idx, hdg, color }
  let order = [];            // buffer index -> id
  let geom = null;
  let points = null;
  let needRebuild = false;
  let raf = 0;

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
          color: new THREE.Color(t.color || '#ffffff'),
        };
        state.set(t.id, st);
        needRebuild = true;
      } else {
        // Resync velocity only when the truth position actually moved.
        const moved = t.lat !== st.baseLat || t.lng !== st.baseLng;
        if (moved) {
          const dt = Math.max(0.25, now - st.tBase);
          let dLat = t.lat - st.baseLat;
          let dLng = ((t.lng - st.baseLng + 540) % 360) - 180;
          // ignore teleports (feed resync over big distance) for velocity
          if (Math.abs(dLat) < 5 && Math.abs(dLng) < 5) {
            st.vlat = dLat / dt; st.vlng = dLng / dt;
          } else {
            st.vlat = 0; st.vlng = 0;
          }
          st.baseLat = t.lat; st.baseLng = t.lng; st.tBase = now;
        }
        st.alt = altOf(t);
        st.idx = iconIndexFor(t);
        st.color.set(t.color || '#ffffff');
        st.hdg = typeof t.heading === 'number'
          ? t.heading
          : (Math.atan2(st.vlng, st.vlat) * 180) / Math.PI;
      }
    }
    for (const id of [...state.keys()]) {
      if (!seen.has(id)) { state.delete(id); needRebuild = true; }
    }
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
    else {
      points = new THREE.Points(geom, material);
      points.frustumCulled = false;
      points.renderOrder = 12;
      scene.add(points);
    }
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!points || !geom || !order.length) return;
    const now = performance.now() / 1000;
    const pos = geom.attributes.position.array;
    const rot = geom.attributes.aRot.array;
    const col = geom.attributes.aColor.array;
    const typ = geom.attributes.aType.array;
    for (let i = 0; i < order.length; i++) {
      const st = state.get(order[i]);
      if (!st) continue;
      const dt = now - st.tBase;
      let lat = st.baseLat + st.vlat * dt;
      let lng = st.baseLng + st.vlng * dt;
      lat = Math.max(-89.9, Math.min(89.9, lat));
      lng = ((lng + 540) % 360) - 180;
      const c = globe.getCoords(lat, lng, st.alt);
      pos[i * 3] = c.x; pos[i * 3 + 1] = c.y; pos[i * 3 + 2] = c.z;
      rot[i] = (st.hdg * Math.PI) / 180;
      col[i * 3] = st.color.r; col[i * 3 + 1] = st.color.g; col[i * 3 + 2] = st.color.b;
      typ[i] = st.idx;
    }
    geom.attributes.position.needsUpdate = true;
    geom.attributes.aRot.needsUpdate = true;
    geom.attributes.aColor.needsUpdate = true;
    geom.attributes.aType.needsUpdate = true;
  }
  raf = requestAnimationFrame(frame);

  // Pick the track nearest to a click (NDC point), within a screen-space radius.
  function pick(ndc, camera) {
    if (!geom || !order.length) return null;
    const ray = new THREE.Raycaster();
    ray.params.Points.threshold = 2.2;
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(points, false);
    if (!hits.length) return null;
    return order[hits[0].index] || null;
  }

  return {
    update: tracks => reconcile(tracks),
    pick,
    dispose() {
      cancelAnimationFrame(raf);
      if (points) { scene.remove(points); points.geometry.dispose(); }
      material.dispose();
      atlas.dispose && atlas.dispose();
    },
  };
}
