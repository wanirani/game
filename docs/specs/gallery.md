# 회랑 「GALLERY」 — 설계 계약

> **상태: 설계 승인 (리드, 2026-10-06) — 구현 끝 (GAL-CORE · GAL-UI) · 검증 끝 (GAL-VERIFY 2026-10-06, 결함 3개 고침 — §12).** 리드 확정: §11 권고 전부 그대로 — 이름 「회랑」 · 타이틀 '크레딧' 줄을 '회랑' 으로 바꾸고 크레딧은 극장 안으로(8줄 유지) · 성당 「여정 기록」 단추(극장 꺼짐) · 초상화·보스 회랑 없음 · 각성 컷인 7장 넣음 · AnalyserNode + 박자 막대 대체 · 극장 8개 · 소급 너그럽게 · 첫날 NEW 받아들임 · 회랑 업적 없음(67 고정) · 서버 검사 없음. 설계 GAL-DESIGN (2026-10-06). 구현 GAL-CORE · GAL-UI 동시, GAL-VERIFY 가 §12 를 적는다.

리드가 정할 설계. **굵은 항목**은 바꾸지 않는다. 바꿀 이유가 생기면 `/tmp/claude-0/plan/gal_requests.md` 에 `[보낸이→받는이] 내용` 한 줄로 적는다.
비용 원칙: **새 그림(Kling)·새 소리·새 글꼴·새 글자 0** — 이미 있는 `assets/cg` 34장 · `assets/audio/music` 44곡 · 대본 · 크레딧만 다시 보여 준다. **업적 67개 그대로**, **세이브 스키마 그대로**, **서버 그대로**.

## 0. 왜, 그리고 무엇을 하지 않는가

- 이야기 CG 27장과 각성 컷인 7장, 녹음 음악 44곡은 지금 한 번 지나가면 다시 볼 길이 없다 (엔딩 크레딧의 슬라이드만 배경을 돌려 보여 준다). 악마성 시리즈의 '갤러리·사운드 테스트' 자리를 하나 만든다: **타이틀에서 열고, 지금까지 본 것만 걸린다.**
- 열림 기록은 **계정(메타) 단위** — 슬롯을 지우거나 「피의 윤회」로 새 회차를 시작해도(`seenScripts` 를 비운다) 걸린 그림은 내려가지 않고, 로그인하면 다른 기기와 합쳐진다. 업적(`meta.ach`)과 같은 길이다.
- 지금 코드에 '본 CG' 기록은 없다. 대신 **`progress.seenScripts`**(대본을 시작할 때 넣는다 — `front/story.js enter` · `world.playScript` · 보스 `_pre`/`_post`/페이즈 대사 · `worldmap` 인트로) 와 `cleared` · `bosses` · `flags` · `meta.endingsSeen` 이 있다. CG·곡마다 이 증거 중 하나를 고르는 규칙(§3.3)으로 **옛 세이브도 소급**하고, 같은 규칙을 저장·동기화 때마다 다시 훑어 실시간으로 연다. 대사·컷신 코드에 기록 줄을 넣지 않는다.
- 하지 않는 것: 초상화·보스 회랑(도감 탭이 보스 초상·실시간 렌더·설명을 이미 보여 주고, 동료 탭이 동료를, 대화 초상은 2:3 자른 그림이라 따로 걸 가치가 낮다 — §11-4) · 모든 컷신 다시 보기(극장은 서막 둘·엔딩 다섯·크레딧만 — §11-7) · 회랑 업적 · 새 이벤트 · 새 토스트 · 익명 통계 사건 · 서버 검증.

## 1. 개요

| 항목 | 값 |
|---|---|
| 이름 | **「회랑」** (타이틀 줄 `회랑` / sub `GALLERY`, 머리 `heading('GALLERY', '회랑')`) — 4장 '대회랑' 의 메아리, 두 글자라 메뉴 폭 그대로 |
| 방 셋 | **그림** 34장 (제1부 14 · 제2부 13 · 각성 7) · **음악** 44곡 (사운드 테스트 + 시각화) · **극장** 8 (서막 · 제2부 서막 · 엔딩 Ⅰ–Ⅴ · 크레딧) |
| 들어가는 길 | **타이틀 8번째 줄 '크레딧' 자리를 '회랑' 으로 바꾸고 크레딧은 극장 안으로** (줄 수 8 그대로 — 9줄은 phone2 에서 넘친다, §5.7) · 마을 성당 「여정 기록」 탭의 둘째 단추 '회랑에서 돌아본다' (`push`, 극장은 꺼짐) |
| 저장 | **`game.meta.ach` 옆에 `game.meta.gal = {v:1, cg:{id:ms}, mus:{id:ms}, seenAt}`** (§2). 처음 쓸 때 만든다 — `DEFAULT_META` 그대로 |
| 열림 규칙 | 대본을 봤거나 · 그 장을 깼거나 · 그 보스를 쓰러뜨렸거나 · 그 엔딩을 봤거나 (§3.3 문법, §4 표). 슬롯 1–3 + 지금 `game.state` + 각 슬롯의 `ng.past` + 메타 |
| 2부 숨김 | 2부를 모르는 계정에는 2부 그림·곡·엔딩 줄과 그 수를 감춘다 (도감과 같은 원칙, §3.5) |
| 클라우드 | `mergeMeta` 가 `mergeGal`(합집합 · 가장 이른 시각), `cleanMeta` 가 `cleanGal`(≤ 8 KB) · **서버는 모르는 메타 필드를 이미 허용** → 서버 변경 0 |
| 화면 | 새 프런트 장면 **`gallery`** (`front/gallery.js`, `reg_front.js` 지연 등록) — 넓은 배치(desk·tablet) / 좁은 배치(phone1·phone2), 그림 보기 · 음악실 · 극장 |
| 메모리 | 썸네일은 **아틀라스 캔버스 한 장**(≤ 4.9 MB, lean ≤ 3.0 MB)에 굽고 원본은 곧바로 놓는다 · 크게 보기는 디코딩 CG ≤ 2장 (휴대폰은 lo 1147×599 = 2.75 MB) (§5.8) |
| 글꼴 | **새 글자 0** — §6 문장 전부 `noto-sans-kr.woff2`·`hahmlet.woff2` 기본 cmap 으로 확인 (`「」` 는 Hahmlet 에 없어 본문 글꼴로 그려진다 — `ending.js` 의 엔딩 이름과 같다) |
| 예산 | 코드만 ≈ +60 KB 원문 · 그림·소리 0 → APK lo 그림 단계 45.88 → ≈ 45.94 MiB · 첫 화면 경로 +≈ 1 KB brotli (§10) |

## 2. 저장 — `meta.gal`

### 2.1 모양 (v1)

```js
meta.gal = {
  v: 1,                                    // 판. 더 큰 판을 만나도 아는 필드만 읽고 나머지는 그대로 둔다
  cg:  { cg_prologue_moon: 1759700000000, cutin_lia: 1759700000000, … },  // 열린 그림 id → 처음 열린 시각 (ms epoch). 지우지 않는다
  mus: { prologue: 1759700000000, s01: …, … },                           // 열린 곡 id → 처음 열린 시각. 'always' 곡(title·credits)은 적지 않는다
  seenAt: 1759712000000,                   // 회랑을 마지막으로 닫은 시각 → 그 뒤에 열린 것이 NEW
}
```

- 키 규칙 **`/^[a-z][a-z0-9_]{1,31}$/`** (업적과 같음 — 가장 긴 id `cg_sunken_cathedral` 19자) · 값 `0 < t ≤ 1e13` 유한수 · 상한 **cg ≤ 64 키 · mus ≤ 96 키 · `JSON.stringify(gal).length ≤ 8 KB`** (지금 최대 ≈ 2.6 KB). 극장은 저장하지 않는다 — 서막은 그 CG, 엔딩은 `meta.endingsSeen` 에서 읽는다.
- 모르는 id(다음 판의 그림)·모르는 필드는 남긴다 (보이지 않을 뿐). 비밀·기기 번호 없음.

### 2.2 `src/core/gal_meta.js` (GAL-CORE, 순수 함수, import 없음 — `cloud.js` 가 정적으로 읽어 첫 조각에 실린다, ≈ 3 KB)

| 함수 | 계약 |
|---|---|
| `ensureGal(meta) → gal` | 객체가 아니면 `{v:1, cg:{}, mus:{}, seenAt:0}` 를 만들어 `meta.gal` 에 넣는다. 있으면 제자리에서 고친다(규칙·범위 밖 항목 버림, 빠진 필드 채움). 모르는 필드 보존 · 멱등 · 던지지 않음 |
| `mergeGal(a, b) → gal` | a = 이 기기, b = 서버. `cg`·`mus`: 키 합집합, 값은 유효한 것 중 **작은 값** · `seenAt`·`v`: 큰 값 · 모르는 필드 `{...b, ...a}`. 교환·결합·멱등 |
| `cleanGal(gal) → gal` | 올리기 전 사본: 규칙 밖 버림 → 키 상한을 넘으면 키 순서로 자름 → 8 KB 를 넘으면 모르는 필드부터 버림 |
| `GAL_KEY_RE` · `GAL_LIMITS` | 위 규칙·상한 |

- 엔진·화면은 **`game.meta.gal` 을 변수에 붙잡아 두지 않는다** (`cloud.applyMeta` 가 메타를 통째로 바꿔 끼운다). 쓸 때마다 `ensureGal(game.meta)`.

### 2.3 클라우드 · 서버 · 디버그 부팅

- `core/cloud.js` (GAL-CORE, 줄 끝 `// [hook:gal]`): `mergeMeta` 끝에 `if (isObj(a.gal) || isObj(b.gal)) out.gal = mergeGal(a.gal, b.gal);` · `cleanMeta` 에 `if ('gal' in o) o.gal = isObj(o.gal) ? cleanGal(o.gal) : null;` · `FRONT_SCENES` 에 `'gallery'` (회랑이 맨 아래 장면일 때 지난 `game.state` 의 슬롯을 '진행 중' 으로 보지 않게).
- **서버 변경 없음**: `validate.mts isValidMeta` 는 모르는 필드를 허용하고, 본문 한도 64 KB · 깊이 `DATA_MAX_DEPTH` 32 안이다 (`gal` 깊이 2). `cleanGal` 이 8 KB 로 묶으므로 `cleanMeta` 의 56 KB 줄이기 규칙에 여유. 시험 G6 이 서버 `isValidMeta` 로 확인한다.
- 옛 클라이언트(업데이트 전 APK·PWA): `mergeMeta` 가 `{...b, ...a}` 라 자기 쪽에 `gal` 이 없으면 서버 것을 지우지 않는다. 예전에 받아 둔 낡은 `gal` 을 다시 올리면 다른 기기의 새 열림이 서버에서 잠시 빠질 수 있고, 새 클라이언트가 다음 동기화에서 합집합으로 되돌린다 (업적 위험 §13-2 와 같음).
- 디버그 부팅(`?scene=` 이 타이틀이 아님 → `saves.markDebugBoot()`): 읽기는 진짜 메타, `saveMeta` 는 `bloodnocturne_meta_debug` 에만 (`core/save.js` 그대로). 그래서 `?scene=gallery` 시험은 진짜 메타 칸에 씨앗을 넣고 시작하고, 열림 쓰기는 디버그 칸에서 확인한다.

## 3. 엔진 — `src/game/gallery.js` (GAL-CORE)

### 3.1 입구

- `main.js loadRest` 에 업적 줄 옆으로 (**정적 import 금지**): `import('./game/gallery.js').then((G) => G.initGallery(g)).catch((e) => console.warn('[gal]', e)); // [hook:gal]`
- `initGallery(game)` (한 번만) → **`game.gal`** · `saves.onWrite` · 버스 `cloud:sync`(phase done) · `awakenCast` 구독 · 한가할 때(`requestIdleCallback`, 없으면 1.5초 뒤, 업적 소급보다 늦게) 첫 소급 훑기.

### 3.2 공개 API (`game.gal` — GAL-UI 는 이것만 쓴다)

```js
game.gal = {
  defs: { cg: GAL_CG, mus: GAL_MUSIC, th: GAL_THEATER },   // data/gallery.js (데이터 순서 = 표시 순서)
  rev,                                     // 열림이 바뀔 때마다 +1 (화면이 다시 읽는 표시)
  has(kind, id) → bool,                    // kind 'cg'|'mus'|'th'. need 가 'always' 면 늘 true
  isNew(kind, id) → bool,                  // 열린 시각 > seenAt (cg·mus 만)
  p2() → bool,                             // 2부를 아는가 (§3.5)
  list(kind) → [{ def, open, isNew, hidden }],             // hidden = 2부 숨김 (화면은 빼고 그린다)
  summary() → { cg:{got,total}, mus:{got,total}, th:{got,total}, unseen, p2 },   // 숨김 뺀 수
  rescan(src = 'retro') → ['cg:id' | 'mus:id', …],         // 새로 열린 것. 있으면 saveMeta 한 번
  markSeen(),                              // seenAt = now → saveMeta (회랑을 닫을 때, 새로 연 것이 있었을 때만)
  _open(kind, id),                         // 시험·?debug 전용
};
// 순수 export (node, DOM 없음): digestGal(state) · gatherGal(meta, states) · evalNeed(need, ctx) · scanGal(ctx) → { cg: [], mus: [] }
```

- **거두지 않는다**: 슬롯을 지우거나 회차를 넘겨 증거가 사라져도 `meta.gal` 은 남는다. **알림·이벤트 없음** — 타이틀 줄의 `NEW n` 과 카드의 붉은 마름모가 전부다.

### 3.3 요약과 규칙 문법

`digestGal(state)` (손상 세이브에도 던지지 않는다, 원본을 바꾸지 않는다): **`state.arcade` 면 `null`** (아케이드 임시 세이브는 `seenScripts = Object.keys(SCRIPTS)` 다 — `front/arcade.js`) → `{ seen:Set(progress.seenScripts), cleared:Set, bosses:Set, flags:Set(값이 true 인 것), tier:{charId: 직업 단계}, deaths }`. 회차 슬롯이면 `NG.pastState(state)` 의 `cleared`·`bosses`·`flags` 를 더한다 (`past` 에는 `seenScripts` 가 없어서 모든 규칙에 장·보스·깃발 대안을 둔다).
`gatherGal` 은 슬롯 1–3(`saves.read`) + 지금 `game.state`(슬롯 1–3 이고 아케이드가 아니면, 저장 전 진행 포함) 의 요약을 **합집합** 한 `ctx.d` 와 `ctx.meta` 를 만든다. 슬롯 요약은 슬롯별로 캐시하고, 쓰기 알림은 그 슬롯만 다시 요약한다 (`game.state` 가 그 슬롯이면 파싱 없이).

`need` 는 문자열 배열 — **하나라도 참이면 열림**:

| 토큰 | 참일 때 |
|---|---|
| `always` | 늘 (저장하지 않음) |
| `start` | `s:prologue` 또는 `c:*` (이야기를 시작했다) |
| `s:<대본>` | 어느 슬롯의 `seenScripts` 에 있다 |
| `c:<장>` · `c:*` | 그 장(아무 장)을 깼다 (`cleared` — `ng.past` 포함) |
| `b:<보스>` · `boss:<보스>` | `bosses` 에 있다 (쓰러뜨렸다) · `boss:` = `s:<보스>_pre` 또는 `b:<보스>` 또는 그 보스의 장(`STAGES[sid].boss`)을 깼다 (보스전을 봤다) |
| `e:<엔딩>` | `meta.endingsSeen` 에 있음 또는 슬롯 깃발 `ending_<엔딩>` |
| `f:<깃발>` | 어느 슬롯(`past.flags` 포함)에서 참 |
| `aw:<영웅>` | `meta.ach.prog['aw_'+영웅] ≥ 1` (각성을 썼다 — 업적 엔진이 센다) 또는 그 영웅의 직업 단계 ≥ 1 (각성을 쓸 수 있었다, 소급) |
| `die` | 슬롯 `stats.deaths ≥ 1` 또는 `meta.ach.prog.deaths ≥ 1` |
| `arena` | `meta.survivalBest > 0` 또는 `meta.towerBest` 에 층 > 0 인 난이도가 있다 |

### 3.4 언제 훑는가

| 계기 | 하는 일 |
|---|---|
| 부팅 뒤 한가할 때 | 전부 훑기 (`'retro'`) — 옛 플레이어 소급. 휴대폰 슬롯 셋 읽기 ≈ 10–20 ms 라 타이틀이 그려진 뒤 |
| `saves.onWrite({type:'write', slot})` | 그 슬롯 요약만 새로 → 훑기 (0.5초 모아서). 자기 `saveMeta` 로 생긴 `{type:'meta'}` 는 무시 (깃발 `writing`) |
| `saves.onWrite({type:'meta'})` (남의 쓰기) | 메타 규칙(`e:`·`aw:`·`die`·`arena`)만 다시 — 엔딩·업적 누적값·아케이드 기록 |
| `cloud:sync {phase:'done'}` | 전부 훑기 (`saves.store` 는 알림이 없다) |
| `awakenCast {charId}` | `cutin_<charId>` 를 곧바로 연다 (아케이드 포함 — 이미 연 영웅의 그림) |
| 회랑 장면 `enter` | `rescan('open')` 을 같은 프레임에 (캐시 + 지금 `game.state`) |

- 새로 열린 것이 있을 때만 `ensureGal` → 값 = `Date.now()` → **`saveMeta` 한 번** (로그인 중이면 클라우드가 2초 모아 올린다). 업적 엔진과 서로의 메타 쓰기를 다시 보지만, 둘 다 새것이 있을 때만 쓰므로 한 번 오가고 멈춘다.
- 처음 업데이트한 날에는 소급으로 열린 것이 모두 NEW 다 (타이틀 `NEW 40` 쯤) — 새 기능 안내 구실로 받아들인다 (§11-9).

### 3.5 2부 숨김

`p2()` = `cg_rift_sky` 가 열림 · 2부 그림·곡 하나라도 열림 · `meta.endingsSeen` 에 `p2`/`p2true` · 어느 슬롯 깃발 `p2_started`/`p2_done`/`rook_revealed` 중 하나. 거짓이면 데이터의 `p2: true` 항목(그림 제2부 13 + `cutin_isolde` · 곡 11 · 극장 셋)을 목록·수·NEW 에서 뺀다. 숨기기 전 수: 그림 20 · 음악 33 · 극장 5.

## 4. 목록 — `src/data/gallery.js` (GAL-CORE, 순수 데이터, import 없음)

### 4.1 그림 `GAL_CG` (34 — `assets/cg/*.webp` 와 정확히 같은 집합, 모두 `assets/lo/cg/` 변형 있음)

| # | id | 이름 (`name`) | 자리 (`at`, 잠긴 카드 힌트) | `need` |
|---|---|---|---|---|
| 1–3 | `cg_prologue_moon` · `cg_prologue_attack` · `cg_alberto_church` | 핏빛 달 · 불타는 마을 · 신부의 성물 | 서막 | `start` |
| 4 | `cg_elise_taken` | 사라진 엘리제 | 1장 | `s:s01_outro` `c:s01` |
| 5 | `cg_castle_gate` | 악마성 정문 | 3장 | `s:s03_intro` `c:s03` |
| 6 | `cg_elise_rescued` | 엘리제 구출 | 4장 | `s:s04_outro` `c:s04` |
| 7 | `cg_carmilla_library` | 도서관의 귀부인 | 6장 | `s:s06_outro` `c:s06` |
| 8 | `cg_death_appears` | 사신의 등장 | 11장 | `boss:b_death` |
| 9 | `cg_dracula_throne` | 왕좌의 백작 | 12장 | `boss:b_dracula` |
| 10 | `cg_dracula_transform` | 진정한 밤의 모습 | 12장 | `s:b_dracula_transform` `b:b_dracula` `c:s12` (2페이즈 대사 — 처치 전에 반드시 지난다) |
| 11 | `cg_castle_collapse` | 무너지는 성 | 12장 | `s:s12_outro` `c:s12` `e:normal` |
| 12 | `cg_abyss_gate` | 심연의 문 | 13장 | `s:s13_intro` `f:abyss_open` `c:s13` (s12 아웃트로의 유물 갈래 = `abyss_open`) |
| 13 | `cg_true_ending` | 영원한 새벽 | 엔딩 | `s:s13_outro` `c:s13` `e:true` |
| 14 | `cg_bad_ending` | 끝나지 않는 밤 | 엔딩 | `e:bad` `s:ending_bad` |
| 15–16 | `cg_rift_sky` · `cg_rook_reveal` | 하늘의 균열 · 로크의 정체 | 제2부 서막 | `s:p2_prologue` `f:p2_started` `c:s14` |
| 17 | `cg_rift_gate` | 균열문 | 14장 | `s:s14_intro` `c:s14` |
| 18–23 | `cg_mirror_empress` · `cg_forge_idol` · `cg_sunken_cathedral` · `cg_ziz_storm` · `cg_mara_cradle` · `cg_behemoth_rot` | 거울의 여제 · 용광로의 우상 · 가라앉은 성소 · 폭풍의 거신조 · 악몽의 요람 · 썩어가는 짐승 | 14 · 15 · 16 · 17 · 18 · 19장 | `boss:b_narkissa` · `boss:b_moloch` · `boss:b_dagon` · `boss:b_ziz` · `boss:b_mara` · `boss:b_behemoth` |
| 24 | `cg_void_descent` | 공허로의 하강 | 20장 | `s:s20_intro` `c:s20` |
| 25 | `cg_nihil` | 니힐 | 20장 | `boss:b_nihil` |
| 26–27 | `cg_p2_ending` · `cg_p2_true` | 파수꾼의 밤 · 새벽의 별 | 엔딩 | `e:p2` `s:ending_p2` · `e:p2true` `s:ending_p2true` |
| 28–34 | `cutin_kael` `_sera` `_victor` `_bran` `_lia` `_azel` `_isolde` | `{영웅 이름}` + 작은 줄 `각성 — {AWAKEN[id].name}` (기존 문장) | 각성 | `aw:<영웅>` (+ `cutin_isolde` 는 `s:s14_outro` `c:s14` — 14장 아웃트로가 이 그림을 CG 로 빌려 쓴다) |

- 15–27 과 `cutin_isolde` 는 `p2: true`. 분류 `part`: 1 = **제1부 「드라큘라의 성」**(1–14) · 2 = **제2부 「균열의 순례」**(15–27) · `aw` = **각성**(28–34).
- 규칙 근거: CG 줄은 모두 대본의 갈래 밖에 있다(`s12_outro` 의 `cg_abyss_gate` 만 유물 갈래 → `f:abyss_open`). 아웃트로는 첫 클리어 때 늘 나오고(`results.js`), 보스 `_pre`·`b_dracula_transform` 은 스토리 보스전에서 한 번 나오므로 장·보스 증거로 소급해도 실제로 본 것과 같다.

### 4.2 음악 `GAL_MUSIC` (44 — `data/music.js TRACKS` 와 `assets/audio/music/index.json` 의 곡 집합과 정확히 같음. 이름은 `TRACKS[id].name` 그대로)

| 칸 (`sec`) | 번호 · id | `need` |
|---|---|---|
| **이야기와 마을** | 01 `title` | `always` |
| | 02 `prologue` · 05 `hub` · 06 `inn` · 07 `shop` · 08 `smith` · 09 `church` · 10 `worldmap` · 12 `minigame` | `start` (마을·여관 놀이는 서막 직후부터 열려 있다) |
| | 03 `story` | `c:*` `s:s01_outro` |
| | 04 `sad` | `s:s07_outro` `c:s07` `e:bad` `c:s23` |
| | 11 `worldmap2` (2부) | `s:p2_prologue` `f:p2_started` `c:s14` |
| **제1부** | 13–25 `s01` … `s13` | `s:<장>_intro` `c:<장>` (인트로가 그 곡을 튼다) |
| **제2부** (2부) | 26–32 `s14` … `s20` | 같음 (외전 s21–s25 는 s17·s02·s10·s11·s01 곡을 다시 쓴다) |
| **보스** | 33 `boss` | `boss:` b_nightwing · b_banshee · b_crimson · b_grimoire · b_charon |
| | 34 `boss2` | `boss:` b_dullahan · b_bonedragon · b_chimera · b_leviathan · b_colossus · b_frostqueen · b_death · b_hagen |
| | 35 `dracula` · 36 `chaos` | `boss:b_dracula` `boss:b_bride` · `boss:b_chaos` |
| | 37 `boss3` (2부) | `boss:` b_narkissa · b_dagon · b_mara · b_nemain |
| | 38 `boss4` · 39 `nihil` (2부) | `boss:` b_moloch · b_ziz · b_behemoth · b_argen · `boss:b_nihil` |
| | 40 `arena` | `arena` (서바이벌·무한의 탑에서만 나온다) |
| **막간** | 41 `victory` · 42 `gameover` | `c:*` · `die` |
| | 43 `ending` · 44 `credits` | `e:normal` `e:true` `e:p2` `e:p2true` · `always` (크레딧은 지금도 타이틀에서 늘 볼 수 있었다) |

- 번호는 **보이는 목록의 순서** (2부를 숨기면 다시 매긴다 — 빈 번호가 2부를 알리지 않게). 시험 G1 이 `STAGES[sid].music`·`BOSSES[id].music` 와 이 표를 대조한다 (곡을 바꾸는 외전이 오면 표가 따라가야 한다).

### 4.3 극장 `GAL_THEATER` (8)

| id | 줄 (이름 · sub) | 재생 | `need` |
|---|---|---|---|
| `prologue` | 서막 · `PROLOGUE` | 대본 `prologue`, bg `cg/cg_prologue_moon`, 곡 `prologue` → 회랑 | `start` |
| `p2_prologue` (2부) | 제2부 서막 · `PART Ⅱ` | `p2_prologue`, bg `cg/cg_rift_sky` → 회랑 | `s:p2_prologue` `f:p2_started` `c:s14` |
| `end_bad` … `end_p2true` (Ⅳ·Ⅴ 는 2부) | `ENDING Ⅰ–Ⅴ` · `「{ENDINGS[k].name}」` (기존 문장) | `ending_<k>`, bg·곡 `ENDINGS[k]`, 제목 카드 `{eng, kor}` → 크레딧 `{kind:k}` → 회랑 | `e:<k>` |
| `credits` | 크레딧 · `CREDITS` | 크레딧 `{kind:null}` → 회랑 | `always` |

## 5. 화면 — 장면 `gallery` (`src/scenes/front/gallery.js`, GAL-UI)

### 5.1 장면

- `go('gallery', { back:'title', backIndex })` (타이틀) · `push('gallery', {})` (성당 — 닫으면 `pop()`). 선택 인자 `room: 'cg'|'music'|'theater'`. 깃발 `uiScale` · `hidePad` · `opaque`, `deferToasts` 는 **크게 보기가 열린 동안만** (업적 알림이 그림을 가리지 않게 — `ach_notify` 가 이미 따른다), `keepAwake` 는 음악실에서 곡이 도는 동안만.
- 배경: 타이틀과 같은 `bg/title` 을 `Layer` 에 한 번 굽고(lean 이면 반 해상도) 어둡게 — 업적 화면과 같은 방법. 불씨는 타이틀의 절반 `Ambience`.
- `game.gal` 이 없으면(엔진을 못 받음) 데이터만으로 그리고 모두 잠김 + 머리 아래 한 줄 '회랑 정보를 불러오지 못했습니다'. 던지지 않는다.
- 나가면: `game.gal.markSeen()` · 아틀라스·배경 레이어 `giveCanvas` · 회랑이 받은 CG 만 `assets.release` (들어올 때 이미 캐시에 있던 키는 놓지 않는다 — 성당 배경 `cg/cg_alberto_church` 를 지우지 않게) · 곡: `go` 로 들어오면 `audio.music('title')` (다시 보기·크레딧에서 돌아와도), 타이틀로 나가면 타이틀이 `title` 을 틀고, `push` 였으면 들어올 때의 `audio.current` 로 되돌린다. 음악실에서 튼 곡은 방을 바꿔도 계속 돈다 (그림을 보며 듣기).

### 5.2 배치 (UI px, 최소 720×400; phone1 844×390 CSS → 1013×468 · phone2 740×360 → 888×432 · desk 1280×540 · tablet 960×540)

| 영역 | 넓은 배치 (`uiW ≥ 960 && uiH ≥ 500`: desk · tablet) | 좁은 배치 (휴대폰) |
|---|---|---|
| 머리 | 64: `backButton` · `heading('GALLERY','회랑')` · 오른쪽 `그림 {a} / {b} · 음악 {c} / {d}` | 52: `backButton` · '회랑' · 오른쪽 같은 요약(작게) |
| 방 띠 | 46: 칩 셋 `그림 a/b` · `음악 c/d` · `극장 e/f` (각 ≥ 44 CSS, NEW 점) | 44: 같은 칩 (터치 여유로 44 CSS) |
| 그림 | 칸 머리(제1부·제2부·각성 + `n / m`) 사이로 카드 격자 — 열 수 `floor((W − 32) / 208)` (desk 6 · tablet 4), 카드 = 썸네일(가로세로비 1.92) + 이름 줄 22 | 4열 (phone1 카드 폭 ≈ 241 · phone2 ≈ 214) |
| 음악 | 왼쪽 목록(줄 40, 칸 머리) + 오른쪽 '지금 재생' 칸(폭 40 %: 곡 이름 `FONT.title` 22 · 칸 · 원천 배지 · 재생 시간 · 시각화 32막대 높이 120 · 단추 [이전 곡][재생/정지][다음 곡]) | 목록 전폭(줄 `max(44, ceil(38 / per))` — phone 46) + 아래 '지금 재생' 띠 60 (이름 · 배지 · 시간 · 단추 셋, 띠 뒤에 높이 24 시각화) |
| 극장 | 줄 48 × 8 — 한 화면 (이름 · sub · 잠김이면 `???`) | 줄 56 (스크롤) |
| 바닥 | 34: `footer` 안내 (지금 기기의 글리프, §5.6) | 30: 같은 안내 또는 터치 문장 한 줄 |

- 목록은 `menu/common.js` `Scroller`(끌기·관성·휠·오른쪽 스틱) + `scrollbar` + `clipBegin/clipEnd`. 방향키·패드로 고를 때만 선택을 따라 민다 (P-01). 탭 영역 `ui.taps`, `src: 'gal.*'` — 카드·줄 `kind:'list'` ≥ 36 CSS, 칩·단추 `'primary'` ≥ 44 CSS.
- 잠긴 카드: 벡터 틀 + `glyph('lock')` + `???` + 힌트(`at`) — **그림 파일을 받지 않는다** (스포일러·메모리). 잠긴 곡 줄: `No.{nn}  ???` + 칸 힌트. NEW: 오른쪽 위 붉은 `diamond`.
- 빈 회랑(그림 0): 격자 대신 가운데 '아직 걸린 그림이 없습니다 — 이야기를 진행하면 하나씩 걸립니다'.

### 5.3 크게 보기 (그림)

- 검은 바탕에 **맞춤(contain)** 기본, `alt`·두 번 탭으로 **가득 채움(cover, 느린 `kenBurns`)** 토글 — 맞춤 상태는 이번 실행 동안 기억. 위 덮개(자동으로 3초 뒤 숨김, 아무 입력이면 다시): `닫기` · 이름 · `{제1부|제2부|각성} · {at}` · `{i} / {n}` (열린 것만 센다). 터치에는 양옆 화살 단추(56×56).
- ←→ · 밀기 = 이웃 **열린** 그림 (잠긴 것은 건너뜀). 다음 하나를 `assets.load` 로 미리 받고, 두 칸 넘게 떨어진 것은 놓는다 (디코딩 CG ≤ 2장).
- 파일이 없거나(팩·404) 실패하면 틀 + '그림을 불러오지 못했습니다'. 휴대폰·저사양은 `assets` 가 lo(1147×599 / 컷인 960×382)를 고르고, desk high 는 원본(1912×999 / 1600×637).

### 5.4 음악실

- 고르기 = 선택만. `confirm`·줄 탭 = **재생** (`audio.music(id, {fade: 0.4})`; 이미 그 곡이면 `stopMusic(0.2)` 뒤 처음부터). `alt`·[정지] = `audio.stopMusic(0.6)`. ←→·[이전 곡][다음 곡] = 이웃 열린 곡을 고르고 **0.35초 뒤** 재생 (빨리 넘길 때 녹음 곡 풀기가 쌓이지 않게 — RecBank 는 한 번에 하나씩 푼다).
- 배지: `audio.recStats().player.rec` → '녹음 음원' / '합성음', 기다리는 중(`pend === id`)이면 '불러오는 중…'. 설정 '음악 음원'(합성음)·음량을 그대로 따른다 — 회랑은 설정을 바꾸지 않는다. `settings.musicVol ≤ 0.001` 이면 지금 재생 칸에 '음악 음량이 0입니다 — 설정에서 올리면 들을 수 있습니다'.
- 재생 시간 = `audio.ctx.currentTime − 시작` (컨텍스트가 멈추면 같이 멈춘다). 곡 길이 대신 `반복 재생` / `한 번 재생`(`TRACKS[id].loop === false`: victory·gameover) 표시.
- **백그라운드**: 탭 숨김·APK `onPause` → `game.js` 의 `visibilitychange` 가 `audio.suspend()` (지금 그대로) → 돌아오면 이어서. 회랑은 따로 하지 않는다. 오디오가 아직 잠겨 있으면(첫 입력 전 — 타이틀에서 PRESS START 를 거쳤으므로 드묾) 첫 탭이 `audio.unlock()` 을 부른다 (지금 전역 처리).
- **시각화**: `audio.analyser?.()`(§8 GAL-CORE, `AnalyserNode` fftSize 64 → 32칸, 음악 버스 `duckG` 출력에 병렬로 붙어 소리를 바꾸지 않는다, 음악실에서만 만들고 나가면 `analyser(false)` 로 뗀다) 의 `getByteFrequencyData` 를 미리 만든 `Uint8Array(32)` 에 받아 핏빛 막대 32개(사각형, 그라디언트는 캐시 한 개). `null` 이면(컨텍스트 없음) `TRACKS[id].bpm` 박자에 맞춰 뛰는 절차 막대 (곡 id·막대 번호의 결정적 해시 — 게임 난수 금지). `reduceMotion` 이면 막대 높이 변화를 절반으로.

### 5.5 극장 (다시 보기)

- 엔딩: `go('story', { script, replay: true, bg, music, title: {eng, kor}, then: 'credits', thenParams: { kind, back: 'gallery', backParams } })` → 크레딧 → `go('gallery', backParams)` (`backParams = {back, backIndex, room:'theater'}`). 서막 둘은 `then: 'gallery'`. 크레딧 줄은 `go('credits', { kind: null, back: 'gallery', backParams })`.
- **`front/story.js` 에 `replay` 갈래** (GAL-UI, `[hook:gal]` 4곳): ① `seenScripts` 에 넣지 않음 ② `runCmd` 가 `give gold flag quest unlockChar relic recruit` 를 건너뜀 · 선택지의 `set` 무시 ③ **`finish` 가 슬롯을 쓰지 않음** — 타이틀의 `game.state` 는 지난 판의 메모리 사본이라(타이틀이 비우지 않는다) 그대로 쓰면 저장하지 않은 진행이나 클라우드로 받은 새 기록을 덮어쓴다 ④ 화자·문장·`if` 는 고정 상태 `{charId:'kael', progress:{flags:{}}}` 로 읽는다 (카엘로 기본 갈래 — 어느 슬롯에서 열어도 같은 장면). 시험 U7 이 다시 보기 앞뒤의 `game.state`·슬롯 셋·메타를 바이트로 비교한다.
- `front/ending.js` `CreditsScene` (GAL-UI 한 줄): `enter` 가 `backParams` 를 받고, `leave` 의 `!fromEnding` 갈래 맨 앞에 `if (this.back === 'gallery') { g.go('gallery', this.backParams ?? { back: 'title', room: 'theater' }); return; }`. `index: 7` 주석은 '회랑 줄' 로 고친다 (줄 위치는 그대로 7).
- `push` 로 열린 회랑(성당)에서는 극장 줄이 꺼진다 — 다시 보기는 `go` 라 마을 장면 스택을 지운다. 줄 아래 '타이틀 화면의 회랑에서 볼 수 있습니다'.

### 5.6 조작 (의미 액션만 — 새 바인딩 없음)

| 입력 | 목록 | 크게 보기 | 음악실 |
|---|---|---|---|
| `prevTab`/`nextTab` (Q·E / 패드 LB·RB) | 방 앞·뒤 (돌아감) | – | 방 앞·뒤 |
| ↑↓←→ (`Nav` 반복) | 격자·줄 고르기 | ←→ 이웃 그림 | ↑↓ 고르기 · ←→ 이전·다음 곡 |
| `confirm` | 크게 보기 / 다시 보기 | 덮개 보이기·숨기기 | 재생 |
| `alt` (A / 패드 Y) | – | 맞춤 ↔ 가득 채움 | 정지 |
| `cancel` | 장면 닫기 (`back:'title'` → `go('title', {menu:true, index: backIndex})`, 아니면 `pop()`) | 닫기 | 장면 닫기 (곡은 §5.1 대로) |
| 터치 | 칩·카드·줄 탭(바로 연다/재생), 끌기 스크롤, 가로 밀기 = 방 바꾸기(`Gesture`) | 밀기 = 넘기기 · 탭 = 덮개 · 두 번 탭 = 맞춤 · `닫기` | 줄 탭 = 재생 · 단추 셋 |
| 마우스 | 올리면 고르기 · 누르면 연다 · 휠 | 휠 = 넘기기 | 같음 |

바닥 안내: 목록 `[prevTab/nextTab] 방 · [↑↓←→] 고르기 · [confirm] 보기 · [cancel] 돌아가기` · 음악실 `[confirm] 재생 · [alt] 정지 · [←→] 이전·다음 곡` · 크게 보기 `[←→] 넘기기 · [confirm] 설명 · [alt] 화면 맞춤 · [cancel] 닫기` · 터치 '그림을 누르면 크게 볼 수 있어요' / '곡을 누르면 재생합니다' / '옆으로 밀어 넘기고, 한 번 누르면 설명을 숨깁니다'.

### 5.7 들어가는 길

- **타이틀** (`title.js buildMenu`, GAL-UI): 8번째 줄 `{ id:'credits', label:'크레딧' }` → **`{ id:'gallery', label:'회랑', sub:'GALLERY' }`**, `choose` → `g.go('gallery', { back:'title', backIndex: i })` (지연 장면이 아직이면 'loading' 이 기다린다). NEW: 업적 줄과 같은 방법 — 1초마다 `g.gal?.summary?.()?.unseen` → 붉은 점 + sub `NEW {n}`. 크레딧은 극장의 마지막 줄이 되고 늘 열려 있다 (§4.3) — 지금 누구나 보던 것을 잃지 않는다.
  - 9줄로 늘리지 않는 까닭: phone2 (uiK 1.25 → 888×432, 줄 46) 에서 메뉴 높이 9 × 46 + 8 = 422 > 바닥선 402 (`H − 30 − sb`) − 위 여백 10 = 392 → 마지막 줄이 바닥 안내와 겹친다. 8줄 배치는 업적 통합 때 잰 그대로 (phone2 `y0 ≈ 27`, 끝 402) — `ach_ui` U1(8줄, `ids[4] === 'ach'`)도 그대로 통과한다.
- **성당** (`town/church.js` 「여정 기록」 탭, GAL-UI): 아래 단추 하나(폭 340)를 둘로 — `[여정을 기록한다]` `[회랑에서 돌아본다]` (각 폭 `min(240, (body.w − 48) / 2)`, 높이 48 → ≥ 44 CSS). 키보드·패드: ←→ 로 두 단추 사이, `confirm` = 고른 단추 (처음엔 기록), 안내 줄에 `[alt] 회랑` 바로가기. 누르면 `g.push('gallery', {})`. 마을 장면·월드는 아래에 그대로 (회랑은 불투명이라 그리지 않는다).
- 인게임 메뉴 기록 탭에는 더하지 않는다 ([설정 | 업적] 줄에 셋째를 넣으면 phone2 에서 좁다 — 업적 §7.6 의 계산).

### 5.8 메모리 · 그리기

- **썸네일 아틀라스 한 장** (`takeCanvas()`, 6 × 6 칸): 칸 폭 = `clamp(round(카드 폭 × 기기 배율), 160, leanMem ? 200 : 256)`, 높이 = 폭 / 1.92 → **lean(휴대폰·태블릿) ≤ 1200×625 ≈ 3.0 MB · high ≤ 1536×800 ≈ 4.9 MB**. 열린 그림만 굽는다: 보이는 줄부터, 휴대폰은 한 번에 하나(데스크톱 둘) `assets.load` → 가운데를 1.92 비로 잘라 `drawImage` → (크게 보기에 쓰는 중이 아니고 들어올 때 캐시에 없던 키면) `assets.release(key)`. 프레임당 굽기 1장, 구운 칸은 이번 방문 동안 다시 받지 않는다.
- 첫 방문의 받기: 열린 그림 전부 — 휴대폰 lo 34장 ≈ 1.7 MB · 데스크톱 원본 ≈ 4.6 MB (서비스 워커 `bn-assets-v1` 이 캐시, APK 는 기기 안). 디코딩 최대치: 굽는 중 1–2장 + 크게 보기 2장 → 휴대폰 ≈ 11 MB · 데스크톱 ≈ 30 MB (터치 예산 160 MB · 데스크톱 400 MB 안).
- 음악: 녹음 곡 PCM 은 `audio_rec` 상한 그대로 (휴대폰 16 MB — 지금 곡 + 다음 곡). 회랑은 `audio.prefetch` 를 부르지 않는다.
- 그리기: 프레임마다 새 캔버스·그라디언트 0 (`linGrad`/`vGrad` 캐시, `glow` 아틀라스), 보이는 카드만 `drawImage` 한 번씩, 크게 보기는 전체 화면 그림 한 장 + 덮개. **휴대폰 장면 그리기 p95 ≤ 3 ms** (업적 화면과 같은 기준).

## 6. 문장 (새 글자 0 — `noto-sans-kr.woff2` · `hahmlet.woff2` 기본 cmap 으로 확인, `/tmp/claude-0/gal_design/glyph.py`)

| 쓰는 곳 | 문장 |
|---|---|
| 타이틀 · 머리 · 방 | `회랑` · `GALLERY` · `NEW {n}` · `그림` · `음악` · `극장` · `그림 {a} / {b} · 음악 {c} / {d}` |
| 그림 칸 · 힌트 | `제1부 「드라큘라의 성」` · `제2부 「균열의 순례」` · `각성` · `서막` · `제2부 서막` · `{N}장` · `엔딩` · `???` · §4.1 이름 27개 · `각성 — {이름}` |
| 그림 보기 | `닫기` · `화면에 맞춤` · `가득 채움` · `{i} / {n}` · `그림을 불러오지 못했습니다` · `아직 걸린 그림이 없습니다 — 이야기를 진행하면 하나씩 걸립니다` |
| 음악실 | `이야기와 마을` · `제1부` · `제2부` · `보스` · `막간` · `No.{nn}` · `지금 재생` · `재생` · `정지` · `이전 곡` · `다음 곡` · `녹음 음원` · `합성음` · `불러오는 중…` · `반복 재생` · `한 번 재생` · `음악 음량이 0입니다 — 설정에서 올리면 들을 수 있습니다` |
| 극장 | `서막` · `PROLOGUE` · `제2부 서막` · `PART Ⅱ` · `ENDING Ⅰ`–`Ⅴ` · `「{기존 엔딩 이름}」` · `크레딧` · `CREDITS` · `아직 보지 못한 엔딩입니다` · `타이틀 화면의 회랑에서 볼 수 있습니다` |
| 안내 · 성당 · 오류 | `방` · `고르기` · `보기` · `돌아가기` · `넘기기` · `설명` · `화면 맞춤` · `이전·다음 곡` · `그림을 누르면 크게 볼 수 있어요` · `곡을 누르면 재생합니다` · `옆으로 밀어 넘기고, 한 번 누르면 설명을 숨깁니다` · `회랑에서 돌아본다` · `회랑 정보를 불러오지 못했습니다` |

- 곡 이름(`TRACKS[id].name`)·영웅 이름·각성 이름·엔딩 이름은 이미 게임 문장이다. 구현 중 문장을 바꾸거나 더하면 같은 스크립트(문장 한 줄씩 cmap 대조)와 `python3 tools/fonts/build_fonts.py --check` 를 다시 돌린다 — `front/**` 는 첫 화면 강제 묶음이라 새 글자가 생기면 첫 화면 글꼴(470.1 / 500 KB)이 커진다.

## 7. 다른 기능과의 관계

- **세이브**: 슬롯 스키마·`migrateState`·`DEFAULT_META`·`isValidSave` 그대로. 회랑은 슬롯을 읽기만 한다 (다시 보기도 쓰지 않는다 — §5.5).
- **회차 「피의 윤회」**: `startNgPlus` 가 `seenScripts` 를 비워도 `meta.gal` 은 남는다. 소급은 `NG.pastState` 의 장·보스·깃발로 (§3.3). 회차 깃발·`world.ng` 를 읽지 않는다. `ngplus.md` 변경 없음.
- **업적 — 결정: 더하지 않는다 (67 · 1,630 · 이명 17 · 장식 5 · `prog` 25 그대로).** 회랑은 업적 엔진의 `meta.ach.prog.aw_*`·`deaths` 를 읽기만 한다. '그림 전부' 같은 업적은 `ch_all.n`(66)·점수 합을 바꾸므로 넣지 않는다 (§11-10).
- **아케이드·온라인·통계**: 없음. 아케이드 임시 세이브는 요약하지 않고(§3.3), 아케이드에서 나온 것은 각성 컷인(`awakenCast`)과 `arena` 곡(아케이드 기록)뿐이다.
- **지연 장면**: 장면은 `reg_front.js` 한 줄(지연 조각), 엔진은 `loadRest` 의 동적 import, 데이터는 엔진·장면이 정적으로. 첫 조각에는 `core/gal_meta.js` 와 타이틀 줄만. 번들러는 조각 수 상한(7 + main)을 넘으면 스스로 합친다 — `build_artifact.mjs --check` 로 확인.
- **스포일러**: §3.5. 잠긴 칸은 이름·그림을 받지 않는다.

## 8. 작업 분담 (파일이 겹치지 않는다)

GAL-CORE 와 GAL-UI 는 동시에 시작한다 (각 1.5–2시간). UI 는 `game.gal` 이 없을 때의 대체(§5.1)와 데이터 파일로 먼저 화면을 만들고 API 가 들어오면 붙인다. 요청은 `/tmp/claude-0/plan/gal_requests.md`. 커밋은 10분마다 자동 저장된다(예상된 일). 밀어 올리기(push)는 하지 않는다. 남의 기능 파일에 넣는 줄에는 `// [hook:gal]`.

| 담당 | 파일 |
|---|---|
| **GAL-CORE** (데이터 · 엔진 · 저장 · 클라우드 · 오디오 탭 · 시험) | 새: `src/data/gallery.js`(§4 표 그대로) · `src/core/gal_meta.js`(§2.2) · `src/game/gallery.js`(§3) · `tools/test_gallery.mjs`(§9.1, `--ui` 면 UI 모듈 실행) · 고침: `src/main.js`(`loadRest` 한 줄) · `src/core/cloud.js`(`mergeMeta`·`cleanMeta`·`FRONT_SCENES`) · `src/core/audio.js`(`analyser(on = true) → AnalyserNode \| null`, ≈ 12줄 — 처음 부를 때 만들어 `eng.duckG` 에 병렬 연결, `false` 면 끊고 버림, 컨텍스트가 없으면 `null`) · `tools/qa/hook_tags.mjs`(`TAGS` 에 `'gal'`) · `tools/qa/run_all.mjs`(단위 묶음 한 줄 `test_gallery`) · 문서 `docs/ARCHITECTURE.md`(§2 파일 지도·훅 표식 · §5.3 메타 `gal` · §15 장면 `gallery` · story 인자 `replay`) · `docs/ACCOUNTS.md`(메타 필드 `gal`) |
| **GAL-UI** (화면 · 타이틀 · 성당 · 다시 보기 · 시험) | 새: `src/scenes/front/gallery.js`(§5) · `tools/qa/gallery_ui.mjs`(§9.2, `export default async function run(opts)`) · 고침: `src/scenes/reg_front.js`(한 줄) · `src/scenes/title.js`(8번째 줄 · NEW · choose) · `src/scenes/front/story.js`(`replay` 네 곳) · `src/scenes/front/ending.js`(`CreditsScene` `backParams`·`leave` 한 줄·주석) · `src/scenes/town/church.js`(「여정 기록」 단추 둘) · 글꼴 `assets/fonts/*`(새 글자가 생겼을 때만) |
| **GAL-VERIFY** (마지막) | 고치지 않는다(리드가 허락한 최소 수정만). §9.1–9.4 전부 + 실제 흐름(옛 세이브 소급 → 타이틀 NEW → 회랑 → 그림·곡·엔딩 다시 보기 → 회차 넘기기 뒤에도 그대로 → 로그인 두 기기 합치기) + 예산 빌드 → 이 문서 §12 |

- 넘겨받는 값: 그림 이름·힌트 문장은 CORE 의 데이터 파일이 원본. UI 가 길이 문제를 찾으면 요청 파일에 바꿀 문장을 적고 CORE 가 고친다 (§6 다시).

## 9. 시험 계약

### 9.1 `tools/test_gallery.mjs` (GAL-CORE, 브라우저 없음, < 15초) — `node tools/test_gallery.mjs [--only G3,G5] [--ui]`

| 사례 | 확인 |
|---|---|
| G1 데이터 | `GAL_CG` id 집합 = `assets/cg/*.webp` = `assets/lo/cg/*.webp` (34) · `GAL_MUSIC` = `TRACKS` 키 = `index.json` 곡 (44) · `GAL_THEATER` 8 · id 키 규칙·중복 없음 · `need` 토큰 문법 · 모든 `s:` 대본·`c:` 장·`boss:`/`b:` 보스·`aw:` 영웅·`e:` 엔딩(`ENDINGS` 키)이 실재 · **그림의 `s:` 대본에 정말 그 `cmd:'cg'` 줄이 있음** · 장 곡의 `need` 가 `STAGES[sid].music`, 보스 곡이 `BOSSES[id].music` 와 맞음(모든 보스가 어느 곡 줄에 있음) · `p2` 표시가 §3.5 수와 맞음(숨김 전 20 · 33 · 5) |
| G2 요약 | `digestGal`: 고정 세이브 `tools/fixtures/save_v1.json`·`save_ch6_nocmp.json`·`save_p2done.json` + 손상 세이브 500개 퍼징 → 던짐 0 · 원본 불변 · `state.arcade` → `null` · 회차 세이브는 `past` 장·보스·깃발 포함 |
| G3 소급 | 빈 메타·빈 슬롯 → 저장되는 것 0 (`always` 만 `has` 참) · 각 고정 세이브 → 손으로 적어 둔 기대 집합과 **정확히** 같음 · 그 세이브를 `startNgPlus` 로 넘긴 슬롯(`seenScripts` 빔)만 있어도 같은 집합 · 아케이드 임시 세이브(대본 전부 본 것으로 표시) → 0 · `meta.endingsSeen ['bad']` 만 → `cg_bad_ending`·`sad`·극장 `end_bad` · `meta.ach.prog.aw_lia 1` → `cutin_lia` · 다시 훑으면 0 · `saveMeta` 정확히 한 번 |
| G4 실시간 | 가짜 game(meta·state·saves·bus 흉내): 슬롯 쓰기(s05 클리어) → `s05`·`boss2`·… 열림, `saveMeta` 1번 · 자기 메타 쓰기는 다시 보지 않음(되먹임 0) · `awakenCast {charId:'bran'}` → `cutin_bran` · 같은 것 다시 → 쓰기 0 · `cloud:sync done` → 전부 훑기 · `saves.debugBoot` 이면 쓰기가 디버그 칸으로(알림 `debug:true`) · `game.meta` 를 통째로 바꿔 끼운 뒤에도 동작 |
| G5 병합 | `mergeGal`: 합집합·가장 이른 시각 · `seenAt`·`v` 큰 값 · 모르는 필드·모르는 id 보존 · 교환·결합·멱등 · `mergeMeta` 가 한쪽에만 `gal` 이 있어도 남김 · 옛 `mergeMeta`(`{...b, ...a}` 흉내)는 서버 `gal` 을 지우지 않음 · `ensureGal` 멱등·던짐 0 |
| G6 서버·크기 | 퍼징 `gal` 2,000개 → `cleanMeta(m)` 은 늘 서버 `isValidMeta` 참이고 `cleanGal` 결과 ≤ 8 KB·키 상한 안 · 최대 `gal` + 최대 `ach` + 명예의 전당 200줄 → `cleanMeta` JSON ≤ 64 KB · `test_api.mjs` 흉내: `PUT /api/meta` 에 `gal` 이 있어도 200 (서버 코드 그대로) |
| G7 2부 숨김 | 1부만 깬 메타·슬롯 → `summary()` 수 20 · 33 · 5, 2부 항목 `hidden` · `p2_started` 하나로 34 · 44 · 8 |

### 9.2 `tools/qa/gallery_ui.mjs` (GAL-UI, 헤드리스 Chromium, `tools/qa/lib/server.mjs openEnv`, desk · phone1 · phone2) — `test_gallery.mjs --ui` 가 부른다

| 사례 | 확인 |
|---|---|
| U1 들어가기 | 타이틀 8줄, 8번째 `gallery`/'회랑', `ids[4] === 'ach'`, 안전 영역 안·알림 카드와 겹침 0 · NEW 점과 `NEW n` (씨앗 메타) · '회랑' → 장면 → `cancel` → 타이틀 메뉴 8번째 줄에 초점 · 스크린숏 `/tmp/claude-0/gal_ui/{vp}_{title,cg,viewer,music,theater}.png` |
| U2 상태 | 빈 메타: 그림 `0 / 20`, 잠긴 카드 `???`+힌트, 잠긴 카드 때문에 `cg/` 요청 0 · 1부 완주 메타: 2부 줄·수 없음 · 전부 연 메타: 34 · 44 · 8, NEW 마름모 → 닫았다 다시 열면 없음(`seenAt`) |
| U3 조작 | 키보드(E·Q 방, 방향키 격자, Z 크게 보기, ←→ 넘기기가 잠긴 것을 건너뜀, A 맞춤 토글, X 닫기) · 패드(`fakepad`: LB·RB, D-pad, 결정 버튼 위치 설정 따름) · 터치(칩 탭, 끌기 스크롤, 카드 탭 → 크게 보기, 밀기 넘기기, 두 번 탭 맞춤) |
| U4 탭 크기 | `tools/qa/lib/taps.mjs auditScene` phone1 · phone2: primary ≥ 44 · list ≥ 36 CSS, 겹침 0 (목록·크게 보기·음악실·성당 단추 둘) |
| U5 메모리 | phone1(medium): 아틀라스 ≤ 3.0 MB 한 장 · 크게 보기 중 `assets.stats()` 의 `cg/` 디코딩 ≤ 2장 · lo 파일을 받음 · 닫은 뒤 `canvasPoolStats().free` 가 들어오기 전과 같음 · 성당에서 열고 닫아도 `cg/cg_alberto_church` 그대로 |
| U6 음악실 | 재생 → `audio.current === 's01'`, 배지 녹음/합성(`window.__BN_AUDIO_CODECS = []` 로 합성 강제) · 정지 → `current === null` · 빠른 ←→ 다섯 번 → 재생 요청 한 번 · `musicVol 0` 안내 · 숨김(`visibilitychange`) → `audio.ctx.state 'suspended'`, 돌아오면 재생 시간이 이어짐 · `analyser()` 막대가 0 이 아닌 값 · 나가면 analyser 끊김 · 타이틀로 가면 `title` |
| U7 극장 | 지난 판 `game.state`(슬롯 2, 저장하지 않은 깃발 하나)를 둔 채 `ending_true` 다시 보기 → 크레딧 → 회랑(극장 방): **`game.state`·슬롯 1–3·메타가 바이트로 같음**, `seenScripts` 그대로, 토스트 '획득' 0 · 서막 다시 보기 → 회랑 · 크레딧 줄 → 회랑 · 엔딩에서 시작한 크레딧(`fromEnding`)은 예전 흐름 그대로 |
| U8 성당 | `?scene=hub`(슬롯) → 성당 → 「여정 기록」 → '회랑에서 돌아본다' → 회랑(`push`) → 음악실에서 `s03` 재생 → 닫기 → 성당, 곡 `church` · 극장 줄 꺼짐 + 안내 · ←→ 두 단추, `alt` 바로가기 · '여정을 기록한다' 는 예전처럼 저장 |
| U9 성능 | phone1 그리기 p95 ≤ 3 ms (목록·크게 보기·음악실, `perfprobe`) · 프레임마다 새 그라디언트·캔버스 0 · 10초 동안 `canvasPoolStats().free` 변화 0 |
| U10 오류 | 모든 사례 페이지·콘솔 오류 0 · `game.gal` 을 지운 채 열기 → 대체 문장, 던짐 0 |

### 9.3 함께 돌리는 기존 검사 (둘 다, 끝낼 때)

`python3 tools/fonts/build_fonts.py --check` · `node tools/test_save_v2.mjs` · `node tools/test_achievements.mjs --ui` (타이틀 8줄 U1) · `node tools/test_ngplus.mjs --browser --ui` (크레딧 흐름) · `npm run test:api` · `npm run test:client` · `node tools/qa/hook_tags.mjs` · `node tools/qa/bindings.mjs` · `node tools/qa/run_platform.mjs --only menu,view` · `node tools/integration.mjs --only title,hub,menu,arcade,s01` · `--mobile --only title,hub` · `node tools/test_part2.mjs --static` · `node tools/deploy/build_artifact.mjs --check` · 예산 빌드(§10).

### 9.4 GAL-VERIFY 의 실제 흐름

고정 세이브 셋을 슬롯에 넣고 새 클라이언트로 부팅 → 타이틀 `NEW n` → 회랑의 수가 G3 기대 집합과 같음 → 그림 넘겨 보기 · 곡 넷 듣기(녹음·합성) · 엔딩 Ⅲ 다시 보기 → 슬롯 바이트 그대로 → 「피의 윤회」 로 넘긴 뒤에도 수가 줄지 않음 → 계정 두 기기(로컬 서버 `npm run test:api` 환경)에서 서로 다른 그림을 열고 동기화 → 합집합.

## 10. 예산

| 항목 | 값 |
|---|---|
| 그림·소리·글꼴 | **0** (APK 그림+소리 입력 73.65 / 75 MiB 그대로) |
| 코드 | 데이터 ≈ 9 KB · `gal_meta` ≈ 3 KB · 엔진 ≈ 10 KB · 장면 ≈ 35 KB · 고친 줄(타이틀·story·ending·church·cloud·audio·main) ≈ 4 KB → **≈ 60 KB 원문 (≈ 15 KB brotli)** |
| APK lo 그림 단계 | 45.88 → **≈ 45.94 MiB** (이 묶음 상한 제안 46.00, 절대 48). 확인 `node tools/deploy/build_web.mjs --out dist/<임시> --no-apk --no-deploy-bundle` (빌드 뒤 지움) |
| 첫 화면 | `core/gal_meta.js` + 타이틀 줄 → brotli +≈ 1 KB (0.69 / 1.60 MB) · 첫 화면 글꼴 470.1 KB 그대로 |
| 메타 | `gal` 최대 ≈ 2.6 KB (상한 8 KB) — 64 KB 한도·56 KB 줄이기 규칙에 여유 |
| 실행 중 | 썸네일 아틀라스 ≤ 3.0 MB(lean) / 4.9 MB · 디코딩 CG ≤ 2장 (+ 굽는 중 1–2) · analyser ≈ 0 · 휴대폰 그리기 p95 ≤ 3 ms |
| 네트워크 | 첫 방문에 열린 그림 받기: 휴대폰 ≤ 1.7 MB(lo) · 데스크톱 ≤ 4.6 MB, 이후 서비스 워커 캐시 |

## 11. 위험 · 열린 질문 (권고 포함)

| # | 위험·질문 | 권고 |
|---|---|---|
| 1 | 이름 「회랑」 (다른 후보: 「기억의 회랑」 · 「추억의 방」) | **「회랑」** — 두 글자라 타이틀 줄·칩에 맞고, 4장 '대회랑' 과 이어진다. 글자 확인 끝 |
| 2 | 타이틀: '크레딧' 줄을 '회랑' 으로 바꾸고 크레딧을 극장 안으로 vs 9번째 줄 | **바꾼다** — 9줄은 phone2 에서 바닥 안내와 겹친다(§5.7). 9줄을 원하면 `title.js layout` 의 줄 높이를 36 CSS 하한까지 줄이는 별도 작업 + `ach_ui` U1 다시 |
| 3 | 마을 입구: 성당 「여정 기록」 단추 (극장 꺼짐) vs 타이틀만 | **성당 단추를 넣는다** (≈ 20줄) — 이어서 하는 플레이어가 타이틀로 나가지 않아도 된다. 빼려면 church.js 줄만 지우면 끝 |
| 4 | 초상화·보스 회랑 | **넣지 않는다** — 도감 탭이 보스 초상·실시간 렌더를, 동료 탭이 동료를 이미 보여 준다. 다음에 한다면 NPC 7 + 영웅 7 초상만 ('만남' 기록이 없어 합류·대사 깃발로 규칙을 새로 짜야 한다) |
| 5 | 각성 컷인 7장을 그림으로 | **넣는다** ('각성' 칸) — `aw:` 규칙은 업적이 이미 세는 값 + 직업 단계 소급 |
| 6 | 시각화: `AnalyserNode`(audio.js +12줄) vs 박자 막대만 | **AnalyserNode + 박자 막대 대체** — 음악실에 있을 때만 붙고 소리 경로를 바꾸지 않는다. 오디오 파일을 건드리기 싫으면 박자 막대만 (화면 코드 그대로) |
| 7 | 극장 범위: 서막 둘·엔딩 다섯·크레딧 vs 모든 컷신(대본 342개) | **이번엔 8개만** — 대화 대본은 월드·초상 맥락에 기대고, 장면 수가 많아 스포일러·시험 비용이 크다. 다음 묶음에서 '이 그림의 장면 다시 보기'(CG 가 있는 대본 29개)는 같은 `replay` 갈래로 싸게 된다 |
| 8 | 소급이 너그럽다 (장을 깼으면 그 아웃트로·보스 CG, 직업 1단계면 각성 컷인, `start` 면 마을 곡 여덟) | 받아들인다 — 실제로 지나간 장면이다. 바꾸려면 데이터의 `need` 만 |
| 9 | 업데이트 첫날 소급 열림이 모두 NEW (`NEW 40` 쯤) | 받아들인다 (새 기능 안내). 싫으면 `'retro'` 로 연 것의 시각을 1 ms 로 적어 NEW 에서 빼기 |
| 10 | 회랑 업적 ('그림을 모두 모았다' 등) | **넣지 않는다** — 67 고정, `ch_all.n`·점수 합·이명 표가 함께 움직인다 |
| 11 | 서버가 `gal` 을 검사하지 않음 | **그대로** — 모르는 필드 허용 · `cleanGal` 8 KB · 서버 배포가 막혀 있어도 출시 가능. 나중에 `isValidGal` 을 더하면 클라이언트 `GAL_LIMITS` 와 한 표로 |
| 12 | 옛 클라이언트가 낡은 `gal` 을 다시 올림 | 받아들인다 — 다음 동기화의 합집합이 되돌린다 (§2.3) |
| 13 | 다시 보기 중 맨 아래 장면이 `story` 라 클라우드가 지난 `game.state` 슬롯을 '진행 중' 으로 봄 | 받아들인다 — 그 슬롯의 받기만 회랑으로 돌아올 때까지 미뤄진다. 다시 보기는 슬롯을 쓰지 않는다 (§5.5 ③) |
| 14 | 첫 방문 받기 (휴대폰 1.7 MB) · 데이터 절약 모드 | 받아들인다 — 보이는 줄부터, 한 장씩. `saveDataOn()` 이면 썸네일 대신 이름 카드(벡터)로 그리고 크게 볼 때만 받기 |
| 15 | 공유 파일(title · story · ending · church · cloud · audio · main · hook_tags)과 다른 작업(EX4-VERIFY 등)의 충돌 | 줄 몇 개씩 · `[hook:gal]` · ARCHITECTURE 에 적음 · `story.js` `replay` 는 기본값 false 라 기존 흐름 불변 (U7 끝 줄) |
| 16 | 외전이 새 CG·곡을 더하면 표가 낡음 | G1 이 `assets/cg`·`TRACKS`·`index.json` 과 집합 대조로 실패시킨다 — 외전 설계의 할 일 목록에 'gallery.js 한 줄' |

## 12. 통합 기록 (GAL-VERIFY)

| 항목 | 결과 |
|---|---|
| 데이터·엔진·저장·클라우드 (GAL-CORE) | 계약대로. 34 · 44 · 8 이 `assets/cg`·`assets/lo/cg`·`TRACKS`·`index.json` 과 같다 (G1). 소급: 빈 계정 → 저장 0 (곡 2 · 크레딧만) · 아케이드만 한 메타 → `cutin_kael`·`arena`·`gameover` 만 · ch6 → 그림 8 · 곡 19 · v1(옛 모양) → 그림 19 · 곡 30 · p2done → 34 · 41 · 「피의 윤회」 두 번 넘긴 슬롯만 있어도 같은 수 · 1부만 아는 계정(v1, v1 의 회차 슬롯)에 2부 항목 0 (`p2()` 거짓). 장·보스 증거로 연 그림 중 `seenScripts` 에 그 대본이 없는 것은 v1 의 보스 `_pre` 셋(옛 세이브가 보스 대사를 적지 않던 때)과 회차 슬롯뿐 — §11-8 대로. 디버그 부팅(`?scene=gallery`, phone1): 진짜 메타 칸 바이트 그대로, `bloodnocturne_meta_debug` 에만 gal(34장·seenAt). 두 기기(실제 API 핸들러 + 메모리 저장소, Chromium 두 문맥): 가입한 A 가 연 그림과 로그인 전 B 가 연 그림이 양쪽·서버에서 합집합, 같은 그림은 가장 이른 시각, seenAt 은 큰 값. G6 퍼징 gal ≤ 1.4 KB · 상한 8 KB |
| 화면·타이틀·성당·다시 보기 (GAL-UI) | 극장 8개를 desk(키보드)·phone1(터치) 실제 입력으로 끝까지 (슬롯 1–3 = v1 · p2done · ch6, 지난 판 `game.state` = 슬롯 2 + 저장 안 한 깃발): **localStorage 키 전부 · `game.state` · `game.meta` 바이트 같음**, `saves.write`·`saveMeta` 0, 토스트 '획득'·'합류' 0, 화자 카엘, 곡 `sad`/`ending`/`prologue` → `credits` → 회랑 `title`, 언제나 회랑 극장 방으로. 끼어들기: 숨김·돌아옴, `cloud:sync` done, 장면 오류(update 가 한 번 던짐), 건너뛰기(ESC·SKIP 단추) — 모두 같은 결과. 다시 보기 중 `cloud.activeSlot()` = 지난 판의 슬롯 2 (§11-13 대로 그 슬롯 받기만 미룸). 보통 흐름 그대로: 지도 → 7장 인트로 → 스테이지 → 결과 → 아웃트로 → 마을 · 12장 아웃트로 → 노멀 엔딩 → `ending_normal` → 크레딧(fromEnding) → 마을 — `replay` 거짓, seenScripts·깃발(`alberto_confessed`·`ending_normal`)·슬롯 쓰기·`endingsSeen` 그대로, 회랑이 그 자리에서 `s07`·`sad`·`cg_castle_collapse`·극장 Ⅱ 를 연다. 타이틀 8줄(8번째 회랑, 크레딧 → 7), 성당 단추 둘(극장 꺼짐), 업적 화면 코드 변경 0 |
| 고친 결함 | ① **중** `game/gallery.js` — 극장 서막·제2부 서막(과 슬롯 깃발로만 열린 엔딩)이 슬롯을 지우면 다시 잠겼다 (증거를 슬롯에서만 읽음, §0 '내려가지 않는다'·§2.1 '서막은 그 CG' 위반). `thOpen`: 증거 또는 그 줄의 CG(`bg`)가 걸렸으면 열림 (없는 gal 은 만들지 않음). G3 새 단언(슬롯 삭제 뒤 극장 그대로) 고정 세이브 셋 실패 → 통과. ② **낮음** `game/gallery.js` — 클라우드 병합(applyMeta)으로 다른 기기의 열림·seenAt 이 들어와도 `rev` 가 그대로라 열려 있는 회랑이 다시 읽지 않았다. `touchGal()`: gal 수·seenAt 표시가 바뀌면 rev +1. G4 새 단언 실패(10 → 10) → 통과. ③ **중(UX)** `front/gallery.js update` — 대사를 연타로 넘기면 다시 보기가 끝나 돌아오는 암전(0.9초) 동안의 결정 키·탭이 같은 극장 줄을 다시 틀었다 (연타 시험 desk 3/3 · phone1 2/3 재진입). 밝아지는 동안(`fade.dir < 0`) 입력을 받지 않음 → 0/3 · 0/3. U7 새 사례 실패(키 1번에 재진입) → 통과 (키 6번에도 회랑) |
| 실제 흐름 (§9.4) | 고정 세이브 셋 → 타이틀 `NEW n` (p2done 75 = 그림 34 + 곡 41 · v1 49 · ch6 27 — §11-9 대로 첫날 모두 NEW) → 회랑 수가 G3 집합과 같음 → 그림 넘겨 보기 · 곡 듣기(합성 배지·녹음 흉내 배지, U6) · 엔딩 Ⅲ 다시 보기 → 슬롯 바이트 그대로 → 「피의 윤회」로 넘긴 뒤에도 수가 줄지 않음 (G3·위 소급) → 두 기기 합치기 합집합 (위). 회랑을 닫으면 NEW 0 (U2) |
| 메모리·성능 | phone1(medium, lo): 아틀라스 한 장 2.92 MB (≤ 3.0) · 크게 보기 중 디코딩 CG 최대 2 (lo) · 34장을 앞뒤로 세 바퀴: 디코딩 25.68 → 25.68 → 25.68 MB, 힙(GC 뒤) 9.20 → 9.17 → 9.24 MB · 회랑 10번 열고 닫기(방 셋) 뒤 타이틀: 캔버스 풀 40 → 40, 회랑 cg/ 0, analyser 떨어짐, 힙 +1.2 MB(지연 모듈) · U9 phone1 그리기 p95 목록 0.9 · 크게 보기 0.4 · 음악실 1.2 · 극장 1.0 ms. 업적 U10(GAL-UI 때 부하 9.6 에서 실패): 조용한 기계(부하 ≈ 1.3)에서 3번 통과 (pick p95 2.0–2.3 ms), 같은 기계에서 회랑 이전 트리(fda73d6)와 번갈아 3번씩 — 이전 pick 3.2 · 2.0 · 2.9 ms, 지금 2.5 · 2.5 · 2.8 ms → **회랑 회귀 아님** (pick 모달이 예전부터 3 ms 예산 가장자리 — 업적 화면 그리기 경로에 회랑 코드 없음) |
| 시험 | `test_gallery --ui` 182/0 (단위 181 · UI 127) · `test_achievements` 261/0 · `--ui` 262/0 · `qa/ach_ui` 101/0 (U10 따로 3/3) · `test_ngplus --browser --ui` 180/0 · `test_part2` 278/278 · `test_save_v2` 80/0 · `test:client` 12/0 · `test:api` 67/0 (건너뜀 10) · `test:online` 25/0 (건너뜀 5) · `integration` 59/59 · `--mobile` 59/59 · `hook_tags` 0 실패(경고 1 = 예전 art-boss 표식), `--update` 로 gal 42 묶음 · 검증용 탐침(scratch): 다시 보기 바이트 desk 9/9 · phone1 9/9, 연타 재진입 0/3 · 0/3, 보통 흐름 2/2, 두 기기 5/5, 디버그 부팅 1/1, 메모리 4/4. U4 phone2 cg-scrolled 가 부하 중 한 번 겹침 20(스크롤 애니메이션 도중 감사) — 따로 2번 · 전체 다시 통과 |
| 글꼴 | 새 문장 글자 410자 모두 `noto-sans-kr` 에 있음 (`✕✦` 는 타이틀의 예전 글자). `「」`·`Ⅰ–Ⅴ` 는 Hahmlet 에 없어 `FONT.title`·`FONT.logo` 에서 대체 글꼴로 — `ending.js` 의 엔딩 이름·제목과 같음. `build_fonts.py --check` 통과, 첫 화면 글꼴 470.1 / 500 KB 그대로 |
| 예산 | scratch 웹 빌드: **lo 그림 단계 45.94 MiB** (48,171,518 B — 목표 46.00 · 상한 46.40 안) · 첫 화면 brotli 0.69 MB (720,936 B / 1.60) · JS 조각 8 · 사이트 1,497 파일 59.85 MB. 아티팩트(scratch): 258 / 511 파일, 60.64 MB, 팩 20 / 40, **올리기 2번 (255 + 3)** — 이전 계획 256 (255 + 1), 늘어난 2 파일은 회랑 밖 (`assets/painted/bosses/b_hagen·b_bride/manifest.json` — 외전 23·24 보스, 조각 8개는 이름만 바뀜). `dist/artifact_publish.json` 바이트 그대로 되돌림, scratch 빌드 지움 |
| 설계와 다른 점 | 극장 줄 열림 = 증거 **또는 그 줄의 CG** (§2.1 문장 그대로 구현 — 엔딩 Ⅰ·Ⅳ·Ⅴ 도 그 CG 로 남는다). 회랑은 돌아오는 암전이 걷힐 때까지 입력을 받지 않는다. 시험 `metaOf` 는 슬롯의 `ending_*` 깃발도 `endingsSeen` 으로 본다 (엔딩 장면이 둘을 함께 적는다 — 옛 v1 은 깃발만) |
| 남은 것 | 없음 — 둘 다 CROSS-QA-2 (2026-10-06) 가 고침. ① 분석기: `core/audio.js analyser()` 가 분석기 → 음량 0 게인 → `ctx.destination` 으로 잇는다 (목적지로 이어지지 않은 AnalyserNode 를 처리하지 않는 WebKit 대비; `analyser(false)` 가 세 줄 모두 끊는다). 증명 `/tmp/claude-0/crossqa2/analyser_probe.mjs`: 노드 연결 기록으로 분석기 → 목적지 길 없음(고치기 전) → 있음, OfflineAudioContext 에서 같은 `analyser` 메서드를 켠 렌더와 끈 렌더가 표본까지 같음(최대 |Δ| 0), Chromium 막대 > 0 그대로. ② 회랑이 열린 채 클라우드가 지난 `game.state` 와 같은 슬롯을 받으면: `game/gallery.js` — `rescan('cloud')` 는 지금 슬롯도 저장소에서 다시 읽고, 판정 문맥은 저장된 슬롯 요약에 지금 `game.state` 요약을 더한다(합집합 — 거두는 일이 없으므로 증거만 는다). 시험 `test_gallery` G4 한 줄 (고치기 전 30/31 → 31/31) |
