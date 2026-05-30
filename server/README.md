# OSINT Central — Backend

Express REST API + WebSocket live feed, backed by an in-memory track store that
simulates aircraft (ADS-B), ships (AIS), and satellites (TLE) moving across the
globe in real time. CCTV cameras are fixed surface points.

## Run

```bash
npm install
npm run dev      # node --watch, restarts on change
# or
npm start
```

Server: `http://localhost:4000` (override with `PORT`).

## REST API

| Method | Path                       | Description                                  |
|--------|----------------------------|----------------------------------------------|
| GET    | `/api/health`              | Status + per-layer counts + current tick     |
| GET    | `/api/tracks`              | All tracks (`?type=aircraft\|ship\|satellite\|cctv`) |
| GET    | `/api/tracks/:id`          | Single track by id                           |
| GET    | `/api/aircraft`            | Aircraft layer                               |
| GET    | `/api/ships`               | Ship layer                                   |
| GET    | `/api/satellites`          | Satellite layer                              |
| GET    | `/api/cctvs`               | CCTV layer                                   |
| GET    | `/api/arcs`                | Derived route arcs for the globe             |
| GET    | `/api/feed?limit=25`       | Recent activity-feed events                  |

## WebSocket `ws://localhost:4000/ws`

On connect you receive one `snapshot`, then a stream:

```jsonc
{ "type": "snapshot", "tracks": [...], "arcs": [...], "feed": [...] }
{ "type": "positions", "tick": 41, "tracks": [/* moved objects */] }  // ~1/sec
{ "type": "event", "event": { "ts": "...", "level": "track", "message": "..." } }
```

## Data model

Every track shares a common shape — `id`, `type`, `lat`, `lng`, `source`, `color`
— plus layer-specific fields (callsign/registration, mmsi/destination, noradId/
altitude). The shape matches what real feeds (OpenSky, AISStream, Celestrak TLE)
will return in Phase 7, so swapping mock → live won't change the API.

## Structure

```
src/
├── index.js          # express + ws bootstrap
├── routes/api.js     # REST endpoints
├── lib/
│   ├── store.js      # in-memory tracks + 1Hz simulation tick
│   └── geo.js        # great-circle movement helpers
└── data/seed.js      # mock aircraft / ships / satellites / cctv
```
