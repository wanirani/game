# 제2부 「균열의 순례」 — Part 2 design spec (s14–s20, seven otherworlds)

> Spec for user request #3 ("more volume: after the 13-stage story, travel to other worlds"), with the story-side
> integration of request #4 (mounts and guardians). This file is the single source of truth for every Part 2 ID,
> number, rule and Korean string it quotes. Implementers must not rename IDs. Where this spec quotes Korean text
> verbatim, use it verbatim; where it gives only a beat, write natural Korean in the established tone.
>
> Language rule: spec prose is English. Every player-facing string is Korean.
> Units: tiles (TILE = 48 px) unless marked px. Rows/cols are zero-based, row 0 = top. "W×H" = width × height in tiles.
> Base stats of enemies/bosses are level-1 values (scaled by `enemyStats()` / `Boss` constructor), same as Part 1.

## Table of contents
0. Scope, goals, cross-spec rules
1. Story (premise, cast, chapter beats, script list, key lines, NPC lines, endings, credits)
2. Flow, progression, flags, save migration
3. Gimmick engine (7 kinds, API, hooks, props, tile chars, validator)
4. Stages and rooms (s14–s20 data + room specs)
5. Enemies (24 new, AI kinds, render rules)
6. Bosses (7)
7. Items, loot, shop (tier 7, materials, keys, uniques, Part 2 mythics)
8. Docs (d21–d27) and lore (l21–l34)
9. Quests
10. World map page 2
11. Arcade integration
12. Music
13. Assets (Kling, Blender) with prompt guidance
14. Mounts and guardians (request #4) — story integration contract
15. Balance targets (levels 46–70)
16. Work packages, file ownership, shared-file edit table, order
17. Acceptance tests
18. Risks

---

## 0. Scope, goals, cross-spec rules

**Adds**: 7 stages (s14–s20, chapters 14–20), 7 worlds, 7 gimmicks (6 new world gimmicks + a final "void wall" and remix
rooms), 24 enemies, 7 bosses, 2 new endings (5 total), a Part 2 prologue, credits changes, tier-7 equipment, 7 materials,
14 key items, 10 boss/quest uniques, 6 Part-2 mythic weapons, 7 docs (3 new command techniques), 14 lore entries,
7 main + 13 side quests, world-map page 2, save version 2, 11 music tracks, ~38 Kling images, ~45 Blender renders.
Target first-run playtime of Part 2: 2.5–3.5 h (normal).

**Non-goals** (owned by other specs, do not implement here): companion mechanics (companion spec), hero renderer detail and
inventory turntable (hero spec), the arcade/DNF movement feel and super-ultimate cut-ins (ult/feel spec), fonts (font
spec), touch/gamepad layer (mobile spec), APK/Netlify (release spec). Part 2 code must *use* those systems through
their public APIs when present and degrade gracefully when absent (optional chaining, never hard imports of files this
spec does not create).

**Cross-spec quality rules that apply to everything below**
- Art bar (requests #1/#2): new enemies and bosses are drawn at the new, higher detail standard — layered shading,
  rim light, secondary motion (cloth/hair/tendrils), grotesque detail on bosses, multi-part silhouettes, readable
  telegraphs. If `docs/specs/` contains a boss/enemy art guideline from the boss-overhaul spec, follow it.
- Fonts: use `FONT.*` / `ui.text()` only; never hard-code font families (request #9 swaps them).
- Input: only the action names in `core/input.js` (`left right up down jump attack dash sub skill1 skill2 ult swap menu
  confirm cancel map`). Every Part 2 interaction must be doable with keyboard, gamepad and the virtual pad:
  interact = `up` (or attacking the object), swim = `jump`, dive = `down`.
- HUD additions from gimmicks are drawn top-centre (`y` 14–60) so they never collide with the portrait (top-left),
  score (top-right), combo (right, y≈150), boss bar (bottom on desktop, y=164 on touch) or thumb pads (bottom corners).
- Performance: every per-frame gradient/sprite must be cached; particle counts scale with `world.fx.quality`.
  Budget: gimmick update+draw ≤ 1.5 ms/frame on a mid phone at `quality: 'medium'`.
- No new npm dependencies, no new audio files (use existing sfx names), no build step.
- Circular-import rule from ARCHITECTURE.md applies (never touch imported values at module top level).

---

## 1. Story

### 1.1 Premise
Forty days after the True End (autumn 1797), during Eshville's first harvest festival in a hundred years, the night sky
cracks like glass. Alberto collapses, his hair turned white overnight (the Count's blood that kept him alive for a
century is gone; a century of age is catching up with him — this is consistent with the Part 1 true-ending flash-forward
"그해 겨울, 알베르토 신부는 … 평온히 눈을 감았다", because Part 2 happens in the autumn *before* that winter).

Rook the merchant drops his act: he is **레이븐 (Raven)** — the "R" who founded the Crow Society (까마귀 결사), a
thousand-year-old crow of the lost sky kingdom, and the **Watcher of the Border (경계의 파수꾼)**. He explains:
- The Chaos Lord fed on fear, and while it was fed, something older slept beneath all worlds: **니힐 (Nihil), 태초의
  공허** — the nothingness from before creation. Chaos was one of its dreams.
- A thousand years ago **성녀 루미나 (Saint Lumina)** — Elise's ancestor — and Raven lowered **일곱 닻 (seven anchors)**
  to keep the seven worlds bound to each other above the void. Each anchor is a **세계의 심장 (World Heart)** guarded by
  a warden.
- With Chaos destroyed, Nihil woke hungry. Its touch corrupted six wardens into monsters; their worlds are sinking into
  the void, dragging this world after them. The crack above Eshville is the first symptom. (Time in the otherworlds runs
  faster than here, which is why the corruption is already so deep.)
- The hunter must cross the rift with Raven's **균열의 등불 (Rift Lantern)**, defeat each corrupted warden, recover the
  six World Hearts to re-anchor the worlds, then descend into the **태초의 공허** and face Nihil.
- Optional: each world hides a **별의 조각 (Star Shard)**. Six shards form the **새벽의 별 (Morning Star)** that can fill
  the void with light instead of merely sealing it (Part 2 true ending).

Two endings: **파수꾼의 밤** (normal: the void is sealed, the scar in the sky remains, Raven must watch it forever) and
**새벽의 별** (true: the Morning Star fills the void, the scar vanishes, Raven unmasks in the sunlight).

### 1.2 Cast and roles in Part 2
| Who | Role in Part 2 |
|---|---|
| Player hero (6 variants) | Every hero line uses the `H({ kael, sera, victor, bran, lia, azel, default })` pattern exactly as Part 1. Personal beats: s14 (reflection), s18 (nightmare). |
| 로크 / 레이븐 `npc_rook` | Guide. After `p2_prologue` his lines use `name: '레이븐'` (keep portrait `portraits/npc_rook`). Speaks formally as Raven, slips into merchant speech (“~습죠/~입니다요, 헤헤”) when embarrassed. Appears in person in s17 (in-stage NPC) and in s20. True ending portrait: `portraits/npc_rook2` (unmasked). |
| 알베르토 `npc_alberto` | Dying mentor (bedridden from ch14). Quest `ab_dawnflower`. Blessing in `s20_intro`. |
| 엘리제 `npc_elise` | Lumina's descendant; her blood lights the lantern with the six hearts (`s20_intro`). Quest `el_pearl`. |
| 마르타 `npc_marta` | Comic relief, quest `mt_feast`. |
| 하드윈 `npc_hadwin` | Learns his grandfather 하드윈 1세 was dragged to Moloch's forge (lore l23). Sells tier 7 from chapter 15. Quests `hd_ember`, `hd_plus15`. |
| 카밀라 `npc_carmilla` | Only if `carmilla_trust2`: dreams of the void since her curse broke; in-stage NPC in s18; quest `cm_dreams`. Without trust2 she appears with dismissive lines (existing NPC visibility rules unchanged). |
| 성녀 루미나 | Ghost/voice in s16 frescoes (lore), s20 t2. Speaker id `'성녀 루미나'` (no portrait). |
| 에드문트의 환영 | Returns briefly in s20 t2 (speaker `'에드문트의 환영'`, as in s13_t2). |
| Companions (request #4) | `gd_mirra`, `mt_ignis`, `gd_lumen`, `mt_gale`, `gd_momo`, `mt_silva` — see §14. Speak with `{ who: '<id>', name: '<Korean>', portrait: 'portraits/<id>' }` (portrait may be missing → no portrait, that is fine). |
| Bosses | `b_narkissa`, `b_moloch`, `b_dagon`, `b_ziz`, `b_mara`, `b_behemoth`, `b_nihil` (speaker = boss id → BOSSES name/portrait). |

### 1.3 Chapter beats (per script)
Script types: **story scene** (`scenes/front/story.js`, cinematic, supports `cg`, `bg`, `title`, `wait`, `flash`) for
`p2_prologue`, `<sid>_intro`, `<sid>_outro`, endings; **dialogue overlay** (`scenes/dialogue.js`) for `_t1/_t2`,
`<bossId>_pre/_post`, boss phase scripts and in-stage NPC scripts. Both runners must support the new
`{ cmd: 'recruit', id }` (see §2.4). Use the helper style of `story.js` (`N, H, S, R, RN, cg, bgm, se, quake, flag, give,
L, go, ifChar, ifFlag`), re-declared locally in `story_p2.js`.

Each `_t1/_t2` has 4–8 lines; `_intro` 6–12; `_outro` 8–14; `_pre` 4–8; `_post` 2–5; endings 14–24.
Every chapter intro ends with one `[TIP]` narrator line for that world's gimmick (texts given below, verbatim).

**p2_prologue** (story scene, bg `cg/cg_rift_sky`; played after the True End credits, or on first world-map visit for
legacy saves — §2.2)
1. `bgm('prologue')`, `cg('cg_rift_sky')`, `{ cmd:'title', text:'PART Ⅱ', sub:'균열의 순례' }`.
2. N: “진정한 새벽이 찾아온 지 사십 일. 에슈빌은 백 년 만에 첫 수확제를 맞았다.” / N: “모닥불이 타오르고, 흑묘 여관에서는 밤새 노랫소리가 흘러나왔다.”
3. `se('thunderclap')`, `quake(10, 0.8, '#bfe0ff')`, N: “그때였다. 밤하늘에 — 유리가 깨지듯 — 은빛 금이 갔다.” / S(엘리제): “저, 저기 봐요! 하늘이… 깨졌어요!”
4. `se('bell')`, N: “성당의 종이 울렸다. 그리고 한가운데서 뚝 멈췄다.” / S(마르타): “신부님! 신부님, 정신 차려요!” / S(알베르토): “허허… 괜찮네. 종 치는 팔에 힘이 조금 빠졌을 뿐이야.” / N: “알베르토의 머리카락은 하룻밤 사이에 눈처럼 하얗게 세어 있었다.”
5. `cg('cg_rook_reveal')`, S(로크): “까악. …드디어 때가 왔군요.” / S(로크): “장사꾼 흉내는 여기까지 하겠습니다.” / `{ who:'npc_rook', name:'레이븐', text:'나는 레이븐. 까마귀 결사를 세운 "R"이자, 세계와 세계 사이의 경계를 지켜 온 파수꾼이다.' }`, `flag('rook_revealed')`.
6. `ifChar('lia','lia')` branch: H(lia): “…역시 당신이었어.” → `se('hit_heavy')`, `quake(6,0.3)`, N: “리아의 주먹이 까마귀 가면을 정통으로 때렸다.” → 레이븐: “…약속은 지키는 아이로군. 잘 컸다.” (Part 1 `npc_rook_ch9` set this up.)
7. 레이븐 exposition, 4 lines (verbatim):
   - “혼돈의 군주는 공포를 먹었다. 그리고 그 배가 부른 동안, 그보다 오래된 것이 잠들어 있었다.”
   - “니힐. 태초의 공허. 빛도 어둠도 태어나기 전의 무(無).”
   - “혼돈이 사라지자 니힐이 굶주린 채 눈을 떴다. 이 세계를 붙들고 있는 일곱 세계의 닻이 하나씩 공허로 끌려가고 있다.”
   - “저 하늘의 금은 시작일 뿐이다. 닻이 모두 끊어지면 에슈빌도, 이 세계도 전부 무로 돌아간다.”
8. H reactions (6 variants; Kael: the Valcrane task was never only the castle; Sera: faith vs. "nothing"; Victor: asks who pays; Bran: oath of dawn extends to other worlds; Lia: angry but in; Azel: "the thing beneath my father's throne had a mother").
9. `{ if:'carmilla_trust2', who:'npc_carmilla', text:'굴레가 끊어진 뒤로 밤마다 꿈에서 아무것도 없는 곳을 봐. 너무 조용해서… 무서운 곳.' }`
10. 레이븐: “여섯 세계의 심장을 되찾아 닻을 다시 내려야 한다. 각 세계의 수호자는 이미 공허에 먹혀 괴물이 되었지.” → `give('k_rift_lantern', 1, '균열의 등불')` → 레이븐: “이 등불이 꺼지지 않는 한, 당신은 어느 세계에서든 돌아올 수 있다. 에슈빌 성문에서 기다리겠다.”
11. Alberto in bed: S(알베르토): “이번엔… 종을 쳐 줄 수가 없겠구먼. 대신 기도하겠네. 매일, 매 시간.” → H reply (6 variants).
12. `flag('p2_started')`, `cg(null)`, `{ cmd:'title', text:'PART Ⅱ — 균열의 순례', sub:'THE PILGRIMAGE OF THE RIFT' }`.

**Chapter 14 — 거울의 성 (만경궁)**
- `s14_intro`: arrival through the rift into a castle of mirrors where reflections move a moment *before* you; Raven's voice through the lantern (narrator: “등불 너머에서 레이븐의 목소리가 들린다.”); the warden 나르키사 once let souls see their true selves, now she hoards reflections. TIP (verbatim): `N('[TIP] 금이 간 거울을 공격하거나 ↑ 입력으로 만지면 실상과 허상이 뒤바뀐다. 한쪽에만 있는 벽과 발판을 잘 보라.')`
- `s14_t1` (r1): the hero's reflection speaks by itself (line `{ who:'hero', name:'거울 속의 나', text:{…} }`). Taunts (verbatim): kael “가문의 사명이 끝났는데, 너는 이제 무엇으로 사느냐?” · sera “신이 침묵하면, 너는 누구에게 기도하지?” · victor “현상금 없는 싸움이라. 그게 네 진짜 얼굴이냐?” · bran “형제들을 두고 도망친 종자. 그게 너다.” · lia “까마귀 둥지에서 자란 아이. 네 이름은 누가 지어 줬지?” · azel “피를 마시면 편해질 텐데. 아버지처럼.” · default “너는 누구지?”. Then H replies (6 variants, defiant).
- `s14_t2` (r4): a girl's face in a hand mirror — 미라 (`gd_mirra`, first shown with `name:'거울 속의 소녀'`): “나는 미라. 여제가 버린 진짜 얼굴이에요.” / “그녀가 가면을 쓰고 나를 깨뜨렸어요. 공허가 속삭인 날부터, 아름다운 것만 보고 싶어 했거든요.” / “부탁해요. 가면을 깨 주세요. 그러면… 그녀도 나도 자유로워질 거예요.” H replies.
- `b_narkissa_pre`: `cg('cg_mirror_empress')`, `se('boss_roar')`; 나르키사: “아름답지? 네 모든 얼굴이 내 드레스에 걸려 있단다.” / “가면 아래를 보려던 자는 모두 이렇게 되었지. 너도 곧 한 장의 거울이 될 거야.” H (6 variants); `cg(null)`.
- `b_narkissa_shatter` (phase-3 transition, pushed by the boss code like `b_dracula_transform`): `se('break_wall')`, `quake(12, 0.8, '#dff4ff')`; lines use `name:'깨진 여제 나르키사', portrait:'portraits/b_narkissa2'`: “보지 마! 이 얼굴을… 보지 마아아!” / “천 개의 눈으로 보아도, 아름다운 건 하나도 없어!”
- `b_narkissa_post`: 나르키사 (form2): “…너였구나. 웃고 있던 나.” / 미라: “이제 쉬어요, 나.” / N: “깨진 거울 조각들이 눈처럼 흩날리고, 그 한가운데로 은빛 심장이 천천히 내려앉았다.”
- `s14_outro`: 미라 joins (`{ cmd:'recruit', id:'gd_mirra' }`, then 미라 line “이제부터 당신의 뒤를 비출게요. 뒤에서 오는 건 제가 먼저 볼게요.”); 레이븐: “첫 번째 닻이 다시 내려졌다. 에슈빌 하늘의 금이 한 뼘 줄었을 거다.”; H.

**Chapter 15 — 영겁의 용광로**
- `s15_intro`: a world of endless foundries where souls are melted to forge chains; Moloch was the Smith of the World who forged the anchors' chains, now forging chains that drag worlds down. TIP: `N('[TIP] 바닥이 붉게 끓어오르면 쇳물이 차오른다. 높은 발판으로 피하라. 수직갱에서는 쇳물이 아래에서 쫓아온다.')`
- `s15_t1` (r3, at the chain press): a flaming warhorse (이그니스) is being hammered into chain links by soul-smiths; its chains' key is inside the idol's furnace. Bran variant is longest (warhorses of the order). Ignis speaks as `{ who:'mt_ignis', name:'불타는 군마', text:'(히히힝—! 사슬에 묶인 말이 불꽃 섞인 콧김을 뿜는다.)' }`.
- `s15_t2` (r5): the soul-smiths kneel: “우리를 녹이지 말아 주시오…” / TIP-like hint N: “[TIP] 우상의 배 속 화로 창살이 열릴 때가 기회다.”
- `b_moloch_pre`: `cg('cg_forge_idol')`; 몰록: “더 많은 쇠. 더 많은 불. 더 많은 사슬을!” / “작은 불씨여. 너도 녹아서 사슬이 되어라.” H.
- `b_moloch_post`: 몰록: “불이… 꺼진다… 사슬이… 가볍구나…” / N: “화로 속에 갇혀 있던 영혼들이 금빛 불티가 되어 하늘로 올라갔다.”
- `s15_outro`: chains broken, 이그니스 joins (`recruit mt_ignis`); H; 레이븐: “두 번째 닻.” If the player's char is `bran`, an extra H line about riding again.

**Chapter 16 — 가라앉은 성소**
- `s16_intro`: a cathedral city drowned under a black sea; 다곤 was the Keeper of Tides who sank his city to hide it from the void and forgot the light. TIP: `N('[TIP] 물속에서는 점프로 헤엄치고 ↓ 로 잠수한다. 산소가 바닥나기 전에 수면이나 공기 방울 기둥으로 가라.')`
- `s16_t1` (r1): a bioluminescent jellyfish (루멘, `gd_lumen`, `name:'빛나는 해파리'`) blinks toward an air bubble column: “(삐릿— 삐릿—)”. H.
- `s16_t2` (r4, frescoes): N describes the fresco: Saint Lumina lowering an anchor with a crow-masked man at her side. Sera variant: “성녀님… 그리고 저 까마귀 가면은—”. Everyone else: realises Raven was there a thousand years ago.
- `b_dagon_pre`: `cg('cg_sunken_cathedral')`; 다곤: “빛… 수면 위의 빛을… 본 지가 언제였던가.” / “빛을 가져온 자여. 그 빛을 나에게 다오. 네 눈과 함께.” H.
- `b_dagon_post`: 다곤: “아아… 따뜻하구나… 빛이란…” / N: “사제왕의 왕관에서 초롱불이 하나씩 꺼지고, 푸른 심장이 떠올랐다.”
- `s16_outro`: 루멘 joins (`recruit gd_lumen`); 레이븐 (softly): “루미나… 천 년 만에 네 이름을 듣는구나.” H.

**Chapter 17 — 폭풍의 공중정원**
- `s17_intro`: floating ruins of the sky kingdom — Raven's birthplace; its god 지즈 is the storm itself. Raven comes in person. TIP: `N('[TIP] 돌풍 경고가 뜨면 바람을 등지거나 벽 뒤로 숨어라. 상승 기류에 올라타면 높이 떠오른다.')`
- `s17_t1` (r1): a griffin chick (게일, `mt_gale`, `name:'새끼 그리핀'`) hides in a nest torn by storms: “(삐이— 작은 날개가 떨고 있다.)”. H.
- `npc_rook_s17` (r3, in-stage NPC; picked by `resolveNpcScript` via `<npcId>_<stageId>`): 레이븐 on the kingdom (“여기가 내 고향이다. 폭풍이 담장이었고 번개가 등불이었지.”); `ifChar('lia', …)` extra exchange (“…그래서 결사 이름이 까마귀였구나.” / “네가 자란 둥지는 여기서 시작됐다.”).
- `s17_t2` (r4): Raven's confession: he left Ziz to keep his promise to Lumina; Ziz's corruption is his guilt.
- `b_ziz_pre`: `cg('cg_ziz_storm')`; 지즈: “(끼이이아아아——!)” / 레이븐: “지즈여… 저입니다. 떠났던 막내 까마귀입니다.” / 지즈: “(하늘 전체가 번개로 대답한다.)” H.
- `b_ziz_post`: 레이븐: “편히 쉬소서. 폭풍은 제가 기억하겠습니다.” N.
- `s17_outro`: the chick, bathed in Ziz's last lightning, grows into a griffin — 게일 joins (`recruit mt_gale`). H.

**Chapter 18 — 악몽의 미궁**
- `s18_intro`: a world woven from every sleeper's nightmare; the maze beats like a heart. TIP: `N('[TIP] 심장 소리에 맞춰 벽이 열리고 닫힌다. 붉게 맥동하는 곳은 곧 벽이 된다. 문은 여럿이지만, 피 묻은 문만이 앞으로 이어진다.')`
- `s18_t1` (r1): personal nightmares, 3–4 lines per hero via `ifChar` branches: Kael — Edmund's body in the castle and the whip that will never be hung up; Sera — Elise taken again while she prays; Victor — a wanted poster with his own face (“괴물 사냥꾼 빅터 그림 — 현상금: 괴물”); Bran — the burning fortress, 로렌 and 마커스 calling him back; Lia — the Crow initiation, a child with no name; Azel — his mother Amelia turning to ash in sunlight. Each ends with the hero refusing the dream.
- `npc_carmilla_s18` (r5 NPC): `ifFlag('carmilla_trust2','ally')` → she is dreaming too, gives the boss hint “마라의 입이 세로로 열리면 그 안의 눈을 노려.” else → dismissive but gives the same hint in a colder tone.
- `s18_t2` (r5): a small tapir-like spirit (모모, `gd_momo`, `name:'꿈먹는 맥'`) swallows a nightmare hand reaching for the hero: “(우물우물… 꺼억.)”.
- `b_mara_pre`: `cg('cg_mara_cradle')`; 마라: “쉬— 쉬— 착하지. 이제 눈을 감으렴. 영원히.” H.
- `b_mara_dream` (phase-2 transition, pushed by boss code): 마라 (`name:'요람의 마라'`): “꿈속에서는 내가 엄마란다. 자, 요람으로 오렴.”
- `b_mara_post`: 마라: “자장가가… 끝났네… 이번엔… 내가 잘 차례구나…”
- `s18_outro`: 모모 joins (`recruit gd_momo`). H.

**Chapter 19 — 썩어가는 숲**
- `s19_intro`: a rotting world-forest; spores are Nihil's hunger made physical; 베헤모스, the forest's gentle giant, is puppeteered by a fungal queen on its spine. TIP: `N('[TIP] 포자 구름 속에 오래 있으면 부패한다. 부패하면 회복이 줄고 체력이 서서히 깎인다. 여신상과 음식으로 정화하라.')`
- `s19_t1` (r1): a sick white stag spirit (실바, `mt_silva`, `name:'백록'`): “(흰 사슴이 힘없이 고개를 든다. 뿔 사이로 희미한 빛이 떨린다.)” / N: “실바의 눈이 숲 깊은 곳을 가리킨다. 짐승의 등에 매달린 무언가를.”
- `s19_t2` (r4, next to the dawnflower): N: “썩은 둥치 꼭대기에 새벽빛을 머금은 꽃 한 송이가 피어 있다.” H variants thinking of Alberto (the quest item is picked up normally; no script branching on quest state).
- `b_behemoth_pre`: `cg('cg_behemoth_rot')`; the queen speaks with Nihil's voice: `{ who:'b_behemoth', name:'균사의 여왕', text:'먹어라… 먹어라… 모든 세계를…' }` / N: “숲 하나가 통째로 일어섰다.” H.
- `b_behemoth_post`: N: “여왕이 말라 떨어지자, 짐승은 길고 부드러운 울음을 토하며 땅에 몸을 뉘었다. 그 등에서 새싹이 돋았다.”
- `s19_outro`: 실바 purified joins (`recruit mt_silva`); six hearts assembled — 레이븐: “여섯 심장이 모였다. 공허로 가는 길이 열린다. 이번엔 나도 간다.” H.

**Chapter 20 — 태초의 공허**
- `s20_intro` (story scene, bg `bg/hub` then `cg('cg_void_descent')`): dawn at Eshville's gate; Marta, Hadwin, Elise (and Carmilla if `carmilla_trust2`) gather; Alberto is carried out in a chair. Elise pricks her finger and her saint's blood lights the lantern; the six hearts orbit it. Alberto (verbatim): “가게. 그리고 돌아와서… 이 늙은이에게 무용담을 들려주게.” Companion one-liners (conditional on `recruit_<id>` flags). H. TIP: `N('[TIP] 공허는 뒤에서부터 무너져 온다. 멈추지 말고 달려라. 공허 속에는 여섯 세계의 기억이 떠다닌다.')`
- `s20_t1` (r1): the void speaks with the voices of old bosses — short lines by speaker ids `b_dracula` (“인간이여…”), `b_chaos` (“……작은 것.”), `b_narkissa`, `b_ziz` (screech) — then silence; H.
- `s20_t2` (r5): `{ who:'에드문트의 환영' }` and `{ who:'성녀 루미나' }` appear. `ifFlag('stars_all','star')`: 루미나 “빛은 나누어 가질 때 가장 밝아요. 그 별을… 공허의 한가운데에 띄워 주세요.” → `flag('p2_star')`; else 루미나 “별이 모자라요. 그래도 당신의 빛이라면, 문을 닫을 수는 있어요.”; H.
- `b_nihil_pre`: `cg('cg_nihil')`; 니힐 (verbatim): “……” / “나는 너희가 오기 전의 고요. 너희가 떠난 뒤의 고요.” / “시끄럽구나. 빛도, 노래도, 심장 소리도.” H.
- `b_nihil_form2` (phase 2): 니힐 (`portrait:'portraits/b_nihil2'`): “보아라. 너희가 쓰러뜨린 모든 것은 결국 나에게로 돌아온다.”
- `b_nihil_final` (phase 4): N: “공허 저편에서 목소리들이 들려온다.” → each recruited companion one line (conditional flags) → the other five heroes' voices through the lantern (for each hero X: `ifChar(X, 'skip_X')`, `{ who: X, text: … }`, `L('skip_X')`) → S(알베르토): “주여, 이 아이의 빛을… 꺼뜨리지 마소서.” → N: “[필살 게이지가 가득 찼다! 모든 빛을 모아 일격을!]”
- `b_nihil_post`: 니힐: “……빛이란, 이렇게… 시끄러운… 것이었나.” / “……나쁘지… 않군.”
- `s20_outro`: `ifFlag('stars_all','star')`: star route — the six shards rise and fuse into the Morning Star at the heart of the void (`cg('cg_p2_true')` is *not* shown here; keep it for the ending); normal route — the void folds shut, 레이븐: “문은 내가 지킨다. 천 년 동안 그래 왔듯이.” Both end with the hero waking at Eshville's gate at dawn. Then flow goes to the ending (§2.3).

### 1.4 Complete script ID list (all live in `src/data/story_p2.js`, merged into `SCRIPTS`)
```
p2_prologue
s14_intro s14_t1 s14_t2 b_narkissa_pre b_narkissa_shatter b_narkissa_post s14_outro
s15_intro s15_t1 s15_t2 b_moloch_pre b_moloch_post s15_outro
s16_intro s16_t1 s16_t2 b_dagon_pre b_dagon_post s16_outro
s17_intro s17_t1 s17_t2 b_ziz_pre b_ziz_post s17_outro npc_rook_s17
s18_intro s18_t1 s18_t2 b_mara_pre b_mara_dream b_mara_post s18_outro npc_carmilla_s18
s19_intro s19_t1 s19_t2 b_behemoth_pre b_behemoth_post s19_outro
s20_intro s20_t1 s20_t2 b_nihil_pre b_nihil_form2 b_nihil_final b_nihil_post s20_outro
ending_p2 ending_p2true
npc_alberto_ch14 npc_alberto_ch16 npc_alberto_ch18 npc_alberto_ch19 npc_alberto_ch20
npc_marta_ch14 npc_marta_ch15 npc_marta_ch17 npc_marta_ch20
npc_rook_ch14 npc_rook_ch16 npc_rook_ch17 npc_rook_ch19 npc_rook_ch20
npc_hadwin_ch15 npc_hadwin_ch17 npc_hadwin_ch20
npc_elise_ch14 npc_elise_ch16 npc_elise_ch19 npc_elise_ch20
npc_carmilla_ch14 npc_carmilla_ch18 npc_carmilla_ch20
q_<questId>_start / q_<questId>_done for all 13 Part 2 side quests (§9)
```
Also **modify** (in `story.js`): `npc_marta_ch13`, `npc_rook_ch13`, `npc_alberto_ch13`, `npc_elise_ch13`,
`npc_carmilla_ch13` — the first hub visit after s13 now happens *after* `p2_prologue`, so each gets a Part-2-aware
branch: prepend `ifFlag('p2_started','p2')`, keep the old lines, `go('end')`, then `L('p2')` + 1–2 new lines that keep
the old sentiment but react to the crack in the sky (e.g. Marta: “영웅 양반, 방값은 영원히 공짜라니까. …근데 저 하늘의 금은 뭐야? 또 가야 해?”; Rook: “가면은… 이계에서 벗겠습니다요. 그때까진 장사꾼 로크로 불러 주십쇼.”), `L('end')`.

Rules for boss phase scripts: the boss code pushes them exactly like `b_dracula` does for `b_dracula_transform`
(dialogue overlay, `world.cutscene = true` until `onEnd`), only in `world.mode === 'story'` and only the first time
(`seenScripts`). In arcade modes the transition plays without dialogue.

### 1.5 NPC chapter lines (gist; 1–3 lines each, `resolveNpcScript` picks latest ≤ chapter)
- 알베르토: ch14 “거울 속의 자신과 마주했다고? 허허… 이 늙은이는 요즘 거울 보기가 겁나네. 하루가 다르게 늙어 가거든.” / “그래도 괜찮네. 드디어 시간이 내 편이 된 게야.” · ch16 on Lumina and Elise's prayers reaching far · ch18 (cough) Elise rings the bell for him now; offers `ab_dawnflower` via `q_ab_dawnflower_start` · ch19 `{ if:'!dawnflower_given' }` “새벽꽃 이야기는… 늙은이의 욕심일세. 무리하지 말게.” · ch20 postgame: `{ if:'ending_p2true' }` sunny line / `{ if:'!ending_p2true' }` looks at the scar.
- 마르타: ch14 “하늘에 금 간 거 보고 손님 반은 도망갔어! 남은 반은 술을 두 배로 마시고. 장사는 똑같네, 호호.” · ch15 forge-roasted meat joke (quest `mt_feast`) · ch17 “로크 그 양반이 까마귀 왕국 출신이라며? 어쩐지 외상값을 까악까악 떼먹더라.” · ch20 “이제 진짜 끝이지? 그럼 평생 방값 공짜 대신 평생 무용담이야. 약속!”
- 로크/레이븐 (`name:'레이븐'`): ch14 “첫 번째 닻이 내려졌다. …헤헤, 말투는 쉽게 안 바뀌는군요.” · ch16 “루미나의 이름을 들었군. 천 년 전 이야기다. 그녀는… 웃음이 많았지.” · ch17 “지즈를 편히 보내 주어서 고맙다. 그분은 내게 하늘이었다.” · ch19 “여섯 심장이 모였다. 이번엔 나도 간다.” · ch20 `{ if:'ending_p2true' }` unmasked line (`portrait:'portraits/npc_rook2'`) / else “밤에는 종탑에 있다. 낮에는… 장사를 해야죠, 헤헤.”
- 하드윈: ch15 “…할아버지가 거기 계셨나. 망치 자국을 봤다고?” / N “(하드윈은 한참 망치를 내려놓고 있었다.)” / “…불은 꺼뜨리지 않았다. 앞으로도.” · ch17 “이계의 쇠는 성질이 고약하다. 그래도 두들기면 말을 듣지. 사람처럼.” · ch20 short.
- 엘리제: ch14 “하늘의 금에서 누가 우는 소리가 들려요. …저만 들리나요?” · ch16 about Lumina, offers `el_pearl` · ch19 “신부님이 요즘 자꾸 창밖만 보세요. 꽃 피는 계절을 기다리시는 것 같아요.” · ch20 short.
- 카밀라: ch14 `{ if:'carmilla_trust2' }` “공허라… 매일 밤 꿈에서 그곳을 봐.” / `{ if:'!carmilla_trust2' }` “하늘이 깨졌네. 흥, 내 알 바 아니야. …조심해.” · ch18 trust2 offers `cm_dreams` · ch20 trust2 “햇빛도, 별빛도… 이제는 다 내 것 같아.”

### 1.6 Endings (story scripts, story scene with bg per `ENDINGS`)
**`ending_p2` — 파수꾼의 밤** (verbatim lines marked «»):
- `bgm('ending')`, `cg('cg_p2_ending')`.
- N «공허가 물러갔다. 일곱 세계의 닻이 다시 내려졌고, 에슈빌 하늘의 금은 가느다란 흉터가 되어 아물었다.»
- N «그러나 흉터는 사라지지 않았다. 공허는 죽지 않는다. 다시 잠들었을 뿐이다.»
- 레이븐 «누군가는 문을 지켜야 한다. 천 년 동안 그래 왔듯이.» / «걱정 마라. 낮에는 장사를 하고, 밤에는 종탑에 앉아 하늘을 볼 뿐이다. …헤헤, 늘 하던 일입죠.»
- `ifChar('lia', …)`: Lia promises to take night shifts with him.
- H (6 variants, bittersweet).
- N «그해 겨울, 알베르토 신부는 성당 종탑 아래에서 평온히 눈을 감았다. 종탑 위에는 까마귀 한 마리가 밤새 앉아 있었다.»
- `flag('p2_done')`, N «— PART Ⅱ END : 파수꾼의 밤 —», N «[힌트] 여섯 세계에 숨겨진 별의 조각을 모두 모으면, 공허를 빛으로 채울 수 있을지도 모른다.»

**`ending_p2true` — 새벽의 별**:
- `bgm('ending')`, `cg('cg_p2_true')`.
- N «여섯 개의 별의 조각이 하나로 모여, 공허의 한가운데에서 샛별이 되어 떠올랐다.»
- N «빛은 나누어 가질 때 가장 밝다. 천 년 전 성녀의 기도처럼, 공허는 처음으로 고요 대신 노래로 가득 찼다.»
- N «에슈빌 하늘의 흉터가 사라진 아침. 흑묘 여관 테라스에서, 한 사내가 처음으로 가면을 벗었다.»
- `{ who:'npc_rook', name:'레이븐', portrait:'portraits/npc_rook2', text:'천 년 만에 보는 아침 해로군. …생각보다 눈이 부시다.' }`
- `ifChar('lia', …)` Lia line; `{ if:'carmilla_trust2' }` Carmilla line; S(엘리제), S(마르타).
- `{ if:'dawnflower_given' }` N «알베르토 신부는 머리맡의 새벽꽃을 오래도록 바라보았다.» + S(알베르토) «허허… 꽃이 참 곱구먼. 이제 여한이 없네.»
- N «그해 겨울, 알베르토 신부는 새벽꽃 향기 속에서 평온히 눈을 감았다. 그의 얼굴은 웃고 있었다.» (if not `dawnflower_given`, the same line without “새벽꽃 향기 속에서”: use two `if` lines).
- H (6 variants, hopeful final words), `flag('p2_done')`, N «— TRUE FINALE : 새벽의 별 —».

### 1.7 Credits change (`story.js` `CREDITS` / `creditsFor`)
Add `export const CREDITS_P2` (string list, same format as `CREDITS`):
```
'— 제2부 · 이계의 수호자들 —',
'14장 — 만경의 여제 나르키사', '15장 — 용광로의 우상 몰록', '16장 — 가라앉은 성소의 사제왕 다곤',
'17장 — 폭풍을 부르는 거신조 지즈', '18장 — 악몽을 낳는 자 마라', '19장 — 부패한 대지의 짐승 베헤모스',
'20장 — 태초의 공허 니힐', '',
'— 이계의 동료들 —',
'거울 요정 — 미라', '화염 군마 — 이그니스', '등불 해파리 — 루멘', '폭풍 그리핀 — 게일', '꿈먹는 맥 — 모모', '백록 신령 — 실바', '',
'— 경계의 사람들 —',
'경계의 파수꾼 — 레이븐 (로크)', '천 년 전의 성녀 — 루미나', '대장장이 — 하드윈 1세', '',
```
`creditsFor(kind, state, meta)`: `p2Known = kind === 'p2' || kind === 'p2true' || meta?.endingsSeen?.some((k) => k.startsWith('p2'))`.
If `p2Known`, insert `CREDITS_P2` immediately before `'— 제작 —'` (Part 1 bosses are always "known" then). For
`kind === 'p2true'`, replace the last line `'밤은 끝났다. 좋은 아침을.'` with `'새벽의 별은 지지 않는다.'`, and the
second line `'블러드 녹턴: 악마성 연대기'` with `'블러드 녹턴: 악마성 연대기 — 제2부 균열의 순례'` for both p2 kinds.
Part 1 endings never show Part 2 lines unless a p2 ending was seen.

---

## 2. Flow, progression, flags, save migration

### 2.1 Stage chain
`s13 (true end) → p2_prologue → s14 → s15 → … → s19 → s20 → ending_p2 | ending_p2true`.
- `s14` unlocks when `flags.p2_started` (world map adds it to `progress.unlocked` with a reveal animation, §10).
- `s14.next = 's15'` … `s19.next = 's20'` (results screen unlocks as today). `s20.next = null`.
- `s20` also gets a one-time reveal animation the first time it appears unlocked (`flags.s20_revealed`).
- `progress.chapter` keeps its meaning (last cleared chapter) and now reaches 20.

### 2.2 Starting Part 2
1. **Normal path**: `CreditsScene.leave()` for `kind === 'true'` and `fromEnding`: if the state is a real slot
   (`st.slot >= 1 && !st.arcade`), `registry.story` exists, `SCRIPTS.p2_prologue` exists and `!flags.p2_started` →
   after the (optional) initials entry, `g.go('story', { script: 'p2_prologue', then: 'hub', thenParams: { from: 'p2' }, bg: 'cg/cg_rift_sky' })`
   instead of going to the title.
2. **Legacy saves** (cleared s13 before Part 2 existed): `WorldMapScene.enter()` — if `progress.cleared.s13` (or
   `bosses.includes('b_chaos')`) and `!flags.p2_started` and not arcade and `registry.story` → mark
   `seenScripts.push('p2_prologue')` and `g.go('story', { script: 'p2_prologue', then: 'worldmap', thenParams: { page: 1 }, bg: 'cg/cg_rift_sky' })`, return.
3. `p2_prologue` sets `flags.p2_started` (and `rook_revealed`) and gives `k_rift_lantern`. Main quest `main14`
   auto-accepts on the next quest sync.

### 2.3 Ending routing
- `story.js` `endingAfter(stageId, state)`: add at top `if (stageId === 's20') return (state?.progress?.shards?.length ?? 0) >= 6 ? 'ending_p2true' : 'ending_p2';` (s12/s13 logic unchanged).
- `ending.js` `decideEnding(st, from)` (no-`from` branch): check `cleared.s20` first → `shards >= 6 ? 'p2true' : 'p2'`, then existing logic.
- `results.js` `leave()`: `toEnding = ['s12', 's13', 's20'].includes(stage.id) && registry.ending`.
- `ENDINGS` adds
  `p2: { id:'p2', eng:'PART Ⅱ ENDING', name:'파수꾼의 밤', color:'#b8a8ff', bg:'cg/cg_p2_ending', music:'ending', no:'Ⅳ' }` and
  `p2true: { id:'p2true', eng:'TRUE FINALE', name:'새벽의 별', color:'#fff6c8', bg:'cg/cg_p2_true', music:'ending', no:'Ⅴ' }`.
  The story script played is `ending_${kind}` → `ending_p2` / `ending_p2true` (matching §1.6).
- `CreditsScene`: slides for p2 kinds = existing SLIDES + `['bg/s14_mirror','bg/s15_forge','bg/s16_sunken','bg/s17_sky','bg/s18_nightmare','bg/s19_blight','bg/s20_void']` + (`p2true` ? `['cg/cg_p2_true','bg/ending']` : `['cg/cg_p2_ending']`).
  Stats rows: `격파한 보스 n / ${Object.keys(BOSSES).length}`, `비전서 n / ${DOC_ORDER.length}` (import `DOC_ORDER` from lore.js),
  add row `['별의 조각', n + ' / 6']` for p2 kinds. `notes()`: `달성한 엔딩 ${seen} / ${Object.keys(ENDINGS).length}` with all 5 names
  (unknown → '???'); hint for `p2`: '힌트: 여섯 세계에 숨겨진 별의 조각을 모두 모으면 공허를 빛으로 채울 수 있다'.
  `leave()` for p2 kinds → `goSafe(g, 'hub', { from: 'ending' })` (postgame continues; never the title).
- `EndingScene` already writes `flags['ending_' + kind]` → `ending_p2` / `ending_p2true` flags are used by NPC ch20 lines.

### 2.4 New story command `recruit`
Both `scenes/dialogue.js` `runCmd` and `scenes/front/story.js` `runCmd` add:
```js
case 'recruit': if (st) { st.progress.flags['recruit_' + l.id] = true; this.game.companions?.recruit?.(l.id); } break;
```
(`st` is the state variable in each runner.) `game.companions` is bound by the companion package; if absent, only the
flag is set. The companion package must treat `flags.recruit_<id>` as the source of truth (grant on load if missing).
`skipAll()` in both runners must execute `recruit` like other commands (it already runs non-sfx commands).

### 2.5 Flags (new)
`p2_started`, `rook_revealed`, `hearts_all` (6 hearts), `stars_all` (6 shards), `p2_star` (set in s20_t2 on star route),
`p2_done`, `s14_revealed`, `s20_revealed`, `dawnflower_given` (set when `ab_dawnflower` is claimed — quest reward
`flags` field, §9), `recruit_gd_mirra`, `recruit_mt_ignis`, `recruit_gd_lumen`, `recruit_mt_gale`, `recruit_gd_momo`,
`recruit_mt_silva`; `ending_p2`, `ending_p2true` (written by EndingScene).

### 2.6 Progress fields and save migration (`game/state.js`)
- `SAVE_VERSION = 2`.
- `newGameState`: `progress.shards = []` (k_star ids), `progress.hearts = []` (k_heart ids).
- `migrateState(s)`: add `'shards', 'hearts'` to the array-field list; after all fixes set `s.version = SAVE_VERSION`.
  Drop from `progress.hearts`/`progress.shards` any id that is not a string. Keep unknown stage ids in `unlocked`
  (harmless). No other change; `isValidSave` unchanged.
- Hearts and shards are recorded by `world.collect()` (§3.9) — the inventory copy is cosmetic.
- Arcade temp states (`buildArcadeState`) get the new arrays via `newGameState`.

---

## 3. Gimmick engine

New module **`src/game/gimmicks.js`** (owner WP-A). It must not import `world.js`, `player.js` or any scene (it receives
the world instance). Allowed imports: `core/*`, `game/entity.js`, `game/combat.js`, `game/projectiles.js` (for Hitbox if
needed), `data/*`.

### 3.1 Configuration
- `stage.gimmick`: default for every room of the stage (object, array of objects, or undefined).
- `room.gimmick`: overrides the stage default. `undefined` → use stage default; `null` → no gimmick; object/array → use it.
- `room.liquid`: overrides `stage.liquid` for that room (new; needed by s20 r4).
- Each gimmick object: `{ kind, ...params }`. Unknown kinds are ignored with `console.warn` once.

### 3.2 Public API
```js
export function createGimmick(world, room) // → GimmickSet | null
export const GIMMICK_KINDS = ['mirror','magma','deep','wind','heartbeat','blight','voidwall'];
export class MirrorSwitch extends Entity {}   // 'Q'
export class SporePod extends Entity {}       // 'y'

class GimmickSet {            // world.gimmick
  kinds: string[]; get(kind): Gimmick|null;
  update(dt);                 // world time step (not called during hitstop; skipped progress while world.cutscene)
  prePhysics(p, dt); postPhysics(p, dt);   // called by Player.physics()
  onJumpInput(p): boolean;    // true = jump consumed (swim stroke)
  healMul(): number;          // product of members (blight 0.5)
  get noRegen(): boolean;     // any member (blight status)
  get speedMul(): number;     // product (deep 0.72, blight 0.9)
  get bgFlip(): boolean;      // mirror phase B
  lights(L); drawWorld(ctx, cam, layer /*'back'|'front'*/); drawScreen(ctx, vw, vh);
  onFell(p); onRespawn(); cleanse(n); dispose();
}
```
`World` gets `gimmickOf(kind) { return this.gimmick?.get(kind) ?? null; }` — bosses/enemies/techs use this and must
null-check (a room without that gimmick returns null).

Per-kind extra API (on the member returned by `get(kind)`):
| kind | members |
|---|---|
| mirror | `phase` ('A'/'B'), `flip(force = false) → bool`, `setAuto(sec)` |
| magma | `level` (surface y px), `setLevel(row, speed = 120)`, `setMode(mode)` |
| deep | `air` (0–100), `setWaterRow(row, tx0, tx1, time = 3)` |
| wind | `gusting`, `dir`, `gust(dir, force, dur, warn = 0.8)`, `setAuto(bool)` |
| heartbeat | `beatIndex`, `setBeat(sec)` |
| blight | `meter`, `status` (bool), `addCloud(x, y, w, h, life)`, `spawnPod(tx, ty)`, `cleanse(n)` |
| voidwall | `wallX`, `closeIn(x0px, x1px, speed = 80)`, `open(speed = 120)`, `reset()` |

### 3.3 Hooks in shared files (exact, minimal; owner WP-A)
**`src/game/world.js`**
1. `import { createGimmick } from './gimmicks.js';`
2. Getter `get liquid() { return this.room?.liquid ?? this.stage.liquid ?? 'water'; }` and method `gimmickOf(kind)`.
3. `loadRoom()`: first line after `if (!room) …`: `this.gimmick?.dispose?.(); this.gimmick = null;`. After the "장식 광원"
   loop and before `this.camera.follow(...)`: `this.gimmick = createGimmick(this, room);`.
   In the `'D'` case keep the constructor and set `door.mark = room.doorMarks?.[n] ?? null` before `add`.
4. `update()`: right after `this.fx.update(sdt, this.map);` → `this.gimmick?.update(sdt);`. In the lighting block after
   the entity `lights` loop → `this.gimmick?.lights?.(this.lighting);`.
5. `render()`: far background: `if (this.gimmick?.bgFlip) { ctx.save(); ctx.translate(vw, 0); ctx.scale(-1, 1); this.bg.drawFar(ctx, cam, vw, vh, this.time); ctx.restore(); } else this.bg.drawFar(...)`.
   After `this.tiles.draw(ctx, cam);` → `this.gimmick?.drawWorld(ctx, cam, 'back');`.
   Replace `this.stage.liquid` in `drawLiquid` with `this.liquid`, then right after it → `this.gimmick?.drawWorld(ctx, cam, 'front');`.
   After `this.bg.drawFront(...)` → `this.gimmick?.drawScreen(ctx, vw, vh);`.
6. `collect()` — `'item'` case, after the relic block, add world-heart and star-shard handling (§3.9). `'food'` case: add `this.gimmick?.cleanse?.(30);`.
7. `onPlayerFell(p)`: after repositioning → `this.gimmick?.onFell?.(p);`. `respawn()`: at the end → `this.gimmick?.onRespawn?.();`.

**`src/game/player.js`** (only these lines; coordinate with the feel/companion specs — place them in whatever the
current `physics()` / `handleJump()` / `heal()` / `tickTimers()` are):
1. `physics(dt, world)`: first statement → `world.gimmick?.prePhysics?.(this, dt);`. After the liquid block and before
   the safe-spot block → `world.gimmick?.postPhysics?.(this, dt);`.
2. Liquid block: `const liq = world.liquid ?? world.stage.liquid ?? 'water';` and `if (liq === 'deep') { /* 수영은 gimmicks.js 가 처리 */ } else if (liq === 'lava' || …) {…} else {…}` (the water slow-down must not apply to `'deep'`).
3. `handleJump(dt, world, …)`: first statement → `if (world.gimmick?.onJumpInput?.(this)) return;`.
4. `heal(amount, …)`: for positive amounts multiply by `(this.world?.gimmick?.healMul?.() ?? 1)` (not for save/statue full restores that assign hp directly).
5. `tickTimers()`: HP regen condition adds `&& !world.gimmick?.noRegen`.
6. Max run speed multiplies by `(world.gimmick?.speedMul ?? 1)`.

**`src/game/tilemap.js`**: new phase tiles (below). **`src/game/props.js`**: `Door.draw` renders `this.mark === 'blood'`
(a dark-red handprint on the door face + 3 animated drips + faint red glow `rgba(255,40,60,0.25)`); `Statue` heal also
calls `world.gimmick?.cleanse?.(100)`. **`src/render/tiles.js`**: `drawLiquid` palette `deep: ['rgba(8,38,66,0.74)', '#6fe8ff']`,
new `TILE_STYLES`, new `DECOR_SETS`, `OPEN_SKY_THEMES` add `'sky','void','blight'`. **`src/render/background.js`**: new
`THEMES` and weathers (§4.1).

### 3.4 New map characters
| char | meaning | kind |
|---|---|---|
| `a` | block solid in phase **A** (실상), empty in B | mirror |
| `b` | block solid in phase **B** (허상), empty in A | mirror |
| `Q` | mirror switch (MirrorSwitch prop, 1×2 tiles, bottom at the marker tile's bottom) | mirror |
| `z` | block solid on even beats (beatIndex % 2 === 0), empty on odd | heartbeat |
| `Z` | block solid on odd beats | heartbeat |
| `u` | air-bubble column origin (bubbles rise from this cell to the first non-liquid cell above, max 5 tiles) | deep |
| `U` | updraft cell (fill every empty cell of an updraft column with `U`) | wind |
| `y` | spore pod (SporePod prop; hangs if solid above and empty below, else sits on the floor) | blight |

`tilemap.js`: `const PHASE = { a: 'A', b: 'B', z: 'even', Z: 'odd' };` — for these chars set the tile to `T.SOLID`
(`a`, `z`) or `T.EMPTY` (`b`, `Z`) and push `{ idx, tx, ty, key }` into `this.phaseTiles` (new array); they are not
markers. `Q`, `u`, `U`, `y` stay generic markers (the default branch already records them); `U` cells are *not* solid.
The gimmick owns every later change to these tiles via `map.set(tx, ty, T.SOLID|T.EMPTY)` + `world.tiles.invalidate(tx, ty)`.
Phase tiles use the stage main texture when solid.

### 3.5 Kind rules (all numbers are defaults; params override)

**mirror** — `{ kind:'mirror', start:'A', cooldown:0.8, auto:0 }`
- `MirrorSwitch` (kind `'prop'`, z 2, 48×96): hittable (`takeHit` → `flip()`); also `up` pressed while overlapping
  horizontally (|dx| < 40) and vertically (feet within 30 px of its bottom) → `flip()`. Draw: tall silver-framed mirror
  (`props/prop_mirror_switch` if loaded, else procedural), current phase shown by tint (A: warm silver `#e8e0d0`,
  B: cold cyan `#9fe8ff`), crack lines, a slow shimmer. Light: r 90, `#dff4ff`, i 0.5.
- `flip(force)`: if `cooldown > 0 && !force` → false. Tiles that would become solid: if any overlaps the player AABB
  (inflated 2 px) and `!force` → refuse (`audio.sfx('clang', { pitch: 1.4 })`, switch shake 0.25 s) → false.
  Else swap tiles, invalidate them; enemies overlapping a new solid are moved up 1–3 tiles to the first free spot, else
  removed silently (`e.dead = true`, no loot, no kill credit); pickups likewise moved up (else left in place).
  Player `iframes = max(iframes, 0.3)`. FX: `game.flash('#dff4ff', 0.35, 4)`, `sfx('mist', { pitch: 1.6 })`,
  `fx.burst('shard', …, 18, { color: '#dff4ff' })`. `cooldown = params.cooldown`.
- Ghost rendering (`'back'` layer): every *inactive* phase tile → fill `rgba(200,230,255,0.07)`, dashed stroke
  `rgba(200,230,255,0.35)` [6,6] 1.5 px; every *active* phase tile → 2 px inner rim `#dfe8f0` α 0.5.
- Phase B: `bgFlip = true`; `drawScreen` overlay `rgba(150,200,255,0.06)` + cyan edge vignette α 0.12.
- Reset to `start` on room load and `onRespawn`. `auto > 0`: flip every `auto` s with 1.0 s warning (ghost tiles blink).

**magma** — `{ kind:'magma', mode:'tide'|'rise'|'manual', … }`
- State `level` (px, surface y). Draw (`'front'`): lava body from `level` to map bottom (cached vertical gradient
  `#ffb040`→`#ff5a1a`→`#7a1004`), sine surface (amp 4 px, 2 wavelengths per 3 tiles), bright rim `#ffd070`, bubble
  particles (`ember`) at `quality`-scaled rate; lights every 192 px along the visible surface (r 150, `#ff6a1a`, i 0.5).
- Contact: `p.bottom > level + 6` and not invulnerable → `p.takeHit(ceil(maxHP×0.10), { team:'enemy', dir:-facing, kb:[0,-760], flat:1, element:'fire' }, world, {})`.
  Fully submerged (`p.y > level + 12`) → `world.onPlayerFell(p)`.
- `tide`: `{ low, high, period:9, hold:2.5, warn:1.5 }` (rows). Cycle: rest at `low` → warn (band at `high` pulses
  `rgba(255,120,40,0.35)`, bubbles, `sfx('fire', { pitch: 0.6 })` once) → rise over 1.2 s (easeInOut) → hold → fall over 1.5 s → rest (remaining time). Rest time = `period − warn − 1.2 − hold − 1.5` (≥ 0.5).
- `rise`: `{ y0, y1, speed:40, trigger }` — starts at row `y0`; begins rising at `speed` px/s when the player's feet row
  `< trigger` (default `y0 − 6`); stops at row `y1`. `onFell`: `level = max(y0px, min(level, p.bottom + 5*48))` wait —
  precisely: after the player is placed at the safe spot, set `level = max(level_start_px, (p.y + p.h) + 5*TILE)` so lava
  is at least 5 tiles below the feet; `onRespawn`: `level = y0px`, rising restarts on trigger.
- `manual`: `{ level }` start row; `setLevel(row, speed)` animates toward the target at `speed` px/s.
- Enemies ignore magma (maps never place enemies below `high`/`y0`).

**deep** — `{ kind:'deep', air:100, drain:8, refill:50, bubble:60, choke:0.06, stroke:340 }` (liquid must be `'deep'`)
- In water = player overlaps a `T.LIQUID` tile (same test as the existing liquid block). Head underwater = tile at
  `(cx, y + 10)` is LIQUID.
- `prePhysics` in water: `p.gravity = 0.24`, `p.maxFall = 150`, `speedMul` 0.72, `airJumpsLeft` refilled to max;
  holding `down` adds `+600 px/s²` downward. Out of water: `p.maxFall = undefined`.
- `onJumpInput(p)` (in water only): if the water surface is within 40 px above the head → leap out: `p.vy = -jumpVel*0.95`
  (use `p.jumpVel()`), splash; else **stroke**: `p.vy = -stroke`, 0.16 s cooldown, `sfx('splash', { vol: 0.25, pitch: 1.6 })`,
  3 bubbles. Consume the jump (`input.consume('jump')`) and return true. Dash works normally.
- Air: drains `drain`/s while the head is underwater, refills `refill`/s otherwise, `+bubble`/s inside a bubble column.
  At 0: every 1.0 s lose `ceil(maxHP×choke)` HP directly (no knockback, no iframes; red flash; death if ≤ 0 via `p.die(world)`).
  `sfx('warning', { vol: 0.3 })` once when crossing 25.
- Bubble columns (`u`): 1 tile wide; render rising bubbles (cached sprite); refill while overlapping.
- `drawScreen`: when head underwater → `rgba(10,50,90,0.18)` tint; air meter when underwater or `air < 100`:
  label `산소`, bar 200×12 at top centre, colour `#6fe8ff`, `< 30` → `#ff4a5a`, `< 20` blink.
- `setWaterRow(row, tx0, tx1, time)`: over `time` s, fill empty cells (not SOLID/ONEWAY) with `T.LIQUID` from the
  current surface up to `row` inside `[tx0, tx1]`, or clear LIQUID cells above `row` when lowering (only cells this
  gimmick added). Changes at most one row per 0.25 s; invalidate changed tiles.
- Reset air to 100 on room load / respawn.

**wind** — `{ kind:'wind', dir:1|-1|'alt', force:900, on:2.5, off:3.5, warn:1.0, maxPush:320, updraft:420, auto:true }`
- Cycle off → warn → on → off; `'alt'` flips direction every cycle. `gust(dir, force, dur, warn)` runs a single gust (used with `auto:false`).
- While on and the player is not dashing: `p.vx += dir × force × (onGround ? 0.5 : 1) × dt`, clamped so the wind never
  pushes beyond `maxSp + maxPush` in its direction.
- Updraft: if the player overlaps any `U` cell: `p.vy = approach(p.vy, -updraft, 2600*dt)`.
- Visuals: horizontal streak particles while warning/on (count × quality), vertical streaks in `U` columns (cached
  gradient column α 0.12). `drawScreen` during warn/on: an arrow row `≫` / `≪` at top centre with text `돌풍!` and a
  countdown ring during warn. SFX: warn start `mist` pitch 0.6; gust start `whip` pitch 0.4.
- Enemies are not pushed by the engine (AIs may read `gimmickOf('wind')`).

**heartbeat** — `{ kind:'heartbeat', beat:3.2, warn:0.8, light:260 }`
- `beatIndex` increments every `beat` s; at each beat `z`/`Z` swap solidity. Deferral: a tile that should become solid
  but overlaps the player or any enemy stays EMPTY in a `pending` list and solidifies as soon as nothing overlaps it
  (never crush).
- Warning (`warn` s before a beat): to-be-solid tiles pulse `rgba(255,40,60,0.25)`; to-be-empty tiles show dark veins.
  SFX at the beat: `hit_heavy` (pitch 0.45, vol 0.35) then 0.18 s later `hit` (pitch 0.5, vol 0.25) — "lub-dub".
- Active heartbeat tiles get a fleshy overlay (dark red veins, cached pattern). `drawScreen`: vignette pulse
  `rgba(120,0,20,0.15)` → 0 over 0.4 s at each beat. `lights`: extra light at the player (r `light`, `#b080ff`, i 0.45).

**blight** — `{ kind:'blight', gain:30, decay:12, on:100, off:40, dot:0.015, spores:[[tx,ty,tw,th],…], podRespawn:12 }`
- `meter` 0–100: `+gain/s` while the player overlaps a spore cloud, else `−decay/s`. `status` turns on at `on`, off at `off`.
- Status effects: lose `dot × maxHP` per second (cannot reduce HP below 1), `healMul() = 0.5`, `noRegen = true`,
  `speedMul = 0.9`, screen tint `rgba(90,140,20,0.12)` + green vignette.
- Clouds: static `spores` rects (tiles) + dynamic `addCloud(x,y,w,h,life)` (px). Render as soft blobs from a cached
  sprite with slow drift; dynamic clouds fade out in the last 1 s.
- `SporePod` (40×40, kind `'prop'`): idle breathing → when the player is within 80 px or it is hit → swell 0.45 s →
  burst: cloud 160×120 centred, 5 s; hidden for `podRespawn` s then regrows. A fire-element hit (or `tech_purge`)
  burns it: no cloud, `ember` burst. Not an enemy (no exp).
- `cleanse(n)`: `meter = max(0, meter − n)` (Statue 100, food 30, `tech_purge` 50).
- HUD: label `부패`, bar 200×12 top centre, `#9ad040`; status on → `#8a3aa8` and blinking `부패!`.

**voidwall** — `{ kind:'voidwall', mode:'chase'|'arena', speed:115, delay:2.5, startTx:-3, stopTx:null, dmg:0.15 }`
- `chase`: `wallX` starts at `startTx*48`, waits `delay` s after room load/respawn, then moves right at `speed` px/s
  (×1.6 while `wallX < p.x − 900`), stopping at `stopTx*48` if set.
- Contact: `p.x < wallX` and not invulnerable → `takeHit(ceil(maxHP×dmg), { team:'enemy', dir:1, kb:[520,-380], flat:1, element:'dark' })` and `p.vx = max(p.vx, 520)`.
  Swallowed (`p.x + p.w < wallX − 48`) → `world.onPlayerFell(p)`; then `wallX = max(start, p.x − 400)`.
  Enemies entirely left of `wallX` are removed silently.
- Draw (`'front'`): black starfield from the camera's left edge to `wallX`; jagged prismatic edge (three strokes offset
  ±2 px in `#ff3a6a`, `#3aff9a`, `#6a8aff` α 0.5 over a white core line); `dark`/`magic` particles sucked into it.
  `drawScreen`: left-edge darkening when `p.x − wallX < 300`.
- `arena`: two walls (`x0`,`x1`) initially at the boss arena bounds (inactive); `closeIn(x0, x1, speed)` moves them
  inward; `open()` back; contact from either side pushes inward.

**composite** (array config): all hooks call every member; `healMul`/`speedMul` multiply; `noRegen`, `bgFlip` OR;
`onJumpInput` — first `true` wins; HUD meters stack downward (14, 34, 54…).

### 3.6 Lighting, layers, performance
`drawWorld('back')` = ghost/phase overlays, updraft columns, spore clouds behind entities; `drawWorld('front')` =
magma, void wall, bubble columns, front spore haze. All screen overlays go through `drawScreen`. Cached: magma
gradient per room height, spore/bubble sprites, vein pattern. Particle emission multiplied by `world.fx.quality`.

### 3.7 Map validator (`tools/validate_maps.mjs`, owner WP-A)
Additions (keep existing checks):
1. `kinds(stage, room)` resolves the effective gimmick list (§3.1). Validate each kind name and required params
   (`magma.tide` needs `low/high`; `rise` needs `y0/y1`; `blight.spores` rects inside the map).
2. Char rules: `a b Q` only with mirror; `z Z` only with heartbeat; `u` only if the room's liquid is `'deep'`; `U` only
   with wind; `y` only with blight → error otherwise. Mirror rooms need ≥1 `Q` unless `auto > 0`.
3. Reachability BFS extensions:
   - **mirror**: state = (x, y, phase). Solid set per phase = base ∪ {`a` if A} ∪ {`b` if B}. Flip edge from any state
     with |x − qx| ≤ 2 and −3 ≤ y − qy ≤ 1 for some `Q` at (qx, qy), allowed if the 2-cell body is free in the other phase.
     Start phase = `start`. `P` and every `S` must be standable in the start phase (error).
   - **heartbeat**: `z`/`Z` count as passable for "free" and as solid for "standable" (optimistic union); warn if `P`,
     `S`, `D`, `X` sit on or inside a `z`/`Z` cell.
   - **deep**: cells that are `~` in a `'deep'` room are swimmable: from a swimmable cell (or a free cell directly above
     one) all 4 neighbours that are free are reachable.
   - **wind**: from a `U` cell the free cell above is reachable (and entering a `U` cell from the side is allowed).
   - magma, voidwall, blight: ignored by BFS.
4. Part 2 stage checks (`stage.part === 2`): every `'@'` item id must exist (`ITEMS`, `LORE` for `lore:`, `DOCS` for `doc:`);
   s14–s19 contain exactly one `k_star_*` item and it equals `stage.shard`; the number of `H` walls across rooms ≥
   `stage.docs.length`; every `room.triggers` id and `stage.intro/outro` exists in `SCRIPTS`; `room.doorMarks.length`
   equals the number of `D` markers when present.
5. Imports added: `ITEMS` (data/items.js), `LORE`, `DOCS` (data/lore.js), `SCRIPTS` (data/story.js) — all pure data,
   Node-safe.

### 3.8 Door marks
`room.doorMarks: ['blood' | null, …]` in door order (row-major, i.e. left→right on one row).

### 3.9 World hearts and star shards in `world.collect()`
After the relic block in the `'item'` case:
```js
if (base?.starShard && !st.progress.shards.includes(it.baseId)) {
  st.progress.shards.push(it.baseId); const n = st.progress.shards.length;
  audio.sfx('secret'); this.game.flash('#fff2b0', 0.6, 2);
  this.banner = { text: '별의 조각', sub: `${base.name} (${n}/6)`, t: 3.5, color: '#fff2b0', big: true };
  if (n >= 6) st.progress.flags.stars_all = true;
  bus.emit('shardFound', { id: it.baseId });
}
if (base?.worldHeart && !st.progress.hearts.includes(it.baseId)) {
  st.progress.hearts.push(it.baseId); const n = st.progress.hearts.length;
  audio.sfx('powerup');
  this.banner = { text: '세계의 심장', sub: `${base.name} (${n}/6)`, t: 3.5, color: base.color ?? '#ff8a9a', big: true };
  if (n >= 6) st.progress.flags.hearts_all = true;
  bus.emit('heartFound', { id: it.baseId });
}
```
(`st.progress.shards/hearts` may be missing on unmigrated runtime states → `??= []` first.)

---

## 4. Stages and rooms

### 4.1 Themes, tile styles, decor (render data; owner WP-A, values fixed here)
`background.js THEMES` (existing `mid` kinds reused; new weathers `spores`, `stars`):
```js
mirror:    { sky: ['#0a0e18', '#1a2232', '#04060c'], fog: '#bfe8ff', mid: 'windows', weather: 'dust',    moon: '#e8f4ff' },
forge:     { sky: ['#1a0602', '#3a1204', '#0a0200'], fog: '#ff7a2a', mid: 'pipes',   weather: 'embers',  moon: null },
sunken:    { sky: ['#01101a', '#06283a', '#00060c'], fog: '#3ad0c8', mid: 'arches',  weather: 'bubbles', moon: null },
sky:       { sky: ['#1a2a44', '#4a6a8a', '#0a1422'], fog: '#dfe8ff', mid: 'towers',  weather: 'rain',    moon: '#fff4d0' },
nightmare: { sky: ['#0c0210', '#24062a', '#040008'], fog: '#c060ff', mid: 'pillars', weather: 'ash',     moon: '#f0e0ff' },
blight:    { sky: ['#0c1004', '#1e2a08', '#040602'], fog: '#b8e04a', mid: 'trees',   weather: 'spores',  moon: null },
void:      { sky: ['#000000', '#08040e', '#000000'], fog: '#ffffff', mid: 'rocks',   weather: 'stars',   moon: null },
```
Weather `spores`: slow falling yellow-green motes (like `dust` but `#c8ff6a`, drifting down, 60% density of `dust`).
Weather `stars`: static twinkling points (screen-space, parallax 0.1) + one falling streak every 3–6 s.

`tiles.js TILE_STYLES`:
```js
mirror: { base: '#2a3040', edge: '#0a0c14', top: '#dfe8f0', topDeco: 'glow' },
forge:  { base: '#2a1a14', edge: '#0a0402', top: '#ff7a2a', topDeco: 'rivets' },
coral:  { base: '#1a3a3e', edge: '#061416', top: '#7ad8c8', topDeco: 'wet' },
sky:    { base: '#6a7080', edge: '#2a2e38', top: '#f4ecd8', topDeco: 'gold' },
flesh:  { base: '#3a1420', edge: '#12040a', top: '#b04a5a', topDeco: 'slime' },
rot:    { base: '#2a2414', edge: '#0a0804', top: '#8ab040', topDeco: 'moss' },
void:   { base: '#0a0810', edge: '#000000', top: '#e8e0ff', topDeco: 'glow' },
```
`DECOR_SETS` (prop ids rendered by WP-H2; missing images are skipped by the renderer):
```js
mirror:    [D('deco_mirror_frame', 96, 176, 'floor', 2), D('deco_mirror_shards', 144, 64, 'floor', 2), D('deco_mirror_chandelier', 144, 120, 'ceil', 2)],
forge:     [D('deco_forge_anvil', 120, 96, 'floor', 2), D('deco_forge_crucible', 144, 160), D('deco_forge_chains', 64, 240, 'ceil', 3)],
sunken:    [D('deco_sunk_coral', 120, 120, 'floor', 3), D('deco_sunk_bell', 144, 120), D('deco_sunk_statue', 96, 200, 'floor', 2)],
sky:       [D('deco_sky_column', 96, 240, 'floor', 2), D('deco_sky_statue', 120, 200), D('deco_sky_urn', 72, 96, 'floor', 2)],
nightmare: [D('deco_dream_cradle', 160, 120, 'floor', 2), D('deco_dream_doll', 72, 80, 'floor', 3), D('deco_dream_clock', 96, 220)],
blight:    [D('deco_blight_shroom', 144, 160, 'floor', 3), D('deco_blight_stump', 144, 110, 'floor', 2), D('deco_blight_totem', 96, 200)],
void:      [D('deco_void_prism', 96, 160, 'floor', 2), D('deco_void_monolith', 96, 240), D('deco_void_fragment', 144, 120, 'floor', 2)],
```
Add `'Q','y','u','U'` to `DECOR_BLOCK` so decor never covers them.

### 4.2 Stage data (`src/data/stages.js`, owner WP-B; import `ROOMS as S14…S20` from `./maps/s14.js…s20.js`)
```js
s14: S({ id: 's14', chapter: 14, part: 2, page: 1, name: '거울의 성', sub: '만경궁 — 비친 것이 먼저 움직이는 곳', theme: 'mirror', bg: 'bg/s14_mirror', tex: 'tex/tex_mirror', tex2: 'tex/tex_marble', tileStyle: 'mirror',
  music: 's14', level: 46, darkness: 0.35, darkColor: '#04060c', liquid: 'water', boss: 'b_narkissa', rooms: S14, parTime: 480,
  enemies: ['mirror_knight', 'glass_wraith', 'reflection', 'chandelier_fiend', 'phantom_sword', 'mimic'], docs: ['d21'], shard: 'k_star_1', heart: 'k_heart_1',
  gimmick: { kind: 'mirror', start: 'A', cooldown: 0.8 }, color: '#cfe8ff', next: 's15', mapPos: { x: 0.16, y: 0.74 }, req: '진정한 새벽 뒤, 에슈빌 하늘에 균열이 열리면 갈 수 있다' }),
s15: S({ id: 's15', chapter: 15, part: 2, page: 1, name: '영겁의 용광로', sub: '쇳물이 차오르는 무쇠 지옥', theme: 'forge', bg: 'bg/s15_forge', tex: 'tex/tex_forge', tex2: 'tex/tex_brass', tileStyle: 'forge',
  music: 's15', level: 50, darkness: 0.3, darkColor: '#0c0402', liquid: 'lava', boss: 'b_moloch', rooms: S15, parTime: 510,
  enemies: ['forge_imp', 'slag_golem', 'chain_warden', 'bellows', 'hellhound', 'gear_golem', 'mimic'], docs: ['d22'], shard: 'k_star_2', heart: 'k_heart_2',
  gimmick: { kind: 'magma', mode: 'tide', low: 14, high: 12, period: 9, hold: 2.5, warn: 1.5 }, color: '#ff7a2a', next: 's16', mapPos: { x: 0.1, y: 0.4 } }),
s16: S({ id: 's16', chapter: 16, part: 2, page: 1, name: '가라앉은 성소', sub: '빛이 닿지 않는 심해 대성당', theme: 'sunken', bg: 'bg/s16_sunken', tex: 'tex/tex_coral', tex2: 'tex/tex_wet_stone', tileStyle: 'coral',
  music: 's16', level: 53, darkness: 0.55, darkColor: '#010812', liquid: 'deep', boss: 'b_dagon', rooms: S16, parTime: 540,
  enemies: ['abyss_angler', 'sunken_priest', 'coral_crab', 'siren', 'merman', 'killer_fish', 'mimic'], docs: ['d23'], shard: 'k_star_3', heart: 'k_heart_3',
  gimmick: { kind: 'deep' }, color: '#3ad0c8', next: 's17', mapPos: { x: 0.28, y: 0.12 } }),
s17: S({ id: 's17', chapter: 17, part: 2, page: 1, name: '폭풍의 공중정원', sub: '구름 위에 떠 있는 잊힌 왕국', theme: 'sky', bg: 'bg/s17_sky', tex: 'tex/tex_sky_marble', tex2: 'tex/tex_marble', tileStyle: 'sky',
  music: 's17', level: 56, darkness: 0.15, darkColor: '#081020', liquid: 'water', boss: 'b_ziz', rooms: S17, parTime: 540,
  enemies: ['storm_harpy', 'gale_knight', 'thunder_roc', 'cloud_jelly', 'harpy', 'gargoyle', 'mimic'], docs: ['d24'], shard: 'k_star_4', heart: 'k_heart_4',
  gimmick: { kind: 'wind', dir: 1, force: 850, on: 2.4, off: 3.8 }, color: '#9fc8ff', next: 's18', mapPos: { x: 0.58, y: 0.06 } }),
s18: S({ id: 's18', chapter: 18, part: 2, page: 1, name: '악몽의 미궁', sub: '심장 소리에 맞춰 뒤바뀌는 꿈', theme: 'nightmare', bg: 'bg/s18_nightmare', tex: 'tex/tex_nightmare', tex2: 'tex/tex_blood_marble', tileStyle: 'flesh',
  music: 's18', level: 60, darkness: 0.7, darkColor: '#08020a', liquid: 'blood', boss: 'b_mara', rooms: S18, parTime: 570,
  enemies: ['puppeteer', 'faceless', 'dream_eater', 'puppet_maiden', 'cursed_nun', 'shadow_hunter', 'mimic'], docs: ['d25'], shard: 'k_star_5', heart: 'k_heart_5',
  gimmick: { kind: 'heartbeat', beat: 3.2, warn: 0.8 }, color: '#c060ff', next: 's19', mapPos: { x: 0.86, y: 0.2 } }),
s19: S({ id: 's19', chapter: 19, part: 2, page: 1, name: '썩어가는 숲', sub: '포자가 눈처럼 내리는 세계수의 뿌리', theme: 'blight', bg: 'bg/s19_blight', tex: 'tex/tex_rotwood', tex2: 'tex/tex_mossy_stone', tileStyle: 'rot',
  music: 's19', level: 64, darkness: 0.45, darkColor: '#060a02', liquid: 'poison', boss: 'b_behemoth', rooms: S19, parTime: 570,
  enemies: ['rot_treant', 'plague_moth', 'fungal_husk', 'frog_demon', 'corpse_worm', 'slime', 'mimic'], docs: ['d26'], shard: 'k_star_6', heart: 'k_heart_6',
  gimmick: { kind: 'blight' }, color: '#9ad040', next: 's20', mapPos: { x: 0.88, y: 0.62 } }),
s20: S({ id: 's20', chapter: 20, part: 2, page: 1, name: '태초의 공허', sub: '모든 것이 태어나기 전의 어둠', theme: 'void', bg: 'bg/s20_void', tex: 'tex/tex_void', tex2: 'tex/tex_abyss', tileStyle: 'void',
  music: 's20', level: 68, darkness: 0.5, darkColor: '#000000', liquid: 'lava', boss: 'b_nihil', rooms: S20, parTime: 600,
  enemies: ['void_herald', 'nihil_spawn', 'mirror_knight', 'slag_golem', 'abyss_angler', 'storm_harpy', 'faceless', 'rot_treant', 'fungal_husk'], docs: ['d27'], shard: null, heart: null,
  color: '#ffffff', next: null, mapPos: { x: 0.52, y: 0.46 }, req: '여섯 세계의 심장을 모두 되찾으면 공허로 가는 길이 열린다' }),
```
Exports: `STAGE_ORDER_P1 = ['s01' … 's13']`, `STAGE_ORDER_P2 = ['s14' … 's20']`, `STAGE_ORDER = [...P1, ...P2]`,
`SHARDS = ['k_star_1' … 'k_star_6']`, `HEARTS = ['k_heart_1' … 'k_heart_6']` (keep `RELICS`). Part 1 stages get no new
fields (`page` defaults to 0 in the world map).

### 4.3 Room specifications
General rules for every Part 2 room (WP-B): room height ≥ 15 for horizontal rooms; the player's standing cell and the
exit must pass the validator; enemy density ~45–60 per stage; every room has candles `C` (hearts/MP economy) and at
least one `T` in rooms 2–5; `B` meat walls: 2–3 per stage; darkness via stage value unless noted; `platRange/platSpeed`
set whenever `M`/`V` exist. `'@'` items are listed in **row-major order** (the order `TileMap` numbers them). Enemy digit
maps are per stage (below); rooms may use subsets. Chest `$` contents are listed per room in `chests`.

#### s14 거울의 성 — digits `1 mirror_knight, 2 glass_wraith, 3 reflection, 4 chandelier_fiend, 5 phantom_sword, 7 mimic`
Chandeliers (`4`) are placed in the empty cell directly below a ceiling tile; their AI snaps to the ceiling.
| room | name | size | layout / beats | markers & params |
|---|---|---|---|---|
| r1 | 거울의 현관 | 110×15 | cols 0–12 start plaza (`P` (2,11)). Tutorial: cols 22–23 rows 7–12 = `a` wall; `Q` at col 18; cols 26–37 row 12 = `b` bridge over `^` spikes at row 13 (so one flip opens the wall *and* builds the bridge). Cols 38–70 combat hall with `b` ledge row 8 cols 44–50 to a `$`. Cols 74–75 rows 7–12 = `b` wall (B blocks) with `Q` at col 70 to flip back. Cols 76–110 phantom swords, `B` at (90,12). | `triggers: ['s14_t1']` (`!` col 8); enemies 1×2, 2×2, 4×2, 5×2, 3×1; `chests: ['m_stone_6']`; `exitRight: 'r2'` |
| r2 | 뒤집힌 무도회장 | 36×52 (ascent) | `P` bottom-left (2,49), floor rows 50–51. Zig-zag climb built from alternating `a`/`b` ledges; 3 `Q` on side walls at rows 44, 30, 16; `=` rest ledges; exit opening in the right wall rows 2–4. | enemies 2×3, 4×3, 1×1; `K` niche at (1,24) with `hiddenChest: 'm_scroll_protect'`; `exitRight: 'r3'` |
| r3 | 거울의 회랑 | 130×15 | `S` col 5. Five mirror puzzles (a `Q` every ~25 cols). `H` (d21) at (64,11) inside an alcove enclosed by `a` tiles (reachable only in B). `@` lore l21 (100,11). `$` on a `b` platform (118,6). | enemies 1×4, 2×3, 3×2, 5×2, 7×1; `items: ['lore:l21']`; `docs: ['d21']`; `chests: ['epic']`; `exitRight: 'r4'` |
| r4 | 만화경의 방 | 60×24 | Tiered hall: tier floors at rows 20, 15, 10, 5 alternately `a`/`b`; 4 `Q`. `!` s14_t2 at (30,19). Secret: `h` fake wall cluster cols 1–4 rows 2–4 hiding `@` k_star_1 at (2,3) and `@` lore l22 at (3,3); reachable only via a `b` ledge row 5 cols 5–9. Exit in right wall rows 17–19. | enemies 1×2, 2×3, 3×1, 4×2; `triggers: ['s14_t2']`; `items: ['k_star_1', 'lore:l22']`; `exitRight: 'r5'` |
| r5 | 여제의 복도 | 100×15 | `S` col 4. Gauntlet with 2 `Q`, 2 `B`, `$`. | enemies 1×3, 3×2, 2×2, 4×2; `chests: ['m_stone_6']`; `exitRight: 'boss'` |
| boss | 만경의 옥좌 | 56×16 | `P` col 2, `T` torches, `G` col 8, `X` col 16; arena cols 17–55; floor rows 14–15; `=` platforms row 9 at cols 24–29 and 42–47. No `Q`, no phase tiles. | `boss: true`, `gimmick: null` |

#### s15 영겁의 용광로 — digits `1 forge_imp, 2 slag_golem, 3 chain_warden, 4 bellows, 5 hellhound, 6 gear_golem, 7 mimic`
Floors: walkable floor top at row 13 (solid rows 13–14); magma basins are floor cut-outs (rows 13–14 empty down to the
map bottom). Tide `high: 12` floods one tile above the floor → every ≤ 6 columns there must be a raised stone/ledge
whose top is ≤ row 11 (or a `=` at row ≤ 11) to wait on.
| room | name | size | layout / beats | markers & params |
|---|---|---|---|---|
| r1 | 재의 관문 | 120×15 | Intro tide (stage default). Raised walkways, 3 basins. `!` s15_t1? no — `!` **s15_t1 is in r3**; r1 has the intro TIP only (from `_intro`). | enemies 1×4, 5×2, 3×1, 4×1; `exitRight: 'r2'` |
| r2 | 용융 수직갱 | 34×60 (ascent) | `P` bottom (3,57), floor rows 58–59. Zig-zag `#` ledges and `=` platforms, 2 `V` platforms (`platRange: 4`, `platSpeed: 70`), bellows on ledges; exit opening right wall rows 2–4. | `gimmick: { kind: 'magma', mode: 'rise', y0: 59, y1: 5, speed: 40, trigger: 52 }`; enemies 1×4, 4×2, 3×1; `K` + `hiddenChest: 'm_stone_6'`; `exitRight: 'r3'` |
| r3 | 사슬 주조장 | 130×15 | `S` col 4. Chain press set piece around col 60 (`!` s15_t1). `@` lore l23 at (40,11) on an anvil ledge; `H` (d22) at (110,11) behind a cooled furnace. | `gimmick: { kind: 'magma', mode: 'tide', low: 14, high: 12, period: 10, hold: 3, warn: 1.5 }`; enemies 2×2, 3×2, 1×3, 6×1, 7×1; `triggers: ['s15_t1']`; `items: ['lore:l23']`; `docs: ['d22']`; `chests: ['epic']`; `exitRight: 'r4'` |
| r4 | 담금질 수조 | 70×22 | Deep vat: floor top row 20; chain platforms `=` rows 14, 10, 6; 2 `M` (`platRange: 5`, `platSpeed: 90`). Secret `h` cols 1–5 rows 1–3 with `@` k_star_2 (2,2) and `@` lore l24 (4,2). Exit right wall rows 17–19. | `gimmick: { kind: 'magma', mode: 'tide', low: 21, high: 16, period: 6, hold: 1.5, warn: 1.2 }`; enemies 1×4, 4×2, 2×1; `items: ['k_star_2', 'lore:l24']`; `exitRight: 'r5'` |
| r5 | 용광로 심장부 입구 | 100×15 | `S` col 4; no magma. `!` s15_t2 at col 80. | `gimmick: null`; enemies 2×2, 3×3, 5×2, 6×1; `triggers: ['s15_t2']`; `exitRight: 'boss'` |
| boss | 몰록의 제단 | 56×16 | `G` col 8, `X` col 16. Floor top row 14 (rows 14–15 solid). Three plinths `#` cols 22–24, 34–36, 46–48 rows 11–13 (top row 11). `=` row 8 at cols 28–31 and 40–43. | `boss: true`, `gimmick: { kind: 'magma', mode: 'manual', level: 17 }` |

#### s16 가라앉은 성소 — digits `1 abyss_angler, 2 sunken_priest, 3 coral_crab, 4 siren, 5 merman, 6 killer_fish, 7 mimic`
`~` = deep water (stage liquid `'deep'`). Anglers/fish are placed inside water; crabs/priests on dry floors.
| room | name | size | layout / beats | markers & params |
|---|---|---|---|---|
| r1 | 수몰된 참배로 | 110×15 | Floor row 13. Pool cols 20–34 rows 9–13 (floor under it row 14). Cols 60–80 rows 8–13 flooded with a wall cols 68–72 rows 3–10 → swim under it; `u` at (70,13). `!` s16_t1 col 8. | enemies 6×3, 5×2, 3×2, 1×1; `triggers: ['s16_t1']`; `exitRight: 'r2'` |
| r2 | 침수된 신도석 | 36×56 (descent) | `P` (2,8) on a dry ledge; water from row 12 to 53, floor rows 54–55; coral ledges; `u` at rows ~22, 34, 46; an air pocket (dry cave cols 24–33 rows 30–32 with a ceiling, water surface row 33). Exit right wall rows 50–53 (underwater). | enemies 1×3, 6×3, 2×1 (in the air pocket); `exitRight: 'r3'` |
| r3 | 진주 회랑 | 140×15 | `S` col 4. Alternating dry halls / flooded halls. `@` lore l25 (30,11); `H` (d23) (76,11) under a dry font; `$` in an underwater grotto (120,12). | enemies 2×2, 3×3, 4×2, 1×2, 6×2, 7×1; `items: ['lore:l25']`; `docs: ['d23']`; `chests: ['epic']`; `exitRight: 'r4'` |
| r4 | 가라앉은 종탑 | 40×40 (ascent) | `P` (3,36) on the flooded bottom floor (floor rows 37–39); water rows 12–36; dry belfry rows 0–11 (floor row 11). `u` at rows 30 and 20. `!` s16_t2 at (20,10). `@` lore l26 (30,10). Secret underwater alcove `h` cols 36–38 rows 14–16 with `@` k_star_3 (37,15). Exit right wall rows 8–10. | enemies 1×2, 6×3, 4×2; `triggers: ['s16_t2']`; `items: ['lore:l26', 'k_star_3']`; `exitRight: 'r5'` |
| r5 | 성가대석 | 100×15 | `S` col 4; mostly dry, two 6-wide water channels rows 11–13. | enemies 4×3, 3×2, 2×2, 5×2; `exitRight: 'boss'` |
| boss | 다곤의 제단 | 56×18 | Entry block cols 0–20 solid rows 11–17 (top row 11) with `P` (2,10), `G` col 8, `X` col 16 on it (dry respawn). Arena water `~` cols 21–55 rows 12–15; floor rows 16–17. Stone platforms (1 tile thick `#`): cols 26–30 row 9, cols 36–40 row 7, cols 46–50 row 9. Pillars cols 32–33 and 43–44 rows 10–15 (top row 10). | `boss: true`, `gimmick: { kind: 'deep' }` |

#### s17 폭풍의 공중정원 — digits `1 storm_harpy, 2 gale_knight, 3 thunder_roc, 4 cloud_jelly, 5 harpy, 6 gargoyle, 7 mimic`
Pits: bottom rows empty between islands (falling = pit damage, existing rule). Every gap ≤ 5 tiles or bridged by `M`/`V`.
| room | name | size | layout / beats | markers & params |
|---|---|---|---|---|
| r1 | 구름 선착장 | 120×15 | Floating islands, 4 gaps with `M` (`platRange: 5`, `platSpeed: 90`). `!` s17_t1 col 12 (nest). | stage wind (tailwind); enemies 1×3, 4×3, 2×1, 6×1; `triggers: ['s17_t1']`; `exitRight: 'r2'` |
| r2 | 상승 기류의 탑 | 34×54 (ascent) | `P` (3,51), floor rows 52–53. Updraft columns: col 8 rows 40–50, col 26 rows 22–38, col 14 rows 6–18 (every cell `U`). `=` ledges between. Exit right wall rows 2–4. | `gimmick: { kind: 'wind', dir: 'alt', force: 700, on: 2, off: 3.5 }`; enemies 1×3, 4×3, 6×1; `K` + `hiddenChest: 'm_scroll_protect'`; `exitRight: 'r3'` |
| r3 | 공중 정원 | 140×15 | `S` col 4; `N` Rook at col 14; gardens. `@` lore l27 (60,11); `$` (90,11); `H` (d24) (118,11) under a broken statue pedestal. | `gimmick: { kind: 'wind', dir: -1, force: 900, on: 2.5, off: 3 }`; `npcs: ['npc_rook']`; enemies 2×3, 1×3, 4×2, 3×1, 7×1; `items: ['lore:l27']`; `docs: ['d24']`; `chests: ['epic']`; `exitRight: 'r4'` |
| r4 | 부서진 천문대 | 80×20 | `V` platforms (`platRange: 5`, `platSpeed: 80`), `F` crumble bridges, updrafts col 20 rows 8–17 and col 50 rows 3–15. `!` s17_t2 at (40,17). Secret at the top: `h` cols 70–75 rows 1–2 with `@` k_star_4 (71,2) and `@` lore l28 (73,2), reachable only via the col-50 updraft then an `F` bridge. Exit right wall rows 15–17. | stage wind; enemies 3×1, 1×3, 4×2, 2×1; `triggers: ['s17_t2']`; `items: ['k_star_4', 'lore:l28']`; `exitRight: 'r5'` |
| r5 | 폭풍의 계단 | 110×15 | `S` col 4; ascending stair islands. | `gimmick: { kind: 'wind', dir: 'alt', force: 1100, on: 2, off: 2.5 }`; enemies 2×3, 1×3, 3×1, 5×2; `exitRight: 'boss'` |
| boss | 지즈의 둥지 | 60×18 | `G` col 8, `X` col 16. Floor rows 16–17 with pits cols 28–31 and 44–47. `=` row 11 at cols 22–26, 34–39, 50–54. | `boss: true`, `gimmick: { kind: 'wind', auto: false }` |

#### s18 악몽의 미궁 — digits `1 puppeteer, 2 faceless, 3 dream_eater, 4 puppet_maiden, 5 cursed_nun, 6 shadow_hunter, 7 mimic`
Maze rooms have **no** `exitRight`; their right wall is closed and progress is through doors (`D` in the floor-level
cell, as in Part 1). Wrong doors lead to loop rooms that exit back to the maze room's start.
| room | name | size | layout / beats | markers & params |
|---|---|---|---|---|
| r1 | 잠의 입구 | 110×15 | Heartbeat gates (`z`/`Z` 2-wide, 4-tall columns) every ~15 cols. `!` s18_t1 col 10. | enemies 4×3, 1×1, 2×1, 5×2; `triggers: ['s18_t1']`; `exitRight: 'r2'` |
| r2 | 문의 미로 I | 60×15 | Three doors `D` at cols 18, 32, 46 on floor row 12. `z`/`Z` walls between the doors. | `doors: ['loop', 'r3', 'loop']`, `doorMarks: [null, 'blood', null]`; enemies 2×1, 4×2, 5×1 |
| loop | 같은 복도 | 40×15 | An eerily identical corridor (same decor as r2); `W` windows show the same painting. | enemies 4×1, 5×1; `exitRight: 'r2'` |
| r3 | 거꾸로 흐르는 시계탑 | 34×50 (ascent) | `P` bottom (3,47). `z`/`Z` platforms; `@` lore l29 at (17,26); `S` at the top ledge (4,3). Exit right wall rows 2–4. | enemies 1×2, 2×1, 3×2, 5×1; `items: ['lore:l29']`; `exitRight: 'r4'` |
| r4 | 문의 미로 II | 80×15 | Doors at cols 16, 32, 48, 64. `H` (d25) at (40,11) under an upside-down portrait (`W` above it). | `doors: ['loop2', 'loop2', 'r5', 'loop2']`, `doorMarks: [null, null, 'blood', null]`; `docs: ['d25']`; enemies 2×2, 1×1, 6×1, 4×2 |
| loop2 | 잘못 든 꿈 | 50×15 | Secret reward for wrong doors: `h` pocket cols 44–47 rows 2–4 reached via `z`/`Z` platforms, with `@` k_star_5 (45,3) and `@` lore l30 (46,3). | enemies 3×1, 5×2; `items: ['k_star_5', 'lore:l30']`; `exitRight: 'r4'` |
| r5 | 요람의 방 앞 | 90×15 | `S` col 4; `N` Carmilla col 20; `!` s18_t2 col 60. | `npcs: ['npc_carmilla']`; enemies 1×2, 2×2, 3×1, 6×1; `triggers: ['s18_t2']`; `exitRight: 'boss'` |
| boss | 마라의 요람 | 56×16 | `G` col 8, `X` col 16; floor rows 14–15; `z` column cols 26–27 rows 10–13, `Z` column cols 44–45 rows 10–13; `=` row 9 at cols 30–35 and 38–43. | `boss: true`, `gimmick: { kind: 'heartbeat', beat: 4.0, warn: 0.9 }` |

#### s19 썩어가는 숲 — digits `1 rot_treant, 2 plague_moth, 3 fungal_husk, 4 frog_demon, 5 corpse_worm, 6 slime, 7 mimic`
| room | name | size | layout / beats | markers & params |
|---|---|---|---|---|
| r1 | 포자의 숲길 | 120×15 | Forest trail; poison pools `~` cols 50–56 and 96–100 rows 13–14; 6 `y`. `!` s19_t1 col 10. | `gimmick: { kind: 'blight', spores: [[30, 6, 12, 7], [80, 5, 14, 8]] }`; enemies 3×4, 2×2, 4×2, 1×1; `triggers: ['s19_t1']`; `exitRight: 'r2'` |
| r2 | 뿌리 동굴 | 36×50 (descent) | `P` (2,6); root ledges; poison pool bottom-left; 5 `y`. Exit right wall rows 46–48. | `gimmick: { kind: 'blight', spores: [[4, 20, 10, 8]] }`; enemies 5×3, 6×3, 2×2; `K` + `hiddenChest: 'm_stone_6'`; `exitRight: 'r3'` |
| r3 | 균사 마을 | 140×15 | `S` col 4; ruined huts; 6 `y`; `@` lore l31 (24,11); `H` (d26) (70,11) below the well; `$` (126,11). | `gimmick: { kind: 'blight', spores: [[40, 4, 20, 9], [100, 4, 16, 9]] }`; enemies 3×6, 1×2, 2×2, 7×1; `items: ['lore:l31']`; `docs: ['d26']`; `chests: ['epic']`; `exitRight: 'r4'` |
| r4 | 썩은 세계수 둥치 | 60×30 (ascent) | `P` (3,27); branches as ledges; `G` statue at mid height (row 16); `@` k_dawnflower on the top ledge (30,3); `!` s19_t2 at (26,3); secret `h` cols 54–58 rows 5–7 with `@` k_star_6 (55,6) and `@` lore l32 (57,6). Exit right wall rows 1–3. | stage blight + `spores: [[10, 18, 12, 6]]`; enemies 2×3, 1×1, 3×2, 6×2; `triggers: ['s19_t2']`; `items: ['k_dawnflower', 'k_star_6', 'lore:l32']`; `exitRight: 'r5'` |
| r5 | 짐승의 길 | 110×15 | `S` col 4; trampled trees; 4 `y`. | `gimmick: { kind: 'blight', spores: [[60, 5, 20, 8]] }`; enemies 1×2, 3×3, 4×2, 2×2; `exitRight: 'boss'` |
| boss | 베헤모스의 늪 | 80×18 | `G` col 8, `X` col 16; arena cols 17–79; floor rows 16–17; mounds cols 30–33 and 56–59 rows 13–15; `=` row 10 at cols 24–28, 40–46, 62–66; 4 `y` in the arena. | `boss: true`, `gimmick: { kind: 'blight', spores: [] }` |

#### s20 태초의 공허 — digits `1 void_herald, 2 nihil_spawn, 3 mirror_knight, 4 slag_golem, 5 abyss_angler, 6 storm_harpy, 7 faceless, 8 rot_treant, 9 fungal_husk`
| room | name | size | layout / beats | markers & params |
|---|---|---|---|---|
| r1 | 무너지는 길 | 150×15 | Chase: floating path, small gaps (≤ 3), few enemies. `!` s20_t1 at col 6. | `gimmick: { kind: 'voidwall', mode: 'chase', speed: 115, delay: 3, startTx: -3, stopTx: 140 }`; enemies 2×6, 1×2; `triggers: ['s20_t1']`; `exitRight: 'r2'` |
| r2 | 거울의 기억 | 90×15 | Mirror puzzles (`a`/`b`, 4 `Q`). | `gimmick: { kind: 'mirror', start: 'A' }`; enemies 3×3, 1×1, 2×2; `exitRight: 'r3'` |
| r3 | 불의 기억 | 34×44 (ascent) | `P` (3,41), floor rows 42–43; ledges; exit right wall rows 2–4. | `gimmick: { kind: 'magma', mode: 'rise', y0: 43, y1: 4, speed: 52, trigger: 37 }`; enemies 2×3, 1×1, 4×1 (upper ledge); `exitRight: 'r4'` |
| r4 | 물과 바람의 기억 | 110×20 | `S` col 4; lower rows 12–17 water, upper islands; 2 `u`; one updraft column. | `liquid: 'deep'`, `gimmick: [{ kind: 'deep' }, { kind: 'wind', dir: 1, force: 800, on: 2.2, off: 3.5 }]`; enemies 5×3, 6×3, 2×2; `exitRight: 'r5'` |
| r5 | 꿈과 부패의 기억 | 100×15 | `S` col 4; `z`/`Z` gates; 3 `y`; `G` col 70; `H` (d27) (86,11); `!` s20_t2 col 92. | `gimmick: [{ kind: 'heartbeat', beat: 3.0 }, { kind: 'blight', spores: [[50, 5, 14, 8]] }]`; enemies 7×2, 8×1, 9×3, 1×1; `docs: ['d27']`; `triggers: ['s20_t2']`; `exitRight: 'boss'` |
| boss | 공허의 중심 | 60×18 | `G` col 8, `X` col 16; floor rows 16–17; `=` row 11 at cols 24–28 and 46–50; `=` row 7 at cols 34–40. | `boss: true`, `gimmick: { kind: 'voidwall', mode: 'arena' }` |

