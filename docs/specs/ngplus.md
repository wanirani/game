# 회차 플레이 「피의 윤회」 — 설계 계약

> **상태: 설계 승인 (리드, 2026-10-06) — 구현 중.** 리드 확정: §12 권고 전부 그대로 — 2부 엔딩만 · 같은 슬롯 덮어쓰기 + 빈 슬롯 복사 · 난이도 고정 · 세기 상한 4회차(표기 10회차) · 회차의 마을 = 20장 · 첫 처치 드롭·메인 의뢰 보상 다시 · 회차 업적 없음(67 고정) · 통계 `ng` 넣음 · 1부 초반 `comp.hp` 2.5 그대로(VERIFY 손맛에서 지나치면 2.0). 배포는 Netlify 크레딧 문제로 묶어서 나중에 한 번. 설계 NG-DESIGN (2026-10-06). 구현은 NG-CORE(규칙·세이브·월드·시험) · NG-UI(화면) · NG-SYNC(업적·아케이드·통계·클라우드·서버·밸런스 도구) 셋이 나눠 맡고, NG-VERIFY 가 마지막에 §13 을 적는다. 리드가 정할 것은 §12 열린 질문.

리드가 정할 설계. **굵은 항목**은 바꾸지 않는다. 바꿀 이유가 생기면 `/tmp/claude-0/plan/ng_requests.md` 에 `[보낸이→받는이] 내용` 한 줄로 적는다.
비용 원칙: **새 그림(Kling)·새 소리·새 글자 0**. 세기는 기존 계산 길(`world.diff` · `world.stage.level` · `boss.inferno`)에 값만 넣는다 — 적·보스 코드에 새 분기를 만들지 않는다. **업적 67개는 그대로** (§6).

## 0. 왜, 그리고 무엇을 하지 않는가

- 2부 엔딩과 외전 둘을 끝낸 슬롯에 남는 것은 아케이드뿐이다. 키운 영웅(레벨 70 안팎 · 2차 전직 · 7단계 장비 · 동료 22)을 들고 이야기를 다시 걷는 길을 연다. 세계는 더 세지고, 영웅은 그대로다.
- 지금 코드에 회차 개념은 없다 (`grep 회차` = 주석 넷: 명예의 전당 '한 회차당 한 줄' 등). `newGameState` · `migrateState` · `World` 생성자 · `Boss` 생성자 가 모두 `state.difficulty` 와 `stage.level` 한 곳에서 세기를 받으므로, **회차는 그 입력 둘을 바꾸는 것으로 끝낸다.**
- 하지 않는 것: 새 적·새 보스 패턴·새 대사(회차 전용 대본 없음 — 같은 이야기를 다시 본다, 건너뛰기는 이미 있다) · 1부 건너뛰기 · 회차 중 난이도 바꾸기(§12-4) · 회차 전용 업적(§6) · 온라인 순위표에 스토리 회차 올리기(스토리는 원래 기기 순위표만, §7) · 아케이드에 회차 세기 적용.

## 1. 개요

| 항목 | 값 |
|---|---|
| 이름 | **「피의 윤회」** (메뉴·확인 창) · 회차 표기 **`{n+1}회차`** (`n` = 지난 회차 수: 1 → '2회차' … 9 → '10회차'). 영문 sub `NEW GAME+` |
| 여는 조건 | **그 슬롯이 2부 엔딩을 봤다** (`flags.p2_done \|\| ending_p2 \|\| ending_p2true` — `worldmap.js` 외전 해금과 같은 규칙) · 아케이드 임시 세이브가 아니다 · `n < 9` |
| 들어가는 길 | **이어하기 → 슬롯 고르기 → 동작 목록의 '피의 윤회'** (+ 빈 슬롯이 있으면 '피의 윤회 · 빈 슬롯 k'). 2부 엔딩 크레딧 끝 안내 한 줄 (§4) |
| 지난 기록 | **기본은 같은 슬롯을 새 회차로 바꾼다** (확인 창). 빈 슬롯을 고르면 원래 슬롯은 손대지 않는다 (복사) |
| 이어지는 것 | 영웅 전부(레벨·경험치·SP·직업·스킬·편성) · 장비·가방(중요 물품 빼고)·보관함 · 골드 · 비전서·기록물 · 도감 · 동료 전부 · 여관 놀이 · 누적 통계 · 난이도 (§2) |
| 처음으로 | 장·클리어·해금·이야기 깃발·본 대사·비밀·유물·별의 조각·세계의 심장·보스 처치·의뢰·점수·목숨 (§2) |
| 세기 | 적 레벨을 회차 표로 올림(최대 99) + 1부 초반 보정 + 체력·공격 배율(상한) + 정예 출현 + 보스 강화 패턴. **세기는 4회차(`n = 3`)에서 멈춘다** (§3) |
| 저장 | **`state.ng = { v:1, n, at, hist[], past{} }`** 슬롯 세이브 안. 없으면 1회차. `migrateState` 가 `normalizeNg` 로 정리 (없으면 만들지 않는다) (§5) |
| 서버 | `isValidSave` 그대로 (`ng` 로 거절하지 않는다) · 슬롯 요약 `saveSummary` 에 `ng` (1–9) (§5.4) |
| 업적 | **67개·1,630점·이명 17·`prog` 25키 그대로.** 엔진 요약이 지난 회차 기록(`ng.past`)을 가상 슬롯으로 함께 읽는다 → 회차를 넘겨도 진행 막대가 줄지 않고, 새로 주는 것도 없다 (§6) |
| 온라인·통계 | 명예의 전당 스토리 줄 = **회차마다 한 줄** (`run` 키에 `:n`) · 익명 통계 4사건에 선택 필드 `ng` (§7) |
| 글꼴·그림·소리 | 새 글자 0 (§4.2 문장 전부 기본 글꼴 cmap 으로 확인) · 그림·소리 0 |
| 예산 | 코드만 ≈ +22 KB 원문 → APK lo 그림 단계 **45.42 → ≈ 45.44 MiB** (첫 조각 변화 0, §11) |

## 2. 회차 넘기기

### 2.1 흐름 (NG-UI `front/slots.js` → NG-CORE `startNgPlus`)

1. `SlotsScene.openActions`: 슬롯이 `NG.canStartNg(st)` 이고 구름 상태가 `'cloud'`·`'conflict'` 가 아니면(먼저 받게 한다) `['ngplus', '피의 윤회', 'NEW GAME+']` 를 '불러오기' 바로 뒤에 넣는다. 이 기기에서 비어 있고 클라우드 기록도 없는 슬롯 k 가 있으면 `['ngcopy', '피의 윤회 · 빈 슬롯 k', 'NEW GAME+ → SLOT k']` 도 (가장 작은 k 하나). 목록이 길어지면 기존 `actionCols` 가 두 줄로 나눈다.
2. 고르면 `frontConfirm` (danger) — 제목 `피의 윤회 — {N}회차`, 본문 §4.2, `yes '시작'`·`no '취소'`.
3. 예: `const next = NG.startNgPlus(migrateState(saves.read(slot)), { slot: target })` → `saves.write(target, next)` → `g.state = migrateState(next)` → `g.go('story', { script: 'prologue', then: 'hub', thenParams: { from: 'prologue' }, bg: 'cg/cg_prologue_moon', music: 'prologue' }, { fadeTime: 0.8 })` (새 게임과 같은 길, `charselect.js start()`). **`cloud.markOverwrite` 는 부르지 않는다** — 같은 슬롯의 이어지는 기록이고, 다른 기기의 더 새 기록과는 평소의 충돌 화면으로 고른다.
4. `ngcopy` 는 원래 슬롯을 읽기만 한다 (원래 기록 바이트 그대로 — 시험 U4).

### 2.2 이어지는 것 · 처음으로 돌아가는 것 (`startNgPlus` 가 정확히 이것만 한다)

| 묶음 | 처리 | 근거 |
|---|---|---|
| `heroes` (모든 영웅: `level exp sp classId skills slots sub equip companions`) | **그대로** | 성장 유지가 회차의 뜻. 2차 전직·스킬 그대로 |
| `inventory` | 그대로, 단 **`ITEMS[baseId].slot === 'key'` 인 것은 뺀다** (유물 5 · 열쇠·서신·로켓·인장 · 균열의 등불 · 세계의 심장 6 · 별의 조각 6 · 새벽꽃) | 남기면 `loot.heartOwned` 가 가방의 심장을 보고 다시 떨어뜨리지 않아 2부 진엔딩이 막힌다 |
| `progress.lootQueue` (보관함) | 그대로, 중요 물품만 뺀다 | 진행이 아니라 소지품 |
| `gold` · `stats` · `bestiary` · `innGames` · `companions`(owned·eggs·pending·clears…) · `charId` · `difficulty` · `created` · `name` · 모르는 최상위 필드 | **그대로** | 동료는 `unlockCompanion`·`bossKillUpdate` 가 이미 가진 것을 건너뛴다 → 합류 카드·알이 다시 나오지 않는다 |
| `progress.docs` · `progress.lore` | **그대로** | 비전서 = 영구 능력치·커맨드 기술(`stats.js` 가 `progress.docs` 를 읽는다). 숨김 벽 'H' 는 남은 비전서가 없으면 고기를 준다(`world.js` 기존 규칙) |
| `progress` 나머지 (`chapter cleared unlocked flags secrets bosses relics seenScripts shards hearts npcTalks` 와 모르는 필드) | **새 게임 값** (`chapter 0`, `unlocked ['s01']`, 빈 목록) | 이야기·지도(해금 연출 `*_revealed` 포함)·상자·비밀 벽·유물이 다시 |
| `progress.flags` | 새로, 단 **`startChar: charId`** 와 (있으면) **`stable_open: true`** 만 | 마구간 개장 대사를 다시 틀지 않는다. `p2_done`·`ending_*`·외전 `ex_*_done`·`recruit_*`·합류 깃발·`loot_*` 모두 처음으로 → 외전 s21·s22 는 이번 회차 2부 엔딩 뒤 다시 열리고, 보스 첫 처치 확정 드롭(고유·신화)이 다시 나온다 |
| `quests` | `{ active: {}, done: [] }` | 메인 의뢰가 다시 자동 수락·자동 보상 (보상 경험치는 작다) |
| `score 0` · `lives = getDiff(difficulty).lives` · `lastStage null` · `slot = target` | 새로 | 회차마다 점수 |
| `ng` | `n = min(9, n + 1)`, `at = now`, `hist` 에 끝낸 회차 한 줄, `past` 에 지난 진행 합치기 (§5) | |

- 1부 → 2부: 깃발이 처음이므로 13장 진엔딩 뒤 `p2_prologue` 가 다시 나온다 (`ending.js leave` 기존 규칙). 1부를 건너뛰지 않는다.
- 헌터: `meta.unlockedChars` 는 계정 단위라 모든 헌터를 처음부터 고를 수 있다 (`town/party.js`). 이야기 합류 깃발은 다시 켜진다 (`unlockChar` 는 이미 있는 헌터에 아무것도 하지 않는다).
- **난이도는 슬롯 그대로** — 회차를 넘기며 바꾸지 않는다 (업적 `diffEnding` 이 지난 엔딩 깃발 + 새 난이도로 잘못 서는 것을 원천 차단, §6).

## 3. 세기 — `NG_RULES` (`src/game/ngplus.js`)

### 3.1 공식 (`ngWorld(stage, diff, n)` — 스토리 스테이지 월드만)

- 규칙 줄 `R = cycles[min(n, 3)]`, 원래 레벨 `L = stage.level`.
- **적 레벨** `E = min(99, max(L, round(R.base + R.k × L)))` → `stage' = { ...stage, level: E, ngFrom: L }` (복사본. `STAGES` 는 그대로 — 아케이드도 이미 복사본 스테이지를 쓴다). 적·보스·드롭·결과 골드가 모두 `stage.level` 을 읽으므로 이것 하나로 7단계 장비·6등급 강화석·골드가 따라 오른다.
- **1부 초반 보정** (적 기본 능력치 차이 — s01 보스 기본 체력 900 vs s20 4,224): `comp(L, A) = 1 + A × max(0, 46 − L) / 45`, `A_hp = 2.5`, `A_atk = 1.0` (s01 ×3.5 / ×2.0 → s14 이후 ×1).
- **배율·상한** (`base` = 난이도 값, 상한은 회차 몫에만 — 난이도 값보다 낮추지 않는다):
  `enemyHp = min(max(base, 4.0), base × R.hp) × comp(L, A_hp)` · `enemyAtk = min(max(base, 3.0), base × R.atk) × comp(L, A_atk)` · `bossHp = min(max(base, 3.6), base × R.bossHp) × comp(L, A_hp)` · `aggro = min(max(base, 1.8), base × R.aggro)` · `elite = min(max(base, 0.35), base + R.elite)` · `drop = base × R.drop`. 그 밖(`exp gold healDrop lives continues scoreMult enemySpeed`)은 그대로.
- **보스 강화 패턴**: `bossPatterns = n ≥ 1` → `Boss` 생성자의 `this.inferno` 를 참으로 (악몽·지옥 난이도가 이미 쓰는 패턴 묶음 — 보스 20종의 탄 수·연타, 1부 공용 속도 +18 %). 새 패턴 없음.

### 3.2 표 (설계값 — 구현은 이 표를 데이터로, 바꾸면 §3.4 를 다시)

| 회차 | `base` · `k` | 적 레벨 s01 / s13 / s20 / s22 | `hp` · `atk` · `bossHp` | `aggro` | 정예 | `drop` | 보스 패턴 |
|---|---|---|---|---|---|---|---|
| 2회차 (`n=1`) | 70 · 0.32 | 70 / 84 / 92 / 93 | 1.10 · 1.10 · 1.10 | ×1.0 | +0.03 | ×1.1 | 강화 |
| 3회차 (`n=2`) | 78 · 0.30 | 78 / 92 / 98 / 99 | 1.35 · 1.35 · 1.30 | ×1.1 | +0.06 | ×1.2 | 강화 |
| 4회차 이상 (`n≥3`) | 82 · 0.26 | 82 / 94 / 99 / 99 | 1.60 · 1.65 · 1.50 | ×1.2 | +0.09 | ×1.3 | 강화 |

- 상한 `NG_RULES.limits = { enemyHp: 4.0, enemyAtk: 3.0, bossHp: 3.6, aggro: 1.8, elite: 0.35, level: 99 }` — 지옥(공격 ×3.0)에서는 회차가 공격 배율을 더하지 않고 레벨·보정만 더한다 (지옥 1회차가 이미 약한 영웅을 한두 대에 쓰러뜨린다).
- 경험치·골드 배율은 그대로 — 적 레벨이 70 이상이라 이미 많이 오른다 (2회차 시뮬레이션: 70 → s21 에서 99).

### 3.3 규칙 비틀기 둘 (기존 시스템만)

1. **보스 강화 패턴** (2회차부터, 모든 난이도): `world.ngBoss` → `boss.js` 한 줄. 보통·베테랑 플레이어가 처음 보는 공격 묶음이지만 이미 악몽에서 검증된 것.
2. **정예 출현** +3 %p/회차 (`diff.elite`, 정예 = 체력 ×2.4 · 공격 ×1.5 · 경험치 ×3 · 드롭 ↑, `ENEMIES[id].elite === false` 는 그대로 제외).

### 3.4 확인 — 이길 수 있는가

설계 시뮬레이션 `/tmp/claude-0/ng_design/ng_sim.mjs` (= `tools/balance.mjs` 모델 그대로 + 위 규칙; 영웅 모형: 2회차 시작 Lv 70 · 7단계 희귀도 4 · 강화 +12(7장마다 +1, ≤ 15) · 장신구 둘 · 비전서 27, 3회차 이상 Lv 99 · +15). 보통 · 카엘:

| 스테이지 | 2회차 적Lv · 영웅Lv · hitsMed · bossHits · bossTaken % | 3회차 적Lv · hitsMed · bossHits · bossTaken | 4회차 적Lv · hitsMed · bossHits · bossTaken | 1회차 참고 적Lv · hitsMed · bossHits · bossTaken |
|---|---|---|---|---|
| s01 | 70 · 70 · 4 · 56 · 13.0 | 78 · 4 · 47 · 12.6 | 82 · 5 · 56 · 16.9 | 1 · 2 · 76 · 15 |
| s09 | 78 · 76 · 6 · 95 · 16.5 | 85 · 7 · 91 · 16.5 | 88 · 8 · 109 · 21.5 | 24 · 3 · 112 · 22.5 |
| s12 | 82 · 81 · 7 · 116 · 14.2 | 89 · 7 · 111 · 15.7 | 91 · 9 · 131 · 20.0 | 36 · 5 · 156 · 12.2 |
| s17 | 88 · 92 · 6 · 131 · 15.2 | 95 · 6 · 119 · 18.1 | 97 · 8 · 140 · 23.0 | 56 · 5 · 144 · 13.8 |
| s20 | 92 · 98 · 8 · 176 · 17.3 | 98 · 8 · 162 · 21.1 | 99 · 10 · 189 · 26.2 | 68 · 8 · 213 · 18.5 |

영웅 7 × 난이도 4 — 회차 행(s01–s20)의 최댓값 ÷ 같은 영웅·난이도 1회차 2부(s14–s20) 최댓값 (영웅 7 중 가장 큰 값):

| 난이도 | 2회차 받는 피해 · 보스 타수 | 3회차 | 4회차 |
|---|---|---|---|
| 보통 | 0.99 · 0.89 | 1.19 · 0.85 | 1.49 · 0.99 |
| 베테랑 | 0.99 · 0.80 | 1.26 · 0.87 | 1.57 · 1.02 |
| 악몽 | 1.06 · 0.82 | 1.36 · 0.90 | 1.55 · 1.04 |
| 지옥 | 1.07 · 0.85 | 1.12 · 0.91 | 1.15 · 0.93 |

- 읽기: 2회차 ≈ 1회차 끝의 긴장 + 강화 패턴, 3회차 피해 +20–36 %, 4회차 +50 % 안팎. 보스전 길이는 1회차와 거의 같다 (≤ 1.04배). 1부 초반 질긴 적(s09 태엽 골렘류) hitsMax 34 (2회차) — 보정 때문, 받아들인다.
- **도구 계약 (NG-SYNC, `tools/balance.mjs`)**: `node tools/balance.mjs <diff> <hero> --ng N [--check] [--json]` — 위 영웅 모형, 적·보스 값은 **게임과 같은 `NG.ngWorld()`** 로 (공식을 복사하지 않는다), 표에 `elv` = 회차 적 레벨. `--ng` 와 `--check` 를 함께 주면 모든 난이도에서: 받는 피해(`bossTaken`·`takenMed`) 비율 ≤ **1.15 / 1.45 / 1.65** (N = 1 / 2 / 3), 보스 타수 비율 ≤ **1.15**, 값이 유한 — 벗어나면 종료 코드 1. 설계 시뮬레이션과 ±5 % 안이어야 한다 (s01·s12·s20 행).
- 실제 손맛은 NG-VERIFY 가 본다: 2회차 s01 보스 · s12 드라큘라 · 4회차 s20 니힐 (보통, 카엘·리아) 한 번씩 — 쓰러뜨릴 수 있고, 카엘이 보스 한 대에 체력 1/3 이상을 잃지 않는다 (시뮬레이션 최대 26 %; 리아는 1회차처럼 더 아프다 — 비율 표 안이면 된다).

## 4. 화면

### 4.1 자리 (NG-UI) — 늘 보이는 HUD 는 건드리지 않는다

| 곳 | 표시 |
|---|---|
| 슬롯 카드 (`front/slots.js drawSlot`) | 장 줄 앞에 '제2부' 배지와 같은 모양의 배지 **`{N}회차`** (색 `#ff5a6a`), '제2부' 배지보다 앞. `n = 0` 이면 없음 |
| 슬롯 동작 목록 | §2.1 두 줄 |
| 스테이지 입장 배너 (`world.js`, NG-CORE) | 부제 `{N}회차 · CHAPTER {c} · {sub}` |
| 일시정지 정보 (`scenes/pause.js drawInfo`) | `CHAPTER {c} · {N}회차` (`world.ng` 를 읽는다) |
| 세계 지도 정보판 (`town/worldmap.js`) | `적 레벨 {E}` 를 회차 레벨로 (`NG.ngStageLevel(STAGES[id], n)`), 위험 색 비교도 그 값 |
| 결과 화면 | 바꾸지 않는다 (보상 골드는 회차 레벨로 이미 오른다) |
| 엔딩 크레딧 통계 (`front/ending.js drawStats`) | 머리 줄 `{이름} · {난이도} 난이도 · {N}회차` (`n ≥ 1`) |
| 엔딩 마지막 안내 (`notes()`) | 2부 엔딩(`p2`·`p2true`)이고 `NG.canStartNg(st)` 이면 마지막 줄 앞에 안내 한 줄 (§4.2) |
| 명예의 전당 스토리 줄 (`front/highscore.js detail`) | `h.ng ≥ 1` 이면 앞에 `{N}회차 · ` |
| 클라우드 요약 (`front/cloud_ui.js summaryLine`·`drawSummaryCard` 진행 줄) | 끝에 ` · {N}회차` (`sum.ng ≥ 1`) — 충돌 화면에서 어느 쪽이 새 회차인지 보인다 |
| 마을 가게·대장간·마구간 (§4.3) | 회차가 있으면 20장까지 연 것처럼 |

### 4.2 문장 (전부 `assets/fonts/noto-sans-kr.woff2` · `hahmlet.woff2` 기본 cmap 으로 확인 — 빠진 글자 0, `/tmp/claude-0/ng_design/glyphcheck.py`)

- 동작: `피의 윤회` / `NEW GAME+` · `피의 윤회 · 빈 슬롯 {k}` / `NEW GAME+ → SLOT {k}`
- 확인 창 제목: `피의 윤회 — {N}회차` · 단추 `시작` · `취소`
- 확인 본문(같은 슬롯): `레벨·장비·직업·스킬·비전서·동료·골드를 지닌 채 1장부터 다시 시작합니다. 이야기·지도·의뢰·유물은 처음으로 돌아가고, 적은 더 강해집니다. 슬롯 {s}의 지금 기록은 새 회차로 바뀝니다.`
- 확인 본문(빈 슬롯): 앞 두 문장 같고 끝이 `슬롯 {s}의 기록은 그대로 두고, 빈 슬롯 {k}에 새 회차를 만듭니다.`
- 엔딩 안내: `이어하기에서 이 슬롯을 고르면 「피의 윤회」로 {N}회차를 시작할 수 있습니다`
- 표기: `{N}회차` (2–10) · `{N}회차 · CHAPTER {c} · {sub}` · `CHAPTER {c} · {N}회차` · `{N}회차 · {c}장 클리어` / `엔딩 도달` / `외전 클리어` · `… · {N}회차`
- 구현 중 문장을 바꾸면 `python3 tools/fonts/build_fonts.py --check` 가 통과해야 한다 (슬롯·엔딩은 '첫 화면 강제' 묶음 — 새 글자가 생기면 기본 파일 예산을 쓴다. 생기지 않게 고친다).

### 4.3 회차의 마을 (`NG.serviceChapter(state)` = 회차가 있으면 `max(chapter, 20)`, 아니면 `chapter`)

가게 `shopStock` · 대장간 `smithStock` · 마구간 닫힘·구입 줄(`stable.js` 다섯 곳 · `facades.js` 간판 · `companion_state.js buyCompanion`) · **수호신 2번 칸**(`guardianSlots`, 8장 조건)이 이 값을 읽는다. 근거: 적이 처음부터 레벨 70 이상이라 고급 물약·엘릭서·5등급 강화석이 필요하고, 2번 칸이 닫히면 `normLoadout` 이 두 번째 수호신을 편성에서 빼 버린다 (성장 손실).

## 5. 저장 · 클라우드 · 서버

### 5.1 모양 (`state.ng`, v1)

```js
state.ng = {
  v: 1,
  n: 1,                    // 지난 회차 수 (정수 0..9). 표기 = n + 1 회차. 없거나 0 이면 1회차
  at: 1759712000000,       // 이번 회차를 시작한 시각
  hist: [{ n: 0, end: 'p2true', diff: 'normal', t: 98765, at: 1759712000000 }],   // 끝낸 회차 (≤ 10, 오래된 것부터 버림; t = 그때 playTime)
  past: {                  // 지난 회차들을 합친 진행 기록 — progress 의 부분 모양 (업적 요약·아케이드 연습 목록이 읽는다)
    diff: 'normal', cleared: { s01: { rank: 'S', time: 133.2 }, … }, unlocked: [...], bosses: [...],
    relics: [...], shards: [...], hearts: [...], secrets: [...], flags: { ending_true: true, p2_done: true, … }, quests: [...],
  },
}
```

- 합치기 (`startNgPlus`): `cleared` 는 스테이지마다 더 좋은 랭크(`SABCD`)·짧은 시간, 목록은 합집합(문자열만, 중복 없이), `flags` 는 값이 `true` 인 키의 합집합, `quests` 는 `done` 합집합, `diff` 는 슬롯 난이도. 비전서·기록물은 넣지 않는다(이어지므로).
- 상한 `NG_LIMITS = { nMax: 9, histMax: 10, pastBytes: 24 * 1024 }`. 꽉 찬 세이브의 `past` ≈ 8–10 KB (비밀 표식 ≤ 230개). 넘으면 `secrets` → `quests` 순서로 뒤에서 자른다. 세이브 전체는 여전히 < 256 KB (시험 N3).

### 5.2 이관 (`normalizeNg(s)`, `migrateState` 끝 — `s.version` 적기 직전, `[hook:ng]`)

- **`ng` 가 없으면 아무것도 하지 않는다** (옛 세이브·1회차 세이브는 바이트 그대로 — `test_save_v2` 의 v1 고정 세이브 비교가 그대로 통과).
- 객체가 아니면 지운다. `n`: 유한수면 내림·0..9 로 자르기, 아니면 0. `hist`: 객체만·필드 정리·마지막 10개. `past`: 객체가 아니면 지운다, 목록은 문자열만·중복 없이, `cleared` 값은 `{rank: 'S'|…|null, time: 유한수|null}`, `flags` 는 `true` 만, 크기 상한. **모르는 필드는 남긴다.** 멱등. 던지지 않는다 (안에서 try/catch — 실패하면 `past` 만 지운다).
- 아케이드 임시 세이브(`state.arcade`)의 `ng` 는 무시된다 (`ngOf` → 0).

### 5.3 클라우드 (`core/cloud.js`, NG-SYNC)

- 슬롯 기록은 합치지 않고 통째로 오간다 → **병합 규칙 없음.** `summarize(s)` 에 `ng` (`s.ng.n` 이 1..9 정수일 때만, 서버 요약과 같은 모양). 동기화 판정(`clientSavedAt`)은 그대로.
- 메타는 바뀌지 않는다 (새 메타 필드 0). 명예의 전당 항목의 `ng` 는 `cleanMeta`·`mergeScores` 가 이미 그대로 옮긴다 (`run` 키로 합침).

### 5.4 서버 (`netlify/lib/validate.mts`, NG-SYNC)

- **`isValidSave` 는 바꾸지 않는다** — `ng` 모양으로 세이브를 거절하면 클라우드 저장이 `invalid_save` 로 막힌다. 깊이·크기는 기존 `safeTree(DATA_MAX_DEPTH)` · `BODY_LIMIT.save` 512 KB 가 본다.
- `saveSummary(s)` 에 `ng: n` (`Number.isInteger(s.ng?.n) && n ≥ 1` 이면 `min(n, 9)`, 아니면 넣지 않음). Blobs 메타데이터 2 KB 안 (+8 B).

### 5.5 옛 클라이언트 (업데이트 전 APK·PWA 캐시)

- 새 세이브를 읽어도 멈추지 않는다: `isValidSave` 참, `migrateState` 가 모르는 필드 `ng` 를 남긴다, 저장할 때도 남는다. 옛 클라이언트에서는 회차 세기 없이(1회차 세기로) 진행될 뿐이다 — 받아들인다.
- 옛 클라이언트가 '새로 시작'하면 `ng` 가 사라진다 (원래 동작). 옛 서버의 슬롯 요약에는 `ng` 가 없을 뿐.

## 6. 업적 — 결정: **바꾸지 않는다 (67 · 1,630 · 이명 17 · 장식 5 · `prog` 25)**

- 엔진(`game/achievements.js`, NG-SYNC `[hook:ng]` 두 줄): `digestState(state)` 결과에 `past: digestState(NG.pastState(state))` (지난 회차를 `{ progress: past, quests: { done }, difficulty: past.diff }` 모양의 가상 세이브로 — 영웅·통계·동료·가방이 비어 있어 합·최대 지표에 더해지지 않는다) · `ctx()` 가 슬롯 요약을 넣을 때 `d.past` 도 따로 한 칸 넣는다. **가상 슬롯이라 `diffEnding` 은 그 회차의 난이도로만 선다.**
- 결과: 회차를 넘겨도 `cleared`·`rankS`·`secrets`·`relics`·`docs`·`quests` 진행 막대가 줄지 않는다 (예: 1회차 S 랭크 15개는 `ch_rank_s_all` 에 남는다). 새로 서는 업적도 없다 (같은 기록을 다시 읽을 뿐) — 시험 C9.
- 두 번 받기: 불가능 (`got` 은 계정에 한 번, 보상 `claimed` 도 한 번). 의뢰를 회차마다 다시 해도 `quests` 는 서로 다른 id 수라 늘지 않는다.
- 회차가 쉽게 만드는 것: `ch_speed`·`ch_rank_s`·`cb_nodmg` 같은 도전은 강한 영웅으로 하기 쉬워지지만 적도 레벨 70 이상으로 오른다 — 정당한 플레이로 본다. `hr_lv80` 은 2회차에서 자연스럽게 선다.
- 회차 업적을 원하면(§12-8): 예 '윤회의 사냥꾼(2회차 2부 엔딩)' 30점 + '끝없는 윤회(4회차 2부 엔딩)' 50점 → 바뀌는 고정 수: 업적 67 → 69 · 점수 1,630 → 1,710 · `story` 11 → 13 · `ch_all.n` 66 → 68 · 지표 하나(`ng`) · 시험 C1 의 수 · 이명을 주면 `ACH_TITLES`·서버 `TITLE_IDS` 17 → 18 (서버 배포) · `achievements.md` §1·§4·§5. **이번 묶음에서는 하지 않는다.**

## 7. 온라인 · 통계

- **명예의 전당(기기 순위표, 스토리)**: 지금 '한 회차(슬롯+생성 시각)당 한 줄'. 회차를 넘겨도 `created` 는 그대로 두고, `run` 키를 `${slot}:${created}` + (`n ≥ 1` 이면 `:${n}`) 로 → **회차마다 한 줄**, 항목에 `ng: n` (n ≥ 1). 두 곳이 같은 규칙: `front/common.js recordHighScore` (타이틀이 설치하는 실제 경로, NG-UI) · `main.js game.recordScore` (직접 부팅 대체 경로, NG-CORE). 클라우드 `mergeScores` 는 `run` 으로 합치므로 그대로.
- **온라인 순위표·유령·오늘의 도전·무한의 탑·보스 러시·서바이벌·연습**: 영향 없음 — 모두 `buildArcadeState` 임시 세이브(`ng` 없음)이고, 월드 훅은 `mode === 'story' && !state.arcade` 에서만 선다. 서버 `gamedata.mts`·`online.mts`·`boards.mts` 변경 0.
- 아케이드 '스테이지 연습' 목록 (`front/arcade.js slotUnlocks`, NG-SYNC `[hook:ng]` 한 줄): 슬롯의 `progress.unlocked` 에 `ng.past.unlocked` 도 더한다 — 회차를 넘긴 유일한 슬롯이 연습 목록을 s01 로 줄이지 않게.
- **익명 통계** (`core/telemetry.js` + `netlify/lib/telemetry.mts`, NG-SYNC): `stage_start` · `stage_clear` · `death` · `boss_result` 에 선택 필드 **`ng: f.int(1, 9, true)`** — 스토리이고 `n ≥ 1` 일 때만 보낸다. 없으면 1회차 플레이어의 s01 통계에 레벨 70 영웅이 섞여 밸런스 보고서가 흐려진다. **서버가 모르는 필드가 든 사건을 거절하므로(`checkEvent`) 서버 쪽 허용 목록이 먼저 — 같은 배포에 함께 나간다.** `docs/TELEMETRY.md` 필드 표에 한 줄. `arcade_result`·`session_start` 그대로.

## 8. API — `src/game/ngplus.js` (NG-CORE, 순수 · DOM 없음 · node 에서 import 가능)

```js
export const NG_RULES   // §3.2 표 { cap: 3, comp: { hp: 2.5, atk: 1.0, ref: 46 }, limits: {...}, cycles: { 1: {base,k,hp,atk,bossHp,aggro,elite,drop}, 2: …, 3: … } }
export const NG_LIMITS  // §5.1 { nMax: 9, histMax: 10, pastBytes: 24576 }
export function ngOf(state) → 0..9            // 아케이드·없음·손상 → 0
export function ngLabel(n) → '' | '2회차' …   // n ≥ 1 이면 `${n + 1}회차`
export function canStartNg(state) → bool      // §1 여는 조건
export function startNgPlus(state, { slot, now = Date.now() }) → state   // §2.2. 원본을 바꾸지 않는다 (깊은 사본)
export function normalizeNg(state) → void     // §5.2
export function ngStageLevel(stage, n) → int  // §3.1 E (n = 0 이면 stage.level)
export function ngWorld(stage, diff, n) → { stage, diff, bossPatterns } | null   // n = 0 이면 null
export function serviceChapter(state) → int   // §4.3
export function pastState(state) → state 모양 | null   // §6 (반환값에는 ng 가 없다 — 재귀 없음)
export function applyNgDebug(state, params)   // ?ng=N (1..9) → state.ng = { v:1, n:N, at, hist:[], past:{} } (시험·디버그)
```

- **첫 커밋은 뼈대**: NG-CORE 는 시작 10분 안에 모든 export 를 중립 동작(`ngOf → 0`, `canStartNg → false`, `ngWorld → null`, `serviceChapter → chapter`, `pastState → null`, `NG_RULES` 는 완성 표)으로 올린다. NG-UI·NG-SYNC 는 `import * as NG from '…/game/ngplus.js'` + `NG.fn?.()` 로 부른다 (ARCHITECTURE §2 R6).
- **첫 조각 파일(`core/cloud.js` · `front/common.js` · `front/cloud_ui.js`)은 `ngplus.js` 를 import 하지 않는다** — `const n = Number.isInteger(s?.ng?.n) && s.ng.n > 0 ? Math.min(9, s.ng.n) : 0` 를 그 자리에서 읽고 표기는 `${n + 1}회차` (시험 N12 가 `ngLabel` 과 대조).
- 월드 훅 (`game/world.js` 생성자, 일일 도전 `diffOver` 줄 바로 뒤 — 첫 방을 만들기 전): `this.ng = mode === 'story' && !ar ? NG.ngOf?.(this.state) ?? 0 : 0;` · `if (this.ng) { const r = NG.ngWorld?.(this.stage, this.diff, this.ng); if (r) { this.stage = r.stage; this.diff = r.diff; this.ngBoss = r.bossPatterns; } }` — 둘 다 `// [hook:ng]`. 배너 줄 뒤 `if (this.ng) this.banner.sub = …`. `boss.js`: `this.inferno = … || !!world.ngBoss;   // [hook:ng]`. 마을(`mode 'town'`)·아케이드는 `world.ng = 0`.

## 9. 작업 분담

NG-CORE · NG-UI · NG-SYNC 는 동시에 시작한다 (각 ≈ 1시간, NG-CORE 의 뼈대 커밋 뒤). NG-VERIFY 는 셋이 끝난 뒤. 요청은 `/tmp/claude-0/plan/ng_requests.md`. 커밋은 10분마다 자동 저장된다(예상된 일). 밀어 올리기(push) 하지 않는다. 남의 기능 파일에 넣는 줄 끝에는 **`// [hook:ng]`**.

| 담당 | 파일 (서로 겹치지 않는다) |
|---|---|
| **NG-CORE** (규칙·세이브·월드·시험) | 새: `src/game/ngplus.js`(§8) · `tools/test_ngplus.mjs`(§10.1) · `tools/fixtures/save_p2done.json`(2부·외전 완주 고정 세이브: 22장 클리어·`p2_done`·`ending_p2true`·`ex_s21_done`·`ex_s22_done`·유물 5·조각 6·심장 6·비전서 27·의뢰 40·영웅 7 Lv 68–72 2차 전직·동료 22·가방에 중요 물품 6·보관함에 중요 물품 1 + 장비 1) · 고침: `src/game/state.js`(`normalizeNg` 한 줄) · `src/game/world.js`(§8 세 줄) · `src/game/bosses/boss.js`(한 줄) · `src/game/companion_state.js`(`guardianSlots`·`buyCompanion` 의 장 → `serviceChapter`) · `src/main.js`(`?ng=` 디버그: `debugState` 뒤 `applyNgDebug`, `?scene=hub` 의 디버그 세이브 조건에 `params.has('ng')`; `recordScore` 의 `run`·`ng` §7) · `tools/integration.mjs`(케이스 `s01_ng` = `?scene=stage&stage=s01&ng=1`, `s20_boss_ng` = `&stage=s20&room=boss&ng=3`) · `tools/qa/hook_tags.mjs`(`TAGS` 에 `'ng'`) · 문서 `docs/ARCHITECTURE.md`(§5.3 `state.ng`·§2 훅 표식 목록·§11/§15 회차 한 단락) |
| **NG-UI** (화면) | `src/scenes/front/slots.js`(§2.1 동작·확인·시작, §4.1 배지) · `src/scenes/front/ending.js`(통계 머리 줄·안내) · `src/scenes/pause.js`(정보 한 줄) · `src/scenes/town/worldmap.js`(적 레벨) · `src/scenes/town/shop.js` · `smith.js` · `stable.js` · `facades.js`(§4.3) · `src/scenes/front/highscore.js`(스토리 줄) · `src/scenes/front/common.js`(`recordHighScore` §7) · `src/scenes/front/cloud_ui.js`(요약) · 새 `tools/qa/ngplus_ui.mjs`(§10.2, `export default async function run(opts)`) · 글꼴 `assets/fonts/*` 는 새 글자가 생겼을 때만(생기면 안 된다) |
| **NG-SYNC** (업적·아케이드·통계·클라우드·서버·도구) | `src/game/achievements.js`(§6 두 줄) · `src/scenes/front/arcade.js`(§7 한 줄) · `src/core/cloud.js`(`summarize`) · `src/core/telemetry.js` · `netlify/lib/telemetry.mts` · `netlify/lib/validate.mts`(`saveSummary`) · `tools/balance.mjs`(`--ng`, §3.4) · `tools/qa/run_all.mjs`(unit `ngplus` 한 줄 · balance `balance_ng` 한 줄: 난이도 4 × 영웅 7 × N 1–3 `--ng N --check`) · 시험 `tools/test_achievements.mjs`(C9) · `tools/telemetry/test_telemetry.mjs` · `test_client_telemetry.mjs` · `tools/accounts/test_api.mjs` · `tools/accounts/test_client.mjs` · 문서 `docs/TELEMETRY.md` · `docs/ACCOUNTS.md`(슬롯 요약 `ng`) · `docs/specs/achievements.md` §3.3 아래 한 줄 ('요약은 `ng.past` 를 가상 슬롯으로 함께 읽는다 — ngplus.md §6') |
| **NG-VERIFY** (나중) | 고치지 않는다 — 실패는 요청 파일로 담당에게. 쓰는 곳: 이 문서 §13 · (리드 승인 뒤) `node tools/qa/hook_tags.mjs --update` |

- 넘겨받는 값: 규칙 숫자의 원본은 `NG_RULES` 하나. 문장은 이 문서 §4.2 (바꾸면 글꼴 검사 다시). `world.ng` (CORE) → `pause.js` (UI). `state.ng.n` 의 인라인 읽기 규칙 (§8) → UI·SYNC 의 첫 조각 파일.

## 10. 시험 계약

### 10.1 `tools/test_ngplus.mjs` (NG-CORE, 브라우저 없이 < 20초, `--browser` 는 `tools/qa/lib/server.mjs openEnv`) — `node tools/test_ngplus.mjs [--only N3,N5] [--browser] [--ui]`

| 사례 | 확인 |
|---|---|
| N1 규칙 | `NG_RULES` 모양 · 회차 1→3 에서 `base hp atk bossHp aggro elite drop` 가 줄지 않음 · §3.2 표의 적 레벨 (s01·s13·s20·s22 × 3회차) 그대로 · 모든 `STAGES`(arena 빼고) × n 1..9: `L ≤ E ≤ 99`, n ≥ 3 은 n = 3 과 같음 · `comp(L ≥ 46) = 1` |
| N2 여는 조건 | 새 게임 거짓 · `p2_done` 참 · `ending_p2true` 만 참 · `ending_p2` 만 참 · 1부 진엔딩만 거짓 · `state.arcade` 거짓 · `n = 9` 거짓 |
| N3 넘기기 | 고정 세이브 `save_p2done.json` → `startNgPlus`: §2.2 표의 칸마다 그대로/새로 (영웅 깊은 같음, 중요 물품 0 — 가방·보관함, 깃발 = `{startChar, stable_open}`, 의뢰 비움, `created` 그대로, 점수 0) · 원본 불변 (전후 깊은 같음) · `ng.n 1`, `hist` 1줄, `past.cleared` 22장 · 두 번째 넘기기 → `n 2`, `past` 합치기(더 좋은 랭크·짧은 시간·합집합) · 결과가 클라이언트·서버(`validate.mts`) `isValidSave` 참 · `migrateState` 두 번 = 한 번 · JSON < 256 KB · `n 9` 에서 더 못 넘김 |
| N4 이관 | 손상 `ng` 1,000개 퍼징 (문자열·배열·`n −1 / 1e9 / 2.5 / NaN`·`past` 배열·`hist` 500줄·`past` 100 KB) → 던짐 0 · `n` 0..9 정수 · `hist ≤ 10` · `past ≤ 24 KB` · `ng` 의 모르는 필드 남음 · **`ng` 없는 세이브(v1 고정 세이브 포함)에 `ng` 가 생기지 않음** · `JSON` 왕복(옛 클라이언트 흉내)에 `ng` 가 남음 |
| N5 세기 | `ngWorld` 스테이지 22 × n 1..3 × 난이도 5: `stage` 는 사본(`STAGES` 의 level 그대로), §3.1 공식대로의 `diff` (상한 포함: 지옥 4회차 `enemyAtk = 3.0 × comp`), `bossPatterns` 참 · `enemyStats(…, E, diff)` 유한 · n = 0 → null |
| N6 마을 | `serviceChapter`: 회차 없음 = 장, 회차 1·장 0 = 20 · `guardianSlots`(회차·장 0) = 2 · `shopStock(serviceChapter)` 에 `c_elixir`·`m_stone_5` |
| N7 지난 회차 | `pastState`: `progress` 부분 모양 · `quests.done` · `difficulty = past.diff` · `ng` 없음 · 회차 없는 세이브 → null |
| N8 월드 (`--browser`) | `?scene=stage&stage=s01&ng=2` → `world.ng 2` · `world.stage.level 78` · `STAGES.s01.level 1` · `world.diff.enemyHp` = 공식 · 배너 부제가 '3회차 · CHAPTER 1' 로 시작 · `&room=boss` → `world.boss.inferno` 참 · `ng` 없이 → `world.ng 0`·레벨 1 · 오류 0 |
| N9 아케이드 무관 (`--browser`) | 회차 슬롯을 불러온 뒤 아케이드 '스테이지 연습' s01 (`front/arcade_run.js` 연습 흐름, `buildArcadeState` 임시 세이브) → `world.ng 0`, 적 레벨이 아케이드 규칙대로 |
| N10 연습 목록 | `saves.write` (node 에서는 메모리 기록) 로 회차 슬롯 하나(지금 `unlocked ['s01']`, `past.unlocked` 22장) → `practiceStages` 에 s22 (NG-SYNC 코드의 계약 시험) |
| N11 업적 요약 | 고정 세이브 → 넘기기 → `digestState(new).past` 있음 · `scanDefs` 결과 집합이 넘기기 전과 같음 (NG-SYNC 코드의 계약 시험) |
| N12 점수 줄 | `recordHighScore` (가짜 game): 1회차 → `run '1:<created>'`, 회차 2 → `run '1:<created>:2'`·`ng 2`, 두 줄 · 첫 조각 인라인 표기 = `ngLabel` |

`--ui` 는 `tools/qa/ngplus_ui.mjs` 를 부른다 (업적의 `--ui` 와 같은 틀).

### 10.2 `tools/qa/ngplus_ui.mjs` (NG-UI, 헤드리스 Chromium, desk · phone1 · phone2)

| 사례 | 확인 |
|---|---|
| U1 슬롯 카드 | 슬롯 셋(새 게임 · 2부 완주 `n 0` · `n 2`) → 배지 '3회차' 는 슬롯 3에만, 장 글자와 겹침 0 · 스크린숏 `/tmp/claude-0/ngplus_ui/{vp}_slots.png` |
| U2 동작 목록 | 완주 슬롯에 '피의 윤회' (+ 빈 슬롯이 있으면 '피의 윤회 · 빈 슬롯 3'), 미완주 슬롯에는 없음 · 구름 상태 `conflict` 흉내 → 없음 · phone2 에서 두 줄, 탭 ≥ 36 CSS |
| U3 같은 슬롯 | 확인 → 서막 건너뛰기 → 마을: `saves.read(slot).ng.n 1` · `chapter 0` · 영웅 레벨 그대로 · 중요 물품 0 · `cloud.markOverwrite` 호출 0 |
| U4 빈 슬롯 | 원래 슬롯 JSON 바이트 그대로 · 대상 슬롯 `ng.n 1` |
| U5 표시 | `?scene=stage&stage=s03&ng=1`: 일시정지 'CHAPTER 3 · 2회차' · 세계 지도 s03 '적 레벨 72' · 명예의 전당 `h.ng 1` 줄 '2회차 · 엔딩 도달' · 클라우드 요약 '· 2회차' |
| U6 마을 | 회차 1·장 0 마을: 가게에 엘릭서·5등급 강화석 · 대장간 7단계 · 마구간 열림·간판 · 수호신 2칸 |
| U7 엔딩 | 회차 슬롯 `p2` 엔딩 → 통계 머리 줄 '· 2회차' · 안내 '「피의 윤회」로 3회차를' · 아케이드·1부 엔딩에는 안내 없음 · 줄이 화면 안 (phone2) |
| U8 오류 | 모든 사례 페이지·콘솔 오류 0 |

### 10.3 기존 묶음에 더하는 사례 (NG-SYNC)

- `test_achievements.mjs` **C9 회차**: C3 의 합성 '2부 완주' 슬롯 → `startNgPlus` → `rescan('retro')` 새 달성 0, `achievementUnlocked` 0번 · 진행 막대(`rankS`·`secrets`·`quests`) 줄지 않음 · 보통 난이도 회차 세이브로 `ch_nightmare_p2` 아님 · 지난 회차 `past.diff 'hard'` + 엔딩 깃발 → `ch_hard_p1` 은 그 가상 슬롯으로만. **C1 의 고정 수(67 · 1,630 · 17 · 25)는 그대로.**
- 통계: `ng 2` 가 든 `stage_clear` 통과 · `ng 0`·`ng 10`·`ng '2'` 사건 거절 · 클라이언트는 1회차에 `ng` 를 싣지 않음.
- `test_api.mjs`: `PUT /api/saves/<slot>` 에 `ng.n 2` → 목록 요약 `ng 2` · `ng` 없음 → 요약에 없음 · 이상한 `ng`(`'x'`)여도 200 (거절하지 않음). `test_client.mjs`: `summarize` 의 `ng`.
- `balance.mjs --ng N --check`: 난이도 4 × 영웅 7 × N 1–3 모두 통과 (run_all `balance_ng`).

### 10.4 함께 돌리는 기존 검사 (모두, 끝낼 때)

`python3 tools/fonts/build_fonts.py --check` · `node tools/test_save_v2.mjs` · `node tools/test_companion_state.mjs` · `node tools/test_achievements.mjs` · `npm run test:api` · `npm run test:client` · `npm run test:online` · `npm run test:online:client` · `npm run test:telemetry` · `npm run test:telemetry:client` · `node tools/balance.mjs normal <영웅> --check` ×7 (회차 없는 표는 그대로) · `node tools/qa/hook_tags.mjs` · `node tools/qa/bindings.mjs` · `node tools/test_part2.mjs --static` · `node tools/integration.mjs --only title,hub,worldmap,menu,arcade,tower,s01,s01_boss,s20_boss,s01_ng,s20_boss_ng` · `--mobile --only title,hub,worldmap` · `node tools/qa/platform_view.mjs --only front` · 예산 빌드 (§11).

## 11. 예산

- 새 그림·소리·글자 0. 코드 ≈ `ngplus.js` 12 KB + 훅 ≈ 4 KB + 화면 ≈ 5 KB + 도구 1 KB (시험은 싣지 않는다) ≈ **+22 KB 원문 → APK lo 그림 단계 45.42 → ≈ 45.44 MiB** (상한 48, 이 묶음 상한 +0.05 MiB). 확인: `node tools/deploy/build_web.mjs --out dist/<임시> --no-apk --no-deploy-bundle` (빌드 뒤 지움).
- **첫 조각 0 바이트 증가 목표** (첫 화면 경로 brotli 0.68 MB / 1.60): `ngplus.js` 는 `state.js`·`world.js`·front 지연 장면만 import (§8).
- 세이브: `ng` ≈ 8–10 KB (꽉 찬 세이브), 한도 256 KB 시험 · 512 KB 서버.
- 성능: 월드 생성 때 한 번 계산 (`ngWorld` 객체 둘) — 프레임 비용 0.

## 12. 위험 · 열린 질문 (권고 포함)

| # | 위험·질문 | 권고 |
|---|---|---|
| 1 | 이름 「피의 윤회」, 표기 '2회차' (영문 NEW GAME+) | 그대로 (글자 확인 끝) |
| 2 | 여는 조건을 1부 진엔딩에도? | **2부 엔딩만** — 1부만 끝낸 플레이어에게는 아직 2부가 남아 있다 |
| 3 | 지난 기록: 같은 슬롯 덮어쓰기 기본 + 빈 슬롯 복사 선택 | 그대로. 자동 백업 키(`slot_N_backup`)는 클라우드가 쓰는 사본이라 쓰지 않는다 |
| 4 | 회차를 넘기며 난이도 바꾸기 | **막는다** (이번 묶음). 열려면 `past` 를 난이도별로 나눠야 업적 `diffEnding` 이 잘못 서지 않는다 (가상 슬롯은 이미 `past.diff` 를 쓴다) |
| 5 | 세기 상한 4회차, 표기는 10회차까지 | 그대로. 5회차 이상은 4회차와 같은 세기 |
| 6 | 회차의 마을을 20장처럼 (가게·대장간·마구간·수호신 2칸) | 그대로 — 아니면 레벨 70 적 앞에서 고급 물약이 없다 |
| 7 | 회차마다 보스 첫 처치 확정 드롭(고유·신화)이 다시 나옴 · 메인 의뢰 보상 다시 | 받아들인다 (회차 보상). 고유 장비 중복은 팔 수 있다 |
| 8 | 회차 전용 업적 | 이번엔 없음 (§6 끝에 바뀔 고정 수) |
| 9 | 통계 `ng` 필드 — 서버가 모르는 필드 사건을 거절 | 넣는다, 서버 허용 목록과 같은 배포. 빼려면 §7 한 줄을 지우면 끝 |
| 10 | 모형 영웅(2회차 Lv 70 · +12)보다 약한 플레이어 (Lv 64 · +9 · 희귀도 3: s04 보스 185타 · 25 %) | 받아들인다 — 마을이 20장 물품을 팔고, 엔딩 뒤 외전 둘(Lv 70–72)을 먼저 끝내면 모형에 가까워진다. VERIFY 가 이 영웅으로 한 번 플레이 |
| 11 | 1부 초반 보정 때문에 질긴 적(s09) 타수가 1회차의 두 배 | 받아들인다 · 불편하면 `comp.hp` 2.5 → 2.0 (보스 타수 −15 %) |
| 12 | 옛 클라이언트에서 회차 세이브가 1회차 세기로 진행 | 받아들인다 (멈춤·지움 없음) |
| 13 | 공유 파일(world.js · boss.js · main.js · common.js · cloud.js · achievements.js · arcade.js)과 다른 작업의 충돌 | 줄 하나씩 · `[hook:ng]` · ARCHITECTURE 에 적음 |
| 14 | 다른 기기의 1회차 기록과 이 기기의 회차 기록 충돌 | 평소 충돌 화면 + 요약의 '· N회차' 로 고른다 (`markOverwrite` 안 함) |

## 13. 통합 기록 (NG-VERIFY)

| 항목 | 결과 |
|---|---|
| 규칙·세이브·월드 (NG-CORE) | **통과.** `startNgPlus` 를 고정 세이브와 옛·이상 세이브 15종(v1 · ch6 · 새 게임 · flags 배열 · 보관함 없음/객체 · 가방 쓰레기 · `ng` 쓰레기 · n 8 · `__proto__` 키 · 통계 없음 · 모르는 필드 · 지옥 · 모르는 난이도)에 돌림: 던짐 0 · 원본 불변 · 클라·서버 `isValidSave` 참 · 이관 멱등 · §2.2 '그대로' 칸 전부 같음 · 중요 물품 0(가방·보관함) · `past` ≤ 24 KB · < 256 KB. 실제 플레이 세이브(봇이 회차 s01·s03 클리어 → 결과 화면 저장): `cleared`·`unlocked`·`bosses`·`loot_*` 이번 회차 것만, `ng` 그대로. 세계의 심장 다시 떨어짐(N3) · 별의 조각·유물은 `secrets` 초기화로 다시 놓임(`spawnPlaced`) · `endingAfter` 는 진행만 봄 → 2부 진엔딩 길 열림. 5회차까지 넘기기: `past` 더 좋은 랭크·짧은 시간·합집합, `hist` 끝 기록 정확. 옛 클라이언트(02f1e6f, node·브라우저): 멈춤·지움 없음 · `ng` 보존 · 1회차 세기 — 단 옛 `guardianSlots`(장 0 → 1칸)가 편성의 두 번째 수호신을 비운다(동료는 남음, 열린 문제 1). 월드: 실제 세이브로 2회차 s01 적 Lv 70 · 체력 ×3.85 · 공격 ×2.2 · 정예 7 % · 보스 `inferno` 참 · 배너 '2회차 · CHAPTER 1 · …' · 4회차 s20 니힐 Lv 99. 세기는 `world.stage.level`·`world.diff` 한 길로만 들어가 일반 적·정예·보스·소환(`spawnEnemy`)·경기장 적에 한 번씩(`STAGES` 직접 읽기 0, 월드를 스테이지 객체로 다시 만드는 길 0) |
| 화면 (NG-UI) | **통과 + 결함 1 고침.** U1–U8 desk·phone1·phone2 (+ U2 토스트 줄 3개 = 90). 실제 흐름(이어하기 → 슬롯 2 → 피의 윤회 → 확인 → 서막 → 마을 → 세계 지도 s01 '적 레벨 70' → s01 → 일시정지 → 결과): 오류 0, 업적 알림 0. **결함**: 슬롯 동작 목록이 열린 채 업적 소급 알림(5초, 묶음 배포 첫 실행에 돌아온 모든 플레이어가 본다)이 기본 자리 y 92 에 떠 첫 줄 '불러오기'를 가렸다 — 맨 위 슬롯은 원래도, '피의 윤회' 두 줄로 목록이 길어진 뒤엔 phone1 슬롯 2·3 도 → `slots.js` `get toastY()` (목록이 열려 있으면 제목 줄 `st + 30`). 시험 U2 '토스트가 동작 줄을 가리지 않음' 고치기 전 실패(겹친 줄 phone1 2 · phone2 4 · desk 2) → 뒤 통과 |
| 업적·아케이드·통계·클라우드·서버·도구 (NG-SYNC) | **통과 + 결함 1 고침.** **결함**: '피의 윤회 · 빈 슬롯 k'(복사)는 원래 슬롯과 복사본이 같은 누적 통계를 가져 합 지표 `kills`(`sumOf`)가 두 배 → `cb_kill_10k`(30점·이명 「피의 수확자」) 거짓 달성 + `prog.kills` 영구 부풀림 (처치 5,000 → 10,000). → `digestState` 에 `run`(= `created`) · `sumOf` 는 같은 `run` 을 큰 값 하나만 (코드로 옮긴 사본도 같은 규칙). C9 '빈 슬롯 복사' 고치기 전 실패 → 뒤 통과. 같은 슬롯 넘기기·두 번째 넘기기·5회차: 새 달성 0 · 지표 67개 하나도 줄지 않음 · `diffEnding` 은 가상 슬롯 난이도로만. 연습 목록 22스테이지(`past.unlocked`). 명예의 전당 줄 `run '1:<created>:1'`·`ng 1`(실제 결과 화면). 통계 `ng` 1–9 · 서버 허용 목록 4사건 · 모으기 `'<stage>|<diff>_ng<n>'` 줄(보고서에 별도 줄) · 사망·보스 표 제외. 클라우드 요약·서버 `saveSummary` `ng`, 같은 슬롯 넘기기 = 'local' 자동 올리기(`markOverwrite` 0). balance `--ng 1..3 --check` 4 × 7 × 3 = 84/84 (최대 받는 피해 ×1.07 / 1.37 / 1.57, 보스 타수 ×0.89 / 0.92 / 1.05 — §3.4 표와 같음) |
| 손맛 (2회차 s01·s12, 4회차 s20 — 카엘·리아) | 실제 게임(이야기 모드, 고정 세이브 영웅, 봇 `playthrough` 길찾기·근접 + 스킬, 보통): 2회차 s01 카엘 Lv 72 보스 5 s · 리아 Lv 68 14 s (보스 한 대 최대 12 %) · s12 드라큘라 카엘 12–13 s (최대 4 %) · 리아 16–36 s (최대 24 %) · 4회차 s20 니힐 Lv 99 모형 카엘 22 s (최대 15 %) · 리아 35 s (25 %) · 약한 영웅(§12-10 Lv 64 +9 희귀도 3) 2회차 s04 보스 18 s (16 %). 모두 클리어, 카엘 1/3 넘는 한 대 0. 질긴 적 처치 시간(실제 콤보·치명·속성·수호신 포함): 2회차 카엘 0.5–1.7 s · 리아 0.8–5.2 s(태엽 골렘) vs 1회차 같은 스테이지 모형 영웅 카엘 0.8–1.8 s · 리아 0.9–3.7 s → 1회차와 비슷하고 가장 질긴 적(리아·태엽 골렘)만 ×2.7 = 설계가 받아들인 범위. **`comp.hp` 2.5 그대로** (2.0 으로 낮추면 1부 보스가 1회차보다 더 짧아진다). 경험치·골드: 2회차 s01 +42–53 k 골드 · s12 Lv 72 → 76, Lv 99 에서 멈춤(넘침 0) |
| 시험 | test_ngplus 165 · `--browser --ui` 180+ · ngplus_ui 90 · test_achievements 256 (`--ui` 257) · ach_ui 101 · test_save_v2 72 · test_companion_state 81 · test_companions 22/22 · test:api · test:online · test:online:client 15 · test:client 12 · test:telemetry 16 · test:telemetry:client 9 · test_tower 4 · test_part2 --static 23 · bindings 43 · hook_tags (`--update` 뒤 다시) · integration 13/13 (title·hub·worldmap·menu·arcade·tower·s01·s04_boss·s20_boss·s01_ng·s20_boss_ng·s21_boss·s22_boss) · `--mobile` 4/4 · platform_view front,stack 26/26 · balance 회차 없이 5 난이도 × 7 영웅 × (표·json·check) 출력이 02f1e6f 와 바이트까지 같음, `normal --check` 7/7 |
| 글꼴 | `build_fonts.py --check` 통과 (첫 화면 470.1 KB / 500), 새 글자 0 (고친 두 곳에 새 문장 없음) |
| 예산 | 임시 빌드(02f1e6f 와 같은 방법으로 비교): APK lo 그림 단계 45.417 → **45.430 MiB** (+13.8 KB, 상한 45.8) · 첫 화면 brotli 719,606 → 719,869 B (+263 B: 첫 조각 파일의 인라인 `ng` 읽기, 0.69 / 1.60 MB) · 아티팩트 검사 통과 (파일 256/511 · 59.7 MB · 조각 8 · 팩 20). 임시 빌드 지움, `dist/artifact_publish.json` 바이트 그대로 |
| 설계와 다른 점 | ① 업적 요약 `run` + `sumOf` 같은 진행 한 번 (빈 슬롯 복사 거짓 달성, achievements.md §3.3 에 적음) ② 슬롯 동작 목록이 열려 있으면 토스트를 제목 줄로 ③ 통계 모으기의 회차 줄 분리(NG-SYNC, 요청 파일에 보고됨) ④ §9 'NG-VERIFY 는 고치지 않는다' 는 리드 지시로 최소 수정. **열린 문제**: (1) 옛 클라이언트가 회차 세이브를 불러오면 두 번째 수호신 편성이 비워진다 (새 클라이언트에서 다시 넣으면 됨, §5.5 범위 — 옛 앱은 고칠 수 없다) (2) 옛 클라이언트의 명예의 전당 줄은 `:n` 없이 1회차 줄과 합쳐진다 (§5.5) |
