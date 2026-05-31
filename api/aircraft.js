// Vercel serverless — real live aircraft from the THREE open ADS-B networks
// (adsb.lol, adsb.fi, airplanes.live). A global grid of 250nm points is spread
// round-robin across the networks: this respects each one's rate limits AND
// maximizes coverage, since different feeder networks see different aircraft.
// Merged by ICAO hex. CDN-cached so upstreams are hit at most once / 20s.
//
// (adsbexchange is intentionally NOT used — its global feed is feeder-only /
// paid and ToS-protected; the networks below are the open-data equivalents.)

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Both networks tolerate parallel bursts and carry the most aircraft (measured);
// adsb.fi is excluded here because it rate-limits parallel bursts. airplanes.live
// is listed first so its (richer) record wins on hex collisions. Querying BOTH
// across the grid maximizes coverage — each network's feeders see different planes.
const NETWORKS = [
  { name: 'airplanes.live', url: (la, lo) => `https://api.airplanes.live/v2/point/${la}/${lo}/250`, key: 'ac' },
  { name: 'adsb.lol',       url: (la, lo) => `https://api.adsb.lol/v2/point/${la}/${lo}/250`,        key: 'ac' },
];

// Major airspace hubs (250nm circles), not a geographic grid — aircraft cluster
// over populated regions, so this captures vastly more than ocean grid points.
const GRID = [
  // North America
  [40.6, -73.8], [33.9, -118.4], [41.9, -87.9], [33.6, -84.4], [32.9, -97.0],
  [25.8, -80.3], [47.4, -122.3], [39.7, -104.9], [43.7, -79.6], [19.4, -99.1],
  // Europe
  [51.5, -0.1], [48.9, 2.4], [50.0, 8.6], [52.3, 4.8], [41.0, 28.8],
  [40.5, -3.6], [41.8, 12.3], [55.8, 37.6], [59.6, 17.9], [47.5, 19.3],
  // Asia / Middle East
  [35.6, 139.8], [39.9, 116.4], [31.2, 121.5], [22.3, 113.9], [13.7, 100.7],
  [1.36, 103.99], [28.6, 77.1], [19.1, 72.9], [25.25, 55.36], [37.5, 127.0],
  // Oceania
  [-33.9, 151.2], [-37.8, 144.9],
  // South America
  [-23.4, -46.5], [4.7, -74.1], [-34.8, -58.5], [-12.0, -77.1],
  // Africa
  [-26.1, 28.2], [30.1, 31.4], [6.6, 3.3], [-1.3, 36.9],
];

module.exports = async (req, res) => {
  const cap = Math.min(parseInt(req.query.cap, 10) || 2000, 5000);
  try {
    // One request per grid point (~36 total — within both networks' burst limit).
    // Primary = airplanes.live (most aircraft); fall back to adsb.lol per-point
    // only if the primary returns nothing for that cell.
    const getPoint = async (net, lat, lng) => {
      try {
        const r = await fetch(net.url(lat, lng), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
        if (!r.ok) return [];
        const j = await r.json();
        return j[net.key] || j.ac || j.aircraft || [];
      } catch (e) { return []; }
    };
    const results = await Promise.all(
      GRID.map(async ([lat, lng]) => {
        let arr = await getPoint(NETWORKS[0], lat, lng);
        if (!arr.length) arr = await getPoint(NETWORKS[1], lat, lng);
        return arr;
      })
    );

    // Cap each hub's contribution so the global budget is spread across all
    // regions (otherwise the first hubs alone fill the cap). ~even worldwide.
    const perHub = Math.ceil((cap / GRID.length) * 1.3);
    const seen = new Map();
    for (const arr of results) {
      let added = 0;
      for (const a of arr) {
        if (added >= perHub) break;
        if (!a || !a.hex || typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
        if (typeof a.alt_baro !== 'number' || a.alt_baro <= 0) continue; // airborne only
        if (!seen.has(a.hex)) { seen.set(a.hex, a); added++; }
      }
    }

    const aircraft = [...seen.values()].slice(0, cap).map(a => ({
      id: `AC-${a.hex}`,
      hex: a.hex,
      cat: a.category || '',
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
