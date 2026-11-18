export const meta = {
  name: 'v2-p1-world3',
  description: 'P1 world fixes: walkable bell-tower stairs, no hidden hero in the ossuary and boss hall, no trapping nooks, the crate story hole closed; then a short adversarial re-check',
  phases: [
    { title: 'Fix', detail: 'WORLD-3 lane: the defects the last review left' },
    { title: 'Recheck', detail: 'independent re-measure by touch and rays' },
  ],
}

const COMMON = `
You are one lane of a multi-lane build of the 3D edition of a Korean action game (HTML5 Canvas + WebGL, ES modules, no bundler in dev). Repo: /home/user/game. Work directly in that tree. One other lane works there at the same time: INTEGRATE (src/v2/game/, src/v2/ui/, and for hook names src/v2/data/events.js — the game scene v2g loads your areas through AREAS and walks bots through them while you work).

YOUR FOLDERS: src/v2/world/, src/v2/env/, assets/v2/env/, assets/v2/props/, tools/v2/world_*.{mjs,html,py}, the env* tools, tools/v2/world_src/, docs/v2/AREA_FORMAT.md, docs/v2/ENV_KIT.md. Do not edit anything else under src/. What you need from another lane goes into /tmp/claude-0/v2/requests.md as a dated section.
Do not rename or move existing spawns, exits, sections, groups, actors, triggers or interactables (the story and the scene use their names — docs/v2/DATA_FORMAT.md §12, src/v2/data/events.js read-only); never leave node tools/v2/world_validate.mjs failing between steps; replace a shipped pack only with a complete working set (temp name, then rename).

READ FIRST: docs/v2/P1_CONTRACT.md (rules — binding), docs/v2/AREA_FORMAT.md §13 and docs/v2/ENV_KIT.md §18 (the last round), and the review this lane answers, quoted below. For how high the hero can step and jump: docs/v2/PLAY_API.md and src/v2/play/tune.js / collide.js (read-only).

THE REVIEW (WORLD2-VERIFY, 2026-11-18) — defects found and left unfixed:
a) Tower stairs cannot be walked up with the stick. With the stick held toward the stair for 150 ticks the hero stops at the foot of each flight (stone 0→1 at z 116, wood 1→2 at z 279, wood 3→4 at z 599); he must jump up every stair. Tower stairs rise 15.1 per 13.3–13.8 deep; stairs that work elsewhere rise 12 per 14–25. The lane's check hid this: its bot jumps when stuck without counting it (tools/v2/world_check.mjs, stuck >= 4). A touch bot hung at the foot of stair 3→4 at (173, 599).
b) "Hero hidden" figures were measured on a fraction of the ossuary (tools/v2/world_verify_node.mjs floods from the default spawn in the base state only). Seeded from every spawn (tools/v2/world_v2verify_node.mjs), fold_open / phone2: ossuary_now base 178 / 194 of 5694 cells (entry 3, arena 30, lamp 32, riddle 25, rest 4, boss 58 of 1470, posts 26 of 374); ossuary_now with wedge_stone 278 / 305 of 6344 — 74–80 of them right behind the coffin wall (x 410..770, z 790..930), exactly where the hero lands after ringing the corridor bell in 1697; ossuary_past 156 / 165 of 7115 (boss 56–57 of 1596, posts 26); graveyard_now with bell_hung 216 / 236 of 2478; graveyard_past with bell_hung 270 / 306 of 2428.
c) Boss hall: hidden cells behind the two door fire posts (7 + 7), behind the two corner coffin stacks tonight (11 + 11), along the wall piers, 26–28 of 374 in the bell-post corridor. In 1697 the corner candelabra at (150, 3060) and (1050, 3060) leave a 30-wide slot to the wall and a dead-end nook where a boss of radius 30 can shut the hero in. Tonight a pushed hero wedges into the 26-wide nook between pier and bone heap at (114, 3394). A bell post stands in the middle of the floor at (600, 3350): a 150-unit roll orbit around the boss is free at only 23 % of boss positions.
d) Story hole with the wooden crate: in 1697 the crate fills the gap, so the hero can walk on to the riddle-room or hall bell and cross to tonight beyond the gap, skipping the arena fight trigger and Sera's trigger (both on the south side of those rooms).
Also noted: props without collision on walkable ground (a bone heap in ossuary_now at (440, 590); in the tower a fallen beam, a debris heap and floor candles); a bell crossing can land the hero inside a coffin stack or bone heap of the other night (not measured); no whip ring inside the ossuary although the hook is the dungeon's theme.

Hard rules (contract §4): no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit every few minutes; read-only git commands are fine). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched. Two container restarts today are suspected to come from too much parallel load: run ONE browser process at a time in the foreground of your own work (no background chains of checks), prefer node-only checks where they answer the question, and keep the progress log current after every step. Never run tools/fonts/build_fonts.py without --check; Korean strings you add under src/ must pass python3 tools/fonts/build_fonts.py --check. Scripts that import playwright-core must live under /home/user/game/tools/. No paid generation.
Keep a progress log (path below), one line per step with UTC time (date -u). Your run may be cut off at any moment: small complete steps.
Final answer = your report (plain text, English, short Korean summary for the owner at the end): what you changed, check results exactly as they came out, what is still left, files changed.
`

const FIX = COMMON + `
YOUR LANE: WORLD-3. Progress log: /tmp/claude-0/v2/world3_progress.md. Captures: /tmp/claude-0/v2/world3/. Time box: 60 minutes from start.

Deliver, in priority order:
1. Tower stairs that the stick alone climbs: every flight walkable up and down without a jump on fold_open and phone2 (lower rise per step, longer flights, or ramps under the steps — whatever the rules' step height allows; measure it from the rules, do not guess). Jumps only where a floor is broken on purpose. Make tools/v2/world_check.mjs honest: count every jump the bot makes, fail when a stair needs one, and print jumps per flight.
2. Honest hidden-hero numbers: tools/v2/world_verify_node.mjs floods from every spawn and in every flagged state (take what tools/v2/world_v2verify_node.mjs does), prints hidden cells per area, state and section, and fails over a limit you set and document. Then bring them down where it matters: 0 hidden cells on the boss hall's fight floor in both nights; no hidden cell within 60 units of any bell (where a crossing lands); the strip behind the coffin wall at the corridor bell; under 3 % of cells in every other section. Lower, move, thin out or turn pieces — keep the rooms looking as rich as they do.
3. Boss hall that cannot trap: no slot or nook the hero fits into but cannot leave by walking while a boss of radius 30 stands at its mouth (check by node: for every free cell, a walk path to the hall centre exists that stays 60 units clear of any single blocking disc placed at the nook mouth — or a simpler test you document); the bell post out of the middle of the floor (keep its id, kind and event; put it where the story's knell still makes sense, at the hall's far wall or its side); a 150-unit roll orbit free at 70 % or more of boss positions within the fight floor.
4. The crate hole: in ossuary_past, when the crate (wedge_wood) is in the gap, the bells beyond it do not answer (they are shown unlit or covered and raise their locked event) until the statue (wedge_stone) is there — as area state, documented in AREA_FORMAT.md, validated in every flagged state. Say in requests.md what the story must know.
5. Collision for the props named above; a helper exported from src/v2/world/ that returns the nearest free reachable spot for a point in a given area and state (for crossings that would land inside something) with a node test; one or two whip rings inside the ossuary where a hook shortens or opens a path without breaking the story's order (optional, last).
6. Checks on the final tree, ONE at a time, reported exactly: node tools/v2/world_validate.mjs, node tools/v2/world_folds.mjs --check (re-run the fold plan after geometry changes), node tools/v2/world_check.mjs, node tools/v2/world_verify_node.mjs, node tools/v2/world_verify_shot.mjs, node tools/v2/world_propsverify_node.mjs, node tools/v2/story_check.mjs (must still exit 0), python3 tools/fonts/build_fonts.py --check; the bake still reproduces the shipped pack from tools/v2/world_src/. Numbers per area before and after (static triangles, static draws in the worst view — Eshville stays at most 30 — hidden cells).
7. docs/v2/AREA_FORMAT.md and docs/v2/ENV_KIT.md (change lines, new numbers). Correct the two flattering captions of the owner picture by regenerating it with tools/v2/world2_owner.mjs if that takes under five minutes; otherwise say so.
`

phase('Fix')
const fixed = await agent(FIX, { label: 'WORLD-3', phase: 'Fix' })

const RE = COMMON + `
YOUR LANE: WORLD3-RECHECK — independently re-measure what the WORLD-3 lane says it fixed. You may fix what you find in the same folders (small, safe fixes only). Progress log: /tmp/claude-0/v2/world3recheck_progress.md. Captures: /tmp/claude-0/v2/world3recheck/. Time box: 35 minutes.

The WORLD-3 lane's report (null means the lane died — read /tmp/claude-0/v2/world3_progress.md and the tree instead):
${String(fixed).slice(0, 12000)}

Do not trust the report. Do, one check at a time:
1. Tower by trusted touch on fold_open and phone2 (index.html?scene=v2c&area=belltower_now): hold the stick toward each flight for 200 ticks — does the hero reach the top of the flight without any jump? Walk the whole climb with your own bot counting jumps; walk down too. Drop off every floor edge once more (must land on a floor, unhurt or as the area intends).
2. Hidden hero with your own ray script seeded from every spawn in every flagged state (do not reuse the lane's edited tool without reading it): per area, state and section; the boss hall fight floor and the 60-unit discs around every bell must be 0.
3. Boss hall: your own trap test (hero pushed into every corner and slot by a disc of radius 30 — can he always walk out?), and the roll-orbit share.
4. The crate state: with wedge_wood the bells beyond the gap do not answer; with wedge_stone they do; nothing else about hooks changed (compare every hook name against src/v2/data/events.js and docs/v2/DATA_FORMAT.md §12).
5. node tools/v2/world_validate.mjs, world_check.mjs, world_verify_shot.mjs, story_check.mjs, fonts --check; static triangles and static draws per area against the limits (35,000; Eshville at most 30 draws).
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL) with numbers, what you fixed, what is left, and a 2–3 sentence Korean summary for the owner.
`
phase('Recheck')
const verdict = await agent(RE, { label: 'WORLD3-RECHECK', phase: 'Recheck' })
return { world3: fixed, verdict }
