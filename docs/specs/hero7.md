# 7번째 영웅: 이졸데 드라켄 (용창 기사) — 설계 계약

> **상태: 통합 완료 (H7-INTEG, 2026-10-05)** — `CHAR_ORDER` 7번째, 선택 화면·헌터 교체·아케이드(탑·연습·보스 러시·서바이벌)·일일 도전·서버 목록·스토리 합류(s14_outro)·QA 목록에 들어갔다. 세부는 §7.

리드가 정한 설계. 구현 세부(수치 미세 조정, 이름 다듬기)는 담당 에이전트가 정하되, 아래 **굵은 항목**은 바꾸지 않는다.
바꿔야 할 이유가 생기면 `/tmp/claude-0/plan/h7_requests.md` 에 적고 리드에게 알린다.

## 1. 정체성

| 항목 | 값 |
|---|---|
| id | **`isolde`** |
| 이름 | 이졸데 드라켄 / ISOLDE DRACHEN |
| 칭호 | 용창 기사 |
| 무기 계열 | **`spear` (새 계열)** — 긴 창. 찌르기 위주, 사거리 길고 공중 급강하가 장기 |
| 성별·체형 | 여성, 장신(height ≈ 1.02), 탄탄한 기사 체형 (`build: 'athletic'` 또는 기존 값 중 가까운 것) |
| 외형 | 은청색 판금 + 짙은 남색 천, 용 비늘 문양 견갑, 한쪽 어깨에 짧은 망토, 날개 모양 장식 투구(얼굴은 보임), 은발 땋은 머리, 청록 눈. 창은 은빛 창날 + 용 갈기 장식 |
| 기본 색 | primary `#2a3450`, secondary `#6ad0e0`, trim `#d8dce8`, 망토 `#1a2238` |
| 출신 (2부) | 이계(균열 너머)의 무너진 '하늘 기사단'의 마지막 용기사. 용을 균열에 빼앗겼다. 세부 서사는 `docs/specs/world2.md` 에 맞춰 이야기 담당이 다듬는다 |
| 합류 | **2부 14장(s14) 보스 처치 후** 스토리 이벤트로 합류. 플래그 **`isolde_joined`** |
| 기본 스탯 | hp 125, mp 55, atk 15, mag 8, def 9, res 8, agi 12, luck 7, crit 7 (성장치는 카엘·아젤 사이) |
| 이동 | speed 280, **jump 880 (최고)**, airJumps 1, dash 'dash', dashSpeed 680 |
| 별점 | 공격 4, 방어 3, 속도 3, 마법 2, 사거리 4 |
| 궁극기 | 천룡강림 — 화면 위로 도약했다가 용 모양 번개와 함께 내리꽂는다 |

## 2. 직업 계보 (7개, 다른 영웅과 같은 형식)

| id | 단계 | 이름 | 방향 |
|---|---|---|---|
| `isolde_lancer` | 0 | 창기사 | 기본. 특성: 공중 ↓+공격이 급강하 찌르기(착지 충격파) |
| `isolde_dragoon` | 1 | 용기사 | 점프·급강하 강화, 번개 속성 |
| `isolde_stormlord` | 2 | 뇌룡기사 | 번개. 공중 점프 +1, 급강하 시 낙뢰 |
| `isolde_wyrmknight` | 2 | 흑룡기사 | 용의 불꽃(화염·암흑). 흡혈 소량, 창 끝에 용염 |
| `isolde_valkyrie` | 1 | 발키리 | 신성. 투창(보조 공격으로 창 던지기) |
| `isolde_einherjar` | 2 | 전장의 여신 | 신성 날개, 받는 피해 감소, 투창 다발 |
| `isolde_spearsaint` | 2 | 창성 | 치명타·연속 찌르기(천 번 찌르기) 특화 |

각 직업의 `look` 덮어쓰기(색, 날개, 후광, 투구 등)는 그림 담당과 데이터 담당이 같은 값을 쓴다: 데이터 담당이 `classes.js` 에 먼저 쓰고, 그림 담당은 그 값을 보고 그린다.

## 3. 무기 `spear` 동작 (movesets.js)

- ground 4타: 찌르기 → 찌르기(약간 위) → 휘둘러 베기 → 연속 찌르기(rehit, finisher). 상자 x 길이는 채찍과 비슷한 150~180.
- air: 2타 (찌르기, 아래로 베기).
- **down (공중 ↓+공격): 급강하 찌르기** — 빠르게 수직 낙하, 닿으면 pogo, 착지 시 작은 충격파. 이졸데의 핵심 손맛.
- up: 장대 도약 띄우기(launch). crouch: 낮은 찌르기. dash: 돌진 찌르기(lunge). charge: 회전 드릴 찌르기(다단, finisher).
- 애니메이션 이름은 **기존 퍼펫 포즈 이름을 재사용**한다(thrust, slash_wide, spin, launch, down, lash 등). 새 포즈가 꼭 필요하면 그림 담당에게 요청.

## 4. 장비·상점

- 창 무기 `w_spear_1` … : 다른 무기 계열과 같은 등급 수·같은 수치 곡선. 상점·대장간·전리품 표에 다른 계열과 같은 방식으로 들어간다.
- 시작 장비: `w_spear_1`, 기존 갑옷 하나, 보조 무기는 기존 것 중 투창과 가까운 것(예: 도끼/단검).

## 5. 각성·궁극기

- `game/skills.js` ULTS 에 isolde 추가(기존 6명과 같은 등급 구조·연출 수준).
- `data/awaken.js` 에 isolde + T2 4개 변형, 각성 연출(director)은 `game/awaken_directors_b.js` 와 같은 방식의 새 파일 또는 기존 파일에 추가.
- 컷인 그림 `assets/cg/cutin_isolde.webp`, 초상 `assets/portraits/isolde.webp` (그림 담당).

## 6. 작업 분담과 파일 소유

| 담당 | 파일 |
|---|---|
| H7-ART (그림) | `tools/puppet/**`, `assets/puppet/**`(또는 퍼펫 에셋 위치), `src/render/puppet_manifest.js`, `src/render/hero_puppet.js` 의 영웅별 표, `assets/portraits/isolde.webp`, `assets/cg/cutin_isolde.webp`, `docs/art/notes_hero7.md` |
| H7-PLAY (게임) | `src/data/characters.js`, `classes.js`, `movesets.js`, `skills.js`, `awaken.js`, `items.js`·상점·전리품 표, `src/game/skills.js`(ULTS), 각성 director, `src/render/hero.js`(벡터 대체 그림의 창), `src/render/ultfx.js`, 소리 지정 |
| H7-INTEG (나중) | 캐릭터 선택(7명 배치), 파티, 스토리 합류(`story_p2.js` 등), 아케이드·탑·오늘의 도전 영웅 목록, 서버 `netlify/lib/gamedata.mts`, 테스트 목록, 문서 |

- ~~**통합 전까지 `CHAR_ORDER` 에 넣지 않는다.**~~ (통합 완료 — §7) 데이터는 `CHARS.isolde` 로 두되, 선택 화면·아케이드·서버 목록에는 H7-INTEG 가 넣는다. 그 전에도 기존 시험이 모두 통과해야 한다(모든 `CHARS` 를 도는 코드가 있으면 확인).
- 시험용 진입: `?scene=stage&stage=s01&char=isolde` 같은 기존 디버그 경로가 있으면 그것을 쓴다.
- 서로 필요한 것은 `/tmp/claude-0/plan/h7_requests.md` 에 한 줄씩 적는다 (`[보낸이→받는이] 내용`).

## 7. 통합 기록 (H7-INTEG)

| 항목 | 결과 |
|---|---|
| 목록 | `CHAR_ORDER` 7번째. 선택 화면 표(`STAGE_BG` = `bg/s17_sky`, `ACCENT` = `#6ad0e0`, `WNAME.spear` = '장창'), 잠긴 화면 둘째 줄 `unlock.hint`, `overlays.js FACE` [0.5, 0.23], `main.js` 초상 미리 받기, 아티팩트 BOOT 팩(초상·창기사 퍼펫). 타이틀 코나미 해금·엔딩 등장인물은 `CHAR_ORDER` 를 따라 자동 |
| 배치 | 7명 타일: 데스크톱 1280×720 타일 57 UI px, 휴대폰 740×360 탭 46×53 CSS px, 844×390 탭 52×58 CSS px (`platform_view` front·arcade 통과). 헌터 교체 카드 7장 |
| 스토리 | `s14_outro` 미라 합류 뒤: 흐린 거울이 깨지며 등장(`cg/cutin_isolde` 를 한 장면 빌림, 새 CG 없음) → 정체·용 아르겐·레이븐과 하늘 기사단 → `unlockChar` + NEW HUNTER 카드 + `isolde_joined`. 이졸데로 플레이 중이면 혼잣말 분기. `b_nihil_final` 다른 헌터 목소리, `CREDITS_P2` 첫 줄 |
| 옛 세이브 | `migrateState`: `cleared.s14` 인 세이브 → `isolde_joined` 소급. `storyJoinedChars(state)` → 마을 입장 때 메타 `unlockedChars` 에 보태고 토스트, 헌터 교체도 연다 |
| 서버 | `config.mts CHARACTER_IDS` + `gamedata.mts CLASS_INFO` 7직업 — 세이브 검사·온라인 기록·일일 도전(잠긴 영웅도 체험으로 고른다, 리아·아젤과 같음) |
| 그림 요청 | g3·charge 와인드업 먼 주먹: 연속 찌르기(rehit) 앞 25% 를 당긴 자세에서 섞어 들어가게(`hero.js` attackPose) → review grip2 g3 0.66 · charge 0.32 px (전 5.6). 에인헤랴르 `wings: 'angel'` 은 유지 — §2 "신성 날개" 가 직업 정체성이고, 날개가 없으면 발키리와 실루엣이 거의 같다(같은 흰·금). 금 깃털 견갑은 날개 뿌리 앞에 겹쳐 '날개 달린 갑옷' 으로 읽힌다 |
| QA | `turntable.mjs` 기본 묶음 = `CHAR_ORDER` 전원, 정면 대칭 하한 isolde 0.72(세운 창·한쪽 땋은 머리). `feel_test`·`perf_budget`·`visual_review`·`run_all` 기본 영웅에 isolde, `integration.mjs` `s01_isolde`·`s15_isolde`, `test_save_v2` 소급 검사 |
