# 7번째 영웅: 이졸데 드라켄 (용창 기사) — 설계 계약

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

- **통합 전까지 `CHAR_ORDER` 에 넣지 않는다.** 데이터는 `CHARS.isolde` 로 두되, 선택 화면·아케이드·서버 목록에는 H7-INTEG 가 넣는다. 그 전에도 기존 시험이 모두 통과해야 한다(모든 `CHARS` 를 도는 코드가 있으면 확인).
- 시험용 진입: `?scene=stage&stage=s01&char=isolde` 같은 기존 디버그 경로가 있으면 그것을 쓴다.
- 서로 필요한 것은 `/tmp/claude-0/plan/h7_requests.md` 에 한 줄씩 적는다 (`[보낸이→받는이] 내용`).
