#!/usr/bin/env node
/* ══════════════════════════════════════════
   Renders every post template in ../src to a 1080x1080 PNG in ../out.

     node build/render.js            # English set (default)
     node build/render.js --lang nl  # Dutch set
     node build/render.js --only post-1

   Fonts: Barlow / Barlow Condensed are pulled once into build/.fontcache
   and served to the page from disk, so a render never depends on the
   network being reachable twice.
══════════════════════════════════════════ */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'out');
const CACHE = path.join(__dirname, '.fontcache');

const args = process.argv.slice(2);
const LANG = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en';
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=Barlow:wght@400;500;600;700&display=swap';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'user-agent': DESKTOP_UA, ...headers } };
    const req = https.get(url, opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location, headers).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${res.statusCode} for ${url}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout')));
  });
}

async function ensureFonts() {
  const cssPath = path.join(CACHE, 'fonts.css');
  if (fs.existsSync(cssPath)) return true;
  fs.mkdirSync(path.join(CACHE, 'files'), { recursive: true });
  try {
    let css = (await get(FONT_CSS_URL)).toString('utf8');
    const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)]+/g) || [])];
    for (const u of urls) {
      const name = path.basename(u.split('?')[0]);
      fs.writeFileSync(path.join(CACHE, 'files', name), await get(u));
    }
    css = css.replace(/https:\/\/fonts\.gstatic\.com\/[^)]*\/([^/)]+\.woff2)/g, '/__fonts/$1');
    fs.writeFileSync(cssPath, css);
    console.log(`  fonts cached (${urls.length} files)`);
    return true;
  } catch (e) {
    console.warn(`  ! could not cache fonts (${e.message}) — falling back to the live CDN`);
    return false;
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const cached = await ensureFonts();

  let pages = fs.readdirSync(SRC).filter(f => f.endsWith('.html')).sort();
  if (ONLY) pages = pages.filter(f => f.includes(ONLY));
  if (!pages.length) { console.error('No templates matched.'); process.exit(1); }

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined
  });
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });

  if (cached) {
    await ctx.route('**/*', route => {
      const url = route.request().url();
      if (url.includes('fonts.googleapis.com/css2')) {
        return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(CACHE, 'fonts.css'), 'utf8') });
      }
      if (url.includes('/__fonts/')) {
        const name = url.split('/__fonts/')[1].split('?')[0];
        return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(path.join(CACHE, 'files', name)) });
      }
      return route.continue();
    });
  }

  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('   PAGE ERROR:', e.message));

  for (const file of pages) {
    const url = 'file://' + path.join(SRC, file) + (LANG === 'nl' ? '?lang=nl' : '');
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(450);
    const name = file.replace(/\.html$/, '') + (LANG === 'nl' ? '.nl' : '') + '.png';
    await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: 1080, height: 1080 } });
    console.log(`  ✓ out/${name}`);
  }

  await browser.close();
})();
