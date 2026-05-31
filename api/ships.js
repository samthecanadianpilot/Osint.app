// Vercel serverless function — REAL live ships from Fintraffic's open AIS
// (digitraffic.fi, keyless). Coverage is the Baltic Sea / Gulf of Finland.
// Joins live positions with vessel metadata (names, types) by MMSI.

const UA =
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

module.exports = async (req, res) => {
  try {
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
      const mmsi = f.mmsi;
      const p = f.properties || {};
      const coords = f.geometry && f.geometry.coordinates;
      if (!coords || seen.has(mmsi)) continue;
      const sog = p.sog;
      if (typeof sog !== 'number' || sog <= 1 || sog > 60) continue; // moving + valid only

      const m = meta.get(mmsi);
      if (!m || !m.name || !m.name.trim()) continue; // named vessels only
      seen.add(mmsi);

      const [lng, lat] = coords;
      const cog = typeof p.cog === 'number' ? p.cog : 90;
      const r = (Math.cos((lat * Math.PI) / 180) || 0.5);
      ships.push({
        id: `SH-${mmsi}`,
        name: m.name.trim(),
        mmsi: String(mmsi),
        shipType: shipTypeLabel(m.shipType),
        lat, lng,
        speed: sog,
        heading: cog,
        draught: m.draught ? +(m.draught / 10).toFixed(1) : 0,
        destination: (m.destination || '').trim() || 'AT SEA',
        // short forward arc along course, for the globe trail
        route: [
          [lng, lat],
          [lng + (Math.sin((cog * Math.PI) / 180) * 3) / r, lat + Math.cos((cog * Math.PI) / 180) * 3],
        ],
        source: 'AIS',
        type: 'ship',
      });
      if (ships.length >= 400) break;
    }

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ ships, count: ships.length, region: 'Baltic / Gulf of Finland', ts: Date.now() });
  } catch (e) {
    res.status(200).json({ ships: [], count: 0, error: String(e && e.message) });
  }
};
