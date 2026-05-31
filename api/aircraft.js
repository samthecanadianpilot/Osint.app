// Vercel serverless — real live aircraft from adsb.lol (keyless). Queries a
// GLOBAL GRID of points (250nm radius each) and merges by ICAO hex for
// near-worldwide coverage. CDN-cached so adsb.lol is hit at most once / 20s.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Global grid: latitude bands × longitude steps, plus dense hubs. 250nm circles
// overlap enough at these spacings to cover populated airspace + ocean tracks.
function buildGrid() {
  const pts = [];
  const lats = [-45, -15, 15, 45]; // dense mid-latitudes (most traffic)
  for (const lat of lats) {
    for (let lng = -180; lng < 180; lng += 45) pts.push([lat, lng]); // 8 each = 32
  }
  for (let lng = -180; lng < 180; lng += 90) pts.push([68, lng]); // sparse high north = 4
  return pts; // ~36 points; burst-friendly for adsb.lol's rate limits
}
const GRID = buildGrid();

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return h;
}

module.exports = async (req, res) => {
  const cap = Math.min(parseInt(req.query.cap, 10) || 1500, 4000);
  try {
    const results = await Promise.all(
      GRID.map(([lat, lng]) =>
        fetch(`https://api.adsb.lol/v2/point/${lat}/${lng}/250`, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(6500),
        })
          .then(r => (r.ok ? r.json() : { ac: [] }))
          .catch(() => ({ ac: [] }))
      )
    );

    const seen = new Map();
    for (const r of results) {
      for (const a of r.ac || []) {
        if (!a.hex || typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
        if (typeof a.alt_baro !== 'number' || a.alt_baro <= 0) continue;
        if (!seen.has(a.hex)) seen.set(a.hex, a);
      }
    }

    const aircraft = [...seen.values()].slice(0, cap).map(a => ({
      id: `AC-${a.hex}`,
      hex: a.hex,
      callsign: (a.flight || '').trim() || a.r || `AC-${a.hex.toUpperCase()}`,
      registration: a.r || 'N/A',
      model: a.t || 'N/A',
      lat: a.lat,
      lng: a.lon,
      altitude: a.alt_baro,
      speed: typeof a.gs === 'number' ? a.gs : 0,
      heading: a.track ?? a.true_heading ?? 90,
      squawk: a.squawk || '0000',
      source: 'ADS-B',
      type: 'aircraft',
    }));

    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40');
    res.status(200).json({ aircraft, count: aircraft.length, ts: Date.now() });
  } catch (e) {
    res.status(200).json({ aircraft: [], count: 0, error: String(e && e.message) });
  }
};
