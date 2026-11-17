# AREA_FORMAT — 지역 자료 모양 (WORLD 구역)

2026-11-17 · 첫 판 (22:10 UTC). 코드 `src/v2/world/` · 검사 `node tools/v2/world_check.mjs` · 걸어 보기 `index.html?scene=v2c&area=<id>`.
이 문서만 보고 ENGINE · PLAY · UI · STORY 가 맞출 수 있게 적는다. 바꾸면 아래 "바뀐 것"에 한 줄.
(The body is in English so that every lane can read it fast. Player-visible names are Korean.)

## 바뀐 것
- 22:10 first version (shape and names fixed; areas arrive the same day — see §8 for what exists).

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
- Textures: `W.env.stats.textures` lists the texture names the meshes use. A name is either a v1 tile (`flag block brick wood dirt`) or a kit file. **Kit file path = `assets/v2/env/<name>.webp`, except names listed in `KIT_TEX` (src/v2/env/mats.js) with a `file` field** — then the path is `assets/v2/<file>` (the baked prop atlas lives in `assets/v2/props/`). ENGINE: please load `KIT_TEX[n]?.file ? ASSET_ROOT + 'v2/' + KIT_TEX[n].file : ASSET_ROOT + 'v2/env/' + n + '.webp'` and honour `KIT_TEX[n].repeat` (false = clamp) and `KIT_TEX[n].alpha` (true = the mesh uses alpha test; draw it with the same shader, it only needs `discard` below 0.5 — see §9).
- No flat cards: areas made by WORLD contain **no** `prop` with `img` (W.sprites has no `kind:'prop'`). Statues, gargoyles, bells … are baked 3D props inside `W.env.meshes`.
- Sections: `{ id, label (Korean), x0, x1, z0, z1, cam, room? }`. Every walkable spot is inside exactly one section.

## 3. Spawns and exits

- `spawns[name] = { x, z, face: [dx, dz] (unit vector the hero looks along), section }`. `default` always exists. Entering an area with an unknown spawn name falls back to `default`.
- `exits[i] = { id, x0, x1, z0, z1, to, spawn, label, locked }` — an axis-aligned box on the ground. When the hero's feet are inside and `locked` is null → `gotoArea(to, spawn)`. `locked` is a string key (e.g. `'key_graveyard'`, `'story:bell_tower'`); STORY decides when it opens — ENGINE treats a locked exit as a wall-less no-op and raises event `exit.locked {id, locked}` once per entry.
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

| id | name | era | twin | status |
|---|---|---|---|---|
| `eshville_now` | 에슈빌 | now | `eshville_past` | being built (burning outskirts → main street → square with the well → church front + bell tower door) |
| `eshville_past` | 에슈빌 | past | `eshville_now` | being built (same layout, candle light, harvest stalls, plague flags) |
| `graveyard_now` | 안개의 묘지 | now | `graveyard_past` (not built) | if time remains (road, gate, first graves) |
| `slice0` | 시범 구간 | now | — | the old test route, kept for v2c / v2bench |

Exit targets named but not built yet: `belltower_now`, `belltower_past`, `graveyard_past`, `inn_*`, `smithy_*`.

## 9. What ENGINE has to do to load an area (short)

1. `const area = await AREAS[id]()` → `const W = compileEnv(area.stage)`.
2. Textures: for each name in `W.env.stats.textures` → §2 rule (`KIT_TEX[n].file`). Meshes: `W.env.meshes[i] = { chunk, tex, data, count }` as today. Meshes whose texture has `KIT_TEX[tex].alpha` contain cut-out texels (leaves, iron bars): the fragment shader should `discard` when `texture.a < 0.5` (cheap; the prototype renderer already blends alpha so they also work unsorted with slight halos).
3. Hero at `area.spawns[spawn ?? 'default']`, looking along `face`.
4. `Sim` gets `W` (enemies are already in `W.spawns`). People from `area.actors`. Exits/triggers/interact: test the hero's feet against the boxes/radii each tick.
5. Reverb: `area.rooms[section.id] ?? area.room`. Music: `area.music`.
