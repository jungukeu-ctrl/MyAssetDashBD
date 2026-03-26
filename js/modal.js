// ═══════════════════════════════════════════
//  ★ 토스 JSON 붙여넣기 모달
// ═══════════════════════════════════════════
function openJsonPasteModal() {
  const modal     = document.getElementById('ai-modal');
  const textarea  = document.getElementById('json-paste-area');
  const log       = document.getElementById('ai-log');
  const resultArea = document.getElementById('ai-result-area');
  const applyBtn  = document.getElementById('ai-apply-btn');
  textarea.value = '';
  log.style.display = 'none';
  resultArea.style.display = 'none';
  applyBtn.disabled = true;
  aiPendingResult = null;
  modal.classList.add('open');
  setTimeout(() => textarea.focus(), 100);
}

function parseJsonPaste() {
  const raw        = document.getElementById('json-paste-area').value.trim();
  const log        = document.getElementById('ai-log');
  const resultArea = document.getElementById('ai-result-area');
  const applyBtn   = document.getElementById('ai-apply-btn');
  aiPendingResult = null;
  applyBtn.disabled = true;
  resultArea.style.display = 'none';
  if (!raw) { log.style.display = 'none'; return; }
  log.style.display = 'block';
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 형식이 아닙니다');
    const parsed = JSON.parse(match[0]);
    if (!parsed.accounts?.length) throw new Error('accounts 배열이 없습니다');
    aiPendingResult = parsed;
    document.getElementById('ai-result-tbody').innerHTML = parsed.accounts.map(a =>
      `<tr>
        <td>${a.name || a.key}</td>
        <td style="text-align:right;color:var(--teal)">${a.balance.toLocaleString('ko-KR')}</td>
        <td style="color:var(--text3)">${parsed.date || '—'}</td>
      </tr>`
    ).join('');
    resultArea.style.display = 'block';
    applyBtn.disabled = false;
    log.style.color = 'var(--teal)';
    log.textContent = `✅ ${parsed.accounts.length}개 계좌 인식됨 · ${parsed.date || '날짜 없음'}`;
  } catch(e) {
    log.style.color = 'var(--red, #ff6b6b)';
    log.textContent = '❌ ' + e.message;
  }
}

function applyAiResult() {
  if (!aiPendingResult) return;
  const { date, accounts } = aiPendingResult;
  const ym = date.slice(0, 7);
  accounts.forEach(a => {
    if (!a.key || !TOSS_KEYS.includes(a.key)) return;
    state[a.key] = { val: a.balance, date, isFallback: false };
    // tossHistory 해당 월 자동 업데이트
    if (kiData) {
      if (!kiData.tossHistory) kiData.tossHistory = {};
      if (!kiData.tossHistory[a.key]) kiData.tossHistory[a.key] = {};
      kiData.tossHistory[a.key][ym] = a.balance;
    }
  });
  if (kiData) localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  save();
  renderAll();
  if (typeof renderKiwoom === 'function') renderKiwoom();
  closeAiModal();
}

function closeAiModal() {
  document.getElementById('ai-modal').classList.remove('open');
  aiPendingResult = null;
}

// ═══════════════════════════════════════════
//  ★ 키움 스냅샷 JSON 붙여넣기 모달
// ═══════════════════════════════════════════
function openKiwoomPasteModal() {
  document.getElementById('kiwoom-paste-area').value = '';
  document.getElementById('kiwoom-log').style.display = 'none';
  document.getElementById('kiwoom-result-area').style.display = 'none';
  document.getElementById('kiwoom-apply-btn').disabled = true;
  kiwoomPendingResult = null;
  document.getElementById('kiwoom-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('kiwoom-paste-area').focus(), 100);
}

function parseKiwoomPaste() {
  const raw        = document.getElementById('kiwoom-paste-area').value.trim();
  const log        = document.getElementById('kiwoom-log');
  const resultArea = document.getElementById('kiwoom-result-area');
  const applyBtn   = document.getElementById('kiwoom-apply-btn');
  kiwoomPendingResult = null;
  applyBtn.disabled = true;
  resultArea.style.display = 'none';
  if (!raw) { log.style.display = 'none'; return; }
  log.style.display = 'block';
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 형식이 아닙니다');
    const parsed = JSON.parse(match[0]);
    if (!parsed.accounts?.length) throw new Error('accounts 배열이 없습니다');
    kiwoomPendingResult = parsed;
    document.getElementById('kiwoom-result-tbody').innerHTML = parsed.accounts.map(a =>
      `<tr>
        <td>${a.name || KIWOOM_SNAP_INFO[a.key]?.name || a.key}
          <span style="font-size:10px;color:var(--text3);font-family:'DM Mono',monospace;margin-left:6px">${KIWOOM_SNAP_INFO[a.key]?.acct||''}</span>
        </td>
        <td style="text-align:right;color:var(--blue)">${a.balance.toLocaleString('ko-KR')}</td>
        <td style="color:var(--text3)">${parsed.date || '—'}</td>
      </tr>`
    ).join('');
    resultArea.style.display = 'block';
    applyBtn.disabled = false;
    log.style.color = 'var(--teal)';
    log.textContent = `✅ ${parsed.accounts.length}개 계좌 인식됨 · ${parsed.date || '날짜 없음'}`;
  } catch(e) {
    log.style.color = 'var(--red, #ff6b6b)';
    log.textContent = '❌ ' + e.message;
  }
}

function applyKiwoomResult() {
  if (!kiwoomPendingResult) return;
  const { date, accounts } = kiwoomPendingResult;
  const ym = date.slice(0, 7);
  accounts.forEach(a => {
    if (!KIWOOM_SNAP_KEYS.includes(a.key)) return;
    state[a.key] = { val: a.balance, date };
  });
  if (!kiData) kiData = { combined: [] };
  if (!kiData.combined) kiData.combined = [];
  let entry = kiData.combined.find(e => (e.date || e.month || '').slice(0, 7) === ym);
  if (!entry) {
    const prev = kiData.combined[kiData.combined.length - 1];
    entry = {
      date, month: ym,
      invest: prev ? [...(prev.invest || new Array(9).fill(0))] : new Array(9).fill(0),
      eval: new Array(11).fill(0),
      _hasToss: true,
    };
    kiData.combined.push(entry);
    kiData.combined.sort((a, b) => (a.date || a.month || '').localeCompare(b.date || b.month || ''));
  } else {
    entry.date = date;
    entry._hasToss = true;
    if (!entry.eval) entry.eval = new Array(11).fill(0);
    // invest 동기화: 직전 entry invest가 더 높은 항목만 갱신
    // (이체내역을 뒤늦게 적용한 경우 이후 월이 구 값으로 남는 문제 해소)
    const ei = kiData.combined.indexOf(entry);
    const prevE = ei > 0 ? kiData.combined[ei - 1] : null;
    if (prevE?.invest) {
      if (!entry.invest) entry.invest = [];
      prevE.invest.forEach((v, i) => {
        if (i !== 10 && (v || 0) > (entry.invest[i] || 0)) entry.invest[i] = v;
      });
    }
  }
  accounts.forEach(a => {
    const idx     = KI_SNAP_IDX[a.key];
    if (idx === undefined) return;
    const tossKey = KI_TOSS_PAIR[a.key];
    const tossVal = tossKey ? (state[tossKey]?.val || 0) : 0;
    entry.eval[idx] = a.balance + tossVal;
  });
  localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  scheduleGasSync_();
  save();
  renderAll();
  if (kiData) renderKiwoom();
  closeKiwoomModal();
  const st = document.getElementById('kiwoom-snap-status');
  st.textContent = `✓ 스냅샷 적용 (${accounts.length}개 · ${ym})`;
  setTimeout(() => st.textContent = '', 5000);
}

function closeKiwoomModal() {
  document.getElementById('kiwoom-modal').style.display = 'none';
  kiwoomPendingResult = null;
}

// ═══════════════════════════════════════════
//  ★ 연금 스냅샷 JSON 붙여넣기 모달
// ═══════════════════════════════════════════
function openPensionPasteModal() {
  document.getElementById('pension-paste-area').value = '';
  document.getElementById('pension-log').style.display = 'none';
  document.getElementById('pension-result-area').style.display = 'none';
  document.getElementById('pension-apply-btn').disabled = true;
  pensionPendingResult = null;
  document.getElementById('pension-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('pension-paste-area').focus(), 100);
}

function parsePensionPaste() {
  const raw        = document.getElementById('pension-paste-area').value.trim();
  const log        = document.getElementById('pension-log');
  const resultArea = document.getElementById('pension-result-area');
  const applyBtn   = document.getElementById('pension-apply-btn');
  pensionPendingResult = null;
  applyBtn.disabled = true;
  resultArea.style.display = 'none';
  if (!raw) { log.style.display = 'none'; return; }
  log.style.display = 'block';
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 형식이 아닙니다');
    const parsed = JSON.parse(match[0]);
    if (!parsed.accounts?.length) throw new Error('accounts 배열이 없습니다');
    pensionPendingResult = parsed;
    document.getElementById('pension-result-tbody').innerHTML = parsed.accounts.map(a => {
      const info    = PENSION_SNAP_INFO[a.key];
      const tossVal = info?.tossKey ? (state[info.tossKey]?.val || 0) : 0;
      const combined = a.balance + tossVal;
      const note    = tossVal > 0 ? ` (+토스 ${tossVal.toLocaleString('ko-KR')})` : '';
      return `<tr>
        <td>${info?.name || a.name || a.key}
          <span style="font-size:10px;color:var(--text3);margin-left:4px">${info?.label||''}</span>
        </td>
        <td style="text-align:right;color:#b089f0">${combined.toLocaleString('ko-KR')}${note}</td>
        <td style="color:var(--text3)">${parsed.date || '—'}</td>
      </tr>`;
    }).join('');
    resultArea.style.display = 'block';
    applyBtn.disabled = false;
    log.style.color = 'var(--teal)';
    log.textContent = `✅ ${parsed.accounts.length}개 계좌 인식됨 · ${parsed.date || '날짜 없음'}`;
  } catch(e) {
    log.style.color = '#ff6b6b';
    log.textContent = '❌ ' + e.message;
  }
}

function applyPensionResult() {
  if (!pensionPendingResult) return;
  const { date, accounts } = pensionPendingResult;
  const ym = date.slice(0, 7);
  accounts.forEach(a => {
    if (!PENSION_SNAP_KEYS.includes(a.key)) return;
    state[a.key] = { val: a.balance, date };
  });
  if (!kiData) kiData = { combined: [] };
  if (!kiData.combined) kiData.combined = [];
  let entry = kiData.combined.find(e => (e.date || e.month || '').slice(0, 7) === ym);
  if (!entry) {
    const prev = kiData.combined[kiData.combined.length - 1];
    entry = {
      date, month: ym,
      invest: prev ? [...(prev.invest || new Array(9).fill(0))] : new Array(9).fill(0),
      eval: new Array(10).fill(0),
      _hasToss: true,
    };
    kiData.combined.push(entry);
    kiData.combined.sort((a, b) => (a.date || a.month || '').localeCompare(b.date || b.month || ''));
  } else {
    entry.date = date;
    if (!entry.eval) entry.eval = new Array(10).fill(0);
    entry._hasToss = true;
  }
  accounts.forEach(a => {
    const info    = PENSION_SNAP_INFO[a.key];
    if (!info) return;
    const tossVal = info.tossKey ? (state[info.tossKey]?.val || 0) : 0;
    entry.eval[info.evalIdx] = a.balance + tossVal;
  });
  localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  scheduleGasSync_();
  save();
  renderAll();
  if (kiData) renderKiwoom();
  closePensionModal();
  const st = document.getElementById('pension-snap-status');
  st.textContent = `✓ 연금 적용 (${accounts.length}개 · ${ym})`;
  setTimeout(() => st.textContent = '', 5000);
}

function closePensionModal() {
  document.getElementById('pension-modal').style.display = 'none';
  pensionPendingResult = null;
}

// ═══════════════════════════════════════════
//  ★ 키움 이체내역 JSON 붙여넣기 모달
// ═══════════════════════════════════════════
function openKiwoomTransferModal() {
  document.getElementById('transfer-modal').style.display = 'flex';
  document.getElementById('transfer-paste-area').value = '';
  document.getElementById('transfer-log').style.display = 'none';
  document.getElementById('transfer-result-area').style.display = 'none';
  document.getElementById('transfer-acct-select-area').style.display = 'none';
  document.getElementById('transfer-acct-select').value = '';
  document.getElementById('transfer-apply-btn').disabled = true;
  transferPendingResult = null;
}

function parseKiwoomTransferPaste() {
  const raw        = document.getElementById('transfer-paste-area').value.trim();
  const log        = document.getElementById('transfer-log');
  const resultArea = document.getElementById('transfer-result-area');
  const applyBtn   = document.getElementById('transfer-apply-btn');
  const acctSelectArea = document.getElementById('transfer-acct-select-area');
  transferPendingResult = null;
  applyBtn.disabled = true;
  resultArea.style.display = 'none';
  if (!raw) { log.style.display = 'none'; acctSelectArea.style.display = 'none'; return; }
  log.style.display = 'block';
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 형식이 아닙니다');
    const parsed = JSON.parse(match[0]);

    if (parsed.type === 'kiwoom_transfer') {
      // ── 기존 분석기 포맷 ──
      acctSelectArea.style.display = 'none';
      if (!parsed.account) throw new Error('account 필드가 없습니다');
      if (!Array.isArray(parsed.kiData) || !parsed.kiData.length) throw new Error('kiData 배열이 없습니다');
      if (KI_TRANSFER_IDX[parsed.account] === undefined) throw new Error(`알 수 없는 계좌: ${parsed.account}`);
      transferPendingResult = parsed;
      const acct   = parsed.account;
      const recent = parsed.kiData.slice(-6);
      document.getElementById('transfer-acct-name').textContent  = acct;
      document.getElementById('transfer-row-count').textContent  = parsed.kiData.length;
      document.getElementById('transfer-preview').innerHTML = recent
        .map(r => `<span style="color:var(--text3)">${r.date}</span>  <span style="color:var(--blue)">${(r[acct]||0).toLocaleString('ko-KR')}</span> 원`)
        .join('<br>');
      resultArea.style.display = 'block';
      applyBtn.disabled = false;
      log.style.color = 'var(--teal)';
      log.textContent = `✅ ${acct} 계좌 · ${parsed.kiData.length}개월 인식됨`;

    } else if (Array.isArray(parsed.transactions)) {
      // ── 키움 이체내역 원본 포맷 (account_number / account_name / transactions) ──
      acctSelectArea.style.display = 'block';
      if (!parsed.transactions.length) throw new Error('transactions 배열이 비어 있습니다');

      const acct = document.getElementById('transfer-acct-select').value;
      if (!acct) {
        log.style.color = 'var(--text3)';
        log.textContent = `ℹ️ ${parsed.account_name || parsed.account_number || '계좌'} 인식됨 · 위에서 계좌를 선택하세요`;
        return;
      }
      if (KI_TRANSFER_IDX[acct] === undefined) throw new Error(`알 수 없는 계좌: ${acct}`);

      // 월별 순변동 집계 (입금 +, 출금 -)
      const monthlyDeltas = {};
      for (const tx of parsed.transactions) {
        if (!tx.date) continue;
        const ym    = tx.date.slice(0, 7);
        const delta = tx.type === '입금' ? tx.amount : -tx.amount;
        monthlyDeltas[ym] = (monthlyDeltas[ym] || 0) + delta;
      }
      const sortedMonths = Object.keys(monthlyDeltas).sort();
      if (!sortedMonths.length) throw new Error('유효한 거래내역이 없습니다');

      transferPendingResult = { _rawFormat: true, account: acct, monthlyDeltas };
      document.getElementById('transfer-acct-name').textContent  = acct;
      document.getElementById('transfer-row-count').textContent  = sortedMonths.length;
      document.getElementById('transfer-preview').innerHTML = sortedMonths
        .map(ym => {
          const v = monthlyDeltas[ym];
          const color = v >= 0 ? 'var(--teal)' : 'var(--red)';
          const sign  = v >= 0 ? '+' : '';
          return `<span style="color:var(--text3)">${ym}</span>  <span style="color:${color}">${sign}${v.toLocaleString('ko-KR')}</span> 원`;
        })
        .join('<br>');
      resultArea.style.display = 'block';
      applyBtn.disabled = false;
      log.style.color = 'var(--teal)';
      log.textContent = `✅ ${acct} 계좌 · ${sortedMonths.length}개월 감지됨`;

    } else {
      throw new Error('지원하지 않는 JSON 포맷입니다 (type 또는 transactions 필드가 없습니다)');
    }
  } catch(e) {
    log.style.color = 'var(--red)';
    log.textContent = '❌ ' + e.message;
  }
}

function applyKiwoomTransferResult() {
  if (!transferPendingResult) return;
  const { account } = transferPendingResult;
  const idx = KI_TRANSFER_IDX[account];
  if (!kiData) kiData = { combined: [] };
  if (!kiData.combined) kiData.combined = [];
  let updatedCount = 0;

  if (transferPendingResult._rawFormat) {
    // ── 원본 포맷: 월별 순변동을 기존 invest 값에 더함 ──
    for (const [ym, delta] of Object.entries(transferPendingResult.monthlyDeltas)) {
      let entry = kiData.combined.find(e => (e.month || (e.date||'').slice(0,7)) === ym);
      if (!entry) {
        const prev = kiData.combined[kiData.combined.length - 1];
        entry = {
          date: ym + '-28', month: ym,
          invest: prev ? [...(prev.invest || new Array(9).fill(0))] : new Array(9).fill(0),
          eval: new Array(10).fill(0),
        };
        kiData.combined.push(entry);
        kiData.combined.sort((a,b) => (a.date||a.month||'').localeCompare(b.date||b.month||''));
      }
      if (!entry.invest) entry.invest = new Array(9).fill(0);
      entry.invest[idx] = (entry.invest[idx] || 0) + delta;
      updatedCount++;
    }
  } else {
    // ── 분석기 포맷: 절대값으로 덮어씀 ──
    const rows = transferPendingResult.kiData;
    for (const row of rows) {
      const ym = (row.date || '').slice(0, 7);
      if (!ym) continue;
      let entry = kiData.combined.find(e => (e.month || (e.date||'').slice(0,7)) === ym);
      if (!entry) {
        const prev = kiData.combined[kiData.combined.length - 1];
        entry = {
          date: row.date, month: ym,
          invest: prev ? [...(prev.invest || new Array(9).fill(0))] : new Array(9).fill(0),
          eval: new Array(10).fill(0),
        };
        kiData.combined.push(entry);
        kiData.combined.sort((a,b) => (a.date||a.month||'').localeCompare(b.date||b.month||''));
      }
      if (!entry.invest) entry.invest = new Array(9).fill(0);
      entry.invest[idx] = row[account] || 0;
      updatedCount++;
    }
  }

  localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  scheduleGasSync_();
  save();
  renderAll();
  if (kiData) renderKiwoom();
  closeKiwoomTransferModal();
  const st = document.getElementById('kiwoom-transfer-status');
  st.textContent = `✓ ${account} 이체내역 적용 (${updatedCount}개월)`;
  setTimeout(() => st.textContent = '', 5000);
}

function closeKiwoomTransferModal() {
  document.getElementById('transfer-modal').style.display = 'none';
  document.getElementById('transfer-acct-select-area').style.display = 'none';
  document.getElementById('transfer-acct-select').value = '';
  transferPendingResult = null;
}

// ═══════════════════════════════════════════
//  ★ ISA 거래내역 JSON 모달
// ═══════════════════════════════════════════
function openIsaModal() {
  document.getElementById('isa-paste-area').value = '';
  document.getElementById('isa-log').style.display = 'none';
  document.getElementById('isa-result-area').style.display = 'none';
  document.getElementById('isa-apply-btn').disabled = true;
  isaPendingResult = null;
  document.getElementById('isa-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('isa-paste-area').focus(), 100);
}

function parseIsaJson() {
  const raw      = document.getElementById('isa-paste-area').value.trim();
  const log      = document.getElementById('isa-log');
  const resultArea = document.getElementById('isa-result-area');
  const applyBtn = document.getElementById('isa-apply-btn');
  isaPendingResult = null;
  applyBtn.disabled = true;
  resultArea.style.display = 'none';
  if (!raw) { log.style.display = 'none'; return; }
  log.style.display = 'block';
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('JSON 형식이 아닙니다');
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.transactions) || !parsed.transactions.length) throw new Error('transactions 배열이 없습니다');

    let invest = 0;
    let latestDate = '';
    const rows = parsed.transactions.map(tx => {
      if (tx.type === '입금') invest += tx.amount;
      else if (tx.type === '출금') invest -= tx.amount;
      if (tx.date > latestDate) latestDate = tx.date;
      const color = tx.type === '입금' ? '#5bc8af' : '#ff6b6b';
      const sign  = tx.type === '입금' ? '+' : '-';
      return `<div style="color:${color}">${tx.date} ${sign}${tx.amount.toLocaleString('ko-KR')}원 <span style="color:var(--text3);font-size:11px">${tx.counterpart || ''}</span></div>`;
    });

    isaPendingResult = { val: invest, date: latestDate };
    document.getElementById('isa-acct-name').textContent = parsed.account_name || parsed.account_number || '—';
    document.getElementById('isa-preview').innerHTML =
      rows.join('') +
      `<div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;color:#5bc8af;font-weight:600">
        투자금: ${invest.toLocaleString('ko-KR')}원 &nbsp;·&nbsp; 기준일: ${latestDate}
      </div>`;
    resultArea.style.display = 'block';
    applyBtn.disabled = false;
    log.style.color = 'var(--teal)';
    log.textContent = `✅ ${parsed.transactions.length}건 · 투자금 ${invest.toLocaleString('ko-KR')}원 · ${latestDate}`;
  } catch(e) {
    log.style.color = '#ff6b6b';
    log.textContent = '❌ ' + e.message;
  }
}

function applyIsaModal() {
  if (!isaPendingResult) return;
  state['isa'] = { val: isaPendingResult.val, date: isaPendingResult.date, source: 'transaction' };
  save();
  renderAll();
  if (typeof renderKiwoom === 'function') renderKiwoom();
  closeIsaModal();
}

function closeIsaModal() {
  document.getElementById('isa-modal').style.display = 'none';
}

// ═══════════════════════════════════════════
//  ★ ISA 평가금액 수동 입력 모달
// ═══════════════════════════════════════════
function openIsaEvalModal() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('isa-eval-val-input').value  = '';
  document.getElementById('isa-eval-date-input').value = today;
  document.getElementById('isa-eval-log').style.display = 'none';
  document.getElementById('isa-eval-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('isa-eval-val-input').focus(), 100);
}

function applyIsaEvalModal() {
  const val  = parseInt(document.getElementById('isa-eval-val-input').value, 10);
  const date = document.getElementById('isa-eval-date-input').value;
  const log  = document.getElementById('isa-eval-log');
  if (!val || !date) {
    log.style.display = 'block';
    log.style.color = '#ff6b6b';
    log.textContent = '❌ 평가금액과 기준일을 모두 입력하세요.';
    return;
  }
  const ym = date.slice(0, 7);
  if (!kiData) kiData = { combined: [] };
  if (!kiData.combined) kiData.combined = [];
  let entry = kiData.combined.find(e => (e.date || e.month || '').slice(0, 7) === ym);
  if (!entry) {
    const prev = kiData.combined[kiData.combined.length - 1];
    entry = {
      date, month: ym,
      invest: prev ? [...(prev.invest || new Array(9).fill(0))] : new Array(9).fill(0),
      eval: new Array(10).fill(0),
    };
    kiData.combined.push(entry);
    kiData.combined.sort((a, b) => (a.date || a.month || '').localeCompare(b.date || b.month || ''));
  } else {
    entry.date = date;
    if (!entry.eval) entry.eval = new Array(10).fill(0);
    else if (entry.eval.length < 10) entry.eval.push(0);
  }
  entry.eval[9] = val;
  localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  pushToGAS_();
  renderAll();
  if (typeof renderKiwoom === 'function') renderKiwoom();
  log.style.display = 'block';
  log.style.color = 'var(--teal)';
  log.textContent = `✅ 평가금액 ${val.toLocaleString('ko-KR')}원 (${date}) 저장됨`;
  setTimeout(() => closeIsaEvalModal(), 1200);
}

function closeIsaEvalModal() {
  document.getElementById('isa-eval-modal').style.display = 'none';
}

// ═══════════════════════════════════════════
//  ★ RIA 매입금액 입력 모달
// ═══════════════════════════════════════════
// SPY 고정 정보 (매입평단·수량 변경 시 여기서 수정)
const _RIA_SPY_AVG_USD  = 463.8826;
const _RIA_SPY_SHARES   = 52;
const _RIA_SPY_TOTAL_USD = _RIA_SPY_AVG_USD * _RIA_SPY_SHARES; // 24,121.8952 USD

async function _fetchRiaFxRate() {
  const fxEl    = document.getElementById('ria-fx-info');
  const investEl = document.getElementById('ria-invest-input');
  fxEl.textContent = '환율 조회 중...';
  try {
    const res  = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    const rate = Math.round(data.rates.KRW);
    const calc = Math.round(_RIA_SPY_TOTAL_USD * rate);
    fxEl.innerHTML =
      `USD/KRW <strong style="color:#ff9f7f">${rate.toLocaleString()}원</strong> &nbsp;·&nbsp; ` +
      `${_RIA_SPY_AVG_USD} × ${_RIA_SPY_SHARES}주 = ` +
      `<strong style="color:var(--text)">${_RIA_SPY_TOTAL_USD.toLocaleString(undefined,{maximumFractionDigits:4})} USD</strong>` +
      ` × ${rate.toLocaleString()} = ` +
      `<strong style="color:#ff9f7f">${calc.toLocaleString()}원</strong>`;
    // 기존 저장값 없으면 자동 채우기
    if (!investEl.value) investEl.value = calc;
  } catch (e) {
    fxEl.textContent = '환율 조회 실패 — 직접 입력하세요';
  }
}

function openRiaModal() {
  const d = state['ria'] || {};
  document.getElementById('ria-invest-input').value = d.investVal || '';
  document.getElementById('ria-date-input').value   = d.date || new Date().toISOString().slice(0, 10);
  document.getElementById('ria-modal').style.display = 'flex';
  _fetchRiaFxRate();
}

function applyRiaModal() {
  const investVal = parseInt(document.getElementById('ria-invest-input').value, 10) || 0;
  const date      = document.getElementById('ria-date-input').value;
  if (!date) return;
  const prev = state['ria'] || {};
  state['ria'] = { val: prev.val || 0, date, investVal };
  save();
  renderAll();
  if (typeof renderKiwoom === 'function') renderKiwoom();
  closeRiaModal();
}

function closeRiaModal() {
  document.getElementById('ria-modal').style.display = 'none';
}

// ═══════════════════════════════════════════
//  ★ 연금 이체내역 모달 (개인연금저축 투자금 소급 계산)
// ═══════════════════════════════════════════
function openPensionTransferModal() {
  document.getElementById('pension-transfer-modal').style.display = 'flex';
}

function parseTransferData() {
  const raw = document.getElementById('pension-transfer-area').value.trim();
  const log = document.getElementById('pension-transfer-log');
  const btn = document.getElementById('pension-transfer-btn');
  const acctRadio = document.querySelector('input[name="pension-transfer-acct"]:checked');
  const acctType = acctRadio ? acctRadio.value : 'pension';
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 형식이 아닙니다.');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.transactions)) throw new Error('transactions 배열이 없습니다.');

    // 계좌 유형 감지 (account_name 우선, counterpart 폴백)
    const accountName = parsed.account_name || '';
    const isIrp1 = accountName.includes('다이렉트IRP') || accountName.includes('IRP1');
    const isIrp2 = accountName.includes('개인형IRP')   || accountName.includes('IRP2');

    const pensionSum = {};  // invest[3] — 연금저축
    const irp1Sum   = {};  // invest[7] — IRP1
    const irp2Sum   = {};  // invest[8] — IRP2

    const KNOWN_FILTERED = ['배당금', '현금배당', '이용료', '이자', '환급', '세금'];
    const IRP_DEPOSIT_KEYS = ['현금성자산', 'mPop 입금', '이체입금'];
    const unmatched = [];

    parsed.transactions.forEach(t => {
      const typeStr = String(t.type || '').trim();
      if (!typeStr.includes('입금') || !t.date) return;
      const cp = String(t.counterpart || '').trim();
      const ym = t.date.slice(0, 7);
      if (isIrp2 && IRP_DEPOSIT_KEYS.some(k => cp.includes(k))) {
        irp2Sum[ym] = (irp2Sum[ym] || 0) + t.amount;
      } else if (isIrp1 && IRP_DEPOSIT_KEYS.some(k => cp.includes(k))) {
        irp1Sum[ym] = (irp1Sum[ym] || 0) + t.amount;
      } else if (!isIrp1 && !isIrp2 && (cp.includes('이체입금') || cp.includes('유정욱'))) {
        pensionSum[ym] = (pensionSum[ym] || 0) + t.amount;
      } else if (!KNOWN_FILTERED.some(k => cp.includes(k))) {
        unmatched.push(`${t.date} [${cp}] ${Number(t.amount).toLocaleString()}원`);
      }
    });

    window.pendingPensionDeltas = pensionSum;
    window.pendingIrp1Deltas   = irp1Sum;
    window.pendingIrp2Deltas   = irp2Sum;

    const pCnt   = Object.keys(pensionSum).length;
    const i1Cnt  = Object.keys(irp1Sum).length;
    const i2Cnt  = Object.keys(irp2Sum).length;
    const total  = pCnt + i1Cnt + i2Cnt;
    if (total === 0) throw new Error('납입 내역이 없습니다 (이체입금/현금성자산 항목 없음)');

    const lines = [];
    const parts = [];
    if (pCnt  > 0) {
      parts.push(`연금저축 ${pCnt}개월`);
      Object.entries(pensionSum).sort().forEach(([ym, amt]) =>
        lines.push(`  연금저축 ${ym}: ${amt.toLocaleString()}원`)
      );
    }
    if (i1Cnt > 0) {
      parts.push(`IRP1 ${i1Cnt}개월`);
      Object.entries(irp1Sum).sort().forEach(([ym, amt]) =>
        lines.push(`  IRP1 ${ym}: ${amt.toLocaleString()}원`)
      );
    }
    if (i2Cnt > 0) {
      parts.push(`IRP2 ${i2Cnt}개월`);
      Object.entries(irp2Sum).sort().forEach(([ym, amt]) =>
        lines.push(`  IRP2 ${ym}: ${amt.toLocaleString()}원`)
      );
    }
    if (unmatched.length > 0) {
      lines.push(`⚠️ 미인식 입금 ${unmatched.length}건:`);
      unmatched.forEach(u => lines.push(`  ${u}`));
    }
    log.style.color = 'var(--teal)';
    log.style.whiteSpace = 'pre-line';
    log.textContent = '✅ ' + parts.join(' · ') + ' 납입내역 인식 성공\n' + lines.join('\n');
    btn.disabled = false;
  } catch(e) {
    log.style.color = 'var(--red)';
    log.textContent = '❌ 오류: ' + e.message;
  }
}

function applyTransferData(type) {
  if (!kiData || !kiData.combined) return;

  const toApply = [
    { deltas: window.pendingPensionDeltas, idx: 3, label: '연금저축' },
    { deltas: window.pendingIrp1Deltas,   idx: 7, label: 'IRP1' },
    { deltas: window.pendingIrp2Deltas,   idx: 8, label: 'IRP2' },
  ].filter(({ deltas }) => deltas && Object.keys(deltas).length > 0);

  if (toApply.length === 0) return;

  const allUpdatedMonths = new Set();

  toApply.forEach(({ deltas, idx }) => {
    const deltaMonths    = Object.keys(deltas).sort();
    const firstJsonMonth = deltaMonths[0];

    kiData.combined.forEach((entry, i) => {
      const ym = entry.month || (entry.date || '').slice(0, 7);
      if (ym >= firstJsonMonth) {
        const prevInvest = i > 0 ? (kiData.combined[i-1].invest[idx] || 0) : 0;
        entry.invest[idx] = prevInvest + (deltas[ym] || 0);
        allUpdatedMonths.add(ym);
      }
    });
  });

  localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  scheduleGasSync_();
  renderAll();
  if (typeof renderKiwoom === 'function') renderKiwoom();
  document.getElementById('pension-transfer-modal').style.display = 'none';

  const labels   = toApply.map(({ label }) => label).join(', ');
  const monthStr = [...allUpdatedMonths].sort()
    .map(ym => ym.replace(/^(\d{4})-(\d{2})$/, '$1년 $2월'))
    .join(', ');
  alert(`[${labels}] 과거 기록을 보존하며 ${monthStr} 투자금을 성공적으로 업데이트했습니다.`);
}

