/**
 * ps-selfreliance.js — 자립률 계산 (순수 함수, SELFREL-001)
 * 의존: ps-config.js (PS_SELF_RELIANCE, PS_START_YM, PS_END_YM, psAgeToYM, PS_BIRTH),
 *       ps-engine.js (PensionEngine.run), ps-withdrawal.js (PensionWithdrawal.calc)
 * DOM / Firebase / 전역 상태 접근 금지.
 *
 * 정의 (Notion 마스터플랜 6-A, HISTORY 2026-11-26·27):
 *   자립률 = 본인 세후 금융소득(월, 명목) ÷ (생활비 현재가 × 물가배수)
 *   신호등(바닥선 기준): 🟢 ≥ greenMin / 🟡 ≥ yellowMin / 🔴 그 미만
 *
 * 인출 금액·세금 재계산 금지: 소득원별 순소득은 PensionWithdrawal.calc()가 돌려준
 * sources[].net을 그대로 합산한다. calc()는 나이 기준 '생일월 스냅샷'만 계산하므로
 * 자립률도 공백기 연령별(생일월) 스냅샷으로 산출한다 (12개월 평균 아님).
 */

'use strict';

const PensionSelfReliance = (() => {

  // ─── 유틸 ───────────────────────────────────────────────────────────────────

  function _year(ym) { return parseInt(ym.slice(0, 4), 10); }

  function _ymToAge(ym) {
    const y = _year(ym);
    const m = parseInt(ym.slice(5, 7), 10);
    let age = y - PS_BIRTH.year;
    if (m < PS_BIRTH.month) age--;
    return age;
  }

  /** PS_START_YM 기준 월 인덱스 (엔진 months 배열 인덱스와 동일 규칙) */
  function _ymToIdx(ym) {
    const sy = _year(PS_START_YM), sm = parseInt(PS_START_YM.slice(5, 7), 10);
    const ty = _year(ym),          tm = parseInt(ym.slice(5, 7), 10);
    return (ty - sy) * 12 + (tm - sm);
  }

  /** 엔진과 동일한 물가배수: (1 + 물가)^(해당 연도 − PS_START_YM 연도) */
  function _inflationMult(params, ym) {
    const rate = params.inflation?.annualRate || 0;
    return Math.pow(1 + rate, Math.max(0, _year(ym) - _year(PS_START_YM)));
  }

  function _ymMax(a, b) { return a > b ? a : b; }

  /** 신호등 판정 (바닥선 기준 자립률) */
  function signalOf(rate) {
    const c = PS_SELF_RELIANCE;
    if (rate == null || isNaN(rate)) return null;
    if (rate >= c.greenMin)  return 'green';
    if (rate >= c.yellowMin) return 'yellow';
    return 'red';
  }

  // ─── 공백기 연령 산출 ───────────────────────────────────────────────────────

  /**
   * 인출 시작월과 공백기 연령 목록.
   * - 인출 시작월 = max(인출 시작 나이 생일월, ISA 만기월) (엔진 'withdrawStart' 이벤트와 동일 규칙)
   * - phase1Target 설정 시: 시작 나이 ~ (phase2StartAge − 1) 이 공백기
   * - phase1Target 미설정: 공백기 없음 → 시작 나이 스냅샷 한 개만 (O 배당 추정 미적용)
   */
  function gapInfo(params) {
    const w = params.withdrawal || {};
    const startAge = w.startAge != null ? w.startAge : 61;
    const wdStartYM = _ymMax(psAgeToYM(startAge), params.isaConversion?.maturityYM || '0000-00');

    // 생일월 스냅샷이 인출 시작월보다 앞서면 다음 나이로 (인출 전 스냅샷 방지)
    let firstAge = startAge;
    while (psAgeToYM(firstAge) < wdStartYM) firstAge++;

    const hasGap = w.phase1Target != null;
    const phase2Age = w.phase2StartAge != null ? w.phase2StartAge : 61;
    const lastAge = hasGap ? Math.max(firstAge, phase2Age - 1) : firstAge;

    const ages = [];
    for (let a = firstAge; a <= lastAge; a++) ages.push(a);
    return { wdStartYM, firstAge, lastAge, ages, hasGap, phase2Age };
  }

  // ─── 퇴직월 O 보유 주수 / 월별 로그 접근 ───────────────────────────────────

  function _logAt(result, ym) {
    const idx = _ymToIdx(ym);
    return result.forecast?.withdrawalLog?.[idx] || result.plan?.withdrawalLog?.[idx] || null;
  }

  /** 공백기 O 보유 주수: 사용자 보정값 우선, 없으면 퇴직월 엔진 값, 그것도 없으면 null */
  function _oSharesAtGap(result, params) {
    const manual = params.selfReliance?.oSharesAtGap;
    if (manual != null && isFinite(manual) && manual >= 0) return { shares: manual, source: 'manual' };
    const ym = params.retire?.ym;
    if (ym) {
      const log = _logAt(result, ym);
      if (log && log.realtyShares != null) return { shares: log.realtyShares, source: 'engine' };
    }
    return { shares: null, source: 'none' };
  }

  // ─── 연령별 스냅샷 계산 ─────────────────────────────────────────────────────

  function _snapshot(result, params, age, gap, oShares) {
    const cfg = PS_SELF_RELIANCE;
    const c = PensionWithdrawal.calc(age, result, params);
    const ym = c.targetYM;
    const mult = _inflationMult(params, ym);
    const floor  = cfg.floorMonthly  * mult;
    const target = cfg.targetMonthly * mult;

    // ① 엔진 소득원별 순소득 합 (세금 정산 항목·국민연금 옵션 처리)
    let netEngine = 0;
    let npNet = 0;
    for (const s of (c.sources || [])) {
      if (typeof s.name === 'string' && s.name.indexOf('전년도') === 0) continue; // 세금 정산은 별도
      if (s.name === '국민연금') {
        npNet += s.net;
        if (!cfg.includeNationalPension) continue;
      }
      netEngine += s.net;
    }

    // ② 공백기 O 배당 현금 추정 (엔진이 재투자 중일 때만, 공백기 연령에만)
    //    보유 주수 고정(공백기 동안 재투자 안 함) × 해당 월 배당($/주/월) × 환율 × (1 − 원천징수율)
    const inGap = gap.hasGap && age < gap.phase2Age;
    let oEst = 0;
    let oApplied = false;
    if (cfg.oDividendCashInGap && inGap && c.oDripActive !== false && !c.oCashUse && oShares.shares != null) {
      const divUSD = c.withdrawal?.realtyMonthlyDivUSD || 0;
      const fx = params.realty?.fxRate || 0;
      const wh = params.realty?.withholdingRate != null ? params.realty.withholdingRate : 0.15;
      oEst = oShares.shares * divUSD * fx * (1 - wh);
      oApplied = true;
    }

    const income = netEngine + oEst;
    return {
      age, ym, mult,
      floor, target,
      netEngine, npNet, oEst, oApplied, oShares: oApplied ? oShares.shares : null,
      income,
      rateFloor:  floor  > 0 ? income / floor  : null,
      rateTarget: target > 0 ? income / target : null,
      rateFloorEngineOnly: floor > 0 ? netEngine / floor : null,  // O 배당 추정 제외 (참고)
      signal: signalOf(floor > 0 ? income / floor : null),
      inGap,
      tax: c.totalTax,
      healthInsurance: c.healthInsurance?.monthly || 0,
      oDripActive: c.oDripActive !== false && !c.oCashUse   // 엔진이 O를 재투자 중인지 (현금 사용이면 false)
    };
  }

  // ─── 계좌 소진 시점 ─────────────────────────────────────────────────────────

  function _depletion(result, params, gap) {
    const useFc = (result.forecast?.byAccount?.연금저축?.length || 0) > 0;
    const acc = useFc ? result.forecast.byAccount : result.plan.byAccount;
    const months = result.months || [];
    const startIdx = Math.max(0, _ymToIdx(gap.wdStartYM));
    const EPS = 0.5;

    function firstZero(valueAt) {
      for (let i = startIdx; i < months.length; i++) {
        if (valueAt(i) <= EPS) return { ym: months[i], age: _ymToAge(months[i]) };
      }
      return null;
    }
    const taxed  = acc.연금저축 || [];
    const taxFre = acc.연금저축_비과세원금 || [];
    const irp1   = acc.IRP1 || [];
    const irp2   = acc.IRP2 || [];

    return {
      pensionSaving:       firstZero(i => (taxed[i] || 0) + (taxFre[i] || 0)), // 연금저축 합계(과세분+비과세원금)
      pensionSavingTaxed:  firstZero(i => taxed[i] || 0),                      // 참고: 과세분만
      irp1: firstZero(i => irp1[i] || 0),
      irp2: firstZero(i => irp2[i] || 0),
      endYM: months.length ? months[months.length - 1] : PS_END_YM
    };
  }

  // ─── 한 시나리오 평가 ──────────────────────────────────────────────────────

  function _evaluate(result, params) {
    const gap = gapInfo(params);
    const oShares = _oSharesAtGap(result, params);
    const rows = gap.ages.map(age => _snapshot(result, params, age, gap, oShares));
    return {
      gap,
      oShares,
      rows,
      representative: rows[0] || null,   // 인출 시작월 스냅샷
      depletion: _depletion(result, params, gap)
    };
  }

  // ─── 보수 시나리오 params ───────────────────────────────────────────────────

  function conservativeParams(params) {
    const cfg = PS_SELF_RELIANCE.conservative;
    const p = JSON.parse(JSON.stringify(params));   // 원본 불변
    Object.keys(p.rates || {}).forEach(k => {
      p.rates[k] = Math.max(0, p.rates[k] + cfg.rateDeltaPP);
    });
    p.inflation = Object.assign({}, p.inflation, { annualRate: cfg.inflationRate });
    return p;
  }

  // ─── 공개: 전체 계산 ───────────────────────────────────────────────────────

  /**
   * @param {object} params      현재 파라미터 (PensionState.params)
   * @param {object|null} actual 실적 데이터 (PensionState.actual) — 보수 재실행에 사용
   * @param {object} baseResult  기본 시나리오 엔진 결과 (PensionState.result)
   * @returns {{ base, conservative, error? }}
   */
  function compute(params, actual, baseResult) {
    if (!params || !baseResult) return { base: null, conservative: null, error: '결과 없음' };
    let base = null, cons = null, error = null;
    try {
      base = _evaluate(baseResult, params);
    } catch (e) {
      return { base: null, conservative: null, error: '기본 시나리오 계산 실패: ' + e.message };
    }
    try {
      const cp = conservativeParams(params);
      const cr = PensionEngine.run(cp, actual || null);
      cons = _evaluate(cr, cp);
    } catch (e) {
      error = '보수 시나리오 계산 실패: ' + e.message;
    }
    return { base, conservative: cons, error };
  }

  return { compute, signalOf, gapInfo, conservativeParams };

})();
