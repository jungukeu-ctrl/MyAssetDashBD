/**
 * ps-withdrawal.js — 연금 인출 시뮬레이션 표시 계층 (순수 함수)
 * 의존: ps-config.js (PS_DEFAULT_PARAMS, PS_START_YM, PS_BIRTH, psAgeToYM)
 * DOM / Firebase 접근 완전 금지.
 *
 * 인출 금액·한도 계산 자체는 js/pension/ps-engine.js `_stepMonth()`가 담당한다
 * (psResult.plan/forecast.withdrawalLog). 이 파일은 그 결과를 세율·건보료
 * 계산과 결합해 화면 표시용으로 포맷팅만 한다 — 인출 금액 재계산 금지.
 *
 * 설계 기준: .claude/PENSION_WITHDRAWAL.md, Notion §9(적립-인출 통합 시뮬레이션)
 */

'use strict';

const PensionWithdrawal = (() => {

  // ─── 유틸 ───────────────────────────────────────────────────────────────────

  /** 'YYYY-MM' → 만 나이 (PS_BIRTH 기준) */
  function _ymToAge(ym) {
    const y = parseInt(ym.slice(0, 4));
    const m = parseInt(ym.slice(5, 7));
    let age = y - PS_BIRTH.year;
    if (m < PS_BIRTH.month) age--;
    return age;
  }

  /** PS_START_YM('2026-01') 기준 배열 인덱스 */
  function _ymToIdx(ym) {
    const sy = parseInt(PS_START_YM.slice(0, 4));
    const sm = parseInt(PS_START_YM.slice(5, 7));
    const ty = parseInt(ym.slice(0, 4));
    const tm = parseInt(ym.slice(5, 7));
    return (ty - sy) * 12 + (tm - sm);
  }

  /** 'YYYY-MM' 문자열 중 더 늦은 값 */
  function _ymMax(a, b) { return a > b ? a : b; }

  /** 'YYYY-MM' + n년 → 'YYYY-MM' */
  function _addYears(ym, years) {
    const y = parseInt(ym.slice(0, 4), 10);
    const m = ym.slice(5, 7);
    return `${y + (years || 0)}-${m}`;
  }

  // ─── 연금소득세 ─────────────────────────────────────────────────────────────
  // (PR #81에서 이미 3단계 세율로 정확히 수정됨 — 그대로 유지)

  function _taxRate(params, targetYM) {
    const age = _ymToAge(targetYM);
    if (age >= 80) return params.tax.rate80;
    if (age >= 70) return params.tax.rate7079;
    return params.tax.rate5569;
  }

  // ─── 연금소득공제 (§5 표, 최대 900만원) ────────────────────────────────────
  // 국민연금(공적연금) 건보료 산정용으로 쓰였으나, §13 종합과세 모드 및
  // §신규 O배당 비교과세(ps-engine.js)에서도 공용으로 쓰이므로
  // psPensionIncomeDeduction()(ps-config.js, 전역)으로 이동됨 — 아래는 위임.
  function _pensionIncomeDeduction(annual) {
    return psPensionIncomeDeduction(annual);
  }

  // ─── 종합소득세 (§13, 사적연금 1,500만원 초과 시 comprehensive 모드) ────────
  // PS_COMPREHENSIVE_TAX_BRACKETS(ps-config.js) 누진표 + 지방소득세 10% 별도 가산.
  // psComprehensiveIncomeTax()(ps-config.js, 전역)로 이동됨 — 아래는 위임.
  function _comprehensiveIncomeTax(netIncome) {
    return psComprehensiveIncomeTax(netIncome);
  }

  // ─── 종합소득세 (§13-신규, cap15m_thenExpand 전용) ─────────────────────────
  // cap15m 하드캡(연 1,500만)을 넘어 IRP1·IRP2 소진 후 자동 확장된 인출분에만 적용하는
  // 한계세율 계산. 인출액 자체는 ps-engine.js _stepMonth()가 이미 확정한 값
  // (wd.taxedExpansion)을 그대로 쓰고, 여기서는 그 금액의 세금만 계산한다(재계산 금지 원칙 유지).
  // ⚠️ 1차 구현 단순 가정: "사적연금(연금저축) 소득만" 종합과세 대상으로 간주 —
  // 국민연금·O배당 등 다른 종합소득 항목과는 합산하지 않는다. 실제 종합소득세 신고 시
  // 다른 소득과 합산되면 세율 구간이 달라지므로 세무사 확인 필요.
  // §13(excessMode 선택)·§13-B(O배당 비교과세)와는 완전히 별개 제도이며 서로 건드리지 않는다.
  function _expansionComprehensiveTax(baseAnnual, expansionAnnual) {
    const combinedAnnual = baseAnnual + expansionAnnual;
    const netCombined = Math.max(0, combinedAnnual - psPensionIncomeDeduction(combinedAnnual));
    const netBase     = Math.max(0, baseAnnual - psPensionIncomeDeduction(baseAnnual));
    const taxCombined = psComprehensiveIncomeTax(netCombined).total;
    const taxBase     = psComprehensiveIncomeTax(netBase).total;
    return { total: Math.max(0, taxCombined - taxBase) };
  }

  // ─── 건강보험료 계산 ─────────────────────────────────────────────────────────
  // (PR #81에서 이미 정확히 수정됨 — 피부양자 판정에 배우자 정년 조건만 추가, §9-8)

  /**
   * @param {object} params               PS_DEFAULT_PARAMS
   * @param {string} targetYM             목표 시점
   * @param {number} privatePensionAnnual 과세 사적연금 연 합계 (원)
   * @param {number} npAnnual             국민연금 연 합계 (원, 0이면 미개시)
   * @param {number} oDripAnnual          O 배당 연 원화 (capped)
   * @returns {{ type, monthly, breakdown }}
   */
  function _calcHI(params, targetYM, privatePensionAnnual, npAnnual, oDripAnnual) {
    const hi   = params.healthInsurance;
    const prop = params.property;
    const yearsAhead = parseInt(targetYM.slice(0, 4)) - 2026;

    // ① 소득 산입 계산 (피부양자 기준: 국민건강보험법 시행령 제41조)
    // 사적연금은 분리과세 유지 시 건보 소득에서 전액 제외 (공적연금만 산입).
    // §13: excessMode==='comprehensive'로 종합과세를 선택한 해에 한해서만 호출측(calc())이
    // privatePensionAnnual에 실값을 전달함 — cap15m/separate16_5는 항상 0 전달(§6 유지, 회귀 없음)
    const privatePensionNet = privatePensionAnnual || 0;

    // 국민연금: 연금소득공제 후 산입
    const npDeducted = _pensionIncomeDeduction(npAnnual);
    const npNet = Math.max(0, npAnnual - npDeducted);

    // 금융소득: 1,000만 초과 시 전액 산입 (2022.09 개편)
    const finLimit = hi.financialIncomeLimit || 10000000;
    const finNet   = oDripAnnual > finLimit ? oDripAnnual : 0;

    const totalIncome = privatePensionNet + npNet + finNet;

    // ② 재산 기준 계산
    const projPublicPrice = prop.publicPrice * Math.pow(1 + prop.annualRaise, Math.max(0, yearsAhead));
    const mySharePrice    = projPublicPrice * prop.ownershipRatio;
    const fairBase        = mySharePrice * (hi.fairMarketRatio || 0.60);

    const depIncomeLimit   = hi.dependentIncomeLimit   || 20000000;
    const depPropertyLimit = hi.dependentPropertyLimit || 540000000;

    // ②-1 배우자 정년(§9-8) — 정년 전까지만 배우자 직장가입자 피부양자 자격 유지 가능
    const spouse = params.spouse;
    const spouseRetireYM = spouse?.birthYM ? _addYears(spouse.birthYM, spouse.retireAge ?? 60) : null;
    const spouseStillWorking = !spouseRetireYM || targetYM < spouseRetireYM;

    // ③ 피부양자 판정 (소득·재산 기준 충족 + 배우자 정년 전 — §9-8: 둘 중 먼저 도달하는 쪽이 탈락 시점)
    if (totalIncome <= depIncomeLimit && fairBase <= depPropertyLimit && spouseStillWorking) {
      return { type: '피부양자', monthly: 0, breakdown: { totalIncome } };
    }

    // ④ 지역가입자 보험료 계산
    const baseRate   = hi.rate * Math.pow(1 + (hi.annualRaise || 0.015), Math.max(0, yearsAhead));
    const cappedRate = Math.min(baseRate, hi.cap || 0.12);

    // 소득분: 연 소득 → 월 환산 후 요율 적용
    const incomeMonthly = Math.round((totalIncome / 12) * cappedRate);

    // 재산분: (fairBase - 기본공제) / 10,000 점 × 점수당 금액 (간략화)
    const propDeduction  = hi.propertyDeduction  || 100000000;
    const propScoreUnit  = hi.propertyScoreUnit   || 208.4;
    const propTaxBase    = Math.max(0, fairBase - propDeduction);
    // 재산점수: 100만원당 1점 (건강보험료 부과점수 산정기준 고시 기준)
    const propScore      = propTaxBase / 1000000;
    const propertyMonthly = Math.round(propScore * propScoreUnit);

    const baseMonthly  = incomeMonthly + propertyMonthly;
    const ltcMonthly   = Math.round(baseMonthly * (hi.ltcRate || 0.1295));
    const totalMonthly = baseMonthly + ltcMonthly;

    return {
      type: '지역가입자',
      monthly: totalMonthly,
      breakdown: { totalIncome, incomeMonthly, propertyMonthly, ltcMonthly, fairBase: Math.round(fairBase) },
      spouseRetireYM
    };
  }

  // ─── 메인 계산 함수 ─────────────────────────────────────────────────────────

  /**
   * @param {number} targetAge  목표 나이 (만 나이 정수, 55~100)
   * @param {object} psResult   PensionState.result (적립+인출 통합 시뮬레이션 결과, ps-engine.js)
   * @param {object} params     PS_DEFAULT_PARAMS (또는 커스텀 파라미터)
   * @returns {object}          인출 시뮬레이션 결과 (표시용)
   */
  function calc(targetAge, psResult, params) {
    params = params || PS_DEFAULT_PARAMS;

    const targetYM  = psAgeToYM(targetAge);
    const npStartYM = params.nationalPension.startYM;
    const rate      = _taxRate(params, targetYM);
    const ratePct   = Math.round(rate * 1000) / 10;

    // ① 예상 잔액 + 인출 내역 추출 (forecast 우선, 없으면 plan — 엔진이 이미 계산해 둔 값 그대로 사용)
    const balances = { 연금저축: 0, IRP1: 0, IRP2: 0, 해외주식: 0, RIA: 0, ISA: 0, 연금저축_비과세원금: 0 };
    let wd = {
      taxFree: 0, taxed: 0, taxedShortfall: 0, taxedExpansion: 0, irp1: 0, irp2: 0, nationalPension: 0,
      pensionLimitHit: false, irp1LimitHit: false, irp2LimitHit: false,
      oDripActive: true, realty: 0, realtyGrossKRW: 0, realtyShares: 0, realtyMonthlyDivUSD: 0,
      realtyAnnualTotal: 0, realtyComprehensiveRequired: false, realtyComprehensiveSettlement: 0,
      isaMaturityRiaRemaining: 0, isaPostMaturityVooRedirect: 0,
      overseasSale: 0, overseasSaleTax: 0
    };

    if (psResult && psResult.months) {
      const idx = Math.max(0, Math.min(_ymToIdx(targetYM), psResult.months.length - 1));
      const fc  = psResult.forecast?.byAccount;
      const pl  = psResult.plan?.byAccount;

      // 트랙 통일(옵션A): 같은 idx에서 잔액표(balances)와 소득원/O DRIP 상태(wd)는
      // 반드시 같은 트랙(plan 또는 forecast) 하나에서만 나와야 한다.
      // forecast.withdrawalLog[idx]가 존재하면(실적 이후 예측 구간) balances·wd를
      // 통째로 forecast에서, 없으면(실적 구간/배열 밖) 통째로 plan에서 가져온다.
      // 계좌별 "forecast값이 0이면 plan으로 대체"하던 개별 fallback은 금지 —
      // forecast에서 IRP1·IRP2가 소진(0)됐는데 잔액표만 plan의 양수 잔액을 보여
      // wd의 O DRIP 현금인출 전환 상태와 모순되던 버그의 원인이었다.
      const fcLog = psResult.forecast?.withdrawalLog?.[idx];
      const plLog = psResult.plan?.withdrawalLog?.[idx];
      const src   = fcLog ? fc : pl;
      for (const k of Object.keys(balances)) {
        balances[k] = src?.[k]?.[idx] ?? 0;
      }
      wd = fcLog || plLog || wd;
    }

    // ② O DRIP 상태 — ps-engine.js _stepMonth() §7-5가 이미 계산해 둔 값 그대로 사용 (재계산 금지)
    const oDripActive = wd.oDripActive !== false;  // 기본 true(마이그레이션 안전값)

    // ③ 소득원별 계산 — ps-engine.js의 실제 월별 인출 내역(withdrawalLog)을 그대로 사용, 재계산 금지
    const sources = [];
    let privatePensionAnnual = 0;  // 건보 소득 계산용 누계
    let npAnnual = 0;

    if (wd.taxFree > 0) {
      sources.push({
        name: '연금저축 (비과세원금)',
        monthly: wd.taxFree,
        tax: 0,
        net: wd.taxFree,
        note: 'ISA→연금저축 이전 원금, 비과세'
      });
    }

    if (wd.taxed > 0) {
      // cap15m_thenExpand 모드에서만 taxed를 기본분(base, 기존 세율)과 확장분(종합과세 근사)으로 분리.
      // 그 외 모드는 wd.taxedExpansion을 0으로 취급해 기존 동작과 완전히 동일하게 유지(회귀 없음).
      const excessModeForTaxed = params.withdrawal?.excessMode || 'cap15m';
      const expansionMonthly   = excessModeForTaxed === 'cap15m_thenExpand' ? (wd.taxedExpansion || 0) : 0;
      const baseMonthly        = wd.taxed - expansionMonthly;

      if (baseMonthly > 0) {
        const tax = Math.round(baseMonthly * rate);
        sources.push({
          name: '연금저축 (과세)',
          monthly: baseMonthly,
          tax,
          net: baseMonthly - tax,
          note: `연금소득세 ${ratePct}% · 연 1,500만 이하 분리과세${wd.pensionLimitHit ? ' · 연금수령한도 도달' : ''}`
        });
        privatePensionAnnual += baseMonthly * 12;
      }

      if (expansionMonthly > 0) {
        const { total: expAnnualTax } = _expansionComprehensiveTax(baseMonthly * 12, expansionMonthly * 12);
        const expTax = Math.round(expAnnualTax / 12);
        sources.push({
          name: '연금저축 (확장 인출)',
          monthly: expansionMonthly,
          tax: expTax,
          net: expansionMonthly - expTax,
          note: 'IRP1·IRP2 소진 후 부족분 확장 인출 · 종합과세 근사 적용(사적연금 소득만 단순 가정, 세무사 확인 필요)'
        });
        privatePensionAnnual += expansionMonthly * 12;
      }
    }

    if (wd.nationalPension > 0) {
      const npTax = Math.round(wd.nationalPension * rate);
      sources.push({
        name: '국민연금',
        monthly: wd.nationalPension,
        tax: npTax,
        net: wd.nationalPension - npTax,
        note: `연금소득세 ${ratePct}%`
      });
      npAnnual = wd.nationalPension * 12;
    }

    if (wd.irp1 > 0) {
      const tax = Math.round(wd.irp1 * rate);
      sources.push({
        name: 'IRP1 연금',
        monthly: wd.irp1,
        tax,
        net: wd.irp1 - tax,
        note: `연금소득세 ${ratePct}%${wd.irp1LimitHit ? ' · 연금수령한도 도달' : ''}`
      });
      privatePensionAnnual += wd.irp1 * 12;
    }

    if (wd.irp2 > 0) {
      const tax = Math.round(wd.irp2 * rate);
      sources.push({
        name: 'IRP2 연금',
        monthly: wd.irp2,
        tax,
        net: wd.irp2 - tax,
        note: `연금소득세 ${ratePct}%${wd.irp2LimitHit ? ' · 연금수령한도 도달' : ''}`
      });
      privatePensionAnnual += wd.irp2 * 12;
    }

    // O(리얼티인컴) 배당 — Phase1(재투자 중)에는 생활비 소득원이 아니므로 미표시 (§5).
    // Phase2(현금인출 전환) 진입 후에만 표시하며, financialIncomeLimit 2,000만원 캡 없이
    // 실제 배당액 전액을 다른 소득(사적연금·국민연금)과 합산해 종합과세 누진세율 근사 적용.
    // ⚠️ 근사 구현 — 정확한 금융소득종합과세 비교과세는 세무사 확인 필요 (§13 disclaimers 참고).
    if (!oDripActive && wd.realty > 0) {
      const annualRealty = wd.realtyAnnualTotal || 0;              // 해당 연도 O 배당 총액(세전)
      const pensionCombinedAnnual = privatePensionAnnual + npAnnual; // 이미 위에서 누계된 사적연금+국민연금 연 합계
      const pensionDeduction = _pensionIncomeDeduction(pensionCombinedAnnual);
      const taxableBase = Math.max(0, pensionCombinedAnnual - pensionDeduction) + annualRealty;
      const { total: annualTaxTotal } = _comprehensiveIncomeTax(taxableBase);
      const realtyShare = taxableBase > 0 ? annualRealty / taxableBase : 0;
      const effRate = annualRealty > 0 ? (annualTaxTotal * realtyShare) / annualRealty : (params.realty?.withholdingRate || 0.15);

      const monthly = wd.realtyGrossKRW || 0;
      const tax     = Math.round(monthly * effRate);
      sources.push({
        name: 'O(리얼티인컴) 배당',
        monthly,
        tax,
        net: monthly - tax,
        note: `${wd.realtyShares != null ? Math.round(wd.realtyShares) : '?'}주 × $${wd.realtyMonthlyDivUSD ?? '?'}/주 · 현금인출 전환 · 종합과세 근사(세무사 확인 필요)`
      });
    }

    // 해외주식 계좌 잔액 매도 — O 배당만으로 부족분을 못 메우면 발생(§5-2, ps-engine.js §7-6).
    // 매도액 자체는 엔진이 이미 확정한 값(wd.overseasSale) 그대로 사용, 세금만 표시.
    if (wd.overseasSale > 0) {
      const os = params.overseasSale || {};
      sources.push({
        name: '해외주식 매도',
        monthly: wd.overseasSale,
        tax: wd.overseasSaleTax || 0,
        net: wd.overseasSale - (wd.overseasSaleTax || 0),
        note: `양도소득세 근사 적용(취득원가율 ${Math.round((os.costBasisRatio ?? 0.5) * 100)}%, 세율 ${Math.round((os.capitalGainsTaxRate ?? 0.22) * 100)}%, 연 250만원 공제) · 세무사 확인 필요`
      });
    }

    // ③-2 §13: 사적연금 1,500만원 초과 문턱효과 — excessMode!=='cap15m' && 해당 연도 초과 시
    // taxed/irp1/irp2(+comprehensive는 국민연금도) 소스 전액을 다른 방식으로 재과세.
    // wd.excessTriggeredYear/excessAnnualTotal은 ps-engine.js _markExcessYears()가 연도별로
    // 이미 소급 계산해 둔 값 — 여기서는 재계산하지 않고 그대로 사용.
    const excessMode    = params.withdrawal?.excessMode || 'cap15m';
    // cap15m_thenExpand는 별도 확장 인출 방식(위 sources 분리 로직)을 쓰므로 이 문턱효과
    // 재분류(전액 16.5%/종합과세 전환) 대상에서 명시적으로 제외 — cap15m과 함께 두 값 모두 배제.
    const isExcessYear  = (excessMode === 'separate16_5' || excessMode === 'comprehensive') && !!wd.excessTriggeredYear;
    const PRIVATE_PENSION_SOURCE_NAMES = ['연금저축 (과세)', 'IRP1 연금', 'IRP2 연금'];

    if (isExcessYear && excessMode === 'separate16_5') {
      const sepRate = params.tax?.rateSeparate165 ?? 0.165;
      sources.forEach(s => {
        if (PRIVATE_PENSION_SOURCE_NAMES.includes(s.name)) {
          s.tax  = Math.round(s.monthly * sepRate);
          s.net  = s.monthly - s.tax;
          s.note = '연 1,500만원 초과로 전액 16.5% 분리과세 적용(문턱효과, 종합소득 미합산)';
        }
      });
    } else if (isExcessYear && excessMode === 'comprehensive') {
      const combinedAnnual = (wd.excessAnnualTotal || 0) + npAnnual;
      const deduction       = _pensionIncomeDeduction(combinedAnnual);
      const netIncome       = Math.max(0, combinedAnnual - deduction);
      const { total: annualTax } = _comprehensiveIncomeTax(netIncome);
      sources.forEach(s => {
        if (PRIVATE_PENSION_SOURCE_NAMES.includes(s.name) || s.name === '국민연금') {
          const share = combinedAnnual > 0 ? (s.monthly * 12) / combinedAnnual : 0;
          s.tax  = Math.round((annualTax * share) / 12);
          s.net  = s.monthly - s.tax;
          s.note = '연 1,500만원 초과로 종합과세 적용(문턱효과) · 연금소득공제 후 누진세율(연간세액 비례배분 표시)';
        }
      });
    }

    // ③-3 O배당 금융소득종합과세(비교과세) 정산 — §신규, 사적연금 excessMode와 무관하게
    // 연 2,000만원 초과 시 자동 적용(ps-engine.js _markRealtyComprehensiveSettlement가
    // Y+1년 5월 log에 소급 기록해 둔 값을 그대로 표시, 재계산 금지).
    if (wd.realtyComprehensiveSettlement > 0) {
      const settleAmt = wd.realtyComprehensiveSettlement;
      const settleYr  = wd.realtyComprehensiveSettlementYear;
      sources.push({
        name: '전년도 금융소득종합과세(비교과세) 정산',
        monthly: -settleAmt,
        tax: 0,
        net: -settleAmt,
        note: `${settleYr}년 O배당 금융소득 2,000만원 초과분 비교과세 정산 · 5월 일시납부 · 근사 구현(인적공제·외국납부세액공제 미반영, 세무사 확인 필요)`
      });
    }

    // ④ 합계
    const totalGross = sources.reduce((s, x) => s + x.monthly, 0);
    const totalTax   = sources.reduce((s, x) => s + x.tax,     0);
    const totalNet   = totalGross - totalTax;

    // ⑤ 건보료 — comprehensive 모드이면서 해당 연도 실제 초과된 경우에만 사적연금을
    // 피부양자 소득기준 합산 대상에 포함 (cap15m/separate16_5는 항상 0 전달, §6 유지)
    const includePrivateInHI = isExcessYear && excessMode === 'comprehensive';
    const hi = _calcHI(params, targetYM, includePrivateInHI ? (wd.excessAnnualTotal || 0) : 0, npAnnual, wd.realtyAnnualTotal || 0);

    // ⑥ 경고
    const warnings = [];
    const withdrawStartYM = params.withdrawal?.startAge != null
      ? _ymMax(psAgeToYM(params.withdrawal.startAge), params.isaConversion?.maturityYM || '0000-00')
      : null;
    if (withdrawStartYM && targetYM < withdrawStartYM) {
      warnings.push(`${targetAge}세는 연금 인출 시작(${_ymToAge(withdrawStartYM)}세, ${withdrawStartYM}) 이전입니다. 자산 적립 기간입니다.`);
    }
    const realtyLimit = params.realty?.financialIncomeLimit || 20000000;
    if (oDripActive && (wd.realtyAnnualTotal || 0) >= realtyLimit * 0.85) {
      warnings.push('O 배당 수입이 금융소득 2,000만원 한도(85%)에 근접했습니다. DRIP 속도 조절을 검토하세요.');
    }
    if (oDripActive && wd.realtyComprehensiveRequired) {
      warnings.push('O배당 2,000만원 초과로 다음해 5월 금융소득종합과세(비교과세) 정산 대상입니다. 사적연금 처리방식(excessMode) 선택과는 무관하게 자동 적용됩니다.');
    }
    if (!oDripActive) {
      warnings.push('⚠️ IRP1·IRP2 소진으로 O(리얼티인컴) 배당이 재투자에서 현금인출로 전환됐습니다. 이후 배당은 다른 소득과 합산해 종합과세 근사 적용 중이며, 실제 세무 신고 시점엔 세무사 확인이 필요합니다.');
    }
    if (wd.overseasSale > 0) {
      warnings.push(`⚠️ O 배당만으로 부족해 해외주식 계좌에서 월 ${Math.round(wd.overseasSale / 10000)}만원을 추가 매도했습니다 (취득원가율 근사 적용, 세무사 확인 필요).`);
    }
    if (balances.해외주식 <= 0 && wd.overseasSale > 0) {
      warnings.push('⚠️ 해외주식 계좌 잔액이 모두 소진되었습니다.');
    }
    if ((wd.taxedExpansion || 0) > 0) {
      warnings.push(`⚠️ 연금저축 확장 인출 중 (IRP1·IRP2 소진, 종합과세 적용, 월 ${Math.round(wd.taxedExpansion / 10000)}만원 추가)`);
    }
    if ((wd.isaMaturityRiaRemaining || 0) > 0) {
      warnings.push(`⚠️ ISA 만기 시점에도 RIA 잔액 ${Math.round(wd.isaMaturityRiaRemaining / 10000)}만원이 남아있습니다. ISA 재가입 여부를 검토하세요.`);
    }
    if ((wd.isaPostMaturityVooRedirect || 0) > 0) {
      warnings.push(`⚠️ ISA 만기 이후 VOO 배분 ${Math.round(wd.isaPostMaturityVooRedirect / 10000)}만원이 해외주식 계좌로 대체 귀속되었습니다. ISA 재가입 검토 필요`);
    }
    if (targetAge === 65 || targetAge === 66) {
      warnings.push('국민연금 수급 연령 67세 상향이 논의 중입니다. 개시 연령 변경 시 공백 시나리오를 재검토하세요.');
    }
    // 사적연금 분리과세 한도 초과 체크 (cap15m은 항상 캡 이내라 정보성 안내, §13 모드는 아래 전용 경고로 대체)
    if (excessMode === 'cap15m' && privatePensionAnnual > (params.tax.separateTaxThreshold || 15000000)) {
      warnings.push(`사적연금 합계(연 ${Math.round(privatePensionAnnual / 10000)}만원)가 분리과세 기준(1,500만원)을 초과합니다. 종합과세 여부 검토 필요.`);
    }
    // §13: 1,500만원 초과 문턱효과 경고 (전액 재분류)
    if (isExcessYear) {
      const modeLabel = excessMode === 'separate16_5' ? 'separate16_5(16.5% 분리과세)' : 'comprehensive(종합과세)';
      warnings.push(`⚠️ 연 1,500만원 초과로 전액이 ${modeLabel} 방식으로 재분류됨 (문턱효과)`);
    }
    // 목표 생활비 대비 부족분 (§9-6 — 자동으로 낮추지 않고 그대로 표시)
    // overallShortfall은 연금저축+IRP1+IRP2 갭필링(§7-2)까지 전부 반영한 실제 부족분.
    // taxedShortfall(연금저축 단독)만으로 판단하면 IRP가 메운 경우도 오탐으로 표시되므로 사용 금지.
    if (wd.overallShortfall > 0) {
      const reasons = [];
      if (excessMode === 'cap15m' && wd.taxedShortfall > 0) {
        reasons.push('연금저축 과세분 연 1,500만원 한도');
      }
      if (balances.연금저축 <= 0 && balances.연금저축_비과세원금 <= 0) {
        reasons.push('연금저축 잔액 소진');
      }
      if (wd.pensionLimitHit) reasons.push('연금저축 §9-9 연금수령한도 도달');
      if (wd.irp1LimitHit)    reasons.push('IRP1 §9-9 연금수령한도 도달');
      if (wd.irp2LimitHit)    reasons.push('IRP2 §9-9 연금수령한도 도달');
      if (balances.IRP1 <= 0) reasons.push('IRP1 잔액 소진');
      if (balances.IRP2 <= 0) reasons.push('IRP2 잔액 소진');

      const reasonText = reasons.length ? reasons.join(', ') : '계좌 잔액/인출한도 제약';
      warnings.push(`목표 생활비 대비 월 ${Math.round(wd.overallShortfall / 10000)}만원 부족합니다 (${reasonText}).`);
    }
    // 연금수령한도(§9-9) 도달 경고
    if (wd.pensionLimitHit) {
      warnings.push('연금저축이 연금수령한도(§9-9)에 도달해 목표금액보다 적게 인출됐습니다.');
    }
    if (wd.irp1LimitHit) {
      warnings.push('IRP1이 연금수령한도(§9-9)에 도달해 목표금액보다 적게 인출됐습니다.');
    }
    if (wd.irp2LimitHit) {
      warnings.push('IRP2가 연금수령한도(§9-9)에 도달해 목표금액보다 적게 인출됐습니다.');
    }

    // O DRIP 요약 (ps-withdrawal-ui.js 배지 표시용 — wd 필드를 그대로 옮겨 담을 뿐, 재계산 없음)
    const odrip = {
      shares:        wd.realtyShares || 0,
      monthlyDivUSD: wd.realtyMonthlyDivUSD || 0,
      oDripActive,
      annualKRW:     wd.realtyAnnualTotal || 0,
      atLimit:       oDripActive && (wd.realtyAnnualTotal || 0) >= realtyLimit * 0.85
    };

    return {
      targetAge,
      targetYM,
      balances,
      sources,
      totalGross,
      totalTax,
      totalNet,
      healthInsurance: hi,
      netAfterHI: totalNet - hi.monthly,
      odrip,
      oDripActive,
      withdrawal: wd,
      warnings
    };
  }

  return { calc };

})();
