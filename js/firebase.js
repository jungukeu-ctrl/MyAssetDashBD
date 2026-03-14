// ═══════════════════════════════════════════
//  ★ Firebase 동기화
//  저장: PUT https://<db>/asset-data.json
//  읽기: GET https://<db>/asset-data.json
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

// ── 스마트 병합 (per-key date 비교) ──────────────────
function mergeGasData_(remote) {
  var changed = false;

  // 1. state per-key 병합
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

  // 2. kiwoom 병합 (month 기준)
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

  // 3. todos/goal: exportedAt 최신 쪽 채택
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

// ── 저장 ─────────────────────────────────────────────
function pushToGAS_() {
  var url = _fbUrl();
  if (!url) return;
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

  fetch(url, {
    method:  'PUT',
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

// ── 읽기 ─────────────────────────────────────────────
function fetchFromFirebase_() {
  var url = _fbUrl();
  if (!url) return Promise.resolve(null);
  return fetch(url).then(function(res) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  });
}

// ── 수동 동기화 버튼 ──────────────────────────────────
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
