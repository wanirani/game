# PLAY 규약 — 놀이 규칙과 움직임 (`src/v2/play/`)

2026-11-18 (3차) · 담당 PLAY · 공개 면은 `src/v2/play/index.js` 하나 · 검사 `node tools/v2/play_rules_test.mjs` · `node tools/v2/play_motion_check.mjs` · `node tools/v2/play_alloc.mjs` · 보기 `tools/v2/play_view.html`

**바뀐 것**
- 2026-11-18 01:50 (3차 이어서 · PLAY-2) 01:30 에 끊긴 작업을 이어받아 다시 확인하고 마무리했다. 내보내는 이름 · 모양은 그대로다.
  - **돌아서며 버티는 자세를 덜 젖힌다**(그림만): 미끄러지는 클립(`run_stop`)이 이미 20.7° 뒤로 젖어 있는데 달리기의 "세우기"(`runLeanFix`)가 남아 겹쳐서 넘어갈 듯 보였다 → 버티는 동안에는 세우기를 얹지 않고 윗몸을 `TUNE.pivotLean`(9°) 만큼 앞으로 당긴다. 골반–머리 선 −20.7° → −16.1° (`play_motion_check` 에 한 줄 더함 → 53).
  - **모으는 동안 윗몸을 웅크린다**(그림만): 모은 정도에 따라 `TUNE.chargeCoil`(12°) 까지 앞으로 숙였다가 놓으면 풀린다. 여전히 밋밋한 편이다(전용 동작이 없다).
  - 본 게임 장면(`v2g`) 안에서 규칙을 직접 몰아 본 것(`tools/v2/game_probe.mjs --q area=slice0 --js …`): 길게 눌러 휘감기(모음 1.0) · 종 메아리 · 반전(속도와 그림의 방향 차 최대 9.5°, 뒤로 간 틱 0) · 싸움(세 번 돌려 타격 9 · 11 · 10, 쓰러뜨림 3 · 3 · 3, 영웅 체력 78 · 79 · 100) — 페이지 오류 0 (도구의 마지막 화면 찍기만 30초를 넘겨 끝난다).
  - WHIP 구역의 요청(기술의 `weapon` 기본값을 `'whip'` 으로)은 **아직 바꾸지 않았다**: 장면이 아직 칼을 들고 있어 소리만 채찍이 된다. 규칙은 이 값을 읽지 않는다(훅에 넘기기만 한다) — 장면이 채찍을 꽂는 날 `moves.js` 의 `M()` 에서 한 낱말만 바꾸면 된다(requests.md "PLAY-2 (이어서)").
  - §12 의 숫자를 오늘 네 번 더 잰 값까지 넣어 넓혔다(돌릴 때마다 흔들린다).
- 2026-11-18 01:20 (3차 · PLAY-2) **내보내는 이름과 모양은 그대로이고, 더하기만 했다.** 알아 둘 것:
  - **돌기를 규칙이 한다.** `hero.dirX/dirZ` 는 이제 "몸이 보는 방향"이고 규칙이 빠르기를 묶어 돌린다(`TUNE.turnRate` 14.8 rad/초). **속도는 늘 그 방향으로만 난다** — 스틱을 반대로 꺾으면 멈추고(0.07초) → 제자리에서 돌아서고(`hero.anim === 'turn'`, 180° = 0.21초) → 새 쪽으로 박찬다. 옆 · 뒤로 미끄러지는 틱이 없다(§2.1). 장면의 회전 묶음(`TURN_RUN` 15)은 이 값보다 **작아지면 안 된다**. 스틱이 가리키는 쪽은 `hero.wishX/wishZ`.
  - 새 입력: `attackHeld`(길게 = 모아 휘감기) · `skill`(솜씨: 채찍 걸기 / 부름) · `bell` + `bellHeld`(종: 짧게 = 메아리, 길게 = 조종 / 장면의 건넘) — §10.
  - 새 영웅 칸(HUD 용): `reso · resoMax · charge · charging · callCd · callCdMax · bellCd · bellCdMax · bellCharge · bellOk · knellId · skillMode · hookId · whipOn · whipX/Y/Z · act · actT · pivot · wishX/wishZ` — §2.
  - 새 `hero.anim`: `turn charge echo ring call hook`. 새 기술 `MOVES.whip`.
  - **보스 밴시 여왕**이 싸운다(`KINDS.banshee_queen`, 체력 900, 공격 다섯, 2막, 비틀거림 눈금, 달아남, 무릎 꿇음 → 조종). HUD 값은 `sim.bossState()` — §7.
  - 적이 깨어나는 조건이 바뀌었다: 앞쪽 시야 300 px(술사 400 · 박쥐 360) · 등 뒤는 150 px · 벽 너머는 못 본다 · 곁의 한패가 같이 깬다. 지역이 `spawns[].sight · wake:'trigger' · face` 로 달리 정할 수 있다 — §3.
  - 구르기 단추를 톡 눌러 뗀 뒤 0.3초 안에 스틱을 밀어도 **구르지 않는다**(막는 중의 구르기는 단추를 누르고 있을 때만).
  - 공격의 내딛기: 가장 멀리 78 → **42 px**, 대상이 없을 때 26/30/34/44 → 20/22/26/36 px. 그동안 뒷발을 땅에 붙든다(그림, §2.1).
  - 장면을 위한 것: `sim.here`(늘 영웅이 선 구역) · `sim.freezeSection` · `sim.heal()` · `sim.respawnAt()` · `sim.caps` · `sim.setCaller()` · `sim.hookPoints` · `sim.lights` · `sim.knell()` · `sim.bossReturn()` — §11.
  - 틱마다 만드는 쓰레기: 규칙 4.7–5.7 KB → 0.3–1.2 KB(싸움) · 0.6 KB → 0.01–0.07 KB(달리기만). **0 은 아니다** — 재는 법과 남은 것은 §12.
  - `TUNE.accel` 16 → 20, `strideWalk` 80 → 74, `stopSkidAbove` 190 → 130, `lungeMax` 78 → 42. `KINDS.banshee_queen.hp` 600 → 900.
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
- **보는 방향은 규칙이 정하고 규칙이 돌린다**(`dirX`,`dirZ` 단위 벡터, 360°). 걷고 달릴 때 몸은 한 틱에 14.1° 까지 돌고(`TUNE.turnRate`) 속도는 늘 몸이 보는 쪽으로만 난다. 그림(`ch.dx`,`ch.dz`)은 그 방향을 그대로 따른다(4° 안). 공격 · 구르기 · 막기는 방향을 그 자리에서 바꾸고 그림이 0.09초 안에 따라간다.
- **그림에만 얹는 것**(`driveHero`): 락온한 채 서 있으면 칼 든 팔만 겨눔 자세로 덮고(준비 자세 — 칼끝이 앞), 공격이 몸을 옮기는 동안 뒷발을 땅에 붙들고(두 마디 IK), 달릴 때 윗몸을 12° 세우고, 돌 때 도는 쪽으로 기울이고, 락온한 적을 고개로 보고, 달리다 스틱을 놓으면 뒤로 버티며 미끄러져 선다(`run_stop`, 0.3초 — 다시 밀면 바로 끊긴다). 자세를 입힌 뒤 뼈 몇 개를 더 돌리는 것이라 클립은 그대로다(`TUNE.runLeanFix · runBank · lookMax` 를 0 으로 두면 꺼진다).
- **클립은 공용 라이브러리**(`assets/v2/char3d/clips/`). 장면이 `ch.asset.clips` 에 이미 붙여 두었으면 그대로 쓰고, 없으면 `driveHero`/`driveActor` 가 처음 불릴 때 스스로 받는다(받기 전에는 시범판의 몰이로 돈다). 모델 파일에 든 클립(`float_idle` · `fly`)은 이름 그대로 `ch.asset.clips` 에 더한다. 미리 받으려면 `await loadPlayClips(asset)`.
- 세계 `W`: `{ start:{x,y,z}, spawns:[{kind,x,y,z,yard?,active?}], boxes:[{x0,x1,z0,z1,y0,y1,solid,walk}], sections:[{id,x0,x1,z0,z1}], tele?:{id:[x,z]} }` (시범판 B 의 `compileStage` · 환경 키트 `compileEnv` 결과 그대로). 다른 충돌을 쓰려면 `W.groundAt(x,z,yMax)` · `W.moveXZ(e,dx,dz)` · `W.sectionAt(x,z)` 를 달아 주면 그것을 쓴다.
- 타격 멈춤: 규칙은 `sim.stop`(초)을 스스로 건다(`TUNE.ownHitstop`). 장면이 멈춤을 쥐면(ENGINE_API §1) 틱마다 `sim.stop = 0` 으로 지우면 된다 — 지금 장면이 그렇게 한다. `hooks.hit` 이 `{ stop }` 을 돌려주면 그 값을 쓴다.

## 1. 입력 `inp`

| 칸 | 뜻 |
|---|---|
| `mx`, `mz` | 스틱 −1…1 (`mz` + = 화면 안쪽). 길이 0.15 아래는 0. 절반 아래로 밀면 걷기 |
| `jump` (눌린 틱) · `jumpHeld` | 점프 · 누르고 있으면 높이 뛴다 (놓으면 낮게) |
| `attack` (눌린 틱) | 연타 1 · 2 · 3 / 공중 = 내려베기 / 구른 직후(0.26초 안, 구르는 중에 눌러도 됨) = 훑기 |
| `attackHeld` (누르고 있음) | **길게 = 모아 휘감기**: 0.3초 넘게 누르고 있으면(연타의 판정이 끝난 뒤부터) 모으기 시작, 놓으면 채찍이 250 px 뻗는다 — §10 |
| `skill` (눌린 틱) | **솜씨** (패드의 `skill1`): 빛나는 고리가 가까우면 채찍 걸기, 아니면 고른 사냥꾼 부름(울림 한 칸) — §10. `skillHeld` 는 규칙이 읽지 않는다(길게 = 고르는 판은 장면 · UI 의 일; 고른 사람은 `sim.setCaller(id)`) |
| `bell` (눌린 틱) · `bellHeld` (누르고 있음) | **종** (패드의 `ult`): 0.3초 안에 떼면 메아리, 더 누르고 있으면 종 조각을 들고 서서 차오르고(`hero.bellCharge`) 0.8초 뒤 다 차면 `ringLong` — 무릎 꿇은 보스가 앞에 있으면 조종, 없으면 장면이 건넘을 정한다. 장면이 `bellHeld` 를 아예 주지 않으면(undefined) 눌린 틱에 바로 메아리 — §10 |
| `dash` (눌린 틱) | 스틱을 민 채 = **구르기**(0.46초 · 150 px · 처음 0.3초 무적). 스틱이 없으면 구르지 않고 막기를 든다(짧게 누르면 0.3초 막기 = 튕겨내기 시도) |
| `guard` (누르고 있음) | 스틱 없이 누르고 있으면 **막기**. 막기 시작 뒤 `TUNE.parryWin`(0.2초) 안에 공격이 닿으면 **튕겨내기**. 막는 중에(= 단추를 누른 채) 스틱을 밀면 그쪽으로 구른다. 단추를 뗀 뒤에는 구르지 않는다 |
| `lockNext` (눌린 틱) | 락온 대상을 다음 적으로 (4초 동안 저절로 바뀌지 않는다) |

`dash` 와 `guard` 는 같은 단추에서 나와도 된다(눌린 틱에 `dash`, 누르는 동안 `guard`). 단추: 공격(`attack`) · 점프(`jump`) · 구르기/막기(`dash` + `guard`) · 솜씨(`skill1` → `inp.skill`) · 종(`ult` → `inp.bell` · `inp.bellHeld`) · 다음 적(`lock` → `inp.lockNext`).
눌림 입력(`attack dash jump lockNext skill bell`)은 타격 멈춤 중에 와도 잃지 않는다(규칙이 기억했다가 멈춤이 풀린 틱에 쓴다). 맞아서 밀리는 동안(0.26초)의 눌림은 버린다.

## 2. 영웅 상태 `sim.hero` (읽기 전용으로 쓴다)

| 칸 | 뜻 |
|---|---|
| `x y z` · `vx vy vz` · `onGround` | 위치(발밑) · 속도 · 땅에 있는가 |
| `dirX dirZ` · `facing`(±1, 옛 코드용) | **몸이 보는 방향** (규칙이 돌린다 — 그림의 `ch.dx, ch.dz` 는 이것을 따른다). 속도 `vx, vz` 는 걷고 달릴 때 늘 이 방향이다 |
| `wishX wishZ` · `mx mz m ux uz` | 스틱이 마지막으로 가리킨 방향(단위) · 이 틱의 스틱 값(크기 `m`, 방향 `ux,uz`) |
| `pivot`(0｜±1 도는 쪽) · `pivotT` · `pivotA`(시작 때 벌어진 각 rad) · `pivotV`(시작 때 속도) | **돌아서기**(스틱이 몸과 100° 넘게 벌어짐): 멈춤 → 제자리 돌기 → 45° 안으로 들어오면 박참. 이 동안 `anim === 'turn'` |
| `hp` · `hpMax` · `dead` · `deadT` · `ifr`(무적 남은 초) · `hurtT` · `flash` · `heavyHurt` | 몸 상태 |
| `anim` · `animT` | 상태 이름과 그 상태에 든 시간: `idle walk run turn jump fall land roll attack guard parry block hurt death charge echo ring call hook` (`dash` 대신 `roll`; 뒤의 다섯은 도구 — §10) |
| `move` · `moveT` · `combo` | 지금 기술(§4 의 한 줄, 없으면 `null`) · 기술 시간 · 연타 번호 0–2. `move.hit[0..1]` = 판정 구간, `move.id` · `move.strength` · `move.weapon` |
| `dashT` · `roll:{t,dur,dx,dz}` | 구르기 남은 초 (0 보다 크면 구르는 중) · 구르는 방향 |
| `guard`(막는 중) · `parryT`(튕겨내기 창 남은 초) · `parryOk`(튕겨낸 뒤 남은 초) · `blockT`(막고 밀리는 초) | 막기 |
| `lock` · `lockT` · `lockX lockY lockZ` | **락온한 적의 `id` 또는 `null`** — 장면이 표식을 그린다(`sim.byId(h.lock)`). `lockT` = 걸린 뒤 흐른 초. `lockX/Y/Z` = 그 적의 가슴 자리(틱마다 갱신) — 카엘이 고개를 돌려 그쪽을 본다 |
| `pushed` | 이 틱에 스틱으로 걷고 달리는 중인가 |
| `gait` · `gaitMode` | 걸음 주기(0…1 을 되풀이; 0 = 오른발, 0.5 = 왼발) · `'walk'｜'run'`. 발소리 사건과 달리기 클립이 이 값 하나를 같이 쓴다 |
| `plungeEta` · `plungeLand` | 내려베기: 땅에 닿기까지 남은 초 · 닿은 때의 `moveT` |
| `safe` | 마지막으로 선 안전한 자리 (구덩이에 빠지면 돌아오는 곳) |
| `reso` · `resoMax` | **울림 눈금** (칸 단위 소수, 0…`resoMax` 3). 타격으로 찬다(L 0.08 · M 0.1 · H 0.16 · F 0.2 · 휘감기 0.18–0.45 · 튕겨내기 0.5), 부름에 한 칸 쓴다, 배웅가에 맞으면 0.2 빠진다. HUD: `resonance = { value: reso, cells: resoMax }`. 한 칸이 찰 때 사건 `reso` |
| `charging` · `charge`(0…1) · `whipLv` | 모으는 중 · 모은 정도 · 방금 놓은 휘감기의 세기 |
| `act`(`null`｜`'echo'｜'ring'｜'call'｜'hook'`) · `actT` · `actDone` | 도구 동작과 흐른 초 |
| `skillMode`(`'hook'｜'call'`) · `hookId`(닿는 고리 id｜null) · `callCd` · `callCdMax` | 솜씨 단추가 지금 하는 일 · 부름 쉼(초) |
| `bellOk` · `bellCd` · `bellCdMax` · `bellCharge`(0…1) · `knellId`(무릎 꿇은 보스 id｜null) | **지금 종을 칠 수 있나** · 쉼 · 길게 누르는 중 차오름 · 조종을 받을 보스 |
| `whipOn`(0｜1) · `whipX whipY whipZ` | 채찍이 뻗어 있는 동안 그 끝 자리 — 장면이 손에서 여기까지 띠를 그린다 |

락온: 380 px 안의 깨어 있는 적 가운데 가깝고 앞쪽인 것에 저절로 걸린다(470 px 를 넘거나 쓰러지면 풀린다). 스틱 없이 공격하면 230 px 안의 락온 대상 쪽으로 돌아서 베고, 스틱을 민 채 공격하면 그 방향 ±55° 안의 적으로 맞춘다. 대상이 판정 한가운데 오도록 최대 42 px 내딛는다(`TUNE.lungeMax`).

### 2.1 돌기와 발 — 잰 값 (`node tools/v2/play_motion_check.mjs`)

- **속도와 몸**: 가장 빠른 속도의 30 % 넘게 움직이는 동안 속도 방향과 몸(그림)의 방향이 벌어진 가장 큰 각 — 네 축 반전 9.5° · 12.0° · 7.9° · 10.4°, 직각 꺾기 3.8–12°, 0.13초마다 좌우 뒤집기 10.5°, 원 9–10.4° (기준 35°; 남는 8–12° 는 앞뒤 속도를 좌우의 76 % 로 줄인 데서 온다 — 대각선으로 달릴 때 속도 방향이 스틱과 8° 어긋난다). 뒤로 움직인 틱 0.
- **반전에 드는 시간**: 스틱을 뒤집고 새 쪽으로 가장 빠른 속도의 70 % 에 닿기까지 0.22–0.23초(걷기도 0.22초), 그 사이 가장 느린 속도 6–8 px/초(= 서서 돈다), 멈추는 동안 더 나아가는 거리 7 px 쯤.
- **디딘 발**: 달리기 10 %(275 · 208 px/초 둘 다), 걷기 18 %(예전 27 %; 걷기 클립은 디딘 발이 뒤로 가는 빠르기가 고르지 않아, 걸음 주기를 "디딘 발이 간 거리"에 맞춰 클립 시각을 고른다 — `motion.js gaitWarp`). 기준: 달리기 15 % · 걷기 20 %.
- **내딛기**: 42 px 를 218 px/초로 내딛는 동안 땅에 닿은 발이 움직이는 빠르기 93 px/초(43 %; 손대기 전 75 %). 뒷발은 다리가 다 펴질 때까지 제자리에 있고 그 뒤로는 끌려온다.
- **돌아서며 버티기**: 반전의 처음 5틱(0.08초)은 미끄러지는 자세(`run_stop`)다. 골반–머리 선이 뒤로 16.1° (클립 그대로는 20.7°; 고치기 전에는 달리기의 세우기가 겹쳐 더 젖었다). 다리의 버팀은 클립 그대로다.
- **준비 자세**: 칼끝이 몸 앞 0.74 m · 방위 −27° · 높이 0.82 m (클립 그대로는 몸 뒤 0.8 m · −176°). 공격이 시작되면 0.06초에 풀려 준비 동작(칼을 뒤로 0.5 m 당김)이 그대로 나온다.

## 3. 적 `sim.enemies[]` 와 종류표 `KINDS`

적 상태: `id kind kid(바른 이름) def(= KINDS 한 줄) x y z gy dirX dirZ hp hpMax r h state stateT anim animT dead active yard` + `phase`(`'windup'｜'strike'｜'recover'｜null`) · `tele`(예고 0…1 — 장면이 번쩍임 · 바닥 표시를 그린다) · `atk`(지금 쓰는 공격 한 줄: `box`｜`radius`｜`shot`, `guard`, `windup` …) · `alpha`(유령의 비침 0…1) · `solid`(맞는가) · `hover`(뜬 높이 px — `y = gy + hover`) · `stagger`(튕겨져 비틀거리는 남은 초) · `stun` · `flashT` · `dying`(쓰러지는 남은 초).
`state`: `idle`(아직 못 봄) `rise`(땅에서 일어서는 중) `chase` `attack` `stagger` `dead`(쓰러지는 중 — `dying` 이 0 이 되면 `dead = true`). `anim`: `idle buried rise walk attack cast hurt stagger death`.

**깨어남(잠든 적이 영웅을 알아채는 조건)**: 앞쪽 ±105°(`sightArc`) 는 `sight` 거리까지(기본 300 · 술사 400 · 박쥐 360(사방) · 여왕 520(사방)), 옆 · 등 뒤는 150 px(`senseNear`) 안에서만, **단단한 상자(벽) 너머는 못 본다**(`sim.clearLine`), 높이 차 130 넘으면 못 본다. 맞으면 깬다. 하나가 깨면 220 px 안의 한패(같은 `group` 이면 420 px)가 같이 깬다 — 벽 너머는 아니다. 마당(`yard`) 적은 영웅이 `yard` 구역에 든 뒤에만. 지역이 달리 정하는 법(스테이지 `spawns[]` 한 줄): `sight: 500`(더 멀리 본다) · `wake: 'trigger'`(`sim.wake(e)` 나 맞았을 때만) · `face: [dx, dz]`(보는 쪽; 없으면 영웅이 들어오는 `W.start` 쪽).

**땅에서 일어나는 적**: 스테이지의 `spawns[]` 한 줄에 `rise: true` 를 주면(또는 종류에 `rise: true`) 그 적은 엎드려 누워 있다가(`e.buried`, 베이지 않고 락온되지 않는다) 영웅이 230 px 안에 오면 1.25초 동안 일어선 뒤 싸운다(`rise` 클립). 걷는 종류만 — 유령 · 박쥐는 무시한다. 기본은 꺼져 있다.

`KINDS[kind]` = `{ name(한국어), model, weapon, height(m), material, grip?, hp, speed, r, hpx(맞는 상자 높이 px), ai, attacks:[…], clips:{idle,walk,hurt,stagger,death}, floats?, fly?, hover?, pitch?(도 — 앞으로 숙여 그린다), fade?, armorFront?, elite?, boss?, wakeSound? }`. 스테이지의 `spawns[].kind` 로 쓰는 이름:

| kind | 다른 이름 | 모델 · 무기 | 키 · 재질 | 체력 · 속도 | 성격과 공격 (예고 → 판정 → 틈, 초) |
|---|---|---|---|---|---|
| `skeleton_soldier` | `melee` `soldier` | `skeleton_soldier` · `w_rusty_sword` | 1.75 · `bone` | 34 · 104 | 기본 근접. 다가와 `slash`(0.46 → 0.14 → 0.42, 10) · 조금 떨어져 있으면 `stab`(0.52 → 0.16 → 0.5, 11, 74 px 내지름). 기다리는 동안 옆으로 돈다. 한 번에 둘까지만 덤빈다 |
| `skeleton_mage` | `ranged` `mage` | `skeleton_mage` · `w_crystal_staff` | 1.85 · `bone` | 26 · 78 | 190–350 px 거리를 지킨다. `bolt`(0.8 → 쏨 → 0.45, 9; 탄 250 px/초 · `element:'blood'`). 코앞에서는 쏘지 않고 물러선다. 탄은 벨 수 있고, 튕겨내면 쏜 적에게 돌아간다 |
| `plague_corpse` | `corpse` | `plague_corpse` · — | 1.76 · `flesh` | 82 · 46 | 느리고 질기다(맞아도 공격을 멈추지 않는다). `grab`(0.8 → 0.3 → 0.95, 16, 128 px 덮침) — **막을 수 없다**(`guard:'break'`) → 구른다 |
| `grave_ghost` | `ghost` | `grave_ghost` · — | 1.95 · `ghost` | 30 · 80 | 떠서 맴돈다. 흐릴 때(`alpha` 0.3, `solid=false`)는 베이지 않는다. `swoop`(0.62 → 0.3 → 1.0, 10) 예고 중간부터 또렷해지고, 덮친 뒤 0.9초 동안만 맞는다. `sim.reveal(x,z,r,초)` 로 드러낼 수 있다(메아리 · 등불 자리) |
| `gravekeeper_armor` | `armor` | `gravekeeper_armor` · `w_grave_spade` | 2.35 · `armor` | 170 · 58 | 정예. 앞 ±80° 는 단단하다(피해 15 %, 영웅이 튕겨 밀린다) → 튕겨내 비틀거리게 하거나(1.7–1.9초 동안 어디서 쳐도 1.3배) 구르기로 등 뒤로. `slam`(1.0 → 0.16 → 1.05, 24, 반지름 118 원; 막아도 35 % 닳는다) · `thrust`(0.72 → 0.18 → 0.75, 16, 길이 196) |
| `bat` | — | `bat` · — | 0.45 · `flesh` | 8 · 200 | 작은 떼. 영웅 둘레(130–190 px)를 높이 96 px 로 맴돌다 한 마리씩 `dive`(0.36 → 0.5 → 0.3, 5). 튕겨내면 그대로 떨어진다 |
| `banshee_queen` | `boss` | `banshee_queen` · — | 2.7 · `cloth` | 900 · 70 | **보스** — §7 |

`kindOf(kind)` 가 다른 이름까지 풀어 한 줄을 돌려준다(모르는 이름은 `skeleton_soldier`). `KINDS.melee === KINDS.skeleton_soldier`.

- **판정은 보는 방향 기준 상자**다(영웅과 같다): `atk.box = { f0, f1, side, y0, y1 }`(앞으로 f0…f1, 옆 ±side) 또는 `atk.radius = { r, fwd }`(앞으로 fwd 떨어진 원) 또는 `atk.arc = { r, deg }`(부채꼴 — 여왕의 물결). 판정 모양이 없는 공격(탄 · 부르기 · 노래)의 예고 모양은 `atk.mark`, 공중에 뜨는 예고는 `atk.air` (§7). 예고 동안 `atk.track`(rad/초)로 영웅을 따라 돌다가 예고의 마지막 20 % 에서 방향이 굳는다 → 그때 옆으로 비키면 빗나간다.
- 옛 장면 코드를 위해 `TUNE[kind] = { windup, reachZ }`(첫 공격의 값)도 채워 둔다. 공격마다 예고 길이가 다르므로 새 코드는 `e.atk.windup` · `e.tele` 를 읽는다.
- **한 번에 둘까지**: 걷는 적은 둘까지만 동시에 공격한다(`sim.mayAttack`; 정예 · 보스는 예외, 나는 것은 따로 하나). 차례를 기다리는 적은 52 px 물러선 고리에서 옆으로 돈다 → 여럿이 한 점에 뭉치지 않는다.
- **길 찾기**: `sim.steer(e, wx, wz, speed, dt)` — 가려는 쪽이 0.1초 넘게 막히면 옆으로 0.55–0.75초 돌아간다(벽 모서리와 소품 사이에 끼어 서 있던 문제, requests.md envkit 3 — `play_rules_test` 가 그 자리를 그대로 재현해 본다). 걷는 적은 낭떠러지로 가지 않는다.

## 4. 기술표와 조율값

`MOVES`(`src/v2/play/moves.js`). 시간은 초, 거리는 px. 판정은 영웅이 보는 방향 기준.

| id | 클립 | 전체 | 판정 구간 | 다음 타 | 이동으로 끊기 | 판정 모양 | 내딛기 | 세기 · 피해 배수 |
|---|---|---|---|---|---|---|---|---|
| `c1` 연타 1 | `atk1` | 0.44 | 0.13–0.25 | 0.26 | 0.36 | 상자 앞 106 · 옆 ±46 | 20 | M · 1.0 |
| `c2` 연타 2 | `atk2` | 0.46 | 0.11–0.27 | 0.28 | 0.38 | 상자 앞 112 · 옆 ±54 | 22 | M · 1.1 |
| `c3` 연타 3 (넓게) | `atk3` | 0.74 | 0.20–0.38 | — | 0.58 | 부채꼴 반지름 132 · 300° | 26 | F · 1.65 |
| `sweep` 구른 뒤 훑기 | `launcher` | 0.56 | 0.12–0.27 | — | 0.42 | 부채꼴 반지름 124 · 180° | 36 | H · 1.35 |
| `whip` 모아 휘감기 | `charged` | 0.62 | 0.12–0.26 | — | 0.5 | 상자 앞 10–250 · 옆 ±40 | — | H · 1.3 × (0.7 + 0.6 × 모은 정도) · `weapon: 'whip'` |
| `plunge` 내려베기 | `plunge` | 땅에 닿을 때까지 + 0.3 | 0.06–착지 (+ 착지 원 반지름 92) | — | — | 상자 앞 84 · 옆 ±46 (아래 50 까지) | — | H · 1.5 |

- 피해 = `TUNE.dmgBase`(11) × 배수 × 0.9–1.12. 등 뒤 · 비틀거리는 적에게는 1.3배.
- 구르기는 판정이 끝나면 언제든 공격을 끊는다. 점프는 "다음 타" 시각부터.
- **칼이 판정 구간 안에서 대상을 지난다**: 클립에서 칼끝이 몸 앞을 지나는 구간(`move.strike`, 없으면 클립 자료의 `strike`)을 판정 구간에 겹쳐 튼다(`warpMove`). 구간은 `node tools/v2/play_cliptrace.mjs <clip>` 로 칼끝 궤적을 찍어 정했다. `play_motion_check` 가 기술마다 "칼끝이 가장 빠른 순간이 판정 구간 안"임을 본다.

`TUNE`(`src/v2/play/tune.js`)의 중요한 값:

| 값 | 뜻 |
|---|---|
| `runX 275` · `runZ 208` · `accel 20` | 가장 빠른 속도(좌우 · 앞뒤) · 속도가 따라가는 빠르기 |
| `turnRate 14.8` · `turnEase 30` · `turnKeep 40` · `turnSlow 0.5` | 몸이 도는 가장 빠른 빠르기(rad/초 — **장면의 `TURN_RUN` 15 를 넘기지 않는다**) · 작은 각을 따라붙는 빠르기 · 이 각(도) 안으로 꺾을 때는 속도 그대로 · 100° 에 가까울수록 이 비율까지 줄인다 |
| `pivotAt 100` · `pivotEnd 45` · `pivotRate 14.8` · `brake 18` · `sideDamp 24` | 돌아서기: 시작하는 각 · 끝나는 각(도) · 도는 빠르기(rad/초; 180° = 0.21초) · 멈추는 빠르기 · 몸이 보는 쪽이 아닌 속도(밀림 뒤)가 스러지는 빠르기 |
| `strideRun 222` · `strideWalk 74` | 한 걸음 주기에 나아가는 거리 — 달리기 · 걷기 클립의 실제 보폭(발이 미끄러지지 않게; `play_motion_check --stride` 로 다시 잰다) |
| `jumpV 720` · `gravity 2300` · `jumpCut 0.42` · `coyote 0.09` | 점프 (높이 112 px) |
| `rollT 0.46` · `rollDist 150` · `rollIfr 0.3` · `rollCd 0.62` · `rollSweep 0.26` | 구르기 |
| `parryWin 0.2` · `guardArc 100` · `guardTap 0.3` · `guardPush 130` | 막기 · 튕겨내기 |
| `lockRange 380` · `lockKeep 470` · `lockAim 230` · `aimCone 55` · `lungeMax 42` | 락온 · 조준 보정 |
| `chargeHold 0.3` · `chargeT 0.55` · `chargeMin 0.35` · `chargeKeep 0.6` · `pullT 0.2` | 모아 휘감기: 누르고 있어야 하는 시간 · 다 모으는 시간 · 이보다 덜 모으면 그냥 푼다 · 다 모은 채 버티는 시간 · 끌어오는 시간 |
| `resoCells 3` · `resoParry 0.5` | 울림 눈금 칸 수 · 튕겨낼 때 차는 양 |
| `hookRange 330` · `hookRise 280` · `hookThrow 0.16` · `hookSpeed 760` | 채찍 걸기: 닿는 거리 · 높이 차 · 던지는 시간 · 날아가는 빠르기(0.22–0.55초) |
| `callCd 6` · `callAt 0.32` · `callT 0.7` · `callR 190` · `callDur 5` · `callAim 260` | 부름: 쉼 · 빛이 놓이는 때 · 동작 길이 · 빛의 반지름 · 머무는 시간 · 락온 대상이 이 거리 안이면 그 발밑에 |
| `bellTap 0.3` · `bellCd 2.2` · `echoAt 0.2` · `echoT 0.52` · `echoR 260` · `echoReveal 3.5` · `ringT 0.8` · `knellRange 200` | 종: 짧게/길게를 가르는 시간 · 쉼 · 울리는 때 · 동작 길이 · 닿는 반지름 · 드러나 있는 시간 · 길게 차오르는 시간 · 조종이 닿는 거리 |
| `heroHp 100` · `hurtIfr 0.95` · `hurtT 0.26` · `deadT 2.1` | 몸 |
| `runLeanFix 12` · `pivotLean 9` · `chargeCoil 12` · `runBank 1.1` · `lookMax 58` · `stopSkidAbove 130` | 그림만 바뀌는 값: 달리기 클립의 숙임(26°)을 이만큼 세운다 · 돌아서며 버티는 자세의 젖힘을 이만큼 앞으로 당긴다 · 모으는 동안 윗몸을 이만큼까지 웅크린다 · 달리며 돌 때 도는 쪽으로 기우는 정도(최대 11°) · 락온한 적을 고개로 보는 최대 각도 · 이 속도 넘게 달리다 놓으면 미끄러져 서는 동작 |
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
| `pivot` | `(hero, 각 rad)` | 돌아서기 시작 (발 미끄러지는 소리 · 먼지) |
| `charge` | `(hero, 'start'｜'full'｜'release'｜'cancel', 모은 정도)` | 모으기 시작 · 다 참 · 놓음 · 끊김 |
| `pull` | `(e, 'in'｜'to', hero)` | 휘감기: 작은 적을 끌어옴 · 큰 적에게 끌려감 |
| `act` | `(hero, 'echo'｜'ring'｜'call'｜'hook')` | 도구 동작 시작 |
| `hook` | `(hero, 고리, 'throw'｜'latch'｜'land')` | 채찍 걸기: 던짐 · 걸림(이때부터 난다) · 내려섬 |
| `call` | `(hero, 누구, 'start'｜'cast'｜'end', 빛)` | 부름: 동작 시작 · 빛이 놓임(`빛 = { who, x, y, z, r, t, dur }`) · 빛이 꺼짐 |
| `bell` | `(hero, 'echo', 반지름)` | 메아리가 울림 (`hooks.fx('holy.bell', …)` 도 같이 부른다) |
| `ringLong` | `(hero, 무릎 꿇은 보스｜null)` | 길게 친 종이 다 참. 보스가 있으면 규칙이 곧 조종한다. `null` 이면 장면이 건넘을 정한다 |
| `silence` | `(e, atk?)` | 종에 주문 · 노래가 끊김 |
| `reso` | `(hero, 찬 칸 수)` | 울림 눈금의 칸이 바뀜 |
| `deny` | `(hero, 'skill', 'reso'｜'cd'｜'busy')` | 솜씨를 쓸 수 없음 |
| `heal` · `respawn` | `(hero, 찬 양)` · `(hero, 쉼터)` | 체력 채움 · 쉼터에서 일어남 |
| `kneel` · `knell` | `(e, 'down'｜'rise')` · `(e, hero)` | 보스가 무릎 꿇음 / 다시 일어남 · 조종으로 보냄 |
| `bossFlee` · `bossReturn` · `bossStagger` · `bossDown` | `(e)` · `(e)` · `(e)` · `(e, knelled)` | 보스가 그 밤으로 달아남 · 돌아옴 · 크게 비틀거림 · 쓰러짐 |
| `summon` · `pulse` | `(보스, 유령)` · `(보스, atk)` | 유령을 부름 · 배웅가의 울림 한 번 |

규칙이 스스로 내는 효과(`hooks.fx` — FX.md 의 프리셋 이름): `holy.bell`(메아리 · 길게 친 종) · `holy.wave`(부름의 빛 · 여왕의 물결) · `holy.pillar`(조종) · `ice.nova`(비명). 소리 `hooks.sound('bell.toll')`(길게 친 종).

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

## 7. 보스 — 밴시 여왕 (`KINDS.banshee_queen`, `AI.boss`)

GDD §4 ① · §9.1(104–114분): "조종을 쳐 노래를 깨고, 그 밤으로 달아나면 쫓아 건너 몰아내고, 오늘 밤으로 돌아와 조종으로 보낸다." 규칙이 맡는 것은 싸움이고, 건넘 · 그 밤의 장면은 장면(ENGINE) · 이야기의 일이다.

| 공격 (`atk.id` · `label`) | 클립 | 예고 → 판정 → 틈 (초) | 판정 · 예고 모양 | 피해 · 막기 | 답 |
|---|---|---|---|---|---|
| `wail` 울음 탄 | `cast_channel` | 0.75 → 쏨 → 0.7 | 탄 셋(부채 20° 간격, 235 px/초, `element:'ice'`). 예고 = 바닥의 길 셋(`mark.box` 길이 430 · `mark.fan 3`) — 예고가 가리킨 쪽으로 쏜다 | 10 · 막힌다 · 튕겨내면 되돌아간다 | 옆으로 비킨다 / 튕겨낸다 |
| `sweep` 울음 물결 | `cast_sweep` | 0.9 → 0.2 → 0.95 | 부채꼴 반지름 205 · 210°(`arc`) — 등 뒤는 안 맞는다 | 16 · 막힌다 · **튕겨낼 수 있다**(비틀거림 눈금 +40) | 튕겨내고 틈에 친다 |
| `scream` 비명 | `scream` | 1.15 → 0.25 → 1.25 | 둘레 원 반지름 235. 예고 = 공중의 고리(`air`)가 커지고 바닥 원이 찬다 | 14 · **막을 수 없다** · 맞으면 0.8초 굳는다 | **메아리로 끊는다**(예고 중: 곧 비틀거린다) / 굴러 흘린다 / 원 밖으로 |
| `summon` 유령 부르기 (2막) | `cast_big` | 1.3 → 부름 → 0.8 | 무덤 유령 둘(동시에 둘까지). 예고 = 나올 자리의 원 둘 | — | 세라의 등불로 굳히고 벤다 |
| `song` 배웅가 (2막) | `cast_channel` | 1.0 → 4.0 → 1.1 | 반지름 330 안에 0.7초마다 울림(`pulse`): 5 피해 + 울림 눈금 −0.2 | 막을 수 없다 | **메아리로 끊는다**(노래 중 언제든: 곧 비틀거린다) / 원 밖으로 |

- **막**: 1막(체력 50 % 까지)은 울음 탄 · 물결 · 비명. 절반에서 **그 밤으로 달아난다**: 사건 `bossFlee`, `e.fled = true`, 맞지 않고 흐려진다(`alpha` 0.12). 장면이 쫓아 건너는 연출을 하려면 `e.fleeHold = true` 로 붙들어 두고 끝나면 `sim.bossReturn(e, { hp?, x?, z? })`. 아무것도 안 하면 4초(`fleeAuto`) 뒤 스스로 돌아온다. 돌아오면 2막(`e.bphase === 2`): 유령 부르기 · 배웅가가 더해지고 쉼이 0.25초 짧다. 스테이지에서 `{ kind: 'banshee_queen', phase: 2 }` 로 2막부터 세울 수도 있다(그 밤의 싸움터용).
- **비틀거림 눈금** `e.poiseHp / def.poiseMax(100)` (= `e.staggerK` 0…1): 타격 = 피해 × 0.45(셋째 타 ×1.5 · 휘감기 ×2.2) · 튕겨내기 +40 · 세라의 등불 +40 · 그냥 메아리 +12 · **비명의 예고나 배웅가를 메아리로 끊으면 곧 가득**. 가득 차면 2.6초 비틀거리고(`bossStagger`, 그동안 어디서 쳐도 1.3배) 눈금은 0 으로.
- **끝**: 베어서는 끝나지 않는다. 체력이 4 %(`kneelAt`)에 닿으면 무릎 꿇고(`e.kneel`, 사건 `kneel`, `hero.knellId`) 조종을 기다린다 — 200 px 안에서 종을 **길게** 끝까지 누르면 보낸다(`knell` → `bossDown(e, true)`, 2.4초에 걸쳐 스러진다). 12초 두면 15 % 로 다시 일어난다(막히지 않게).
- **HUD**: `sim.bossState()` → `{ id, name, hp, hpMax, stagger(0…1; 비틀거리는 동안 · 무릎 꿇은 동안 1), phase(1｜2), kneel, fled, staggered, sub(지금 예고 중인 공격 이름) }` 또는 `null`(한 객체를 다시 쓴다). 적 칸: `e.bphase · e.poiseHp · e.staggerK · e.kneel · e.fled · e.fleeHold · e.name`.
- 시험 조종(`tools/v2/play_bot.mjs`): `bossBot`(예고를 읽는다) 은 40–47초에 이기고(체력 58–68 남김), `naiveBot`(다가가 공격만) 은 55–77초에 진다 (`play_rules_test` 의 씨앗 다섯).
- 숫자는 폴드에서 해 보고 고칠 값이다(체력 900 · 예고 길이 · 눈금).

## 8. 시험 화면과 검사

- `tools/v2/play_view.html` — 평평한 마당에서 진짜 규칙을 돌려 카엘의 모든 기술(여덟 방향)과 적 여섯 종을 본다. 단추: 시범 고르기 · 카메라(게임/높이/가까이/옆/앞/위/적 가까이) · 판정 보기 · 느리게 · 멈춤. `?demo=free` 는 직접 조작(방향키/WASD · J 공격 · K 점프 · L 구르기/막기 · O 락온).
- `node tools/v2/play_shot.mjs [이름…]` — 그 화면을 헤드리스로 띄워 붙임 그림을 `/tmp/claude-0/v2/play/` 에 찍는다(`--list` 로 묶음 목록, `--gallery="clip:초,…"` 로 클립 자세만).
- `node tools/v2/play_rules_test.mjs` — 규칙(화면 없음): 기술 · 여덟 방향 판정 · 구르기 무적 · 막기/튕겨내기 · 락온 · 여섯 종 · 끼임 · 사건.
- `node tools/v2/play_motion_check.mjs [--stride]` — 뼈대 숫자로: 칼이 판정 구간 안에서 몸 앞을 지나는가 · 디딘 발이 미끄러지지 않는가 · 반전 때 한쪽으로만 도는가 · NaN · 클립 이름 · 달리기 숙임/기울임 · 락온한 적 보기 · 박쥐 숙임.
- `node tools/v2/play_cliptrace.mjs <clip…>` — 칼끝 궤적 · 골반 높이 · 숙임을 시간순으로 찍는다(판정에 맞출 구간을 고를 때).
- `node tools/v2/play_alloc.mjs [--profile] [--entry=다른 index.js]` — 규칙 · 몰이가 틱마다 만드는 바이트(§12).
- `tools/v2/play_bot.mjs` — 보스전 시험 조종 둘(`bossBot` · `naiveBot`). 시험 화면과 규칙 검사가 같이 쓴다.
- 3차에 더한 시범: `rev4`(반전 네 축 · 직각 · 빠른 좌우) · `ready`(준비 자세) · `lunge`(내딛기) · `charge` · `chargeBig`(휘감기) · `hook` · `call` · `echo` · `knell` · `boss`(자동으로 이긴다) · `bossTell` · `bossFar` · `bossSweep` · `bossScream` · `bossSummon` · `bossSong` · `boss2`. 직접 조작(`?demo=free`): J 를 누르고 있기 = 모으기 · I 솜씨 · U 종(누르고 있으면 길게). `?legacy=1` = 2차의 돌기 방식(비교용; `play_shot.mjs --legacy`).

## 10. 도구 — 모아 휘감기 · 솜씨 · 종 (GDD §7)

| 무엇 | 입력 | 규칙 | 상태 · 사건 | 클립 |
|---|---|---|---|---|
| **모아 휘감기** | `attackHeld` 0.3초 넘게 (연타의 판정 뒤 · 서서) | 제자리에서 모은다(스틱으로 방향을 돌릴 수 있다, 구르기로 끊는다). 놓으면 `MOVES.whip`: 250 px 앞까지. **작은 적(무게 0.5 미만)은 영웅 앞으로 끌어오고**(0.2초, 0.6초 굳음) **큰 적 · 정예 · 보스에게는 영웅이 끌려간다**(갑주의 앞면이 막아도 감긴다) | `charging` · `charge` · 사건 `charge` · `pull` · `whipOn` | `charged` (모으기 0.5–0.84초 → 휘두름 0.93–1.13초) |
| **솜씨: 채찍 걸기** | `skill`, 고리가 330 px 안 | 0.16초 던지고 → 고리의 내릴 자리(`to`, 없으면 고리 아래)로 포물선으로 난다(0.22–0.55초, 그동안 무적). 고리는 `W.hookPoints` / `sim.hookPoints` | `skillMode 'hook'` · `hookId` · `act 'hook'` · 사건 `hook` · `whipOn` | `thrust` → `air` → `land` |
| **솜씨: 부름** (세라의 등불) | `skill`, 고리가 없을 때 | 울림 한 칸 + 쉼 6초. 0.32초 뒤 빛의 동그라미(반지름 190, 5초; 락온 대상이 260 px 안이면 그 발밑, 아니면 영웅 앞 80 px): **안의 유령은 드러나 굳고**(빛이 있는 동안) 다른 적은 0.9초 비틀거린다(큰 적은 움찔), 보스는 눈금 +40. `sim.lights[]` | `skillMode 'call'` · `callCd` · 사건 `call` · `deny` | `point` |
| **종: 메아리** | `bell` 을 0.3초 안에 뗌 | 0.2초 뒤 울린다: 반지름 260 안의 숨은 유령이 3.5초 드러나고(`sim.reveal`), 주문을 외던 적은 끊기고(`silence`), 보스의 비명 예고 · 배웅가는 끊겨 곧 비틀거린다. 쉼 2.2초. 눈금을 쓰지 않는다 | `act 'echo'` · `bellCd` · `bellOk` · 사건 `bell` | `cast_raise` |
| **종: 길게** | `bell` + `bellHeld` 0.3초 넘게 | 종 조각을 들고 서서 0.8초 차오른다(`bellCharge`). 다 차면 `ringLong(hero, 무릎 꿇은 보스｜null)`: 보스가 200 px 안에 무릎 꿇고 있으면 **조종**(`sim.knell`), 없으면 **장면이 건넘을 정한다**(규칙은 종이 어디 걸려 있는지 모른다). 다 차기 전에 놓으면 메아리가 된다. 맞으면 끊긴다 | `act 'ring'` · `bellCharge` · `knellId` · 사건 `ringLong` · `knell` | `cast_big` |

- 종을 칠 수 있는 때 = `hero.bellOk`: 땅에 서 있고, 구르는 중 · 공격의 판정 전 · 다른 도구 중이 아니고, 쉼이 끝났을 때. 건넘은 장면의 일이라 규칙은 이것과 `ringLong` 만 알려 준다.
- 고르는 판(솜씨 길게)은 만들지 않았다. 부를 사람은 `sim.setCaller('sera'｜null)`.

## 11. 장면을 위한 것 (쉼터 · 구역 · 물음)

- `sim.heal(n｜'full')` → 찬 양 · `sim.respawnAt(x, z)`: 쉼터를 정하면 쓰러진 뒤 그 자리에서 가득 찬 체력으로 일어난다(쓰러진 적은 그대로, 살아 있는 적은 제자리로 돌아가 잠들고, 보스는 처음부터). `sim.respawnAt(null)` = 예전처럼 처음부터(`sim.reset`).
- `sim.here` = 늘 영웅이 선 구역 id. `sim.section` 은 마당을 다 치우면 `'done'` 에 멈춘다(시범 구간의 옛 약속) — `sim.freezeSection = false` 면 멈추지 않는다.
- `sim.caps = { charge, skill, bell, boss, heal, rest }` · `sim.setCaller(id)` · `sim.hookPoints` · `sim.lights` · `sim.knell(e)` · `sim.bossReturn(e, o)` · `sim.bossState()` · `sim.addReso(칸)` · `sim.addPoise(e, v)` · `sim.clearLine(x0, z0, x1, z1, y)`.
- 행동 함수용(숫자 인자를 넘기지 않는 판 — §12): `sim.faceHero(e, dt)` · `sim.steerHero(e, f(영웅 쪽 +1/−1), s(옆 ±1), k(빠르기 배수), dt, straight)`. 옛 `turnTo` · `steer` 도 그대로 있다.

## 12. 틱마다 만드는 쓰레기 (`node tools/v2/play_alloc.mjs`)

재는 법: 젊은 세대를 1 GB 로 잡아 재는 동안 수집이 한 번도 돌지 않게 하고(`--trace-gc` 로 0 번임을 센다), 100,000 틱 동안 젊은 세대가 자란 만큼을 틱 수로 나눈다. `--profile` 은 표본 프로파일로 함수별 출처를 찍는다.

| 장면 | 2차 (커밋 98e7cd9) | 지금 (열 번 잰 값의 범위 — 01:00–01:47; 기계가 바쁠 때 높게 나온다) |
|---|---|---|
| 규칙: 싸움(영웅 + 적 여섯) | 4,716 바이트/틱 | 663–1,195 |
| 규칙: 적 여섯, 영웅은 막기만 | 5,657 | 267–1,015 |
| 규칙: 달리기 · 반전만 | 584 | 7–190 |
| 규칙: 보스 | — | 216–1,322 |
| 규칙 + 몰이: 싸움 | 8,823 이상(재는 동안 수집 3번) | 1,050–1,920 |
| 규칙 + 몰이: 달리기 | 8,244 | 320–670 |

(몰이 줄은 01:21 에 장면의 자세 입히기(`src/v2/game/anim.js`)가 할당을 없앤 뒤의 값이다. 그 전에는 규칙 + 몰이 달리기가 6,230–7,890 이었고 그 가운데 PLAY 몫은 `driveHero` 300 이었다.)

- **0 이 아니다.** 무엇이 문제였나: ① 적 객체가 놀이 도중에 칸을 더해 모양이 여러 가지였다 → 그 객체를 읽는 모든 코드가 느린 길로 떨어져 실수 칸을 읽을 때마다 16 바이트 상자를 만들었다. 모든 칸을 태어날 때 만들고 한 번 굳힌다(`sim.js settle`). ② 실수를 함수 인자 · 반환값으로 넘길 때마다 상자가 생긴다(엔진이 그 함수를 끼워 넣지 못하면). 틱마다 부르는 길(땅 높이 · 옮기기 · 적 걸음 · 방향 돌리기 · 판정)은 `Sim` 의 칸으로 주고받게 바꿨다. ③ `Math.hypot`(32곳) → `Math.sqrt`. ④ 공격마다 새 `Set` · 구르기마다 새 객체 · 길 찾기의 배열 · `pick(...)` 의 인자 배열 · `subarray`.
- **남은 것**: `_hero`(300줄짜리 한 함수라 엔진이 일부만 다듬는다) 안의 상자 6–25개/틱, 사건 때의 객체(타격 `info` · 탄 · 부름의 빛 — 틱마다가 아니다), 공격 중인 적의 `runAttack` 130 쯤. 몰이 쪽 PLAY 몫: `driveHero` 270–310 · 적 하나에 `driveActor` 20–40 + 공격 중 `warpAttackPO` (실수를 `TG · GT · WM · PB` 칸과 `_oT.time` 으로 주고받게 바꿨지만 0 까지는 못 갔다 — 어디서 나는지 끝까지 못 찾았다). 얼린 폴더의 `char3d/skel.js qnorm`(`Math.hypot`) · `mixPose` 가 싸움에서 100–190 씩 남아 있다(requests.md).
- 값은 돌릴 때마다 흔들린다(엔진이 그때그때 다르게 다듬는다). 기기에서 다시 잴 것.

## 9. 장면(ENGINE)이 해 주면 좋은 것

`/tmp/claude-0/v2/requests.md` 의 "play (2차)" 절과 같다: ① (필요 없어짐 — 박쥐 숙임은 `driveActor` 가 뼈에 넣는다) ② 유령 비침: `driveActor` 가 `ch.opt.alpha = e.alpha` 를 적는다(`ch.opt` 가 있을 때 — 장면의 `Actor3D`). 장면이 스스로 `e.alpha` 를 읽어 테두리 빛까지 다루면 더 좋다 ③ `hooks.guard` → 막기 소리 ④ `hero.lock` 표식 ⑤ `e.tele`/`tell` 예고 표시 ⑥ `step` 훅으로 발소리(지금은 장면이 96 px 마다 낸다 — 클립의 발과 어긋난다).

## 상태

| 무엇 | 상태 |
|---|---|
| 공개 이름 · 규칙(영웅 기술 여섯 · 구르기 · 막기/튕겨내기 · 락온 · 돌아서기 · 도구 셋 · 울림 눈금 · 적 여섯 종 · 깨어남 · 끼임 · 보스 · 쉼터) | 동작 — `play_rules_test` 113/113 (시범판 B 의 세계와 환경 키트 세계 둘 다에서) |
| 움직임(`driveHero` · `driveActor` — 라이브러리 클립) | 동작 — `play_motion_check` 53/53, 붙임 그림 52묶음(`node tools/v2/play_shot.mjs` → `/tmp/claude-0/v2/play/`)으로 눈으로 봄 · 본 게임 장면(`v2g`)에서 오류 없이 돈다(`tools/v2/game_probe.mjs`) |
| 모아 휘감기 · 솜씨(채찍 걸기 / 세라의 등불) · 종(메아리 / 길게 → 조종) · 보스 밴시 여왕 | 동작 (규칙 · 시험 화면). 장면에 꽂는 것 — 입력 `skill` · `bell` · `bellHeld`, 예고 표시, 빛, 고리, 보스 막대 — 은 장면 · UI 의 일(requests.md "PLAY-2") |
| 약한 곳 | 반전의 버티는 자세가 여전히 크게 젖는다(클립 `run_stop`; 윗몸만 9° 세웠다) · 내딛을 때 앞발은 아직 미끄러진다(땅에 닿은 발 43 %) · 걷기의 발 미끄러짐 18 % · 모으는 자세가 밋밋하다 · 채찍 전용 동작이 없다(칼 휘두름 클립 + 띠) · 여왕의 손은 주먹(노래하는 손 못 함) · 무릎 꿇음은 숙인 채 떠 있는 자세 · 솜씨의 고르는 판 없음 · 틱마다 쓰레기가 0 은 아니다(§12) |
