# UI_API — 3D 판 인터페이스 「세공한 유리」 규약 (UI 구역)

2026-11-17 · 코드 `src/v2/ui/`, 그림 `assets/v2/ui/gem/`, 스타일 `css/v2ui.css`(모듈이 필요할 때 스스로 붙인다), 시험 페이지 `tools/v2/ui_view.html`, 검사 `node tools/v2/ui_check.mjs`, 캡처 `node tools/v2/ui_shot.mjs`.
다른 구역은 **이 문서만 보고** 맞춘다. 바꾸면 "바뀐 것"에 한 줄.

## 바뀐 것
- 22:25 첫 판 (이름·모양을 먼저 정함. 구현 상태는 §9).

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
- `opts`(모두 선택): `{ pad: true, rollGuard: 'both', assetBase: 'assets/v2/ui/gem/', portraitBase: 'assets/v2/portraits/', mount: document.getElementById('app'), onPause: null, labels: {…} }`

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
| **`area{id, name}`** · **`section{id, label}`** | 지역 · 구역 이름. `section.id` 가 바뀌면 구역 이름 띠가 저절로 뜬다 |
| **`enemies[]`** `{id, x, y, z, h, hp, hpMax, dead, state}` | 적. 락온 표식 · 작은 체력 막대에 쓴다 |
| `boss` `{name, hp, hpMax, sub?, stagger?}` ｜ `null` | 보스 이름 + 막대(위 가운데). `stagger` 0–1 = 무릎 꿇음 눈금(선택) |
| **`numbers[]`** `{x, y, z, str, color, t, on, big}` | 피해 숫자 풀(ENGINE). `big` = 크게. 붓글씨로 그린다 |
| **`project(x, y, z, out)`** | 세계 점 → 논리 화면 `{x, y, w}` (w ≤ 1 = 화면 뒤) |
| `prompts[]` `{action, label, x?, y?, z?}` | 단추 안내. 세계 좌표가 있으면 그 자리 위에, 없으면 아래 가운데 줄에. 키보드 · 패드는 키 이름 알약, 터치는 그 동작의 아이콘 |
| `pad` `{skill:{mode:'hook'｜'call', cd, disabled}, bell:{mode:'short'｜'long', charge, disabled}, roll:{cd, disabled}, attack:{disabled}, jump:{disabled}, lock:{disabled}}` | 단추 상태. `cd` 0–1 = 남은 쉼(1 = 방금 씀), `charge` 0–1 = 길게 누르는 중 차오름, `mode` = 아이콘 바꿈. 없으면 모두 보통 |
| **`done, doneT`** · **`loading, message, message2`** | 지역 끝 · 불러오는 중 · 오류 글 (내장 HUD 와 같은 뜻) |
| **`dialog`** | 대화(§4 의 모양). `hud.showDialog()` 대신 상태로 넘겨도 된다 |
| **`debug`** · `debugLine()` | 개발 줄 (`?v2dbg=1`) |

`state` 는 장면이 다시 쓰는 객체이므로 HUD 는 붙들지 않는다. HUD 가 `state` 에 쓰는 것은 없다.

## 2. 여는 함수 (사건으로 부르는 것)

| 함수 | 하는 일 |
|---|---|
| `hud.banner(kind, title, sub?)` | 큰 알림 띠. `kind`: `'area'`(지역 이름) · `'section'` · `'night'`(「오늘 밤이 달라졌다」— title 을 안 주면 이 글) · `'clear'` · `'dead'` |
| `hud.toast(text, opts?)` | 작은 알림(물건 주움 등). `opts {icon: 그림 URL ｜ 아이콘 id, kind: 'item'｜'info'｜'warn', time: 2.6}`. 최대 3개가 쌓인다 |
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
- 잰 값은 §9 와 보고에.

## 8. 실행 중에 받는 파일 (`tools/deploy/v2_ship.txt` 에 넣을 것)

- `assets/v2/ui/gem/atlas.webp` · `assets/v2/ui/gem/atlas.json` — 아이콘 한 벌
- `assets/v2/portraits/<id>.webp` — 대화 창이 부를 때만
- `css/v2ui.css` (assets 밖 — 배포 스크립트가 css/ 를 통째로 싣는지 확인할 것)
- 글꼴은 게임이 이미 싣는 것만: 본문 Noto Sans KR, 제목 Hahmlet, 숫자 · 짧은 외침 BN Brush(`ui.loadBrush()` 로 처음 한 번 받는다)

## 9. 구현 상태 · 알아 둘 것

(구현하면서 채운다.)
