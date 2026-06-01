// Vercel serverless — REAL live ships.
//   • With AISSTREAM_API_KEY → samples AISStream.io's GLOBAL feed for ~7s and
//     returns a worldwide vessel snapshot (CDN-cached so the socket opens at
//     most once per 30s regardless of traffic).
//   • Without a key → Fintraffic open AIS (digitraffic.fi, Baltic only).
const WebSocket = require('ws');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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

// Open AISStream, collect global PositionReports for `ms`, dedupe by MMSI.
function sampleAISStream(apiKey, ms = 7000, cap = 3000) {
  return new Promise(resolve => {
    const found = new Map();
    let ws, timer, done = false;
    const finish = () => {
      if (done) return; done = true;
      clearTimeout(timer);
      try { ws && ws.close(); } catch (_) {}
      resolve([...found.values()]);
    };
    try {
      ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
      ws.on('open', () => {
        ws.send(JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ['PositionReport'],
        }));
      });
      ws.on('message', data => {
        try {
          const m = JSON.parse(data.toString());
          if (m.MessageType !== 'PositionReport') return;
          const md = m.MetaData || {};
          const pr = (m.Message && m.Message.PositionReport) || {};
          const mmsi = md.MMSI;
          const lat = md.latitude ?? pr.Latitude;
          const lng = md.longitude ?? pr.Longitude;
          if (!mmsi || typeof lat !== 'number' || typeof lng !== 'number') return;
          const sog = pr.Sog, cog = typeof pr.Cog === 'number' ? pr.Cog : 0;
          const r = Math.cos((lat * Math.PI) / 180) || 0.5;
          found.set(mmsi, {
            id: `SH-${mmsi}`,
            name: (md.ShipName || '').trim() || `VESSEL-${mmsi}`,
            mmsi: String(mmsi),
            shipType: 'Vessel',
            lat, lng,
            speed: typeof sog === 'number' ? sog : 0,
            heading: cog,
            destination: 'AT SEA',
            route: [[lng, lat], [lng + (Math.sin((cog * Math.PI) / 180) * 3) / r, lat + Math.cos((cog * Math.PI) / 180) * 3]],
            source: 'AIS',
            type: 'ship',
          });
          if (found.size >= cap) finish();
        } catch (_) {}
      });
      ws.on('error', finish);
      timer = setTimeout(finish, ms);
    } catch (e) { finish(); }
  });
}

async function digitraffic() {
  const headers = { 'Accept-Encoding': 'gzip', 'User-Agent': UA };
  const [loc, vessels] = await Promise.all([
    fetch('https://meri.digitraffic.fi/api/ais/v1/locations', { headers }).then(r => r.json()),
    fetch('https://meri.digitraffic.fi/api/ais/v1/vessels', { headers }).then(r => r.json()).catch(() => []),
  ]);
  const meta = new Map();
  for (const v of Array.isArray(vessels) ? vessels : []) meta.set(v.mmsi, v);
  const ships = [];
  const seen = new Set();
  for (const f of loc.features || []) {
    const mmsi = f.mmsi, p = f.properties || {}, coords = f.geometry && f.geometry.coordinates;
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
      id: `SH-${mmsi}`, name: m.name.trim(), mmsi: String(mmsi), shipType: shipTypeLabel(m.shipType),
      lat, lng, speed: sog, heading: cog, draught: m.draught ? +(m.draught / 10).toFixed(1) : 0,
      destination: (m.destination || '').trim() || 'AT SEA',
      route: [[lng, lat], [lng + (Math.sin((cog * Math.PI) / 180) * 3) / r, lat + Math.cos((cog * Math.PI) / 180) * 3]],
      source: 'AIS', type: 'ship',
    });
    if (ships.length >= 400) break;
  }
  return { ships, region: 'Baltic / Gulf of Finland' };
}

module.exports = async (req, res) => {
  const key = process.env.AISSTREAM_API_KEY;
  try {
    if (key) {
      const ships = await sampleAISStream(key);
      if (ships.length) {
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        return res.status(200).json({ ships, count: ships.length, region: 'Global (AISStream)' });
      }
    }
    const { ships, region } = await digitraffic();
    res.setHeader('Cache-Control', ships.length ? 's-maxage=30, stale-while-revalidate=60' : 'no-store');
    res.status(200).json({ ships, count: ships.length, region });
  } catch (e) {
    res.status(200).json({ ships: [], count: 0, error: String(e && e.message) });
  }
};
