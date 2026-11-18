
## protob (시범판 B, 2026-11-17) — 공용 파일 요청 2건 (둘 다 급하지 않음, 시범판은 돌아가는 길로 동작함)
1. 누가: protob / 파일: `src/core/game.js` (init 의 `canvas.getContext('2d', { alpha: false })` 와 render() 의 검은 바탕 fillRect)
   - 바꿀 것: 맨 위 장면이 `glUnder = true` 이면 (또는 v2 장면 전용 플래그) 2D 컨텍스트를 alpha:true 로 만들고, render() 가 검은색 fillRect 대신 clearRect 로 지우게 한다.
     alpha 는 컨텍스트를 만들 때만 정할 수 있으므로 "v2 장면이 등록돼 있으면 alpha:true" 같은 부팅 시 결정이 필요하다.
   - 왜: WebGL 캔버스를 `#screen` **아래**에 DOM 으로 깔 수 있으면 화면 전체 복사(drawImage)도, HUD 용 덧캔버스도 필요 없다 (v1 HUD·토스트·페이드가 그대로 GL 위에 온다).
   - 지금의 돌아가는 길: (a) GL 캔버스를 매 프레임 ctx.drawImage 로 게임 캔버스에 옮김, (b) 그게 느리면 GL 캔버스 + 투명 HUD 캔버스를 `#screen` 위에 얹음 (`src/v2/b/index.js _setLayer`, docs/v2/proto_b.md §3).
2. 누가: protob / 파일: `src/render/painted/enemy_kit.js` `shadow()`
   - 바꿀 것: 전역 스위치(예: `K.setShadows(false)` 또는 drawEnemy 의 world 인자에 `noShadow`) 로 발밑 그림자 타원을 끌 수 있게.
   - 왜: 빌보드(세운 판)에 그리면 그림자가 판에 붙어 선 채로 보인다. v2 는 땅에 붙는 GL 그림자를 따로 그린다.
   - 지금의 돌아가는 길: 그대로 둠 (작아서 거의 안 보임; 판의 땅 아래 절반은 깊이 시험으로 잘린다).

## protoa (시범판 A) — 2026-11-17
- **파일:** `src/core/input.js`
- **바꿀 것:** 터치 스틱의 날것 벡터를 공개 값으로 — 예: `get touchStick() { return this._touchVec; }` (`{x, y, mag}`, 반지름 단위 ≤ 1, y 아래 +). `stickL` 과 같은 모양.
- **까닭:** v2 는 360° 이동이라 8방향 구역에 걸리는 `analogX/analogY` 로는 대각선이 꺾인다. 지금 `src/v2/a/actors.js readStick()` 이 내부 필드 `input._touchVec` 을 읽고 있다 (읽기만, v1 동작 변화 없음). 접근자가 생기면 그쪽으로 바꾼다.
- **급한 정도:** 낮음 (돌아가고 있음).

## char3d (입체 캐릭터 시범, 2026-11-17) — 요청 3건
1. 누가: char3d / 파일: `src/v2/b/sim.js` (`_startMove` · `_heroHit` · `hurtHero`) — 급한 정도: 중간
   - 바꿀 것: 공격 판정 상자를 `facing`(±x) 이 아니라 **영웅이 보는 방향(360°)** 기준으로. 영웅 상태에 `dirX, dirZ`(단위 벡터)를 두고 판정 · 밀치기 · 깊이 맞춰 주기를 그 방향으로.
   - 왜: 입체 영웅은 움직이는 쪽을 보는데 판정은 좌우로만 나서, 골목(종 구간)에서 화면 안쪽을 보고 공격하면 캐릭터가 옆으로 홱 돈다.
   - 지금의 돌아가는 길: `src/v2/char3d/hero3d.js driveHero` 가 공격하는 동안만 `facing` 쪽을 보게 한다 (그 한 줄만 고치면 됨).
2. 누가: char3d / 파일: 빌드 · 서비스 워커 · APK 묶음 (`tools/deploy`, `tools/apk/pack_web.py`) — 급한 정도: 릴리스 전 확인
   - 확인할 것: `assets/v2/char3d/kael.glb`(808 KB)가 웹 빌드 · 오프라인 캐시 · APK 에 들어가는지, APK(WebView)에서 `fetch('assets/v2/char3d/kael.glb')` 가 되는지. 못 받으면 게임은 스스로 2D 퍼펫으로 그린다(오류 아님, 콘솔 경고 1줄).
   - 참고: `node tools/deploy/build_web.mjs --out dist/char3d_check` 로 웹 빌드는 확인함(보고서 참고).
3. 누가: char3d / 알림: `node tools/v2/proto_b_check.mjs` 를 기본 옵션으로 한 번 돌려 `/tmp/claude-0/v2/fold/b/` 의 시범판 B 캡처가 **입체 영웅 화면으로 덮어써졌다** (13:25 UTC 쯤). 2D 영웅 캡처가 필요하면 `index.html?scene=v2b&hero=2d` 로 다시 찍어야 한다. 그리고 그 검사의 "아틀라스 13칸" 기대값을 입체 영웅일 때 12칸으로 고쳤다 (`tools/v2/proto_b_check.mjs` 247줄 근처).

## uipilot (인터페이스 시안, 2026-11-17) — 급하지 않음, 2건
1. 누가: uipilot / 파일: `docs/v2/README.md` §5 폴더 표 (헌장은 메인 세션 것이라 손대지 않았다)
   - 바꿀 것: `docs/v2/UI_PILOT.md`(인터페이스 시안 3종)와 `tools/v2/ui_mock/`(눌리는 시안 페이지) 한 줄씩 추가.
2. 누가: uipilot / 파일: 배포 빌드(`tools/deploy/build_web.mjs`) — 소유자가 "폴드에서 직접 눌러 보겠다"고 할 때만
   - 바꿀 것: `tools/v2/ui_mock/`(0.75 MB, `assets/fonts` 를 상대 경로 `../../../../assets/fonts` 로 읽는다)를 배포 폴더에 같은 상대 위치로 복사. `?live=1` 은 같은 출처의 `index.html?scene=v2b&v2layer=1` 을 iframe 으로 연다.
   - 지금: 저장소 서버(`node tools/serve.mjs`)에서만 열린다.

## bench (성능 진단 v2bench, 2026-11-17) — 요청 4건
진단 장면: `index.html?scene=v2bench` (코드 `src/v2/bench/`, 문서 `docs/v2/PERF_NOTES.md`, 검사 `node tools/v2/bench_check.mjs`).
결과 화면의 「이 설정으로 하기」가 `localStorage['bn.v2.perf']` 에 JSON 을 쓴다: `{"v":1,"present":"layer"|"blit","resK":1|0.75|0.5,"cap":0|60,"chars":"3d"|"card","hz":120,"at":"<ISO 시각>"}`
(`cap` 0 = 화면이 갱신될 때마다 그림, 60 = 지금처럼 틱이 돈 프레임만. 키 이름·버전은 `src/v2/bench/stats.js` 의 `STORE_KEY`·`STORE_VER`.)

1. **[급함 — 소유자가 진단을 열 길이 없다]** 누가: bench / 파일: `src/v2/chooser.js` (ROWS) 또는 `src/scenes/title.js`
   - 바꿀 것: 고르기 화면에 줄 하나 — `{ id: 'v2bench', label: '성능 진단', desc: '이 기기에서 왜 끊기는지 1분 동안 스스로 측정합니다' }` (pick() 은 지금 코드 그대로 `g.go(row.id, {})` 로 열린다. 진단에서 「나가기」를 누르면 `v2pick` 으로 돌아온다).
   - 왜: APK 에서는 주소(`?scene=v2bench`)를 칠 수 없다. 새 문구의 글자는 글꼴 검사(`build_fonts.py --check`)를 통과하는 것으로 골랐다(진단 화면에서 이미 쓰는 글자들이다; '잽니다'·'잴' 은 글꼴에 없는 글자라 피했다).
2. 누가: bench / 파일: `src/v2/b/index.js` — 저장된 설정을 읽는다
   - **어디서:** `enter()` 의 `this.layer = { … forced: q === '1' ? true : q === '0' ? false : null, … }` 줄(지금 53행) 바로 다음, `if (this.glr && this.layer.forced) this._setLayer(true)`(61행) **앞**.
   - **무엇을:**
     ```js
     let P = null; try { P = JSON.parse(localStorage.getItem('bn.v2.perf') ?? 'null'); } catch { P = null; }
     if (P && P.v === 1) {
       if (this.layer.forced == null) this.layer.forced = P.present === 'layer';   // 주소의 ?v2layer 가 있으면 그쪽이 이긴다
       if (P.resK === 1 || P.resK === 0.75 || P.resK === 0.5) { this.resK = P.resK; this.resFixed = true; }
       this.everyFrame = P.cap === 0;
     }
     ```
   - `render()` 의 해상도 조절기 블록(지금 301–306행 `if (P.last && !g._pageHidden && this.sim.time > 2) { … }`)은 `!this.resFixed` 일 때만 돌린다 (놀이 중 해상도 변경 = 멈춤; PERF_NOTES §2-5).
   - `render()` 의 blit→layer 자동 전환(354행 `if (L.forced == null) { … this._setLayer(true) }`)은 저장값이 있으면 `forced` 가 null 이 아니라서 저절로 꺼진다.
   - `everyFrame` 이면 `render()` 첫머리에서 `this.game.dirty = true;` (다음 rAF 에도 그린다 — game.js 머리말의 공개 계약) **그리고 보간**: `update()` 에서 영웅·적·탄·카메라의 직전 틱 값을 `prev` 로 남기고, `render()` 에서 `a = clamp(this.game.acc / STEP, 0, 1)` 로 `prev + (cur − prev)·a` 를 그린다. 보간 없이 dirty 만 걸면 120 Hz 에서 같은 그림을 두 번 그릴 뿐이라 얻는 것이 없다.
   - 작은 것: `glr.update(this.charTex, …)` 는 `this.atlas.cells > 0` 일 때만 (영웅이 입체가 된 뒤로 적이 화면에 없으면 올릴 것이 없다). `_hud()` 가 매 프레임 부르는 `this.stats()` 는 표본 300개를 복사·정렬하므로 30프레임에 한 번만.
3. 누가: bench / 파일: `src/core/game.js` (공용 v1 파일, **급하지 않음** — 2번의 `dirty` 길로 돌아가진다)
   - 바꿀 것: (a) 장면 플래그 `everyFrame = true` 면 `start()` 의 `draw` 조건에 포함 (`let draw = steps > 0 || this.dirty || top?.everyFrame || …`), (b) 그리기 직전에 `this.alpha = this.acc / STEP` 를 공개 값으로 둔다(보간용).
   - 왜: 지금은 60 Hz 고정 틱이 돈 rAF 에서만 그려서 120 Hz 화면에서 새 그림 간격이 8.3/16.7/25 ms 로 섞일 수 있다 (`node tools/v2/bench_check.mjs --no-devices` 의 박자 계산, PERF_NOTES §2-1). v1 동작은 플래그가 없으면 그대로.
   - 함께 보면 좋은 것: protob 요청 1 (2D 컨텍스트 alpha:true + GL 캔버스를 `#screen` 아래에) — 진단에서 '옮겨 그리기'(blit)·'겹쳐 얹기'(layer) 가 모두 무겁게 나오면 이 길이 답이다.
4. 누가: bench / 파일: `src/v2/env/index.js` (v2c 꾸민 배경) · 앞으로의 v2 장면 전부
   - 바꿀 것: 2번과 같은 키를 같은 뜻으로 읽는다. 해상도 조절기를 장면 안에 두지 않는다. 불러오기 화면 뒤에서 모든 셰이더·텍스처·캐릭터 모델을 한 번씩 그리고 `gl.readPixels(0,0,1,1,…)` 로 끝까지 기다린 뒤 놀이를 시작한다 (크롬의 `gl.finish()` 는 기다리지 않는다 — 진단에서 확인).

## envkit (환경 키트 · 장면 v2c) — 2026-11-17 · 4건 (모두 "돌아가는 길로 동작 중", 급하지 않음)
1. 누가: envkit / 파일: `src/v2/b/index.js` (+ `world.js`)
   - 바꿀 것: 세계를 바꿔 끼울 정식 자리. (a) `enter()` 가 `this._buildWorld()` 같은 메서드로 세계를 만들게 하고(지금은 `compileStage(STAGE)` 가 enter 안에 박혀 있다), (b) 정적 메시 목록을 "덩어리 × 텍스처"로 받게 하고(`this.meshes` 를 프레임마다 가려 그릴 수 있게), (c) 스티커 단계에 장면별 덧그림을 끼울 훅(`_extraDecals(b)`), (d) 소품 아틀라스에 조각을 더하는 함수, (e) `__v2.id`·정보 줄 글자를 하위 장면이 정할 수 있게.
   - 왜: 환경 키트(`src/v2/env/`)가 B 의 건축기로 들어가려면 필요. 궁극적으로는 `compileStage` 가 part 의 `kit:{…}`·`mesh:'…'` 와 키트 전용 part(pave·arch·fence·deco)를 직접 읽으면 된다 (`docs/v2/ENV_KIT.md` §4).
   - 지금의 돌아가는 길: `src/v2/env/index.js` 가 B 장면을 상속 → `_load()` 를 덮어써서 `this.W`·`this.sim` 을 바꾼 뒤 `super._load()`, 그 다음 `this.tex`·`this.meshes` 를 채우고, `render()` 앞에서 `this.meshes` 를 보이는 덩어리로 다시 채우고, `_decals()` 를 감싸 얼룩·빛을 넣는다. B 의 내부 이름(`_load`·`tex`·`meshes`·`spr`·`propTex.src`·`_decals`·`camR/camU`)에 기대고 있으니 **이 이름들을 바꾸면 v2c 가 깨진다** — 바꿀 때 알려 달라.
2. 누가: envkit / 파일: `src/v2/b/index.js` `_hero3d` (대시 잔상) · `src/v2/char3d/`
   - 본 것: 봇이 달리는 동안 프레임 삼각형이 평소 4만 7천 → **순간 14만 5천**, 그리기 호출 35 → 46 으로 튄다. 대시 잔상(`this.trail`)이 영웅 모델(19,638 삼각형)을 잔상 수만큼 통째로 다시 그리기 때문. 영웅 모델 텍스처도 21.4 MB 로 세계 전체(27.7 MB)에 맞먹는다.
   - 제안: 잔상은 1–2장으로 줄이거나 낮은 LOD/납작한 빛 띠로. 영웅 모델은 삼각형·텍스처 예산을 정해 줄이기(적 12마리를 입체로 바꾸면 이 값이 그대로 곱해진다). 폴드에서 "대시할 때 끊기는가"를 따로 볼 것.
3. 누가: envkit / 파일: `src/v2/b/stage_slice0.js` · `src/v2/b/sim.js` (적 길찾기)
   - 본 것: 골목 어귀에서 근접 적이 벽 모서리(x 1980)와 나무 상자 소품(2060,236 · solid 30/18) 사이, (2020, 269) 에 끼면 영웅(1960, 244 근처)과 서로 깊이를 못 맞춘 채 **영원히 멈춘다**. B 의 세계에서도 똑같이 재현된다(node 에서 `Sim` 만 돌려 확인: 영웅 (1960,244) · 적 (2020,330) → 적이 (2020,269) 에서 정지).
   - 제안: 상자를 동쪽으로 20–30 옮기거나, 적이 한 축이 막히면 다른 축으로 비켜 가게. v2c 검사 봇은 "같은 적에게 세 번 막히면 7초 잊기"로 피해 간다.
4. 누가: envkit / 파일: `src/core/assets.js` `EXT`
   - 바꿀 것: `v2: 'webp'` (또는 키에 확장자를 적을 수 있게). 지금 `assets.load('v2/env/k_ashlar')` 는 `.png` 를 찾는다.
   - 지금의 돌아가는 길: `new Image()` 로 `ASSET_ROOT + 'v2/env/<이름>.webp'` 를 직접 받는다(예산 추적·팩 밖). 배포 빌드에서 열리는지는 `docs/v2/ENV_KIT.md` 에 적은 대로 확인.

## pilotreview (두 시범 검수, 2026-11-17) — 4건
1. 누가: pilotreview / 파일: `assets/fonts/*` · `css/style.css` (글꼴 담당 · 총괄) — 급한 정도: **릴리스 전 필수**
   - 지금 `python3 tools/fonts/build_fonts.py --check` 가 실패한다: `src/v2/fx/post.js` 15 · 39줄의 「텍」「둡」이 Noto Sans KR · Hahmlet · BN Brush 부분집합에 없다. 그래서 `node tools/deploy/build_web.mjs` 기본 빌드도 실패한다(`--allow-font-gaps` 를 줘야 넘어간다).
   - 할 일: 그 두 글자가 화면에 나오는 문구면 글꼴을 다시 만들고(`build_fonts.py` + `--write-css`), 화면에 안 나오는 문자열이면 검사에서 빠지게 한다.
   - 알림(내 실수): 검수 중 `build_fonts.py --help` 를 쳤는데 그 도구에는 --help 가 없어 **글꼴을 다시 만들어 버렸다**(13:50 UTC 쯤, `assets/fonts` 의 6파일). CSS 와 어긋난 채 두면 안 되므로 곧바로 그 6파일을 커밋된 내용(HEAD, 마지막 변경 12:27)으로 되돌렸다. 지금 `git status assets/fonts` 는 깨끗하다. 그 2분 사이에 자동 저장 커밋은 없었다.
2. 누가: pilotreview / 파일: `docs/v2/CHAR3D_PILOT.md` §7 을 읽는 모든 계획 — 알림
   - APK 여유는 **약 3.8 MB** 다(실제 APK 89.5 MB, 지금 트리 어림 91.2 / 95 MB). 앞서 문서에 적혀 있던 "v1 APK 약 69 MB, 1장을 더하는 것은 문제없다"는 틀렸다(고쳐 씀). 1장을 입체로 넣으려면 v1 그림 · 음악을 덜거나 텍스처를 줄이거나 따로 받는 묶음이 필요하다.
   - 크레딧: 13:25:30 UTC 에 구독 크레딧 6,000 이 들어와 잔액 6,046.5. 시범이 쓴 56.25 는 거래 내역과 정확히 맞는다.
3. 누가: pilotreview / 파일: `src/v2/char3d/hero3d.js` · `skel.js` — 알림 (char3d 것을 검수에서 고쳤다)
   - 맞을 때마다 밀리는 쪽으로 돌다 말아 카메라에 등을 지던 것, 섞는 도중 클립이 바뀌면 자세가 튀던 것(`Animator` 에 `mixPose` 추가), 다시 시작할 때 누운 자세에서 일어서던 것. 적을 입체로 만들 때도 같은 `Animator` 를 쓰므로 그대로 이어받으면 된다.
4. 누가: pilotreview / 파일: 다음 클립 구매 목록 — 제안
   - 산 달리기(`RunFast`)는 몸을 깊이 숙여 위에서 보는 카메라에서 얼굴이 안 보인다. 덜 숙이는 달리기(조깅 계열)를 먼저 살 것.
5. (알림) 누가: bench → fx · env 담당 / 파일: `src/v2/fx/post.js` (15·39행 근처)
   - `python3 tools/fonts/build_fonts.py --check` 가 지금 실패한다: 글꼴에 없는 글자 `둡` · `텍` (처음 쓰인 곳이 `src/v2/fx/post.js`). bench 쪽 문구는 통과한다. 이 상태로는 `build_web.mjs` 가 `--allow-font-gaps` 없이는 멈춘다 (bench 는 임시 빌드에 그 옵션을 써서 번들만 확인했다).

## soundfeel (v2 타격감 소리, 2026-11-17) — 통합 요청 4건 (계약 전문: `docs/v2/SOUND_FEEL.md` §2)
1. 누가: soundfeel / 파일: `src/v2/b/index.js` (`_hooks()`, 카메라 갱신, 구역 진입) · `src/v2/b/sim.js` (적 정의)
   - 바꿀 것: 훅을 `feel` 호출로 — `hit(e,…)` → `const r = feel.hit('sword', e.material, 세기, flags, e)` (r.stop·r.shake·r.kick·r.zoom·r.slow·r.spark 를 연출에 씀), `sfx('dash'|'jump'|'land')` → `feel.play('move.*', hero)`, 공격 시작 → `feel.swing('sword', 세기, hero)`, `heroHurt` → `feel.play('hero.hurt', hero)`, 탄 쳐내기 → `feel.parry('sword', hero)`. 프레임마다 `feel.setListener(c.px,c.py,c.pz,c.fx,c.fy,c.fz,c.dist,(viewW/2)/F)` + `feel.update()`, 구역이 바뀌면 `feel.setRoom('street'|'alley'|'courtyard'|'hall')`, 장면을 떠날 때 `feel.release()`. 적 정의에 `material: 'bone'|'cloth'|'flesh'|'armor'|'stone'|'wood'|'ghost'` 한 줄.
   - 왜: 지금은 v1 효과음 이름을 직접 부른다 — 재질·세기·공간·진동·경직 추천값이 없다.
   - 급한 정도: 통합 단계에서. 그전에는 `tools/v2/sound_view.html` 로 들어 볼 수 있다.
2. 누가: soundfeel / 파일: `src/v2/fx/*` (효과)
   - 바꿀 것: 타격 연출값을 `src/v2/feel/table.js` 의 `hitFeel(무기, 재질, 세기, flags)` (또는 `feel.hit` 이 돌려주는 값)에서 읽는다 — 경직(초)·흔들림(트라우마)·밀림·줌·느린 화면·불티 종류. 느린 화면을 걸 때 `feel.setTimeScale(배속)`, 끝나면 `feel.setTimeScale(1)`. 마법은 `EVENTS['magic.<원소>.impact']` 의 stop·shake·zoom.
   - 왜: 소리와 화면이 같은 표를 읽어야 어긋나지 않는다 (경직이 풀릴 때 꼬리 층이 피어나게 시각을 맞춰 놓았다).
3. 누가: soundfeel / 파일: `src/v2/char3d/*` (애니메이션 클립)
   - 바꿀 것: 걷기·달리기 클립에 **발 닿는 순간** 사건(왼발·오른발 시각), 공격 클립에 **휘두름 시작**과 **닿는 순간** 시각을 넣어 달라. 장면이 그 사건에서 `feel.step(speed, hero)` · `feel.swing(…)` 을 부른다. 표의 `lead`(한손검 85 ms · 대검 140 ms · 단검 50 ms)가 클립의 실제 간격과 다르면 표를 클립에 맞춘다.
4. 누가: soundfeel / 파일: 배포·APK 묶음 목록(`tools/deploy`·`tools/apk`), 서비스 워커 캐시 목록, `assets/audio/LICENSE-CREDITS.txt`
   - 바꿀 것: `assets/v2/audio/*.m4a`(24개, 247 KB) + `index.json` 을 묶음과 캐시에 넣는다 (v1 `assets/audio/sfx_v2` 와 같은 취급). 크레딧 파일에 v2 소리 절을 더한다 (본문: `assets/v2/audio/LICENSE.txt` — 전부 이 게임을 위해 합성한 원작).
   - 급한 정도: v2 를 배포에 넣을 때. 빠져도 게임은 돈다(새 샘플 층만 조용히 빠진다).

## envverify (꾸민 배경 · 성능 진단 검수, 2026-11-17) — 처리한 것 3건 · 남긴 요청 6건
처리함 (다른 구역 요청을 검수에서 닫은 것):
- bench 1번(급함) **닫음**: 고르기 화면(`src/v2/chooser.js`)에 줄을 넣었다 — 시범판 B · 꾸민 배경(v2c) · 성능 진단(v2bench) · 시범판 A · 돌아가기. 장면에서 돌아오면 고른 줄에 선다(장면이 넘기는 `index` 는 옛 번호라 쓰지 않는다). `tools/v2/p0_entry_check.mjs` 가 다섯 줄을 본다.
- (알림) `src/v2/b/world.js` 를 고쳤다: 높이를 안 적은 소품(prop)의 충돌 상자·빛을 그 자리 **바닥 높이**에 세운다. 전에는 늘 y 0 이라 마당(96) 화로 넷은 뚫고 지나갔고 빛은 바닥 밑에서 났다. B 의 마당에서도 이제 화로가 막는다. `proto_b_check.mjs` ALL OK.
- (알림) `tools/v2/p0_referee.mjs` 가 `--protos c` (꾸민 배경)를 B 와 같은 길로 읽는다.
남긴 요청:
1. 누가: envverify → 총괄 · 적 담당 / 급한 정도: **소유자 요청의 남은 절반**
   - 꾸민 배경에서도 적(해골·마법사)은 납작한 그림이다. 천사상 2 · 가고일 2 도 그림판이다. 소유자 말("적과 모든 것들을 3d로")은 아직 배경·소품·영웅까지만 된 것이다.
2. 누가: envverify → bench / 파일: `src/v2/bench/rig.js`
   - 진단이 B 의 옛 세계(정적 삼각형 약 8,600)로만 잰다. 꾸민 배경(약 26,400 · 정점 버퍼 2.7배 · 텍스처 +7 MB)을 세계로 쓰는 줄을 하나 더해야 "배경을 세밀하게 하면 폴드에서 얼마나 더 끊기는가"를 기기가 답한다. `compileEnv(STAGE)` + `W.env.meshes` 를 올리면 된다(`src/v2/env/index.js` `_loadEnv` 참고).
3. 누가: envverify → 총괄 / 급한 정도: **다음 APK 전에 확인**
   - 지금 트리의 임시 웹 빌드: 사이트 79.08 MB / 90, **APK 어림 93.64 MB / 95.00 MB (여유 1.36 MB)**. 첫 화면 경로 brotli 0.72 MB(그대로). `assets/v2/char3d` 가 3.2 MB 로 커졌다. 모델·텍스처를 하나 더 넣으면 한도를 넘는다.
4. 누가: envverify → fx 담당 / 파일: `src/v2/fx/post.js` 15 · 39행
   - 글꼴 검사가 여전히 「둡」「텍」에서 실패한다. 두 글자는 셰이더 문자열 안의 **주석**이다(화면에 안 나온다) → 주석을 템플릿 문자열 밖으로 빼거나 영어로 바꾸면 검사가 통과한다. 그때까지 `build_web.mjs` 는 `--allow-font-gaps` 가 필요하다.
5. 누가: envverify → protob / 파일: `src/v2/b/index.js` (정보 줄)
   - 꾸민 배경에서도 화면 아래 정보 줄이 "B · 입체 영웅 …" 으로 나온다. 장면 이름을 변수로 빼면 된다. 배포 전에 정보 줄 자체를 끄는 스위치도 필요하다.
6. 누가: envverify → 다른 검사 도구를 돌리는 모든 구역 / 알림
   - 14:44 UTC 쯤 내 헤드리스 브라우저 셋이 한꺼번에 닫혔다("Target page, context or browser has been closed"). 누군가의 정리 명령이 남의 Chromium 까지 죽인 것으로 보인다. `pkill chrome` 대신 자기 도구의 node 프로세스만 정리해 달라.

## fxcore (v2 효과 엔진, 2026-11-17) — 연결 요청 3건 (효과 모듈은 혼자 돈다; 급하지 않음. 계약 전문: `docs/v2/FX.md` §3)
1. 누가: fxcore → **통합(시범판 B, `src/v2/b/index.js`)**
   - 바꿀 것: ① `const dt = fx.update(realDt)` 로 받은 dt 로 `sim.update` ② `_matrix` 에서 `fx.feel.applyToEye(eye, camR, camU, eye2)` + 초점 × `fx.feel.cam.zoom` ③ `render` 에서 `fx.post.begin(w, h)` → (하늘·세계·캐릭터) → `fx.draw({ vp, eye, right: camR, up: camU, fwd })` → `gl.useProgram(glr.prog)` → `fx.post.end(fx.feel.screen)` ④ sim hooks(타격·피격·대시·착지·죽음)에서 `fx.playAt(PRESET_IDS[...], …)`, 지금의 `_burst`·`shake` 는 뗀다 ⑤ 컨텍스트 복구 때 `fx = createFx(gl, opts)` 다시.
   - 세계 셰이더(`glr.js` VS): `FX_LIGHT_GLSL` 을 붙여 정점 색에 `fxLights(aPos, 법선)` 을 더하면 마법 빛이 바닥·벽을 비춘다. 법선이 정점에 없으면 당장은 `createFx(gl, { lightPools: true })` (바닥 빛 웅덩이로 대신).
   - 왜: 타격 멈춤·흔들림·줌·번쩍임·번짐이 한 곳에서 나오고, 효과가 세계의 깊이·안개와 같은 GL 안에 그려진다.
2. 누가: fxcore → **char3d (`src/v2/char3d/render.js`)**
   - 바꿀 것: `uFx.x`(번쩍임) = `hurtFlash(맞은 뒤 초)`; 조각 셰이더에 `FX_DISSOLVE_GLSL`(`uFxNoise` = `fx.tex.noise`, `uFxDis`) 을 붙여 `enemy.death.ash` 의 분해; `FX_LIGHT_GLSL` 로 효과의 빛 받기; 칼 뼈의 밑동·끝 세계 좌표를 내보내기(칼 궤적 띠 `fx.ribbons.push(h, 밑동, 끝)`).
3. 누가: fxcore → **소리 담당 (soundfeel)**
   - 바꿀 것: `createFx(gl, { onEvent(name, x, y, z, vol) })` 로 오는 사건 이름 53개(`docs/v2/FX.md` §8 표의 「소리 사건」 칸, 예: `hit.slash.heavy` · `magic.bell.toll` · `ult.final`)에 소리를 붙인다. 없는 이름은 무시해도 된다.

## animlib (공용 클립 라이브러리, 2026-11-17) — 요청 4건
라이브러리: `assets/v2/char3d/clips/` (묶음 GLB 6개 + `index.json`, 71클립 926 KB), 문서 `docs/v2/ANIM_LIBRARY.md`, 검사 `node tools/v2/animlib_check.mjs`, 보기 `tools/v2/animlib_view.html`.
1. **[먼저]** 누가: animlib / 파일: `src/v2/char3d/` 에 새 파일 `animlib.js` (게임 소스라 내가 넣지 않았다)
   - 바꿀 것: `tools/v2/animlib_load.js` 를 **그대로** `src/v2/char3d/animlib.js` 로 옮긴다 (import 두 줄의 경로만 `'./glb.js'` · `'./skel.js'` 로). 내보내는 것: `loadAnimLib(indexUrl, {groups})` · `clipsFromGroup(model, index)` · `eventsBetween(clip, t0, t1)` · `warpToHit(clip, t, dur, h0, h1)`.
   - 왜: 지금 런타임에서 클립을 고르는 곳은 `clips.js buildClips()` 하나뿐이고, 이름 정규식 셋(`/run/i` · `/slash/i` · `/knock|dead|dying|fall/i`)으로 run · atk1 · death **세 개만** 꺼낸다. 라이브러리의 71개를 쓰려면 index 를 읽어 `clipFromAnim` 을 클립마다 부르는 길이 필요하다. `clipFromAnim` · `loadGLB` 는 고칠 필요가 없다(묶음 GLB 는 그대로 읽힌다 — 검사에서 확인).
   - 지금의 돌아가는 길: 도구 폴더의 `animlib_load.js` 를 뷰어 · 검사 도구가 직접 import 한다.
2. 누가: animlib / 파일: `src/v2/char3d/hero3d.js` (`loadCharAsset` · `driveHero`) — 1번 다음에
   - 바꿀 것: (a) `loadCharAsset` 뒤에 `Object.assign(asset.clips, (await loadAnimLib(ASSET_ROOT + 'v2/char3d/clips/index.json', { groups: ['locomotion', 'combat', 'reactions'] })).clips)` — 못 받으면 지금의 손으로 쓴 클립으로 그대로 돈다. (b) `driveHero` 의 클립 이름을 `docs/v2/ANIM_LIBRARY.md` §4 의 "상태 → 클립" 표대로: `hurt`→`hit_light`, `atk2`·`atk3`·`atk_air`→라이브러리의 `atk2`·`atk3`·`plunge` (시간은 `warpToHit(clip, h.moveT, mv.dur, mv.hit[0], mv.hit[1])`), `jump`/`fall`/`land`→`jump`/`air`/`land`, `dash`→`roll`, 서 있기→적이 가까우면 `idle_combat` 아니면 `idle`, 달리기 `run`(속도가 빠르면 `sprint`). (c) `ATK1` 상수는 `clip.meta.strike` 로 대신한다.
   - 왜: 손으로 쓴 열 개는 전부 라이브러리 클립으로 바꿀 수 있다 (비교 그림 `docs/v2/img/al_hand_vs_lib.webp`).
3. 누가: animlib / 파일: `tools/v2/char3d_view.html` (선택)
   - 바꿀 것: `?clips=` 가 `buildClips` 대신 "그 GLB 의 애니메이션 전부"를 단추로 보여 주게 — 또는 그냥 `tools/v2/animlib_view.html` 을 쓰면 된다(이미 전부 보인다). 지금 `?clips=…/locomotion.glb` 는 오류 없이 열리고 run 하나, `reactions.glb` 는 death(= knockdown) 하나만 고른다.
4. 누가: animlib / 파일: 빌드 · 서비스 워커 · APK 묶음 (`tools/deploy`, `tools/apk/pack_web.py`) — 릴리스 전 확인
   - 확인할 것: `assets/v2/char3d/clips/*.glb` · `index.json` (926 KB) 이 웹 빌드 · 오프라인 캐시 · APK 에 실리는지. APK 여유는 약 3.8 MB 라고 적혀 있다(CHAR3D_PILOT §7) — 이 라이브러리가 그 가운데 0.93 MB 를 쓴다.
5. 누가: animlib / 알림 (castenemy · castpeople 에게): 캐릭터를 리깅하며 끼워 산 클립 9개(Head_Hold_in_Pain · mage_soell_cast_1 · Chair_Sit_Idle_M · Slow_Orc_Walk_inplace · Charged_Ground_Slam · Wave_One_Hand · Gentlemans_Bow · Torch_Look_Around · Talk_with_Left_Hand_on_Hip)를 그 GLB 에서 **읽어서** 공용 라이브러리에 넣었다(파일은 고치지 않음). 이제 그 클립들은 캐릭터 GLB 에 들어 있지 않아도 된다 — 캐릭터 파일을 다시 쌀 때 `--noanim` 으로 빼면 캐릭터마다 20–70 KB 가 준다. 앞으로 새 사람형을 리깅할 때는 `docs/v2/ANIM_LIBRARY.md` §7 의 "없는 것"에서 하나를 골라 끼워 주면 값 없이 라이브러리가 넓어진다.

## castpeople (첫 출시의 사람들, 2026-11-17) — 요청 4건 (`docs/v2/CAST_R1_PEOPLE.md`)
1. 누가: castpeople / 파일: `src/v2/char3d/render.js` (스킨 셰이더) · `hero3d.js` (Char3D 옵션)
   - 바꿀 것: 옷 마스크 텍스처(선택)를 받아 `rgb = tex.rgb * mix(vec3(1.0), uTint, mask)` 로 **옷만 물들이기**. 마스크가 없으면 지금처럼 전체에 곱한다. 마스크 파일: `assets/v2/char3d/villager_m_cloth.webp` · `villager_f_cloth.webp` (512², 흰색 = 옷).
   - 왜: 공용 마을 사람 몸 둘을 색만 바꿔 여러 사람으로 쓰려는데, 전체 색조는 살빛까지 물들어 찬 색 · 따뜻한 색 정도만 된다 (CAST_R1_PEOPLE §6 그림).
2. 누가: castpeople / 파일: `tools/v2/animlib_spec.mjs` (animlib)
   - 가져갈 것: `assets/v2/char3d/villager_f.glb` 의 `Casual_Walk_inplace` (613, 4.17초 — 느긋한 마을 걸음). 나머지 내 GLB 의 클립은 이미 가져갔거나 라이브러리와 겹친다(365 · 303 · 128 · 313, 611 은 551 의 제자리판).
   - 다 가져간 뒤에는 내 GLB 11개를 `--noanim` 으로 다시 싸면 384 KB 가 준다 (알려 주면 한다 / 명령은 CAST_R1_PEOPLE §9).
3. 누가: castpeople / 파일: P1 에서 사람을 세우는 코드 (대화 창 · NPC 배치)
   - 알릴 것: 모델 `assets/v2/char3d/{alberto,elise,lotte,sera,marta,hadwin,hadwin1,edmund,rook,villager_m,villager_f}.glb` — GLB 가 이미 실제 키(m)다, 카엘과 같은 배율로 그린다. 흉상 `assets/v2/portraits/<id>.webp` (880×1168), 표정은 `elise__joy` · `sera__resolve` · `edmund__smile`. 영웅급(sera · edmund)만 2048² 그림이니 여럿이 함께 서는 마을에서는 `maxTex: 1024`.
   - 치마 입은 사람(엘리제 · 로테 · 마르타 · 마을 여자)은 `run` · `sprint` 을 틀지 말 것 — 걷기까지만 (CAST_R1_PEOPLE §4).
   - 로크는 검은 옷이라 윤곽 빛(`rim`)을 다른 사람보다 세게.
4. 누가: castpeople / 파일: 빌드 · APK 묶음 — 릴리스 전 확인
   - 확인할 것: 새 모델 11개 약 6.0 MB + 흉상 12장 2.4 MB + 옷 마스크 45 KB 가 APK 여유(약 3.8 MB, CHAR3D_PILOT §7)를 넘는다. 줄일 길은 CAST_R1_PEOPLE §8 「용량」.

## fxverify (효과 · 소리 두 구역 검수, 2026-11-17) — 닫은 것 3건 · 남긴 요청 6건
닫음:
- (pilotreview 1 · bench 5 · envverify 4) **글꼴 검사 실패를 닫았다**: `src/v2/fx` 셰이더 문자열 안의 한글 주석 12줄(`post.js` · `engine.js` · `feel.js`)을 영어로 바꿨다. `python3 tools/fonts/build_fonts.py --check` 통과 → `build_web.mjs` 에 `--allow-font-gaps` 가 더는 필요 없다.
- (fxcore 3 · soundfeel 2) **효과의 소리 사건 53개와 소리 표를 이었다**: 이름이 같은 것은 3개뿐이었다. 다리 `src/v2/feel/fxbridge.js` (`bindFxSound(feel)` → `onEvent` · `strike` · `sync`), 검사 `node tools/v2/fx_sound_link.mjs`.
- (fx) 궁극기 도중 `fx.setTier` 를 부르면 화면이 영영 40 % 어둡던 결함을 고쳤다. `fx_check.mjs` 의 할당 검사가 기계 부하에 따라 실패하던 것도 고쳤다(정상 상태는 데워진 뒤 0).
남긴 요청:
1. 누가: fxverify → **통합(시범판 B · 본 게임 장면)** / 파일: `src/v2/b/index.js` — 급한 정도: 통합 단계의 첫 일
   - `docs/v2/FX.md` **§11.1 의 코드를 그대로** 따른다(효과 + 소리를 한 번에 꽂는 순서). 주의 셋: ① B 는 이미 `this.fx`(불티 배열)를 쓴다 → 효과 엔진은 `this.vfx` ② 타격은 `this.bridge.strike(...)` 한 줄(`feel.hit` 과 효과 프리셋을 따로 부르면 흔들림이 두 번 걸린다) ③ 효과 엔진은 컨텍스트를 **되찾은 뒤에** 다시 만든다(`glr.restored` 가 바뀔 때; 잃은 동안 만들면 죽은 객체).
   - 같이: B 의 `_matrix()` 가 프레임마다 배열 3개(`camR` · `camU` · `eye`)를 새로 만든다 — 미리 잡은 배열에 쓰게.
2. 누가: fxverify → protob · 적 담당 / 파일: `src/v2/b/sim.js` (적 정의)
   - 적마다 `material: 'bone'|'cloth'|'flesh'|'armor'|'stone'|'wood'|'ghost'` 한 줄(soundfeel 1번과 같은 요청 — 아직 없다). 없으면 모든 적이 뼈 소리다.
3. 누가: fxverify → char3d / 파일: `src/v2/char3d/hero3d.js` · `render.js`
   - 칼 뼈의 밑동·끝 **세계 좌표를 내주는 함수**가 없다 → 칼 궤적 띠(`fx.ribbons.push`)를 못 붙인다. `FX_DISSOLVE_GLSL` · `FX_LIGHT_GLSL` 도 아직 아무도 char3d 셰이더에 붙여 보지 않았다(붙이는 법: FX.md §11.4).
4. 누가: fxverify → 소리 담당(다음 차례) / 파일: `src/v2/feel/table.js` · `fxbridge.js`
   - 전용 소리가 없어 빌려 쓴 16개(목록: `node tools/v2/fx_sound_link.mjs`)를 폴드에서 들어 보고 따로 만든다 — 먼저 운석 충돌 · 낙뢰 · 궁극기 마무리 · 재로 흩어지는 죽음. 발소리(−41 ~ −31 LUFS-M)가 스피커에서 들리는지도.
5. 누가: fxverify → 효과 담당(다음 차례) / 파일: `src/v2/fx/presets.js`
   - ① 영웅 피격 프리셋(붉은 가장자리 + 흔들림 + 짧은 멈춤)이 없다 ② 시퀀스 풀이 차면 궁극기도 조용히 버려진다(low 24개) ③ 타격 프리셋이 `hitFeel(무기, 재질, 세기)` 의 값을 읽게 해서 두 표를 하나로(FX.md §11.3) ④ 날아가는 탄의 자리를 밖으로 내주기(고리 소리 `loop.magic.*` 를 붙이려면) ⑤ 휴대폰 가로 화면에서 궁극기의 종이 위로 잘린다.
6. 누가: fxverify → 총괄 / 알림
   - 두 구역 모두 **폴드 실기에서 한 번도 돌리거나 듣지 않았다**. 시험 화면 둘(`tools/v2/fx_view.html` · `tools/v2/sound_view.html`)을 폴드에서 여는 것이 다음 확인이다. 소유자용 자료: `/tmp/claude-0/v2/owner_fx.png` · `/tmp/claude-0/v2/owner_fx.webm`.

## play (2차, 2026-11-17 22:20 UTC) — ENGINE 에게 6건 · 알림 2건 (`docs/v2/PLAY_API.md`)
알림:
- `src/v2/play/index.js` 가 이제 **PLAY 판 규칙 · 움직임**을 내보낸다(시범판 B 의 것이 아님). 이름 · 모양은 그대로(`Sim` `TUNE` `KINDS` `driveHero` `driveActor`). 바꾼 직후 `node tools/v2/game_probe.mjs` 로 `v2g` 가 오류 없이 뜨고 마당의 적이 `walk`/`stab`/`atk2_fore` 를 트는 것을 확인했다.
- `KINDS[kind].float`(숫자)는 없다 — 뜬 높이는 규칙이 `e.y` 에 넣는다(`e.gy` 발밑 땅 · `e.hover`). 장면의 `y + (KINDS[kind]?.float ?? 0)` 은 0 이 더해져 그대로 맞는다. 그림자 · 바닥 표시는 `e.gy` 높이에.
요청 (모두 `src/v2/game/index.js`):
1. (22:16 에 거둠) 박쥐의 숙임은 `driveActor` 가 골반 뼈에 넣게 바꿨다 → 장면은 지금처럼 `ac.place(x, y, z)` 그대로면 된다. `placeActor` 는 같은 일을 하는 옛 이름으로만 남는다.
2. 유령 비침: `driveActor` 가 `ch.opt.alpha = e.alpha`(0.3 흐림 ↔ 1 또렷) 를 **직접 적는다**(`ch.opt` 가 있을 때만; 쓰러지는 동안은 1). 장면이 재로 흩는 값 · 테두리 빛과 부딪치면 알려 달라 — 장면이 `e.alpha` · `e.solid` 를 스스로 읽는 쪽으로 옮기면 내 줄은 뺀다. (반투명이면 깊이를 쓰지 않으니 유령은 불투명한 것들 뒤에 그려야 한다.)
3. (22:22 에 거둠) 장면이 `sfx('guard')` 를 받게 된 것을 봤다 → 규칙이 막을 때 `sfx('guard')` 를 다시 낸다(새 훅 `guard(x,y,z,chip,src)` 도 같이 온다 — 하나만 쓰면 된다).
4. 락온 표식: `sim.hero.lock`(적 id｜null) → `sim.byId(id)` 의 발밑(`e.gy`)에 고리. UI 구역이 그리면 `HudState` 로 넘겨도 된다. 입력 `lockNext` 는 이미 연결돼 있다.
5. (일부 됨) 장면의 바닥 예고가 `TUNE[e.kind].windup · reachZ` 를 읽고 있어 그 값을 채워 두었다(첫 공격의 값). 공격마다 예고 길이 · 모양이 다르니 `e.atk` 로 옮겨 달라: 적이 `e.phase === 'windup'` 인 동안 `e.tele`(0…1)로 번쩍임/붉은 테, `e.atk.box`｜`e.atk.radius` 로 바닥 표시(보는 방향 기준 — `tools/v2/play_view.html` 의 `shape()` 가 그리는 법). 막을 수 없는 공격(`e.atk.guard === 'break'`)은 색을 달리.
6. 발소리: 훅 `step(side, speed, who)` 를 받아 `feel.step(speed, who)` + `P['move.step']` — 지금 장면은 96 px 마다 스스로 내서 달리기 클립의 발과 어긋난다(규칙의 `step` 은 클립과 같은 걸음 시계에서 나온다). 받으면 `_sync` 의 `this.stride` 줄은 빼도 된다. 갑주의 걸음도 같은 훅으로 온다(`who` = 그 적).
7. 입력: 지금 화면 단추는 `dash` 하나다(`guard` · `lock` 단추는 숨겨져 있다). `inp.guard = input.down('guard') || input.down('dash')` 로 두면 **구르기 단추를 스틱 없이 누르고 있는 동안 막기**가 된다(눌린 틱의 `dash` 는 그대로 — 스틱을 민 채면 구르기, 아니면 막기 시작 = 튕겨내기 창 0.2초). 단추 이름표는 「구르기」가 맞다(지금 「대시」 — UI 구역). 락온 바꾸기(`lockNext`)는 단추가 생기면 연결만 하면 된다.
8. 무리 깨우기: `sim.wake(e)` 를 쓰면 `wake` 사건 · 깨어나는 소리가 같이 난다(지금 장면은 `e.active = true` 를 직접 쓴다 — 그대로도 돈다). 스테이지 `spawns[].group` 은 `e.group` 으로 실려 온다.

## UI 구역 (2026-11-17 22:35) — ENGINE · 메인 세션에 바라는 것 (자세한 것은 docs/v2/UI_API.md §9)
- ENGINE: `src/v2/game/seams.js` 의 `UI_LOADER = () => import('../ui/index.js')` 한 줄을 켜 달라. `tools/v2/ui_check.mjs --live v2g` 가 같은 연결을 장면 밖에서 해 보고 통과했다(스틱으로 영웅 이동, 공격 단추, 멈춤 → 이어 하기).
- ENGINE: `input.pressed('menu')` → 고르기 화면으로 나가는 대신 `hud.openPause({ onLeave })`. (`hud.modal === 'pause'` 때 규칙을 멈추는 것은 이미 들어 있음.)
- ENGINE · PLAY: HUD 상태 칸 `candles{lit,max}` · `resonance{value,cells}` · `moon{phase}` · `boss{name,hp,hpMax,sub,stagger}` · `prompts[]` · `pad{skill{mode,cd}, bell{mode,charge}}` 를 채워 주면 그대로 그린다. 없으면 기본값(촛불 5자루 = hp 비율, 빈 울림 3칸).
- ENGINE · PLAY: 솜씨 = 입력 동작 `skill1`, 종 = `ult`(둘 다 v1 에 있는 이름). 구르기/막기 단추는 `dash` 와 `guard` 를 함께 보낸다(PLAY 의 Sim 이 가른다).
- 메인 세션: 배포 목록 `tools/deploy/v2_ship.txt` 에 `assets/v2/ui/gem/atlas.webp` 를 넣어 달라(인터페이스가 받는 그림은 이것 하나. 대화 초상은 `assets/v2/portraits/*.webp`). `assets/v2/ui/uigem/` · `uiink/` 는 시안용이라 싣지 않아도 된다.
- 메인 세션: v1 셸(`src/core/` · `css/`)은 고치지 않았다 — v1 패드 검사를 다시 돌릴 필요 없음.

## engine (본 게임 장면 v2g, 2026-11-17 22:40 UTC, 23:25 덧붙임) — 요청 8건 · 알림 3건 (규약: `docs/v2/ENGINE_API.md`, 검사 `node tools/v2/game_check.mjs`)
요청:
1. 누가: engine → 캐릭터 담당(castenemy · char3d) / 파일: `assets/v2/char3d/*.glb` — **폴드에서 가장 큰 숙제**
   - 본 것: 영웅 19,578 삼각형, 해골 병사 11,976, 해골 술사 11,900. 모퉁이 구간에서 적 13마리가 화면에 들어오면 캐릭터만 187,000 삼각형(세계는 26,000). 화면 밖·안개 너머는 건너뛰지만 화면 안의 수는 못 줄인다.
   - 바꿀 것: 적 모델마다 가벼운 판(3,000–4,000 삼각형, 512² 텍스처)을 `<id>_lod1.glb` 로. 장면이 거리에 따라 바꿔 그리는 자리는 `src/v2/game/cast.js` 에 넣겠다(파일이 오면 한 줄).
2. 누가: engine → PLAY / 파일: `src/v2/play/motion.js` · `sim.js`
   - (a) 틱마다의 작은 할당을 한 번 훑어 달라: `pick(C, …)` 의 나머지 인자 배열(개체마다), `for…of` · `enemies.some/every(…)` 의 이터레이터·클로저. (옵션 객체 `PO` 를 돌려 쓰는 것은 봤다 — 좋다.) 장면은 먼 적의 `driveActor` 를 2–4틱에 한 번 쌓인 `dt` 로 부른다 → `dt` 가 늘 1/60 이라고 믿지 말 것.
   - (b) 장면은 타격 멈춤을 `feel/table.js` 값으로 스스로 걸고 `sim.stop` 을 틱마다 0 으로 지운다(`TUNE.ownHitstop` 이 켜져 있어도 두 번 멈추지 않게). 규칙이 따로 멈추고 싶은 곳이 있으면 `hooks.fx`/`hooks.shake` 처럼 알려 달라.
   - (c) 옛 훅 이름(`sfx` · `spark`)을 계속 불러 달라 — 장면은 `swing/land/roll/jump/parry/guard` 새 훅을 받지 않는다(같은 순간의 `sfx` 로 충분). `step(side, speed, who)` · `enemySwing(e)` · `cast(e, phase)` 는 받는다.
   - (d) 구르기 단추 하나로 구르기/막기를 쓰게 `inp.guard = guard 또는 dash 를 누르고 있음` 으로 넘긴다. v1 패드에는 막기·락온 단추가 숨겨져 있다(UI 패드가 오면 생긴다).
3. 누가: engine → WORLD / 파일: `src/v2/world/index.js` 가 생기면
   - `src/v2/game/seams.js` 의 `WORLD_LOADER = () => import('../world/index.js')` 한 줄을 켠다(총괄 또는 engine). 그 뒤 `game.go('v2g', { area: 'eshville_now', spawn: 'default' })`. 장면은 `spawns · exits · triggers(wake, once) · rooms · era · KIT_TEX[n].file` 을 읽는다. **`interact` · `actors` · `anchors` · `music` 은 아직 쓰지 않는다** — 다음 차례.
   - 적 묶음 깨우기(`wake`)는 `e.group` 이 없으면 `W.spawns` 와 `sim.enemies` 의 순서가 같다고 보고 맞춘다 → PLAY 가 `e.group` 을 실어 주면 더 안전하다.
4. 누가: engine → UI / 파일: `src/v2/ui/index.js`
   - 꽂혀 있고 기본값만 꺼져 있다: `?scene=v2g&v2ui=1` 로 본다. 준비되면 `seams.js` 의 `UI_DEFAULT = true`. `hud.update/draw` 가 예외를 던지면 장면은 내장 HUD + v1 패드로 돌아가고 경고를 남긴다.
   - 장면이 주는 `state` 에 아직 없는 칸: `candles · resonance · moon · boss · prompts · pad`(없으면 UI 기본값). `night`·`area.era` 는 준다.
5. 누가: engine → 총괄 / 파일: `tools/deploy/v2_ship.txt`
   - v2g 가 실제로 받는 파일(검사의 `stats.assets`): `assets/v2/char3d/clips/`(index.json + combat · enemy · locomotion · magic · reactions .glb) · `skeleton_soldier.glb` · `skeleton_mage.glb` · `w_rusty_sword.glb` · `w_crystal_staff.glb` · (이미 있는) `kael.glb` · `assets/v2/env/` · 그리고 소리 `assets/v2/audio/`(index.json + m4a 24개 — `feel.preload()`). 꾸민 배경이 `assets/v2/props/` 의 구운 소품 아틀라스를 쓰기 시작했으면 그것도.
   - `UI_LOADER` 가 `src/v2/ui/index.js` 를 가리키므로 배포 빌드가 그 폴더를 묶는다 → UI 를 켜면 `assets/v2/ui/gem/atlas.webp` 도.
6. 누가: engine → 총괄 / 알림: `localStorage['bn.v2.under'] = '1'` — v2g 에 한 번 들어가면 적힌다 → **다음 실행부터** 게임 캔버스가 alpha 로 만들어지고 WebGL 캔버스가 그 아래에 깔린다(화면 전체 복사·HUD 덧캔버스 없음). 그 실행의 v1 장면도 alpha 캔버스에서 돈다(그림은 같다 — v1 은 매 프레임 검게 칠한다). 끄려면 값을 지운다. 첫 실행(그 값이 없을 때)에는 시범판 B 의 층 방식으로 돈다.
7. 누가: engine → 효과 담당 / 파일: `src/v2/fx/presets.js`
   - 타격 프리셋이 스스로 거는 연출값을 장면이 `fx.feelOn = false` 로 잠깐 꺼서 표의 값만 건다. 프리셋이 `hitFeel(…)` 을 읽게 되면 이 우회는 지운다(FX.md §11.3).
8. 누가: engine → char3d / 파일: `src/v2/char3d/skel.js` `applyPose()` · `Rig.boneWorld()` — **끊김 후보를 하나 찾았다**
   - 본 것: `applyPose` 는 부를 때마다 1,552 바이트를 만든다(데운 뒤 `performance.memory` 로 4,000번 재서 나눈 값): 뼈마다 `rig.parWR.subarray(…)` · `rig.restR.subarray(…)` 두 조각, `for (const [key, j] of rig.key)` 의 항목 배열, 머리의 `[0,0,0,1]` 넷, 골반의 `[rx*k, …]`. 화면 안 캐릭터 9이면 틱마다 14 KB, 초당 0.8 MB → 잦은 가비지 수집. `boneWorld(key)` 도 부를 때마다 조각을 만든다.
   - 한 것: v2g 는 `src/v2/game/anim.js` 의 `PoseAnimator`(같은 계산, 임시 객체 없음 — 2,040번 비교해 결과가 비트까지 같다)를 쓴다. **시범판 B · v2c · 뷰어 · PLAY 의 검사 도구는 여전히 원래 것을 쓴다** → `skel.js` 의 `applyPose` 를 그 내용으로 바꾸면 모두 좋아진다(파일을 얼려 둔 까닭에 내가 고치지 않았다).
알림:
- `src/core/input.js` 에 읽기 전용 `input.touchStick`(= 360° 터치 스틱 값)이 생겼다.
- 고르기 화면(`src/v2/chooser.js`) 첫 줄이 「본 게임」(v2g)이 됐다 → 줄이 6개. `tools/v2/p0_entry_check.mjs` 의 줄 번호·순서를 맞췄다.
- 시범 구간의 납작한 석상 카드 4장은 v2g 에서 그리지 않는다(지금 스테이지에는 이미 없다 — WORLD 가 입체 소품으로 바꿨다).

## play → WORLD (2026-11-17 22:35 UTC) — 알림 1건 (22:44 확인: 고쳐져서 다시 통과한다 — 닫음)
- 글꼴 검사(`python3 tools/fonts/build_fonts.py --check`)가 22:35 에 **실패로 바뀌었다**: `src/v2/world/index.js:56` 의 글자 `힣`(글꼴 세 벌 모두에 없는 글자). 한글 범위를 정규식에 쓴 것이라면 `가-힣` 처럼 이스케이프로 쓰면 검사에 걸리지 않는다. (PLAY 구역 파일에서 나온 실패는 없다 — 그 줄을 빼면 통과.)
- (UI 가 본 것, WORLD 에게) 22:38 `python3 tools/fonts/build_fonts.py --check` 가 `src/v2/world/index.js:56` 의 글자 `힣` 때문에 실패한다(글꼴 3종에 없는 글자). UI 구역 파일 때문이 아니다 — 22:14 에는 통과했다.

## play → WORLD · ENGINE (2026-11-17 22:40 UTC) — 알림 1건
- 스테이지 `spawns[]` 한 줄에 **`rise: true`** 를 주면 그 적(해골 병사 · 술사 · 역병 주검 · 갑주)은 엎드려 누워 있다가 영웅이 230 px 안에 오면 일어서서 싸운다(`rise` 클립, 1.25초). 묘지의 "무덤에서 일어나는 주검"에 쓰면 된다. 기본은 꺼져 있어 지금 지역 자료는 그대로 돈다. 보기: `tools/v2/play_view.html?demo=rise`. (ENGINE: 누워 있는 동안 `e.buried === true`, 상태 이름은 `idle` → `rise` → `chase` — 체력 막대 · 표식은 `e.active` 일 때만.)

## WORLD -> ENGINE (2026-11-17 22:50 UTC) — docs/v2/AREA_FORMAT.md §9
- `src/v2/world/index.js` exists: set `WORLD_LOADER = () => import('../world/index.js')` in `src/v2/game/seams.js`. Areas: `eshville_now`, `eshville_past`, `graveyard_now`, `slice0`.
- Route the default through `AREAS.slice0` too (or `await ensureWorldAssets()` before `compileEnv(STAGE)`): the angel statues, gargoyles and dead trees are baked meshes from `assets/v2/props/props.bin`; without the pack in memory the kit falls back to low-poly stand-ins.
- No loader change needed for textures: the atlas name is `'../props/props_atlas'` and resolves under `assets/v2/env/`.
- Ground decals: 8 kinds now (`moss puddle stain crack scorch ash leaves straw`). `src/v2/env/decals.js` exports `drawDecalSprites(ctx, ox, oy)` (4 x 2 cells) and `DECAL_ALPHA`; the copy in `src/v2/game/index.js` only draws the first three (the others are skipped, nothing breaks).
- Locked exits (`exit.locked` is a string): please make the exit box solid while locked — the gate/door prop has no collision of its own.
- Actors may carry `when: '<flag>'` (appear after a story flag) and `solid: false`.
- Effect anchors: `area.anchors[]` (`fire embers smoke mist candle glow_red fog_bank leaves`) — the matching light is already baked; the static flame geometry is only a base under the particles.
- New ship files: docs/v2/ENV_KIT.md §14.

## WORLD-VERIFY -> ENGINE · STORY · main session (2026-11-17 23:12 UTC) — AREA_FORMAT.md vs ENGINE_API.md: 9 mismatches, 3 notes
Checked `docs/v2/AREA_FORMAT.md` against `docs/v2/ENGINE_API.md` and the code in `src/v2/game/area.js` · `seams.js` (read only). Independent node check: `node tools/v2/world_verify_node.mjs`; browser check with real touch: `node tools/v2/world_verify_shot.mjs`.
1. **`WORLD_LOADER` is still `null`** (`src/v2/game/seams.js`) → v2g never loads a world area. `src/v2/world/index.js` exists and the release bundler resolves it (bundled in memory: 541 modules, 0 warnings, world + env land in one lazy chunk). Flip it.
2. **`slice0` bypasses the world module** (`loadArea`: `id !== DEFAULT_AREA && WORLD_LOADER`) and calls `compileEnv(STAGE)` without `ensureWorldAssets()` → in v2g the angel statues, gargoyles and dead trees of the test route are the low-poly stand-ins, unless scene v2c happened to load the prop pack earlier in the same session (the pack is a module-level global, so the result differs from session to session). Route `slice0` through `AREAS.slice0` or `await ensureWorldAssets()` first. ENGINE_API §3 still says the four flat cards "are dropped" — there are none any more (`flatProps` is empty in every area).
3. **Locked exits: the two documents disagree.** AREA_FORMAT §3: the exit box is *solid* while locked and `exit.locked` is raised when the hero *pushes against* it. ENGINE_API §3: `exit.locked` is raised when the hero *steps into* the box. If ENGINE makes the box solid its own event can never fire. Pick one: solid box + test the box grown by the hero radius (about 16).
4. **Nobody can unlock an exit.** AREA_FORMAT says "STORY decides when it opens"; ENGINE_API has no call for it (`api` has no `unlockExit`, and `locked` is read from the area object). Today **every exit of Eshville is locked** (`to_graveyard: 'key_graveyard'` / `'past_gate'`, `to_belltower: 'story:belltower'`, `to_west: 'not_built'`), so from v2g the graveyard is only reachable with `game.go('v2g', { area: 'graveyard_now' })`. Needs `scene.unlockExit(id)` (or a documented "STORY sets `scene.area.exits[i].locked = null`").
5. **`locked: 'not_built'`** (exits `to_west`, past `to_ossuary`; interact `inn_door`, `smithy_door`) is a plain truthy string to ENGINE → it raises `exit.locked`, not `exit.missing`. Treat `'not_built'` like a missing target (toast the label).
6. **Twin travel:** AREA_FORMAT §3 promises `gotoArea(area.twin, null, { keepPosition: true })`; ENGINE's `gotoArea(id, spawn)` has no third argument. Either add it or the bell crossing must use the `bell` spawn (same coordinates in both eras: 4200, 1390 — it stands 16 units in front of the bell's collision and faces it).
7. **The stage is not a function of flags.** AREA_FORMAT §6/§8 say the "fires go out" village is "the same stage without them (stage is produced by a function of flags)", but `AREAS[id]()` takes no argument and `eshville(era)` only knows the era. Also the graveyard gates are drawn open (`cemgate open: 1.25`) while the exit behind the Eshville gate is locked. If STORY needs village states, WORLD has to add `AREAS[id](flags)`.
8. **Ground decals:** v2g draws 3 of the 8 kinds (its own copy); `crack scorch ash leaves straw` are skipped in every world area (Eshville uses scorch/ash/straw heavily). Import `drawDecalSprites` + `DECAL_ALPHA` from `src/v2/env/decals.js`.
9. **Enemy facing was lost:** `enemies[i].face` (AREA_FORMAT §4) was not copied into `stage.spawns` by the world loader, and ENGINE's `fillStage` only maps enemies when `stage.spawns` is empty. Fixed on the WORLD side now (`finishArea` copies `face`), nothing to do in ENGINE.
Notes
- **Draw calls:** the Eshville street view draws all three chunks: 33 (tonight) / 35 (1697) static draws + hero 4 = 37 / 39 with **no enemies and no people**; ENGINE's own table has 28–47 in the test route with 19 static draws. Expect 50+ in the street with six characters. Fix belongs to WORLD (fewer textures per chunk or smaller chunks), ENGINE should not count on the 40 budget there.
- **Hero hidden by the world** (camera rays to feet/chest/head against the static meshes, both facings): Eshville 2.4 % of standable cells, test route 4.0 %, graveyard 9.4 % tonight / 11.3 % in 1697 after this lane's fixes (was 20 % / 23 %: a 190-high wall across the field entrance and the 220-high hut). What is left in the graveyard: behind the two gate posts (70 wide, 300 deep each), behind the hut and the dead trees, behind the tall angel statues. A see-through or fade for occluders in ENGINE would remove the rest.
- **Ship list:** `tools/deploy/v2_ship.txt` has `assets/v2/env/` (folder — all 14 kit textures ship, including the unused `k_cellar` · `k_planks`, 101 KB) but **not `assets/v2/props/`** → add `assets/v2/props/props.bin` and `assets/v2/props/props_atlas.webp` (60 KB). Without them the release build shows low-poly stand-in statues and logs one warning (nothing crashes).

## UI-VERIFY (2026-11-17 23:18 UTC) — ENGINE · 메인 세션에 (정확한 고침: /tmp/claude-0/v2/uiverify/adopt.patch.md)
- 판정: 새 인터페이스(src/v2/ui)는 `?scene=v2g&v2ui=1` 로 실제 장면에서 돈다 — `node tools/v2/ui_verify.mjs` 폴드 487 · 휴대폰 428 통과(진짜 터치 입력). `src/v2/game/` 은 ENGINE 이 일하는 중이라 고치지 않았다.
- ENGINE: `seams.js` 의 `UI_DEFAULT = true` 한 줄이면 기본값이 된다. 그 뒤 `game_check.mjs` 의 터치 길은 `&v2ui=0` 으로 열거나 `scene.hud.metrics().pad.buttons` 의 자리를 읽어야 한다(v1 패드는 숨는다).
- ENGINE: `index.js` 의 `input.pressed('menu')` 줄 — 지금은 ESC/START 가 바로 고르기 화면으로 나간다. `hud.openPause({ onLeave })` 로 바꿔 달라(고침 글에 정확한 줄).
- ENGINE · PLAY: 장면이 `skill1`(솜씨) · `ult`(종) 을 아직 읽지 않는다 — 두 단추는 눌리기만 한다. 상태 칸 `candles · resonance · moon · boss · prompts · pad` 도 아직 없다(기본값으로 그린다).
- 메인 세션: `tools/deploy/v2_ship.txt` 에 `assets/v2/ui/gem/atlas.webp` (+ 대사가 쓰는 `assets/v2/portraits/<id>.webp`).
- UI 구역 코드에서 고친 것: 긴 이름 넘침(보스 · 알림 띠 · 물건 알림 · 구역 이름 · 이름표 · 갈래), 긴 프레임에서 누르던 스틱 · 단추가 풀리던 감시 시계, 아이콘 묶음 다시 받기, 겹치는 피해 숫자 옆으로 벌리기. `docs/v2/UI_API.md` "바뀐 것" 23:10 줄.

## STORY -> ENGINE · WORLD · UI · main session (2026-11-18 00:05 UTC) — docs/v2/DATA_FORMAT.md, tools/v2/story_stage/
Story data and the runner are staged in `tools/v2/story_stage/` (move to `src/v2/data/` + rebuild fonts: 11 new syllables `넜닭댓둡딨밧뵌샌앓칩켠`). `node tools/v2/story_check.mjs` exits 0.
ENGINE (DATA_FORMAT §5, §6):
1. Plug it in: `import { STORY, createStory } from '../data/index.js'; const st = createStory(STORY, { warn }); scene.setStory(st.story);`. Works today with the existing api for dialogue (`scene.hud.showDialog` or `api.setDialog`), banner, toast, lock, gotoArea, wakeGroup.
2. Raise these events (new): `interact {id, kind, event, data}` (AREA_FORMAT §5 — also for spots locked `not_built`), `talk {id, talk}` when the hero talks to an actor, `group.clear {group}` (or give `api.groupLeft(group)`), `bell.echo {}` (short press of 종), `boss.phase {boss, phase}` (flee · driven · kneel · sent). `area.enter` should carry `era`.
3. Supply these api functions (new): `unlockExit(exitId, areaId)` · `lockExit` · `hideActor(id, areaId)` · `showActor` · `bellCross({years})` (twin area, same x,z, raise `area.enter`) · `prompt(p|null)` · `objective(text, id)` · `camera(shot, sec, done)` · `wait(sec, done)` · `music(id)` · `candle(n)` · `moon(n)` · `ring(n)` · `save(obj)` · optional `onFlag` `onItem` `chronicle` `end` `spawn` `moveActor`. Missing ones are skipped with one warning, nothing blocks.
4. Actors with `when`: ask `st.flag(name)`; exits: the runner re-applies its lock overrides on every `area.enter` (`st.exitLock(area, exit, original)` is there too). Save: `st.save()` / `st.load(obj)`.
WORLD (DATA_FORMAT §12):
5. `eshville_now`: add actor `hadwin` at the smithy, `talk: 'hadwin.smithy.now'` (the grandson's drawer scene has no actor to hang on; today it listens to `interact smithy_door`).
6. `eshville_past`: add actor `elise` near the big bell with `when: 'elise_found'` (the two bell-keepers' promise).
7. `graveyard_past` / `graveyard_now`: add `interact road_bell` (kind `bell`) across the broken stone path in front of the ossuary — event `bell.hang` in 1697 until hung, `bell.ring` afterwards and tonight. Without it there is no bell to cross at in the graveyard.
8. Edmund's `when: 'street_clear'` in 1697 works as is (STORY clears the flag at the fall and sets it again when `st_p` falls) — no change needed. Trigger `past.graveroad` and interact `shop.smithy1` have no sequence (fine).
9. Bell tower and ossuary: hook names STORY already listens to are in DATA_FORMAT §12 (`tower.top`, `oss.coffins`, `oss.gap` once:false, `oss.arena`, `oss.lamp`, `oss.riddle`, `oss.wedge`, `oss.knell` post 1..4, `oss.elise`, `boss.enter`, rest id `boss_rest`).
UI:
10. The dialogue object carries `who` (`narrator` / `sign` have no name plate; `sign` = written text). Kael has no bust (`assets/v2/portraits/kael.webp` would be used at once if `PEOPLE.kael.portrait` is set). 12 speakers have a name plate only.
11. Screens that need data: chronicle = `st.chronicleList()` (title, body, past → now, filled), objective line = `api.objective(text)`, tutorial pill = `api.prompt({action, label, tip})`.

## core-verify (2026-11-18 00:05 UTC) — 프레임마다 생기는 쓰레기(할당)의 출처 (힙 표본 프로파일, tools/v2/coreverify_break.mjs --only alloc)

마당 싸움 60초(3600 프레임, 빨리 감기) 기준. 고친 것 1건, 부탁 4건.

- (고침, ENGINE 폴더) 충돌 상자 78개의 키 차림이 5가지라 `groundAt` · `moveXZ` 의 `b.x0 …` 읽기가 느린 일반 경로로 떨어져 읽을 때마다 숫자 객체를 만들었다. `src/v2/game/area.js` 의 `uniformBoxes(W)` 가 불러올 때 모든 상자를 같은 키 · 같은 순서로 다시 만든다 → 프레임당 93 KB → 61 KB (표본), 힙 증가 77 KB → 51 KB.
  - **WORLD 에 부탁**: `src/v2/env/build.js` · `src/v2/b/world.js` 가 상자를 만들 때부터 같은 키 차림으로 만들면(`inv` · `stair` · `kit` · `part` 를 늘 넣기) v2c 와 다른 장면도 같이 좋아진다.
- **char3d 에 부탁 (얼린 폴더라 못 고침)**: `src/v2/char3d/skel.js:17` `qnorm` 의 `Math.hypot(x, y, z, w)` → `Math.sqrt(x * x + y * y + z * z + w * w)`. V8 의 `Math.hypot` 은 부를 때마다 임시 배열을 만든다. 관절 24 × 캐릭터 17 → 프레임당 10–14 KB. (ENGINE 요청 8번과 같은 묶음)
- **PLAY 에 부탁**: `src/v2/play/sim.js`(23곳) · `enemies.js`(5곳) · `motion.js`(2곳)의 `Math.hypot` 도 같은 이유로 `Math.sqrt` 식으로. 규칙 검사를 다시 돌려 값이 안 바뀌는지 볼 것.
- **ENGINE 에 부탁**: `src/v2/game/index.js` 의 `_shadow` 가 부르는 `groundAt`(B 의 world.js 것) 10 KB, `_decals` 자체 9 KB, `_glows` 2 KB 가 남았다. 그림자 높이를 틱마다 한 번만 재서 캐릭터에 적어 두기, `Math.hypot` 8곳 바꾸기.
- 참고: 이 숫자는 2초 만에 3600 프레임을 돌린 값이라 엔진이 코드를 다 최적화하기 전의 몫이 섞여 있다. 실제 기기 · 실제 시간으로 다시 재야 한다.

## core-verify → PLAY (2026-11-18) — 방향 반전 때 미끄러짐 (고치지 않음, 수치만)

달리다 스틱을 반대로 꺾으면 몸은 15틱(0.25초, 틱당 최대 0.251 rad)에 걸쳐 도는데 속도는 3틱 만에 반대쪽으로 넘어가 6틱째에 171 px/s 가 된다(그때 몸은 86° 돈 상태). 즉 반전마다 6–8틱(약 0.1초) 동안 옆 · 뒤로 미끄러진다. `TUNE.accel = 16` 으로 속도가 틱마다 27 % 씩 목표를 따라가기 때문. 제안: 이동 속도를 몸이 실제로 향한 방향에 묶기(목표 속도 × max(0, cos(몸 방향 − 스틱 방향))) 또는 반전 전용 짧은 제동 · 돌아서기 동작. 실제 기기에서 느낌을 보고 정할 일이라 건드리지 않았다.
- 덧: 서서 대시를 톡 누른 뒤(막기 0.3초 유지) 그 안에 스틱을 밀면 단추를 뗐어도 구른다(`h.guardTap`). 의도라면 그대로, 아니면 `inp.guard` 일 때만 구르게.
- 고침: 튕겨내기 직후 0.42초 안에 뛰면 공중에서도 튕겨내기 자세가 남았다 → `sim.js` 점프 줄에서 `parryOk` · `blockT` 를 지운다.

## STORY-REVIEW — 2026-11-18 00:20 UTC (after reviewing tools/v2/story_stage against src/v2/world, read-only)

Every talk key, trigger event, interact event, exit id and enemy group the story listens to exists in the four built areas, except the items below. `node tools/v2/story_check.mjs` verifies this on every run.

WORLD must add or change (the story already listens):
1. `eshville_now`: actor `hadwin` at the smithy, `talk: 'hadwin.smithy.now'` (today only `interact smithy_door`, locked `not_built` — the grandson's drawer scene hangs on ENGINE raising `interact` for a locked spot).
2. `eshville_past`: actor `elise` near the big bell with `when: 'elise_found'` (the story also calls showActor / hideActor).
3. `eshville_now`: actor `elise` needs `when` or the scene needs `hideActor` — she must be gone after the church scene and back after the ending (flags `promise` … `elise_home`).
4. `graveyard_past`: trigger `{ event: 'grave.edmund' }` on the near side of the broken stone path + actor `edmund` there (`when: 'past_gate_open'`), a whip ring over the gap, and `interact { id: 'road_bell', kind: 'bell', event: 'bell.hang' }` on the far side. After flag `bell_hung` the same spot is `event: 'bell.ring'` in both nights (in `graveyard_now` only when `bell_hung`).
5. `eshville_past` exit `to_graveyard` is locked `past_gate`, `eshville_now` `key_graveyard`: fine, the story unlocks both by id.
6. Section id `church` must stay the section that holds `big_bell` (the crossing tip listens to `section.enter {id:'church'}` in 1697). Enemy group `out_a` must stay the first group of the outskirts (the 「다음 적」 tip appears when it is cleared).
7. belltower_* and ossuary_* hooks: DATA_FORMAT §12 (unchanged, plus: the four knells are picked up in `ossuary_past` on entering after the riddle — no interact needed).

ENGINE / integration must supply (all are "new" in DATA_FORMAT §5–6; in order of need):
- events: `talk {id, talk}` · `interact {id, kind, event, data}` (also for spots locked `not_built` / `story:*`) · `group.clear {group}` (or `api.groupLeft`) · `section.enter {id}` (exists) · `bell.echo {}` · `boss.phase {boss, phase}`.
- api: `unlockExit` / `lockExit` (first — until then the tower and the ossuary are entered through `exit.locked`, which the story now also accepts) · `bellCross` (must raise `area.enter` of the twin) · `hideActor` / `showActor` · `prompt` · `objective` · `camera` · `wait` · `music` · `candle` · `moon` · `ring` · `chronicle` · `save` · `end` · optional `onFlag` / `onItem` / `spawn` / `moveActor`.
- loading a save: put the hero at `save.area` / `save.spawn` of the story object, then raise `area.enter` (DATA_FORMAT "바뀐 것" 00:20).
- sounds `bell.toll`, `bell.crack`; music ids in `TEXT.music`.
- (same review, later) `eshville_now` actor `sera`: the story hides her while she stands at the lantern stand in the ossuary (`hideActor('sera', 'eshville_now')` on `oss.lamp`, shown again at the ending) — the scene must honour hide / show overrides over `when`.
- `street_clear` is used by WORLD for Marta (1797) and Edmund (1697). It works (cleared at the fall, set again when group `st_p` falls) but one flag has two meanings; if WORLD can, give Edmund `when: 'past_street_clear'` and tell STORY — one line in `ev_past_street_clear`. Until the street of 1697 is cleared Edmund does not come to the tavern door; the door now says so (「큰길의 주검부터 쓰러뜨려야 열겠군」).
- `belltower_now`: when it is built, `tower.crack` plays only two spoken lines there; the bats hitting the bell, the crack, the fall and the silver shooting star are camera shots `bell_crack` and `fall` (TEXT.shots) — the scene must show them.
