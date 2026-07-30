#!/usr/bin/env node
/* ══════════════════════════════════════════
   Captures the real Flag It UI for the Instagram posts.

     node build/capture-app.js            # English UI
     node build/capture-app.js --lang nl  # Dutch UI

   It boots a throwaway static server on the repo root, seeds a demo
   profile into localStorage (deterministic — same numbers every run),
   walks the app and writes phone-sized PNGs into src/screens/.

   Nothing here touches the app itself; the demo data lives only in the
   headless browser's storage.
══════════════════════════════════════════ */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../../..');
const SCREENS = path.resolve(__dirname, '../src/screens');
const CACHE = path.join(__dirname, '.fontcache');
const PORT = 8931;

const args = process.argv.slice(2);
const LANG = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en';
const SUF = LANG === 'nl' ? '.nl' : '.en';

const GRADES = ['4','4+','5','5+','5a','5b','5c','6a','6a+','6b','6b+','6c','6c+','7a','7a+','7b','7b+','7c','7c+','8a','8a+','8b','8b+'];
const TYPES = ['Slab','Verticaal','Overhang','Cave','Dyno','Mantle','Pinch','Crimp','Sloper'];

let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];

/* A believable 4-month arc: 6a-ish up to a first 7b. */
function buildDemo() {
  const gyms = [
    { id: 1, name: 'Klimmuur', fav: true },
    { id: 2, name: 'Sterk', fav: false },
    { id: 3, name: 'Monk', fav: false }
  ];
  const sessions = [];
  const anchor = new Date('2026-07-29T18:00:00Z');
  for (let i = 23; i >= 0; i--) {
    const d = new Date(anchor.getTime() - Math.round(i * 4.2) * 86400000);
    const base = 7 + Math.round(((23 - i) / 23) * 6);
    const routes = [];
    const n = 5 + Math.floor(rnd() * 5);
    for (let r = 0; r < n; r++) {
      const gi = Math.max(5, Math.min(GRADES.length - 1, base + Math.floor(rnd() * 5) - 2));
      const roll = rnd();
      const result = roll > 0.78 ? 'flash' : (roll > 0.26 ? 'top' : 'poging');
      routes.push({
        grade: GRADES[gi], type: pick(TYPES),
        attempts: result === 'flash' ? 1 : 1 + Math.floor(rnd() * 4),
        result, projectId: null
      });
    }
    sessions.push({
      date: d.toISOString().slice(0, 10),
      gym: pick(gyms).name, note: '', routes,
      feel: pick([3, 2, 2, 3, 1]),
      id: d.getTime(),
      sessionStart: d.getTime() - (72 + Math.floor(rnd() * 26)) * 60000,
      sessionEnd: d.getTime(),
      is_public: true
    });
  }
  const goals = [
    { id: 9001, kind: 'grade', type: 'grade', grade: '7a', result: 'top', deadline: '2026-10-01', done: false, created: '2026-05-01' },
    { id: 9002, kind: 'count', type: 'count', grade: '6c', result: 'top', target: 25, deadline: '2026-09-01', done: false, created: '2026-05-01' }
  ];
  const hang = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(anchor.getTime() - i * 6 * 86400000);
    hang.push({ date: d.toISOString().slice(0, 10), id: d.getTime(), sets: [{ grip: 'Half-krim', edge: 20, time: 10 + (9 - i), weight: 0, reps: 6 }] });
  }
  return { gyms, sessions, goals, hang };
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.sql': 'text/plain' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(REPO, rel === '/' ? '/index.html' : rel);
      if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('nope');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  fs.mkdirSync(SCREENS, { recursive: true });
  const srv = await serve();

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    locale: LANG === 'nl' ? 'nl-NL' : 'en-US'
  });

  // The app pulls Chart.js, Supabase and Google Fonts from CDNs. Serve fonts and
  // Chart.js from the local cache when it exists, and stub Supabase — the demo
  // profile is local-only, so no cloud calls should fire during a capture.
  const chartLocal = path.join(CACHE, 'chart.umd.js');
  await ctx.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('fonts.googleapis.com/css2') && fs.existsSync(path.join(CACHE, 'fonts.css'))) {
      return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(CACHE, 'fonts.css'), 'utf8') });
    }
    if (url.includes('/__fonts/')) {
      const name = url.split('/__fonts/')[1].split('?')[0];
      return route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(path.join(CACHE, 'files', name)) });
    }
    if (url.includes('chart.umd.js') && fs.existsSync(chartLocal)) {
      return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(chartLocal, 'utf8') });
    }
    if (url.includes('supabase-js')) {
      return route.fulfill({ contentType: 'application/javascript', body: '/* stubbed for capture */' });
    }
    return route.continue();
  });

  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('   PAGE ERROR:', e.message));

  const demo = buildDemo();
  const pid = 'p_demo';
  await page.addInitScript(({ demo, pid, lang }) => {
    localStorage.setItem('flagit_lang_v1', lang);
    localStorage.setItem('flagit_profiles_v1', JSON.stringify([{ id: pid, name: 'Tobias', emoji: '🧗', created: '2026-04-12' }]));
    localStorage.setItem('flagit_sessions_v2_' + pid, JSON.stringify(demo.sessions));
    localStorage.setItem('flagit_gyms_v1_' + pid, JSON.stringify(demo.gyms));
    localStorage.setItem('flagit_goals_v2_' + pid, JSON.stringify(demo.goals));
    localStorage.setItem('flagit_hang_v1_' + pid, JSON.stringify(demo.hang));
    localStorage.setItem('flagit_install_dismissed_v1', '1');
  }, { demo, pid, lang: LANG });

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof window.selectProfile === 'function', null, { timeout: 20000 });
  await page.waitForTimeout(1200);

  // Strip capture-only noise: the service-worker update toast, the empty ad slot,
  // and the cloud badge (which reads "not configured" because Supabase is stubbed).
  const clean = () => page.evaluate(() => {
    document.querySelectorAll('.modal-overlay, #install-banner, .install-banner, .ad-unit').forEach(e => e.remove());
    const t = document.getElementById('toast');
    if (t) { t.classList.remove('show'); t.style.display = 'none'; }
    document.getElementById('cloud-auth-badge')?.remove();
    document.getElementById('cloud-sync-dot')?.remove();
  });
  const shot = name => page.screenshot({ path: path.join(SCREENS, name + SUF + '.png') });

  await page.evaluate(() => dismissStartScreen());
  await page.waitForTimeout(900);
  await page.evaluate(p => selectProfile(p), pid);
  await page.waitForTimeout(2500);
  await clean();
  await shot('screen-feed');
  console.log(`  ✓ src/screens/screen-feed${SUF}.png`);

  // Analyse, parked on the grade-progression chart
  await page.evaluate(() => showPage('stats'));
  await page.waitForTimeout(3200);
  await clean();
  await page.evaluate(() => {
    const c = document.getElementById('chart-progress');
    const card = c && c.closest('div[style], .card-base, section') || c;
    if (card) window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 150);
  });
  await page.waitForTimeout(1200);
  await shot('screen-stats');
  console.log(`  ✓ src/screens/screen-stats${SUF}.png`);

  // Log form
  await page.evaluate(() => { showPage('log'); window.scrollTo(0, 0); });
  await page.waitForTimeout(1400);
  await clean();
  await shot('screen-log');
  console.log(`  ✓ src/screens/screen-log${SUF}.png`);

  await browser.close();
  srv.close();
})();
