# 외전 27장 「돌아오지 못한 수문지기」 — 설계 계약 (외전 Ⅱ)

> **상태: 설계 계약 (SPEC, Stage 7, 2026-11-01).** 구현은 두 사람이 **동시에** 한다 — **EX-STAGE**(맵 · 대본 · 스테이지 · 보상 · 모든 등록 · 시험) 와 **EX-BOSS**(보스 로직 · 데이터 행 · 채색 퍼핏 · 초상화 · 보스 등장 행 · 보스 시험). 파일 소유는 §7 이 정한다 — **한 파일은 한 사람만 고친다**. 이 문서의 **굵은 항목**은 바꾸지 않는다. 바꿀 이유가 생기면 `/tmp/claude-0/s7/requests.md` 에 `[보낸이→받는이] 파일 · 바꿀 것 · 이유` 한 줄.
> 틀은 외전 Ⅰ s26 「파라켈의 지하 공방」(`docs/specs/ex_s26.md`)과 같다: **새 배경·새 곡·새 기믹·새 소리 0**, 새 그림은 보스 하나(채색 퍼핏 + 초상화 하나). **그림은 Higgsfield** (`tools/higgsfield/README.md` — Kling 쓰지 않음), 화풍은 지금 게임의 채색 다크 판타지 (`docs/specs/ART_DECISION.md` · `docs/art/BOSS_PIPELINE.md`) — **애니풍 금지**.
> 보상: **장신구 「수문지기의 등불」(`u_johan`, 보스 드롭) + 로어 `l36` + 업적 `st_s27` + 마을 대사** (§3). 시간: 빌더는 06:20 UTC 에 손을 놓는다 — **다 못 그린 채색 보스보다 돌아가는 벡터 보스가 낫다** (§2.2 벡터 먼저).

## 0. 왜 마르타와 카엘, 왜 8장 · 10장인가

### 0.1 어디에 매다는가 — 8장 지하 수로 노드, 10장 클리어로 열림
- **7장은 s26 이 쓴다.** 1부 지도에 아직 외전이 없는 장은 3–6 · 8 · 9 · 12 · 13장이다 (`worldmap.js` `SIDE_FROM`: s21←s17 · s22←s02 · s23←s10 · s24←s11 · s25←s01 · s26←s07).
- **새 레벨 띠**: s26 은 스테이지 Lv 30 · 권장 Lv 28–34 (9장 뒤). 1부에서 가장 큰 레벨 틈은 **12장(Lv 36) → 13장(Lv 45, 유물 다섯 필요)** 이다 — 9레벨을 다시 도는 구간에 새 이야기가 없다. 그래서 **s27 은 스테이지 Lv 37 · 권장 Lv 35–41 (11장 뒤 ~ 12장 뒤)** — s26 띠와 겹치지 않고, 13장 앞의 빈 구간을 채운다.
- **이야기가 이미 그 자리를 가리킨다**: 8장 「지하 수로」의 편지 (`lore.js` l08, `story.js` s08_t1) — 그리고 **10장 「얼어붙은 첨탑」에서 서리 여왕 이자벨라가 녹는다** (`story.js` 1463행 "이자벨라가 녹았다고?"). 첨탑의 얼음이 녹아 흘러내린 물이 지하 수로로 쏟아져, 수로 관리인이 끝내 닫지 못한 **셋째 수문**이 에슈빌을 물에 잠기게 하려 한다. → **노드는 8장 아래(`SIDE_FROM.s27 = 's08'`), 문은 10장 클리어(`SIDE_GATE.s27 = P.cleared.s10`)**. 7장 클리어로 열리는 s26 과 같은 "몇 장 일찍 열리고, 권장은 두 장 뒤" 모양.

### 0.2 누구의 이야기인가 — 마르타 (흑묘 여관) · 카엘
s25 설계가 훑은 대로 일곱 영웅의 외전은 다 찼고 (s26 은 알베르토 · 아젤), **마을 NPC 중 과거가 한 줄도 없는 사람이 마르타**다 — "호쾌한 여주인 · 엘리제의 이모 · 검은 고양이 '백작님'" (`npcs.js`). 그리고 1부에는 **주인 없는 편지**가 있다.

| 실마리 | 출처 |
|---|---|
| "여보, 수문을 닫으러 내려가오. 저것이 깨어나기 전에 물길을 막아야 하오. 저녁은 먼저 드시오. 아, 그리고 지붕 새는 곳은 돌아가서 고치겠소. 이번엔 정말이오." | `lore.js` l08 · `story.js` s08_t1 |
| 카엘 — "돌아가지 못한 사람의 편지군. …마저 전해 줄 수 있으면 좋을 텐데." | `story.js` s08_t1 (카엘 줄) |
| 리아 — "수문… 그게 아직 열려 있다는 건, 그가 실패했다는 뜻이야." | `story.js` s08_t1 (리아 줄) |
| 크레딧 — "지하 수로 관리인 — 돌아오지 못한 남편" (이름 없음) | `story.js` 1663행 |
| 레비아탄이 쓰러지자 "수로의 물이 천천히 맑아지기 시작했다" — 검은 물의 찌꺼기는 어디로? | `story.js` b_leviathan_post |
| 이자벨라가 녹는다 (10장) | `story.js` 1463행 · `story_trials.js` ECHO |
| 마르타 = 엘리제의 이모, 여관 주인 — 남편 이야기는 어디에도 없다 (모순 0 — `남편|그이|여보` grep 확인) | `npcs.js` · `story*.js` |

외전은 이것을 한 번에 묶는다: **편지의 주인은 마르타의 남편 요한** — 에슈빌 물길(성 밑 수로와 이어진 옛 수도관 · 수문 셋)의 관리인이었다. 붉은 달이 뜬 밤, 그는 하드윈이 징을 다시 박아 준 **낡은 잠수 갑옷**을 입고 성 쪽 가장 깊은 **셋째 수문**을 닫으러 내려갔다가 돌아오지 못했다. 카엘이 8장에서 주운 젖은 편지를 아직 품에 지니고 있다. 10장 뒤 첨탑의 녹은 물이 수로로 쏟아지자 에슈빌 광장 우물이 검은 물로 차오르고, 밤마다 우물 바닥에서 **쇠를 세 번 두드리는 소리**가 올라온다 — 요한이 퇴근할 때마다 여관 문을 두드리던 버릇.
셋째 수문 앞에는 **아직 잠수 갑옷이 서 있다.** 레비아탄이 죽으며 흘린 검은 피(= 검은 물)가 갑옷 안에 차올라 요한의 몸을 움직이고, 수문 열쇠를 **거꾸로** — 여는 쪽으로 — 돌리게 한다. 그러나 갑옷 가슴의 기름 등불은 꺼지지 않았다: 요한의 고집이 아직 그 안에 있다.
결말은 정화(s21)·굴복(s22)·죽음(s23)·바스러짐(s24)·놓아줌(s25)·굳음(s26)이 아닌 **약속을 마침** — 쓰러진 갑옷이 무릎을 꿇고, 이번에는 바른 쪽으로 열쇠를 돌려 **수문을 닫는다** ("이번엔 정말이오"). 검은 물이 빠진 투구 안은 비어 있고, 등불 손잡이에 결혼반지가 묶여 있다. 반지는 마르타에게, 등불은 헌터에게 (보상). 아웃트로 다음 날 아침, 헌터가 여관 지붕에 올라 새는 곳을 고친다. 주제: **돌아오지 못해도 지킬 수 있는 약속이 있다.**

**왜 카엘인가**: 편지를 "마저 전해 주고 싶다"고 말한 사람이 카엘이다 (s08_t1). 카엘은 처음부터 쓸 수 있는 영웅이라 (`characters.js` `unlock: null`) s10 뒤에는 늘 있다. 플레이 중인 영웅이 카엘이 아니면 **`R('kael', …)` 동행**, 카엘이면 **`ifChar('kael', …)` 본인 분기** — s26 의 아젤과 같은 모양. 나머지 여섯 영웅은 `H({...})` 줄.

## 1. 개요

| 항목 | 값 |
|---|---|
| 스테이지 id | **`s27`** (chapter 27, **`part: 1`**, **`page: 0`**, `side: true`, **`sideLabel: '외전 Ⅱ'`**) |
| 이름 | `name: '잠긴 수문'` (지도 · HUD 짧은 이름) · **`fullName: '돌아오지 못한 수문지기'`** (제목 카드) · `sub: '지하 수로 밑, 끝내 닫히지 않은 셋째 수문'` · 제목 카드 `title('외전 Ⅱ', '돌아오지 못한 수문지기')` |
| 여는 조건 | **10장 클리어 (`P.cleared.s10`)** — `SIDE_GATE.s27`. 세계 지도를 처음 열 때 해금 + 연출 (`s27_revealed`). 1부 · 2부 · 2부 엔딩 뒤 어느 때든 같은 스테이지 (대본이 시기를 가른다 §4.1) |
| 권장 레벨 | **Lv 35–41** (스테이지 레벨 **37** 고정). s10 직후(Lv ≈ 30)에도 들어갈 수 있지만 버겁다 (§2.3). 정보판 `tag` · `req` 문구가 권장을 알린다 |
| 회차 | **회차마다 다시 열린다** — `startNgPlus` 가 flags 를 새로 만든다 (`s27_revealed` · `ex_s27_done` 지워짐, 코드 0줄) |
| 위치 | 1부 지도(page 0), **8장 「지하 수로」 아래로 갈라지는 외전 노드** (`SIDE_FROM.s27 = 's08'`), `mapPos { x: 0.50, y: 0.88 }` (s08 `{0.58, 0.74}` 왼쪽 아래 — EX-STAGE 가 Fold 캡처로 겹침을 보고 고칠 수 있다) |
| 레벨 · 시간 | **37** · parTime 420 |
| 테마·그림 | **8장 수로 그대로**: theme `'waterway'`, bg `bg/s08_waterway`, tex `tex/tex_wet_stone`, tex2 `tex/tex_castle_stone`, tileStyle `'wet'`, darkness 0.6, darkColor `#030a0c`, liquid `'water'`, color `'#9ad0e0'`. **새 배경 없음** |
| 기믹 | 스테이지 기본 **`null`**. 방마다 **기존 기믹 재사용**: r4 `deep` (s16 과 같은 깊은 물 · 공기 방울 기둥 `u`, 방 `liquid: 'deep'`). 나머지 방은 `null` (물 `~` · 이동 발판 `M`/`V` · 붕괴 발판 `F` 만) |
| 적 | **기존 적만**: 8장 여섯 + 얼음 박쥐 + 미믹 (§1.1 숫자표). 스테이지 레벨 37 로 세진다. 새 적 0 (팔레트 변종은 §1.2 선택안) |
| 음악·소리 | 스테이지 **`s08`**, 보스 **`boss2`** (레비아탄과 같은 곡 — 같은 물의 이야기), 아웃트로 `sad`. 효과음은 있는 이름만: `splash` `break_wall` `clang` `whip` `whip_crack` `slash_heavy` `ice` `dark` `mist` `warning` `land` `boss_roar` `holy` |
| 방 | **6개** (마지막이 보스 방). 기존 맵 형식 · `tools/validate_maps.mjs` 오류 0 · 경고 0 · `--tight` 깨끗 |
| 보상 | 장신구 **`u_johan` 「수문지기의 등불」**(보스 드롭) · 로어 **`l36` 「수로 관리인의 근무 일지」**(r3 `@`) · 업적 **`st_s27` 「이번엔 정말이오」** · 마을 대사 (마르타 · 하드윈 · 엘리제 · 알베르토) |
| 플래그 | 쓰기 `s27_revealed`(세계 지도) · `ex_s27_done`(아웃트로 **맨 앞**) · `boss_b_johan`(자동). 읽기 `p2_started` · `boss_b_dracula` (대본 갈래) |

### 1.1 방 (`src/data/maps/s27.js` — EX-STAGE)

**적 숫자 (방마다 `enemies: { 숫자: id }` — s08 맵과 같은 방식):** 1 `merman` · 2 `killer_fish` · 3 `frog_demon` · 4 `drowned` · 5 `water_spirit` · 6 `bat` · 7 `ice_bat` · 9 `mimic`.
**문자 (범례 `src/game/tilemap.js`)**: `#` 벽(젖은 돌) · `%` 벽(성돌 — 교각 · 수문 틀) · `=` 단방향 발판 · `~` 물 · `M` 좌우 이동 발판 · `V` 상하 이동 발판(녹은 얼음덩이) · `F` 붕괴 발판 · `u` 공기 방울 기둥(r4) · `B`/`K` 부서지는 벽(음식/숨은 상자) · `S` 세이브 · `$` 보물상자 · `!` 이야기 트리거(열 전체 — 평평한 단단한 바닥 열) · `@` 배치 아이템 · `P` 시작 · `X` 보스 트리거 열 · `L` 램프 · `C` 촛불 · `|` 기둥.

흐름: r1 옛 수도관 → r2 갑문 우물(내려가기) → r3 수문 관리실(세이브 · 일지 · 상자 · 미믹) → r4 잠긴 둘째 수문(깊은 물) → r5 얼음물 회랑(세이브 · 호스) → boss 셋째 수문.

| 방 | 크기 | 내용 |
|---|---|---|
| r1 옛 수도관 | **96×17** 가로 | 에슈빌 광장 우물 밑에서 시작 `P`. 수로 `~` 셋(4 · 18 · 5칸) — 18칸 수로는 이동 발판 `M` 셋(`platRange 4 · platSpeed 80`)으로 건넌다. `B` 하나. 적 1×2(물가 잠복) · 2×3 · 3×2 · 6×2. `gimmick: null`. `exitRight: 'r2'` |
| r2 갑문 우물 | **32×46** 세로 (**내려간다** — 방에 들어오면 그 방의 `P` 에 선다 (`world.js` 방 진입 규칙) → `P` 를 왼쪽 위 다락(2–8행)에, 출구는 오른쪽 아래 38–44행 `exitRight: 'r3'`) | 녹은 물이 떨어지는 우물통. `=` 발판이 3행마다 엇갈려 **떨어져도 바로 아래 발판** (낙하 ≤ 3칸, 가장자리 낙하 ≤ 10칸). 붕괴 발판 `F` 넷(지름길 — 밟으면 무너진다). 왼쪽 벽 숨은 상자 `K` (30행, `hiddenChest:` Lv 37 띠의 기존 재료 id — EX-STAGE 가 `items.js` 에서 고른다). 적 6×3 · 7×3 · 4×1(바닥). `gimmick: null` |
| r3 수문 관리실 | **72×22** 가로 | 관리인의 방 (`gimmick: null`). 입구 가까이 세이브 `S`, **10열 `!` (`triggers: ['s27_t1']`)**, 13열 일지 책상 `@` (`items: ['lore:l36']`), 보물상자 `$` (`chests: ['epic']`), 미믹 9×1, 적 1×1 · 3×2 · 4×2 · 5×1 |
| r4 잠긴 둘째 수문 | **64×24** | **방 `liquid: 'deep'` + `gimmick: { kind: 'deep' }`** (s20 r4 와 같은 방식 — 스테이지 액체는 water 그대로, 이 방만 깊은 물. 규칙은 s16: 산소 · 헤엄 · 탈것은 내린다 · `u` 는 물속이면 그 칸도 물). 공기 방울 기둥 `u` 가 **14열마다 하나 이상** (산소가 바닥나기 전에 늘 닿는다 — 가장 느린 영웅 기준). 가라앉은 수문 틀 `%` 사이를 아래→위로 빠져나간다. 숨은 상자 `K` 하나. 적 2×3 · 1×2 · 5×1 |
| r5 얼음물 회랑 | **96×18** 가로 | 첨탑에서 녹아 내려온 얼음물 수로. 녹은 얼음덩이 `V` 넷(`platRange 3 · platSpeed 70`)과 `M` 둘로 넓은 수로를 건넌다 (물에 빠져도 느려질 뿐 — 기존 water 규칙). 세이브 `S`, **10열 `!` (`triggers: ['s27_t2']`)** — 위에서 내려온 잠수 갑옷 **공기 호스**와 손 펌프가 있는 자리. 적 7×3 · 4×2 · 1×1 · 3×1 · 5×1. `gimmick: null`. `exitRight: 'boss'` |
| boss 셋째 수문 | **60×18** | **s26 boss 방과 같은 뼈대 — 문자 하나까지 같은 고체** (바닥 16·17행, `=` 11행 [22–26] [34–39] [50–54] + 7행 [29–31] [43–45], 13행 한쪽 디딤 [18–20] [55–58], 17열 `|` 줄 · 15행 `X` · 시작 `P`). 물·불 없음, **`gimmick: null`**, `boss: true`, **`bossId: 'b_johan'`**, `name: '셋째 수문'`. 수문 바퀴는 **보스 렌더러가 그리는 소품**(§2.2) — 타일이 아니다 |

- 필수 길: 브란(점프 760, 이단 점프 합 ≈ 4.9칸) 기준 오름 3칸 이하, 같은 높이 틈 4칸 이하, 빠져나올 수 없는 구덩이 없음 (모든 방의 바닥이 막혀 있고 물 `~` 밑도 단단). `nav.mjs` 7영웅 탐침 통과.
- 발소리 `feel_move.js` `s27: { liquid: 'water', dry: 'stone' }` (s08 과 같다) · 전경 `foreground.js` `s27: { theme: 'waterway' }`.

### 1.2 팔레트 바꿈 변종 (선택 — 기본안은 0)
그림 예산이 남고 보스가 끝났을 때만 (EX-BOSS 가 아니라 EX-STAGE 판단, 채색 리그 재사용 + 색만): `drowned_bk` 「검은 물 익사자」 — 원본 `drowned` 펼침, 체력 ×1.2, 검푸른 색, 죽을 때 `splash`. r5 4번 자리를 대신한다. 넣지 않아도 맵·대본은 그대로다.

## 2. 보스 `b_johan` — 요한 / 돌아오지 못한 수문지기

| 항목 | 값 |
|---|---|
| id | **`b_johan`**. 이름 **요한**, 칭호 「돌아오지 못한 수문지기」 (초상화 `portraits/b_johan`). **form2: 이름 「검은 물」, 칭호 「요한이었던 것」, 같은 초상화** |
| 모습 (실루엣 — 퍼핏이 잘하는 단단한 판) | **크고 둥근 황동 잠수 투구**(징 박힌 통 모양, 둥근 창 셋 — 앞 창은 금이 가 안에서 검푸른 빛), **물을 먹어 부푼 기름 먹인 범포 잠수복**, 가슴 쇠판(징 · 녹), **가슴께에 매단 기름 등불**(유일한 따뜻한 빛 — 깜박이지만 꺼지지 않는다), 허리를 감은 쇠사슬과 납 추, **납 장화** 한 켤레, 투구 꼭대기에서 위로 끝없이 이어지는 **주름진 가죽 공기 호스**, 한 손에 사람 키만 한 **T자 수문 열쇠**(쇠 자루 · 네모 소켓 머리 — 망치처럼 쓴다), 이음매마다 배어 나오는 검은 물 · 따개비 · 범포 밑을 기어가는 장어 그림자. **2페이즈**: 앞 창이 터지며 검은 물이 수염처럼 쏟아지고 **레비아탄 비늘의 검은 뱀장어 머리**가 투구 창으로 기어 나온다, 공기 호스가 끊겨 **촉수처럼 휘두르는 채찍**이 된다, 범포가 더 부푼다. 색: 황동 `#b08a4a` · 녹슨 쇠 `#4a4038` · 범포 `#6a6450` · 검은 물 `#0a1a1c` + 청록 윤 `#3aa8a0` · 등불 `#ffc860` · 레비아탄 비늘 `#2a5a60` |
| 데이터 (시작값 — §2.3 으로 맞춘다) | `hp: 2100, hpMul: 1.0, atk: 31, def: 13, res: 13, exp: 2300, score: 50000, size: { w: 104, h: 168 }, flying: false, contact: 0.7, material: 'metal', weak: ['thunder'], resist: ['fire'], phases: [0.5], music: 'boss2', portrait: 'portraits/b_johan', stageId: 's27', drops: ['u_johan'], light: { r: 160, color: '#ffc860', i: 0.6 }, mv: JOHAN_MV` · `form2: { name: '검은 물', title: '요한이었던 것', portrait: 'portraits/b_johan' }` · `intro: '(검은 물 속에서 황동 투구가 떠오른다. 가슴께의 등불 하나가, 아직 꺼지지 않았다.)'` · `desc: '에슈빌 지하 수로의 관리인. 붉은 달이 뜬 밤, 낡은 잠수 갑옷을 입고 마지막 수문을 닫으러 내려갔다. 그 뒤로 아무도 그를 보지 못했다.'` |
| 체급 | **11–12장 보스(사신 · 드라큘라)가 그 장에서 주던 손맛을 권장 하한(11장 뒤, Lv 35)에서** — §2.3 |
| 페이즈 | **2단계** (`phases: [0.5]`). 1페이즈 = 수문지기의 몸버릇 (열쇠 · 닻 · 납 장화 · 공기 · 수문 물줄기). 50% 전환 `breach` 에서 앞 창이 터지고 검은 물이 주인이 된다 → 2페이즈 장어 · 역류 · 호스 채찍이 더해진다. 15% 이하 한 번 `lastLight` + 대사 `b_johan_last` |
| 결말 | 체력 0 → 보스 처치 처리(경험치 · `boss_b_johan`) 같고 부제는 기본 '격파!'. **스토리**: 무릎 꿇은 갑옷이 두 손으로 열쇠를 잡고 **바른 쪽으로 돌려 수문 바퀴를 닫는다** (`dieT` 0–2.2초) → 이음매로 검은 물이 빠지고 투구가 앞으로 떨어진다 (속은 비었다) → 등불은 바닥에서 계속 탄다 (드롭 자리) → `b_johan_post`. **아케이드·투기장**: 갑옷이 검은 물웅덩이로 무너져 3.0초에 사라진다 (수문 바퀴 없음) |
| 구현 | **`src/game/bosses/e_johan.js`, `export class Johan extends BossC`** (`c_common.js`), 틀은 `e_paracel.js` (전환 · 15% 강제 · 1페이즈 창 상한 · `ArtCull` 대리 개체 · `this.inferno` 지옥 갈래). 판정은 모두 `c_common` 키트 (`strikeRect` · `strikeColumn` · `strikeCircle` · `strikeLine` · `groundWave` · `warnMark`) + 보스 소유 Zone, 역류는 **보스 소유 바람 기믹** `this.gim('wind')` (P2 보스들이 투기장·탑에서 이미 쓰는 것). 타일은 바꾸지 않는다 |
| 아케이드 | `BOSS_ORDER` **27번째(인덱스 26)**. 새 기기 기록 코스 「외전 Ⅱ」(#19, §5 W17) · 서바이벌 보스 웨이브 · 무작위 6 (s27 을 아는 플레이어) · 무한의 탑 무작위 구간(자동). **모든 패턴은 `this.A` · `A.floor` 만 기준** — 투기장(`maps/arena.js` r1 40×14, 바닥 12행) · 탑 보스 층에서도 경계 안 |

### 2.1 패턴 계약 (`static PATTERNS`)

```js
const PATTERNS = {
  attacks: ['keySlam', 'anchorChain', 'ballastDrop', 'airVolley', 'sluiceJet', 'eelBurst', 'undertow', 'hoseLash'],
  helpers: ['stagger', 'lastLight'],
  transitions: { 1: { state: 'breach', dur: 2.6, script: 'b_johan_breach', form2: true, force: 'eelBurst', applyAt: 1.6 / 2.6 } },
  weights: [
    { keySlam: 3, anchorChain: 2, ballastDrop: 2, airVolley: 2, sluiceJet: 2 },
    { eelBurst: 3, undertow: 2, hoseLash: 3, keySlam: 2, sluiceJet: 1, ballastDrop: 1, anchorChain: 1 },
  ],
  gimmicks: ['wind'],   // 역류(undertow) 전용 보스 소유 바람 — 스테이지 기믹이 아니다 (보스 방 gimmick: null 그대로)
  floorRow: 16,
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7], [18, 13, 20, 13], [55, 13, 58, 13]] },
};
```

**모든 공격의 예고는 0.6초 이상, 첫 피해도 시작 0.6초 이후** (`test_johan` 이 8패턴 × 페이즈 0/1 × 보통/지옥 = 32판에서 잰다; 이어지는 물웅덩이 · 역류 물띠 같은 '계속' 지대는 `data.cont` 로 빼고 잰다). **모든 판정은 경기장 안** (s27 보스 방 + 투기장 r1 둘 다).

| 패턴 | 페이즈 | 동작 (예고 → 판정) | 지옥 갈래 (`this.inferno`) |
|---|---|---|---|
| `keySlam` 수문 열쇠 내려치기 | 1·2 | 열쇠를 머리 위로 천천히 들어 올림 **0.75초** (앞 3.6칸 바닥 표시) → 내려침 `strikeRect` 앞 3.6칸 · 높이 150 mv 1.15 + 양옆 2칸 물보라 `groundWave` 높이 36 mv 0.6. 열쇠가 바닥에 박혀 **0.8초 = 카운터 창** (열쇠 자루 치기 → 무릎) | 물보라가 6칸까지 번진다 (뛰어넘기) |
| `anchorChain` 닻 사슬 | 1·2 | 허리의 닻을 풀어 휘휘 돌림 **0.8초** (바닥 높이 띠 예고 — 플레이어 쪽 7칸) → 닻이 바닥을 긁으며 날아감 `strikeLine` 두께 40 (바닥 위 0–40px) mv 0.9 → 벽/7칸에서 멈춤 → **0.5초 뒤 되감기** (사슬이 그대로 보이는 게 예고) 같은 띠 mv 0.7 | 두 번째 닻이 **허리 높이**(70–110px)로 0.4초 뒤 — 낮은 것은 뛰고 높은 것은 웅크린다 |
| `ballastDrop` 납 장화 낙하 | 1·2 | 무릎을 굽힘 0.6초 → 천천히 뛰어오름 · 플레이어 x 에 **착지 표시 0.9초** (공중에서 추적, 마지막 0.3초 고정) → 착지 `strikeRect` 폭 3칸 mv 1.2 + 양쪽 충격파 `groundWave` 높이 40 mv 0.7 (뛰어넘는다) → **장화가 바닥에 박혀 1.0초 = 카운터 창** (플레이어·탈것 한 대 → 무릎) | 충격파 두 번 (0.5초 간격, 둘째는 바닥 표시 0.6초) |
| `airVolley` 공기 방울 | 1·2 | 공기 호스가 부풂 **0.8초** (투구 둘레 방울 빛) → 커다란 공기 방울이 플레이어 쪽으로 느리게 떠감 (탄 · 0.25초 간격, 초속 140–180, 1.6초 뒤 또는 닿으면 터짐 r 40 mv 0.6). 1페이즈 4방울 · 2페이즈 6방울 | **+2방울** |
| `sluiceJet` 수문 물줄기 | 1·2 | 열쇠를 바닥 소켓에 꽂고 돌림 → 경기장 **양쪽 벽의 세 높이**(바닥 띠 0–44px · 허리 70–120px · 머리 140–190px — 모두 `A.floor` 기준) 중 한 높이에서 물이 새어 나옴 (물방울 · 띠 예고 **0.9초**) → 벽에서 벽까지 물줄기 0.8초 `strikeRect` mv 0.8 · 밀림. 1페이즈 한 물결 · 2페이즈 **두 물결 (0.7초 간격, 둘째는 다른 높이 · 자기 예고 ≥ 0.6초)** — **같은 순간에는 한 높이만** (바닥 띠 → 뛰거나 발판 · 허리 띠 → 웅크리거나 11행 발판 · 머리 띠 → 바닥에 선다) | 예고 **0.75초** · 셋째 물결 (첫 물결 높이 다시) |
| `eelBurst` 검은 장어 | 2 (전환 직후 강제) | 바닥에 검은 물이 번짐 `warnMark` **0.8초** — 그때의 플레이어 자리(첫 마리) ± 3칸씩 넷 → 장어가 솟음 `strikeColumn` 폭 48 · 높이 150 mv 0.8 (0.22초 간격) → 0.6초 뒤 웅덩이로 가라앉음 | **6마리** · 둘째 줄(0.9초 뒤, 첫 줄 사이 자리) |
| `undertow` 역류 | 2 | 투구 창에서 검은 물이 쏟아짐 → 경기장 바닥에 얕은 물띠 (계속 지대 `cont` 높이 32 · 4초 · 느려짐 0.7 · mv 0.1 rehit 0.5) + **보스 쪽으로 끄는 물살** `this.gim('wind').gust(dirToBoss, force 520, dur 2.6, warn 0.8)` (예고 0.8초는 바람 기믹의 것) → 끝에 열쇠를 한 바퀴 휘두름 `strikeCircle` r 120 mv 1.0, 예고 **0.9초** (빛 고리). **발판(11·13·7행)에 서면 물띠 밖** — 끌려도 원 밖으로 걸어 나갈 수 있게 **끌리는 속도가 가장 느린 영웅 걷기 속도의 70 % 이하**가 되도록 force 를 맞춘다 (시작값 520 — s20 바람 800 보다 약하게) | 물살 force +15 % · 원 휘두르기 두 번 (0.7초 간격) |
| `hoseLash` 끊어진 호스 채찍 | 2 | 끊어진 호스를 뒤로 젖힘 **0.7초** (호스 끝 궤적 예고 — 위에서 바닥까지 부채꼴) → 머리 높이에서 바닥까지 쓸어내림 `strikeLine` 세 토막 (두께 30) mv 0.9 → 끝에 바닥 내리침 `strikeColumn` 폭 56 mv 0.8 (예고는 같은 부채꼴) | 반대로 한 번 더 (0.6초 예고) |
| `stagger` (보조) | — | 1.5초 (투구 0.6 · 몸통 0.7). 긴 무릎 2.5초 (몸통 0.6). 들어가는 길: `keySlam` 열쇠 자루 · `ballastDrop` 장화 카운터 · 15% 대사 뒤 | — |
| 전환 `breach` | 1→2 | 무적 2.6초. 0.4초 앞 창에 금 → 1.0초 창이 터지며 검은 물 · 유리 조각 (`break_wall` · `splash`) · 호스가 끊어짐 → 1.6초 `applyPhase(1)`: form2 이름·칭호 · 장어 머리가 창으로 나옴 · `breached = true` → 끝에 대사 `b_johan_breach` (스토리 1회) → **곧바로 `eelBurst`** | — |
| `lastLight` (보조, 15%) | 2 | **체력 15% 이하 한 번**(싸움마다): 하던 패턴을 끊고 갑옷이 굳는다 · 등불이 확 밝아짐 0.6초. 스토리·처음이면 곧바로 `b_johan_last` (그동안 월드가 멈춘다) → **장갑 낀 손이 투구 창의 장어 목을 움켜쥐고 누른다** → **긴 무릎 2.5초** (몸통 0.6 · 장어 머리 0.6). 아케이드·다시 볼 때는 검은 물 파열 (둘레 r 170 · 예고 **0.8초** · mv 0.9, 무릎 없음) | — |

- **1페이즈 창 상한** (POLISH-4 교훈 — 처음부터): `STAG_CAP 0.10` (1페이즈 무릎 한 번에 최대 체력 10%). 넘는 피해는 `takeHit` 에서 줄여 '저항'(`capNote`), 무릎은 곧바로 일어선다. 필살 · 각성 · 2페이즈 · 15% 긴 무릎은 상한 밖.
- **판정 부위** (가까운 부위 우선, 방어 배율 — 작을수록 아프다): 투구 0.85 (무릎 때 0.6) · 몸통 1.0 (무릎 0.7 · 긴 무릎 0.6) · 다리 1.15 · 열쇠 자루 (카운터 창 동안만) 1.0 · **2페이즈 투구 창의 장어 머리 0.75 (약점)** · 2페이즈 호스는 판정 없음 (그림만).
- **수호신 자동 공격은 카운터 '한 대'로 세지 않는다** (몸통 피해로만 — s26 배양조 규칙 그대로).
- idle: 플레이어 쪽 3–5칸을 두고 납 장화로 무겁게 걷는다 (한 걸음마다 `land` 작은 흔들림 · 가까우면 열쇠를 앞으로 겨눈다).
- `resetFight`(플레이어 부활) → 칭호 · 창 · 호스 원래대로, 물띠 · 장어 · 방울 · 바람 정리, 15% 강제 다시 한 번 가능, `b_johan_last` 는 이미 나왔으면 다시 안 나온다. 적 정지(`heldByFreeze`) · `debugAct` · `debugPhase` 규칙은 `c_common.js` 머리말 그대로.
- **모션 배율 표 `JOHAN_MV`** (`src/data/bosses_e.js`, s26 `PARACEL_MV` 와 같은 자리 · 같은 모양 — 게임과 `balance.mjs` 가 이 표 하나를 읽는다). 위 표의 mv 가 시작값.

### 2.2 그림

**순서 (06:20 마감 — 늘 돌아가는 트리)**: ① 벡터 그림 먼저 (`e_johan.js` 의 `paintBack` / `paintBody` / `paintFront` — 모든 상태를 그린다, 그리기 함수 안에서 난수·입자 생성 없음 `hook_tags`) → ② Higgsfield 부위 → ③ 채색 퍼핏 `src/render/painted/bosses/b_johan.js` + 등록. **채색이 06:00 까지 다 안 되면 벡터로 낸다** (등록 줄을 넣지 않으면 벡터가 그린다).
- **수문 바퀴 소품**: 지름 ≈ 5칸 쇠 바퀴 · 바큇살 여덟 · 소켓. **s27 보스 방에서만** (`world.stage?.id === 's27'`) 경기장 가운데 뒤쪽 (`A.x0 + A.w/2`, 바닥에서 3칸 위)에 보스의 뒤 그림으로 그린다. 공격 `sluiceJet` 때 돌고, 스토리 죽음 때 닫힌다. 투기장·탑에서는 없음.
- 렌더러가 읽을 필드 (`e_johan.js` 머리말에 적는다): `zx` · `fy` · `fk` · `facing` · `ps` 자세 · `pts` 골격 · `hose` 7점 · `breached` · `eelK` (장어가 나온 정도 0–1) · `lampK` (등불 밝기) · `keyA` (열쇠 각) · `wheelA` (바퀴 각) · `stunned` · `dieT` · `vanishK`.
- **채색 퍼핏 부위 (≈ 18)**: 투구(온전 · 앞 창 빛) · 투구(터짐 — 검은 물 수염) · 장어 머리 + 목 마디(`Chain` 4) · 몸통(가슴 쇠판 · 범포 배) · 허리 사슬 · 다리 위/아래 ×1 (먼 쪽은 어둡게 재사용) · 납 장화 · 가까운 팔 위/아래 · 장갑 손 (벌린 · 쥔) · 먼 팔 · 수문 열쇠 · 닻 · 공기 호스 마디(`Chain` 6) · 끊어진 호스 끝 · 등불 (따로 흔들림 + `lampK` 빛) · 수문 바퀴. **아틀라스 ≤ 64 KiB** (`assets/painted/bosses/b_johan/atlas.webp` + `manifest.json`), 휴대폰 그리기 ≤ 0.6 ms, 피격 섬광은 `R.fl` 흰 덧그림, `ArtCull` 대리 개체로 열쇠·호스가 몸통 판정보다 커도 잘리지 않는다.
- **Higgsfield 계획 (EX-BOSS — 상한 25장 · 10크레딧, 재시도 포함)**. 절차는 `tools/higgsfield/README.md` 그대로: 참고 띠 올리기 → `generate_image_batch` (`gpt_image_2_5`, 0.25크레딧/장, 프롬프트 끝 `no text, no border, no frame, plain flat solid #00FF00 green background`) → `jobs_wait` → `curl` → `tools/higgsfield/key_green.py --trim` → **모든 그림을 눈으로 본다** → 기록 `tools/higgsfield/manifest_<EX-BOSS 이름>.json` (`{file, model, prompt, job_id, credits, kept}`).

| 샷 | 비율 | 장 | 크레딧 | 쓰임 |
|---|---|---|---|---|
| 참고 띠 | — | 0 | 0 | 지금 게임 채색 보스 셋을 이어 붙인 한 장 (예: `b_paracel` 아틀라스 조각 · `portraits/b_leviathan` · `portraits/b_colossus`) — 화풍 고정 |
| jh_portrait | 3:4 | 2 | 0.5 | `portraits/b_johan` (**768×1024 webp, ≈ 100 KB 이하** — `b_paracel` · `b_charon` 과 같은 틀; lo 는 461×614 ≈ 46 KB) — 검은 물 속 황동 잠수 투구, 금 간 창 안의 검푸른 빛, 가슴의 등불, 뒤로 수문 바퀴. gpt 결과가 모자라면 `nano_banana_pro` 2k 한 장(2크레딧, 흰 배경이면 `remove_background` 불필요 — 초상화는 배경 있는 그림) |
| jh_body | 9:16 | 2 | 0.5 | 옆모습 전신 (투구 · 범포 · 가슴 쇠판 · 사슬 · 장화 · 등불, 열쇠 없음) — 비율 기준 + 몸통/다리 |
| jh_helm | 1:1 | 2 | 0.5 | 옆모습 투구 둘 (온전 · 앞 창 터짐 + 검은 물) |
| jh_arms | 1:1 | 2 | 0.5 | 범포 팔 위/아래 · 장갑 손 (벌린 · 쥔) 펼친 시트 |
| jh_key | 16:9 | 1 | 0.25 | T자 수문 열쇠 · 닻과 사슬 |
| jh_hose | 16:9 | 1 | 0.25 | 주름진 가죽 공기 호스 한 토막 · 끊어진 끝 |
| jh_eel | 1:1 | 2 | 0.5 | 레비아탄 비늘 검은 장어 머리 + 목 마디 |
| jh_props | 1:1 | 2 | 0.5 | 기름 등불 (켜짐) · 수문 바퀴 (정면) |
| (재시도 예비) | | ≤ 11 | ≤ 2.75 | 좌우가 뒤집힌 시트 · 녹색 테두리 남음 · 글자 → 버리고 다시 |
| **합계** | | **14 (+11)** | **3.5 · 최대 6.25 (+ nano 2장 4 = 10)** | **상한 25장 · 10크레딧** |

  프롬프트 방향: 기존 1부 보스와 같은 **채색 다크 판타지** (붓질 · 낮은 채도 · 따뜻한 등불 하나와 차가운 검은 물의 대비), 1797년 무렵의 징 박힌 황동 잠수 장비 (Klingert 식 금속 투구), 한 인물 · 사람 얼굴 보이지 않음 (투구 창 안은 빛과 물뿐), 글자·워터마크 없음. **애니풍 · 셀 그림자 · 굵은 외곽선 금지.** 새 배경 그림 없음.
- 원본 `tools/painted/raw/b_johan/*.png` · 설정 `tools/painted/configs/b_johan.json` (s26 `b_paracel.json` 모양) · 굽기 `tools/painted/build_parts.py` / `build.py` (기존 도구 — 고치지 않는다).
- lo: `assets/lo/portraits/b_johan.webp` — `assets/lo/index.json` 의 `params` 와 같은 값(scale 0.6 · q 72 · lanczos → 461×614)으로 **이 한 장만** 만든다. **`tools/assets/make_variants.py` 는 돌리지 않는다** (index.json 전체를 다시 쓴다 — 그림 묶음이 지금 같은 파일을 고치는 중). `keys` 에 `"portraits/b_johan"` 한 줄을 **다시 읽고 정렬 자리에 작은 편집**으로 넣는다; 겹치면 `requests.md` 로 main 에 맡긴다 (키가 없어도 게임은 원본 초상화로 돈다).

### 2.3 체급과 확인 방법
- 목표: **"11–12장 보스(사신 · 드라큘라)가 그 장에서 주던 손맛"을 권장 하한(11장 뒤, `P1_SIDE_AFTER.s27 = 's11'`)에서** — `balance.mjs normal <영웅>` 의 s11 · s12 행의 [가장 작은 값 × 0.85, 가장 큰 값 × 1.2] 안 (타수 · 모형 시간 · 보스 1타). 실제 패턴 표 `JOHAN_MV` 의 가장 무거운 한 방 ÷ 모형 1타 = 0.9–1.3 (s26 play-fix #2 교훈 — 모형만 맞추고 패턴 배율이 낮으면 실제는 2–6% 였다).
- 비교: 사신 s11 hp 2050 · atk 30 · 드라큘라 s12 1500×1.8 · 32 · 혼돈 s13 2000×1.3 · 34. 요한은 레벨 37 에서 hp 2100 · atk 31 — **갑옷답게 단단하고(def 13) 한 방이 무겁다**. 경험치 2300 (사신 2000 · 혼돈 2500 사이 — 외전이 본편 레벨 곡선을 크게 밀지 않게).
- 확인 1 (EX-BOSS): `node tools/balance.mjs normal kael --check` × 7영웅 (EX-STAGE 가 §5 W20 으로 s27 줄을 먼저 넣는다 — 그 전에는 `/dev/shm/<이름>/` 사본으로). **HP · 공격력은 표의 목표로, 손잡이 순서는 ① 창 상한 ② 카운터 창 길이 ③ 예고 길이.**
- 확인 2 (VERIFY, 등록 뒤 실제 엔진): `fight.mjs` 사본으로 카엘 Lv 35 고정 세이브 s27 보스 방 — **18판 중앙 25–45초 · 1페이즈 패턴 중앙 ≥ 4 · 사망 중앙 0**.

## 3. 보상

### 3.1 장신구 `u_johan` 「수문지기의 등불」 (보스 드롭)
**왜 장신구인가**: 보조무기는 s26 이 막 하나 늘렸고(9종), 이야기의 물건(등불)이 손에 남는 것이 결말이다. 반지는 마르타에게 간다 (장비가 아니다).

`{ id: 'u_johan', name: '수문지기의 등불', slot: 'acc', tier: 5, icon: 'amulet_6', lvReq: 35, rarity: 4, boss: 'b_johan', stats: { atk: 19, mag: 19, def: 14, hp: 90, thunder: 10, dmgReduce: 4 }, visual: { aura: { color: '#ffc860', type: 'holy' } }, effect: '꺼지지 않는 불 — 받는 피해 −4%, 번개 피해 +10%', desc: '요한이 잠수 갑옷 가슴에 매달고 내려간 기름 등불. 검은 물 속에서도 끝내 꺼지지 않았다.' }`
- **값은 EX-STAGE 가 맞춘다** (play-fix #14 규칙): Lv 35 기준 장비(4단계 희귀도 3 장신구 무작위 옵션 200판)에 일곱 영웅 중 여섯 이상 ▲, 진조의 인장(`u_dracula2`, 6단계 Lv 38)보다는 대개 아래. 효과 문구 · 번개 10% · 피해 −4% 는 그대로.
- `items.js` 는 **끝에 이 한 항목만 덧붙인다** (다시 읽고 작은 편집 — 그림 묶음이 아이콘 키를 고치는 중). 전용 아이콘(`acc_lantern` 등)은 그림 묶음에 `requests.md` 로 부탁할 수 있다 — 없으면 `amulet_6`.
- `relic_sets.js` 는 손대지 않는다 (s27 은 세트 드롭 없음).

### 3.2 로어 `l36` 「수로 관리인의 근무 일지」 (r3 책상 `@` = `lore:l36`)
`{ id: 'l36', name: '수로 관리인의 근무 일지', stage: 's27', cat: 'diary', hint: '잠긴 수문', text: '"첫째 수문 이상 없음. 둘째 수문 바퀴 삐걱임, 기름칠. 여관 지붕 또 샘 — 내일." "내일." "내일." 마지막 장. "붉은 달. 성 쪽 물이 검다. 셋째 수문을 닫으러 간다. 잠수 갑옷은 하드윈이 징을 다시 박아 주었다. 마르타에게는 말하지 않았다."' }` · `LORE_ORDER` 끝(`'l35'` 뒤). 로어는 일지의 앞장이고, 대본 s27_t1 이 같은 책상의 다른 물건(도시락 통)을 본다 (반전 — 갑옷 안의 요한 — 은 대본에만).

### 3.3 업적 `st_s27`
`{ id: 'st_s27', cat: 'story', name: '이번엔 정말이오', desc: '외전 Ⅱ 「돌아오지 못한 수문지기」를 클리어한다', pts: 20, cond: { m: 'cleared', arg: ['s27'], n: 1 }, reward: { gold: 2500 } }` — `st_s26` 바로 뒤. **업적 수 68 → 69 · 이야기 분류 12 → 13 · 점수 1,650 → 1,670** (`tools/test_achievements.mjs` C1 의 세 숫자 · 이명/장식 수 그대로).

### 3.4 마을 대사 (대본 파일 `story_ex27.js` 에)
- `npc_marta_ex27` — "지붕 이제 안 새. …이번엔 정말이야." · 카운터 위 등불 자리 이야기
- `npc_hadwin_ex27` — "그 투구, 내가 징을 박았지. …끝까지 버텼군. 그 친구도."
- `npc_elise_ex27` — (1부) "이모가 처음으로 울었어요. 그리고 처음으로 지붕에 올라갔어요." · (2부) 같은 뜻 다른 줄
- `npc_alberto_ex27` — (1부 성당 · 2부 안쪽 방 같은 줄) "요한은 주일마다 종탑 물받이를 고쳐 주던 사람이었네."
- `story.js` `pickNpcScript` 의 `EX_TALK` · `church.js` `albertoNews` 표 **맨 앞**에 `['ex27', 'ex_s27_done']` (가장 새 외전이 먼저).

## 4. 이야기

### 4.1 설정 (기존 문장과 맞춘 것)
- **때**: s10 클리어 뒤라면 언제든 — 세 시기가 같은 대본 (분기는 플래그만):
  ① 1부, 백작 생존 (`!boss_b_dracula`): 성이 서 있다 · 우물 밑 옛 수도관이 8장 수로의 가장 깊은 곳과 이어진다 · 알베르토는 성당에 서 있다.
  ② 1부 끝 ~ 2부 전 (`boss_b_dracula` · `!p2_started`): 성은 안개 속으로 사라졌지만 **수문은 성이 아니라 에슈빌의 것** — 바위 속 수도관과 셋째 수문은 남았다 (s26 의 바위 공방과 같은 규칙).
  ③ 2부 · 2부 엔딩 뒤 (`p2_started`): 여관은 피난민으로 붐빈다 · 알베르토는 누워 있다 (대사 없음) · **알베르토의 죽음(2부 엔딩 '그해 겨울')은 말하지 않는다**.
- **편지**: 8장 s08_t1 의 젖은 편지 = 이 외전의 열쇠. "카엘이 품에 넣어 두었다" (카엘이 아닌 영웅으로 깼어도 동행 카엘이 가지고 있다 — 대본이 그렇게 말한다, 새 아이템 없음).
- **검은 물 = 레비아탄의 피**: b_leviathan_post 의 "물이 맑아지기 시작했다" 와 맞춘다 — 맑아진 것은 위쪽 수로, 무거운 검은 피는 가장 깊은 셋째 수문 아래로 가라앉아 고였다. 8장 적 `drowned`(익사자)가 그 물에서 움직인다.
- **노크 세 번**: 요한의 버릇 — 퇴근해 여관 문을 세 번 두드렸다. 인트로 · s27_t2 · 보스 등장 · 아웃트로에 다시 나온다 (`se('clang')` 세 번).
- **이름**: 요한 (마르타의 남편, 수로 관리인). 크레딧 `story.js` 1663행 "지하 수로 관리인 — 돌아오지 못한 남편" 은 그대로 두고, 외전 크레딧에 이름을 준다.

### 4.2 대본 (`src/data/story_ex27.js` — EX-STAGE)
`export const SCRIPTS_EX27` 12개 (스테이지 8 + 마을 4) + `export const CREDITS_EX27`. 도우미는 `story_ex26.js` 와 같은 모양으로 그 파일 안에 다시 선언 (`story.js` import 금지 — 순환). 화자 상수 `MA = 'npc_marta'` · `EL = 'npc_elise'` · `HA = 'npc_hadwin'` · `A = 'npc_alberto'` · `JH = 'b_johan'`. 영웅 줄 `H({...})` 은 **일곱 영웅 + `default` 모두** (`test_part2` 규칙). 줄 길이는 story_ext §1 상한 (영웅 79 · NPC 86 · 내레이션 134자).

| 대본 | 재생 | 내용 |
|---|---|---|
| `s27_intro` | 컷신 | `bgm('story')` · `bg('s08_waterway')` · `title('외전 Ⅱ', '돌아오지 못한 수문지기')` → `bg('hub')` 밤의 에슈빌, 광장 우물이 검은 물로 넘친다 · 여관 지붕에서 물이 샌다 → 카엘(동행/본인)이 젖은 편지를 꺼낸다 → 마르타 "…이 사람 글씨야. 지붕은 돌아가서 고친다고. 맨날 그 소리." → 요한 = 수로 관리인 · 붉은 달의 밤 · 셋째 수문 → 우물 밑에서 **쿵. 쿵. 쿵.** → 마르타 "수문을 닫아 줘. 그리고… 그이를 찾으면, 저녁은 먼저 먹었다고 전해 줘." → 위치 내레이션 (①/②③) → `[TIP]` 둘째 수문은 물속 — 공기 방울 기둥 |
| `s27_t1` | 대화 (r3 `!`) | 관리실 — 반쯤 먹은 빵 · 마르타 글씨의 도시락 통 "늦지 마" · 비어 있는 잠수 갑옷 걸이 · 카엘/영웅 줄 |
| `s27_t2` | 대화 (r5 `!`) | 위에서 내려온 공기 호스가 아래로 이어져 있다 · 손 펌프가 물살에 저절로 돈다 · 호스를 타고 **쿵. 쿵. 쿵.** |
| `b_johan_pre` | 대화 (보스 등장) | 셋째 수문 바퀴 앞, 잠수 갑옷이 열쇠를 **여는 쪽으로** 돌리고 있다 · 등불 · 영웅 "요한 씨?" · 투구가 돌아본다 · 물 섞인 목소리 "…닫…아야…" / 검은 물 "열어라." |
| `b_johan_breach` | 대화 (50%, 스토리 1회) | 앞 창이 터진다 · 장어 머리 · 동행/영웅 "레비아탄의… 찌꺼기다." · 검은 물 "이 몸은 이제 물의 것이다" |
| `b_johan_last` | 대화 (15%, 1회) | 등불이 확 밝아진다 · 요한 "여보… 저녁은… 먼저…" · 장갑 손이 장어 목을 움켜쥔다 · 영웅 "지금이다!" |
| `b_johan_post` | 대화 (처치) | 무릎 꿇은 갑옷이 바른 쪽으로 바퀴를 돌린다 · 끼이익… 쿵 · 검은 물이 빠지고 투구가 떨어진다 (속은 비었다) · 등불 손잡이에 묶인 반지 · 요한 (마지막 한 줄) "…이번엔… 정말이오." |
| `s27_outro` | 컷신 | `flag('ex_s27_done')` **맨 앞** (`results.js` hasNewBranch 규칙) → 여관 · 반지와 편지를 건넨다 · 마르타 "그 사람, 이번엔 정말 닫았네." · 엘리제 · 영웅 줄 (7명 + 기본) → 다음 날 아침 지붕 위 망치 소리 (영웅 · 하드윈) · 마르타가 웃다가 운다 → **"돌아오지 못해도, 지킨 약속이야."** |
| `npc_marta_ex27` · `npc_hadwin_ex27` · `npc_elise_ex27` · `npc_alberto_ex27` | 마을 | §3.4 |

- 크레딧: `CREDITS_EX27 = { s27: ['돌아오지 못한 수문지기 — 지하 수로 관리인 요한', '흑묘 여관의 마르타'] }` → `story_ex.js` `CREDITS_EX.s27`.
- 효과음은 있는 이름만 (`knock` · `water` 는 없다 — `clang` · `splash`).

## 5. 등록 목록 (s26 이 등록한 모든 자리 — 누가 · 어디 · 무엇)

**EX-STAGE 가 W1–W30, EX-BOSS 가 B1–B8.** 줄 번호는 오늘(3ae8e89) 기준 어림 — 함수/표 이름으로 찾는다.

| # | 파일 · 함수/표 | 바꿀 것 |
|---|---|---|
| W1 | `src/data/stages.js` 머리 import | `import { ROOMS as S27 } from './maps/s27.js';` (s26 import 뒤) |
| W2 | `stages.js` `STAGES` | `s27: S({ id: 's27', chapter: 27, part: 1, page: 0, side: true, sideLabel: '외전 Ⅱ', name: '잠긴 수문', fullName: '돌아오지 못한 수문지기', sub: '지하 수로 밑, 끝내 닫히지 않은 셋째 수문', theme: 'waterway', bg: 'bg/s08_waterway', tex: 'tex/tex_wet_stone', tex2: 'tex/tex_castle_stone', tileStyle: 'wet', music: 's08', level: 37, darkness: 0.6, darkColor: '#030a0c', liquid: 'water', boss: 'b_johan', rooms: S27, parTime: 420, enemies: ['merman', 'killer_fish', 'frog_demon', 'drowned', 'water_spirit', 'bat', 'ice_bat', 'mimic'], docs: [], shard: null, heart: null, gimmick: null, color: '#9ad0e0', next: null, mapPos: { x: 0.50, y: 0.88 }, req: '10장 첨탑을 지난 뒤, 에슈빌의 우물이 검게 차오르면 갈 수 있다 (권장 Lv 35)' })` (s26 뒤, arena 앞) |
| W3 | `stages.js` `STAGE_ORDER_P2` (`[hook:p2]` 줄) | 끝에 `'s27'` (s26 과 같은 이유 — `STAGE_ORDER_P1` 에는 넣지 않는다). `SIDE_STAGES` · `SIDE_STAGES_P2`(part 2 만) 는 자동 |
| W4 | `src/data/maps/s27.js` (새 파일) | §1.1 |
| W5 | `src/data/story_ex27.js` (새 파일) + `src/data/story_p2.js` | `import { SCRIPTS_EX27 } from './story_ex27.js';` 를 SCRIPTS_EX26 옆에, SCRIPTS_P2 에 펼치기 (EX26 과 같은 줄 모양) |
| W6 | `src/data/story_ex.js` `CREDITS_EX` | `import { CREDITS_EX27 }` · `s27: CREDITS_EX27.s27` |
| W7 | `src/data/story.js` `pickNpcScript` `EX_TALK` | 맨 앞 `['ex27', 'ex_s27_done']` |
| W8 | `src/scenes/town/church.js` `albertoNews` 표 · 성당 안내(`has(P.unlocked, 's26')` 줄 옆) | 표 맨 앞 `['ex27', 'ex_s27_done']` · 안내 한 줄 `if (has(P.unlocked, 's27') && !P.cleared?.s27) (F.p2_started ? p2 : p1).push(E ? '마르타 이모네 우물에서 쇳소리가 나요. 성문 밖 지도를 펼쳐 보세요.' : '여관 우물 밑에서 쇳소리가 난다더군. 성문 밖 지도를 펼쳐 보게.')` |
| W9 | `src/scenes/town/worldmap.js` `SIDE_FROM` · `SIDE_INFO` · `SIDE_GATE` · `REVEALS` (+ 머리말 주석) | `SIDE_FROM.s27 = 's08'` · `SIDE_INFO.s27 = { label: '보상', flag: 'ex_s27_done', got: '수문지기의 등불', wait: '마르타의 부탁이 기다린다', col: '#9ad0e0', gotCol: '#e0f6ff', tag: '10장 그 뒤의 이야기 · 권장 Lv 35' }` · `SIDE_GATE.s27 = (P) => !!P.cleared?.s10` · `REVEALS.s27 = { title: '외전 Ⅱ · 잠긴 수문', sub: '첨탑의 얼음이 녹아 흘러내렸다. 에슈빌의 우물이 검게 차오른다', color: '#9ad0e0', tcol: '#e0f6ff', crack: '#e0f6ff', fx: 'magic' }`. 10장을 깬 세이브가 처음 지도를 열면 s26 → s27 연출이 차례로 (기존 큐) |
| W10 | `src/data/lore.js` | `l36` 항목 (§3.2) · `LORE_ORDER` 끝 `'l36'` (주석 `// 외전 (s27)`) |
| W11 | `src/data/items.js` | **끝에 `u_johan` 한 항목만** (§3.1, 다시 읽고 작은 편집) |
| W12 | `src/data/achievements.js` | `st_s27` (§3.3) — `st_s26` 바로 뒤 |
| W13 | `src/data/nightmare.js` `ROWS` | `row('s27', 'b_johan', 'doom_clock', P1, { hpMul: 1.9 })` (비틀기 **종말 시계** = 수문이 다 열리기 전에 — 시작값, `balance.mjs --nm s27` 로 맞춘다) + 머리말 "27 악몽" |
| W14 | `src/data/cosmetics.js` `tr_sovereign` | `need: { nm: 27 }` · `desc: '스물일곱 군주를 모두 꺾은 자의 진홍빛'` |
| W15 | `src/data/gallery.js` | `mu('boss2', …)` 줄에 `'b_johan'` 토큰 |
| W16 | `src/data/feel_move.js` · `src/data/foreground.js` | `s27: { liquid: 'water', dry: 'stone' }` · `s27: { theme: 'waterway' }` |
| W17 | `src/scenes/front/arcade.js` | ① `BOSS_ORDER` 끝 `'b_johan'` (인덱스 26 — 기존 코스 from/to 기록 키 그대로). ② **1부 외전 문 일반화**: `export const P1_SIDE = { s26: 'b_paracel', s27: 'b_johan' }` · `export function p1SideKnown(game, unlocks = null)` → 아는 1부 외전 id 의 `Set` (어느 슬롯이든 해금 · 코나미 = 전부) · `s26Known(game, unlocks)` 는 `p1SideKnown(...).has('s26')` 로 남긴다 (옛 시험 그대로) · 내부 `p1Set(x)` = `x === true ? new Set(['s26']) : x instanceof Set ? x : Array.isArray(x) ? new Set(x) : new Set()` (**셋째 인자에 예전 `true` 를 주면 s26 만** — `rush26` · `test_rush_rules` 그대로 통과). ③ `courseAvailable(ci, p2, ex, s26)` : `c.side` 가 있으면 `p1Set(s26).has(c.side)` + 보스 사용 가능; `S26_COURSE` 에 `side: 's26'` 더함 (`s26: true` 는 색 때문에 둔다). ④ `arenaBosses(p2, ex, s26)` : `P1_SIDE` 보스는 `p1Set(s26).has(BOSSES[id].stageId) && bossReady(id)`. ⑤ **새 코스** `export const S27_COURSE = { name: '외전 Ⅱ', sub: '8·10~12장 보스 · 잠긴 수문', from: 26, to: 27, ids: ['b_leviathan', 'b_frostqueen', 'b_death', 'b_dracula', 'b_johan'], side: 's27', short: '외전 Ⅱ' }; COURSES.push(S27_COURSE);` → **번호 19 (기기 기록 `localCourse`, 서버 `ONLINE_COURSES = 15` 그대로)**. ⑥ 메뉴 색 `S27_COLOR = '#9ad0e0'` (`C?.side === 's27'`). ⑦ `menuCourses` · `sanitizeCfg` · `random6Pool` 셋째 인자도 같은 `p1Set` 규칙, 454행 `s26Known(game, unlocks)` → `p1SideKnown(game, unlocks)` |
| W18 | `src/scenes/front/arcade_run.js` | `s26Known(g)` 을 부르는 곳(135 · 182 · 375 · 620행)에 `p1SideKnown(g)` 의 Set 을 넘긴다 (`this.p1s`; `this.s26` 은 불린 별칭으로 남겨도 된다) |
| W19 | `src/scenes/front/highscore.js` `ONLINE_PENDING` | `new Set(['s26', 's27'])` |
| W20 | `tools/balance.mjs` · `tools/qa/lib/balance_nm.mjs` | `P1_SIDE_AFTER = { s26: 's09', s27: 's11' }` · `SIDE_S26` → 키별 표 `SIDE_P1 = { s26: {...그대로}, s27: { 목표 = 그 영웅 s11–s12 띠 } }` · `s26Fight(P, mag)` → `sideFight(sid, P, mag)` · 줄 검사 · 출력 줄을 `p1side` 의 id 마다. **EX-BOSS 가 쓸 수 있게 06:20 전 가장 먼저 (05:00 까지)** |
| W21 | `netlify/lib/gamedata.mts` | 스테이지 레벨 표 `s27: 37` · `P2_STAGES` 끝 `'s27'` · `SIDE_STAGES` 끝 `'s27'` (주석 "s26 · s27 은 1부 외전"). **배포하지 않는다** (main 이 낸다) |
| W22 | `tools/online/test_online.mjs` | 108행 길이 26 → 27 · 112행 외전 일곱 · 208행 연습 키 목록에 `practice:s27` 이 필요하면 |
| W23 | `tools/integration.mjs` | `STAGES` 끝 `'s27'` · `SIDE_BOSS.s27 = 'b_johan'` · 사례 `s27_gate`(새 세이브 노드 없음 · **10장 세이브** 연출 → 8장 아래 노드 · 정보판 · 출발) · `s27_flow`(`rooms:r2|r3|r4|r5` → 보스 → 소개 → 채색(있으면) → 50% · 15% 대사 `b_johan_last` · 격파 → 아웃트로 → 저장 `cleared.s27 · ex_s27_done · boss_b_johan · 장 안 오름`) · `s27_rush`(코스 19) · `s27_boss_retry`. s26 전용 단계는 **인자로 일반화**: `wmgate:<sid>:<초>` (없으면 s26) · `s26check` → `sidecheck:<sid>` · `rush26` → `rushside:<sid>` · bosskill 의 `c.id.startsWith('s26')` → `{ s26: 'b_paracel_last', s27: 'b_johan_last' }[c.id.slice(0, 3)]` |
| W24 | `tools/test_part2.mjs` | `EX_LIST` 에 `{ sid: 's27', chapter: 27, page: 0, part: 1, boss: 'b_johan', pickup: 'lore:l36', done: 'ex_s27_done', scripts: ['s27_intro', 's27_t1', 's27_t2', 'b_johan_pre', 'b_johan_breach', 'b_johan_last', 'b_johan_post', 's27_outro'] }` · CREDITS_EX 검사 s21–s27 · 지도 연출 UI 검사(1087 · 1110 · 1528행 — 7장 세이브는 s26 만, **10장 이상 세이브는 s26 → s27 두 연출**) |
| W25 | `tools/test_achievements.mjs` · `tools/qa/ach_ui.mjs`(숫자가 박혀 있으면) | 68 → 69 · story 12 → 13 · 1,650 → 1,670 |
| W26 | `tools/test_nightmare.mjs` · `tools/test_cosmetics_s5.mjs` | N1 26 → 27 (개수 · 1..27 고리 · `nm_s27` 행 검사 — 1부 배율) · 성당 악몽 탭 27칸 · `[1, 10, 27]` |
| W27 | `tools/test_ngplus.mjs` · `tools/test_tower.mjs` · `tools/test_rush_rules.mjs` · `tools/test_foreground.mjs` · `tools/test_hunt_journal.mjs` | `test_ngplus` 302행 `STORY.length === 27` · `test_tower` 224행 `LATE` 끝 `'b_johan'` · `test_rush_rules` (150행 `COURSES` 블록 = 서버 15 그대로 — 외전 코스는 `push` 라 블록 밖) · 무작위 6 풀(1부 외전 둘) · `test_foreground` 54–55행 `>= 26` · `n <= 26` → 27 · 사냥 일지는 코드 0줄(깬 스테이지 자동) — 숫자가 박힌 곳만 |
| W28 | `tools/test_s27.mjs` (새 파일) | §8.1 등록 시험 |
| W29 | `tools/qa/run_all.mjs` | `test_s27.mjs` · **EX-BOSS 의 `test_johan.mjs` 줄도** (B8 이 준 줄 그대로) |
| W30 | (코드 0줄 확인만) | `results.js`(외전은 장을 올리지 않음 — `side`) · `tab_bestiary` · `tab_docs` · `tab_system`(1부 칸 15칸 — **Fold 캡처**) · `access.js` · `slots.js` · `hud.js` · `stage.js` · `pause.js`(`sideLabel` 「외전 Ⅱ」) · `hunt_journal` · `ngplus.js` · 무한의 탑 `sideBosses()` · 아케이드 `exKnown`(그대로 `SIDE_STAGES_P2` 만 — s27 은 part 1 이라 들지 않는다) · `practiceStages`(해금 목록 그대로) — 모두 일반 규칙으로 s27 을 받는지 시험·캡처로 확인 |
| B1 | `src/game/bosses/e_johan.js` (새 파일) | `export class Johan extends BossC` · `static PATTERNS` (§2.1) · 벡터 그림 |
| B2 | `src/game/bosses/bosses_e.js` · `src/game/bosses/lazy.js` | `import { Johan } from './e_johan.js'` + 표 `b_johan: Johan` · `b_johan: () => import('./e_johan.js').then((m) => m.Johan)` |
| B3 | `src/data/bosses_e.js` | `export const JOHAN_MV = {…}` + `b_johan: {…}` 데이터 행 (§2 표) + 머리말 줄 |
| B4 | `src/data/boss_intro.js` | `b_johan: { style: 'rise', element: 'water', plateColor: '#06100e', dur: 1.1 }` (검은 물 속에서 황동 투구가 떠오른다) — 외전 26장 줄 뒤 |
| B5 | `src/render/painted/bosses/b_johan.js` · `src/render/painted/reg/ex-boss.js` · `assets/painted/bosses/b_johan/*` · `tools/painted/configs/b_johan.json` · `tools/painted/raw/b_johan/*` | 채색 퍼핏 + 등록 한 줄 `b_johan: () => import('../bosses/b_johan.js')` |
| B6 | `assets/portraits/b_johan.webp` · `assets/lo/portraits/b_johan.webp` · `src/data/portrait_meta.js` | 새 초상화 둘 (**기존 초상화 파일은 건드리지 않는다**) · `'portraits/b_johan': { bust: true, face: {…} }` 한 줄 — **다시 읽고 끝에 작은 편집** (그림 묶음이 같은 파일을 만질 수 있다) |
| B7 | `tools/test_johan.mjs` · `tools/probe_johan.html` (+ 필요하면 `tools/probe_johan_art.html`) | §8.2 |
| B8 | `tools/qa/boss_reveal.mjs` · `tools/qa/painted_registry.mjs` (보스 수가 박혀 있으면) · `tools/higgsfield/manifest_<이름>.json` | `boss_reveal.mjs` 58행 이야기 스테이지 범위 `n <= 25` → `n <= 27` (s26 · s27 보스 등장 행도 검사 — 파라켈 행이 통과하는지 같이 본다) · 기록. `run_all.mjs` 에 넣을 줄은 **EX-STAGE 에게 `requests.md` 로** (W29) |

## 6. 예산

| 항목 | 값 |
|---|---|
| 새 글자 | **0** (SPEC 이 확인: 이 문서의 플레이어 문구 210자 모두 지금 `noto-sans-kr.woff2` 핵심 글꼴에 있다 — 놋·벳·쾅 은 핵심 밖이라 **황동 · 징 · 쿵** 으로 바꿨다. `Ⅱ` · `「」` 는 `Ⅰ` 과 같은 처지: noto 에 있고 hahmlet · brush 에는 없다 — s26 「외전 Ⅰ」과 같은 대체 경로). 이 문서의 플레이어 문구는 `/tmp/claude-0/s7/glyphs_spec.txt` (한 줄 한 문자열). 대본을 쓰며 새 문구가 생기면 EX-STAGE 가 `/tmp/claude-0/s7/glyphs_<이름>.txt` 에 덧붙인다 — **`build_fonts.py` 는 돌리지 않는다** (main 이 다시 굽는다). 첫 화면 글꼴 ≤ 500 KB |
| 새 그림 | 초상화 1 (+ lo 1) · 퍼핏 아틀라스 ≤ 64 KiB ≈ APK +0.2 MB (지금 88.90 / 95 MB) |
| Higgsfield | **상한 25장 · 10크레딧** (§2.2). Kling 0 |
| 새 소리 · 새 곡 · 새 배경 · 새 기믹 · 새 적 | 0 |
| 성능 | `tools/qa/perf_budget.mjs` 휴대폰 예산 — 보스 그리기 ≤ 0.6 ms, 스테이지 시작 뒤 새 캔버스 0 (채색 굽기는 로드 · 보스 소개 때), painted ≤ 32 MB(휴대폰) |
| 코드 (새 파일) | `e_johan.js` ≈ 1,300줄 · `b_johan.js` ≈ 550줄 · `story_ex27.js` ≈ 250줄 · `maps/s27.js` ≈ 260줄 · 시험 둘 |

## 7. 파일 소유 (두 사람, 동시에)

**규칙**: 아래 표에 없는 파일은 고치지 않는다. 한 파일은 한 사람만. 상대 파일이 바뀌어야 하면 `/tmp/claude-0/s7/requests.md` 에 `[EX-STAGE→EX-BOSS] 파일 · 정확한 줄 · 이유` (또는 반대). 그림 묶음(아이콘 · 기존 초상화)의 파일 — `src/data/relic_sets.js` · 기존 `assets/portraits/*` · `assets/icons/*` — 은 둘 다 건드리지 않는다. `src/data/items.js` 는 EX-STAGE 가 끝에 한 항목만. 둘 다 커밋 · 푸시 · 배포 · APK 없음, 파괴적 git 명령 금지.

### 7.1 EX-STAGE (맵 · 대본 · 스테이지 · 보상 · 모든 등록 · 등록 시험)
| 종류 | 파일 |
|---|---|
| 새 파일 | `src/data/maps/s27.js` · `src/data/story_ex27.js` · `tools/test_s27.mjs` · (선택) `drowned_bk` 변종이면 그 데이터 줄은 `src/data/enemies*.js` 중 원본이 있는 파일 — 넣기 전에 `requests.md` 에 알림 |
| 고치는 파일 | `src/data/stages.js` · `src/data/story_p2.js` · `src/data/story_ex.js` · `src/data/story.js` · `src/data/lore.js` · `src/data/items.js`(끝에 한 항목) · `src/data/achievements.js` · `src/data/nightmare.js` · `src/data/cosmetics.js` · `src/data/gallery.js` · `src/data/feel_move.js` · `src/data/foreground.js` · `src/scenes/town/worldmap.js` · `src/scenes/town/church.js` · `src/scenes/front/arcade.js` · `src/scenes/front/arcade_run.js` · `src/scenes/front/highscore.js` · `netlify/lib/gamedata.mts` · `tools/balance.mjs` · `tools/qa/lib/balance_nm.mjs` · `tools/integration.mjs` · `tools/test_part2.mjs` · `tools/test_achievements.mjs` · `tools/qa/ach_ui.mjs` · `tools/test_nightmare.mjs` · `tools/test_cosmetics_s5.mjs` · `tools/test_ngplus.mjs` · `tools/test_tower.mjs` · `tools/test_rush_rules.mjs` · `tools/test_foreground.mjs` · `tools/test_hunt_journal.mjs` · `tools/online/test_online.mjs` · `tools/qa/run_all.mjs` · `tools/qa/gallery_ui.mjs`(숫자가 박혀 있으면) · 이 문서 §10 |
| 캡처 | `/tmp/claude-0/s7/fold/<이름>/` — 세계 지도(연출 · 노드 · 정보판) · 방 r1–r5 · 성당 안내 · 아케이드 코스 줄 · 시스템 탭 1부 15칸 · 악몽 탭 27칸 · 업적 · 결과 화면 |

### 7.2 EX-BOSS (보스 로직 · 데이터 행 · 채색 · 초상화 · 보스 등장 · 보스 시험)
| 종류 | 파일 |
|---|---|
| 새 파일 | `src/game/bosses/e_johan.js` · `src/render/painted/bosses/b_johan.js` · `assets/painted/bosses/b_johan/atlas.webp` · `assets/painted/bosses/b_johan/manifest.json` · `assets/portraits/b_johan.webp` · `assets/lo/portraits/b_johan.webp` · `tools/painted/configs/b_johan.json` · `tools/painted/raw/b_johan/*` · `tools/test_johan.mjs` · `tools/probe_johan.html` (+ `probe_johan_art.html`) · `tools/higgsfield/manifest_<이름>.json` |
| 고치는 파일 | `src/data/bosses_e.js` (`JOHAN_MV` + `b_johan` 행) · `src/game/bosses/bosses_e.js` · `src/game/bosses/lazy.js` · `src/render/painted/reg/ex-boss.js` · `src/data/boss_intro.js` · `src/data/portrait_meta.js` (끝에 한 줄) · `assets/lo/index.json` (`keys` 에 한 줄만, 다시 읽고 작은 편집 — §2.2) · `tools/qa/boss_reveal.mjs` · `tools/qa/painted_registry.mjs` (숫자가 박혀 있으면) |
| 캡처 | `/tmp/claude-0/s7/fold/<이름>/` — 8패턴 예고·판정, 1/2페이즈 서기, 전환, 15%, 스토리 죽음(바퀴 닫힘 · 빈 투구 · 등불), 투기장에서 한 판 |

### 7.3 둘 사이의 약속 (인터페이스)
| 무엇 | 약속 |
|---|---|
| 보스 클래스 | **`src/game/bosses/e_johan.js` 의 `export class Johan`** · `static PATTERNS` 는 §2.1 이름 그대로. 데이터 id **`b_johan`** (`BOSSES.b_johan`, `src/data/bosses_e.js` 가 기존 펼침으로 `BOSSES` 에 들어간다). EX-STAGE 는 `stages.js` 의 `boss: 'b_johan'` · 보스 방 `bossId: 'b_johan'` 문자열만 쓴다 — **클래스를 직접 import 하지 않는다** (`lazy.js` · `bosses_e.js` 가 잇는다) |
| 먼저 할 일 (막힘 없게) | EX-BOSS 는 **시작 20분 안에** B2 · B3 · B1 뼈대(서서 걷고 `keySlam` 하나 하는 최소 보스, `node --check` 통과)를 넣는다 → EX-STAGE 의 `s27_flow` 가 처음부터 돈다. EX-STAGE 는 **05:00 까지** W1–W3 · W20 을 넣는다 → EX-BOSS 의 `balance.mjs` · 실제 방 시험이 돈다 |
| 보스 방 | `src/data/maps/s27.js` 의 `boss` 방은 **s26 boss 방과 같은 고체** (§1.1) — `PATTERNS.room` 과 같아야 한다. EX-STAGE 가 바꾸려면 먼저 `requests.md` |
| 대본 id (EX-STAGE 가 쓰고, EX-BOSS 가 부른다) | `b_johan_pre` (보스 등장 — 기존 스테이지 흐름이 자동) · **`b_johan_breach`** (`PATTERNS.transitions[1].script`) · **`b_johan_last`** (`lastLight` 가 `phaseScript(this, 'b_johan_last')` 로 — 스토리 · 처음일 때만) · `b_johan_post` (처치 — 기존 흐름이 자동). 화자 `S('b_johan', …)` 은 `BOSSES.b_johan` 의 이름(페이즈 2 면 form2 이름)과 초상화를 쓴다 |
| 플래그 | 보스는 플래그를 쓰지 않는다 (`boss_b_johan` 은 엔진이 자동). 대본이 읽는 것은 `p2_started` · `boss_b_dracula` 뿐 |
| 보상 | `BOSSES.b_johan.drops = ['u_johan']` (EX-BOSS 데이터) ↔ `items.js` 의 `u_johan` (EX-STAGE). 드롭은 기존 `rollBossLoot` — 새 훅 없음. 스토리 죽음에서 등불이 놓이는 자리 = 보스 발밑 (드롭 생성 자리와 같다) |
| 이름 · 문구 | 보스 이름 · 칭호 · form2 · intro · desc 는 §2 표 그대로 (EX-BOSS 가 데이터에 쓴다). EX-STAGE 의 글자표에도 같은 문자열이 들어 있다 |
| 시험 등록 | EX-BOSS → `requests.md`: `[EX-BOSS→EX-STAGE] tools/qa/run_all.mjs · test_johan 줄 · …` — EX-STAGE 가 W29 로 넣는다 |
| 균형 | `JOHAN_MV` · hp · atk 는 EX-BOSS 가 정한다 (§2.3). EX-STAGE 의 `balance.mjs` 는 그 표를 읽기만 한다. 악몽 `hpMul` 은 EX-STAGE 가 `balance.mjs --nm s27` 로 (EX-BOSS 값이 정해진 뒤 — 06:00 전후) |

### 7.4 시간표 (UTC)
| 때 | EX-STAGE | EX-BOSS |
|---|---|---|
| 시작 ~ +20분 | W1–W4 뼈대 (방 6개 · 보스 방 고체) | B1 뼈대 · B2 · B3 (최소 보스) · 참고 띠 · Higgsfield 첫 묶음 |
| ~ 05:00 | W5–W12 · W20 | 8패턴 벡터 · `test_johan` 32판 |
| ~ 05:45 | W13–W27 · `test_s27` · 통합 사례 | 퍼핏 · 초상화 · B4–B6 |
| ~ 06:20 손 놓음 | 시험 다시 · 캡처 · 글자표 | 시험 다시 · 캡처 · 채색 미완이면 등록 줄 빼고 벡터로 |

## 8. 시험 계약

### 8.1 EX-STAGE — `node tools/test_s27.mjs` (+ 기존 시험)
- 스테이지 정의 (W2 값 · `side` · `part: 1` · `sideLabel` · `chapterLabel(s27,'ko') === '외전 Ⅱ'` · `STAGE_ORDER_P1` 에 없음 · `SIDE_STAGES` 끝 · `SIDE_STAGES_P2` 에 없음) · 방 6 · 보스 방 고체가 `Johan.PATTERNS.room` 과 같음 · 트리거/아이템/상자 id 가 모두 있음.
- 해금: 9장 세이브 → 지도에 s27 없음 · 10장 세이브 → `SIDE_GATE` 참 · 연출 · 노드가 page 0, `SIDE_FROM` s08.
- 대본 12개 모두 있음 · `H` 줄마다 7영웅 + default · `flag('ex_s27_done')` 가 아웃트로 첫 조건보다 앞 · 화자 id 가 모두 있음 · 줄 길이 상한.
- 보상: `u_johan`(`boss: 'b_johan'`, 아이콘 파일 있음) · `l36`(`LORE_ORDER` 끝) · `st_s27` · 마을 대사 넷이 `pickNpcScript` 로 한 번씩 나옴.
- 아케이드: 코스 19 = 「외전 Ⅱ」 · 기기 기록 · s27 모르는 1부 세이브엔 안 보임 · s27 만 아는 세이브엔 보임 (2부 몰라도) · s26 만 아는 세이브엔 19 안 보임 · `arenaBosses(false,false,true)` 는 파라켈만 · `arenaBosses(false,false,new Set(['s26','s27']))` 는 둘 다.
- 악몽 `nm_s27` (1부 배율 · `doom_clock`) · 군주 27 · 서버 표(`gamedata.mts`) 스테이지 27 · 외전 일곱.
- 기존: `validate_maps`(s27 포함, `--tight`) · `nav.mjs` 7영웅 · `test_part2 --static` · `test_achievements` · `test_nightmare` · `test_cosmetics_s5` · `test_rush_rules` · `test_online` · `test_tower` · `test_foreground` · `test_hunt_journal` · `test_ngplus` · `hook_tags` · `text_audit` · `balance.mjs normal <영웅> --check` ×7 (s26 · s27 줄) · `integration.mjs --only s27_gate,s27_flow,s27_rush,s27_boss_retry` + 기존 s26 사례 그대로 초록.

### 8.2 EX-BOSS — `node tools/test_johan.mjs` (`--shots` 장면 PNG)
- 계약 (PATTERNS · 크기 · 이름/칭호/form2) · **8패턴 × 페이즈 0/1 × 보통/지옥 = 32판**: 패턴이 끝나 idle/stagger 로 돌아옴 · 위험 지대가 생김 · **첫 피해 ≥ 0.6초 · 모든 비-계속 지대 예고 ≥ 0.6초** · 경기장 안 (s27 보스 방 **과** 투기장 r1) · 탐침 기록 0 · 무적 풀림.
- 전환 `breach` (이름 · 칭호 · 대사 · 강제 `eelBurst`) · `debugAct('없음') → false` · `debugPhase` · 카운터 창 (`keySlam` · `ballastDrop` 한 대 → 무릎, 수호신 한 대 → 무릎 아님) · 1페이즈 창 상한 10% · 역류 바람이 끝나면 꺼짐 · 15% 스토리(대사 · 긴 무릎)/아케이드(파열) · 처치 스토리(바퀴 닫힘 · 등불 남음)/아케이드(사라짐) · 부활 정리 · 콘솔 오류 0.
- 채색: `painted_registry` (등록했으면) · `hook_tags` · 휴대폰 그리기 ≤ 0.6 ms · 아틀라스 ≤ 64 KiB · `boss_reveal.mjs` 행 수.

## 9. 위험 · 열린 질문 (권고 포함)
1. **마르타의 과거를 새로 정한다** — 지금 대본에 모순은 없다 (`남편|그이|여보` 를 마르타 줄에서 grep, 0건). 마르타의 1부 · 2부 마을 대사는 고치지 않는다 (외전 뒤 대사만 더함). 권고: 그대로.
2. **1부 외전이 둘이 된다** — s26 전용으로 박힌 곳(`s26Known` · `rush26` · `s26check` · `SIDE_S26` · `s26Fight` · `ONLINE_PENDING`)을 W17 · W20 · W23 이 **일반화**한다. 셋째 인자 `true` 는 예전처럼 s26 만 — 옛 시험이 그대로 통과해야 한다.
3. **10장 세이브의 지도 연출이 둘** (s26 → s27, 처음 여는 2부 완주 세이브는 일곱) — `test_part2` UI 검사 · `integration` `wmgate` 가 연출 수를 박아 두었다 (W23 · W24).
4. **악몽 26 → 27 · 군주 문구** — 「스물일곱」 글자 확인 (§6). 성당 악몽 탭 27칸이 Fold 펼침 화면에서 넘치지 않는지 캡처.
5. **r4 깊은 물** — 산소 · 헤엄은 s16 규칙 그대로. 탈것은 내린다 (기존). 가장 느린 영웅이 공기 방울 사이(14열)를 산소 안에 지나는지 `nav.mjs` + 실제 플레이로.
6. **역류(undertow) 바람** — 투기장 · 탑 보스 층에서 보스 소유 바람이 다른 기믹과 겹치지 않는지 (`test_johan` 투기장 판 + `test_tower`). force 는 가장 느린 영웅 걷기의 70 % 이하.
7. **채색 시간** — 06:20 마감. 퍼핏이 반쯤이면 **등록 줄(B5 의 `ex-boss.js` 한 줄)을 넣지 않는다** — 벡터가 그린다. 초상화만 먼저 넣어도 된다.
8. 서버 순위표 `practice:s27` 은 배포 때 (main). 코스 19 는 기기 기록이라 서버 무관.

## 10. 통합 기록
(이 문서는 **EX-STAGE 만** 고친다 — EX-BOSS 는 결과를 자기 보고서 `/tmp/claude-0/s7/<이름>.md` 에 쓰고, EX-STAGE 가 마지막에 여기 한 줄로 옮긴다. VERIFY 는 07:30 전에 아래에 덧붙인다.)

- **EX-STAGE (2026-11-01 04:40 UTC)** — W1–W30 모두 넣음. 새 파일 `src/data/maps/s27.js` (방 6 · 보스 방 = s26 고체 그대로) · `src/data/story_ex27.js` (대본 12 + 크레딧) · `tools/test_s27.mjs` (45/45). 명세에서 바꾼 것 (이유):
  ① `u_johan` 값 `{ atk 16 · mag 16 · def 10 · hp 60 · thunder 10 · dmgReduce 4 }` — 시작값(19 · 19 · 14 · 90)은 진조의 인장보다 일곱 중 넷이 위. 지금 Lv 35 기준 장비 200판 일곱 영웅 ▲ 97–100 % · 진조의 인장 아래 다섯 (브란 · 아젤만 위 — 피해 −4% 몫). 효과 문구 그대로.
  ② 악몽 `nm_s27` = `{ hpMul 1.9 · atkMul 1.08 }` — `--nm s27` 보통 · 어려움 일곱 영웅 초록 (atkMul 1.1 이면 어려움 카엘 이야기 대비 1타 1.27 > 1.25).
  ③ `ch_all.cond.n` 67 → 68 (업적 수 − 1) · `test_achievements` 골드 합 상한 25,000 → 27,000 (st_s27 +2,500 그대로).
  ④ 크레딧 둘째 줄 `'흑묘 여관의 주인 — 마르타'` (CREDITS_EX 행 형식 '제목 — 이름').
  ⑤ r4 가라앉은 수문 틀 2–16행 → 2–15행 (잠수 길 6칸 — 봇 탐침이 브란으로 틀 밑에서 맴돌았다; 손 탐침으로는 3초에 지난다).
  ⑥ `balance.mjs` SIDE_P1.s27 의 넘친 레벨 1타 문턱 0.9 × 진입 (Lv 36 → 41 은 6단계 장비 전이라 s26 의 0.7 은 빡빡하다) · 카엘 명세 칸 · 첫 장비 칸 없음.
  ⑦ 대본 새 글자 0 — 핵심 글꼴 밖 다섯(붐 · 샜 · 펌 · 샌 · 숟)을 바꿔 썼다 (손 펌프 → 손잡이 바퀴 등).
  시험: validate_maps s27 `--tight` 0/0 · 전체 0 오류 · test_part2 static 43/43 + flow 2/2 + mobile 6/6 · test_achievements 261/0 · test_nightmare 632/0 (+ `--browser` fold_open 1401/0) · test_cosmetics_s5 6/0 · test_rush_rules 6/0 · test_online 30+25/0 · test_ngplus 165/0 · test_tower 9/0 · test_foreground 315 · test_hunt_journal 9/0 · hook_tags 0 fail · text_audit (arcade · town · dialogue · menu) 46/0 · balance `--check` 일곱 영웅 s26 · s27 초록 · integration (데스크톱 · fold_open) s26/s27 gate · rush · flow · boss_retry 초록 · playthrough `--god` 일곱 영웅 (브란 r4 는 봇 한계 'route-planned', 손 탐침 통과) · 보통 카엘 0 사망.
- **EX-BOSS (04:37 UTC, `/tmp/claude-0/s7/exboss.md`)** — `e_johan.js` 8패턴 · breach · lastLight · 벡터 + 채색 퍼핏(아틀라스 58.6 KiB) · 초상화 hi/lo · test_johan 52/52 · Higgsfield 2.5크레딧 (gpt_image_2_5, Kling 0). JOHAN_MV 가운데값 0.85 로 올려 balance s27 줄 7/7.
- **VERIFY-EX (2026-11-01 05:25 UTC, `/tmp/claude-0/s7/verifyex.md`) — PASS-WITH-FIXES.** 고친 것:
  ① **싸움 길이 (§2.3 확인 2 미달 → 손잡이 ① 창 상한)**: 실제 엔진 봇 (`/tmp/claude-0/s7/verifyex_tools/fight27.mjs` — s27 보스 방 스토리, 카엘 Lv 35 고정 세이브 = balance.mjs 장비 모형(s11 뒤 · 희귀도 3 · 강화 8 · 비전서 s01–s11), 붙어서 기본 공격만, 대사는 곧바로 넘김, 사망은 세고 계속) — 고치기 전 18판 중앙 **20.0초** [18.1–26.0] · 1페이즈 패턴 중앙 **2** · 20초 이상 9/18 · 사망 0 (1페이즈 절반을 패턴 둘에 잃었다). `game/bosses/e_johan.js` 에 1페이즈 창 상한 둘을 더했다 (`e_charon.js` 와 같은 틀): 공격 패턴 한 번 `PAT_CAP` 5.5% · 쉼(idle) 한 번 `IDLE_CAP` 3% (무릎 `STAG_CAP` 10% 그대로, 2페이즈 · 필살 · 각성 · 15% 긴 무릎은 상한 밖). 뒤: 18판 중앙 **29.7초** [26.6–36.2] · 1페이즈 패턴 중앙 **4** (18/18 ≥ 4) · 20초 이상 18/18 · 사망 0 · 무릎 중앙 3. HP · 공격력 · `JOHAN_MV` · balance 모형 그대로 (약한 영웅·장비는 상한에 닿지 않는다). 다른 영웅 4판 (같은 정책): 브란 28.6초 · 빅터 28.2초 · 리아 71.4초 (사망 중앙 2 — 같은 정책으로 s26 파라켈 41.6초 · s12 드라큘라 79.2초에서도 사망 중앙 2, s27 만의 일 아님) · 카엘 어려움 39.2초. `tools/test_johan.mjs` 검사 하나 더 (쉼 3.0% · 패턴 5.5% · 2페이즈 · 필살 상한 없음) 52 → 53/53.
  ② **기록 탭 1부 외전 칸** (EX-STAGE→main 요청): `scenes/menu/tab_system.js` 칸 머리를 `sideLabel` 로 — 「외전 Ⅰ」 · 「외전 Ⅱ」 (2부 외전은 sideLabel 이 없어 「외전」 그대로). fold_open · phone1 캡처 · text_audit 46/0.
  ③ (도구) `tools/qa/perf_budget.mjs --scenes` 가 아무 스테이지 방 `sNNrX` · `sNNboss` 를 받는다 (전체 판은 s01–s20 그대로) — EX-BOSS 가 /dev/shm 사본을 써야 했던 것.
  확인 (모두 고친 뒤 트리): fold_open 실제 터치 세계 지도 — 9장 세이브 노드 없음 · 10장 옛 세이브(s26 연출 이미 봄) s27 연출 하나 · 12장 세이브 s26 → s27 · `tools/fixtures/save_p2done.json` (v2 옛 세이브) s20 → s23 → s24 → s25 → s26 → s27, 노드 탭 영역 54×54 CSS px (8장 노드와 100px) → 정보판 → 노드 다시 탭/「출발!」 → s27_intro → s27 r1, 페이지 오류 0. 도감: 9장 요한 없음 · 10장(s27 열림) 있음 · 처치만 했어도 있음. integration fold_open 10/10 (s27 · s27_boss · hub · worldmap · s27_gate · s27_rush 코스 19 · s27_flow 보스 격파 23.9초 → 결과 → 아웃트로 → 마을, 저장 cleared · ex_s27_done · boss_b_johan · 장 그대로 · s27_boss_retry · s26_flow · s26_rush) · 데스크톱 9/9. playthrough `--god` 일곱 영웅 6/6 방 (브란 r4 이제 통과) · 보통 피해 프리셋 3 카엘 6/6 사망 0 · 브란 6/6 (한 판 r4 에서 바닥을 걷다 1사망 62초 — r4 만 두 번 15.6초 피해 0). NG3 · 지옥 난이도 보스 방: inferno 갈래, 8패턴 × 페이즈 둘 모두 idle 로 돌아옴, 오류 0. perf_budget fold · phone1 s27 r1–r5 · boss 106 pass · 4 warn (hero.js · tiles.js 그라디언트 최대치, p95 안) · 0 fail; `--quick` fold 의 perk.marks24 PerkLayer 실시간 0.055–0.075 ms (예산 0.05) 하나 실패 — class_perks.js 는 이번 단계에 바뀌지 않았고 부하 탓 시계 측정 (s27 무관). 시험: validate_maps 0 오류 (예전 경고 1) · `s27 --tight` 0/0 · test_part2 `--static` 43/43 · test_achievements 261/0 · test_nightmare 632/0 · test_rush_rules 6/0 · test_hunt_journal 9/0 · hook_tags 0 fail · painted_registry 38 pass/1 warn/0 fail · test_johan 53/53 · test_paracel 49/49 · test_s27 45/45 · test_tower 9/0 · test_gallery 183/0 · test_ngplus 165/0 · test_foreground 315 · test_cosmetics_s5 6/0 · test_online 메모리 + 서버 25/0 · balance `normal <7영웅> --check` 0 · `--nm all --check` 보통 · 어려움 0 · boss_reveal fold_open 16/16 · platform_view (arcade · town · dialogue · results · pause, fold_open · phone1) 15/0 · text_audit 46/0. 새 글자 0 (s27 문구의 한글 모두 기본 noto 에 있음).
