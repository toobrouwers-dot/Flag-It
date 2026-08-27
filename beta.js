/* ============================================================
   Flag-It Gym Beta Board — gedeelde route-beta per gym
   Depends on: cloud.js (db(), cloudCurrentUser(), cloudReady(), cloudIsAdmin())

   Alle tekst hier komt van andere gebruikers. Vandaar een eigen escape
   (_s) die óók de apostrof pakt, en handlers die uitsluitend een id
   meekrijgen — nooit de tekst zelf. Dat is precies de klasse bug die
   eerder in e0adff0 gefixt is.
   ============================================================ */

const BETA_MAX_LEN = 500;
const BETA_DAILY_LIMIT = 10;
const BETA_PAGE_SIZE = 50;

// Eigen escape: esc() in index.html laat ' staan, en dat breekt een
// waarde die in een enkel-aangehaalde inline handler belandt.
function _s(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function betaGymKey(name) {
  return String(name || '').trim().toLowerCase();
}

function betaAvailable() {
  return typeof cloudReady === 'function' && cloudReady() && typeof db === 'function';
}

// De rijen van de laatste lading, zodat handlers een index kunnen krijgen
// in plaats van geïnterpoleerde tekst.
let _betaRows = [];
let _betaGym = { key: '', label: '' };
let _betaIsAdmin = false;
let _betaPrefill = null;   // gezet als je vanaf een routekaart binnenkomt

async function betaLoad(gymKey) {
  if (!betaAvailable()) return null;
  try {
    const { data, error } = await db().from('gym_beta')
      .select('id,user_id,grade,color,sector,body,created_at,accounts(username,display_name,emoji)')
      .eq('gym_key', gymKey)
      .eq('hidden', false)
      .order('created_at', { ascending: false })
      .limit(BETA_PAGE_SIZE);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[beta] load error:', e);
    return null;
  }
}

async function betaPost(entry) {
  if (!betaAvailable()) return { ok: false, error: 'offline' };
  const user = await cloudCurrentUser();
  if (!user) return { ok: false, error: 'auth' };
  const body = String(entry.body || '').trim();
  if (!body) return { ok: false, error: 'empty' };
  if (body.length > BETA_MAX_LEN) return { ok: false, error: 'long' };

  // Rate limit: tien per dag is ruim voor een sessie en houdt spam eruit.
  try {
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await db().from('gym_beta')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', since);
    if ((count || 0) >= BETA_DAILY_LIMIT) return { ok: false, error: 'limit' };
  } catch (e) { /* limiet niet kunnen checken mag het plaatsen niet blokkeren */ }

  try {
    const { error } = await db().from('gym_beta').insert({
      user_id: user.id,
      gym_key: entry.gymKey,
      gym_label: entry.gymLabel || '',
      grade: entry.grade || '',
      color: entry.color || '',
      sector: (entry.sector || '').trim(),
      body
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'insert' };
  }
}

async function betaDelete(id) {
  if (!betaAvailable()) return false;
  try {
    const { error } = await db().from('gym_beta').delete().eq('id', id);
    return !error;
  } catch (e) { return false; }
}

async function betaHide(id) {
  if (!betaAvailable()) return false;
  try {
    const { error } = await db().from('gym_beta').update({ hidden: true }).eq('id', id);
    return !error;
  } catch (e) { return false; }
}

/* ── UI ──────────────────────────────────────────────────── */

async function openBetaBoard(gymName, prefill) {
  document.getElementById('beta-ov')?.remove();
  _betaPrefill = prefill || null;
  _betaGym = { key: betaGymKey(gymName), label: String(gymName || '') };
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'beta-ov';
  ov.innerHTML = `<div class="modal-box beta-box">
    <div class="modal-title">Beta board</div>
    <div class="beta-gym" data-no-i18n>${_s(_betaGym.label)}</div>
    <div id="beta-list" class="beta-list"><div style="color:var(--muted);font-size:13px;padding:8px 0">Laden…</div></div>
    <div id="beta-form"></div>
    <button class="btn-export modal-close" onclick="document.getElementById('beta-ov')?.remove()">Sluiten</button>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  await betaRefresh();
}

async function betaRefresh() {
  const list = document.getElementById('beta-list');
  if (!list) return;
  if (!betaAvailable()) {
    list.innerHTML = '<div class="empty-state" style="padding:20px 12px">Beta board is nu niet beschikbaar.</div>';
    return;
  }
  const user = await cloudCurrentUser();
  if (!user) {
    list.innerHTML = '<div class="empty-state" style="padding:20px 12px">Log in om beta te lezen en te delen.</div>';
    document.getElementById('beta-form').innerHTML = '';
    return;
  }
  _betaIsAdmin = typeof cloudIsAdmin === 'function' ? await cloudIsAdmin().catch(() => false) : false;
  const rows = await betaLoad(_betaGym.key);
  if (rows === null) {
    list.innerHTML = '<div class="empty-state" style="padding:20px 12px">Beta laden mislukt.</div>';
    return;
  }
  _betaRows = rows;
  list.innerHTML = rows.length
    ? rows.map((r, i) => betaRowHtml(r, i, user.id)).join('')
    : '<div class="empty-state" style="padding:20px 12px">Nog geen beta voor deze gym — wees de eerste.</div>';
  betaRenderForm();
}

function betaRowHtml(r, i, myId) {
  const acct = r.accounts || {};
  const who = acct.display_name || acct.username || 'Klimmer';
  const when = r.created_at ? new Date(r.created_at).toLocaleDateString(
    typeof LOCALE === 'function' ? LOCALE() : 'en-US', { day: 'numeric', month: 'short' }) : '';
  const hex = typeof routeColorHex === 'function' ? routeColorHex(r.color) : '';
  const tags = [
    r.grade ? `<span class="beta-tag">${_s(r.grade)}</span>` : '',
    hex ? `<span class="beta-dot" style="background:${_s(hex)}"></span>` : '',
    r.sector ? `<span class="beta-tag" data-no-i18n>${_s(r.sector)}</span>` : ''
  ].join('');
  // Alleen de index gaat de handler in — nooit de tekst of de naam.
  const canDelete = r.user_id === myId;
  const actions = [
    canDelete ? `<button class="beta-act" onclick="betaRemoveAt(${i})">Verwijderen</button>` : '',
    (_betaIsAdmin && !canDelete) ? `<button class="beta-act" onclick="betaHideAt(${i})">Verbergen</button>` : ''
  ].join('');
  return `<div class="beta-item">
    <div class="beta-item-top">${tags}<span class="beta-when">${_s(when)}</span></div>
    <div class="beta-body" data-no-i18n>${_s(r.body)}</div>
    <div class="beta-foot"><span class="beta-who" data-no-i18n>${_s(who)}</span>${actions}</div>
  </div>`;
}

function betaRenderForm() {
  const el = document.getElementById('beta-form');
  if (!el) return;
  const grades = (typeof GRADES !== 'undefined' ? GRADES : []);
  const colors = (typeof ROUTE_COLORS !== 'undefined' ? ROUTE_COLORS : []);
  const pre = _betaPrefill || {};
  el.innerHTML = `<div class="beta-form-wrap">
    <div class="form-section-title" style="padding:12px 0 8px">Beta delen</div>
    <div class="beta-form-row">
      <select id="beta-grade" class="form-input"><option value="">Graad</option>${grades.map(g => `<option${g === pre.grade ? ' selected' : ''}>${_s(g)}</option>`).join('')}</select>
      <select id="beta-color" class="form-input"><option value="">Kleur</option>${colors.map(c => `<option value="${_s(c.n)}"${c.n === pre.color ? ' selected' : ''}>${_s(c.n)}</option>`).join('')}</select>
    </div>
    <input type="text" id="beta-sector" class="form-input" data-no-i18n value="${_s(pre.sector || '')}" placeholder="Sector (optioneel)" style="margin-bottom:8px">
    <textarea id="beta-body" class="form-input" data-no-i18n maxlength="${BETA_MAX_LEN}" placeholder="Hiel rechts op de volgreep, dan crossen naar de sloper..." style="height:70px;margin-bottom:8px"></textarea>
    <button class="btn-add-goal" id="beta-post-btn" onclick="betaSubmit(this)">Plaatsen</button>
  </div>`;
}

async function betaSubmit(btn) {
  const body = (document.getElementById('beta-body')?.value || '').trim();
  if (!body) { if (typeof toast === 'function') toast('Schrijf eerst je beta', '#e53935'); return; }
  btn.classList.add('is-loading');
  btn.disabled = true;
  const res = await betaPost({
    gymKey: _betaGym.key,
    gymLabel: _betaGym.label,
    grade: document.getElementById('beta-grade')?.value || '',
    color: document.getElementById('beta-color')?.value || '',
    sector: document.getElementById('beta-sector')?.value || '',
    body
  });
  btn.classList.remove('is-loading');
  btn.disabled = false;
  if (!res.ok) {
    const msg = res.error === 'limit' ? 'Dagelijkse limiet bereikt — morgen weer'
      : res.error === 'auth' ? 'Log in om beta te delen'
      : res.error === 'long' ? 'Beta is te lang'
      : 'Beta plaatsen mislukt';
    if (typeof toast === 'function') toast(msg, '#e53935');
    return;
  }
  if (typeof toast === 'function') toast('Beta geplaatst!');
  _betaPrefill = null;
  await betaRefresh();
}

async function betaRemoveAt(i) {
  const row = _betaRows[i];
  if (!row) return;
  const run = async () => {
    if (await betaDelete(row.id)) { if (typeof toast === 'function') toast('Beta verwijderd', '#e53935'); await betaRefresh(); }
    else if (typeof toast === 'function') toast('Verwijderen mislukt', '#e53935');
  };
  if (typeof showDeleteConfirm === 'function') showDeleteConfirm('Beta verwijderen?', '', run);
  else run();
}

async function betaHideAt(i) {
  const row = _betaRows[i];
  if (!row) return;
  if (await betaHide(row.id)) { if (typeof toast === 'function') toast('Beta verborgen'); await betaRefresh(); }
  else if (typeof toast === 'function') toast('Verbergen mislukt', '#e53935');
}
