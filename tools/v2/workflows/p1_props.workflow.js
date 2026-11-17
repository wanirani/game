export const meta = {
  name: 'v2-p1-props',
  description: 'P1 world art: bake the 19 generated 3D props and 12 painted textures into the areas (replacing code-sculpted stand-ins), then adversarial verify',
  phases: [
    { title: 'Build', detail: 'PROPS lane: bake models, textures, place in areas' },
    { title: 'Verify', detail: 'adversarial check, numbers, owner sheet' },
  ],
}

const COMMON = `
You are one lane of a multi-lane build of the 3D edition of a Korean action game (HTML5 Canvas + WebGL, ES modules, no bundler in dev). Repo: /home/user/game. Work directly in that tree. Other lanes work there at the same time and run headless browser checks on the scenes while you work: ENGINE and its verifier in src/v2/game/ (scene v2g, which draws the env kit and the prop pack), a STORY lane in tools/v2/story_stage/. Do not edit src/v2/game/, src/v2/play/, src/v2/ui/, src/v2/char3d/, src/v2/fx/, src/v2/feel/, src/v2/b/.

READ FIRST (short): docs/v2/P1_CONTRACT.md (lane boundaries and rules — binding), docs/v2/ENV_KIT.md §11–§15 (prop pipeline, props, surfaces, areas, numbers, the last review), docs/v2/AREA_FORMAT.md, the header of tools/v2/world_props_bake.mjs and tools/v2/world_tex.py, src/v2/env/baked.js and props2.js. Background on what the owner wants: docs/v2/README.md §2.

The owner (non-developer, plays on a Galaxy Z Fold unfolded, touch) said, in Korean:
- "배경, 캐릭터, 인터페이스 모두 3d 게임에 어울리게, 이질감 없게, 그리고 디테일이 있도록"
- "적과 모든 것들을 3d로 바꿔주고 배경도 좀 더 디테일하게 표현해줘. 사물이나 벽면 등도"
- Smoothness on the Fold matters more than any extra detail.
The last world review said what is still cheap: the code-sculpted statues, gargoyles and dead trees are soft and blurry near the camera; flames are three-colour cones; the rubble wall pattern is large and repeats; k_ashlar, k_plaster, k_slate, k_flag are still plain procedural textures.

WHAT IS NEW: the paid generation the world lane could not run has now been run by the main session. Files (NOT in the repo, do not delete): /tmp/claude-0/v2/world/raw/
- 19 generated prop models <id>.glb (each one mesh, 900–1,500 triangles, one JPEG texture, unit-sized, centred, y up) and their design pictures <id>.png: angel, gargoyle, bell, well, cart, tombs4 (four gravestones in one model — split it into four separate props), cross, mausoleum, gate, deadtree, lanternpost, brazier, coffin, niche, goods, plaguepost, stall, wreck, fountain. Contact sheets of the designs: _props_a.jpg, _props_b.jpg.
- 12 generated surface squares k_ashlar, k_rubble, k_plaster, k_cobble, k_cobble2, k_cobworn, k_flag, k_soil, k_cellar, k_slate, k_thatch, k_planks (.png, 1024 px, not guaranteed seamless). Contact sheet: _tex.jpg.
The models' fronts do not all face the same way (several have their long side on the z axis) — look before placing. The bake tool's GLB path (--glb <dir>, optional <id>.json side files with h, rotY, foot, footH, light) was written but never run on a real generated model: expect to fix it.
No more paid generation in this lane (0 credits). tools/higgsfield/manifest_world.json already records the jobs — do not edit the credits.

Hard rules (contract §4): no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit every few minutes — whatever is in the tree gets committed, so never leave it broken). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched; one headless browser at a time (4 cores shared with other lanes, software-rendered WebGL — frame times there say nothing about the device). Never run tools/fonts/build_fonts.py without --check; every Korean string you add under src/ must pass python3 tools/fonts/build_fonts.py --check (if it fails on a glyph that is not yours, say so and move on). Scripts that import playwright-core must live under /home/user/game/tools/.
Because other lanes load assets/v2/props/ and assets/v2/env/ while you work: build new packs and textures in a scratch folder first (--out /tmp/claude-0/v2/props/...), test there, and replace the shipped files only with a complete, working set (write to a temp name, then rename).
Keep a progress log (path below), one line per step with UTC time (date -u). Your run may be cut off at any moment: work in small working increments and never leave a file half-edited between steps.
Final answer = your report (plain text, English, short Korean summary for the owner at the end): what you built, check results exactly as they came out, known problems, what the next lane must know, files changed.
`

const PROPS = COMMON + `
YOUR LANE: PROPS. You own src/v2/world/, src/v2/env/, assets/v2/env/, assets/v2/props/, tools/v2/world_*.{mjs,html,py} and the env* tools, docs/v2/AREA_FORMAT.md, docs/v2/ENV_KIT.md. Progress log: /tmp/claude-0/v2/props_progress.md. Scratch and captures: /tmp/claude-0/v2/props/. Time box: 110 minutes from start (stop adding 20 minutes before the end and finish the checks).

Deliver, in priority order:
1. Generated models into the prop pack. For each model: render it from four sides plus the game camera angle (a small node or browser tool — write it once), decide front, height in world units (use the heights in the bake tool's GLB_META as a start and compare against the 3D hero, about 175 units tall), ground contact (lowest point on the floor, nothing sunk or floating), collision footprint, light (lantern, brazier, wreck embers). Split tombs4 into four props by connected parts. Things that must stay bright at night (lantern glass, brazier coals and flames, embers, the candle ledge of the niche) must not be darkened by the baked vertex light — add an emissive mask or a per-prop flag if the pack has none. Reject a model only if it is melted or wrong from the back; then keep the code-built version for that prop and say so.
2. Texture sharpness and budget. The last review measured the sculpted statues at an atlas cell of 224x400 stretched to about 400x900 screen pixels on the Fold — blurry. Give each prop atlas space in proportion to how large it appears on screen at its nearest normal camera distance; the whole atlas at most 2048x2048 (say what it costs on the GPU with mipmaps, and try 2048x1024 first), the pack file at most 1.5 MB, WebP atlas at most about 900 KB. Report triangles per prop and in total.
3. Put them in the areas (eshville_now, eshville_past, graveyard_now, graveyard_past, slice0): replace the code-sculpted angel, gargoyle and dead tree, and replace the code-built props of src/v2/env/props2.js (bell, graves, cross, mausoleum front, cemetery gate, lantern post, coffin, niche wall, plague post, burnt wreck, well, cart, brazier, barrel and crate set, stall, fountain) wherever the generated model looks better at game distance. Judge each from a side-by-side capture at Fold size next to the 3D hero; keep the code-built one where it is cleaner (thin iron bars are a likely case) or where gameplay needs its exact shape (walk-through gate opening, the well as a landmark). Keep collision and the hidden-hero numbers no worse than now (tools/v2/world_verify_node.mjs reports hidden cells per area — do not put taller things between camera and play space).
4. Painted surfaces. For each generated square: make it tile (python3 tools/v2/world_tex.py --from <png> --name <k_xxx> — check and improve its seam handling; look at a 3x3 repeat and at the wall or floor in game), 512 px, WebP at most 160 KB. Match brightness and colour to the night scenes so that walls do not glow (the plaster and ashlar squares are pale) and the two eras keep their moods. Use the right world scale (stones and planks must be believable next to the hero). Replace a current texture only when the new one is clearly better in game; the rubble wall and the four plain procedural ones are the ones the review named.
5. Fires: replace the three-colour cone flames with something that reads as fire without per-frame cost in the static mesh (layered emissive leaf shapes with baked gradient, plus embers on the ground), and keep fire positions exported as area.anchors so the game scene can add real particles later. Do not build a particle system here.
6. Checks on the final tree, all must pass: node tools/v2/world_validate.mjs, node tools/v2/world_check.mjs, node tools/v2/world_verify_node.mjs, node tools/v2/world_verify_shot.mjs, node tools/v2/envkit_check.mjs --base 1, node tools/v2/p0_entry_check.mjs, python3 tools/fonts/build_fonts.py --check. The bake must reproduce the shipped pack byte for byte from sources kept in the repo: store compact sources under tools/v2/world_src/ (models with textures downscaled to what the bake actually uses, at most about 5 MB in total; the 1024 px texture PNGs as WebP at most 2.5 MB in total) and make the bake read from there by default.
7. Numbers per area before and after (static triangles, worst-view triangles and draw calls, GPU texture MB, load time) in docs/v2/ENV_KIT.md (new section), and the list of assets/v2 files the areas load. Stay within about 36,000 static triangles per area in the worst view and about +10 MB GPU texture over the current numbers; if the generated props push an area over, thin them out where they are far from the path.
8. Owner picture /tmp/claude-0/v2/owner_props.png (about 2000 px wide, Korean captions, honest): each replaced prop before and after at Fold size with the 3D hero next to it, three wide shots per area, each texture before and after on its wall or floor, and one line on what is still weak.
Look at your captures as the owner would. A prop that looks pasted in (wrong scale, wrong brightness, floating, facing the wrong way, texture much sharper or blurrier than its surroundings) is a defect — fix it before adding more.
`

phase('Build')
const built = await agent(PROPS, { label: 'PROPS', phase: 'Build' })

phase('Verify')
const VERIFY = COMMON + `
YOUR LANE: PROPS-VERIFY — adversarially verify the PROPS lane's work. You may edit src/v2/world/, src/v2/env/, assets/v2/env/, assets/v2/props/, tools/v2/world_* and env* tools, tools/v2/world_src/, docs/v2/AREA_FORMAT.md, docs/v2/ENV_KIT.md to fix what you find (small, safe fixes; anything large goes in the report). Progress log: /tmp/claude-0/v2/propsverify_progress.md. Captures: /tmp/claude-0/v2/propsverify/. Time box: 50 minutes.

The PROPS lane's report (null means the lane died — read /tmp/claude-0/v2/props_progress.md and the tree instead):
${String(built).slice(0, 16000)}

Do not trust the report. Do:
1. Run every check the lane lists plus node tools/v2/proto_b_check.mjs and node tools/v2/game_probe.mjs (scene v2g must still open with 0 page errors — read-only use of the ENGINE tool). Report exact results.
2. Reproduce the pack: run the bake into a scratch folder from the repo sources only and compare bytes with assets/v2/props/. Check file sizes, atlas size and how full it is, triangles per prop, GPU texture MB.
3. Look at every prop in game at fold_open and phone2 (index.html?scene=v2c&area=<id>), from the play camera and close up: facing, scale against the hero, floating or sunk, seams, back sides, brightness against the surroundings at night in both eras, texel density next to neighbouring surfaces, things that should glow but do not (and the reverse), collision footprint against the visible shape (walk the hero into each kind from four sides with real touch input), the hero hidden behind new tall props (node tools/v2/world_verify_node.mjs numbers before and after).
4. Look at every replaced texture as a 3x3 repeat and on its wall or floor in both eras: seams, visible repetition at street scale, stone and plank sizes against the hero, walls that glow at night.
5. Numbers per area against the budget in the lane brief (36,000 static triangles worst view, about +10 MB GPU texture, draw calls); enter and leave each area five times and confirm GL memory returns to the same figure.
6. Owner sheet check: open /tmp/claude-0/v2/owner_props.png and compare it with what you saw; redo it if it flatters (keep the lane's version next to it).
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL) with reasons, defects fixed, defects left, numbers, tools/deploy/v2_ship.txt additions if any (do not edit that file), and a 3–4 sentence Korean summary for the owner.
`
const verdict = await agent(VERIFY, { label: 'PROPS-VERIFY', phase: 'Verify' })
return { props: built, verdict }
