# PLAY 규약 — 놀이 규칙과 움직임 (`src/v2/play/`)

2026-11-17 · 담당 PLAY · 공개 면은 `src/v2/play/index.js` 하나 · 검사 `node tools/v2/play_rules_test.mjs` · `node tools/v2/play_motion_check.mjs` · 보기 `tools/v2/play_view.html`

**바뀐 것**
- 22:20 (2차) **알맹이를 PLAY 판으로 바꿨다.** `index.js` 가 이제 `src/v2/play/` 의 규칙과 움직임을 내보낸다(시범판 B 의 것이 아니다). 이름과 모양은 그대로: `Sim` · `TUNE` · `KINDS` · `driveHero` · `driveActor`. 더해진 것: `MOVES` · `kindOf` · `registerKind` · `placeActor` · `loadPlayClips` · `flatArena` …
  - `KINDS[kind].float`(숫자)는 **없다.** 떠 있는 높이는 규칙이 `e.y` 에 이미 넣는다(`e.gy` = 발밑 땅, `e.hover` = 뜬 높이). 장면이 `float` 를 더하던 줄은 0 이 더해져 그대로 맞는다. 뜨는 종류 표시는 `floats: true` · `fly: true`.
  - 옛 `sfx(name)` 으로는 장면이 아는 이름만 낸다: `dash jump land swing cast parry guard die slash slash_heavy` (`guard` = 막음 — 새 훅 `guard(…)` 도 같이 온다, §5).
  - 기술 한 줄에 `strength`(= `str`)가 있다 — 장면의 `mv.strength` 읽기가 그대로 맞는다.
- 15:20 첫 판 (이름과 모양)

## 0. 한눈에

```js
import { Sim, TUNE, KINDS, driveHero, driveActor, placeActor, kindOf } from '../play/index.js';

const sim = new Sim(W, hooks);          // W = 세계(상자 목록) · hooks = 사건을 받는 함수들 (§5)
sim.update(dt, inp);                    // 틱마다 (§1 입력)
driveHero(heroChar, sim.hero, dt, TUNE);                       // 영웅 상태 → heroChar.dx/dz + 클립
for (const e of sim.enemies) if (!e.dead) driveActor(charOf(e), e, dt);   // 적 상태 → 방향 + 클립
// 그리기: heroChar.place(h.x, h.y, h.z) · 적은 ch.place(e.x, e.y, e.z) (placeActor(ch, e) 도 같은 것). 박쥐의 숙임 · 유령의 기울임은 driveActor 가 골반 뼈에 넣는다
```

- **규칙은 화면을 모른다.** 좌표는 x 오른쪽 · z 화면 안쪽 · y 위, 단위는 논리 px (1 m = `UNIT` 58).
- **보는 방향은 규칙이 정한다**(`dirX`,`dirZ` 단위 벡터, 360°). 그림은 `driveHero`/`driveActor` 가 그 방향으로 부드럽게 돌린다(`ch.dx`,`ch.dz`): 한 번 돌기 시작한 쪽으로 끝까지 돌고(스틱을 반대로 꺾어도 오락가락하지 않는다), 반대로 꺾는 데 0.17–0.22초(한 틱에 16° 까지).
- **그림에만 얹는 것**(`driveHero`): 달릴 때 윗몸을 12° 세우고, 돌 때 도는 쪽으로 기울이고, 락온한 적을 고개로 본다. 자세를 입힌 뒤 뼈 몇 개를 더 돌리는 것이라 클립은 그대로다(`TUNE.runLeanFix · runBank · lookMax` 를 0 으로 두면 꺼진다).
- **클립은 공용 라이브러리**(`assets/v2/char3d/clips/`). 장면이 `ch.asset.clips` 에 이미 붙여 두었으면 그대로 쓰고, 없으면 `driveHero`/`driveActor` 가 처음 불릴 때 스스로 받는다(받기 전에는 시범판의 몰이로 돈다). 모델 파일에 든 클립(`float_idle` · `fly`)은 이름 그대로 `ch.asset.clips` 에 더한다. 미리 받으려면 `await loadPlayClips(asset)`.
- 세계 `W`: `{ start:{x,y,z}, spawns:[{kind,x,y,z,yard?,active?}], boxes:[{x0,x1,z0,z1,y0,y1,solid,walk}], sections:[{id,x0,x1,z0,z1}], tele?:{id:[x,z]} }` (시범판 B 의 `compileStage` · 환경 키트 `compileEnv` 결과 그대로). 다른 충돌을 쓰려면 `W.groundAt(x,z,yMax)` · `W.moveXZ(e,dx,dz)` · `W.sectionAt(x,z)` 를 달아 주면 그것을 쓴다.
- 타격 멈춤: 규칙은 `sim.stop`(초)을 스스로 건다(`TUNE.ownHitstop`). 장면이 멈춤을 쥐면(ENGINE_API §1) 틱마다 `sim.stop = 0` 으로 지우면 된다 — 지금 장면이 그렇게 한다. `hooks.hit` 이 `{ stop }` 을 돌려주면 그 값을 쓴다.

## 1. 입력 `inp`

| 칸 | 뜻 |
|---|---|
| `mx`, `mz` | 스틱 −1…1 (`mz` + = 화면 안쪽). 길이 0.15 아래는 0. 절반 아래로 밀면 걷기 |
| `jump` (눌린 틱) · `jumpHeld` | 점프 · 누르고 있으면 높이 뛴다 (놓으면 낮게) |
| `attack` (눌린 틱) | 연타 1 · 2 · 3 / 공중 = 내려베기 / 구른 직후(0.26초 안, 구르는 중에 눌러도 됨) = 훑기 |
| `dash` (눌린 틱) | 스틱을 민 채 = **구르기**(0.46초 · 150 px · 처음 0.3초 무적). 스틱이 없으면 구르지 않고 막기를 든다(짧게 누르면 0.3초 막기 = 튕겨내기 시도) |
| `guard` (누르고 있음) | 스틱 없이 누르고 있으면 **막기**. 막기 시작 뒤 `TUNE.parryWin`(0.2초) 안에 공격이 닿으면 **튕겨내기**. 막는 중에 스틱을 밀면 그쪽으로 구른다 |
| `lockNext` (눌린 틱) | 락온 대상을 다음 적으로 (4초 동안 저절로 바뀌지 않는다) |

`dash` 와 `guard` 는 같은 단추에서 나와도 된다(눌린 틱에 `dash`, 누르는 동안 `guard`). 단추 다섯: 공격 · 점프 · 구르기/막기 · 락온 + (남는 하나 = 기술 — 이번 범위 밖).
눌림 입력은 타격 멈춤 중에 와도 잃지 않는다(규칙이 기억했다가 멈춤이 풀린 틱에 쓴다).

## 2. 영웅 상태 `sim.hero` (읽기 전용으로 쓴다)

| 칸 | 뜻 |
|---|---|
| `x y z` · `vx vy vz` · `onGround` | 위치(발밑) · 속도 · 땅에 있는가 |
| `dirX dirZ` · `facing`(±1, 옛 코드용) | 보는 방향 (규칙 값 — 그림의 방향은 `ch.dx, ch.dz`) |
| `hp` · `hpMax` · `dead` · `deadT` · `ifr`(무적 남은 초) · `hurtT` · `flash` · `heavyHurt` | 몸 상태 |
| `anim` · `animT` | 상태 이름과 그 상태에 든 시간: `idle walk run jump fall land roll attack guard parry block hurt death` (`dash` 대신 `roll`) |
| `move` · `moveT` · `combo` | 지금 기술(§4 의 한 줄, 없으면 `null`) · 기술 시간 · 연타 번호 0–2. `move.hit[0..1]` = 판정 구간, `move.id` · `move.strength` · `move.weapon` |
| `dashT` · `roll:{t,dur,dx,dz}` | 구르기 남은 초 (0 보다 크면 구르는 중) · 구르는 방향 |
| `guard`(막는 중) · `parryT`(튕겨내기 창 남은 초) · `parryOk`(튕겨낸 뒤 남은 초) · `blockT`(막고 밀리는 초) | 막기 |
| `lock` · `lockT` · `lockX lockY lockZ` | **락온한 적의 `id` 또는 `null`** — 장면이 표식을 그린다(`sim.byId(h.lock)`). `lockT` = 걸린 뒤 흐른 초. `lockX/Y/Z` = 그 적의 가슴 자리(틱마다 갱신) — 카엘이 고개를 돌려 그쪽을 본다 |
| `gait` · `gaitMode` | 걸음 주기(0…1 을 되풀이; 0 = 오른발, 0.5 = 왼발) · `'walk'｜'run'`. 발소리 사건과 달리기 클립이 이 값 하나를 같이 쓴다 |
| `plungeEta` · `plungeLand` | 내려베기: 땅에 닿기까지 남은 초 · 닿은 때의 `moveT` |
| `safe` | 마지막으로 선 안전한 자리 (구덩이에 빠지면 돌아오는 곳) |

락온: 380 px 안의 깨어 있는 적 가운데 가깝고 앞쪽인 것에 저절로 걸린다(470 px 를 넘거나 쓰러지면 풀린다). 스틱 없이 공격하면 230 px 안의 락온 대상 쪽으로 돌아서 베고, 스틱을 민 채 공격하면 그 방향 ±55° 안의 적으로 맞춘다. 대상이 판정 한가운데 오도록 최대 78 px 내딛는다.

## 3. 적 `sim.enemies[]` 와 종류표 `KINDS`

적 상태: `id kind kid(바른 이름) def(= KINDS 한 줄) x y z gy dirX dirZ hp hpMax r h state stateT anim animT dead active yard` + `phase`(`'windup'｜'strike'｜'recover'｜null`) · `tele`(예고 0…1 — 장면이 번쩍임 · 바닥 표시를 그린다) · `atk`(지금 쓰는 공격 한 줄: `box`｜`radius`｜`shot`, `guard`, `windup` …) · `alpha`(유령의 비침 0…1) · `solid`(맞는가) · `hover`(뜬 높이 px — `y = gy + hover`) · `stagger`(튕겨져 비틀거리는 남은 초) · `stun` · `flashT` · `dying`(쓰러지는 남은 초).
`state`: `idle`(아직 못 봄) `chase` `attack` `stagger` `dead`(쓰러지는 중 — `dying` 이 0 이 되면 `dead = true`). `anim`: `idle walk attack cast hurt stagger death`.

`KINDS[kind]` = `{ name(한국어), model, weapon, height(m), material, grip?, hp, speed, r, hpx(맞는 상자 높이 px), ai, attacks:[…], clips:{idle,walk,hurt,stagger,death}, floats?, fly?, hover?, pitch?(도 — 앞으로 숙여 그린다), fade?, armorFront?, elite?, boss?, wakeSound? }`. 스테이지의 `spawns[].kind` 로 쓰는 이름:

| kind | 다른 이름 | 모델 · 무기 | 키 · 재질 | 체력 · 속도 | 성격과 공격 (예고 → 판정 → 틈, 초) |
|---|---|---|---|---|---|
| `skeleton_soldier` | `melee` `soldier` | `skeleton_soldier` · `w_rusty_sword` | 1.75 · `bone` | 34 · 104 | 기본 근접. 다가와 `slash`(0.46 → 0.14 → 0.42, 10) · 조금 떨어져 있으면 `stab`(0.52 → 0.16 → 0.5, 11, 74 px 내지름). 기다리는 동안 옆으로 돈다. 한 번에 둘까지만 덤빈다 |
| `skeleton_mage` | `ranged` `mage` | `skeleton_mage` · `w_crystal_staff` | 1.85 · `bone` | 26 · 78 | 190–350 px 거리를 지킨다. `bolt`(0.8 → 쏨 → 0.45, 9; 탄 250 px/초 · `element:'blood'`). 코앞에서는 쏘지 않고 물러선다. 탄은 벨 수 있고, 튕겨내면 쏜 적에게 돌아간다 |
| `plague_corpse` | `corpse` | `plague_corpse` · — | 1.76 · `flesh` | 82 · 46 | 느리고 질기다(맞아도 공격을 멈추지 않는다). `grab`(0.8 → 0.3 → 0.95, 16, 128 px 덮침) — **막을 수 없다**(`guard:'break'`) → 구른다 |
| `grave_ghost` | `ghost` | `grave_ghost` · — | 1.95 · `ghost` | 30 · 80 | 떠서 맴돈다. 흐릴 때(`alpha` 0.3, `solid=false`)는 베이지 않는다. `swoop`(0.62 → 0.3 → 1.0, 10) 예고 중간부터 또렷해지고, 덮친 뒤 0.9초 동안만 맞는다. `sim.reveal(x,z,r,초)` 로 드러낼 수 있다(메아리 · 등불 자리) |
| `gravekeeper_armor` | `armor` | `gravekeeper_armor` · `w_grave_spade` | 2.35 · `armor` | 170 · 58 | 정예. 앞 ±80° 는 단단하다(피해 15 %, 영웅이 튕겨 밀린다) → 튕겨내 비틀거리게 하거나(1.7–1.9초 동안 어디서 쳐도 1.3배) 구르기로 등 뒤로. `slam`(1.0 → 0.16 → 1.05, 24, 반지름 118 원; 막아도 35 % 닳는다) · `thrust`(0.72 → 0.18 → 0.75, 16, 길이 196) |
| `bat` | — | `bat` · — | 0.45 · `flesh` | 8 · 200 | 작은 떼. 영웅 둘레(130–190 px)를 높이 96 px 로 맴돌다 한 마리씩 `dive`(0.36 → 0.5 → 0.3, 5). 튕겨내면 그대로 떨어진다 |
| `banshee_queen` | `boss` | `banshee_queen` · — | 2.7 · `cloth` | 600 · 60 | 보스 자리(규칙은 영웅을 보고 떠 있기뿐 — §7) |

`kindOf(kind)` 가 다른 이름까지 풀어 한 줄을 돌려준다(모르는 이름은 `skeleton_soldier`). `KINDS.melee === KINDS.skeleton_soldier`.

- **판정은 보는 방향 기준 상자**다(영웅과 같다): `atk.box = { f0, f1, side, y0, y1 }`(앞으로 f0…f1, 옆 ±side) 또는 `atk.radius = { r, fwd }`(앞으로 fwd 떨어진 원). 예고 동안 `atk.track`(rad/초)로 영웅을 따라 돌다가 예고의 마지막 20 % 에서 방향이 굳는다 → 그때 옆으로 비키면 빗나간다.
- 옛 장면 코드를 위해 `TUNE[kind] = { windup, reachZ }`(첫 공격의 값)도 채워 둔다. 공격마다 예고 길이가 다르므로 새 코드는 `e.atk.windup` · `e.tele` 를 읽는다.
- **한 번에 둘까지**: 걷는 적은 둘까지만 동시에 공격한다(`sim.mayAttack`; 정예 · 보스는 예외, 나는 것은 따로 하나). 차례를 기다리는 적은 52 px 물러선 고리에서 옆으로 돈다 → 여럿이 한 점에 뭉치지 않는다.
- **길 찾기**: `sim.steer(e, wx, wz, speed, dt)` — 가려는 쪽이 0.1초 넘게 막히면 옆으로 0.55–0.75초 돌아간다(벽 모서리와 소품 사이에 끼어 서 있던 문제, requests.md envkit 3 — `play_rules_test` 가 그 자리를 그대로 재현해 본다). 걷는 적은 낭떠러지로 가지 않는다.

## 4. 기술표와 조율값

`MOVES`(`src/v2/play/moves.js`). 시간은 초, 거리는 px. 판정은 영웅이 보는 방향 기준.

| id | 클립 | 전체 | 판정 구간 | 다음 타 | 이동으로 끊기 | 판정 모양 | 내딛기 | 세기 · 피해 배수 |
|---|---|---|---|---|---|---|---|---|
| `c1` 연타 1 | `atk1` | 0.44 | 0.13–0.25 | 0.26 | 0.36 | 상자 앞 106 · 옆 ±46 | 26 | M · 1.0 |
| `c2` 연타 2 | `atk2` | 0.46 | 0.11–0.27 | 0.28 | 0.38 | 상자 앞 112 · 옆 ±54 | 30 | M · 1.1 |
| `c3` 연타 3 (넓게) | `atk3` | 0.74 | 0.20–0.38 | — | 0.58 | 부채꼴 반지름 132 · 300° | 34 | F · 1.65 |
| `sweep` 구른 뒤 훑기 | `launcher` | 0.56 | 0.12–0.27 | — | 0.42 | 부채꼴 반지름 124 · 180° | 44 | H · 1.35 |
| `plunge` 내려베기 | `plunge` | 땅에 닿을 때까지 + 0.3 | 0.06–착지 (+ 착지 원 반지름 92) | — | — | 상자 앞 84 · 옆 ±46 (아래 50 까지) | — | H · 1.5 |

- 피해 = `TUNE.dmgBase`(11) × 배수 × 0.9–1.12. 등 뒤 · 비틀거리는 적에게는 1.3배.
- 구르기는 판정이 끝나면 언제든 공격을 끊는다. 점프는 "다음 타" 시각부터.
- **칼이 판정 구간 안에서 대상을 지난다**: 클립에서 칼끝이 몸 앞을 지나는 구간(`move.strike`, 없으면 클립 자료의 `strike`)을 판정 구간에 겹쳐 튼다(`warpMove`). 구간은 `node tools/v2/play_cliptrace.mjs <clip>` 로 칼끝 궤적을 찍어 정했다. `play_motion_check` 가 기술마다 "칼끝이 가장 빠른 순간이 판정 구간 안"임을 본다.

`TUNE`(`src/v2/play/tune.js`)의 중요한 값:

| 값 | 뜻 |
|---|---|
| `runX 275` · `runZ 208` · `accel 16` | 가장 빠른 속도(좌우 · 앞뒤) · 속도가 따라가는 빠르기 |
| `strideRun 222` · `strideWalk 80` | 한 걸음 주기에 나아가는 거리 — 달리기 · 걷기 클립의 실제 보폭(발이 미끄러지지 않게; `play_motion_check --stride` 로 다시 잰다) |
| `jumpV 720` · `gravity 2300` · `jumpCut 0.42` · `coyote 0.09` | 점프 (높이 112 px) |
| `rollT 0.46` · `rollDist 150` · `rollIfr 0.3` · `rollCd 0.62` · `rollSweep 0.26` | 구르기 |
| `parryWin 0.2` · `guardArc 100` · `guardTap 0.3` · `guardPush 130` | 막기 · 튕겨내기 |
| `lockRange 380` · `lockKeep 470` · `lockAim 230` · `aimCone 55` · `lungeMax 78` | 락온 · 조준 보정 |
| `heroHp 100` · `hurtIfr 0.95` · `hurtT 0.26` · `deadT 2.1` | 몸 |
| `runLeanFix 12` · `runBank 1.1` · `lookMax 58` | 그림만 바뀌는 값: 달리기 클립의 숙임(26°)을 이만큼 세운다 · 달리며 돌 때 도는 쪽으로 기우는 정도(최대 11°) · 락온한 적을 고개로 보는 최대 각도 |
| `stepL { run 0.54, walk 0.46 }` | 걸음 주기에서 왼발이 닿는 때(오른발 = 0) — 클립의 발 사건 자리. `step` 사건이 이때 난다 |

## 5. 사건 (hooks)

`new Sim(W, hooks)` 의 `hooks` 는 있는 것만 불린다. **모든 사건은 `hooks.event(name, 첫 인자, …)` 로도 한 번씩 온다**(아래 "새 이름" 칸의 이름으로).

옛 이름(시범판 B 와 같은 인자):

| 훅 | 언제 |
|---|---|
| `hit(e, dmg, mv, x, y, z, info)` | 영웅의 공격(또는 되돌린 탄)이 적에게 닿음. `mv.strength` · `mv.weapon`. `info = { strength, weapon, material, blocked(갑주 앞면), back(등 뒤), kill, dirX, dirZ, elite, boss }`. `{ stop }` 을 돌려주면 그 초만큼 멈춘다 |
| `kill(e)` | 적이 쓰러지기 시작 (`e.state === 'dead'`) |
| `heroHurt(dmg, pit, src)` | 영웅이 맞음 (`pit` = 구덩이). `src = { e, atk, shot }` |
| `sfx(name)` | `dash`(구르기) `jump` `land` `slash`/`slash_heavy`(영웅 휘두름 — 판정 0.085초 전) `swing`(적 휘두름 — 판정 0.12초 전; 바로 앞에 `enemySwing(e)` 가 온다) `cast`(주문) `parry`(튕겨냄 · 탄을 벰) `guard`(막음) `die` |
| `spark(x, y, z, kind)` | `dust` `shot` `parry` `guard` `slam` `wisp`(흐린 유령을 헛벰) |
| `number(x, y, z, text, color)` · `shake(px)` · `done()` | 영웅 피해 숫자 · 흔들림 · 마당 정리 끝 |
| `sound(name, pos)` | SOUND_FEEL §6 의 사건 이름: `enemy.skel.rattle`(해골이 깨어남) · `enemy.bat.screech`(박쥐가 내리꽂기 시작) |

새 이름:

| 훅 | 인자 | 언제 · 쓰임 |
|---|---|---|
| `step` | `(side 'L'｜'R', speed, who)` | 발이 닿는 순간. 영웅은 걸음 주기(달리기 클립과 같은 시계)에서, 갑주는 걸음마다. → `feel.step(speed, who)` |
| `attack` · `swing` | `(hero, mv)` | 기술 시작 · 휘두름 소리를 낼 때(판정 0.085초 전 = 표의 lead) |
| `whiff` | `(e, mv)` | 흐린 유령을 헛벰 |
| `roll` · `jump` · `land` | `(dx, dz, hero)` · `(hero)` · `(speed, heavy, hero)` | 구르기 · 도약 · 착지 (`heavy` = 높은 데서 또는 내려베기) |
| `dodge` | `(hero, src)` | 구르기 무적으로 공격을 흘림 |
| `guardUp` | `(hero)` | 막기를 듦 |
| `guard` | `(x, y, z, chip, src)` | **막음** (옛 `sfx('guard')` 도 같이 온다 — 둘 가운데 하나만 쓴다). `chip` = 닳은 체력 |
| `parry` | `(x, y, z, src)` | **튕겨냄** (옛 `sfx('parry')` 도 같이 온다) |
| `stagger` | `(e, 초)` | 적이 비틀거리기 시작 |
| `tell` | `(e, atk)` | 적의 예고 시작 → 바닥 표시 · 번쩍임 (`e.tele` 0…1 을 틱마다 읽어도 된다) |
| `enemySwing` | `(e, atk)` | 적의 판정 0.12초 전 |
| `cast` | `(e, 'charge'｜'release')` | 주문 모으기 · 놓기 → `feel.magic(element, …)` |
| `shot` | `(s, 'spawn'｜'cut'｜'reflect'｜'block'｜'hit'｜'wall')` | 탄의 일생 |
| `lock` | `(id｜null, e)` | 락온 대상이 바뀜 |
| `wake` | `(e)` | 적이 영웅을 봄 |
| `heroDie` | `(hero)` | 영웅 쓰러짐 |

밖에서 부르는 함수: `sim.wake(e)`(잠든 적 깨우기 — 스테이지 `spawns[].group` 은 `e.group` 으로 실려 온다) · `sim.hitStop(초)` · `sim.hurtHero(dmg, dirX, dirZ, { e, atk, shot })` → `false｜'parry'｜'guard'｜'hurt'` · `sim.staggerEnemy(e, 초)`(종소리 등) · `sim.reveal(x, z, r, 초)` · `sim.addEnemy({kind, x, z, active?})` · `sim.byId(id)` · `sim.teleport(구역 id)`.

## 6. 적 종류를 더하는 법

```js
import { registerKind, attackDef, ATTACKS } from '../play/index.js';
registerKind('wolfman', {
  name: '늑대인간', model: 'wolfman', weapon: null, height: 2.0, material: 'flesh', ai: 'melee',
  hp: 60, speed: 150, stride: 120, turn: 7, standoff: 70,
  attacks: [attackDef({ id: 'claw', clip: 'atk2_fore', range: 90, windup: 0.4, strike: 0.14, recover: 0.4, dmg: 12, lunge: 30, box: { f0: -6, f1: 104, side: 40, y0: 0, y1: 112 }, weapon: 'dagger', str: 'M' })],
  clips: { idle: 'idle_combat', walk: 'limp', hurt: 'hit_light', stagger: 'stagger', death: 'death_back' },
});   // 세 번째 인자로 행동 함수 (sim, e, dt, D) 를 주면 그것을 쓴다 (없으면 ai 이름의 것: melee · ranged · ghost · bat · boss)
```

- 공격 한 줄: `range`(이 거리 안에서 시작; `[가까이, 멀리]` 도 됨 · `chance`) · `windup` → `strike` → `recover` · `box`｜`radius`｜`shot` · `lunge`(판정 동안 앞으로) · `track`(예고 동안 따라 도는 빠르기) · `guard: 'block'｜'chip'｜'break'` · `parry`(튕겨낼 수 있나) · `staggerT` · `cd:[최소,최대]` · `weapon` · `str` · `clip`(틀 클립 — 칼이 지나는 구간이 판정에 겹치게 `warpAttack` 이 시간을 접는다) · `cut:[클립 초, 클립 초]`(그 구간을 직접 줄 때 — 없으면 클립 자료의 `strike`; **`strike` 는 판정 길이(초)** 이니 헷갈리지 말 것) · `sound`.
- 행동 함수는 "언제 무엇을 시작하고 그 사이에 어떻게 움직이나"만 정한다: `sim.turnTo` · `sim.steer` · `sim.mayAttack` · `sim.startAttack(e, atk)` · `sim.runAttack(e, dt)` · `sim.setAnim(e, 'walk', dt)`.
- 그림: `driveActor` 가 `clips` 의 이름으로 튼다. 걷기 클립은 `stride`(px/주기)로 발을 맞춘다(지금 값은 뼈대에서 잰 것: 병사 78 · 술사 86 · 주검 40 · 갑주 86). 뜨는 것은 `floats: true`(다리 뼈를 묶는다), 나는 것은 `fly: true` + `pitch`.

## 7. 보스 자리

`KINDS.banshee_queen`(모델 · 키 · 체력 600 · `floats`) 과 `AI.boss`(영웅을 보고 떠 있기)만 있다. 밴시 여왕의 규칙(노래 · 유령 부르기 · 조종에 무릎 꿇기)은 `src/v2/play/enemies.js` 의 `AI.boss` 를 채우고 `attacks` 에 공격 줄을 더하면 된다. 쓸 클립: `scream` · `cast_big` · `cast_sweep` · `cast_channel` · `stun` (CAST_R1_ENEMIES §6). `info.boss` · `mayAttack` 의 예외 · 튕겨내도 비틀거리지 않게 할 자리(`staggerEnemy`)는 이미 있다.

## 8. 시험 화면과 검사

- `tools/v2/play_view.html` — 평평한 마당에서 진짜 규칙을 돌려 카엘의 모든 기술(여덟 방향)과 적 여섯 종을 본다. 단추: 시범 고르기 · 카메라(게임/높이/가까이/옆/앞/위/적 가까이) · 판정 보기 · 느리게 · 멈춤. `?demo=free` 는 직접 조작(방향키/WASD · J 공격 · K 점프 · L 구르기/막기 · O 락온).
- `node tools/v2/play_shot.mjs [이름…]` — 그 화면을 헤드리스로 띄워 붙임 그림을 `/tmp/claude-0/v2/play/` 에 찍는다(`--list` 로 묶음 목록, `--gallery="clip:초,…"` 로 클립 자세만).
- `node tools/v2/play_rules_test.mjs` — 규칙(화면 없음): 기술 · 여덟 방향 판정 · 구르기 무적 · 막기/튕겨내기 · 락온 · 여섯 종 · 끼임 · 사건.
- `node tools/v2/play_motion_check.mjs [--stride]` — 뼈대 숫자로: 칼이 판정 구간 안에서 몸 앞을 지나는가 · 디딘 발이 미끄러지지 않는가 · 반전 때 한쪽으로만 도는가 · NaN · 클립 이름 · 달리기 숙임/기울임 · 락온한 적 보기 · 박쥐 숙임.
- `node tools/v2/play_cliptrace.mjs <clip…>` — 칼끝 궤적 · 골반 높이 · 숙임을 시간순으로 찍는다(판정에 맞출 구간을 고를 때).

## 9. 장면(ENGINE)이 해 주면 좋은 것

`/tmp/claude-0/v2/requests.md` 의 "play (2차)" 절과 같다: ① (필요 없어짐 — 박쥐 숙임은 `driveActor` 가 뼈에 넣는다) ② 유령 비침: `driveActor` 가 `ch.opt.alpha = e.alpha` 를 적는다(`ch.opt` 가 있을 때 — 장면의 `Actor3D`). 장면이 스스로 `e.alpha` 를 읽어 테두리 빛까지 다루면 더 좋다 ③ `hooks.guard` → 막기 소리 ④ `hero.lock` 표식 ⑤ `e.tele`/`tell` 예고 표시 ⑥ `step` 훅으로 발소리(지금은 장면이 96 px 마다 낸다 — 클립의 발과 어긋난다).

## 상태

| 무엇 | 상태 |
|---|---|
| 공개 이름 · 규칙(영웅 기술 다섯 · 구르기 · 막기/튕겨내기 · 락온 · 적 여섯 종 · 끼임) | 동작 — `play_rules_test` 73/73 (시범판 B 의 세계와 환경 키트 세계 둘 다에서) |
| 움직임(`driveHero` · `driveActor` — 라이브러리 클립) | 동작 — `play_motion_check` 31/31, 붙임 그림 28묶음(`/tmp/claude-0/v2/play/`)으로 눈으로 봄 · 본 게임 장면(`v2g`)에서 오류 없이 돈다(`tools/v2/game_probe.mjs`) |
| 길게 눌러 채찍 · 기술 단추 · 종 · 보스 | 범위 밖 (자리만) |
