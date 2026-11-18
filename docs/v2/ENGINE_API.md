# ENGINE_API — 본 게임 장면 `v2g` 의 규약 (ENGINE 구역)

2026-11-18 · 셋째 판 (실제 지역 · 사람 · 새 인터페이스 기본값 · 그리는 해상도). 장면 코드는 `src/v2/game/`, 열기 `index.html?scene=v2g`(고르기 화면 첫 줄 = 에슈빌 오늘 밤), 검사 `node tools/v2/game_check.mjs`(시범 구간) · `node tools/v2/game_walk.mjs`(실제 지역을 새 단추로 걷기).
이 문서는 다른 구역(PLAY · WORLD · UI · STORY)이 **이 문서만 보고** 맞출 수 있게 적는다. 바꾸면 아래 "바뀐 것"에 한 줄.

## 바뀐 것
- 11-18 13:40 **다섯째 판 (INTEGRATE-B2) — 이야기 · 저장 · 건넘**: 「본 게임」은 이제 진짜 이야기(`src/v2/data`)로 돈다(`seams.js` `STORY_LOADER`, 끄기 `?v2story=0`; 주소에 `area=` 가 있으면 `v2story=1` 을 줘야 켜진다 — 검사 도구들은 그대로 이야기 없이 돈다). 새 파일 `src/v2/game/storyhost.js`(DATA_FORMAT §5 의 api 전부 · 저장 `bn.v2.save`), 장면의 고리는 `index.js` 에서 `STORY HOOK` 으로 찾는다. 자세한 것은 **§12**. §6 의 「아직 없는 api」 줄과 §11 의 6번은 옛 이야기다.
- 11-18 11:55 **SPEED-FIRE** — `TURN_RUN` 15 → 17.5 rad/s (규칙의 turnRate/pivotRate 17.4 를 따른다) · 카메라가 영웅을 따라붙는 빠르기 kt 5.5 → 8.5 (달리기 410 px/s 에서 처지는 거리 48 px — 예전 275 px/s 의 50 px 와 같다) · 앞쪽 여백 kf 1.5 → 2. 불: 효과 닻(`src/v2/game/anchors.js`)의 fire 가 이제 **유일한 불길**이다(세계는 불 잎을 굽지 않는다 — ENV_KIT §20): 크기 세 갈래(화로 · 집 불 · 담 위/잔해 불), 넓은 불(닻의 `w`)은 너비를 따라 최대 네 점에서, 혀 · 속은 효과 governor 가 솎지 않는 우선 입자(낮은 단계는 0.7배), 빛 반지름 300×size → 200+180×size.
- 11-18 03:10 **넷째 판 (INTEGRATE-B1) — 채찍 · 보스 · 새 지역**
  - **채찍 비질리아가 장면에 들어왔다**(`src/v2/whip/`, `docs/v2/WHIP.md` §7 그대로). 영웅은 검을 들지 않는다(WebGL2: `cast.actor('kael', null)` · 불러오는 무기 목록에 `blade` 없음. WebGL1 에는 채찍 그리기가 없어 상자 검이 남는다). 틱마다 `_sync` 에서 손(뼈대의 `weaponMatrix`) → `driveWhip(whip, hero, TUNE, pull)` → `whip.update(pdt, hand)`(`pdt` = 놀이 dt, 타격 멈춤 중 0 → 끈이 세계와 함께 언다). 그리기는 `_gl` 의 `cr.end()` 바로 뒤 `wr.draw(whip, env, a)`(`env.viewport` = 실제 그리기 크기, `env.lightPos/lightCol` = 효과 점광). 장면의 칸: `scene.whip` · `scene.wr` · `scene.whipLink` · `scene.whipHand` · `scene.whipPullE`.
  - 훅: `hit` → 무기 `'whip'` 일 때 `whip.set('crack', { x, y, z, strength })` 뒤에 `_strike('whip', …)`(끝이 맞은 점에 닿은 채 멈춘다 — 검사에서 0–0.1 px) · `pull(e)` → 휘감긴 적을 `driveWhip` 의 `pull` 로 · `sfx('slash')` → `feel.swing('whip', …)` · 막기 / 튕겨내기도 무기 `'whip'`. 규칙의 기술표(`src/v2/play/moves.js` 의 `M()`)는 이제 모든 기술에 `weapon: 'whip'` 을 준다. 채찍의 종 울림 사건(`ring`)은 그림만 쓰고 소리는 규칙(`holy.bell` · `bell.toll`)에 맡긴다.
  - **지운 것**: 칼 궤적 띠(`_rb` · `TRAIL.blade/bladeHeavy`) · 베기 초승달(`swing.light/heavy`) · `hero.whipOn` 의 빛줄(`WHIP_CORD`). 구르기 띠는 그대로.
  - 다시 시작: 지역을 새로 부르거나(`_makeFxHandles`) 되살아나면 `whip.reset(hand)` · 컨텍스트를 되찾으면 `wr.restore()` · 성능 단계는 `createWhip({ tier: perf.tier })`(`_makeWhip`).
  - **보스**: `state.boss` = `sim.bossState()` 를 그대로 옮긴 한 객체 `{ id, name, hp, hpMax, sub, stagger, phase, kneel, fled, staggered }`(없으면 `null`). `sub` = 예고 중인 공격 이름 · 무릎 꿇으면 「종을 길게 울려라」 · 달아나면 「그 밤으로 달아났다」. 예고 모양은 효과 엔진의 바닥 문양으로 예고가 시작될 때 한 번 깔고 끝나면 지운다(`_warn`): `atk.arc` = 부채꼴 · `atk.mark.box × fan` = 탄의 길 · `atk.mark.radius`(+`ring`) = 원(부를 자리) · `atk.air` = 가슴 높이의 고리 · `guard:'break'` 는 보라. 노래(`atk.pulse`)의 원은 부르는 동안 남는다. 상자 · 원 하나짜리 예고는 예전의 빛 원 그대로.
  - 보스가 부르는 종류(`attacks[].summon.kind`)는 지역과 함께 불러온다. 지역이 적지 않은 종류가 놀이 중에 생기면(`sim.addEnemy`) `_take` 가 그 모델을 한 번 불러와 도착하면 그린다.
  - 이야기가 꽂히지 않았을 때: `kneel` · `bossFlee` · `bossReturn` · `bossDown` 에 한 줄 알림. 새 사건 `boss.down { boss, knelled }`.
  - 새 지역은 주소로 열린다: `?area=ossuary_now`(밴시 여왕) · `?area=belltower_now`(층마다 카메라가 따라 오르고, 떨어지면 아래층에 선다 — 구덩이 없음) · `?area=ossuary_past`. 채찍 고리(`W.hookPoints`)는 어디서나 솜씨 단추로 건다.
  - **할당(아는 문제)**: 채찍 모듈이 페이지 안에서 프레임마다 쓰레기를 만든다(`writeWhipMesh` · `sim.js _step` · 그 안의 `Math.hypot` — 서 있을 때 프레임당 약 30 KB, 채찍 전 1.6–1.8 KB). 장면은 채찍의 코드가 도는 동안만 `Math.hypot` 을 제곱근 판(`HYP3`)으로 바꿔 끼웠다가 되돌린다 → 서 있을 때 13.8–14.2 KB(데워진 뒤) · 싸울 때 2.4–3.1 KB. `game_check` 의 할당 단계는 phone2 에서 아직 약 1 KB 차이로 실패한다(fold_open 전체 실행은 바꿔 끼우기 전의 것으로 실패). 고칠 자리는 `src/v2/whip/`(requests.md "INTEGRATE-B1, addition").
  - 종탑 문(`eshville_now` 의 `to_belltower`)은 지역 깃발이 아니라 이야기 자물쇠(`story:belltower`)다 — `scene.unlockExit('to_belltower')` 로 연다. 납골당 문(`graveyard_now` 의 `to_ossuary`)은 지역 깃발 `ossuary_open` 으로 열린다(`setWorldFlags`).
  - 검사 도구 `node tools/v2/game_shot.mjs --plan street｜facings｜ring｜bell｜boss｜tower｜past｜exits｜dbg`: 규칙 입력을 직접 넣어 장면을 몰고 이름 붙인 순간을 찍는다(끝–맞은 점 거리, 모드, 보스 값이 한 줄씩 나온다).
- 11-18 01:45 **셋째 판 보탬 (INTEGRATE-A 이어 하기)**: ① 지역은 이야기 깃발로 지어진다 — `scene.worldFlags` 를 `AREAS[id](flags)` 에 넘긴다. `scene.setWorldFlags({ gate_open: true })`(이야기 `api.setFlags`)는 지금 선 지역을 **그 자리에서 다시 짓는다**(짧게 어두워짐 · 같은 자리 · 쓰러진 적은 쓰러진 채 · 체력 그대로)(§3) ② 채찍 고리(`interact` kind `ring`)가 규칙의 `W.hookPoints` 로 들어간다 — 고리 곁에서 솜씨 단추(또는 알약 「채찍 걸기」) = 채찍 걸기(§3.1) ③ 쉬는 자리(kind `rest`)가 임시 규칙에서 체력을 채우고 다시 서는 자리가 된다(`sim.heal` · `sim.respawnAt`), `api.heal(n)` · `api.restAt(x, z, y)` ④ HUD 에 `pad.attack.charge` · `pad.roll.cd` ⑤ `tools/v2/p0_entry_check.mjs` 를 새 일시정지 흐름으로 고쳤다(멈춤 단추 → 일시정지 판 → 「나가기」, Esc → 판 → ↓ → Enter).
- 11-18 01:00 **셋째 판 (INTEGRATE-A)**: ① 지역은 모두 `src/v2/world` 의 `AREAS` 에서 온다(`WORLD_LOADER` 켬). 「본 게임」 = `eshville_now`, 주소 `?area=<id>&spawn=<이름>`, 시범 구간은 `?area=slice0`(§3) ② 나가는 곳: 들어서면 어두워짐 → 불러오기 → 밝아짐. 잠긴 곳은 벽이고 다가서면 까닭을 한 번 말한다. `scene.unlockExit(id, area)` · `lockExit`(§3) ③ 사람(`actors`)이 입체 모델로 서 있고 가까이 가면 「말을 건다」 알약 → 사건 `talk`. 누르는 자리(`interact`) → 사건 `interact`(§3.1) ④ 불 · 불씨 · 연기 · 안개 자리(`anchors`)에 효과 엔진의 입자와 흔들리는 빛(§3.2) ⑤ 바닥 스티커 여덟 가지, 하늘 그림과 안개 색은 지역 · 밤마다(§3) ⑥ 새 인터페이스(`src/v2/ui`)가 기본값. ESC/START = 일시정지. 일시정지 줄 「옛 단추로 바꾸기 ↔ 새 단추로 바꾸기」(`localStorage['bn.v2.ui']`)(§4) ⑦ 솜씨 · 종 단추: 규칙이 아직 못 쓰면 흐리게 그리고 누르면 알림(§5) ⑧ 입체 화면의 해상도는 기기 픽셀 비율에서 정한다 + 등급별 상한 + 느리면 저절로 한 단계 낮춤(§7) ⑨ 지역을 옮기면 안 쓰는 캐릭터 모델을 GPU 에서 내린다 ⑩ 이야기 꽂는 자리가 늘었다(§6, §11).
- 15:25 첫 판 (자리·이름을 먼저 정함).
- 22:20 둘째 판: 장면이 실제로 돈다(검사 `node tools/v2/game_check.mjs`). 바뀐 것 — ① 타격은 소리 다리(`src/v2/feel/fxbridge.js`)의 `strike` 한 번으로 효과·소리·진동을 내고, 화면 연출값은 `feel/table.js` 의 값을 **한 번만** 건다(§1) ② `hooks.event` 는 `play.<이름>` 으로 이야기 쪽에 넘긴다(§2, §6) ③ 영웅 회전은 장면이 빠르기를 묶는다(§2 「돌기」) ④ 지역: `docs/v2/AREA_FORMAT.md` 의 `spawns · exits · triggers(wake) · rooms · era` 를 읽는다(§3) ⑤ HUD: `docs/v2/UI_API.md` 의 `hud.modal · resize · release` 를 따른다(§4) ⑥ `input.touchStick` 이 생겼다(§8).

## 0. 한눈에

```
src/v2/game/
  index.js    장면 (Scene 하위 클래스, export default). 들어오기·나가기, 입력, 60 Hz 틱, 보간 그리기, 이음매(지역·HUD·사건), window.__v2
  glr.js      세계 그리기 (시범판 B 의 glr.js 를 옮겨 와 키운 것: 셰이더 1개, 정적 메시 + 동적 스티커)
  charr.js    캐릭터 그리기 (char3d/render.js 를 옮겨 와 키운 것: 맞음 번쩍임 · 재로 흩어짐 · 효과의 빛 받기 · 옵션 객체 재사용)
  cast.js     캐릭터 창고: 종류별 GPU 모델 1개(공유) + 개체마다 뼈대·애니메이터 1벌(Actor3D), 무기 소품과 쥐는 자세, 공용 클립 묶음 읽기
  animlib.js  공용 클립 라이브러리 읽기 (tools/v2/animlib_load.js 를 옮긴 것)
  anim.js     PoseAnimator = char3d 의 Animator 와 같은 것, 자세를 입히는 단계만 할당 없이 (char3d 의 applyPose 는 부를 때마다 1.5 KB 를 만든다)
  area.js     지역 불러오기 (모두 src/v2/world 의 AREAS — 시범 구간도) + 잠긴 나가는 곳 · 사람의 충돌 상자
  magic.js    적의 탄 = 입체 마법 효과 (빛 띠 꼬리 · 빛 덩이 · 움직이는 빛 · 떨어지는 입자 · 터짐) — 규칙의 탄을 따라다닌다
  hud.js      내장 HUD (옛 단추로 돌 때 쓴다: 체력 · 구역 이름 · 알약 · 대화 상자 · 일시정지 판)
  perf.js     localStorage['bn.v2.perf'] 읽기
  people.js   사람(area.actors)과 누르는 자리(area.interact): 모델 · 자세 · 영웅 보기 · 알약 하나
  anchors.js  효과 자리(area.anchors): 불 · 불씨 · 연기 · 안개 입자와 흔들리는 빛
  res.js      입체 화면의 픽셀 크기(기기 픽셀 비율 · 등급 상한) + 저절로 낮추기
  seams.js    다른 구역을 꽂는 스위치: WORLD_LOADER(켜짐) · UI_LOADER(켜짐) · UI_DEFAULT(true)
```

놀이 규칙은 **`src/v2/play/index.js` 에서만** 가져온다: `Sim` · `TUNE` · `KINDS` · `driveHero` · `driveActor`.

## 1. 틱과 시간 — 누가 시간을 쥐는가

- 게임 루프는 60 Hz 고정 틱(`update(dt)`, dt = 1/60)이다. **그리기는 화면이 갱신될 때마다**(120 Hz 화면이면 120번) 하고, 틱 사이는 위치·카메라를 보간한다(`game.alpha` = 틱 사이 0..1).
- **타격 멈춤 · 느린 화면은 ENGINE 이 쥔다.** 값은 `src/v2/feel/table.js`(`feel.hit(…)` 이 돌려주는 `stop · shake · kick · zoom · slow`)에서만 나온다. 타격 한 번 = `bridge.strike(fx, 무기, 재질, 세기, flags, …)` 한 번(효과 그림 + 소리 + 진동). 그때 효과 프리셋 자체의 연출값은 끄고(`fx.feelOn = false`) 표의 값을 `fx.feel` 에 한 번만 건다 — 흔들림이 두 번 걸리지 않는다(검사가 확인: 화면 멈춤 = 표의 값, 흔들림 = 표의 값).
- `hooks.fx(name, …)` 로 낸 마법 프리셋은 프리셋이 가진 연출값과 소리 사건을 그대로 쓴다(다리의 `onEvent`). 장면은 `fx.update(1/60)` 이 돌려준 놀이용 dt 로 `sim.update(dt, inp)` 를 부르고, 멈춤 중(dt = 0)에는 **부르지 않는다**.
- 그래서 **`Sim` 은 자기 타격 멈춤을 갖지 않아도 된다.** `sim.stop` 이 있으면 장면이 틱마다 0 으로 지운다(시범판 B 의 규칙과 겹치지 않게). `mv.hitstop` 같은 값은 무시된다.
- `sim.update` 에 0 보다 작거나 같은 dt 는 오지 않는다. 느린 화면 중에는 1/60 보다 작은 dt 가 온다.

## 2. 개체 규약 (PLAY ↔ ENGINE)

장면이 **읽는** 칸 (없으면 괄호 안 기본값). 좌표는 헌장 §4: x 오른쪽 · y 위 · z 화면 안쪽, 단위 = 논리 px (사람 키 ≈ 104).

| 칸 | 뜻 |
|---|---|
| `x, y, z` | 발밑 위치 |
| `dirX, dirZ` | 보는 방향 단위 벡터, 360° (없으면 `facing`(±1), 그것도 없으면 +x) |
| `anim, animT` | 상태 이름과 그 상태에서 흐른 초 — `driveHero`/`driveActor` 가 클립으로 바꾼다 |
| `hp, hpMax` | 체력 (영웅의 `hpMax` 가 없으면 `TUNE.heroHp`) |
| `h, r` | 맞는 상자 높이 · 반지름 (체력 막대 · 효과 높이에 쓴다) |
| `kind` | 적·인물 종류 → `KINDS[kind]` |
| `id` | 적마다 다른 값 (장면이 `Map` 열쇠로 쓴다) |
| `dead` | true = 사라짐. `state === 'dead'` 인 동안은 "쓰러지는 중": 그 종류의 쓰러지는 시간(`e.dying`, 없으면 0.9초) 가운데 **마지막 0.9초**를 장면이 재로 흩는다(앞부분은 죽는 클립이 보인다). `dead` 가 먼저 와도 흩어짐은 끝까지 그린다 |
| `alpha` | (선택) 0..1 — 유령처럼 흐려지는 적. 0.12 아래로는 그리지 않게 묶는다 |
| `hover` | (선택) 떠 있는 높이 px — `y` 에 이미 들어 있다고 본다(그림자와 바닥 예고만 `y − hover` 에 그린다) |
| `tele` · `atk` | (선택) 예고 0..1 과 지금 공격 한 줄 — 바닥 예고 빛을 `atk.box{f0,f1,side}` 또는 `atk.radius{r,fwd}` 자리에 그린다(`atk.shot` 은 그리지 않는다). 없으면 옛 방식(`TUNE[kind].windup`) |
| 영웅 `lock` | 락온한 적 id — 내장 HUD 는 그 적 위에 금빛 세모를 그린다 |
| `flashT` / `flash` | 맞은 직후 > 0 (적 0.13초 · 영웅 1 → 0). 장면은 맞은 순간만 쓰고 번쩍임 곡선은 `fx` 의 `hurtFlash` 를 쓴다 |
| `ifr, hurtT, dashT, move, moveT, combo, onGround, vy, landT` | 영웅: 깜박임 · 칼 궤적 · 잔상 · 먼지에 쓴다 (`move.hit[0..1]` = 판정 구간, `move.id`) |
| `stateT, state, active, yard` | 적: 예고 표시(공격 준비) · 마당 적 세기 |
| 탄 `sim.shots[]` | `x, y, z, vx, vz, dead, t` + 선택 `element`('fire'·'ice'·'lightning'·'holy'·'blood' — 없으면 'blood') |

장면이 개체에 **쓰는** 칸은 밑줄로 시작하는 것뿐이다(`_px,_py,_pz` 직전 틱 위치, `_a3` 그리기 개체, `_k` 종류 번호). PLAY 는 밑줄 칸을 건드리지 않는다.

### `new Sim(W, hooks)` — 장면이 주는 훅

시범판 B 의 훅을 그대로 받고(이름·인자 같음), 몇 개를 더 받는다. 모두 없어도 되는 선택 호출이다.

| 훅 | 장면이 하는 일 |
|---|---|
| `hit(e, dmg, mv, x, y, z, info?)` | 타격 한 번 → `bridge.strike(…)`(효과 + 소리 + 진동) + 표의 멈춤·흔들림·밀림·줌·느린 화면 + 맞은 번쩍임 + 피해 숫자. **돌려주는 값 = 소리 표의 레시피**(`r.stop` …) — 규칙이 읽어도 된다. 세기: `mv.strength ?? mv.str`('L'·'M'·'H'·'F'), 없으면 `mv.finisher`/`mv.id === 'sw3'` → 'H', 그 밖 'M'. 재질: `info.material ?? KINDS[e.kind].material`. `info.blocked` → 막힘 연출(`FLAG.guard`), `info.dirX/dirZ` → 치는 방향. `e.hp <= 0` 이면 `FLAG.kill`, 마당의 마지막 적이면 `FLAG.finisher` |
| `kill(e)` | 재로 흩어짐(0.9초 분해) + 뼈 흩어짐 효과 + 사건 `enemy.kill` |
| `heroHurt(dmg, pit)` | `feel.play('hero.hurt')` + 가장자리 붉은 빛 + 흔들림 + 짧은 멈춤 |
| `sfx(name)` | `'dash'`·`'jump'`·`'land'` → 효과 프리셋 `move.*`(소리는 프리셋의 사건으로 한 번) · `'slash'`(또는 `mv.sfx`) → `feel.swing('sword', 세기, hero)`(초승달 그림은 판정이 시작될 때 장면이 낸다) · `'swing'` → 적 휘두름 · `'cast'` → `enemy.mage.chant` · `'parry'` → 튕겨냄 타격(`FLAG.parry`) · `'guard'` → 막음 타격(`FLAG.guard`) · `'die'` → 사건 `hero.dead` |
| `spark(x, y, z, kind)` | `'shot'` 탄 터짐(원소 효과 + 소리) · `'hit'`·`'wisp'` 불티 · `'slam'` 땅 찍기 먼지 + 흔들림. `'dust'`·`'parry'`·`'guard'` 는 `sfx` 쪽에서 이미 냈으므로 아무것도 하지 않는다 |
| `number(x, y, z, text, color)` | 피해 숫자 (HUD 가 그린다) |
| `shake(px)` | 흔들림 (px ÷ 40 을 trauma 로, 0.6 까지) |
| `done()` | 지역 정리 끝 → 종 가락 + 사건 `area.clear` |
| `step(side, speed, who)` | (새 규칙) 영웅의 발 닿는 순간 → 먼지 + 발소리. 이 훅이 한 번이라도 불리면 장면은 자기 보폭 계산을 끈다 |
| `enemySwing(e, atk)` · `cast(e, phase)` | (새 규칙) 적 휘두름·주문 소리를 그 적의 자리에서 낸다. `cast` 의 `'charge'` → 원소의 모으는 소리 |
| `fx(name, x, y, z, dx, dz, pow, tx, ty, tz)` | `docs/v2/FX.md` §8 의 프리셋을 그대로 낸다(마법 · 보호막 · 줍기 …) — 소리 사건과 화면 연출은 프리셋의 것. 이름이 없으면 무시 |
| `event(name, a, b, c, d)` | 이야기 쪽으로 `play.<name>` 사건을 올린다(§6) — 이야기 함수가 꽂혀 있을 때만 |
| `sound(name, pos)` | `feel.play(name, pos)` (`docs/v2/SOUND_FEEL.md` §6 의 사건 이름) |

장면이 쓰지 않는 새 훅(`swing · attack · parry · guard · land · roll · jump · tell · shot · lock · wake · whiff · stagger …`)은 같은 순간에 옛 이름(`sfx`·`spark`)이 함께 불리므로 받지 않는다 — **옛 이름을 계속 불러 달라.** 옛 이름 없이 새 이름만 부르게 되면 알려 달라.

### `KINDS[kind]`

`{ model, weapon, height, material }` + 선택: `grip`(`{pos:[x,y,z], rotX, rotY, rotZ}` — 없으면 무기별 기본값: 검 `rotX:-80`, 지팡이 `rotX:100`, 삽창 `pos:[0,9,4]`), `scale`(기본 = 58 × height ÷ 모델 키), `death`(`'bone'`｜`'ash'`, 기본은 material 이 bone 이면 bone), `element`(탄의 원소), `float`(떠 있는 높이 px).
모델은 `assets/v2/char3d/<model>.glb`, 무기는 `assets/v2/char3d/<weapon>.glb`. **지역에 나오는 종류만** 받는다.

### `driveHero(ch, hero, dt, TUNE)` · `driveActor(ch, actor, dt)`

`ch` 는 장면의 `Actor3D`(char3d 의 `Char3D` 와 같은 공개 칸): `ch.dx, ch.dz`(그리는 방향 — drive 가 정한다), `ch.anim`(`Animator`: `play(name, {fade, time, speed, restart})` · `update(dt)` · `cur` · `t`), `ch.asset.clips`(이름 → 클립), `ch.rig`, 그리고 drive 가 마음대로 쓰는 칸(`kbT, kbSp, wasDead` …).

- **클립 묶음**: `ch.asset.clips` 에는 공용 라이브러리(`assets/v2/char3d/clips/`, 71개 — `docs/v2/ANIM_LIBRARY.md`)가 이름 그대로 들어 있다. 클립마다 `clip.meta`(`strike`·`ev`·`speed`·`travel`…)가 붙는다. 영웅 = 이동 · 전투 · 피격 · 마법, 적 = 이동 · 전투 · 피격 · 마법 · 적 묶음.
- 자리 채우기(시범판 B 의 `driveHero`)가 쓰이는 동안에는 영웅만 손으로 쓴 옛 클립이 같은 이름을 덮는다(`idle · run · atk1–3 · jump · land …`). PLAY 가 `driveHero` 를 바꾸면(= `src/v2/char3d/hero3d.js` 의 것과 다른 함수면) 라이브러리 클립이 이긴다. 손으로 쓴 것은 `hand_<이름>` 으로 남는다.
- 적의 옛 상태 이름을 위한 별칭: `attack` → `atk2_fore`, `cast` → `cast_quick`, `hurt` → `hit_light`, `death` → `death_back` (같은 이름의 클립이 이미 있으면 덮지 않는다).
- drive 는 **화면 안의 개체만** 불린다. 가까운 개체는 틱마다, 먼 개체는 2–4틱에 한 번 쌓인 `dt`(최대 1/15초쯤)로 불린다(§7) — `driveActor` 는 `dt` 가 틱마다 같다고 믿지 말 것. 방향은 drive 가 정한다(장면은 `ch.dx, ch.dz` 를 그린다).
- **돌기(영웅)**: drive 가 낸 방향을 장면이 한 번 다듬는다 — 한 틱에 도는 각을 묶고(달릴 때 15 rad/s ≈ 뒤로 돌기 0.21초, 공격·구르기·피격 중 34 rad/s ≈ 0.09초: 몸이 판정 상자를 따라가야 하므로), 115° 넘게 도는 동안은 도는 쪽을 0.2초 붙든다(스틱이 정반대 근처에서 떨려도 몸이 왔다 갔다 하지 않는다). drive 가 이미 이보다 느리게 돌리면 아무 일도 하지 않는다. `sim.hero.dirX/dirZ` 가 "가려는 방향"으로 읽힌다.
- 적은 `e.dirX` 가 없으면(옛 규칙) 깨어 있는 동안 영웅 쪽을 보게 장면이 돌린다.

## 3. 지역 (WORLD ↔ ENGINE)

- 모든 지역은 `src/v2/world/index.js` 의 `AREAS[id]()`(`docs/v2/AREA_FORMAT.md`)에서 온다 — 시범 구간도 `AREAS.slice0`(석상이 구운 소품 묶음에서 나온다). `src/v2/game/area.js` `loadArea(id)` → `{ id, name, era, twin, W, def, test, rooms, room, music, spawns, exits, triggers, interact, actors, anchors, flatProps, fromWorld }`. `test` = 시범 구간인가. 모르는 id · 불러오기 실패는 경고를 남기고 시범 구간으로 돈다.
- 열기: 고르기 화면 「본 게임」 = `eshville_now` 의 `default` 자리. 주소 `index.html?scene=v2g&area=graveyard_now&spawn=gate`. 코드 `game.go('v2g', { area, spawn, story })`. **시범 구간은 주소로만**: `?scene=v2g&area=slice0`(고르기 화면의 줄 차림은 `tools/v2/p0_entry_check.mjs` 가 여섯 줄로 못 박고 있어 줄을 더하지 않았다).
- `W` 는 `compileEnv` 결과 그대로다. 텍스처 이름 → 파일: v1 타일 5종 아니면 `KIT_TEX[n].file` 또는 `assets/v2/env/<n>.webp`(`'../props/props_atlas'` → `assets/v2/props/props_atlas.webp`).
- **빛 · 안개 · 하늘은 지역과 밤마다**: 안개 `W.fog`, 하늘 맨 위 색 `W.sky.top`, 하늘 그림 `W.sky.img`(지역이 바뀌면 같은 캔버스 · 같은 텍스처에 다시 그린다 — 아래쪽은 그 지역 안개 색으로 녹인다), 캐릭터 색조는 `W.light`(구운 빛 + 점광)에서 틱마다.
- **바닥 스티커 여덟 가지**(`moss puddle stain crack scorch ash leaves straw`): 환경 키트의 `drawDecalSprites` · `DECAL_ALPHA`(`src/v2/env/decals.js`)를 그대로 쓴다.
- **지역의 상태(이야기 깃발)**: WORLD 의 지역은 깃발의 함수다(`AREAS[id](flags)`, AREA_FORMAT §13 · `AREA_FLAGS[id]`) — 닫힌 묘지 문 · 고쳐진 계단 · 누가 어디 서 있는가. 장면은 `scene.worldFlags`(장면이 살아 있는 동안 기억, 모든 지역에 같은 것을 넘긴다)를 쥔다.
  - `scene.setWorldFlags(obj, { reload })`(이야기 `api.setFlags(obj)`; `setStory(fn, { flags })` 로 처음 값): 값이 바뀌면 **지금 선 지역을 그 상태로 다시 짓는다** — 0.28초 어두워짐 → 불러오기 → 밝아짐. 영웅은 같은 `x, z`, 쓰러진 적은 쓰러진 채(종류 + 태어난 자리로 맞춘다), 체력 · 울림 그대로, 마당이 정리돼 있었으면 정리된 채(종 가락 · `area.clear` 가 다시 나지 않는다). `reload: false` 면 값만 바꾼다(다음에 지역을 불러올 때 쓰인다). 시범 구간은 다시 짓지 않는다.
  - `scene.flag(name)`(사람의 `when`)은 내장 깃발에 더해 `worldFlags` 도 본다(이야기 함수의 `flag` 가 꽂히면 그것만).
  - **임시 규칙(이야기가 없을 때)**: 마당을 정리하면 열쇠로 잠긴 나가는 곳마다 「그 나가는 곳을 여는 깃발 하나」를 WORLD 의 상태 목록에서 찾아(`area.js flagsThatOpen` — `AREA_FLAGS[id]` 를 하나씩 켜 보고 `exit.locked` 가 풀리는 것) 켠다 → 에슈빌 광장을 정리하면 `gate_open` 상태로 다시 지어져 묘지 문짝이 실제로 열린다. 그런 깃발이 없으면 예전처럼 나가는 곳의 벽만 치운다.
- 들어오는 자리: `spawns[name] = {x, z, face, y?}`. 이름이 없으면 `default`. `gotoArea(id, spawn, { keepPosition: true })` 는 지금 선 `x, z` 그대로 선다(쌍둥이 지역 — 종을 건널 때).
- **나가는 곳** `exits[i]`: 영웅의 발이 상자에 들어서면 사건 `exit {id, to, spawn}` → 화면이 어두워지고(0.28초, 영웅 입력 잠금) → `gotoArea(to, spawn)` → 밝아진다(0.5초). `to` 가 `AREAS` 에 없으면 「<이름> — 아직 갈 수 없는 곳이다」 + 사건 `exit.missing`.
  - **잠긴 곳(`locked` 가 글자)은 벽이다**: `area.js` 가 상자 자리에 충돌 상자를 넣는다(`W.boxes[i].gate === exit.id`, `solid` 를 켜고 끈다). 영웅이 36 px 안으로 다가서면 한 번(96 px 밖으로 나갔다 오면 다시) 사건 `exit.locked {id, locked, exit}`, `locked === 'not_built'` 면 `exit.missing {id, to, exit}` + 알림.
  - 여닫기: `scene.unlockExit(id, areaId?)` · `scene.lockExit(id, areaId?, key?)`(이야기 `api` 에도 있다). 바꾼 값은 장면이 살아 있는 동안 기억한다(다른 지역 것도 — `scene.lockOv`).
  - **이야기가 꽂히지 않았을 때의 임시 규칙**: 열쇠로 잠긴 곳(`'not_built'` · `'story:…'` 가 아닌 것)은 그 지역의 마당 적(`yard`)을 모두 쓰러뜨리면 열린다(「<이름> — 길이 열렸다」). 다가서면 「잠겨 있다. 이곳의 적을 모두 쓰러뜨리면 열린다」. 이야기 함수가 꽂히면 이 규칙과 잠김 알림은 꺼지고 사건만 간다.
- 사건 상자 `triggers[i]`: 처음 들어서면 사건 `trigger {id, event, data, trigger}`. `wake: group` 이면 그 묶음을 깨운다(`scene.wakeGroup(group)` — 규칙의 `sim.wake(e)` 를 쓴다). `once: false` 면 나갔다 들어올 때마다.
- 적: 지역에 나오는 종류만 받는다(모델 · 무기는 `KINDS`). 여섯 종 모두 실제 지역에서 돈다 — 유령은 비치는 동안 불투명한 것들 **뒤에** 그리고(`e.alpha`), 박쥐는 `e.y` 에 뜬 높이가 들어 있고 그림자 · 바닥 예고는 `e.gy` 높이에, 공격마다 바닥 예고(`e.tele` · `e.atk.box｜radius`; 막을 수 없는 공격 `atk.guard === 'break'` 은 보라색). 묘지 문의 정예(`gravekeeper_armor`)는 사건 상자 `gate_keeper` 가 깨운다.
- 구역 이름 · 방 울림: 실제 지역에서는 장면이 영웅 발밑의 구역을 스스로 읽는다(규칙은 마당을 정리하면 `sim.section` 을 `'done'` 에 묶어 둔다 — 시범 구간에서만 그 값을 쓴다). 방 울림: `area.rooms[sectionId]` > `section.room` > `area.room` > 내장 표.
- 넘어가기: 옛 지역의 정적 메시를 버리고, **새 지역이 쓰지 않는 캐릭터 · 무기 모델을 GPU 에서 내리고**, 새 지역을 받아 데운 뒤 연다. 그동안 HUD 는 `state.loading`.

### 3.1 사람과 누르는 자리 (`src/v2/game/people.js`)

- `actors[i]` 마다 입체 모델 1벌(`assets/v2/char3d/<model>.glb`, 텍스처는 512² 까지), 공용 클립 묶음의 `story` 묶음으로 선다: `pose` → `idle｜talk2｜kneel_down(끝 자세)｜sit_idle｜lantern_look`(`work` 는 지금 `idle`, `cower` 는 `kneel_down`). 영웅이 250 px 안에 오면 몸을 돌려 본다(앉거나 무릎 꿇은 사람은 돌지 않는다). 말하는 동안 `talk1`. 화면 밖이면 자세도 그리기도 건너뛴다.
- `solid`(기본 true)인 사람은 세계의 충돌 상자다(`W.boxes[i].actor === id`) — 영웅도 적도 규칙의 충돌로 비켜 간다. `when: '깃발'` 은 `scene.flag(name)` 이 참일 때만 서 있다. `tint` 는 색조에 곱한다. `scene.hideActor(id)` · `showActor(id)`.
- **알약은 한 번에 하나**: 닿는 거리(사람 92 px + `r`, 자리는 그 `r`) 안의 가장 가까운 것. **깨어 있는 적이 560 px 안에 있으면 알약은 없다**(싸움을 막지 않는다). 대화 · 일시정지 · 넘어가는 중에도 없다. 글자는 사람 `label ?? '말을 건다'`, 자리는 그 `label`.
- **채찍 고리**(`interact` kind `ring`, `landing {x, y, z}`): `area.js` 가 `W.hookPoints = stage.hookPoints` 로 규칙에 넘긴다(WORLD 가 `finishArea` 에서 만든다). 고리가 닿는 거리(330 px, 높이 차 280 px) 안이면 규칙이 `hero.hookId` 를 켜고 솜씨 단추가 채찍 걸기가 된다(`pad.skill.mode = 'hook'`) — 안개의 묘지에서 납골당 앞 단(140 px 위)으로 오르는 길이다. 알약 「채찍 걸기」를 눌러도 같은 일을 한다(닿지 않으면 「채찍이 닿지 않는다」).
- **쉬는 자리**(kind `rest`): 이야기가 없을 때 체력을 모두 채우고(`sim.heal('full')`) 쓰러진 뒤 다시 서는 자리로 삼는다(`sim.respawnAt(x, z, y)`) + 알림. 이야기가 꽂히면 사건만 가고 `api.heal(n)` · `api.restAt(x, z, y)` 를 이야기가 부른다.
- 쓰기: 터치로 알약을 누르거나 `confirm` 키. 사람 → 사건 `talk {id, talk, actor}`, 자리 → 사건 `interact {id, kind, event, data, locked, spot}`(잠긴 자리도 사건은 간다).
- 이야기가 꽂히지 않았을 때: 사람은 저마다 한 줄(`people.js` 의 `LINES`)을 대화 창(초상 `assets/v2/portraits/<model>.webp`)으로 말하고, 자리는 이름을 알림으로 띄운다. 내장 깃발: `<구역 id 또는 묶음 이름>_clear`(그 구역에서 태어난 적 · 그 묶음이 모두 쓰러짐 — `street_clear` · `square_clear` …), `door.pull` 자리를 쓰면 `door_pulled`.

### 3.2 효과 자리 (`src/v2/game/anchors.js`)

`anchors[i].kind`: `fire`(불길 두 겹 + 불씨 + 옅은 연기 + **흔들리는 점광**) · `embers` · `smoke` · `mist`/`fog_bank` · `candle` · `glow_red` · `leaves`. 화면 밖이거나 카메라가 보는 자리에서 2,100 px 넘으면 입자를 내지 않는다(1,200 px 넘으면 절반). 빛은 가까운 불 1 / 2 / 3개까지(효과 등급 low / mid / high — 엔진의 빛은 3 / 5 / 8개뿐이라 나머지는 타격 · 탄이 쓴다). 구운 빛과 번짐 그림은 스테이지에 이미 있다.

## 4. HUD (UI ↔ ENGINE)

장면은 HUD 객체 하나만 부른다. `src/v2/ui/index.js` 가 `createHud(game)` 을 내보내면 그것을, 없으면 내장 `hud.js` 를 쓴다.

```js
hud.update(dt, state)        // 틱마다
hud.draw(ctx, state)         // 그릴 때마다. ctx 는 논리 좌표(가로 state.viewW × 세로 state.viewH)로 맞춰 준 2D 컨텍스트. 바탕은 투명 — 지우지 말 것
hud.resize?.()               // 화면 크기가 바뀌면
hud.release?.()              // 장면을 떠날 때 (없으면 hud.dispose?.())
hud.modal                    // (선택) 'pause' 면 장면이 규칙·효과를 멈추고 hud.update 만 부른다 · 'dialog' 면 영웅 입력을 잠근다 (UI_API §2)
hud.padHideButtons           // (선택) 숨길 v1 패드 단추 id 배열 · hud.hidePad = true 면 v1 가상 패드를 통째로 숨긴다 (UI 가 자기 단추를 그릴 때)
```

`state` (장면이 한 객체를 다시 쓴다 — 붙들어 두지 말고 그때그때 읽는다):

| 칸 | 뜻 |
|---|---|
| `viewW, viewH, safe{l,t,r,b}, scale` | 논리 화면 · 안전 영역 · 논리 px 당 기기 px |
| `time` | 지역에서 흐른 놀이 시간(초) |
| `hero` | `sim.hero` 그대로 (`hp`, `dead` …) · `heroHpMax` |
| `area{id, name, era}` · `night` · `section{id, label}` | 지금 지역 · 밤(`'now'｜'past'`) · 구역 |
| `enemies` | `sim.enemies` 그대로 · `enemiesLeft` · `yardLeft` |
| `numbers[]` | 피해 숫자 풀(16칸, 다시 쓴다): `{on, x, y, z, str, color, t, big}` — `on` 인 것만 그린다. `t` = 뜬 뒤 흐른 초(0.8초에 꺼진다) |
| `project(x, y, z, out)` | 세계 점 → 논리 화면 `{x, y, w}` (w ≤ 1 이면 화면 뒤) |
| `done, doneT` | 지역 정리 끝 |
| `loading, message` | 불러오는 중 · 오류 글 |
| `debug` · `debugLine()` · `stats()` | 개발 정보 줄을 보일지 (`?v2dbg=1`) · 그 글 · 숫자 묶음 |
| `dialog` | 장면이 `scene.ui.dialog = {…}` 를 그대로 넘긴다(대화는 보통 `scene.hud.showDialog(d)` 로 연다) |
| `candles{lit, max}` | 촛불 = 체력(`max` 5, `lit` = hp ÷ hpMax × 5) |
| `resonance{value, cells}` | 울림 눈금 = 규칙의 `hero.reso / resoMax` |
| `left` | 지금 깨어 있는 적 수(실제 지역). 시범 구간에서는 0 → HUD 가 마당의 `yardLeft` 를 쓴다 |
| `prompts[]` | 알약 0–1개 `{action:'confirm', label, x, y, z, icon, onTap}` — 사람 · 누르는 자리(§3.1). 싸움 중에는 빈 배열 |
| `pad{skill{mode, cd, disabled}, bell{mode, charge, cd, disabled}, roll, attack, jump, lock}` | 단추 상태. 솜씨 · 종은 규칙이 그 기능을 가졌을 때만 켜진다(§5) |

- 그리기 순서: WebGL(세계 · 캐릭터 · 효과) → 그 위에 게임 캔버스(HUD · 넘어갈 때의 검은 막) → v1 의 번쩍임 · 페이드. **HUD 용 캔버스를 따로 만들지 않는다.**
- **기본 인터페이스는 「세공한 유리」(`src/v2/ui`)다**: `seams.js` `UI_DEFAULT = true`. 그 모듈의 `createHud(game, { onPause, onDisabledPress })` 가 HUD 와 터치 단추 층(`#v2pad`)을 맡고 v1 가상 패드는 숨는다. `__v2.stats.hud` = `'ui'｜'builtin'`.
  - 끄기: 주소 `?v2ui=0` · `localStorage['bn.v2.ui'] = '0'` · **일시정지의 줄 「옛 단추로 바꾸기」**(놀이 중에 바로 바뀌고 기억한다). 옛 단추에서는 v1 패드의 일시정지 단추(또는 ESC/START) → 내장 일시정지 판 → 「새 단추로 바꾸기」. 코드: `scene.setUi(true｜false)`.
  - 모듈을 못 받거나 `update`/`draw` 가 예외를 던지면 경고 한 줄을 남기고 내장 HUD 와 v1 패드로 돌아간다(놀이는 멈추지 않는다).
- **ESC / START(`menu`) = 일시정지**(나가기는 그 안의 줄). 「이어 하기 · 설정 · 옛/새 단추로 바꾸기 · 나가기」. `hud.modal === 'pause'` 인 동안 규칙 · 효과가 멈춘다. 불러오는 중에는 `menu` 가 바로 나간다.
- 장면이 HUD 에 거는 사건: 튕겨냄 `hud.callout(x, y, z, '튕겨냄', 'parry')` · 막음 `'막음', 'guard'` · 알림은 `hud.toast(text, {kind})`(v1 토스트를 쓰지 않는다) · 대사 `hud.showDialog({speaker, portrait, text, onDone})` · 종으로 건넌 뒤 `hud.banner('night')`. 지역 · 구역 이름 띠는 HUD 가 `state.area.id` · `state.section.id` 가 바뀌는 것을 보고 스스로 띄운다.
- 내장 HUD(`hud.js`)도 같은 면을 갖는다(`openPause · showDialog · toast · modal · metrics`) — 옛 단추로 돌 때 알약 · 대화 · 일시정지가 그대로 된다(모양은 단순하다).

## 5. 입력 → `sim.update(dt, inp)`

`inp = { mx, mz, jump, jumpHeld, attack, attackHeld, dash, guard, lockNext, jumpUsed, skill, skillHeld, bell, bellHeld }` — 장면이 한 객체를 다시 쓴다. `guard` = `guard` 동작 **또는 구르기 단추(`dash`)를 누르고 있는 동안**. `attack · dash · lockNext · skill · bell` 은 눌린 틱에 켜지고, 타격 멈춤으로 규칙이 쉬는 동안에는 다음 규칙 틱까지 남는다. `mx, mz` 는 −1..1, 터치 스틱은 360° 값.

- **솜씨 = 입력 동작 `skill1` → `inp.skill` / `inp.skillHeld`, 종 = `ult` → `inp.bell` / `inp.bellHeld`**(PLAY 의 `_tools`: 짧게 = 메아리, 길게 = 울림).
- 규칙이 그 기능을 가졌는지는 들어올 때 본다: `sim.caps?.skill ?? (hero.callCd !== undefined …)`, `sim.caps?.bell ?? (hero.bellCd !== undefined …)`. **없으면 그 단추는 흐리게(`pad.*.disabled`) 그려지고, 누르면 「솜씨는 아직 배우지 못했다」 / 「종은 아직 울릴 수 없다」 알림이 뜬다**(1.5초에 한 번). 있으면 `hero.skillMode · callCd · bellCharge · bellCd · reso` 가 단추와 울림 눈금에 그대로 비친다. 규칙이 거절하면(사건 `deny`) 까닭을 알린다(「울림이 모자라다」 …).
- 규칙의 사건 `bell`(메아리) → 이야기 사건 `bell.echo {r}`. `ringLong`(길게 다 참) → 사건 `bell.long {boss, spot, twin}`; **이야기가 없고 지역의 종(`interact` kind `bell`) 곁이면 쌍둥이 지역으로 건넌다**(같은 `x, z`, 「오늘 밤이 달라졌다」 띠). 채찍이 나가 있는 동안(`hero.whipOn`) 손에서 `whipX/Y/Z` 까지 빛 줄을 그린다.
- 알약이 떠 있을 때 `confirm` 은 그것을 쓰고 그 틱의 공격은 삼킨다.

## 6. 이야기 · 사건 (STORY ↔ ENGINE)

장면은 사건이 날 때 함수 하나를 부른다: `story(name, data, api)`.

- 꽂는 법: `game.go('v2g', { area, spawn, story })` 또는 `scene.setStory(fn, { flag })` — `flag(name)` 을 주면 사람의 `when` 이 그 함수에 묻는다(없으면 내장 깃발 §3.1). 없으면 장면이 임시 규칙으로 돈다(사람의 한 줄 · 잠김 알림 · 마당을 정리하면 열쇠 문이 열림 · 종 곁에서 길게 울리면 건넘).
- 사건: `area.enter {area, era}` · `section.enter {id, from}` · `enemy.kill {enemy}` · `group.clear {group}` · `area.clear {area}` · `hero.dead {}` · `hero.respawn {}` · `trigger {id, event, data, trigger}` · `exit {id, to, spawn}` · `exit.locked {id, locked, exit}` · `exit.missing {id, to}` · **`talk {id, talk, actor}`** · **`interact {id, kind, event, data, locked, spot}`** · **`bell.echo {r}`** · **`bell.long {boss, spot, twin}`** · PLAY 의 모든 사건 `play.<name>`(`data` = `[a, b, c, d]`).
- `api`: `{ scene, sim, lock(on), toast(text, kind), teleport(sectionId), setFlags(obj, {reload}), heal(n), restAt(x, z, y), gotoArea(id, spawn, {keepPosition}), fx(name, o), sound(name, pos), setDialog(obj｜null), unlockExit(id, area), lockExit(id, area, key), hideActor(id), showActor(id), wakeGroup(group), groupLeft(group), bellCross() }`. 그 밖에 `scene.hud`(`banner · toast · showDialog · callout …`) · `scene.area` · `scene.people`(`byId(id)` · `talking`) · `scene.flags`(내장 깃발 Set).
- **아직 없는 `api`(DATA_FORMAT §6 이 바라는 것)**: `prompt · objective · camera · wait · music · candle · moon · ring · save · chronicle · end · spawn · moveActor · onFlag · onItem` — 이야기 실행기는 없는 것을 경고 한 줄로 건너뛴다. `boss.phase` 사건도 아직 없다(보스 규칙이 오면).
- 이야기 함수가 예외를 던지면 콘솔에 남기고 놀이는 계속된다.

## 7. 성능 약속과 잰 값

- **입체 화면의 해상도**(`src/v2/game/res.js`)는 2D 게임 캔버스를 따르지 않고 스스로 정한다: `CSS 크기 × min(기기 픽셀 비율, 등급 상한, √(등급 픽셀 예산 ÷ CSS 넓이)) × 저장된 배율(resK) × 조절 단계`.

  | 등급 (`bn.v2.perf` 의 `tier`, 기본 mid) | 픽셀 비율 상한 | 픽셀 예산 | 가장자리 다듬기(MSAA) | 폴드 편 화면(CSS 1000×756, 2.6배) | 휴대폰(CSS 740×360, 3배) |
  |---|---|---|---|---|---|
  | low | 1.25 | 1.1 MP | 끔 | 1206×912 = 1.10 MP | 925×450 = 0.42 MP |
  | **mid** | 2.0 | 2.4 MP | 켬 | **1782×1347 = 2.40 MP** (전에는 1000×756 = 0.76 MP, 다듬기 없음) | 1480×720 = 1.07 MP |
  | high | 3.0 | 4.2 MP | 켬 | 2357×1782 = 4.20 MP | 2220×1080 = 2.40 MP |

  - **저절로 낮추기**: 그린 프레임 사이의 실제 시간을 잰다. 1초 동안 프레임의 80 % 이상이 예산(화면 주기 × 1.25 — 60 Hz 면 20.8 ms)을 넘으면 한 단계 낮춘다(크기 × 1 → 0.85 → 0.72 → 0.6). 다시 올리는 것은 조용한 1초가 12번 이어진 뒤 한 단계씩이고, 올린 지 8초 안에 다시 내려야 했으면 다음 기다림을 두 배로 한다(12초 → 24초 → … → 5분) — 오르내리며 떨지 않는다. 일시정지 · 불러오기 · 250 ms 넘는 끊김은 재지 않는다. 끄기 `?v2auto=0`(검사 · 캡처는 이렇게 연다). 다듬기 끄기 `?v2aa=0`.
  - `__v2.stats.res` = `{tier, aa, dpr, w, h, px, level, scale, auto, budgetMs, downs, ups, waitS}`.
- 그 밖의 주소 옵션: `?v2res=0.75`(저장된 배율) · `?v2cap=60` · `?v2post=1` · `?v2tier=low|mid|high`(효과 양 + 해상도 등급) · `?v2tex=512` · `?v2ui=0` · `?v2dbg=1` · `?area=` · `?spawn=`.
- 겹치기: 게임 캔버스가 alpha 로 만들어졌으면 WebGL 캔버스를 **그 아래**에 깐다(`mode: 'under'`). 아니면 시범판 B 의 층 방식(`'layer'`).
- 틱은 60 Hz, 그리기는 화면이 갱신될 때마다(영웅 · 적 · 탄 · 카메라를 보간). 자세(뼈)는 틱마다 한 번.
- 불러오기 화면 뒤에서 세계 · 그 지역의 모든 캐릭터 모델(사람 포함, 분해 · 반투명 경로까지) · 무기 · 효과 프리셋 · 탄 터짐 · 칼 궤적을 한 번 그리고 `gl.readPixels` 로 기다린 뒤 연다(지역을 옮길 때도).
- 캐릭터: 종류마다 GPU 모델 1개, 개체마다 뼈대 1벌. 화면 밖 · 안개 너머는 애니메이션도 그리기도 건너뛴다. 멀면 자세를 덜 자주 계산한다(900 px 넘으면 2틱에 한 번, 1,700 px 넘으면 4틱에 한 번; 사람은 700 px 넘으면 3틱에 한 번). **사람은 카메라가 보는 자리에서 1,700 px 넘으면 그리지 않고 1,500–1,700 px 에서 서서히 나타난다.** 지역을 옮기면 새 지역이 쓰지 않는 모델을 GPU 에서 내린다. 사람의 텍스처는 512² 까지.
- **영웅이 벽 · 문기둥 · 큰 비석 뒤에 가리면** 가린 부분이 옅은 푸른 실루엣으로 비친다. 틱마다 카메라 → 발 · 가슴 · 머리 세 선을 세계의 충돌 상자와 대 보고(할당 없음) 둘 이상 막혔을 때만 영웅을 한 번 더 그린다(그런 프레임에만 그리기 호출 +4 · 삼각형 +19,578). `tier: low` 에서는 끈다.
- **남은 프레임 쓰레기(장면 몫, 11-18 01:23 힙 표본)**: 서 있을 때 프레임마다 표본 39.4 KB(힙 증가 11.4 KB; 고치기 전 65.4 / 23.9). 그 가운데 장면 것: `_decals` 6.9 KB · `_glows` 3.5 KB · `_camera` 1.7 KB · `charr.draw` 1.7 KB · `_shadow` 1.0 KB — 모두 `b.quad(…)` 같은 호출에 소수 인자를 여러 개 넘겨서 생긴다(V8 이 인라인하지 못한 호출의 소수 인자를 16바이트씩 상자에 담는다). 고치는 법: 값을 미리 만든 `Float32Array` 에 적고 인자 없이 부른다.
- 틱 · 그리기 경로에서 장면 코드는 새 객체 · 배열을 만들지 않는다. 이번에 없앤 것: `Math.hypot`(V8 이 부를 때마다 임시 배열을 만든다) 8곳 → 제곱근 식, 그림자 · 바닥 예고의 발밑 높이를 프레임마다가 아니라 틱마다 한 번 재서 개체에 적는다(`e._gy`, 규칙이 `e.gy` 를 주면 그것). 

**아래 표는 11-18 00:55 에 잰 것이다 — 그 뒤 WORLD-2 · PROPS 가 지역(소품 · 단 · 문)을 바꿨고 다시 재지 못했다(`node tools/v2/game_spots.mjs` 로 다시 잴 것).** 잰 값 (`node tools/v2/game_spots.mjs`, 헤드리스 소프트웨어 렌더러, 폴드 편 화면 — **프레임 시간은 기기 값이 아니라 적지 않는다**; 개수 · 메모리는 기기에서도 같다). 사람을 모두 세우고(`when` 깃발 모두 참) 적은 지역이 놓은 자리에 둔 값이다:

**에슈빌 오늘 밤 (`eshville_now`)** — 텍스처 64.1 MB(세계 32.8 + 캐릭터 28.1 + 효과) · 정점 버퍼 7.9 MB · 캐릭터 모델 10개

| 자리 | 그리기 호출 | 삼각형 (세계 + 캐릭터) | 그린 캐릭터 / 건너뛴 캐릭터 | 그린 사람 | 불(빛) | 입자 |
|---|---|---|---|---|---|---|
| outskirts start (160, 150) | 19 | 52,429 (5,877 + 46,442) | 3 / 21 | 0 | 6 (2) | 258 |
| outskirts (900, 150) | 36 | 99,794 (13,000 + 86,648) | 6 / 18 | 0 | 6 (2) | 430 |
| street by the inn (1800, 200) | 48 | 138,210 (34,430 + 103,600) | 7 / 17 | 2 | 0 (0) | 352 |
| street by the smithy (2600, 200) | 41 | 164,749 (28,553 + 135,944) | 9 / 16 | 3 | 0 (0) | 279 |
| square entrance (3400, 200) | 43 | 182,367 (28,553 + 153,526) | 10 / 15 | 3 | 0 (0) | 49 |
| square (well) (3900, 330) | 43 | 200,064 (21,430 + 171,249) | 11 / 13 | 5 | 1 (0) | 49 |
| square east (4350, 700) | 29 | 162,083 (21,430 + 140,413) | 9 / 16 | 4 | 2 (1) | 46 |
| church front (3900, 1320) | 19 | 74,584 (21,430 + 52,996) | 3 / 21 | 2 | 0 (0) | 63 |
| grave road (4590, 1120) | 18 | 56,940 (21,430 + 35,352) | 2 / 22 | 1 | 1 (0) | 76 |
| square fight (arena awake around the hero) (3900, 330) | 49 | 241,618 (21,430 + 212,797) | 14 / 11 | 5 | 1 (0) | 112 |

**안개의 묘지 오늘 밤 (`graveyard_now`)** — 텍스처 60.1 MB(세계 31.5 + 캐릭터 25.5 + 효과) · 정점 버퍼 4 MB · 캐릭터 모델 5개

| 자리 | 그리기 호출 | 삼각형 (세계 + 캐릭터) | 그린 캐릭터 / 건너뛴 캐릭터 | 그린 사람 | 불(빛) | 입자 |
|---|---|---|---|---|---|---|
| road (600, 250) | 38 | 155,678 (21,588 + 133,818) | 11 / 0 | 0 | 10 (0) | 30 |
| road (bats) (600, 560) | 38 | 155,674 (21,588 + 133,818) | 11 / 0 | 0 | 10 (0) | 49 |
| gate (600, 940) | 38 | 155,658 (21,588 + 133,818) | 11 / 0 | 0 | 9 (0) | 60 |
| field (600, 1300) | 34 | 128,812 (21,588 + 107,014) | 9 / 2 | 0 | 8 (0) | 71 |
| mausoleum (600, 1860) | 22 | 93,360 (14,266 + 78,944) | 5 / 6 | 0 | 5 (0) | 74 |

**에슈빌 그 밤 (`eshville_past`)** — 텍스처 56.1 MB(세계 34.1 + 캐릭터 18.8 + 효과) · 정점 버퍼 6.8 MB · 캐릭터 모델 8개

| 자리 | 그리기 호출 | 삼각형 (세계 + 캐릭터) | 그린 캐릭터 / 건너뛴 캐릭터 | 그린 사람 | 불(빛) | 입자 |
|---|---|---|---|---|---|---|
| outskirts start (160, 150) | 18 | 57,217 (6,067 + 51,072) | 2 / 16 | 0 | 1 (0) | 15 |
| street by the tavern (1800, 200) | 45 | 134,498 (34,706 + 99,624) | 5 / 14 | 1 | 0 (0) | 19 |
| square (well) (3900, 330) | 37 | 159,832 (21,585 + 130,917) | 8 / 10 | 4 | 2 (0) | 38 |
| church front (3900, 1320) | 19 | 76,279 (21,585 + 54,516) | 2 / 16 | 1 | 0 (0) | 50 |

- **삼각형의 80–90 % 가 캐릭터다**(모델: 카엘 19,578 · 해골 병사 11,976 · 해골 술사 11,900 · 사람 11,000–20,000). 광장에서 마당 적 다섯과 사람들이 한 화면에 들어오면 20만을 넘는다. 화면 밖 · 먼 것을 건너뛰는 것만으로는 더 줄지 않는다 — **가벼운 판(LOD) 모델이 여전히 폴드에서 가장 큰 숙제**다(requests.md).
- 그리기 호출은 큰길에서 40–50(정적 조각 × 재질이 28–34) — WORLD-VERIFY 가 미리 적은 대로 40 예산을 넘는다(조각마다 재질 수를 줄이는 것은 WORLD 의 일).
- 시범 구간(`?area=slice0`)의 값은 `node tools/v2/game_check.mjs` 가 낸다.

## 8. v1 셸에 넣은 것 (`src/core/game.js`, 깃발이 없으면 v1 그대로)

- `Scene.everyFrame = true` → 화면이 갱신될 때마다 그린다. 그리기 직전 `game.alpha = acc / STEP`.
- `input.touchStick` (읽기 전용 getter) = 터치 스틱의 360° 값 `{x, y, mag, raw}`.
- `Scene.glUnder = true` 이고 `game.canvasAlpha` 면 검은 바탕 대신 `clearRect`. `game.canvasAlpha` 는 부팅 때 한 번 정한다: 주소가 `?scene=v2…` 이거나 `localStorage['bn.v2.under'] === '1'`(장면 `v2g` 가 처음 들어올 때 적어 둔다 → 다음 실행부터 아래 깔기).

## 9. `window.__v2` (검사용)

`{ id:'g', ready, error, hero{…}, enemies[{id,kind,x,y,z,hp,state,active,yard,model,clip,drawn,group,solid,alpha,tele}], shots[], cam{…}, section(실제 지역에서는 영웅 발밑의 구역), area, people[{id,model,x,y,z,on,drawn,clip,solid}], prompt({id,label,person}｜null), exits[{id,to,locked,x0,x1,z0,z1}], use()(지금 뜬 알약을 쓴다), stats{frameMs, gl{…,canvas}, world{…}, chars{…}, fx{…}, res{…}, area, people{n,drawn,spots}, anchors{n,live,lit}, mode, hud, resK, everyFrame, perfSaved, loadMs, canvases, assets[]}, teleport(section), project(x,y,z), loseContext(), scene }`

- `stats.assets` = 이 장면이 실제로 받은 `assets/v2/` 파일 목록(배포 목록용). 인터페이스 그림(`assets/v2/ui/gem/atlas.webp`)과 초상(`assets/v2/portraits/<id>.webp`)은 UI 모듈이 받아서 이 목록에 없다.
- 검사:
  - `node tools/v2/game_check.mjs [--devices fold_open,phone2] [--quick 1] [--only …]` — 시범 구간(`area=slice0`)에서 장면 전체. 터치 단계는 **새 단추**를 누른다(자리는 `scene.hud.metrics().pad.buttons`). 마지막 단계는 `v2ui=0`(내장 HUD + 옛 단추)과 일시정지 줄로 오가는 길.
  - `node tools/v2/game_walk.mjs [--devices fold_open,phone2] [--verbose 1]` — 실제 지역: 에슈빌 첫 자리 → 광장 정리(지역이 `gate_open` 상태로 다시 지어진다) → 묘지 문 → 안개의 묘지 → 채찍 고리 곁에서 솜씨 단추 → 납골당 앞 단(잠긴 문 알림)까지 새 단추로 걷고 싸운다 + 사람 알약 · 대화.
  - `node tools/v2/game_assets.mjs` — 모든 지역을 한 번씩 열고 사람마다 대화 창을 띄워, 장면이 실제로 받은 `assets/v2/` 파일을 모두 적는다(배포 목록 `tools/deploy/v2_ship.txt` 용; 404 는 따로).
  - `node tools/v2/game_spots.mjs [--areas …]` — 자리마다 그리기 호출 · 삼각형 · 메모리. `node tools/v2/game_owner.mjs` — 소유자 그림용 연출 캡처. `node tools/v2/game_probe.mjs` — 빨리 열어 보기. `tools/v2/game_bot.mjs` — 검사들이 같이 쓰는 봇.

## 10. 아직 안 된 것 · 알아 둘 것

- **이야기는 아직 꽂히지 않았다**(§11). 지금은 임시 규칙으로 돈다: 사람마다 한 줄, 마당을 정리하면 열쇠 문이 열림, 종 곁에서 길게 울리면 쌍둥이 지역으로 건넘, 잠긴 문 알림.
- 음악(`area.music`)은 아직 틀지 않는다. 저장도 없다 — 쓰러지면 규칙(`Sim`)이 그 지역의 처음으로 되돌린다(적도 다시 선다; 연 문은 열린 채).
- 쉬는 자리는 임시 규칙에서 체력을 채운다(§3.1). 보스(`sim.bossState()` → `state.boss`) · 세라의 빛(`sim.lights`) · 고리를 밝게 그리기 · 채찍 모형(`src/v2/whip`, docs/v2/WHIP.md §7 — 지금은 임시 칼 + 빛 줄)은 아직 붙이지 않았다.
- 사람의 `pose: 'work'` 는 서 있는 자세다(맞는 클립이 없다). `cower` 는 무릎 꿇은 자세.
- 영웅 칼은 아직 상자로 만든 임시 칼(`blade`)이다. 적 무기는 모델.
- 캐릭터 모델이 무겁다(§7) — LOD 가 오면 `cast.js` 에서 거리로 바꿔 그린다.
- 캐릭터 그림자는 둥근 얼룩이다. 세계의 빛은 꼭짓점에 구운 것이고, 효과의 빛(불 · 탄 · 타격)은 캐릭터와 바닥 빛 웅덩이로만 비친다.
- 스테이지의 정적 불꽃 메시(`mesh:'fire'`)는 그대로 그려진다 — 그 위에 입자 불이 탄다. 납작해 보이는 잎 모양은 PROPS 구역에 알렸다.
- WebGL1 만 되는 기기: 효과 엔진이 없어 세계 · 캐릭터 · 소리만 나온다(불 · 안개 입자도 없다).
- 묘지처럼 카메라와 놀이터 사이에 키 큰 소품이 있는 곳에서는 소품이 카메라 가까운 면에 잘려 보일 수 있다(WORLD 의 배치).
- `tools/v2/p0_entry_check.mjs` 는 새 일시정지 흐름으로 고쳤다(터치: 새 단추의 「멈춤」 → 일시정지 판 → 「나가기」 줄 / 키보드: Esc → 판 → Esc 로 이어 하기, 다시 Esc → ↓ 로 「나가기」 → Enter).
- 지역을 깃발로 다시 지을 때(§3) 화면이 한 번 어두워졌다 밝아진다(0.3초 + 불러오기). 문짝만 바꿔 끼우는 길은 없다 — 정적 메시가 조각으로 구워져 있어서다.

## 11. 통합 B(이야기)가 꽂는 자리 — 요약

1. `import { STORY, createStory } from '../data/index.js'; const st = createStory(STORY, { warn }); scene.setStory(st.story, { flag: (n) => st.flag(n) });` — `game.go('v2g', { story })` 로 넘겨도 된다. 꽂는 순간 임시 규칙(§10 첫 줄)은 모두 꺼진다.
2. 받는 사건: §6 의 목록. 사람에게 말 걸기 = `talk {id, talk}`, 자리 = `interact {id, kind, event, data, locked}`, 묶음 정리 = `group.clear {group}`, 메아리 = `bell.echo`, 길게 = `bell.long {spot, twin}`, 잠긴 문 = `exit.locked` / `exit.missing`, 지역 = `area.enter {area, era}`.
3. 깃발: 이야기의 깃발이 바뀔 때마다 `api.setFlags({ gate_open: true, … })`(지역을 짓는 깃발만 — `AREA_FLAGS`; 다른 이름을 넘겨도 해롭지 않다). 지금 선 지역이 그 깃발로 달라지면 그 자리에서 다시 지어진다.
4. 부르는 것: 대사 `scene.hud.showDialog({speaker, portrait, side, text, choices, onDone, onChoice})`(초상은 `assets/v2/portraits/<id>.webp`), 알림 `api.toast(text, kind)`, 띠 `scene.hud.banner(kind, title, sub)`, 문 `api.unlockExit(id, area)` · `lockExit`, 사람 `api.hideActor(id)` · `showActor(id)`, 건넘 `api.bellCross()`(어두워짐 → 쌍둥이 지역 같은 자리 → 「오늘 밤이 달라졌다」), 입력 잠금 `api.lock(on)`, 묶음 깨우기 `api.wakeGroup(group)` · 남은 수 `api.groupLeft(group)`, 지역 `api.gotoArea(id, spawn)`.
5. 말하는 동안 그 사람이 `talk1` 을 틀게 하려면 `scene.people.talking = scene.people.byId(id)`(대화 창이 닫히면 장면이 지운다). 장면이 `talk` 사건을 올릴 때는 이미 그렇게 해 둔다.
6. 아직 없는 `api`(§6)는 통합 B 가 `src/v2/game/index.js` 의 `emit()` 안 `_sapi` 에 더한다 — HUD 쪽 자리는 `state.candles · resonance · moon · boss · prompts` 와 `hud.banner · toast` 가 이미 받는다.

## 12. 이야기 · 저장 · 건넘 (다섯째 판, INTEGRATE-B2)

코드: `src/v2/game/storyhost.js`(이야기 주인 `StoryHost` · 저장 읽고 쓰기) + `src/v2/game/index.js` 의 `STORY HOOK` 표시 자리. 검사: `node tools/v2/game_story.mjs --plan boot|first15|saves|cross30|edges`.

### 12.1 이야기 꽂기
- `seams.js` `STORY_LOADER = () => import('../data/index.js')`. 장면은 들어올 때 `_boot()` 에서 이야기와 `AREA_FLAGS` 를 받아 `StoryHost` 를 만들고(`scene.host`), `scene.story = host.story`, 사람의 `when` 은 `host.flag(name)` 에 묻는다. 이야기를 못 받으면 경고 한 줄 뒤 이야기 없이 돈다(임시 규칙 §10).
- **켜지는 때**: 주소에 `area=` 가 없을 때(= 「본 게임」), 또는 `v2story=1`. `v2story=0` 이면 꺼진다. `game.go('v2g', { story })` 로 다른 이야기 함수를 주면 그것을 쓴다(주인 없음). `game.go('v2g', { fresh: true })` = 저장을 읽지 않고 새로.
- `host.api` = DATA_FORMAT §5 의 함수 전부: `showDialog`(HUD 대화 창, 닫히면 다음 쪽) · `banner` · `toast` · `lock`(주인의 잠금 — 장면의 여행 잠금과 따로) · `gotoArea`(`scene.travelTo`) · `bellCross`(`scene.cross`) · `sound`(feel 사건 이름이 있을 때만) · `fx` · `music`(v1 곡으로 잇는 표 `MUSIC`) · `wakeGroup` · `groupLeft` · `unlockExit` · `lockExit` · `hideActor` · `showActor`(`scene.setActor(id, area, v)`) · `prompt`(아래 가운데 알약 하나, 20초) · `objective`(`state.objective`) · `onFlag`(지역을 짓는 깃발이면 장면에 넘김) · `onItem` · `moveActor`(초당 130 으로 걸어간다) · `camera`(`SHOTS` 표: 구역 카메라의 기울기 · 거리 · 높이를 그 값으로, 그동안 입력 잠금) · `wait` · `candle` · `moon`(`state.moon`) · `ring` · `chronicle`(알림 한 줄) · `save` · `end`(띠 → 6초 뒤 저장하고 나감). `spawn` 은 규칙에 없어 경고만 한다.
- **깃발 → 지역**: `FLAGS` 에서 `world: true` 인 것과 `AREA_FLAGS` 에 있으면서 이야기가 선언한 이름만 `scene.worldFlags` 로 넘긴다(이야기에 없는 `past_street_clear` 는 넘기지 않는다 → 그 밤의 에드문트는 `street_clear` 로 선다). 지금 선 지역을 짓는 깃발이 바뀌면 이야기 장면이 끝난 뒤(`st.busy` 가 아니고 대화가 닫힌 뒤) 그 자리에서 다시 짓는다(`scene.rebuildArea()` — 다시 지은 것은 `area.enter` 를 올리지 않는다).
- **올리는 사건**(§6 에 더해): `interact` 는 잠긴 자리도, 종 앞에서 「종」을 길게 누른 것도(`ring: true`) 올린다 · `boss.phase {boss, phase: 'kneel'｜'flee'｜'driven'｜'sent'｜'down'}`(규칙의 kneel · bossFlee · bossReturn · bossDown 에서) · `boss.down {boss, knelled}`.
- **임시 줄이 물러나는 법**: 사람의 `talk` 열쇠가 이야기에 있으면(`host.hasTalk`) 진짜 대사, 없으면 그 사람의 임시 한 줄(`people.js` `LINES`). 누르는 자리 · 잠긴 문은 듣는 장면이 하나도 없을 때만(`host.hears(name, data)`) 장면이 이름표 알림을 띄운다.
- **이야기가 영웅을 붙드는 동안**(대화 창 · 카메라 컷 · 건넘) 영웅은 다치지 않는다: 장면이 규칙의 무적 시간(`hero.ifr`)을 0.4초로 채워 둔다(깜빡임은 끈다). 적은 멈추지 않는다 — 다가와 휘두를 수는 있다.
- 지역마다의 곡: `area.music`(`village_burning · village_past · graveyard_mist · ossuary_now · ossuary_past`)을 들어설 때 v1 곡으로 튼다(`storyhost.js` `MUSIC` 표; 빌드에 없는 곡은 `audio.music` 이 건너뛴다). 장면을 떠나면 멈춘다.
- `host.seen` = 플레이어가 본 것의 차례(`['banner'｜'line'｜'notice'｜'objective'｜'prompt'｜'choice'｜'goto'｜'cross'｜'end', a, b]`, 4000개까지) — 검사 도구가 읽는다. `host.warnings` = 실행기의 경고.

### 12.2 저장 (`localStorage['bn.v2.save']`)
- 모양: `{ v: 1, t, why, story: storyObj.save(), area, era, spawn, pos: {x, z, y, face}｜null, hp｜null, reso, nights: { <areaId>: { dead: [...], done } } }`.
- **쓰는 때**: 이야기의 `save` 단계(`why: 'story'`), 장면을 떠날 때(`exit()` — 일시정지의 「나가기」 포함, `why: 'leave'`), 화면이 가려질 때(`visibilitychange`, `why: 'hidden'`). 시험 길(`slice0`)과 끝난 뒤에는 쓰지 않는다. 이야기 장면이 도는 중이면 `story` 는 그 장면이 시작되기 전 모습이다(DATA_FORMAT §10).
- **읽는 때**: 들어올 때. 깨졌거나 판이 다르거나 이야기 상태에 지역이 없으면 버리고 새 게임. 영웅은 **이야기의 지역**에 선다: 저장의 `area` 가 이야기의 지역과 같으면 `pos` 자리, 다르면(지역을 옮기던 중에 끊김) 이야기의 `spawn`. 체력 · 울림 · 밤마다의 기억도 돌아온다.
- **끊긴 장면이 다시 나오게**: 이야기 장면이 도는 중에 저장되면 그 장면은 불러온 뒤 처음부터 다시 나와야 한다. 그래서 ① 울린 트리거는 저장하지 않는다(불러오면 다시 울린다 — 끝난 장면은 실행기가 무시), ② 불러온 첫 지역에서 이미 다 쓰러진 묶음은 `group.clear {group, again: true}` 를, 쓰러진 보스는 `boss.phase {phase: 'sent', again: true}` 를 한 번 다시 올린다(`_raiseCleared`).
- **처음부터**: 일시정지 판의 「처음부터 다시」 → 확인(새 인터페이스: 「그만둔다 / 처음부터」 고르기, 기본은 그만둔다; 옛 HUD: 6초 안에 한 번 더 고르기) → `scene.restart()` 가 저장 · 이야기 · 밤의 기억 · 문 · 깃발을 지우고 첫 지역을 연다.
- 촛불: 이야기의 촛불 수(처음 3, `candle +1` 마다 하나) = `state.candles.max`, 영웅의 최대 체력 = `TUNE.heroHp × 촛불 / 3`(`scene.applyCandles()`). `candle 0` = 가득 + 눌린 쉼터가 다시 일어서는 자리.

### 12.3 건넘 (`scene.cross(opts)` — 이야기의 `bellCross`)
- 되는 때: 쌍둥이 지역이 있고(`area.twin` 또는 `opts.to`), 영웅이 살아 있고, 여행 · 건넘 중이 아니고, 대화 · 일시정지가 닫혀 있을 때. 아니면 `false`(아무것도 바뀌지 않는다; 이야기 쪽은 「종이 둔하게 울린다」).
- 차례: ① 그 순간 — 종의 빛(`holy.bell`) · 종소리와 떨림(`feel.play('bell.toll')`) · 느린 시간 0.8초 · 화면 당김, 옅은 장막이 0.7초 동안 오른다(1697 쪽은 따뜻한 빛, 오늘 밤 쪽은 찬 빛). ② 장막 뒤에서 쌍둥이를 먼저 짓고(`loadArea`), 같은 `x, z` 에 설 수 없으면 `nearestFreeSpot` 자리로 옮긴다. 가까이에 바닥이 없으면 **아무것도 버리지 않고** 거절한다(둔한 종 알림 + 기다리던 이야기 장면을 풀어 주는 `area.enter {refused: true}`). ③ 옛 지역을 버리고 새 지역을 데운다(`_warm`). ④ 건너편: 장막이 1.1초 동안 HUD **아래에서** 걷힌다 — 밤 표시가 먼저 바뀌어 보이고, 밤 띠(「1697 · 그 밤」/「1797 · 오늘 밤」; `years: true` 면 이야기의 「오늘 밤이 달라졌다」), 두 번째 종소리와 빛.
- **밤마다의 기억** `scene.nights`: 지역을 떠날 때 쓰러진 적(`kind@집 자리`) · 마당 끝남 · 울린 트리거를 적어 두고, 다시 오면 되살린다(같은 지역을 다시 지을 때와 같다). 이야기가 꽂혀 있으면 체력 · 울림은 영웅과 함께 건넌다. 저장에 들어간다(§12.2).
- 그 밤에 바꾼 것이 오늘 밤에 보이는 길: 이야기 깃발 → `scene.worldFlags` → 쌍둥이를 그 깃발로 짓는다(`AREAS[id](flags)`).
- 이야기 없이: 예전처럼 종 곁에서 길게 울리면 어두워졌다가 쌍둥이의 같은 자리(이제 `nearestFreeSpot` 을 거치지 않는 옛 길 그대로).
- 새 장면 함수: `travelTo(id, spawn)` · `cross(opts)` · `rebuildArea()` · `setActor(id, area, 'hide'｜'show')` · `nightsOut()` / `nightsIn(obj)` · `applyCandles()` · `restart()`. 새 상태: `state.objective`(구역 이름 아래 금빛 한 줄 — UI_API), `scene.xing`(건너는 중), `scene.veil`(장막 색).

