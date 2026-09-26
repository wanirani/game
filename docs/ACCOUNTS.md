# 계정 · 클라우드 저장 API (블러드 녹턴)

플레이어가 **아이디 + 비밀번호**로 계정을 만들고, 세이브 슬롯 1~3과 전역 기록(메타)을 서버에 저장해 여러 기기에서 이어 하는 기능의 서버 쪽 설계서다.
Netlify Functions(모던 함수, TypeScript) + Netlify Blobs 로 동작하며, 별도의 DB나 필수 환경 변수 없이 배포만 하면 켜진다.

| 항목 | 위치 |
|---|---|
| 함수 진입점 (`/api/*`) | `netlify/functions/api.mts` |
| 공용 코드 (함수로 배포되지 않음) | `netlify/lib/*.mts` — `config` 상수, `http` 응답·본문, `runtime` 저장소·시계·환경, `crypto` 해시·토큰, `validate` 입력 검사, `ratelimit` 요청 제한, `accounts` 계정, `saves` 저장, `router` 라우팅, `admin` 운영 도구 |
| 배포 설정 | `netlify.toml` (publish = 저장소 루트, 보안·캐시 헤더, 개발 파일 차단) |
| 테스트 | `node tools/accounts/test_api.mjs` (= `npm run test:api`) |
| 운영 도구 | `node tools/accounts/admin.mjs` |

## 1. 동작 환경

- **웹(Netlify)**: 게임과 API 가 같은 출처다. 클라이언트는 `fetch('/api/...')` 로 부른다. CORS 헤더는 두지 않는다.
- **안드로이드 APK**: WebView 가 `https://appassets.androidplatform.net/` 에서 게임을 열고, `/api/*` 요청을 앱이 Netlify 사이트로 대신 전달한다. 그래서 브라우저 입장에서는 항상 같은 출처 요청이다. 클라이언트는 반드시 **절대 경로 `/api/...`** 를 써야 한다 (`api/...` 처럼 상대 경로로 쓰면 `/assets/api/...` 처럼 엉뚱한 곳으로 간다).
- **claude.ai 임베드**: CSP 가 다른 호스트 요청을 막아 API 에 닿지 않는다. 클라이언트는 `GET /api/health` 가 실패하면(네트워크 오류, JSON 이 아님, `ok` 가 아님) 계정 기능을 숨기고 로컬 저장만 쓴다. `node tools/serve.mjs` 로 띄운 로컬 서버에도 API 가 없으므로 같은 방식으로 꺼진다.
- **서비스 워커**(`sw.js`)는 `/api/` 요청을 가로채거나 캐시하지 않는다.

## 2. 공통 규칙

- 요청·응답 본문은 UTF-8 JSON. 모든 응답은 `{ ok: boolean, ... }` 이고, 실패하면 `{ ok:false, error:"코드", message:"한국어 안내" }` 가 붙는다. 화면에는 `message` 를 그대로 보여 주면 된다. 분기는 `error` 코드로 한다.
- 로그인이 필요한 요청은 `Authorization: Bearer <토큰>` 헤더를 붙인다. 토큰은 base64url 43자.
- 모든 API 응답 헤더: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- 429 응답에는 `Retry-After` 헤더와 본문 `retryAfter`(초)가 함께 온다.
- 본문 크기 제한: 인증 4KB, 슬롯 저장 512KB, 메타 64KB (넘으면 413).
- 시각은 모두 밀리초 epoch(`Date.now()` 형식). `savedAt` 은 **서버 시각**이다.

### 오류 코드

| HTTP | error | 뜻 |
|---|---|---|
| 400 | `bad_json` | 본문이 비었거나 JSON/UTF-8 이 아님 |
| 400 | `bad_request` | 필드 타입이 틀림 (예: 비밀번호가 문자열이 아님, `baseRev` 가 음수) |
| 400 | `invalid_id` | 아이디 규칙 위반 |
| 400 | `reserved_id` | 예약된 아이디 (admin, root, system, guest, null, undefined …, admin·system·official·moderator·gm_·staff_·netlify 로 시작) |
| 400 | `invalid_password` | 비밀번호 규칙 위반 |
| 400 | `password_same_as_id` | 비밀번호가 아이디와 같음 |
| 400 | `same_password` | 새 비밀번호가 지금 비밀번호와 같음 |
| 400 | `invalid_slot` | 슬롯 번호가 1·2·3 이 아님 |
| 401 | `unauthorized` | 토큰 없음·만료·폐기 → 로컬 토큰을 지우고 로그인 화면으로 |
| 401 | `invalid_credentials` | 로그인 실패 (아이디가 없든 비밀번호가 틀리든 같은 응답) |
| 401 | `invalid_recovery` | 복구 실패 (아이디가 없든 코드가 틀리든 같은 응답) |
| 403 | `wrong_password` | 비밀번호 변경·탈퇴 때 지금 비밀번호가 틀림 (세션은 유효 — 로그아웃시키지 말 것) |
| 404 | `not_found` | 없는 API 경로 |
| 404 | `slot_empty` | 클라우드 슬롯이 비어 있음 (본문에 `slot`, `rev`) |
| 405 | `method_not_allowed` | 허용되지 않는 메서드 (`Allow` 헤더 참고) |
| 409 | `id_taken` | 이미 있는 아이디 |
| 409 | `conflict` | rev 충돌 (본문 `server` 참고) |
| 413 | `payload_too_large` | 본문이 너무 큼 |
| 422 | `invalid_save` | 세이브 구조 검사 실패 |
| 422 | `invalid_meta` | 메타 구조 검사 실패 |
| 429 | `locked` | 아이디별 실패 5회 → 10분 잠금 |
| 429 | `rate_limited` | 같은 IP 인증 시도 10분 20회 초과 |
| 429 | `signup_limited` | 같은 IP 가입 1시간 5개 초과 |
| 500 | `server_error` | 서버·저장소 일시 오류 (잠시 뒤 재시도) |

## 3. 엔드포인트

### 상태 확인
`GET /api/health` → `200 {ok:true, api:1, time}` — 인증·저장소 접근 없음. `api` 는 계약 버전, `time` 은 서버 시각.

### 계정

| 요청 | 본문 | 성공 응답 | 주요 실패 |
|---|---|---|---|
| `POST /api/auth/signup` | `{id, password}` | **201** `{ok, id, token, recoveryCode}` | invalid_id, reserved_id, invalid_password, password_same_as_id, id_taken, signup_limited, rate_limited |
| `POST /api/auth/login` | `{id, password}` | `{ok, id, token}` | invalid_credentials, locked, rate_limited, bad_request |
| `POST /api/auth/logout` | 없음 (토큰 필요) | `{ok}` — 이 토큰만 폐기 | unauthorized |
| `GET /api/auth/me` | — | `{ok, id, createdAt}` | unauthorized |
| `POST /api/auth/password` | `{oldPassword, newPassword}` | `{ok}` — **현재 토큰만 남기고** 다른 세션 모두 폐기 | wrong_password, invalid_password, password_same_as_id, same_password, locked |
| `POST /api/auth/recover` | `{id, recoveryCode, newPassword}` | `{ok, id, recoveryCode, token}` — 새 비밀번호 적용, **새 복구 코드** 발급, 기존 세션 **전부** 폐기 후 새 토큰 발급 | invalid_recovery, invalid_password, password_same_as_id, locked |
| `DELETE /api/auth/account` | `{password}` | `{ok}` — 계정·세션·모든 저장 데이터 삭제 | wrong_password, locked |
| `POST /api/auth/account/delete` | `{password}` | 위와 같음 (DELETE 본문을 못 보내는 환경용) | |

- **아이디**: 앞뒤 공백 제거 후 소문자로 바꿔 처리(대소문자 구분 없음). 4~16자, 영문 소문자로 시작, 영문 소문자·숫자·밑줄(`_`)만. 응답의 `id` 가 정규화된 아이디다.
- **비밀번호**: 8~64자(유니코드 문자 수 기준, 한글·이모지 가능), 줄바꿈 같은 제어 문자 금지, 아이디와 같으면 안 됨(대소문자 무시). 서버는 앞뒤 공백을 지우지 않는다 — 입력 그대로 보낸다.
- **복구 코드**: `XXXX-XXXX-XXXX-XXXX` (Crockford Base32, 80비트). 가입·복구 때 **딱 한 번** 응답에 오고 서버는 해시만 가진다. 입력할 때 대소문자·공백·하이픈은 무시하고 `O→0`, `I/L→1` 로 읽으므로 사용자가 헷갈려도 된다. 한 번 쓰면 무효가 되고 새 코드가 나온다.
- 가입 성공 시 곧바로 로그인된 토큰이 온다.

### 세션
- 토큰 유효 기간 30일. 마지막 연장 뒤 7일 이상 지나 사용하면 그 시점부터 다시 30일로 연장된다(토큰 값은 그대로). 즉 한 달 안에 한 번이라도 접속하면 계속 로그인 상태다.
- 사용자당 최대 10개. 11번째 로그인 시 가장 오래된 세션이 폐기된다.

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
| `bn-ratelimit` | `ip/auth/<IP 해시>`, `ip/signup/<IP 해시>`, `id/login/<아이디>`, `id/recover/<아이디>` | `{n, start, lockedUntil?}` |

- `uid` 는 가입 때 만드는 무작위 128비트 내부 식별자다. 저장 데이터 키에 로그인 아이디 대신 `uid` 를 써서, 탈퇴 후 같은 아이디로 다시 가입해도 이전 데이터(혹시 남은 조각 포함)와 절대 섞이지 않는다.
- 세션 인증은 두 곳을 모두 확인한다: `bn-sessions` 에 토큰 해시가 있고, **그리고** 사용자 레코드의 `sessions` 목록에도 있으며 만료 전이어야 한다(목록이 기준). 그래서 중간에 지우기가 실패해도 폐기된 토큰이 되살아나지 않는다.
- 모든 쓰기는 ETag 조건부 쓰기(`onlyIfNew` / `onlyIfMatch`)로 경합을 막는다: 같은 아이디 동시 가입은 하나만 성공, 같은 `baseRev` 동시 저장도 하나만 성공한다.

## 5. 보안 설계

- **비밀번호 해시**: `node:crypto` scrypt, N=16384, r=8, p=1, 32바이트 무작위 salt, 64바이트 키. 매개변수를 해시와 함께 저장하고 `timingSafeEqual` 로 비교한다. 매개변수나 pepper 설정이 바뀌면 다음 로그인 성공 때 자동으로 다시 해시한다. 비밀번호는 NFC 로 정규화한 뒤 해시한다(기기마다 한글 조합 방식이 달라도 같은 값).
- **복구 코드**: 80비트 무작위, 비밀번호와 같은 scrypt 로 해시만 저장. 1회용.
- **세션 토큰**: 32바이트 무작위(base64url). 서버에는 SHA-256 만 저장한다. 30일 만료 + 7일 뒤 슬라이딩 연장, 사용자당 10개.
- **계정 존재 여부 숨김**: 로그인·복구는 아이디가 없을 때도 가짜 scrypt 를 돌려 시간과 응답 본문이 같다. 없는 아이디도 실패 횟수를 세고 똑같이 잠긴다. (가입은 성격상 `id_taken` 을 알려 줄 수밖에 없으므로 IP 제한으로 대량 조회를 막는다.)
- **요청 제한** (Blobs 에 저장, 고정 창):
  - 아이디별: 로그인(비밀번호 변경·탈퇴 때의 현재 비밀번호 확인 포함) 10분 안에 5회 실패 → 10분 잠금. 잠긴 동안은 맞는 비밀번호도 거부. 성공하면 초기화. 복구 코드는 따로 5회/10분 → 10분 잠금. 복구에 성공하면 로그인 잠금도 풀린다.
  - IP별: 인증 시도(가입·로그인·복구·비밀번호 변경·탈퇴) 10분에 20회, 가입 성공 1시간에 5개. IP 는 원문 대신 해시(`AUTH_PEPPER` 가 있으면 HMAC)로만 저장한다. IP 는 Netlify 가 채우는 `context.ip` 를 쓴다(클라이언트가 보낸 `X-Forwarded-For` 는 믿지 않음).
  - 숫자는 `netlify/lib/config.mts` 의 `RATE` 에서 바꾼다. PC방·학교처럼 여러 명이 IP 하나를 쓰는 곳에서 막히면 `ipAuthMax` 를 올린다.
- **입력 검사**: 라우트·메서드 엄격 확인(404/405), 본문 크기를 실제로 세어 제한, UTF-8·JSON 오류는 400, 슬롯 번호는 `1|2|3` 만, 세이브는 `isValidSave` 와 같은 구조 검사(테스트가 무작위 변형 400개로 클라이언트 함수와 결과가 같은지 확인한다).
- **응답·로그**: 스택 트레이스나 내부 정보는 응답에 넣지 않는다(500 은 일반 메시지만). 로그에는 오류 종류만 남기고 비밀번호·토큰·복구 코드·IP·요청 본문은 남기지 않는다.
- **정적 사이트 헤더**(`netlify.toml`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, CSP(`default-src 'self'`, Google Fonts 허용, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`). `index.html` 의 인라인 스크립트 때문에 `script-src` 에 `'unsafe-inline'` 이 들어 있다 — 인라인 스크립트를 파일로 옮기면 빼는 것이 좋다. `/node_modules`, `/netlify`, `/tools`, `/android`, `/docs`, `/dist`, `package*.json`, `netlify.toml` 은 강제 404 로 막았다(로컬에서 `netlify deploy` 로 올릴 때 서명 키 같은 git 무시 파일이 섞여도 노출되지 않게).
- **캐시**: `index.html`·`src/*`·`css/*`·`sw.js`·매니페스트는 `no-cache`(매번 재검증), `?v=` 가 붙는 이미지(`assets/bg|portraits|tex|cg|icons|props`)는 1년 `immutable` — 그림을 바꾸면 `src/core/assets.js` 의 `version` 을 올린다. 글꼴은 7일, 앱 아이콘은 1일.
- **전송**: Netlify 가 HTTPS 를 강제한다. 토큰은 `Authorization` 헤더로만 오가고 쿠키를 쓰지 않으므로 CSRF 대상이 아니다. 클라이언트는 토큰을 `localStorage` 에 두므로 XSS 가 곧 토큰 탈취다 — CSP 를 느슨하게 만들지 말 것.

## 6. 환경 변수

필수 환경 변수는 **없다**. Blobs 는 Netlify 가 자동으로 연결한다.

| 이름 | 필수 | 설명 |
|---|---|---|
| `AUTH_PEPPER` | 선택 | 설정하면 비밀번호·복구 코드를 `HMAC-SHA256(pepper)` 한 뒤 scrypt 하고, IP 해시에도 쓴다. Blobs 데이터가 유출돼도 pepper 없이는 오프라인 추측이 불가능해진다. 32자 이상 무작위 문자열을 Netlify 환경 변수(범위: Functions)에 넣는다. **한 번 넣은 뒤 바꾸거나 지우면 그 뒤로 해시된 계정은 로그인할 수 없다**(오류 없이 "비밀번호가 올바르지 않습니다"가 된다). 처음 넣는 것은 언제든 괜찮다 — 기존 계정은 다음 로그인 때 자동으로 옮겨진다. |

코드는 환경 변수를 `Netlify.env.get()` 으로만 읽는다.

## 7. 배포

1. Netlify 에 저장소를 연결한다(git 연동 권장). 빌드 명령 없음, 게시 디렉터리 `.`, 함수 디렉터리 `netlify/functions` — 모두 `netlify.toml` 에 들어 있다. Node 22 (`NODE_VERSION`).
2. 의존성: `@netlify/blobs`, `@netlify/functions` (`package.json`). Netlify 가 설치하고 함수를 번들한다. `netlify/lib/*.mts` 는 `api.mts` 가 import 해서 함께 번들되며 따로 함수가 되지 않는다.
3. 배포 후 `https://<사이트>/api/health` 가 `{"ok":true,"api":1,...}` 를 돌려주면 끝.
4. 로컬에서 Netlify 환경 그대로 시험하려면 `npx netlify dev` (이때 데이터는 배포별 저장소라 운영과 분리된다).

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
node tools/accounts/admin.mjs delete hunter_01 --yes   # 계정과 저장 데이터 전부 삭제
```

- **비밀번호를 잊은 사용자**: 먼저 복구 코드로 스스로 재설정하게 안내한다(`POST /api/auth/recover`). 복구 코드도 잃어버렸다면 본인 확인(예: 가입 시기, 캐릭터·진행 상황을 `show` 결과와 대조)을 한 뒤 `reset` 을 실행하고, 출력된 임시 비밀번호와 새 복구 코드를 그 사용자에게만 전달한다. 사용자는 로그인 후 비밀번호를 바꾸게 한다.
- **잠김 문의**: 10분 뒤 자동으로 풀린다. 급하면 `unlock`.
- **기기를 잃어버림**: `revoke` (또는 사용자가 비밀번호를 바꾸면 다른 세션이 모두 폐기된다).
- Netlify CLI 로 원시 데이터를 볼 수도 있다: `netlify blobs:list bn-users`, `netlify blobs:get bn-users <아이디>` (해시가 보이므로 외부에 공유하지 말 것). 사용자 레코드를 손으로 고치지 말고 위 도구를 쓴다.
- 백업: `bn-users` 와 `bn-saves` 를 `netlify blobs:list/get` 으로 내려받아 보관한다. `bn-sessions`·`bn-ratelimit` 는 백업할 필요가 없다(비워도 모두 다시 로그인하면 끝).
- 만료된 세션·지난 제한 기록은 로그인·요청 때 필요한 만큼만 정리된다. 쌓인 `bn-ratelimit` 키는 전부 지워도 안전하다.

## 9. 테스트

```bash
npm run test:api                                   # 메모리 저장소 + 실제 @netlify/blobs(로컬 BlobsServer) 두 모드
node tools/accounts/test_api.mjs --mode=memory     # 한 모드만
node tools/accounts/test_api.mjs --filter=복구      # 이름에 '복구'가 들어간 테스트만
```

- 핸들러를 `Request`/`Context` 로 직접 부른다(Node 22.18+ 가 `.mts` 의 타입을 지우고 바로 실행). 시계는 `setClock` 으로, 저장소는 `setStoreFactory` 로 바꿔 끼운다(`netlify/lib/runtime.mts`).
- 모든 엔드포인트와 오류 경로(404/405, 깨진 JSON, 크기 제한, 아이디·비밀번호 규칙, 잠금, IP 제한, 세션 만료·연장·최대 10개, 복구 코드 1회성, 탈퇴 후 재가입, rev 충돌·force·묘비, 동시 저장, 배포 문맥 분리, 저장소 장애 시 500, 평문 비밀이 저장소에 없음)를 확인한다.
- 로컬 BlobsServer 는 읽기 응답에 ETag 를 주지 않아 그 모드에서는 조건부 쓰기 대신 덮어쓰기로 동작한다(운영 Netlify Blobs 는 ETag 를 준다). 동시성 테스트는 메모리 모드에서만 돈다.
