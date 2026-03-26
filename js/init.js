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

// ═══════════════════════════════════════════
//  ★ 토스 잔고 이력 시드 데이터 (2021-11 ~ 2026-02)
// ═══════════════════════════════════════════
const _TOSS_HISTORY_SEED = {
  'toss-overseas': { '2023-04': 450000, '2023-05': 1900000, '2023-06': 450000, '2023-07': 450000, '2023-08': 450000, '2023-09': 450000, '2023-10': 940000, '2023-11': 940000, '2023-12': 840000, '2024-01': 740000, '2024-02': 740000, '2024-03': 1240000, '2024-04': 300000, '2024-05': 300000, '2024-06': 800000, '2024-07': 600000, '2024-09': 400000, '2024-10': 600000, '2024-11': 1100000, '2024-12': 1600000, '2025-01': 2100000, '2025-02': 2450000, '2025-03': 2520000, '2025-04': 2450000, '2025-05': 2410000, '2025-06': 5201470, '2025-07': 2634160, '2025-08': 2537559, '2025-09': 2560185, '2025-10': 2463531, '2025-11': 2486107, '2025-12': 2508573, '2026-01': 2411394, '2026-02': 2433532 },
  'toss-pension':  { '2024-04': 2000000, '2024-05': 2500000, '2024-06': 2850000, '2024-07': 2750000, '2024-08': 2800000, '2024-09': 2210000, '2024-10': 1210000, '2024-11': 510000, '2024-12': 500000, '2025-01': 400000, '2025-02': 420000, '2025-03': 440000, '2025-04': 460000, '2025-05': 380120, '2025-06': 400393, '2025-07': 420652, '2025-08': 380084, '2025-09': 400340, '2025-10': 300720, '2025-11': 380063, '2025-12': 400333, '2026-01': 40557, '2026-02': 380623 },
  'toss-obil':     { '2021-11': 30011005, '2021-12': 30011005, '2022-01': 30011005, '2022-02': 30000000, '2022-03': 30000000, '2022-05': 30000000, '2022-06': 28350000, '2022-07': 12000000, '2022-08': 11000000, '2022-09': 9900000, '2022-10': 9600000, '2022-11': 8350000, '2022-12': 7600000, '2023-01': 6600000, '2023-02': 6300000, '2023-03': 4300000, '2023-04': 3800000, '2023-05': 2600000, '2023-06': 1700000, '2023-07': 7400000, '2023-08': 6100000, '2023-09': 5100000, '2023-10': 5170000, '2023-11': 4170000, '2023-12': 3470000, '2024-01': 2670000, '2024-02': 2370000, '2024-03': 1870000, '2024-04': 1719000, '2024-05': 1519000, '2024-06': 1119000, '2024-07': 720000, '2024-08': 230000, '2024-09': 60000, '2024-12': 28090208, '2025-01': 28070208, '2025-02': 7690208, '2025-03': 11270208, '2025-04': 1825208, '2025-05': 3675208, '2025-06': 8961478, '2025-07': 4800475, '2025-08': 5405151, '2025-09': 5761948, '2025-10': 6718080, '2025-11': 7324995, '2025-12': 7932157, '2026-01': 8480560, '2026-02': 8298542 },
  'toss-practice': { '2021-11': 2000511, '2021-12': 2000511, '2022-01': 2000511, '2022-02': 4000511, '2022-03': 4000511, '2022-05': 2200511, '2022-06': 2200511, '2022-07': 2200511, '2022-08': 5376291, '2022-09': 4876291, '2022-10': 4676291, '2022-11': 4411291, '2022-12': 4411291, '2023-01': 3591291, '2023-02': 3612846, '2023-03': 3512846, '2023-04': 3512846, '2023-05': 3512846, '2023-06': 3512846, '2023-07': 3512846, '2023-08': 3512846, '2023-09': 768843, '2023-10': 757792, '2023-11': 757792, '2023-12': 757792, '2024-01': 757792, '2024-02': 1600000, '2024-03': 900000, '2024-04': 900000, '2024-05': 900000, '2024-06': 900000, '2024-07': 900000, '2024-08': 900000, '2024-09': 900000, '2024-10': 400000, '2024-11': 800000, '2024-12': 900000, '2025-01': 900000, '2025-02': 900000, '2025-03': 900000, '2025-04': 900000, '2025-05': 900000, '2025-06': 900000, '2025-07': 900000, '2025-08': 900000, '2025-09': 900000, '2025-10': 926584, '2025-11': 926584, '2025-12': 926584, '2026-01': 926584, '2026-02': 926584 },
};

function _applyTossHistorySeed(ki) {
  if (!ki) return;
  if (!ki.tossHistory) ki.tossHistory = {};
  const keys = ['toss-overseas', 'toss-pension', 'toss-obil', 'toss-practice'];
  keys.forEach(k => {
    if (!ki.tossHistory[k]) ki.tossHistory[k] = {};
    // Fill in months from seed that are not already present
    Object.entries(_TOSS_HISTORY_SEED[k]).forEach(([ym, val]) => {
      if (!(ym in ki.tossHistory[k])) ki.tossHistory[k][ym] = val;
    });
  });
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

  // Auto-seed tossHistory from hardcoded data if missing
  if (kiData) {
    _applyTossHistorySeed(kiData);
    localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  }

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
