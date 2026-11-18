# v2 효과 엔진 (fx) — 타격감·마법의 그림 쪽

코드 `src/v2/fx/` · 시험 화면 `tools/v2/fx_view.html` · 검사 `node tools/v2/fx_check.mjs` · 작성 2026-11-17
소유자 지시(헌장 §2 마지막 줄): "3D 지만 타격감(효과, 음향 등) 최고로, 마법도 3D 로 화려하게, 최적화로 느리지 않고 경쾌하게".
이 문서는 그 가운데 **그림 절반**(효과 엔진 + 효과 모음 + 화면·카메라 손맛)이다. 소리는 여기서 **사건 이름만** 내보내고 소리 담당이 받아 만든다.

> **2026-11-18 FIRE-2 — §13**: the particle atlas is 1024 x 1024 (the old 16 cells + a flame flipbook painted in code), `SPR.FIRE` / `SPR.WISP` flipbook quads, `amb` specs (not counted by the fill governor), the layered anchor fire and living candles of the game. §0 "입자 16칸" and §2 "512²" are the old sheet, still there as the atlas's top-left quarter.

## 0. 한눈에

- **WebGL2 용 작은 효과 엔진**(라이브러리 없음, 6파일 약 1,900줄 · 153 KB)과 **한 번 부르면 되는 효과 32종**이다. 게임(`src/v2/b/`)에는 아직 꽂지 않았다 — 혼자 도는 모듈 + 시험 화면이고, 꽂는 법은 §3 에 적었다.
- 입자와 바닥 문양은 **태어날 때 한 번만 버퍼에 쓰고, 그 뒤의 움직임은 셰이더가 시간으로 계산**한다. 프레임마다 CPU 가 입자를 돌지 않고, 텍스처를 올리지 않는다.
- 그림은 **전부 코드로 한 번 그린 것**(입자 16칸 · 바닥 문양 4칸 · 잡음)이다. 생성 이미지는 쓰지 않았다(크레딧 0) — 플립북 대신 셰이더가 움직인다.
- 난전(적 12, 마법 3개가 떠 있음) 한 프레임에 **효과 그리기 호출 평균 6회 · 최대 12회, 살아 있는 입자 최대 약 135 / 220 / 300개**(low / mid / high; 검수에서 두 번 다시 재어 130–135 / 200–218 / 298–303). 숫자는 §8.
- 헤드리스 Chromium 은 소프트웨어 렌더러라 **프레임 시간은 기기 값이 아니다.** 폴드에서의 실제 채움(fill) 비용은 재지 못했다(§9).
- 프레임당 할당: **새 효과를 내지 않는 프레임은 0**(검수 재측정: 4,800프레임에 52바이트 — 처음 적었던 12–20바이트는 V8 이 최적화를 끝내기 전의 값이었다, §12). **새 효과를 내는 프레임은 0 이 아니다** — 난전에서 프레임당 60–210바이트(짧게 사는 숫자 상자; 객체는 없음, §8).
- 소리는 사건 이름만 내보낸다고 했지만 그 이름 53개 가운데 소리 표(`src/v2/feel/table.js`)와 같은 것은 3개뿐이었다 → 검수에서 다리 `src/v2/feel/fxbridge.js` 를 넣었다(§11).

| 파일 | 내용 |
|---|---|
| `src/v2/fx/index.js` | 문: `createFx(gl, opts)` → `update` · `draw` · `play` · `playAt` · 품질 단계 · 통계 |
| `src/v2/fx/engine.js` | 묶음 4개(입자 · 바닥 문양/고리 · 띠 · 효과 메시) + 잠깐 사는 빛 목록 + 셰이더 |
| `src/v2/fx/sprites.js` | 코드로 그리는 입자 아틀라스 · 문양 아틀라스 · 잡음 |
| `src/v2/fx/feel.js` | 화면·카메라 손맛(타격 멈춤 · 흔들림 · 밀림 · 줌 · 번쩍임 · 가장자리 색 · 슬로모션) + 캐릭터용 도우미 |
| `src/v2/fx/post.js` | 후처리(번짐 · 톤 · 비네트 · 번쩍임), `post.begin` / `post.end` |
| `src/v2/fx/presets.js` | 효과 모음(프리셋) + 여러 박자 효과용 시퀀스 풀 |
| `tools/v2/fx_view.html` · `.js` · `.css` | 시험 화면 (게임과 같은 투영: 초점 880 · 내려보는 각 20° · 거리 790) |
| `tools/v2/fx_check.mjs` · `fx_shot.mjs` | 자동 검사 · 숫자 · 접촉 시트 · 영상 / 빠른 캡처 |

## 1. 시험 화면

`node tools/serve.mjs` 뒤 `http://localhost:8080/tools/v2/fx_view.html` (`?tier=low|mid|high` · `?ui=0` · `?post=0` · `?dpr=1`).
달빛 받은 돌바닥(게임의 성 돌바닥 타일)과 인형(파랑 = 영웅, 나머지 = 적). 왼쪽 목록의 단추 하나가 프리셋 하나다.
위쪽: 품질 단계 · 후처리 켬/끔 · 손맛 켬/끔 · **콤보**(세 번 베고 대시해서 마무리) · **마법 순회**(12종 + 궁극기) · **난전**(§8 의 측정 장면) · 느리게 보기(½, ⅕). 오른쪽 위에 실시간 숫자.

## 2. 엔진

모든 묶음은 **크기가 고정된 풀**이다. 버퍼는 만들 때 high 크기로 한 번만 잡고, 품질 단계는 쓰는 양만 줄인다(단계를 바꿔도 다시 잡지 않는다). 풀이 차면 가장 먼저 끝날 것을 덮어쓴다 — 실패하거나 늘어나는 일이 없다.

| 묶음 | 하는 일 | 그리기 호출 | low / mid / high 상한 |
|---|---|---|---|
| **입자** `Particles` | 인스턴스 사각형. 카메라 보기 또는 **속도 방향으로 늘이기**(불티·베인 선), 더하기/알파(0–1 사이도 됨), 중력 · 저항 · 회전 · 색/크기 변화 · 바닥에서 멈춤/튐 · 모여들기. 방출 모양: 원뿔 · 구 · 바닥 고리 · 기둥 · 모여들기 | 1 (고리 버퍼가 한 바퀴 돌면 2) | 1,024 / 2,048 / 4,096 |
| **바닥 문양·고리** `Quads` | 예고 **원 · 부채꼴 · 선**(안에서 채워지는 애니메이션 + 어두운 밑판), 그을음(불씨가 식는다), **도는 마법진**(문양 4종), 충격 고리(바닥/카메라 보기), 서리, 빛 웅덩이, 그림자 | 1 | 48 / 96 / 128 |
| **띠** `Ribbons` | 칼 궤적(**날의 두 점**을 넣는다), 탄 꼬리(중심 + 폭, 카메라를 본다), **번개**(들쭉날쭉한 꺾은선, 0.04초마다 다시 꺾인다) | 1 | 8 / 14 / 20 줄 (줄당 점 24) |
| **효과 메시** `Meshes` | 초승달 베기 · 원통(빛기둥·광선) · 원뿔(숨결) · 구(방패) · 얼음 가시 다발 · 종. 셰이더 방식 7가지: 베기 쓸림, 흐르는 기둥, 원뿔 불길, 방패(가장자리 빛 + 물결), 얼음(면 조명 + **분해**), 단단한 물체(운석·얼음창), 종(흔들림) | 메시 하나당 1 | 10 / 18 / 28 |
| **빛** `Lights` | 잠깐 사는 점광(위치 · 반지름 · 색 · 세기 · 떨림). 장면 셰이더가 읽는다(§3.4) | 0 | 3 / 5 / 8 |
| **시퀀스** `Seqs` | 시전 → 날아감 → 터짐처럼 박자가 여럿인 효과의 상태(숫자 필드뿐인 풀 객체) | 0 | 24 / 36 / 48 |

- 입자 한 개 = 88바이트(위치·속도·수명·크기 2·회전·중력·저항·늘이기·그림 칸·더하기·바닥·색 2). 정점 셰이더가 `p = p0 + v·(1−e^(−d·t))/d − 중력항` 으로 지금 자리를 계산한다. 죽은 입자는 화면 밖으로 접힌다.
- 문양은 사각형 한 장에 조각 셰이더가 모양을 그린다(원·부채꼴·선의 테두리와 채움, 고리, 서리 잡음). 마법진·균열·종 문양만 텍스처(코드로 그린 512² 한 장)를 읽는다.
- 깊이: 효과는 깊이 시험만 하고 쓰지 않는다. 바닥 문양은 0.8 띄우고 깊이를 조금 당긴다(바닥과 겹쳐 깜빡이지 않게).
- 섞기는 미리 곱한 알파 하나(`ONE, ONE_MINUS_SRC_ALPHA`)라 더하기 빛과 보통 연기가 같은 묶음에 들어간다.
- 품질 단계는 개수 배율도 바꾼다: 입자 수 ×0.42 / ×0.7 / ×1.0 (꼭 필요한 것 — 베인 선·번쩍임 — 은 줄지 않는다).

## 3. 연결 계약 (게임 코드가 부르는 법)

### 3.1 만들기 · 프레임

```js
import { createFx } from '../fx/index.js';
const fx = createFx(gl, {            // gl = WebGL2 컨텍스트 (glr.gl). WebGL1 이면 null 을 돌려준다 → 효과 없이 돈다
  tier: 'mid',                       // 'low' | 'mid' | 'high'   (fx.setTier 로 바꾼다)
  post: true,                        // 후처리 (fx.setPost 로 바꾼다; low 는 늘 꺼짐)
  groundY: 0,                        // 바닥 높이 기본값 (불티가 튀는 높이)
  lightPools: false,                 // true = 빛마다 바닥에 빛 웅덩이를 깐다 (장면 셰이더가 빛 목록을 못 읽을 때의 대신)
  onEvent: (name, x, y, z, vol) => {},   // 소리 사건 (§3.6)
  profile: false,                    // true = fx.stats(그리기 호출·입자 수·JS 시간)를 프레임마다 채운다 (개발용)
});

// 매 프레임
const dt = fx.update(realDt);        // 실제 dt 를 주면 놀이용 dt 를 돌려준다 (타격 멈춤 중 0, 슬로모션 중 줄어든 값)
                                     //   (숫자 상자까지 없애려면: fx.dtIn = realDt; fx.tick(); 놀이 dt = fx.dt)
sim.update(dt);                      // 놀이는 이 dt 로. 효과는 멈춤 중에도 0.3배로 흘러 불티가 피어난다
fx.feel.applyToEye(eye, right, up, eye2);          // 카메라 눈 위치 + 흔들림·밀림 (새 배열을 만들지 않는다)
focal *= fx.feel.cam.zoom;                         // 줌 펀치 (1.00–1.10)
fx.setProtect(0, hero.x, hero.y + 55, hero.z, 46); // 가리면 안 되는 자리 (§7). fx.protect[0..15] 에 직접 써도 된다
fx.post.begin(canvasW, canvasH);     // (선택) 후처리: 이 뒤로 그리는 것은 fx 의 프레임버퍼로 들어간다
…하늘·세계·캐릭터를 그린다…           // 장면 셰이더는 fx.lights 를 읽는다 (§3.4)
fx.draw(cam);                        // cam = { vp, eye, right, up, fwd }
fx.post.end(fx.feel.screen);         // 번짐·톤·번쩍임을 입혀 화면(또는 begin 의 세 번째 인자로 준 프레임버퍼)에 낸다
```

- `cam.vp` = 열 우선 view·projection `Float32Array(16)` (시범판 B 의 `this.vp` 그대로), `eye`·`right`·`up`·`fwd` = `[x,y,z]` (B 의 `eye`·`camR`·`camU`·`cam.fx/fy/fz`).
- **그리는 자리**: 불투명한 세계와 캐릭터 뒤. 게임이 따로 그리는 반투명 빌보드가 있으면 그 뒤가 좋다(효과는 깊이를 쓰지 않는다).
- **GL 상태**: `fx.draw` · `fx.post.*` 는 자기 VAO·프로그램·텍스처 단위 0–1 을 쓰고, 끝나면 VAO = null · 섞기 `(ONE, ONE_MINUS_SRC_ALPHA)` · 깊이 쓰기 켬 · 깊이 시험 켬 · 뒷면 제거 끔 · 활성 텍스처 단위 0 으로 둔다. **프로그램과 ARRAY_BUFFER·속성 포인터는 부른 쪽이 다시 잡는다**(glr 은 그릴 때마다 잡으므로 `fx.draw` 뒤에 `gl.useProgram(glr.prog)` 한 줄이면 된다; char3d 와 같은 약속). `UNPACK_PREMULTIPLY_ALPHA_WEBGL` 은 건드리지 않는다(만들 때 잠깐 바꿨다가 되돌린다).
- **후처리와 B 의 겹치기 방식**: `post.begin` 은 캔버스(기본 프레임버퍼) 대신 자기 프레임버퍼를 묶는다. B 의 `glr.begin` 이 `gl.viewport`·`gl.clear` 를 하므로 `post.begin` 을 그 앞에 부르면 된다.
- **컨텍스트를 잃었다 되찾으면**: 옛 GL 객체는 모두 죽는다 → `fx = createFx(gl, opts)` 로 다시 만든다(만드는 데 드는 것: 셰이더 10개 + 512² 텍스처 2장 그리기). **되찾은 뒤에** 만들어야 한다 — 잃은 동안 `createFx` 를 부르면 오류 없이 객체가 나오지만 그 안의 GL 자원은 전부 비어 있어 아무것도 그리지 못한다(검수에서 확인). 잃은 동안 `fx.update`·`fx.play`·`fx.draw`·`fx.post.*`·`fx.dispose` 를 불러도 예외는 나지 않는다.
- 방을 옮길 때 `fx.clear()` (살아 있는 효과·손맛을 지운다). 끝낼 때 `fx.dispose()`.

### 3.2 효과 내기

```js
fx.play('hit.slash.heavy', { x, y, z, dx, dz });                       // 이름 + 객체 (편한 쪽)
fx.playAt(PRESET_IDS['fire.bolt'], x, y, z, dx, dz, pow, tx, ty, tz);  // 번호 + 숫자 (할당 0; 자주 나는 것은 이쪽)
```

- 단위는 논리 px(영웅 키 ≈ 100), 축은 헌장 §4 그대로(x 오른쪽 · y 위 · z 화면 안쪽).
- `(x,y,z)`: **타격**은 맞은 점(대개 가슴 높이), **이동·적·마법**은 그 캐릭터의 **발밑**. `(dx,dz)`: 공격·바라보는 방향(단위 벡터). `pow`: 세기 배율(기본 1; `swing.*` 는 부호가 베는 쪽, `pickup` 은 1 금화 · 2 회복 · 3 마력, `hit.guard` 는 1.2 를 넘으면 쳐내기). `(tx,ty,tz)`: 표적의 발밑(마법).
- 마법은 **예고(바닥 표시) → 시전 → 날아감 → 터짐**을 스스로 진행한다. 판정 시점은 게임이 정한다 — 효과의 박자(§6 표의 초)에 맞춰 판정을 넣거나, 판정이 난 순간에 터짐 쪽 프리셋만 따로 부른다(지금은 터짐만 따로 부르는 이름이 없다 → §10).
- 연쇄 번개의 표적: 부르기 전에 `fx.chain[0..11]` 에 (x,y,z)×최대 4, `fx.chainN` 에 개수를 넣는다(0 이면 시범용 점을 만든다).
- 칼 궤적(뼈에서 날의 두 점을 받아): `const h = fx.ribbons.start(TRAIL.blade)` → 휘두르는 동안 프레임마다 `fx.ribbons.push(h, 밑동x,y,z, 끝x,y,z)` → `fx.ribbons.end(h)`. `TRAIL` 은 `presets.js` 가 내보낸다(`blade` · `bladeHeavy` · `fire` · `ice` · `blood` · `bolt` …).
- 보호막처럼 따라다녀야 하는 것: 프리셋이 `fx.last` 에 메시 손잡이를 남긴다 → `fx.meshes.move(fx.last, x, y, z)`.
- 낮은 층도 열려 있다: `fx.particles.emit(명세, …)` · `fx.quads.ground(…)` / `.billboard(…)` · `fx.ribbons.bolt(…)` · `fx.meshes.spawn(…)` · `fx.light(…)`. 인자 설명은 `engine.js` 의 주석.

### 3.3 손맛 (`fx.feel`) — §4 표

프리셋이 스스로 부른다(끄려면 `fx.feelOn = false`). 게임이 직접 불러도 된다.

### 3.4 빛 목록

`fx.lights.pos`(xyz + 반지름) · `fx.lights.col`(rgb × 세기) — 각각 `Float32Array(32)` = vec4 × 8, 남는 칸은 0. `fx.lights.count`.
장면 셰이더에 `FX_LIGHT_GLSL`(GLSL ES 1.00 · 3.00 공용)을 붙이고 `lit += fxLights(worldPos, normal)`, 유니폼은 `fx.uploadLights(loc_uFxLP, loc_uFxLC)`.
B 의 세계는 빛을 꼭짓점에 구워 두므로 조각 셰이더에 세계 좌표·법선이 없다 → (a) 정점 셰이더에서 `fxLights` 를 계산해 정점 색에 더하거나(64 단위 격자라 충분히 곱다), (b) 당장은 `lightPools: true` 로 바닥 빛 웅덩이만 깐다. 캐릭터(char3d)는 조각 셰이더에 `vWP`·법선이 이미 있어 그대로 붙는다.

### 3.5 캐릭터 쪽 도우미 (char3d 가 쓴다)

- `hurtFlash(맞은 뒤 초)` → 0..1 흰 번쩍임 (0.05초 가득, 0.14초에 0). char3d 의 `uFx.x`(번쩍임)에 넣는다.
- `hurtShake(맞은 뒤 초, 멈춤 시간, 진폭=3)` → 맞은 캐릭터의 좌우 떨림(프레임마다 번갈아).
- `dissolveK(죽은 뒤 초, 길이=0.9)` → 0..1 분해 값. `FX_DISSOLVE_GLSL` 을 캐릭터 조각 셰이더에 붙이고(`#define TEX texture2D` 또는 `texture`) `float e = fxDissolve(worldPos); if (e < 0.0) discard; color += 불빛색 * e;`. 유니폼 `uFxNoise`(= `fx.tex.noise`) · `uFxDis`(분해, 가장자리 폭 0.12, 잡음 배율 0.012, 씨앗). `enemy.death.ash` 프리셋은 그 0.9초 동안 재·불씨를 몸 자리에서 올려 보낸다.

### 3.6 소리 사건

`onEvent(name, x, y, z, vol)` — 프리셋이 박자마다 부른다. 이름은 §8 표의 「소리 사건」 칸이 전부다(53개). **이 이름들은 소리 표의 이름과 다르다**(같은 것 3개) → `bindFxSound(feel).onEvent` 를 그대로 넘긴다(§11.2; 53개를 소리 쪽 호출로 옮기는 표 `FX_SOUND`, 검사 `node tools/v2/fx_sound_link.mjs`). `vol` 은 0–1(착지 세기, 종의 둘째·셋째 울림이 조금 작다).

## 4. 화면·카메라 손맛

값의 뿌리는 2D 판의 `docs/specs/feel.md` §4.1 · §4.9 다(타격 세기별 멈춤 시간, 1초에 0.40초 상한, trauma 흔들림, 번쩍임 0.7 상한).

| 호출 | 동작 |
|---|---|
| `feel.update(realDt)` → 놀이 dt | `fx.update` 가 부른다. 게임은 돌려받은 dt 를 쓴다 |
| `feel.timeScale` · `feel.frozen` · `feel.fxScale` | 놀이 시간 배율(멈춤 0 · 슬로모션 값 · 평소 1) · 멈춤 중인지 · 효과 시간 배율(멈춤 중 0.3) |
| `feel.frozenRecent` | 최근 멈춘 시간(초; 1 s/s 로 줄어든다) — 입력 버퍼를 그만큼 늘려 주는 데 쓴다 |
| `feel.hitStop(초, force=false)` | 타격 멈춤. 여러 번 겹치면 합이 아니라 최댓값. **1초 창 안에서 합계 0.40초 상한**(최소 1프레임). `force` 는 상한 밖(마무리·궁극기) |
| `feel.addTrauma(양, dx, dy)` · `fx.trauma(양, 세계 방향)` | 흔들림 0–1, 초당 1.6 줄어든다. 진폭 = 15 × trauma² 단위, 부드러운 잡음. **방향을 주면 그 축으로 더 크게** 흔든다(0.6초쯤 뒤 사방으로 풀린다). 기울기 0.012 × trauma² rad 은 `feel.cam.roll` 로 내보낸다(쓰는 것은 선택) |
| `feel.kick(x, y, z, px)` | 카메라를 세계 방향으로 툭 민다. 스프링(k 260 · c 22)으로 0.15초 안에 돌아온다 |
| `feel.zoomPunch(양, hold=0)` | 줌 0.05 = 5 %. 0.05초에 당기고 0.18초에 푼다 |
| `feel.flash(r, g, b, 세기, decay=7)` | 화면 번쩍임. **세기 상한 0.7**, 1초 안에 0.3 넘는 번쩍임이 2번을 넘으면 0.3 으로 |
| `feel.vignette(r, g, b, a, decay=3)` | 가장자리 색 번짐(피격·피의 마법·궁극기) |
| `feel.slowMo(배율, 실제 초)` | 슬로모션. 화면 채도가 35 % 빠진다(후처리가 켜져 있을 때) |
| `feel.darken(0–0.6)` | 장면만 어둡게(궁극기 동안 효과가 또렷해진다). 끝날 때 0 을 준다 |
| `feel.shakeScale` · `feel.flashScale` | 설정 연결: 화면 흔들림 0–1 · 번쩍임 0 / 0.5 / 1 |
| `feel.cam` | `{ sx, sy (카메라 평면 흔들림), kx, ky, kz (세계 밀림), roll, zoom }` — `applyToEye` 가 sx·sy·k 를 더한다 |
| `feel.screen` | `{ flash[4], vig[4], desat, dark }` — `post.end` 가 읽는다 |

마무리 일격(`hit.finisher`)이 묶는 것: 멈춤 0.133(강제) → 슬로모션 0.25배 × 0.30초 · 줌 8 % · 번쩍임 0.45 · 가장자리 주황 · 밀림 12 · 흔들림 0.5.

## 5. 후처리 (선택)

`post.begin(w, h, target=null)` → 장면 → `fx.draw` → `post.end(feel.screen)`.

| 단계 | 하는 일 | 전체 화면 패스 |
|---|---|---|
| low (또는 `post:false`) | 후처리 없음. 번쩍임·가장자리 색·어둡게가 있을 때만 사각형 한 장을 덧그린다 | 0 (있을 때 1) |
| mid | 장면을 RGBA8 + 깊이 24 프레임버퍼에 그림 → 밝은 픽셀만 1/4 로 → 1/8 → 되올림 → **합성 1회**(번짐 + 밝은 쪽만 누르는 톤 + 옅은 비네트 + 번쩍임 + 가장자리 색 + 채도 + 띠 방지 잡음) | 전체 크기 1 + 작은 것 3 (1/16 · 1/64 · 1/16 넓이) |
| high | 번짐 3단계(1/16 까지) + 합성에서 4번 읽기 | 전체 크기 1 + 작은 것 5 |

- 더하기로 쌓인 밝은 곳과 달빛 받은 흰 것만 번진다(문턱 0.68). 어두운 돌바닥은 번지지 않는다.
- 프레임버퍼는 크기가 바뀔 때만 다시 만든다. MSAA 는 쓰지 않는다(B 도 껐다).
- 비용의 대부분은 "전체 크기 합성 1회 + 장면을 텍스처로 그리는 것"이다. 폴드에서 이것이 얼마인지는 **재지 못했다** — 끊기면 `fx.setPost(false)` 한 줄로 끈다(§9).

## 6. 효과 모음

이름 · 소리 사건 · 손맛은 §8 의 표가 정본이다(검사 스크립트가 코드에서 뽑아 쓴다). 박자만 여기 적는다(초, 효과 시간 기준).

| 프리셋 | 예고 | 박자 |
|---|---|---|
| `fire.bolt` 화염탄 | 바닥 선 (0.22초 채움) | 시전 0.22 → 초속 980 으로 날아감(불꽃 꼬리·빛이 따라감) → 터짐(불길·불씨·고리·그을음) |
| `fire.pillar` 불기둥 | 원 r 74 (0.7초) | 0.7 에 기둥 두 겹 + 0.45초 동안 불길 |
| `fire.meteor` 운석 | 원 r 124 (1.1초) + 커지는 그림자 | 0.55 에 운석 출발 → 1.1 에 충돌(바위·균열·큰 고리) |
| `ice.lance` 얼음창 | 바닥 선 (0.18초) | 시전 0.18 → 초속 1,400 → 얼음 가시 + 서리 자국 |
| `ice.nova` 서리 폭발 | 원 r 196 (0.5초) | 0.5 에 가시 다발 3/5/6 개가 둘러 솟고 서리 바닥 |
| `lightning.chain` 연쇄 번개 | 바닥 선 (0.16초) | 0.18 부터 0.075초마다 한 고리씩 (최대 4) |
| `lightning.strike` 낙뢰 | 원 r 88 (0.6초) + 지직거림 | 0.6 에 굵은 번개 + 섬광 기둥 |
| `holy.pillar` 빛기둥 | 원 r 84 (0.6초) + 도는 마법진 | 0.6 에 기둥 두 겹, 0.6초 동안 빛 알갱이 |
| `holy.wave` 빛의 파동 | 부채꼴 r 290 · ±36° (0.4초) | 0.4 에 초승달 두 겹이 퍼져 나감 |
| `holy.bell` 종소리 충격파 | 종 문양 마법진 | 머리 위에 종이 흔들리고 0.12 · 0.44 · 0.76 에 세 번 울림(고리가 270 · 340 · 410 까지) |
| `blood.orb` 피의 구슬 | 바닥 선 (0.3초) | 시전 0.3 → 초속 560 (핏방울이 떨어진다) → 터짐 + 핏자국 |
| `shadow.claws` 그림자 발톱 | 표적 자리의 네모 (0.35초) | 0.35 부터 0.055초 간격으로 세 줄 |
| `enemy.breath` 적 화염 숨결 | 부채꼴 r 270 · ±23° (0.55초, **위험색**) | 0.55 에 원뿔 불길 0.5초 |
| `ult.bloodmoon` 궁극기 「붉은 달의 종」 | 마법진 두 겹(피 r 380 · 종 r 210) | 0 화면 어둡게 + 슬로모션 → 종 세 번(0.55 · 0.93 · 1.31) → 붉은 빛창 여덟 줄기(1.75–2.35) → 2.6 마무리(초승달 둘 · 큰 고리 셋 · 균열 · 불씨 비) → 3.3 끝 |

타격 7종은 한 박자다: 베인 선(가는 빛줄기) + 번쩍임 + 방향 불티 + (강한 것은) 고리·파편·바닥 균열 + 짧은 빛. `swing.*` 은 초승달 메시이고, 뼈가 달린 캐릭터는 칼 궤적 띠(§3.2)를 같이 쓴다.

## 7. 읽기 규칙 (효과가 놀이를 가리지 않게)

1. **가리면 안 되는 자리** — `fx.setProtect(i, x, y, z, r)` (i = 0–3: 영웅, 예고 동작 중인 적). 그 자리보다 카메라 쪽에 있는 **큰 입자**(지름 34 이상; 불티 같은 작은 것은 그대로)는 불투명도가 40 % 까지 내려간다. 정점 셰이더에서 계산한다(조각 비용 0). 메시(빛기둥)와 문양에는 아직 적용하지 않았다(§9).
2. **덧칠·밝기 상한** — 살아 있는 입자의 넓이 합이 화면의 0.35 / 0.5 / 0.7 배(low/mid/high)를 넘으면 장식 입자를 줄이기 시작해 0.9 / 1.3 / 1.8 배에서 ¼ 만 낸다. 같은 값으로 더하기 색도 55 % 까지 낮춘다(`fx.gain`, 번짐에도 곱한다). 꼭 필요한 입자(베인 선·번쩍임·뼛조각)는 줄이지 않는다.
3. **번쩍임 상한** 0.7 · 빈도 제한(§4). 타격 멈춤 합계 상한(§4).
4. **예고 표시는 어두운 돌에서도, 밝은 빛 웅덩이 위에서도 읽힌다** — 테두리(밝은 색) + 안쪽 어두운 밑판(알파 0.42) + 채워지는 면 + 채움 앞선의 밝은 띠 + 초당 2.5번 깜빡임. 플레이어 마법은 계열 색, **적의 공격 예고는 위험색(붉은 주황 `C.danger`)** 을 쓴다.
5. 타격 번쩍임은 지름 46–104 · 0.08–0.16초로 짧고 작다(맞는 적의 몸이 가려지지 않는다). 맞는 순간 적이 하얗게 되는 것은 캐릭터 쪽 `hurtFlash` 다.

## 8. 숫자

<!-- numbers:begin -->
측정: 2026-11-17 15:27 UTC · 헤드리스 Chromium 1194 + SwiftShader(소프트웨어 렌더러) — **프레임 시간은 기기 값이 아니다.** 아래는 옮겨 읽을 수 있는 값(개수·바이트·JS 시간)만 적었다.

**프리셋 목록 (연결 계약)**

| 이름 | 뜻 | 자리 | 소리 사건 | 손맛 호출 |
|---|---|---|---|---|
| `hit.slash.light` | 약한 베기 | 맞은 점 + 방향 | `hit.slash.light` | hitStop 0.05 · kick 3 · trauma 0.10 |
| `hit.slash.heavy` | 강한 베기 | 맞은 점 + 방향 | `hit.slash.heavy` | hitStop 0.10 · kick 8 · trauma 0.24 |
| `hit.blunt` | 둔기 | 맞은 점 + 방향 | `hit.blunt` | hitStop 0.10 · kick 8 · trauma 0.28 |
| `hit.pierce` | 찌르기 | 맞은 점 + 방향 | `hit.pierce` | hitStop 0.06 · kick 5 · trauma 0.12 |
| `hit.crit` | 치명타 | 맞은 점 + 방향 | `hit.crit` | hitStop 0.133 · kick 8 · trauma 0.30 · zoomPunch 0.04 · flash 0.16 |
| `hit.guard` | 막기 · 쳐내기 | 맞은 점 + 방향 | `hit.guard` `hit.parry` | hitStop 0.07 · kick 4(반대) · trauma 0.14 · (pow>1.2: slowMo 0.4×0.14s · zoomPunch 0.03) |
| `hit.finisher` | 마무리 일격 | 맞은 점 + 방향 | `hit.finisher` `feel.slowmo` | hitStop 0.133(강제) · slowMo 0.25×0.30s · zoomPunch 0.08 · flash 0.45 · vignette 0.3 · kick 12 · trauma 0.5 |
| `swing.light` | 휘두르기(약) | 발밑 (+방향) | `swing.light` | — |
| `swing.heavy` | 휘두르기(강) | 발밑 (+방향) | `swing.heavy` | — |
| `move.dash` | 대시 | 발밑 (+방향) | `move.dash` | — |
| `move.land` | 착지 | 발밑 (+방향) | `move.land` | (pow>1.2: trauma 0.06·pow) |
| `move.step` | 발걸음 | 발밑 (+방향) | `move.step` | — |
| `move.jump` | 점프 | 발밑 (+방향) | `move.jump` | — |
| `enemy.hurt` | 피격 불티 | 맞은 점 + 방향 | `enemy.hurt` | — (번쩍임은 hurtFlash(age)) |
| `enemy.death.bone` | 뼈 흩어짐 | 발밑 (+방향) | `enemy.death.bone` | hitStop 0.05 · trauma 0.14 |
| `enemy.death.ash` | 재로 흩어짐 | 발밑 (+방향) | `enemy.death.ash` | hitStop 0.05 · trauma 0.10 (분해는 dissolveK(age)) |
| `enemy.breath` | 적 화염 숨결 | 발밑 (+방향) | `enemy.breath.cast` `enemy.breath.fire` | trauma 0.16 |
| `buff.shield` | 보호막 | 발밑 (+방향) | `buff.shield` | — |
| `pickup` | 줍기 | 발밑 (+방향) | `pickup.coin` `pickup.heal` `pickup.mana` | — (pow 1 금화 · 2 회복 · 3 마력) |
| `fire.bolt` | 화염탄 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.fire.cast` `magic.fire.fly` `magic.fire.hit` | hitStop 0.067 · kick 5 · trauma 0.2 |
| `fire.pillar` | 불기둥 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.fire.cast` `magic.fire.pillar` | hitStop 0.05 · trauma 0.3 |
| `fire.meteor` | 운석 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.meteor.cast` `magic.meteor.fall` `magic.meteor.impact` | hitStop 0.12 · kick 14(아래) · trauma 0.6 · flash 0.3 · zoomPunch 0.05 |
| `ice.lance` | 얼음창 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.ice.cast` `magic.ice.fly` `magic.ice.hit` | hitStop 0.067 · kick 5 · trauma 0.18 |
| `ice.nova` | 서리 폭발 | 발밑 (+방향) | `magic.ice.nova.cast` `magic.ice.nova.burst` | hitStop 0.08 · trauma 0.3 · flash 0.12 |
| `lightning.chain` | 연쇄 번개 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.lightning.cast` `magic.lightning.zap` | 고리마다 hitStop 0.04 · trauma 0.12 · flash 0.07 |
| `lightning.strike` | 낙뢰 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.thunder.charge` `magic.thunder.strike` | hitStop 0.10 · kick 10(아래) · trauma 0.5 · flash 0.35 |
| `holy.pillar` | 빛기둥 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.holy.cast` `magic.holy.pillar` | trauma 0.2 · flash 0.12 |
| `holy.wave` | 빛의 파동 | 발밑 (+방향) | `magic.holy.cast` `magic.holy.wave` | hitStop 0.04 · kick 4 · trauma 0.16 |
| `holy.bell` | 종소리 충격파 | 발밑 (+방향) | `magic.bell.cast` `magic.bell.toll` | 울릴 때마다 trauma 0.12 · zoomPunch 0.02 · flash 0.06 · (셋째: slowMo 0.6×0.12s) |
| `blood.orb` | 피의 구슬 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.blood.cast` `magic.blood.fly` `magic.blood.hit` | hitStop 0.067 · kick 5 · trauma 0.2 · vignette 0.22 |
| `shadow.claws` | 그림자 발톱 | 쏘는 쪽 발밑 → 표적 발밑 | `magic.shadow.cast` `magic.shadow.claw` | 발톱마다 hitStop 0.05 · kick 6 · trauma 0.14 |
| `ult.bloodmoon` | 궁극기 · 붉은 달의 종 | 발밑 (+방향) | `ult.cast` `magic.bell.toll` `ult.lance` `ult.final` | slowMo 0.35×0.45s · darken 0.4 · 종 ×3 trauma 0.22 · 빛창 ×8 hitStop 0.033 · 마무리 hitStop 0.25(강제) · flash 0.6 · zoomPunch 0.10 · slowMo 0.25×0.4s · trauma 0.8 |

**프리셋별 비용** (혼자 냈을 때의 최댓값. 덧칠 = 효과가 덮는 넓이 ÷ 폴드 화면 960×726; 겹쳐 그린 넓이의 합이라 1 을 넘을 수 있다)

| 프리셋 | 뿜는 입자 low / mid / high | 동시에 산 입자 (mid) | 그리기 호출 (mid) | 덧칠 low / mid / high | 문양 · 메시 · 띠 · 빛 (mid) |
|---|---|---|---|---|---|
| `hit.slash.light` | 6 / 8 / 11 | 8 | 1 | 0.01 / 0.01 / 0.01 | 0 · 0 · 0 · 1 |
| `hit.slash.heavy` | 10 / 16 / 21 | 16 | 2 | 0.04 / 0.04 / 0.04 | 1 · 0 · 0 · 1 |
| `hit.blunt` | 8 / 11 / 15 | 11 | 2 | 0.09 / 0.09 / 0.11 | 2 · 0 · 0 · 1 |
| `hit.pierce` | 7 / 9 / 12 | 9 | 2 | 0.02 / 0.02 / 0.02 | 1 · 0 · 0 · 1 |
| `hit.crit` | 9 / 14 / 19 | 14 | 2 | 0.12 / 0.12 / 0.12 | 1 · 0 · 0 · 1 |
| `hit.guard` | 8 / 9 / 19 | 9 | 2 | 0.10 / 0.04 / 0.10 | 1 · 0 · 0 · 1 |
| `hit.finisher` | 21 / 33 / 45 | 33 | 2 | 0.30 / 0.31 / 0.32 | 5 · 0 · 0 · 1 |
| `swing.light` | 0 / 0 / 0 | 0 | 1 | 0.01 / 0.01 / 0.01 | 0 · 1 · 0 · 0 |
| `swing.heavy` | 0 / 0 / 0 | 0 | 1 | 0.02 / 0.02 / 0.02 | 0 · 1 · 0 · 0 |
| `move.dash` | 6 / 8 / 12 | 8 | 2 | 0.02 / 0.03 / 0.04 | 1 · 0 · 0 · 0 |
| `move.land` | 8 / 14 / 19 | 14 | 2 | 0.07 / 0.12 / 0.16 | 1 · 0 · 0 · 0 |
| `move.step` | 1 / 3 / 3 | 3 | 1 | 0.00 / 0.01 / 0.01 | 0 · 0 · 0 · 0 |
| `move.jump` | 2 / 5 / 6 | 5 | 2 | 0.01 / 0.03 / 0.03 | 1 · 0 · 0 · 0 |
| `enemy.hurt` | 2 / 3 / 4 | 3 | 1 | 0.00 / 0.00 / 0.00 | 0 · 0 · 0 · 0 |
| `enemy.death.bone` | 11 / 16 / 21 | 16 | 2 | 0.03 / 0.09 / 0.09 | 1 · 0 · 0 · 0 |
| `enemy.death.ash` | 26 / 42 / 68 | 42 | 2 | 0.03 / 0.05 / 0.07 | 1 · 0 · 0 · 1 |
| `enemy.breath` | 16 / 22 / 37 | 17 | 3 | 0.30 / 0.33 / 0.42 | 2 · 1 · 0 · 1 |
| `buff.shield` | 0 / 0 / 0 | 0 | 2 | 0.05 / 0.05 / 0.05 | 1 · 1 · 0 · 1 |
| `pickup` | 4 / 7 / 10 | 7 | 2 | 0.02 / 0.03 / 0.03 | 2 · 0 · 0 · 1 |
| `fire.bolt` | 35 / 46 / 69 | 35 | 3 | 0.17 / 0.22 / 0.30 | 3 · 0 · 1 · 2 |
| `fire.pillar` | 32 / 47 / 69 | 38 | 4 | 0.21 / 0.21 / 0.26 | 3 · 2 · 0 · 1 |
| `fire.meteor` | 57 / 108 / 157 | 85 | 4 | 0.63 / 0.86 / 1.05 | 8 · 1 · 1 · 2 |
| `ice.lance` | 24 / 40 / 52 | 33 | 4 | 0.08 / 0.12 / 0.12 | 3 · 1 · 1 · 2 |
| `ice.nova` | 23 / 39 / 56 | 32 | 7 | 0.26 / 0.34 / 0.42 | 5 · 5 · 0 · 2 |
| `lightning.chain` | 20 / 27 / 37 | 14 | 3 | 0.04 / 0.04 / 0.04 | 4 · 0 · 5 · 4 |
| `lightning.strike` | 23 / 44 / 56 | 25 | 4 | 0.20 / 0.20 / 0.20 | 5 · 1 · 2 · 2 |
| `holy.pillar` | 26 / 36 / 48 | 27 | 4 | 0.26 / 0.26 / 0.27 | 5 · 2 · 0 · 2 |
| `holy.wave` | 13 / 21 / 30 | 14 | 4 | 0.43 / 0.42 / 0.42 | 3 · 2 · 0 · 2 |
| `holy.bell` | 20 / 34 / 48 | 30 | 3 | 0.80 / 0.80 / 0.80 | 6 · 1 · 0 · 2 |
| `blood.orb` | 27 / 47 / 60 | 32 | 3 | 0.14 / 0.14 / 0.18 | 3 · 0 · 1 · 2 |
| `shadow.claws` | 15 / 24 / 35 | 17 | 5 | 0.08 / 0.11 / 0.12 | 4 · 3 · 0 · 3 |
| `ult.bloodmoon` | 156 / 244 / 356 | 105 | 11 | 3.55 / 3.50 / 3.56 | 18 · 7 · 3 · 5 |

**난전 한 프레임의 예산** (15초 = 900프레임, 사건은 실제 시간 기준: 적 12, 초당 타격 6회 + 휘두르기, 발걸음 초당 24, 마법 초당 2.5개(늘 3개쯤 떠 있음), 큰 마법 2.4초마다, 죽음 1.5초마다)

| 단계 | 효과 그리기 호출 최대 (평균) | + 후처리 패스 | 입자: 제출 최대 / 실제 산 것 최대 (평균) / 상한 | 문양 최대 | 메시 최대 (삼각형) | 띠 최대 (정점) | 빛 최대 | 덧칠 최대 (평균) | 밝기 조절 최저 | 효과 JS 시간 평균 · p95 · 최대 (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| low | 9 (6.1) | 0 | 281 / 130 (80) / 1024 | 40 | 6 (424) | 5 (142) | 3 | 1.37 (0.57) | 0.79 | 0.03 · 0.10 · 3.00 |
| mid | 12 (6.3) | 4 | 457 / 200 (131) / 2048 | 41 | 8 (592) | 7 (178) | 5 | 1.53 (0.70) | 0.76 | 0.05 · 0.10 · 4.70 |
| high | 12 (6.4) | 6 | 624 / 298 (189) / 4096 | 41 | 9 (676) | 7 (178) | 8 | 1.66 (0.84) | 0.78 | 0.09 · 0.10 · 23.90 |

- 프레임당 GL 호출 수(난전 6초 평균 · 최대; 유니폼·버퍼·그리기를 모두 센 것): 효과 그리기 low 76 · 95 / mid 77 · 95 / high 77 · 95, 후처리 low 13 / mid 45 / high 55.

- 장면(시험 화면의 바닥·벽·인형)은 따로 13회. 효과 JS 시간 = `fx.update` + `fx.draw` 안에서 잰 `performance.now()` 차이(헤드리스·다른 작업과 CPU 를 나눠 쓰는 기계에서 잰 값; GPU 시간은 들어 있지 않다).

**프레임당 할당** (`performance.memory.usedJSHeapSize`, `--enable-precise-memory-info` · 시작 전에 `gc()`; 먼저 900–2,400프레임을 돌려 JIT 를 데운 뒤 잰다)

| 경우 | 잰 프레임 | 그동안 는 힙 | 프레임당 | 루프 시간 ÷ 프레임 (헤드리스) |
|---|---|---|---|---|
| **정상 상태, 효과 엔진만** (`fx.tick` + `fx.draw`; 살아 있는 문양만 있고 새로 내지 않음) | 1200 | 272 바이트 | 0.2 바이트 | 0.127 ms |
| 난전, 효과 엔진만 (`fx.tick` + 프리셋 호출 + `fx.draw`) | 1200 | 74452 바이트 | 62.0 바이트 | 2.390 ms |
| 난전, 시험 화면 프레임 전체 (시험 화면의 장면 그리기 · 카메라 · 후처리 포함) | 600 | 961792 바이트 | 1603.0 바이트 | 0.142 ms |
| 대조: 정상 상태 루프에서 프레임마다 `new Float64Array(16)` 하나를 일부러 잡음 | 1200 | 316388 바이트 | 263.7 바이트 | 0.483 ms |

**메모리**

- fold_open (캔버스 1000×756): 효과 GPU 메모리 9.15 MB = 텍스처 2.70 (입자 512² + 문양 512² + 잡음 64², 밉맵 포함) + 후처리 버퍼 5.99 (장면 색 + 깊이 + 번짐 단계) + 정점 버퍼 0.46
- phone2 (캔버스 740×360): 효과 GPU 메모리 5.27 MB = 텍스처 2.70 (입자 512² + 문양 512² + 잡음 64², 밉맵 포함) + 후처리 버퍼 2.11 (장면 색 + 깊이 + 번짐 단계) + 정점 버퍼 0.46
- 후처리 버퍼는 캔버스 크기에 비례한다: 폴드 실기 medium(1455×1100)이면 약 13 MB, high(2000×1512)면 약 25 MB. low 단계는 후처리를 꺼서 0.
<!-- numbers:end -->

JS 시간을 읽는 법: 표의 「효과 JS 시간」은 `fx.update`·`fx.draw` 안에서만 잰 것이고(프리셋을 부르는 시간은 빠져 있다) 크롬의 시계가 0.1 ms 단위라 평균만 뜻이 있다. 할당 표의 「루프 시간 ÷ 프레임」은 프리셋 호출까지 넣은 값이지만 소프트웨어 GPU 가 명령을 받아 주기를 기다리는 시간이 섞여 있다(난전 2.9 ms 의 대부분). 둘 다 **기기 값이 아니다.**

할당을 본 방법과 읽는 법:

- 시험 화면의 `__fx.alloc()` 이 한 번의 동기 루프 안에서 프레임을 돌리고 앞뒤의 `performance.memory.usedJSHeapSize` 를 **새로 읽어** 뺀다(크롬을 `--enable-precise-memory-info --js-flags=--expose-gc` 로 띄워 값이 뭉개지지 않게 하고, 재기 직전에 `gc()`). 루프 중에는 다른 일이 끼어들지 않으므로 늘어난 바이트가 곧 그 프레임들의 할당이다. **대조군**(같은 루프에서 일부러 배열을 하나씩 잡음)이 잡히는지도 같이 본다 — 처음에는 `performance.memory` 객체를 잡아 두고 읽어 늘 0 이 나왔고(옛 값), 대조군을 넣고서야 알았다.
- 어디서 새는지는 `node tools/v2/fx_check.mjs --probe` (조각별로 1,200번 돌린 힙 차이)로 찾았다. 찾아서 없앤 것: `gl.uniform4f(…)` 에 실수를 넘기면 인자마다 12바이트 숫자 상자가 생긴다 → 미리 잡은 `Float32Array` 로 `uniform4fv`; 프레임 함수끼리 시간·밝기를 인자로 넘기던 것 → 필드로; `performance.now()` → `profile` 일 때만.
- **정상 상태**(살아 있는 효과만 돌고 새로 내지 않을 때)의 효과 엔진은 객체·배열·클로저를 만들지 않고, **데워진 뒤에는 숫자 상자도 만들지 않는다**. 처음 이 문서에는 "프레임당 12–20바이트가 남고 어느 줄인지 못 찾았다"고 적었는데, 검수에서 같은 페이지로 되풀이해 재니 15.8 → 0.04 → 0.05 → 0.01 바이트/프레임(마지막은 4,800프레임에 52바이트)으로 가라앉았다 — 남던 것은 V8 의 최적화 컴파일이 끝나기 전에 돌던 코드의 숫자 상자였다(기계가 바쁘면 120바이트/프레임까지 나와 검사가 실패하기도 했다). 그래서 검사 스크립트는 정상 상태를 네 번까지 다시 재서 가라앉은 값을 적고, 통과 문턱은 "프레임당 2바이트 미만"이다. 게임에서도 장면에 들어간 뒤 처음 수십 초는 이 데우기 구간이다.
- `fx.update` 의 dt 를 형식 배열로 주고받게 바꿔 봤더니 오히려 54–62바이트로 늘어 되돌렸다(V8 이 어떤 경로를 최적화하느냐에 따라 달라진다는 뜻이라, 폴드의 WebView 에서 다시 재야 한다).
- **새 효과를 낼 때**(표의 「난전」 줄)는 0 이 아니다(검수 재측정: 1,200프레임 127바이트/프레임 · 4,800프레임 210바이트/프레임). 프리셋이 엔진 함수에 좌표를 실수 인자로 넘길 때 V8 이 숫자 상자(12바이트)를 만든다 — 객체는 없고 짧게 사는 숫자뿐이다. 잰 값은 프레임당 60–160바이트(한 루프로 묶여 최적화됐을 때)에서 1.1 KB(조각별로 따로 불렀을 때)까지 흔들린다. 많이 잡아도 초당 70 KB 라 젊은 세대 수거(대개 1 ms 미만)가 수십 초 – 몇 분에 한 번이다. 완전히 없애려면 좌표를 스크래치 배열로 넘기도록 방출 함수의 인자를 바꿔야 한다(§10).
- 시험 화면 프레임 전체의 값에는 시험 화면 자신의 장면 그리기(인형마다 `uniform4f`)와 카메라 계산이 들어 있다 — 엔진의 것이 아니다.

## 9. 약한 점 (솔직히)

1. **폴드에서 돌려 보지 않았다.** 개수는 작지만 반투명 채움(큰 고리·빛기둥·마법진)과 후처리의 실제 비용은 기기에서만 알 수 있다. 특히 궁극기는 화면을 여러 겹 덮는다(§8 의 덧칠).
2. **큰 고리는 사각형 전체를 칠한다.** 반지름 700 짜리 바닥 고리는 가운데가 비어 있어도 조각 셰이더가 전부 돈다. 고리 모양 메시(띠)로 바꾸면 채움이 1/5 로 준다.
3. **부드러운 입자(깊이 페이드)가 없다.** 연기·불길이 바닥·벽과 만나는 곳에 선이 보일 수 있다(깊이 텍스처가 필요해서 뺐다). 바닥 높이로 자르는 것으로 대신했다.
4. 효과끼리 정렬하지 않는다(더하기가 대부분이라 티가 적다). 알파 연기가 더하기 불길 뒤에 있어도 위에 그려질 수 있다.
5. 칼 궤적은 프레임마다 넣은 점을 직선으로 잇는다 → 60 Hz 에서 빠른 휘두름은 각져 보인다(곡선 보간이 없다). 초승달 메시가 그 자리를 메운다.
6. 읽기 규칙 1 은 입자에만 걸린다. 영웅 자리에 떨어지는 빛기둥은 영웅을 덮는다(더하기라 비쳐 보이긴 한다).
7. 빛은 그림자를 만들지 않고, B 의 세계 셰이더는 아직 빛 목록을 읽지 않는다(§3.4 의 연결이 필요).
8. 마법의 "터짐만" 따로 부르는 이름이 없다(판정이 효과 박자와 어긋날 때 필요).
9. 번개·불길 모양은 전부 절차식이라 손그림 같은 개성은 약하다. 계열마다 그림 한두 장(생성 이미지)을 입자 칸에 더하면 달라지지만, 이번에는 쓰지 않았다.
10. WebGL1 에서는 돌지 않는다(`createFx` 가 null). B 는 WebGL1 로도 내려가므로 그때는 효과 없이 돈다.
11. 새 효과를 낼 때는 숫자 상자가 생긴다(§8 할당 표의 「난전」 줄). 객체는 아니지만 "프레임당 할당 0" 은 **새로 내지 않는 프레임**에서만 참이다.
12. 마무리 일격은 0.3초쯤(슬로모션 포함) 맞는 적이 흰 빛에 묻히고, 궁극기 마무리 0.2초쯤은 화면 가운데가 거의 하얗다(번쩍임 0.6 + 큰 고리 + 초승달). 상한 안이지만 그 순간에는 인물이 묻힌다. 바닥의 종 문양은 비스듬히 보면 세모처럼 읽힌다(그림을 다시 그릴 것).
13. 발걸음 먼지는 거의 안 보일 만큼 옅다(일부러 약하게 잡았지만 폴드에서 보고 다시 정할 것). 타격은 재질(살·뼈·쇠·유령) 구분이 아직 없다. 효과는 인형으로만 봤고 진짜 캐릭터(char3d)·진짜 스테이지(B) 위에서는 보지 못했다.

14. (검수에서 찾음) **영웅이 맞는 효과가 없다** — `enemy.hurt` 는 있지만 영웅 피격(붉은 가장자리 · 흔들림 · 짧은 멈춤)을 한 번에 내는 프리셋이 없다. 통합 때는 `fx.feel` 을 직접 부른다(§11.1 의 5).
15. (검수에서 찾음) **시퀀스 풀이 차면 새 마법은 조용히 버려진다** — low 단계는 동시에 24개까지. 운석 40개를 한꺼번에 쏜 뒤 부른 궁극기는 아예 나오지 않았다(오류도 없다). 놀이에서는 드물지만, 궁극기는 풀이 차도 나오게 자리를 빼앗는 규칙이 필요하다.
16. (검수에서 찾음) 휴대폰 가로 화면(740×360)에서는 궁극기의 종이 화면 위로 반쯤 잘린다. 피의 구슬은 다른 계열에 견주어 작고 어둡다(계열 가운데 가장 약하다). 그림자 발톱은 작은 화면에서 발톱 모양이 잘 읽히지 않는다.
17. (검수에서 찾음) 타격 멈춤의 "1초에 0.40초" 상한은 **최소 1프레임 규칙 때문에** 극단에서는 넘는다: 120 Hz 에서 초당 20번 강타를 넣으면 1초에 0.60초가 멈췄다. 초당 6타 수준에서는 문제없다.

## 10. 다음 단계

1. **B 에 꽂기**(§3 순서 그대로): `fx.update` 의 dt 로 sim 을 돌리고, `_matrix` 에 `applyToEye`·줌, `render` 에 `post.begin` / `fx.draw` / `post.end`, sim 의 hooks(타격·피격·대시·착지·죽음)에서 `playAt`. B 가 지금 쓰는 `_burst` 스프라이트 효과와 `shake` 는 뗀다.
2. **폴드 실측**: 난전 장면에서 단계별 프레임 시간, 후처리 켬/끔 차이 → 기본 단계와 후처리 기본값을 정한다. 셸의 품질 조절기에 `fx.setTier` 를 물린다.
3. char3d 에 `hurtFlash`·`fxDissolve`·`fxLights` 연결, 칼 뼈에서 궤적 띠.
4. ~~소리 담당과 사건 이름 맞추기~~ → 검수에서 다리(`src/v2/feel/fxbridge.js`)로 이었다. 남은 것: 빌려 쓴 소리 16개를 들어 보고 전용 소리로 바꾸기(§11.2), 타격 연출값을 한 표로 합치기(§11.3).
5. 방출 함수에 좌표를 스크래치 배열로 넘겨 사건 때의 숫자 상자도 없애기. 큰 고리를 띠 메시로, 터짐 전용 프리셋, 적 공격 예고 프리셋(원·선·부채꼴을 위험색으로 한 번에), 피해 숫자(3D 자리에서 화면으로).
6. 적 재질별 타격(살·뼈·쇠·유령 — feel.md §4.7)과 무기별 색.

## 11. 통합 순서 — 다음 사람이 그대로 따라 하는 단계 (검수에서 B · char3d · 소리 쪽의 실제 코드와 맞춰 봄)

검수에서 확인한 사실(계약을 쓸 때의 가정과 다른 것):

- B 의 장면 클래스는 **이미 `this.fx`(스프라이트 불티 배열) · `this.shake` · `this.shakeX/Y` 를 쓴다** → 효과 엔진은 `this.vfx` 처럼 다른 이름에 둔다.
- B 의 sim 훅: `hit(e, dmg, mv, x, y, z)`(이때 `e.hp` 는 이미 깎여 있다) · `kill(e)` · `heroHurt(dmg, pit)` · `spark(x, y, z, kind)`(sim 이 내는 kind 는 `'dust'` · `'shot'`) · `sfx(name)`(`'swing'` · `'cast'` · `'parry'` · `'die'` · `'dash'` · `'jump'` · `'land'` · `mv.sfx`) · `shake(px)` · `number` · `done`. 적 정의에 `material` 은 없다(소리 쪽 요청 1번이 아직 안 됐다) → 그때까지 `'bone'`.
- B 의 `_matrix()` 는 `this.camR` · `this.camU` · `this.eye` 를 프레임마다 새 배열로 만든다(B 쪽 할당). `glr.js` 는 프레임버퍼를 묶지 않는다 → `post.begin` 을 `glr.begin` 앞에 부르면 장면이 그대로 후처리 버퍼로 들어간다.
- `glr` 은 WebGL2 가 없으면 WebGL1 로 내려간다(`glr.webgl2`). 그때 `createFx` 는 null → 아래 코드는 `V` 가 null 이어도 돌게 썼다(소리는 다리가 그대로 낸다).
- 컨텍스트 복구는 `glr.restored` 숫자로 안다(char3d 의 `cr.restore()` 와 같은 방식).
- char3d 조각 셰이더는 GLSL ES 1.00(`gl_FragColor`)이고 `vWP` · `vN` · `uFx.x`(번쩍임, `Char3D.draw(place, { flash })`)가 이미 있다. **칼 뼈의 세계 좌표를 내주는 함수는 없다** → 칼 궤적 띠는 char3d 가 그 함수를 낸 뒤에.
- 효과 셰이더 문자열 안의 한글 주석은 검수에서 영어로 바꿨다(글꼴 검사가 그 글자들 때문에 실패했고, WebGL1 셰이더에 붙일 때 문제가 될 수 있다).

### 11.1 `src/v2/b/index.js` 에 꽂기

```js
import { createFx, PRESET_IDS } from '../fx/index.js';
import { feel, FLAG } from '../feel/index.js';
import { bindFxSound } from '../feel/fxbridge.js';

// 1) 만들기 — glr 을 만든 뒤 한 번
this.bridge = bindFxSound(feel);
this._mkFx = () => {                                      // 처음 + 컨텍스트를 되찾은 뒤
  this.vfx = this.glr.webgl2 ? createFx(this.glr.gl, { tier: 'mid', lightPools: true, onEvent: this.bridge.onEvent }) : null;
  this.vfxGen = this.glr.restored;
};
this._mkFx(); feel.preload(); feel.setRoom('street');
this.camF = [0, 0, 1]; this.vcam = { vp: this.vp, eye: null, right: null, up: null, fwd: this.camF };   // 한 번만 잡는다

// 2) update(dt) — sim.update 를 감싼다. 213–214행의 this.shake · shakeX · shakeY 계산은 지운다
const V = this.vfx, gdt = V ? V.update(dt) : dt;          // 타격 멈춤 중 0 · 느린 화면 중 줄어든 값
this.bridge.sync(V);                                      // 느린 화면 → 소리 배속
sim.update(gdt, inp);
this.bridge.speed = Math.hypot(sim.hero.vx, sim.hero.vz); // 발소리 빠르기
const c = this.cam; feel.setListener(c.px, c.py, c.pz, c.fx, c.fy, c.fz, c.dist, (this.game.viewW / 2) / FOCAL); feel.update();

// 3) _matrix — 흔들림 · 밀림 · 줌 (shakeX/Y 를 쓰던 270행과 초점 F 의 271행)
const k = this.vfx ? this.vfx.feel.cam : null;
const px = c.px + (k ? rx * k.sx + ux * k.sy + k.kx : 0), py = c.py + (k ? uy * k.sy + k.ky : 0), pz = c.pz + (k ? rz * k.sx + uz * k.sy + k.kz : 0);
const F = FOCAL * (1 + Math.max(0, Hv - 540) / 540 * 0.3) * (k ? k.zoom : 1);

// 4) render — glr.begin(323행) 앞과 마지막 drawDyn 뒤
if (this.vfxGen !== glr.restored) this._mkFx();           // 되찾은 뒤에만 다시 만든다 (§3.1)
const V = this.vfx, h = this.sim.hero;
if (V) { V.setProtect(0, h.x, h.y + 55, h.z, 46); V.post.begin(glr.gl.drawingBufferWidth, glr.gl.drawingBufferHeight); }
glr.begin(vp, fog, this.W.sky.top, this.A);  /* … 하늘 · 세계 메시 · 입체 영웅 · 빌보드 … */
if (V) {
  const C = this.vcam, cm = this.cam; this.camF[0] = cm.fx; this.camF[1] = cm.fy; this.camF[2] = cm.fz; C.eye = this.eye; C.right = this.camR; C.up = this.camU;
  V.draw(C); V.post.end(V.feel.screen);
  glr.gl.useProgram(glr.prog); glr.gl.bindBuffer(glr.gl.ARRAY_BUFFER, glr.dyn.buf); glr._attribs();   // 뒤에 glr 로 더 그릴 것이 있으면
}

// 5) 훅 (_hooks) — _burst · shake · 직접 부르던 v1 효과음을 뗀다
hit: (e, dmg, mv, x, y, z) => {
  const hr = this.sim.hero, dl = Math.hypot(e.x - hr.x, e.z - hr.z) || 1;
  const st = mv.finisher ? 'F' : mv.id === 'sw3' ? 'H' : 'L';
  const fl = (mv.finisher ? FLAG.finisher : 0) | (e.hp <= 0 ? FLAG.kill : 0);
  this.bridge.strike(this.vfx, 'sword', e.material ?? 'bone', st, fl, x, y, z, (e.x - hr.x) / dl, (e.z - hr.z) / dl);   // 효과 + 소리 + 진동, 한 번씩
  /* 피해 숫자(this.nums.push)는 그대로 */
},
kill: (e) => { this.vfx?.playAt(PRESET_IDS['enemy.death.bone'], e.x, e.y, e.z, 1, 0, 1, e.x, e.y, e.z); },
heroHurt: (dmg, pit) => {                                 // 영웅 피격 프리셋은 아직 없다 (§9-14)
  feel.play('hero.hurt', this.sim.hero);
  const Ff = this.vfx?.feel; if (Ff) { Ff.hitStop(0.05); Ff.addTrauma(0.3, 0, 0); Ff.vignette(0.9, 0.05, 0.08, 0.5, 2.5); }
},
sfx: (n) => {                                             // h = this.sim.hero, (fx, fz) = 영웅이 보는 방향
  const id = { swing: 'swing.light', dash: 'move.dash', jump: 'move.jump', land: 'move.land' }[n];
  if (id && this.vfx) this.vfx.playAt(PRESET_IDS[id], h.x, h.y, h.z, fx, fz, 1, h.x, h.y, h.z);   // 소리는 onEvent 로 따라 난다
  else if (id) this.bridge.onEvent(id, h.x, h.y, h.z, 1);                                        // WebGL1: 소리만
  else if (n === 'parry') this.bridge.strike(this.vfx, 'sword', 'armor', 'H', FLAG.parry, h.x + fx * 30, h.y + 60, h.z + fz * 30, fx, fz);
  else if (n === 'cast') feel.play('enemy.mage.chant', /* 시전한 적 */ null);
},
spark: (x, y, z, kind) => { if (kind === 'dust') this.vfx?.playAt(PRESET_IDS['move.step'], x, y, z, 1, 0, 1, x, y, z); },
shake: () => {},                                          // 프리셋이 낸다

// 6) 떠날 때
this.vfx?.dispose(); feel.release();                      // 방을 옮길 때는 this.vfx?.clear(); feel.setRoom(…)
```

품질: 셸의 품질 조절기에서 `this.vfx.setTier('low' | 'mid' | 'high')` · `this.vfx.setPost(false)`. 단계를 바꾸면 살아 있는 효과는 지워진다(궁극기 도중에 바꿔도 화면이 어두운 채 남지 않게 검수에서 고쳤다).

### 11.2 소리 다리 (`src/v2/feel/fxbridge.js`)

효과의 소리 사건 53개 → 소리 쪽 호출. 검사: `node tools/v2/fx_sound_link.mjs`(node 만으로 돈다; 표가 어긋나면 실패).

| 종류 | 개수 | 어떻게 |
|---|---|---|
| 타격 `hit.*` | 8 | `feel.hit(무기, 재질, 세기, flags, 자리)` — 무기·재질·세기는 `bridge.strike(...)` 가 넘긴 것, 프리셋만 따로 불렀으면 표의 기본값(한손검 · 살) |
| 소리 표의 사건 그대로 | 20 | `feel.play(이름, 자리, vol)` — 이동 3 · 뼈 죽음 · 불/얼음/번개/성/피의 시전·날아감·터짐 · 종 · 궁극기 시작(= 종 가락 `bell.bloodmoon`) |
| **빌려 쓴 것** | 16 | 전용 소리가 없어 가까운 소리의 높낮이·크기만 바꿨다: 재 죽음 · 적 숨결 시전 · 보호막 · 불기둥 · 운석 3 · 서리 폭발 2 · 낙뢰 2 · 종 시전 · 그림자 2 · 궁극기 빛창 · 궁극기 마무리. **들어 보고 따로 만들 후보** |
| v1 효과음 | 4 | 금화 · 회복 · 마력 줍기, 적 화염 숨결(`fire_breath`) — `audio.sfx` 를 그대로 |
| 휘두름 · 발소리 | 3 | `feel.swing` · `feel.step(bridge.speed)` |
| 일부러 무음 | 2 | `enemy.hurt`(타격 소리가 같은 순간에 난다) · `feel.slowmo`(마무리 소리에 들어 있다) |

거꾸로, 소리 표에는 있는데 효과가 부르지 않는 것(게임 코드가 직접 부른다): 걷기·질주 발소리, 천·장비 소리, 칼 뽑기·넣기, 영웅 피격, 해골 덜그럭·마법사 주문·박쥐, 횃불, 고리 소리(횃불·밤거리·날아가는 마법 5), 메뉴 6, 종 가락 4, `move.land_heavy`. 날아가는 마법의 고리 소리(`loop.magic.*`)는 효과가 탄의 자리를 밖으로 내주지 않아 아직 못 붙인다.

### 11.3 두 표가 같은 타격에 다른 값을 적어 둔 것 (한 번만 건다)

화면이 실제로 쓰는 값은 **효과 프리셋의 것**이다. `feel.hit` 이 돌려주는 `r.stop` · `r.shake` · `r.kick` · `r.zoom` · `r.slow` 를 프리셋을 낸 타격에 또 걸면 흔들림이 두 배가 된다(멈춤은 큰 쪽만 남는다).

| 타격 | 효과 프리셋: 멈춤 · 흔들림 · 밀림 | 소리 표의 추천값(뼈) |
|---|---|---|
| 약한 베기 | 0.050 · 0.10 · 3 | 0.047 · 0.10 · 3 |
| 강한 베기 | 0.100 · 0.24 · 8 | 0.105 · 0.26 · 9 |
| 둔기 | 0.100 · 0.28 · 8 | 0.137 · 0.26 · 9 |
| 찌르기 | 0.060 · 0.12 · 5 | 0.056 · 0.16 · 5 |
| 치명타 | 0.133 · 0.30 · 8 | 0.103 · 0.24 · 5 |
| 막기 | 0.070 · 0.14 · 4 | 0.050 · 0.12 · −4 |
| 마무리 일격 | 0.133 · 0.50 · 12 + 느린 화면 0.30초 × 0.25배 | 0.190 · 0.62 · 16 + 느린 화면 0.36초 × 0.25배 |

대체로 가깝지만 같지 않다. 재질별 멈춤 배율(돌 ×1.25 · 영체 ×0.7)은 소리 표에만 있고 화면에는 아직 반영되지 않는다. 하나로 합치려면 프리셋의 `feel(...)` 호출이 `hitFeel(...)` 을 읽게 바꾼다(다음 단계).

### 11.4 char3d

- 번쩍임: `Char3D.draw(place, { flash: hurtFlash(sim.time − 맞은 시각) })` (B 의 적은 `e.flashT` 가 0.13 에서 줄어든다 → `hurtFlash(0.13 − e.flashT)`).
- 분해 · 빛: `FX_DISSOLVE_GLSL` · `FX_LIGHT_GLSL` 을 char3d 조각 셰이더에 붙일 때 `#define TEX texture2D`, 유니폼 `uFxNoise`(텍스처 단위는 char3d 가 안 쓰는 번호) · `uFxDis` · `uFxLP` · `uFxLC` 를 `UNI` 목록에 더한다. 아직 아무도 붙여 보지 않았다(시험 화면의 인형 셰이더에서만 확인).

## 12. 검수 (fxverify, 2026-11-17 15:10–15:55 UTC)

판정: **고쳐서 통과(PASS-WITH-FIXES)**. 헤드리스 Chromium + SwiftShader 에서 본 것이다 — 프레임 시간은 기기 값이 아니다.

다시 돌려 확인한 것:

- `node tools/v2/fx_check.mjs`: 두 화면(fold_open 1000×756 · phone2 740×360) 부팅, 프리셋 32개, 시범 둘, 단계 바꾸기, 후처리 끔/켬, 정리 — 페이지 오류 0 · GL 오류 0. 난전 숫자는 보고와 같은 범위다(그리기 호출 최대 9 / 12 / 12; 살아 있는 입자 최대는 무작위라 돌릴 때마다 조금 달라 130–135 / 200–218 / 296–303; 덧칠 최대 1.3 / 1.4–1.5 / 1.6 화면). 검수 끝에 고친 트리로 전체 검사를 다시 돌려 통과했고(15:27 UTC), §8 의 숫자 칸은 그 측정이다.
- **가장 낮은 단계는 정말 싸다**: low 는 후처리 패스 0 · 후처리 버퍼 0바이트(버퍼를 실제로 지운다) · 효과 GPU 메모리 3.3 MB. `setPost(false)` 도 mid · high 에서 패스 0 · 버퍼 0 이 되고 화면 밝기는 그대로다(평균 밝기 70–73 → 70).
- **GL 컨텍스트 잃기 · 되찾기**(`WEBGL_lose_context`): 잃은 동안 update · play · draw · post · dispose 가 예외 없이 지나가고, 되찾은 뒤 `createFx` 로 다시 만들면 정상으로 그린다(GL 오류 0). 잃은 동안 만든 객체는 죽어 있다(§3.1 에 적음).
- **누수 없음**: 난전 90초를 두 번(입자 11만 4천 개) 돌린 뒤 gc 하고 남은 힙 증가 +1.9 KB · +3.8 KB.
- 상한: 번쩍임 최대 0.39(마무리 + 궁극기를 60프레임 연속으로 겹쳐도 0.7 아래), 이상한 입력(빈 객체 · NaN · 없는 이름 · dt 0 · dt 5초)에 예외 없음.
- 그림(계열마다 본 것): 타격 7종은 모양과 색이 서로 다르다(가는 선 / 굵은 선 + 고리 / 둥근 충격 / 긴 관통선 + 푸른 고리 / 금빛 고리 / 푸른 방패 / 큰 섬광 + 균열). 마법은 바닥 예고 문양 · 원근이 맞는 기둥 · 종 메시 덕에 화면에 붙인 그림이 아니라 장면 안의 입체로 읽힌다. 인물을 가리는 것은 마무리 일격의 0.3초와 궁극기 마무리뿐이다(§9-12 에 이미 적혀 있다).

고친 것:

1. **궁극기 도중에 품질 단계를 바꾸면 화면이 영영 40 % 어두웠다**(`setTier` 가 시퀀스는 지우고 '장면 어둡게'는 그대로 뒀다) → `setTier` 가 같이 푼다. 폴드에서 자동 품질 조절이 단계를 바꿀 때 밟을 수 있던 결함이다.
2. **소리 사건 이름이 소리 표와 맞지 않았다**(53개 가운데 3개만 같음) → 다리 `src/v2/feel/fxbridge.js` + 검사 `tools/v2/fx_sound_link.mjs` (§11.2).
3. **글꼴 검사 실패**(`build_fonts.py --check`): 셰이더 문자열 안의 한글 주석 12줄을 영어로(`post.js` · `engine.js` · `feel.js`). 이제 통과한다 → `build_web.mjs` 에 `--allow-font-gaps` 가 필요 없다.
4. **할당 검사가 붙었다 떨어졌다 했다**: 같은 트리에서 다시 돌리니 정상 상태 값이 120바이트/프레임으로 나와 검사가 실패했다(보고의 12–20바이트도 같은 현상). 같은 페이지에서 되풀이해 재면 15.8 → 0.04 → 0.05 → 0.01 바이트/프레임으로 가라앉는다 — 남던 것은 엔진의 할당이 아니라 V8 이 최적화를 끝내기 전의 숫자 상자였다. `fx_check.mjs` 가 네 번까지 다시 재고 문턱을 2바이트/프레임으로 낮췄다.

보고가 실제와 달랐던 것(문서를 고침):

- "정상 상태에 12–20바이트가 남고 어디서 생기는지 못 찾았다" → 데워진 뒤에는 **0**(4,800프레임에 52바이트). 반대로 **새 효과를 낼 때**는 보고의 61바이트/프레임보다 많이 나왔다: 127 · 210바이트/프레임(1,200 · 4,800프레임).
- "입자 300개 이하" → high 단계에서 303개까지 봤다(풀 상한 4,096 에는 한참 못 미친다).
- "소리 담당은 이름 → 소리 표만 만들면 된다" → 그 표는 없었다(위 2).

남은 위험(고치지 않음): 폴드 실기에서 한 번도 돌리지 않았다(채움 비용 · 후처리 비용은 기기에서만 안다) · 게임에 꽂혀 있지 않다 · 진짜 캐릭터 위에서 본 적이 없다 · §9 의 14–17.

검수 도구: `node tools/v2/fx_verify.mjs [state|tiers|ctx|alloc|bridge]`, `node tools/v2/fx_sound_link.mjs`, `node tools/v2/fx_owner.mjs [sheet|video]`(소유자용 한 장 · 영상).

## 13. FIRE-2 (2026-11-18 16:10–17:10 UTC): flame flipbook, layered anchor fire, living candles

Owner, on the fire of `eshville_now`: "불은 딱 봐도 허접하지?". The particle fire of SPEED-FIRE drew every tongue as one teardrop sprite: a wide wall-top fire read as a row of separate droplets. Numbers below: headless Chromium + SwiftShader, fold_open — counts and areas only, not frame times.

### 13.1 The flipbook (`src/v2/fx/flamebook.js`, painted in code — no generated image, 0 credits)

- `paintFlame(kind, i, out)` writes one 128 x 256 frame (straight RGBA): kind 0 **FLAME**, 16 frames, a loop (a tuft wide at its rounded foot, licking and tearing at the top; three octaves of tileable noise climb 2 and 3 whole periods per loop, so frame 15 runs into frame 0), kind 1 **WISP**, 8 frames played once over a particle's life (a detached tongue that bends, thins and breaks into pieces). RGB is a heat colour (deep red-orange rim -> orange -> yellow -> pale yellow-white core, cooler towards the tips), A the density with soft edges on all four sides. Pure pixels, no canvas calls: `node tools/v2/fire2_sheet.mjs` writes the sheet as a PNG (no browser). Painting all 24 frames: about 55 ms warm, 160 ms the first time (node), once when the effect engine is made.
- **The particle atlas is 1024 x 1024 now** (`sprites.js makeParticleAtlas`): its top-left quarter is the old 512 x 512 sheet (16 cells of 128 px, untouched), the lower half holds the 16 FLAME frames (8 x 2), the top-right quarter the 8 WISP frames (4 x 2). GPU memory of the atlas with mips 1.40 -> 5.59 MB (+4.2 MB, `fx.gpuBytes` counts it).

### 13.2 Engine pieces changed on purpose (shared with the hit and magic effects)

- `SPR.FIRE` (16) and `SPR.WISP` (17): `E({ sprite: SPR.FIRE, aspect: 1.5, fps: [11, 15] })`. For these the particle vertex shader builds an **upright quad standing on the particle** (foot at its position, `aspect` = height / width, carried in the stretch slot), picks the frame by age (FIRE: first frame and mirroring from the particle's random angle, then `fps` frames per second, looping; WISP: the 8 frames over the life) and **shears the quad with the wind** (a slow gust all flames share + each flame's own sway, more at the top). No per-frame CPU work, no new uniform, no new draw call; the fragment shader is the same one texture read.
- The 16 old sprites read exactly the same texels (cell scale 0.25 of 512 px -> 0.125 of 1024 px). The fragment shader's texture coordinate is `highp` now (a 16-bit mediump coordinate would step by half a texel in the far half of a 1024 px atlas on some phones; no difference on desktop).
- `amb: 1` on a spec (ambient: anchor fires, candles): its particles **do not count in the fill governor** (§7-2) — a fight next to a blaze keeps its hit effects at full strength (the old fire did count, with about 0.1 screen per big fire). `fx.particles.measure()` also returns `ambN` / `ambArea`, and counts a flipbook quad with its real height.
- Proof that hits and magic are unchanged: `node tools/v2/fire2_shot.mjs --presets 1` (effects test page, seeded `Math.random`, mid tier) with and without `--before 5faee16` (the APK 9 tree): the captures of `hit.slash.heavy`, `hit.finisher`, `fire.pillar`, `ice.nova`, `enemy.breath` are **byte-identical** (0 differing pixels) and the cost line of all 33 presets (emitted, peak live particles, peak draw calls, peak overdraw) is identical.

### 13.3 The anchor fire (`src/v2/game/anchors.js`)

| layer | sprite | what it does | live per fire, planned (crypt bowl ... roof blaze, high tier) |
|---|---|---|---|
| BODY | FIRE flipbook, 66k x 100k, semi-additive (0.66) | tufts standing on the burning thing along its whole width, overlapping by more than half: one continuous sheet | 3 ... 13 |
| CORE | FIRE flipbook, small, nearly white, short | the hot foot | 2 ... 8.5 |
| TONGUE | WISP flipbook | detached tongues that rise, speed up and break apart | 1.6 ... 6.5 |
| HEAT | soft glow | warm haze over the foot (on the wall behind) | 1.2 ... 2.4 |
| SPARK / EMBER | ember sprite (streaks / slow dots) | shoot up, lean with the wind, die | 7 ... 44 |
| SMOKE | smoke sprite, alpha | dark puffs above the tongues, lit warm at birth | 3 ... 7 |

- k = the fire's scale from the anchor's size: bowl 0.7 (brazier) – 0.82 (crypt door bowl), house fire 1.0 – 1.12, blaze 1.3 – 1.62 (roof, wall top, wreck). The width (`w`, from `flameSpots`) sets how many body quads burn side by side.
- **Emission on a beat**: an accumulator per layer and fire, one quad per whole count, placed by a golden-ratio walk along the width. The number of live quads is steady (a small bowl no longer flickers unevenly) and the big overlapping quads are exactly as many as planned. Tier: flame layers x 0.62 / 0.85 / 1, soft layers (heat, sparks, embers, smoke) x 0.4 / 0.75 / 1 and x the fill governor. Far (> 1200 from where the camera looks) x 0.55; off screen or beyond 2100: nothing is emitted. Nothing is allocated in `tick` (typed arrays made in `build`).
- A fire whose stage part gives a cold (blue) light — the door bowls of `ossuary_now` — burns with a blue-white heart and a paler body (other vertex colours on the same sheet) and lights the characters with that colour.
- Candles: `candleSpots(parts)` (`env/props2.js`) lists the wicks of every `candles` group; one small flipbook flame per wick (two quads alive, a new one every 0.65 s, cross-fading) and a soft halo per group, within 1300 of the camera's target and on screen.

### 13.4 Numbers (the worst of eight looks per spot; live particles / of them fire / fire overdraw = quad area of the fire ÷ the 960 x 726 screen)

| spot | low | mid | high |
|---|---|---|---|
| outskirts: roof + wall-top + ruin + wreck + door fire in one view (`esh_roof`) | 106 / 99 / 0.82 | 164 / 150 / 1.17 | 229 / 209 / 1.59 |
| main street brazier | 44 / 44 / 0.13 | 72 / 72 / 0.20 | 82 / 82 / 0.25 |
| 1697 ossuary door: two bowls + the candle groups in view | 195 / 191 / 0.18 | 204 / 199 / 0.22 | 216 / 210 / 0.26 |
| ossuary tonight: two bowls + one candle group (the rest is mist) | 42 / 33 / 0.10 | 51 / 36 / 0.10 | 63 / 46 / 0.15 |

- Mid tier, one look, the other spots: burning wreck 184 live / 1.24 screens, bell tower brazier 73 / 0.18, 1697 brazier 69 / 0.19, test slice brazier 58 / 0.17. Before (APK 9): `esh_roof` 127 live / 0.24 screens for all effects, brazier 30 / 0.02.
- **Draw calls: no change.** The fire is in the one particle batch (1 draw; 2 when its ring buffer wraps). Frame totals at mid before = after: 15, 15, 28, 17, 17, 21, 29, 24 for the eight spots.
- The particle ring holds everything emitted within the longest life (smoke 2.6 s, mist 7 s): 300–770 instances at these spots (low tier cap 1,024).

### 13.5 Weak (honest)

- The flipbook is procedural: clean, but without the character of painted flames. Smoke is nearly invisible against the night sky (it shows in front of lit walls). The big blaze is tall (tongues reach about three hero heights over the wall); the size was judged in headless captures only.
- The pale fire of `ossuary_now` keeps an orange fringe (vertex colours can only multiply the sheet's heat colours); the mist there holds the brightness governor at 0.6–0.7, which dims that fire too (as before).
- Candelabra, chandeliers and the altar are generated models with their flames modelled in; only the floor candle groups (`candles`) have living flames. No soft-particle depth fade: a flame quad that meets geometry is cut straight.
- Frame time and fill cost on the Fold were not measured (a big blaze view covers 0.8 / 1.2 / 1.6 screens of blended quads at low / mid / high).

Tools: `node tools/v2/fire2_shot.mjs` (spots, `--before <commit>`, `--stats 1`, `--strip <spot>`, `--presets 1`), `node tools/v2/fire2_sheet.mjs` (the sheet as PNG), `node tools/v2/fire2_owner.mjs` (owner sheet).

## 14. CROSSING (2026-11-18 19:52–21:50 UTC): the bell crossing as a staged moment

- Code: `src/v2/game/crossing.js` (three programs of its own, built with `program()` of the engine; `post.js` and `index.js` of the effects are unchanged). Hit, magic and fire presets are untouched: `presets.js` only gained one block at its end.
- The ring and the reveal are one full-screen pass over a copy of the frame (colour + a DEPTH_COMPONENT24 texture; with the post pass on, the composite goes into the copy and the depth is blitted next to it). The world position of every pixel comes from its depth (eye, right / up / forward and the two depth constants as uniforms); `d = distance(P, bell)`. The line is a few pixels wide on any surface (`fwidth(d)`), two fainter rings follow 2.3 m and 4.6 m behind, light is added with `c += min(add, 1.1) * (1 - 0.5 c)` so a wall never turns flat white. Sky pixels (depth 1) take a distance from the bell's place on the screen and are reached last.
- The passage: a quarter-size time field (two RGBA8 targets: drain / shadow / radial push / erosion, and the light to add) drawn every frame, then one full-size pass with three texture reads. The grade target is the fog colour of the night ahead (`uTo`, `uFog`), not a fixed warm / cold pair: Eshville tonight is red, its 1697 is blue. Low tier (`#define LOW`): no cloud streaks, rain, dust or grain.
- New presets (group holy, no sound and no screen feel of their own): `cross.gather` · `cross.ring` · `cross.lift` · `cross.dull` · `cross.open` · `cross.spark` · `cross.arrive` · `cross.glow`. `dx > 0` = towards tonight (cold light), `< 0` = towards 1697 (warm); `pow` = height of the bell above its foot / 100.
- Honest: the frame copy has no multisampling, so edges are rougher during the ring (0.5 s) and the reveal (0.9 s). Nothing was seen on a phone. On the software GPU of the test machine one passage frame costs 25-45 ms at render size 0.5.

