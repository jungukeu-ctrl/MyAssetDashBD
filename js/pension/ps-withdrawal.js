/**
 * ps-withdrawal.js — 연금 인출 시뮬레이션 엔진 (순수 함수)
 * 의존: ps-config.js (PS_DEFAULT_PARAMS, PS_START_YM)
 * DOM / Firebase 접근 완전 금지.
 *
 * 설계 기준: .claude/PENSION_WITHDRAWAL.md
 */

'use strict';

const PensionWithdrawal = (() => {

  // ─── 인적 기본값 ────────────────────────────────────────────────────────────
  const BIRTH_YEAR  = 1974;
  const BIRTH_MONTH = 2;

  // ─── 인출 타임라인 상수 (PENSION_WITHDRAWAL.md §2) ──────────────────────────
  const WD_TAX_FREE_START   = '2035-02';  // 61세: 비과세원금 인출 시작
  const WD_TAX_FREE_MONTHLY = 3050000;    // 비과세 월 인출액 (원)
  const WD_TAX_FREE_END     = '2037-10';  // 비과세원금 소진 예상월 (~33개월)
  const WD_TAXED_START      = '2037-11';  // 과세분 전환
  const WD_TAXED_MONTHLY    = 1250000;    // 과세분 월 인출액 (국민연금 개시 전)
  const WD_TAXED_MONTHLY_NP = 1000000;    // 국민연금 개시 후 조정액
  const WD_IRP_START        = '2044-02';  // 70세: IRP 연금 개시
  const WD_IRP_MONTHLY      = 1500000;    // IRP 월 인출액

  // O DRIP 계산 기준 시점
  const O_DRIP_BASE_YM = '2026-06';

  // ─── 유틸 ───────────────────────────────────────────────────────────────────

  /** 만 나이 → 생일월 YM ('YYYY-MM') */
  function _ageToYM(age) {
    return `${BIRTH_YEAR + age}-${String(BIRTH_MONTH).padStart(2, '0')}`;
  }

  /** 'YYYY-MM' → 만 나이 */
  function _ymToAge(ym) {
    const y = parseInt(ym.slice(0, 4));
    const m = parseInt(ym.slice(5, 7));
    let age = y - BIRTH_YEAR;
    if (m < BIRTH_MONTH) age--;
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

  function _taxRate(params, targetYM) {
    return _ymToAge(targetYM) >= 70 ? params.tax.rate70 : params.tax.rate6069;
  }

  // ─── 건강보험료 계산 ─────────────────────────────────────────────────────────

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
    // 사적연금: 1,200만 초과분만 건보 소득에 산입
    const privatePensionNet = Math.max(0, privatePensionAnnual - (hi.pensionExemptLimit || 12000000));

    // 국민연금: 연금소득공제 후 산입
    let npDeducted = 0;
    if (npAnnual > 0) {
      if      (npAnnual <= 3500000)  npDeducted = npAnnual;
      else if (npAnnual <= 7000000)  npDeducted = 3500000 + (npAnnual - 3500000) * 0.40;
      else if (npAnnual <= 14000000) npDeducted = 4900000 + (npAnnual - 7000000) * 0.20;
      else                           npDeducted = 6300000 + (npAnnual - 14000000) * 0.20;
      npDeducted = Math.min(npDeducted, 9000000);  // 공제 한도 900만
    }
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

    // ③ 피부양자 판정 (국민연금 미개시 + 소득·재산 기준 충족)
    if (npAnnual === 0 && totalIncome <= depIncomeLimit && fairBase <= depPropertyLimit) {
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
      breakdown: { totalIncome, incomeMonthly, propertyMonthly, ltcMonthly, fairBase: Math.round(fairBase) }
    };
  }

  // ─── 메인 계산 함수 ─────────────────────────────────────────────────────────

  /**
   * @param {number} targetAge  목표 나이 (만 나이 정수, 55~85)
   * @param {object} psResult   PensionState.result (적립 시뮬레이션 결과)
   * @param {object} params     PS_DEFAULT_PARAMS (또는 커스텀 파라미터)
   * @returns {object}          인출 시뮬레이션 결과
   */
  function calc(targetAge, psResult, params) {
    params = params || PS_DEFAULT_PARAMS;

    const targetYM  = _ageToYM(targetAge);
    const npStartYM = params.nationalPension.startYM;
    const rate      = _taxRate(params, targetYM);
    const ratePct   = Math.round(rate * 1000) / 10;

    // ① 예상 잔액 추출 (forecast 우선, 없으면 plan)
    const balances = { 연금저축: 0, IRP1: 0, IRP2: 0, 해외주식: 0, RIA: 0, ISA: 0 };
    if (psResult && psResult.months) {
      const idx = Math.max(0, Math.min(_ymToIdx(targetYM), psResult.months.length - 1));
      const fc  = psResult.forecast?.byAccount;
      const pl  = psResult.plan?.byAccount;
      for (const k of Object.keys(balances)) {
        const fcv = fc?.[k]?.[idx];
        const plv = pl?.[k]?.[idx];
        balances[k] = (fcv != null && fcv > 0) ? fcv : (plv ?? 0);
      }
    }

    // ② O DRIP 계산
    const odrip = _calcODrip(params.realty, targetYM);

    // ③ 소득원별 계산
    const sources = [];
    let privatePensionAnnual = 0;  // 건보 소득 계산용 누계
    let npAnnual = 0;

    // 비과세원금 인출 (61세 ~ 2037-10)
    if (targetYM >= WD_TAX_FREE_START && targetYM <= WD_TAX_FREE_END) {
      sources.push({
        name: '연금저축 (비과세원금)',
        monthly: WD_TAX_FREE_MONTHLY,
        tax: 0,
        net: WD_TAX_FREE_MONTHLY,
        note: 'ISA→연금저축 이전 원금, 비과세 (약 1억, 33개월)'
      });
    }

    // 과세분 연금저축 (2037-11 이후)
    if (targetYM >= WD_TAXED_START) {
      const monthly = targetYM >= npStartYM ? WD_TAXED_MONTHLY_NP : WD_TAXED_MONTHLY;
      const tax     = Math.round(monthly * rate);
      sources.push({
        name: '연금저축 (과세)',
        monthly,
        tax,
        net: monthly - tax,
        note: `연금소득세 ${ratePct}% · 연 1,500만 이하 분리과세`
      });
      privatePensionAnnual += monthly * 12;
    }

    // 국민연금 (65세, 2039-03~)
    if (targetYM >= npStartYM) {
      const npMonthly = params.nationalPension.monthly;
      const npTax     = Math.round(npMonthly * rate);
      sources.push({
        name: '국민연금',
        monthly: npMonthly,
        tax: npTax,
        net: npMonthly - npTax,
        note: `연금소득세 ${ratePct}%`
      });
      npAnnual = npMonthly * 12;
    }

    // IRP 연금 (70세, 2044-02~)
    if (targetYM >= WD_IRP_START) {
      const irpRate    = params.tax.rate70;
      const irpRatePct = Math.round(irpRate * 1000) / 10;
      const irpTax     = Math.round(WD_IRP_MONTHLY * irpRate);
      sources.push({
        name: 'IRP 연금',
        monthly: WD_IRP_MONTHLY,
        tax: irpTax,
        net: WD_IRP_MONTHLY - irpTax,
        note: `연금소득세 ${irpRatePct}% (70세~ 인하 적용)`
      });
      privatePensionAnnual += WD_IRP_MONTHLY * 12;
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

    // ④ 합계
    const totalGross = sources.reduce((s, x) => s + x.monthly, 0);
    const totalTax   = sources.reduce((s, x) => s + x.tax,     0);
    const totalNet   = totalGross - totalTax;

    // ⑤ 건보료
    const hi = _calcHI(params, targetYM, privatePensionAnnual, npAnnual, odrip.annualKRW || 0);

    // ⑥ 경고
    const warnings = [];
    if (targetAge < 61) {
      warnings.push('61세 이전은 연금 인출 계획이 없습니다. 자산 적립 기간입니다.');
    }
    if (odrip.atLimit) {
      warnings.push('O 배당 수입이 금융소득 2,000만원 한도(85%)에 근접했습니다. DRIP 속도 조절을 검토하세요.');
    }
    if (targetAge === 65 || targetAge === 66) {
      warnings.push('국민연금 수급 연령 67세 상향이 논의 중입니다. 개시 연령 변경 시 공백 시나리오를 재검토하세요.');
    }
    // 사적연금 분리과세 한도 초과 체크
    if (privatePensionAnnual > (params.tax.separateTaxThreshold || 15000000)) {
      warnings.push(`사적연금 합계(연 ${Math.round(privatePensionAnnual / 10000)}만원)가 분리과세 기준(1,500만원)을 초과합니다. 종합과세 여부 검토 필요.`);
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
      warnings
    };
  }

  return { calc };

})();
