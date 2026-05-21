/* ============================================================
   Flag-It Cloud — Supabase Integration
   ============================================================
   Setup:
   1. Create a project at https://supabase.com
   2. Replace CLOUD_URL and CLOUD_KEY with your project values
      (Dashboard → your project → Settings → API)
   3. Run supabase_schema.sql in your SQL Editor
   4. Enable Google: Authentication → Providers → Google
   5. Set Site URL: Authentication → URL Configuration
   ============================================================ */

const CLOUD_URL = 'https://rnaykehkgfqqzhhumaub.supabase.co';
const CLOUD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuYXlrZWhrZ2ZxcXpoaHVtYXViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTMyMzIsImV4cCI6MjA5NDkyOTIzMn0.8qV8ZzzZKD-kHWCygTjWAHg0Wn0vqz-zRrqrw8DSxf0';

let _db = null;

function db() {
  if (!_db && window.supabase) {
    _db = window.supabase.createClient(CLOUD_URL, CLOUD_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'flagit_auth' }
    });
  }
  return _db;
}

function cloudReady() {
  return CLOUD_URL !== 'https://YOUR_PROJECT_ID.supabase.co' && !!window.supabase;
}

// ── AUTH ──────────────────────────────────────────────────

async function cloudCurrentUser() {
  if (!cloudReady()) return null;
  try {
    const { data } = await db().auth.getUser();
    return data?.user || null;
  } catch(e) {
    return null;
  }
}

async function cloudSignIn(email, pw) {
  const { data, error } = await db().auth.signInWithPassword({ email, password: pw });
  if (error) throw error;
  return data.user;
}

async function cloudSignUp(email, pw) {
  const { data, error } = await db().auth.signUp({ email, password: pw });
  if (error) throw error;
  return data.user;
}

async function cloudSignInGoogle() {
  const { error } = await db().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname }
  });
  if (error) throw error;
}

async function cloudSignOut() {
  if (!cloudReady()) return;
  await db().auth.signOut();
  cloudUpdateAuthBadge(null);
}

// ── DIRTY TRACKING ────────────────────────────────────────

function _dirtyKey(pid) { return 'flagit_cloud_dirty_' + pid; }
function _getDirty(pid) { try { return JSON.parse(localStorage.getItem(_dirtyKey(pid)) || '{}'); } catch(e) { return {}; } }
function _saveDirty(pid, d) { try { localStorage.setItem(_dirtyKey(pid), JSON.stringify(d)); } catch(e) {} }

function cloudMarkDirty(table, pid) {
  if (!pid) return;
  const d = _getDirty(pid); d[table] = true; _saveDirty(pid, d);
}
function cloudClearDirty(table, pid) {
  const d = _getDirty(pid); delete d[table]; _saveDirty(pid, d);
}
function cloudAnyDirty(pid) {
  return Object.keys(_getDirty(pid)).length > 0;
}
function cloudMarkAllDirty(pid) {
  const d = {};
  ['sessions','gyms','goals','hang_sessions','projects','injuries','competitions','gym_resets','active_plans'].forEach(t => d[t] = true);
  _saveDirty(pid, d);
}

// ── SYNC INDICATOR ────────────────────────────────────────

let _syncTimer = null;

function cloudSetStatus(s) {
  const el = document.getElementById('cloud-sync-dot');
  if (!el) return;
  el.dataset.status = s;
  el.title = { idle: 'Gesynchroniseerd ☁', syncing: 'Synchroniseren…', error: 'Sync mislukt', offline: 'Offline — data wordt later gesynchroniseerd' }[s] || '';
}

function cloudScheduleSync(pid, delayMs = 2500) {
  if (!cloudReady()) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => cloudSync(pid).catch(() => {}), delayMs);
}

// ── DATA MAPPING ─────────────────────────────────────────

// [localName, dbColumnName] pairs per table
const _FIELD_MAP = {
  sessions:   [['sessionStart','session_start'],['sessionEnd','session_end']],
  goals:      [['createdAt','created_at_date']],
  projects:   [['betaNotes','beta_notes'],['setterData','setter_data'],['createdAt','created_at_date'],['completedAt','completed_at']],
  gym_resets: [['gymId','gym_local_id']],
};

function _toRow(obj, uid, pid, table) {
  const { id, _cid, ...rest } = obj;
  const row = { ...rest, local_id: id, user_id: uid, profile_id: pid };
  for (const [local, dbCol] of (_FIELD_MAP[table] || [])) {
    if (local in row) { row[dbCol] = row[local]; delete row[local]; }
  }
  return row;
}

function _fromRow(raw, table) {
  const { user_id, profile_id, id: cid, local_id, created_at, updated_at, ...rest } = raw;
  const obj = { ...rest, id: local_id, _cid: cid };
  for (const [local, dbCol] of (_FIELD_MAP[table] || [])) {
    if (dbCol in obj) { obj[local] = obj[dbCol]; delete obj[dbCol]; }
  }
  return obj;
}

// ── PUSH ─────────────────────────────────────────────────

async function _pushTable(table, rows, uid, pid) {
  if (!rows?.length) return;
  const { error } = await db().from(table)
    .upsert(rows.map(r => _toRow(r, uid, pid, table)), { onConflict: 'user_id,profile_id,local_id' });
  if (error) throw error;
  // Store cloud UUIDs back to local objects (needed for kudos/comments references)
  const { data } = await db().from(table).select('id,local_id').eq('user_id', uid).eq('profile_id', pid);
  if (data) {
    const map = Object.fromEntries(data.map(r => [r.local_id, r.id]));
    rows.forEach(r => { if (map[r.id]) r._cid = map[r.id]; });
  }
}

async function _pushPlan(plan, uid, pid) {
  if (!plan) {
    await db().from('active_plans').delete().match({ user_id: uid, profile_id: pid });
  } else {
    await db().from('active_plans').upsert(
      { user_id: uid, profile_id: pid, plan_id: plan.planId, start_date: plan.startDate },
      { onConflict: 'user_id,profile_id' }
    );
  }
}

// ── PULL ─────────────────────────────────────────────────

async function _pullTable(table, uid, pid) {
  const { data, error } = await db().from(table).select('*').eq('user_id', uid).eq('profile_id', pid);
  if (error) throw error;
  return (data || []).map(r => _fromRow(r, table));
}

async function _pullPlan(uid, pid) {
  const { data } = await db().from('active_plans').select('*').eq('user_id', uid).eq('profile_id', pid).maybeSingle();
  if (!data) return null;
  return { planId: data.plan_id, startDate: data.start_date };
}

// ── FULL SYNC ────────────────────────────────────────────

async function cloudSync(pid) {
  if (!cloudReady()) { cloudSetStatus('offline'); return; }
  const user = await cloudCurrentUser();
  if (!user) return;
  if (!cloudAnyDirty(pid)) {
    // Nothing to push — still pull in case another device added data
    await _pullAndApply(user.id, pid);
    return;
  }

  cloudSetStatus('syncing');
  try {
    const uid = user.id;
    const dirty = _getDirty(pid);
    const getData = window._cloudData || (() => ({}));
    const d = getData();

    // Push dirty tables
    const tablePairs = [
      ['sessions',      d.sessions],
      ['gyms',          d.gyms],
      ['goals',         d.goals],
      ['hang_sessions', d.hangSessions],
      ['projects',      d.projects],
      ['injuries',      d.injuries],
      ['competitions',  d.competitions],
      ['gym_resets',    d.gymResets],
    ];
    for (const [t, rows] of tablePairs) {
      if (dirty[t] && rows) { await _pushTable(t, rows, uid, pid); cloudClearDirty(t, pid); }
    }
    if (dirty['active_plans']) {
      await _pushPlan(d.activePlan, uid, pid); cloudClearDirty('active_plans', pid);
    }

    await _pullAndApply(uid, pid);
    cloudSetStatus('idle');
  } catch(e) {
    console.warn('[cloud] sync error:', e);
    cloudSetStatus('error');
  }
}

async function _pullAndApply(uid, pid) {
  const pulled = {
    sessions:     await _pullTable('sessions',      uid, pid),
    gyms:         await _pullTable('gyms',          uid, pid),
    goals:        await _pullTable('goals',         uid, pid),
    hangSessions: await _pullTable('hang_sessions', uid, pid),
    projects:     await _pullTable('projects',      uid, pid),
    injuries:     await _pullTable('injuries',      uid, pid),
    competitions: await _pullTable('competitions',  uid, pid),
    gymResets:    await _pullTable('gym_resets',    uid, pid),
    activePlan:   await _pullPlan(uid, pid),
  };
  const cbs = window._cloudCallbacks || {};
  for (const [key, fn] of Object.entries(cbs)) {
    if (pulled[key] !== undefined && (Array.isArray(pulled[key]) ? pulled[key].length : pulled[key] !== null)) {
      fn(pulled[key]);
    }
  }
}

// ── FIRST-LOGIN MIGRATION ────────────────────────────────
// Push all local data to cloud on first login

async function cloudMigrateLocal(pid) {
  cloudMarkAllDirty(pid);
  await cloudSync(pid);
}

// ── ACCOUNT PROFILE ──────────────────────────────────────

async function cloudGetAccount() {
  if (!cloudReady()) return null;
  const user = await cloudCurrentUser();
  if (!user) return null;
  const { data } = await db().from('accounts').select('*').eq('id', user.id).maybeSingle();
  return data;
}

async function cloudUpdateAccount(fields) {
  const user = await cloudCurrentUser();
  if (!user) return;
  await db().from('accounts').update(fields).eq('id', user.id);
}

// ── AUTH LISTENER ────────────────────────────────────────

function cloudInitAuthListener() {
  if (!cloudReady()) {
    // Show "not configured" state
    const el = document.getElementById('cloud-auth-badge');
    if (el) el.innerHTML = '<span class="cloud-badge cloud-badge-off" title="Supabase niet geconfigureerd">☁ Niet geconfigureerd</span>';
    return;
  }
  db().auth.onAuthStateChange((event, session) => {
    cloudUpdateAuthBadge(session?.user || null);
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user && window.activeProfileId) {
      cloudSync(window.activeProfileId).catch(() => {});
    }
  });
}

function cloudUpdateAuthBadge(user) {
  const el = document.getElementById('cloud-auth-badge');
  if (!el) return;
  if (user) {
    const name = (user.email || '').split('@')[0].slice(0, 12);
    el.innerHTML = `<span class="cloud-badge cloud-badge-in" onclick="showAccountSettings()" title="${user.email}">☁ ${_safeText(name)}</span>`;
  } else {
    el.innerHTML = `<span class="cloud-badge cloud-badge-out" onclick="showAuthScreen()">☁ Inloggen</span>`;
  }
}

function _safeText(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── AUTH SCREEN ──────────────────────────────────────────

function showAuthScreen() {
  if (document.getElementById('auth-screen')) return;
  const el = document.createElement('div');
  el.id = 'auth-screen';
  el.innerHTML = `
    <div class="auth-inner">
      <div class="auth-logo-wrap">
        <img src="./icons/icon-192.png" class="auth-logo" alt="Flag It">
        <div class="auth-title">Flag<span>it</span></div>
        <div class="auth-sub">Account verbinden</div>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab active" id="tab-signin" onclick="authSwitchTab('signin')">Inloggen</button>
        <button class="auth-tab" id="tab-signup" onclick="authSwitchTab('signup')">Registreren</button>
      </div>
      <div id="auth-form-area">
        <div id="auth-form-signin">
          <input id="auth-email" class="auth-input" type="email" placeholder="E-mailadres" autocomplete="email">
          <input id="auth-pw" class="auth-input" type="password" placeholder="Wachtwoord" autocomplete="current-password">
          <button class="auth-btn-primary" onclick="doSignIn()">Inloggen</button>
        </div>
        <div id="auth-form-signup" style="display:none">
          <input id="auth-reg-email" class="auth-input" type="email" placeholder="E-mailadres" autocomplete="email">
          <input id="auth-reg-pw" class="auth-input" type="password" placeholder="Wachtwoord (min. 6 tekens)" autocomplete="new-password">
          <input id="auth-reg-pw2" class="auth-input" type="password" placeholder="Herhaal wachtwoord" autocomplete="new-password">
          <button class="auth-btn-primary" onclick="doSignUp()">Account aanmaken</button>
        </div>
      </div>
      <div class="auth-divider"><span>of</span></div>
      <button class="auth-btn-google" onclick="doSignInGoogle()">
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5L31.8 34c-2.1 1.4-4.7 2-7.8 2-5.2 0-9.6-2.9-11.3-7.2l-6.6 5.1C9.6 39.7 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.6 4.4-4.8 5.8l5.7 4.9C40.3 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
        Doorgaan met Google
      </button>
      <div id="auth-msg" class="auth-msg"></div>
      <button class="auth-skip" onclick="hideAuthScreen()">Verder zonder account</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('auth-visible'));
  document.getElementById('auth-email')?.focus();
}

function hideAuthScreen() {
  const el = document.getElementById('auth-screen');
  if (!el) return;
  el.classList.remove('auth-visible');
  setTimeout(() => el.remove(), 350);
}

function authSwitchTab(tab) {
  document.getElementById('auth-form-signin').style.display = tab === 'signin' ? '' : 'none';
  document.getElementById('auth-form-signup').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
}

function authShowMsg(msg, isErr) {
  const el = document.getElementById('auth-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? 'var(--danger)' : 'var(--success)';
  el.style.display = msg ? '' : 'none';
}

async function doSignIn() {
  const email = document.getElementById('auth-email')?.value?.trim();
  const pw    = document.getElementById('auth-pw')?.value;
  if (!email || !pw) { authShowMsg('Vul alle velden in', true); return; }
  authShowMsg('Bezig…', false);
  try {
    await cloudSignIn(email, pw);
    authShowMsg('Ingelogd!', false);
    setTimeout(hideAuthScreen, 800);
    if (window.activeProfileId) cloudMigrateLocal(window.activeProfileId).catch(() => {});
  } catch(e) {
    authShowMsg(e.message || 'Inloggen mislukt', true);
  }
}

async function doSignUp() {
  const email = document.getElementById('auth-reg-email')?.value?.trim();
  const pw    = document.getElementById('auth-reg-pw')?.value;
  const pw2   = document.getElementById('auth-reg-pw2')?.value;
  if (!email || !pw) { authShowMsg('Vul alle velden in', true); return; }
  if (pw !== pw2) { authShowMsg('Wachtwoorden komen niet overeen', true); return; }
  if (pw.length < 6) { authShowMsg('Wachtwoord moet minimaal 6 tekens zijn', true); return; }
  authShowMsg('Account aanmaken…', false);
  try {
    await cloudSignUp(email, pw);
    authShowMsg('Account aangemaakt! Controleer je e-mail voor verificatie.', false);
    if (window.activeProfileId) setTimeout(() => cloudMigrateLocal(window.activeProfileId).catch(() => {}), 1000);
  } catch(e) {
    authShowMsg(e.message || 'Registreren mislukt', true);
  }
}

async function doSignInGoogle() {
  authShowMsg('Google-login starten…', false);
  try { await cloudSignInGoogle(); } catch(e) { authShowMsg(e.message || 'Google-login mislukt', true); }
}

// ── LOGIN FIRST SCREEN ────────────────────────────────────

function showLoginFirstScreen(onDone) {
  if (!cloudReady()) { onDone(); return; }

  const el = document.createElement('div');
  el.id = 'login-first-screen';
  el.innerHTML = `
    <div class="auth-inner">
      <div class="auth-logo-wrap">
        <img src="./icons/icon-192.png" class="auth-logo" alt="Flag It">
        <div class="auth-title">Flag<span>it</span></div>
        <div class="auth-sub">Jouw bouldering tracker</div>
      </div>
      <div id="lfs-content">
        <div class="lfs-loading">Laden…</div>
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('lfs-visible'));

  function done() {
    el.classList.remove('lfs-visible');
    setTimeout(() => { el.remove(); onDone(); }, 350);
  }
  window._lfsDone = done;

  db().auth.getSession().then(({ data: { session } }) => {
    const user = session?.user;
    const content = document.getElementById('lfs-content');
    if (!content) return;

    if (user) {
      const name = _safeText((user.email || '').split('@')[0]);
      content.innerHTML = `
        <div class="lfs-welcome">
          <div class="lfs-welcome-name">Welkom terug, ${name}!</div>
          <div class="lfs-welcome-email">${_safeText(user.email)}</div>
        </div>
        <button class="auth-btn-primary" onclick="window._lfsDone()">Doorgaan →</button>
        <div class="auth-divider"><span>of</span></div>
        <button class="auth-btn-google" onclick="cloudSignOut().then(()=>location.reload())">Uitloggen / ander account</button>
        <div id="lfs-msg" class="auth-msg"></div>`;
    } else {
      content.innerHTML = `
        <div class="auth-tabs">
          <button class="auth-tab active" id="lfs-tab-signin" onclick="lfsAuthSwitchTab('signin')">Inloggen</button>
          <button class="auth-tab" id="lfs-tab-signup" onclick="lfsAuthSwitchTab('signup')">Registreren</button>
        </div>
        <div id="lfs-form-signin">
          <input id="lfs-email" class="auth-input" type="email" placeholder="E-mailadres" autocomplete="email">
          <input id="lfs-pw" class="auth-input" type="password" placeholder="Wachtwoord" autocomplete="current-password">
          <button class="auth-btn-primary" onclick="lfsDoSignIn()">Inloggen</button>
        </div>
        <div id="lfs-form-signup" style="display:none">
          <input id="lfs-reg-email" class="auth-input" type="email" placeholder="E-mailadres" autocomplete="email">
          <input id="lfs-reg-pw" class="auth-input" type="password" placeholder="Wachtwoord (min. 6 tekens)" autocomplete="new-password">
          <input id="lfs-reg-pw2" class="auth-input" type="password" placeholder="Herhaal wachtwoord" autocomplete="new-password">
          <button class="auth-btn-primary" onclick="lfsDoSignUp()">Account aanmaken</button>
        </div>
        <div class="auth-divider"><span>of</span></div>
        <button class="auth-btn-google" onclick="lfsDoSignInGoogle()">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16.1 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5L31.8 34c-2.1 1.4-4.7 2-7.8 2-5.2 0-9.6-2.9-11.3-7.2l-6.6 5.1C9.6 39.7 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.6 4.4-4.8 5.8l5.7 4.9C40.3 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
          Doorgaan met Google
        </button>
        <div id="lfs-msg" class="auth-msg"></div>
        <button class="auth-skip" onclick="window._lfsDone()">Verder zonder account</button>`;
      document.getElementById('lfs-email')?.focus();
    }
  }).catch(() => {
    const content = document.getElementById('lfs-content');
    if (content) content.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--muted);font-size:13px">Verbinding mislukt</div>
      <button class="auth-btn-primary" onclick="window._lfsDone()">Doorgaan →</button>`;
  });
}

function lfsShowMsg(msg, isErr) {
  const el = document.getElementById('lfs-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? 'var(--danger)' : 'var(--success)';
  el.style.display = msg ? '' : 'none';
}

function lfsAuthSwitchTab(tab) {
  document.getElementById('lfs-form-signin').style.display = tab === 'signin' ? '' : 'none';
  document.getElementById('lfs-form-signup').style.display = tab === 'signup' ? '' : 'none';
  document.getElementById('lfs-tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('lfs-tab-signup').classList.toggle('active', tab === 'signup');
}

async function lfsDoSignIn() {
  const email = document.getElementById('lfs-email')?.value?.trim();
  const pw = document.getElementById('lfs-pw')?.value;
  if (!email || !pw) { lfsShowMsg('Vul alle velden in', true); return; }
  lfsShowMsg('Bezig…', false);
  try {
    await cloudSignIn(email, pw);
    lfsShowMsg('Ingelogd!', false);
    setTimeout(() => window._lfsDone?.(), 700);
  } catch(e) {
    lfsShowMsg(e.message || 'Inloggen mislukt', true);
  }
}

async function lfsDoSignUp() {
  const email = document.getElementById('lfs-reg-email')?.value?.trim();
  const pw = document.getElementById('lfs-reg-pw')?.value;
  const pw2 = document.getElementById('lfs-reg-pw2')?.value;
  if (!email || !pw) { lfsShowMsg('Vul alle velden in', true); return; }
  if (pw !== pw2) { lfsShowMsg('Wachtwoorden komen niet overeen', true); return; }
  if (pw.length < 6) { lfsShowMsg('Wachtwoord moet minimaal 6 tekens zijn', true); return; }
  lfsShowMsg('Account aanmaken…', false);
  try {
    await cloudSignUp(email, pw);
    lfsShowMsg('Account aangemaakt! Check je e-mail voor verificatie.', false);
    setTimeout(() => window._lfsDone?.(), 1500);
  } catch(e) {
    lfsShowMsg(e.message || 'Registreren mislukt', true);
  }
}

async function lfsDoSignInGoogle() {
  lfsShowMsg('Google-login starten…', false);
  try { await cloudSignInGoogle(); } catch(e) { lfsShowMsg(e.message || 'Google-login mislukt', true); }
}

// ── ACCOUNT SETTINGS ─────────────────────────────────────

async function showAccountSettings() {
  const user = await cloudCurrentUser();
  const acct = await cloudGetAccount();
  if (!user) { showAuthScreen(); return; }

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">Account</div>
    <div style="padding:0 4px 12px">
      <div style="font-size:13px;color:var(--muted);margin-bottom:4px">E-mail</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:16px">${_safeText(user.email)}</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:4px">Gebruikersnaam</div>
      <input id="acct-username" class="form-input" value="${_safeText(acct?.username||'')}" placeholder="gebruikersnaam" style="margin-bottom:16px">
      <div style="font-size:13px;color:var(--muted);margin-bottom:4px">Weergavenaam</div>
      <input id="acct-displayname" class="form-input" value="${_safeText(acct?.display_name||'')}" placeholder="Jouw naam" style="margin-bottom:16px">
      <div style="font-size:13px;color:var(--muted);margin-bottom:4px">Bio</div>
      <input id="acct-bio" class="form-input" value="${_safeText(acct?.bio||'')}" placeholder="Korte bio" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-size:13px">Openbaar profiel</span>
        <input type="checkbox" id="acct-public" ${acct?.is_public!==false?'checked':''} style="width:20px;height:20px">
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn-save" style="flex:1" onclick="saveAccountSettings()">Opslaan</button>
      <button class="btn-export" style="color:var(--danger);border-color:var(--danger)" onclick="doSignOut()">Uitloggen</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

async function saveAccountSettings() {
  const username    = document.getElementById('acct-username')?.value?.trim();
  const displayName = document.getElementById('acct-displayname')?.value?.trim();
  const bio         = document.getElementById('acct-bio')?.value?.trim();
  const isPublic    = document.getElementById('acct-public')?.checked ?? true;
  if (!username) { alert('Gebruikersnaam is verplicht'); return; }
  try {
    await cloudUpdateAccount({ username, display_name: displayName, bio, is_public: isPublic });
    document.querySelector('.modal-overlay')?.remove();
    if (typeof toast === 'function') toast('Account bijgewerkt', 'var(--accent)');
  } catch(e) {
    alert('Opslaan mislukt: ' + (e.message || ''));
  }
}

async function doSignOut() {
  document.querySelector('.modal-overlay')?.remove();
  await cloudSignOut();
  if (typeof toast === 'function') toast('Uitgelogd', 'var(--muted)');
}
