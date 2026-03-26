// ═══════════════════════════════════════════
//  ★ 카드 편집 오버레이
// ═══════════════════════════════════════════
function openEdit(key) {
  const el = document.getElementById('edit-' + key);
  if (!el) return;
  const d  = state[key] || {};
  const vi = document.getElementById('inp-' + key + '-val');
  const mi = document.getElementById('inp-' + key + '-memo');
  if (vi) vi.value = d.val  || '';
  if (mi) mi.value = d.memo || '';
  const ji = document.getElementById('inp-' + key + '-jeonse');
  if (ji) ji.value = d.jeonse || '';
  el.classList.add('open');
}

function closeEdit(key) {
  const el = document.getElementById('edit-' + key);
  if (el) el.classList.remove('open');
}

function saveEdit(key) {
  const vi = document.getElementById('inp-' + key + '-val');
  const mi = document.getElementById('inp-' + key + '-memo');
  if (!state[key]) state[key] = {};
  if (vi) state[key].val  = parseFloat(vi.value) || 0;
  if (mi) state[key].memo = mi.value;
  const ji = document.getElementById('inp-' + key + '-jeonse');
  if (ji) state[key].jeonse = parseFloat(ji.value) || 0;
  save();
  renderAll();
  closeEdit(key);
}

// ═══════════════════════════════════════════
//  ★ 목표 자산 설정
// ═══════════════════════════════════════════
function openGoalEdit() {
  document.getElementById('inp-goal-name').value       = goal.name      || '';
  document.getElementById('inp-goal-target').value     = goal.target    || '';
  document.getElementById('inp-goal-fin-name').value   = goal.finName   || '';
  document.getElementById('inp-goal-fin-target').value = goal.finTarget || '';
  document.getElementById('goal-edit-overlay').style.display = 'flex';
}

function closeGoalEdit() {
  document.getElementById('goal-edit-overlay').style.display = 'none';
}

function saveGoal() {
  goal.name      = document.getElementById('inp-goal-name').value       || '총 목표자산';
  goal.target    = parseFloat(document.getElementById('inp-goal-target').value)     || 0;
  goal.finName   = document.getElementById('inp-goal-fin-name').value   || '금융 목표자산';
  goal.finTarget = parseFloat(document.getElementById('inp-goal-fin-target').value) || 0;
  localStorage.setItem('asset-goal', JSON.stringify(goal));
  scheduleGasSync_();
  updateGoal();
  closeGoalEdit();
}

// ═══════════════════════════════════════════
//  ★ 저장
// ═══════════════════════════════════════════
function save() {
  localStorage.setItem('asset-dashboard-v3', JSON.stringify(state));
  scheduleGasSync_();
}

// ═══════════════════════════════════════════
//  ★ 날짜 표시
// ═══════════════════════════════════════════
function setDate() {
  const d = new Date();
  document.getElementById('today-date').textContent =
    d.toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric', weekday:'long' });
}

// ═══════════════════════════════════════════
//  ★ 초기화
// ═══════════════════════════════════════════
function init() {
  const url    = _fbUrl();
  const syncEl = document.getElementById('gas-sync-status');

  if (url) {
    if (syncEl) { syncEl.textContent = '☁ 연결 중...'; syncEl.style.color = 'var(--text3)'; }
    fetchFromFirebase_()
      .then(function(data) {
        if (data) {
          try {
            var changed = mergeGasData_(data);
            if (changed) {
              _syncStatus('☁ 동기화됨', 'var(--teal)');
              setTimeout(pushToGAS_, 1000);
            } else {
              if (syncEl) syncEl.textContent = '';
            }
          } catch(e) { console.warn('Firebase 데이터 적용 오류:', e); }
        } else {
          if (syncEl) syncEl.textContent = '';
        }
        _initCore();
      })
      .catch(function(err) {
        console.warn('Firebase 연결 실패 → localStorage 사용:', err.message);
        if (syncEl) syncEl.textContent = '';
        _initCore();
      });
  } else {
    _initCore();
  }
}

function _initCore() {
  const saved       = localStorage.getItem('asset-dashboard-v3');
  if (saved)        state  = JSON.parse(saved);
  const savedTodos  = localStorage.getItem('asset-todos');
  if (savedTodos)   todos  = JSON.parse(savedTodos);
  const savedGoal   = localStorage.getItem('asset-goal');
  if (savedGoal)    goal   = JSON.parse(savedGoal);
  const savedKiwoom = localStorage.getItem('kiwoom-data');
  if (savedKiwoom)  kiData = JSON.parse(savedKiwoom);

  setDate();
  initCharts();
  renderAll();
  addDefaultTodos();
  renderTodos();
  if (kiData) renderKiwoom();
}

// ★ 페이지 로드 시 실행 — Firebase 인증 확인 후 앱 초기화
checkAndInitAuth_(init);

// ═══════════════════════════════════════════
//  ★ 토스 잔고 이력 시드 (콘솔 전용)
//  사용법: seedTossHistory(`일자\t해외\t...\n2021-11-24\t-\t...`)
// ═══════════════════════════════════════════
function seedTossHistory(tsvText) {
  const COL_MAP = { '해외':'toss-overseas', '개인연금저축':'toss-pension', '오빌':'toss-obil', '연습':'toss-practice' };
  const lines = tsvText.trim().split(/\r?\n/);
  let headerIdx = -1;
  const colIdx = { _date: -1 };

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim());
    const di = cells.findIndex(c => c === '일자');
    if (di >= 0) {
      headerIdx = i; colIdx._date = di;
      cells.forEach((c, j) => { if (COL_MAP[c]) colIdx[COL_MAP[c]] = j; });
      break;
    }
  }
  if (headerIdx < 0) { console.error('[seedTossHistory] 헤더에 "일자" 열을 찾을 수 없습니다.'); return; }

  const th = {};
  Object.values(COL_MAP).forEach(k => { th[k] = {}; });

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim());
    const dateStr = cells[colIdx._date] || '';
    if (!dateStr || !/^\d{4}-\d{2}/.test(dateStr)) continue;
    const ym = dateStr.slice(0, 7);
    Object.values(COL_MAP).forEach(k => {
      const j = colIdx[k];
      if (j === undefined || j < 0 || j >= cells.length) return;
      const raw = cells[j];
      if (!raw || raw === '-' || raw === '—') return;
      const num = parseInt(raw.replace(/,/g, '').replace(/\s/g, ''), 10);
      if (!isNaN(num)) th[k][ym] = Math.max(0, num);
    });
  }

  if (!kiData) { console.error('[seedTossHistory] kiData 없음. 먼저 스냅샷을 적용하세요.'); return; }
  kiData.tossHistory = th;
  localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  if (typeof updateLineChart === 'function') updateLineChart();

  Object.entries(COL_MAP).forEach(([label, k]) => {
    const months = Object.keys(th[k]).sort();
    console.log(`[seedTossHistory] ${label}(${k}): ${months.length}개월 (${months[0] || '—'} ~ ${months[months.length-1] || '—'})`);
  });
  console.log('[seedTossHistory] ✅ 완료. 엑셀 내보내기 또는 차트를 확인하세요.');
}
