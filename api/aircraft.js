// Vercel serverless — real live aircraft.
//   • With OPENSKY_CLIENT_ID/SECRET → OpenSky global /states/all (EVERY airborne
//     aircraft worldwide, ~11k, in one call). OAuth2 token cached in memory.
//   • Otherwise → adsb.lol/airplanes.live hub grid fallback.
// CDN-cached so upstreams are hit at most once per 15s.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Serverless fetch often fails on IPv6 egress ("fetch failed") — force IPv4.
let ipv4 = false;
try {
  const { Agent, setGlobalDispatcher } = require('undici');
  setGlobalDispatcher(new Agent({ connect: { family: 4, timeout: 12000 } }));
  ipv4 = true;
} catch (_) { /* undici unavailable; fall through */ }

// ── OpenSky OAuth2 (token cached across warm invocations) ──
let tokenCache = { token: null, exp: 0 };
let diag = {};
async function openskyToken() {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.exp) { diag.tokenCached = true; return tokenCache.token; }
  diag.hasId = !!process.env.OPENSKY_CLIENT_ID;
  diag.ipv4 = ipv4;
  diag.step = 'token-fetch';
  const t = Date.now();
  const r = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.OPENSKY_CLIENT_ID,
      client_secret: process.env.OPENSKY_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(15000),
  });
  diag.tokenStatus = r.status;
  diag.tokenMs = Date.now() - t;
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json();
  tokenCache = { token: j.access_token, exp: now + (j.expires_in - 120) * 1000 };
  return tokenCache.token;
}

// OpenSky emitter category → our icon hint (A7 heli, A1/A2 light → prop, else jet)
function catHint(c) {
  if (c === 8) return 'A7';
  if (c === 2) return 'A1';
  if (c === 3) return 'A2';
  return '';
}

async function fromOpenSky(cap) {
  const token = await openskyToken();
  diag.step = 'states-fetch';
  const t1 = Date.now();
  const r = await fetch('https://opensky-network.org/api/states/all', {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(25000),
  });
  diag.statesStatus = r.status;
  diag.statesMs = Date.now() - t1;
  if (!r.ok) throw new Error('states ' + r.status);
  const j = await r.json();
  const out = [];
  for (const s of j.states || []) {
    const lng = s[5], lat = s[6];
    if (typeof lat !== 'number' || typeof lng !== 'number' || s[8] === true) continue; // airborne only
    const altM = (typeof s[7] === 'number' ? s[7] : s[13]) || 0;
    const hex = s[0];
    out.push({
      id: `AC-${hex}`,
      hex,
      cat: catHint(s[17]),
      callsign: (s[1] || '').trim() || hex.toUpperCase(),
      registration: 'N/A',
      model: 'N/A',
      lat, lng,
      altitude: altM * 3.28084,                         // m → ft
      speed: typeof s[9] === 'number' ? s[9] * 1.94384 : 0, // m/s → kt
      heading: typeof s[10] === 'number' ? s[10] : 90,
      squawk: s[14] || '0000',
      source: 'ADS-B',
      type: 'aircraft',
    });
    if (out.length >= cap) break;
  }
  return out;
}

// ── adsb hub fallback (keyless) ──
const NETWORKS = [
  { url: (la, lo) => `https://api.airplanes.live/v2/point/${la}/${lo}/250`, key: 'ac' },
  { url: (la, lo) => `https://api.adsb.lol/v2/point/${la}/${lo}/250`, key: 'ac' },
];
const HUBS = [
  // North America (dense — lots of GA + airline traffic)
  [40.6, -73.8], [33.9, -118.4], [41.9, -87.9], [33.6, -84.4], [25.8, -80.3], [19.4, -99.1],
  [47.4, -122.3], [39.7, -104.9], [43.7, -79.6], [29.6, -95.3], [37.6, -122.4], [38.9, -77.0],
  [33.4, -112.0], [44.9, -93.2], [45.5, -73.6],
  // Europe (dense)
  [51.5, -0.1], [48.9, 2.4], [50.0, 8.6], [52.3, 4.8], [41.0, 28.8], [40.5, -3.6],
  [41.8, 12.3], [55.8, 37.6], [59.6, 17.9], [52.5, 13.4], [48.2, 16.4], [47.5, 8.5],
  // Asia / Middle East
  [35.6, 139.8], [31.2, 121.5], [22.3, 113.9], [1.36, 103.99], [28.6, 77.1], [25.25, 55.36],
  [37.5, 127.0], [13.7, 100.7], [3.1, 101.7], [24.9, 67.0], [19.1, 72.9], [39.9, 116.4],
  // Oceania / South America / Africa
  [-33.9, 151.2], [-37.8, 144.9], [-23.4, -46.5], [4.7, -74.1], [-34.8, -58.5],
  [-26.1, 28.2], [30.1, 31.4], [6.6, 3.3],
];
async function fromHubs(cap) {
  const getPoint = async (net, lat, lng) => {
    try {
      const r = await fetch(net.url(lat, lng), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
      if (!r.ok) return [];
      const j = await r.json();
      return j[net.key] || j.ac || j.aircraft || [];
    } catch (e) { return []; }
  };
  const results = await Promise.all(HUBS.map(async ([lat, lng]) => {
    let arr = await getPoint(NETWORKS[0], lat, lng);
    if (!arr.length) arr = await getPoint(NETWORKS[1], lat, lng);
    return arr;
  }));
  const perHub = Math.ceil((cap / HUBS.length) * 1.3);
  const seen = new Map();
  for (const arr of results) {
    let added = 0;
    for (const a of arr) {
      if (added >= perHub) break;
      if (!a || !a.hex || typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
      if (typeof a.alt_baro !== 'number' || a.alt_baro <= 0) continue;
      if (!seen.has(a.hex)) {
        seen.set(a.hex, {
          id: `AC-${a.hex}`, hex: a.hex, cat: a.category || '',
          callsign: (a.flight || '').trim() || a.r || `AC-${a.hex.toUpperCase()}`,
          registration: a.r || 'N/A', model: a.t || 'N/A',
          lat: a.lat, lng: a.lon, altitude: a.alt_baro,
          speed: typeof a.gs === 'number' ? a.gs : 0,
          heading: a.track ?? a.true_heading ?? 90,
          squawk: a.squawk || '0000', source: 'ADS-B', type: 'aircraft',
        });
        added++;
      }
    }
  }
  return [...seen.values()];
}

module.exports = async (req, res) => {
  const cap = Math.min(parseInt(req.query.cap, 10) || 12000, 15000);
  let aircraft = [];
  let source = 'hubs';
  // OpenSky's auth host is unreachable from Vercel's serverless egress (TCP
  // connect timeout), so it's gated behind OPENSKY_ENABLE — set that only on a
  // host that can reach OpenSky (e.g. the Railway backend) to get all ~11k.
  try {
    if (process.env.OPENSKY_ENABLE === '1' && process.env.OPENSKY_CLIENT_ID) {
      try { aircraft = await fromOpenSky(cap); if (aircraft.length > 50) source = 'opensky'; } catch (_) { aircraft = []; }
    }
    if (source !== 'opensky') aircraft = await fromHubs(cap);
    res.setHeader('Cache-Control', aircraft.length ? 's-maxage=15, stale-while-revalidate=30' : 'no-store');
    res.status(200).json({ aircraft, count: aircraft.length, source, ts: Date.now() });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ aircraft: [], count: 0, error: String(e && e.message) });
  }
};
