// OSINT Central — backend entry point.
// Express REST API + WebSocket live feed, backed by the in-memory track store.

import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { store } from './lib/store.js';
import { api } from './routes/api.js';
import { FeedsManager } from './lib/feeds.js';

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', api);

app.get('/', (req, res) =>
  res.json({ service: 'osint-central', docs: '/api/health', ws: '/ws' })
);

const server = http.createServer(app);

// ── WebSocket: stream position batches + activity events ──
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

wss.on('connection', ws => {
  // Send a snapshot so new clients render immediately.
  ws.send(JSON.stringify({
    type: 'snapshot',
    tracks: store.list(),
    arcs: store.arcs(),
    feed: store.feed,
    mode: store.isLive ? 'live' : 'sim'
  }));
});

store.on('positions', moved =>
  broadcast({ type: 'positions', tick: store.tick, tracks: moved })
);
store.on('event', event => broadcast({ type: 'event', event }));

// Enable real-life global tracking feeds by default!
store.enableLiveMode();
const feeds = new FeedsManager(store);
feeds.start();

store.startSimulation(1000);

server.listen(PORT, () => {
  console.log(`OSINT Central backend → http://localhost:${PORT}`);
  console.log(`  REST  http://localhost:${PORT}/api/health`);
  console.log(`  WS    ws://localhost:${PORT}/ws`);
});

const shutdown = () => {
  feeds.stop();
  store.stopSimulation();
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
