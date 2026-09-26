# 계정 · 클라우드 저장 API (블러드 녹턴)

플레이어가 **아이디 + 비밀번호**로 계정을 만들고, 세이브 슬롯 1~3과 전역 기록(메타)을 서버에 저장해 여러 기기에서 이어 하는 기능의 서버 쪽 설계서다.
Netlify Functions(모던 함수, TypeScript) + Netlify Blobs 로 동작하며, 별도의 DB나 필수 환경 변수 없이 배포만 하면 켜진다.

| 항목 | 위치 |
|---|---|
| 함수 진입점 (`/api/*`) | `netlify/functions/api.mts` |
| 공용 코드 (함수로 배포되지 않음) | `netlify/lib/*.mts` — `config` 상수, `http` 응답·본문, `runtime` 저장소·시계·환경, `crypto` 해시·토큰, `validate` 입력 검사, `ratelimit` 요청 제한, `accounts` 계정, `saves` 저장, `router` 라우팅, `admin` 운영 도구 |
| 배포 설정 | `netlify.toml` (publish = 저장소 루트, 보안·캐시 헤더, 개발 파일 차단) |
| 테스트 | `node tools/accounts/test_api.mjs` (= `npm run test:api`) · 브라우저 `node tools/accounts/test_client.mjs` (= `npm run test:client`) |
| 운영 도구 | `node tools/accounts/admin.mjs` |

## 1. 동작 환경

- **웹(Netlify)**: 게임과 API 가 같은 출처다. 클라이언트는 `fetch('/api/...')` 로 부른다. CORS 헤더는 두지 않는다.
- **안드로이드 APK**: WebView 가 `https://appassets.androidplatform.net/` 에서 게임을 열고, `/api/*` 요청을 앱이 Netlify 사이트로 대신 전달한다. 그래서 브라우저 입장에서는 항상 같은 출처 요청이다. 클라이언트는 반드시 **절대 경로 `/api/...`** 를 써야 한다 (`api/...` 처럼 상대 경로로 쓰면 `/assets/api/...` 처럼 엉뚱한 곳으로 간다).
- **claude.ai 임베드**: CSP 가 다른 호스트 요청을 막아 API 에 닿지 않는다. 클라이언트는 `GET /api/health` 가 실패하면(네트워크 오류, JSON 이 아님, `ok` 가 아님) 계정 기능을 숨기고 로컬 저장만 쓴다. `node tools/serve.mjs` 로 띄운 로컬 서버에도 API 가 없으므로 같은 방식으로 꺼진다.
- **서비스 워커**(`sw.js`)는 `/api/` 요청을 가로채거나 캐시하지 않는다.

## 2. 공통 규칙

- 요청·응답 본문은 UTF-8 JSON. 모든 응답은 `{ ok: boolean, ... }` 이고, 실패하면 `{ ok:false, error:"코드", message:"한국어 안내" }` 가 붙는다. 화면에는 `message` 를 그대로 보여 주면 된다. 분기는 `error` 코드로 한다.
- 본문이 있는 요청은 반드시 `Content-Type: application/json` 이어야 한다(아니면 415). 다른 사이트가 `fetch(no-cors)`·form 으로 보낼 수 있는 `text/plain`·form 형식을 받지 않아, 방문자 브라우저를 빌린 가입·로그인·잠금 공격(CSRF)을 막는다. 같은 이유로 `Sec-Fetch-Site: cross-site` 요청은 403.
- JSON 중첩은 64단계까지(넘으면 400), 세이브·메타의 `data` 는 32단계까지이고 `__proto__` 키를 쓸 수 없다(넘거나 있으면 422).
- 로그인이 필요한 요청은 `Authorization: Bearer <토큰>` 헤더를 붙인다. 토큰은 base64url 43자.
- 모든 API 응답 헤더: `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`.
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
| 403 | `forbidden` | 다른 사이트에서 보낸 요청 (`Sec-Fetch-Site: cross-site`) |
| 404 | `not_found` | 없는 API 경로 |
| 404 | `slot_empty` | 클라우드 슬롯이 비어 있음 (본문에 `slot`, `rev`) |
| 405 | `method_not_allowed` | 허용되지 않는 메서드 (`Allow` 헤더 참고) |
| 409 | `id_taken` | 이미 있는 아이디 |
| 409 | `conflict` | rev 충돌 (본문 `server` 참고) |
| 413 | `payload_too_large` | 본문이 너무 큼 |
| 415 | `unsupported_media_type` | 본문이 있는데 `Content-Type` 이 `application/json` 이 아님 |
| 422 | `invalid_save` | 세이브 구조 검사 실패 |
| 422 | `invalid_meta` | 메타 구조 검사 실패 |
| 429 | `locked` | 같은 망에서 이 아이디 비밀번호 5회 실패 → 그 망에서 10분 잠금 / 모든 망 합계 1시간 20회 실패 → 30분 잠금 / 같은 망에서 복구 코드 5회 실패 → 10분 잠금 |
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
| `GET /api/auth/me` | — | `{ok, id, createdAt}` | unauthorized |
| `POST /api/auth/password` | `{oldPassword, newPassword}` | `{ok}` — **현재 토큰만 남기고** 다른 세션 모두 폐기 | wrong_password, invalid_password, password_same_as_id, weak_password, same_password, locked |
| `POST /api/auth/recover` | `{id, recoveryCode, newPassword, remember?}` | `{ok, id, recoveryCode, token}` — 새 비밀번호 적용, **새 복구 코드** 발급, 기존 세션 **전부** 폐기 후 새 토큰 발급, 이 아이디의 모든 잠금 해제 | invalid_recovery, invalid_password, password_same_as_id, weak_password, locked |
| `DELETE /api/auth/account` | `{password}` | `{ok}` — 계정·세션·모든 저장 데이터 삭제 | wrong_password, locked |
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
| `bn-ratelimit` | `ip/auth/<망 해시>`, `ip/signup/<망 해시>`, `lock/login/<아이디>/all`, `lock/login/<아이디>/net/<망 해시>`, `lock/recover/<아이디>/net/<망 해시>` | `{n, start, lockedUntil?}` — 망 = IPv4 주소 하나 또는 IPv6 /64 |

- `uid` 는 가입 때 만드는 무작위 128비트 내부 식별자다. 저장 데이터 키에 로그인 아이디 대신 `uid` 를 써서, 탈퇴 후 같은 아이디로 다시 가입해도 이전 데이터(혹시 남은 조각 포함)와 절대 섞이지 않는다.
- 세션 인증은 두 곳을 모두 확인한다: `bn-sessions` 에 토큰 해시가 있고, **그리고** 사용자 레코드의 `sessions` 목록에도 있으며 만료 전이어야 한다(목록이 기준). 그래서 중간에 지우기가 실패해도 폐기된 토큰이 되살아나지 않는다.
- 모든 쓰기는 ETag 조건부 쓰기(`onlyIfNew` / `onlyIfMatch`)로 경합을 막는다: 같은 아이디 동시 가입은 하나만 성공, 같은 `baseRev` 동시 저장도 하나만 성공한다.
- 로컬 Blobs 서버(`netlify dev`)는 키를 파일 경로로 저장하므로 한 키가 다른 키의 경로 앞부분이 되면 안 된다(`lock/login/<아이디>` 와 `lock/login/<아이디>/…` 를 함께 쓰지 않고 `…/all` 을 쓰는 이유).

## 5. 보안 설계

- **비밀번호 해시**: `node:crypto` scrypt, **N=2^15, r=8, p=3**(32MiB — OWASP 비밀번호 저장 지침의 scrypt 최소 기준과 같은 비용, 이 컨테이너에서 한 번에 약 0.24초), 32바이트 무작위 salt, 64바이트 키. 매개변수를 해시와 함께 저장하고 `timingSafeEqual` 로 비교한다. 매개변수나 pepper 설정이 바뀌면 다음 로그인 성공 때 자동으로 다시 해시한다(바뀌기 전 가벼운 해시를 검증할 때도 현재 매개변수 한 번만큼 시간을 함께 써서, 재해시 전 계정이 있는지 응답 시간으로 드러나지 않게 한다). 비밀번호는 NFC 로 정규화한 뒤 해시한다(기기마다 한글 조합 방식이 달라도 같은 값).
- **복구 코드**: 80비트 무작위, 비밀번호와 같은 scrypt 로 해시만 저장. 1회용.
- **세션 토큰**: 32바이트 무작위(base64url). 서버에는 SHA-256 만 저장한다. 30일(로그인 유지 끔: 12시간) 만료 + 슬라이딩 연장, 사용자당 10개. 토큰은 로그인·가입·복구 때 서버가 새로 만들며 클라이언트가 정할 수 없다(세션 고정 불가). 폐기된 세션의 저장값은 연장 중에도 되살아나지 않는다.
- **계정 존재 여부 숨김**: 로그인·복구는 아이디가 없을 때도 가짜 scrypt 를 돌려 시간과 응답 본문이 같다. 없는 아이디도 실패 횟수를 세고 똑같이 잠긴다. (가입은 성격상 `id_taken` 을 알려 줄 수밖에 없으므로 망별 제한으로 대량 조회를 막는다.)
- **비밀번호 추측 제한** (Blobs 에 저장, 고정 창). '망' = IPv4 주소 하나 또는 IPv6 /64 (한 가입자는 보통 /64 전체를 받으므로 주소 하나씩 세면 주소만 바꿔 무한히 우회된다. `::ffff:a.b.c.d` 는 IPv4 로 본다):
  - 아이디+망: 비밀번호(로그인, 비밀번호 변경·탈퇴 때의 지금 비밀번호 확인) 10분 안에 5회 실패 → **그 망에서만** 10분 잠금. 잠긴 동안은 맞는 비밀번호도 거부. 성공하면 그 망의 기록 초기화. 다른 망에 있는 주인은 영향을 받지 않는다(아이디만 알면 누구나 주인을 잠가 버리던 잠금 악용 방지).
  - 아이디 전체(모든 망 합계): 1시간에 20회 실패 → 30분 동안 모든 망에서 잠금 (여러 IP 로 나눠 추측하는 공격 방지). 성공한 시도는 이 수에서 빠진다.
  - 복구 코드: 아이디+망 10분에 5회 실패 → 그 망에서 10분 잠금 (코드가 80비트라 전체 한도는 두지 않는다). 복구에 성공하면 그 아이디의 모든 로그인·복구 잠금이 풀린다 — 잠금 공격을 받는 중에도 주인은 복구 코드로 바로 들어올 수 있다.
  - **확인 전에 자리를 잡는다**: 시도마다 비밀번호를 확인하기 *전에* 조건부 쓰기로 카운터를 1 올리고(한도가 찼으면 거절), 실패하면 그대로 두어 실패 1회로 치고, 한도째 시도가 실패하면 잠근다. 예전처럼 '잠겼나 확인 → 확인 → 실패 기록' 순서면 동시 요청 수십 개가 모두 첫 단계를 통과해 한도보다 훨씬 많이 확인된다(시험: 한 망에서 동시 12개 → 12번 확인, 여러 IP 동시 40개 → 40번 확인. 지금은 5번·20번).
  - 망별: 인증 시도(가입·로그인·복구·비밀번호 변경·탈퇴) 10분에 20회, 가입 1시간에 5개(가입 자리도 원자적으로 잡고 실패하면 돌려준다 — 동시 가입으로 한도를 넘지 못한다). 망은 원문 대신 해시(`AUTH_PEPPER` 가 있으면 HMAC)로만 저장한다.
  - IP 는 Netlify 가 채우는 `context.ip` 만 쓴다. `X-Forwarded-For`·`x-nf-client-connection-ip` 등 요청 헤더는 클라이언트가 위조할 수 있으므로 절대 쓰지 않는다(없으면 모두 하나의 'unknown' 묶음으로 센다).
  - 숫자는 `netlify/lib/config.mts` 의 `RATE` 에서 바꾼다. PC방·학교처럼 여러 명이 IP 하나를 쓰는 곳에서 막히면 `ipAuthMax` 를 올린다.
- **흔한 비밀번호 거부**: 온라인 추측 제한만으로는 `12345678`·`qwer1234`·`1q2w3e4r` 같은 비밀번호가 하루 안에 뚫릴 수 있어 가입·변경·복구 때 `weak_password` 로 막는다.
- **다른 사이트에서 오는 요청**: 본문이 있는 요청은 `Content-Type: application/json` 만 받고(415), `Sec-Fetch-Site: cross-site` 는 거절한다(403). CORS 헤더는 두지 않는다 — 다른 출처의 사전 확인(OPTIONS)은 405 로 끝난다. 토큰은 쿠키가 아니라 `Authorization` 헤더로만 오간다.
- **입력 검사**: 라우트·메서드 엄격 확인(404/405), 본문 크기를 실제로 세어 제한, UTF-8·JSON 오류는 400, JSON 은 파싱 전에 중첩 깊이를 재어 64단계 초과는 400(수십만 겹 배열로 뒤의 재귀 처리를 넘치게 하는 DoS 방지), 슬롯 번호는 `1|2|3` 만, 세이브는 `isValidSave` 와 같은 구조 검사(테스트가 무작위 변형 400개로 클라이언트 함수와 결과가 같은지 확인한다). 세이브·메타 `data` 는 32단계 이하, `__proto__` 키 금지(422 — 클라이언트가 합치거나 대입할 때 프로토타입이 바뀌는 것 방지).
- **경합**: 로그인이 옛 비밀번호를 확인한 뒤 세션을 만들기 전에 다른 기기가 비밀번호를 바꾸면, 그 로그인은 세션을 받지 못한다(예전: 비밀번호 변경의 '다른 세션 폐기' 뒤에 붙어 살아남았다). 로그인 재해시는 확인한 비밀번호가 그대로일 때만 쓴다(예전: 방금 바뀐 새 비밀번호를 옛 비밀번호로 되돌릴 수 있었다). 비밀번호 변경은 그사이 다른 변경이 있었으면 `wrong_password`. 탈퇴는 사용자 레코드를 지운 뒤 세이브를 한 번 더 쓸고, 세이브 쓰기는 쓴 뒤 계정이 아직 있는지 확인해 없으면 방금 쓴 것을 지운다(탈퇴한 계정의 세이브가 남지 않는다).
- **배포 문맥**: 운영(`production`)은 사이트 전역 저장소, 그 밖(미리보기·브랜치·dev)은 배포별 저장소. 배포 문맥을 알 수 없으면 어떤 저장소도 열지 않고 500(운영 요청이 배포별 저장소에 쓰면 다음 배포 때 데이터가 사라지고, 미리보기 요청이 운영 저장소에 쓰면 섞이므로).
- **응답·로그**: 스택 트레이스나 내부 정보는 응답에 넣지 않는다(500 은 일반 메시지만). 로그에는 오류 종류와, URL·메일·IPv4/IPv6·토큰·해시·키처럼 보이는 긴 문자열을 가린 문구만 남긴다(Netlify Blobs 오류에는 저장소 응답 본문이 붙을 수 있다). 비밀번호·토큰·복구 코드·IP·요청 본문은 남기지 않는다.
- **API 응답 헤더**: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox`, `X-Frame-Options: DENY`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`, `nosniff`, `no-store` (`netlify.toml` 의 `[[headers]]` 는 정적 파일에만 적용되므로 함수가 직접 붙인다).
- **정적 사이트 헤더**(`netlify.toml`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Strict-Transport-Security: max-age=31536000`, `X-Frame-Options: SAMEORIGIN`, CSP(`default-src 'self'`, Google Fonts 허용, `connect-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`). `index.html` 의 인라인 스크립트 때문에 `script-src` 에 `'unsafe-inline'` 이 들어 있다 — 인라인 스크립트를 파일로 옮기면 빼야 한다(로그인 토큰이 브라우저 저장소에 있으므로 XSS 는 곧 토큰 탈취다). `/node_modules`, `/netlify`, `/tools`, `/android`, `/docs`, `/dist`, `/.git`, `package*.json`, `netlify.toml` 은 강제 404 로 막았다(로컬에서 `netlify deploy` 로 올릴 때 서명 키 같은 git 무시 파일이 섞여도 노출되지 않게).
- **캐시**: `index.html`·`src/*`·`css/*`·`sw.js`·매니페스트는 `no-cache`(매번 재검증), `?v=` 가 붙는 이미지(`assets/bg|portraits|tex|cg|icons|props`)는 1년 `immutable` — 그림을 바꾸면 `src/core/assets.js` 의 `version` 을 올린다. 글꼴은 7일, 앱 아이콘은 1일.
- **전송**: Netlify 가 HTTPS 를 강제한다. 토큰은 `Authorization` 헤더로만 오가고 쿠키를 쓰지 않는다. 클라이언트는 토큰을 '로그인 유지'면 `localStorage`, 아니면 `sessionStorage` 에 두므로 XSS 가 곧 토큰 탈취다 — CSP 를 느슨하게 만들지 말 것.

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
npm run test:client                                # 브라우저(헤드리스 Chromium) 클라이언트 테스트
```

- 핸들러를 `Request`/`Context` 로 직접 부른다(Node 22.18+ 가 `.mts` 의 타입을 지우고 바로 실행). 시계는 `setClock` 으로, 저장소는 `setStoreFactory` 로 바꿔 끼운다(`netlify/lib/runtime.mts`). 해시 비용은 `setHashCostForTests` 로 낮춰 빠르게 돌리고, 매개변수를 확인하는 테스트(`realHash`)만 운영 값으로 돈다(HTTP·환경 변수로는 바꿀 수 없다).
- '공격:'·'경합:' 테스트는 보안 검토에서 찾은 문제를 재현한다: 동시 요청으로 잠금·가입 한도 우회(저장소 연산 가로채기 `hook` 으로 요청을 한 줄로 세운 뒤 한꺼번에 풀고, scrypt 호출 수로 실제 비밀번호 확인 횟수를 센다), 잠금 악용, 분산 추측, CSRF(text/plain·cross-site), IPv6 주소 돌리기, IP 헤더 위조, 비밀번호 변경·재해시·탈퇴 경합, 깊은 JSON·`__proto__`, 로그 가리기, 응답 헤더, 흔한 비밀번호, scrypt 매개변수·옛 해시 올리기, 로그인 유지, 모든 기기 로그아웃, 배포 문맥 없음.
- `tools/accounts/test_client.mjs`: 헤드리스 Chromium 에서 게임을 `https://game.test`(공식 사이트 역할)·`https://claude.ai`(임베드 역할)로 열고 `netlify.toml` 의 CSP 를 그대로 붙여, 게스트 요청 0건·claude.ai 요청 0건·오프라인 안내·'로그인 유지' 켬/끔(저장 위치·서버 세션 길이·새 창)·로그아웃과 흔적 삭제·모든 기기 로그아웃(오프라인이면 유지하고 알림)·약한 비밀번호 사전 차단·시험 주소 덮어쓰기·형식이 틀린 응답 거부를 확인한다.
- 모든 엔드포인트와 오류 경로(404/405, 깨진 JSON, 크기 제한, 아이디·비밀번호 규칙, 잠금, IP 제한, 세션 만료·연장·최대 10개, 복구 코드 1회성, 탈퇴 후 재가입, rev 충돌·force·묘비, 동시 저장, 배포 문맥 분리, 저장소 장애 시 500, 평문 비밀이 저장소에 없음)를 확인한다.
- 로컬 BlobsServer 는 읽기 응답에 ETag 를 주지 않아 그 모드에서는 조건부 쓰기 대신 덮어쓰기로 동작한다(운영 Netlify Blobs 는 ETag 를 준다). 동시성 테스트는 메모리 모드에서만 돈다.

## 10. 게임 클라이언트

| 파일 | 내용 |
|---|---|
| `src/core/cloud.js` | API 클라이언트(`cloud`): 사용 가능 판단, 토큰, 요청(시간 제한·JSON·오프라인), 슬롯·메타 동기화, 입력 검사(서버 규칙과 같음) |
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
- **메타**는 덮어쓰지 않고 합친다: 해금 캐릭터·엔딩은 합집합, 클리어 수·서바이벌 최고 기록은 큰 값, 도감은 항목별 큰 값, 명예의 전당은 두 목록을 합쳐 모드별 상위 20개(스토리 모드는 회차 `run` 당 한 줄), 보스 러시는 코스별 최단 기록. 마지막 캐릭터·이니셜·아케이드 설정 같은 기기 설정은 이 기기 값이 우선.
- **입력 칸**: 캔버스 위에 실제 `<input>`(아이디 `autocomplete=username`, 비밀번호 `current-password`/`new-password`, `autocapitalize=off`)을 `<form>` 에 넣어 띄운다 — 모바일 키보드·비밀번호 관리자가 동작한다. 스타일은 JS 가 넣는 `<style id="bn-account-style">`. `core/input.js` 는 글자를 입력할 수 있는 요소(읽기 전용 제외)에서 누른 키를 게임 키로 쓰지 않는다.
- **안드로이드 앱**: 클라이언트는 항상 같은 출처의 `fetch('/api/...')` 를 쓴다. 앱이 요청 본문을 전달하려면 `shouldInterceptRequest` 대신 페이지 쪽에서 `window.fetch` 를 감싸 JS 브리지로 넘기면 된다 — `cloud.js` 는 요청할 때마다 `fetch` 를 새로 찾으므로 감싼 것이 그대로 쓰인다. 브리지는 메서드·본문과 함께 **`Content-Type: application/json`·`Authorization` 헤더를 그대로** 전달해야 한다(Content-Type 이 빠지면 415). `Sec-Fetch-Site: cross-site` 를 붙이지 말 것(403). 서버는 앱 쪽 요청의 IP 를 Netlify 가 본 접속 IP(`context.ip`)로 세므로, 앱이 모든 사용자의 요청을 한 서버에서 대신 보내는 구조라면 망별 제한에 한꺼번에 걸린다 — 기기에서 직접 Netlify 로 보내야 한다.

