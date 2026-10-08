# 영웅 채색 컷아웃 퍼펫 — 제작 플레이북 (PUPPET_PIPELINE)

영웅(플레이어블 6인 × 직업 7종)을 **클링 채색 원화 1장을 부위별로 잘라 기존 자세·IK 골격에 붙이는 퍼펫**으로 그린다.
벡터 인형(`src/render/hero.js`)은 그대로 남아 **에셋이 없거나 로딩 중인 영웅과 모든 NPC** 를 그린다.
이 문서만 보고 나머지 다섯 영웅(sera, victor, bran, lia, azel)과 NPC 를 같은 품질로 만들 수 있게 쓴다.

- 기준 구현: 카엘 7직업 (`tools/puppet/rigs/kael/*.json`, `assets/puppets/kael/*`)
- 갤러리: `tools/gallery_hero.html` (아래 §9)
- 한 줄 재빌드: `python3 tools/puppet/build_all.py`

---

## 1. 한눈에 보기

```
클링 측면 전신 원화(직업별 1장, 같은 포즈)  ──ingest.py──▶ tools/puppet/src/<char>/<class>_side.webp (+ _alpha.png)
클링 손 시트(쥔 주먹 + 편 손)             ──ingest.py──▶ .../<class>_hands.webp
클링 턴어라운드(5뷰 + 3/4 뒷모습 2뷰)      ──ingest.py──▶ .../<class>_turn5.webp, _qback.webp
            │                                  리그 테이블 rigs/<char>/<class>.json (관절·영역 다각형·재질 규칙·손 좌표)
            ▼                                                   │  grid.py 로 좌표를 읽고 검증
build_rig.py  ── 부품 15개 컷·가림 부분 인페인트·스트립 회전·재질 마스크 → atlas_{lo,hi,ui}.webp, mask_{lo,hi,ui}.webp, rig.json
build_turn.py ── 뷰 분리·정규화·색 보정 → turn.webp (+ rig.json 의 turn)
build_all.py  ── 전부 + 망토 결 텍스처 + src/render/puppet_manifest.js + 검증 시트(sheet.py) + 용량 보고
            ▼
런타임 src/render/hero_puppet.js (hero.js 가 호출): 지연 로딩 → 준비 전엔 벡터 → 골격 치수를 원화에 맞춤 → 레이어 그리기
```

### 1.1 파일

| 경로 | 내용 |
|---|---|
| `tools/puppet/lib/pup.py` | 공용: 경로, 워터마크 제거, rembg 알파, 다각형 마스크, 번짐(bleed) |
| `tools/puppet/ingest.py` | 클링 PNG → 원화 소스(webp q95, 워터마크 제거) + rembg 알파(PNG, 커밋) + 업로드용 JPG |
| `tools/puppet/grid.py` | 좌표 격자 + 리그의 관절/영역 겹쳐 보기 (리그 작성 도구) |
| `tools/puppet/build_rig.py` | 리그 테이블 → 부품 아틀라스 3레벨 + 재질 마스크 + rig.json |
| `tools/puppet/build_turn.py` | 턴어라운드 시트 → 8방향 스프라이트 시트 turn.webp |
| `tools/puppet/build_cape.py` | 망토 벨벳 결 텍스처 `assets/puppets/_shared/cape_tex.webp` (공용 1장) |
| `tools/puppet/sheet.py` | 검증 시트: 부품 · 재질 마스크 · 턴 8방향 (빌드 결과만 읽음) |
| `tools/puppet/build_all.py` | 전체 재빌드 + 매니페스트 + 시트 + 용량 보고 |
| `tools/puppet/shot.mjs` | 페이지 스크린샷(오류 수집) — 갤러리 QA |
| `tools/puppet/ingame.mjs` | 스테이지 열고 조작 → 스크린샷 + 플레이어 그리기 ms (`--vector` 비교, `--mobile`) |
| `tools/puppet/bench.mjs` | 퍼펫 vs 벡터 그리기 시간 벤치마크 |
| `tools/puppet/review.html` + `review.mjs` | **QA 검사대**: 셀(직업·무기·기술·프레임·장비·yaw)을 투명 캔버스에 그려 PNG + 관절 이음매 검사(관절점·뼈 중간점 둘레 최소 알파) + 갇힌 구멍 목록. 프리셋 `atk:<cls>:<wt>`, `anims:<cls>`, `all`(7직업×6무기×모든 기술×5프레임, 관절 검사만) 또는 JSON 계획 파일 |
| `tools/puppet/kling_manifest.json` | 클링 생성 기록 (프롬프트·생성 ID·채택/실패 사유·이미지 수) |
| `tools/puppet/src/<char>/` | 원화 소스 (커밋). `_alpha.png` 는 rembg 결과를 고정해 재현성 확보 |
| `tools/puppet/rigs/<char>/<class>.json` | 리그 테이블 (직업은 `extends` 로 기본 직업 상속) |
| `assets/puppets/<char>/<class>/` | 게임 에셋 (자동 생성, 손으로 고치지 말 것) |
| `src/render/puppet_manifest.js` | 자동 생성: 퍼펫이 있는 캐릭터/직업 + 파일 해시 |
| `src/render/hero_puppet.js` | 런타임 |

### 1.2 예산 (카엘 실측)

| 항목 | 값 |
|---|---|
| 클링 이미지 | 영웅 1명 7직업 **40장** (측면 기본 1 + 직업 6×2후보 + 수정 재생성 6 + 턴5뷰 6 + 3/4뒤 6 + 손 7 + 재시도 3). 권장 상한 50장 |
| 직업 1개 에셋 | atlas lo ≈16KB · hi ≈40KB · ui ≈85KB, mask 3개 ≈33KB, rig.json ≈4KB, turn.webp ≈150–220KB, turn_mask.webp ≈16–28KB → **≈350–460KB** |
| 카엘 7직업 합계 | `build_all.py` 끝의 보고 참조 (리뷰 후 2,838,685 바이트 ≈2.8MB, 대부분 turn.webp 로 인벤토리에서만 받는다) |
| 게임 중 요청 | 직업당 rig.json + atlas_lo/hi + mask_lo/hi (≈75KB). **ui 아틀라스·turn 은 메뉴에서 그 배율이 필요할 때만** (리뷰 전에는 `ready()` 가 모든 레벨을 `assets.get` 해서 게임 중에도 ui 를 받았다 — 확인: 네트워크 로그에 `atlas_ui` 가 없어야 함). 한 직업이 준비되면 같은 영웅의 다른 직업(rig+lo/hi+mask)을 한가할 때 하나씩 받는다(교회·파티 카드가 벡터로 찍혀 남지 않게) |
| 그리기 비용 | 벡터와 같거나 빠름 (`bench.mjs --n 300`, 1920×1080, 배율 2, 역광 포함, 헤드리스 SwiftShader 평균: 헌터 idle 4.49 / run 5.69 / attack 5.99 / jump 5.36 ms vs 벡터 5.90 / 6.00 / 5.73 / 5.64 ms, 템플러 6.71 / 7.58 / 6.61 / 4.99 ms vs 벡터 9.29 / 9.30 / 10.51 / 7.20 ms) |
| 카엘 7직업 전체 | assets/puppets 합계 2,838,685 바이트 (≈2.8MB, 공용 망토 텍스처·턴 재질 마스크 포함) |
| 디코딩 메모리 | 직업당 lo+hi ≈1.1MB(+먼 팔다리 어두운 사본·장비 색 변형 캔버스 각 레벨 1장), 메뉴 ui 2.2MB, turn 3.4MB(변형 시 +1장) |
| 원화 해상도 | 측면 1536×2720 (클링 2k, `aspect_ratio: auto`) — 이보다 작으면 ui 레벨이 흐려진다 |

---

## 2. 원화 만들기 (클링)

공통: 모델 `kling-image-v3_0_omni`, `img_resolution 2k`. MCP 도구는 ToolSearch 로 `kling` 을 찾아 `who_am_i`(tools `["image_to_image","text_to_image"]`) 먼저.
로컬 이미지는 `file_upload` 로 티켓 → `curl -F ticket=… -F file=@x.jpg;type=image/jpeg https://kling.ai/api/mcp/files` → 돌려받은 URL 을 `image_1` 로.
결과 URL 은 24시간 뒤 만료 — 바로 `curl -o` 로 받고 `ingest.py` 로 등록. **모든 생성은 `kling_manifest.json` 에 기록**(프롬프트, generationId, 채택 여부, 실패 사유).

업로드 전에는 반드시 워터마크를 지운 JPG 를 올린다 (`ingest.py … --jpg up.jpg`). 워터마크가 남은 입력은 결과에 워터마크가 복제된다.

### 2.1 기본 측면 원화 (직업 0단계, 영웅당 1장)

초상화(`assets/portraits/<char>.webp`)를 `image_1` 로 img2img. 이 한 장의 **포즈가 7직업 전부의 리그를 결정**하므로 신중히 고른다 (후보 2~4장).
> 2026-10-08 부터 `assets/portraits/<char>.webp` 는 고딕 애니메 **흉상**(768×1024 투명, FANIME — `docs/ARCHITECTURE.md` §12 끝)이라 퍼펫 원화의 화풍·전신 참고로 쓰지 않는다. 기존 퍼펫과 같은 채색 화풍이 필요하면 설치 전의 채색 초상화를 git 기록에서 꺼내 쓴다 (예: `git show 050203d:assets/portraits/kael.webp > /tmp/kael_old.webp` — 애니메 흉상은 그 뒤 자동 저장 커밋들에서 들어왔다), 또는 이미 있는 측면 원화(`tools/puppet/` 의 영웅 폴더)를 `image_1` 로 준다.
카엘 기준 포즈: 오른쪽을 보고 걷는 옆모습, **가까운 팔은 뒤로 내려 손이 엉덩이 옆**, 먼 팔은 몸 앞으로 흔들림(잘라 버림), 다리는 앞뒤로 벌어짐, 무기는 허리에(채찍 똬리).

```
Full-body side view of the character in 图片1 (same face, same hair, same outfit), walking to the RIGHT in strict profile,
the near arm hanging slightly behind the hip with a relaxed half-closed hand, the far arm swinging forward, legs in mid-stride,
<weapon> stowed at the hip, standing on nothing, plain light-grey studio background, realistic painterly dark-fantasy game-art style,
soft even lighting from the upper left, full body visible from the top of the head to the boots with margin, nothing cropped,
no cape, no cloak, nothing held in the hands, no text, no watermark.   (aspect_ratio 9:16, 2k)
```

규칙:
- **망토·날개·긴 스카프 꼬리는 그리지 않는다** — 런타임이 절차적으로 그린다(물리·장비 색). 그려 넣으면 몸 뒤를 가려 자를 수 없다.
- 발끝이 오른쪽 아래 모서리 워터마크 자리(가로 60% 이후·세로 95% 이후)에 닿지 않게 여백.
- 무기는 손에 쥐지 않는다(손은 손 시트에서). 채찍 똬리·칼집처럼 허리에 붙은 것은 원화에 두고 `coil` 영역으로 자른다.

### 2.2 직업 원화 (keep-pose 편집, 직업당 2후보)

`image_1` = 기본 측면 원화(워터마크 제거 JPG). **포즈·얼굴·구도·크기·배경을 고정하고 옷만 바꾸는** 편집. 카엘에서 성공한 템플릿:

```
Edit 图片1. Keep the SAME young man with the exact same face, same <hair> , same body proportions, the exact same walking side pose
facing right, same arm and leg positions, same camera angle, same framing, scale and position on the canvas, same plain light-grey
studio background, same realistic painterly dark-fantasy game-art style and lighting. The <hip item> stays hanging at his hip in
the same place. Change ONLY his outfit into <직업 의상 — classes.js look 의 색·장식을 문장으로, 단계가 오를수록 더 화려하게>.
No cape, no cloak, nothing held in the hands, full body visible from head to boots, nothing cropped, no text, no watermark.
(aspect_ratio auto, imageCount 2)
```

단계별 화려함: 0단계 실용적 → 1단계 금속 장식·문장·색 강조 → 2단계 판금·금세공·발광 문양·위엄 있는 머리 장식.
`classes.js` 의 look(primary/secondary/trim/headgear/aura)을 반드시 반영하되 **얼굴이 보여야 한다**(영웅 식별).

카엘에서 배운 함정과 해법:
| 증상 | 해법 |
|---|---|
| 'helmet' 이라는 단어가 있으면 거의 항상 면갑을 내린 투구 → 얼굴이 사라짐 ("open-faced" 도 무시됨) | 결과 이미지를 `image_1`, 기본 원화를 `image_2` 로: "REMOVE THE HELMET COMPLETELY. He is bare-headed, showing the same face … as 图片2 … wears an ornate gold laurel crown-circlet" |
| 깃털 망토가 등·팔을 덮음 (자르기 불가) | 결과를 다시 편집: "a short, tidy capelet … ends just above the elbow … No feathers hanging down the back or along the arm" |
| 후보가 손에 두 번째 무기/똬리를 듦 | 다른 후보 선택 ("nothing held in the hands" 필수) |
| 모자 대신 두건 요구가 무시됨 | 후보 2장 중 고르기. 필요하면 편집 1회 |

두건을 쓰면 포니테일이 사라진다 → 리그에서 `pony: null`, `runtime.pony: false` (§4.4).

### 2.3 턴어라운드 (인벤토리 8방향)

`image_1` = **그 직업의 측면 원화**(디자인 일치), `image_2` = 기존 영웅의 5뷰 시트(레이아웃만). 5뷰(21:9) + 3/4 뒷모습 2뷰(4:3).

```
Character turnaround sheet of the man in 图片1, wearing exactly the outfit of 图片1: <의상 + "the same <headgear> in every view">.
Copy ONLY the layout of 图片2: five full-body views … from left to right: 1 front view, 2 three-quarter front view, 3 side profile view,
4 back view, 5 three-quarter back view. Do not copy the <clothes/bandana> of 图片2; all clothing, colours and materials come from 图片1. …
```
```
Two full-body three-quarter BACK views of the man in 图片1, wearing exactly the outfit of 图片1: <의상>. Copy ONLY the layout and camera
angles of 图片2: … LEFT figure turned away to the viewer's left, RIGHT figure turned away to the viewer's right (mirror angles) …
```

- 5번째 뷰는 거의 항상 뒷모습 중복이라 버린다(라벨 `-`). 옆모습은 **왼쪽을 본다**(yaw 180).
- 3/4 뒷모습이 앞모습으로 나오는 일이 잦다(카엘 7장 중 3장). 한 장만 쓸 만하면 나머지는 좌우 반전으로 채운다.
- `image_2` 의 머리띠 같은 특징이 새어 들어오면 `turn.fixups`(색 보정, §4.6)로 고친다.
- 뒷모습이 두건 없이 나오면: **한 장에 한 방향만** 요구한다 — "One single full-body view … seen exactly from behind (straight back view, perfectly symmetric …) … the hood pulled up" (3:4). 성공률이 가장 높다.

### 2.4 손 시트 (직업당 1장)

`image_1` = 그 직업의 측면 원화. 쥔 주먹(무기 손잡이)과 편 손(시전·투척).

```
Hand reference sheet for the man in 图片1. Paint ONLY his gloved hands with exactly the same <장갑/건틀릿 묘사> as in 图片1, in the same
painterly game-art style and lighting (not a 3D render), large and sharp, on a plain light-grey background. Two hands side by side, well
separated, each cut off just after the cuff, no arms, no body, no text. LEFT: his hand clenched into a tight fist seen from the outside,
back of the hand and knuckles facing the viewer, thumb wrapped over the fingers, the wrist and cuff entering from the lower right,
gripping a straight thin cylindrical rod painted flat pure bright green that passes vertically BEHIND the curled fingers (the fingers wrap
around it and hide it) and sticks out above and below the fist. RIGHT: the same hand open with the palm facing the viewer, fingers together
and slightly curved as if casting a spell, the wrist and cuff at the bottom. No watermark.   (16:9, 2k)
```

초록 막대는 `build_rig.py` 가 키잉해서 지우고, 주먹 윤곽 안에서 보이던 막대는 장갑색으로 메운다(손가락은 유지). 막대 축·중심·반폭을 리그에 적는다(§4.5).
막대가 손가락 앞을 지나거나 비스듬해도 쓸 수 있다(카엘 헌터·대심문관).

### 2.5 망토 결 (공용, 1회)

`tools/puppet/src/_shared/cape_velvet.webp` (벨벳 망토를 두른 원화) → `build_cape.py --box x0,y0,x1,y1` (천만 있는 사각형). 새로 만들 필요 없음.

---

## 3. 등록 (ingest)

```
python3 tools/puppet/ingest.py /tmp/dl/side_a.png sera sera_exorcist_side --jpg /tmp/up/sera_exorcist_side.jpg
python3 tools/puppet/ingest.py /tmp/dl/turn5.png sera sera_exorcist_turn5
python3 tools/puppet/ingest.py /tmp/dl/hands.png sera sera_exorcist_hands
```
- 워터마크: 우하단(가로 60%~, 세로 95.2%~)의 밝은 무채색 글자만 인페인트. 인물이 그 영역에 닿으면 `--no-wm` 후 수동 확인.
- rembg(isnet-general-use) 알파는 `_alpha.png` 로 저장·커밋 → 빌드는 다시 rembg 를 돌리지 않는다. 알파를 고치고 싶으면 이 PNG 를 편집.
- 소스 이름 규칙: `<classId>_side`, `_hands`, `_turn5`, `_qback`, 추가 뒷모습 `_back`.

---

## 4. 리그 테이블 작성 (grid.py)

### 4.1 작업 순서 (새 영웅 기본 직업, 2~3시간)

1. `python3 tools/puppet/grid.py tools/puppet/src/<char>/<cls>_side.webp --scale 0.3 --step 100 -o /tmp/g.jpg` 로 전체 좌표를 본다.
2. 카엘 헌터 리그를 복사해 `rigs/<char>/<cls>.json` 을 만들고 `charId/classId/src/hands/turn` 을 바꾼다.
3. **관절**부터(§4.2): 부분 확대 `--crop x0,y0,x1,y1 --scale 1 --step 25` 로 한 점씩 읽는다. 저장 → `grid.py rigs/…json --crop …` 로 겹쳐 확인.
4. **영역**(§4.3): 머리 → 포니테일 → 몸통 → 위팔/아래팔 → 먼 팔 → 다리 → 자락 순. `--only head,pony` 로 한 두 개씩 겹쳐 본다.
5. `python3 tools/puppet/build_rig.py rigs/<char>/<cls>.json --dbg` → `/tmp/claude-0/puppet_dbg/<cls>/reassembled.jpg`(부품을 원래 자리에 다시 붙인 그림, 원화와 같아야 함)와 `part_*.jpg` 확인.
6. 갤러리 `tools/gallery_hero.html?sec=pup&cls=<cls>&psc=4` 로 모든 동작 확인 → 영역 수정 반복.
7. 손(§4.5), 재질(§4.6), 턴(§4.7) 을 채우고 `build_all.py <char>`.
8. 나머지 직업: `{"extends": "<기본 직업>", "classId": …, "src": …, "hands": …, "turn": …, "materials": …}` 만 쓰고
   `grid.py rigs/<char>/<기본>.json --src <char>/<직업>_side` 로 기본 리그를 새 원화에 대 보고 **어긋난 영역만** 덮어쓴다(대개 머리·어깨 덮개).

### 4.2 관절 (`joints`, 원화 px)

| 이름 | 위치 | 용도 |
|---|---|---|
| `pelvis` | 허리 중앙(엉덩이 관절 높이, 몸통 폭 가운데) | 몸통 뼈 시작 |
| `neck` | 목 아래(쇄골 사이) | 몸통 뼈 끝, 머리 회전 기준 |
| `headPivot` | 목 위 | 머리 부품 피벗(기록용) |
| `shoulder` | 가까운 어깨 관절 중심 | 위팔 뼈 시작 |
| `elbow` | 가까운 팔꿈치 | 위팔 끝 / 아래팔 시작 |
| `wrist` | 손목(소매·장갑 경계) | 아래팔/손 분리선, 편 손 붙는 곳 |
| `hand` | 손 중심(쥔 주먹이면 손잡이가 지날 자리) | 아래팔 뼈 끝 = 골격의 손 점 |
| `hip` | 가까운 엉덩이 관절 | 넓적다리 시작 |
| `knee`, `ankle` | 가까운 무릎, 발목 | 정강이 뼈 |
| `toe` | 발끝 | 발 방향 |
| `sole` (숫자) | 발바닥 y | 키 기준: 런타임 PS = 90 / (sole − 정수리 y) |
| `ponyRoot`, `ponyTip` | 포니테일 뿌리·끝 | 머리카락 체인 |
| `skirtPivot`, `skirtHem` | 코트 앞자락 허리 피벗 · 밑단 | 자락 스트립 축 |
| `skirtFarPivot`, `skirtFarHem` | 안쪽 자락 | 기록용 |
| `skirtBot` (숫자) | 자락 밑단 y | 기록용 |
| `coilPivot` | 허리 장비(채찍 똬리) 중심 | |
| `capeAnchor` | 등 쪽 어깨(망토 고정점) | 절차적 망토 |
| `bandAnchor` | 머리띠 매듭 | 절차적 머리띠 꼬리 |

뼈 부품은 "원화의 관절 두 점 → 골격의 두 점"으로 옮겨진다(회전 + 뼈 방향 늘임 0.82~1.22배). 관절이 몇 px 틀리면 팔꿈치·무릎에서 부품이 어긋나 보이므로 **관절을 먼저 정확히**.

### 4.3 영역 (`regions`)

값: 점 배열 `[[x,y],…]`(직선 다각형) 또는 `{"pts": […], "smooth": n}`(Catmull-Rom, n=3~4 권장) 또는 `{"rect":[x0,y0,x1,y1]}`. `null` = 상속 영역 삭제.

| 영역 | 뜻 | 요령 |
|---|---|---|
| `head` | 머리(+모자·두건·머리 장식) | 옷깃 선 위. 모자 챙·두건 뒤까지 넉넉히. 위쪽은 인물 밖까지 크게 잡아도 됨(알파가 자름) |
| `neckCap` | 목 아래로 늘일 덮개 | 머리를 숙였다 들 때 목 틈 방지 (피부를 아래로 밀어 채움) |
| `pony` | 포니테일/뒤로 흐르는 머리카락 | 머리 영역과 경계 공유. 어두운 머리카락만(`params.hairLum`) + `ponyTopY` 위는 전부 |
| `torso` | 몸통 **목표 외곽**(가려진 곳 포함) | 팔·똬리·먼 팔 밑은 인페인트로 메워진다. smooth 4 |
| `pad` | 어깨 덮개(위팔 위에 덧그림) | 견갑·깃털 견갑. 몸통 이미지에서 잘라 위팔을 덮는다 |
| `uarm` | 가까운 위팔(보이는 부분) | 어깨~팔꿈치 |
| `uarmCapTop/Bot` | 위팔 위·아래 덮개 | 팔을 들었을 때 어깨 틈·팔꿈치 틈 방지 |
| `farm` | 가까운 아래팔+손 | `wrist` 선에서 `farm`(아래팔)과 `hand`(원화 손)로 나뉜다 |
| `farArm` | 몸 밖으로 보이는 먼 팔 | **버림**(먼 팔은 가까운 팔 사본을 어둡게) |
| `farArmHole` | 몸통 안쪽에 겹친 먼 팔 | 몸통에서 빼고 인페인트 |
| `coil` | 허리 장비 | 무기를 안 들었을 때만 그림(`ST.coil`) |
| `leg` | 가까운 다리 전체(허리~발끝) | 다리는 축 기준으로 넓적다리/정강이/발로 자동 분할 |
| `legTop`, `thighExclude`, `thighCap` | 넓적다리 윗부분 보정 | 코트 앞단과 겹치는 곳 |
| `skirt` | 코트 앞(바깥) 자락 목표 외곽 | 가린 다리·손 밑을 메움. 스트립(축=skirtPivot→skirtHem)으로 회전됨 |
| `skirtLegCut` | 자락 계산에서 다리로 볼 부분 | |
| `skirtFar` | 안쪽 자락(안감·뒷자락) | 다리 뒤, 몸통 좌표계로 그림 |

`clean`: `keepHoles`(머리카락 사이 배경 구멍을 남길 상자), `hairZone`+`hairBgDist`(머리카락 사이 배경색 제거), `cutBoxes`(잡동사니 제거), `minHole`.
`params`: `hairLum`, `ponyTopY`, `torsoTone`/`skirtTone`(인페인트를 주변 중간 톤으로 끌어올림 0~1), `torsoSrcMaxLum`/`skirtSrcMaxLum`(인페인트 색 표본을 어두운 픽셀로 제한 — **밝은 옷(상아·흰 옷)에서는 null**), `wristOverlap`, `handBack`.
`legs`: `pantsWarmMax`(바지(무채)와 코트(갈색)를 색으로 가르는 기준, 판금·흰 옷이면 null), `coatEdge`(코트 앞단 선), `thighWidth`, `footLine`[y0,x0,기울기], `footMinX`, `shinBootY`.

### 4.4 런타임 옵션 (`runtime` → rig.json `opts`)

| 키 | 뜻 |
|---|---|
| `band: {color, anchor}` | 절차적 머리띠 꼬리 (헌터만). 없으면 `null` |
| `pony: false` | 포니테일 없음(두건) — 벡터 머리카락 체인도 끔 |
| `ponyN`, `ponyCfg` | 긴 머리 마디 수(기본 5) · 물리 `{g, d, push, rest, curl, flut}` |
| `headK` | 머리 확대 배율(기본 1.1 — 게임 배율에서 얼굴 가독성) |
| `armorBase` | 이 원화의 갑옷 색. look.armorColor 가 이와 다르면 재질 마스크로 다시 칠함 |
| `skirtRest` | 자락 기본 각 보정(rad, +면 앞으로) |

### 4.5 손 (`hands`)

```json
"hands": {"sheet": "kael/kael_templar_hands",
  "grip": {"box": [500,320,1210,930], "center": [815,620], "axis": [0.047,0.999], "rodHalf": 40, "wrist": [850,900], "scale": 0.21},
  "open": {"box": [1420,60,2160,950], "wrist": [1880,950], "tip": [1830,120], "scale": 0.23}}
```
- `box`: 손만 포함(**소매·팔찌는 wrist 선에서 자른다** — 아래팔 부품에 이미 있음).
- `center`: 막대가 주먹을 지나는 중심 = 골격 손 점에 놓임. `axis`: 막대 방향(단위 벡터). `rodHalf`: 막대 반폭(px, 조금 넉넉히).
- `wrist`: 주먹에서 팔이 들어오는 곳 — 런타임은 손목→주먹 방향을 아래팔 방향에 맞춘 뒤 막대를 무기 방향으로 ±0.6rad 까지 돌린다.
- `scale`: 시트 px → 원화 px. 주먹 너비(엄지 제외)가 원화 손 너비의 1.0~1.1배가 되게(카엘 0.18~0.24).
- `open`: `tip` = 가운데 손가락 끝. 손목이 원화 `wrist` 관절에 붙는다.
확인: `sheet.py` 의 grip/open 칸에 초록이 남지 않았는지, 갤러리 `?sec=pupw` 에서 무기 손잡이가 주먹 속으로 들어가는지.
판금·건틀릿 직업(성전 기사·성광의 사냥꾼)은 재질 규칙 `armor.parts` 에 **`hand`, `grip`, `open` 도 넣는다** — 빠지면 장비 색을 바꿨을 때 팔은 검은데 주먹만 은색으로 남는다(리뷰에서 발견). 가죽 장갑 직업은 넣지 않는다(장갑은 코트와 다른 재질).

### 4.6 재질 마스크 (`materials`, 장비 색)

R 채널 `armor` = 장비 갑옷 색으로 다시 칠할 곳, G 채널 `trim` = 장식색. 규칙은 부품별 HSV 범위:
```json
"materials": {"_replace": true,
  "armor": {"parts": ["torso","skirt","skirtFar","uarm","farm","pad"], "hue": [6,48], "sat": [0.1,1.01], "val": [0,0.85], "softTop": 0.1},
  "trim":  {"parts": ["torso","uarm","farm","pad","skirt"], "sat": [0,0.14], "val": [0.55,1.01]}}
```
- 가죽 코트(갈색) `hue 6~48`, 검은 가죽 `sat<0.45 & val<0.34`, 상아/흰 옷 `hue 18~70, sat 0.03~0.45, val>0.5`, 강철 `sat<0.13, val>0.2`, 금 `hue 30~62, sat>0.4, val>0.45`.
- 머리·손·머리카락은 목록에 넣지 않는다(피부·머리카락에 번지면 안 됨). 깃털처럼 재질이 다른 장식 부품(`pad`)은 빼도 된다.
- `sheet.py` 두 번째 줄(빨강=armor, 초록=trim)로 새는 곳이 없는지 확인.
- 런타임: `look.armorColor ≠ runtime.armorBase`(또는 직업 look.armorColor) 이면 변형 아틀라스를 1회 굽는다 (`recolorPx`).
  밝기 사상: 마스크 영역 평균 밝기 → 목표 밝기. 어두운 쪽은 비율(곱), 밝은 쪽은 원화의 절대 밝기 차를 유지하되 244 를 넘지 않게 압축, 채도는 밝은 곳에서 줄인다.
  재질 종류(`look.armor`)별 [대비, 금속 반사]: leather [1,0], chain [1.12,0.1], plate [1.25,0.25], holy [1.2,0.3], dark [1.3,0.12].
  마스크 값은 0.12~0.7 구간을 smoothstep 으로 올려 쓴다(그늘진 상아색처럼 규칙 경계의 어중간한 값이 반만 칠해져 원래 색이 비치지 않게).
  - 리뷰에서 고친 것: 예전 식(k = 원화밝기/평균 × 목표색)은 **검은 가죽을 밝은 판금색(#a8b0bc, #8a8e9a)으로 칠하면 반사광 비율이 4~6배라 하얗게 타고**, 어두운 청강(#2a5a7a)은 형광 하늘색이 됐다. 새 직업을 만들면 검은 원화 → 밝은 목표, 밝은 원화 → 어두운 목표 두 방향을 반드시 본다(`review.mjs` 장비 계획, 아래 §7).
- 마스크 로드 대기: 변형이 있는 인스턴스는 **그 레벨의 마스크까지 로드된 레벨만** 쓴다(없으면 가까운 레벨). lo/hi 마스크는 rig 과 함께 미리 받는다 → 장비를 바꾼 첫 프레임에 원래 색이 비치지 않는다.
- 턴테이블 8방향도 같은 색으로 칠한다: `build_turn.py` 가 `turn_mask.webp` 를 만든다(§4.7).

### 4.7 턴테이블 (`turn`)

```json
"turn": {"sheet5": "kael/kael_crusader_turn5", "views5": ["y90","y135","y180","ym90","-"],
         "qback": "kael/kael_crusader_qback", "viewsQ": ["ym135","ym45"],
         "extra": [{"sheet": "kael/kael_bloodhunter_back", "views": ["ym90"]}],
         "fixups": [{"view": "y180", "box": [0,0,1,0.16], "hue": [330,18], "sat": [0.3,1.01], "to": "#c89a3a"}]}
```
- `fixups` 항목: `{view, box(0~1 비율), hue, sat, val?, to, gain?}` — 결과 밝기 = 원래 밝기 × gain (to 의 색조). 예: 대심문관 5뷰 시트의 **정면(y90)만 코트·장화가 갈색 가죽**으로 나와 돌리면 색이 바뀌었다 → `{"view":"y90","box":[0,0.24,1,1],"hue":[5,36],"sat":[0.18,1.01],"val":[0,0.62],"to":"#2a2628","gain":0.8}`. 뷰마다 옷 색이 같은지 `sheet.py` 셋째 줄을 마젠타 배경에서 비교해 볼 것(리뷰에서 원화 7장 중 1장).
- **재질 마스크 `turn_mask.webp`**(R=갑옷, G=장식, 절반 해상도, 손실 압축 ≈20KB): 측면 ui 아틀라스의 재질 마스크를 정답으로 HSV 히스토그램 색 모델(갑옷 vs 그 밖)을 배워 각 뷰를 분류하고, 자리로 거른다 — 목 아래~옷자락 밑단(다리 부품이 갑옷이면 발까지), 앞모습은 벌어진 코트 사이 가운데 바지 띠 제외, 뒷모습은 포니테일 띠 제외. 검은 가죽 코트·짙은 바지·갈색 머리카락은 색만으로는 갈리지 않는다(사후확률 0.4~0.6). 모자·두건(무채색)은 음성 표본에서 뺀다.
라벨 = 그 그림이 보여 주는 yaw: `y0` 오른쪽 옆, `y45` 3/4 앞(오른쪽을 봄), `y90` 정면, `y135` 3/4 앞(왼쪽을 봄), `y180` 왼쪽 옆, `ym45` 3/4 뒤(오른쪽으로 돌아섬), `ym90` 뒤, `ym135` 3/4 뒤(왼쪽으로 돌아섬), `-` 버림.
시트의 인물은 왼쪽→오른쪽 순서로 라벨과 짝지어진다. 없는 방향은 거울상(yaw θ ↔ 180−θ)으로 채운다. 확인: `sheet.py` 셋째 줄.
얼굴이 보이면 앞(yaw>0), 등이 보이면 뒤(yaw<0). 얼굴이 화면 왼쪽을 보면 y135/y180.

---

## 5. 빌드

```
python3 tools/puppet/build_rig.py tools/puppet/rigs/kael/kael_hunter.json --dbg   # 한 직업 (≈25초)
python3 tools/puppet/build_turn.py tools/puppet/rigs/kael/kael_hunter.json         # 턴만
python3 tools/puppet/build_all.py kael -j 4                                        # 한 캐릭터 전부 + 매니페스트 + 시트
python3 tools/puppet/build_all.py                                                   # 전부
```
`build_all.py` 는 반드시 마지막에 돌린다 — `src/render/puppet_manifest.js` 의 해시가 바뀌어야 브라우저 캐시가 새 아틀라스를 받는다(rig.json 과 아틀라스가 어긋나면 부품이 엉뚱한 곳에서 잘린다).

아틀라스 레벨: `lo` 0.1(게임 1280×720 @DPR1~1.5), `hi` 0.2(FHD·4K·확대), `ui` 0.36(메뉴·턴테이블 옆모습). 런타임은 "장치 px / 원화 px" 로 가장 작은 충분한 레벨을 고른다.

---

## 6. 런타임 계약 (`src/render/hero.js`, `hero_puppet.js`)

- 퍼펫 선택: `look.puppet === false` 면 끔 / NPC(`p.npc`) 는 항상 벡터. 직업은 `look.classId` → look 색 지문(primary·secondary·trim·hairStyle 가 직업 계보 look 과 같은가) → `p.hero.classId` 순. 매니페스트에 없는 조합은 요청하지 않는다(404 없음).
- 로딩: `assets.json('puppets/<c>/<cls>/rig', hash)` + `assets.get('puppets/…/atlas_lo'|'atlas_hi', hash)`. 준비 전에는 **벡터로 그린다**. `preloadPuppet(charId, classId)` 로 미리 받을 수 있다.
- `HERO_DRAW_SCALE = 1.14`: 게임 속(world 가 있을 때) 플레이어 영웅만 크게 그린다. 판정 상자는 그대로. `opts.scale` 이 주어지면(메뉴) 적용 안 함.
  1.00/1.12/1.14/1.15 를 모바일 844×390 에서 비교했다. 1.12–1.15 사이 차이는 작다. 1.14 는 얼굴과 무기 방향이 읽히면서 머리가 판정 상자 위로 크게 넘치지 않아서 골랐다 (`setHeroDrawScale(v)` 로 조정).
- 잔상(`opts.tint`)은 퍼펫 실루엣 전체를 단색으로(source-in). 역광 테두리는 퍼펫에서 가늘고 옅게(`PUP_RIM`).
- 턴테이블(docs/specs/platform.md §7.3):
  - `drawHero(ctx, p, world, { yaw })` — yaw 정의 시 facing 무시. `HERO_VIEW = { continuous:false, steps:8, painted:true }`.
  - 채색 퍼펫: 0°/180° 는 게임과 같은 옆모습 퍼펫(움직임·무기), 나머지 6방향은 turn.webp. 스텝 사이는 가로 압축(최소 0.76)+가운데 16% 교차 — 교차는 앞 스텝을 먼저, 뒤 스텝을 위에, 불투명도 `min(1, 2·가중치)` (둘 다 반투명이면 몸 사이로 배경이 비쳐 유령처럼 보였다).
  - 장비: 갑옷 색은 `turn_mask` 로 채색 뷰에도 칠함(변형별 캔버스 1장). **무기는 채색 뷰에 절차적으로** — 검·단검·총·지팡이는 늘어뜨린 손(어깨 반폭, 엉덩이 높이, 오른손 x = −sin(yaw)·반폭, 몸에 가려지는 쪽 손은 몸 뒤 패스), 대검은 등에 멤(앞모습은 몸 뒤, 뒷모습은 등을 덮음), 채찍은 원화의 허리 똬리 그대로.
  - 망토는 앞모습에선 몸 뒤, 뒷모습에선 몸을 덮는다(화면 폭 ∝ |sin yaw| — 옆모습 가까이 −160°/−20° 에서 몸 전체를 덮지 않게). 날개는 앞/뒤 대칭 한 쌍. 턴테이블용 망토·날개·무기는 **채색 뷰의 비중만큼만** 그린다(옆모습 퍼펫이 제 망토를 이미 그리므로 겹치지 않게). 후광·오라 포함.
  - 벡터 영웅(에셋 없음)·동작 시연 중에는 옆모습 카드 뒤집기(facing = sign(cos), 가로 |cos|).
  - `heroViewInfo(p) → {painted, steps, continuous}`, `drawHeroTurntable(ctx, look, yaw, x, y, height, t, {charId|ch, classId, anim, rig})`.
- **걸음(feel.md WP1 3.3.3) — hero.js 가 `./hero_gait.js` 를 직접 부른다** (리뷰 전에는 등록형 훅만 있어서, WP1 이 계약대로 `gaitPose/applyFeelOverlay/GAIT_ANIMS` 만 export 하면 hero.js 가 아무것도 부르지 않았다):
  - anim 이 `GAIT_ANIMS` 에 있으면 `gaitPose(P, K, anim, p, at)` 후 `holdFor(P, K, GAIT_ANIMS[anim])` (값이 문자열이면 그대로, 객체면 `.hold`). `'run'` 은 `p.gaitPh` 가 숫자면 그 위상.
  - 블렌드: skid·pivot·land_heavy 0.06초, walk↔run↔sprint 0.12초.
  - 블렌드 뒤·풀이 전 `applyFeelOverlay(P, p)` (탈것 중에는 부르지 않음). 반환값이 `{tint, a}` 면 색 섬광.
  - **hero_gait.js 는 hero.js 를 import 하면 안 된다** (순환 → `heroHooks` TDZ 오류). hero.js 는 `import * as GAIT` 로 늦게 읽는다.
- **탈것 기수(companions.md §11.4, C6) — 기본 구현이 hero.js 에 있다** (`riderPose`, `rideAnim`): `p.ride` 가 있으면 자세 강제(px 0, py −41, rot 0, sx 1, lean = clamp(lean,−0.35,0.6)+ride.lean+0.6·duck), 발 = 등자 깊이 `footY`(월드 px → 자세 단위 ÷ (다리 배율 × hs)), 무릎 앞(t 0.6, kneel 0.9), 원점 = (sx, sy + 41·다리배율·hs) → 골반이 안장점에 정확히, 먼 다리 생략, 빈손은 고삐(공격·시전·투척·양손/쌍수 무기 중이 아닐 때). 기수 anim: `ride`(앉은 대기) · `ride_duck` · `ride_charge`(몸 +0.45, 무기 팔을 창처럼 앞으로) · `ride_rear`(몸 −0.3, 무기 팔을 들어 올림) · `ride_hurt`. 망토·머리카락 체인은 기수 원점에서 돈다.
- 확장 훅(등록하면 위 기본 동작을 덮어씀) — `import { registerHeroHooks } from '../render/hero.js'`: `gait(P,K,anim,p,at)` + `gaitAnims`, `blend(anim, prevKey)`, `feel(P,p,K) → {tint,a}|void`, `rider(P,K,p,ride,hs) → {cx,bottom,skipFarLeg}`. 견본: `tools/gallery_hero.html?sec=hooks` (게임 코드가 아님).
- 메뉴·UI 가 영웅 그림을 캐시(스냅샷)하면 키에 **`puppetRev()`**(hero_puppet.js, 새 퍼펫이 준비될 때마다 +1)를 넣을 것 — 넣지 않으면 로드 전에 찍힌 벡터 그림이 남는다(`town/church.js`·`town/party.js` 의 `Snap` 키가 현재 그렇다. 같은 영웅의 다른 직업을 미리 받아 대부분 피하지만 완전하지 않다). 장면 진입 전에 `preloadPuppet(charId, classId)` 를 부르면 스테이지 첫 프레임의 벡터→퍼펫 교체가 보이지 않는다.
- 레벨(lo/hi/ui) 선택에는 인스턴스별 이력이 있다: 이전 레벨이 `0.78 × 필요 배율` 이상이고 `2.6 ×` 이하이면 유지 → 카메라 확대가 경계 근처에서 흔들려도 선명도가 깜빡이지 않는다.
- 절차적 무기는 퍼펫 옆에서 윤곽선 0.8배 + 0.35 불투명 그림자 한 겹(`weaponPup`).
- 지팡이 대기·웅크림: 퍼펫은 어깨가 원화 위치(몸 뒤쪽)라 곧게 세운 지팡이 머리가 얼굴을 가렸다 → `holdFor` 에서 퍼펫일 때 손을 앞으로(a1 −0.28), 지팡이를 앞으로 0.42(웅크림 0.62) 기울인다.
- 망토: 절차적 띠 + 벨벳 결 + **주름 3줄**(띠 중심선을 따라 폭 방향으로 비킨 그늘·반사광, 결 텍스처 로드 전에도). 흰 망토(성전 기사)가 평평한 판처럼 보이던 문제.
- 무기별 주먹 위치(무기 좌표계): sword −2.4, greatsword −3.2(먼 손 −6.5 는 hero.js 가 IK), dagger −1.4, gun (−2.0, +3.2), staff 0, whip −2.2 (`GRIP_OFF`).

---

## 7. QA 체크리스트 (직업마다)

1. `sheet.py`: 부품 가장자리에 회색/배경 테두리 없음, 구멍 없음, grip 에 초록 없음, 마스크가 피부·머리카락·장식에 새지 않음, 턴 8방향 라벨이 맞음(얼굴 방향).
2. `reassembled.jpg` 가 원화와 같다(먼 팔·먼 다리만 빠짐).
3. 갤러리 `?sec=pup&cls=<cls>&psc=4` — 모든 동작: 팔꿈치·무릎·어깨·목 이음매 틈 없음, 코트 자락 띠 경계(가로줄) 안 보임, 머리가 옷깃 뒤로 들어가 있음, 발이 바닥에 닿음(idle/land/crouch), 공중제비·사망에서 부품이 흩어지지 않음, 왼쪽 달리기(거울) 정상.
4. `?sec=pupatk` 모든 기술 · `?sec=pupw&cls=<cls>` 6무기(주먹이 손잡이를 쥠, 대검 양손, 총 조준, 지팡이 시전, 단검 쌍수, 투척 편 손).
5. `?sec=pupeq` 장비 색(가죽/사슬/판금/성갑/암흑), 망토 4종, 오라.
6. `?sec=turn` 8방향 + 사이각, 망토가 뒷모습을 덮음, 앞/뒤 대칭.
7. 게임: `node tools/puppet/ingame.mjs --stage s01 --cls <cls> --steps "wait:1,down=right,wait:0.9,shot,up=right,press=attack@0.08,wait:0.12,shot"` — 어두운 스테이지(s04·s10·s13)에서 역광 테두리로 윤곽이 읽히는지, 모바일 `--mobile` 에서도.
8. `node tools/integration.mjs` 페이지 오류 0, `bench.mjs` 가 벡터 이하.
9. **검사대** `node tools/puppet/review.mjs all /tmp/r` — 관절 이음매(`jointGaps`)가 회전 베기(spin, 몸이 가로로 접혀 검사점이 빗나감)와 극단적 뒤로 젖힘의 목 외에 없어야 한다. 의심 셀은 `atk:<cls>:<wt>` 로 PNG 를 뽑아 **마젠타 배경**(`bg:'#ff00ff'`)에서 본다 — 어두운 배경에서는 반투명 틈이 안 보인다.
10. 장비 색: `review.mjs <계획.json>` 에 `{"cls":…, "equip":{"armor":"plate","armorColor":"#a8b0bc"}}` 처럼 밝은 목표·어두운 목표·채도 높은 목표를 넣어 본다(`equip` 이 있으면 마스크 로드를 기다림). 피부·머리카락·장갑·바지에 번지지 않는지, 판금 직업은 주먹까지 칠해지는지.
11. 턴테이블 + 장비: `{"yaw":…, "equip":…, "wt":"greatsword"}` 로 8방향 + 사이각(20°, −20°, −160°) — 채색 뷰와 옆모습의 옷 색이 같은지, 무기가 보이는지, 망토가 옆모습 근처에서 몸을 통째로 덮지 않는지.
12. 네트워크: 스테이지에서 `atlas_ui`·`turn` 요청이 없어야 한다(메뉴 전용).

## 8. 자주 나는 문제

| 증상 | 원인 → 해결 |
|---|---|
| 부품 둘레 회색 테두리 | 알파 가장자리 배경색 → `figE`(1px 침식) 사용 중. 여전하면 rembg 알파(`_alpha.png`)를 손으로 1px 줄임 |
| 머리카락 사이 배경색 덩어리 | `clean.hairZone` 상자·`hairBgDist` 조정, 필요하면 `keepHoles` 로 구멍 유지 |
| 팔을 들면 어깨에 틈 | `uarmCapTop` 을 키우고 `pad` 로 덮음 |
| 앉거나 공중제비 때 목 틈 | `neckCap` 을 아래로 더 |
| 팔 밑 몸통이 거뭇하게 번짐 | `torsoTone` ↑(0.5~0.6), 밝은 옷이면 `torsoSrcMaxLum: null` |
| 넓적다리에 코트 조각 | `coatEdge` 선·`thighExclude` 조정, 색 분리가 안 되는 옷이면 `pantsWarmMax: null` |
| 자락 띠 경계 줄 | 자락 부품 알파에 구멍 → `skirt` 영역을 원화 밖까지 넉넉히(알파가 자름) |
| 재질 마스크가 피부로 샘 | `parts` 에서 head/hand 빼기, hue 범위 좁히기, `val` 상한 |
| 무기가 주먹 밖에서 떠 보임 | `hands.grip.center`·`axis` 재측정, `GRIP_OFF` 확인 |
| 새 아틀라스인데 부품이 이상하게 잘림 | `build_all.py` 를 안 돌려 매니페스트 해시가 옛것 → 브라우저가 옛 아틀라스 사용 |
| 턴테이블 한 방향이 앞모습 | 3/4 뒷모습 시트 실패 → 라벨 `-` 로 버리고 거울상 사용, 또는 한 장짜리 뒷모습 재생성 |
| 옷깃·어깨 테두리에 투명한 줄무늬(머리가 흔들리면 배경이 비침) | `clean.hairZone` 의 배경색 제거가 은색 테두리까지 지움 → build_rig 가 몸통·어깨 덮개에는 머리카락 정리 전 실루엣(안쪽 구멍 메움)을 쓴다. 새 규칙을 추가할 때도 hairZone 은 머리·포니테일에만 |
| 장비 색을 바꾸면 하얗게 타거나 형광색 | 예전 곱셈 식. `recolorPx` 의 밝기 사상 사용(§4.6) |
| 장비를 바꾼 첫 순간 원래 색이 비침 / 메뉴 스냅샷에 원래 색 | 마스크가 아직 없음 → lo/hi 마스크 선로딩 + 마스크 없는 레벨은 쓰지 않음(§4.6) |
| 판금 직업: 팔은 새 색인데 주먹만 은색 | `armor.parts` 에 hand/grip/open (§4.5) |
| 턴테이블에서 한 방향만 옷 색이 다름 | 클링 시트의 뷰별 색 드리프트 → `turn.fixups` (val·gain) |
| 턴테이블 뒷모습 근처에서 망토가 몸 전체를 덮음 | drawTurnCape 폭 ∝ |sin| + 채색 뷰 비중만큼만 그림 (§6) |
| 지팡이 머리가 얼굴을 가림 | holdFor 의 퍼펫 보정 (§6) |
| 게임 중에 ui 아틀라스(≈90KB)까지 받음 | 준비 확인·대체 레벨 탐색은 `assets.has` 로 엿보기만 (`levelPeek`), 요청은 필요한 레벨만 |
| 어두운 스테이지에서 안 보임 | 원화 자체가 어두운 옷(검은 가죽) → 역광 테두리(`PUP_RIM`)로 윤곽. 더 필요하면 `ui`/`hi` 이미지를 빌드에서 밝게(향후 `grade` 옵션) |

## 9. 영웅별 특이 사항 (남은 다섯 명)

`classes.js` 의 look 과 `characters.js` 를 먼저 읽는다. 모두 오른쪽을 보고 걷는 측면, 망토·날개·긴 스카프 꼬리는 그리지 않는다.

- **세라(sera, 수녀·지팡이)**: 로브/드레스 → **두 조각 자락**: `skirt` = 앞(가까운 다리 쪽) 절반, `skirtFar` = 뒤 절반(안감). 다리는 밑단 아래 정강이·발만 보이므로 `leg` 영역을 작게, `pantsWarmMax: null`. 베일은 머리 부품에 포함(`pony` 를 베일 자락으로 쓰면 흔들림: `ponyN 6`, `ponyCfg {rest:0.3}`). 지팡이는 손에 쥐지 않고 원화에서 빼고(허리 장비 없음 → `coil` 영역 null) 절차적 지팡이 + grip.
- **빅터(victor, 총잡이)**: 쌍권총 → 두 손 모두 grip(`K.off`, 먼 손은 어둡게). 총은 절차적, 원화에는 권총집을 허리에(`coil` 영역에 권총집 = 무기를 들면 사라지는 게 싫으면 영역 없이 몸통에 남김). 모자(wide_hat) → 머리 영역을 챙까지. 긴 코트는 카엘과 같은 자락.
- **브란(bran, 대검·거구)**: `build: huge`. 원화도 크게 → 뼈 길이는 원화에서 자동. 양손 대검 → 먼 주먹이 무기 위에 한 번 더 그려진다(0.96배). 판금 다리(`pantsWarmMax: null`), 큰 견갑은 `pad`. 타바드(knight) = `skirt` 한 장.
- **리아(lia, 닌자·단검 쌍수)**: 코트 없음 → `skirt`/`skirtFar` 영역 null(자락 없음), 허리띠 매듭은 몸통에. 긴 스카프 꼬리는 절차적(look.scarf.long). 이마 보호대는 머리 부품. 단검 쌍수 → 두 손 grip.
- **아젤(azel, 귀족·검)**: 길게 흘러내리는 머리(flowing) → `pony` 영역을 등까지, `ponyN 6~7`, `ponyCfg {rest:0.35, flut:90}`. 상위 직업의 날개·후광은 절차적(look.wings/halo 로 자동). 높은 깃(noble collar)은 몸통 부품.
- **NPC**: 벡터 인형 유지(`p.npc`). 퍼펫으로 만들 경우 `characters.js` 밖의 id 이므로 런타임 `classOf` 가 null → 지금 구조로는 쓰지 않음(필요하면 `look.classId` 에 퍼펫 키를 넣고 매니페스트에 `npc/<id>` 로 등록하는 확장이 필요).

## 10. 알려진 한계

- 장비 투구(head 슬롯)는 퍼펫에 겹쳐 그리지 않는다 — 직업 원화의 머리 장식이 우선. (벡터 영웅은 그대로 표시)
- 먼 팔·먼 다리는 가까운 쪽 사본을 어둡게 한 것(좌우 비대칭 장식이 같아 보임). 게임 배율에서는 눈에 띄지 않는다.
- 턴테이블 채색 뷰는 정지 그림(숨쉬기만). 동작 시연은 옆모습으로 돌아가서 재생한다(스펙 §7.2 와 같음).
- 3/4 뷰의 망토는 단순한 절차적 형태(벨벳 결 + 주름 명암).
- 턴테이블 재질 마스크는 색 모델 + 자리 거르기라서 짙은 바지 일부·장갑·코트 밑단 아래 장화 윗부분이 함께 칠해질 수 있다(옆모습 퍼펫은 칠하지 않음). 원화의 허리 채찍 똬리는 다른 무기를 들어도 턴테이블 채색 뷰에 남는다.
- 회전 베기(채찍 spin, 대검 heavy_spin, 검 spin_blade 지상)는 벡터와 같은 가로 접기(최소 0.3)라서 채색 원화가 한두 프레임 얇은 판처럼 보인다.
- 잔상(대시 유령)은 rig 없는 정지 근사라 망토가 긴 직업(성전 기사·대심문관·블러드 헌터)은 망토가 곧은 판 모양 실루엣으로 남는다.
- 극단적으로 뒤로 젖히는 자세(찌르기 대시 slide_shoot, 급강하 예비)에서 목 뒤 1px 틈이 보일 수 있다(`neckCap` 을 더 내리면 해결).
