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

  // O DRIP 계산 기준 시점
  const O_DRIP_BASE_YM = '2026-06';

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

  /** 두 YM 사이 개월 수 (baseYM → targetYM) */
  function _monthsBetween(baseYM, targetYM) {
    const by = parseInt(baseYM.slice(0, 4)), bm = parseInt(baseYM.slice(5, 7));
    const ty = parseInt(targetYM.slice(0, 4)), tm = parseInt(targetYM.slice(5, 7));
    return (ty - by) * 12 + (tm - bm);
  }

  /** 'YYYY-MM' 문자열 중 더 늦은 값 */
  function _ymMax(a, b) { return a > b ? a : b; }

  /** 'YYYY-MM' + n년 → 'YYYY-MM' */
  function _addYears(ym, years) {
    const y = parseInt(ym.slice(0, 4), 10);
    const m = ym.slice(5, 7);
    return `${y + (years || 0)}-${m}`;
  }

  // ─── O DRIP 시뮬레이션 ──────────────────────────────────────────────────────

  /**
   * O_DRIP_BASE_YM('2026-06')부터 targetYM까지 월 복리 DRIP 계산
   * divGrowthRate / priceGrowthRate 둘 다 연율 → 월율로 변환
   */
  function _calcODrip(realty, targetYM) {
    if (!realty || !realty.shares) {
      return { shares: 0, monthlyKRW: 0, annualKRW: 0, atLimit: false };
    }

    const months = _monthsBetween(O_DRIP_BASE_YM, targetYM);

    let shares     = realty.shares;
    let monthlyDiv = realty.monthlyDivPerShare;  // USD/주
    let price      = realty.currentPrice;        // USD/주

    const mDivGrowth   = Math.pow(1 + realty.divGrowthRate,   1 / 12) - 1;
    const mPriceGrowth = Math.pow(1 + realty.priceGrowthRate, 1 / 12) - 1;

    for (let i = 0; i < Math.max(0, months); i++) {
      shares    += (shares * monthlyDiv) / price;  // DRIP 재투자
      monthlyDiv *= (1 + mDivGrowth);
      price      *= (1 + mPriceGrowth);
    }

    const annualUSD      = shares * monthlyDiv * 12;
    const annualKRWRaw   = annualUSD * realty.fxRate;
    const limit          = realty.financialIncomeLimit || 20000000;
    const annualKRW      = Math.round(Math.min(annualKRWRaw, limit));
    const monthlyKRW     = Math.round(annualKRW / 12);

    return {
      shares:            Math.round(shares * 10) / 10,
      monthlyDivUSD:     Math.round(monthlyDiv * 10000) / 10000,
      monthlyKRW,
      annualKRW,
      uncappedAnnualKRW: Math.round(annualKRWRaw),
      atLimit:           annualKRWRaw >= limit * 0.85  // 한도 85% 도달 시 경고
    };
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
  // 국민연금(공적연금) 건보료 산정용으로 쓰였으나, §13 종합과세 모드에서도
  // (사적연금+공적연금 합계)에 동일 표를 적용하므로 공용 헬퍼로 분리.
  function _pensionIncomeDeduction(annual) {
    if (annual <= 0) return 0;
    let deducted;
    if      (annual <= 3500000)  deducted = annual;
    else if (annual <= 7000000)  deducted = 3500000 + (annual - 3500000) * 0.40;
    else if (annual <= 14000000) deducted = 4900000 + (annual - 7000000) * 0.20;
    else                         deducted = 6300000 + (annual - 14000000) * 0.10;
    return Math.min(deducted, 9000000);
  }

  // ─── 종합소득세 (§13, 사적연금 1,500만원 초과 시 comprehensive 모드) ────────
  // PS_COMPREHENSIVE_TAX_BRACKETS(ps-config.js) 누진표 + 지방소득세 10% 별도 가산.
  function _comprehensiveIncomeTax(netIncome) {
    const base = Math.max(0, netIncome);
    const bracket = PS_COMPREHENSIVE_TAX_BRACKETS.find(b => base <= b.upTo)
      || PS_COMPREHENSIVE_TAX_BRACKETS[PS_COMPREHENSIVE_TAX_BRACKETS.length - 1];
    const incomeTax = Math.max(0, base * bracket.rate - bracket.deduction);
    const localTax  = Math.round(incomeTax * 0.10);
    return { incomeTax: Math.round(incomeTax), localTax, total: Math.round(incomeTax) + localTax };
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
      taxFree: 0, taxed: 0, taxedShortfall: 0, irp1: 0, irp2: 0, nationalPension: 0,
      pensionLimitHit: false, irp1LimitHit: false, irp2LimitHit: false
    };

    if (psResult && psResult.months) {
      const idx = Math.max(0, Math.min(_ymToIdx(targetYM), psResult.months.length - 1));
      const fc  = psResult.forecast?.byAccount;
      const pl  = psResult.plan?.byAccount;
      for (const k of Object.keys(balances)) {
        const fcv = fc?.[k]?.[idx];
        const plv = pl?.[k]?.[idx];
        balances[k] = (fcv != null && fcv > 0) ? fcv : (plv ?? 0);
      }

      const fcLog = psResult.forecast?.withdrawalLog?.[idx];
      const plLog = psResult.plan?.withdrawalLog?.[idx];
      wd = fcLog || plLog || wd;
    }

    // ② O DRIP 계산
    const odrip = _calcODrip(params.realty, targetYM);

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
      const tax = Math.round(wd.taxed * rate);
      sources.push({
        name: '연금저축 (과세)',
        monthly: wd.taxed,
        tax,
        net: wd.taxed - tax,
        note: `연금소득세 ${ratePct}% · 연 1,500만 이하 분리과세${wd.pensionLimitHit ? ' · 연금수령한도 도달' : ''}`
      });
      privatePensionAnnual += wd.taxed * 12;
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

    // O(리얼티인컴) 배당 (항시)
    if (odrip.monthlyKRW > 0) {
      const wRate = params.realty?.withholdingRate || 0.15;
      const tax   = Math.round(odrip.monthlyKRW * wRate);
      sources.push({
        name: 'O(리얼티인컴) 배당',
        monthly: odrip.monthlyKRW,
        tax,
        net: odrip.monthlyKRW - tax,
        note: `${Math.round(odrip.shares)}주 × $${odrip.monthlyDivUSD?.toFixed(4) || '?'}/주 · W-8BEN 15%`
      });
    }

    // ③-2 §13: 사적연금 1,500만원 초과 문턱효과 — excessMode!=='cap15m' && 해당 연도 초과 시
    // taxed/irp1/irp2(+comprehensive는 국민연금도) 소스 전액을 다른 방식으로 재과세.
    // wd.excessTriggeredYear/excessAnnualTotal은 ps-engine.js _markExcessYears()가 연도별로
    // 이미 소급 계산해 둔 값 — 여기서는 재계산하지 않고 그대로 사용.
    const excessMode    = params.withdrawal?.excessMode || 'cap15m';
    const isExcessYear  = excessMode !== 'cap15m' && !!wd.excessTriggeredYear;
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

    // ④ 합계
    const totalGross = sources.reduce((s, x) => s + x.monthly, 0);
    const totalTax   = sources.reduce((s, x) => s + x.tax,     0);
    const totalNet   = totalGross - totalTax;

    // ⑤ 건보료 — comprehensive 모드이면서 해당 연도 실제 초과된 경우에만 사적연금을
    // 피부양자 소득기준 합산 대상에 포함 (cap15m/separate16_5는 항상 0 전달, §6 유지)
    const includePrivateInHI = isExcessYear && excessMode === 'comprehensive';
    const hi = _calcHI(params, targetYM, includePrivateInHI ? (wd.excessAnnualTotal || 0) : 0, npAnnual, odrip.annualKRW || 0);

    // ⑥ 경고
    const warnings = [];
    const withdrawStartYM = params.withdrawal?.startAge != null
      ? _ymMax(psAgeToYM(params.withdrawal.startAge), params.isaConversion?.maturityYM || '0000-00')
      : null;
    if (withdrawStartYM && targetYM < withdrawStartYM) {
      warnings.push(`${targetAge}세는 연금 인출 시작(${_ymToAge(withdrawStartYM)}세, ${withdrawStartYM}) 이전입니다. 자산 적립 기간입니다.`);
    }
    if (odrip.atLimit) {
      warnings.push('O 배당 수입이 금융소득 2,000만원 한도(85%)에 근접했습니다. DRIP 속도 조절을 검토하세요.');
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
    if (wd.taxedShortfall > 0) {
      warnings.push(`목표 생활비 대비 월 ${Math.round(wd.taxedShortfall / 10000)}만원 부족합니다 (과세분 연 1,500만원 한도 초과).`);
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
      withdrawal: wd,
      warnings
    };
  }

  return { calc };

})();
