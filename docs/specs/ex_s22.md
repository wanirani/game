# 외전 22장 「까마귀의 이름」 — 설계 계약

> **상태: 통합 완료 (EX2-INTEG, 2026-10-05) — 기록은 §7.** 설계 승인 (리드, 2026-10-05). 리드 확정: 반전(둥지어미 = 리아의 어머니 네메인) · 1부 지도(page 0) 외전 노드 · `p2_done` 해금 · `COURSE_COUNT` 9. 구현에서 달라진 값(보스 hpMul·res, 단검 atk, 지도 mapPos)은 그 자리에 고쳐 적었고, §4.2 대본은 설계 원문 그대로 두고 손질한 줄을 §7 '이야기' 칸에 모았다 (실제 대본은 `src/data/story_ex.js`).

리드가 정한 설계. **굵은 항목**은 바꾸지 않는다. 바꿀 이유가 생기면 `/tmp/claude-0/plan/ex2_requests.md` 에 `[보낸이→받는이] 내용` 한 줄로 적는다.
비용은 s21 과 같은 틀: **새 배경·새 적·새 기믹 없음**, 새 그림은 보스 하나(채색) + 초상화 셋. 보상은 탈것이 아니라 **수호신**.

## 0. 왜 리아인가

일곱 영웅 중 기존 대사에 풀리지 않은 실마리가 가장 많다. 카엘(에드문트)·브란(새벽 서약·가레스·벽서 l15)·아젤(아멜리아 l12)은 1부에서 매듭지어졌고, 세라(엘리제)·빅터(현상금 악몽 하나)는 걸린 것이 적다. 이졸데는 s21 이 썼다.

| 실마리 | 출처 |
|---|---|
| 이름 — "네 이름은 누가 지어 줬지?" / "이름은 내가 골랐어. 리아. 누가 지어 준 게 아니야." | `story_p2.js` s14_t1 |
| 입단식의 목소리 — "너에게 이름은 필요 없다. 너는 칼이다. 칼에게는 이름이 없다." (화자 `'까마귀 가면의 목소리'`, 정체 미상) | `story_p2b.js` s18_t1 |
| 알베르토 처리 명령 — R 은 "보류"(l18), 리아는 "나한텐 처리하라고 했잖아" → 누가 R 을 넘어 명령했나 | `story.js` s09_t2 · `lore.js` l18 |
| 비석 없는 결사의 무덤 — "결사의 무덤엔 비석이 없지. 까마귀만 알 뿐." | `story.js` s02_t1 |
| 기록에 없는 선배 — "까마귀 문신. 결사 선배야. 기록에 없는 사람." | `story.js` s10_t2 |
| 레이븐이 아는 것 — "그 성질, 누굴 닮았는지 원." / "…고집은 누굴 닮았는지." / "꼬마 까마귀" | `story.js` npc_rook_ch2·ch9 · `story_p2.js` ending_p2 |
| 버려짐 — "…버려진다는 게 어떤 건지 알아." / "엄마 같은 거 없어. 그러니까 안 속아." | s14_t2 · `story_p2b.js` b_mara_pre |
| 결사의 끝 — "까마귀는 가면을 벗었다. 둥지는 무사하다." | ending_p2true |

외전은 이 실마리를 한 번에 묶는다: **둥지어미(입단식의 목소리, 알베르토 처리 명령을 내린 사람)는 리아의 어머니 네메인**이고, 리아가 "스스로 골랐다"는 이름은 어머니가 둥지 문 앞에서 딱 한 번 불러 준 이름이다. 비석 없는 무덤의 이름은 그녀(와 늙은 까마귀 무닌)가 전부 외우고 있었다. 레이븐은 알고도 "현장 요원에게는 알리지 말 것"(l18) 규칙으로 숨겼다.

## 1. 개요

| 항목 | 값 |
|---|---|
| 스테이지 id | **`s22`** (chapter 22, `part: 2`, **`page: 0`**, `side: true`) |
| 이름 | **이름 없는 언덕** / 부제 「안개의 묘지 너머, 이름 없는 칼들이 자란 곳」 · 제목 카드 `title('외전', '이름 없는 언덕')` |
| 여는 조건 | **2부 엔딩 후 (`p2_done`, 엔딩 도중 닫은 세이브는 `ending_p2`·`ending_p2true`)** — s21 과 같은 조건·같은 코드 길(`worldmap.js` 의 `SIDE_STAGES` 고리). 근거: ① 2부를 끝낸 플레이어라면 누구나 바로 갈 수 있다 ② s21 과 순서가 묶이지 않는다(대본도 아르겐을 전제하지 않음) ③ 아케이드의 외전 문(`exKnown` = 코나미 · 2부 엔딩 본 적 · 어느 슬롯이든 외전 해금)이 그대로 맞는다 — `ex_s21_done` 으로 하면 외전 코스·탑·서바이벌·서버 시험에 두 번째 문이 필요해진다 |
| 위치 | **1부 지도(에슈빌 쪽, page 0)**, 2장 「안개의 묘지」에서 갈라지는 외전 노드. 이야기 무대가 이쪽 세계(묘지 너머 언덕의 옛 예배당·종루)이고, 리아가 처음 나온 곳(s02)에서 그녀의 이야기가 끝난다. 지도 작업은 §7 (s21 의 page 1 외전 노드 코드를 page 에 상관없이 쓰게 넓힌다) |
| 레벨 | 72 (s21 70). parTime 600 |
| 테마·그림 | 기존 묘지 테마 재사용: theme `'graveyard'`, bg `bg/s02_graveyard`, tex `tex/tex_mossy_stone`, tex2 `tex/tex_dirt`, tileStyle `'moss'`, darkness 0.5, darkColor `#06020c`, liquid `'water'`. **새 배경 그림 없음** (배경의 십자가 묘지는 "언덕 아래 마을 묘지"로 대본이 설명한다) |
| 기믹 | **`wind` 재사용** — 스테이지 기본 `{ kind: 'wind', dir: 'alt', force: 760, on: 2.2, off: 4.2 }` (번갈아 부는 산바람, s21 보다 약하고 방향이 바뀐다). 수직 방은 상승 기류 `U`. 지하(r4)와 보스 방은 `gimmick: null` |
| 적 | **기존 적만**: `crow`(시체 까마귀) · `ghost`(원혼) · `phantom_sword`(유령 검 — "주인을 잃은 칼") · `shadow_hunter`(그림자 헌터 — 둥지의 그림자술) · `faceless`(얼굴 없는 자 — 이름 없는 칼) · `wisp`(도깨비불) · `mimic`. 맵 숫자 1 crow · 2 ghost · 3 phantom_sword · 4 shadow_hunter · 5 faceless · 6 wisp · 7 mimic. 1부 적(낮은 기본 체력)은 수가 많은 잡몹, 2부 적(shadow_hunter·faceless)은 방마다 1–2 |
| 음악 | 스테이지 `s02`, 보스 `boss3` (나르키사·다곤·마라와 같은 정서적인 곡) |
| 방 | 6개 (마지막이 보스 방). 기존 맵 형식·`tools/validate_maps.mjs`·물리 탐침(`tools/qa/lib/nav.mjs`, 7영웅) 규칙 |
| 보상 | **수호신 `gd_munin` 무닌** (§3) + 보스 고유 단검 `u_nemain` 하나 (다른 보스와 같은 드롭) |
| 플래그 | 쓰기 `s22_revealed`(세계 지도) · `recruit_gd_munin` · `ex_s22_done` · `boss_b_nemain`(자동). 읽기 `ending_p2true`(레이븐 맨얼굴) |

### 1.1 방 (EX2-MAP)

흐름: r1 이름 없는 무덤길 → r2 까마귀 벼랑(상승) → r3 까마귀 학당(세이브·`s22_t1`) → r4 깃털 우물(하강·비밀 방) → r5 가면의 회랑(세이브·`s22_t2`·상승) → boss 무너진 종루.

| 방 | 크기(대략) | 내용 |
|---|---|---|
| r1 이름 없는 무덤길 | 110×18 가로 | 시작 P. 봉분만 있는 무덤 언덕(장식 `%` 둔덕), 얕은 늪 `~` 웅덩이(구덩이 없음), 12열 안팎마다 무너진 담장(바람막이 — TIP 이 가리킨다). 적 1×4 · 2×2 · 6×2 · 3×1, `B` 하나(고기), 촛불·촛대. `exitRight: 'r2'` |
| r2 까마귀 벼랑 | 34×52 세로 | 벼랑을 오른다: 좌우를 번갈아 붙은 상승 기류 기둥(`U`, 기둥 높이 ≤ 17칸), 쉼터 발판, 번갈아 부는 바람. 벽에 숨은 상자 `K`. 적 1×3 · 6×2 · 3×1. 출구 위쪽 |
| r3 까마귀 학당 | 80×24 가로 | 지붕이 무너진 예배당 안뜰(훈련장). 입구 가까이 세이브 `S`, **10열 평평한 바닥에 `!` (`triggers: ['s22_t1']`)**, 보물상자 `$`, 미믹 7×1, 4×2 · 5×1 · 1×2. 실내면 `gimmick: null` 가능 |
| r4 깃털 우물 | 34×48 세로 | 예배당 아래 옛 우물·납골당으로 내려간다. `gimmick: null`(지하에 바람 없음). 발밑 `B` 를 깨고 내려가는 자리 + 비밀 방(`K`). **리아의 대각 급강하 차기는 바닥 블록을 못 깨므로 비밀 방에는 옆에서 치는 `B` 문도 둔다** (s21 r4 와 같은 규칙). 적 2×3 · 3×2 · 6×2 |
| r5 가면의 회랑 | 80×32 | 종루로 오르는 회랑. 입구 가까이 세이브 `S`, **10열 평평한 바닥에 `!` (`triggers: ['s22_t2']`)**, 상승 기류 기둥 하나, 번갈아 부는 바람. 적 4×2 · 5×2 · 2×1 · 3×1. `exitRight: 'boss'` |
| boss 무너진 종루 | **60×18** | **s21 boss 방과 같은 뼈대** (보스 로직 설계 방과 맞춘다): `X` 16열, `|` 17열(3–15행), 입구 0–15열(P 2 · T 5 · G 8 · T 12), 바닥 16·17행 전부 `#`(구덩이 없음), 0행부터 하늘(양옆 벽 0·59열만), `=` 11행 [22–26] [34–39] [50–54] + 7행 [29–31] [43–45], 바람막이 턱 `%` 15행 18–19열 · 오른쪽 구석 14행 57–58 · 15행 56–58. 장식만 묘지풍(`C`·`L`). **`gimmick: null`**, `boss: true`, `bossId: 'b_nemain'` |

- 필수 길: 가장 낮게 뛰는 브란(점프 760, 이단 점프 합 ≈ 4.9칸) 기준 오름 3칸 이하(드물게 4), 같은 높이 틈 4칸 이하, 빠져나올 수 없는 우물 없음 — 7영웅 모두 `nav.mjs` 물리 탐침으로 확인.
- 스테이지 항목은 이 값 그대로 (대본이 들어오기 전엔 검증기 통과용으로 `intro: ''`, `outro: ''` 를 두고, EX2-INTEG 가 대본을 넣으며 지운다 — s21 과 같다):

```js
// ── EX stage s22 (EX2-MAP 맵 · EX2-INTEG 통합) — 외전 「까마귀의 이름」 (docs/specs/ex_s22.md). 2부 엔딩(p2_done) 뒤에 열린다.
//    side: true · page: 0 = 1부 지도(에슈빌 쪽)에서 2장 안개의 묘지로부터 갈라지는 외전 노드 (town/worldmap.js SIDE_FROM.s22 = 's02')
s22: S({ id: 's22', chapter: 22, part: 2, page: 0, side: true, name: '이름 없는 언덕', sub: '안개의 묘지 너머, 이름 없는 칼들이 자란 곳', theme: 'graveyard', bg: 'bg/s02_graveyard', tex: 'tex/tex_mossy_stone', tex2: 'tex/tex_dirt', tileStyle: 'moss',
  music: 's02', level: 72, darkness: 0.5, darkColor: '#06020c', liquid: 'water', boss: 'b_nemain', rooms: S22, parTime: 600,
  enemies: ['crow', 'ghost', 'phantom_sword', 'shadow_hunter', 'faceless', 'wisp', 'mimic'], docs: [], shard: null, heart: null,
  gimmick: { kind: 'wind', dir: 'alt', force: 760, on: 2.2, off: 4.2 }, color: '#ff4a6a', next: null, mapPos: { x: 0.13, y: 0.55 },   // 통합: 0.5 → 0.55 (데스크톱에서 나침반과 겹쳐서, §7)
  req: '2부의 끝을 본 뒤, 까마귀 결사의 소집령이 에슈빌에 날아들면 갈 수 있다' }),
```

## 2. 보스 `b_nemain` — 둥지어미 / 네메인

| 항목 | 값 |
|---|---|
| id | **`b_nemain`**. 1페이즈 이름 **둥지어미**, 칭호 「이름을 거두는 까마귀」(초상화 `portraits/b_nemain`, 가면). form2(가면이 깨진 뒤) 이름 **네메인**, 칭호 「가면을 벗은 어미」(초상화 `portraits/b_nemain2`) |
| 모습 | 키 큰 마른 여인(사십 대 후반). 검은 칠의 까마귀 부리 반가면(코 위 부리, 금이 가 있다), 땅에 끌리는 수천 장의 검은 까마귀 깃털 망토(안감은 리아의 목도리와 같은 진홍 `#c0142a`), 몸에 붙는 검은 가죽 암살복·은 버클, 목·손목의 까마귀 문신, 까마귀 부리 모양의 긴 검은 단검 두 자루. 망토 자락마다 붉은 눈들이 깜빡인다. 가면 아래는 **리아와 같은 붉은 눈**(`#d02a3a`), 은빛이 섞인 검은 머리, 뺨의 얇은 흉터. 색: 검정 `#141018` · 자두색 `#3a1420` · 진홍 `#c0142a` · 뼈·은 `#c8c8d0` · 달빛 푸른 가장자리광 |
| 데이터 (최종 — 시작값 hpMul 1.2 · res 24 를 EX2-BOSS 가 밸런스로 바꿈) | `hp: 2800, hpMul: 1.3, atk: 46, def: 21, res: 21, exp: 3500, score: 430000, size: { w: 64, h: 150 }, flying: false, contact: 0.5, material: 'flesh', weak: ['holy'], resist: ['dark'], phases: [0.5], music: 'boss3', stageId: 's22', drops: ['u_nemain'], light: { r: 220, color: '#ff4a6a', i: 0.6 }` · `intro: '(부리 가면 너머로 붉은 눈이 가늘어진다. 깃털 망토 자락마다 까마귀의 눈이 깜빡인다.)'` · `desc: '까마귀 결사의 둥지를 서른 해 동안 지켜 온 여인. 이름 없는 아이들을 칼로 길러 냈고, 결사가 문을 닫던 날 모든 칼에게 이름을 반납하라는 소집령을 내렸다.'` (도감 설명에는 반전을 쓰지 않는다) |
| 체급 | 아르겐과 니힐 사이 (`tools/balance.mjs` 보스 타수 기준, 보통·kael·s21 클리어 레벨): **목표 ≈ 160–180타 · 받는 피해 16–20%**. 다른 영웅도 아르겐과 같은 순서에 놓이게 hp/hpMul 을 맞춘다 |
| 페이즈 | **2단계** (`phases: [0.5]`). 50% 전환 `unmask` 에서 가면이 깨지고 form2 로 바뀐다 (= 싸움 속의 반전). 15% 이하에서 한 번 「그믐」 강제 + 대사 `b_nemain_last` |
| 결말 | **죽이지 않는다** — 체력 0 이면 보스 처치 처리(경험치·드롭·`boss_b_nemain`)는 같고 연출만 '굴복': 망토에서 까마귀 떼가 터져 하늘로 흩어지고(0–1.5초), 단검 두 자루가 떨어져 울리고(1.2초), 한쪽 무릎을 꿇는다(1.5–2.5초) → 그 자세를 유지. 'STAGE CLEAR' 부제 **'결착!'**. 아케이드 모드에서는 3.5초에 까마귀로 흩어져 사라진다 (보스 러시 다음 라운드). 파편 폭발 없음. `e_argen.js` 의 정화 결말과 같은 방식으로 덮어쓴다 |
| 구현 | `BossC`(`c_common.js`) 상속, 새 파일 `src/game/bosses/e_nemain.js`. 데이터는 `src/data/bosses_e.js` 의 `BOSSES_E.b_nemain`. 구조는 `e_argen.js`, 분신·소환은 `c_narkissa.js`(twinReflect·`spawnMinion`), 망토 흩날림은 `b_death` 채색 렌더러를 본으로 |
| 아케이드 | 보스 러시 `BOSS_ORDER` 끝(21번), 서바이벌 보스 웨이브·무한의 탑 무작위 구간(`sideBosses()`)에 자동으로 든다. **모든 패턴은 `this.A`(경기장 경계)와 `A.floor` 만 기준으로** 움직인다 — 투기장(`maps/arena.js` r1 40×14, 발판 3·6·9행)·탑 보스 층에서도 같게 돈다. 방 기믹을 쓰지 않는다 (`gimmicks: []`) |

### 2.1 패턴 계약 (`static PATTERNS`)

```js
const PATTERNS = {
  attacks: ['featherVolley', 'crowDive', 'shadowStep', 'nameless', 'nestCall', 'murder', 'featherCage', 'eclipse'],
  helpers: ['stagger'],
  transitions: { 1: { state: 'unmask', dur: 2.0, script: 'b_nemain_unmask', form2: true, force: 'murder' } },
  weights: [
    { featherVolley: 3, crowDive: 3, shadowStep: 3, nameless: 2, nestCall: 1 },
    { shadowStep: 3, murder: 3, featherCage: 2, eclipse: 2, featherVolley: 2, nameless: 2, crowDive: 1, nestCall: 1 },
  ],
  gimmicks: [],
  floorRow: 16,
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7]] },   // s21 boss 방과 같은 뼈대
};
```

| 패턴 | 페이즈 | 동작 (숫자는 시작값, 밸런스는 EX2-BOSS) |
|---|---|---|
| `featherVolley` 깃털 비수 | 1·2 | 0.55초 예고(팔을 들고 등 뒤에 깃털이 부채처럼 선다) → 플레이어를 향해 깃털 비수 5개 부채꼴(48°), 640px/s, mv 0.5, 수명 1.6초. 2페이즈 7개 + 0.35초 뒤 반 칸 어긋난 두 번째 부채 |
| `crowDive` 까마귀 급습 | 1·2 | 화면 위쪽에 까마귀 3마리(2페이즈 5) → 각자 그 순간 플레이어 자리로 `warnLine` 0.6초 → 900px/s 로 꽂힌다 (`strikeLine` 폭 34, mv 0.55, 0.18초 간격) |
| `shadowStep` 그림자 걸음 | 1·2 | 바닥 그림자로 가라앉음 0.35초(**판정 없음**) → 붉은 반짝임이 섞인 그림자 웅덩이가 바닥을 타고 플레이어 등 뒤로 0.6초 → 솟아오름 0.25초 = **카운터 창**(`boss.telegraph`) → 십자 베기 2타 (앞 160×110, mv 0.75 · 0.85). 2페이즈는 반대쪽에서 한 번 더 |
| `nameless` 비석 없는 무덤 | 1·2 | 단검 5자루(2페이즈 7)를 던져 경기장 바닥에 고르게 꽂는다 (`warnFloor` 0.9초, 단검 자루가 비석처럼 보인다) → 먼 쪽부터 플레이어 쪽으로 0.15초 간격으로 그림자 칼날 기둥 (`strikeColumn` 폭 56, 높이 5칸, mv 0.7) |
| `nestCall` 둥지의 부름 | 1·2 | 까악(`crow_caw`) 1.0초 → `spawnMinion(['crow'])` 2마리(살아 있는 수 ≤ 4), 2페이즈는 `shadow_hunter` 1(≤ 1)도. 최대치면 고르지 않는다 |
| `murder` 까마귀 폭풍 | 2 | 몸이 까마귀 떼로 터진다 0.4초(**판정 없음**) → 띠 경고 0.8초(경기장 폭 전체 `warnRect`): 낮은 띠(`A.floor − 2.4칸 … A.floor`) 또는 높은 띠(`A.floor − 6.6칸 … A.floor − 3.6칸`) → 떼가 1100px/s 로 띠를 휩쓴다 (mv 0.45, rehit 0.25) → 반대쪽에서 다른 띠로 한 번 더 → 먼 쪽에서 다시 모인다 + **노출 1.0초(몸통 0.7)**. 전환 직후 강제 |
| `featherCage` 둥지 | 2 | 0.5초 예고 → 까마귀들이 플레이어를 둘러싼 고리(반지름 300 → 1.6초에 70, 두께 36, mv 0.6, rehit 0.5). **70° 틈 하나**(진홍 깃털 빛)가 초당 40° 돈다 → 틈으로 빠지거나 무적 대시로 뚫는다. 끝에 고리가 바깥으로 터진다 (`ringWave` r 0→260, mv 0.5) |
| `eclipse` 그믐 | 2 | `darken(this, 0.45, 4.5)` — 붉은 눈 한 쌍만 보인다 → 기습 3번: 매번 0.55초 전 그 자리에 붉은 눈 + `crow_caw` (플레이어 옆, 좌우 번갈아) → 베기(170×110, mv 0.8). 솟아오르는 순간 = 카운터 창. 끝나면 가운데로 돌아오고 빛이 돌아온다. **체력 15% 이하에서 한 번 강제** (`forceNext('eclipse')` + `phaseScript(this, 'b_nemain_last')`, 스토리 모드·처음만) |
| `stagger` (보조) | — | 1.4초 무릎(몸통 0.7 · 머리 0.6). 들어가는 길: 그림자 걸음·그믐의 카운터 창에 맞음 · 까마귀 폭풍 노출 1초 안에 최대 체력 5% 이상 |
| 전환 `unmask` | 1→2 | 무적 2.0초. 0.6초에 가면이 두 쪽으로 깨져 떨어지고(채색 파편) 까마귀가 터져 나온다, form2 이름·초상화 교체, 끝에 대사 `b_nemain_unmask`(스토리 모드 1회) → 곧바로 `murder` |

- 판정 부위 (가까운 부위 우선): 머리(1페이즈 **가면 0.85** — 노릴 곳, 2페이즈 1.0, 40×40) · 몸통 1.0 · 다리 1.15 · 펼친 망토 1.3(펼친 동안만). 가라앉음·까마귀 떼 동안 판정 없음.
- `resetFight`(플레이어 부활) → 가면·이름·초상화 원래대로, 어둠·화면 색조(`clearMood`)·소환수·깃털·고리 정리, 15% 대사는 이미 나왔으면 다시 안 나온다.
- 적 정지(`heldByFreeze`)·`debugAct`·`debugPhase` 규칙은 `c_common.js` 머리말 그대로.
- 선택 (시간이 남으면): 스토리 모드 · 2페이즈 · 플레이어가 리아면 그림자 걸음·그믐의 솟아오름이 0.12초 늦다(어미의 망설임). 아케이드 공정성에는 영향 없음.

### 2.2 그림 (EX2-BOSS)

- **벡터 그림(기본, 대체)** + **채색 퍼핏**(`docs/art/BOSS_PIPELINE.md`, `src/render/painted/bosses/b_nemain.js`, 등록은 `src/render/painted/reg/ex-boss.js` 의 `bosses` 에 한 줄 — `reg/index.js` 는 이미 이 파일을 읽는다).
- 퍼핏 부위(≈16): 가면 머리 · 맨얼굴 머리 · 뒷머리(Strand) · 몸통 · 망토 뒤판 3띠(펄럭임) · 팔 위/아래(먼 팔은 같은 부위에 틴트) · 단검 · 다리 · 까마귀 2프레임(날개 위/아래, 떼·급습·소환 연출) · 깃털(탄) · 가면 파편 2. 상태: idle · 던지기 · 가라앉음/솟아오름 · 펼친 망토(소환·둥지) · 무릎(stagger·굴복) · 피해 0–2(가면 금이 커진다).
- 까마귀 떼는 그리는 수 × `world.fx.quality` (최대 40, 최소 16). 휴대폰 그리기 ≤ 0.6 ms.
- 아틀라스 **≤ 160 KiB** (td ≈ 1.0, 1024 폭 — 아르겐처럼 lo 단계용으로 작게).
- **Kling (모델·방식은 `manifest_ex-boss.json` 과 같다, 한 장 2크레딧, 상한 120크레딧 = 보스 + 초상화 셋 전부)**:

| 샷 | 방식 | 장 | 크레딧 | 쓰임 |
|---|---|---|---|---|
| nm_portrait | text_to_image 3:4 | 2 | 4 | `portraits/b_nemain` (가면, 761×968 q82, 다른 2부 초상화처럼 아래 56px 자름) |
| nm_portrait2 | image_to_image 3:4 (1장 기준, 같은 구도) | 2 | 4 | `portraits/b_nemain2` (가면이 반쯤 떨어진 맨얼굴 — 리아를 닮은 붉은 눈·은빛 섞인 검은 머리) |
| nm_full | i2i 9:16 | 2 | 4 | 옆모습 전신(망토 닫힘) — 몸통·다리 |
| nm_heads | i2i 4:3 | 2 | 4 | 옆모습 머리 둘(가면 / 맨얼굴) |
| nm_arms | i2i 16:9 | 2 | 4 | 팔·손·부리 단검 |
| nm_cloak | i2i 16:9 | 2 | 4 | 날개처럼 펼친 깃털 망토 뒤판 |
| nm_crows | i2i 16:9 | 2 | 4 | 붉은 눈 까마귀 날기 자세 넷 |
| nm_debris | i2i 1:1 | 1 | 2 | 가면 파편·깃털·단검 |
| munin_portrait | text_to_image 3:4 | 2 | 4 | `portraits/cmp_gd_munin` — 늙은 까마귀(정수리에 회색 깃 몇 가닥, 검은 눈에 진홍 테, 다리에 바랜 붉은 끈), 달빛 아래 이름이 새겨진 작은 비석 위 |
| (재시도 예비) | | ≤ 8 | ≤ 16 | |
| **합계** | | **17 (+8)** | **≈ 34 · 최대 50** | 상한 120 안 |

- 기록: `tools/kling/manifest_ex2-boss.json` (`creditsCap: 120`, 시작·끝 잔액, 장마다 결정), 프롬프트 `tools/painted/prompts/ex2-boss.mjs`, 원본 `tools/painted/raw/b_nemain/*.webp`(q95), 설정 `tools/painted/configs/b_nemain.json`, 자세 갤러리 `tools/painted/poses/b_nemain.mjs`. lo 사본은 `python3 tools/assets/make_variants.py` (`assets/lo/portraits/*`, `assets/lo/index.json`).
- 프롬프트 방향: 기존 2부 초상화와 같은 채색 다크 판타지 화풍, 한 인물, 글자·워터마크 없음. 수호신 채색 퍼핏은 **만들지 않는다** (벡터 + 초상화, `mt_argen` 과 같은 수준).

### 2.3 고유 드롭 `u_nemain` (EX2-BOSS, `src/data/items.js` 외전 블록 아래)

```js
{ id: 'u_nemain', name: '흑우 단검 네메인', slot: 'weapon', wtype: 'dagger', tier: 7, icon: 'dagger_7', lvReq: 72, rarity: 5, boss: 'b_nemain',
  stats: { atk: 134, crit: 18, critDmg: 45, dark: 25, atkSpd: 10 }, element: 'dark', visual: { style: 6, glow: '#ff4a6a', rift: true },   // 최종 (시작값 130)
  effect: '이름 없는 칼 — 치명타 확률 +18%, 치명타 피해 +45%', desc: '네메인이 서른 해 동안 쥐었던 쌍단검 중 한 자루. 손잡이 안쪽에 아주 작은 글씨로 이름 하나가 새겨져 있다. 리아.' },
```
수치는 7단계 단검 곡선(`u_mara` lvReq 62 · atk 118) 위에서 EX2-BOSS 가 맞춘다.

## 3. 보상 — 수호신 `gd_munin` 무닌

- 아웃트로에서 네메인의 늙은 까마귀가 헌터의 어깨에 내려앉아 **수호신으로 합류** (`recruit` 명령, 플래그 `recruit_gd_munin`). 탈것이 아니다.
- **AI 재사용: 미네르바(`gd_owl`)의 `OWL` 그대로 — 단 스킬만 뺀다.** 공격·협공은 데이터 kind `'dive'`(올빼미 「발톱 급강하」와 같은 `runKind` 경로, 코드 없음), 패시브·월드 그림은 `OWL.passive`(가까운 부서지는 벽·가짜 벽 찾기) · `OWL.drawWorld`(윤곽), 스킬은 `aiFor` 가 채우는 데이터 기반 `GENERIC.skill`(주인 둘레 r 170 휩쓸기 — 색 `def.color`, 속성 입자 `dark`). 올빼미의 금빛 성광 스킬은 올빼미 그림이라 쓰지 않는다.
  - `src/game/guardian.js`: `const MUNIN = { passive: OWL.passive, drawWorld: OWL.drawWorld };` 를 `GUARDIAN_AI` 에 `gd_munin: MUNIN` 으로 (한 줄 + 한 줄).
  - `OWL.passive` 의 새 비밀 발견 소리 `audio.sfx('owl_hoot', { vol: 0.5 })` → `audio.sfx(g.def.cry?.sfx ?? 'owl_hoot', { vol: 0.5, pitch: g.def.cry?.pitch ?? 1 })` (올빼미는 cry 가 `owl_hoot`·pitch 1 이라 그대로). 윤곽선 색(`fxSecretOutline` 금빛)은 그대로 둔다 — "반짝이는 것을 찾는 까마귀".
- **새 모습**: 벡터 절차 그림 `GUARDIAN_DRAW_B.gd_munin` (`src/render/guardians_b.js`, `drawOwl` 의 구운 부위(body·perched·wing·wing2) 구조를 본떠 까마귀 부위로): 윤기 도는 검은 깃(청보라 반사), 정수리의 회색 깃 몇 가닥(늙음), 다리의 바랜 붉은 끈, 굵은 부리. 애니메이션 perch(어깨) · idle(날갯짓) · attack(급강하, 날개 접음) · skill(날개 활짝 + 부리 벌림) · emote(고개 갸웃). 원형 아이콘은 `GUARDIAN_ICON_B` 가 자동. 초상화는 §2.2 Kling.
- 데이터 (`src/data/companions.js` `GUARDIANS` 끝, 머리말 "수호신 11" → 12):

```js
// ─ 외전 (docs/specs/ex_s22.md §3): 네메인의 늙은 까마귀 — s22_outro 의 recruit 명령 (플래그 recruit_gd_munin).
//   AI = 미네르바(gd_owl)의 OWL.passive · OWL.drawWorld + 데이터 kind 'dive' (스킬은 aiFor 의 GENERIC) — game/guardian.js GUARDIAN_AI.gd_munin
gd_munin: guardian({
  id: 'gd_munin', part: 2, chapter: 22, name: '무닌', title: '이름을 기억하는 까마귀', color: '#ff4a6a',
  role: '척후·암살형 — 약한 적을 노리는 급강하와 숨은 길 찾기',
  desc: '까마귀 결사의 둥지에서 서른 해를 산 늙은 까마귀. 이름 없이 쓰러진 칼들의 이름을 하나도 빠짐없이 외우고 있다.',
  portrait: 'portraits/cmp_gd_munin', iconFocus: { x: 0.5, y: 0.3, s: 0.4 },   // 초상화가 나오면 머리에 맞춘다
  obtain: { type: 'flag', flag: 'recruit_gd_munin', hint: '외전 「이름 없는 언덕」에서 만날 수 있다' },
  cry: { sfx: 'crow_caw', pitch: 1.1 }, palette: ['#141018', '#2a2438', '#5a5468', '#c0142a', '#ff4a6a'],
  move: 'fly', size: { w: 24, h: 22 }, front: true, anchor: { dx: 30, dy: -118 }, speed: 1050, engage: 360, bias: 'lowhp', perch: 'shoulder',
  attack: { name: '부리 급강하', desc: '위에서 내리꽂혀 부리로 쪼아 댄다. 약해진 적을 먼저 노린다.', kind: 'dive', swoop: 0.28, box: { w: 40, h: 40 },
    mv: 1.0, element: 'dark', interval: 1.5, range: 360 },
  skill: { name: '까마귀 떼', desc: '까마귀 떼를 불러 주인 주위를 휩쓸어 적을 쪼고 밀쳐 낸다.', cd: 28, mv: 1.4, type: 'phys', element: 'dark', stun: 0.5,
    line: '까악— 까아악!' },
  assist: { name: '눈 쪼기', desc: '적의 눈을 쪼아 잠시 경직시킨다.', kind: 'dive', mv: 1.0, element: 'dark', stun: 0.4 },
  aura: { base: { crit: 3, critDmg: 8 }, perLv: { crit: 0.05, critDmg: 0.2 } },
  passive: { name: '까마귀의 눈', desc: '가까운 부서지는 벽과 가짜 벽을 윤곽으로 보여 준다. 반짝이는 것은 까마귀가 먼저 찾는다.', tiles: 7 },
  light: { color: '#ff4a6a', r: 50, i: 0.3 },
  join: '이름을 기억하는 늙은 까마귀가 당신의 어깨에 내려앉았다. 이제 이 까마귀가 당신의 이름도 기억할 것이다.', joinNarr: true,
  chips: ['까마귀 떼', '까마귀의 눈', '치명타 · 치명타 피해'],
}),
```
- `crow_caw`(`core/sfx_feel.js`, vol 2.6)는 수호신 울음으로 크다 — 합류 카드·스킬에서 귀에 거슬리면 EX2-MAP 이 cry pitch 를 조정하거나 부르는 쪽 vol 로 줄인다 (새 소리 파일 없음).
- `UNLOCK_ORDER` 의 끝이 `gd_munin` 이 된다 (chapter 22).

## 4. 이야기

### 4.1 설정 (기존 문장과 맞춘 것)

- 때: 2부 엔딩 뒤 첫서리가 내린 늦가을 밤 (알베르토는 "그해 겨울"에 눈을 감으므로 아직 살아 있다. 대본은 그를 부르지 않는다). 두 엔딩 모두에서 성립: 레이븐 줄은 `RVX`(가면/맨얼굴), 둥지어미는 "하늘의 흉터가 아물었든 말든"이라고 말한다.
- 둥지: 안개의 묘지(s02) 너머 언덕 위 옛 예배당과 종루. 결사의 칼은 그 언덕에 비석 없이 묻힌다(s02_t1). 처음 둥지를 세운 것은 R(레이븐)이고, 그가 장사꾼으로 떠도는 동안 **둥지어미 네메인이 서른 해 동안 둥지를 지켰다**. 결사 문신(s10_t2)·밀서(l18)·명부(s02)는 그대로.
- 둥지어미의 교리: "이름이 있는 칼은 망설이고, 망설이는 칼은 부러진다." 그래서 아이들을 번호로 불렀다(리아 = 열세 번). 알베르토 처리 명령은 그녀가 R 의 '보류'를 넘어 내렸다(s09_t2 의 모순이 풀린다).
- 사건: 레이븐이 2부 뒤 결사를 닫자(리아의 보고 "까마귀는 이제 쉰다 / 가면을 벗었다"), 둥지어미가 모든 칼에게 "이름을 반납하라"는 소집령을, 레이븐에게는 "R 을 처리하라"는 명령을 깃털로 보낸다.
- 반전(싸움 속, 50%): 가면이 깨지고 리아와 같은 붉은 눈이 드러난다. 레이븐이 밝힌다 — 네메인은 리아의 어머니. 리아의 아버지도 결사의 칼이었고 "돌아갈 곳이 생겨" 망설이다 죽었다(15% 대사). 결말: 둥지 문 앞에 아기를 내려놓던 밤 딱 한 번 부른 이름이 "리아". 비석 없는 무덤의 이름은 네메인과 늙은 까마귀 무닌이 전부 외우고 있었다 → 비석을 세운다.
- 동행: 리아가 플레이 중인 영웅이 아니면 `R('lia')` 동행 NPC, 리아면 `ifChar('lia', …)` 본인 분기(H). 레이븐은 직접 동행한다(대사는 `RVX`). 다른 영웅의 반응은 `H({...})` 일곱 자리(리아는 본인 분기에서) — 이졸데 포함(`p2_done` 이면 늘 합류해 있다).
- 새 CG 없음. 배경: `bg('s02_graveyard')`(제목 카드·언덕·아웃트로) · `bg('inn')`(흑묘 여관 창틀 장면). 화자 `'까마귀 가면의 목소리'` 는 s18_t1 과 같은 이름표.
- 글꼴: 새 글자가 생기면 `python3 tools/fonts/build_fonts.py --check` 가 실패한다 → EX2-INTEG 가 다시 만들거나(원본 필요) 그 글자를 피한다.

### 4.2 대본 (EX2-INTEG 가 `src/data/story_ex.js` `SCRIPTS_EX` 에 그대로 옮긴다)

도우미 (story_ex.js 머리, 기존 `N H S cg bg bgm se quake flag title L go ifChar RVX R recruit` 는 그대로 쓴다):

```js
const VOICE_N = '까마귀 가면의 목소리';   // s18_t1 과 같은 이름표 (초상화 없음) — 가면을 쓴 둥지어미가 모습을 보이기 전
const NM_FACE = 'portraits/b_nemain2';
const NM2 = (text) => ({ who: 'b_nemain', name: '네메인', portrait: NM_FACE, text });   // 가면이 깨진 뒤 (가면 쓴 동안은 S('b_nemain', …) = 둥지어미 · portraits/b_nemain)
const MU = (text, x) => ({ who: 'gd_munin', name: '무닌', portrait: 'portraits/cmp_gd_munin', text, ...x });
const CROWC = '#ff4a6a';
```

```js
  // ═══════════════════════════ 외전 22장 까마귀의 이름 (docs/specs/ex_s22.md) ═══════════════════════════
  s22_intro: [
    bgm('story'), bg('s02_graveyard'),
    title('외전', '이름 없는 언덕'),
    bg('inn'),
    N('공허와의 싸움이 끝나고, 에슈빌에 첫서리가 내린 밤이었다.'),
    se('crow_caw'),
    N('흑묘 여관 창틀에 까마귀 한 마리가 내려앉았다. 부리에 검은 깃털 하나를 물고 있었다.'),
    N('깃대에 감긴 밀랍 봉인에는 까마귀 결사의 문장이 찍혀 있었다.'),
    ifChar('lia', 'self'),
    N('깃털을 받아 든 리아의 얼굴이 굳었다.'),
    R('lia', '…둥지에서 온 소집령이야. "모든 칼은 둥지로 돌아오라. 이름을 반납할 때다."'),
    R('lia', '결사는 끝났어. 레이븐이 그렇게 말했잖아. 그런데 이 봉인은… 둥지어미 거야.'),
    H({ kael: '이름을 반납하라니, 그게 무슨 소리지. …리아, 혼자 갈 생각은 하지 마라.',
      sera: '이름을 돌려 달라니요…. 이름은 누가 빼앗을 수 있는 게 아니에요. 리아, 같이 가요.',
      victor: '이름을 반납하라? 세상에서 제일 이상한 청구서로군. 좋아, 따지러 같이 가 주지.',
      bran: '둥지어미라 함은… 그대를 길러 낸 이요? 어떤 연유든 그대를 홀로 보내지는 않겠소.',
      azel: '결사의 둥지라. 한때 내 목을 노리던 자들의 집이군. …그래도 네가 간다면 나도 간다.',
      isolde: '부르는 쪽이 누구든, 동료를 혼자 보내는 기사는 없다. 앞장서라, 리아.',
      default: '이름을 반납하라니…. 리아, 같이 가자.' }),
    R('lia', '…맘대로 해. 대신 거기선 내 말 들어. 둥지는 길 하나 잘못 들면 못 나오는 곳이야.'),
    go('self_end'),
    L('self'),
    H('…둥지의 봉인이네.'),
    N('깃털 안쪽에 짧은 글이 적혀 있었다. 촛불 하나 없는 방에서 수없이 들었던 그 목소리를 닮은 글씨였다.'),
    N('"모든 칼은 둥지로 돌아오라. 이름을 반납할 때다."'),
    H('결사는 끝났어. 레이븐이 그렇게 말했어. …그런데 둥지어미는 아직도 칼을 부르는구나.'),
    H('이름을 반납하라고? 이건 내가 고른 이름이야. 아무한테도 안 돌려줘.'),
    L('self_end'),
    N('그때 여관 문이 열리고 레이븐이 들어섰다. 그의 손에도 같은 검은 깃털이 들려 있었다.'),
    ...RVX('…내게도 왔다. 다만 내 깃털에 적힌 건 소집령이 아니더군.'),
    ...RVX('"R 을 처리하라." 둥지어미가 모든 칼에게 내린 마지막 명령이다.'),
    ifChar('lia', 'self2'),
    R('lia', '…당신을 처리하라고? 결사를 세운 사람을?'),
    go('self2_end'),
    L('self2'),
    H('…당신을 처리하라고? 결사를 세운 사람을?'),
    L('self2_end'),
    ...RVX('결사를 닫은 건 나다. 칼들에게 이름을 갖고 살라고 했지. 그 여자에게는 그게 배신이었던 모양이다.'),
    ...RVX('둥지는 안개의 묘지 너머, 이름 없는 언덕 위의 옛 예배당에 있다. 이번엔 나도 간다. …처음 그 둥지를 지은 게 나니까.'),
    bg('s02_graveyard'),
    N('그날 밤, 일행은 안개의 묘지를 지나 언덕을 올랐다. 언덕 아래 묘지에는 십자가가 빼곡했지만, 언덕 위의 무덤들에는 아무것도 서 있지 않았다.'),
    N('[TIP] 언덕에는 방향이 바뀌는 산바람이 분다. 돌풍 경고가 뜨면 무너진 담장 뒤로 몸을 숨기고, 상승 기류를 타고 옛 종루로 올라라. 얼굴 없는 자는 등을 보이는 순간 다가오고, 그림자 헌터는 한 박자 늦게 당신을 흉내 낸다.'),
  ],
  // r3 까마귀 학당 (세이브 방 입구, '!' 10열)
  s22_t1: [
    N('무너진 회랑 안뜰. 칼자국이 빼곡한 나무 인형들이 줄지어 서 있다. 인형마다 이름 대신 번호가 새겨져 있었다.'),
    ifChar('lia', 'self'),
    R('lia', '…여기서 처음 칼을 쥐었어. 일곱 살이었나. 인형 하나를 다 베기 전엔 밥을 안 줬지.'),
    R('lia', '저 끝의 열세 번 인형. 저게 내 거였어. 이름이 없으니까 다들 번호로 불렀거든.'),
    H({ kael: '번호로 불리던 아이가 이제는 제 이름으로 싸운다. …그거면 됐다.',
      sera: '일곱 살 아이에게 밥 대신 칼이라니요…. 그때 아무도 리아를 안아 주지 않았어요?',
      victor: '열세 번이라. 하필 재수 없는 번호를 받았군. …그래도 살아남았으니 네가 이긴 거다.',
      bran: '기사단의 종자들도 어린 나이에 검을 들었소. 허나 이름까지 빼앗지는 않았소.',
      azel: '이름 대신 번호라. 아버지의 연구소에서도 실험체를 그렇게 불렀다. 제0호처럼. …좋은 기억은 아니군.',
      isolde: '기사단도 견습생을 엄하게 길렀다. 하지만 창에는 늘 제 이름을 새기게 했지.',
      default: '번호로 불렸다니…. 그래도 넌 이제 리아야.' }),
    R('lia', '…쓸데없는 얘기 했네. 가자. 이 위가 종루야.'),
    go('end'),
    L('self'),
    H('…여기서 처음 칼을 쥐었지. 일곱 살이었나. 인형 하나를 다 베기 전엔 밥이 없었어.'),
    H('저 끝의 열세 번 인형. 내 거였어. 이름이 없으니까 다들 번호로 불렀지.'),
    N('인형의 목에는 같은 자리를 몇 번이고 그은 칼자국이 겹겹이 남아 있었다. 어린 손이 닿는 높이였다.'),
    H('…쓸데없는 생각. 가자. 이 위가 종루야.'),
    L('end'),
    ...RVX('저 인형들을 세운 것도, 갈 곳 없는 아이들을 이리로 데려온 것도 처음엔 나였다. 그 여자는 내가 비운 자리를 서른 해 동안 지켰지.'),
  ],
  // r5 가면의 회랑 (세이브 방 입구, '!' 10열)
  s22_t2: [
    se('crow_caw'), quake(4, 0.4, CROWC),
    N('종루로 오르는 회랑. 벽 한 면이 까마귀 가면으로 빼곡하다. 가면 아래에는 아무 이름도 적혀 있지 않았다.'),
    S(VOICE_N, '돌아왔구나, 열세 번.'),
    S(VOICE_N, '여기 걸린 가면은 모두 돌아오지 못한 칼들이다. 이름이 없으니 슬퍼할 사람도 없지. 그것이 칼을 지키는 방법이다.'),
    ifChar('lia', 'self'),
    R('lia', '…그 목소리. 잊을 리가 없지. "칼에게는 이름이 없다." 둥지에 처음 온 밤에 들은 말이야.'),
    R('lia', '촛불 하나 없는 방에서 나한테 그 말을 한 게… 당신이었구나.'),
    H({ kael: '슬퍼할 사람이 없는 게 지키는 거라고? 그건 지키는 게 아니라 버리는 거다.',
      sera: '이름 없이 떠난 분들을 위해서라도 기도할게요. 주님은 그분들의 이름을 다 아세요.',
      victor: '슬퍼할 사람이 없으면 편하긴 하겠지. 장부 정리도 쉽고. …그래서 더 역겹군.',
      bran: '이름 없이 쓰러진 자들이라…. 기사단의 벽서에는 종자의 이름까지 적혀 있었소.',
      azel: '가면만 남은 벽이라. 아버지의 성에 걸린 초상화들보다 더 쓸쓸하군.',
      isolde: '쓰러진 자의 이름을 지우는 둥지라니. 하늘 기사단이었다면 용서하지 않았을 거다.',
      default: '이름이 없으면 슬퍼할 사람도 없다고…? 그건 틀렸어.' }),
    go('end'),
    L('self'),
    H('…그 목소리. 둥지에 처음 온 밤에 들었어. 악몽 속에서도 몇 번이나.'),
    H('"칼에게는 이름이 없다." 촛불 하나 없는 방에서 나한테 그 말을 한 게… 당신이었구나.'),
    L('end'),
    ...RVX('그만 숨어라, 둥지어미. 아이들은 이미 이름을 얻었다. 네가 붙잡고 있는 건 빈 둥지뿐이다.'),
    S(VOICE_N, '빈 둥지로 만든 건 너다, R. 올라오너라. 종루에서 기다리마.'),
  ],
  b_nemain_pre: [
    se('crow_caw'), quake(10, 0.8, CROWC),
    N('무너진 종루 꼭대기. 깨진 종 아래에 키 큰 여인이 서 있었다. 까마귀 부리 가면에, 수천 장의 검은 깃털을 엮은 망토. 망토 자락마다 붉은 눈들이 반짝였다.'),
    S('b_nemain', '왔구나, 열세 번. 그리고 둥지를 버린 까마귀.'),
    S('b_nemain', '평생 장사꾼 흉내나 내며 떠돌던 네가, 이제 와서 칼들에게 이름을 갖고 살라고? 하늘의 흉터가 아물었든 말든, 밤은 다시 온다.'),
    ...RVX('그래서 아이들을 다시 이름 없는 칼로 만들겠다는 거냐. 너도 보지 않았느냐. 그 아이들이 어떻게 죽어 갔는지.'),
    S('b_nemain', '봤지. 그러니 이름을 주지 않는 것이다. 이름이 있는 칼은 망설이고, 망설이는 칼은 부러진다.'),
    ifChar('lia', 'self'),
    R('lia', '알베르토를 처리하라고 한 것도 당신이지. R 은 보류라고 했는데.'),
    S('b_nemain', 'R 은 늘 물렀다. 칼은 이유를 묻지 않는다. …이름을 내놓아라, 열세 번.'),
    R('lia', '싫어. 이건 내가 고른 이름이야. 리아 크로우. 가져가고 싶으면 날 이겨 봐.'),
    H({ kael: '이름은 내놓는 게 아니라 지키는 거다. 리아, 등은 내가 맡는다!',
      sera: '이름은 주님이 그 사람을 부르시는 소리예요. 아무도 빼앗을 수 없어요!',
      victor: '이름 압류라. 그런 청구서엔 총알로 답하는 게 내 방식이지.',
      bran: '이름을 걸고 싸우는 것이 기사요. 리아의 이름, 우리가 함께 지키겠소!',
      azel: '이름을 지운 칼이라. 이름 대신 번호로 불리던 것들의 끝을, 나는 아버지의 성에서 봤다.',
      isolde: '이름을 지우는 둥지라면 이 창으로 무너뜨리겠다. 리아, 옆은 내가 맡는다!',
      default: '리아의 이름은 리아의 것이다. 물러서!' }),
    go('end'),
    L('self'),
    H('알베르토를 처리하라고 한 것도 당신이지. R 은 보류라고 했는데.'),
    S('b_nemain', 'R 은 늘 물렀다. 칼은 이유를 묻지 않는다. …이름을 내놓아라, 열세 번.'),
    H('싫어. 이건 내가 고른 이름이야. 리아 크로우. 가져가고 싶으면— 날 이겨 봐.'),
    L('end'),
    S('b_nemain', '…그렇다면 둥지의 방식대로 거둬 가마.'),
  ],
  // 페이즈 전환 (체력 50%, form2 '네메인'): 가면이 깨진다 — 보스 코드(e_nemain.js PATTERNS.transitions[1])가 민다
  b_nemain_unmask: [
    se('break_wall'), quake(12, 0.8, CROWC),
    N('쩌저적— 부리 가면에 금이 가더니, 두 쪽으로 갈라져 떨어졌다.'),
    N('가면 아래 드러난 얼굴에는 리아와 똑같은 붉은 눈이 있었다. 검은 머리카락에는 은빛이 섞여 있었다.'),
    ...RVX('…더는 숨길 수 없겠군.'),
    ifChar('lia', 'self'),
    ...RVX('리아. 저 사람은 네메인. …네 어머니다.'),
    R('lia', '…뭐?'),
    H({ kael: '어머니라고…? 레이븐, 그걸 지금까지 숨기고 있었나!',
      sera: '세상에…. 리아, 괜찮아요? 제가 옆에 있을게요.',
      victor: '하, 집안싸움이었군. …리아, 방아쇠는 내가 당긴다. 넌 숨부터 쉬어.',
      bran: '어머니와 딸이 칼을 겨누다니…. 이 싸움, 어떻게든 매듭을 지어야 하오.',
      azel: '제 자식을 칼로 길러 낸 어미라…. 리아, 눈을 돌리지 마라. 끝을 봐야 끝난다.',
      isolde: '어머니라니…. 리아, 창을 거두라고는 하지 않겠다. 다만 쓰러뜨리지 말고 멈춰 세우자.',
      default: '리아의… 어머니라고?' }),
    go('end'),
    L('self'),
    ...RVX('리아. 저 사람은 네메인. …네 어머니다.'),
    H('…뭐?'),
    H('장난하지 마. 엄마 같은 거… 처음부터 없었어.'),
    L('end'),
    NM2('보지 마라. …칼에게는 어미가 없다.'),
    NM2('오너라. 둥지의 마지막 가르침이다.'),
  ],
  // 체력 15% 이하 한 번 (그믐 강제와 함께, 스토리 모드·처음만)
  b_nemain_last: [
    se('crow_caw'), quake(6, 0.5, CROWC),
    N('종루의 불빛이 하나씩 꺼졌다. 어둠 속에 붉은 눈 한 쌍만이 남았다.'),
    NM2('이름이 있으면 돌아갈 곳이 생긴다. 돌아갈 곳이 생기면, 칼은 돌아가다가 죽는다.'),
    NM2('네 아비가 그랬다. 그러니 너만은—'),
    ifChar('lia', 'self'),
    R('lia', '시끄러워! 그 얘기, 끝까지 들어 줄 테니까 칼부터 내려놔!'),
    go('end'),
    L('self'),
    H('시끄러워! 그 얘기, 끝까지 들어 줄 테니까… 칼부터 내려놔!'),
    L('end'),
  ],
  // 굴복 연출(까마귀 떼가 흩어지고 무릎을 꿇는다, 5초) 뒤
  b_nemain_post: [
    N('수천 마리의 까마귀가 한꺼번에 날아올라 종루 위 하늘을 덮었다가, 하나둘 흩어져 갔다.'),
    N('깨진 종 아래, 네메인이 무릎을 꿇고 있었다. 손에서 떨어진 단검 두 자루가 돌바닥에서 맑게 울렸다.'),
    NM2('…졌구나. 이름 있는 칼에게.'),
    NM2('달이 지기 전에 언덕 아래 무덤으로 오너라. 보여 줄 것이 있다.'),
  ],
  // 합류(recruit + 같은 플래그)와 ex_s22_done 은 첫 조건 줄(ifChar · RVX 의 if)보다 앞 — results.js hasNewBranch · tools/test_companions 'recruit'
  s22_outro: [
    bgm('story'), bg('s02_graveyard'),
    N('달빛이 언덕을 하얗게 비추고 있었다. 봉분만 있고 비석은 없는 무덤들이 끝없이 늘어서 있었다.'),
    N('네메인은 무덤마다 납작한 돌을 하나씩 세우고, 단검 끝으로 무언가를 새기고 있었다. 이름이었다.'),
    NM2('…여기 묻힌 칼들의 이름이다. 아무도 부르지 않았지만, 나는 하나도 잊지 않았다.'),
    NM2('이름을 주지 않으면 슬퍼하지 않아도 될 줄 알았다. 그런데 밤마다 하나씩, 전부 외우고 있더구나.'),
    MU('(까악. 네메인의 어깨에 앉아 있던 늙은 까마귀가 날아올라, 새 비석마다 한 번씩 내려앉는다.)', { name: '늙은 까마귀' }),
    NM2('무닌이다. 내가 잊을까 봐, 서른 해 동안 이 녀석이 대신 외워 주었지.'),
    N('무닌은 마지막 비석 위를 한 바퀴 돌더니, 헌터의 어깨에 내려앉았다.'),
    NM2('…그 녀석이 너를 골랐구나. 데려가거라. 이제 둥지에는 외울 이름이 남지 않았다.'),
    ...recruit('gd_munin'),
    flag('ex_s22_done'),
    ifChar('lia', 'self'),
    R('lia', '…내 이름. 누가 지어 준 거야.'),
    NM2('네가 둥지에 온 밤, 문 앞에 너를 내려놓으면서… 딱 한 번 불렀다. 리아.'),
    NM2('네가 그 이름을 스스로 골랐다는 말을 들은 날, 나는 밤새 한숨도 자지 못했다.'),
    R('lia', '…그래도 고른 건 나야.'),
    NM2('그래. 네가 골랐다.'),
    R('lia', '용서는… 아직 몰라. 비석 다 세우면, 그때 다시 올게. …엄마.'),
    N('네메인은 대답하지 못했다. 단검을 쥔 손등 위로 눈물이 떨어졌다.'),
    H({ kael: '…다시 오겠다는 약속이면 충분하다. 사냥꾼들은 늘 그 약속 하나로 살아 돌아왔으니까.',
      sera: '주여, 이 두 사람에게 시간을 주세요. 비석을 다 세울 만큼의, 아주 긴 시간을요.',
      victor: '비석 세우는 일이면 나도 거들지. 돌 나르는 값은… 이번엔 공짜다. 진짜로.',
      bran: '이름을 새기는 일이라면 이 손도 보태겠소. 쓰러진 칼들도 이제 편히 잠들 것이오.',
      azel: '어머니라고 부를 수 있을 때 불러 둬라, 리아. …그 말을 못 하게 되는 날은 생각보다 빨리 온다.',
      isolde: '이름을 새기는 데에는 창끝도 쓸 만하다. 리아, 다음 비석은 내가 새기마.',
      default: '…다행이다, 리아. 진짜로.' }),
    go('end'),
    L('self'),
    H('…내 이름. 누가 지어 준 거야.'),
    NM2('네가 둥지에 온 밤, 문 앞에 너를 내려놓으면서… 딱 한 번 불렀다. 리아.'),
    NM2('네가 그 이름을 스스로 골랐다는 말을 들은 날, 나는 밤새 한숨도 자지 못했다.'),
    H('…그래서였구나. 아무 이름이나 고를 수 있었는데, 그 이름만 머릿속에 남아 있었어.'),
    H('그래도 고른 건 나야.'),
    NM2('그래. 네가 골랐다.'),
    H('용서는… 아직 몰라. 비석 다 세우면, 그때 다시 올게. …엄마.'),
    N('네메인은 대답하지 못했다. 단검을 쥔 손등 위로 눈물이 떨어졌다.'),
    L('end'),
    ...RVX('"현장 요원에게는 알리지 말 것. 칼끝이 무뎌지니까." …내가 쓴 규칙이었다. 틀린 규칙이었지.'),
    ifChar('lia', 'self2'),
    R('lia', '알면 됐어. 주먹은 나중에. 지금은 비석 세우느라 손이 바빠.'),
    go('end2'),
    L('self2'),
    H('알면 됐어. 주먹은 나중에. 지금은 비석 세우느라 손이 바빠.'),
    L('end2'),
    ...RVX('헤헤, 무서워라. …그 성질, 이제 누굴 닮았는지 알겠지.'),
    N('그날 이후, 이름 없는 언덕에는 비석이 하나둘 서기 시작했다. 비석마다 이름이 있었다.'),
    ifChar('lia', 'self3'),
    R('lia', '결사 보고서, 진짜 마지막 장. "둥지는 비었다. 까마귀들은 모두 이름을 얻었다."'),
    go('end3'),
    L('self3'),
    H('결사 보고서, 진짜 마지막 장. "둥지는 비었다. 까마귀들은 모두 이름을 얻었다."'),
    L('end3'),
    N('— 외전 「이름 없는 언덕」 끝 —'),
  ],
```

- 성당 힌트 한 줄 (`town/church.js`, s21 줄 아래): `if (F.p2_done && has(P.unlocked, 's22') && !P.cleared?.s22) p2.push('안개 묘지 너머 언덕에서 밤마다 까마귀 떼가 운다더군. 까마귀 결사의 둥지가 거기 있다지…. 성문 밖 지도를 펼쳐 보게.');`
- 세계 지도 해금 연출 `REVEALS.s22 = { title: '외전 · 이름 없는 언덕', sub: '안개의 묘지 너머에서 까마귀들이 이름 없는 칼을 부른다', color: '#ff4a6a', tcol: '#ffd0d8', crack: '#ffd0d8', fx: 'dark' }`.
- 모순 점검: 리아는 s02 에서 처음 나온다(묘지·결사 무덤) · s09 처리 명령/l18 보류 · s10 기록 없는 선배(둥지가 기록을 지웠다는 교리와 맞음) · s14 "이름은 내가 골랐어" · s18 입단식 목소리 · b_mara_pre "엄마 같은 거 없어" · 레이븐 "꼬마 까마귀"/"누굴 닮았는지" · 두 엔딩의 보고서 줄 · 알베르토 생존(겨울 전) · 아젤 "결사 명단 두 번째 줄"(s02_outro) · 브란 벽서 l15(종자 브란의 이름) · 아젤 제0호 l07 — 모두 맞물린다. 아르겐(s21)은 언급하지 않는다.

## 5. 예산

| 항목 | 기준 |
|---|---|
| Kling | **상한 120크레딧** (보스 + 초상화 셋: `b_nemain` · `b_nemain2` · `cmp_gd_munin`). 예상 ≈ 34크레딧(17장), 재시도 포함 최대 ≈ 50 |
| APK lo 그림 단계 | 지금 ≈ **45.1 MiB / 48 MiB**. lo 단계에는 bg/cg/portraits 의 lo 사본과 채색 아틀라스 원본, 코드가 실린다. 예상 증가: 아틀라스 ≤ 160 KiB + manifest 4 KiB · lo 초상화 3 × ≈ 27 KiB · `e_nemain.js` ≈ 70 KiB · 채색 렌더러 ≈ 25 KiB · `maps/s22.js` ≈ 24 KiB · 대본 ≈ 30 KiB · 까마귀 그림·데이터·통합 ≈ 15 KiB → **+≈ 0.40 MiB → ≈ 45.5 MiB** (여유 ≈ 2.5 MiB). **이 묶음의 상한 +0.7 MiB (≤ 45.8 MiB)** — 넘으면 아틀라스 td 를 낮추고, 그래도 넘으면 리드에게 (임의로 기준을 올리지 않는다) |
| 새 배경·CG·소리 | 없음 (`bg/s02_graveyard` · `bg/inn` · `crow_caw` 재사용) |
| 성능 | 보스 그리기 휴대폰 ≤ 0.6 ms (까마귀 떼 수 × 품질), 수호신 한 마리 ≤ 0.15 ms (MASTER_PLAN §5.2) |

## 6. 작업 분담

EX2-MAP 과 EX2-BOSS 는 동시에, EX2-INTEG 는 둘이 끝난 뒤 (대본·서버 목록은 먼저 시작해도 된다). 각 1–1.5시간. 요청은 `/tmp/claude-0/plan/ex2_requests.md` 에 `[보낸이→받는이] 내용`.

| 담당 | 파일 (서로 겹치지 않는다) |
|---|---|
| **EX2-MAP** (맵 + 수호신) | `src/data/maps/s22.js`(새 파일) · `src/data/stages.js` 의 s22 import·STAGES 항목(§1.1 — **`STAGE_ORDER_P2` 는 손대지 않는다**) · `src/data/feel_move.js` `s22: 'dirt'`(s02 와 같은 발소리) · 맵 검증 · **수호신**: `src/data/companions.js` `gd_munin`(§3 그대로, 머리말 수 12) · `src/game/guardian.js`(`MUNIN` 별칭 + `OWL.passive` 울음 한 줄) · `src/render/guardians_b.js`(`GUARDIAN_DRAW_B.gd_munin` 까마귀 그림) · `tools/test_guardians.mjs`(사례 `munin`: 급강하 타격·스킬(GENERIC)·비밀 윤곽·어깨 앉기, 오류 0) · `tools/test_companion_state.mjs`(GUARD_TABLE 행 `['gd_munin', '무닌', '이름을 기억하는 까마귀', 'flag:recruit_gd_munin', 22, 'portraits/cmp_gd_munin', 'crow_caw']`, `UNLOCK_ORDER` 끝 = `gd_munin`) |
| **EX2-BOSS** | `src/game/bosses/e_nemain.js`(새) · `src/game/bosses/bosses_e.js` · `src/game/bosses/lazy.js`(한 줄) · `src/data/bosses_e.js`(`b_nemain`) · `src/data/items.js`(`u_nemain` 한 항목) · `src/render/painted/bosses/b_nemain.js`(새) · `src/render/painted/reg/ex-boss.js`(한 줄) · `tools/painted/{configs/b_nemain.json, poses/b_nemain.mjs, prompts/ex2-boss.mjs, raw/b_nemain/*}` · `assets/painted/bosses/b_nemain/*` · `assets/portraits/{b_nemain, b_nemain2, cmp_gd_munin}.webp` + `assets/lo/portraits/*`·`assets/lo/index.json`(make_variants) · `tools/kling/manifest_ex2-boss.json` · `tools/gallery_bosses_e.html`(id 추가) · `tools/test_nemain.mjs`(새) · `docs/art/BOSS_PIPELINE.md`(표 한 줄) |
| **EX2-INTEG** (나중) | `src/data/story_ex.js`(§4.2) · `src/data/stages.js` 는 **`STAGE_ORDER_P2` 한 줄과 s22 항목의 `intro: ''`/`outro: ''` 자리표시 지우기만** · `src/scenes/town/worldmap.js` · `src/scenes/town/church.js` · `src/scenes/front/arcade.js` · `netlify/lib/gamedata.mts` · (필요할 때만) `src/scenes/menu/*`·`src/scenes/front/highscore.js` · 시험 `tools/integration.mjs`·`tools/test_part2.mjs`·`tools/test_companions.mjs`·`tools/test_tower.mjs`·`tools/online/test_online.mjs`·`tools/qa/run_all.mjs` · 글꼴 `assets/fonts/*`(build_fonts 결과) · 문서 `docs/specs/ex_s22.md` §7·`docs/specs/MASTER_PLAN.md`(20행 예산 메모)·`docs/ARCHITECTURE.md`·`docs/HANDOFF.md` |

- 넘겨받는 값: `gd_munin.iconFocus` 는 EX2-MAP 의 파일이지만, 초상화가 EX2-MAP 이 끝난 뒤에 나오면 EX2-BOSS 가 요청 파일에 값을 적고 EX2-INTEG 가 그 한 필드만 고친다.
- 보스 방 모양을 바꾸면 요청 파일로 알린다 — 보스 로직의 `PATTERNS.room`·`floorRow` 를 같이 맞춘다.
- 커밋은 10분마다 자동 저장된다(예상된 일). 밀어 올리기(push) 하지 않는다.

## 7. 통합 기록 (EX2-INTEG)

| 항목 | 결과 |
|---|---|
| 해금·순서 | `STAGE_ORDER_P2` 끝에 `'s22'` → `SIDE_STAGES = ['s21', 's22']`. s22 항목의 `intro: ''`/`outro: ''` 자리표시를 지워 기본값 `s22_intro`/`s22_outro`. `maps/s22.js` r3 `triggers: ['s22_t1']` · r5 `['s22_t2']` (EX2-MAP 자리표시 교체). `town/worldmap.js` 해금 고리는 그대로(`p2Ended` = `p2_done`·`ending_p2`·`ending_p2true` 이면 처음 지도를 열 때 한 번 `s22_revealed`) — 연출은 `mkReveal(id, STAGES[id].page ?? 1)` 로 그 외전이 놓인 쪽에서. 처음 지도를 여는 2부 완주 세이브는 s21(이계 Ⅱ) → s22(악마성 Ⅰ) 연출이 차례로 나온다 (`startReveal` 이 쪽을 넘긴다 — 확인: 데스크톱·phone1·phone2 모두 1/s21 → 0/s22 → page 0, s22 선택) |
| 세계 지도 | `SIDE_FROM.s22 = 's02'`, `REVEALS.s22` (§4.2 그대로). 외전 노드는 `sideNodes(page)` 한 곳에서 `(STAGES[id].page ?? 1) === page` 인 것만 — page 0 은 투기장 노드 앞(노드 순서 s01…s13 · s22 · 투기장). **page 0 장 사슬에서 `n.side` 를 뺀다** (s12→s22 길 없음, 외전 길은 s02→s22 하나). 점선 고리·인장 '외전' 은 두 쪽 모두 (page 0 잉크 = `PAGES[0].path` `#8a1426`, 외전 갈림길도 같은 잉크). `prefersP2` 의 외전 판정은 page 1 외전만 (s22 가 가장 최근 미클리어면 악마성 Ⅰ 로 연다). 정보판 외전 칸은 쪽에 상관없이 (유물 칸 대신) 'SIDE STORY · 외전' + 외전 안내 + 동료 칸 (`SIDE_INFO`: s21 아르겐 · s22 '까마귀가 이름을 부른다' / '늙은 까마귀 무닌 합류'). **mapPos `{x: 0.13, y: 0.5}` → `{0.13, 0.55}`**: 0.5 는 데스크톱(1280×720)에서 노드 고리가 나침반 아래 테두리에 닿았다. 0.55 에서 이름표 겹침 0 · 숨김 0 (데스크톱 아래, phone1·phone2 위), 1→2장 길과 떨어져 있고 가장 가까운 노드 s01 까지 UI 52–71 px (다른 이웃 노드 쌍과 같은 수준). 스크린숏 `/tmp/claude-0/ex2_integ/worldmap055/{desk,phone1,phone2}_{ranked,fresh}_{reveal1,reveal2,page0_s22,page0_s02sel}.png` |
| 진행 숫자·표시 | 바꿀 것 없음 확인 (모두 `stage.side` 일반 처리): `results.js`(장 진행 안 올림) · `slots.js` 가장 먼 장 · `access.js` '외전 이름 없는 언덕' · `tab_system.js` 2부 칸 끝 · `tab_bestiary.js`(외전 열렸거나 쓰러뜨렸을 때만) · `arcade_run.js`·`arcade_tower.js` 순서에서 뺌 · `highscore.js` 외전 순위표(`exKnown`). 성당 힌트 한 줄 (`town/church.js`, s21 줄 아래 — '안개 묘지' → 스테이지 이름 '안개의 묘지' 로) |
| 이야기 | `data/story_ex.js`: 도우미 `VOICE_N NM_FACE NM2 MU CROWC` + 스크립트 8개(`s22_intro` 컷신 17줄 · `s22_t1` · `s22_t2` · `b_nemain_pre` · `b_nemain_unmask` · `b_nemain_last` · `b_nemain_post` · `s22_outro` 컷신 22줄 — 한 번에 보이는 줄 수는 리아·다른 영웅 분기가 같다), 머리말 담당 스크립트·플래그 목록에 22장. 모든 goto 목표 있음 · 컷신 줄바꿈 측정(서술 ≤ 3줄 / 4, 화자 ≤ 2줄 / 3 — TIP 한 줄 그대로 3줄). 대본 손질(말투·사실 맞춤): ① 브란 `그대를 길러 낸 이요?` → `이 말이오?`(브란의 하오체 의문 "…단 말이오?") ② 게임 글 `R 을/R 은` → `R을/R은` (기존 `"R"이`) ③ s22_t1·t2 장면 서술의 시제를 한 줄 안에서 현재로 (`새겨져 있다`·`적혀 있지 않다`, s21_t1·t2 와 같게) ④ 목소리 `가면은 모두 돌아오지 못한 칼들이다` → `칼들의 것이다` ⑤ 가면이 깨진 서술 `얼굴에는 … 붉은 눈이 있었다` → `가면 아래로 드러난 것은 … 붉은 눈이었다` ⑥ 이졸데 `창을 거두라고는` → `칼을 거두라고는`(리아는 단검) ⑦ `언덕 아래 무덤으로 오너라` → `무덤 언덕으로 내려오너라` (비석 없는 무덤은 언덕 위 — 언덕 아래는 십자가 묘지, 아웃트로도 언덕) ⑧ 네메인 `밤마다 하나씩, 전부 외우고 있더구나` → `밤마다 하나씩 되뇌다 보니, 전부 외우고 있더구나`(1인칭 '-더구나') ⑨ `이 녀석이 대신 외워 주었지` → `이 녀석도 함께 외워 주었지` (바로 앞에서 "나는 하나도 잊지 않았다") · EX2-VERIFY: ⑩ 레이븐 `둥지어미가 모든 칼에게 내린 마지막 명령이다` → `둥지로 돌아간 칼들이 받을 마지막 명령이다` (리아도 칼인데 소집령만 받았고 바로 다음 줄에서 놀란다) ⑪ `그 목소리를 닮은 글씨였다` → `그 목소리가 들려오는 듯한 글씨였다` |
| 동료 | `recruit('gd_munin')` + `recruit_gd_munin` + `ex_s22_done` 이 첫 조건 줄보다 앞. 아웃트로(리아로 건너뛰기 포함) → 마을 → 합류 카드 '무닌 · 이름을 기억하는 까마귀 · 수호신' (`companionJoin`, owned, pending 비움 — 스크린숏 `/tmp/claude-0/ex2_integ/story/outro_after.png`). 트리거 r3·r5 는 걸어서 발동 (kael·lia·isolde), 보스 전·전환 대사는 스토리 모드에서 `debugPhase(1)` 로 `b_nemain_unmask` (초상화 `portraits/b_nemain2`, 이름 '네메인'). 보스 쪽 연결(EX2-BOSS): `b_nemain_unmask` 는 전환 끝(스토리 1회), `b_nemain_last` 는 15% 이하 그믐 시작(스토리 1회), `b_nemain_post` 는 `world.afterClear` 뒤 무릎 꿇은 보스 위에서, 처치 부제는 '격파' → '결착' 만 바뀐다 |
| 아케이드 | `BOSS_ORDER` 끝에 `'b_nemain'` (22명, `STORY_BOSSES = 20` 그대로). `COURSES` 끝에 7 '외전편 · 외전 보스 2연전'(from 20 to 22, 아르겐 → 네메인) · 8 '전 보스 연속 · 22연전' (`ex: true`; 0–6 번호·내용 그대로 — 기록 키). 확인: `visibleCourses(p2, ex)` 0–8 / ex 없으면 0–4 / 1부만 0–2, `courseBosses(7)` = [b_argen, b_nemain], 8 = 22명, 6 = 21명, 코스 7 시작 → 첫 라운드 b_argen. 서바이벌 `arenaBosses(true, true)` 끝 b_argen · b_nemain (ex 없으면 b_nihil 까지), 탑 `sideBosses()` = [b_argen, b_nemain] (41층 이후 lateBosses). 머리말 주석 갱신 |
| 서버 | `gamedata.mts`: `STAGE_LEVELS.s22 = 72`(→ `practice:s22:*` 보드) · `P2_STAGES` + s22 · `SIDE_STAGES = ['s21', 's22']` · `DAILY_STAGE_IDS` 는 그대로 s01~s20 (외전 제외, 이미 정해진 날짜의 도전 그대로) · **`COURSE_COUNT = 9`** (= arcade.js `COURSES` 수, test_online 이 센다). `validate.mts`·`online.mts`·`runs.mts`·`boards.mts` 는 바꿀 것 없음 (`bossrush:<n>` 은 `COURSE_COUNT` 로 검사) |
| 시험 | `tools/integration.mjs` STAGES 에 s22 (케이스 `s22` · `s22_boss`) · `test_part2.mjs` 외전 검사를 목록 `EX_LIST`(s21 · s22, page·대본 8개·트리거·합류·`ex_*_done`, 외전 = `STAGE_ORDER_P2` 의 side 차례) · `test_companions.mjs` recruit `gd_munin: 's22_outro'` · `test_tower.mjs` lateBosses `['b_argen', 'b_nemain']` 둘 다 41층 이후만 + `BOSS_ORDER` 외전 꼬리 · `test_online.mjs` STAGE_IDS 22 · SIDE_STAGES 둘 · 일일 외전 제외 · `practice:s22:normal`·`bossrush:8:hard` 유효(런 시작 시드 9개) · 보드 `practice:s22:hard`·`bossrush:8:normal` 빈 보드 · 무효 예시 `practice:s23` · `bossrush:9` · `run_all.mjs` 에 `nemain` (runtime, 20분). 결과 (2026-10-05): validate_maps 오류 0 (경고 1 — 예전부터의 s11 r4) · test_part2 --static 23/23 · integration title,hub,worldmap,menu,arcade,tower,s02,s21,s21_boss,s22,s22_boss 11/11 · --mobile title,worldmap,s22 3/3 · test_nemain 51/51 (다섯 번 중 세 번; 두 번은 서로 다른 한 검사 — '까마귀 급습' 2페이즈 수 · '사망→부활' 어둠 복원 — 가 흔들려 50/51, EX2-BOSS 에 요청, 통합 변경과 무관) · test_argen 55/55 · test_guardians --case munin 1/1 · test_companion_state 81 · test_companions 22/22 · test_tower 4/4 · test_save_v2 72 · test:online 24 (건너뜀 5) · test:api 65 (건너뜀 10) · test:online:client 15/15 · test:client 11/11 · playthrough s22 6/6 방 · 사망 0 · 보스 33.2초 · painted_registry 35 pass · 1 warn(mt_argen·gd_munin 채색 없음 — 설계대로 벡터) · bindings 43/43 · build_fonts --check 통과 |
| 글꼴 | 새 글자 '맘'(s22_intro 리아 "…맘대로 해") 하나 → `python3 tools/fonts/build_fonts.py` 로 다시 만듦 (Noto Sans KR · Hahmlet · BN Brush · 두 ext). `--check` 통과, 첫 화면 글꼴 470.1 KB / 500 KB |
| 예산 | `node tools/deploy/build_web.mjs --out dist/<임시> --no-apk --no-deploy-bundle` (빌드 뒤 지움): APK lo 그림 단계 **47,533,147 B = 45.33 MiB / 48 MB** (이 묶음 상한 45.8 MiB 안, s21 통합 때 47,202,152 B 에서 +330,995 B ≈ +0.32 MiB). 원본 단계 58.71 MB, 사이트 58.84 MB / 90, JS brotli 1.49 MB, 첫 화면 경로 brotli 0.68 MB / 1.60 |
| 검증 (EX2-VERIFY) | `test_nemain` 흔들림 두 개는 시험 창 문제 (60번 재현: 실패마다 `step(9)` 동안 AI 가 이미 고른 패턴이 있었다 — ① 그 까마귀 급습의 선 5개가 `debugAct` 뒤에도 날아가 10개로 셈 ② 그 그믐이 어둡힌 0.76 을 `d0` 로 잼, 부활 뒤 0.31 = 진짜 기준이 맞다) ③ 같은 뿌리 (약 40번에 1번): 그믐 검사가 AI 의 그믐 어둠이 걷히길 기다리는 동안 AI 가 그믐을 또 골라 `d0` 가 0.76 → 시험은 `debugAct` 직전에 있던 개체를 세지 않고, `d0` = 어둡히기 전 값, 어둠을 기다리는 동안 `idleWait = 99`. 보스 고침 하나: 그믐 카운터 창에 맞아 무릎(stagger)을 꿇으면 어둠 +0.45·색조가 4.5초 끝까지 남던 것 → `s_stagger` 가 `clearMood(soft)` (`test_nemain` 새 검사, 고치기 전 0.76 · 뒤 0.31). 52/52 × 15번 (마지막 판, 그 전 판들 포함 60번 넘게). 그 밖: 7영웅 지상·공중·아래·스킬·보조 무기 타격과 이졸데 급강하 pogo·재강하 막기(아르겐과 같은 2초 4타), 스토리 굴복 → 7초 `b_nemain_post`(무릎 1) → 결과 → 아웃트로 → 합류 카드 → 마을 · 채색 해제, 보스 러시 코스 7(아르겐 → 네메인, 그믐 중 처치 뒤 어둠 복원), 탑 75층(seed 9) 네메인, 옛 세이브 넷(2부 완주·s21 끝·엔딩 도중·미완) 지도 연출·사슬, 8대본 × 7영웅 × 진엔딩 분기. 빌드: lo 그림 단계 47,533,191 B = 45.33 MiB · 그림+소리 76,656,306 B = 73.10 MiB / 75 · 아티팩트 256개 → 올리기 2번 (255 + 1, `artifact_publish.json` batches) |
| 도구 | `tools/balance.mjs` 끝 줄 '외전 s21 까지' → 외전 목록에서 ('외전 s21 · s22 까지 73', 보통·리아) — 끝 레벨 판정은 그대로 s20 |

## 8. 시험 계약 요약

- `tools/test_nemain.mjs` (EX2-BOSS, `test_argen.mjs` 와 같은 틀 — `gallery_bosses_e.html?id=b_nemain&paused=1`): 공격 8개 × 페이즈 0/1 `debugAct` → idle 복귀·판정/탄 생성·오류 0 · 전환 `unmask`(form2 '네메인'·`portraits/b_nemain2`·가면 파편) · `debugPhase(1)` · 보조 `stagger` · 없는 상태 경고 · 사망→부활 `onReset`(가면·'둥지어미' 복원, 어둠·소환수·고리 정리) · 처치(굴복 5초, 파편 폭발 없음, 부제 '결착!') · 적 정지 · 보스별: 가면 배율 0.85→1.0, 가라앉음/떼 동안 판정 없음, 카운터 → stagger, 까마귀 폭풍 두 띠(낮은/높은)와 노출 0.7, 둥지 고리의 틈은 맞지 않음, 그믐 어둠 켜짐→복원, 소환 상한(crow ≤ 4 · shadow_hunter ≤ 1), 15% 대사 한 번 + 그믐 강제, **투기장(`arena` r1)에서 패턴 8개가 경계 안에서 돈다**, 드롭 `u_nemain` 정의.
- `tools/integration.mjs` `s22`(r1→boss 방 이동) · `s22_boss`(끝에 `world.boss` = `b_nemain`).
- `tools/test_guardians.mjs` 사례 `munin` (EX2-MAP).
