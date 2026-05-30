// REST API surface for OSINT Central.
import { Router } from 'express';
import { store } from '../lib/store.js';

export const api = Router();

const VALID = new Set(['aircraft', 'ship', 'satellite', 'cctv']);

api.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'osint-central',
    startedAt: store.startedAt,
    tick: store.tick,
    counts: {
      aircraft: store.list('aircraft').length,
      ship: store.list('ship').length,
      satellite: store.list('satellite').length,
      cctv: store.list('cctv').length,
    },
  });
});

// All tracks, optional ?type=aircraft|ship|satellite|cctv
api.get('/tracks', (req, res) => {
  const { type } = req.query;
  if (type && !VALID.has(type)) {
    return res.status(400).json({ error: `invalid type "${type}"` });
  }
  res.json({ tick: store.tick, count: store.list(type).length, tracks: store.list(type) });
});

// Single track by id
api.get('/tracks/:id', (req, res) => {
  const t = store.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

// Convenience per-layer endpoints
for (const type of VALID) {
  api.get(`/${type === 'aircraft' ? 'aircraft' : type + 's'}`, (req, res) =>
    res.json(store.list(type))
  );
}

// Derived arc data for the globe
api.get('/arcs', (req, res) => res.json(store.arcs()));

// Recent activity-feed events
api.get('/feed', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 60);
  res.json(store.feed.slice(0, limit));
});

export default api;
