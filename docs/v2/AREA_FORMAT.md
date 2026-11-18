# AREA_FORMAT — 지역 자료 모양 (WORLD 구역)

2026-11-17 · 첫 판 (22:10 UTC). 코드 `src/v2/world/` · 검사 `node tools/v2/world_check.mjs` · 걸어 보기 `index.html?scene=v2c&area=<id>`.
이 문서만 보고 ENGINE · PLAY · UI · STORY 가 맞출 수 있게 적는다. 바꾸면 아래 "바뀐 것"에 한 줄.
(The body is in English so that every lane can read it fast. Player-visible names are Korean.)

## 바뀐 것
- 11-18 02:55 **WORLD-2, final re-check** — nothing in the areas changed since 02:10; §13.5 now holds the numbers measured again on the final tree (every check of §10 / §13 exits 0; `story_check` 0 errors, 28 warnings "area is built now").
- 11-18 02:00 **WORLD-2** (§13 — new section, everything below is additive; no spawn, exit, section, group or actor of the five older areas was renamed or moved). `AREAS[id](flags)` builds an area **for the given story flags** (`AREA_FLAGS`, §13.1); new interact kind **`ring`** (whip ring, §13.2) → `stage.hookPoints`; new areas **`belltower_now` · `ossuary_now` · `ossuary_past`** (§13.3); `eshville_now` actor `hadwin`, `eshville_past` actor `elise` (`when: 'elise_found'`), Edmund's `when` may be `past_street_clear`; `graveyard_*`: the ossuary forecourt is a terrace 140 above the field behind a broken stair — trigger `grave.edmund`, actor `edmund`, whip ring `depths_ring`, `interact road_bell`; new fields `area.flags`, `area.entry`, `area.knells`, `enemies[].rise`, `stage.folds`; `ENEMY_KINDS` + `banshee_queen`; draw calls per chunk went down (ENV_KIT §18). Numbers in §13.5.
- 11-18 00:50 **PROPS-VERIFY** (review by another lane, `docs/v2/ENV_KIT.md` §17). Nothing in the area shape changed. Collision boxes now match what is seen: cart `solid: 90, solidZ: 36`, `goods` `solidZ: 40`, brazier `solid: 30, solidZ: 24` (22 × 22 beside the church door, where the actors stand). The generated `lanternpost` now has its origin under the post (arm toward +x, toward −x when flipped): `LAMP` (eshville) and `LP` (graveyard) shift it by 20 so it stands where it did; **a new placement puts the POST at the part's x**. The pack's `h` is the height of the decimated model (cart 88, lanternpost 176.5, chapel 205.5, plaguepost 194.3): a part's `h` scales against that, and every generated model now starts at y = 0 (the lantern post floated 11 units).
- 11-18 00:10 **PROPS** (generated models and painted surfaces, `docs/v2/ENV_KIT.md` §16). Nothing in the area shape changed. New for whoever places props: prop names `goods` (barrels + crates + sacks), `chapel` (small tomb chapel), and the four generated gravestones behind `mesh:'grave'` / `mesh:'tomb'` (kinds `round point broken cross`; `obelisk` and `ledger` stay code-built). A part may say **`code: true`** to get the code-built version of a prop even though the pack has a generated one of that name (used for lantern and plague posts where the hero can walk behind them: the generated posts are thicker and hid him). `lit: false` on a `lanternpost` now also darkens the generated lantern glass. Fires: the visible flames are still the static `mesh:'fire'` (new leaf shapes + ground embers); **`area.anchors` of kind `fire` / `embers` / `smoke` are unchanged** — the game scene should add particles there. Placements changed: the graveyard field's three dead trees stand outside the side walls (crowns over the battlements), one `chapel` in the north-west corner, coffins bigger (`h` 58–62), `eshville_*` outskirts got `goods` instead of barrel + crate / sacks + barrel, slice0 garden angels are `h` 178 and its well `h` 120. Hidden-hero cells are equal or lower than before in every area (§12 numbers updated in ENV_KIT §16).
- 23:15 **WORLD-VERIFY** (review by another lane): `graveyard_*` inner gate wall is now a low wall with a railing (was 190 high and hid the hero behind it), the 1697 keeper's hut is lower (132 + roof 30, no chimney); burnt ruins made by `house()` always collide up to 800 (a 96-high ruin in `eshville_now` could be hopped into → the hero fell through the world); `stage.spawns[i]` now also carries `face` (§2). Numbers of the graveyard in §11 re-measured. Mismatches with ENGINE_API.md are listed in `/tmp/claude-0/v2/requests.md` (section WORLD-VERIFY) and in §12 below.
- 22:10 first version (shape and names fixed; areas arrive the same day — see §8 for what exists).
- 22:55 `graveyard_past` added (twin of `graveyard_now`).
- 22:45 areas exist and validate (`eshville_now`, `eshville_past`, `graveyard_now`, `slice0`). Corrections to the first version: static meshes are opaque (no alpha cut-outs — removed `KIT_TEX.alpha`); a texture name may be a relative path (`'../props/props_atlas'`); **a locked exit should be solid** (§3); `stage.decals[].k` has 8 kinds (§2); `anchors` kinds listed in §6; `AREAS.slice0` added so the test route also gets its baked statues (§9).

## 1. One area = one object

`src/v2/world/index.js` exports

```js
export const AREAS = { eshville_now: async () => area, eshville_past: async () => area, graveyard_now: async () => area, … };
export function validateArea(area, twin = null)   // → { errors: string[], warnings: string[], stats: {…} }   (pure JS, runs in node)
export async function validateAll()               // every area + twin consistency → { [id]: {errors, warnings, stats} }
export const ENEMY_KINDS                          // ['melee','ranged','skeleton_soldier','skeleton_mage','plague_corpse','grave_ghost','gravekeeper_armor','bat']
export const DEFAULT_AREA = 'eshville_now';
```

`await AREAS[id]()` returns a **fresh plain object** every call (safe to mutate):

```js
{
  id: 'eshville_now',                 // same key as in AREAS
  name: '에슈빌',                      // Korean, shown to the player (place name only; the night is shown by the HUD from `era`)
  era: 'now',                         // 'now' = tonight 1797 | 'past' = that night 1697
  twin: 'eshville_past',              // the same place in the other era (null if none). twin.twin === id, same spawn names, same exit ids
  room: 'street',                     // default reverb tag: street | alley | courtyard | hall | crypt | tower | field
  rooms: { square: 'courtyard' },     // per-section override (section id → tag)
  music: 'village_burning',           // music id (STORY/ENGINE map it to a track; null = keep what plays)

  stage: { … },                       // §2 — the env-kit stage, pass it to compileEnv(area.stage). This is what draws and collides.

  spawns:   { default: { x, z, face: [dx, dz], section: 'outskirts' }, from_graveyard: {…}, bell_fall: {…} },   // §3 named entry points
  exits:    [ { id, x0, x1, z0, z1, to: 'graveyard_now', spawn: 'from_eshville', label: '안개의 묘지', locked: null } ],   // §3
  actors:   [ { id, model: 'sera', x, z, face: [dx, dz], talk: 'sera.square', pose: 'idle', r: 16, solid: true } ],          // §4 people
  enemies:  [ { kind: 'skeleton_soldier', x, z, group: 'outskirts_a', active: false, yard: false } ],                        // §4
  triggers: [ { id, x0, x1, z0, z1, event: 'bell.first', once: true } ],                                                     // §5
  interact: [ { id, kind: 'bell', x, z, y: 0, r: 70, label: '종', event: 'bell.ring' } ],                                    // §5
  anchors:  [ { id, kind: 'fire', x, y, z, size: 1.0, light: true } ],                                                       // §6 effect anchors
  camera:   { outskirts: { yaw, pitch, dist, lookY, … }, street: {…} },                                                      // §7 (same objects as stage.sections[i].cam)
}
```

Units and axes are the charter's: logical px, x right, z into the screen, y up; a person is about 104 tall. All positions are **feet positions on the ground**; `y` may be omitted (= ground height at x,z from the kit's collision).

## 2. `stage` — the env-kit stage (unchanged format)

Exactly the format of `src/v2/env/stage_slice0_env.js` (docs/v2/ENV_KIT.md §4): `{ id, name, start, goal?, sky, fog, light, sections, spawns, chunks, parts, decals }`.

- `compileEnv(area.stage)` (from `src/v2/env/build.js`) → `W` (boxes, lights, sections, spawns, fog, light, sky, `env{meshes, bounds, decals, fx, stats}`). Nothing else is needed to draw and collide.
- The area loader **fills three stage fields from the area fields**, so you never have to merge by hand:
  - `stage.start` = `spawns.default` (`{x, z}`)
  - `stage.spawns` = `enemies` mapped to the kit/B spawn shape `{ kind, x, z, yard, active, group, face }` (what `Sim` already reads from `W.spawns`; `face` = the enemy's `face` or null)
  - `stage.sections[i].cam` = `camera[section.id]`
- Textures: `W.env.stats.textures` lists the texture names the meshes use. A name is either a v1 tile (`flag block brick wood dirt`) or a kit file at `assets/v2/env/<name>.webp`. **One name is a relative path: `'../props/props_atlas'`** = `assets/v2/props/props_atlas.webp`, the atlas of the baked props. ENGINE's current loader (`ASSET_ROOT + 'v2/env/' + n + '.webp'`, `KIT_TEX[n]?.repeat ?? true`) already loads it correctly — the browser resolves the `..`. Everything in the static meshes is opaque; there are no alpha cut-outs.
- **Baked props** (angel statue, gargoyle, dead tree — and generated models later) come from `assets/v2/props/props.bin`. It must be in memory before `compileEnv`: `AREAS[id]()` does that (`ensureWorldAssets()`). If it is missing, low-poly stand-ins are used and nothing breaks.
- Ground decals `stage.decals[] = { k, x, z, rx, rz, y?, a? }`, `k` ∈ `moss puddle stain crack scorch ash leaves straw`. The sprite sheet for all eight is drawn by `drawDecalSprites(ctx, ox, oy)` in `src/v2/env/decals.js` (4 × 2 cells of 128 px; default alphas in `DECAL_ALPHA`). ENGINE's own copy knows only the first three — unknown kinds are skipped, so areas still load; importing the shared function shows all of them.
- No flat cards: areas made by WORLD contain **no** `prop` with `img` (W.sprites has no `kind:'prop'`). Statues, gargoyles, bells … are baked 3D props inside `W.env.meshes`.
- Sections: `{ id, label (Korean), x0, x1, z0, z1, cam, room? }`. Every walkable spot is inside exactly one section.

## 3. Spawns and exits

- `spawns[name] = { x, z, face: [dx, dz] (unit vector the hero looks along), section }`. `default` always exists. Entering an area with an unknown spawn name falls back to `default`.
- `exits[i] = { id, x0, x1, z0, z1, to, spawn, label, locked }` — an axis-aligned box on the ground. When the hero's feet are inside and `locked` is null → `gotoArea(to, spawn)`. `locked` is a string key (e.g. `'key_graveyard'`, `'story:bell_tower'`); STORY decides when it opens. **While locked, ENGINE should treat the exit box as solid** (the gate or door prop stands there; there is no other collision for it) and raise event `exit.locked {id, locked}` when the hero pushes against it. `locked: 'not_built'` = the target does not exist yet.
- Areas not built yet still appear as `to` targets; check `AREAS[to]` before travelling (if missing: toast the `label` and stay).
- Twin rule: an area and its twin have the same spawn names at the same coordinates (the bell crossing keeps `x, z`): `gotoArea(area.twin, null, { keepPosition: true })` is always safe — the layout (floors, walls, collision of buildings) is generated from the same function for both eras; only dressing, lights, people and enemies differ. Props that block the way in one era only are kept off the main path (validated: every spawn/exit is reachable in both eras).

## 4. People and enemies

- `actors[i] = { id, model, x, z, face, talk, pose, r, solid }` — `model` is a file id in `assets/v2/char3d/` (`alberto edmund elise hadwin hadwin1 lotte marta rook sera villager_f villager_m`), `talk` is a STORY dialogue key (WORLD invents readable keys like `'sera.square.now'`; STORY may rename — tell WORLD), `pose` is a clip hint (`idle | talk | kneel | sit | lantern | work | cower`), `r` = talk/collision radius (default 16), `solid` (default true) = the hero cannot walk through. Optional: `tint: [r,g,b]` (villager colour per era), `when: 'flag'` (STORY flag; absent = always).
- `enemies[i] = { kind, x, z, group, active, yard, face }` — `kind` ∈ `ENEMY_KINDS`. `group` = a name; enemies of one group wake together and `triggers` may reference it (`wake: 'group'`). `active: true` = already hunting when the area loads. `yard: true` = counts for "clear the arena" (kept from the prototype). `bat` may stand over a pit (it flies); every other kind must stand on reachable ground.
- Old kinds `melee` and `ranged` stay valid (prototype rules map them to the skeleton soldier / mage).

## 5. Triggers and interactables

- `triggers[i] = { id, x0, x1, z0, z1, event, once = true, wake?: group, data? }` — when the hero's feet first enter the box, raise story event `trigger {id, event, data}` (ENGINE_API §6). `wake` activates an enemy group.
- `interact[i] = { id, kind, x, z, y?, r, label, event, locked?, data? }` — `kind` ∈ `bell | door | sign | chest | lever | grave | rest | shop | pull` (`grave` = a nameless grave to carve, `rest` = candle/rest spot, `pull` = something the whip pulls). The hero within `r` of `(x, z)` may use it → event `interact {id, kind, event, data}`. `label` is Korean (button caption). The prop itself is already in the stage; `interact` only says where the hot spot is.

## 6. Effect anchors (fires, smoke, mist) — not baked brightness

`anchors[i] = { id, kind, x, y, z, size, light, group? }`, `kind` ∈ `fire | embers | smoke | mist | candle | glow_red | fog_bank | leaves`. The stage already contains the matching **light** (baked into vertex colours and readable by `lightAt` for characters) and a flickering glow sprite; the anchor is where ENGINE's fx should emit particles (`docs/v2/FX.md`). An area renders correctly with anchors ignored. `eshville_now` fires are anchors + lights, so the "fires go out" village state later = same stage without them (`stage` is produced by a function of flags — §8).

## 7. Camera rigs

`camera[sectionId]` = the prototype rig object (`{ yaw, pitch, dist, lookY, leadX, leadZ, minX, maxX, zFollow, yawLead, tallK, center }`, radians) — the same object as `stage.sections[i].cam`. Rule kept from the kit: nothing taller than the camera path between camera and play space; overhangs only above head height (80).

## 8. Areas (status)

| id | name | era | twin | what is there |
|---|---|---|---|---|
| `eshville_now` | 에슈빌 | now | `eshville_past` | burning outskirts (2 groups of skeleton soldiers) → main street (inn, house with the trapped villager = `interact trapped_door` kind `pull`, smithy; soldiers + mages) → square with the well (arena group `sq`, Sera + the wounded man appear `when: 'square_clear'`, Rook's corner) → church front on a terrace (Alberto, Elise, the big bell = `interact big_bell`, rest candles, bell tower door = exit `to_belltower`) + the graveyard road and gate (exit `to_graveyard`, locked `key_graveyard`) |
| `eshville_past` | 에슈빌 | past | `eshville_now` | the same layout, cool moonlight, thatch, harvest stalls, plague posts and black flags, candles; plague corpses in three groups; Lotte at the tower door, Edmund at the tavern door, Hadwin I at the smithy, two villagers at the stalls, Rook in the same corner |
| `graveyard_now` | 안개의 묘지 | now | `graveyard_past` | road between grave gardens (soldiers, bats) → inner gate (elite `gravekeeper_armor`, rest candles) → grave field with solid stones in rows, the four Valkrein stones (`interact valkrein_stones`), two nameless graves to carve (`kind: 'grave'`), ghosts, mausoleum = exit `to_ossuary` (locked) |
| `graveyard_past` | 안개의 묘지 | past | `graveyard_now` | the same layout, tended: upright stones, three Valkrein stones (the fourth is not there yet), warm lanterns, the keeper (`actors keeper`, model `villager_m`) at his lit thatched hut — the hut is a roofless ruin tonight; plague corpses on the road; the nameless graves are `kind: 'grave'` here (carve) and `kind: 'sign'` tonight |
| `slice0` | 시범 구간 | now | — | the old test route as an area object (v2c default, v2bench uses the prototype stage directly) |

| `belltower_now` | 종탑 | now | — | the climb inside the bell tower: five floors, stairs and ledges at alternating ends, three broken floors to jump, the bats' roost, the bell chamber with the big bell, the rope and Elise (§13.3) |
| `ossuary_now` | 배웅의 납골당 | now | `ossuary_past` | the same nine rooms under a hundred years of coffins and bones; the coffin corridor is walled up by coffins; the Banshee Queen in the last hall (§13.3) |
| `ossuary_past` | 배웅의 납골당 | past | `ossuary_now` | a candle-lit chapel cave in use: candelabra, new coffins on trestles, the statue-or-crate choice at the gap, four empty bell posts (§13.3) |

Section ids: eshville `outskirts street square church graveroad`; graveyard `road field`; belltower `stairs top`; ossuary `entry coffins wedge arena lamp riddle rest boss posts`. Spawn names: eshville `default from_west from_graveyard from_belltower bell inn square`; graveyard `default from_eshville from_ossuary gate`.
Exit targets named but not built: `belltower_past`, `stable_*` (`belltower_now` and `ossuary_*` exist since WORLD-2). Place names use only glyphs the fonts have (font check passes; no name had to be changed).

## 9. What ENGINE has to do to load an area (short)

1. In `src/v2/game/seams.js`: `export const WORLD_LOADER = () => import('../world/index.js');` — the file exists now. Route the default too: `AREAS.slice0` returns the test route **after** the baked props are loaded (calling `compileEnv(STAGE)` directly before `ensureWorldAssets()` gives low-poly stand-in statues).
2. `const area = await AREAS[id]()` → `const W = compileEnv(area.stage)`. Textures: every name in `W.env.stats.textures` (§2 — no loader change needed). Meshes: `W.env.meshes[i] = { chunk, tex, data, count }` as today, chunk bounds in `W.env.bounds`.
3. Hero at `area.spawns[spawn ?? 'default']`, looking along `face`. Note `compileEnv` puts the hero start at `spawns.default`; for another spawn set the hero position after `new Sim`.
4. `Sim` gets `W`; enemies are in `W.spawns` as `{ kind, x, z, y, yard, active, group }` with the six real kinds. People from `area.actors` (honour `when`). Exits (solid while locked) / triggers / interact: test the hero's feet each tick.
5. Reverb: `area.rooms[section.id] ?? area.room`. Music: `area.music`. Effects: `area.anchors` (§6).
6. Budgets measured in scene v2c (headless, fold_open): see §11.

## 10. Validation and tools

- `validateArea(area, twin)` (pure JS): required fields, Korean name, era, **no flat prop cards left**, the stage itself (`validateEnv`), then a breadth-first walk on a 20-unit grid over **the kit's own collision** (`W.boxes`: floors, walls, raised pavements, door steps, prop footprints; steps up to the jump height) from `spawns.default`:
  every spawn reachable and inside the section it names · every exit / trigger box contains reachable ground · every actor stands on ground, not inside a wall or prop, and the hero can get within talking distance · every enemy (except `bat`) stands on reachable ground · every interact has reachable ground within its radius · ids unique, kinds known, groups referenced by `wake` exist · twin: points back, other era, same spawn names and coordinates, same exit boxes, same sections, **same floors and building footprints**.
- `node tools/v2/world_validate.mjs` — all areas in node (0.5 s). `node tools/v2/world_check.mjs` — validation + scene v2c on fold_open and phone2: opens each area, 0 page errors, per-spot numbers against budgets (static ≤ 35,000 triangles, frame ≤ 40 draw calls, textures ≤ +8 MB over the test route), and **a bot walks from the default spawn into every exit box** (route from the same reach grid), then captures to `/tmp/claude-0/v2/world/shots/`; `python3 tools/v2/world_sheet.py` makes the sheets.
- Walk an area today: `index.html?scene=v2c&area=eshville_now` (`&spawn=square`, `&peace=1` = no enemies, `&areanav=0` = do not follow exits). Prototype rules: the six kinds are mapped to the prototype's melee / ranged, people are not drawn (v2c has no actor renderer), exits to built areas reload the scene in the target area, locked exits are only announced.
- Look without the game: `tools/v2/env_view.html?area=eshville_past` (section camera buttons), `?mode=gallery` (every prop).

## 11. Numbers (scene v2c, headless fold_open, 2026-11-17 22:44 UTC)

| area | static triangles (whole area) | chunks: triangles / draw calls | worst view: static triangles · frame draw calls | lights | GL textures vs test route |
|---|---|---|---|---|---|
| `eshville_now` | 33,840 | out 5,545 / 10 · street 6,956 / 10 · east 21,339 / 13 | 33,840 · 37 (street by the inn: all three chunks in the frustum) | 55 | 35.8 MB (+5.4) |
| `eshville_past` | 34,455 | out 6,028 / 11 · street 6,779 / 11 · east 21,648 / 13 | 34,455 · 39 | 59 | 37.1 MB (+6.7) |
| `graveyard_now` | 21,473 | road 7,447 / 7 · field 14,026 / 12 | 21,473 · 23 | 9 | 33.1 MB (+2.7) |
| `graveyard_past` | 21,520 | road 7,462 / 7 · field 14,058 / 13 | 21,520 · 24 | 10 | 34.4 MB (+4.0) |
| `slice0` (test route) | 29,045 | street 10,961 / 9 · north 18,084 / 10 | 29,045 · 32 | 43 | 30.4 MB |

Frame numbers include the hero model (19,638 triangles, 4 draws). Headless Chromium is a software renderer: frame times there say nothing about the device.

## 12. Review (WORLD-VERIFY, 2026-11-17 23:00–23:20 UTC)

Tools: `node tools/v2/world_verify_node.mjs` (no browser: an independent walk flood with the rules' own `moveXZ` on a 10-unit grid, open edges, props without collision on walkable ground, lights under the floor, camera rays from the section rig to the hero's feet / chest / head against the static meshes) · `node tools/v2/world_verify_shot.mjs` (scene v2c on fold_open and phone2 with **real touch events** on the virtual stick: a push from every spawn, the last stretch into every exit box; worst view over a lattice of standable spots; captures; enter / leave five times) · `node tools/v2/world_verify_owner.mjs` (owner sheet).

- Collision: no standable cell outside a section in any area; no open edge into nothing left (one was found and closed: the 96-high burnt ruin at x 360..520, z 300 in `eshville_now` — anything lower than about 130 can be hopped over: jump apex 112 + step 18. **Rule for new areas: every wall the hero must not cross needs `h` ≥ 130 or `collideH`.**)
- Props without collision that the hero walks through: the open cemetery gate leaves (`cemgate`, by design) and ground candles (5 places). The coffin at `graveyard_*` (300, 1300) had no collision either — it is a solid prop now. Roadside graves, trees and the angel in the non-walkable gardens stand on visual-only floors at y 0 (fine).
- Lights under the floor: none. Fires at y 70 / 72 on the outskirts are on the ruin's wall top (intended).
- **Hero hidden by the world** (all three rays blocked, worst of both facings, fold_open / phone2): `eshville_now` 317 / 323 of 13,386 cells (2.4 %), `eshville_past` 425 / 428 of 13,201 (3.2 %), `graveyard_now` 538 / 597 of 5,741 (9.4 %; was 1,131 = 19.7 %), `graveyard_past` 649 / 713 (11.3 %; was 1,301 = 22.7 %), `slice0` 311 / 344 of 7,786 (4.0 %). Left in the graveyard: behind each gate post (70 × 300), behind the dead trees and tall angels, a narrow band behind the hut. In `slice0` the two garden angels (now meshes, as big as the old cards) hide about 100 cells each. Left in Eshville: behind the big bell and the terrace statues, along the east wall of the grave road.
- Spawn `bell` (4200, 1390) faces the bell 16 units ahead on purpose; every other spawn has free ground along its `face`.
- GL resources: enter / leave ×5 in `eshville_now`, `graveyard_now`, `slice0` — `__v2` gone and the GL canvas removed every time, texture and buffer bytes identical on every re-entry, 2 DOM canvases throughout.
- Known gaps the format has (see requests.md): no way to unlock an exit, no `keepPosition` in ENGINE's `gotoArea`, `AREAS[id]()` takes no flags although §6 speaks of village states, `locked: 'not_built'` reads as a normal lock in ENGINE.

## 13. WORLD-2 (2026-11-18): area states, whip rings, the bell tower and the ossuary

Code `src/v2/world/{index,eshville,graveyard,belltower,ossuary,reach,folds}.js`, props `src/v2/env/props3.js`. Checks: `node tools/v2/world_validate.mjs` (every area in its base state **and in every flagged state**), `node tools/v2/world_check.mjs` (browser: + flagged states, the tower climb, the drop test), `node tools/v2/world_folds.mjs --check`.

### 13.1 Area states — `AREAS[id](flags)`

```js
const area = await AREAS.graveyard_now({ bell_hung: true, ossuary_open: true });   // no argument or {} = the base state (nothing done yet)
export const AREA_FLAGS   // { areaId: [flag, …] } — the story flags that change what the area is built from
export function areaStates(id)   // [{}, {flag: true} for each flag, all flags together] — what validateAll() walks (wedge_stone and wedge_wood never together)
export const stateName    // (flags) => 'base' | 'bell_hung+ossuary_open'
area.flags                // the flags the area was built with (a copy)
```

Unknown flags are ignored, so the scene may pass its whole flag table. A state changes **stage parts, collision, lights, anchors, actors, enemies, exits' `locked`, interacts** — never a spawn name, an exit id or box, a section, or (in twins) the shared floor plan. To apply a flag the scene rebuilds the area (`AREAS[id](flags)` + `compileEnv`, about 0.1–0.3 s in node) and keeps the hero where he stands. Scene v2c: `?area=<id>&flags=a,b`.

| area | flag | what it changes |
|---|---|---|
| `eshville_now` | `door_pulled` | the door of the house with the trapped villager stands open (the actor `trapped` already has `when: 'door_pulled'`) |
| | `gate_open` | the cemetery gate is drawn open, its collision is gone, exit `to_graveyard` is not locked (`locked: null`; shut = `key_graveyard`) |
| | `promise` | Elise is gone from the church front (she is up the tower, then lost in 1697) … |
| | `elise_home` | … and back again (`promise` + `elise_home` = she stands there) |
| | `bells_answered` | after the ending: every fire is out (no `fire` / `embers` anchors, no flame meshes, no fire lights — `smoke` anchors where the big fires were), cool moonlight and fog, no enemies (triggers keep their ids but wake nobody) |
| `eshville_past` | `past_gate_open` | the cemetery gate of 1697 open, exit `to_graveyard` unlocked (shut = `past_gate`) |
| | `past_street_clear` | nothing is built differently. **Passing this key at all** (true or false) makes Edmund's `when` `'past_street_clear'` instead of `'street_clear'`: the two meanings of `street_clear` (Marta tonight, Edmund in 1697) are then separate flags. A scene that never passes the key gets the old name, as before |
| `graveyard_now` | `bell_hung` | the road bell has hung in front of the ossuary for a hundred years: **the broken stair is whole tonight** (a `stairs` part instead of the rubble heap), the post carries a rusted bell, `interact road_bell` (`bell.ring`) exists |
| | `ossuary_open` | exit `to_ossuary` and `interact ossuary_door` are not locked |
| | `carved_a` · `carved_b` | a nameless grave that was given a name in 1697: candles on it, and its ghost is gone from group `ghosts` |
| `graveyard_past` | `bell_hung` | the post carries the new bronze bell, `interact road_bell` changes from `bell.hang` (label 「길종 걸기」) to `bell.ring` (「종 치기」). The stair stays broken in 1697 |
| | `carved_a` · `carved_b` | candles on the carved grave |
| `belltower_now` | `fell` | after the bell cracked: no Elise at the rope, no bats, no triggers |
| `ossuary_past` | `wedge_stone` · `wedge_wood` | what was pushed into the gap (§13.3): the statue on its plinth, or the wooden crate — the gap is bridged |
| | `knell_1` … `knell_4` | that bell post carries its knell (`area.knells[i].hung`) |
| | `queen_fled` | the Banshee Queen is here (she fled across the bell; `active: true`), unless `queen_sent` |
| | `queen_sent` | no boss |
| | `elise_found` | the sleeping girl and `interact oss_elise` are gone |
| `ossuary_now` | `wedge_stone` | the statue still stands in the gap — bridged tonight too (stone stays) |
| | `wedge_wood` | a heap of rot at the bottom of the gap — **not** bridged (wood rots) |
| | `knells_hung` | the four posts carry rusted knells |
| | `queen_sent` | no boss, no `boss.enter` trigger |

`when` flags on actors (the scene asks the story): `door_pulled` `street_clear` `square_clear` `sera_follows` `elise_found` `past_gate_open` `queen_sent` (+ `past_street_clear`, see above).

### 13.2 Whip rings — interact kind `ring`

```js
{ id: 'depths_ring', kind: 'ring', x: 644, z: 1866, y: 140, h: 150, r: 300, label: '채찍 걸기', event: 'ring.hook', landing: { x: 600, y: 140, z: 1905 } }
```

- `x, z` = where the ring's post stands, `y` = the ground under the ring, `h` = height of the ring's centre above `y` (default 150), `r` = from how far the prompt may be offered (the rules' own range is `hookRange` 330), **`landing: {x, y, z}`** = where the hero's feet come down (validated: ground exists there at that height, nothing solid, a warning beyond 330 from the ring).
- `finishArea` copies every ring into **`stage.hookPoints = [{ id, x, z, y, h, to: [x, z] }]`** — exactly what `src/v2/play/sim.js` reads as `W.hookPoints` (PLAY_API: `hero.hookId` = the ring in reach). Nothing else is needed from the scene; `interact` is only the hot spot for the prompt.
- The prop is `mesh: 'whipring'` (`src/v2/env/props3.js`): a thick iron ring on a bracket with a pale bell-silver line of light, a glow sprite and a small light pool — readable at night in both eras. `mount: 'post'` (default) | `'wall'` | `'hang'` (`drop` = chain length), `lit: false` = dead ring, `c` = colour (`RING_GLOW`).
- Placed where GDD 9.1 teaches and uses the hook (minute 58–68): **`graveyard_past` and `graveyard_now`, on the edge of the ossuary terrace above the broken stair**. Edmund hands over the road bell at its foot (trigger `grave.edmund` on the near side, box 480..720 × 1640..1700), the ring lifts the hero onto the terrace, the bell post stands at (500, 1940).
- Reachability (`reach.js`): a ring within 300 of reachable ground makes its landing reachable; a crossing at a `bell.ring` interact carries the flood to the same x, z in the twin night and back (both nights are flooded together). The validator therefore accepts places that are only reached by the whip or through the other night.

### 13.3 New areas

**`belltower_now`** (GDD 9.1 minutes 15–20). 720 wide. Floor k (k = 0…4) is a slab from the ground up, 136 higher and 160 deeper into the screen than the one before, so the raised camera reads the whole climb and nothing in front is taller than what stands behind it; the bell chamber is floor 5 (y 680, z 880…1280).
- way up: stone stair (right) → floor 1 (gap) → wooden stair (left) → floor 2 (the bats' roost under floor 3's edge) → ledge half a floor high (right) → floor 3 (gap) → wooden stair (left) → floor 4 (gap) → ledge (right) → the bell chamber. A floor edge is 136 high: it cannot be hopped (jump 112 + step 18), the stairs and ledges are the way.
- **a fall lands on the floor below** — a gap is a notch whose ground is the lower floor, every x, z of the tower has ground at y ≥ 0, there is no pit (`world_check` drops the hero on a 60-unit lattice over the whole tower: 252 of 252 land on a floor, unhurt).
- sections `stairs` (z < 880) · `top`; spawns `default` = `bottom` (360, 80) · `top` (360, 940); exit `to_eshville` → `eshville_now` spawn `from_belltower`; triggers `tower_roost` (`tower.roost`, wakes group `tower_roost`: 2 bats) and **`tower_top` (`tower.top`, wakes `tower_bats`: 5 bats, `yard`)**; actor **`elise`** at the rope (232, 1102), talk `elise.promise`; anchors: two brazier fires, a dust shaft, the red moon. The fall itself is the story's `gotoArea('eshville_past', 'from_belltower')`.
- `eshville_now` exit `to_belltower` (spawn `bottom`) now has a target. `belltower_past` is not built (`eshville_past` still warns).

**`ossuary_now` / `ossuary_past`** (GDD 4, 9.1 minutes 68–114) — one layout function, two nights; one hall 1000 wide going into the screen, rooms told apart by floor, low banks and dressing (no wall across: the camera rule).

| section (label) | z | both nights | 1697 | tonight |
|---|---|---|---|---|
| `entry` (납골당 어귀) | 0–400 | exit `to_graveyard` (→ spawn `from_ossuary`), two mourner statues, bell `bell_entry` | candelabra | bone heaps, mist |
| `coffins` (관의 복도) | 400–1000 | low banks left and right, skull niche walls, bell `bell_coffins` | new coffins on the banks, candles | **walled up by stacked coffins** (z 640–770): cross at `bell_entry`, walk through in 1697, cross back at `bell_coffins`; trigger `oss.coffins` (wakes `oss_hall`: 2 soldiers, `rise`) |
| `wedge` (틈의 방) | 1000–1500 | the gap z 1200–1400 (a fall = the pit rule) | `interact oss_wedge` (kind `pull`, 「밀어 넣기」, event `oss.wedge`); the statue on its plinth (290, 1130) and the crate (910, 1130) stand ready | trigger `oss.gap` (**`once: false`**); the statue in the gap / a heap of rot |
| `arena` (곡하는 방) | 1500–2100 | the altar | lit altar, a coffin on trestles | trigger `oss.arena` (wakes `oss_arena`: 3 ghosts + 2 mages, `yard`) |
| `lamp` (등불대의 방) | 2100–2450 | the lantern stand (780, 2280) | | trigger `oss.lamp`; actor `sera` (`talk: 'sera.ossuary'`, `when: 'sera_follows'`) |
| `riddle` (석관의 방) | 2450–2800 | three sarcophagi, bell `bell_riddle` | | `interact oss_riddle` (kind `sign`, event `oss.riddle`) |
| `rest` (문 앞) | 2800–3000 | two waist-high fire posts and low rail walls = the door of the last hall | `interact past_rest` | **`interact boss_rest`** (kind `rest`) |
| `boss` (맨 안) | 3000–3700 | flat 1000 × 700, wall piers only (nothing to stand behind), the arena bell `bell_arena` in the middle (600, 3350) | the queen when `queen_fled` | trigger `boss.enter` (wakes `boss`: `banshee_queen` at (600, 3600)) |
| `posts` (종대의 회랑) | 3700–3900 | four knell posts (250 / 480 / 720 / 950, 3790), the sealed crypt door, two chandeliers | `interact knell_1…4` (kind `bell`, event `oss.knell`, `data: { post }`); actor `elise` (`when: 'queen_sent'`) + `interact oss_elise` | |

- spawns (both nights, same x, z): `default` = `entry` (600, 110) · `wedge_far` (600, 1450) · `lamp` · `rest` · `boss` (600, 3120). Bells: every `kind: 'bell'` with `event: 'bell.ring'` is a crossing spot.
- `area.knells = [{ post, x, z, y, h, hung }]` — the knell bells the whip strikes in the fight (for PLAY / the scene). `area.entry = ['wedge_far']` while nothing bridges the gap: spawn names that lie behind something shut in this state (the validator starts its flood from them too; `eshville_*` uses it for `from_graveyard` behind the shut gate).
- music ids `ossuary_now` / `ossuary_past`; room tags `crypt` (hall rooms: `arena boss posts` = `hall`).

### 13.4 Small additions

- `enemies[i].rise: true` → `stage.spawns[i].rise` (PLAY: lies in the ground until the hero is near). `ENEMY_KINDS` has `banshee_queen` (prototype rules map it to `melee`).
- A stage part may carry `state: '<flag>'`: it exists only in that story state of one night (the rebuilt stair) and is left out of the twin floor-plan comparison.
- `stage.folds` (filled from `src/v2/world/folds.js`): which small materials of a chunk are drawn with a look-alike texture (ENV_KIT §18). `compileEnv` reads it; a stage without it compiles exactly as before.
- Collision boxes from `compileEnv` all have the same keys in the same order (`uniformBoxes`, requests.md core-verify).
- Prop names new in `props3.js`: `whipring roadbell footbridge towerface beam rope roost debris rubble stoneblock` (code-built) and, from the pack, `sarcophagus coffinstack bonepile skullwall candelabrum chandelier altar mourner cryptdoor stairs stall2 wreck2` (`stall` / `wreck` / `niche` use the generated `stall2` / `wreck2` / `skullwall` when the pack has them; `code: true` keeps the code-built one).

### 13.5 Numbers (node + scene v2c, headless fold_open, final tree — measured again 2026-11-18 02:47–02:55 UTC)

| area | static triangles: base state · heaviest flagged state | chunks: triangles / static draws | worst view: static triangles · static draws · frame draws | lights | GL textures vs test route (50.2 MB) |
|---|---|---|---|---|---|
| `eshville_now` | 34,909 · 34,915 (`door_pulled`) | out 6,228 / 9 · street 7,111 / 10 · east 21,570 / 11 | 34,909 · **30** · 35 (the street by the inn: all three chunks) | 56 (45 with `bells_answered`) | 55.5 MB (+5.3) |
| `eshville_past` | 34,957 · 34,957 | out 6,072 / 9 · street 7,101 / 10 · east 21,784 / 11 | 34,957 · **30** · 35 | 59 | 56.9 MB (+6.7) |
| `graveyard_now` | 22,774 · 23,060 (all four flags) | road 7,322 / 7 · field 15,452 / 8 | 22,774 · 15 · 20 | 10 (13) | 48.8 MB (−1.4) |
| `graveyard_past` | 22,763 · 22,935 | road 7,328 / 7 · field 15,435 / 9 | 22,763 · 16 · 21 | 11 (14) | 50.2 MB (+0) |
| `belltower_now` | 12,954 · 12,954 | low 6,670 / 7 · high 6,284 / 7 | 12,954 · 14 · 19 | 14 | 48.8 MB (−1.4) |
| `ossuary_now` | 34,179 · 34,723 (`wedge_stone` + `knells_hung` + `queen_sent`) | c1 10,428 / 6 · c2 8,122 / 6 · c3 7,149 / 6 · c4 8,480 / 7 | 34,179 · 25 · 30 (the gap room: all four chunks) | 15 | 48.8 MB (−1.4) |
| `ossuary_past` | 26,895 · 27,471 (every flag) | c1 6,952 / 6 · c2 6,053 / 6 · c3 6,192 / 6 · c4 7,698 / 7 | 26,895 · 25 · 30 | 49 | 48.8 MB (−1.4) |
| `slice0` (through `AREAS`) | 30,133 | street 11,385 / 9 · north 18,748 / 10 | 30,133 · 19 · 24 | 43 | 50.2 MB |

- Budgets `world_check` enforces at every named spot: static ≤ 35,000 triangles, **static draws ≤ 30**, frame ≤ 40 draws, textures ≤ +8 MB over the test route. Frame draws include the hero model (19,638 triangles, 4 draws); `world_verify_shot` counts one more at its worst spot (35 in Eshville) than `world_check` at its named spots (34). "Worst view" = the worst over a lattice of standable spots (`world_verify_shot`, 17–59 spots per area), same on fold_open and phone2.
- Before this round (§11 / ENV_KIT §17): `eshville_now` 34,430 triangles · 33 static / 37 frame draws; `eshville_past` 34,706 · 35 / 39; `graveyard_now` 21,588 · 23 frame; `graveyard_past` 21,577 · 24 frame; `slice0` 30,000 · 24 frame.
- Hero fully hidden by the world (`world_verify_node`, fold_open / phone2, cells of 10 × 10): `eshville_now` 243 / 248 of 12,864 (was 313 / 318) · `eshville_past` 363 / 371 of 12,679 (was 421 / 423) · `graveyard_now` 461 / 514 of 4,929 (was 476 / 530) · `graveyard_past` 575 / 637 (was 590 / 653) · `belltower_now` 3 / 3 of 1,090 · `ossuary_now` 7 / 7 of 2,273 · `ossuary_past` 65 / 67 of 3,779 (behind the crate and the statue waiting at the gap, and the entry statues) · `slice0` 280 / 338 of 7,830 (was 270 / 330: **ten cells more**, behind the thicker generated props).
- The bot (`world_check`, both devices, 190 lines passed, 0 failed): every exit of every area in its base state and in the flagged states `gate_open`, `bells_answered`, `past_gate_open`, `bell_hung` (+ `ossuary_open`), `fell`, `wedge_stone`, `wedge_wood`, `knells_hung` + `queen_sent`; the tower climb door → bell chamber in 1,030 ticks with 7 jumps, 252 of 252 drops land on a floor; the rebuilt stair tonight (653 ticks); the gap over the statue plinth (2 jumps) and over the crate (2 jumps). The whip ring is crossed by setting the bot on the landing spot (scene v2c has no whip).
- Known notes from `world_verify_node` (exit 0): the gap's near edge in `ossuary_past` is an open edge by design (98 cells along z 1205: a fall is the pit rule, §13.3); props without collision on walkable ground: one bone heap in `ossuary_now` (440, 590, 44 high), in the tower a fallen beam, a debris heap and floor candles, and the ones §12 already lists.
