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
  pension-tracker/   ← Pension-tracer 앱 전용 섹션 (MyAssetDashBD 읽기 전용)
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

---

## 5. 남은 작업 목록

> **현재 남은 작업 없음** — Phase 1 + 버그픽스 + 개인연금저축 카드 통합 + ISA/RIA 차트 추가 + Firebase PUT→PATCH 버그픽스 + RIA eval[10] 연동 완료.

---

## 6. 브랜치 / 머지 현황

| 브랜치 | 상태 | 비고 |
|--------|------|------|
| `claude/auto-sync-pension-data-iqIFx` | ✅ 머지 완료 (2026-03-19) | PR #12 |
| `claude/fix-transaction-sync-m8PrB` | ✅ 머지 완료 | IRP1 인식 + ISA 동기화 버그픽스 |
| `claude/fix-firebase-data-reset-0VePA` | ✅ 머지 완료 | Firebase PUT→PATCH 버그픽스 |
| `claude/add-kiwoom-ria-support-Rhc1C` | ✅ 머지 완료 (PR #28, 2026-03-24) | kiwoom-ria 스냅샷 지원 및 차트/합계 반영 |

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

- MyAssetDashBD: `state.*` 와 `kiwoom.*` 을 **읽기+쓰기**
- Pension-tracer: `state.*` 와 `kiwoom.*` 을 **읽기 전용**,
  `pension-tracker/*` 경로를 **PATCH 방식으로 쓰기**
- ISA/RIA 잔액은 MyAssetDashBD에서 입력 → Pension-tracer가 읽어감
