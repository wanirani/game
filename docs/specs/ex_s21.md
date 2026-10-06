# 외전 21장 「하늘 정원의 용」 — 설계 계약

> **상태: 통합 완료 (EX-INTEG, 2026-10-05)** — 이야기(`data/story_ex.js`) · 세계 지도 외전 노드·해금(`p2_done`) · `STAGE_ORDER_P2` · 탈것 `mt_argen` · 아케이드(보스 러시 외전 코스·서바이벌·무한의 탑 41층 이후) · 서버 목록 · 시험·문서. 세부는 §7.

리드가 정한 설계. **굵은 항목**은 바꾸지 않는다. 바꿀 이유가 생기면 `/tmp/claude-0/plan/ex_requests.md` 에 적는다.

## 1. 개요

| 항목 | 값 |
|---|---|
| 스테이지 id | **`s21`** (chapter 21, part 2, page 1) |
| 이름 | 하늘 정원의 둥지 / 부제 「용들이 잠들었던 구름 위의 성소」 |
| 여는 조건 | **2부 엔딩 후 (`p2_done`)**. 세계 지도 2부 쪽에 외전 표시로 나타난다. 스토리 진행(엔딩)에는 영향 없음 |
| 위치 | 17장 「폭풍의 공중정원」 위쪽, 하늘 기사단의 옛 성소. 이졸데의 용 아르겐이 공허에 물든 채 둥지를 틀었다 |
| 레벨 | 70 (s20 은 68). parTime 600 |
| 테마·그림 | 기존 하늘 테마 재사용: theme 'sky', bg `bg/s17_sky`, tex `tex/tex_sky_marble`, tileStyle 'sky'. **새 배경 그림 없음** |
| 기믹 | `wind` (s17 과 같은 바람). 수직 구조 위주 — 이졸데의 급강하 찌르기가 빛나는 지형 |
| 적 | 기존 2부 적 재사용 (하늘·공허 계열: storm_harpy, void_herald, nihil_spawn 등 실제 id 는 enemies_c/d 에서 고른다). **새 적 없음** |
| 음악 | 스테이지 `s17`, 보스 `boss4` (또는 기존 최종 보스 곡) 재사용 |
| 방 | 6개 (마지막이 보스 아레나). 기존 맵 형식·검증기(`tools/validate_maps.mjs`) 규칙을 따른다 |

## 2. 보스 `b_argen` — 공허에 물든 용 아르겐

| 항목 | 값 |
|---|---|
| id | **`b_argen`**, 이름 아르겐, 칭호 「공허에 물든 은룡」 |
| 모습 | 은빛 비늘의 거대한 하늘 용. 몸 곳곳이 검보라 공허 결정에 잠식되어 있고, 가슴에 공허의 핵이 박혀 있다 |
| 체급 | b_ziz 보다 한 단계 위 (s21 레벨 기준, `tools/balance.mjs` 보스 타수 기준에 맞춘다) |
| 패턴 (7~8개) | 은빛 번개 숨결(가로 쓸기), 급강하 돌진, 날개 돌풍(바람 기믹과 연동), 공허 결정 비, 꼬리 휩쓸기, 하늘로 사라졌다 내리꽂기, 2페이즈부터 공허 핵 노출(약점) |
| 페이즈 | 3단계. 마지막엔 공허 결정이 깨지며 은빛이 돌아온다 |
| 결말 | **죽이지 않는다** — 체력 0 이 되면 공허의 핵이 부서지고 아르겐이 정화된다 (보스 처치 처리는 같게, 연출만 정화) |
| 구현 | 2부 보스 키트(`src/game/bosses/c_common.js`)와 기존 2부 보스 파일 형식. 데이터는 `src/data/bosses_*.js` 에 추가 |
| 그림 | 벡터 그림(기본) + 채색(painted) 그림. 채색은 기존 보스 파이프라인(`docs/art/BOSS_PIPELINE.md`)과 Kling. **Kling 한도 120크레딧** |
| 아케이드 | 보스 러시 목록 끝에 추가, 무한의 탑 보스 후보(선택) |

## 3. 보상 — 탈것 `mt_argen`

- 아르겐이 정화된 뒤 **탈것 동료로 합류** (`recruit` 명령, 플래그 `recruit_mt_argen`).
- rig `'wyvern'` 재사용, 은청색 팔레트. 능력: 활공 + 번개 급강하(충격파), 특수기 「은빛 번개 숨결」(thunder). 기존 탈것 수치 범위 안.
- 채색 탈것 그림은 기존 탈것 파이프라인으로 만들 수 있으면 만들고(앞 Kling 한도에 포함), 아니면 벡터 와이번 + 팔레트로 둔다.

## 4. 이야기

- 도입(s21_intro): 엔딩 뒤 평화로운 마을/공허의 끝에서 이졸데가 하늘 정원에서 들려오는 용의 울음을 듣는다. 일행이 함께 간다. 이졸데가 파티에 없어도 그녀가 NPC 로 등장해 동행한다 (기존 R/RN 방식).
- 보스 전(intro 대사), 결말(s21_outro): 아르겐이 정화되어 이졸데와 재회 → 탈것 합류 → 짧은 맺음. 플래그 **`ex_s21_done`**.
- 영웅별 반응 한 줄씩(기존 H({...}) 방식), 이졸데로 플레이 중이면 본인 분기.
- 같은 작업에서 **2부 15~20장의 일반 대사 중 이졸데 전용 한 줄**을 장마다 1~2개 추가해, 그녀로 플레이할 때 대사가 비지 않게 한다.
- 문장은 자연스러운 한국어. 새 CG 없음(기존 그림 재사용). 폰트에 없는 글자는 피하거나 저장소 도구로 서브셋을 다시 만든다.

## 5. 예산

- APK 그림 단계는 45 MB 에 거의 닿아 있다 (→ 통합 뒤 리드가 48 MB 로 올렸다, §7 예산). 새 채색 그림은 lo 사본 기준으로 작게 유지하고, 빌드 보고서의 그림 단계 수치를 보고한다. 넘치면 리드가 예산을 정한다(임의로 기준을 올리지 않는다).

## 6. 작업 분담

| 담당 | 파일 |
|---|---|
| EX-MAP | `src/data/maps/s21.js`(새 파일), `src/data/stages.js` 의 s21 항목 (**`STAGE_ORDER_P2` 와 세계 지도에는 넣지 않는다** — 통합 담당), 맵 검증 |
| EX-BOSS | 보스 로직 새 파일, `src/data/bosses_*.js` 항목, 벡터·채색 그림, 갤러리, `tools/painted/**` 보스 설정, 보스 Kling 기록 |
| EX-INTEG (나중) | 이야기(`story_p2.js` 등), 세계 지도 노드·해금, `STAGE_ORDER_P2`, 탈것 `mt_argen`, 아케이드 목록, 서버 gamedata(스테이지·보스 목록), 시험·문서 |

## 7. 통합 기록 (EX-INTEG)

| 항목 | 결과 |
|---|---|
| 해금·순서 | `stages.js` s21 `side: true`, intro/outro 기본값(`s21_intro`/`s21_outro`), `STAGE_ORDER_P2` 끝에 s21, `SIDE_STAGES`·`isSideStage`. `next` 사슬 밖 — `town/worldmap.js` 가 `flags.p2_done`(두 엔딩 — 엔딩 대본 도중 앱을 닫은 세이브를 위해 엔딩 장면이 먼저 저장한 `ending_p2`·`ending_p2true` 도) 이면 처음 지도를 열 때 `unlocked` 에 넣고 한 번 연출(`s21_revealed`, '외전 · 하늘 정원의 둥지'). 2부 엔딩 판정·`ENDING_STAGES`·`endingAfter` 는 그대로 (s21 은 엔딩으로 가지 않는다) |
| 세계 지도 | 이계 지도 노드 s21 (mapPos `{x:0.8, y:0}` — 17장 위쪽 구름 띠, 17→18 나선 길과 겹치지 않게), 17장에서 위로 휘어 오르는 은빛 점선 갈림길, 인장에 장 번호 대신 '외전' + 도는 점선 고리, 정보판 'SIDE STORY · 외전' · 외전/동료 칸. 나선 사슬(s14→s20)에는 들지 않는다 |
| 진행 숫자 | 클리어해도 `progress.chapter` 를 올리지 않음(`results.js`) → NPC 장 대사·상점 단계·메뉴 '2부 · 20장 돌파' 그대로. 슬롯 요약의 가장 먼 장·서바이벌 적 순서·무한의 탑 순서 구간에서 뺀다 |
| 표시 | '외전 하늘 정원의 둥지' (메뉴 `stageLabel`·아케이드·명예의 전당·일일/연습 호출), 모험 기록 칸 '외전'(열렸을 때만), 도감의 아르겐은 외전이 열렸거나 쓰러뜨렸을 때만, 성당 힌트 한 줄, 발소리 지면 stone |
| 이야기 | `data/story_ex.js` (`SCRIPTS_P2` 에 합침): `s21_intro`(컷신, 대사 항목 28개 — 한 번에 보이는 줄은 분기별 10~11줄) · `s21_t1`(r3 '!' 10열) · `s21_t2`(r5 '!' 10열) · `b_argen_pre` · `b_argen_corrupt` · `b_argen_awaken` · `b_argen_post` · `s21_outro`(합류 `recruit('mt_argen')` + `ex_s21_done` — 조건 줄보다 앞). 이졸데가 아니면 `R('isolde')` 동행 NPC, 이졸데면 본인 분기. 영웅별 반응 `H({…})` 다섯 곳. 레이븐은 진엔딩을 봤으면 맨얼굴. 새 CG 없음(`cg/cutin_isolde`) · 도입 배경 `bg/s21_nest`(제목 카드·떠나는 끝 — 에슈빌 장면은 `bg/hub`, POLISH-1). 2부 15~20장에 `isolde:` 줄 11줄(장마다 2, 18장은 1 + 악몽 분기) · 두 엔딩에 2줄, `s18_t1` 이졸데 악몽 분기 3줄 |
| 탈것 | `mt_argen` 아르겐 · 은빛 뇌룡 (chapter 21, obtain flag `recruit_mt_argen`, rig 'wyvern' variant 'silver', 초상화 `portraits/cmp_mt_argen` 머리 자르기 `iconFocus {0.31, 0.25, 0.34}` — 정화된 아르겐, 보스 초상화와 같은 구도 (POLISH-1, `tools/kling/manifest_polish-1.json`; `b_argen_post`·`s21_outro` 의 아르겐 줄도 이 초상화, 싸움 전·싸움 중 대사는 보스 초상화 `portraits/b_argen`)). 벡터만: `render/mounts_b.js` `MOUNT_PAL_B.mt_argen`(+ 각성 날개막 `membraneAw`), `MOUNT_DRAW_B`·`MOUNT_ICON_B`, `mount.js` `FB_COL`, 마구간 머리 번개 빛. 수치는 스칼렛·게일 사이 (속도 380, 점프 800, 날갯짓 3·활공 140/420, 돌진 760·mv 1.1·번개 경직 0.3, 급강하 900·충격파 r130 mv 0.9, 숨결 1초 240×80 mv 0.36 cd 6, hp 0.95, windMul 0.5, 탑승 번개 +15%·번개 저항 +20%). 숨결·충격파 색·입자·소리 = `mount.js` `ELEM_FX[element]` |
| 아케이드 | `BOSS_ORDER` 끝 b_argen (`STORY_BOSSES = 20`), 코스 5 '이계편 · 외전'(14장~외전, 8연전) · 6 '전 보스 연속 21연전' (`ex: true`). `exKnown(game)` = 코나미 · 2부 엔딩 본 적 · 슬롯 외전 해금 — 외전 코스·외전 연습 순위표·서바이벌 보스 웨이브(`arenaBosses(p2, ex)`)·무한의 탑 무작위 구간(`TowerPlanner` `lateBosses`, 41층 이후 → 첫 후보 45층)을 연다. 연습 목록은 슬롯 해금 그대로 |
| 서버 | `gamedata.mts` `STAGE_LEVELS.s21 = 70`(→ `practice:s21:*` 보드), `P2_STAGES` + s21, `SIDE_STAGES`, `DAILY_STAGE_IDS`(외전 제외 — 일일 도전 순서·이미 정해진 날짜의 도전 그대로), `COURSE_COUNT = 7`; `runs.mts` 일일 도전이 `DAILY_STAGE_IDS` 를 쓴다. `validate.mts`·`online.mts` 는 바꿀 것 없음 (스테이지·보스 목록을 보지 않는다) |
| 시험 | `tools/integration.mjs` s21 · s21_boss, `test_part2 --static` 외전 검사, `test_companion_state` 아르겐 행·범위, `test_companions` recruit 7, `test_mount` `ex_mt_argen`, `test_tower` lateBosses, `tools/online/test_online.mjs` STAGE_IDS 21 · 일일 외전 제외 · 코스 6/연습 s21 보드 |
| 예산 | 새 그림 없음. 그래도 APK lo 그림 단계는 47,202,026 B (45.02 MB) 로 옛 기준 45.00 MB 를 16,106 B 넘쳤다 (EX-BOSS 뒤 ≈44.994 MB; 늘어난 것은 JS 약 22 KB — 대본·코드). **리드 결정 (2026-10-05): 그림 단계 기준 48 MB** (`build_web.mjs` `BUDGET.apkImageBytes` · `build_apk.sh` `APK_IMAGE_BUDGET_MB` · `pack_web.py --image-budget-mb` · MASTER_PLAN 검토 표 20행, APK 전체 75 MB 그대로). EX-VERIFY 빌드: lo 단계 47,202,152 B (45.02 MB) / 48.00 MB — 여유 약 2.98 MB, 원본(full) 단계 57.97 MB, 소리 포함 72.79 MB / 75 MB |
| 도구 | `tools/balance.mjs` 끝 레벨 판정은 외전 앞(s20)에서 (s21 행은 정보) |
| 균형 (BAL-RULES) | **BAL-RULES (2026-10-06 — 공통 내용 ex_s25.md §10).** 공허 핵(coreBurst — 핵에 5% → 추락)은 약점 깨기라 플레이어 · 탈것의 타격만 센다: `pCore.onHit` 가 `b_common.ownHit` 를 본다 (수호신 자동 공격은 피해만; 고치기 전에는 수호신 한 대로도 추락). 싸움 봇 16판 (수호신 아리아 · 모모): 수호신 핵 피해 12타 → 0, 핵을 깬 판 전후 모두 0, 길이 중앙 43.0 → 50.7초 (같은 옛 코드를 다시 돌린 8판이 35–90초 · 중앙 42.8 — 잡음). `test_argen` 57/57 ×2 (새 검사 '수호신은 핵을 깨지 않음 · 플레이어 한 대는 추락' — 옛 코드 56/57). |
