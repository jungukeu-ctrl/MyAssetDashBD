// ═══════════════════════════════════════════
//  ★ Firebase 동기화 + 이메일/비밀번호 인증
//  저장: PATCH https://<db>/asset-data.json
//  읽기: GET   https://<db>/asset-data.json
//  인증: Firebase Auth REST API → ?auth=<idToken>
// ═══════════════════════════════════════════

// ─── Auth 상수 ───────────────────────────────────────────────────
const _AUTH_URL    = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FIREBASE_API_KEY;
const _REFRESH_URL = 'https://securetoken.googleapis.com/v1/token?key=' + FIREBASE_API_KEY;
const _LS_TOKEN    = 'fb_id_token';
const _LS_REFRESH  = 'fb_refresh_token';
const _LS_EXPIRY   = 'fb_token_expiry';

let _onAuthReady_ = null;

// ─── 토큰 저장 ───────────────────────────────────────────────────
function _saveTokens_(idToken, refreshToken, expiresIn) {
  localStorage.setItem(_LS_TOKEN,   idToken);
  localStorage.setItem(_LS_REFRESH, refreshToken);
  localStorage.setItem(_LS_EXPIRY,  String(Date.now() + (Number(expiresIn) - 60) * 1000));
}

// ─── 토큰 갱신 ───────────────────────────────────────────────────
async function _refreshIdToken_() {
  const rt = localStorage.getItem(_LS_REFRESH);
  if (!rt) throw new Error('no_refresh_token');
  const res = await fetch(_REFRESH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ grant_type: 'refresh_token', refresh_token: rt }),
  });
  if (!res.ok) throw new Error('refresh_failed');
  const d = await res.json();
  _saveTokens_(d.id_token, d.refresh_token, d.expires_in);
  return d.id_token;
}

// ─── 유효 토큰 반환 (만료 시 자동 갱신) ─────────────────────────
async function _getValidToken_() {
  const token  = localStorage.getItem(_LS_TOKEN);
  const expiry = Number(localStorage.getItem(_LS_EXPIRY) || '0');
  if (token && Date.now() < expiry) return token;
  return _refreshIdToken_();
}

// ─── 로그인 버튼 핸들러 ──────────────────────────────────────────
async function doLogin() {
  const email = (document.getElementById('login-email') || {}).value || '';
  const pw    = (document.getElementById('login-pw')    || {}).value || '';
  const btn   = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  if (!email || !pw) { _showLoginError_('이메일과 비밀번호를 입력하세요.'); return; }
  if (btn)   { btn.textContent = '로그인 중...'; btn.disabled = true; }
  if (errEl) errEl.style.display = 'none';
  try {
    const res = await fetch(_AUTH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password: pw, returnSecureToken: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      const code = (data.error && data.error.message) || '';
      throw new Error(
        (code === 'INVALID_LOGIN_CREDENTIALS' || code === 'EMAIL_NOT_FOUND' || code === 'INVALID_PASSWORD')
          ? '이메일 또는 비밀번호가 올바르지 않습니다.'
          : '로그인 실패: ' + (code || res.status)
      );
    }
    _saveTokens_(data.idToken, data.refreshToken, data.expiresIn);
    _hideLoginOverlay_();
    if (_onAuthReady_) _onAuthReady_();
  } catch (err) {
    _showLoginError_(err.message);
  } finally {
    if (btn) { btn.textContent = '로그인'; btn.disabled = false; }
  }
}

// ─── 로그아웃 ────────────────────────────────────────────────────
function doLogout() {
  localStorage.removeItem(_LS_TOKEN);
  localStorage.removeItem(_LS_REFRESH);
  localStorage.removeItem(_LS_EXPIRY);
  _showLoginOverlay_();
}

// ─── 오버레이 UI ─────────────────────────────────────────────────
function _showLoginOverlay_() {
  const el = document.getElementById('login-overlay');
  if (el) el.style.display = 'flex';
}

function _hideLoginOverlay_() {
  const el = document.getElementById('login-overlay');
  if (el) el.style.display = 'none';
}

function _showLoginError_(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// ─── 앱 초기화 진입점 (init.js에서 호출) ─────────────────────────
async function checkAndInitAuth_(callback) {
  _onAuthReady_ = callback;
  try {
    await _getValidToken_();
    _hideLoginOverlay_();
    callback();
  } catch {
    _showLoginOverlay_();
  }
}

// ═══════════════════════════════════════════
//  ★ Firebase DB
// ═══════════════════════════════════════════
let _fbSyncTimer = null;

function _fbUrl() {
  return (typeof FIREBASE_URL !== 'undefined') && FIREBASE_URL &&
         FIREBASE_URL !== 'YOUR_FIREBASE_URL'
    ? FIREBASE_URL.replace(/\/$/, '') + '/asset-data.json'
    : null;
}

function _syncStatus(msg, color) {
  const el = document.getElementById('gas-sync-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || 'var(--teal)';
  if (msg) setTimeout(() => { el.textContent = ''; }, 4000);
}

function scheduleGasSync_() {
  clearTimeout(_fbSyncTimer);
  _fbSyncTimer = setTimeout(pushToGAS_, 2000);
}

// ── 스마트 병합 (per-key date 비교) ──────────────────────────────
function mergeGasData_(remote) {
  var changed = false;

  var localState = {};
  try { localState = JSON.parse(localStorage.getItem('asset-dashboard-v3') || '{}'); } catch(e) {}
  var remoteState = remote.state || {};
  var mergedState = Object.assign({}, localState);
  Object.keys(remoteState).forEach(function(key) {
    var rv = remoteState[key];
    var lv = localState[key];
    if (!lv) { mergedState[key] = rv; changed = true; return; }
    var rd = (rv && rv.date) ? rv.date : '';
    var ld = (lv && lv.date) ? lv.date : '';
    if (rd > ld) { mergedState[key] = rv; changed = true; }
  });
  if (changed) localStorage.setItem('asset-dashboard-v3', JSON.stringify(mergedState));

  var localKi = null;
  try { localKi = JSON.parse(localStorage.getItem('kiwoom-data') || 'null'); } catch(e) {}
  var remoteKi = remote.kiwoom;
  if (remoteKi && remoteKi.combined) {
    var base = (localKi && localKi.combined) ? localKi.combined : [];
    var monthMap = {};
    base.forEach(function(row) { monthMap[row.month] = row; });
    var kiChanged = false;
    remoteKi.combined.forEach(function(rrow) {
      var lrow = monthMap[rrow.month];
      if (!lrow) { monthMap[rrow.month] = rrow; kiChanged = true; return; }
      if ((rrow.date || '') > (lrow.date || '')) { monthMap[rrow.month] = rrow; kiChanged = true; }
    });
    if (kiChanged) {
      var merged = Object.keys(monthMap).sort().map(function(m) { return monthMap[m]; });
      var newKi  = Object.assign({}, localKi || remoteKi, { combined: merged });
      localStorage.setItem('kiwoom-data', JSON.stringify(newKi));
      changed = true;
    }
  }

  var localTs  = localStorage.getItem('asset-dashboard-ts') || '0';
  var remoteTs = remote.exportedAt || '0';
  if (remoteTs > localTs) {
    if (remote.todos) localStorage.setItem('asset-todos', JSON.stringify(remote.todos));
    if (remote.goal)  localStorage.setItem('asset-goal',  JSON.stringify(remote.goal));
    localStorage.setItem('asset-dashboard-ts', remoteTs);
    changed = true;
  }

  return changed;
}

// ── 저장 (토큰 포함) ─────────────────────────────────────────────
async function pushToGAS_() {
  var url = _fbUrl();
  if (!url) return;
  var token;
  try { token = await _getValidToken_(); }
  catch { _syncStatus('⚠ 세션 만료', 'var(--orange)'); doLogout(); return; }

  var ts = new Date().toISOString();
  var payload = {
    version:    1,
    state:      JSON.parse(localStorage.getItem('asset-dashboard-v3') || 'null'),
    todos:      JSON.parse(localStorage.getItem('asset-todos')        || 'null'),
    goal:       JSON.parse(localStorage.getItem('asset-goal')         || 'null'),
    kiwoom:     JSON.parse(localStorage.getItem('kiwoom-data')        || 'null'),
    exportedAt: ts,
  };
  localStorage.setItem('asset-dashboard-ts', ts);
  _syncStatus('☁ 저장 중...', 'var(--text3)');

  fetch(url + '?auth=' + encodeURIComponent(token), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  .then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _syncStatus('☁ 저장됨', 'var(--teal)');
  })
  .catch(function(err) {
    console.warn('Firebase 저장 실패:', err.message);
    _syncStatus('⚠ 저장 실패', 'var(--orange)');
  });
}

// ── 읽기 (토큰 포함) ─────────────────────────────────────────────
async function fetchFromFirebase_() {
  var url = _fbUrl();
  if (!url) return null;
  var token;
  try { token = await _getValidToken_(); }
  catch { return null; }
  const res = await fetch(url + '?auth=' + encodeURIComponent(token));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// ── 수동 동기화 버튼 ──────────────────────────────────────────────
function manualSync() {
  var url = _fbUrl();
  if (!url) { alert('FIREBASE_URL이 설정되지 않았습니다.'); return; }
  var btn = document.getElementById('manual-sync-btn');
  if (btn) { btn.textContent = '⏳ 연결 중...'; btn.disabled = true; }
  _syncStatus('☁ 동기화 중...', 'var(--text3)');

  fetchFromFirebase_()
    .then(function(data) {
      if (!data) { _syncStatus('☁ 데이터 없음', 'var(--text3)'); return; }
      var changed = mergeGasData_(data);
      state  = JSON.parse(localStorage.getItem('asset-dashboard-v3') || '{}');
      kiData = JSON.parse(localStorage.getItem('kiwoom-data') || 'null');
      renderAll();
      if (changed) {
        _syncStatus('☁ 동기화됨 ✓', 'var(--teal)');
        setTimeout(pushToGAS_, 500);
      } else {
        _syncStatus('☁ 이미 최신', 'var(--teal)');
      }
    })
    .catch(function(err) {
      console.warn('동기화 실패:', err.message);
      _syncStatus('⚠ 연결 실패', 'var(--orange)');
    })
    .finally(function() {
      if (btn) { btn.textContent = '☁ 동기화'; btn.disabled = false; }
    });
}
