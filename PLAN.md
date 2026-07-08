## 🔔 전략 세션 반영 필요
> Claude Code 세션 중 발생한 정책성 변경을 여기 기록. 전략 세션(Claude.ai)이 매 대화 시작 시 확인 후 Notion 반영 → 체크 처리.

- [x] (2026-07-02) RIA 세제혜택 가중치 제도 pension-simulation에 반영. RIA 매도금액 49,511,610원(2026-03-31 확정, 외화매도 47,950,533원+환전정산입금 1,561,077원, 키움 거래내역 근거) 고정값 사용, 기초공제율 100%(1분기 내 매도). RIA 외 계좌 해외지수ETF 순매수액에 매수월 가중치(1~5월100%/6~7월80%/8~12월50%) 적용해 최종 양도소득 공제율 산출. 순매수액은 자동추적 불가(연금저축/IRP 내 종목별 매수 구분 불가)로 월별 수동 입력 방식 채택 — 2026년 1~6월분 소급 입력 필요.
- [x] (2026-07-03) RIA 외 계좌 순매수액 2026년 1~6월분 소급 입력 완료(P0-2-BACKFILL). 확정값: 1월 1,520,831원 / 2월 664,144원 / 3월 1,113,072원 / 4~6월 0원(확정 무매수). 집계 기준: MMF 등 현금성 자산 매수/매도 제외, 해외지수ETF·배당ETF 순매수 + 해외직접투자 VOO/O 매수(키움 환전정산 원화금액) 포함. 소스: 해외주식매수현황26년1분기_260327.xlsx.
- [x] (2026-07-05) CLAUDE.md 섹션 7(연금저축+IRP 납입 한도) 문구 정정 — 기존 "연금저축 월 125만+IRP 월 25만=월 150만" 문구는 2027-01 VOO 매도 재개 후의 목표 구조이며, 2026년 현재는 VOO 매도 미시작으로 연금저축 기본 100만원/월만 활성(IRP1 VOO분배 미작동)임을 코드(`ps-config.js`/`ps-engine.js`) 검증으로 확인. 계획/실적 구분 문구로 교체, 실적 합계는 1,930,000원(아래 PENSION-ACTUAL-BACKFILL 정정값과 동일)으로 통일.
- [ ] (2026-07-03) PS-DECUMULATION-INTEGRATION Phase5 검증 중 발견한 재무적 사실 2건 — 버그 아니라 현재 파라미터 조합의 특성이므로 전략 세션에서 인지·필요시 정책 재검토: ① IRP1이 국민연금 개시(65세, 2039-03) 직후부터 §9-9 연금수령한도에 자주 걸림 — IRP1 잔액이 작아(연차 1년차 기준 잔액의 12%) 목표 월 150만원을 감당 못함, IRP1 조기 추가납입 또는 목표 인출액 하향 검토 필요. ② 기본 파라미터 조합에서는 국민연금(65세, 소득만으로는 85세까지도 피부양자 유지 가능 — 개별 검증 완료)도 배우자 정년(2043-01, 개별 검증 완료)도 아니라 **아파트 공시가 연 7% 상승 가정에 따른 재산 기준 초과가 66세(2040-02)에 가장 먼저 피부양자 탈락을 유발**함 — `property.annualRaise=0.07` 가정치 재검토 여부 논의 필요.

# MyAssetDashBD 개발 계획

## 1. 프로젝트 개요

개인 자산 대시보드 웹앱. Firebase Realtime Database를 단일 데이터 소스로 사용하며,
localStorage를 로컬 캐시로 활용한다. Pension-tracer 앱과 Firebase를 공유한다.

### 파일 구조

```
MyAssetDashBD/
  index.html          ← 전체 UI (모달 포함)
  css/style.css       ← 다크 테마 스타일
  js/
    config.js         ← 상수, 키 정의, 전역 변수
    render.js         ← 카드·차트 렌더링 함수
    modal.js          ← 모달 열기/닫기/적용 로직
    init.js           ← 초기화, save(), 편집 오버레이
    firebase.js       ← Firebase GET/PUT, 병합 로직
    export.js         ← 내보내기 기능
    todo.js           ← 할 일 목록 관리
```

### Firebase 데이터 구조 (`asset-data/`)

```
asset-data/
  version: 1
  exportedAt: "ISO timestamp"
  state/
    pension-saving:  { val: number(원), date: "YYYY-MM-DD" }
    pension-irp1:    { val: number(원), date: "YYYY-MM-DD" }
    pension-irp2:    { val: number(원), date: "YYYY-MM-DD" }
    irp1:            { val: number(만원) }   ← IRP1 누적투자금
    irp2:            { val: number(만원) }   ← IRP2 누적투자금
    kiwoom-overseas: { val: number(원), date: "YYYY-MM-DD" }
    kiwoom-obil:     { val: number(원), date: "YYYY-MM-DD" }  ← OBil (연금 무관)
    isa:             { val: number(원), date: "YYYY-MM-DD" }  ← ISA(삼성증권) ✅ 구현 완료
    ria:             { val: number(원), date: "YYYY-MM-DD" }  ← RIA(키움) ✅ 구현 완료
    toss-*:          { val, date }
    ...
  kiwoom/
    combined: [
      { month: "YYYY-MM", date: "YYYY-MM-DD", eval: [...], invest: [...] }
    ]
  todos: [...]
  goal: { name, target, finName, finTarget }
  pension-tracker/   ← Pension-tracer 앱 전용 섹션 (구버전, 아카이브/배포 중단 대상)
  pensionSimulation/
    contributions/   ← pension-simulation 월별 납입 실적(연금저축+IRP 한도 검증용)
                        + riaExternalPurchase(원, RIA 외 계좌 해외지수ETF 순매수액 수동입력, 미입력=undefined/0=확정무매수 구분)
  sangchu/           ← 상추매매 독립 노드 (state/trades/journal)
  obilTracer/        ← 오빌 손실상쇄 추적 독립 노드
    trackingStartDate: "2026-03-20"
    rf/              ← 알에프텍 보유 + 누적 실현손익
    substitute/      ← 대체오빌 종목 + 합산 누적 실현손익 + history
    log/             ← 세션별 스냅샷 (append only)
```

---

## 2. 계좌 구성

### 2-0. 증권사별 계좌 분류 (용어 기준)

> ⚠️ "키움계좌"라는 표현 사용 금지. 계좌마다 증권사가 다르다.

| 증권사 | 계좌 | Firebase 키 | eval/invest 인덱스 |
|--------|------|------------|-------------------|
| **삼성증권** | 개인연금저축 | `pension-saving` / `toss-pension` | eval[3] / invest[3] |
| **삼성증권** | 퇴직연금 IRP 1 | `pension-irp1` | eval[7] / invest[7] |
| **삼성증권** | ISA | `isa` | eval[9] |
| **키움증권** | 해외주식 | `kiwoom-overseas` / `toss-overseas` | eval[0] / invest[0] |
| **키움증권** | 오빌(OBil) | `kiwoom-obil` / `toss-obil` | eval[1] / invest[1] |
| **키움증권** | 초빌 | — | eval[6] / invest[6] |
| **키움증권** | 연습 | — | eval[5] / invest[5] |
| **키움증권** | RIA (6598-2304) | `kiwoom-ria` | eval[10] |
| **하나투자증권** | 퇴직연금 IRP 2 | `pension-irp2` | eval[8] / invest[8] |

### 2-1. 토스모으기 계좌 → 증권사 계좌 매핑

| 토스모으기 키 | 대응 계좌 | 증권사 |
|--------------|---------|--------|
| `toss-pension` | 개인연금저축 | 삼성증권 |
| `toss-overseas` | 해외주식 | 키움증권 |
| `toss-obil` | 오빌(OBil) | 키움증권 |
| `toss-practice` | 연습 | 키움증권 |

**합산 원칙**: 평가금 = 증권사 eval[idx] + 토스모으기.val / 투자금 = 증권사 invest[idx] + 토스모으기.val

### 2-2. 전체 계좌 목록

| 계좌 | Firebase 키 | 단위 | 섹션 | 비고 |
|------|------------|------|------|------|
| 개인연금저축 | `pension-saving` | 원 | pension-snap | toss-pension과 합산 표시 |
| 퇴직연금 IRP 1 | `pension-irp1` | 원 | pension-snap | eval[7] 연동 (삼성증권) |
| 퇴직연금 IRP 2 | `pension-irp2` | 원 | pension-snap | eval[8] 연동 (하나투자증권) |
| **ISA(삼성증권)** | `isa` | 원 | pension-snap + 수동 카드 | ✅ 모달·카드 구현 완료 |
| **RIA(키움, 6598-2304)** | `kiwoom-ria` | 원 | kiwoom-snap (JSON 스냅샷) | eval[10], kiwoom-analyzer 통해 입력 |
| 해외주식(키움증권) | `kiwoom-overseas` | 원 | kiwoom-snap | |
| OBil/오빌(키움증권) | `kiwoom-obil` | 원 | kiwoom-snap | 연금 무관 계좌 |

---

## 3. UI 섹션 구성 및 현황

### 3-1. 📸 MY페이지 스냅샷 (`kiwoom-snap-cards`)

- **그리드 ID**: `kiwoom-snap-grid`
- **렌더 함수**: `renderKiwoomSnap()` in `render.js`
- **키 배열**: `KIWOOM_SNAP_KEYS` in `config.js`
- **데이터 소스**: `state[k]` (키움 JSON 붙여넣기 모달로 입력)
- **현재 표시**: 해외, 오빌, 연습, 자사주, 별동대, 초빌 + **RIA(항상 표시)**

| # | 변경사항 | 상태 |
|---|---------|------|
| A | RIA 카드 추가 (데이터 없어도 항상 표시, 클릭 시 모달 오픈) | ✅ 완료 |

---

### 3-2. 📊 키움 포트폴리오 카드 (`kiwoom-cards`)

- **렌더 함수**: `renderKiwoom()` in `render.js`
- **데이터 소스**: `kiData.combined` (월별 eval/invest 배열)
- **현재 표시**: 해외, 오빌, 연습, 개인연금저축, IRP 1, IRP 2 + **ISA, RIA(항상 표시)**

| # | 변경사항 | 상태 |
|---|---------|------|
| B | ISA 카드 추가 (잔액만 표시, 수익률 미산출) | ✅ 완료 |
| C | RIA 카드 추가 (잔액만 표시, 수익률 미산출) | ✅ 완료 |

---

### 3-3. 📸 토스 연금 스냅샷 (`pension-snap-cards`)

- **그리드 ID**: `pension-snap-grid` (auto-fit 반응형 그리드)
- **렌더 함수**: `renderPensionSnap()` in `render.js`
- **키 배열**: `PENSION_SNAP_KEYS` in `config.js`
- **현재 표시**: 퇴직연금 IRP 1, IRP 2, 개인연금저축 + **ISA, RIA(항상 표시)**

| # | 변경사항 | 상태 |
|---|---------|------|
| D | ISA 카드 (항상 표시, 클릭 시 모달 오픈) | ✅ 완료 |
| E | RIA 카드 (항상 표시, 클릭 시 모달 오픈) | ✅ 완료 |

> ISA·RIA는 `ALWAYS_KEYS`로 분리 처리 — 데이터 없어도 "클릭해 잔액 입력" 안내와 함께 항상 렌더됨.

---

### 3-4. 수동 카드 그리드 (연금/IRP 섹션 하단)

- IRP 1 · IRP 2 (수동 입력 카드) + 개인연금저축(토스) + **ISA + RIA** 카드
- **현재**: `repeat(auto-fit, minmax(180px, 1fr))` 반응형 그리드 (5칸 자동 래핑)

| # | 변경사항 | 상태 |
|---|---------|------|
| F | ISA 수동 잔액 카드 추가 (항상 표시, 클릭 시 openIsaModal()) | ✅ 완료 |
| G | RIA 수동 잔액 카드 추가 (항상 표시, 클릭 시 openRiaModal()) | ✅ 완료 |

---

## 4. 완료된 작업

| # | 작업 | 파일 | 완료일 |
|---|------|------|--------|
| 1-4 | ISA/RIA 키 `PENSION_SNAP_KEYS` 등록 | `config.js` | 2026-03-19 |
| 1-2 | ISA 잔액 입력 모달 HTML | `index.html` | 2026-03-19 |
| 1-3 | RIA 잔액 입력 모달 HTML | `index.html` | 2026-03-19 |
| — | ISA/RIA 헤더 버튼 추가 | `index.html` | 2026-03-19 |
| — | ISA/RIA 모달 로직 | `modal.js` | 2026-03-19 |
| 1-5 | Firebase PUT 자동 포함 확인 | `firebase.js` | ✅ 별도 작업 불필요 |
| 2-1 | ISA 모달을 거래내역 JSON 파싱 방식으로 전환 | `index.html`, `modal.js`, `config.js` | 2026-03-19 |
| IRP | IRP1/IRP2 납입 자동 계산 — invest[7]/[8] 델타 방식 | `modal.js` | 2026-03-19 |
| BUG-1 | IRP1 납입 인식 에러 — `mPop 입금`/`이체입금` 키워드 추가, `현금배당` 필터 제외 | `modal.js` | 2026-03-20 |
| BUG-2 | ISA 거래내역 적용 후 kiwoom-cards 미동기화 — `renderKiwoom()` 호출 추가, `source:'transaction'` 저장 | `modal.js` | 2026-03-20 |
| BUG-3 | ISA kiwoom-card 뱃지 `수동입력`→`거래내역` 동적 전환, 하단 문구 투자금 표시로 개선 | `render.js` | 2026-03-20 |
| BUG-4 | IRP1/IRP2 투자금 소스 전환 — 모든 뷰(카드·차트)에서 `state['irp1/2'].val` 대신 `kiData.invest[7/8]` 사용 | `render.js` | 2026-03-20 |
| BUG-5 | IRP1/IRP2 edit overlay 수동 잔고 입력 제거 → 자동계산 안내 문구로 교체 | `index.html` | 2026-03-20 |
| BUG-6 | ISA 카드 중복 제거 — 키움 섹션 extraCard에서 ISA 제거, pension-snap 단일 진입점 유지 | `render.js` | 2026-03-20 |
| BUG-7 | pension-snap 섹션 전체 제거 — 계좌별 카드 1개로 통합, kiwoom 섹션 상세 카드로 일원화 | `render.js`, `index.html` | 2026-03-20 |
| BUG-8 | ISA·RIA 카드 클릭 모달 제거 — 표시 전용, 모달은 상단 버튼으로만 접근 | `render.js` | 2026-03-20 |
| ISA-E | ISA 뱃지 `수동입력`→`거래내역` 고정, ISA 평가금액 버튼/모달 추가 (eval[9] 저장) | `index.html`, `modal.js`, `render.js` | 2026-03-20 |
| A | `kiwoom-snap-grid`에 RIA 카드 항상 표시 | `render.js` | 2026-03-19 |
| B/C | `kiwoom-cards`에 ISA·RIA 잔액 전용 카드 항상 표시 | `render.js` | 2026-03-19 |
| D/E | `pension-snap-grid`에 ISA·RIA 항상 표시 (ALWAYS_KEYS 분리) | `render.js` | 2026-03-19 |
| F/G | 연금 섹션 수동 카드 그리드에 ISA·RIA 카드 추가 | `index.html` | 2026-03-19 |
| PENSION-CARD | 개인연금저축 카드 통합 — 배지/이름 변경, 표시금액·투자금 = 삼성증권 eval/invest[3] + toss-pension.val 합산 | `index.html`, `render.js` | 2026-03-20 |
| CHART-ISA-RIA | ISA(eval[9])/RIA(eval[10]) 포트폴리오 차트 3종 추가 — MAIN_ACCOUNTS 확장, ACCT_COLORS 추가, AI 매핑 업데이트, kiwoom-cards 중복 방지(CHART_ONLY_ACCOUNTS 필터) | `config.js`, `render.js` | 2026-03-20 |
| BUG-FIREBASE | Firebase 저장 방식 PUT → PATCH 변경 — pension-tracker 키 보존 (PUT은 asset-data 전체 교체로 pension-tracker 삭제됨) | `firebase.js` | 2026-03-23 |
| RIA-SNAP | kiwoom-ria(6598-2304) 스냅샷 지원 — eval[10] 차트/합계 반영 | `config.js`, `render.js` | 2026-03-24 |
| BUG-RIA-INVEST | RIA 투자금 이중계산 수정 — _adjInvest 헬퍼: invest[0](해외)에서 RIA 매입금 차감, invest[10]에 매입금 반영, RIA 모달에 매입금액 입력 필드 추가 | `index.html`, `modal.js`, `render.js` | 2026-03-25 |
| BUG-TOSS-INVEST | 선 그래프 총 투자금 점선에 toss 모으기 잔고 미반영 수정 — 최신 데이터 포인트에 toss-pension/overseas/obil/practice 잔고 합산. 해외→toss 이전 시 투자금 감소처럼 보이던 구조적 버그 해소 | `render.js` | 2026-03-26 |
| BUG-TOSS-HISTORY | 선 그래프 투자금(점선) 과거 월별 toss 잔고 미반영 수정 — kiData.tossHistory 구조 추가, updateLineChart() 전체 구간 tossHistory 반영(최신 월 state 폴백), exportMonthlyXlsx() 월별투자금 시트 toss 합산. tossHistory는 JSON/엑셀 모달 적용 시 해당 월 자동 업데이트(별도 이력 모달 없음) | `index.html`, `modal.js`, `render.js`, `export.js` | 2026-03-26 |
| RIA-FX | RIA 모달 개선 — ria-val-input 제거(평가 잔액은 키움 계좌 모달에서 자동 반영), 매입금액 환율 자동 계산(open.er-api.com, SPY 463.8826×52주×당일 USD/KRW), 기존 investVal 있으면 자동 채우기 생략 | `index.html`, `modal.js` | 2026-03-26 |
| RIA-INVEST-ADJ | 해외 카드 투자금 왜곡 수정 — RIA 출고(2026-03) 이후만 invest[0]에서 RIA 매입금 차감. _adjInvest idx=0 차감·idx=10 복원(총합 불변), 해외 카드 렌더링·수익률 차트 동일 보정. 과거 월 왜곡 없음 | `render.js` | 2026-03-26 |
| TOSS-SEED | 토스 잔고 이력 시드 데이터(2021-11~2026-02) 코드 직접 삽입 — _TOSS_HISTORY_SEED 상수 + _applyTossHistorySeed() 로 _initCore() 최초 로드 시 자동 적용. 이미 존재하는 월은 덮어쓰지 않음 | `init.js` | 2026-03-26 |
| UPDATE-CARD | kiwoom-snap 섹션(MY페이지 스냅샷) 삭제 — index.html div, render.js renderKiwoomSnap() 함수, modal.js 호출 제거. kiwoom-cards 투자금에 toss-overseas/obil/pension/practice 현재 잔고 합산. 은행/토스모으기 섹션에 개인연금저축모으기 카드(val-toss-pension-bank) 추가 | `index.html`, `render.js`, `modal.js` | 2026-03-26 |
| TOSS-EVAL | Method B — 과거 평가금 toss 보정. _evalWithToss() 헬퍼 추가(2025-11 이전 월에 tossHistory 합산). updateLineChart/updateReturnChart 적용. exportMonthlyXlsx에 월별평가금액(toss포함) 시트 추가. 데이터원본_2602.xlsx 25년11월~26년2월 toss 포함 값으로 수정 후 migrate.js 재실행 및 Firebase 업데이트 완료 | `render.js`, `export.js` | 2026-03-29 |
| SLIDER | 계좌별 차트 시점 선택 드롭다운 → range 슬라이더 변경 | `index.html`, `css/style.css`, `js/render.js` | 2026-03-29 |
| P1-1 | `mergeGasData_()` tossHistory deep merge — 타기기 동기화 시 tossHistory 소실 방지 | `firebase.js` | 2026-04-01 |
| P1-2 | toss 입력 시 이전 월 tossHistory 자동 백필 — 월 전환 시 투자금 0 감소 버그 해소 | `modal.js`, `export.js` | 2026-04-01 |
| P1-4 | `applyPensionResult()` eval/invest 배열 크기 9/10 → 11 (RIA 인덱스 포함) | `modal.js` | 2026-04-01 |
| P2-5 | eval/invest `new Array(9/10)` → `new Array(11)` 전면 통일 — applyKiwoomResult·applyKiwoomTransferResult·applyIsaEvalModal·applyPensionResult(existing 분기) 5곳 수정 | `modal.js` | 2026-04-01 |
| P2-1 | AI 인덱스 맵 단일화 — `config.js`에 `AI_IDX`/`AI_NAMES` 전역 상수 추가, render.js 3곳 `const AI = AI_IDX;` 참조로 교체, export.js 로컬 `AI_NAMES` 제거 | `config.js`, `render.js`, `export.js` | 2026-04-01 |
| P2-3 | combined entry 생성 헬퍼 `_getOrCreateCombinedEntry(ym, date)` 추출 — applyKiwoomResult·applyPensionResult 중복 블록 통합 | `modal.js` | 2026-04-01 |
| P2-6 | `_adjInvest()` 날짜 하드코딩 제거 — `'2026-03'` → `state['ria']?.riaStartYm \|\| '2026-03'` (render.js 2곳) | `render.js` | 2026-04-01 |
| PS-Phase0 | pension-simulation 영향도 분석 & `.claude/INTERFACE.md` 생성 — 전역변수/Firebase스키마/계좌인덱스/CSS충돌위험 정리 | `.claude/INTERFACE.md` | 2026-04-07 |
| PS-Phase1 | ps-config.js(DEFAULT_PARAMS, 상수) & ps-engine.js(PensionEngine.run, VOO분배, ISA한도, calcISATransfer) 생성. 검증: months=180 ✅ VOO분배 ✅ ISA이체 ✅ | `js/pension/ps-config.js`, `js/pension/ps-engine.js` | 2026-04-07 |
| PS-BUG-IDX | eval[] 인덱스 키명 표준화 — PS_EVAL_IDX 단일 진실 공급원 도입. AI_IDX 한국어키('개인연금저축' 등) 직접 접근 제거. ps-firebase.js _getIdx() 삭제, INTERFACE.md 정정. 6계좌 0 추출 버그 해소 | `js/pension/ps-config.js`, `js/pension/ps-firebase.js`, `.claude/INTERFACE.md` | 2026-04-07 |
| PS-BUG-PLAN0 | pension plan 초기값 discrepancy 수정 — planBal을 Firebase 최신 항목(Jan 2026)으로 초기화하면 _stepMonth('2026-01') 후 plan[0]이 actual[0]보다 ~260만 높아지는 버그. planStartBalances(2025-12 역산 고정값)를 PS_DEFAULT_PARAMS에 추가, ps-engine.js planBal 초기화 변경. 차이 260만→0만 ✅ | `js/pension/ps-config.js`, `js/pension/ps-engine.js` | 2026-04-09 |
| PS-PERIOD | 시뮬레이션 기간 2040→2074년 확장 — PS_END_YM 변경(180→588개월), PERIOD_STEPS에 30·48년 추가(ps-chart.js, ps-init.js 동기화) | `js/pension/ps-config.js`, `js/pension/ps-chart.js`, `js/pension/ps-init.js` | 2026-04-09 |
| EXCEL-SHEET | 엑셀 내보내기 시트 정리 — 월별평가금액(toss 미포함) 시트 삭제, 시트명 변경(월별투자금→투자금, 월별평가금액(toss포함)→평가금, 토스모으기이력→Toss모으기이력, 월별수익률(%)→월수익율(%)), 시트 순서 재정렬(투자금/평가금/Toss모으기이력/스냅샷현황/월수익율(%)). 월수익율(%) 버그 수정: inv[10] RIA 투자금 복원, inv[0] 해외 RIA 출고분 차감(riaStartYm 기준) | `export.js` | 2026-04-13 |
| SANGCHU-V1 | 상추매매 슬롯 통합 — Firebase `/asset-data/sangchu` 독립 노드, 상추 카드(보유비중/평단/일잔여한도/누적수익), 매매 입력 모달(예상결과 실시간 계산), 일지 accordion. 초기 시드: 제일일렉트릭 1주 매수(2026-04-24, 11960원) → 매도(2026-04-27, 12310원, +350원 실현) | `js/firebase.js`, `js/sangchu.js`(신규), `index.html`, `css/style.css`, `js/init.js` | 2026-04-28 |
| OBIL-TRACER-V1 | 오빌 손실상쇄 추적 — Firebase `/asset-data/obilTracer` 독립 노드, 오빌Tracer 카드(알에프텍누적/상쇄종목누적/상쇄율), JSON 붙여넣기 모달(비전AI 지시문 복사+파싱+미리보기+종목교체), 상추 카드 숨김 처리, firebase.js 중복 sangchu 함수 제거 | `js/firebase.js`, `js/obilTracer.js`(신규), `index.html`, `css/style.css`, `js/init.js` | 2026-06-19 |
| BUG-TOSS-EVAL-SYNC | eval-tossHistory 불일치 스파이크 수정 — applyKiwoomResult()에서 스냅샷 시 toss값을 tossHistory에 함께 기록, applyAiResult()에서 tossHistory 변경 시 같은 달 _hasToss 스냅샷 eval 재계산. 토스 JSON 재입력으로 언제든 일관성 복구 가능 | `modal.js` | 2026-05-12 |
| PS-WITHDRAWAL-DESIGN | 연금 인출 시뮬레이터 설계 기준서 생성 — 법령별 파라미터(소득세법 제129조/제14조/제62조), 건보료 단계(피부양자→지역가입자), O DRIP 파라미터, 피부양자 등록 주의사항, 연간 모니터링 체크리스트, ps-withdrawal.js 연동 키맵 | `.claude/PENSION_WITHDRAWAL.md`(신규) | 2026-06-29 |
| PS-Phase7 | 월별 계획 vs 실적 테이블 통합 — Pension-tracer 정적 테이블 대체. ps-table.js 신규 생성, 납입 실적 입력 폼, 연금저축+IRP 합산 연 1,800만원 검증(1,500만원 경고/1,800만원 초과 저장 차단), Firebase `pensionSimulation/contributions` 저장, Pension-tracer 폐기 방침 문서화 | `js/pension/ps-table.js`(신규), `js/pension/ps-firebase.js`, `js/pension/ps-config.js`, `js/pension/ps-init.js`, `pension-simulation.html`, `css/pension-sim.css`, `PLAN.md`, `CLAUDE.md` | 2026-07-02 |
| PS-WITHDRAWAL-V1 | 연금 인출 시뮬레이터 구현 — ps-config.js에 healthInsurance 파라미터 보완 + realty(O DRIP) 블록 신규 추가. ps-withdrawal.js(인출 엔진: O DRIP 월복리 DRIP, 비과세원금/과세분/국민연금/IRP 소득원별 계산, 연금소득세, 건보료 단계별). ps-withdrawal-ui.js(나이 슬라이더→결과 카드 렌더링). pension-simulation.html 섹션 추가. pension-sim.css ps-wd-* 스타일 추가 | `js/pension/ps-config.js`, `js/pension/ps-withdrawal.js`(신규), `js/pension/ps-withdrawal-ui.js`(신규), `js/pension/ps-init.js`, `pension-simulation.html`, `css/pension-sim.css` | 2026-06-29 |
| P0-2-RIA-DEDUCT | RIA 세제혜택 가중치 반영 — PS_RIA_TAX_BENEFIT(매도금액 49,511,610원 고정, 기초공제율100%) + getRiaWeight(1~5월100%/6~7월80%/8~12월50%) 추가. calcRiaAdjustedDeduction() 순수함수(조정비율=1−가중순매수액/매도금액, 최종공제율=기초공제율×max(0,조정비율)) PensionEngine에 공개. ps-table.js에 해외지수ETF 순매수액 월별 수동입력 필드 추가 — contributions[ym].riaExternalPurchase 재사용(빈값=키 생략/미입력, "0"=확정무매수 구분), 실시간 미리보기 카드(가중순매수액/조정비율/최종공제율), PS_START_YM~현재월 이전 미입력 개월 수 경고. 검증: 0원→100%, 2월 3천만(가중100%)/8월 6천만(가중50%) 동일하게 →39.4%, 6천만 초과 매수→0% 하한 | `js/pension/ps-config.js`, `js/pension/ps-engine.js`, `js/pension/ps-table.js` | 2026-07-02 (PR #75 main 병합완료) |
| P0-2-BACKFILL | RIA 외 계좌 순매수액 2026년 1~6월분 소급 입력 — 전략 세션에서 사용자 엑셀 거래내역 직접 집계로 확정값 도출(1월 1,520,831 / 2월 664,144 / 3월 1,113,072 / 4~6월 0원 확정무매수). Firebase 직접 쓰기용 서비스 계정 키가 레포에 없어 `migrate.js`/`paste-in-console.js`와 동일한 "브라우저 콘솔 붙여넣기" 패턴 채택 — 월별 기존 contributions[ym] GET 후 riaExternalPurchase만 병합해 PUT(다른 필드 보존), localStorage 캐시 동기화 포함. 사용자가 로그인된 브라우저에서 직접 실행 필요 | `ria-external-purchase-backfill-console.js`(신규) | 2026-07-03 |
| BUG-PAGES-DEPLOY | GitHub Pages 빌드 실패(run #184, #185) 조사 — 로그 확인 결과 **Jekyll Liquid 파싱 에러 아님**: 두 run 모두 `build`(Jekyll) job은 정상 성공, 실패는 `deploy` job에서 `actions/deploy-pages@v5`가 반환한 `Deployment failed, try again later.`(GitHub Pages API 측 일시적 오류). #184는 PR #75 머지(01:24:12) 직후 3분47초 만에 PR #76 머지(01:27:57)로 배포가 연속 큐잉된 시점, #185는 PR #77 머지(03:37:56) 직후 발생 — 직전 배포가 마무리되기 전 다음 배포가 겹쳐 들어간 정황과 일치, 저장소 파일 내용과는 무관. 조치: ① 이 프로젝트는 순수 정적 JS 앱으로 Jekyll 처리가 애초에 불필요하므로 근본 대비책으로 `.nojekyll` 추가(빌드 단계 단순화, 향후 유사 실패 표면 축소 — 단 이번 두 건의 실제 원인은 아님) ② run #185(현재 main HEAD) `deploy` job 재실행으로 정상 배포 확인 | `.nojekyll`(신규) | 2026-07-03 |
| BUG-PAGES-DEPLOY-2 | GitHub Pages 배포 방식 Actions → Branch 전환(BUG-PAGES-DEPLOY 후속) — `actions/deploy-pages@v5`의 반복되는 "Deployment failed, try again later."는 GitHub 인프라 측 알려진 이슈(actions/deploy-pages 저장소 issue #418, #406 등)로 저장소 측 코드 수정으로 해결 불가. 이 앱은 Jekyll/빌드 스텝이 불필요한 순수 정적 HTML/JS라 애초에 Actions 기반 배포를 쓸 이유가 없어, Settings→Pages→Source를 **"GitHub Actions" → "Deploy from a branch"(main, /root)**로 전환(사용자가 웹 UI에서 직접 수행, 스크린샷으로 전환 확인). 이 경로는 `actions/deploy-pages@v5`를 거치지 않는 legacy 배포 파이프라인이라 해당 인프라 이슈 자체가 재발 불가능한 구조. `.github/workflows/`에 별도 파일이 없어 삭제 대상 없음, gh-pages 브랜치·/docs 폴더도 없어 충돌 없음. **미해결**: 이 세션의 아웃바운드 네트워크 정책이 `jungukeu-ctrl.github.io` 도메인을 프록시 단에서 차단(`gateway answered 403 to CONNECT`)해 실제 배포 URL 정상 접속 여부는 세션에서 직접 검증하지 못함 — 사용자 브라우저에서 최종 확인 필요 | (저장소 설정 변경, 코드 파일 변경 없음) | 2026-07-03 |
| PENSION-LEGACY-MIGRATION | 연금저축/IRP1 월별 납입 실적 레거시 마이그레이션(2026-01~06) — 레거시 Pension-tracer가 자동 기록해둔 `asset-data/pension-tracker/records/{ym}.c_pension`(키움 잔액 델타)/`c_irp`(IRP1 델타)를 재입력 없이 `pensionSimulation/contributions/{ym}.연금저축`/`IRP1`로 이전. IRP2는 매핑 없음(레거시에도 납입 없는 계좌)이라 미변경. 이 세션 아웃바운드 프록시가 Firebase RTDB 도메인을 허용목록 밖으로 차단(`host_not_allowed`)해 세션에서 직접 GET/PUT 불가 확인 — P0-2-BACKFILL(PR #77/#79)과 동일하게 "브라우저 콘솔 붙여넣기" 스크립트 채택. 스크립트가 실행 시점에 6개월분 레거시 값 존재 여부를 먼저 `console.table`로 보고(누락 달은 자동 건너뜀 + 경고) 한 뒤, 값이 있는 필드만 GET→merge→PUT으로 저장(riaExternalPurchase 등 기존 필드 보존), localStorage 캐시 동기화. **후속 PENSION-ACTUAL-BACKFILL에서 부정확 판명 → 대체됨** | `pension-legacy-contribution-migration-console.js`(신규) | 2026-07-03 |
| PENSION-ACTUAL-BACKFILL | 연금저축/IRP1 월별 납입 실적 실측값 재백필(2026-01~06) — 직전 PENSION-LEGACY-MIGRATION이 참조한 `pension-tracker/records.c_pension`/`c_irp` 자동계산 값이 **부정확함이 확인됨**(전략 세션에서 사용자 삼성증권 실제 거래내역 "이체입금" 직접 대조, 레거시 자동계산 로직이 실제 입금 일부를 놓친 것으로 추정 — 원인 미조사, 실측값으로 덮어씀). 확정값: 1월 연금저축740,000/IRP1 0, 2월 160,000/0, 3월 1,030,000/0, 4~6월 0/0(연간 누적 1,930,000원). 근거: 삼성증권 연금저축CMA(7074390889-15) 이체입금 내역(현금배당 건은 납입 아니므로 전부 제외), IRP1(다이렉트IRP 7131546334-29)은 상반기 납입 실적 없음. 기존 백필 스크립트와 동일한 GET→merge(riaExternalPurchase/IRP2 등 보존)→PUT→localStorage 동기화 패턴 재사용. **미실행**: 사용자가 로그인된 브라우저에서 직접 실행 필요. **2026-07-05 정정**: 3월 IRP1 57,000원(mPop입금 03-20)은 IRP1이 아닌 ISA 거래가 잘못 반영된 값으로 확인되어 0원으로 정정(연간 누적 1,987,000원 → 1,930,000원) | `pension-actual-contribution-backfill-console.js`(신규) | 2026-07-03 |
| CLAUDE-SEC7-REVIEW | CLAUDE.md 섹션 7(연금 납입 한도) 정정 검토 — `ps-config.js`(`pension.baseMonthly=1000000`, `voo.startYM=2027-01`)와 `ps-engine.js` VOO 분배 로직(라인 430-496)을 직접 추적해 "2026년은 IRP1 VOO 분배 미작동, 연금저축 기본 100만원/월만 활성" 가정이 코드와 일치함을 확인. 섹션 7 문구를 계획(시뮬레이션 파라미터)/실적(2026년 1~6월 실측) 구분 방식으로 교체, 실적 합계 오류(1,987,000→1,930,000, IRP1 3월 57,000은 ISA 오분류로 확인) 정정. CLAUDE.md 후반부에 실수로 두 번 중복 붙여넣기 되어 있던 "상추매매 기능 추가 작업 지시서"(이미 SANGCHU-V1로 구현 완료)를 `.claude/SANGCHU.md`로 분리 이관하고 CLAUDE.md에는 짧은 포인터만 남김 | `CLAUDE.md`, `.claude/SANGCHU.md`(신규), `PLAN.md` | 2026-07-05 |
| PS-WITHDRAWAL-BUGFIX | 연금 인출 시뮬레이션 버그픽스 4건 (전략 세션 아님, 순수 버그픽스) — ① 연금소득세율 2단계(60~69세/70세~) → 소득세법 기준 3단계(55~69세/70~79세/80세~)로 수정, `tax.rate6069/rate70` → `rate5569/rate7079/rate80` 개명 및 `_taxRate()` 3단계 분기 ② 사적연금(연금저축·IRP)이 건보 소득에 "1,200만 초과분" 산입되던 오류 수정 — 분리과세 유지 시 전액 제외가 정확(국민건강보험법 시행령 제41조, 산입 대상은 공적연금뿐) ③ 국민연금 연금소득공제 1,400만 초과분 공제율 20%→10% 오류 수정 ④ 피부양자 판정 "국민연금 수령액 0원" 조건 제거 — 국민연금 받아도 합산소득 2,000만 이하면 피부양자 유지 가능 ⑤ (①의 연쇄수정) IRP 연금 섹션 하드코딩된 `rate70` 제거, 상단에서 계산한 연령별 `rate` 재사용. 로컬(claude.ai)에서 사전 검증 완료된 수정을 GitHub main 미반영 상태에서 반영. 검증(node vm, `PensionWithdrawal.calc()`): 62세(피부양자,0원)/65세(5.5%,피부양자,0원)/68세(5.5%,지역가입자,247,608원)/72세(4.4%,지역가입자,407,745원)/82세(3.3%,지역가입자,718,414원) 5개 시점 모두 문서 기대값과 일치, 68/72/82세 모두 사적연금 미포함 확인 | `js/pension/ps-config.js`, `js/pension/ps-withdrawal.js` | 2026-07-03 |
| RIA-FUNDING-DOUBLECOUNT | `ps-engine.js` `_stepMonth()` RIA 유입 이벤트(2026-03, `PS_RIA_TAX_BENEFIT.saleAmount` 49,511,610원) 이중계산 버그 수정 — plan 트랙에서 RIA에 유입만 하고 해외주식 계좌에서 차감하지 않아 4,951만원이 이중으로 존재하던 문제(전략 세션 발견, 2026년 1~6월 "월별 계획 vs 실적" 표 차이가 -562만~-5,003만원대로 계속 마이너스였던 원인). `bal.해외주식 -= PS_RIA_TAX_BENEFIT.saleAmount` 한 줄 추가로 수정. git log로 의도적 설계(PR #83과 무관)가 아니라 단순 누락임을 확인. 검증(node vm, `PensionEngine.run()` 직접 호출): 수정 전 plan 재현값(1~3월 206,210,000/208,804,064/260,930,062)이 전략 세션 Python 재현치와 원 단위로 거의 일치 확인 후, 수정 적용 → 2026-03 차이(실적-계획) -50,027,901원→-516,291원(거의 0)으로 축소, 2026-06 차이 +29,276,210원으로 실적이 계획을 앞서는 방향으로 역전 | `js/pension/ps-engine.js` | 2026-07-05 |
| PS-ACCOUNT-SCOPE-COMMENT | "계획 총액/실적 총액/차이" 산출 기준(연금저축·IRP1·IRP2·해외주식·RIA·ISA 6개 계좌, eval[](평가금) 기준 합산이며 index.html 메인 대시보드 총 평가금액(8개 전체 계좌)과는 다른 범위임)을 코드 주석으로 명시 — `ps-firebase.js` `_buildActualData()` 위, `ps-engine.js` `_sum()` 위 | `js/pension/ps-firebase.js`, `js/pension/ps-engine.js` | 2026-07-05 |
| PS-ACCOUNT-SCOPE-UI-NOTE | PS-ACCOUNT-SCOPE-COMMENT는 코드 주석이라 화면에 안 보인다는 피드백 반영 — "월별 계획 vs 실적" 표(`pension-simulation.html`) 바로 위에 "포함 계좌: 연금저축·IRP1·IRP2·해외주식·RIA·ISA (평가금 기준, 전체 8개 계좌 중 6개)" 한 줄을 실제 UI로 노출. Playwright 스크린샷으로 렌더링 확인 완료 | `js/pension/ps-table.js`, `css/pension-sim.css` | 2026-07-05 |
| PS-DECUMULATION-INTEGRATION | 적립-인출 통합 시뮬레이션 — 85세 잔액 91억원 오류(퇴직 후에도 신규납입이 종료 없이 영원히 지속, 인출이 실제 잔액을 차감 안 함) 수정. Notion §9(2026-07-03 전략 세션 9개 결정) 기준 구현, **Phase1~5 완료 / Phase4(UI 입력 필드)는 별도 세션 예정으로 보류**. **Phase1**: `ps-config.js`에 `withdrawal`(startAge 61/monthlyTarget 305만)·`nationalPension.startAge`(65)·`irp2.withdrawalStartAge`(70)·`spouse`(1983-01/60세)·`isaConversion.maturityYM`(2029-03) 신규 파라미터 + `PS_BIRTH`/`psAgeToYM()` 공용 헬퍼 추가. **Phase2**: `ps-engine.js` `_stepMonth()`에 ①퇴직(2028-12) 이후 신규납입 정지 ②ISA→연금저축 "비과세원금" 버킷 1회성 이전(§9-3, `bal.연금저축_비과세원금` 신규 필드, `_sum()` 합산 반영) ③인출 차감(비과세원금 우선→과세분 연1,500만원 상한→IRP1→IRP2 순, §9-2/9-6) ④연금수령한도(§9-9, `_receiptLimit()`: 평가액÷(11-연차)×120%, 계좌별 독립 추적) 통합, `withdrawalLog` 배열 신규 노출. **Phase2 추가수정**: 해외주식→RIA 실물이관(2026-03-31 확정, `PS_RIA_TAX_BENEFIT.saleAmount` 49,511,610원 재사용) 유입 이벤트 누락 발견·추가 — RIA가 시뮬레이션 내내 0으로 남아 ISA→비과세원금 흐름이 위축되던 문제. forecast 트랙은 실적구간(`ym≤lastActualYM`)에서 `_stepMonth()`를 건너뛰므로 별도 catch-up 보정(`RIA===0 && fundingYM≤lastActualYM`일 때만 1회, 실측치 있으면 스킵해 이중계산 방지) 추가. **Phase3**: `ps-withdrawal.js` 하드코딩 타임라인 상수(`WD_TAX_FREE_START` 등) 전면 제거, `calc()`가 `psResult.plan/forecast.withdrawalLog` 그대로 읽어 표시(중복계산 금지)하도록 리팩토링, `_calcHI()` 피부양자 판정에 배우자 정년 조건(§9-8) 추가, `_taxRate()`/`_calcODrip()`는 PR #81 반영분 그대로 유지. **Phase5**: 잔액표시 수정(`ps-withdrawal-ui.js` `_buildBalanceCard()`가 연금저축 표시액에 `연금저축_비과세원금` 버킷 미합산이던 문제) + **버킷 성장 누락 버그 발견·수정**(`_stepMonth()` 1단계 수익률 복리 적용에 `bal.연금저축_비과세원금` 라인이 빠져 있어 ISA 이전 후 인출 시작 전까지 버킷이 전혀 성장하지 않던 버그, §9-3 "인출 시작 전까지 연금저축 수익률로 계속 성장" 설계와 불일치 — 수정 후 61세 시나리오 비과세원금 소진월 2038-01→2039-11로 정정, 85세 잔액 47.57억→49.45억원). 검증(node vm 전 단계): 61세 시나리오 85세 잔액 49.45억원(91억 대비 정상 범위), 55세/61세 소진월 자동이동(2033-06/2039-11) 및 과세분 부족분 표시 확인, IRP2는 §9-4 "연차 시작 2029년" 설계대로 §9-9 한도 전혀 안 걸림 확인, PR #81 세율 3단계·사적연금 건보 제외 회귀 없음 확인. 재무적 발견 2건(버그 아님, 파라미터 특성)은 위 "전략 세션 반영 필요" 항목 참조 | `js/pension/ps-config.js`, `js/pension/ps-engine.js`, `js/pension/ps-withdrawal.js`, `js/pension/ps-withdrawal-ui.js` | 2026-07-03 |
| PS-EXCESS-15M | 사적연금 1,500만원 초과 시나리오(종합과세/16.5% 분리과세) 구현 — Notion §13(2026-07-05, "전액 재분류" 문턱효과 확정) 기준. `ps-config.js`: `withdrawal.excessMode`('cap15m' 기본값/'separate16_5'/'comprehensive') · `withdrawal.irp2MonthlyTarget`(1,500,000, 기존 하드코딩 파라미터화) · `tax.rateSeparate165`(0.165) · 신규 `PS_COMPREHENSIVE_TAX_BRACKETS`(종합소득세 누진표, 2023년 개정 기준 6~45% 8단계) 추가. `ps-engine.js` §7-1: `excessMode==='cap15m'`일 때만 연 1,500만원 하드캡 적용, 그 외 모드는 하드캡 해제(§9-9 연금수령한도는 항상 유지). §7-2: `IRP_MONTHLY_TARGET` 파라미터화. 신규 `_markExcessYears()` — `run()` 메인루프 종료 후 plan/forecast `withdrawalLog`를 캘린더 연도별로 그룹화해 (연금저축 과세분+IRP1+IRP2) 연간 합계가 1,500만원 초과 시 그 해 전체 월에 `excessTriggeredYear`/`excessAnnualTotal` 소급 표시(순수 후처리, 잔액 무관 — "전액 재분류"는 연 전체 단위이므로 초과 시점 이후만이 아니라 연초부터 소급 필요). `ps-withdrawal.js`: `_pensionIncomeDeduction()` 헬퍼 추출(기존 `_calcHI()` 내부 연금소득공제 로직과 공용화) + 신규 `_comprehensiveIncomeTax()`(누진표+지방소득세10%). `calc()`에 `excessMode!=='cap15m' && wd.excessTriggeredYear`일 때 소스별 재과세 분기(separate16_5: 16.5% 일괄, comprehensive: 연금소득공제 후 누진세율 계산해 소스별 비례배분 표시) 추가, `_calcHI()`는 comprehensive+해당연도 초과 시에만 사적연금을 피부양자 소득기준에 포함하도록 호출부에서 조건부 전달(cap15m/separate16_5는 항상 0, §6 유지). 검증(node vm, `PensionEngine.run()`+`PensionWithdrawal.calc()`): ① cap15m 기본값 — 수정 전/후 `85세 총잔액` 값이 소수점까지 완전히 동일(3,859,914,181원, 회귀 없음), 62/65/68/72/82세 HI 값도 PR#81 기준값과 완전 일치 ② 1,499만원→82.4만원 / 1,501만원→247.7만원(문서 예시 82.5만/247.6만원과 근접, 월→연 환산 반올림 오차) ③ 130만원/월(연1,560만원) separate16_5 → 257.4만원(문서 기대값과 정확히 일치) ④ comprehensive 모드(연금저축1,560만+국민연금2,160만 결합) → 종합과세분 세액 3,329,700원(수기 계산과 원 단위 일치 확인) ⑤ separate16_5는 피부양자 판정에서 사적연금 계속 제외, comprehensive는 포함되어 지역가입자 전환 확인. ps-withdrawal-ui.js 등 호출부 시그니처 변경 없어 UI 입력 필드는 이번 범위 밖(지시서 대로 미착수), 손익분기 bisection 스크립트 확장(선택 항목)도 미착수 | `js/pension/ps-config.js`, `js/pension/ps-engine.js`, `js/pension/ps-withdrawal.js` | 2026-07-05 |
| PS-EXCESS-15M-UI | PS-EXCESS-15M 후속 — 브라우저 콘솔 없이 설정 패널에서 직접 조작 가능하도록 UI 컨트롤 추가. `ps-settings.js` 설정 패널에 신규 카드 "사적연금 인출 설정" 추가: 인출 시작 나이(`withdrawal.startAge`)·목표 월 인출액(`withdrawal.monthlyTarget`)·IRP 목표 월 인출액(`withdrawal.irp2MonthlyTarget`) 숫자 입력 + 1,500만원 초과 처리방식(`withdrawal.excessMode`) 드롭다운(cap15m 기본값/separate16_5/comprehensive, cap15m 선택 시 기존 동작과 완전히 동일) 신규 추가. 드롭다운용 `_selectInput()`/`_bindSelect()` 헬퍼 신규(`_numInput`/`_bindNum` 패턴과 동일 스타일). `css/pension-sim.css`에 `.ps-select`(min-width 220px, 좌측정렬) 추가 — 기존 `.ps-input`(90px 우측정렬)로는 드롭다운 라벨이 잘려서 별도 클래스 필요. `pension-simulation.html`은 변경 없음(설정 패널이 빈 `<section id="pension-settings">`에 JS로 동적 렌더되는 구조). 검증: Playwright로 실제 페이지 구동해 카드 렌더링·초기값(cap15m) 확인 후 드롭다운을 separate16_5로 전환 → 연금저축 과세분 인출액이 125만원(하드캡)→305만원(목표금액 그대로)으로, 세금이 5.5%→16.5%로, IRP1도 동일 방식으로 즉시 재계산되고 "⚠️ 문턱효과" 경고가 뜨는 것을 화면에서 직접 확인, 콘솔 에러 없음. 별개 발견(미수정): `ps-settings.js` "세율 & 건강보험료" 카드가 2026-07-03 PS-WITHDRAWAL-BUGFIX 때 이름이 바뀐 `tax.rate6069`/`tax.rate70`을 아직도 참조 중 — 실제 파라미터는 `rate5569`/`rate7079`/`rate80`이라 해당 두 입력칸이 깨진 값(undefined)을 표시할 가능성 있음(이번 작업 범위 밖이라 미수정, 별도 확인 필요) | `js/pension/ps-settings.js`, `css/pension-sim.css` | 2026-07-05 |
| P5-2-IRP-UNLOCK | IRP1/IRP2 연금수령연차 11년차(65세) 이후 인출목표 확장 — Notion P5-2(77세 잔액 확인 중 발견: IRP2 잔액 충분한데도 계속 150만원/월 고정 인출, 연금저축 1,500만 캡 부족분을 IRP가 메우지 못하는 문제). `ps-config.js`: `withdrawal.irpUnlockYear`(11, §9-9와 동일 기준) 신규 파라미터. `ps-engine.js` §7-2: IRP1/IRP2는 연금수령연차 기산일이 서로 달라(IRP1=국민연금 개시 2039년 기준, IRP2=퇴직 이듬해 2029년 기준 → 11년차 도달 시점이 각각 2049년/2039년으로 다름) **계좌별 독립 판단**으로 구현(전략 세션에 사전 확인 후 결정) — 각 계좌 자체 연차가 `irpUnlockYear`를 넘으면 고정목표(150만원) 대신 `pensionGap`(연금저축 인출 후 남은 생활비 부족분) 적용, IRP2는 IRP1 기여분을 뺀 나머지만 추가 부담. §9-9 `room9_9`·IRP1 우선순위는 변경 없음. 검증(node vm, 수정 전/후 직접 비교): 66~69세(IRP2가 70세 이전이라 애초에 인출 자체가 막혀있어 무관) 완전 동일 회귀 없음 확인 / 70~74세부터 IRP2가 0원→30만원(연금저축 부족분 180만원 중 IRP1 150만+IRP2 30만로 정확히 충당) / 75세 이후 IRP1 잔액소진 시 IRP2가 150만원 고정 캡→180만원(부족분 전액)으로 실제 문제 해소 확인 / 85세 장기 총잔액 38.60억→37.49억원(-1억 1,108만원, -2.9%, IRP2 조기소진 가속에 따른 의도된 변화) / excessMode 3종(cap15m/separate16_5/comprehensive) 전 구간(99세까지) 잔액 음수·NaN 없음 확인 | `js/pension/ps-config.js`, `js/pension/ps-engine.js` | 2026-07-05 |
| WD-AGE-RANGE-100 | 인출 시뮬레이션 나이 범위 UI 슬라이더 확장 85세→100세 — 엔진(`ps-engine.js`)은 이미 `PS_END_YM='2074-12'`까지 계산해 100세(1974년생 기준) 데이터를 전부 보유 중이었고, `wd-age-slider`의 `max="85"` 하드코딩이 유일한 제약이었음. `psAgeToYM(100)`='2074-02'가 `PS_END_YM`(2074-12) 이내로 10개월 여유 확인되어 `PS_END_YM`은 변경 불필요. `ps-withdrawal.js` `calc()` JSDoc 주석 `55~85`→`55~100` 표기 정정(로직은 나이 범위를 강제하지 않아 기능 변경 없음), `ps-withdrawal-ui.js`는 나이 상한을 하드코딩하지 않아 수정 대상 없음. 55~85세 구간 계산·표시는 영향 없음(회귀 없음) | `pension-simulation.html`, `js/pension/ps-withdrawal.js` | 2026-07-05 |
| IRP2-STARTAGE-UI | IRP2 실제수령개시 나이(`irp2.withdrawalStartAge`, 기존 §9-4 하드코딩값 70) UI 파라미터 노출 — 2026-07-08 전략 세션에서 IRP1이 국민연금 개시(65세) 직후 연금수령한도에 자주 걸리는 문제를 실측값으로 분석 중, 65세로 낮추면 65~69세 구간 IRP 결합인출이 늘지만 85세 총자산이 감소하는 트레이드오프가 확인되어 하드코딩값을 바꾸지 않고 사용자가 직접 값을 바꿔가며 비교할 수 있도록 "사적연금 인출 설정" 카드에 입력 필드 1개만 추가(`render()`/`bind()`/`syncFromState()` 3곳, 기존 `_numInput`/`_bindNum`/`_setVal` 패턴 재사용). `ps-config.js`/`ps-engine.js` 변경 없음(로직·기본값 불변). 검증: 로드 시 기본값 70 표시 확인, 65로 변경 시 `PensionState.getParams().irp2.withdrawalStartAge`가 즉시 65로 반영되고 재계산 트리거 확인, 70으로 되돌리면 완전히 동일한 상태로 복귀(회귀 없음). Playwright로 실행 확인, 콘솔 에러 없음(엔진이 이미 `ps-engine.js:526`에서 이 파라미터를 사용 중임을 확인) | `js/pension/ps-settings.js` | 2026-07-08 (PR #92 main 병합완료) |
| WD-SETTINGS-LAYOUT | "사적연금 인출 설정" 카드를 인출 시뮬레이터(`#pension-withdrawal`) 왼쪽으로 이동 — 기존 상단 `.ps-layout`/`.ps-sidebar`(카드4)에 있던 카드를 사용자가 인출 결과와 함께 바로 확인할 수 있도록 재배치. `pension-simulation.html`: `#pension-withdrawal` 내부에 `.ps-wd-layout`(그리드, 320px+1fr) → `.ps-wd-sidebar`(빈 `#pension-wd-settings` 컨테이너) + `.ps-wd-main`(기존 나이 슬라이더+`#wd-result`) 구조 추가. `css/pension-sim.css`: `.ps-wd-layout`/`.ps-wd-sidebar` 규칙 추가(`.ps-layout`/`.ps-sidebar`와 동일 패턴, 900px 이하 1열, 480px 이하 sticky 해제). `js/pension/ps-settings.js`: 카드4 블록을 `_renderWithdrawalCard(p)` 함수로 추출, 상단 `ps-settings-wrap`에서 제거하고 `render()` 끝에서 `#pension-wd-settings`에 별도 렌더(`bind()`/`syncFromState()`는 전부 `getElementById` 기반이라 무수정). Playwright로 검증: 상단 사이드바 카드4 중복 없음 확인, 카드가 시뮬레이터 왼쪽에 정상 렌더, 인출 시작 나이 입력값 변경 시 `#wd-result` 즉시 재계산 확인, 900px/480px 반응형(1열 스택/sticky 해제) 스크린샷 확인, 상단 다른 설정 카드(수익률/VOO/ISA/고급설정) 회귀 없음 | `pension-simulation.html`, `css/pension-sim.css`, `js/pension/ps-settings.js` | 2026-07-08 (PR #94 main 병합완료) |
| WD-SHORTFALL-FALSEPOS | "목표 생활비 대비 부족" 경고 오탐(false positive) 수정 — 72세/목표 400만원 시나리오에서 연금저축 잔액 소진(`wd.taxed=0`) 시 `taxedShortfall=400만원`(연금저축 단독 계산, §7-2 IRP 갭필링 반영 안 됨)으로 잘못된 부족 경고가 뜨던 문제. `ps-engine.js` `_stepMonth()`에 §7-4 `withdrawal.overallShortfall`(연금저축+IRP1+IRP2 전체 소득원 기준 실제 부족분) 신규 추가(`taxedShortfall`은 디버깅용으로 유지). `ps-withdrawal.js` `calc()` 경고 조건을 `taxedShortfall`→`overallShortfall`로 교체, 하드코딩 문구 "(과세분 연 1,500만원 한도 초과)" 대신 동적 사유 목록(cap15m 한도/계좌잔액소진/§9-9 한도도달 등) 생성. 검증(Playwright, 실제 페이지 구동): ① 72세·400만원·separate16_5(연금저축0+IRP1150만+IRP2250만=400만 정확히 충족) → 경고 사라짐(오탐 해소) ② 66세·2,000만원·cap15m(연금저축 캡 125만+IRP1150만으로 부족) → "1725만원 부족...(연금저축 과세분 연 1,500만원 한도)" 정상 표시(회귀 없음) ③ 100세·2,000만원·cap15m(IRP1·IRP2 잔액 소진) → 사유에 "IRP1 잔액 소진, IRP2 잔액 소진" 정확히 표시 ④ 68세·300만원·cap15m(125만+150만=275만, 25만원 근소 부족) → 정확히 "25만원 부족" 표시, §13 문턱효과 등 다른 경고 문구·조건 변경 없음(회귀 없음) 확인 | `js/pension/ps-engine.js`, `js/pension/ps-withdrawal.js` | 2026-07-08 (PR #96 main 병합완료) |
| CHART-ISA-TRANSFER | "계좌별 누적" 스택 차트에서 ISA 만기(2029-03) 시 연금저축_비과세원금으로 이전된 금액이 표시되지 않던 버그 수정 — `ps-engine.js`의 `_stepMonth()`(§9-3)는 ISA 만기 시 `연금저축_비과세원금 += ISA; ISA = 0`을 정상 처리해 `result.total`(전체 연금자산 선그래프 등)에는 원래부터 정확히 반영되어 있었으나, `ps-chart.js`의 `renderStackedArea()` `acctOrder` 배열과 `ACCT_COLOR`에 `연금저축_비과세원금` 키가 누락되어 해당 시리즈가 스택 차트에서만 그려지지 않아 ISA 잔액이 사라진 것처럼 보이던 표시 전용 버그. `ACCT_COLOR`에 `연금저축_비과세원금: '#5CC9A0'` 추가, 범례/툴팁용 `ACCT_LABEL={연금저축_비과세원금:'연금저축(비과세)'}` 신설, `acctOrder`에 `연금저축` 바로 뒤 삽입, dataset `label`을 `ACCT_LABEL[acct] \|\| acct`로 변경. 계산 로직(`ps-engine.js`/`ps-withdrawal.js`) 및 Firebase 데이터 구조 변경 없음(순수 렌더링 레이어) | `js/pension/ps-chart.js` | 2026-07-08 (PR #98 main 병합완료) |

---

## 5. 남은 작업 목록

### pension-simulation 모듈 (진행 중)

| Phase | 작업 | 파일 | 상태 |
|-------|------|------|------|
| Phase0 | 영향도 분석 & INTERFACE.md 생성 | `.claude/INTERFACE.md` | ✅ 완료 |
| Phase1 | ps-config.js & ps-engine.js 생성 | `js/pension/` | ✅ 완료 |
| Phase2 | ps-firebase.js (Firebase 연동) | `js/pension/` | ✅ 완료 |
| Phase3 | ps-state.js & ps-init.js | `js/pension/` | ✅ 완료 |
| Phase4 | ps-chart.js (차트 렌더링) | `js/pension/` | ✅ 완료 |
| Phase5 | ps-settings.js (설정 패널 UI) | `js/pension/` | ✅ 완료 |
| Phase6 | pension-simulation.html & pension-sim.css | 루트, `css/` | ✅ 완료 |
| Phase7 | ps-table.js (월별 테이블) | `js/pension/` | ✅ 완료 (2026-07-02) |
| Phase8 | 연금 인출 시뮬레이터 (ps-withdrawal.js + UI) | `js/pension/` | ✅ 완료 (2026-06-29) |

### PS-DECUMULATION-INTEGRATION — 남은 작업 (별도 세션 예정)

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| PS-DECUM-Phase4 | 인출시작 나이 최소값(55) validation, 목표 월 인출액(`withdrawal.monthlyTarget`)·국민연금 개시나이 사용자 입력 필드 추가 | `js/pension/ps-withdrawal-ui.js` | Phase1~5(Phase4 제외)는 2026-07-03 완료. IRP2 수령개시나이는 IRP2-STARTAGE-UI(2026-07-08)로 `ps-settings.js`에 완료됨. 우선순위 낮음(작업지시서 원문 기준) |

### Phase 2 — 중복 제거 (별도 세션 예정)

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| P2-2 | `renderAll()` 분리 | `render.js` | 카드 렌더 / 집계 / 차트 분리 |
| P2-4 | localStorage 접근 단일 진입점 | `storage.js` (신규) | modal·export·init 산재 |

---

## 6. 브랜치 / 머지 현황

| 브랜치 | 상태 | 비고 |
|--------|------|------|
| `claude/auto-sync-pension-data-iqIFx` | ✅ 머지 완료 (2026-03-19) | PR #12 |
| `claude/fix-transaction-sync-m8PrB` | ✅ 머지 완료 | IRP1 인식 + ISA 동기화 버그픽스 |
| `claude/fix-firebase-data-reset-0VePA` | ✅ 머지 완료 | Firebase PUT→PATCH 버그픽스 |
| `claude/add-kiwoom-ria-support-Rhc1C` | ✅ 머지 완료 (PR #28, 2026-03-24) | kiwoom-ria 스냅샷 지원 및 차트/합계 반영 |
| `claude/fix-investment-data-discrepancy-aQFgn` | ✅ 머지 완료 (2026-04-01) | P1: tossHistory 월 전환 소실 버그 3건 수정 |

---

## 7. 기술 메모

### 저장 흐름

```
모달 적용
  → state['isa'] = { val, date }  또는  state['ria'] = { val, date }
  → save()  ←→  localStorage.setItem('asset-dashboard-v3', ...)
                 scheduleGasSync_()  →  setTimeout(pushToGAS_, 2000)
  → renderAll()
       → renderPensionSnap()  ← ISA/RIA ALWAYS_KEYS로 항상 렌더
       → renderKiwoomSnap()   ← RIA 항상 렌더 (조건 제거)
       → renderKiwoom()       ← ISA/RIA extraCards로 항상 렌더
```

### kiwoom-snap-grid vs pension-snap-grid 차이

| 항목 | kiwoom-snap-grid | pension-snap-grid |
|------|-----------------|-------------------|
| 데이터 입력 | 키움 JSON 붙여넣기 | 토스 연금 JSON 붙여넣기 |
| 저장 위치 | `state[kiwoom-*]` | `state[pension-*]` |
| RIA 위치 | ✅ 항상 표시 (수동 입력) | ✅ 항상 표시 |
| ISA 위치 | ❌ 해당 없음 | ✅ 항상 표시 |

### OBil ≠ RIA

- `kiwoom-obil` (OBil): 키움 연습성 계좌, 연금 무관, kiwoom-snap-grid에 포함됨
- `ria` (RIA): 별도 신규 계좌 (2026-03-30 개설 예정), 수동 입력, OBil과 완전 분리

---

## 8. Pension-tracer 연동 관계

- MyAssetDashBD: `state.*`, `kiwoom.*`, `pensionSimulation/contributions` 를 **읽기+쓰기**
- Pension-tracer: Excel v2_5 스냅샷 기반 `pension_tracker.html`은 구버전으로 폐기 대상. 정적 PLAN_DATA/VOO 월 75만 하드코딩/구 ISA·RIA 이체금액 때문에 `pension-simulation.html`로 통합한다.
- 기존 `pension-tracker/*` 경로는 과거 앱 호환용으로만 보존하고, 신규 월별 계획 vs 실적 입력은 MyAssetDashBD `pensionSimulation/contributions`를 기준으로 한다.
- 처리 방침: Pension-tracer 레포는 배포 중단 안내 또는 완전 아카이브를 별도 작업으로 진행한다.
