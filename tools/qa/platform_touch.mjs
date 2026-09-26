// Virtual touch pad suite — platform.md §11 WP-2 (acceptance 1–6), §5.2–5.5; MASTER_PLAN §1.4 touch layout (P-20, P-31).
//
//   node tools/qa/platform_touch.mjs [--only layout,slide,multi,stick,cooldown,band,editor] [--vp phone1,phone2,tablet] [--strict]
//   node tools/qa/platform_touch.mjs --layout      # only the layout matrix: 10 buttons incl. mount/guard at size classes S/M/L
//                                                  # and touchScale 0.8 / 1 / 1.3: gaps ≥ 12 px, ≥ 44 CSS px, inside the safe rect
// Button positions come from the canvas pad API (touchpad.buttons({all}) in CSS px; see lib/touch.mjs). Until PLAT-TOUCH
// lands, the checks measure the legacy DOM pad and are reported as pending.
// Report: /tmp/claude-0/qa/platform/platform_touch.json (platform_touch_layout.json with --layout)
import { Suite, parseArgs, fmt } from './lib/suite.mjs';
import { openEnv } from './lib/server.mjs';
import { NOTCH_INSETS } from './lib/viewports.mjs';
import { canvasBox } from './lib/safearea.mjs';
import { Touch, padLayout, pressButton, holdButton, stickHold, minGap, PAD_BUTTON_IDS } from './lib/touch.mjs';
import { prepPlayer } from './lib/play.mjs';

const args = parseArgs();
if (args.layout) { args.only = args.only || ['layout', 'matrix']; args.tag = 'layout'; }
else if (!args.only) args.only = ['layout', 'slide', 'multi', 'stick', 'cooldown', 'band', 'editor']; // the matrix runs with --layout
const suite = new Suite('platform_touch', args);
const env = await openEnv();
const PKG = 'PLAT-TOUCH';

/** Stage page on a touch viewport, first touch done (touch mode), player prepared. */
async function touchStage(vp, opts = {}) {
  const s = await env.page(vp, 'index.html?scene=stage&stage=s01', opts);
  await s.waitGame('!!g.world?.player');
  await s.wait(1500);
  await s.skipDialogue();
  await prepPlayer(s);
  const t = new Touch(s.cdp, s.page);
  const [W, H] = await s.eval(() => [innerWidth, innerHeight]);
  await t.tap(W * 0.5, H * 0.3, 50);
  await s.wait(350);
  return { s, t, W, H };
}
const inputState = (s, names) => s.eval((names) => Object.fromEntries(names.map((a) => [a, window.__game.input.down(a)])), names);

/** Layout check of one pad: every expected button present, ≥ 44 CSS px, gaps ≥ 12 px, inside the safe rect. */
function judgeLayout(L, W, H, insets, expect) {
  const b = L.buttons;
  const missing = expect.filter((id) => !b[id]);
  const small = Object.entries(b).filter(([id, v]) => (PAD_BUTTON_IDS.includes(id) || id === 'pause' || id === 'bag') && v.d < 43.5).map(([id, v]) => `${id} ${v.d.toFixed(0)}`);
  const circles = Object.fromEntries(Object.entries(b).filter(([id]) => PAD_BUTTON_IDS.includes(id)));
  const g = minGap(circles);
  const out = Object.entries(b).filter(([, v]) => v.x < insets.l - 0.5 || v.y < insets.t - 0.5 || v.x + v.w > W - insets.r + 0.5 || v.y + v.h > H - insets.b + 0.5).map(([id]) => id);
  const pass = !missing.length && !small.length && g.gap >= 12 && !out.length;
  return { pass, detail: `[${L.source}] ${Object.keys(b).length} buttons; missing ${fmt(missing)}; < 44 px ${fmt(small)}; min gap ${Number.isFinite(g.gap) ? g.gap.toFixed(1) : '-'} px (${g.a}–${g.b}); outside safe rect ${fmt(out)}` };
}

try {
  // ── 1. layout at the default settings with notch insets (phone1, phone2, tablet) ─────────────────
  await suite.group('layout', async () => {
    for (const vp of suite.vps(['phone1', 'phone2', 'tablet'])) {
      const { s, W, H } = await touchStage(vp, { insets: NOTCH_INSETS });
      const L = await padLayout(s.page, { all: true });
      await suite.check({ id: `layout.${vp}`, group: 'layout', issue: 'P-20', gate: PKG, title: '10 buttons + Ⅱ/가방: ≥ 44 CSS px, gaps ≥ 12 px, inside the safe rect (47/47/0/21)', session: s }, async () => judgeLayout(L, W, H, NOTCH_INSETS, [...PAD_BUTTON_IDS, 'pause', 'bag']));
      await suite.errors({ id: `layout.${vp}.errors`, group: 'layout' }, s);
      await s.close();
    }
  }, env);

  // ── --layout matrix: size classes S/M/L × touchScale 0.8 / 1 / 1.3 ──────────────────────────────
  await suite.group('matrix', async () => {
    const sizes = [
      ['S', { viewport: { width: 740, height: 360 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, NOTCH_INSETS],
      ['M', { viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, { l: 0, r: 0, t: 0, b: 0 }],
      ['L', { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, { l: 0, r: 0, t: 0, b: 0 }],
    ];
    for (const [cls, ctx, insets] of sizes) {
      for (const scale of [0.8, 1, 1.3]) {
        const s = await env.page(ctx, 'index.html?scene=stage&stage=s01', { insets, settings: { touchScale: scale } });
        await s.waitGame('!!g.world?.player');
        await s.wait(1500);
        const L = await padLayout(s.page, { all: true });
        await suite.check({ id: `matrix.${cls}.${scale}`, group: 'matrix', issue: 'P-20', gate: PKG, title: `size class ${cls}, touchScale ${scale}` }, async () => judgeLayout(L, ctx.viewport.width, ctx.viewport.height, insets, PAD_BUTTON_IDS));
        await suite.errors({ id: `matrix.${cls}.${scale}.errors`, group: 'matrix' }, s);
        await s.close();
      }
    }
  }, env);

  // ── 2a. slide/roll: a drag from attack to jump presses jump and releases attack; hit slop ─────────
  await suite.group('slide', async () => {
    const { s, t } = await touchStage('phone1');
    const L = await padLayout(s.page);
    const A = L.buttons.attack, J = L.buttons.jump;
    let r1 = null, r2 = null;
    if (A && J) {
      await t.down(31, A.cx, A.cy); await s.wait(80);
      r1 = await inputState(s, ['attack', 'jump']);
      for (let i = 1; i <= 6; i++) { await t.move(31, A.cx + ((J.cx - A.cx) * i) / 6, A.cy + ((J.cy - A.cy) * i) / 6); await s.wait(16); }
      await s.wait(80);
      r2 = await inputState(s, ['attack', 'jump']);
      await t.up(31); await s.wait(80);
    }
    await suite.check({ id: 'slide.attack_to_jump', group: 'slide', issue: 'P-20', gate: PKG, title: 'touchSlide: finger rolls from attack to jump', session: s }, async () => ({ pass: !!r1?.attack && !!r2?.jump && !r2?.attack, detail: A && J ? `on attack ${fmt(r1)} → on jump ${fmt(r2)} [${L.source}]` : `buttons not found [${L.source}]` }));
    // slop: 6 px outside the visual circle, on the side away from other buttons, still presses attack
    let r3 = null;
    if (A) { await t.down(32, A.cx, A.cy + A.d / 2 + 6); await s.wait(80); r3 = await inputState(s, ['attack']); await t.up(32); await s.wait(60); }
    await suite.check({ id: 'slide.slop', group: 'slide', issue: 'P-20', gate: PKG, title: 'hit radius = visual + 10 px (touch 6 px outside attack)', session: s }, async () => ({ pass: !!r3?.attack, detail: fmt(r3) }));
    await suite.errors({ id: 'slide.errors', group: 'slide' }, s);
    await s.close();
  }, env);

  // ── 2b. two simultaneous touches (stick + attack) both register ───────────────────────────────────
  await suite.group('multi', async () => {
    const { s, t } = await touchStage('phone1');
    await stickHold(t, s.page, 60, 0, 250, { finger: 41, keep: true });
    const A = (await padLayout(s.page)).buttons.attack;
    let st = null, moved = false;
    if (A) {
      await s.startRec();
      await t.down(42, A.cx, A.cy); await s.wait(120);
      st = await inputState(s, ['right', 'attack']);
      await t.up(42);
      const fr = await s.stopRec();
      moved = fr.some((f) => f.move);
    }
    await t.upAll(); await s.wait(80);
    await suite.check({ id: 'multi.stick_attack', group: 'multi', issue: 'P-20', gate: PKG, title: 'stick + attack at the same time both register', session: s }, async () => ({ pass: !!st?.right && (!!st?.attack || moved), detail: `${fmt(st)}${moved ? ', attack move started' : ''}` }));
    await suite.errors({ id: 'multi.errors', group: 'multi' }, s);
    await s.close();
  }, env);

  // ── 3. floating stick: touch at (200,250) → no movement; +40 px → right held (P-31) ─────────────
  await suite.group('stick', async () => {
    const { s, t } = await touchStage('phone1');
    await t.down(51, 200, 250); await s.wait(150);
    const a = await inputState(s, ['left', 'right', 'up', 'down']);
    for (let i = 1; i <= 4; i++) { await t.move(51, 200 + i * 10, 250); await s.wait(20); }
    await s.wait(120);
    const b = await inputState(s, ['left', 'right', 'up', 'down']);
    await t.up(51); await s.wait(80);
    await suite.check({ id: 'stick.float', group: 'stick', issue: 'P-31', gate: PKG, title: 'floating stick spawns at the finger; +40 px → right', session: s }, async () => ({ pass: !Object.values(a).some(Boolean) && b.right && !b.left && !b.up && !b.down, detail: `at touch ${fmt(a)} → after +40 px ${fmt(b)}` }));
    await suite.errors({ id: 'stick.errors', group: 'stick' }, s);
    await s.close();
  }, env);

  // ── 4. skill on cooldown shows the sweep (pixel probe on #tpadcv) ─────────────────────────────────
  await suite.group('cooldown', async () => {
    const { s, t } = await touchStage('phone1');
    const L = await padLayout(s.page);
    const B = L.buttons.skill1;
    const probe = (b) => s.eval((b) => {
      const c = document.getElementById('tpadcv');
      if (!c) return null;
      const k = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d').getImageData(Math.round(b.x * k), Math.round(b.y * k), Math.max(1, Math.round(b.w * k)), Math.max(1, Math.round(b.h * k))).data;
      return Array.from(d.filter((_, i) => i % 16 === 0));
    }, b);
    let diff = null, cd = null;
    if (B) {
      const before = await probe(B);
      await pressButton(t, s.page, 'skill1', 90);
      await s.wait(250);
      cd = await s.eval(() => { const p = window.__game.world.player, id = p.hero.slots?.[p.skillPage * 2]; return id ? +(+(p.skillCd?.[id] ?? 0)).toFixed(2) : null; });
      const after = await probe(B);
      if (before && after && before.length === after.length) diff = +(before.reduce((a, v, i) => a + Math.abs(v - after[i]), 0) / before.length).toFixed(2);
    }
    await suite.check({ id: 'cooldown.sweep', group: 'cooldown', issue: 'P-20', gate: PKG, title: 'skill 1 on cooldown: the button shows the sweep (#tpadcv pixels change)', session: s }, async () => ({ pass: diff !== null && diff > 6, detail: B ? `mean pixel change ${diff ?? 'n/a (no #tpadcv)'}; cooldown ${cd}` : `skill1 button not found [${L.source}]` }));
    await suite.errors({ id: 'cooldown.errors', group: 'cooldown' }, s);
    await s.close();
  }, env);

  // ── 5. tablet 4:3: canvas top-aligned, the main buttons sit in the bottom band ────────────────────
  await suite.group('band', async () => {
    const { s } = await touchStage('tablet');
    const box = await canvasBox(s.page);
    const L = await padLayout(s.page);
    const main = ['attack', 'jump', 'dash'].map((id) => L.buttons[id]).filter(Boolean);
    const low = main.length === 3 && main.every((b) => b.cy >= box.bottom + 40);
    // the canvas position comes from game.resize (PLAT-CORE), the band layout from touchpad.js: pending until both landed
    await suite.check({ id: 'band.tablet', group: 'band', issue: 'P-20', gate: [PKG, 'PLAT-CORE'], title: 'tablet: canvas top-aligned; attack/jump/dash centred ≥ 40 px below the canvas (in the band)', session: s }, async () => ({ pass: box.y <= 1 && low, detail: `canvas y ${box.y.toFixed(0)}..${box.bottom.toFixed(0)}; button centres ${main.map((b) => b.cy.toFixed(0)).join(', ')} [${L.source}]` }));
    await suite.errors({ id: 'band.errors', group: 'band' }, s);
    await s.close();
  }, env);

  // ── 6. layout editor: a drag persists to settings.touchLayout and survives a reload ──────────────
  await suite.group('editor', async () => {
    const { s, t } = await touchStage('phone1');
    const opened = await s.eval(async () => { const tp = (await import('/src/core/touchpad.js')).touchpad; try { tp.openEditor(); } catch (e) { return 'ERR ' + e.message; } return !!document.getElementById('tpad'); });
    await s.wait(400);
    const A0 = (await padLayout(s.page, { all: true })).buttons.attack;
    let saved = null, after = null;
    if (A0 && opened === true) {
      await t.drag(A0.cx, A0.cy, A0.cx - 60, A0.cy - 24, { steps: 8, stepMs: 20, hold: 100 });
      await s.wait(200);
      await s.eval(async () => { const tp = (await import('/src/core/touchpad.js')).touchpad; tp.closeEditor({ save: true }); });
      await s.wait(300);
      saved = await s.eval(() => window.__game.settings?.touchLayout?.attack ?? null);
      await s.page.reload();
      await s.waitGame('!!g.world?.player');
      await s.wait(1500);
      await t.tap(400, 100, 50); await s.wait(300);
      after = (await padLayout(s.page, { all: true })).buttons.attack;
    }
    await suite.check({ id: 'editor.persist', group: 'editor', issue: 'P-20', gate: PKG, title: 'editor drag → settings.touchLayout → same place after reload', session: s }, async () => ({
      pass: !!saved && !!after && Math.abs(after.cx - (A0.cx - 60)) <= 6 && Math.abs(after.cy - (A0.cy - 24)) <= 6,
      detail: opened !== true ? `editor did not open (${opened}; needs #tpad)` : `attack ${A0 ? `${A0.cx.toFixed(0)},${A0.cy.toFixed(0)}` : '?'} → saved ${fmt(saved)} → after reload ${after ? `${after.cx.toFixed(0)},${after.cy.toFixed(0)}` : 'n/a'}`,
    }));
    await suite.errors({ id: 'editor.errors', group: 'editor' }, s);
    await s.close();
  }, env);
} catch (e) {
  await suite.check({ id: 'harness', group: 'harness', title: 'suite ran to completion' }, async () => { throw e; });
} finally {
  await env.close();
}
process.exit(await suite.finish());
