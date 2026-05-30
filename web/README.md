# OSINT Central — Web

React + Vite frontend. A live 3D globe (react-globe.gl) tracking aircraft,
ships, satellites, and CCTV against a dark Apple×Palantir ops console.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

## Data source (the key design)

A single abstraction in `src/lib/dataSource.js` decides where data comes from:

- **No env var → in-browser simulation** (`src/lib/simulator.js`). Zero backend.
  This is what ships to **Vercel** (Path B) — fully "live" with no server.
- **`VITE_WS_URL` set → live backend WebSocket** (Path A). For local dev against
  `../server`, or production once real feeds land (Phase 7).

```bash
# connect to the local backend instead of the sim:
VITE_WS_URL=ws://localhost:4000/ws npm run dev
```

Components never know which source is active — the store API is identical.

## Structure

```
src/
├── App.jsx                 # shell: TopBar / Sidebar | Globe | DetailPanel
├── store.js                # zustand: tracks, arcs, feed, selection, filters
├── theme.css               # Apple×Palantir design tokens
├── data/seed.js            # client seed (mirrors server)
├── lib/
│   ├── geo.js              # great-circle movement
│   ├── simulator.js        # in-browser world (Path B)
│   └── dataSource.js       # sim ⇆ WebSocket abstraction
└── components/
    ├── TopBar.jsx          # UTC clock + layer filters + live/sim status
    ├── Sidebar.jsx         # tabbed track list
    ├── GlobeView.jsx       # react-globe.gl: points, arcs, rings, fly-to
    ├── DetailPanel.jsx     # selected object readout
    └── ActivityFeed.jsx    # live event stream
```

## Deploy to Vercel

Root Directory = `web`. Vercel auto-detects Vite → `npm run build` → live.
No env vars needed (defaults to client-side sim).
