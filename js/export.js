// ═══════════════════════════════════════════
//  ★ 데이터 내보내기 / 가져오기
// ═══════════════════════════════════════════
function exportData() {
  const data = {
    version:    1,
    exportedAt: new Date().toISOString(),
    state:      JSON.parse(localStorage.getItem('asset-dashboard-v3') || '{}'),
    todos:      JSON.parse(localStorage.getItem('asset-todos') || '[]'),
    goal:       JSON.parse(localStorage.getItem('asset-goal') || '{}'),
    kiwoom:     JSON.parse(localStorage.getItem('kiwoom-data') || 'null'),
  };
  localStorage.setItem('asset-dashboard-ts', data.exportedAt);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'data.json';
  a.click(); URL.revokeObjectURL(url);
}

function exportMonthlyXlsx() {
  if (!kiData || !kiData.combined || !kiData.combined.length) {
    alert('월별 데이터가 없습니다.\n키움 엑셀 업로드 또는 스냅샷 적용 후 사용해주세요.');
    return;
  }

  const AI_NAMES = ['해외','오빌','자사주','개인연금저축','별동대','연습','초빌','IRP 1','IRP 2','ISA','RIA'];
  const MAIN_IDX = [0, 1, 5, 3, 7, 8, 9, 10]; // 주요 8계좌 인덱스
  const combined = kiData.combined;
  const st       = state || {};

  // 1. 월별 평가금액
  const evalRows = combined.map(e => {
    const ev      = e.eval || new Array(11).fill(0);
    const mainSum = MAIN_IDX.reduce((s, i) => s + (ev[i] || 0), 0);
    return [e.date || e.month, ...AI_NAMES.map((_, i) => ev[i] || 0), mainSum];
  });

  // 2. 월별 투자금 (tossHistory 합산)
  const th = kiData?.tossHistory || {};
  const investRows = combined.map(e => {
    const inv = [...(e.invest || new Array(11).fill(0))]; // 원본 보존을 위해 복사
    const ym  = (e.date || e.month || '').slice(0, 7);
    inv[0] = (inv[0] || 0) + (th['toss-overseas']?.[ym] || 0);
    inv[1] = (inv[1] || 0) + (th['toss-obil']?.[ym]     || 0);
    inv[3] = (inv[3] || 0) + (th['toss-pension']?.[ym]  || 0);
    inv[5] = (inv[5] || 0) + (th['toss-practice']?.[ym] || 0);
    const mainSum = MAIN_IDX.reduce((s, i) => s + (inv[i] || 0), 0);
    return [e.date || e.month, ...AI_NAMES.map((_, i) => inv[i] || 0), mainSum];
  });

  // 3. 월별 수익률 (공식: (평가금 - 투자금) / 투자금 * 100)
  const retRows = combined.map(e => {
    const ev  = e.eval   || new Array(11).fill(0);
    const inv = e.invest || new Array(11).fill(0);
    const pcts = AI_NAMES.map((_, i) => {
      const currentIn = inv[i] || 0;
      const currentEv = ev[i]  || 0;
      return currentIn > 0 ? +(((currentEv - currentIn) / currentIn) * 100).toFixed(2) : 0;
    });
    const mainEv  = MAIN_IDX.reduce((s, i) => s + (ev[i]  || 0), 0);
    const mainIn  = MAIN_IDX.reduce((s, i) => s + (inv[i] || 0), 0);
    const mainPct = mainIn > 0 ? +(((mainEv - mainIn) / mainIn) * 100).toFixed(2) : 0;
    return [e.date || e.month, ...pcts, mainPct];
  });

  // 4. 스냅샷 현황
  const latest   = combined[combined.length - 1] || { invest:[], eval:[] };
  const snapRows = [
    ['항목', '값', '단위', '기준일'],
    ['개인연금저축(원금)',   latest.invest[3] || 0,            '원', latest.date || ''],
    ['개인연금저축(평가)',   latest.eval[3]   || 0,            '원', latest.date || ''],
    ['오빌모으기(토스)',     st['toss-obil']?.val     || 0,    '원', st['toss-obil']?.date     || ''],
    ['개인연금모으기(토스)', st['toss-pension']?.val   || 0,   '원', st['toss-pension']?.date   || ''],
    ['해외자금모으기(토스)', st['toss-overseas']?.val  || 0,   '원', st['toss-overseas']?.date  || ''],
    ['연습모으기(토스)',     st['toss-practice']?.val  || 0,   '원', st['toss-practice']?.date  || ''],
    ['키움-해외(평가)',      latest.eval[0] || 0,              '원', latest.date || ''],
    ['키움-오빌(평가)',      latest.eval[1] || 0,              '원', latest.date || ''],
    ['연금-IRP1(평가)',      latest.eval[7] || 0,              '원', latest.date || ''],
    ['연금-IRP2(평가)',      latest.eval[8] || 0,              '원', latest.date || ''],
    ['ISA(평가)',            st['isa']?.val            || 0,   '원', st['isa']?.date            || ''],
    ['RIA(평가)',            latest.eval[10]           || 0,   '원', latest.date || ''],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['날짜', ...AI_NAMES, '합계(주요8계좌)'], ...evalRows]),   '월별평가금액');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['날짜', ...AI_NAMES, '합계(주요8계좌)'], ...investRows]), '월별투자금');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['날짜', ...AI_NAMES, '전체수익률(%)'],    ...retRows]),    '월별수익률(%)');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(snapRows), '스냅샷현황');

  // 토스모으기이력 시트
  const tossLabels = { 'toss-overseas':'해외', 'toss-pension':'개인연금저축', 'toss-obil':'오빌', 'toss-practice':'연습' };
  const tossKeys   = Object.keys(tossLabels);
  const thAll      = kiData?.tossHistory || {};
  const allYms     = [...new Set(tossKeys.flatMap(k => Object.keys(thAll[k] || {})))].sort();
  const tossRows   = allYms.map(ym =>
    [ym, ...tossKeys.map(k => thAll[k]?.[ym] || 0)]
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['월', ...Object.values(tossLabels)], ...tossRows]), '토스모으기이력');

  XLSX.writeFile(wb, `asset_monthly_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version) throw new Error('올바른 형식이 아닙니다');
      if (data.state)  localStorage.setItem('asset-dashboard-v3', JSON.stringify(data.state));
      if (data.todos)  localStorage.setItem('asset-todos',        JSON.stringify(data.todos));
      if (data.goal)   localStorage.setItem('asset-goal',         JSON.stringify(data.goal));
      if (data.kiwoom) localStorage.setItem('kiwoom-data',        JSON.stringify(data.kiwoom));
      alert('✅ 데이터를 성공적으로 불러왔습니다. 페이지를 새로고침합니다.');
      location.reload();
    } catch(err) { alert('❌ 파일을 읽는 중 오류가 발생했습니다: ' + err.message); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ═══════════════════════════════════════════
//  ★ 토스 엑셀 업로드 (폴백 방법)
// ═══════════════════════════════════════════
document.getElementById('toss-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const wb = XLSX.read(evt.target.result, { type:'array', cellDates:true });
      [['오빌모으기',        'toss-obil',      'val-toss-obil',      'date-toss-obil'],
       ['해외자금모으기',    'toss-overseas',  'val-toss-overseas',  'date-toss-overseas'],
       ['개인연금저축모으기','toss-pension',   'val-toss-pension',   'date-toss-pension'],
       ['연습모으기',        'toss-practice',  'val-toss-practice',  'date-toss-practice']
      ].forEach(([sheet, key, valId, dateId]) => {
        const r = parseTossBalance(wb, sheet);
        if (r) {
          state[key] = { val: r.balance, date: r.date, isFallback: !!r.isFallback };
          document.getElementById(valId).textContent = r.balance.toLocaleString('ko-KR');
          const de = document.getElementById(dateId);
          if (de && r.date) {
            de.textContent = r.isFallback ? '최종 데이터: ' + r.date + ' (이번 달 미조회)' : '기준: ' + r.date;
            de.style.color = r.isFallback ? 'var(--orange)' : '';
          }
          // tossHistory 해당 월 자동 업데이트
          if (kiData && r.date) {
            const ym = r.date.slice(0, 7);
            if (!kiData.tossHistory) kiData.tossHistory = {};
            if (!kiData.tossHistory[key]) kiData.tossHistory[key] = {};
            kiData.tossHistory[key][ym] = r.balance;
          }
          // toss-pension 갱신 시 eval[3] 재계산 (pension-saving + 새 toss값)
          if (key === 'toss-pension' && kiData?.combined?.length) {
            const latest = kiData.combined[kiData.combined.length - 1];
            if (!latest.eval) latest.eval = [];
            const pensionSavingVal = state['pension-saving']?.val || 0;
            latest.eval[3] = pensionSavingVal + r.balance;
          }
          if (kiData) localStorage.setItem('kiwoom-data', JSON.stringify(kiData));
        }
      });
      save(); renderAll();
    } catch(err) { alert('토스 파일 오류: ' + err.message); }
  };
  reader.readAsArrayBuffer(file);
});

function parseTossBalance(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const data = XLSX.utils.sheet_to_json(ws, { header:1, defval:null, raw:true, cellDates:true });
  let headerRowIdx = -1, balCol = -1, dateCol = -1;
  for (let i = 0; i < data.length; i++) {
    const row = data[i]; if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      if (row[j] === '잔고' || row[j] === '잔액') { headerRowIdx = i; balCol = j; break; }
    }
    if (headerRowIdx >= 0) {
      for (let j = 0; j < data[headerRowIdx].length; j++) {
        if (data[headerRowIdx][j] === '일자' || data[headerRowIdx][j] === '날짜') { dateCol = j; break; }
      }
      break;
    }
  }
  if (headerRowIdx < 0 || balCol < 0) return null;
  const entries = [];
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i]; if (!row) continue;
    const balRaw = row[balCol];
    const bal    = typeof balRaw === 'string' ? parseFloat(balRaw.replace(/,/g,'')) : Number(balRaw);
    if (isNaN(bal) || bal <= 0) continue;
    let dateObj = null;
    if (dateCol >= 0 && row[dateCol] != null) {
      const raw = row[dateCol];
      if (raw instanceof Date)                    dateObj = raw;
      else if (typeof raw === 'number')           dateObj = new Date(Math.round((raw - 25569) * 86400 * 1000));
      else if (typeof raw === 'string' && raw.trim()) dateObj = new Date(raw.trim());
    }
    entries.push({ balance: Math.round(bal), dateObj, dateStr: dateObj ? dateObj.toISOString().slice(0,10) : null });
  }
  if (entries.length === 0) return null;
  entries.sort((a, b) => {
    if (!a.dateObj && !b.dateObj) return 0;
    if (!a.dateObj) return 1; if (!b.dateObj) return -1;
    return b.dateObj - a.dateObj;
  });
  const now        = new Date();
  const thisYM     = now.getFullYear() * 100 + (now.getMonth() + 1);
  const hasThisMonth = entries.some(e => e.dateObj && e.dateObj.getFullYear() * 100 + (e.dateObj.getMonth() + 1) === thisYM);
  const pick       = hasThisMonth
    ? entries.find(e => e.dateObj && e.dateObj.getFullYear() * 100 + (e.dateObj.getMonth() + 1) === thisYM)
    : entries[0];
  return { balance: pick.balance, date: pick.dateStr, isFallback: !hasThisMonth };
}
