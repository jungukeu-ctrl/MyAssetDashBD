# SEC-FIREBASE-001 — Firebase 보안 규칙 현황 조사 보고서

- 작성일: 2026-10-27
- 대상 DB: `my-asset-dashboard-9e6f9-default-rtdb` (asia-southeast1)
- 범위: `MyAssetDashBD` main(`d2f1621`) + 레거시 `jungukeu-ctrl/Pension-tracer`(shallow clone) 읽기 전용 조사. 코드 변경 없음.
- 한계: 이 세션의 egress 프록시가 `*.firebasedatabase.app`을 차단해 **라이브 규칙을 직접 확인하지 못했다**(`.json?shallow=true` 요청이 CONNECT 403). 현재 규칙이 공개 상태라는 것은 Firebase 경고 메일 내용에 근거한다. Firebase 콘솔(Rules 탭)의 현행 규칙 원문은 사용자가 확인해야 한다.

## 0. 핵심 결론 (요약)

1. **두 앱 모두 이미 Firebase Auth(이메일/비밀번호)로 로그인하고, 모든 DB 요청에 `?auth=<idToken>`을 붙인다.** SDK(compat/modular)는 쓰지 않고 REST만 쓴다. 따라서 규칙을 `auth.uid == 본인UID`로 잠가도 **앱 코드 수정 없이 동작할 가능성이 높다.** Google 로그인 전환은 필수가 아니다.
2. 인증 없이 DB를 호출하는 클라이언트는 레포 안에서 **발견되지 않았다**(런타임·콘솔 스크립트·Pension-tracer 모두 토큰 사용). Apps Script는 레포에 없다. `pushToGAS_`·`scheduleGasSync_` 등 "GAS" 이름은 과거 명칭이 남은 것이고 실제로는 Firebase REST를 호출한다.
3. **규칙은 `asset-data`뿐 아니라 최상위 형제 노드 `asset-data-backups`도 허용해야 한다.** 일일 백업·30일 정리가 이 경로를 읽고 쓰고 지운다. 규칙에서 빠뜨리면 백업이 조용히 실패한다(저장은 계속됨).
4. **"신규 가입 허용" 여부가 가장 큰 변수다.** 웹 API 키는 공개값이라 Identity Toolkit `signUp`이 열려 있으면 누구나 계정을 만들어 `auth != null`을 통과한다. 규칙은 반드시 `auth.uid === '<본인UID>'`로 써야 하고, 가입 비활성화도 같이 하는 것이 안전하다.
5. **별건(규칙과 무관한 노출)**: 이 레포는 **public + GitHub Pages**다. 루트의 `data.json`, `migration-payload.json`, `asset_monthly_2026-04-01.xlsx`, `데이터원본_2602.xlsx`, `데이터원본_2603.xlsx`에 실제 자산 수치가 들어 있다(`data.json`은 `toss-obil` 14,300,488원 등 확인). DB 규칙을 잠가도 이 파일들은 누구나 받을 수 있다. 후속 조치 필요(§7-5).

## 1. Firebase SDK / Auth 사용 방식

| 항목 | MyAssetDashBD | Pension-tracer |
|---|---|---|
| SDK | **미사용**(`gstatic.com/firebasejs` 로드 없음, `firebase.initializeApp`·`.ref(`·`.database()` 호출 0건) | 동일, 미사용 |
| 방식 | `fetch` + Realtime DB REST(`.json?auth=`) | 동일 |
| 로그인 | Identity Toolkit REST `accounts:signInWithPassword` (`js/firebase.js:10,120`) | 동일 (`js/firebase.js:13,110`) |
| 토큰 갱신 | `securetoken.googleapis.com/v1/token` (`js/firebase.js:11,91`) | 동일 (`js/firebase.js:14,81`) |
| `onAuthStateChanged` / `signIn*`(SDK) | 없음. 자체 오버레이 + `checkAndInitAuth_` | 없음 |
| 토큰 저장 | localStorage `fb_id_token`/`fb_refresh_token`/`fb_token_expiry` | localStorage `pt_id_token`/`pt_refresh_token`/`pt_token_expiry` |
| 웹 API 키 | `js/config.js:7` (공개용 클라이언트 키) | `js/config.js:8` (동일 키) |

두 앱이 같은 Firebase 프로젝트·같은 API 키·같은 이메일 계정을 쓰므로 UID는 1개로 같을 것으로 보인다(Auth 콘솔에서 확인 필요). 토큰 키 이름만 다르다.

## 2. DB 접근 지점 (MyAssetDashBD 런타임)

| # | 파일:라인 | 함수 | 경로 | R/W |
|---|---|---|---|---|
| 1 | js/firebase.js:399 | `fetchFromFirebase_` | `asset-data` | R |
| 2 | js/firebase.js:377 | `pushToGAS_` (PATCH) | `asset-data` | W |
| 3 | js/firebase.js:309 | `_backupAssetDataBeforePatch_` (PATCH) | `asset-data-backups/{YYYY-MM-DD}` | W |
| 4 | js/firebase.js:325 | `_pruneOldAssetDataBackups_` | `asset-data-backups` | R |
| 5 | js/firebase.js:343 | `_pruneOldAssetDataBackups_` (PATCH, 값 null=삭제) | `asset-data-backups` | W |
| 6 | js/firebase.js:420 | `fetchSangchuData_` | `asset-data/sangchu` | R |
| 7 | js/firebase.js:430 | `saveSangchuData_` (PATCH) | `asset-data/sangchu` | W |
| 8 | js/firebase.js:455 | `fetchObilTracerData_` | `asset-data/obilTracer` | R |
| 9 | js/firebase.js:465 | `saveObilTracerData_` (PATCH) | `asset-data/obilTracer` | W |
| 10 | js/decisions.js:20 | `fetchDecisions_` | `asset-data/decisions` | R |
| 11 | js/decisions.js:32 | `saveDecisionEntry_` (PATCH) | `asset-data/decisions` | W |
| 12 | js/pension/ps-firebase.js:51 | `_fetchFirebase` | `asset-data` | R |
| 13 | js/pension/ps-firebase.js:180 | `saveContribution` (PATCH) | `asset-data/pensionSimulation/contributions/{ym}` | W |

참고: #3 백업은 내부에서 #1(`fetchFromFirebase_`)을 호출해 읽는다(별도 지점으로 세지 않음). Auth REST 호출(signIn 1, refresh 1)은 DB가 아니므로 위 표에서 제외.

호출 트리거: `init()` → #1, 변경 시 `scheduleGasSync_`(2초 디바운스) → #2(+#3 +#4/#5 10% 확률), 수동 `manualSync()` → #1, 상추/오빌/결정 모달 → #6~#11, 연금 시뮬 `ps-init.js`·`ps-table.js` → #12/#13.

## 3. 일회성 콘솔 스크립트 (레포 루트, 브라우저 콘솔에 붙여넣어 실행)

모두 localStorage의 `fb_id_token`을 읽어 `?auth=`로 호출한다(인증 있음). 토큰 만료 시 `securetoken` 갱신 호출 포함.

| # | 파일:라인 | 경로 | R/W |
|---|---|---|---|
| 14 | paste-in-console.js:47 | `asset-data` | R |
| 15 | paste-in-console.js:130 | `asset-data` (PATCH) | W |
| 16 | migrate.js:273 | `asset-data` | R |
| 17 | migrate.js:357 | `asset-data` (PATCH) | W |
| 18 | ria-external-purchase-backfill-console.js:66 | `asset-data/pensionSimulation/contributions/{ym}` | R |
| 19 | ria-external-purchase-backfill-console.js:75 | 동일 (PUT) | W |
| 20 | pension-actual-contribution-backfill-console.js:76 | 동일 | R |
| 21 | pension-actual-contribution-backfill-console.js:85 | 동일 (PUT) | W |
| 22 | pension-legacy-contribution-migration-console.js:83 | `asset-data/pension-tracker/records/{ym}` | R |
| 23 | pension-legacy-contribution-migration-console.js:117 | `asset-data/pensionSimulation/contributions/{ym}` | R |
| 24 | pension-legacy-contribution-migration-console.js:120 | 동일 (PUT) | W |

## 4. 레거시 Pension-tracer (`jungukeu-ctrl/Pension-tracer`, 마지막 push 2026-04-20)

| # | 파일:라인 | 함수 | 경로 | R/W |
|---|---|---|---|---|
| 25 | js/firebase.js:181 | `FirebaseService.fetchAll` | `asset-data` (루트 전체) | R |
| 26 | js/firebase.js:191 | `FirebaseService._patch` | 아래 4개 경로로 PATCH | W |

`_patch` 호출처(쓰기 경로 4개): `saveRecord`→`asset-data/pension-tracker/records/{월}`, `saveContribution`→`asset-data/pension-tracker/contributions/{irp|isa}`, `saveVoo`→`asset-data/pension-tracker/voo`, `savePlan`→`asset-data/pension-tracker/plan`.

- **현재도 같은 DB에 쓴다**(앱이 살아 있고 배포 중단 안내가 아직 없음. PLAN.md §8: 아카이브 예정). 쓰기는 `pension-tracker/**`에 한정, 설계 주석상 `state`/`kiwoom`은 읽기 전용이다.
- DB URL은 사용자가 UI에서 바꿀 수 있으나 기본값이 이 DB다. 인증은 위 §1과 동일(`pt_*` 토큰).
- 같은 계정으로 로그인하면 UID가 같아 단일 UID 규칙으로 그대로 동작한다. **다른 계정을 쓰고 있다면 그 UID를 허용 목록에 넣거나 앱을 폐기해야 한다.**
- 조사한 다른 레포(`Sangchu`, `pension-tracker`, `chukbunhal-webapp-project`, `DannySchedule`)에서는 이 DB URL·API 키 참조가 없었다. 단, 이 목록은 `list_repos`에 보인 레포뿐이다.

## 5. 외부/무인증 클라이언트

- `.firebaseio.com` / `.firebasedatabase.app` URL을 직접 부르는 코드는 위 표의 모두 `?auth=`가 붙어 있다. **무인증 호출은 0건.**
- Apps Script / Google Drive 동기화: 레포 안 코드·문서에서 호출 지점 **없음**(grep `Apps Script|script.google|appsscript`). 레포 밖에 별도 Apps Script 프로젝트나 외부 자동화(예: cron, IFTTT, 스프레드시트 스크립트)가 DB를 부르고 있다면 이 조사로는 알 수 없다 → **사용자 확인 필요.**
- Admin SDK / REST secret(`?auth=<database secret>`)을 쓰는 서버 클라이언트: 없음. (Admin SDK는 규칙을 우회하므로 있다면 영향 없음)
- `api.anthropic.com`(kiwoom-transfer-analyzer.html:358), `open.er-api.com`(modal.js:619)은 Firebase와 무관.

## 6. 규칙·민감정보 점검

### 6-1. 규칙 파일
`database.rules.json`, `firebase.json`, `.firebaserc`, `.github/` 모두 **레포에 없다.** 규칙 관련 문서도 없다. 규칙은 콘솔에서만 관리되고 있으므로 버전 관리되지 않는다 → 아래 권장안에서 레포에 규칙 파일을 추가하도록 제안.

### 6-2. 민감정보 (소스 + 전체 커밋 이력 79개 커밋 대상 패턴 검색)
| 항목 | 결과 |
|---|---|
| 서비스 계정 키(`private_key`, `"type":"service_account"`, PEM) | 없음 |
| DB 시크릿(레거시 `?auth=<secret>`)·`client_secret`·OAuth 토큰 패턴 | 없음 |
| 비밀번호 리터럴 | 없음 (로그인은 입력값만 사용) |
| `.env`/`*key*`/`credential` 파일 추적 | 없음 |
| Firebase 웹 API 키 `AIzaSyDovm…` | 이력에서 12회 등장. **공개해도 되는 클라이언트 키**(보안은 규칙+Auth가 담당). 다만 API 키 제한(HTTP referrer, API 범위)을 GCP 콘솔에서 걸어두면 가입 남용 방지에 도움 |
| 사용자 UID | 소스에 없음 |
| **개인 자산 데이터 파일** | **있음 — `data.json`, `migration-payload.json`, `asset_monthly_2026-04-01.xlsx`, `데이터원본_2602/2603.xlsx`** (public 레포, Pages 배포 대상) |

> 이력에서 데이터 파일을 지워도 과거 커밋에 남는다. 완전 제거는 `git filter-repo` 계열 이력 재작성이 필요하며 본 작업 범위 밖이다(§7-5).

### 6-3. 클라이언트 쪽 부수 관찰 (참고, 변경 불요)
- 토큰이 URL 쿼리(`?auth=`)로 전송된다. REST 방식의 정상 동작이며 TLS로 보호된다.
- ID 토큰·refresh 토큰이 localStorage에 있다. XSS가 있으면 탈취 가능 → 본 앱은 외부 스크립트를 최소화하고 있어 현 시점 허용 가능.

## 7. 권장 구현안

### 7-1. 방향 (2단계 분리)

- **1단계(권장, 코드 변경 0): 현행 이메일/비밀번호 인증을 유지한 채 규칙만 단일 UID로 잠근다.** 두 앱 모두 이미 토큰을 붙이기 때문에 가장 빠르고 위험이 낮다.
- **2단계(선택): Google 로그인 전환.** 사용자 기본 선호가 Google이면 이 단계에서 진행. 앱에 로그인 UI·Google Identity 연동·토큰 교환(`accounts:signInWithIdp`) 코드가 필요하고 `firebase.js` 인증 코드(두 앱)와 콘솔 스크립트의 갱신 로직이 영향받는 **별도 작업** 이다. 이때 본인 Google 계정으로 처음 로그인하면 **UID가 새로 생겨** 규칙의 UID를 갱신해야 한다(또는 이메일/비밀번호 계정에 Google을 연결). 1단계 규칙은 UID만 바꾸면 그대로 재사용된다.

### 7-2. 규칙 초안

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "asset-data": {
      ".read":  "auth != null && auth.uid === 'OWNER_UID'",
      ".write": "auth != null && auth.uid === 'OWNER_UID'"
    },
    "asset-data-backups": {
      ".read":  "auth != null && auth.uid === 'OWNER_UID'",
      ".write": "auth != null && auth.uid === 'OWNER_UID'"
    }
  }
}
```

- `OWNER_UID`는 Firebase 콘솔 → Authentication → Users의 사용자 UID. **레포에는 커밋하지 않고 배포 시점에만 채운다.**
- `asset-data/pension-tracker`(Pension-tracer 쓰기분)는 `asset-data` 하위라 같은 규칙으로 커버된다. 다른 UID를 허용해야 하면 `"auth.uid === 'A' || auth.uid === 'B'"`로 확장.
- `.validate` 스키마 검증은 이번 범위에서 제외(앱이 `PUT`/`PATCH`로 부분 쓰기를 많이 해서 잘못된 검증이 저장을 막을 위험이 큼).

### 7-3. 배포 순서

1. **현행 데이터 백업**: 콘솔 → Realtime Database → Data → `⋮` → Export JSON. 현행 규칙 원문도 메모장에 복사(롤백용).
2. **UID 확인**: Authentication → Users에서 앱 로그인 계정 UID 확인. Pension-tracer를 다른 계정으로 쓰면 그 UID도 확인.
3. **신규 가입 차단**: Authentication → Settings → User actions에서 *Enable create (sign up)* 끄기. 이미 만들어진 낯선 계정이 없는지 Users 목록도 점검.
4. **규칙 시뮬레이터**(Rules → Rules Playground)로 검증: ① 무인증 read `/asset-data` → 거부, ② 본인 UID read/write `/asset-data`, `/asset-data-backups/2026-10-27` → 허용, ③ 타 UID → 거부.
5. **게시(Publish)**. 직후 스모크 테스트(아래 7-4).
6. 문제 없으면 규칙 원문을 `database.rules.json`(UID는 자리표시자)과 `firebase.json`으로 레포에 추가하는 후속 PR 진행.

### 7-4. 스모크 테스트 체크리스트
- 시크릿 창에서 `https://<db>/asset-data.json` 직접 열기 → `Permission denied` 확인.
- 대시보드 로그인 → 데이터 로드(`☁ 동기화됨`/`이미 최신`), 값 수정 후 `☁ 저장됨`.
- 개발자도구 Network에서 `asset-data-backups/{오늘}.json` PATCH가 200인지 확인.
- 상추 매매 저장, 오빌Tracer 저장, 결정 기록 저장.
- `pension-simulation.html` 납입 실적 저장(`pensionSimulation/contributions`).
- Pension-tracer 로그인 → `📥 Firebase 불러오기`, 저장 1회(`pension-tracker/records`).
- 로그아웃 후 새로고침 → 로그인 화면 표시.
- 토큰 만료(1시간) 후 갱신 동작 확인.

### 7-5. 후속 작업 후보
1. **API 키 제한**(GCP → 사용자 인증 정보): HTTP referrer를 앱 호스트로 제한, 허용 API를 Identity Toolkit/Token Service로 제한.
2. **공개 레포의 자산 데이터 파일 처리**: 파일 제거 + 이력 정리(`git filter-repo`) 또는 레포 private 전환(Pages 사용 여부 고려). 파일 삭제만으로는 이력에 남음. 이미 공개되었던 값은 회수 불가로 보고 판단 필요.
3. 규칙 파일을 레포로 버전 관리.
4. Pension-tracer 배포 중단/아카이브(PLAN.md §8 기존 예정).
5. Google 로그인(2단계), 필요 시 App Check.

### 7-6. 롤백
- **즉시 롤백**: 콘솔 Rules 탭의 규칙 히스토리에서 직전 버전 복원, 또는 1단계에서 저장해 둔 원문을 붙여넣고 Publish. 소요 1분 이내.
- 데이터는 규칙 변경으로 손상되지 않는다(접근 차단일 뿐). 데이터 이상 시 7-3-1의 Export JSON 또는 `asset-data-backups/{일자}`(최근 30일)에서 복원.
- 브라우저 localStorage의 `asset-dashboard-v3`/`kiwoom-data`는 로컬 캐시로 남아 있어 앱 쪽 최신 데이터는 보존된다.

## 8. 검증 (접근 지점 대조)

`grep -rn "firebase\|\.ref(\|\.database()" js/ *.html` 결과와 대조:
- `js/` 안에서 Firebase DB 호출은 `firebase.js`, `decisions.js`, `pension/ps-firebase.js` 3개 파일뿐이다. `config.js`는 상수 정의, `init.js`/`todo.js`/`modal.js`/`sangchu.js`/`obilTracer.js`는 위 함수들의 호출자일 뿐 직접 `fetch`하지 않는다.
- `*.html`의 `firebase` 매치는 `<script src>` 로드 3건(index.html 2, pension-simulation.html 1)과 주석뿐이며, `.ref(`·`.database()` 매치는 0건이다.
- 확장 grep(`FIREBASE_URL|firebasedatabase|fetch(|fb_id_token`)으로 루트 콘솔 스크립트 5개를 추가 확인했다.

### 개수 합계 (표 ↔ 합계 일치)

| 구분 | 지점 수 | R | W |
|---|---|---|---|
| MyAssetDashBD 런타임 (§2) | 13 | 6 | 7 |
| 콘솔 스크립트 (§3) | 11 | 6 | 5 |
| Pension-tracer (§4, 코드 지점 기준) | 2 | 1 | 1 |
| **합계** | **26** | **13** | **13** |

런타임 13건의 경로별 분해: `asset-data` 루트 3(R2·W1) + `sangchu` 2 + `obilTracer` 2 + `decisions` 2 + `pensionSimulation/contributions/{ym}` 1(W) + `asset-data-backups` 3(R1·W2) = **13** ✔. R: 루트 2 + sangchu 1 + obil 1 + decisions 1 + backups 1 = 6 ✔. W: 루트 1 + sangchu 1 + obil 1 + decisions 1 + contributions 1 + backups 2 = 7 ✔.

Auth REST(DB 아님) 호출은 별도: MyAssetDashBD 런타임 2(로그인·갱신) + Pension-tracer 2 + 콘솔 스크립트 갱신 5 = 9.
