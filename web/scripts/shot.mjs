// Headless screenshot of the running dev app, for verifying the WebGL globe.
// Usage: node scripts/shot.mjs [url] [outfile] [waitMs]
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://localhost:5173';
const OUT = process.argv[3] || '/tmp/osint-shot.png';
const WAIT = parseInt(process.argv[4] || '13000', 10);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--window-size=1400,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, WAIT));
await page.screenshot({ path: OUT });
console.log('shot →', OUT);
if (errs.length) console.log('CONSOLE ERRORS:\n' + errs.slice(0, 12).join('\n'));
else console.log('no console errors');
await browser.close();
