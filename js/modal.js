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
  accounts.forEach(a => {
    if (!a.key || !TOSS_KEYS.includes(a.key)) return;
    state[a.key] = { val: a.balance, date, isFallback: false };
  });
  save();
  renderAll();
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
      eval: new Array(9).fill(0),
      _hasToss: true,
    };
    kiData.combined.push(entry);
    kiData.combined.sort((a, b) => (a.date || a.month || '').localeCompare(b.date || b.month || ''));
  } else {
    entry.date = date;
    entry._hasToss = true;
    if (!entry.eval) entry.eval = new Array(9).fill(0);
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
  renderKiwoomSnap();
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
      eval: new Array(9).fill(0),
      _hasToss: true,
    };
    kiData.combined.push(entry);
    kiData.combined.sort((a, b) => (a.date || a.month || '').localeCompare(b.date || b.month || ''));
  } else {
    entry.date = date;
    if (!entry.eval) entry.eval = new Array(9).fill(0);
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
  renderPensionSnap();
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
          eval: new Array(9).fill(0),
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
          eval: new Array(9).fill(0),
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
    const monthlySum = {};
    parsed.transactions.forEach(t => {
      if (t.type !== '입금') return;
      const isMatch = acctType === 'irp1'
        ? t.counterpart.includes('현금성자산(삼성증권)')
        : (t.counterpart === '이체입금' || t.counterpart === '유정욱');
      if (isMatch) {
        const ym = t.date.slice(0, 7);
        monthlySum[ym] = (monthlySum[ym] || 0) + t.amount;
      }
    });
    window.pendingPensionDeltas = monthlySum;
    window.pendingPensionAcctType = acctType;
    const count = Object.keys(monthlySum).length;
    log.style.color = count > 0 ? 'var(--teal)' : 'var(--red)';
    log.textContent = (count > 0 ? '✅ ' : '❌ ') + count + '개월분 이체내역 인식 성공';
    btn.disabled = count === 0;
  } catch(e) {
    log.style.color = 'var(--red)';
    log.textContent = '❌ 오류: ' + e.message;
  }
}

function applyTransferData(type) {
  const deltas = window.pendingPensionDeltas;
  if (!deltas || !kiData || !kiData.combined) return;

  const ACCT_IDX = { 'pension': 3, 'irp1': 7 };
  const acctType = window.pendingPensionAcctType || 'pension';
  const idx      = ACCT_IDX[acctType] ?? 3;
  const deltaMonths  = Object.keys(deltas).sort();
  if (deltaMonths.length === 0) return;

  // JSON에 포함된 가장 빠른 달 (이전 데이터 보호 기준)
  const firstJsonMonth = deltaMonths[0];

  kiData.combined.forEach((entry, i) => {
    const ym = entry.month || (entry.date || '').slice(0, 7);
    // 핵심 보호 로직: JSON 데이터 시작 시점부터만 업데이트
    if (ym >= firstJsonMonth) {
      const prevInvest = i > 0 ? (kiData.combined[i-1].invest[idx] || 0) : 0;
      entry.invest[idx] = prevInvest + (deltas[ym] || 0);
    }
  });

  localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
  scheduleGasSync_();
  renderAll();
  if (typeof renderKiwoom === 'function') renderKiwoom();
  document.getElementById('pension-transfer-modal').style.display = 'none';

  // ★ 동적 월 표시: 실제 업데이트된 월을 알림에 반영
  const updatedMonths = deltaMonths.filter(ym => ym >= firstJsonMonth);
  const monthStr = updatedMonths
    .map(ym => ym.replace(/^(\d{4})-(\d{2})$/, '$1년 $2월'))
    .join(', ');
  alert(`과거 기록을 보존하며 ${monthStr} 투자금을 성공적으로 업데이트했습니다.`);
}
