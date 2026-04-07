# 연금 시뮬레이션 — Claude Code 작업 지침서
> 위치: `.claude/PENSION_SIM.md`
> CLAUDE.md 에는 포인터만 유지. 이 파일은 Phase 작업 시작 시에만 열람.

---

## 프로젝트 개요

기존 `MyAssetDashBD` 프로젝트에 연금 시뮬레이션 페이지를 추가한다.
- 진입점: `pension-simulation.html`
- 전용 모듈: `js/pension/` 디렉토리
- 기존 파일은 **읽기 전용** — 절대 수정하지 않는다

---

## 파일 구조

```
MyAssetDashBD/
├── pension-simulation.html        ← 신규 진입점
├── INTERFACE.md                   ← Phase0 산출물 (자동 생성)
├── js/
│   ├── config.js                  ← 기존 (읽기 전용)
│   ├── firebase.js                ← 기존 (읽기 전용)
│   ├── render.js                  ← 기존 (읽기 전용)
│   ├── modal.js                   ← 기존 (읽기 전용)
│   ├── export.js                  ← 기존 (읽기 전용)
│   ├── todo.js                    ← 기존 (읽기 전용)
│   ├── init.js                    ← 기존 (읽기 전용)
│   └── pension/
│       ├── ps-config.js           ← 상수 & 파라미터 기본값
│       ├── ps-engine.js           ← 시뮬레이션 계산 엔진 (순수 함수)
│       ├── ps-firebase.js         ← Firebase 데이터 로드 어댑터
│       ├── ps-state.js            ← 앱 상태 관리
│       ├── ps-chart.js            ← 차트 렌더링
│       ├── ps-settings.js         ← 설정 패널 UI
│       ├── ps-table.js            ← 테이블 렌더링 (Phase7)
│       └── ps-init.js             ← 초기화 & 조립
└── css/
    └── pension-sim.css            ← 시뮬레이션 전용 스타일
```

---

## 핵심 원칙

### 절대 규칙
- `js/pension/` 내 파일만 생성/수정한다
- 기존 `js/*.js`, `index.html` 수정 금지
- `ps-engine.js` 는 순수 함수만 — DOM, Firebase, 전역 상태 접근 금지
- 모든 상수는 `ps-config.js` 에 — 인라인 하드코딩 금지
- CSS 클래스는 `ps-` 접두어, ID는 `pension-` 접두어 사용

### 작업 순서 원칙
1. `INTERFACE.md` 확인 후 기존 코드와 충돌 여부 체크
2. `ps-config.js` 파라미터 확인
3. `ps-engine.js` 로직 구현 및 console 단위 테스트
4. UI 연결은 마지막

### 파일 수정 방식
- 기존 파일 수정 시: 전체 재생성 대신 `str_replace` 사용
- 디버깅 시: 에러 발생 파일만 열기
- `console.log` 디버그 코드는 완료 후 제거

---

## 데이터 아키텍처

### 단방향 데이터 흐름

```
Firebase / 사용자 입력
        ↓
  ps-firebase.js   (로드 & 정규화)
        ↓
   ps-state.js     (파라미터 + 실적 데이터 보관)
        ↓
   ps-engine.js    (계산만 — 입력 받아 결과 반환)
        ↓
  ps-chart.js      (차트 렌더)
  ps-table.js      (테이블 렌더)
  ps-settings.js   (설정 UI → state 업데이트 → 재계산 트리거)
```

### ps-engine.js 외부 인터페이스

```javascript
// 호출
const result = PensionEngine.run(params, actualData);

// result 구조
{
  months: [],             // 'YYYY-MM' 배열 (2026-01 ~ 2040-12)
  plan: {
    total: [],
    byAccount: {
      연금저축:[], IRP1:[], IRP2:[], VOO:[],
      해외주식:[], RIA:[], ISA:[]
    }
  },
  forecast: {             // 실적 기반 재시뮬레이션
    total: [],
    byAccount: { ... }
  },
  actual: {               // Firebase 실데이터 (있는 구간만, 없으면 null)
    total: [],
    byAccount: { ... }
  },
  events: [               // 차트 이벤트 마커
    { ym: 'YYYY-MM', label: '설명', type: 'transfer|retire|pension|voo' }
  ],
  meta: {
    isaLimitLog: [],      // ISA 한도 계산 근거
    vooDepletionMonth: null,
    totalSeaxCreditByYear: {}
  }
}
```

### ps-state.js 구조

```javascript
const PensionState = {
  params: { ...DEFAULT_PARAMS },
  actual: {},
  result: null,
  update(patch) { /* 재계산 → 렌더 트리거 */ },
  setActual(data) { /* Firebase 데이터 주입 */ }
};
```

---

## 기본값 파라미터 (DEFAULT_PARAMS)

```javascript
{
  rates: {
    연금저축: 0.10,
    IRP1: 0.10,
    IRP2: 0.09,
    해외주식: 0.10,
    RIA: 0.10,
    ISA: 0.10,
    VOO: 0.09
  },
  voo: {
    startYM: '2027-01',
    intervalWeeks: 3,
    priceKRW: 950000
  },
  pension: {
    baseMonthly: 1000000       // 연금저축 고정 납입 (VOO 분배 외)
  },
  isa: {
    joinYM: '2026-03',
    annualLimit: 20000000,
    transfers: [
      { ym: '2027-05' },       // 금액은 자동 계산
      { ym: '2028-01' },
      { ym: '2029-01' }
    ]
  },
  retire: {
    ym: '2028-12',
    severancePay: 140000000
  },
  nationalPension: {
    startYM: '2039-03',
    monthly: 1800000
  },
  tax: {
    deductRate: 0.132,
    rate6069: 0.044,
    rate70: 0.033,
    separateTaxThreshold: 15000000
  },
  healthInsurance: {
    rate: 0.0709,
    annualRaise: 0.015,
    cap: 0.12,
    ltcRate: 0.1295,
    dependentIncomeLimit: 20000000,
    pensionExemptLimit: 10000000
  },
  property: {
    publicPrice: 710000000,
    annualRaise: 0.07,
    ownershipRatio: 0.5
  }
}
```

---

## VOO 매도 & 분배 로직 명세

```
매월 VOO 매도 판단:
  intervalWeeks 기준 해당 월 매도 여부 결정
  매도액 = priceKRW (수동 입력 기준)

분배 우선순위 (정상: 매도액 ≥ 50만):
  1순위 개인연금저축: 25만원 고정
  2순위 IRP1:         25만원 고정
  3순위 ISA:          나머지 전부

분배 우선순위 (급락: 매도액 < 50만):
  1순위 개인연금저축: 가능한 만큼 우선
  2순위 IRP1:         잔여분
  3순위 ISA:          그 이후 잔여

한도 초과 처리:
  연금저축 연 1,500만 도달 → 해당 연도 납입 중단 → 초과분 IRP1 → ISA 이동
  IRP1 연 300만 도달 → 납입 중단 → 초과분 ISA 이동

VOO 소진 후:
  개인연금저축: 기본 100만/월 유지
  IRP1: 0원 (자연성장만)
  ISA: 0원 (RIA 이체만)
```

---

## ISA 한도 자동 계산 로직 명세

```
매년 1월 1일: 누적 한도 += 2,000만원
가입 첫 해는 2,000만원으로 시작

이체 시점 계산:
  가용액 = (가입 연차 × 2,000만) - VOO납입누계 - 이전이체누계
  이체액 = min(가용액, RIA잔액)
  초과분은 RIA에 잔류 → 다음 이체 시점으로 이월

RIA 의무보유:
  2026.04까지 단계적 매수 완료
  일괄 해제 시점: 2027.05
  1차 이체 최소 시점: 2027.05 이후
```

---

## 차트 구성 명세

### 기간 슬라이더
옵션: `[1, 2, 3, 5, 8, 10, 15, 20]`년, 슬라이드바 형태

### 차트 1 — 전체 연금자산 (선그래프)
```
데이터셋:
  - 실제 실적 (진한 실선, Firebase 구간)
  - 실적 기반 예측 (점선, 현재 이후)
  - 최초 계획 (흐린 점선, 전 구간 참고용)
```

### 차트 2 — 계좌별 누적 (스택 영역 차트)
```
버튼 토글: [실적+예측] / [최초 계획]
계좌별 색상:
  개인연금저축: #1D9E75
  IRP1:        #378ADD
  IRP2:        #7F77DD
  VOO:         #EF9F27
  해외주식:    #D85A30
  RIA/ISA:     #D4537E

실적 구간: 불투명도 0.8
예측 구간: 불투명도 0.35 + 점선 테두리
```

### 차트 3 — 계획 대비 차이 (바 차트)
```
양수(초과): #1D9E75
음수(미달): #D85A30
```

---

## 설정 패널 구성 명세

### 전면 노출 카드 (항상 보임)
```
[카드1] 수익률 설정
  계좌별 6개 입력 (연금저축, IRP1, IRP2, 해외주식, RIA/ISA, VOO)

[카드2] VOO 매도 설정
  - 매도 시작 시점 (년-월)
  - 매도 주기 (N주마다 1주)
  - VOO 1주당 가격 (원)
  - 연금저축 기본 납입액 (원/월)

[카드3] ISA 이체 스케줄
  - ISA 가입일 (년-월)
  - 1·2·3차 이체 시점 (년-월 입력만)
  - 이체 금액: 자동 계산 표시 (읽기전용)
  - 분리과세 기준선 (원/년)
```

### 고급 설정 (토글 접기/펼치기)
```
[접기1] 세율 & 건강보험료 (중간 빈도)
  세액공제율, 연금소득세율(60~69/70~),
  건보료율, 연간상승률, 장기요양보험료율,
  피부양자 소득 기준, 사적연금 건보료 하한

[접기2] 부동산 (중간 빈도)
  아파트 공시가격, 연간 상승률

[접기3] 초기값 / 고정값 (거의 안 바뀜, 읽기 전용)
  Firebase 자동 연동 초기 잔액 표시
  납입 종료 나이, 퇴직 시점, 퇴직금, 국민연금
```

---

## Phase별 작업 프롬프트

---

### Phase 0 — 영향도 분석 (필수 선행)

```
[TASK: Phase0 - 영향도 분석 & INTERFACE.md 생성]

아래 파일을 순서대로 읽고 INTERFACE.md 를 생성하라.

읽을 파일:
  js/config.js
  js/firebase.js
  js/init.js
  js/render.js
  css/style.css

INTERFACE.md 에 포함할 내용:
1. 전역 변수/함수 목록 (window.* 에 노출된 것)
2. Firebase 실제 데이터 스키마 (kiData 구조 포함)
3. 계좌 인덱스 매핑 확인 ([3]=연금저축, [7]=IRP1, [8]=IRP2)
4. 기존 CSS 클래스명 목록
5. pension 모듈과의 잠재적 충돌 위험 항목
6. pension 모듈이 재사용할 수 있는 유틸 함수 목록

완료 기준: INTERFACE.md 파일이 레포 루트에 생성됨
이후 모든 Phase 는 전체 기존 파일 재열람 없이 INTERFACE.md 참조
```

---

### Phase 1 — 기반 파일 생성

```
[TASK: Phase1 - ps-config.js & ps-engine.js]

참조: INTERFACE.md (충돌 확인용)
생성 파일: js/pension/ps-config.js, js/pension/ps-engine.js

ps-config.js:
  - 이 지침서의 DEFAULT_PARAMS 그대로 구현
  - 월수익률 변환 함수: annualToMonthly(rate)
  - 시뮬레이션 기간 상수: START_YM='2026-01', END_YM='2040-12'

ps-engine.js:
  - PensionEngine.run(params, actualData) 구현
  - 이 지침서의 result 구조 그대로 반환
  - VOO 매도/분배 로직 구현 (명세 참조)
  - ISA 한도 자동 계산 로직 구현 (명세 참조)
  - calcISATransfer(params, paidSoFar) 를 별도 함수로 분리 (설정 패널에서 재사용)
  - 순수 함수만 — DOM/Firebase 접근 없음

완료 기준:
  브라우저 콘솔에서
  PensionEngine.run(DEFAULT_PARAMS, {}) 실행 시
  months 배열 길이 180 (15년×12), 에러 없음
```

---

### Phase 2 — Firebase 연동

```
[TASK: Phase2 - ps-firebase.js]

참조: INTERFACE.md 의 Firebase 스키마 섹션
생성 파일: js/pension/ps-firebase.js

구현:
  PensionFirebase.load() → Promise<actualData>

actualData 구조:
  {
    initialBalances: {
      연금저축: number,   // kiData eval[3] 최신값
      IRP1: number,       // kiData eval[7] 최신값
      IRP2: number,       // kiData eval[8] 최신값
      해외주식: number,
      VOO: number,
      RIA: number,
      ISA: number
    },
    monthlyActual: {
      'YYYY-MM': {
        연금저축, IRP1, IRP2, VOO, 해외주식, RIA, ISA
      }
    }
  }

주의:
  - INTERFACE.md 에서 확인한 실제 Firebase 스키마 기준으로 구현
  - 기존 firebase.js 의 FIREBASE_URL 재사용
  - 데이터 없는 계좌는 0 또는 null 처리 명시

완료 기준:
  PensionFirebase.load().then(console.log) 실행 시
  initialBalances 값이 Firebase 실제값과 일치
```

---

### Phase 3 — 상태 관리 & 초기화

```
[TASK: Phase3 - ps-state.js & ps-init.js]

참조: INTERFACE.md
생성 파일: js/pension/ps-state.js, js/pension/ps-init.js

ps-state.js:
  PensionState = {
    params: DEFAULT_PARAMS 복사본,
    actual: {},
    result: null,
    _listeners: [],
    update(patch):  Object.assign(params, patch) → run() → notify(),
    setActual(d):   actual = d → run() → notify(),
    subscribe(fn):  렌더 함수 등록,
    _run():         PensionEngine.run(params, actual) → result 갱신
  }

ps-init.js:
  DOMContentLoaded 이벤트에서:
  1. PensionFirebase.load()
  2. PensionState.setActual(data)
  3. PensionSettings.render() + bind()
  4. PensionChart.updateAll(result, defaultYears=3)
  로딩 중 스피너 표시, 에러 시 사용자 메시지 표시

완료 기준:
  pension-simulation.html 열었을 때
  콘솔 에러 없이 PensionState.result 에 값이 채워짐
```

---

### Phase 4 — 차트 렌더링

```
[TASK: Phase4 - ps-chart.js]

참조: INTERFACE.md (CSS 충돌 확인), 이 지침서의 차트 구성 명세
생성 파일: js/pension/ps-chart.js
의존: Chart.js 4.4.1 (CDN)

구현 함수:
  PensionChart.initPeriodSlider(onChange)
    슬라이더 값: [1,2,3,5,8,10,15,20]
    변경 시 onChange(years) 호출

  PensionChart.renderTotalLine(result, years)
    선그래프: 실적(진한선) / 예측(점선) / 계획(흐린선)

  PensionChart.renderStackedArea(result, years, mode)
    mode: 'actual' | 'plan'
    누적 스택 + 이 지침서의 계좌별 색상 적용

  PensionChart.renderDiffBar(result, years)
    양수 #1D9E75 / 음수 #D85A30

  PensionChart.updateAll(result, years)
    위 3개 동시 업데이트

주의:
  - CSS 클래스: ps- 접두어 사용
  - 기존 style.css 와 클래스명 중복 금지 (INTERFACE.md 확인)
  - 차트 인스턴스 재생성 전 반드시 destroy() 호출

완료 기준:
  PensionChart.updateAll(PensionState.result, 3) 호출 시
  3개 차트 정상 렌더
```

---

### Phase 5 — 설정 패널 UI

```
[TASK: Phase5 - ps-settings.js]

참조: INTERFACE.md, 이 지침서의 설정 패널 구성 명세
생성 파일: js/pension/ps-settings.js

구현:
  PensionSettings.render()
    설정 패널 HTML 생성 및 #pension-settings 컨테이너에 삽입
    이 지침서의 설정 패널 구성 명세 그대로 구현

  PensionSettings.bind()
    각 입력 onChange → PensionState.update(patch) 호출
    ISA 이체 금액: ps-engine.js 의 calcISATransfer() 재사용하여 실시간 표시
    Firebase 읽기전용 값: 입력 disabled 처리

  PensionSettings.syncFromState()
    PensionState.params 값으로 UI 동기화 (외부에서 params 변경 시 사용)

주의:
  - CSS 클래스: ps- 접두어
  - 고급설정 토글: 접기/펼치기 애니메이션

완료 기준:
  수익률 변경 시 → PensionState.update() → 차트 자동 업데이트
```

---

### Phase 6 — 최종 조립

```
[TASK: Phase6 - pension-simulation.html & pension-sim.css]

참조: INTERFACE.md (전역 변수 충돌, CSS 충돌 최종 확인)
생성 파일: pension-simulation.html, css/pension-sim.css

pension-simulation.html 구조:
  <header>
    제목 + 기존 대시보드 링크 (index.html)
  <main>
    <section id="pension-settings">   ← 설정 패널
    <section id="pension-charts">
      기간 슬라이더
      전체 연금자산 선그래프 카드
      계좌별 누적 스택 차트 카드
    <section id="pension-table">      ← 빈 컨테이너 (Phase7)

스크립트 로드 순서 (순서 중요):
  1. Chart.js CDN
  2. js/config.js (기존)
  3. js/firebase.js (기존)
  4. js/pension/ps-config.js
  5. js/pension/ps-engine.js
  6. js/pension/ps-firebase.js
  7. js/pension/ps-state.js
  8. js/pension/ps-chart.js
  9. js/pension/ps-settings.js
  10. js/pension/ps-init.js

pension-sim.css:
  - 모바일 반응형 (breakpoint: 480px)
  - 기존 css/style.css CSS 변수 재사용
  - 모든 클래스 ps- 접두어

완료 기준:
  모바일/데스크톱 양쪽에서 레이아웃 정상
  기존 index.html 동작에 영향 없음 확인
```

---

### Phase 7 — 테이블 (별도 진행)

```
[TASK: Phase7 - ps-table.js]
※ Phase 1~6 완료 후 별도 세션에서 진행

생성 파일: js/pension/ps-table.js

구현:
  PensionTable.render(result, years)
    월별 데이터 테이블 (페이지 하단)
    컬럼 구성은 별도 협의 후 진행
```

---

## 체크리스트

각 Phase 완료 시 확인:

```
Phase0  [ ] INTERFACE.md 생성됨
        [ ] 전역 변수 충돌 항목 없음 확인

Phase1  [ ] PensionEngine.run() 콘솔 정상 실행
        [ ] months 길이 180 확인
        [ ] calcISATransfer() 분리 확인

Phase2  [ ] Firebase 실제값 로드 확인
        [ ] 계좌 인덱스 매핑 정확성 확인

Phase3  [ ] PensionState.result 정상 채워짐
        [ ] 로딩/에러 처리 확인

Phase4  [ ] 3개 차트 정상 렌더
        [ ] 기간 슬라이더 동작 확인
        [ ] 차트 destroy() 후 재생성 확인

Phase5  [ ] 수익률 변경 → 차트 자동 업데이트
        [ ] ISA 금액 자동 계산 실시간 표시
        [ ] 고급설정 토글 동작

Phase6  [ ] 모바일 레이아웃 정상
        [ ] index.html 기존 기능 영향 없음
        [ ] 콘솔 에러 없음

Phase7  [ ] (별도 협의 후)
```

---

*위치: `.claude/PENSION_SIM.md` — CLAUDE.md 에는 포인터만 유지*
*마지막 업데이트: 2026-04-07*
