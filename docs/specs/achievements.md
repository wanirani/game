# 업적 「사냥의 기록」 — 설계 계약

> **상태: 설계 승인 (리드, 2026-10-06) — 구현 중.** 리드 확정: 67개 · 이명(‘칭호’ 대신, 새 글자 없음) · 온라인 이명 최소안(서버 화이트리스트) · 타이틀 8번째 줄 + 기록 탭 [설정 | 업적]. 구현은 ACH-CORE(데이터·엔진·저장·클라우드·서버·시험)와 ACH-UI(화면·알림·메달·타이틀·순위표 표시·시험) 둘이 나눠 맡는다. 결과는 §14 에 적는다.

리드가 정할 설계. **굵은 항목**은 바꾸지 않는다. 바꿀 이유가 생기면 `/tmp/claude-0/plan/ach_requests.md` 에 `[보낸이→받는이] 내용` 한 줄로 적는다.
비용 원칙: **새 그림(Kling)·새 소리·새 글자 없음**. 메달은 절차적 벡터, 알림은 기존 토스트, 타이틀 장식은 기존 `Ambience` 의 색·수 조정. 보상은 **꾸미기(이명·타이틀 장식)와 작은 골드·소모품** 뿐 — 능력치를 올리는 보상은 없다.

## 0. 왜, 그리고 무엇을 하지 않는가

- `core/events.js` 머리말은 "퀘스트/점수/업적 등이 게임 이벤트를 구독한다"고 적고 있지만 업적은 없다. 22 스테이지 · 22 보스 · 영웅 7 · 동료 22 · 아케이드 4 모드 · 여관 놀이 5 를 다 끝낸 플레이어에게 남는 목표가 없다.
- 업적은 **계정(메타) 단위**다. 슬롯 셋 중 어디서 했든, 어느 기기에서 했든 한 번 얻으면 영원히 남는다 (`game.meta` — 이미 `unlockedChars`·`endingsSeen`·아케이드 기록이 사는 곳, 로그인하면 클라우드로 합쳐진다).
- **옛 플레이어를 벌하지 않는다**: 세이브·메타에서 알아낼 수 있는 조건은 불러올 때 소급해서 준다 (§3.4). 알아낼 수 없는 것(각성기 시전·스타일 랭크·무피해 보스·오늘의 도전)은 지금부터 센다.
- 하지 않는 것: 새 메뉴 탭(업적은 슬롯 없이 타이틀에서도 열려야 해서 어차피 독립 장면이 필요하고, 탭 11개면 가장 좁은 지원 화면에서 탭 폭이 44 CSS px 하한에 닿는다 — §7.6), 마을(허브) 장식(슬롯마다 다른 월드 장면이고 그림·성능 검증이 필요하다 — 타이틀 장식만 둔다), 업적 통계 보내기(익명 통계 허용 목록을 늘리지 않는다), 서버가 업적 달성을 검증하는 일(할 수 없다 — §8).

## 1. 개요

| 항목 | 값 |
|---|---|
| 업적 수 | **67개**, 분류 8 (아래), 숨김 7 (모두 '숨겨진' 분류). 업적 점수 합 **1,630** |
| 분류 (`cat`) | **`story` 이야기 11 · `combat` 전투 7 · `hero` 영웅 7 · `companion` 동료 7 · `collect` 수집 9 · `arcade` 아케이드 10 (여관 놀이 포함) · `challenge` 도전 9 · `secret` 숨겨진 7** |
| 점수 (`pts`) | 10 · 20 · 30 · 50 · 100(마지막 하나). 메달 색: 10 청동 · 20 은 · 30 금 · 50 핏빛 · 100 백금 |
| 보상 | 이명 17 (순위표 별명 옆) · 타이틀 장식 5 · 정한 골드·소모품 12 · 나머지 34개는 기본 골드 `pts × 25` (§5) |
| 저장 | **`game.meta.ach`** (`v: 1`), 필드가 없으면 만든다. 클라우드 병합은 **합집합 + 가장 이른 시각** (§2) |
| 서버 | `validate.mts isValidMeta` 가 `ach` 모양·크기(≤ 24 KB)를 검사. 업적 id 목록 검사는 하지 않는다 (§2.4) |
| 온라인 이명 | **한다 — 고정 목록(화이트리스트) id 만** 런 제출에 실어 보내고 서버가 목록 밖은 버린다 (§8) |
| 화면 | 새 프런트 장면 **`achievements`** — 타이틀 메뉴 '업적' · 인게임 메뉴 '기록' 탭의 '업적' 단추에서 연다 (§7) |
| 알림 | 기존 `game.toast` 를 쓰되 보스전·컷신·엔딩 동안 미룬다. 소급 달성은 한 줄 요약 (§6) |
| 이벤트 | 새 `achievementUnlocked {ids, src}` 하나 + 기존 이벤트 셋에 필드 몇 개 (§9) |
| 글꼴 | 새 한글 **0자** (모든 문장을 지금 기본 글꼴 파일로 확인 — §10). '칭호'의 '칭', '깬' 은 글꼴에 없어 **'이명'** 과 다른 말로 썼다 |
| 예산 | 코드만 ≈ +70 KB (원문) · 그림 0 → APK lo 그림 단계 **45.33 → ≈ 45.40 MiB (상한 45.8)** |

## 2. 저장 — `meta.ach`

### 2.1 모양 (v1)

```js
meta.ach = {
  v: 1,                                   // 판. 더 큰 판을 만나도 아는 필드만 읽고 나머지는 그대로 둔다 (낮추지 않는다)
  got: { st_s01: 1759700000000, … },      // 업적 id → 처음 얻은 시각 (ms epoch). 지우지 않는다
  prog: { kills: 1234, style: 5, aw_lia: 1, daily_n: 2, daily_last: 20261006, … },   // 세이브에서 알 수 없는 누적값 (§3.3 표의 키만)
  claimed: ['st_s01', …],                 // 골드·소모품 보상을 받은 업적 (계정에 한 번)
  seenAt: 1759712000000,                  // 업적 화면을 마지막으로 닫은 시각 → got[id] > seenAt 이면 NEW
  title: 't_dawn' | null,                 // 고른 이명 (달성한 것만 유효 — 엔진이 읽을 때 확인)
  deco: 'd_gold' | null,                  // 고른 타이틀 장식
}
```

- 키 규칙 (got·prog·claimed·title·deco 모두): **`/^[a-z][a-z0-9_]{1,31}$/`**. 이명 id 는 `t_` · 장식 id 는 `d_` 로 시작한다.
- 상한: got ≤ 256 키 · prog ≤ 128 키 · claimed ≤ 256 · got 값 0 ≤ v ≤ 1e13 · prog 값 0 ≤ v ≤ 1e9 · seenAt 0 ≤ v ≤ 1e13 · **`JSON.stringify(ach).length ≤ 24 KB`**. 지금 설계의 최대 크기 ≈ 4 KB (got 67 + prog 25 + claimed 67).
- 비밀 없음: 토큰·아이디·기기 번호를 넣지 않는다 (익명 통계 설치 번호도 넣지 않는다 — TELEMETRY.md §1 과 같은 이유).

### 2.2 만들기·이관 (`src/core/ach_meta.js`, 순수 함수, 데이터 import 없음 — 첫 조각에 실린다)

| 함수 | 계약 |
|---|---|
| `ensureAch(meta) → ach` | `meta.ach` 가 객체가 아니면 `{v:1, got:{}, prog:{}, claimed:[], seenAt:0, title:null, deco:null}` 를 만든다. 객체면 제자리에서 고친다: 키 규칙·값 범위 밖 항목을 버리고, 빠진 필드를 채운다. **모르는 필드는 남긴다.** 멱등. 던지지 않는다 |
| `mergeAch(a, b) → ach` | a = 이 기기, b = 서버. `got`: 두 쪽 키의 합집합, 값은 유효한 것 중 **작은 값(가장 이른 시각)** · `prog`: 키마다 큰 값 · `claimed`: 합집합 · `seenAt`: 큰 값 · `v`: 큰 값 · `title`/`deco`: a 가 문자열이면 a, 아니면 b (달성 여부는 엔진이 읽을 때 확인) · 모르는 필드: `{...b, ...a}` (mergeMeta 와 같은 규칙). 교환·결합·멱등 (`got` 기준) |
| `cleanAch(ach) → ach` | 올리기 전 서버 검사(§2.4)를 반드시 통과하는 사본: 키 규칙·범위 밖 버림 → 상한을 넘으면 키 순서대로 자름 → 24 KB 를 넘으면 모르는 필드부터 버린다. 결과는 늘 `isValidAch` 참 (시험 C6) |
| `ACH_TITLES` | 이명 표 `{ t_dawn: { name: '새벽을 연 자' }, … }` (17개, §5.1). 순위표(`highscore.js`)·서버 사본(`gamedata.mts TITLE_IDS`)이 읽는다 |
| `ACH_DECOS` | 타이틀 장식 표 `{ d_gold: { name: '황금 불씨', amb: { emberColor: '#ffd070' } }, … }` (5개, §5.2). `title.js` 가 읽는다 |
| `ACH_KEY_RE` · `ACH_LIMITS` | 위 규칙·상한 (서버 `config.mts ACH` 와 같은 숫자 — 시험이 대조) |

- **`core/save.js` 의 `DEFAULT_META` 는 바꾸지 않는다** — `ensureAch` 가 처음 쓸 때 만든다 (save.js 를 건드리지 않아 옛 경로·`test_save_v2` 에 영향이 없다). `loadMeta()` 는 `{...DEFAULT_META, ...m}` 이라 `ach` 를 그대로 싣는다.
- 엔진은 **`game.meta.ach` 를 변수에 붙잡아 두지 않는다** — `cloud.applyMeta` 가 필드를 통째로 바꿔 끼운다. 쓸 때마다 `ensureAch(game.meta)`.

### 2.3 클라우드 (`src/core/cloud.js`)

- `mergeMeta(a, b)` 끝에: `if (isObj(a.ach) || isObj(b.ach)) out.ach = mergeAch(a.ach, b.ach);` (한쪽만 있으면 그것을 `ensureAch` 한 사본).
- `cleanMeta(m)`: `if ('ach' in o) o.ach = isObj(o.ach) ? cleanAch(o.ach) : null;` — `metaHash` 도 이것을 거치므로 해시가 안정적이다. 56 KB 줄이기 규칙(명예의 전당 40개로)은 그대로, `ach` 는 줄이지 않는다 (cleanAch 가 이미 24 KB 이하).
- 받은 메타에서 새로 생긴 달성(다른 기기에서 얻은 것)은 `got` 에 이미 있으므로 알림 없이 들어온다. 받은 메타로 **새로 성립한 조건**(예: 다른 기기가 옛 클라이언트라 `got` 없이 `endingsSeen` 만 올렸다)은 `cloud:sync` 끝에서 엔진이 다시 훑어 소급으로 준다 (§3.4, 알림은 요약).
- 옛 클라이언트와 섞일 때: 옛 `mergeMeta` 는 `{...b, ...a}` 라 **자기 쪽에 `ach` 가 없으면 서버 것을 지우지 않는다**. 옛 클라이언트가 예전에 받아 둔 오래된 `ach` 를 다시 올리면 다른 기기의 새 달성이 서버에서 잠시 빠질 수 있다 → 새 클라이언트가 다음 동기화에서 자기 것과 합쳐 되돌린다 (위험 §13-2).

### 2.4 서버 (`netlify/lib/validate.mts`, `config.mts`)

```ts
// config.mts
export const ACH = { maxBytes: 24 * 1024, gotMax: 256, progMax: 128, claimedMax: 256, keyRe: /^[a-z][a-z0-9_]{1,31}$/ } as const;
// validate.mts — isValidMeta 안에 한 줄: if ('ach' in m && m.ach !== null && !isValidAch(m.ach)) return false;
export function isValidAch(a: any): boolean   // isObj · JSON 길이 ≤ maxBytes · v(있으면) 1..99 정수 ·
// got: 객체, 키 ≤ gotMax, 키 규칙, 값 0..1e13 유한수 · prog: 객체, 키 ≤ progMax, 키 규칙, 값 0..1e9 유한수 ·
// claimed: 문자열 배열 ≤ claimedMax, 각 키 규칙 · seenAt(있으면) 0..1e13 · title/deco(있으면) null 또는 키 규칙 문자열. 모르는 필드는 허용
```

- 깊이·`__proto__` 는 기존 `safeTree(DATA_MAX_DEPTH)` 가 먼저 본다. 본문 한도 `BODY_LIMIT.meta` 64 KB 그대로.
- **업적 id 화이트리스트는 서버에 두지 않는다** — 서버는 달성을 검증할 수 없고, 업적을 더할 때마다 서버 배포가 필요해진다. 공개되는 것(이명)만 화이트리스트로 막는다 (§8).
- **클라이언트 `cleanAch` 와 서버 `isValidAch` 가 어긋나면 메타 동기화 전체가 `invalid_meta` 로 멈춘다** — 그래서 두 쪽 숫자는 한 표(`ACH_LIMITS` = `config.mts ACH`)이고, 시험 C6 이 퍼징으로 대조한다.

## 3. 엔진 — `src/game/achievements.js` (ACH-CORE)

### 3.1 입구

- `main.js` `loadRest` 에 (**정적 import 금지, 실패해도 게임이 멈추지 않게**):
  `import('./game/achievements.js').then((A) => A.initAchievements(g)).catch((e) => console.warn('[ach]', e));` 와 같은 줄로 `import('./game/ach_notify.js').then((N) => N.initAchNotify(g)).catch(…)` (알림은 ACH-UI 파일 — 아직 없어도 부팅은 그대로).
- `initAchievements(game)` (한 번만) → **`game.ach`** 를 만들고 버스·`saves.onWrite` 를 구독, 한가할 때(`requestIdleCallback`, 없으면 1.2초 뒤) 첫 소급 훑기 (§3.4).

### 3.2 공개 API (`game.ach`, ACH-UI 가 이것만 쓴다)

```js
game.ach = {
  defs,                                     // ACHIEVEMENTS (data/achievements.js, 데이터 순서 = 표시 순서)
  status(id) → { got: ts|null, cur, need, bar: bool, isNew, claimable, hiddenLocked },
  list(cat = 'all') → [{ def, ...status(def.id) }],
  summary() → { got, total, pts, ptsMax, byCat: { [cat]: { got, total } }, unseen, claimable },
  titles() → [{ id, name, got: bool, from: achId }] · title() → id|null (달성한 것만) · setTitle(id|null) → bool,
  decos() → [{ id, name, got, from }] · deco() → id|null · setDeco(id|null) → bool,
  canClaim(state = game.state) → { ok, reason },        // reason: 'no_slot' | 'arcade' | 'not_town' | 'none'
  claimAll(state = game.state) → { gold, items: [{ id, qty, name }], queued, ids } | null,
  markSeen(),                               // seenAt = now → saveMeta (화면을 닫을 때)
  rescan(src = 'retro'),                    // 메타 + 슬롯 셋을 다시 읽어 훑기
  _grant(id, src = 'live'),                 // 시험·?debug 전용 (조건 없이 달성)
};
// 순수 export (node 시험용, DOM 없음): digestState(state) · metric(m, arg, ctx) · evaluate(def, ctx) · scanDefs(ctx) · ACH_EVENTS
```

- 달성하면: `got[id] = Date.now()` → 같은 처리에서 생긴 달성을 모아 **버스 `achievementUnlocked {ids, src}` 한 번** → `saves.saveMeta(game.meta)` 한 번 (자기 쓰기로 생긴 `onWrite('meta')` 는 무시 — 깃발 `writing`). `src`: `'live'` 게임 중 사건 · `'retro'` 부팅 훑기 · `'cloud'` 동기화 뒤 훑기.
- **거두지 않는다**: 조건이 다시 거짓이 되어도(슬롯 삭제 등) `got` 은 남는다.
- `ch_all` 은 다른 업적이 달성될 때마다 마지막에 본다.
- `claimAll`: `canClaim` 이 참일 때만 — **슬롯 세이브가 있고(`state.slot` 1–3) · 아케이드 임시 세이브가 아니고(`!state.arcade`) · 마을(`game.world?.mode === 'town'`)일 때**. 스테이지 안에서 받으면 저장하지 않고 나갈 때 보상만 사라지고 `claimed` 는 남기 때문이다. 골드는 `state.gold +=`, 아이템은 `inventory.grantItem(state, id, qty)` (가방이 가득이면 보관함 — `queued`), 그다음 `saves.write(state.slot, state)` → `claimed` 추가 → `saveMeta`.
- `prog` 는 메모리에서 바로 늘리고, 저장은 드물게: 달성 · `stageCleared` · `arcadeFinished` · 스토리 `bossKilled` · `visibilitychange → hidden` · 받기·이명·장식·`markSeen`. (메타 저장은 로그인 중이면 클라우드 올리기를 부른다 — 처치마다 저장하지 않는다.)

### 3.3 지표 (`metric(m, arg, ctx)`) — 조건은 모두 `{ m, arg?, n }` 이고 **`metric ≥ n` 이면 달성**

`ctx = { meta, ach, slots }`. `slots` = 슬롯 1–3 의 **요약(digest)** — 저장된 세이브를 읽은 것 + 지금 `game.state` 가 그 슬롯이면 그것의 실시간 요약으로 바꿔 낀다. **`state.arcade` 인 임시 세이브(아케이드·연습·일일)는 요약하지 않는다** (연습에서 쓰러뜨린 보스가 스토리 업적이 되지 않게). "합"은 슬롯을 합친 값, "최대"는 슬롯 중 큰 값.

`digestState(state)` (순수, 손상 세이브에도 던지지 않는다, 원본을 바꾸지 않는다): `cleared{sid:{rank,time}}` · `bosses` · `flags`(ending_* · ex_*_done · isolde_joined 등 필요한 것) · `difficulty` · `heroes{charId:{level,tier}}` (`CLASSES[classId].tier`) · `joined` (`storyJoinedChars(state)`) · `owned{id:{lv,bond,src}}` (`state.companions.owned`) · `docs` · `relics` · `hearts` · `shards` · `secrets` · `bestiary`(키, `ENEMIES` 에 있는 것만) · `questsDone` · `stats{kills,deaths,maxCombo,minigameWins}` · `inn{jackpots,duelRank,catGift}` (`state.innGames`) · `enhance`(가방 장비의 최대 `level`).

| m | arg | 값 | 소급 | 실시간 계기 (이 이벤트 뒤에 그 지표를 쓰는 업적만 다시 본다) |
|---|---|---|---|---|
| `cleared` | sid[] | arg 중 어느 슬롯에서든 `progress.cleared[sid]` 가 있는 수 | ✓ | `stageCleared` · 슬롯 쓰기 |
| `boss` | bossId | 어느 슬롯의 `progress.bosses` 에 있으면 1 | ✓ | `bossKilled`(mode story) · 슬롯 쓰기 |
| `ending` | kind[] | arg 중 `meta.endingsSeen` 에 있는 수 | ✓ | 메타 쓰기 (`ending.js` 의 saveMeta) |
| `kills` | – | max(`prog.kills`, 합 `stats.kills`) | ✓ | `enemyKilled` (byPlayer, 모든 모드) → `prog.kills++` |
| `combo` | – | max(`prog.combo`, 최대 `stats.maxCombo`) | ✓ | `comboMilestone {n}` → `prog.combo = max` |
| `style` | – | `prog.style` (D=1 … SSS=7) | ✗ | `styleRankUp {r}` |
| `nodmg` | bossId? | 인자 없음: `prog.nodmg` (무피해 보스 처치 수) · 있음: `prog.nd_<bossId>` | ✗ | `bossStarted` → (`playerHurt`·`playerDied` 없음, `world.run.damageTaken` 그대로) → 같은 id 의 `bossKilled` (mode story·practice) |
| `tier` | – | 최대 영웅 직업 단계 | ✓ | `classChanged` |
| `tier2all` | – | `CHAR_ORDER` 중 (슬롯 상관없이) 직업 단계 2 에 이른 영웅 수 | ✓ | `classChanged` |
| `heroes` | – | `CHAR_ORDER` ∩ (`meta.unlockedChars` ∪ 슬롯들의 `joined`) 의 수. **`meta.konami` 이면 `unlockedChars` 대신 시작 영웅 4 + `joined`** (비밀 코드는 모든 헌터를 메타에 넣는다 — `title.js unlockAll`) | ✓ | 메타 쓰기 · 슬롯 쓰기 |
| `level` | – | 최대 영웅 레벨 | ✓ | `levelUp` |
| `awaken` | – | `prog.aw_<charId>` 가 1 인 영웅 수 | ✗ | `awakenCast {charId}` |
| `awaken2` | – | `prog.aw2` | ✗ | `awakenCast {tier ≥ 2}` |
| `cmpAny` · `mounts` · `guards` | – | 슬롯들의 `owned` 합집합 수 (`MOUNTS`·`GUARDIANS` 키로 거름) | ✓ | `companionUnlocked` |
| `ride` | – | `prog.ride` | ✗ | `mounted` |
| `egg` | – | `owned` 중 `src === 'egg'` 가 있으면 1, 또는 `prog.egg` | ✓ | `eggHatched` |
| `bond` | – | 최대 `bondRank(owned.bond)` (0–5) | ✓ | `bondUp` |
| `cmpLv` | – | 최대 `owned.lv` | ✓ | `companionLevelUp` |
| `relics` | – | 최대 (`progress.relics` ∩ `k_relic_1…5`) 수, `flags.relics_all` 이면 5 | ✓ | `relicFound` |
| `otherworld` | – | 최대 min(`hearts` 수, `shards` 수) (둘 다 6 이어야 6) | ✓ | `heartFound` · `shardFound` |
| `docs` | – | 합집합 (`progress.docs` ∩ `DOCS`) 수 (전체 27) | ✓ | `docFound` |
| `bestiary` | – | 합집합 (`state.bestiary` 키 ∩ `ENEMIES`) 수 — 처치마다 캐시 집합에 더한다 | ✓ | `enemyKilled` |
| `secrets` | – | 최대 (`progress.secrets` 중복 없는 수) | ✓ | `secretFound` |
| `enhance` | – | max(`prog.enh`, 최대 장비 `level`) | ✓ | `enhance {success, level}` |
| `quests` | – | 합집합 `quests.done` 수 | ✓ | `questClaimed` |
| `rush` | course[] | arg 중 `meta.bossRushBests[c].time > 0` 인 코스 수 (`'any'` = 어느 코스든; 옛 `bossRushBest` 도 `bossRushBests()` 규칙대로 본다) | ✓ | 메타 쓰기 (`ArcadeResultsScene.enter`) |
| `survival` | – | `meta.survivalBest` | ✓ | 메타 쓰기 |
| `tower` | – | 최대 `meta.towerBest[diff].floor` | ✓ | 메타 쓰기 |
| `daily` | – | `prog.daily_n` (서로 다른 날 수) | ✗ | `arcadeFinished {kind:'practice', daily:'YYYYMMDD', cleared:true}` — `daily` 를 숫자로 바꿔 `prog.daily_last` 보다 크면 `daily_n++`, `daily_last` 갱신 |
| `rushPerfect` | – | `prog.rush_perfect` | ✗ | `arcadeFinished {kind:'bossrush', cleared:true, extra:{perfect, total}}` 에서 `perfect === total` |
| `mgWins` | – | max(`prog.mg_win`, 최대 `stats.minigameWins`) | ✓ | `minigame {win}` |
| `jackpot` | – | max(`prog.jackpot`, 최대 `innGames.jackpots`) | ✓ | `minigame {reward.tier:'jackpot'}` |
| `duel` | – | 최대 `innGames.duelRank` (결투자 5 — `duel.js FOES`) | ✓ | 슬롯 쓰기 (결투 뒤 자동 저장) |
| `rankS` | sid[] | arg 중 (슬롯 중 가장 좋은 랭크가) `'S'` 인 스테이지 수 | ✓ | `stageCleared` |
| `nodmgStage` | – | `prog.nodmg_stage` | ✗ | `stageCleared {noDamage:true}` |
| `speed` | – | 어느 슬롯이든 `cleared[sid].time ≤ STAGES[sid].parTime × 0.5` 인 스테이지가 있으면 1 | ✓ | `stageCleared` |
| `diffEnding` | `{diffs, part}` | 어느 슬롯이든 `difficulty ∈ diffs` 이고 part 1: `flags.ending_normal \|\| flags.ending_true \|\| cleared.s13` · part 2: `flags.ending_p2 \|\| flags.ending_p2true \|\| cleared.s20` 이면 1 (`cleared` 대체는 엔딩 깃발이 생기기 전 세이브용 — s13 클리어는 늘 트루 엔딩, s20 은 늘 2부 엔딩, `ending.js decideEnding`) | ✓ | 슬롯 쓰기 (`ending.js` 가 슬롯을 저장한다) |
| `heroBoss` | `{boss, char}` | `prog.hb_<char>_<boss 의 b_ 뒤>` | ✗ | `bossKilled {bossId, charId, mode:'story'}` |
| `konami` | – | `meta.konami ? 1 : 0` | ✓ | 메타 쓰기 |
| `deaths` | – | max(`prog.deaths`, 최대 `stats.deaths`) | ✓ | `playerDied` |
| `cat` | – | 어느 슬롯이든 `innGames.catGift` 면 1 | ✓ | 슬롯 쓰기 |
| `all` | – | `ch_all` 을 뺀 달성 수 | – | 다른 달성 뒤 |

- `prog` 키 (25개): `kills combo style nodmg nd_b_dracula aw_kael aw_sera aw_victor aw_bran aw_lia aw_azel aw_isolde aw2 ride egg enh daily_n daily_last rush_perfect mg_win jackpot nodmg_stage hb_lia_nemain hb_isolde_argen deaths`. 새 키를 쓰면 이 목록과 시험 C1 에 적는다.
- **진행 막대**(`bar: true`)는 셀 수 있는 지표에서 `n > 1` 일 때만: `kills combo tier2all heroes awaken mounts guards bond cmpLv otherworld docs bestiary secrets enhance quests survival tower daily mgWins duel rankS nodmg deaths all`. `cur` 는 `min(metric, n)`.
- 회차: 요약은 `ng.past` 를 가상 슬롯으로 함께 읽는다 — ngplus.md §6 (`digestState(state).past` = 지난 회차의 진행만, 영웅·통계·동료·가방은 비어 있고 난이도는 `past.diff`; `ctx.slots` 에 따로 한 칸이라 회차를 넘겨도 지표가 줄지 않고 `diffEnding` 은 그 회차의 난이도로만 선다 · 시험 C9).
- 성능: `enemyKilled` 처리는 상수 시간(카운터·캐시 집합)만 — 휴대폰 ≤ 0.02 ms. 세이브 전체 요약은 드문 이벤트 뒤 `setTimeout(0)` 로 미뤄 한 번 (요약 한 번 ≤ 2 ms 휴대폰). 부팅 훑기는 한가할 때 (슬롯 셋 JSON 읽기 ≈ 5–15 ms).

### 3.4 소급 (옛 플레이어)

- 부팅: `initAchievements` 뒤 한가할 때 `rescan('retro')` — 메타 + `saves.read(1..3)` 요약으로 모든 정의를 본다. 처음 업적이 생긴 판으로 실행한 옛 플레이어는 이때 소급분을 한꺼번에 받고, 알림은 **요약 한 줄** (§6).
- 클라우드: `cloud:sync {phase:'done'}` 뒤 `rescan('cloud')` (받은 슬롯은 `saves.store` 라 `onWrite` 가 오지 않는다).
- 슬롯 쓰기: `saves.onWrite({type:'write', slot})` → 그 슬롯만 다시 요약 → `'live'` 로 판정 (엔딩·결투·자동 저장 뒤의 조건). `type:'remove'` → 요약만 버린다(달성은 남는다). `type:'meta'` → 메타 지표만 (`ending rush survival tower konami heroes`), 동기화 중(`cloud:sync start` ~ `done`)이면 `'cloud'`.
- 소급할 수 없는 업적(✗ 표시 12개)은 설명 옆에 아무것도 붙이지 않는다 — 그냥 지금부터 센다.

## 4. 업적 목록 (`src/data/achievements.js`)

데이터 한 줄의 모양 (보상 `reward` 가 없으면 기본 골드 `pts × 25`, §5.3):

```js
export const ACH_CATS = [
  { id: 'story', name: '이야기', glyph: 'book' }, { id: 'combat', name: '전투', glyph: 'sword' }, { id: 'hero', name: '영웅', glyph: 'crown' },
  { id: 'companion', name: '동료', glyph: 'paw' }, { id: 'collect', name: '수집', glyph: 'bag' }, { id: 'arcade', name: '아케이드', glyph: 'star' },
  { id: 'challenge', name: '도전', glyph: 'skull' }, { id: 'secret', name: '숨겨진', glyph: 'eye' },
];   // glyph = scenes/menu/common.js glyph() 이름 (새 모양 없음)
export const ACHIEVEMENTS = [
  { id: 'st_s01', cat: 'story', name: '첫 사냥', desc: '1장 「불타는 마을」을 클리어한다', pts: 10, cond: { m: 'cleared', arg: ['s01'], n: 1 }, reward: { items: [{ id: 'c_potion', qty: 3 }] } },
  // …
];
```

이름·설명은 **아래 표 그대로** (글꼴 확인을 마친 문장 — 바꾸면 §10 검사를 다시 한다). 조건 열의 `m(arg) ≥ n`. 소급 ✓/✗ 는 §3.3.

### 4.1 이야기 `story` (11)

| id | 이름 | 설명 | 조건 | 소급 | 점수 | 보상 |
|---|---|---|---|---|---|---|
| `st_s01` | 첫 사냥 | 1장 「불타는 마을」을 클리어한다 | `cleared([s01]) ≥ 1` | ✓ | 10 | 회복 물약 ×3 |
| `st_s02` | 까마귀와 함께 | 2장 「안개의 묘지」를 클리어해 리아를 동료로 맞는다 | `cleared([s02]) ≥ 1` | ✓ | 10 | 300 G |
| `st_dracula` | 백작의 몰락 | 드라큘라 백작을 쓰러뜨린다 | `boss(b_dracula) ≥ 1` | ✓ | 20 | (기본 500 G) |
| `st_end1` | 백 년의 새벽 | 1부의 엔딩을 본다 | `ending([normal, true]) ≥ 1` | ✓ | 20 | 이명 「새벽을 연 자」 |
| `st_true1` | 영원한 새벽 | 1부의 트루 엔딩을 본다 | `ending([true]) ≥ 1` | ✓ | 30 | 장식 「황금 불씨」 |
| `st_s14` | 균열 너머 | 14장 「거울의 성」을 클리어해 이졸데를 동료로 맞는다 | `cleared([s14]) ≥ 1` | ✓ | 10 | 1,000 G |
| `st_end2` | 파수꾼의 밤 | 2부의 엔딩을 본다 | `ending([p2, p2true]) ≥ 1` | ✓ | 30 | 이명 「이계의 파수꾼」 |
| `st_true2` | 새벽의 별 | 2부의 진엔딩을 본다 | `ending([p2true]) ≥ 1` | ✓ | 50 | 장식 「이계의 별빛」 |
| `st_s21` | 은빛 귀환 | 외전 「하늘 정원의 둥지」를 클리어한다 | `cleared([s21]) ≥ 1` | ✓ | 20 | 장식 「은빛 깃털」 |
| `st_s22` | 이름을 부르는 밤 | 외전 「이름 없는 언덕」을 클리어한다 | `cleared([s22]) ≥ 1` | ✓ | 20 | 장식 「까마귀 떼」 |
| `st_endings` | 다섯 개의 결말 | 엔딩 다섯 개를 모두 본다 | `ending([bad, normal, true, p2, p2true]) ≥ 5` | ✓ | 50 | 이명 「연대기의 증인」 |

### 4.2 전투 `combat` (7)

| id | 이름 | 설명 | 조건 | 소급 | 점수 | 보상 |
|---|---|---|---|---|---|---|
| `cb_kill_1k` | 사냥꾼의 일상 | 적 1,000마리를 쓰러뜨린다 | `kills ≥ 1000` | ✓ | 10 | 중급 강화석 ×2 |
| `cb_kill_10k` | 피의 수확 | 적 10,000마리를 쓰러뜨린다 | `kills ≥ 10000` | ✓ | 30 | 이명 「피의 수확자」 |
| `cb_combo_100` | 백 연격 | 콤보 100 HIT를 잇는다 | `combo ≥ 100` | ✓ | 20 | (500 G) |
| `cb_combo_300` | 끝나지 않는 연격 | 콤보 300 HIT를 잇는다 | `combo ≥ 300` | ✓ | 50 | (1,250 G) |
| `cb_style_s` | 잔혹하다 | 스타일 랭크 S에 오른다 | `style ≥ 5` | ✗ | 10 | (250 G) |
| `cb_style_sss` | 피의 야상곡 | 스타일 랭크 SSS에 오른다 | `style ≥ 7` | ✗ | 30 | 이명 「피의 야상곡」 |
| `cb_nodmg` | 흠집 하나 없이 | 보스를 피해 없이 쓰러뜨린다 | `nodmg ≥ 1` (스토리·스테이지 연습) | ✗ | 20 | (500 G) |

### 4.3 영웅 `hero` (7)

| id | 이름 | 설명 | 조건 | 소급 | 점수 | 보상 |
|---|---|---|---|---|---|---|
| `hr_class1` | 첫 전직 | 영웅 하나를 1차 전직시킨다 | `tier ≥ 1` | ✓ | 10 | 고급 회복 물약 ×2 |
| `hr_class2_all` | 일곱 개의 정점 | 일곱 영웅을 모두 2차 전직시킨다 | `tier2all ≥ 7` (슬롯 상관없이) | ✓ | 50 | 이명 「일곱 정점」 |
| `hr_seven` | 일곱 사냥꾼 | 일곱 영웅을 모두 동료로 맞는다 | `heroes ≥ 7` | ✓ | 20 | (500 G) |
| `hr_lv80` | 전설의 경지 | 영웅 하나가 레벨 80에 오른다 | `level ≥ 80` (최고 99, 외전 s22 권장 72) | ✓ | 30 | (750 G) |
| `hr_awaken` | 첫 각성 | 각성기를 처음 발동한다 | `awaken ≥ 1` | ✗ | 10 | (250 G) |
| `hr_awaken_all` | 일곱 개의 각성 | 일곱 영웅의 각성기를 모두 발동한다 | `awaken ≥ 7` | ✗ | 30 | 이명 「각성한 자」 |
| `hr_true_awaken` | 진 각성 | 2차 전직한 영웅으로 진 각성을 발동한다 | `awaken2 ≥ 1` | ✗ | 20 | (500 G) |

### 4.4 동료 `companion` (7)

| id | 이름 | 설명 | 조건 | 소급 | 점수 | 보상 |
|---|---|---|---|---|---|---|
| `cp_first` | 첫 동료 | 탈것이나 수호신을 처음 얻는다 | `cmpAny ≥ 1` | ✓ | 10 | 1,000 G |
| `cp_ride` | 첫 기승 | 탈것에 처음 올라탄다 | `ride ≥ 1` | ✗ | 10 | (250 G) |
| `cp_egg` | 알을 깨고 나온 날개 | 알을 부화시켜 동료로 맞는다 | `egg ≥ 1` | ✓ | 10 | (250 G) |
| `cp_mounts` | 마구간의 주인 | 탈것 10마리를 모두 얻는다 | `mounts ≥ 10` | ✓ | 30 | 이명 「마구간의 주인」 |
| `cp_guards` | 열두 수호신 | 수호신 12체를 모두 얻는다 | `guards ≥ 12` | ✓ | 30 | 이명 「수호신의 벗」 |
| `cp_bond` | 영혼 결속 | 동료 하나와 유대 최고 단계 「영혼 결속」에 이른다 | `bond ≥ 5` (`BOND_RANKS[5]` = 200) | ✓ | 30 | (750 G) |
| `cp_lv30` | 함께 걸어온 길 | 동료 하나를 최고 레벨 30까지 키운다 | `cmpLv ≥ 30` (`CMP_MAX_LV`) | ✓ | 20 | (500 G) |

### 4.5 수집 `collect` (9)

| id | 이름 | 설명 | 조건 | 소급 | 점수 | 보상 |
|---|---|---|---|---|---|---|
| `cl_relics` | 다섯 개의 유물 | 드라큘라의 유물 다섯 개를 모두 모은다 | `relics ≥ 5` | ✓ | 20 | (500 G) |
| `cl_otherworld` | 이계의 보물 | 세계의 심장과 별의 조각을 여섯 개씩 모두 모은다 | `otherworld ≥ 6` | ✓ | 30 | (750 G) |
| `cl_docs10` | 비전서 수집가 | 비전서 10권을 찾는다 | `docs ≥ 10` | ✓ | 10 | 마나 에테르 ×3 |
| `cl_docs_all` | 금서의 주인 | 비전서 27권을 모두 찾는다 | `docs ≥ 27` (`Object.keys(DOCS).length` — 시험이 대조) | ✓ | 30 | 이명 「금서의 주인」 |
| `cl_beast30` | 괴물 학자 | 도감에 적 30종을 기록한다 | `bestiary ≥ 30` | ✓ | 10 | (250 G) |
| `cl_beast80` | 괴물 박사 | 도감에 적 80종을 기록한다 | `bestiary ≥ 80` (적 91종 중 스테이지 목록에 있는 것 90 — '모두'로 하지 않는다) | ✓ | 30 | (750 G) |
| `cl_secret20` | 비밀 탐색가 | 숨겨진 비밀 20곳을 찾는다 | `secrets ≥ 20` | ✓ | 20 | 엘릭서 ×1 |
| `cl_enhance10` | 장인의 걸작 | 장비 하나를 +10까지 강화한다 | `enhance ≥ 10` (최고 +15, `MAX_ENHANCE`) | ✓ | 20 | (500 G) |
| `cl_quest30` | 마을의 해결사 | 퀘스트 30개를 완료한다 | `quests ≥ 30` (전체 57) | ✓ | 20 | 상급 강화석 ×1 |

### 4.6 아케이드 `arcade` (10 — 아케이드 모드와 여관 놀이)

| id | 이름 | 설명 | 조건 | 소급 | 점수 | 보상 |
|---|---|---|---|---|---|---|
| `ar_rush` | 첫 결착 | 보스 러시 코스 하나를 완주한다 | `rush('any') ≥ 1` | ✓ | 10 | 상급 강화석 ×1 |
| `ar_rush22` | 스물두 번의 결착 | 보스 러시 「전 보스 22연전」을 완주한다 | `rush([8]) ≥ 1` (`COURSES[8]`) | ✓ | 50 | 이명 「스물두 번의 결착」 |
| `ar_surv10` | 살아남은 자 | 서바이벌에서 웨이브 10에 이른다 | `survival ≥ 10` | ✓ | 10 | (250 G) |
| `ar_tower10` | 탑의 문지기 | 무한의 탑 10층을 돌파한다 | `tower ≥ 10` (난이도 상관없이) | ✓ | 10 | (250 G) |
| `ar_tower50` | 구름 위의 층 | 무한의 탑 50층을 돌파한다 | `tower ≥ 50` | ✓ | 30 | 이명 「탑을 오른 자」 |
| `ar_daily` | 오늘의 사냥 | 오늘의 도전을 클리어한다 | `daily ≥ 1` | ✗ | 10 | (250 G) |
| `ar_daily7` | 이레의 사냥 | 서로 다른 날 오늘의 도전을 7번 클리어한다 | `daily ≥ 7` | ✗ | 30 | (750 G) |
| `mg_win` | 여관의 손님 | 여관 놀이에서 처음 이긴다 | `mgWins ≥ 1` | ✓ | 10 | 500 G |
| `mg_jackpot` | 잭팟 | 여관 놀이에서 잭팟을 터뜨린다 | `jackpot ≥ 1` (주사위 트리플 · 슬롯) | ✓ | 20 | 이명 「행운의 손」 |
| `mg_duel` | 마탄의 사수를 넘어 | 황혼의 결투에서 다섯 결투자를 모두 이긴다 | `duel ≥ 5` | ✓ | 30 | (750 G) |

### 4.7 도전 `challenge` (9)

| id | 이름 | 설명 | 조건 | 소급 | 점수 | 보상 |
|---|---|---|---|---|---|---|
| `ch_rank_s` | 완벽한 사냥 | 스테이지 하나를 S 랭크로 클리어한다 | `rankS(STAGE_ORDER 중 외전 아닌 20) ≥ 1` | ✓ | 10 | 축성된 성수 ×1 |
| `ch_rank_s_all` | 핏빛 완벽주의 | 1·2부 스무 스테이지를 모두 S 랭크로 클리어한다 | `rankS(s01…s20) ≥ 20` (슬롯 상관없이 가장 좋은 랭크) | ✓ | 50 | 이명 「완벽한 사냥꾼」 |
| `ch_nodmg_stage` | 무결 | 스테이지를 피해 없이 클리어한다 | `nodmgStage ≥ 1` (스토리) | ✗ | 30 | (750 G) |
| `ch_speed` | 질주하는 밤 | 스테이지를 기준 시간의 절반 안에 클리어한다 | `speed ≥ 1` | ✓ | 20 | (500 G) |
| `ch_hard_p1` | 베테랑의 증명 | 베테랑 이상 난이도로 1부 엔딩을 본다 | `diffEnding({diffs:[hard, nightmare, inferno], part:1}) ≥ 1` | ✓ | 30 | (750 G) |
| `ch_nightmare_p2` | 악몽을 걷는 자 | 악몽 이상 난이도로 2부 엔딩을 본다 | `diffEnding({diffs:[nightmare, inferno], part:2}) ≥ 1` | ✓ | 50 | 이명 「악몽을 걷는 자」 |
| `ch_nodmg5` | 다섯 번의 무결 | 보스를 피해 없이 다섯 번 쓰러뜨린다 | `nodmg ≥ 5` | ✗ | 30 | (750 G) |
| `ch_rush_perfect` | 무결점 러시 | 보스 러시 코스 하나를 모든 보스 무피해로 완주한다 | `rushPerfect ≥ 1` | ✗ | 50 | (1,250 G) |
| `ch_all` | 블러드 녹턴 | 다른 업적을 모두 달성한다 | `all ≥ 66` | – | 100 | **이명 「블러드 녹턴」 + 장식 「핏빛 달」** |

### 4.8 숨겨진 `secret` (7, 모두 `hidden: true`)

| id | 이름 | 설명 (달성하면 공개) | 조건 | 소급 | 점수 | 보상 |
|---|---|---|---|---|---|---|
| `sc_konami` | 옛 주문 | 타이틀 화면에서 비밀 코드를 입력한다 | `konami ≥ 1` | ✓ | 10 | (250 G) |
| `sc_bad` | 끝나지 않는 밤 | 배드 엔딩을 본다 | `ending([bad]) ≥ 1` | ✓ | 10 | (250 G) |
| `sc_lia` | 딱 한 번 부른 이름 | 리아로 네메인과 결착한다 | `heroBoss({boss:'b_nemain', char:'lia'}) ≥ 1` (스토리) | ✗ | 20 | (500 G) |
| `sc_isolde` | 다시 하늘로 | 이졸데로 아르겐을 정화한다 | `heroBoss({boss:'b_argen', char:'isolde'}) ≥ 1` (스토리) | ✗ | 20 | (500 G) |
| `sc_count` | 백작의 굴욕 | 드라큘라 백작을 피해 없이 쓰러뜨린다 | `nodmg('b_dracula') ≥ 1` | ✗ | 30 | 이명 「백작 사냥꾼」 |
| `sc_die100` | 불굴 | 백 번 쓰러지고도 다시 일어선다 | `deaths ≥ 100` | ✓ | 10 | (250 G) |
| `sc_cat` | 까망이의 선물 | 흑묘 여관의 까망이에게 선물을 받는다 | `cat ≥ 1` (`inn.js` 쓰다듬기 아홉 번) | ✓ | 10 | (250 G) |

- 숨긴 업적은 달성 전에는 이름 '숨겨진 업적', 설명 '아직 알 수 없는 업적입니다', 메달 '?' 로 보인다. 개수·점수 합계에는 들어간다.
- 분류별 점수: 이야기 270 · 전투 170 · 영웅 170 · 동료 140 · 수집 190 · 아케이드 210 · 도전 370 · 숨겨진 110 = **1,630**.

## 5. 보상

### 5.1 이명 (`ACH_TITLES`, 17개 — `core/ach_meta.js`)

| id | 이름 | 업적 | id | 이름 | 업적 |
|---|---|---|---|---|---|
| `t_dawn` | 새벽을 연 자 | `st_end1` | `t_scholar` | 금서의 주인 | `cl_docs_all` |
| `t_warden` | 이계의 파수꾼 | `st_end2` | `t_rush` | 스물두 번의 결착 | `ar_rush22` |
| `t_chronicler` | 연대기의 증인 | `st_endings` | `t_tower` | 탑을 오른 자 | `ar_tower50` |
| `t_reaper` | 피의 수확자 | `cb_kill_10k` | `t_lucky` | 행운의 손 | `mg_jackpot` |
| `t_nocturne` | 피의 야상곡 | `cb_style_sss` | `t_perfect` | 완벽한 사냥꾼 | `ch_rank_s_all` |
| `t_apex` | 일곱 정점 | `hr_class2_all` | `t_nightmare` | 악몽을 걷는 자 | `ch_nightmare_p2` |
| `t_awakened` | 각성한 자 | `hr_awaken_all` | `t_count` | 백작 사냥꾼 | `sc_count` |
| `t_stable` | 마구간의 주인 | `cp_mounts` | `t_legend` | 블러드 녹턴 | `ch_all` |
| `t_guardian` | 수호신의 벗 | `cp_guards` | | | |

- 하나만 고른다 (`meta.ach.title`, 없음 가능). 보이는 곳: 업적 화면 머리, 명예의 전당 온라인 순위표(§8). **'이명'이라 부른다** — '칭호'의 '칭'은 기본 글꼴에 없다 (§10).

### 5.2 타이틀 장식 (`ACH_DECOS`, 5개) — 타이틀 화면의 `Ambience` 만 바꾼다

| id | 이름 | 업적 | `amb` (title.js 가 Ambience 인자에 더한다) |
|---|---|---|---|
| `d_gold` | 황금 불씨 | `st_true1` | `{ emberColor: '#ffd070' }` |
| `d_violet` | 이계의 별빛 | `st_true2` | `{ emberColor: '#c8b8ff', fogTint: '#3a2a6a' }` |
| `d_silver` | 은빛 깃털 | `st_s21` | `{ emberColor: '#cfe6ff', motesMul: 1.6 }` |
| `d_crow` | 까마귀 떼 | `st_s22` | `{ emberColor: '#ff4a6a', batsMul: 2 }` |
| `d_moon` | 핏빛 달 | `ch_all` | `{ emberColor: '#ff3040', fogTint: '#5a1a2a', moon: true }` — 달 원판 하나 (`glowSprite` 캐시 + 원 하나, 로고 뒤 오른쪽 위) |

- `batsMul`·`motesMul` 은 title.js 가 수를 곱해 넘긴다 (품질 배율 `q` 그대로). `Ambience` 생성자는 바꾸지 않는다. 그리기 예산은 지금 타이틀과 같은 수준 (박쥐 28 이하).

### 5.3 골드·소모품 (받기 — 계정에 한 번)

- 정한 것 12개 (§4 표): 회복 물약 ×3 (`c_potion`) · 300 G · 1,000 G ×2 · 중급 강화석 ×2 (`m_stone_2`) · 고급 회복 물약 ×2 (`c_hipotion`) · 마나 에테르 ×3 (`c_ether`) · 엘릭서 ×1 (`c_elixir`) · 상급 강화석 ×1 ×2 (`m_stone_3`) · 500 G · 축성된 성수 ×1 (`c_holywater`).
- 나머지 34개(이명·장식이 없는 것): **기본 골드 `pts × 25`** (10점 250 G … 50점 1,250 G). 게임 전체에서 받을 수 있는 골드 합 ≈ 20,300 G — 2부 스테이지 한 판 보상(레벨 60, S 랭크 ≈ 7,600 G)의 세 판 남짓. 장비·능력치 보상 없음.
- 받는 곳: 업적 화면의 **'보상 받기'** 한 단추가 받을 수 있는 것 전부를 지금 슬롯에 준다 (§3.2 `claimAll`). 마을이 아닐 때는 단추가 꺼지고 이유를 보여 준다 ('마을에서 받을 수 있습니다' · '이어하기로 슬롯을 불러온 뒤 받을 수 있습니다' · '아케이드 중에는 받을 수 없습니다').
- 두 기기에서 동기화 전에 각각 받으면 두 번 받을 수 있다 (`claimed` 합집합) — 금액이 작아 막지 않는다.

## 6. 알림 — `src/game/ach_notify.js` (ACH-UI)

- `initAchNotify(game)`: `achievementUnlocked {ids, src}` 를 들어 대기열에 넣고, **보여도 될 때** `game.toast` 로 낸다. 토스트 규칙(최대 5개, 2줄, `deferToasts` 장면에서 멈춤, 메뉴에서 숨김)은 `core/game.js` 그대로 — game.js 는 고치지 않는다.
- 문구·색·시간:
  - 하나·둘(`'live'`): 하나씩 **`업적 달성 — 「{이름}」`**, `#ffd070`, 3.6초, 처음 보일 때 `audio.sfx('secret', { pitch: 1.2 })` 한 번.
  - 셋 이상(`'live'`): `업적 {n}개 달성 — 「{첫 이름}」 외 {n−1}개`.
  - 소급·클라우드(`'retro'`·`'cloud'`): **`지난 기록으로 업적 {n}개를 달성했습니다 — 「업적」 화면에서 확인하세요`**, 5초, 소리 없음. 실행마다 한 번으로 묶는다 (부팅 훑기와 첫 동기화가 겹치면 합친다).
- **미루기** (대기열에 두고 0.5초마다 다시 본다 — 대기열이 비면 타이머를 끈다):
  - 보스전: `w = game.world` 가 있고 `!w.cleared && (w.bossActive || w.cutscene)` (스토리·연습·보스 러시·서바이벌·탑 모두 — 보스 러시는 라운드 사이 `bossActive` 가 내려가는 짧은 틈에 나온다).
  - 연출 장면이 맨 위: `game.top?.name` ∈ **`dialogue story bossIntro awakenCutin ultCutin companionJoin results ending credits loading`** (results 는 이미 `deferToasts` — 결과표를 가리지 않게 결과 화면을 나간 뒤 나온다).
  - 타이틀의 인트로·PRESS START (`game.top.name === 'title' && game.top.mode !== 'menu'`): 로고와 겹치지 않게 메뉴가 열릴 때까지.
  - 각성 연출(`world.hudHidden`)은 game.js 가 이미 멈춘다.
- 업적 화면이 열려 있으면(맨 위가 `achievements`) 토스트 대신 화면이 목록을 다시 읽고 그 줄을 반짝인다 (같은 이벤트를 듣는다).
- 마을에 들어설 때 받을 보상이 있고 이번 실행에서 처음이면 한 번: `업적 보상 {k}개를 받을 수 있습니다 — 메뉴의 「기록」에서 「업적」을 고르세요` (`#f3e2b8`).

## 7. 화면

### 7.1 장면 `achievements` (`src/scenes/front/achievements.js`, `reg_front.js` 에 등록)

- `game.go('achievements', { back: 'title' })` (타이틀) · `game.push('achievements', {})` (인게임 메뉴 — 닫으면 `pop()`). 선택 인자 `cat`, `id`(그 줄에 초점).
- 장면 깃발: `uiScale = true` · `hidePad = true` · `opaque = true`. 배경: 타이틀과 같은 `kenBurns(bg/title)` + 어둡게 + 지금 고른 장식의 `Ambience` (불씨 수는 타이틀의 절반) — 장식 미리 보기 구실.
- `game.ach` 가 없으면(엔진을 못 받음) 데이터만으로 그리고 모두 미달성 + 위에 '업적 정보를 불러오지 못했습니다' 한 줄. 던지지 않는다.
- 나가면 `game.ach.markSeen()` (NEW 표시를 지운다).

### 7.2 배치 (UI px, `game.uiW × game.uiH`, 최소 720×400)

**넓은 배치** (`uiW ≥ 960 && uiH ≥ 500` — desk 1280×540 · tablet 960×540):

| 영역 | 내용 |
|---|---|
| 머리 (높이 70) | 왼쪽 위 `backButton` · 가운데 `heading('ACHIEVEMENTS', '업적')` · 오른쪽 `달성 {got} / 67 · 업적 점수 {pts} / 1,630` + 가는 막대 · 그 아래 작은 줄 `이명 「…」`(골랐을 때) |
| 왼쪽 분류 칸 (폭 `clamp(uiW × 0.22, 200, 250)`) | '전체' + 8 분류 줄 (높이 42): 분류 문양 · 이름 · `n / m` · 작은 막대 · NEW 점. 아래에 단추 둘 (높이 ≥ 44 CSS): **'이명 · 장식'**, **'보상 받기 ({k})'** (받을 것이 없거나 받을 수 없으면 꺼짐 + 이유 한 줄) |
| 오른쪽 목록 | 카드 줄 (높이 66): 메달(지름 48) · 이름(16 굵게) · 설명(13, 한 줄, 넘치면 …) · 오른쪽 위 점수 알약(`20점`) · 오른쪽 아래: 달성했으면 `2026.10.06 달성`, 아니면 진행 막대 `640 / 1,000` (`bar` 일 때) · 보상 칩(`이명 「새벽을 연 자」` / `회복 물약 ×3` / `500 G` / 받았으면 `받음`) · NEW 리본. 정렬: 데이터 순서 (분류 '전체'에서는 분류 순) |
| 바닥 (34) | `footer` 안내: `[prevTab/nextTab] 분류 · [↑↓] 고르기 · [confirm] 자세히 · [alt] 이명·장식 · [alt2] 보상 받기 · [cancel] 돌아가기` (지금 기기의 글리프) |

**좁은 배치** (그 밖 — 휴대폰: phone1 844×390 CSS → UI 1013×468 · phone2 740×360 → 888×432):

| 영역 | 내용 |
|---|---|
| 머리 (48) | `backButton` · '업적' · 오른쪽 `{got}/67 · {pts}점` |
| 분류 띠 (46) | 칩 9개 가로 (각 ≥ 44 CSS 폭, 모자라면 가로로 끌어 넘김, 고른 칩이 보이게 자동 이동). 칩: 문양 + 이름 + NEW 점 |
| 목록 | 줄 높이 56: 메달(40) · 이름 · 설명 한 줄 · 오른쪽에 `640/1000` 또는 ✓. 줄을 누르면 자세히 (§7.3) |
| 바닥 단추 줄 (50) | '이명 · 장식' · '보상 받기 ({k})' (각 ≥ 44 CSS 높이) + 터치 안내 한 줄 ('줄을 누르면 자세히 볼 수 있어요') |

- 두 배치 모두 목록은 `menu/common.js` 의 `Scroller`(끌기·관성·휠·오른쪽 스틱) + `scrollbar`, 클립 `clipBegin/clipEnd`. 탭 영역은 `ui.taps`(`kind: 'list'` 줄 ≥ 36 CSS, `'primary'` 단추·칩 ≥ 44 CSS), `src: 'ach.*'`.
- 그리기 예산: 휴대폰 장면 그리기 ≤ 3 ms (p95), 프레임마다 새 캔버스·그라디언트 0 (`linGrad`/`vGrad` 캐시, 글로우는 `glow()` 아틀라스).

### 7.3 팝업 (`menu/common.js Popup`)

- **자세히**: 큰 메달(72) · 이름 · 분류·점수 · 설명 전체 · 진행 막대 + 숫자 · 보상 · 달성 날짜 · 소급이면 '지난 기록으로 달성'. 이명 보상을 달성했으면 단추 '이 이명 쓰기'. 숨긴 미달성은 '아직 알 수 없는 업적입니다' / '조건을 채우면 공개됩니다'.
- **이명 · 장식**: 두 목록 (좁은 배치는 위아래, 넓은 배치는 좌우). 이명: '이명 없음' + 17개 (미달성은 흐리게, 오른쪽에 그 업적 이름 — 숨긴 업적의 것은 '???'). 장식: '기본 불씨' + 5개. 고르면 곧바로 `setTitle`/`setDeco` → 토스트 대신 팝업 아래 한 줄 '이명을 정했습니다 — 순위표의 별명 옆에 보입니다' (로그인 안 했으면 '로그인하면 순위표의 별명 옆에 보입니다').

### 7.4 조작 (기존 메뉴 계약 — 의미 액션만 읽는다, 새 바인딩 없음)

| 입력 | 동작 |
|---|---|
| `prevTab`/`nextTab` (Q·S / E·D, 패드 LB / RB) | 분류 앞/뒤 (돌아감) |
| ↑↓ (방향키·D-pad·왼쪽 스틱, `menu/common.js Nav` 반복) | 줄 고르기 (화면 밖이면 목록을 민다) · 넓은 배치에서 ←→ 는 분류 칸 ↔ 목록 초점 |
| `confirm` | 자세히 · 팝업 안에서는 결정 |
| `alt` (A, 패드 Y) | 이명 · 장식 팝업 |
| `alt2` (C, 패드 LT) | 보상 받기 (꺼져 있으면 이유 한 줄 + `menu_cancel`) |
| `cancel` | 팝업 닫기 → 장면 닫기 (`back:'title'` 이면 `go('title', {menu:true, index: 업적 줄})`, 아니면 `pop()`) |
| 터치 | 칩·분류·줄·단추 누르기, 목록 끌기, 목록 가로 밀기 = 분류 바꾸기(`Gesture` 의 밀기, 메뉴 탭과 같은 문턱) |
| 마우스 | 위에 올리면 고르기, 휠 = 목록 |

### 7.5 메달 (`src/scenes/front/ach_medal.js`, `drawMedal(ctx, x, y, r, { cat, pts, got, hidden, isNew, t })`)

- 벡터만: 리본 꼬리 둘(분류 색) → 바깥 고리(점수 색: 10 `#b07a4a` · 20 `#c8ccd8` · 30 `#e8c872` · 50 `#ff5a6a` · 100 `#fff2b0` + `glow` 맥동) → 어두운 안쪽 원 → 분류 문양(`glyph(ctx, ACH_CATS[cat].glyph, …)`) 점수 색.
- 미달성: 고리·문양 `#4a3e44`/`#5a4e54`, 오른쪽 아래 작은 자물쇠(`glyph 'lock'`). 숨긴 미달성: 문양 대신 '?' (`FONT.title`). NEW: 오른쪽 위 붉은 마름모(`diamond`).
- 그림 한 개 ≤ 0.05 ms (호·선 몇 개) — 캐시 캔버스를 쓰지 않는다 (메모리 0, `takeCanvas` 불필요).

### 7.6 들어가는 길

- **타이틀** (`title.js buildMenu`): '명예의 전당' 다음에 `{ id: 'ach', label: '업적', sub: 'ACHIEVEMENTS' }` → 메뉴 8줄. `game.ach?.summary().unseen > 0` 이면 줄 오른쪽에 붉은 점 + sub `NEW {n}`. `choose` → `g.go('achievements', { back: 'title' })` (지연 장면이 아직이면 'loading' 자리 장면이 기다린다).
  - 8줄 배치 계산 (`game.resize` 의 자동 UI 배율, `layout()` 기존 규칙): phone2 (uiK 1.25 → 888×432, 줄 46) 메뉴 높이 375 → `y0 ≈ 27` · phone1 (uiK 1.154 → 1013×468, 줄 46) `y0 ≈ 63` · 둘 다 로고는 오른쪽으로 비킨다 · desk (1280×540, 줄 44) `y0 ≈ 151`, 로고는 메뉴 위 그대로. 시험 U1 이 phone1·phone2·desk 에서 메뉴 줄이 안전 영역 안이고 알림 카드와 겹치지 않음을 잰다. **안 맞으면** 타이틀 메뉴 줄 대신 명예의 전당 머리(기기·온라인 탭 옆)에 '업적' 단추를 두는 것으로 바꾼다 (요청 파일로 리드에게).
  - 장식: `enter` 에서 `ACH_DECOS[g.meta?.ach?.deco]?.amb` 를 `Ambience` 인자에 더한다 (§5.2). `d_moon` 이면 로고 뒤 오른쪽 위에 달 하나.
- **인게임 메뉴** (`menu/tab_system.js` 오른쪽 '시스템' 칸): 둘째 줄을 반으로 나눠 **[설정 | 업적]** (각 폭 `(RW − 32 − 8) / 2`, 높이는 지금 단추 높이 그대로 → 칸 높이가 늘지 않는다; 업적 단추 sub `{got} / 67 달성`, 문양 `star`). 키보드·패드: 행동 목록은 `저장 · 설정 · 업적 · 타이틀로 · (클라우드)` 순서, ↑↓ 는 줄 단위(설정·업적 줄은 하나), ←→ 는 설정 ↔ 업적. 누르면 `g.push('achievements', {})`. 줄을 나누는 까닭: phone2 에서 이 칸에 넷째 단추 줄을 더하면 (46 × 4 + 30 = 214 > 남는 높이 ≈ 202) 클라우드 단추와 겹친다. **새 메뉴 탭을 만들지 않는다** — 같은 장면을 타이틀과 메뉴 두 곳에서 열고, 탭 11개면 가장 좁은 지원 화면(640×360 CSS → uiW 768)에서 탭 폭이 ≈ 53 UI px ≈ 44 CSS 로 하한에 닿는다 (지금 10개 ≈ 58 UI px).
- **명예의 전당** (`front/highscore.js`): §8.3.

## 8. 온라인 이명 — 결정: **한다 (최소안)**

### 8.1 믿음

- 순위표는 이미 클라이언트가 주장하는 기록(시간·점수)을 받는다 (`docs/ONLINE.md` §5). 이명도 같은 수준의 주장이다: 서버는 달성을 확인할 수 없고, **확인하려 하지 않는다.**
- 막는 것은 **글**이다: 서버는 이명을 **고정 목록의 id 로만** 받고(`TITLE_IDS`, 17개), 화면은 그 id 를 클라이언트의 `ACH_TITLES` 로 이름에 옮긴다. 자유 글이 순위표에 오를 길이 없다 → 금칙어·사칭 문제 없음. 목록 밖·형식 밖 id 는 **오류 없이 버린다** (판이 다른 클라이언트의 제출이 실패하지 않게).
- 남는 위험: 얻지 않은 이명을 다는 것 (꾸미기 하나). 운영은 지금처럼 `board-remove` 로 그 기록을 지운다. 순위·기록 값에는 아무 영향이 없다.

### 8.2 서버 (ACH-CORE)

- `gamedata.mts`: `export const TITLE_IDS: readonly string[] = [ 't_dawn', … ]` (17개, `core/ach_meta.js ACH_TITLES` 의 키와 같아야 한다 — 시험이 대조).
- `online.mts finishRun`: `checkResult` 뒤 `const ti = typeof body.result?.ti === 'string' && TITLE_IDS.includes(body.result.ti) ? body.result.ti : undefined;` → `entryOf(saved.rec, nick, ti)` (두 곳). **`checkResult`·`Rec` 는 바꾸지 않는다** (이명은 최고 기록에 묶이지 않고 계정의 '지금' 이명이다).
- `boards.mts`: `Entry` 에 `ti?: string` · `entryOf(r, nick, ti?)` 가 `ti` 를 실음 · `placeEntry` 의 '기록이 더 좋지 않음' 갈래에서 별명처럼 이명도 늘 새로: `if ((cur.ti ?? null) !== (e.ti ?? null)) { if (e.ti) cur.ti = e.ti; else delete cur.ti; changed = true; }` · `pubEntry` 의 Pick 에 `'ti'`, `if (e.ti) out.title = e.ti`. 순위 목록 150개 × ≈ 15 B = 목록 하나당 +2 KB 이하.
- 바뀌는 때: 그 보드에 **다음으로 제출할 때** (별명처럼 모든 보드를 고치지 않는다 — 쓰기 폭주가 없다). 이명을 빼면(`ti` 없음) 다음 제출에서 빠진다. 옛 클라이언트는 `ti` 를 보내지 않으므로 그 계정의 그 보드 이명이 빠진다 — 받아들인다.
- 고스트 응답(`getGhost`)·운영 도구는 바꾸지 않는다.
- `docs/specs/online.md` §2.2 `result.ti?` (이명 id, 고정 목록 밖이면 무시) · §2.3 항목 `title?` 을 적는다.

### 8.3 클라이언트

- `core/online.js` (ACH-CORE): `cleanResult` 가 `ti` 를 `/^t_[a-z0-9_]{1,30}$/` 일 때만 옮긴다 · `getBoard` 의 항목에 `title: (형식이 맞으면) e.title : null`.
- `front/arcade_run.js onlinePayload` (ACH-CORE): `const ti = this.game.ach?.title?.(); if (ti) result.ti = ti;` (기기 대기열에 들어간 제출은 그때의 이명 그대로).
- `front/highscore.js` (ACH-UI): 온라인 목록 줄에서 별명 뒤에 작은 금색 `「{이름}」` (12px, `#e8c872`) — 별명 칸 폭(`C.rec − C.nick − 70`) 안에서 **이명을 먼저 줄이고**(…), 그래도 모자라면 이명을 뺀다. 모르는 id 는 그리지 않는다. 왼쪽 '내 순위' 아래 `공개 별명: {nick}` 줄 끝에 ` · 이명 「…」`.

## 9. 빠진 이벤트 — 최소로 더하는 것 (ACH-CORE, 줄 끝에 `// [hook:ach]`)

| 어디 | 지금 | 더하는 것 | 왜 |
|---|---|---|---|
| `scenes/results.js` `enter` 의 `bus.emit('stageCleared', …)` | `{stageId, rank, time, score}` | **`noDamage: run.damageTaken === 0, diff: st.difficulty, charId: st.charId`** | `ch_nodmg_stage` — 결과 화면에서는 `game.world` 가 이미 null 이다 (stage 장면이 나가며 비운다) |
| `game/world.js` `onBossDefeated` 의 `bus.emit('bossKilled', …)` | `{bossId, stageId, time}` | **`mode: this.mode, charId: this.hero?.charId`** | `sc_lia`·`sc_isolde`(스토리만), `cb_nodmg`(스토리·연습만) — 아케이드 보스 러시·서바이벌·탑은 `onBossDefeated` 를 덮어써서 `bossKilled` 가 나오지 않는다 |
| `front/arcade_run.js` `finish` 의 `bus.emit('arcadeFinished', …)` | `{kind, cleared, reason, score, time, extra, charId, diff, stageId}` | **`course: this.cfg.course ?? null, daily: this.cfg.daily?.date ?? null`** | `ar_daily`·`ar_daily7` (날짜로 서로 다른 날을 센다) |
| `front/arcade_run.js` `BossRushScene.results` 의 `extra` | `{bosses, total}` | **`perfect: this.log.filter((l) => l.perfect).length`** | `ch_rush_perfect` (라운드별 무피해는 이미 `log[].perfect`) |
| 새 이벤트 | – | **`'achievementUnlocked' {ids: string[], src: 'live'\|'retro'\|'cloud'}`** (game/achievements.js) | 알림·업적 화면 새로 읽기 |

- `core/events.js` 머리말 등록부에 위 필드와 새 이벤트를 먼저 적는다 (MASTER_PLAN §1.12 규칙). 기존 구독자(텔레메트리 `stageClear`·`bossEnd`·`arcade`, 퀘스트, 진동)는 필드를 골라 읽으므로 영향 없음 — 텔레메트리는 허용 목록 밖 필드를 보내지 않는다.
- 엔딩 · 비밀 코드 · 아케이드 최고 기록 · 헌터 해금은 이벤트를 더하지 않고 **`saves.onWrite({type:'meta'})`** 로 안다 (모두 그 자리에서 `saveMeta` 한다). 결투 단계 · 고양이 선물 · 엔딩 깃발은 **`saves.onWrite({type:'write'})`** (자동 저장).

## 10. 글꼴 · 예산

- **새 한글 0자**: §4·§5·§6·§7 의 모든 문장(이름·설명·이명·장식·안내·단추)을 `assets/fonts/noto-sans-kr.woff2` · `hahmlet.woff2` · `bn-brush.woff2` 의 cmap 으로 확인했다 (사용 한글 약 310자, 빠진 글자 0 — fontTools 로 이 문서의 표·인용 문장을 대조). 기호 `「」·—` 도 이미 쓰이는 글자.
  - 피한 글자: **'칭'** (칭호 → '이명'), **'깬'** (알에서 깬 → '알을 깨고 나온'). 리드가 '칭호'를 원하면 '칭' 한 자를 위해 `python3 tools/fonts/build_fonts.py` 를 다시 돌린다 (원본 캐시 `~/.cache/blood-nocturne-fonts` 있음, 첫 화면 글꼴 470.1 → ≈ 471.5 KB / 500).
  - 구현 중 문장을 바꾸거나 더하면 `python3 tools/fonts/build_fonts.py --check` (오프라인) 가 통과해야 한다. 데이터 파일(`src/data/achievements.js`)의 글자는 '첫 화면 강제' 묶음이 아니어서, 새 글자가 생겨도 첫 화면 예산 대신 plus 파일로 갈 수 있다 — 그래도 `--check` 실패는 고친다.
- 예산: 새 그림·소리 0. 코드 ≈ 데이터 14 KB + 엔진 18 KB + `ach_meta` 4 KB + 장면·메달 28 KB + 알림 4 KB + 고친 줄 ≈ 70 KB 원문 → **APK lo 그림 단계 45.33 → ≈ 45.40 MiB (상한 45.8 MiB)**. 첫 화면 경로에는 `core/ach_meta.js`(≈ 4 KB)만 들어간다 (title.js 가 장식 표를 읽는다). 확인: `node tools/deploy/build_web.mjs --out dist/<임시> --no-apk --no-deploy-bundle` (빌드 뒤 지움).
- 메타 크기: `ach` ≈ 4 KB → 메타 64 KB 한도와 `cleanMeta` 56 KB 줄이기 규칙에 여유.

## 11. 작업 분담

ACH-CORE 와 ACH-UI 는 동시에 시작한다 (각 1.5–2시간). UI 는 `game.ach` 가 없을 때의 대체(§7.1)로 먼저 화면을 만들고, CORE 의 API(§3.2)가 들어오면 붙인다. 요청은 `/tmp/claude-0/plan/ach_requests.md` 에 `[보낸이→받는이] 내용`. 커밋은 10분마다 자동 저장된다(예상된 일). 밀어 올리기(push)는 하지 않는다.

| 담당 | 파일 (서로 겹치지 않는다) |
|---|---|
| **ACH-CORE** (데이터 · 엔진 · 저장 · 클라우드 · 서버 · 시험) | 새: `src/data/achievements.js`(§4 표 그대로) · `src/core/ach_meta.js`(§2.2, `ACH_TITLES`·`ACH_DECOS` 포함) · `src/game/achievements.js`(§3) · `tools/test_achievements.mjs`(§12 C1–C8, `--ui` 면 UI 모듈 실행) · 고침: `src/main.js`(`loadRest` 두 줄, §3.1) · `src/core/events.js`(머리말) · `src/core/cloud.js`(`mergeMeta`·`cleanMeta`) · `src/core/online.js`(`cleanResult` ti · `getBoard` title) · `src/game/world.js`(`bossKilled` 한 줄) · `src/scenes/results.js`(`stageCleared` 한 줄) · `src/scenes/front/arcade_run.js`(`arcadeFinished` · 보스 러시 `extra.perfect` · `onlinePayload` ti) · `netlify/lib/{validate,config,gamedata,online,boards}.mts` · `tools/online/test_online.mjs`(이명 사례) · `tools/accounts/test_api.mjs`(메타 `ach` 사례) · `tools/qa/run_all.mjs`(한 줄: `test_achievements`, 단위 묶음) · 문서 `docs/ARCHITECTURE.md`(§5.3 메타 `ach` · §15 이벤트 · 장면 이름 `achievements` · 파일 지도) · `docs/ACCOUNTS.md`(메타 필드) · `docs/specs/online.md`(§2.2·§2.3) · `docs/ONLINE.md`(공개되는 것에 '이명 id') |
| **ACH-UI** (화면 · 알림 · 메달 · 타이틀 · 순위표 표시 · 시험) | 새: `src/scenes/front/achievements.js`(§7.1–7.4) · `src/scenes/front/ach_medal.js`(§7.5) · `src/game/ach_notify.js`(§6) · `tools/qa/ach_ui.mjs`(§12 U1–U10, `export default async function run(opts)`) · 고침: `src/scenes/reg_front.js`(한 줄) · `src/scenes/title.js`(메뉴 줄 · 장식 · NEW) · `src/scenes/menu/tab_system.js`([설정 \| 업적]) · `src/scenes/front/highscore.js`(이명 표시) · 글꼴 `assets/fonts/*`(새 글자가 생겼을 때만, build_fonts 결과) · 이 문서 §14 통합 기록(CORE 결과는 요청 파일로 받는다) |

- 넘겨받는 값: 이름·설명 문장은 CORE 의 데이터 파일이 원본이다. UI 가 줄바꿈·길이 문제를 찾으면 요청 파일에 바꿀 문장을 적고 CORE 가 고친다 (§10 글꼴 검사 다시).
- `[hook:ach]` 표식: 남의 기능 파일에 넣은 줄(위 '고침' 줄들)에 단다. `node tools/qa/hook_tags.mjs` 는 기존 표식 수가 줄지 않았는지만 본다.

## 12. 시험 계약

### 12.1 `tools/test_achievements.mjs` (ACH-CORE, 브라우저 없음, < 15초) — `node tools/test_achievements.mjs [--only C3,C4] [--ui]`

| 사례 | 확인 |
|---|---|
| C1 데이터 | 67개 · 분류 8개 각 ≥ 7 · id 키 규칙·중복 없음 · `cond.m` 이 지표표(§3.3)에 있음 · 보상 참조 유효 (`ITEMS`·`ACH_TITLES`·`ACH_DECOS`) · 이명 17 · 장식 5 · 숨김 7 은 모두 `secret` · 점수 합 1,630 · `ch_all.n === 66` · `cl_docs_all.n === Object.keys(DOCS).length` · `mg_duel.n === FOES.length` · `prog` 키 목록이 §3.3 과 같음 · `TITLE_IDS`(gamedata.mts) = `Object.keys(ACH_TITLES)` · `ACH_LIMITS` = `config.mts ACH` |
| C2 요약 | `digestState`: 고정 세이브 `tools/fixtures/save_v1.json`·`save_ch6_nocmp.json` + 손상 세이브 500개 퍼징 → 던짐 0 · 원본 불변 · `state.arcade` → null |
| C3 소급 | 합성 '2부 완주' 슬롯(보통 난이도, 20장·엔딩 깃발·동료 20·비전서 27) + 메타(`endingsSeen` normal·p2) → `rescan('retro')` 가 정해 둔 집합 E 를 정확히 주고 `achievementUnlocked` 를 **한 번** (`src:'retro'`) · 다시 훑으면 0 · 빈 메타·빈 슬롯 → 0 · 아케이드 임시 세이브의 `progress.bosses` 는 `st_dracula` 를 주지 않음 · `meta.konami` 만 있는 메타는 `hr_seven` 을 주지 않음 |
| C4 이벤트 | 가짜 game(meta·state·world·saves 흉내): `enemyKilled` ×1000 → `cb_kill_1k` (`'live'`) · `comboMilestone {n:100}` · `styleRankUp` S·SSS · `bossStarted b_dracula` → `bossKilled {mode:'story'}` → `cb_nodmg`+`sc_count`, 사이에 `playerHurt` 면 둘 다 아님 · `awakenCast` 일곱 영웅 → `hr_awaken_all`, tier 2 → `hr_true_awaken` · `arcadeFinished` 일일 7일(같은 날 두 번은 한 번) → `ar_daily7` · 보스 러시 `perfect === total` → `ch_rush_perfect`, 하나 모자라면 아님 · `stageCleared {noDamage:true}` → `ch_nodmg_stage` · `bossKilled b_nemain charId lia` 스토리 → `sc_lia`, 연습 → 아님 · 메타 쓰기(endingsSeen 에 normal 추가) → `st_end1` · 마지막 하나를 채우면 `ch_all` · `prog` 가 처치마다 저장되지 않음 (saveMeta 호출 수) |
| C5 병합 | `mergeAch`: got 합집합·가장 이른 시각 · prog 큰 값 · claimed 합집합 · seenAt 큰 값 · title 이 기기 우선 · 모르는 필드 보존 · 교환·멱등(got) · `mergeMeta` 가 한쪽에만 `ach` 가 있어도 남김 · 옛 `mergeMeta`(`{...b, ...a}` 흉내)는 서버 `ach` 를 지우지 않음 |
| C6 서버 검사 | 퍼징 `ach` 2,000개 → `cleanMeta(m).ach` 는 늘 서버 `isValidMeta` 참 · 잘못된 모양(대문자 키, got 값 문자열·음수·1e14, prog 1e10, 키 257개, title 숫자, ach 배열, 25 KB) → `isValidMeta` 거짓 · 최대 `ach` + 명예의 전당 200줄 → `cleanMeta` JSON ≤ 64 KB 이고 검사 참 · `test_api.mjs`: `PUT /api/meta` 유효한 `ach` 200, 잘못된 `ach` 422 `invalid_meta` |
| C7 보상 | 마을 상태(`world.mode 'town'`)에서 `claimAll` → 골드·아이템 더함(가방 가득이면 `queued`) · `claimed` · 슬롯 저장 1번 · 메타 저장 1번 · 두 번째 0 · 아케이드 임시 세이브 / 세이브 없음 / 스테이지 안 → null 과 이유 · 기본 골드 = `pts × 25` |
| C8 온라인 이명 (`test_online.mjs`) | `result.ti 't_dawn'` 제출 → 응답 `entry.title` · 순위표 항목 `title` · 목록 밖 `t_nope`·형식 밖 `x` → 200, 이명 없음 · 기록이 나아지지 않은 다음 제출에서 이명이 바뀜 · `ti` 없이 제출 → 빠짐 · 고스트·순위·계정 수 영향 없음 · `TITLE_IDS` 대조 |

### 12.2 `tools/qa/ach_ui.mjs` (ACH-UI, 헤드리스 Chromium, `tools/qa/lib/server.mjs openEnv`) — `test_achievements.mjs --ui` 가 부른다

| 사례 | 확인 |
|---|---|
| U1 들어가기 | desk · phone1 · phone2: 타이틀 메뉴 8줄이 안전 영역 안·알림 카드와 겹침 0 · '업적' → 장면 · 스크린숏 `/tmp/claude-0/ach_ui/{vp}_{title,list,detail,titles}.png` |
| U2 상태 | 빈 메타: `0 / 67`, 숨긴 줄 '숨겨진 업적'·'?' · 반쯤 채운 메타(NEW 포함): 분류 수·점수·NEW·막대 글 `640 / 1,000` · `ch_all` 달성 메타: 모두 공개 |
| U3 조작 | 키보드(E·Q 분류, ↓×5, Z 자세히, X 닫기, A 이명 → `t_dawn` 고름 → `meta.ach.title === 't_dawn'`, X 로 타이틀) · 패드(`fakepad`: LB·RB, D-pad, 결정 버튼 위치 설정 따름) · 터치(칩 탭, 목록 끌기로 스크롤 변화, 줄 탭 → 팝업, '이명 · 장식') |
| U4 탭 크기 | `tools/qa/lib/taps.mjs auditScene` phone1 · phone2: primary ≥ 44 · list ≥ 36 CSS px, 겹침 0 |
| U5 메뉴 길 | `?scene=hub` (슬롯 세이브) → 메뉴 '기록' → [설정 \| 업적] 의 '업적' → 장면 → 닫으면 기록 탭 · 키보드 ←→ 로 설정↔업적 · phone1·phone2 에서 단추 높이 ≥ 44 CSS, 클라우드 단추와 겹침 0 |
| U6 받기 | 마을: '보상 받기' → `state.gold` 가 기대값만큼, 아이템이 가방에, `meta.ach.claimed` · 스테이지에서 연 메뉴 → 꺼짐 + '마을에서 받을 수 있습니다' |
| U7 알림 | s01 에서 `world.bossActive = true` → `game.ach._grant('cb_style_s')` → 3초 동안 `game.toasts` 에 없음 → `world.cleared = true` → `업적 달성 — 「잔혹하다」` · 맨 위가 `story`/`ending` 이면 미룸 · 소급 요약은 타이틀 메뉴가 열린 뒤 · 셋 이상이면 요약 한 줄 |
| U8 장식 | `meta.ach.deco = 'd_gold'` → 타이틀 `amb.emberColor === '#ffd070'` · `d_crow` → 박쥐 수 두 배 · `d_moon` 스크린숏 |
| U9 순위표 이명 | `page.route('**/api/boards/**')` 로 항목에 `title: 't_dawn'` → 줄에 '새벽을 연 자' · `title: 't_zzz'` → 별명만 · 좁은 열에서 별명이 잘리지 않음 |
| U10 오류·성능 | 모든 사례 페이지 오류·콘솔 오류 0 · 업적 장면 그리기 p95 ≤ 3 ms (phone1, `perfprobe`) · 장면을 연 뒤 10초 동안 `canvasPoolStats().free` 변화 0 |

### 12.3 함께 돌리는 기존 검사 (둘 다, 끝낼 때)

`python3 tools/fonts/build_fonts.py --check` · `node tools/test_save_v2.mjs` · `npm run test:api` · `npm run test:online` · `npm run test:online:client` · `npm run test:client` · `npm run test:telemetry` · `node tools/qa/hook_tags.mjs` · `node tools/qa/bindings.mjs` · `node tools/integration.mjs --only title,hub,menu,arcade,s01` · `--mobile title,hub` · `node tools/test_part2.mjs --static` · 예산 빌드(§10).

## 13. 위험

| # | 위험 | 대응 |
|---|---|---|
| 1 | 클라이언트 `cleanAch` 와 서버 `isValidAch` 가 어긋나 메타 동기화 전체가 `invalid_meta` 로 멈춤 | 한 숫자 표(`ACH_LIMITS` = `config.mts ACH`) · C6 퍼징 · 서버는 모르는 필드 허용 |
| 2 | 옛 클라이언트(업데이트 전 APK·PWA 캐시)가 오래된 `ach` 를 다시 올려 다른 기기의 새 달성이 서버에서 잠시 빠짐 | 새 클라이언트가 다음 동기화에서 합집합으로 되돌림 (자기 기기의 것) · 문서화 |
| 3 | 누적값(`prog`)은 기기별 큰 값이라 여러 기기의 합보다 작게 셈 | 처치·죽음은 슬롯 통계 합으로 보정 · 받아들임 |
| 4 | 알림이 컷신·보스·엔딩을 가림 / 몰아서 쏟아짐 | §6 미루기 목록 · 셋 이상 요약 · 소급 요약 한 줄 |
| 5 | 타이틀 메뉴 8줄 (계산상 phone2 `y0 ≈ 27`, 안전 영역 삽입이 큰 기기에서 빠듯) | U1 측정 · 안 맞으면 명예의 전당 머리 단추로 바꿈(리드 결정) |
| 6 | 비밀 코드가 `unlockedChars` 를 채워 `hr_seven` 이 공짜 | `meta.konami` 이면 슬롯 합류 기록만 (§3.3) |
| 7 | 아케이드 임시 세이브의 진행(연습 보스 처치)이 스토리 업적이 됨 | `state.arcade` 는 요약하지 않음 · C3 |
| 8 | 얻지 않은 이명을 순위표에 다는 조작 | 꾸미기뿐 · 고정 목록 · `board-remove` (§8.1) |
| 9 | 보상을 스테이지에서 받고 저장하지 않으면 잃음 / 두 기기에서 두 번 받음 | 마을에서만 받기 · 금액이 작아 두 번은 막지 않음 |
| 10 | 엔딩 깃발이 없는 아주 옛 세이브는 난이도 엔딩을 소급하지 못함 | `cleared.s13`·`cleared.s20` 대체 (§3.3 `diffEnding`) |
| 11 | 문장을 고치다 새 글자 | `--check` · 이 문서 §10 피한 글자 |
| 12 | 공유 파일(world.js · results.js · arcade_run.js · cloud.js · title.js)과 다른 작업의 충돌 | 줄 하나씩 · `[hook:ach]` 표식 · 머리말에 적음 |
| 13 | 휴대폰 부팅 직후 슬롯 셋 읽기(≈ 10–20 ms) | 한가할 때(`requestIdleCallback`) · 타이틀이 그려진 뒤 |

## 14. 통합 기록 (ACH-UI 가 마지막에, CORE 결과는 요청 파일로)

기록 2026-10-06 (ACH-UI). CORE 줄은 `/tmp/claude-0/plan/ach_requests.md` 의 ACH-CORE 보고를 옮겼다.

| 항목 | 결과 |
|---|---|
| 엔진·데이터 | (ACH-CORE) 67개 · 1,630점 · §3.3 지표 모두 · `prog` 키 25 (§3.3 목록). 소급: 합성 '2부 완주' 슬롯 → 23개를 `'retro'` 이벤트 **한 번**, 고정 세이브 `save_v1`(1부) → 15개 (실제 Chromium 부팅에서도 `game.ach` · 15개 저장 · 페이지 오류 0). 처치 경로 2.5 µs/처치, 처치 1,000번에 `saveMeta` 1번(달성할 때만). API(§3.2)에 `rev`(바뀔 때마다 +1) · `status().claimed` · `reward(id)` 를 더했다 |
| 저장·클라우드·서버 | (ACH-CORE) `mergeMeta`/`cleanMeta` 가 `meta.ach` 를 싣는다(`mergeAch`/`cleanAch`) · `ACH_LIMITS` = `config.mts ACH` (C1) · C6 퍼징 2,000 → 정리한 메타를 서버 `isValidMeta` 가 거절 0, 클라이언트·서버 `isValidAch` 2,000/2,000 일치 · 서버 이명 화이트리스트 `TITLE_IDS` 17 (`finishRun` → `entryOf ti`, `placeEntry` 가 별명처럼 이명을 새로, `pubEntry title`), `Rec` 그대로 |
| 화면·알림·타이틀·메뉴·순위표 | (ACH-UI) **장면** `achievements` (`front/achievements.js` + 벡터 메달 `front/ach_medal.js`, `reg_front.js` 등록): 넓은 배치(desk·tablet 960×540 UI) = 분류 칸 9줄 + '이명 · 장식'·'보상 받기 (k)' + 카드 목록(66) · 좁은 배치(phone1 1010×467 · phone2 888×432 · 640×360 CSS 768×432 UI) = 칩 띠(끌기·자동 이동) + 줄 목록(54) + 바닥 단추. 자세히·이명/장식 팝업, 받기(이유 한 줄), 엔진이 없으면 데이터만으로(§7.1). **알림** `game/ach_notify.js`: §6 문구·색·시간 그대로, 미루기 = 보스전·연출 장면·타이틀 인트로/PRESS START(+ 인게임 메뉴·deferToasts 장면·각성 연출), 같은 프레임 이벤트 80 ms 모아 셋 이상 한 줄, 소급 1.2초 모아 한 줄, 마을 입장 보상 안내 한 번. **타이틀** 8줄 — 메뉴 첫 줄 y0: desk 151(로고 위) · phone1 61.7 · phone2 27(로고 오른쪽), 마지막 줄 끝 510 / 436.7 / 402 (안전 영역 아래 540 / 466.7 / 432), 알림 카드(새 버전·홈 화면에 추가·APK)와 겹침 0, phone2 노치 47/47/0/21 + `safeArea 'full'` 에서도 안 → **대체안(명예의 전당 머리 단추) 쓰지 않음**. NEW: 이름 오른쪽 붉은 점 + `NEW n`. 장식 5종(`decoOf`·`decoAmbience`·`drawDecoMoon`, title.js export). **인게임 메뉴** '기록' 탭 [설정 \| 업적] (단추 높이 desk 77.3 · phone1 53.3 · phone2 50.0 CSS, 클라우드 단추와 겹침 0, ↑↓ 줄·←→ 설정↔업적). **순위표** 별명 뒤 「이명」(12 px `#e8c872`), 칸이 모자라면 이명을 줄이고(`「악몽을…」`) 그래도 안 되면 뺀다, 모르는 id 는 그리지 않음, '공개 별명' 줄 끝에 내 이명 |
| 설계와 다른 점 (ACH-UI) | ① 좁은 배치 머리 58 · 칩 44 · 바닥 단추 44 UI px — 44 CSS px 는 터치 여유로 채우고 이웃과 9 UI px 이상 띄운다(§7.2 의 48·46·50 대신). 스크롤에 반쯤 잘린 줄·칩은 보이는 부분만, 최소 크기 이상일 때만 탭 영역 ② 배경 켄번스는 한 장면을 레이어에 굽고(휴대폰 등급 반 해상도, 장식 안개 색 포함) 움직이지 않는다 — 휴대폰 그리기 예산 ③ '지난 기록으로 달성' 은 이번 실행에서 받은 소급·클라우드 달성만 (`meta.ach` 에 경로가 없다) ④ 알림 미루기에 인게임 `menu` 를 더했다 (game.js 는 메뉴에서 토스트를 숨긴 채 시간을 흘려보내 사라진다) ⑤ 자세히 창에서 ↑↓ 로 이웃 업적을 넘겨 본다 ⑥ 넓은 배치 분류 칸은 줄 38 UI px (9줄 + 단추 + 이유 줄이 540 높이에 들어가게) |
| 시험 | (ACH-UI) `node tools/qa/ach_ui.mjs` **101/101** U1–U10 (페이지·콘솔 오류 0), `node tools/test_achievements.mjs --ui` **220/220** (CORE 219 + UI 묶음) · 스크린숏 `/tmp/claude-0/ach_ui/{desk,phone1,phone2}_{title,list,detail,titles}.png` 외 · phone1(medium) 그리기 p95 목록 1.2 · 자세히 1.7 · 이명 창 2.0 ms (≤ 3), 프레임마다 새 그라디언트·캔버스 0, 10초 동안 `canvasPoolStats().free` 39 → 39 (닫으면 레이어 한 장을 돌려준다 39 → 40) · 래스터까지 넣은 값(헤드리스 소프트웨어, 정보) 목록 p95 8.4 ms vs 인게임 메뉴 기록 탭 9.0 ms · 글자 p10 9.2 · 중앙값 11.7 CSS px (platform P-03 기준 9 · 10) · `integration --only title,hub,menu,arcade,s01` 5/5 · `--mobile --only title,hub` 2/2 · `qa/platform_view --only front,stack` 26/26 · `qa/platform_menu` 39/39 · `qa/bindings` 43/43 · `qa/hook_tags` 5 통과 · 1 경고(다른 패키지의 art-boss 태그) · `npm run test:client` 11/11 · (ACH-CORE) `node tools/test_achievements.mjs` 219/219 (C1–C8) · `npm run test:online` 30/30 + 25/25 · `npm run test:api` 76/76 + 66/66 · `test_save_v2` 72/72 · `npm run test:online:client` 15/15 · `npm run test:telemetry` 15/15 · `test_part2 --static` 23/23 |
| 글꼴 | `python3 tools/fonts/build_fonts.py --check` 통과 — 새 글자 0 (게임 글자 1,327자 그대로), 첫 화면 글꼴 470.1 KB / 500 |
| 예산 | (ACH-CORE, UI 파일 포함 빌드) APK lo 그림 단계 47,622,074 B = **45.42 MiB** (상한 45.8) |
