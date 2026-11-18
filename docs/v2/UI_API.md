# UI_API — 3D 판 인터페이스 「세공한 유리」 규약 (UI 구역)

2026-11-17 · 코드 `src/v2/ui/`, 그림 `assets/v2/ui/gem/`, 시험 페이지 `tools/v2/ui_view.html`, 검사 `node tools/v2/ui_check.mjs [--live v2g]`, 캡처 `node tools/v2/ui_shot.mjs`, 아이콘 묶음 다시 만들기 `python3 tools/v2/ui_atlas.py`.
다른 구역은 **이 문서만 보고** 맞춘다. 바꾸면 "바뀐 것"에 한 줄.

## 바뀐 것
- 11-18 15:36 (INTEGRATE-VERIFY) `hud.release()` 가 첫 배치 전에 불려도(장면을 불러오는 중에 나갈 때) `#v2pad` 층과 캔버스 9개가 페이지에 남지 않는다: 패드의 `release()` 는 `releaseAll()` 이 던져도 층을 떼고, HUD 의 `release()` 는 조각마다 따로 감싸 부른다.
- 11-18 13:40 (INTEGRATE-B2) **목표 한 줄** `state.objective`(문자열, 없거나 `''` 이면 그리지 않는다): 울림 눈금 아래에 금빛 작은 글씨와 마름모 표시로 그린다(`hud.js` `bakeObjective` — 글이 바뀔 때만 다시 굽는다, 화면 너비의 46% 를 넘으면 줄이고 자른다). 알림 줄은 그만큼 아래로 내려간다. 기본 HUD(`src/v2/game/hud.js`)도 구역 이름 아래에 같은 줄을 그린다. 이야기의 `objective` 단계가 채운다(ENGINE_API §12).
- 11-18 03:05 (INTEGRATE-B1) 보스 막대: `state.boss.phase`(1｜2)를 주면 막대 오른쪽에 작은 마름모 둘을 그리고 지금 막까지 금빛으로 켠다(없으면 그리지 않는다). 장면이 주는 `boss` = `{ id, name, hp, hpMax, sub, stagger, phase, kneel, fled, staggered }`(규칙의 `sim.bossState()` 그대로; `sub` 는 예고 중인 공격 이름 · 무릎 꿇으면 「종을 길게 울려라」). 기본 HUD(`src/v2/game/hud.js`, v2ui=0)에도 같은 값으로 이름 · 막대 · 눈금 · 막 표시를 그린다.
- 11-18 02:10 (INTEGRATE-A 이어 하기) `pad.js`: 단추를 눌렀다 뗀 사이에 게임 틱이 한 번도 돌지 않았으면(프레임이 길게 끊긴 순간의 짧은 누름) 그 누름을 다음 틱에 한 번 전한다(`input.touch.tap`) — 전에는 34 ms 보다 짧은 누름만 그렇게 했다. 바쁜 검사 기계에서 220 ms 누름이 통째로 사라져 `game_check` 의 공격 단추 단계가 실패했다.
- 11-18 01:45 (INTEGRATE-A 이어 하기) `pad.metrics()` 가 터치 단추가 놓이기 전(키보드만 쓰는 화면 — 배치 `L` 이 아직 없다)에 불려도 죽지 않는다(`labelRect` 계산이 `S.L.labelPx` 를 그대로 읽어 `scene.hud.metrics()` 전체가 예외를 냈다 — `tools/v2/p0_entry_check.mjs` 의 키보드 단계가 그렇게 실패했다).
- 11-18 00:50 (INTEGRATE-A · 장면 쪽에서 붙이며 고친 작은 것) ① 이 인터페이스가 이제 `v2g` 의 **기본값**이다(`src/v2/game/seams.js` `UI_DEFAULT = true`; `?v2ui=0` · `localStorage['bn.v2.ui'] = '0'` 이면 내장 HUD + v1 패드). ② `createHud(game, opts)` 에 **`opts.onDisabledPress(id)`**: 못 쓰는(`disabled`) 단추를 누르면 동작은 보내지 않되 이 함수를 부른다 — 장면이 「아직 쓸 수 없다」는 알림을 띄운다(`pad.js`). ③ **`hud.openPause({ extra: [{ icon, label, onPick }] })`**: 「설정」과 「나가기」 사이에 줄을 두 개까지 더한다(장면은 「옛 단추로 바꾸기」 한 줄을 넣는다). `extra` 가 없으면 예전과 같은 세 줄이다. `hud.metrics().pause.ids` = 줄 이름(`resume settings extra leave`)(`dialog.js`). ④ 터치의 멈춤 단추는 장면이 준 `opts.onPause` 를 부른다(장면이 같은 줄 차림으로 연다). 실제 장면 검사는 `?scene=v2g&v2ui=1&area=slice0&v2auto=0` 로 연다(`tools/v2/ui_verify.mjs`), `ui_view.html?live=v2g` 는 장면의 인터페이스를 끄고(`v2ui=0`) 이 페이지가 모듈을 꽂는다.
- 23:10 (검증 구역) 긴 글 맞추기: 보스 이름 · 지역 이름 띠 · 물건 알림 · 구역 이름 · 대화 이름표 · 갈래 글은 자리에 맞게 줄이고, 그래도 넘치면 끝을 `..` 로 자른다(`draw.js` 의 `fitText`). 아래 단추 안내 줄은 스틱과 단추 사이 너비를 넘으면 작게 그린다. 단추 층의 감시 시계는 흐른 시간이 아니라 "HUD 가 불리지 않은 타이머 횟수(4번 = 1초)"로 센다 — 긴 프레임 한 번에 누르고 있던 스틱 · 단추가 풀리던 문제를 고쳤다. 아이콘 묶음을 받지 못했으면 다음 `createHud` 가 다시 받는다. 실제 장면 검사: `node tools/v2/ui_verify.mjs`(주소 `?scene=v2g&v2ui=1`), 붙이는 정확한 고침: `/tmp/claude-0/v2/uiverify/adopt.patch.md`.
- 22:04 첫 판 (이름·모양을 먼저 정함. 구현 상태는 §9).
- 22:45 터치에서 단추 안내 알약을 누를 수 있다(§1 `prompts`). 왼손잡이 배치. 물건 알림 기본 아이콘(주머니). v1 모듈을 import 하지 않는다(§8).
- 22:35 구현 끝. 바뀐 것: CSS 파일을 쓰지 않는다(단추는 단추마다 작은 캔버스 — `css/v2ui.css` 없음). 촛불이 9자루부터는 두 단(제단)으로 선다. 보스 막대 너비는 촛불 줄을 피해 줄어든다. 밤 알림(「오늘 밤이 달라졌다」)이 떠 있는 동안에는 지역·구역 이름 띠가 덮지 않는다. `hud.metrics()`(검사용 자리 값) 추가. §9 에 구현 상태 · 잰 값 · 장면이 할 일.

## 0. 한눈에

```js
import { createHud } from '../ui/index.js';        // ENGINE: seams.js 의 UI_LOADER = () => import('../ui/index.js')
const hud = createHud(game, opts);                 // 장면에 들어올 때 한 번
hud.update(dt, state);                             // 틱마다 (60 Hz)
hud.draw(ctx, state);                              // 그릴 때마다. ctx = 논리 좌표(state.viewW × state.viewH) 2D 컨텍스트, 바탕은 지우지 않는다
hud.resize();                                      // 화면 크기 · 설정(글자 크기 · 안전 영역)이 바뀌면 (창 resize 는 스스로 듣는다)
hud.release();                                     // 장면을 떠날 때 (= hud.dispose(), 둘 다 있다): DOM · 리스너 · 터치 입력을 모두 치운다
```

- `hud.hidePad === true` — 장면은 v1 가상 패드를 숨긴다(`scene.showPad = false; scene.hidePad = true`). **v1 패드 코드(`src/core/touchpad.js`)는 고치지 않았다.** v2 단추는 UI 모듈이 만든 DOM 층(`#v2pad`)이고 v1 입력 API(`input.touch.set / axis`)로 동작을 보낸다(§3).
- 그리는 곳은 둘뿐이다: ① 게임 캔버스(`hud.draw` — 촛불 · 눈금 · 표식 · 숫자 · 알림 · 대화 창 · 일시정지), ② DOM 단추 층(`#v2pad` — 터치일 때만 보인다, 상태가 바뀔 때만 다시 칠한다). **실시간 흐림(backdrop-filter) 없음, 프레임마다 새 객체 없음.**
- `opts`(모두 선택): `{ pad: true, rollGuard: 'both', assetBase: 'assets/v2/ui/gem/', portraitBase: 'assets/v2/portraits/', mount: document.getElementById('app'), onPause: null, labels: { now, past, nightChanged, clear, dead }, keyLabel(action, mode), input, loadBrush, forceShow, forceMode, mouse }` — 뒤의 다섯은 시험 페이지용.

## 1. `HudState` — `hud.update` / `hud.draw` 가 읽는 것

ENGINE_API §4 의 `state` 를 그대로 받는다. 아래에서 **굵은 칸은 ENGINE 이 이미 주는 것**, 나머지는 새로 바라는 칸이고 **없으면 괄호 안 기본값**으로 그린다(없어도 오류 없음).

| 칸 | 뜻 |
|---|---|
| **`viewW, viewH, safe{l,t,r,b}, scale`** | 논리 화면 · 안전 영역(논리 px) · 논리 px 당 기기 px |
| **`time`** | 지역에서 흐른 초 |
| **`hero`** `{hp, dead, lock, lockT, guard, parryOk, hurtT, flash …}` · **`heroHpMax`** | 영웅. `hero.lock` = 락온한 적 id |
| `candles` `{lit, max}` | 촛불(체력, GDD §8). 없으면 `max = candleMax ?? 5`, `lit = hp / heroHpMax × max`(소수 = 마지막 촛불의 불꽃 크기). `max` 는 3–16 |
| `resonance` `{value, cells}` | 울림 눈금. `cells` 3–5(기본 3), `value` 0–cells(소수 = 차오르는 칸). 없으면 빈 3칸 |
| `night` `'now'｜'past'` | 밤 표시(오늘 밤 / 그 밤). 없으면 `area.era`, 그것도 없으면 `'now'` |
| `moon` `{phase}` | 달의 칸. `phase` 0–1 (0 = 초승, 1 = 보름). 없으면 그리지 않는다 |
| **`area{id, name}`** · **`section{id, label}`** · `left` | 지역 · 구역 이름. `area.id` 가 바뀌면 지역 이름 띠, `section.id` 가 바뀌면 구역 이름 띠가 저절로 뜬다. 구역 이름은 눈금 옆에 작게 늘 보인다. `left` > 0 이면 「· 남은 적 N」을 붙인다(없으면 `section.id === 'yard'` 일 때 `yardLeft`) |
| **`enemies[]`** `{id, x, y, z, h, hp, hpMax, dead, state}` | 적. 락온 표식 · 작은 체력 막대에 쓴다 |
| `boss` `{name, hp, hpMax, sub?, stagger?}` ｜ `null` | 보스 이름 + 막대(위 가운데). `stagger` 0–1 = 무릎 꿇음 눈금(선택) |
| **`numbers[]`** `{x, y, z, str, color, t, on, big}` | 피해 숫자 풀(ENGINE). `big` = 크게. 붓글씨로 그린다 |
| **`project(x, y, z, out)`** | 세계 점 → 논리 화면 `{x, y, w}` (w ≤ 1 = 화면 뒤) |
| `prompts[]` `{action, label, x?, y?, z?, icon?, onTap?}` | 단추 안내(최대 8개). 세계 좌표가 있으면 그 자리 위에, 없으면 아래 가운데 줄에. 키보드 · 패드는 키 이름 알약, 터치는 그 동작의 아이콘(`icon` 으로 바꿀 수 있다). **터치에서는 알약을 누르면 그 동작이 한 스텝 눌린다**(`input.touch.tap(action)`, 누르는 자리는 44 CSS px 이상 — 다섯 단추에 없는 「살핀다 · 말 건다」를 이렇게 누른다). `action` 은 `ACTIONS` 에 있는 이름이어야 한다(살피기는 `confirm` 을 권한다). `onTap(p)` 을 주면 그것을 대신 부른다 |
| `pad` `{skill:{mode:'hook'｜'call', cd, disabled}, bell:{mode:'short'｜'long', charge, disabled}, roll:{cd, disabled}, attack:{disabled}, jump:{disabled}, lock:{disabled}}` | 단추 상태. `cd` 0–1 = 남은 쉼(1 = 방금 씀), `charge` 0–1 = 길게 누르는 중 차오름, `mode` = 아이콘 바꿈. 없으면 모두 보통 |
| **`done, doneT`** · `doneTitle, doneSub` · **`loading, message, message2`** | 지역 끝(띠 「시범 구간 끝」 + 「공격 단추를 누르면 처음부터 다시 시작합니다」 — `doneTitle` · `doneSub` 로 바꾼다) · 불러오는 중 · 오류 글 (내장 HUD 와 같은 뜻). 영웅이 쓰러지면 「촛불이 꺼졌다」 |
| **`dialog`** | 대화(§4 의 모양). `hud.showDialog()` 대신 상태로 넘겨도 된다 |
| **`debug`** · `debugLine()` | 개발 줄 (`?v2dbg=1`) |

`state` 는 장면이 다시 쓰는 객체이므로 HUD 는 붙들지 않는다. HUD 가 `state` 에 쓰는 것은 없다.

## 2. 여는 함수 (사건으로 부르는 것)

| 함수 | 하는 일 |
|---|---|
| `hud.banner(kind, title, sub?)` | 큰 알림 띠. `kind`: `'area'`(지역 이름) · `'section'` · `'night'`(「오늘 밤이 달라졌다」— title 을 안 주면 이 글) · `'clear'` · `'dead'` |
| `hud.toast(text, opts?)` | 작은 알림(물건 주움 등). `opts {icon: 그림 URL ｜ 아이콘 id, kind: 'item'｜'info'｜'warn', time: 2.6}`. 최대 3개가 쌓인다(왼쪽, 상태 묶음 아래). 아이콘을 안 주면 item = 주머니 · info = 종 · warn = 꺼진 촛불. 아이콘 id 는 `src/v2/ui/atlas_map.js` 의 이름 |
| `hud.callout(x, y, z, text, kind?)` | 세계 자리의 짧은 붓글씨(「튕겨냄」 등). `kind`: `'parry'｜'guard'｜'break'｜'info'` |
| `hud.number(x, y, z, str, opts?)` | (선택) HUD 가 가진 숫자 풀에 넣는다 — ENGINE 의 `state.numbers` 를 쓰면 부르지 않아도 된다 |
| `hud.showDialog(d)` / `hud.advanceDialog()` / `hud.closeDialog()` | 대화 창 (§4). `hud.dialogOpen` |
| `hud.openPause(opts?)` / `hud.closePause()` | 일시정지 (§5). `hud.pauseOpen` |
| `hud.modal` | `'pause'｜'dialog'｜null` — **장면은 `'pause'` 면 `sim.update` 를 건너뛰고, `'dialog'` 면 영웅 입력을 잠근다** |
| `hud.setPad(partial)` | `state.pad` 와 같은 모양을 사건으로 넘길 때 |
| `hud.ready` | 그림(아틀라스)이 다 왔나. 오기 전에는 코드로 그린 자리 채우기 아이콘 |
| `hud.stats()` | `{drawMs{avg,p95,max,n}, updMs, padRepaints, atlas, sprites}` — 비용 계측 |

## 3. 터치 단추 → 입력 동작

왼쪽: 떠 있는 스틱(화면 왼쪽 45 %, 위 64 px 아래 아무 곳). `input.touch.axis(x, y)` 로 360° 값을 보낸다 → 장면은 지금처럼 `input.touchStick ?? input._touchVec` 을 읽는다. 방향 동작(`left/right/up/down`)도 함께 보낸다(메뉴 · 대화 선택용).

| 단추 (이름표) | 크기 (폴드 / 휴대폰 CSS px) | 입력 동작 | 비고 |
|---|---|---|---|
| 공격 `공격` | 92 / 74 | `attack` | 누른 동안 눌림(길게 = 휘감기는 PLAY 가 `attackHeld` 로) |
| 점프 `점프` | 66 / 54 | `jump` | |
| 구르기/막기 `구르기` | 66 / 54 | `dash` **와** `guard` 를 함께 | PLAY 의 `Sim` 이 가른다(움직이며 누름 = 구르기, 제자리에서 누르고 있음 = 막기). `opts.rollGuard: 'split'` 이면 패드가 가른다(스틱이 기울었으면 `dash`, 아니면 `guard`) |
| 솜씨 `솜씨` | 62 / 50 | `skill1` | v1 에 있는 이름. 길게 누르기(사냥꾼 고르기)는 장면이 `input.down('skill1')` 시간으로 |
| 종 `종` | 62 / 50 | `ult` | v1 에 있는 이름을 빌려 쓴다. 짧게 = 메아리, 길게 = 건넘/조종 — 장면이 누른 시간을 잰다. `state.pad.bell.charge` 를 주면 테가 차오른다 |
| 다음 적 `다음 적` | 46 / 44 | `lock` | 공격 위 |
| 멈춤 `멈춤` | 46 / 44 | (`menu` 를 보내지 않는다) → `hud.openPause()` | 오른쪽 위. `opts.onPause` 를 주면 그것을 대신 부른다 |

- 새 입력 이름은 만들지 않았다(`src/data/controls.js` 의 `ACTIONS` 에 있는 것만 `input.touch.set` 이 받는다): **솜씨 = `skill1`, 종 = `ult`**.
- 누르는 반경 = 보이는 반지름 + 8 px, 겹치면 가장 가까운 단추. 손가락을 밀어 다른 단추로 옮기면 그 단추가 눌린다. 단추 위의 터치는 캔버스 탭으로 가지 않는다.
- 상태: 눌림(안쪽 빛 + 0.94배) · 누르고 있음(테가 밝다) · 쉼(`cd` — 어두운 부채꼴이 걷힌다) · 못 씀(`disabled` — 흐리게, 눌러도 동작을 보내지 않는다) · 차오름(`charge` — 종 테의 금빛 호).
- 키보드 · 게임패드로 입력이 바뀌면 단추 층은 사라지고(0.25초), `state.prompts` 는 키 이름으로 그려진다. 터치하면 바로 돌아온다.
- 대화 · 일시정지가 열리면 단추 층은 숨고 터치 입력을 모두 뗀다.

## 4. 대화 창

```js
hud.showDialog({
  speaker: '엘리제',                 // 이름 (없으면 이름표 없음 = 해설)
  portrait: 'elise',                 // assets/v2/portraits/<id>.webp (없으면 초상 없음). 'elise__joy' 처럼 표정 파일 이름 그대로
  side: 'left',                      // 초상 자리 'left'｜'right' (기본 left)
  text: '종이 울리면, 그 밤으로 건너가요.',   // '\n' 으로 줄 나눔. 넘치면 저절로 줄바꿈, 4줄을 넘으면 다음 쪽으로 나눈다
  choices: ['건넌다', '아직'],        // 있으면 두 갈래 고르기 (2개까지)
  onDone() {},                       // 마지막 쪽에서 넘기면 (choices 가 없을 때)
  onChoice(i) {},                    // 고르면 (0｜1)
  auto: false,                       // true 면 누르지 않아도 넘어간다(컷 장면)
});
```

- 글자는 초당 약 38자로 나타난다. 누르면 ① 다 나타나게 → ② 다음 쪽 → ③ 끝(`onDone`). 넘기기: 화면 아무 곳 터치 · `confirm` · `attack` · `jump`. 고르기: 갈래를 누르거나 `left/right`(`up/down`) + `confirm`.
- 상태로 넘기는 길: `state.dialog = {…같은 모양…}` (객체가 바뀌면 새 대사로 본다). `null` 이면 닫는다.
- 열려 있는 동안 `hud.modal === 'dialog'`.

## 5. 일시정지

`hud.openPause({ onResume, onSettings, onLeave, title })` — 「이어 하기 · 설정 · 나가기」 세 줄. 터치로 누르거나 `up/down` + `confirm`, `cancel`/`menu` = 이어 하기. 줄을 고르면 닫고 그 함수를 부른다(없으면 `settings` → `game.push('options')` 가 있으면 그것, `leave` → `game.go('v2pick')` 또는 `'title'`).
열려 있는 동안 `hud.modal === 'pause'` — **놀이를 멈추는 것은 장면의 일**이다(§2).

## 6. 화면 배치 (논리 px, 안전 영역 안)

```
┌──────────────────────────────────────────────────────────────┐
│ ◐밤  🕯🕯🕯🕯🕯            〔보스 이름 + 막대〕             [멈춤] │
│ 오늘 밤 ◇◇◇ ☾            〔구역 이름 띠 / 알림 띠〕               │
│                                                    〔물건 알림〕 │
│                      (싸움터 — 비운다)                          │
│                                                      [종][솜씨] │
│  (스틱: 왼쪽 45 %)        〔단추 안내〕           [구르기][다음 적] │
│   ◎                      〔대화 창: 아래 가운데〕     [점프][공격] │
└──────────────────────────────────────────────────────────────┘
```

글자 크기 설정(`settings.textSize` normal / large / xlarge)은 이름표 · 대화 · 알림 글자에 곱해진다(1 / 1.15 / 1.3, 휴대폰에서는 최소 CSS px 보장). 단추 크기는 `settings.touchScale` 을 따른다.

## 7. 비용 약속

- `hud.draw`: 미리 구운 조각을 `drawImage` 로 찍는다. 글자는 바뀔 때만 작은 캔버스에 다시 굽는다(이름 · 구역 · 대사 쪽). 그림자 · 흐림 필터를 프레임마다 쓰지 않는다. 객체 · 배열 · 문자열을 프레임마다 만들지 않는다(피해 숫자는 `str` 이 바뀔 때만 굽는 작은 풀).
- 단추 층: DOM(`transform` · `opacity` 만 움직인다). `backdrop-filter` · `filter` · 움직이는 `box-shadow` 없음. 쉼 부채꼴은 1/40 단위로만 다시 칠한다.
- 잰 값은 §9.

## 8. 실행 중에 받는 파일 (`tools/deploy/v2_ship.txt` 에 넣을 것)

- `assets/v2/ui/gem/atlas.webp` (285 KB, 1024×548, 조각 27개) — 아이콘 한 벌. **인터페이스가 받는 그림은 이것 하나다.** 조각 자리표는 코드에 들어 있다(`src/v2/ui/atlas_map.js`, 생성 파일). `atlas.json` 은 도구용이라 싣지 않아도 된다
- `assets/v2/portraits/<id>.webp` — 대화 창이 부를 때만(`alberto banshee_queen edmund edmund__smile elise elise__joy hadwin hadwin1 lotte marta rook sera sera__resolve`)
- 글꼴은 게임이 이미 싣는 것만: 본문 Noto Sans KR, 제목 Hahmlet, 숫자 · 짧은 외침 BN Brush(`assets/fonts/bn-brush.woff2` — `core/ui.js` 가 등록해 둔 글꼴을 `document.fonts.load` 로 처음 한 번 받는다. 받기 전에는 Hahmlet 으로 그려지고 도착하면 다시 굽는다). UI 모듈은 v1 모듈을 하나도 import 하지 않는다(`game.input` · `game.settings` · `game.canvasRect` · `game.safeCss` · `game.cssScale` 만 읽는다)
- CSS 파일 없음. 물건 알림에 그림 주소를 주면(`hud.toast(text, {icon: 'assets/icons/…webp'})`) 그 파일을 받는다 — 싣는 목록은 부르는 쪽 책임

## 9. 구현 상태 · 잰 값 · 장면이 할 일

### 파일

| 파일 | 내용 |
|---|---|
| `src/v2/ui/index.js` | `createHud` — 아래 조각을 묶고, 대화 · 일시정지 중의 탭을 받는다. `UI_ASSETS` |
| `src/v2/ui/pad.js` | 터치 단추 층(`#v2pad`): `padLayout(bounds, touchScale, textSize)`(순수 함수) · `BUTTONS` · 입력 연결 |
| `src/v2/ui/hud.js` | 캔버스 HUD: 밤 표시 · 촛불 · 울림 눈금 · 달 · 락온 고리 · 보스 막대 · 붓 숫자 · 외침 · 알림 띠 · 물건 알림 · 단추 안내 |
| `src/v2/ui/dialog.js` | 대화 창(쪽 나눔 · 글자 나타남 · 두 갈래) · 일시정지 판 |
| `src/v2/ui/draw.js` | 유리 판(`glassPanel`) · 둥근 유리 단추(`gem`) · 이름표(`plate`) · 글자 굽기(`bakeText`) · 아이콘 묶음 읽기 |
| `src/v2/ui/atlas_map.js` | 생성 파일(`tools/v2/ui_atlas.py`) — 손으로 고치지 않는다 |

### 장면(`src/v2/game/`)이 할 일 — 붙이는 순서

1. `src/v2/game/seams.js`: `export const UI_LOADER = () => import('../ui/index.js');` — 장면은 이미 `m.createHud(g)` 를 부르고 `hud.hidePad` 를 읽어 v1 패드를 숨긴다(지금 코드 그대로). `tools/v2/ui_view.html?live=v2g` 가 바로 이 연결을 장면 밖에서 해 보인다(검사 `--live v2g` 통과).
2. 화면 크기 · 설정이 바뀌면 `hud.resize()` (장면의 `resize()` 에서). 창 `resize` 는 단추 층이 스스로 듣지만 캔버스 조각은 `state.scale · viewW · viewH · settings.textSize` 가 바뀌는 것을 보고 다시 굽는다 — 부르지 않아도 다음 프레임에 맞춰진다.
3. `input.pressed('menu')` 에서 지금은 고르기 화면으로 나간다 → `if (!hud.modal) hud.openPause({ onLeave: () => g.go('v2pick') })` 로 바꾼다(터치의 멈춤 단추는 HUD 가 스스로 연다). `hud.modal === 'pause'` 일 때 규칙을 멈추는 것은 이미 들어 있다.
4. 채워 주면 좋은 상태 칸(없어도 돈다): `candles{lit,max}`(없으면 hp 비율 × 5자루) · `resonance{value,cells}` · `moon{phase}` · `boss{name,hp,hpMax,sub,stagger}` · `prompts[]` · `pad{skill{mode,cd,disabled}, bell{mode,charge}, roll{…}}`.
5. 사건: 튕겨냄 → `hud.callout(x, y, z, '튕겨냄', 'parry')`, 막음 → `'guard'`, 밤을 건넌 뒤 → `hud.banner('night')`, 물건 → `hud.toast('은종 조각 ×2', {kind: 'item'})`, 대사 → `hud.showDialog({...})` 또는 `scene.ui.dialog = {...}`.
6. 지역 정리 뒤 "공격 단추 · 화면 탭으로 다시 시작"(`input.pointer.tapped`)은 그대로 된다 — 단추 · 스틱 자리 밖의 탭만 캔버스로 간다.
7. `g.toast()`(v1 토스트)는 v1 글꼴 · 모양이다. v2 장면에서는 `hud.toast()` 를 쓴다(`hideToasts` 는 장면이 정한다).

### 잰 값 (2026-11-17, 헤드리스 Chromium — GPU 없음. 기기 값이 아니다)

- `node tools/v2/ui_check.mjs --live v2g`: fold_open · phone2 × 글자 크기 3종 + 실제 장면 연결 = **3243개 통과 / 0 실패**(22:50, 왼손잡이 배치 · 안내 알약 누르기 · 안전 영역 흉내 · 실제 장면 연결 9개 포함), 페이지 오류 0. fold_cover · tablet 도 통과. fold_open_sq(아래 띠가 생기는 1.1 : 1 화면)는 시험 페이지가 띠 배치를 흉내 내지 않아 재지 못했다.
- 단추(CSS px, 폴드 / 휴대폰): 공격 92 / 74 · 점프 66 / 53 · 구르기 66 / 53 · 솜씨 62 / 50 · 종 62 / 50 · 다음 적 46 / 44 · 멈춤 46 / 44, 가장 좁은 틈 13.6 / 10.7. 스틱 자리(왼쪽 45 %)와 겹침 없음, 안전 영역(여백 44 · 0 · 34 · 21 흉내) 밖 0.
- 유리가 가리는 정도(흰 바탕 · 검은 바탕 두 장의 차, 2차 시안 검토와 같은 방법): 단추의 가장 맑은 1/4 지점 **29–41 %**(2차 「세공한 유리」 61 %, 더 맑은 판 51 %), 스틱 10 %. 화면에서 조금이라도 덮는 넓이 7.1 %(폴드) / 14.0 %(휴대폰), 절반 넘게 가리는 넓이 3.1 % / 6.3 %.
- 그리기 비용: `hud.update + hud.draw` 의 스크립트 시간 0.05–0.12 ms/프레임(보스 화면, 숫자 · 외침 · 알림이 떠 있는 상태). 프레임마다 1픽셀을 읽어 래스터를 강제하면 2.6–3.1 ms(폴드 2000×1512 소프트웨어 래스터) · 1.5–1.8 ms(휴대폰 1480×720) — 캔버스 지우기를 포함한 값. 실제 장면 위(`--live v2g`): `hud.draw` 평균 0.3–1.0 ms · 가운데값 0.1–0.2 ms · 가장 긴 것 5–20 ms(처음 프레임의 굽기 — 지역 이름 띠 · 붓 글꼴 도착 뒤 다시 굽기. 밤 표시 · 촛불 받침 · 달은 불러오기 화면 뒤에서 미리 굽는다).
- 프레임마다 만드는 것: 객체 · 배열 · 문자열 0. `node tools/v2/ui_alloc.mjs`(힙 표본, 치운 것까지 셈)로는 프레임당 약 2–3 KB 가 잡히는데 모두 캔버스 호출에 넘기는 소수 값의 상자(HeapNumber)다 — 캔버스에 그리는 한 피할 수 없고 젊은 세대에서 바로 치워진다.
- 단추 층 다시 칠하기: 상태가 바뀔 때만(시험 한 판에 29번 — 누름 · 뗌 · 쉼 눈금). 평소 0.

### 알아 둘 것 · 남은 것

- 실제 폴드에서 손가락으로 눌러 보지 않았다. 단추 크기 · 간격 · 스틱 감도(데드존 10 px, 반지름 66 px × 배율, 1.4R 넘으면 받침이 따라온다)는 기기에서 다듬어야 한다.
- 단추 배치 편집기는 없다(v1 패드의 것은 v1 장면 전용). 설정 `touchScale` · `touchOpacity` · `textSize` · `touchLeftHanded`(왼손잡이 — 단추 무리와 스틱이 자리를 바꾼다, 멈춤 단추는 오른쪽 위 그대로)는 따른다.
- 솜씨 길게 누르기의 "사냥꾼 고르는 둥근 판"은 만들지 않았다(장면이 `skill1` 누른 시간을 재고, 판은 다음 판에).
- 연대기 · 지도 · 가게 · 종 편지 · 저장 화면(GDD §9.2)은 이 구역의 이번 범위 밖이다. `glassPanel` · `plate` · `bakeText` 로 같은 말투를 낼 수 있다.
- 캔버스 HUD 는 게임 캔버스의 해상도를 따른다(화질 등급이 낮으면 조금 무르다). 단추 층은 늘 기기 해상도(최대 3배)다.
- 아이콘은 「은 세공 + 서리 낀 수정」 한 벌(생성 그림, `tools/higgsfield/manifest_ui.json`)이고 밝기를 투명도로 바꿔 유리 위에 얹었다. 그림마다 어두운 그늘을 구워 넣어 밝은 불빛 위에서도 읽힌다. 새 아이콘은 같은 프롬프트 꼬리(`style_suffix`)로 만들고 `tools/v2/ui_atlas.py` 의 `SPRITES` 에 한 줄 더한다.
