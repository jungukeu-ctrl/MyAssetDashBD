/**
 * ps-engine.js — pension-simulation 계산 엔진 (순수 함수)
 * DOM / Firebase / 전역 state 접근 완전 금지.
 * 모든 입력은 파라미터로 수신, 모든 출력은 반환값으로 전달.
 */

'use strict';

const PensionEngine = (() => {

  // ─── 내부 유틸 ──────────────────────────────────────────────────────────────

  /** 'YYYY-MM' → {y, m} */
  function _parseYM(ym) {
    return { y: parseInt(ym.slice(0, 4)), m: parseInt(ym.slice(5, 7)) };
  }

  /** {y, m} → 'YYYY-MM' */
  function _toYM(y, m) {
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  /** 'YYYY-MM' 범위 배열 생성 */
  function _monthRange(startYM, endYM) {
    const months = [];
    let { y, m } = _parseYM(startYM);
    const { y: ey, m: em } = _parseYM(endYM);
    while (y < ey || (y === ey && m <= em)) {
      months.push(_toYM(y, m));
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return months;
  }

  /** 'YYYY-MM' 비교: a < b */
  function _ymLt(a, b) { return a < b; }
  /** 'YYYY-MM' 비교: a <= b */
  function _ymLte(a, b) { return a <= b; }

  /** 해당 월이 VOO 매도 월인지 판단
   * intervalWeeks 주마다 1주 매도 → 한 달(약 4.33주) 안에 몇 번 매도?
   * 간소화: startYM 부터 몇 번째 달인지 계산, intervalWeeks 기준 매도 월 여부
   */
  function _isVooSellMonth(ym, startYM, intervalWeeks) {
    const { y: sy, m: sm } = _parseYM(startYM);
    const { y, m } = _parseYM(ym);
    const monthsElapsed = (y - sy) * 12 + (m - sm);
    if (monthsElapsed < 0) return false;
    // intervalWeeks 주 = intervalWeeks/4.33 개월마다 매도
    // 정수 기준: monthsElapsed % round(intervalWeeks/4.33) === 0
    const intervalMonths = Math.round(intervalWeeks / 4.33);
    return monthsElapsed % intervalMonths === 0;
  }

  /** 연도 추출 */
  function _year(ym) { return parseInt(ym.slice(0, 4)); }

  // ─── ISA 이체 금액 계산 (외부 공개 — ps-settings.js 재사용) ─────────────────

  /**
   * ISA 이체 가용액 계산
   * @param {object} params        PS_DEFAULT_PARAMS 구조
   * @param {number} paidToISA     해당 시점까지 VOO→ISA 납입 누계 (원)
   * @param {number} prevTransfers 이전 이체 누계 (원)
   * @param {string} transferYM    이체 시점 'YYYY-MM'
   * @param {number} riaBalance    이체 시점 RIA 잔액 (원)
   * @returns {number}             이체 가능액 (원)
   */
  function calcISATransfer(params, paidToISA, prevTransfers, transferYM, riaBalance) {
    const { joinYM, annualLimit } = params.isa;
    const joinYear = _year(joinYM);
    const txYear   = _year(transferYM);
    // 가입 연차 (1년차부터 시작)
    const yearsJoined = txYear - joinYear + 1;
    const cumulativeLimit = yearsJoined * annualLimit;
    const available = Math.max(0, cumulativeLimit - paidToISA - prevTransfers);
    return Math.min(available, Math.max(0, riaBalance));
  }

  // ─── 메인 엔진 ──────────────────────────────────────────────────────────────

  /**
   * @param {object} params      PS_DEFAULT_PARAMS 구조
   * @param {object} actualData  {
   *   initialBalances: { 연금저축, IRP1, IRP2, 해외주식, VOO, RIA, ISA },
   *   monthlyActual: { 'YYYY-MM': { 연금저축, IRP1, IRP2, VOO, 해외주식, RIA, ISA } }
   * }
   * @returns {object} result 구조 (PENSION_SIM.md 명세)
   */
  function run(params, actualData) {
    const ad = actualData || {};
    const init = ad.initialBalances || {};
    const monthlyActual = ad.monthlyActual || {};

    const months = _monthRange(PS_START_YM, PS_END_YM);

    // ── 계좌 잔액 초기화 ──
    let bal = {
      연금저축: init.연금저축 || 0,
      IRP1:     init.IRP1     || 0,
      IRP2:     init.IRP2     || 0,
      해외주식: init.해외주식 || 0,
      VOO:      init.VOO      || 0,   // RIA 계좌 = VOO 보유
      RIA:      init.RIA      || 0,   // RIA 총잔액 (VOO 포함)
      ISA:      init.ISA      || 0
    };

    // ── 누계 추적 ──
    let yearlyPension = 0;   // 연금저축 연간 납입 누계
    let yearlyIRP1    = 0;   // IRP1 연간 납입 누계
    let paidToISA     = 0;   // VOO→ISA 납입 누계 (한도 계산용)
    let prevTransfers = 0;   // ISA 이체 누계

    let currentYear = _year(PS_START_YM);
    let vooExhausted = false;

    // ── result 구조 ──
    const planTotal = [];
    const planByAcct = { 연금저축: [], IRP1: [], IRP2: [], VOO: [], 해외주식: [], RIA: [], ISA: [] };

    const forecastTotal = [];
    const forecastByAcct = { 연금저축: [], IRP1: [], IRP2: [], VOO: [], 해외주식: [], RIA: [], ISA: [] };

    const actualTotal = [];
    const actualByAcct = { 연금저축: [], IRP1: [], IRP2: [], VOO: [], 해외주식: [], RIA: [], ISA: [] };

    const events = [];
    const isaLimitLog = [];

    // ── 월별 계획(plan) 잔액 별도 추적 ──
    let planBal = { ...bal };
    let planYearlyPension = 0;
    let planYearlyIRP1    = 0;
    let planPaidToISA     = 0;
    let planPrevTransfers = 0;
    let planCurrentYear   = _year(PS_START_YM);
    let planVooExhausted  = false;

    // ── forecast 잔액 (실적 이후 구간에서 plan 대신 실적 기반 출발) ──
    let fcBal = null;  // 실적 마지막 월 이후 초기화
    let fcYearlyPension = 0;
    let fcYearlyIRP1    = 0;
    let fcPaidToISA     = 0;
    let fcPrevTransfers = 0;
    let fcCurrentYear   = _year(PS_START_YM);
    let fcVooExhausted  = false;

    const actualKeys = Object.keys(monthlyActual).sort();
    const lastActualYM = actualKeys.length ? actualKeys[actualKeys.length - 1] : null;

    for (let i = 0; i < months.length; i++) {
      const ym = months[i];
      const yr = _year(ym);

      // ── 연도 바뀌면 연간 누계 초기화 ──
      if (yr !== planCurrentYear) {
        planYearlyPension = 0;
        planYearlyIRP1    = 0;
        planCurrentYear   = yr;
      }

      // ── [PLAN] 월별 시뮬레이션 ──
      _stepMonth(ym, planBal, params, {
        yearlyPension:    planYearlyPension,
        yearlyIRP1:       planYearlyIRP1,
        paidToISA:        planPaidToISA,
        prevTransfers:    planPrevTransfers,
        vooExhausted:     planVooExhausted,
        isPlan:           true
      }, (patch) => {
        planYearlyPension = patch.yearlyPension;
        planYearlyIRP1    = patch.yearlyIRP1;
        planPaidToISA     = patch.paidToISA;
        planPrevTransfers = patch.prevTransfers;
        planVooExhausted  = patch.vooExhausted;
      });

      planTotal.push(_sum(planBal));
      Object.keys(planByAcct).forEach(k => planByAcct[k].push(planBal[k]));

      // ── [ACTUAL] 실데이터 있으면 채우기 ──
      if (monthlyActual[ym]) {
        const a = monthlyActual[ym];
        actualByAcct.연금저축.push(a.연금저축 ?? null);
        actualByAcct.IRP1.push(a.IRP1       ?? null);
        actualByAcct.IRP2.push(a.IRP2       ?? null);
        actualByAcct.VOO.push(a.VOO         ?? null);
        actualByAcct.해외주식.push(a.해외주식 ?? null);
        actualByAcct.RIA.push(a.RIA         ?? null);
        actualByAcct.ISA.push(a.ISA         ?? null);
        actualTotal.push(
          (a.연금저축 || 0) + (a.IRP1 || 0) + (a.IRP2 || 0) +
          (a.VOO || 0) + (a.해외주식 || 0) + (a.RIA || 0) + (a.ISA || 0)
        );
      } else {
        Object.keys(actualByAcct).forEach(k => actualByAcct[k].push(null));
        actualTotal.push(null);
      }

      // ── [FORECAST] 실적 이후 구간 ──
      if (lastActualYM && _ymLte(ym, lastActualYM)) {
        // 실적 구간: forecast = actual (있으면) 또는 null
        const a = monthlyActual[ym];
        if (a) {
          forecastByAcct.연금저축.push(a.연금저축 ?? null);
          forecastByAcct.IRP1.push(a.IRP1       ?? null);
          forecastByAcct.IRP2.push(a.IRP2       ?? null);
          forecastByAcct.VOO.push(a.VOO         ?? null);
          forecastByAcct.해외주식.push(a.해외주식 ?? null);
          forecastByAcct.RIA.push(a.RIA         ?? null);
          forecastByAcct.ISA.push(a.ISA         ?? null);
          forecastTotal.push(
            (a.연금저축 || 0) + (a.IRP1 || 0) + (a.IRP2 || 0) +
            (a.VOO || 0) + (a.해외주식 || 0) + (a.RIA || 0) + (a.ISA || 0)
          );
          // 실적 마지막 달 → forecast 초기 잔액 세팅
          if (ym === lastActualYM) {
            fcBal = {
              연금저축: a.연금저축 || 0,
              IRP1:     a.IRP1     || 0,
              IRP2:     a.IRP2     || 0,
              해외주식: a.해외주식 || 0,
              VOO:      a.VOO      || 0,
              RIA:      a.RIA      || 0,
              ISA:      a.ISA      || 0
            };
            fcCurrentYear   = yr;
            fcYearlyPension = 0;
            fcYearlyIRP1    = 0;
          }
        } else {
          Object.keys(forecastByAcct).forEach(k => forecastByAcct[k].push(null));
          forecastTotal.push(null);
        }
      } else {
        // 예측 구간: fcBal 없으면 planBal 복사로 시작
        if (!fcBal) {
          fcBal = { ...planBal };
          fcCurrentYear = planCurrentYear;
          fcYearlyPension = planYearlyPension;
          fcYearlyIRP1    = planYearlyIRP1;
          fcPaidToISA     = planPaidToISA;
          fcPrevTransfers = planPrevTransfers;
          fcVooExhausted  = planVooExhausted;
        }

        if (yr !== fcCurrentYear) {
          fcYearlyPension = 0;
          fcYearlyIRP1    = 0;
          fcCurrentYear   = yr;
        }

        _stepMonth(ym, fcBal, params, {
          yearlyPension: fcYearlyPension,
          yearlyIRP1:    fcYearlyIRP1,
          paidToISA:     fcPaidToISA,
          prevTransfers: fcPrevTransfers,
          vooExhausted:  fcVooExhausted,
          isPlan:        false
        }, (patch) => {
          fcYearlyPension = patch.yearlyPension;
          fcYearlyIRP1    = patch.yearlyIRP1;
          fcPaidToISA     = patch.paidToISA;
          fcPrevTransfers = patch.prevTransfers;
          fcVooExhausted  = patch.vooExhausted;
        });

        forecastTotal.push(_sum(fcBal));
        Object.keys(forecastByAcct).forEach(k => forecastByAcct[k].push(fcBal[k]));
      }
    }

    // ── 이벤트 마커 ──
    if (params.retire?.ym) {
      events.push({ ym: params.retire.ym, label: '퇴직', type: 'retire' });
    }
    if (params.voo?.startYM) {
      events.push({ ym: params.voo.startYM, label: 'VOO 매도 시작', type: 'voo' });
    }
    if (params.isa?.transfers) {
      params.isa.transfers.forEach((t, idx) => {
        events.push({ ym: t.ym, label: `ISA ${idx + 1}차 이체`, type: 'transfer' });
      });
    }
    if (params.nationalPension?.startYM) {
      events.push({ ym: params.nationalPension.startYM, label: '국민연금 수령', type: 'pension' });
    }

    return {
      months,
      plan: { total: planTotal, byAccount: planByAcct },
      forecast: { total: forecastTotal, byAccount: forecastByAcct },
      actual: { total: actualTotal, byAccount: actualByAcct },
      events,
      meta: {
        isaLimitLog,
        vooDepletionMonth: null,  // TODO: 추적 추가
        totalTaxCreditByYear: {}
      }
    };
  }

  // ─── 월별 스텝 함수 (내부) ────────────────────────────────────────────────

  /**
   * 1개월 시뮬레이션 스텝 — bal 객체를 직접 변경(mutate)
   * @param {string}   ym       현재 월 'YYYY-MM'
   * @param {object}   bal      잔액 객체 (mutate)
   * @param {object}   params   파라미터
   * @param {object}   state    누계 상태
   * @param {function} setState 누계 상태 업데이트 콜백
   */
  function _stepMonth(ym, bal, params, state, setState) {
    let { yearlyPension, yearlyIRP1, paidToISA, prevTransfers, vooExhausted } = state;

    const rates = params.rates;
    const mr = {
      연금저축: psAnnualToMonthly(rates.연금저축),
      IRP1:     psAnnualToMonthly(rates.IRP1),
      IRP2:     psAnnualToMonthly(rates.IRP2),
      해외주식: psAnnualToMonthly(rates.해외주식),
      RIA:      psAnnualToMonthly(rates.RIA),
      ISA:      psAnnualToMonthly(rates.ISA),
      VOO:      psAnnualToMonthly(rates.VOO)
    };

    // 1. 수익률 적용 (복리)
    bal.연금저축 *= (1 + mr.연금저축);
    bal.IRP1     *= (1 + mr.IRP1);
    bal.IRP2     *= (1 + mr.IRP2);
    bal.해외주식 *= (1 + mr.해외주식);
    bal.RIA      *= (1 + mr.RIA);
    bal.ISA      *= (1 + mr.ISA);

    // 2. 퇴직금 IRP2 입금 (퇴직 월)
    if (params.retire?.ym === ym) {
      bal.IRP2 += (params.retire.severancePay || 0);
    }

    // 3. ISA 이체 처리 (RIA → ISA)
    if (params.isa?.transfers) {
      for (const tx of params.isa.transfers) {
        if (tx.ym === ym) {
          const txAmt = calcISATransfer(params, paidToISA, prevTransfers, ym, bal.RIA);
          if (txAmt > 0) {
            bal.RIA -= txAmt;
            bal.ISA += txAmt;
            prevTransfers += txAmt;
          }
        }
      }
    }

    // 4. VOO 매도 & 분배
    const vooStartYM = params.voo?.startYM;
    if (!vooExhausted && vooStartYM && _ymLte(vooStartYM, ym)) {
      const isVooMonth = _isVooSellMonth(ym, vooStartYM, params.voo.intervalWeeks);
      if (isVooMonth && bal.RIA > 0) {
        const sellAmt = Math.min(params.voo.priceKRW, bal.RIA);
        bal.RIA -= sellAmt;

        if (bal.RIA <= 0) vooExhausted = true;

        // 분배
        const isLowSell = sellAmt < 500000;
        let remaining = sellAmt;

        if (!isLowSell) {
          // 정상: 연금저축 25만 고정 → IRP1 25만 고정 → 나머지 ISA
          const toPension = Math.min(PS_VOO_DIST.pensionFixed, _pensionRoom(yearlyPension));
          const addPension = Math.min(toPension, remaining);
          bal.연금저축  += addPension;
          yearlyPension += addPension;
          remaining     -= addPension;

          const toIRP1 = Math.min(PS_VOO_DIST.irp1Fixed, _irp1Room(yearlyIRP1));
          const addIRP1 = Math.min(toIRP1, remaining);
          bal.IRP1    += addIRP1;
          yearlyIRP1  += addIRP1;
          remaining   -= addIRP1;
          paidToISA   += remaining;

          bal.ISA += remaining;
        } else {
          // 급락: 연금저축 우선 → IRP1 → ISA
          const toPension = Math.min(_pensionRoom(yearlyPension), remaining);
          bal.연금저축  += toPension;
          yearlyPension += toPension;
          remaining     -= toPension;

          const toIRP1 = Math.min(_irp1Room(yearlyIRP1), remaining);
          bal.IRP1    += toIRP1;
          yearlyIRP1  += toIRP1;
          remaining   -= toIRP1;
          paidToISA   += remaining;

          bal.ISA += remaining;
        }
      }
    }

    // 5. VOO 소진 후: 연금저축 기본 납입 (100만/월)
    if (vooExhausted || !vooStartYM || _ymLt(ym, vooStartYM || '9999-12')) {
      if (!vooStartYM || _ymLt(ym, vooStartYM)) {
        // VOO 시작 전: 연금저축 기본 납입
        const base = params.pension.baseMonthly || 0;
        const addBase = Math.min(base, _pensionRoom(yearlyPension));
        bal.연금저축  += addBase;
        yearlyPension += addBase;
      } else if (vooExhausted) {
        // VOO 소진 후
        const base = params.pension.baseMonthly || 0;
        const addBase = Math.min(base, _pensionRoom(yearlyPension));
        bal.연금저축  += addBase;
        yearlyPension += addBase;
      }
    }

    setState({ yearlyPension, yearlyIRP1, paidToISA, prevTransfers, vooExhausted });
  }

  // ─── 내부 헬퍼 ──────────────────────────────────────────────────────────────

  function _sum(bal) {
    return (bal.연금저축 || 0) + (bal.IRP1 || 0) + (bal.IRP2 || 0) +
           (bal.해외주식 || 0) + (bal.RIA || 0) + (bal.ISA || 0);
  }

  /** 연금저축 남은 납입 한도 */
  function _pensionRoom(yearlyPension) {
    return Math.max(0, PS_ANNUAL_LIMITS.pension - yearlyPension);
  }

  /** IRP1 남은 납입 한도 */
  function _irp1Room(yearlyIRP1) {
    return Math.max(0, PS_ANNUAL_LIMITS.irp1 - yearlyIRP1);
  }

  // ─── 공개 API ────────────────────────────────────────────────────────────────

  return { run, calcISATransfer };

})();
