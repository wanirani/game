export const meta = {
  name: 'v2-fire2',
  description: 'Make fire look like fire in the 3D edition: flipbook flame sprites, continuous blazes on wall tops and wrecks, real candle flames, clean braziers; then adversarial verify',
  phases: [
    { title: 'Build', detail: 'FIRE-2 lane: flame sprites, blaze presets, candles, braziers' },
    { title: 'Verify', detail: 'independent look and cost check' },
  ],
}

const COMMON = `
You work on the 3D edition (code name v2) of a Korean action game, 「블러드 녹턴」: HTML5 Canvas + WebGL, ES modules, no bundler in dev. Repo: /home/user/game. Another lane works at the same time: BREAK (breakable jars, crates and barrels with drops and a coin counter). ITS files — do not touch them: src/v2/play/ (rules), src/v2/game/index.js, src/v2/game/hud.js, src/v2/game/storyhost.js, new files it creates (src/v2/game/breakables.js, src/v2/env/breakables.js or similar), src/v2/ui/, the 'breakables' lists and prop placements in src/v2/world/*.js, assets/v2/audio, tools/v2/play_rules_test.mjs. It may append ONE clearly marked block of its own presets at the very end of src/v2/fx/presets.js — leave that block alone. Shared files (src/v2/fx/presets.js, src/v2/world/*.js, src/v2/env/index.js, docs): small Edits only, re-read the file right before each edit, never rewrite one whole (no Write over an existing shared file, no sed -i across it). Both lanes run browser checks on scene v2g, so the game must load at every moment. If a check of yours fails inside a file that is not yours, wait two minutes and run it once more before looking further; never repair the other lane's files — put it in your report.
State of the tree when you start (all verified, published as APK 9): the story and the save are connected (docs/v2/ENGINE_API.md §12 — scene v2g without area= in the address now runs the story; with area=<id> it does not), fences hold the hero where they are drawn (docs/v2/ENV_KIT.md §21), the game ships as two apps (the 3D app takes only what tools/deploy/web3d_ship.txt and tools/deploy/v2_ship.txt list — whole folders assets/audio/sfx, assets/audio/sfx_v2, assets/v2/audio, assets/v2/props are listed).

THE OWNER'S WORDS (plays on a Galaxy Z Fold unfolded, touch), 2026-11-18, about the fire in eshville_now: "불도 너무 이상하게 표현했네" and, with a screenshot, "불은 딱 봐도 허접하지?" (the fire obviously looks shoddy). Standing wish: "3d지만 타격감(효과, 음향 등) 최고로 살려줘, 마법 등도 3d로 화려하게 … 디테일이 있도록".
What was done since (lane SPEED-FIRE, in the published 3D app): the flat orange triangles baked into the world were removed from the game and particle fire burns at every fire anchor (src/v2/game/anchors.js: tongues, core, heat glow, sparks, smoke, a flickering light; sizes per anchor; ground-relative anchors). What its verifier still saw: wide wall-top and roof fires read as ROWS OF SEPARATE TEARDROPS, more like candle-flame icons than a blaze (each tongue is one teardrop sprite); small bowls flicker unevenly; candles are still small baked flat triangles (src/v2/env/props2.js candles, props3 candle); the generated brazier model has angular yellow shards in its bowl (prop pack geometry: tools/v2/world_src/props, tools/v2/world_props_bake.mjs); ossuary_now's fire stays orange under the cold blue light.
The owner's device has headroom (docs/v2/PERF_NOTES.md §9: 120 Hz, 0 % uneven frames with 264,000 triangles; JS about 1 ms per frame), but particle overdraw is a real cost on a 2.6x screen: big overlapping quads must be few.

READ FIRST: docs/v2/P1_CONTRACT.md (rules), docs/v2/FX.md (the effects engine: particles, sprites atlas built in src/v2/fx/sprites.js, tiers, budgets, the fill limiter and priority particles), src/v2/game/anchors.js, docs/v2/ENV_KIT.md §20 (the fire change), tools/v2/speedfire_fire.mjs (captures each fire spot; --before <commit> shows old code).

YOUR FOLDERS: src/v2/fx/ (sprites.js, presets.js, engine pieces if a flipbook needs them), src/v2/game/anchors.js (only this file in src/v2/game), the candle and brazier flame parts of src/v2/env/props2.js and props3.js, tools/v2/world_src/props + the bake (brazier only), tools/v2/*fire*.mjs, docs/v2/FX.md, docs/v2/ENV_KIT.md (change lines). The hit and magic effects of the game use the same engine: they must look and cost exactly as before unless you improve a shared piece on purpose (say so).

Hard rules: no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit every few minutes — never leave the tree broken). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched; ONE headless browser at a time, in the foreground (container restarts were suspected to come from load). Never run tools/fonts/build_fonts.py without --check. Scripts importing playwright-core must live under /home/user/game/tools/. Never build into the repo's dist/ (the main session's release uses it) and do not touch tools/deploy/ or tools/apk/; a release-build test, if you want one, runs on a copy of the tree under /dev/shm that you delete afterwards.
Paid generation (Higgsfield MCP tools, find with ToolSearch) is allowed for ONE purpose: a flame flipbook sheet (and at most one smoke/ember sheet) as images with model gpt_image_2_5 — plain black background, frames in a clean grid, no text — cap 10 credits, recorded in tools/higgsfield/manifest_fire2.json, never naming a game, studio or brand. Look at the result before using it; a painted-in-code sheet is the fallback and is fine if it looks better. If a paid call is refused by the permission system, do not retry: write the exact call to /tmp/claude-0/v2/fire2/gen_requests.json and continue with the code-painted sheet.
Keep a progress log (path below), one line per step with UTC time (date -u). Your run may be cut off at any moment: small complete steps.
Final answer = your report (plain text, English, short Korean summary for the owner at the end).
`

const BUILD = COMMON + `
YOUR LANE: FIRE-2. Progress log: /tmp/claude-0/v2/fire2_progress.md. Captures: /tmp/claude-0/v2/fire2/. Time box: 90 minutes from start.

Deliver, in priority order:
1. Flames that read as fire at the game camera at night. A flame flipbook (8–16 frames of licking, tearing flame shapes with soft edges; alpha from luminance) in the effects atlas, particles that play it (frame by age, random start frame and mirror, slight shear with the wind), and a blaze built in layers: a wide, continuous BODY along the whole burning width (overlapping flipbook quads, bright yellow-white at the base to deep orange at the tips, no gaps between emitters — a wall-top fire must be one fire, not a row), taller TONGUES that break away upward, a hot CORE, sparks and embers that drift and die, soft dark SMOKE above, a warm heat glow on the wall and ground, and the flickering light. Size classes as now (bowl, house fire, wall-top / wreck blaze) with the big ones clearly big — the roof fire of the outskirts should feel dangerous. Colours must read in both nights and under the ossuary's cold light (a slightly paler, bluer-white core there is fine).
2. Candles: a small living flame (one or two flipbook quads or a tiny particle preset per candle group, batched; a soft halo), replacing the baked flat triangles in the game (keep a tiny static fallback for scene v2c, which has no effects engine). Braziers: no angular shards in the bowl — glowing coals plus the particle fire (fix in the prop source / bake or cover it; keep the bake reproducible).
3. Cost, measured with the existing tools (speedfire_fire.mjs stats; node tools/v2/coreverify_break.mjs --only alloc if it runs): per fire spot at the mid tier at most about 500 live particles and no more than 2 extra draw calls in all; report the screen area covered by fire quads (overdraw) per spot and keep the big blaze under about 2.5 full-screen layers at the low tier; low / mid / high tiers; nothing allocated per frame; far or off-screen fires stop emitting.
4. Checks on the final tree, one at a time, exact results: node tools/v2/world_validate.mjs, node tools/v2/world_folds.mjs --check, node tools/v2/world_check.mjs, node tools/v2/envkit_check.mjs --base 1, node tools/v2/world_fence_node.mjs, node tools/v2/p0_entry_check.mjs, node tools/v2/game_walk.mjs --devices fold_open, node tools/v2/game_story.mjs --plan boot, node tools/v2/fx_sound_link.mjs, python3 tools/fonts/build_fonts.py --check; and captures proving the hit and magic effects are unchanged (three presets before/after).
5. Owner picture /tmp/claude-0/v2/owner_fire2.png (about 2000 px wide, Korean captions, honest): the eight fire spots before (the published state: git commit 923583c via --before) and after at Fold size from the game camera, a six-frame strip of the wall-top blaze showing it move, candles and a brazier close up, and one line on what is still weak.
Judge every capture as the owner would: droplets in a row, paper cut-outs, plastic blobs, a fire that does not seem to burn the thing under it, or a candle that is a triangle are defects to fix before you report.
`

phase('Build')
const built = await agent(BUILD, { label: 'FIRE-2', phase: 'Build' })

const VERIFY = COMMON + `
YOUR LANE: FIRE2-VERIFY — adversarially verify the FIRE-2 lane's work. You may fix what you find in the same folders (small, safe fixes; anything large goes in the report). No paid generation. Progress log: /tmp/claude-0/v2/fire2verify_progress.md. Captures: /tmp/claude-0/v2/fire2verify/. Time box: 35 minutes.

The FIRE-2 lane's report (null means the lane died — read /tmp/claude-0/v2/fire2_progress.md and the tree instead):
${String(built).slice(0, 12000)}

Do not trust the report. Do, one at a time:
1. Re-run the checks the lane lists; exact results.
2. LOOK: capture every fire spot in every area (eshville_now roof / wall-top / wreck / braziers, eshville_past braziers and candles, ossuary_now and ossuary_past bowls and candles, belltower braziers, slice0) at fold_open and phone2 from the game camera, three frames 0.2 s apart each. Is each one continuous fire (not droplets in a row)? Does it sit on the burning thing? Any flat triangle left (candles, braziers)? Does the big blaze hide the hero or an enemy standing in front of or behind it?
3. Cost: live particles, draw calls, lights per spot per tier; overdraw of the biggest blaze; garbage per frame; enter and leave an area five times (GPU memory back to the same figure); the hit and magic presets unchanged (captures).
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL), exact results, what you fixed, what is left, and a 2–3 sentence Korean summary for the owner.
`
phase('Verify')
const verdict = await agent(VERIFY, { label: 'FIRE2-VERIFY', phase: 'Verify' })
return { fire2: built, verdict }
