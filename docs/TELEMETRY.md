# 익명 통계 · 오류 보내기 (블러드 녹턴)

게임은 헤드리스 브라우저에서만 시험했다. 실제 플레이어의 기기에서 무엇이 깨지고(오류), 어디서 죽고(사망 지점), 얼마나 걸리고(클리어 시간), 얼마나 부드러운지(fps)를 알기 위해 **익명** 통계를 모은다. 계정·이름·IP 는 모으지 않는다.

| 항목 | 위치 |
|---|---|
| 클라이언트 | `src/core/telemetry.js` (`main.js` 가 부팅 때 `telemetry.init(game)`, `game.telemetry`) |
| 설정 줄 | 설정 › 기타 › **익명 통계·오류 보내기** (`settings.telemetry`, `src/core/save.js`) |
| 타이틀 안내 | 오른쪽 아래 알림 카드 한 번 (`src/scenes/title.js`, 닫으면 `meta.tips.telemetry`) |
| 서버 | `POST /api/t` · `GET /api/stats` (`netlify/lib/telemetry.mts`, 라우터 `netlify/lib/router.mts`) |
| 모으기 | 매시 예약 함수 `netlify/functions/telemetry_agg.mts` |
| 정리 | 매일 예약 함수 `netlify/functions/cleanup.mts` → `netlify/lib/cleanup.mts` (30일 지난 원본) |
| 숫자 | `netlify/lib/config.mts` 의 `TELEMETRY` |
| 보고서 | `node tools/telemetry/report.mjs <사이트> [--days 7] [--out dist/telemetry_report.html]` (§5) |
| 시험 | `npm run test:telemetry` (서버, 메모리 저장소) · `npm run test:telemetry:client` (헤드리스 Chromium) |

## 1. 모으는 것

모든 사건에는 종류 `t` 와 세션 시작 뒤 초 `s` 가 붙는다. 묶음(`{v:1, id, sid, ev:[…]}`)마다 **설치 번호** `id`(이 기기에서 처음 보낼 때 만든 무작위 128비트, base64url 22자)와 **세션 번호** `sid`(페이지를 열 때마다 새 무작위 64비트)가 붙는다. 둘 다 계정·기기 정보에서 만든 값이 아니다. 설치 번호는 `localStorage.bn_tid` 에만 있고 세이브 메타(클라우드에 올라가는 `game.meta`)에는 넣지 않는다 — 계정과 이어지지 않게.

| 사건 | 필드 | 언제 |
|---|---|---|
| `session_start` | 빌드 버전 `b`, 플랫폼 `plat` (web·pwa·apk), OS 종류 `os`, 브라우저 종류 `br`, 화면 크기 `vp` (CSS px 를 100 단위로 내림, 예 `800x300`), 픽셀 배율 `dpr` (0.25 단위), CPU 코어 `cores` (1·2·4·6·8·12·16·24·32 로 내림), 메모리 `mem` (브라우저가 주는 GB 값, 있을 때만), 품질 설정 `q`, 시작 품질 등급 `tier`, 입력 `input` (터치 화면이면 touch, 아니면 kb) | 켜진 뒤 1초 |
| `error` | 문구 `msg` (≤ 300자, 주소는 경로만·쿼리 없음, 메일은 가림), 스택 위 5줄 `fr` (`파일:줄:칸`, 사이트 주소·쿼리 없음), 종류 `kind` (error = 처리 안 된 오류 · rejection = 처리 안 된 약속 거부 · caught = 게임이 잡은 오류: 버스 구독자 `bus` · 그리기 `render`), `where`, 장면 `scene`, 스테이지 `stage`·방 `room`, 빌드 `b` | 그때. 같은 오류는 실행마다 3번, 모두 25번까지. 확장 프로그램 오류·`Script error.`·ResizeObserver 경고는 버린다 |
| `perf` | 평균 fps `fps`, 하위 5 % fps `p5` (1초마다 읽은 `game.fps` 60개에서), 품질 등급 `tier`, JS 힙 MB `heap` (Chromium 만), 표본 길이 `dur` (60), 장면 | 게임 장면(스테이지·마을·아케이드)이 보이는 동안 60초마다 |
| `stage_start` | 스테이지·모드(story·practice·bossrush·survival)·영웅·직업·레벨·난이도·그때의 입력 기기 `in` (kb·pad·touch) | 스테이지에 들어갈 때 (마을 제외) |
| `stage_clear` | 스테이지·모드·클리어 시간·랭크·그 스테이지에서 죽은 횟수·영웅·직업·레벨·난이도 | 결과 화면 (`stageCleared`) |
| `death` | 스테이지·방·칸 x/y (영웅 발 위치, 타일 단위)·원인 `cause` (`enemy:<적 id>` · `boss:<보스 id>` · `hazard` 함정·지형 · `fall` 낙사 · `unknown`)·영웅·레벨·스테이지 시간·모드·난이도 | 사망 순간 (`playerDied {cause}`) |
| `boss_result` | 보스·스테이지·싸움 시간 `dur` (보스전 시작부터)·승패 `win`·영웅·레벨·난이도·모드 | 보스 격파, 또는 보스전 중 사망 (스토리·연습 보스전만, 보스 러시는 아케이드 결과로) |
| `arcade_result` | 모드(`practice`·`bossrush`·`survival`·`tower`)·점수·웨이브(무한의 탑은 돌파한 층)·격파한 보스 수·시간·클리어 여부·영웅·난이도 | 아케이드 정산 (`arcadeFinished`) |
| (회차) | `stage_start`·`stage_clear`·`death`·`boss_result` 의 선택 필드 **`ng`** = 지난 회차 수 (정수 1–9, 회차 「피의 윤회」 — docs/specs/ngplus.md §7). 스토리 회차일 때만 싣는다 (`world.ng`, 없으면 세이브 `ng.n`) — 1회차·아케이드·연습에는 없다. 서버는 0·10·문자열을 거절한다 | 그 사건과 같이 |

허용 목록 밖의 사건 종류·필드는 클라이언트가 만들지 않고, 서버는 그런 묶음을 통째로 거절한다(400).

## 2. 모으지 않는 것

- 계정 아이디·비밀번호·토큰, 플레이어 이름(이니셜), 세이브 내용, 저장 코드.
- IP 주소: 서버는 요청 제한을 위해 망(IPv4 주소 또는 IPv6 /64)의 해시(`AUTH_PEPPER` HMAC)를 `bn-ratelimit` 에 몇 시간 두지만(`ip/tel/<해시>`, 매일 정리), 통계 저장소 `bn-telemetry` 에는 IP·요청 헤더(User-Agent 원문 포함)를 넣지 않는다.
- 사이트 주소·쿼리 문자열(스택·문구에서 뗀다), 메일 주소·긴 토큰 모양 문자열(서버가 한 번 더 가린다).
- 정확한 기기 모델·화면 해상도·위치·언어·시간대.

## 3. 보내는 방법과 보내지 않는 곳

- 메모리 줄 + `localStorage.bn_tq` 사본(최대 200, 넘치면 오래된 것부터 버림) → 30초마다, 그리고 화면이 숨을 때(visibilitychange → hidden · pagehide) `POST /api/t` (한 번에 ≤ 50건 · ≤ 24KB, 같은 출처만 — CSP `connect-src 'self'`).
  - 웹: 숨을 때는 `navigator.sendBeacon` (본문 `text/plain` — Chrome 이 sendBeacon 의 JSON 형식을 막는다), 평소엔 `fetch(keepalive)`.
  - 안드로이드 앱: WebView 는 가로챈 요청의 본문을 넘겨주지 않아 sendBeacon 본문이 프록시에 닿지 않는다. 그래서 앱 조각(`head_inject.html`)이 감싼 `window.fetch` 로만 보낸다 → `AssetServer` → `ApiProxy` → 같은 `/api/t` (docs/ACCOUNTS.md §1). `/api` 프록시가 없는 옛 앱은 보내지 않는다.
  - 오프라인·429·5xx 는 줄에 두고 나중에(30초에서 두 배씩, 최대 10분; `Retry-After` 를 따름), 400·413·415 는 그 묶음을 버리고, 404·405(이 사이트에 API 없음)는 그 실행 동안 그만둔다.
- 게임을 멈추지 않는다: 모든 일은 버스 구독·1초 타이머·이벤트 처리기 안에서 `try/catch`, 보내기는 비동기.
- **보내지 않는 곳** (구독·타이머를 하나도 걸지 않는다): `navigator.webdriver`(자동화·QA·`smoke_deployed.mjs`), `localhost`·`127.0.0.1`, `http:`, 개발 스위치 `?debug ?scene= ?stage= ?nosw ?feelstats ?painted ?lo ?qa ?ng=`, claude.ai 임베드, 프록시 없는 옛 앱. `?telemetry=1` 은 이 검사만 건너뛴다(시험용 — 설정·GPC 는 그대로 따른다). `?telemetry=0` 은 늘 끈다.

## 4. 끄기 · 보관 기간

- **끄기**: 설정 › 기타 › **익명 통계·오류 보내기** 를 끈다. 끄면 그 즉시(1초 안) 보내지 않은 사건과 설치 번호(`bn_tid`·`bn_tq`)를 지운다. 다시 켜면 새 설치 번호로 시작한다.
- 브라우저가 **Global Privacy Control** (`navigator.globalPrivacyControl === true`)을 알리면 기본값이 꺼짐이다 (`DEFAULT_SETTINGS.telemetry`, 설정을 아직 저장한 적 없는 기기).
- 타이틀의 안내 카드는 ✕ 를 누르거나, 3초 넘게 본 뒤 타이틀을 떠나면 다시 나오지 않는다 (`meta.tips.telemetry`).
- **보관**: 받은 묶음 원본 `raw/<날>/<시>/…` 과 시간 요약 `hour/<날>/<시>` 은 **30일** 뒤 매일 정리 함수가 지운다. 날 요약 `agg/<날>` 은 개수·분포뿐이라(설치·세션 번호 없음) **계속 보관**한다.

## 5. 서버와 보고서

### API
| 요청 | 설명 |
|---|---|
| `POST /api/t` | 본문 `application/json` 또는 `text/plain`, ≤ 32KB(넘으면 413), 사건 1–50개. 필드 허용 목록·형식·범위·길이를 검사하고(틀리면 400 `bad_request`) 망별 10분에 120묶음(넘으면 429 `rate_limited` + `Retry-After`) → `bn-telemetry` 의 `raw/<UTC 날>/<시>/<무작위>` 에 `{v, id, sid, ev, at}` 로 저장 → **204** (본문 없음) |
| `GET /api/stats?days=N` | N = 1–30 (기본 7, 그 밖은 400). 최근 N일(UTC, 오늘 포함)의 `agg/<날>` 을 합친 `{ok, days, from, to, generatedAt, daily:[{day, sessions, events, errors, deaths, clears}], totals, summary}`. 공개 — 식별 정보 없음. `Cache-Control: public, max-age=60` |

### 모으기 (매시, `telemetry_agg.mts`)
- 최근 3일의 원본 키를 시간 칸별로 모아, **끝난 칸**(칸 끝 + 5분)의 키 목록 지문(개수 + 해시)이 `state/agg` 에 적힌 것과 다르면 그 칸의 원본 **전부**로 `hour/<칸>` 을 새로 계산하고, 바뀐 날은 그날 시간 요약을 합쳐 `agg/<날>` 을 새로 쓴다(`summary` 파생 값 포함). 더하지 않고 다시 계산하므로 다시 돌려도·중간에 실패해도·늦게 들어온 원본이 있어도 두 번 세지 않는다. 한 번에 원본 3,000개까지(남은 칸은 다음 시간).
- 함수가 3일 넘게 멈췄었다면 `runAggregation(ctx, {days: 31})` 로 한 번 더 돌린다 (원본은 30일 남는다).
- 회차(`ng`) 사건: 시작·클리어는 난이도 칸을 `<난이도>_ng<n>` (예 `s01|normal_ng2`)으로 따로 세어 보고서에 별도 줄로 나오고, 사망·보스 표에는 넣지 않는다 (레벨 70 영웅이 1회차 사망 지점·보스 승률을 흐리지 않게 — 종류별 수에는 들어가고 원본에는 30일 남는다).
- 요약 내용: 종류별 수, 세션 수, 플랫폼·OS·브라우저·화면·배율·코어·메모리·품질·입력·빌드 분포, fps·하위 5 % fps·힙 히스토그램, 스테이지·난이도별 시작/클리어(시간 히스토그램·랭크·사망), 스테이지·방별 사망(원인, 많은 칸 40개), 보스 승패·이긴 싸움 시간, 아케이드 점수·웨이브·시간, 오류(문구의 숫자를 #로 바꾼 것 + 첫 프레임으로 묶은 서명 → 횟수와 첫 표본, 많은 순 100개). 시간·점수는 유효 숫자 두 자리 칸(예 245초 → 240)으로 모아 백분위는 칸의 아래 끝이다.

### 보고서 읽기
```bash
node tools/telemetry/report.mjs https://blood-nocturne.netlify.app --days 7      # → dist/telemetry_report.html
curl -s 'https://blood-nocturne.netlify.app/api/stats?days=30' > stats.json      # 또는 받아 둔 것으로 (오프라인)
node tools/telemetry/report.mjs --file stats.json --out dist/telemetry_30d.html
```
한 파일짜리 HTML(스크립트·외부 자원 없음, 밝은·어두운 화면)이다. 이름은 저장소의 `src/data` 에서 읽는다.
- **요약·날별 세션**: 기간의 세션·사건·오류·사망·클리어 수. 집계는 매시 한 번이라 지난 1시간 남짓은 아직 없다.
- **많이 난 오류**: 위에서부터 고친다. 프레임은 배포 번들(`src/bundle/<해시>/app.js:줄:칸`)을 가리키므로, 같은 빌드(`b`)의 `dist/web/src/bundle/<해시>/` 에서 그 줄·칸을 찾는다(번들은 줄을 대부분 살린다). 빌드가 다르면 그 빌드를 다시 만들어 본다.
- **사망 지점**: 스테이지마다 원인·방 순위와, 사망이 많은 방 4개의 지도(회색 땅·주황 가시) 위 빨간 원(죽은 칸, 클수록 많음). 한 칸에 몰리면 그 자리의 적 배치·함정·발판을 본다.
- **클리어 시간**: 스테이지·난이도별 클리어 수·시작 수·클리어율·p25/중앙값/p75/p90·랭크·클리어당 사망. 시작은 많은데 클리어율이 낮은 곳이 막히는 곳이다.
- **보스**: 승률 낮은 순. 패는 보스전 중 사망 한 번, 시간은 보스전 시작부터 이긴 순간까지의 중앙값.
- **아케이드**: 모드별 판 수·클리어·점수/웨이브/시간 분포.
- **기기·성능**: 실제 플레이어의 플랫폼·OS·브라우저·화면·배율·코어·메모리 분포, 1분마다의 평균·하위 5 % fps 분포. 하위 5 % 가 30 fps 아래에 몰리면 그 등급의 예산(`docs/ARCHITECTURE.md` §4 품질 조절기)을 다시 본다.

## 6. 시험
```bash
npm run test:telemetry          # 서버: 검사 거절·32KB·망별 제한·원본 저장(IP 없음)·모으기 멱등·공개 통계·정리·보고서·클라이언트와 같은 계약·회차 ng
npm run test:telemetry:client   # 브라우저: ?telemetry=1 로 session_start·오류(프레임 정리)·스테이지/사망/보스/클리어/아케이드 모양·끄기·GPC·
                                #   webdriver 면 0건·공식 사이트 흉내(sendBeacon, 운영 CSP)·안드로이드 앱 흉내(감싼 fetch)
```

## 7. 배포 메모
- 새 저장소 `bn-telemetry` 는 Blobs 가 처음 쓸 때 만든다. 운영은 사이트 전역, 미리보기·브랜치는 배포별 저장소다 (계정 API 와 같다).
- 새 예약 함수 `telemetry_agg`(`@hourly`)는 `cleanup` 과 같이 함수 파일의 `config.schedule` 로 예약된다 — `netlify.toml` 에 따로 적지 않는다. `tools/deploy/build_web.mjs` 의 `dist/deploy` 묶음은 `netlify/functions`·`netlify/lib` 를 통째로 복사하므로 함께 올라간다.
- `AUTH_PEPPER` 가 있으면 망 키가 HMAC 이 된다 (docs/ACCOUNTS.md §6).
