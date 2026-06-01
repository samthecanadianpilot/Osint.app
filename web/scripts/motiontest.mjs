// Motion test: load the site, freeze the camera over a region, then capture
// two frames 8s apart + dump a few track positions each time. Proves whether
// positions actually advance (and how much) between frames.
import puppeteer from 'puppeteer-core';
const URL = process.argv[2] || 'https://osint-central.vercel.app';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--window-size=1500,950'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, 16000));

// Freeze view; expose a sampler reading the store.
const sample = async () => page.evaluate(() => {
  const g = window.__globe;
  if (g) { g.controls().autoRotate = false; }
  // grab the zustand store off any react fiber? simpler: read from a global if present
  const s = window.__store && window.__store.getState ? window.__store.getState() : null;
  if (!s) return { err: 'no store' };
  const pick = type => s.tracks.filter(t => t.type === type).slice(0, 3)
    .map(t => ({ id: t.id, lat: +t.lat.toFixed(4), lng: +t.lng.toFixed(4) }));
  return { tick: s.tick, mode: s.mode, counts: {
      aircraft: s.tracks.filter(t=>t.type==='aircraft').length,
      ship: s.tracks.filter(t=>t.type==='ship').length,
      satellite: s.tracks.filter(t=>t.type==='satellite').length,
    }, sat: pick('satellite'), ac: pick('aircraft') };
});

const a = await sample();
await new Promise(r => setTimeout(r, 8000));
const b = await sample();
console.log('FRAME A:', JSON.stringify(a));
console.log('FRAME B:', JSON.stringify(b));
if (errs.length) console.log('ERRORS:', errs.slice(0, 6).join(' | '));
await browser.close();
