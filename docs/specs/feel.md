# Spec: Movement & combat feel, flashier ultimates, 각성기 (awakening super ultimate)

User requests covered: **#5** (walking and running should feel exciting like an arcade game or Dungeon & Fighter, with punchy hits), **#10** (flashier impact and ultimate effects), **#11** (a true super ultimate with an illustration cut-in and a signature line).
Also constrained by #7/#13 (mobile, desktop and controller performance and input) and #14 (no errors).
Engine facts: logical view height 540, width 960 to 1280, `TILE=48`, fixed 60 Hz step, gravity 2200 px/s², scene stack (only the top scene updates).

Design pillars:
1. **Arcade punch.** Every hit must *freeze, shake, spark, sound and number* in the same frame. Every step must have a foot contact, dust and a sound.
2. **Dungeon & Fighter readability.** Launch, air juggle, down hit (OTG) and wake-up follow a clear loop. Wall and ground bounces are rewards. Callouts name what just happened.
3. **Platforming precision stays.** The base run speed, jump height and dash distance of every hero are **unchanged**, so every existing map stays beatable. Walking is slower and sprinting is faster, and both are opt-in.
4. **Mobile-safe.** Effects come from cached sprites. The spec sets hard caps on particles, gradients, full-screen passes and hero redraws (section 8).

---

## 1. Measured baseline (running game, 2026-09-26)

Harness: `tools/.proto_specFeel/measure.mjs` (git-ignored). It uses headless Chromium at 1280x720 (view 960x540, quality `high`) on stage `s04`. The harness first moves the hero to the widest flat floor and turns off room exits.
Frame times come from the CPU rasterizer, so they only show **relative** cost.

| hero | run px/s | t to 95% speed | stop time / slide | footstep SFX /s | visual steps /s* | jump apex / air (full) | short hop | dash dist / dur | launcher: enemy apex / air | ult cutscene | ult peak particles | ult frame ms avg / p95 (base avg) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kael | 275 | 0.08–0.10 s | 0.083 s / 8 px | 3.28 | 4.9 | 135 px / 0.70 s | 51–59 px | 142 px / 0.25 s | 198 px / 0.85 s | 1.97 s | 526–592 | 34 / 63 (28) |
| sera | 255 | 0.10 | 0.083 / 7 | 3.12 | 4.5 | 128 / 0.67 | 57 | 151 / 0.18 (blink) | 355 / 0.82 (pillar rehits) | 2.17 | 467 | 35 / 54 (39) |
| victor | 285 | 0.12 | 0.083 / 9 | 3.33 | 5.0 | 132 / 0.67 | 58 | 135 / 0.25 (roll) | n/a (gun up-shot) | 1.90 | 336 | 43 / 69 (28) |
| bran | 245 | 0.08 | 0.083 / 6 | 3.26 | 4.3 | 125 / 0.67 | 56 | 121 / 0.25 | 248 / 1.03 | 2.42 | 269 | 44 / 113 (31) |
| lia | 305 | 0.12 | 0.10 / 10 | 4.03 | 5.4 | 138 / 0.70 | 60 | 159 / 0.25 | 183 / 0.80 | 2.08 | 687 | 40 / 85 (37) |
| azel | 290 | 0.12 | 0.083 / 9 | 3.70 | 5.1 | 139 / 0.68 | 52 | 178 / 0.28 (mist) | 209 / 0.87 | 2.13 | 359 | 40 / 83 (31) |

\*Visual steps/s is computed from `hero.js` `rig.runPh += dt*max(|vx|,60)/18`, with two foot contacts per cycle.

Combat numbers taken from the code, confirmed by the hitstop events the harness logged:
- Hitstop: dagger and gun 0.025–0.03 s, whip and sword normals 0.045–0.05, greatsword 0.08, finishers 0.06–0.10, charge attacks 0.06–0.14, ultimate final 0.30. Crit ×1.4, kill ×1.3. Hitstop freezes the **whole world, particles included**.
- Knockback: ground slide friction during stun is `vx *= 0.82` per step. A light hit (kb 150–170) pushes the enemy about 15 px. Four whip hits pushed a skeleton 87 px.
- Launch: `vy = kb[1]*1.4*(1-kbResist)`. Launched enemies fall with full gravity (2200). They are airborne for about 0.85 s.
- Combo: `world.combo.n` counts hits and resets after 2.6 s without a hit. Style rank is only a function of the hit count (`STYLE_RANKS` D at 5 hits through SSS at 120). The only announcer is a "`N HIT!`" text every 25 hits.
- Damage numbers: `fx.text` in Cinzel 900 at 20 px (crit 28 px), with a 5 px outline, a pop, then rising.

Defects and weaknesses found while measuring (the spec fixes all of them):
1. **Footstep sounds are out of sync with the feet.** The footstep timer gives about 3.3/s, but the legs plant 4.3–5.4 times/s.
2. **The hitstop comment says particles keep moving, but they do not.** `world.update` returns before `fx.update`, so sparks freeze as dots instead of blooming.
3. **Attack buffer expiry.** `ATK_BUF = 0.16 s`, but hitstops of 0.14–0.30 s run on the same clock, so a combo press made during a long freeze is lost.
4. **Photosensitivity.** `game.flash` fills the whole screen at up to alpha 1.0 (for example `ultFinal` at 0.85 and boss death at 1.0), with no rate limit and no setting to reduce it.
5. **Frame spikes during ultimates.** Frames of 100–270 ms appear mid-ultimate even on the second and third cast, from per-frame `createRadialGradient` calls and large additive fills. The first cast of some heroes spikes up to 865 ms, which points to image decode on first use.
6. Style rank reflects only the hit count, so there is no incentive for variety or air play.
7. Walking and running use the same animation. There is no run start, skid, pivot or heavy landing. Takeoff has no squash and stretch, and landing has only a 7% squash.
8. The normal ultimate already shows a 1.1 s portrait cut-in, so there is no step up left for a "true" super ultimate. The awakening needs its own, much stronger presentation (section 6).

---

## 2. Architecture overview

```
input ──> player.js ── feel_move.js (gait, sprint, skid, footsteps, squash, dash FX) ──> hero_gait.js (poses)
                 │                                                                          ▲ hook in hero.js
                 ├─ ult button ──> awaken.js (hold logic) ──> castUltimate (skills.js) | castAwakening (awaken.js)
                 │                                                                   └─> push('awakenCutin')
                 └─ attacks ──> combat.js hitTarget ──> impact.js (strength, hitstop, counter/back, sparks,
                                                            numbers, camera, rumble) ──> world.onPlayerHit
                                                                                            ├─ style.js (style meter)
                                                                                            └─ run.aw gain
                             enemy.js takeHit/update ── weight class, juggle, knockdown/OTG, bounces, stagger
render: world.render ──> particles (sprite/decal/streak/digit shapes via hitfx.js caches)
                    └─> world.overlays[] (screen-space: letterbox, grade, radial lines, impact frame)
        hud.js ──> feel_hud.js (combo, style, announcer, awakening gauge)
ultimates: skills.js ULTS.* ──> ultfx.js layer kit (tiers T0/T1/T2)
audio: audio.js ──> merges sfx_feel.js (new SFX, synthesized)
```

New modules and data (all ES modules, no build step, no npm dependencies):

| file | purpose |
|---|---|
| `src/data/feel_move.js` | gait tables, per-hero gait personality, surface per stage, dash FX constants |
| `src/data/feel_hit.js` | move strength rules and overrides, hitstop table, weight classes, materials, style scoring, awakening gauge gains, rumble table |
| `src/game/feel_move.js` | movement feel logic that `player.js` calls |
| `src/render/hero_gait.js` | pure pose functions (walk, sprint, skid, pivot, run start, heavy landing) and a squash/lean overlay |
| `src/game/impact.js` | one function `impact(world, attack, target, info)` that replaces the effects block in `hitTarget` |
| `src/game/style.js` | style meter (points, ranks, decay, events) |
| `src/render/hitfx.js` | cached sprites (glow, star, cut, streak, ring), damage digit atlas, material burst recipes, decals |
| `src/render/feel_hud.js` | combo counter, style meter, announcer, awakening gauge, hold ring |
| `src/render/ultfx.js` | ultimate and awakening layer kit (zoom, letterbox, radial lines, grade, shockwaves, impact frame) |
| `src/game/awaken.js` | awakening rules, ult-button hold logic, awakening attack directors |
| `src/data/awaken.js` | per-hero awakening data (Korean names, lines, seals, cut-in assets, colors, tier-2 variants) |
| `src/scenes/awaken_cutin.js` | `AwakenCutinScene` (overlay scene `awakenCutin`) |
| `src/core/sfx_feel.js` | synthesized SFX definitions for the new sound names |
| `assets/cg/cutin_<hero>.webp` | 6 painted cut-in illustrations (Kling) |
| `tools/feel_test.mjs` | acceptance test harness |

### 2.1 Contracts with other workstreams (running in parallel)

| other owner | what this spec needs from them | fallback if it is missing |
|---|---|---|
| Hero detail (#1/#6) owns `render/hero.js` | a hook of 12 lines or fewer (section 3.3.3). The hook must read `p.gaitPh` and call `hero_gait.js`. | WP1 applies the hook after the hero-detail agent finishes, as the only edit in `hero.js` |
| Input / gamepad / touch (#7/#8) owns `core/input.js`, `index.html`, `css`, `scenes/front/options.js` | `input.analogX` (float −1..1, with a radial deadzone of 0.18 rescaled to 0..1 for pads, touch stick `dx/46`, keyboard ±1) and `input.analogMag`. `input.rumble(strong, weak, ms)` (Gamepad `vibrationActuator` plus `navigator.vibrate` when `settings.vibration`). Optional action `'awaken'` (keyboard `G`, pad L3). Three option rows appended (section 7). | Use `input.axisX` (digital); `input.rumble?.()` does nothing; hold-to-awaken still works |
| Fonts (#9) owns `core/ui.js` `FONT` and the font files | `FONT.brush` (Korean brush calligraphy) and `FONT.dmg` (damage digits). Glyph coverage must include every string in `data/awaken.js` and `data/feel_hit.js`, plus the hanja seals `狩 聖 銃 鐵 鴉 血`. | `FONT.title` / `FONT.num` |
| Bosses (#2) own `game/bosses/*` | honor `world.freezeEnemies` (skip AI when it is true), 1 line in `Boss.update`. Optional `boss.telegraph` flag so counter hits work on bosses. | Bosses keep acting during the awakening (the player is invulnerable anyway) |
| Mounts / companions (#4) | companion attacks set `tags: ['companion', …]`. While `p.mount` is set, `feel_move` skips gait poses and footsteps, and the mount supplies its own. | Companion hits count as normal hits |
| Mobile perf (#13) | may tune `fx.max`, `fx.quality` and the budget constants in `data/feel_hit.js` → `BUDGET` | n/a |

### 2.2 Work packages, file ownership and order

Each file belongs to exactly **one** package. "Shared" means an append-only edit of a clearly marked block in a file another workstream also edits: re-read the file right before editing and keep the edit minimal.

| WP | name | owns (creates or edits) | shared, append-only | depends on |
|---|---|---|---|---|
| **WP1** | Movement feel | `src/game/feel_move.js` (new), `src/render/hero_gait.js` (new), `src/data/feel_move.js` (new), `src/game/player.js` (**all edits except the ult line**) | `src/render/hero.js` (hook only) | none |
| **WP2** | Hit feel core | `src/game/impact.js`, `src/game/style.js`, `src/render/hitfx.js`, `src/data/feel_hit.js` (all new); `src/game/combat.js`, `src/game/enemy.js`, `src/core/particles.js`, `src/core/camera.js`, `src/game/world.js` | `src/core/game.js` (`flash()` body plus a new `vignette()`) | none |
| **WP3** | HUD and settings | `src/render/feel_hud.js` (new), `src/render/hud.js` | `src/core/save.js` (`DEFAULT_SETTINGS` keys), `src/scenes/front/options.js` (3 rows) | WP2 (reads `world.style`, `run.aw`; guard with `?.`) |
| **WP4** | Ultimate overhaul | `src/render/ultfx.js` (new), `src/game/skills.js` (ultimate section, `castUltimate`, plus a new `FXKIT` export), `src/scenes/overlays.js` (`UltCutinScene` only) | none | WP2 camera and overlay APIs (guard with `?.`) |
| **WP5** | Awakening | `src/game/awaken.js`, `src/data/awaken.js`, `src/scenes/awaken_cutin.js` (all new) | `src/scenes/index.js` (+2 lines), `src/game/player.js` line 298 only (after WP1 lands) | WP4 `FXKIT`, WP2 hooks, WP7 art (falls back to the portrait) |
| **WP6** | Feel SFX | `src/core/sfx_feel.js` (new) | `src/core/audio.js` (+4 lines: merge and helper arg) | none (unknown SFX names already fall back to `_default`) |
| **WP7** | Cut-in art | `assets/cg/cutin_*.webp`, `tools/kling/cutin_manifest.json`, `tools/kling/cutin_process.py` (all new) | none | none |
| **WP8** | Feel QA | `tools/feel_test.mjs` (new) | none | all |

Order: start **WP1, WP2, WP6 and WP7** in parallel. Start **WP3 and WP4** once the WP2 APIs exist, then **WP5**, then **WP8**. Every package must leave the game running after each edit: guard calls into modules that may not exist yet with `?.`, and never import a file that has not been created.

---

## 3. Movement feel (request #5)

### 3.1 Gaits and speeds

The base speed `B = ch.move.speed × speedMul` is unchanged. The **run gait is the default**, so maps are unaffected.

| gait | how it starts | speed | accel / decel (px/s²) | per-hero speed (kael / sera / victor / bran / lia / azel) |
|---|---|---|---|---|
| **walk** | analog tilt `0 < abs(analogX) < 0.55` (pad or touch stick); never from the keyboard | `0.5·B` | 2200 / 2600 | 138 / 128 / 143 / 123 / 153 / 145 |
| **run** | any direction input (full tilt, or keyboard) | `B` (as now) | 3200 / see skid | 275 / 255 / 285 / 245 / 305 / 290 |
| **sprint** (DNF "대시 달리기") | (a) double-tap a direction: second press within **0.24 s** of releasing the first press of the same direction. (b) Ground dash ends while the same direction is still held. (c) Touch: stick pushed past **1.15×** the ring radius (the outer ring). (d) Setting `autoSprint` makes every run a sprint after 0.35 s of holding. | `k·B`: k = 1.32 (bran 1.25, lia 1.38) | 2600 while ramping from B | 363 / 337 / 376 / 306 / 421 / 383 |

Sprint rules:
- Sprint lasts while the direction is held, on the ground or in the air. In the air, horizontal speed is kept up to `k·B`. After landing it decays to `B` over 0.35 s unless the direction is still held.
- Jump height is unchanged. A sprint jump only goes farther.
- Attack pressed while sprinting performs the moveset's `dash` move (the existing dash attack), exactly like `dashT > 0` today.
- Sprint ends on releasing the direction (enters **skid**), reversing (enters **pivot**), crouching, being hurt, dashing, entering a cutscene, or entering water (`inLiquid`).
- Sprint is disabled inside boss arenas when `world.arena` is set and the arena is narrower than 16 tiles (the camera cannot show it).

### 3.2 Movement state machine and transition feel

State lives on the player as `p.gait ∈ {'idle','walk','run','sprint'}`, `p.moveFx ∈ {null,'run_start','skid','pivot','land_heavy'}` and `p.moveFxT`.

| event | trigger | duration | physics | animation name (`p.anim`) | effects |
|---|---|---|---|---|---|
| run start | idle → direction on the ground | 0.08 s (cosmetic, **no input lock**) | acceleration unchanged | `run_start` | 3 dust puffs behind the heel (`dust`, speed 60, angle away from the direction); `step_push` SFX vol 0.12 |
| skid | release direction with `abs(vx) ≥ 0.9·B` (run) or while sprinting | run 0.16 s, sprint 0.22 s | decel 1800 (bran 1500, lia 2200). Slide ≈ `v²/2a`: run 21 px, sprint 37 px. **Edge guard**: if there is no solid ground 6 px ahead, set `vx = 0` | `skid` | dust stream at the front foot (1 puff every 0.03 s), `skid` SFX, heel sparks on `metal` and `stone` surfaces |
| pivot | reverse direction with `abs(vx) ≥ 0.7·B` on the ground | 0.10 s | decel 5000 toward the new direction; facing flips at 50% of the time | `pivot` | a 6-particle dust fan behind; `pivot` SFX |
| walk → run → sprint | speed crossing thresholds | blended by gait weight (3.3.2) | as in the table | `walk` / `run` / `sprint` | see 3.4 |
| heavy landing | landing with `vyBefore ≥ 900` **or** falling more than 4 tiles (192 px) since the apex, and no plunge or ground-pound move active | 0.18 s cosmetic; input stays live | none | `land_heavy` | ground ellipse ring (w 90, h 14, `#d8c8b0`), 8 gravel particles, `land_heavy` SFX, camera kick (0, +5), rumble 0.4/0.2/100 ms |
| normal landing | any other landing | 0.12 s | none | `land` | 6 dust particles (existing), `land` SFX |

`player.updateAnim` priority: move > throw > cast > dash > air > `land_heavy` > `skid` > `pivot` > crouch > charge > `run_start` > walk/run/sprint > land > idle.

### 3.3 Gait animation

#### 3.3.1 Foot-locked phase (fixes defect 1)

The phase is **simulated in `player.js`**, not in the renderer:
`p.gaitPh += dt · π · cadence(|vx|/B) · personality.cad`.
One foot contact happens every π radians. When `floor(gaitPh/π)` increments, a **footstep event** fires (3.4).

Cadence curve (steps/s), piecewise linear in `r = |vx|/B`:

| r | 0.0 | 0.5 (walk) | 1.0 (run) | 1.32 (sprint) |
|---|---|---|---|---|
| cadence | 1.6 | 2.4 | 4.2 | 5.0 |

The renderer uses `p.gaitPh` when it is defined. Otherwise (NPCs, menus, snapshots) it keeps the legacy `rig.runPh` formula, so town NPCs and menu heroes do not change.

#### 3.3.2 Pose parameters (`hero_gait.js`)

All values are in hero pose units (`P.*` fields as in `hero.js`: `py` hip height, `lean`, `hd` head tilt, `f1x/f1y/f2x/f2y` feet, `t1/t2` toe, `a1/a2` arm angles, `r1/r2` arm reach, `sq` squash).

| gait | stride amp `A` (feet x) | foot lift | hip bob (`py` amplitude, 2× freq) | lean | head `hd` | arm swing (rad) | arm reach | notes |
|---|---|---|---|---|---|---|---|---|
| walk | 10 | 5 | 1.0 | 0.05 | −0.02 | 0.45 | 0.85 | heel-toe roll: `t1/t2 = 0.25` at contact |
| run | 15 | 12 | 2.0 | 0.18 | −0.12 | 1.00 | 0.70 | same shape as the current `poseRun` with these amplitudes |
| sprint | 19 | 16 | 2.6 | 0.36 | −0.22 | 1.25 (bent pumping, `r = 0.6`) | 0.60 | lia/azel variant **"ninja sprint"**: both arms back (`a1 = 2.45, a2 = 2.7, r = 0.94`, like `holdFor(...,'dash')`) with lean 0.5 |
| run_start | — | — | `py +3` | lean 0.34 → gait lean | −0.2 | back arm 1.4 | — | first 0.08 s, `ease.outQuad` |
| skid | feet: front `f1x = 16, f1y = −2.8`, back `f2x = −6` | 0 | `py −4` (knees bent) | −0.22 (leaning back) | 0.2 | arms forward `a1 = −0.2, a2 = 0.3` | 0.9 | `sq = 0.96`; heels dig in: `t1 = −0.4` |
| pivot | mirrors skid for the first 50%, then run_start | — | `py −3` | −0.15 → +0.3 | — | — | — | facing flips at 50% |
| land_heavy | `f1x = 11, f2x = −10` | 0 | `py +9 · k` | 0.35·k | −0.3·k | arms out `a1 = 0.6, a2 = 2.6` | 0.9 | `k = 1 − t/0.18`; `sq` from 3.6 |

Per-hero personality (multipliers on the table):

| hero | cadence | A | bob | lean | footstep vol | dust | special |
|---|---|---|---|---|---|---|---|
| kael | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | whip coil sways with the bob |
| sera | 1.08 | 0.85 | 0.9 | 0.8 | 0.8 | 0.8 | robe hem flutter (cape chain impulse on contact) |
| victor | 1.0 | 1.0 | 1.0 | 0.9 | 1.0 | 1.0 | arm swing ×0.8 (guns held low) |
| bran | 0.9 | 1.1 | 1.3 | 1.0 | 1.4 | 1.5 | sprint steps: camera kick (0, +0.8), 1 gravel particle per step |
| lia | 1.1 | 1.0 | 0.8 | 1.1 | 0.7 | 0.7 | ninja sprint pose |
| azel | 1.0 | 1.0 | 0.6 | 1.0 | 0.8 | 0.5 | sprint leaves a red mist puff every other step (`dark`, `#8a0a1e`, 2 particles) |

Acceleration lean overlay: `p.feel.accLean` follows `clamp(Δvx/dt / 9000, −0.12, 0.2)·facing` with smoothing 0.08 s, and is added to `P.lean`.

#### 3.3.3 `hero.js` hook (the only edit to `hero.js`, 12 lines or fewer)

```js
import { gaitPose, applyFeelOverlay, GAIT_ANIMS } from './hero_gait.js';
// in drawHero() anim switch, before `case 'run'`:
case 'walk': case 'sprint': case 'run_start': case 'skid': case 'pivot': case 'land_heavy':
  gaitPose(P, K, anim, p, at); holdFor(P, K, GAIT_ANIMS[anim]); break;
// in case 'run': use p.gaitPh when it is a number, instead of rig.runPh
// after the transition blend (just before solve()):
applyFeelOverlay(P, p);   // adds p.feel.sq / p.feel.accLean / sprint lean; no-op when p.feel is missing
```
`GAIT_ANIMS` maps each anim to the `holdFor` weapon-hold mode: walk and run_start → `'run'`, sprint → `'dash'`, skid and pivot and land_heavy → `'idle'`.
Blend durations: `rig.bd` = 0.06 for skid, pivot and land_heavy, and 0.12 between walk, run and sprint.

### 3.4 Footsteps (contact events)

On each contact event:

| gait | SFX (by surface) | vol | pitch jitter | dust | extra |
|---|---|---|---|---|---|
| walk | `step_<surface>` | 0.12 | ±6% | none | none |
| run | `step_<surface>` | 0.18 | ±8% | 1 puff at 40% probability (`dust`, size 5, speed 30) | none |
| sprint | `step_<surface>` | 0.24 | ±8% | 2 puffs, plus 1 pebble (`shard`, size 2, `#7a7068`) | on `water` surfaces: 4 `water` droplets |

Surface per stage (`data/feel_move.js` → `SURFACE`): `stone` by default. `s01` `dirt`, `s02` `dirt`, `s03` `stone`, `s04` `stone`, `s05` `bone` (stone with a crunch layer), `s06` `wood`, `s07` `metal`, `s08` `water` when `inLiquid` or the room has a liquid layer, otherwise `stone`, `s09` `metal`, `s10` `snow`, `s11` `stone`, `s12` `stone`, `s13` `flesh`. The hub uses `dirt`. Part-2 stages (other workstream) may add entries, and unknown stages fall back to `stone`.
The old `stepT` timer in `player.updateAnim` (lines 610–614) is **removed**.

### 3.5 Dash FX (afterimages, speed lines)

| element | dash (kael, bran, lia) | blink (sera) | roll (victor) | mist (azel) |
|---|---|---|---|---|
| start burst | horizontal ellipse ring behind (r 10→60, h 0.35, 0.18 s, white 0.8) plus 10 dust (existing 8) | holy flash sprite 70 px plus ring | dust 12 plus ground ellipse | red mist burst (existing) plus 2 bat silhouettes |
| afterimage | every **0.035 s**, alpha 0.5 → 0, life 0.2 s, tint gradient from `ch.ult.color` (first) to `#ffffff` (last); **max 6 live** | 2 ghosts only (start and end points) | none (roll pose), dust trail instead | 3 ghosts tinted `#b0103a` |
| speed lines | 8 world-space streaks around the body (y within ±40 px, length 60–140, life 0.12 s, additive `#ffffff` 0.5, drawn from the cached streak sprite), spawned every 0.03 s | none | 4 streaks | 6 red streaks |
| end | 4 dust at the feet; if the direction is still held: **sprint** | holy sparkles 6 | small skid (0.1 s) | mist puff |
| camera | look-ahead +60 px during the dash; kick `(−facing·3, 0)` at start | — | — | — |

Sprint (after 0.4 s of continuous sprinting): 2 screen-edge speed lines every 0.1 s (screen-space, alpha 0.22). They are off on `low` quality.

### 3.6 Jump squash and stretch, landing impact

A damped spring drives `p.feel.sq` toward `sqTarget`, with ω = 30 rad/s and ζ = 0.35 (overshoot to about 1.05).

| moment | sqTarget impulse | notes |
|---|---|---|
| ground takeoff | set `sq = 1.14` (stretch), target 1 | plus 5 dust (existing) plus a small ground ellipse ring (r 8→34) |
| air jump | set `sq = 1.10` | the existing ring plus a per-hero flourish: kael holy spark, sera feather ×3, victor smoke puff, bran none, lia crow feather ×3, azel bat ×2 |
| in the air | target `1 + clamp(abs(vy)/980, 0, 1)·0.06` | stretch while falling fast |
| normal landing | set `sq = 0.84` | the existing 0.14 s `land` pose stays |
| heavy landing | set `sq = 0.72` | plus the `land_heavy` effects in 3.2 |
| wall jump | set `sq = 1.08`, lean spike 0.3 | the existing dust stays |

`hero.js` already supports `P.sq` (y scale with x widened by `(1−sq)·0.6`). `applyFeelOverlay` multiplies `P.sq *= p.feel.sq`.

### 3.7 Camera for movement (uses the WP2 camera API)

- Look-ahead: run ±130 (as now); sprint ±170 plus facing·40; dash +60 on top.
- Sprint zoom: `zoomTarget = 0.96` after 0.4 s of sprinting, eased back to 1.0 over 0.5 s after the sprint ends. Disabled in boss arenas and in rooms whose `bounds.w < vw/0.96`.
- The heavy-landing camera kick is in 3.2.

---

## 4. Hit feel and DNF-style combat (request #5)

### 4.1 Move strength and hitstop

`impact.js` classifies every player attack into a **strength class** by these rules, applied in order:

1. `FEEL_MOVE_OVERRIDES[moveId]` in `data/feel_hit.js`.
2. `tags` includes `'awaken'` and `attack.final` → **A**; `'ult'` and `attack.final` → **S**; other `'ult'` or `'awaken'` hits → **U**.
3. `finisher` or a charge move → **F**.
4. `launch`, a dash move, a down move (`id` ending in `Down`), `groundPound`, or `hitstop ≥ 0.07` → **H**.
5. `hitstop ≥ 0.045`, or a `'skill'` tag → **M**.
6. Everything else → **L** (dagger and staff normals, gun shots, whip1).

`impact.js` needs the move id, so `player.makeAttack` adds `moveId: mv.id` (WP1).

| class | examples | hitstop | frames @60 | camera kick (px, along `dir`) | trauma add | rumble (strong/weak/ms) | hit SFX layer |
|---|---|---|---|---|---|---|---|
| L | dg1–4, st1–2, whip1, gun shots | 0.050 (gun 0.033) | 3 (2) | 3 | 0.10 | 0 / 0.25 / 40 | `hit` |
| M | sw1–3, whip2–3, air normals, crouch, skills | 0.067 | 4 | 5 | 0.16 | 0.1 / 0.4 / 60 | `hit` + material |
| H | gs1–2, launchers, dash attacks, down attacks | 0.100 | 6 | 8 | 0.24 | 0.35 / 0.6 / 90 | `hit_heavy` + material |
| F | ground finishers, charge attacks (gsCharge override 0.167) | 0.133 | 8 | 12 | 0.34 | 0.6 / 0.8 / 140 | `hit_heavy` + `impact_crack` |
| U | ultimate or awakening beat hits | 0.033 (continuation 0.017) | 2 (1) | 2 | 0.05 | — | from the ultimate |
| S | ultimate final | 0.250 | 15 | 16 | 0.6 | 1.0 / 1.0 / 300 | `ult_impact` |
| A | awakening final | 0.400 | 24 | 20 | 0.8 | 1.0 / 1.0 / 450 | `awaken_boom` |

Modifiers (added in frames): crit +2, counter +2, kill of a normal enemy +3, elite kill +6. Multi-hit continuation (the same `hitId` rehit after the first hit): 1 frame. Several targets hit by one swing: take the max, never the sum.
**Rolling cap**: the total frozen time in any 1.0 s window is at most **0.40 s**. Classes S and A are exempt. Keep `world.freezeLog` as a ring of `[t, dur]` and clamp each new hitstop to the remaining budget, with a minimum of 1 frame.
**Player-hurt hitstop**: 3 frames (0.05 s) when the player takes damage.

Hitstop runtime changes in `world.update` (fixes defect 2):
- Particles update at **0.3×** during hitstop, so sparks bloom (`fx.update(dt*0.3, map)`).
- The camera shake and kick springs keep running at full dt, so shake stays alive.
- Victim vibration: every target hit gets `hsShake = hitstop`. While it is above 0 the target is drawn offset by `±(2 + 1·classIndex)` px along `x`, alternating each rendered frame (`game.frame & 1`). Bosses use ±2 px.
- **Attack buffer compensation** (defect 3): `world.frozenRecent` accumulates frozen seconds and decays at 1 s/s. Player input then uses `input.buffered('attack', ATK_BUF + min(0.3, world.frozenRecent))`, and the same for `jump` and skills.

### 4.2 Weight classes and hit reactions

Classified per enemy at spawn (`e.wclass`):

| class | rule | ground knockback | launch | hitstun L / M / H / F (s) | juggle gravity scale | knockdown | visual reaction |
|---|---|---|---|---|---|---|---|
| **LIGHT** | `kbResist < 0.25` | ×1.0 | full | 0.30 / 0.34 / 0.40 / 0.50 | 0.62 base | yes if `h ≥ 50` and not flying | squash on hit (sx 1.12, sy 0.88, 0.06 s); lean back 0.22 rad away from the hit for 0.12 s; while airborne: **tumble** (`h < 50`: spin 8 rad/s; humanoids: lean −0.6 rad) |
| **MEDIUM** | 0.25 to 0.59 | ×(1−kbResist), minimum 0.45 | ×0.8 | 0.24 / 0.28 / 0.34 / 0.44 | 0.70 | yes if `h ≥ 50` and not flying | lean back 0.18 rad for 0.12 s; squash 1.08/0.92 |
| **HEAVY** | 0.60 to 0.99 | ×(1−kbResist)·0.8 | only H or F launchers, as a **hop** (`vy = −380`); others none | 0.10 / 0.14 / 0.20 / 0.30 | 1.0 | only while **staggered** | flinch 0.06 rad; orange **armor flash** outline for 0.08 s when hit during its own attack |
| **FIXED** | `kbResist = 1` or `def.fixed` | 0 | none | 0 (flash only) | — | no | vibrate only |
| **BOSS** | `kind === 'boss'` | 0 (as now) | none | 0 | — | no | ±2 px vibrate; armor flash on hits during `boss.telegraph` |

Rules for all classes:
- Flying enemies (`noGravity`) never use juggle gravity. They take knockback with damping 0.9/step (as now) plus the tumble visual.
- **Stagger meter (HEAVY only)**: `e.stagger += {L:1, M:2, H:3, F:5}` per hit, decaying 4/s. At 12 or more, the enemy is **staggered for 0.9 s**. It is treated as MEDIUM, so it can be launched and knocked down. The callout is "비틀!", followed by a 2 s stagger immunity.
- Ground slide friction during hitstun becomes `vx *= 0.86` per step (currently 0.82). Air damping is 0.985.
- Hit-reaction transforms are applied in `Enemy.draw` around `(cx, bottom)` **before** `drawEnemy`, so they work for all 67 procedural enemy renderers without touching `enemies_a.js` or `enemies_b.js`.

### 4.3 Juggle system (launch → air combo)

| parameter | value |
|---|---|
| launcher `vy` | `−min(1000, abs(kb[1])·1.25)·launchMul(class)`, for example whipUp → 850. At jg 0.62 the apex is ≈ 265 px and the airtime ≈ 1.25 s |
| juggle count `e.jn` | +1 per hit while airborne in hitstun; resets on landing (knockdown) or recovery |
| juggle gravity | `gravity = jgBase + 0.05·jn` (cap 1.15), only while in hitstun and airborne |
| air pop per hit | `vy = min(vy, −pop·(1 − 0.05·jn))` with pop L 260 / M 320 / H 380; F uses its own `kb` |
| air hitstun | `max(0.18, table − 0.02·jn)` |
| **juggle limit** | `jn ≥ 14`: **guard fall**. No more pops, gravity 1.3, a small white flash, callout "가드!". The enemy still takes damage |
| **player hit-float** | on an air hit confirm: `p.vy = min(p.vy, −60)`, up to 6 times per airtime (the counter resets on landing), so the hero stays level with the target |
| **chase jump ("추격!")** | within 0.35 s after one of the player's launchers hits: pressing `jump` makes the player jump with `vy = −jumpVel·1.05` plus `vx` steering to end 40 px in front of the highest launched target. The next air move gets `airStall 0.5`. SFX `launch` at pitch 1.2, style +20 |

### 4.4 Knockdown, OTG and wake-up

| step | rule |
|---|---|
| knockdown | A juggled LIGHT or MEDIUM enemy (or a staggered HEAVY) that lands with no ground bounce armed enters `e.down = 0.6 s` (MEDIUM 0.45). It is drawn lying down: rotated `−facing·π/2·0.9` around the foot, translated down by `0.5·h`, with 6 dust. AI is paused. |
| OTG hits | Any hit on a downed enemy is an **OTG hit**: damage ×0.8, pops `vy = −160`, `e.otg += 1`, callout "다운 추가타" (first OTG per knockdown only), style ×1.2. |
| strong OTG | Plunge, dive-kick, ground-pound and `otg:true` override moves deal ×1.2 damage and **ground-bounce** (4.5) once per combo. |
| wake-up | After `e.down` expires **or** at `otg ≥ 2`: the enemy rises with **0.30 s invulnerability** (`e.wakeInv`: blinking outline, 4 dust), then its AI resumes. |
| safety | Knockdown never applies to FIXED, BOSS, flying or `def.noKnockdown` enemies. |

### 4.5 Wall bounce and ground bounce

| | trigger | effect | limit | feedback |
|---|---|---|---|---|
| **wall bounce** ("벽 바운드!") | an F or H hit with `abs(kb[0]) ≥ 320` arms `e.wbArmed` for 0.5 s; a stunned enemy hits a wall (`hitWall`) with `abs(vx) ≥ 380` | `vx = −vxBefore·0.45`, `vy = −380`, hitstun +0.35 s | once per juggle (reset on knockdown or recovery) | ring at the wall contact (vertical ellipse), 8 dust plus 6 gravel, camera kick 6 px along the bounce, `wall_bounce` SFX, style +40 |
| **ground bounce** ("바닥 바운드!") | an airborne stunned enemy is hit by a move with `kb[1] > 0` (downward: whipA2, gsA1, plunges) or by a strong OTG | slam `vy = +900`; on landing, `vy = −520` and hitstun +0.3 instead of knockdown | once per juggle | ground ellipse ring plus 10 dust plus a crack decal (0.8 s), `ground_bounce` SFX, camera kick (0, +7), style +40 |

### 4.6 Counter and back attack

- **COUNTER**: the target is in its attack windup (`e.state === 'attack' && !e.didHit`, or `boss.telegraph`). Effects: damage ×1.25, +2 frames of hitstop, hitstun +0.1, a cyan-white star sprite (`#aef0ff`), the callout "COUNTER" and the `counter` SFX (sharp ting), style +25.
- **BACK ATTACK**: the target faces away from the attacker (`sign(target.facing) === sign(attack.dir)`) and is not a boss. Effects: +15% crit chance (lia's existing guaranteed crit still applies), the callout "BACK ATTACK" (small), style +10.
- The English callouts follow DNF convention and match the existing HUD words ("HITS", "LEVEL UP!"). All other callouts are Korean.

### 4.7 Directional hit sparks by material

Every hit layers: **(1) a weapon impact sprite**, **(2) a material burst**, **(3) an element accent**, **(4) a decal** (optional).
The burst direction is `θ = attack.dir > 0 ? 0 : π`, tilted by the swing angle when the move has `slash.angle`.

(1) Weapon impact sprites (cached in `hitfx.js`, drawn with the particle shape `'sprite'`: scale 0→1.2 within 2 frames, then fade; life 0.10–0.14 s, additive):

| `attack.fx` / weapon | sprite | size (L/M/H/F) | notes |
|---|---|---|---|
| slash (sword, dagger), whip | **cut line**: tapered white core plus colored rim, angle = swing angle ± 0.3 rad | 70 / 90 / 110 / 140 px | whip: plus a crack spark at the tip |
| thrust, pierce | **streak**: 120×6 horizontal lance plus a small star | 90 / 110 / 130 / 160 | |
| heavy, blunt (greatsword, staff melee, ground pound) | **star burst** (8-point) plus a thick ring | 50 / 70 / 90 / 120 | plus a ground ellipse when the target is grounded |
| bullet | small star plus 4 sparks | 26 / 32 / 40 / 60 | |
| magic, element | glow sprite plus 6 element stars | 40 / 55 / 70 / 90 | |

(2) Material bursts (particle counts shown for `high`; scaled by `fx.quality`; **total per hit ≤ 28**):

| material | recipe |
|---|---|
| flesh | blood **spray cone** (θ±0.5, 8/10/12/14 droplets, speed 180–420, `#9a0d1c`, collide) plus 1–2 blood mist (`smoke`, `#5a0610`, alpha 0.4) plus a **floor/wall splatter decal** (30% chance; 100% on H and F) |
| bone | 5–8 ivory shards (`#e8dcc0`, square, bounce) plus a dust puff plus a thin white crack line (sprite) |
| metal | 10–14 sparks (`#ffd080` → `#fff3c0`, speed 300–700, gravity 900) plus a small white flash; plus `clang` when HEAVY or FIXED |
| ghost | 6 **ectoplasm** blobs (new preset `ecto`: `#8affc8`, additive, float up, gravity −60, wobble) plus a thin teal ripple ring (r 6→46) |
| stone | 6 gravel (`#8a8480`) plus 2 dust |
| slime | 6 goo droplets (`#6adf4a`) plus a goo decal |
| paper | 6 paper scraps (new preset `paper`: low gravity 200, flutter rotation) |
| ice | 8 ice shards plus 1 frost mist (`smoke`, `#bff4ff`, alpha 0.3) |
| fire | 6 embers plus 1 fire puff |

(3) Element accent: 6 particles of the element preset (as now), plus the element color on the impact sprite rim.

(4) Decals: new particle shape `'decal'`. Ellipse clusters are stamped onto the nearest solid tile face within 60 px along θ. Life 18 s, fading over the last 3 s. **Cap 40 per room** (FIFO), 24 on `medium`, none on `low`. Cleared on `loadRoom`. They are drawn in the `back` layer.

### 4.8 Damage numbers

`fx.dmg(target, value, style)` draws from a **pre-rendered digit atlas** (`hitfx.js`): digits 0–9, `,` and `!` for each style, baked at 2× resolution after `document.fonts.ready`. There is no per-frame `ctx.font` or `strokeText`.

| style | when | size | colors | motion | extra |
|---|---|---|---|---|---|
| normal | default | 20 | `#ffffff`, outline `#200008` | pop 1.35→1 in 0.07 s, rise 40 px, fade after 0.6 s | — |
| crit | `res.crit` | 30 | vertical gradient `#fff2a0` → `#ffb020`, outline `#3a1000` | pop 1.8→1, 2 px jitter for 0.1 s | "CRITICAL" 11 px above; a star sprite behind |
| weak | `res.weak` | 22 | `#ff8a4a` | normal | tag "약점" 10 px |
| resist | `res.resist` | 16 | `#9a9aa8` | normal | tag "저항" |
| counter | counter hit | 24 | `#aef0ff` | pop 1.6 | — |
| ult / awaken | `'ult'` / `'awaken'` tags | 26 | `#ffe070`, red outline | stacking column | — |
| total | after a multi-hit sequence | 34 | gold with a red outline | slams at the column top | prefix "합계" (10 px) |
| player hurt | the player is hit | 22 | `#ff4050` | falls with shake | — |
| heal | heal | 20 | `#7ee07e` | rises | "+" prefix |

**Stacking (DNF column)**: per target, `target._dmgCol = {n, t, total, x, y}`. Each number that follows another within 0.5 s is placed 16 px above the previous one (column height 8, then wrap). After 3 or more hits in a sequence, 0.35 s after the last hit, a **total** number appears. At most **24 live numbers** (16 medium, 10 low). Past the cap, hits only add to the column total.
The `settings.showDamage === false` switch still hides everything (as now).

### 4.9 Camera, screen flash and kill slow-mo

Camera (`core/camera.js`, backward compatible; `shake(mag, time)` keeps working and maps internally to trauma):

| API | behavior |
|---|---|
| `kick(dx, dy)` | spring offset impulse (k 260, c 22); returns in ≈ 0.15 s; scaled by `settings.screenShake` |
| `addTrauma(t)` | trauma 0..1, decays 1.6/s. Shake offset = `14·trauma²·noise(time·32)` (value noise, not white noise) plus rotation `0.012·trauma²` rad (off on `low`) |
| `shake(mag, time)` | legacy: `addTrauma(mag/16)` plus keeps `time` as a minimum hold |
| `punchZoom(z, t)` | kept; the return now uses `ease.outCubic` over 0.18 s instead of the plain lerp |
| `zoomPulse(z, tin, hold, tout)` | shaped zoom for ultimates |
| `roll` (rad, ±0.03 max) | applied in `apply()` as a rotation around the view center; ultimate and awakening finals only |
| `cine(x, y, zoom, t)` / `cineEnd(t)` | override the framing (used by the cut-in and awakening while the world is frozen); `frameOn(x, y, zoom)` recomputes `x/y` immediately |
| `lookBoost` | extra look-ahead in px (sprint and dash) |

Screen flash policy (`core/game.js`, fixes defect 4):
- `game.flash(color, strength, decay)` multiplies `strength` by `settings.flashFx` (0, 0.5 or 1; default 1) and caps it at **0.7**.
- **Rate limit**: when more than 2 flashes above 0.3 happened in the last 1 s, later flashes are capped at 0.3.
- New `game.vignette(color, a, decay)`: an edge vignette instead of a full-screen fill. Used for player damage: `#ff0020`, 0.45, decay 3.

Kill slow-mo (`world.onEnemyKilled`):

| trigger | slow-mo | zoom | extra |
|---|---|---|---|
| last enemy in the room (the room had 3 or more awake enemies) | 0.30 s real time at **0.25×** (`world.slowmoScale`) | `zoomPulse(1.08, 0.08, 0.15, 0.2)` toward the victim | `kill_slowmo` SFX, blood or dust burst ×1.5, style +50 |
| elite kill | 0.20 s at 0.3× | 1.05 | `kill_slowmo` at 0.6 vol |
| F or crit kill with overkill ≥ 50% of max HP | 0.12 s at 0.4× | none | "오버킬!" callout |
| boss kill | existing `slowmo = 1.6` (scale 0.35) | existing | unchanged |

Rate limit: once per 1.5 s. No slow-mo during a cutscene, an ultimate or an awakening, or during a boss fight (except the boss kill).

### 4.10 Combo counter, style score, announcer, callouts (HUD)

`world.combo {n, t, max, best}` keeps its exact semantics (results scenes read `combo.best` and `combo.max`). A new **style meter** runs next to it.

Style points per hit: `10 × strength (L 1, M 1.5, H 2, F 3, U 0.2, S or A 0) × variety × air × otg`, plus event bonuses.
- **variety**: ×1.5 if this `moveId` is not among the last 6 hits; ×0.4 if it appears 3 or more times among them.
- **air**: ×1.3 if the target is airborne.
- **otg**: ×1.2.
- **Event bonuses**: launch +30, wall bounce or ground bounce +40, counter +25, back attack +10, kill +50, multi-kill (2 or more within 0.5 s) +60 per extra kill, chase jump +20, crit +10, stagger break +30.
- Companion hits (`tags` includes `'companion'`) count ×0.5.
- **Decay**: −30/s after 1.2 s without a hit.
- **Taking damage**: drops one rank, to the floor of the previous rank's threshold.

| rank | threshold | word (announcer) | Korean subcaption | color |
|---|---|---|---|---|
| D | 100 | GOOD | 좋아 | `#a0a0a0` |
| C | 250 | NICE | 멋지다 | `#7ee07e` |
| B | 500 | GREAT! | 훌륭하다 | `#5aa8ff` |
| A | 850 | EXCELLENT! | 굉장하다 | `#c07cff` |
| S | 1300 | SAVAGE!! | 잔혹하다 | `#ffa640` |
| SS | 1900 | INSANE!! | 광란 | `#ff5a4a` |
| SSS | 2700 (max 3200) | BLOOD NOCTURNE!!! | 피의 야상곡 | `#ffe070` (animated gold/red) |

At combo end, add a score bonus of `rankIndex² × 500`, on top of the existing `COMBO BONUS`. Each rank-up also adds **+1 awakening gauge**.

HUD layout (`feel_hud.js`; anchor at the right; in touch mode with the boss bar visible, shift everything down 80 px):

| element | geometry and animation |
|---|---|
| combo number | right-aligned at `(vw−28, 126)`. Size 46 (below 10), 52 (10–49), 58 (50–99), 64 (100+), in `FONT.dmg ?? FONT.num` 900. Each hit pops it (scale 1.35→1, 0.1 s) with a random rotation of ±3°. Rank-colored gradient. Behind it: a slanted dark-red **brush banner** sprite (180×54, pre-rendered) |
| "HITS" | 14 px under the number |
| timer bar | 90×4 blood-drip bar (`combo.t/combo.window`) |
| combo damage | "총 피해 123,456", 12 px |
| style letter | left of the number: `FONT.logo` at 52 px, rotated −0.12, with a progress ring to the next rank (2 px arc) |
| milestones | at 10/25/50/100/150/200/300 hits: "{n} HIT!" slams at the right side (scale 2→1, 0.12 s); `combo_milestone` SFX with the pitch rising per milestone |
| **announcer** | on rank-up: the word slams in at `(vw/2, 0.22·vh)` (scale 2.2→1 with overshoot, 0.12 s) with a **chromatic double-draw** (red at −2 px and cyan at +2 px for 0.15 s). The Korean subcaption (16 px) sits under it. Holds 0.7 s, fades over 0.25 s. At most 1 per 0.8 s, queue of 2. SFX `rank_up` plus `announce` with the pitch rising per rank |
| event callouts | world-space text near the target in the `top` particle layer, italic skew −12°, 15 px, life 0.6 s: "COUNTER", "BACK ATTACK", "벽 바운드!", "바닥 바운드!", "다운 추가타", "비틀!", "가드!", "추격!", "오버킬!" |

### 4.11 New SFX (WP6, `core/sfx_feel.js`, synthesized with the existing helpers)

`step_stone step_dirt step_wood step_metal step_snow step_water step_bone step_flesh step_push skid pivot land_heavy dash_burst launch wall_bounce ground_bounce down_hit counter back_attack hit_flesh hit_bone hit_ghost hit_stone impact_crack kill_slowmo rank_up announce combo_milestone ult_impact impact_frame awaken_hold awaken_charge cutin_whoosh brush_stroke seal_stamp eye_glint awaken_stinger awaken_boom heartbeat crow_caw finger_snap cylinder_spin choir_gate war_horn sheath`

Recipe notes:
- `step_*` layer a filtered noise click with a low sine thump; the filter depends on the surface (wood: bandpass 900; metal: FM ting at 0.05 vol; snow: highpass crunch; water: splash-lite).
- `awaken_stinger` = a taiko hit (sine 70→40 plus noise) + a choir chord (4 detuned saws, lowpass 2400, 1.2 s) + a reverse-cymbal swell starting 0.4 s before (noise with a rising gain), with duck `[0.7, 1.6]`.
- `brush_stroke` = bandpass noise sweep 600→3000 over 0.09 s.
- `seal_stamp` = low wood knock.

`audio.js` change: `import { FEEL_SFX } from './sfx_feel.js'`, `Object.assign(SFX, FEEL_SFX)` right after `SFX`, and call `def.fn(S, H)` with `H = { T, N, FM, ARP, BOOM, CRACKLE, mtof, R }`. Existing definitions ignore the second argument. `sfx_feel.js` must **not** import `audio.js` (that would create a cycle).

Budget: at most 10 SFX starts per 100 ms from feel code. Per-hit material layers are skipped when more than 6 `hit*` voices are live.

### 4.12 Rumble and vibration

Call `input.rumble?.(strong, weak, ms)` with the values in the table in 4.1, plus:
- heavy landing: 0.4 / 0.2 / 100 ms
- player hurt: 0.5 / 0.5 / 120 ms
- awakening stinger: 0.6 / 0.9 / 400 ms

On mobile, `navigator.vibrate` only for H and above (15 ms), S (60 ms), and the awakening pattern `[40, 30, 80]`, and only when `settings.vibration` is on.

---

## 5. Ultimate VFX overhaul (request #10)

### 5.1 Layer kit (`src/render/ultfx.js`)

```
ULTFX.begin(w, p, {color, accent, tier, dimCol})  // zoom-in, letterbox, radial lines, grade (screen-space overlays)
ULTFX.beat(w, x, y, {power:0..1, color, ground:bool})  // shockwave ring(s) + ground ellipse + sparks + camera kick
ULTFX.final(w, x, y, {color, accent, tier, ground})    // impact frame, triple ring, flash, roll, crack decal, ember rain
ULTFX.afterimage(w, p, tint)                     // tier-limited ghost trail (cached ghost bitmaps)
ULTFX.end(w)                                     // restore camera, remove overlays
```
Screen-space layers are pushed onto `world.overlays` (a WP2 hook: an array of `{draw(ctx, vw, vh, w), life, t}` drawn after `lighting.render` and `bg.drawFront`, before the `top` particles).
Cached sprites: a radial glow (256 px) per color (LRU of 24 entries), a radial speed-lines texture (512² with 64 wedges), an 8-point star, a cut line, a streak. **No gradient is created per frame inside the kit.**

### 5.2 Tier escalation (class tier from `CLASSES[hero.classId].tier`)

| layer | T0 (base class) | T1 (Lv10 class) | T2 (Lv25 class) |
|---|---|---|---|
| cast zoom | `zoomPulse(1.12, 0.2, 0.2, 0.3)` | 1.16 | 1.20 plus roll 0.8° |
| letterbox bars | — | 28 px, slide 0.15 s | 40 px |
| radial speed lines | alpha 0.25, static | 0.40, rotating 0.3 rad/s | 0.55, accent-tinted |
| color grade (full-screen `multiply` or `source-over` tint) | `ch.ult.color` at 0.12 | class accent at 0.18 | class accent at 0.22 plus vignette 0.35 |
| beat shockwaves | 1 ring | 2 rings (color plus accent) | 2 rings plus ground ellipse plus 6 dust |
| afterimages on hero motion | — | 3 | 5, accent hue |
| element particle layer (from `look.aura.type`) | — | 40 per ultimate | 80 plus back-layer soft motes (20) |
| final | flash 0.6 plus 1 ring | plus a 2nd ring plus ember rain (40) | plus **impact frame** (2 frames: black fill plus white silhouettes, drawn as a `difference` flash on `high` and `medium`, a plain white flash on `low`), 3 rings, crack decal, the **class flourish** below |
| skill name text near the hero | 22 px | 28 px | 34 px with a class-title prefix ("성전 기사 · 그랜드 크로스") |

Class accent = `CLASSES[id].look.aura?.color ?? look.secondary ?? ch.ult.color`.

**T2 class flourishes** (one extra layer each, played at the final):

| class | flourish | class | flourish |
|---|---|---|---|
| kael_templar | a golden shield sigil stamps at the center | victor_executioner | skull crosshair marks on each target plus a red execution flash |
| kael_inquisitor | burning cross brands on each hit enemy (fire decals) | victor_hellfire | fire explosion on every bullet impact |
| kael_bloodhunter | blood spray arcs plus red crescent afterimages | victor_gunlord | golden casings rain plus double muzzle flashes |
| kael_nightraven | a crow flock sweeps across the screen | bran_guardian | a holy shield dome pulse |
| sera_saint | angel wings spread behind Sera plus feather fall | bran_crusader | a crusader cross shockwave wave |
| sera_oracle | clock-face rune circle plus a ticking freeze ripple | bran_warlord | war banner silhouettes plus a dark fire ring |
| sera_archmage | tri-color elemental rings (fire, ice, thunder) | bran_bloodrage | blood geyser pillars |
| sera_stormcaller | lightning forks on each beat, thunderclap final | lia_shadowmaster | purple shadow clones mirror the slashes |
| victor_phantom | ghost bullets with blue trails pierce the screen | lia_kunoichi | a crimson petal storm |
| lia_bladedancer | a golden blade vortex | azel_nosferatu | a bat swarm vortex |
| lia_reaper | a spectral scythe arc | azel_bloodking | a blood crown sigil plus red lightning |
| azel_dawnbringer | the blood moon becomes a golden sunrise | azel_seraph | one white and one black wing, dual-color crescents |

Ultimate damage is **not** changed by tier: the tiers are purely visual.

### 5.3 Per-hero ultimate changes (`skills.js` `ULTS.*`)

| hero | changes |
|---|---|
| kael, 그랜드 크로스 | `ULTFX.begin` at cast (zoom on Kael over 0–0.3 s). The charge motes become a converging spiral. Each pillar gets `ULTFX.beat(ground:true)`. The cross expansion pulls the camera back (`zoomPulse(0.94…)`) to frame the whole cross. `ULTFX.final` at the cross center, then golden ember rain for 1.2 s. Whip afterimages during `cast_up` (T1+). |
| sera, 천상의 심판 | Sera rises 30 px during the cast. The rune circles get stained-glass color segments (cached sprite). Every 5th light-rain beam gets a splash ring. The final beam gets the impact frame (T2) and a white-gold grade. A back layer of falling feathers. |
| victor, 데드맨즈 핸드 | A sepia grade during the slow-mo. Each tracer hit gets a small star plus a 2 px kick. The flying cards are drawn motion-stretched (scaled along velocity). The final shotgun: a large muzzle-flash sprite, a recoil camera kick of `(−facing·10, 0)`, and the impact frame. |
| bran, 대지 분쇄 | The leap: the camera follows up with `zoomPulse(0.9)` and vertical speed lines. The dive keeps the existing afterimages. The slam: `ULTFX.beat(power 1)` plus a ground crack decal plus 30 debris shards, plus a beat at each rock spike. The final: rings plus a dust wall (smoke rolling along the ground in both directions). |
| lia, 천망회회 | Dim 0.85 plus a red vignette. The cut lines are drawn as chromatic double lines. A small kick on every 12th cut. The net closing: all lines brighten, then a black-red impact frame and a blood burst. `sheath` SFX after the final. |
| azel, 블러드 녹턴 | Keeps the moon and bats. The crescents get flying blood droplets along their edge. The final: a red grade plus **blood streams** (particles curving from each enemy to Azel) during the existing 15% heal. |

Other `ULTS` changes:
- `ultDirector` calls `ULTFX.begin`/`ULTFX.end`.
- `ultFinal` routes through `ULTFX.final` and passes `final: true`, so the attack is classed **S**.
- Its direct `game.flash(col, 0.85, 2.8)` becomes `flash(col, 0.6, 3)`, which the global cap and setting then apply to.

**Normal ultimate cut-in** (`UltCutinScene`, kept as the lighter tier below the awakening):
- Duration 0.9 s (was 1.1).
- Two stripes (character color plus black).
- The portrait slides in and slowly zooms 1.0→1.06; the speed streaks stay.
- Skill name in `FONT.brush ?? FONT.title` at 50 px with a red ink underline wipe; the class name small above it.
- `cutin_whoosh` at t = 0.
- T2 classes get a gold border.

---

## 6. 각성기, the awakening super ultimate (request #11)

### 6.1 Rules

| item | rule |
|---|---|
| availability | class **tier ≥ 1** (the first class change, Lv10). Tier 0 heroes do not see the awakening gauge. At tier 2 the awakening upgrades to **"진(眞) 각성"**: MV ×1.15 plus that class's variant layer (6.4) |
| resource | `run.aw` 0..100 (the awakening gauge) **and** `run.sp` ≥ 100. **Both are consumed** |
| gauge gains (`data/feel_hit.js` → `AW_GAIN`) | per hit landed +0.5 (crit +1.0); kill +2; elite kill +8; launch, bounce or counter +3; style rank-up +1; boss intro **+25**; each boss phase change +15; taking a hit of 10% max HP or more +6 ("분노"). Ultimate, awakening and companion hits give **0**. Every gain is multiplied by `1 + ultGain/200` |
| persistence | per stage run (`world.run.aw`), reset at stage start; kept across rooms and respawns |
| trigger | **hold the ult button 0.45 s** while both gauges are full. A tap under 0.20 s fires the normal ultimate **on release**. Releasing between 0.20 and 0.45 s cancels (`menu_cancel` SFX), so a thumb sliding off the touch button never fires the wrong move. When the awakening is **not** ready, ult keeps firing on **press** (no added latency). The optional `'awaken'` action (keyboard G, pad L3) triggers the awakening instantly |
| hold feedback | a ring around the hero fills clockwise over 0.45 s (world space, radius 52, 4 px, accent color); the screen edges darken 0→0.3; `heartbeat` SFX at 0 and 0.22 s; `awaken_hold` riser. During the hold the hero has **super armor** (takes damage, no hitstun) |
| blocked when | `world.cutscene`, `world.cleared`, `p.dead`, `world.transitioning`, `world.inputLock`, a boss intro is playing, or the hero is in hitstun |
| invulnerability | from hold completion until the director ends (`world.cutscene = true` already makes the player invulnerable) |
| enemies during the attack | `world.freezeEnemies = true`: enemy AI and enemy projectiles are held (as with `timeStop`, but without the grey overlay). Hits and knockback still apply. Bosses honor it if their owner adds the 1-line check |
| damage | total MV ≈ **2.2 ×** the hero's current ultimate total MV (per-hit weights in 6.4, normalized by `awaken.js` so the sum hits the target; tier 2 ×1.15). **Boss cap: 30% of boss max HP per awakening** (excess hits deal 1 and show "저항") |
| gauge UI | under the SP gauge: "각성" label plus a 120×6 bar (`#b0102a` with a moving drip highlight). When both gauges are full: both glow, and the ready text reads "각성 가능! [F 길게]" on keyboard, "[RT 길게]" on pad, "필살 버튼을 길게" on touch |
| settings | `cutinMode` ('full' or 'short'). A repeat within the same stage uses short mode automatically (7) |

### 6.2 Cut-in sequence timeline (`AwakenCutinScene`, pushed as `awakenCutin`)

The world is frozen for the whole scene, because only the top scene updates. The scene draws over the frozen world render. It sets `hidePad = true` and `world.hudHidden = true`.

| t (s) | full mode | short mode |
|---|---|---|
| 0.00 | freeze. Screen darken plus desaturate ramp 0→0.85 over 0.12 s (a black overlay at 0.6 plus a hero-color `color` blend at 0.25; `saturation` composite only on `high`). The hero is redrawn on top in the `cast_up` pose with a white rim flash. `awaken_charge` SFX. Rumble | same |
| 0.08 | radial speed lines around the hero (alpha 0→0.6); `camera.cine(hero, 1.22, 0.3 s ease.outCubic)` | same, 0.15 s |
| 0.22 | **the band** slides in from the right edge (0.16 s, `ease.outExpo`), with its accent stripes; `cutin_whoosh` | 0.10 |
| 0.26 | **the illustration** slides in inside the band from +18% of `vw` to 0 (0.20 s `ease.outExpo`), then drifts −4% of `vw` for the rest (parallax) | same |
| 0.50 | **eye glint**: a 4-point flare sprite at the image's face anchor eye point (from `data/awaken.js`), 0.2 s; `eye_glint` SFX | 0.30 |
| 0.42–1.00 | **signature line** stamps in glyph by glyph: 30 ms per glyph, each glyph scales 1.8→1 with alpha 0→1 plus 3 ink-splatter particles; `brush_stroke` every 3 glyphs; then the **red seal** (54×54, rotated −8°) with `seal_stamp` | the whole line fades in at 0.30 |
| 1.05 | `awaken_stinger` at full; the band brightens (the accent stripe flashes); rumble pattern | 0.55 |
| 1.30 | the band exits up-left (0.14 s); white flash 0.5; the **awakening title** "각성 — {name}" slams in at the center (`FONT.brush`, 48 px, white with a red outline, blood-drip underline) and stays 0.5 s | 0.62 |
| 1.45 | the scene pops; the world resumes; `camera.cineEnd(0.3)`; the awakening director starts (the title keeps fading over the world for 0.3 s via `world.overlays`) | 0.75 |

Skip: after 0.5 s, any button press jumps to 1.30.
Hitch prevention (defect 5): the cut-in image is fetched and `img.decode()`d the first time `handleUltInput` runs in a stage (long before the gauge can fill). The band background (a gradient plus a halftone pattern) is baked into an offscreen canvas at scene `enter`, so each frame is only a few `drawImage` calls.

### 6.3 Band geometry (logical px; `vw` is 960 to 1280, `vh` = 540)

- **Center line** through `(vw/2, 0.47·vh)` at **−7°** (rising to the right). Band height `H = 0.40·vh` (216 px), measured perpendicular to that line. The polygon extends 40 px past both screen edges.
- **Stripes**: 6 px in the hero color, 10 px above the top edge. 2 px `#e8c872` gold, 8 px below the bottom edge.
- **Band fill**: a gradient from `#000` (left) to `hero.dark` (right), plus a halftone dot pattern (alpha 0.18), plus speed streaks moving left at 1800 px/s.
- **Illustration**: clipped to the band. Its width is `1.15·vw`. Its face anchor `(fx, fy)` (0..1 image coordinates) is placed at `(0.66·vw, 0.47·vh)`. A **left fade** covers the image's left 45% (black, alpha 0.75→0) so the text stays legible.
- **Text zone**: `x ∈ [0.05·vw, 0.52·vw]`, baseline `0.47·vh + 12`, size 40 px (44 px when `vw ≥ 1100`). Wrap onto 2 lines at the em dash or the comma; line 2 at +48 px. Colors: white fill, 6 px outline `#1a0006`, ink shadow offset (3, 3) in `#5a0010`.
- **Seal**: follows the last glyph, 10 px gap, red square `#b0102a` with a white hanja in `FONT.title`.
- **Title at exit**: `(vw/2, 0.28·vh)`.

### 6.4 Per-hero awakening

Tier-2 variants use the class flourish colors from 5.2. The attack timelines run **after** the cut-in (t = 0 at scene pop). Every hit uses `tags: ['awaken']`. The MV column gives relative weights (normalized as in 6.1).

**Kael**

| field | value |
|---|---|
| awakening name | **비질리아 — 여명의 처형식** |
| signature line | **"발크레인의 이름으로 명한다 — 밤이여, 끝나라!"** |
| seal | 狩 |
| colors | `#fff2b0` / accent `#8a1426` |

| t | event | hits (MV) | VFX / SFX / camera |
|---|---|---|---|
| 0.0 | Kael cracks Vigilia overhead; the whip ignites in gold fire | — | whip glow; `whip_crack` pitch 0.8 |
| 0.2–1.1 | **8 lashes** across the screen, alternating diagonals, each a 1200 px glowing bezier ribbon | 8 × 0.55 on the enemies each ribbon crosses | a burning line persists on each; beat per lash; kick 3 px |
| 1.1 | the 8 lines tighten into a **cross-shaped cage** over the densest enemy cluster; enemies are pulled toward the center (vx 300) | — | lines converge 0.3 s; `holy` pitch 0.6 |
| 1.5 | **dawn**: a golden sunrise gradient sweeps up from the bottom of the screen | — | grade `#ffd870` 0.35 |
| 1.7 | **grand detonation**: a giant cross of light (vertical 140 px across the full height plus a horizontal beam across the full width) | 6.0, launch, class **A** | `ULTFX.final` tier 2, `awaken_boom`, ember rain 1.5 s |

T2 variants: templar, shield sigil and heal 10% HP. Inquisitor, the cage burns (fire DoT 3 s). Bloodhunter, blood-red lashes and 5% lifesteal. Nightraven, crows fly along the lash paths.

**Sera**

| field | value |
|---|---|
| awakening name | **천상의 문 — 세라핌 레퀴엠** |
| signature line | **"주여, 이 손에 심판의 권능을 허락하소서."** |
| seal | 聖 |
| colors | `#fff8d0` / `#1c2440` |

| t | event | hits (MV) | VFX / SFX / camera |
|---|---|---|---|
| 0.0 | Sera rises 60 px; **six seraph wings** of light unfold; the rosary staff is raised | — | `choir_gate`; wing sprites |
| 0.3 | **heaven's gate** opens at the top of the screen: a stained-glass rose window of 3 rotating rune layers | — | camera tilts up 40 px |
| 0.6–1.8 | **7 judgment pillars** sweep left to right (90 px wide, 0.15 s apart, 3 rehits each) plus holy feather rain | 7 × 3 × 0.2 | beat per pillar |
| 1.9 | a **cross beam of judgment** slams down from the gate onto the center | 5.5, launch, **A** | white-out flash 0.3 (capped), `awaken_boom` |

T2 variants: saint, halo plus 20% heal. Oracle, enemies move at 0.5× speed for 3 s afterwards. Archmage, alternating fire, ice and thunder pillars. Stormcaller, lightning pillars with chain arcs.

**Victor**

| field | value |
|---|---|
| awakening name | **실버 레퀴엠 — 여섯 발의 장송곡** |
| signature line | **"여섯 발이면 충분해. 지옥에서 세어 봐라."** |
| seal | 銃 |
| colors | `#ffd070` / `#7a1a1a` |

| t | event | hits (MV) | VFX / SFX / camera |
|---|---|---|---|
| 0.0 | enemies are held; a large translucent **6-chamber cylinder** overlay appears center-left; `cylinder_spin` | — | sepia grade |
| 0.3–1.5 | **6 shots**. Each shot: a 0.08 s micro-freeze, a crosshair lock (priority boss > elite > nearest), then a silver bullet that ricochets up to 3 times between enemies and **marks** each one it hits | 6 × 3 × 0.35 | one cylinder chamber lights per shot; a card falls (A or 8) |
| 1.6 | a twirl and holster, "찰칵" | — | `sheath` (metal) |
| 1.75 | every mark detonates at once | 1.5 per marked enemy, **A** | silver cross shockwaves, `awaken_boom` |
| 2.0 | Victor blows the smoke; an ace of spades flips at the screen center | — | — |

T2 variants: phantom, bullets pierce everything with ghost trails. Executioner, marked non-boss enemies under 25% HP are executed. Hellfire, fire detonations. Gunlord, **12 shots** (dual guns).

**Bran**

| field | value |
|---|---|
| awakening name | **철심 해방 — 기사단의 진혼가** |
| signature line | **"쓰러진 형제들이여, 이 검에 깃들어라!"** |
| seal | 鐵 |
| colors | `#ffb060` / `#2a3a6a` |

| t | event | hits (MV) | VFX / SFX / camera |
|---|---|---|---|
| 0.0 | Bran plants his greatsword; **6 spectral knights** rise behind him and salute. They are drawn once each with `drawHero` using a knight look and tint `#9ab0ff` at alpha 0.5, then **reused as cached ghost bitmaps** | — | `war_horn` |
| 0.4 | a leap (`vy −1200`); the sword grows 1→3.2× (weapon scale), wreathed in blue-steel fire | — | camera zooms out to 0.9 |
| 0.8 | a **colossal cleave** over the full screen height, 220 px wide; the earth splits (a crack decal across the floor) | 4.0, ground bounce all | beat power 1 |
| 1.0–1.8 | the spectral knights charge through the screen left to right as a wave | 6 × 0.5 (rehit) | banners flutter; dust wall |
| 2.0 | Bran and all the knights raise their swords; a giant sword of light falls into the crack | 4.0, launch, **A** | triple rings, debris shower |

T2 variants: guardian, a shield dome that grants 3 s of invulnerability afterwards. Crusader, a holy cross wave. Warlord, flaming banners (+2% damage per 10 combo hits). Bloodrage, blood fury with 10% lifesteal.

**Lia**

| field | value |
|---|---|
| awakening name | **흑우 — 까마귀의 장례** |
| signature line | **"까마귀가 울면, 누군가는 눈을 감는다."** |
| seal | 鴉 |
| colors | `#ff4a6a` / `#141018` |

| t | event | hits (MV) | VFX / SFX / camera |
|---|---|---|---|
| 0.0 | the screen goes near-black (dim 0.92); only the enemy silhouettes and Lia's red eyes stay visible; `crow_caw` | — | — |
| 0.2 | Lia vanishes into a burst of 80 black feathers | — | — |
| 0.3–1.5 | **12 blinks**: Lia appears behind each target (afterimage plus a red X slash), 3 hits each; a feather vortex; the slash lines accumulate | 12 × 3 × 0.12 | a small kick per blink |
| 1.6 | a **giant crow silhouette** spreads its wings across the whole screen (red eye) | — | — |
| 1.9 | Lia reappears at her starting spot and sheathes her daggers, "찰칵". **0.25 s of silence** (music ducked to 0) | — | `sheath` |
| 2.15 | every accumulated slash line flashes red; every enemy takes **delayed damage** (guaranteed crit) | 4.5 each, **A** | blood burst, red flash |

T2 variants: shadowmaster, shadow clones mirror every blink. Kunoichi, crimson petals. Bladedancer, a golden blade vortex. Reaper, a scythe sweep finale that heals 3% per kill.

**Azel**

| field | value |
|---|---|
| awakening name | **크림슨 이클립스 — 진조 해방** |
| signature line | **"이 저주받은 피로 — 당신의 밤을 끝내겠다, 아버지."** |
| seal | 血 |
| colors | `#ff2a4a` / `#141018` |

| t | event | hits (MV) | VFX / SFX / camera |
|---|---|---|---|
| 0.0 | the blood moon rises and is **eclipsed** (a black disc with a red corona) | — | `bell` pitch 0.5 |
| 0.3 | Azel's eyes flare; **wings of blood** unfold (the existing bat-wing drawer, recolored); the cape billows | — | — |
| 0.5–1.5 | **9 crescent blood slashes** crisscross the screen (0.1 s each); the world desaturates except for red | 9 × 0.5 | chromatic crescent echoes |
| 1.6 | Azel raises his hand and **snaps his fingers**, "딱" | — | `finger_snap`, 0.2 s freeze |
| 1.75 | every crescent bursts at once into blood rain; blood streams flow from the enemies into Azel (**heal 20% HP**) | 5.0, **A** | red grade, `awaken_boom` |
| 2.2 | the moon returns to red | — | — |

T2 variants: nosferatu, a bat swarm devours the enemies. Bloodking, a crown of blood (+50% crit damage for this cast). Dawnbringer, the eclipse becomes a **sunrise** and the crescents turn gold (holy). Seraph, one light wing and one dark wing with dual-color crescents.

### 6.5 Awakening data (`src/data/awaken.js`)

```js
export const AWAKEN = {
  kael: { name: '비질리아 — 여명의 처형식', line: '발크레인의 이름으로 명한다 — 밤이여, 끝나라!', seal: '狩',
          cutin: 'cg/cutin_kael', face: [0.62, 0.40], eye: [0.60, 0.36], color: '#fff2b0', dark: '#2a0a0e', accent: '#8a1426',
          mvWeights: [...], t2: { kael_templar: {...}, kael_inquisitor: {...}, kael_bloodhunter: {...}, kael_nightraven: {...} } },
  // sera, victor, bran, lia, azel — values from 6.4; face/eye measured on the final images (WP7 records them)
};
```

### 6.6 Cut-in illustrations: 6 Kling images (WP7)

| file | hero | rim-light color | key content (added to the common prompt) |
|---|---|---|---|
| `assets/cg/cutin_kael.webp` | kael | golden holy light | Kael Valcrane, young human vampire hunter, long dark brown ponytail, crimson bandana headband, amber-brown eyes, dark brown leather hunter coat with high collar and silver trim, silver cross pendant, cracking a glowing golden holy whip that arcs across the frame, holy sparks, fierce determined shout. Human: no fangs, no glowing eyes |
| `assets/cg/cutin_sera.webp` | sera | white-gold | Seraphina Lux, young battle nun, long silver-white hair and white veil, blue eyes, white-and-gold battle habit, raising a golden rosary staff, six radiant wings of light behind her, drifting feathers, serene but resolute expression, lips in prayer |
| `assets/cg/cutin_victor.webp` | victor | amber muzzle flash | Victor Grimm, rugged gunslinger in his thirties, black wide-brimmed hat shadowing one eye, stubble and a scar, long brown duster, an ornate silver revolver aimed straight at the viewer (foreshortened muzzle, spinning cylinder), a second revolver raised, gun smoke, playing cards (aces and eights) flying, cold smirk |
| `assets/cg/cutin_bran.webp` | bran | orange fire and steel-blue | Bran Ironheart, huge muscular knight, short red hair and full red beard, battle-worn steel plate armor with a tattered blue tabard, roaring war cry, gripping an enormous greatsword wreathed in blue-steel fire, ghostly translucent knights raising swords behind him, embers |
| `assets/cg/cutin_lia.webp` | lia | crimson | Lia Crow, agile young female assassin, short black bob hair, crimson eyes, lower-face mask, long crimson scarf flowing, dark leather ninja outfit, two curved daggers crossed in front of her face in reverse grip, black crow feathers swirling, a giant crow silhouette behind, cold killer gaze, single character only |
| `assets/cg/cutin_azel.webp` | azel | blood red | Azel de Nocte, elegant pale dhampir swordsman, long flowing platinum-silver hair, glowing golden eyes, black aristocratic high-collar coat, black cape with crimson lining spreading like bat wings, a slender crimson-glowing longsword, an eclipsed blood moon with a red corona behind, floating blood droplets, faint fangs, melancholic cold expression |

**Common prompt** (append after the key content, substituting the rim-light color):
"Extreme dynamic close-up for a fighting-game super-move cut-in, 21:9 ultra-wide cinematic framing, the character's face and upper body fill the right half of the frame, head turned three-quarters toward the viewer, intense eyes at about 40% from the top of the image, weapon crossing the frame diagonally, strong motion, wind-blown hair and cloth, dramatic rim light in {color}, dark background with crimson smoke and ember particles, the left 45% of the image is darker negative space, painterly anime-influenced dark gothic fantasy illustration, high detail, sharp focus on the eyes, single character only, no text, no letters, no logo, no watermark, no border, no frame."

Generation settings:
- Model `kling-image-v3_0_omni`, **aspect `21:9`**, 1 image per call.
- Use **image-to-image with the existing portrait** (`assets/portraits/<hero>.webp`, uploaded through the Kling file upload tool) as the identity reference, so the hero matches the select art and the HUD portrait.
- Call `mcp__kling__who_am_i` first to learn the argument format.
- If the identity or composition fails the review below, retry once. Budget: 12 images or fewer, about 24 credits.
- Record every generation in `tools/kling/cutin_manifest.json`, a separate file so the shared `manifest.json` never conflicts. Use the same fields: `group: 'cutin'`, `aspect_ratio`, `generationId`, `model`, `prompt`, `file`.

Post-processing (`tools/kling/cutin_process.py`, PIL):
1. Download (`curl -sSL`).
2. **Crop 7% off the bottom.** This removes the "KlingAI" watermark at the bottom right; the face sits in the upper-middle right, so nothing important is lost.
3. Resize to **1600 px wide**, keeping the aspect (about 1600×637).
4. Save as WebP, quality 82, method 6. Target **250 KB or less** each.
5. Check: mean luminance of the bottom-right 12%×8% region < 0.35 and no text-like high-contrast edges there (print a warning). Then do a **visual review**: open each file with Read and confirm there is no watermark, the face is on the right, the eyes are sharp, and the character matches the portrait.
6. Measure the `face` and `eye` anchors (0..1 image coordinates) and write them into `data/awaken.js`.

Fallback when an image is missing or fails to load: draw `portraits/<hero>` (2:3) in the band, scaled to `0.9·H` and positioned the same way. The cut-in must never throw.

---

## 7. Settings and accessibility

| key (`DEFAULT_SETTINGS`) | row label (Korean, `options.js`) | values | default |
|---|---|---|---|
| `flashFx` | 화면 번쩍임 | 끔 (0) / 약하게 (0.5) / 보통 (1) | 1 |
| `cutinMode` | 각성 컷인 | 전체 / 짧게 | 'full' |
| `autoSprint` | 자동 달리기 | 끔 / 켬 | false |

- `screenShake` (existing) also scales `kick` and `trauma`.
- `showDamage` (existing) hides damage numbers and callouts, but **not** the announcer.
- Blood decals are off on `low` quality.
- The awakening cut-in can be skipped after 0.5 s. Short mode is used automatically on the 2nd and later awakening in the same stage.

---

## 8. Performance budgets (mobile and desktop)

Targets: 60 fps on a mid-range Android device (2021 or newer, `medium`), 50 fps or more on low-end devices at `low`, 60 fps on desktop at `high`.

| budget (per frame unless stated) | high | medium | low |
|---|---|---|---|
| particles live (`fx.max`) | 1400 | 900 | 500 |
| particles emitted per hit (all layers) | ≤ 28 | ≤ 18 | ≤ 10 |
| ultimate peak particles (measured today: 269–687) | ≤ 600 | ≤ 400 | ≤ 220 |
| awakening peak particles | ≤ 700 | ≤ 450 | ≤ 250 |
| damage numbers live (atlas-drawn) | 24 | 16 | 10 |
| afterimages live | 8 | 5 | 3 |
| decals per room | 40 | 24 | 0 |
| full-screen passes during an ultimate or awakening (dim, grade, flash, vignette) | ≤ 3 | ≤ 2 | ≤ 1 |
| `saturation` or `difference` composites | ≤ 2 frames per cast | ≤ 2 frames | none |
| gradients created per frame (the new code uses cached sprites) | ≤ 16 | ≤ 10 | ≤ 6 |
| `drawHero` full redraws per frame (knights and clones use cached ghost bitmaps) | ≤ 10 | ≤ 6 | ≤ 3 |
| offscreen canvases created after stage start | 0 (pooled at init) | 0 | 0 |
| SFX starts per 100 ms (feel code) | ≤ 10 | ≤ 8 | ≤ 6 |
| cut-in image | 1 per stage (the current hero), pre-decoded, 250 KB or less on disk, about 4 MB decoded | same | same |
| camera roll or rotation | on | on | off |

Headless relative checks (the WP8 harness, same machine, 960×540):
- Ultimate or awakening average frame time ≤ **1.8×** the gameplay average (main-thread CPU ratio ≤ 1.8× as well), and p95 ≤ **3.0×** the gameplay median; absolute guard on this harness: ultimate average ≤ 12 ms. (Round 2 lead decision: the old 1.5×/2.5× ratios failed only because the gameplay baseline is very light — 5–7 ms — while every absolute cost stays far under the 16.7 ms frame.)
- No frame over **250 ms** after the first 2 s of a stage, including the first awakening.
- Sprinting with 6 enemies hit at SSS style: average ≤ **1.5×** the idle-walk average (CPU ratio ≤ 1.5× as well); absolute guard: sprint average ≤ 10 ms. (Round 2 lead decision, was 1.2×.)

Instrumentation: `window.__feelStats = { particles, dmgNums, ghosts, gradients, heroDraws, sfxStarts }`. It is updated only when `?debug` or `?feelstats` is in the URL.

---

## 9. Code-level change list

### WP1: movement (`player.js` line numbers as of this spec)

| file | location | change |
|---|---|---|
| `src/data/feel_move.js` (new) | — | `GAIT` (3.1, 3.3.2), `CADENCE`, `PERSONALITY`, `SURFACE`, `DASH_FX`, `SPRINT` (0.24 s double-tap window, k values), `SKID`, `LAND` constants |
| `src/game/feel_move.js` (new) | — | `initFeel(p)`; `updateGait(p, world, dt, inp)` (double-tap and dash-chain sprint detection, the walk/run/sprint target speed returned to the player, skid/pivot/run_start/land_heavy state, gait phase and footstep events); `onJump(p, world, air)`; `onLand(p, world, vyBefore, fallPx)`; `dashFx(p, world, phase)`; `squashSpring(p, dt)` |
| `src/render/hero_gait.js` (new) | — | `gaitPose`, `applyFeelOverlay`, `GAIT_ANIMS`: pure functions on the pose object |
| `src/game/player.js` | constructor (lines 37–55) | `initFeel(this)`; fields `gait, gaitPh, moveFx, moveFxT, feel{sq, sqV, accLean}, sprinting, apexY` |
| | movement block (lines 123–139) | the target speed comes from `updateGait` (walk 0.5 B, run B, sprint k·B, analog via `input.analogX ?? input.axisX`); skid and pivot decel values; skid edge guard |
| | dash (lines 110–118, `startDash` lines 231–246) | `dashFx` start, per-step and end; the ghost trail cadence moves into `dashFx` (0.035 s, cap 6); end with the direction held → `sprinting = true` |
| | jump (`doJump` lines 273–286, wall jump lines 255–261) | `onJump` (stretch, rings, per-hero flourish) |
| | `physics()` landing (lines 195–201) | track the fall start (`apexY`); `onLand` decides heavy or normal landing; keep the existing dust and SFX as the normal branch |
| | `handleAttackInput` (line 338) | the dash-attack condition becomes "`dashT > 0` or `sprinting`" (and `ms.dash` exists); buffers use `ATK_BUF + min(0.3, world.frozenRecent ?? 0)` (lines 250 and 317) |
| | `makeAttack` (lines 412–419) | add `moveId: mv.id` |
| | `updateAnim` (lines 592–617) | the new priority order (3.2); anims `walk`/`sprint`/`run_start`/`skid`/`pivot`/`land_heavy`; **delete the `stepT` footstep block** |
| | `snapshot()` (lines 623–628) | copy `gaitPh`, `feel` (`sq` only) and `gait` |
| | **do not touch** line 298 (ult) | WP5 owns it |
| `src/render/hero.js` | anim switch (about line 1768) plus pre-`solve()` (about line 1811) | the hook in 3.3.3 |

### WP2: hit feel core

| file | location | change |
|---|---|---|
| `src/data/feel_hit.js` (new) | — | `STRENGTH_RULES`, `FEEL_MOVE_OVERRIDES` (at least gsCharge→F 0.167; every `*Down` → H with `otg: true`; whipA2, gsA1, swDown, gsDown, stDown, dgDown with `gb: true`), `HITSTOP` (4.1), `HS_CAP` 0.40, `WEIGHT` (4.2), `JUGGLE` (4.3), `DOWN` (4.4), `BOUNCE` (4.5), `MATERIAL` (4.7), `DMG_STYLE` (4.8), `STYLE` (4.10), `AW_GAIN` (6.1), `RUMBLE` (4.1, 4.12), `BUDGET` (8) |
| `src/game/impact.js` (new) | — | `impact(world, attack, target, info)`: strength class, counter and back-attack detection (it adjusts `info.dmg` **before** `takeHit`, so `hitTarget` calls `preImpact` first and then `impact`), hitstop with the cap, camera kick and trauma, rumble, hit sprite, material burst, element accent, decal, damage number, callouts, style and awakening hooks via `world.onPlayerHit(target, info, attack)` (the existing signature plus `info.cls`, `info.counter`, `info.back`, `info.air`) |
| `src/game/combat.js` | `hitTarget` lines 53–111 | replace the effects block (lines 71–108) with `preImpact` and `impact`; the enemy-to-player branch calls `impact` too (player-hurt style: vignette, 3-frame hitstop, blood); `computeDamage`, `classPerkAttack` and `playerStrike` are unchanged |
| `src/game/enemy.js` | constructor | `wclass`, `jn`, `down`, `otg`, `wakeInv`, `stagger`, `wbArmed`, `gbArmed`, `hsShake`, `react{t, lean, sx, sy, spin}` |
| | `update` stun branch (lines 122–128) | juggle gravity, air damping, ground friction 0.86, wall-bounce and ground-bounce detection, knockdown on landing, wake-up; `world.freezeEnemies` skips AI like `timeStop` does |
| | `takeHit` (lines 148–165) | weight-class knockback, launch, hitstun table, stagger meter, OTG handling, `wakeInv` rejection (`invuln` while `wakeInv > 0`) |
| | `draw` (lines 190–210) | the reaction transform (squash, lean, tumble, lying, hitstop vibration, armor flash) around `(cx, bottom)` before `drawEnemy` |
| `src/core/particles.js` | presets and shapes | presets `ecto`, `paper`, `gravel`, `goo`, `bloodmist`, `feather`; shapes `sprite` (cached canvas, rot/scale/alpha curves), `decal`, `streak`, `ering` (ellipse ring), `dmg` (atlas digits), `callout`; `update(dt, map)` unchanged, but the world calls it with a scaled dt during hitstop; `clearDecals()` |
| `src/render/hitfx.js` (new) | — | sprite cache (`glow(color)`, `star`, `cut`, `streak`, `ring`), `digitAtlas(style)` baked after `document.fonts.ready`, `materialBurst(fx, mat, x, y, dir, cls, color)`, `stampDecal(world, x, y, dir, mat)` |
| `src/core/camera.js` | whole class | kick spring, trauma and noise shake, legacy `shake()` mapping, `zoomPulse`, `roll`, `cine`/`cineEnd`/`frameOn`, `lookBoost`, eased punch-zoom return |
| `src/game/world.js` | constructor (lines 57–68) | `slowmoScale = 0.35`, `freezeEnemies`, `freezeLog`, `frozenRecent`, `overlays = []`, `hudHidden`, `style = new Style(this)`, `run.aw = 0`, `killSlowT` |
| | `update` (lines 226–245) | during hitstop: `fx.update(dt*0.3)`, camera springs at full dt, `frozenRecent += dt`; `slowmoScale`; enemy projectiles also held when `freezeEnemies` is set; tick `style`; tick `overlays` |
| | `render` (lines 293–327) | draw `overlays` after `bg.drawFront`; draw letterbox bars when `this.letterbox > 0` |
| | `onPlayerHit` (lines 351–362) | keep the combo, score, SP and lifesteal code; add `style.onHit(info, attack, target)`, awakening gain (`AW_GAIN`, only when the hero's tier is 1 or higher), milestone events; keep the `bus.emit('combo')` every 25 hits |
| | `endCombo` (lines 363–373) | add the style bonus |
| | `onEnemyKilled` | kill slow-mo rules (4.9), multi-kill detection, `style.onKill` |
| | `onPlayerHurt` | style rank drop; `game.vignette`; awakening rage gain |
| | boss intro and phase change | awakening +25 (in the `startBoss` → `bossIntro` `onDone` callback) and +15 per phase change (detected by polling `boss.phase` in `world.update`, so no boss file changes) |
| | `loadRoom` | `fx.clearDecals()`, `overlays.length = 0` |
| `src/game/style.js` (new) | — | `class Style { pts, rank, best, last6[], onHit, onEvent, onKill, onHurt, update(dt), rankUp callbacks → HUD announcer queue }` |
| `src/core/game.js` (shared) | `flash()` lines 146–148 | cap, `settings.flashFx`, rate limit; new `vignette()` state drawn after the flash in `render()` |

### WP3: HUD and settings

| file | change |
|---|---|
| `src/render/feel_hud.js` (new) | `drawComboHUD(ctx, world, vw, vh, touch)`, `drawAnnouncer(ctx, world, vw, vh)`, `drawAwGauge(ctx, world, x, y, w, touch)`, brush-banner sprite cache |
| `src/render/hud.js` | at the top of `drawHUD`: `if (world.hudHidden) return;`. Replace the combo block (lines 127–146) with `drawComboHUD` plus `drawAnnouncer`. After the SP gauge (line 113), call `drawAwGauge`; the ready text shows the awakening hint (6.1). Keep the `styleRank` export in `world.js` working (it is used only here; remove the import once it is unused) |
| `src/core/save.js` (shared) | `DEFAULT_SETTINGS` gains `flashFx: 1, cutinMode: 'full', autoSprint: false` |
| `src/scenes/front/options.js` (shared) | 3 rows inserted before `guide` (section 7) |

### WP4: ultimates

| file | change |
|---|---|
| `src/render/ultfx.js` (new) | the kit in 5.1 plus the tier table in 5.2 plus the 24 T2 flourishes as small draw/tick recipes |
| `src/game/skills.js` | `castUltimate` (lines 29–40): read the tier and accent, pass them to `ULTS[char](p, w, {tier, accent, classId})`, flash via the policy. `ultDirector` (lines 2190–2216): `ULTFX.begin`/`end`. `ultFinal` (lines 2218–2224): `ULTFX.final`, `final: true`. `ULTS.kael`…`ULTS.azel` (lines 2226–2500): the changes in 5.3. **New export** `FXKIT = { fx, seq, glow, beamV, beamH, crescent, cutLine, runeCircle, flare, boomRing, pillarFx, spikeFx, afterimage, ghostOf, uHit, atk, viewRect, enemiesIn, groundAt, pose, holdInvuln, charCol, bestType, ADD, batShape, wing, bloodMoon, cardShape, gunOf, muzzle }` (only helpers that already exist). Skill implementations are unchanged |
| `src/scenes/overlays.js` | only `UltCutinScene` (lines 94–118): the upgrade in 5.3 |

### WP5: awakening

| file | change |
|---|---|
| `src/data/awaken.js` (new) | the `AWAKEN` table (6.5) with all Korean strings from 6.4 |
| `src/game/awaken.js` (new) | `handleUltInput(p, world)` (the hold logic in 6.1; returns true when it consumed the input; preloads and decodes the cut-in); `canAwaken(p, world)`; `castAwakening(p, world)` (consume the gauges, set invulnerability, `freezeEnemies`, push `awakenCutin` with `onDone` → start the director); `AWAKEN_DIRECTOR[charId](p, w, v)` built on `FXKIT` and `ULTFX`; the boss damage cap (a per-cast `Map` from boss to damage, applied through an `attack.capFn` read in `impact.preImpact`); the hold-ring draw (a world-space `SkillFx`) |
| `src/scenes/awaken_cutin.js` (new) | `AwakenCutinScene` (6.2, 6.3): `opaque = false`, `hidePad = true`, `deferToasts = true`, skip handling, short mode, baked band canvas, fallback to the portrait |
| `src/scenes/index.js` (shared) | `import { AwakenCutinScene } from './awaken_cutin.js'` plus `game.register('awakenCutin', AwakenCutinScene)` |
| `src/game/player.js` line 298 (after WP1) | `if (handleUltInput(this, world)) return;` (replaces the `input.pressed('ult')` line) plus the import |

### WP6: SFX
`src/core/sfx_feel.js` (new) with every name in 4.11, plus the `audio.js` merge (4.11).

### WP7: cut-in art
The six images, the manifest and the processing script (6.6). Record the `face` and `eye` anchors in `data/awaken.js` (coordinate with WP5; WP7 may edit only those two fields).

### WP8: tests
`tools/feel_test.mjs` (section 10).

---

## 10. Acceptance tests

Harness `tools/feel_test.mjs`, modeled on `tools/integration.mjs`:
- It drives input through `input.sources.key` (plus `input.analogX` overrides and a mocked `navigator.getGamepads`).
- It spawns passive dummies with `new Enemy(id, …)` (hp 1e7, `ai = {update(){}}`, `harmless`) on the widest flat floor, with `world.transitioning = true`.
- It checks `window.__feelStats` and writes `/tmp/claude-0/qa_feel/report.json` plus screenshots.
- **Every case must also report zero `pageerror` or console errors.**

| # | test | pass criteria |
|---|---|---|
| M1 | run speed unchanged | each hero's max `abs(vx)` = B ± 2; jump apex = today ± 4 px (1); dash distance = today ± 6 px |
| M2 | walk (analog 0.4) | steady `abs(vx)` = 0.5·B ± 3; `p.gait === 'walk'`; `p.anim === 'walk'` |
| M3 | sprint by double-tap, by dash chain and by touch outer ring | within 0.25 s, `abs(vx)` reaches k·B ± 3 and `p.sprinting`; a third tap later than 0.24 s does not sprint |
| M4 | skid, pivot, edge guard | slide after release: run 17–26 px, sprint 30–44 px; `anim` shows `skid` for 0.14–0.24 s; skidding toward a ledge stops at 6 px or less from the edge with `onGround` still true |
| M5 | footsteps in sync | footstep events/s at full run = 4.2 × `PERSONALITY[hero].cad` ± 0.2; each event happens when `gaitPh mod π < 0.2`; the legacy `stepT` path is gone |
| M6 | squash and heavy landing | `feel.sq` ≥ 1.12 within 2 frames of takeoff; ≤ 0.86 on a normal landing; a fall from 5 tiles gives `anim === 'land_heavy'` and `sq` ≤ 0.76; a 1-tile hop is never heavy |
| C1 | hitstop table | for one move of each class L/M/H/F against a skeleton, the logged `world.hitstop` right after the hit equals the table ±1 frame (crit off: `stats.crit = 0`) |
| C2 | hitstop cap | lia holding attack on 3 dummies for 3 s: frozen time is ≤ 0.40 s in every 1 s window |
| C3 | particles bloom during hitstop | during an F hitstop, the average spark displacement is > 0 |
| C4 | buffer compensation | an attack pressed 0.05 s into a 0.25 s S-class freeze still chains |
| C5 | juggle | whip launcher on a skeleton: apex ≥ 240 px, airtime ≥ 1.1 s; the 15th airborne hit shows the "가드!" callout and gravity 1.3 |
| C6 | knockdown, OTG and wake-up | a juggled skeleton lands with `down > 0`; 2 OTG hits then `wakeInv > 0`; a 3rd hit during `wakeInv` deals 0 |
| C7 | wall bounce | a greatsword finisher pushes a skeleton into a wall: `vx` changes sign, "벽 바운드!" appears, exactly once per juggle |
| C8 | ground bounce | an air down attack on an airborne zombie: `vy` < 0 after landing and no knockdown |
| C9 | weight classes | `armor_knight` (0.7) is never launched by `whip1`; `gear_golem` staggers after about 12 points; `bone_pillar` (1.0) never moves |
| C10 | counter and back attack | hitting a skeleton during its windup gives "COUNTER" and damage ×1.25 ± 5% (fixed rand); hitting its back gives "BACK ATTACK" |
| C11 | material sparks | a hit on each of the 9 materials spawns ≥ 1 of its recipe's preset, and the total particles per hit is ≤ the budget |
| C12 | damage numbers | 10 fast hits give a stacked column plus one "합계" number; live numbers ≤ 24; `showDamage` off shows none |
| C13 | kill slow-mo | killing the last of 3 enemies gives `slowmo > 0` with `slowmoScale 0.25`; a 2nd trigger within 1.5 s is ignored |
| C14 | style and announcer | a scripted varied combo reaches rank B or higher with the "GREAT!" announcer; spamming one move stays at C or lower; taking a hit drops one rank |
| C15 | flash policy | 5 `game.flash(…, 1)` calls within 1 s: `flashFx.a` ≤ 0.7, and later ones ≤ 0.3; `flashFx = 0` gives no flash |
| U1 | all ultimates × tiers | for each hero × `classId` in {tier 0, one tier 1, one tier 2}: a cast completes, `world.cutscene` lasts today's duration ± 10% (1), overlays clear afterwards, peak particles ≤ budget, the camera zoom returns to 1 ± 0.01 |
| U2 | ultimate frame cost | the headless ratios in section 8 |
| A1 | tier 0 locked | at tier 0 with `aw = 100, sp = 100`: pressing ult fires the **normal** ultimate immediately on press (no hold delay) and `awakenCutin` is never pushed, even when held 0.6 s |
| A2 | hold logic | tier 1: a tap (0.1 s) gives the normal ultimate; a 0.3 s hold cancels (gauges unchanged); a 0.5 s hold pushes `awakenCutin`; both gauges then read 0 |
| A3 | cut-in timeline | the scene pops at 1.45 ± 0.05 s (full) and 0.75 ± 0.05 s (short); the rendered text equals `AWAKEN[id].line`; the cut-in asset loaded (`assets.has('cg/cutin_<id>')`) or the fallback was used without errors |
| A4 | awakening completes | for each hero, the director ends, `world.cutscene` returns to false, `freezeEnemies` returns to false, and damage to a 1e7-HP dummy is > 0 |
| A5 | boss cap | in `s04&room=boss`, one awakening deals ≤ 30% of the boss max HP |
| A6 | no hitch | no frame > 250 ms from cut-in start to the end of the director, including the first awakening of the session |
| A7 | touch | 844×390 mobile emulation: pointer-down on `.b.ult` for 0.5 s triggers the awakening; the combo HUD rectangle does not overlap the boss bar rectangle |
| A8 | gamepad | a mocked pad with RT held 0.5 s triggers the awakening; `axes[0] = 0.4` gives walk (once the input workstream ships `analogX`) |
| V1 | visual review | screenshots of each hero's cut-in at t = 0.8 s and each ultimate's final frame, reviewed by opening the PNGs: no watermark, the face is visible in the band, the text is not clipped at 960 or 1280 widths, and the Korean text renders in the brush font |

(1) "Today" refers to the baseline table in section 1.

---

## 11. Risks and mitigations

| risk | mitigation |
|---|---|
| Sprint momentum and skid slides break platforming precision | Base speed unchanged; sprint is opt-in; skid edge guard; `autoSprint` off by default; M1, M4 |
| Longer hitstops make fast heroes feel sluggish | Rolling 0.40 s/s cap; gun L is 2 frames; continuation hits are 1 frame; C2 |
| Infinite juggles or OTG loops | Juggle decay, a limit of 14, OTG at most 2 then wake-up invulnerability, bounces once per juggle; C5, C6 |
| Photosensitivity | Flash cap 0.7, rate limit, `flashFx` setting, vignette instead of full-screen red; C15 |
| Mobile frame drops | Cached sprites and a digit atlas, hard caps (8), pre-decoded cut-in, no per-frame allocations; U2, A6 |
| Edit conflicts with parallel workstreams (`hero.js`, `player.js`, `input.js`, `hud.js`, `options.js`, `game.js`) | One owner per file (2.2); shared edits are append-only and minimal; contracts with `?.` fallbacks (2.1) |
| Kling identity drift, or the watermark survives | Image-to-image from the existing portraits, 1 retry, the automated bottom-right check, and a visual review; portrait fallback |
| Awakening trivializes bosses | 30% boss cap; both gauges are required; gauge gains tuned so a full gauge takes about 200 hits (plus the boss intro grant) |
| Korean text overflows the band on 960-wide screens | Auto-wrap at the em dash or comma, size step-down to 34 px, V1 at both widths |
| Awakening triggered in an unsafe state (room transition, dialogue, death) | The explicit blocked-state list (6.1); the director's `end()` always clears `cutscene`, `freezeEnemies`, `hudHidden` and the overlays, even when the world unloads (`loadRoom` clears them too) |
