/**
 * ps-config.js — pension-simulation 전용 상수 & 파라미터 기본값
 * pension 모듈 전용. 기존 js/*.js 파일과 독립.
 */

'use strict';

// ─── 시뮬레이션 기간 ─────────────────────────────────────────────────────────
const PS_START_YM = '2026-01';
const PS_END_YM   = '2074-12';

// ─── 월수익률 변환 ────────────────────────────────────────────────────────────
/**
 * 연수익률 → 월수익률 변환
 * @param {number} annualRate  연수익률 (예: 0.10 = 10%)
 * @returns {number}           월수익률
 */
function psAnnualToMonthly(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

// ─── 기본 파라미터 ────────────────────────────────────────────────────────────
const PS_DEFAULT_PARAMS = {
  rates: {
    연금저축: 0.10,
    IRP1:     0.10,
    IRP2:     0.09,
    해외주식: 0.10,
    RIA:      0.10,
    ISA:      0.10,
    VOO:      0.09
  },
  voo: {
    startYM:       '2027-01',
    intervalWeeks: 3,           // N주마다 1주 매도
    quantity:      34.8012,     // 보유 수량 (주) — 현재 스냅샷 기준, 변경 가능
    priceKRW:      836000       // VOO 1주당 가격 (원) = 현재 주가($605.67) × 당일환율(1,380)
  },
  pension: {
    baseMonthly: 1000000        // 연금저축 기본 납입 (VOO 분배 외, VOO 소진 후 사용)
  },
  isa: {
    joinYM:      '2026-03',
    annualLimit: 20000000,
    transfers: [
      { ym: '2027-05' },
      { ym: '2028-01' },
      { ym: '2029-01' }
    ]
  },
  retire: {
    ym:           '2028-12',
    severancePay: 140000000     // 퇴직금 (원)
  },
  nationalPension: {
    startYM:  '2039-03',
    monthly:  1800000           // 국민연금 월 수령액 (원)
  },
  tax: {
    deductRate:             0.132,    // 세액공제율 (연금저축+IRP 합산)
    rate6069:               0.044,    // 연금소득세율 (60~69세)
    rate70:                 0.033,    // 연금소득세율 (70세~)
    separateTaxThreshold:   15000000  // 분리과세 기준선 (원/년)
  },
  healthInsurance: {
    rate:                   0.0709,    // 건보료율 (매년 1월 고시)
    annualRaise:            0.015,     // 연간 상승률 가정 (10년 평균)
    cap:                    0.12,      // 상한 캡
    ltcRate:                0.1295,    // 장기요양보험료율 (건보료 대비, 매년 고시)
    dependentIncomeLimit:   20000000,  // 피부양자 소득 기준 (원/년, 2022.09 개편)
    dependentPropertyLimit: 540000000, // 피부양자 재산 과표 기준 (원, 2022.09 개편)
    pensionExemptLimit:     12000000,  // 사적연금 건보 면제 하한 (원/년, 2024.01: 1,000만→1,200만)
    financialIncomeLimit:   10000000,  // 금융소득 건보 산입 하한 (원/년, 1,000만 초과 시 전액)
    propertyDeduction:      100000000, // 재산 기본공제 (원, 1억)
    propertyScoreUnit:      208.4,     // 재산 점수당 금액 (원/점, 매년 고시)
    fairMarketRatio:        0.60       // 공정시장가액비율 (60%, 정책 변동 가능)
  },
  property: {
    publicPrice:   710000000,   // 아파트 공시가격 (원, 매년 국토부 공시 확인)
    annualRaise:   0.07,        // 연간 상승률 가정
    ownershipRatio: 0.5         // 소유 지분 비율
  },

  // ── O(리얼티인컴) DRIP 파라미터 (PENSION_WITHDRAWAL.md §5) ────────────────
  // 배당 성장률·주가 성장률: 역사적 평균 기반, 5년마다 재검토
  // financialIncomeLimit: 금융소득 2,000만 상한 — 초과 시 DRIP 속도 조절 필요
  realty: {
    shares:               546.5646,  // 현재 보유 수량 (주), DRIP 후 매월 자동 증가
    currentPrice:         63.00,     // 현재가 ($), 연 1회 업데이트
    monthlyDivPerShare:   0.2685,    // 월 배당/주 ($), 분기 공시 후 연 1회 업데이트
    divGrowthRate:        0.03,      // 배당 성장률 (연, 역사적 평균)
    priceGrowthRate:      0.03,      // 주가 성장률 (연, 역사적 평균)
    fxRate:               1380,      // 기준 환율 (원/달러, 고정 가정)
    withholdingRate:      0.15,      // 미국 원천징수율 (W-8BEN 제출 기준 15%, 미제출 시 30%)
    financialIncomeLimit: 20000000   // 금융소득 연간 상한 (원, 소득세법 제62조)
  },

  // ── 계획선 기준 잔액 (PS_START_YM 직전 월인 2025-12 역산값) ──────────────
  // plan 선이 Firebase 최신 데이터(initialBalances)에서 출발하면
  // _stepMonth('2026-01') 적용 후 plan[0] = actual[0] + 1달 성장분 차이가 발생.
  // PS_START_YM='2026-01' 실측값에서 1달 역산하여 plan 기준점으로 고정.
  planStartBalances: {
    연금저축: 29395595,   // (Jan실측 30,630,000 - 100만 기본납입) / (1.10^(1/12))
    IRP1:     6379132,    // Jan실측 6,430,000 / (1.10^(1/12))
    IRP2:     36010461,   // Jan실측 36,270,000 / (1.09^(1/12))
    해외주식: 131850912,  // Jan실측 132,880,000 역산 (VOO 포함)
    RIA:      0,
    ISA:      0
  }
};

// ─── eval[] 인덱스 매핑 (pension 모듈 전용 단일 진실 공급원) ─────────────────────
//
// config.js AI_IDX 는 한국어 키를 사용하므로 직접 접근 금지.
// pension 모듈 내부는 반드시 이 상수를 통해 eval[]/invest[] 인덱스를 참조한다.
//
//   AI_IDX['개인연금저축'] = 3  →  PS_EVAL_IDX.연금저축 = 3
//   AI_IDX['퇴직연금001']  = 7  →  PS_EVAL_IDX.IRP1     = 7
//   AI_IDX['퇴직연금002']  = 8  →  PS_EVAL_IDX.IRP2     = 8
//   AI_IDX['해외']         = 0  →  PS_EVAL_IDX.해외주식 = 0
//   AI_IDX['RIA']          = 10 →  PS_EVAL_IDX.RIA      = 10
//   AI_IDX['ISA']          = 9  →  PS_EVAL_IDX.ISA      = 9
//   (VOO 는 RIA 와 동일 계좌 → PS_EVAL_IDX.RIA 사용)
//
const PS_EVAL_IDX = {
  연금저축: 3,
  IRP1:     7,
  IRP2:     8,
  해외주식: 0,
  RIA:     10,
  ISA:      9
};

// ─── VOO 분배 한도 ────────────────────────────────────────────────────────────
const PS_VOO_DIST = {
  pensionFixed: 250000,   // 연금저축 고정 분배 (원)
  irp1Fixed:    250000    // IRP1 고정 분배 (원)
};

// ─── 연금 납입 연간 한도 ──────────────────────────────────────────────────────
const PS_ANNUAL_LIMITS = {
  pension: 15000000,   // 연금저축 연 1,500만 한도
  irp1:    3000000     // IRP1 연 300만 한도
};

// ─── 연금저축+IRP 합산 납입 검증 한도 ───────────────────────────────────────
// 전략 구조: 연금저축 월 125만 + IRP 월 25만 = 월 150만 × 12개월 = 연 1,800만
// 세액공제 한도(900만)와 실제 납입 한도(1,800만)는 별개로 검증한다.
const PS_CONTRIBUTION_LIMITS = {
  warningAt:      15000000,  // 누적 1,500만 이상 노란 경고
  combinedAnnual: 18000000   // 연금저축+IRP 합산 연간 납입 상한
};
