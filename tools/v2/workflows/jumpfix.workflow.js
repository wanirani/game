// 채찍 2차 검수(11-19 14:40)의 결정 사항: 예약된 연타 뒤에 누른 점프가 36번 중 19번 사라진다(전 3번). APK 14 전에 되돌린다:
// 점프는 구르기처럼 예약된 다음 타를 밀어내고 나간다(1차 때의 동작 = APK 12 · 13 에서 검증된 것). 솜씨 눌림의 보호는 그대로.
export const meta = {
  name: 'v2-jumpfix',
  description: 'One rules fix before APK 14: a jump pressed behind a queued combo hit comes out again (it takes the queued hit\'s place, as a roll does); the skill press stays carried; rules tests, probes and the boss stretch; then a short independent check',
  phases: [
    { title: 'Build', detail: 'JUMPFIX lane: the rule, its tests, the probes, the boss stretch' },
    { title: 'Verify', detail: 'independent probe, diff and tests' },
  ],
}

const COMMON = `
You work on the 3D edition (code name v2) of a Korean action game, 「블러드 녹턴」: HTML5 Canvas + WebGL, ES modules, no bundler in dev. Repo: /home/user/game. ANOTHER LANE IS RUNNING: POLISH and its verifier (small fixes in the screens' files). ITS files — never touch them: src/v2/ui/, tools/v2/screens_*.mjs, tools/v2/ui_check.mjs, tools/v2/release/pre_chain.sh. It has a headless browser on scene v2g, so the game must load at every moment, and you run ONE headless browser at a time, in the foreground (four processors: be patient with timeouts). If a check of yours fails inside a file that is not yours, wait two minutes and run it once more; never repair another lane's files — put it in your report.

THE OWNER (plays on a Galaxy Z Fold unfolded, touch, 120 Hz) wants movement that feels brisk; his first complaint about this game was "움직임 자체가 스피디함이 없어 느린 느낌" (the movement itself feels slow). A button that does nothing is the worst thing this lane can leave in.

WHAT HAPPENED. The rules (src/v2/play/sim.js, the hero's input part; docs/v2/PLAY_API.md §1.1) carry a press of attack, roll, jump or skill for TUNE.bufT = 0.19 s and fire it on the first tick the hero may do it. The first whip pass (in the published builds APK 12 and 13) had the rule "a later press of another button forgets the queued next combo hit". Today the WHIP2 lane changed that: a queued combo hit is now KEPT against a later jump or skill press (a roll still takes its place), and a skill press is held longer (TUNE.bufHold 0.35) so that it fires when the hero is free. The skill got a way to come out; THE JUMP DID NOT: its press waits its 0.19 s behind the queued hit and runs out. The verifier measured it (tools/v2/whip_v2rules.mjs — read its head; the probe: attack, attack, then jump 1 to 12 ticks later, 36 cases): the jump comes out in 17 of 36 today against 33 of 36 on the lane's start commit 6f77240; under random mashing (node tools/v2/whipverify_same.mjs, 12 seeds x 6,000 ticks, start commit against today) jumps fell from 375 to 235 and plunges from 210 to 151. The next step after you is the release chain and a published build.

THE DECISION (the main session's): the jump is a movement press like the roll — the newest movement press wins. A jump pressed while a combo hit is queued takes the queued hit's place, exactly as a roll press does today, and fires on the first tick the hero may jump (as in APK 12 and 13, where a whole chapter was played with that rule). Nothing else changes: the skill press stays carried and stays unable to wipe a queued hit; the roll stays as it is; a queued hit that a jump did not replace stays protected; every invariant of the first pass holds (a press fires once, none fires across a hit, the scene's _dropPresses drops everything while the story holds the hero, nothing fires on the tick a walk of the story ends). Do NOT add a new hold time for the jump, do not let a jump cut a running hit short, do not touch TUNE numbers: the smallest change that restores the jump.

YOUR FILES: src/v2/play/sim.js (the hero's input part only: small Edits with the Edit tool, re-read the file right before each edit, never rewrite it whole, never a // comment in the middle of a line that carries more code after it), tools/v2/play_rules_test.mjs (the expectations WHIP2 added for a jump behind a queued hit change for this stated reason — change those and no others, and add two: a jump behind a queued hit comes out and the queued hit is gone; a skill behind a queued hit leaves the hit and is carried), tools/v2/whip_v2rules.mjs and tools/v2/whipverify_same.mjs only where a line judges the old behaviour (say which), docs/v2/PLAY_API.md §1.1 (correct the WHIP2 bullet and its mash table; a change line). Nothing else.

Hard rules: no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit every few minutes — never leave the tree broken). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched. Never run tools/fonts/build_fonts.py without --check. Scripts importing playwright-core must live under /home/user/game/tools/. No paid generation. Never build into the repo's dist/ and do not touch tools/deploy/ or tools/apk/.
Keep a progress log (path below), one line per step with UTC time (date -u). The whole session may be cut off at any moment (a usage limit is close): small complete steps.
Final answer = your report (plain text, English, two Korean sentences for the owner at the end).
`

const BUILD = COMMON + `
YOUR LANE: JUMPFIX. Progress log: /tmp/claude-0/v2/jumpfix_progress.md. Captures: /tmp/claude-0/v2/jumpfix/. Time box: 25 minutes from start. Note the commit you start from (git rev-parse --short HEAD).

Do, in order:
1. BEFORE numbers on the unchanged tree: node tools/v2/whip_v2rules.mjs (the jump probe: how many of 36, and how many second hits kept) and node tools/v2/play_rules_test.mjs (the count).
2. The rule, as decided. Read how the roll takes a queued hit's place and do the same for the jump — one or two lines.
3. AFTER numbers: the jump probe (33 of 36 or better — for each case that still fails, say why: which state held him); the skill probe unchanged (36 of 36); node tools/v2/play_rules_test.mjs all passing with the changed and the two added expectations (list the changed ones with before and after); node tools/v2/play_verify_fuzz.mjs; node tools/v2/play_motion_check.mjs; node tools/v2/whip_check.mjs; node tools/v2/whip_hookpress.mjs or whichever tool gave 986 of 1000 for the hook under the ring (it must not fall); node tools/v2/whipverify_same.mjs (the mash table next to the verifier's: third hits, charged coils, hooks, jumps, plunges, times hurt — third hits will fall a little; say by how much and judge it as a player).
4. In the game, one at a time: node tools/v2/whip_press.mjs; node tools/v2/owner_fix_check.mjs; the chapter bot from the published save after ev_knells_done to ev_ending_home in your own folder (node tools/v2/chapter_audit.mjs — read its head; the saves: /tmp/claude-0/v2/pre13/chapter/saves, copy what you need into your own folder, never write there): beats failed 0, helps 0, page errors 0 — the queen's fight is the proof that nothing of the hero's became weaker.
5. PLAY_API §1.1 corrected. Say plainly in your report what you did not run.
`

phase('Build')
const built = await agent(BUILD, { label: 'JUMPFIX', phase: 'Build' })

const VERIFY = COMMON + `
YOUR LANE: JUMPFIX-VERIFY — check the JUMPFIX lane's work with your own runs. You may make small, safe fixes in the JUMPFIX lane's files; anything large goes in the report. Progress log: /tmp/claude-0/v2/jumpfixverify_progress.md. Captures: /tmp/claude-0/v2/jumpfixverify/. Time box: 12 minutes.

The JUMPFIX lane's report (null means the lane died — read /tmp/claude-0/v2/jumpfix_progress.md and the tree instead):
${String(built).slice(0, 8000)}

Do not trust the report. Do, one at a time:
1. git diff of src/v2/play/sim.js against the commit the lane started from: is the change the decided rule and nothing more (no new hold time, no TUNE number, no cut of a running hit, the skill and the roll as they were)? The diff of tools/v2/play_rules_test.mjs: only expectations about a jump behind a queued hit changed, two added — was any other expectation loosened?
2. Your own probe in node, written from scratch (not the lane's tool): attack, attack, then jump 1 to 14 ticks later, in each of the three combo steps and after a roll's sweep — how often does the jump come out, how late, and is the queued hit gone exactly when a jump replaced it? The same with a skill press and with a roll press: unchanged against the lane's start commit (copy the old sim.js into a scratch folder under /dev/shm, never git checkout)? A jump pressed while the story holds the hero, in a dialogue, on the tick a hit lands, and while stunned: nothing fires that should not, nothing fires twice.
3. Re-run, exact results: node tools/v2/play_rules_test.mjs; node tools/v2/play_verify_fuzz.mjs; node tools/v2/whip_check.mjs; node tools/v2/whipverify_same.mjs; node tools/v2/whip_press.mjs.
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL), exact results, what you fixed, what is left, and one Korean sentence for the owner.
`
phase('Verify')
const verdict = await agent(VERIFY, { label: 'JUMPFIX-VERIFY', phase: 'Verify' })
return { jumpfix: built, verdict }
