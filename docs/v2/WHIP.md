# WHIP — 채찍 비질리아 (`src/v2/whip/`)

2026-11-18 · 담당 WHIP · 공개 면은 `src/v2/whip/index.js` 하나 · 검사 `node tools/v2/whip_check.mjs` · 보기 `tools/v2/whip_view.html` · 찍기 `node tools/v2/whip_shot.mjs` · 소유자 그림 `/tmp/claude-0/v2/owner_whip.png`

**바뀐 것**
- 01:20 끝 판. 첫 판과 달라진 것: ① 규칙 상태 → 채찍 모드는 `driveWhip(whip, hero, TUNE, pull)` 한 줄이 한다(§5) ② 끝 뒤의 궤적 띠는 효과 엔진의 띠가 아니라 **채찍 자기 메시의 일부**다(틱 사이를 매끄럽게 잇기 위해) — `whipFx().update()` 는 할 일이 없어졌다 ③ `whip.writeMesh` 대신 `writeWhipMesh(whip, vtx, alpha, tmp)` ④ 모드 `spin`(모으는 동안 머리 위로 돌린다) 추가 ⑤ 그리기에 `wr.tint` · `wr.flash` · `wr.alpha` ⑥ **끈이 다 펴지는 때는 판정 구간이 열리는 순간**이다(규칙이 구간 첫 틱에 맞히기 때문 — §6)
- 00:45 첫 판 (규약만)

## 0. 한눈에

채찍은 모델이 아니다. 마디 16개(낮음 12 · 높음 20)의 사슬을 틱마다 계산하고, 그 위에 **땋은 가죽 끈 · 쇠고리 · 종 조각 · 손잡이**를 프레임마다 한 버퍼에 다시 짠다. 기술마다 적어 둔 끝 궤적을 따라가므로 같은 공격은 언제나 같은 모양이고, 판정이 끝나면 물리(길이 · 중력 · 감쇠 · 땅 · 몸 피하기)가 이어받아 흘러내린다.

```js
import { createWhip, WhipRenderer, whipFx, driveWhip } from '../whip/index.js';

const link = whipFx(fx, feel);                                   // (선택) 사건 → 효과 · 소리 · 진동 기본 배선
const whip = createWhip({ tier: 'mid', onEvent: link.onEvent });
const wr   = new WhipRenderer(gl);                               // WebGL2. 자기 프로그램 · VAO · 버퍼

// 틱마다 (규칙이 돌고, 영웅 뼈대가 자세를 잡은 뒤)
whip.handFromMatrix(heroActor.WM, hand);                          // 손잡이 자리 · 방향 (§1)
driveWhip(whip, sim.hero, TUNE, pull);                            // 규칙 상태 → 채찍 모드 (§5)
whip.update(dt, hand);                                            // dt = 0 (타격 멈춤)이면 세계와 함께 멈춘다

// 프레임마다 (캐릭터를 그린 뒤, 반투명 효과보다 먼저)
wr.draw(whip, env, alpha);                                        // 그리기 한 번 (+ 종 조각 빛무리 · 궤적 띠를 더하는 한 번)
```

- 좌표는 놀이 세계 그대로: x 오른쪽 · y 위 · z 화면 안쪽, 단위 논리 px (1 m = 58). 끈 기본 길이 96 px(약 1.65 m).
- **틱마다도 프레임마다도 새로 만드는 것이 없다.** 사건에 넘기는 `e` 도 하나를 돌려 쓴다(받은 쪽이 값을 꺼내 쓰고 붙들지 않는다). `set()` 에 넘기는 객체도 읽기만 하고 붙들지 않는다 — 장면도 한 객체를 돌려 쓰면 된다.
- 파일: `sim.js`(사슬 · 모드) · `shapes.js`(기술별 끝 궤적) · `mesh.js`(메시 짜기) · `render.js`(WebGL2) · `drive.js`(규칙 상태 → 모드) · `fxlink.js`(사건 → 효과 · 소리). `src/v2/play/moves.js`(판정 구간) · `src/v2/fx/engine.js`(입자 명세)만 읽어 온다.

## 1. `createWhip(opts)` · `update` · 읽는 값

| opts | 기본 | 뜻 |
|---|---|---|
| `tier` | `'mid'` | `'low'`(마디 12) · `'mid'`(16) · `'high'`(20). 설정이 바뀌면 다시 만든다(싸다: 배열 몇 개) |
| `length` | 96 | 끈의 기본 길이(px). 기술마다 0.7–1.5배 안에서 저절로 맞추고, 휘감기 · 걸기 · 먼 종 치기에서는 풀려 나간다 |
| `onEvent` | — | `(name, e)` — §4 |
| `ground` | 0 | 땅 높이 기본값 (`hand.ground` 로 틱마다 준다) |
| `teleport` | 220 | 손이 한 틱에 이보다 멀리 가면 끈 전체를 같이 옮긴다(지역 이동 · 되살아남 — 속도가 생기지 않는다) |

`whip.update(dt, hand)` — `hand` 는 장면이 가진 객체 하나(읽기만 한다):

| 칸 | 뜻 |
|---|---|
| `x y z` · `dx dy dz` | 손잡이를 쥔 자리 · 손잡이가 가리키는 방향(끈이 나가는 쪽). `whip.handFromMatrix(WM, hand)` 가 무기 행렬(원점 = 쥔 자리, +Y = 끈 쪽)에서 채운다 — 지금의 검 자리(`GRIPS.blade`) 그대로 맞는다 |
| `bx by bz` · `br`(12) · `bh`(104) | 영웅 발밑 자리 · 몸 반지름 · 키. 끈(넷째 마디부터)이 이 원통 안으로 들어오지 않는다 |
| `fx fz` | 영웅이 보는 방향(`hero.dirX, dirZ`) — 끝 궤적의 기준. `set('swing', { dirX, dirZ })` 로 주면 그것이 먼저다 |
| `ground` | 발밑 땅 높이 (끈이 그 아래로 내려가지 않는다. 벽 · 소품과는 부딪치지 않는다 — §8) |

- `dt` 는 놀이 dt 그대로. **0 이면 한 마디도 움직이지 않고**(검사: 비트까지 같다) 다음 틱에 그대로 잇는다. 느린 화면(dt 가 작음) · 큰 dt(1/30 을 넘으면 안에서 넷까지 쪼갠다) 모두 된다.
- `whip.reset(hand)` — 손 아래로 곧게 늘어뜨려 다시 시작(지역을 새로 불렀을 때). `whip.warp(dx, dy, dz)` — 직접 옮기기.
- 읽는 값: `whip.nodes`(Float32Array, 마디 × 3, 0 = 손잡이 쪽) · `whip.n` · `whip.tip`(`{x,y,z, vx,vy,vz, speed}`) · `whip.root`(끈이 손잡이에서 나오는 점) · `whip.mode` · `whip.len`(지금 끈 길이) · `whip.ext`(0..1 펴진 정도 = 손→끝 거리 ÷ 길이) · `whip.taut`(0..1) · `whip.glow` · `whip.flash` · `whip.sample(alpha, out)`(틱 사이 보간한 마디).
- 쓰는 값: `whip.resonance = 0..1`(울림 눈금 — 종 조각 빛이 밝아진다) · `whip.glowCol`(빛 색, 기본 따뜻한 금빛 `[1, 0.84, 0.48]` — 밤마다 바꿔도 된다).

## 2. `whip.set(mode, params)` — 틱마다 불러도 된다 (`driveWhip` 이 이것을 부른다)

| mode | params | 하는 일 |
|---|---|---|
| `rest` | `{ style: 'coil'｜'hang' }` | `coil` = 손에 사려 쥔다(달리면 흔들린다. 기술이 끝난 뒤 0.3초 늘어져 있다가 0.45초에 걸쳐 감아 쥔다) · `hang` = 늘어뜨린다(쓰러졌을 때) |
| `stow` | — | 손이 바쁠 때: `hand` 로 허리 자리를 주면 거기에 더 작게 사려 건다 |
| `swing` | `{ move, t, dirX, dirZ, hit?, dur?, landT?, x?, y?, z? }` | 기술 하나. `move` = 규칙의 id(`c1 c2 c3 sweep whip plunge`) 또는 채찍만 아는 모양(`launcher charge far`), `t` = `hero.moveT`. `hit` · `dur` 를 주면 그 박자를, 없으면 `MOVES[id]` 를, 그것도 없으면 모양표의 어림값을 쓴다. `landT` = `hero.plungeLand`(내려치기). `x y z` = 겨눌 점(`far`) |
| `spin` | `{ level }` | 모으는 동안: 손 위에서 올가미처럼 돌린다(`level` 0..1 이 찰수록 빠르고 크게) |
| `crack` | `{ x, y, z, strength }` | 맞은 순간 한 번(`hooks.hit` 에서). 끝이 튕기고 `crack/hit` 사건이 난다. 같은 휘두름의 헛침 소리(`crack/air`)는 나지 않는다 |
| `wrap` | `{ x, y, z, r, phase: 'throw'｜'hold'｜'pull', t?, throwT? }` | 휘감기. `throw` = 끝이 날아간다(0.13초) → 감김 `wrap.catch` → 대상(반지름 `r`, 세로축)을 1.6바퀴 감고 팽팽한 직선. `pull` = 당긴다(`wrap.pull`; 대상이 다가오면 끈이 줄어든다). 처음부터 `hold/pull` 로 부르면 던짐 없이 바로 감긴다(휘감기 기술이 맞은 뒤) |
| `hook` | `{ x, y, z, phase: 'throw'｜'release', t?, throwT? }` | 걸기. 끝이 고리로 날아가 `throwT` 뒤에 걸린다 → `hook.catch` → 팽팽한 직선(걸린 직후 떨림, 작은 반짝임이 줄을 타고 흐른다). 다른 모드로 바꾸거나 `release` 면 풀려 돌아온다 |
| `ring` | `{ kind: 'short'｜'long', t, hit?, dur? }` | 종 조각을 울린다. 짧게 = 손목으로 튕겨 든 손 위로 세운다 · 길게 = 모으는 동안 몸 둘레로 감아 올리다가 다 차면 머리 위로 한 바퀴 → `ring` 사건(창의 한가운데) |

## 3. 그리기

- `new WhipRenderer(gl, { glow: true, trail: true, minPx: 1.8, tone: [0.50, 0.30, 0.17], rim: 0.5, trailCol: [1.5, 1.05, 0.5, 0.9] })`
- `wr.draw(whip, env, alpha)` · `wr.restore()`(컨텍스트를 되찾은 뒤) · `wr.destroy()` · `wr.stats`(`draws tris verts bufBytes`)
- 프레임마다 바꾸는 값(캐릭터의 그리기 옵션과 같은 뜻): `wr.tint`(Float32Array 3 — 자리의 빛 물들임) · `wr.flash`(0..1 맞았을 때 번쩍임) · `wr.alpha`(무적 깜박임).
- `env` = 캐릭터 그리기(`cr.begin`)에 주는 것 그대로 `{ vp(16), eye[3], fog:{near,far,max,color}｜null, sunDir[3], sun[3], amb[3] }` + (선택) `viewport:[w,h]`(없으면 그리기 버퍼 크기) · `lightPos` · `lightCol`(`fx.lights.pos` · `.col` — 앞의 넷을 읽는다).
- `alpha` = 틱 사이 보간(0..1). 장면이 영웅을 보간해 그리면 같은 값을, 틱 자리에 그리면 1 을 준다. `dt = 0` 인 틱 뒤에는 어떤 값을 줘도 멈춘 모양 그대로다.
- **끈**은 카메라를 보는 띠지만 조각 셰이더가 원통 법선 · 땋은 무늬 · 가닥마다의 볼록함을 계산해 장면의 달빛 · 둘레빛 · 효과 점광을 받는다. 가장자리는 알파로 부드럽게(화면 미분 사용) — 캔버스 안티에일리어싱이 꺼져 있어도 계단이 지지 않는다. **화면 굵기는 `minPx`(1.8 px) + 부드러운 가장자리 아래로 내려가지 않는다**(정점 셰이더가 그 자리의 px/단위를 재서 넓힌다).
- **손잡이**(감은 가죽 손잡이 · 청동 코등이 · 자루 끝 · 쇠고리)와 **종 조각**(면이 열 개인 깨진 청동 조각, 끝에서 천천히 돌며 면마다 빛을 다르게 받는다)은 진짜 입체 조각이고 같은 버퍼에 들어간다.
- 둘째 그리기(더하기 섞기, 깊이 쓰지 않음): 종 조각의 빛무리(울림 · 번쩍임에 따라 커진다)와 **끝이 지나간 자리의 궤적 띠**(지난 10틱의 끝 자리를 곡선으로 이은 것 — 살아 있을 때만 그린다).
- `draw` 뒤의 GL 상태: VAO = null · 섞기 `(ONE, ONE_MINUS_SRC_ALPHA)` · 깊이 시험/쓰기 켬 · 뒷면 제거 끔. **프로그램 · 버퍼 · 속성 포인터는 부른 쪽이 다시 잡는다**(캐릭터 그리기와 같은 약속).
- 자기 렌더러로 그리려면: `const I = meshInfo(whip)`(`verts floats idx nMain nGlow nTrail tris`) → `writeWhipMesh(whip, vtx /* Float32Array(I.floats) */, alpha, tmp /* Float32Array(whip.n * 3) */)`. 정점 = float 10개 `pos xyz | aux xyz | u, v, 반지름, 종류`(종류: 0..1 끈(가죽..쇠) · 2 손잡이 가죽 · 3 청동 · 4 종 조각 · 6 빛무리 · 7 궤적) — 자세한 뜻은 `mesh.js` 머리말.

## 4. 사건 — `onEvent(name, e)`

`e = { x, y, z, dx, dy, dz, strength('L'｜'M'｜'H'｜'F' — 규칙의 `str`), move, kind }`

| name | 언제 | `whipFx(fx, feel)` 가 하는 일 |
|---|---|---|
| `swing` | 끈이 풀려 나가기 시작 | (기본은 아무것도 — 휘두름 소리는 규칙의 `swing` 훅에서 `feel.swing('whip', …)`. `whipFx(fx, feel, { swingSound: true })` 면 여기서 낸다) |
| `crack` | `kind:'air'` 끈이 다 펴진 순간(헛쳐도) · `kind:'hit'` 맞은 순간 | 끝에 번쩍임 + 불티 고리(끈 방향 가로로 퍼진다) + 빛 고리 + 짧은 점광. 헛침일 때만 소리 `whip_crack` · 진동 `tap` (맞은 소리는 장면의 `bridge.strike(…, 'whip', …)` 가 낸다) |
| `wrap.throw` · `wrap.catch` · `wrap.pull` | 던짐 · 감김 · 당기기 시작 | 감김: 찬 불티 + 고리 + `feel.hit('whip', 'bone', 'L')` · 당김: 약한 흔들림 + `feel.swing('whip', 'H')` |
| `hook.throw` · `hook.catch` · `hook.release` | 던짐 · 걸림 · 풀림 | 걸림: 찬 불티 + 고리 + `feel.hit('whip', 'armor', 'L')` |
| `ring` | 종 조각이 울림 (`kind: 'short'｜'long'`) | 금빛 고리(길게는 둘) + 떠오르는 금빛 티 + 점광 + `feel.bell('still'｜'toll')` — 규칙이 이미 `bell.toll` 을 내면 `whipFx(fx, feel, { sound: false })` |
| `drag` | 끝이 땅을 빠르게 긁음(0.12초에 한 번까지) | 먼지 조금(낮은 단계에서는 없음) |

## 5. 규칙 상태 → 채찍: `driveWhip(whip, hero, TUNE, pull)`

틱마다 `whip.update` 앞에서 한 번. 읽는 칸: `dead · act · actT · actDone · charging · charge · move · moveT · dirX · dirZ · plungeLand · whipX/Y/Z`.

| 규칙 상태 | 채찍 |
|---|---|
| `pull` 이 있음(휘감긴 것 `{x, y, z, r}` — 장면이 `hooks.pull(e)` 에서 받아 `e.pullT > 0 ｜ hero.pullT > 0` 인 동안 준다. `y` = 감기는 높이) | `wrap` (pull) |
| `act === 'hook'` | `hook` (고리 = `whipX/Y/Z`, `t = actT`, `throwT = TUNE.hookThrow` → 규칙의 `latch` 와 같은 틱에 걸린다) |
| `act === 'echo'` | `ring` short (울림 = `TUNE.echoAt`) |
| `act === 'ring'` | `ring` long (모으는 동안 감아 올리고, `actDone` 이 되면 머리 위 한 바퀴 — 울림 = `TUNE.ringT`) |
| `charging` | `spin` (`level = charge`) |
| `move` | `swing` (`move.id`, `moveT`, `move.hit`, `move.dur`, `plungeLand`) |
| `dead` | `rest` hang · 그 밖 | `rest` coil |

규칙에 새 기술이 생기면 `MOVES` 에 `id` · `hit` · `dur` · 판정 모양만 있으면 따라간다. 모양표(`WHIP_SHAPES`)에 같은 id 가 없으면 `c1` 모양으로 돌고 `whip_check` 가 "자기 궤적 없음"으로 실패한다 → `shapes.js` 에 한 줄 더한다(다른 이름은 `WHIP_ALIAS`).

## 6. 기술별 모양 (`shapes.js`)

끝 궤적은 영웅 기준 `(앞, 오른쪽, 위)` px 의 열쇠 자리들이다. 열쇠마다 "얼마나 세게 그 모양을 잡는가"(0 = 물리에 맡김 … 1 = 그대로)와 "남는 끈이 불룩해지는 쪽"이 있다.

- **규칙은 판정 구간의 첫 틱에 맞힌다.** 그래서 끈은 **구간이 열릴 때 다 펴져 대상에 닿고**(구간의 8 % 지점), 감았다 내뻗는 것은 그 앞의 준비 시간에, 지나간 뒤의 흐름은 구간 안에서 일어난다. 끝이 가장 빠른 때는 구간이 열리는 바로 그 틱 앞뒤다(검사 허용 ±0.02초).
- 다 펴졌을 때도 끈은 곧은 막대가 아니다: 길이의 5.5 % 를 남겨(펴진 정도 0.945) 손에서 곧게 나가다가 **끝이 위에서 휘어 감기며** 대상에 닿는다. 준비 동작에서는 끝이 손에서 끈 길이의 78 % 넘게 멀어지지 않는다(늘 휘어 있다).
- 끈 길이는 기술마다 "다 펴진 끝이 판정 모양 안의 그 점에 닿도록" 맞춘다(연타 1 약 97 px · 연타 3 약 101 px · 휘감기 약 235 px · 내려치기 144 px).

| id | 무엇 | 끝이 닿는 점 (앞 · 오른쪽 · 위) |
|---|---|---|
| `c1` | 오른쪽 뒤로 감았다가 가슴 높이로 가로 후려침 → 왼쪽으로 지나간다 | 100 · −6 · 54 |
| `c2` | 왼쪽 위로 들었다가 비스듬히 내리침 → 오른쪽 아래 | 104 · 8 · 70 |
| `c3` | 머리 위로 크게 돌려 왼쪽에서 앞을 지나 오른쪽으로 넓게 | 124 · 10 · 40 |
| `sweep` | 오른쪽 뒤 바닥을 긁다가 앞에서 위로 걷어 올림 | 112 · 0 · 56 |
| `whip` (길게 눌러 휘감기) | 머리 위에서 돌리다 멀리 곧게 던짐 → 맞으면 `wrap` 으로 감고 당긴다 | 240 · 0 · 62 |
| `plunge` | 떨어지기 시작하자마자 발 앞 아래로 뻗어 버틴다 → 착지에 땅을 따라 앞으로 | 58 · 0 · −34 (공중) |
| `launcher` · `charge` | 올려치기 · 모아 내려찍기 — **규칙에 아직 없다**(모양과 어림 박자만) | 92 · 0 · 70 / 142 · 0 · 20 |
| `far` | 먼 종 치기: 준 점(`x y z`)까지 풀려 나간다(기본 길이의 4.2배 = 약 400 px 까지) — 규칙에 아직 없다 | 준 점 |
| `ring_short` · `ring_long` | 종 (손 기준 자리) | — |

## 7. 장면(v2g)에 꽂는 법 — 자리 채우기 검과 칼 궤적을 바꾼다

1. **만들기** (GL · 효과 엔진을 만든 뒤 한 번). WebGL1 이면 `WhipRenderer` 를 만들지 않는다(그때는 지금의 검을 그대로 둔다).
   ```js
   this.whipLink = whipFx(this.fx, feel);
   this.whip = createWhip({ tier: this.perf.tier, onEvent: this.whipLink.onEvent });      // low｜mid｜high
   this.wr = new WhipRenderer(gl);
   this.whipHand = { x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, bx: 0, by: 0, bz: 0, br: 12, bh: 104, fx: 1, fz: 0, ground: 0 };
   this.whipPullE = null; this.whipPull = { x: 0, y: 0, z: 0, r: 12 }; this.whipCrack = { x: 0, y: 0, z: 0, strength: 1 };
   ```
2. **영웅에게서 검을 뗀다**: `this.cast.actor(HERO_MODEL, null, {})` (불러올 무기 목록에서도 `'blade'` 를 뺀다). 무기가 없어도 `ha.weaponMatrix()` 는 손 자리(`GRIPS.blade`)를 준다 — 그 자리와 방향이 채찍 손잡이에 그대로 맞는다.
3. **규칙 훅**
   - `hit`: `C.x = x; C.y = y; C.z = z; C.strength = { L: 0.7, M: 1, H: 1.3, F: 1.6 }[mv.str] ?? 1; sc.whip.set('crack', C);` 그리고 타격은 **무기 `'whip'`** 로: `sc._strike('whip', material, …)` (`src/v2/feel/table.js` 의 `whip`: 휘두름 `whip`, 타격 `whip_crack + hit`, 경직 ×0.9).
   - `swing`(또는 `sfx('slash')`): `feel.swing('whip', strength, h)`.
   - `pull`: `(e) => { sc.whipPullE = e; }`
4. **틱** (`_sync` 의 칼 궤적 자리. `pdt` = 놀이 dt — 타격 멈춤 중 0):
   ```js
   if (ha.weaponMatrix(ha.place(h.x, this.visY, h.z))) {
     const H = this.whipHand, P = this.whipPull, pe = this.whipPullE; let pull = null;
     this.whip.handFromMatrix(ha.WM, H);
     H.bx = h.x; H.by = this.visY; H.bz = h.z; H.fx = h.dirX; H.fz = h.dirZ; H.ground = /* 발밑 땅 높이 */;
     if (pe) { if (pe.pullT > 0 || h.pullT > 0) { P.x = pe.x; P.y = (pe.gy ?? pe.y) + pe.h * 0.55; P.z = pe.z; P.r = Math.max(8, pe.r * 0.55); pull = P; } else this.whipPullE = null; }
     this.whip.resonance = h.resoMax ? h.reso / h.resoMax : 0;
     driveWhip(this.whip, h, TUNE, pull);
     this.whip.update(pdt, H);
   }
   ```
5. **그리기** (`_gl` 에서 `cr.end()` 바로 뒤, 장면이 자기 프로그램을 다시 잡기 전):
   ```js
   if (this.wr) { const wr = this.wr, o = this.heroA.opt; wr.tint[0] = o.tint[0]; wr.tint[1] = o.tint[1]; wr.tint[2] = o.tint[2]; wr.flash = o.flash; wr.alpha = o.alpha ?? 1;
     this.env.lightPos = fx ? fx.lights.pos : null; this.env.lightCol = fx ? fx.lights.col : null;
     wr.draw(this.whip, this.env, a); }                                   // a = 영웅을 그릴 때 쓴 보간값 (순간 이동한 프레임은 1)
   ```
6. **지우는 것**: 칼 궤적 띠(`this._rb` · `TRAIL.blade`/`bladeHeavy`), 베기 초승달(`swing.light` · `swing.heavy` 프리셋 — 검의 그림이다), `h.whipOn` 의 빛줄(`WHIP_CORD`). 구르기 띠(`DASH_TRAIL`)는 그대로.
7. **다시 시작할 때**: 지역을 새로 부르거나 되살아나면 영웅을 놓은 뒤 `this.whip.reset(hand)` · `this.whipPullE = null`(한 틱에 220 px 넘는 이동은 저절로 따라가지만 `reset` 이 깔끔하다). 컨텍스트를 되찾으면 `this.wr.restore()`. 성능 단계를 바꾸면 `createWhip` 을 다시(렌더러는 그대로 — 버퍼를 스스로 다시 잡는다).
8. **대화 · 매달리기처럼 손이 바쁠 때**: `whip.set('stow')` 를 틱마다 부르고 `hand` 에 허리 자리(골반 뼈 오른쪽)를 준다.

## 8. 숫자와 한계

`node tools/v2/whip_check.mjs` (node v22, 이 기계) 와 `node tools/v2/whip_shot.mjs` 의 값.

| | 낮음 | 보통 | 높음 |
|---|---|---|---|
| 마디 · 끈 단면 수 | 12 · 23 | 16 · 46 | 20 · 77 |
| 정점 | 255 | 335 | 431 |
| 삼각형 (끈 + 손잡이 + 종 조각 / + 빛무리 2 / + 궤적 54) | 246 | 356 | 482 |
| 그리기 호출 | 1 (+1 더하기) | 1 (+1) | 1 (+1) |
| GPU 바이트 (정점 + 색인; 텍스처 없음) | 12,012 | 15,872 | 20,468 |

- CPU(보통 단계, node): **틱 12 µs · 메시 짜기 17 µs**(10만 번 평균). 기기에서는 재지 못했다.
- 할당: **틱당 0.001 바이트 · 틱+메시 0.001 바이트**(10만 번, 가비지 수거 뒤 힙 차이) — 정상 상태에서 0.
- 화면 굵기(끈이 펴진 순간, 끈을 가로지르는 세로줄에서 달라진 픽셀): 게임 카메라(영웅 키 약 114 px) 4–5 px · 멀리(키 약 70 px) 3 px · 그 절반 해상도(키 약 35 px) 2–3 px.
- 끈은 늘어나지 않는다: 어느 마디 사이도 제 길이의 102 % 를 넘지 않는다(끈이 감겨 들어오는 동안은 줄어드는 길이 기준으로 105 % 까지).

**한계 · 아는 문제**
- 부딪치는 것은 **땅(발밑 높이 하나)과 영웅 자신의 몸(원통)** 뿐이다. 벽 · 소품 · 적의 몸은 지나간다. 구르거나 웅크린 자세에서는 원통이 몸과 정확히 맞지 않는다.
- 휘감는 축은 세로뿐이다(서 있는 적 · 기둥 · 문고리). 가로대에 감기는 그림은 없다.
- 공격 클립은 검을 든 동작이라, 맞는 순간 손이 몸 뒤쪽에 남아 있는 기술이 있다(끈이 몸 앞을 가로지른다 — 뚫지는 않는다). 손가락이 없어 손잡이가 손바닥에 붙어 보인다.
- `launcher` · `charge` · `far` · 문 당기기는 규칙에 없다. 시험 화면에서만 흉내 냈다(영웅은 비슷한 기술의 동작을 쓴다).
- 두 밤의 빛은 시험 화면의 어림값으로 봤다(진짜 지역의 빛 · 안개가 아니다). 장면에 꽂은 뒤 `wr.tone`(가죽 색) · `wr.rim`(둘레빛) · `whip.glowCol` 을 맞춰야 할 수 있다.
- 소리는 듣지 못했다(헤드리스). 헛침 소리는 v1 소리 창구의 `whip_crack` 을 직접 부른다(`feel.sound.host.sfx`) — 표에 전용 사건을 두는 편이 낫다(requests.md).
- 생성 서비스는 쓰지 않았다(0 크레딧). 손잡이와 종 조각은 코드로 만든 조각이다.

## 9. 시험 화면과 검사

- `tools/v2/whip_view.html` — 진짜 규칙 + 입체 카엘(오른손 뼈)에 채찍을 붙여 본다. 단추: 기술 13가지(연타 · 훑기 · 내려치기 · 모아 휘감기 · 문 당기기 · 고리 걸기 · 종 짧게/길게 · 먼 종 치기 · 올려치기 · 내려찍기 · 쉬는 모습 · 직접 조작) · 여덟 방향 · 카메라 여섯(게임 · 멀리(키 70) · 가까이 · 손잡이/종 조각 · 옆 · 위) · 두 밤의 빛 · 품질 셋 · 느리게(1/4) · 타격 멈춤 · 멈춤 · 효과 · 판정 보기 · 울림 가득. 직접 조작: 방향키/WASD · J 공격(길게 = 모으기) · K 점프 · L 구르기 · I 솜씨 · U 종.
- `node tools/v2/whip_shot.mjs [이름…]` — 기술마다 두 틱 간격 붙임 그림 30장을 `/tmp/claude-0/v2/whip/` 에(`--list`), 끝에 화면 굵기를 잰다. `--owner` = 소유자용 한 장, `--shot="demo:t:cam:w:h[:era[:reso[:dir]]]"` = 한 장.
- `node tools/v2/whip_check.mjs` — 브라우저 없이: 진짜 뼈대 · 클립 · 규칙표로 기술마다 ① 자기 궤적이 있는가 ② 다 펴졌는가(≥ 0.93) ③ 끝이 판정 모양 안인가 ④ 끝이 가장 빠른 때가 판정 구간 안(±0.02초)인가 ⑤ 구간 동안 판정 모양 안을 지나는가 ⑥ 늘어남 · 몸 뚫기 · NaN ⑦ 사건이 한 번 나는가, 그리고 여덟 방향 · 두 번 돌려 같은가 · 타격 멈춤 · 느린 화면 · 굵은 틱 · 순간 이동 · 쉬는 모습 · 달리기 · 휘감기 · 걸기 · 종 · 모으기 · 먼 종 치기 · `driveWhip` 의 모든 상태 · 숫자(할당 0). `--trace=c1` 로 틱마다의 끝 자리를 찍는다.

## 상태

| 무엇 | 상태 |
|---|---|
| 계산(사슬 · 모드 여덟) · 기술 모양 11 · 그리기 · 사건 · 규칙 상태 잇기 | 동작 — `whip_check` 80/80 |
| 시험 화면 · 붙임 그림 | 동작 — `whip_shot` 페이지 오류 0 |
| 본 게임 장면(v2g)에 꽂기 | **아직 아니다** — §7 대로 장면 구역이 한다 (`/tmp/claude-0/v2/requests.md` 의 WHIP 절) |
