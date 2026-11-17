# PLAY 규약 — 놀이 규칙과 움직임 (`src/v2/play/`)

2026-11-17 · 담당 PLAY · 공개 면은 `src/v2/play/index.js` 하나 · 검사 `node tools/v2/play_rules_test.mjs` · 보기 `tools/v2/play_view.html`

**바뀐 것**
- 15:20 첫 판 (이름과 모양을 먼저 정함. 알맹이는 차례로 채운다 — 아래 "상태" 칸을 본다)

## 0. 한눈에

```js
import { Sim, TUNE, KINDS, driveHero, driveActor, kindOf, loadPlayClips } from '../play/index.js';

const sim = new Sim(W, hooks);          // W = 세계(상자 목록) · hooks = 사건을 받는 함수들 (§5)
sim.update(dt, inp);                    // 프레임마다 (§1 입력)
driveHero(heroChar, sim.hero, dt, TUNE);            // Char3D 를 영웅 상태로 몬다 → heroChar.dx/dz + 클립
for (const e of sim.enemies) if (!e.dead) driveActor(charOf(e), e, dt);
```

- **규칙은 화면을 모른다.** 좌표는 x 오른쪽 · z 화면 안쪽 · y 위, 단위는 논리 px (1 m = `UNIT` 58).
- **보는 방향은 규칙이 정한다**(`dirX`,`dirZ` 단위 벡터, 360°). 그림은 `driveHero`/`driveActor` 가 그 방향으로 부드럽게 돌린다(`ch.dx`,`ch.dz`). 장면은 `ch.place(x, y, z)` 만 부르면 된다.
- **클립은 공용 라이브러리**(`assets/v2/char3d/clips/`)를 쓴다. `driveHero`/`driveActor` 가 처음 불릴 때 스스로 받아 `ch.asset.clips` 에 더한다(받기 전에는 모델에 든 클립과 손으로 쓴 클립으로 돈다). 미리 받으려면 `await loadPlayClips(asset)`.
- 세계 `W`: `{ start:{x,y,z}, spawns:[{kind,x,y,z,yard?}], boxes:[{x0,x1,z0,z1,y0,y1,solid,walk}], sections:[{id,x0,x1,z0,z1}] }` (시범판 B 의 `compileStage` 결과 그대로). 다른 충돌을 쓰려면 `W.groundAt(x,z,yMax)` · `W.moveXZ(e,dx,dz)` · `W.sectionAt(x,z)` 를 달아 주면 그것을 쓴다.

## 1. 입력 `inp`

| 칸 | 뜻 |
|---|---|
| `mx`, `mz` | 스틱 −1…1 (`mz` + = 화면 안쪽). 길이 0.15 아래는 0 으로 본다 |
| `jump` (눌린 프레임) · `jumpHeld` | 점프 · 누르고 있으면 높이 뛴다 |
| `attack` (눌린 프레임) | 연타 1·2·3 / 공중 = 내려베기 / 구른 직후 = 훑기 |
| `dash` (눌린 프레임) | 스틱을 민 채 = **구르기**(짧은 무적). 스틱이 없으면 구르지 않고 막기를 시작한다 |
| `guard` (누르고 있음) | 스틱 없이 누르고 있으면 **막기**. 막기 시작 뒤 `TUNE.parryWin` 초 안에 공격이 닿으면 **튕겨내기**. 막는 중에 스틱을 밀면 그쪽으로 구른다 |
| `lockNext` (눌린 프레임) | 락온 대상을 다음 적으로 |

`dash` 와 `guard` 는 같은 단추에서 나와도 된다(눌린 프레임에 `dash`, 누르는 동안 `guard`). `guard` 를 주지 않아도 `dash` 만으로 짧은 막기(= 튕겨내기 시도)가 된다.

## 2. 영웅 상태 `sim.hero` (읽기 전용으로 쓴다)

| 칸 | 뜻 |
|---|---|
| `x y z` · `vx vy vz` · `onGround` | 위치(발밑) · 속도 · 땅에 있는가 |
| `dirX dirZ` · `facing`(±1, 옛 코드용) | 보는 방향 |
| `hp` · `hpMax` · `dead` · `deadT` · `ifr`(무적 남은 초) · `hurtT` · `flash` | 몸 상태 |
| `anim` · `animT` | 상태 이름과 그 상태에 든 시간: `idle run jump fall land roll attack guard parry block hurt death` (`dash` 대신 `roll`) |
| `move` · `moveT` · `combo` | 지금 기술(§4 의 한 줄) · 기술 시간 · 연타 번호 0–2 |
| `dashT` | 구르기 남은 초 (0 보다 크면 구르는 중). `roll:{t,dur,dx,dz}` |
| `guard`(막는 중) · `parryT`(튕겨내기 창 남은 초) · `parryOk`(튕겨낸 뒤 남은 초) · `blockT`(막고 밀리는 초) | 막기 |
| `lock` | 락온한 적의 `id` 또는 `null` — 장면이 표식을 그린다. `lockT` = 걸린 뒤 흐른 초 |
| `gait` | 걸음 주기(0…1 을 되풀이). 발소리와 달리기 클립이 이 값 하나를 같이 쓴다 |
| `safe` | 마지막으로 선 안전한 자리 |

## 3. 적 `sim.enemies[]` 와 종류표 `KINDS`

적 상태: `id kind x y z dirX dirZ hp hpMax state stateT anim animT dead` + `phase`(`'windup'|'strike'|'recover'|null`) · `tele`(예고 0…1 — 장면이 번쩍임·바닥 표시를 그린다) · `atk`(지금 쓰는 공격 한 줄) · `alpha`(유령의 비침 0…1) · `solid`(맞는가) · `hover`(떠 있는 높이 px) · `stagger`(튕겨져 비틀거리는 남은 초) · `flashT`.
`state`: `idle`(아직 못 봄) `chase` `attack` `cast` `stagger` `dead`(쓰러지는 중 — `dying` 이 0 이 되면 `dead=true`).

`KINDS[kind]` = `{ model, weapon, height(m), material, name(한국어), grip?, float?, pitch?, hover?, scale?, clips:{…}, … }`. 스테이지의 `spawns[].kind` 로 쓰는 이름:

| kind | 다른 이름 | 모델 | 무기 | 재질 | 성격 |
|---|---|---|---|---|---|
| `skeleton_soldier` | `melee` · `soldier` | `skeleton_soldier` | `w_rusty_sword` | `bone` | 기본 근접. 내려베기 · 내지르기 |
| `skeleton_mage` | `ranged` · `mage` | `skeleton_mage` | `w_crystal_staff` | `bone` | 거리를 두고 탄을 쏜다 |
| `plague_corpse` | `corpse` | `plague_corpse` | — | `flesh` | 느리고 질기다. 덮쳐 잡기(막을 수 없다 — 구른다) |
| `grave_ghost` | `ghost` | `grave_ghost` | — | `ghost` | 떠다닌다. 흐릴 때는 맞지 않고, 덮칠 때와 그 직후에만 또렷하다 |
| `gravekeeper_armor` | `armor` | `gravekeeper_armor` | `w_grave_spade` | `armor` | 정예. 앞은 단단하다(튕겨내거나 등 뒤). 땅 찍기 |
| `bat` | — | `bat` | — | `flesh` | 작은 떼. 맴돌다 내리꽂는다 |
| `banshee_queen` | `boss` | `banshee_queen` | — | `cloth` | 보스 자리(규칙은 아직 서 있기뿐 — §7) |

`kindOf(kind)` 가 다른 이름까지 풀어 한 줄을 돌려준다(모르는 이름은 `skeleton_soldier`).

## 4. 기술표와 조율값

`TUNE`(영웅 · 적 숫자)와 `MOVES`(영웅 기술)는 `src/v2/play/tune.js` · `moves.js`. 표는 구현이 끝나면 여기에 옮긴다.

## 5. 사건 (hooks)

`new Sim(W, hooks)` 의 `hooks` 는 있는 것만 불린다. 옛 이름은 그대로 불린다: `hit(e,dmg,mv,x,y,z,info)` · `kill(e)` · `heroHurt(dmg,pit)` · `shake(px)` · `sfx(name)` · `spark(x,y,z,kind)` · `number(x,y,z,text,color)` · `done()`.
새 이름: `step(side,speed,who)` · `swing(who,mv)` · `parry(x,y,z,src)` · `guard(x,y,z,dmg,src)` · `land(speed,heavy)` · `roll(dx,dz)` · `jump()` · `tell(e,atk)` · `enemySwing(e,atk)` · `cast(e,phase)` · `shot(s,what)` · `lock(id)`. 그리고 **모든 사건이 `event(name, data)` 로도 한 번씩 온다.** 자세한 표는 구현 뒤에 채운다.

## 6. 적 종류를 더하는 법 · 7. 보스 자리

구현 뒤에 채운다 (`src/v2/play/enemies.js` 의 `KINDS` 한 줄 + `AI` 함수 하나).

## 상태

| 무엇 | 상태 |
|---|---|
| 공개 이름(`Sim` `TUNE` `KINDS` `driveHero` `driveActor`) | 동작 (지금은 시범판 B 의 규칙을 그대로 내보냄 → PLAY 판으로 바꾸는 중) |
