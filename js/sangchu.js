// ═══════════════════════════════════════════
//  ★ 상추매매 슬롯 — sangchu.js
//  대상: 제일일렉트릭 / 슬롯 200만원
// ═══════════════════════════════════════════

const SANGCHU_INIT = {
  state: {
    stock:           '제일일렉트릭',
    slotSize:        2000000,
    unitPct:         1,
    maxDailyPct:     4,
    avgPrice:        11960,
    holdQty:         0,
    holdPct:         0,
    realProfit:      326,
    cumulativeOffset:0,
    todayBuyAmt:     0,
    todaySellAmt:    12310,
    lastUpdated:     '2026-04-27',
  },
  trades: {
    '2026-04-24': {
      type: 'buy', price: 11960, qty: 1, amount: 11960,
      pct: 0.6, avgAfter: 11960, remainLimit: 3.4, memo: '첫 매수',
    },
    '2026-04-27': {
      type: 'sell', price: 12310, qty: 1, amount: 12310,
      pct: 0.6, avgAfter: 11960, realProfit: 326, remainLimit: 4.0,
      memo: '상추원칙: +1% 수익 1주 매도',
    },
  },
  journal: {
    '2026-04-25': {
      price: 11960, high: 0, ma10: 11125, ma35: 10643,
      signal: 'U2', choice: 'A', memo: '관찰 — 10선 눌림 시 B 전환',
    },
  },
};

let _sangchuData = null;

// ─── KST 오늘 날짜 ────────────────────────────────────────────
function _todayKST() {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
}

// ─── 일 잔여한도 계산 ──────────────────────────────────────────
function _remainLimitAmt(st) {
  var today     = _todayKST();
  var maxAmt    = st.slotSize * st.maxDailyPct / 100;
  var todayBuy  = (st.lastUpdated === today) ? (st.todayBuyAmt  || 0) : 0;
  var todaySell = (st.lastUpdated === today) ? (st.todaySellAmt || 0) : 0;
  return Math.max(0, maxAmt - todayBuy + todaySell);
}

function _remainLimitPct(st) {
  return _remainLimitAmt(st) / st.slotSize * 100;
}

// ─── 초기화 (init.js _initCore() 에서 호출) ───────────────────
async function initSangchu() {
  try {
    var remote = await fetchSangchuData_();
    if (remote && remote.state) {
      _sangchuData = remote;
    } else {
      _sangchuData = JSON.parse(JSON.stringify(SANGCHU_INIT));
      await saveSangchuData_(_sangchuData);
    }
  } catch (e) {
    _sangchuData = JSON.parse(JSON.stringify(SANGCHU_INIT));
  }
  renderSangchuCard();
}

// ─── 카드 렌더링 ──────────────────────────────────────────────
function renderSangchuCard() {
  if (!_sangchuData) return;
  var st = _sangchuData.state;

  var jDates  = Object.keys(_sangchuData.journal || {}).sort();
  var latestJ = jDates.length ? _sangchuData.journal[jDates[jDates.length - 1]] : null;

  var remainPct   = _remainLimitPct(st);
  var limitClass  = remainPct <= (st.maxDailyPct * 0.3) ? 'sc-warn' : '';
  var profitClass = st.realProfit > 0 ? 'sc-profit' : st.realProfit < 0 ? 'sc-loss' : '';

  var avgEl = document.getElementById('sc-avg-price');
  if (avgEl) avgEl.textContent = st.holdQty > 0 ? st.avgPrice.toLocaleString() + '원' : '—';

  var holdEl = document.getElementById('sc-hold-pct');
  if (holdEl) holdEl.textContent = st.holdPct.toFixed(1) + '%';

  var limitEl = document.getElementById('sc-remain-limit');
  if (limitEl) {
    limitEl.textContent = remainPct.toFixed(1) + '%';
    limitEl.className   = 'sc-val ' + limitClass;
  }

  var profitEl = document.getElementById('sc-real-profit');
  if (profitEl) {
    profitEl.textContent = (st.realProfit >= 0 ? '+' : '') + st.realProfit.toLocaleString() + '원';
    profitEl.className   = 'sc-val ' + profitClass;
  }

  var choiceEl = document.getElementById('sc-choice');
  var signalEl = document.getElementById('sc-signal');
  var ma10El   = document.getElementById('sc-ma10');
  var ma35El   = document.getElementById('sc-ma35');

  if (latestJ) {
    var choiceLabel = latestJ.choice === 'A' ? '관찰' : latestJ.choice === 'B' ? '분할매수' : '매도섞기';
    if (choiceEl) choiceEl.textContent = latestJ.choice + '(' + choiceLabel + ')';
    if (signalEl) signalEl.textContent = latestJ.signal || '—';
    if (ma10El)   ma10El.textContent   = (latestJ.ma10 || 0).toLocaleString();
    if (ma35El)   ma35El.textContent   = (latestJ.ma35 || 0).toLocaleString();
  } else {
    if (choiceEl) choiceEl.textContent = '—';
    if (signalEl) signalEl.textContent = '—';
    if (ma10El)   ma10El.textContent   = '—';
    if (ma35El)   ma35El.textContent   = '—';
  }
}

// ─── 매매 입력 모달 열기 ───────────────────────────────────────
function openSangchuModal() {
  if (!_sangchuData) return;

  document.getElementById('sc-type-buy').checked      = true;
  document.getElementById('sc-type-sell').checked     = false;
  document.getElementById('sc-type-gwanmang').checked = false;
  document.getElementById('sc-trade-type').value      = 'buy';
  document.getElementById('sc-trade-date').value      = _todayKST();
  document.getElementById('sc-trade-price').value     = '';
  document.getElementById('sc-trade-pct').value       = '';
  document.getElementById('sc-trade-memo').value      = '';
  document.getElementById('sc-trade-signal').value    = '';
  document.getElementById('sc-choice-a').checked      = true;
  document.getElementById('sc-trade-error').textContent = '';
  document.getElementById('sc-trade-section').style.display    = '';
  document.getElementById('sc-gwanmang-section').style.display = 'none';
  _clearSangchuPreview();

  document.getElementById('sangchu-modal').style.display = 'flex';
}

function closeSangchuModal() {
  document.getElementById('sangchu-modal').style.display = 'none';
}

function _clearSangchuPreview() {
  document.getElementById('sc-preview-avg').textContent   = '—';
  document.getElementById('sc-preview-pct').textContent   = '—';
  document.getElementById('sc-preview-limit').textContent = '—';
}

// ─── 예상 결과 실시간 계산 ────────────────────────────────────
function updateSangchuPreview() {
  if (!_sangchuData) return;
  var st    = _sangchuData.state;
  var type  = document.getElementById('sc-trade-type').value;
  var errEl = document.getElementById('sc-trade-error');
  errEl.textContent = '';

  var tradeSection    = document.getElementById('sc-trade-section');
  var gwanmangSection = document.getElementById('sc-gwanmang-section');

  if (type === 'gwanmang') {
    if (tradeSection)    tradeSection.style.display    = 'none';
    if (gwanmangSection) gwanmangSection.style.display = '';
    return;
  }
  if (tradeSection)    tradeSection.style.display    = '';
  if (gwanmangSection) gwanmangSection.style.display = 'none';

  var price = parseInt(document.getElementById('sc-trade-price').value)   || 0;
  var pct   = parseFloat(document.getElementById('sc-trade-pct').value)   || 0;
  if (!price || !pct) { _clearSangchuPreview(); return; }

  var tradeAmt  = st.slotSize * pct / 100;
  var qty       = Math.max(1, Math.round(tradeAmt / price));
  var actualAmt = qty * price;

  var today     = _todayKST();
  var todayBuy  = (st.lastUpdated === today) ? (st.todayBuyAmt  || 0) : 0;
  var todaySell = (st.lastUpdated === today) ? (st.todaySellAmt || 0) : 0;
  var maxAmt    = st.slotSize * st.maxDailyPct / 100;

  if (type === 'buy') {
    var newQty       = st.holdQty + qty;
    var newAvg       = Math.round((st.holdQty * st.avgPrice + qty * price) / newQty);
    var newHoldPct   = (newQty * price / st.slotSize * 100).toFixed(1);
    var newRemainAmt = Math.max(0, maxAmt - todayBuy - actualAmt + todaySell);
    var newRemainPct = (newRemainAmt / st.slotSize * 100).toFixed(1);

    document.getElementById('sc-preview-avg').textContent =
      st.avgPrice.toLocaleString() + ' → ' + newAvg.toLocaleString() + '원';
    document.getElementById('sc-preview-pct').textContent =
      st.holdPct.toFixed(1) + '% → ' + newHoldPct + '%';
    document.getElementById('sc-preview-limit').textContent =
      _remainLimitPct(st).toFixed(1) + '% → ' + newRemainPct + '%';

    if (actualAmt > maxAmt - todayBuy + todaySell) {
      errEl.textContent = '⚠ 일 한도 초과 (경고만, 저장 가능)';
      errEl.style.color = 'var(--orange)';
    }
  } else {
    if (qty > st.holdQty) {
      errEl.textContent = '오류: 매도 수량(' + qty + '주)이 보유 수량(' + st.holdQty + '주)을 초과합니다.';
      errEl.style.color = 'var(--red)';
    }
    var profit      = (price - st.avgPrice) * qty;
    var newHoldQty  = st.holdQty - qty;
    var newHoldPct2 = (newHoldQty * st.avgPrice / st.slotSize * 100).toFixed(1);

    document.getElementById('sc-preview-avg').textContent =
      '실현손익: ' + (profit >= 0 ? '+' : '') + profit.toLocaleString() + '원';
    document.getElementById('sc-preview-pct').textContent =
      st.holdPct.toFixed(1) + '% → ' + newHoldPct2 + '%';
    document.getElementById('sc-preview-limit').textContent = '—';
  }
}

// ─── 매매 확인 & 저장 ─────────────────────────────────────────
async function confirmSangchuTrade() {
  if (!_sangchuData) return;
  var st      = _sangchuData.state;
  var type    = document.getElementById('sc-trade-type').value;
  var dateVal = document.getElementById('sc-trade-date').value || _todayKST();
  var memo    = document.getElementById('sc-trade-memo').value.trim();
  var errEl   = document.getElementById('sc-trade-error');

  // ── 관망 저장 ──
  if (type === 'gwanmang') {
    var signal    = document.getElementById('sc-trade-signal').value;
    var choiceEl2 = document.querySelector('input[name="sc-choice-r"]:checked');
    var choice    = choiceEl2 ? choiceEl2.value : 'A';
    var jEntry    = { signal: signal, choice: choice, memo: memo };
    _sangchuData.journal = Object.assign({}, _sangchuData.journal || {}, { [dateVal]: jEntry });
    await saveSangchuData_({ journal: _sangchuData.journal });
    renderSangchuCard();
    if (document.getElementById('sc-journal-body').style.display !== 'none') renderSangchuJournal();
    closeSangchuModal();
    return;
  }

  // ── 매수/매도 ──
  var price = parseInt(document.getElementById('sc-trade-price').value) || 0;
  var pct   = parseFloat(document.getElementById('sc-trade-pct').value) || 0;
  if (!price || !pct) {
    errEl.textContent = '단가와 비중을 입력하세요.';
    errEl.style.color = 'var(--red)';
    return;
  }

  var tradeAmt  = st.slotSize * pct / 100;
  var qty       = Math.max(1, Math.round(tradeAmt / price));
  var actualAmt = qty * price;
  var today     = _todayKST();

  if (type === 'sell' && qty > st.holdQty) {
    errEl.textContent = '오류: 매도 수량이 보유 수량을 초과합니다.';
    errEl.style.color = 'var(--red)';
    return;
  }

  var todayBuy  = (st.lastUpdated === today) ? (st.todayBuyAmt  || 0) : 0;
  var todaySell = (st.lastUpdated === today) ? (st.todaySellAmt || 0) : 0;

  var newState    = Object.assign({}, st);
  var tradeRecord = { type: type, price: price, qty: qty, amount: actualAmt, pct: pct, memo: memo };

  if (type === 'buy') {
    var newQty  = st.holdQty + qty;
    var newAvg  = Math.round((st.holdQty * st.avgPrice + qty * price) / newQty);
    newState.holdQty      = newQty;
    newState.avgPrice     = newAvg;
    newState.holdPct      = parseFloat((newQty * price / st.slotSize * 100).toFixed(2));
    newState.todayBuyAmt  = todayBuy + actualAmt;
    newState.todaySellAmt = todaySell;
    tradeRecord.avgAfter    = newAvg;
    tradeRecord.remainLimit = parseFloat((_remainLimitPct(newState)).toFixed(2));
  } else {
    var profit2  = (price - st.avgPrice) * qty;
    var newQty2  = st.holdQty - qty;
    newState.holdQty      = newQty2;
    newState.holdPct      = parseFloat((newQty2 * st.avgPrice / st.slotSize * 100).toFixed(2));
    newState.realProfit   = (st.realProfit || 0) + profit2;
    newState.todaySellAmt = todaySell + actualAmt;
    newState.todayBuyAmt  = todayBuy;
    tradeRecord.realProfit  = profit2;
    tradeRecord.avgAfter    = st.avgPrice;
    tradeRecord.remainLimit = parseFloat((_remainLimitPct(newState)).toFixed(2));
  }
  newState.lastUpdated = today;

  var trades   = _sangchuData.trades || {};
  var tradeKey = dateVal;
  if (trades[tradeKey]) tradeKey = dateVal + '_' + Date.now();

  _sangchuData.state  = newState;
  _sangchuData.trades = Object.assign({}, trades, { [tradeKey]: tradeRecord });

  await saveSangchuData_({ state: newState, trades: _sangchuData.trades });
  renderSangchuCard();
  if (document.getElementById('sc-journal-body').style.display !== 'none') renderSangchuJournal();
  closeSangchuModal();
}

// ─── 일지 accordion ───────────────────────────────────────────
function toggleSangchuJournal() {
  var el  = document.getElementById('sc-journal-body');
  var btn = document.getElementById('sc-journal-toggle');
  if (el.style.display === 'none' || !el.style.display) {
    el.style.display = 'block';
    btn.textContent  = '일지 접기 ▲';
    renderSangchuJournal();
  } else {
    el.style.display = 'none';
    btn.textContent  = '일지 보기 ▼';
  }
}

// ─── 일지 렌더링 ──────────────────────────────────────────────
function renderSangchuJournal() {
  if (!_sangchuData) return;
  var trades  = _sangchuData.trades  || {};
  var journal = _sangchuData.journal || {};

  var allDates = Array.from(new Set(
    Object.keys(trades).map(function(k) { return k.slice(0, 10); })
      .concat(Object.keys(journal))
  )).sort().reverse();

  var rows = allDates.map(function(d) {
    var dayTrades = Object.keys(trades)
      .filter(function(k) { return k.slice(0, 10) === d; })
      .map(function(k) { return trades[k]; });
    var j = journal[d];

    if (dayTrades.length === 0 && j) {
      return '<tr>' +
        '<td>' + d + '</td>' +
        '<td style="color:var(--text3)">관찰</td>' +
        '<td>' + (j.price ? j.price.toLocaleString() : '—') + '</td>' +
        '<td>—</td><td>—</td><td>—</td>' +
        '<td>' + (j.signal || '—') + '</td>' +
        '<td>' + (j.choice || '—') + '</td>' +
        '</tr>';
    }

    return dayTrades.map(function(t, idx) {
      var typeLabel   = t.type === 'buy' ? '매수' : '매도';
      var typeClass   = t.type === 'buy' ? 'sc-profit' : 'sc-loss';
      var profitStr   = (t.realProfit != null)
        ? (t.realProfit >= 0 ? '+' : '') + t.realProfit.toLocaleString() + '원'
        : '—';
      var profitClass = t.realProfit > 0 ? 'sc-profit' : t.realProfit < 0 ? 'sc-loss' : '';
      return '<tr>' +
        '<td>' + (idx === 0 ? d : '') + '</td>' +
        '<td class="' + typeClass + '">' + typeLabel + '</td>' +
        '<td>' + t.price.toLocaleString() + '</td>' +
        '<td>' + (t.pct || 0).toFixed(1) + '%</td>' +
        '<td>' + (t.avgAfter ? t.avgAfter.toLocaleString() : '—') + '</td>' +
        '<td class="' + profitClass + '">' + profitStr + '</td>' +
        '<td>' + (idx === 0 && j ? j.signal : '—') + '</td>' +
        '<td>' + (idx === 0 && j ? j.choice : '—') + '</td>' +
        '</tr>';
    }).join('');
  }).join('');

  document.getElementById('sc-journal-rows').innerHTML =
    rows || '<tr><td colspan="8" style="color:var(--text3);text-align:center;padding:12px">기록 없음</td></tr>';
}
