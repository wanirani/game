# UI_API — 3D 판 인터페이스 「세공한 유리」 규약 (UI 구역)

2026-11-17 · 코드 `src/v2/ui/`, 그림 `assets/v2/ui/gem/`, 시험 페이지 `tools/v2/ui_view.html`, 검사 `node tools/v2/ui_check.mjs [--live v2g]`, 캡처 `node tools/v2/ui_shot.mjs`, 아이콘 묶음 다시 만들기 `python3 tools/v2/ui_atlas.py`.
다른 구역은 **이 문서만 보고** 맞춘다. 바꾸면 "바뀐 것"에 한 줄.

## 바뀐 것
- 11-19 13:00 **SCREENS — 연대기 · 가방 · 로크의 가게 · 카드 · 갈래 카드** (영어; 새 절 **§10** 에 화면마다 한 절). ① Three full screens drawn on the canvas with the kit (`src/v2/ui/screens.js`): **`hud.openScreen('chronicle' | 'bag' | 'shop', { at, shop, onClose })`** → `true` / `false`, `hud.closeScreen()`, `hud.screen`. While one is open **`hud.modal === 'pause'`** - no new value: the scene stops the rules exactly as for the pause panel, the pad is off, no touch reaches the game, `cancel` / `menu` (ESC, the device's back button) closes it. ② The pause panel has two more rows, **「연대기」 and 「가방」**, between 「이어 하기」 and 「설정」 whenever a story model exists (`metrics().pause.ids` = `resume chronicle bag settings extra… leave`); **every row is a 56 CSS px target** (it was 46) and the rows stand in two columns when they do not fit the height (phone2). ③ Cards that do not stop the game (`src/v2/ui/cards.js`): **`hud.card('chronicle' | 'item' | 'note', o)`**, and the **book chip** left of the pause button. ④ **A choice is two large cards, confirmed by a second tap** (`src/v2/ui/choice.js`, the dialogue's `choiceMeta`): the press that turns the last page never chooses any more; the old pad's built-in HUD asks on the same cards (`attachChoiceCards`). ⑤ **`createHud(game, { model })`**: `opts.model()` → the screens' model (`src/v2/ui/model.js`, owned by the story host) or `null` (no story: no screens, no cards, no chip, no new pause rows). ⑥ HUD marks: the draughts carried stand right of the candles, the guide candle's line under the objective. `metrics().hud` gained `bannerRect, toastRects, objective, guide, draughts, statusR`; `metrics()` gained `screen` and `cards`; `metrics().dialog` gained `cards` (the choice cards) and `choiceRects` are the cards' boxes. ⑦ `pad.setBack(true)` (a bell crossing) takes the **pause button** off at once instead of fading it: the scene takes no pause while a crossing runs, and a button that cannot answer is not drawn (a crossing inside a story cut used to leave it on screen alone and deaf); it fades back in with the others. New pad readers for the cards' placing: `pad.at(i, out)`, `pad.idAt(i)`, `pad.count`, `pad.cut`, `pad.back`. ⑧ Five feel-table entries at the end of `src/v2/feel/table.js`: `book.chime`, `card.rise`, `shop.buy`, `shop.deny`, `draught.use`. Check: `node tools/v2/screens_check.mjs` (§10.9).
- 11-19 08:20 **STORY2 — 컷 동안에도 「멈춤」은 남는다 · 장소 이름은 장면을 덮지 않는다 · 초상은 미리** (영어). ① **`HudState.cut`**: while it is true and no dialogue, pause panel, ending card or message is up, the pad shows the **pause button only** - the stick and every other button are off screen and take no touch (`pad.setCut(on)`, `pad.metrics().cut`); the pause button works as always (a player can stop and leave from the first second, by touch as by key - `tools/v2/p0_entry_check.mjs` taps it during the opening's cut). A dialogue hides the whole pad as before. ② **`HudState.story`** (boolean): a story sequence is running. **The place name** (`setBanner('area', …)` on a new area id) never sits over a scene: it is not shown on arriving in the other night of the same place (the same `area.name` - the night badge, the year stamp and the night banner say it); otherwise it waits while `story` or `cut` is true and comes up when the story lets go, or is dropped when that takes longer than five seconds. The story's own banners (`hud.banner`) are untouched - the opening's 「서막 — 금 간 종」 used to be replaced by 「에슈빌」 the tick after it was set. `hud.metrics().hud.bannerTitle` = the title on screen. ③ **`hud.preloadPortraits(ids)`** → a promise `{ n, ms }`; `hud.portraitsReady`: the dialogue box loads and decodes the busts ahead (`dialog.preload`), so the first page of a speaker's first line of a session opens with the bust in its frame (it used to open with an empty frame and bake the box again when the image arrived).
- 11-19 06:10 **STORY — 컷 동안 패드가 물러난다**: `HudState.cut`(불리언, 없으면 false) — 이야기의 카메라 컷이나 `lockInput` 이 영웅을 붙드는 동안 장면이 켠다. HUD 는 대화 창이 열렸을 때와 똑같이 패드 층을 숨기고(`index.js` `pad.tick` 한 줄) 이야기가 놓는 틱에 되돌린다. 그동안 `state.prompts` 는 비어 온다(장면이 알약을 주지 않는다). 대화 · 컷이 번갈아 나오는 장면에서 패드가 깜빡이지 않는다.
- 11-19 02:30 **CHAPTER — 맺음 카드**: `hud.showEnd({ title, head, sub, home, far: [a, b], cont, hint, onDone })` · `hud.tapEnd()` · `hud.closeEnd()`, 그동안 `hud.modal === 'end'`(패드는 물러나고, 화면을 누르면 — 5.6초 뒤부터 — `onDone` 이 한 번 불린다). 새 파일 `src/v2/ui/endcard.js`: 어두운 장막 위에 제목 · 「달이 한 칸 기울었다」 · 종소리 동그라미가 한 겹 넓어져 두 곳에 닿는 그림 · 「이어집니다」 · 누르라는 안내를 캔버스에 바로 그린다(굽지 않는다 — 싸움이 끝난 뒤다). `hud.metrics().end = { open, t, ready, done }`. 글은 `src/v2/data/text.js` `TEXT.ending`.
- 11-18 17:20 **BREAK — 은화**: `HudState.coins`(정수; 없으면 0). 숫자가 바뀌면 왼쪽 상태 묶음 아래(알림이 뜨는 줄의 첫 칸)에 유리 조각 하나 — `pouch` 아이콘 + 숫자 — 가 0.07초에 미끄러져 들어와 숫자가 빠르게 올라가고 3.6초 머문 뒤 스러진다. 알림은 그 아래로 밀리므로 다른 HUD 조각을 덮지 않는다(fold_open · phone2 캡처로 확인). 게임을 시작할 때의 숫자(불러온 저장)는 뜨지 않는다. 일시정지 판에는 줄들 아래 가운데에 늘 보인다. `hud.metrics().hud.coins` = 떠 있을 때 `{x, y, w, h, a, n}`, `metrics().pause.coins`. 내장 HUD(`src/v2/game/hud.js`)는 체력 막대 오른쪽에 「은화 N」 한 줄(1 이상이거나 일시정지 중일 때).
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
- 지도 · 종 편지 · 저장 화면(GDD §9.2)은 아직 없다(연대기 · 가방 · 가게는 11-19 에 생겼다 — §10). `glassPanel` · `plate` · `bakeText` 로 같은 말투를 낼 수 있다.
- 캔버스 HUD 는 게임 캔버스의 해상도를 따른다(화질 등급이 낮으면 조금 무르다). 단추 층은 늘 기기 해상도(최대 3배)다.
- 아이콘은 「은 세공 + 서리 낀 수정」 한 벌(생성 그림, `tools/higgsfield/manifest_ui.json`)이고 밝기를 투명도로 바꿔 유리 위에 얹었다. 그림마다 어두운 그늘을 구워 넣어 밝은 불빛 위에서도 읽힌다. 새 아이콘은 같은 프롬프트 꼬리(`style_suffix`)로 만들고 `tools/v2/ui_atlas.py` 의 `SPRITES` 에 한 줄 더한다.

## 10. 화면들 — 연대기 · 가방 · 가게 · 카드 (SCREENS, 2026-11-19; 영어)

Files: `src/v2/ui/model.js` (what the screens show - pure, no DOM), `screens.js` (the three full screens), `cards.js` (the rising cards and the book chip), `choice.js` (the choice cards), `icons.js` (pictures drawn in code in the kit's style: `bakeIcon(name, size, scale)` → a cached canvas, `hasIcon(name)`). Words: `TEXT.screens` (`src/v2/data/text.js`). Nothing here is a DOM element or a new image file; the shop's bust is the dialogue's own portrait file.

Rules all of them keep: laid out inside the safe area for fold_open first and phone2 second; every touch target is 56 CSS px or more; a screen opens in 0.16 s and closes in 0.12 s; while a screen is open `hud.modal === 'pause'` (the scene stops the rules as for the panel; story shot timers, walks and waits stand still and go on where they were), the pad is off and the HUD's window listeners take every press (a press begins a drag of the list, or is a tap when the finger lifts where it came down - nothing is handed on to the shell, so the tap that closes a screen swings no whip); `cancel` / `menu` closes the top screen; a screen cannot open while a crossing, a load or a message is up (`openScreen` → `false`). Cards and the chip stop nothing and hold nothing. Everything shown comes from the runner's state through the model, so a save and load, a crossing and a fall leave a screen exactly as it was.

### 10.0 The model — `createHud(game, { model: () => scene.host?.model ?? null })`

`createModel({ STORY, st, coins, setCoins, area, reso, fillReso })` (the story host makes one: `scene.host.model`). What the screens remember themselves is four small things, saved by the scene as `save.scr = { read, chip, dr, guide }` (ENGINE_API §12.2).

| member | meaning |
|---|---|
| `rev` · `touch()` | `rev` changes whenever something a screen shows may have changed (a flag, an item, a purchase, an arrival); the screens bake again only then |
| `book()` | the rows of the chronicle in `order`: `{ id, kind, era, title, L: { title, text } ｜ null, R: { title, text } ｜ null, hint, isNew, key }`. `kind`: `'line'` a written line on the page of its `era` · `'sealed'` a line the chronicle has not finished (title only) · `'blank'` nothing done (an empty frame, the hint) · `'half'` the deed of that night is done (`L`), tonight has not been seen · `'pair'` cause (`L`) and consequence (`R`) |
| `seen(row)` · `unread()` | a new row has been on screen (it stops glowing; kept in `save.scr.read`) · how many still glow |
| `chip` · `wrote()` · `opened()` | the book chip is up · the story's chronicle step wrote an entry · the book was opened |
| `bag()` | `{ story: [...], use: [...] }`, a thing = `{ id, name, desc, icon, n, kind }` (`use` = `ITEMS` of kind `food` and the draughts) |
| `shop(id)` · `buy(id, goodId)` | what the shop screen shows `{ id, title, keeper, portrait, line, say, goods: [{ id, name, line, price, icon, limit, have, state }] }`, `state` = `'ok'` or why not: `'poor' ｜ 'full' ｜ 'fullReso' ｜ 'lit' ｜ 'noBlank'` · buy one → `{ ok, why, good }` |
| `dr` · `draughtUsed()` | draughts carried (the scene copies it to `sim.hero.draughts` after every new Sim) · the rules used one |
| `guide` · `guideLine()` · `enterArea(id)` | the place (both its nights) the guide candle burns in · the line under the objective (`''` = none) · it goes out when the hero has left that place |
| `coins()` | the silver (the scene's `brk.coins`) |
| `out()` · `load(o)` · `reset()` | the save. A save of an earlier build has no `scr`: the chip is up when anything was ever written, every written row is new |
| `T` · `sound(name)` | `TEXT.screens` · set by the host: plays a feel-table entry |

### 10.1 연대기 — `hud.openScreen('chronicle', { at?: entryId, onClose? })`

An open book of two pages: left **「그 밤 · 1697」**, right **「오늘 밤 · 1797」**, in the night badge's own colours (`night_past` red, `night_now` blue-silver; the two badge sprites stand beside the page heads). One row per `CHRONICLE` entry; an entry is a title and one or two lines. A consequence sits on the same row as its cause and a thin gold line joins the two cells across the fold - a small diamond on the fold, an arrow head at tonight's cell (`pair`; for a `half` the line is dashed and the diamond hollow); a deed done whose consequence has not been seen tonight shows the left cell and an empty frame with 「오늘 밤에 가 보면 안다」 on the right (`half`); a blank is an empty frame and the entry's one hinting line (`blank`). A new row glows (a pulsing gold rim) until it has stood wholly inside the window for 0.8 s. The list is dragged with the finger and keeps moving when let go (momentum on the game's clock, a soft stop at both ends); `up` / `down` scroll by key. Rows are baked into a pool of 14 canvases, only those near the window, one a frame ahead of a fling.

Opened by: the pause row 「연대기」 (closing it returns to the panel with that row chosen); the **book chip**; a tap on the card 「연대기에 적혔다 — …」 (`at` = that entry: it is centred and glows); and once by itself after the ending card (`src/v2/game/chapter.js` `_book()`: the card's `onDone` opens the book at the chapter's last entry, closing it is `ch.leave()` - ENGINE_API §12.4).

### 10.2 가방 — `hud.openScreen('bag', { onClose? })`

Two columns: **「이야기의 물건」** (keys, tools, keepsakes) and **「쓰는 것」** (food, the draughts). A thing is its picture (`ITEMS[id].icon`, drawn in code - the silver key `key_silver` is pale with glints, the iron key `key_iron` of the choice dark, the rusted lump `key_rust` a picture of its own), its name, `×n` where it has a count, and one line (`desc`). The silver stands in the header (「은화 N」). Opened by the pause row 「가방」.

### 10.3 카드 — `hud.card(kind, o)`

| call | shows |
|---|---|
| `hud.card('chronicle', { id, title })` | 「연대기에 적혔다 — <title>」 for 2.5 s, with a small arrow: **a tap opens the book at that entry** (a card that can be pressed waits for a dialogue box to close before it fades) |
| `hud.card('item', { name, icon, n })` | 「얻었다 — <name>」 (`×n` above one) with the thing's picture, 2 s |
| `hud.card('note', { text, icon, kind })` | one line with a picture: a thing the story took away (`ITEMS[id].gone`: 「먹었다 — 로테의 빵」), a draught used. `kind`: `'plain'` (no gold rim) · `'warn'` (red) |

The cards stand at the right edge under the pause button (the place §6 keeps for item notices) - never on the banner's, the toasts' or the dialogue's box. As many as fit above the pad's buttons are up at once (three on the Fold, one on a phone); up to eight wait their turn. They rise in 0.18 s, are baked once and cost one `drawImage` a frame. They never stop the game and hold nothing. With the old pad's HUD the same words are a notice.

### 10.4 책 조각 (the book chip)

A small round book with a gold dot, **left of the pause button**, while `model.chip` is set: something was written and the book has not been opened since. It comes up with the chime `book.chime` and stays until the book is opened (through a save and load too). Its target is 56 CSS px; a tap opens the chronicle. The touch that opens it goes nowhere else (`createPad` `claims`) - no roll, no swing.

### 10.5 갈래 카드 (§4 의 `choices`)

Where a dialogue offers a choice, each option is a large card: its picture (`icon`), its name (`label`) and the one line the story gives it (`line`) - `d.choiceMeta = [{ icon, line }, …]` beside `d.choices` (DATA_FORMAT §3). **A choice is confirmed by a second tap**: the first press on a card chooses it (it lifts, its rim turns gold, 「한 번 더 누르면 정한다」 appears), the second press on the same card decides. Why not a hold: a hold cannot be seen, it is the bell's own gesture in this game (hold to cross), and a second tap works the same with a finger, a key and a pad button. A stray tap cannot choose: the cards take nothing for 0.35 s after they come up, none is chosen beforehand, a press beside the cards lets go of the chosen one, the press that turns the last page no longer finishes a choice, and at least 0.12 s must pass between the choosing and the deciding press. Keys: `left / up` · `right / down` choose, `confirm` (`attack`, `jump`) chooses the first card when none is chosen and otherwise decides. The built-in HUD of the old pad shows the same cards (`attachChoiceCards(hud, game, text, sound)` - the story host calls it when a choice comes up; that HUD used to take the first choice unasked).

### 10.6 가게 — `hud.openScreen('shop', { shop: 'rook', onClose })`

The keeper's bust, name and line of this night on the left (`SHOP[id].line.now / past`), his goods on the right - a picture, the name, one line, the price in silver - and the hero's silver in the header (「가진 은화 N」). **Buy = tap a row, then tap it again** (the first press chooses: 「한 번 더 누르면 산다」; a press elsewhere lets go). A row that cannot be bought says why on the row (「은화가 모자라다」 · 「더 들 수 없다」 · 「울림이 이미 가득하다」 · 「켜져 있다」 · 「지금은 일러 줄 빈칸이 없다」), and a press on it shakes the row, plays `shop.deny` and puts the keeper's own refusal in place of his greeting; a purchase plays `shop.buy` and his thanks. Keys: `up / down` choose, `confirm` buys (twice), `cancel` closes. The story's step `['shop', id]` opens it and waits until it is closed (DATA_FORMAT §7b); with the old pad's HUD there is no screen and one notice says so.

### 10.7 HUD 의 작은 표시

- **성수** (`model.dr` > 0): a small bottle and `×n` right of the candles (the boss bar keeps clear of it); `metrics().hud.draughts`. When the rules use one (`play.draught`) the card 「성수가 쓰였다 — 촛불 한 자루로 버틴다」 rises with `draught.use`.
- **길잡이 초** (`model.guideLine()`): one small golden line with a candle under the objective - 「빈칸 — <where>」; `metrics().hud.guide`.
- `metrics().hud.bannerRect` · `toastRects` · `objective` are the boxes the cards and the check keep clear of.

### 10.8 일시정지 판의 줄

`resume · chronicle · bag · settings · (extra…) · leave` - the two rows of the screens are there whenever `opts.model()` answers a model. Rows are 56 CSS px high; when they do not fit one above the other (phone2 with the scene's extra rows) they stand in two columns, down the first then down the second - the order of `metrics().pause.ids` and of the keys is the same either way, 「나가기」 is last. The panel can be opened in the middle of a story cut (§1 `cut`), and so can both screens: the story's shot timers, walks and waits stand still while `hud.modal` is `'pause'` and go on exactly where they were.

### 10.9 검사 · 잰 값 (2026-11-19, headless Chromium, software canvas - not a device)

`node tools/v2/screens_check.mjs [--devices fold_open,phone2] [--only node,pause,book,cards,bag,choice,shop,persist,cut,ending,alloc] [--out <dir>]`: the model on the story's own saves and the draught in the rules without a browser (35 lines), then every screen and card opened by touch through the pointer handlers in game time (87 lines a device): layout inside the safe area, nothing on the HUD's boxes, targets of 56 px, the game standing still behind a screen, no touch falling through, back / ESC, a save and load, a crossing and a fall with each screen's state, a purchase, an unaffordable one, the draught saving the hero once, a screen opened during a story cut, the book after the ending card and a reload there, allocation per frame. **fold_open 122 / 0, phone2 122 / 0** on the tree of 11-19 12:40.
- Allocation with a screen open and still: no object, array or string a frame in these files. Sampled bytes in them (heap sampling, both devices): the book 0-4 B/frame, the bag 0, the shop 0, the choice cards 4-5, three cards and the chip 12 - boxed numbers at most; the whole HUD beside them 0.6-2.6 KB/frame as before (§9).
- Thirty entries flung: 306 frames, script time median 0.0-0.1 ms, longest 1.0-1.3 ms, none over 8 ms; with every frame rastered by a read-back the median is 10-13 ms on this machine's software canvas (longest 27 ms) - a device with a GPU has to be measured on the device.
- Not done on a real Fold: nobody has pressed these with a finger yet.

### 10.10 Changes after the verifier (POLISH, 2026-11-19 14:40 UTC)

- **No banner through the pause panel or a screen.** While `pause.open` or a screen is up the glue calls `canvas.veil(true)` before every update and draw (`index.js` → `hud.js` `veil`): the banner (place name, section, the story's own, 「촛불이 꺼졌다」) is not drawn and its clock stands, so it does not run out unseen behind a long pause; when the panel closes it comes back over 0.32 s and goes on for the rest of its time. `stats()` has two new fields: `bannerShown` (false while veiled) and `bannerT` (its clock, seconds). `banner` / `bannerTitle` / `bannerRect` answer as before. Toasts and world prompt chips are NOT veiled (a prompt chip can still be seen through the panel's glass). Check: `screens_check.mjs --only pause` (one line a device).
- **The empty book**: 「아직 적힌 것이 없다」 stands on tonight's page at the height of the first row (where the first entry is written), not across the fold.
- **Icons** (`icons.js`): `chisel` is redrawn as a mason's cold chisel (one flat bar of steel, mushroomed head, flared bevelled edge) lying across a wooden mallet; new icon `pack` (a cloth bundle knotted at the top) is the header of the shop screen (it was `coin`; `coin` itself is unchanged and stays in the kit, drawn by no screen now - the purse is the atlas sprite `pouch`).
- **Known, not changed**: the story's closing banner (`['banner', 'clear', …]` of `ev_ending_home`, and `host.end`) is switched off one tick after it is set - `hud.js` `update` ends every `clear` banner while `state.done` is false, and `state.done` is only ever true in a test area. The words are therefore seen only as the head of the ending card.
- **Verified (POLISH-VERIFY, 2026-11-19 15:05 UTC, no source change)**: `tools/v2/polishverify_stills.mjs --device fold_open|phone2` (26 lines a device, both pass) opens the panel 0.3 s, 1 s and 2 s after arriving, then the book and the bag from it: no banner is drawn, the clock and the rules stand through four more seconds, the name is back within 0.17 s of 「이어 하기」 and goes out at 3.2 s of its own clock; the same for a chapter banner and the night banner. 「설정」 closes the panel and pushes the options scene (as before): the game under it does not tick, nothing of the HUD is seen through it, and back from it the banner goes on. Left as they were, seen in the stills: the world prompt chip (「대장간」 beside 「가방」 on the Fold, between the two columns on a phone) and, on a phone, the objective line under the panel's left edge; the name that WAITS for a scene (`areaWait`) still counts its five seconds behind a pause. The closing banner needs two things in these files and nothing in the story: the rule above must end only the `clear` banner the HUD raised itself, and the story's one must go when the ending card opens (`chapter.js` gives it `END_CARD` = 1.6 s before the card) - without a new object a frame (no `info()` in the glue's update).
