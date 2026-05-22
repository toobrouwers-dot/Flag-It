/* ============================================================
   Flag-It Social — Kudos, volgen, feed, comments, ranglijst
   Depends on: cloud.js (db(), cloudCurrentUser(), cloudReady())
   ============================================================ */

// ── KUDOS ────────────────────────────────────────────────

async function giveKudos(sessionCid, btn) {
  if (!cloudReady()) { showAuthScreen(); return; }
  const user = await cloudCurrentUser();
  if (!user) { showAuthScreen(); return; }

  const { error } = await db().from('kudos').upsert(
    { from_user_id: user.id, session_id: sessionCid },
    { onConflict: 'from_user_id,session_id', ignoreDuplicates: true }
  );
  if (!error) {
    if (btn) {
      btn.classList.add('kudos-active');
      const cnt = btn.querySelector('.kudos-n');
      if (cnt) cnt.textContent = parseInt(cnt.textContent || '0') + 1;
    }
    if (typeof haptic === 'function') haptic(20);
  }
}

async function removeKudos(sessionCid, btn) {
  const user = await cloudCurrentUser();
  if (!user) return;
  const { error } = await db().from('kudos').delete().eq('from_user_id', user.id).eq('session_id', sessionCid);
  if (!error && btn) {
    btn.classList.remove('kudos-active');
    const cnt = btn.querySelector('.kudos-n');
    if (cnt) cnt.textContent = Math.max(0, parseInt(cnt.textContent || '0') - 1);
  }
}

async function toggleKudos(sessionCid, btn) {
  if (!cloudReady()) { showAuthScreen(); return; }
  if (btn?.dataset.loading) return;
  const user = await cloudCurrentUser();
  if (!user) { showAuthScreen(); return; }
  if (btn) btn.dataset.loading = '1';
  try {
    if (btn?.classList.contains('kudos-active')) {
      await removeKudos(sessionCid, btn);
    } else {
      await giveKudos(sessionCid, btn);
    }
  } finally {
    if (btn) delete btn.dataset.loading;
  }
}

async function loadKudosForSession(sessionCid) {
  if (!cloudReady()) return { count: 0, mine: false };
  const user = await cloudCurrentUser();
  const { data } = await db().from('kudos').select('from_user_id').eq('session_id', sessionCid);
  const list = data || [];
  return { count: list.length, mine: !!user && list.some(k => k.from_user_id === user.id) };
}

// ── FOLLOWS ──────────────────────────────────────────────

async function socialFollow(targetId, btn) {
  if (!cloudReady()) { showAuthScreen(); return; }
  const user = await cloudCurrentUser();
  if (!user) { showAuthScreen(); return; }
  if (user.id === targetId) return;
  const { error } = await db().from('follows').upsert(
    { follower_id: user.id, following_id: targetId },
    { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
  );
  if (error) { if (typeof toast === 'function') toast('Volgen mislukt', 'var(--danger)'); return; }
  if (btn) { btn.textContent = 'Gevolgd'; btn.classList.add('btn-following'); btn.onclick = () => socialUnfollow(targetId, btn); }
  if (typeof toast === 'function') toast('Gevolgd!', 'var(--success)');
  if (typeof haptic === 'function') haptic(10);
}

async function socialUnfollow(targetId, btn) {
  if (!cloudReady()) return;
  const user = await cloudCurrentUser();
  if (!user) return;
  const { error } = await db().from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
  if (error) { if (typeof toast === 'function') toast('Ontvolgen mislukt', 'var(--danger)'); return; }
  if (btn) { btn.textContent = 'Volgen'; btn.classList.remove('btn-following'); btn.onclick = () => socialFollow(targetId, btn); }
}

async function getFollowingIds() {
  if (!cloudReady()) return [];
  const user = await cloudCurrentUser();
  if (!user) return [];
  const { data } = await db().from('follows').select('following_id').eq('follower_id', user.id);
  return (data || []).map(r => r.following_id);
}

async function isFollowing(targetId) {
  const user = await cloudCurrentUser();
  if (!user) return false;
  const { data } = await db().from('follows').select('following_id')
    .eq('follower_id', user.id).eq('following_id', targetId).maybeSingle();
  return !!data;
}

// ── SOCIAL FEED ──────────────────────────────────────────

async function renderSocialFeed() {
  const el = document.getElementById('social-feed');
  if (!el) return;

  if (!cloudReady()) {
    el.innerHTML = `<div class="social-empty">
      <div class="social-empty-icon">☁</div>
      <div class="social-empty-title">Cloud niet geconfigureerd</div>
      <div class="social-empty-sub">Voeg je Supabase-sleutels toe aan cloud.js</div>
    </div>`;
    return;
  }

  const user = await cloudCurrentUser();
  if (!user) {
    el.innerHTML = `<div class="social-empty">
      <div class="social-empty-icon">🧗</div>
      <div class="social-empty-title">Verbind je account</div>
      <div class="social-empty-sub">Log in om sessies van vrienden te zien</div>
      <button class="social-empty-btn" onclick="showAuthScreen()">Inloggen</button>
    </div>`;
    return;
  }

  el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">Laden…</div>';

  try {
    const followingIds = await getFollowingIds();
    if (!followingIds.length) {
      el.innerHTML = `<div class="social-empty">
        <div class="social-empty-icon">🤝</div>
        <div class="social-empty-title">Niemand gevolgd</div>
        <div class="social-empty-sub">Zoek klimmers via het zoekicoon</div>
      </div>`;
      return;
    }

    const { data, error } = await db().from('sessions')
      .select('id,date,gym,note,routes,feel,accounts!sessions_user_id_fkey(id,username,emoji,display_name)')
      .eq('is_public', true)
      .in('user_id', followingIds)
      .order('date', { ascending: false })
      .limit(30);

    if (error || !data?.length) {
      el.innerHTML = `<div class="social-empty">
        <div class="social-empty-icon">📭</div>
        <div class="social-empty-title">Geen posts</div>
        <div class="social-empty-sub">Gevolgde klimmers hebben nog niets gedeeld</div>
      </div>`;
      return;
    }

    el.innerHTML = data.map(s => {
      const acc = s.accounts;
      const routes = s.routes || [];
      const sent = routes.filter(r => r.result !== 'poging');
      const maxG = sent.length ? sent.reduce((b, r) =>
        (window.GRADES || []).indexOf(r.grade) > (window.GRADES || []).indexOf(b.grade) ? r : b, sent[0]) : null;
      const heat = routes.slice(0, 8).map(r => {
        const gc = (window.GRADE_COLORS || [])[(window.GRADES || []).indexOf(r.grade)] || '#555';
        return `<div class="social-heat-block" style="background:${gc}"></div>`;
      }).join('');
      return `<div class="social-card">
        <div class="social-card-head">
          <div class="social-avatar">${_s(acc?.emoji || '🧗')}</div>
          <div class="social-user-info">
            <div class="social-username">${_s(acc?.display_name || acc?.username || 'klimmer')}</div>
            <div class="social-meta">${fmtDate ? fmtDate(s.date) : s.date}${s.gym ? ' · ' + _s(s.gym) : ''}</div>
          </div>
          <div class="social-max-grade">${maxG?.grade || '—'}</div>
        </div>
        <div class="social-heat-row">${heat}</div>
        ${s.note ? `<div class="social-note">"${_s(s.note.slice(0, 100))}"</div>` : ''}
        <div class="social-footer">
          <button class="social-kudos-btn" id="kudos-btn-${s.id}" onclick="toggleKudos('${s.id}', this)">
            🤜 <span class="kudos-n">…</span>
          </button>
          <button class="social-comment-btn" onclick="showComments('${s.id}')">💬</button>
          ${acc?.id ? `<button class="social-profile-btn" onclick="showPublicProfile('${_s(acc.id)}','${_s(acc.username||'')}')">👤 ${_s(acc.username || '')}</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // Batch-load all kudos in one query
    const currentUser = await cloudCurrentUser();
    const sessionIds = data.map(s => s.id);
    try {
      const { data: kudosData } = await db().from('kudos')
        .select('session_id,from_user_id')
        .in('session_id', sessionIds);
      const kudosMap = {};
      for (const k of (kudosData || [])) {
        if (!kudosMap[k.session_id]) kudosMap[k.session_id] = { count: 0, mine: false };
        kudosMap[k.session_id].count++;
        if (currentUser && k.from_user_id === currentUser.id) kudosMap[k.session_id].mine = true;
      }
      for (const s of data) {
        const btn = document.getElementById('kudos-btn-' + s.id);
        if (!btn) continue;
        const info = kudosMap[s.id] || { count: 0, mine: false };
        const cnt = btn.querySelector('.kudos-n');
        if (cnt) cnt.textContent = info.count;
        if (info.mine) btn.classList.add('kudos-active');
      }
    } catch(e) {
      console.warn('[social] kudos batch error:', e);
      for (const s of data) {
        const cnt = document.getElementById('kudos-btn-' + s.id)?.querySelector('.kudos-n');
        if (cnt) cnt.textContent = '0';
      }
    }
  } catch(e) {
    console.warn('[social] feed error:', e);
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--danger);font-size:13px">Laden mislukt</div>';
  }
}

// ── COMMENTS ─────────────────────────────────────────────

async function showComments(sessionId) {
  const user = await cloudCurrentUser();
  let comments = [];
  try {
    const { data } = await db().from('comments')
      .select('id,content,created_at,accounts!comments_user_id_fkey(username,emoji)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    comments = data || [];
  } catch(e) {
    console.warn('[social] comments load error:', e);
  }

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'comments-ov';
  const list = (comments || []).map(c => `
    <div class="comment-row">
      <div class="comment-avatar">${_s(c.accounts?.emoji || '🧗')}</div>
      <div class="comment-body">
        <div class="comment-user">${_s(c.accounts?.username || 'klimmer')}</div>
        <div class="comment-text">${_s(c.content)}</div>
      </div>
    </div>`).join('') || '<div style="text-align:center;color:var(--muted);padding:16px;font-size:13px">Nog geen reacties</div>';

  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">Reacties</div>
    <div style="max-height:280px;overflow-y:auto;padding:0 4px 8px">${list}</div>
    ${user ? `<div class="comment-input-row">
      <input id="comment-input" class="form-input" placeholder="Schrijf een reactie…" style="flex:1;font-size:14px">
      <button onclick="postComment('${sessionId}')" style="background:var(--accent);border:none;border-radius:10px;color:#fff;padding:0 14px;font-size:13px;font-weight:700;cursor:pointer;min-height:44px">Post</button>
    </div>` : `<div style="text-align:center;padding:8px"><button onclick="showAuthScreen()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px">Inloggen om te reageren</button></div>`}
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

async function postComment(sessionId) {
  const input = document.getElementById('comment-input');
  const content = input?.value?.trim();
  if (!content) return;
  const user = await cloudCurrentUser();
  if (!user) return;
  const { error } = await db().from('comments').insert({ user_id: user.id, session_id: sessionId, content });
  if (error) {
    if (typeof toast === 'function') toast('Reactie opslaan mislukt', 'var(--danger)');
    return;
  }
  input.value = '';
  document.getElementById('comments-ov')?.remove();
  showComments(sessionId);
  if (typeof haptic === 'function') haptic(10);
}

// ── PUBLIC PROFILE ────────────────────────────────────────

async function showPublicProfile(userId, username) {
  if (!cloudReady() || !userId) return;
  const me = await cloudCurrentUser();

  const [acctRes, sessRes] = await Promise.all([
    db().from('accounts').select('*').eq('id', userId).maybeSingle(),
    db().from('sessions').select('date,routes,gym').eq('user_id', userId).eq('is_public', true)
      .order('date', { ascending: false }).limit(20)
  ]);
  const acct = acctRes.data;
  const sess = sessRes.data || [];

  const following = me && me.id !== userId ? await isFollowing(userId) : null;
  const totalRoutes = sess.reduce((n, s) => n + (s.routes?.length || 0), 0);
  const allSent = sess.flatMap(s => (s.routes||[]).filter(r => r.result !== 'poging'));
  const pr = allSent.length ? allSent.reduce((b, r) => (window.GRADES||[]).indexOf(r.grade) > (window.GRADES||[]).indexOf(b.grade) ? r : b, allSent[0]) : null;

  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal-box" style="max-height:80dvh">
    <div style="text-align:center;padding:16px 0 12px">
      <div style="font-size:44px">${_s(acct?.emoji || '🧗')}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:800;text-transform:uppercase">${_s(acct?.display_name || acct?.username || username)}</div>
      <div style="color:var(--muted);font-size:13px;margin-top:2px">@${_s(acct?.username || username)}</div>
      ${acct?.bio ? `<div style="font-size:13px;margin-top:6px;color:var(--text)">${_s(acct.bio)}</div>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border-radius:12px;overflow:hidden;margin-bottom:12px">
      <div class="stat-box"><div class="stat-num">${sess.length}</div><div class="stat-label">Sessies</div></div>
      <div class="stat-box"><div class="stat-num">${totalRoutes}</div><div class="stat-label">Routes</div></div>
      <div class="stat-box"><div class="stat-num" style="color:var(--accent)">${pr?.grade || '—'}</div><div class="stat-label">PR</div></div>
    </div>
    ${following !== null ? `<button id="profile-follow-btn" class="btn-follow ${following ? 'btn-following' : ''}"
      onclick="${following ? `socialUnfollow` : `socialFollow`}('${userId}', this)" style="width:100%;padding:12px;margin-bottom:8px">
      ${following ? 'Gevolgd' : 'Volgen'}
    </button>` : ''}
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;padding:8px 0 6px">Recente sessies</div>
    <div style="overflow-y:auto;max-height:220px">
      ${sess.slice(0, 5).map(s => {
        const mg = (s.routes||[]).filter(r=>r.result!=='poging').reduce((b,r)=>(window.GRADES||[]).indexOf(r.grade)>(window.GRADES||[]).indexOf(b.grade)?r:b,{grade:''});
        return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--border)">
          <div><div style="font-size:13px;font-weight:600">${_s(s.gym)||'Gym'}</div><div style="font-size:12px;color:var(--muted)">${fmtDate?fmtDate(s.date):s.date}</div></div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:800;color:var(--accent)">${mg.grade||'—'}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

// ── LEADERBOARD ───────────────────────────────────────────

async function renderLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  if (!el) return;

  if (!cloudReady()) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px">Cloud niet geconfigureerd</div>';
    return;
  }

  el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:16px">Laden…</div>';

  try {
    const since = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
    const { data } = await db().from('sessions')
      .select('date,gym,routes,accounts!sessions_user_id_fkey(id,username,emoji,display_name)')
      .eq('is_public', true)
      .gte('date', since)
      .order('date', { ascending: false })
      .limit(200);

    if (!data?.length) {
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px">Geen publieke sessies de laatste 90 dagen</div>';
      return;
    }

    const userBest = {};
    for (const s of data) {
      const acc = s.accounts;
      if (!acc) continue;
      const uid = acc.id;
      const sent = (s.routes || []).filter(r => r.result !== 'poging');
      if (!sent.length) continue;
      const best = sent.reduce((b, r) => (window.GRADES||[]).indexOf(r.grade) > (window.GRADES||[]).indexOf(b.grade) ? r : b, sent[0]);
      if (!userBest[uid] || (window.GRADES||[]).indexOf(best.grade) > (window.GRADES||[]).indexOf(userBest[uid].grade)) {
        userBest[uid] = { id: uid, grade: best.grade, emoji: acc.emoji||'🧗', username: acc.username||'?', displayName: acc.display_name||acc.username||'?', gym: s.gym||'' };
      }
    }

    const sorted = Object.values(userBest).sort((a, b) => (window.GRADES||[]).indexOf(b.grade) - (window.GRADES||[]).indexOf(a.grade));
    const medals = ['🥇','🥈','🥉'];

    el.innerHTML = sorted.slice(0, 25).map((u, i) => {
      const gc = (window.GRADE_COLORS||[])[(window.GRADES||[]).indexOf(u.grade)] || 'var(--accent)';
      return `<div class="lb-row" onclick="showPublicProfile('${_s(u.id)}','${_s(u.username)}')">
        <div class="lb-rank">${medals[i] || (i + 1)}</div>
        <div class="lb-avatar">${_s(u.emoji)}</div>
        <div class="lb-info">
          <div class="lb-name">${_s(u.displayName || u.username)}</div>
          <div class="lb-sub">${_s(u.gym)}</div>
        </div>
        <div class="lb-grade" style="color:${gc}">${_s(u.grade)}</div>
      </div>`;
    }).join('');
  } catch(e) {
    console.warn('[social] leaderboard error:', e);
    el.innerHTML = '<div style="color:var(--danger);font-size:13px;text-align:center;padding:16px">Laden mislukt</div>';
  }
}

// ── USER SEARCH ───────────────────────────────────────────

async function renderUserSearch() {
  const input = document.getElementById('user-search-input');
  const el    = document.getElementById('user-search-results');
  if (!el || !input) return;

  const q = input.value.trim();
  if (q.length < 2) { el.innerHTML = ''; return; }
  if (!cloudReady()) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px">Cloud niet geconfigureerd</div>'; return; }

  const { data } = await db().from('accounts').select('id,username,emoji,display_name')
    .ilike('username', `%${q}%`).limit(8);

  if (!data?.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:12px">Geen klimmers gevonden</div>'; return; }

  // Batch-check follows in one query
  const me = await cloudCurrentUser();
  let followingSet = new Set();
  if (me) {
    const userIds = data.map(u => u.id);
    const { data: followData } = await db().from('follows')
      .select('following_id')
      .eq('follower_id', me.id)
      .in('following_id', userIds);
    followingSet = new Set((followData || []).map(f => f.following_id));
  }

  el.innerHTML = data.map(u => {
    const following = followingSet.has(u.id);
    return `<div class="user-result">
      <div class="user-result-avatar">${_s(u.emoji||'🧗')}</div>
      <div class="user-result-info">
        <div class="user-result-name">${_s(u.display_name || u.username)}</div>
        <div class="user-result-sub">@${_s(u.username)}</div>
      </div>
      <button class="btn-follow ${following ? 'btn-following' : ''}"
        onclick="${following ? 'socialUnfollow' : 'socialFollow'}('${u.id}', this)">
        ${following ? 'Gevolgd' : 'Volgen'}
      </button>
    </div>`;
  }).join('');
}

// ── SESSION: PUBLIC TOGGLE ────────────────────────────────

async function setSessionPublic(sessionId, isPublic) {
  const user = await cloudCurrentUser();
  if (!user) { if (typeof showAuthScreen === 'function') showAuthScreen(); return; }
  const session = (window.sessions || []).find(s => s.id === sessionId);
  if (!session) return;
  session.is_public = isPublic;
  if (typeof save === 'function') save();
  if (typeof cloudMarkDirty === 'function' && window.activeProfileId) cloudMarkDirty('sessions', window.activeProfileId);
  if (typeof cloudScheduleSync === 'function' && window.activeProfileId) cloudScheduleSync(window.activeProfileId, 1000);
  if (typeof toast === 'function') toast(isPublic ? 'Sessie openbaar' : 'Sessie privé', 'var(--accent)');
  if (typeof renderFeed === 'function') renderFeed();
}

async function loadFeedKudos() {
  if (!cloudReady()) return;
  const btns = document.querySelectorAll('[id^="kudos-sess-"]');
  if (!btns.length) return;
  const cids = Array.from(btns).map(b => b.dataset.cid).filter(Boolean);
  if (!cids.length) return;
  try {
    const user = await cloudCurrentUser();
    const { data: kudosData } = await db().from('kudos')
      .select('session_id,from_user_id')
      .in('session_id', cids);
    const kudosMap = {};
    for (const k of (kudosData || [])) {
      if (!kudosMap[k.session_id]) kudosMap[k.session_id] = { count: 0, mine: false };
      kudosMap[k.session_id].count++;
      if (user && k.from_user_id === user.id) kudosMap[k.session_id].mine = true;
    }
    for (const btn of btns) {
      const cid = btn.dataset.cid;
      if (!cid) continue;
      const info = kudosMap[cid] || { count: 0, mine: false };
      const cnt = btn.querySelector('.kudos-n');
      if (cnt) cnt.textContent = info.count;
      btn.classList.toggle('kudos-active', info.mine);
    }
  } catch(e) {
    console.warn('[social] feed kudos error:', e);
    for (const btn of btns) {
      const cnt = btn.querySelector('.kudos-n');
      if (cnt) cnt.textContent = '0';
    }
  }
}

// ── HELPERS ──────────────────────────────────────────────

function _s(v) { return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
