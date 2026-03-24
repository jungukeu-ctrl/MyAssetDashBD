// ═══════════════════════════════════════════
//  ★ Firebase URL
// ═══════════════════════════════════════════
const FIREBASE_URL = 'https://my-asset-dashboard-9e6f9-default-rtdb.asia-southeast1.firebasedatabase.app';

// ═══════════════════════════════════════════
//  ★ 키 / 상수 정의
// ═══════════════════════════════════════════
const MANUAL_KEYS = ['apt-owned','apt-rent','bank-housing','bank-rent','bank-general','stock-kr1','stock-kr2','stock-us','irp1','irp2','pension-natl'];
const TOSS_KEYS   = ['toss-obil','toss-overseas','toss-pension','toss-practice'];

const KIWOOM_SNAP_KEYS = ['kiwoom-overseas','kiwoom-ria','kiwoom-obil','kiwoom-practice','kiwoom-jasaju','kiwoom-byuldong','kiwoom-chobil'];
const KIWOOM_SNAP_INFO = {
  'kiwoom-overseas': { name:'해외',   acct:'5211-3751', color:'#6e8efb' },
  'kiwoom-ria':      { name:'RIA',    acct:'6598-2304', color:'#ff9f7f' },
  'kiwoom-obil':     { name:'오빌',   acct:'5128-4051', color:'#ffb347' },
  'kiwoom-practice': { name:'연습',   acct:'5806-1320', color:'#4ecdc4' },
  'kiwoom-jasaju':   { name:'자사주', acct:'6139-5535', color:'#ff6b6b' },
  'kiwoom-byuldong': { name:'별동대', acct:'5845-3671', color:'#c9a84c' },
  'kiwoom-chobil':   { name:'초빌',   acct:'5185-9447', color:'#565a70' },
};

const PENSION_SNAP_KEYS = ['pension-irp1','pension-irp2','pension-saving','isa','ria'];
const PENSION_SNAP_INFO = {
  'pension-irp1':   { name:'퇴직연금 IRP 1', label:'유정욱_IRP', evalIdx:7,    color:'#e07b6a', tossKey:null },
  'pension-irp2':   { name:'퇴직연금 IRP 2', label:'개인형IRP',  evalIdx:8,    color:'#e0a06a', tossKey:null },
  'pension-saving': { name:'개인연금저축',    label:'연금저축',    evalIdx:3,    color:'#b089f0', tossKey:'toss-pension' },
  'isa':            { name:'ISA(삼성증권)',   label:'ISA',        evalIdx:null, color:'#5bc8af', tossKey:null },
  'ria':            { name:'RIA(키움)',       label:'RIA',        evalIdx:10,   color:'#ff9f7f', tossKey:null },
};

const KIWOOM_ACCOUNTS = ['해외','오빌','자사주','개인연금저축','별동대','연습','초빌'];
const MAIN_ACCOUNTS   = ['해외','오빌','연습','개인연금저축','퇴직연금001','퇴직연금002','ISA','RIA'];
const ACCT_COLORS = {
  '해외':'#6e8efb', '오빌':'#ffb347', '연습':'#4ecdc4',
  '개인연금저축':'#b089f0', '자사주':'#ff6b6b', '별동대':'#c9a84c',
  '초빌':'#565a70', '퇴직연금001':'#e07b6a', '퇴직연금002':'#e0a06a',
  'ISA':'#5bc8af', 'RIA':'#ff9f7f'
};

const CAT_LABELS = ['부동산', '금융자산', '연금/IRP'];
const CAT_COLORS = ['#6e8efb', '#4ecdc4', '#c9a84c'];

const KI_SNAP_IDX = {
  'kiwoom-overseas':0, 'kiwoom-obil':1, 'kiwoom-jasaju':2,
  'kiwoom-byuldong':4, 'kiwoom-practice':5, 'kiwoom-chobil':6,
  'kiwoom-ria':10
};
const KI_TOSS_PAIR = {
  'kiwoom-overseas':'toss-overseas',
  'kiwoom-obil':'toss-obil',
  'kiwoom-practice':'toss-practice',
};
const KI_TRANSFER_IDX = { '해외':0, '오빌':1, '자사주':2, '별동대':4, '연습':5, '초빌':6 };

// ═══════════════════════════════════════════
//  ★ 전역 상태 변수
// ═══════════════════════════════════════════
let state  = {};
let todos  = [];
let goal   = { name:'총 목표자산', target:0, finName:'금융 목표자산', finTarget:0 };
let kiData = null;
let chartRange = 12;

// 모달 pending 결과
let aiPendingResult       = null;
let kiwoomPendingResult   = null;
let pensionPendingResult  = null;
let transferPendingResult = null;
let isaPendingResult      = null;

// ═══════════════════════════════════════════
//  ★ 포맷 함수
// ═══════════════════════════════════════════
function fmt(n) { return n ? n.toLocaleString('ko-KR') : '0'; }

function fmtWon(n) {
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100000000) return sign + (abs / 100000000).toFixed(1) + '억';
  if (abs >= 10000)     return sign + Math.round(abs / 10000).toLocaleString() + '만';
  return sign + abs.toLocaleString() + '원';
}

function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
