// Menu suite — platform.md §11 WP-4 (acceptance 1–5), §5.6: scroll keeps its position after touch drag and wheel (P-01),
// D-pad still follows the selection, tap audit of every menu tab at 740×360 and 844×390 (P-04), controller glyphs in the bottom bar
// (P-05), swipe tabs and long-press action menu (§5.6).
//
//   node tools/qa/platform_menu.mjs [--only scroll,wheel,follow,taps,glyphs,swipe,longpress] [--vp phone2,phone1] [--strict]
// Report: /tmp/claude-0/qa/platform/platform_menu.json
import { Suite, fmt } from './lib/suite.mjs';
import { openEnv } from './lib/server.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';
import { Touch, ensureTouchMode } from './lib/touch.mjs';
import { installTapRecorder, auditScene, describeAudit, drawnText, KEYBOARD_LABEL } from './lib/taps.mjs';
import { fakePadInit, PAD_IDS, BTN, press, connect } from './lib/fakepad.mjs';

const suite = new Suite('platform_menu');
const env = await openEnv();
const SCROLL_TABS = ['inventory', 'bestiary', 'docs', 'quests'];
const ALL_TABS = ['status', 'equip', 'inventory', 'skills', 'class', 'quests', 'docs', 'bestiary', 'system'];

/** Menu page: stage s02, rich seed, menu on `tab`. */
async function menuPage(vp, tab, extra = {}) {
  const s = await env.page(vp, 'index.html?scene=stage&stage=s02', extra);
  await s.waitGame('!!g.world?.player');
  await s.wait(1500);
  await s.skipDialogue();
  // skipDialogue presses Enter (keyboard mode): phones are measured in touch mode (touch row heights, §6.3)
  if (VIEWPORTS[vp]?.touch) await ensureTouchMode(new Touch(s.cdp, s.page), s.page);
  await openTab(s, tab, true);
  return s;
}
async function openTab(s, tab, seed = false) {
  await s.eval(`import('/tools/menu_seed.js?${seed ? 'seed=1&' : ''}tab=${tab}&n=${Math.random().toString(36).slice(2)}')`);
  await s.wait(900);
  // make the long lists long enough to scroll: every lore record (docs → 기록물 list), every quest done (quests)
  if (tab === 'docs' || tab === 'quests') {
    await s.eval(async (tab) => {
      const g = window.__game, st = g.state, c = g.top?.cur;
      if (tab === 'docs') {
        try { const L = await import('/src/data/lore.js'); st.progress.lore = Object.keys(L.LORE || {}); } catch { /* none */ }
        if (c?.setMode) { c.setMode(1); c.loreIds = null; }
      } else {
        try { const Q = await import('/src/data/quests.js'); const ids = Object.keys(Q.QUESTS || {}); st.quests ||= { active: {}, done: [] }; st.quests.done = ids.filter((id) => !st.quests.active?.[id]); } catch { /* none */ }
        if (c) { c.lists = null; let best = 0, n = -1; for (let k = 0; k < 3; k++) { c.setSect?.(k); c.lists = null; const len = c.ids?.length ?? 0; if (len > n) { n = len; best = k; } } c.setSect?.(best); c.lists = null; }
      }
      g.top.rev = (g.top.rev || 0) + 1;
    }, tab);
    await s.wait(600);
  }
}
/** Scroller state of the current tab + its list rect in client CSS px. */
function scrollState(s) {
  return s.eval(() => {
    const g = window.__game, c = g.top?.cur, sc = c?.sc;
    const r = c?.gridRect || c?.listRect;
    if (!sc || !r) return null;
    const cv = g.canvas.getBoundingClientRect(), k = (cv.height / g.viewH) * (g.top.uiScale ? g.uiK || 1 : 1);
    return { y: sc.y, target: sc.target, max: sc.max, k, rect: { x: cv.x + r.x * k, y: cv.y + r.y * k, w: r.w * k, h: r.h * k } };
  });
}

try {
  // ── 1a. touch drag −160 CSS px keeps its position (P-01) ─────────────────────────────────────
  await suite.group('scroll', async () => {
    for (const vp of suite.vps(['phone2'])) {
      const s = await menuPage(vp, 'inventory');
      const t = new Touch(s.cdp, s.page);
      for (const tab of SCROLL_TABS) {
        await openTab(s, tab);
        const a = await scrollState(s);
        if (!a) { await suite.check({ id: `scroll.${tab}.${vp}`, group: 'scroll', issue: 'P-01', pkg: 'PLAT-MENU', title: `${tab}: drag keeps the scroll position` }, async () => ({ pass: false, detail: 'no scroller/list rect found on the tab' })); continue; }
        const cx = a.rect.x + a.rect.w / 2, cy = a.rect.y + a.rect.h * 0.75;
        await t.drag(cx, cy, cx, cy - 160, { steps: 10, stepMs: 20, hold: 180 });
        await s.wait(120);
        const b = await scrollState(s);
        await s.wait(800);
        const c = await scrollState(s);
        const expect = Math.min(a.max, Math.max(0, a.y + 160 / a.k));
        await suite.check({ id: `scroll.${tab}.${vp}`, group: 'scroll', issue: 'P-01', pkg: 'PLAT-MENU', title: `${tab}: touch drag of −160 CSS px scrolls 160 px (±8) and stays`, session: s }, async () => {
          if (a.max * a.k < 40) return { skip: `list too short to scroll (max ${a.max.toFixed(0)} px)` };
          const movedCss = (c.y - a.y) * a.k, errCss = Math.abs(c.y - expect) * a.k;
          return { pass: errCss <= 8, detail: `y ${a.y.toFixed(0)} → ${b.y.toFixed(0)} on release → ${c.y.toFixed(0)} settled (moved ${movedCss.toFixed(0)} CSS px, expected ${((expect - a.y) * a.k).toFixed(0)}; max ${a.max.toFixed(0)})` };
        });
      }
      await suite.errors({ id: `scroll.${vp}.errors`, group: 'scroll' }, s);
      await s.close();
    }
  }, env);

  // ── 1b. 5 wheel notches keep their position (desktop, P-01) ────────────────────────────────────
  await suite.group('wheel', async () => {
    const s = await menuPage('desk', 'inventory');
    for (const tab of ['inventory', 'bestiary', 'quests']) {
      await openTab(s, tab);
      const a = await scrollState(s);
      if (!a) { await suite.check({ id: `wheel.${tab}`, group: 'wheel', issue: 'P-01', pkg: 'PLAT-MENU', title: `${tab}: wheel keeps the scroll position` }, async () => ({ pass: false, detail: 'no scroller/list rect found' })); continue; }
      await s.page.mouse.move(a.rect.x + a.rect.w / 2, a.rect.y + a.rect.h / 2);
      await s.wait(80);
      for (let i = 0; i < 5; i++) { await s.page.mouse.wheel(0, 100); await s.wait(50); }
      await s.wait(250);
      const b = await scrollState(s);
      await s.wait(900);
      const c = await scrollState(s);
      await suite.check({ id: `wheel.${tab}`, group: 'wheel', issue: 'P-01', pkg: 'PLAT-MENU', title: `${tab}: 5 wheel notches scroll and stay`, session: s }, async () => {
        if (a.max < 60) return { skip: `list too short to scroll (max ${a.max.toFixed(0)} px)` };
        const want = Math.min(a.max, a.y + 300); // 5 × 100 px deltaY, any reasonable notch mapping reaches this (or the end)
        return { pass: c.y >= want - 2 && Math.abs(c.y - b.y) <= Math.max(4, 0.05 * b.y), detail: `y ${a.y.toFixed(0)} → ${b.y.toFixed(0)} after the wheel → ${c.y.toFixed(0)} settled (max ${a.max.toFixed(0)})` };
      });
    }
    await suite.errors({ id: 'wheel.errors', group: 'wheel' }, s);
    await s.close();
  }, env);

  // ── D-pad navigation still makes the list follow the selection (P-01 regression guard) ──────────
  await suite.group('follow', async () => {
    const s = await menuPage('desk', 'inventory');
    const a = await scrollState(s);
    for (let i = 0; i < 14; i++) await s.key('ArrowDown', 50);
    await s.wait(500);
    const b = await scrollState(s);
    await suite.check({ id: 'follow.inventory', group: 'follow', issue: 'P-01', pkg: 'PLAT-MENU', title: 'D-pad down through the grid scrolls the selection into view', session: s }, async () => ({ pass: !!a && !!b && b.y > a.y + 20, detail: a && b ? `y ${a.y.toFixed(0)} → ${b.y.toFixed(0)} (max ${b.max.toFixed(0)})` : 'no scroller' }));
    await suite.errors({ id: 'follow.errors', group: 'follow' }, s);
    await s.close();
  }, env);

  // ── 2. tap audit of every tab at 740×360 (WP-4 acceptance 2) and 844×390 (§6.3 audits both phone sizes) (P-04) ──
  await suite.group('taps', async () => {
    for (const vp of suite.vps(['phone2', 'phone1'])) {
      const s = await menuPage(vp, 'status');
      await installTapRecorder(s.page);
      // every tab the menu really has (MENU_TABS), so a tab added later (동료, PLAT-MENU) is audited too
      const tabs = await s.eval(async (fallback) => {
        try { const M = await import('/src/scenes/menu/menu.js'); const ids = (M.MENU_TABS || []).map((t) => t.id).filter(Boolean); return ids.length ? ids : fallback; } catch { return fallback; }
      }, ALL_TABS);
      for (const tab of tabs) {
        const a = await auditScene(s.page, `import('/tools/menu_seed.js?tab=${tab}&n=${tab}${vp}')`, { wait: 1000 });
        await suite.check({ id: `taps.${tab}.${vp}`, group: 'taps', issue: 'P-04', pkg: 'PLAT-MENU', title: `menu ${tab}: tap targets ≥ §6.3 minimums at ${VIEWPORTS[vp].css.w}×${VIEWPORTS[vp].css.h}`, session: s }, async () => ({
          pass: !a.error && a.ok && a.n > 0, detail: a.error || (a.n ? describeAudit(a) : 'no tap regions recorded'), metrics: a.error ? null : { n: a.n, red: a.red.length, yellow: a.yellow.length, regions: a.regions.slice(0, 40), text: a.text },
        }));
      }
      await suite.errors({ id: `taps.${vp}.errors`, group: 'taps' }, s);
      await s.close();
    }
  }, env);

  // ── 3. a PS pad shows controller glyphs, not keyboard keycaps, in the bottom bar (P-05) ─────────
  await suite.group('glyphs', async () => {
    const s = await menuPage('desk', 'inventory', { initScripts: [fakePadInit({ id: PAD_IDS.ps })] });
    await installTapRecorder(s.page);
    await connect(s.page);
    await press(s.page, BTN.RIGHT);
    await press(s.page, BTN.LEFT);
    await s.wait(300);
    const vh = await s.eval(() => window.__game.uiH ?? window.__game.viewH);
    const bottom = await drawnText(s.page, { minY: vh - 48 });
    const kb = bottom.filter((t) => KEYBOARD_LABEL.test(t.trim()));
    const set = await s.eval(() => window.__game.input.padInfo?.glyphs ?? null);
    await suite.check({ id: 'glyphs.ps', group: 'glyphs', issue: 'P-05', pkg: 'PLAT-MENU', title: 'PS pad: bottom bar shows controller glyphs, no keyboard keycaps', session: s }, async () => ({
      pass: set === 'ps' && kb.length === 0 && bottom.length > 0, detail: `padInfo.glyphs ${fmt(set)}; keyboard labels ${fmt(kb.slice(0, 8))}; bottom text ${fmt(bottom.slice(0, 10))}`,
    }));
    await suite.errors({ id: 'glyphs.errors', group: 'glyphs' }, s);
    await s.close();
  }, env);

  // ── 4. swipe left on the content → next tab (§5.6) ───────────────────────────────────────────────
  await suite.group('swipe', async () => {
    const s = await menuPage('phone2', 'inventory');
    const t = new Touch(s.cdp, s.page);
    const a = await scrollState(s);
    const ti0 = await s.eval(() => window.__game.top.ti);
    const cx = a ? a.rect.x + a.rect.w * 0.7 : 500, cy = a ? a.rect.y + a.rect.h * 0.5 : 220;
    await t.drag(cx, cy, cx - 200, cy + 6, { steps: 6, stepMs: 16 });
    await s.wait(500);
    const ti1 = await s.eval(() => window.__game.top.ti);
    await suite.check({ id: 'swipe.next', group: 'swipe', issue: '§5.6', gate: 'PLAT-MENU', title: 'horizontal swipe left on the content → next tab', session: s }, async () => ({ pass: ti1 === ti0 + 1, detail: `ti ${ti0} → ${ti1}` }));
    await suite.errors({ id: 'swipe.errors', group: 'swipe' }, s);
    await s.close();
  }, env);

  // ── 5. long-press on an inventory item opens the action menu (§5.6) ─────────────────────────────
  await suite.group('longpress', async () => {
    const s = await menuPage('phone2', 'inventory');
    const t = new Touch(s.cdp, s.page);
    const cell = await s.eval(() => {
      const g = window.__game, c = g.top?.cur, r = c?.gridRect;
      if (!r) return null;
      const cv = g.canvas.getBoundingClientRect(), k = (cv.height / g.viewH) * (g.top.uiScale ? g.uiK || 1 : 1);
      const cells = (c.cellRects || []).filter(Boolean);
      const cr = cells[1] || cells[0];
      if (!cr) return null;
      if (c.i === cells.indexOf(cr)) c.i = 0; // make sure the target is not the selected item
      return { x: cv.x + (cr.x + cr.w / 2) * k, y: cv.y + (cr.y + cr.h / 2) * k, idx: cells.indexOf(cr), sel: c.i };
    });
    if (cell) await t.longPress(cell.x, cell.y, 650);
    await s.wait(300);
    const modal = await s.eval(() => { const m = window.__game.top?.modal; return m ? { open: !!m.open, title: m.title ?? null, items: (m.items || []).map((i) => i.label) } : null; });
    await suite.check({ id: 'longpress.inventory', group: 'longpress', issue: '§5.6', gate: 'PLAT-MENU', title: 'long-press 450 ms on an item opens its action menu', session: s }, async () => ({ pass: !!modal?.open, detail: cell ? fmt(modal) : 'no inventory grid' }));
    await suite.errors({ id: 'longpress.errors', group: 'longpress' }, s);
    await s.close();
  }, env);
} catch (e) {
  await suite.check({ id: 'harness', group: 'harness', title: 'suite ran to completion' }, async () => { throw e; });
} finally {
  await env.close();
}
process.exit(await suite.finish());
