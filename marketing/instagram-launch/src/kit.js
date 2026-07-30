/* ══════════════════════════════════════════
   FLAG IT — Instagram launch series
   Shared helpers for the post templates:
     · applyCopy()  — swaps EN/NL copy from window.COPY via ?lang=
     · buildWall()  — draws a procedural bouldering-wall background
   Everything is generated in-page, so the posts need no stock
   photography and no licensing.
══════════════════════════════════════════ */

const LANG = new URLSearchParams(location.search).get('lang') === 'nl' ? 'nl' : 'en';

function applyCopy() {
  const dict = (window.COPY || {})[LANG] || {};
  document.querySelectorAll('[data-c]').forEach(el => {
    const v = dict[el.dataset.c];
    if (v != null) el.innerHTML = v;
  });
  document.documentElement.lang = LANG;
}

/* ── Seeded RNG so every render is byte-identical ── */
function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

/* Organic blob path — what a climbing hold silhouette actually looks like */
function blobPath(cx, cy, r, wobble, rng) {
  const pts = [];
  const n = 7 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - wobble / 2 + rng() * wobble);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * (.72 + rng() * .4)]);
  }
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], nx = pts[(i + 1) % pts.length];
    const mid = [(p[0] + nx[0]) / 2, (p[1] + nx[1]) / 2];
    d += i === 0 ? `M${mid[0].toFixed(1)},${mid[1].toFixed(1)}` : '';
    const after = pts[(i + 1) % pts.length];
    const nextMid = [(after[0] + pts[(i + 2) % pts.length][0]) / 2, (after[1] + pts[(i + 2) % pts.length][1]) / 2];
    d += `Q${after[0].toFixed(1)},${after[1].toFixed(1)} ${nextMid[0].toFixed(1)},${nextMid[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/**
 * Renders a bouldering-wall backdrop into `el`.
 * @param {HTMLElement} el   target (should be position:absolute; inset:0)
 * @param {object} opts      { seed, holdCount, density }
 */
function buildWall(el, opts = {}) {
  const seed = opts.seed || 11;
  const holdCount = opts.holdCount != null ? opts.holdCount : 15;
  const rng = makeRng(seed);

  // Hold colours: the app's own grade palette, so the wall is literally brand-coloured
  const holdColors = ['#7f77dd', '#534ab7', '#afa9ec', '#378add', '#d85a30', '#f0997b', '#2a9480', '#d4537e'];

  const facets = [
    { pts: '0,0 1080,0 1080,300 0,430', fill: '#161522' },
    { pts: '0,430 1080,300 1080,660 0,760', fill: '#121120' },
    { pts: '0,760 1080,660 1080,1080 0,1080', fill: '#0e0d18' },
    { pts: '640,0 1080,0 1080,1080 820,1080', fill: 'rgba(127,119,221,.030)' }
  ];

  // T-nuts: the giveaway detail of a real climbing wall
  let tnuts = '';
  for (let y = 46; y < 1080; y += 62) {
    for (let x = 40; x < 1080; x += 62) {
      const jx = x + (rng() - .5) * 5, jy = y + (rng() - .5) * 5;
      tnuts += `<circle cx="${jx.toFixed(0)}" cy="${jy.toFixed(0)}" r="4" fill="rgba(0,0,0,.55)"/>` +
               `<circle cx="${jx.toFixed(0)}" cy="${(jy - 1).toFixed(0)}" r="4" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1"/>`;
    }
  }

  // Holds, kept out of the central area where the headline sits
  let holds = '';
  const placed = [];
  let guard = 0;
  while (placed.length < holdCount && guard++ < 900) {
    const cx = 40 + rng() * 1000;
    const cy = 40 + rng() * 1000;
    const r = 26 + rng() * 44;
    // keep the middle band clear for type, and the top-left clear for the logo lockup
    if (cy > 240 && cy < 900 && cx < 940) continue;
    if (cy < 210 && cx < 430) continue;
    if (placed.some(p => Math.hypot(p[0] - cx, p[1] - cy) < (p[2] + r) * 1.5)) continue;
    placed.push([cx, cy, r]);

    const c = holdColors[Math.floor(rng() * holdColors.length)];
    const rot = Math.floor(rng() * 360);
    const id = 'h' + placed.length;
    holds += `
      <g transform="rotate(${rot} ${cx.toFixed(0)} ${cy.toFixed(0)})" opacity="${(.55 + rng() * .35).toFixed(2)}">
        <path d="${blobPath(cx, cy + 5, r, .5, rng)}" fill="rgba(0,0,0,.55)"/>
        <path d="${blobPath(cx, cy, r, .5, rng)}" fill="${c}"/>
        <path d="${blobPath(cx - r * .18, cy - r * .2, r * .52, .55, rng)}" fill="url(#glossy)" opacity=".55"/>
        <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(r * .17).toFixed(1)}" fill="rgba(0,0,0,.45)"/>
      </g>`;
  }

  el.innerHTML = `
  <svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="glossy" cx="30%" cy="25%">
        <stop offset="0%" stop-color="#fff" stop-opacity=".85"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${seed}"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <linearGradient id="seam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="rgba(255,255,255,.10)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,.02)"/>
      </linearGradient>
    </defs>

    <rect width="1080" height="1080" fill="#111020"/>
    ${facets.map(f => `<polygon points="${f.pts}" fill="${f.fill}"/>`).join('')}
    <polyline points="0,430 1080,300" fill="none" stroke="url(#seam)" stroke-width="2"/>
    <polyline points="0,760 1080,660" fill="none" stroke="url(#seam)" stroke-width="2"/>
    <polyline points="640,0 820,1080" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="2"/>

    <g>${tnuts}</g>
    <g>${holds}</g>

    <rect width="1080" height="1080" filter="url(#grain)" opacity=".055"/>
  </svg>`;
}
