// In-memory track store + simulation tick.
// Holds the live state of every tracked object and advances it each second.
// This is the single source of truth the REST routes and WebSocket both read.

import { EventEmitter } from 'node:events';
import { aircraft, ships, satellites, cctv, LAYER_COLORS } from '../data/seed.js';
import { movePoint, KTS_TO_KMH } from './geo.js';

const FEED_LIMIT = 60;

class TrackStore extends EventEmitter {
  constructor() {
    super();
    // Tag every object with its layer type + render color, clone so seed stays pristine.
    this.tracks = new Map();
    const load = (arr, type) =>
      arr.forEach(o =>
        this.tracks.set(o.id, { ...o, type, color: LAYER_COLORS[type] })
      );
    load(aircraft, 'aircraft');
    load(ships, 'ship');
    load(satellites, 'satellite');
    load(cctv, 'cctv');

    this.feed = [];
    this.tick = 0;
    this.startedAt = new Date().toISOString();
  }

  list(type) {
    const all = [...this.tracks.values()];
    return type ? all.filter(t => t.type === type) : all;
  }

  get(id) {
    return this.tracks.get(id) || null;
  }

  // Derived arc data for the globe (routes with a start + end point).
  arcs() {
    return this.list()
      .filter(t => Array.isArray(t.route) && t.route.length === 2)
      .map(t => ({
        id: t.id,
        type: t.type,
        color: t.color,
        // seed routes are [lng,lat]; arcs expose explicit start/end lat/lng
        startLat: t.route[0][1], startLng: t.route[0][0],
        endLat: t.route[1][1], endLng: t.route[1][0],
      }));
  }

  pushEvent(evt) {
    const event = { ts: new Date().toISOString(), ...evt };
    this.feed.unshift(event);
    if (this.feed.length > FEED_LIMIT) this.feed.pop();
    this.emit('event', event);
    return event;
  }

  // Advance the world one step (called once per second).
  step(dtSeconds = 1) {
    this.tick++;
    const moved = [];

    for (const t of this.tracks.values()) {
      if (t.type === 'cctv') continue; // CCTV is fixed

      if (t.type === 'satellite') {
        // Satellites sweep eastward; ground-track longitude advances with orbital period.
        const degPerSec = 360 / ((t.period || 95) * 60);
        t.lng = ((t.lng + degPerSec * dtSeconds + 540) % 360) - 180;
        // gentle latitude oscillation bounded by inclination
        const inc = t.inclination || 50;
        t.lat = inc * Math.sin(this.tick / 40);
        moved.push(t);
        continue;
      }

      // Aircraft + ships move along their current heading at their speed (knots).
      const kmh = (t.speed || 0) * KTS_TO_KMH;
      const distKm = (kmh / 3600) * dtSeconds;
      const next = movePoint(t.lat, t.lng, t.heading || 90, distKm);
      t.lat = next.lat;
      t.lng = next.lng;
      moved.push(t);
    }

    // Occasionally emit a synthetic activity-feed event.
    if (this.tick % 6 === 0) this.emitRandomEvent();

    this.emit('positions', moved);
    return moved;
  }

  emitRandomEvent() {
    const samples = this.list().filter(t => t.type !== 'cctv');
    if (!samples.length) return;
    const t = samples[this.tick % samples.length];
    const kinds = {
      aircraft: [
        `${t.callsign} cruising FL${Math.round(t.altitude / 100)} @ ${Math.round(t.speed)}kt`,
        `${t.callsign} heading ${Math.round(t.heading)}° — ${t.from}→${t.to}`,
        `ADS-B contact refreshed: ${t.callsign} (${t.registration})`,
      ],
      ship: [
        `${t.name} SOG ${t.speed.toFixed(1)}kt → ${t.destination}`,
        `AIS position report: ${t.name} (MMSI ${t.mmsi})`,
        `${t.name} on course ${Math.round(t.heading)}°`,
      ],
      satellite: [
        `${t.name} ground track over ${t.lat.toFixed(1)}, ${t.lng.toFixed(1)}`,
        `TLE propagated: ${t.name} alt ${t.altitude}km`,
        `${t.name} velocity ${t.velocity}km/s`,
      ],
    };
    const msgs = kinds[t.type];
    this.pushEvent({
      level: t.type === 'satellite' ? 'info' : 'track',
      source: t.source,
      objectId: t.id,
      type: t.type,
      message: msgs[this.tick % msgs.length],
    });
  }

  startSimulation(intervalMs = 1000) {
    if (this._timer) return;
    this.pushEvent({ level: 'system', source: 'CORE', message: 'Simulation online — tracking 15 objects' });
    this._timer = setInterval(() => this.step(1), intervalMs);
  }

  stopSimulation() {
    clearInterval(this._timer);
    this._timer = null;
  }
}

export const store = new TrackStore();
