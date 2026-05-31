// Vercel serverless — TLEs from Celestrak's FULL active catalog (~15,500
// satellites). Sampled evenly down to `cap` so the browser can propagate them
// all with satellite.js (SGP4) every second without melting. Cached 1h.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const FALLBACK = [
  { id: 'ST-25544', name: 'ISS (ZARYA)', noradId: 25544, tle1: '1 25544U 98067A   26151.48489022  .00011339  00000+0  20972-3 0  9991', tle2: '2 25544  51.6337  22.7846 0007232 117.9598 242.2123 15.49521498569161' },
];

module.exports = async (req, res) => {
  const cap = Math.min(parseInt(req.query.cap, 10) || 1800, 5000);
  let satellites = [];
  try {
    const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', {
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': UA },
    });
    const text = await r.text();
    const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length > 0);

    const parsed = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const name = lines[i].trim();
      const l1 = lines[i + 1];
      const l2 = lines[i + 2];
      if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) { i -= 2; continue; } // resync if misaligned
      const norad = parseInt(l1.slice(2, 7), 10);
      parsed.push({ id: `ST-${norad}`, name, noradId: norad, tle1: l1.trim(), tle2: l2.trim() });
    }

    if (parsed.length > cap) {
      const step = parsed.length / cap;
      const out = [];
      for (let i = 0; i < cap; i++) out.push(parsed[Math.floor(i * step)]);
      satellites = out;
    } else {
      satellites = parsed;
    }
  } catch (e) {
    satellites = FALLBACK;
  }
  if (!satellites.length) satellites = FALLBACK;

  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  res.status(200).json({ satellites, count: satellites.length });
};
