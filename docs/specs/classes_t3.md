# 초월 · 비전 — tier-3 ascensions, hidden classes, class fixes, trials engine (spec F-CLASSES)

**Status: FROZEN for implementation — 2026-10-08 (merged by the F critic from `fdesign/classes_draft.md`, `systems_draft.md`,
`story_draft.md` and research `plan/fu_a1..a4.md`). Ids, schemas, APIs, hook sites, numbers and file ownership below are binding.
Story content (trial scripts, gap fixes) lives in `docs/specs/story_ext.md`.**

Every file:line was re-checked on 2026-10-08 against the working tree (BM wave uncommitted edits in `hud.js`, `tab_status.js`,
`menu/common.js`, `game.js` were present). **Locate every site by its anchor text** (in backticks); numbers drift by a few lines.

Player-facing text is Korean and is shipped **verbatim** from this document. New glyphs → the lead rebuilds the font subsets once
(`python3 tools/fonts/build_fonts.py`, then `--check`).

---------------------------------------------------------------------------------------------------------------------------

## 0. Decisions

### 0.1 Binding (lead)
1. `hero.classId` stays a `CLASSES` id of tier 0–2. A new hero field `hero.asc` holds an ascension id from the new table
   `src/data/ascensions.js` (`ASCENSIONS`). `CLASSES`, the server `CLASS_INFO`, online submissions (tier-2 `cls`) and every
   exact-id tier-2 perk stay untouched.
2. Tier 3 「초월」 = 28 entries (one per tier-2 class): Lv ≥ 70 + Part 2 ending seen + that hero's Trial Ⅰ cleared.
   Own Σ(mult−1) ∈ [0.15, 0.25], single mult ≤ 1.12, plus small flats. Identity = one signature mechanic.
3. Hidden 「비전」 = 7 entries (one per hero): Trial Ⅱ (needs Trial Ⅰ), Lv ≥ 75, selectable under any of that hero's four tier-2
   classes. Each = signature passive + one exclusive active. Power ≈ tier 3.
4. Church switching is free between the ascensions unlocked for the current tier-2 line (its tier 3, the hidden class, or none).
   The **first** ascension of a hero grants +3 SP once (`hero.ascSp`).
5. Trial progress and unlocks live on the hero (`hero.trials`, `hero.ascUnlocked`) → survive NG+ (NG+ copies heroes,
   `ngplus.js:61`, and wipes flags/quests).
6. No new painted art. Ascensions draw the tier-2 puppet (`look.classId` = tier-2 id) and differ through post-equipment overlays
   (aura, wings, halo, trail, trim, cape lining, scarf, optional tint). Ult tier-3 row; awakening "초월 각성"/"비전 각성".
7. Existing classes: 10 flagged perks fixed + 8 stat-only classes get a modest signature (§6, 18 rows).
8. New passives go through a registry (`src/game/class_perks.js` + four content modules) called from one-line hook sites.
9. Trials = fight trials in existing stage boss rooms, world mode `'trial'` (scene name stays `'stage'`), bracketed by scripts
   from `src/data/story_trials.js`, launched from the church 전직 tab, optional rules via the daily-mods engine.
10. Story supplements: see `story_ext.md`. Achievements stay 67. Gallery theatre stays 8.
11. Arcade class picker comes later (ARCADE-PICKER); this spec only fixes the data contract (§10.3).

### 0.2 Merge decisions taken here (where the drafts disagreed)
| Topic | Chosen | Why |
|---|---|---|
| Tier-3 ids / names / mechanics | classes draft (`kael_grandtemplar` …) | content owner; systems ids were provisional |
| Hidden ids | `kael_sealbearer`, `sera_bellsaint`, `victor_silverwolf`, `bran_oathlord`, `lia_frostcrow`, `azel_dawnblood`, `isolde_dragonbond` | story-fit names from story draft §A.9 where they differ, mechanics from classes draft |
| Hidden skill ids | `asc_<hero>_<word>` | easy to filter, no collision with tree ids (checked against SKILLS/ITEMS/CLASSES: 0 collisions) |
| Hidden active learning | SP-learnable (maxLv 5, 2 SP/lv, Lv 75/77/79/81/83), Lv 1 free on first entering the hidden class | reuses learn/level/equip UI; no special level path in `trySkill` |
| Look overlay field | `look` (pre-equipment) + `lookTop` (post-equipment) | body armour/cloak override class colours (`stats.js:118-123`), so identity must be post-equipment |
| Registry layout | core `class_perks.js` + content `class_perks_a/b/c/d.js`; **hidden actives live in the same content module as their hero** (`ACTIVES_X`), no `skills_asc.js` runtime file | disjoint ownership per hero group; avoids a `skills.js` import cycle (§3.5) |
| Kit access in perk modules | `K` object filled by `bindPerkKit(FXKIT)` at the end of `skills.js`; perk modules never import `skills.js` | TDZ-safe whichever module loads first |
| Trial start gate | current-cycle `flags.p2_done` (strict) + optional `reqFlag` (side chapter, past cycles count via `ng.past.flags`); ascending/switching uses the loose `p2Cleared` (also true in NG+ cycles) | the trial scripts assume the post-Part-2 town |
| Trial mods | story table (story_ext §2) with one change: `hp_x1.5` replaced by `diffOver.bossHp 1.25` (Death/Dracula are two-form fights); Victor Ⅱ uses `glass` without `no_potion` | fight-length band 40–75 s |
| Awakening tier-3 numbers | `T3_BOOST` rules (§7.2) with explicit per-entry numbers | one rule, testable bounds |
| Alberto in Part 2 | hidden from the hub from `p2_started` + church row 「안쪽 방 — 신부님」 that emits `npcTalk` (keeps `el_letter`/`ab_dawnflower` working); Elise keeps the church in Part 2 | bedridden canon (`story_p2.js:116`); the draft's plain hide would have broken Alberto's quests |

### 0.3 Cut or simplified (versus the drafts)
- **TUNE template perk strings** (generated text) — cut. Static strings here; numbers in each module's `N` table; review checks.
- **`lia_umbra` live `drawHero` clones** — cut; clones are cached silhouettes (`K.ghostOf`, the awakening clone pool) + slash FX.
- **Kael crusader "main hit holy" (option B)** and **oracle stat change** — not done; text made true instead (balance-neutral).
- **Online `asc` field** (`arcade_run.js:284`, `online.js:200` `cleanResult`) — deferred to ARCADE-PICKER (no consumer yet).
- **Per-hero class-change lines**, **credits "메아리 속의 이름들"** — cut (story_ext §0).
- **Separate `skills_asc.js` runtime module**, **`hero.ascSlot` restore of a displaced skill on a full bar** — kept simpler:
  the hidden active goes to the first empty slot, else replaces slot index 3 and remembers it in `hero.ascSlot` (one field).
- **Systems draft `classChanged`-only wiring for perk memo** — kept, plus one new event `ascChanged`.
- **Hidden-class puppets** — not required. Forward hook only: if the lead's later Kling batch adds `PUPPETS[charId][hiddenId]`,
  `classOf` picks it automatically (§2.7), zero other code.

---------------------------------------------------------------------------------------------------------------------------

## 1. Hero fields, save, NG+, compatibility

### 1.1 New hero fields (all optional; `newHero` at `progression.js:52-60` adds the defaults)
```js
hero.asc         = 'kael_grandtemplar' | null        // active ascension
hero.ascUnlocked = ['kael_grandtemplar', ...]        // unlocked ascension ids (healed from trials on load)
hero.trials      = { tr_kael_1: { done: true, at: 1730000000000, best: 52.4, tries: 3 } }
hero.ascSp       = true                              // first-ascension +3 SP granted
hero.ascSlot     = { i: 3, prev: 'kael_tempest' } | null   // slot displaced by the hidden active (restored when leaving it)
```

### 1.2 `migrateState` (`state.js`, right after the anchor `if (!CLASSES[h.classId] || CLASSES[h.classId].charId !== id) h.classId = ch.rootClass;`)
Idempotent `migrateAsc(h, id, s)` (lives in state.js; imports `ASCENSIONS`, `TRIALS`):
1. `h.trials` not an object → `{}`; drop keys not in `TRIALS` or with another `charId`; normalise each to
   `{ done: !!v.done, at: finite|0, best: finite>0|null, tries: int≥0 }`.
2. `h.ascUnlocked` → unique strings with `ASCENSIONS[x]?.charId === id`, **unioned** with ids derived from done trials
   (`unlocksOf(tid)`), so a save that lost the list heals.
3. `h.asc` → `null` if unknown, other hero, `!A.parents.includes(h.classId)`, or (`!s.arcade` and not in `ascUnlocked`).
4. `h.ascSp = !!h.ascSp`; `h.ascSlot` → `null` unless `{i:0..3, prev: string|null}`.
`SAVE_VERSION` is **not** bumped (unknown fields survive older clients; `state.js:131-133` contract).

### 1.3 Old app / cloud / server
- Old APK + new save: `classId` is a valid tier-2 id → kept; `asc/ascUnlocked/trials/ascSp/ascSlot` survive (`migrateState`
  edits heroes in place, `save.js` writes plain JSON). The old app plays the tier-2 class; the ascension returns on the new app.
- Known old-app quirk (accepted): an old `resetSkills` refunds `asc_*` skill levels it does not know (≤ 10 SP once).
  `migrateAsc` re-grants Lv 1 of an unlocked hidden skill if it is missing.
- Server: `CLASS_INFO` unchanged, `isValidSave` ignores hero extras, `test_online.mjs:105` equality unchanged. No deploy.
- Client summaries: `saves.list()` (`save.js` ~343) and `cloud.js summarize` (~266) add `asc: hero?.asc ?? null`;
  `slots.js:113` / `cloud_ui.js:127` show `ascName(asc) ?? CLASSES[classId].name`.

### 1.4 NG+
`startNgPlus` deep-copies heroes → asc fields carry over; flags are wiped. `p2Cleared` therefore also accepts `ng.n > 0`.
Trial completion never uses `progress.flags`/`seenScripts`. Starting a trial (first clear or replay) needs current-cycle
`p2_done` (§9.1).

---------------------------------------------------------------------------------------------------------------------------

## 2. Data modules and APIs

### 2.1 `src/data/ascensions.js` (new; pure data + pure helpers; imports only `./classes.js`)
```js
// A[id] = {
//   id, charId, kind: 't3' | 'hidden',
//   parent: '<tier-2 id>' | null,            // t3 only
//   parents: ['<tier-2 id>', ...],           // t3: [parent]; hidden: the hero's 4 tier-2 ids (filled at load from CLASSES)
//   name, eng, desc, perk,                   // verbatim Korean from §4/§5
//   reqLevel: 70 | 75, trial: 'tr_<hero>_1' | 'tr_<hero>_2',
//   mult: {stat: k}, flat: {stat: n},        // §2.8 budget
//   look: { armorColor?, cape? },            // chain order (before equipment)
//   lookTop: { aura?, wings?, halo?, trailColor?, armorTrim?, capeColor2?, scarf?, tint?, wingCol? },   // after equipment
//   ult: { accent: '#rrggbb', colors: [c0, c1, c2] },
//   awaken: { label, desc, ...numeric overlay over T2[classId] },   // t3 only; hidden uses T3_BOOST(T2[current tier-2])
//   skill: 'asc_<hero>_<word>',              // hidden only
//   arcade: { lv: 80 | 85 },                 // preset level for ARCADE-PICKER (§10.3)
//   est: { dps, ehp },                       // design estimate for balance.mjs --asc
// }
export const ASCENSIONS;   // frozen
export const ASC_IDS;      // per hero: 4 × t3 in CLASSES order, then hidden
export const T3_OF;        // tier-2 id → t3 id
export const HIDDEN_OF;    // charId → hidden id
export const TIER_NAMES = ['기본 직업', '상급 직업', '최상급 직업', '초월'];
export const KIND_LABEL = { t3: '초월', hidden: '비전' };
export const ASC_REQ = Object.freeze({ t3Level: 70, hiddenLevel: 75, firstSp: 3 });
export function ascOf(hero)        // valid entry or null: A=ASCENSIONS[hero?.asc] && A.charId===hero.charId && A.parents.includes(hero.classId)
export function heroKey(hero)      // `${hero.classId}|${hero.asc ?? ''}` — cache keys (perks memo, ult prepare, previews)
export function heroTier(hero)     // ascOf(hero) ? 3 : CLASSES[hero.classId]?.tier ?? 0
export function heroChain(hero)    // [...classChain(hero.classId), ascOf(hero)].filter(Boolean) — stats/look loops
export function classNameOf(hero)  // ascOf(hero)?.name ?? CLASSES[hero.classId]?.name ?? ''
export function classEngOf(hero)   // ascOf(hero)?.eng ?? CLASSES[hero.classId]?.eng ?? ''
export function tierLabelOf(hero)  // ascOf(hero) ? KIND_LABEL[kind] : TIER_NAMES[tier]
export function ascName(id)        // ASCENSIONS[id]?.name ?? null
export function ascListFor(classId)  // [T3_OF[classId], HIDDEN_OF[charId]] (only when classId is tier 2), else []
export function ascListOf(charId)    // all 5 of a hero
export function unlocksOf(tid)       // trial → ids it unlocks (Ⅰ: the hero's 4 t3; Ⅱ: the hidden id)
export function p2Cleared(state)     // F.p2_done || F.ending_p2 || F.ending_p2true || (!state.arcade && Number.isInteger(state.ng?.n) && state.ng.n > 0)
export function flagEver(state, f)   // !!state.progress.flags[f] || !!state.ng?.past?.flags?.[f]
```

### 2.2 `src/data/trials.js` (new; pure data)
```js
export const TRIALS = { tr_kael_1: { id, charId, n: 1|2, name, desc, stage, room: 'boss', reqLevel: 70|75, level: 74|80,
  recLv: 72|78, mods: [...], diffOver: {bossHp?} | null, bossPatterns: bool, reqFlag?: 'ex_s2x_done', reqText?: '…',
  pre, win, preAgain: 'tr_again_pre', winAgain: 'tr_again_win', bg, music, failLine, unlock: 't3'|'hidden' }, … 14 };
export const TRIAL_IDS; export function trialsOf(charId);   // [Ⅰ, Ⅱ]
```
The 14 rows (names, bosses, mods, flags, strings) are in `story_ext.md` §2 and are copied verbatim.
Constraints (tested): `STAGES[stage].rooms.boss` exists and the boss is the room's native boss; `mods ⊂ DAILY_MODS` keys and
never `'dark'`; `level ≥ reqLevel`; script ids exist in `SCRIPTS`.

### 2.3 `src/data/skills_asc.js` (new; pure data, no imports) + merge in `data/skills.js`
`export const ASC_SKILLS = [ {id, charId, name, type:'active', maxLv:5, reqLevel:75, spCost:2, reqAsc:'<hidden id>', cost, cd,
color, v:{…}, desc}, … ×7 ]` (values §5). `data/skills.js` end: `for (const s of ASC_SKILLS) SKILLS[s.id] = { req: [], branch: 'asc', row: 0, ...s };`
- `canLearn` (anchor `export function canLearn`): after the charId check, `if (sk.reqAsc && !hero.ascUnlocked?.includes(sk.reqAsc)) return { ok:false, reason:'비전 해금 필요' }`.
  Level rule unchanged (`reqLevel + cur*2` → 75/77/79/81/83).
- `equipSkill`: refuse (`false`) when `sk.reqAsc && hero.asc !== sk.reqAsc`.
- `resetSkills`: free = 1 also for an unlocked hidden skill; after the reset re-add `hero.skills[A.skill] = 1` for the unlocked
  hidden skill and slot it if `hero.asc` is that hidden class.
- Glyph: `drawSkillGlyph` default from `sk.color` (no icon art).

### 2.4 Progression API (`src/game/progression.js`; imports `ASCENSIONS…` from ascensions.js, `TRIALS` from trials.js)
```js
export function trialStatus(hero, tid, state)   // → { state: 'locked'|'ready'|'done', reason, code }
export function canStartTrial(hero, tid, state) // → { ok, reason, code }  checks in order:
  //  'unknown' | 'hero' | 'tier' ('최상급 직업에서만 도전할 수 있다') | 'p2' ('2부의 결말을 본 뒤에 열린다' — current-cycle flags.p2_done)
  //  | 'story' (T.reqText; only while not yet done; flagEver(state, T.reqFlag)) | 'prev' ('시련 Ⅰ을 먼저 넘어야 한다')
  //  | 'level' (`레벨 ${T.reqLevel} 필요`)                  — done trials replay with ok:true (same gates except 'story')
export function availableAscensions(hero, state)  // → [{ asc, chk }] for ascListFor(hero.classId)
export function canAscend(hero, id, state)        // → { ok, reason, code, trial? }
  //  'unknown' | 'hero' | 'tier' | 'line' ('이 계보의 길이 아니다') | 'current' ('이미 이 길을 걷고 있다')
  //  | 'p2' (p2Cleared) | 'trial' (`「${T.name}」을 넘어야 한다`, trial: tid) | 'level' (`레벨 ${A.reqLevel} 필요`)
export function unlockFromTrial(hero, tid)        // push unlocksOf(tid) into ascUnlocked; returns the newly added ids
export function ascend(hero, id, state)           // first ascension or switch → { ok, first, sp }
export function switchAsc(hero, id | null, state) // null → plain tier 2 (free)
```
`ascend`: (1) `canAscend`; (2) `prev = hero.asc; hero.asc = id`; (3) first time: `hero.sp += 3; hero.ascSp = true`;
(4) hidden skill: entering a hidden asc → `hero.skills[A.skill] ||= 1`, slot into the first empty slot, else slot 3 with
`hero.ascSlot = {i:3, prev}`; leaving a hidden asc → remove `A.skill` from `hero.slots`, restore `ascSlot.prev`, clear `ascSlot`;
(5) `bus.emit('ascChanged', {charId, classId, asc: id, prev, first})` then `bus.emit('classChanged', {charId, classId, asc: id})`.
`changeClass` adds `hero.asc = null` (defensive).

### 2.5 Events (`core/events.js` doc lines)
| event | payload | listeners |
|---|---|---|
| `classChanged` (existing) | `{charId, classId, asc}` | skills.js prewarm · awaken directors PREP reset · ultfx `PREP.key = null` · achievements (unchanged result) |
| `ascChanged` (new) | `{charId, classId, asc, prev, first}` | class_perks memo clear · church ceremony. **Not** in `ACH_EVENTS` |
| `ultimateCast` | add `asc` | perks `onUlt` |
| `awakenCast` | add `asc` | perks `onAwaken` |

### 2.6 Stats (`src/game/stats.js`)
- `computeStats`: `for (const cls of classChain(hero.classId))` → `for (const cls of heroChain(hero))` (asc entries carry `flat/mult`).
- 「초월 보정」 (anchor `s.crit = Math.min(75, s.crit + s.luck * 0.1);`): compute `rc`/`ra` raw first, cap as today, then
  `if (ascOf(hero)) { s.critDmg += Math.min(20, Math.max(0, rc - 75) * 1.5); s.moveSpd += Math.min(8, Math.max(0, ra - 80) * 0.5); }`.
- `composeLook`: same chain replacement; after the chain loop `look.classId = hero.classId; look.asc = ascOf(hero)?.id ?? null;`;
  after the equipment loop (before `const w = look.equip.weapon`) `applyLookTop(look, ascOf(hero)?.lookTop)` — whitelist keys only;
  `capeColor2` patches `look.cape.color2` only if a cape exists; `armorTrim` overrides the equipment trim.
- `export function lookForAsc(state, hero, id)` → `composeLook(state, {...hero, asc: id})` (previews; never mutate the hero).

### 2.7 Puppet (`src/render/hero_puppet.js`)
| site | change |
|---|---|
| new `artClass(cid, cls)` | `PUPPETS[cid]?.[cls] ? cls : walk CLASSES[cls].parent until PUPPETS has it` (memo); `ASCENSIONS[cls]` → `parents[0]` |
| `classOf` (anchor `if (look.classId) return look.classId;`) | `if (look.asc && PUPPETS[cid]?.[look.asc]) return look.asc;` (forward hook for future hidden puppets) then `if (look.classId) return artClass(cid, look.classId);`; fingerprint loop skips ids without `PUPPETS[cid][id]` |
| `entry` (first line) | `cls = cid === NPC_CID ? cls : (artClass(cid, cls) ?? cls)` |
| `preloadPuppet` / `hasPuppet` | resolve through `artClass` |
| `variantKey` | add tint: key `${ac||'-'}|${tc||'-'}|${look.armor||'-'}|${tn||'-'}`; `''` only when none |
| `makeVariant` / `recolorCanvas` | parse 4th field → `V.tint = {h, s}`; before `g.drawImage(src,0,0)`: `if (V.tint && 'filter' in g) g.filter = \`hue-rotate(${h}deg) saturate(${s})\``; reset to `'none'` after the draw (mask recolour runs on tinted pixels); same in the turntable recolour path |
| `hero_parts.js:721` (anchor `WING_COL[type]`) | `const C = K.L?.wingCol ?? WING_COL[type];` (used by 2 hidden entries) |
No new canvases after stage start (variants bake at first draw from the spare pool of 12, as today).

### 2.8 Power budget (tested)
- Own `Σ(mult−1)` ∈ [0.15, 0.25]; each mult ≤ 1.12 (all entries below use ≤ 1.10).
- Flats per entry ≤: `crit 8, critDmg 25, dmgReduce 8, lifesteal 3, atkSpd 12, cdr 10, moveSpd 8, hpRegen 2, mpRegen 2,
  skillDmg 12, element dmg 25, reach 10, jumpPow 10, luck 10`. Chain `dmgReduce` ≤ 45 (bastion chain = 40).
- Signature target ≈ +5–10 % sustained dps or equivalent survivability (QA measures, §11).

---------------------------------------------------------------------------------------------------------------------------

## 3. Perk registry

### 3.1 Modules
| file | owner | content |
|---|---|---|
| `src/game/class_perks.js` | HOOKS | registry core, kit binding, shared helpers, PerkLayer, `PERK_STATS` |
| `src/game/class_perks_a.js` | PERKS-A | `PERKS_A` (kael, sera: fixes, signatures, 8 t3, 2 hidden passives) · `ACTIVES_A` (2 hidden actives) · `MARKS_A` |
| `src/game/class_perks_b.js` | PERKS-B | victor, bran — same shape |
| `src/game/class_perks_c.js` | PERKS-C | lia, azel — same shape |
| `src/game/class_perks_d.js` | PERKS-D | isolde — same shape |
Content modules import **only** `./class_perks.js` and data modules. They never import `skills.js`, `player.js`, `world.js`.

### 3.2 Entry shape (key = CLASSES id or ASCENSIONS id or `char:<charId>` for tier-0/hero-wide perks)
```js
{ only?: true,                    // default: a tier-0/1 entry also applies to its descendants and their ascensions
  N?: { … },                      // every tunable number (balance edits in one place)
  dmgMul(p,w)->k · speedMul(p)->k · atkSpdMul(p)->k · healMul(p)->k · dashMul(p)->k (scales dashSpeed)
  tick(p,w,dt) · onEnter(p,w) · prewarm(w,p)
  onSwing(p,w,mv)                 // after the legacy __onSwing (fresh shots exist)
  onAttack(p,atk,tgt,w) -> {mult?, crit?, flat?, element?, executed?} | void   // non-proc player attacks only
  onHit(p,tgt,info,atk,w)         // player-owned, non-guardian, NON-proc hits only
  onKill(p,e,atk,w)               // every kill credited to the player (proc kills included)
  onHurt(p,dmg,atk,w) -> number | false | {dmg?, armor?} | void   // before damage; false = negated (no hurt, combo kept)
  onDodge(p,w,atk)                // kunoichi evade succeeded
  afterHurt(p,dmg,atk,w)          // after playerHurt
  onLethal(p,atk,w) -> true|void  // true = survived (hook sets hp itself); runs before the saint check
  onOverheal(p,over,w)            // heal amount that exceeded max HP
  keepCombo(p,dmg) -> true|void   // true = this hit does not end the combo
  onDash(p,w) · onDashEnd(p,w) · onJump(p,w,air) · onLand(p,w,fallPx)
  onPound(p,w,r,fallPx,pk) -> {r?, element?, color?} | void        // merged over the legacy __onPound result pk
  onSkill(p,w,skillId) · onUlt(p,w) · onAwaken(p,w)
  drawMeter(ctx,p,w)              // drawn by PerkLayer (player meters/pips)
}
MARKS_X = { markKey: (ctx, e, n, k, t) => {...} }   // PerkLayer draws enemy marks; k = remaining fraction
ACTIVES_X = { asc_<hero>_<word>(p, w, lv) { ... return true|false } }
```

### 3.3 Core API (`class_perks.js`)
```js
export const K = {};                        // kit — filled by bindPerkKit; use only inside hook bodies
export function bindPerkKit(kit)            // Object.assign(K, kit) — called once at the end of skills.js
export function perksOf(hero)               // memo by heroKey(hero) → frozen { key, ids, tick:[fn..], onHit:[..], … } (arrays only for present hooks)
                                            //   ids = classChain root→tier-2 (+ 'char:<id>' first, + asc last); `only` entries apply only when id === classId or === asc
export function firePerks(list, ...a)       // try/catch per fn, reportOnce; no allocation
export function perkMul(list, ...a)         // Π of finite positive returns (missing list → 1)
export function perkAny(list, ...a)         // true if any returns true
export function perkHurt(list, p, dmg, atk, w)   // fold: false short-circuits; number replaces dmg; {dmg, armor} merges → {dmg, armor} | false | null
export function perkAttack(list, p, atk, tgt, w) // fold mult(×) crit(+) flat(max) element(last) executed(any) → new attack or same
export function perkPound(list, p, w, r, fall, pk) // returns { ...pk, ...each non-null result } or pk
export function ascActive(id)               // ACTIVES_A..D merged lazily
export const PERK_STATS = { calls, ms, errors }
// helpers for content modules
export function procAtk(p, o)               // {owner:p, team:'player', stats:p.stats, mv, type:o.type??'phys', element, dir:p.facing, kb:o.kb??[80,-60],
                                            //  hitstop:0, shake:o.shake??0, hitId:'pk'+(++n), tags:o.tags??['melee'], proc:true, crit:o.crit??0, mult:1, breakWalls:false, stun:o.stun}
export function procStrike(w, p, rect, o)   // playerStrike(w, rect, procAtk(p,o)) → hits
export function mark(e, key, t, add=1, max=99) / markOf(e,key) / unmark(e,key,n=Infinity)   // e._ck[key]={n,until}; Set of marked enemies for PerkLayer
export function icd(obj, key, sec, w)       // true = ready (and starts the cooldown); world-time based
export function slowEnemy(e, mul, t, w)     // refresh-only update wrapper (technique of awaken_directors.js `function slowFoes`), restores on expiry/death
export function shieldAdd(p, amt, cap) / shieldAbsorb(p, dmg) / shieldOf(p)   // p._shield (bran_guardian, azel_bloodking)
export function perkState(p)                // p._pk ??= {} (Player is rebuilt each stage)
```
Registry build is lazy (`REG ??= {...PERKS_A, ...PERKS_B, ...PERKS_C, ...PERKS_D}` inside `perksOf`). Bus subscriptions
(`ultimateCast`→onUlt, `awakenCast`→onAwaken, `ascChanged`/`classChanged`→memo clear, `stageEntered`/`roomEntered`→onEnter +
idle prewarm + PerkLayer attach) are made by `ensureBus()` on the first `perksOf` call, never at module top.

### 3.4 Hook sites (HOOKS; one line each)
Player caches `this.perks = perksOf(this.hero)` in `refreshStats()` right after the anchor `this.look = composeLook(this.state, this.hero);`.
Each site does nothing when the list is absent.

| hook | file (anchor) | line to add |
|---|---|---|
| speedMul / atkSpdMul | player.js `get speedMul()` / `get atkSpeedMul()` | `* (this.perks?.speedMul ? perkMul(this.perks.speedMul, this) : 1)` (same for atkSpdMul) |
| dmgMul | player.js `get dmgMul()` before `return m;` | `if (this.perks?.dmgMul) m *= perkMul(this.perks.dmgMul, this, this.world);` |
| tick | player.js `tickTimers(dt, world)` end (after the holy-aura block) | `if (this.perks?.tick) firePerks(this.perks.tick, this, world, dt);` |
| onDashEnd | player.js anchor `this.lastDashEnd = this.t; dashFx?.(this, world, 'end');` | append `if (this.perks?.onDashEnd) firePerks(this.perks.onDashEnd, this, world);` |
| onLand | player.js anchor `onLand?.(this, world, vyBefore, Math.max(0, this.y - (this.apexY ?? this.y)))` | same guard: `if (!this.mount?.riding && this.perks?.onLand) firePerks(this.perks.onLand, this, world, Math.max(0, this.y - (this.apexY ?? this.y)));` |
| dashMul / onDash | player.js `startDash(ax, world)` | after `this.dashSpeed = …`: `if (this.perks?.dashMul) this.dashSpeed *= perkMul(this.perks.dashMul, this);` · end of startDash: `if (this.perks?.onDash) firePerks(this.perks.onDash, this, world);` |
| onJump | player.js anchors `onJump?.(this, world, 'wall');` and `onJump?.(this, world, air);` | append `if (this.perks?.onJump) firePerks(this.perks.onJump, this, world, air /* or 'wall' */);` |
| onPound | player.js `groundPound(world, r)` anchor `const pk = SKILL_IMPL.__onPound?.(` | next line: `const fall = Math.max(0, this.y - (this.apexY ?? this.y)); const pk2 = this.perks?.onPound ? perkPound(this.perks.onPound, this, world, pk?.r > 0 ? pk.r : r, fall, pk) : pk;` and use `pk2` below |
| onSwing | player.js anchor `SKILL_IMPL.__onSwing?.(this, world, mv);` | `if (this.perks?.onSwing) firePerks(this.perks.onSwing, this, world, mv);` |
| rules label | player.js anchor `'오늘의 도전 규칙: 보조 무기를 쓸 수 없다'` · inventory.js anchor `'오늘의 도전 규칙: 물약을 쓸 수 없다.'` | prefix `${w.rules?.label ?? '오늘의 도전 규칙'}:` |
| reqAsc guard + onSkill | player.js `trySkill` | after `if (!sk \|\| !lv) return;`: `if (sk.reqAsc && this.hero.asc !== sk.reqAsc) { this.game.toast('비전 직업일 때만 쓸 수 있다', '#c8a0ff', 1.4); return; }` · inside `if (castSkill(…)) {`: `if (this.perks?.onSkill) firePerks(this.perks.onSkill, this, world, skillId);` |
| onHurt | player.js `takeHit` after `if (this.invuln) return false;` | `let armorPk = false; const ph = this.perks?.onHurt ? perkHurt(this.perks.onHurt, this, dmg, attack, world) : null; if (ph === false) return false; if (ph) { dmg = ph.dmg; armorPk = !!ph.armor; }` then `armored` (anchor `const armored = this.superArmor > 0`) gets `\|\| armorPk` |
| onDodge | player.js kunoichi branch, before `return false;` | `if (this.perks?.onDodge) firePerks(this.perks.onDodge, this, world, attack);` |
| afterHurt | player.js anchor `bus.emit('playerHurt', { amount: dmg });` | `bus.emit('playerHurt', { amount: dmg, attack }); if (this.perks?.afterHurt) firePerks(this.perks.afterHurt, this, dmg, attack, world);` |
| onLethal | player.js first line inside `if (this.hp <= 0) {` (before the saint block) | `if (this.perks?.onLethal && perkAny(this.perks.onLethal, this, attack, world)) return true;` |
| healMul / onOverheal | player.js `heal(amount, showText = true)` | after the gimmick line: `if (amount > 0 && this.perks?.healMul) amount *= perkMul(this.perks.healMul, this);` · after `got`: `if (this.perks?.onOverheal && amount - (this.hp - before) > 0.5) firePerks(this.perks.onOverheal, this, amount - (this.hp - before), this.world);` |
| onAttack + holy clamp | combat.js anchor `attack = classPerkAttack(attack, target, world);` (same if) | `if (!attack.proc && attack.owner.perks?.onAttack) attack = perkAttack(attack.owner.perks.onAttack, attack.owner, attack, target, world);` · `perkAttack` `flat` → `attack.flat` (execute) |
| holy resist 100 (C10) | combat.js anchor `clamp(ts['res' + el[0].toUpperCase() + el.slice(1)], -100, 80)` | upper bound `r >= 100 ? 100 : 80` (only the holyblade line reaches 100) |
| onHit | world.js `onPlayerHit` after `this.style?.onHit?.(info, attack, target);` | `if (!guardian && attack?.owner === p && !attack.proc && p.perks?.onHit) firePerks(p.perks.onHit, p, target, info, attack, this);` |
| onKill | world.js `onEnemyKilled` anchor `if (this.hero.classId === 'lia_reaper')` | `if (p.perks?.onKill && attack?.owner === p) firePerks(p.perks.onKill, p, e, attack, this);` |
| keepCombo | world.js `onPlayerHurt` anchor `if (this.combo.n > 0) this.endCombo();` | `if (this.combo.n > 0 && !(this.player?.perks?.keepCombo && perkAny(this.player.perks.keepCombo, this.player, dmg))) this.endCombo();` |
| asc active fallback | skills.js `castSkill` anchor `const fn = SKILL_IMPL[id];` | `const fn = SKILL_IMPL[id] ?? PERK.ascActive(id);` |
| kit | skills.js after `Object.assign(FXKIT, {…});` | add to the FXKIT list `featherRenderL, featherRenderD, batRender, shurikenRender, daggerRender, tipOf, ISO_BOLT`; then `PERK.bindPerkKit(FXKIT);` |

Imports: player.js and world.js `import { perksOf, firePerks, perkMul, perkAny, perkHurt, perkPound } from './class_perks.js'`;
combat.js `import { perkAttack } from './class_perks.js'`; skills.js `import * as PERK from './class_perks.js'`.
All existing exact-id perk code stays (classId is tier 2). Do **not** convert it to `inChain` in this phase.

### 3.5 Import-cycle rule
`skills.js → class_perks.js → class_perks_x.js → class_perks.js` and `combat.js ↔ class_perks.js` are cycles. Therefore:
no module in them reads an imported binding at module top level; `class_perks*.js` never import `skills.js`
(the kit arrives through `bindPerkKit`); `combat.js` and `class_perks.js` use each other only inside functions.
`tools/test_perks.mjs` imports each content module **first and alone** in a fresh node process to prove TDZ safety.

### 3.6 Rules for perk code (review + `test_perks.mjs` static scan)
1. Every attack a perk creates is a proc (`procAtk`/`procStrike`, or `atk.proc = true`) — except Nephilim feathers (§4.6), which
   are real attacks by design. Hitstop 0 except release moves (≤ 0.08, ≥ 1.5 s apart).
2. No `bus`/`game` access at module top; no `document.createElement`; no `create*Gradient` (use `K.glow`/`K.beamH`/`K.beamV`
   cached sprites, prebaked in `prewarm`, ≤ 2 new colours per entry).
3. Particles × `w.fx.quality`; ≤ 12 per proc; ICD ≥ 0.25 s for any proc spawning > 4 particles; proc damage numbers ≤ 3/s.
4. `tick` is O(1) when idle; enemy scans ≤ every 0.2 s (`icd(p,'scan',0.2,w)`); never in draw. No `Math.random` in draw.
5. All numbers in the module's `N` table; perk strings in ascensions.js/classes.js must match them.
6. Throwing hooks are skipped after one logged error (`PERK_STATS.errors`).

### 3.7 PerkLayer (core)
One `SkillFx` per world (`life: Infinity`, z 9), attached on `stageEntered`/room load. Iterates the marked-enemy Set (drops
dead/expired), draws ≤ 24 marks via `MARKS_*[key]` with cached `K.glow` sprites + ≤ 3 strokes, and calls `drawMeter` of the active
hero's entries. Budget < 0.05 ms at 24 marks.

---------------------------------------------------------------------------------------------------------------------------

## 4. Tier 3 「초월」 — 28 entries (Lv ≥ 70 · Part 2 cleared · hero Trial Ⅰ)

Legend: **M** own mult (Σ) · **F** flats · **Top** `lookTop` · **Ult** accent / flourish colours · **Aw** awakening overlay
(label · desc · numbers over the parent `T2`) · **est** design estimate (signature dps × / ehp ×). `look` (pre-equipment) is only
listed where used. `perk` and `desc` are shipped verbatim.

### 4.1 Kael (whip)

#### `kael_grandtemplar` 성전 기사단장 · GRAND TEMPLAR ← `kael_templar`
- desc `성전 기사단을 이끄는 방패. 받은 상처를 빛으로 되갚는다.`
- perk `받는 피해 -5%. 적에게 받은 피해만큼 성광이 쌓인다(최대 HP의 30%까지). 성광이 최대 HP의 5% 이상이면 마무리 공격 때 모두 터뜨려 채찍 끝 반경 150을 타격한다(위력 100~300%, 쌓인 양에 비례, 1.5초에 한 번).`
- M `hp 1.10, def 1.08` (0.18) · F `dmgReduce 5, holy 15`
- 「성광 응보」: `afterHurt`: `atk.team==='enemy' && !atk.flat` → `_bw = min(0.30·maxHp, _bw + dmg)`. `onSwing`: `mv.finisher && !mv.skill && _bw ≥ 0.05·maxHp && icd(1.5)` →
  `k=_bw/(0.30·maxHp)`; `K.boom(w,p,tip.x,tip.y,150,{mv:1+2k, element:'holy', c1:'#ffd84a', c2:'#fff8e0', shake:3+3k, hitstop:0.04, sfx:'holy', atk:{tags:['melee'],proc:true}})`; callout `성광 응보!`; `_bw=0`. `tick`: k ≥ 0.5 → 1–3 holy motes / 0.3 s. `onEnter`: `_bw=0`.
- look `armorColor '#eef0f8', cape {color:'#f4f0e4', color2:'#c8102a', len:1.25}` · Top `aura {type:'holy', color:'#ffe080'}, halo, armorTrim '#ffd84a', capeColor2 '#c8102a', trailColor '#fff0a0'`
- Ult `#ffe080` / `['#ffd84a','#fff8e0','#c8102a']` · Aw `성전 기사단의 방패` · `방패 인장이 새겨지고 체력을 15% 회복한다.` · `heal 0.15`
- est 1.05 / 1.18

#### `kael_highinquisitor` 화형 심판장 · HIGH INQUISITOR ← `kael_inquisitor`
- desc `이단의 이름을 불길로 새기는 심판장.`
- perk `채찍 끝 성화 폭발에 맞은 적에게 낙인(최대 3중첩, 4초). 3중첩이 되면 1.5초 동안 화형 — 0.25초마다 위력 30% 화염 피해 6회. 같은 적은 5초(보스 8초)에 한 번.`
- M `atk 1.10, hp 1.06` (0.16) · F `fire 15, holy 10`
- 「이단의 낙인」: HOOKS adds `'inq'` to the tags of the inquisitor tip boom (skills.js anchor `if (c === 'kael_inquisitor') {` → `atk: { tags: ['melee','inq'], … }`). `onHit` sees that boom only if it is non-proc (it is). `onHit`: `atk.tags.includes('inq')` → `n = mark(tgt,'brand',4,1,3)`; `n===3 && icd(tgt,'pyre', boss?8:5) && livePyres<6` → `unmark`, pyre SkillFx `life 1.5`, every 0.25 s `procStrike(w,p,inflate(hb,10),{mv:0.3, element:'fire', kb:[0,-40]})`; draw 3 stacked glow sprites `#ff5a1a #ffb040 #fff2b0`, light 140 `#ff7a2a`. Mark: 1–3 red-orange glows over the head.
- look `armorColor '#2a1a1c'` · Top `aura {fire,'#ff5a1a'}, halo, armorTrim '#e8a040', capeColor2 '#ff3a10', trailColor '#ff7a2a'`
- Ult `#ff5a1a` / `['#ff5a1a','#c01020','#ffe070']` · Aw `화형대의 심판` · `빛의 우리가 불타올라 4초 동안 화염 피해를 준다.` · `dot {element:'fire', t:4, mv:0.2}`
- est 1.07 / 1.06

#### `kael_bloodreaver` 피의 처단자 · BLOOD REAVER ← `kael_bloodhunter`
- desc `제 피를 값으로 치르고 더 깊이 베는 금기의 사냥꾼.`
- perk `흡혈 +2%. HP가 최대 HP의 15%보다 많으면 마무리 공격 때 현재 HP의 4%를 바쳐 핏빛 초승달을 날린다(위력 140%, 3관통, 0.8초에 한 번). 초승달이 적을 맞힐 때마다 최대 HP의 1.5%를 회복한다(초승달 하나당 최대 3회).`
- M `atk 1.10, hp 1.08` (0.18) · F `critDmg 20, lifesteal 2`
- 「피의 공물」: `onSwing` `mv.finisher && !mv.skill && hp > 0.15·maxHp && icd(0.8)` → `cost = ceil(0.04·hp)`, `p.hp -= cost` (no hurt event; never lethal), text `-cost` `#ff6a7a`; `K.shoot(w,p,{x:p.cx+f*40, y:p.bottom-60, vx:f*950, w:44, h:76, render:'wave', color:'#ff2040', life:0.45, pierce:3, attack:K.atk(p,{mv:1.4, kb:[220,-120], hitstop:0.03, shake:1, tags:['melee'], proc:true}), onHit: heal 1.5 % maxHp while pr._h<3})`. Keeps the hero under 50 % where the parent's ×1.3 applies.
- Top `aura {blood,'#ff0a2a'}, wings 'bat', trailColor '#ff2040', armorTrim '#8a0a1a'`
- Ult `#ff0a2a` / `['#ff0a2a','#ffd0d8','#5a0010']` · Aw `피의 처단` · `채찍이 핏빛으로 물들고 입힌 피해의 7%를 흡혈한다.` · `lifesteal 0.07`
- est 1.08 / 1.05

#### `kael_blackwing` 흑익의 사냥꾼 · BLACKWING ← `kael_nightraven`
- desc `까마귀 날개로 하늘에 머무는 공중전의 사냥꾼.`
- perk `공중에서 적을 맞히면 낙하가 멈춘다. 한 번 뜬 동안 공중 적중 4회마다 공중 점프 1회를 돌려받는다(최대 2회). 공중 적중 6회 이상 뒤 착지하면 깃털 8개가 쏟아진다(각 위력 40%, 암흑, 2.5초에 한 번).`
- M `agi 1.08, atk 1.08` (0.16) · F `critDmg 25, moveSpd 5`
- 「흑익 체공」: `onHit` `!p.onGround` → `_air++`; `if (p.vy > 0) p.vy = min(p.vy, 40)`; every 4th with `_airRef<2` → `p.airJumpsLeft = min(p.maxAirJumps(), p.airJumpsLeft+1)`, ring `#9a8aff`. `onLand`: `_air ≥ 6 && icd(2.5)` → 8 feathers (`K.featherRenderD`, `mv 0.4`, dark, falling from 280 px above, `proc`); always reset `_air=_airRef=0`.
- Top `aura {dark,'#9a8aff'}, wings 'crow', scarf {color:'#2a1a4a', long:true}, trailColor '#b0b0ff', armorTrim '#6a6aff'`
- Ult `#9a8aff` / `['#9a8aff','#0e0c14','#e0e0ff']` · Aw `흑익의 폭풍` · `채찍이 지나간 길을 따라 까마귀 떼가 날아든다.` · (flag `crows`; `t3Mul` only)
- est 1.07 / 1.03

### 4.2 Sera (staff)

#### `sera_archsaint` 대성녀 · ARCH SAINT ← `sera_saint`
- desc `기적을 땅에 새기는 살아 있는 성인.`
- perk `액티브 스킬을 쓰면 발밑에 4초 동안 성역(반경 140)이 생긴다(12초에 한 번). 성역 안에서는 0.5초마다 최대 HP의 2%를 회복하고, 성역 안의 적은 0.5초마다 위력 20% 신성 피해를 받는다. 성녀의 기적이 HP 50%로 되살리고 성광 폭발(반경 200, 위력 200%)을 일으킨다.`
- M `mag 1.08, hp 1.08, res 1.05` (0.21) · F `holy 15, hpRegen 2`
- 「성역」: `onSkill` `icd(12)` → zone SkillFx `life 4` at the feet; every 0.5 s: hero inside (`|dx|<140, |dy|<90`) → `p.heal(0.02·maxHp,false)` (priestess ×1.3 applies); `procStrike(w,p,{x-140,y-110,280,120},{mv:0.2, type:'mag', element:'holy', kb:[40,-40]})`; draw `K.runeCircle` stroke + glow. `onLethal`: `!w.run.saintUsed` → set, `hp = ceil(0.5·maxHp)`, `iframes 2`, `K.boom(…200,{mv:2.0, type:'mag', element:'holy', atk:{tags:['skill'],proc:true}})`, toast `대성녀의 기적 — 죽음을 거부했다!`, return true (the tier-2 30 % path never runs).
- Top `wings 'seraph', halo, aura {holy,'#ffe9a0'}, armorTrim '#ffd84a', capeColor2 '#ffd84a', trailColor '#fff2b0'`
- Ult `#ffe9a0` / `['#fff8d0','#ffd84a','#ffffff']` · Aw `대성녀의 후광` · `후광이 빛나며 체력을 30% 회복한다.` · `heal 0.3`
- est 1.04 / 1.30 (knob `zoneHeal`)

#### `sera_prophetess` 대예언자 · PROPHETESS ← `sera_oracle`
- desc `한 박자 앞의 미래를 읽고 피해 가는 예언자.`
- perk `10초마다 예지 1회가 준비된다. 예지가 준비되었을 때 적에게 맞으면 피해를 받지 않고, 반경 220 안의 적이 2초 동안 절반 속도가 되며(보스는 25% 감속), 모든 스킬의 재사용 대기가 1.5초 줄어든다.`
- M `mag 1.08, mp 1.10` (0.18) · F `cdr 5, mpRegen 1`
- 「예지」: `tick` charge 10 s → ring `#a8e0ff`. `onHurt`: ready, `atk.team==='enemy' && !atk.flat` → consume, `iframes 0.8`, `slowEnemy(e, boss?0.75:0.5, 2)` within 220, all `p.skillCd[k] -= 1.5` (≥ 0), ring r 220, `K.afterimage`, callout `예지!`, return false.
- Top `aura {ice,'#a8e0ff'}, halo, scarf {color:'#e8c872', long:true}, armorTrim '#e8c872', trailColor '#c8ecff'`
- Ult `#a8e0ff` / `['#a8e0ff','#e8c872','#e8fbff']` · Aw `정지한 시간` · `각성이 끝난 뒤 4초 동안 적이 40% 속도로 움직인다.` · `slow {mul:0.4, t:4}`
- est 1.04 / 1.15

#### `sera_archsage` 대현자 · ARCHSAGE ← `sera_archmage`
- desc `세 원소를 하나로 엮어 내는 금서의 현자.`
- perk `액티브 스킬을 쓸 때마다 원소 인장 1개(최대 3). 인장이 3개면 다음 기본 공격이 삼원 융합탄이 된다 — 맞거나 사라질 때 반경 110 폭발(위력 260%, 화염·냉기·번개 중 그 적이 약한 속성, 없으면 화염)을 일으키고 MP 15를 돌려준다.`
- M `mag 1.10, mp 1.08` (0.18) · F `fire 10, ice 10, thunder 10`
- 「삼원 융합」: `onSkill` `_sigil=min(3,+1)` + ring in the sigil colour (`#ff7a2a` / `#9fe8ff` / `#fff2a0`). `onSwing` (`!mv.skill`, `_sigil===3`) → `_sigil=0`; orb `K.shoot({… vx:f*700, render:'orb', color:'#ffe0b0', scale:1.6, life:0.9, pierce:1, attack:K.atk(p,{mv:0.4, type:'mag', tags:['skill'], proc:true}), onExpire: boom r110 mv 2.6 element = first of fire/ice/thunder in the nearest enemy's `stats.weak` (else fire), +15 MP})`. Tagged `skill` so archmage `skillDmg +35` applies (intended).
- Top `aura {fire,'#ffb05a'}, halo, armorTrim '#ffd84a', trailColor '#ffd0a0'`
- Ult `#ffb05a` / `['#ff7a2a','#9fe8ff','#fff2a0']` · Aw `삼원소의 대기둥` · `심판의 기둥이 화염·냉기·번개로 번갈아 내리친다.` · (flag `elements`; `t3Mul`)
- est 1.08 / 1.00

#### `sera_tempest` 뇌우의 무녀 · TEMPEST ← `sera_stormcaller`
- desc `적과 적 사이에 번개의 길을 놓는 폭풍의 무녀.`
- perk `공격에 맞은 적에게 정전기(최대 5중첩, 4초). 정전기가 있는 적이 번개 피해를 받으면 반경 300 안의 정전기 붙은 다른 적 최대 3명에게 번개가 튄다(각 위력 60%, 0.2초 경직, 튄 적의 정전기 1 소모, 0.35초에 한 번).`
- M `mag 1.08, agi 1.08` (0.16) · F `thunder 15, moveSpd 5`
- 「정전기 연쇄」: `onHit` → `mark(tgt,'static',4,1,5)`; `atk.element==='thunder' && markOf(tgt,'static') && icd(0.35)` → ≤ 3 other static enemies within 300: `procStrike(…,{mv:0.6, type:'mag', element:'thunder', stun:0.2})`, `unmark(e,'static',1)`, arc SkillFx `life 0.18` (`K.boltPts` baked at start, `K.drawBolt`). Stormcaller bolts (`strikeBolt`, non-proc) and thunder skills trigger it.
- Top `aura {thunder,'#e0f0ff'}, scarf {color:'#bfe0ff', long:true}, armorTrim '#bfe0ff', trailColor '#e0f4ff'`
- Ult `#e0f0ff` / `['#e0f0ff','#ffffff','#6a9aff']` · Aw `뇌우의 기둥` · `번개 기둥이 내리치고 번개가 적과 적 사이를 잇는다.` · (flags `element thunder, chain`; `t3Mul`)
- est 1.10 packs, 1.00 single / 1.00

### 4.3 Victor (guns)

#### `victor_specter` 망령 저격수 · SPECTER ← `victor_phantom`
- desc `총구의 그림자에서 다음 표적을 찾아내는 유령.`
- perk `대시 후 1.2초 동안 탄환이 적을 맞히면 반경 400 안의 다른 적에게 유령탄이 튄다(맞힌 탄의 위력 50%, 대시 한 번에 최대 6발). 그 1.2초 안에 적을 처치하면 대시 재사용 대기가 즉시 끝난다.`
- M `atk 1.08, agi 1.08` (0.16) · F `critDmg 20, reach 5`
- 「유령 도탄」: `onDash` `_ric=0`. `onHit` (`atk.tags.includes('projectile')`, `p.t - p.lastDashT < 1.2`, `_ric<6`) → nearest other enemy within 400 of `tgt`: `K.bullet(w,p,tgt.cx,tgt.cy,ang,{mv:(atk.mv??0.6)*0.5, color:'#9ab0ff', speed:1600, life:0.35, walls:false})` with `attack.proc=true`; `_ric++`. `onKill` in the window → `p.dashCool = 0`, callout `재장전!`.
- Top `aura {ice,'#c0d0ff'}, scarf {color:'#4a4a6a', long:true}, armorTrim '#9ab0ff', trailColor '#9ab0ff'`
- Ult `#c0d0ff` / `['#9ab0ff','#e8f0ff','#4a5aff']` · Aw `망령탄` · `은탄이 모든 것을 꿰뚫으며 푸른 궤적을 남긴다.` · (flag `pierce`; `t3Mul`)
- est 1.08 / 1.02

#### `victor_headsman` 사형 집행자 · HEADSMAN ← `victor_executioner`
- desc `선고를 내리고, 집행하는 자.`
- perk `체력이 40% 미만이 된 적에게 6초 동안 사형 선고. 선고받은 일반 적은 체력이 15% 미만이면 다음 타격에 즉시 처형되고, 처형할 때마다 MP 10과 필살 게이지 4를 얻는다. 보스는 선고 중 다음 한 번의 타격 피해 +25%(6초에 한 번).`
- M `atk 1.10, hp 1.06` (0.16) · F `critDmg 15, lifesteal 2`
- 「즉결 처형」: `onHit` ratio < 0.4 → non-boss `mark(tgt,'sent',6)`; boss `icd(tgt,'sent',6)` → mark. `onAttack` marked: non-boss ratio < 0.15 → `{flat: ceil(tgt.hp)+1, executed:true}`; boss → `{mult:1.25}` + `unmark`. `onKill` `atk.executed` → `+10 MP`, `w.run.sp = min(100, +4)`, callout `처형!` `#ff2030`. Mark: red glow + X strokes.
- Top `aura {blood,'#c00010'}, armorTrim '#8a0a0a', trailColor '#ff2030', capeColor2 '#3a0004'`
- Ult `#ff2030` / `['#ff2030','#ffe0e0','#1a0a0a']` · Aw `집행` · `표식이 새겨진 일반 적 중 체력이 30% 미만인 적을 즉시 처형한다.` · `execute 0.30`
- est 1.06 mobs / 1.03 bosses / ehp 1.04

#### `victor_purgatory` 연옥의 총잡이 · PURGATORY ← `victor_hellfire`
- desc `총열이 달아오를수록 지옥에 가까워지는 총잡이.`
- perk `총을 쏠 때마다 열기 +10(한 번에 여러 발이면 한 발 더할 때마다 +4, 0.8초 쉬면 초당 25씩 식는다). 열기 100이면 3초 동안 과열 — 탄환 폭발의 반경 +50%, 위력 +25%. 과열이 끝나면 주변에 화염 고리(반경 140, 위력 80%)를 뿜고 2초 동안 열기가 오르지 않는다.`
- M `atk 1.08, mag 1.08` (0.16) · F `fire 20`
- 「과열」: `onSwing` (`mv.proj && !mv.skill`, not venting) `_heat += 10 + 4·(shots−1)`. `tick` cool 25/s after 0.8 s; 100 → `_ohT=3`, `p._heatK = {r:1.5, mv:1.25}`, callout `과열!`; end → `K.boom(…140,{mv:0.8, element:'fire', atk:{tags:['projectile'],proc:true}})`, `p._heatK=null`, vent 2 s. HOOKS reads `p._heatK` in the hellfire explosion (§6 C6 line). Heat ≥ 50 → ember at the muzzle / 0.2 s.
- Top `aura {fire,'#ff4a10'}, scarf {color:'#ff5a1a'}, armorTrim '#ff5a1a', trailColor '#ffb040'`
- Ult `#ff4a10` / `['#ff7a2a','#ffd070','#ff3010']` · Aw `연옥의 탄환` · `표식이 화염과 함께 폭발한다.` · (element fire; `t3Mul`)
- est 1.08 / 1.02

#### `victor_gunking` 총왕 · GUN KING ← `victor_gunlord`
- desc `맞지 않는 한 총성은 멈추지 않는다.`
- perk `맞지 않고 12번 쏘면 4초 동안 난사 — 쏠 때마다 좌우로 탄환 2발이 더 나간다(각 위력 50%, 10초에 한 번). 맞으면 연속 사격 수가 0이 된다.`
- M `atk 1.08, agi 1.06, hp 1.04` (0.18) · F `critDmg 15, luck 10`
- 「난사」: `onSwing` (`mv.proj && !mv.skill`) `_streak++`; `≥12 && icd(10)` → `_fanT=4`, callout `난사!`. While `_fanT>0`: two `K.bullet` at ±0.12 rad from the first fresh shot, `mv×0.5`, `#ffd84a`, `proc`. `afterHurt` `_streak=0`.
- Top `aura {holy,'#ffe070'}, capeColor2 '#ffd84a', armorTrim '#ffd84a', trailColor '#ffe070'`
- Ult `#ffe070` / `['#ffd84a','#fff0b0','#c8a040']` · Aw `총왕의 난사` · `두 자루 권총으로 열여섯 발을 쏜다.` · `shots 16`
- est 1.06 avg / 1.04

### 4.4 Bran (greatsword)

#### `bran_bastion` 성채 기사 · BASTION ← `bran_guardian`
- desc `발을 디딘 곳이 곧 성채가 되는 수호 기사.`
- perk `땅을 디디고 0.6초 동안 제자리(40 이내)에 있으면 방진 — 받는 피해 -20%, 경직·넉백 없음, 나를 근접 공격한 적에게 위력 60% 신성 반격(0.5초에 한 번). 40보다 멀리 움직이거나 뜨면 풀린다.`
- M `hp 1.10, def 1.08` (0.18) · F `dmgReduce 5, hpRegen 2` (chain dmgReduce 40)
- 「방진」: `tick` anchor/stillness → `stance = still ≥ 0.6` (enter: ering `#cfe0ff` + 6 holy motes). `onHurt` stance → `{dmg: dmg·0.8, armor:true}`. `afterHurt` stance, attacker entity, not projectile, `icd(0.5)` → `procStrike(hb(owner),{mv:0.6, element:'holy', kb:[260,-160]})`.
- Top `aura {holy,'#cfe0ff'}, halo, armorTrim '#ffd84a', capeColor2 '#ffd84a', trailColor '#e8f0ff'`
- Ult `#cfe0ff` / `['#fff2b0','#ffd84a','#1a3a7a']` · Aw `불락의 성채` · `방패 결계가 펼쳐져 각성이 끝난 뒤 4초 동안 무적이 된다.` · `invuln 4`
- est 1.03 / 1.15 (1.35 planted)

#### `bran_vanguard` 성전 선봉장 · HOLY VANGUARD ← `bran_crusader`
- desc `가장 먼저 적진에 뛰어드는 성전의 창끝.`
- perk `대시가 방패 돌격이 된다 — 지나간 적에게 위력 120% 신성 피해와 넉백. 마무리 공격의 성광 충격파가 0.12초 간격으로 세 번 나간다(두 번째·세 번째는 위력 80%).`
- M `atk 1.10, hp 1.06` (0.16) · F `holy 15, reach 5`
- 「방패 돌격」: `onDash` → SkillFx for `p.dashT` with `rect p.relRect(-10,-90,90,90)`, `atk mv 1.2 holy kb [420,-220] hitstop 0.03 proc`, 1 holy mote/frame; dash-end ring `#ffd870`. `onSwing` `mv.finisher` → `K.setTimeoutFx` at 0.12 and 0.24 s spawning the crusader wave (`render:'wave', color:'#fff2b0', 50×80, vx f·900, pierce 99`) with `mv 0.8`, `proc`.
- Top `aura {holy,'#ffd870'}, armorTrim '#c01020', capeColor2 '#ffd84a', trailColor '#fff2b0'`
- Ult `#ffd870` / `['#fff2b0','#c01020','#ffd84a']` · Aw `성전의 대파도` · `신성한 십자 파동이 적을 휩쓴다.` · (element holy; `t3Mul`)
- est 1.09 / 1.02

#### `bran_conqueror` 정복왕 · CONQUEROR ← `bran_warlord`
- desc `전장을 삼킨 군주. 맞아도 기세가 꺾이지 않는다.`
- perk `콤보 30 이상일 때 적중마다 10% 확률로 전쟁의 포효 — 반경 160 화염 충격파(위력 60%, 0.4초 경직, 1.2초에 한 번). 최대 HP의 15% 미만인 피격은 콤보를 끊지 않는다.`
- M `atk 1.08, hp 1.08` (0.16) · F `critDmg 20`
- 「꺾이지 않는 기세」: `onHit` `w.combo.n ≥ 30 && rnd<0.1 && icd(1.2)` → `K.boom(…160,{mv:0.6, element:'fire', hitstop:0, shake:4, c1:'#ff5020', atk:{stun:0.4, tags:['melee'], proc:true}})`, callout `포효!`. `keepCombo(p,dmg)` → `dmg < 0.15·maxHp`.
- Top `aura {fire,'#ff3010'}, armorTrim '#c8a040', capeColor2 '#ff3010', trailColor '#ff7a3a'`
- Ult `#ff3010` / `['#ff5020','#5a0a0a','#ffd0a0']` · Aw `정복의 군기` · `불타는 군기가 펄럭이고 콤보 10마다 피해가 3%씩 오른다.` · `comboDmg 0.03`
- est 1.08 / 1.03

#### `bran_bloodtyrant` 혈귀 폭군 · BLOOD TYRANT ← `bran_bloodrage`
- desc `제 피를 불쏘시개로 삼는 혈귀의 폭군.`
- perk `HP가 50%보다 많으면 공격할 때마다 현재 HP의 1%를 태워 피의 분노 1중첩(최대 10, 중첩당 주는 피해 +2%, 2초 동안 공격하지 않으면 0.5초마다 1씩 줄어든다). 스테이지마다 한 번, 치명상을 입으면 HP 1로 버티고 1초 동안 무적이 된다.`
- M `atk 1.08, agi 1.06, hp 1.05` (0.19) · F `lifesteal 2`
- 「피의 분노」: `onSwing` (`!mv.skill`, hp > 0.5·maxHp) → `p.hp -= max(1, floor(0.01·hp))`, `_rage=min(10,+1)`. `tick` decay. `dmgMul` `1 + 0.02·_rage`. `onLethal` `!w.run.tyrantUsed` → set, `hp=1`, `iframes 1`, blood burst, callout `불사!`, true.
- Top `aura {blood,'#ff0018'}, wings 'demon', armorTrim '#ff1a2a', trailColor '#ff1a2a'`
- Ult `#ff0018` / `['#ff1a2a','#5a0010','#ffb0b8']` · Aw `폭군의 격노` · `피의 분노로 입힌 피해의 15%를 흡혈한다.` · `lifesteal 0.15`
- est 1.12 above 50 % HP / 1.05 — highest-risk knob `perStack`

### 4.5 Lia (daggers)

#### `lia_umbra` 그림자 화신 · UMBRA ← `lia_shadowmaster`
- desc `어둠 그 자체가 된 인술의 끝.`
- perk `대시하면 출발 지점에 2.5초 동안 그림자 분신이 남는다(최대 2). 분신은 반경 300 안의 가장 가까운 적 쪽을 보고 내 공격을 따라 휘두른다(위력 35%, 암흑).`
- M `agi 1.06, atk 1.10` (0.16) · F `critDmg 20, dark 15`
- 「그림자 화신」: `onDash` → clone at the dash origin (cap 2; **1 on low quality**; oldest dropped); visual = cached silhouette from the awakening clone pool (`K.ghostOf(p)` / `K.afterimage` bitmaps, `#4a1a8a`, alpha 0.5·fade) — **no live `drawHero`**. `onSwing` (`mv.box && !mv.skill`) → per clone: face nearest enemy within 300; `procStrike(rectFrom(clone, mv.box), {mv:(mv.mv??1)*0.35, element:'dark', kb:[100,-60]})` + `w.fx.slash` `#b060ff` at the clone.
- Top `aura {dark,'#7a3aff'}, scarf {color:'#2a0a4a', long:true}, armorTrim '#4a2a8a', trailColor '#b060ff'`
- Ult `#7a3aff` / `['#b060ff','#4a2a8a','#e0c8ff']` · Aw `그림자 군세` · `그림자 분신이 모든 순간이동을 따라 벤다.` · (flag `clones`; `t3Mul`)
- est 1.10 / 1.00

#### `lia_mirage` 신기루 · MIRAGE ← `lia_kunoichi`
- desc `맞았다고 믿은 순간, 이미 등 뒤에 있다.`
- perk `환영 회피에 성공하면 0.3초 뒤 그 자리의 잔상이 폭발한다(반경 120, 위력 150%, 화염). 회피 뒤 2초 안의 다음 공격은 반경 300 안의 가장 가까운 적의 등 뒤로 순간이동해서 벤다.`
- M `atk 1.08, agi 1.06, hp 1.04` (0.18) · F `fire 15, critDmg 15`
- 「신기루 반격」: `onDodge` → `K.setTimeoutFx(0.3)` boom at the old spot (`mv 1.5 fire`, `#ff4a6a/#ffd0d8`, proc); `_mirT = t+2`. `onSwing` (`!mv.skill`, `_mirT>t`) → nearest enemy within 300; target spot behind it (`e.cx − sign(e.facing)·(e.w/2+24)`), `K.freeSpot` check → afterimage, move, face it; `_mirT=0`. (onSwing runs before the box check of the same frame, so the back-crit of the 암살자 line applies to non-bosses.)
- Top `aura {fire,'#ff9ab0'}, scarf {color:'#ffb0c0', long:true}, armorTrim '#ff4a6a', trailColor '#ffb0c0'`
- Ult `#ff9ab0` / `['#ff4a6a','#ffb0c0','#8a0a20']` · Aw `신기루 꽃보라` · `진홍빛 꽃잎이 폭풍처럼 흩날린다.` · (flag `petals`; `t3Mul`)
- est 1.05 / 1.05

#### `lia_bladequeen` 칼춤의 여왕 · BLADE QUEEN ← `lia_bladedancer`
- desc `쌓이는 칼날로 원무의 무대를 넓혀 가는 여왕.`
- perk `연속 공격 4타째마다(칼날 회오리와 함께) 몸 주위를 도는 칼날 2자루가 4초 동안 남는다(최대 8자루, 새로 생기면 모두 4초로 갱신, 각 위력 25%, 같은 적은 0.4초마다 다시 벤다). 피격되면 도는 칼날이 모두 바깥으로 날아간다(각 위력 60%).`
- M `atk 1.08, agi 1.06, hp 1.05` (0.19) · F `critDmg 15`
- 「여왕의 원무」: `onSwing` runs after the legacy case → if `p._bdN % 4 === 0` (counter fixed in §6 C-x1) spawn 2 orbit daggers (`K.daggerRender`, `orbitR 84`, `orbitSpeed 6f`, `life 4`, `pierce 999`, `mv 0.25 rehit 0.4`, proc); cap 8 (kill oldest), refresh all to 4 s. `afterHurt` → each orbit → straight outward 900 px/s, `mv 0.6`, `life 0.5`, `pierce 2`.
- Top `aura {holy,'#ffe070'}, scarf {color:'#ffe070', long:true}, halo, armorTrim '#ffd84a', trailColor '#fff0a0'`
- Ult `#ffe070` / `['#ffd84a','#fff8e0','#5a0a2a']` · Aw `여왕의 칼날 소용돌이` · `황금 칼날이 소용돌이친다.` · (flag `vortex`; `t3Mul`)
- est 1.10 / 1.03

#### `lia_soulreaper` 영혼 수확자 · SOUL REAPER ← `lia_reaper`
- desc `거둔 영혼을 낫에 담아 한 번에 풀어놓는 사신.`
- perk `적을 처치하면 영혼 1개(정예 3개, 보스는 내가 최대 HP의 10%를 깎을 때마다 1개, 최대 10개). 영혼 하나마다 주는 피해 +1%. 10개가 모이면 다음 마무리 공격이 망자의 낫 — 반경 220을 휩쓴다(위력 300%, 암흑).`
- M `atk 1.08, hp 1.08` (0.16) · F `dark 15, lifesteal 1`
- 「영혼 수확」: `onKill` `+1` (elite +3); `onHit` vs boss accumulates `info.dmg`, every 10 % of boss max HP `+1`. `dmgMul` `1 + 0.01·souls`. `onSwing` `mv.finisher && souls ≥ 10` → `souls=0`; scythe SkillFx `life 0.35` (`K.scytheShape` 300° sweep `#6affb0`, `rect circ(p,220)`, `mv 3.0 dark`, hitstop 0.06, proc). Meter: ≤ 10 green motes orbiting the head.
- Top `aura {dark,'#4affa0'}, wings 'bone', armorTrim '#3a8a5a', trailColor '#6affb0'`
- Ult `#4affa0` / `['#6affb0','#e8fff4','#0a0a0a']` · Aw `명계의 낫` · `마지막에 영혼의 낫이 휩쓸고, 처치할 때마다 체력을 4% 회복한다.` · `healPerKill 0.04`
- est 1.08 / 1.00

### 4.6 Azel (sword, mist dash)

#### `azel_nightlord` 밤의 군주 · NIGHT LORD ← `azel_nosferatu`
- desc `안개가 지나간 자리마다 피를 거두는 밤의 귀족.`
- perk `안개 대시가 지나간 자리에 2초 동안 피안개(반경 90)가 남는다(최대 3개). 피안개 속 적은 0.25초마다 위력 15% 암흑 피해를 받고, 그때마다 맞은 적 하나당 최대 HP의 0.3%를 회복한다(초당 최대 2%). 공중에서 대시하면 공중 점프 1회를 돌려받는다.`
- M `atk 1.08, mag 1.08` (0.16) · F `dark 15, lifesteal 1`
- 「피안개」: `onDash` store origin; `p.dashAir` → `airJumpsLeft = min(max, +1)`. `onDashEnd` → cloud at the path midpoint (cap 3): every 0.25 s `n = procStrike(circ(x,y,90),{mv:0.15, type:'mag', element:'dark', kb:[0,-30]})`, heal `min(n·0.003·maxHp, budget)` with a 2 %/s rolling budget; draw glow `#8a0a1e`.
- Top `aura {dark,'#c0103a'}, wings 'bat', armorTrim '#8a0a1e', trailColor '#ff2a50'`
- Ult `#c0103a` / `['#b0103a','#ff2a3a','#12060c']` · Aw `밤의 박쥐 떼` · `박쥐 떼가 소용돌이치며 적을 집어삼킨다.` · (flag `bats`; `t3Mul`)
- est 1.06 / 1.06

#### `azel_bloodemperor` 혈제 · BLOOD EMPEROR ← `azel_bloodking`
- desc `흘러넘친 피마저 다스리는 혈족의 황제.`
- perk `피의 장벽이 최대 HP의 10% 이상이면 마무리 공격이 장벽을 모두 써서 가까운 적 최대 5명(반경 400)의 발밑에서 피의 창을 솟구치게 한다(장벽이 최대 HP의 1%일 때마다 위력 20%, 200~300%).`
- M `atk 1.08, hp 1.08` (0.16) · F `critDmg 25, lifesteal 1`
- 「혈액 지배」 (needs §6 S8): `onSwing` `mv.finisher && shieldOf(p) ≥ 0.1·maxHp` → `mv = clamp(20·shield/maxHp, 2.0, 3.0)`; 5 nearest within 400: `K.spikeFx(w,p,e.cx,K.groundAt(…)??e.bottom,150,26,i*0.05, K.atk(p,{mv, element:'dark', kb:[60,-520], launch:true, tags:['melee'], proc:true}), {c1:'#ff1a2a', c2:'#5a0010', rim:'#ffb0b8'})`; shield → 0; callout `혈액 지배!`.
- Top `aura {blood,'#ff0a1a'}, halo, armorTrim '#ffd84a', capeColor2 '#ff1a2a', trailColor '#ff1a2a'`
- Ult `#ff0a1a` / `['#ff1a2a','#ffd84a','#5a0010']` · Aw `혈제의 관` · `피의 왕관이 떠올라 이번 각성의 치명타 피해가 70% 오른다.` · `critDmg 70`
- est 1.07 / 1.00

#### `azel_solaris` 태양의 검 · SOLARIS ← `azel_dawnbringer`
- desc `한낮의 태양을 칼끝에 묶어 둔 검.`
- perk `적중할 때마다 태양 게이지 +2, 마무리 공격을 휘두를 때 +6(최대 100). 100이 되면 다음 마무리 공격이 한낮의 일격 — 앞으로 900 길이의 태양 광선이 모든 적을 꿰뚫는다(위력 350%, 신성).`
- M `atk 1.08, mag 1.08` (0.16) · F `holy 15, reach 5`
- 「정오」: `onHit` `+2`; `onSwing` finisher → release if `sun ≥ 100`, else `+6`. Release: SkillFx `life 0.35`, rect 900×70 forward at `bottom-100`, `win [0,0.3]`, `mv 3.5 holy`, hitstop 0.06, draw `K.beamH` (cached) `#ffc040`/`#fff8e0`; `sun=0`. The dawnbringer wave still fires. Meter: 4 sun pips.
- Top `aura {holy,'#ffc040'}, halo, armorTrim '#ffb040', capeColor2 '#ffd070', trailColor '#ffd070'`
- Ult `#ffc040` / `['#ffd070','#ff2040','#fff8e8']` · Aw `정오의 해돋이` · `일식이 정오의 태양으로 바뀌고 초승달이 신성한 금빛이 된다.` · (flags `element holy, sunrise`; `t3Mul`)
- est 1.07 / 1.00

#### `azel_nephilim` 네필림 · NEPHILIM ← `azel_seraph`
- desc `빛과 어둠이 한 몸에서 맞물린 혼혈의 천사.`
- perk `공격할 때마다 빛과 어둠의 깃털이 번갈아 1개 날아간다(위력 30%). 같은 적이 1.5초 안에 신성 피해와 암흑 피해를 모두 받으면 일식 — 반경 90 폭발(위력 100%, 그 적이 약한 쪽 속성, 없으면 암흑, 같은 적은 2초에 한 번).`
- M `atk 1.06, mag 1.08, agi 1.04` (0.18) · F `holy 10, dark 10`
- 「일식」: `onSwing` (`!mv.skill`) alternate `_pol`; one feather `K.shoot({… vx:f*800, render: _pol?K.featherRenderL:K.featherRenderD, life 0.5, pierce 1, attack: K.atk(p,{mv:0.3, element: _pol?'holy':'dark', tags:['melee','feather']})})` — **not** a proc (it may trigger the eclipse). `onHit`: stamp `tgt._lh`/`tgt._ld`; both within 1.5 s and `icd(tgt,'ecl',2)` → `K.boom(…90,{mv:1.0, element: weak-side or dark, c1:'#ffffff', c2:'#b060ff', shake 2, atk:{tags:['melee','eclipse'], proc:true}})`; clear stamps.
- Top `wings 'seraph', halo, aura {dark,'#e8d8ff'}, armorTrim '#ffffff', trailColor '#e8d8ff'`
- Ult `#e8d8ff` / `['#ffffff','#b060ff','#1a1a2a']` · Aw `네필림의 날개` · `흰 날개와 검은 날개가 겹쳐 펼쳐지고 두 빛깔의 초승달이 교차한다.` · (flag `dualWing`; `t3Mul`)
- est 1.09 / 1.00

### 4.7 Isolde (spear)

#### `isolde_skysovereign` 천뢰의 기사 · SKY SOVEREIGN ← `isolde_stormlord`
- desc `하늘을 디딜 때마다 천둥을 남기는 폭풍의 기사.`
- perk `공중 점프할 때마다 발밑에 번개가 터진다(반경 90, 위력 60%). 급강하 착지 낙뢰가 떨어진 높이 240마다 1개씩 늘어나고(3~6개), 충격파 반경은 떨어진 높이 10마다 +1(최대 +60).`
- M `atk 1.08, agi 1.08` (0.16) · F `thunder 15, jumpPow 5`
- 「천뢰 도약」: `onJump(air===true)` `icd(0.2)` → `procStrike(circ(p.cx,p.bottom+10,90),{mv:0.6, element:'thunder', kb:[120,-200], stun:0.2})` + ring `#bfe8ff`. `onPound(p,w,r,fall,pk)` → `extra = clamp(floor(fall/240),0,3)` more bolts on the next nearest enemies (same filter as the stormlord's three, `slice(3, 3+extra)`, `K.strikeBolt(…0.9,0.9,K.ISO_BOLT)`); return `{ r: r + min(60, fall/10) }`.
- Top `aura {thunder,'#e0f4ff'}, scarf {color:'#bfe8ff', long:true}, armorTrim '#ffffff', trailColor '#bfe8ff'`
- Ult `#e0f4ff` / `['#bfe8ff','#ffffff','#ffe070']` · Aw `천뢰의 폭풍` · `내리꽂을 때마다 번개가 적과 적 사이를 잇는다.` · (flags `element thunder, chain`; `t3Mul`)
- est 1.07 / 1.00

#### `isolde_abyssdragoon` 심연의 용기사 · ABYSS DRAGOON ← `isolde_wyrmknight`
- desc `균열 너머 검은 용의 불길을 갑주처럼 두른 기사.`
- perk `화염 피해를 줄 때마다 용염 +1(최대 30). 용염이 30이면 다음 돌진 찌르기가 흑룡 돌진 — 앞으로 380 거리를 꿰뚫는 검은 불길(위력 250%, 화염)이 지나간 자리에 2초 동안 불바다(0.25초마다 위력 15%)를 남긴다.`
- M `atk 1.08, hp 1.08` (0.16) · F `fire 10, dark 10, lifesteal 1`
- 「흑룡 돌진」: `onHit` `atk.element==='fire'` → `_ember=min(30,+1)` (30 → ring `#c070ff`, callout `용염!`). `onSwing` `mv.id==='spDash' && _ember ≥ 30` → `_ember=0`; SkillFx `life 0.3`, `rect p.relRect(20,-100,380,90)`, `mv 2.5 fire`, hitstop 0.06, proc; floor-fire SkillFx `life 2` on the span, every 0.25 s `procStrike(…,{mv:0.15, element:'fire', kb:[0,-30]})`.
- Top `aura {dark,'#c070ff'}, wings 'demon', armorTrim '#c070ff', trailColor '#c070ff'`
- Ult `#c070ff` / `['#ff6a2a','#c070ff','#ffd0a0']` · Aw `심연의 겁화` · `용이 검은 불꽃으로 타올라 4초 동안 화염 피해를 남기고, 입힌 피해의 7%를 흡혈한다.` · `dot {element:'fire', t:4, mv:0.2}, lifesteal 0.07`
- est 1.07 / 1.03

#### `isolde_soulherald` 영혼의 전령 · SOUL HERALD ← `isolde_einherjar`
- desc `쓰러진 용사들의 영혼을 다시 전장으로 이끄는 전령.`
- perk `적을 처치하면 8초 동안 용사의 영혼이 따라온다(최대 3, 4번째는 가장 오래된 영혼을 새로 바꾼다). 빛의 투창을 던질 때 영혼도 함께 던진다(각 위력 40%). 영혼이 3일 때 적에게 맞으면 영혼 하나가 대신 사라지고 피해를 받지 않는다.`
- M `hp 1.08, atk 1.08` (0.16) · F `holy 10, dmgReduce 3`
- 「영혼 인도」: `onKill` push `{until: t+8}` (cap 3, replace oldest). Meter: spirits trailing behind (glow `#fff2b0` + small `K.wing` pair, alpha 0.6). `onSwing` (valkyrie javelin condition: `fin || mv.id==='spDash'`) → per spirit `K.throwJavelin(…,{mv:0.4, boom:0, scale:0.7, life:0.5, tags:['melee']})`, `proc`. `onHurt` 3 spirits, enemy attack → remove one, `iframes 0.6`, callout `영혼의 방패`, false.
- Top `wings 'seraph', halo, aura {holy,'#fff8d0'}, armorTrim '#ffffff', trailColor '#fff2b0'`
- Ult `#fff8d0` / `['#fff2b0','#ffd84a','#ffffff']` · Aw `영혼의 발할라` · `전사자의 영혼들이 함께 내리꽂히고, 각성이 끝난 뒤 3초 동안 무적이 된다.` · `invuln 3`
- est 1.06 / 1.08

#### `isolde_speargod` 창신 · SPEAR GOD ← `isolde_spearsaint`
- desc `한 점을 꿰뚫기 위해 천 번을 찌른 창의 신.`
- perk `같은 적을 연달아 맞힐 때마다 일점 1중첩(최대 20, 2초 동안 못 맞히거나 다른 적을 맞히면 사라진다). 중첩당 그 적에게 주는 피해 +1.5%. 20중첩이면 다음 찌르기가 관통 일섬 — 앞으로 700 길이의 빛줄기(위력 250%, 치명타 확정).`
- M `atk 1.08, agi 1.06, res 1.04` (0.18) · F `critDmg 20`
- 「일점」: `onHit` (melee) same target within 2 s → `_pin=min(20,+1)` else reset to 1 on the new target. `onAttack` `tgt === _pinT` → `mult × (1 + 0.015·_pin)`. `onSwing` (`mv.box && !mv.skill && _pin ≥ 20`) → `_pin=0`; SkillFx `life 0.25`, `rect p.relRect(30,-90,700,40)`, `mv 2.5, crit 100`, hitstop 0.08, proc; draw `K.cutLine` white + glow `#ff9aac` at the tip.
- Top `aura {holy,'#ff9aac'}, scarf {color:'#ff2040', long:true}, halo, armorTrim '#ffd070', trailColor '#ffd0d8'`
- Ult `#ff9aac` / `['#ffd0d8','#d02040','#ffffff']` · Aw `창신의 비` · `하늘에서 빛의 창이 비처럼 쏟아지고 이번 각성의 치명타 피해가 60% 오른다.` · `critDmg 60`
- est 1.10 single / 1.03 packs / 1.00

---------------------------------------------------------------------------------------------------------------------------

## 5. Hidden 「비전」 — 7 entries (Lv ≥ 75 · hero Trial Ⅱ · any tier-2 of the hero)

Shared: `kind:'hidden'`, `parents` = the hero's four tier-2 ids, `reqLevel 75`, `trial 'tr_<hero>_2'`, `arcade {lv:85}`.
Awakening: `T3_BOOST(T2[current tier-2])`, title `비전 각성 — {name}`. Active values are `[lv1, +per level]`; learn rule §2.3.
Each active is implemented in the hero group's content module (`ACTIVES_X`) with the bound kit; normal hits (`tags:['skill']`,
not procs) unless stated. Anchor: row-5 class skills deal 3.8–9.0 total mv at lv1; hidden actives sit at 3.0–4.8 + utility.

#### `kael_sealbearer` 발크레인 봉인자 · SEALBEARER (PERKS-A)
- desc `사백 년 전 발크레인이 종지기와 맺은 첫 봉인을 이어받은 자.`
- perk `채찍에 맞은 적에게 봉인 1중첩(최대 5, 5초). 5중첩이면 일반 적은 2초 동안 봉인되어 움직이지 못하고(같은 적은 6초에 한 번), 보스는 4초 동안 봉인 균열 — 카엘에게 받는 피해 +15%(같은 보스는 15초에 한 번).`
- M `atk 1.08, hp 1.08` (0.16) · F `holy 15, crit 5`
- Passive: `onHit` melee → `mark(tgt,'seal',5,1,5)`; at 5: boss `icd(tgt,'crack',15)` → `mark(tgt,'crack',4)`; non-boss `icd(tgt,'sealed',6)` → `tgt.stun = max(tgt.stun, 2.0)`, `mark(tgt,'sealed',2)`; unmark seal; callout `봉인!`. `onAttack` crack → `mult ×1.15`. Marks: gold ticks / chain strokes / jagged gold line.
- Active `asc_kael_firstseal` **제1봉인 — 발크레인 결계** · MP 24 · CD 14 · color `#ffd84a` · `v {dmg:[30,4], r:[220,10], t:[3,0]}`
  - desc `비질리아를 머리 위로 휘둘러 반경 {r}의 봉인진을 {t}초 동안 편다. 진 안의 적은 0.3초마다 위력 {dmg}% 신성 피해를 받고 절반 속도가 되며(보스는 25% 감속), 펼칠 때 진 안의 모든 적에게 봉인 5중첩을 새긴다.`
  - `K.pose(p,w,'cast_up',0.45,{sfx:'holy'})`; zone at the feet, 10 ticks (3.0 mv lv1 → 4.6 lv5) + `slowEnemy(e, boss?0.75:0.5, 0.35)` refresh; on cast `mark(e,'seal',5,5,5)` then the passive's 5-stack rule (respects its ICD). Draw `K.runeCircle` + 6 `K.cutLine` chains + glow.
- Top `aura {holy,'#ffd84a'}, halo, armorTrim '#ffd84a', trailColor '#ffe9a0'` · Ult `#ffd84a` / `['#ffd84a','#fff8e0','#5a3a10']` · est 1.08 / 1.10

#### `sera_bellsaint` 종의 성녀 · BELL SAINT (PERKS-A)
- desc `에슈빌의 종 — 일곱 번째 닻의 소리를 듣고 울리는 성녀.`
- perk `적중 8회마다 또는 액티브 스킬을 쓸 때 종이 울린다(2.5초에 한 번): 반경 200 신성 파동(위력 50%, 0.3초 경직)이 퍼지고, 그 안의 적 탄환을 지우며, 최대 HP의 2%를 회복한다. 12초 안에 세 번째로 울리는 종은 만종 — 반경 300, 위력 120%, 회복 4%.`
- M `mag 1.08, hp 1.08` (0.16) · F `holy 15, hpRegen 1`
- Passive (exported helper `toll(p, w, o)` inside class_perks_a.js, used by both): `onHit` count; `onSkill` forces a toll; `icd 2.5`; great toll if ≥ 2 tolls in the last 12 s; `procStrike(circ(R),{mv: great?1.2:0.5, type:'mag', element:'holy', stun:0.3, kb:[220,-120]})`; erase projectiles via `blockable(q)` + `quietExpire(w,q)` (guardian.js; beams/unblockable/large shots kept; knob `eraseProj`); heal 2 %/4 %; rings `#e8f0ff`; `audio.sfx('bell')`.
- Active `asc_sera_seventhbell` **일곱 번째 종** · MP 28 · CD 16 · color `#e8f0ff` · `v {dmg:[80,12], n:[5,0], r:[260,10]}`
  - desc `머리 위에 환영의 종을 4초 동안 불러낸다. 종은 0.8초마다 {n}번 울려 반경 {r}에 위력 {dmg}% 신성 피해를 주고, 그 안의 적 탄환을 지우며, 울릴 때마다 최대 HP의 2%를 회복한다.`
  - SkillFx `life 4` following `(p.cx, p.y-150)`; every 0.8 s `toll` with `mv`, `R=r`, heal 2 %, **no** passive counter (4.0 mv lv1 → 6.4 lv5). Vector bell (~15 path ops) swinging ±0.25 rad.
- Top `aura {holy,'#e8f0ff'}, halo, wings 'angel', armorTrim '#c8d0e0', trailColor '#f0f4ff'` · Ult `#e8f0ff` / `['#e8f0ff','#ffd84a','#ffffff']` · est 1.05 / 1.25

#### `victor_silverwolf` 은랑 사냥꾼 · SILVER WOLF (PERKS-B)
- desc `스승 하겐의 은탄과 달의 저주를 함께 물려받은 사냥꾼.`
- perk `적중마다 달 게이지 +3, 처치마다 +8(스테이지마다 0에서 시작). 100이 되면 8초 동안 만월 — 탄환이 은탄이 되어 피해 +15%, 관통 +2, 대시하면 늑대 발톱 세 줄이 앞을 할퀸다(각 위력 50%).`
- M `atk 1.10, hp 1.06` (0.16) · F `critDmg 20`
- Passive: fill on `onHit`/`onKill`; `onEnter` reset; full moon → `onSwing` fresh shots `pierce += 2`, colour `#e8f0ff`; `onAttack` projectile `×1.15`; `onDash` three claw `procStrike`s `relRect(20,-100,200,80)` `mv 0.5` with distinct hitIds. Meter: crescent filling to a disc.
- Active `asc_victor_silverbullet` **은월탄 — 하겐의 마지막 탄환** · MP 26 · CD 15 · color `#e8f0ff` · `v {dmg:[480,60]}`
  - desc `0.35초 동안 겨눈 뒤 은탄 한 발을 쏜다. 화면 끝까지 모든 적을 꿰뚫고(위력 {dmg}%), 체력 50% 미만인 적에게는 치명타 확정. 이 탄으로 적을 처치할 때마다 재사용 대기가 25% 줄고(최대 50%), 달 게이지 +30.`
  - aim line 0.35 s (`K.cutLine`), then 1000 × 40 strike `tags:['projectile','silver']` (non-proc; `onAttack` adds `crit 100` below 50 %), kills → `skillCd ×0.75` (floor 50 % of base) + moon 30. Draw `K.beamH` + `K.muzzle`.
- Top `aura {ice,'#e8f0ff'}, scarf {color:'#c8ccd4', long:true}, armorTrim '#c8ccd4', trailColor '#e8f0ff', tint {h:0, s:0.85}` · Ult `#e8f0ff` / `['#e8f0ff','#c8ccd4','#1a1a2a']` · est 1.08 / 1.03

#### `bran_oathlord` 서약 기사단장 · OATH LORD (PERKS-B)
- desc `무너진 새벽 서약 기사단을 다시 일으켜 세운 단장.`
- perk `적중 20회마다 새벽 서약 기사의 영혼이 등 뒤에서 앞으로 돌격한다(위력 80%, 신성, 3초에 한 번). 내 군기 반경 260 안에서는 경직되지 않는다.`
- M `atk 1.06, hp 1.08, def 1.06` (0.20) · F `holy 15`
- Passive: `onHit` count; `% 20 === 0 && icd(3)` → wave projectile from behind (`render:'wave'`, `#ffcf6a`, 50×90, vx 900, pierce 99, `mv 0.8` holy, proc). `onHurt` → `{armor:true}` while inside the banner radius.
- Active `asc_bran_oathbanner` **서약의 군기** · MP 22 · CD 18 · color `#ffcf6a` · `v {dmg:[80,12], t:[10,0], n:[5,0]}`
  - desc `발밑에 새벽 서약의 군기를 {t}초 동안 꽂는다. 군기 반경 260 안에서는 주는 피해 +15%, 받는 피해 -20%, 초당 최대 HP 1% 회복, 경직 없음. 2초마다 군기에서 서약 기사의 영혼이 가장 가까운 적 쪽으로 돌격한다(위력 {dmg}%, {n}회).`
  - one banner per hero (recast replaces); inside: `dmgMul ×1.15`, `onHurt dmg×0.8 + armor`, heal 1 %/s; every 2 s the passive wave from the banner toward the nearest enemy with `mv` (4.0 mv lv1 → 6.4 lv5). Vector pole + cloth (4 flutter points), ground ering r 260 `#ffcf6a` α 0.25 / 1 s.
- Top `aura {holy,'#ffcf6a'}, halo, capeColor2 '#ffcf6a', armorTrim '#ffcf6a', trailColor '#ffe0a0'` · Ult `#ffcf6a` / `['#ffcf6a','#f0e8d0','#2a4a8a']` · est 1.08 / 1.15

#### `lia_frostcrow` 서리 까마귀 · FROST CROW (PERKS-C)
- desc `얼음 속에서 집으로 돌아오던 아버지의 날개를 이어받은 까마귀.` (canon: story_ext §3.5 — the father froze twenty years ago, not a century)
- perk `공격에 맞은 적에게 냉기 1중첩(최대 5, 4초). 5중첩이면 일반 적은 1.2초 동안 얼어붙고(같은 적은 5초에 한 번), 보스는 2.5초 동안 25% 느려진다(10초에 한 번). 얼어붙은 적에게 주는 피해 +20%. 얼어붙은 적을 처치하면 산산조각 나며 반경 100에 위력 60% 냉기 피해와 냉기 2중첩을 준다.`
- M `atk 1.08, agi 1.06, hp 1.05` (0.19) · F `ice 20, critDmg 10`
- Passive: `onHit` chill marks; 5 → non-boss `icd(tgt,'frz',5)` → `tgt.stun = max(tgt.stun,1.2)`, `mark(tgt,'frozen',1.2)`; boss `icd(tgt,'frzB',10)` → `slowEnemy(tgt,0.75,2.5)`. `onAttack` frozen ×1.2. `onKill` frozen → shatter `procStrike(circ(100),{mv:0.6, element:'ice'})` + chill 2 on neighbours.
- Active `asc_lia_frostwing` **동결의 날개** · MP 20 · CD 12 · color `#bff4ff` · `v {dmg:[150,25], f:[50,8], n:[6,0]}`
  - desc `앞으로 300을 꿰뚫고 돌진해 지나간 적을 벤다(위력 {dmg}%, 냉기 2중첩). 돌진한 자리에서 얼음 깃털 {n}개가 피어나 반경 500 안의 적을 쫓는다(각 위력 {f}%, 냉기 1중첩).`
  - dash 0.18 s (`iframes 0.25`, 20 px steps stopping at solids via `K.freeSpot`), one strike over the path; 6 homing feathers (`behavior:'homing'`, `homingDelay 0.2`, speed 700, life 1.4, render = featherShape `#bff4ff`). 4.5 mv lv1 → 7.4 lv5.
- Top `aura {ice,'#bff4ff'}, wings 'crow', scarf {color:'#bfe8ff', long:true}, armorTrim '#bff4ff', trailColor '#c8f0ff'` · Ult `#bff4ff` / `['#bff4ff','#2a2a4a','#ffffff']` · est 1.08 / 1.10

#### `azel_dawnblood` 여명의 혈족 · DAWNBLOOD (PERKS-C)
- desc `어머니 아멜리아에게서 성녀의 피를, 아버지에게서 밤의 피를 받은 여명의 혈족.`
- perk `스테이지마다 한 번, 치명상을 입으면 5초 동안 빌린 시간에 들어간다(HP 1, 처음 0.8초 무적). 그동안 최대 HP의 25%만큼 피해를 주면 HP 35%로 돌아오며 여명의 피가 터진다(반경 200, 위력 150%, 신성). 채우지 못하면 쓰러진다. HP가 50% 이하일 때 신성·암흑 피해 +10%.`
- M `atk 1.08, hp 1.08` (0.16) · F `holy 15, lifesteal 1`
- Passive: `onLethal` `!w.run.borrowUsed` → set, `hp=1`, `iframes 0.8`, `_borrow {t:5, dealt:0}`, vignette `#ffb060`, true. `onHit` while borrowing `dealt += info.dmg` (non-proc hits only). `tick`: countdown text each second; success → `hp = max(hp, ceil(0.35·maxHp))`, holy boom r 200 `mv 1.5` proc, callout `여명!`; failure at 0 → `p.hp = 0; p.die(w, null)`. `onAttack` hp ≤ 50 % and holy/dark → ×1.1.
- Active `asc_azel_lullaby` **아멜리아의 자장가** · MP 24 · CD 12 · color `#ffb060` · `v {dmg:[360,50], d:[20,3]}`
  - desc `현재 HP의 10%를 바쳐 주위 300도를 여명의 초승달로 벤다(반경 180, 위력 {dmg}%, 신성). 맞은 적은 3초 동안 0.5초마다 위력 {d}% 신성 피해. 한 명이라도 맞히면 바친 HP의 150%를 회복한다.`
  - cost `min(hp−1, ceil(0.1·hp))`; sweep `rect circ(180)` minus the 60° behind-below wedge; dot entity per hit enemy (6 ticks, cap 8 enemies, proc); heal `1.5·cost` once. 4.8 mv lv1 → 7.5 lv5.
- Top `aura {holy,'#ffb060'}, halo, wings 'bat', wingCol ['#2a0a10','#ffb060','#5a1a10'], armorTrim '#ffb060', trailColor '#ff8a5a'` · Ult `#ffb060` / `['#ffb060','#ff2040','#fff2d0']` · est 1.06 / 1.20

#### `isolde_dragonbond` 용의 맹약자 · DRAGONBOUND (PERKS-D)
- desc `아르겐과 다시 맺은 맹약으로 은빛 뇌룡의 힘을 나눠 받은 기사.`
- perk `급강하 착지 때 아르겐의 환영이 등 뒤에서 날아와 앞뒤 640을 가로지른다(높이 120 띠, 위력 90%, 번개, 4초에 한 번). 급강하 착지마다 용린 1중첩(최대 3, 6초) — 중첩당 받는 피해 -5%.`
- M `atk 1.08, hp 1.06, agi 1.04` (0.18) · F `thunder 15`
- Passive: `onPound` `icd(4)` → silhouette SkillFx `life 0.45` crossing `p.cx∓420 → ±420` at `bottom-80`, rect 640×120, `win [0.2,0.8]`, `mv 0.9 thunder stun 0.2` proc; always `scale=min(3,+1)`, refresh 6 s. `onHurt` `dmg × (1 − 0.05·scale)`.
- Active `asc_isolde_breath` **아르겐의 숨결** · MP 26 · CD 14 · color `#9fe8ff` · `v {dmg:[35,5], n:[10,0]}`
  - desc `어깨 위에 아르겐의 환영을 불러 1.5초 동안 앞쪽 320에 은빛 번개 숨결을 뿜는다(0.15초마다 위력 {dmg}%, {n}회, 짧은 경직). 숨결 동안 방향은 고정되고 움직일 수 있다.`
  - SkillFx `life 1.5` following p, facing locked; every 0.15 s one hitId over 3 stacked rects approximating a cone, `stun 0.15`. Draw 2 cached `K.beamH` + 3 `K.drawBolt` re-baked per tick. 3.5 mv lv1 → 5.5 lv5.
- Top `wings 'demon', wingCol ['#1a2a3a','#9fe8ff','#2a3a4a'], aura {thunder,'#9fe8ff'}, armorTrim '#9fe8ff', trailColor '#9fe8ff'` · Ult `#9fe8ff` / `['#9fe8ff','#e8fbff','#1a2a3a']` · est 1.07 / 1.08

---------------------------------------------------------------------------------------------------------------------------

## 6. Existing classes — 18 fixes

All new behaviour goes through the registry; old exact-id code stays unless a row says "delete". Perk text edits are in
`classes.js` `perk` fields (owners edit only their heroes' `def(...)` blocks; unique-string replacement, no reformat).

### 6.1 The 10 flagged perks
| # | class | owner | fix | new `perk` text |
|---|---|---|---|---|
| C1 | `kael_hunter` (key `char:kael`) | PERKS-A | `tick` every 0.5 s: scan tiles within 320 px for `T.BREAK` (world.js breakable rule ~947-956); if any, holy sparkle at the whip tip (≤ 2 motes) and a faint ring on the nearest one / 1 s. No combat change. | `부서지는 벽을 한 번에 부순다. 숨은 부서지는 벽이 가까이 있으면 채찍 끝이 반짝여 알려 준다.` |
| C2 | `kael_crusader` | PERKS-A | text made true (main hit keeps the weapon element; the 30 % holy extra hit exists, skills.js case `kael_crusader`) | `채찍 공격마다 위력 30%의 신성 추가타, 신성 피해 +20%` |
| C3 | `kael_templar` | HOOKS deletes the `bus.on('playerHurt', …)` body in `function hookBus()`; PERKS-A adds `kael_templar.afterHurt`: enemy, non-`flat` hits, 20 %, `icd(0.5)` → same boom (r 130, mv 1.6, holy, proc) + text `성광 반격!` | unchanged |
| C4 | `sera_priestess` | PERKS-A | `healMul → 1.3` (saint/oracle inherit; every `p.heal`) | unchanged |
| C5 | `sera_oracle` | PERKS-A | text made true (cdr 25 = −20 % time; mpRegen 1.2 → 4.2) | `재사용 대기 시간 -20%, MP 재생 +3/초` |
| C6 | `victor_hellfire` | HOOKS (skills.js `if (c === 'victor_hellfire')` onExpire wrapper) | missed bullets: `playerStrike(circ(pr,24), procAtk mv 0.25 fire)` + 4 fire motes, sfx ≤ 1 / 0.08 s; existing hit/finisher boom unchanged; both multiply radius/mv by `p._heatK?.r ?? 1` / `p._heatK?.mv ?? 1` (purgatory) | unchanged (now true) |
| C7 | `bran_knight` (key `char:bran`) | PERKS-B | `onHurt`: `p.move && !p.move.skill && dmg < 0.10·maxHp` → `{armor:true}` | `공격하는 동안 최대 HP 10% 미만의 피해로는 경직되지 않는다.` |
| C8 | `lia_ninja` | PERKS-C | `dashMul → 1.3` (distance via speed; i-frames unchanged) + `onDash` 2 shuriken (`K.shurikenRender`, `mv 0.3`, ±0.08 rad, `icd 0.6`, proc) | `대시 거리 +30%, 대시할 때 표창 2개를 던진다(0.6초에 한 번)` |
| C9 | `azel_dhampir` (key `char:azel`) | PERKS-C | `tick` while `p.dashT > 0`: each overlapped enemy once per dash (max 3) → `procStrike(hb,{mv:0.3, type:'mag', element:'dark'})` + `p.heal(0.01·maxHp,false)` | `흡혈 2%. 안개 대시로 적을 통과하면 적 하나마다 위력 30% 암흑 피해를 주고 최대 HP의 1%를 회복한다(대시당 최대 3명).` |
| C10 | `azel_holyblade` | HOOKS (combat.js clamp, §3.4) | resistance 100 now nullifies | unchanged (now true) |

Small extras in the same pass:
- **C-x1** `lia_bladedancer` (HOOKS, skills.js case `lia_bladedancer`): `if ((w.combo?.n ?? 0) === 0) p._bdN = 0;` before the increment
  → "연속 공격 4타째마다" becomes true; Blade Queen reads `p._bdN`.
- **C-x2** text only: `bran_crusader` → `마무리 공격 때 성광 충격파, 신성 피해 +35%` (PERKS-B); `azel_dawnbringer` →
  `마무리 공격 때 검기 발사, 신성 피해 +40%` (PERKS-C).

### 6.2 Signatures for the 8 stat-only classes (tier-1 entries inherit to both children)
| # | class | owner | perk text (replaces) | mechanic |
|---|---|---|---|---|
| S1 | `kael_stalker` | A | `이동 속도 +10%, 치명타 +8%. 마지막으로 때린 적에게 6초 동안 사냥감 표식 — 표식 대상에게 주는 피해 +6%, 표식 대상을 처치하면 1초 동안 이동 속도 +25%.` | `onHit` → quarry (6 s); `onAttack` quarry ×1.06; `onKill` quarry → sprint 1 s → `speedMul` 1.25; mark: purple chevron |
| S2 | `sera_elementalist` | A | `원소 피해 +15%. 기본 공격이 3번 맞을 때마다 맞은 자리에 원소 파열(반경 55, 위력 35%) — 화염→냉기→번개 순서. 냉기는 1초 동안 30% 감속(보스 제외), 번개는 0.2초 경직.` | `onHit` (basic: no `skill` tag) counter; every 3rd → `procStrike(circ(hx,hy,55),{mv:0.35, type:'mag', element:cycle, stun:thunder?0.2:0})`; ice → `slowEnemy(e,0.7,1)` non-boss |
| S3 | `victor_deadeye` | B | `치명타 +10%, 치명타 피해 +25%. 4초 동안 내게 맞지 않은 적을 맞히는 첫 탄은 치명타 확정.` | `onAttack` `w.time − (tgt._vSeen ?? −99) > 4` → `crit +100`; `onHit` stamps `_vSeen` |
| S4 | `bran_paladin` | B | `받는 피해 -10%, 신성 피해 +15%. 10초마다 가호가 차오른다 — 가호가 있을 때 적에게 맞으면 그 피해가 절반이 되고 반경 120 신성 파동(위력 50%)이 터진다.` | `tick` recharge 10 s (ready → small gold ring); `onHurt` enemy non-flat → `dmg×0.5`, consume, `procStrike(circ(120),{mv:0.5, element:'holy', kb:[260,-160]})` |
| S5 | `bran_guardian` | B | `받는 피해 -25%, HP +40%. 8초 동안 피해를 받지 않으면 최대 HP 12%의 결계가 생겨 피해를 먼저 막는다.` | `tick` 8 s unhurt → `shieldAdd(p, 0.12·maxHp, 0.12·maxHp)` + ring `#9ac8ff` + text `결계`; `onHurt` → `shieldAbsorb` (after paladin halving); `afterHurt` resets the timer; meter: white segment drawn by PerkLayer |
| S6 | `bran_bloodrage` | B | `흡혈 8%, 공격 속도 +20%. HP가 40% 아래로 떨어지면 6초 동안 혈귀화 — 공격 속도 +25%, 흡혈 +6%, 경직 없음(20초에 한 번).` | `afterHurt` hp < 0.4 `icd(20)` → frenzy 6 s: `atkSpdMul` 1.25, `onHurt` `{armor:true}`, `onHit` extra heal `info.dmg·0.06`; callout `혈귀화!`, vignette |
| S7 | `azel_vampire` | C | `흡혈 +3%, 암흑 피해 +20%. 적을 처치하면 3초 동안 흡혈 +4%.` | `onKill` → feast 3 s; `onHit` while feasting heal `info.dmg·0.04` |
| S8 | `azel_bloodking` | C | `흡혈 +6%, 치명타 피해 +50%. 최대 HP를 넘는 회복량은 피의 장벽이 된다(최대 HP의 15%까지, 3초 동안 늘지 않으면 초당 최대 HP의 2%씩 사라진다). 장벽이 피해를 먼저 막는다.` | `onOverheal` → `shieldAdd(p, over, 0.15·maxHp)`; `tick` decay after 3 s; `onHurt` → `shieldAbsorb`; meter: ≤ 6 blood motes scaled by shield |

Balance: S-perks add ≈ +3–6 % to their lines from Lv 10/25 on; `balance.mjs` (stat model) does not see them. S1 quarry was
lowered from the draft's ×1.08 to ×1.06 for the s18 boss band headroom (+9 %, fu_a1 §6).

---------------------------------------------------------------------------------------------------------------------------

## 7. Ultimate and awakening tier 3 (ULT-AWAKEN)

### 7.1 Ultimate
- skills.js `castUltimate` payload (anchor `bus.emit('ultimateCast', {`): `tier: heroTier(p.hero), classId: p.hero.classId, asc: p.hero.asc ?? null`.
- skills.js `const TIER_ZOOM = [1.12, 1.16, 1.2]` → `[1.12, 1.16, 1.2, 1.24]`; `const TIER_NAME = [22, 28, 34]` → `[22, 28, 34, 38]`.
- `ultCtx`: `tier: heroTier(p.hero)` (clamp 0..3); `accent: ascUltAccent ?? accentFor(C, color)` passed through the same `lumOf < 0.22`
  guard; `title: classNameOf(hero)`; `asc`. Damage stays tier-independent. `prewarmHero`: also bake `A.ult.accent`.
- ultfx.js `ULT_TIERS` adds index 3 (and `ULT_TIERS.T3`):
  ```js
  3: { tier: 3, zoom: 1.24, zin: 0.2, zhold: 0.22, zout: 0.3, roll: 1.0 * DEG, letterbox: 46, lbSlide: 0.15,
       lines: { a: 0.62, spin: 0.35, accent: true }, grade: { src: 'accent', a: 0.26, vig: 0.4 },
       beat: { rings: 3, ground: true, dust: 8 }, ghosts: 6, element: { n: 96, back: 28 },
       final: { flash: 0.6, rings: 4, embers: 48, impact: true, crack: true, flourish: true, roll: 1.4 * DEG, star: true, ascRing: true },
       name: { size: 38, style: 'gold', drips: 0, prefix: true } },
  ```
  Peaks stay governed by `Q[q].peak` / `room()`; flash 0.6 unchanged. `ascRing` = one extra `w.fx.ring` in the accent + one cached star.
- `clampTier` → `t >= 3 ? 3 : t >= 2 ? 2 : t >= 1 ? 1 : 0`; new `tierOfHero(hero)`; replace `tierOfClass(p.hero?.classId)` uses
  (anchors at ~930, `prepareFor`, ~2356, `tierOf:` export) with `tierOfHero`. `accentOf`/`visAccent`/`auraOf` get an optional
  `hero` arg (asc accent / `lookTop.aura` win). Flourish stays keyed by the tier-2 `classId`; for tier 3 the caller passes
  `colors: A.ult.colors` into `fctx` (`c: o.colors ?? def.colors`). `prepareFor` key `${heroKey(hero)}|${q}`; name prefix
  `classNameOf(hero)`; `prepStale` compares the same key.
- overlays.js `UltCutin`: `this.tier = heroTier(hero)`; `cname = classNameOf(hero)`; tier 3 adds a 1.5 px inner line in the
  accent under the gold band and a second diamond glyph before the class name.

### 7.2 Awakening
- `data/awaken.js`: `AWAKEN_RULES.t3Mul: 1.25` (t2 1.15; `bossCap 0.30` unchanged). `T3_PREFIX = '초월 각성'`,
  `HIDDEN_PREFIX = '비전 각성'`; `awakenTitle(charId, tier, kind)`. Export `T3_BOOST(base)`:
  `heal ×1.5 · lifesteal ×1.5 · dot.t +1, dot.mv ×1.33 · slow.mul −0.1, slow.t +1 · invuln +1 · critDmg +20 · comboDmg +0.01 ·
  shots +4 · execute +0.05 · healPerKill +0.01`; flags unchanged.
- t3 entries use their explicit `awaken` numbers (§4, all within T3_BOOST bounds — tested); hidden uses `T3_BOOST(T2[classId])`
  with label/desc from T2 and the hidden title prefix.
- `game/awaken.js`: `tierOf = (p) => heroTier(p?.hero)`; cast payload adds `asc`; `makeContext`: `t2 = tier >= 2 ? merge(T2[classId], tier >= 3 ? A.awaken ?? T3_BOOST(T2[classId]) : null) : null`;
  `target = ultMv × mvMul × (tier >= 3 ? t3Mul : tier >= 2 ? t2Mul : 1)`; colour/accent keys in overlays are ignored
  (directors' prewarm sets stay valid). Directors need **no** dispatch change (variant from tier-2 `v.classId`;
  `v.tier >= 2` branches pass for 3; the `slice(5)`/`slice(7)` name tricks keep operating on the tier-2 id).
- `awaken_cutin.js` `bakeTexts`: caption `params.className ?? cls.name`, title `awakenTitle(charId, tier, params.kind)`;
  accept tier 3; `prepareCutin(charId, tier, hero)` passes the hero. New brush glyphs 초/월/비/전 → font check.

---------------------------------------------------------------------------------------------------------------------------

## 8. UI (UI-CHURCH-CLASS)

### 8.1 Church 전직 tab (`src/scenes/town/church.js`)
- `const TIER_NAME = [...]` → import `TIER_NAMES, KIND_LABEL`. Below tier 2 nothing changes.
- At tier 2 the panel `최상급 직업에 도달했다` (anchor `if (!opts.length) {`) is replaced by **「초월의 길」**: left 32 % current
  preview (snapshot key includes `heroKey`), right 68 % a 2×2 grid (`cw=(W−12)/2`, `ch=(h−12)/2`; compact 720 UI px ≈ 240×125):
  1. **시련 Ⅰ** — `trialStatus`: 잠김(reason) / 도전 가능 / 통과 ✓ (`best` m:ss · tries).
  2. **초월** (`ascListFor(classId)[0]`): name, `KIND_LABEL` pill, perk (scrolls in the selected card), state 잠김(reason) / 초월 가능 / 현재.
  3. **시련 Ⅱ** — hidden as `시련 Ⅱ · ???` until Trial Ⅰ is done.
  4. **비전** — `???` until Trial Ⅰ is done; then name + perk; state as (2).
  Text button `기본 최상급으로` under the grid when `hero.asc` (switch to `null`).
- Navigation ←→/↑↓ in the grid; taps: first selects, second acts (existing `card:` pattern); long texts via the existing `csc` Scroller.
- Action button text: `시련에 도전` / `「X」로 초월` / `「X」로 바꾼다` / `현재 직업` / `레벨 N 필요`.
- Flows: trial → Modal `시련에 도전하시겠습니까?` lines `보스: {boss name} · 권장 Lv {T.recLv}`, `시련 중에는 전리품·경험치가 없고 목숨이 줄지 않습니다.`,
  mods via `modName` → `TRIAL.startTrial(game, tid)`. Ascend → Modal `「{T2}」 → 「{asc}」`, `초월한 길은 성당에서 언제든 바꿀 수 있습니다.`,
  first only `첫 초월 보너스 스킬 포인트 +3` → ceremony variant (`C.asc`, title `초월 완료` / `비전 각성`, old/new previews via
  `lookForAsc`). Switch to an unlocked one → no modal, 1.2 s ceremony. Church `enter(params)` honours `tab:'class'` and
  `params.unlocked` (short fanfare on new cards). After any change `this.world?.player?.refreshStats?.()`.
- **Part 2 keeper**: when `flags.p2_started`, the keeper is Elise (`npcId 'npc_elise'`, portrait/name, `SHOP_LINES.elise`,
  Part 2 hint strings in her voice — story_ext §5.4); background unchanged. Extra talk row **「안쪽 방 — 신부님」** (Part 2 only):
  `bus.emit('npcTalk', { npcId: 'npc_alberto' }); this.game.push('dialogue', { npc: 'npc_alberto', world: this.world })`.
- `data/npcs.js` `npcVisible`: new `appear.hideFlag` (`if (a.hideFlag && f[a.hideFlag]) return false;`); `npc_alberto.appear = { hideFlag: 'p2_started' }`.
- Phone: all new text through `ui.text`/`font` (text floor applies); card rows sized from `textFloor()` (no fixed 11 px rows).
  The lead's later REF-B trial screen may replace this grid; it must consume the same API (`trialStatus`, `availableAscensions`, `ascend`).

### 8.2 Class tab (`src/scenes/menu/tab_class.js`)
Keep 3 columns; tier 3 + hidden are a **strip under each tier-2 card**: `STRIP = max(20, textFloor() + 8)` UI px; tier-2 column
positions add `STRIP + 2` per card; `cardH` recomputed from `(A.h − 64 − 4·(STRIP+2) − 18)/4` (clamp 44..76). Strip: left 62 % t3
pill (lock glyph / gold when current), right 38 % `비전` pill (`???` + lock until Trial Ⅰ). Tap rects ≥ 36 UI px tall, tested
before the card. No thumbnails in strips. `status(id)` handles asc ids (`cur`, `ready`, `unlocked`, `closed`, `locked` +
reason from `canAscend(hero, id, this.state)`). Navigation: tier-2 `right` → its t3 node → hidden node; `left` back. Detail panel
for asc ids: pill `KIND_LABEL`, mods from `A.mult/A.flat`, hidden adds `비전 기술: {name}`, footer
`Lv {reqLevel} · {T.name} 통과 · 2부 결말` with per-part colour, hint `초월은 마을 성당에서 할 수 있습니다`; preview via
`lookForAsc` (fix the `lookFor` temporary-mutation to also save/restore `hero.asc`). `TIER_NAME[3] = '초월'`.

### 8.3 Other UI
- `tab_skills.js`: when the hero's hidden id ∈ `ascUnlocked`, a one-row strip **「비전 기술」** under the tree (one node: learn/
  level/equip like tree nodes; lock reason from `canLearnOf` → `비전 해금 필요`, equip refused unless the hidden asc is active
  → `비전 직업일 때만 장착할 수 있다`). The `ids.length === 6` fork rule is untouched.
- `access.js reqsOf`: `{ text: \`비전: ${name}\`, ok: unlocked && active, short: '비전 직업 전용' }`.
- `tab_status.js` path pills (anchor `const chain = D.classChain(hero.classId);`): append an asc pill (`KIND_LABEL` colour).
- Name sites → `classNameOf(hero)`: `hud.js` (anchor `CLASSES[hero.classId]?.name ?? ''`, if still present after BM),
  `party.js:129,180`, `slots.js:113` (`ascName(raw.asc)`), `cloud_ui.js:127` (`ascName(sum.asc)`), church `116/280/449`.
  (`pause.js:351`, `hub.js:425` are TRIALS-ENGINE files; same one-token change there.)
- `data/town.js` `SHOP_LINES`: `elise` block + `alberto.asc/.trial/.trialDone` (story_ext §5.4).

---------------------------------------------------------------------------------------------------------------------------

## 9. Trials engine

### 9.1 Gates
`canStartTrial` (§2.4): hero = current hero, tier 2, **current-cycle `flags.p2_done`**, `reqFlag` via `flagEver` (first clear
only), Trial Ⅱ needs Trial Ⅰ done, Lv ≥ `reqLevel` (70 / 75). Replays allowed (no reward; `best`/`tries` update).

### 9.2 World options (HOOKS, `world.js`)
- Constructor signature (anchor `constructor(game, stageId, { roomId = null, mode = 'story', onExit = null } = {})`):
  add `rules = null, diffOver = null, levelOverride = null, trial = null`; mode comment adds `'trial'`.
- After the `ar.diffOver` line: `if (diffOver) this.diff = { ...this.diff, ...diffOver };` · before the NG line:
  `if (levelOverride) this.stage = { ...this.stage, level: levelOverride };` (copy; real `id` kept) · NG stays story-only (unchanged).
- Rules line: `this.rules = rules ?? (ar?.rules && typeof ar.rules === 'object' ? ar.rules : null);`
- New: `this.trial = trial; if (trial?.bossPatterns) this.ngBoss = true;` (boss.js `this.inferno` reads `world.ngBoss`).
- Marker loop in `loadRoom` (anchor `switch (m.ch) {`): first line of the loop `if (this.trial && (m.ch === '$' || m.ch === '@' || m.ch === '!' || m.ch === 'S')) continue;`
  (no chests, placed items, story triggers or save points in a trial).
- `spawnPickup` (anchor `spawnPickup(type, x, y, data = {})`): `if (this.trial && !TRIAL_PICKUPS.has(type)) return null;`
  with `TRIAL_PICKUPS = new Set(['heart', 'food', 'sub', 'powerup'])` (no gold/items/docs/1UP). HOOKS audits every caller that
  uses the return value (`spawnPlaced`, candle/statue drops) for a null guard; the boss-loot `keep` path never runs in trials.
- `onEnemyKilled`: wrap `gainExp`, `companions?.onKill`, enemy loot in `if (!this.trial) { … }`.
- `stashRoomLoot` / `deliverStash`: `if (this.arcade || this.trial) return;`.
- `get arcade()` unchanged (companions active; side bosses keep their pose).

### 9.3 `src/game/trial.js` (ASC-CORE ships a stub with these exports; TRIALS-ENGINE fills it)
```js
export function startTrial(game, tid)          // church → (save) → pre script → stage
export function prepareTrial(game, tid)        // → { T, stage, opts }
export function attachTrial(scene, world, T)   // instance overrides + banner
export function retryTrial(game, tid)
export function leaveTrial(game, tid, why)
export const TRIAL_STATS
```
- `startTrial`: `canStartTrial` (toast on fail) → `saves.write(slot, state)` → `preloadStageBosses(T.stage)` (bosses/lazy.js) →
  `game.push('dialogue', { script: done ? T.preAgain : T.pre, world: game.world, onEnd: () => game.go('stage', { stageId: T.stage, roomId: 'boss', mode: 'trial', trial: tid }) })`.
- `prepareTrial`: `stage = { ...STAGES[T.stage], intro: null, outro: null, next: null, unlocks: [] }`;
  `{diffOver, rules} = applyMods(getDiff(state.difficulty), T.mods)`; `opts = { rules: { ...rules, label: '시련의 규칙' }, diffOver: { ...diffOver, ...(T.diffOver ?? {}) }, levelOverride: T.level }`.
- `attachTrial` overrides (PracticeScene technique, `arcade_run.js` ~663):
  | override | behaviour |
  |---|---|
  | `w.gainExp = () => 0` | no EXP |
  | `w.syncToState = () => { w.hero.sub = w.run.sub; }` | score/lives never written |
  | `w.gotoRoom = w.enterDoor = () => {…}` | push the player back, `vx=0`, toast (≤ 1 / 1.5 s) `시련의 결계가 길을 막는다` |
  | `w.onBossDefeated = (b) => …` | feel part of world.js `onBossDefeated` only (cleared, slowmo, flash, shake, stopMusic, `boss_die`); **no** progress/bosses/flags/loot/companion bond/`bossKilled`; banner `{ text: '시련 통과', sub: T.name, color: '#c8a0ff', big: true }` |
  | `w.finishStage = () => completeTrial(game, w, T)` | `afterClear` calls it (post scripts are story-only) |
  | `w.onPlayerDeath = () => failTrial(game, w, T)` | no lives, no `stats.deaths`; `game.push('trialEnd', { world: w, tid })` |
  | banner on enter | `{ text: '시련', sub: T.name, t: 2.4, color: '#c8a0ff' }` |
- `completeTrial`: `rec = hero.trials[T.id] ??= {}`; `done=true, at=now, tries++, best=min(best, w.run.time)`;
  `added = unlockFromTrial(hero, T.id)`; `saves.write`; `game.go('story', { script: wasDone ? T.winAgain : T.win, then: 'hub',
  thenParams: { from: 'church', open: 'church', trial: T.id, unlocked: added }, bg: T.bg, music: T.music })`.
- `failTrial`: `tries++` (written on the next save) and push `trialEnd`.

### 9.4 Scenes
- **NEW `src/scenes/trial_end.js`** `TrialEndScene` modelled on `GameOverScene` (overlays.js ~728-801): `opaque=false, uiScale,
  hidePad, deferToasts`; buttons `다시 도전` (`retryTrial`) / `성당으로` (`leaveTrial`); ←→ + confirm, first tap selects;
  shows `T.failLine` (Elise). Register in `scenes/index.js` after `gameover`: `game.register('trialEnd', TrialEndScene);`.
- `stage.js` `enter({ stageId, roomId, mode, trial })`: when `mode === 'trial'` build the World from `prepareTrial` and call
  `attachTrial`; puppet preload unchanged.
- `pause.js` items (anchor `{ label: '마을로 귀환'`): when `w?.trial` the item becomes `{ label: '시련 포기', icon: 'home', run: confirm → TRIAL.leaveTrial(game, w.trial.id, 'quit') }`.
- `hub.js`: `back` excludes `from === 'church'`; `buildWorld(… 'church' …)`; spawn `else if (spawn === 'church') { const cb = BUILDINGS.find((b) => b.kind === 'church'); p.x = cb.door * TILE + 60; p.facing = -1; }`;
  after `CMP.companionHubEnter?.(g, this)` (enter): `if (params.open === 'church') setTimeout(() => g.top === this && g.push('church', { world: this.world, tab: 'class', trial: params.trial, unlocked: params.unlocked }), 0)`;
  after each `CMP.companionHubEnter?.(…)` call (enter/resume): `STORYDIR.hubStoryEnter?.(g, this)` (import from
  `../../game/story_director.js`, created by STORY-GAPS-B in wave 0).

### 9.5 Untouched by design
Scene name `'stage'` → touch pad, quality governor, wake lock and `FIGHT_SCENES` keep working. Telemetry ignores unknown modes.
No `stageCleared`/`bossKilled` from trials → achievements and quests do not move. Story-only boss mercy (`e_hagen`, `e_nemain`,
`e_bride`) and boss `_pre`/phase lines are off in trials (intended). Room gimmicks load normally.

---------------------------------------------------------------------------------------------------------------------------

## 10. Server, online, arcade

### 10.1 Server
No change. `CLASS_INFO` stays 49 ids; daily pool (tiers 0–2) unchanged; no deploy.

### 10.2 Online
Submissions keep `cls: hero.classId`. The optional `asc` payload field is deferred to ARCADE-PICKER (the live server
ignores unknown fields; `checkResult` copies known ones only).

### 10.3 Arcade data contract (for ARCADE-PICKER, later)
- Presets may carry `asc: true` (e.g. `{ name: '초월자', lv: 80, tier: 2, asc: true, … }`); the picker lists
  `ascListOf(charId)` (t3 by default; hidden only if `meta` says the device has seen it).
- `buildArcadeState`: after the class is chosen, `if (cfg.asc && ASCENSIONS[cfg.asc]?.parents.includes(hero.classId) && P.lv >= ASCENSIONS[cfg.asc].reqLevel) { hero.asc = cfg.asc; hero.ascUnlocked = [cfg.asc]; }`
  (temp save; `migrateAsc` keeps it because `s.arcade`). Level from `A.arcade.lv`. Do not insert hidden ids into any `next[]`.

---------------------------------------------------------------------------------------------------------------------------

## 11. Tests and tools

### 11.1 New
- `tools/test_ascension.mjs` (ASC-CORE; extended by later owners): exactly 28 t3 (one per tier-2) + 7 hidden; parents valid;
  ids unique vs CLASSES/SKILLS/ITEMS; `look`/`lookTop` key whitelists; budget §2.8; awaken overlays within `T3_BOOST` bounds;
  trials table constraints (§2.2); hidden skills exist with `reqAsc`; progression codes in order; first ascend +3 SP once,
  switch grants none, `switchAsc(null)`; hidden skill grant/slot/unslot/`ascSlot` restore; `migrateState` (foreign/invalid asc
  dropped, unknown trials dropped, `ascUnlocked` healed, idempotent twice); old-app simulation (HEAD migration keeps classId and
  extras); `computeStats` deltas within budget; 「초월 보정」 caps; `composeLook` sets `look.classId` tier-2 and applies `lookTop`
  over a non-starter armour/cloak; NG+ keeps asc/trials and `p2Cleared` true via `ng.n`; `saves.list`/`summarize` carry `asc`.
- `tools/test_perks.mjs` (HOOKS; extended by PERKS-A..D): keys ⊂ CLASSES ∪ ASCENSIONS ∪ `char:*`; hook names ⊂ whitelist; every
  asc id, the 8 stat-only and the 10 flagged classes have an entry; memo/inheritance/`only`; pure hooks unit-tested with fake
  player/world; perk text numbers present in `N`; static scan (no top-level `bus.`/`game.`, no `createElement`, no
  `create*Gradient`, no `Math.random` in `drawMeter`/`MARKS`); TDZ probe (each content module imported first, alone).
- `tools/test_trials.mjs` (TRIALS-ENGINE; browser harness `tools/qa/lib`): for all 14 trials with a fixture save (Lv 80,
  `p2_done`, Trial Ⅰ done where needed, side flags): church `startTrial` → stage `mode:'trial'` boss room → debug-kill boss →
  `hero.trials[tid].done`, `ascUnlocked` grew, inventory/gold/exp/lives/score/`progress.bosses`/flags unchanged, slot written,
  hub with church open; death → `trialEnd` → retry is a fresh world → leave spawns at the church; pause `시련 포기`; rules toast
  `시련의 규칙`; no `bossKilled`; no chest/item pickups spawned.

### 11.2 Existing (QA-ASC unless stated)
| file | change |
|---|---|
| `tools/feel_test.mjs` (`CLASS_PICK`, `setClass`) | add one asc per hero (`Q.setAsc(id)`); C-series once per hero with the asc active (hitstop totals unchanged) |
| `tools/qa/painted_registry.mjs` | keep the CLASSES loop; add "every ASC id resolves via `artClass` to a manifest entry" |
| `tools/qa/visual_review.mjs` | tiers `[0,1,2,3]`; one hidden shot per hero; ult/awaken shots at tier 3; wings-over-cape check |
| `tools/qa/perf_budget.mjs` | one tier-3 ult + awakening per hero; `lia_umbra` with 2 clones; `sera_bellsaint` active; `PERK_STATS` p95 ≤ 0.1 ms/frame (high) |
| `tools/test_part2.mjs` | script checks over `SCRIPTS_TRIALS`/`SCRIPTS_EXTRA` (known cmds only, speakers resolve, labels resolve, lengths) + "every `H({...})` in Part 2/side scripts has 7 hero keys + `default`" + trial script ids exist |
| `tools/balance.mjs` (+ `balance_companions.mjs` untouched) | default rows unchanged (asc never auto-applied; ascensions are not in `next[]`); `--asc t3\|hidden` sets `h.asc` for rows with level ≥ 70/75, multiplies atk/mag by `est.dps`; `--check --asc` fails if atk-effect delta > +12 % or eHP delta > +15 % vs the same row without asc; trial fight-length probe (Lv 70/75 model hero vs `T.level`) target 40–75 s |
| `tools/test_achievements.mjs` | unchanged 67; assert `ACH_EVENTS` lacks `ascChanged` |
| `tools/test_gallery.mjs` | unchanged (theatre 8) |
| `tools/online/test_online.mjs` | unchanged |

### 11.3 Done gate for every package
`node tools/test_ascension.mjs`, `node tools/test_perks.mjs`, `node tools/test_part2.mjs --static`, `node tools/test_achievements.mjs`,
`node tools/online/test_online.mjs`, `node tools/balance.mjs normal <hero> --check` ×7, `node tools/qa/painted_registry.mjs`, plus
the package's own probes. QA-ASC runs `tools/qa/run_all.mjs`. Fonts: lead, once, after all text lands.

---------------------------------------------------------------------------------------------------------------------------

## 12. Performance budget (unchanged budgets, perf_budget.mjs)
No canvas creation after stage start (cached sprites, vector strokes, pooled ghost bitmaps); ≤ 3 particles/tick steady state per
signature, ≤ 24 on releases; ult/awaken peaks untouched; proc hitstop 0; DoTs (pyre, cloud, floor fire, lullaby) use the DOT
damage-number style and the `DMG_CAP`. Known risks: `lia_umbra` clones (1 on low), `sera_bellsaint` erase loop (O(entities) per
toll), `bran_bloodtyrant` numbers.

---------------------------------------------------------------------------------------------------------------------------

## 13. Work packages (disjoint file ownership, order)

Cross-owner needs → `/tmp/claude-0/plan/requests_f.md` (`[FROM→TO] file: change`). A file in two packages only across waves.
**Start condition:** the BM wave has committed (it owns `hud.js`, `tab_status.js`, `menu/common.js`, `game.js`, `feel_move.js`,
`ach_meta.js`, `front/achievements.js`, `options.js` until then). Every package ends with its own verify pass (impl + verify).

### Wave 0 (parallel, ~2–3 h)
| package | owns | notes |
|---|---|---|
| **ASC-CORE** | NEW `src/data/ascensions.js` (35 entries, verbatim §4/§5), NEW `src/data/trials.js` (14 rows from story_ext §2), NEW `src/data/skills_asc.js` (7), NEW stub `src/game/trial.js` (frozen §9.3 API; `startTrial` toasts `준비 중인 시련입니다`); edits `src/game/progression.js`, `src/game/state.js`, `src/game/stats.js`, `src/render/hero_puppet.js`, `src/render/hero_parts.js` (wingCol line), `src/data/skills.js` (merge, canLearn, equipSkill, resetSkills), `src/core/save.js`, `src/core/cloud.js`, `src/core/events.js`; NEW `tools/test_ascension.mjs` | blocks HOOKS, UI, TRIALS |
| **STORY-TRIALS** | NEW `src/data/story_trials.js` (`SCRIPTS_TRIALS`) | story_ext §1–§3 |
| **STORY-GAPS-A** | `src/data/story_p2.js`, `src/data/story_p2b.js`, `src/data/story_ex.js` | story_ext §5 (A rows) |
| **STORY-GAPS-B** | NEW `src/data/story_extra.js`, NEW `src/game/story_director.js` (first commit = stub `hubStoryEnter(){}`), `src/data/story.js` (merge lines for `SCRIPTS_TRIALS` + `SCRIPTS_EXTRA`, other §5 B rows) | story_ext §5 (B rows) |

### Wave 1 (after ASC-CORE; parallel, ~2–3 h)
| package | owns |
|---|---|
| **HOOKS** | NEW `src/game/class_perks.js` (§3.3, PerkLayer) + empty stubs `class_perks_a/b/c/d.js`; edits `src/game/player.js`, `src/game/combat.js`, `src/game/world.js` (§3.4 + §9.2), `src/game/skills.js` (non-ult regions: castSkill fallback, hookBus templar removal, inquisitor tag, hellfire C6 + `_heatK`, bladedancer C-x1, FXKIT additions, `bindPerkKit`), `src/game/inventory.js` (rules label); NEW `tools/test_perks.mjs` |
| **UI-CHURCH-CLASS** | `src/scenes/town/church.js`, `src/scenes/menu/tab_class.js`, `src/scenes/menu/tab_skills.js`, `src/scenes/menu/access.js`, `src/scenes/menu/tab_status.js`, `src/render/hud.js` (name only), `src/scenes/town/party.js`, `src/scenes/front/slots.js`, `src/scenes/front/cloud_ui.js`, `src/data/town.js` (SHOP_LINES), `src/data/npcs.js` (hideFlag) |

### Wave 2 (after HOOKS; parallel, ~3–4 h each)
| package | owns |
|---|---|
| **PERKS-A** (kael, sera) | `src/game/class_perks_a.js`; `classes.js` kael+sera `def` blocks (perk text); `ascensions.js` kael+sera entries (string/number touch-ups only, matching `N`) |
| **PERKS-B** (victor, bran) | `src/game/class_perks_b.js`; classes.js victor+bran blocks; ascensions.js victor+bran entries |
| **PERKS-C** (lia, azel) | `src/game/class_perks_c.js`; classes.js lia+azel blocks; ascensions.js lia+azel entries |
| **PERKS-D** (isolde) | `src/game/class_perks_d.js`; ascensions.js isolde entries; `skills_asc.js` number touch-ups for **all seven** hidden actives (single owner of that file in wave 2) |
| **ULT-AWAKEN** | `src/game/skills.js` ult region only (`castUltimate`, `TIER_ZOOM`…`prewarmHero`), `src/render/ultfx.js`, `src/game/awaken.js`, `src/data/awaken.js`, `src/scenes/awaken_cutin.js`, `src/scenes/overlays.js` (UltCutin region only) |
| **TRIALS-ENGINE** | `src/game/trial.js` (replace stub), NEW `src/scenes/trial_end.js`, `src/scenes/stage.js`, `src/scenes/index.js` (1 line), `src/scenes/pause.js` (trial item + name), `src/scenes/town/hub.js` (church spawn/open, STORYDIR line, name); NEW `tools/test_trials.mjs` |
PERKS packages edit `classes.js`/`ascensions.js` in parallel only by unique-string replacement inside their own heroes' blocks.

### Wave 3 (~2–3 h)
**QA-ASC** owns `tools/feel_test.mjs`, `tools/qa/painted_registry.mjs`, `tools/qa/visual_review.mjs`, `tools/qa/perf_budget.mjs`,
`tools/test_part2.mjs`, `tools/balance.mjs`; runs §11.3 + `run_all`, files defects to owners. **Lead**: fonts rebuild, balance
sign-off, release.

### Later
**ARCADE-PICKER** (benchmark item): `src/scenes/front/arcade.js`, `arcade_run.js` (+ `asc` payload), `src/core/online.js`
(`cleanResult` asc), arcade menu UI.

### Scope estimate
≈ 13 packages × (impl 2–4 h + verify ~50 %) ≈ 55–65 agent-hours; with 6–8 agents in parallel the critical path
(ASC-CORE → HOOKS → PERKS → QA) is ≈ 1.5–2 days.

### Ordering risks
1. `skills.js`: HOOKS (wave 1) then ULT-AWAKEN (wave 2) — strictly sequential, different regions.
2. `hub.js`/`pause.js`: only TRIALS-ENGINE. `story.js`: only STORY-GAPS-B. `classes.js`/`ascensions.js`: ASC-CORE (wave 0) then
   PERKS-A..D (wave 2, disjoint blocks).
3. Stubs (`trial.js`, `story_director.js`, `class_perks_*.js`) make every import resolve from the wave that needs it; owners
   replace bodies without changing export names.
4. Ids in this document are frozen; renaming any id after ASC-CORE lands is a breaking change.

---------------------------------------------------------------------------------------------------------------------------

## 14. As built — deviations (2026-10-08, DOCS; appended after Phase F landed — §0–§13 above stay frozen)

Sources: package reports and their VERIFY sections (`/tmp/claude-0/fw0/asc-core.md`, `fw1/hooks.md`, `fw1/ui-church-class.md`,
`fw2/perks-a.md`…`perks-d.md`, `fw2/ult-awaken.md`, `fw2/trials-engine.md`, `fw2/arcade-leftovers.md`, `fw3/ui-core.md`) and
`/tmp/claude-0/plan/requests_f.md`. The code is the source of truth; the contract map is `docs/ARCHITECTURE.md` §16. Every
changed number below was changed in the module's `N` table and in the player-facing perk text together (text ↔ `N` checked by
each package's comparison script and by `tools/test_perks.mjs`).

### 14.1 Power numbers changed for the §2.8 budget
| entry | spec (§4/§5) | as built | why (package measurement, scripted A/B "sig" = on vs registry-off) |
|---|---|---|---|
| `kael_grandtemplar` | burst 위력 100~300% | 80~250% | +14.8 / 14.7 / 10.4 % → inside the +5–10 % target band (PERKS-A, 3 seeds) |
| `kael_bloodreaver` | crescent 위력 140%, hitstop 0.03 | 120%, hitstop 0 | +12.7…13.0 % before; §3.6.1 allows proc hitstop only on release moves ≥ 1.5 s apart and the crescent ICD is 0.8 s |
| `sera_archsaint` | sanctum heal 2 % / 0.5 s | 1.5 % / 0.5 s (`zoneHeal`) | eHP ×1.68–3.2 at 2 % |
| `victor_purgatory` | overheat `p._heatK {r: 1.5, mv: 1.25}` | `{r: 1.2, mv: 1.15}` (one frozen object per hero, set at overheat, null at the vent) | 19 / 25 % → 9.9 / 11.1 % mob/pack |
| `bran_vanguard` | shield bash 위력 120%; 2nd/3rd wave 80% | bash 80%; extra waves 30% (2 delayed waves via `K.setTimeoutFx`, the legacy crusader wave stays the first) | 31 / 30 % → 14.3 / 10.0 % |
| `bran_conqueror` | a hit under 15 % max HP keeps the combo | keeps it but takes 25 % off (`keepLoss 0.25`; text `…콤보를 끊지 않고 25%만 깎는다.`); loss and cue live inside `keepCombo` (also on the deep-water choke path) | keeping it whole read +23 % single / +44–47 % pack |
| `bran_bloodtyrant` | +2 % per stack | +1 % per stack | 19 / 20 % → 9.4 / 10.6 % |
| `victor_silverwolf` (hidden) | gauge +3 per hit, full moon 8 s, ×1.15, pierce +2 | +2, 6 s, ×1.10, pierce +1 | +111 % pack before (pierce on lined-up dummies); single target now ≈ est 1.08 |
| `lia_umbra` | clone 위력 35% | 25% | — |
| `azel_nightlord` | mist tick 15 % every 0.25 s | 10 % every 0.4 s (text 「0.4초마다 위력 10%」) | also keeps its numbers at 2.5/s, under the §3.6.3 limit |
| `azel_bloodemperor` | fires on every finisher | 8 s ICD (text adds 「8초에 한 번」) | bloodking overheal refills the 10 % barrier in ≈ 1.5 s → +40 % before |
| `azel_nephilim` | feather 30 %, eclipse 100 %, same-target eclipse ICD 2 s | 10 %, 60 %, 3 s | +28 % / +38 % before |
| `isolde_skysovereign` | +1 landing bolt per 240 px fallen | per 120 px | verified falls: single jump held 3/6/10/16 frames → 89/121/156/195 px, jump + air jump → 164/223/289/360 px; at 240 tap/touch-length jumps never added a bolt. Extra bolts beyond the foe count land beside the hero (from the 2nd on, alternating behind), so a lone target takes at most one: +16–21 % sig at a dive every 2.5 s, +9 % with no extra bolt |
| `isolde_abyssdragoon` | 용염 counts fire hits, max 30 | fire **and dark** hits (`N.dark = 1`; wyrm_breath alternates fire/dark ticks), max 20 | fire-only never filled on one target in 30 s; at 30 one 흑룡 돌진 per ≈ 40 s (+2–5 %), at 20 single +4–6 %, packs +14 % |
| `isolde_speargod` | +1.5 % per stack, per hit; 관통 일섬 250 % | 1 stack per swing (first target that swing hits), +0.3 % per stack, 관통 일섬 150 % | spec numbers +28 % single; now +14 % single / +6 % packs |
| `isolde_skysovereign` air-jump burst | 6 particles, ICD 0.2 s | 4 particles (same ICD) | §3.6.3: > 4 particles needs ICD ≥ 0.25 s |
| `data/skills_asc.js` (7 hidden actives) | §5 | unchanged — every `v` key is read via `skillVal`; `asc_bran_oathbanner` stays `dmg [80, 12]` (≈ 0.22 mv/s of cooldown from its knights, mid-pack among the 7: kael 0.21 · sera 0.25 · isolde 0.25 · victor 0.32 · lia 0.38 · azel 0.40; PERKS-B's +37 % counted the banner's own +15 % aura) | PERKS-D owner review |

### 14.2 Behaviour deviations by package
- **ASC-CORE (data, API, save)**: `migrateAsc` normalises only fields that already exist (never adds `trials`/`ascUnlocked`/…),
  so pre-ascension saves stay byte-identical (`tools/test_save_v2` "v1 data unchanged"); `newHero` adds the defaults, and every
  reader must tolerate absent fields (`hero.trials?.[tid]`, `hero.ascUnlocked?.includes`, or the progression API). `cloud.js
  summarize` adds `asc` only when set (client summary = server `saveSummary` for non-ascended saves); `saves.list()` uses
  `asc ?? null`. `canAscend` 'trial' reason picks 을/를 by the trial name's last syllable. `unlockFromTrial` also grants the hidden
  skill Lv 1 (same as the `migrateAsc` re-grant). `canStartTrial` 'hero' also fails when `state.charId` is another hero. Extra
  reason strings not in this spec: '알 수 없는 시련이다', '다른 헌터의 시련이다', '최상급 직업에서만 초월할 수 있다', '알 수 없는 길이다',
  '다른 헌터의 길이다'. `TRIALS` rows carry an extra `boss` id (church modal 「보스: {name}」). Extra exports `LOOK_KEYS`, `TOP_KEYS`.
- **HOOKS (registry core, hook sites, world options)**: `firePerks` is fixed-arity (≤ 5 args, no rest arrays); `perkAny` stops at
  the first `true`; `perkHurt` returns a reused `{dmg, armor}` (read at once); `procAtk` also takes `hitstop` (clamped ≤ 0.08),
  `hitId`, `dir`, `launch`, `rehit`, and (UI-CORE) `dmgColor`/`mult`. Bus handlers find the world through a microtask-deferred
  `window.__game.world` (World emits `roomEntered` before `game.world` is assigned); the PerkLayer room token is `world.map`.
  Extra exports: `HOOK_NAMES`, `ENTRY_KEYS`, `MARK_CAP`, `setPerkRegistry`, `clearPerkMemo`, `perkChain`, `perkRegistry`,
  `perkEnter`, `attachLayer`, `drawPerkLayer`, `markedCount` and (UI-CORE) `perkQuiet`, `meterHidden`, `markAnchor`.
  `PERK_STATS` = `{calls, ms, layerMs, errors, timing, last}`. `onSkill` fires after cooldown/MP are set. `playerHurt` carries
  `{amount, attack}` (gimmick choke still passes `source`). The templar `playerHurt` 20 % counter was removed from skills.js and
  re-implemented as `PERKS_A.kael_templar.afterHurt` (same boom, legacy tags `['skill']`, colour `#ffd870`); inquisitor tip boom
  tags `['melee', 'inq']`; hellfire wall hits count as misses.
- **UI-CORE follow-ups**: one core town rule `perkQuiet(w)` (mode 'town' or `w.perkQuiet`) — a town world's Player perks are pinned
  to the empty list and the layer/onEnter/onUlt refuse there (per-entry `w.mode === 'town'` guards in `class_perks_b.js` stay,
  harmless). Meters are hidden while the hero is hidden, during `world.cutscene`/`hudHidden` and under a cut-in (`meterHidden`).
  **No z 11 meter pass** — content modules keep their offsets (`METER_DY` 38 in A/C, `HEAD` 32 in B). Boss marks anchor through
  `markAnchor` (highest hurtbox top, below the HUD band, above the boss's live damage column). Proc damage numbers (§3.6.3 / §12
  "DOT style + DMG_CAP") are rate-limited in `core/particles.js` `fx.dmg`: per target a new proc number at most every `PROC_GAP`
  1/3 s, the rest merged into the live one (`o.proc`, `o.dmgStyle 'dot'|'proc'`, or `fx.procScope` raised by `procStrike` /
  `K.uHit{proc:true}`); projectile/SkillFx procs coalesce only once impact.js forwards `attack.proc` (request open).
  `blockable`/`quietExpire` were **not** bound into `K` (a static `guardian.js` import would add a combat ↔ class_perks cycle);
  `class_perks_a.js` keeps a behaviour-identical local copy. Church/keeper additions: `albertoNews` 'NEW' pill on 「안쪽 방 — 신부님」,
  `SHOP_LINES.*.base` (switch back to plain tier 2) and `.trialBack` (returned without clearing) keeper lines.
- **PERKS-A (kael, sera)**: `K.boom` → local `nova` (same strike, ≤ 12 particles, coloured numbers) for grandtemplar, templar C3,
  archsaint revive, archsage burst; sealbearer adds 1 seal per swing per target (dedupe on `p.curHitId`); sanctum and first-seal
  circles snap to the floor below (`K.groundAt`, ≤ 7 tiles); bellsaint active tolls do not feed the passive 8-hit counter (§5 "no
  passive counter"); elementalist "기본 공격" = player attacks without skill/sub/ult/awaken/assist/companion/mount tags.
- **PERKS-B (victor, bran)**: headsman execute burst behind `icd 0.25`; gunking/headsman read 0 % in hit-every-2 s / 1e7-HP
  scripted sims by design (no-hit streak +10.4 / 9.2 %; execute analytic ≈ +8 %).
- **PERKS-C (lia, azel)**: kit substitutions — own gradient-free shuriken/dagger/feather renderers (instead of `K.shurikenRender`,
  `K.daggerRender`, `K.featherRender*`, `K.featherShape`, which build gradients per draw), own `bloodSpike` (3 particles) instead of
  `K.spikeFx` (≈ 65), `blast()` instead of `K.boom`, frostwing feathers are self-steering SkillFx with a 500 px search. **§0.3
  correction:** umbra clones are a vector shade — `K` has no hero-bitmap pool (`K.ghostOf` returns a snapshot that needs
  `drawHero`); a `K.heroBitmap` was requested. Nightlord ticks share one time bucket per enemy; umbra clones share one hitId per
  swing. Dawnblood (after VERIFY): a second lethal hit after the 0.8 s i-frames ends borrowed time (spec §5), and a borrow is
  dropped when `stats.deaths` changes or the stage is cleared (no stale kill after a respawn). Bladequeen release trail ≤ 20 ×
  quality particles. `asc_lia_frostwing` is in `mount.js` `DISMOUNT_SKILLS`; `tools/test_mount.mjs` also scans the `ACTIVES_X`
  bodies.
- **PERKS-D (isolde)**: soulherald wings are vector strokes (`K.wing` builds a gradient per call); soul javelins are procs.
- **ULT-AWAKEN**: `ultimateCast`/`awakenCast` `asc` = `ascOf(hero)?.id ?? null` (an invalid raw `hero.asc` is never reported).
  ultfx promotes an awakening session from tier 2 to 3 when the hero is 초월/비전 (internal `awTier`), because the directors pass a
  literal `tier: 2` (A: `awaken_directors.js` begin/final, B: `awaken_directors_b.js` finals) — directors unchanged. New exports
  `awakenPrefix(tier, kind)`, `ascAwakenOf(classId, asc)`. 비전 각성 uses `T3_BOOST(T2[classId])` with the T2 label/desc, so the T2
  desc numbers understate the boosted values (no UI shows awaken desc; lead decision if one is added). Extras beyond §7 at the same
  budgets: cut-in '초월'/'비전' tag, accent stripes/speed lines, double gleam, tier-3 name-plate line, awakening cut-in sweep, seal
  ring, head halo, English path name, band tint, letterbox 46. Later fixes (SWEEP2): the HUD gauge label reads `heroTier` →
  '초월 각성'/'비전 각성'; perk procs during an awakening share its 30 % boss cap (`world.awProcCap`, `world.procCapFn`).
- **UI-CHURCH-CLASS**: the church grid's 64 px "current class" header is folded into the left 32 % preview column; tier-2 class
  cards have a 2-text-line floor and the column becomes a scroller (follows pad/keyboard focus) when 4·(card + strip) do not fit;
  strip taps are 36 UI px, kind 'dense'; asc status texts '해금됨' / '선택하지 않은 길' / '잠김' / 'Lv N 필요' / '초월 가능!' /
  '현재 직업'; status-tab path pills keep the current pill whole and shorten earlier ones longest-first. The church card shows the
  whole perk only on the selected card (others 2 lines + '…'); the class-tab detail shows the whole perk and scrolls.
- **TRIALS-ENGINE**: `T.diffOver` keys are multiplied into the difficulty value (`boss.js` reads `bossHp` as absolute; `bossHp`
  falls back to `enemyHp`) — hard `tr_kael_1` = 1.4 × 1.3 = 1.82. `hero.trials[tid].best` = boss-fight seconds (arena entry → defeat,
  intro excluded), not `w.run.time`. Start banner `big: true` + a rule toast 0.9 s later. Leave/quit open the church class tab
  (not only spawn at the church); a retry skips the pre script; a quit counts as a try only during the boss fight; §9.3
  `rec = hero.trials[T.id] ??= {}` is `trialRecord(hero, tid)` (creates `hero.trials` on old saves). Kept from §9.2/HOOKS: trial
  kills still emit `enemyKilled` (bestiary, `stats.kills`, kill quests and kill achievements move); no `stageCleared`/`bossKilled`/
  `levelUp`; trial deaths still advance the achievement 'deaths' progress (`playerDied`) while lives and `stats.deaths` stay. The
  HUD still shows score/lives in trials (never saved/decremented). Later fix: the return scroll (`c_warp`) is refused inside a
  trial ('시련의 결계가 귀환을 가로막는다 — 일시정지의 「시련 포기」로 돌아갈 수 있다').
- **ARCADE-LEFTOVERS (the "later" ARCADE-PICKER, §10.3)**: the 초월 preset is a separate list `ASC_PRESETS` ('초월자', Lv 80,
  wtier 7, `asc: true`, `p2: true` — amended by VERIFY: listed only when Part 2 is known; `?preset=5` without Part 2 falls back
  to preset 0) appended after `LEVEL_PRESETS` via `ALL_PRESETS`/`presetOf(i)` (cfg.preset 5) — `LEVEL_PRESETS` is unchanged
  because tools/online/test_online compares it to the server. The picker `ArcadeClassScene` ('arcadeClass') runs after 헌터 선택
  only for that preset and is registered at runtime by `startArcade` (not in reg_front.js); it lists `ascListOf(charId)` t3 + the
  hidden ids this device has seen (`meta.ascSeen`; konami shows all), last choice in `meta.arcadeAsc[charId]`; daily never.
  `?asc=<id>` URL param. **§0.3 / §10.2 correction:** the online result now carries an optional `asc` (client `ASC_RE` +
  `cleanResult`); the server is untouched and drops it (`checkResult` whitelist), submissions stay valid through `cls` (tier-2
  parent). Hidden paths play at hero Lv 85 against preset-80 enemies on shared boards (lead decision pending).
- **QA-ASC**: `tools/balance.mjs --asc all|t3|hidden|<id> [--check]` (spec: `--asc t3|hidden`) uses a closed-form stat layer plus a
  Node arena (`tools/qa/lib/asc_arena.mjs`: real Player, `hitTarget`, `impact`, perk hooks, no render) instead of multiplying by
  `est.dps`.

### 14.3 Factual corrections to the frozen sections
- §0.2 table "no `skills_asc.js` runtime file": `src/data/skills_asc.js` exists as **pure data** (§2.3); the runtime actives are
  `ACTIVES_A..D` — consistent, no runtime module.
- §0.3 "lia_umbra … cached silhouettes (`K.ghostOf`, the awakening clone pool)" → vector shade (see 14.2 PERKS-C).
- §0.3 / §10.2 "Online `asc` field deferred" → client sends it; server ignores it (14.2 ARCADE).
- §1.2 step 1 "`h.trials` not an object → `{}`" → only existing fields are normalised; absent fields stay absent (14.2 ASC-CORE).
- §2.5 events: add `playerHurt {amount, attack?}` (HOOKS). `classChanged {charId, classId, asc}`, `ascChanged {charId, classId,
  asc, prev, first}` (not in `ACH_EVENTS`), `ultimateCast`/`awakenCast` + `asc` — as specified.
- §2.7 `hero_parts.js` `K.L?.wingCol` → `G.wingCol` (no `K` in `drawWing`'s scope; `hero_puppet.puppetFor` sets it on every hero
  draw, `drawTurnWings` from `I.look`).
- §3.3 `PERK_STATS = { calls, ms, errors }` → `{ calls, ms, layerMs, errors, timing, last }`.
- §3.7 "calls `drawMeter` of the active hero's entries" → skipped while `meterHidden(p, w)`; no meters in town (`perkQuiet`).
- §9.2 lists exp/loot/companion only → confirmed as built: score, `enemyKilled`, bestiary and `stats.kills` still move in trials.
- §9.3 `completeTrial` record line → `trialRecord(hero, tid)`; `best` = boss-fight time.
- §11.2 `balance.mjs --asc t3|hidden` → `--asc all|t3|hidden|<id>` (14.2 QA-ASC).
- §12 "DoTs … use the DOT damage-number style and the `DMG_CAP`" → proc/DoT numbers are coalesced per target by `PROC_GAP`
  (14.2 UI-CORE).

### 14.4 Balance pass
**Pending** — the lead's sign-off file `/tmp/claude-0/fw3/balance_signoff.md` did not exist when this section was written.
Known so far: the per-package A/B tunes in 14.1 (each signature measured inside or near the +5–10 % band in its own scripted sim).
The first `node tools/balance.mjs normal --asc all --check` run (QA-ASC, 2026-10-08 17:19 UTC, `/tmp/claude-0/fw3/balance_asc.md`)
exits 1: §2.8 budgets (Σmult, single mult, flats) pass for all 35, but the closed-form **stat layer** is over the §11.2 limits for
15 entries (atk-effect > +12 %: kael_bloodreaver 16.9, kael_blackwing 19.0, victor_specter 15.7, victor_headsman 15.2,
victor_gunking 13.9, bran_conqueror 12.9, lia_umbra 20.1, lia_mirage 15.6, lia_bladequeen 14.5, azel_bloodemperor 14.2,
isolde_speargod 15.2, victor_silverwolf 16.7, lia_frostcrow 13.7; eHP > +15 %: kael_grandtemplar 24.8, bran_bastion 27.8 — the
「초월 보정」 crit/agi overflow and the chain `dmgReduce` are the likely contributors), and `bran_vanguard` sustained sig is +27.6 %
(> +20 %); warnings for bran_bastion / victor_silverwolf / bran_oathlord sig > +12 %, lia_mirage siege eHP sig +61 %, and the
trial-length model (all 14 trials model-kill far under the 40–75 s band — the model has no dodging, boss i-frames or second forms,
so it is a ratio check, not a verdict). No numbers were changed after this run at the time of writing; the lead decides.
