# ENGINE_API — 본 게임 장면 `v2g` 의 규약 (ENGINE 구역)

2026-11-17 · 둘째 판 (돌려 보고 맞춘 것). 장면 코드는 `src/v2/game/`, 열기 `index.html?scene=v2g`(고르기 화면 첫 줄), 검사 `node tools/v2/game_check.mjs`.
이 문서는 다른 구역(PLAY · WORLD · UI · STORY)이 **이 문서만 보고** 맞출 수 있게 적는다. 바꾸면 아래 "바뀐 것"에 한 줄.

## 바뀐 것
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
  area.js     지역 불러오기 이음매 (지금: 환경 키트 시범 구간 / 다음: src/v2/world 의 AREAS)
  magic.js    적의 탄 = 입체 마법 효과 (빛 띠 꼬리 · 빛 덩이 · 움직이는 빛 · 떨어지는 입자 · 터짐) — 규칙의 탄을 따라다닌다
  hud.js      내장 최소 HUD (체력 · 구역 이름) — UI 구역의 src/v2/ui 가 오면 그쪽으로 바뀐다
  perf.js     localStorage['bn.v2.perf'] 읽기
  seams.js    다른 구역을 꽂는 스위치 두 줄: WORLD_LOADER · UI_LOADER (파일이 생기면 null 을 `() => import('../world/index.js')` 처럼 바꾼다)
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
- drive 는 틱마다 한 번, **화면 안의 개체만** 불린다(멀리 있는 적은 애니메이션을 건너뛴다). 방향은 drive 가 정한다(장면은 `ch.dx, ch.dz` 를 그린다).
- **돌기(영웅)**: drive 가 낸 방향을 장면이 한 번 다듬는다 — 한 틱에 도는 각을 묶고(달릴 때 15 rad/s ≈ 뒤로 돌기 0.21초, 공격·구르기·피격 중 34 rad/s ≈ 0.09초: 몸이 판정 상자를 따라가야 하므로), 115° 넘게 도는 동안은 도는 쪽을 0.2초 붙든다(스틱이 정반대 근처에서 떨려도 몸이 왔다 갔다 하지 않는다). drive 가 이미 이보다 느리게 돌리면 아무 일도 하지 않는다. `sim.hero.dirX/dirZ` 가 "가려는 방향"으로 읽힌다.
- 적은 `e.dirX` 가 없으면(옛 규칙) 깨어 있는 동안 영웅 쪽을 보게 장면이 돌린다.

## 3. 지역 (WORLD ↔ ENGINE)

- `src/v2/game/area.js` `loadArea(id)` → `{ id, name, era, twin, W, def, rooms, room, music, spawns, exits, triggers, interact, actors, anchors, flatProps, fromWorld }`.
  - 지금: `id = 'slice0'` → `compileEnv(src/v2/env/stage_slice0_env.js)` (시범 구간: 거리 → 모퉁이 → 골목 → 마당).
  - 다음: `src/v2/game/seams.js` 의 `WORLD_LOADER` 를 `() => import('../world/index.js')` 로 바꾸면 `AREAS[id]()`(`docs/v2/AREA_FORMAT.md`)를 받아 `compileEnv(area.stage)` 에 넣는다. 모르는 id · 불러오기 실패는 경고를 남기고 시범 구간으로 돈다. 열기: `game.go('v2g', { area: 'eshville_now', spawn: 'default' })`.
  - `area.js` 가 `spawns.default → stage.start`, `enemies → stage.spawns`(비어 있을 때만), `camera[section.id] → section.cam` 을 채운다(WORLD 불러오기가 이미 했으면 같은 값).
- `W` 는 `compileEnv` 결과 그대로다(`boxes · sections · spawns · lights · fog · light · sky · env{meshes, bounds, decals, fx}`). 텍스처 이름 → 파일: v1 타일 5종(`flag block brick wood dirt`) 아니면 `KIT_TEX[n].file` 이 있으면 `assets/v2/<file>`, 없으면 `assets/v2/env/<n>.webp`.
- **납작한 그림판은 그리지 않는다**: `W.sprites` 의 `kind:'prop'`(시범 구간의 천사상 2 · 가고일 2)은 이 장면에서 빠진다(충돌 상자는 남는다). 입체 석상은 `W.env` 의 메시로 넣어 달라.
- 들어오는 자리: `spawns[name] = {x, z, face:[dx,dz], y?}` → 영웅을 그 자리 땅 위에 세우고 `face` 를 보게 한다. 이름이 없으면 `stage.start`. (시범 구간은 구역 id 로 `sim.teleport` 한다.)
- 나가는 곳: 영웅의 발이 `exits[i]` 상자에 들어서면 — `locked` 가 없고 `AREAS[to]` 가 있으면 `scene.gotoArea(to, spawn)`(사건 `exit`), 지역이 아직 없으면 `label` 을 알림으로만 띄운다(사건 `exit.missing`), `locked` 면 사건 `exit.locked {id, locked}` 를 들어설 때마다 한 번.
- 사건 상자: `triggers[i]` 에 처음 들어서면 사건 `trigger {id, event, data, trigger}`. `wake: group` 이면 그 묶음의 적을 깨운다(`scene.wakeGroup(group)` — 적의 `group` 은 `e.group`, 없으면 `W.spawns` 와 같은 순서로 본다). `once: false` 면 나갔다 들어올 때마다.
- 방 울림: `area.rooms[sectionId]` > `section.room` > `area.room` > 내장 표. 소리 모듈이 아는 방은 `street · alley · courtyard · hall` — `crypt · tower` 는 `hall`, `field` 는 `street` 로 낸다.
- 넘어가기: `scene.gotoArea(id, spawnName)` — 옛 지역의 정적 메시를 버리고 → 새 지역을 받아 데운 뒤 → 연다(영웅 모델 · 효과 · 이미 받은 텍스처는 그대로 쓴다). 그동안 HUD 는 `state.loading`.
- **아직 안 하는 것**: `interact`(종 · 문 · 표지판 … 누르는 자리) · `actors`(사람들) · `anchors`(불 · 연기) — 값은 `scene.area` 에 그대로 들고 있다(§10).

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
| `dialog` | (STORY·UI 용 빈자리) 장면이 `scene.ui.dialog = {…}` 를 그대로 넘긴다 |

- 그리기 순서: WebGL(세계 · 캐릭터 · 효과) → 그 위에 게임 캔버스(HUD) → v1 의 토스트 · 번쩍임 · 페이드 · 가상 패드. **HUD 용 캔버스를 따로 만들지 않는다.**
- 입력은 지금 v1 가상 패드(이동 스틱 · 공격 · 점프 · 구르기)다. 장면이 읽는 동작 이름: `attack · jump · dash · guard · lock · menu`(`menu` = 고르기 화면으로 나가기). v1 패드의 꾸밈 그림은 값싸게 바꿀 스위치가 없어 그대로 둔다 — UI 의 `hud.hidePad` 가 오면 통째로 숨는다.
- **UI 모듈은 이미 꽂혀 있다 — 다만 기본은 내장 HUD 다.** `src/v2/game/seams.js`: `UI_LOADER = () => import('../ui/index.js')`, `UI_DEFAULT = false`. 켜 보기: 주소 `?scene=v2g&v2ui=1` 또는 `localStorage['bn.v2.ui'] = '1'`(끄기 `'0'`). UI 구역이 "됐다"고 하면 `UI_DEFAULT = true` 한 줄. 그 모듈의 `createHud(game)` 가 내장 HUD 를 대신하고, **불러오기에 실패하거나 `update`/`draw` 가 예외를 던지면 경고 한 줄을 남기고 내장 HUD 와 v1 패드로 돌아간다**(놀이는 멈추지 않는다). `__v2.stats.hud` = `'ui'｜'builtin'`.

## 5. 입력 → `sim.update(dt, inp)`

`inp = { mx, mz, jump, jumpHeld, attack, attackHeld, dash, guard, lockNext, jumpUsed }` — 장면이 한 객체를 다시 쓴다. `guard` = `guard` 동작 **또는 구르기 단추(`dash`)를 누르고 있는 동안**(PLAY_API §1: 같은 단추에서 구르기와 막기). `attack · dash · lockNext` 는 눌린 틱에 켜지고, 타격 멈춤으로 규칙이 쉬는 동안에는 다음 규칙 틱까지 남는다(입력을 삼키지 않는다). `mx, mz` 는 −1..1, 터치 스틱은 8방향에 붙이지 않은 360° 값. `Sim` 이 `inp.jumpUsed = true` 로 돌려주면 점프 입력 버퍼를 비운다.

## 6. 이야기 · 사건 (STORY ↔ ENGINE)

장면은 사건이 날 때 함수 하나를 부른다: `story(name, data, api)`.

- 꽂는 법: `game.go('v2g', { area, story })` 또는 `scene.setStory(fn)`. 없으면 아무 일도 없다.
- 사건 이름: `area.enter {area}` · `section.enter {id, from}` · `enemy.kill {enemy}` · `area.clear {area}` · `hero.dead {}` · `hero.respawn {}` · `trigger {id, event, data, trigger}`(지역의 `triggers` 상자에 들어섬) · `exit {id, to, spawn}` · `exit.locked {id, locked, exit}` · `exit.missing {id, to}` · 그리고 PLAY 의 모든 사건이 `play.<name>` 으로(`data` = `[a, b, c, d]` — 예: `play.parry`, `play.lock`).
- `api`: `{ scene, sim, lock(on)`(영웅 입력 잠금) `, toast(text), teleport(sectionId), gotoArea(id, spawn), fx(name, o), sound(name, pos), setDialog(obj｜null) }`. 그 밖에 `scene.wakeGroup(group)` · `scene.hud`(UI 의 `banner · toast · showDialog …`) · `scene.area`.
- 이야기 함수가 예외를 던지면 콘솔에 남기고 놀이는 계속된다.

## 7. 성능 약속과 잰 값

- `localStorage['bn.v2.perf']`(`{v:1, present, resK, cap, chars, hz}`)를 읽는다. `resK` 는 들어올 때 한 번 정하고 **놀이 중에는 바꾸지 않는다**. `cap: 60` 이면 틱이 돈 프레임만 그린다(보간 끔). 주소 옵션: `?v2res=0.75` · `?v2cap=60` · `?v2post=1`(번짐 켜기 — 기본은 끔) · `?v2tier=low|mid|high`(효과 양) · `?v2tex=512`(캐릭터 텍스처 상한) · `?v2ui=1` · `?v2dbg=1`(아래 가운데 숫자 줄).
- 겹치기: 게임 캔버스가 alpha 로 만들어졌으면(부팅 때 깃발 — §8) WebGL 캔버스를 **그 아래**에 깐다(`mode: 'under'` — 화면 전체 복사 없음, HUD 덧캔버스 없음). 아니면(그 깃발이 아직 없는 첫 실행) 시범판 B 의 층 방식(`'layer'`: GL 캔버스 + 투명 HUD 캔버스를 위에)으로 돈다 — 이때 v1 의 페이드 · 번쩍임은 가려져 안 보인다.
- 틱은 60 Hz, 그리기는 화면이 갱신될 때마다: 영웅 · 적 · 탄 · 카메라를 직전 틱과 지금 틱 사이에서 보간한다(`game.alpha`). 자세(뼈)는 틱마다 한 번만 계산한다.
- 불러오기 화면 뒤에서 세계 · 모든 캐릭터 모델(분해 · 반투명 경로까지) · 무기 · 효과 프리셋 14종 · 탄 터짐 · 칼 궤적을 한 번 그리고 `gl.readPixels` 로 끝까지 기다린 뒤 시작한다(지역을 옮길 때도).
- 캐릭터: 종류마다 GPU 모델 1개, 개체마다 뼈대 1벌(다 쓴 것은 풀에 돌려놓는다). 화면 밖 · 안개 너머는 애니메이션도 그리기도 건너뛴다. 구르기 잔상은 영웅을 다시 그리지 않는다(빛 띠 1줄). 캐릭터 텍스처는 1024² 로 줄여 올리고 원본 비트맵은 버린다.
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
- 캐릭터 모델이 무겁다: 영웅 19.6천 삼각형, 해골 병사·마법사도 각 1만 7천 안팎 → 적 다섯이 화면에 들어오면 캐릭터만 10만 삼각형을 넘는다. 화면 밖 건너뛰기로 줄였지만 **모델을 가볍게(LOD) 하는 일이 폴드에서 가장 큰 숙제**다(§7 숫자).
- 캐릭터 그림자는 둥근 얼룩이다(모델 모양 그림자 아님). 세계의 빛은 꼭짓점에 구운 것이고, 효과의 빛은 캐릭터(정점당 4개)와 바닥 빛 웅덩이로만 비친다.
- WebGL1 만 되는 기기: 효과 엔진이 없어 세계·캐릭터와 소리만 나온다(탄은 빛 덩이 둘로 그린다).
- v1 가상 패드 그림은 그대로다(값싼 스킨 스위치가 없다).
