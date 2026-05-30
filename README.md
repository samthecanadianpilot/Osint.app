# OSINT Central

A real-time OSINT tracking dashboard with a live 3D WebGL globe — aircraft
(ADS-B), ships (AIS), satellites (TLE), and CCTV, rendered against a dark
**Apple × Palantir** ops console.

![status](https://img.shields.io/badge/phase-0--5%20complete-34c759) ![stack](https://img.shields.io/badge/react%20%2B%20vite-0a84ff)

## Live demo

Deployed on **Vercel** (client-side simulation — no backend required). Push to
`main` auto-redeploys.

## Repo layout

```
osint-central/
├── web/        # React + Vite frontend (this is what Vercel builds → web/dist)
├── server/     # Node + Express + WebSocket backend (local dev / future real feeds)
└── vercel.json # builds web/, outputs web/dist
```

## Run locally

```bash
# frontend (in-browser simulation, no backend needed)
cd web && npm install && npm run dev        # → http://localhost:5173

# optional: live backend feeding the globe over WebSocket
cd server && npm install && npm run dev      # → http://localhost:4000
# then run the web app pointed at it:
cd web && VITE_WS_URL=ws://localhost:4000/ws npm run dev
```

## Features

- 🌍 Live 3D globe (react-globe.gl) — moving blips, animated route arcs, ripple
  selection rings, auto-rotate, **DAY/NIGHT** texture toggle (NASA Blue Marble /
  Black Marble — both public domain)
- 📋 Tabbed sidebar (Planes / Ships / Sats / CCTV) with live counts
- 📑 Detail panel + live activity feed
- 🎛️ UTC clock, layer filters, LIVE/SIM status

## Deployment

Frontend → **Vercel** (`vercel.json` handles the build). The backend is a
stateful WebSocket server, so for real live feeds (Phase 7) it deploys
separately to Railway / Render / Fly. The deployed demo runs the simulation
in-browser, so Vercel alone is enough.

## Data sources

Mock now; shapes already match **OpenSky** (ADS-B), **AISStream** (AIS), and
**Celestrak** (TLE) for a drop-in swap to real data.
