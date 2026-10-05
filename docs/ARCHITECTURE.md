# 블러드 녹턴 (BLOOD NOCTURNE) — 아키텍처 & 콘텐츠 계약서

2D 횡스크롤 고딕 액션(악마성 스타일) + 아케이드 요소. **순수 HTML5 Canvas + ES 모듈(게임 자체는 빌드 없음)**. 데스크톱(키보드/게임패드)·모바일(캔버스 가상 패드)·안드로이드 앱(WebView APK) 모두 지원.
1부(13장, 드라큘라의 성) + 2부 「균열의 순례」(s14–s20, 일곱 이계) · 동료(탈것 9 · 수호신 11) · 각성기 · 채색 컷아웃 퍼펫 그림.

- 이 문서 = **지금 코드에 있는 계약**의 지도. 결정의 근거는 `docs/specs/MASTER_PLAN.md` §1 (여러 명세가 부딪칠 때 이긴다) → `docs/specs/{feel,platform,world2,companions}.md` → `docs/specs/ART_DECISION.md`. 계정·클라우드 저장은 `docs/ACCOUNTS.md`, 채색 그림 제작은 `docs/art/*_PIPELINE.md`, 배포는 `tools/deploy/README.md`.
- 각 모듈의 머리말 주석이 가장 자세한 계약이다. 여기서는 파일 위치·공개 API·데이터 흐름·ID 목록만 모은다. 코드와 이 문서가 다르면 **코드가 맞고 이 문서가 낡은 것**이다 (고치는 곳: DOCS-ARCH → W4 FIX-TOOLS).
- 마지막 전면 갱신: 2026-09-28 (W3 DOCS-ARCH, 같은 날 검수에서 코드와 다시 대조). 「진행 중」 표시는 이 시점에 아직 작업 중이던 패키지(부록 A)의 계약이다.
- W4 1회차 동기화 (2026-09-29, FIX-TOOLS; 줄마다 코드와 대조): 두 단계 부팅·지연 장면(§3·§4), feel §8 계측, 늦게 받는 보스(§11.4), 시작 위치 옮기기·`bossReady`(§4·§8), 데미지 숫자 기둥·`setHudBand`(§4), HUD 클립·스프라이트 캐시(§9), 채색 텍스처 예산(§4·§12), 동료 조준·수호신 FX(§10), 각성 감독 늦게 받기(§7.4), 이동 발판 개별 설정(§8), QA 도구의 부팅 대기·성능 예산(§14).
- W4 1회차 추가 동기화 (2026-09-29, FIX-TOOLS 3차; 코드와 대조): `game.flashCapped`(§4), 가상 패드 백킹 놓기(§5.1), 메뉴의 `releaseChunks`·`releaseHeroOffscreen`·영웅 오프스크린 0.25 MP 상한(§6), ultfx 0×0 풀(§7.3), 보스 대역 거르기(§4·§9·§10), 번들러 조각 상한·`--restamp`·buildHash(§13), `platform_load` 단계 나누기(§14).

## 목차
0. 실행·디버그·검사 명령 · 1. 좌표/단위 · 2. 파일 지도와 규칙 · 3. 부팅과 프레임 흐름 · 4. 코어 API · 5. 입력·설정·저장 ·
6. 플랫폼 셸 · 7. 손맛(이동·타격·필살기·각성기) · 8. 훅 지점 · 9. HUD · 10. 동료 · 11. 제2부 · 12. 채색 그림 시스템 ·
13. 배포(웹·서비스 워커·APK) · 14. QA 도구 · 15. 콘텐츠 ID 목록 (능력치·외형·아이템·적·보스·비전서·유물·NPC·스토리·CG·음악·효과음·장면·이벤트) · 부록

---

## 0. 실행·디버그·검사 명령

- 개발 서버: `node tools/serve.mjs 8080` → `http://localhost:8080/` (번들 없이 모듈 그대로; 서비스 워커는 개발용 네트워크 우선)
- 바로 스테이지: `index.html?scene=stage&stage=s03&char=lia&room=r2&debug` (debug = 히트박스/FPS 표시)
- 스모크: `node tools/smoke.mjs --url "index.html?scene=stage&stage=s01" --out /tmp/claude-0/shots_x --steps "right:1,attack:0.2,shot"` → 콘솔 오류 목록 + 스크린샷
  - `--steps` 토큰: `right|left|up|down|jump|attack|dash|sub|skill1|skill2|ult|menu|enter|swap[:초]` (그 밖의 이름은 KeyboardEvent code 그대로, 예 `KeyV:0.6`), `a+b:초`(동시), `wait:초`, `shot`, `eval=JS식`(쉼표 금지 — 토큰 구분자) · `--mobile` = 844×390 터치 기기
- 맵 검증: `node tools/validate_maps.mjs [stageId] [--debug s14:r2] [--stages 모듈] [--tight]` (오류 0이어야 함; 2부 기믹 문자·도달성 포함. `--tight` = 천장 아래 빠듯한 점프로만 닿는 출구·문·보스 트리거를 후보 경고로 보여 줌 — 어림 규칙이라 실제 궤적으로 확인할 것, 기본 검사에는 없음)
- 결정적 시험 방법 (부하가 큰 기계에서도 같은 결과): 페이지에서 루프를 멈추고(`game._pageHidden = true`) `game.tick(1/60)` 을 직접 돌린다. `window.__game` = Game. 헤드리스 Chromium: `import { chromium } from 'playwright-core'`, `executablePath '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`. 공용 도우미는 `tools/qa/lib/` (`step.mjs`, `perfprobe.mjs`, `suite.mjs` …).

**디버그 URL 파라미터**
| 파라미터 | 뜻 |
|---|---|
| `scene=<이름>` | 그 장면으로 바로 (스택에 혼자면 닫힐 때 타이틀/마을로, P-26). 예: `scene=hub`, `scene=worldmap`, `scene=stable`, `scene=awakenCutin&char=lia`, `scene=ultCutin&char=lia` |
| `stage=` `room=` `char=` `diff=` | 스테이지·방·영웅·난이도 (`?scene=stage` 의 임시 세이브, main.js) |
| `class=` | 직업 — 컷인 장면(`scene=ultCutin`·`awakenCutin`)을 혼자 열 때만 읽는다 (`overlays.js`; 스테이지 임시 세이브의 직업은 바꾸지 않는다) |
| `preset=` `course=` (+ `diff=` `stage=` `char=`) | 아케이드 장면(`scene=survival`·`bossrush`·`practice`)을 메뉴 없이 열 때 (`arcade_run.js` `directStart`) |
| `debug` · `debug=taps` | 히트박스·FPS / 등록된 모든 탭 영역 (초록 OK · 노랑 최소 미달 · 빨강 32 CSS px 미만) |
| `cmp=all\|id,id` `cmplv=N` `bond=N` `mount=id` `guards=id,id` `egg=id,id` `ride=1` `ch=N` | 동료 임시 세이브 (`applyCompanionDebug`, `?scene=stage`·`?scene=hub` 에서) |
| `painted=0` | 채색 그림 전부 끄기 (벡터 대체; `window.__paintedOff = true` 와 같음). 적만: `window.__paintedEnemies = false` |
| `nosw` | 서비스 워커 등록 안 함 |
| `lo=1\|auto\|0` | 저사양 그림 변형 `assets/lo/` 강제 · 자동(lo 목록 없이도 시도) · 끔 |

**검사 명령 요약** (전체 회차: `node tools/qa/run_all.mjs [--quick] [--list]`, 결과 `/tmp/claude-0/qa/run_all.{json,md}`)
| 묶음 | 명령 |
|---|---|
| 정적 | `node tools/validate_maps.mjs` · `node tools/test_part2.mjs --static` · `python3 tools/fonts/build_fonts.py --check` · `node tools/qa/hook_tags.mjs` · `node tools/qa/bindings.mjs` · `node tools/qa/painted_registry.mjs` |
| 단위 | `node tools/test_save_v2.mjs` · `node tools/test_settings_v2.mjs` · `node tools/test_companion_state.mjs` · `node tools/accounts/test_api.mjs` (`npm run test:api`) · `node tools/test_sfx.mjs` · `node tools/test_hud_layout.mjs` |
| 밸런스 | `node tools/balance.mjs normal <charId> --check` (2부 행을 world2 §15 목표와 비교; `--strict`, `--json`, `--k`) |
| 실행 | `node tools/integration.mjs [--only s14,s14_boss,hub,menu] [--mobile] [--dist] [--list]` · `node tools/test_part2.mjs [--only …] [--boss …]` · `node tools/test_mount.mjs [--only mt_ignis,…]` · `node tools/test_guardians.mjs [--only A,B] [--mobile]` · `node tools/qa/commands.mjs` · `node tools/feel_test.mjs [--quick] [--only M,C5,A]` |
| 플랫폼 | `node tools/qa/run_platform.mjs [--only pad,bind,touch,view,menu,pwa,load,turntable]` (`npm run qa:platform`) · `node tools/qa/turntable.mjs` |
| 성능·지속·시각 | `node tools/qa/perf_budget.mjs [--quick] [--profiles …]` · `node tools/qa/soak.mjs --minutes 10` · `node tools/qa/visual_review.mjs [--quick]` |
| 배포 | `node tools/deploy/build_web.mjs [--selftest-deny]` · `node tools/qa/platform_load.mjs --dist` · `node tools/deploy/test_sw.mjs` · `node tools/deploy/build_artifact.mjs --check` · `node tools/deploy/smoke_deployed.mjs --local` · `tools/apk/build_apk.sh --verify` |

(MASTER_PLAN §5.1 delivery 행: `build_web.mjs` → `platform_load.mjs --dist` → `deploy/test_sw.mjs`.)

## 1. 좌표/단위
- 논리 해상도: 높이 540 고정, 폭 960~1280 (`game.viewW`). 타일 `TILE = 48`. 휴대폰은 폭이 넓다 (844×390 CSS → vw 1168, 740×360 → vw 1110).
- 엔티티 `x,y` = AABB 좌상단. 그리기 기준점은 **발 중앙 (cx, bottom)**. 오른쪽을 보는 상태로 그리고 `facing`(±1)으로 좌우 반전.
- 속도 px/s, 중력 2200 px/s², 시간 초. 고정 타임스텝 60Hz (`STEP = 1/60`).
- 공격 판정 `box {x,y,w,h}` 는 **발 중앙 기준**, x 는 전방(+), y 는 위로 음수.
- uiScale 장면은 `ctx.scale(game.uiK)` 안에서 `game.uiW × game.uiH` (최소 720×400) UI px 로 배치한다 (§6). 탭 크기의 기준은 CSS px (주 버튼 ≥ 44).

## 2. 파일 지도와 규칙

| 경로 | 내용 |
|---|---|
| `index.html` · `css/style.css`, `css/touchpad.css` · `manifest.webmanifest` · `sw.js` · `robots.txt` | 페이지 셸, 글꼴 `@font-face`, PWA, 서비스 워커 (§13) |
| `src/boot-gate.js` (일반 스크립트) · `src/main.js` | 브라우저 관문·부팅 진행률·오류 화면 → 부트스트랩 (§3) |
| `src/core/` | 엔진: `game`(루프·장면·해상도·품질 조절·토스트), `input`, `prompts`(버튼 글리프), `haptics`, `touchpad`(캔버스 가상 패드), `platform`(안전 영역·전체 화면·서비스 워커), `camera`, `physics`, `particles`, `lighting`, `assets`, `save`, `ui`(글꼴·피 글씨·탭 등록부), `audio`, `sfx_feel`, `audio_companions`, `cloud`(계정), `events`, `math` |
| `src/game/` | 런타임: `world`, `player`, `enemy`, `ai*`(a·b·c·d), `bosses/*`, `combat`, `impact`, `style`, `feel_move`, `awaken`, `awaken_directors(_b)`, `skills`, `skills_p2`, `projectiles`, `pickups`, `props`, `tilemap`, `gimmicks(_b)`, `companions`, `companion_state`, `companion_events`, `mount`, `mount_b`, `guardian`, `guardian_ai_b`, `stats`, `inventory`, `enhance`, `loot`, `progression`, `quests`, `state`, `entity` |
| `src/render/` | 그리기: `hero`(+`hero_parts`, `hero_gait`, `hero_puppet`, `puppet_manifest` 자동 생성), `enemies`(디스패처) + `enemies_a/b/c/d`(벡터), `hud`, `hud_layout`, `feel_hud`, `companion_hud`, `hitfx`, `ultfx`, `mount_rig`, `mounts`, `mounts_b`, `guardians`, `guardians_b`, `icons`, `background`, `tiles`, `painted/`(§12) |
| `src/data/` | 순수 데이터: characters, classes, skills, movesets, items, subweapons, powerups, enemies(+a·b·c·d), bosses(+a·b·c·d), stages, maps/s01…s20·arena, story, story_p2, story_p2b, story_companions, quests, lore, npcs, town, shop, difficulty, music, controls, feel_hit, feel_move, awaken, companions |
| `src/scenes/` | 화면. 등록: `scenes/index.js`(게임플레이·오버레이) · `reg_front.js`(front/*) · `reg_games.js`(games/*) · `reg_menu.js`(menu/*) · `reg_town.js`(town/*) |
| `assets/` | `bg/ cg/ portraits/ tex/`(Kling webp) · `icons/ props/`(Blender png) · `lo/`(저사양 60 % 변형 + index.json) · `fonts/` · `puppets/<char>/<class>/`(영웅·NPC 퍼펫) · `painted/{bosses,enemies,companions}/<id>/`(채색 아틀라스) |
| `netlify/functions/`, `netlify/lib/`, `netlify.toml` | 계정 API (`/api/*`) · 정적 헤더 (docs/ACCOUNTS.md, §13) |
| `android/app/src/main/` | 안드로이드 앱 셸 (MainActivity·AssetServer·ApiProxy·WebViewCheck, assets/app/) |
| `tools/` | serve·smoke·validate_maps·integration·test_*·balance·feel_test · `qa/`(회귀 묶음) · `deploy/`(웹 빌드·SW·아티팩트) · `apk/` · `painted/`·`puppet/`(그림 파이프라인) · `kling/manifest_<pkg>.json` · `blender/` · `fonts/` · `accounts/` · `fixtures/`(save_v1.json, save_ch6_nocmp.json) · `gallery_*.html` |

**규칙**
- 자기 담당 파일만 수정한다 (소유는 `docs/specs/master_plan.json`). 남의 파일 변경이 필요하면 `/tmp/claude-0/plan/requests.jsonl` 에 요청 한 줄. npm 의존성 추가 금지. 커밋은 자동 저장이 한다.
- **순환 import**: 모듈 최상위에서 import 한 값에 접근하지 않는다 (함수 안에서만). 다른 패키지의 새 export 는 `import * as M` 으로 받아 `M.name?.()` 처럼 부른다 (없는 이름을 named import 하면 링크 오류로 게임 전체가 멈춘다, R6). 다른 기능 호출은 `world.gimmickOf?.('wind')`, `game.companions?.recruit?.(id)` 처럼 방어적으로.
- **훅 표식 (R4)**: 기능 사이를 잇는 줄에는 끝에 `// [hook:feel] [hook:awaken] [hook:gimmick] [hook:cmp] [hook:plat] [hook:p2]` 를 단다. 옮길 때 같이 옮긴다. `tools/qa/hook_tags.mjs` 가 개수가 줄지 않았는지 검사한다 (2026-09-28: feel 138 · awaken 23 · gimmick 30 · cmp 104 · plat 37 · p2 33).
- **그리기 코드**: `Math.random`·`rand()`·`world.fx.emit/burst` 금지 (게임플레이 난수를 먹는다 → 채색 키트의 `rr`, `hash1`, 자체 입자). 프레임마다 그라디언트·캔버스 새로 만들지 않기 (캐시). 품질 `world.fx.quality`·`settings.quality/reduceMotion/flashFx` 를 따른다.
- **히트스톱 안전 입력 (R16)**: `world.update()` 는 히트스톱 동안 엔티티를 멈추지만 `input.update()` 는 계속 돈다 → 멈춤을 넘길 수 있는 판정은 `pressed()` 한 번에 기대지 말고 `input.down` + `pressTime/releasedAt`, `buffered()` 를 쓴다.
- 모든 사용자 노출 텍스트는 자연스러운 한국어. 글꼴은 `FONT.*` 와 `ui.text/bloodText` 로만 (글꼴 이름 하드코딩 금지).

## 3. 부팅과 프레임 흐름

```
index.html ─▶ build-info.js(배포 빌드만: window.__BN_BUILD) ─▶ src/boot-gate.js ─▶ src/main.js (배포 빌드: src/bundle/<hash>/app.js)
 boot-gate: 브라우저 관문(지원 안 되면 __BN_BLOCKED + 안내) · 진행률 막대 · 부팅 오류 화면 · window.__BN_BOOT {step, done, fail, progress}
 main.js : (정적 import 는 core/* + scenes/title.js 뿐 = 첫 조각, R1-REQ-229) saves.loadSettings()/loadMeta() → game.init(canvas)
           → initPlatform(game) → game.register('title') → cloud.init → game.lazyScenes(loadRest, {defer: 타이틀로 시작하면 true})
             loadRest = import() 셋: scenes/index.js (registerScenes) · game/quests.js (initQuests) · game/companion_events.js
             (initCompanions → game.companions, applyCompanionDebug) — 한 번만 등록, 실패하면 다시 부른다
           → await ui.fontsReady → ?scene=… 이면 나머지 장면이 올 때까지 기다림 / 타이틀이면 bg/title 최대 2.5초 → game.start()
           → ?scene=… 이면 임시 세이브(newGameState) + 동료 디버그 파라미터 적용 후 그 장면으로, 아니면 'title' → window.__game = game
           → (타이틀) 두 프레임 그린 뒤 game.loadScenes() → 나머지가 오면 초상화 미리 받기 · 한가할 때 awaken.loadAwakenDirectors()
```
두 단계 부팅: 타이틀로 열면 `window.__game` 은 타이틀과 함께 먼저 생기고 나머지 장면은 뒤에 등록된다 (그동안 `game.scenesReady === false`). 그 사이에 등록되지 않은 장면으로 `go/push` 하면 자리 장면 **'loading'**(`PendingScene`: 도는 핏빛 고리 '불러오는 중…', go 자리는 화면 전체 · push 자리는 반투명, 취소 = 닫기/타이틀, 실패하면 '불러오기에 실패했습니다' + 확인·탭으로 다시 시도)이 서고, 장면이 도착하면 같은 params 로 제자리에서 진짜 장면으로 바뀐다. 시험 도구는 `g.scenesReady !== false`(또는 `await g.whenScenes()`)를 기다린 뒤 장면을 움직인다 — `tools/qa/lib/server.mjs` `waitGame()` 기본 조건, `integration.mjs`·`test_part2.mjs`·`test_companions.mjs`·`test_settings_v2.mjs`·`feel_test.mjs`·`qa/lib/rooms.mjs gotoRoom` 이 그렇게 한다 (첫 화면을 재는 `qa/platform_load.mjs` 는 제 조건 그대로).
프레임 (`core/game.js`):
```
rAF ─▶ input.pollFrame() (패드 읽기·진동 정리) ─▶ (세로 잠금이면 진행 멈춤)
    ─▶ game.tick(1/60) × n (최대 5) : input.update → 페이드·flash·vignette·토스트 시간 → 맨 위 장면.update (updateBelow 면 아래도) → audio.update
    ─▶ game.govern(dt) (auto 품질 조절기)
    ─▶ render() (fpsCap 60: 틱이 돈 rAF 또는 game.dirty 일 때만) : 불투명 장면부터 위로, uiScale 장면은 ctx.scale(uiK)
       → flash/vignette → 토스트(스테이지·허브는 hudLayout().toast(i)) (taps 묶음은 rAF 끝 마이크로태스크에서 봉인)
    ─▶ game.syncPad() (가상 패드 표시의 유일한 주인)
```
스테이지 한 틱 (`World.update`, 순서 요약): 히트스톱이면 입자 0.3배 dt · 화면 오버레이 · 카메라(흔들림은 실시간)만 돌리고 끝 (`frozenRecent` 누적) → 슬로모(`slowmoScale`)/`timeStop` 시간 배율 →
엔티티 루프 (맨 앞의 보이지 않는 GimmickDirector 가 `gimmick.beforePlayer`; Player: `mount.tick` → `updateGait` → 이동 → `physics(prePhysics … postPhysics, squashSpring)` → 공격 입력 `handleUltInput` …; CompanionDirector: `companions.update`; 적·보스·투사체 — `timeStop`·`freezeEnemies` 중엔 적 탄 정지) →
`fx.update` → `gimmick.update` → `style.update` → 오버레이(`tickOverlays`) → 보스 페이즈 감시(`pollBossPhase`) → 처치 슬로모 → 콤보 시간 → 카메라(`camera.follow`) → 방 출구·가짜 벽·보스 트리거·클리어 → 조명 수집(`lights`, `gimmick.lights`).
그리기: 먼 배경(거울 허상이면 뒤집기) → 중경 → `gimmick.drawWorld('under')` → 타일 → `'back'` → 엔티티(z 순) → 액체 → `'front'` → 조명 → 앞 배경 → `gimmick.drawScreen` → 손맛 오버레이(레터박스·색보정·집중선·임팩트 프레임) → fx 'top' → HUD(§9).

## 4. 코어 API

- `game` (`core/game.js`): `viewW/viewH`, `state`(세이브), `settings`, `meta`, `world`, `saves`, `audio`, `assets`, `platform`, `companions`(§10),
  `go(name, params, {fade})`, `push(name, params)`, `pop(result)` (마지막 장면이면 타이틀로), `register(name, Class)`, `recordScore(score, stageId, mode)`,
  `flash(color, strength, decay)` (× settings.flashFx, 최대 0.7, 1초 안 0.3 넘는 번쩍임 3번째부터 0.3), `flashCapped(strength = 0.8, record = true) → 0..0.7`(장면이 직접 그리는 번쩍임의 세기: flash 와 같은 규칙을 적용한 알파만 돌려준다; record = true 면 0.3 넘는 번쩍임을 같은 1초 기록(`game.realTime` 기준)에 남기고, false 면 미리 보기만; flash 도 이것을 부른다. `awaken_cutin.js startExitFlash` 가 쓴다 — 장면은 `game._flashLog` 를 읽지 않는다), `vignette(color, a, decay)`, `toast(text, color, time)`,
  `safe {l,r,t,b}`(논리 px)·`safeCss`·`cssScale`·`canvasRect`, `uiK/uiW/uiH`, `tier`/`quality`('low'|'medium'|'high', auto 는 조절기; 결과는 settings.autoTier 로 다음 실행에),
  `dirty`, `syncPad()`, `autoPause()`, `inGameplay`, `hudScene()`, `resize()`. 상수 `VIEW_H MIN_VIEW_W MAX_VIEW_W TILE STEP PAD_SCENES QUALITY_TIERS`.
  지연 장면 (R1-REQ-229, §3): `lazyScenes(loader, {defer}) → Promise<bool>`(실패하면 두 번 더), `loadScenes()`(defer 로 미룬 것을 지금 시작; 등록되지 않은 장면으로 처음 go/push 해도 시작), `whenScenes() → Promise<bool>`, `retryScenes({reload})`(한 번 더 받고 안 되면 페이지 다시 읽기 — Chromium 은 실패한 동적 import 를 기억한다), `scenesReady`(받는 동안 false), `scenesPending`; 자리 장면 `PendingScene`(이름 'loading', `pendingFor`).
  feel §8 계측 (R1-REQ-329): `enableFeelStats()`(?feelstats · ?debug 면 init 에서) → 그린 프레임마다 `publishFeelStats()` 가 `window.__feelStats {particles, dmgNums, ghosts, gradients, heroDraws, sfxStarts, heroDrawsEstimated, frame, t}` 를 고쳐 쓴다. 카운터 `globalThis.__feelCounters` (gradients 는 game.js 가 세고, heroDraws 는 render/hero.js 가 올린다; 다른 모듈도 `globalThis.__feelCounters?.x++`). 꺼져 있으면 아무것도 세지 않는다.
- `Scene`: `enter(params)`, `exit()`, `update(dt)`, `render(ctx)`, `resize()`, `onResume(result)`, `autoPause()`(선택).
  **장면 플래그**: `opaque`(false 면 아래 장면도 그림) · `updateBelow` · `uiScale`(true = uiK 배율 배치·포인터 UI 좌표·글자 하한 11) · `hidePad`/`showPad`(없으면 `PAD_SCENES` = stage hub bossrush survival practice ultCutin) · `padHideButtons`(true | 버튼 id[]) · `hideToasts`/`deferToasts` · `toastX/toastY/toastUp/toastW`(toastW = 상자 최대 폭, ≤ 2줄) · `keepAwake` · `hideCursor`.
- `ui` (`core/ui.js`): `text(ctx,str,x,y,{size,color,align,weight,family,outline,ow,baseline,shadow,maxWidth})`, `wrap`, `paragraph`, `panel`, `bar`, `button(ctx, rect, label, {selected})→tapped`, `ListMenu`, `drawCover`, `vignette`, `hint`, `COLORS`, `RARITY_NAMES`.
  - 글꼴 `FONT = { body, title, logo, blood, num, numDeco, dmg, brush }` (Noto Sans KR · Hahmlet · Grenze Gotisch · Cinzel · BN Num · BN Dmg · BN Brush · BN Seal; `assets/fonts/`, `tools/fonts/`). `fontsReady`(부팅 때 최대 ≈1.8초 대기), `loadFace`, `loadBrush()`(붓글씨를 미리), `faceReady`.
  - 피 글씨 `bloodText(ctx, str, x, y, {size, style:'blood'|'gold'|'bone', drips, t, align, …}) → {w,h}` (비트맵 캐시 — 캔버스는 풀에서 돌려 쓴다, `prewarmTextCanvases()`), `prewarmText`, `clearTextCache`, `TEXT_STYLES`.
  - `core/prompts.js` 글리프 비트맵도 풀 캔버스(`GLYPH_POOL` 64장, 최근 사용 순 LRU)를 돌려 쓴다 — `prewarmGlyphs()` (모듈을 읽을 때). `core/touchpad.js` 의 스킬·보조무기 버튼 그림(hud.js·icons.js·스킬 데이터)은 지연 장면이 온 뒤(늦어도 패드가 처음 보일 때) 받고, 그 전에는 버튼 글자만 그린다.
  - 글꼴 세대 `fontEpoch`(살아 있는 바인딩) · `onFontEpoch(fn(epoch, families))` — 글자를 비트맵으로 굽는 캐시는 세대가 바뀌면 다시 굽는다.
  - 글자 하한 `setTextFloor(n)`/`textFloor()` (uiScale 장면을 그리는 동안 11).
  - **탭 등록부 `taps`**: render 에서 `taps.add(id, rect, {owner, kind:'primary'|'list'|'icon'|'dense', slop})`, update 에서 `taps.hit(owner)`. 터치 모드면 최소 크기(44/36/44/28 CSS px)에 모자란 만큼 여유 영역. `taps.at/over/zones/audit/clear/setSpace/drawDebug`, 옛 도우미는 `taps.note`.
- `audio` (`core/audio.js`): `sfx(name, {vol, pitch, pan, delay})`, `music(id, {fade})`, `stopMusic(fade)`, `duck(amount, time)`, `unlock()`, `setVolumes`, `suspend/resume`, `liveCount(prefix)`, `stopSfx`, `has`, `lead(name)`(타격까지 선행 시간), `setQuality`, `stats`, `current`.
  등록부: 내장 73종(+`_default`) + 체감 45종(`sfx_feel.js` `FEEL_SFX`, audio.js 를 import 하지 않음) + `defineSfx(name, def, vol)` 로 등록한 외부 효과음(`audio_companions.js` 31종). 정의 `fn(S, H)`, `H = SFX_KIT = {T, N, FM, ARP, BOOM, CRACKLE, mtof, R}`. 예산: 100 ms 창에 체감 효과음 시작 10/8/6, hit* 7개 이상이면 재질 레이어 생략, 동시 26.
- `assets` (`core/assets.js`): `get('bg/s01_village')` → Image | null (null 이면 절차적 대체 그림), `preload([...])`, `pattern(ctx, key)`, `url(key, ver)`, `json(key)`, `load(key)`, `has/exists`.
  폴더별 확장자 bg/portraits/tex/cg/painted/puppets = webp, icons/props/ui = png (`json(key)` 은 리그·manifest). **저사양 변형** `assets/lo/` (low 등급·medium 저해상도에서 bg/cg/portraits 자동 선택, 실패하면 원본). **디코딩 LRU** 예산 `ASSET_BUDGET = {touch 160 MB, desktop 400 MB, paintedTouch 32 MB, paintedTablet 40 MB, paintedDesktop 64 MB, tabletMinSide 700, sceneShare 0.3}` — 채색 텍스처 예산 `assets.paintedBudget` 은 휴대폰 32 MB · 터치 태블릿(`assets.isTablet`: 터치 기기이고 화면 짧은 변 ≥ 700 CSS px) 40 MB · 데스크톱 64 MB (R1-RUN-TEX-TOUCH 리드 결정; `assets.paintedBytes` 와 함께 공개 읽기 API. 영웅 퍼펫은 75 % 를 넘으면 4초 안 그린 것부터 60 % 까지 놓는다 — render/hero_puppet.js) (`track(id, bytes, {group:'painted', release})`, `untrack`, `touch`, `stats()`, 시험용 `setBudget({total, painted})`). **에셋 팩** `usePack('assets/packs/index.json')` (아티팩트 배포, §13).
- `world.fx` (Particles, owner FEEL-REACT): `emit/burst(type,x,y,n,{color,speed,angle,spread})` — 타입 `spark hit blood dust smoke ember fire magic holy ice dark thunder shard soul gold water` + 프리셋 `ecto paper gravel goo bloodmist feather` (`PARTICLE_PRESETS`); `ring`, `flash`, `slash`, `ghost(drawFn, life, layer)`, `text(x,y,str,{color,size,crit})`, `sprite(img,x,y,{…})`, `ering`, `speedLine`, `dmg(target, value, styleKey, o)`(DNF 숫자 기둥·합계), `callout(x,y,text,o)`(자리 잡기는 `draw('top')` 때), `setHudBand(rects, n, cx, hw)`(HUD 윗줄의 월드 사각형 + 화면 가운데 `cx`·반폭 `hw`(월드 단위) — `world.syncHudBand` 가 매 프레임 넣는다(HUD 가 숨어도 rects 없이 화면 범위는 준다). 숫자·문구가 그 아래로 비킨다, R1-REQ-331), `addDecal(d, cap)`/`clearDecals()`.
  데미지 숫자 기둥 (R1-REQ-331): 새 기둥은 화면 안에 자리를 잡고(`colX(x, y, now, w, self)` — 좌우 (기둥 폭 + 여백) × `COL_SPREAD` 4.5 안에서 빈자리, 없으면 겹침이 가장 적은 곳), 마지막 숫자가 사라질 때까지(`col.until`) 자리를 비워 두지 않으며, 8줄이 찬 기둥에는 새 기둥을 연다. `staggerTotal(tp)` 새 '합계'를 이웃 합계 위로 올리고, `riseAt(p, age)`/`riseOf(p)` 떠오름 곡선, `colNudge(c)` 화면 가장자리에 걸친 기둥을 그릴 때 화면 안으로 민다(setHudBand 한 번마다 캐시), `evictDmg(prefer)` 살아 있는 숫자 상한에서 '합계'가 나오면 가장 오래된 일반 숫자(제 기둥 것부터)를 뺀다. 'sprite' 입자는 그린 크기를 기기 공간에서 0.9 × √(캔버스 넓이) 로 자른다 (화면 전체 패스가 되지 않게, R1-REQ-338).
- `world.camera` (`core/camera.js`): `kick(dx,dy)`(스프링 반동), `addTrauma(t)`, `shake(mag,time)`(옛 API → 트라우마; mag ≥ 8 이면 bus 'shake'), `punchZoom(z,t)`, `zoomPulse(z,tin,hold,tout)`, `roll`(±0.03 rad), `cine(x,y,zoom,t)|cine(entity,zoom,t)`, `cineEnd(t)`, `frameOn(x,y,zoom)`, `lookBoost`, `floorY`, `boss`(보스 경기장 가로 구도 대상: 영웅 0.6 : 보스 0.4 가중점, 영웅은 화면 가장자리에서 15 % 안쪽; world 가 잠긴 경기장에서 넣고 아니면 null), `tick(dt)`(월드가 멈춘 오버레이가 매 프레임; `tickShake` 는 옛 이름), `reset()`, `toScreen`, `visible`. 터치 모드는 추적점을 바라보는 쪽으로 화면 폭 6 % 당긴다.
- `world.lighting.add(x,y,r,color,i)` (엔티티의 `lights(L)` 에서; `core/lighting.js` 는 광원 아틀라스 하나를 월드를 만들 때 한 번 굽고, `prewarmLightColors(colors)` 로 색을 미리 굽는다), `world.hitstop = s`, `world.slowmo = s` (배율 `world.slowmoScale`), `world.timeStop`.
- `world` (`game/world.js`): `player, map, stage, room, run{hp,mp,hearts,lives,score,sp,aw,awakenN,sub,time,kills,mount,…}, diff, state, hero, entities, time, rt`(실시간 — 히트스톱에도 흐름), `mode`('story'|'town'|'bossrush'|'survival'…), `banner`;
  `add(e)`, `spawnEnemy(id, footX, footY, {params,facing,elite})`, `spawnProjectile(opts)`, `spawnPickup(type,x,y,data)`, `enemies()`, `hittables()`, `nearestEnemy(x,y,max)`, `gainExp(n)`, `addScore(n)`, `applyPowerup(id)`, `playScript(id)`, `gotoRoom(id)`, `startBoss()`, `startUltimate(p)`, `collect(pk)`, `respawn()`, `qualityNow()`, `stickRect()`/`clearStickAtSpawn()`/`armSpawnTrigger(e)`, `bossReady() → Promise<Boss|null>`(보스 클래스를 늦게 받는 동안 `world.boss` 는 대역 `PendingBoss` — 모듈이 오는 즉시 진짜 보스로 바꿔 넣고 돌려준다, 게임 루프가 멈춰 있어도; 세 번 못 받으면 GenericBoss; 보스가 없거나 그 사이 방을 떠났으면 null). 대역은 `hittables()`·기믹 몸 목록(`gimmicks.js`·`gimmicks_b.js`)·각성 감독의 보이는 적 목록(`awaken_directors_b.js`)에서 빠지고, 보스 체력바(`hud_layout.bossBarShown`)와 동료 자동 스킬(`companions.js autoSkill`: 보스 근접·주변 적 수)도 대역을 무시한다. `enemies()` 에는 남지만(아케이드 웨이브 수) 무적·무해다 (조준은 무적을 거른다). `bossSpawnX(x0, x1, vw)`(R1-RUN-BOSSFRAME 리드 결정): 보스 등장 x = 경기장 0.72 지점과 '영웅 + 0.75 vw' 중 가까운 쪽, 영웅과는 0.45 vw 이상 (영웅이 경기장 가운데보다 오른쪽에서 들어오면 뒤집음), 경기장 양 끝 두 칸 안쪽; vw = `game.viewW / camera.zoomTarget`.
  새 필드: `style`(스타일 미터) · `awakenState {ready, holdK}` · `gimmick`(GimmickSet|null) · `gimmickOf(kind)` · `liquid`(방 → 스테이지 → 'water') · `companions`(CompanionSystem) · `freezeEnemies` · `freezeLog`/`frozenRecent`(경직 상한·입력 버퍼 연장) · `overlays` · `hudHidden` · `letterbox` · `killSlowT` · `cutscene/cleared/transitioning/inputLock`.
- 전투 (`game/combat.js`): `playerStrike(world, rect, attack)`, `enemyStrike(world, rect, attack)`, `hitTarget` (→ `impact.js` 순서 §7.2). Attack 스키마는 파일 상단 주석. 대상은 `takeHit(dmg, attack, world, info)`·`hurtbox()`·`stats{def,res,weak,resist}` 구현. 새 attack 필드: `moveId`, `capFn(target,dmg,world)`, `final`, `hitstop`(0 이면 경직 없음), `tags`(['awaken'], ['companion','guardian'], 'purge' …).
- 투사체 (`game/projectiles.js`): `Projectile` 옵션 `{x,y,vx,vy,w,h,team,owner,attack,life,behavior,render,color,pierce,spin,gravity,light,trail,onHit,onExpire,onLand,homingTurn,orbitR,...}` / `Hitbox` 지속 판정 / `explode(world,x,y,{r,attack})` / `PROJ_RENDER` 키 `orb bullet knife axe cross flask flame bone fireball bolt shard book wave none` (+ PROJ_B/C/D, ZONE_B/C/D).
- 이벤트 버스 `bus` (`core/events.js`): `on/off/emit` — 목록 §15.

## 5. 입력·설정·저장

### 5.1 입력 (`core/input.js`, `data/controls.js`, `core/prompts.js`, `core/haptics.js`, `core/touchpad.js`)
- 액션 `ACTIONS`: 이동 `left right up down` · 게임 `jump attack dash sub skill1 skill2 ult swap awaken mount guard map menu` · 메뉴 의미 `confirm cancel prevTab nextTab alt alt2` · 회전 `viewL viewR viewReset`. 한국어 이름 `ACTION_NAMES`. 바꿀 수 있는 것 `REMAPPABLE` = jump attack dash sub skill1 skill2 swap ult awaken map mount guard.
- 읽기: `down(a) pressed(a) released(a) buffered(a,s) consume(a)`, `pressTime[a] releasedAt(a) heldFor(a)`(R16), `axisX/axisY`(8방향 구역), `analogX/analogMag`(걷기 = 0 < |analogX| < 0.55), `sprintHint`, `stickL/stickR`, `pointer{x,y,down,tapped,justDown,active,type}`,
  `command(seq, facingAt, within) → {ok:true, facing} | false` (f/b 는 **첫 방향을 넣던 순간의 방향** 기준, MASTER_PLAN §1.21; 터치는 창 ≥ 0.8초), `queueCommand(cmd|techId)`(터치 기술 원형 메뉴), `flush()`.
- 기기: `mode` 'kb'|'pad'|'touch' (마지막 의미 있는 입력; `touchMode` = mode==='touch' 옛 별칭), `onMode(fn)`, `padInfo {index,id,name,glyphs:'xbox'|'ps'|'nintendo'|'generic'}`, `bindings {key, pad, touch, preset, confirm}`, `refreshBindings()`, `remap('pad'|'key', action, v) → {ok, swapped, reason}`, `setPreset('arcade'|'classic')`, `resetBindings`, `rumble(strong, weak, ms)`, `activePad()`, `pollFrame()`, `setPointerTransform(fn)`. 가상 패드 쪽: `input.touch.set/axis/tap/clear`.
- 기본 배치 (`KEY_DEFAULTS`, `PAD_PRESETS.arcade/classic`, `PAD_MENU`, `PAD_CONFIRM`; 전체 표 MASTER_PLAN §1.4):

| 액션 | 키보드 | 패드 arcade(기본) | 패드 classic | 터치 |
|---|---|---|---|---|
| 이동 | 방향키 (+W = 위) | D-pad · 왼쪽 스틱 | 같음 | 떠 있는 스틱 (왼쪽 45 %) |
| jump / attack / dash | Z·Space / X·J / C·Shift·K | A✕(0) / X□(2) / B○(1) | A / B·X / LT(6) | 버튼 |
| sub / skill1 / skill2 | A / S / D | Y△(3) / LB(4) / RB(5) | 같음 | 버튼 |
| swap / ult | Q·E / F (길게 0.45초 = 각성) | LT(6) / RT(7) | SELECT(8) / RT | ⇄ (뗄 때; 350 ms 길게 = 기술 원형 메뉴) / 필살 (길게 = 각성, 고리) |
| awaken | V | 없음 (지정 가능) | 없음 | (필살 길게) |
| mount / guard | R / G | L3(10) / R3(11) | 같음 | 탑승·수호 버튼 (장착했을 때만) |
| map / menu | Tab·M·I / Enter·Esc | SELECT(8) / START(9) | 없음 / START | 가방 / Ⅱ (위 가운데) |
| prevTab / nextTab | Q·S / E·D | LB / RB | 같음 | 밀기·탭 화살표 |
| viewL / viewR / viewReset | , / . / / | 오른쪽 스틱 X / R3 | 같음 | 끌기 · ⟲ ⟳ · 두 번 탭 |
| 질주 | ←/→ 두 번 (0.24초) 또는 대시 연계 | 두 번 · 대시 연계 | 같음 | 스틱을 반지름 1.15배 너머로 |

- 메뉴는 게임 액션 이름이 아니라 **의미 액션**을 읽는다 (패드 B = 게임에선 대시, 메뉴에선 취소; Q·E 는 게임에선 swap, 메뉴에선 이전/다음 탭). 겹침 검사 `tools/qa/bindings.mjs`.
- `prompts.js`: `bindingOf(action, mode)`, `glyphFor`, `labelOf`, `drawGlyph(ctx, action, x, y, h, mode) → 너비`(비트맵 캐시), `glyphWidth`, `drawHints(ctx, items, x, y, {align,size,color,mode})`, `legacyKey('Z'→confirm …)`, `promptMode()`, `glyphSet()`(설정 `ctrlPrompts` 우선), `clearGlyphCache()`. 바인딩이 없으면 `ACTION_FALLBACK`(awaken → ult) 의 글리프.
- `haptics.js` (진동의 단일 소유자): `play(name)`, `rumble(strong, weak, ms, {vibrate, name})`, `reset()`, `EFFECTS`. 패드 = `vibrationActuator 'dual-rumble'` × settings.ctrlRumble, 없으면 APK `BNAndroid.rumble`; 휴대폰 = `navigator.vibrate` (settings.vibration, H 등급 이상만). 버스 구독: playerHurt, bossKilled, playerDied, levelUp, ultimateCast, shake. 타격 진동은 impact.js 만, 각성 진동은 awaken.js 가 직접.
- `touchpad.js` (캔버스 가상 패드 `#tpad`/`#tpadcv`; DOM `#touch` 는 없어짐): `initTouchPad(input)`, `touchpad.setVisible(on, {hideButtons})`(game.syncPad 만 부른다), `visible`, `openEditor({onClose})`/`closeEditor({save})`(→ settings.touchLayout), `occupiedRects() → [{id,x,y,w,h}]`(논리 px, hudLayout 이 읽음), `stickZone()`, `buttons({all})`(QA), `setTechRadial(fn)`, `layoutInfo()`. 버튼 id `PAD_IDS` = attack jump dash sub skill1 skill2 ult swap mount guard, 시스템 `SYS_IDS` = pause bag fullscreen. 배치 `PAD_LAYOUT_S`(크기 등급 S, 안전 영역 오른쪽 아래 기준 CSS px)·`PAD_LAYOUT_BAND`(태블릿 띠). 누르는 반경 = 보이는 반지름 + 10 px, 가장 가까운 버튼, 버튼 사이 밀어 누르기(touchSlide), 필살 버튼 고리는 `world.awakenState`, 탑승·수호 버튼은 `world.companions.hudInfo()`.
  `#tpadcv` 백킹 (R1-REQ-342): 패드가 숨은 동안(메뉴·마을·컷인·스토리) `display:none` 과 함께 백킹을 0×0 으로 놓고(phone1 ≈ 2.8 MB; 처음 보이기 전에는 기본 300×150 도 잡지 않는다), 다시 보일 때 `setVisible` 이 같은 작업 안에서 크기를 되돌려 그린(`paintNow`) 뒤 display 를 켠다 — 빈 캔버스·지난 그림이 한 프레임도 비치지 않는다. 버튼 그림 캔버스(스프라이트)는 놓지 않고, 배치·DPR·글꼴이 그대로면 다시 굽지도 않는다.

### 5.2 설정 (`core/save.js` `DEFAULT_SETTINGS`·`SETTINGS_SCHEMA`, settingsVersion 2)
| 페이지 | 키 (기본값) |
|---|---|
| 소리 | `musicVol` 0.6 · `sfxVol` 0.8 |
| 화면 | `quality` 'auto' ('auto'\|'low'\|'medium'\|'high') · `fpsCap` 60 (60\|0) · `uiScale` 'auto' ('auto'\|1\|1.15\|1.3\|1.5) · `safeArea` 'fit' ('fit'\|'full') · `screenShake` 1 · `showDamage` true · `flashFx` 1 (0\|0.5\|1) · `cutinMode` 'full' ('full'\|'short') · `reduceMotion` false |
| 조작 | `ctrlPrompts` 'auto' ('auto'\|'keyboard'\|'xbox'\|'ps'\|'nintendo') · `ctrlPreset` 'arcade' ('arcade'\|'classic'\|'custom') · `ctrlConfirm` 'auto' ('auto'\|'south'\|'east') · `ctrlMap` null · `keyMap` null · `ctrlDeadzone` 0.2 (0.1–0.4) · `ctrlRumble` 0.8 · `autoSprint` false |
| 터치 | `touchOpacity` 0.55 · `touchScale` 1 (0.8–1.3) · `touchStick` 'float' ('float'\|'fixed') · `touchSlide` true · `touchLeftHanded` false · `touchLayout` null · `vibration` true |
| 기타 | `autoSave` true · `keepAwake` true · `turntableAuto` true · `fullscreenAuto` true · `telemetry` true (익명 통계·오류 보내기, GPC 면 기본 false — docs/TELEMETRY.md) · `language` 'ko' · `settingsVersion` 2 |

- `saves.loadSettings()` → 이관+검증된 객체(`saves.settings` = `game.settings`). v1(settingsVersion 없음) 의 quality 는 'auto' 로, 모르는 키는 보존, 범위 밖 값은 기본값. `saveSettings(s)` 는 늘 v2. `migrateSettings(obj) → {settings, changed}`(순수), `autoQualityTier()`. 런타임 키 `settings.autoTier`(조절기 결과), `settings.painted`(디버그 킬 스위치, 옵션 줄 아님).
- 옵션 화면 `scenes/front/options.js` (페이지 5개 + 전체 화면 + 기본값 복원, uiScale, 44 CSS px), 하위 화면 `options_controls.js`: `RemapPage('pad'|'key')`(다음 입력을 잡아 `input.remap`, 겹치면 맞바꾸고 토스트) · `GuidePage`(조작 안내를 `input.bindings` 와 가상 패드 배치에서 생성) · 터치 배치 편집 → `touchpad.openEditor()`. `enter({page, sub:'padRemap'|'keyRemap'|'guide'})`.

### 5.3 저장 (세이브 스키마 v2, `game/state.js` `SAVE_VERSION = 2`)
- 슬롯 3 + 설정 + 메타(`DEFAULT_META`: unlockedChars, highScores, bossRushBest, survivalBest, konami, clears, endingsSeen, bestiary; `meta.tips {a2hs, storage, remap, pad}`). `saves.write/read/list/remove/exportCode/importCode/store/onWrite`, `isValidSave(obj)`(클라이언트·서버 공통, 버전과 무관).
- `newGameState()` : `progress {chapter(최대 20), cleared, unlocked, flags, docs, lore, secrets, bosses, relics, seenScripts, shards[], hearts[]}` + `ensureCompanionState(state)`.
- `migrateState(s)` (불러올 때마다, **멱등**, 모르는 필드 보존): 기존 보정 → shards/hearts 문자열·중복 정리 → `migrateCompanions(s)`(try/catch, 손상되면 동료만 초기화) → `s.version = 2`. 클라우드에서 받은 세이브도 이 함수를 거친다.
- 동료 하위 트리 `state.companions = { v:1, owned:{id:{lv,exp,bond,got,src,gift,seen}}, eggs, pending, clears, autoSkill, slot2Seen, last }`, `state.heroes[charId].companions = { mount, guards:[g0,g1] }`.
- 저장하지 않는 런타임 값: `world.run.aw`(각성 게이지, 스테이지마다 0), `world.run.awakenN`, `world.run.mount`, `world.awakenState`.
- 크기: 20장·동료 20·7단계 장비·가방 가득 세이브 < 256 KB (서버 한도 512 KB) — `tools/test_save_v2.mjs`. 고정 세이브 `tools/fixtures/save_v1.json`, `save_ch6_nocmp.json`.
- 계정·클라우드 저장 (`core/cloud.js`, `/api/*`): `docs/ACCOUNTS.md` 참고 (장면 `account`, `cloudConflict`; 버스 `cloud:*`).
- 온라인 순위·일일 도전·고스트 (`core/online.js` API 클라이언트·대기열·캐시, `game/ghost.js` 기록·묶기·재생): 계약 `docs/specs/online.md` (부록 A = 고스트 형식). 늦게 받는 조각에 실린다 (아케이드·명예의 전당·계정 장면이 import). 일일 도전 규칙은 임시 세이브 `state.arcade.{diffOver, rules, seed}` → `World` 가 `world.diff`·`world.rules {noPotion, noSub, dark, taken, dealt}`·`world.rng`(정예 출현·촛불 보상) 로 읽는다 (`combat.hitTarget`·`inventory.useItem`·`player.useSub`·`loot.rollCandleLoot` 의 `[hook:plat]` 줄). localStorage: `bn_online_q`(제출 대기열, 계정별·6시간) · `bn_online_daily`(그날 도전) · `bn_online_nick` · `bn_ghost_best`(보드별 내 최고 고스트 6개).

## 6. 플랫폼 셸

- `core/platform.js` (`initPlatform(game)` → `game.platform`): `safeInsets() → {l,r,t,b}` CSS px (env() ⊕ `window.__BN_INSETS`), `onInsetsChange(cb)`, `safeRect()`, `isApp/isIOS/isAndroid/isAndroidWeb/isStandalone`, `fullscreenAvailable/canFullscreen/isFullscreen/toggleFullscreen/enterFullscreen/exitFullscreen`, `onUpdateReady(cb({apply}))`/`updateReady()`/`applyUpdate()`(SKIP_WAITING 후 새로고침), `audioHint()`, `a2hsHint()/dismissA2hs()`, `requestPersist()`, `registerServiceWorker()`(https·localhost, `?nosw`·APK·아티팩트 제외). 화면 꺼짐 방지(wake lock, `WAKE_SCENES` 또는 `scene.keepAwake`), 커서 숨김(`scene.hideCursor`), 첫 터치 전체 화면(settings.fullscreenAuto; 앱·설치 PWA·아이폰 제외).
- `game.js` (PLAT-CORE): 안전 영역 맞춤(safeArea 'fit' 은 안전 사각형 안에 캔버스), UI 배율 `uiK`(settings.uiScale 'auto' = 휴대폰에서 키움), 백킹 DPR = min(기기, 품질 상한, √(픽셀 예산/CSS 넓이)), 대칭 품질 조절기(`govern`, auto 일 때), fpsCap 페이싱, `syncPad` 단일 소유, flash/vignette 정책, 토스트 규칙(최대 3, 15 px, 2줄), `pop()` 마지막 장면 → 타이틀.
- 부팅 관문 `src/boot-gate.js` (P-35): 지원 안 되는 브라우저 안내, 진행률(`__BN_BUILD.modules` 분모), 오류 화면. main.js 는 `__BN_BOOT.step/done/fail` 로 보고.
- 탭 크기: 모든 장면이 `ui.taps` 로 등록 (§4). 메뉴 공용 `scenes/menu/common.js` (Nav·Gesture·Scroller·Popup·Confirm·Layer·hintRow, 'paw' 문양; 메모리 도구 (R1-REQ-339B/341B/342): 캔버스 풀 `takeCanvas()`/`giveCanvas(cv)`(돌려받으면 0×0, 모듈을 읽을 때 40장 미리 만듦, 최대 64) + `canvasPoolStats()`, 빛무리 아틀라스 `GlowAtlas(stops)`(프로필마다 한 장, 필요할 때 키움; 메뉴 glow/glowOval 과 town/facades 가 씀) + `glowStats()`, 그라데이션 캐시 `vGrad/hGrad/rGrad` + `fillGradRect/fillPathGrad`(원점 기준으로 한 번 만들어 옮겨 칠함), `leanMem(game)`(등급이 'high' 가 아니면 true — 메뉴 배경 레이어 반 해상도, 패널 틀은 레이어 없이 그림), `Layer.draw(ctx, key, x, y, w, h, scale, fn, copyQ)` · `Layer.release()` · `Layer.bytes`; `hero_view.js` `PixLayer.drawBg(ctx, key, x, y, w, h, fn, live)`(live = 레이어 없이 그림), 레이어 캔버스는 모두 풀에서. `menu.js` 는 불투명하게 열릴 때 lean 이면 `world.tiles.releaseChunks()`(render/tiles.js: 구운 청크를 모두 풀로 돌리고 풀 캔버스를 0×0 으로 — 캔버스 객체는 남아 메뉴를 닫으면 보이는 청크만 다시 굽는다, 새 캔버스 0), 닫을 때 `render/hero.js releaseHeroOffscreen()`(영웅 역광·섬광 오프스크린 두 장과 합성 풀 캔버스를 0×0 으로; 다음 그리기가 스테이지 크기로 다시 키운다)을 부른다. 영웅 오프스크린 한 장은 등급이 'high' 가 아니면(휴대폰·태블릿, 설정 'auto' 의 기본) 0.25 MP 상한(`OFF_MAX_LEAN`, 넘으면 배율을 낮춰 굽는다 — 메뉴 미리보기의 큰 배율; 스테이지 영웅은 상한 아래), 'high'·등급을 모르는 도구 페이지는 상한 없음. 마을 창 `ServiceScene.toastW`·`QuestBoardScene.toastW`), 프런트 공용 `scenes/front/common.js` (footer·gbutton·backButton·goSafe·TapZones), 미니게임 공용 `scenes/games/common.js` (MiniGame, uiScale 720×400).
- 영웅 턴테이블 (`scenes/menu/hero_view.js`, 상태·장비·직업 탭): `HeroView({auto, turntable, game})` `set/showcase/pose/update/draw`, `stage(rect)`, `control(dt, ges)`, `drawDeck`, `reveal()`, `resetYaw`, `toggleAuto`, `viewLabel()`; `HeroStage`, `pedestal`, `turntableHints`, `TT`. 각도 0 = 오른쪽 옆, +π/2 = 앞, π = 왼쪽 옆, −π/2 = 뒤. 렌더러 계약 `HERO_VIEW`/`heroViewInfo` 는 `render/hero.js` (ART-HERO-B, **진행 중**) — 없으면 카드 뒤집기 대체.
- 안드로이드 앱·배포는 §13.

## 7. 손맛 (이동·타격·필살기·각성기)

### 7.1 이동 (`game/feel_move.js`, `data/feel_move.js`, `render/hero_gait.js`; FEEL-MOVE)
- player.js 훅이 부른다: `initFeel(p)`, `updateGait(p, world, dt, inp) → {mul, accel, decel, airAccel, airDecel, holdFace} | null`(탑승 중 null; `player.moveProfile(gait)` 가 speed = B × mul × 기믹 speedMul), `onJump(p, world, air)`, `onLand(p, world, vyBefore, fallPx)`, `dashFx(p, world, 'start'|'step'|'end')`, `squashSpring(p, dt)`, `chaseJump`, `takeChaseStall`, `pivotCommit`, `resetMoveFeel`, `surfaceOf`, `cadenceOf`, `persOf`.
- 플레이어 필드: `p.gait` 'idle'|'walk'|'run'|'sprint', `p.gaitPh`(걸음 위상, 한 걸음 = π, 접지 = `GAIT.contactPh` + kπ), `p.moveFx` null|'run_start'|'skid'|'pivot'|'land_heavy', `p.sprinting`, `p.feel {sq, sqV, accLean, steps, lastStep}`, `p.lastLaunch`(추격 점프).
- 데이터: `GAIT CADENCE PERSONALITY SURFACE SURFACES STEP SPRINT SKID LAND SQUASH DASH_FX CHASE`. 발소리 `step_<지면>` (stone dirt wood metal snow water bone flesh; 2부 s14/s15 metal, s16 water|stone, s17 stone, s18 flesh, s19 dirt, s20 stone).
- 그림: `gaitPose(P, K, anim, p, at)`, `applyFeelOverlay(P, p)`, `GAIT_ANIMS`, `GAIT_BLEND` (hero.js `heroHooks` 로 연결).

### 7.2 타격 (`game/impact.js`, `data/feel_hit.js`, `game/style.js`, `render/hitfx.js`, `game/enemy.js`; FEEL-IMPACT·FEEL-REACT)
- `combat.hitTarget` 순서: `preImpact(world, attack, target, rehit)` → `computeDamage` → `modDamage(world, pi, res, target)`(카운터 ×1.25, 다운 추가타, `attack.capFn`) → `target.takeHit(dmg, pi.attack, world, info)` → `impact(world, attack, target, info)`(경직·카메라·진동·스프라이트·파편·숫자·문구·효과음·bus hitCrit/hitHeavy).
- 강도 등급 `L M H F U S A` (+'hurt'): `strengthClass(attack, mv, id)`, `STRENGTH_RULES`, `FEEL_MOVE_OVERRIDES`. `info` 필드: dmg crit weak resist capped hx hy cls counter back air otg otgStrong gb stunAdd moveId cont swing fxType prop part hpBefore (+ killed landed launched hitstop overkill).
- 경직 상한: `HS_CAP` 0.4초 / 1초 창 (S·A 제외), `world.freezeLog`, `applyHitstop(world, dur, cls)`. 데이터 `HITSTOP WEIGHT JUGGLE DOWN BOUNCE COUNTER BACK CALLOUT MATERIAL HIT_SPRITE DMG_STYLE STYLE AW_GAIN RUMBLE BUDGET MV_SCALE`.
- 적 반응(enemy.js): 무게 등급·저글·다운/다운 추가타·벽/바닥 바운드·경직, `freezeEnemies` 존중. 보스는 `boss.telegraph`(예고 중 = 카운터 가능).
- 스타일 미터 `world.style = new Style(world)`: `pts rank(0–7: D…SSS) best progress ann{cur,queue} milestone pulse`, `onHit/onEvent(name)/onKill/onHurt/update/reset`; bus `styleRankUp`, `comboMilestone`; `addAwGain(world, n)`.
- `hitfx.js`: 캐시 스프라이트 `glow star cut streak ring soft decalSprite`, 숫자 `digitAtlas(style, color)`·`dmgLayout`·`fmtDmg`, `textSprite`, `materialBurst(fx, mat, x, y, dir, cls, color)`, `stampDecal(world, x, y, dir, mat)`, `prewarm()`, `HITFX_STATS`.

### 7.3 필살기 (`game/skills.js` castUltimate, `render/ultfx.js`, `scenes/overlays.js` ultCutin; FX-ULTS·FX-ULTKIT·OVERLAYS)
- `castUltimate(p, world)`: `p.mount?.beforeCast` → bus `ultimateCast {charId, tier, classId}` → 컷인 `game.push('ultCutin', {charId, world, classId})`(0.9초, 붓글씨 기술명, 2차 전직 금테) → `ULTS[charId](p, w, v)` (v = {charId, classId, tier 0–2, color, accent, q, low, name, title}). 피해량은 전직 단계와 무관, 연출만 커진다.
- `ULTFX` 키트: `begin(w, p, o) → 세션 | null`, `beat(w, x, y, o)`, `final(w, x, y, o)`(임팩트 프레임 ≤ 2/시전), `afterimage(w, p, tint, o)`, `end(w, p, {quick})`, `prepare`, `flourish(w, classId, x, y, o)`, `active`, `tierOf`, `accentOf`, `glow(color)`, `sprite(name)`; `ULT_TIERS`, `ULT_FLOURISH`(2차 전직 24종), `ULTFX_STATS`. 화면 층은 `world.overlays`, 캔버스는 풀(시전 중 새 캔버스 0): 풀은 모듈을 평가할 때 `ensurePools()` 가 'high' 기준 개수(빛 24 · 층 3 · 장식 8 · 잔상 9 · 실루엣 1, ≈ 45장)를 **0×0** 으로 만들어 두고(scratch 한 장만 4×4) 쓸 때 크기를 준다 — 빛·층·장식은 스테이지 진입 뒤 한가할 때 `prepareFor` 가 이 영웅 것만 굽고, 잔상·실루엣은 첫 시전 때 키운다 (지연 장면 교체로 stageEntered 가 구독보다 먼저 지나가도 스테이지 시작 뒤 새 캔버스 0, 요청 #478).
- `FXKIT` (skills.js 끝, 각성 감독이 쓰는 연출 도구 모음). `SKILL_IMPL[id](p, world, lv)`, `castSkill`, `castTechnique`, 기술 이름표 `TECH_NAMES`(모듈 내부) (+ `skills_p2.js`: `SKILL_IMPL_P2`, `TECH_NAMES_P2` = tech_mirror 경영참 · tech_whirl 와류참 · tech_purge 정화의 불꽃).

### 7.4 각성기 (`game/awaken.js`, `data/awaken.js`, `scenes/awaken_cutin.js`, `game/awaken_directors(_b).js`; AWAKEN-CORE·AWAKEN-DIR-A/B)
- 조건: 1차 전직 이상(`AWAKEN_RULES.minTier` 1) + `run.sp` 100 + `run.aw` 100. 입력(`handleUltInput(p, world)`, player.handleAttackInput 첫 줄): 준비 안 됨 → 누르는 즉시 필살기 / 준비됨 → 0.20초 미만 톡 = 뗄 때 필살기, 0.20–0.45초에 떼면 취소, 0.45초 누르면 각성 / 'awaken'(V) = 준비됐으면 즉시 각성, 아니면 필살기. 판정은 `input.down` + `pressTime/releasedAt`(R16), 한 프레임을 놓치거나 장면이 쌓이면 길게 누르기 취소.
- API: `canAwaken(p, world)`, `castAwakening(p, world, {force})`(게이지 소모·무적·적 정지·컷인 → 감독), `registerDirector(charId, fn)`, `bossCapFn(world)`(한 번의 각성으로 보스 최대 HP 30 %; `attack.capFn`), `prepareAwakening(p, world)`, `AWAKEN_DEBUG`. 감독은 늦게 읽는 조각: `loadAwakenDirectors() → Promise<bool>`(stageEntered·prepareAwakening·castAwakening 에서, 그리고 awaken.js 가 구독하는 순간(setTimeout 0) 이미 스테이지가 서 있으면(`game.world.player` 있음 — 두 단계 부팅·지연 장면 조각에서 stageEntered 가 구독보다 먼저 지나간 경우) 그때 바로; 여러 번 불러도 한 번만 받고, 오기 전에는 내장 대체 연출), `awakenDirectorsReady() → bool`; 미리 굽기 `awaken_directors.js prepareAwakenSoonA()` · `awaken_directors_b.js prepareAwakenSoon()`.
- 상태: `world.awakenState = {ready, holdK}` — **`ready` 는 awaken.js 가 처음 handleUltInput 때 설치하는 읽기 전용 계산 속성**(tier ≥ 1, sp ≥ 100, aw ≥ 100, 사망·cutscene·cleared 아님, mode ≠ 'town'; 피격 경직은 무시 — 표시가 깜빡이지 않게). 실제 시전 가능 여부는 `canAwaken`. `holdK`(0..1) 는 누르는 동안만. 읽는 쪽은 둘 다 쓰지 않는다. `p.awakenHoldK`, `p.superArmor`(누르는 동안 1), `world.run.awakenN`(2번째부터 짧은 컷인). bus `awakenCast {charId, tier, classId}`. 진동은 awaken.js 가 직접.
- 게이지 획득: 타격·치명·카운터·띄우기·처치(+2/+8)·보스 등장(+25)·보스 페이즈(+15)·피격 분노(+6)·랭크 상승(+1)·바운드(+3); 필살기·각성·동료 타격은 0 (`AW_GAIN`).
- 컷인 장면 **`awakenCutin`**: `game.push('awakenCutin', { world, p, charId, classId, tier, short, onDone(aborted) })` — opaque false · hidePad · deferToasts · `world.hudHidden`; 1.45초(짧게 0.75초, settings.cutinMode 'short' 또는 같은 스테이지 두 번째부터), 0.5초 뒤 건너뛰기. 닫히면 pop 뒤 `onDone(false)` → 감독 시작. `prepareCutin(charId, tier)`. 그림 `assets/cg/cutin_<char>.webp`(없으면 초상화), 대사는 BN Brush 붓글씨 + 붉은 낙관.
- 데이터: `AWAKEN[charId] = {name, line, lines, seal, cutin, portrait, face, eye, portraitFace, color, dark, accent, cue, style, ultMv, mvWeights, final, t2}`, `AWAKEN_RULES`(tapMax 0.20, holdFull 0.45, mvMul 2.2, t2Mul 1.15, bossCap 0.30, cutin, maxDirector 7), `T2[classId]`(2차 전직 '진 각성' 변형), `awakenOf`, `t2Of`, `awakenTitle(charId, tier)`, `AWAKEN_IDS`, `TITLE_PREFIX` '각성', `T2_PREFIX` '진 각성'.
- 감독 계약: `(p, world, v) => 엔티티 | null` — 표 `AWAKEN_DIRECTOR[charId]`(`awaken_directors.js`, A: kael sera victor) · `AWAKEN_DIRECTOR_B[charId]`(`awaken_directors_b.js`, B: bran lia azel). 찾는 순서: `registerDirector` 로 등록한 것 → `AWAKEN_DIRECTOR` → `AWAKEN_DIRECTOR_B` → awaken.js 대체 연출. v = `{charId, classId, tier, data, t2, color, accent, dark, scale, mv(w), atk(w,o), hit(rect,w,o), final(rect,w,o), view(pad), foes(rect), cap, heal(frac), finish(), dur, started}`. 감독 엔티티가 죽거나 `finish()`/`dur`/최대 7초가 지나면 awaken.js 가 cutscene·freezeEnemies·hudHidden·레터박스를 되돌린다. FXKIT 이 비어 있으면 대체 연출. `prepareAwakenB`, `AWAKEN_DIR_A_DEBUG`/`AWAKEN_DIR_B_DEBUG`.
- 화면 전체 패스 예산(feel §8 ≤ 3/2/1): 감독의 화면 전체 칠은 한 장으로 모은다 — 예: 빅터의 세피아(high 만)는 따로 칠하지 않고 `back()` 의 어둡힘 칠에 섞는다 (요청 #442). `tools/qa/perf_budget.mjs` 는 방의 기본 프레임을 뺀 '더한 패스'를 세고, 타일 층(`render/tiles.js`) 블릿은 확대 연출에서 한 조각이 화면을 덮어도 더한 패스로 치지 않는다 (요청 #453).
- 규칙: 컷인은 한 번에 하나 (ultCutin 은 awakenCutin 이 스택에 있으면 곧바로 닫힘). castUltimate·castAwakening 은 cutscene·cleared·transitioning·inputLock·보스 소개·사망·경직 중에 거절. 둘 다 먼저 하차(`p.mount?.beforeCast`), 끝난 뒤 1.4초에 자동 재탑승.

## 8. 훅 지점 (전체 표: MASTER_PLAN §1.7)

- `src/game/player.js` (훅 표식 118개 — `hook_tags.mjs` 의 `tags.w1` 하한 101 · GAME-HOOKS 가 넣고 FEEL-MOVE·CMP-MOUNT·AWAKEN-CORE·GIMMICK-ENGINE 이 채움): 생성자 끝 `initFeel`·`mount=null`·`superArmor`·`awakenHoldK`; update `mount?.tick` → `updateGait` → 대시 분기(탑승 중 `tryCharge/updateCharge`, 아니면 `dashFx`) → `moveProfile(gait)`(탑승 → `mount.profile`, 기믹 `speedMul`) → 웅크리기 탑승 금지; `handleJump` 첫 줄 `mount.handleJump` → `gimmick.onJumpInput`; `handleAttackInput` 첫 줄 `handleUltInput`, 기술 루프 `input.command(tech.cmd, t => this.facingAt(t), window)`, 탑승 특수기 `trySpecial`; `startMove` `mount.adaptMove`; `physics` 첫 줄 `gimmick.prePhysics`, `mount.afterPhysics` → `onLand`, 가시·액체 `mount.hazard`, 액체 뒤 `gimmick.postPhysics` + `squashSpring`; `invuln` += `mount.invulnT`·`companions.shieldT`; `takeHit` 에서 `companions.incoming` + 슈퍼아머; `heal` × `gimmick.healMul()`; 재생 `!gimmick.noRegen`; `die` → 하차; `refreshStats` 탑승 보너스·`companions.onStatsChanged`; `hurtbox`/`updateAnim`/`draw`(탈것 back → drawHero(riderView) → 탈것 front)/`lights`/`ghostTrail`/`snapshot`; `noteFacing()` + `facingAt(t)`(1초 방향 기록).
- `src/game/world.js` (WORLD-CAM): 생성자 필드(§4), `liquid`/`gimmickOf`, `loadRoom`(기믹 dispose·decal 비우기 → 'D' 문 표식 → `createGimmick` → `companions.onRoomLoaded`), `update`(히트스톱 분기·slowmoScale·freezeEnemies·기믹·스타일·오버레이·보스 페이즈 감시), `render`(bgFlip·기믹 층·손맛 오버레이), `onPlayerHit`(수호신 태그 규칙·스타일·각성 게이지·`companions.onHit`), `endCombo`, `onEnemyKilled`(`companions.onKill`·처치 슬로모), `onPlayerHurt`, `startBoss`/보스 소개 끝(`companions.onBossStart`, aw +25), `onBossDefeated`, `collect`(별의 조각·세계의 심장, 음식 `gimmick.cleanse(30)`·`mount.healFrac`), `onPlayerFell`, `respawn`(`gimmick.onRespawn`·`companions.onRespawn`), `stickRect`. 터치 모드 시작 위치 옮기기(`clearStickAtSpawn`)는 최대 `SPAWN_SHIFT_MAX` 12칸 — 보스 경기장 표식 'X' 앞에서 멈추고, 같은 층(시작 줄 −4…+1)의 적 배치 칸에는 3칸 앞에서 멈춘다; 옮기며 지나친 가로 구간은 `world._spawnPass` 에 남기고, 그 사이의 이야기 트리거는 `armSpawnTrigger(e)` 가 영웅 위치까지 넓혀 첫 프레임에 발동한다 (R1-REQ-323). 보스는 `bosses/lazy.js` `createBoss` 로 만든다 (§11.4). 이동 발판 'M'/'V' 는 `room.platforms[i] = {range, speed}` 가 있으면 그것(i = M·V 표식을 행 우선으로 함께 센 번호), 없으면 `room.platRange`(4)/`room.platSpeed`(V 70 · M 80) — `tools/validate_maps.mjs`·`scan_mount_fit.mjs` 도 같은 규칙.
- `src/render/hero.js` `drawHero(ctx, p, world, opts)` 순서: 분기(영웅 퍼펫 · NPC 퍼펫 · 벡터) → 보기 결정(`opts.yaw` 면 턴테이블 보기) → anim → 자세(걸음은 `heroHooks.gait`) → 전환 블렌드 → 기수 자세(`p.ride`, `heroHooks.rider`) → feel 덧씌움 → 골격 풀이 → 보기 투영 → 레이어 → 림. `heroHooks = {gait, gaitAnims, blend, feel, rider}` + `registerHeroHooks(h)`, `HERO_DRAW_SCALE` 1.14(그림만, 판정 그대로), `setHeroDrawScale`, `HERO_VIEW {continuous:false, steps:8, painted:true}`, `heroViewInfo(p)`, `drawHeroTurntable(ctx, look, yaw, x, y, height, t, opts)`, `drawWeaponPreview`, `NPC_POSE`. opts `{alpha, tint, scale, noFx, rim, yaw}`.
- 데이터·레지스트리 합치기 (모두 `[hook:p2]`): `ENEMIES = {...A,...B,...C,...D}` · `Object.assign(AI, AI_A, AI_B, AI_C, AI_D)` · `BOSSES = {...A…D}` · `BOSS_CLASSES`(C/D 는 순환 초기화 때문에 `mergeP2()` 로 늦게 합침, 없으면 `GenericBoss`) · `ENEMY_RENDER`(같은 방식) · `Object.assign(SCRIPTS, COMPANION_SCRIPTS, SCRIPTS_P2)` · `Object.assign(SKILL_IMPL, SKILL_IMPL_P2)`.

## 9. HUD

- 영역의 단일 출처 `src/render/hud_layout.js`: `hudLayout(world, vw, vh, pad?, opts?) → L` (읽기 전용, 같은 입력이면 같은 객체). 상시 영역 `portrait vitals hearts skills ult awGauge ready companions callouts score combo`, `companionsDraw`(위젯을 그릴 안쪽 사각형, 여백 `CMP_INK {l:8,t:8,r:4}`), `bossBar`(`bossSlot` 'top'|'bottom', `bossTop`/`bossBottom`, `bossShown`), `transient`(알림·배너 한 칸), `meter(i)`(기믹 게이지 ≤ 3줄), `toast(i)`, `toastRows`, `toastArea`, `meterRows`(토스트·위쪽 보스 칸이 비켜 준 게이지 줄 수), `gap`, `touch`, `safe`, `pad`, `padLeft/padTop`. 상수 `HUD_GAP TOAST_ROW METER_ROW METER_H TOUCH_FLOOR(296)`; `hudRegions(L, opts)`, `modelPadRects`, `padSizeK`, `bossBarShown(world)`(bossActive · 죽거나 쓰러지는 중 아님 · cutscene 아님 · 늦게 받는 보스의 대역 `pendingBoss` 아님 — 대역이 서 있는 동안 체력바가 먼저 뜨지 않게). 좌표 표: MASTER_PLAN §1.8 (스펙들의 픽셀 위치는 이 표가 대신한다). 터치에서 상시 영역은 y 297 위에만.
- `src/render/hud.js` `drawHUD(ctx, world, vw, vh)` 순서 (HUD-FINAL): 초상화·체력·하트·버프·스킬 슬롯(`drawSkillGlyph`, 글리프 `prompts.drawGlyph`) → ① 필살(SP) 게이지 → ② `feel_hud.drawAwGauge(ctx, world, L.awGauge.x, .y, .w, touch)` (준비 문구 칸 `L.ready` 까지 맡음) → ③ `companion_hud.drawCompanionHUD(ctx, world, {x, y, rect: L.companionsDraw, lane: L.callouts, touch, layout: L})` → 돌려받은 탭 사각형을 `world.companions.hudRects` 에 → ④ 점수 → ⑤ `feel_hud.drawComboHUD(ctx, world, vw, vh, touch)` → ⑥ 보스 체력바 → ⑦ `world.banner` 가 있으면 배너, 없으면 `feel_hud.drawAnnouncer(ctx, world, vw, vh)`. 콤보 열과 알림의 클립(`avoidClip`: 넘칠 수 있는 범위에 걸리는 다른 영역만 화면에서 뺀 evenodd Path2D, 배치마다 한 번 만듦; 콤보 위·왼쪽 32 px·오른쪽 6 px, 알림 위 16 px·옆·아래 6 px)은 **`feel_hud.hudOverflow(world, 'combo'|'transient')` 가 true 인 프레임에만** 건다 — 랭크 글자 등장 0.16초 · 이정표 박힘 0.12초 · 알림 박힘/색수차 0.15초 (R1-REQ-330). 콤보 숫자 튀기기는 feel_hud 가 L.combo 칸 안에 가두고(`popFit`) 쉬는 그림도 칸 안이라, 평소 프레임은 클립 없이 그린다. 초상화·목숨 아이콘·스킬 슬롯 문장은 모듈을 읽을 때 만든 스프라이트 캔버스 3장에 (영웅·레벨·배율·그림 준비 상태가 바뀔 때만) 구워 붙인다 — `HUD_SPRITE_STATS {portraitBakes, lifeBakes, skillBakes}`. `world.hudHidden` 이면 아무것도 그리지 않고 `hudRects` 를 비운다. 옛 콤보·준비 문구 코드는 없어졌다. 도구용 `HUD_PARTS` + `drawHUDPart(ctx, world, vw, vh, part)`. 기믹 게이지(`gimmicks.drawScreen → hudLayout().meter(i)`)와 토스트(game.js → `toast(i)`)는 각자 그린다.
- `src/render/feel_hud.js` (FEEL-HUD): `drawAwGauge(ctx, world, x, y, w, touch) → bool`(1차 전직부터 '각성'/'진 각성' + 120×6 막대, 준비 문구 '필살기 준비!' / '각성 가능!' + 필살 버튼 글리프 + '길게', 터치 '각성 가능! 필살 버튼을 길게'; `awakenState.holdK` 흰 채움), `drawComboHUD(ctx, world, vw, vh, touch) → bool`(L.combo 안, 칸 아래로 안 그림, 76 px 미만이면 작은 배치; 콤보 숫자·HITS·시간 막대·총 피해·랭크 D~SSS·이정표), `drawAnnouncer(ctx, world, vw, vh) → bool`(L.transient, 배너가 이김, 40 %까지 축소), `hudOverflow(world, 'combo'|'transient') → bool`(이번 프레임에 그 위젯이 칸 밖으로 넘치는 연출 중인가 — hud.js 가 클립을 걸지 정한다), `prewarmFeelHud()`, `brushSprite('banner'|'band')`, `BRUSH_SIZE`, `FEEL_HUD_STATS`, `FEEL_HUD_DEBUG`. 읽는 것: `world.style/combo/run.aw/awakenState/rt`. 캔버스 7장: 붓 띠 2 · 게이지 광채 · 랭크 글자 묶음 · 알림 단어 묶음(부팅 1.5초 뒤 굽고, 글꼴 도착·DPR 상승 때 같은 캔버스에 다시 굽는다) + 콤보 열 캐시 `NUM`(콤보 숫자) · `LBL`('HITS' + '총 피해 n') — 둘은 내용(숫자·랭크·SSS 색 단계·총 피해·배율·글꼴 세대)이 바뀔 때만 다시 굽고 매 프레임은 붙이기만 한다 (R1-REQ-330). 그리는 중 난수 없음 (콤보 기울기는 콤보 수에서, R1-REQ-348).
- `src/render/companion_hud.js` (CMP-UI): `drawCompanionHUD(ctx, world, o) → [{x,y,w,h, act:'mount'|'guard', slot?}] | null` (탈것 40 px 원: HP 고리·재소환 막·탑승 금빛·비행 체력 호·noMount 빗금, 라벨 [R]/L3/탑승; 수호신 38 px 원 × 1–2: 재사용 부채꼴·준비 맥동·AUTO, 라벨 [G]/R3/수호; 스킬 카드 줄 300×52 최대 2), `drawCompanionIcon(ctx, id, x, y, r, {locked, ring, alpha})`, `portraitCrop(id)`.
- 검사 `tools/test_hud_layout.mjs`: 명세 행렬(보스 바 × 게이지 0–3 × 안전 영역) 겹침 검사 + 실제 위젯 픽셀 검사 (부분마다 따로 그려 알파 ≥ 0.3 잉크가 다른 영역·알림 칸·토스트 줄·패드·안전 여백·터치 y > 297 에 닿지 않아야 함).

## 10. 동료 (탈것 9 · 수호신 11)

| id | 이름 · 칭호 | 합류 | 장 |
|---|---|---|---|
| `mt_warhorse` | 그림메인 · 흑철 군마 | flag `stable_open` (1장 클리어 뒤 첫 마을 방문, cmp_stable_open) | 1 |
| `mt_boar` | 바르그 · 철엄니 멧돼지 | 마구간 구입 6,000 G | 2 |
| `mt_skelsteed` | 코슈타 · 망령 해골마 | b_dullahan 첫 처치 | 3 |
| `mt_direwolf` | 스콜 · 서리 늑대 | 의뢰 cq_skoll (그레타) | 4 |
| `mt_wyvern` | 스칼렛 · 진홍 와이번 | b_chimera 의 알, 2스테이지 뒤 부화 | 7–8 |
| `mt_giantbat` | 녹티스 · 거대 박쥐 | 유물 5개 (cmp_bat_arrive) | ≈11 |
| `mt_ignis` | 이그니스 · 화염 군마 | flag `recruit_mt_ignis` (s15_outro) | 15 |
| `mt_gale` | 게일 · 폭풍 그리핀 | flag `recruit_mt_gale` (s17_outro) | 17 |
| `mt_silva` | 실바 · 백록 신령 | flag `recruit_mt_silva` (s19_outro) | 19 |
| `gd_fairy` | 아리아 · 빛의 요정 | b_banshee | 2 |
| `gd_spiritwolf` | 하티 · 영혼 늑대 | 의뢰 cq_hati | 2+ |
| `gd_imp` | 핌 · 소악마 마법사 | 「소악마 계약서」 7,500 G | 3 |
| `gd_knight` | 가웨인 · 망령 기사 | b_crimson | 4 |
| `gd_whelp` | 크론 · 새끼 본 드래곤 | b_bonedragon 의 알 | 5–6 |
| `gd_owl` | 미네르바 · 성스러운 올빼미 | b_grimoire | 6 |
| `gd_clock` | 틱톡 · 태엽 인형 | b_colossus | 9 |
| `gd_reaper` | 모르스 · 꼬마 사신 | b_death | 11 |
| `gd_mirra` | 미라 · 거울 요정 | flag `recruit_gd_mirra` (s14_outro) | 14 |
| `gd_lumen` | 루멘 · 등불 해파리 | flag `recruit_gd_lumen` (s16_outro) | 16 |
| `gd_momo` | 모모 · 꿈먹는 맥 | flag `recruit_gd_momo` (s18_outro) | 18 |

(옛 명세의 `m_*`/`g_*` id 는 `LEGACY_IDS` 로 읽는다. 초상화는 `portraits/cmp_m_*`·`cmp_g_*`·`cmp_mt_*`·`cmp_gd_*` — 각 항목의 `portrait` 필드.)

- 편성: 영웅마다 탈것 1 + 수호신 1 (8장부터 수호신 2번 칸). 늦게 합류한 동료는 Lv = clamp(round(최고 영웅 Lv × 0.7), 1, 25). 아케이드 모드에서는 쉰다 (`CompanionSystem.active` false).
- **데이터** `src/data/companions.js` (CMP-DATA): `MOUNTS`, `GUARDIANS`, `MOUNT_IDS`, `GUARDIAN_IDS`, `COMPANION_ORDER`, `UNLOCK_ORDER`, `LEGACY_IDS`, `normCompanionId`, `companionDef`, `isMountId/isGuardianId`, `companionKind/Name`, 성장 `CMP_MAX_LV 30`·`cexpToNext`·`guardianShare`·`trampleRatio`·`cdMul`·`mountHpMul`·`mountSpeedMul`, 유대 `BOND_RANKS [0,15,40,80,130,200]`·`BOND_NAMES`('낯선 사이'…'영혼 결속')·`BOND_PERKS`·`BOND_GAIN`·`bondRank/bondNext`, `MOUNT_RULES`, `GUARD_RULES`, `STABLE_SHOP`, `TRIBUTE`, `COMPANION_QUESTS`, `STABLE_LINES`, `EGG_TEXT`, `CMP_TEXT`/`cmpText`, `DISMOUNT_NOTE`. 필드 설명은 파일 머리말 (공통 id·kind·part·obtain·cry·join, 탈것 rig·body·seat·move·flight·charge·special·ride·hazard·windMul·blightMul, 수호신 move·anchor·attack·skill·assist·aura·passive·light).
- **상태** `src/game/companion_state.js` (순수, 던지지 않음): `ensureCompanionState`, `migrateCompanions`(멱등), `heroLoadout`, `isOwned`, `ownedIds`, `ownedEntry`, `pendingIds`, `markSeen`, `guardianSlots`, `startLevelFor`, `bondRankOf/bondInfo/expInfo`, `equippedIds`, `loadoutKey`, `unlockCompanion(state, id, {source, silent})`, `evaluateUnlocks`, `bossKillUpdate`, `questClaimUpdate`, `relicUpdate`, `stageClearUpdate`, `addCompanionExp`, `addBond`, `equipMount`, `equipGuardian`, `companionAuraStats`, `mountRideStats`, `mountDerived`, `guardianDerived`, `obtainEgg/eggStatus/hatchEgg`, `tributeCost/tributePreview/giveTribute`, `buyCompanion`, `applyCompanionDebug`.
- **버스 연결** `src/game/companion_events.js`: `initCompanions(game)` → `game.companions = { recruit(id), unlock(id, opts), evaluate(opts), state() }`; bossKilled(보스형 합류·알), stageCleared(clears +1·유대 +6·부화 알림), questClaimed(의뢰형), relicFound(녹티스), bondUp(토스트 '「아리아」와의 유대가 깊어졌다 — 공명') — 스토리 세이브만.
- **런타임** `src/game/companions.js` (CMP-SYS): `class CompanionSystem` = `world.companions`: `active`, `onRoomLoaded`, `sync(force)`(편성이 바뀌면), `update(dt)`('guard' 입력은 buffered, HUD 탭, 자동 스킬 `autoSkill(p)` — 보스 근접·주변 적 수에서 늦게 받는 보스의 대역 `pendingBoss` 는 뺀다, 공명), `onHit`(협공), `onKill`(경험치 분배·50킬 유대), `onBossStart`(noMount), `onBossDefeated`, `onRespawn`, `onStatsChanged`, `incoming(p, dmg, attack) → {dmg, mounted, noStagger, cancel} | null`, `shieldT`(아리아 결계 → 플레이어 무적), `airDrainMul`(루멘 0.5), `mountBlocked`, `tryGuardianSkill(auto)`, `castSkill(g, {auto, resonance})`, `keepFx(e)`, `hudInfo()`, `hudRects`, `callouts`, `debug`. `CompanionDirector`(엔티티 루프 안의 보이지 않는 감독). `companionHubEnter(game, hub)`(마구간 개장 → 해금 평가 → 2번 칸 안내 → 합류 연출 최대 3), `companionHubNote(state)`(마구간 '!').
- **탈것** `src/game/mount.js` (CMP-MOUNT): `class MountRider` = `player.mount` — 상태 stowed → summoning(0.45초) → riding → dismounting(0.30초) / recall / 'ult'. player.js 가 부름: `tick profile handleJump tryCharge updateCharge trySpecial adaptMove riderLift afterPhysics hazard dismount rideStats refresh hurtbox updateAnim riderAnim riderView draw(ctx, world, p, 'back'|'front') lights ghost healFrac beforeCast`; CompanionSystem 이 부름: `attach detach onRoomLoaded onRespawn onBossStart onBossDefeated incoming summon knockOff hudInfo`. 필드 `id riding chargeT invulnT state hp maxHp cd cdMax stamina staminaMax`. `MountGhost`(소환 안개·하차·도주), `DISMOUNT_SKILLS`, `fits(world, x, bottom, w, h)`, `findMountSpot(world, p, def, {cx, bottom})`, 메뉴 미리보기 `mountView/updateMountView/drawMountView`. `ledgeHint(dt, world, p)`: 날지 못하는 탈것이 넘지 못하는 턱에 막히면 방마다 한 번 `CMP_TEXT.ledge` 안내('{name}은(는) 이 턱을 넘지 못한다 — 내려서 올라가자', R1-REQ-369). `attach` 는 `MDRAW.preloadMounts` 를 한 번 부른다. 기수: `p.ride = {sx, sy, lean, duck, footY, legs, reins, gait, phase}` → drawHero 앉은 자세.
- **2부 탈것** `src/game/mount_b.js` (CMP-MOUNT-B): `MOUNT_B[id] = { charge?{start,tick,end}, special?(r,world,p)|{start}, passive?{tick,hazard,land} }` — mt_ignis(화염 돌진·업화 발굽), mt_gale(질풍 돌격 8방향·뇌명 급강하, windMul 0.5), mt_silva(뿔 돌격·정화의 울음: 부패 −40 + HP 5 %, blightMul 0.5, 독 면역). 도우미 `r.atk/strike/hit/startAct/showName/rect/power/d`.
- **수호신** `src/game/guardian.js` (CMP-SYS): `class Guardian`(kind 'companion', 무적·충돌 없음, z 11|9), `gAttack(g, o)`(hitstop 0 필수, tags ['companion','guardian']), `gStrike(world, rect, attack)`(적·보스만, 거울 스위치·포자 주머니 등 `noGuardianHit` 제외), `gHitOne`, `GHit/GProj/GFx`, `gBlast`, `GUARDIAN_AI`(1부 여섯), `aiFor(id)`(→ `GUARDIAN_AI_B` → 데이터 기본), `runKind`(proj burst volley pounce slash bash cone dive blink zap bite swing ring flash), `KINDS`, `blockable`, `drawPlaceholder`. AI 규약 `{init, think, attack, assist, skill(g, world, mul, o), passive, onEvent('hit'|'kill'|'hurt'|'idle'), drawWorld, projRender?}` (`projRender` = 데이터 'proj' 자동 공격 탄 그림; 미라가 거울 파편으로 씀, R1-REQ-328). 표적 `aimBox(T, x, y, floorY?, bh?)`·`aimPoint(T, x, y)`(hitParts → hurtboxes → hurtbox → 몸 중 가장 가까운 살아 있는 맞는 상자; 지상 근접 수호신은 떠 있는 보스 상자까지 뛰어오른다, R1-REQ-372), `quietExpire(world, q)`(적 탄을 거둘 때 onExpire 를 조용히 한 번 — 쏜 적의 탄 장부만 풀고 폭발·연출은 없음; 가웨인 막기·방패벽·미라·모모, R1-REQ-173). 생성자가 `render/guardians.js` `prewarmFx(id)` 로 연출 스프라이트를 미리 굽는다.
- `src/game/guardian_ai_b.js` (CMP-GUARD-AI-B): `GUARDIAN_AI_B` = gd_clock(정지된 초침: timeStop), gd_reaper(영혼 수확·처형), gd_mirra(만화경 난반사·되비추기), gd_lumen(심해의 등불: 기절 + deep 숨 100), gd_momo(악몽 포식·한입에 꿀꺽). 적 탄 제거는 `quietExpire`(guardian.js 에서 가져온다).
- **그림**: `render/mount_rig.js`(순수 수학: `mountPose(m, dt)`, `seatOf(pose)`, `registerTemplate/getTemplate/templateFor`, `quadPose`, `ik2`, `footCycle`, `GAIT`, `MOUNT_TUNE`, `TEMPLATES`) · `render/mounts.js`(`drawMount(ctx, m, world, 'back'|'front', {alpha, tint, scale, noFx, flash, rider})` = `MOUNT_DRAW_B[id]` → 채색 퍼핏 → 벡터; `drawMountIcon`, `preloadMounts`, `MOUNT_PAL`) · `render/mounts_b.js`(늑대·비룡·박쥐·그리핀 템플릿 등록 + `MOUNT_DRAW_B`, `MOUNT_ICON_B`, `MOUNT_PAL_B`; CMP-MOUNT-ART-B **진행 중**) · `render/guardians.js`(`drawGuardian(ctx, g, world, opts) → bool` = 채색 → `GUARDIAN_DRAW_A`/`GUARDIAN_DRAW_B` → false; `drawGuardianIcon`, `drawGuardianProcedural`, `prewarmFx(id)`, FX 도우미 `fxFairyDome fxShieldWall fxMeteor fxPhantomWolf fxHolyBeam fxBoneShard fxClockFace fxScytheSweep fxSecretOutline fxBreath`, 공유 `PO gGlow gStar gHalo gSparkles gAwake`) · `render/guardians_b.js`(`GUARDIAN_DRAW_B`, `GUARDIAN_ICON_B`, `fxGear fxMirrorShard fxKaleido fxMirrorPane fxLumenFlash fxLumenBolts fxStunSparks fxMomoVortex fxMorsel`; CMP-GUARD-ART-B **진행 중**). 채색 동료 20종은 `src/render/painted/companions/<id>.js` (§12).
- **화면**: 메뉴 탭 `companions`(동료, 문양 'paw', `scenes/menu/tab_companions.js` `CompanionsTab`: 편성 띠·목록·HeroStage 미리보기·상세·장착) · 합류 연출 **`companionJoin`**(`scenes/companion_join.js`, `game.push('companionJoin', {id, source, onDone})`, opaque·uiScale·deferToasts, 마을·마구간에서만; `CompanionFigure` — `draw(ctx, x, bottom, scale, {layer, facing, alpha, awakened, rider})`, rider 기본값은 layer !== 'all', R1-REQ-238) · 영혼의 마구간 **`stable`**(`scenes/town/stable.js`, `StableScene extends ServiceScene`: 탭 공물·구입·부화·의뢰, '동료 관리' → 메뉴 동료 탭, 1장 전에는 닫힘 모드).
- **마을 (CMP-TOWN)**: `data/town.js` 마을 폭 96칸 (마구간은 성문 동쪽 x 4032–4608): `BUILDINGS` 'stable'(문 89, `scene:'stable'`, x 4100–4580), `TOWN_NPCS` npc_greta, `GRETA_LOOK`, `TOWN_TALK`, `TOWN_LAMPS`, `TOWN_PROPS`; `data/npcs.js` `npc_greta`(그레타 · 영혼의 마구간지기, `appear.minChapter 1`, role 'stable'), `NPC_ORDER`; `scenes/town/facades.js` 마구간 파사드(PAINT/LIVE/HEIGHT.stable, 간판 'horse', `info.stableNote` 의 '!') + `drawStallHead(ctx, id, x, y, s, t, k)`·`drawSpiritWisp(ctx, id, x, y, s, t, a)`; 허브(`hub.js`)는 enter/onResume 끝에 `companionHubEnter`, `boardInfo.stableNote`. 스크립트(`data/story_companions.js` `COMPANION_SCRIPTS`): `cmp_stable_open cmp_bat_arrive cmp_slot2 cmp_egg_ready npc_greta_default npc_greta_tip1 npc_greta_tip2 npc_greta_ch2 _ch4 _ch5 _ch8 _ch11 _ch14 q_cq_hati_start/_done q_cq_skoll_start/_done`.
- 상호작용 규칙: 깊은 물(deep)에 들어가면 자동 하차·소환 불가; 돌풍 × `def.windMul`, 부패 × `def.blightMul`; 수호신 타격은 스타일 ×0.5, 각성 게이지 0, SP ×0.4, 경직 0(협공 0.03); 필살기·각성기는 먼저 하차; 보스 `def.noMount`.
- 효과음 `core/audio_companions.js` (import 하면 31종 등록): `CMP_SFX`, `CMP_SFX_NAMES`, `registerCompanionSfx`, `playCry(def)`, `playKnockOff(def)`.
- 시험: `node tools/test_companion_state.mjs` · `node tools/test_mount.mjs [--only mt_ignis,mt_gale,mt_silva]` · `node tools/test_guardians.mjs [--only A,B]` · 갤러리 `tools/gallery_mounts.html`, `tools/gallery_guardians.html`.

## 11. 제2부 「균열의 순례」 (s14–s20)

### 11.1 스테이지
| id | 이름 | 테마 | 기믹 (stage.gimmick) | 보스 | 음악 | 방 |
|---|---|---|---|---|---|---|
| s14 | 거울의 성 | mirror | `mirror` (위상 A/B, 스위치 Q) | b_narkissa | s14 | 6 |
| s15 | 영겁의 용광로 | forge | `magma` (mode 'tide') | b_moloch | s15 | 6 |
| s16 | 가라앉은 성소 | sunken | `deep` (수영·산소) | b_dagon | s16 | 6 |
| s17 | 폭풍의 공중정원 | sky | `wind` (돌풍·상승 기류) | b_ziz | s17 | 6 |
| s18 | 악몽의 미궁 | nightmare | `heartbeat` (박동 벽 z/Z) | b_mara | s18 | 8 |
| s19 | 썩어가는 숲 | blight | `blight` (부패 게이지·포자) | b_behemoth | s19 | 6 |
| s20 | 태초의 공허 | void | 방마다 (`voidwall` 등, 앞 스테이지 기믹 재조합) | b_nihil | s20 | 6 |

- `data/stages.js`: `STAGE_ORDER_P1`(s01–s13), `STAGE_ORDER_P2`(STAGES 에 있는 s14–s20만), `STAGE_ORDER = [...P1, ...P2]`, `RELICS`, `SHARDS`(k_star_1…6), `HEARTS`(k_heart_1…6). 맵 `data/maps/s14.js…s20.js` (`ROOMS`). 방 필드: `gimmick`(undefined → 스테이지 값, null → 없음, 객체/배열), `liquid`, `doorMarks: ['blood'|null, …]`(문 순서대로). 각 소비자는 P1/전체를 골라 쓴다 (월드맵 0쪽 = P1, 서바이벌 = P1 + `def.noArena` 제외, 아케이드 목록·슬롯·성당·도감 = 전체).
- 흐름: 1부 진엔딩 크레딧 뒤(또는 2부 이전 세이브의 첫 월드맵 방문) `p2_prologue` → 마을 → s14 … s20 → 엔딩 `p2`(파수꾼의 밤) 또는 `p2true`(새벽의 별; 별의 조각 6개 또는 flags.stars_all). `decideEnding(st, from)`, `ENDINGS.p2/p2true` (`scenes/front/ending.js`), 2부 엔딩 뒤 마을로, `creditsFor` 가 `CREDITS_P2` 를 끼운다.

### 11.2 기믹 엔진 (`game/gimmicks.js` GIMMICK-ENGINE, `game/gimmicks_b.js` GIMMICK-KINDS-B)
- `createGimmick(world, room) → GimmickSet | null` (loadRoom 에서 → `world.gimmick`), `resolveGimmickConfig(stage, room)`, `GIMMICK_KINDS = ['mirror','magma','deep','wind','heartbeat','blight','voidwall']`, `class MirrorSwitch`('Q'), `SporePod`('y', gimmicks_b 에서 다시 export), `GIMMICKS_B`.
- **`world.gimmickOf(kind)`** → 그 종류의 구성원 | null (보스·적·기술은 늘 null 확인). GimmickSet: `kinds`, `get(kind)`, `has`, `update(dt)`(히트스톱 중 안 불림, cutscene 중 진행 멈춤), `beforePlayer`, `prePhysics(p,dt)`/`postPhysics(p,dt)`, `onJumpInput(p) → bool`(수영), `healMul()`(곱: blight 상태 이상 0.5), `noRegen`(OR: blight 상태 이상), `speedMul`(곱: deep 물속 0.72, blight 상태 이상 0.9), `bgFlip`(거울 허상), `lights(L)`, `drawWorld(ctx, cam, 'under'|'back'|'front')`, `drawScreen(ctx, vw, vh)`(게이지는 `hud.meter()` 줄에만, hudHidden 이면 게이지 생략), `meterRows`, `onFell(p)`, `onRespawn()`, `cleanse(n)`, `reset()`, `dispose()`.
- 종류별 API: mirror `phase` 'A'|'B', `flip(force)`, `setAuto(sec)`, `warning` · magma `level`(표면 y px), `setLevel(row, speed)`, `setMode(mode)`, `atRest` · deep `air`(0–100), `inWater`, `setWaterRow(row, tx0, tx1, time)` · wind `gusting`, `warning`, `dir`, `gust(dir, force, dur, warn)`, `setAuto(bool)` · heartbeat `beatIndex`, `beat`, `warning`, `setBeat(sec)` · blight `meter`, `status`, `addCloud(x,y,w,h,life)`, `spawnPod(tx,ty)`, `cleanse(n)` · voidwall `mode`, `wallX`, `wallR`, `closeIn(x0,x1,speed)`, `open(speed)`, `reset()`.
- 새 맵 문자: `a`/`b` 위상 A/B 에서만 고체(거울) · `Q` 거울 스위치 · `z`/`Z` 짝수/홀수 박동에서 고체 · `u` 공기 방울 기둥 · `U` 상승 기류 칸(고체 아님) · `y` 포자 주머니. 위상 칸은 `map.phaseTiles`. 문 표식 `room.doorMarks` → `Door.mark === 'blood'`. 석상 정화 `gimmick.cleanse(100)`.
- 공용 도우미: `solidAt rectFree rectHitsTile bodyRect setTile gimmickBodies liftOut cachedCanvas edgeVignette drawMeter warnOnce bufWindow reducedMotion`.

### 11.3 적 24종 (P2-DATA · ENEMY-P2-C/D-AI · ENEMY-P2-C/D-ART)
데이터 `data/enemies_c.js`(s14–s16) · `enemies_d.js`(s17–s20), AI `game/ai_c.js` · `ai_d.js`, 벡터 `render/enemies_c.js`(`RENDER_C PROJ_C ZONE_C`) · `enemies_d.js`, 채색 `render/painted/enemies/<id>.js`. `def.noArena` = 기믹에 기대는 적(서바이벌 제외).
- s14 `mirror_knight` 거울 기사 · `glass_wraith` 유리 망령 · `reflection` 비친 자(drawHero 로 그림) · `chandelier_fiend` 샹들리에 마귀
- s15 `forge_imp` 용광로 임프 · `slag_golem` 쇳물 골렘 · `chain_warden` 사슬 간수 · `bellows` 불풀무
- s16 `abyss_angler` 심해 아귀 · `sunken_priest` 수몰 사제 · `coral_crab` 산호 게 · `siren` 세이렌
- s17 `storm_harpy` 폭풍 하피 · `gale_knight` 질풍 창기사 · `thunder_roc` 뇌조 · `cloud_jelly` 뇌운 해파리
- s18 `puppeteer` 악몽 인형사 · `faceless` 얼굴 없는 자 · `dream_eater` 꿈 삼키는 자
- s19 `rot_treant` 썩은 나무거인 · `plague_moth` 역병 나방 · `fungal_husk` 균사 망자
- s20 `void_herald` 공허의 전령 · `nihil_spawn` 무의 파편 (+ 앞 스테이지 적 재등장)
- 맵의 숫자 칸 `1`–`9` 는 방마다 `room.enemies['1'…'9']` 표로 적을 고른다 (배치는 world2 §4.3, 예: s14 `1 mirror_knight … 5 phantom_sword 7 mimic`; `stage.enemies` 는 숫자와 무관한 스테이지 명단 — 채색 적 미리 굽기 `preloadPaintedEnemies`·서바이벌 출현표가 읽는다).

### 11.4 보스 7체 (BOSS-P2-KIT · BOSS-P2-1…4; 그림 ART-BOSS-6…8)
| id | 이름 | 스테이지 | 클래스 파일 | 음악 | 페이즈 대사 |
|---|---|---|---|---|---|
| `b_narkissa` | 나르키사 (만경의 여제) | s14 | `bosses/c_narkissa.js` | boss3 | `b_narkissa_shatter` |
| `b_moloch` | 몰록 (용광로의 우상) | s15 | `c_moloch.js` | boss4 | — |
| `b_dagon` | 다곤 (가라앉은 성소의 사제왕) | s16 | `c_dagon.js` | boss3 | — |
| `b_ziz` | 지즈 (폭풍을 부르는 거신조) | s17 | `c_ziz.js` | boss4 | — |
| `b_mara` | 마라 (악몽을 낳는 자) | s18 | `d_mara.js` | boss3 | `b_mara_dream` |
| `b_behemoth` | 베헤모스 (부패한 대지의 짐승) | s19 | `d_behemoth.js` | boss4 | — |
| `b_nihil` | 니힐 (태초의 공허, 4형태) | s20 | `d_nihil.js` | nihil | `b_nihil_form2`, `b_nihil_final` |

- 데이터 `data/bosses_c.js`/`bosses_d.js`, 레지스트리 `game/bosses/bosses_c.js`/`bosses_d.js`(SKEL 최종본: 클래스가 null 이면 빠지고 GenericBoss 대체).
- **늦게 받는 보스** `game/bosses/lazy.js` (R1-REQ-229, 1·2부 보스 20체 모두): 보스 클래스 모듈을 보스마다 `import()` 로 받는다 — world.js 와 아케이드(front/arcade.js·arcade_run.js)는 이 파일만 쓰고 `bosses/index.js`(모든 보스를 정적으로 싣는 동기 경로, 불러와지면 자기 클래스를 여기 등록)를 첫 조각에 넣지 않는다. `createBoss(world, id, x, y)` 는 동기: 클래스가 있으면 진짜 보스, 받는 중이면 **`PendingBoss`**(`pendingBoss = true`, 무적·무해·그리지 않음, 상태 'intro', `debugAct` 없음)를 돌려주고, 대역은 모듈이 오면 update 에서 `become(C, world)` 로 `world.entities`·`world.boss` 의 자기 자리를 진짜 보스로 바꾼다 (세 번 실패하거나 20초 안에 안 오면 GenericBoss, 다시 받기 1.5초 간격). `loadBoss(id) → Promise<class|null>`, `preloadBosses(ids)`·`preloadStageBosses(stageId)`·`loadAllBosses()`, `stageBossIds`, `bossLoaded`·`knownBoss`·`BOSS_IDS`·`registerBosses`·`forgetBoss`(시험용). bus 'stageEntered' 때 그 스테이지 보스를 스스로 미리 받는다(월드맵도 미리 부른다). 도구는 `world.boss` 를 잡기 전에 `await world.bossReady()` 또는 `!w.boss.pendingBoss` 를 기다린다 (`tools/test_part2.mjs` `waitRealBoss`).
- `game/bosses/c_common.js`: `class BossC extends BossB` — 상태 `s_<이름>(dt, world, t)`, `done(rest)`, 가중치 `P2_PATTERNS[id]{attacks, helpers, transitions, weights, gimmicks, floorRow, room}` 로 다음 패턴, `forceNext(name)`, 페이즈 전환 `onPhase → enterTransition → transitionTick/applyPhasesTo/requestScriptsTo/endTransition`, 부활 때 `resetFight()`(+`onReset`), `debugAct/debugPhase/attackNames/transitionNames`. 함수: `patternsOf attackNamesOf transitionsOf`, 페이즈 대사 `phaseScript(boss, id, {onEnd})`·`pumpPhaseScripts`·`phaseScriptBusy`·`cancelPhaseScripts`·`canShowScript` (스토리 모드·처음·cutscene 이 풀린 뒤에만 dialogue), 기믹 `gimmickOf(world, kind)`·`bossGimmick(boss, kind)`(방에 없으면 같은 API 의 대역 `standIn`: 보스 러시 경기장용)·`setMagma magmaY setWater waterY windGust windAuto windState setBeat sporeCloud sporePod wallsClose wallsOpen wallsX mirrorFlip`, 경기장 `resetArena ARENA_RESET spawnMinion minionsAlive clearMinions killTransients darken screenTint clearTints muteMusic clearMood`, 예고·지대 `telegraph warnText warnMark strikeRect strikeColumn strikeLine strikeCircle strikeFloor ringWave groundWave pullField nudgePlayer`, `fixArena`, `STANDIN_KINDS`.
- b_nihil 'final' 전환: `run.sp = 100`, 1차 전직 이상이면 `run.aw = 100`, holyaura 20초, 공허의 벽 열림. 대사 `b_nihil_final` 에 합류한 2부 동료마다 한 줄. 갤러리 `tools/gallery_bosses_c.html`, `_d.html`.

### 11.5 스토리 (STORY-P2-A/B)
- `data/story_p2.js` `SCRIPTS_P2 = {...A, ...SCRIPTS_P2B}`, `CREDITS_P2`; `data/story_p2b.js` `SCRIPTS_P2B`. 합치기는 `data/story.js` 끝.
- 스크립트 id: `p2_prologue` · 장마다 `s14_intro s14_t1 s14_t2 b_narkissa_pre b_narkissa_shatter b_narkissa_post s14_outro` · s15(`b_moloch_*`) · s16(`b_dagon_*`) · s17(`s17_t1 npc_rook_s17 s17_t2 b_ziz_*`) · s18(`npc_carmilla_s18 b_mara_pre b_mara_dream b_mara_post`) · s19(`b_behemoth_*`) · s20(`b_nihil_pre b_nihil_form2 b_nihil_final b_nihil_post s20_outro`) · 엔딩 `ending_p2`, `ending_p2true` · NPC 장별 `npc_<id>_ch14…ch20` · 의뢰 `q_<questId>_start/_done` (bd_rift bd_mirror bd_deep bd_storm bd_combo200 hd_ember hd_plus15 rk_stars rk_stars6 el_pearl ab_dawnflower mt_feast cm_dreams).
- 새 명령 **`{cmd:'recruit', id}`**: `flags['recruit_'+id] = true` + `game.companions?.recruit?.(id)` (대화·컷신 모두, 건너뛰기도 실행; 합류 연출은 마을). 아웃트로의 합류 명령은 조건 분기보다 앞에 둔다 (results.js 가 새 분기를 보면 아웃트로를 다시 튼다).
- 컷신 명령(`scenes/front/story.js`): `cg bg wait title flash recruit`. 새 플래그: `p2_started rook_revealed hearts_all stars_all p2_star p2_done s14_revealed s20_revealed dawnflower_given recruit_<6 ids> ending_p2 ending_p2true stable_open`.

### 11.6 아이템·비전서·퀘스트·지도·음악·아케이드
- 7단계(ITEMS-P2/P2-DATA, `TIER_LV[6] = 50`, 로마 숫자 Ⅶ): 무기 `w_<type>_13/14`(아이콘 `<type>_7`, visual `{style:6, rift:true}` = 무지갯빛 균열 광택), 방어구 `a_head/body/cloak_13/14`, 장신구 `a_ring_13/14 a_amulet_13/14`, 재료 `m_mirror m_ember m_pearl m_gale m_dream m_spore m_void`, 열쇠 `k_rift_lantern k_heart_1…6(worldHeart, color) k_star_1…6(starShard) k_dawnflower`, 고유 `u_narkissa u_moloch u_dagon u_ziz u_ziz2 u_mara u_behemoth u_nihil u_nihil2 u_alberto`, 신화 `u_dawn_whip/sword/great/dagger/gun/staff` → `MYTHIC_WEAPONS_P2`. 드롭(`game/loot.js`): 보스 고유는 첫 처치 확정·다시 잡으면 40 %, 세계의 심장은 중복 없음, 신화(7단계 `MYTHIC_WEAPONS_P2`)는 b_nihil 첫 처치 확정·이후 50 % · 다른 2부 보스 1.5 % · s20 정예 0.6 % (× 드롭 배율).
- `world.collect` 가 별의 조각(`progress.shards`, bus `shardFound`, 6개면 stars_all)·세계의 심장(`progress.hearts`, bus `heartFound`, hearts_all)을 기록하고 배너를 띄운다.
- 비전서 d21–d27, 기록 l21–l34 (`data/lore.js`; §15 표). 퀘스트(`data/quests.js`): 메인 s14–s20, 2부 의뢰 13 + 그레타 의뢰 `cq_hati cq_skoll`.
- 월드맵(`scenes/town/worldmap.js`, WORLDMAP-P2): 두 쪽 — 0 악마성 Ⅰ(STAGE_ORDER_P1 + 투기장, 유물 5) · 1 이계 Ⅱ(s14–s20, 세계의 심장 6·별의 조각 6; flags.p2_started 이거나 s14 가 열렸을 때만). `enter({page})`, 해금 연출 s13·s14(s14_revealed)·s20(s20_revealed), 옛 세이브는 들어오자마자 `p2_prologue`, 쪽 전환 Q/E·Tab·LB/RB, 음악 worldmap ↔ worldmap2 교차 페이드.
- 음악 `data/music.js` 2부 11곡: `s14…s20 boss3 boss4 nihil worldmap2`. 마을 하늘의 균열(2부 진행 중, hub.js).
- 아케이드(`scenes/front/arcade.js`, `arcade_run.js`): `BOSS_ORDER` + 7, 코스 이계편·전 보스 연속, 레벨 프리셋 '이계의 순례자', 무기 단계 ≤ 7, `p2Known`.

## 12. 채색 그림 시스템 (ART_DECISION: 모든 캐릭터·크리처 = Kling 원화로 만든 채색 컷아웃 퍼펫 + 절차적 VFX, 벡터는 대체 그림으로 남음)

**현황 (2026-09-28, `node tools/qa/painted_registry.mjs`)**: 보스 20/20 · 적 렌더 id 90/90 (91종 중 보이지 않는 medusa_spawner 제외) · 동료 20/20 · 영웅 6명 × 7직업 = 42 + NPC 7명 퍼펫 (폴더 8: npc_alberto npc_carmilla npc_elise npc_greta npc_hadwin npc_marta npc_rook + 로크의 2부 모습 npc_rook2). 영웅 8방향 턴테이블 보기는 ART-HERO-B **진행 중**.

| 대상 | 런타임 | 에셋 | 제작 도구 | 플레이북 |
|---|---|---|---|---|
| 영웅 + NPC | `render/hero_puppet.js` (+ hero.js 분기, `puppet_manifest.js` 자동 생성) | `assets/puppets/<charId>/<classId>/{rig.json, atlas_{lo,hi,ui}.webp, mask_*.webp, turn.webp}`, NPC 는 `assets/puppets/npc/<npcId>/` | `tools/puppet/` (ingest, grid, build_rig, build_turn, build_cape, build_all, review, bench) | `docs/art/PUPPET_PIPELINE.md` |
| 보스 | `render/painted/kit.js` + `registry.js` + `painted/bosses/<id>.js`; 훅은 a_common/b_common(BossC 포함) | `assets/painted/bosses/<id>/{atlas.webp, manifest.json}` | `tools/painted/` (matte, build_parts, build, grid, sheet, poses, fight, bench, rng, pop, configs/, poses/, raw/, prompts/) | `docs/art/BOSS_PIPELINE.md` |
| 일반 적 | `render/painted/enemy_kit.js` + `painted/enemies/<id>.js` (`_biped.js` 공용), 디스패처 `render/enemies.js` | `assets/painted/enemies/<id>/{atlas.webp, rig.json}` | `tools/painted/enemies/` | `docs/art/ENEMY_PIPELINE.md` |
| 동료 | `painted/companions/<id>.js` (kit + registry, kind 'companion'); 탈것은 mount_rig 포즈를 공유 | `assets/painted/companions/<id>/` | `tools/painted/companions/<id>/` | (BOSS/ENEMY 플레이북 + companions §11) |

- **등록 (R15)**: 패키지마다 `src/render/painted/reg/<key>.js` 하나 — `export const bosses = {id: () => import(...)}`, `enemies = [{mod, ids?}]`, `companions = {id: importer}`, `npcs = {id: importer}`. 모음 `reg/index.js` `REG_PACKAGES`(새 패키지만 리드가 한 줄 추가). `registry.js`·`painted/enemies/index.js`(`PAINTED_ENEMIES`)는 모음을 읽을 뿐 아무도 고치지 않는다.
- **`registry.js` 계약**: 렌더러 모듈 `export default { id, kind:'boss'|'enemy'|'companion', async load(env) → rig, init(ent, rig), draw(ctx, ent, world, rig, st), bounds(ent, rig, st, out), lights?, ownsDeathFade? }` (env = {game, td, budgetMB, quality}). API `registerPainted(id, {kind, importer, module})`, `hasPainted`, `paintedIds(kind)`, `paintedState(id)`, `paintedRig(id)`, `paintedEnabled(game)`, `preloadPainted(id, game, zoom)`(보스 방 진입·보스 생성 때 — 등장 연출 뒤에서 굽는다), `refreshPainted`, `releasePainted`, 보스 훅 `paintedTick(boss, world)`(update 끝) · `const pd = paintedDraw(boss, ctx, world); if (pd === true) return;`(0<pd<1 = 벡터→채색 320 ms 교차 페이드) · `paintedDebris(boss, i)`, 적 훅 `drawPaintedDirect(ent, ctx, world, id)`. 보스는 컬링 대리 개체(kind 'painted')가 넓은 그림 영역을 그린다.
- **`kit.js`**: `quality(game)`/`QUALITY`, `textureDensity(game, zoom)`, `memoryBudgetMB(game)`, `isPhone`, 그리기 난수 `RenderRNG rr hash1 seeded`, 굽기 `makeCanvas silhouette outlined darkened recolor RECOLOR bakeDamage crackWalk`, `loadManifest`, `loadRig(dir, def, env)`(부품 변형 base·deep·dmg1/2·flash·glow·틴트를 한 번 굽기, 시간 분할 `nextIdle/sliceStart`), `texMemMB`, `pickVariant`, `Drawer`(부품 = setTransform + drawImage, `save/restore/unwind`), `Chain`, `ik2`, `Strand`/`drawStrand`, `ledgesOver`, `puff halo glowSprite`, `Particles`+`PRESET`, `DamageState`, `Shards`, `PAD`.
- **`enemy_kit.js`**: 등급 T1(스프라이트+변형) · T2(미니 퍼펫 6–10부품) · T3(큰 퍼펫 + 손상 변형). `requestRig(spec)`, `rigReady`, `refreshRig`, `releaseRigs`, `rigStats`, `rigMemMB`, 그리기 `begin/end/local/part/put/putStretch/bone/pivotPos/strips/warpY/chain/glow/shadow`, `FxPool`, `groundBelow`, `spawnCorpse`, `spawnDissolve`, 도우미 `atkPhase hurtOf deathK squashK flashK lod nStrips clockOf`, `stats`. 적 모듈 = `export const spec = {id, src, …}` + `export function draw(ctx, e, world, o, rig)`. 스테이지 진입 때 그 스테이지 적 목록을 미리 굽고(`preloadPaintedEnemies`), 준비 전에 벡터로 보였으면 0.3초 교차 페이드.
- **`hero_puppet.js`**: `puppetFor(p, look)`(준비 전 null → 벡터), `preloadPuppet(charId, classId)`, `hasPuppet`, `classOf`, `applySpec`, `drawLayers`, 턴테이블 `turnReady/drawTurnStep/drawTurnWeapon/drawTurnCape/drawTurnWings/drawTurnHalo/turnSteps`, NPC `NPC_CID 'npc'`/`npcIdOf`/`hasNpcPuppet`, `setPuppetEnabled`/`puppetEnabled`, `puppetStatus`, `puppetRev`, `PUP_H 90`, `capeCanvas`. 갑옷 색은 재질 마스크(R 갑옷, G 장식)로 다시 칠함, 망토는 절차적 베를레 띠, 무기·효과는 `hero_parts.js` 절차적 그림 → **장비·전직이 외형에 그대로 반영**된다.
- **킬 스위치**: `?painted=0` · `window.__paintedOff = true` · `settings.painted === false` → 보스·적·동료가 벡터 (게임은 그대로 진행 가능해야 한다). 적만 `window.__paintedEnemies = false`. 영웅 퍼펫 `setPuppetEnabled(false)` 또는 look.puppet === false.
- **메모리·성능 예산**: 보스 1체 구운 텍스처 데스크톱 ≈ 15 MB / 휴대폰 ≈ 6 MB (loadRig 가 텍셀 밀도를 낮춰 맞춤, 한 번에 보스 리그 1개, 스테이지 바뀌면 해제) · 적 1종 0.3–1.5 MB · 채색 텍스처 예산 `assets.paintedBudget` 휴대폰 32 MB / 터치 태블릿 40 MB / 데스크톱 64 MB (`assets.track`; 싸움이 아닌 장면(허브·타이틀·월드맵·상점)에서는 painted/registry.js 가 구운 보스·적 리그를 놓는다) · 그리기 비용 ≤ 벡터의 1.5배 · 부품 그리기 ≤ ~90/보스 · 입자 풀 420/260/120 · 굽기는 페이드·대사·등장 연출 뒤에서만. 모든 파일은 assets.js 로 읽는다 (팩·lo/·LRU 적용). Kling 원화는 워터마크를 자르고 패키지별 `tools/kling/manifest_<pkg>.json` 에 출처를 남긴다.

## 13. 배포 (웹 · 서비스 워커 · 아티팩트 · APK)

- **웹 빌드** `node tools/deploy/build_web.mjs` → `dist/web`(게시 폴더) + `dist/deploy`(Netlify 업로드 묶음: web/ + netlify/functions·lib + package.json + publish='web' netlify.toml) + `dist/build_web_report.json`. 허용 목록만 복사(`index.html manifest.webmanifest sw.js robots.txt css/ src/boot-gate.js assets/ downloads/`), 공개 금지(`tools docs android netlify node_modules dist .git`, `*.keystore *.jks *.p12 *.properties .env*`)가 섞이면 빌드 실패(`--selftest-deny`). 의존성 없는 번들러 `tools/deploy/lib/{bundle,scope,minify,acorn}.mjs` → `src/bundle/<내용 해시>/app.js` + 동적 import 조각 `lazy-*.js` (`--no-bundle` 로 비교). main 밖 모듈은 '소유 집합'(그 모듈에 정적으로 닿는 lazy 묶음들)이 같은 것끼리 한 조각(여럿이 함께 쓰면 공유 조각)이라 조각 사이 정적 import 는 큰 집합 쪽으로만 간다. 조각 수 상한 `maxLazyChunks`(`--max-lazy`, 기본 7 → main 포함 8 = 아티팩트 한도)를 넘으면 조각 하나와 그 조각이 (간접으로라도) import 하는 조각 전부를 한 조각으로 합친다(가장 많이 줄이는 것부터; 서로 import 하지 않으면 가장 작은 둘) — 밖으로 나가는 import 가 없어 순환이 생기지 않고, 그 조각을 받을 때 어차피 함께 받던 것이라 더 받는 바이트도 없다. 끝에 조각 import 순환 검사(있으면 번들러 오류로 멈춤)와 main 조각이 다른 조각을 정적으로 import 하지 않는지 확인. 버전 표시: `buildHash`·build.json 에는 배포 전용 파일 `downloads/`(APK·latest.json)·`_redirects` 를 넣지 않는다 (`isDeployOnly`) → 게임 파일이 이전 빌드와 같으면 이전 version·built·commit 을 그대로 써서 build-info.js·build.json·index.html·sw.js 가 바이트까지 같다(APK 만 새로 넣은 재빌드도 verify_apk 해시가 맞음; package.json version 을 올렸으면 새로 찍음). `--restamp` 면 같아도 새 버전·시각을 찍는다. `build-info.js`(window.__BN_BUILD: 모듈 수·lo 목록·팩), `build.json`(파일별 해시), `_redirects`(`/apk`·`/download` → 최신 APK), 글꼴 검사·맵 검증·크기 예산(사이트 ≤ 90 MB, APK 입력 ≤ 45 MB 경고, 첫 화면 brotli ≤ 1.6 MB). 저사양 그림 `python3 tools/assets/make_variants.py` → `assets/lo/`.
- **netlify.toml**: `[build] command = "node tools/deploy/build_web.mjs --no-apk --no-deploy-bundle"`, `publish = "dist/web"`, `NODE_VERSION = "22"`, `[functions] directory = "netlify/functions"`; 헤더 CSP `script-src 'self'`(인라인 스크립트 없음), `style-src 'self' 'unsafe-inline'`, `connect-src 'self'`, Permissions-Policy gamepad·fullscreen·screen-wake-lock·autoplay, COOP same-origin, HSTS, 캐시 규칙. 비밀 값 `AUTH_PEPPER` 는 Netlify 환경 변수에만. **저장소 루트를 올리지 않는다** (`--dir .` 금지). 절차 `tools/deploy/README.md`.
- **서비스 워커** `sw.js` (빌드가 `BUILD {hash, version, precache, assets, manifest}` 주입; 비어 있으면 개발용 네트워크 우선): 캐시 `bn-<buildHash>`(코드·CSS·글꼴·index.html, 캐시 우선) + `bn-assets-v1`(그림, 경로 키 + build.json 해시 검증, 최대 800개). `/api/`·`/downloads/`·`build.json`·`sw.js`·Range·다른 출처·GET 아님은 건드리지 않는다. 페이지 이동은 네트워크 우선 3초. 새 워커는 대기하고 타이틀의 [업데이트](`platform.applyUpdate` → `SKIP_WAITING`)로만 켜진다.
- **claude.ai 아티팩트** `node tools/deploy/build_artifact.mjs [--check|--smoke]` → `dist/artifact` (조각 ≤ 8, 그림 팩 `assets/packs/<n>.bin`(파일 바이트를 이어 붙임, 머리말 없음) + `index.json {v:1, packs, files:{경로:[팩, 오프셋, 길이]}, complete}` ≤ 40, 한도 ≤ 511 파일·256 MB, 한 번 ≤ 255개·64 MB). 계정 숨김, 서비스 워커 없음.
- **안드로이드 APK** `node tools/deploy/build_web.mjs && tools/apk/build_apk.sh [--verify]` → `dist/BloodNocturne.apk` (Gradle 없이 aapt2·javac·d8·zipalign·apksigner; SDK 자동 설치). 웹 파일 = dist/web − sw.js − downloads/ − _redirects (`tools/apk/pack_web.py`). 예산 45 MB, 넘으면 휴대폰 밀도 단계 `lo`(bg/cg/portraits 원본 대신 lo/) → `lo+td`(채색 아틀라스 0.75배), 강제 `APK_ASSETS=full|lo|lo+td`. 서명 키 `tools/android/release.keystore` + `keystore.properties` (git 무시, **백업 필수**, 절대 공개 금지). 검증 `node tools/apk/verify_apk.mjs`.
  - 앱 셸 `android/app/src/main/`: `MainActivity`(WebView, 뒤로 = Escape, `html.bn-android`), `AssetServer`(`https://appassets.androidplatform.net/` 가상 출처로 `assets/www/`, MIME 표, lo/ 대체, index.html 에 `assets/app/head_inject.html` 삽입), `ApiProxy`(앱 안의 `/api/*` → `tools/apk/api_origin.txt` 의 Netlify 출처로, 헤더·본문·상태 그대로, no-store, 15초 제한 JSON 오류), `WebViewCheck`(WebView 주 버전 < 98 이면 게임 대신 업데이트 화면; 버전은 기본 User-Agent 의 `Chrome/NN`, 없을 때만 `WebView.getCurrentWebViewPackage().versionName` — Huawei 등 자체 번호를 쓰는 제공자 대비). 권한 INTERNET · VIBRATE 만.
  - **네이티브 계약**: `window.__BN_APP = {platform:'android', version, assets:'full'|'lo'|'lo+td', apiProxy, apiBase}` · `window.__BN_INSETS {l,r,t,b}` CSS px + window 이벤트 `'bn-insets'`(노치·보이는 시스템 막대) · `window.__BN_IME {bottom}` CSS px + `'bn-ime'`(API 30 이상만, 그 아래는 undefined; account.js 가 입력 칸을 올린다) · 브리지 `window.BNAndroid`: `isApp() version() exitApp() vibrate(json) insets() ime() rumble(strong, weak, ms)`(연결된 컨트롤러: API 31+ VibratorManager, 그 아래 단일 모터, 패드 없으면 무시) `apiStash(id, method, headers, body)`(WebView 는 POST 본문을 가로챌 수 없어 본문을 먼저 맡긴다).

## 14. QA 도구
- `tools/integration.mjs`: 케이스 `title hub worldmap inn arcade s01…s20 s01_boss…s20_boss menu` (`--list`), 페이지·콘솔 오류 0, 보스방은 끝에 `world.boss` 필요, `--mobile`, `--dist [dir]`(CSP 적용 빌드). 단계는 장면이 모두 등록된 뒤(`game.scenesReady !== false`, 60초 안에 안 되면 'BOOT' 실패)에 시작한다 (§3 두 단계 부팅). 종료 코드 0/1/2.
- `tools/test_part2.mjs` (P2-QA, world2 §17): `--static`(데이터) · 실행 묶음 `rooms gimmicks bosses flow legacy endings items loot mobile perf clears` · `--boss b_nihil,…`; 보스 검사는 경기장에 들어선 뒤 `waitRealBoss`(`world.bossReady()` + 대역이 진짜 보스로 바뀔 때까지 한 프레임씩)로 늦게 받는 보스를 기다린다; 결과 `/tmp/claude-0/proto/wpj/`.
- `tools/balance.mjs [difficulty] [charId] --check` (2부 s14–s20 행을 world2 §15 와 비교; 다른 영웅은 '1부 기준 보정' 범위, `--strict` 는 문구 그대로), `--json`, `--acc`, `--docs`, `--quests`, `--k 'ehp=…'`.
- `tools/feel_test.mjs` (FEEL-QA): feel §10 인수 검사 M1–M6 · C1–C15 · U1–U2 · A1–A8 · V1 · X1–X3 · I1 · R183, `--quick`, `--only`, `--heroes`; 결과 `/tmp/claude-0/qa_feel/`.
- `tools/qa/` (QA-TOOLS): `run_all.mjs`(§5.1 전체 회차, `--quick --only --skip --list --bail --apk --site --dist`) · `run_platform.mjs`(pad bind touch view menu pwa load turntable) · `platform_{pad,bind,touch,view,menu,pwa,load}.mjs` (`platform_load.mjs --dist`: 첫 프레임 slow4g ≤ 9초 · fast4g ≤ 2.5초, 첫 화면 경로(타이틀 장면이 서기 전에 시작한 요청 전부 — `window.__game` 이 생기는 순간을 init 스크립트가 찍는다) ≤ 1.6 MB, index.html 이 처음부터 받는 스크립트(`<script src>`·`<link rel=modulepreload>` = build-info.js·boot-gate.js·main 조각)와 타이틀 전 모듈 요청이 첫 요청에서 2 RTT + 250 ms 안; 타이틀 뒤의 lazy 조각 요청은 지표로만 남긴다 — 두 단계 부팅 §3) · `turntable.mjs` · `commands.mjs`(d02–d27 키보드·패드·터치, 서 있을 때·달릴 때, d14 vs 질주 공격) · `bindings.mjs` · `hook_tags.mjs`(`hook_tags_ratchet.json`, 그리기 경로의 fx.emit·난수 검사) · `painted_registry.mjs` · `perf_budget.mjs`(§5.2 예산: 프레임당 그라디언트·캔버스·입자·필살기/각성 때 더한 화면 전체 패스(타일 층 블릿 제외) 등, 결정적 계수; 살아 있는 캔버스는 새 페이지 s04 r1 → 메뉴 장비 탭에서 휴대폰 phone1·phone2 32 MB · phone1 low 26 MB · 태블릿 40 MB, 메뉴가 스테이지 기준보다 더하는 것 ≤ 8 MB, 데스크톱은 정보만 — W4 1회차 리드 결정) · `soak.mjs`(10분 반복: 힙·캔버스 ±10 %) · `visual_review.mjs`(접촉 시트) · 공용 `lib/`(`server.mjs` 의 `Session.waitGame()` 기본 조건은 `g.scenes.length > 0 && g.scenesReady !== false`). 결과 `/tmp/claude-0/qa/`.
- 단위: `test_save_v2.mjs` · `test_settings_v2.mjs [--node]` · `test_companion_state.mjs` · `test_sfx.mjs [--levels]` · `test_hud_layout.mjs` · `test_mount.mjs` · `test_guardians.mjs` · `tools/accounts/test_api.mjs`·`test_client.mjs`.
- 갤러리 `tools/gallery_{audio,bosses_a,bosses_b,bosses_c,bosses_d,enemies_a,enemies_b,enemies_c,enemies_d,guardians,hero,items,levelsA,mounts,story,town,turntable}.html` (`node tools/smoke.mjs --url tools/gallery_x.html --steps wait:1.5,shot`). 그림 도구 `tools/painted/{poses,fight,bench,rng,pop}.mjs`, `tools/puppet/{review,bench,ingame,shot}.mjs`.
- 성능 예산(MASTER_PLAN §5.2)과 시험 기록 위치는 run_all 결과 문서에 모인다.

## 15. 콘텐츠 ID 목록

### 능력치 키 (`game/stats.js` STAT_INFO)
`hp mp atk mag def res agi luck crit critDmg lifesteal hpRegen mpRegen moveSpd jumpPow airJumps atkSpd expBonus goldBonus dropBonus subDmg skillDmg cdr ultGain heartBonus fire ice holy dark thunder resFire resIce resHoly resDark resThunder dmgReduce reach magnet` (%류는 정수 %)

### 외형(look) 스키마 — `render/hero.js` 가 해석
캐릭터 기본 look ← 직업 look ← 장비 visual 순으로 덮어씀 (`composeLook`). 채색 퍼펫도 같은 look 을 읽는다 (갑옷 색 마스크·무기·망토·날개·후광·오라).
```
build:'slim'|'normal'|'broad'|'huge', height:0.9~1.15, skin, hair, hairStyle:'short'|'long'|'ponytail'|'spiky'|'bob'|'bald'|'braid'|'flowing',
eyes, eyeGlow, beard:null|'stubble'|'full', outfit:'hunter'|'nun'|'gunslinger'|'knight'|'ninja'|'noble'|'villager'|'priest'|'merchant'|'smith'|'innkeeper'|'girl'|'lady',
coat:'long'|'short'|'none'|'robe'|'dress', primary, secondary, trim, pants, boots,
headgear:null|'hood'|'hat'|'wide_hat'|'helm'|'circlet'|'crown'|'horns'|'veil'|'mask'|'tiara', headColor,
cape:null|{color,color2,len,style}, scarf:null|{color,long}, armor:null|'leather'|'chain'|'plate'|'holy'|'dark', armorColor, armorTrim,
wings:null|'bat'|'angel'|'bone'|'demon'|'crow'|'seraph', halo:bool, aura:null|{color,type:'holy'|'fire'|'dark'|'ice'|'blood'|'thunder'}, markings:null|'runes',
weapon:{type:'whip'|'sword'|'greatsword'|'dagger'|'gun'|'staff', style:1~6, color, glow, level(강화), rarity, element, rift?(7단계 광택)}, puppet?:false(벡터 강제)
```
플레이어 애니메이션(`p.anim`): `idle run walk sprint run_start skid pivot land_heavy jump fall flip land crouch dash wall hurt death throw cast charge` + 기수 `ride ride_duck ride_charge ride_rear ride_hurt` + 공격 포즈(`data/movesets.js` 의 anim): `lash lash_up lash_low lash_down spin launch down crouch_lash slash_down slash_up thrust slash_wide spin_blade uppercut plunge crouch_slash heavy_down heavy_up heavy_spin heavy_low stab stab_alt dive_kick crouch_stab shoot shoot_alt shoot_double shoot_up shoot_down crouch_shoot slide_shoot staff_swing staff_swing_up cast_up`.
진행도: `p.move`(현재 공격 데이터), `p.moveT`(경과초; `t = moveT*atkSpeedMul`), 판정 구간 `move.hit=[s,e]`.

### 아이템
- 베이스 `ITEMS[id] = { id, name, slot:'weapon'|'head'|'body'|'cloak'|'acc'|'consumable'|'material'|'key', wtype?, tier(1~7), icon, lvReq, stats:{}, visual:{}, element?, price, stack?, use?, desc, relic?, unique?, chars?, worldHeart?, starShard?, color? }`
- 인스턴스 `{ uid, baseId, slot, icon, rarity(0~5), level(강화 0~15), affixes:[{id,stat,value}], qty }`. 희귀도 0~5: 일반/고급/희귀/영웅/전설/신화.
- 아이콘 ID (Blender 렌더 `assets/icons/<id>.png`, 없으면 절차적): `whip_1~7 sword_1~7 greatsword_1~7 dagger_1~7 gun_1~7 staff_1~7 body_1~7 head_1~7 cloak_1~7 ring_1~7 amulet_1~7 potion_hp potion_mp potion_full elixir antidote meat bread stone_1~6 scroll_protect scroll_bless doc key relic_1~5 sub_dagger sub_axe sub_holywater sub_cross sub_stopwatch sub_pistol sub_bible sub_bomb heart_s heart_l coin moneybag gem_crystal oneup powerup wheart_1~6 star_shard rift_lantern dawnflower`
- 필수 베이스 ID: 시작 무기 `w_whip_1 w_staff_1 w_gun_1 w_greatsword_1 w_dagger_1 w_sword_1`, 방어구 `a_body_1 a_body_2 a_body_3`, `c_potion`, 강화석 `m_stone_1~6`, `m_scroll_protect m_scroll_bless`, 유물 `k_relic_1~5`(relic:true). 2부 목록은 §11.6. 동료는 ITEMS 항목이 없다 (알·계약은 동료 상태).

### 적 로스터 (ID — 이름 — 콘셉트)
공용: `mimic` 미믹(보물상자 위장), `golden_bat` 황금 박쥐(보너스, 도망, 금화)
- s01 불타는 마을: `bat` 흡혈 박쥐, `zombie` 구울(땅에서 솟음), `skeleton` 해골 병사(검), `crow` 시체 까마귀(급강하), `wolf` 굶주린 늑대(돌진), `possessed` 빙의된 주민(쇠스랑)
- s02 안개의 묘지: `ghost` 원혼(벽 통과), `wisp` 도깨비불(탄), `bone_thrower` 뼈 던지는 해골, `gravedigger` 저주받은 무덤지기(삽, 대형), `mud_man` 진흙 인간
- s03 악마성 정문: `armor_knight` 방패 갑옷, `axe_armor` 도끼 갑옷(도끼 투척), `gargoyle` 가고일(비행·화염탄), `medusa_head` 메두사 머리(사인파), `medusa_spawner`(보이지 않는 생성기), `skeleton_archer` 해골 궁수
- s04 대회랑: `blood_skeleton` 피의 해골(부활), `phantom_sword` 유령 검(돌진), `lesser_demon` 하급 악마, `spear_guard` 창병 갑옷, `puppet_maiden` 저주 인형(도약)
- s05 지하 묘지: `bone_pillar` 해골 기둥(화염 포탑), `mummy` 미라, `skeleton_knight` 해골 기사, `corpse_worm` 시체 벌레, `bone_scimitar` 곡도 해골
- s06 대도서관: `book_fiend` 마도서 악령, `flea_man` 벼룩 사내, `skeleton_mage` 해골 마법사, `scholar_ghost` 학자 유령(순간이동), `ectoplasm` 엑토플라즘
- s07 연금술 연구소: `slime` 연금 슬라임, `homunculus` 호문쿨루스, `flesh_golem` 육체 골렘, `plague_doctor` 역병 의사(플라스크 투척), `acid_turret` 산성 증류기
- s08 지하 수로: `merman` 어인, `killer_fish` 살인 물고기, `frog_demon` 마계 개구리, `drowned` 익사체, `water_spirit` 물의 정령
- s09 시계탑: `gear_golem` 톱니 골렘, `harpy` 하피(깃털탄), `clockwork_soldier` 태엽 병사(총), `cog_wheel` 굴러오는 톱니
- s10 얼어붙은 첨탑: `ice_golem` 얼음 골렘, `frost_wraith` 서리 망령, `snow_wolf` 설원 늑대, `frozen_knight` 얼어붙은 기사, `ice_bat` 얼음 박쥐
- s11 피의 예배당: `succubus` 서큐버스, `blood_priest` 피의 사제, `bone_angel` 뼈 천사, `death_knight` 죽음의 기사, `cursed_nun` 저주받은 수녀
- s12 드라큘라의 왕좌: `vampire_bride` 흡혈 신부, `demon_lord` 마족 영주, `bat_swarm` 박쥐 떼, `royal_guard` 근위 갑옷
- s13 심연의 역성: `chaos_spawn` 혼돈의 권속, `hellhound` 지옥견, `abyss_eye` 심연의 눈(광선), `shadow_hunter` 그림자 헌터, `void_demon` 공허의 악마
- s14–s20: §11.3 (24종). 데이터·AI·벡터 파일: 공용+s01–s06 `*_a`, s07–s13 `*_b`, s14–s16 `*_c`, s17–s20 `*_d`. 채색 렌더러는 모두 `render/painted/enemies/<id>.js`.

### 보스 (ID — 스테이지)
`b_nightwing`(s01) 나이트윙 · `b_banshee`(s02) 밴시 여왕 · `b_dullahan`(s03) 둘라한 · `b_crimson`(s04) 진홍의 갑주군주 · `b_bonedragon`(s05) 본 드래곤 · `b_grimoire`(s06) 그리모어 · `b_chimera`(s07) 키메라 호문쿨루스 · `b_leviathan`(s08) 레비아탄 · `b_colossus`(s09) 태엽 거신 · `b_frostqueen`(s10) 서리 여왕 이자벨라 · `b_death`(s11) 사신 데스 · `b_dracula`(s12) 드라큘라 백작 (2페이즈 진정한 모습 `portraits/b_dracula2`) · `b_chaos`(s13) 혼돈의 군주 · 2부 `b_narkissa b_moloch b_dagon b_ziz b_mara b_behemoth b_nihil` (§11.4).
초상화 `portraits/<bossId>` (+ `b_dracula2`, `b_narkissa2`, `b_nihil2`). 클래스: 1부 `bosses/a_*.js`(`ABoss`, `a_common.js`)·`b_*.js`(`BossB`, `b_common.js`), 2부 `c_*.js`/`d_*.js`(BossC, `c_common.js`). 모든 보스에 채색 렌더러 `render/painted/bosses/<id>.js`.

### 숨겨진 비전서(기술 문서) — `data/lore.js` DOCS
벽 'H' 를 부수면 해당 스테이지 `docs` 목록 순서로 등장. `tech` 는 커맨드 기술(`SKILL_IMPL[tech.id]`), `stats` 는 영구 보너스.
| id | 스테이지 | 이름 | 효과 |
|---|---|---|---|
| d01 | s01 | 비전서: 질풍보 | stats {agi:3, moveSpd:5} |
| d02 | s01 | 비전서: 파동참 | tech_hadou ↓↘→+공격 (전방 검기) |
| d03 | s02 | 비전서: 승천격 | tech_shoryu →↓↘+공격 (무적 상승 베기) |
| d04 | s02 | 비전서: 영혼 수확 | stats {lifesteal:1} |
| d05 | s03 | 비전서: 선풍각 | tech_tatsu ↓↙←+공격 (회전 돌진) |
| d06 | s03 | 비전서: 철벽 | stats {def:5, hp:30} |
| d07 | s04 | 비전서: 백보신권 | tech_palm ←→+공격 (원거리 장풍) |
| d08 | s04 | 비전서: 흡마술 | stats {mpRegen:1, mp:20} |
| d09 | s05 | 비전서: 지옥참 | tech_hellslash ↓↓+공격 (지면 분출) |
| d10 | s05 | 비전서: 사자의 가호 | stats {resDark:15} |
| d11 | s06 | 비전서: 천뢰 | tech_thunder ↓↑+공격 (낙뢰) |
| d12 | s06 | 비전서: 현자의 눈 | stats {expBonus:10, luck:5} |
| d13 | s07 | 비전서: 연금 폭쇄 | tech_bomb ←↓→+공격 (폭탄 투척) |
| d14 | s08 | 비전서: 수룡참 | tech_hydro →→+공격 (물의 용 돌진; 두 번째 → 뒤 0.25초 안의 공격만, 늦으면 질주 공격) |
| d15 | s09 | 비전서: 시간 가속 | stats {atkSpd:8, cdr:5} |
| d16 | s09 | 비전서: 환영 분신 | tech_clone ←↙↓↘→+공격 (분신 공격) |
| d17 | s10 | 비전서: 절대영도 | tech_freeze ↑↓+공격 (빙결 폭발) |
| d18 | s11 | 비전서: 성흔 | stats {holy:15, resHoly:10} |
| d19 | s12 | 비전서: 진·그랜드 크로스 | tech_grandcross →↓←↑+공격 (MP 50, 화면 전체 십자 성광) |
| d20 | s13 | 비전서: 혈맥 각성 | stats {atk:10, mag:10, crit:5} |
| d21 | s14 | 비전서: 경영참 | tech_mirror ↓↗+공격 (MP 20, 0.25초 무적 + 등 뒤 거울 분신이 앞뒤 동시 베기) |
| d22 | s15 | 비전서: 불굴의 담금질 | stats {def:12, hp:80, resFire:15} |
| d23 | s16 | 비전서: 와류참 | tech_whirl ↑↑+공격 (MP 25, 소용돌이로 끌어모아 6연타) |
| d24 | s17 | 비전서: 풍신보 | stats {jumpPow:8, moveSpd:5, agi:6} |
| d25 | s18 | 비전서: 몽중살 | stats {crit:6, critDmg:18} |
| d26 | s19 | 비전서: 정화의 불꽃 | tech_purge ↑→+공격 (MP 30, 불기둥 5연타·포자 주머니 태움·부패 −50) |
| d27 | s20 | 비전서: 새벽의 맹세 | stats {atk:15, mag:15, hp:100, ultGain:10} |
커맨드 표기: `['d','df','f','btn:attack']` (f=전방, b=후방; **첫 방향을 넣던 순간의 facing** 기준, MASTER_PLAN §1.21). 모든 기술 검사 `node tools/qa/commands.mjs`.

### 드라큘라의 유물 (진엔딩 조건)
`k_relic_1` 흡혈귀의 송곳니(s03) · `k_relic_2` 드라큘라의 늑골(s05) · `k_relic_3` 검은 심장(s07) · `k_relic_4` 불멸의 눈(s09) · `k_relic_5` 피의 반지(s11). 맵에서 `'@'` + `items:['k_relic_1']` 로 숨겨진 방에 배치. 5개 + 드라큘라 처치 → s13 해금. 유물 5개는 녹티스(mt_giantbat) 합류 조건이기도 하다. 2부 수집품: 별의 조각 `k_star_1…6`(6개 = 2부 진엔딩), 세계의 심장 `k_heart_1…6`.

### NPC
`npc_marta` 마르타(흑묘 여관 주인, 미니게임), `npc_rook` 로크(떠돌이 상인, 상점; 2부 모습 `npc_rook2`), `npc_hadwin` 하드윈(대장장이, 강화), `npc_alberto` 알베르토 신부(성당, 전직/스토리 멘토), `npc_elise` 엘리제(마을 소녀, 구출 퀘스트), `npc_carmilla` 카밀라(수수께끼의 흡혈귀 귀부인, 선택지→엔딩 분기), `npc_greta` 그레타(영혼의 마구간지기, 1장부터). 초상화 `portraits/<id>`. 순서 `NPC_ORDER`. 모두 채색 퍼펫(`assets/puppets/npc/<id>/`).

### 스토리 스크립트 ID 규칙
`<stageId>_intro`(스테이지 시작 전), `<stageId>_t1/_t2`(스테이지 안), `<stageId>_outro`(클리어 후), `<bossId>_pre`(보스 등장 전), `<bossId>_post`(스토리 모드에서 보스가 죽은 뒤), 보스 페이즈 대사(`b_dracula_transform`, `b_narkissa_shatter`, `b_mara_dream`, `b_nihil_form2`, `b_nihil_final`), `prologue`, `p2_prologue`, `ending_bad`, `ending_normal`, `ending_true`, `ending_p2`, `ending_p2true`, `<npcId>_default`, `<npcId>_ch<N>`(N장 클리어 뒤 마을 대사, N ≤ 20), `<npcId>_tip<N>`, `<npcId>_<stageId>`, 퀘스트 `q_<id>_start|_done`, 동료 `cmp_*`.
줄 형식(`data/story.js` 머리말): `{who, text, side?, name?, portrait?}` · `{choice:[…]}` · `{label}`/`{goto}`/`{if}` · 명령 `give gold flag quest unlockChar shake flash music sfx relic cg recruit goto` (대화 `dialogue.js`·컷신 `front/story.js` 모두) + 컷신 전용 `bg wait title`.

### 스토리 CG (Kling 생성, `assets/cg/<id>.webp`)
대사 스크립트에서 `{ cmd:'cg', id:'cg_prologue_moon' }` 로 전체화면 이벤트 CG 표시, `{ cmd:'cg', id:null }` 로 해제.
1부: `cg_prologue_moon`(핏빛 달과 성의 출현) `cg_prologue_attack`(마을 습격) `cg_elise_taken`(엘리제 납치) `cg_alberto_church`(신부가 성물 전달) `cg_castle_gate`(성문 진입) `cg_carmilla_library`(도서관의 카밀라) `cg_elise_rescued`(엘리제 구출) `cg_death_appears`(사신 등장) `cg_dracula_throne`(왕좌의 드라큘라) `cg_dracula_transform`(악마 변신) `cg_castle_collapse`(성 붕괴·여명) `cg_abyss_gate`(심연의 문) `cg_true_ending`(진엔딩·여섯 영웅) `cg_bad_ending`(배드엔딩)
2부: `cg_rift_sky`(하늘의 균열) `cg_rift_gate`(균열문) `cg_rook_reveal`(로크의 정체) `cg_mirror_empress`(거울의 여제) `cg_forge_idol`(용광로의 우상) `cg_sunken_cathedral`(가라앉은 성소) `cg_ziz_storm`(폭풍의 거신조) `cg_mara_cradle`(악몽의 요람) `cg_behemoth_rot`(부패한 짐승) `cg_void_descent`(공허로의 하강) `cg_nihil`(니힐) `cg_p2_ending`(파수꾼의 밤) `cg_p2_true`(새벽의 별)
각성기 컷인 그림: `cutin_kael cutin_sera cutin_victor cutin_bran cutin_lia cutin_azel` (1600×637, 얼굴·눈 기준점은 `data/awaken.js`).

### 음악 트랙 ID (`data/music.js` TRACKS)
`title prologue story sad hub inn shop smith church worldmap s01 … s13 arena boss boss2 dracula chaos victory gameover ending credits minigame` + 2부 `s14 s15 s16 s17 s18 s19 s20 boss3 boss4 nihil worldmap2` (boss3: 나르키사·다곤·마라 / boss4: 몰록·지즈·베헤모스 / nihil: 니힐 / worldmap2: 지도 1쪽). 마구간은 hub, 동료·각성은 새 곡 없음 (각성은 audio.duck).

### 효과음 이름
- 내장 73종: `whip whip_crack slash slash_heavy gun shotgun dagger axe cross holywater_burn stopwatch magic holy fire ice thunder dark hit hit_heavy crit clang enemy_die explode jump double_jump land footstep dash mist splash hurt death heart coin item powerup levelup extra_life chest heal save candle door break_wall secret bell clock_tick thunderclap bat ghost boss_roar boss_die warning ult combo charge_ready enhance_hit enhance_success enhance_fail enhance_destroy dice card slot_spin slot_win win lose coin_insert ready go menu_move menu_ok menu_cancel type` (+ `_default`)
- 체감 45종 (`core/sfx_feel.js`): `step_stone step_dirt step_wood step_metal step_snow step_water step_bone step_flesh step_push skid pivot land_heavy dash_burst launch wall_bounce ground_bounce down_hit counter back_attack hit_flesh hit_bone hit_ghost hit_stone impact_crack kill_slowmo rank_up announce combo_milestone ult_impact impact_frame awaken_hold awaken_charge cutin_whoosh brush_stroke seal_stamp eye_glint awaken_stinger awaken_boom heartbeat crow_caw finger_snap cylinder_spin choir_gate war_horn sheath`
- 동료 31종 (`core/audio_companions.js`): `summon dismiss mount_up neigh gallop hoof_land boar_grunt wolf_howl wolf_bite wing_flap roar_small fire_breath screech bone_rattle fairy_chime knight_guard imp_cackle owl_hoot gear_whir scythe soul_reap egg_crack companion_join bond_up knock_off assist stag_call griffin_cry mirror_chime jelly_zap momo_gulp`
- 이름은 네 묶음 사이에서 겹치지 않는다 (`node tools/test_sfx.mjs`). 2부는 기존 이름만 쓴다.

### 장면(Scene) 이름
- 게임플레이·오버레이 (`scenes/index.js`): `title stage dialogue bossIntro ultCutin document gameover results pause awakenCutin companionJoin` ('title' 만 main.js 가 바로 등록하고, 나머지는 지연 장면으로 뒤에 등록된다 — §3. 그 사이의 자리 장면 이름은 `loading`(game.js `PendingScene`))
- 프런트 (`reg_front.js`): `slots difficulty charselect story options ending credits arcade bossrush survival practice arcadePause arcadeResults highscore initials frontConfirm saveCode account cloudConflict`
- 여관·미니게임 (`reg_games.js`): `inn minigame_dice minigame_blackjack minigame_slot minigame_duel minigame_memory`
- 메뉴 (`reg_menu.js`): `menu` — 탭 `MENU_TABS`: status(상태) equip(장비) inventory(인벤토리) skills(스킬) class(직업) companions(동료) quests(퀘스트) docs(비전서) bestiary(도감) system(기록). `game.push('menu', {tab})`. 스테이지·마을의 'map' 액션 = 인벤토리 탭.
- 마을 (`reg_town.js`): `hub worldmap shop smith church questboard party stable`
- 흐름 파라미터: `story {script, then, thenParams, bg, title, music}`, `hub {from}`(스테이지 id 면 동쪽 성문 앞에서 시작), `worldmap {page}`, `options {page, sub}`, `awakenCutin {…}` (§7.4), `companionJoin {id, source, onDone}`, `ultCutin {charId, world, classId}`, `dialogue {script|npc|lines}` (+onEnd). 계정 기능 전체는 `docs/ACCOUNTS.md`. 장면이 아닌 하위 화면: 옵션의 키 지정·조작 안내, 터치 배치 편집기(DOM).
- 컷인 규칙: 한 번에 하나, `deferToasts`, `hidePad`. 보스 페이즈 대사는 cutscene 이 끝난 뒤 스토리 모드에서 한 번만.

### 이벤트 버스 (`core/events.js` 머리말이 등록부 — 새 이벤트는 거기에 먼저 적는다)
- 기존: `enemyKilled {enemy, def, x, y, byPlayer}` `bossKilled {bossId, stageId, time}` `itemPicked` `itemUsed` `itemBought` `itemSold` `goldPicked` `docFound` `relicFound` `secretFound` `stageCleared {stageId, rank, time, score}` `stageEntered` `roomEntered {stageId, roomId}` `playerHurt {amount}` `playerDied` `levelUp {charId, level}` `classChanged` `enhance` `minigame` `npcTalk` `questOffer` `questDone` `questClaimed {questId, reward}` `combo {count}`
- 플랫폼: `inputDevice {kind, name, glyphs}` · `hitCrit {target}` · `hitHeavy {cls}` · `shake {mag}`
- 손맛: `ultimateCast {charId, tier, classId}`(옛 ultStart 는 쓰지 않음) · `awakenCast {charId, tier, classId}` · `styleRankUp {rank}` · `comboMilestone {n}`
- 2부: `shardFound {id}` · `heartFound {id}`
- 동료: `companionUnlocked {id, source}` · `companionLevelUp {id, level}` · `bondUp {id, rank}` · `mounted {id}` · `dismounted {id, reason}` · `guardianSkill {id, auto}` · `eggObtained {id}` · `eggHatched {id}`
- 계정 (`core/cloud.js`): `cloud:status {state}` `cloud:login {id, resumed}` `cloud:logout {id, reason}` `cloud:sync {phase:'start'|'done', …}` `cloud:conflict {slot}`
- 온라인 (`core/online.js`): `online:flushed {sent:[{board, rank, total, best}], dropped, left}` (기기 대기열의 결과를 보냄)

---

## 부록 A. 이 문서를 쓸 때 아직 진행 중이던 패키지 (2026-09-28) — W4 기준 모두 끝남 (표의 계약은 지금 코드와 대조했다)
| 패키지 | 파일 | 이 문서의 해당 계약 |
|---|---|---|
| CMP-MOUNT-ART-B | `src/render/mounts_b.js`, `painted/companions/mt_direwolf.js`·`mt_wyvern.js`·`mt_giantbat.js`·`mt_gale.js` | §10 그림 (`MOUNT_DRAW_B`, `MOUNT_ICON_B`, 템플릿 wolf·wyvern·bat·griffin) — 지금 코드 기준 |
| CMP-GUARD-ART-B | `src/render/guardians_b.js`, `painted/companions/gd_clock.js`·`gd_reaper.js`·`gd_mirra.js`·`gd_lumen.js`·`gd_momo.js` | §10 그림 (`GUARDIAN_DRAW_B`, `GUARDIAN_ICON_B`, fx*) — 지금 코드 기준 |
| ART-HERO-B | `src/render/hero.js`, `hero_parts.js`, `hero_puppet.js`, `tools/puppet/**`, `assets/puppets/**` | §6 턴테이블·§8 drawHero (`HERO_VIEW`, `heroViewInfo`, `opts.yaw`, `drawHeroTurntable`) — 세부는 바뀔 수 있음 |
| QA-TOOLS | `tools/qa/**` | §14 (run_all, perf_budget, soak, visual_review 등) |
| FEEL-QA | `tools/feel_test.mjs` | §14 |

## 부록 B. 문서 갱신 규칙
- 새 공개 계약(액션·설정 키·세이브 필드·이벤트·장면·ID·명령·검사 명령)을 만든 패키지는 자기 파일 머리말에 적고, 이 문서에는 요청(`requests.jsonl`, owner DOCS-ARCH → W4 FIX-TOOLS)으로 알린다.
- 채색 그림 현황표는 `docs/art/*_PIPELINE.md` 가 원본이다 (보스 현황표 = BOSS_PIPELINE.md 첫 표).
