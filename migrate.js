/**
 * migrate.js — Firebase 데이터 마이그레이션 스크립트
 *
 * 역할:
 *   1. 데이터원본_2602.xlsx 파싱
 *   2. migration-payload.json 생성 (브라우저 콘솔 붙여넣기용 데이터)
 *   3. paste-in-console.js 생성 (브라우저 콘솔에 붙여넣을 완성 스크립트)
 *
 * 사용법:
 *   node migrate.js
 *   → paste-in-console.js 생성됨
 *   → 대시보드에 로그인 후 브라우저 콘솔에 붙여넣기
 */

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

// ── 상수 ──────────────────────────────────────────────────────────
const XLSX_FILE = path.join(__dirname, '데이터원본_2603.xlsx');

// 평가금액 컬럼 → eval 인덱스
const EVAL_COL_IDX = {
  '해외': 0, '오빌': 1, '자사주': 2, '개인연금저축': 3,
  '별동대': 4, '연습': 5, '초빌': 6, '퇴직연금001': 7, '퇴직연금002': 8,
};

// 누적입금 컬럼 → invest 인덱스
const INVEST_COL_IDX = {
  '오빌': 1, '초빌': 6, '해외': 0, '연습': 5, '별동대': 4, '자사주': 2,
};

// 토스잔고 컬럼 → toss 키
const TOSS_COL_KEY = {
  '해외': 'toss-overseas', '개인연금저축': 'toss-pension', '오빌': 'toss-obil',
  '연습': 'toss-practice', '자사주': 'toss-jasaju', '초빌': 'toss-chobil', '별동대': 'toss-byuldong',
};

// Firebase 보존 인덱스 (Excel에서 덮어쓰지 않음)
const PRESERVE_EVAL_IDX   = [9, 10];              // ISA, RIA
const PRESERVE_INVEST_IDX = [3, 7, 8, 9, 10];     // 개인연금저축, IRP1, IRP2, ISA, RIA

// ── 유틸 ──────────────────────────────────────────────────────────
function excelSerialToDate(serial) {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function toMonth(dateStr) { return dateStr.slice(0, 7); }

function cleanNum(v) {
  if (v === '-' || v === '—' || v === '' || v == null) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── Excel 로드 ────────────────────────────────────────────────────
console.log('📂 Excel 파일 로드:', XLSX_FILE);
const wb = XLSX.readFile(XLSX_FILE);

// ── 1. 평가금액 시트 파싱 ─────────────────────────────────────────
console.log('\n[1] 평가금액 시트 파싱...');
const evalSheet = wb.Sheets['평가금액'];
const evalRows  = XLSX.utils.sheet_to_json(evalSheet, { header: 1, raw: true });
const evalHeader = evalRows[0];
console.log('  헤더:', evalHeader);

// 월별 최신 행 (해당 월 마지막 날짜 기준)
const evalMonthMap = {}; // YYYY-MM → { date, eval: [11] }
for (let i = 1; i < evalRows.length; i++) {
  const row = evalRows[i];
  if (!row[0] || typeof row[0] !== 'number') continue;
  const dateStr = excelSerialToDate(row[0]);
  const month   = toMonth(dateStr);
  if (!evalMonthMap[month] || dateStr > evalMonthMap[month].date) {
    const evalArr = new Array(11).fill(0);
    evalHeader.forEach((col, ci) => {
      if (ci === 0) return;
      const idx = EVAL_COL_IDX[col];
      if (idx !== undefined) evalArr[idx] = cleanNum(row[ci]);
    });
    evalMonthMap[month] = { date: dateStr, eval: evalArr };
  }
}
console.log(`  → ${Object.keys(evalMonthMap).length}개 월 (${Object.keys(evalMonthMap)[0]} ~ ${Object.keys(evalMonthMap).at(-1)})`);

// ── 2. 누적입금 시트 파싱 ─────────────────────────────────────────
console.log('\n[2] 누적입금 시트 파싱...');
const investSheet  = wb.Sheets['누적입금'];
const investRows   = XLSX.utils.sheet_to_json(investSheet, { header: 1, raw: true });
const investHeader = investRows[0];
console.log('  헤더:', investHeader);

const investMonthMap = {}; // YYYY-MM → { date, invest: [11] }
for (let i = 1; i < investRows.length; i++) {
  const row = investRows[i];
  if (!row[0] || typeof row[0] !== 'number') continue;
  const dateStr = excelSerialToDate(row[0]);
  const month   = toMonth(dateStr);
  if (!investMonthMap[month] || dateStr > investMonthMap[month].date) {
    const investArr = new Array(11).fill(0);
    investHeader.forEach((col, ci) => {
      if (ci === 0) return;
      const idx = INVEST_COL_IDX[col];
      if (idx !== undefined) investArr[idx] = cleanNum(row[ci]);
    });
    investMonthMap[month] = { date: dateStr, invest: investArr };
  }
}
console.log(`  → ${Object.keys(investMonthMap).length}개 월 (${Object.keys(investMonthMap)[0]} ~ ${Object.keys(investMonthMap).at(-1)})`);

// ── 3. 토스잔고 시트 파싱 ─────────────────────────────────────────
console.log('\n[3] 토스잔고 시트 파싱...');
const tossSheet  = wb.Sheets['토스잔고'];
const tossRows   = XLSX.utils.sheet_to_json(tossSheet, { header: 1, raw: true });
const tossHeader = tossRows[0];
console.log('  헤더:', tossHeader);

// 월별 최신 값 (tossHistory용)
const tossMonthMap = {}; // YYYY-MM → { date, [tossKey]: val }
// 각 키별 최신 non-zero 값 추적
const tossLatestByKey = {}; // tossKey → { val, date }

for (let i = 1; i < tossRows.length; i++) {
  const row = tossRows[i];
  if (!row[0] || typeof row[0] !== 'number') continue;
  const dateStr = excelSerialToDate(row[0]);
  const month   = toMonth(dateStr);

  const vals = {};
  tossHeader.forEach((col, ci) => {
    if (ci === 0) return;
    const key = TOSS_COL_KEY[col];
    if (key) vals[key] = cleanNum(row[ci]);
  });

  if (!tossMonthMap[month] || dateStr > tossMonthMap[month].date) {
    tossMonthMap[month] = { date: dateStr, ...vals };
  }
  // 각 키별: 최신 날짜 추적 (0 포함), 별도로 최신 non-zero 날짜 추적
  Object.entries(vals).forEach(([k, v]) => {
    if (!tossLatestByKey[k] || dateStr > tossLatestByKey[k].date) {
      tossLatestByKey[k] = { val: v, date: dateStr };
    }
  });
}
console.log(`  → ${Object.keys(tossMonthMap).length}개 월 (${Object.keys(tossMonthMap)[0]} ~ ${Object.keys(tossMonthMap).at(-1)})`);
const tossLatestDate = Object.values(tossLatestByKey).reduce((max, {date}) => date > max ? date : max, '');
console.log(`  최신 날짜: ${tossLatestDate}`);

// ── 4. 새 combined 배열 구성 ─────────────────────────────────────────
console.log('\n[4] combined 배열 구성...');
const allMonths = [...new Set([
  ...Object.keys(evalMonthMap),
  ...Object.keys(investMonthMap),
])].sort();

const newCombinedFromExcel = allMonths.map(month => {
  const eRow = evalMonthMap[month];
  const iRow = investMonthMap[month];
  const date = (() => {
    if (eRow && iRow) return eRow.date > iRow.date ? eRow.date : iRow.date;
    return (eRow || iRow).date;
  })();
  return {
    month,
    date,
    eval:   (eRow?.eval   ?? new Array(11).fill(0)).slice(),
    invest: (iRow?.invest ?? new Array(11).fill(0)).slice(),
  };
});
console.log(`  → ${newCombinedFromExcel.length}개 항목 (${allMonths[0]} ~ ${allMonths.at(-1)})`);

// ── 5. tossHistory 구성 ───────────────────────────────────────────
console.log('\n[5] tossHistory 구성...');
const allTossKeys = Object.values(TOSS_COL_KEY);
const newTossHistory = {};
allTossKeys.forEach(k => { newTossHistory[k] = {}; });

Object.entries(tossMonthMap)
  .forEach(([month, data]) => {
    allTossKeys.forEach(k => {
      const val = data[k];
      if (val !== undefined && val !== 0) {
        newTossHistory[k][month] = val;
      }
    });
  });

allTossKeys.forEach(k => {
  const months = Object.keys(newTossHistory[k]);
  console.log(`  ${k}: ${months.length}개 월`);
});

// ── 6. 신규 toss state 키 (각 키별 최신 non-zero 값) ─────────────
const newTossStateKeys = {
  'toss-jasaju':   tossLatestByKey['toss-jasaju']   || { val: 0, date: '' },
  'toss-chobil':   tossLatestByKey['toss-chobil']   || { val: 0, date: '' },
  'toss-byuldong': tossLatestByKey['toss-byuldong'] || { val: 0, date: '' },
};
console.log('\n[6] 신규 toss state 키:');
Object.entries(newTossStateKeys).forEach(([k, v]) => {
  console.log(`  ${k}: ${v.val.toLocaleString()}원 (${v.date})`);
});

// ── 검증 출력 ─────────────────────────────────────────────────────
console.log('\n[검증] 마지막 3개 combined 항목:');
newCombinedFromExcel.slice(-3).forEach(r => {
  console.log(`  ${r.month} | eval[0]=${r.eval[0].toLocaleString()} 해외 | eval[1]=${r.eval[1].toLocaleString()} 오빌 | invest[1]=${r.invest[1].toLocaleString()} 오빌투자금`);
});

// ── payload JSON 저장 ─────────────────────────────────────────────
const payload = {
  newCombinedFromExcel,
  newTossHistory,
  newTossStateKeys,
  preserveEvalIdx:   PRESERVE_EVAL_IDX,
  preserveInvestIdx: PRESERVE_INVEST_IDX,
};
fs.writeFileSync(path.join(__dirname, 'migration-payload.json'), JSON.stringify(payload));
console.log('\n✅ migration-payload.json 저장 완료');

// ── 브라우저 콘솔 스크립트 생성 ───────────────────────────────────
console.log('\n[7] 브라우저 콘솔 스크립트 생성...');

const consoleScript = `
/* ================================================================
   Firebase 데이터 마이그레이션 콘솔 스크립트
   생성일: ${new Date().toISOString()}

   사용법:
   1. 대시보드에 로그인한 상태에서 실행
   2. 브라우저 콘솔에 이 파일 내용 전체를 붙여넣기
   3. runMigration() 실행
   ================================================================ */

(async function() {

// ── Excel에서 파싱한 데이터 ────────────────────────────────────────
const EXCEL_COMBINED  = ${JSON.stringify(newCombinedFromExcel)};
const EXCEL_TOSS_HIST = ${JSON.stringify(newTossHistory)};
const NEW_TOSS_KEYS   = ${JSON.stringify(newTossStateKeys)};
const PRESERVE_EVAL   = ${JSON.stringify(PRESERVE_EVAL_IDX)};
const PRESERVE_INVEST = ${JSON.stringify(PRESERVE_INVEST_IDX)};

// ── Firebase 토큰 획득 ────────────────────────────────────────────
async function getToken() {
  const token  = localStorage.getItem('fb_id_token');
  const expiry = Number(localStorage.getItem('fb_token_expiry') || '0');
  if (token && Date.now() < expiry) return token;
  // 토큰 갱신 시도
  const rt = localStorage.getItem('fb_refresh_token');
  if (!rt) throw new Error('로그인 토큰 없음. 대시보드에서 먼저 로그인하세요.');
  const res = await fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyDovmoYvhoeci4HNAcuAopU1f_kGzWj1eg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: rt }),
  });
  if (!res.ok) throw new Error('토큰 갱신 실패');
  const d = await res.json();
  localStorage.setItem('fb_id_token', d.id_token);
  localStorage.setItem('fb_refresh_token', d.refresh_token);
  localStorage.setItem('fb_token_expiry', String(Date.now() + (Number(d.expires_in) - 60) * 1000));
  return d.id_token;
}

const FB_URL = 'https://my-asset-dashboard-9e6f9-default-rtdb.asia-southeast1.firebasedatabase.app/asset-data.json';

// ── Firebase 현재 데이터 가져오기 ────────────────────────────────
console.log('📡 Firebase 현재 데이터 가져오는 중...');
const token   = await getToken();
const fetchRes = await fetch(FB_URL + '?auth=' + encodeURIComponent(token));
if (!fetchRes.ok) throw new Error('Firebase fetch 실패: ' + fetchRes.status);
const fbData  = await fetchRes.json();
console.log('✅ Firebase 데이터 수신 완료');

// ── 기존 combined에서 보존 인덱스 추출 ───────────────────────────
const existingCombined = (fbData.kiwoom && fbData.kiwoom.combined) || [];
const preserveMap = {}; // YYYY-MM → { eval: {...}, invest: {...} }
existingCombined.forEach(row => {
  if (!row || !row.month) return;
  if (row.month === '2026-03') return; // 삭제 대상
  preserveMap[row.month] = {
    eval:   PRESERVE_EVAL.reduce((o, i) => { o[i] = (row.eval && row.eval[i]) || 0; return o; }, {}),
    invest: PRESERVE_INVEST.reduce((o, i) => { o[i] = (row.invest && row.invest[i]) || 0; return o; }, {}),
  };
});
console.log('보존 대상 월 수:', Object.keys(preserveMap).length);

// ── 새 combined 완성 (Excel + 보존 인덱스 병합) ──────────────────
const newCombined = EXCEL_COMBINED.map(row => {
  const pres = preserveMap[row.month] || {};
  const evalArr   = row.eval.slice();
  const investArr = row.invest.slice();

  // 보존 인덱스 채우기
  if (pres.eval)   PRESERVE_EVAL.forEach(i   => { evalArr[i]   = pres.eval[i]   || 0; });
  if (pres.invest) PRESERVE_INVEST.forEach(i => { investArr[i] = pres.invest[i] || 0; });

  return { month: row.month, date: row.date, eval: evalArr, invest: investArr };
});

// ── tossHistory 병합 (기존 키 보존 + 신규 키 추가, 2026-03 제외) ──
const existingTossHist = (fbData.kiwoom && fbData.kiwoom.tossHistory) || {};
const mergedTossHist = JSON.parse(JSON.stringify(existingTossHist));

// 기존 tossHistory에서 2026-03 항목 제거
Object.keys(mergedTossHist).forEach(k => {
  if (mergedTossHist[k]['2026-03'] !== undefined) delete mergedTossHist[k]['2026-03'];
});

// Excel 데이터로 전체 덮어쓰기 (신규 3개 포함)
Object.entries(EXCEL_TOSS_HIST).forEach(([k, monthObj]) => {
  mergedTossHist[k] = monthObj; // Excel 데이터가 기준
});

// ── state 업데이트: 신규 toss 키 추가 ────────────────────────────
const existingState = fbData.state || {};
const newState = Object.assign({}, existingState);
Object.entries(NEW_TOSS_KEYS).forEach(([k, v]) => {
  // 기존에 없거나 더 최신 날짜인 경우만 업데이트
  if (!newState[k] || v.date > (newState[k].date || '')) {
    newState[k] = v;
  }
});

// ── 검증 출력 ────────────────────────────────────────────────────
console.log('\\n=== 마이그레이션 데이터 검증 ===');
console.log('새 combined 항목 수:', newCombined.length);
console.log('첫 항목:', newCombined[0]);
console.log('마지막 3개:');
newCombined.slice(-3).forEach(r => {
  const ep = r.eval, ip = r.invest;
  console.log(\`  \${r.month} | eval[0]=\${(ep[0]||0).toLocaleString()} | eval[1]=\${(ep[1]||0).toLocaleString()} | eval[9]=\${(ep[9]||0).toLocaleString()}(ISA) | invest[1]=\${(ip[1]||0).toLocaleString()}\`);
});
console.log('tossHistory 키:', Object.keys(mergedTossHist));
Object.entries(mergedTossHist).forEach(([k, obj]) => {
  const months = Object.keys(obj).sort();
  console.log(\`  \${k}: \${months.length}개월 (\${months[0]} ~ \${months.at(-1)})\`);
});
console.log('신규 toss state:', JSON.stringify(NEW_TOSS_KEYS, null, 2));

// ── 확인 후 업로드 ────────────────────────────────────────────────
const ok = confirm(
  \`Firebase에 데이터를 업로드합니다.\\n\\n\` +
  \`• combined: \${newCombined.length}개 항목\\n\` +
  \`• tossHistory: \${Object.keys(mergedTossHist).length}개 키\\n\` +
  \`• 신규 state 키: \${Object.keys(NEW_TOSS_KEYS).join(', ')}\\n\\n\` +
  \`계속하시겠습니까?\`
);
if (!ok) { console.log('❌ 취소됨'); return; }

// ── Firebase PATCH ────────────────────────────────────────────────
console.log('\\n⬆ Firebase 업로드 중...');
const patchToken = await getToken();
const patchRes = await fetch(FB_URL + '?auth=' + encodeURIComponent(patchToken), {
  method:  'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    kiwoom: {
      combined:    newCombined,
      tossHistory: mergedTossHist,
    },
    state: newState,
    exportedAt: new Date().toISOString(),
  }),
});
if (!patchRes.ok) {
  const errTxt = await patchRes.text();
  throw new Error('Firebase PATCH 실패: ' + patchRes.status + ' ' + errTxt);
}
console.log('✅ Firebase 업로드 완료!');

// ── localStorage 갱신 ────────────────────────────────────────────
const kiLocal = JSON.parse(localStorage.getItem('kiwoom-data') || '{}');
kiLocal.combined    = newCombined;
kiLocal.tossHistory = mergedTossHist;
localStorage.setItem('kiwoom-data', JSON.stringify(kiLocal));

const stateLocal = JSON.parse(localStorage.getItem('asset-dashboard-v3') || '{}');
Object.assign(stateLocal, newState);
localStorage.setItem('asset-dashboard-v3', JSON.stringify(stateLocal));

console.log('✅ localStorage 갱신 완료');
console.log('🔄 페이지를 새로고침하면 데이터가 반영됩니다.');

})().catch(err => console.error('❌ 마이그레이션 오류:', err.message, err));
`;

fs.writeFileSync(path.join(__dirname, 'paste-in-console.js'), consoleScript);
console.log('✅ paste-in-console.js 저장 완료');
console.log('\n📋 사용법:');
console.log('  1. 대시보드에 로그인');
console.log('  2. 브라우저 개발자 도구 콘솔 열기 (F12)');
console.log('  3. paste-in-console.js 내용 전체 복사 후 붙여넣기');
console.log('  4. "계속하시겠습니까?" 확인 버튼 클릭');
console.log('  5. 완료 후 페이지 새로고침');
