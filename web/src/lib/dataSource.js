// Single data-source abstraction.
//
// Automatically detects and connects to a running local OSINT backend (ws://localhost:4000/ws)
// when running locally, falling back gracefully to the browser simulation if the backend is offline.
//
//   VITE_WS_URL set  → connect to the explicitly configured backend WebSocket.
//   VITE_WS_URL unset→ auto-connect to local backend first if local, else run simulation.
//
// Both modes drive the exact same store actions.
import { createWorld } from './simulator.js';

const WS_URL = import.meta.env.VITE_WS_URL; // e.g. ws://localhost:4000/ws

export function startDataSource(store) {
  if (WS_URL) {
    return startWebSocket(store, WS_URL);
  }

  // Auto-detect local backend if running in a local browser environment
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal) {
    let simCleanup = null;
    let wsCleanup = null;
    let fallbackTriggered = false;

    const fallbackToSim = () => {
      if (fallbackTriggered) return;
      fallbackTriggered = true;
      console.log('Local OSINT backend not detected at ws://127.0.0.1:4000/ws. Initiating client-side simulation...');
      simCleanup = startSimulation(store);
    };

    try {
      // Connect to 127.0.0.1 directly to avoid loopback resolution delays on macOS
      wsCleanup = startWebSocket(store, 'ws://127.0.0.1:4000/ws', () => {
        fallbackToSim();
      });

      // If connection doesn't succeed or establish within 4.5 seconds, failover
      const timer = setTimeout(() => {
        if (!store.getState().connected) {
          if (wsCleanup) {
            wsCleanup();
            wsCleanup = null;
          }
          fallbackToSim();
        }
      }, 4500);

      return () => {
        clearTimeout(timer);
        if (wsCleanup) wsCleanup();
        if (simCleanup) simCleanup();
      };
    } catch (e) {
      fallbackToSim();
      return () => {
        if (simCleanup) simCleanup();
      };
    }
  }

  // Vercel / Remote production default to zero-server client simulation
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
function startWebSocket(store, url, onFailed) {
  let ws, retry;
  let hasOpened = false;
  let closedCount = 0;

  const connect = () => {
    try {
      ws = new WebSocket(url);
      
      ws.onopen = () => {
        hasOpened = true;
        store.getState().setConnected(true);
      };
      
      ws.onclose = () => {
        store.getState().setConnected(false);
        if (!hasOpened) {
          closedCount++;
          if (closedCount >= 1 && onFailed) {
            onFailed();
            return;
          }
        }
        retry = setTimeout(connect, 2500); // auto-reconnect
      };
      
      ws.onerror = () => {
        if (!hasOpened && onFailed) {
          onFailed();
        }
      };

      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        const s = store.getState();
        if (m.type === 'snapshot') s.setSnapshot({ ...m, mode: 'live' });
        else if (m.type === 'positions') s.applyPositions(m.tracks, m.tick);
        else if (m.type === 'event') s.addEvent(m.event);
      };
    } catch (err) {
      if (onFailed) onFailed();
    }
  };

  connect();
  return () => {
    clearTimeout(retry);
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
    }
  };
}
