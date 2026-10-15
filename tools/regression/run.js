#!/usr/bin/env node
/**
 * run.js — pension 모듈 기준값 회귀 검증 (OPS-REGRESSION-001)
 *
 * 사용법:
 *   node tools/regression/run.js                              비교 (일치 exit 0 / 불일치 exit 1 / 예외 exit 2)
 *   node tools/regression/run.js --record --reason "<사유>"   기준값 갱신 (의도된 로직 변경일 때만)
 *
 * js/pension/ps-config.js → ps-engine.js → ps-withdrawal.js 를 node vm 으로 로드하고
 * actualData=null 로 고정 시나리오를 실행한다. 순수 node, 외부 패키지 없음, 네트워크 없음.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const ROOT          = path.resolve(__dirname, '..', '..');
const SRC_FILES     = ['ps-config.js', 'ps-engine.js', 'ps-withdrawal.js']; // 의존 순서
const BASELINE_PATH = path.join(__dirname, 'baseline.json');
const AGE_MIN = 55;
const AGE_MAX = 100;

// 시나리오: PS_DEFAULT_PARAMS 깊은 복사본에 덮어쓴다 (원본 변형 금지)
const SCENARIOS = [
  { name: 'default', desc: 'PS_DEFAULT_PARAMS 그대로 (excessMode=cap15m_thenExpand)', apply: () => {} },
  { name: 'excessmode-comprehensive', desc: "withdrawal.excessMode='comprehensive'",
    apply: p => { p.withdrawal.excessMode = 'comprehensive'; } },
  { name: 'excessmode-separate16_5', desc: "withdrawal.excessMode='separate16_5' (사적연금 연 1,500만원 초과 시 전액 16.5%)",
    apply: p => { p.withdrawal.excessMode = 'separate16_5'; } }
];

// ─── 로더 ────────────────────────────────────────────────────────────────────
/** 매 실행마다 새 vm context 를 만든다 (실행 간 상태 공유 방지) */
function loadModules() {
  const state = { warnings: 0 };
  const sink = () => {};
  const ctx = vm.createContext({
    console: { log: sink, info: sink, debug: sink, error: sink, warn: () => { state.warnings++; } }
  });
  for (const f of SRC_FILES) {
    const file = path.join(ROOT, 'js', 'pension', f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  }
  return { ctx, state, get: expr => vm.runInContext(expr, ctx) };
}

const r0 = v => Math.round(Number(v) || 0);

// ─── 시나리오 실행 → 평탄화 전 구조 ──────────────────────────────────────────
function runScenario(sc) {
  const { state, get } = loadModules();
  const params = JSON.parse(JSON.stringify(get('PS_DEFAULT_PARAMS')));
  sc.apply(params);

  const result = get('PensionEngine').run(params, null);
  const wd = get('PensionWithdrawal');

  // 1. 적립 종료(퇴직) 시점 계좌별 잔액
  const retire = result.events.find(e => e.type === 'retire');
  if (!retire) throw new Error(`${sc.name}: retire 이벤트 없음`);
  const retireIdx = result.months.indexOf(retire.ym);
  if (retireIdx < 0) throw new Error(`${sc.name}: retire 월(${retire.ym})이 months 범위 밖`);
  const retireBalances = {};
  Object.keys(result.forecast.byAccount).forEach(k => {
    retireBalances[k] = r0(result.forecast.byAccount[k][retireIdx]);
  });

  // 2. 100세 시점 총자산
  const total100 = r0(result.forecast.total[result.forecast.total.length - 1]);

  // 3·4. 연령별(생일월 스냅샷, 월값×12 연 환산)
  const ages = {};
  let dependentLossAge = null;
  for (let age = AGE_MIN; age <= AGE_MAX; age++) {
    const r = wd.calc(age, result, params);
    const row = {
      pensionTax:   r0(r.totalTax * 12),
      healthIns:    r0(r.healthInsurance.monthly * 12),
      hiType:       r.healthInsurance.type,
      excessTriggeredYear: !!r.withdrawal.excessTriggeredYear,
      excessAnnualTotal:   r0(r.withdrawal.excessAnnualTotal),
      sources: {}
    };
    r.sources.forEach(s => {
      row.sources[s.name] = { gross: r0(s.monthly * 12), tax: r0(s.tax * 12) };
    });
    ages[String(age).padStart(3, '0')] = row;
    if (dependentLossAge === null && r.healthInsurance.type !== '피부양자') dependentLossAge = age;
  }

  return {
    compare: { retireBalances, total100, dependentLossAge, ages },
    info: { monthsLength: result.months.length, warnings: state.warnings }
  };
}

// ─── 직렬화 (키 정렬, 들여쓰기 2칸) ──────────────────────────────────────────
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).sort().forEach(k => { o[k] = sortKeys(v[k]); });
    return o;
  }
  return v;
}
const stringify = v => JSON.stringify(sortKeys(v), null, 2) + '\n';

/** 중첩 객체 → { 'a.b.c': leaf } */
function flatten(obj, prefix, out) {
  out = out || {};
  Object.keys(obj).forEach(k => {
    const key = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  });
  return out;
}

// ─── 실행 + 결정성 확인 ──────────────────────────────────────────────────────
function runAll() {
  const out = {};
  for (const sc of SCENARIOS) {
    const a = runScenario(sc);
    const b = runScenario(sc);
    if (stringify(a.compare) !== stringify(b.compare)) {
      const e = new Error(`비결정적: 시나리오 '${sc.name}' 를 같은 입력으로 두 번 실행했을 때 결과가 다릅니다`);
      e.exitCode = 1;
      throw e;
    }
    out[sc.name] = a;
  }
  return out;
}

function parseArgs(argv) {
  const args = { record: false, reason: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--record') args.record = true;
    else if (argv[i] === '--reason') args.reason = argv[++i] || '';
    else throw new Error(`알 수 없는 인자: ${argv[i]}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.record && !(args.reason && args.reason.trim())) {
    console.error('--record 는 --reason "<사유>" 없이 실행할 수 없습니다.');
    return 2;
  }

  const current = runAll();

  if (args.record) {
    const scenarios = {};
    const info = {};
    SCENARIOS.forEach(sc => { scenarios[sc.name] = current[sc.name].compare; info[sc.name] = current[sc.name].info; });
    const baseline = {
      meta: {
        task: 'OPS-REGRESSION-001',
        rounding: '모든 금액은 Math.round 로 정수 원 단위 저장·비교 (연령별 값은 생일월 스냅샷의 월값×12 연 환산 후 반올림)',
        ageRange: [AGE_MIN, AGE_MAX],
        source: 'PensionEngine.run(params, null) + PensionWithdrawal.calc(age, result, params)',
        scenarioDescriptions: Object.fromEntries(SCENARIOS.map(s => [s.name, s.desc])),
        info,
        lastRecord: { reason: args.reason.trim(), at: new Date().toISOString() }
      },
      scenarios
    };
    fs.writeFileSync(BASELINE_PATH, stringify(baseline));
    console.log(`기준값 기록 완료: ${path.relative(ROOT, BASELINE_PATH)} (${SCENARIOS.length}개 시나리오)`);
    return 0;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`baseline.json 없음: ${BASELINE_PATH}`);
    return 2;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

  const diffs = [];
  SCENARIOS.forEach(sc => {
    const base = flatten((baseline.scenarios || {})[sc.name] || {});
    const cur  = flatten(current[sc.name].compare);
    new Set([...Object.keys(base), ...Object.keys(cur)]).forEach(k => {
      const b = base[k], c = cur[k];
      if (b !== c) diffs.push({ scenario: sc.name, item: k, base: b, cur: c });
    });
  });

  SCENARIOS.forEach(sc => {
    const i = current[sc.name].info;
    console.log(`[${sc.name}] months=${i.monthsLength} warnings(알려진 console.warn)=${i.warnings}`);
  });

  if (diffs.length === 0) {
    console.log(`✅ 기준값 일치 (${SCENARIOS.length}개 시나리오)`);
    return 0;
  }

  console.log(`\n❌ 기준값 불일치 ${diffs.length}건`);
  console.log(['시나리오', '항목', '기준값', '현재값', '차이'].join('\t'));
  diffs.slice(0, 200).forEach(d => {
    const diff = (typeof d.base === 'number' && typeof d.cur === 'number') ? d.cur - d.base : '-';
    console.log([d.scenario, d.item, d.base === undefined ? '(없음)' : d.base, d.cur === undefined ? '(없음)' : d.cur, diff].join('\t'));
  });
  if (diffs.length > 200) console.log(`... 외 ${diffs.length - 200}건 생략`);
  return 1;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(e && e.message ? e.message : e);
  process.exitCode = e && e.exitCode ? e.exitCode : 2;
}
