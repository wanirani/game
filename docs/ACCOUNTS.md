# 계정 · 클라우드 저장 API (블러드 녹턴)

플레이어가 **아이디 + 비밀번호**로 계정을 만들고, 세이브 슬롯 1~3과 전역 기록(메타)을 서버에 저장해 여러 기기에서 이어 하는 기능의 서버 쪽 설계서다.
Netlify Functions(모던 함수, TypeScript) + Netlify Blobs 로 동작하며, 별도의 DB 없이 배포만 하면 켜진다. **운영 배포 전에 환경 변수 `AUTH_PEPPER` 를 반드시 넣는다**(§6·§7, 없으면 함수가 경고를 남긴다).

| 항목 | 위치 |
|---|---|
| 함수 진입점 (`/api/*`) | `netlify/functions/api.mts` · 매일 정리하는 예약 함수 `netlify/functions/cleanup.mts` (§4) |
| 공용 코드 (함수로 배포되지 않음) | `netlify/lib/*.mts` — `config` 상수, `http` 응답·본문, `runtime` 저장소·시계·환경, `crypto` 해시·토큰, `validate` 입력 검사, `ratelimit` 요청 제한, `cleanup` 기록 정리, `accounts` 계정, `saves` 저장, `router` 라우팅, `admin` 운영 도구 · 온라인 기록 `online` API, `boards` 순위 저장, `runs` 런 토큰·일일 도전, `nick` 별명, `gamedata` 게임 데이터 id 사본 (`docs/ONLINE.md`) |
| 배포 설정 | `netlify.toml` (publish = `dist/web` — `tools/deploy/build_web.mjs` 가 허용 목록으로 만든 게시 폴더, 저장소 루트는 절대 올리지 않는다 · 정적 파일 보안·캐시 헤더) · 배포 절차 `tools/deploy/README.md` §3 |
| 안드로이드 앱 프록시 | `android/app/src/main/assets/app/head_inject.html`(fetch 감싸기) → `AssetServer.java` → `ApiProxy.java` · 서버 주소 `tools/apk/api_origin.txt` (§1) |
| 테스트 | `node tools/accounts/test_api.mjs` (= `npm run test:api`) · 브라우저 `node tools/accounts/test_client.mjs` (= `npm run test:client`) · 온라인 기록 `npm run test:online` |
| 운영 도구 | `node tools/accounts/admin.mjs` |

## 1. 동작 환경

- **웹(Netlify)**: 게임과 API 가 같은 출처다. 클라이언트는 `fetch('/api/...')` 로 부른다. CORS 헤더는 두지 않는다(안드로이드 앱 출처만 예외 — 아래).
- **안드로이드 APK**: WebView 가 `https://appassets.androidplatform.net/` 에서 게임을 열고, `/api/*` 요청을 앱(`AssetServer` → `ApiProxy`)이 계정 서버로 대신 전달한다. 그래서 브라우저 입장에서는 항상 같은 출처 요청이다. 클라이언트는 반드시 **절대 경로 `/api/...`** 를 써야 한다 (`api/...` 처럼 상대 경로로 쓰면 `/assets/api/...` 처럼 엉뚱한 곳으로 간다).
  - **서버 주소**: `tools/apk/api_origin.txt` 에서 주석(`#`)과 빈 줄을 뺀 첫 줄(`https://호스트[:포트]`, 경로·끝 슬래시 없음 — 빌드할 때 환경 변수 `API_ORIGIN` 으로 덮어쓸 수 있다)을 `build_apk.sh` 가 APK 의 `assets/app/apk.json` `api.origin` 에 넣는다. `api.aliases` 에는 `src/core/cloud.js` 의 `APP_API_BASE` 사이트가 들어간다(`tools/apk/pack_web.py`). 두 값은 같은 사이트여야 웹과 앱이 같은 계정을 쓴다 — 사이트 이름이 바뀌면 둘 다 고치고 APK 를 다시 만든다. 파일이 없거나 형식이 틀리면 APK 빌드가 멈춘다. 앱이 실행 중에 이 설정을 읽지 못하면 프록시가 꺼지고 같은 출처 `/api/*` 는 **503** `{ok:false, error:'unavailable'}` 이다.
  - **요청 본문 전달**: WebView 의 `shouldInterceptRequest` 는 POST 본문을 넘겨주지 않는다. 그래서 앱 조각(`head_inject.html`, 게임 모듈보다 먼저 실행)이 `window.fetch` 를 감싸, 같은 출처 `/api/*` 와 계정 서버 주소(`api.origin`·`api.aliases`)로 가는 요청마다 무작위 id 를 만들고 `BNAndroid.apiStash(id, method, 헤더 줄들, 본문)` 으로 메서드·헤더·본문(글, 최대 4MB)을 먼저 맡긴 뒤 같은 출처 `/api/...?__bnreq=<id>` 로 보낸다. `cloud.js` 는 요청할 때마다 `fetch` 를 새로 찾으므로 감싼 것이 그대로 쓰인다. 조각은 `window.__BN_APP = {platform:'android', version, assets, apiProxy, apiBase}` 도 만든다 — `apiProxy` 는 서버 주소가 있고 `BNAndroid.apiStash` 가 있어 fetch 를 감쌌을 때만 `true`, `apiBase` 는 서버 주소가 있으면 `'/api'`, 없으면 `null`.
  - **클라이언트 주소 선택**(`cloud.js` `pickApiBase`): 웹은 `/api`. 앱에서 `__BN_APP.apiProxy === true` 면 같은 출처 `/api`(`apiBase`, 같은 출처 경로만 받음) — 앱 코드의 사이트 이름에 기대지 않는다. 프록시가 없는 옛 앱에서만 `APP_API_BASE`(공식 사이트)를 직접 부르고, 서버는 이때를 위해 앱 출처 `https://appassets.androidplatform.net` 만 CORS 로 허용한다(`netlify/lib/router.mts` `APP_ORIGINS`: 사전 요청 204, 응답에 `Access-Control-Allow-Origin`·`Cross-Origin-Resource-Policy: cross-origin`, `Sec-Fetch-Site: cross-site` 검사 제외). 그 밖의 다른 출처에는 CORS 가 없다.
  - **전달 규칙**(`ApiProxy.java`): 맡긴 메서드·헤더·본문을 **그대로** 서버에 보낸다(`Content-Type`·`Authorization` 포함). 빼는 요청 헤더: `Cookie`, `Origin`, `Referer`, `Sec-*`, `Proxy-*`, `X-Requested-With`(WebView 가 붙이는 앱 패키지 이름), `Host`·`Connection`·`Content-Length`·`Transfer-Encoding`·`Accept-Encoding`·`Keep-Alive`·`TE`·`Trailer`·`Upgrade`·`Expect` 같은 연결 단위 헤더. 쿼리의 `__bnreq` 는 떼고 보낸다. 서버의 상태 코드·응답 헤더·본문을 그대로 돌려주되 `Set-Cookie`·`Strict-Transport-Security`·`Alt-Svc`·연결 단위 헤더는 빼고, 언제나 `Cache-Control: no-store` 와 `X-BN-Proxy: 1` 을 붙인다. 리디렉트는 따라가지 않는다(3xx 는 아래 502). 서버는 기기에서 바로 오는 요청으로 보므로 `context.ip` 는 그 기기의 IP 다(망별 제한이 기기마다 따로 센다).
  - **오류**(모두 서버 오류와 같은 모양 `{ok:false, error, message}` + `X-BN-Proxy-Error` 헤더): 전체 15초 안에 응답이 없으면 **504** `timeout`, 서버에 닿지 못함(오프라인·DNS·TLS)·3xx·응답 8MB 초과는 **502** `network`, 서버 주소 없음은 **503** `unavailable`. 앱 조각의 fetch 는 `X-BN-Proxy-Error` 를 보면 네트워크 오류(`TypeError`)로 던진다 → `cloud.js` 는 웹에서 서버에 못 닿았을 때와 똑같이 처리한다(오프라인 안내·재시도).
  - **맡긴 요청의 수명**: 맡긴 요청은 60초가 지나면 버려지고, 32개가 쌓이면 가장 오래된 것부터 버려진다. `?__bnreq` 가 붙었는데 맡긴 요청이 없으면 GET·HEAD 가 아닌 요청은 **서버에 보내지 않고** 502 `network`(+`X-BN-Proxy-Error: network`)로 답한다 — 본문이 빠진 요청은 다른 요청이 되기 때문이다(예: 로그아웃 `{all:true}` 가 본문 없이 가면 '이 기기만 로그아웃'이 된다). 클라이언트는 네트워크 오류로 보고 다시 시도한다.
  - **경로 제한**: `/api` 와 `/api/...` 만 전달한다(그 밖은 404). 경로에 인코딩된 점·슬래시·역슬래시(`%2e`, `%2f`, `%5c`, 대소문자 무관)나 `\` 가 있으면 **404** `not_found` — 프록시로 사이트의 `/api` 밖 경로에 닿지 못하게 한다.
  - 시험: `node tools/apk/verify_apk.mjs` 가 `ApiProxy` 를 호스트 JVM 에서 로컬 API 서버에 대고 시험하고(`tools/apk/ApiProxyCheck.java`), 앱 페이지에서 가입·로그인·로그아웃이 프록시로 도는지 확인한다.
- **claude.ai 임베드**: CSP 가 다른 호스트 요청을 막아 API 에 닿지 않는다. 클라이언트는 `GET /api/health` 가 실패하면(네트워크 오류, JSON 이 아님, `ok` 가 아님) 계정 기능을 숨기고 로컬 저장만 쓴다. `node tools/serve.mjs` 로 띄운 로컬 서버에도 API 가 없으므로 같은 방식으로 꺼진다.
- **서비스 워커**(`sw.js`)는 `/api/` 요청을 가로채거나 캐시하지 않는다.

## 2. 공통 규칙

- 요청·응답 본문은 UTF-8 JSON. 모든 응답은 `{ ok: boolean, ... }` 이고, 실패하면 `{ ok:false, error:"코드", message:"한국어 안내" }` 가 붙는다. 화면에는 `message` 를 그대로 보여 주면 된다. 분기는 `error` 코드로 한다.
- 본문이 있는 요청은 반드시 `Content-Type: application/json` 이어야 한다(아니면 415). 다른 사이트가 `fetch(no-cors)`·form 으로 보낼 수 있는 `text/plain`·form 형식을 받지 않아, 방문자 브라우저를 빌린 가입·로그인·잠금 공격(CSRF)을 막는다. 같은 이유로 `Sec-Fetch-Site: cross-site` 요청은 403 (안드로이드 앱 출처 `https://appassets.androidplatform.net` 만 예외 — §1).
- JSON 중첩은 64단계까지(넘으면 400), 세이브·메타의 `data` 는 32단계까지이고 `__proto__` 키를 쓸 수 없다(넘거나 있으면 422).
- 로그인이 필요한 요청은 `Authorization: Bearer <토큰>` 헤더를 붙인다. 토큰은 base64url 43자.
- 모든 API 응답 헤더: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin` (안드로이드 앱 출처 요청에는 CORS 헤더와 `cross-origin` — §1).
- 429 응답에는 `Retry-After` 헤더와 본문 `retryAfter`(초)가 함께 온다.
- 본문 크기 제한: 인증 4KB, 슬롯 저장 512KB, 메타 64KB (넘으면 413).
- 시각은 모두 밀리초 epoch(`Date.now()` 형식). `savedAt` 은 **서버 시각**이다.

### 오류 코드

| HTTP | error | 뜻 |
|---|---|---|
| 400 | `bad_json` | 본문이 비었거나 JSON/UTF-8 이 아님 |
| 400 | `bad_request` | 필드 타입이 틀림 (예: 비밀번호가 문자열이 아님, `baseRev` 가 음수, `remember`·`all`·`force` 가 불리언이 아님), JSON 이 64단계보다 깊음 |
| 400 | `invalid_id` | 아이디 규칙 위반 |
| 400 | `reserved_id` | 예약된 아이디 (admin, root, system, guest, null, undefined …, admin·system·official·moderator·gm_·staff_·netlify 로 시작) |
| 400 | `invalid_password` | 비밀번호 규칙 위반 |
| 400 | `password_same_as_id` | 비밀번호가 아이디와 같음 |
| 400 | `weak_password` | 너무 흔하거나 추측하기 쉬운 비밀번호 (흔한 비밀번호 목록, 1~4글자 묶음 반복, 12345678·abcdefgh 같은 연속, 아이디 + 3글자 이하) |
| 400 | `same_password` | 새 비밀번호가 지금 비밀번호와 같음 |
| 400 | `invalid_slot` | 슬롯 번호가 1·2·3 이 아님 |
| 401 | `unauthorized` | 토큰 없음·만료·폐기 → 로컬 토큰을 지우고 로그인 화면으로 |
| 401 | `invalid_credentials` | 로그인 실패 (아이디가 없든 비밀번호가 틀리든 같은 응답) |
| 401 | `invalid_recovery` | 복구 실패 (아이디가 없든 코드가 틀리든 같은 응답) |
| 403 | `wrong_password` | 비밀번호 변경·탈퇴 때 지금 비밀번호가 틀림 (세션은 유효 — 로그아웃시키지 말 것) |
| 403 | `forbidden` | 다른 사이트에서 보낸 요청 (`Sec-Fetch-Site: cross-site`, 안드로이드 앱 출처 제외) |
| 404 | `not_found` | 없는 API 경로 |
| 404 | `slot_empty` | 클라우드 슬롯이 비어 있음 (본문에 `slot`, `rev`) |
| 405 | `method_not_allowed` | 허용되지 않는 메서드 (`Allow` 헤더 참고) |
| 409 | `id_taken` | 이미 있는 아이디 |
| 409 | `conflict` | rev 충돌 (본문 `server` 참고) |
| 413 | `payload_too_large` | 본문이 너무 큼 |
| 415 | `unsupported_media_type` | 본문이 있는데 `Content-Type` 이 `application/json` 이 아님 |
| 422 | `invalid_save` | 세이브 구조 검사 실패 |
| 422 | `invalid_meta` | 메타 구조 검사 실패 |
| 429 | `locked` | 같은 망에서 이 아이디 비밀번호 5회 실패 → 그 망에서 10분 잠금 / 같은 IPv6 /48 에서 1시간 10회 실패 → 그 /48 에서 30분 잠금 / 모든 망 합계 1시간 20회 실패 → 믿는 망(로그인에 성공했던 망)이 아닌 곳에서 2분 잠금(이어지면 4·8·10분) / 같은 망에서 복구 코드 5회 실패 → 10분 잠금 |
| 429 | `rate_limited` | 같은 망 인증 시도 10분 20회 초과 |
| 429 | `signup_limited` | 같은 망 가입 1시간 5개 초과 |
| 500 | `server_error` | 서버·저장소 일시 오류 (잠시 뒤 재시도) |

## 3. 엔드포인트

### 상태 확인
`GET /api/health` → `200 {ok:true, api:1, time}` — 인증·저장소 접근 없음. `api` 는 계약 버전, `time` 은 서버 시각.

### 계정

| 요청 | 본문 | 성공 응답 | 주요 실패 |
|---|---|---|---|
| `POST /api/auth/signup` | `{id, password, remember?}` | **201** `{ok, id, token, recoveryCode}` | invalid_id, reserved_id, invalid_password, password_same_as_id, weak_password, id_taken, signup_limited, rate_limited |
| `POST /api/auth/login` | `{id, password, remember?}` | `{ok, id, token}` | invalid_credentials, locked, rate_limited, bad_request |
| `POST /api/auth/logout` | 없음, 또는 `{all:true}` (토큰 필요) | `{ok, revoked}` — 이 토큰만 폐기. `all:true` 면 이 계정의 **모든 세션**(다른 기기 포함) 폐기 | unauthorized |
| `GET /api/auth/me` | — | `{ok, id, createdAt, nick}` — `nick` = 순위표 공개 별명, 아직 없으면 `null` (`docs/specs/online.md` §2.6) | unauthorized |
| `POST /api/auth/password` | `{oldPassword, newPassword}` | `{ok}` — **현재 토큰만 남기고** 다른 세션 모두 폐기 | wrong_password, invalid_password, password_same_as_id, weak_password, same_password, locked |
| `POST /api/auth/recover` | `{id, recoveryCode, newPassword, remember?}` | `{ok, id, recoveryCode, token}` — 새 비밀번호 적용, **새 복구 코드** 발급, 기존 세션 **전부** 폐기 후 새 토큰 발급, 이 아이디의 모든 잠금 해제 | invalid_recovery, invalid_password, password_same_as_id, weak_password, locked |
| `DELETE /api/auth/account` | `{password}` | `{ok}` — 계정·세션·모든 저장 데이터·순위 기록·고스트·별명 삭제 | wrong_password, locked |
| `POST /api/auth/account/delete` | `{password}` | 위와 같음 (DELETE 본문을 못 보내는 환경용) | |

- **아이디**: 앞뒤 공백 제거 후 소문자로 바꿔 처리(대소문자 구분 없음). 4~16자, 영문 소문자로 시작, 영문 소문자·숫자·밑줄(`_`)만. 응답의 `id` 가 정규화된 아이디다.
- **비밀번호**: 8~64자(유니코드 문자 수 기준, 한글·이모지 가능), 줄바꿈 같은 제어 문자 금지, 아이디와 같으면 안 됨(대소문자 무시), 너무 흔한 비밀번호 금지(`weak_password` — 목록은 `netlify/lib/validate.mts` 의 `COMMON_PASSWORDS`, 클라이언트 `src/core/cloud.js` 와 같아야 한다). 서버는 앞뒤 공백을 지우지 않는다 — 입력 그대로 보낸다.
- **`remember`** ('로그인 유지', 선택, 기본 `true`): `true` 면 30일 세션, `false` 면 12시간 세션(공용 기기용 — 클라이언트는 이때 토큰을 sessionStorage 에 둔다). 불리언이 아니면 400.
- **복구 코드**: `XXXX-XXXX-XXXX-XXXX` (Crockford Base32, 80비트). 가입·복구 때 **딱 한 번** 응답에 오고 서버는 해시만 가진다. 입력할 때 대소문자·공백·하이픈은 무시하고 `O→0`, `I/L→1` 로 읽으므로 사용자가 헷갈려도 된다. 한 번 쓰면 무효가 되고 새 코드가 나온다.
- 가입 성공 시 곧바로 로그인된 토큰이 온다.

### 세션
- '로그인 유지'(기본): 토큰 유효 기간 30일. 마지막 연장 뒤 7일 이상 지나 사용하면 그 시점부터 다시 30일로 연장된다(토큰 값은 그대로). 즉 한 달 안에 한 번이라도 접속하면 계속 로그인 상태다.
- '로그인 유지' 끔(`remember:false`): 12시간. 마지막 연장 뒤 1시간 이상 지나 사용하면 다시 12시간으로 연장된다. 창을 닫고 12시간이 지나면 서버에서도 끝난다.
- 사용자당 최대 10개. 11번째 로그인 시 가장 오래된 세션이 폐기된다.
- 폐기: 로그아웃(그 세션), 로그아웃 `{all:true}`·비밀번호 변경(다른 세션 모두)·복구(모두), 탈퇴(모두).

### 클라우드 저장 (모두 토큰 필요)

| 요청 | 본문 | 성공 응답 |
|---|---|---|
| `GET /api/saves` | — | `{ok, slots:[{slot, empty, rev, savedAt, summary}] ×3, meta:{rev, savedAt, empty}}` |
| `GET /api/saves/:slot` | — | `{ok, slot, rev, savedAt, data}` / 비었으면 `404 slot_empty {slot, rev}` |
| `PUT /api/saves/:slot` | `{data, baseRev, force?}` | `{ok, slot, rev, savedAt}` |
| `DELETE /api/saves/:slot` | — | `{ok, slot, rev}` (이미 비어 있어도 성공) |
| `GET /api/meta` | — | `{ok, rev, savedAt, data}` (없으면 `rev:0, savedAt:null, data:null`) |
| `PUT /api/meta` | `{data, baseRev, force?}` | `{ok, rev, savedAt}` |

- `:slot` 은 정확히 `1`·`2`·`3` (`01`, `1.0`, `%31` 등은 400 `invalid_slot`).
- `summary` = `{charId, level, classId, chapter, playTime, difficulty, gold, clientSavedAt}` — 서버가 `data` 에서 뽑는다(`level` = `heroes[charId].level`, `chapter` = `progress.chapter`, `playTime` = `stats.playTime`(초), `clientSavedAt` = `data.savedAt`(기기 시각)). 빈 슬롯은 `summary:null, savedAt:null`.
- `data`(슬롯)는 `src/core/save.js` 의 `isValidSave` 와 **같은 규칙**으로 검사한다: 객체이고 `heroes` 객체, `inventory` 배열, `progress` 객체, `charId` 가 실존 캐릭터이며 모든 영웅이 실존 캐릭터이고 `equip` 객체·유한한 `level` 을 가질 것. 서버는 데이터를 고치거나 바꾸지 않고 그대로 저장·반환한다. 내려받은 뒤에는 로컬에서 `migrateState` 를 거친다.
- `data`(메타)는 객체여야 하고, 있으면 `unlockedChars`·`endingsSeen` 은 문자열 배열, `highScores` 는 객체 배열(최대 200), `bestiary` 는 객체, `clears`·`survivalBest` 는 숫자, `konami` 는 불리언. 모르는 필드는 그대로 허용한다.
- 업적 기록 `ach` (있고 null 이 아니면, `validate.mts isValidAch` — docs/specs/achievements.md §2.4): 객체 · JSON 24KB 이하 · `v` 1~99 정수 · `got`(업적 id → 처음 얻은 ms, 0~1e13)·`prog`(누적값, 0~1e9) 는 키 규칙 `/^[a-z][a-z0-9_]{1,31}$/` 의 숫자 표(최대 256·128 키) · `claimed` 는 같은 키 규칙의 문자열 배열(최대 256) · `seenAt` 0~1e13 · `title`·`deco` 는 null 또는 키 규칙 문자열. 모르는 필드는 허용. 업적 id 목록·달성 여부는 서버가 검사하지 않는다(확인할 수 없다). 상한은 `config.mts ACH` = 클라이언트 `core/ach_meta.js ACH_LIMITS` (어긋나면 메타 동기화가 `invalid_meta` 로 멈추므로 `tools/test_achievements.mjs` 가 대조·퍼징한다).

### rev 규칙 (낙관적 동시성)
- 슬롯·메타마다 정수 `rev` 가 있다. 저장할 때마다 1씩 오르고, **삭제해도 되돌아가지 않는다**(삭제는 묘비로 남아 rev 가 1 오른다). 한 번도 쓰지 않은 슬롯은 `rev:0`.
- `PUT` 의 `baseRev` 는 "내가 마지막으로 본 서버 rev" 다.
  - 숫자: 서버 rev 와 다르면 `409 conflict`. 단, **서버 슬롯이 비어 있을 때 `baseRev:0` 은 항상 허용**한다(빈 칸에 처음 올리기).
  - `null` 또는 생략: 검사 없이 덮어쓴다(권장하지 않음).
  - `force:true`: rev 가 달라도 덮어쓴다 (사용자가 "이 기기 데이터로 덮어쓰기"를 고른 경우).
- 충돌 응답: 슬롯은 `409 {ok:false, error:"conflict", server:{rev, savedAt, empty, summary}}`, 메타는 `server:{rev, savedAt, data}` (메타는 합치기 좋도록 서버 데이터를 함께 준다).
- 권장 클라이언트 흐름: 슬롯마다 마지막으로 동기화한 `rev` 를 로컬에 기억 → 저장할 때 그 값을 `baseRev` 로 보냄 → 409 가 오면 로컬 요약과 `server.summary` 를 나란히 보여 주고 "클라우드 것 받기(GET 후 로컬에 쓰기)" 또는 "이 기기 것으로 덮어쓰기(force)" 를 고르게 한다. 메타는 합집합(해금·엔딩·도감)과 최댓값(점수·클리어 수)으로 합친 뒤 `server.rev` 를 `baseRev` 로 다시 보낸다.

## 4. 데이터 모델 (Netlify Blobs)

저장소 4개, 모두 `consistency: 'strong'`. **운영 배포(`production`)는 사이트 전역 저장소(`getStore`)**, 배포 미리보기·브랜치 배포·`netlify dev` 는 **배포별 저장소(`getDeployStore`)** 를 써서 시험 데이터가 운영 데이터와 섞이지 않는다 (미리보기에서 만든 계정은 그 배포에서만 보인다).

| 저장소 | 키 | 값 |
|---|---|---|
| `bn-users` | 로그인 아이디 (`hunter_01`) | `{v:1, id, uid, createdAt, updatedAt, pw, rc, sessions:[{h, createdAt, expiresAt, refreshedAt}]}` — `pw`·`rc` 는 `{alg:"scrypt", N, r, p, len, salt, hash, pep}` |
| `bn-sessions` | 토큰의 SHA-256 hex | `{id, uid, createdAt, expiresAt}` |
| `bn-saves` | `<uid>/slot1`·`slot2`·`slot3`, `<uid>/meta` | `{rev, savedAt, data}` 또는 묘비 `{rev, savedAt, deleted:true}`. Blobs 메타데이터 `{rev, savedAt, summary?, deleted?}` (목록은 본문 없이 메타데이터만 읽는다) |
| `bn-ratelimit` | `ip/auth/<망 해시>`, `ip/signup/<망 해시>`, `lock/login/<아이디>/all`, `lock/login/<아이디>/net/<망 해시>`, `lock/login/<아이디>/wide/<IPv6 /48 해시>`, `lock/login/<아이디>/ok/<망 해시>`, `lock/recover/<아이디>/net/<망 해시>` | 카운터 `{n, start, lockedUntil?, strikes?, struckAt?}` (`strikes` = 아이디 전체 잠금이 이어진 횟수), 믿는 망 `ok/…` = `{at}` — 망 = IPv4 주소 하나 또는 IPv6 /64 |

- **온라인 기록**(리더보드·일일 도전·고스트, `docs/specs/online.md`·`docs/ONLINE.md`)은 저장소 4개를 더 쓴다: `bn-boards`(보드별 순위 목록 `b/<보드 키>/i`, 계정의 최고 기록 `b/<보드 키>/e/<uid>` — 운영 도구용 로그인 아이디 포함, 기록을 둔 보드 표시 `u/<uid>/<보드 키>`), `bn-ghosts`(상위 20위 고스트 `<보드 키>/<uid>`), `bn-runs`(제출한 런 nonce `used/<시>/<nonce>`, 32시간), `bn-nicks`(별명 중복 방지 `<소문자 별명 hex>` = `{uid, id, nick, at}`). 사용자 레코드에는 공개 별명 `nick` 이 더해지고, `bn-ratelimit` 에는 계정별 카운터 `acct/<uid>/run-s|run-m|run-d|nick` 이 생긴다. 순위표 응답에는 별명만 보이고 로그인 아이디·uid 는 나가지 않는다.
- 익명 통계(`POST /api/t`·`GET /api/stats`)는 다섯 번째 저장소 `bn-telemetry` 를 쓰고 계정과 이어지지 않는다 — `docs/TELEMETRY.md` (망별 제한 카운터 `ip/tel/<망 해시>` 만 `bn-ratelimit` 에, 매일 정리 함수가 30일 지난 통계 원본도 지운다).
- `uid` 는 가입 때 만드는 무작위 128비트 내부 식별자다. 저장 데이터 키에 로그인 아이디 대신 `uid` 를 써서, 탈퇴 후 같은 아이디로 다시 가입해도 이전 데이터(혹시 남은 조각 포함)와 절대 섞이지 않는다.
- 세션 인증은 두 곳을 모두 확인한다: `bn-sessions` 에 토큰 해시가 있고, **그리고** 사용자 레코드의 `sessions` 목록에도 있으며 만료 전이어야 한다(목록이 기준). 그래서 중간에 지우기가 실패해도 폐기된 토큰이 되살아나지 않는다.
- 모든 쓰기는 ETag 조건부 쓰기(`onlyIfNew` / `onlyIfMatch`)로 경합을 막는다: 같은 아이디 동시 가입은 하나만 성공, 같은 `baseRev` 동시 저장도 하나만 성공한다.
- **기록 정리** (PS-05, `netlify/functions/cleanup.mts` → `netlify/lib/cleanup.mts`, 하루 한 번 예약 실행, URL 로는 부를 수 없다): Blobs 에는 만료(TTL)가 없어 지우지 않으면 무기한 쌓인다. `bn-ratelimit` 에서는 창(최장 1시간)이 끝나고 잠금도 풀린 지 2시간이 지난 카운터(잠금 점증 `strikes` 가 살아 있는 24시간 동안은 남긴다)와 90일이 지난 믿는 망 기록을, `bn-sessions` 에서는 만료된 지 30일이 지난 세션 저장값을 지운다(인증은 사용자 레코드의 만료 시각이 기준이라 저장값이 늦을 수 있어 여유를 둔다). 사용자 레코드의 `sessions` 목록은 다음 로그인 때 정리된다. 한 번에 저장소마다 4,000개까지 읽고(함수 시간 제한) 시작 위치를 날마다 바꾼다. 숫자는 `config.mts` 의 `CLEANUP`. 온라인 기록은 같은 함수가 32시간 지난 런 nonce(`bn-runs` — 가장 긴 유효 기간 30시간 + 2시간), 61일 지난 일일 도전 보드(순위 목록·기록·표시·고스트), 순위 목록에 표시가 없는 고스트, 주인이 없는 별명 항목을 지운다(`docs/ONLINE.md` §3). 계정별 하루 제출 카운터는 하루 창 뒤에 지운다.
- **보관하는 것**: 아이디, 비밀번호·복구 코드의 scrypt 해시, 세션 토큰의 SHA-256, 세이브·메타, 망(IPv4 주소 또는 IPv6 /64·/48)의 해시(`AUTH_PEPPER` HMAC) — 실패 카운터는 창이 끝난 뒤 하루 안에, 믿는 망은 90일 뒤, 세션 저장값은 만료 30일 뒤 지워진다. 온라인 기록: 공개 별명, 보드별 최고 기록(시간·점수·웨이브·영웅·직업·레벨·기록 시각 — 공개), 상위 20위 고스트(공개), 제출한 런 nonce(7시간). 원래 IP·요청 본문은 저장하지 않는다.
- **탈퇴 때 지우는 것** (`purgeAccount`): 세이브·메타, 그 계정의 모든 보드 기록·순위 목록 항목(계정 수도 줄인다)·고스트·보드 표시, 세션, 로그인·복구 잠금 기록, 계정별 제한 카운터, 별명 자리(`bn-nicks`), 사용자 레코드 — 그리고 도중에 들어온 쓰기를 치우려고 세이브와 보드 기록을 한 번 더 쓴다. 탈퇴 도중 끝난 기록 제출은 쓴 뒤 계정이 없으면 스스로 지운다. 일일 도전 보드는 61일 뒤 통째로 지워진다.
- 로컬 Blobs 서버(`netlify dev`)는 키를 파일 경로로 저장하므로 한 키가 다른 키의 경로 앞부분이 되면 안 된다(`lock/login/<아이디>` 와 `lock/login/<아이디>/…` 를 함께 쓰지 않고 `…/all` 을 쓰는 이유).

## 5. 보안 설계

- **비밀번호 해시**: `node:crypto` scrypt, **N=2^15, r=8, p=3**(32MiB — OWASP 비밀번호 저장 지침의 scrypt 최소 기준과 같은 비용, 이 컨테이너에서 한 번에 약 0.24초), 32바이트 무작위 salt, 64바이트 키. 매개변수를 해시와 함께 저장하고 `timingSafeEqual` 로 비교한다. 매개변수나 pepper 설정이 바뀌면 다음 로그인 성공 때 자동으로 다시 해시한다(바뀌기 전 가벼운 해시를 검증할 때도 현재 매개변수 한 번만큼 시간을 함께 써서, 재해시 전 계정이 있는지 응답 시간으로 드러나지 않게 한다). 비밀번호는 NFC 로 정규화한 뒤 해시한다(기기마다 한글 조합 방식이 달라도 같은 값).
- **복구 코드**: 80비트 무작위, 비밀번호와 같은 scrypt 로 해시만 저장. 1회용.
- **세션 토큰**: 32바이트 무작위(base64url). 서버에는 SHA-256 만 저장한다. 30일(로그인 유지 끔: 12시간) 만료 + 슬라이딩 연장, 사용자당 10개. 토큰은 로그인·가입·복구 때 서버가 새로 만들며 클라이언트가 정할 수 없다(세션 고정 불가). 폐기된 세션의 저장값은 연장 중에도 되살아나지 않는다.
- **계정 존재 여부 숨김**: 로그인·복구는 아이디가 없을 때도 가짜 scrypt 를 돌려 시간과 응답 본문이 같다. 없는 아이디도 실패 횟수를 세고 똑같이 잠긴다. (가입은 성격상 `id_taken` 을 알려 줄 수밖에 없으므로 망별 제한으로 대량 조회를 막는다.)
- **비밀번호 추측 제한** (Blobs 에 저장, 고정 창). '망' = IPv4 주소 하나 또는 IPv6 /64 (한 가입자는 보통 /64 전체를 받으므로 주소 하나씩 세면 주소만 바꿔 무한히 우회된다. `::ffff:a.b.c.d` 는 IPv4 로 본다):
  - 아이디+망: 비밀번호(로그인, 비밀번호 변경·탈퇴 때의 지금 비밀번호 확인) 10분 안에 5회 실패 → **그 망에서만** 10분 잠금. 잠긴 동안은 맞는 비밀번호도 거부. 성공하면 그 망의 기록 초기화. 다른 망에 있는 주인은 영향을 받지 않는다(아이디만 알면 누구나 주인을 잠가 버리던 잠금 악용 방지).
  - 아이디+IPv6 /48: 1시간에 10회 실패 → 그 /48 에서 30분 잠금. VPS 한 대가 받는 /48 에는 /64 가 65,536개 있어, /64 만 세면 /48 하나로 아이디 전체 한도를 채워 주인을 잠글 수 있었다(PS-04).
  - 아이디 전체(모든 망 합계): 1시간에 20회 실패 → **믿는 망이 아닌 곳에서** 잠금 (여러 IP 로 나눠 추측하는 공격 방지). 잠금은 2분에서 시작해 24시간 안에 다시 잠길 때마다 두 배(4·8분), 상한 10분 — 예전의 30분 고정 잠금은 망만 여럿이면 30분마다 20번으로 주인을 무기한 막을 수 있었다. 24시간 동안 잠기지 않으면 다시 2분부터. 성공한 시도는 이 수에서 빠진다.
  - **믿는 망**: 이 아이디로 가입·로그인·복구(비밀번호 변경·탈퇴 확인 포함)에 성공한 망(IPv4 주소 또는 IPv6 /64, 그리고 그 /48)은 90일 동안 아이디 전체 잠금을 받지 않는다(믿는 /64 는 /48 잠금도 받지 않는다). 그래서 공격자가 망을 아무리 늘려도 주인은 평소 쓰던 곳에서 로그인·비밀번호 변경·탈퇴 확인을 할 수 있다. 망별 5회 한도는 믿는 망에도 그대로다. 처음 보는 망의 주인은 잠금(최대 10분)을 기다리거나 복구 코드를 쓴다.
  - 복구 코드: 아이디+망 10분에 5회 실패 → 그 망에서 10분 잠금 (코드가 80비트라 전체 한도는 두지 않는다). 복구에 성공하면 그 아이디의 모든 로그인·복구 잠금이 풀린다 — 잠금 공격을 받는 중에도 주인은 복구 코드로 바로 들어올 수 있다.
  - **확인 전에 자리를 잡는다**: 시도마다 비밀번호를 확인하기 *전에* 조건부 쓰기로 카운터를 1 올리고(한도가 찼으면 거절), 실패하면 그대로 두어 실패 1회로 치고, 한도째 시도가 실패하면 잠근다. 예전처럼 '잠겼나 확인 → 확인 → 실패 기록' 순서면 동시 요청 수십 개가 모두 첫 단계를 통과해 한도보다 훨씬 많이 확인된다(시험: 한 망에서 동시 12개 → 12번 확인, 여러 IP 동시 40개 → 40번 확인. 지금은 5번·20번).
  - 망별: 인증 시도(가입·로그인·복구·비밀번호 변경·탈퇴) 10분에 20회, 가입 1시간에 5개(가입 자리도 원자적으로 잡고 실패하면 돌려준다 — 동시 가입으로 한도를 넘지 못한다). 망은 원문 대신 해시(`AUTH_PEPPER` 가 있으면 HMAC)로만 저장한다.
  - IP 는 Netlify 가 채우는 `context.ip` 만 쓴다. `X-Forwarded-For`·`x-nf-client-connection-ip` 등 요청 헤더는 클라이언트가 위조할 수 있으므로 절대 쓰지 않는다(없으면 모두 하나의 'unknown' 묶음으로 센다).
  - 숫자는 `netlify/lib/config.mts` 의 `RATE` 에서 바꾼다. PC방·학교처럼 여러 명이 IP 하나를 쓰는 곳에서 막히면 `ipAuthMax` 를 올린다.
- **흔한 비밀번호 거부**: 온라인 추측 제한만으로는 `12345678`·`qwer1234`·`1q2w3e4r` 같은 비밀번호가 하루 안에 뚫릴 수 있어 가입·변경·복구 때 `weak_password` 로 막는다.
- **다른 사이트에서 오는 요청**: 본문이 있는 요청은 `Content-Type: application/json` 만 받고(415), `Sec-Fetch-Site: cross-site` 는 거절한다(403). CORS 헤더는 두지 않는다 — 다른 출처의 사전 확인(OPTIONS)은 405 로 끝난다. 예외는 안드로이드 앱 출처 `https://appassets.androidplatform.net` 하나(`router.mts` `APP_ORIGINS`, 프록시가 없는 옛 앱이 공식 사이트를 직접 부를 때): 이 출처는 안드로이드 WebView 만 쓸 수 있어 일반 웹페이지가 흉내 낼 수 없고, 앱이 아닌 프로그램은 어차피 CORS 없이 요청할 수 있으므로 새 공격 경로가 생기지 않는다. 토큰은 쿠키가 아니라 `Authorization` 헤더로만 오간다(자동으로 붙지 않는다).
- **입력 검사**: 라우트·메서드 엄격 확인(404/405), 본문 크기를 실제로 세어 제한, UTF-8·JSON 오류는 400, JSON 은 파싱 전에 중첩 깊이를 재어 64단계 초과는 400(수십만 겹 배열로 뒤의 재귀 처리를 넘치게 하는 DoS 방지), 슬롯 번호는 `1|2|3` 만, 세이브는 `isValidSave` 와 같은 구조 검사(테스트가 무작위 변형 400개로 클라이언트 함수와 결과가 같은지 확인한다). 세이브·메타 `data` 는 32단계 이하, `__proto__` 키 금지(422 — 클라이언트가 합치거나 대입할 때 프로토타입이 바뀌는 것 방지).
- **경합**: 로그인이 옛 비밀번호를 확인한 뒤 세션을 만들기 전에 다른 기기가 비밀번호를 바꾸면, 그 로그인은 세션을 받지 못한다(예전: 비밀번호 변경의 '다른 세션 폐기' 뒤에 붙어 살아남았다). 로그인 재해시는 확인한 비밀번호가 그대로일 때만 쓴다(예전: 방금 바뀐 새 비밀번호를 옛 비밀번호로 되돌릴 수 있었다). 비밀번호 변경은 그사이 다른 변경이 있었으면 `wrong_password`. 탈퇴는 사용자 레코드를 지운 뒤 세이브를 한 번 더 쓸고, 세이브 쓰기는 쓴 뒤 계정이 아직 있는지 확인해 없으면 방금 쓴 것을 지운다(탈퇴한 계정의 세이브가 남지 않는다).
- **배포 문맥**: 운영(`production`)은 사이트 전역 저장소, 그 밖(미리보기·브랜치·dev)은 배포별 저장소. 배포 문맥을 알 수 없으면 어떤 저장소도 열지 않고 500(운영 요청이 배포별 저장소에 쓰면 다음 배포 때 데이터가 사라지고, 미리보기 요청이 운영 저장소에 쓰면 섞이므로).
- **응답·로그**: 스택 트레이스나 내부 정보는 응답에 넣지 않는다(500 은 일반 메시지만). 로그에는 오류 종류와, URL·메일·IPv4/IPv6·토큰·해시·키처럼 보이는 긴 문자열을 가린 문구만 남긴다(Netlify Blobs 오류에는 저장소 응답 본문이 붙을 수 있다). 비밀번호·토큰·복구 코드·IP·요청 본문은 남기지 않는다.
- **API 응답 헤더**: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`, `nosniff`, `no-store` (`netlify.toml` 의 `[[headers]]` 는 정적 파일에만 적용되므로 함수가 직접 붙인다).
- **정적 사이트 헤더**(`netlify.toml`, 게시 폴더 `dist/web` 의 모든 파일; 함수 응답에는 적용되지 않는다): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`(gamepad·fullscreen·screen-wake-lock·autoplay 는 self, camera·microphone·geolocation·payment·usb 는 막음), `Cross-Origin-Opener-Policy: same-origin`, `Strict-Transport-Security: max-age=31536000`(includeSubDomains 없음), `X-Frame-Options: SAMEORIGIN`, CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`.
  - **`script-src 'self'` 만**: 인라인 스크립트가 없다 — 부팅 관문은 `src/boot-gate.js`, 빌드 정보(`window.__BN_BUILD`)는 빌드가 만드는 파일 `build-info.js`, 나머지는 모듈이다. `'unsafe-inline'`·외부 호스트는 넣지 않는다(`build_web.mjs` 가 `script-src 'self'` 가 아니면 빌드를 멈춘다). 로그인 토큰이 브라우저 저장소에 있으므로 XSS 는 곧 토큰 탈취다.
  - **글꼴**: 모두 자체 파일(`assets/fonts`, `font-src 'self'`) — Google Fonts 같은 외부 글꼴·스타일시트는 쓰지 않는다.
  - `style-src` 의 `'unsafe-inline'` 은 계정 화면이 넣는 `<style id="bn-account-style">` 과 캔버스 코드의 `element.style` 때문에 필요하다(스크립트 실행 권한은 아니다).
  - **개발 파일 차단**: 예전의 강제 404 리디렉트(`/tools`, `/docs`, `/netlify`, `/android`, `/node_modules`, `/.git` …)는 없앴다. 게시 폴더 `dist/web` 는 `tools/deploy/build_web.mjs` 가 **허용 목록**(`index.html`, `build-info.js`, `manifest.webmanifest`, `sw.js`, `robots.txt`, `css/`, `src/`(부팅 관문 + 번들 조각), `assets/`(`lo/`·`fonts/` 포함), `downloads/`)으로만 만들고, `tools|docs|android|node_modules|netlify|dist|.git` 경로나 `*.keystore *.jks *.p12 *.properties .env*` 가 섞이면 빌드가 실패하고 출력 폴더를 지우므로 그런 경로는 처음부터 사이트에 없다(`smoke_deployed.mjs` 가 404 인지 확인한다).
- **캐시**(`netlify.toml`): `/`·`/index.html`·`/sw.js`(+`Service-Worker-Allowed: /`)·`/build.json`·`/build-info.js` 는 `no-cache`(매번 재검증). 번들 조각 `/src/bundle/<내용 해시>/*` 는 폴더 이름이 내용 해시라 `public, max-age=31536000, immutable`. `/src/boot-gate.js`·`/css/*`·`/assets/*`(그림·글꼴·리그 JSON)는 파일 이름에 해시가 없어 `public, max-age=0, must-revalidate`(ETag 재검증 — 한 배포의 아틀라스와 다른 배포의 리그가 섞이지 않게). 재방문 속도는 서비스 워커가 맡는다: 코드·CSS·글꼴은 `bn-<빌드 해시>` 캐시, 그림은 `bn-assets-v1` 캐시에서 주되 저장할 때 붙인 내용 해시를 `build.json` 의 해시와 비교해 다르면 새로 받는다. 매니페스트 1시간, `/downloads/*.apk` 5분(첨부), `/downloads/latest.json` `no-cache`. `/api/*` 는 함수가 `no-store` 를 붙이고, 서비스 워커는 `/api/`·`/downloads/`·`build.json`·`sw.js` 를 건드리지 않는다.
- **전송**: Netlify 가 HTTPS 를 강제한다. 토큰은 `Authorization` 헤더로만 오가고 쿠키를 쓰지 않는다. 클라이언트는 토큰을 '로그인 유지'면 `localStorage`, 아니면 `sessionStorage` 에 두므로 XSS 가 곧 토큰 탈취다 — CSP 를 느슨하게 만들지 말 것.

## 6. 환경 변수

Blobs 는 Netlify 가 자동으로 연결한다. **`AUTH_PEPPER` 는 운영 배포 전에 반드시 넣는다** — 코드는 없어도 동작하지만(개발·시험용), 그러면 망 해시가 소금 없는 SHA-256 이라 IPv4 는 전수 대입으로 되돌릴 수 있고(아이디와 IP 가 이어진다), Blobs 가 유출되면 비밀번호 해시를 오프라인으로 추측할 수 있다. 없으면 함수가 인스턴스마다 한 번 `[api] 경고: AUTH_PEPPER 환경 변수가 없습니다 …` 를 로그에 남긴다(Netlify 함수 로그에서 확인). 배포 순서는 `docs/RELEASE.md` §2.

| 이름 | 필수 | 설명 |
|---|---|---|
| `AUTH_PEPPER` | **운영 필수** | 설정하면 비밀번호·복구 코드를 `HMAC-SHA256(pepper)` 한 뒤 scrypt 하고, IP 해시에도 쓴다. Blobs 데이터가 유출돼도 pepper 없이는 오프라인 추측이 불가능해진다. 32자 이상 무작위 문자열을 Netlify 환경 변수(범위: Functions)에 넣는다. **한 번 넣은 뒤 바꾸거나 지우면 그 뒤로 해시된 계정은 로그인할 수 없다**(오류 없이 "비밀번호가 올바르지 않습니다"가 된다). 처음 넣는 것은 언제든 괜찮다 — 기존 계정은 다음 로그인 때 자동으로 옮겨진다. 값 만들기·넣는 곳은 `tools/deploy/README.md` §3, 넣거나 바꾼 뒤에는 다시 배포해야 함수에 적용된다. 운영 도구(`tools/accounts/admin.mjs`)도 같은 값을 쓴다(§8). |

코드는 환경 변수를 `Netlify.env.get()` 으로만 읽는다.

## 7. 배포

자세한 절차와 명령은 `tools/deploy/README.md` §3 이 기준이다. 요점:

1. **저장소 루트를 절대 올리지 않는다** (`netlify deploy --dir .` 금지 — 서명 키·개발 도구·문서가 섞인다). 게시하는 것은 `dist/web` 뿐이다.
2. `node tools/deploy/build_web.mjs` → `dist/web`(허용 목록으로 만든 게시 폴더, §5) + `dist/deploy`(Netlify 업로드 묶음: `web/` = dist/web, 계정 API 소스 `netlify/functions`·`netlify/lib`, 개발 의존성을 빼고 시험한 버전으로 고정한 `package.json` + 루트 잠금 파일에서 개발 전용 항목을 뺀 `package-lock.json`(Netlify 가 배포 때마다 다른 버전을 받지 않게), `publish = "web"` 이고 빌드 명령이 없는 `netlify.toml`). 글꼴·맵 검사나 공개 금지 검사가 실패하면 빌드가 멈춘다.
3. 올리기 (둘 중 하나):
   - 이미 만든 결과: `dist/deploy/` 를 올린다 (Netlify MCP 로 배포 폴더를 넘기거나 `cd dist/deploy && npx netlify deploy --prod --dir web --functions netlify/functions --site <사이트 ID>`).
   - Git 연동 빌드: 저장소의 `netlify.toml` 이 `[build] command = "node tools/deploy/build_web.mjs --no-apk --no-deploy-bundle"`, `publish = "dist/web"`, 함수 디렉터리 `netlify/functions`, `NODE_VERSION = "22"` 로 같은 결과를 만든다.
   - 두 경우 모두 Netlify 가 함수 의존성(`@netlify/blobs`, `@netlify/functions`)을 설치하고 `api.mts`·`cleanup.mts`(하루 한 번 도는 예약 함수, §4 기록 정리) 를 번들한다. `netlify/lib/*.mts` 는 함수가 import 해서 함께 번들되며 따로 함수가 되지 않는다. `/api/*` 는 함수의 `config.path` 가 맡는다(`_redirects` 에 넣지 않는다).
4. **`AUTH_PEPPER`**(운영 필수 — **첫 운영 배포 전에**): `tools/deploy/README.md` §3 의 방법으로 만든 32자 이상 무작위 값을 Netlify 사이트 설정 → Environment variables 에 범위 **Functions** 로 넣고 다시 배포한다. 값은 저장소·문서·채팅에 적지 않는다. 한 번 넣은 뒤에는 바꾸거나 지우지 않는다(§6).
5. 확인: `node tools/deploy/smoke_deployed.mjs https://<사이트>` — 헤더(CSP·캐시), 빌드 일치, 공개 금지 경로 404, `/api/health` = `{"ok":true,"api":1,...}`·`no-store`, 앱 출처 CORS 사전 요청, 서비스 워커가 `/api/` 를 캐시하지 않음, 페이지 오류 0 (APK 없이 배포했다면 `--no-apk`).
6. 사이트 주소가 정해지거나 바뀌면 `src/core/cloud.js` 의 `APP_API_BASE` 와 `tools/apk/api_origin.txt` 를 같은 사이트로 맞추고 APK 를 다시 만든다(§1).
7. 로컬에서 Netlify 환경 그대로 시험하려면 `npx netlify dev` (이때 데이터는 배포별 저장소라 운영과 분리된다). 게시 폴더만 시험할 때는 `node tools/deploy/serve_dist.mjs`(API 없음 → 계정 기능은 꺼진다).

## 8. 운영

HTTP API 에는 관리자 기능이 없다. 운영자는 Netlify 개인 액세스 토큰으로 운영 저장소에 직접 접근하는 도구를 쓴다.

```bash
export NETLIFY_SITE_ID=<사이트 ID>          # Netlify 사이트 설정 > Site details
export NETLIFY_AUTH_TOKEN=<개인 액세스 토큰>  # User settings > Applications
# export AUTH_PEPPER=<운영과 같은 값>        # 쓰고 있다면 (없어도 동작, 첫 로그인 때 재해시)

node tools/accounts/admin.mjs show   hunter_01   # 생성일, 세션 수, 잠금 상태, 슬롯 요약 (해시·토큰은 안 보임)
node tools/accounts/admin.mjs unlock hunter_01   # 로그인·복구 잠금 해제
node tools/accounts/admin.mjs revoke hunter_01   # 모든 기기 로그아웃
node tools/accounts/admin.mjs reset  hunter_01   # 임시 비밀번호 + 새 복구 코드 발급, 모든 세션 폐기, 잠금 해제
node tools/accounts/admin.mjs delete hunter_01 --yes   # 계정과 저장 데이터 전부 삭제 (순위 기록·고스트·별명 포함)
node tools/accounts/admin.mjs board practice:s01:normal       # 순위표 (별명 + 로그인 아이디) — 온라인 기록 운영은 docs/ONLINE.md §4
node tools/accounts/admin.mjs board-remove practice:s01:normal 1 --yes   # 그 순위 계정의 기록·고스트 삭제
node tools/accounts/admin.mjs nick 나쁜별명                     # 별명을 자동 별명으로 (또는 nick <아이디> <새 별명>)
```

- **비밀번호를 잊은 사용자**: 먼저 복구 코드로 스스로 재설정하게 안내한다(`POST /api/auth/recover`). 복구 코드도 잃어버렸다면 본인 확인(예: 가입 시기, 캐릭터·진행 상황을 `show` 결과와 대조)을 한 뒤 `reset` 을 실행하고, 출력된 임시 비밀번호와 새 복구 코드를 그 사용자에게만 전달한다. 사용자는 로그인 후 비밀번호를 바꾸게 한다.
- **잠김 문의**: 10분 뒤 자동으로 풀린다. 급하면 `unlock`.
- **기기를 잃어버림**: `revoke` (또는 사용자가 비밀번호를 바꾸면 다른 세션이 모두 폐기된다).
- Netlify CLI 로 원시 데이터를 볼 수도 있다: `netlify blobs:list bn-users`, `netlify blobs:get bn-users <아이디>` (해시가 보이므로 외부에 공유하지 말 것). 사용자 레코드를 손으로 고치지 말고 위 도구를 쓴다.
- 백업: `bn-users` 와 `bn-saves` 를 `netlify blobs:list/get` 으로 내려받아 보관한다(순위를 지키려면 `bn-boards`·`bn-nicks` 도). `bn-sessions`·`bn-ratelimit` 는 백업할 필요가 없다(비워도 모두 다시 로그인하면 끝).
- 만료된 세션·지난 제한 기록은 로그인·요청 때 필요한 만큼만 정리된다. 쌓인 `bn-ratelimit` 키는 전부 지워도 안전하다.

## 9. 테스트

```bash
npm run test:api                                   # 메모리 저장소 + 실제 @netlify/blobs(로컬 BlobsServer) 두 모드
node tools/accounts/test_api.mjs --mode=memory     # 한 모드만
node tools/accounts/test_api.mjs --filter=복구      # 이름에 '복구'가 들어간 테스트만
npm run test:client                                # 브라우저(헤드리스 Chromium) 클라이언트 테스트
```

- 핸들러를 `Request`/`Context` 로 직접 부른다(Node 22.18+ 가 `.mts` 의 타입을 지우고 바로 실행). 시계는 `setClock` 으로, 저장소는 `setStoreFactory` 로 바꿔 끼운다(`netlify/lib/runtime.mts`). 해시 비용은 `setHashCostForTests` 로 낮춰 빠르게 돌리고, 매개변수를 확인하는 테스트(`realHash`)만 운영 값으로 돈다(HTTP·환경 변수로는 바꿀 수 없다).
- '공격:'·'경합:' 테스트는 보안 검토에서 찾은 문제를 재현한다: 동시 요청으로 잠금·가입 한도 우회(저장소 연산 가로채기 `hook` 으로 요청을 한 줄로 세운 뒤 한꺼번에 풀고, scrypt 호출 수로 실제 비밀번호 확인 횟수를 센다), 잠금 악용, 분산 추측, CSRF(text/plain·cross-site), IPv6 주소 돌리기, IP 헤더 위조, 비밀번호 변경·재해시·탈퇴 경합, 깊은 JSON·`__proto__`, 로그 가리기, 응답 헤더, 흔한 비밀번호, scrypt 매개변수·옛 해시 올리기, 로그인 유지, 모든 기기 로그아웃, 배포 문맥 없음.
- `tools/accounts/test_client.mjs`: 헤드리스 Chromium 에서 게임을 `https://game.test`(공식 사이트 역할)·`https://claude.ai`(임베드 역할)로 열고 `netlify.toml` 의 CSP 를 그대로 붙여, 게스트 요청 0건·claude.ai 요청 0건·오프라인 안내·'로그인 유지' 켬/끔(저장 위치·서버 세션 길이·새 창)·로그아웃과 흔적 삭제·모든 기기 로그아웃(오프라인이면 유지하고 알림)·약한 비밀번호 사전 차단·시험 주소 덮어쓰기·형식이 틀린 응답 거부, 안드로이드 앱 흉내(`https://appassets.androidplatform.net` + `window.__BN_APP`)에서 프록시가 켜져 있으면 같은 출처 `/api` 만 부르고 프록시 없는 옛 앱만 공식 사이트를 앱 출처 CORS 로 부르는지를 확인한다. `test_api.mjs` 의 '클라이언트:' 테스트는 `pickApiBase` 의 모든 경우(웹·앱 프록시·옛 앱·시험용 덮어쓰기·다른 출처 값 무시)를 확인한다.
- 모든 엔드포인트와 오류 경로(404/405, 깨진 JSON, 크기 제한, 아이디·비밀번호 규칙, 잠금, IP 제한, 세션 만료·연장·최대 10개, 복구 코드 1회성, 탈퇴 후 재가입, rev 충돌·force·묘비, 동시 저장, 배포 문맥 분리, 저장소 장애 시 500, 평문 비밀이 저장소에 없음)를 확인한다.
- 로컬 BlobsServer 는 읽기 응답에 ETag 를 주지 않아 그 모드에서는 조건부 쓰기 대신 덮어쓰기로 동작한다(운영 Netlify Blobs 는 ETag 를 준다). 동시성 테스트는 메모리 모드에서만 돈다.

## 10. 게임 클라이언트

| 파일 | 내용 |
|---|---|
| `src/core/cloud.js` | API 클라이언트(`cloud`): 사용 가능 판단, API 주소 선택(`pickApiBase` — 웹·앱 프록시는 `/api`, 프록시 없는 옛 앱만 `APP_API_BASE`), 토큰, 요청(시간 제한·JSON·오프라인), 슬롯·메타 동기화, 입력 검사(서버 규칙과 같음) |
| `src/core/save.js` | `saves.onWrite(fn)` — 슬롯 저장·삭제·가져오기·메타 저장 알림 / `saves.store(slot, data)` — 받은 기록을 `savedAt` 그대로 저장(알림 없음) |
| `src/scenes/front/account.js` | 계정 화면 `account`: 로그인·회원가입(복구 코드 1회 표시·복사)·비밀번호 변경·복구 코드로 재설정·로그아웃·계정 삭제·지금 동기화. 서버를 못 쓰면 안내 |
| `src/scenes/front/cloud_ui.js` | 구름 상태 아이콘·문구, 세이브 요약 카드, 충돌 선택 `cloudConflict` |
| `src/scenes/title.js` · `front/slots.js` · `menu/tab_system.js` | 타이틀 '계정' 메뉴와 오른쪽 위 아이디(또는 '게스트') 표시 · 슬롯별 구름 상태와 받기/올리기 · 일시정지 메뉴의 클라우드 칸('지금 동기화' / '로그인') |

- **켜지는 곳**: `https:` 또는 `localhost` 의 `http:` 이고 호스트가 claude.ai 계열(`claude.ai`, `*.claudeusercontent.com` 등)이 아닐 때. 그 밖(claude.ai 임베드, `file://`, 사설 IP 의 http)에서는 요청을 한 번도 보내지 않고 계정 화면에 "공식 사이트와 앱에서 사용할 수 있다, 이 기기 저장은 그대로 쓸 수 있다"는 안내를 띄운다. 시험할 때는 `localStorage.bn_api_base = '/api'` 로 호스트 검사를 건너뛴다.
- **게스트는 요청 0건**: 로그인한 적이 없으면 계정 화면을 열 때 `GET /api/health` 한 번만 부른다. 로그인해 둔 기기는 시작할 때 `GET /api/auth/me` 로 확인한 뒤 동기화한다.
- **'로그인 유지'**: 로그인·가입 화면의 체크 칸. 켜면 토큰을 `localStorage.bn_auth` 에 두고 서버 세션 30일, 끄면 `sessionStorage.bn_auth`(이 탭에서만 — 새로 고침은 유지, 창을 닫으면 사라짐) + 서버 세션 12시간. 선택은 `localStorage.bn_remember`(`'1'`/`'0'`)에 기억하고, 처음 기본값은 안드로이드 앱(`appassets.androidplatform.net`)·터치 기기는 켬, 데스크톱 브라우저(PC방·학교 등 공용일 수 있음)는 끔. 복구 코드로 재설정할 때는 기억한 선택을 쓴다. 저장된 값은 아이디·토큰 형식이 맞을 때만 쓰고, 틀리면 지운다. 서버 응답의 아이디·토큰 형식이 틀려도 저장하지 않는다.
- **로그아웃**: '로그아웃'은 이 기기만(서버에 닿지 못하면 이 기기에서만 로그아웃하고 그렇게 알린다 — 서버 세션은 만료까지 남는다), '모든 기기에서 로그아웃'은 서버에 `{all:true}` 를 보내 이 계정의 모든 세션을 끊는다(서버에 닿지 못하면 로그인 상태를 그대로 두고 알린다). '로그인 유지'를 끄고 쓰다가 직접 로그아웃하면 그 아이디의 동기화 기록도 지운다(공용 기기에 아이디가 남지 않게).
- **받은 데이터 정리**: 서버에서 받은 세이브·메타와 합친 메타는 `sanitizeTree` 로 `__proto__`·`constructor`·`prototype` 키를 버리고 32단계보다 깊은 부분을 자른 복사본만 쓴다(`game.meta` 에 대입할 때 프로토타입이 바뀌지 않게).
- **요청**: `fetch` 는 `credentials:'omit'`, `redirect:'error'`, `referrerPolicy:'no-referrer'`, `cache:'no-store'`. 시험용 `localStorage.bn_api_base` 는 같은 출처의 절대 경로('/api')만 받는다 — 다른 사이트 주소를 넣어도 무시한다(공용 기기에 누군가 심어 두어도 비밀번호·토큰이 밖으로 가지 않게).
- **저장 위치**: 토큰 `bn_auth = {id, token}` ('로그인 유지'면 localStorage, 아니면 sessionStorage), 동기화 기록 `localStorage.bn_cloud_sync = {<아이디>: {slots: {1: {rev, at, dirty?, del?, forceAfter?}}, meta: {rev, hash}}}` (`rev` = 마지막으로 맞춘 서버 rev, `at` = 그때 이 기기 기록의 `savedAt`). 받은 기록이 이 기기 기록을 덮을 때는 이전 것을 `bloodnocturne_slot_<N>_backup` 에 한 벌 남긴다.
- **슬롯 판정**(`classifySlot`): 서버 `summary.clientSavedAt` 이 이 기기 `savedAt` 과 같으면 동기화됨. 아니면 동기화 기록과 비교해 기기가 최신(서버는 그대로) / 서버가 최신(이 기기는 그대로) / 충돌(둘 다 바뀜 또는 기록 없음). 데이터를 잃지 않는 경우만 자동으로 처리한다 — 비어 있는 쪽 채우기, 한쪽만 바뀐 경우 맞추기, 이 기기에서 지운 슬롯을 클라우드에서도 지우기(같은 rev 일 때만). 충돌은 슬롯 화면에서 두 기록(캐릭터·레벨·진행·플레이 시간·저장 시각)을 나란히 보여 주고 사용자가 고른다(`force:true` 는 이때만).
- **언제 동기화하나**: 로그인·가입·복구 직후, 앱 시작(토큰이 있으면), 세이브 슬롯 화면을 열 때, '지금 동기화', 인터넷이 다시 연결될 때. 로그인 중 슬롯을 저장하면(`saves.write` 가 불리는 모든 곳) 2초 뒤 그 슬롯만 올린다(연속 저장은 한 번으로 묶음). 모든 서버 작업은 한 줄로 실행되며 게임을 멈추지 않는다.
- **게임 중인 슬롯은 받지 않는다**: 맨 아래 장면이 타이틀·슬롯·계정·설정·난이도·캐릭터 선택·아케이드·명예의 전당·크레딧이 아니면 `game.state.slot` 에는 클라우드 기록을 받지 않고 알리기만 한다(받아 버리면 메모리의 진행이 다음 저장 때 다시 덮어쓰기 때문).
- **새 계정**은 이 기기의 기록을 모두 올린다. **기존 계정으로 로그인**하면 클라우드 전용 슬롯은 받아 오고, 이 기기에만 있는 슬롯은 올릴지 묻는다.
- **메타**는 덮어쓰지 않고 합친다: 해금 캐릭터·엔딩은 합집합, 클리어 수·서바이벌 최고 기록은 큰 값, 도감은 항목별 큰 값, 명예의 전당은 두 목록을 합쳐 모드별 상위 20개(스토리 모드는 회차 `run` 당 한 줄), 보스 러시는 코스별 최단 기록, 무한의 탑은 난이도별 최고 층, 업적 `ach` 는 `mergeAch`(달성 합집합·가장 이른 시각, 누적값 큰 값, 받은 보상 합집합, 고른 이명·장식은 이 기기 우선 — 한쪽에만 있어도 남긴다; 올리기 전 `cleanAch` 가 서버 검사를 늘 통과하는 사본을 만든다). 업적을 모르는 옛 클라이언트는 `{...서버, ...기기}` 로 합치므로 자기 쪽에 `ach` 가 없으면 서버 것을 지우지 않는다(예전에 받아 둔 오래된 `ach` 를 다시 올리면 다른 기기의 새 달성이 잠시 빠질 수 있고, 새 클라이언트가 다음 동기화에서 합집합으로 되돌린다). 마지막 캐릭터·이니셜·아케이드 설정 같은 기기 설정은 이 기기 값이 우선.
- **입력 칸**: 캔버스 위에 실제 `<input>`(아이디 `autocomplete=username`, 비밀번호 `current-password`/`new-password`, `autocapitalize=off`)을 `<form>` 에 넣어 띄운다 — 모바일 키보드·비밀번호 관리자가 동작한다. 스타일은 JS 가 넣는 `<style id="bn-account-style">`. `core/input.js` 는 글자를 입력할 수 있는 요소(읽기 전용 제외)에서 누른 키를 게임 키로 쓰지 않는다.
- **안드로이드 앱**: 앱의 /api 프록시가 켜져 있으면(`window.__BN_APP.apiProxy === true`) 웹과 똑같이 같은 출처 `fetch('/api/...')` 를 쓰고, 앱 조각이 감싼 `fetch` 가 본문·헤더를 `BNAndroid.apiStash` 로 맡겨 프록시로 보낸다(§1). 프록시가 없는 옛 앱에서만 `APP_API_BASE` 를 직접 부른다(앱 출처 CORS). 주소 선택은 `pickApiBase(location, window.__BN_APP, localStorage.bn_api_base)` 한 곳이다. `cloud.js` 는 요청할 때마다 `fetch` 를 새로 찾으므로 감싼 것이 그대로 쓰인다. 서버는 기기에서 바로 오는 요청으로 보므로 IP 제한은 기기마다 따로 센다. 프록시가 서버에 닿지 못하면(`X-BN-Proxy-Error`) 네트워크 오류가 되어 웹의 오프라인과 같은 안내·재시도를 탄다. 화면 키보드 높이는 `window.__BN_IME`(API 30+)를 쓰고, 없으면 계정 화면이 어림값을 쓴다.

