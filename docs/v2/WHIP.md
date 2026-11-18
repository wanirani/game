# WHIP — 채찍 비질리아 (`src/v2/whip/`)

2026-11-18 · 담당 WHIP · 공개 면은 `src/v2/whip/index.js` 하나 · 검사 `node tools/v2/whip_check.mjs` · 보기 `tools/v2/whip_view.html` · 찍기 `node tools/v2/whip_shot.mjs`

**바뀐 것**
- 00:45 첫 판 (규약만 — 장면과 규칙 구역이 미리 맞출 수 있게. 숫자와 "꽂는 법"은 끝날 때 채운다)

## 0. 한눈에

```js
import { createWhip, WhipRenderer, whipFx } from '../whip/index.js';

const whip = createWhip({ tier: 'mid', onEvent: (name, e) => { /* 효과 · 소리 · 진동 — §4 */ } });
const wr   = new WhipRenderer(gl);                 // WebGL2. 자기 프로그램 · VAO · 버퍼 하나씩

// 틱마다 (규칙이 돈 뒤, 뼈대가 자세를 잡은 뒤)
whip.set('swing', { move: h.move.id, t: h.moveT, dirX: h.dirX, dirZ: h.dirZ });   // 또는 'rest' · 'wrap' · 'hook' · 'ring' · 'stow' (§2)
whip.update(dt, hand);                             // hand = 손잡이 자리와 방향 (§1). dt = 0 이면 세계와 함께 멈춘다

// 프레임마다 (캐릭터를 그린 뒤, 반투명 효과보다 먼저)
wr.draw(whip, env, alpha);                         // env = CharRenderer.begin 에 주는 것과 같은 것 + viewport. alpha = 틱 사이 보간 0..1
```

- 좌표는 놀이 세계 그대로: x 오른쪽 · y 위 · z 화면 안쪽, 단위 논리 px (1 m = 58).
- **틱마다도 프레임마다도 새로 만드는 것이 없다**(배열은 모두 만들 때 한 번). 사건에 넘기는 `e` 도 한 개를 돌려 쓴다 — 받은 쪽이 값을 꺼내 쓰고 붙들지 않는다.
- 채찍은 모델이 아니다. 마디(기본 16개)를 계산하고 그 위에 띠를 프레임마다 다시 짠다. 손잡이 · 쇠고리 · 종 조각도 같은 버퍼에 들어간다 → **그리기 한 번**(종 조각의 빛무리를 켜면 한 번 더).

## 1. `createWhip(opts)` 와 `update`

| opts | 기본 | 뜻 |
|---|---|---|
| `tier` | `'mid'` | `'low'`(마디 12 · 띠 조각 적게) · `'mid'`(16) · `'high'`(20). `whip.setTier()` 는 없다 — 설정이 바뀌면 다시 만든다 |
| `length` | 96 | 끈의 기본 길이(px). 걸기 · 휘감기 · 먼 종 치기에서는 풀려 나가 늘어난다(`reach`) |
| `onEvent` | — | `(name, e)` — §4 |
| `ground` | 0 | 땅 높이. `update` 의 `hand.ground` 로 틱마다 줄 수도 있다 |

`whip.update(dt, hand)` — `hand` 는 장면이 가진 객체 하나를 채워서 넘긴다(읽기만 한다):

| 칸 | 뜻 |
|---|---|
| `x y z` | 손잡이를 쥔 자리(세계). 장면의 무기 행렬 `WM` 이 있으면 `whip.handFromMatrix(WM, hand)` 가 채워 준다(원점 = 쥔 자리, +Y = 끈이 나가는 쪽) |
| `dx dy dz` | 손잡이가 가리키는 방향(끈이 나가는 쪽, 단위 벡터) |
| `bx by bz` · `br` · `bh` | 몸: 발밑 자리 · 반지름(기본 16) · 키(기본 104). 끈이 몸을 뚫지 않게 밀어낸다 |
| `fx fz` | 영웅이 보는 방향(단위 벡터) — 기술의 끝 궤적은 이 방향 기준으로 적혀 있다 |
| `ground` | 발밑 땅 높이 (없으면 `by`) |

- `dt` 는 규칙의 틱 그대로(1/60). **`dt = 0`(타격 멈춤)이면 아무것도 움직이지 않는다** — 다음 틱에 그대로 잇는다. 느리게(`dt` 가 작음)도 된다. `dt` 가 1/30 을 넘으면 안에서 쪼갠다.
- 손이 한 틱에 `opts.teleport`(기본 220 px) 넘게 옮겨 가면(지역 이동 · 되살아남) 끈 전체를 같이 옮긴다 — 튀지 않는다. 직접 부르려면 `whip.warp(dx, dy, dz)` · `whip.reset(hand)`.
- 읽는 값: `whip.nodes`(Float32Array, 마디 × 3, 0 = 손잡이 쪽) · `whip.n` · `whip.tip`(`{x,y,z, vx,vy,vz, speed}`) · `whip.mode` · `whip.taut`(0..1 팽팽한 정도) · `whip.glow`(0..1) · `whip.ext`(0..1 펴진 정도 = 손에서 끝까지 거리 ÷ 끈 길이).

## 2. `whip.set(mode, params)` — 틱마다 불러도 되고 바뀔 때만 불러도 된다

| mode | params | 하는 일 |
|---|---|---|
| `rest` | `{ style: 'coil'｜'hang' }` | 평소. `coil` = 손에 두세 바퀴 사려 쥔다(걷고 달릴 때 흔들린다) · `hang` = 늘어뜨린다(전투 대기) |
| `swing` | `{ move, t, dirX, dirZ }` | 기술 하나. `move` = `MOVES` 의 id(`c1 c2 c3 sweep plunge` + 규칙 구역이 더하는 것), `t` = `hero.moveT`(초). 끝 궤적은 기술마다 적어 둔 것이라 **언제나 같은 모양**이다. 판정 구간(`move.hit`)에서 끈이 다 펴지고 끝이 가장 빠르며 판정 모양 안에 있다(`whip_check` 가 본다). 판정이 끝나면 물리로 넘겨 흘러내린다 |
| `crack` | `{ x, y, z, strength }` | 맞은 순간(장면의 `hooks.hit` 에서). 끝이 그 자리에서 튕기고 `crack` 사건이 난다. 한 번 부르면 된다 |
| `wrap` | `{ x, y, z, r, phase: 'throw'｜'hold'｜'pull', t }` | 휘감기. 끝이 날아가 대상(반지름 `r`)을 감는다 → `wrap.catch`. `hold` = 팽팽하게 버틴다, `pull` = 당긴다(거리가 줄면 끈이 감겨 들어온다) |
| `hook` | `{ x, y, z, phase: 'throw'｜'taut'｜'release', t }` | 걸기. 끝이 고리로 날아가 걸린다 → `hook.catch`. `taut` = 팽팽한 직선(조금 떨린다), `release` = 풀려 돌아온다 |
| `ring` | `{ kind: 'short'｜'long', t }` | 종 조각을 종처럼 친다. 짧게 = 손목으로 튕겨 올린다, 길게 = 머리 위로 한 바퀴 돌려 높이 든다 → `ring` |
| `stow` | `{ x, y, z }`(허리 자리) | 손이 바쁠 때(대화 · 매달리기): 손잡이째 허리에 사려 건다 |

`whip.resonance = 0..1` (울림 눈금) → 종 조각의 빛이 밝아진다.

## 3. 그리기

- `new WhipRenderer(gl, { glow: true })` · `wr.draw(whip, env, alpha)` · `wr.restore()`(컨텍스트 되찾은 뒤) · `wr.destroy()` · `wr.stats`(`tris draws bufBytes`).
- `env` = `{ vp(16), eye[3], fog:{near,far,max,color}, sunDir[3], sun[3], amb[3], viewport:[w,h], lightPos?, lightCol? }` — 앞의 여섯은 캐릭터 그리기와 같은 것, `lightPos/lightCol` 은 효과 엔진의 점광(`fx.lights.pos/.col`).
- 끈은 카메라를 보는 띠인데 조각마다 원통 법선을 계산해 빛을 받는다(땋은 가죽 무늬 · 쇠고리 · 종 조각의 반짝임). 가장자리는 알파로 부드럽게, **화면 굵기가 `minPx`(기본 1.7) 아래로 내려가지 않게** 정점 셰이더가 넓힌다.
- 다른 렌더러를 쓰는 장면은 `whip.writeMesh(out, env, alpha)` 로 정점(`out.vtx` Float32Array) · 색인(`out.idx` Uint16Array) · 개수를 받아 직접 그릴 수 있다(정점 모양은 끝날 때 적는다).
- `draw` 뒤에는 자기 프로그램 · 버퍼를 다시 잡아야 한다(캐릭터 그리기와 같은 약속).

## 4. 사건 — `onEvent(name, e)`

`e = { x, y, z, dx, dy, dz, strength, move, kind }` (하나를 돌려 쓴다).

| name | 언제 | 장면이 할 일 (기본 배선은 `whipFx(fx, feel)` 가 해 준다) |
|---|---|---|
| `swing` | 기술의 끈이 풀려 나가기 시작 | 휘두름 소리 `feel.swing('whip', strength)` — 규칙의 `swing` 훅과 겹치면 하나만 |
| `crack` | 끈이 다 펴진 순간(헛쳐도 난다, `kind:'air'`) · 맞은 순간(`kind:'hit'`) | 끝에 번쩍임 + 불티 고리, `whip_crack` 소리, 짧은 진동 |
| `wrap.catch` · `wrap.pull` | 감김 · 당기기 시작 | 감기는 소리 · 진동, 팽팽한 떨림 |
| `hook.catch` · `hook.release` | 고리에 걸림 · 풀림 | 쇠 걸리는 소리 · 불티, 진동 |
| `ring` | 종 조각이 울림 (`kind: 'short'｜'long'`) | 종소리 · 빛 고리 |
| `drag` | 끝이 땅을 긁음 (0.12초에 한 번까지) | 먼지 조금 |

궤적 띠(휘두를 때 끝 뒤에 남는 빛)는 `whipFx` 가 효과 엔진의 `fx.ribbons` 로 그린다: `const link = whipFx(fx, feel); createWhip({ onEvent: link.onEvent }); 프레임마다 link.update(whip)`.

## 5. 규칙 구역(PLAY)이 맞출 것

- 새 기술(휘감기 · 걸기 · 종)은 `MOVES` 에 `id` 와 `hit:[t0,t1]`, 판정 모양(`box`｜`arc`)만 있으면 채찍이 따라간다. 채찍 쪽 모양표(`WHIP_SHAPES`)에 같은 `id` 로 끝 궤적이 있다 — 없는 id 는 `c1` 모양으로 돈다.
- 무기 이름은 `weapon: 'whip'`(`src/v2/feel/table.js` 에 이미 있다).

## 상태

| 무엇 | 상태 |
|---|---|
| 규약 | 첫 판 |
| 계산 · 그리기 · 기술 모양 · 시험 화면 · 숫자 | 만드는 중 |
