# 온라인 기록 운영 안내 (리더보드 · 일일 도전 · 고스트)

계약(엔드포인트·응답·검사 규칙)은 `docs/specs/online.md` 가 기준이다. 이 문서는 운영자용: 무엇을 저장하는지, 얼마나 두는지, 문제가 생긴 기록을 어떻게 지우는지.
계정·인증·공통 규칙은 `docs/ACCOUNTS.md`.

| 항목 | 위치 |
|---|---|
| API (`/api/runs`, `/api/runs/finish`, `/api/boards/*`, `/api/ghosts/*/*`, `/api/daily`, `/api/profile/nick`) | `netlify/lib/online.mts` (라우터 `router.mts`) |
| 순위 저장·정렬·정리 | `netlify/lib/boards.mts` |
| 런 토큰·일일 도전 | `netlify/lib/runs.mts` |
| 별명 검사·금칙어·중복 | `netlify/lib/nick.mts` |
| 게임 데이터 id 사본 (직업·난이도·스테이지·코스·헌터 등급) | `netlify/lib/gamedata.mts` — 함수 묶음에는 `netlify/` 만 들어가므로 `src/data` 를 import 하지 않는다. 게임 데이터를 바꾸면 함께 고친다(시험이 확인) |
| 숫자 (제한·상한·보관 기간) | `netlify/lib/config.mts` 의 `ONLINE` |
| 시험 | `npm run test:online` (= `node tools/online/test_online.mjs`, 메모리 + 로컬 BlobsServer) |
| 운영 도구 | `node tools/accounts/admin.mjs board · board-remove · nick` (아래 §4) |

## 1. 저장하는 것

| 저장소 | 키 | 값 | 보관 |
|---|---|---|---|
| `bn-boards` | `b/<보드 키>/i` | 순위 목록: 상위 150개 `{u: uid, n: 별명, t, s, w?, h, c, l, d: 기록 시각, g: 고스트 있음}` + `total`(계정 수) | 보드가 있는 동안 (일일 도전은 61일) |
| `bn-boards` | `b/<보드 키>/e/<uid>` | 계정의 최고 기록 `{id: 로그인 아이디, uid, t, s, w?, h, c, l, gr?, dt?, d, rn: 런 nonce}` | 같음 · 탈퇴하면 삭제 |
| `bn-boards` | `u/<uid>/<보드 키>` | 이 계정이 기록을 둔 보드 표시 `{at}` (탈퇴·별명 바꾸기용) | 같음 |
| `bn-ghosts` | `<보드 키>/<uid>` | 고스트 `{data: 받은 base64 그대로, t, h, c, at}` — 상위 20위 안의 최고 기록만 | 20위 밖으로 밀리면 바로 삭제 |
| `bn-runs` | `used/<시작 시각 UTC YYYYMMDDHH>/<nonce>` | 제출한 런 `{at}` (같은 런 두 번 제출 방지) | 7시간 뒤 정리 |
| `bn-nicks` | `<소문자 별명의 UTF-8 hex>` | `{uid, id, nick, at}` (대소문자 무시 중복 방지) | 별명을 바꾸거나 탈퇴하면 삭제 |
| `bn-users` | `<아이디>` 의 `nick` 필드 | 공개 별명 | 계정과 같이 |
| `bn-ratelimit` | `acct/<uid>/run-s`·`run-m`·`run-d`·`nick` | 계정별 요청 수 (런 시작 10분 60번, 제출 1분 6번·하루 300번, 별명 1시간 10번) | 창 시작 3시간 뒤 정리 (하루 제출 수는 26시간 뒤) · 탈퇴하면 삭제 |

- `<보드 키>` = 보드 ID 의 `:` 를 `.` 로 바꾼 것 (`practice:s01:normal` → `practice.s01.normal`). 저장소 키에는 한글·`#`·`:` 를 쓰지 않는다(주소·파일 경로 안전).
- **공개되는 것**: 별명, 기록 값(시간·점수·웨이브·영웅·직업·레벨), 기록 시각, 고스트 데이터. 로그인 아이디·uid 는 응답에 절대 넣지 않는다(시험이 확인). 런 토큰에도 uid 대신 그 HMAC 꼬리표만 들어간다.
- 기록의 `id`(로그인 아이디)는 운영 도구 `board` 에서 누구의 기록인지 보이려고만 둔다.
- IP 는 저장하지 않는다(망 해시도 쓰지 않는다 — 온라인 기록 제한은 모두 계정 단위).

## 2. 동작 요약

- **런**: `POST /api/runs` 가 `{보드, 계정 꼬리표, 시작 시각, nonce}` 를 HMAC 으로 서명한 토큰을 준다(6시간 유효 — 서바이벌·무한의 탑은 30시간: 기록 시간 상한 24시간과 맞춰 6시간이 넘는 긴 탑 런도 올린다, `online.mts runTtlOf`·`ONLINE.endlessRunTtlMs`. 층마다 3초 하한은 그대로). 제출 때 서명·만료·계정·보드·값 범위·시간 검사(걸린 시간 ≥ time × 0.9 − 3초)를 모두 통과한 뒤에야 nonce 를 `bn-runs` 에 `onlyIfNew` 로 적는다 — 검사에 걸린 제출은 런을 쓰지 않으므로 고쳐서 다시 보낼 수 있다. 서버 오류(5xx)면 nonce 를 돌려줘 같은 런으로 다시 보낼 수 있다(최고 기록만 남으므로 안전, 같은 런이 세운 기록이면 `best:true`).
- **최고 기록**: `b/…/e/<uid>` 를 조건부 쓰기로 고친다 — 더 좋을 때만. 동시에 끝난 런 여럿도 가장 좋은 것이 남는다.
- **순위 목록**: `b/…/i` 하나에 상위 150개와 계정 수를 두고 조건부 쓰기 + 재시도(16번)로 고친다. 목록의 항목도 '더 좋은 기록'만 받으므로 늦게 도착한 옛 갱신이 새 기록을 덮지 못한다. 순위는 100위까지 알려 주고, 100위 안의 기록이 지워지면 101~150위가 올라온다. 순위 목록 쓰기가 끝내 실패하면 기록은 남고(500), 그 계정의 다음 제출이 목록을 다시 맞춘다.
- **정렬**: 보스 러시·일일 = time 작은 순, 서바이벌 = wave 큰 순 → score 큰 순, 연습 = time 작은 순 → score 큰 순, 모두 같으면 먼저 세운 기록.
- **고스트**: 최고 기록을 갱신한 제출에 고스트가 있으면 먼저 저장하고, 순위 목록을 고친 뒤 20위 밖이면 바로 지운다. 다른 기록에 밀려 21위가 된 계정의 고스트도 그때 지운다. `GET /api/ghosts/<보드>/<순위>` 는 목록의 `g` 표시와 기록 시간이 맞을 때만 준다.
- **별명**: 첫 제출 때 없으면 `헌터#1234`. `PUT /api/profile/nick` 은 2~12자 한글·영문·숫자·`_`, 금칙어(욕설·비하·운영자 사칭 — `nick.mts` `BANNED_PARTS`·`BANNED_EXACT`, `_`·숫자를 끼워도 걸린다)와 자기 로그인 아이디가 들어간 별명을 거절한다. 대소문자 무시로 겹치면 `#숫자 4자리`(드물게 6자리)를 붙인다. 바꾸면 기록을 둔 보드의 순위 목록 별명도 고친다.
- **일일 도전**: 한국 날짜 + `AUTH_PEPPER` 에서 유도한 키의 HMAC 으로 시드·스테이지(s01~s20)·난이도(normal/hard)·헌터·직업·헌터 등급·규칙 1~2개를 정한다. 같은 날은 모두 같고, 키를 모르면 미리 알 수 없다. 캐시는 5분이되 다음 한국 자정을 넘지 않는다.
- **캐시**: 순위표·고스트 공개 응답 `public, max-age=30` + `Vary: Authorization`(로그인한 요청은 `no-store` + `me`). 일일 도전 `public, max-age≤300`. 그 밖은 `no-store`.

## 3. 보관·정리

매일 도는 정리 함수(`netlify/functions/cleanup.mts` → `netlify/lib/cleanup.mts`)가 지운다:

- `bn-runs`: 시작 시각 + 가장 긴 유효 기간(30시간) + 여유 1시간이 지난 제출 기록 (키만 보고 지운다 — 키에 보드가 없으므로 모든 런을 30시간으로 본다).
- 일일 도전: 오늘(한국)부터 61일보다 오래된 `b/daily.<날>/…`(순위 목록·기록)과 그 표시 `u/<uid>/daily.<날>`, 고스트. 제출은 60일 전 보드까지만 받는다.
- 순위 목록에 고스트 표시가 없는 고스트(1시간 지난 것 — 저장 도중 실패·밀려난 뒤 지우기 실패).
- `bn-nicks`: 주인 계정이 없거나 주인의 지금 별명이 아닌 항목(1시간 지난 것).
- `bn-ratelimit` 의 `acct/…` 카운터: 다른 제한 기록과 같이 (하루 제출 수는 하루 창 뒤).
- 보스 러시·서바이벌·연습 보드는 지우지 않는다(계정이 탈퇴하면 그 계정의 기록만 지운다).

**탈퇴**(`DELETE /api/auth/account`, 운영 `delete`): 세이브와 함께 그 계정의 모든 순위 기록·고스트·보드 표시·순위 목록 항목(계정 수도 줄인다), 별명 자리, 계정별 제한 기록을 지운다. 탈퇴 도중 끝난 제출은 쓴 뒤 계정이 아직 있는지 확인해 없으면 스스로 지운다.

## 4. 운영 — 문제가 있는 기록·별명

```bash
export NETLIFY_SITE_ID=<사이트 ID> NETLIFY_AUTH_TOKEN=<개인 액세스 토큰> AUTH_PEPPER=<운영과 같은 값>

node tools/accounts/admin.mjs board practice:s01:normal 20        # 순위표 (별명 옆에 로그인 아이디 — 밖에 공유하지 말 것)
node tools/accounts/admin.mjs board-remove practice:s01:normal 1 --yes     # 1위 계정의 그 보드 기록·고스트 삭제
node tools/accounts/admin.mjs board-remove daily:20261005 수상한별명 --yes  # 별명으로 (대소문자 무시)
node tools/accounts/admin.mjs nick 나쁜별명                        # 자동 별명(헌터#1234)으로 바꾸기 — 지금 별명 또는 로그인 아이디로 찾는다
node tools/accounts/admin.mjs nick hunter_01 새별명                # 지정 (검사·금칙어는 똑같이, 겹치면 #숫자)
node tools/accounts/admin.mjs show hunter_01                      # 계정 요약에 별명·기록을 둔 보드 목록
```

- 보드 ID: `bossrush:<0~4>:<난이도>`, `survival:<난이도>`, `practice:<s01~s20>:<난이도>`, `daily:<YYYYMMDD>`, `tower:<난이도>` (난이도 `easy|normal|hard|nightmare|inferno`).
- 기록을 지워도 그 계정은 다시 제출할 수 있다. 같은 계정이 계속 문제면 `delete`(계정 삭제) 또는 `revoke`.
- 금칙어를 늘리려면 `netlify/lib/nick.mts` 의 목록을 고치고 배포한다(이미 쓰는 별명은 그대로 — 필요하면 `nick` 으로 바꾼다).
- `AUTH_PEPPER` 가 없으면 런 토큰 서명·일일 도전 키가 공개된 고정 문자열이라 위조·예측이 가능하다(함수 로그에 `[online] 경고` 가 한 번 남는다). 운영에는 반드시 넣는다. 바꾸면 진행 중인 런 토큰이 무효가 되고 오늘의 도전 내용이 바뀐다.

## 5. 한계

- 서버는 값이 말이 되는지만 본다(계약 §0). 고스트·점수 자체를 다시 계산하지 않으므로 마음먹은 조작은 막지 못한다 — 눈에 띄는 기록은 `board-remove` 로 지운다.
- 일일 도전 제출이 그날의 헌터·직업·등급으로 플레이했는지는 확인하지 않는다(계약에 없음).
- 로컬 BlobsServer(`netlify dev`)는 읽기에 ETag 를 주지 않고 `onlyIfNew` 도 동시 요청에 원자적이지 않다 — 동시성 시험은 메모리 모드에서만 돈다. 운영 Netlify Blobs 는 조건부 쓰기를 지킨다.
