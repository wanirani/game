# hero7 작업 노트 — 이졸데 드라켄(isolde) 7직업 채색 퍼펫 · 초상 · 컷인

PUPPET_PIPELINE.md 와 heroes3(아젤) 노트를 따라 7번째 영웅 이졸데(용창 기사, 긴 창)의 원화·리그·턴테이블·초상·컷인을 만들면서 배운 것.
클링 기록: `tools/puppet/kling_manifest_hero7.json`. 게임 데이터(직업 look·창 동작·hero.js)는 H7-PLAY 담당 — 요청/답은 `/tmp/claude-0/plan/h7_requests.md`.

## 0. 요약

| 항목 | 결과 |
|---|---|
| 클링 | 작업 38개, **49장 = 98크레딧**(상한 300). 실패 5작업(초상 v1·창기사 측면 v1·용기사 q3b/q3f·뇌룡기사 q3b 재시도) — 실패마다 재시도 1회만 |
| 초상·컷인 | `assets/portraits/isolde.webp` 800×1134 (99KB) · `assets/cg/cutin_isolde.webp` 1600×637 (120KB) + `assets/lo/` 사본(480×680 32KB · 960×382 48KB) |
| 퍼펫 | `assets/puppets/isolde/isolde_<직업>/` 7직업 × (atlas·mask lo/hi/ui · rig.json · turn.webp · turn_mask.webp), 합계 ≈3.1MB (직업당 373–482KB, 턴 시트 160–204KB) |
| 런타임 | `hero_puppet.js`: `GRIP_OFF.spear = [0,0]`, `drawTurnWeapon` 에서 창을 지팡이처럼 세워 듦. 영웅별 표는 없음 — 목·땋은 머리 체인·망토 고정점·머리 배율은 rig 의 `joints`/`runtime` 에 |
| 도구 | `build_rig.py` opt-in 3개(`params.torsoCarveBg`, `params.skirtTorsoCut`, `hands.grip.rodClose`), `build_turn.py` opt-in `turn.quality`, review 창 프리셋, 갤러리 `?heroes=` — 기존 영웅 리그엔 그 키가 없어 동작이 같음 |
| 예산 | 웹 사이트 57.8/90MB · APK lite(그림 단계) 44.76/45MB · 첫 화면 brotli 0.68/1.6MB |

## 1. 클링 원화

### 1.1 초상·컷인
- 초상 v1 은 "open-faced circlet" 을 무시하고 **면갑 투구**(눈만 보임) + 용 갈기 장식이 꼬리처럼 나옴 → v1 후보 b 를 편집 대상으로 "투구 제거·서클릿·꼬리 없음" 편집(v2) → b 채택.
  교훈은 heroes 노트와 같음: 투구 낱말이 들어가면 얼굴을 가린다. **"silver brow-guard circlet … her whole face fully visible"** 처럼 얼굴을 먼저 쓴다.
- 컷인은 초상 v2b 를 신원 참고로 1장 생성(2후보) → a 채택(b 는 등 뒤 청록 용 정령이 영웅의 날개처럼 읽힘). `tools/kling/cutin_process.py --only isolde` 로
  1600×637 · 띠 색 `#6ad0e0`/`#1a2238`. 얼굴/눈 앵커는 `tools/kling/cutin_anchors.json` (face [0.62,0.4], eye [0.641,0.355]) — H7-PLAY 가 `AWAKEN.isolde` 에 넣었다.
- lo 사본: `tools/assets/make_variants.py` 가 portraits/cg 에 다른 영웅처럼 `assets/lo/` 를 만든다(`assets/lo/index.json` 에 2항목 추가).

### 1.2 측면 원화 — 엄격한 옆모습은 아젤 측면을 image_1 로
- 창기사 측면 v1(초상만 참고)은 a 정면으로 걸어옴, b 는 몸통이 3/4 앞 + **땋은 머리가 가슴 앞**(포니테일 체인은 머리 뒤로만 흐르므로 못 씀).
- v2: **아젤 측면(엄격한 옆모습)을 image_1**, 초상 v2b 를 image_2(신원), v1b 를 갑옷 참고로 → 두 후보 모두 옆모습·땋은 머리 등 뒤. b 채택(a 는 자락 안감이 아젤의 진홍으로 샘).
- 직업 6장 = 창기사 측면 keep-pose 편집, 직업당 2후보. 채택: 용기사 a · 뇌룡기사 b · 흑룡기사 b · 전장의 여신 a · 에인헤랴르 a · 창성 b.
  버린 후보: 형광 하늘색 갑옷, 머리 뒤로 거대하게 펼친 금 용날개 관(날개로 읽힘), 뿔이 작아 용기사와 구분 안 됨, 상아색이라 계보 구분 약함, 흰 깃 견갑이 등 날개처럼 보임, 큰 금관.
- 투구는 7직업 모두 얼굴이 보이는 서클릿/관으로 그렸다(H7-PLAY 의 look.headgear 'winghelm'/'horns' 는 벡터 대체용).

### 1.3 턴어라운드 · 3/4 뷰
- 5뷰(21:9)는 직업 측면 원화 한 장만 image_1 로(레이아웃 참고 없음, heroes1 §1.3) → 옷 섞임 0. 뷰 순서는 직업마다 흔들려 `views5` 로 매핑.
- 3/4 뒤(q3b)·3/4 앞(q3f)은 **한 장짜리**로 직업마다 따로. 실패: 용기사 q3b(좌우 대칭 뒷모습)·q3f(정면) → **창기사 q3b/q3f 를 편집 대상으로 옷만 바꾸는 재시도**가 둘 다 성공(같은 카메라 각).
  뇌룡기사 q3b 는 첫 시도가 3/4 앞으로 나와 y135 로 쓰고, 재시도(창기사 q3b 편집)는 또 대칭 뒷모습 → 한도라 멈추고 5뷰 시트의 5번째(뒤 3/4 에 가까운 그림)를 ym135 로 씀.

| 직업 | views5 | extra |
|---|---|---|
| lancer · dragoon · valkyrie · spearsaint | y90 y180 - ym90 - | q3f→y135 · q3b→ym135(deshadow) |
| stormlord | y90 - ym90 y180 ym135 | q3f(= 첫 q3b 시도)→y135 |
| wyrmknight | y90 y180 ym90 - - | q3f→y135 · q3b→ym135 |
| einherjar | y90 - y180 ym90 - | q3f→y135 · q3b→ym135 |

### 1.4 손 시트 3장
- 은·청강 건틀릿(lancer·dragoon·stormlord 공용), 검은 발톱 건틀릿(wyrmknight), 백은·상아+금 건틀릿(valkyrie·einherjar·spearsaint 공용). 초록 막대를 쥔 주먹 + 편 손.
- 흑룡기사 시트는 막대가 주먹 앞을 **대각선**으로 지나 막대 하이라이트(거의 흰색, 저채도)가 키잉되지 않고 **흰 줄**로 남았다 → `hands.grip.rodClose: 17`(§3).

## 2. 리그 (`tools/puppet/rigs/isolde/`)
- 기본 `isolde_lancer.json`, 직업 6개는 `extends: isolde_lancer` + 원화·손·재질·턴만 덮어씀(관절은 keep-pose 편집이라 공용).
- 관절: pelvis [830,1290] · neck [848,625] · shoulder [695,725] · hand [506,1415] · knee [978,1885] · ankle [1098,2455] · sole 2578 ·
  ponyRoot [665,545] → ponyTip [185,1190] (땋은 머리 체인 6마디, g1300 d0.9) · capeAnchor [655,655]. `bodyTop` 270, `runtime.headK` 1.1.
- 재질 마스크: armor = 무채색 판금(피부가 섞이지 않게 hue [25,345]) + 손 은색(hue 170–270), trim = 직업 색(청록/금/진홍). `runtime.armorBase` 로 장비 재색 기준:
  lancer `#a8b4cc` · dragoon `#9aaccc` · stormlord `#c4d2ec` · wyrmknight `#2a2430` · valkyrie `#e2e8f2` · einherjar `#f2f0ea` · spearsaint `#e8e4dc`.
- 손: lancer 시트 grip center [1040,640] axis [0,1] rodHalf 110 scale 0.28 / open wrist [1975,715]. 흑룡기사 grip axis [−0.584,0.812] rodHalf 44 rodClose 17.
- 에인헤랴르: 큰 금 깃털 견갑 → `regions.pad` 와 `ponyCut` 을 깃털 끝까지 넓혀(깃털 조각이 땋은 머리를 따라 흔들리지 않게), 머리·몸통 영역도 덮어씀.
- 흑룡기사: 가슴 가시 때문에 몸통 앞 경계를 넓히고 `torsoSrcMaxLum 70`(검은 판금이 인페인트 표본으로 잡히게).
- 턴 시트는 `turn.quality 72`(기본 80) — 7장 합계 ≈1.25MB, APK lite 여유 확보용.

## 3. 도구 변경 (전부 opt-in, 키가 없으면 예전과 같음)
- `build_rig.py`
  - `params.torsoCarveBg`: 팔과 등 사이에 갇힌 **배경 구멍**을 몸통에서 뺀다(fill_holes 가 회색 쐐기를 몸통으로 메우던 문제).
  - `params.skirtTorsoCut`: 자락 보이는 영역에서 몸통 영역(허리 갑판)을 뺀다 — 자락이 흔들릴 때 갑판 조각이 따라가지 않게.
  - `hands.grip.rodClose: <px>`: 막대 띠 안에서 초록에 둘러싸인 저채도 하이라이트까지 막대로 보고 인페인트.
- `build_turn.py`: `turn.quality` (턴 시트 webp 품질).
- `tools/puppet/review.html`·`review.mjs`: 창 프리셋(`atk:<cls>:spear` → g0–g3·a0·a1·up·down·crouch·dash·charge), 직업 id 앞부분을 캐릭터로, 셀마다 먼 주먹-자루 거리(`grip2 {perp, along}`) 보고.
- `tools/gallery_turntable.html?heroes=isolde` (기본은 예전처럼 앞 6영웅), `tools/gallery_hero.html` 무기 목록에 spear.
- `tools/kling/cutin_process.py` HEROES/COLORS 에 isolde.

## 4. QA

| 검사 | 결과 |
|---|---|
| 부품 시트 (`/tmp/claude-0/puppet_dbg/sheets/isolde_*.jpg`) | 7직업 재조립·재질 마스크·8방향 턴 확인. 흰 줄(흑룡 주먹)·깃털 조각(에인헤랴르 땋은 머리) 고침 |
| review 관절 | `atk:isolde_lancer:spear` 55셀: 관절 경고 15 = 와인드업의 먼 팔(눈으로 보면 자연스러움). 먼 주먹-자루 perp 0 / along −13 — 예외 g3·charge f≈1.02 perp 5.6(§5). anims 24셀 경고 7(낙하·회전·사망, 정상) |
| 턴테이블 (`?heroes=isolde`) | 오류 0, 8방향 모두 채색. 앞/뒤 차이 0.71/0.68, 정면 대칭 0.80(lancer)/0.72(stormlord) — 창을 세워 들고 땋은 머리가 한쪽이라 계약 0.8 아래 |
| 장비 재색 (`gallery_hero ?sec=pupeq`) | 7직업 armorBase 기준 재색 정상 |
| 게임 | 데스크톱 s01·s13·s10·s04, 모바일 844×390 s05·s11·s13 + 재빌드 후 s10 흑룡기사·s05 에인헤랴르(모바일): 퍼펫 state 1, 페이지 오류 0, 4xx/5xx 0, atlas_ui/turn 요청 0, 왼쪽 보기 정상, 어두운 스테이지에서 읽힘 |
| 대체 경로 | isolde 퍼펫 차단·rig 404 → 벡터(state −1, 오류 0), 4초 지연 → 벡터 후 퍼펫으로 바뀜 |
| `tools/qa/painted_registry.mjs` | 35 pass / 0 fail, cover.heroes = 49직업 |
| 웹 빌드 (`dist/web_h7art`, 확인 후 삭제) | 위 §0 예산 표. 경고 2개는 기존 것(옛 APK, CREDITS.md) |

## 5. 알려진 문제
- 4타(g3)·charge 와인드업 f≈1.02 에서 먼 팔이 닿지 않아 먼 주먹이 자루 옆으로 ≈5–6px 뜸 → H7-PLAY 에 요청(무기 손을 덜 당기거나 그 구간 P.two ↓).
- 뇌룡기사 ym135 는 5뷰 시트의 그림이라 다른 직업보다 덜 돌아 보인다(돌리는 중 한 칸).
- 정면 대칭 지표가 계약 0.8 아래(0.72–0.80) — isolde 는 아직 turntable.mjs 기본 묶음 밖. 넣을 때 허용치 조정 필요.
- 에인헤랴르 견갑(pad) 안에 깃털 사이로 보이는 땋은 머리 몇 가닥이 남음(견갑과 함께 움직임, 게임 배율에서 거의 안 보임).
- 에인헤랴르 원화에 금 깃털 견갑+날개 관이 있는데 look.wings 'angel' 벡터 날개도 그려져 날개가 겹쳐 보임(데이터 선택).
- 갤러리 전 직업 한 페이지(`gallery_hero` 기본)는 텍스처 예산 정리 때문에 일부 직업이 벡터로 보일 수 있음(도구 현상) — 직업별 페이지로 보면 정상.

## 6. 다음 사람에게
- 엄격한 옆모습이 필요하면 **이미 성공한 옆모습 원화를 image_1** 로(heroes3 카밀라·hero7 창기사 모두 성공). 초상만 주면 정면/3/4 로 걸어 나온다.
- 3/4 뒤·앞이 실패하면 새 프롬프트보다 **성공한 다른 직업의 q3b/q3f 를 편집 대상으로 옷만 바꾸기**가 훨씬 잘 된다(용기사 2/2 성공). 단, 참고 이미지(직업 등판)가 정면 대칭이면 그쪽이 이긴다(뇌룡기사).
- 창은 원점 = 가까운 손. 먼 손은 hero.js 가 `h1 − SPEAR_GAP·dir` 에 IK 하므로 review 의 `grip2` 로 셀마다 확인할 것.
