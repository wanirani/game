export const meta = {
  name: 'v2-p1-ui',
  description: 'P1 interface: clear cut-glass HUD, touch buttons, dialogue and pause for the 3D edition (src/v2/ui) with dedicated icon art, then adversarial verify',
  phases: [
    { title: 'Build', detail: 'UI lane builds src/v2/ui + pad skin + icon art + test page' },
    { title: 'Verify', detail: 'adversarial check on fold/phone over the live game, owner sheet' },
  ],
}

const COMMON = `
You are one lane of a multi-lane build of the 3D edition of a Korean action game (HTML5 Canvas + WebGL, ES modules, no bundler in dev). Repo: /home/user/game. Work directly in that tree (other lanes work there at the same time: ENGINE in src/v2/game/, PLAY in src/v2/play/ — do not edit those).

READ FIRST (short): docs/v2/P1_CONTRACT.md (lane boundaries and rules — binding), docs/v2/README.md §2 (owner decisions), docs/v2/GDD.md §7 (the five buttons) and §9.2 (interface screens), docs/v2/UI_ROUND2.md (the two round-2 mock-ups and the review), docs/v2/ENGINE_API.md (the HUD seam the game scene offers — match it; if it is missing something you need, adapt on your side and append a request to /tmp/claude-0/v2/requests.md).

The owner (non-developer, plays on a Galaxy Z Fold unfolded, touch) said, in Korean:
- about a reference screenshot of a mobile hunting action game: "인터페이스 버튼은 이렇게 반투명? 배경이 보였으면 좋겠다!"
- about the first translucent mock-up: "너무 단순한 기호는 아니겠지? 너무 단순해. 그리고 반투명이지만 고급스러웠으면 좋겠어. 지금은 무슨 클로드 같아" (too simple, looks like an app; wants translucent AND luxurious)
- about round 2: accepted the recommendation = the cut-glass direction 「세공한 유리」 (tools/v2/ui_mock2/uigem/, assets/v2/ui/uigem/) as the base, with CLEARER glass (more of the scene showing through; the reviewer added ?glass=clear), grafting from the ink direction 「먹과 달빛」 (tools/v2/ui_mock2/uiink/): bold readable silhouettes, a small Korean name label under each button, brush-stroke damage numbers; and DEDICATED icon artwork (not simple geometric glyphs).
- overall: "배경, 캐릭터, 인터페이스 모두 3d 게임에 어울리게, 이질감 없게, 그리고 디테일이 있도록" and smoothness on the Fold matters more than any extra effect.

Hard rules (contract §4): no git commit/push/checkout/reset/stash/clean (the main session and an autosave script commit). Never read, print or touch tools/android/*.keystore or keystore.properties. Never pkill/killall; close only what you launched; one headless browser at a time (4 cores, software-rendered WebGL — frame times there say nothing about the device). Never run tools/fonts/build_fonts.py without --check; every Korean string you add under src/ or css/ (comments included) must pass python3 tools/fonts/build_fonts.py --check (it passes cleanly now — add no failing glyph; if a wanted word needs a missing glyph, choose another word and list it in the report). Scripts that import playwright-core must live under /home/user/game/tools/ (see tools/v2/proto_b_check.mjs for launch args, tools/serve.mjs, tools/qa/lib/viewports.mjs presets fold_open and phone2).
Keep a progress log (path given below), one line per step with UTC time (date -u). Your run may be cut off at any moment: never leave a file half-edited between steps; work in small working increments.
Final answer = your report (plain text, English, short Korean summary for the owner at the end): what you built, check results exactly as they came out, known problems, what the next lane must know, files changed, credits used.
`

const UI = COMMON + `
YOUR LANE: UI. You own src/v2/ui/, assets/v2/ui/gem/, css/v2ui.css (new, only if you need DOM styling), tools/v2/ui_*.{mjs,html}, docs/v2/UI_API.md. Progress log: /tmp/claude-0/v2/ui_progress.md. Time box: 110 minutes from start (stop adding features 20 minutes before the end).

GOAL: the real interface of the 3D edition — it must look like it belongs to a premium 3D action game, not like a web app and not like the ornate 2D-era metal buttons currently on screen (the v1 pad art) — and it must cost almost nothing per frame.

Deliver, in priority order:
1. docs/v2/UI_API.md, first version within 20 minutes: createHud(game, opts) → hud.update(dt, state), hud.draw(ctx, state), hud.resize(), hud.release(); the HudState shape (hero candles = health per GDD §8, resonance gauge cells, night label 'now'/'past', moon cell, lock target, boss bar, section/area name, prompts); functions to show a dialogue box, a toast/banner, the pause menu; how touch buttons map to input actions.
2. Touch controls for v2 scenes (GDD §7): left floating stick; right cluster of five buttons — 공격 (largest), 점프, 구르기/막기, 솜씨, 종 — plus a small "다음 적" button above attack and a small pause button; each with a dedicated icon and a small Korean label under it; pressed, held, cooldown and disabled states; clear glass with a fine cut rim and a soft inner highlight, the scene clearly visible through it. Find the cheapest robust way to do this on top of the v1 input layer (src/core/input.js, src/core/touchpad.js, css/touchpad.css: read how the pad is built, how scenes choose buttons — showPad, padHideButtons — and how touches become actions) WITHOUT changing how v1 scenes look or behave: e.g. a scene flag that switches the pad to a v2 skin and button set. You may add that flag-guarded path to src/core/touchpad.js and css (prefer a new css/v2ui.css loaded only when needed); run the v1 pad checks you can find under tools/qa after touching them and report results. Map the buttons to existing input action names where they exist (attack, jump, dash = roll, guard, lock; pick documented names for skill and bell and say which).
3. Canvas HUD drawn by hud.draw: candle health (three to sixteen candles, lit/unlit, flicker when hurt), resonance gauge (three to five cells), night indicator, lock-on marker around the target, boss name + bar, brush-stroke damage numbers and short callouts (튕겨냄 etc.), area title banner, the "오늘 밤이 달라졌다" banner, item pickup toast, button prompts for keyboard/gamepad. Text in the fonts the game already ships (css/style.css; the brush font BN Brush for numbers/callouts).
4. Dialogue box (speaker name, portrait from assets/v2/portraits/*.webp, text reveal, next prompt, two-choice variant) and the pause menu (resume, settings entry, leave), same glass language.
5. Dedicated icon art, one family, generated with the Higgsfield MCP tools (find them with ToolSearch; images with model gpt_image_2_5 only; cap 80 credits total; never name any game, studio, brand or artist in a prompt; use only our own earlier mock-ups as style references; record every job in tools/higgsfield/manifest_ui.json). Suggested approach: bright engraved-silver / frosted-crystal emblems on pure black, then turn luminance into alpha and pack one small atlas (assets/v2/ui/gem/, WebP, total under 600 KB). Icons needed: attack, jump, roll, guard, skill (whip hook), hunter call, bell (short ring / long ring variants), next target, pause, candle lit/unlit, resonance cell, moon phases, now/past night emblems, interact, plus dialogue ornaments. Look at every generated image yourself and reject weak ones. If a paid call is refused by the permission system, do NOT retry or work around it: write the exact calls (prompt, params) to /tmp/claude-0/v2/ui/gen_requests.json, draw careful vector placeholders in code, and say so at the top of your report.
6. Cost: no live backdrop blur over the WebGL canvas (backdrop-filter is a known stutter source in Android WebView) — get the glass look from translucent fills, gradients, rim light and pre-rendered sprites; cache static parts in offscreen canvases; allocate nothing per frame; measure draw time and report it.
7. Test page tools/v2/ui_view.html (+ tools/v2/ui_shot.mjs, tools/v2/ui_check.mjs): the HUD and every state over real screenshots of the 3D scenes (capture your own backdrops from index.html?scene=v2c, both a bright lamp-lit spot and a dark spot; legibility over both matters), at fold_open and phone2, with text size settings normal/large/xlarge (the game has that setting — see how tools/v2/p0_entry_check.mjs sets it). Checks: every button at least 44 CSS px, nothing outside the safe area, labels not clipped, no overlap with the stick zone, 0 page errors. Look at your captures as the owner would and fix what looks cheap, flat, cluttered or hard to read.
8. A live demo without touching other lanes' code: a tiny scene id is NOT available to you (scene registration belongs to the main session), so make the test page able to run the HUD over the live game in an iframe or by importing the module in the page — whichever is honest and cheap. List in your report exactly what the game scene must call to adopt the HUD (the integration is the verifier's and the ENGINE lane's job).
List every assets/v2/ file the interface loads at runtime (the release build ships only files listed in tools/deploy/v2_ship.txt, edited by the main session).
`

phase('Build')
const built = await agent(UI, { label: 'UI', phase: 'Build' })

phase('Verify')
const VERIFY = COMMON + `
YOUR LANE: UI-VERIFY — adversarially verify the interface lane's work and plug it into the game if the game scene is ready. You may edit src/v2/ui/, assets/v2/ui/gem/, css/v2ui.css, tools/v2/ui_* and the HUD seam files of the game scene only as far as adopting the HUD requires (src/v2/game/hud.js / seams.js and the few call sites in src/v2/game/index.js — first read /tmp/claude-0/v2/engine_progress.md and /tmp/claude-0/v2/coreverify_progress.md: if another lane is still actively editing src/v2/game/ right now, do NOT edit it; instead prove the integration in the test page and write the exact patch to /tmp/claude-0/v2/uiverify/adopt.patch.md). Progress log: /tmp/claude-0/v2/uiverify_progress.md. Time box: 50 minutes.

The UI lane's report (null means the lane died — read /tmp/claude-0/v2/ui_progress.md and the tree instead):
${String(built).slice(0, 16000)}

Do not trust the report. Do:
1. Run its checks and the v1 pad regressions it touched (tools/qa/…), node tools/v2/p0_entry_check.mjs, node tools/smoke.mjs, python3 tools/fonts/build_fonts.py --check. Report exact results.
2. With real touch input in headless Chromium at fold_open and phone2: press every button (tap, hold, slide off, two at once with the stick), check the actions arrive, check text sizes normal/large/xlarge, rotate/resize, safe-area insets, pause and dialogue flows. Try to break it: very long Korean names, 16 candles, boss bar plus banners at once, rapid damage numbers, scene exit and re-entry five times (DOM nodes, canvases, listeners, heap).
3. Look at captures over a bright and a dark game backdrop as the owner would, against the owner's words quoted above: does it still look like a simple app, or like the old ornate 2D buttons? Is the glass clear enough to see the scene? Are the icons one family and readable at a glance at real size? Are the Korean labels crisp? Fix what you can; say plainly what still looks weak.
4. Measure HUD cost per frame (time and allocations) and confirm there is no backdrop-filter or other per-frame blur.
5. Check v1 is unchanged: open a v1 stage (index.html?scene=stage&nosw or as the existing checks do) at fold_open and compare the pad with a capture from before the lane's changes if one exists in /tmp/claude-0/v2/ (or by reading the diff of src/core/touchpad.js and css/).
6. Owner sheet /tmp/claude-0/v2/owner_ui3.png (about 2000 px wide, Korean captions, honest): the new interface over the live 3D scene at Fold size (idle, mid-fight with damage numbers and lock-on, boss bar, dialogue, pause), a close-up row of the button icons at real size and 3×, and one before/after against the current ornate pad. One line on what is still weak.
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL) with reasons, defects fixed, defects left, numbers, the tools/deploy/v2_ship.txt additions needed, credits used by the lane (check tools/higgsfield/manifest_ui.json against the account transactions if you can), and a 3–4 sentence Korean summary for the owner.
`
const verdict = await agent(VERIFY, { label: 'UI-VERIFY', phase: 'Verify' })
return { ui: built, verdict }
