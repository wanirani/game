# P1 — 본 게임(첫 조각) 제작 약속

2026-11-17. 시범판(P0)이 끝나 본 게임을 만든다. 무엇을 만드는지는 `GDD.md`(특히 7절 전투, 9.1 분 단위, 9.2 범위), 소유자 결정은 `README.md` §2. 이 문서는 **여러 작업 구역이 동시에 일할 때 서로 부딪치지 않게 하는 약속**만 적는다. 부딪치면 헌장 > 이 문서 > 구역 문서.

## 1. 소유자가 바라는 것 (모든 구역의 합격 기준)

1. 배경·캐릭터·인터페이스가 모두 3D 게임에 어울리고, 이질감이 없고, 디테일이 있다. 납작한 그림판(빌보드)으로 된 적·석상·소품은 남기지 않는다.
2. 타격감(효과·음향)이 최고여야 하고, 마법은 3D 로 화려하게.
3. 느리지 않고 경쾌하게 움직인다. 폴드(편 화면, 터치)에서 끊기지 않는 것이 먼저다.
4. 인터페이스는 「세공한 유리」: 맑은 반투명(배경이 비친다), 굵은 실루엣의 전용 아이콘, 단추 아래 한글 이름표, 붓 느낌 피해 숫자. 단순한 기호·앱 같은 모양은 안 된다.

## 2. 장면과 폴더 (구역 = 폴더. 남의 폴더는 읽기만 한다)

| 구역 | 폴더 | 내용 |
|---|---|---|
| ENGINE | `src/v2/game/` · `src/v2/chooser.js` | 본 게임 장면 `v2g`(`src/v2/game/index.js` 의 `export default` = `Scene` 하위 클래스). 그리기(세계·입체 캐릭터 여럿·효과), 충돌, 카메라, 개체(영웅·적·인물·탄), 지역 불러오기·넘어가기, 상태·저장, 성능 설정 |
| PLAY | `src/v2/play/` | 카엘의 기술표, 적 6종의 행동, 보스 밴시 여왕 (ENGINE 의 개체 규약 위에) |
| WORLD | `src/v2/world/` · `src/v2/env/` · `assets/v2/env/` · `assets/v2/props/` | 지역 자료(에슈빌·안개의 묘지·배웅의 납골당·종탑, 두 밤), 환경 키트 확장, 입체 소품 |
| UI | `src/v2/ui/` · `assets/v2/ui/gem/` | 싸움 화면(단추·촛불·울림 눈금·밤 표시), 대화 창, 알림, 일시정지 등 화면 |
| STORY | `src/v2/data/` | 대사·사건 순서·인물·물건·연대기 글 (자료만, 코드 없음에 가깝게) |
| (끝난 것, 읽기만) | `src/v2/char3d/` `src/v2/fx/` `src/v2/feel/` `src/v2/b/` `src/v2/bench/` `assets/v2/char3d/` `assets/v2/audio/` | 고칠 것이 있으면 `/tmp/claude-0/v2/requests.md` 에 적는다. 단 ENGINE 은 필요한 코드를 `src/v2/game/` 으로 **복사해 와서** 고쳐도 된다 (B 는 시범판으로 얼려 둔다 — v2c·v2bench 가 B 에 기대고 있다) |
| v1 셸 | `src/core/` 등 | ENGINE 만, `requests.md` 에 이미 적힌 작은 것(게임 캔버스 alpha, `everyFrame`·`alpha`, `input.touchStick`, 에셋 확장자)만, v1 동작이 바뀌지 않게 깃발 뒤에서 |

- 장면 등록(`src/scenes/reg_v2.js`)과 배포 목록(`tools/deploy/v2_ship.txt`)은 총괄(메인 세션)이 고친다. `v2g` 는 이미 등록돼 있다 → `index.html?scene=v2g`.
- 도구·검사는 `tools/v2/<구역>_*.mjs|html`, 문서는 `docs/v2/`, 보고·캡처는 `/tmp/claude-0/v2/<구역>/`.

## 3. 구역 사이 규약 — 먼저 문서로 정한다

각 구역은 시작하고 **20분 안에** 자기 규약 문서의 첫 판을 저장소에 쓴다. 다른 구역은 그 문서만 보고 맞춘다. 바꾸면 문서 맨 위 "바뀐 것"에 한 줄.

| 문서 | 쓰는 구역 | 정하는 것 |
|---|---|---|
| `docs/v2/AREA_FORMAT.md` | WORLD | 지역 자료 모양: 환경 키트 스테이지(`src/v2/env/stage_slice0_env.js` 형식) + `id · name · era('now'｜'past') · twin · spawns · exits · actors · enemies · triggers · interact · camera · room · music`. `src/v2/world/index.js` 가 `AREAS`(id → 불러오는 함수)와 `validateArea()` 를 내보낸다 |
| `docs/v2/ENGINE_API.md` | ENGINE | 개체 규약(위치 `x,y,z`, 보는 방향 `dirX,dirZ`, 상태 기계, 맞는 상자·때리는 상자), PLAY 가 기술·적 행동을 꽂는 자리, UI 가 읽는 상태, STORY 사건을 실행하는 자리, `window.__v2` 검사용 값 |
| `docs/v2/UI_API.md` | UI | `createHud(game)` → `hud.update(dt, state)` · `hud.draw(ctx, state)` · 터치 단추 차림, 대화 창·알림·화면들을 여는 함수, 읽는 상태 모양(`HudState`) |
| `docs/v2/DATA_FORMAT.md` | STORY | 대사 묶음·사건 순서·물건·연대기 자료 모양과 열쇠 이름 |

공통 약속:
- 좌표는 헌장 §4 (x 오른쪽, z 화면 안쪽, y 위, 논리 높이 540). 사람 키는 `src/v2/char3d/hero3d.js` 의 `UNIT`.
- 캐릭터 모델 `assets/v2/char3d/<id>.glb`, 동작은 클립 묶음 `assets/v2/char3d/clips/`(`docs/v2/ANIM_LIBRARY.md`). 사람 꼴은 모두 같은 클립을 쓴다.
- 타격 연출값은 `src/v2/feel/table.js` 한 곳에서 읽는다(소리·화면이 같은 표). 효과는 `src/v2/fx/`(`docs/v2/FX.md`), 소리는 `src/v2/feel/`(`docs/v2/SOUND_FEEL.md`).
- 성능 설정은 `localStorage['bn.v2.perf']`(`docs/v2/PERF_NOTES.md`, `requests.md` 의 bench 절)을 읽는다.
- 화면 글은 한국어. 새 글자는 `python3 tools/fonts/build_fonts.py --check` 를 통과해야 한다(주석·셰이더 문자열의 한글도 검사에 걸린다 — 글꼴에 없는 글자는 피해 쓴다. **`build_fonts.py` 를 옵션 없이 돌리면 글꼴을 다시 만든다. `--check` 만 쓴다**).

## 4. 지킬 것

- 서명 키·비밀값을 읽거나 출력하거나 커밋하지 않는다. `git` 은 메인 세션과 자동 저장이 한다 — 구역은 커밋·푸시·되돌리기(`git checkout`/`reset`/`stash`/`clean`)를 하지 않는다.
- 남의 브라우저·프로세스를 죽이지 않는다(`pkill`·`killall` 금지). 자기가 띄운 것만 닫는다. 헤드리스 검사는 한 번에 브라우저 하나.
- 그림·모델 생성은 Higgsfield 만: 그림 `gpt_image_2_5`, 입체 `generate_3d`. 프롬프트에 게임·회사·상표 이름을 쓰지 않는다. 구역마다 크레딧 상한이 있고 `tools/higgsfield/manifest_<구역>.json` 에 기록한다. 생성 호출이 권한 문제로 거절되면 다시 시도하거나 돌아가지 말고, 프롬프트와 값을 `/tmp/claude-0/v2/<구역>/gen_requests.json` 에 적어 두고 자리 채우기로 계속한다(메인 세션이 대신 돌린다).
- 배포 묶음에는 `tools/deploy/v2_ship.txt` 에 적힌 `assets/v2/` 파일만 실린다. 새로 실어야 할 파일은 보고에 적는다. APK 는 95 MB 이하.
- 끝낼 때 보고: 한 일, 검사 결과(통과/실패 그대로), 남은 문제, 다음 구역이 알아야 할 것, 쓴 크레딧. 소유자에게 보일 그림은 `/tmp/claude-0/v2/owner_<구역>.png`.
