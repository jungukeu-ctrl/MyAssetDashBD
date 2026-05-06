// ═══════════════════════════════════════════
//  ★ 결정 기록 — Firebase /asset-data/decisions
//  경로: asset-data/decisions/{YYYY-MM-DD}
// ═══════════════════════════════════════════

let _decisionsData = null;

function _fbDecisionsUrl() {
  return (typeof FIREBASE_URL !== 'undefined') && FIREBASE_URL &&
         FIREBASE_URL !== 'YOUR_FIREBASE_URL'
    ? FIREBASE_URL.replace(/\/$/, '') + '/asset-data/decisions.json'
    : null;
}

async function fetchDecisions_() {
  var url = _fbDecisionsUrl();
  if (!url) return null;
  var token;
  try { token = await _getValidToken_(); } catch (e) { return null; }
  var res = await fetch(url + '?auth=' + encodeURIComponent(token));
  if (!res.ok) return null;
  return res.json();
}

async function saveDecisionEntry_(dateKey, entry) {
  var url = _fbDecisionsUrl();
  if (!url) return;
  var token;
  try { token = await _getValidToken_(); } catch (e) { return; }
  var payload = {};
  payload[dateKey] = entry;
  fetch(url + '?auth=' + encodeURIComponent(token), {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  }).catch(function(err) {
    console.warn('결정 저장 실패:', err.message);
  });
}

async function initDecisions() {
  try {
    var data = await fetchDecisions_();
    _decisionsData = data || {};
  } catch(e) {
    _decisionsData = {};
  }
}

function _decTodayKST() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

function openDecisionModal() {
  document.getElementById('decision-date-label').textContent = _decTodayKST();
  document.getElementById('decision-signal').value = '';
  var ca = document.getElementById('decision-choice-a');
  if (ca) ca.checked = true;
  document.getElementById('decision-summary').value = '';
  var errEl = document.getElementById('decision-error');
  if (errEl) errEl.textContent = '';
  document.getElementById('decision-modal').style.display = 'flex';
}

function closeDecisionModal() {
  document.getElementById('decision-modal').style.display = 'none';
}

async function saveDecisionRecord() {
  var today   = _decTodayKST();
  var signal  = document.getElementById('decision-signal').value;
  var chEl    = document.querySelector('input[name="decision-choice-r"]:checked');
  var choice  = chEl ? chEl.value : 'A';
  var summary = document.getElementById('decision-summary').value.trim();
  var errEl   = document.getElementById('decision-error');

  if (!summary) {
    if (errEl) { errEl.textContent = '요약을 입력하세요.'; errEl.style.color = 'var(--red)'; }
    return;
  }

  var kstISO = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, -1) + '+09:00';
  var entry  = { signal: signal, choice: choice, summary: summary, timestamp: kstISO };

  if (!_decisionsData) _decisionsData = {};
  _decisionsData[today] = entry;
  await saveDecisionEntry_(today, entry);

  // 상추 카드 즉시 갱신
  var signalEl = document.getElementById('sc-signal');
  var choiceEl = document.getElementById('sc-choice');
  if (signalEl) signalEl.textContent = signal || '—';
  if (choiceEl) {
    var lbl = choice === 'A' ? '관찰' : choice === 'B' ? '분할매수' : '매도섞기';
    choiceEl.textContent = choice + '(' + lbl + ')';
  }

  // sangchu journal 동기화 (카드 렌더링 데이터 일관성 유지)
  if (typeof _sangchuData !== 'undefined' && _sangchuData) {
    _sangchuData.journal = Object.assign({}, _sangchuData.journal || {});
    _sangchuData.journal[today] = { signal: signal, choice: choice, memo: summary };
    if (typeof saveSangchuData_ === 'function') {
      saveSangchuData_({ journal: _sangchuData.journal });
    }
  }

  closeDecisionModal();
  if (typeof showClaudeShareToast === 'function') {
    showClaudeShareToast('✅ 오늘 결정이 저장되었습니다.');
  }
}
