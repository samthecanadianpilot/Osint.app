import * as satellite from 'satellite.js';
import WebSocket from 'ws';

// Major world airports for path & route mapping
const AIRPORTS = [
  { code: 'JFK', lat: 40.6413, lng: -73.7781 },
  { code: 'LHR', lat: 51.4700, lng: -0.4543 },
  { code: 'DXB', lat: 25.2532, lng: 55.3644 },
  { code: 'SIN', lat: 1.3592, lng: 103.9915 },
  { code: 'LAX', lat: 33.9416, lng: -118.4085 },
  { code: 'HND', lat: 35.5494, lng: 139.7798 },
  { code: 'CDG', lat: 49.0097, lng: 2.5479 },
  { code: 'SYD', lat: -33.9399, lng: 151.1772 },
  { code: 'GRU', lat: -23.4356, lng: -46.4731 },
  { code: 'CPT', lat: -33.9715, lng: 18.6017 },
  { code: 'HKG', lat: 22.3080, lng: 113.9185 },
  { code: 'FRA', lat: 50.0379, lng: 8.5622 }
];

// Helper to hash strings to deterministic numbers
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// AIS ship-type code → human label.
function shipTypeLabel(code) {
  if (code >= 60 && code <= 69) return 'Passenger';
  if (code >= 70 && code <= 79) return 'Cargo';
  if (code >= 80 && code <= 89) return 'Tanker';
  if (code === 30) return 'Fishing';
  if (code === 31 || code === 32 || code === 52) return 'Tug';
  if (code === 36) return 'Sailing';
  if (code === 37) return 'Pleasure Craft';
  if (code >= 40 && code <= 49) return 'High-Speed Craft';
  if (code === 50) return 'Pilot';
  if (code === 51) return 'Search & Rescue';
  if (code === 55) return 'Law Enforcement';
  return 'Vessel';
}

// Famous satellites to track via Celestrak TLEs + satellite.js SGP4 propagation
const SATELLITE_CATALOG = [
  { id: 'ST-25544', name: 'ISS (ZARYA)', noradId: 25544 },
  { id: 'ST-20580', name: 'HUBBLE SPACE TELESCOPE', noradId: 20580 },
  { id: 'ST-43013', name: 'NOAA-20', noradId: 43013 },
  { id: 'ST-48274', name: 'TIANGONG (CSS)', noradId: 48274 },
  { id: 'ST-55555', name: 'STARLINK-5683', noradId: 55555 } // Fallback ID if Starlink group is fetched
];

// High-fidelity fallback TLEs for robust offline/no-network operation
const FALLBACK_TLES = {
  25544: [
    '1 25544U 98067A   26150.50900463  .00003075  00000-0  59442-4 0  9992',
    '2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442'
  ],
  20580: [
    '1 20580U 90037B   26150.12459023  .00000318  00000-0  10423-4 0  9998',
    '2 20580  28.4687 120.4503 0003487 232.1485 127.8423 15.01194380193481'
  ],
  43013: [
    '1 43013U 17073A   26150.41908493  .00000045  00000-0  21948-4 0  9995',
    '2 43013  98.7180 188.1903 0001429  90.4182 269.7194 14.19532847442103'
  ],
  48274: [
    '1 48274U 21035A   26150.50290192  .00002148  00000-0  34195-4 0  9996',
    '2 48274  41.4721  88.1402 0001847  55.1942 304.9184 15.62019487291480'
  ],
  55555: [
    '1 55555U 23010A   26150.48910482  .00012450  00000-0  48293-4 0  9994',
    '2 55555  53.0541 210.4529 0001842  88.4528 271.6023 15.09284129182390'
  ]
};

export class FeedsManager {
  constructor(store) {
    this.store = store;
    this.satellites = []; // parsed satrec objects
    this.aisWs = null;
    this.timers = [];
  }

  async start() {
    this.store.pushEvent({ level: 'system', source: 'FEEDS', message: 'Initializing live global tracking feeds...' });

    // 1. Initialize Real-Time Satellite Tracking
    await this.initSatellites();

    // 2. Initialize Real-Time Flight Tracking (OpenSky)
    this.initFlights();

    // 3. Initialize Maritime AIS Stream
    this.initMaritime();

    // 4. Start Satellite Propagation ticks (runs inside Store step)
    this.startSatelliteTicks();
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (this.aisWs) {
      this.aisWs.close();
      this.aisWs = null;
    }
  }

  // ── SATELLITE TLE RETRIEVAL & PROPAGATION ──
  async initSatellites() {
    this.store.pushEvent({ level: 'info', source: 'TLE', message: 'Retrieving fresh TLE orbital parameters from Celestrak...' });

    for (const sat of SATELLITE_CATALOG) {
      let tleLines = FALLBACK_TLES[sat.noradId];

      try {
        // Fetch real-time orbital elements from Celestrak's secure catalog
        const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.noradId}&FORMAT=tle`);
        if (res.ok) {
          const text = await res.text();
          const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length >= 3) {
            tleLines = [lines[1], lines[2]];
            this.store.pushEvent({ level: 'info', source: 'TLE', message: `Successfully loaded orbit details for ${sat.name}` });
          }
        }
      } catch (err) {
        console.error(`Celestrak TLE fetch error for ${sat.noradId}:`, err.message);
      }

      try {
        const satrec = satellite.twoline2satrec(tleLines[0], tleLines[1]);
        this.satellites.push({
          id: sat.id,
          name: sat.name,
          noradId: sat.noradId,
          satrec
        });
      } catch (err) {
        console.error(`twoline2satrec conversion error for ${sat.name}:`, err.message);
      }
    }
  }

  startSatelliteTicks() {
    // We update satellite tracks every tick on our server using SGP4
    const propTimer = setInterval(() => {
      const now = new Date();
      const updatedSats = [];

      for (const sat of this.satellites) {
        try {
          const positionAndVelocity = satellite.propagate(sat.satrec, now);
          const positionEci = positionAndVelocity.position;
          
          if (positionEci) {
            const gmst = satellite.gstime(now);
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);
            
            let lng = satellite.degreesLong(positionGd.longitude);
            let lat = satellite.degreesLat(positionGd.latitude);
            const altKm = Math.round(positionGd.height); // altitude in km
            
            // Normalize longitude
            lng = ((lng + 180) % 360) - 180;

            // Calculate instantaneous velocity magnitude in km/s
            const vel = positionAndVelocity.velocity;
            const velocityKms = vel ? Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z).toFixed(2) : '7.66';

            const updatedTrack = {
              id: sat.id,
              name: sat.name,
              noradId: sat.noradId,
              lat,
              lng,
              altitude: altKm,
              velocity: parseFloat(velocityKms),
              inclination: (satellite.radiansToDegrees(sat.satrec.inclo)).toFixed(1),
              period: (2 * Math.PI / sat.satrec.no).toFixed(1),
              source: 'TLE',
              type: 'satellite'
            };

            updatedSats.push(updatedTrack);
          }
        } catch (err) {
          console.error(`Propagation exception for satellite ${sat.name}:`, err);
        }
      }

      if (updatedSats.length > 0) {
        this.store.updateTracks(updatedSats);
      }
    }, 1000);

    this.timers.push(propTimer);
  }

  // ── FLIGHT TRACKING (adsb.lol community ADS-B network) ──
  // Keyless and reliable, unlike OpenSky's rate-limited anonymous tier. We
  // query several global hubs (250nm each) and merge for worldwide coverage.
  initFlights() {
    const fetchFlights = async () => {
      try {
        this.store.pushEvent({ level: 'info', source: 'ADS-B', message: 'Scanning ADS-B transponders across global hubs...' });

        const results = await Promise.all(
          AIRPORTS.map(a =>
            fetch(`https://api.adsb.lol/v2/point/${a.lat}/${a.lng}/250`, {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
              },
            })
              .then(r => (r.ok ? r.json() : { ac: [] }))
              .catch(() => ({ ac: [] }))
          )
        );

        // Merge unique airborne aircraft by ICAO hex.
        const seen = new Map();
        for (const res of results) {
          for (const a of res.ac || []) {
            if (!a.hex || typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
            if (typeof a.alt_baro !== 'number' || a.alt_baro <= 0) continue; // airborne only
            if (!seen.has(a.hex)) seen.set(a.hex, a);
          }
        }

        const list = [...seen.values()].slice(0, 70);
        if (list.length === 0) return;

        const mappedAircraft = list.map(a => {
          const lat = a.lat, lng = a.lon;
          const callsign = (a.flight || '').trim() || a.r || `AC-${a.hex.toUpperCase()}`;

          // Closest hub = 'from'; deterministic hub = 'to' (for the route arc).
          let closestAir = AIRPORTS[0], minDist = Infinity;
          for (const air of AIRPORTS) {
            const d = (air.lat - lat) ** 2 + (air.lng - lng) ** 2;
            if (d < minDist) { minDist = d; closestAir = air; }
          }
          const destIdx = Math.abs(hashString(a.hex)) % AIRPORTS.length;
          let destAir = AIRPORTS[destIdx];
          if (destAir.code === closestAir.code) destAir = AIRPORTS[(destIdx + 1) % AIRPORTS.length];

          return {
            id: `AC-${a.hex}`,
            callsign,
            cat: a.category || '',
            registration: a.r || 'N/A',
            model: a.t || 'N/A',
            from: closestAir.code,
            to: destAir.code,
            route: [[closestAir.lng, closestAir.lat], [destAir.lng, destAir.lat]],
            lat, lng,
            altitude: a.alt_baro,                       // feet
            speed: typeof a.gs === 'number' ? a.gs : 0, // knots
            heading: a.track ?? a.true_heading ?? 90,
            squawk: a.squawk || '0000',
            source: 'ADS-B',
            type: 'aircraft',
          };
        });

        this.store.updateTracks(mappedAircraft);
        this.store.pushEvent({ level: 'track', source: 'ADS-B', message: `Refreshed flight vectors: ${mappedAircraft.length} live aircraft tracked.` });
      } catch (err) {
        console.error('ADS-B fetch error:', err.message);
        this.store.pushEvent({ level: 'alert', source: 'ADS-B', message: 'Flight feed error; will retry.' });
      }
    };

    // Smooth great-circle motion (store.step) fills the gaps between polls.
    fetchFlights();
    const flightTimer = setInterval(fetchFlights, 20000);
    this.timers.push(flightTimer);
  }

  // ── MARITIME AIS ──
  // Keyless real AIS via Fintraffic (digitraffic.fi, Baltic / Gulf of Finland)
  // by default; global AISStream.io if an API key is provided.
  initMaritime() {
    // Drop the seed/mock ships so only real vessels are shown.
    for (const [id, t] of this.store.tracks.entries()) {
      if (t.type === 'ship') this.store.tracks.delete(id);
    }

    const apiKey = process.env.AISSTREAM_API_KEY;
    if (apiKey) {
      this.initAISStream(apiKey);
    } else {
      this.initDigitraffic();
    }
  }

  // Keyless real AIS — Fintraffic open data.
  initDigitraffic() {
    this.store.pushEvent({ level: 'info', source: 'AIS', message: 'Connecting to Fintraffic open AIS (digitraffic.fi)…' });

    const fetchAIS = async () => {
      try {
        const headers = { 'Accept-Encoding': 'gzip', 'User-Agent': BROWSER_UA };
        const [loc, vessels] = await Promise.all([
          fetch('https://meri.digitraffic.fi/api/ais/v1/locations', { headers }).then(r => r.json()),
          fetch('https://meri.digitraffic.fi/api/ais/v1/vessels', { headers }).then(r => r.json()).catch(() => []),
        ]);

        const meta = new Map();
        for (const v of Array.isArray(vessels) ? vessels : []) meta.set(v.mmsi, v);

        const ships = [];
        const seen = new Set();
        for (const f of loc.features || []) {
          const mmsi = f.mmsi;
          const p = f.properties || {};
          const coords = f.geometry && f.geometry.coordinates;
          if (!coords || seen.has(mmsi)) continue;
          const sog = p.sog;
          if (typeof sog !== 'number' || sog <= 1 || sog > 60) continue;
          const m = meta.get(mmsi);
          if (!m || !m.name || !m.name.trim()) continue;
          seen.add(mmsi);
          const [lng, lat] = coords;
          const cog = typeof p.cog === 'number' ? p.cog : 90;
          const r = Math.cos((lat * Math.PI) / 180) || 0.5;
          ships.push({
            id: `SH-${mmsi}`, name: m.name.trim(), mmsi: String(mmsi),
            shipType: shipTypeLabel(m.shipType), lat, lng,
            speed: sog, heading: cog,
            draught: m.draught ? +(m.draught / 10).toFixed(1) : 0,
            destination: (m.destination || '').trim() || 'AT SEA',
            route: [[lng, lat], [lng + (Math.sin((cog * Math.PI) / 180) * 3) / r, lat + Math.cos((cog * Math.PI) / 180) * 3]],
            source: 'AIS', type: 'ship',
          });
          if (ships.length >= 45) break;
        }

        if (ships.length) {
          const activeIds = new Set(ships.map(s => s.id));
          for (const [id, t] of this.store.tracks.entries()) {
            if (t.type === 'ship' && !activeIds.has(id)) this.store.tracks.delete(id);
          }
          this.store.updateTracks(ships);
          this.store.pushEvent({ level: 'track', source: 'AIS', message: `Maritime update: ${ships.length} live vessels (Baltic/Gulf of Finland).` });
        }
      } catch (err) {
        console.error('digitraffic AIS error:', err.message);
      }
    };

    fetchAIS();
    const t = setInterval(fetchAIS, 30000);
    this.timers.push(t);
  }

  // Global AIS via AISStream.io (requires AISSTREAM_API_KEY).
  initAISStream(apiKey) {
    this.store.pushEvent({
      level: 'info',
      source: 'AIS',
      message: 'Connecting to live global ship transponder feed via AISStream.io...'
    });

    const connectAIS = () => {
      this.aisWs = new WebSocket('wss://stream.aisstream.io/v0/stream');

      this.aisWs.on('open', () => {
        this.store.pushEvent({ level: 'info', source: 'AIS', message: 'AISStream connection established. Subscribing to global ships...' });
        
        // Subscribe to global bounding box encompassing key sea corridors
        const subscriptionPayload = {
          APIKey: apiKey,
          BoundingBoxes: [
            [[-90, -180], [90, 180]] // Global bounding box
          ]
        };
        this.aisWs.send(JSON.stringify(subscriptionPayload));
      });

      this.aisWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          
          if (msg.MessageType === 'PositionReport') {
            const report = msg.Message.PositionReport;
            const meta = msg.MetaData;
            
            const id = `SH-${meta.MMSI}`;
            const name = meta.ShipName.trim() || `VESSEL-${meta.MMSI}`;
            const speed = report.Sog; // Speed Over Ground in knots
            const heading = report.Cog; // Course Over Ground
            const lat = report.Latitude;
            const lng = report.Longitude;

            if (!lat || !lng) return;

            const existing = this.store.get(id);

            // Keep route coordinates matching beautiful shipping lanes
            const route = existing?.route || [
              [lng - Math.cos((heading || 0) * Math.PI / 180) * 4, lat - Math.sin((heading || 0) * Math.PI / 180) * 4],
              [lng + Math.cos((heading || 0) * Math.PI / 180) * 12, lat + Math.sin((heading || 0) * Math.PI / 180) * 12]
            ];

            const shipTrack = {
              id,
              name,
              mmsi: String(meta.MMSI),
              shipType: existing?.shipType || 'Cargo Vessel',
              route,
              lat,
              lng,
              speed: speed || 12,
              heading: heading || 90,
              draught: existing?.draught || 8.5,
              destination: existing?.destination || 'PORT ZONE',
              source: 'AIS',
              type: 'ship'
            };

            this.store.updateTrack(shipTrack);
            
            // Randomly push interesting vessel logs to feed to avoid spamming
            if (Math.random() < 0.05) {
              this.store.pushEvent({
                level: 'track',
                source: 'AIS',
                objectId: id,
                type: 'ship',
                message: `${name} SOG ${speed.toFixed(1)}kt heading ${Math.round(heading)}°`
              });
            }
          }
        } catch (err) {
          console.error('AIS stream message parsing error:', err);
        }
      });

      this.aisWs.on('close', () => {
        this.store.pushEvent({ level: 'alert', source: 'AIS', message: 'AISStream connection closed. Reconnecting...' });
        setTimeout(connectAIS, 5000);
      });

      this.aisWs.on('error', (err) => {
        console.error('AIS WebSocket error:', err.message);
      });
    };

    connectAIS();
  }
}
