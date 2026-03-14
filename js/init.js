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

// ★ 페이지 로드 시 실행
init();
