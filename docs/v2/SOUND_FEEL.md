# v2 타격감 — 소리·진동·연출 기준표 (SOUND_FEEL)

작성 2026-11-17 · 코드 `src/v2/feel/` · 새 소리 `assets/v2/audio/` · 시험 페이지 `tools/v2/sound_view.html` · 검사 `node tools/v2/sound_check.mjs`
소유자 지시(2026-11-17): "3d지만 타격감(효과, 음향 등) 최고로 살려줘, 마법 등도 3d로 화려하게. 최적화로 느리지 않고 경쾌한 움직임이 느껴지게" — 이 문서는 그 가운데 **소리와 진동**, 그리고 소리와 화면이 같이 읽는 **기준표**를 맡는다.

> 이 문서의 숫자 가운데 소리 크기·길이는 헤드리스 Chromium 의 **오프라인 렌더**(게임 엔진을 그대로 돌림)로 잰 것이다. 오프라인 렌더는 속도를 재지 않는다 — 기기 성능과 무관하다.
> 기기에 그대로 옮겨지는 숫자는 **층 수·노드 수·파일 바이트·풀린 메모리**다 (§9). 실제 스피커에서 어떻게 들리는지는 사람이 들어 봐야 한다 (§10).

## 0. 한눈에

- **표 하나가 기준이다.** `src/v2/feel/table.js` 에 타격(무기 6 × 재질 7 × 세기 4 + 치명타·처치·막힘·받아치기·마무리 일격)마다 소리 층과 시각, 진동 무늬, 추천 경직·흔들림·밀림·줌·느린 화면·음악 낮춤이 들어 있다. 소리 코드는 이 표를 읽는다. **효과 코드(`src/v2/fx`)는 아직 이 표를 읽지 않는다** — 효과 프리셋이 자기 멈춤·흔들림 값을 따로 갖고 있고(값은 가깝지만 같지 않다), 효과가 내보내는 소리 사건 이름도 이 표의 이름과 달랐다. 검수에서 둘을 잇는 다리 `src/v2/feel/fxbridge.js` 를 넣었다(§12).
- **타격음은 네 겹이다:** 휘두름(닿기 전 바람 소리) → 순간음(날카로운 첫 소리) → 몸통(재질) → 꼬리(칼날 울림·뼈 덜그럭·천·돌 부스러기). 꼬리는 경직이 풀릴 즈음 피어나게 20–70 ms 늦춘다.
- **같은 소리가 두 번 나지 않는다:** 변형을 돌려 쓰고(바로 앞 변형은 피함) 층마다 피치 ±4.5 %·음량 ±8 %·시작 위치(천·돌·장비 0–12 ms)를 흔든다.
- **공간:** 화면 위치로 좌우, 카메라 거리로 음량과 고역, 구역별 방 울림 4종(거리·골목·마당·던전 큰 방). 느린 화면에서는 소리가 낮고 어두워진다. 센 타격은 음악을 잠깐 물린다.
- **종:** 이야기의 종 가락 다섯(새벽·황혼·붉은 달·돌아옴·멈춘 시간)과 깊은 종 하나. 종 음색 2개와 깊은 종 1개를 새로 합성했고 가락은 재생 속도로 음높이를 바꿔 친다.
- **두 번째 오디오 시스템이 아니다.** 모든 소리는 v1 엔진의 효과음 인스턴스로 울린다(`audio.sfx('f3_*')`) — 동시 발음 26개 상한, 체감 예산(0.1초에 10/8/6개), 음량 설정, 컴프레서·리미터, 휴대폰 풀기 rate(32 kHz·드문 소리 24 kHz)가 그대로 먹는다. v1 파일은 한 줄도 고치지 않았다.
- **새 소리 파일 24개 · 247 KB** (상한 1.5 MB). 타격·마법의 나머지 층은 v1 고급 효과음(`assets/audio/sfx_v2`) 152종 가운데 52종을 다시 쓴다. 유료 생성은 쓰지 않았다(0 크레딧, §10).

## 1. 파일

| 파일 | 내용 |
|---|---|
| `src/v2/feel/table.js` | **기준표.** 순수 데이터 + 순수 함수(`hitFeel`·`swingFeel`·`stepEvent`·`usedSources`). import 없음 — node 에서도 돈다 |
| `src/v2/feel/sound.js` | 표의 층을 v1 엔진 위에서 울리는 재생기 `FeelSound`: 층 재생·돌려 쓰기·공간·방 울림·느린 화면·고리·합성 층 |
| `src/v2/feel/haptics.js` | 표의 진동 무늬를 v1 진동 소유자(`src/core/haptics.js`)로 보낸다 |
| `src/v2/feel/index.js` | 한 창구 `feel` (소리 + 진동 + 추천 연출값 돌려주기) |
| `assets/v2/audio/` | 새 샘플 24개(.m4a) + `index.json`(v1 `V2Bank` 형식) + `LICENSE.txt` |
| `tools/v2/audio/build_feel_audio.py` | 새 샘플을 수식으로 합성해 v1 과 같은 그릇·크기 규칙으로 굽는다 |
| `tools/v2/sound_view.html` | 시험 페이지: 사건마다 단추, 타격 조합, 시연 5종, 종 가락, 고리, 레벨 미터 |
| `tools/v2/sound_demos.js` | 시연 대본 (시험 페이지와 검사가 같이 쓴다) |
| `tools/v2/sound_check.mjs` | 모든 사건을 오프라인 렌더해 피크·라우드니스·길이·클리핑을 재고, 클리핑·빠진 파일·빈 소리·고리 이음매 튐·기능 시험(고리 다시 켜기·느린 화면 필터·진동 무늬)에 실패 |
| `tools/v2/sound_tables.mjs` · `tools/v2/audio/spectro.py` | 이 문서의 표를 `table.js` 에서 다시 뽑기 · 시연 렌더의 스펙트로그램 그리기 |

## 2. 붙이는 법 (통합 계약)

```js
import { feel, FLAG } from '../feel/index.js';

// (1) 스테이지에 들어갈 때 한 번 (첫 사용자 입력 뒤 — 오디오 컨텍스트가 있어야 한다)
feel.preload();                       // 새 샘플 + 표가 쓰는 '드문' 옛 샘플을 미리 푼다. 안 불러도 첫 소리에서 알아서 받는다(그 한 번은 합성음으로 대신)
feel.setRoom('street');               // 구역이 바뀔 때마다: 'street' 거리 | 'alley' 골목 | 'courtyard' 마당 | 'hall' 던전 큰 방

// (2) 프레임마다 (숫자 대입 12번 — 객체를 만들지 않는다)
const c = scene.cam;                  // 시범판 B: { px, py, pz, fx, fy, fz, dist }
feel.setListener(c.px, c.py, c.pz, c.fx, c.fy, c.fz, c.dist, (game.viewW / 2) / F);
                                      // 7번째 = 기준 거리(카메라→주인공: 이 거리의 소리가 음량 1) · 8번째 = 화면 반폭의 탄젠트 (시범판 B: 반폭 ÷ 초점 거리 880 → 0.55–0.73, 생략하면 0.62)
feel.update();                        // 0.5초에 한 번만 일한다 (배경 고리 감시)

// (3) 사건
feel.swing('sword', 'M', hero);       // 휘두름 시작. 돌려준 r.lead(초) 뒤가 닿는 순간이 되게 애니메이션을 맞춘다 (표의 lead)
const r = feel.hit('sword', 'bone', 'H', FLAG.crit | FLAG.kill, enemy);   // 닿는 순간: 소리 + 진동
world.hitStop(r.stop); cam.addTrauma(r.shake); cam.kick(dirX * r.kick, dirZ * r.kick);
if (r.zoom > 1) cam.punchZoom(r.zoom, r.zoomT);
if (r.slow) world.slowmo(r.slow[0], r.slow[1]);     // [실시간 초, 배속] — 경직이 풀린 뒤에 시작
fx.spark(r.spark, x, y, z);                         // 'blood' | 'bone' | 'spark' | 'dust' | 'splinter' | 'wisp' | 'thread'

feel.step(speedXZ, hero);             // 발이 땅에 닿는 순간마다 (애니메이션 접지 사건). 속도 150 미만 걷기 · 300 미만 달리기 · 그 위 전력
feel.play('move.dash', hero);         // 사건 이름은 §6 표. 돌려주는 값에 추천 연출(stop·shake·zoom)이 있으면 같이 쓴다
feel.magic('fire', 'charge', hero);   // 'charge' | 'release' | 'impact'
const id = feel.loopStart('loop.magic.fire', shot);   // 날아가는 동안
feel.loopMove(id, shot);              // 프레임마다 (팬·음량이 따라간다)
feel.loopStop(id);                    // 맞았을 때 → feel.magic('fire', 'impact', shot)
feel.bell('bloodmoon');               // 종 가락 · feel.bell('toll') 깊은 종
feel.play('ui.ok');                   // 인터페이스 (공간 처리·방 울림 없음)

// (4) 느린 화면·일시정지
feel.setTimeScale(0.25);              // 느린 화면이 시작될 때. 끝나면 feel.setTimeScale(1)
// (5) 장면을 떠날 때
feel.release();                       // 고리 정지 + 엔진의 방 울림을 v1 것으로 돌려놓게 표시
```

- **pos** 는 `{x, y, z}` 를 가진 아무 객체다(월드 좌표, x 오른쪽 · y 위 · z 화면 안쪽 — 헌장 §4). 적·탄 객체를 그대로 넘긴다. 없으면(null) 화면 가운데·기준 거리로 울린다.
- **세기** 는 동작이 정한다: `L` 잔타 · `M` 기본 베기 · `H` 강공격·띄우기·대시 공격 · `F` 콤보 끝·모으기. **재질** 은 적 정의에 한 줄(`material: 'bone'`)로 둔다.
- **돌려주는 값은 추천이다.** 경직·흔들림은 효과 쪽이 품질·설정(화면 흔들림 세기)·1초 창 상한(합계 0.4초, v1 feel §4.1)을 걸어 쓴다. `hitFeel(…)` 만 불러 소리 없이 값을 읽을 수도 있다(같은 조합은 같은 객체 — 캐시).
- **같은 순간 여러 명을 치면** 3명까지 24 ms 씩 늦춰 겹쳐 울리고(뭉개지지 않게) 4명째부터는 소리를 내지 않는다. 경직·흔들림은 효과 쪽이 "최댓값 하나"만 쓴다.
- **진동** 은 `feel.hit`·`feel.play` 가 같이 낸다. 끄려면 `feel.vibrate = false`. 설정(진동 켬·세기, 패드 진동 세기)과 60 ms 제한, 일시정지 때 멈춤은 v1 `core/haptics.js` 가 맡는다.
- **품질** 은 엔진의 품질(`audio.quality` — 게임 품질 설정을 따른다)을 따른다: 낮음 = 층 수 최소·방 울림 없음, 보통 = 꼬리 층 추가, 높음 = 전부. `feel.setQuality('low'|'medium'|'high'|null)` 로 고정할 수 있다.
- **시범판 B (`src/v2/b/sim.js`) 훅과의 대응** (통합 단계에서 `index.js _hooks()` 를 이렇게 바꾼다):

| 지금 훅 | 바꿀 호출 |
|---|---|
| `sfx('dash')` · `sfx('jump')` · `sfx('land')` | `feel.play('move.dash'·'move.jump', hero)` · 낙하 속도가 크면 `'move.land_heavy'`, 아니면 `'move.land'` |
| `sfx(mv.sfx \|\| 'slash')` (공격 시작) | `feel.swing('sword', 세기, hero)` — 표의 `lead`(한손검 85 ms)가 동작의 판정 시작 시각과 맞는지 확인 |
| `hit(e, dmg, mv, x, y, z)` | `feel.hit('sword', e.material, 세기, flags, e)` → `r.stop`·`r.shake` 를 `shake` 훅 대신 쓴다 |
| `kill(e)` | 그 타격의 flags 에 `FLAG.kill` (방의 마지막 적·보스면 `FLAG.finisher` 도) |
| `heroHurt(dmg)` | `feel.play('hero.hurt', hero)` |
| `sfx('parry')` (탄 쳐내기) | `feel.parry('sword', hero)` |
| `sfx('swing')` (적 휘두름) · `sfx('cast')` | `feel.swing('blunt', 'M', e)` · `feel.play('enemy.mage.chant', e)` |
| (없음) 발소리 | 걷기·달리기 애니메이션의 접지 사건에서 `feel.step(speed, hero)` |

- **배포 묶음:** `assets/v2/audio/*.m4a` 와 `index.json` 을 웹 배포·APK 묶음과 서비스 워커 캐시 목록에 넣어야 한다 (v1 의 `assets/audio/sfx_v2` 와 같은 취급). 빠져도 게임은 돈다 — 새 샘플 층만 조용히 빠진다.
- **방 울림을 같이 쓴다:** v2 장면에서는 엔진의 방 컨볼버(`eng.room`)에 이 모듈의 임펄스를 넣는다. 그래서 v2 코드가 옛 이름을 직접 불러도(`audio.sfx('coin')`) 같은 방에서 울린다. `feel.release()` 를 부르면 v1 로 돌아갔을 때 엔진이 자기 임펄스를 다시 만든다.

## 3. 타격 표

세기 (닿는 순간의 기본값 — 무기·재질 배율과 덧붙임이 여기에 더해진다):

| 세기 | 경직 | 흔들림 | 밀림 | 줌 | 음악 낮춤 | 소리 크기 | 꼬리 늦춤 | 진동 |
|---|---|---|---|---|---|---|---|---|
| L | 45 ms | 0.1 | 3 | — | — | 1 | 20 ms | hitL |
| M | 67 ms | 0.16 | 5 | — | — | 1 | 30 ms | hitM |
| H | 100 ms | 0.26 | 9 | 1.02× / 0.14s | 0.3 / 0.35s | 1.04 | 50 ms | hitH |
| F | 133 ms | 0.36 | 13 | 1.035× / 0.18s | 0.45 / 0.5s | 0.98 | 70 ms | hitF |

- **경직** 은 초 단위다(60 Hz·120 Hz 공통). 최종 경직 = 세기 × 무기 배율 × 재질 배율 (+ 치명타 33 ms, 처치 50 ms), **상한 200 ms** (마무리 일격·받아치기만 250 ms). 길게 멈추면 움직임이 무거워지므로 상한을 낮게 잡았다.
- **흔들림** 은 카메라 트라우마(0–1)에 더하는 값, **밀림** 은 타격 방향으로 카메라를 미는 월드 단위, **줌** 은 배율과 돌아오는 시간이다.
- 막힘의 **밀림 −4** 는 공격자 쪽으로 튕기는 방향이다. 받아치기·마무리 일격의 **느린 화면** `[실시간 초, 배속]` 은 경직이 풀린 뒤에 시작한다.
- **음악 낮춤** `[양, 초]` 은 v1 `audio.duck` 그대로다 (엔진 상한 −6 dB, 들어가기 60 ms). 잰 값: H −3.1 dB, F −5.2 dB, 마무리 일격·종 −6 dB.

무기:

| 무기 | 이름 | 경직 배율 | 휘두름→닿음 | 베는 무기 | 휘두름 (H) | 순간음 (H) |
|---|---|---|---|---|---|---|
| `sword` | 한손검 | ×1 | 85 ms | 예 | slash + ~air | hit_heavy + ~snap |
| `great` | 대검 | ×1.25 | 140 ms | 예 | slash_heavy + ~air | hit_heavy + ~snap |
| `dagger` | 단검 | ×0.8 | 50 ms | 예 | dagger + ~air | hit + ~snap |
| `whip` | 채찍 | ×0.9 | 110 ms | 아니오 | whip + ~air | whip_crack + hit |
| `blunt` | 둔기 | ×1.3 | 150 ms | 아니오 | axe + ~air | hit_heavy + down_hit |
| `arrow` | 화살 | ×0.6 | 0 ms | 예 | dagger | hit + ~snap |

재질 (★ = 새 샘플, ~ = 합성 층, 표시 없음 = v1 고급 효과음):

| 재질 | 이름 | 경직 배율 | 불티 | 몸통 | 꼬리 | 죽을 때 |
|---|---|---|---|---|---|---|
| `flesh` | 살 | ×1 | blood | hit_flesh + ~thud | ★cloth | enemy_die |
| `bone` | 뼈 | ×1.05 | bone | hit_bone + ~knock | bone_rattle + bone_rattle | enemy_die_bone + bone_rattle + ★debris |
| `armor` | 갑옷 | ×1.2 | spark | clang + ~knock | ★ring + clang | enemy_die + clang + ★ring |
| `stone` | 돌 | ×1.25 | dust | hit_stone + ~thud | ★debris + ★debris | enemy_die_stone + ★debris |
| `wood` | 나무 | ×0.95 | splinter | step_wood + ~knock | ★debris | break_wall + ★debris |
| `ghost` | 영체 | ×0.7 | wisp | hit_ghost | ~wisp | enemy_die_ghost |
| `cloth` | 천 | ×0.9 | thread | ★cloth + hit_flesh + ~thud | ★cloth | enemy_die + ★cloth |

덧붙임 (`FLAG` 비트를 더해서 넘긴다):

| 덧붙임 | 비트 | 소리 | 경직 | 흔들림 | 줌 | 느린 화면 | 음악 낮춤 | 진동 |
|---|---|---|---|---|---|---|---|---|
| `crit` | 1 | crit + ~snap | +33 ms | +0.08 | 1.03× / 0.16s | — | — | crit |
| `kill` | 2 | — | +50 ms | +0.06 | — | — | — | — |
| `guard` | 4 | clang + knight_guard + ~knock + ★ring (몸통·꼬리 대신) | = 50 ms | = 0.12 | 1× / 0s | — | — | guard |
| `parry` | 8 | counter + clang + ★ring + impact_frame + ~snap (몸통·꼬리 대신) | = 120 ms | = 0.2 | 1.05× / 0.25s | 0.28s @ 0.35× | 0.5 / 0.7s | parry |
| `finisher` | 16 | ~drop + kill_slowmo + ★ring | = 180 ms | +0.2 | 1.08× / 0.4s | 0.36s @ 0.25× | 0.5 / 1s | finisher |

조합 예 (표에서 계산한 최종값):

| 예 | 경직 | 흔들림 | 줌 | 느린 화면 | 진동 | 층 수 (낮음/보통/높음) |
|---|---|---|---|---|---|---|
| 단검 · 살 · 약 | 36 ms | 0.1 | — | — | hitL | 2 / 4 / 4 |
| 한손검 · 뼈 · 중 | 70 ms | 0.16 | — | — | hitM | 3 / 5 / 6 |
| 한손검 · 갑옷 · 강 | 120 ms | 0.26 | 1.02×/0.14s | — | hitH | 5 / 6 / 7 |
| 한손검 · 뼈 · 강 + 치명타 | 138 ms | 0.34 | 1.03×/0.16s | — | crit | 6 / 8 / 9 |
| 대검 · 돌 · 끝 | 200 ms | 0.36 | 1.035×/0.18s | — | hitF | 6 / 7 / 8 |
| 둔기 · 갑옷 · 끝 + 치명타 + 처치 | 200 ms | 0.5 | 1.035×/0.18s | — | hitF | 8 / 12 / 13 |
| 대검 · 뼈 · 끝 + 마무리 일격 | 225 ms | 0.62 | 1.08×/0.4s | 0.36s @ 0.25× | finisher | 9 / 11 / 14 |
| 막힘 | 50 ms | 0.12 | — | — | guard | 2 / 4 / 4 |
| 받아치기 | 120 ms | 0.2 | 1.05×/0.25s | 0.28s @ 0.35× | parry | 4 / 5 / 5 |

## 4. 소리가 만들어지는 법

- **층** 한 줄 = `{ k, n, at, g, p, pv, gv, sv, q }`: 종류(`o` 옛 샘플 · `n` 새 샘플 · `s` 합성) · 이름 · 시작 시각(초, 닿는 순간 = 0) · 음량 · 피치 · 흔들림 · 최소 품질.
- **타격 조합 순서** (`hitFeel`): 무기의 순간음[세기] → 재질 몸통(세기에 따라 ×0.7–1.1) → (베는 무기면) 재질의 베는 층 → 세기 M 부터 재질 꼬리(`tailAt` 만큼 늦춤) → 세기 H 부터 낮은 쿵(`~sub`) → 치명타·마무리 층 → 처치면 재질의 죽음 층.
- **휘두름** 은 따로 부른다(`feel.swing`): 닿기 `lead` 초 전에 시작해야 바람 소리의 꼭대기가 타격에 온다. 세기 H 부터 `~air`(올라갔다 꺼지는 띠 잡음)가 붙는다.
- **변주:** 샘플 변형 3–5개를 돌려 쓰되 바로 앞 변형은 피한다. 층마다 피치 ±4.5 %, 음량 ±8 %. 천·돌·장비 층은 시작 위치를 0–12 ms 흔들고 4 ms 로 올린다(딸깍 방지). 종은 흔들지 않는다(음정).
- **합성 층** (`sound.js SYN`, 엔진 도우미 `H.T`·`H.N` — 노드 2–6개): `sub` 낮은 쿵(+ 휴대폰 스피커에 들리는 윗소리) · `thud` · `knock` · `snap` 날카로운 순간음 · `air` 바람 · `scuff` · `wisp` · `drop` 깊이 떨어지는 음 · `zap` · `shimmer` · `riser`(원소별 모으기).
- **샘플이 아직 없을 때:** 옛 샘플이 안 풀렸거나 브라우저가 m4a 를 못 풀면 같은 이름의 v1 합성음으로 대신한다(소리가 비지 않는다). 새 샘플 층은 조용히 빠진다.
- **고리** (횃불·밤거리·날아가는 마법 5종 — `loopStart`/`loopMove`/`loopStop`)는 파일이 아니라 **실행 중에 한 번 수식으로 만든 22 kHz 버퍼**다 — AAC 파일은 앞뒤 채움 때문에 고리가 튀고, 이쪽은 0바이트에 이음매가 없다 (종류당 88–350 KB PCM, 처음 쓸 때 한 번).
- **느린 화면:** `setTimeScale(s)` — 새 소리는 피치 ×(0.72 + 0.28·s), 저역 통과 600 + 9000·s² Hz (0.25배속 → 1.16 kHz). 울리고 있던 큰 소리(마무리 일격·받아치기·마법 맞음)와 고리는 필터가 50 ms 시상수로 따라 내려갔다 올라온다.

## 5. 공간

- **좌우:** 화면에서의 좌우 위치(카메라 오른쪽 벡터와의 내적 ÷ 깊이 ÷ 반폭 탄젠트 0.62) × 0.62 → 화면 가장자리에서 팬 ±0.62. 잰 값: 왼쪽 끝 타격의 좌우 에너지 차 +0.76 (−1 오른쪽만 … +1 왼쪽만).
- **거리 → 음량:** (기준 거리 ÷ 거리)^0.9, 0.22–1.12 로 자른다. 기준 거리 = 카메라→주인공(`cam.dist`).
- **거리 → 고역:** 기준의 1.2배보다 멀면 저역 통과 16 kHz × (1.2·기준/거리)^2.2, 최저 1.8 kHz. 기준의 3.3배 거리: 음량 이론값 −9.4 dB, 잰 값 -10.7 dB(샘플 변형에 따라 ±2 dB), 4 kHz 위 에너지 비율 -18.2 dB (가까이 -16.6 dB).
- **방 울림 4종** (엔진의 방 컨볼버 하나를 같이 쓰고 임펄스만 바꾼다 — 임펄스는 방마다 한 번 만들어 캐시, 품질 낮음에서는 끔):

| 방 | 이름 | 길이 | 초기 반사 | 첫 반사 | 밝기 | 보내는 양 | 잰 꼬리 길이 (같은 타격) |
|---|---|---|---|---|---|---|---|
| `street` | 거리 | 0.50 s | 5 | 45 ms | 0.50 | 0.08 | 0.44 s |
| `alley` | 골목 | 0.60 s | 14 | 16 ms | 0.60 | 0.13 | 0.55 s |
| `courtyard` | 마당 | 0.95 s | 7 | 70 ms | 0.42 | 0.10 | 0.78 s |
| `hall` | 던전 큰 방 | 1.70 s | 16 | 30 ms | 0.26 | 0.20 | 1.46 s |

- 종은 여기에 더해 엔진의 대성당 잔향(3.3 s, 음악이 쓰는 것)으로도 보낸다(`f3_bell` 묶음 rev 0.2).
- 인터페이스 소리와 밤거리 바탕은 공간 처리를 하지 않는다(`flat`).

## 6. 사건 이름 (효과·애니메이션 코드가 부르는 이름)

`feel.play(이름, pos)` · 고리는 `feel.loopStart(이름, pos)`. 묶음 = 엔진 효과음 묶음(동시 수 상한: hit 6 · swing 4 · step 3 · foley 4 · enemy 5 · magic 5 · big 3 · bell 3 · ui 2 · loop 5).

| 사건 이름 | 묶음 | 층 (★ 새 샘플 · ~ 합성) | 크기 | 진동 | 추천 연출 |
|---|---|---|---|---|---|
| `step.walk` | step | step_stone | 0.9 | — | — |
| `step.run` | step | step_stone + ~scuff | 1.5 | — | — |
| `step.sprint` | step | step_stone + ~scuff + ★gear | 1.6 | — | — |
| `move.dash` | foley | dash_burst + dash + ★cloth + ~air | 1 | dash | — |
| `move.jump` | foley | jump + ★cloth + ★gear | 1 | — | — |
| `move.land` | foley | land + step_stone + ★gear | 1.3 | land | — |
| `move.land_heavy` | foley | land_heavy + ~sub + ★debris + ★gear | 1 | landHeavy | 흔들림 0.14 |
| `foley.cloth` | foley | ★cloth | 0.6 | — | — |
| `foley.gear` | foley | ★gear | 0.5 | — | — |
| `weapon.draw` | foley | ★draw + ★gear + ★ring | 0.6 | — | — |
| `weapon.sheath` | foley | sheath + ★gear | 1 | — | — |
| `hero.hurt` | hit | hurt + hit_flesh + ~thud | 1.3 | hurt | 경직 50 ms · 흔들림 0.3 · 음악 0.3/0.4s |
| `enemy.skel.rattle` | enemy | bone_rattle + bone_rattle | 0.85 | — | — |
| `enemy.skel.collapse` | enemy | enemy_die_bone + bone_rattle + bone_rattle + ★debris + ~thud | 1 | — | — |
| `enemy.mage.chant` | enemy | ★chant + ~wisp | 0.6 | — | — |
| `enemy.bat.screech` | enemy | screech + bat | 1.1 | — | — |
| `enemy.bat.flap` | enemy | wing_flap | 1.2 | — | — |
| `world.torch.light` | enemy | candle + fire | 0.6 | — | — |
| `loop.torch` | loop | 고리 버퍼 `torch` | 0.3 | — | — |
| `loop.street` | loop | 고리 버퍼 `street` | 0.1 | — | — |
| `ui.move` | ui | ★ui_tick | 0.5 | — | — |
| `ui.tab` | ui | ★ui_tab | 0.55 | — | — |
| `ui.open` | ui | ★ui_open | 0.55 | — | — |
| `ui.close` | ui | ★ui_close | 0.55 | — | — |
| `ui.ok` | ui | ★ui_ok | 0.6 | — | — |
| `ui.deny` | ui | ★ui_deny | 0.6 | — | — |
| `bell.toll` | bell | ★bell_toll + ~drop + bell | 1 | toll | 흔들림 0.3 · 줌 1.04×/1.2s · 음악 0.5/2.4s |
| `magic.fire.charge` | magic | ~riser + fire_breath | 0.8 | — | — |
| `magic.fire.release` | magic | fire + ~air + ~sub | 0.95 | cast | — |
| `magic.fire.impact` | big | explode + fire + ~sub + ★debris | 0.95 | magicHit | 경직 90 ms · 흔들림 0.34 · 줌 1.03×/0.2s · 음악 0.4/0.5s |
| `loop.magic.fire` | loop | 고리 버퍼 `fire` | 0.55 | — | — |
| `magic.ice.charge` | magic | ~riser + ice | 0.8 | — | — |
| `magic.ice.release` | magic | ice + ~air + ~snap | 0.95 | cast | — |
| `magic.ice.impact` | big | ice + hit_stone + ★debris + ★ring | 0.95 | magicHit | 경직 100 ms · 흔들림 0.26 · 줌 1.025×/0.18s · 음악 0.35/0.45s |
| `loop.magic.ice` | loop | 고리 버퍼 `ice` | 0.32 | — | — |
| `magic.lightning.charge` | magic | ~riser + ~zap | 0.8 | — | — |
| `magic.lightning.release` | magic | thunder + ~zap + ~snap | 0.95 | cast | — |
| `magic.lightning.impact` | big | thunderclap + thunder + ~zap + ~sub | 0.95 | zap | 경직 70 ms · 흔들림 0.4 · 줌 1.04×/0.14s · 음악 0.45/0.5s |
| `loop.magic.lightning` | loop | 고리 버퍼 `lightning` | 0.85 | — | — |
| `magic.holy.charge` | magic | ~riser + ~shimmer | 0.8 | — | — |
| `magic.holy.release` | magic | holy + ★bell_high + ~air | 0.95 | cast | — |
| `magic.holy.impact` | big | holy + cross + ★bell_mid + ~sub + ~shimmer | 0.95 | magicHit | 경직 90 ms · 흔들림 0.24 · 줌 1.03×/0.25s · 음악 0.4/0.6s |
| `loop.magic.holy` | loop | 고리 버퍼 `holy` | 0.3 | — | — |
| `magic.blood.charge` | magic | ~riser + heartbeat | 0.8 | — | — |
| `magic.blood.release` | magic | dark + hit_flesh + ~air | 0.95 | cast | — |
| `magic.blood.impact` | big | dark + soul_reap + hit_flesh + ~drop + ~wisp | 0.95 | magicHit | 경직 110 ms · 흔들림 0.3 · 줌 1.035×/0.22s · 음악 0.45/0.6s |
| `loop.magic.blood` | loop | 고리 버퍼 `blood` | 0.55 | — | — |
| `bell.dawn` | bell | ★종 5음 | 0.72 | chime | 음악 0.5/2.6s |
| `bell.dusk` | bell | ★종 5음 | 0.72 | chime | 음악 0.5/2.6s |
| `bell.bloodmoon` | bell | ★종 6음 | 0.72 | chime | 음악 0.5/2.6s |
| `bell.return` | bell | ★종 6음 | 0.72 | chime | 음악 0.5/2.6s |
| `bell.still` | bell | ★종 5음 | 0.72 | chime | 음악 0.5/2.6s |

종 가락 (이 게임을 위해 새로 지은 것 — 라 단조/프리지안 색. 반음 +9 이상은 높은 종으로 친다):

| 가락 | 이름 | 뜻 | 음 (D4 기준 반음 @ 초) |
|---|---|---|---|
| `dawn` | 새벽의 종 | 날이 밝는다 | +0@0 +7@0.3 +12@0.6 +14@0.9 +12@1.5 |
| `dusk` | 황혼의 종 | 해가 진다 | +12@0 +10@0.32 +7@0.64 +3@0.96 +0@1.45 |
| `bloodmoon` | 붉은 달의 종 | 붉은 달의 밤으로 | +0@0 +1@0.36 +7@0.72 +6@1.08 +0@1.62 -12@1.62 |
| `return` | 돌아오는 종 | 지금으로 돌아온다 | +7@0 +3@0.26 +5@0.52 +12@0.78 +7@1.3 +0@1.3 |
| `still` | 멈춘 시간의 종 | 시간이 멎는다 | +12@0 +12@0.5 +7@0.75 +12@1.25 +0@1.25 |

## 7. 진동

| 진동 | 패드 (강 / 약 / ms) | 휴대폰 (ms) |
|---|---|---|
| `hitL` | 0 / 0.25 / 40 | 없음 |
| `hitM` | 0.1 / 0.4 / 60 | 8 |
| `hitH` | 0.35 / 0.6 / 90 | 15 |
| `hitF` | 0.6 / 0.8 / 140 | [18,22,30] |
| `crit` | 0.25 / 0.75 / 80 | [10,18,14] |
| `guard` | 0.5 / 0.15 / 55 | 10 |
| `parry` | 0.2 / 0.95 / 120 | [10,28,26] |
| `finisher` | 1 / 1 / 320 | [32,40,80] |
| `hurt` | 0.55 / 0.25 / 140 | 30 |
| `dash` | 0 / 0.2 / 35 | 없음 |
| `land` | 0.15 / 0.1 / 40 | 없음 |
| `landHeavy` | 0.45 / 0.2 / 100 | 14 |
| `cast` | 0.1 / 0.45 / 70 | 10 |
| `magicHit` | 0.7 / 0.6 / 180 | [24,20,36] |
| `zap` | 0.2 / 0.9 / 90 | [8,12,8,12,16] |
| `chime` | 0 / 0.3 / 50 | 8 |
| `toll` | 0.9 / 0.35 / 480 | [60,50,120] |
| `ui` | 0 / 0 / 0 | 없음 |

- 패드 = 듀얼 럼블(강 = 저음 모터, 약 = 고음 모터). 휴대폰 = `navigator.vibrate` 무늬(진동, 쉼, 진동 … ms) — 세기 설정(약 0.5 · 중 1 · 강 1.6)이 진동 칸 길이에 곱해진다.
- v1 은 휴대폰에서 세기 H 부터만 울렸다. v2 는 **M 부터 8 ms 틱**을 준다(선형 모터 기기 기준). 약(L)은 울리지 않는다 — 연타에서 손이 얼얼해지지 않게.
- 치명타는 "틱-틱" 두 번, 받아치기는 짧게-길게, 마무리 일격은 길게 두 번, 번개는 잘게 세 번이다. 무늬의 모양으로 사건을 구분하게 했다.

## 8. 무기·재질·사건을 더하는 법

1. **무기:** `table.js` `WEAPON` 에 한 항목 — `label`, `cut`(베는 무기인가), `stopK`(경직 배율), `lead`(휘두름→닿음 초), `whoosh{L,M,H,F}`, `trans{L,M,H,F}`. 층은 `o('옛 이름', 시각, 음량, 피치, 품질)` · `n('새 이름', …)` · `s('합성 이름', …)` 로 쓴다.
2. **재질:** `MATERIAL` 에 한 항목 — `stopK`, `spark`, `body`, `tail`, `cutx`, `die`.
3. **사건:** `EVENT` 에 `'묶음.이름': ev('f3_묶음', [층…], { gain, haptic, duck, stop, shake })`.
4. **새 샘플이 필요하면:** `tools/v2/audio/build_feel_audio.py` 의 `FILES`(만드는 함수)와 `SETS`(이름 → 파일들)에 넣고 `python3 tools/v2/audio/build_feel_audio.py --only 이름` → `index.json` 이 다시 써진다. 녹음 소재를 쓸 때는 v1 과 같이 CC0 만, 출처를 `assets/v2/audio/LICENSE.txt` 에 적는다.
5. `node tools/v2/sound_check.mjs` — 새 조합이 자동으로 렌더 목록에 들어간다. 클리핑·빠진 파일·빈 소리면 실패한다. 크기는 아래 §9 의 묶음별 범위에 들게 `gain` 을 맞춘다.
6. 시험 페이지(`tools/v2/sound_view.html`)에 단추가 자동으로 생긴다 — 들어 본다.
7. 이 문서의 표는 `node tools/v2/sound_tables.mjs` 로 다시 뽑아 붙인다.

## 9. 숫자

검사 `node tools/v2/sound_check.mjs` (2026-11-17 14:34 UTC): 렌더 298개, **클리핑 0 · 빠진 파일 0 · 빈 소리 0 · 샘플 없는 층 0 · 고리 이음매 튐 0** (휴대폰 풀기 rate 32/24 kHz 경로 `--phone` 도 통과).
기능 시험도 같이 돈다: 빼앗긴 배경 고리가 다시 켜지는가 · 날아가는 고리의 팬이 따라가는가(−0.40 → +0.54) · 느린 화면에서 울리던 마무리 일격의 필터가 내려갔다 돌아오는가(20 kHz → 1.17 kHz → 20 kHz) · 휴대폰 진동 무늬가 표대로 나가는가(약 = 없음, 강 = 15 ms, 마무리 = [32,40,80], 깊은 종 = [60,50,120]) · 옛 샘플이 없을 때 합성음 대체가 비지 않는가.
들어 볼 것: 시연 5종의 렌더가 `/tmp/claude-0/v2/soundfeel/demo_{combo,materials,spell,bells,world}.m4a` 에 있다(같은 이름의 `.png` 는 스펙트로그램). `--shot` 은 시험 페이지 화면도 찍는다.

묶음별 (엔진 출력 — 컴프레서·리미터 뒤. 음량 설정 기본값 음악 0.6 · 효과음 0.8):

| 묶음 | 렌더 수 | 피크 최대 (dBFS) | 마스터 앞 피크 최대 | 크기 LUFS-M (최소 ~ 최대) | 가장 긴 길이 |
|---|---|---|---|---|---|
| 타격 (무기 6 × 재질 7 × 세기 4) | 168 | -0.6 | -0.6 | -29.6 ~ -14.9 | 1.08 s |
| 덧붙임 (치명타·처치·마무리·막힘·받아치기) | 33 | -0.7 | -1.0 | -21.8 ~ -14.4 | 1.48 s |
| 휘두름 | 24 | -4.2 | -7.4 | -33.4 ~ -19.0 | 0.57 s |
| 발소리 | 3 | -15.1 | -18.7 | -40.2 ~ -32.9 | 0.25 s |
| 이동 | 4 | -3.6 | -6.7 | -28.2 ~ -20.9 | 0.44 s |
| 옷자락·장비 | 2 | -15.0 | -18.6 | -33.1 ~ -28.7 | 0.38 s |
| 칼 뽑기·칼집 | 2 | -13.8 | -17.4 | -27.8 ~ -23.0 | 0.99 s |
| 피격 | 1 | -3.2 | -6.3 | -23.2 ~ -23.2 | 0.38 s |
| 적 | 5 | -9.1 | -12.7 | -33.8 ~ -21.7 | 1.22 s |
| 세계 | 1 | -16.7 | -20.3 | -31.4 ~ -31.4 | 0.41 s |
| 고리 | 7 | -10.0 | -13.6 | -32.9 ~ -25.6 | 2.31 s |
| 인터페이스 | 6 | -13.9 | -17.5 | -33.0 ~ -24.8 | 0.35 s |
| 종 | 6 | -2.1 | -4.8 | -18.1 ~ -15.0 | 5.98 s |
| 마법 | 15 | -1.0 | -2.9 | -27.5 ~ -15.1 | 2.38 s |
| 공간·품질 비교 | 12 | -0.9 | -2.7 | -29.6 ~ -15.2 | 1.51 s |
| 대체 경로 (옛 샘플 없음 → 합성음) | 4 | -0.5 | 1.5 | -24.8 ~ -16.3 | 1.41 s |
| 시연 (여러 소리가 겹침) | 5 | -0.6 | -0.4 | -20.9 ~ -12.2 | 21.01 s |

- 세기별 타격 평균 크기(LUFS-M): L -24.8 · M -21.7 · H -18.6 · F -17.3 — L→M→H 는 약 3 dB 씩, H→F 는 1–2 dB 다 (끝 타격은 더 크게가 아니라 더 낮고 길게: 낮은 쿵·깨지는 소리·긴 꼬리로 구분한다). v1 의 `hit` −19.9 · `hit_heavy` −17.1 과 같은 자리다.
- "마스터 앞 피크"는 컴프레서 앞에서 잰 값이다. 이번 렌더에서 0 dBFS 를 넘는 사건은 없다(최대 -0.4 dBFS; 변형·음량 흔들림에 따라 ±1 dB 움직인다. 옛 샘플이 없을 때의 대체 경로만 마무리 일격이 +1.5 dBFS 까지 간다) — 리미터에 거의 기대지 않으므로 여러 소리가 겹쳐도 타격의 첫 순간이 눌리지 않는다.
- 같은 순간 3명 타격: -15.8 LUFS-M (한 명 -18.9), 층 21개 — 리미터 앞 피크 -4 dBFS.

기기에 그대로 옮겨지는 숫자:

| 항목 | 값 |
|---|---|
| 새 소리 파일 | 24개 · 247 KB (.m4a AAC-LC 44.1 kHz 모노, 사건 라우드니스 −16 LUFS, 파일 피크 ≤ −1 dBFS) |
| 새 샘플 풀린 메모리 | 48 kHz: 3.7 MB · 휴대폰(32/24 kHz): 2.2 MB |
| 옛 샘플 | 추가 0 (엔진이 이미 풀어 둔 버퍼를 그대로 쓴다) |
| 고리 버퍼 | 7종, 22.05 kHz 모노, 합계 약 1.1 MB PCM (쓰는 종류만, 처음 쓸 때 만든다) |
| 방 임펄스 | 4종 합계 약 1.4 MB @48 kHz (쓰는 방만) |
| 한 사건의 층 수 (최대 / 평균) | 낮음 10 / 3.3 · 보통 13 / 4.6 · 높음 14 / 5 |
| 한 사건의 WebAudio 노드 | 샘플 층 2개(소스 + 게인) · 합성 층 2–6개 · 인스턴스당 + 저역 통과 0–1 + 방 송신 0–1 + 엔진 2–3 → 보통 타격(M) 약 15–22개, 마무리 일격 약 45개 |
| 동시 발음 | v1 그대로: 인스턴스 26개 상한, 체감 예산 0.1초에 10(보통 8, 낮음 6)개 |
| 프레임마다 하는 일 | `setListener` 대입 12번, `update` 는 0.5초에 한 번 고리 감시. 할당 없음 |
| 재생 때 만드는 JS 객체 | WebAudio 노드뿐 (레시피는 정수 열쇠 캐시, 옵션·합성 층 인자는 모듈 상수 — v1 도우미 안의 작은 임시 객체 제외) |

## 10. 약한 점 (솔직하게)

1. **아무도 귀로 듣지 않았다.** 만든 환경에서는 소리를 들을 수 없어 크기·피크·스펙트럼만 재고 맞췄다. 층의 음량 균형과 "묵직함"은 폴드 스피커와 이어폰으로 들어 보고 고쳐야 한다 — 시험 페이지가 그 용도다. 가장 먼저 들어 볼 것: 마무리 일격, 받아치기, 종 가락 다섯, 마법사 주문.
2. **새 샘플은 전부 합성이다.** 종·칼날 울림·주문은 수식으로 만들어 깨끗하지만 녹음의 결(공기·잡음)이 없다. 특히 **마법사 주문**(포먼트 합성)과 **깊은 종**은 녹음·생성 소재로 바꾸면 가장 크게 좋아질 자리다. 유료 생성(Higgsfield 오디오)은 들어 볼 수 없는 상태에서 "기존보다 낫다"를 확인할 수 없어 쓰지 않았다(0 크레딧, `tools/higgsfield/manifest_soundfeel.json`).
3. **휴대폰 스피커는 300 Hz 아래가 거의 안 나온다.** 낮은 쿵(`sub`·`drop`)에 윗소리(삼각파)를 섞고 종에 윗부분음을 더했지만, 스피커에서 "묵직함"이 얼마나 남는지는 재지 못했다.
4. **발소리는 돌바닥 하나다.** 표면별(흙·나무·물)은 v1 샘플이 있으니 `step.*` 을 표면 인자로 넓히면 된다(다음 단계).
5. **진동 무늬는 기기에서 확인하지 못했다.** 8 ms 틱이 폴드 모터에서 느껴지는지, 60 ms 제한 때문에 연타에서 빠지는 틱이 어색하지 않은지 봐야 한다.
6. **배경 고리가 빼앗길 수 있다.** 동시 발음이 26개를 넘으면 엔진이 가장 오래된 인스턴스(밤거리 바탕)를 빼앗는다 — `update()` 가 0.5초 안에 다시 켠다(짧게 끊길 수 있다).
7. **적별 소리가 얕다.** 해골·마법사·박쥐의 대표 소리 한두 개뿐이다. 보스·적 5종이 정해지면 종류별 경고음(공격 예고)을 더해야 한다 — 타격감의 절반은 "맞기 전에 들리는 소리"다.
8. 방 울림은 생성 임펄스(잡음 + 초기 반사)다. 구역 4종의 차이는 길이와 밀도로만 냈다.

## 11. 다음 단계

1. 통합: `docs/v2/FX.md` §11 의 단계 그대로(효과 + 소리를 함께 꽂는 순서; 타격은 `bridge.strike(...)` 한 줄). 카메라마다 `setListener`, 구역 진입에 `setRoom`. 그다음에 효과 프리셋이 `hitFeel(...)` 의 값을 읽게 해서 두 표를 하나로 합친다(지금은 화면이 효과 프리셋의 값을 쓴다 — `r.stop`·`r.shake` 를 또 걸면 흔들림이 두 배가 된다).
2. 폴드에서 듣기: 시험 페이지를 폴드로 열어 §10-1 목록을 듣고 `table.js` 의 층 음량을 고친다(고친 뒤 검사 다시).
3. 애니메이션 접지 사건 → `feel.step`, 무기 궤적 시작 → `feel.swing` (표의 `lead` 와 동작의 판정 시각 맞추기).
4. 표면별 발소리, 적 종류별 예고음, 보스 전용 타격 층.
5. 종·주문을 녹음/생성 소재로 바꿔 비교(같은 이름으로 `assets/v2/audio` 에 넣으면 코드 변경 없음).
6. 배포: `assets/v2/audio` 를 웹·APK 묶음과 서비스 워커 캐시에 넣기, `assets/audio/LICENSE-CREDITS.txt` 에 v2 소리 절 추가(본문은 `assets/v2/audio/LICENSE.txt`).

## 12. 검수 (fxverify, 2026-11-17 15:10–15:55 UTC)

판정: **고쳐서 통과(PASS-WITH-FIXES)**. 검수 환경에서도 소리를 귀로 들을 수는 없었다 — 아래는 전부 숫자로 본 것이다.

다시 돌려 확인한 것:

- `node tools/v2/sound_check.mjs`: 렌더 298개 · 클리핑 0 · 빠진 파일 0 · 빈 소리 0 · 고리 이음매 튐 0 · 기능 시험 통과(보고와 같다). 세기별 타격 평균 L −24.8 · M −21.7 · H −18.6 · F −17.4 LUFS-M. 경고 1건은 보고에 적힌 그 경우(옛 샘플을 못 쓸 때의 마무리 일격이 리미터에 기댄다, 마스터 앞 +1.0 dBFS)다.
- **변형이 정말 달라진다**: 따로 돌린 두 번의 검사에서 타격 168가지의 피크가 하나도 같지 않았다(차이 중앙값 0.6 dB · 최대 4.0 dB). 시연 5종도 두 렌더의 차이가 신호 크기와 비슷한 수준이다(= 다른 변형 · 다른 높낮이가 뽑혔다).
- **새 파일**: 24개 · 253,275바이트(247 KiB) · 전부 AAC-LC 44.1 kHz 모노 · 풀었을 때 피크 최대 −1.0 dBFS · `LICENSE.txt` 있음(전부 수식 합성 원작). 색인의 해시와 맞는다.
- **2D 판 소리는 그대로다**: `src/core/audio.js` · `haptics.js` · `assets/audio` 의 마지막 변경은 이 작업이 시작되기 전이고, `node tools/test_sfx.mjs` 통과.
- 스펙트럼(ffmpeg 로 풀어 FFT): 3연타 시연은 에너지의 48 % 가 150 Hz 아래, 64 % 가 300 Hz 아래에 있다 → 휴대폰 스피커에서는 타격 무게의 큰 부분이 들리지 않는다(§10-3 이 적은 그대로이고, 숫자로는 "300 Hz 위에 36 % 만 남는다"). 종 가락은 67 % 가 300 Hz–2 kHz 라 스피커에서도 남는다.

찾은 것 · 고친 것:

1. **효과 쪽 사건 이름과 맞지 않았다.** 효과 엔진이 내보내는 소리 사건 53개 가운데 이 표(§6)에 있는 이름은 3개(`move.dash` · `move.jump` · `move.land`)뿐이었다 — 그대로 통합하면 효과 50종이 소리 없이 난다. 두 구역이 서로에게 "이름을 맞춰 달라"는 요청만 남긴 상태였다. → `src/v2/feel/fxbridge.js`(`bindFxSound(feel)` → `onEvent` · `strike` · `sync`)가 53개를 전부 소리 쪽 호출로 옮긴다. 20개는 표의 사건 그대로, 8개는 `feel.hit`, 4개는 v1 효과음(줍기 3 · 화염 숨결), 3개는 휘두름·발소리, 2개는 일부러 무음, **16개는 전용 소리가 없어 가까운 소리의 높낮이만 바꿔 빌려 쓴다**(재 죽음 · 숨결 시전 · 보호막 · 불기둥 · 운석 3 · 서리 폭발 2 · 낙뢰 2 · 종 시전 · 그림자 2 · 궁극기 빛창 · 궁극기 마무리). 검사 `node tools/v2/fx_sound_link.mjs`(표가 어긋나면 실패). 진짜 `feel` + 진짜 효과 엔진을 브라우저에서 이어 프리셋 32개와 난전 10초를 돌려 오류 0 을 확인했다(`node tools/v2/fx_verify.mjs bridge`) — 다만 헤드리스에서는 오디오 엔진이 켜지지 않아 **다리를 거친 소리가 실제로 울리는 것까지는 보지 못했다**.
2. **"소리와 화면이 같은 표를 읽는다"는 사실이 아니었다**(§0 을 고침). 효과 프리셋은 자기 값을 쓴다. 차이는 `docs/v2/FX.md` §11.3 의 표 — 예: 마무리 일격의 멈춤 0.133초(효과) vs 0.190초(이 표), 둔기 0.100 vs 0.137. 재질별 멈춤 배율은 화면에 반영되지 않는다.
3. 계약(§2)의 `feel.hit` 과 효과 프리셋을 같은 타격에 둘 다 부르면 소리는 한 번이지만 **흔들림이 두 번** 걸린다 → 통합은 `bridge.strike(...)` 한 줄로(FX.md §11.1).

보고가 실제와 달랐던 것 · 덧붙일 것:

- "마스터 앞 피크 최대 −0.4 dBFS" 는 돌릴 때마다 조금 다르다(이번에는 시연에서 −0.2, 대체 경로 +1.0). 무작위 변형 때문이다.
- **들어 보기용 `demo_*.m4a` 는 AAC 로 묶은 뒤 풀면 피크가 +0.9 ~ +1.7 dBFS** 다(엔진 출력은 −0.7). 재생기에 따라 시연 파일이 살짝 깨져 들릴 수 있다 — 게임 소리가 아니라 캡처 파일의 문제이니 귀로 판단할 때 감안할 것.
- **발소리가 아주 작다**: `step.*` 은 −41 ~ −31 LUFS-M 로 약한 타격(−24.8)보다 7–17 dB 작다. 폴드 스피커에서 안 들릴 수 있다 — 먼저 들어 볼 목록(§10-1)에 넣을 것.
- 날아가는 마법의 고리 소리(`loop.magic.*`)는 효과 엔진이 탄의 자리를 밖으로 내주지 않아 아직 붙일 수 없다. 적 정의에 `material` 이 없어 통합 초기에는 모든 적이 한 재질로 들린다.

## 14. 깨지는 것의 소리 (BREAK, 2026-11-18)

(English.) Events in `src/v2/feel/table.js` `EVENT` (made like the others: layers + recipe); samples synthesized by `python3 tools/v2/audio/build_break_audio.py` into `assets/v2/audio` (18 files, 128 KB, entries merged into `index.json` - the folder ships whole).

| event | layers | recipe |
|---|---|---|
| `break.clay` | `n clay_crash` 0.92 - `o candle` 0.5 p 1.12 (q1) - `n clay_tinkle` at 0.09 s, random start (q1) - `n debris` at 0.13 s p 1.5 (q2) | bus `f3_enemy`, gain 1.15, haptic `breakL`, stop 0.03, shake 0.07 |
| `break.clay.b` | `n clay_crash` p 1.08 - `o candle` p 0.9 (q1) - `n clay_tinkle` at 0.16 s p 1.12 | same |
| `break.clay.c` | `n clay_crash` p 0.94 - `o hit_stone` p 1.3 (q1) - `n clay_tinkle` at 0.05 s p 0.9 (q1) - `n debris` at 0.2 s (q2) | same |
| `break.crate` | `n wood_crack` - `o step_wood` p 0.8 - `s knock` (q1) - `n wood_clatter` at 0.07 s - `n debris` (q2) | gain 1.1, `breakL`, stop 0.035, shake 0.09 |
| `break.barrel` | `n wood_crack` p 0.78 - `s thud` - `n wood_clatter` p 0.82 at 0.08 s - `n hoop_ring` at 0.05 s - `o clang` p 0.7 (q2) | gain 1.15, `breakL`, stop 0.04, shake 0.11 |
| `pickup.clink` | `n coin_clink` | bus `f3_foley`, gain 0.7 |

- **Why it says clay**: `clay_crash` (4 variants, 0.55-0.66 s) = the snap of the wall + a dry band-passed clack + **the hollow knock of the vessel** (380-570 Hz, 24 ms - a pane of glass has none) + a short bright ring of six inharmonic partials (base 1.0-1.4 kHz, 50 ms) + big pieces landing (0.85-2.5 kHz) + small shards raining down with bounces (1.6-5.2 kHz). Measured spectrum of the four files: 17-21 % in 300 Hz-1 kHz, 57-66 % in 1-3 kHz, 13-19 % in 3-8 kHz (a struck glass sample of the old pack: 100 % in 1-3 kHz, no body, 0.05 s).
- **Never the same twice**: three layer sets (the scene never repeats one in a row) x 4 crash variants and 3 tinkle variants (the bank never repeats the last variant) x the scene's pitch 0.9-1.14 and level 0.9-1.1 x each layer's own +-4.5 % pitch, +-8 % level x a random start of the tinkle layer (0.08-0.14 s) x the kind's size (urn 1.2, pot 1.0, jar 0.9).
- Wood: `wood_crack` (two cracks 20-40 ms apart, a 140-230 Hz knock, splinters), `wood_clatter` (6-9 boards landing: free-bar modes 260-880 Hz), `hoop_ring` (an iron hoop: partials of 690 / 820 Hz, three bounces, a wobble that speeds up as it settles).
- Haptic `breakL`: pad weak motor 0.3 for 45 ms, phone 6 ms (the lightest enemy blow that vibrates a phone, `hitM`, is 8 ms).
- Honest: all of it is synthesis by formula, judged by spectrum and envelope in this container - nobody has heard it on a phone speaker yet.
