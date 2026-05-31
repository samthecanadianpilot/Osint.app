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
    this.isLive = false;
  }

  enableLiveMode() {
    this.isLive = true;
    // Clear initial mock/simulated aircraft and satellites so live data flows cleanly
    for (const [id, t] of this.tracks.entries()) {
      if (t.type === 'aircraft' || t.type === 'satellite') {
        this.tracks.delete(id);
      }
    }
  }

  updateTrack(track) {
    const existing = this.tracks.get(track.id);
    this.tracks.set(track.id, {
      ...existing,
      ...track,
      color: LAYER_COLORS[track.type] || track.color
    });
  }

  updateTracks(tracksList) {
    if (tracksList.length === 0) return;
    
    // Purge old live aircraft that aren't in the active OpenSky set
    const isFlightUpdate = tracksList[0].type === 'aircraft';
    if (isFlightUpdate) {
      const activeIds = new Set(tracksList.map(t => t.id));
      for (const [id, t] of this.tracks.entries()) {
        if (t.type === 'aircraft' && t.source === 'ADS-B' && !activeIds.has(id)) {
          this.tracks.delete(id);
        }
      }
    }

    for (const t of tracksList) {
      this.updateTrack(t);
    }
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
        if (this.isLive) {
          // Real satellites are propagated dynamically in real-time in feeds.js
          moved.push(t);
          continue;
        }
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
    
    // Ensure all formats are perfectly safe against missing real-life transponder metrics
    const alt = t.altitude || 0;
    const spd = t.speed || 0;
    const hdg = t.heading || 0;
    const vel = t.velocity || 7.6;
    
    const kinds = {
      aircraft: [
        `${t.callsign || 'Flight'} cruising FL${Math.round(alt / 100)} @ ${Math.round(spd)}kt`,
        `${t.callsign || 'Flight'} heading ${Math.round(hdg)}° — ${t.from || 'N/A'}→${t.to || 'N/A'}`,
        `ADS-B contact refreshed: ${t.callsign || 'Flight'} (${t.registration || 'N/A'})`,
      ],
      ship: [
        `${t.name || 'Vessel'} SOG ${parseFloat(spd).toFixed(1)}kt → ${t.destination || 'PORT'}`,
        `AIS position report: ${t.name || 'Vessel'} (MMSI ${t.mmsi || 'N/A'})`,
        `${t.name || 'Vessel'} on course ${Math.round(hdg)}°`,
      ],
      satellite: [
        `${t.name || 'Satellite'} ground track over ${(t.lat || 0).toFixed(1)}, ${(t.lng || 0).toFixed(1)}`,
        `TLE propagated: ${t.name || 'Satellite'} alt ${alt}km`,
        `${t.name || 'Satellite'} velocity ${vel}km/s`,
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
