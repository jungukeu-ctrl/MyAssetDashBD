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

| 계좌 | Firebase 키 | 단위 | 섹션 | 비고 |
|------|------------|------|------|------|
| 개인연금저축 | `pension-saving` | 원 | pension-snap | toss-pension과 합산 표시 |
| 퇴직연금 IRP 1 | `pension-irp1` | 원 | pension-snap | kiwoom eval[7] 연동 |
| 퇴직연금 IRP 2 | `pension-irp2` | 원 | pension-snap | kiwoom eval[8] 연동 |
| **ISA(삼성증권)** | `isa` | 원 | pension-snap + 수동 카드 | ✅ 모달·카드 구현 완료 |
| **RIA(키움)** | `ria` | 원 | kiwoom-snap + pension-snap + 수동 카드 | ✅ 모달·카드 구현 완료 |
| 해외주식(키움) | `kiwoom-overseas` | 원 | kiwoom-snap | |
| OBil(오빌) | `kiwoom-obil` | 원 | kiwoom-snap | 연금 무관 계좌 |

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
| A | `kiwoom-snap-grid`에 RIA 카드 항상 표시 | `render.js` | 2026-03-19 |
| B/C | `kiwoom-cards`에 ISA·RIA 잔액 전용 카드 항상 표시 | `render.js` | 2026-03-19 |
| D/E | `pension-snap-grid`에 ISA·RIA 항상 표시 (ALWAYS_KEYS 분리) | `render.js` | 2026-03-19 |
| F/G | 연금 섹션 수동 카드 그리드에 ISA·RIA 카드 추가 | `index.html` | 2026-03-19 |

---

## 5. 남은 작업 목록

> **현재 남은 작업 없음** — Phase 1 + 버그픽스 완료.

---

## 6. 브랜치 / 머지 현황

| 브랜치 | 상태 | 비고 |
|--------|------|------|
| `claude/auto-sync-pension-data-iqIFx` | ✅ 머지 완료 (2026-03-19) | PR #12 |
| `claude/fix-transaction-sync-m8PrB` | ✅ GitHub push 완료 (2026-03-20) | IRP1 인식 + ISA 동기화 버그픽스 |
| `main` ← `claude/fix-transaction-sync-m8PrB` | ⏳ PR 머지 대기 | GitHub 웹에서 머지 필요 |

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
