# MyAssetDashBD — Claude 작업 규칙
## ⚠️ 최우선 규칙 (모든 규칙보다 우선)
- "코드작성" 메시지 전까지 절대 코드 작성/수정 금지
- 분석, 계획, 설명만 하고 대기
- 모든 코드 작업 완료 시 반드시 "코드작업완료" 알림
- **모든 파일은 GitHub `jungukeu-ctrl/MyAssetDashBD` main 브랜치가 기준**
  - 로컬 디스크 파일을 기준으로 삼지 않음
  - 파일 확인/작업 전 항상 `git fetch origin main` 또는 GitHub MCP로 최신 파일 확인
## 1. 작업 시작 (PLAN)
- 대화 시작 시 반드시 PLAN.md 읽기
- PLAN.md = 이 프로젝트의 유일한 진실 공급원
- 작업 전 변경 범위, 영향받는 기능, 예상 위험 분석 후 보고
- 내 확인(OK) 받은 후에만 진행
## 2. 코드 수정 (DO)
- 한 번에 하나만 수정
- 요청한 것 외 관련 없는 코드 절대 건드리지 않음
- 리팩토링/최적화는 별도 요청 없으면 금지
## 3. 수정 후 검토 (CHECK)
수정 완료 후 반드시 보고:
- 변경한 코드 위치와 내용 요약
- 영향받은 기존 기능 목록
- 잠재적 오류 가능성
- 데이터 계산 수식은 예시 숫자로 검증
  예) 투자금 1,000만원 → 평가금 1,200만원 → 수익률 20% ✅
## 4. 작업 완료 후 반영 (ACT)
"코드작업완료" 알림 후 반드시 PLAN.md 업데이트:
| 상황 | 해야 할 일 |
|------|-----------|
| 작업 완료 | 완료된 작업 테이블에 행 추가 |
| 항목 완료 | 남은 작업 목록에서 제거 또는 ✅ |
| 새 작업 발견 | 남은 작업 목록에 추가 |
| Firebase 스키마 변경 | 프로젝트 개요 Firebase 구조 업데이트 |
| 새 계좌/모달 추가 | 계좌 구성 테이블 업데이트 |
| 용어/구조 변경 | 증권사별 계좌 분류 업데이트 |
- PLAN.md 수정 시 Stop 훅이 자동 커밋 및 main 동기화
- Firebase 수정 시 MyAssetDashBD ↔ Pension-tracer 공유 DB 영향 반드시 기록
## 5. 브랜치 규칙
- main에는 직접 push하지 않음
- 개발 브랜치는 매 세션 시작 시 PLAN.md에서 확인


## pension-simulation 모듈

> 상세 지침: `.claude/PENSION_SIM.md`
> 영향도 분석: `.claude/INTERFACE.md` (Phase0 산출물)

### 핵심 규칙 요약
- 작업 범위: `js/pension/`, `pension-simulation.html`, `css/pension-sim.css` 만
- 기존 `js/*.js`, `index.html` 수정 금지
- 매 작업 시작 전 `.claude/INTERFACE.md` 확인 필수
- 상세 파라미터/로직/Phase 프롬프트는 `.claude/PENSION_SIM.md` 열람
