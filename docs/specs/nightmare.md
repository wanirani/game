# 「악몽의 군주」 — 악몽 재대결 설계 계약 (Stage 5 · P3)

> **상태: P3a(엔진) 구현 — 2026-10-18.** 계획: `/tmp/claude-0/s5/plan.md` §3 (K1–K4) · §5 P3.
> P3a = 이 문서 · `src/data/nightmare.js` · `src/game/nightmare.js` · `src/game/nm_hazards.js` · `src/game/trial.js` 연결 ·
> `src/game/bosses/boss.js` (inferno + 배율) · 악몽의 모습 (`src/render/painted/registry.js` · `src/render/enemies.js`) ·
> `src/scenes/trial_end.js` (악몽 실패 화면의 최소 표기) · `src/core/cloud.js` (메타 `nm` 합치기) · `tools/test_nightmare.mjs`.
> P3b = 성당 「악몽」 탭 · 월드맵 붉은 「악몽」 단추 · 결과 줄(trial_end 보상 행) · `balance.mjs --nm` 조정 · K3 요청 처리.
> 이 문서의 **굵은 항목**은 P3b 가 바꾸지 않는다. 배율 숫자(§2 표)는 P3b 가 `balance.mjs --nm` 로 고친다.

## 0. 한 줄

이야기에서 이긴 보스 25명과 **더 세고(inferno 패턴 + 배율), 더 어둡게(붉은 기운), 규칙 하나(비틀기)를 더해** 다시 싸운다.
목숨·경험치·전리품은 걸리지 않는 시련(「메아리」) 엔진을 그대로 빌린다. 첫 격파에만 보상이 있고, 기록은 최고 시간이다.

## 1. 흐름 — 시련 엔진 재사용

| 단계 | 함수 (`game/nightmare.js`) | 비고 |
|---|---|---|
| 열림 | `canStartNightmare(state, id)` → `{ ok, code, reason }` | **그 보스를 이야기에서 이겼으면 열린다** (`progress.bosses` · `flags.boss_<id>` · `progress.cleared[stage]` · 이 슬롯의 악몽 기록 중 하나). 아케이드 임시 세이브는 닫힘. 레벨 조건 없음 → 1장만 깬 플레이어도 악몽 나이트윙에 도전한다 |
| 시작 | `startNightmare(game, id, { from })` | 조건 → 슬롯 저장 → 보스 모듈 미리 받기 → `game.go('stage', { stageId, roomId: 'boss', mode: 'trial', trial: id })`. `from` = `'church'`(기본) · `'worldmap'` — 떠날 때 돌아갈 곳 |
| 준비 | `prepareNightmare(game, id)` ← `trial.prepareTrial` 이 id 를 보고 넘긴다 | 스테이지 복사본(intro/outro/next/unlocks 없음) · `opts = { roomId: 'boss', mode: 'trial', trial: T, rules, levelOverride, nightmare }` |
| 붙이기 | `attachNightmare(scene, w, T)` ← `trial.attachTrial` 이 끝에서 부른다 | 시련의 덮어쓰기(경험치 0 · 점수/목숨 저장 안 함 · 결계 · 실패 → `trialEnd`)를 그대로 쓰고, 보스 격파 · 종료 · 배너 · 비틀기 감독만 바꾼다 |
| 격파 | `w.onBossDefeated` → 연출(붉은 고리) · 배너 「악몽 격파」 · 비틀기 정리 | 진행·플래그·`bossKilled`·전리품 없음. `bus 'nightmareCleared'` 한 번 |
| 마침 | `completeNightmare(game, w, T)` | 기록 · 첫 격파 보상 · 메타 `nm` · 슬롯/메타 저장 → 마을 (§5) |
| 실패 | 시련과 같음: `failTrial` → `trialEnd` | **목숨·사망 수 그대로.** 도전 횟수는 악몽 기록에 센다 (`hero.trials` 를 쓰지 않는다). 실패 화면(`trial_end.js`, 최소 표기): 제목 「악몽 실패」 · 이름 진홍 · 엘리제 대사 `NM_FAIL_LINE` · 도전 횟수는 `state.nm` · 지도에서 왔으면 둘째 단추 「마을로」 (보상 줄은 P3b) |
| 다시 | `trial.retryTrial` → 조건 다시 확인 → 새 월드로 보스방 | |
| 떠남 | `trial.leaveTrial` → `leaveNightmare(game, id, why)` | 보스전 도중 포기는 한 번의 도전으로 센다 · 저장 → 마을 (`from` 이 church 면 성당 앞 + 성당, worldmap 이면 동쪽 문) |

- **id 규칙: `nm_<stageId>`** (`nm_s01` … `nm_s25`). `trial.js` 는 `isNightmareId(id)` 로 가른다. 26장 이후 보스는 표에 줄만 더하면 된다.
- **K2:** `opts.nightmare = { id, twist, boss, stage, level, baseLevel, hpMul, atkMul, spMul }` (참). 월드가 `opts` 를 들고 있지 않아도 붙이기가 `w.opts.nightmare` 를 채운다 (P4 의 BossIntroScene 판은 `world.opts.nightmare` 를 읽는다). P3 는 `overlays.js` 를 고치지 않는다.
- **K4:** `attachTrial` 의 `w.gainExp = () => 0` 을 그대로 쓴다 → 경험치 0, 대기 헌터 경험치 0. 적 처치도 `world.trial` 이라 경험치·전리품 없음.
- **AUTO:** `world.trial` 이 있으므로 `autoplay.js` 가 시련과 똑같이 막는다 (문구는 시련 문구 — §9 요청).
- **회차(NG+) 무관:** 월드 mode 가 `trial` 이라 회차 배율이 붙지 않는다.

## 2. 데이터 — `src/data/nightmare.js`

```
NM[id] = { id, boss, stage, twist, hpMul, atkMul, spMul, reward: { rarity }, minions?: [적 id…] }
NM_TWISTS[twist] = { id, name, desc, tier: 'strong'|'weak', rules?, hazard? }
NM_IDS (순서 = 스테이지 순서) · NM_COLOR '#e0203a' · nmLevel(entry, heroLv) · nmOfBoss(bossId)
```

- **레벨 = `max(stage.level + 8, heroLv − 2)`** (1–120 로 자른다). 권장 레벨 = `stage.level + 10`.
- 배율 (첫 값, P3b 가 조정): 1부 `hpMul 1.6 · atkMul 1.1 · spMul 1.15`, 2부·외전 `hpMul 1.5 · atkMul 1.05 · spMul 1.12`.
  **P3b 조정 (§10.4, `tools/balance.mjs --nm`):** `hpMul` 은 줄마다 1.25–2.0 (s01 1.25 · s02 1.7 · s03 1.35 · s04 1.3 · s05 1.4 · s06 1.75 · s07 2.0 · s08 1.95 · s09 1.45 · s10 1.52 · s11 1.85 · s12 1.95 · s13 1.75 · s14 1.5 · s15 1.4 · s16–s19 1.3 · s20 1.35 · s21 1.25 · s22 1.3 · s23 1.3 · s24 1.35 · s25 1.3), s04 만 `atkMul 1.05`. `spMul` 은 그대로.
- `reward.rarity` = 그 스테이지가 주는 가장 높은 등급 이상: **4 (전설)**, 이야기 첫 격파가 신화를 확정으로 주는 13장 혼돈의 군주 · 20장 니힐은 **5 (신화)**.

### 2.1 비틀기 8종 (한 번에 정확히 하나)

| id | 이름 | 종류 | 내용 (모든 위험은 예고 ≥ 0.6초) |
|---|---|---|---|
| `blood_rain` | 피의 비 | strong · 위험 | 2.4초마다 핏방울 기둥 2개(2페이즈부터 3개). 하나는 영웅 근처. 예고 0.9초(천장~바닥 사선 + 바닥 표식) → 0.35초 판정 |
| `cursed_floor` | 저주받은 바닥 | strong · 위험 | 6.5초마다 경기장 바닥의 30% 띠가 1.1초 예고 뒤 2.6초 동안 저주 (0.55초마다 약한 피해). 60% 는 영웅이 선 자리 |
| `doom_clock` | 종말의 시계 | strong · 위험 | 경기장 위 시계가 13초(페이즈마다 짧아짐, 최소 9초)마다 종을 친다. 마지막 1.2초 시계가 붉게 떨리고 양쪽 벽 바닥에 표식 → 양쪽 벽에서 바닥 충격파 두 줄 (뛰어서 피한다) |
| `brand` | 핏빛 낙인 | strong · 위험 | 8초마다 영웅 발밑에 낙인 — 1.0초 따라다니다 굳고, 0.9초 뒤 터진다 (굳은 뒤 피할 시간 0.9초) |
| `minions` | 하수인 | strong · 소환 | 9초마다 소환진(0.9초 예고) → 그 스테이지 적 1마리(2페이즈부터 2). 살아 있는 하수인 최대 2(2페이즈부터 3). 보스가 쓰러지면 함께 사라진다 |
| `no_potion` | 물약 금지 | weak · 규칙 | `rules.noPotion` (일일 도전 규칙과 같은 이름) |
| `no_sub` | 보조 무기 금지 | weak · 규칙 | `rules.noSub` |
| `dark` | 어둠 | weak · 조명 | 보스전 동안 어둠 0.86. **예고·지대·적의 탄·보스는 스스로 빛난다** (감독이 광원을 단다) — 보이지 않는 공격은 없다 |

계획서의 「포션 금지」는 게임 안의 기존 낱말 「물약 금지」로 쓴다 (§3.7 같은 낱말 규칙, 새 글자 0).

### 2.2 배정 (25)

**2부·외전 보스(inferno 갈래 ≤ 3)는 모두 strong 비틀기**를 받는다 — 그들의 차이를 비틀기가 맡는다. 1부 중 갈래가 많은 보스(나이트윙 8, 드라큘라 8, 서리 여왕 7, 레비아탄 11, 둘라한 5, 혼돈 5)는 weak 를 받을 수 있다. 나이트윙은 1장 플레이어의 첫 악몽이라 대표 비틀기 「피의 비」.

| 스테이지 | 보스 | 비틀기 | | 스테이지 | 보스 | 비틀기 |
|---|---|---|---|---|---|---|
| s01 | 나이트윙 | 피의 비 | | s14 | 나르키사 | 저주받은 바닥 |
| s02 | 밴시 여왕 | 하수인 | | s15 | 몰록 | 피의 비 |
| s03 | 둘라한 | 물약 금지 | | s16 | 다곤 | 하수인 |
| s04 | 진홍의 갑주군주 | 핏빛 낙인 | | s17 | 지즈 | 핏빛 낙인 |
| s05 | 본 드래곤 | 저주받은 바닥 | | s18 | 마라 | 종말의 시계 |
| s06 | 그리모어 | 보조 무기 금지 | | s19 | 베헤모스 | 하수인 |
| s07 | 키메라 | 저주받은 바닥 | | s20 | 니힐 | 저주받은 바닥 |
| s08 | 레비아탄 | 어둠 | | s21 | 아르겐 | 피의 비 |
| s09 | 태엽 거신 | 종말의 시계 | | s22 | 둥지어미 | 핏빛 낙인 |
| s10 | 서리 여왕 | 물약 금지 | | s23 | 하겐 | 하수인 |
| s11 | 사신 | 핏빛 낙인 | | s24 | 엘제베트 | 저주받은 바닥 |
| s12 | 드라큘라 | 피의 비 | | s25 | 카론 | 종말의 시계 |
| s13 | 혼돈의 군주 | 어둠 | | | | |

## 3. 보스 — `src/game/bosses/boss.js` (모든 보스 클래스 공통)

```
nm = world.opts?.nightmare
inferno ||= !!nm                                    // 강화 패턴
shapeLv = nm?.baseLevel ?? world.stage.level        // 초반·후반 보정은 이야기 레벨 기준 (싸움 길이의 모양 유지)
maxHp = enemyStats(def, level).maxHp × def.hpMul × early(shapeLv) × late(shapeLv) × nm.hpMul
atk  ×= nm.atkMul      aggro ×= nm.spMul (공격 사이 쉼만 짧아진다 — 예고 시간은 그대로)
boss.nmScale = { hpMul, atkMul, spMul }             // 시험·도구용 ('nm' 은 네메인 패턴 상태 이름이라 피한다)
```

- 레벨은 `levelOverride`(= 악몽 레벨)로 이미 오른다. `early`/`late` 를 이야기 레벨로 계산하는 까닭: 1장 나이트윙(레벨 1, early ×2.0)이 악몽 레벨 9 에서 ×1.2 로 떨어져 오히려 짧아지는 것을 막는다 — 그래서 `hpMul` 이 곧 "이야기 싸움 대비 길이"가 된다. `balance.mjs --nm` 은 이 식을 그대로 따른다.
- K3 가드(`if (this.world.cutscene) return;`)는 P4 요청이 올 때만 P3b 가 넣는다. 기본 `Boss.update` 는 이미 `world.cutscene` 에서 멈춘다.

## 4. 비틀기 감독 — `src/game/nm_hazards.js`

- 한 개의 `NmDirector` 개체(월드 개체, kind `'nmDirector'`, 경기장 전체를 덮는 사각형)가 비틀기 하나를 돌린다. `nightmare.js` 가 **늦게 받는다** (`import()`): c_common·b_common 을 첫 화면 번들에 끌어오지 않게.
- c_common 의 `strikeColumn` · `strikeRect` · `strikeCircle` · `groundWave` 와 b_common `Zone` 을 그대로 쓴다. 보스 클래스와 무관하게 돌도록 **주인 대리(owner proxy)**를 둔다: `{ world, stats(보스), A(경기장), zone(), telegraphFor: 빈 함수, dying/dead(보스) }`. 비틀기 지대는 보스의 카운터 창을 열지 않는다.
- **멈춤:** 보스 등장 연출(`world.cutscene`) · 적 정지 · 클리어 · 영웅 사망 · 보스 무적 전환 · 대역 보스(PendingBoss) · 시작 뒤 2.5초 유예.
- **안전한 길 규칙:** 새 위험을 놓기 전에 바닥을 덮은 구간(감독 지대 + 보스의 `hazard` 지대 가운데 바닥에 닿는 것)을 합쳐, 경기장에 **폭 ≥ max(160, 영웅 폭 × 3) 의 빈 바닥**이 남을 때만 놓는다. 못 놓으면 그 차례는 건너뛴다 (`stats.skipped`).
- 감독 통계 `w.nmDirector.stats = { spawned, minWarn, maxActive, skipped, rejects }` · `claims()` (지금 덮인 바닥 구간) — 시험과 P3b 시뮬레이션이 읽는다.
- 피해 배율(`mv`): 피의 비 0.55 · 저주 0.35/틱 · 종 충격파 0.6 · 낙인 0.75 · 하수인은 그 적 자체. P3b 가 「한 번에 최대 체력 25% 이하」를 맞춘다.

## 5. 기록과 보상

- **슬롯 기록 `state.nm`** (선택 필드, 없으면 처음 쓸 때 만든다 — 옛 세이브 그대로 열림): `{ [id]: { done, best, tries, clears, at, first } }`. `best` = 보스전 시간(초, 0.1 단위), `first` = 첫 격파 시각.
- **첫 격파 보상 (슬롯마다 한 번):** `rollEquipDrop(world, 레벨 + 2, { minRarity: reward.rarity, boost: 1 })` 장비 하나 + 골드 `500 × 레벨`. 가방이 차면 보관함(`queueLoot`). 두 번째 격파부터는 보상 없음 (기록·횟수만).
- **K1 메타 `meta.nm`** (기기·계정 단위, `saves.saveMeta` — 탑의 `towerBest` 와 같은 저장): `{ clears, ids: { [id]: 처음 시각 } }`. 이 기기에서 처음 이긴 악몽이면 `ids` 에 넣고 `clears = ids 수` (= "+1"). 같은 보스를 여러 번, 여러 슬롯에서 이겨도 늘지 않는다 → 「군주」(nm 25) = 25명을 모두 꺾음.
- **클라우드:** `cloud.js mergeMeta` 가 `nm` 을 합친다 — `ids` 합집합(이른 시각), `clears = max(a, b, ids 수)`. 그대로 두면 "이 기기 값 우선" 규칙 때문에 다른 기기의 기록이 사라진다. 슬롯 `state.nm` 은 슬롯 통째 올리기에 실린다. 서버는 모르는 필드를 허용한다 (바꿀 것 없음).
- `completeNightmare` 결과 `w.nmResult = { id, time, best, newBest, first, items: [이름…], gold, clears, metaFresh }` — P3b 의 결과 줄이 읽는다.
- 알림: 첫 격파는 「첫 격파 보상: <장비>」 + 「+N G」 (장비는 `addItem(..., { silent: true })` 로 넣어 「획득」 알림이 겹치지 않는다), 다시 이기면 새 기록일 때만 「최고 기록 N초」. 시작할 때 「악몽의 규칙: <비틀기> — <설명>」 한 번 — 앞 판의 규칙 안내가 컷인 등으로 미뤄져 남아 있으면 붙일 때·떠날 때 지운다.

## 6. 악몽의 모습 (새 굽기 0)

- `registry.js` `PaintedBody` (채색 보스 대리 개체): 월드가 악몽이면
  - 몸 뒤 **진홍 후광** (kit `halo`, 퍼프 스프라이트 — 그라데이션·캔버스 생성 0, 색은 붙을 때 미리 굽기),
  - 몸 둘레에서 피어오르는 **검붉은 연기** (kit `Particles` + PRESET `smoke`, 생성은 update 에서만 — 그리기 경로에 난수·fx 생성 없음),
  - **눈빛**: 렌더러가 단 작은 광원(반지름 ≤ 110, 대개 눈·핵) 자리에 진홍 발광, 몸 가운데 진홍 광원.
  - 리그의 페이즈 틴트(나이트윙 'blood' 등)는 굽기가 **손상 2단계(dmg2)에만** 있어서, 1페이즈부터 켜도 체력이 많이 깎이기 전에는 바뀌어 보이지 않는다. 새 굽기 금지라 틴트 변형을 더 굽지 않고, 그 대신 위 셋을 모든 리그에 쓴다.
- `enemies.js`: 악몽 하수인(`e.nmMinion`)은 발밑 진홍 후광.
- 벡터 대체 그림(채색 끔)에는 모습이 붙지 않는다 (게임플레이는 같다).

## 7. P3b 에게 주는 입구

`NM`, `NM_IDS`, `NM_TWISTS`, `NM_COLOR` (데이터) · `nmEntry(id)` · `nightmareTrial(id)` (T 모양) · `canStartNightmare(state, id)` · `nmStatus(state, id)` → `{ state: 'locked'|'ready'|'done', rec, reason }` · `nmRecord(state, id)` · `nmMeta(meta)` · `startNightmare(game, id, { from })` · `NM_STATS` · `w.nmResult` · `bus 'nightmareCleared' { id, bossId, time, first }`.

## 8. 시험 — `tools/test_nightmare.mjs`

- node: 25행 ↔ 보스·스테이지·보스방 · 비틀기 8종 사용 · 레벨 식 · prepare(규칙·레벨·K2) · 열림 조건 · 첫 격파 보상 1회 · 메타 `nm` · 옛 세이브(`nm` 없음) · 클라우드 합치기 왕복 · 보스 배율 식.
- `--browser` (fold_open): 25 보스 모두 악몽으로 띄워 `inferno === true` · 배율 · 비틀기 1개 · 예고 ≥ 0.6초 · 안전한 길 · AUTO 거절 · 목숨 그대로 · 경험치 0 · 다시 도전/떠남 · fetch 0 · 1장 세이브 → 악몽 나이트윙 → 떠남 (페이지 오류 0).

## 9. 소유 밖 요청 (`/tmp/claude-0/s5/p3a_requests.md`)

- `pause.js`: 악몽이면 「시련 포기」 → 「악몽 포기」, 확인 글, 머리 줄 색 `NM_COLOR`, 「도전 횟수」 를 `state.nm` 에서.
- `autoplay.js`: 악몽에서 거절 문구 「악몽에서는 AUTO 를 쓸 수 없다」.
- `inventory.js` 귀환 아이템 문구 「시련의 결계…」 → 악몽이면 「악몽의 결계…」.

## 10. P3b — 입구 · 결과 화면 · 밸런스 (2026-10-18)

### 10.1 스위치
`NM_FLAGS.ui` (`src/data/nightmare.js`, 객체라 시험이 켜고 끈다). 켜면 아래 셋이 보인다. 시험(`test_nightmare --browser`) 통과 뒤 기본값을 켰다.

### 10.2 성당 「악몽」 탭 (`src/scenes/town/church.js`)
- 탭은 **맨 끝**에 붙는다 (전직 · 축복 · 스킬 초기화 · 여정 기록 번호 그대로). 이야기에서 쓰러뜨린 보스가 하나도 없거나 아케이드 상태면 탭이 없다.
- 머리 줄: 이 슬롯 「악몽 격파 N / 25」 · 다음 K1 잔상 「흑장미」 m / 10 (기기 전체 `meta.nm.clears`).
- 25 칸 (5열, 좁으면 4·3열, 넘치면 세로 스크롤 — 글자 하한에서 칸 높이): 장 · 보스 이름(이야기에서 아직 열리지 않은 장은 「???」) · 셋째 줄 = 잠김 / 비틀기 이름 / 「최고 N초」 + ✓ 첫 격파 표식. 첫 보상이 남은 칸은 붉게 맥동.
- 아래 판: 고른 악몽의 비틀기 설명 · 악몽 Lv · 권장 Lv · 첫 격파 보상(등급 · 골드) 또는 최고 기록 · 도전 횟수 + 「악몽에 도전」.
- 조작: 방향 = 칸 이동, 첫 탭 = 고르기, 둘째 탭 · 결정 · 단추 = 확인 창(보스 · 레벨 · 규칙 · 보상 · 권장 레벨보다 낮으면 ⚠) → `startNightmare(game, id, { from: 'church' })`.
- 돌아옴: `goBack` 이 hub 에 `trial: id` 를 넘기고 hub 가 성당에 넘긴다 → 성당이 「악몽」 탭 · 그 칸으로 열리고 엘리제/신부님 한마디(격파 · 실패).

### 10.3 월드맵 붉은 「악몽」 단추 (`src/scenes/town/worldmap.js`)
- 그 장의 보스를 이야기에서 쓰러뜨린 노드(`nmStatus` ≠ locked)에만. 정보판에서 「출발!」 아래에 쌓는다 (둘 다 44 CSS px 이상이 안 되면 출발 오른쪽). 접힌 막대(낮은 화면)는 출발 왼쪽.
- 첫 보상이 남은 노드는 인장 둘레에 붉은 고리가 맥동한다. 키 = 보조 기능(A · 패드 Y), 안내 줄 「악몽」.
- 단추 → 확인 창(규칙 · 레벨 · 보상 · ⚠) → `startNightmare(game, id, { from: 'worldmap' })` (떠나면 동쪽 문). 1장만 깬 세이브도 나이트윙 악몽에 들어간다.

### 10.4 격파 결과 화면 (`src/scenes/trial_end.js` 보상 줄)
- `completeNightmare` 가 기록·보상·메타 저장을 마친 뒤 `push('trialEnd', { world, tid, result: w.nmResult })`. 제목 「악몽 격파」(피 글씨), 엘리제 한마디(낮은 화면이면 생략), 보상 줄: 첫 격파 보상(장비 이름 · 등급 색) + 골드 / 「이미 받았다」 · 기록(새 기록!) · 악몽 격파 n / 25 (+1) · 새 잔상(이번 격파로 열린 K1 잔상).
- 단추: 「다시 도전」(`retryTrial`) · 「성당으로」/「마을로」(기본, `finishNightmare` — 도전 횟수를 더 세지 않는다). `w.nmResult` 에 `rarity · trails · tries · level` 이 더해졌다.
- 스위치가 꺼져 있으면 예전처럼 토스트 + 바로 마을.

### 10.5 밸런스 (`node tools/balance.mjs <난이도> --nm [all|영웅,…] [--check] [--json] [--secs S]`, 본체 `tools/qa/lib/balance_nm.mjs`)
- 권장 레벨(이야기 + 10) 영웅(장비 = 이야기 기준 실행에서 그 레벨에 처음 닿은 장)의 보스 타수 ÷ 이야기 보스 타수(그 장 진입 레벨) — 목표 1.3–1.9.
- 보스 1타(모션 1.2) ≤ 25% × 난이도 적 공격 배율 (보통 25% · 어려움 35% = 「보통 기준 25%」), 비틀기 위험 1타도 같은 상한. 다른 영웅은 balance.mjs 의 「1부 기준 보정 ±30%」 (타수 비 0.91–2.47 · 1타 상한 × 영웅/카엘 s11–s13 비율 × 1.3), 일곱 영웅 가운데값은 1.3–1.9.
- 진짜 `NmDirector` 를 Node 가짜 월드(그 보스방 경기장 폭)에서 120초 돌린다 + 보스 바닥 공격 흉내(3.2초 ÷ spMul, 폭 240) → laneMax(가장 좋은 길 아래 판정 중 지대 수의 최댓값) ≤ 1 · warnMin ≥ 0.6초.
- 결과 (2026-10-18): 보통 · 어려움 · 쉬움 모두 `--nm all --check` 통과. 카엘 타수 비 보통 1.32–1.68 · 어려움 1.53–1.89, 카엘 1타 최대 보통 22.7% · 어려움 31.4%(보통 기준 22.4%), laneMax 0 (25 악몽 모두).

### 10.6 소유 밖 문구 (p3a_requests 1–3, P3b 가 처리)
`pause.js` 「악몽 포기」 · 확인 글 · 진홍 머리 줄 · 「악몽의 규칙」 · 도전 횟수 = `state.nm` / `autoplay.js` 「악몽에서는 AUTO 를 쓸 수 없다」 / `inventory.js` 「악몽의 결계…「악몽 포기」…」.

### 10.7 모습 수정 (P3b)
`registry.js` 의 악몽 연기 색 `NM_SMOKE` 가 `'rgba(40,4,12,0.9)'` 였다. kit `puff()` 는 `math.rgba(hex, a)` 로 가장자리를 투명하게 굽는데 `#hex` 가 아니면 색을 그대로 돌려줘, 연기 입자가 꽉 찬 어두운 64×64 사각형으로 보였다 (채색 보스 악몽 모두). `#28040c` 로 고쳤다 (같은 색, 새 굽기 0). `test_nightmare` N10 이 악몽 후광·눈·연기·불씨 색이 `#hex` 인지 본다.
