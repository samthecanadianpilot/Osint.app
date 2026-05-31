// Vercel serverless — aircraft photo by ICAO hex or registration via the
// Planespotters public API (free, with photographer attribution). JetPhotos
// has no public API and scraping it breaks their ToS; Planespotters is the
// legitimate community-photo source. Cached 24h.

const UA = 'OSINT-Central/1.0 (+https://osint-central.vercel.app)';

module.exports = async (req, res) => {
  const hex = (req.query.hex || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  const reg = (req.query.reg || '').toUpperCase().replace(/[^0-9A-Z-]/g, '');

  const tryFetch = async path => {
    try {
      const r = await fetch(`https://api.planespotters.net/pub/photos/${path}`, {
        headers: { 'User-Agent': UA },
      });
      if (!r.ok) return null;
      const j = await r.json();
      const p = (j.photos || [])[0];
      if (!p) return null;
      return {
        thumb: (p.thumbnail_large || p.thumbnail || {}).src || null,
        link: p.link || null,
        photographer: p.photographer || 'Unknown',
      };
    } catch (e) {
      return null;
    }
  };

  let photo = null;
  if (hex) photo = await tryFetch(`hex/${hex}`);
  if (!photo && reg && reg !== 'N/A') photo = await tryFetch(`reg/${reg}`);

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=172800');
  res.status(200).json({ photo, credit: 'Planespotters.net' });
};
