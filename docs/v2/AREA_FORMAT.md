# AREA_FORMAT — 지역 자료 모양 (WORLD 구역)

2026-11-17 · 첫 판 (22:10 UTC). 코드 `src/v2/world/` · 검사 `node tools/v2/world_check.mjs` · 걸어 보기 `index.html?scene=v2c&area=<id>`.
이 문서만 보고 ENGINE · PLAY · UI · STORY 가 맞출 수 있게 적는다. 바꾸면 아래 "바뀐 것"에 한 줄.
(The body is in English so that every lane can read it fast. Player-visible names are Korean.)

## 바뀐 것
- 22:10 first version (shape and names fixed; areas arrive the same day — see §8 for what exists).
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
  - `stage.spawns` = `enemies` mapped to the kit/B spawn shape `{ kind, x, z, yard, active, group }` (what `Sim` already reads from `W.spawns`)
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
| `graveyard_now` | 안개의 묘지 | now | `graveyard_past` (not built) | road between grave gardens (soldiers, bats) → inner gate (elite `gravekeeper_armor`, rest candles) → grave field with solid stones in rows, the four Valkrein stones (`interact valkrein_stones`), two nameless graves to carve (`kind: 'grave'`), ghosts, mausoleum = exit `to_ossuary` (locked) |
| `slice0` | 시범 구간 | now | — | the old test route as an area object (v2c default, v2bench uses the prototype stage directly) |

Section ids: eshville `outskirts street square church graveroad`; graveyard `road field`. Spawn names: eshville `default from_west from_graveyard from_belltower bell inn square`; graveyard `default from_eshville from_ossuary gate`.
Exit targets named but not built: `belltower_*`, `stable_*`, `graveyard_past`, `ossuary_*`. Place names use only glyphs the fonts have (font check passes; no name had to be changed).

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
| `graveyard_now` | 21,336 | road 7,447 / 7 · field 13,889 / 12 | 21,336 · 23 | 9 | 33.1 MB (+2.7) |
| `slice0` (test route) | 29,045 | street 10,961 / 9 · north 18,084 / 10 | 29,045 · 32 | 43 | 30.4 MB |

Frame numbers include the hero model (19,638 triangles, 4 draws). Headless Chromium is a software renderer: frame times there say nothing about the device.
