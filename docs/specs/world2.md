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

---

## 5. Enemies (24 new)

### 5.1 Files and schema
- Data: `src/data/enemies_c.js` (`ENEMIES_C`, s14–s16, owner WP-C1) and `src/data/enemies_d.js` (`ENEMIES_D`, s17–s20,
  owner WP-C2); schema = `game/enemy.js` header (same as Part 1). `data/enemies.js` merges `{ ...ENEMIES_A, ...ENEMIES_B, ...ENEMIES_C, ...ENEMIES_D }`.
- AI: `src/game/ai_c.js` (`AI_C`) and `src/game/ai_d.js` (`AI_D`), merged in `game/ai.js` exactly like `AI_A`/`AI_B`
  (`Object.assign(AI, AI_A, AI_B, AI_C, AI_D)`). Same rules as `ai_b.js`: every attack has a telegraph, cooldowns divide
  by `e.aggro`, `AI` only used inside functions. AIs may import `Zone` and helpers from `ai_b.js` and `PROJ_B/ZONE_B`
  renderers; they may *copy* code from `ai_a.js`/`ai_b.js` but must not edit those files.
- Render: `src/render/enemies_c.js` (`RENDER_C`, plus `PROJ_C`/`ZONE_C` if needed) and `src/render/enemies_d.js`
  (`RENDER_D`, `PROJ_D`, `ZONE_D`), merged in `render/enemies.js` (`{ ...RENDER_A, ...RENDER_B, ...RENDER_C, ...RENDER_D }`).
  Render id = enemy id. Each renderer: origin at feet centre, facing handled by the caller, honours `o.flash`
  (white overlay), elite tint (the caller scales), animation by `e.anim/e.animT`, secondary motion, rim light, and is
  60–220 lines of careful Canvas drawing at the Part 2 detail bar (§0). Gallery pages `tools/gallery_enemies_c.html` /
  `_d.html` (copy the structure of `gallery_enemies_b.html`) show every enemy in every anim.
- Stubs first: WP-C1 creates `enemies_d.js`, `ai_d.js`, `render/enemies_d.js` as `export const X = {}` stubs **only if
  absent** before editing the three aggregator files; WP-C2 then owns and overwrites them.
- `desc` (bestiary) strings below are final Korean text.

### 5.2 Roster (base level-1 values; `lv` = stage level)
Tier legend: S small (hp 40–70), M medium (75–150), L large (150–230).

| id | name | stage | tier | hp/atk/def/res | exp | size w×h | ai (params) | speed / kbResist | material · weak · resist | drops |
|---|---|---|---|---|---|---|---|---|---|---|
| mirror_knight | 거울 기사 | s14 | M | 150/18/10/10 | 58 | 42×94 | `swordsman` {sight:460, combo:3, windup:0.5, rate:1.5, wave:'ice', guard:true, chaseMul:1.1, jumps:true} | 52 / 0.6 | metal · thunder,holy · ice | m_mirror .25, m_crystal .1, heart(5) .3 |
| glass_wraith | 유리 망령 | s14 | S | 60/17/3/14 | 36 | 40×72 | `wraith` {keep:240, rate:2.2, count:5}; flying, phase | 90 / 0.3 | ice · holy,fire · ice,dark | m_mirror .15, mp .15 |
| reflection | 비친 자 | s14 | M | 140/18/7/9 | 60 | 30×82 | `shadow` {delay:0.35, keep:110, sight:640} | 220 / 0.5 | ice · holy,thunder · ice | m_mirror .3, heart(5) .3 |
| chandelier_fiend | 샹들리에 마귀 | s14 | M | 90/18/6/6 | 40 | 64×52 | **`chandelier`** {wake:90, rate:2.2, spit:300}; `elite:false` | 70 / 0.5 | metal · ice,thunder · fire | m_mirror .12, heart(5) .3, food .05 |
| forge_imp | 용광로 임프 | s15 | S | 40/17/3/6 | 30 | 36×48 | **`forgeimp`** {rate:2.2, keep:180}; flying | 130 / 0.2 | fire · ice · fire,dark | m_ember .12, mp .1 |
| slag_golem | 쇳물 골렘 | s15 | L | 220/19/12/5 | 70 | 68×108 | **`slag`** {sight:460, melee:120, windup:0.8, rate:2.0} | 36 / 0.9 | fire · ice,thunder · fire | m_ember .25, m_iron .2, heart(5) .4, food .15 |
| chain_warden | 사슬 간수 | s15 | M | 130/18/8/7 | 56 | 40×92 | **`chainhook`** {sight:520, range:380, windup:0.5, rate:1.9} | 60 / 0.6 | flesh · holy,ice · fire,dark | m_iron .25, m_ember .1, heart(5) .25 |
| bellows | 불풀무 | s15 | M | 110/18/10/10 | 44 | 56×64 | **`bellows`** {range:300, inhale:0.9, blow:1.2, rate:3.0} | 0 / 1 | metal · ice · fire | m_ember .2, m_gear .1, heart(5) .3 |
| abyss_angler | 심해 아귀 | s16 | M | 95/18/5/8 | 48 | 64×44 | **`swimmer`** {sight:360, lunge:520, windup:0.45, rate:1.6, leap:700} | 110 / 0.4 | flesh · thunder · ice | m_pearl .2, food .12, heart(5) .2 |
| sunken_priest | 수몰 사제 | s16 | M | 75/17/4/14 | 44 | 34×86 | **`tidecaller`** {keep:260, windup:0.7, rate:2.6, heal:0.2} | 50 / 0.3 | flesh · thunder,holy · ice,dark | m_pearl .15, mp .2, m_soul .08 |
| coral_crab | 산호 게 | s16 | M | 120/18/14/6 | 50 | 70×50 | `knight` {shield:true, atkRange:100, reach:110, reachY:50, reachH:50, windup:0.55, atkTime:1.0, atkMv:1.6, chaseMul:1.2, sight:420, atkSfx:'clang'} | 70 / 0.8 | stone · thunder,fire · ice | m_pearl .15, m_crystal .1, food .15 |
| siren | 세이렌 | s16 | S | 70/17/4/12 | 46 | 40×78 | **`siren`** {keep:240, rate:2.4, ringSpeed:260}; flying | 110 / 0.3 | flesh · thunder,fire · ice | m_pearl .2, mp .2 |
| storm_harpy | 폭풍 하피 | s17 | S | 70/18/5/8 | 44 | 50×54 | `harpy` {rate:2.0, count:7}; flying | 160 / 0.3 | flesh · ice,dark · thunder | m_gale .2, heart .2 |
| gale_knight | 질풍 창기사 | s17 | M | 130/19/8/8 | 58 | 46×86 | **`galeknight`** {hover:150, dash:820, windup:0.6, rate:2.0}; flying | 120 / 0.5 | metal · ice,dark · thunder | m_gale .25, m_iron .15, heart(5) .3 |
| thunder_roc | 뇌조 | s17 | L | 200/20/8/10 | 80 | 110×70 | **`roc`** {rate:2.6, bolts:3, swoop:0.6}; flying, phase | 150 / 0.8 | flesh · ice,dark · thunder,fire | m_gale .35, m_crystal .15, heart(5) .4 |
| cloud_jelly | 뇌운 해파리 | s17 | S | 50/17/2/12 | 34 | 44×56 | **`jelly`** {range:110, charge:0.6, rate:2.2}; flying, phase | 45 / 0.1 | slime · ice · thunder | mp .2, m_gale .1 |
| puppeteer | 악몽 인형사 | s18 | M | 120/18/6/14 | 62 | 44×90 | **`puppeteer`** {keep:220, maxPuppets:2, summon:5, rate:2.4}; flying | 60 / 0.4 | paper · fire,holy · dark | m_dream .25, m_cloth .2, heart(5) .3 |
| faceless | 얼굴 없는 자 | s18 | L | 180/20/10/10 | 70 | 36×104 | **`stalker`** {sight:700, creep:170, blink:7, grab:0.35} | 170 / 0.7 | flesh · holy · dark,ice | m_dream .3, m_soul .15, heart(5) .35 |
| dream_eater | 꿈 삼키는 자 | s18 | M | 150/19/8/14 | 60 | 64×80 | `voider` {keep:260, rate:2.3}; flying, phase | 70 / 0.7 | ghost · holy,fire · dark | m_dream .3, m_dark .15, heart(5) .3 |
| rot_treant | 썩은 나무거인 | s19 | L | 230/20/12/8 | 80 | 72×120 | **`treant`** {sight:480, windup:0.8, rate:2.2, sporeHits:4} | 32 / 0.95 | paper · fire,holy · ice,dark | m_spore .3, food .2, heart(5) .4 |
| plague_moth | 역병 나방 | s19 | S | 55/18/3/8 | 40 | 56×40 | **`moth`** {dust:3.0, hover:180}; flying | 120 / 0.1 | paper · fire · dark | m_spore .2, mp .15 |
| fungal_husk | 균사 망자 | s19 | M | 110/18/5/5 | 46 | 34×84 | **`husk`** {riseTime:0.9, chaseMul:1.2, sight:440} | 44 / 0.3 | flesh · fire,holy · dark | m_spore .2, food .08 |
| void_herald | 공허의 전령 | s20 | L | 170/20/9/16 | 74 | 44×100 | **`herald`** {keep:280, aim:0.9, rate:2.4, blink:0.4}; flying, phase | 80 / 0.6 | ghost · holy · dark,ice,fire | m_void .3, m_soul .2, heart(5) .35 |
| nihil_spawn | 무의 파편 | s20 | S | 80/19/5/12 | 44 | 48×48 | `chaos` {sight:520, rate:1.8} | 80 / 0.4 | ghost · holy · dark | m_void .2, mp .15 |

Common fields: `gold` = `[10,24]` for S/M, `[16,40]` for L; `score` = 1400 (S) / 2000–2500 (M) / 3000–3200 (L);
`lv` = stage level. Lights: glass_wraith `{r:70,color:'#dff4ff',i:0.5}`, reflection `{r:60,'#bfe8ff',0.4}`,
chandelier_fiend `{r:110,'#ffcf7a',0.7}`, forge_imp `{r:70,'#ff8a3a',0.6}`, slag_golem `{r:110,'#ff6a1a',0.8}`,
bellows `{r:90,'#ff7a2a',0.6}`, abyss_angler `{r:80,'#aef8ff',0.7}`, siren `{r:60,'#9fe8ff',0.4}`, storm_harpy
`{r:60,'#bfe0ff',0.4}`, thunder_roc `{r:120,'#bfe0ff',0.7}`, cloud_jelly `{r:70,'#bfe0ff',0.6}`, puppeteer
`{r:60,'#c060ff',0.4}`, dream_eater `{r:80,'#c060ff',0.6}`, plague_moth `{r:50,'#c8ff6a',0.4}`, void_herald
`{r:90,'#ffffff',0.6}`, nihil_spawn `{r:60,'#ffffff',0.4}`. Undead/demon weakness conventions follow Part 1.

`desc` (final Korean):
- mirror_knight: '은빛 유리로 빚은 갑주 기사. 정면 공격은 몸의 거울면으로 튕겨 낸다. 세 번째 일격은 바닥을 타고 달리는 유리 파편의 물결이다.'
- glass_wraith: '금 간 거울에 갇힌 영혼. 몸이 깨진 유리 조각으로 되어 있어, 흩어졌다가 전혀 다른 곳에서 다시 맞춰진다.'
- reflection: '거울이 훔쳐 간 당신의 모습. 당신과 똑같이 움직이지만 반 박자 늦다. 금이 간 얼굴 사이로 텅 빈 속이 보인다.'
- chandelier_fiend: '거꾸로 매달린 수정 샹들리에에 깃든 마귀. 발밑을 지나가면 떨어져 산산조각 나고, 흩어진 촛대 다리로 기어 다니며 촛불을 뱉는다.'
- forge_imp: '용광로의 불씨가 모여 태어난 작은 악마. 달군 대갈못을 흩뿌리고, 틈이 보이면 불덩이처럼 곤두박질친다.'
- slag_golem: '식지 않는 쇳물이 거인의 모양으로 굳은 것. 두 팔을 내리찍으면 주위에 쇳물 웅덩이가 번지고, 멀리 있는 적에게는 녹은 쇳덩이를 뱉는다.'
- chain_warden: '용광로의 죄수들을 감시하는 뿔 달린 간수. 갈고리 사슬을 던져 먹잇감을 끌어당긴 뒤 올려친다. 사슬이 날아올 선이 보이면 뛰어라.'
- bellows: '살아 있는 가죽 풀무. 크게 숨을 들이마셔 가까운 것을 끌어당긴 뒤 부채꼴의 불길을 토해 낸다. 등 뒤는 무방비하다.'
- abyss_angler: '머리 위의 초롱불로 먹잇감을 꾀는 심해어. 불빛이 흔들리면 이미 늦었다 — 턱이 몸통보다 크게 벌어진다. 물 밖으로도 뛰어오른다.'
- sunken_priest: '성소와 함께 가라앉은 사제. 부푼 입으로 조수의 기도를 읊으면 발밑에서 물기둥이 솟는다. 다친 동료를 물의 축복으로 치유한다.'
- coral_crab: '산호가 등껍질을 뒤덮은 거대한 게. 옆걸음으로 다가와 집게를 내리찍는다. 정면의 산호 껍질은 칼날을 튕겨 낸다.'
- siren: '물과 공기 사이를 헤엄치는 노래하는 마물. 노래는 둥근 파문이 되어 퍼지는데, 파문에는 반드시 한 군데 틈이 있다.'
- storm_harpy: '번개를 머금은 깃털의 하피. 날개를 활짝 펴면 전기가 흐르는 깃털이 부채꼴로 쏟아진다.'
- gale_knight: '바람을 타는 날개 달린 창기사. 긴 창을 수평으로 겨누면 곧 번개처럼 돌진한다. 멀리서는 바람의 초승달을 날린다.'
- thunder_roc: '폭풍 구름 속에 둥지를 튼 거대한 새. 날개 끝으로 땅의 세 곳을 가리키면 곧 그 자리에 벼락이 꽂힌다.'
- cloud_jelly: '작은 뇌운이 해파리 모양으로 뭉친 것. 바람에 떠밀려 다니다가 가까이 오는 것에게 방전한다. 번쩍이기 시작하면 물러서라.'
- puppeteer: '손가락마다 실을 매단 키 큰 인형사. 저주 인형을 불러내 실로 조종하고 바늘을 부채꼴로 던진다. 인형사를 쓰러뜨리면 인형들도 무너진다.'
- faceless: '얼굴이 있어야 할 자리가 매끈한 키 큰 형체. 당신이 바라보는 동안에는 움직이지 않는다. 등을 돌리는 순간 — 이미 등 뒤에 있다.'
- dream_eater: '맥(貘)의 모습을 흉내 낸 악몽. 좋은 꿈을 먹던 짐승이 공허에 물들어 이제는 잠든 자의 숨결을 빨아들인다. 긴 코로 공간을 찢는다.'
- rot_treant: '균사에 먹혀 걸어 다니게 된 고목. 두 팔을 땅에 꽂으면 뿌리 가시가 줄지어 솟는다. 여러 번 베이면 몸속의 포자를 뿜는다.'
- plague_moth: '날개 가루가 곧 포자인 커다란 나방. 머리 위를 맴돌며 부패의 가루를 뿌린다. 불에 약하다.'
- fungal_husk: '버섯이 머리를 뚫고 자란 망자. 느릿느릿 쫓아오다 쓰러질 때 포자 구름을 터뜨린다. 쓰러뜨린 자리에서 물러나라.'
- void_herald: '별이 없는 밤을 두른 사제. 무지갯빛 광선으로 조준선을 긋고 하늘에서 죽어 가는 별을 떨어뜨린다. 공격 뒤에는 반대편으로 건너뛴다.'
- nihil_spawn: '공허가 흘린 검은 결정 조각. 부풀어 오르면 사방으로 조각을 흩뿌리고 먹잇감을 향해 몸을 던진다.'

### 5.3 New AI kinds (state machines; numbers are defaults, `P` = aiParams)
All strikes via `e.strike(...)`/`enemyStrike` or `Zone` with `attack.mv` as given; all projectiles `team:'enemy'`.
"warn" = visible telegraph (glow, `warnLine/warnFloor`-style zone with `noHit` during delay). Anim names in quotes are
the contract with the renderer.

**`chandelier`** (WP-C1): init — move up until the tile above is solid (≤ 6 tiles), `noGravity = true`, state `hang`.
`hang` ('hang', sway): if |dx| < `P.wake` and the player is below → `shake` 0.5 s ('shake', `sfx('bell',{pitch:1.8,vol:0.3})`)
→ `fall` (`noGravity=false`, `gravity=1.6`, contact mv 1.4) → on landing `shatter` ('shatter', 0.5 s): strike rect 220×80
centred on feet mv 1.4 fire, 6 flame bits (arc, speed 260–360, gravity 1, life 1.6, mv 0.7 fire), `sfx('break_wall')`
+ `sfx('fire')` → `crawl` ('crawl': walker speed 70) with `spit` ('spit' windup 0.4) when |dx| < 420 and |dy| < 60:
horizontal flame, speed `P.spit`, mv 0.9, cooldown `P.rate`. Killed while hanging → falls and breaks without the AoE.

**`forgeimp`** (C1): flies keeping `P.keep` px from the player (bobbing). Alternates: `rivets` ('cast', windup 0.55) → 3
molten rivets, spread ±0.25 rad, speed 300, gravity 0.4, mv 0.9 fire; each landing leaves a 40×12 burning spot 1.2 s
(tick 0.4, mv 0.5); `dive` (aim 0.4 s 'aim', then 'dive' at 460 px/s toward the locked point, contact mv 1.2, recover up).

**`slag`** (C1): slow chase within `P.sight`. `slam` when |dx| < `P.melee`: 'windup' `P.windup` (arms up, glow) →
strike 180×70 in front mv 1.8, `camera.shake(6,0.25)`, two magma puddles 60×16 at ±90 px (3 s, tick 0.35, mv 0.45 fire).
`spit` when 200 < |dx| < 500: 'spit' windup 0.6 → glob (speed 380, gravity 1.0), landing puddle 60×16 for 2.5 s.
onDie: puddle at its feet 2 s (mv 0.3). Cooldown `P.rate`.

**`chainhook`** (C1): walker speed 60. `hook` when 120 < |dx| < `P.range` and |dy| < 80: 'aim' `P.windup` with a red
warn line at chest height (−55 px) to max range → hook projectile (speed 900, max `range`, then retracts). On hit:
attack `{ mv:1.0, dir: sign(warden.cx − p.cx), kb:[700,-150] }` (knocks the player *toward* the warden) → if the player
ends within 140 px in ≤ 0.6 s → `smash` ('smash' windup 0.2): rect 110×120 mv 1.5, kb [200,-700]. `sweep` when
|dx| < 200: 'sweep' windup 0.6 → low chain sweep rect 200×40 at floor level mv 1.3 (jump to avoid). Cooldown `P.rate`.

**`bellows`** (C1): stationary; turns to face the player only in `idle`. Cycle `P.rate`: `inhale` ('inhale' `P.inhale` s):
if the player is within `P.range` in front and |dy| < 100 → pull 500 px/s² toward the mouth (`p.vx +=`) → `blow`
('blow' `P.blow` s): flame cone zone in front, length grows 0→280 in 0.2 s, height 90 at mouth height (−50),
tick 0.2, mv 0.55 fire.

**`swimmer`** (C1): uses liquid tiles. Each frame `e.noGravity = inWater(e)` where inWater = centre tile is LIQUID.
In water: free 2D movement, but any step that would move the centre into a non-LIQUID cell zeroes that velocity
component. `lurk` ('swim', lure bob) → if the player is in water within `P.sight` → `stalk` (approach to 160 px at
`speed`) → `bite` ('bite' windup `P.windup`, lure flashes) → lunge `P.lunge` px/s for 0.35 s (contact mv 1.5). If the
player is out of water, within 120 px horizontally and ≤ 200 px above the surface → `leap` ('leap': vy = −`P.leap`,
gravity 1, bite on the way, falls back). Out of water (stranded): `flop` ('flop', hop 1 tile toward nearest water
every 0.8 s, contact mv 0.5).

**`tidecaller`** (C1): ground caster keeping `P.keep` (retreat < 180, approach > 360, speed 50). `geyser` ('cast'
`P.windup`): warnFloor at player x−120, x, x+120 (ground below each) → water pillars 70×200 (life 0.5, mv 1.1,
kb [0,-600]). `bubble` ('cast' 0.6): one big bubble r 22, speed 150, homingTurn 1.5, life 4, mv 1.2, pops on hit.
`bless` (cooldown 8 s): an ally within 300 px below 60% HP heals `P.heal` × its maxHP (water ring FX).

**`siren`** (C1): flying; keeps `P.keep`. `song` ('sing' 0.8 s, note particles) → one expanding ring Zone: radius
20→360 at `P.ringSpeed` px/s, thickness 16, a 50° gap at a random angle; hit when |dist − r| < 8 and outside the gap,
mv 1.0. `charge` ('dive' aim 0.4) → 480 px/s dive, claws mv 1.3, retreat. If hit 3 times within 2 s → `vanish` 0.3 s
(fade) and reappear 200 px away (prefer water cells if any within 300 px).

**`galeknight`** (C2): flying, hovers `P.hover` px above the ground under the player's x ±200. `lance` ('aim'
`P.windup`, horizontal warn line length 520 at its height) → dash `P.dash` px/s for 0.6 s (mv 1.6, kb [420,-200]), stops
at walls. `crescent` ('slash' 0.5) → wind crescent 60×90, speed 520, pierce, life 1.4, mv 1.1. Reads
`world.gimmickOf('wind')`: during a gust it dashes with the wind only (never against).

**`roc`** (C2): flies near the top of the visible area (target y = camera.y + 90, clamped to the room), tracks player x
±220 at `speed`. `bolts` ('call' 0.9 s): `P.bolts` warned columns (player x and ±180) → lightning columns 50 px wide
from its y to the floor (life 0.35, mv 1.4 thunder). `swoop` ('screech' `P.swoop`, `sfx('bat',{pitch:0.5})`) → arc dive
through the player's position and back up in 0.9 s, contact mv 1.6. Cooldown `P.rate`.

**`jelly`** (C2): sine drift (amp 30, freq 1.4) plus slow approach; during a wind gust drifts `dir × force × 0.3` px/s².
If the player is within `P.range` → `charge` ('charge' `P.charge` s, crackle) → shock circle r 120, mv 1.1 thunder
(cooldown `P.rate`). onDie: 0.4 s warned mini-shock r 70 (mv 0.8).

**`puppeteer`** (C2): floats 160 px above ground, keeps `P.keep`. `summon` every `P.summon` s if < `P.maxPuppets`
alive ('summon' 0.8 s) → `world.spawnEnemy('puppet_maiden', x ± 80, groundY, { level })`, sets `child.summoner = e`,
keeps `e.puppets` list; the renderer draws strings from its fingers to each puppet. `needles` ('throw' 0.5) → 5-needle
fan, speed 460, mv 0.8. onDie: every puppet it summoned collapses (dead, debris, no loot).

**`stalker`** (C2): `watched` = player faces it (`sign(e.cx − p.cx) === p.facing`) and distance < `P.sight`.
Watched → `freeze` ('freeze', vx 0; still hittable). Not watched → `creep` ('creep') toward the player at `P.creep`;
within 90 px → `grab` ('grab' windup `P.grab`) → rect 90×120 mv 1.8. Every `P.blink` ± 1 s, if not watched and distance
> 300 → teleport 180 px behind the player (behind = −p.facing), 0.4 s fade-in, harmless while fading,
`sfx('ghost',{pitch:0.6})`. No footstep sounds.

**`treant`** (C2): slow walker. `roots` ('plant' `P.windup`) → 3 root spikes at 120/240/360 px ahead (or at the player's
x if closer), each warned 0.5 s, zone 70×110 life 0.45 mv 1.3, 0.25 s apart. `sweep` when |dx| < 150 ('swing' 0.6) →
rect 150×90 mv 1.5. After `P.sporeHits` hits within 3 s → `world.gimmickOf('blight')?.addCloud(cx−80, cy−60, 160, 120, 4)`
(fallback without blight: poison Zone same rect, tick 0.5, mv 0.3), cooldown 6 s.

**`moth`** (C2): sine flight (speed 120, amp 60, freq 3), hovers `P.hover` px above the player. Every `P.dust` s:
'dust' → spore cloud 100×80 centred 60 px below it for 3 s (blight `addCloud`, fallback poison Zone mv 0.3).

**`husk`** (C2): `init/update` delegate to `AI.zombie` (inside functions). `onDie`: after 0.3 s → cloud 140×110 for 4 s
(blight `addCloud`, fallback poison Zone mv 0.3). Uses `P.chaseMul`.

**`herald`** (C2): flying at player height ±40, keeps `P.keep`. `prism` ('aim' `P.aim`; the warn line tracks the player,
locks at 0.6 s) → beam (line strike thickness 18, to the first wall or 900 px, life 0.4, mv 1.6 dark, prismatic colours).
`starfall` ('raise' 0.7) → 5 stars from the camera top at player x −200…+200, speed 520 down, mv 0.9, each warned by a
small circle on the ground 0.5 s. After any attack, 40% chance `blink` to the opposite side of the player (280 px) with
`P.blink` s fade.

Reused kinds (no AI code, renderer only): `swordsman`, `wraith`, `shadow` (renderer `reflection` draws `drawHero`
with the current hero's look in a silver-glass tint `#cfe8ff` + crack lines, like `RENDER_B.shadow_hunter`), `knight`,
`harpy`, `voider`, `chaos`.

### 5.4 Render notes (per enemy, silhouette-first)
- mirror_knight: tall faceted glass armour, visor a cracked mirror, cape of hanging shards, shield-less; shards trail on attacks.
- glass_wraith: floating torso of broken panes held by blue-white light, face = reflection of a screaming mouth; on teleport breaks into 12 shards.
- reflection: hero silhouette via `drawHero`, silver/cyan, jagged crack mask over the face, slight transparency.
- chandelier_fiend: inverted crystal chandelier with a small fanged face in the hub; 6 candle arms become spider legs in `crawl`.
- forge_imp: soot-black imp with molten cracks, bat-winged, tail tipped with an ember; glowing rivet bag.
- slag_golem: dripping molten body with iron plates embedded, cooling crust flakes, glowing core; drips on the floor.
- chain_warden: horned brute in a leather apron, face hidden by an iron cage mask, chain with a hook wound around one arm.
- bellows: huge leather bellows on stubby legs, an idol face on the nozzle, inflates/deflates visibly.
- abyss_angler: fat pale fish body with translucent skin showing bones, giant needle-toothed jaw, glowing lure on a stalk.
- sunken_priest: bloated drowned cleric in a barnacled mitre, seaweed stole, bubbles from the mouth.
- coral_crab: armoured crab with coral and a tiny shrine growing on its back, one oversized claw.
- siren: fish-tailed woman with fin-hair and too-wide mouth, luminous gill lines; hovers as if swimming in air.
- storm_harpy: grey-blue feathers crackling with sparks, bird legs with long talons.
- gale_knight: winged knight in white-gold armour with a long lance, cape streaming in the wind direction.
- thunder_roc: huge dark bird with a bare skull head, lightning veins in the wings, trailing cloud wisps.
- cloud_jelly: puffy grey cloud bell with dangling lightning tendrils, blue flicker inside.
- puppeteer: gaunt tall figure with too-long fingers, porcelain half-mask, strings from each finger (drawn to puppets).
- faceless: very tall thin figure in a black suit, smooth blank face; in `freeze` slightly tilted head; long fingers.
- dream_eater: tapir-like head and trunk made of purple nebula, many closed eyes along the body, tiny legs.
- rot_treant: hunched rotten tree with a skull-like knot face, pale shelf fungi, glowing spore sacs.
- plague_moth: large moth with eye-spots on the wings dripping yellow-green dust, furry body.
- fungal_husk: shambling corpse with a mushroom cap bursting from the skull, mycelium threads.
- void_herald: robed figure whose robe interior is a starfield, prismatic halo, hands of white light.
- nihil_spawn: floating black crystal cluster with a prismatic edge, pulses before bursting.

---

## 6. Bosses (7)

### 6.1 Files, framework, conventions
- Data: `src/data/bosses_c.js` (`BOSSES_C`: narkissa, moloch, dagon, ziz — owner WP-D1) and `src/data/bosses_d.js`
  (`BOSSES_D`: mara, behemoth, nihil — owner WP-D2); `data/bosses.js` merges `{ ...BOSSES_A, ...BOSSES_B, ...BOSSES_C, ...BOSSES_D }`.
- Classes: `src/game/bosses/c_narkissa.js`, `c_moloch.js`, `c_dagon.js`, `c_ziz.js` + registry `bosses_c.js` (`BOSS_C`)
  (WP-D1); `d_mara.js`, `d_behemoth.js`, `d_nihil.js` + registry `bosses_d.js` (`BOSS_D`) (WP-D2). `index.js` merges
  `{ ...BOSS_A, ...BOSS_B, ...BOSS_C, ...BOSS_D }`. WP-D1 creates `bosses_d.js` / `data/bosses_d.js` as empty stubs
  (`export const BOSS_D = {}` / `BOSSES_D = {}`) only if absent, before editing the aggregators.
- Every class extends **`BossB`** (`b_common.js`): `setup()`, `tickB()`, states `s_<name>`, `at()/every()/later()`,
  `choose()`, `restTime()`, `zone()`, `hitParts()` (parts with `defMul` and optional `onHit`), `contactParts()`,
  `onReset()`, `debugAct()/debugPhase()`, warn helpers, `impact()`, `trySpawn()`. Do not edit `b_common.js`; put shared
  Part 2 helpers in `c_common.js` (WP-D1 owns; WP-D2 may import, not edit).
- **State names below are a contract** (tests call `boss.debugAct(name)` for each). `idle` chooses the next pattern with
  `choose()` weights per phase; rest after each pattern = `restTime(0.9–1.3)`.
- Phase transitions: invulnerable 1.2–2.0 s transition state (`s_phaseN` or named below), then the phase's pattern set.
  Phase scripts (`b_narkissa_shatter`, `b_mara_dream`, `b_nihil_form2`, `b_nihil_final`) are pushed as dialogue overlays
  in story mode once (copy the `b_dracula` pattern) and set `world.cutscene` during them.
- `onReset()` must fully restore phase-0 visuals and arena state (walls open, magma/water back to start, wind auto off,
  beat back to default, summoned minions removed).
- Art bar: grotesque, multi-part, animated, readable (§0). Size in data = main hurt body; drawings are much larger.
- Inferno (`this.inferno`): extras listed per boss.
- Gallery pages `tools/gallery_bosses_c.html` / `_d.html` (copy `gallery_bosses_b.html`): buttons per state and phase.

### 6.2 `b_narkissa` — 나르키사, 만경(萬鏡)의 여제 (s14)
```js
b_narkissa: { id: 'b_narkissa', name: '나르키사', title: '만경(萬鏡)의 여제', hp: 2300, hpMul: 1.3, atk: 36, def: 18, res: 20, exp: 6000, score: 250000,
  size: { w: 110, h: 250 }, flying: true, contact: 0.7, material: 'ice', weak: ['holy', 'thunder'], resist: ['ice', 'dark'], phases: [0.66, 0.33],
  music: 'boss3', portrait: 'portraits/b_narkissa', stageId: 's14', drops: ['u_narkissa', 'k_heart_1'], light: { r: 260, color: '#dff4ff', i: 0.8 },
  form2: { name: '깨진 여제 나르키사', title: '천 개의 눈을 가진 거울', portrait: 'portraits/b_narkissa2' },
  intro: '아름답지? 네 모든 얼굴이 내 드레스에 걸려 있단다.',
  desc: '거울 세계의 수호자. 영혼에게 참된 얼굴을 보여 주던 여제는 공허의 속삭임 끝에 아름다운 것만 보려고 제 얼굴을 깨뜨렸다.' },
```
Look: 340 px tall black-glass/silver giantess hovering; cracked porcelain mask with dozens of mismatched reflected eyes;
gown of hanging mirror shards each reflecting a screaming face; six jointed glass arms ending in shard blades;
spider-like glass legs under the gown. Phase 3: mask gone → hollow face full of eyes, mouth of mirror teeth, orbiting shards.
Arena props (drawn by the boss): four wall mirrors M0–M3 at (x0+60, floor−300), (x0+60, floor−120), (x1−60, floor−300), (x1−60, floor−120).
Hit parts: mask/face 40×50 (defMul 1.0; P3 0.6), gown 80×180 (1.4), arms ×2 40×120 (1.2), active "real mirror" (see
mirrorDive; `onHit` → stun, no damage).
Patterns:
- `mirrorDive` (P1+): glides into a random mirror (0.5 s), hidden & intangible 0.6 s, target mirror glows gold 0.7 s →
  bursts out horizontally at 900 px/s across the arena (lineStrike thickness 70 at the mirror's height, mv 1.6). The
  mirror she *entered* stays gold for 2.5 s: hitting it → `stun` state 2.0 s (face defMul 0.5). Inferno: twice in a row.
- `reflectBeam` (P1+): raises a hand mirror (0.3 s); warn lines 0.9 s showing the path from her hand to a wall mirror
  and its reflection toward the player's position at lock time → both segments strike (thickness 22, life 0.5, mv 1.5).
- `shardRain` (P1+): 7 warned columns (0.8 s) across the arena with 2 random safe gaps → shards fall (speed 700, mv 1.0)
  and leave floor spike zones 40×24 for 1.2 s (mv 0.6).
- `armCombo` (P1+): glides near (0.4 s) → low sweep (windup 0.45, rect 260×50 at floor, mv 1.2) → high sweep (0.35,
  rect 260×70 at 90–160 px height, mv 1.2) → overhead (0.5, rect 120×300 at the player's x, mv 1.5).
- `shatter1` (transition at 66%): scream, all mirrors flash, 1.5 s invulnerable.
- `twinReflect` (P2+): a mirror twin appears on the opposite side; both perform `armCombo` mirrored; the twin is a
  hit part with 3 "hits to break" (no boss damage); the real one has a faint red tear on the mask.
- `kaleido` (P2+): 3 rings of 8 shard projectiles spiral outward (orbit radius 140→420 over 3 s, gaps between blades,
  mv 0.9); screen kaleidoscope overlay (visual only, 1.5 s, cheap: 6 rotated copies of a cached 64-px sprite at α 0.15).
  Every second `twinReflect` also spawns one `reflection` enemy (max 1 alive).
- `shatter` (transition at 33%): pushes `b_narkissa_shatter`; switches to form2 (name/title/portrait in HUD/bossIntro).
- `thousandEyes` (P3): 8 beams (12 in inferno), each warned 0.5 s along the line from her face to where the player was
  at warn start, fired 0.18 s apart (thickness 14, mv 1.0).
- `mirrorFall` (P3): 4 ceiling mirrors fall at quarter positions (warnRect 0.9 s) → impact zone 120×40 mv 1.4 → glass
  spike zones 3 s (tick 0.4, mv 0.5).
Weights: P1 {mirrorDive 3, reflectBeam 2, shardRain 2, armCombo 3}; P2 + {twinReflect 3, kaleido 2}; P3 {thousandEyes 3, mirrorFall 2, mirrorDive 2, kaleido 2}.
Death: freezes, cracks spread over 1.5 s, shatters into a shard shower (`fx.burst('shard', …, 80)`).

### 6.3 `b_moloch` — 몰록, 용광로의 우상 (s15)
```js
b_moloch: { id: 'b_moloch', name: '몰록', title: '용광로의 우상', hp: 2500, hpMul: 1.3, atk: 38, def: 26, res: 12, exp: 6600, score: 270000,
  size: { w: 200, h: 300 }, flying: false, contact: 0.9, material: 'metal', weak: ['ice', 'thunder'], resist: ['fire', 'dark'], phases: [0.6, 0.3],
  music: 'boss4', portrait: 'portraits/b_moloch', stageId: 's15', drops: ['u_moloch', 'k_heart_2'], light: { r: 320, color: '#ff7a2a', i: 0.9 },
  intro: '더 많은 쇠. 더 많은 불. 더 많은 사슬을!',
  desc: '세계를 붙드는 닻의 사슬을 벼리던 대장장이 신. 공허에 물든 뒤로는 세계를 끌어내리는 사슬을 벼린다. 배 속 화로에는 녹지 못한 영혼들이 갇혀 있다.' },
```
Look: 360 px bull-headed bronze idol; open ribcage furnace in the belly with a glowing grate and souls' faces pressed
against the bars; right arm fused to a forge hammer, left hand molten tongs; chimneys on the back belching fire; hooked
chains hanging; lower body sunk in a magma pool. Moves slowly (≤ 60 px/s) within the arena's right 60%.
Hit parts: grate 80×90 (defMul 0.5 while open, 2.0 closed), head/horns 60×60 (0.9), body 140×220 (1.5).
Patterns:
- `hammer`: arm raised 0.8 s (warnFloor at impact x ±60) → slam rect 160×80 mv 1.9 + ground waves both ways
  (height 40, speed 520, to the arena edges, mv 1.0; inferno 3 waves) + 2 rivets fall at random x (warned 0.6 s).
- `tongs`: 0.6 s (tongs open, glow) → low sweep across 60% of the arena from its side over 1.0 s (height 70 from the
  floor, mv 1.5).
- `pour`: grate glows 0.7 s → opens for 2.5 s (weak point) → molten pour → lava pool zone 260 px in front for 3.5 s
  (tick 0.35, mv 0.6).
- `chimney`: chimneys glow 0.6 s → 6 meteors launched up, falling on warned circles (0.9 s, staggered 0.15 s),
  impact r 60 mv 1.2 + embers.
- `tide` (P2+): warning 1.5 s (fx.text `용암이 차오른다!`, bubbling) → `gimmickOf('magma').setLevel(13.5, 90)`
  (surface 24 px above the floor top at row 14; plinth tops at row 11 stay safe) → holds 6 s while using `chimney` or
  `furnaceBeam` → `setLevel(17, 120)`. Cycles every ~14 s in P2/P3 (inferno: level 12.5).
- `furnaceBeam` (P2+): grate opens (weak point) → horizontal flamethrower from the belly sweeping vertically between
  floor−40 and floor−260 over 2.0 s (line strike thickness 40, tick 0.25, mv 0.7).
- `hornbreak` (transition at 30%): horns crack off, souls escape.
- `souls` (P3): 5 homing souls from the grate (speed 200, turn 2.2, life 4, mv 0.9 dark).
- `chains` (P3): 3 chain columns erupt (warnFloor 0.7 at player x and ±220) and pull toward the idol for 1.2 s
  (600 px/s² pull, contact mv 1.1).
Weights: P1 {hammer 3, tongs 2, pour 2, chimney 2}; P2 {tide 2, furnaceBeam 2, hammer 2, pour 2, chimney 1}; P3 {souls 2, chains 2, tide 2, hammer 2, furnaceBeam 1}.
Death: furnace explodes, freed souls rise as golden sparks, magma recedes (`setLevel(17)`).

### 6.4 `b_dagon` — 다곤, 가라앉은 성소의 사제왕 (s16)
```js
b_dagon: { id: 'b_dagon', name: '다곤', title: '가라앉은 성소의 사제왕', hp: 2600, hpMul: 1.3, atk: 39, def: 20, res: 22, exp: 7200, score: 290000,
  size: { w: 180, h: 240 }, flying: true, contact: 0.8, material: 'flesh', weak: ['thunder'], resist: ['ice', 'fire', 'dark'], phases: [0.6, 0.3],
  music: 'boss3', portrait: 'portraits/b_dagon', stageId: 's16', drops: ['u_dagon', 'k_heart_3'], light: { r: 280, color: '#3ad0c8', i: 0.75 },
  intro: '빛… 수면 위의 빛을… 본 지가 언제였던가.',
  desc: '조수의 수호자였던 사제왕. 공허를 피해 도시를 바다 밑으로 가라앉혔지만, 빛이 닿지 않는 곳에서 빛을 잊었다.' },
```
Look: colossal fish-headed priest-king, barnacle-crusted grey-green flesh, gill slits across the ribs, crown of
bioluminescent angler lures, coral crozier, lower body a mass of eel tentacles, fused with a sunken pipe organ; drowned
pilgrims embedded in his back like pearls. Moves by emerging (torso above water) and submerging (bubbles + lure lights).
Hit parts: gills ×2 (defMul 0.6 while flared, 1.3 otherwise), lure bulbs ×3 (1.0, destroyable at 2% max HP each →
1 s stagger; regrow in P3), crown/face (1.0), body (1.3).
Patterns:
- `whirl`: submerged; whirlpool at the player's x (r 160, 3 s) pulls toward its centre (in water: vx/vy 420 px/s²) +
  4 water spears from the surface upward (40×200, warned 0.7 s, mv 1.2).
- `lure`: emerges; 3 lures detach and drift toward the player (speed 120, homing 1.2, life 5), `world.lighting.darkness
  += 0.25` for 5 s (restore after); each explodes on contact or at end of life (r 70, mv 1.2). Lures are hit parts.
- `organ`: inhales 1.2 s (gills flare = weak point) → 2 expanding rings with 55° gaps (r 20→700, speed 380,
  thickness 18, mv 1.2; inferno 3 rings).
- `tentacle`: surface ripples 0.8 s → 4 tentacles sweep along the surface band (surface−40 … surface+30) across the
  arena in 1.2 s (mv 1.4). Safe: on a platform or ≥ 80 px below the surface.
- `flood` (P2+): `gimmickOf('deep').setWaterRow(9, 21, 55, 3)` → holds 10 s (inferno 14 s) using `charge` → back to row 12.
- `charge` (P2+): bubble trail warning 0.8 s at the player's depth → horizontal dash 950 px/s (mv 1.7).
- `choir` (P3): summons up to 3 `drowned` (existing s08 enemy) via `trySpawn`, + an `organ` with 3 rings.
Weights: P1 {whirl 2, lure 2, organ 3, tentacle 3}; P2 {flood 2, charge 3, organ 2, tentacle 2}; P3 {choir 2, flood 1, charge 2, organ 2, lure 2}.
Death: sinks slowly, lures go out one by one, a blue heart rises.

### 6.5 `b_ziz` — 지즈, 폭풍을 부르는 거신조 (s17)
```js
b_ziz: { id: 'b_ziz', name: '지즈', title: '폭풍을 부르는 거신조', hp: 2700, hpMul: 1.35, atk: 40, def: 18, res: 18, exp: 7800, score: 310000,
  size: { w: 260, h: 200 }, flying: true, contact: 0.9, material: 'flesh', weak: ['ice', 'dark'], resist: ['thunder', 'fire'], phases: [0.65, 0.3],
  music: 'boss4', portrait: 'portraits/b_ziz', stageId: 's17', drops: ['u_ziz', 'u_ziz2', 'k_heart_4'], light: { r: 300, color: '#bfe0ff', i: 0.85 },
  intro: '(하늘 전체가 날개가 되어 태양을 가린다.)',
  desc: '하늘 왕국의 신이자 폭풍 그 자체. 날개를 펴면 해가 가려지고, 깃털 하나하나가 번개다. 까마귀 백성은 그를 어머니라 불렀다.' },
```
Look: larger than the screen — skull beak, a row of 6 eyes along each wing's leading edge, storm-cloud feathers with
running lightning, exposed ribcage full of ball lightning (core), talons like broken spires. Hovers at floor−380, drifts.
Hit parts: head 60×60 (1.0), ribcage core 90×90 (0.5 when exposed, 1.6 otherwise), 12 wing eyes 30×30 (0.8, P2+,
each 1.2% max HP, destroyed eyes stop firing), wings (1.4).
Patterns:
- `gust`: wings raised 1.0 s → `gimmickOf('wind').gust(dirAwayFromZiz, 1300, 2.5, 0)` + 8 feathers riding the wind
  (horizontal, speed 420, mv 0.8).
- `bolts`: 3 warned columns (0.9 s) at player x and ±200 → lightning columns 60 px wide sky-to-floor (life 0.35,
  mv 1.5 thunder); P2 repeats twice; inferno 5 columns.
- `talon`: swoop — warnRect band 120 px tall at the player's height 0.8 s → talons sweep across the arena in 1.0 s (mv 1.7).
- `feathers`: fan of 9 thunder feathers (speed 480, mv 0.9).
- `eyestorm` (P2+): every living wing eye fires a lightning bead at the player in sequence, 0.12 s apart (speed 520, mv 0.7).
- `cyclone` (P2+): 6 s of wind flipping direction every 1.5 s (`gust` calls) while `feathers` fires twice.
- `crash` (P3): warnRect 400×300 at a side 1.2 s → crashes onto the platforms (mv 2.0 + shockwave) → lies stunned 3.5 s
  with the ribcage core exposed at floor−120, then rises.
Weights: P1 {gust 2, bolts 3, talon 3, feathers 2}; P2 {eyestorm 3, cyclone 2, bolts 2, talon 2}; P3 {crash 3, eyestorm 2, bolts 2, gust 2}.
Death: wings fold, lightning drains out of the feathers, a storm-coloured heart falls; Raven's `_post` line.

### 6.6 `b_mara` — 마라, 악몽을 낳는 자 (s18)
```js
b_mara: { id: 'b_mara', name: '마라', title: '악몽을 낳는 자', hp: 2700, hpMul: 1.35, atk: 41, def: 17, res: 24, exp: 8400, score: 330000,
  size: { w: 140, h: 220 }, flying: true, contact: 0.7, material: 'flesh', weak: ['holy', 'fire'], resist: ['dark', 'ice'], phases: [0.6, 0.3],
  music: 'boss3', portrait: 'portraits/b_mara', stageId: 's18', drops: ['u_mara', 'k_heart_5'], light: { r: 240, color: '#c060ff', i: 0.7 },
  form2: { name: '요람의 마라', title: '꿈을 삼키는 요람', portrait: 'portraits/b_mara' },
  intro: '쉬— 쉬— 착하지. 이제 눈을 감으렴. 영원히.',
  desc: '잠든 자의 가슴에 올라앉는 악몽의 정령. 본래는 나쁜 꿈을 대신 먹어 주던 꿈의 산파였으나, 공허가 배를 채워 주지 않자 꿈을 낳기 시작했다.' },
```
Look: gaunt elongated hag, four long arms, cracked porcelain doll face with no eyes and a stitched vertical mouth,
squatting on a giant iron cradle; hair of threads tied to floating sleeping faces; doll limbs crawl from under the
cradle. Form 2 (P2+): hag and cradle merge into a spider-like "cradle beast" (260×180, ground-based) with three baby-doll
heads on its legs.
Hit parts: face (1.0), mouth-eye (0.5 during `scream`), cradle (1.5); P2: doll heads ×3 (0.9, 2% max HP each;
destroying all → 3 s collapse stun).
Patterns:
- `lullaby`: sings 1.0 s → 3 slow expanding rings (40° gaps, speed 200, thickness 14, mv 0.9); darkness +0.2 for 4 s.
- `threads`: 5 vertical threads (warnLine 0.7 s) at random x, then each sweeps 200 px sideways over 1.0 s (mv 1.1).
- `dolls`: throws 3 porcelain dolls (arcs); on landing each becomes a crawling Zone (90 px/s toward the player,
  3 s) that explodes (r 60, mv 1.2) on contact or timeout.
- `scissors`: two diagonal warn lines crossing the arena 0.8 s → X cut (thickness 30, mv 1.6).
- `dreamshift` (transition at 60%): pushes `b_mara_dream`; screen overlay `rgba(60,0,90,0.25)` + inverted vignette
  (no control inversion); `gimmickOf('heartbeat').setBeat(2.6)`; switches to form 2.
- `cradleRush` (P2+): dust 0.8 s → charges across the arena, leaps off the wall (mv 1.7).
- `faces` (P2+): 6 sleeping faces around the arena wake one by one and scream a projectile at the player (speed 400, mv 0.8).
- `falseDawn` (P3, once per fight): white flash, `world.banner = { text: 'STAGE CLEAR', sub: '마라 격파!', t: 1.0, color: '#ffe070', big: true }`,
  music stops for 1.0 s; then banner `{ text: '…라고 생각했니?', sub: '', t: 1.4, color: '#c060ff', big: true }` and a
  radial barrage of 12 needles from above (mv 0.9). Boss invulnerable during the 2.4 s sequence; never touches
  `world.cleared` or emits events.
- `scream` (P3): stitched mouth opens vertically revealing a huge eye (weak point 2.5 s) → scream cone zone 400×200 in
  front (delay 0.6, life 0.8, mv 1.3, strong knockback).
Weights: P1 {lullaby 3, threads 2, dolls 2, scissors 3}; P2 {cradleRush 3, faces 2, threads 2, scissors 2}; P3 {falseDawn (forced first), scream 3, cradleRush 2, faces 2, lullaby 1}.
Death: the cradle rocks to a stop; she curls up and fades; a violet heart remains.

### 6.7 `b_behemoth` — 베헤모스, 부패한 대지의 짐승 (s19)
```js
b_behemoth: { id: 'b_behemoth', name: '베헤모스', title: '부패한 대지의 짐승', hp: 3000, hpMul: 1.4, atk: 42, def: 28, res: 16, exp: 9000, score: 350000,
  size: { w: 340, h: 230 }, flying: false, contact: 1.0, material: 'flesh', weak: ['fire', 'holy'], resist: ['ice', 'dark'], phases: [0.6, 0.3],
  music: 'boss4', portrait: 'portraits/b_behemoth', stageId: 's19', drops: ['u_behemoth', 'k_heart_6'], light: { r: 300, color: '#9ad040', i: 0.6 },
  intro: '(대지가 신음한다. 숲 하나가 통째로 일어섰다.)',
  desc: '숲을 등에 지고 다니던 온순한 대지의 짐승. 공허의 굶주림이 포자가 되어 내려앉자, 균사의 여왕이 그 척수를 붙들고 춤추게 했다.' },
```
Look: mountain-sized rotting boar-hippo; trees and giant pale mushrooms on its back; half the face bare skull; exposed
ribs with pulsing fungal sacs; a pale humanoid fungal queen fused to its spine, root tendrils into the flesh. Walks toward
the player at ≤ 60 px/s when idle; turns around.
Hit parts: queen 50×90 on the back (0.55 from P2; 1.2 dormant in P1), flank sacs ×3 50×50 (0.8, 2.5% max HP each;
all destroyed → 4 s stun, regrow after), skull 70×70 (1.0), body (1.6).
Patterns:
- `charge`: paw scrape 1.0 s (dust, arrow) → charges to the far wall at 700 px/s (contact mv 1.8). Safe: `=` platforms at
  row 10. Wall hit → `kneel` 2.5 s (queen reachable at floor−150) + 3 falling rocks (warned 0.6 s, mv 1.0).
- `roots`: 3 root waves toward the player (warnFloor 0.7 s each, 70×120, mv 1.3).
- `sporeBurst`: sacs pulse 1.0 s → 3 clouds 200×140 for 5 s via `gimmickOf('blight').addCloud` (fallback poison Zones mv 0.3).
- `stomp`: rears 0.8 s → shockwave both directions (height 50, mv 1.4).
- `queenThorns` (P2+): the queen fires 5 thorn volleys (arcs, mv 0.9).
- `husks` (P2+): up to 3 `fungal_husk` rise near the player (`trySpawn`).
- `rotBreath` (P3): warn 0.9 s → breath cone 520×200 in front for 1.5 s (tick 0.3, mv 0.8) + clouds along the cone.
- `bloom` (P3): 4 spore pods sprout at random floor cells (`gimmickOf('blight').spawnPod`).
Weights: P1 {charge 3, roots 2, sporeBurst 2, stomp 2}; P2 {charge 3, queenThorns 3, husks 1, roots 2, stomp 1}; P3 {rotBreath 3, bloom 1, charge 2, queenThorns 2}.
Death: the queen withers and drops off; the beast lies down with a long gentle groan; sprouts bloom on its back.

### 6.8 `b_nihil` — 니힐, 태초의 공허 (s20, final)
```js
b_nihil: { id: 'b_nihil', name: '니힐', title: '태초의 공허', hp: 3200, hpMul: 1.6, atk: 44, def: 22, res: 22, exp: 15000, score: 600000,
  size: { w: 220, h: 280 }, flying: true, contact: 0.8, material: 'ghost', weak: ['holy'], resist: ['dark', 'ice', 'fire', 'thunder'], phases: [0.75, 0.45, 0.15],
  music: 'nihil', portrait: 'portraits/b_nihil', stageId: 's20', drops: ['u_nihil', 'u_nihil2'], light: { r: 340, color: '#ffffff', i: 0.6 },
  form2: { name: '니힐', title: '만유(萬有)를 흉내 내는 무', portrait: 'portraits/b_nihil2' },
  intro: '……',
  desc: '빛도 어둠도 태어나기 전의 무(無). 혼돈의 군주는 그가 꾼 꿈 하나에 불과했다. 소리를, 빛을, 심장 소리를 삼켜 다시 고요로 돌아가려 한다.' },
```
Look: P1 a colossal hooded silhouette cut out of reality (starfield inside, prismatic outline), a white porcelain mask
that slowly morphs through previous bosses' faces, two giant floating hands with an eye in each palm. P2 the mask
glitches into "echo" silhouettes of earlier bosses. P3 the silhouette tears into a maw of collapsing stars. P4 shrinks
to a black sun ringed with white fire.
Hit parts: mask/core 80×100 (1.0; P3 0.5 while `maw` is open; P4 0.4), palm eyes ×2 50×50 (0.6 while open, 1.5
closed), hands (1.3).
Patterns:
- `palmEyes`: a hand descends (warnCircle 0.8 s) → slam (circle r 110, mv 1.8); the palm eye stays open 1.8 s.
- `erase`: warnRect band 90 px tall across the arena at the player's height (0.9 s) → erased (mv 1.6).
- `starfall`: 10 stars at random x (warned circles r 40, 0.7 s), mv 1.0.
- `grasp`: both hands sweep inward from the arena edges at floor level (0–120 px) in 1.0 s (mv 1.5).
- `form2` (transition at 75%): pushes `b_nihil_form2`.
- `echoDracula` (P2+): 3 hellfire pillars (warnFloor) + 3 fireballs, Dracula-style colours `#ff2a3a`.
- `echoChaos` (P2+): eye-laser grid, 4 vertical + 2 horizontal lines (warn 1.0 s, mv 1.4), violet.
- `echoNarkissa` (P2+): shard rain with 2 gaps (as `shardRain`).
- `echoZiz` (P2+): 5 lightning columns (as `bolts`).
- `collapse` (P3, at 45% then every ~20 s): `gimmickOf('voidwall').closeIn(x0 + 10*48, x1 − 10*48, 80)`; arena ~20 tiles
  wide for 12 s; `open()`.
- `maw` (P3): maw opens (core exposed) → inhale pulls the player toward it (500 px/s²) for 2.5 s while debris
  projectiles fly inward (mv 0.8) → bite (rect 300×200 in front, mv 2.2).
- `final` (transition at 15%): pushes `b_nihil_final`; afterwards `world.run.sp = 100` (ultimate ready; if the ult spec
  provides a super/awakening ultimate, this is its intended moment), gives the player `buffs.holyaura = 20` +
  `refreshStats()`, core permanently exposed (0.4), voidwall `open()`.
- `lastLight` (P4): only slow `starfall` (5 stars, 1.2 s warn) and `grasp` at half speed — the finale is a victory lap.
Weights: P1 {palmEyes 3, erase 2, starfall 2, grasp 2}; P2 {echoDracula 2, echoChaos 2, echoNarkissa 2, echoZiz 2, palmEyes 1}; P3 {collapse (forced on entry), maw 3, erase 2, echoChaos 1, starfall 2}; P4 {lastLight}.
Death (4 s): cracks of light spread across the void, white-out flash, silence, then `b_nihil_post`.

### 6.9 Loot rules for Part 2 bosses (owner WP-F in `game/loot.js`)
- `drops` uniques as Part 1 (first kill guaranteed, then 40%). Items with `worldHeart` are skipped when already in
  `progress.hearts` (never duplicated).
- Mythic: `b_nihil` first kill guaranteed, else 50%; other Part 2 bosses 1.5%; elites in s20 0.6%. Part 2 stages
  (`stage.chapter >= 14`) draw from `MYTHIC_WEAPONS_P2`; Part 1 unchanged.

---

## 7. Items, loot, shop (owner WP-F; `src/data/items.js`, `game/loot.js`, `data/shop.js`, `render/icons.js`)

### 7.1 Tier 7 constants
- `TIER_LV = [1, 6, 13, 21, 30, 40, 50]`, `TIER_ROMAN` adds `'Ⅶ'`.
- `T_ATK` adds `110`; `T_WPRICE` adds `26000`; `A_BASE.head.def` adds 35, `.res` 20; `A_BASE.body.def` 52, `.res` 18,
  `.hp` 140; `A_BASE.cloak.def` 20, `.res` 29; `T_APRICE` adds 18000; `T_CPRICE` adds 26000; `U_PRICE` adds 150000.
- `tierForLevel` loops to 7; `baseIdFor` clamps to 7; `rollItem` clamps tier to 7 and widens the nearest-tier search to 7.
- `render/icons.js` fallback arrays get a 7th colour (`metal` `#dff4ff`, cloak `#1a1030`).
- Arcade `buildArcadeState` uses `Math.min(7, P.wtier)`.

### 7.2 Tier-7 bases (appended as rows 13–14 of each table; ids follow the existing numbering)
Weapons (`w_<type>_13` standard, `w_<type>_14` upper; icon `<type>_7`; visual `{ style: 6, rift: true, color?, glow? }` —
the hero renderer treats `rift` as an optional iridescent shimmer and otherwise renders style 6):
| type | 13 | 14 |
|---|---|---|
| whip | '균열의 사슬' dark, `{ lifesteal: 2 }`, '#3a2a4a' — '공허의 균열에서 건져 낸 사슬. 휘두르면 공간이 잠시 찢어진 채로 남는다.' | '별빛 채찍 아스트라' holy, `{ reach: 12, crit: 5 }`, '#f4ecd0' — '별빛을 꼬아 만들었다는 채찍. 밤하늘에 휘두르면 별자리가 그려진다.' |
| sword | '만경검' ice, `{ crit: 6 }`, '#dff4ff' — '만경궁의 거울을 녹여 벼린 검. 칼날에 벤 자의 얼굴이 비친다.' | '폭풍 참마검' thunder, `{ atkSpd: 6 }`, '#bfe0ff' — '하늘 왕국 근위대의 검. 칼집에서 뽑을 때마다 천둥이 먼저 운다.' |
| greatsword | '용광로 대검' fire, `{ critDmg: 14 }` — '영겁의 용광로에서 식지 않은 채 꺼낸 대검. 칼날이 늘 붉게 달아 있다.' | '세계수 파쇄검' null, `{ critDmg: 26, hp: 60 }` — '썩은 세계수의 심재를 깎아 만든 대검. 쇠보다 무겁고 쇠보다 단단하다.' |
| dagger | '악몽의 송곳' dark, `{ crit: 5 }` — '꿈속에서 벼린 송곳. 깨어나면 상처만 남는다.' | '심해 가시 단검' ice, `{ critDmg: 20, lifesteal: 2 }` — '심해 아귀의 이빨을 갈아 만든 단검. 물속에서 더 날카로워진다.' |
| gun | '뇌조의 장총' thunder, `{ crit: 5 }` — '뇌조의 깃대를 총열로 쓴 장총. 방아쇠를 당기면 벼락이 날아간다.' | '용암 산탄포' fire, `{ critDmg: 22 }` — '쇳물을 산탄으로 쏘는 대포. 한 발 한 발이 작은 용광로다.' |
| staff | '산호 성장(聖杖)' holy, `{ mp: 30, mpRegen: 1 }` — '가라앉은 성소의 사제들이 들던 산호 지팡이. 물속에서도 기도가 닿는다.' | '공허의 지팡이' dark, `{ skillDmg: 14 }` — '공허의 조각을 박은 지팡이. 들여다보면 끝없이 빨려 든다.' |

Armour (`a_head_13/14`, `a_body_13/14`, `a_cloak_13/14`; icons `head_7`, `body_7`, `cloak_7`):
| slot | 13 | 14 |
|---|---|---|
| head | '거울 투구' def, `{ headgear: 'helm', color: '#dfe8f0' }`, `{ hp: 50 }` — '만경궁 근위대의 거울 투구. 뒤에서 오는 것도 비쳐 보인다.' | '폭풍 깃 왕관' res, `{ headgear: 'crown', color: '#9fc8ff' }`, `{ jumpPow: 6, mag: 10 }` — '하늘 왕국 왕족의 깃털 왕관. 바람이 쓰는 이를 떠받친다.' |
| body | '용광로 판금' def, `{ armor: 'plate', color: '#5a3020', trim: '#ff7a2a' }`, `{ resFire: 18 }` — '용광로의 열기로 담금질한 판금. 불길 속에서도 식지 않는다.' | '심해 비늘 흉갑' bal, `{ armor: 'chain', color: '#2a6a7a', trim: '#9fe8ff' }`, `{ resIce: 15, hpRegen: 1 }` — '심해 괴어의 비늘을 엮은 흉갑. 상처가 물처럼 아문다.' |
| cloak | '악몽의 장막' res, `{ cape: 'tattered', color: '#1a0a20', color2: '#6a2a8a', len: 1.2 }`, `{ crit: 4 }` — '악몽을 짜서 만든 망토. 두르면 적이 당신을 제대로 보지 못한다.' | '새벽 날개 망토' bal, `{ cape: 'royal', color: '#fff4e0', color2: '#ffd070', len: 1.25 }`, `{ moveSpd: 7, resDark: 15 }` — '새벽빛을 머금은 깃털 망토. 어둠 속에서도 길이 보인다.' |

Accessories (ACC_TABLE rows, tier 7; icons `ring_7`, `amulet_7`):
`['a_ring_13', '균열의 반지', 'ring_7', 7, { atk: 24, crit: 7, critDmg: 24, dark: 18 }, { color: '#b060ff', type: 'dark' }, '공허의 균열이 새겨진 반지. 끼는 순간 손가락 끝이 차가워진다.']`,
`['a_ring_14', '닻의 반지', 'ring_7', 7, { atk: 20, lifesteal: 3, hp: 90 }, { color: '#ff8a9a', type: 'blood' }, '세계의 닻을 본떠 만든 반지. 무엇에도 휩쓸리지 않는다.']`,
`['a_amulet_13', '별의 목걸이', 'amulet_7', 7, { mag: 24, skillDmg: 22, cdr: 9 }, { color: '#fff2b0', type: 'holy' }, '작은 별 조각을 담은 목걸이. 밤이 깊을수록 밝아진다.']`,
`['a_amulet_14', '새벽 성인의 유골함', 'amulet_7', 7, { res: 32, dmgReduce: 8, resDark: 25 }, { color: '#fff2b0', type: 'holy' }, '천 년 전 성녀의 유골 한 조각을 모신 목걸이. 공허도 이것을 삼키지 못한다.']`.

### 7.3 Materials (MATERIALS rows; existing icons reused)
`['m_mirror', '거울 파편', 'gem_crystal', 5, 120, '만경궁의 깨진 거울 조각. 들여다보면 반 박자 늦게 눈을 깜빡인다.']`,
`['m_ember', '영겁의 불씨', 'stone_6', 5, 140, '영겁의 용광로에서 꺼내 온 불씨. 물에 담가도 꺼지지 않는다.']`,
`['m_pearl', '심해 진주', 'amulet_2', 5, 150, '빛이 닿지 않는 바다에서 스스로 빛나는 진주.']`,
`['m_gale', '폭풍 깃털', 'sub_dagger', 6, 170, '번개가 흐르는 깃털. 손에 쥐면 머리카락이 곤두선다.']`,
`['m_dream', '악몽의 모래', 'potion_mp', 6, 180, '꿈속에서 흘러나온 보랏빛 모래. 베개 밑에 두지 말 것.']`,
`['m_spore', '역병 포자', 'antidote', 6, 160, '밀봉한 병 속의 포자. 병을 흔들면 안에서 무언가 꿈틀거린다.']`,
`['m_void', '공허 정수', 'relic_4', 7, 260, '아무것도 없는 것을 병에 담은 것. 그런데 무겁다.']`.

### 7.4 Key items (KEYS-like; new flags on the base: `worldHeart: n`, `starShard: n`, `color`)
| id | name | icon | extra | desc |
|---|---|---|---|---|
| k_rift_lantern | 균열의 등불 | rift_lantern | quest | '레이븐이 건넨 낡은 등불. 검은 불꽃이 타오르는 한, 어느 세계에서든 돌아올 수 있다.' |
| k_heart_1 | 세계의 심장: 거울 | wheart_1 | worldHeart 1, color '#dff4ff' | '만경궁의 닻. 은빛으로 고동치며 보는 이의 참된 얼굴을 비춘다.' |
| k_heart_2 | 세계의 심장: 불꽃 | wheart_2 | 2, '#ff7a2a' | '영겁의 용광로의 닻. 쥐고 있으면 손바닥이 따뜻하다.' |
| k_heart_3 | 세계의 심장: 바다 | wheart_3 | 3, '#3ad0c8' | '가라앉은 성소의 닻. 귀에 대면 파도 소리가 들린다.' |
| k_heart_4 | 세계의 심장: 폭풍 | wheart_4 | 4, '#bfe0ff' | '하늘 왕국의 닻. 안에서 작은 번개가 쉬지 않고 친다.' |
| k_heart_5 | 세계의 심장: 꿈 | wheart_5 | 5, '#c060ff' | '악몽의 미궁의 닻. 들여다보면 졸음이 쏟아진다.' |
| k_heart_6 | 세계의 심장: 대지 | wheart_6 | 6, '#9ad040' | '썩어가던 숲의 닻. 새싹 냄새가 난다.' |
| k_star_1…6 | 별의 조각 (거울/불꽃/바다/폭풍/꿈/대지) | star_shard | starShard 1…6 | '세계의 틈에 숨어 있던 작은 별. 여섯이 모이면 무언가가 떠오를 것만 같다.' (same desc for all six, name suffix differs: '별의 조각: 거울' …) |
| k_dawnflower | 새벽꽃 | dawnflower | quest | '공허의 부패가 걷힌 자리에서만 핀다는 꽃. 새벽빛을 머금어 은은하게 빛난다.' |
All `slot: 'key'`, `tier: 1`, `price: 0`, `stack` none. Hearts are boss drops (§6.9); shards are map `@` items.

### 7.5 Uniques (UNIQUE_LIST; `rarity` fixed, stats fixed)
| id | name | slot / wtype | tier | lvReq | rarity | boss | stats | element / visual | effect |
|---|---|---|---|---|---|---|---|---|---|
| u_narkissa | 만경의 홀 나르키사 | weapon staff | 7 | 48 | 5 | b_narkissa | `{ atk: 60, mag: 168, ice: 30, res: 20, skillDmg: 15 }` | ice; `{ style: 6, glow: '#dff4ff', rift: true }` | '만 개의 거울 — 냉기 피해 +30%, 스킬 피해 +15%' |
| u_moloch | 우상 파쇄 대검 몰록 | weapon greatsword | 7 | 52 | 5 | b_moloch | `{ atk: 205, fire: 30, critDmg: 35, hp: 80 }` | fire; `{ style: 6, glow: '#ff7a2a', rift: true }` | '영겁의 불 — 화염 피해 +30%, 치명타 피해 +35%' |
| u_dagon | 심해 작살포 다곤 | weapon gun | 7 | 55 | 5 | b_dagon | `{ atk: 150, ice: 30, crit: 10, critDmg: 25 }` | ice; `{ style: 6, glow: '#3ad0c8', rift: true }` | '심해의 압력 — 냉기 피해 +30%, 치명타 확률 +10%' |
| u_ziz | 뇌조의 꽁지 채찍 지즈 | weapon whip | 7 | 58 | 5 | b_ziz | `{ atk: 160, thunder: 35, reach: 15, atkSpd: 8 }` | thunder; `{ style: 6, glow: '#bfe0ff', rift: true }` | '폭풍의 꼬리 — 번개 피해 +35%, 공격 범위 +15%' |
| u_ziz2 | 지즈의 날개 망토 | cloak | 7 | 58 | 5 | b_ziz | `{ def: 22, res: 34, airJumps: 1, moveSpd: 8, jumpPow: 10 }` | `{ cape: 'tattered', color: '#2a3a5a', color2: '#bfe0ff', len: 1.3 }` | '하늘의 기억 — 공중 점프 +1, 점프력 +10%' |
| u_mara | 악몽의 바늘 마라 | weapon dagger | 7 | 62 | 5 | b_mara | `{ atk: 118, crit: 20, critDmg: 40, dark: 30, atkSpd: 10 }` | dark; `{ style: 6, glow: '#c060ff', rift: true }` | '잠들지 않는 바늘 — 치명타 확률 +20%, 공격 속도 +10%' |
| u_behemoth | 베헤모스의 엄니검 | weapon sword | 7 | 66 | 5 | b_behemoth | `{ atk: 170, mag: 45, lifesteal: 3, hp: 100, critDmg: 25 }` | null; `{ style: 6, glow: '#9ad040', rift: true }` | '대지의 이빨 — 흡혈 +3%, 최대 HP +100' |
| u_nihil | 무(無)의 왕관 | acc | 7 | 68 | 5 | b_nihil | `{ atk: 32, mag: 32, skillDmg: 25, ultGain: 30, cdr: 12, dmgReduce: 6 }` | `{ aura: { color: '#ffffff', type: 'holy' } }` | '공허를 이긴 증표 — 필살 게이지 충전 +30%, 재사용 대기 −12%' |
| u_nihil2 | 공허를 두른 망토 | cloak | 7 | 68 | 5 | b_nihil | `{ def: 26, res: 40, hp: 120, lifesteal: 2, moveSpd: 10, resDark: 30 }` | `{ cape: 'royal', color: '#05030a', color2: '#e8e0ff', len: 1.3 }` | '별 없는 밤 — 이동 속도 +10%, 암흑 저항 +30%' |
| u_alberto | 알베르토의 묵주 | acc | 7 | 50 | 4 | — (quest) | `{ res: 20, holy: 20, hpRegen: 2, resDark: 20 }` | `{ aura: { color: '#fff2b0', type: 'holy' } }` | '늙은 사제의 기도 — HP 재생 +2/초, 신성 피해 +20%' |
Icons: weapons use `<type>_7`, cloaks `cloak_7`, acc `ring_7`/`amulet_7`. Descriptions (Korean, 1–2 sentences) are
written by WP-F in the same style (grotesque flavour for boss items; u_alberto: '알베르토 신부가 백 년 동안 굴린 묵주. 알 하나하나에 헌터들의 이름이 새겨져 있다.').

**Part 2 mythic weapons** (tier 7, rarity 5, `mythic: true`, icon `<type>_7`, visual `{ style: 6, glow: '#fff2b0', rift: true }`):
| id | name | stats | element | effect |
|---|---|---|---|---|
| u_dawn_whip | 새벽채찍 루미나 | `{ atk: 190, holy: 40, reach: 18, crit: 8 }` | holy | '성녀의 기도 — 신성 피해 +40%, 공격 범위 +18%' |
| u_dawn_sword | 여명검 아우로라 | `{ atk: 196, mag: 60, holy: 35, crit: 10 }` | holy | '첫 햇살 — 신성 피해 +35%, 치명타 확률 +10%' |
| u_dawn_great | 종언대검 오메가 | `{ atk: 250, critDmg: 50, dmgReduce: 6, hp: 120 }` | — | '끝의 무게 — 치명타 피해 +50%, 받는 피해 −6%' |
| u_dawn_dagger | 별똥 단검 스텔라 | `{ atk: 142, crit: 22, critDmg: 45, holy: 30, atkSpd: 12 }` | holy | '떨어지는 별 — 치명타 확률 +22%, 공격 속도 +12%' |
| u_dawn_gun | 창세총 제네시스 | `{ atk: 168, crit: 14, holy: 35, subDmg: 30 }` | holy | '첫 번째 빛 — 신성 피해 +35%, 보조무기 피해 +30%' |
| u_dawn_staff | 새벽의 홀 에오스 | `{ atk: 75, mag: 220, holy: 40, skillDmg: 25, mpRegen: 2 }` | holy | '여명의 여신 — 스킬 피해 +25%, MP 재생 +2/초' |
Exports: `MYTHIC_WEAPONS` = tier-6 mythics only (filter `u.mythic && u.tier === 6`, unchanged behaviour),
new `MYTHIC_WEAPONS_P2` = tier-7 mythics. `loot.js` `mythicDrop(world)` uses P2 when `world.stage?.chapter >= 14`.

### 7.6 Shop
- `chapterTier(ch)`: unchanged up to 13; `ch === 14 → 6`, `ch >= 15 → 7`. `smithStock` `topR`: `ch >= 16 → 3`.
- `ROOK_GOODS` add `['m_stone_4', 14, 1.35]`, `['m_stone_5', 16, 1.4, '한정 입고']`, `['c_elixir', 14, 1.0]` (already
  from 9 — keep one entry), `['m_scroll_protect', 14, 1.1]` (cheaper from 14 — replace the existing multiplier only when
  `chapter >= 14`).
- `ROOK_ACC` add `['a_ring_11', 14], ['a_amulet_11', 14], ['a_ring_13', 16], ['a_amulet_13', 16]`.

---

## 8. Docs (d21–d27) and lore (l21–l34) — `src/data/lore.js` (owner WP-F), text final

```js
d21: D({ id: 'd21', name: '비전서: 경영참', stage: 's14', hint: '거울의 성 — 허상 속에서만 보이는 금 간 벽',
  text: '만경궁의 시녀들이 여제 몰래 익힌 검술. 한 걸음 물러서는 순간 거울 속의 내가 앞으로 나선다. 둘이 동시에 벤다. 어느 쪽이 진짜인지는 베인 자만이 안다.',
  tech: { id: 'tech_mirror', name: '경영참', cmd: ['b', 'b', 'btn:attack'], desc: 'MP 20 · 거울 분신과 함께 앞뒤를 동시에 벤다', window: 0.45, mp: 20 } }),
d22: D({ id: 'd22', name: '비전서: 불굴의 담금질', stage: 's15', hint: '영겁의 용광로 — 사슬 주조장 끝의 식은 화덕 뒤',
  text: '용광로에 끌려온 대장장이가 쇳물로 벽에 새긴 글. "쇠는 불에 들어갈 때마다 약해지지 않는다. 불순물을 태우고 더 단단해질 뿐이다. 나도 그렇다."',
  stats: { def: 12, hp: 80, resFire: 15 } }),
d23: D({ id: 'd23', name: '비전서: 와류참', stage: 's16', hint: '가라앉은 성소 — 진주 회랑 성수반 밑의 벽',
  text: '조수의 사제들이 해류를 다스리던 기도문. 두 번 하늘을 우러른 뒤 칼을 휘두르면 물살이 소용돌이쳐 적을 끌어모은다. 물 밖에서도 된다. 사제들도 이유는 몰랐다.',
  tech: { id: 'tech_whirl', name: '와류참', cmd: ['u', 'u', 'btn:attack'], desc: 'MP 25 · 소용돌이로 적을 끌어모아 연속으로 벤다', window: 0.45, mp: 25 } }),
d24: D({ id: 'd24', name: '비전서: 풍신보', stage: 's17', hint: '폭풍의 공중정원 — 정원 끝 부서진 조각상 받침대',
  text: '날개 없는 백성이 하늘 왕국에서 살아남기 위해 익힌 걸음. 바람을 거스르지 말고 바람의 등에 올라타라. 떨어지는 것은 바람을 믿지 못한 자뿐이다.',
  stats: { jumpPow: 8, moveSpd: 5, agi: 6 } }),
d25: D({ id: 'd25', name: '비전서: 몽중살', stage: 's18', hint: '악몽의 미궁 — 두 번째 문의 미로, 거꾸로 걸린 초상화 아래',
  text: '꿈속에서는 칼이 빗나가지 않는다. 악몽에 먹힌 암살자가 깨어나지 못한 채 적어 내려간 수련서. 마지막 장에는 "깨어나기 싫다"라고만 적혀 있다.',
  stats: { crit: 6, critDmg: 18 } }),
d26: D({ id: 'd26', name: '비전서: 정화의 불꽃', stage: 's19', hint: '썩어가는 숲 — 균사 마을 우물 아래 막힌 벽',
  text: '숲의 드루이드들이 부패를 태우던 성화의 주문. 하늘을 가리키고 앞으로 내디디면 새벽빛 불기둥이 솟는다. 포자도, 썩은 살도, 그 불 앞에서는 재가 된다.',
  tech: { id: 'tech_purge', name: '정화의 불꽃', cmd: ['u', 'f', 'btn:attack'], desc: 'MP 30 · 전방에 신성한 불기둥 · 부패를 크게 덜어 낸다', window: 0.4, mp: 30 } }),
d27: D({ id: 'd27', name: '비전서: 새벽의 맹세', stage: 's20', hint: '태초의 공허 — 꿈과 부패의 기억, 무너진 제단 뒤',
  text: '아무것도 없는 곳에 누군가 손톱으로 새긴 맹세. "빛이 한 점이라도 남아 있는 한, 나는 돌아간다." 서명은 없다. 그러나 글씨체는 이상하리만치 당신의 것과 닮았다.',
  stats: { atk: 15, mag: 15, hp: 100, ultGain: 10 } }),
```
Command safety (verified against the subsequence matcher in `input.command`): none of `[b,b]`, `[u,u]`, `[u,f]`
contains an existing command's direction sequence and none is contained in another; keep these exact sequences.

**New techniques** — `src/game/skills_p2.js` exports `SKILL_IMPL_P2` (must not import `skills.js`; re-implement small
helpers locally; imports allowed: `combat.js`, `projectiles.js`, `entity.js`, `core/*`, `render/hero.js`). `skills.js`
gets one import + `Object.assign(SKILL_IMPL, SKILL_IMPL_P2)` right after `SKILL_IMPL` is defined, and `TECH_NAMES`
adds the three names. Each impl checks and spends its MP (`if (p.mp < cost) { fx.text('MP 부족'); return false; }`).
- `tech_mirror`: 0.25 s iframes; a silver-cyan mirror double (ghost `drawHero`, α 0.6, `lighter`) appears behind the
  hero facing the other way; both slash simultaneously: two hitboxes 170×90 (front and back, feet-relative), mv 2.2,
  hitstop 0.08, shard particles; `sfx('slash_heavy')` + `sfx('mist', { pitch: 1.6 })`.
- `tech_whirl`: vortex centred 140 px ahead for 0.9 s: non-boss enemies within 220 px are pulled toward the centre
  (vx/vy += 900 px/s² × dt, respecting `kbResist`), then 6 hits (every 0.12 s) in radius 110, mv 0.5 each, teal water FX.
- `tech_purge`: holy fire pillar 90×260 at 120 px ahead, 5 hits over 0.6 s, mv 0.7 each, element holy; burns spore
  pods it touches; `world.gimmickOf?.('blight')?.cleanse(50)`.

Lore (`cat` in parentheses):
```js
l21: { id: 'l21', name: '만경궁 시녀의 일기', stage: 's14', cat: 'diary', hint: '거울의 성',
  text: '"여제께서 오늘도 거울을 깨셨다. 깨진 거울마다 여제의 얼굴이 하나씩 늘어난다. 가장 오래된 거울 속의 여제는 아직 웃고 계신데, 그분을 보면 여제께서 비명을 지르신다. 그 거울은 내가 숨겨 두었다."' },
l22: { id: 'l22', name: '거울 속에서 쓴 편지', stage: 's14', cat: 'letter', hint: '거울의 성',
  text: '"이 글을 읽는 당신은 아마 거꾸로 읽고 있을 거예요. 나는 여제의 진짜 얼굴이에요. 그녀가 나를 버렸어요. 공허가 속삭인 날부터 그녀는 아름다운 것만 보고 싶어 했거든요. 부탁해요. 가면을 깨 주세요. — 미라"' },
l23: { id: 'l23', name: '하드윈 1세의 망치 자국', stage: 's15', cat: 'history', hint: '영겁의 용광로',
  text: '모루 위에 망치로 두드려 새긴 글자. "1697년, 성의 대장장이 하드윈. 불타는 소머리 우상에게 끌려왔다. 여기선 쇠 대신 영혼을 두드린다. 나는 두드리지 않았다. 내 손자가 이 글을 본다면, 대장간 불을 꺼뜨리지 마라."' },
l24: { id: 'l24', name: '용광로의 계율', stage: 's15', cat: 'history', hint: '영겁의 용광로',
  text: '"하나, 불은 꺼지지 않는다. 둘, 사슬은 끊어지지 않는다. 셋, 세상을 붙드는 사슬은 몰록만이 벼린다." 누군가 셋째 줄에 줄을 긋고 적어 넣었다. "이제는 세상을 끌어내리는 사슬을 벼린다."' },
l25: { id: 'l25', name: '조수의 사제 서약', stage: 's16', cat: 'history', hint: '가라앉은 성소',
  text: '"우리는 바다의 닻을 지킨다. 성녀 루미나와 까마귀가 이 닻을 내린 날부터." 벽화 속 성녀의 곁에 부리 가면을 쓴 사내가 서 있다.' },
l26: { id: 'l26', name: '다곤 사제왕의 마지막 설교', stage: 's16', cat: 'history', hint: '가라앉은 성소',
  text: '"공허가 수평선을 먹어 들어온다. 형제들이여, 도시를 바다 밑으로 가라앉히자. 빛이 닿지 않는 곳이라면 공허도 우리를 찾지 못하리라." 그 뒤로 얼마나 흘렀을까. 이계의 시간은 이쪽보다 빠르게 흐른다. 빛이 닿지 않는 곳에서, 사제왕은 빛을 잊었다.' },
l27: { id: 'l27', name: '하늘 왕국 연대기', stage: 's17', cat: 'history', hint: '폭풍의 공중정원',
  text: '"지즈의 날개 아래 까마귀 백성이 살았다. 폭풍은 왕국의 담장이었고, 번개는 왕국의 등불이었다. 어느 날 막내 까마귀 하나가 땅 아래 세계를 보겠다며 떠났다. 그는 돌아오지 않았다."' },
l28: { id: 'l28', name: '떠난 까마귀의 쪽지', stage: 's17', cat: 'letter', hint: '폭풍의 공중정원',
  text: '"지즈여, 용서하소서. 저는 성녀와 약속했습니다. 땅 아래 세계가 무너지지 않도록 곁에서 지키겠다고. 왕국의 폭풍이 그리울 겁니다. — 레이븐"' },
l29: { id: 'l29', name: '잠 못 드는 아이의 그림', stage: 's18', cat: 'diary', hint: '악몽의 미궁',
  text: '크레파스로 그린 그림. 침대 위에 팔이 넷 달린 여자가 쪼그려 앉아 있다. 삐뚤빼뚤한 글씨. "엄마가 아니야. 엄마 흉내를 내. 매일 밤 자장가를 불러. 노래가 끝나면 나는 여기로 와."' },
l30: { id: 'l30', name: '악몽 도감: 마라', stage: 's18', cat: 'bestiary', hint: '악몽의 미궁',
  text: '잠든 자의 가슴 위에 올라앉아 숨을 막는 악몽의 정령. 본래는 나쁜 꿈을 대신 먹어 주던 "꿈의 산파"였다. 공허가 그녀의 배를 채워 주지 않자, 그녀는 꿈을 먹는 대신 꿈을 낳기 시작했다.' },
l31: { id: 'l31', name: '드루이드의 마지막 기록', stage: 's19', cat: 'diary', hint: '썩어가는 숲',
  text: '"베헤모스께서 쓰러지셨다. 등에 자란 것은 버섯이 아니다. 저것은 여왕이다. 뿌리로 그분의 척수를 붙들고 춤추게 한다. 숲이 울고 있다. 백록님이 아직 살아 계시다면—"' },
l32: { id: 'l32', name: '괴물 도감: 균사의 여왕', stage: 's19', cat: 'bestiary', hint: '썩어가는 숲',
  text: '공허의 굶주림이 포자가 되어 내려앉은 것. 숙주의 등에 뿌리를 내려 신경을 가로챈다. 숙주가 강할수록 여왕도 강해진다. 여왕을 떼어 내면 숙주는 제 의지를 되찾는다 — 그 의지가 아직 남아 있다면.' },
l33: { id: 'l33', name: '성녀 루미나의 기도', stage: 's20', cat: 'letter', hint: '태초의 공허',
  text: '"까마귀여, 우리가 내린 일곱 닻은 영원하지 않아요. 언젠가 공허가 깨어나면, 우리 둘 중 누군가가 문을 지켜야 할 거예요. 하지만 약속해 줘요. 혼자 남지 않겠다고. 빛은 나누어 가질 때 가장 밝으니까."' },
l34: { id: 'l34', name: '공허와의 대화 (기록자 미상)', stage: 's20', cat: 'history', hint: '태초의 공허',
  text: '"너는 무엇이냐." "나는 너희가 오기 전의 고요. 너희가 떠난 뒤의 고요." "왜 삼키느냐." "시끄럽기 때문이다. 빛도, 노래도, 심장 소리도." 기록은 여기서 끊겨 있다. 마지막 줄만이 남았다. "그렇다면 더 크게 노래하자."' },
```
Placement: l21–l32 as in §4.3; **l33 and l34** go in s20: `r4` gets `@` `lore:l33` on an island (row ≤ 10), `r2` gets
`@` `lore:l34` at its far end. `LORE_ORDER` appends `'l21' … 'l34'` in id order.

---

## 9. Quests (`src/data/quests.js`, runtime `src/game/quests.js`; owner WP-F)

### 9.1 Main
Extend `LV` to `[1, 1, 3, 5, 8, 11, 14, 17, 20, 24, 28, 32, 36, 45, 46, 50, 53, 56, 60, 64, 68]` and `MAIN` with:
```js
['s14', '만경의 여제', '거울의 성 깊은 곳, 만경의 여제 나르키사의 가면을 깨뜨려라.'],
['s15', '꺼지지 않는 불', '영겁의 용광로에서 세상을 끌어내리는 사슬을 벼리는 우상 몰록을 멈춰라.'],
['s16', '심해의 설교', '가라앉은 성소의 사제왕 다곤에게 수면 위의 빛을 되돌려 주어라.'],
['s17', '폭풍의 둥지', '폭풍의 공중정원을 뒤덮은 거신조 지즈를 잠재워라.'],
['s18', '자장가가 끝나면', '악몽의 미궁 가장 깊은 요람에서 마라의 자장가를 멈춰라.'],
['s19', '대지의 짐승', '썩어가는 숲의 짐승 베헤모스를 조종하는 균사의 여왕을 떼어 내라.'],
['s20', '모든 것 이전의 어둠', '태초의 공허로 내려가 니힐과 맞서라.'],
```
Rewards use the existing formula; `m_scroll_protect ×2` for `ch >= 17` too. Requirements: `main14.req = { chapter: 13, flag: 'p2_started' }`,
others `{ chapter: ch − 1 }` (the existing `ch === 13` special case stays).

### 9.2 Side quests (append; `giver`, `req`, `desc`, `goal`, `reward` exact)
```js
side({ id: 'bd_rift', name: '균열 청소부', giver: 'board', req: { chapter: 14 },
  desc: '[까마귀 결사] 균열 너머에서 넘어오는 이계의 마물을 줄여야 한다. 종류를 가리지 말고 500마리를 처치하라.',
  goal: { type: 'killAny', count: 500 }, reward: { gold: 12000, exp: xp(15, 1.2), items: [it('m_stone_6', 3)] } });
side({ id: 'bd_mirror', name: '거울 기사 사냥', giver: 'board', req: { chapter: 14 },
  desc: '[대장간] 거울 기사의 갑주는 최고급 은이다. 12기를 부숴라.',
  goal: { type: 'kill', enemy: 'mirror_knight', count: 12 }, reward: { gold: 8000, exp: xp(15, 1), items: [it('m_stone_6', 2)] } });
side({ id: 'bd_deep', name: '등불 달린 별미', giver: 'board', req: { chapter: 16 },
  desc: '[흑묘 여관 요리부] 심해 아귀 8마리. 머리에 등불 달린 녀석이 그렇게 맛있다는데…',
  goal: { type: 'kill', enemy: 'abyss_angler', count: 8 }, reward: { gold: 9000, exp: xp(17, 1), items: [it('c_elixir', 2)] } });
side({ id: 'bd_storm', name: '폭풍 사냥', giver: 'board', req: { chapter: 17 },
  desc: '[하늘을 잃은 자들] 폭풍 하피와 뇌조를 합쳐 15마리 쓰러뜨려 달라.',
  goal: { type: 'kill', enemy: ['storm_harpy', 'thunder_roc'], count: 15 }, reward: { gold: 10000, exp: xp(18, 1), items: [it('m_scroll_protect', 2)] } });
side({ id: 'bd_combo200', name: '이백 연격', giver: 'board', req: { chapter: 18 },
  desc: '[흑묘 여관 내기판] 전설은 100에서 끝나지 않는다. 200연속 콤보를 보여 줘!',
  goal: { type: 'combo', count: 200 }, reward: { gold: 20000, exp: xp(19, 1), items: [it('m_scroll_bless', 3)] } });
side({ id: 'hd_ember', name: '영겁의 불씨', giver: 'npc_hadwin', req: { chapter: 15 },
  desc: '"용광로의 불씨 열 개. 그 불이라면 이계의 쇠도 벼릴 수 있다." 하드윈의 목소리가 평소보다 낮다.',
  goal: { type: 'collect', item: 'm_ember', count: 10 }, reward: { gold: 6000, exp: xp(16, 1), items: [it('m_stone_6', 4), it('m_scroll_protect', 1)] } });
side({ id: 'hd_plus15', name: '전설의 담금질', giver: 'npc_hadwin', req: { chapter: 16 },
  desc: '"+15. 대장장이가 평생 한 번 볼까 말까 한 경지다. 보여 다오."',
  goal: { type: 'enhance', level: 15 }, reward: { gold: 30000, exp: xp(17, 1), items: [it('m_scroll_protect', 3)] } });
side({ id: 'rk_stars', name: '별의 조각', giver: 'npc_rook', req: { chapter: 15, flag: 'p2_started' },
  desc: '"세계마다 작은 별이 하나씩 숨어 있습니다요. 셋만 모아 보십쇼. 공허를 밝힐 등불이 될지도 모릅니다."',
  goal: { type: 'shards', count: 3 }, reward: { gold: 15000, exp: xp(16, 1), items: [it('c_elixir', 2)] } });
side({ id: 'rk_stars6', name: '새벽의 별', giver: 'npc_rook', req: { chapter: 18, quest: 'rk_stars' },
  desc: '"여섯 조각이 모이면… 천 년 전 그 사람이 말한 별이 뜰 겁니다."',
  goal: { type: 'shards', count: 6 }, reward: { gold: 30000, exp: xp(19, 1), items: [it('m_stone_6', 5)] } });
side({ id: 'el_pearl', name: '진주 묵주', giver: 'npc_elise', req: { chapter: 16 },
  desc: '엘리제가 알베르토 신부님께 진주 묵주를 만들어 드리고 싶어 한다. 심해 진주 다섯 알이 필요하다.',
  goal: { type: 'collect', item: 'm_pearl', count: 5 }, reward: { gold: 5000, exp: xp(17, 0.8), items: [it('c_elixir', 1)] } });
side({ id: 'ab_dawnflower', name: '새벽꽃', giver: 'npc_alberto', req: { chapter: 18 },
  desc: '"썩은 숲 깊은 곳, 세계수 꼭대기에 새벽꽃이 핀다지. 죽기 전에 한 번만 보고 싶구먼."',
  goal: { type: 'collect', item: 'k_dawnflower', count: 1 }, reward: { gold: 3000, exp: xp(19, 1), items: [it('u_alberto', 1)], flags: { dawnflower_given: true } } });
side({ id: 'mt_feast', name: '이계의 만찬', giver: 'npc_marta', req: { chapter: 15 },
  desc: '"용광로 불씨로 고기를 구우면 어떤 맛일까? 불씨 다섯 개만 구해 와 봐!"',
  goal: { type: 'collect', item: 'm_ember', count: 5 }, reward: { gold: 4000, exp: xp(16, 0.8), items: [it('c_meat', 10), it('c_hipotion', 5)] } });
side({ id: 'cm_dreams', name: '꿈속의 얼굴 없는 것들', giver: 'npc_carmilla', req: { chapter: 18, flag: 'carmilla_trust2' },
  desc: '"꿈속에 얼굴 없는 것들이 가득해. 여덟만 치워 줘. 잠 좀 자게."',
  goal: { type: 'kill', enemy: 'faceless', count: 8 }, reward: { gold: 20000, exp: xp(19, 1), items: [it('m_stone_6', 3)] } });
```
Runtime changes (`game/quests.js`): new goal type `shards` (`cur = progress.shards.length`, `need = count`); `sync()`
also sets `flags.hearts_all`/`stars_all` from `progress.hearts/shards` lengths (idempotent); subscribe `'shardFound'`
and `'heartFound'` like `'relicFound'`; `claimQuest` applies optional `reward.flags` (`Object.assign(progress.flags, reward.flags)`);
`rewardText` ignores `flags`. `questProgressText` for `shards`: `별의 조각 n/need`.
Dialogue: `q_<id>_start` (1–2 lines, the giver) and `q_<id>_done` (1–2 lines) for all 13, in `story_p2.js`.
`q_hd_ember_done` must reference his grandfather (“할아버지의 불이다. …고맙다.”); `q_ab_dawnflower_done` is the most
emotional (“허허… 이게 새벽꽃인가. 곱구먼. 정말로 곱구먼.”).
