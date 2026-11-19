// 화면들 검수(11-19 14:10)가 남긴 작은 것들을 APK 14 전에 고친다: 멈춤 판 위로 비치는 지역 이름표, 빈 책 글귀의 자리, 끌 · 보따리 그림,
// 맺음의 「달이 한 칸 기울었다」 알림, 출시 점검 묶음에 새 화면 · 채찍 검사 넣기. WHIP2-VERIFY 가 도는 동안 빈 자리에서 30분.
export const meta = {
  name: 'v2-polish14',
  description: 'Small fixes before APK 14 in the screens\' own files: no place-name banner through the pause panel, the empty book\'s line off the fold, two icons, the ending\'s closing banner seen for its time, the new screen and whip checks added to the release chain; then a short independent look',
  phases: [
    { title: 'Build', detail: 'POLISH lane: four small UI fixes and the release chain steps' },
    { title: 'Verify', detail: 'independent stills and re-runs' },
  ],
}

const COMMON = `
You work on the 3D edition (code name v2) of a Korean action game, 「블러드 녹턴」: HTML5 Canvas + WebGL, ES modules, no bundler in dev. Repo: /home/user/game. ANOTHER LANE IS RUNNING: WHIP2-VERIFY (it checks the whip lane's work and may make small fixes). ITS files — never touch them: src/v2/whip/, src/v2/play/, src/v2/feel/, src/v2/fx/, src/v2/game/crossing.js, anim.js, magic.js, src/v2/env/, tools/v2/whip_*.mjs, coreverify_*.mjs, play_*.mjs, game_check.mjs, game_walk.mjs. It has a headless browser on scene v2g, so the game must load at every moment, and you run ONE headless browser at a time, in the foreground (four processors: be patient with timeouts). If a check of yours fails inside a file that is not yours, wait two minutes and run it once more; never repair another lane's files — put it in your report.

WHERE THINGS STAND (2026-11-19, 14:15 UTC). The SCREENS lane added the chronicle as a two-page book, the bag, item and chronicle cards with a book chip, choices as cards, Rook's shop and a draught (src/v2/ui/model.js, screens.js, cards.js, choice.js, icons.js, src/v2/data/shop.js; docs/v2/UI_API.md §10; the check node tools/v2/screens_check.mjs runs one device per command; the verifier's break tool is tools/v2/screens_verify.mjs). Its verifier passed it at 14:10 and left small things. The next step after you is the release chain (bash tools/v2/release/pre_chain.sh <folder>, about 47 minutes: read it) and then a published build, so: SMALL, SAFE changes only, each one looked at and checked before the next, and nothing that changes a save, the story's order or the rules.

THE SMALL THINGS (all of them in the screens' own files):
1. THE PLACE-NAME BANNER SHOWS THROUGH THE PAUSE PANEL. When the pause panel is opened in the seconds a banner is up (the big area name with its sub line, right after entering an area; also a story banner), the banner is drawn through the panel's glass over its first rows — the words 「이어하기」 and 「에슈빌」 lie on each other (the still /tmp/claude-0/v2/screens/fold_open_pause.png shows it). No banner may be drawn while the pause panel or one of its screens (the book, the bag, the shop, settings) is up; decide what happens to it when the panel closes inside the banner's time (it goes on for the rest of its time, or it is dropped — whichever reads better; its clock should not run out unseen behind a long pause if that is cheap to do) and say what you chose.
2. THE EMPTY BOOK: on a fresh save the line 「아직 적힌 것이 없다」 is centred on the fold, so the fold line runs through it. Put it where a first entry would be written (one page), not across the fold.
3. TWO ICONS (src/v2/ui/icons.js, drawn in code): the chisel reads as a knife — make it a mason's chisel at a glance at 40 px (a short flat steel bar with a struck, mushroomed head and a bevelled edge; a small mallet beside it if that is what makes it read); the shop's header icon reads as a bell token — make it a pack (보따리: a cloth bundle knotted at the top). Keep the kit's line weight and colours; look at each at the size the game draws it, beside its neighbours.
4. THE ENDING'S CLOSING BANNER is never seen for its time: in the last story event (ev_ending_home, src/v2/data/events.js — read only) the story sets the banner 「달이 한 칸 기울었다」 and the HUD switches it off one tick later, so the words are seen only as the head of the ending card. Find the cause (the rule that makes an area's name banner wait for the story is recent: src/v2/ui/hud.js and the HUD glue; src/v2/game/storyhost.js is the story's host — a small Edit there only if the cause lies there, and say so) and let the banner stand for its time before the card comes. The cuts of the ending are looked at with node tools/v2/chapter_cuts.mjs --saves <a folder of bot saves> --out <your folder> --devices fold_open --chains tools/v2/story_end_chains.mjs (read both heads; fresh bot saves of this tree, one after every story event: /tmp/claude-0/v2/screensverify/chapter/saves — copy what you need into your own folder, never write there). If the cause turns out to need more than a few lines or touches the story's order, do NOT force it: write down what you found and leave it.
5. THE RELEASE CHAIN: add to tools/v2/release/pre_chain.sh, in the style of its existing steps and near the checks they belong with: node tools/v2/screens_check.mjs for fold_open and for phone2 (two steps), node tools/v2/screens_verify.mjs --only cross (the verifier's proof that the back key does nothing during a crossing), node tools/v2/whip_bell.mjs --devices fold_open, node tools/v2/whip_many.mjs and node tools/v2/whip_feel.mjs unless a step already runs them (read each tool's head for its switches and how it reports failure; run each added command once by itself and time it — together they should add about ten minutes; a step must fail the chain exactly when its tool fails). Do not change what the existing steps do. bash -n must pass.

YOUR FILES: src/v2/ui/ (small Edits), tools/v2/screens_check.mjs and tools/v2/ui_check.mjs only where an expectation must follow a change you made on purpose (say which), tools/v2/release/pre_chain.sh (item 5), docs/v2/UI_API.md (a change line). Shared files: small Edits only with the Edit tool, re-read the file right before each edit, never rewrite one whole (no Write over an existing file, no sed -i), never a // comment in the middle of a line that carries more code after it.

Hard rules: no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit every few minutes — never leave the tree broken). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched. Never run tools/fonts/build_fonts.py without --check; every Korean string you add under src/ must pass python3 tools/fonts/build_fonts.py --check (add no new Korean characters if you can avoid it). Scripts importing playwright-core must live under /home/user/game/tools/. No paid generation. Never build into the repo's dist/ and do not touch tools/deploy/ or tools/apk/.
Keep a progress log (path below), one line per step with UTC time (date -u). The whole session may be cut off at any moment (a usage limit is close): small complete steps, the game loading after every one.
Final answer = your report (plain text, English, two Korean sentences for the owner at the end).
`

const BUILD = COMMON + `
YOUR LANE: POLISH. Progress log: /tmp/claude-0/v2/polish14_progress.md. Captures: /tmp/claude-0/v2/polish14/. Time box: 30 minutes from start — items in the order 1, 5, 2, 3, 4; drop item 4 and then item 3 rather than run over. Note the commit you start from (git rev-parse --short HEAD).

For each item: a BEFORE still or crop where there is something to see, the change, an AFTER still or crop that you look at yourself, then the narrow check (node tools/v2/screens_check.mjs with its switch for the part you touched, on fold_open). At the end, one at a time, exact results: node tools/v2/screens_check.mjs on fold_open and then on phone2 (full); node tools/v2/ui_check.mjs; node tools/v2/p0_entry_check.mjs; node tools/v2/story_check.mjs; python3 tools/fonts/build_fonts.py --check; bash -n tools/v2/release/pre_chain.sh. A picture /tmp/claude-0/v2/polish14/before_after.png: the pause panel opened in a banner's seconds before and after, the empty book, the two icons at game size before and after, and the closing banner if you did it — about 1600 px wide, one Korean caption line each (a font with Hangul: /usr/share/fonts/truetype/wqy/wqy-zenhei.ttc). Say plainly what you did not do.
`

phase('Build')
const built = await agent(BUILD, { label: 'POLISH', phase: 'Build' })

const VERIFY = COMMON + `
YOUR LANE: POLISH-VERIFY — check the POLISH lane's work with your own eyes and runs. You may make small, safe fixes in the POLISH lane's files; anything large goes in the report. Progress log: /tmp/claude-0/v2/polish14verify_progress.md. Captures: /tmp/claude-0/v2/polish14verify/. Time box: 15 minutes.

The POLISH lane's report (null means the lane died — read /tmp/claude-0/v2/polish14_progress.md and the tree instead):
${String(built).slice(0, 9000)}

Do not trust the report. Do, one at a time:
1. What changed: git diff against the commit the lane started from, for src/v2/ui/, tools/v2/release/pre_chain.sh and anything else it touched — is every change one of the five items, small, and free of anything that changes a save, the story's order or the rules? Did it touch a file of the other lane?
2. Your own stills on fold_open and phone2: the pause panel opened 0.3 s, 1 s and 2 s after entering an area (no banner through it; what the banner does after the panel closes), the same with the book and the bag opened from the panel; a story banner if you can raise one. The empty book on a fresh save. The two icons at game size. Look at each still.
3. Re-run, exact results: node tools/v2/screens_check.mjs on fold_open and then phone2; node tools/v2/ui_check.mjs; node tools/v2/p0_entry_check.mjs; node tools/v2/story_check.mjs; bash -n tools/v2/release/pre_chain.sh; and read the chain's new steps: would each fail the chain exactly when its tool fails (run one of them by itself and check the exit code and the line the chain writes)?
4. If the lane changed the ending's closing banner: the ending played once from a bot save (/tmp/claude-0/v2/screensverify/chapter/saves, copy into your folder) to the card — the banner seen for its time, the card after it, the book after the card, the chooser; nothing else in the ending's order moved.
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL), exact results, what you fixed, what is left, and one Korean sentence for the owner.
`
phase('Verify')
const verdict = await agent(VERIFY, { label: 'POLISH-VERIFY', phase: 'Verify' })
return { polish: built, verdict }
