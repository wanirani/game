# Adopting the v2 interface (src/v2/ui) in the game scene — exact patch for ENGINE / main session

UI-VERIFY lane, 2026-11-17. Not applied by this lane: `src/v2/game/` was being edited by ENGINE during the run
(`src/v2/game/hud.js` 22:51, `index.js` 22:43, engine deadline 23:45). The integration below was proven without
editing that folder: `index.html?scene=v2g&v2ui=1` (the opt-in switch ENGINE already built) —
`node tools/v2/ui_verify.mjs` drives it with real touch events.

## 1. Turn it on by default — `src/v2/game/seams.js` (one line)

```diff
-export const UI_DEFAULT = false;
+export const UI_DEFAULT = true;
```

`?v2ui=0` or `localStorage['bn.v2.ui'] = '0'` still goes back to the built-in HUD + v1 pad. If the UI module throws,
the scene already falls back by itself (`_hudFail`).

## 2. ESC / START must open the pause menu, not leave — `src/v2/game/index.js` (line 443 today)

```diff
-    if (input.pressed('menu') && g.registry.title) { if (g.registry.v2pick) g.go('v2pick', {}, { fade: true }); else g.go('title', {}, { fade: true }); return; }
+    if (input.pressed('menu') && g.registry.title && !this.hud.modal) {
+      const leave = () => { if (g.registry.v2pick) g.go('v2pick', {}, { fade: true }); else g.go('title', {}, { fade: true }); };
+      if (this.hud.openPause) this.hud.openPause({ onLeave: leave }); else { leave(); return; }
+    }
```

(`hud.modal === 'pause'` already freezes the rules two lines below; while the menu is open `menu`/`cancel` = resume is
handled inside the HUD.) Without this change the touch pause button works (the HUD opens its own menu), but a keyboard
or gamepad player leaves the area on ESC/START with no confirmation.

## 3. Feed the state the HUD can show (all optional — defaults are drawn when absent) — `_state()` in `src/v2/game/index.js`

```js
s.candles   = { lit: hero.hp / hpPerCandle, max: candleCount };          // else 5 candles = hp ratio
s.resonance = { value: sim.resonance ?? 0, cells: 3 };                   // else three empty cells
s.moon      = { phase: 0..1 };                                           // else no moon cell
s.boss      = bossEnemy ? { name, sub, hp, hpMax, stagger } : null;      // boss crest + bar
s.left      = enemiesLeftInThisFight;                                    // "· 남은 적 N" next to the section name
s.prompts   = [{ action: 'confirm', label: '살핀다', x, y, z }];           // tappable chips on touch
s.pad       = { skill: { mode: 'hook'|'call', cd }, bell: { mode: 'short'|'long', charge }, roll: { cd } };
```

Events: `hud.callout(x, y, z, '튕겨냄', 'parry')` on a parry, `'막음', 'guard'` on a block, `hud.banner('night')` after
crossing, `hud.toast(text, { kind: 'item' })` instead of `g.toast()`, `hud.showDialog({...})` or `scene.ui.dialog`.

## 4. Input names the pad sends (already what the scene reads)

attack → `attack` · jump → `jump` · roll → `dash` **and** `guard` together · skill → `skill1` · bell → `ult` ·
next target → `lock` · stick → `input.touch.axis` (= `input.touchStick`) plus `left/right/up/down`.
The scene does not read `skill1` / `ult` yet — those two buttons press, light up and do nothing until PLAY wires them.

## 5. Ship list — `tools/deploy/v2_ship.txt` (main session)

```
assets/v2/ui/gem/atlas.webp
```

plus every `assets/v2/portraits/<id>.webp` that a shipped dialogue names (the folder has: alberto banshee_queen edmund
edmund__smile elise elise__joy hadwin hadwin1 lotte marta rook sera sera__resolve). `atlas.json`, `assets/v2/ui/uigem/`
and `assets/v2/ui/uiink/` are tool/mock files — do not ship. The release build must be able to bundle `src/v2/ui/`
(it is reached through the literal `import('../ui/index.js')` in seams.js).

## 6. After flipping UI_DEFAULT — checks that drive the pad

`tools/v2/game_check.mjs` (ENGINE) plays its touch route through pad pointer events. Once the v2 pad is the default,
the v1 pad is hidden in v2g, so that route must either open the scene with `&v2ui=0` (keeps testing the fallback HUD
+ v1 pad) or read the button centres from `window.__v2.scene.hud.metrics().pad.buttons` (`{id, cx, cy, d}` in CSS px;
stick zone in `.pad.stick.zone`). `node tools/v2/ui_verify.mjs` already does the latter.

## 7. What was verified on `?scene=v2g&v2ui=1` (this lane, headless Chromium, real touch events)

See `/tmp/claude-0/v2/uiverify/verify_fold_run3.json`, `verify_phone_run1.json` and the logs next to them.
