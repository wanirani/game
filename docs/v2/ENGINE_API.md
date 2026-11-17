# ENGINE_API — 본 게임 장면 `v2g` 의 규약 (ENGINE 구역)

2026-11-17 · 첫 판. 장면 코드는 `src/v2/game/`, 열기 `index.html?scene=v2g`(고르기 화면 첫 줄), 검사 `node tools/v2/game_check.mjs`.
이 문서는 다른 구역(PLAY · WORLD · UI · STORY)이 **이 문서만 보고** 맞출 수 있게 적는다. 바꾸면 아래 "바뀐 것"에 한 줄.

## 바뀐 것
- 15:25 첫 판 (자리·이름을 먼저 정함. 구현은 같은 날 따라온다 — 아직 안 된 것은 §9 에 적는다).

## 0. 한눈에

```
src/v2/game/
  index.js    장면 (Scene 하위 클래스, export default). 들어오기·나가기, 입력, 60 Hz 틱, 보간 그리기, 이음매(지역·HUD·사건), window.__v2
  glr.js      세계 그리기 (시범판 B 의 glr.js 를 옮겨 와 키운 것: 셰이더 1개, 정적 메시 + 동적 스티커)
  charr.js    캐릭터 그리기 (char3d/render.js 를 옮겨 와 키운 것: 맞음 번쩍임 · 재로 흩어짐 · 효과의 빛 받기 · 옵션 객체 재사용)
  cast.js     캐릭터 창고: 종류별 GPU 모델 1개(공유) + 개체마다 뼈대·애니메이터 1벌(Actor3D), 무기 소품과 쥐는 자세, 공용 클립 묶음 읽기
  animlib.js  공용 클립 라이브러리 읽기 (tools/v2/animlib_load.js 를 옮긴 것)
  area.js     지역 불러오기 이음매 (지금: 환경 키트 시범 구간 / 다음: src/v2/world 의 AREAS)
  hud.js      내장 최소 HUD (체력 · 구역 이름) — UI 구역의 src/v2/ui 가 오면 그쪽으로 바뀐다
  perf.js     localStorage['bn.v2.perf'] 읽기
```

놀이 규칙은 **`src/v2/play/index.js` 에서만** 가져온다: `Sim` · `TUNE` · `KINDS` · `driveHero` · `driveActor`.

## 1. 틱과 시간 — 누가 시간을 쥐는가

- 게임 루프는 60 Hz 고정 틱(`update(dt)`, dt = 1/60)이다. **그리기는 화면이 갱신될 때마다**(120 Hz 화면이면 120번) 하고, 틱 사이는 위치·카메라를 보간한다(`game.alpha` = 틱 사이 0..1).
- **타격 멈춤 · 느린 화면은 ENGINE 이 쥔다.** 값은 `src/v2/feel/table.js`(`feel.hit(…)` 이 돌려주는 `stop · shake · kick · zoom · slow`)에서만 나온다. 장면은 `fx.update(1/60)` 이 돌려준 놀이용 dt 로 `sim.update(dt, inp)` 를 부르고, 멈춤 중(dt = 0)에는 **부르지 않는다**.
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
| `dead` | true = 사라짐 (그리지 않는다). `state === 'dead'` 인 동안은 "쓰러지는 중" — 장면이 0.9초 동안 재로 흩는다 |
| `flashT` / `flash` | 맞은 직후 > 0 (적 0.13초 · 영웅 1 → 0). 장면은 맞은 순간만 쓰고 번쩍임 곡선은 `fx` 의 `hurtFlash` 를 쓴다 |
| `ifr, hurtT, dashT, move, moveT, combo, onGround, vy, landT` | 영웅: 깜박임 · 칼 궤적 · 잔상 · 먼지에 쓴다 (`move.hit[0..1]` = 판정 구간, `move.id`) |
| `stateT, state, active, yard` | 적: 예고 표시(공격 준비) · 마당 적 세기 |
| 탄 `sim.shots[]` | `x, y, z, vx, vz, dead, t` + 선택 `element`('fire'·'ice'·'lightning'·'holy'·'blood' — 없으면 'blood') |

장면이 개체에 **쓰는** 칸은 밑줄로 시작하는 것뿐이다(`_px,_py,_pz` 직전 틱 위치, `_a3` 그리기 개체, `_k` 종류 번호). PLAY 는 밑줄 칸을 건드리지 않는다.

### `new Sim(W, hooks)` — 장면이 주는 훅

시범판 B 의 훅을 그대로 받고(이름·인자 같음), 몇 개를 더 받는다. 모두 없어도 되는 선택 호출이다.

| 훅 | 장면이 하는 일 |
|---|---|
| `hit(e, dmg, mv, x, y, z)` | `feel.hit('sword', KINDS[e.kind].material, 세기, flags, e)` → 멈춤·흔들림·밀림·줌·느린 화면 + `fx` 타격 효과 + 피해 숫자. 세기: `mv.strength`('L'·'M'·'H'·'F')가 있으면 그것, 없으면 `mv.finisher`/`mv.id === 'sw3'` → 'H', 그 밖 'M' |
| `kill(e)` | 처치 효과(뼈 흩어짐 / 재) + 사건 `enemy.kill`. (같은 틱의 `hit` 에 `FLAG.kill` 을 얹으려고 장면이 `e.hp <= 0` 을 직접 본다) |
| `heroHurt(dmg, pit)` | `feel.play('hero.hurt')` + 가장자리 붉은 빛 + 흔들림 |
| `sfx(name)` | `'dash'`·`'jump'`·`'land'` → `feel.play('move.*')` + 먼지, `'slash'`(또는 `mv.sfx`) → `feel.swing('sword', …, hero)` + 휘두름 초승달, `'swing'` → 적 휘두름, `'cast'` → `enemy.mage.chant`, `'parry'` → `feel.parry`, `'die'` → 영웅 쓰러짐 |
| `spark(x, y, z, kind)` | `'dust'` 먼지 · `'shot'` 탄 터짐 · `'hit'` 불티 |
| `number(x, y, z, text, color)` | 피해 숫자 (HUD 가 그린다) |
| `shake(px)` | 흔들림 (px ÷ 40 을 trauma 로) |
| `done()` | 지역 정리 끝 → 사건 `area.clear` |
| **새로** `fx(name, x, y, z, dx, dz, pow, tx, ty, tz)` | `docs/v2/FX.md` §8 의 프리셋을 그대로 낸다 (마법 · 보호막 · 줍기 …). 이름이 없으면 무시 |
| **새로** `event(name, data)` | 이야기 사건을 올린다 (§6) |
| **새로** `sound(name, pos)` | `feel.play(name, pos)` (`docs/v2/SOUND_FEEL.md` §6 의 사건 이름) |

### `KINDS[kind]`

`{ model, weapon, height, material }` + 선택: `grip`(`{pos:[x,y,z], rotX, rotY, rotZ}` — 없으면 무기별 기본값: 검 `rotX:-80`, 지팡이 `rotX:100`, 삽창 `pos:[0,9,4]`), `scale`(기본 = 58 × height ÷ 모델 키), `death`(`'bone'`｜`'ash'`, 기본은 material 이 bone 이면 bone), `element`(탄의 원소), `float`(떠 있는 높이 px).
모델은 `assets/v2/char3d/<model>.glb`, 무기는 `assets/v2/char3d/<weapon>.glb`. **지역에 나오는 종류만** 받는다.

### `driveHero(ch, hero, dt, TUNE)` · `driveActor(ch, actor, dt)`

`ch` 는 장면의 `Actor3D`(char3d 의 `Char3D` 와 같은 공개 칸): `ch.dx, ch.dz`(그리는 방향 — drive 가 정한다), `ch.anim`(`Animator`: `play(name, {fade, time, speed, restart})` · `update(dt)` · `cur` · `t`), `ch.asset.clips`(이름 → 클립), `ch.rig`, 그리고 drive 가 마음대로 쓰는 칸(`kbT, kbSp, wasDead` …).

- **클립 묶음**: `ch.asset.clips` 에는 공용 라이브러리(`assets/v2/char3d/clips/`, 71개 — `docs/v2/ANIM_LIBRARY.md`)가 이름 그대로 들어 있다. 클립마다 `clip.meta`(`strike`·`ev`·`speed`·`travel`…)가 붙는다. 영웅 = 이동 · 전투 · 피격 · 마법, 적 = 이동 · 전투 · 피격 · 마법 · 적 묶음.
- 자리 채우기(시범판 B 의 `driveHero`)가 쓰이는 동안에는 영웅만 손으로 쓴 옛 클립이 같은 이름을 덮는다(`idle · run · atk1–3 · jump · land …`). PLAY 가 `driveHero` 를 바꾸면(= `src/v2/char3d/hero3d.js` 의 것과 다른 함수면) 라이브러리 클립이 이긴다. 손으로 쓴 것은 `hand_<이름>` 으로 남는다.
- 적의 옛 상태 이름을 위한 별칭: `attack` → `atk2_fore`, `cast` → `cast_quick`, `hurt` → `hit_light`, `death` → `death_back` (같은 이름의 클립이 이미 있으면 덮지 않는다).
- drive 는 틱마다 한 번, **화면 안의 개체만** 불린다(멀리 있는 적은 애니메이션을 건너뛴다). 방향은 drive 가 부드럽게 돌린다(장면은 `ch.dx, ch.dz` 를 그대로 그린다).

## 3. 지역 (WORLD ↔ ENGINE)

- `src/v2/game/area.js` `loadArea(id)` → `{ id, name, W, room, music, spawn, triggers, exits }`.
  - 지금: `id = 'slice0'` → `compileEnv(src/v2/env/stage_slice0_env.js)` (시범 구간: 거리 → 모퉁이 → 골목 → 마당).
  - 다음: `src/v2/world/index.js` 의 `AREAS[id]()` 가 `docs/v2/AREA_FORMAT.md` 모양을 돌려주면 `area.js` 가 그것을 `compileEnv` 에 넣는다. `src/v2/world` 가 없으면 조용히 시범 구간으로 돈다.
- `W` 는 `compileEnv` 결과 그대로다(`boxes · sections · spawns · lights · fog · light · sky · env{meshes, bounds, decals, fx}`).
- **납작한 그림판은 그리지 않는다**: `W.sprites` 의 `kind:'prop'`(천사상 · 가고일 등)은 이 장면에서 빠진다. 입체 석상은 `W.env` 의 메시로 넣어 달라. (충돌 상자는 그대로 남는다.)
- 구역(`W.sections[].id`)의 방 울림: `room` 칸이 없으면 `street → 'street'`, `corner·alley → 'alley'`, `yard → 'courtyard'`, 그 밖 `'street'`.
- 넘어가기: `scene.gotoArea(id, spawnId)` — 검게 닫고 → 옛 지역의 GPU 자원을 버리고 → 새 지역을 받아 데운 뒤 → 연다.

## 4. HUD (UI ↔ ENGINE)

장면은 HUD 객체 하나만 부른다. `src/v2/ui/index.js` 가 `createHud(game)` 을 내보내면 그것을, 없으면 내장 `hud.js` 를 쓴다.

```js
hud.update(dt, state)        // 틱마다
hud.draw(ctx, state)         // 그릴 때마다. ctx 는 논리 좌표(가로 state.viewW × 세로 state.viewH)로 맞춰 준 2D 컨텍스트. 바탕은 투명 — 지우지 말 것
hud.dispose?.()              // 장면을 떠날 때
hud.padHideButtons           // (선택) 숨길 v1 패드 단추 id 배열 · hud.hidePad = true 면 v1 가상 패드를 통째로 숨긴다 (UI 가 자기 단추를 그릴 때)
```

`state` (장면이 한 객체를 다시 쓴다 — 붙들어 두지 말고 그때그때 읽는다):

| 칸 | 뜻 |
|---|---|
| `viewW, viewH, safe{l,t,r,b}, scale` | 논리 화면 · 안전 영역 · 논리 px 당 기기 px |
| `time` | 지역에서 흐른 놀이 시간(초) |
| `hero` | `sim.hero` 그대로 (`hp`, `dead` …) · `heroHpMax` |
| `area{id, name}` · `section{id, label}` | 지금 지역 · 구역 |
| `enemies` | `sim.enemies` 그대로 · `enemiesLeft` · `yardLeft` |
| `numbers[]`, `numberN` | 피해 숫자 풀: `{x, y, z, str, color, t}` 의 앞 `numberN` 개가 살아 있다 |
| `project(x, y, z, out)` | 세계 점 → 논리 화면 `{x, y, w}` (w ≤ 1 이면 화면 뒤) |
| `done, doneT` | 지역 정리 끝 |
| `loading, message` | 불러오는 중 · 오류 글 |
| `debug` | 개발 정보 줄을 보일지 (`?v2dbg=1`) · `stats()` |
| `dialog` | (STORY·UI 용 빈자리) 장면이 `scene.ui.dialog = {…}` 를 그대로 넘긴다 |

- 그리기 순서: WebGL(세계 · 캐릭터 · 효과) → 그 위에 게임 캔버스(HUD) → v1 의 토스트 · 번쩍임 · 페이드 · 가상 패드. **HUD 용 캔버스를 따로 만들지 않는다.**
- 입력은 지금 v1 가상 패드(이동 스틱 · 공격 · 점프 · 구르기)다. 장면이 읽는 동작 이름: `attack · jump · dash · guard · lock · menu`.

## 5. 입력 → `sim.update(dt, inp)`

`inp = { mx, mz, jump, jumpHeld, attack, attackHeld, dash, guard, lockNext, jumpUsed }` — 장면이 한 객체를 다시 쓴다. `mx, mz` 는 −1..1, 터치 스틱은 8방향에 붙이지 않은 360° 값. `Sim` 이 `inp.jumpUsed = true` 로 돌려주면 점프 입력 버퍼를 비운다.

## 6. 이야기 · 사건 (STORY ↔ ENGINE)

장면은 사건이 날 때 함수 하나를 부른다: `story(name, data, api)`.

- 꽂는 법: `game.go('v2g', { area, story })` 또는 `scene.setStory(fn)`. 없으면 아무 일도 없다.
- 사건 이름: `area.enter {area}` · `section.enter {id, from}` · `enemy.kill {enemy}` · `area.clear {area}` · `hero.dead {}` · `hero.respawn {}` · `trigger {id}`(지역의 `triggers` 상자에 처음 들어섬) · 그리고 PLAY 가 `hooks.event(name, data)` 로 올린 것.
- `api`: `{ scene, sim, lock(on)`(영웅 입력 잠금) `, toast(text), teleport(sectionId), gotoArea(id, spawn), fx(name, o), sound(name, pos), setDialog(obj｜null) }`.

## 7. 성능 약속

- `localStorage['bn.v2.perf']`(`{v:1, present, resK, cap, chars, hz}`)를 읽는다. `resK` 는 들어올 때 한 번 정하고 **놀이 중에는 바꾸지 않는다**. `cap: 60` 이면 틱이 돈 프레임만 그린다(보간 끔). 주소 옵션: `?v2res=0.75` · `?v2cap=60` · `?v2post=1`(번짐 켜기) · `?v2tier=low|mid|high` · `?v2dbg=1`.
- 겹치기: 게임 캔버스가 alpha 로 만들어졌으면(부팅 때 깃발 — §8) WebGL 캔버스를 **그 아래**에 깐다(`mode: 'under'`). 아니면 시범판 B 의 층 방식(`'layer'`: GL 캔버스 + 투명 HUD 캔버스를 위에)으로 돈다.
- 불러오기 화면 뒤에서 모든 셰이더 · 텍스처 · 모델 · 효과를 한 번 그리고 `gl.readPixels` 로 끝까지 기다린 뒤 시작한다.
- 캐릭터: 종류마다 GPU 모델 1개, 개체마다 뼈대 1벌. 화면 밖 · 안개 너머는 애니메이션도 그리기도 건너뛴다. 구르기 잔상은 영웅을 다시 그리지 않는다(빛 띠 1줄).
- 프레임마다 새 객체 · 배열을 만들지 않는다(틱 · 그리기 경로).

## 8. v1 셸에 넣은 것 (`src/core/game.js`, 깃발이 없으면 v1 그대로)

- `Scene.everyFrame = true` → 화면이 갱신될 때마다 그린다. 그리기 직전 `game.alpha = acc / STEP`.
- `Scene.glUnder = true` 이고 `game.canvasAlpha` 면 검은 바탕 대신 `clearRect`. `game.canvasAlpha` 는 부팅 때 한 번 정한다: 주소가 `?scene=v2…` 이거나 `localStorage['bn.v2.under'] === '1'`(장면 `v2g` 가 처음 들어올 때 적어 둔다 → 다음 실행부터 아래 깔기).

## 9. `window.__v2` (검사용)

`{ id:'g', ready, error, hero{x,y,z,hp,dirX,dirZ,anim,dead,onGround}, enemies[{id,kind,x,y,z,hp,state,active,yard,model,clip,drawn}], shots[], cam{x,y,z,yaw,pitch,dist}, section, area, stats{frameMs{p50,p95,n}, gl{draws,tris,texBytes,bufBytes,…}, chars{…}, fx{…}, mode, resK}, teleport(section), project(x,y,z), loseContext(), scene }`

## 10. 아직 안 된 것 · 알아 둘 것

(구현하면서 채운다.)
