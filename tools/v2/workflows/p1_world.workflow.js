export const meta = {
  name: 'v2-p1-world',
  description: 'P1 world: area format, 3D props replacing flat cards, richer wall/floor textures, first real areas (Eshville tonight + 1697, Misty Graveyard) on the environment kit, then adversarial verify',
  phases: [
    { title: 'Build', detail: 'WORLD lane: area format, props, textures, areas' },
    { title: 'Verify', detail: 'adversarial check, play-through, owner sheet' },
  ],
}

const COMMON = `
You are one lane of a multi-lane build of the 3D edition of a Korean action game (HTML5 Canvas + WebGL, ES modules, no bundler in dev). Repo: /home/user/game. Work directly in that tree (other lanes work there at the same time: ENGINE in src/v2/game/, PLAY in src/v2/play/, UI in src/v2/ui/ — do not edit those).

READ FIRST (short): docs/v2/P1_CONTRACT.md (lane boundaries and rules — binding), docs/v2/README.md §2 (owner decisions), docs/v2/GDD.md §3 (world map), §9.1 (the first two hours minute by minute) and §9.2 (scope), docs/v2/ENV_KIT.md (the environment kit you are extending: src/v2/env/ geo.js, kit.js, props.js, mats.js, build.js, stage_slice0_env.js; viewer tools/v2/env_view.html; check tools/v2/envkit_check.mjs), docs/v2/proto_b.md §3–4 (the stage format and collision the kit compiles to), docs/v2/ENGINE_API.md (how the game scene intends to load an area).

The owner (non-developer, plays on a Galaxy Z Fold unfolded, touch) said, in Korean:
- "배경, 캐릭터, 인터페이스 모두 3d 게임에 어울리게, 이질감 없게, 그리고 디테일이 있도록"
- "적과 모든 것들을 3d로 바꿔주고 배경도 좀 더 디테일하게 표현해줘. 사물이나 벽면 등도"
- the feel wanted for characters and gear is that of a big-budget hunting action game: semi-realistic, crafted, not cel-anime; the world must match the 3D characters (see docs/v2/img/ce_*.webp and cast_*.webp for the models that will walk in it).
- Smoothness on the Fold matters more than any extra detail.
What the last review said is still cheap in the decorated test route (docs/v2/ENV_KIT.md §10): two angel statues and two gargoyles are flat cards; cobbles and stone read as a repeating pattern; the yard floor shows ruler-straight dirt rectangles; thin railings and window bars are jagged; procedural textures are plainer than painted ones.

Hard rules (contract §4): no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched; one headless browser at a time (4 cores, software-rendered WebGL — frame times there say nothing about the device). Never run tools/fonts/build_fonts.py without --check; every Korean string you add under src/ (comments included) must pass python3 tools/fonts/build_fonts.py --check (it passes cleanly now — add no failing glyph; area and place names shown to the player must use glyphs the fonts already have, list any name you had to change). Scripts that import playwright-core must live under /home/user/game/tools/ (see tools/v2/envkit_check.mjs for launch args, tools/serve.mjs, tools/qa/lib/viewports.mjs presets fold_open and phone2).
Paid generation (Higgsfield MCP tools, find with ToolSearch): images with model gpt_image_2_5 only, 3D with generate_3d (recipe and costs in docs/v2/CHAR3D_PILOT.md §9 and docs/v2/CAST_R1_ENEMIES.md — props were made there as separate static models with tools/v2/castenemy_prop_pack.mjs). Never name any game, studio, brand or artist in a prompt. Record every job in tools/higgsfield/manifest_world.json and stay under the credit cap given below. If a paid call is refused by the permission system, do NOT retry or work around it: write the exact calls to /tmp/claude-0/v2/world/gen_requests.json, continue with procedural stand-ins, and say so at the top of your report.
Keep a progress log (path below), one line per step with UTC time (date -u). Your run may be cut off at any moment: never leave a file half-edited between steps; work in small working increments.
Final answer = your report (plain text, English, short Korean summary for the owner at the end): what you built, check results exactly as they came out, known problems, what the next lane must know, files changed, credits used.
`

const WORLD = COMMON + `
YOUR LANE: WORLD. You own src/v2/world/, src/v2/env/, assets/v2/env/, assets/v2/props/, tools/v2/world_*.{mjs,html,py} (and the existing env* tools), docs/v2/AREA_FORMAT.md, docs/v2/ENV_KIT.md. Progress log: /tmp/claude-0/v2/world_progress.md. Credit cap: 260. Time box: 120 minutes from start (stop adding content 20 minutes before the end).
Scenes v2c (src/v2/env/index.js, the decorated test route) and v2bench depend on the kit: they must keep working (node tools/v2/envkit_check.mjs --base 1, node tools/v2/p0_entry_check.mjs).

Deliver, in priority order:
1. docs/v2/AREA_FORMAT.md, first version within 20 minutes (the ENGINE lane is waiting for it): one area = the kit stage format (as in src/v2/env/stage_slice0_env.js) + id, name (Korean), era ('now' = tonight 1797 | 'past' = that night 1697), twin (id of the same place in the other era), spawns (named entry points with facing), exits (boxes leading to another area + spawn name), actors (people: model id from assets/v2/char3d, position, facing, talk key), enemies (kind + position + group), triggers (boxes that raise a named event once), interact (bell, door, sign, chest, lever, grave to carve — id, position, radius, kind), camera rigs per section, room tag for sound (street | alley | courtyard | hall | crypt …), music id. src/v2/world/index.js exports AREAS (id → async loader returning the area object) and validateArea(area) (reachability of spawns/exits/actors/interact from the default spawn using the kit's own collision, no actor inside a wall, names present, twins consistent). Keep kinds 'melee' and 'ranged' valid and add the six real kinds (skeleton_soldier, skeleton_mage, plague_corpse, grave_ghost, gravekeeper_armor, bat).
2. Nothing flat: real 3D props wherever the kit still uses picture cards, and richer set dressing. Make a prop pipeline that keeps draw calls low: a bake tool (tools/v2/world_props_bake.mjs) that reads static prop models and writes one compact geometry pack + ONE shared texture atlas (assets/v2/props/), and a runtime piece in src/v2/env/ that instantiates baked props into the kit's chunk meshes (so a prop costs triangles, not a draw call) with collision footprints and optional light. Props to make first (generate a clean design image, then the 3D model, decimate/pack small: each prop roughly 300–1,500 triangles in game, whole atlas ≤ 2048², whole pack ≤ 1.5 MB): weeping angel statue, gargoyle, large church bell with yoke, well, market cart, tombstones (4 shapes), stone cross, mausoleum front, iron cemetery gate, dead tree, hanging lantern post, brazier, coffin, bone niche wall piece, barrel/crate set, fountain or plague post for the square. Look at each model from several sides before keeping it; reject melted or blobby ones.
3. Better surfaces: replace the plainest procedural textures with painted-looking tiling ones (generate seamless squares, check the tiling yourself by repeating 3×3, convert to WebP ≤ 160 KB each): ashlar wall, rough rubble wall, plaster with timber, cobbles (two variants + worn centre), flagstones, grave soil with dead grass, wet cellar stone, slate and thatch roofs, old planks. Break repetition in code (per-tile variation, decals: moss, cracks, puddles, scorch marks, fallen leaves, straw) instead of bigger textures. Fix the jagged railings/bars (thicker geometry or alpha-to-coverage — whatever is cheap) and the ruler-straight dirt patches.
4. Areas authored with the kit in the new format, each validated and captured: (a) eshville_now — tonight under the red moon: burning outskirts → main street → square with the well → church front with the bell tower door (GDD §9.1 minutes 0–15; enemy and people placements as that table says; fires as lights + effect anchors, not baked brightness); (b) eshville_past — the same streets on the 1697 night: candle-lit, harvest stalls, plague flags, different dressing and lighting from the SAME layout (the two eras must read as the same place at a glance and differ at a second glance); (c) if time remains, graveyard_now — the misty graveyard road and gate (minutes 36–58). Keep each area's static world within about 35,000 triangles in any one view and about +8 MB of GPU texture over the test route; report numbers per area.
5. A way to walk your areas today without touching other lanes: let scene v2c take ?area=<id> (it is your scene: src/v2/env/index.js) so the existing prototype rules can walk it, and extend your viewer/check tools: a bot must be able to walk from the default spawn through every exit box on fold_open and phone2 with 0 page errors. Capture sheets to /tmp/claude-0/v2/world/.
6. Update docs/v2/ENV_KIT.md (new pieces, prop pipeline, numbers). List every assets/v2/ file the areas load at runtime (the release build ships only files listed in tools/deploy/v2_ship.txt, edited by the main session).
Look at your captures as the owner would, next to the character sheets: does the world match the characters in finish and detail? Is anything still a flat card, a bare box, a repeating pattern? Fix what you see before adding more.
`

phase('Build')
const built = await agent(WORLD, { label: 'WORLD', phase: 'Build' })

phase('Verify')
const VERIFY = COMMON + `
YOUR LANE: WORLD-VERIFY — adversarially verify the world lane's work. You may edit src/v2/world/, src/v2/env/, assets/v2/env/, assets/v2/props/, tools/v2/world_* and env* tools, docs/v2/AREA_FORMAT.md, docs/v2/ENV_KIT.md to fix what you find (small, safe fixes; anything large goes in the report). No paid generation. Progress log: /tmp/claude-0/v2/worldverify_progress.md. Time box: 50 minutes.

The WORLD lane's report (null means the lane died — read /tmp/claude-0/v2/world_progress.md and the tree instead):
${String(built).slice(0, 16000)}

Do not trust the report. Do:
1. Run validateArea on every area and the lane's checks; run node tools/v2/envkit_check.mjs --base 1, node tools/v2/p0_entry_check.mjs, node tools/v2/proto_b_check.mjs, python3 tools/fonts/build_fonts.py --check. Report exact results.
2. Walk every area yourself with real touch input in headless Chromium at fold_open and phone2 (index.html?scene=v2c&area=<id>): every spawn, every exit, along every wall; look for holes in collision, places where the hero is hidden behind props or roofs (cast rays from the camera to the hero as the kit review did — see docs/v2/ENV_KIT.md §10), props floating or sunk, lights under the floor, z-fighting, seams, texture stretching, tiling that reads as a pattern, anything still flat. Capture and LOOK.
3. Compare the two eras of the same place side by side: same layout? clearly different mood? Is the 1697 night readable (not just darker)?
4. Measure per area: static triangles, triangles in view (worst spot), draw calls, GPU texture MB, vertex buffer KB, load time; compare with the test route numbers in docs/v2/ENV_KIT.md. Check GL resources are freed on exit (enter/leave five times).
5. Check the prop pack: file sizes, atlas use, per-prop triangle counts, that the bake tool reproduces the pack from its inputs, that credits in tools/higgsfield/manifest_world.json match the account transactions if you can read them.
6. Check AREA_FORMAT.md against docs/v2/ENGINE_API.md: list every mismatch the ENGINE lane must know about (write them to /tmp/claude-0/v2/requests.md as a dated section).
7. Build check: TMPDIR=/dev/shm node tools/deploy/build_web.mjs --out /dev/shm/worldverify_build (do not touch dist/); list which assets/v2 paths the areas need that are missing from tools/deploy/v2_ship.txt (do not edit that file); report the site size and APK estimate lines; delete /dev/shm/worldverify_build.
8. Owner sheet /tmp/claude-0/v2/owner_world.png (about 2000 px wide, Korean captions, honest): each area at 3–4 spots at Fold size with the 3D hero in frame, tonight vs 1697 pairs of the same spot, a row of the new 3D props close up, and one before/after of the test route's weak spots (statues, floor, railings). One line on what is still weak.
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL) with reasons, defects fixed, defects left, numbers, v2_ship.txt additions, credits, and a 3–4 sentence Korean summary for the owner.
`
const verdict = await agent(VERIFY, { label: 'WORLD-VERIFY', phase: 'Verify' })
return { world: built, verdict }
