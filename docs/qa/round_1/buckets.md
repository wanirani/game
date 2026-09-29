# QA round 1 — defects by W4 fix bucket

2026-09-29T00:18:04.385Z · 81 open defects (S1 0, S2 3, S3 43, S4 35) · full list: `/tmp/claude-0/qa/round_1/defects.json` · steps: `/tmp/claude-0/qa/round_1/summary.json`

Steps run: validate_maps ok, part2_static ok, fonts FAIL, hook_tags FAIL, bindings ok, painted_registry ok, save_v2 ok, settings_v2 FAIL, companion_state ok, accounts_api ok, sfx ok, hud_layout ok, balance.kael FAIL, balance.sera FAIL, balance.victor FAIL, balance.bran FAIL, balance.lia FAIL, balance.azel FAIL, balance_review ok, balance_companions FAIL, scan_mount_fit ok, integration ok, part2 ok, mount ok, guardians ok, companions FAIL, commands FAIL, feel FAIL, platform FAIL, integration_mobile ok, gallery.audio ok, gallery.bosses_a ok, gallery.bosses_b ok, gallery.bosses_c ok, gallery.bosses_d ok, gallery.enemies_a ok, gallery.enemies_b ok, gallery.enemies_c ok, gallery.enemies_d ok, gallery.guardians ok, gallery.hero ok, gallery.items ok, gallery.levelsA ok, gallery.mounts ok, gallery.story ok, gallery.town ok, gallery.turntable ok, build_web FAIL, soak ok, build_web_gaps ok, load_dist FAIL, sw_offline ok, artifact ok, perf FAIL, visual ok

Not run yet: (none)

## Round summary

- Full §5.1 matrix ran 22:54Z–00:05Z in 14 parts (tools/qa/run_all.mjs --round 1 --only <part>; per-part summaries in parts/). Not run: APK build/verify (run_all --apk not requested; APK-FU verified it in W3) and the post-deploy smoke (no site URL this round).
- Green: validate_maps, test_part2 --static, bindings, painted_registry, save_v2, companion_state, accounts API, sfx, hud_layout, balance hard/inferno tables, scan_mount_fit, integration desktop 46/46, integration --mobile 46/46, test_part2 265/265, test_mount 15/15, test_guardians 22/22, 17/17 gallery smokes, soak 61 cycles (heap +6 %, canvases +0.6 %, 0 errors), sw_offline 15/15, artifact --check, visual_review 80/80 checks. No page or console errors in any suite.
- Red: fonts --check (52 glyphs) and therefore build_web (font gate deletes dist/web, so load/SW/artifact were re-run on a temporary --allow-font-gaps build: see delivery2/); hook_tags draw.fx (a_common); test_settings_v2 stale fixture; balance --check 6/6 heroes (Part 2 exp not tuned yet); balance_companions + test_companions 17/22 (gd_fairy share, reaper execute hitstop, floating boss hurtboxes); commands 144 pass / 42 fail (14 cases x kb/pad/touch, all technique shadowing); feel_test 138 pass / 5 fail (I1 __feelStats, U2 x4 ult CPU after combo) + V1 overlap; platform 2 fail (P-09 load budget); perf_budget 490 failing checks in 7 families (canvases after stage start, gradients, full-screen passes, touch painted texture budget, draw-path FX, menu live canvases).
- Integration-notes seeds: 7 of 8 verified fixed this round (s03 r2 direct load, s08 merman/killer_fish, smith/shop registration, b_dracula_transform, b_grimoire title, m_bone icon, hidden rooms); per-platform platRange/platSpeed stays open as S4 (R1-SEED-PLAT).
- requests.jsonl: every open line (HOOK-SWEEP ROUTED lines 296-313 + W3 lines 308-372) is folded into a defect below (field requests = line numbers); closed/resolved lines and why are listed at the end. Not reproduced this round and closed: #371 right stick in equip/class tabs (stick371*.json), #186/#187/#208 turntable taps, #195/#217 menu equip fhd2x (10.0 ms CPU).

## Lead decisions needed

- R1-REQ-112: painted boss hurtbox sign-offs (#112/#146) are a lead review, not a code fix.
- R1-REQ-323: left-handed touch spawn cap is a design call (bigger cap vs accept overlap).
- R1-REQ-367 / R1-REQ-368: either tune the data/AI (hints) or amend companions §9 (support guardians' 6 % floor) / §14 C10 #4 (execute hitstop exception).
- R1-REQ-369: mt_boar jump 700 vs 3-tile ledges — tune or document the trade-off (companions §3).
- R1-REQ-345: MASTER_PLAN §5.1 delivery row names serve_dist flags that do not exist; the lead owns the plan (or FIX-DELIVERY adds the flags).
- R1-RUN-TEX-TOUCH: confirm the tablet painted-texture budget (touch 24 MB vs desktop 64 MB).
- R1-RUN-BOSSFRAME: confirm intended boss framing in wide Part 2 arenas before FIX-ENGINE changes the camera.
- R1-REQ-92: optional touch technique radial — keep or drop.
- Round order: FIX-DELIVERY should rebuild the font subsets LAST in the round (after every bucket's Korean text edits) and then run build_web without --allow-font-gaps, platform_load --dist, test_sw and build_artifact --check.

## Cross-bucket notes

- R1-REQ-229 load budget: main.js dynamic imports (FIX-PLATFORM) need matching lazy entry points in bosses/index.js (FIX-AI-BOSS), render/enemies.js (FIX-RENDER) and awaken.js (FIX-ENGINE); the bundler already emits lazy chunks for import().
- R1-REQ-174 + R1-REQ-173: Dullahan skullOut recount (FIX-AI-BOSS) and guardian breakProj calling expire() (FIX-COMPANIONS) are two halves of one bug.
- R1-REQ-338 full-screen passes: ultfx.js pass merging (FIX-RENDER) + the flash/tint calls in skills.js (FIX-SYSTEMS).
- R1-REQ-330 ult frame cost after a combo: HUD restore()/clip cost (FIX-HUD feel_hud.js/hud.js) and tile chunk blits (FIX-RENDER tiles.js).
- R1-REQ-331 damage-number overlap: fx.dmg/callout lanes live in src/core/particles.js (FIX-ENGINE); hitfx.js sprites (FIX-RENDER) only if needed.
- Canvases created after stage start (feel §8 budget 0) are split per bucket: R1-REQ-339S (skills.js), R1-REQ-339R (hitfx/ultfx/hero_puppet), R1-REQ-340R (painted kit/enemy_kit/b_narkissa/b_chaos/b_grimoire/tiles), R1-REQ-340E (lighting), R1-REQ-339E (awaken_directors_b), R1-REQ-340B (b_common), R1-REQ-339A (overlays/awaken_cutin), R1-REQ-339B (menu/common), R1-REQ-339P (prompts/ui). Re-measure with node tools/qa/perf_budget.mjs --profiles desk,phone1 after the fixes.
- Gradient budget: R1-REQ-341E (props.js), R1-REQ-341R (background.js), R1-REQ-341B (menu/common, facades), R1-RUN-GRAD-SKILLS (skills.js ult FX).
- R1-REQ-371T: FIX-TOOLS extends tools/qa/turntable.mjs so the right-stick check also covers the equip/class tabs (the product bug was not reproduced).

Buckets with S1-S3 defects (spawn one FIX agent each): FIX-COMPANIONS (5), FIX-DELIVERY (2), FIX-ENGINE (7), FIX-AI-BOSS (9), FIX-DATA (2), FIX-HUD (1), FIX-PLATFORM (4), FIX-RENDER (7), FIX-SCENES-A (2), FIX-SCENES-B (3), FIX-SYSTEMS (3), FIX-TOOLS (1)

## FIX-ENGINE (10: S1 0, S2 1, S3 6, S4 3)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-347 | S2 ✔ | Technique commands shadowed by earlier-learned shorter ones: d13 casts tech_palm, d16 tech_tatsu/tech_hadou, d19 tech_thunder (§1.21 requires d19 from a standstill), d26 while running casts tech_hydro | player.js technique match: try candidates longest command first; tie-break equal lengths by the most recent first direction (tightest match); keep →→+attack late in a sprint = dash attack. | src/game/player.js | /tmp/claude-0/plan/requests.jsonl#L347, /tmp/claude-0/plan/requests.jsonl#L360, /tmp/claude-0/qa/round_1/logs/run_all/commands.log |
| R1-REQ-162 | S3 | Awakening can be cast while the boss is still in its in-world intro state (boss frozen invulnerable in "intro") | canAwaken/castAwakening: refuse while world.boss && !dead && state === "intro" (castUltimate already does). | src/game/awaken.js | /tmp/claude-0/plan/requests.jsonl#L162 |
| R1-REQ-331 | S3 ✔ | Ultimate final frame: neighbouring damage-number columns and "다운" callouts run together and read as one number; big crits hide behind the HUD name/HP bar | fx.dmg column de-collision (>= one number width between live columns), callouts in their own lane, clamp column tops below the HUD top band. | src/core/particles.js, src/render/hitfx.js | /tmp/claude-0/plan/requests.jsonl#L331, /tmp/claude-0/plan/requests.jsonl#L358, /tmp/claude-0/qa/round_1/shots/feel_ult_final_960.jpg |
| R1-REQ-339E | S3 | awaken_directors_b.js creates canvases during an ult/awakening (x8 on phone1 low) | Allocate once at init/prepareAwakening and reuse. | src/game/awaken_directors_b.js | /tmp/claude-0/plan/requests.jsonl#L339 |
| R1-REQ-340E | S3 ✔ | lighting.js glowSprite creates a canvas on the first light of a colour after stage start | Prewarm glow sprites for the room palette at room load. | src/core/lighting.js | /tmp/claude-0/plan/requests.jsonl#L340, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-REQ-341E | S3 ✔ | props.js:14 builds new gradients every frame (top site in 110 of 122 gradient findings; x588 in 120 frames of the s20 boss); pickups.js:145 (~1-2/frame in s15-s18 rooms) and world.js:497 (1/frame in s10/s17/s20 r1) add to it | Cache per (colour,size) and translate, or bake into a sprite; same for the pickups.js:145 and world.js:497 gradients. | src/game/props.js, src/game/pickups.js, src/game/world.js | /tmp/claude-0/plan/requests.jsonl#L341, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-RUN-BOSSFRAME | S3 ✔ | Part 2 boss arenas: the boss is off screen from the arena entry — Behemoth (s19) and Nihil (s20) are not in the frame in any phase shot, Moloch (s15) only shows a horn/arm at the right edge, Narkissa/Ziz barely; the fight starts facing an empty screen with only the boss bar | Boss-arena camera: frame the boss with the player in wide arenas (bias/zoom-out toward world.boss while the arena is locked, as the tall-room arena bias does), or spawn/park the boss inside the entry view; lead: confirm intended framing | src/core/camera.js | /tmp/claude-0/qa/round_1/logs/visual/bosses_desk.png, /tmp/claude-0/qa/round_1/shots/visual/bosses_rows_mara_behemoth_nihil.jpg, /tmp/claude-0/qa/round_1/shots/integ_boss2_sheet.jpg |
| R1-REQ-323 | S4 | Left-handed touch layout: spawn is shifted at most 6 tiles, hero still stands under the skill/ult buttons in s01 r1 (design call) | Lead/design: larger cap only for the cluster case (stop before triggers/NPCs) or accept the semi-transparent overlap. | src/game/world.js | /tmp/claude-0/plan/requests.jsonl#L323 |
| R1-REQ-333 | S4 ✔ | Math.random in draw paths: particles.js drawDmg(), awaken_directors.js draw() | Precompute jitter at spawn/update or hash (id, t) in draw. | src/core/particles.js, src/game/awaken_directors.js | /tmp/claude-0/plan/requests.jsonl#L333, /tmp/claude-0/qa/round_1/logs/run_all/hook_tags.log, /tmp/claude-0/qa/round_1/logs/tools/hook_tags.json |
| R1-SEED-PLAT | S4 | Moving platforms: platRange/platSpeed are per room only (no per-platform range/speed) | world.js loadRoom M/V markers: accept room.platforms?.[i] or a per-marker override {range, speed}; maps keep the room default. | src/game/world.js | /tmp/claude-0/integration_notes.md |

## FIX-SYSTEMS (3: S1 0, S2 0, S3 3, S4 0)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-338S | S3 | skills.js ultimates add their own full-viewport passes on top of ultfx: grade() layers (skills.js:2402-2407, e.g. :2625), direct fillRect(0, 0, vw, vh) overlays (:2761, :2885) and game.flash() calls — the skills.js half of the full-screen pass budget miss (R1-REQ-338) | Route these tints through the ultfx merged pass (or count them against the tier budget 3/2/1 and drop the decorative ones on medium/low). | src/game/skills.js | /tmp/claude-0/plan/requests.jsonl#L338 |
| R1-REQ-339S | S3 ✔ | skills.js creates 4-8 canvases per ultimate after stage start (skills.js:234 <- :253/:245) | Pool the ult canvases at init (as ultfx/hitfx do). | src/game/skills.js | /tmp/claude-0/plan/requests.jsonl#L339, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-RUN-GRAD-SKILLS | S3 ✔ | Ultimate FX in skills.js build up to 20 new gradients per frame at medium (bran ult skills.js:367 x456/150 frames; azel ult skills.js:321 x216, :3021 x150), budget 10 | Cache those ult gradients per colour/size (or draw them from the ultfx sprite pool); skip decorative ones on low | src/game/skills.js | /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json, /tmp/claude-0/qa/round_1/logs/run_all/perf.log |

## FIX-AI-BOSS (14: S1 0, S2 0, S3 9, S4 5)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-132 | S3 | b_common.arenaOf() wall scan starts at the centre column: inverted arena (w = -48) when the centre is solid (s15 Moloch altar) | Scan inward from world.arena.x0/x1 and treat only contiguous solid columns touching the edge as walls. | src/game/bosses/b_common.js | /tmp/claude-0/plan/requests.jsonl#L132, /tmp/claude-0/plan/requests.jsonl#L147 |
| R1-REQ-143 | S3 | ai_b Zone.update keeps ticking (and striking) while world.freezeEnemies is set during an awakening | Zone.update: `if (world.timeStop > 0 \|\| world.freezeEnemies) return;` (ZoneD already does this). | src/game/ai_b.js | /tmp/claude-0/plan/requests.jsonl#L143 |
| R1-REQ-155 | S3 | harpy "climb" and voider "blink" leave the map in Part 2 rooms (storm_harpy at cy -92 in s17 r5) | Clamp harpy climb to the map top (>= 1 tile) and clamp voider blink x to the map/arena bounds. | src/game/ai_b.js | /tmp/claude-0/plan/requests.jsonl#L155 |
| R1-REQ-158 | S3 | Dracula form 2 screen clamp margin too small (wings off screen) and the clamp drags the boss with the camera | Use viewX(300*scale) in s_d_idle and becomeDemon(); cap the clamp correction speed (~160 px/s). | src/game/bosses/b_dracula.js | /tmp/claude-0/plan/requests.jsonl#L158 |
| R1-REQ-174 | S3 | Dullahan skullOut counter can get stuck (a skull removed without onExpire, e.g. 가웨인 shield breakProj) and he stops throwing skulls | Recount live skull projectiles in the pattern pick instead of trusting skullOut (FIX-COMPANIONS also makes breakProj call expire(), see R1-REQ-173). | src/game/bosses/a_dullahan.js | /tmp/claude-0/plan/requests.jsonl#L174, /tmp/claude-0/plan/requests.jsonl#L173 |
| R1-REQ-332 | S3 ✔ | a_common drawGroundWave()/drawEruption() spawn FX (world.fx.emit) and call Math.random inside projectile render callbacks | Move debris/spark spawns into the projectile update (onTick / per-step timer with world RNG); keep draw pure. | src/game/bosses/a_common.js | /tmp/claude-0/plan/requests.jsonl#L332, /tmp/claude-0/qa/round_1/logs/run_all/hook_tags.log, /tmp/claude-0/qa/round_1/logs/tools/hook_tags.json |
| R1-REQ-340B | S3 ✔ | b_common.js creates a canvas in the first seconds of a boss fight (after the stage-start bakes) | Prewarm the boss-only cache during the boss intro (or at room load). | src/game/bosses/b_common.js | /tmp/claude-0/plan/requests.jsonl#L340, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-REQ-62 | S3 | Dracula transform shortcut in update() ignores world.freezeEnemies (keeps animating/acting during an awakening freeze) | b_dracula.js update(): add `&& !world.freezeEnemies` to the transform shortcut so a frozen Dracula falls through to super.update(). | src/game/bosses/b_dracula.js | /tmp/claude-0/plan/requests.jsonl#L62 |
| R1-RUN-GRAD-BOSS | S3 ✔ | Part 1 boss attack FX in a_common.js create gradients per frame in bursts: :306 (s04/s06/s07 boss, x332 in 120 frames of phone1 s07boss), :502 drawGroundWave (s01/s03/s04/s06 boss, x300 phone2 s03boss), :563/:582 drawEruption (s02/s06 boss, x214 phone2 s02boss), :291 (x183 phone1low s05boss) — these bursts keep the boss-room p95 over budget (s04boss p95 21 at medium, budget 10) after the props.js/background.js baseline is fixed | Cache the telegraph/wave/eruption gradients per (colour, size) and translate/scale them, or bake them into sprites at boss setup; skip the decorative ones on low (same budget as R1-REQ-341E/R, feel §8 16/10/6). | src/game/bosses/a_common.js | /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.md, /tmp/claude-0/qa/round_1/logs/run_all/perf.log |
| R1-REQ-112 | S4 | Painted boss hurtbox sign-offs still pending (lead review of #112/#146) | Lead: compare painted silhouettes vs hurtboxes (tools/painted/poses.mjs --debug) and sign off or adjust. | src/game/bosses/b_common.js | /tmp/claude-0/plan/requests.jsonl#L112, /tmp/claude-0/plan/requests.jsonl#L146 |
| R1-REQ-185 | S4 | fishleap pool scan includes surface cells under a solid ledge: killer_fish leaps through rock | In init(), stop the poolL/poolR scan where the cell above the surface is solid; clamp leaps to open columns. | src/game/ai_b.js | /tmp/claude-0/plan/requests.jsonl#L185 |
| R1-REQ-196 | S4 | c_common screenTint() bakes its edge sprite lazily on first draw (canvas created mid-fight) | Bake edgeSprite when the overlay is created or export prewarmTint(color) for boss setup. | src/game/bosses/c_common.js | /tmp/claude-0/plan/requests.jsonl#L196 |
| R1-REQ-334 | S4 ✔ | a_chimera drawGreenBolt() uses Math.random while rendering | Store bolt jitter on the projectile in update or hash (id, age). | src/game/bosses/a_chimera.js | /tmp/claude-0/plan/requests.jsonl#L334, /tmp/claude-0/qa/round_1/logs/run_all/hook_tags.log, /tmp/claude-0/qa/round_1/logs/tools/hook_tags.json |
| R1-REQ-63 | S4 | telegraphFor() missing for b_chaos / b_dracula wind-ups (optional readability) | Call boss.telegraph / telegraphFor at the start of their big wind-ups like the other bosses. | src/game/bosses/b_chaos.js, src/game/bosses/b_dracula.js | /tmp/claude-0/plan/requests.jsonl#L63 |

## FIX-COMPANIONS (11: S1 0, S2 1, S3 4, S4 6)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-372 | S2 ✔ | Ground melee guardians never hit bosses whose hurtbox floats (s03 mounted Dullahan: gd_knight/gd_spiritwolf 0 hits; s12 Dracula: gd_spiritwolf 0 hits) | kindPounce/kindSlash/kindMelee: aim at the nearest hitParts/hurtboxes box and raise the strike rect to overlap it. | src/game/guardian.js | /tmp/claude-0/plan/requests.jsonl#L372, /tmp/claude-0/qa/round_1/logs/run_all/companions.log |
| R1-REQ-173 | S3 | guardian breakProj() kills enemy projectiles without calling expire()/onExpire (leaves Dullahan skullOut stuck) | Call the projectile's expire()/onExpire instead of setting dead directly. | src/game/guardian.js | /tmp/claude-0/plan/requests.jsonl#L173 |
| R1-REQ-308 | S3 | Painted mount bake (130-310 ms) runs on the first summon: MountRider.attach does not preload the mount | MountRider.attach: MDRAW.preloadMounts?.([this.id]) once. | src/game/mount.js | /tmp/claude-0/plan/requests.jsonl#L308, /tmp/claude-0/plan/requests.jsonl#L313 |
| R1-REQ-367 | S3 ✔ | gd_fairy (아리아) guardian damage share 4.1% / 5.3% below the C10 #10 floor [6%, 30%] | companions.js gd_fairy attack.mv 0.5→0.9, assist.mv 0.8→1.0 (or amend §9 to exempt support guardians). | src/data/companions.js | /tmp/claude-0/plan/requests.jsonl#L367, /tmp/claude-0/qa/round_1/logs/run_all/balance_companions.log, /tmp/claude-0/qa/round_1/logs/run_all/companions.log |
| R1-REQ-368 | S3 ✔ | 모르스 (gd_reaper) automatic execute applies hitstop 0.03 (world freezes 2 frames without a player hit; C10 #4) | reap(): hitstop 0 on the execute attack (keep shake, soul burst, 처형 text). | src/game/guardian_ai_b.js | /tmp/claude-0/plan/requests.jsonl#L368, /tmp/claude-0/qa/round_1/logs/run_all/companions.log |
| R1-REQ-206 | S4 | companion_hud.js header comment still documents o.rect = L.companions (now L.companionsDraw / CMP_INK) | Update the contract comment. | src/render/companion_hud.js | /tmp/claude-0/plan/requests.jsonl#L206 |
| R1-REQ-237 | S4 | Imp meteor / whelp bone-storm projectiles still use built-in renders instead of GR.fxMeteor / fxBone (optional polish) | render: GR.fxMeteor / GR.fxBone like the wolf phantom. | src/game/guardian.js | /tmp/claude-0/plan/requests.jsonl#L237 |
| R1-REQ-238 | S4 | CompanionFigure draws a mount alone without { rider: false }: reins float where a rider hand would be | Pass { rider: false } to both drawMountView calls when no hero is drawn. | src/scenes/companion_join.js | /tmp/claude-0/plan/requests.jsonl#L238 |
| R1-REQ-328 | S4 | 미라 normal shots draw with the generic ice "shard" sprite (no AI projRender hook) | proj runKind: render: g.ai?.projRender ?? s.proj ?? "orb". | src/game/guardian.js | /tmp/claude-0/plan/requests.jsonl#L328 |
| R1-REQ-350 | S4 | Guardian.begin() keeps animT when the anim name repeats: wind-up/strike frames skipped (모모 auto after 협공) | begin(): reset animT when (o.anim ?? name) === this.anim and name !== "assist". | src/game/guardian.js | /tmp/claude-0/plan/requests.jsonl#L350 |
| R1-REQ-369 | S4 | Design note: mt_boar (바르그) jump 700 cannot clear a 3-tile ledge (dismount needed in 38 rooms) | Design call: jump ~800 or airJumps 1, or document the trade-off in companions §3. | src/data/companions.js | /tmp/claude-0/plan/requests.jsonl#L369 |

## FIX-RENDER (11: S1 0, S2 0, S3 7, S4 4)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-133 | S3 | painted kit.quality() and b_bonedragon read settings.quality ("auto") instead of the governed tier: painted art always runs at high on phones | const t = game?.quality ?? game?.tier ?? settings.quality; QUALITY[t] ?? QUALITY.high. | src/render/painted/kit.js, src/render/painted/bosses/b_bonedragon.js | /tmp/claude-0/plan/requests.jsonl#L133 |
| R1-REQ-330R | S3 ✔ | Ultimate cast mid-room (camera x~4500 in s04 r1) renders 7-15x slower than at the stage start: the TileRenderer.draw chunk blits under the ultimate composite passes (bisect: stubbing TileRenderer.draw alone restores 7.6-9.7 ms avg; no chunk re-bakes) — half of the U2 ult frame-cost miss | Compose the visible tile chunks once per frame into a pooled view-sized layer (one blit) or draw them before/outside the ultimate composite/filter state; R1-REQ-330 (FIX-HUD) is the HUD half. | src/render/tiles.js | /tmp/claude-0/plan/requests.jsonl#L330, /tmp/claude-0/qa/round_1/logs/run_all/feel.log |
| R1-REQ-338 | S3 ✔ | Ultimate/awakening full-screen passes over the §5.2 budget (desk p95 7 vs 3; phone1 low p95 5 vs 1) | Merge flash/tint/vignette into one pass per frame; one pass on low tier (the skills.js full-screen fills are R1-REQ-338S, FIX-SYSTEMS). | src/render/ultfx.js | /tmp/claude-0/plan/requests.jsonl#L338, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-REQ-339R | S3 ✔ | hitfx.js / ultfx.js / hero_puppet.js create canvases after stage start (first hit sprite caches, ult pools, puppet caches during an awakening) | Prewarm at stage load (World init already calls prewarmHitFx for part of it). | src/render/hitfx.js, src/render/ultfx.js, src/render/hero_puppet.js | /tmp/claude-0/plan/requests.jsonl#L339, /tmp/claude-0/plan/requests.jsonl#L216, /tmp/claude-0/qa/round_1/logs/run_all/perf.log |
| R1-REQ-340R | S3 ✔ | Painted kit puff sprite, enemy_kit lazy rig bake, painted b_narkissa / b_chaos / b_grimoire caches and tiles.js dark prop caches create canvases in the first seconds of a fight (270 perf findings: tiles 120, kit 95, enemy_kit 41, b_chaos 6, b_narkissa 6, b_grimoire 2) | Prewarm per room on load (boss intro for boss-only caches); bake enemy rigs when the room loads. | src/render/painted/kit.js, src/render/painted/enemy_kit.js, src/render/painted/bosses/b_narkissa.js, src/render/painted/bosses/b_chaos.js, src/render/painted/bosses/b_grimoire.js, src/render/tiles.js | /tmp/claude-0/plan/requests.jsonl#L340, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-REQ-341R | S3 ✔ | Render-side gradients rebuilt every frame: background.js:187 (~3/frame) and :102/:126, hero.js:1631 (~0.5-1/frame in almost every room, :1634 in awakenings) and hero_parts.js (:132 in sera ult/awakening; request #341 also names :186/:54/:104) — hub desk p95 over 16, low tier p95 8-12 vs 6 | Cache per colour/size key and translate, or bake into sprites; skip decorative gradients on low. background.js is the big one; hero.js/hero_parts.js keep the p95 over the low-tier budget (6) once props.js (R1-REQ-341E) and background.js are fixed. | src/render/background.js, src/render/hero.js, src/render/hero_parts.js | /tmp/claude-0/plan/requests.jsonl#L341, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-REQ-54 | S3 | Painted kit.js loadManifest and enemy_kit.js buildRig fetch() directly instead of assets.js (packs, lo/ and the decoded LRU do not apply; R15) | Use assets.json(...) / assets image loaders. | src/render/painted/kit.js, src/render/painted/enemy_kit.js | /tmp/claude-0/plan/requests.jsonl#L54, /tmp/claude-0/plan/requests.jsonl#L226 |
| R1-REQ-216 | S4 | First-hit callout sprites still baked on direct boss-room entry (remainder of #216) | Prewarm common callout sprites with the boss intro. | src/render/hitfx.js | /tmp/claude-0/plan/requests.jsonl#L216 |
| R1-REQ-220 | S4 | Optional: solid ledgesOver() helper in painted kit.js | Optional polish. | src/render/painted/kit.js | /tmp/claude-0/plan/requests.jsonl#L220 |
| R1-REQ-337 | S4 | ultfx.js:1204 consumes Math.random while rendering (144 calls / 150 frames of the kael ult) | Pre-roll values when the effect is created/updated. | src/render/ultfx.js | /tmp/claude-0/plan/requests.jsonl#L337 |
| R1-REQ-71 | S4 | render/enemies.js painted branch should use e.camXf ?? ctx.getTransform() | Read the cached transform first. | src/render/enemies.js | /tmp/claude-0/plan/requests.jsonl#L71 |

## FIX-HUD (2: S1 0, S2 0, S3 1, S4 1)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-330 | S3 ✔ | Ultimate frames cost 2-7x gameplay CPU when cast after a combo (live combo/style HUD) or mid-room (U2; kael_templar over budget every run) | Profile shows restore() inside HUD draws (drawPortrait, drawRankLetter): drop per-element save/clip/restore during ults, cache the combo column as a sprite; the tiles.js chunk-blit half is R1-REQ-330R (FIX-RENDER) — verify together with node tools/feel_test.mjs --only U2 on all six heroes, several runs. | src/render/feel_hud.js, src/render/hud.js | /tmp/claude-0/plan/requests.jsonl#L357, /tmp/claude-0/plan/requests.jsonl#L359, /tmp/claude-0/plan/requests.jsonl#L330 |
| R1-REQ-348 | S4 | feel_hud.js:428 uses rand() while rendering the combo/style column | Store jitter when the value changes. | src/render/feel_hud.js | /tmp/claude-0/plan/requests.jsonl#L348 |

## FIX-DATA (2: S1 0, S2 0, S3 2, S4 0)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-233 | S3 ✔ | Part 2 balance outside world2 §15 targets for all six heroes (player level 7-25 above target s16-s20, hits/taken too low): exp tuning #233-#235 not applied | Apply #233 + #234 as amended by request line 325 (hp/atk per enemy) and #235 (b_chaos exp 5000→2500); lead decision line 346: keep calibrated --check. | src/data/enemies_c.js, src/data/enemies_d.js, src/data/bosses_c.js, src/data/bosses_d.js, src/data/bosses_b.js | /tmp/claude-0/plan/requests.jsonl#L233, /tmp/claude-0/plan/requests.jsonl#L234, /tmp/claude-0/plan/requests.jsonl#L235 |
| R1-REQ-349 | S3 | bran_bloodrage draws Bran's blue cape over its demon wings; lia_reaper long gold scarf trails through the bone wings | classes.js: bran_bloodrage look.cape = null; lia_reaper look.scarf = { color: "#e8c872", long: false }. | src/data/classes.js | /tmp/claude-0/plan/requests.jsonl#L349 |

## FIX-SCENES-A (3: S1 0, S2 0, S3 2, S4 1)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-215 | S3 | ArcadeRunScene.autoPause drops the pause request while an ult/awakening cutscene runs (StageScene defers it) | Remember the request (_pauseWanted) and push arcadePause on the first update where canPause() holds. | src/scenes/front/arcade_run.js | /tmp/claude-0/plan/requests.jsonl#L215 |
| R1-REQ-339A | S3 ✔ | overlays.js (ult cut-in) and awaken_cutin.js create canvases after stage start | Allocate the cut-in canvases once (prepareCutin / scene init) and reuse. | src/scenes/overlays.js, src/scenes/awaken_cutin.js | /tmp/claude-0/plan/requests.jsonl#L339, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-REQ-335 | S4 ✔ | awaken_cutin.js drawBand()/drawTitle() call rand() per rendered frame | Seed jitter once per cut-in or per update step. | src/scenes/awaken_cutin.js | /tmp/claude-0/plan/requests.jsonl#L335, /tmp/claude-0/qa/round_1/logs/run_all/hook_tags.log, /tmp/claude-0/qa/round_1/logs/tools/hook_tags.json |

## FIX-SCENES-B (6: S1 0, S2 0, S3 3, S4 3)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-339B | S3 ✔ | menu/common.js Layer creates canvases after stage start (hub/menu layer) | Pool the Layer canvases at scene init. | src/scenes/menu/common.js | /tmp/claude-0/plan/requests.jsonl#L339, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-REQ-341B | S3 | menu/common.js:797 and town/facades.js:1001 build gradients per frame (hub desk 34/frame) | Cache per colour/size or bake into the layer. | src/scenes/menu/common.js, src/scenes/town/facades.js | /tmp/claude-0/plan/requests.jsonl#L341 |
| R1-REQ-342 | S3 ✔ | phone1 menu equip tab: 26.7 MB live canvases (budget 20 MB); phone1 low decoded painted textures 24.1 MB (budget 24 MB) | Release/shrink menu Layer, turntable and hero caches to the tier backing size. | src/scenes/menu/common.js | /tmp/claude-0/plan/requests.jsonl#L342, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-REQ-176 | S4 | Town ServiceScene has no toastW getter: service-scene toasts are not confined to the panel | ServiceScene: get toastW() { return this.layout().pw - 16; } | src/scenes/town/common.js | /tmp/claude-0/plan/requests.jsonl#L176 |
| R1-REQ-212 | S4 | tab_equip hint text clipped on both sides at the 720x405 minimum UI layout | maxWidth: RW - 24 or wrap. | src/scenes/menu/tab_equip.js | /tmp/claude-0/plan/requests.jsonl#L212 |
| R1-REQ-336 | S4 ✔ | Math.random in render paths: games/common.js render(), town/smith.js renderOver() | Move sparkle/ember randomness into update(). | src/scenes/games/common.js, src/scenes/town/smith.js | /tmp/claude-0/plan/requests.jsonl#L336, /tmp/claude-0/qa/round_1/logs/run_all/hook_tags.log, /tmp/claude-0/qa/round_1/logs/tools/hook_tags.json |

## FIX-PLATFORM (5: S1 0, S2 0, S3 4, S4 1)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-229 | S3 ✔ | Load budget missed (P-09): dist/web slow 4G first frame 11.8 s (budget 9 s), fast 4G 2.7 s (budget 2.5 s), 1.94 MB on the critical path (budget 1.6 MB): every module is statically imported from main.js | Dynamic import() for per-stage content (boss logic + vector draw, vector enemy renderers, awaken directors) so the bundler emits lazy chunks; cross-bucket follow-ups in bosses/index.js (FIX-AI-BOSS), render/enemies.js (FIX-RENDER), awaken.js (FIX-ENGINE); FIX-DELIVERY re-measures with platform_load --dist. | src/main.js | /tmp/claude-0/plan/requests.jsonl#L229, /tmp/claude-0/qa/round_1/delivery2/load_dist.log, /tmp/claude-0/qa/round_1/logs/platform/platform_load_dist.json |
| R1-REQ-329 | S3 ✔ | window.__feelStats (feel §8 instrumentation, ?debug / ?feelstats) is not published: feel_test I1 fails | game.js: publish {particles, dmgNums, ghosts, gradients, heroDraws, sfxStarts} once per rendered frame when the flag is set (counters in particles.js, hitfx.js, hero.js, audio.js). | src/core/game.js | /tmp/claude-0/plan/requests.jsonl#L329, /tmp/claude-0/qa/round_1/logs/run_all/feel.log |
| R1-REQ-339P | S3 ✔ | prompts.js glyph cache (and a ui.js cache) create canvases on the first prompt after stage start | Prewarm the glyph cache for the active device at scene enter. | src/core/prompts.js, src/core/ui.js | /tmp/claude-0/plan/requests.jsonl#L339, /tmp/claude-0/qa/round_1/logs/run_all/perf.log, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json |
| R1-RUN-TEX-TOUCH | S3 ✔ | Painted texture budget exceeded on touch profiles: phone1/phone2/phone1low 24.7 MB decoded painted (budget 24 MB) during every ult/awakening, hub and menu scene; tablet up to 61.4 MB (menu) | assets.js decoded LRU: enforce the painted budget of the tier (evict non-resident painted atlases before ult/awakening bakes); lead: confirm tablet uses the 24 MB touch budget (§5.2 names phone1/phone2 24 MB, desktop 64 MB) | src/core/assets.js | /tmp/claude-0/qa/round_1/logs/tools/perf_budget.json, /tmp/claude-0/qa/round_1/logs/tools/perf_budget.md, /tmp/claude-0/qa/round_1/logs/run_all/perf.log |
| R1-REQ-92 | S4 | Optional touch technique radial (platform §5.5): needs input.queueCommand + a radial module | Lead decision; optional. | src/core/input.js | /tmp/claude-0/plan/requests.jsonl#L92 |

## FIX-ACCOUNTS (2: S1 0, S2 0, S3 0, S4 2)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-227 | S4 | docs/ACCOUNTS.md: dist/web publishing, CSP script-src 'self', deploy flow and the APK /api proxy details are not documented | Update §1 (APK proxy, stash expiry, encoded-path rejection), §5, §7. | docs/ACCOUNTS.md | /tmp/claude-0/plan/requests.jsonl#L227, /tmp/claude-0/plan/requests.jsonl#L318, /tmp/claude-0/plan/requests.jsonl#L326 |
| R1-REQ-317 | S4 | cloud.js: use same-origin "/api" when window.__BN_APP?.apiProxy (drop dependence on the hard-coded site name in the app) | Optional cleanup; keep APP_API_BASE as fallback. | src/core/cloud.js | /tmp/claude-0/plan/requests.jsonl#L317 |

## FIX-TOOLS (6: S1 0, S2 0, S3 1, S4 5)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-344 | S3 ✔ | test_settings_v2 6c uses portraits/lia as the "no lo/ variant" key but assets/lo/portraits/lia.webp now exists (424 pass / 1 fail) | Pick a key that can never exist under assets/lo/ (e.g. from assets/lo/index.json missing list at runtime). | tools/test_settings_v2.mjs | /tmp/claude-0/plan/requests.jsonl#L344, /tmp/claude-0/qa/round_1/logs/run_all/settings_v2.log |
| R1-REQ-1 | S4 | gallery_audio.html uses a hard-coded 73-name SFX list (feel and companion sounds missing) | Build SFX_NAMES from Object.keys(SFX). | tools/gallery_audio.html | /tmp/claude-0/plan/requests.jsonl#L1 |
| R1-REQ-161 | S4 | validate_maps reachability ignores jump-arc headroom (suggestion) | Model ceiling headroom in the BFS jump. | tools/validate_maps.mjs | /tmp/claude-0/plan/requests.jsonl#L161, /tmp/claude-0/plan/requests.jsonl#L181 |
| R1-REQ-170 | S4 | test_guardians B cases (mirra_reflect, momo_eat) watch only the newest projectile | Clear older test projectiles or track the nearest one. | tools/test_guardians.mjs | /tmp/claude-0/plan/requests.jsonl#L170 |
| R1-REQ-311T | S4 | tools/gallery_enemies_b.html (the §5.1 smoke page for Part 1 enemy art) draws only the vector RENDER_B, so the gallery smoke never exercises painted enemy art | Add a painted mode (or cases) that draws through render/enemies.js painted branch, like gallery_enemies_c/d. | tools/gallery_enemies_b.html | /tmp/claude-0/plan/requests.jsonl#L311 |
| R1-REQ-371T | S4 | turntable.mjs stick check covers only the status tab | Extend the right-stick check to the equip and class tabs. | tools/qa/turntable.mjs | /tmp/claude-0/plan/requests.jsonl#L371 |

## FIX-ASSETS (3: S1 0, S2 0, S3 0, S4 3)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-309 | S4 | deathcheck.mjs crashes in its final alpha probe when the bat rig is not preloaded; ingame.mjs only honours attack/slam/fling pose specs | Guard/preload the bat rig; generalise pose-spec handling (cast@0.5, pray@0.6). | tools/painted/enemies/deathcheck.mjs, tools/painted/enemies/ingame.mjs | /tmp/claude-0/plan/requests.jsonl#L309, /tmp/claude-0/plan/requests.jsonl#L310 |
| R1-REQ-311 | S4 | Painted enemy gallery (tools/painted/enemies/gallery.js) lacks CASES for the ART-ENEMY-3/4/5 enemies (they fall back to skeleton cases) | Add painted CASES for the s07-s13 enemies. | tools/painted/enemies/gallery.js | /tmp/claude-0/plan/requests.jsonl#L311 |
| R1-REQ-98 | S4 | Painted QA tools: fight.mjs/bench.mjs throw for bosses without b.main (BossB/BossC), rng.mjs state normalisation, deathcheck hard-coded bat/skeleton | b.main?.hole ?? {}, b.main?.hx ?? b.bx ?? b.cx, skip mid-fight dialogues, invulnerable player; rng.mjs normalise world.time/camera/bg timers/boss rest state. | tools/painted/fight.mjs, tools/painted/bench.mjs, tools/painted/rng.mjs, tools/painted/enemies/deathcheck.mjs | /tmp/claude-0/plan/requests.jsonl#L98, /tmp/claude-0/plan/requests.jsonl#L99, /tmp/claude-0/plan/requests.jsonl#L115 |

## FIX-DELIVERY (3: S1 0, S2 1, S3 1, S4 1)

| id | sev | defect | fix hint | files | evidence |
|---|---|---|---|---|---|
| R1-REQ-343 | S2 ✔ | Font subsets miss 52 glyphs used in the game (Noto Sans KR/Hahmlet: 宮狩血銃鐵鴉 + 46 Hangul; BN Brush 46; BN Seal 宮): those characters render in a fallback font | Re-run python3 tools/fonts/build_fonts.py after the text freeze (first-screen fonts <= 500 KB; now 456.8 KB). | tools/fonts/build_fonts.py, assets/fonts/noto-sans-kr.woff2 | /tmp/claude-0/plan/requests.jsonl#L343, /tmp/claude-0/plan/requests.jsonl#L93, /tmp/claude-0/qa/round_1/logs/run_all/fonts.log |
| R1-REQ-324 | S3 | Second build_web (to publish the new APK in downloads/) restamps build-info/build.json/index.html so verify_apk hash parity fails against the published dist/web | Exclude downloads/ from buildHash and keep the stamp when nothing else changed (or --refresh-downloads mode). | tools/deploy/build_web.mjs | /tmp/claude-0/plan/requests.jsonl#L324 |
| R1-REQ-345 | S4 | §5.1 delivery row runs `serve_dist.mjs --check-load --offline`, which serve_dist does not implement | Add the two flags to serve_dist.mjs (delegating to platform_load --dist / test_sw) or have the lead update the MASTER_PLAN §5.1 row. | tools/deploy/serve_dist.mjs | /tmp/claude-0/plan/requests.jsonl#L345, /tmp/claude-0/plan/requests.jsonl#L356 |

✔ = reproduced by a suite in this round (the others come from open requests / review and were not re-measured by a red suite).

## Closed seeds (integration notes, verified this round)

- R1-SEED-S03R2 s03 r2 black screen when loaded directly: fixed — index.html?scene=stage&stage=s03&room=r2 renders the room (mean luma 47, 4% near-black, player at spawn, 0 errors) like r1/r3
- R1-SEED-S08FISH merman/killer_fish placement on ~ tiles in s08: fixed — every merman/killer_fish marker in s08 sits on the cell above water (r3 x100/x118: above an F crumble row over the pool; liquidTop() scans through it); verify pass (stepped, player parked 5 tiles away, 20 frames): all 17 fish in r1-r5 activate in lurk/under/ripple with liquid (T.LIQUID) at their feet, 0 errors. Note: tx/ty/inLiquid in the first seeds.json were computed with a 32 px tile (TILE is 48) and are not meaningful
- R1-SEED-SMITHREG smith/shop registration in reg_town: fixed — game.register("shop", ShopScene) and ("smith", SmithScene) present; integration hub case exercises the town
- R1-SEED-DRACULA2 Dracula phase-2 script b_dracula_transform: fixed — b_dracula plays b_dracula_transform in story mode once (seenScripts guard); the script exists
- R1-SEED-GRIMOIRE b_grimoire title in data/bosses_a.js: fixed — title: '금단의 살아 있는 마도서'
- R1-SEED-MBONE items m_bone icon: fixed — m_bone uses icon 'bone' and icons.js draws it
- R1-SEED-HIDDEN hidden rooms visible from outside: fixed — secret pockets are filled with fake wall and liquid/spike/platform clusters inside them are baked as wall until revealed; entities inside unrevealed pockets are hidden

## Closed / routed-done request lines

- #86, #193, #228: RESOLVED by APK-FU (lines 314-316)
- #96, #111, #113, #123, #127, #128, #157, #172, #192, #207, #210, #219, #319, #327: RESOLVED by DOCS-ARCH (lines 351-355)
- #70, #145, #159, #222, #224, #225: RESOLVED by ART-HERO-B (lines 361-366, 370); #225 classes.js half stays open as line 349
- #82, #88, #110, #129, #230, #59: handled by QA-TOOLS in W3 (its request pass #59,#82,#88,#110,#129,#230)
- #320: lead added art-boss-8 to src/render/painted/reg/index.js (verified r23 import)
- #154: fixed: b_dracula.js s_transform re-asserts world.cutscene every frame (line 329)
- #211: fixed: AI_D.husk.init sets e.cool (ai_d.js:744)
- #202: fixed: _biped.js claimDebris uses an age window since death
- #186, #187, #208: verified this round: platform_menu taps audit green for every MENU_TABS tab at phone1/phone2 (incl. status/class turntable button), /tmp/claude-0/qa/round_1/logs/run_all/platform.log
- #371: not reproduced this round: real flow (pad SELECT opens the menu, LB/RB change tabs, stepped) — right stick X=1 for 0.5 s rotates -1.6 rad in the status, equip and class tabs (/tmp/claude-0/qa/round_1/stick371.json, stick371b.json); the turntable.mjs coverage gap stays open as R1-REQ-371T
- #195, #217: verified this round: platform perf.equip.fhd2x [P-11] menu equip at fhd2x high = CPU 10.0 ms/frame (budget 20 ms; was 172), /tmp/claude-0/qa/round_1/logs/run_all/platform.log
- #177: fixed: portraitShake decays in town/common.js:579 and stable.js:304
