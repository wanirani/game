export const meta = {
  name: 'v2-app-split',
  description: 'Split the 3D edition into its own Android app (Blood Nocturne 3D) and make the 2D app ship without 3D files, with build targets, APK variants and verification; then adversarial verify',
  phases: [
    { title: 'Build', detail: 'SPLIT lane: build targets, 3D app boot, APK variants, checks' },
    { title: 'Verify', detail: 'independent check of both builds and both APKs' },
  ],
}

const COMMON = `
You work on a Korean action game, 「블러드 녹턴」: HTML5 Canvas + WebGL, ES modules, shipped as a website and as an Android APK (a WebView shell built WITHOUT Gradle by tools/apk/build_apk.sh: aapt2 + javac + d8 + zipalign + apksigner). Repo: /home/user/game. No other lane is running; you are alone in the tree.

THE DECISION (the owner's, 2026-11-18): split the 3D edition (code name v2, src/v2/, assets/v2/) into its own Android app so that both apps fit the 95 MB APK budget:
- The existing app (2D edition, v1) keeps its package com.bloodnocturne.game, its name 「블러드 녹턴」 and everything it has, minus the 3D edition: no assets/v2 files, and the title menu row 「리빌드 시범」 (src/scenes/title.js, id 'v2') is not shown. With the 3D files gone, the APK packer (tools/apk/pack_web.py) should go back to the 'hi' asset tier (original 2D pictures) instead of 'lo' — today's combined build is forced to 'lo'.
- A new app 「블러드 녹턴 3D」: its own package (com.bloodnocturne.game3d), installable next to the 2D app, signed with the same release key, launcher label 「블러드 녹턴 3D」 (the icon may be the same picture with a small, clean "3D" mark baked by the existing icon tool, or the same icon if that is risky). It ships only what the 3D edition needs: the shell code it imports, fonts, the assets/v2 files listed in tools/deploy/v2_ship.txt, the sound files the 3D scenes actually request, the icons the APK checks require. It opens directly on the 3D chooser (scene 'v2pick', src/v2/chooser.js, whose first row is 「본 게임」 = scene v2g); there is no 2D title. The chooser's last row 「돌아가기」 must not lead to the 2D title in this app: hide it, or make it close the app through the existing Android bridge (read how the 2D app exits: src/core/ and android/.../MainActivity.java, BNAndroid.exitApp); Android back at the chooser behaves like the 2D app at its title (the existing exit dialog). Inside the 3D scenes, whatever today returns to the chooser keeps doing so.
- Saves: the two apps have separate storage by nature; nothing to migrate.
- The website (Netlify) is not deployed now; its default build keeps today's behaviour (everything) unless you have a strong reason, which you must state.

READ FIRST: tools/deploy/build_web.mjs (header and the v2 ship-list filtering: loadV2Ship / v2Held), tools/deploy/v2_ship.txt, tools/apk/build_apk.sh (header and every step), tools/apk/pack_web.py (header), tools/apk/verify_apk.mjs (the 81 checks the 2D APK must keep passing), tools/v2/dist_boot_check.mjs (opens 3D scenes from a built bundle and fails on any 4xx — your main tool for finding what the 3D app needs), src/main.js (how ?scene= picks the first scene), src/scenes/title.js (the 'v2' row), src/v2/chooser.js, docs/HANDOFF.md (search "APK 7" and "릴리스" for the release process), android/app/src/main/AndroidManifest.xml and res/values/strings.xml.

Hard rules:
- Never open, read, print, copy or commit tools/android/release.keystore or tools/android/keystore.properties, and never print a password or key value. Running tools/apk/build_apk.sh (which uses them internally, the established release process) is allowed. Before any git-related action run: git status --short | grep -iE "keystore|\\.properties|\\.env" must print nothing.
- No git commit/push/checkout/reset/stash/clean — the main session commits (an autosave script also commits every few minutes, so never leave the tree broken between steps). Read-only git commands are fine.
- Do not publish anything (no pushes to the apk branch, no deploys). Build outputs stay under dist/ (build_web.mjs refuses an --out outside dist/).
- Default behaviour must not change for anyone who runs the old commands: node tools/deploy/build_web.mjs with no new option and tools/apk/build_apk.sh with no new variable must produce what they produce today. New behaviour comes from explicit options (for example build_web.mjs --target v1|3d|all, default all, with --out dist/web3d for the 3D bundle; build_apk.sh variables such as APP_VARIANT=3d or APP_ID / APP_LABEL / APK_NAME / WEB_DIR). Keep the changes in src/ minimal and behind a build flag that only the new targets set (for example window.__BN_BUILD.target written into build-info.js by build_web.mjs): the 2D game with target all must behave exactly as today.
- Android package rename without touching Java packages: aapt2 link --rename-manifest-package with --custom-package com.bloodnocturne.game for R (verify the activity class names stay fully qualified in the built manifest); label and exit texts through a generated resource overlay or a patched copy of res in the build folder, never by editing android/app/src/main/res in place for the 3D variant. The badging check in build_apk.sh must check the right package for each variant.
- One headless browser at a time (4 cores; three container restarts today were suspected to come from too much load). Run long checks in the foreground of your own work.
- Never run tools/fonts/build_fonts.py without --check; every Korean string you add under src/ must pass python3 tools/fonts/build_fonts.py --check. Scripts importing playwright-core must live under /home/user/game/tools/.
Keep a progress log (path below), one line per step with UTC time (date -u). Your run may be cut off at any moment: small complete steps.
Final answer = your report (plain text, English, short Korean summary for the owner at the end).
`

const BUILD = COMMON + `
YOUR LANE: SPLIT. Progress log: /tmp/claude-0/v2/split_progress.md. Outputs and captures: /tmp/claude-0/v2/split/. Time box: 120 minutes from start.

Deliver, in priority order:
1. build_web.mjs targets. --target v1: no assets/v2 file shipped (whatever v2_ship.txt says), the 'v2' title row hidden through the build flag; the size report shows the 2D bundle. --target 3d: the 3D bundle — find what the 3D scenes need by building it and running node tools/v2/dist_boot_check.mjs --dir dist/web3d --scenes v2g,v2b,v2c,v2bench plus a walk into the real areas (tools/v2/game_walk.mjs can be pointed at a bundle? if not, add a --dir/--base option to it or a small new script that opens dist/web3d/index.html?scene=v2g&area=<id> for every area id in src/v2/world and fails on 4xx and page errors), and keep adding until nothing is missing; leave out v1 pictures, painted atlases, v1 music that no 3D scene requests, v1 cutscenes. Every check build_web.mjs runs (fonts, maps, budgets) must make sense per target — skip or adapt what is v1-specific for target 3d and say which. Write a ship report for each target (files, MB by folder).
2. The 3D app's boot: with target 3d the game starts on 'v2pick' (no 2D title, no account screens), the chooser's back row handled as described, the window title / web manifest name 「블러드 녹턴 3D」 where the bundle has one. The 2D target with the 'v2' row hidden must keep its menu navigation intact (keyboard, gamepad, touch row count — read how title.js lays out nine rows and make sure eight rows still lay out well on the phone and Fold presets).
3. build_apk.sh variant: APP_VARIANT=3d (or equivalent variables) builds dist/BloodNocturne3D.apk from dist/web3d with package com.bloodnocturne.game3d, label 「블러드 녹턴 3D」, its own sha256 file, the same signing step; versionCode by the same rule. verify_apk.mjs: a 3d profile that keeps every platform check that applies (signing, alignment, permissions, MIME table, sizes, safe area, bridge, no external requests, no 404 for code files) and replaces the 2D-game checks (title, stage, hub, account …) with 3D ones (chooser opens, 「본 게임」 opens v2g with the 3D hero, each real area opens, back at the chooser shows the exit dialog path, 0 page errors, 0 4xx). The 2D profile stays exactly as it is.
4. Prove it, on the final tree, one at a time, exact results:
   a. node tools/deploy/build_web.mjs (no options) still builds the combined bundle as before (compare the file list and sizes with dist/build_web_report.json from before your change — save a copy of it first);
   b. TMPDIR=/dev/shm node tools/deploy/build_web.mjs --target v1, then TMPDIR=/dev/shm tools/apk/build_apk.sh --verify → the 2D APK passes all its checks, report its asset tier (expected hi) and size;
   c. TMPDIR=/dev/shm node tools/deploy/build_web.mjs --target 3d --out dist/web3d, then the 3D APK build with --verify → passes the 3d profile; report size and what is inside by folder;
   d. node tools/smoke.mjs and node tools/v2/p0_entry_check.mjs on the dev tree (no build) still pass;
   e. python3 tools/fonts/build_fonts.py --check.
   Note: build_apk.sh writes to dist/BloodNocturne.apk — after step c rebuild in an order that leaves both APKs in dist/ (or make the variant write its own name), and leave dist/ holding the final 2D APK (dist/BloodNocturne.apk) and the final 3D APK (dist/BloodNocturne3D.apk) built from the final tree.
5. Docs: a short section in docs/RELEASE.md (or the file the release process lives in — find it) and in docs/HANDOFF.md under a line starting with "   - **앱 분리 (2D · 3D)**" giving the exact commands for each app and how to publish both to the apk branch (file names BloodNocturne-<versionName>-<versionCode>.apk and BloodNocturne3D-<versionName>-<versionCode>.apk; a latest.json entry for each — propose the shape, do not push).
`

phase('Build')
const built = await agent(BUILD, { label: 'SPLIT', phase: 'Build' })

const VERIFY = COMMON + `
YOUR LANE: SPLIT-VERIFY — adversarially verify the SPLIT lane's work. You may fix what you find (small, safe fixes; anything large goes in the report). Progress log: /tmp/claude-0/v2/splitverify_progress.md. Captures: /tmp/claude-0/v2/splitverify/. Time box: 50 minutes.

The SPLIT lane's report (null means the lane died — read /tmp/claude-0/v2/split_progress.md and the tree instead):
${String(built).slice(0, 14000)}

Do not trust the report. Do, one at a time:
1. git diff of everything the lane changed (read-only git): is the default behaviour of build_web.mjs and build_apk.sh unchanged? Is every src/ change behind the build flag? Is anything in android/app/src/main changed in place for the 3D variant (it must not be)?
2. Unpack both APKs from dist/ (unzip -l and aapt2 dump badging from the SDK build tools the script uses): package names, labels, versionCode, permissions, launcher activity fully qualified, signing certificate SHA-256 equal to tools/apk/release_cert.sha256 for both, no assets/v2 in the 2D APK, no v1 bg/cg/painted pictures in the 3D APK, sizes under 95 MB, asset tier of the 2D APK.
3. Run node tools/apk/verify_apk.mjs on each APK with its profile and report exact results. Then open the 3D bundle yourself in headless Chromium at the fold_open and phone2 presets (tools/qa/lib/viewports.mjs) as the APK emulation does: the first screen is the chooser, 「본 게임」 opens v2g, play ten seconds with touch on the pad, pause, back to the chooser, open every real area by address, 0 page errors, 0 4xx. Open the 2D bundle: title has no 「리빌드 시범」 row, every remaining row still works with keyboard, gamepad and touch on both presets, a stage starts.
4. Try to break it: a 3D scene asking for a file that only the 2D bundle has (grep src/v2 and the v2-reachable shell code for asset paths outside assets/v2 and check each is shipped in the 3D bundle); fonts in the 3D bundle cover every glyph the 3D scenes show (the font check is computed over all of src — say whether the 3D bundle ships the same font files); service worker / manifest names; the Android back key path.
Final report: verdict (PASS / PASS-WITH-FIXES / FAIL) with reasons and exact results, what you fixed, what is left, the exact release commands, and a 3–4 sentence Korean summary for the owner.
`
phase('Verify')
const verdict = await agent(VERIFY, { label: 'SPLIT-VERIFY', phase: 'Verify' })
return { split: built, verdict }
