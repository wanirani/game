// 다음 주말(페이블) 첫 작업으로 남겨 둔 지시. 울타리 부분은 fence.workflow.js 로 먼저 돌린다 — 이 스크립트를 돌릴 때는 1번(울타리)이 끝났는지 먼저 확인할 것.
export const meta = {
  name: 'v2-fence-breakables',
  description: 'Fix walking through fences and railings in every area, and add breakable jars, crates and barrels that shatter with sound and drop coins, healing and resonance; then adversarial verify',
  phases: [
    { title: 'Build', detail: 'BREAK lane: fence collision, breakables, drops, coin counter' },
    { title: 'Verify', detail: 'independent check by touch, numbers, owner sheet' },
  ],
}

const COMMON = `
You work on the 3D edition (code name v2) of a Korean action game, 「블러드 녹턴」: HTML5 Canvas + WebGL, ES modules, no bundler in dev. Repo: /home/user/game. You are the only lane editing src/v2 now (a build-tools lane may still run in tools/deploy/ and tools/apk/ — do not touch those).

THE OWNER'S WORDS after playing the latest APK on a Galaxy Z Fold (unfolded, touch), 2026-11-18, with two screenshots of eshville_now: "담장을 뚫는 버그가 있고, 불은 딱 봐도 허접하지? 그리고 항아리 같은것들은 쨍그랑 소리와 함께 깨지고 랜덤으로 아이템, 돈 등이 나오면 좋을 것 같아."
- Screenshot 1: on the main street of eshville_now the hero stands INSIDE the black iron railing that runs along the street's front edge (the railing passes through his legs) — the collision line is not where the railing is drawn. Screenshot 2: the same at the wooden picket fence of the outskirts. (The fire is being fixed by the SPEED-FIRE lane that ran before you — read its report section in /tmp/claude-0/v2/requests.md and docs if present, do not redo it.)
- Earlier standing wishes: "3d지만 타격감(효과, 음향 등) 최고로 살려줘 … 경쾌한 움직임이 느껴지게"; everything 3D, detailed, nothing that looks pasted in.

READ FIRST: docs/v2/P1_CONTRACT.md (rules), docs/v2/AREA_FORMAT.md (areas, props, collision, flags), docs/v2/ENV_KIT.md (the kit, baked props, collision boxes, folds, budgets), docs/v2/PLAY_API.md (rules: hero hit shapes, events, how kinds are added), docs/v2/ENGINE_API.md (scene: hooks, fx, feel bridge, HUD state), docs/v2/FX.md (presets: debris, dust, pickup — 'pickup' with pow 1 coin / 2 heal / 3 mana already exists, plays pickup.coin / pickup.heal / pickup.mana), docs/v2/SOUND_FEEL.md (sound events, materials wood/clay/glass; samples in assets/audio/sfx such as imp_impactGlass_light_*, imp_impactWood_light_*, rpg_handleCoins2, and assets/v2/audio debris_*), docs/v2/UI_API.md (HUD state; the icon atlas has a 'pouch' icon).

Hard rules: no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit every few minutes — never leave the tree broken; the game must load at every moment). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched; ONE headless browser at a time, in the foreground (container restarts today were suspected to come from load). Never run tools/fonts/build_fonts.py without --check; every Korean string you add under src/ must pass python3 tools/fonts/build_fonts.py --check (reword until it passes). Scripts importing playwright-core must live under /home/user/game/tools/. No paid generation. The prop pack must keep reproducing from tools/v2/world_src/ (node tools/v2/world_props_bake.mjs) if you touch it; re-run node tools/v2/world_folds.mjs after geometry changes.
Keep a progress log (path below), one line per step with UTC time (date -u). Your run may be cut off at any moment: small complete steps.
Final answer = your report (plain text, English, short Korean summary for the owner at the end).
`

const BUILD = COMMON + `
YOUR LANE: BREAK. Progress log: /tmp/claude-0/v2/break_progress.md. Captures: /tmp/claude-0/v2/break/. Time box: 120 minutes from start.

Deliver, in priority order:
1. Fences, railings and low walls hold the hero where they are drawn, in every area (eshville_now, eshville_past, graveyard_now, graveyard_past, belltower_now, ossuary_now, ossuary_past, slice0) and every flagged state. Find every railing, fence, balustrade, parapet and low wall the kit draws (src/v2/env, src/v2/world) and compare its drawn line with its collision; fix at the source (the kit piece that builds both), not per area. A node check (extend tools/v2/world_verify_node.mjs or a new tools/v2/world_fence_node.mjs): for every drawn fence segment, the hero's body circle (radius from the rules) can never overlap the drawn bars from either side, walking along and into it at every angle; it fails otherwise. Then by trusted touch in index.html?scene=v2g&area=eshville_now at the two places of the screenshots: push into the railing and the picket fence from every side — capture it.
2. Breakables. Clay jars and pots (several shapes and sizes), wooden crates and barrels as separate dynamic objects (not baked into the static chunks): crafted 3D look that matches the generated props next to them (code-built lathe and box meshes with the kit's textures and baked shading are fine; one draw call per kind with instancing or merged dynamic buffers), solid while whole, gone when broken. Any hero attack hit shape breaks them (combo, charged whip, plunge, sweep), enemies do not. On break: shards and splinters that fly and bounce with the right material (clay shards with a glaze side, wood splinters, barrel staves and hoops), dust, a tiny hit-stop and light vibration through the feel bridge, and the sound — clay 「쨍그랑」 (glass/ceramic samples layered, pitch varied), wood crack. Drops at random from a small table per kind (document it; roughly: nothing 40 %, coins 35 % — one to five, heal 15 % — part of a candle, resonance 10 % — one cell part): visible 3D pickups that pop out, bounce, glint, are drawn to the hero within a short radius and use the existing 'pickup' effect and sounds. Coins add to hero.coins; heal and resonance use the rules' existing fields. Broken objects stay broken while the hero is in the area and come back on re-entry (document it). Rules side (src/v2/play): breakables as data with hit circles, checked against the hero's hit shapes, no allocation per tick, rule tests added to tools/v2/play_rules_test.mjs. Areas: place them where they make sense (market street, inn front, the square, cellars, graveyard huts and paths, ossuary urns and offering jars, the tower's store room), about 8–20 per area, never on the walk path's narrow spots, never blocking an exit or a story trigger; replace the baked static jars/crates/barrels at those spots so nothing is doubled. AREA_FORMAT.md gets a 'breakables' list.
3. The coin counter: the HUD shows a pouch icon with the coin count that slides in when coins change and fades after a few seconds (src/v2/ui hud.js, small and in the cut-glass style), and the built-in fallback HUD shows a plain count. Coins are kept on the scene's state for the save to pick up later (the story/save plug-in is not connected yet — document the field).
4. Checks on the final tree, one at a time, exact results: node tools/v2/play_rules_test.mjs, node tools/v2/play_motion_check.mjs, node tools/v2/whip_check.mjs, node tools/v2/world_validate.mjs, node tools/v2/world_folds.mjs --check, node tools/v2/world_verify_node.mjs, your fence check, node tools/v2/world_check.mjs, node tools/v2/game_walk.mjs --devices fold_open,phone2, node tools/v2/p0_entry_check.mjs, node tools/v2/ui_check.mjs --live v2g, python3 tools/fonts/build_fonts.py --check. Numbers: draw calls and triangles added per area, garbage per frame (node tools/v2/coreverify_break.mjs --only alloc if it still runs) before and after.
5. docs change lines (AREA_FORMAT, PLAY_API, ENGINE_API, UI_API). Owner picture /tmp/claude-0/v2/owner_break.png (about 2000 px wide, Korean captions, honest): the two fence spots before/after, a jar breaking frame by frame, a crate and a barrel breaking, drops popping out and flying to the hero, the coin counter, breakables placed in each area; one line on what is still weak.
Judge as the owner would: shards that look like flat confetti, pickups that look like UI stickers, a sound that does not say "clay", or a jar that floats is a defect.
`

phase('Build')
const built = await agent(BUILD, { label: 'BREAK', phase: 'Build' })

const VERIFY = COMMON + `
YOUR LANE: BREAK-VERIFY — adversarially verify the BREAK lane's work. You may fix what you find in the same folders (small, safe fixes; anything large goes in the report). Progress log: /tmp/claude-0/v2/breakverify_progress.md. Captures: /tmp/claude-0/v2/breakverify/. Time box: 50 minutes.

The BREAK lane's report (null means the lane died — read /tmp/claude-0/v2/break_progress.md and the tree instead):
${String(built).slice(0, 14000)}

Do not trust the report. Do, one at a time:
1. Re-run every check the lane lists; report exact results.
2. Fences by trusted touch in v2g on fold_open and phone2: every railing and fence in eshville_now and graveyard_now — push into it at 0, 30, 60 and 90 degrees from both sides, roll into it, jump against it, get knocked into it by an enemy. The hero's body must never overlap the bars. Capture.
3. Breakables: break each kind with each attack in eight directions; break three at once with the charged whip; break while an enemy is near; leave and re-enter (they come back); stand on a drop spot; let drops land against a wall, on stairs, beside a ledge (they must stay reachable, never fall through the floor); count coins exactly; hammer 200 breaks in a row (no growth in GPU memory, draw calls back to the base when all are broken, no garbage climb). Listen through the events: the right sound name per material, once per break.
4. Look at frame strips of a jar, a crate and a barrel breaking at the game camera at night in both eras, and at the HUD coin counter on both presets: confetti, stickers, floating, popping, or a counter covering another HUD element are defects.
5. Owner sheet check: compare /tmp/claude-0/v2/owner_break.png with what you saw; redo it if it flatters (keep the lane's version next to it).
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL), exact results, what you fixed, what is left, and a 2–3 sentence Korean summary for the owner.
`
phase('Verify')
const verdict = await agent(VERIFY, { label: 'BREAK-VERIFY', phase: 'Verify' })
return { breakables: built, verdict }
