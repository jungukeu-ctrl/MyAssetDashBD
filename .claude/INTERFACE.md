# INTERFACE.md — pension 모듈 영향도 분석
> Phase0 산출물. 이후 모든 Phase는 이 파일만 참조 (기존 파일 전체 재열람 금지)
> 생성일: 2026-04-07

---

## 1. 전역 변수/함수 목록 (window.* 에 노출)

### 데이터 변수 (전역)

| 이름 | 타입 | 소스 파일 | 설명 |
|------|------|----------|------|
| `state` | object | config.js | 자산 상태 `{key: {val, memo, date, ...}}` |
| `kiData` | object | config.js | 키움 데이터 `{combined:[], tossHistory:{}}` |
| `goal` | object | config.js | 목표 설정 `{name, target, finName, finTarget}` |
| `todos` | array | config.js | 할일 목록 |
| `chartRange` | number | config.js | 라인 차트 범위 (12/24/0) |
| `FIREBASE_URL` | string | config.js | Firebase DB URL |
| `FIREBASE_API_KEY` | string | config.js | Firebase 인증 키 |
| `AI_IDX` | object | config.js | 계좌↔배열인덱스 매핑 (0~10) |
| `AI_NAMES` | array | config.js | 11개 계좌 표시명 배열 |
| `MAIN_ACCOUNTS` | array | config.js | 주요 8계좌 표시명 |
| `ACCT_COLORS` | object | config.js | 계좌별 색상 맵 |
| `MANUAL_KEYS` | array | config.js | 수동입력 자산 키 배열 |
| `TOSS_KEYS` | array | config.js | 토스 계좌 키 배열 |
| `PENSION_SNAP_KEYS` | array | config.js | 연금 스냅샷 키 배열 |
| `KIWOOM_SNAP_KEYS` | array | config.js | 키움 스냅샷 키 배열 |

### 유틸 함수 (전역, pension 모듈 재사용 가능)

| 함수 | 소스 | 설명 |
|------|------|------|
| `fmt(n)` | config.js | 숫자 → toLocaleString |
| `fmtWon(n)` | config.js | 숫자 → 원/만/억 자동 변환 |
| `fmtPct(v)` | config.js | 숫자 → +X.X% 형식 |

### 함수 (전역, pension 모듈에서 호출 금지)

| 함수 | 소스 | 비고 |
|------|------|------|
| `init()` | init.js | 앱 초기화 진입점 |
| `save()` | init.js | localStorage 저장 + Firebase 동기화 트리거 |
| `renderAll()` | render.js | 수동 카드 전체 렌더 |
| `renderKiwoom()` | render.js | 키움 카드+차트 렌더 |
| `updateGoal()` | render.js | 목표 진행률 업데이트 |
| `setChartRange(months)` | render.js | 12/24/0 |
| `initCharts()` | render.js | Chart.js 4개 인스턴스 초기화 |
| `checkAndInitAuth_(cb)` | firebase.js | Firebase 인증 후 콜백 |
| `manualSync()` | firebase.js | 수동 동기화 |
| `openEdit(key)` | init.js | 카드 편집 오버레이 |

### Chart.js 전역 인스턴스 (충돌 위험)

| 변수명 | 용도 |
|--------|------|
| `donutChart` | 자산 구성 도넛 차트 |
| `barChart` | 월별 투자금/평가금 막대 |
| `lineChart` | 시계열 평가금+투자금 |
| `returnChart` | 계좌별 수익률 라인 |

> ⚠️ pension 모듈은 별도 변수명 사용 (`psLineChart`, `psStackChart`, `psDiffChart`)

---

## 2. Firebase 실제 데이터 스키마

### Firebase URL
```
https://my-asset-dashboard-9e6f9-default-rtdb.asia-southeast1.firebasedatabase.app
```

### 읽기/쓰기
- **읽기**: `GET /asset-data.json?auth={idToken}`
- **쓰기**: `PATCH /asset-data.json?auth={idToken}`

### /asset-data 전체 구조
```
asset-data/
  version: 1
  exportedAt: "ISO timestamp"
  state/
    pension-saving:  { val: number(원), date: "YYYY-MM-DD" }
    pension-irp1:    { val: number(원), date: "YYYY-MM-DD" }
    pension-irp2:    { val: number(원), date: "YYYY-MM-DD" }
    isa:             { val: number(원), date: "YYYY-MM-DD", investVal: number }
    kiwoom-ria:      { val: number(원), date: "YYYY-MM-DD", investVal: number, riaStartYm: "YYYY-MM" }
    kiwoom-overseas: { val: number(원), date: "YYYY-MM-DD" }
    toss-pension:    { val: number(원), date: "YYYY-MM-DD" }
    toss-overseas:   { val: number(원), date: "YYYY-MM-DD" }
    irp1:            { val: number(만원) }
    irp2:            { val: number(만원) }
    ...
  kiwoom/
    combined: [
      {
        month:   "YYYY-MM",
        date:    "YYYY-MM-DD",
        eval:    [number × 11],   // AI_IDX 순서
        invest:  [number × 11]    // AI_IDX 순서
      }
    ]
    tossHistory: {
      "toss-overseas": { "YYYY-MM": number, ... },
      "toss-obil":     { "YYYY-MM": number, ... },
      "toss-pension":  { "YYYY-MM": number, ... },
      "toss-practice": { "YYYY-MM": number, ... }
    }
  todos: [...]
  goal: { name, target, finName, finTarget }
  pension-tracker/   ← Pension-tracer 앱 전용 (읽기 전용)
```

### kiData 로컬 구조 (localStorage: `kiwoom-data`)
```javascript
{
  combined: [
    {
      date:    "YYYY-MM-DD",
      month:   "YYYY-MM",
      eval:    [e0, e1, e2, e3, e4, e5, e6, e7, e8, e9, e10],  // 11개
      invest:  [i0, i1, i2, i3, i4, i5, i6, i7, i8, i9, i10],  // 11개
      _hasToss: boolean
    },
    ...  // 월별 오름차순
  ],
  tossHistory: {
    "toss-overseas": { "2024-01": 500000, ... },
    "toss-obil":     { ... },
    "toss-pension":  { ... },
    "toss-practice": { ... }
  }
}
```

---

## 3. 계좌 인덱스 매핑 (AI_IDX)

> ⚠️ **AI_IDX 키는 한국어 문자열** — pension 모듈에서 직접 접근 금지.
> pension 모듈은 반드시 **`PS_EVAL_IDX`** (ps-config.js) 를 통해 인덱스 참조.

```javascript
// config.js 실제 정의
const AI_IDX = {
  '해외':0, '오빌':1, '자사주':2, '개인연금저축':3, '별동대':4,
  '연습':5, '초빌':6, '퇴직연금001':7, '퇴직연금002':8, 'ISA':9, 'RIA':10
};
```

| idx | AI_IDX 실제 키 | AI_NAMES | Firebase 키 | PS_EVAL_IDX 키 |
|-----|--------------|----------|------------|---------------|
| 0 | `'해외'` | 해외 | `kiwoom-overseas` | `해외주식` |
| 1 | `'오빌'` | 오빌 | `kiwoom-obil` | — |
| 2 | `'자사주'` | 자사주 | — | — |
| 3 | `'개인연금저축'` | 개인연금저축 ✅ | `pension-saving` | `연금저축` |
| 4 | `'별동대'` | 별동대 | — | — |
| 5 | `'연습'` | 연습 | — | — |
| 6 | `'초빌'` | 초빌 | — | — |
| 7 | `'퇴직연금001'` | IRP 1 ✅ | `pension-irp1` | `IRP1` |
| 8 | `'퇴직연금002'` | IRP 2 ✅ | `pension-irp2` | `IRP2` |
| 9 | `'ISA'` | ISA ✅ | `isa` | `ISA` |
| 10 | `'RIA'` | RIA ✅ | `kiwoom-ria` | `RIA` (VOO 동일) |

---

## 4. 기존 CSS 클래스명 목록 (pension 모듈 충돌 금지)

### style.css 사용 중인 클래스 패턴

```
.page, .header, .hero, .hero-grid, .hero-amount
.goal-card, .goal-bar, .goal-fill
.asset-card, .asset-label, .asset-amount
.kiwoom-card, .kiwoom-summary, .kiwoom-summary-bar
.chart-card, .chart-title
.tab-row, .tab-btn, .tab-btn.active
.grid-2, .grid-3, .grid-4
.edit-overlay, .edit-overlay.open
.badge-*, .toss-badge, .kiwoom-badge
.modal, .modal-overlay, .modal-content
.spinner
.memo-card, .todo-list, .todo-item
.ai-modal
.bar-month-slider
.section-header, .section-title
```

> ⚠️ pension 모듈은 반드시 `ps-` 접두어 사용 (예: `.ps-card`, `.ps-chart-card`)
> ⚠️ ID는 `pension-` 접두어 사용 (예: `#pension-settings`, `#pension-charts`)

### CSS 변수 (pension-sim.css에서 재사용 가능)

| 변수 | 값 | 용도 |
|------|-----|------|
| `--bg` | `#0a0b12` | 메인 배경 |
| `--bg2` | `#12141f` | 카드 배경 |
| `--bg3` | `#1a1d2c` | 입력칸 배경 |
| `--border` | `#262a3e` | 기본 테두리 |
| `--border2` | `#2e3350` | 호버 테두리 |
| `--gold` | `#c9a84c` | 주 강조색 |
| `--gold2` | `#e8c97a` | 밝은 골드 |
| `--gold-dim` | `rgba(201,168,76,0.12)` | 반투명 골드 배경 |
| `--text` | `#eceef5` | 주 텍스트 |
| `--text2` | `#adb2cc` | 2차 텍스트 |
| `--text3` | `#7880a0` | 연한 텍스트 |
| `--green` | `#4ecdc4` | 금융자산 / 수익 |
| `--red` | `#ff6b6b` | 손실 |
| `--blue` | `#6e8efb` | 부동산 |
| `--purple` | `#b089f0` | 연금 |
| `--orange` | `#ffb347` | 경고 |
| `--teal` | `#36d399` | 토스 |
| `--card-shadow` | `0 4px 32px rgba(0,0,0,0.4)` | 카드 그림자 |

---

## 5. pension 모듈과의 잠재적 충돌 위험 항목

| 위험 수준 | 항목 | 내용 | 대책 |
|----------|------|------|------|
| 🔴 높음 | Chart.js 전역 인스턴스 | `donutChart`, `barChart`, `lineChart`, `returnChart` 이미 사용 중 | ps-chart.js에서 `psLineChart`, `psStackChart`, `psDiffChart` 사용 |
| 🔴 높음 | `state`, `kiData` 전역 변수 | 기존 데이터 동일 이름 | pension 모듈은 **읽기 전용**, 절대 재할당 금지 |
| 🟡 중간 | CSS `.card`, `.grid-*`, `.modal` | style.css 이미 정의 | `ps-` 접두어 엄격 준수 |
| 🟡 중간 | `chartRange` 전역 변수 | 기존 라인차트 제어 변수 | pension 모듈 자체 변수 `psYears` 사용 |
| 🟡 중간 | localStorage `kiwoom-data` | 기존 데이터 저장 키 | 읽기 전용, 절대 쓰기 금지 |
| 🟢 낮음 | Firebase PATCH | 기존 코드와 동일 경로 | pension 모듈은 읽기(`GET`)만 수행 |
| 🟢 낮음 | `fmt`, `fmtWon` 이름 충돌 | 전역 함수 이미 존재 | 재선언 금지, 그대로 재사용 |

---

## 6. pension 모듈이 재사용할 수 있는 유틸 함수/상수

| 재사용 항목 | 위치 | pension 모듈 사용법 |
|------------|------|-------------------|
| `FIREBASE_URL` | config.js | Firebase GET 요청 URL |
| `fmt(n)`, `fmtWon(n)`, `fmtPct(v)` | config.js | 숫자 포맷 |
| `AI_IDX` | config.js | eval/invest 인덱스 참조 (idx 3,7,8,9,10) |
| `kiData.combined` | 전역 | 최신 계좌 잔액 추출용 |
| `state['pension-saving']` 등 | 전역 | 초기 잔액 읽기 |
| Firebase 인증 토큰 | localStorage `fb_id_token` | GET 요청에 재사용 |

---

## 7. pension 모듈 초기 잔액 추출 방법

```javascript
// kiData.combined 최신 항목에서 eval 값 추출
const latest = kiData.combined[kiData.combined.length - 1];

const initialBalances = {
  연금저축: latest?.eval[AI_IDX.pension]  ?? 0,   // eval[3]
  IRP1:     latest?.eval[AI_IDX.irp1]     ?? 0,   // eval[7]
  IRP2:     latest?.eval[AI_IDX.irp2]     ?? 0,   // eval[8]
  ISA:      latest?.eval[AI_IDX.isa]      ?? 0,   // eval[9]
  RIA:      latest?.eval[AI_IDX.ria]      ?? 0,   // eval[10]
  해외주식: latest?.eval[AI_IDX.overseas] ?? 0,   // eval[0]
  VOO:      state['kiwoom-ria']?.val       ?? 0    // RIA = VOO 계좌
};
```

> ⚠️ `AI_IDX` 실제 키 이름은 config.js 에서 확인 필요 (overseas, pension, irp1, irp2, isa, ria)

---

## 8. localStorage 키 목록 (전체)

| 키 | 내용 | 소유 |
|----|------|------|
| `asset-dashboard-v3` | state (자산 현황) | 기존 앱 |
| `asset-dashboard-ts` | 마지막 동기화 타임스탬프 | 기존 앱 |
| `kiwoom-data` | kiData (combined + tossHistory) | 기존 앱 |
| `asset-todos` | 할일 목록 | 기존 앱 |
| `asset-goal` | 목표 설정 | 기존 앱 |
| `fb_id_token` | Firebase ID 토큰 | firebase.js |
| `fb_refresh_token` | Firebase Refresh 토큰 | firebase.js |
| `fb_token_expiry` | 토큰 만료 시간 (ms) | firebase.js |

> ⚠️ pension 모듈은 위 키 **쓰기 금지**. 읽기는 `fb_id_token` 만 허용.
