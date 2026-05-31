// Zoom the globe in (mouse wheel) over a dense region, then crop — to inspect
// icon shapes + heading rotation up close.
import puppeteer from 'puppeteer-core';
const OUT = process.argv[2] || '/tmp/osint-zoom.png';
const WAIT = parseInt(process.argv[3] || '14000', 10);
const WHEEL = parseInt(process.argv[4] || '6', 10);
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
await new Promise(r => setTimeout(r, WAIT));
// hover over globe centre-ish (over Europe given default framing) and zoom in
const cx = 620, cy = 360;
await page.mouse.move(cx, cy);
for (let i = 0; i < WHEEL; i++) { await page.mouse.wheel({ deltaY: -240 }); await new Promise(r => setTimeout(r, 120)); }
await new Promise(r => setTimeout(r, 3000));
await page.screenshot({ path: OUT, clip: { x: 320, y: 120, width: 620, height: 620 } });
console.log('zoom →', OUT);
if (errs.length) console.log(errs.slice(0, 8).join('\n'));
await browser.close();
