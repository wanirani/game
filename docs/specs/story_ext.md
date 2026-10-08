# 시련 에피소드와 이야기 보강 (spec F-STORY)

**Status: FROZEN for implementation — 2026-10-08 (merged by the F critic from `fdesign/story_draft.md`, checked against
`plan/fu_a3.md`, `fu_a4.md` and the working tree). Engine, ids, data model and package ownership: `docs/specs/classes_t3.md`.**

Player-facing text is Korean and ships **verbatim**. Every bg/cg/portrait/music/sfx id below was checked to exist
(`assets/bg`, `assets/cg`, `assets/portraits`, `audio` music `story/church/sad`, sfx `bell`). New glyphs (륀, 힐, 겹, 덧, 휜 …) →
the lead rebuilds the font subsets once after all story packages land.

---------------------------------------------------------------------------------------------------------------------------

## 0. What changed versus the draft
- **Kael's graves**: 4, not 11. The pact and the first seal are 400 years old (1397); one Valcrane per red moon: 1397, 1497,
  1597, 1697 (Edmund) → four graves; 1797 is the fifth red moon. Kael Ⅰ, banter `inn_bran_kael` fixed accordingly.
- **Trial mods**: `hp_x1.5` replaced by `diffOver.bossHp 1.25` for Death and Dracula (two-form fights); Victor Ⅱ uses `glass`
  only (no `no_potion`) — fight band 40–75 s.
- **Alberto in Part 2**: hidden from the hub from `p2_started` **plus** a church row 「안쪽 방 — 신부님」 that emits `npcTalk`
  (the draft's plain hide broke `el_letter` and the `ab_dawnflower` offer in `npc_alberto_ch18`). Owner: UI-CHURCH-CLASS.
- **Companion join queue** persisted as flags `cmpq_<id>` (an in-memory queue would lose joins on quit).
- **Credits**: `CREDITS_EX` lives in `story_ex.js` (GAPS-A); `creditsFor` reads it through a namespace import (GAPS-B).
- **Cut**: per-hero class-change lines (draft B10), credits block 「메아리 속의 이름들」, the church-keeper hook in
  `story_director.js` (the church decides its keeper itself).
- Accepted engine requests (now in classes_t3 §2–§9): `reqFlag/reqText`, replay scripts `tr_again_*`, strict current-cycle
  `p2_done` start gate, Elise `failLine`.

---------------------------------------------------------------------------------------------------------------------------

## 1. Conventions

- **Format** (`story.js:1-15`): line `{who, text, name?, portrait?, side?, if?}`; commands as in story_ex.js. **No new commands
  or conditions anywhere** — branches use flags (`ex_sNN_done`, `ending_p2true`, `echo_known`, `*_joined`), `{char}`, labels.
  `dialogue.js`, `front/story.js` (`REPLAY_SKIP`) and `results.js` stay untouched.
- **Trial scripts are single-hero** → `H('…')` takes a plain string. Every other new `H({…})` lists all seven heroes + `default`.
- **Voices** (fu_a3 §4): Alberto 하게체 (~구먼/~게/~네); Bran ~소/~오/~구려; Raven formal ~다, merchant ~습죠/헤헤 when flustered;
  Lia clipped informal; Sera polite ~요 + "주여"; Elise child polite, promises end "약속!"; Isolde knightly ~다/~지; Carmilla
  "후후"; Hadwin terse; Greta blunt; Marta hearty "호호!"; Nemain stern ~다/~거라; Hagen gruff "꼬마"; Dracula archaic ~느냐/~구나;
  Death "크크".
- **Lengths** (chars): hero ≤ 79 (aim ≤ 44), NPC ≤ 86 (aim ≤ 54), narration ≤ 134 (aim ≤ 64). Tested by `test_part2.mjs`.
- **Markers**: every trial `_win` ends with an `[안내]` line; no `[TIP]` in trials.
- **Echo speakers**: boss id + `name: '○○의 메아리'` (boss portrait); people without portraits use free names
  (`speakerInfo` falls back to the string; already used: '에드문트의 환영', '성녀 루미나', '아멜리아의 환영').
- **Outro rule** (`story_ex.js:37-41`) does not bind trial `_win` scripts (no rewards, no `hasNewBranch`), but no unconditional
  `flag` after a conditional line anywhere.
- **Gallery theatre stays 8**, **achievements stay 67** (no new ids, no desc changes).

---------------------------------------------------------------------------------------------------------------------------

## 2. Trial data (copied verbatim into `src/data/trials.js` by ASC-CORE)

Common: `room: 'boss'` · Ⅰ: `reqLevel 70, level 74, recLv 72, unlock 't3'` · Ⅱ: `reqLevel 75, level 80, recLv 78, unlock 'hidden'` ·
`pre: 'tr_<hero>_<n>_pre'`, `win: 'tr_<hero>_<n>_win'`, `preAgain: 'tr_again_pre'`, `winAgain: 'tr_again_win'`. All boss rooms
verified (every stage has room `boss`; s10+ set `bossId`). No trial uses `dark`.

| tid | `name` | stage → boss | `mods` | `diffOver` | `bossPatterns` | `reqFlag` / `reqText` |
|---|---|---|---|---|---|---|
| tr_kael_1 | 시련 Ⅰ · 묘비의 빈 줄 | s02 → b_banshee | `no_sub` | `{bossHp:1.3}` | true | — |
| tr_kael_2 | 시련 Ⅱ · 첫 번째 봉인 | s01 → b_nightwing | `no_potion`, `haste` | `{bossHp:1.3}` | true | — |
| tr_sera_1 | 시련 Ⅰ · 얼어붙은 기도 | s10 → b_frostqueen | — | — | false | — |
| tr_sera_2 | 시련 Ⅱ · 침묵의 대답 | s16 → b_dagon | `no_potion` | `{bossHp:1.15}` | true | — |
| tr_victor_1 | 시련 Ⅰ · 멈춘 시계의 총잡이 | s09 → b_colossus | `haste` | — | true | `ex_s23_done` / `외전 「빈칸의 현상금」을 먼저 보아야 한다` |
| tr_victor_2 | 시련 Ⅱ · 현상금 — 평생 | s23 → b_hagen | `glass` | `{bossHp:1.15}` | true | — |
| tr_bran_1 | 시련 Ⅰ · 무릎 꿇은 단장 | s04 → b_crimson | `no_sub` | `{bossHp:1.3}` | true | — |
| tr_bran_2 | 시련 Ⅱ · 사신의 장부 | s11 → b_death | `no_potion` | `{bossHp:1.25}` | true | — |
| tr_lia_1 | 시련 Ⅰ · 열세 번 인형 | s22 → b_nemain | `glass` | — | false | `ex_s22_done` / `외전 「이름 없는 언덕」을 먼저 보아야 한다` |
| tr_lia_2 | 시련 Ⅱ · 기록에 없는 사람 | s10 → b_frostqueen | `no_potion`, `no_sub` | `{bossHp:1.15}` | true | — |
| tr_azel_1 | 시련 Ⅰ · 자장가 | s18 → b_mara | — | — | false | — |
| tr_azel_2 | 시련 Ⅱ · 아멜리아의 요람 | s12 → b_dracula | `no_potion` | `{bossHp:1.25}` | true | — |
| tr_isolde_1 | 시련 Ⅰ · 거울이 가져간 밤 | s14 → b_narkissa | — | — | false | — |
| tr_isolde_2 | 시련 Ⅱ · 기사단이 무너진 밤 | s17 → b_ziz | `no_potion`, `haste` | `{bossHp:1.15}` | true | `ex_s21_done` / `외전 「하늘 정원의 둥지」를 먼저 보아야 한다` |

s01/s02/s04 bosses have short native pattern lists → `bossHp 1.3` + NG pattern set as the start point; QA-ASC tunes only
`diffOver.bossHp` to keep a Lv 70/75 model hero in the 40–75 s band. s10 appears twice (Sera Ⅰ, Lia Ⅱ — the same 1697 ice wall,
by design). Room gimmicks load normally (s14 mirror, s16 deep, s17 wind, s18 heartbeat, s22/s23 wind).

| tid | `desc` (church card, ≤ 24 chars) | win `bg` | win `music` | `failLine` (Elise, ≤ 44) |
|---|---|---|---|---|
| tr_kael_1 | 발크레인 비석마다 깎여 나간 마지막 한 줄 | s02_graveyard | story | 비석은 기다려 줄 거예요. 다시 가요, 카엘 님! |
| tr_kael_2 | 사백 년 전, 종탑 아래서 맺은 첫 약속 | s01_village | church | 종은 계속 칠게요. 오실 때까지요. 약속! |
| tr_sera_1 | 얼음 속에서 멈춘 선배 수녀들의 기도 | s10_spire | church | 수녀님, 기도는 아직 안 끝났어요. 한 번 더요! |
| tr_sera_2 | 빛이 닿지 않는 바다 밑, 침묵의 설교 | s16_sunken | church | 바다 밑은 어두워도 종소리는 닿아요. 다시 가요. |
| tr_victor_1 | 1697년, 시계를 멈추러 간 총잡이 | s09_clocktower | story | 시계는 다시 돌아요. 이번엔 먼저 쏘세요! |
| tr_victor_2 | 꿈속의 공고, 액수 칸에 적힌 "괴물" | s10_spire | sad | 수업은 아직 안 끝났대요. 다시 가요, 아저씨! |
| tr_bran_1 | 형제들을 위해 무릎 꿇은 단장 | s04_hall | story | 단장님은 기다리고 계실 거예요. 다시 가요! |
| tr_bran_2 | 십 년 일찍 온 사신, 장부의 한 줄 | s11_chapel | church | 장부는 아직 안 덮였어요. 한 번 더요, 아저씨! |
| tr_lia_1 | 촛불 없는 방, 끝나지 않은 가르침 | s02_graveyard | story | 열세 번은 언니가 아니에요. 다시 가요, 언니! |
| tr_lia_2 | 빙벽 속 까마귀 문신, 기록에 없는 사람 | s10_spire | sad | 그분, 아직 집에 가는 길이래요. 데리러 가요! |
| tr_azel_1 | 잊어버린 어머니의 자장가 | s18_nightmare | story | 자장가는 끝나지 않았어요. 한 번 더 들어요. |
| tr_azel_2 | 왕좌 곁 아이 방, 백 년 전 그 밤 | s12_throne | sad | 아버님 대답, 아직 못 들으셨잖아요. 다시요! |
| tr_isolde_1 | 거울이 품고 간 기사단의 마지막 밤 | s14_mirror | story | 거울은 그 밤을 아직 쥐고 있어요. 다시 가요! |
| tr_isolde_2 | 하늘이 무너진 밤, 단장의 마지막 명령 | s17_sky | church | 폭풍은 지나가요. 언니 창은 안 부러져요! |
(`bg` values are `bg/<id>` keys; the scripts below set their own `bg`/`cg` anyway. Sera Ⅱ's script opens with `cg('cg_sunken_cathedral')`.)

---------------------------------------------------------------------------------------------------------------------------

## 3. The frame — 「메아리」 (STORY-TRIALS, `src/data/story_trials.js`)

### 3.1 In-world rule
After Nihil fell the void did not forget what it swallowed (`b_nihil_form2`: "너희가 쓰러뜨린 모든 것은 결국 나에게로 돌아온다").
When Elise rings the church bell — the seventh anchor (§5.2) — the toll comes back from the healed sky as an **echo**: a
remembered battlefield. With Raven's rift lantern a hunter can walk in and face what was left unfinished.

| engine rule | in-world reason |
|---|---|
| boss room only, doors sealed | an echo is one remembered moment ("시련의 결계") |
| no loot, EXP, gold | "아무것도 들고 나올 수 없다. 금화 한 닢도." |
| death = wake up, retry/leave | "쓰러져도 몸은 이 종 아래서 깨어난다" |
| rule modifiers | each echo remembers the night's own rule |
| NG pattern set | the boss as the hunter remembers it — crueller |
| replays | "종은 몇 번이고 다시 칠 수 있어요" |

Givers: **Elise** (rings the bell, holds the rope; church keeper in Part 2), **Raven** (`RVX` masked/unmasked after
`ending_p2true`), **Alberto** only from the back room via `AB()` (4 lines total), guests per episode.

### 3.2 Play modes
| script | played by | scene | allowed |
|---|---|---|---|
| `tr_<hero>_<n>_pre` | `startTrial` → `game.push('dialogue', {script})` over the church | dialogue overlay | `cg`, `flash`, `shake`, `music`, `sfx`, `flag`, `if`, `goto` (no `bg`/`title`/`wait`) |
| `tr_<hero>_<n>_win` | `completeTrial` → `go('story', {script, bg, music})` | cinematic | + `bg`, `title`, `wait` |
| `tr_again_pre` / `tr_again_win` | replays of a done trial | as above | — |

All 14 `_pre` begin with `...TRIAL_FRAME` (once per save cycle via the cosmetic flag `echo_known`; NG+ wipes it → a new cycle
hears it once more). Completion lives on `hero.trials`; scripts set **no** gameplay flags.

### 3.3 Local helpers (`story_trials.js`; no import of story.js — same rule as story_ex.js)
```js
const N = (text, x) => ({ who: 'narrator', text, ...x });
const H = (text, x) => ({ who: 'hero', text, ...x });
const S = (who, text, x) => ({ who, text, ...x });
const cg = (id = null) => ({ cmd: 'cg', id });
const bg = (id) => ({ cmd: 'bg', id });
const bgm = (id) => ({ cmd: 'music', id });
const flag = (key, value = true) => ({ cmd: 'flag', key, value });
const L = (label) => ({ label });
const ifFlag = (f, label) => ({ if: f, cmd: 'goto', label });
const EL = 'npc_elise', A = 'npc_alberto', MA = 'npc_marta', RO = 'npc_rook', G = 'npc_greta';
const RVX = (text) => [{ if: '!ending_p2true', who: RO, name: '레이븐', text },
                       { if: 'ending_p2true', who: RO, name: '레이븐', portrait: 'portraits/npc_rook2', text }];
const AB = (text) => ({ who: A, text: `(안쪽 방에서) ${text}` });
const NM2 = (text) => ({ who: 'b_nemain', name: '네메인', portrait: 'portraits/b_nemain2', text });
const ECHO = (who, name, text, portrait) => ({ who, name, text, ...(portrait ? { portrait } : {}) });
const CMPX = (id, name, portrait, text) => ({ who: id, name, portrait, text });
const B = (who, text, side = 'right') => ({ who, text, side });
```

### 3.4 `TRIAL_FRAME` and replay scripts
```js
const TRIAL_FRAME = [
  ifFlag('echo_known', 'frame_end'),
  N('성당 종탑 아래. 엘리제가 두 손으로 종 줄을 붙든 채 숨을 고르고 있었다.'),
  S(EL, '헌터님, 이상해요. 종을 칠 때마다 하늘 저편에서 소리가 되돌아와요.'),
  S(EL, '되돌아온 소리 속에… 예전에 헌터님들이 싸웠던 것들이 보여요.'),
  ...RVX('메아리다. 공허는 삼킨 것을 잊지 않는다. 쓰러진 것들의 그림자가 아직 그 안을 떠돌지.'),
  ...RVX('등불을 들고 종소리를 따라가면 그 메아리 속으로 걸어 들어갈 수 있다. 저마다 끝내지 못한 밤으로.'),
  ...RVX('거기서 쓰러져도 몸은 이 종 아래서 깨어난다. 대신 아무것도 들고 나올 수 없다. 금화 한 닢도.'),
  S(EL, '가지고 나오는 건 마음뿐이래요. …그래도 길 잃지 않게 계속 종 칠게요. 약속!'),
  AB('…콜록. 메아리라… 이 늙은이 몫도 백 년 치는 있겠구먼. 다녀오게.'),
  flag('echo_known'),
  L('frame_end'),
];
// SCRIPTS_TRIALS:
tr_again_pre: [S(EL, '또 메아리 속으로요? 종 줄 꼭 잡고 있을게요!')],
tr_again_win: [bg('hub'), N('종소리를 따라 돌아왔다. 메아리는 한 번 더, 같은 대답을 들려주었다.')],
```

---------------------------------------------------------------------------------------------------------------------------

## 4. The 14 episodes

### 4.1 KAEL — the undefined "promise" (story.js:53/:933), d19 "first sealer" + scratched crest (lore.js:65), the whip on the wall (story_p2b.js:107)
Arc: Ⅰ asks *what* the promise is (written on every Valcrane grave, then erased); Ⅱ answers *to whom*: the first Valcrane swore to
Lumina's bell-keeper girl "종이 울리면 발크레인이 간다". Kael hangs the whip on the bell tower: within reach, within the bell's sound.

#### tr_kael_1 · 시련 Ⅰ · 묘비의 빈 줄 — s02 boss, b_banshee
Echo fit: the Banshee Queen sang every Valcrane into the ground; she remembers the line that was chiselled off. Mod `no_sub`
("조상들 앞에서는 채찍 한 자루로").
Beats `_pre`: back from the graves → four stones, last line erased → nobody told him what the promise *is* → Raven points to the
Banshee's memory → whip only. `_win`: song breaks → the Banshee refuses a fifth song → the line returns → the whip was a promise,
not a curse → still not *to whom* → vow at Edmund's grave.
```js
tr_kael_1_pre: [ ...TRIAL_FRAME,
  N('안개의 묘지에서 돌아온 카엘의 외투 자락이 젖어 있었다.'),
  H('발크레인 묘역에 다녀왔다. 비석이 넷. 백 년마다 한 사람씩이다.'),
  H('그런데 비석마다 맨 아래 한 줄이 깎여 있다. 이끼를 걷으면 "종이 울리면—" 그것뿐이다.'),
  S(EL, '종이 울리면…? 그다음은 몰라요?'),
  H('모른다. 아버지도 몰랐다. 우리는 그저 "약속"이라고만 배웠다. 누구와의 약속인지도 모른 채.'),
  ...RVX('밴시 여왕은 백 년마다 무덤에 들어가는 발크레인을 하나도 빠짐없이 노래로 배웅했다.'),
  ...RVX('그녀의 메아리라면 깎인 줄을 기억할 거다. 노래는 돌보다 오래 남으니까.'),
  H('좋다. 비질리아 한 자루로 간다. 조상들 앞에서 잔재주는 부리지 않겠다.'),
  S(EL, '종 칠게요. 노래에 홀리지 마세요!'),
],
tr_kael_1_win: [ bgm('story'), bg('s02_graveyard'),
  N('노랫소리가 끊기자 안개가 걷혔다. 비석 네 개 위로 새벽빛이 내려앉았다.'),
  ECHO('b_banshee', '밴시 여왕의 메아리', '…다섯 번째 노래는… 아직… 부르지 않겠다…'),
  N('밴시가 사라진 자리에서, 깎인 글씨가 한 비석씩 빛으로 되살아났다.'),
  N('"종이 울리면, 발크레인이 간다."'),
  H('…종. 에슈빌의 종인가.'),
  H('악몽이 말했다. 이 채찍은 영원히 벽에 걸리지 않는다고. …저주인 줄 알았다.'),
  H('아니었다. 누군가 종을 치면 누군가는 가야 한다. 우리가 그 누군가였을 뿐이다.'),
  N('카엘은 에드문트의 비석 앞에 무릎을 꿇었다. "밤을 끝낸 자" 아래에 빈칸 한 줄이 남아 있었다.'),
  H('누구와 맺은 약속인지, 끝까지 찾아내겠습니다. 고조할아버지.'),
  N('[안내] 초월의 길이 열렸다. 성당 「전직」에서 고를 수 있다.'),
],
```

#### tr_kael_2 · 시련 Ⅱ · 첫 번째 봉인 — s01 boss, b_nightwing
Echo fit: on the first night the Count's bats nested on Eshville's **bell tower** (s01_t1, b_nightwing_pre); every red moon the
Count strikes the bell first. The tower's echo stacks four centuries. Mods `no_potion`, `haste`.
Beats `_pre`: whip marks on the bell's rim → Alberto: the bell is older than the church, always rung by a golden-haired girl →
Raven: Lumina's seventh anchor → the first Valcrane will be in that echo. `_win`: stacked red moons vanish → Albrecht (first
sealer) and Edmund → the promise to the bell girl → dawn: Kael renews it with Elise → the whip goes on the bell-tower post.
```js
tr_kael_2_pre: [ ...TRIAL_FRAME,
  S(EL, '카엘 님, 종 테두리에 긁힌 자국이 있어요. 아주 오래된… 채찍 자국 같아요.'),
  H('채찍 자국이 종에? …이 각도, 발크레인 문장이다.'),
  AB('그 종은 성당보다 먼저 있었다네. 내 앞의 신부들이 그러더군. 종은 늘 금빛 머리 아이가 쳤다고.'),
  ...RVX('루미나의 피다. 저 종은 그녀가 내린 일곱 번째 닻. 이 세계를 붙드는 마지막 닻이지.'),
  ...RVX('그래서 붉은 달이 뜨는 밤마다 백작은 제일 먼저 종탑을 노렸다. 박쥐 떼로.'),
  H('…나이트윙. 첫날 밤 종탑에 둥지를 틀었던 놈.'),
  ...RVX('종탑의 메아리에는 백 년 치가 겹쳐 있을 거다. 어쩌면 사백 년 치가.'),
  H('그렇다면 거기서 첫 번째 발크레인을 만나겠군. 다녀오지.'),
  S(EL, '이번엔 제가 칠게요. 종이 울리면 오시는 거예요. …그쵸?'),
],
tr_kael_2_win: [ bgm('church'), bg('s01_village'),
  N('박쥐 떼가 흩어지자, 종탑 위에 겹쳐 있던 붉은 달들이 하나씩 지워졌다.'),
  N('마지막 종소리 속에서, 채찍을 든 두 사내의 그림자가 나란히 섰다.'),
  ECHO('에드문트의 환영', '에드문트의 환영', '왔구나, 내 핏줄아. 이 종탑에서 우리 가문은 사백 년 동안 같은 싸움을 했다.'),
  ECHO('알브레히트의 환영', '알브레히트의 환영', '나는 알브레히트. 백작을 처음 봉인한 자다. 그 밤, 종을 치던 소녀가 울면서 물었지.'),
  ECHO('알브레히트의 환영', '알브레히트의 환영', '"다음 붉은 달에도 와 줄 건가요?" …그래서 약속했다. 종이 울리면 발크레인이 간다고.'),
  ECHO('에드문트의 환영', '에드문트의 환영', '나는 그 약속을 지켰지만, 돌아와 종 아래 서지는 못했다. 너는 해냈다.'),
  H('…약속의 상대는 종지기였군요. 루미나의 피를 이은 아이들.'),
  bg('hub'),
  N('새벽. 에슈빌 성당 종탑 아래, 엘리제가 종 줄을 쥔 채 기다리고 있었다.'),
  S(EL, '돌아오셨다! …무슨 일 있었어요? 얼굴이 이상해요.'),
  H('사백 년 묵은 약속을 고쳐 쓰러 왔다. 엘리제, 네가 종을 치면 발크레인이 간다.'),
  S(EL, '그럼 저도 약속할게요. 하루도 안 빼먹고 칠게요. 약속!'),
  N('그날 카엘은 비질리아를 가문의 벽에서 내려 종탑 기둥에 걸었다. 손이 닿는 곳에. 종소리가 닿는 곳에.'),
  N('[안내] 비전의 길이 열렸다. 성당 「전직」에서 확인할 수 있다.'),
],
```

### 4.2 SERA — the frozen elder nuns (story.js:782) + the silent God (s14 mirror, s18 nightmare, Dracula)
Arc: Ⅰ keeps "반드시 녹여 드릴게요" and finishes the 1697 sisters' prayer (they came from the Rose Convent, s24). Ⅱ answers "신이
침묵하면 너는 누구에게 기도하지?": the answer to a prayer is the people who hear the bell. She becomes Elise's second bell-ringer.

#### tr_sera_1 · 시련 Ⅰ · 얼어붙은 기도 — s10 boss, b_frostqueen
```js
tr_sera_1_pre: [ ...TRIAL_FRAME,
  S(EL, '세라 수녀님, 기도하다가 우셨어요?'),
  H('…아니에요. 얼음 속 선배님들 생각이 나서요. 녹여 드리겠다고 약속했는데, 성이 먼저 가라앉았어요.'),
  { if: 'ex_s24_done', who: 'hero', text: '장미 수녀원의 명부를 봤어요. 백 년 전 성으로 떠난 언니들은 일곱 분이셨어요.' },
  ...RVX('이자벨라의 정원은 메아리 속에 그대로 남아 있다. 그녀는 아름다운 것을 놓아주지 않으니까.'),
  ...RVX('그 수녀들의 기도는 얼음에 갇힌 채 문장 한가운데서 멈춰 있다. 끝맺지 못한 기도는 메아리가 되기 쉽지.'),
  H('그럼 제가 마저 끝내 드릴게요. 주여, 이번엔 늦지 않게 해 주세요.'),
  S(EL, '수녀님 기도 끝날 때까지 종 계속 칠게요!'),
],
tr_sera_1_win: [ bgm('church'), bg('s10_spire'),
  N('서리 여왕의 메아리가 부서지자, 빙벽 속의 얼굴들이 하나씩 녹아내렸다.'),
  ECHO('b_frostqueen', '이자벨라의 메아리', '…왜 녹는 거지. 이렇게… 아름다운데…'),
  H('아름다워서 붙잡아 두면, 그건 기도가 아니라 감옥이에요.'),
  ECHO('아그네스 수녀의 메아리', '아그네스 수녀의 메아리', '…"주여, 저희가 돌아가지 못하거든—" 거기서 얼음이 왔지요.'),
  H('"저희 대신 종을 울려 줄 아이를 보내 주소서." …수도원에서 매일 저녁 외우던 기도예요. 끝 구절은 제가 알아요.'),
  N('두 목소리가 겹쳤다. 백 년 동안 멈춰 있던 기도가 마침내 "아멘"에 닿았다.'),
  ECHO('아그네스 수녀의 메아리', '아그네스 수녀의 메아리', '그 아이가 너였구나. …고맙다, 막내야.'),
  N('수녀들은 미소 지으며 빛이 되어 흩어졌다. 빙벽에는 아직 두 그림자가 남아 있었다. 총을 쥔 사내와, 까마귀 문신의 사내.'),
  H('다른 선배님들은 기다리는 사람이 따로 있나 봐요. 주님, 그분들의 차례도 꼭 와 주세요.'),
  N('[안내] 초월의 길이 열렸다. 성당 「전직」에서 고를 수 있다.'),
],
```
(The two remaining shadows hook Victor Ⅰ and Lia Ⅱ — one shared ice wall, three heroes.)

#### tr_sera_2 · 시련 Ⅱ · 침묵의 대답 — s16 boss, b_dagon
Echo fit: Dagon sank his city to hide from the void and preached to the dark until "빛을 잊었다" (l26) — a faith that hid from
silence. Lumina's fresco is in the sunken cathedral.
```js
tr_sera_2_pre: [ ...TRIAL_FRAME,
  N('한밤의 성당. 세라는 제단 앞에 무릎을 꿇은 채 한참 동안 움직이지 않았다.'),
  S(EL, '수녀님, 아직 기도해요? 벌써 종 세 번 쳤어요.'),
  H('…엘리제, 하나만 물어봐도 될까요. 기도할 때 대답을 들어 본 적 있어요?'),
  S(EL, '음… 없어요. 그래도 종을 치면 헌터님들이 와요. 그게 대답인 줄 알았는데요?'),
  H('거울도, 악몽도, 백작도 같은 걸 물었어요. 신이 침묵하면 너는 누구에게 기도하느냐고.'),
  ...RVX('가라앉은 성소의 사제왕도 그 질문 앞에서 무너졌다. 도시를 바다 밑에 가라앉히고 어둠을 향해 설교했지.'),
  ...RVX('루미나의 벽화가 있는 곳이다. …그녀라면 그 질문에 웃으면서 대답했을 텐데.'),
  H('그럼 가서 직접 들을게요. 침묵의 맨 밑바닥에서요.'),
],
tr_sera_2_win: [ bgm('church'), cg('cg_sunken_cathedral'),
  N('사제왕의 메아리가 가라앉자, 심해의 대성당에 천 년 만에 빛 한 줄기가 내려왔다.'),
  ECHO('b_dagon', '다곤의 메아리', '…빛이… 다시… 대답했는가…'),
  ECHO('성녀 루미나', '성녀 루미나', '대답은 늘 있었어요. 다만 하늘에서 내려오지 않았을 뿐이에요.'),
  ECHO('성녀 루미나', '성녀 루미나', '내가 종을 만든 건 그래서예요. 누군가 울면, 누군가 듣고 달려오도록.'),
  H('…그래서 종이 울리면 헌터들이 왔군요. 기도의 대답은 사람이었어요.'),
  ECHO('성녀 루미나', '성녀 루미나', '빛은 나누어 가질 때 가장 밝아요. 그 아이 혼자 종을 지게 하지 말아 주세요.'),
  cg(), bg('hub'),
  N('새벽. 성당 종탑에 줄이 하나 더 매어졌다. 어른 키에 맞춘 높이였다.'),
  S(EL, '수녀님도 종 치시게요? 그럼 저는 아침, 수녀님은 저녁 해요!'),
  H('네. 주여, 이제 알겠어요. 당신의 침묵은 저희에게 맡기신 자리였군요.'),
  S(EL, '그럼 둘이 같이 치는 거예요. 약속!'),
  N('[안내] 비전의 길이 열렸다. 성당 「전직」에서 확인할 수 있다.'),
],
```

### 4.3 VICTOR — the frozen gunslinger senior (story.js:783) + life after Hagen
Arc: Ⅰ names the 1697 gunslinger in the ice — **울프람**, origin of the wolf-paw brand and the blank bounty. Ⅱ is his fear (s18
"현상금: 괴물"): becoming Hagen. Hagen's echo gives the last lesson; Victor fills in an amount for the first time — he takes an
apprentice. Alberto owns the blank prologue bounty (story_ex.js:510/:512).

#### tr_victor_1 · 시련 Ⅰ · 멈춘 시계의 총잡이 — s09 boss, b_colossus (`reqFlag ex_s23_done`)
Echo fit: the clock measures the red moon (l09); in 1697 and 1797 a man sabotaged it to buy the hunters an hour. Mod `haste`.
```js
tr_victor_1_pre: [ ...TRIAL_FRAME,
  N('빅터가 성당 의자에 하겐의 산장에서 가져온 공고 다발을 늘어놓았다.'),
  H('영감 산장에 붙어 있던 빈칸 공고들, 전부 붉은 줄로 지워져 있었지. 맨 밑의 한 장만 빼고.'),
  H('1697년. 낙인은 늑대 발자국. 맡을 사냥꾼 칸엔 "울프람". 액수 칸은 역시 비었고.'),
  S(EL, '백 년 전이요? 그럼 그분이… 얼음 속에 계신 총잡이 아저씨예요?'),
  H('첨탑 빙벽에서 본 그 선배일 거야. 영감의 영감의 영감쯤 되겠군. 빈칸 공고는 거기서 시작된 거고.'),
  ...RVX('뒷면을 봐라. 시계탑의 태엽 문양이다. 백 년 전에도 그 시계는 붉은 달을 재고 있었지.'),
  ...RVX('그 사내는 시계를 멈추러 올라갔다. 오토가 톱니를 거꾸로 끼운 것처럼.'),
  H('빈칸 공고는 살아남은 놈이 값을 매기는 거라고 배웠어. 이건 아직 아무도 안 매겼거든.'),
  S(EL, '종소리 빨라지면 서두르라는 뜻이에요!'),
],
tr_victor_1_win: [ bgm('story'), bg('s09_clocktower'),
  N('거신이 무너지자, 미친 듯이 돌던 시곗바늘이 자정 일 분 전에서 멈췄다.'),
  ECHO('울프람의 메아리', '울프람의 메아리', '…쏴서 멈췄나. 아니면 기다려서 멈췄나.'),
  H('둘 다. 영감한테 배웠어. 겁나는 걸 아는 놈이 끝까지 본다고.'),
  ECHO('울프람의 메아리', '울프람의 메아리', '하겐 녀석, 제대로 가르쳤군. 그 늑대 발자국 낙인, 내가 처음 찍은 거다.'),
  ECHO('울프람의 메아리', '울프람의 메아리', '액수 칸을 비운 건 돌아오지 못할 걸 알아서였다. 값은 살아남은 놈이 정하라고.'),
  H('…백 년 늦었지만 정산하러 왔어, 선배.'),
  N('빅터는 낡은 공고의 액수 칸에 천천히 적었다. "현상금 — 한 시간." 그 아래 작게. "오토의 몫 포함."'),
  ECHO('울프람의 메아리', '울프람의 메아리', '하하… 싸구려군. 마음에 든다.'),
  N('같은 순간, 북쪽 하늘 저편 빙벽 속에서 총을 쥔 그림자 하나가 조용히 눈을 감았다.'),
  N('[안내] 초월의 길이 열렸다. 성당 「전직」에서 고를 수 있다.'),
],
```

#### tr_victor_2 · 시련 Ⅱ · 현상금 — 평생 — s23 boss, b_hagen
Echo fit: Wolf Pass's moon still remembers the beast; the notice is in Victor's own handwriting. Mod `glass` — a duel where one
clean shot decides either way.
```js
tr_victor_2_pre: [ ...TRIAL_FRAME,
  N('보름달이 뜬 밤. 성당 문을 열고 들어온 빅터의 모자 챙에 눈이 쌓여 있었다.'),
  H('북쪽 게시판에 또 빈칸 공고가 붙었어. 수배 — 은빛 늑대. 맡을 사냥꾼 — 빅터 그림.'),
  S(EL, '그 늑대… 하겐 할아버지 아니었어요? 돌아가셨잖아요.'),
  ...RVX('메아리다. 늑대 고개의 달은 아직 그 짐승을 기억한다. …공고를 붙인 건 마을 사람이 아니다.'),
  H('알아. 이 글씨, 내 글씨야. 꿈속에서 내가 붙였더군. 액수 칸엔 "괴물"이라고 써 놓고.'),
  H('언젠가 나도 영감처럼 혼자 설원에서 짐승이 될까 봐… 그게 무서웠던 거지.'),
  AB('빅터. 자네를 이 마을로 부른 빈칸 공고, 그거 내가 붙였네. 액수를 못 정해서 미안했어. …오늘은 자네가 정하게.'),
  H('…장전 안 한 은탄, 이번엔 가져간다. 수업 마저 받으러.'),
],
tr_victor_2_win: [ bgm('sad'), bg('s10_spire'),
  N('달이 기울었다. 은빛 늑대의 메아리가 눈밭에 앞발을 내리고, 사람의 모습으로 돌아앉았다.'),
  ECHO('b_hagen', '하겐의 메아리', '…여전히 손이 떨리는군, 꼬마.'),
  H('떨려. 평생 떨릴 거야. 그래도 이번엔 끝까지 봤어.'),
  ECHO('b_hagen', '하겐의 메아리', '그거면 괴물은 못 된다. 괴물은 겁을 잊은 놈이니까.'),
  ECHO('b_hagen', '하겐의 메아리', '혼자 다니지 마라. 나처럼 되기 싫으면. …돌아갈 여관이 있잖나.'),
  H('그 잔소리 들으려고 여기까지 왔나 봐. 수업 끝이야, 영감?'),
  ECHO('b_hagen', '하겐의 메아리', '끝이다. 이제부턴 네가 가르쳐라.'),
  bg('inn'),
  N('며칠 뒤 흑묘 여관. 빅터는 게시판에 새 공고를 붙였다. 액수 칸은 처음으로 채워져 있었다.'),
  N('"모집 — 견습 사냥꾼. 보수 — 따뜻한 밥과 잔소리. 평생."'),
  S(MA, '어머, 빅터 양반이 제자를 다 받는대! 첫 수업료는 내가 낼게. 호호!'),
  H('…공짜라니까, 마르타. 이번엔 진짜로.'),
  N('[안내] 비전의 길이 열렸다. 성당 「전직」에서 확인할 수 있다.'),
],
```

### 4.4 BRAN — rebuilding the Dawn Oath, Death's early attack (story.js:400), Gawain
Arc: Ⅰ is the talk Bran never had with Gareth (why the youngest was sent away); Gawain transfers his guard; the order's first verse
"새벽이 오지 않는 밤은 없다. 오지 않는다면, 우리가 가져간다." becomes the commander's. Ⅱ: Death was the Count's ledger-keeper and
culled the Dawn Oath a decade before each red moon; Gareth's kneeling bought one crossed-out line — the youngest name. Mors holds the
ledger now; Bran writes the living into it.

#### tr_bran_1 · 시련 Ⅰ · 무릎 꿇은 단장 — s04 boss, b_crimson (Gareth) · mod `no_sub`
```js
tr_bran_1_pre: [ ...TRIAL_FRAME,
  N('성당 뒤뜰. 브란이 녹슨 방패 하나를 닦고 있었다. 떠오르는 해의 문장이 희미하게 드러났다.'),
  H('지하 묘지에서 찾은 기사단의 방패요. 형제들을 묻고도… 이것만은 내려놓지 못하겠소.'),
  S(EL, '브란 아저씨, 기사단 다시 만드신다면서요? 마을 형들이 다 들어가고 싶대요.'),
  H('…그럴 자격이 내게 있는지 모르겠소. 단장님은 무릎을 꿇었고, 나는 도망쳤소.'),
  CMPX('gd_knight', '가웨인', 'portraits/cmp_g_knight', '(망령 기사가 투구를 숙인다. 안개로 된 손이 대회랑 쪽을 가리킨다.)'),
  ...RVX('진홍 갑주의 메아리가 아직 대회랑에 서 있다. 그 기사는 백작이 아니라 형제들의 목숨 앞에 무릎을 꿇었지.'),
  H('알고 있소. 그래서 더 묻고 싶소. 단장님, 그날 왜 저를 샛길로 보냈느냐고.'),
  H('검 한 자루로 가겠소. 기사가 기사에게 묻는 법은 그것뿐이오.'),
],
tr_bran_1_win: [ bgm('story'), bg('s04_hall'),
  N('진홍 갑주에 금이 가며, 그 안에서 늙은 기사가 투구를 벗었다.'),
  ECHO('b_crimson', '가레스', '…많이 컸구나, 브란. 샛길로 보낸 그 울보 종자가.'),
  H('단장님. 왜 저였습니까. 왜 저만 살려 보내셨습니까.'),
  ECHO('b_crimson', '가레스', '가장 어렸으니까. 새벽을 가장 오래 볼 수 있는 놈이었으니까.'),
  ECHO('b_crimson', '가레스', '나는 무릎을 꿇었고, 백작은 약속을 어겼다. 그 수치는 내 것이다. 네 것이 아니다.'),
  CMPX('gd_knight', '가웨인', 'portraits/cmp_g_knight', '(가웨인이 단장 곁에 한쪽 무릎을 꿇는다. 십 년 만의 예법이다.)'),
  ECHO('b_crimson', '가레스', '가웨인, 이제 이 아이를 지켜라. …브란, 서약의 첫 구절을 외워 봐라.'),
  H('"새벽이 오지 않는 밤은 없다. 오지 않는다면, 우리가 가져간다."'),
  ECHO('b_crimson', '가레스', '그래. 오늘부터 그 구절은 단장의 것이다.'),
  N('갑주는 붉은 재가 되어 흩어지고, 녹슨 방패 위에 단장의 문장이 새로 새겨져 있었다.'),
  N('[안내] 초월의 길이 열렸다. 성당 「전직」에서 고를 수 있다.'),
],
```

#### tr_bran_2 · 시련 Ⅱ · 사신의 장부 — s11 boss, b_death · mods `no_potion` + `bossHp 1.25` ("죽음은 죽지 않는다")
```js
tr_bran_2_pre: [ ...TRIAL_FRAME,
  N('성당 문간. 제 키의 두 배나 되는 낫을 끌고 온 꼬마 사신이 장부 한 권을 브란에게 내밀었다.'),
  CMPX('gd_reaper', '모르스', 'portraits/cmp_g_reaper', '(모르스가 장부의 한 쪽을 펼쳐 가리킨다. 손가락이 덜덜 떨린다.)'),
  H('…새벽 서약 기사단. 로렌, 마커스… 형제들의 이름이 모두 적혀 있소. 날짜는 붉은 달 십 년 전.'),
  H('그리고 맨 끝줄. "종자 브란." 누군가 줄을 그어 지웠구려.'),
  S(EL, '왜 아저씨 이름만 지워져 있어요?'),
  ...RVX('사신은 백작의 장부지기였다. 붉은 달이 뜨기 전에, 새벽을 가져올 자들을 먼저 거둬 갔지.'),
  ...RVX('기사단이 무너진 게 처음이 아닐 거다. 사백 년 동안, 백 년마다, 십 년씩 일찍.'),
  H('그 장부의 주인에게 직접 묻겠소. 죽음이 죽지 않는다면, 대답도 할 수 있겠지.'),
],
tr_bran_2_win: [ bgm('church'), bg('s11_chapel'),
  N('사신의 메아리가 낫을 내려놓았다. 해골 눈구멍 속 푸른 불이 처음으로 흔들렸다.'),
  ECHO('b_death', '데스의 메아리', '크크… 장부를 보았느냐. 그 한 줄은 내가 지웠다.'),
  ECHO('b_death', '데스의 메아리', '네 단장이 무릎을 꿇던 날, 백작은 약속을 어겼지. 허나 장부지기는 값을 받으면 한 줄은 지운다.'),
  ECHO('b_death', '데스의 메아리', '가장 어린 이름 하나. 그것이 무릎 하나의 값이었다.'),
  H('…단장님의 무릎은 헛되지 않았군. 나를 산 값이었소.'),
  ECHO('b_death', '데스의 메아리', '죽음은 죽지 않는다. 다만 장부는 넘어간다. 무엇을 적을지는 이제 네가 정해라.'),
  bg('hub'),
  N('며칠 뒤 아침, 영혼의 마구간 앞마당. 모르스가 장부의 빈 쪽을 펼쳐 들었다.'),
  H('새벽 서약 기사단, 다시 선다. 이 장부에는 이제 죽은 자가 아니라 산 자의 이름을 적는다.'),
  { if: 'ex_s25_done', who: 'narrator', text: '첫 줄에 브란 아이언하트. 둘째 줄에 망령 기사 가웨인. 셋째 줄에 군마 모르겐. 그 아래로 마을 청년들의 이름이 삐뚤빼뚤 이어졌다.' },
  { if: '!ex_s25_done', who: 'narrator', text: '첫 줄에 브란 아이언하트. 둘째 줄에 망령 기사 가웨인. 그 아래로 마을 청년들의 이름이 삐뚤빼뚤 이어졌다.' },
  S(G, '기사단 말은 내가 맡을게. 돌려줄 땐 살아서 돌려줘. 전부 다.'),
  H('맹세하오, 그레타 공. 이번 기사단은 아무도 두고 가지 않소.'),
  N('[안내] 비전의 길이 열렸다. 성당 「전직」에서 확인할 수 있다.'),
],
```

### 4.5 LIA — her father (story_ex.js:419 "네 아비가 그랬다"), the unnamed Crow senior in the s10 ice (story.js:785)
Arc: Ⅰ silences the nest's voice in her head with Nemain now on her side. Ⅱ: the senior is her father **후긴**, who froze twenty
years ago on Valakir's summit glacier, where Isabella's ice survives between moons, on the way *home*; Nemain burned his record.
He wanted the name "리아". Lia files the last report: "기록함".

#### tr_lia_1 · 시련 Ⅰ · 열세 번 인형 — s22 boss, b_nemain (`reqFlag ex_s22_done`) · mod `glass`
```js
tr_lia_1_pre: [ ...TRIAL_FRAME,
  N('이른 새벽, 성당 문에 검은 깃털 하나가 꽂혀 있었다. 리아가 깃털을 뽑아 들고 한참을 노려보았다.'),
  H('…엄마 글씨 아니야. 둥지의 가르침이 제 발로 걸어왔네.'),
  S(EL, '리아 언니, 무서운 꿈 꿨어요? 눈 밑이 까매요.'),
  H('매일 꿔. 촛불 없는 방, 열세 번 인형, "칼에게는 이름이 없다." 엄마는 이제 비석을 세우는데, 그 목소리는 아직 머릿속에 있어.'),
  ...RVX('둥지는 비었지만 둥지어미의 가면은 메아리 속에 남았다. 네메인이 벗어 던진 그녀 자신이다.'),
  ...RVX('…그 가면을 처음 씌운 것도 나였다. 미안하다.'),
  H('사과는 나중에. 주먹도 나중에.'),
  H('이번엔 둘이서 베어 낼 거야. 나랑, 그 방에서 울던 열세 번이랑.'),
],
tr_lia_1_win: [ bgm('story'), bg('s02_graveyard'),
  N('가면의 메아리가 두 쪽으로 갈라져 떨어졌다. 그 너머엔 아무것도 없었다. 빈 둥지처럼.'),
  ECHO('b_nemain', '둥지어미의 메아리', '…이름 있는 칼은 망설인다. 망설이는 칼은 부러진다.'),
  H('맞아. 망설였어. 그래서 안 부러졌어. 망설이는 동안 누가 옆에 와 주거든.'),
  N('언덕 아래 묘지. 비석을 세우던 네메인이 손을 멈추고 리아를 올려다보았다.'),
  NM2('…얼굴이 가벼워졌구나.'),
  H('머릿속 그 방, 불 켜고 왔어. 열세 번 인형도 치웠고.'),
  NM2('그럼 이 비석 하나는 네가 새겨라. 이름은… 열세 번.'),
  H('…싫어. "리아가 되기 전의 리아." 이렇게 쓸래.'),
  N('언덕에 비석 하나가 섰다. 번호 대신, 긴 이름이 새겨져 있었다.'),
  N('[안내] 초월의 길이 열렸다. 성당 「전직」에서 고를 수 있다.'),
],
```

#### tr_lia_2 · 시련 Ⅱ · 기록에 없는 사람 — s10 boss, b_frostqueen · mods `no_potion`, `no_sub`
```js
tr_lia_2_pre: [ ...TRIAL_FRAME,
  N('해 질 녘, 이름 없는 언덕에서 네메인이 내려왔다. 성당 안에서 그녀는 가면을 쓰지 않았다.'),
  NM2('끝까지 듣겠다고 했지. …네 아비 이야기다.'),
  NM2('이름은 후긴. 결사 최고의 칼이었고, 내가 아는 가장 시끄러운 사내였다. 너를 안고 이름을 짓자고 졸랐지.'),
  NM2('스무 해 전 겨울, 발라키르 꼭대기 빙하로 정찰을 갔다. 백작의 성이 다시 솟을 자리를 살피러.'),
  NM2('돌아오는 길이었다. 우리에게 돌아오는 길. 그 빙하에는 이자벨라의 얼음이 성과 함께 가라앉지 않고 남아 있었다.'),
  H('…얼어붙은 첨탑. 까마귀 문신. "기록에 없는 사람." 그게… 그 사람이었어?'),
  NM2('기록은 내가 불태웠다. 이름이 있으면 돌아갈 곳이 생기고, 돌아가는 칼은 죽으니까. …그렇게 믿어야 버틸 수 있었다.'),
  ...RVX('…나도 알고 있었다. 현장 요원에게는 알리지 않았지. 내 규칙이었고, 틀린 규칙이었다.'),
  H('됐어. 이번엔 내가 데리러 가. 돌아오다 멈춘 사람이면, 마저 데려오면 되잖아.'),
],
tr_lia_2_win: [ bgm('sad'), bg('s10_spire'),
  N('서리 여왕의 메아리가 깨지자, 빙벽의 마지막 얼굴이 천천히 녹아내렸다. 까마귀 문신의 사내였다.'),
  ECHO('후긴의 메아리', '후긴의 메아리', '…춥군. 아, 꼬마. 길을 잃었나? 나도 집에 가는 길인데.'),
  H('…아니. 데리러 왔어. 길은 내가 알아.'),
  ECHO('후긴의 메아리', '후긴의 메아리', '그래? 집에 가면 딸이 있어. 아직 이름이 없지. 네메인이 좀처럼 허락을 안 해 줘서.'),
  ECHO('후긴의 메아리', '후긴의 메아리', '나는 "리아"가 좋은데. 부르기 쉽고, 끝이 밝잖아.'),
  H('…좋은 이름이야. 그 애가 직접 골랐대. 아주 마음에 들어 한대.'),
  ECHO('후긴의 메아리', '후긴의 메아리', '하하, 그래? 다행이다. …이제 좀 따뜻하군.'),
  N('사내는 웃으며 빛이 되어 흩어졌다. 빙벽에는 이제 아무도 남아 있지 않았다.'),
  bg('s02_graveyard'),
  N('며칠 뒤, 이름 없는 언덕에 비석 하나가 더 섰다. 네메인이 새기고, 리아가 마지막 획을 그었다.'),
  N('"후긴. 시끄러운 칼. 집에 오는 길이었다."'),
  H('결사 보고서, 진짜 마지막 장. "기록에 없는 사람, 기록함."'),
  N('[안내] 비전의 길이 열렸다. 성당 「전직」에서 확인할 수 있다.'),
],
```

### 4.6 AZEL — Amelia, the saint's-blood ritual (story.js:141/:344), borrowed time (story_ex.js:665-666), Lia's list (story.js:214/:549)
Arc: Ⅰ — the first grey hair; Mara kept every mother's lullaby; Amelia's last verse points to the nursery (s12_t1). Ⅱ — Amelia (of
Lumina's line) *asked* for the ritual; her blood struck half of infant Azel's name from the Chaos pact and killed her; in 1797
Dracula wanted Elise's blood for the other half — his crime, for his son. With Chaos gone, Azel's name is written nowhere. Lia
crosses out line two of the Crow list.

#### tr_azel_1 · 시련 Ⅰ · 자장가 — s18 boss, b_mara
```js
tr_azel_1_pre: [ ...TRIAL_FRAME,
  N('촛불 아래, 아젤이 손끝에 감긴 머리카락 한 올을 오래 들여다보고 있었다. 하얀 머리카락이었다.'),
  S(EL, '아젤 님도 흰머리 났어요? 신부님처럼요?'),
  H('빌린 세월을 갚기 시작한 모양이다. 아버지의 피를 이은 몸도 예외는 아니었군.'),
  { if: 'ex_s24_done', who: 'npc_carmilla', text: '후후, 축하해 아젤. 늙어 가는 사람들 모임에 온 걸 환영해.' },
  AB('허허… 아젤 도련님도 드디어 늙는구먼. 축하하네. 정말로.'),
  H('…축하라. 이상하게 싫지 않다. 다만 밤마다 같은 노래가 들린다. 어머니의 자장가인데, 가사가 기억나지 않는다.'),
  ...RVX('악몽의 미궁에서 마라가 부르던 노래다. 꿈의 산파는 세상 어머니들의 자장가를 모두 기억하지.'),
  H('그 메아리에게 가사를 돌려받겠다. 흉내가 아니라, 진짜를.'),
],
tr_azel_1_win: [ bgm('story'), bg('s18_nightmare'),
  N('요람이 흔들림을 멈췄다. 마라의 메아리가 마지막으로 입을 열자, 다른 목소리가 흘러나왔다.'),
  ECHO('아멜리아의 목소리', '아멜리아의 목소리', '"잘 자라, 아가. 해가 뜨면 걸어가렴. 그림자는 두고, 너만 걸어가렴."'),
  H('…그래. 이 가사였다. 백 년 동안 잊고 있었군.'),
  ECHO('b_mara', '마라의 메아리', '…진짜 엄마의 노래는… 흉내 낼 수가 없더라… 끝 구절이… 너무 따뜻해서…'),
  ECHO('아멜리아의 목소리', '아멜리아의 목소리', '"엄마 피는 해님이 될 테니까."'),
  H('…해님이 될 피. 어머니, 그게 무슨 뜻입니까.'),
  N('대답 대신 요람 깊은 곳에서 작은 은빛 열쇠 하나가 떨어졌다. 드라큘라의 왕좌 곁, 아이 방의 열쇠였다.'),
  H('왕좌의 아이 방. …답은 거기 있겠군.'),
  N('[안내] 초월의 길이 열렸다. 성당 「전직」에서 고를 수 있다.'),
],
```

#### tr_azel_2 · 시련 Ⅱ · 아멜리아의 요람 — s12 boss, b_dracula · mods `no_potion` + `bossHp 1.25`
```js
tr_azel_2_pre: [ ...TRIAL_FRAME,
  N('아젤이 은빛 열쇠를 제단 위에 올려놓았다. 열쇠 고리에 아멜리아의 이름이 새겨져 있었다.'),
  H('어머니는 성녀의 피를 이은 분이었다. 아버지는 그 피로 의식을 치렀고, 어머니는 그날 밤 돌아가셨다.'),
  H('백 년 동안 아버지가 어머니를 제물로 썼다고 믿었다. 그래서 엘리제가 끌려갔을 때도 "또"라고 했지.'),
  S(EL, '…저도 그 의식에 쓰일 뻔했던 거예요?'),
  H('그래. 그러니 너도 들을 권리가 있다. 이번엔 아버지에게서 직접 듣고 오겠다.'),
  ...RVX('왕좌의 메아리에는 백작이 가장 오래 붙든 밤이 남아 있을 거다. 그게 어느 밤인지는… 당신이 더 잘 알겠지.'),
  B('lia', '…따라갈까?'),
  H('아니. 아들이 혼자 가야 하는 길이다. 대신 돌아오면 그 명단, 가져와라.'),
  B('lia', '…알았어. 펜도 챙겨 둘게.'),
],
tr_azel_2_win: [ bgm('sad'), bg('s12_throne'),
  N('진홍의 날개가 무너지자, 왕좌의 메아리가 백 년 전 그 밤으로 되감겼다. 요람 곁에 한 여인이 서 있었다.'),
  ECHO('아멜리아의 환영', '아멜리아의 환영', '그이를 탓하지 마, 아젤. 이 의식은 내가 부탁한 거야.'),
  ECHO('아멜리아의 환영', '아멜리아의 환영', '너는 태어날 때부터 어둠의 장부에 이름이 적혀 있었어. 내 피로 그 이름을 지웠단다. 반쯤만.'),
  ECHO('b_dracula', '드라큘라의 메아리', '…반쯤. 나머지 반은 백 년 뒤 성녀의 피로 지울 생각이었다.'),
  ECHO('b_dracula', '드라큘라의 메아리', '그 아이를 끌고 온 건 나의 죄다. 허나 그 피는 내 불멸이 아니라 네 이름을 위한 것이었다.'),
  H('…왜 한 번도 말하지 않으셨습니까.'),
  ECHO('b_dracula', '드라큘라의 메아리', '아비라는 것은, 아들에게 미움받는 편이 쉬울 때가 있다.'),
  ECHO('b_dracula', '드라큘라의 메아리', '혼돈은 끝났다. 네 이름은 이제 어디에도 적혀 있지 않다. …늙어라, 아젤. 사람처럼.'),
  bg('inn'),
  N('흑묘 여관의 늦은 밤. 리아가 낡은 명단을 펼쳐 탁자 위에 놓았다.'),
  B('lia', '결사 표적 명단 두 번째 줄. "아젤 드 녹트." …보류, 보류, 보류. 백 년 치 보류야.'),
  N('리아가 펜으로 그 줄을 천천히 그었다. 그리고 여백에 적었다. "처분 불필요. 사람임."'),
  H('…고맙다, 리아.'),
  B('lia', '고맙긴. 흰머리 난 사람 죽이면 뒷맛이 나빠서 그래.'),
  N('[안내] 비전의 길이 열렸다. 성당 「전직」에서 확인할 수 있다.'),
],
```

### 4.7 ISOLDE — the fall of her order (story_p2.js:242, story_p2b.js:141-144)
Arc: Ⅰ — Narkissa collected faces, and with them the night the order fell; the recovered memory: commander **브륀힐트** ordered
her to chase Argen ("용이 살아 있는 한, 기사단은 끝나지 않는다") — she did not flee; the storm had wings: Ziz. Ⅱ — the order fell to
the god it served, corrupted after Raven left; Isolde refuses to let Raven carry it and becomes "the first dragon knight, not the
last" with Argen. Order oath: "용이 날 수 있는 하늘을 지킨다".

#### tr_isolde_1 · 시련 Ⅰ · 거울이 가져간 밤 — s14 boss, b_narkissa
```js
tr_isolde_1_pre: [ ...TRIAL_FRAME,
  N('달 없는 밤, 성당 종탑 꼭대기. 이졸데가 창을 세워 두고 하늘을 올려다보고 있었다.'),
  S(EL, '이졸데 언니, 거기서 뭐 해요? 바람 엄청 불어요!'),
  H('기억을 세고 있었다. 기사단이 무너진 그 밤… 이상하게도 그 밤만 기억에 없다.'),
  H('하늘이 갈라지고, 아르겐이 끌려가고, 깃발이 쓰러졌다. 거기까지다. 그다음은 하얗게 비어 있다.'),
  ...RVX('나르키사는 비친 것을 모았다. 네 형제들의 얼굴도 그 거울 속에 있었지. 얼굴만이 아니라, 그 얼굴들이 본 마지막 밤까지.'),
  ...RVX('그 거울의 메아리 속에 네 빈 밤이 있을 거다.'),
  H('되찾겠다. 아무리 아픈 밤이라도, 기사가 제 전장을 잊어서는 안 된다.'),
],
tr_isolde_1_win: [ bgm('story'), bg('s14_mirror'),
  N('여제의 메아리가 산산이 부서졌다. 수천 개의 거울 조각 가운데 하나에 불타는 하늘의 성소가 비쳤다.'),
  ECHO('b_narkissa', '나르키사의 메아리', '…가져가렴. 그 밤은 너무 아파서… 나도 오래 들여다볼 수 없었어.'),
  N('거울 속의 이졸데가 창을 들고 무너진 성소로 달려가고 있었다. 그 앞을 한 기사가 막아섰다.'),
  ECHO('기사단장 브륀힐트', '기사단장 브륀힐트', '이졸데, 돌아서라. 아르겐을 쫓아라. 그것이 명령이다.'),
  H('…단장님. 그랬다. 나는 도망친 게 아니었다. 명령을 받고 떠난 거였다.'),
  ECHO('기사단장 브륀힐트', '기사단장 브륀힐트', '용이 살아 있는 한, 기사단은 끝나지 않는다. 가라!'),
  N('거울은 거기서 금이 갔다. 그 너머, 단장이 마주 선 폭풍 속에서 거대한 날개가 펼쳐지고 있었다.'),
  H('폭풍의 날개…. 지즈였나. 우리 기사단을 무너뜨린 건, 우리가 섬기던 하늘의 신이었나.'),
  N('[안내] 초월의 길이 열렸다. 성당 「전직」에서 고를 수 있다.'),
],
```

#### tr_isolde_2 · 시련 Ⅱ · 기사단이 무너진 밤 — s17 boss, b_ziz (`reqFlag ex_s21_done`) · mods `no_potion`, `haste`
```js
tr_isolde_2_pre: [ ...TRIAL_FRAME,
  CMPX('mt_argen', '아르겐', 'portraits/cmp_mt_argen', '(은빛 뇌룡이 낮게 울며 이졸데의 어깨에 머리를 기댄다. 비늘 사이로 작은 번개가 튄다.)'),
  H('기억이 돌아왔다. 기사단을 무너뜨린 건 공허에 먹힌 지즈의 폭풍이었다.'),
  ...RVX('…그렇다면 그 폭풍은 내 죄이기도 하다. 내가 하늘을 떠나지 않았다면, 지즈는 그토록 쉽게 먹히지 않았을 거다.'),
  H('그 말을 들으려고 꺼낸 얘기가 아니다, 까마귀. 죄를 나누러 온 게 아니라 끝을 보러 가는 거다.'),
  H('단장님은 마지막까지 폭풍 앞에 서 계셨다. 나는 그 끝을 보지 못했다. …이번엔 끝까지 보겠다.'),
  S(EL, '아르겐도 같이 가요?'),
  H('메아리 속엔 데려갈 수 없다. 대신 돌아오면, 제일 먼저 이 녀석 등에 타겠다.'),
  ...RVX('…지즈의 메아리에게 전해 다오. 막내는 이제 혼자 지키지 않는다고.'),
],
tr_isolde_2_win: [ bgm('church'), bg('s17_sky'),
  N('폭풍의 메아리가 잦아들었다. 무너진 성소 위에 단장의 창이 아직 꽂혀 있었다.'),
  ECHO('기사단장 브륀힐트', '기사단장 브륀힐트', '…끝까지 보았구나, 이졸데. 우리는 하늘을 지키다 하늘에 졌다. 부끄럽지 않다.'),
  ECHO('기사단장 브륀힐트', '기사단장 브륀힐트', '용은? 아르겐은 살아 있느냐.'),
  H('살아 있습니다. 공허의 밑바닥에서 되찾아 왔습니다. 지금은 땅 위 세계의 마구간에서 자고 있습니다.'),
  ECHO('기사단장 브륀힐트', '기사단장 브륀힐트', '그럼 기사단은 끝나지 않았다. 이졸데 드라켄, 마지막 용기사가 아니라 첫 번째 용기사로 살아라.'),
  ECHO('b_ziz', '지즈의 메아리', '(지즈의 메아리가 길게 울었다. 폭풍이 아니라, 둥지로 돌아오는 새의 울음이었다.)'),
  bg('s21_nest'),
  N('새벽. 하늘 정원의 둥지에 은빛 용과 기사가 내려앉았다.'),
  H('아르겐. 오늘부터 우리 둘이 기사단이다. 단원 모집은… 천천히 하지.'),
  CMPX('mt_argen', '아르겐', 'portraits/cmp_mt_argen', '(아르겐이 하늘을 향해 맑게 울었다. 멀리 종탑 위에서 까마귀 한 마리가 화답했다.)'),
  N('[안내] 비전의 길이 열렸다. 성당 「전직」에서 확인할 수 있다.'),
],
```

---------------------------------------------------------------------------------------------------------------------------

## 5. Story gap fixes (exact targets)

Owners: **GAPS-A** = `story_p2.js`, `story_p2b.js`, `story_ex.js` · **GAPS-B** = `story.js`, NEW `story_extra.js`
(`SCRIPTS_EXTRA`, `BANTER`), NEW `src/game/story_director.js` · **UI** = UI-CHURCH-CLASS (`church.js`, `town.js`, `npcs.js`).

### 5.1 Isolde coverage — 33 Part 2/side scripts (GAPS-A)
Index = position in the script array today (re-locate by speaker/context). 26 reachable rows get new text; 7 sit inside a
non-Isolde branch and get `isolde:` = the `default` string (keeps the new `test_part2` check simple).

| # | script : index | context | `isolde:` text |
|---|---|---|---|
| 1 | p2_prologue : 20 | Rook unmasks | `'까마귀 결사의 수장이라…. 그 가면 아래에 옛 노래 속 경계의 파수꾼이 숨어 있었나.'` |
| 2 | p2_prologue : 33 | seven anchors | `'닻이 끊기면 모든 세계가 무로 돌아간다…. 내 하늘이 무너진 것도 그 때문이었군. 창을 빌려주겠다.'` |
| 3 | p2_prologue : 41 | farewell to Alberto | `'신부님의 기도를 방패 삼겠습니다. 기사의 이름으로, 반드시 돌아와 인사드리겠습니다.'` |
| 4 | s14_intro : 11 | mirrors move | `'거울 너머로 낯익은 얼굴들이 스친다…. 형제들인가. 정신 차려라, 이졸데.'` |
| 5 | s14_t1 : 1 | '거울 속의 나' asks | `'용을 놓친 용기사. 기사단을 잃은 기사. 너에게 무엇이 남았지?'` |
| 6 | s14_t1 : 2 | hero answers | `'창이 남았다. 그리고 아직 쫓아갈 용이 있다. 기사로는 그거면 충분하다.'` |
| 7 | s14_t2 : 4 | Mirra's request | `'진짜 얼굴을 돌려 달라는 부탁이라면, 기사의 이름으로 받겠다.'` |
| 8 | b_narkissa_pre : 6 | battle cry | `'형제들의 얼굴까지 모았더군. 그 가면, 이 창으로 꿰뚫어 주마!'` |
| 9 | s14_outro : 10 | Mirra joins | `'뒤를 비춰 주겠다고? 용기사의 등은 원래 용이 지켰다. …당분간은 네게 부탁하지.'` |
| 10–11 | s14_outro : 19, 26 | unreachable | = default |
| 12 | s15_intro : 6 | forge heat | `'용의 숨결보다 뜨겁군. 갑주가 달아오르기 전에 끝내자.'` |
| 13 | s15_t2 : 4 | Hadwin I's mark | `'하드윈…? 마을 대장장이와 같은 이름이다. 쇳물에 이름을 남긴 장인이라니, 존경받아 마땅하지.'` |
| 14 | b_moloch_pre : 6 | battle cry | `'사슬을 벼린 손으로 사슬을 끊다니. 그 망치, 용기사의 창이 부러뜨린다!'` |
| 15 | s16_t1 : 3 | air pocket | `'숨 쉴 곳을 알려 주는 건가. 고맙다. 하늘의 기사에게 물속은 낯설어서.'` |
| 16 | s16_t2 : 4 | fresco with Raven | `'벽화 속 부리 가면…. 옛 노래 그대로다. 천 년 전에도 그는 성녀 곁에 있었군.'` |
| 17 | b_dagon_pre : 6 | battle cry | `'빛을 잊은 사제여. 하늘의 기사가 빛을 가져왔다. 눈을 뜨고 받아라!'` |
| 18 | s17_t1 : 3 | baby griffin | `'겁내지 마라, 작은 날개야. 기사단의 새끼 용들도 폭풍을 무서워했다.'` |
| 19 | b_ziz_pre : 7 | her own god | `'하늘의 신이여… 기사단이 섬기던 폭풍이여. 막내가 돌아왔다. 이제 그만 멈춰라!'` |
| 20 | s17_outro : 12 | Gale joins | `'그리핀이라. 용과는 다르지만 하늘을 아는 눈이다. 함께 날자, 게일.'` |
| 21 | s18_intro : 7 | nightmares | `'악몽이라면 하나 있다. 그 밤을 다시 보더라도, 이번엔 창을 놓지 않겠다.'` |
| 22 | s18_t2 : 5 | Momo | `'작은 몸으로 악몽을 삼키다니. 용기사 못지않은 배짱이군. 고맙다.'` |
| 23 | b_mara_pre : 6 | battle cry | `'어미 흉내로 잠을 강요하는 자라. 기사는 잠들지 않는다. 깨어서 지킨다!'` |
| 24 | b_mara_post : 2 | farewell | `'…잘 자라. 이번엔 누구의 악몽도 낳지 말고.'` |
| 25 | s19_t1 : 4 | Silva | `'숲의 신령이여, 기다려라. 하늘의 기사는 땅 위에서도 약속을 지킨다.'` |
| 26 | s19_t2 : 3 | dawnflower | `'새벽꽃이라. 알베르토 신부님께 드리자. 백 년의 밤을 지킨 분께 어울린다.'` |
| 27 | b_behemoth_pre : 7 | battle cry | `'등 위의 여왕. 높은 곳은 내 전장이다. 거기서 떨어뜨려 주마!'` |
| 28 | b_behemoth_post : 2 | farewell | `'잘 버텼다, 거인이여. 이제 아무도 네 등에 올라타지 않는다.'` |
| 29 | s19_outro : 11 | Raven joins | `'파수꾼이 직접 나선다면 기사가 호위하지. 마지막 출정이다.'` |
| 30 | s20_t1 : 6 | echoes of the dead | `'쓰러뜨린 자들의 메아리라. 무너지는 하늘의 비명도 들었다. 이 정도로는 멈추지 않는다.'` |
| 31 | s20_t2 : 1 | Edmund's line (keyed per hero) | `'처음 보는 얼굴이군, 용기사. 그래도 눈빛은 사냥꾼의 것이다. 여기까지 잘 왔다.'` |
| 32 | s20_t2 : 11 | hero answers | `'백 년 전의 헌터와 천 년 전의 성녀라. 기사단의 노래에 두 분의 이름을 새기겠다.'` |
| 33 | b_nihil_pre : 6 | battle cry | `'하늘이 무너지는 소리를 들어 봤나. 그보다 시끄러운 걸 들려주마. 창이 공허를 꿰뚫는 소리다!'` |
| 34 | s20_outro : 17 | the star | `'별이다…. 기사단은 길 잃은 밤이면 별을 따라 날았다. 이번엔 우리가 별이 되었군.'` |
| 35 | s20_outro : 22 | waking at the gate | `'…돌아왔다. 아르겐, 이 아침을 함께 봤어야 했는데.'` |
| 36–40 | s21_intro : 12, s21_t1 : 4, s21_t2 : 10, b_argen_pre : 7, s21_outro : 14 | unreachable (`ifChar('isolde', …)` else-branch) | = default |
(33 scripts, 40 keyed objects.)

### 5.2 Seventh anchor = Eshville's bell, held by Lumina's blood (Elise)
Canon: Lumina and Raven cast seven anchors a thousand years ago; six sit in the other worlds (the six hearts); the **seventh is the
bell of Eshville**, older than the church, held by Lumina's blood. Each red moon the Count struck the bell first. Alberto rang it
but has the Count's blood, not Lumina's — his toll stopped mid-swing the night the sky cracked; Elise has rung it every day since.

| owner | site | edit |
|---|---|---|
| A | story_p2.js `p2_prologue` after `RV('여섯 세계의 심장을 되찾아 닻을 다시 내려야 한다. …')` | add `RV('여섯은 저 너머에 있다. 일곱 번째는… 때가 되면 말하지.')` |
| A | story_p2b.js `s20_intro`, after Elise's blood lights the lantern | add `RV('…일곱 번째 닻은 처음부터 여기 있었다. 에슈빌의 종. 루미나가 마지막으로 내린 닻이다.')`, `RV('그 닻을 붙드는 건 그녀의 피다. 엘리제, 네가 매일 친 종소리가 이 세계를 붙들고 있었다.')`, `S(EL, '제가요…? 저는 그냥… 헌터님들 들으시라고 친 건데요.')` |
| A | story_p2b.js `s20_outro` normal path, line `N('여섯 심장이 등불을 떠나 어둠 속으로 흩어졌다. 일곱 세계의 닻이 …')` | replace with `N('여섯 심장이 등불을 떠나 어둠 속으로 흩어졌다. 멀리 에슈빌의 종이 울렸다. 일곱 번째 닻이 여섯을 불러들이는 소리였다.')` |
| A | story_p2.js `ending_p2`, after `S(A, '허허… 종은 이제 엘리제가 치는구먼. …')` | add `RV('일곱 번째 닻은 저 아이의 종이다. 나는 그 종 위에서 밤을 지킬 뿐이다.')` |
| A | story_p2.js `ending_p2true`, after `N('그날 아침, 에슈빌 성당의 종이 오래도록 울렸다. …')` | add `N('…일곱 번째 닻이 마지막으로, 가장 크게 울렸다.')` |
| A | story_p2b.js `npc_elise_ch20` | add `S(EL, '레이븐 아저씨가 그러는데, 제가 치는 종이 세상을 붙들고 있대요. 그래서 하루도 안 빼먹어요. 약속!')` |

### 5.3 Inn-night banter (GAPS-B: `BANTER` + scripts in `story_extra.js`, played by `story_director.js`)
Trigger: `hubStoryEnter(game, hub)` (called by hub.js after each `CMP.companionHubEnter?.(…)`) on a hub arrival **back from a
stage** (`hub.from` not in the arrival set, not `inn`), only when `g.top === hub`, at most one script per arrival, after the
companion-join queue (§5.6). Pick the first entry in table order whose script is unseen, whose `req` holds, and whose `pair` does
**not** contain `state.charId` (the player overhears two others; `pair:'all'` uses the `ifChar(id,'skip_'+id)` pattern so the
player's own line drops out). Mark `seenScripts`; NG+ replays them. Skip in arcade saves. Gates: `chapterMin` (`progress.chapter >=`),
`flags` (all true); Lia needs `lia_joined`, Azel `azel_joined`, Isolde `isolde_joined`.

| id | pair | chapterMin | flags |
|---|---|---|---|
| inn_kael_victor | kael, victor | 2 | — |
| inn_sera_bran | sera, bran | 3 | — |
| inn_sera_lia | sera, lia | 4 | lia_joined, elise_rescued |
| inn_bran_kael | bran, kael | 5 | — |
| inn_lia_azel | lia, azel | 6 | lia_joined, azel_joined |
| inn_victor_azel | victor, azel | 7 | azel_joined, alberto_confessed |
| inn_kael_azel | kael, azel | 9 | azel_joined |
| inn_sera_azel | sera, azel | 11 | azel_joined |
| inn_bran_isolde | bran, isolde | 14 | isolde_joined |
| inn_victor_isolde | victor, isolde | 15 | isolde_joined |
| inn_lia_isolde | lia, isolde | 17 | lia_joined, isolde_joined |
| inn_kael_sera | kael, sera | 18 | — |
| inn_victor_bran | victor, bran | 19 | — |
| inn_all_harvest | all | 20 | p2_done |

```js
inn_kael_victor: [ N('흑묘 여관의 밤. 구석 자리에서 낯익은 두 목소리가 들려온다.'),
  B('victor', '발크레인 나리, 이번 일 보수는 얼마 받기로 했어?', 'left'),
  B('kael', '받지 않는다. 백 년 전의 약속이다. 누구와의 약속인지는… 나도 잘 모르지만.'),
  B('victor', '모르는 약속으로 목숨을 건다고? …하긴, 나도 액수 칸 빈 공고 보고 왔으니 할 말 없군.', 'left'),
  B('kael', '살아서 돌아가면 한 잔 사지. 그게 내 보수다.'),
  B('victor', '좋아. 외상 장부에 적어 둔다, 카엘.', 'left') ],
inn_sera_bran: [ N('촛불 하나를 사이에 두고, 수녀와 기사가 마주 앉아 있었다.'),
  B('sera', '브란 씨, 매일 밤 누구를 위해 기도하세요?', 'left'),
  B('bran', '…형제들이오. 이름을 하나씩 부르다 보면 날이 새오.'),
  B('sera', '그럼 오늘은 제가 반을 맡을게요. 이름 알려 주세요.', 'left'),
  B('bran', '로렌, 마커스…. 고맙소, 수녀님. 오늘은 조금 일찍 잘 수 있겠구려.') ],
inn_sera_lia: [ N('엘리제가 잠든 뒤, 여관 계단참.'),
  B('sera', '리아, 엘리제가 내일 머리 땋아 달래요. 언니가 해 주면 좋겠대요.', 'left'),
  B('lia', '…나 그런 거 못 해. 칼 손질밖에.'),
  B('sera', '칼 손질처럼 하면 돼요. 세 갈래로 나누고, 엇갈려서, 단단하게.', 'left'),
  B('lia', '…해 볼게. 대신 못생기게 나와도 웃지 마.') ],
inn_bran_kael: [ N('여관 뒷마당. 두 사람이 나란히 무기를 손질하고 있었다.'),
  B('bran', '카엘 공, 그대 가문은 몇 대째 백작과 싸웠소?', 'left'),
  B('kael', '이번이 다섯 번째 붉은 달이다. 비석은 넷이지.'),
  B('bran', '우리 기사단도 그만큼 무너졌을지 모르겠구려. 백 년마다.', 'left'),
  B('kael', '그럼 이번엔 둘 다 무너지지 말자. 비석은 지겹다.') ],
inn_lia_azel: [ N('여관 지붕 위. 달빛 아래 두 그림자가 등을 맞대고 앉아 있었다.'),
  B('azel', '결사 명단 두 번째 줄이 나라고 했지. 첫 줄은 누구냐.', 'left'),
  B('lia', '…네 아버지.'),
  B('azel', '그렇다면 순서는 지키는 게 좋겠군. 아버지가 먼저다.', 'left'),
  B('lia', '걱정 마. 네 줄은 아직 보류야. …계속 보류일 수도 있고.'),
  B('azel', '그 말, 기억해 두지.', 'left') ],
inn_victor_azel: [ N('불 꺼진 여관 홀. 빈 술잔 두 개가 탁자 위에 놓여 있었다.'),
  B('victor', '신부님이 백 년을 살았대. 너도 백 년 넘게 살았다며? 늙은이 모임이군.', 'left'),
  B('azel', '나는 늙지 않았을 뿐이다. 그는 늙지 못했던 거고.'),
  B('victor', '…차이가 뭔데.', 'left'),
  B('azel', '그는 매일 밤 종을 쳤다. 나는 매일 밤 귀를 막았다.'),
  B('victor', '…술이나 마셔. 오늘은 내가 산다. 왜인지는 나도 모르겠지만.', 'left') ],
inn_kael_azel: [ N('벽난로 앞. 카엘이 채찍을 감다 말고 고개를 들었다.'),
  B('kael', '아젤. 백 년 전 고조할아버지와 싸웠다고 했지. 어떤 사람이었나.', 'left'),
  B('azel', '채찍 소리가 컸다. 그리고 웃었지. 아버지의 왕좌 앞에서 웃은 인간은 그자뿐이었다.'),
  B('kael', '…웃었다고?', 'left'),
  B('azel', '"종이 울렸으니 와야지." 그렇게 말하고 웃었다. 무슨 뜻인지는 모른다.'),
  B('kael', '…종이 울렸으니. 기억해 두겠다.', 'left') ],
inn_sera_azel: [ N('예배당 같은 고요가 여관 창가에 내려앉아 있었다.'),
  B('sera', '아젤, 피가 마시고 싶을 때는 어떻게 참아요?', 'left'),
  B('azel', '기도는 안 한다. …어머니의 일기를 외운다.'),
  B('sera', '그것도 기도예요. 주님이 들으셨다면 분명 아멘 하셨을 거예요.', 'left'),
  B('azel', '…수녀가 그렇게 말해 주니, 오늘 밤은 조금 덜 목마르군.') ],
inn_bran_isolde: [ N('마구간 옆 울타리. 기사 둘이 나란히 기대어 하늘의 금을 올려다보았다.'),
  B('bran', '이졸데 공, 하늘의 기사단은 어떤 서약을 했소?', 'left'),
  B('isolde', '"용이 날 수 있는 하늘을 지킨다." 그게 전부다. 짧아서 잊을 수가 없지.'),
  B('bran', '우리 것은 "새벽을 가져간다"였소. …둘 다 지키지 못했구려.', 'left'),
  B('isolde', '아직 끝나지 않았다. 마지막 기사가 둘이나 남았으니까.'),
  B('bran', '하하! 그렇구려. 마지막 기사가 둘이면, 그건 기사단이오.', 'left') ],
inn_victor_isolde: [ N('여관 마당. 빅터가 이졸데의 창끝을 흘끔흘끔 쳐다보고 있었다.'),
  B('victor', '용 한 마리 키우는 데 얼마나 들어? 사료값 말이야.', 'left'),
  B('isolde', '아르겐은 번개를 먹는다. 공짜다.'),
  B('victor', '…세상에서 제일 부러운 탈것이군.', 'left'),
  B('isolde', '대신 성질이 나쁘다. 마음에 안 드는 자는 태우지 않는다.'),
  B('victor', '그럼 난 걸어 다니지 뭐. 그것도 공짜니까.', 'left') ],
inn_lia_isolde: [ N('지붕 위, 바람이 센 밤. 이졸데가 나지막이 노래를 흥얼거렸다.'),
  B('isolde', '리아, 기사단의 옛 노래를 아나? 떠난 막내 까마귀 이야기다.', 'left'),
  B('lia', '…들어 본 적 없어. 불러 봐.'),
  B('isolde', '"막내는 땅 아래를 보러 갔네. 하늘은 오래오래 기다렸네."', 'left'),
  B('lia', '…그 막내, 땅 아래서 둥지 하나 지었어. 나 같은 애들 키우려고. 엉망이었지만.'),
  B('isolde', '그럼 노래에 한 줄 더하지. "막내는 땅 아래서도 둥지를 지었네."', 'left') ],
inn_kael_sera: [ N('미궁에서 돌아온 밤. 여관의 불이 늦게까지 꺼지지 않았다.'),
  B('kael', '미궁에서 무엇을 봤나, 수녀.', 'left'),
  B('sera', '…등 뒤에서 아이가 우는데 돌아보지 못하는 꿈이요. 카엘 씨는요?'),
  B('kael', '벽에서 떨어지지 않는 채찍.', 'left'),
  B('sera', '둘 다 놓지 못하는 꿈이네요.'),
  B('kael', '그래. 그러니 놓지 말자. 아이도, 채찍도.', 'left') ],
inn_victor_bran: [ N('저녁 종이 울렸다. 소리가 조금 고르지 않았다.'),
  B('victor', '영감님이 요즘 종을 못 친다며. 엘리제가 친대.', 'left'),
  B('bran', '그 작은 팔로 매일 치는 거요. 소리가 고르진 않지만… 멀리 가오.'),
  B('victor', '…다음엔 내가 대신 쳐 줄까. 돈 안 받고.', 'left'),
  B('bran', '빅터 공, 요즘 공짜가 너무 많구려.'),
  B('victor', '그러게. 이 마을 물이 이상해.', 'left') ],
inn_all_harvest: [   // pair 'all' — each hero line wrapped in ifChar(id,'skip_'+id) … L('skip_'+id); the isolde line also needs isolde_joined
  N('수확제가 다시 열린 밤. 흑묘 여관의 긴 탁자에 헌터들이 처음으로 한자리에 모였다.'),
  S(MA, '세상에, 다 모이니까 여관이 좁네! 오늘은 무용담 하나에 한 잔씩이야!'),
  B('kael', '종소리가 들리면 다들 여기로 오는군.'),
  B('sera', '엘리제가 매일 쳐 주니까요. 우리 모두를 부르는 소리예요.', 'left'),
  B('victor', '그 꼬마가 세상을 붙들고 있었다며? 외상값이 제일 많이 밀린 상대가 꼬마였군.'),
  B('bran', '새벽을 가져간다는 서약, 오늘은 잔에 담아 가져왔소.', 'left'),
  B('lia', '…시끄러워. 그래도 오늘은 봐줄게.'),
  B('azel', '햇빛 아래 모인 사냥꾼들이라. 백 년 전엔 상상도 못 했군.', 'left'),
  B('isolde', '하늘의 흉터도 종소리가 닿는 곳까지는 조용하다. 좋은 마을이다.'),
  N('그날 밤 종탑의 종은 평소보다 오래 울렸다. 아주 먼 곳에서, 무언가가 메아리처럼 그 소리에 답했다.') ],
```
(`inn_all_harvest`'s last line seeds the trials before the player first opens the church tab.)

### 5.4 Town: reactions to ex21–23, Alberto in Part 2, Elise as keeper
**NPC reactions (GAPS-B).** `pickNpcScript` (story.js; anchor `if (npcId === 'npc_carmilla' && p?.flags?.ex_s24_done`) — replace the
two hard-coded overrides with one ordered rule, newest first:
```js
const EX = [['ex25', 'ex_s25_done'], ['ex24', 'ex_s24_done'], ['ex23', 'ex_s23_done'], ['ex22', 'ex_s22_done'], ['ex21', 'ex_s21_done']];
for (const [k, f] of EX) { const id = `${npcId}_${k}`; if (p?.flags?.[f] && SCRIPTS[id] && !(p.seenScripts ?? []).includes(id)) { latest = id; break; } }
```
(`npc_carmilla_ex24` / `npc_greta_ex25` keep working; each plays once, then the default rotation.) New scripts in story_extra.js
(`HA = 'npc_hadwin'`):
```js
npc_hadwin_ex21: [S(HA, '이졸데가 용 비늘을 하나 가져왔다. …두들겨도 안 휜다. 이런 쇠는 처음이다.'), S(HA, '창끝에 덧대 주겠다. 용이 허락한다면.')],
npc_marta_ex21:  [S(MA, '마구간에 용이 산다며? 그레타가 건초 대신 번개를 먹인다고 투덜대더라. 호호!'), N('(백작님이 마구간 쪽 하늘을 노려보며 꼬리를 바짝 세웠다.)')],
npc_greta_ex21:  [S(G, '은빛 용이 마구간 지붕에서 자. 지붕이 남아날지 모르겠어. …그래도 잠버릇은 착해.')],
npc_rook_ex22:   [...RVX('결사는 문을 닫았다. 둥지의 칼들은 이제 다들 제 이름으로 산다.'), ...RVX('…헤헤, 덕분에 외상 장부에 이름이 늘었습죠. 이름이 생기니까 다들 외상을 하더군요.')],
npc_elise_ex22:  [S(EL, '리아 언니가 언덕에 비석 세운대요. 저도 이름 새기는 거 도와드렸어요. 글씨 제일 반듯하대요!'), S(EL, '비석이 다 서면, 언니 엄마도 종소리 들으러 마을에 오실까요?')],
npc_alberto_ex22:[S(A, '까마귀 결사 명부에서 내 이름도 지웠다더군. 허허… 백 년 만에 홀가분하구먼.')],
npc_marta_ex23:  [S(MA, '게시판에 또 빈칸 공고가 붙었어. 맡을 사냥꾼 칸엔 매번 빅터 이름이야. …요즘 그 양반 웃는 얼굴이 좀 쓸쓸해.'), S(MA, '그래서 공고 옆에 적어 놨지. "보수 — 흑묘 여관 스튜 평생 무료." 호호!')],
npc_hadwin_ex23: [S(HA, '하겐의 은 무기. 손잡이 가죽까지 손수 감았더군. …좋은 장인이었다.'), S(HA, '은은 무르다. 그런데 그 늙은이 은은 안 무르더군. 마음을 넣어 두들긴 거다.')],
npc_elise_ex23:  [S(EL, '빅터 아저씨가 은탄 한 알을 모자 옆에 두고 왔대요. 그건 기도 같은 거죠? 저도 그 할아버지 위해 종 쳤어요.')],
```
**Alberto in Part 2 (UI).** `data/npcs.js` `npcVisible`: `appear.hideFlag` → `npc_alberto.appear = { hideFlag: 'p2_started' }`
(he lay down in the back room, `story_p2.js:116`). Church (Part 2 only) row **「안쪽 방 — 신부님」**: `bus.emit('npcTalk', { npcId: 'npc_alberto' })`
+ `push('dialogue', { npc: 'npc_alberto', world })` — keeps `npc_alberto_ch14…ch20`, `npc_alberto_ex22`, the `ab_dawnflower`
offer and the `el_letter` talk goal reachable.
**Elise keeps the church in Part 2 (UI).** Keeper = Elise when `flags.p2_started` (portrait/name; background unchanged).
`data/town.js` `SHOP_LINES`:
```js
elise: {
  hello: ['어서 오세요! 신부님은 안쪽 방에서 쉬고 계세요. 조용히요!', '오늘도 종 쳤어요. 헌터님도 들으셨어요?', '성당 문은 제가 지켜요. 신부님 대신이에요!'],
  cls: ['우와, 새 힘이 느껴져요! 신부님께 자랑해도 돼요?', '신부님이 그러셨어요. 힘은 지키는 데 쓰는 거래요.'],
  reset: ['다 잊어도 괜찮대요. 길은 여러 갈래래요. 신부님 말씀이에요!'],
  save: ['여정 기록, 제가 또박또박 적어 둘게요!'],
  bless: ['헌터님께 축복을! …제 축복도 효과 있어요. 매일 연습했거든요.', '무서워하지 마세요. 종소리 닿는 데까지는 제가 기도할게요.'],
  asc: ['메아리 너머에서 돌아오셨군요… 눈빛이 달라졌어요.', '새 길을 걸으시는 거예요? 종 칠 때 그 이름도 불러 드릴게요!'],
  trial: ['종 줄 꼭 붙잡고 있을게요. 길 잃지 마세요!', '메아리 속은 추워요. 따뜻하게 하고 가세요!'],
  trialDone: ['돌아오셨다! 뭘 가지고 나오셨어요? …아, 마음이죠. 알아요.'],
},
// alberto gains asc/trial/trialDone for symmetry (Part 1 keepers never reach them):
//   asc: ['새 길을 찾았구먼. 그 길도 결국 사람을 지키는 길이어야 하네.'], trial: ['다녀오게. 종소리를 잊지 말고.'], trialDone: ['돌아왔구먼. 얼굴을 보니 답을 찾았나 보이.']
```
Part 2 hint strings in Elise's voice (church `hint()`, same conditions):
| condition | text |
|---|---|
| hearts ≥ 6 | `'세계의 심장이 여섯 개 다 모였대요! 등불 들고 공허로 가세요. 저는 여기서 종 칠게요.'` |
| hearts < 6 | `` `되찾은 세계의 심장은 ${n}개래요. 여섯 개 다 모아야 공허로 가는 길이 열린대요.` `` |
| p2_done, shards < 6 | `'별의 조각을 여섯 개 다 모으면 공허가 환해질지도 모른대요. 레이븐 아저씨가 그랬어요.'` |
| s21 open | `'구름 위에서 용이 운대요. 이졸데 언니가 밤마다 하늘만 봐요. 성문 밖 지도를 펼쳐 보세요!'` |
| s22 open | `'안개 묘지 너머 언덕에서 까마귀들이 울어요. 성문 밖 지도를 펼쳐 보세요.'` |
| s23 open | `'북쪽 고개에 액수 칸이 빈 공고가 붙었대요. 성문 밖 지도를 펼쳐 보세요.'` |
| s24 open | `'남쪽 수녀원에 간 언니들이 안 돌아와요. 장미 냄새 나는 밤엔 창문 꼭 닫으래요.'` |
| s25 open | `'그레타 아줌마가 밤마다 등불 들고 불탄 목장에 가요. 성문 밖 지도를 펼쳐 보세요.'` |
| new: p2_done and the current hero ≥ Lv 70 without Trial Ⅰ | `'종 칠 때 메아리가 들려요. 「전직」에서 시련을 확인해 보세요!'` |

### 5.5 Villain depth
- **GAPS-B** story.js `b_dracula_pre` (after the two existing Dracula lines, before the hero block):
  `S('b_dracula', '사백 년 전, 나는 이 산맥의 영주였다. 역병이 백성을 삼킬 때 신은 끝내 대답하지 않았다.')`,
  `S('b_dracula', '그래서 심연과 계약했다. 영원한 밤과 맞바꾼 것이 무엇이었는지는… 이제 기억도 나지 않는군.')`.
- **GAPS-B** story.js `b_dracula_post` (after the two `D2` lines): `D2('…아멜리아. 그대의 아이가… 해를… 보는구나…')`.
- **GAPS-A** story_p2b.js `b_nihil_form2` (after the existing Nihil line):
  ```js
  { who: 'b_nihil', portrait: 'portraits/b_nihil2', text: {
      kael: '끝나지 않는 약속은 저주와 같다. 채찍을 쥔 손이 몇 대째냐.',
      sera: '네 기도에 대답한 자는 없다. 내가 그 침묵이다.',
      victor: '값을 매길 수 없는 것을 쫓는 자여. 그 빈칸이 바로 나다.',
      bran: '네 형제들은 모두 내 안에 있다. 너도 곧 그 곁에 눕게 되리라.',
      lia: '이름 없는 칼이 가장 조용했다. 왜 이름을 얻었느냐.',
      azel: '반은 밤, 반은 낮. 너는 어느 쪽에도 속하지 않는다. 나처럼.',
      isolde: '무너지는 하늘의 비명. 그것이 내가 들은 가장 아름다운 고요의 시작이었다.',
      default: '너희가 쌓은 모든 소리는 결국 나에게로 돌아온다.' } },
  H({ kael: '저주가 아니다. 내가 고른 약속이다.', sera: '침묵이라면 제가 채울게요. 노래로요!',
      victor: '빈칸은 내가 채운다. 평생 걸려도.', bran: '형제들은 내 서약 안에 있소. 그대 안이 아니오!',
      lia: '부르는 사람이 생겼으니까. 그거면 충분해.', azel: '나는 어느 쪽도 아니다. 그래서 둘 다 지킬 수 있다.',
      isolde: '그 비명 끝에도 창은 남았다. 여기 있다!', default: '돌려주지 않아. 이 소리는 우리 거야!' }),
  ```
- Death is covered by Bran Ⅱ, Chaos by Azel Ⅱ.

### 5.6 Companion join one-liners `cmp_join_<id>` (GAPS-B)
`story_director.js` subscribes lazily (first `hubStoryEnter` call) to `bus 'companionUnlocked'` `{id}` and sets
`state.progress.flags['cmpq_' + id] = true` when `SCRIPTS['cmp_join_' + id]` exists and `!state.arcade`. On a hub arrival it plays the
first queued id in `UNLOCK_ORDER` (data/companions.js) before banter, then sets the flag false. Ids with their own scene are skipped
(no script): `mt_warhorse`, `mt_giantbat`, `mt_direwolf`, all Part 2 / side companions. Portraits `portraits/cmp_g_*` / `cmp_m_*`.
```js
cmp_join_gd_knight: [
  CMPX('gd_knight', '가웨인', 'portraits/cmp_g_knight', '(안개 속에서 망령 기사가 투구를 벗고 한쪽 무릎을 꿇는다.)'),
  CMPX('gd_knight', '가웨인', 'portraits/cmp_g_knight', '…가레스 단장님의 부관, 가웨인. 주군을 지키지 못한 칼이오. 이제 그대를 지키겠소.'),
  H({ bran: '가웨인 경…! 남아 계셨구려. 이번엔 함께 새벽까지 갑시다.', kael: '고맙다, 가웨인. 등을 맡기지.', sera: '고마워요, 가웨인 경. 함께 가요.',
      victor: '망령 기사 호위라. 보수는 안 받지? 좋아, 같이 가자.', lia: '…주군 지키는 칼이면 믿을 만하지. 따라와.',
      azel: '주군을 잃은 기사라. 나와 처지가 비슷하군. 가자.', isolde: '기사의 예를 받겠다. 함께 가자, 가웨인 경.', default: '고마워, 가웨인. 함께 가자.' }) ],
cmp_join_gd_reaper: [
  CMPX('gd_reaper', '모르스', 'portraits/cmp_g_reaper', '(꼬마 사신이 제 키의 두 배나 되는 낫을 끌고 와 장부를 내민다. 첫 장이 비어 있다.)'),
  CMPX('gd_reaper', '모르스', 'portraits/cmp_g_reaper', '…장부지기 모르스. 주인이 없어졌어. 이제 뭘 적어?'),
  H({ bran: '그 장부에 무엇을 적을지는… 언젠가 내가 정하겠소.', lia: '아무것도 적지 마. 그게 제일 좋은 장부야.',
      kael: '적을 건 내가 정하지 않는다. 우선 따라와라.', sera: '살아 있는 사람 이름부터 적어 볼까요? 따라오렴.',
      victor: '외상 장부로 쓰면 딱이겠군. 따라와.', azel: '죽음의 장부라. 내 이름은 거기 없겠지. 따라와라.',
      isolde: '빈 장부라면 좋은 일만 적어라. 함께 가자.', default: '아무것도 안 적어도 돼. 따라와.' }) ],
cmp_join_mt_boar:       [N('(바르그가 콧김을 뿜으며 엄니로 땅을 판다. 태워 주겠다는 뜻인 모양이다.)'), H('잘 부탁해, 바르그. 벽은 네가 맡아.')],
cmp_join_mt_skelsteed:  [N('(머리 없는 기사를 태웠던 해골마가 푸른 불꽃 눈으로 이쪽을 본다. 새 주인을 고르는 눈이다.)'), H('주인은 머리를 잃었어도 너는 길을 잃지 않았구나. 가자, 코슈타.')],
cmp_join_mt_wyvern:     [N('(갓 깨어난 진홍 비룡이 불씨 섞인 하품을 하고 손가락을 깨문다. 아프지 않다.)'), H('연구소의 알에서 태어났구나. 이번엔 실험체가 아니라 동료다, 스칼렛.')],
cmp_join_gd_fairy:      [N('(밴시의 등불에서 풀려난 작은 요정이 머리카락에 매달려 반짝인다.)'), H('등불에서 나와서 다행이다, 아리아. 어둠 속 길은 네가 비춰 줘.')],
cmp_join_gd_spiritwolf: [N('(별빛이 흐르는 푸른 늑대가 발치에 와서 앉는다. 묘지에서 울던 그 늑대다.)'), H('이제 울지 않아도 돼, 하티.')],
cmp_join_gd_imp:        [N('(소악마가 계약서에 해골 지팡이로 서명하고, 금화 한 닢을 슬쩍 챙긴다.)'), H('…그 금화는 계약금으로 치지. 잘 부탁한다, 핌.')],
cmp_join_gd_whelp:      [N('(새끼 본 드래곤이 갈비뼈 속 보랏빛 불을 깜박이며 발목에 몸을 감는다.)'), H('뼈만 남은 용의 아이라. 크론, 이번엔 살아서 자라라.')],
cmp_join_gd_owl:        [N('(금서의 사슬에서 풀려난 올빼미가 어깨에 앉아 고개를 한 바퀴 돌린다.)'), H('사슬은 끝났다, 미네르바. 이제 보고 싶은 책만 봐.')],
cmp_join_gd_clock:      [N('(금 간 도자기 얼굴의 태엽 인형 틱톡이 등의 열쇠를 돌리며 꾸벅 인사한다. 째깍, 째깍.)'), H('오토가 남긴 인형인가…. 시간을 벌어 준 사람의 것이라면, 이번엔 내가 지키지.')],
```
(The two-line joins use hero-neutral plain `H('…')` — allowed because they are not reaction blocks.)

### 5.7 Credits and title-card consistency
| owner | target | change |
|---|---|---|
| B | story.js `CREDITS`, after `'대장장이 — 하드윈',` | insert `'영혼의 마구간지기 — 그레타',` |
| A | story_ex.js | `export const CREDITS_EX = { s21: ['하늘 정원의 둥지 — 은빛 뇌룡 아르겐'], s22: ['이름 없는 언덕 — 둥지어미 네메인', '이름을 기억하는 까마귀 — 무닌'], s23: ['빈칸의 현상금 — 늑대잡이 하겐'], s24: ['시드는 장미 — 첫 신부 엘제베트', '견습 수녀 — 클라라', '장미 향 나는 박쥐 — 베스퍼'], s25: ['불탄 목장의 밤 — 마부 카론', '흑철 군마 — 모르겐'] };` |
| B | story.js `creditsFor` | after `CREDITS_P2`, if any `ex_sNN_done`: `'— 외전 —'` + the rows of the done chapters (in order) + `''` (via `import * as EX from './story_ex.js'`; missing export → nothing) |
| A | story_ex.js s23 title | `title('외전', '늑대 고개')` → `title('외전', '빈칸의 현상금')` |
| A | story_ex.js s24 title | `'장미 수녀원'` → `'시드는 장미'` |
| A | story_ex.js s25 title | `'불탄 목장'` → `'불탄 목장의 밤'` |
| A | story_ex.js header comments (:1, :11) | `「까마귀의 이름」` → `「이름 없는 언덕」` (stages.js:131 comment: lead, optional) |
| B | story.js `'끌려간 지 사흘. 아직 늦지 않았어.'` (lia, ~310) | → `'끌려간 지 한나절. 아직 늦지 않았어.'` |
Rule: title-card `sub` = end-card episode name; world-map reveal titles stay place names.

### 5.8 Part 1 → Part 2 seam
| owner | site | old → new |
|---|---|---|
| B | story.js `'다시는 붉은 달이 뜨지 않을 것이다. …'` | → `'다시는 붉은 달이 뜨지 않으리라고, 사람들은 믿었다. 악마성의 전설은 옛이야기가 되어 갔다.'` |
| B | story.js `'그해 겨울, 알베르토 신부는 성당 종탑 아래에서 평온히 눈을 감았다. …'` (Part 1 true ending) | → `'그날 아침, 알베르토 신부는 종탑 아래 의자에 앉아 해가 다 뜰 때까지 하늘을 보았다. 그의 얼굴은 웃고 있었다.'` (his death is told once, by the Part 2 ending) |
| A | story_p2.js `'알베르토의 머리카락은 하룻밤 사이에 눈처럼 하얗게 세어 있었다.'` | → `'이미 하얗게 센 머리 아래, 알베르토의 얼굴은 사십 일 만에 십 년은 늙어 보였다.'` |
Timeline note: trials, side chapters and the post-ending town all sit between the Part 2 ending and "그해 겨울" (both endings'
Alberto death line), which is why Alberto still speaks from the back room.

### 5.9 Isolde in Part 1 (NG+ / account unlock) — story.js prologue (GAPS-B)
After `N('그리고 오늘 밤, 산기슭 마을 에슈빌에 백 년 만의 비명이 울려 퍼졌다.')`:
```js
ifChar('isolde', 'iso'), go('iso_end'),
L('iso'),
N('종이 울리기 직전, 북쪽 숲에 은빛 섬광 하나가 떨어졌다. 날개 장식 서클릿의 기사가 창을 짚고 일어섰다.'),
N('피의 윤회. 한 번 끝난 밤이 다시 돌 때, 바퀴는 가끔 다른 길로 구른다.'),
L('iso_end'),
```
plus `isolde:` keys in the two prologue blocks: hero block `'이 붉은 달… 꿈에서 몇 번이나 본 하늘이다. 용기사 이졸데, 오늘 밤의 창이 되겠다.'`;
Alberto block `'하늘에서 떨어진 기사라… 오늘 밤은 무엇이 떨어지든 반가운 손이네.'`. The other 75 Part 1 reaction blocks keep `default`.

---------------------------------------------------------------------------------------------------------------------------

## 6. Line budget
| block | scripts | lines ≈ | chars ≈ |
|---|---|---|---|
| §3–§4 trials (14 × pre/win + frame + 2 replay) + 14 desc + 14 failLine | 31 | 330 | 13,500 |
| §5.1 Isolde keys | 33 edits | 40 keys | 1,300 |
| §5.2 seventh anchor | 6 sites | 8 | 400 |
| §5.3 banter | 14 | 75 | 2,600 |
| §5.4 town reactions + keeper lines + hints | 9 + data | 45 | 1,900 |
| §5.5 villains | 3 sites | 3 + 16 strings | 700 |
| §5.6 companion joins | 11 | 30 | 1,200 |
| §5.7–§5.9 credits, titles, seam, Isolde P1 | — | 30 | 1,100 |
| **total** | **≈ 70 new scripts + ≈ 50 edit sites** | **≈ 580** | **≈ 22,700** |

## 7. Packages (see classes_t3 §13)
- **STORY-TRIALS** — `story_trials.js` (§3–§4). Wave 0; no code dependency (merge line added by GAPS-B).
- **STORY-GAPS-A** — §5.1, §5.2, §5.5 Nihil, §5.7 A rows, §5.8 A row. Wave 0.
- **STORY-GAPS-B** — `story_extra.js` (§5.3 scripts + `BANTER`, §5.4 reactions, §5.6 joins), `story_director.js` (stub first,
  then §5.3/§5.6 logic), story.js (merge lines `SCRIPTS_TRIALS` + `SCRIPTS_EXTRA` in the `Object.assign` at the end, §5.4
  `pickNpcScript`, §5.5 Dracula, §5.7 B rows, §5.8 B rows, §5.9). Wave 0.
- **UI-CHURCH-CLASS** — §5.4 Alberto hide, church row, Elise keeper/lines/hints (town.js, npcs.js, church.js). Wave 1.
- Tests: QA-ASC extends `test_part2.mjs` (lengths, speakers, labels, Isolde coverage, trial ids); story packages run the same checks
  from a scratch script until then. Fonts: lead, once.

## 8. New canon (approved with this spec)
1. 「메아리」: the void remembers; bell + lantern open echoes; nothing physical comes back.
2. The seventh anchor is Eshville's bell, held by Lumina's blood; the Count's bats strike it first every red moon.
3. Valcrane: the first sealer **알브레히트 발크레인** (1397, the year of the Count's pact) swore to Lumina's bell girl
   "종이 울리면 발크레인이 간다"; one Valcrane per red moon → four graves before Kael.
4. The 1697 sisters came from the Rose Convent; prayer leader **아그네스 수녀**.
5. The 1697 gunslinger **울프람** started the wolf-paw brand and the blank bounty; Hagen's lineage.
6. Dawn Oath first verse "새벽이 오지 않는 밤은 없다. 오지 않는다면, 우리가 가져간다."; Death culled the order a decade before
   each red moon; Gareth's kneeling bought Bran's life (one crossed-out line).
7. Lia's father **후긴** froze ~20 years ago on Valakir's summit glacier, where Isabella's ice survives between moons; he wanted the
   name "리아".
8. Amelia (Lumina's line) asked for the ritual; it struck half of infant Azel's name from the Chaos pact; the 1797 kidnapping of
   Elise was for the other half; all Count's-blood bearers repay borrowed time, Azel included.
9. Isolde's commander **브륀힐트** ordered her to chase Argen; the order fell to Ziz's corrupted storm; oath "용이 날 수 있는 하늘을 지킨다".
10. Victor takes an apprentice; Sera becomes Elise's second bell-ringer; Kael's whip hangs on the bell-tower post; Bran refounds
    the Dawn Oath with Mors's ledger.
