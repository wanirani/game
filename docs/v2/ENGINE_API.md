# ENGINE_API — 본 게임 장면 `v2g` 의 규약 (ENGINE 구역)

2026-11-18 · 셋째 판 (실제 지역 · 사람 · 새 인터페이스 기본값 · 그리는 해상도). 장면 코드는 `src/v2/game/`, 열기 `index.html?scene=v2g`(고르기 화면 첫 줄 = 에슈빌 오늘 밤), 검사 `node tools/v2/game_check.mjs`(시범 구간) · `node tools/v2/game_walk.mjs`(실제 지역을 새 단추로 걷기).
이 문서는 다른 구역(PLAY · WORLD · UI · STORY)이 **이 문서만 보고** 맞출 수 있게 적는다. 바꾸면 아래 "바뀐 것"에 한 줄.

## 바뀐 것
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
- `api`: `{ scene, sim, lock(on), toast(text, kind), teleport(sectionId), gotoArea(id, spawn, {keepPosition}), fx(name, o), sound(name, pos), setDialog(obj｜null), unlockExit(id, area), lockExit(id, area, key), hideActor(id), showActor(id), wakeGroup(group), groupLeft(group), bellCross() }`. 그 밖에 `scene.hud`(`banner · toast · showDialog · callout …`) · `scene.area` · `scene.people`(`byId(id)` · `talking`) · `scene.flags`(내장 깃발 Set).
- **아직 없는 `api`(DATA_FORMAT §6 이 바라는 것)**: `prompt · objective · camera · wait · music · candle · moon · ring · save · chronicle · end · spawn · moveActor · onFlag · onItem` — 이야기 실행기는 없는 것을 경고 한 줄로 건너뛴다. `boss.phase` 사건도 아직 없다(보스 규칙이 오면).
- 이야기 함수가 예외를 던지면 콘솔에 남기고 놀이는 계속된다.

## 7. 성능 약속과 잰 값

- `localStorage['bn.v2.perf']`(`{v:1, present, resK, cap, chars, hz}`)를 읽는다. `resK` 는 들어올 때 한 번 정하고 **놀이 중에는 바꾸지 않는다**. `cap: 60` 이면 틱이 돈 프레임만 그린다(보간 끔). 주소 옵션: `?v2res=0.75` · `?v2cap=60` · `?v2post=1`(번짐 켜기 — 기본은 끔) · `?v2tier=low|mid|high`(효과 양) · `?v2tex=512`(캐릭터 텍스처 상한) · `?v2ui=1` · `?v2dbg=1`(아래 가운데 숫자 줄).
- 겹치기: 게임 캔버스가 alpha 로 만들어졌으면(부팅 때 깃발 — §8) WebGL 캔버스를 **그 아래**에 깐다(`mode: 'under'` — 화면 전체 복사 없음, HUD 덧캔버스 없음). 아니면(그 깃발이 아직 없는 첫 실행) 시범판 B 의 층 방식(`'layer'`: GL 캔버스 + 투명 HUD 캔버스를 위에)으로 돈다 — 이때 v1 의 페이드 · 번쩍임은 가려져 안 보인다.
- 틱은 60 Hz, 그리기는 화면이 갱신될 때마다: 영웅 · 적 · 탄 · 카메라를 직전 틱과 지금 틱 사이에서 보간한다(`game.alpha`). 자세(뼈)는 틱마다 한 번만 계산한다.
- 불러오기 화면 뒤에서 세계 · 모든 캐릭터 모델(분해 · 반투명 경로까지) · 무기 · 효과 프리셋 14종 · 탄 터짐 · 칼 궤적을 한 번 그리고 `gl.readPixels` 로 끝까지 기다린 뒤 시작한다(지역을 옮길 때도).
- 캐릭터: 종류마다 GPU 모델 1개, 개체마다 뼈대 1벌(다 쓴 것은 풀에 돌려놓는다). 화면 밖 · 안개 너머는 애니메이션도 그리기도 건너뛴다. **화면 안이라도 멀면 자세를 덜 자주 계산한다**: 카메라가 보는 자리에서 900 px 넘으면 2틱에 한 번, 1,700 px 넘으면 4틱에 한 번(`driveActor` 에는 쌓인 dt 가 간다). 방금 맞았거나 공격·주문 중이거나 쓰러지는 적은 늘 매 틱. 구르기 잔상은 영웅을 다시 그리지 않는다(빛 띠 1줄). 캐릭터 텍스처는 1024² 로 줄여 올리고 원본 비트맵은 버린다.
- 틱 · 그리기 경로에서 장면 코드는 새 객체 · 배열을 만들지 않는다(입력 · 상태 · 행렬 · 풀을 다시 쓴다). 남는 할당은 §10.

잰 값 (`node tools/v2/game_check.mjs`, 헤드리스 소프트웨어 렌더러 — **프레임 시간은 기기 값이 아니라 적지 않는다**; 개수 · 메모리는 기기에서도 같다):

| 구간에 서서 | 그리기 호출 | 삼각형 (세계 + 캐릭터) | 그린 캐릭터 / 건너뛴 캐릭터 |
|---|---|---|---|
| 거리 | 33 | 116,000 (27,000 + 89,000) | 6 / 11 |
| 모퉁이 · 골목 | 47 | 214,000 (27,000 + 187,000) | 13 / 4 |
| 계단 | 43 | 186,000 (27,000 + 159,000) | 11 / 6 |
| 뜰 · 마당 | 28–30 | 133,000–147,000 (16,000 + 117,000–131,000) | 8–9 / 8–9 |

- GPU 메모리: 텍스처 40.7 MB(세계 18.7 + 캐릭터 18.8 + 효과 3.2) · 정점 버퍼 4.0 MB. 효과는 그 위에 프레임당 그리기 호출 0–12.
- 모델: 카엘 19,578 삼각형 · 해골 병사 11,976 · 해골 술사 11,900 (뼈 24개씩). **삼각형의 80 % 이상이 캐릭터다** — 적 모델의 가벼운 판(LOD)이 오면 `cast.js` 에서 거리로 바꿔 그린다(requests.md engine 1).

## 8. v1 셸에 넣은 것 (`src/core/game.js`, 깃발이 없으면 v1 그대로)

- `Scene.everyFrame = true` → 화면이 갱신될 때마다 그린다. 그리기 직전 `game.alpha = acc / STEP`.
- `input.touchStick` (읽기 전용 getter) = 터치 스틱의 360° 값 `{x, y, mag, raw}`.
- `Scene.glUnder = true` 이고 `game.canvasAlpha` 면 검은 바탕 대신 `clearRect`. `game.canvasAlpha` 는 부팅 때 한 번 정한다: 주소가 `?scene=v2…` 이거나 `localStorage['bn.v2.under'] === '1'`(장면 `v2g` 가 처음 들어올 때 적어 둔다 → 다음 실행부터 아래 깔기).

## 9. `window.__v2` (검사용)

`{ id:'g', ready, error, hero{x,y,z,hp,facing,dirX,dirZ,anim,dead,onGround,face[dx,dz](그려진 방향),clip}, enemies[{id,kind,x,y,z,hp,state,active,yard,model,clip,drawn}], shots[], cam{x,y,z,yaw,pitch,dist}, section, area, stats{frameMs{p50,p95,n}, gl{api,renderer,draws,tris,texBytes,texMB,bufBytes,canvas,lost,restored}, world{tris,draws,chunks,texBytes,flatPropsDropped}, chars{draws,tris,drawn,culled,texBytes,bufBytes,models,weapons,clips,actors,heroClip}, fx{tier,post,bytes,lights}, mode, resK, everyFrame, perfSaved, loadMs, canvases, assets[]}, teleport(section), project(x,y,z), loseContext(), scene }`

- `stats.assets` = 이 장면이 실제로 받은 `assets/v2/` 파일 목록(배포 목록 `tools/deploy/v2_ship.txt` 용).
- 검사: `node tools/v2/game_check.mjs [--devices fold_open,phone2] [--quick 1] [--json 파일]` · 빨리 열어 보기: `node tools/v2/game_probe.mjs [--device phone2] [--q "v2dbg=1&v2res=0.75"] [--js "<페이지에서 돌릴 식>"]`. 캡처는 `/tmp/claude-0/v2/engine/`.

## 10. 아직 안 된 것 · 알아 둘 것

- **꽂는 스위치**(`seams.js`): `WORLD_LOADER` 는 꺼져 있다 — `src/v2/world/index.js` 가 저장소에 생기면 `() => import('../world/index.js')` 로 켠다(배포 빌드는 없는 파일을 가리키는 `import()` 에서 멈추므로 미리 켜 두지 않았다). `UI_LOADER` 는 켜져 있고 기본값만 내장 HUD 다(§4) — 그래서 **배포 빌드는 이제 `src/v2/ui/` 가 묶일 수 있어야 한다.**
- 지역의 `interact` · `actors`(사람) · `anchors`(불·연기 효과 자리) · 음악(`music`)은 아직 장면이 쓰지 않는다. 저장(`state·save`)도 없다 — 죽으면 규칙(`Sim`)이 처음으로 되돌린다.
- 영웅 칼은 아직 상자로 만든 임시 칼(`blade`)이다. 적 무기는 모델(`w_rusty_sword` · `w_crystal_staff`).
- 캐릭터 모델이 무겁다: 영웅 19,578 삼각형, 해골 병사 11,976 · 해골 술사 11,900 → 모퉁이에서 적 열셋이 화면에 들어오면 캐릭터만 18만 7천 삼각형(세계는 2만 7천). 화면 밖 건너뛰기와 먼 적의 자세 덜 계산하기로 CPU 는 줄였지만 그리는 삼각형은 그대로다 — **가벼운 판(LOD) 모델이 폴드에서 가장 큰 숙제**다(§7 숫자).
- 캐릭터 그림자는 둥근 얼룩이다(모델 모양 그림자 아님). 세계의 빛은 꼭짓점에 구운 것이고, 효과의 빛은 캐릭터(정점당 4개)와 바닥 빛 웅덩이로만 비친다.
- WebGL1 만 되는 기기: 효과 엔진이 없어 세계·캐릭터와 소리만 나온다(탄은 빛 덩이 둘로 그린다).
- v1 가상 패드 그림은 그대로다(값싼 스킨 스위치가 없다). 오른쪽 위의 v1 단추(전체 화면 · AUTO · 지도 · 가방 · 설정)도 남아 있다 — `padHideButtons` 로는 안 숨는다.
- **프레임마다 할당**: 가장 큰 원인을 찾아 없앴다 — `src/v2/char3d/skel.js` 의 `applyPose()` 가 부를 때마다(= 화면 안 캐릭터마다, 틱마다) 뼈마다 배열 조각 둘과 작은 배열들을 만들어 **1,552 바이트**를 썼다(데운 뒤 잰 값). `src/v2/game/anim.js` 의 `PoseAnimator` 는 같은 계산을 임시 객체 없이 한다(2,040 번 비교해 결과가 비트까지 같다; 5 바이트). 무기 행렬의 `boneWorld()` 조각도 한 번만 만든다. 고치기 전 잰 값: v1 셸(입력·패드)만 프레임당 2.4 KB, 장면을 얹으면 폴드 화면 3.2 KB · 휴대폰 화면(캐릭터 9이 보임) 18.6 KB. **고친 뒤에도 프레임 전체 값은 뚜렷이 내려가지 않았다**: 휴대폰 화면에서 서 있을 때 반복마다 2.5 · 18.9 · 29.8 · 3.8 · 33.3 KB, 마당 싸움 2.8 · 24.6 · 4.7 · 12.1 · 0.2 KB(셸만은 2.1–2.7 KB 로 고르다) — 반복 사이에 열 배씩 흔들려서 수집이 끼어든 값과 아닌 값이 섞인 것으로 보이며, 큰 쪽이 참값이면 프레임당 20–30 KB 를 만드는 곳이 아직 남아 있다. 함수별로 나눠 재는 일은 시간 안에 끝내지 못했다(다음 사람의 첫 일: `tools/v2/game_probe.mjs --js` 로 `sim.update` · `driveActor` · `scene._sync` · `scene._gl` · `hud.draw` 를 따로 잰다). 남은 것: v1 셸 자체의 2.4 KB(가상 패드·입력), 규칙 쪽의 작은 것들(`pick(…)` 의 인자 배열 등), HUD 글 한 줄마다의 글꼴 문자열, 타격 때의 숫자 문자열. 시범판 B · v2c · 뷰어는 여전히 char3d 의 `applyPose` 를 쓴다(requests.md engine 8).
- 다시 들어오기 3회 뒤 JS 힙은 55 → 63 MB 였다(GPU 바이트 · 캔버스 수는 같다). 타이틀 화면을 처음 연 몫이 섞여 있어 회당 증가량은 따로 재지 않았다.
- `interp`: 자세(뼈)와 보는 방향은 틱 값 그대로다(60 Hz). 120 Hz 화면에서 위치 · 카메라만 사이값으로 그린다.
