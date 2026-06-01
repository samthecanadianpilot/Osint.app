import { create } from 'zustand';

const FEED_LIMIT = 50;

export const useStore = create((set, get) => ({
  tracks: [],
  arcs: [],
  feed: [],
  byId: {},
  selectedId: null,
  tick: 0,
  mode: 'sim',          // 'sim' | 'live'
  connected: false,
  filters: { aircraft: true, ship: true, satellite: true, cctv: true },

  setSnapshot: ({ tracks, arcs, feed, mode }) =>
    set({
      tracks,
      arcs: arcs || [],
      feed: feed || [],
      mode: mode || get().mode,
      connected: mode === 'live',
      byId: Object.fromEntries(tracks.map(t => [t.id, t])),
    }),

  // Merge a batch of moved objects into the current set (keyed by id).
  applyPositions: (moved, tick) =>
    set(state => {
      const byId = { ...state.byId };
      for (const m of moved) byId[m.id] = { ...byId[m.id], ...m };
      return { byId, tracks: Object.values(byId), tick: tick ?? state.tick };
    }),

  addEvent: event =>
    set(state => ({ feed: [event, ...state.feed].slice(0, FEED_LIMIT) })),

  select: id => set({ selectedId: id }),

  toggleFilter: type =>
    set(state => ({ filters: { ...state.filters, [type]: !state.filters[type] } })),

  setConnected: connected => set({ connected }),

  // Replace the full track set (live source owns the authoritative list —
  // this also drops tracks that have aged out, which applyPositions can't).
  setTracks: tracks =>
    set({ tracks, byId: Object.fromEntries(tracks.map(t => [t.id, t])) }),

  setArcs: arcs => set({ arcs }),

  tles: [],
  setTLEs: tles => set({ tles }),
  satCount: 0,
  setSatCount: satCount => set({ satCount }),
}));

if (typeof window !== 'undefined') window.__store = useStore; // debug/inspection handle

// ── selectors ──
export const visibleTracks = s => s.tracks.filter(t => s.filters[t.type]);
export const visibleArcs = s => s.arcs.filter(a => s.filters[a.type]);
export const selectedTrack = s => (s.selectedId ? s.byId[s.selectedId] : null);
