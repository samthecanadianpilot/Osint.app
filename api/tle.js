// Vercel serverless function — fresh TLE orbital elements from Celestrak for a
// catalog of notable satellites. The client propagates them with satellite.js
// (SGP4) every second for smooth motion. Falls back to embedded TLEs if
// Celestrak is unreachable. Cached for an hour at the CDN.

const CATALOG = [
  { id: 'ST-25544', name: 'ISS (ZARYA)', noradId: 25544 },
  { id: 'ST-20580', name: 'HUBBLE SPACE TELESCOPE', noradId: 20580 },
  { id: 'ST-43013', name: 'NOAA-20', noradId: 43013 },
  { id: 'ST-48274', name: 'TIANGONG (CSS)', noradId: 48274 },
  { id: 'ST-25994', name: 'TERRA', noradId: 25994 },
  { id: 'ST-27424', name: 'AQUA', noradId: 27424 },
];

const FALLBACK = {
  25544: ['1 25544U 98067A   26150.50900463  .00003075  00000-0  59442-4 0  9992', '2 25544  51.6433  59.2583 0008217  16.4489 347.6017 15.51174618173442'],
  20580: ['1 20580U 90037B   26150.12459023  .00000318  00000-0  10423-4 0  9998', '2 20580  28.4687 120.4503 0003487 232.1485 127.8423 15.01194380193481'],
  43013: ['1 43013U 17073A   26150.41908493  .00000045  00000-0  21948-4 0  9995', '2 43013  98.7180 188.1903 0001429  90.4182 269.7194 14.19532847442103'],
  48274: ['1 48274U 21035A   26150.50290192  .00002148  00000-0  34195-4 0  9996', '2 48274  41.4721  88.1402 0001847  55.1942 304.9184 15.62019487291480'],
  25994: ['1 25994U 99068A   26150.49382716  .00000123  00000-0  37894-4 0  9993', '2 25994  98.2098 130.4821 0001312  95.2841 264.8512 14.57108472402183'],
  27424: ['1 27424U 02022A   26150.46291038  .00000148  00000-0  41827-4 0  9990', '2 27424  98.1984 145.9182 0001482  88.4821 271.6529 14.57610284281947'],
};

module.exports = async (req, res) => {
  const satellites = [];
  for (const sat of CATALOG) {
    let tle = FALLBACK[sat.noradId];
    try {
      const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.noradId}&FORMAT=tle`);
      if (r.ok) {
        const text = await r.text();
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length >= 3) tle = [lines[1], lines[2]];
      }
    } catch (e) { /* use fallback */ }
    if (tle) satellites.push({ ...sat, tle1: tle[0], tle2: tle[1] });
  }
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
  res.status(200).json({ satellites, count: satellites.length });
};
