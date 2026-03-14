// ═══════════════════════════════════════════
//  ★ 차트 인스턴스 변수
// ═══════════════════════════════════════════
let donutChart = null, barChart = null, lineChart = null, returnChart = null;

// ═══════════════════════════════════════════
//  ★ 스냅샷 카드 렌더
// ═══════════════════════════════════════════
function renderKiwoomSnap() {
  const keys = KIWOOM_SNAP_KEYS.filter(k => state[k]?.val !== undefined);
  if (!keys.length) { document.getElementById('kiwoom-snap-cards').style.display = 'none'; return; }
  const latestDate = keys.map(k => state[k]?.date || '').sort().pop();
  document.getElementById('kiwoom-snap-date').textContent = '기준: ' + (latestDate || '—');
  document.getElementById('kiwoom-snap-grid').innerHTML = keys.map(k => {
    const info = KIWOOM_SNAP_INFO[k];
    const d = state[k];
    const kiVal   = d?.val || 0;
    const tossKey = KI_TOSS_PAIR[k];
    const tossVal = tossKey ? (state[tossKey]?.val || 0) : 0;
    const combined   = kiVal + tossVal;
    const subDetail  = tossVal > 0
      ? `키움 ${kiVal.toLocaleString('ko-KR')} + 토스 ${tossVal.toLocaleString('ko-KR')}`
      : `키움 ${kiVal.toLocaleString('ko-KR')}`;
    return `<div class="asset-card" style="border-left:3px solid ${info.color}30;cursor:default">
      <div class="cat-badge" style="background:${info.color}18;color:${info.color};border-color:${info.color}30">키움+토스</div>
      <div class="name" style="font-size:13px">${info.name} <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace">${info.acct}</span></div>
      <div class="amount-row"><div class="amount" style="font-size:16px;color:${info.color}">${combined.toLocaleString('ko-KR')}</div><div class="unit">원</div></div>
      <div class="sub-info" style="font-size:10px;line-height:1.5">${subDetail}<br>${d?.date ? '기준: '+d.date : '—'}</div>
    </div>`;
  }).join('');
  document.getElementById('kiwoom-snap-cards').style.display = 'block';
}

function renderPensionSnap() {
  const keys = PENSION_SNAP_KEYS.filter(k => state[k]?.val !== undefined);
  if (!keys.length) { document.getElementById('pension-snap-cards').style.display = 'none'; return; }
  const latestDate = keys.map(k => state[k]?.date || '').sort().pop();
  document.getElementById('pension-snap-date').textContent = '기준: ' + (latestDate || '—');
  document.getElementById('pension-snap-grid').innerHTML = keys.map(k => {
    const info    = PENSION_SNAP_INFO[k];
    const d       = state[k];
    const rawVal  = d?.val || 0;
    const tossVal = info.tossKey ? (state[info.tossKey]?.val || 0) : 0;
    const combined = rawVal + tossVal;
    const sub = tossVal > 0
      ? `연금 ${rawVal.toLocaleString('ko-KR')} + 토스 ${tossVal.toLocaleString('ko-KR')}`
      : rawVal.toLocaleString('ko-KR') + '원';
    return `<div class="asset-card" style="border-left:3px solid ${info.color}30;cursor:default">
      <div class="cat-badge badge-pension">연금</div>
      <div class="name" style="font-size:12px">${info.name}</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:6px">${info.label}</div>
      <div class="amount-row"><div class="amount" style="font-size:16px;color:${info.color}">${combined.toLocaleString('ko-KR')}</div><div class="unit">원</div></div>
      <div class="sub-info" style="font-size:10px;line-height:1.5">${sub}<br>${d?.date ? '기준: '+d.date : '—'}</div>
    </div>`;
  }).join('');
  document.getElementById('pension-snap-cards').style.display = 'block';
}

// ═══════════════════════════════════════════
//  ★ 전체 렌더
// ═══════════════════════════════════════════
function renderAll() {
  renderKiwoomSnap();
  renderPensionSnap();

  MANUAL_KEYS.forEach(k => {
    const d  = state[k] || {};
    const el = document.getElementById('val-' + k);
    if (el) el.textContent = fmt(d.val || 0);
    const sub = document.getElementById('sub-' + k);
    if (sub) {
      if (k === 'pension-natl') {
        sub.innerHTML = (d.memo ? d.memo.replace(/\n/g,'<br>') + '<br>' : '') + '<span style="color:var(--text3)">⚠ 참고용 — 총 자산 합산 제외</span>';
      } else if (k === 'irp1' || k === 'irp2') {
        const idxMap = { 'irp1':7, 'irp2':8 };
        const idx    = idxMap[k];
        const kiEval = (kiData && kiData.combined && kiData.combined.length > 0) ? (kiData.combined[kiData.combined.length-1].eval[idx] || 0) : 0;
        const invest = (d.val || 0) * 10000;
        if (kiEval > 0) {
          el.textContent = fmt(kiEval / 10000);
          const pnl      = kiEval - invest;
          const pnlColor = pnl >= 0 ? 'var(--teal)' : '#ff6b6b';
          const pnlSign  = pnl >= 0 ? '+' : '';
          const memoStr  = d.memo ? d.memo.replace(/\n/g,'<br>') + '<br>' : '';
          sub.innerHTML  = memoStr + `투자금 ${fmt(invest/10000)}만 · 평가 <b style="color:var(--gold2)">${fmt(kiEval/10000)}만</b> <span style="color:${pnlColor}">(${pnlSign}${fmt(pnl/10000)}만)</span>`;
        } else {
          sub.innerHTML = d.memo ? d.memo.replace(/\n/g,'<br>') : '✎ 카드를 눌러 수정';
        }
      } else if (k === 'apt-owned' && d.jeonse > 0) {
        const net = (d.val || 0) - (d.jeonse || 0);
        sub.innerHTML = (d.memo ? d.memo.replace(/\n/g,'<br>') + '<br>' : '') + '<span style="color:var(--text3)">전세보증금 -' + (d.jeonse||0).toLocaleString() + '만 → 순자산 <b style="color:var(--gold2)">' + net.toLocaleString() + '만</b></span>';
      } else if (k === 'bank-housing') {
        const memoStr = d.memo ? d.memo.replace(/\n/g,'<br>') + '<br>' : '';
        sub.innerHTML = memoStr + '<span style="color:var(--blue);font-size:10px">🏢 부동산 자산으로 분류됨</span>';
      } else if (k === 'bank-rent' || k === 'bank-general') {
        const memoStr = d.memo ? d.memo.replace(/\n/g,'<br>') + '<br>' : '';
        sub.innerHTML = memoStr + '<span style="color:var(--teal);font-size:10px">💰 금융자산으로 분류됨</span>';
      } else {
        sub.innerHTML = d.memo ? d.memo.replace(/\n/g,'<br>') : '✎ 카드를 눌러 수정';
      }
    }
  });

  const TOSS_MAP = {
    'toss-obil':     ['val-toss-obil',    'date-toss-obil'],
    'toss-overseas': ['val-toss-overseas', 'date-toss-overseas'],
    'toss-pension':  ['val-toss-pension',  'date-toss-pension'],
    'toss-practice': ['val-toss-practice', 'date-toss-practice'],
  };
  Object.entries(TOSS_MAP).forEach(([k, [valId, dateId]]) => {
    const d     = state[k] || {};
    const valEl = document.getElementById(valId);
    if (valEl) valEl.textContent = fmt(d.val || 0);
    const dateEl = document.getElementById(dateId);
    if (dateEl && d.date) {
      if (d.isFallback) {
        dateEl.textContent = '최종 데이터: ' + d.date + ' (이번 달 미조회)';
        dateEl.style.color = 'var(--orange)';
      } else {
        dateEl.textContent = '기준: ' + d.date;
        dateEl.style.color = '';
      }
    }
  });

  updateGoal();
}

// ═══════════════════════════════════════════
//  ★ 자산 합계 계산
// ═══════════════════════════════════════════
function totalOf(key) { return ((state[key] || {}).val || 0) * 10000; }

function updateTotals() {
  const aptOwnedGross = totalOf('apt-owned');
  const jeonse = ((state['apt-owned'] || {}).jeonse || 0) * 10000;
  const realty = (aptOwnedGross - jeonse) + totalOf('apt-rent') + totalOf('bank-housing');

  let kiFinancial = 0, kiPension = 0, kiIrp1 = 0, kiIrp2 = 0;
  let kiHasToss = false;
  if (kiData && kiData.combined && kiData.combined.length > 0) {
    const latest = kiData.combined[kiData.combined.length - 1];
    const ev = latest.eval || [];
    kiHasToss = !!latest._hasToss;
    [0, 1, 2, 4, 5, 6].forEach(i => { kiFinancial += (ev[i] || 0); });
    kiPension += (ev[3] || 0);
    kiIrp1 = ev[7] || 0;
    kiIrp2 = ev[8] || 0;
  } else {
    ['kiwoom-overseas','kiwoom-obil','kiwoom-practice','kiwoom-jasaju','kiwoom-byuldong','kiwoom-chobil'].forEach(k => {
      kiFinancial += (state[k]?.val || 0);
    });
  }

  const financial = totalOf('bank-rent') + totalOf('bank-general')
    + totalOf('stock-kr1') + totalOf('stock-kr2') + totalOf('stock-us')
    + (kiHasToss ? 0 : (state['toss-obil']?.val || 0) + (state['toss-overseas']?.val || 0))
    + kiFinancial;
  const irp1Val    = kiIrp1 > 0 ? kiIrp1 : totalOf('irp1');
  const irp2Val    = kiIrp2 > 0 ? kiIrp2 : totalOf('irp2');
  const tossPension = (kiHasToss && kiPension > 0) ? 0 : (state['toss-pension']?.val || 0);
  const pension    = irp1Val + irp2Val + tossPension + kiPension;
  const grand      = realty + financial + pension;

  document.getElementById('total-amount').textContent   = fmtWon(grand) + ' 원';
  document.getElementById('financial-total').textContent = fmtWon(financial);
  document.getElementById('realty-total').textContent    = fmtWon(realty);
  document.getElementById('pension-total').textContent   = fmtWon(pension);
  document.getElementById('chart-count').textContent     = fmtWon(grand);

  updateDonut(realty, financial, pension);
  updateAllocBar(realty, financial, pension, grand);
  return { grand, nonRealty: financial + pension };
}

function updateGoal() {
  const { grand, nonRealty } = updateTotals();
  const targetWon = (goal.target || 0) * 10000;
  const pct = targetWon > 0 ? Math.min(100, (grand / targetWon) * 100) : 0;
  document.getElementById('goal-name').textContent    = goal.name || '총 목표자산';
  document.getElementById('goal-pct').textContent     = pct.toFixed(1) + '%';
  document.getElementById('goal-bar').style.width     = pct + '%';
  document.getElementById('goal-current').textContent = '현재: ' + fmtWon(grand);
  document.getElementById('goal-target').textContent  = goal.target
    ? '목표: ' + (goal.target >= 10000 ? (goal.target/10000).toFixed(0) + '억' : goal.target.toLocaleString() + '만')
    : '목표 미설정';

  const finTargetWon = (goal.finTarget || 0) * 10000;
  const finPct = finTargetWon > 0 ? Math.min(100, (nonRealty / finTargetWon) * 100) : 0;
  document.getElementById('goal-fin-name').textContent    = goal.finName || '금융 목표자산';
  document.getElementById('goal-fin-pct').textContent     = finPct.toFixed(1) + '%';
  document.getElementById('goal-fin-bar').style.width     = finPct + '%';
  document.getElementById('goal-fin-current').textContent = '현재: ' + fmtWon(nonRealty);
  document.getElementById('goal-fin-target').textContent  = goal.finTarget
    ? '목표: ' + (goal.finTarget >= 10000 ? (goal.finTarget/10000).toFixed(0) + '억' : goal.finTarget.toLocaleString() + '만')
    : '목표 미설정';
}

// ═══════════════════════════════════════════
//  ★ 도넛 차트 + 할당 바
// ═══════════════════════════════════════════
function updateDonut(r, f, p) {
  if (!donutChart) return;
  const data  = [r, f, p];
  const total = data.reduce((a, b) => a + b, 0);
  donutChart.data.datasets[0].data = total > 0 ? data : [1,1,1];
  donutChart.update();
  const lg  = document.getElementById('legend');
  const pct = v => total > 0 ? ' ' + ((v / total) * 100).toFixed(0) + '%' : '';
  lg.innerHTML = CAT_LABELS.map((l, i) =>
    `<div class="legend-item"><div class="legend-dot" style="background:${CAT_COLORS[i]}"></div>${l}${pct([r,f,p][i])}</div>`
  ).join('');
}

function updateAllocBar(r, f, p, total) {
  const bar = document.getElementById('alloc-bar');
  if (!bar || total === 0) return;
  bar.innerHTML = [r, f, p].map((v, i) =>
    `<div class="alloc-seg" style="width:${((v / total) * 100).toFixed(1)}%;background:${CAT_COLORS[i]}"></div>`
  ).join('');
}

// ═══════════════════════════════════════════
//  ★ 차트 초기화
// ═══════════════════════════════════════════
function initCharts() {
  const ctx = document.getElementById('donut-chart').getContext('2d');
  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: CAT_LABELS, datasets: [{ data:[1,1,1], backgroundColor:CAT_COLORS, borderWidth:0, hoverOffset:4 }] },
    options: { cutout:'72%', plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label: c => ' ' + fmtWon(c.raw) + ' (' + ((c.raw/c.dataset.data.reduce((a,b)=>a+b,0))*100).toFixed(1) + '%)' } } }, animation:{ duration:600 } }
  });

  const bCtx = document.getElementById('bar-chart').getContext('2d');
  barChart = new Chart(bCtx, {
    type: 'bar',
    data: { labels:[], datasets:[
      { label:'투자금',   data:[], backgroundColor:'rgba(144,149,168,0.35)', borderColor:'rgba(144,149,168,0.6)', borderWidth:1, borderRadius:3 },
      { label:'평가금액', data:[], backgroundColor:[], borderWidth:0, borderRadius:3 }
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ color:'#9095a8', font:{ size:11 }, boxWidth:10, padding:12 } }, tooltip:{ callbacks:{ label: c => ' ' + c.dataset.label + ': ' + fmtWon(c.raw) } } },
      scales:{ x:{ ticks:{ color:'#9095a8', font:{ size:11 } }, grid:{ color:'#1e2030' } }, y:{ ticks:{ color:'#9095a8', font:{ size:10 }, callback: v => fmtWon(v) }, grid:{ color:'#1e2030' } } }
    }
  });

  const lCtx = document.getElementById('line-chart').getContext('2d');
  lineChart = new Chart(lCtx, {
    type: 'line',
    data: { labels:[], datasets:[
      { label:'총 평가금액', data:[], borderColor:'#c9a84c', backgroundColor:'rgba(201,168,76,0.08)', borderWidth:2, fill:true, tension:0.3, pointRadius:2, pointHoverRadius:5 },
      { label:'총 투자금',   data:[], borderColor:'#565a70', backgroundColor:'transparent', borderWidth:1.5, borderDash:[4,3], fill:false, tension:0.3, pointRadius:0 }
    ]},
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ color:'#9095a8', font:{ size:11 }, boxWidth:10, padding:12 } },
        tooltip:{ callbacks:{ label: c => ' ' + c.dataset.label + ': ' + fmtWon(c.raw), afterBody: (items) => { if (items.length >= 2) { const eval_ = items[0].raw, inv = items[1].raw; if (inv > 0) return ['  수익률: ' + fmtPct((eval_/inv-1)*100)]; } return []; } } } },
      scales:{ x:{ ticks:{ color:'#9095a8', font:{ size:10 }, maxTicksLimit:8 }, grid:{ color:'#1e2030' } }, y:{ ticks:{ color:'#9095a8', font:{ size:10 }, callback: v => fmtWon(v) }, grid:{ color:'#1e2030' } } }
    }
  });

  const rCtx = document.getElementById('return-chart').getContext('2d');
  returnChart = new Chart(rCtx, {
    type: 'line',
    data: { labels:[], datasets:[] },
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:true, position:'top', labels:{ color:'#9095a8', font:{ size:11 }, boxWidth:10, padding:12 } }, tooltip:{ callbacks:{ label: c => ' ' + c.dataset.label + ': ' + fmtPct(c.raw) } } },
      scales:{ x:{ ticks:{ color:'#9095a8', font:{ size:10 }, maxTicksLimit:10 }, grid:{ color:'#1e2030' } }, y:{ ticks:{ color:'#9095a8', font:{ size:10 }, callback: v => v + '%' }, grid:{ color:'#1e2030' }, afterDataLimits: scale => { scale.min = Math.floor(scale.min/10)*10 - 5; scale.max = Math.ceil(scale.max/10)*10 + 5; } } }
    }
  });
}

// ═══════════════════════════════════════════
//  ★ 키움 데이터 렌더
// ═══════════════════════════════════════════
function renderKiwoom() {
  if (!kiData || !kiData.combined || kiData.combined.length === 0) return;
  const latest = kiData.combined[kiData.combined.length - 1];
  const prev   = kiData.combined.length > 1 ? kiData.combined[kiData.combined.length - 2] : null;
  const AI = { '해외':0,'오빌':1,'자사주':2,'개인연금저축':3,'별동대':4,'연습':5,'초빌':6,'퇴직연금001':7,'퇴직연금002':8 };
  const IRP_INVEST_KEY_S = { '퇴직연금001':'irp1', '퇴직연금002':'irp2' };

  let totalInvest = 0, totalEval = 0;
  MAIN_ACCOUNTS.forEach(a => {
    const i      = AI[a];
    const irpKey = IRP_INVEST_KEY_S[a];
    totalInvest += irpKey ? ((state[irpKey] || {}).val || 0) * 10000 : (latest.invest[i] || 0);
    totalEval   += (latest.eval[i] || 0);
  });

  const totalPnl = totalEval - totalInvest;
  const totalPct = totalInvest > 0 ? (totalEval / totalInvest - 1) * 100 : 0;
  const pctClass = totalPct >= 0 ? 'pct-pos' : 'pct-neg';
  let momEval = 0;
  if (prev) MAIN_ACCOUNTS.forEach(a => { const i = AI[a]; momEval += (latest.eval[i] || 0) - (prev.eval[i] || 0); });

  document.getElementById('kiwoom-summary').innerHTML = `
    <div class="ks-item"><div class="ks-label">기준일</div><div class="ks-val" style="font-size:14px">${latest.date}</div></div>
    <div class="ks-div"></div>
    <div class="ks-item"><div class="ks-label">총 투자금 (주요 6계좌)</div><div class="ks-val">${fmtWon(totalInvest)}</div></div>
    <div class="ks-div"></div>
    <div class="ks-item"><div class="ks-label">총 평가금액</div><div class="ks-val" style="color:var(--gold2)">${fmtWon(totalEval)}</div></div>
    <div class="ks-div"></div>
    <div class="ks-item"><div class="ks-label">평가손익</div><div class="ks-val ${totalPnl >= 0 ? 'pos' : 'neg'}">${fmtWon(totalPnl)}</div></div>
    <div class="ks-div"></div>
    <div class="ks-item"><div class="ks-label">수익률</div><div class="ks-val"><span class="k-pnl-pct ${pctClass}">${fmtPct(totalPct)}</span></div></div>
    ${prev ? `<div class="ks-div"></div><div class="ks-item"><div class="ks-label">전월 대비</div><div class="ks-val ${momEval>=0?'pos':'neg'}">${momEval>=0?'+':''}${fmtWon(momEval)}</div></div>` : ''}
  `;

  const ACCT_LABEL    = { '퇴직연금001':'IRP 1', '퇴직연금002':'IRP 2' };
  const IRP_INVEST_KEY = { '퇴직연금001':'irp1', '퇴직연금002':'irp2' };
  document.getElementById('kiwoom-cards').innerHTML = MAIN_ACCOUNTS.map(acct => {
    const i         = AI[acct];
    const investKey = IRP_INVEST_KEY[acct];
    const invest    = investKey ? ((state[investKey] || {}).val || 0) * 10000 : (latest.invest[i] || 0);
    const evalu     = latest.eval[i] || 0;
    const pnl       = evalu - invest;
    const pct       = invest > 0 ? (evalu / invest - 1) * 100 : 0;
    const color     = ACCT_COLORS[acct];
    const pctCls    = pct > 1 ? 'pct-pos' : pct < -1 ? 'pct-neg' : 'pct-neu';
    const pnlCls    = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '';
    const label     = ACCT_LABEL[acct] || acct;
    const badge     = investKey ? 'IRP' : '키움';
    const evalPct   = invest > 0 ? Math.min(Math.abs(evalu / invest) * 100, 200) : 0;
    const barBase   = Math.max(evalPct, 100);
    return `<div class="kiwoom-card" style="border-top:2px solid ${color}">
      <div class="k-acct">${label} 계좌<span class="kiwoom-badge">${badge}</span></div>
      <div class="k-eval">${fmtWon(evalu)}<span class="k-unit">평가</span></div>
      <div class="k-invest-row">
        <div style="font-size:11px;color:var(--text3);display:flex;justify-content:space-between"><span>투자금</span><span style="color:var(--text2)">${fmtWon(invest)}</span></div>
        <div style="position:relative;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-top:2px">
          <div style="position:absolute;top:0;left:0;height:100%;width:${(100/barBase*100).toFixed(1)}%;background:var(--text3);border-radius:4px;opacity:0.5"></div>
          <div style="position:absolute;top:0;left:0;height:100%;width:${(evalPct/barBase*100).toFixed(1)}%;background:${color};border-radius:4px;opacity:0.7"></div>
        </div>
      </div>
      <div class="k-pnl"><div class="k-pnl-amt ${pnlCls}">${pnl >= 0 ? '+' : ''}${fmtWon(pnl)}</div><div class="k-pnl-pct ${pctCls}">${fmtPct(pct)}</div></div>
    </div>`;
  }).join('');

  updateBarChart(latest, AI);
  updateLineChart();
  updateReturnChart();
}

function updateBarChart(latest, AI) {
  if (!barChart) return;
  const IRP_INVEST_BAR = { '퇴직연금001':'irp1', '퇴직연금002':'irp2' };
  const IRP_LABEL_B    = { '퇴직연금001':'IRP 1', '퇴직연금002':'IRP 2' };
  const investData = MAIN_ACCOUNTS.map(a => { const k = IRP_INVEST_BAR[a]; return k ? ((state[k]||{}).val||0)*10000 : (latest.invest[AI[a]]||0); });
  const evalData   = MAIN_ACCOUNTS.map(a => latest.eval[AI[a]] || 0);
  barChart.data.labels = MAIN_ACCOUNTS.map(a => IRP_LABEL_B[a] || a);
  barChart.data.datasets[0].data = investData;
  barChart.data.datasets[1].data = evalData;
  barChart.data.datasets[1].backgroundColor = MAIN_ACCOUNTS.map(a => ACCT_COLORS[a] + 'bb');
  barChart.update();
  document.getElementById('bar-date').textContent = latest.date + ' 기준';
}

function setChartRange(months) {
  chartRange = months;
  ['tab-12m','tab-24m','tab-all'].forEach(id => document.getElementById(id)?.classList.remove('active'));
  document.getElementById(months === 12 ? 'tab-12m' : months === 24 ? 'tab-24m' : 'tab-all')?.classList.add('active');
  updateLineChart();
  updateReturnChart();
}

function getFilteredData() {
  if (!kiData) return [];
  return chartRange === 0 ? kiData.combined : kiData.combined.slice(-chartRange);
}

function updateLineChart() {
  if (!lineChart || !kiData) return;
  const data = getFilteredData();
  const AI   = { '해외':0,'오빌':1,'자사주':2,'개인연금저축':3,'별동대':4,'연습':5,'초빌':6,'퇴직연금001':7,'퇴직연금002':8 };
  lineChart.data.labels = data.map(r => r.date.slice(0,7));
  lineChart.data.datasets[0].data = data.map(r => MAIN_ACCOUNTS.reduce((s,a) => s+(r.eval[AI[a]]||0), 0));
  lineChart.data.datasets[1].data = data.map(r => MAIN_ACCOUNTS.reduce((s,a) => s+(r.invest[AI[a]]||0), 0));
  lineChart.update();
}

function updateReturnChart() {
  if (!returnChart || !kiData) return;
  const data          = getFilteredData();
  const AI            = { '해외':0,'오빌':1,'자사주':2,'개인연금저축':3,'별동대':4,'연습':5,'초빌':6,'퇴직연금001':7,'퇴직연금002':8 };
  const IRP_INVEST_RC = { '퇴직연금001':'irp1', '퇴직연금002':'irp2' };
  const IRP_LABEL_RC  = { '퇴직연금001':'IRP 1', '퇴직연금002':'IRP 2' };
  returnChart.data.labels = data.map(r => r.date.slice(0,7));
  returnChart.data.datasets = MAIN_ACCOUNTS.map(acct => {
    const irpKey      = IRP_INVEST_RC[acct];
    const fixedInvest = irpKey ? ((state[irpKey]||{}).val||0)*10000 : 0;
    return {
      label: IRP_LABEL_RC[acct] || acct,
      data:  data.map(r => {
        const invest = irpKey ? fixedInvest : (r.invest[AI[acct]]||0);
        const evalu  = r.eval[AI[acct]]||0;
        if (invest <= 0 || evalu <= 0) return null;
        return parseFloat(((evalu/invest-1)*100).toFixed(2));
      }),
      borderColor: ACCT_COLORS[acct], backgroundColor:'transparent',
      borderWidth:2, tension:0.3, pointRadius:2, pointHoverRadius:5, spanGaps:true
    };
  });
  returnChart.update();
}
