// Precise close-up: disable auto-rotate, frame a dense region at low altitude,
// then crop — to clearly see icon silhouettes + heading rotation.
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] || '/tmp/osint-inspect.png';
const LAT = parseFloat(process.argv[3] || '50');
const LNG = parseFloat(process.argv[4] || '8');
const ALT = parseFloat(process.argv[5] || '0.45');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--window-size=1500,950'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, 13000));
await page.evaluate((lat, lng, alt) => {
  const g = window.__globe;
  if (g) { g.controls().autoRotate = false; g.pointOfView({ lat, lng, altitude: alt }, 0); }
}, LAT, LNG, ALT);
await new Promise(r => setTimeout(r, 3500));
await page.screenshot({ path: OUT, clip: { x: 360, y: 130, width: 600, height: 600 } });
console.log('inspect →', OUT);
if (errs.length) console.log(errs.slice(0, 8).join('\n'));
await browser.close();
