// Runtime-generated sprite atlas of white, nose-up vehicle silhouettes.
// One texture, drawn on a canvas; the shader tints per-track and rotates by
// heading — the same technique tar1090 / FlightRadar24 use for typed icons.
import * as THREE from 'three';

const CELL = 64;
const COLS = 4;            // 4×4 grid → 256×256
const SIZE = CELL * COLS;

export const ATLAS_COLS = COLS;
export const ICON = { jet: 0, prop: 1, heli: 2, sat: 3, ship: 4, ground: 5, dot: 6 };

// Map a track → atlas cell. Aircraft refine by ADS-B emitter category if present.
export function iconIndexFor(t) {
  if (t.type === 'satellite') return ICON.sat;
  if (t.type === 'ship') return ICON.ship;
  if (t.type === 'cctv') return ICON.ground;
  if (t.type === 'aircraft') {
    const c = (t.cat || '').toUpperCase();
    if (c === 'A7') return ICON.heli;        // rotorcraft
    if (c === 'A1' || c === 'A2') return ICON.prop; // light / small
    return ICON.jet;
  }
  return ICON.dot;
}

export function buildIconAtlas() {
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Dark halo around every glyph → separates icons from bright city lights.
  g.shadowColor = 'rgba(0,0,0,0.95)';
  g.shadowBlur = 3;

  const at = (i, draw) => {
    const cx = (i % COLS) * CELL + CELL / 2;
    const cy = Math.floor(i / COLS) * CELL + CELL / 2;
    g.save();
    g.translate(cx, cy);
    draw();
    g.restore();
  };
  const R = CELL * 0.4;

  // 0 — airliner (swept wings, nose up)
  at(ICON.jet, () => {
    g.beginPath();
    g.moveTo(0, -R);              // nose
    g.lineTo(2.5, -R * 0.35);
    g.lineTo(R, R * 0.12);        // right wing
    g.lineTo(2.5, R * 0.32);
    g.lineTo(3.5, R * 0.62);
    g.lineTo(R * 0.42, R * 0.92); // right tailplane
    g.lineTo(0, R * 0.68);
    g.lineTo(-R * 0.42, R * 0.92);
    g.lineTo(-3.5, R * 0.62);
    g.lineTo(-2.5, R * 0.32);
    g.lineTo(-R, R * 0.12);       // left wing
    g.lineTo(-2.5, -R * 0.35);
    g.closePath();
    g.fill();
  });

  // 1 — light prop (straight wings)
  at(ICON.prop, () => {
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, -R * 0.9); g.lineTo(0, R * 0.8); g.stroke();   // fuselage
    g.beginPath(); g.moveTo(-R * 0.9, -R * 0.1); g.lineTo(R * 0.9, -R * 0.1); g.stroke(); // wing
    g.beginPath(); g.moveTo(-R * 0.4, R * 0.7); g.lineTo(R * 0.4, R * 0.7); g.stroke();   // tail
  });

  // 2 — helicopter (rotor X + body)
  at(ICON.heli, () => {
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(-R, -R); g.lineTo(R, R); g.stroke();
    g.beginPath(); g.moveTo(-R, R); g.lineTo(R, -R); g.stroke();
    g.beginPath(); g.ellipse(0, 0, R * 0.28, R * 0.5, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(0, R * 0.3); g.lineTo(0, R * 1.0); g.stroke(); // tail boom
  });

  // 3 — satellite (body + 2 solar panels)
  at(ICON.sat, () => {
    g.fillRect(-R * 0.22, -R * 0.4, R * 0.44, R * 0.8);       // body
    g.fillRect(-R * 0.95, -R * 0.28, R * 0.55, R * 0.56);     // left panel
    g.fillRect(R * 0.4, -R * 0.28, R * 0.55, R * 0.56);       // right panel
  });

  // 4 — ship (elongated hull, bow up)
  at(ICON.ship, () => {
    g.beginPath();
    g.moveTo(0, -R);                 // bow
    g.lineTo(R * 0.42, -R * 0.2);
    g.lineTo(R * 0.42, R * 0.75);
    g.lineTo(-R * 0.42, R * 0.75);
    g.lineTo(-R * 0.42, -R * 0.2);
    g.closePath();
    g.fill();
  });

  // 5 — ground vehicle / cctv (rounded square)
  at(ICON.ground, () => {
    g.beginPath();
    const s = R * 0.62;
    g.rect(-s, -s, s * 2, s * 2);
    g.fill();
  });

  // 6 — generic dot
  at(ICON.dot, () => {
    g.beginPath(); g.arc(0, 0, R * 0.55, 0, Math.PI * 2); g.fill();
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
