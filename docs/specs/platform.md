# Platform spec — turntable, touch, controller, fonts, delivery, "optimized everywhere"

Covers user requests **6** (rotate the hero in the inventory/menu to see front and back), **7** (mobile touch optimization), **8** (controller support), **9** (blood-themed fonts, high level only), **12** (Netlify + APK delivery) and **13** (optimized on every device).
Status: audit plus design. Every finding below was reproduced in headless Chromium 141 (`/opt/pw-browsers/chromium-1194`) against the working tree on 2026-09-26.
Throwaway harnesses live in `tools/.proto_specPlatform/*.mjs` (git-ignored). WP-10 promotes them to `tools/qa/`. Screenshots are in `/tmp/claude-0/proto/specPlatform/`.

Other agents are working on these areas right now, and this spec only states the contracts and acceptance criteria for them:
- **Hero renderer** (`src/render/hero.js`, `hero_parts.js`): request 1 plus the turntable view angle. The contract is in §7.3.
- **Fonts** (`assets/fonts/*`, the `@fonts` block in `css/style.css`, the font parts of `src/core/ui.js`, `tools/fonts/*`). See §8.
- **APK pipeline** (`android/**`, `tools/apk/**`, `tools/android/*`). See §9.4.
- **Accounts and cloud save** (`netlify/**`). This only matters for the deploy config (§9.2).
- `src/scenes/stage.js` and `src/scenes/overlays.js` are also being edited by the gameplay, QA and ult cut-in work. §11 marks the small edits needed there as *coordinated*.
- `src/core/game.js` received a toast-position change (`toastX`/`toastUp`) from the town/world work during this audit, and `src/scenes/town/hub.js` is being edited under `docs/specs/world2.md`. WP-3 and WP-7 must rebase on those edits, not overwrite them.

---

## 0. Executive summary (top 12)

| # | Sev | Finding | Fix (section) |
|---|---|---|---|
| P-01 | **High** | Menu lists cannot be scrolled by **touch drag or mouse wheel**: `Scroller.ensure()` runs every render and snaps the list back to the selected row. On the inventory tab a drag reached y=240 and then settled at **4**. Wheeling 1000 px moved the list **56 px**. The bestiary, equip, docs and quests tabs behave the same way. | §5.6 |
| P-08 | **Critical (deploy)** | `tools/android/release.keystore` and `keystore.properties` (the signing key and its password) are in the working tree. A `netlify deploy --dir .` would publish them. | §9.1: publish only `dist/web` from an allowlist. |
| P-02 | High | The canvas ignores safe areas. With iPhone-like insets (47/47/0/21) the HUD portrait, skill slots, "페이지 1/2", score and gold, and the menu close and tab arrows all sit under the notch or rounded corners. Only the DOM pad respects `env()`. | §6.1 |
| P-03 | High | Text is illegible on phones: **384** canvas `text()` calls use ≤13 logical px. That renders at **6.0–8.7 CSS px** on 360–390 px tall screens (canvas scale 0.667–0.722). | §6.2 UI scale |
| P-04 | High | Tap targets on phones (740×360) are below 32 CSS px: pause rows 29, options rows 27, ◀▶ 32×27, menu tab arrows 25×31, bestiary rows 21, quest rows 24, skill rows 29, arcade 29×25, highscore rows 29. | §6.3 |
| P-05 | High | Controller users only ever see keyboard prompts ("Z/Enter 결정 X 뒤로", keycaps Q/E/Z/X, HUD "S"/"D"/"Q·E 페이지"). | §4.5 glyphs |
| P-06 | High | On a phone or tablet the virtual pad stays on screen while a controller is used, because `touchMode` never turns off. | §3 input modes |
| P-07 | High | The skill page swap (`swap`) has **no controller binding**. The `map` action (Tab/M/SELECT) **does nothing**, although the controls guide says "지도". L3, R3 and the right stick are unused. B means attack in gameplay and cancel in menus. | §4.2 |
| P-09 | High | Mobile cold load (uncompressed, cache off): **slow 4G 22.6 s** to first frame, fast 4G 4.3 s. That is 164 requests and 4.6 MB, with an ES-module import depth of **20** and no progress indicator. | §6.7, §9 |
| P-10 | High | The service worker is network-first for everything, uses a single constant cache name and has no precache. It grows without bound (duplicates per `?v=`), can mix versions offline, and **would cache `/api/*` GET responses** (private save data) once accounts land. | §9.3 |
| P-11 | Medium | There is no pixel budget. At `high` on a 1080p@2x laptop the backing store is **3840×2160**. The menu equip tab then costs **172 ms/frame** (software raster) and canvases hold 42.5 MB. | §6.4 |
| P-12 | Medium | 90/120 Hz screens render every rAF even when no tick ran, which doubles GPU and battery cost for identical frames. | §6.5 |

The full list (35 items) is in §2.

What already works (verified): all gameplay actions on a standard-mapping pad (A jump, X/B attack, LT dash, Y sub, LB/RB skills, START pause, stick and D-pad movement, QCF command with the stick). The pad drives every menu tested: title, pause, all 9 menu tabs (LB/RB tabs, D-pad, A/B), equip list, options, shop, smith, church, quest board, party, dialogue (A advance, START skip), inn and minigame entry. The touch pad respects `env()` safe areas. Portrait shows the rotate overlay and auto-pauses. Audio unlocks on `touchend/click/pointerup/keydown`. Lighting is half-res with sprite lights, tiles are chunk-cached, and the world draws with low smoothing. The PWA manifest parses with no errors. Zero page errors across 6 viewports × 8 scene groups (48 runs).

---

## 1. Test matrix and measurements

### 1.1 Viewports

| id | CSS viewport | DPR | touch | default quality | canvas CSS | backing store | canvas scale (CSS px per logical px) |
|---|---|---|---|---|---|---|---|
| phone1 | 844×390 | 3 | yes | medium | 844×389 | 1266×583 | 0.722 |
| phone2 | 740×360 | 3 | yes | medium | 740×360 | 1110×540 | 0.667 |
| tablet | 1024×768 (4:3) | 2 | yes | medium | 1024×576 (96 px letterbox top and bottom) | 1536×864 | 1.067 |
| desk | 1280×720 | 1 | no | high | 1280×720 | 1280×720 | 1.333 |
| fhd | 1920×1080 | 1 | no | high | 1920×1080 | 1920×1080 | 2.0 |
| fhd2x | 1920×1080 | 2 | no | high | 1920×1080 | **3840×2160** | 2.0 |
| ultra | 2560×1080 | 1 | no | high | 2560×1080 (viewW clamps to 1280, exact fit) | 2560×1080 | 2.0 |

Scenes captured per viewport: title (attract and menu), hub, stage s04 (play plus dialogue), boss s04, all 9 menu tabs (seeded save), shop, smith, church, questboard, dialogue, options, inn, worldmap. There were no page errors.

### 1.2 Touch pad geometry (phone1, CSS px)
The stick is 128×128 at (18,244), fixed. Buttons: attack and jump 67 px, dash/sub/S1/S2/ult 46 px, swap **34 px** (below the 44 minimum), pause and fullscreen 44 px. The gaps between neighbouring circles' boxes are as small as 6–7 px (attack↔dash, attack↔jump). Each button uses `setPointerCapture`, so a finger cannot roll from one button to the next. The cluster covers the right ~30 % of the play field, which is where enemies approach from. On the 4:3 tablet the pad overlaps gameplay even though 96 px bands above and below the canvas sit unused.

### 1.3 Frame cost (headless, software raster; relative numbers)
Measured as rAF deltas over 4 s. "JS/frame" is `game.render + game.tick` including synchronous software raster.

| profile | scene | backing | p50 frame | JS/frame |
|---|---|---|---|---|
| phone1, CPU ×4 | s05 idle, low | 844×389 | 50 ms | 11.6 ms |
| phone1, CPU ×4 | s05 idle, medium | 1266×583 | 83 ms | 12.3 ms |
| phone1, CPU ×4 | s05 + 12 enemies + bursts | 1266×583 | 117 ms | 21.1 ms |
| desk | s05 stress, high | 1280×720 | 33 ms | 4.0 ms |
| fhd2x | s05 idle, high | 3840×2160 | 183 ms | 6.6 ms |
| fhd2x | menu → equip, high | 3840×2160 | 217 ms | **172 ms** |

Frame time scales with **backing pixel count**, so fill rate dominates. The JS profiler shows the game's own JS below 5 % of samples. The rest is raster and compositing (`(program)`), plus `drawImage`. Takeaways: cap pixels (§6.4), don't render duplicate frames (§6.5), and keep big offscreen layers at bounded resolution (menu `Layer`, hero rim pass).

`game.autoQuality()` did downgrade high→medium on the throttled phone after about 8 s, as designed. It never upgrades and never runs on desktop.

### 1.4 Load (index.html → first frame, cache disabled, phone1 emulation)
| network | first frame (boot removed) | title bg ready | requests | bytes |
|---|---|---|---|---|
| slow 4G (1.6 Mbps, 150 ms RTT) | **22.6 s** | 25.1 s | 163 | 4.54 MB |
| fast 4G (9 Mbps, 40 ms) | 4.3 s | 4.7 s | 164 | 4.61 MB |
| Wi-Fi (50 Mbps, 10 ms) | 1.1 s | 1.2 s | 164 | 4.61 MB |

Composition: JS 3.48 MB raw / 1.04 MB gzip (150 modules, all statically reachable, import depth 20, one dynamic import); fonts 733 KB; webp 1.1 MB; png 150 KB. `tools/serve.mjs` does not compress, but Netlify will serve brotli automatically for JS, CSS and HTML.

### 1.5 Memory
- JS heap: 7–11 MB.
- Live canvases: 20–21. Pixel memory is 9.6 MB (desk), 11.5 MB (phone1) and **42.5 MB** (fhd2x, menu open).
- Decoded image cost: stage backgrounds are 2520×1005, about **10 MB** each decoded. CGs are 1912×999 (about 7.6 MB). Portraits are 800×1134 (about 3.6 MB). `assets` never evicts. On a phone at medium quality the backing store is only 583 px tall, so backgrounds are 1.7× oversampled.

### 1.6 Controller (fake standard pad via `Navigator.prototype.getGamepads` override)
- Stick X 0.30 → no movement. 0.42 → full-speed run (a digital threshold of 0.4 on the axis alone). There is no radial deadzone and no hysteresis.
- Triggers use the browser `pressed` flag, which is a low analog threshold, so a resting finger on RT can fire the ultimate.
- `gamepadconnected` and `gamepaddisconnected` are not handled: no toast, no pause on disconnect.
- `vibrationActuator` is never used.
- Nintendo Pro Controller (`057e`) and DualSense (`054c`) ids work positionally, but the prompts are still keyboard labels.
- Worldmap opened directly, then B, leaves the scene stack **empty** (black screen). Normal flow pushes the worldmap over the hub, so this only happens from the debug URL.
- In blackjack, B does not leave the table. Verify whether that is intended.

### 1.7 PWA and browser APIs
Chromium reports the manifest as installable (the only error was `in-incognito`, caused by the test context). The SW only registers on https, so it cannot be tested locally. MDN compat notes that shape the design:
- `Gamepad.vibrationActuator`: not in Android WebView, iOS Safari or Firefox.
- `navigator.vibrate`: not on iOS.
- The Fullscreen API is missing on iPhone (iPad only).
- Wake Lock is available on Chrome, Android WebView and iOS 18.4+.
- `structuredClone`, used in `save.js`, `stats.js` and `front/common.js`, sets the **baseline at Chrome/Edge 98, Safari 15.4, Firefox 94 and Android WebView 98**. Top-level `await` in `ui.js` needs Chrome 89 / Safari 15.

---

## 2. Issue list

Severity: **Critical** = data or security exposure; **High** = a core platform feature is broken or unusable for a class of users; **Medium** = clearly degraded experience; **Low** = polish or edge case. "WP" is the work package in §11.

| ID | Sev | Area | Evidence | Concrete fix | WP |
|---|---|---|---|---|---|
| P-01 | High | Menu scroll | `sc.ensure(sel…)` is called every render (tab_inventory:211, tab_equip:240, tab_bestiary:101, tab_docs:191, tab_quests:94). Drag 0→240 settles at 4; wheel +1000 gives +56. | Add `Scroller.follow(key)`: only call `ensure()` on the frame the **selection changed through nav input** (key or pad), never after pointer or wheel scrolling. Any `drag`/`wheel`/`vel` activity sets `sc.userScrolled = true` until the next nav move. Tabs call `if (this.sc.shouldFollow(this.i)) this.sc.ensure(...)`. | WP-4 |
| P-08 | Critical | Deploy | The keystore and password file live in `tools/android/` (git-ignored but present on disk). | The deploy only publishes `dist/web` built from an allowlist (§9.1). The build fails if any `*.keystore`, `*.jks`, `*.properties`, `.env*` or `tools/` path reaches `dist/web`. | WP-8 |
| P-02 | High | Safe area | Emulated insets 47/47/0/21: the HUD and menu corners fall under the cutout (screenshot `safearea_stage.png`). | `game.safe` is measured from an `env()` probe (plus the APK bridge). Default `safeArea:'fit'`: the canvas is laid out inside the safe rect and the insets are filled with `--bg`. Optional `'full'`: the canvas is full-bleed and HUD/overlay layout uses `game.safe` margins. | WP-3 |
| P-03 | High | Legibility | 384 `text()` calls at size ≤13 (9:7, 10:29, 11:94, 12:134, 13:120). On phone2, 12 px becomes 8.0 CSS px. | Per-scene **UI scale** `game.uiK` (§6.2), a text floor, and a "글자·UI 크기" option. | WP-3 (engine), WP-4/6/7 (opt-in) |
| P-04 | High | Tap sizes | Tap audit (§1): options 27 px, pause 29 px, and more. | Minimums from §6.3 plus hit slop; a `?debug=taps` overlay; QA fails below the minimums. | WP-4/6/7 |
| P-05 | High | Prompts | Keyboard labels are hard-coded in `hintRow`, `footer`, `hint`, `keycap`, the HUD and the options guide. | `src/core/prompts.js` glyph system (§4.5) driven by `input.mode` and the bindings. Legacy strings are auto-translated. | WP-1 (API), WP-4/6/7 (adoption), HUD (coordinated) |
| P-06 | High | Input mode | `setTouchMode(true)` is never reverted. On a phone with a controller the pad stays visible (`block/visible`). | `input.mode = 'kb' \| 'pad' \| 'touch'` is the last device used, with hysteresis (§3). The pad is visible only when `mode==='touch'`. | WP-1, WP-2, WP-3 |
| P-07 | High | Mapping | PADMAP: no `swap`; `map` is unused anywhere; B = attack and cancel; L3/R3/right stick unused. | New presets (§4.2). `map` becomes **quick menu (인벤토리)**. The right stick drives the menu turntable and scrolling. | WP-1, WP-3 |
| P-09 | High | Load | 22.6 s on slow 4G; depth-20 module waterfall; no progress. | Brotli (Netlify), build-time `<link rel=modulepreload>` for all modules, SW precache, `assets/lo/` variants, a real progress bar and a boot-error screen (§6.7). | WP-8, WP-3 |
| P-10 | High | SW | See `sw.js`. | Versioned precache SW (§9.3). Never touch `/api/`, non-GET or cross-origin requests. | WP-8 |
| P-11 | Medium | Resolution | fhd2x backing 3840×2160; equip menu 172 ms/frame; 42 MB of canvases. | A pixel budget per tier (§6.4). Menu `Layer` and the hero rim pass render at `min(scale, budgetScale)`. | WP-3, WP-5 |
| P-12 | Medium | 120 Hz | `loop()` renders on every rAF. | Skip `render()` when 0 ticks ran this rAF, unless `game.dirty` is set; `fpsCap` option (§6.5). | WP-3 |
| P-13 | Medium | Auto quality | Down-only, touch-only, needs 8 s below 40 fps. | Symmetric governor with hysteresis on all devices; `quality:'auto'` default plus a settings migration (§6.4). | WP-3 |
| P-14 | Medium | Stick | Axis-only 0.4/0.5 thresholds, no radial deadzone; `b.pressed` triggers. | Radial deadzone, 8-way sectors with hysteresis, trigger threshold 0.5/0.35 (§4.3). | WP-1 |
| P-15 | Medium | Hot-plug | No events handled. | Connect/disconnect toasts, switch mode, auto-pause on disconnect (§4.4). | WP-1 |
| P-16 | Medium | Haptics | Only an 8 ms phone buzz on pad buttons. | `haptics.js` with named effects on pad rumble and phone vibration (§4.6). | WP-1 |
| P-17 | Medium | Remap | No keyboard or pad remapping; Nintendo confirm position not handled. | Options → 조작: presets, confirm-button position, per-action remap for pad and keyboard (§4.7). | WP-1 (model), WP-6 (UI) |
| P-18 | Medium | Pad visibility | Five mechanisms with 54 call sites (`input.setTouchMode` class, `setPadOff` class, front `setPad` display, menu `hidePad` counter, games `padPush/padPop/padHide`). Title leaves `display:none`. | One owner: `game.syncPad()` computes visibility from `input.mode` plus top-scene flags (`showPad/hidePad`). Every helper becomes a no-op that sets a scene flag, then gets deleted (§5.1). | WP-3, then WP-4/6/7 |
| P-19 | Medium | Tap systems | Six hit-test systems (`TapZones`, `Hits`, `Gesture.tap`/`inRect`, `ListMenu.hit`, `ui.tapped`, town `hitRect`). | New code uses one registry, `ui.taps` (TapZones semantics plus slop plus min-size debug). Existing helpers delegate to it so the audit overlay sees everything (§6.3). | WP-3 (registry), WP-4/6/7 |
| P-20 | Medium | Touch pad | Fixed stick; 34 px swap; 6–7 px gaps; pointer capture blocks rolling; no cooldown/MP/ready feedback; covers the enemy approach side; tablet bands unused. | Rewrite as `src/core/touchpad.js` (§5.2–5.4). | WP-2 |
| P-21 | Medium | Fullscreen | The ⛶ button shows on iPhone, where it does nothing. There is no desktop fullscreen toggle and no "add to home screen" guidance. | §6.6. | WP-3 |
| P-22 | Medium | Sleep | The mobile web screen dims during controller play (no touches). | Screen Wake Lock during gameplay scenes (§6.6). The APK already sets `FLAG_KEEP_SCREEN_ON`. | WP-3 |
| P-23 | Low | Audio | Gamepad input is not a user activation, so pad-only web players never unlock audio. | Title hint "소리를 켜려면 화면을 클릭하거나 아무 키나 누르세요" while `audio.ctx.state!=='running'` and `input.mode==='pad'`. The APK is unaffected (`setMediaPlaybackRequiresUserGesture(false)`). | WP-3 |
| P-24 | Low | Hybrid devices | An iPad with a keyboard or a touch laptop stays in touch prompts forever. | Covered by `input.mode` (P-06). | WP-1 |
| P-25 | Low | Image memory | See §1.5. | `assets/lo/` at 60 % linear for bg, cg and portraits; a decoded-bytes LRU (§6.7). | WP-8 (generate), WP-3 (runtime) |
| P-26 | Low | Scene stack | `worldmap` via URL, then B, leaves zero scenes. | `game.pop()` on the last scene becomes `go('title')`. Worldmap cancel with no hub below uses `goSafe(game,'hub')`. | WP-3, WP-7 |
| P-27 | Low | PWA metadata | Manifest has no `id`, `scope`, maskable icon, `categories` or screenshots. iOS has no status-bar style or 180 px icon. SW is https-only, so it is untestable locally. | §9.3. Allow SW on `localhost` unless `?nosw`. | WP-3, WP-8 |
| P-28 | Low | Font swap | Menu `Layer` caches keep fallback-font text drawn before the web fonts loaded (only `TXT_CACHE` is cleared on `loadingdone`). | `ui.fontEpoch` increments on `document.fonts` `loadingdone`, and `Layer` keys include it. | fonts owner / WP-4 |
| P-29 | Low | Save code | Import and export need a textarea and the clipboard, which a pad cannot operate. | With a pad show "컨트롤러로는 코드를 입력할 수 없습니다. 키보드나 터치를 사용하세요" (cloud save covers the need). | WP-6 |
| P-30 | Low | Cursor | The mouse arrow stays visible over gameplay on desktop. | Hide after 2 s idle in `PAD_SCENES`. | WP-3 |
| P-31 | Medium | Commands on touch | Command techniques (↓↘→+공격) on a fixed digital stick (18 px deadzone, 28.8 px vertical threshold) are hard to do. | In touch mode, use 8-way sector stick directions and a 0.8 s command window. P2: long-press attack opens a technique radial (§5.5). | WP-2 (+ skills owner for the radial) |
| P-32 | Medium | APK safe area | The APK uses `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES`. WebView may report `env(safe-area-inset-*)=0`. | Native bridge injects the insets (§9.4). | WP-9 |
| P-33 | Low | APK rumble | WebView has no `vibrationActuator`. | Optional `BNAndroid.rumble(strong,weak,ms)` using the controller `InputDevice` vibrator (API 31+ `VibratorManager`). | WP-9 |
| P-34 | Low (decided) | APK ↔ API | `docs/ACCOUNTS.md` settles this: the APK's `AssetServer` proxies `/api/*` to the Netlify site, so every request is same-origin and there is no CORS. | Requirements for WP-9: the proxy forwards `Authorization` and the body unchanged, never caches, and returns the upstream status. Clients must use the absolute path `/api/...` (see ACCOUNTS.md). | WP-9 |
| P-35 | Low | Baseline | Older browsers fail silently (module error → black screen). | A classic-script gate in `index.html` checks `structuredClone`, module support and `Array.prototype.at`. If any is missing it shows a Korean message: "이 브라우저에서는 실행할 수 없습니다. Chrome·Safari·Edge 최신 버전을 사용해 주세요". APK: WebView ≥ 98 check (§9.4). | WP-3, WP-9 |

---

## 3. Input architecture (all devices)

`src/core/input.js` stays the single source of actions. The additions are below.

```js
input.mode            // 'kb' | 'pad' | 'touch' — last device that produced a *meaningful* input
input.padInfo         // { id, name, glyphs:'xbox'|'ps'|'nintendo'|'generic', standard:bool } | null
input.stickL / stickR // { x, y, mag } after radial deadzone (−1..1); stickR drives menu rotate/scroll
input.onMode(fn)      // subscribe to mode changes (prompts, touchpad, game.syncPad)
input.bindings        // resolved { key: {action:[codes]}, pad: {action:[btnIdx|axisSpec]} } from settings
input.touch           // API used by touchpad.js: set(action,on), axis(x,y), clear()
input.setPointerTransform(fn) // game.js converts pointer → UI space of the top scene (uiScale)
```

Mode switching rules. They prevent flicker on hybrid devices.
- `keydown` of a bound key, or a mouse `pointerdown`/`wheel` → `'kb'`.
- `pointerdown` with `pointerType==='touch'`/`'pen'`, or `touchstart` → `'touch'`.
- A pad button edge, or a stick past 0.5 → `'pad'`.
- The change is applied immediately. The touch pad hides after 250 ms in pad/kb mode and shows instantly in touch mode.
- `mode` is persisted in `sessionStorage` so a reload keeps the prompts.

Actions. The existing set stays, plus:
- `viewL`, `viewR`: turntable rotate. Keyboard `Comma` / `Period`; also the right stick X.
- `viewReset`: auto-spin toggle and reset. Keyboard `Slash`; pad R3.
- `map` is repurposed as **빠른 메뉴 (인벤토리)**: stage and hub open `menu` with `tab:'inventory'`. Keyboard `Tab`, `KeyI`, `KeyM`; pad SELECT/View/Share/−.

The **menu semantic layer** stays in `menu/common.js Nav`: confirm, cancel, prevTab (`skill1`), nextTab (`skill2`), alt (`sub`), alt2 (`dash`), swap. It now also resolves `confirm`/`cancel` from the `ctrlConfirm` setting (Nintendo positions, §4.2). The raw `keydown` listener for Q/E in `menu.js` is removed. `swap` (Q/E and the pad binding) is used instead, so remapping works.

---

## 4. Controller spec (request 8)

### 4.1 Detection and glyph sets
`gamepad.id` is lowercased and matched in this order:

| set | regex | examples |
|---|---|---|
| `ps` | `/054c\|sony\|playstation\|dualshock\|dualsense\|wireless controller/` | "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c …)" |
| `nintendo` | `/057e\|nintendo\|pro controller\|joy-con\|switch/` | Switch Pro, Joy-Con pair |
| `xbox` | `/045e\|xbox\|xinput\|microsoft\|28de/` (28de = Steam Deck/Steam Input) | Xbox 360/One/Series, Steam Deck |
| `generic` | otherwise. If `mapping==='standard'`, draw Xbox letters in neutral grey. | 8BitDo, no-name pads |

Settings `ctrlPrompts: 'auto'|'xbox'|'ps'|'nintendo'|'keyboard'` overrides the detection.

Filtering: ignore pads whose id matches `/uinput|fpc|gpio|keyboard|touchpad|mouse/` (some Android phones expose a fingerprint sensor as a "gamepad"), and pads with fewer than 4 buttons.

Display names used in toasts: `Xbox 컨트롤러`, `DualSense`, `DUALSHOCK 4` (id contains `05c4`/`09cc`), `Pro 컨트롤러`, `Joy-Con`, otherwise `게임패드`.

Glyph table. Positions are those of the standard mapping; S/E/W/N = face buttons.

| pos (index) | xbox | ps | nintendo | generic |
|---|---|---|---|---|
| S (0) | A green | ✕ blue | B | A grey |
| E (1) | B red | ○ red | A | B grey |
| W (2) | X blue | □ pink | Y | X grey |
| N (3) | Y yellow | △ teal | X | Y grey |
| 4 / 5 | LB / RB | L1 / R1 | L / R | L1 / R1 |
| 6 / 7 | LT / RT | L2 / R2 | ZL / ZR | L2 / R2 |
| 8 | View ⧉ | Create / Share | − | SELECT |
| 9 | Menu ≡ | Options | + | START |
| 10 / 11 | LS / RS | L3 / R3 | L-스틱 / R-스틱 누름 | L3 / R3 |
| 12–15 | D-pad arrows (drawn as a cross with the active arm lit) | | | |

The glyphs are drawn procedurally on canvas (no image assets). Face buttons are circles with a symbol. Shoulders and triggers are rounded pills, where the triggers have a trapezoid top. The keyboard uses the existing `keycap`.

### 4.2 Default mapping (standard layout)

Preset **아케이드 (default, recommended)**. It follows DNF-style action layouts.

| input | gameplay | menus |
|---|---|---|
| S (0) | 점프 `jump` | 결정 (xbox/ps/generic) |
| W (2) | 공격 `attack` (hold = 모아 공격) | — |
| E (1) | 대시·회피 `dash` | 취소 (xbox/ps/generic) |
| N (3) | 보조무기 `sub` | 보조 기능 (`alt`: 정렬·해제 …) |
| LB (4) | 스킬 1 `skill1` | 이전 탭 |
| RB (5) | 스킬 2 `skill2` | 다음 탭 |
| LT (6) | 스킬 페이지 `swap` | 보조 기능 2 (`alt2`) |
| RT (7) | 필살기 `ult` (analog ≥0.5) | — |
| SELECT (8) | 빠른 메뉴 → 인벤토리 `map` | — |
| START (9) | 일시정지 `menu` | 닫기 |
| L3 (10) | — | — |
| R3 (11) | — | 회전 초기화·자동 회전 `viewReset` |
| D-pad / left stick | 이동, ↑ 위 공격·상호작용, ↓ 웅크리기 | 이동 (repeat 0.30 s then 0.075 s) |
| right stick | — | X: 영웅 회전 (§7), Y: 목록 스크롤 (≤ 900 logical px/s) |

Preset **클래식** keeps today's layout for players who prefer it: S jump, E attack, W attack, N sub, LB/RB skills, LT dash, RT ult, SELECT swap, START pause.

**Confirm position.** `ctrlConfirm: 'auto'|'south'|'east'`. With `auto`, glyph set `nintendo` means *east* (the button labelled A) is confirm and *south* (B) is cancel **in menus only**. Gameplay bindings stay positional. Dialogue advances on confirm **and** on attack, as today.

Non-standard mapping (`mapping !== 'standard'`), e.g. Firefox on Linux, some Android HID pads:
- Use axes 0/1 for the left stick. D-pad comes from axes 6/7, or from a hat on axis 9, decoded as values in steps of 2/7: −1 up, −0.43 right, 0.14 down, 0.71 left, >1 neutral.
- On first connect show the toast "이 컨트롤러는 표준 배치가 아닙니다. 설정 › 조작에서 버튼을 지정해 주세요" and open the remap wizard from the options entry.
- Face buttons default to indices 0–3 until they are remapped.

### 4.3 Sticks and triggers
- **Radial deadzone.** `mag = hypot(x,y)`. If `mag < dz` (default `ctrlDeadzone = 0.20`, range 0.10–0.40) the output is 0. Otherwise the vector is rescaled so that `(mag − dz)/(0.95 − dz)` maps to 0..1 (clamped).
- **Digital directions** from the stick use an 8-way sector on the angle. The stick engages at rescaled mag ≥ 0.50 and releases below 0.35. Sectors are 45° wide with ±7.5° hysteresis, so they don't flicker between right and down-right. Up and down are set only in the N/S and diagonal sectors, so running with a slight upward tilt doesn't trigger up-attacks.
- `input.command()` history uses the sector code directly, which makes QCF on the stick reliable.
- **Triggers** use `value` with press ≥ 0.50 and release ≤ 0.35, not `pressed`.
- Poll once per rAF, not per fixed step. Cache the snapshot for the steps in that frame, which saves up to 5× `getGamepads()` calls.

### 4.4 Hot-plug
- On `gamepadconnected`: set `input.mode='pad'`, `input.padInfo`, and toast "🎮 {이름} 연결됨". The first time ever, also toast "설정 › 조작에서 버튼 배치를 바꿀 수 있어요".
- On `gamepaddisconnected` of the **last** pad: toast "컨트롤러 연결이 끊어졌습니다" in `#ffb0a0`. If the top scene is a gameplay scene, call `game.autoPause()`. If the device has touch, restore `mode='touch'`.
- Chrome and Safari expose a pad only after its first button press. That is fine; don't show a "press a button" prompt.
- Bus events for other modules: `bus.emit('inputDevice', { kind:'pad'|'kb'|'touch', name, glyphs })`.

### 4.5 Prompts and glyphs (`src/core/prompts.js`, new)
```js
bindingOf(action, mode = input.mode)            // → [{type:'key',code}|{type:'btn',index}|{type:'axis',...}|{type:'touch',id}]
drawGlyph(ctx, action, x, y, h = 18)            // → width; draws keycap / pad glyph / touch icon for the current mode
drawHints(ctx, items, x, y, { align, size })    // items: [[action | action[] | 'dpad'|'dpadH'|'dpadV'|'stickR', '라벨'], …] → end x
legacyKey(str)                                  // 'Z'→confirm, 'X'→cancel, 'Q'/'S'→prevTab, 'E'/'D'→nextTab, 'A'→alt, 'C'→alt2,
                                                // 'Enter'→confirm, 'Esc'/'ESC'→menu, '↑↓'→dpadV, '←→'→dpadH, '↑↓←→'→dpad
```
- `menu/common.hintRow` and `front/common.footer` call `legacyKey()` so existing hint arrays get pad glyphs without touching every call site. Call sites with free-form key text are migrated by their owners.
- Touch mode keeps the existing Korean tip strings (third element of hint tuples).
- HUD (coordinated edit in `src/render/hud.js`): the skill slot labels become `drawGlyph(ctx,'skill1',…)`, and the page hint becomes `[swap] 페이지 1/2`.
- The options controls guide (`options.guidePad`, `guideKeyboard`) is generated from `input.bindings`, so it can never contradict the real mapping.

### 4.6 Haptics (`src/core/haptics.js`, new)
`haptics.play(name)` fires the effects below. It uses the pad `vibrationActuator.playEffect('dual-rumble', …)` in pad mode, or `navigator.vibrate` in touch mode when `settings.vibration` is on. iOS and devices without support are silently ignored. Throttle: the same effect at most once per 60 ms, and a stronger effect cancels a weaker one. Call `reset()` on pause, menu and blur.

| name | pad strong / weak / ms | phone `vibrate` | trigger source |
|---|---|---|---|
| `hurt` | 0.55 / 0.25 / 140 | 30 | bus `playerHurt` |
| `hurtHeavy` (≥25 % max HP) | 0.9 / 0.5 / 260 | [40,30,60] | bus `playerHurt` with payload |
| `crit` | 0 / 0.45 / 60 | 12 | new bus `hitCrit` (combat owner) |
| `heavy` (charged/finisher) | 0.3 / 0.3 / 70 | 15 | new bus `hitHeavy` (combat owner) |
| `explode` / boss slam | 0.8 / 0.6 / 220 | 50 | new bus `shake` from `camera.shake(mag≥8)` (camera owner) |
| `ult` | two pulses 0.4 → 1.0 / 0.9, 400 total | [20,40,20] | new bus `ultStart` (skills/cut-in owner) |
| `bossDie` | 1.0 / 0.8 / 700 | [80,40,120] | bus `bossKilled` |
| `death` | 1.0 / 0.4 / 500 | 200 | bus `playerDied` |
| `levelUp` | 0 / 0.35 / 90 ×2 | [15,60,15] | bus `levelUp` |

The new bus events are one-line `bus.emit(...)` additions in files owned by the gameplay agents. They are listed in §11 as cross-package requests. `haptics.js` only subscribes, so no gameplay file depends on it.

Settings: `ctrlRumble` 0–1 (default 0.8) for the controller, and the existing `vibration` bool for the phone.

### 4.7 Remapping (Options → 조작)
Model (WP-1): `settings.ctrlPreset: 'arcade'|'classic'|'custom'`, `settings.ctrlMap: {action:[btnIndex…]} | null`, `settings.keyMap: {action:[code…]} | null`. `input.bindings` = preset ⊕ custom overrides.

Remap screen UI (WP-6):
- A list of the remappable actions, each with its current glyph(s): 점프, 공격, 대시, 보조무기, 스킬 1, 스킬 2, 스킬 페이지, 필살기, 빠른 메뉴.
- Select a row, and the screen shows "새 버튼을 누르세요… (3초, 취소: START)". It captures the next button edge (pad) or `e.code` (keyboard).
- If the new binding conflicts with another action, the two are swapped, with the toast "‘대시’와 바꿨습니다".
- **Not remappable:** START/Escape (pause), D-pad and arrow keys (movement), and menu confirm/cancel. Those follow `ctrlConfirm` so the menus can always be escaped.
- Footer buttons: 기본값 복원, 프리셋 (아케이드 / 클래식).

---

## 5. Touch spec (request 7)

### 5.1 One owner for pad visibility
`game.syncPad()` (WP-3) is the only code that shows or hides the virtual pad. The pad is visible iff `input.mode==='touch'`, the orientation is not portrait-locked, and the top scene says `showPad` or its name is in `PAD_SCENES`, and does not say `hidePad`.

`front/common.setPad`, `menu/common.hidePad`, `games/common.padPush/padPop/padHide` and `input.setPadOff` become thin shims that set `scene.hidePad`/`showPad` on the current top scene, then are deleted once the call sites move (54 of them today).

### 5.2 Layout (`src/core/touchpad.js`, new; replaces the DOM `#touch` block)
- **Rendering.** Use one transparent full-viewport event layer, `#tpad`, with `touch-action:none`. Draw the visuals on a separate full-viewport overlay canvas, `#tpadcv` (`pointer-events:none`, DPR-aware). This lets the buttons **show skill icons, cooldown sweeps, MP-insufficient dimming and an ult-ready pulse**, and lets the pad live outside the game canvas (tablet bands). Redraw only when the state changes, at most 30 Hz.
- **Size classes** by CSS viewport height *h*: **S** h < 400 (phones) ×1.0; **M** 400–699 ×1.1; **L** ≥ 700 (tablets) ×1.25. The user setting `touchScale` (0.8–1.3) multiplies these.
- **Default positions**, class S, in CSS px. Offsets are button centres measured from the safe-area bottom-right corner (`right`, `bottom`); Ø is the visual diameter.

| id | right | bottom | Ø |
|---|---|---|---|
| attack | 108 | 58 | 72 |
| jump | 36 | 118 | 68 |
| dash | 190 | 44 | 56 |
| sub | 118 | 146 | 54 |
| skill1 | 190 | 122 | 54 |
| skill2 | 50 | 200 | 54 |
| ult | 262 | 96 | 58 (kept apart to avoid accidental presses) |
| swap | 128 | 214 | **44** (never smaller) |

The minimum circle-to-circle gap in this layout is 19 px (checked pairwise). Pause Ⅱ and quick menu (가방 icon, new) are 44×44 at the top centre. The fullscreen ⛶ is shown only where it works (§6.6).
- **Stick.** `touchStick:'float'` is the default. A touch anywhere in the left 45 % of the screen, below the top 64 CSS px and outside the system buttons, spawns the base (Ø 120, knob Ø 52) at the finger. The base follows when the finger drags beyond its radius (re-anchoring). It fades out 0.3 s after release. `'fixed'` keeps today's placement. The output uses the §4.3 sector logic with a 10 px deadzone and engages at 45 % of the radius. Up and down only engage in the N/S and diagonal sectors.
- **Hit slop.** The hit radius is the visual radius + 10 px. Where two slop regions overlap, the nearest centre wins, so there are no dead gaps. **Slide/roll** (`touchSlide:true`): each pointerId tracks its current button, and moving into another button releases the old one and presses the new one. A finger inside the ≤ 12 px *overlap band* between attack and jump presses **both** (arcade plinking for jump-attacks).
- **Feedback.** Pressed buttons scale to 0.94 and brighten. Skill buttons show the icon with a cooldown conic sweep and a remaining-seconds number, and are grey when MP is insufficient. Ult shows a gauge ring, and at 100 % pulses gold with a shine sweep. Swap shows "1/2" or "2/2". Haptic tick: `vibrate(8)` on press.
- **Left-handed** (`touchLeftHanded`) mirrors the stick and buttons. **Opacity** uses the existing `touchOpacity`, and the pressed state is always ≥ 0.9.
- **Tablet 4:3.** When the canvas is letterboxed (spare vertical ≥ 120 CSS px), top-align the canvas in the safe rect and give the whole spare band to the bottom. The pad baseline sits in the band, so most of the cluster no longer covers gameplay.

### 5.3 Layout editor
Opened from Options → 터치 → "버튼 배치 편집". The editor itself is `touchpad.openEditor()`.
- Drag any button; drag its corner to resize (Ø 44–96).
- The live background is the current stage (dimmed).
- Buttons are 저장 / 기본값 / 취소, and all positions are stored in `settings.touchLayout = { id: { right, bottom, d } }`.
- Buttons snap to a 4 px grid and cannot overlap (they are pushed apart) or leave the safe rect.

### 5.4 Camera bias (request to the camera owner, coordinated)
In touch mode while the player faces right, bias the camera target by `+0.06·viewW`, so enemies appear before they reach the button cluster.

### 5.5 Techniques on touch (P-31)
- **P1:** in touch mode `input.command()` accepts 8-way sector codes from the stick and a `within` of 0.8 s instead of 0.6 s.
- **P2**, coordinated with the skills owner: a 350 ms long-press on attack opens a **technique radial** of up to 8 learned command techs (icons plus Korean names) around the finger. Sliding to one and releasing calls `input.queueCommand(techId)`, which the player consumes as if the command had been entered. Time slows to 30 % while the radial is open, never in arcade/boss-rush modes.

### 5.6 Menus by touch
- **P-01 fix (Scroller):** described in §2. After it lands, drag, fling, rubber-band and wheel must all keep their position.
- **Swipe tabs:** a horizontal swipe on the menu content area switches tab. It needs ≥ 70 logical px, less than 30° off horizontal and ≥ 400 px/s. It is ignored when the swipe starts inside a horizontal control or the turntable stage.
- **Long-press 450 ms** on an inventory, equip or skill item opens the item action menu directly (use / equip / lock / sell / compare), with `vibrate(10)`. The existing "tap again to act" still works.
- **Tab bar:** the Q/E arrows become 44×44 CSS minimum hit areas (slop). With UI scale (§6.2) the tab row reaches ≥ 44 CSS px tall on phones.
- **Back:** Android back and the APK back already map to Escape. On web in standalone PWA, `history.pushState` a sentinel in gameplay scenes so the browser back gesture means cancel/pause instead of leaving.

---

## 6. Screen, legibility and performance (requests 7 and 13)

### 6.1 Safe areas
- `platform.js` measures `env(safe-area-inset-*)` with a hidden probe element on resize and orientation change. It takes `max()` with the APK bridge values `window.__BN_INSETS` (§9.4). Result: `game.safe = {l,r,t,b}` in logical px.
- `safeArea:'fit'` (default): the canvas CSS box is fitted into the safe rect. The aspect clamp (960–1280 wide) is computed from the safe rect, and the insets show `--bg`. That needs zero per-scene work.
- `safeArea:'full'`: the canvas is full-bleed. The HUD anchors, the menu tab bar edge buttons, `backButton` and toasts offset by `game.safe`. Only the HUD and the shared helpers need this.

### 6.2 UI scale (text and targets)
- `game.cssScale = canvasCssHeight / 540`.
- `game.uiK = clamp(10 / (12·cssScale), 1, 1.35) × userFactor`. The `uiScale` setting is `'auto'` (userFactor 1) or 1.0 / 1.15 / 1.3 / 1.5 as an absolute k; the user factor caps at 1.5. Resulting auto values: phone1 → **1.15**, phone2 → **1.25**, tablet and desktop → 1.0.
- A scene opts in with `this.uiScale = true`. `game.render` wraps that scene's `render` in `ctx.scale(uiK, uiK)`, and the scene lays out with `game.uiW = viewW/uiK` and `game.uiH = viewH/uiK`. `input.pointer` is converted to UI space for the **top** scene when it opts in, via `input.setPointerTransform`.
- Minimum layout size: every opted-in scene must lay out without overflow at **720×400** UI px.
- Opt-in list: menu, pause, options (all pages), shop, smith, church, questboard, party, inn and all minigames, dialogue (box and choices), results, slots, difficulty, charselect, highscore/initials, arcade menus, worldmap, frontConfirm, saveCode.
- The HUD is not a `uiScale` scene (it keeps the §6.1 margins). **HUD text rule (touch): every combat HUD string is ≥ 11 CSS px** — the logical floor is `hudTextMin() = ceil(11 / cssScale)` (phone2 17, phone1 16, tablet 11; desktop and pad have no floor) and all HUD text sizes go through `hudPx(n) = max(n, floor)` (`render/hud_layout.js`). Widgets drawn scaled (companion widget, combo column) apply the floor in their own space (`ceil(floor / k)`). When the floor is ≥ 14 logical px the HUD uses the phone layout (`L.big`: larger vitals/hearts/companion boxes, the left cluster pushed down) and drops the class name (menus show it) and the word 'SCORE' (the number stays). Every touch layout also drops 'page n/2' and the skill-slot S1/S2 tags (the pad's ⇄ n/2, S1 and S2 buttons show them) and replaces the per-guardian AUTO pill with one 'AUTO' after the 수호 label. Long banner text shrinks to 75 % (never below the floor) and is then ellipsized. Checked by `tools/test_hud_layout.mjs` (CSS px of every fillText per HUD part). As built (2026-10-08): `hud.js` and `companion_hud.js` apply the same rule through `L.textMin` (max(n, floor)); `feel_hud.js` (awakening gauge — label and % inside a thicker bar on phones, ready text with short touch variants, combo column in its own scaled space, announcer sub-line), the game.js toasts (`hudPx(15)`) and the gimmick meters (`hudPx(12)`) use `hudPx`; all of them are in the test's `OWN_TEXT`, so a part below 11 CSS px on touch now fails instead of printing info. The HUD floor does not follow the 글자 크기 setting below.
- Text floor: in opted-in scenes `ui.text` renders `size = max(size, 11)`. Descriptive paragraphs use ≥ 13. These targets are UI px (13 UI px ≈ 10.8 CSS px on phone2).
- 글자 크기 (setting `textSize`, benchmark #7, 2026-10-08): in uiScale scenes the floor is `game.textFloor` (UI px) = max(11·k, target CSS px ÷ (uiK·cssScale)), rounded up to 0.5 (`TEXT_SIZES` in src/core/game.js), applied by `ui.font()`/`ui.text()` (`setTextFloor`/`textFloor()`). With '크게' every `font()` text is ≥ 12 CSS px and with '아주 크게' ≥ 13.5 CSS px on phones (phone2: 14.5 / 16.5 UI px; '보통' = the old 11 UI px floor). Screens with fixed row heights derive them from `ui.textFloor()` (e.g. `Math.max(rowH, Math.ceil(textFloor() * 1.25))`); text drawn with a raw `ctx.font` (canvas icons, card pips) bypasses the floor. Changing the floor bumps the font epoch so baked text caches re-bake. Measured by `node tools/qa/text_audit.mjs [--text-size large|xlarge] [--shots] [--update]` against `tools/qa/text_ratchet.json` (every screen, text baked into layers included).

### 6.3 Tap targets
Minimums in **CSS px**, computed from logical size × `uiK` × `cssScale`:

| element | minimum |
|---|---|
| primary buttons | 44 tall |
| list rows | 36 tall (40 preferred) |
| icon or arrow buttons | 44×44 hit area (visual can be smaller; add slop) |
| dense info rows (stat descriptions) | 28 tall |
| gap between adjacent targets | ≥ 4 px, or no overlap of slop |

- New shared registry `ui.taps`, with TapZones semantics plus `slop`, lives in `core/ui.js`. It is added as a **separate small export at the end of the file** to avoid colliding with the fonts owner. `Gesture.tap`, `ListMenu.hit`, `Hits.add` and `TapZones.add` forward their rects to it for the debug overlay.
- `?debug=taps` draws every registered rect: green OK, yellow below minimum, red below 32.
- The QA script (WP-10) fails on any red or yellow primary/list target at 740×360 and 844×390.

### 6.4 Resolution budget and quality governor
`settings.quality: 'auto'|'low'|'medium'|'high'`; `'auto'` is the default.

| tier | DPR cap | backing budget | particles (`fx.quality`) | hero rim | smoothing | bg asset |
|---|---|---|---|---|---|---|
| low | 1.0 | ≤ 1.0 MP | 0.5 | off | low | `lo/` |
| medium | 1.5 | ≤ 1.6 MP | 0.75 | on | medium | `lo/` if backing height ≤ 640 |
| high | 2.0 | ≤ 3.7 MP (2560×1440) | 1.0 | on | high for UI, low for world | full |

- `dpr = min(devicePixelRatio, cap, sqrt(budget / (cssW·cssH)))`. Example: fhd2x at high gives 2.56 MP, not 8.3 MP.
- Menu `Layer` and the `HeroView` offscreen passes clamp their scale to the same budget.
- **Governor** (auto only, gameplay scenes only, all devices): EMA of the rAF delta. If it stays above 22 ms (≈45 fps) for 5 s, drop one tier. If it stays below 14 ms for 20 s and the tier is below the start tier, raise one tier. At most one change per 10 s. Toast only on the first downgrade of a session: "화면이 버벅여 그래픽 품질을 '보통'으로 낮췄습니다". The start tier is `high` on desktop and `medium` on touch, or `low` if `deviceMemory ≤ 2` or `hardwareConcurrency ≤ 4`.
- **Settings migration:** `settingsVersion: 2`. A saved `quality` from version 1 was written by `detectQuality()`, not chosen by the player, so it resets to `'auto'`.

### 6.5 Frame pacing
- `fpsCap: 60` (default) or `0` (display rate). With 60, `loop()` calls `render()` only if at least one `tick()` ran in this rAF, or `game.dirty` is set (resize, fullscreen, font load). On 120 Hz this halves raster work. Simulation is already fixed 60 Hz, so nothing is lost.
- Pause the rAF work while `document.hidden` (already paused), and on `pagehide`.

### 6.6 Fullscreen, orientation, wake lock, cursor (`src/core/platform.js`, new)
- **Android Chrome and Firefox:** ⛶ calls `requestFullscreen({navigationUI:'hide'})`, then `screen.orientation.lock('landscape')`. `fullscreenAuto` (default on for touch) requests fullscreen on the **first tap** at the title screen.
- **iPhone Safari**, detected when `!document.fullscreenEnabled` and there is no `webkitRequestFullscreen` on `documentElement`: hide ⛶. Show once a title card "홈 화면에 추가하면 전체 화면으로 즐길 수 있어요 (공유 → 홈 화면에 추가). 홈 화면 앱은 기록을 따로 보관하니, 먼저 계정 저장이나 저장 코드로 옮겨 두세요", dismissible, stored in meta. (iOS keeps home-screen web app storage separate from Safari, so the card tells players to move their save first.)
- **iPad Safari 16.4+:** fullscreen supported.
- **Installed PWA** (`display-mode: fullscreen|standalone`) **or APK** (`__BN_APP`): hide ⛶. The APK already hides it.
- **Desktop:** Options → 화면 → 전체 화면 켜기/끄기, and `Alt+Enter` toggles. `F11` is left to the browser.
- **Portrait** on phones (min side < 600): keep the rotate overlay and auto-pause (works today). On tablets, allow portrait play letterboxed, with the touch pad in the large bottom band.
- **Wake lock:** `navigator.wakeLock.request('screen')` while a `PAD_SCENES` scene or a menu is on top and `keepAwake` is on. Re-acquire on `visibilitychange`, release on title and results.
- **Cursor:** `canvas.style.cursor='none'` after 2 s without mouse movement in gameplay scenes.
- **Audio hint:** P-23.
- **Boot gate:** P-35. The classic script runs **before** the module script.
- **Scene stack guard:** P-26.

### 6.7 Loading and assets
- **Progress.** `#boot` gets a progress bar and a percentage: "악마성의 문이 열리고 있습니다… 37%". Progress combines module count from a `PerformanceObserver` on resources under `src/` (out of the count stamped at build time), fonts and `bg/title`.
- **Boot errors.** A `window.onerror` or `unhandledrejection` before `game.start()` replaces the boot text with "불러오기에 실패했습니다. 새로고침해 주세요" plus a [새로고침] button. The details go to the console.
- **Module waterfall.** The build injects `<link rel="modulepreload" href=…>` for all 150 modules in topological order, which removes the depth-20 chain.
- **`assets/lo/`** is generated by `tools/assets/make_variants.py`. `bg/*`, `cg/*` and `portraits/*` get 60 % linear size at webp q72, which gives ~40 % of the bytes and 36 % of the decoded memory. `assets.url()` picks `lo/` per §6.4 and falls back to the full asset on error.
- **Decoded LRU.** `assets` tracks `w·h·4` per image, with a budget of 160 MB on touch and 400 MB on desktop. On scene change, release least-recently-used `bg/`/`cg/` images that are not in the current stage's list (`img.src=''`, delete the entry). `portraits/` and `ui/` are LRU-trimmed only when over budget.

---

## 7. Inventory turntable (request 6)

### 7.1 Where
- Status tab (large preview) — must.
- Equip tab (centre preview) — must.
- Class tab (preview) — must.
- Party scene and character select — optional P3, owned by their scene packages, using the same `HeroView` API.
- Inventory grid tab — optional P3: a small turntable preview in the detail panel when the selected item is equippable, showing the hero wearing it.

### 7.2 Interaction (WP-5, `menu/hero_view.js` + the three tabs)
State on `HeroView`: `yaw`, `yawVel`, `yawGoal` (for tweens and snaps), `autoSpin`, `idleT`, `userYaw`.

The angle convention is the one in §7.3: 0 = right profile (today's look), +π/2 = front, π = left profile, −π/2 = back.

- **Default:** `DEFAULT_YAW = +π/4` (3/4 front) once the renderer reports `HERO_VIEW` support; otherwise 0.
- **Drag (touch and mouse):** a pointer down inside the hero stage rect followed by horizontal movement rotates the hero, at 360° = 2.2 × stage width. A tap (movement < 10 px) still triggers the attack showcase, as today. On release the rotation continues with inertia, at the velocity of the last 80 ms, clamped to 12 rad/s and damped by `v *= 0.02^dt`. When |v| < 0.6 rad/s the hero snaps to the nearest step (§7.3 `steps`, default 8 × 45°) with a critically damped 0.25 s ease.
- **Wheel** over the stage rotates 22.5° per notch. Wheel elsewhere scrolls lists (P-01).
- **Keyboard:** hold `,` / `.` for 2.6 rad/s; `/` toggles auto-spin, and a double press resets.
- **Pad:** right stick X gives rate = stick × 3.2 rad/s (after the deadzone); R3 toggles auto-spin and resets.
- **Touch buttons:** under the stage, two 44 px round buttons ⟲ ⟳ (tap = 45° step, hold = continuous) and a small ▶/❚❚ auto-spin toggle. A double-tap on the hero resets.
- **Auto-spin** (`turntableAuto`, default on): after 6 s of no input on the tab, rotate at 0.6 rad/s (10.5 s per turn). Any input stops it and 6 s idle restarts it. It is disabled when `reduceMotion` is on.
- **Equip reveal:** when armour, head, cloak or an accessory is equipped, do one 360° spin (0.8 s, ease-out). It is skipped when `reduceMotion` is on.
- **Showcase attacks** are authored in profile. When a showcase starts, tween to the nearest profile (0 or π) in 0.18 s, play it, then tween back to `userYaw`.
- **Affordances:**
  - The pedestal rune ring rotates with `yaw`, so the spin reads as a turntable.
  - 8 direction dots sit around the pedestal's front ellipse, with the current one lit.
  - A label under the stage names the view: "앞모습 · 옆모습(오른쪽) · 뒷모습 · 옆모습(왼쪽)", and "3/4 앞모습" / "3/4 뒷모습" in between.
  - Hint row: touch "끌어서 돌려 보기"; keyboard `,` `.` 회전 · `/` 자동 회전; pad [RS] 회전 · [R3] 자동 회전.
- **Lighting:** the stage's window rim light stays fixed in the world, so the back view gets a stronger rim, which is free.
- Rotation is session-only and not saved.

### 7.3 Renderer contract (hero renderer owner — `src/render/hero.js`)
```js
drawHero(ctx, p, world, opts)
  opts.yaw?: number   // radians, any value (normalised internally)
                      // undefined → legacy side-view path, BIT-IDENTICAL to today (gameplay, NPCs, galleries)
                      // defined   → p.facing is ignored; view by yaw (0 right profile, +π/2 front, π left, −π/2 back)
export const HERO_VIEW = { continuous: boolean, steps: number } // e.g. { continuous:false, steps:8 }
```
Required behaviour when `opts.yaw` is defined:
- **Skeleton:** keep the current side-view pose and IK. Give joints a lateral offset *w*: the near side is + (the right side of the character faces the camera at yaw 0), hips ±hip half-width, shoulders ±shoulder half-width. Project to screen `X = u·cos(yaw) − w·sin(yaw)` and depth `d = u·sin(yaw) + w·cos(yaw)`, where *u* is today's forward x. Draw limb layers in **depth order**.
- **Torso and head** are width-interpolated ellipses. Front details (buttons, belt buckle, chest armour emblem, tabard, sash knot) are drawn only when `sin(yaw) > 0`, with alpha ∝ `sin`. Back details are drawn only when `sin(yaw) < 0`, **covering** the body: the cape and mantle back, quiver/pack, wing roots, the back of a hood, long hair mass.
- **Face:** eyes, brows, mouth and beard are projected from head-local points and visible only while their depth > 0. The back view shows the hair back-mass, or the helm/hood back.
- **Equipment** must read correctly in all 8 steps: all `headgear` values, `hairStyle` values, `cape` (spread behind the shoulders in front view, full in back view), `scarf`, `wings` (symmetric pair in front and back views), `halo`, `aura`, `armor` kinds, and weapons (main hand; whip coiled at the hip; greatsword/staff/gun/dagger held; enhancement glow).
- **Cloth** (cape, hair, veil and scarf chains) keeps simulating in side-local space and is projected with the same transform, so rotating never tears or explodes chains.
- **Poses** supported in any yaw: `idle`, `cast`, `charge`, `hurt`. `p.move` attacks may render as profile only; the UI tweens to profile first (§7.2).
- **If `continuous:false`:** the renderer draws the nearest of `steps` views, and between steps applies a horizontal squash cross-over (scaleX = |cos| of the fractional step, flipping at the midpoint) so there is no pop.
- **Performance:** at most 1.5× the side-view cost; the rim pass stays compatible.
- **Test page:** `tools/gallery_turntable.html` (WP-5) shows 6 heroes × {base, promoted, fully equipped} × 8 yaws, with a slider.

**Interim fallback** (WP-5 ships it so the UI can land before the renderer): if `HERO_VIEW` is undefined, `HeroView.draw` maps yaw to `facing = sign(cos(yaw))` and applies `ctx.scale(max(0.12, |cos(yaw)|), 1)` around the hero's centre. That gives a card-flip that at least shows both profiles. The label says "옆모습" only, and auto-spin is disabled.

---

## 8. Fonts (request 9, high level; the fonts owner implements)
Current direction (in the working tree): self-hosted woff2 in `assets/fonts/`. **Grenze Gotisch** (blackletter Latin) for logos and blood titles. **Hahmlet** (Korean display serif) for titles and names. **Noto Sans KR** for body text. **Cinzel** for numerals. Korean faces are subset to the game's glyphs plus a lazily loaded "Ext" file (the rest of KS X 1001 via `unicode-range`). A `blood` text style (drips, wet highlight, gold bevel) is cached in `TXT_CACHE`.

Platform requirements:
1. **Usage rules.** The blood/blackletter styles are for titles only:
   - Allowed: logo, stage title card, boss name intro, STAGE CLEAR / GAME OVER, the ult signature line, menu section headings.
   - Never used for body text, lists, numbers under 20 px, or anything below 18 logical px.
   - Body text stays Noto Sans KR.
2. **Offline, APK and privacy:** no third-party font requests (done: Google Fonts removed).
3. **Budget:** the fonts needed for the first frame stay ≤ 500 KB total. They are preloaded, as today, but only for the faces used on the title screen. The Ext files are fetched lazily.
4. **Coverage gate:** `tools/fonts/build_fonts.py --check` fails CI and the deploy build (§9.1) if any Hangul syllable used in `src/**` is missing from the base subsets. New dialogue from the other expansion work (new worlds, companions, cut-in lines) must trigger a subset rebuild.
5. **Cache invalidation:** P-28. The blood-text cache is keyed by `(text, style, size, scale)` and freed on resize (fonts owner). `Layer` caches include `ui.fontEpoch`.
6. **Caching:** font files are immutable once named. The build appends `?v=<hash8>` in the deployed CSS, or renames to `name.<hash8>.woff2`, so long-cache headers are safe (§9.2).

---

## 9. Delivery (request 12)

### 9.1 Web build (`tools/deploy/build_web.mjs`, new; zero npm dependencies)
1. Clean `dist/web/` and copy an **allowlist**: `index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `src/`, `assets/` (including `assets/lo/`), `robots.txt`, `downloads/` (the APK, §9.4).
2. **Deny check (fatal):** any path matching `/(^|\/)(tools|docs|android|node_modules|netlify|dist|\.git)(\/|$)/` or `/\.(keystore|jks|p12|properties|env)$/` fails the build. Also fail on files > 25 MB.
3. Compute `sha256` for every copied file. Write `dist/web/build.json`: `{version, buildHash, files:{path:{hash8,bytes}}, moduleCount}`.
4. Rewrite `dist/web/index.html`:
   - Inject `<link rel="modulepreload">` for every module reachable from `src/main.js`, deepest first.
   - Inject `<script>window.__BN_BUILD={version,hash,modules:N}</script>` as an **external** file `build-info.js` (CSP, §9.2).
   - Stamp the font and CSS URLs with `?v=hash8`.
5. Rewrite `dist/web/sw.js`: `CACHE='bn-<buildHash>'` and `PRECACHE=[…]` (core list, §9.3).
6. Run `tools/fonts/build_fonts.py --check` if present. Run `node tools/validate_maps.mjs`. Report compressed sizes (gzip and brotli via `zlib`).
7. **Sizes (fail thresholds).** First-frame critical path (html + css + all `src/` + title fonts + `bg/title` + `ui/*`), brotli: ≤ **1.6 MB**. `dist/web` total: ≤ 60 MB.

`tools/deploy/serve_dist.mjs` is a local static server with brotli and the §9.2 headers. It emulates Netlify for the acceptance tests.

### 9.2 Netlify configuration (`netlify.toml`, new)
```toml
[build]
  command = "node tools/deploy/build_web.mjs"
  publish = "dist/web"

[build.environment]
  NODE_VERSION = "20"

[functions]
  directory = "netlify/functions"     # accounts API (/api/*) — owned by the accounts package
  node_bundler = "esbuild"

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "gamepad=(self), fullscreen=(self), screen-wake-lock=(self), autoplay=(self), camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"

[[headers]]
  for = "/index.html"
  [headers.values]
    Cache-Control = "no-cache"
[[headers]]
  for = "/"
  [headers.values]
    Cache-Control = "no-cache"
[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"
    Service-Worker-Allowed = "/"
[[headers]]
  for = "/build.json"
  [headers.values]
    Cache-Control = "no-cache"
[[headers]]
  for = "/manifest.webmanifest"
  [headers.values]
    Content-Type = "application/manifest+json"
    Cache-Control = "public, max-age=3600"
[[headers]]
  for = "/src/*"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"   # ETag revalidation; SW makes repeat visits instant
[[headers]]
  for = "/css/*"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=604800, stale-while-revalidate=2592000"
[[headers]]
  for = "/assets/fonts/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"  # only with hashed URLs (§8.6)
[[headers]]
  for = "/downloads/*"
  [headers.values]
    Content-Type = "application/vnd.android.package-archive"
    Content-Disposition = "attachment"
    Cache-Control = "public, max-age=300"
[[headers]]
  for = "/api/*"
  [headers.values]
    Cache-Control = "no-store"
```
- **CSP prerequisite:** move the inline `<script>` in `index.html` (fullscreen button, gesture prevention, SW registration) into `src/core/platform.js`, imported by `main.js`. The boot gate (P-35) becomes `src/boot-gate.js`, a classic external script. The APK serves its own `head_inject.html` locally without these headers, so it is unaffected.
- **`_redirects`** (in `dist/web`, generated):
  ```
  /apk        /downloads/BloodNocturne.apk   302
  /download   /downloads/BloodNocturne.apk   302
  ```
  There is no SPA fallback (the game is a single `index.html`). `/api/*` is routed by the function's `config.path`, and no redirect may shadow it.
- **Deploy:** `netlify deploy --build --prod`, or a Git-connected build with the same command. **Never** `--dir .`.
- **Post-deploy smoke:** `node tools/deploy/smoke_deployed.mjs https://<site>` (§11 WP-8 acceptance).

### 9.3 Service worker (`sw.js`, rewritten; the build injects `CACHE` and `PRECACHE`)
- **install:** `cache.addAll(PRECACHE)`, where `PRECACHE` = `index.html`, `build-info.js`, `boot-gate.js`, `css/*`, **all** `src/**/*.js`, the base woff2 files, `ui/*`, `bg/title` (+ `lo/`), and the manifest. Then `skipWaiting()` **only** on a `{type:'SKIP_WAITING'}` message from the game, never automatically mid-session.
- **activate:** delete every cache not named `bn-<buildHash>` or `bn-assets-v1`; `clients.claim()`.
- **fetch:**
  - Ignore non-GET, cross-origin, `/api/`, `/downloads/` and `build.json`.
  - Navigations: network-first with a 3 s timeout, falling back to the cached `index.html`.
  - `/src/`, `/css/`, fonts: cache-first from the precache (the build hash guarantees consistency).
  - `/assets/**`: cache-first in `bn-assets-v1`, keyed **without** the query string after normalising `?v=`, capped at 250 entries (LRU trim on write).
- **Update UX:** the page listens for `registration.waiting`. When a new build is waiting, the title screen shows "새 버전이 준비되었습니다 [업데이트]"; the button sends `SKIP_WAITING` and reloads. During gameplay only a quiet toast shows, once: "새 버전은 타이틀 화면에서 적용됩니다".
- **Storage:** call `navigator.storage.persist()` after the first save. Show the one-time tip "브라우저 저장공간은 지워질 수 있어요. 계정 저장(클라우드)이나 저장 코드로 백업하세요", because iOS Safari evicts site data after 7 days of disuse for non-installed sites.
- **Localhost:** register the SW on `localhost` too, unless `?nosw` is present.
- **Manifest (WP-3):**
  - Add `"id":"./"`, `"scope":"./"`, `"categories":["games"]` and `"description"`.
  - Icons: 192, 512 and a **512 maskable** (safe zone 80 %).
  - Two landscape `screenshots` (1280×720 webp) for the richer install UI.
  - iOS: `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, `<link rel="apple-touch-icon" sizes="180x180" href="assets/ui/icon-180.png">`, and `apple-mobile-web-app-title` "블러드 녹턴".

### 9.4 Android APK (APK owner; pipeline exists)
Existing pipeline (verified, working tree):
- `tools/apk/build_apk.sh` builds without Gradle, using aapt2 + javac + d8 + zipalign + apksigner, and produces a v2+v3 signed `dist/BloodNocturne.apk`: **13.3 MB**, `com.bloodnocturne.game`, minSdk 24, targetSdk 34, versionCode derived from the commit time.
- WebView over `https://appassets.androidplatform.net` via `AssetServer`, with the service worker disabled in-app.
- Immersive fullscreen with cutout short edges, `FLAG_KEEP_SCREEN_ON` and `sensorLandscape`.
- Gamepad events are passed through to the Gamepad API and consumed so B is not treated as system back.
- Back sends Escape; at the title it asks to exit.
- `navigator.vibrate` goes through the `BNAndroid` bridge.

Requirements and acceptance items for this spec:
1. **WebView gate:** on start, read `WebView.getCurrentWebViewPackage().versionName`. If the major version is below **98**, show the native message "Android System WebView를 업데이트해 주세요 (Play 스토어)" with a button that opens its Play page, instead of a black screen.
2. **Safe-area bridge:** on every `WindowInsets` change, evaluate `window.__BN_INSETS={l,r,t,b}` (CSS px = px / density) from `getDisplayCutout()` and `systemBars`, then dispatch `window.dispatchEvent(new Event('bn-insets'))`. `platform.js` merges these with `env()` (§6.1).
3. **Controller rumble (optional P3):** `BNAndroid.rumble(strong, weak, ms)` uses the connected controller's `InputDevice.getVibratorManager()` (API 31+), else no-op. `haptics.js` uses it when `__BN_APP` is present.
4. **Web build parity:** the APK packs the **same `dist/web` output** (post-build: modulepreload, `lo/` assets, fonts), not the raw repo. `WEB_FILES` should point at `dist/web` so both deliverables are identical, with `sw.js` omitted.
5. **API origin:** P-34. The `/api/*` proxy in `AssetServer` (ACCOUNTS.md) must forward headers and body unchanged, never cache, and time out at 15 s with a JSON error.
6. **Distribution:**
   - Copy the signed APK to `dist/web/downloads/BloodNocturne.apk`, plus `BloodNocturne-<versionName>-<versionCode>.apk` and `latest.json` = `{versionName, versionCode, sha256, bytes, url}`.
   - The title/options screen (web only, Android UA) shows "안드로이드 앱(APK) 받기".
   - The APK itself can check `latest.json` and show "새 버전이 있습니다" (it installs through the browser; no self-update permission).
7. **Key custody:** the build must fail if the keystore is missing and it would otherwise generate a new key over an existing `keystore.properties` (already implemented). Document the backup location in `docs/` (not the password).

---

## 10. Settings schema additions (`DEFAULT_SETTINGS` in `src/core/save.js`, WP-3 adds all at once)
```js
settingsVersion: 2,
quality: 'auto',          // 'auto'|'low'|'medium'|'high'  (migration: v1 values → 'auto')
fpsCap: 60,               // 60 | 0
uiScale: 'auto',          // 'auto' | 1 | 1.15 | 1.3 | 1.5
safeArea: 'fit',          // 'fit' | 'full'
fullscreenAuto: true,     // touch: first title tap requests fullscreen (Android web)
keepAwake: true,
reduceMotion: false,      // default = the OS 'reduce motion' (prefers-reduced-motion) when nothing is saved; disables auto-spin/reveal spins,
                          // front lightning, and the title Ken Burns, logo bob and PRESS START breathing (and future camera sway)
ctrlPrompts: 'auto',      // 'auto'|'keyboard'|'xbox'|'ps'|'nintendo'
ctrlPreset: 'arcade',     // 'arcade'|'classic'|'custom'
ctrlMap: null,            // {action:[btnIndex…]}
keyMap: null,             // {action:[code…]}
ctrlConfirm: 'auto',      // 'auto'|'south'|'east'
ctrlDeadzone: 0.2,        // 0.1..0.4
ctrlRumble: 0.8,          // 0..1
touchScale: 1,            // 0.8..1.3
touchLayout: null,        // {id:{right,bottom,d}}
touchStick: 'float',      // 'float'|'fixed'
touchSlide: true,
touchLeftHanded: false,
turntableAuto: true,
// existing: musicVol, sfxVol, vibration, screenShake, showDamage, touchOpacity, autoSave, language
```
Options pages (WP-6), all labels in Korean:
- **소리:** 배경 음악, 효과음.
- **화면:** 그래픽 품질 (자동/낮음/보통/높음), 프레임 제한 (60/제한 없음), 글자·UI 크기 (자동/100/115/130/150 %), 노치 영역 (피하기/화면 가득), 화면 흔들림, 데미지 숫자, 전체 화면, 동작 줄이기.
- **조작:** 버튼 안내 아이콘, 컨트롤러 배치 (아케이드/클래식/사용자 지정), 결정 버튼 위치 (자동/아래/오른쪽), 컨트롤러 버튼 지정 ›, 키보드 키 지정 ›, 스틱 데드존, 컨트롤러 진동 세기, 조작 안내 ›.
- **터치:** 투명도, 크기, 스틱 방식 (따라다니기/고정), 버튼 사이 밀어 누르기, 왼손 모드, 버튼 배치 편집 ›, 진동.
- **기타:** 자동 저장, 화면 꺼짐 방지, 영웅 자동 회전, 기본값 복원.

Pages switch with the tab row (LB/RB, Q/E, touch). Each row has ◀▶ targets that are ≥ 44 CSS px after UI scale.

---

## 11. Implementation plan — parallel work packages

Ownership is strict: a WP edits only the files it lists. **Coordinated** edits are one-liners requested from the named owner. They are listed so the orchestrator can route them.

Phases:
- **Phase 1**, all parallel: WP-1, WP-2, WP-3, WP-5, WP-8, WP-10, plus the hero renderer turntable contract (§7.3).
- **Phase 2:** WP-4, WP-6, WP-7. They need the `prompts.js` API (WP-1) and `uiScale`/`taps`/`syncPad` (WP-3). They may start against the contracts in §3, §4.5 and §6, and merge after Phase 1.
- **Phase 3:** WP-9, then a full QA pass with the WP-10 suite on all 6 viewports.

### WP-1 Input core, controller, haptics, prompts
- **Owns:** `src/core/input.js`, `src/core/prompts.js` (new), `src/core/haptics.js` (new), `src/data/controls.js` (new: presets, glyph tables, action names in Korean, legacy key map).
- **Delivers:** §3 (modes, `stickL/R`, `onMode`, `bindings`, the `input.touch` API, the pointer transform hook), §4.1–4.7 model (detection, filtering, presets, confirm position, deadzone/sectors/triggers, non-standard fallback + hat, hot-plug with toasts via `game.toast` and `game.autoPause`, the `inputDevice` bus event), the prompts API (§4.5) and haptics (§4.6).
  - `init()` imports `./touchpad.js` dynamically and calls `initTouchPad(this)`. On failure it falls back to the legacy `setupTouchPad()`, so WP-1 and WP-2 merge in either order.
  - New actions `viewL`, `viewR`, `viewReset`; `map` gets `KeyI`.
  - `getGamepads()` is polled once per rAF (`input.pollFrame()`, called by game.js).
- **Coordinated requests:**
  - combat owner: `bus.emit('hitCrit')` and `bus.emit('hitHeavy')`
  - skills/cut-in owner: `bus.emit('ultStart')`
  - camera owner: `bus.emit('shake',{mag})` in `camera.shake`
  - HUD owner: `drawGlyph` for the skill slot labels and the page hint
- **Acceptance** (`tools/qa/platform_pad.mjs`):
  1. Xbox, PS (`054c`), Nintendo (`057e`) and generic ids each produce the right glyph set in the title footer (pixel-probe or `prompts.glyphFor` output).
  2. Stick 0.15 → no movement; 0.55 → run; release at 0.30 stops. The 45° diagonal does not flicker across 60 frames.
  3. RT 0.3 → no ult; 0.6 → ult.
  4. Every §4.2 row does what the table says in stage s03 (after skipping dialogue): jump vy<0, attack sets `move`, dash sets anim `dash`, sub decrements hearts, skill1/2 spend MP, swap changes the page, SELECT opens `menu` on inventory, START opens pause.
  5. `gamepaddisconnected` during stage pushes `pause` and toasts. Reconnect toasts.
  6. On a touch viewport a pad press hides the virtual pad within 300 ms, and a touch shows it again.
  7. `haptics` calls `playEffect` with the §4.6 magnitudes when `playerHurt` fires; `ctrlRumble:0` means no calls.
  8. The remap model swaps on conflict, and START/D-pad are rejected.

### WP-2 Virtual touch pad
- **Owns:** `src/core/touchpad.js` (new), `css/touchpad.css` (new, injected by touchpad.js).
- **Delivers:** §5.2–5.3, and §5.5 P1 (sector-based stick output for commands).
  - Draw overlay canvas `#tpadcv` plus event layer `#tpad`.
  - Remove the legacy `#touch` DOM at init; `#pauseBtn` and `#fsBtn` equivalents are drawn and handled here, including the new quick-menu (가방) button.
  - Skill icons and cooldown come from `world.player` and the skill data (read-only).
  - Visibility is controlled only through `setVisible(bool)`, called by `game.syncPad`.
  - Layout editor: `openEditor()` / `closeEditor()`.
- **Acceptance** (`tools/qa/platform_touch.mjs`, phone1/phone2/tablet):
  1. All buttons ≥ 44 CSS px; pairwise circle gap ≥ 12 px; everything inside the safe rect with emulated insets 47/47/0/21 (`Emulation.setSafeAreaInsetsOverride`).
  2. A CDP touch drag from attack to jump presses jump and releases attack (`touchSlide`); two simultaneous touches (stick + attack) both register.
  3. Floating stick: `touchStart` at (200,250) gives no movement; a move of +40 px gives `right` held.
  4. A skill on cooldown shows the sweep, checked by pixel probe on `#tpadcv`.
  5. On the tablet the cluster's top edge sits below the canvas bottom band start + 40 px.
  6. An editor drag persists to `settings.touchLayout` and survives a reload.

### WP-3 Platform core (viewport, scale, budget, pacing, fullscreen, boot)
- **Owns:** `src/core/game.js`, `src/core/platform.js` (new), `src/boot-gate.js` (new), `src/main.js`, `src/core/assets.js`, `src/core/save.js` (only `DEFAULT_SETTINGS`, `settingsVersion` migration, `detectQuality`), `index.html`, `css/style.css` (everything except the `@fonts` block), `manifest.webmanifest`, `assets/ui/*` (new icon-180 and maskable-512, via a PIL script in `tools/assets/`).
- **Also:** `src/core/ui.js`, **append-only** `export const taps` registry plus `fontEpoch` at the end of the file; coordinate with the fonts owner.
- **Delivers:**
  - §6.1–6.7: safe rect fit, `uiK`/`uiW`/`uiH` and scene opt-in rendering, pixel budget and governor, `fpsCap` render skipping, fullscreen, orientation, wake lock, cursor, audio hint.
  - Boot progress and boot error screen, boot gate, `game.pop` guard, `game.syncPad` as the single visibility owner (shims for the old helpers).
  - `lo/` asset selection and decoded LRU.
  - Settings keys (§10) with migration.
  - `?debug=taps` overlay.
  - SW registration and update prompt hooks (`platform.onUpdateReady(cb)` for the title).
- **Coordinated:** `src/scenes/stage.js` (currently edited by others): `if (input.pressed('map') && this.canPause()) this.game.push('menu',{world:w, tab:'inventory'})`. The hub equivalent goes in WP-7.
- **Acceptance** (`tools/qa/platform_view.mjs`):
  1. Viewports phone1/phone2/tablet/desk/fhd/fhd2x/ultra: backing pixels ≤ the tier budget (fhd2x high ≤ 3.7 MP); zero page errors in title, hub, stage and menu.
  2. Emulated insets 47/47/0/21 with `safeArea:'fit'`: canvas CSS x ≥ 47 and right ≤ innerWidth − 47. The HUD portrait bounding box lies inside the safe rect.
  3. `game.uiK` = 1.15 ± 0.02 on phone1 and 1.25 ± 0.02 on phone2. A scene with `uiScale` receives pointer coordinates in UI space (tap at a button centre triggers it).
  4. With `fpsCap:60` and a mocked 120 Hz rAF (rAF shim at 8.33 ms), the `render()` count per second is ≤ 61.
  5. Governor: injected 30 ms frames for 6 s drop one tier; injected 8 ms frames for 21 s raise it back; no more than one change per 10 s.
  6. `?scene=worldmap` + B leads to the title, not an empty stack.
  7. The boot gate with `delete window.structuredClone` (via init script) shows the Korean message.
  8. The P-18 shims leave the pad hidden on the title and visible in stage on touch.
  9. v1 settings `{quality:'medium'}` load as `'auto'`.

### WP-4 Menu system: touch, pad, scale
- **Owns:** `src/scenes/menu/menu.js`, `common.js`, `base.js`, `access.js`, `tab_inventory.js`, `tab_skills.js`, `tab_quests.js`, `tab_docs.js`, `tab_bestiary.js`, `tab_system.js`.
- **Delivers:**
  - P-01 `Scroller.follow` and `shouldFollow`.
  - `hintRow` via `prompts.drawHints` with `legacyKey`.
  - Q/E through the `swap` action; delete the raw keydown listener.
  - `uiScale=true` on the menu scene.
  - Tab arrows and close button ≥ 44 CSS hit area; row heights per §6.3 in touch mode.
  - Swipe tabs and long-press action menu (§5.6).
  - Right stick Y scrolling; `Layer` keys include `fontEpoch` and are clamped to the budget scale.
- **Acceptance** (`tools/qa/platform_menu.mjs`):
  1. The inventory, bestiary, docs and quests tabs keep their scroll position after a CDP touch drag of −160 CSS px (±8 px) and after 5 wheel notches (desktop). D-pad navigation still auto-follows the selection.
  2. The tap audit at 740×360 has no target below the §6.3 minimums.
  3. A fake pad with a PS id shows ✕/○ glyphs in the bottom bar.
  4. A swipe left on the content moves `ti` by +1.
  5. A long-press on an inventory item opens the action menu.

### WP-5 Turntable
- **Owns:** `src/scenes/menu/hero_view.js`, `tab_status.js`, `tab_equip.js`, `tab_class.js`, `tools/gallery_turntable.html` (new), `tools/qa/turntable.mjs` (new).
- **Delivers:** §7.1–7.2 and the §7.3 interim fallback. Glyph-based hints in these three tabs. Hero offscreen passes clamped to the budget (P-11).
- **Depends on:** the renderer contract (hero owner) for true front and back views.
- **Acceptance:**
  1. On the status, equip and class tabs a mouse drag of 1.1 × stage width rotates by 180° ± 10°. The fling settles on a 45° step within 1.2 s.
  2. Right stick X = 1 for 0.5 s rotates about 1.6 rad. `,` and `.` rotate. `/` toggles auto-spin. R3 resets.
  3. Auto-spin starts after 6 s idle and stops on any input. It is disabled when `reduceMotion` is on.
  4. A tap on the hero still plays the showcase, and yaw returns to the user's angle afterwards.
  5. The gallery screenshots 6 heroes × 3 looks × 8 yaws with zero page errors. With the renderer contract present: front (+π/2) and back (−π/2) views differ (image diff > 8 %) and are left-right symmetric within tolerance, and the cape covers the back in the −π/2 view.
  6. Menu equip at fhd2x high renders in ≤ 20 ms per frame on desktop (was 172).

### WP-6 Front-end scenes and options
- **Owns:** `src/scenes/title.js`, `src/scenes/front/*.js` (`options.js`, `common.js`, `slots.js`, `difficulty.js`, `charselect.js`, `story.js`, `ending.js`, `arcade.js`, `arcade_run.js`, `highscore.js`, `dialogs.js`).
- **Delivers:**
  - Options pages (§10) including the pad and keyboard remap screens and the touch editor entry.
  - Controls guides generated from bindings.
  - `footer`/`backButton`/`gbutton` with glyphs and ≥ 44 CSS sizes.
  - `uiScale` opt-in for all front scenes.
  - Title: update prompt, audio hint, add-to-home-screen card, "안드로이드 앱(APK) 받기" (web + Android UA).
  - Title PRESS START: a 78–100 % breathing alpha (static with `reduceMotion`), never a blink that fades out; a soft dark band behind it; placed between the logo and the hunter's head in `bg/title` (computed from the Ken Burns geometry, never over the hunter); touch hint ≥ 15 CSS px. The idle attract (after 10 s) draws below the PRESS block, above the © line and the bottom-right notice cards; where it does not fit there (phones with a notice card, e.g. the Android-web APK card) it draws in the PRESS slot instead and the PRESS block cross-fades with it, so text never overlaps. On phones the menu-state logo subtitle is drawn at ≥ 18 UI px (≈ 15 CSS).
  - Title accessibility: a left-edge "보기" tab (≥ 44 CSS px, press screen only) opens options on the 화면 page. Front-scene lightning reads `flashFx`/`reduceMotion` every frame (changes apply on return from options). With no saved settings (first run) the title holds lightning until the first input and skips the double flash.
  - P-29 message.
  - `setPad` calls are replaced by scene flags.
- **Acceptance:**
  1. Every option row can be changed with the pad only, keyboard only, and touch only (script per device).
  2. Remap A↔B then play: the jump happens on the new button.
  3. The guide page lists the real bindings for the arcade and classic presets.
  4. The tap audit passes at 740×360.
  5. An iPhone UA without the Fullscreen API has no ⛶ and shows the home-screen card once.

### WP-7 Town, games, pause, dialogue, results
- **Owns:** `src/scenes/town/*.js`, `src/scenes/games/*.js`, `src/scenes/pause.js`, `src/scenes/dialogue.js`, `src/scenes/results.js`.
- **Coordinated only:** `src/scenes/overlays.js`, owned by the cut-in work.
- **Delivers:**
  - Glyph hints, `uiScale` opt-in, and §6.3 sizes: pause rows ≥ 44 CSS, shop/smith/quest lists ≥ 36 CSS.
  - `padPush`/`padPop`/`padHide` replaced by scene flags.
  - Hub `map` → quick inventory.
  - Worldmap cancel guard (P-26).
  - Blackjack/minigame cancel behaviour made consistent: B/Esc opens "그만두기" confirm.
- **Acceptance:**
  1. Pad-only walkthrough: hub → shop buy/sell → smith enhance → church → quest board accept → party switch → inn → each minigame start and quit → worldmap select stage, with no pointer input.
  2. Touch-only walkthrough of the same.
  3. The tap audit passes.
  4. Zero page errors.

### WP-8 Web delivery (Netlify, SW, variants)
- **Owns:** `netlify.toml` (new), `sw.js`, `tools/deploy/build_web.mjs`, `tools/deploy/serve_dist.mjs`, `tools/deploy/smoke_deployed.mjs` (all new), `tools/assets/make_variants.py` (new), `assets/lo/**` (generated), `robots.txt` (new).
- **Delivers:** §9.1–9.3 and §6.7 generation. Publishes the APK into `dist/web/downloads/` when `dist/BloodNocturne.apk` exists.
- **Coordinated:** the accounts owner confirms `[functions]` settings and that `/api/*` sets `no-store`.
- **Acceptance:**
  1. `build_web.mjs` exits non-zero if a dummy `tools/android/x.keystore` is added to the allowlist dirs, and on missing font coverage.
  2. `dist/web` contains no `tools/`, `docs/`, `android/`, `netlify/` or `*.keystore`.
  3. With `serve_dist.mjs` (brotli + headers), slow-4G cold start to first frame ≤ **9 s** (was 22.6) and fast-4G ≤ 2.5 s. All modules are requested within 2 RTT of the HTML.
  4. After the first visit, set offline (`context.setOffline(true)`) and reload: the title renders and the hub runs; stage s01 plays with backgrounds cached or falling back.
  5. After a new build: the old cache is deleted; the waiting SW does not activate until `SKIP_WAITING`; no `/api/` request is ever served from Cache Storage (instrumented).
  6. `smoke_deployed.mjs <url>` checks the headers in §9.2, the SW registration, `manifest` installability (`Page.getInstallabilityErrors` empty in a non-incognito persistent context), `/apk` → 302 → APK with the right content type, and zero page errors on title, hub and stage.

### WP-9 APK follow-ups
- **Owns:** `android/**`, `tools/apk/**` (APK owner).
- **Delivers:** §9.4 items 1–6 (item 3 optional).
- **Acceptance:**
  1. `aapt2 dump badging` shows the package, minSdk 24, targetSdk ≥ 34, and only the INTERNET and VIBRATE permissions.
  2. `apksigner verify --print-certs` passes v2/v3 and `zipalign -c 4` passes.
  3. The APK's `assets/www` equals the `dist/web` file set minus `sw.js` and `downloads/`, compared by hash.
  4. `verify_apk.mjs` boots `assets/www` headless at 844×390 with `__BN_APP` and `__BN_INSETS={l:47,r:47,t:0,b:21}`: no page errors, canvas inside the insets, no ⛶.
  5. The APK is ≤ 20 MB.
  6. `latest.json` sha256 matches the file.

### WP-10 QA harness (enables every acceptance above)
- **Owns:** `tools/qa/platform_*.mjs` (new), `tools/qa/lib/*.mjs` (new: server start, viewports, fake gamepad init script, CDP touch helpers, tap-audit prototype patcher, safe-area override, network profiles).
- **Delivers:** promotes `tools/.proto_specPlatform/{sweep,gamepad,gamepad2,gamepad3,taps,scroll,wheel,perf,load,safearea,pwa}.mjs` into reusable, non-flaky tests with JSON reports under `/tmp/claude-0/qa/platform/`, plus `npm run qa:platform` (a `package.json` script line, coordinated).
- **Acceptance:** the suite runs in ≤ 12 min, is green on the fixed build, and red on the current tree for exactly P-01, P-02, P-03/P-04, P-05, P-06, P-07, P-11 and P-12.

### Cross-package contract checklist (for the orchestrator)
- `input.mode` / `onMode` / `touch` / `setPointerTransform` / `stickR` (WP-1) ↔ WP-2, WP-3, WP-4, WP-5, WP-6, WP-7.
- `prompts.drawGlyph` / `drawHints` / `legacyKey` (WP-1) ↔ WP-4, WP-5, WP-6, WP-7, HUD owner.
- `game.uiK` / `uiW` / `uiH` / `safe` / `syncPad` / `dirty` / `fpsCap`, `ui.taps`, `fontEpoch` (WP-3) ↔ WP-2, WP-4, WP-5, WP-6, WP-7.
- `HERO_VIEW` and `opts.yaw` (hero renderer owner) ↔ WP-5.
- Bus events `hitCrit`, `hitHeavy`, `ultStart`, `shake`, `inputDevice` (gameplay owners, WP-1).
- `window.__BN_INSETS` and the `bn-insets` event, `BNAndroid.rumble` (WP-9) ↔ WP-3, WP-1.
- `dist/web` as the single source for both Netlify and the APK (WP-8 ↔ WP-9).

---

## 12. Appendix — reproducing the audit
```
node tools/.proto_specPlatform/sweep.mjs [--vp phone1,phone2,tablet,desk,fhd,ultra] [--only title,hub,stage,boss,menu,town,inn,worldmap]
node tools/.proto_specPlatform/gamepad.mjs      # title/town/minigame flows with a fake Xbox pad
node tools/.proto_specPlatform/gamepad2.mjs     # gameplay mapping (DualSense id)
node tools/.proto_specPlatform/gamepad3.mjs     # menu navigation desktop + phone (Pro Controller id)
node tools/.proto_specPlatform/taps.mjs         # tap-target audit at 740×360
node tools/.proto_specPlatform/scroll2.mjs      # P-01 touch drag snap-back
node tools/.proto_specPlatform/wheel.mjs        # P-01 wheel snap-back
node tools/.proto_specPlatform/perf.mjs [phone1,desk,fhd2x]   # frame cost, heap, canvas memory, bytes
node tools/.proto_specPlatform/load.mjs         # slow4g/fast4g/wifi cold start
node tools/.proto_specPlatform/safearea.mjs     # CDP Emulation.setSafeAreaInsetsOverride 47/47/0/21
node tools/.proto_specPlatform/pwa.mjs          # installability + manifest errors
THROTTLE=4 node tools/.proto_specPlatform/prof.mjs "<url>" "<eval>" W H DPR   # CPU profile hot spots
```
Fake gamepad technique: `context.addInitScript` replaces `Navigator.prototype.getGamepads` with a function that returns a mutable pad object `{id, mapping:'standard', axes[4], buttons[17]{pressed,value}}`. The test drives it with `__padSet(i, v)` and `__padAxes(x, y, rx, ry)`, and dispatches `gamepadconnected` manually.
