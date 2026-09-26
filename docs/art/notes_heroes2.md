# heroes2 작업 노트 — 브란(bran) · 리아(lia) 채색 퍼펫

PUPPET_PIPELINE.md 를 그대로 따라 두 영웅 × 7직업을 만들면서 배운 것. 리드가 나중에 본 문서에 합친다.
클링 기록: `tools/puppet/kling_manifest_heroes2.json` (브란 40장, 리아 45장).

## 1. 클링 원화

### 1.1 기본 측면 원화 — 초상화를 `image_1` 로 두면 안 된다
- 브란·리아 모두 초상화를 `image_1`, 카엘 측면 원화를 `image_2`(포즈 참고)로 준 첫 시도(2후보씩)가 전부 **초상화 구도의 3/4 앞모습**으로
  나왔다. 리아는 "no long scarf tails" 를 무시하고 스카프·허리띠 자락이 길게 날렸다.
- 해법: **기존 영웅의 측면 원화(`kael_hunter_side.jpg`)를 `image_1`(편집 대상)**, 초상화를 `image_2`(정체성)로 두고
  "Edit 图片1. Keep the exact same walking side pose facing RIGHT in strict profile … Replace the man with the knight from 图片2: his face …, his build …"
  (`aspect_ratio auto`). 포즈·구도·크기·배경이 카엘과 거의 같게 나와 **관절 배치도 카엘과 비슷**해진다(리그 작성이 쉬워짐).
  - 체형 차이는 문장으로: 브란 "clearly bigger and bulkier than the man in 图片1", 리아 "slim athletic female build".
  - 카엘의 옷이 새어 들어온다(브란 후보 a 의 갈색 가죽 장화). 후보 2장 중 고른다.
- 리아처럼 초상화에 흩날리는 천(스카프)이 있으면 한 번 더 편집: "REMOVE all the long flowing red cloth tails … the scarf is only wrapped
  snugly around her neck and tucked in … her back and her near arm are fully visible" (1회로 해결).

### 1.2 직업 원화 (keep-pose)
- 카엘 템플릿 그대로 성공률 높음 (12후보 중 채택 불가 2건).
- **정면성 강한 묘사("demonic … glowing runes")는 포즈 고정을 이긴다**: 혈귀 광전사는 기사 원화에서 편집하니 2후보 모두 정면으로 돌아섰다.
  → 이미 가까운 모습(맨팔 광전사 원화)에서 편집 + "seen from exactly the same STRICT SIDE PROFILE … (we see his left side, NOT his front)".
- 망토 금지는 대체로 지켜지지만 붉은 천이 많은 직업(십자군)은 후보 하나가 망토를 그렸다 → 다른 후보.
- "NO mask"(얼굴 드러내기)는 무시됨(리아 무희·카게로우). 가면은 정체성에 유리해서 그대로 둠.
- 허리 뒤로 늘어지는 짧은 자락(그림자 군주의 갑옷 태싯, 블레이드 댄서의 금수 자락, 사신의 띠 꼬리)은 피하기 어렵다
  → 금지하지 말고 `skirt` 영역(스트립 회전) 한 장으로 받는다(카엘의 코트 자락과 같은 방식).

### 1.3 턴어라운드 — 레이아웃 참고 인물이 새어 들어온다
- 카엘 5뷰 시트를 레이아웃(`image_2`)으로 쓰면 **여성·다른 옷 영웅에서 카엘이 그대로 나온다**: 리아 사신 5뷰의 2·3번째 뷰가 카엘,
  3/4 뒤 오른쪽이 카엘. 리아 암살자·닌자는 카엘의 **긴 코트**가 뒷모습(또는 모든 뷰)에 생겼다. 브란 기사 뒷모습은 카엘의 갈색 장화.
- 해법: 같은 영웅의 깨끗한 다른 직업 시트를 레이아웃으로 (리아는 카게로우 5뷰, 3/4 뒤는 블레이드 댄서 시트) + "No coat, no skirt …"
  → 재생성 3장 모두 성공. **영웅마다 첫 5뷰 한 장이 성공하면 그 시트를 나머지 직업의 레이아웃으로 쓰는 것**이 안전하다.
- 3/4 뒤 2뷰 시트는 14장 중 7장에서 왼쪽 인물이 **앞모습**(얼굴)이었다 → 라벨 `-`. 오른쪽 한 장만 쓰고 거울상으로 채움.
  둘 다 정면 뒤(대칭)로 나오면 한 장을 `ym135` 로 써도 턴테이블에서 어색하지 않다.
- 뷰 순서는 카엘과 같다: 정면(y90)·3/4(얼굴이 화면 왼쪽, y135)·옆(왼쪽을 봄, y180)·뒤(ym90)·뒤 중복(-).
- 색 드리프트: 블레이드 댄서 3/4 뒤 시트만 옷이 보라색 → `turn.fixups`.

### 1.4 손 시트
- 막대 방향이 제각각이다(세로·가로·대각선, 십자 막대, 두 개). `build_rig` 의 초록 키잉이 모두 지우므로 쓸 수 있다.
  축·중심은 `handfit.py`(작업 폴더의 보조 스크립트: 초록 화소 PCA 로 center/axis/반폭) 로 재고, box/wrist 는 격자로 읽는다.
- 실패 사례: 편 손 자리에 상반신 초상(리아 암살자), 편 손에도 막대(사신), 원화 맨팔과 다른 붉은 피부(혈귀 광전사)
  → "ONLY two hands … and nothing else (no face, no head, no torso)", "Only ONE green rod … only in the left fist",
  "natural pale skin exactly like the skin of his bare arms (not red)" 로 재생성 1회씩.
- 편 손이 손가락질·OK 손짓으로 나오는 일이 잦다(가디언·광전사·혈귀) — 시전 손으로는 문제없어 그대로 사용.
