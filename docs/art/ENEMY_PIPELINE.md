# 채색 적 파이프라인 (Painted Enemy Pipeline) — playbook

Art direction (lead decision): heroes, bosses, **regular enemies**, NPCs and companions are **painted cut-out puppets
cut from Kling art, with procedural VFX on top**, so the whole cast matches the painted Kling backgrounds and portraits.
This document is the playbook for the 67 Part 1 enemies and the 24 Part 2 enemies (`docs/specs/world2.md §5`).
Sister documents: `docs/art/PUPPET_PIPELINE.md` (hero), `docs/art/BOSS_PIPELINE.md` (bosses, `src/render/painted/kit.js`).

Reference implementation (all states done, verified in-game desktop + 844×390 mobile):

| id | tier | parts | Kling images | atlas webp | baked MB (desktop TD 2.4 / phone TD 1.25) | renderer |
|---|---|---|---|---|---|---|
| `bat` | T1 | flying body (dedicated Step-3 part), wing (mirrored), hanging cocoon | 5 | 14 KB | 0.13 / 0.04 | `src/render/painted/enemies/bat.js` |
| `ghost` | T1 + ectoplasm | shroud body, reaching arm, screaming head | 4 | 15 KB | 0.18 / 0.06 | `…/ghost.js` |
| `skeleton` | T2 | skull, jaw, ribcage, pelvis+loincloth, thigh, shin+foot, upper arm, forearm+hand, sabre, buckler | 6 | 27 KB | 0.33 / 0.14 | `…/skeleton.js` |
| `armor_knight` | T2 | cuirass+tabard, great helm, rerebrace (also cuisse), vambrace+gauntlet, greave+sabaton, longsword, tower shield, cape (`spec.scale 1.1`) | 5 | 38 KB | 0.55 / 0.20 | `…/armor_knight.js` |
| `gravedigger` | T3 | head+hat, hunched torso+hump, sleeve upper/lower, hand, coat tails, boot, shovel (handle lengthened at bake), lantern (+ dmg1/dmg2) | 7 | 48 KB | 0.75 / 0.31 | `…/gravedigger.js` |

Total Kling spend for the five: **27 images** (26 by the builder + 1 in the review pass: the bat's flying body, made by
following §3 Step 3 as written). Generation log (generation ids, inputs, result decisions; Step 1/2 prompts are
reproducible from `prompts.mjs`, single-part/edit prompts should be stored in the entry's `prompt` field — the builder's
five did not record theirs): `tools/painted/enemies/genlog.json`.
The chosen Step-1 reference of every enemy is kept as `tools/painted/enemies/<id>/src/<id>_ref.webp` (Step 3/4 need it
as 图片1; Kling result URLs expire after 24 h, so download the reference the moment you pick it).

**Production status (2026‑09‑28):** every drawn enemy is painted — 90/90 render ids (all 91 enemies except the invisible
`medusa_spawner`), registered through `src/render/painted/reg/{art-enemy-1…5, enemy-p2-c-art, enemy-p2-d-art}.js` (85) plus
the five references above, which `src/render/painted/enemies/index.js` registers itself; each
with its vector renderer kept as the fallback (`node tools/qa/painted_registry.mjs` → `cover.enemies`, `mod.enemy`).
Per-package Kling provenance: `tools/kling/manifest_art-enemy-<n>.json`, `manifest_enemy-p2-c-art.json`, `manifest_enemy-p2-d-art.json`.

---

## 1. Files and ownership

| path | what |
|---|---|
| `src/render/painted/enemy_kit.js` | enemy runtime kit: rig load/bake (one atlas per type), part drawing, warps, corpses, dissolves, particles. Its SEAM block imports the shared primitives from the boss core's `kit.js` (bake canvases, outline, silhouette, darken, damage bake, render RNG, texture density, bake time-slicing). |
| `src/render/painted/enemies/<id>.js` | one renderer module per painted enemy: `export const spec`, `export function draw(ctx, e, world, o, rig)` |
| `src/render/painted/enemies/_biped.js` | shared T2 biped pose (same contract as the vector `drawSkel/drawArmor`), swing trail, telegraph glint, IK, debris claim |
| `src/render/painted/enemies/index.js` | registry: render id → module; also registers `kind:'enemy'` entries in the shared `registry.js` |
| `src/render/enemies.js` | dispatcher hook: painted if registered + loaded, else vector (0.3 s crossfade when a rig finishes after the vector art was already shown); preload on `roomEntered` |
| `tools/painted/enemies/` | `prompts.mjs` (templates), `matte.py`, `insp_sheet.py`, `build.py`, `pipeline.py`, `<id>/parts.json` + `<id>/src/*.webp` (Kling sources **and the chosen reference** `<id>_ref.webp`), `gallery.html/js`, `shot.mjs`, `ingame.mjs`, `perf.mjs`, QA: `measure.mjs` (art vs logic/strike rects), `deathcheck.mjs` (airborne deaths, alpha probe, debris claim), `lifecycle.mjs` (re-bake / stage release / off switch), `bestiary.mjs`; `genlog.json` |
| `assets/painted/enemies/<id>/` | `atlas.webp` + `rig.json` (generated — never edit by hand) |

`src/game/enemy.js` is unchanged: `Enemy.draw` already calls `drawEnemy`; the hook lives in `render/enemies.js`.
Gameplay (AI, hurtboxes, timings, spawns, drops) is untouched by this pipeline.

## 2. Tiers

| tier | for | art | motion | draw budget / enemy | memory (desktop / phone) |
|---|---|---|---|---|---|
| **T1** painted sprite + procedural deformation | small or floating things: bats, skulls, heads, ghosts, wisps, slimes, eyes, books, fish, blobs | 1–3 painted frames/parts | squash/stretch, bob, tilt toward velocity, **mesh-free slice warps** (bending chain for wings/tails/tentacles, sheared strips for cloth/ectoplasm), attack lunge, hit squash, **strip-dissolve death** | ≤ 6 blits + strips (≤ 2×6) + ≤ 3 glows | ≤ 0.2 MB / 0.06 MB |
| **T2** mini puppet | walkers and humanoids, quadrupeds, winged bipeds | 6–10 parts on a small FK skeleton | driven by the enemy's own animation fields (`anim, animT, state, stateT, t, vx, vy, onGround, flashT, stun, dying, params.windup…`): walk cycle, wind-up → strike frame → recovery, hurt recoil, airborne pose, **death collapse into corpse pieces** | ≤ 14 blits + cloth strips (≤ 8) | ≤ 0.8 MB / 0.25 MB |
| **T3** large puppet | elites and big enemies (≥ ~90 px tall or wide, or story-important) | 8–14 parts, bigger textures | T2 + boss-kit tech: **damage variants by HP** (`dmg1` < 60 %, `dmg2` < 30 % via `kit.bakeDamage`), IK hands on weapons, pendulum/strand accessories, impact dust/embers, heavier collapse | ≤ 22 blits + strips | ≤ 1.5 MB / 0.5 MB |

Decision rules: flying/floating + ≤ 40 px → T1. Anything that walks on legs or wields a weapon → T2. ≥ 90 px, `kbResist ≥ 0.8`,
or an elite-feeling "mini boss" → T3. A **variant** of an existing rig (recolour, weapon/helm swap) reuses the rig and costs
0–3 images (see §6).

## 3. Kling prompt templates (`tools/painted/enemies/prompts.mjs`)

Model `kling-image-v3_0_omni`, 2k. Download immediately with `curl` (URLs expire in 24 h), keep the chosen images as
`tools/painted/enemies/<id>/src/*.webp` (q93) — **including the chosen Step-1 reference** as `<id>_ref.webp` even when
nothing is cut from it (Steps 3/4 and every later fix need it as 图片1) — and log everything in `genlog.json`.

**Shared suffixes** (keep them identical across the cast — this is what makes enemies match the portraits/backgrounds):
- `BG` — *"Isolated on a plain flat uniform medium grey background (#808080), no floor, no ground, no cast shadow, no scenery, no border."*
- `STYLE` — *"Dark gothic horror fantasy 2D action game enemy art, highly detailed painterly digital illustration in the same style as dark gothic fantasy character art, clear readable silhouette with bold value contrast so it still reads when small, warm key light from the upper front, cool blue rim light from behind, no text, no letters, no numbers, no labels, no watermark."*

**Step 1 — design reference** (`text_to_image`, `imageCount 2`, 3:4 walkers / 4:3 winged / 1:1 floaters):
`<subject>. Strict side view in profile facing right, full body from head to feet. <pose>. BG STYLE`
(pose for cutting: "arms held slightly away from the ribcage, legs slightly apart"; bats: "front three-quarter view, both wings spread").

**Step 2 — parts sheet** (`image_to_image`, image_1 = chosen reference, `imageCount 2`, 4:3):
`The same <who> as in 图片1 (keep the identical design, proportions, colours, materials and painting style), redrawn as a cut-out puppet parts sheet for 2D skeletal animation: each piece painted separately and laid out apart in a loose grid with wide empty grey gaps between them, no piece touching or overlapping another. The N pieces are: <p1>; <p2>; … Every piece is complete and whole, including the portions normally hidden behind other parts, all in the same strict side view facing right, same scale as each other. BG STYLE`
Do **not** number the pieces (Kling paints the numbers).

**Step 3 — single missing part** (`image_to_image`, image_1 = reference, image_2 = the sheet with the side view, `imageCount 1`):
`Only one object in the whole image: the <part> of the same <who> as in 图片1 and 图片2 (identical …) painted alone as a separate cut-out game sprite piece: <part detail>, WITHOUT <every neighbouring part>. Strict side view in profile facing right, exactly like the side-view <who> in 图片2, centred with a wide empty margin around it. BG (no other objects) STYLE`
For T1 creatures drawn in the front three-quarter view (bats, heads, blobs) replace the view sentence with the
enemy's `sheetView`: *"Front three-quarter view exactly like the <part> in 图片2"* (the bat's flying body, genlog
`part:fly_body`, came out usable on the first try this way; aspect 1:1).

**Inputs for image_to_image** (`kling-image-v3_0_omni` accepts only `file_upload` URLs or URLs of earlier Kling
results): convert the local `.webp` to JPG/PNG (`PIL … .save('x.jpg', quality=94)`; webp is rejected), call
`file_upload` with `contentType`, `filename`, `size` (bytes) → `ticket` + `upload_url`, then
`curl -X POST <upload_url> -F ticket=<ticket> -F "file=@x.jpg;type=image/jpeg"` → `data.url` is the input URL.
A ticket is single-use; reuse the returned URL for the same file.

**Step 4 — occluder removal edit** (`image_to_image` on an uploaded crop, `file_upload` → POST multipart):
`Edit 图片1: remove BOTH arms completely (…), and repaint the <body part> that was hidden behind the arm. Keep everything else exactly identical: … same strict side view facing right, same size and position, same painting style and lighting, same flat plain medium grey background.`

What Kling actually does (learned on the five references — plan for it):
- Step 2 usually returns a **turnaround sheet** (front + side full figures) plus *some* loose parts. That is still useful:
  loose parts are cut directly, the side-view figure supplies parts that are on top (near arm/leg, helm, skull).
- Parts that are occluded in every figure (ribcage behind the arm, cuirass, hunched coat) need Step 3 or 4.
  Step 3 sometimes changes the view (the skeleton ribcage came back as a front view) — Step 4 on the side figure kept the
  view and the scale and was the best source: one image gave skull/jaw/ribcage/pelvis+loincloth/thigh/shin in one scale.
- Kling will not drop a baked-in arm on request twice (gravedigger): cut the sleeve out as the near arm and **inpaint**
  the coat behind it (`parts.json → inpaint`, cv2 Telea) — at game size the smear is invisible behind the arm.
- Side views often face **left** → `flipX` in `parts.json`. A pale ghost on grey may come back on a dark backdrop → the
  parts sheet with "no mist on the background" fixed it.
- Grey steel on a grey background: the colour key punches holes in blades/plate → matte those sources with `--rembg`.
- "no cast shadow" is not always honoured (bat flying body): the matte removes most of it; crop the part `box` just
  above the shadow and add a short `fade` at the bottom edge.
- Weapons/tools come out **shorter than the gameplay reach** (gravedigger shovel: hand→blade 24 px painted vs 69 px
  vector / 122 px strike rect). Do not scale the whole part (the blade balloons): give the plain shaft two pivots `h0`,
  `h1` plus a `grip` pivot in `parts.json` and lengthen that section when the rig is baked
  (`spec.bake.stretch = { shovel: { from: 'h0', to: 'h1', ext: 22 } }`, §5). Check with `measure.mjs`.
- Budget reality per enemy: T1 3–4 images, T2 5–6, T3 6–8 (refs ×2 + sheet ×2 + 1–3 single/edit). Recolour variants 0.

## 4. Cutting: sources → atlas (`tools/painted/enemies/`)

```
python3 tools/painted/enemies/pipeline.py <id>|all      # matte every source, cut, pack → assets/painted/enemies/<id>/
python3 tools/painted/enemies/insp_sheet.py <matte.png> <out.jpg> [--crop x0,y0,x1,y1 --grid 20 --scale 1]   # author coordinates
```
Work files go to `tools/painted/.work/enemies/` (git-ignored); `preview_<id>.png` shows every part with its pivots.

- `matte.py` — watermark fill, rembg `isnet-general-use` soft matte + tight grey key (holes in membranes, gaps between
  bones), colour decontamination. `--soft` for translucent ghosts/ectoplasm, `--rembg` for grey steel.
- `parts.json` (per enemy):
  ```jsonc
  { "id": "skeleton", "tier": "T2", "srcTD": 4,                      // atlas texels per logical px (bestiary-safe)
    "sources": { "e": { "raw": "skeleton_edit.webp", "file": "skeleton_edit.png", "mode": "", "k": 0.0355 } },  // k = logical px per source px
    "parts": { "thigh": { "src": "e", "box": [x0,y0,x1,y1], "poly": [[x,y]…], "minus": [[[x,y]…]], "inpaint": [[[x,y]…]],
                          "fade": [[x0,y0,x1,y1,"down",power]], "keep": "largest", "flipX": false, "rot": 0, "k": 0.0355,
                          "piv": { "a": [x,y], "b": [x,y], "…": [x,y] } } } }
  ```
  Pivots are in **source pixels** (read them off `insp_sheet.py` crops at `--scale 1`). Choose `k` from the size the
  part must have in game (logical px ÷ source px, e.g. the bat's flying body: 21 px wide / 1500 px = 0.0145); after a
  build, `measure.mjs` tells you whether the figure fills its logic rect. Limbs: `a` = proximal joint,
  `b` = distal joint (the runtime aligns a→b with the bone direction, so parts may be painted at any angle).
  Scale `k` is anchored to the vector renderer's proportions (e.g. skeleton: 80 px tall → k = 80 / figure height).
- `build.py` — cut (box ∩ poly − minus, inpaint, fades), premultiplied resample to `srcTD`, colour bleed into
  transparent texels (no dark fringes under bilinear), shelf-pack → `atlas.webp` (q90, alpha q100) + `rig.json`
  (`parts.<name> = { rect:[x,y,w,h], piv:{…} }`, `srcTD`, cache-busting `v`).

## 5. Runtime (`src/render/painted/enemy_kit.js`)

Load/bake (once per enemy TYPE, time-sliced with `kit.nextIdle`, started on `roomEntered` behind the room fade for the
stage roster, or on first sight): `requestRig(spec)` fetches `rig.json` + `atlas.webp`, resamples each part to the device
texel density (`kit.textureDensity`: canvas scale × quality, min 1.25, max min(srcTD, 2.75)), bakes the variants the
`spec.bake` asks for — `base` (outlined), `flash` (white silhouette), `deep` (darkened far limbs), `glow` (colour
silhouette), `dmg1/dmg2` (+`deep_dmgN`) — and packs them into **one runtime atlas canvas per type**, so every part blit
of a type samples the same texture.

Per frame (inside `drawEnemy`'s feet-origin, facing-flipped, elite-scaled transform):
- `begin(ctx, rig, flash)` captures the base matrix; `put(name, pivot, x, y, rot, sx, sy, alpha, variant)` = one
  `setTransform` + one `drawImage` (+ the flash overlay while hit); `bone()`/`pivotPos()` for FK chains; `end()`.
- Reach fixes: `spec.bake.stretch[part] = { from, to, ext }` lengthens one uniform section (shaft, handle) between two
  pivots by `ext` logical px **at bake time** (pivots below it move with it; one blit per frame) — the gravedigger's
  shovel uses it so the art reaches the AI's strike rect. For a length that changes while playing (a thrusting spear, a
  hook chain paying out) use `putStretch(name, pv, x, y, rot, sx, sy, alpha, vn, y0, y1, ext)` / `stretchMap()` (3 blits;
  corpse pieces accept `stretch: [y0, y1, ext]`). `spec.scale` (e.g. knight 1.1) sizes the whole painted figure to its
  logic rect; the dispatcher applies it and corpses/dissolves inherit it (`rig.scale`).
- Warps (mesh-free): `chain()` bending chain (wings, tails, tentacles); `strips()` sheared strips for opaque cloth
  (capes, coat tails); `warpY()` seam-free re-raster of translucent parts into a small scratch canvas (ghost shrouds —
  per-strip overlap would double the alpha, abutting strips leave conflation seams; the scratch margins follow the
  sampled offsets, so any trail length is safe); `lod()`/`nStrips()` halve strips on
  the `low` quality setting.
- VFX: `glow()` cached additive puffs, `shadow()`, `FxPool` (tiny pooled render-only particles on the entity, drawn in
  camera space via `o.cam`), render RNG `fr/frand` (= `kit.rr`, never gameplay `Math.random`). Continuous streams use
  `const dt = pool.step(now); for (let n = pool.rate(key, perSecond, dt); n > 0; n--) pool.add(…)` — never
  `if (fr() < p)` per rendered frame (density would follow the monitor's refresh rate).
- `world.fx.ghost(cb)` callbacks inherit whatever `globalAlpha` / composite the previous particle left (embers flicker
  with `Math.random`): every callback sets `ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'` inside its
  own save/restore (the kit's corpse and dissolve do; `deathcheck.mjs` probes it).
- Death: `spawnCorpse()` (T2/T3) hands the posed parts to `world.fx.ghost` — pieces re-pivot on their centre, tumble,
  bounce and topple flat on the **real ground under each piece** (`groundBelow()` scans the tile map: an enemy killed in
  the air by a launcher collapses onto the floor below, pieces over a pit keep falling), dust puffs on that floor,
  fade; outlives the entity (`dieTime` stays 0.35 s). Pieces may carry `stretch` (drawn with `putStretch`). `spawnDissolve()` (T1) slices
  the pose into strips that drift, rise and wink out in noise order with ember/ectoplasm bursts. `claimDebris()` retires
  the generic vector bone/metal debris that `Enemy.die` spawned for the same body.

Renderer module contract:
```js
export const spec = { id, tier, src /* assets folder */, scale /* optional, default 1 */, bake: { outline, deep:{part|'*':k}, deepTint, glow:{part:'#hex'}, damage:{part:{char,cracks,holes,stain,crackMinLum}}, flash, outlineParts, stretch:{part:{from,to,ext}} } };
export function draw(ctx, e, world, o /* {flash, cam} */, rig) { … }   // world === null in the bestiary; must not mutate gameplay state
```
Register in `enemies/index.js` with `reg(mod, [renderIds…])`. Dispatcher behaviour: painted when registered + rig ready
+ enabled; else vector. Switches: shared `?painted=0` / `window.__paintedOff` / `settings.painted=false`; enemies only
`window.__paintedEnemies = false` (the `roomEntered` preload honours them too).

Rig lifecycle (`render/enemies.js` on `roomEntered`, i.e. behind the room fade):
- `refreshRig(spec)`: if the canvas scale changed by > 25 % since the bake (small window → fullscreen, rotation, quality
  changed by the player or by `game.autoQuality` on a slow phone) the type is re-baked in the background and swapped in
  when ready — live enemies never fall back to vector, corpses keep the old rig object.
- `releaseRigs(keep)`: entering a **different stage** drops the rigs that stage's roster does not use, so baked memory
  stays at one roster (≈ 3–5 MB desktop / 1–1.5 MB phone when all enemies are painted) instead of growing with every
  stage visited. Enemies spawned outside the roster (boss summons) bake on first sight and cross-fade in.

## 6. Rig reuse (keeps the Kling budget small)

A module may serve several render ids: pass variant options through the `spec`/draw closure. Planned reuse:
skeleton rig → `bone_thrower` (bone + sack part), `skeleton_archer` (bow + hood), `blood_skeleton` (kit `recolor` blood +
club; collapse/reform = corpse pieces reversed), `bone_scimitar` (2 scimitars + turban), `skeleton_knight` (helm, kite
shield, cape), `skeleton_mage` (robe + staff); knight rig → `axe_armor`, `spear_guard`, `royal_guard`, `frozen_knight`
(recolor `frost`), `mirror_knight`; bat rig → `golden_bat` (gold recolor + sparkles), `ice_bat`, `bat_swarm` (instanced
at LOD); ghost pipeline → `scholar_ghost`, `frost_wraith`, `glass_wraith`, `water_spirit`; wolf rig → `snow_wolf`,
`hellhound`; harpy rig → `storm_harpy`.

## 7. Classification — all 91 enemies

`imgs` = planned Kling images (0 = reuse/recolour). `●` = done.

### Part 1 (67)

| id | stage | size | tier | imgs | rig notes |
|---|---|---|---|---|---|
| mimic | s04+ | 48×44 | T1 | 3 | chest body + hinged lid part (jaw hinge), tongue `chain`, gold sparkle; closed/open states, jump squash |
| golden_bat | common | 30×24 | T1 | 0 | bat rig + `kit.recolor` gold, sparkles, blink when fleeing |
| **bat ●** | s01 | 34×26 | T1 | 5 | flying body + wing (`chain` ×2 mirrored) + hanging cocoon; hang/drop/dive/fly/hover/hurt/dissolve |
| zombie | s01 | 32×78 | T2 | 5 | humanoid rig; rise-from-ground = clipped by ground line + dirt FxPool; shamble walk (short stride, arm reach) |
| **skeleton ●** | s01 | 30×80 | T2 | 6 | 10 parts; walk/attack(overhead)/hurt/air/collapse |
| crow | s01 | 38×30 | T1 | 3 | body + wing `chain`; perched frame; dive stretch; feather dissolve |
| wolf | s01 | 62×40 | T2 | 5 | quadruped: body, head+jaw, fore/hind leg (reused ×2, deep), tail `chain`; crouch wind-up → charge stretch |
| possessed | s01 | 30×80 | T2 | 5 | villager humanoid + pitchfork part; thrust pose from vector `fork` |
| **ghost ●** | s02 | 36×56 | T1 | 4 | `warpY` shroud, reaching arm, scream head swap, ectoplasm FxPool, dissolve |
| wisp | s02 | 24×24 | T1 | 2 | 2 painted flame frames crossfaded + additive core; charge swell; ember burst |
| bone_thrower | s02 | 30×80 | T2 | 1 | skeleton rig + bone/sack parts, `throw` pose |
| **gravedigger ●** | s02 | 52×96 | T3 | 7 | IK hand on shovel, lantern pendulum, coat-tail strips, dmg1/dmg2, slam/fling dust |
| mud_man | s02 | 40×76 | T2 | 4 | mud body parts; sink/rise via ground clip + drip FxPool; strip wobble while moving underground |
| **armor_knight ●** | s03 | 40×88 | T2 | 5 | cuirass, helm, arm, leg, sword (back arm), tower shield, cape strips; collapse |
| axe_armor | s03 | 44×92 | T2 | 2 | knight rig + great-axe + horned helm; high/low throw poses |
| gargoyle | s03 | 56×52 | T2 | 5 | winged beast: body, head+jaw, wings `chain`, legs; stone-shell perch frame; fire-breath VFX |
| medusa_head | s03 | 32×32 | T1 | 3 | head + 4 snake `chain`s (hair); sine bob tilt; hiss lunge |
| medusa_spawner | s03 | 20×20 | — | 0 | invisible generator (`render:'none'`) — no art |
| skeleton_archer | s03 | 30×80 | T2 | 1 | skeleton rig + bow (string procedural) + hood + quiver |
| blood_skeleton | s04 | 30×80 | T2 | 1 | skeleton rig recolour (blood), club; pile/reform with corpse pieces |
| phantom_sword | s04 | 34×60 | T1 | 2 | sword part + spectral aura; quiver telegraph, dash smear (stretched afterimages) |
| lesser_demon | s04 | 40×64 | T2 | 5 | flying imp: body, head, wings `chain`, arms; dark-fire palm VFX |
| spear_guard | s04 | 38×90 | T2 | 2 | knight rig + spear + plume helm + tabard; high/low thrust |
| puppet_maiden | s04 | 30×62 | T2 | 5 | porcelain doll parts (loose joints), strings procedural, hop squash, needle burst |
| bone_pillar | s05 | 36×96 | T1 | 3 | stacked skull column (3 skulls bob independently) + hinged top jaw, heat glow, fire spit |
| mummy | s05 | 34×84 | T2 | 5 | humanoid + bandage lash `chain` |
| skeleton_knight | s05 | 36×88 | T2 | 2 | skeleton rig + dark armour pieces, horned helm, kite shield, cape strips |
| corpse_worm | s05 | 56×22 | T1 | 2 | one painted worm bent along a `chain` (crawl wave), rear-up lunge |
| bone_scimitar | s05 | 32×80 | T2 | 2 | skeleton rig + 2 scimitars + turban/sash; dual combo |
| book_fiend | s06 | 40×34 | T1 | 3 | book body + cover/pages flapping (`chain`), eye; paper-blade VFX |
| flea_man | s06 | 24×38 | T1 | 3 | crouch/leap painted frames + squash; giggle bob |
| skeleton_mage | s06 | 32×84 | T2 | 2 | skeleton rig + robe (strips) + staff; rune circle procedural |
| scholar_ghost | s06 | 40×70 | T1 | 3 | ghost pipeline (`warpY`) + floating books; teleport = dissolve/reverse dissolve |
| ectoplasm | s06 | 40×40 | T1 | 2 | blob `warpY` wobble + faces overlay; split = squash burst |
| slime | s07 | 40×30 | T1 | 2 | blob squash/stretch on hops, glossy highlight; split |
| homunculus | s07 | 28×50 | T2 | 4 | small humanoid, crouch → pounce stretch |
| flesh_golem | s07 | 60×100 | T3 | 7 | big brute, dmg variants (stitches tearing), slam dust, flesh wave VFX |
| plague_doctor | s07 | 34×84 | T2 | 5 | beak mask, coat strips, flask throw |
| acid_turret | s07 | 44×70 | T1 | 3 | distiller body + bubbling liquid procedural, charge glow |
| merman | s08 | 34×80 | T2 | 5 | humanoid + fins, spit; water drip FxPool |
| killer_fish | s08 | 38×26 | T1 | 2 | fish body `chain` swim wave; leap arc tilt |
| frog_demon | s08 | 54×44 | T2 | 4 | squat quadruped, tongue `chain`, hop squash |
| drowned | s08 | 34×80 | T2 | 5 | bloated humanoid, rise from water clip, water spew |
| water_spirit | s08 | 40×66 | T1 | 3 | ghost pipeline with water recolour + ripple |
| gear_golem | s09 | 64×100 | T3 | 7 | rotating gear parts (independent spin), steam, dmg variants |
| harpy | s09 | 48×52 | T2 | 5 | winged humanoid, wings `chain`, feather burst |
| clockwork_soldier | s09 | 30×80 | T2 | 5 | rifle, spinning wind-up key part, rewind pose |
| cog_wheel | s09 | 44×44 | T1 | 1 | one painted cog, rotation by distance rolled, sparks |
| ice_golem | s10 | 64×104 | T3 | 7 | crystal brute, dmg = cracks with ice glow (`bakeDamage glow`) |
| frost_wraith | s10 | 40×72 | T1 | 1 | ghost pipeline + frost recolour + ice shard FxPool |
| snow_wolf | s10 | 64×42 | T2 | 1 | wolf rig + recolour |
| frozen_knight | s10 | 42×92 | T2 | 2 | knight rig + `recolor:'frost'` + ice sword |
| ice_bat | s10 | 32×24 | T1 | 0 | bat rig + frost recolour |
| succubus | s11 | 36×80 | T2 | 5 | flying humanoid, bat wings `chain`, hair strips |
| blood_priest | s11 | 36×88 | T2 | 5 | robed humanoid (robe strips), blood-rite VFX |
| bone_angel | s11 | 56×80 | T2 | 4 | skeleton parts + bone wings `chain` |
| death_knight | s11 | 46×96 | T3 | 7 | elite armour, soul-fire, 3-hit combo, dmg variants |
| cursed_nun | s11 | 32×80 | T2 | 5 | floating nun, habit `warpY`, prayer glow |
| vampire_bride | s12 | 34×84 | T2 | 5 | floating bride, dress `warpY`, phase |
| demon_lord | s12 | 62×108 | T3 | 8 | big demon, wings/tail `chain`s, dmg variants |
| bat_swarm | s12 | 72×52 | T1 | 0 | 14 × bat rig at LOD (3 strips/wing), shared bake |
| royal_guard | s12 | 44×98 | T2 | 2 | knight rig + halberd + royal colours |
| chaos_spawn | s13 | 50×48 | T1 | 3 | blob + tentacle `chain`s |
| hellhound | s13 | 70×46 | T2 | 2 | wolf rig + fire recolour + flame FxPool |
| abyss_eye | s13 | 70×70 | T1 | 3 | eye body + iris part (aims), tendril `chain`s, beam VFX |
| shadow_hunter | s13 | 30×82 | T2 | 4 | humanoid, shadow recolour, afterimages |
| void_demon | s13 | 60×96 | T3 | 7 | floating demon, void particle robe (`warpY`), dmg variants |

### Part 2 (24, `docs/specs/world2.md §5.2`)

| id | stage | size | tier | imgs | rig notes |
|---|---|---|---|---|---|
| mirror_knight | s14 | 42×94 | T2 | 2 | knight rig + mirror sheen overlay sweep, glass-wave VFX |
| glass_wraith | s14 | 40×72 | T1 | 2 | ghost pipeline + shatter/reassemble = dissolve + reverse dissolve |
| reflection | s14 | 30×82 | T2 | 0 | reuse the hero puppet rig (PUPPET_PIPELINE) with glass tint + crack overlay |
| chandelier_fiend | s14 | 64×52 | T2 | 5 | hang (sway) / fall / shatter / crawl on candle legs (`chain`) |
| forge_imp | s15 | 36×48 | T1 | 3 | imp body + wings `chain`, ember FxPool, dive stretch |
| slag_golem | s15 | 68×108 | T3 | 7 | molten brute, crack glow (`bakeDamage glow`), drips |
| chain_warden | s15 | 40×92 | T2 | 5 | horned warden + hook chain (`kit.Strand`) |
| bellows | s15 | 56×64 | T1 | 3 | leather bellows body, inhale/blow squash via strips, flame cone VFX |
| abyss_angler | s16 | 64×44 | T2 | 5 | fish body `chain`, hinged jaw, lure strand + light |
| sunken_priest | s16 | 34×86 | T2 | 5 | robed caster, robe strips, water pillar VFX |
| coral_crab | s16 | 70×50 | T2 | 5 | crab body, claws (hinge), legs reused ×3 |
| siren | s16 | 40×78 | T2 | 5 | flying/swimming humanoid, tail `chain`, song rings |
| storm_harpy | s17 | 50×54 | T2 | 1 | harpy rig + storm recolour |
| gale_knight | s17 | 46×86 | T2 | 5 | winged lancer, wings `chain`, dash smear |
| thunder_roc | s17 | 110×70 | T3 | 7 | huge bird, wing `chain`s, swoop |
| cloud_jelly | s17 | 44×56 | T1 | 2 | bell squash + tentacle strips, charge crackle |
| puppeteer | s18 | 44×90 | T2 | 5 | floating tall figure, finger strings to puppets |
| faceless | s18 | 36×104 | T2 | 4 | tall humanoid, blink = dissolve/reverse |
| dream_eater | s18 | 64×80 | T3 | 7 | tapir nightmare, trunk `chain`, void particles |
| rot_treant | s19 | 72×120 | T3 | 8 | walking tree, branch arms, spore bursts, dmg variants |
| plague_moth | s19 | 56×40 | T1 | 3 | body + 4 wings `chain`, spore dust FxPool |
| fungal_husk | s19 | 34×84 | T2 | 4 | humanoid + mushroom cap, spore death |
| void_herald | s20 | 44×100 | T2 | 5 | floating robed herald, `warpY` robe, star VFX |
| nihil_spawn | s20 | 48×48 | T1 | 2 | black crystal cluster, swell/burst |

Planned Kling spend ≈ 310 images for the remaining 86 (≈ 3.6 / enemy thanks to rig reuse; T1 28, T2 47, T3 10, 1 invisible); memory for a full stage
roster (6–9 types) ≈ 3–5 MB desktop, ≈ 1–1.5 MB phone.

## 8. Budgets (measured on the five references)

- **Kling**: T1 3–4, T2 5–6, T3 6–8, reuse variants 0–2. Pick 2 references, 2 sheets; generate singles only for occluded parts.
- **Assets**: atlas.webp 10–50 KB per enemy (srcTD 4).
- **Memory** (baked runtime atlas, RGBA; the kit shelf-packs at 1024/768/640/512 px and keeps the smallest): desktop TD 2.4 →
  bat 0.13, ghost 0.18, skeleton 0.33, knight 0.55, gravedigger 0.75 MB (1.94 MB for all five); phone TD 1.25 → bat 0.04,
  ghost 0.06, skeleton 0.14, knight 0.20, gravedigger 0.31 MB (0.75 MB). Bake 3–250 ms per type, time-sliced.
- **Draw cost** (`tools/painted/enemies/perf.mjs --ab`, frozen loop, SwiftShader CPU raster = worst case; the `--ab` mode
  alternates painted and vector frame by frame in one page, so a busy shared machine loads both sides equally — the
  sequential runs drifted by ±30 % between runs on the shared review machine). Enemy.draw JS ms / whole frame ms:

| scene (review pass, 2026-09-26) | painted | vector |
|---|---|---|
| desktop 1280×720 (quality high), 30 mixed on screen | 4.47 / 51.3 | 4.99 / 66.1 |
| desktop, 20 × bat | 0.81 / 27.5 | 1.06 / 32.0 |
| desktop, 20 × ghost | 0.61–0.65 / 30.0 | 0.55–0.63 / 29.6 |
| desktop, 20 × skeleton | 0.80 / 27.6 | 2.05 / 34.8 |
| desktop, 20 × armor_knight | 1.01 / 30.8 | 1.98 / 39.5 |
| desktop, 20 × gravedigger | 1.99–2.88 / 47.5–55.6 | 1.97–2.97 / 47.3–56.3 |
| desktop, quality low, 30 mixed | 2.62 / 47.7 | 4.60 / 62.1 |
| mobile 844×390 dpr 2, CPU ×4 throttle, quality medium, 60 mixed | 20.4 / 156 | 26.5 / 224 |

  Ghost and gravedigger are at parity with their vector versions (±5 % JS, ±1 % frame), the others are cheaper. The ghost
  got there by emitting wisps per second (16/s, 8/s on low), 9 warp bands, the extra glow pass on high only; the
  gravedigger by baking its shovel extension, 5 coat-tail bands, one lantern glow and no per-frame allocations.
  Targets: ≤ 0.35 ms/enemy on a mid phone with CPU raster; the painted path must never cost more than the vector path it
  replaces — measure with `--ab`, and keep per-frame code allocation-free (reuse pose objects, hoist strip callbacks,
  resolve sprites when a particle is added).

## 9. QA checklist (per enemy)

1. `node tools/painted/enemies/shot.mjs gallery --ids <id> --t 1.3 --zoom 3` — every state cell reads (idle, walk
   phases, wind-up with glint, strike frame with trail, follow-through, hurt flash+squash, stun, airborne, dying; T3: dmg 50 % / 20 %).
   Compare with `--vec` (A/B).
2. Timing: the strike frame coincides with `params.windup` (AI hit frame) — the telegraph glint peaks just before it.
   **Reach**: `node tools/painted/enemies/measure.mjs --ids <id>` prints the painted and vector bounding boxes per state
   next to the logic rect and the AI strike rect. At the strike frame the weapon must reach the far edge of the strike
   rect within ~10 px (a player reads the range from the weapon; the gravedigger's first painted shovel stopped 50 px
   short of its 122 px slam) and the standing figure should fill the logic rect height within ~5 % (`spec.scale`;
   the first knight stood 80 px in an 88 px rect). Hit instants only — wind-up/recovery frames are not compared.
3. Facing both ways, elite (`scale 1.15` + red aura), bestiary (`world === null`, big scale — no crash, readable):
   `node tools/painted/enemies/bestiary.mjs [--mobile]` opens the real bestiary card for each painted enemy.
4. `node tools/painted/enemies/ingame.mjs --stage <sNN> --line <id>:idle,<id>:walk,<id>:attack@0.4 --kill 1` and
   `--mobile`: art sits on the ground line, matches the painted backdrop and lighting, corpses/dissolves outlive the entity,
   no duplicate vector debris, nothing sinks through the floor. `--debug` draws the hurtboxes, `--facing both` spawns
   each pose in both directions, `--elite`, `--quality low|medium`. Check the darkest stage the enemy appears in
   (s05 0.6, s08 0.55, s13 0.55 darkness) at phone size: small or dark states (a hanging bat) need an eye glint/rim.
   `node tools/painted/enemies/deathcheck.mjs --ids <id>`: kills them mid-air (launcher juggle) — pieces must land on
   the floor below — and probes that the death FX do not inherit another particle's alpha (ratio ≈ 1), debris left 0.
5. `?debug` hurtbox overlay vs art: art may overhang (wings, shields, shovels) but the body mass must sit inside the logical
   rect; if art grows, **document** the needed hurtbox change — never change gameplay silently. (Five references after the
   review fixes: body ≈ logic rect — knight via `spec.scale 1.1`; bat wings overhang ±15 px and the gravedigger's hump
   ±5 px behind, like the vector versions; no hurtbox change needed.)
6. Culling: `world.render` culls with a 200 px margin — the painted overhang must stay inside it.
7. Fallback: rename `assets/painted/enemies/<id>` → vector art, no errors; `?painted=0` and `window.__paintedEnemies=false`.
8. Late load: throttle the network — vector → painted 0.3 s crossfade, no pop.
9. No `Math.random` in renderers (`grep -n "Math.random" src/render/painted/enemies`), no `world.fx.emit/burst` from draw.
10. `node tools/painted/enemies/perf.mjs --n 30 --ab` (and `--types <id> --n 20 --ab`, `--mobile --throttle 4 --n 60`,
    `--quality low|medium`): painted ≤ vector in the interleaved A/B line. Emission of continuous VFX is per second (`FxPool.rate`), not per rendered frame.
11. `node tools/integration.mjs --only s01,s02,s03,s04,s05` (and `--mobile`) — no page errors.
12. `node tools/painted/enemies/lifecycle.mjs`: growing the window re-bakes at the new texel density with no vector
    frame, a stage change releases unused rigs, `settings.painted=false` stops the preload.

## 10. Notes / follow-ups

- `Enemy.die` spawns generic vector debris (bones/metal); painted renderers call `claimDebris` on the death frame so the
  painted corpse is the only body. Enemies without a painted renderer are unaffected.
  `claimDebris` only takes debris at most 0.06 s old lying on this body, so a vector enemy dying in the same frame
  30+ px away keeps its own bones.
- Corpse pieces land on the tile-map ground under each piece (airborne kills, ledges and pits handled); moving
  platforms are not considered (pieces of an enemy killed on one fall through it to the tiles below).
- Review pass (2026-09-26) fixed: dissolve/corpse FX inheriting the previous particle's alpha (bat/ghost deaths drawn
  at ~9 % opacity and flickering with the fire embers), corpses hovering in mid-air after airborne kills, gravedigger
  shovel ~50 px short of the slam rect (now lengthened handle, blade planted where the AI's dust ring appears), knight
  10 % shorter than its hurtbox, hanging bat half the vector size and nearly invisible on dark stages, bat drop
  animation ignoring the difficulty's faster drop, frame-rate dependent wisp/ember emission, no re-bake on resize /
  quality change, rigs never released across stages, `roomEntered` preload ignoring `settings.painted=false`.
- Gravedigger's inpainted coat region is visible only when both arms are raised (slam wind-up).
- Ghost shroud `warpY` re-rasterises into a shared scratch canvas per ghost per frame: cheap on the CPU raster
  measured here, **untested on a real phone GPU** (canvas-to-canvas copies can stall there). If a GPU profile shows
  it, give each on-screen ghost its own scratch slot or bake 4 ripple phases at load.
- Next up for the enemy agent(s): rig-reuse variants (skeleton family, knight family, bat family: 0–2 images each), then
  the per-stage rosters in stage order so every stage ships fully painted.
