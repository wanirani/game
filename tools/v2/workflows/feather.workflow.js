// 맺음의 마지막 그림 — 여관 창턱의 까마귀 깃털. STORY2 검수(11-19 09:35)가 남긴 것 가운데 출시 전에 고칠 하나:
// 해설이 「여관 창가에도 까마귀 깃털 하나가 놓여 있다」고 말하는데 그림에는 깃털이 없다. 다른 갈래는 돌지 않는다.
export const meta = {
  name: 'v2-feather',
  description: 'The last picture of chapter 1 of the 3D edition: one small crow feather on the sill of the inn window, so that the picture shows what the last line says; then an independent look and the world checks',
  phases: [
    { title: 'Build', detail: 'FEATHER lane: the prop, its place, the folds, a still' },
    { title: 'Verify', detail: 'independent look at the still and from the game camera, world checks' },
  ],
}

const COMMON = `
You work on the 3D edition (code name v2) of a Korean action game, 「블러드 녹턴」: HTML5 Canvas + WebGL, ES modules, no bundler in dev. Repo: /home/user/game. No other lane is running; the release checks start from this tree the minute you finish, so keep the change as small as the job and leave the game loading and playing.

THE JOB. The chapter's very last line before the ending card is the narrator's 「여관 창가에도 까마귀 깃털 하나가 놓여 있다.」 (the first feather falls at the hero's feet in the dungeon; this one is the hook for what comes after the chapter). Since today the line has its own picture: the camera shot inn_window (src/v2/game/storyhost.js SHOTS: at [1706, 300], dist 270, lookY 90 from the street floor, yaw 0.13) on the inn's lit ground-floor window in tonight's village — and no feather is in it, so the picture contradicts the line. The request as the story lane wrote it (/tmp/claude-0/v2/detail_requests.md, last section): one small black crow feather lying on the stone sill of the inn's ground-floor window LEFT of its door — the shuttered two-pane window at about x 1722 (the house is the house({ x: 1500, z: 300, w: 580 … door: 300 }) call in src/v2/world/eshville.js near line 57); sill top at about y 62–66, front face z about 296–300; about 26 px long, lying flat, tip towards the door, a little over the sill's edge so that it reads against the lit glass. Only in tonight's village (era now), and only once the ending has begun (the area flag bells_answered, which the story now sets before the last crossing — find how eshville.js reads its flags, the variable out and the like, and use the same way; the area builder is called with the flags and every state of every area must still compile). Measure the sill yourself before you place anything (a still from the shot, or the house builder's own numbers): the figures above are the story lane's reading, not a proof.

WHAT IT MUST LOOK LIKE in the shot on the owner's device (a Galaxy Z Fold unfolded; preset fold_open): at first glance a feather and nothing else — a slim blue-black vane with a pale quill down its middle and a soft curve, lying on the sill, caught by the warm light of the window so that it does not sink into the dark stone; large enough to be found within a second by someone who has just read the line (if 26 px does not read at that distance, make it as long as it needs — a crow's flight feather may be a third of the window's width — and say what you chose), small enough to be a feather. No new texture, no new material, no draw call: geometry in an existing material with a colour per vertex, in the way src/v2/env/props5.js and src/v2/env/wear.js do it (docs/v2/ENV_KIT.md §24 and the newest change lines), a few dozen triangles at most. No collision, no interact spot, nothing the hero or the camera can touch. It must not flicker against the sill (lift it by what the depth buffer needs) and must not be a black blob from the normal game camera when the player walks past the inn after the ending.

LOOK AT IT with the tool that shows the ending: node tools/v2/chapter_cuts.mjs --saves <bot saves> --out <your dir> --devices fold_open --chains tools/v2/story_end_chains.mjs --only end_west, then the still named …_west_feather.jpg in <your dir>/fold_open/ (bot saves of today's tree: /tmp/claude-0/v2/story2verify/bot/saves and /tmp/claude-0/v2/story2/bot/saves — copy what you need into your own folder, never write there; read the head of chapter_cuts.mjs for its switches). Crop the still to the window at full size and look at the crop.

YOUR FILES: src/v2/env/props5.js (or the env file where such a small prop belongs), the inn's dressing in src/v2/world/eshville.js (small Edits with the Edit tool, re-read right before each; never put a // comment in the middle of a line that carries more data after it), src/v2/world/folds.js only through its generator (node tools/v2/world_folds.mjs — read its head; --check must pass afterwards), docs/v2/ENV_KIT.md (a change line). Nothing else: not the story's data, not the camera shot, not the line.

Hard rules: no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit every few minutes — never leave the tree broken). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched; ONE headless browser at a time, in the foreground. Never run tools/fonts/build_fonts.py without --check. Scripts importing playwright-core must live under /home/user/game/tools/. No paid generation. Never build into the repo's dist/ and do not touch tools/deploy/ or tools/apk/.
Keep a progress log (path below), one line per step with UTC time (date -u). Say plainly in your report what you did not do.
Final answer = your report (plain text, English, two Korean sentences for the owner at the end).
`

const BUILD = COMMON + `
YOUR LANE: FEATHER. Progress log: /tmp/claude-0/v2/feather_progress.md. Captures: /tmp/claude-0/v2/feather/. Time box: 25 minutes from start. Note the commit you start from (git rev-parse --short HEAD).

Do, in order:
1. A BEFORE still of the feather shot (the command above) and its crop to the window.
2. The feather: built, placed on the measured sill, only with the flag; folds regenerated.
3. The AFTER still and its crop; look at it as the owner would and correct size, tilt, colour and place until it reads at first glance. Then one still from the normal game camera with the hero standing in the street in front of that window after the ending (tools/v2/spot_shot.mjs --area eshville_now takes hero spots; if it cannot set the flag, load the bot's save after ev_ending_home through chapter_cuts or say that you could not).
4. Checks, one at a time, exact results: node tools/v2/world_folds.mjs --check; node tools/v2/world_validate.mjs; node tools/v2/world_verify_node.mjs; node tools/v2/world_fence_node.mjs; node tools/v2/envkit_check.mjs --base 1; node tools/v2/chapter_reach.mjs; node tools/v2/story_check.mjs; the triangle count of eshville_now with and without the flag, before and after (budget 43,000).
5. The owner picture /tmp/claude-0/v2/owner_feather.png: the window crop before and after side by side, about 1600 px wide, one Korean caption line (a font with Hangul: /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc).
`

phase('Build')
const built = await agent(BUILD, { label: 'FEATHER', phase: 'Build' })

const VERIFY = COMMON + `
YOUR LANE: FEATHER-VERIFY — check the FEATHER lane's work with your own eyes and runs. You may make small, safe fixes in the FEATHER lane's files; anything large goes in the report. Progress log: /tmp/claude-0/v2/featherverify_progress.md. Captures: /tmp/claude-0/v2/featherverify/. Time box: 12 minutes.

The FEATHER lane's report (null means the lane died — read /tmp/claude-0/v2/feather_progress.md and the tree instead):
${String(built).slice(0, 9000)}

Do not trust the report. Do, one at a time:
1. Your own still of the feather shot on fold_open (the command above, your own folder), cropped to the window at full size: would someone who has just read the line find the feather within a second, and is it a feather? Does it float above the sill, sink into it, or flicker (two stills a few frames apart)? The same shot once on phone2.
2. Is the feather absent before the ending? Compile eshville_now in node with and without the flag bells_answered (and eshville_past with it) and compare the part counts; a still of the same window from a save before the ending if you can do it in the time.
3. node tools/v2/world_folds.mjs --check; node tools/v2/world_validate.mjs; node tools/v2/world_verify_node.mjs; node tools/v2/world_fence_node.mjs; node tools/v2/chapter_reach.mjs; node tools/v2/story_check.mjs — exact results. Then load the game once in the browser on a save after ev_ending_home (chapter_cuts does it): page errors must be 0.
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL), exact results, what you fixed, what is left, and one Korean sentence for the owner.
`
phase('Verify')
const verdict = await agent(VERIFY, { label: 'FEATHER-VERIFY', phase: 'Verify' })
return { feather: built, verdict }
