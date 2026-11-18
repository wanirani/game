export const meta = {
  name: 'v2-fence',
  description: 'Fix walking through fences, railings and low walls in every area (collision where they are drawn), with a check that proves it; then adversarial verify',
  phases: [
    { title: 'Build', detail: 'FENCE lane: fence and railing collision in every area' },
    { title: 'Verify', detail: 'independent check by touch' },
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
YOUR LANE: FENCE. Scope: ONLY item 1 below (fences). The breakables of the owner's message are NOT built now (they wait for a later lane) — do not start them. Progress log: /tmp/claude-0/v2/fence_progress.md. Captures: /tmp/claude-0/v2/fence/. Time box: 60 minutes from start.

1. Fences, railings and low walls hold the hero where they are drawn, in every area (eshville_now, eshville_past, graveyard_now, graveyard_past, belltower_now, ossuary_now, ossuary_past, slice0) and every flagged state. Find every railing, fence, balustrade, parapet and low wall the kit draws (src/v2/env, src/v2/world) and compare its drawn line with its collision; fix at the source (the kit piece that builds both), not per area. A node check (extend tools/v2/world_verify_node.mjs or a new tools/v2/world_fence_node.mjs): for every drawn fence segment, the hero's body circle (radius from the rules) can never overlap the drawn bars from either side, walking along and into it at every angle; it fails otherwise. Then by trusted touch in index.html?scene=v2g&area=eshville_now at the two places of the screenshots: push into the railing and the picket fence from every side — capture before and after.
2. Checks on the final tree, one at a time, exact results: your fence check, node tools/v2/world_validate.mjs, node tools/v2/world_folds.mjs --check, node tools/v2/world_verify_node.mjs, node tools/v2/world_check.mjs, node tools/v2/game_walk.mjs --devices fold_open, node tools/v2/p0_entry_check.mjs, python3 tools/fonts/build_fonts.py --check.
3. A change line in docs/v2/ENV_KIT.md and docs/v2/AREA_FORMAT.md. Owner picture /tmp/claude-0/v2/owner_fence.png (about 1600 px wide, Korean captions, honest): the two spots of the screenshots before and after, plus any other place you fixed.
`

phase('Build')
const built = await agent(BUILD, { label: 'BREAK', phase: 'Build' })

const VERIFY = COMMON + `
YOUR LANE: FENCE-VERIFY — adversarially verify the FENCE lane's work (fences only; breakables are not part of this round). You may fix what you find in the same folders (small, safe fixes). Progress log: /tmp/claude-0/v2/fenceverify_progress.md. Captures: /tmp/claude-0/v2/fenceverify/. Time box: 35 minutes.

The FENCE lane's report (null means the lane died — read /tmp/claude-0/v2/fence_progress.md and the tree instead):
${String(built).slice(0, 12000)}

Do not trust the report. Do, one at a time:
1. Re-run every check the lane lists; report exact results.
2. By trusted touch in v2g on fold_open and phone2: every railing and fence in eshville_now and graveyard_now — push into it at 0, 30, 60 and 90 degrees from both sides, roll into it, jump against it, get knocked into it by an enemy. The hero's body must never overlap the bars, and he must not get stuck where he could walk before. Capture.
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL), exact results, what you fixed, what is left, and a 2-sentence Korean summary for the owner.
`
phase('Verify')
const verdict = await agent(VERIFY, { label: 'BREAK-VERIFY', phase: 'Verify' })
return { fence: built, verdict }
