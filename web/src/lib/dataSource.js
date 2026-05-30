// Single data-source abstraction. The rest of the app never knows whether
// data comes from the live backend or the in-browser simulation.
//
//   VITE_WS_URL set  → connect to the backend WebSocket  (Path A / local dev)
//   VITE_WS_URL unset→ run the simulation in the browser  (Path B / Vercel)
//
// Both modes drive the exact same store actions.
import { createWorld } from './simulator.js';

const WS_URL = import.meta.env.VITE_WS_URL; // e.g. ws://localhost:4000/ws

export function startDataSource(store) {
  if (WS_URL) return startWebSocket(store, WS_URL);
  return startSimulation(store);
}

// ── Path B: client-side simulation ──
function startSimulation(store) {
  const world = createWorld();
  store.getState().setSnapshot({
    tracks: world.tracks.map(t => ({ ...t })),
    arcs: world.arcs,
    feed: [{ ts: new Date().toISOString(), level: 'system', source: 'SIM', message: 'Local simulation online — tracking 15 objects' }],
    mode: 'sim',
  });

  const timer = setInterval(() => {
    const tick = world.step();
    store.getState().applyPositions(world.tracks.map(t => ({ ...t })), tick);
    if (tick % 6 === 0) store.getState().addEvent(world.randomEvent());
  }, 1000);

  return () => clearInterval(timer);
}

// ── Path A: live backend WebSocket ──
function startWebSocket(store, url) {
  let ws, retry;
  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => store.getState().setConnected(true);
    ws.onclose = () => {
      store.getState().setConnected(false);
      retry = setTimeout(connect, 2000); // auto-reconnect
    };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      const s = store.getState();
      if (m.type === 'snapshot') s.setSnapshot({ ...m, mode: 'live' });
      else if (m.type === 'positions') s.applyPositions(m.tracks, m.tick);
      else if (m.type === 'event') s.addEvent(m.event);
    };
  };
  connect();
  return () => { clearTimeout(retry); ws && ws.close(); };
}
