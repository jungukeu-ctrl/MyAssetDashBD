// ═══════════════════════════════════════════
//  ★ 오빌 손실상쇄 추적 — obilTracer.js
//  알에프텍 누적손실 vs 대체오빌 종목 누적수익 상쇄 추적
// ═══════════════════════════════════════════

const OBIL_TRACER_INIT = {
  trackingStartDate: '2026-03-20',
  rf: {
    stock:          '알에프텍',
    qty:            3140,
    avgPrice:       17557,
    realizedPnLCum: -2769033,
    lastUpdated:    '2026-06-19',
  },
  substitute: {
    currentStock:              '우리기술',
    qty:                       4,
    avgPrice:                  14780,
    realizedPnLCumAllStocks:   -29823,
    lastUpdated:               '2026-06-19',
    history: {
      '성호전자': { period: '2026-05-08~2026-06-18', realizedPnL: -30093, status: '종료' },
      '우리기술': { period: '2026-06-19~',           realizedPnL: 270,    status: '진행중' },
    },
  },
  log: {
    '2026-06-19': {
      rfQty:                      3140,
      rfAvgPrice:                 17557,
      rfRealizedPnLCum:           -2769033,
      subStock:                   '우리기술',
      subQty:                     4,
      subAvgPrice:                14780,
      subRealizedPnLCumAllStocks: -29823,
    },
  },
};

let _obilTracerData = null;

// ─── KST 오늘 날짜 ────────────────────────────────────────────
function _todayKSTOt() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

// ─── 파생 계산 ────────────────────────────────────────────────
function _calcOt() {
  if (!_obilTracerData) return { offsetAmount: 0, offsetRatio: null };
  var sub          = _obilTracerData.substitute.realizedPnLCumAllStocks;
  var rf           = _obilTracerData.rf.realizedPnLCum;
  var offsetAmount = Math.max(0, sub);
  var offsetRatio  = rf === 0 ? null : (offsetAmount / Math.abs(rf)) * 100;
  return { offsetAmount: offsetAmount, offsetRatio: offsetRatio };
}

// ─── 초기화 (init.js _initCore() 에서 호출) ───────────────────
async function initObilTracer() {
  try {
    var remote = await fetchObilTracerData_();
    if (remote && remote.rf) {
      _obilTracerData = remote;
    } else {
      _obilTracerData = JSON.parse(JSON.stringify(OBIL_TRACER_INIT));
      await saveObilTracerData_(_obilTracerData);
    }
  } catch (e) {
    _obilTracerData = JSON.parse(JSON.stringify(OBIL_TRACER_INIT));
  }
  renderObilTracer();
}

// ─── 카드 렌더링 ──────────────────────────────────────────────
function renderObilTracer() {
  if (!_obilTracerData) return;
  var rf   = _obilTracerData.rf;
  var sub  = _obilTracerData.substitute;
  var calc = _calcOt();

  var rfEl = document.getElementById('ot-rf-pnl');
  if (rfEl) {
    rfEl.textContent = rf.realizedPnLCum.toLocaleString() + '원';
    rfEl.className   = 'sc-val ' + (rf.realizedPnLCum < 0 ? 'sc-loss' : 'sc-profit');
  }

  var subEl = document.getElementById('ot-sub-pnl');
  if (subEl) {
    subEl.textContent = sub.realizedPnLCumAllStocks.toLocaleString() + '원';
    subEl.className   = 'sc-val ' + (sub.realizedPnLCumAllStocks < 0 ? 'sc-loss' : 'sc-profit');
  }

  var subStockEl = document.getElementById('ot-sub-stock');
  if (subStockEl) subStockEl.textContent = sub.currentStock;

  var ratioEl = document.getElementById('ot-offset-ratio');
  if (ratioEl) {
    var ratio = calc.offsetRatio;
    ratioEl.textContent = ratio === null ? '—' : ratio.toFixed(1) + '%';
    ratioEl.className   = 'sc-val' + (ratio !== null && ratio >= 50 ? ' sc-profit' : '');
  }

  var detailEl = document.getElementById('ot-detail');
  if (detailEl) {
    detailEl.innerHTML =
      rf.stock + ': ' + rf.avgPrice.toLocaleString() + '원 × ' + rf.qty.toLocaleString() + '주' +
      ' &nbsp;|&nbsp; ' +
      sub.currentStock + ': ' + sub.avgPrice.toLocaleString() + '원 × ' + sub.qty.toLocaleString() + '주' +
      '<br>마지막 갱신: ' + sub.lastUpdated;
  }
}

// ─── 모달 열기/닫기 ───────────────────────────────────────────
function openObilTracerModal() {
  if (!_obilTracerData) return;
  var ta = document.getElementById('ot-json-area');
  if (ta) ta.value = '';
  document.getElementById('ot-parse-result').innerHTML  = '';
  document.getElementById('ot-apply-preview').innerHTML = '';
  document.getElementById('ot-new-stock').value         = '';
  document.getElementById('ot-parse-error').textContent = '';
  var btn = document.getElementById('ot-apply-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; }
  document._obilTracerParsed = null;
  document.getElementById('obil-tracer-modal').style.display = 'flex';
}

function closeObilTracerModal() {
  document.getElementById('obil-tracer-modal').style.display = 'none';
}

// ─── JSON 파싱 (textarea oninput) ─────────────────────────────
function parseObilTracerJson() {
  var errEl     = document.getElementById('ot-parse-error');
  var resultEl  = document.getElementById('ot-parse-result');
  var previewEl = document.getElementById('ot-apply-preview');
  var applyBtn  = document.getElementById('ot-apply-btn');
  errEl.textContent    = '';
  resultEl.innerHTML   = '';
  previewEl.innerHTML  = '';
  applyBtn.disabled    = true;
  applyBtn.style.opacity = '0.5';
  document._obilTracerParsed = null;

  var raw = document.getElementById('ot-json-area').value.trim();
  if (!raw) return;

  var json;
  try { json = JSON.parse(raw); } catch (e) {
    errEl.textContent = 'JSON 형식이 올바르지 않습니다: ' + e.message;
    return;
  }

  if (!json.rows || !Array.isArray(json.rows)) {
    errEl.textContent = 'rows 배열이 없습니다.';
    return;
  }

  var d        = _obilTracerData;
  var RF_STOCK  = d.rf.stock;
  var SUB_STOCK = d.substitute.currentStock;

  var rfRows  = json.rows.filter(function(r) { return r.stock === RF_STOCK; });
  var subRows = json.rows.filter(function(r) { return r.stock === SUB_STOCK; });
  var ignored = json.rows.filter(function(r) { return r.stock !== RF_STOCK && r.stock !== SUB_STOCK; });

  var rfDelta  = rfRows.reduce(function(s, r)  { return s + r.pnl; }, 0);
  var subDelta = subRows.reduce(function(s, r) { return s + r.pnl; }, 0);

  // 중복 기간 경고
  if (json.periodFrom && d.rf.lastUpdated && json.periodFrom <= d.rf.lastUpdated) {
    errEl.textContent = '⚠ 이미 반영된 기간과 겹칩니다 (periodFrom: ' + json.periodFrom +
      ' ≤ lastUpdated: ' + d.rf.lastUpdated + ') — 중복 계산 위험';
  }

  if (json.rows.length === 0) {
    var prev = errEl.textContent;
    errEl.textContent = (prev ? prev + ' / ' : '') + '추출된 거래 내역이 없습니다 (증분 0으로 적용됩니다)';
  }

  // 파싱 결과 미리보기
  var ignoredText = ignored.length
    ? '<div style="color:var(--orange);margin-top:4px">⚠ 무시된 행: ' +
      ignored.map(function(r) { return r.stock; }).join(', ') + ' ' + ignored.length + '건</div>'
    : '';

  resultEl.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:4px;font-size:12px;font-family:\'DM Mono\',monospace">' +
    '<div>' + RF_STOCK + ' 증분: <span style="color:' + (rfDelta < 0 ? 'var(--blue)' : 'var(--red)') + '">' +
      (rfDelta >= 0 ? '+' : '') + rfDelta.toLocaleString() + '원</span></div>' +
    '<div>' + SUB_STOCK + '(현재) 증분: <span style="color:' + (subDelta < 0 ? 'var(--blue)' : 'var(--red)') + '">' +
      (subDelta >= 0 ? '+' : '') + subDelta.toLocaleString() + '원</span></div>' +
    ignoredText + '</div>';

  // 적용 후 미리보기
  var newRfPnL  = d.rf.realizedPnLCum + rfDelta;
  var newSubPnL = d.substitute.realizedPnLCumAllStocks + subDelta;
  var newOffset = Math.max(0, newSubPnL);
  var newRatio  = newRfPnL === 0 ? null : (newOffset / Math.abs(newRfPnL)) * 100;
  var oldOffset = Math.max(0, d.substitute.realizedPnLCumAllStocks);
  var oldRatio  = d.rf.realizedPnLCum === 0 ? null : (oldOffset / Math.abs(d.rf.realizedPnLCum)) * 100;

  previewEl.innerHTML =
    '<div style="font-size:12px;font-family:\'DM Mono\',monospace;display:flex;flex-direction:column;gap:4px">' +
    '<div>' + RF_STOCK + ' 누적: ' + d.rf.realizedPnLCum.toLocaleString() +
      ' → <strong style="color:' + (newRfPnL < 0 ? 'var(--blue)' : 'var(--red)') + '">' +
      newRfPnL.toLocaleString() + '</strong></div>' +
    '<div>상쇄종목누적: ' + d.substitute.realizedPnLCumAllStocks.toLocaleString() +
      ' → <strong style="color:' + (newSubPnL < 0 ? 'var(--blue)' : 'var(--red)') + '">' +
      newSubPnL.toLocaleString() + '</strong></div>' +
    '<div>상쇄율: ' + (oldRatio === null ? '—' : oldRatio.toFixed(1) + '%') +
      ' → <strong>' + (newRatio === null ? '—' : newRatio.toFixed(1) + '%') + '</strong></div>' +
    '</div>';

  document._obilTracerParsed = { json: json, rfDelta: rfDelta, subDelta: subDelta, ignored: ignored };
  applyBtn.disabled    = false;
  applyBtn.style.opacity = '1';
}

// ─── 확인 & 저장 ──────────────────────────────────────────────
async function confirmObilTracerJson() {
  var parsed = document._obilTracerParsed;
  if (!parsed) return;

  var d        = _obilTracerData;
  var json     = parsed.json;
  var newStock = document.getElementById('ot-new-stock').value.trim();

  // 상쇄종목 교체 (먼저 처리)
  if (newStock && newStock !== d.substitute.currentStock) {
    _switchSubstituteStock(newStock);
  }

  d.rf.realizedPnLCum                 += parsed.rfDelta;
  d.rf.lastUpdated                      = json.periodTo;
  d.substitute.realizedPnLCumAllStocks += parsed.subDelta;
  d.substitute.lastUpdated              = json.periodTo;

  // log append
  d.log = d.log || {};
  d.log[json.periodTo] = {
    rfQty:                      d.rf.qty,
    rfAvgPrice:                 d.rf.avgPrice,
    rfRealizedPnLCum:           d.rf.realizedPnLCum,
    subStock:                   d.substitute.currentStock,
    subQty:                     d.substitute.qty,
    subAvgPrice:                d.substitute.avgPrice,
    subRealizedPnLCumAllStocks: d.substitute.realizedPnLCumAllStocks,
  };

  await saveObilTracerData_(d);
  renderObilTracer();
  closeObilTracerModal();
}

// ─── 상쇄종목 교체 ────────────────────────────────────────────
function _switchSubstituteStock(newStockName) {
  var d   = _obilTracerData;
  var old = d.substitute.currentStock;
  if (d.substitute.history && d.substitute.history[old]) {
    d.substitute.history[old].status = '종료';
    var p = d.substitute.history[old].period || '';
    if (p && !/~.+/.test(p)) {
      d.substitute.history[old].period = p.replace(/~$/, '') + '~' + _todayKSTOt();
    }
  }
  d.substitute.currentStock = newStockName;
  if (!d.substitute.history) d.substitute.history = {};
  d.substitute.history[newStockName] = {
    period:      _todayKSTOt() + '~',
    realizedPnL: 0,
    status:      '진행중',
  };
}
