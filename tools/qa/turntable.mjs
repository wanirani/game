// Turntable suite — platform.md §7.1–7.3, §11 WP-5 acceptance 1–6 (user request #6: rotate the hero in the menu).
//
//   node tools/qa/turntable.mjs [--only drag,fling,keys,stick,wheel,auto,showcase,reveal,touch,fallback,taps,gallery,perf] [--strict] [--shots]
//
// Checks (status, equip and class tabs unless noted):
//   drag      mouse drag of 1.1 × stage width rotates 180° ± 10° (right = yaw decreases, grab-the-surface)       — acceptance 1
//   fling     a fast drag released without a pause settles on a 45° step within 1.2 s (game time)               — acceptance 1
//   keys      hold , / . 0.5 s = ±1.3 rad (2.6 rad/s); / toggles auto-spin; / / (double) resets                   — acceptance 2
//   stick     fake pad right stick X = 1 for 0.5 s ≈ 1.6 rad; R3 resets to the default view and toggles auto-spin — acceptance 2
//   wheel     one notch over the stage = 22.5° then the next 45° step; wheel over another panel does not rotate    — §7.2
//   auto      auto-spin starts after 6 s idle, stops on input, never with reduceMotion                              — acceptance 3
//   showcase  a tap on the hero plays the showcase in profile and yaw returns to the user's angle; double tap resets — acceptance 4
//   reveal    equipping armour/head/cloak/accessory spins one full turn (0.8 s) back to the same angle              — §7.2
//   touch     phone2 touch: ⟳ tap = 45° step, ⟲ hold = continuous, a swipe on the stage rotates and keeps the tab   — §7.2, §5.6
//   fallback  painted views unavailable (puppets off): label '옆모습', default 0°, no auto-spin, rests on a profile    — §7.3 fallback
//   taps      tap audit of the three tabs at 740×360 and 844×390 (§6.3)                                               — P-04
//   gallery   tools/gallery_turntable.html: 6 heroes × 3 looks × 8 yaws, zero page errors; with the renderer contract:
//             front vs back differ > 8 %, front view left-right symmetric, cape covers the back (gated on ART-HERO-B)  — acceptance 5
//   perf      menu equip tab at fhd2x high renders in ≤ 20 ms per frame (median)                                     — acceptance 6, P-11
// Gameplay-time checks run on a frozen, stepped clock (requestAnimationFrame/performance.now replaced; step(n) advances n
// frames of 1/60 s) so a loaded machine cannot change the result. Report: /tmp/claude-0/qa/platform/turntable.json
import fs from 'node:fs';
import path from 'node:path';
import { Suite, fmt } from './lib/suite.mjs';
import { openEnv, REPORT_DIR } from './lib/server.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';
import { Touch, ensureTouchMode } from './lib/touch.mjs';
import { installTapRecorder, auditScene, describeAudit } from './lib/taps.mjs';
import { fakePadInit, connect, axes, setButton, BTN } from './lib/fakepad.mjs';

const suite = new Suite('turntable');
const env = await openEnv();
const TABS = ['status', 'equip', 'class'];
const PI = Math.PI, DEG = PI / 180;
const G = { id: 'PLAT-TURNTABLE', gate: 'PLAT-TURNTABLE' };
const SHOT_DIR = path.join(REPORT_DIR, 'shots', 'turntable');

/** Menu on `tab` (stage s02, rich seed). Waits until the hero's painted views are ready (or 12 s). */
async function menuPage(vp, tab, extra = {}) {
  const s = await env.page(vp, 'index.html?scene=stage&stage=s02', extra);
  await s.waitGame('!!g.world?.player');
  await s.wait(1200);
  await s.skipDialogue();
  if (VIEWPORTS[vp]?.touch) await ensureTouchMode(new Touch(s.cdp, s.page), s.page);
  await openTab(s, tab, true);
  return s;
}
async function openTab(s, tab, seed = false) {
  await s.eval(`import('/tools/menu_seed.js?${seed ? 'seed=1&' : ''}tab=${tab}&n=${Math.random().toString(36).slice(2)}')`);
  await s.page.waitForFunction(`(() => { const c = window.__game?.top?.cur; return c?.view?.rect && c.constructor.name.toLowerCase().startsWith('${tab}'); })()`, null, { timeout: 15000, polling: 50 });
  await s.page.waitForFunction('(() => { const v = window.__game.top.cur.view; return v.support().full; })()', null, { timeout: 12000, polling: 100 }).catch(() => {});
  await s.wait(300);
}
/** Freeze the game loop: requestAnimationFrame is queued and performance.now is virtual; __tt.step(n) runs n frames. */
async function freeze(s) {
  await s.eval(() => {
    if (window.__ttc) return;
    const realNow = performance.now.bind(performance);
    const C = { vt: realNow(), q: [] };
    performance.now = () => C.vt;
    window.requestAnimationFrame = (cb) => { C.q.push(cb); return C.q.length; };
    window.__ttc = {
      step(n = 1) { for (let i = 0; i < n; i++) { C.vt += 1000 / 60; const cbs = C.q.splice(0); for (const cb of cbs) { try { cb(C.vt); } catch (e) { console.error(e); } } } return C.vt; },
    };
  });
  await step(s, 3);
}
const step = (s, n = 1) => s.eval((n) => window.__ttc.step(n), n);
/** HeroView state of the current tab (+ stage rect in client CSS px). */
function view(s) {
  return s.eval(() => {
    const g = window.__game, c = g.top?.cur, v = c?.view;
    if (!v) return null;
    const cv = g.canvas.getBoundingClientRect(), k = (cv.height / g.viewH) * (g.top.uiScale ? g.uiK || 1 : 1);
    const r = v.rect;
    return {
      yaw: v.yaw, vel: v.yawVel, goal: v.yawGoal, user: v.userYaw, mode: v.mode, auto: v.autoSpin, spinning: v.spinning, idle: v.idleT,
      seq: !!(v.seq || v.pending), anim: v.p.anim, label: v.viewLabel(), full: v.support().full, step: v.stepSize(), def: v.defaultYaw,
      time: g.time, ti: g.top.ti, k,
      rect: r && { x: cv.x + r.x * k, y: cv.y + r.y * k, w: r.w * k, h: r.h * k, uw: r.w },
      btns: (v.btns || []).map((b) => ({ id: b.id, x: cv.x + b.x * k, y: cv.y + b.y * k, r: b.r * k })),
    };
  });
}
/** Put the view at rest on its default angle, auto-spin off, no showcase. */
function rest(s, { autoSpin = false } = {}) {
  return s.eval((autoSpin) => {
    const v = window.__game.top.cur.view;
    v.endSeq(); v.introT = 0; v.tw = null; v.drag = null; v.hold = null;
    v.yaw = v.yawGoal = v.userYaw = v.defaultYaw; v.yawVel = 0; v.mode = 'idle'; v.idleT = 0;
    v.autoSpin = autoSpin; v.spinning = false; v.spinNow = false; v.spinGuard = false; v.cool = 99; v.touched = true;
  }, autoSpin);
}
/** Step until the view is at rest (idle, no tween, no showcase) or maxFrames. Returns frames stepped. */
async function settle(s, maxFrames = 180) {
  for (let n = 0; n < maxFrames; n += 6) {
    const v = await view(s);
    if (v.mode === 'idle' && !v.seq && Math.abs(v.vel) < 1e-4) return n;
    await step(s, 6);
  }
  return maxFrames;
}
const onStep = (yaw, stepSize) => Math.abs(yaw / stepSize - Math.round(yaw / stepSize)) * stepSize < 0.5 * DEG;
const d = (x) => `${(x / DEG).toFixed(1)}°`;
async function key(s, code, frames = 3) { await s.page.keyboard.down(code); await step(s, frames); await s.page.keyboard.up(code); await step(s, 2); }

try {
  // ── desktop checks on each tab (one session per tab, frozen clock) ────────────────────────────
  for (const tab of TABS) {
    if (!['drag', 'fling', 'keys', 'wheel', 'auto', 'showcase', 'reveal'].some((g) => suite.wants(g))) break;
    const s = await menuPage('desk', tab);
    await freeze(s);

    await suite.group('drag', async () => {
      await rest(s); await step(s, 2);
      const a = await view(s);
      const cx = a.rect.x + a.rect.w * 0.3, cy = a.rect.y + a.rect.h * 0.55, dx = 1.1 * a.rect.w;
      await s.page.mouse.move(cx, cy); await step(s, 1);
      await s.page.mouse.down(); await step(s, 2);
      for (let i = 1; i <= 24; i++) { await s.page.mouse.move(cx + (dx * i) / 24, cy); await step(s, 1); }
      await step(s, 10);                                         // hold still ≥ 80 ms → no fling
      const mid = await view(s);
      await s.page.mouse.up(); await step(s, 2);
      await settle(s);
      const b = await view(s);
      const turned = b.yaw - a.yaw;
      await suite.check({ id: `drag.${tab}`, group: 'drag', ...G, title: `${tab}: mouse drag of 1.1 × stage width rotates 180° ± 10°`, session: s }, async () => ({
        pass: a.full ? Math.abs(Math.abs(turned) - PI) <= 10 * DEG && turned < 0 : Math.abs(Math.abs(turned) - PI) <= 10 * DEG,
        detail: `stage ${a.rect.uw.toFixed(0)} UI px, drag ${dx.toFixed(0)} CSS px → while held ${d(mid.yaw - a.yaw)}, settled ${d(turned)} (mode ${b.mode}, view '${b.label}')`,
      }));
    }, { closeSessions: async () => {} });

    await suite.group('fling', async () => {
      await rest(s); await step(s, 2);
      const a = await view(s);
      const cx = a.rect.x + a.rect.w * 0.25, cy = a.rect.y + a.rect.h * 0.55;
      await s.page.mouse.move(cx, cy); await step(s, 1);
      await s.page.mouse.down(); await step(s, 1);
      for (let i = 1; i <= 5; i++) { await s.page.mouse.move(cx + i * 36, cy); await step(s, 1); }
      await s.page.mouse.up(); await step(s, 1);
      const rel = await view(s);
      let frames = 1, b = rel;
      while (frames < 150) { await step(s, 3); frames += 3; b = await view(s); if (b.mode === 'idle' && onStep(b.yaw, b.step)) break; }
      await suite.check({ id: `fling.${tab}`, group: 'fling', ...G, title: `${tab}: a fling settles on a ${d(a.step)} step within 1.2 s`, session: s }, async () => ({
        pass: rel.mode === 'free' && frames / 60 <= 1.2 && onStep(b.yaw, b.step) && Math.abs(b.yaw - a.yaw) > 20 * DEG,
        detail: `release velocity ${rel.vel.toFixed(2)} rad/s (mode ${rel.mode}) → settled after ${(frames / 60).toFixed(2)} s at ${d(b.yaw)} (turned ${d(b.yaw - a.yaw)}, step ${d(b.step)})`,
      }));
    });

    await suite.group('keys', async () => {
      await rest(s); await step(s, 2);
      const a = await view(s);
      await s.page.keyboard.down('Comma'); await step(s, 30);
      const b = await view(s);
      await s.page.keyboard.up('Comma'); await step(s, 2); await settle(s);
      const b2 = await view(s);
      await s.page.keyboard.down('Period'); await step(s, 30);
      const c = await view(s);
      await s.page.keyboard.up('Period'); await step(s, 2); await settle(s);
      await suite.check({ id: `keys.rotate.${tab}`, group: 'keys', ...G, title: `${tab}: hold , and . for 0.5 s = ±1.3 rad (2.6 rad/s)` }, async () => ({
        pass: Math.abs((b.yaw - a.yaw) - 1.3) <= 0.1 && Math.abs((c.yaw - b2.yaw) + 1.3) <= 0.1,
        detail: `',' 0.5 s → ${(b.yaw - a.yaw).toFixed(3)} rad, '.' 0.5 s → ${(c.yaw - b2.yaw).toFixed(3)} rad`,
      }));
      // / toggles auto-spin, a quick double / resets to the default view
      await rest(s, { autoSpin: false }); await step(s, 2);
      await key(s, 'Slash'); await step(s, 4);
      const t1 = await view(s);
      await step(s, 30);
      await key(s, 'Slash'); await step(s, 30);                   // a single press 0.5 s later → auto-spin back off
      const t2 = await view(s);
      await s.page.keyboard.down('Comma'); await step(s, 20); await s.page.keyboard.up('Comma'); await step(s, 2); await settle(s);
      const moved = await view(s);
      await key(s, 'Slash'); await step(s, 6); await key(s, 'Slash'); await settle(s, 90);
      const t3 = await view(s);
      await suite.check({ id: `keys.slash.${tab}`, group: 'keys', ...G, title: `${tab}: / toggles auto-spin (spins at once); a double / resets the view` }, async () => ({
        pass: t1.auto === true && (t1.spinning || !t1.full) && t2.auto === false && Math.abs(t3.yaw - t3.def) < 0.01 && Math.abs(moved.yaw - moved.def) > 0.3 && t3.auto === false,
        detail: `after '/': auto ${t1.auto} spinning ${t1.spinning}; after 2nd '/' (0.6 s later): auto ${t2.auto}; rotated to ${d(moved.yaw)} → '/''/' → ${d(t3.yaw)} (default ${d(t3.def)}), auto ${t3.auto}`,
      }));
    });

    await suite.group('wheel', async () => {
      await rest(s); await step(s, 2);
      const a = await view(s);
      await s.page.mouse.move(a.rect.x + a.rect.w / 2, a.rect.y + a.rect.h / 2); await step(s, 2);
      await s.page.mouse.wheel(0, 100); await step(s, 12);
      const b = await view(s);
      await step(s, 40); await settle(s);
      const c = await view(s);
      // wheel over the other panels (right side of the menu) must not rotate
      await s.page.mouse.move(a.rect.x + a.rect.w + 260, a.rect.y + a.rect.h * 0.8); await step(s, 2);
      const e0 = await view(s);
      await s.page.mouse.wheel(0, 300); await step(s, 20);
      const e1 = await view(s);
      await suite.check({ id: `wheel.${tab}`, group: 'wheel', ...G, title: `${tab}: one wheel notch over the stage = 22.5°, then the next step; wheel elsewhere does not rotate` }, async () => ({
        pass: Math.abs((b.yaw - a.yaw) + 22.5 * DEG) <= 3 * DEG && onStep(c.yaw, c.step) && Math.abs(c.yaw - a.yaw) > 20 * DEG && Math.abs(e1.yaw - e0.yaw) < 1e-6,
        detail: `notch → ${d(b.yaw - a.yaw)} after 0.2 s, rests at ${d(c.yaw - a.yaw)}; wheel over another panel → ${d(e1.yaw - e0.yaw)}`,
      }));
    });

    await suite.group('auto', async () => {
      await rest(s, { autoSpin: true }); await step(s, 2);
      await s.page.mouse.move(2, 2); await step(s, 2);            // park the mouse (moving it resets the idle timer)
      await rest(s, { autoSpin: true }); await step(s, 2);
      await step(s, 5.4 * 60);
      const early = await view(s);
      await step(s, 0.9 * 60);
      const on = await view(s);
      await step(s, 30);
      const on2 = await view(s);
      await key(s, 'ShiftLeft', 2);
      const off = await view(s);
      await settle(s);
      // reduceMotion: never spins
      await s.eval(() => { window.__game.settings.reduceMotion = true; });
      await rest(s, { autoSpin: true }); await step(s, 7.5 * 60);
      const rm = await view(s);
      await s.eval(() => { window.__game.settings.reduceMotion = false; });
      await suite.check({ id: `auto.${tab}`, group: 'auto', ...G, title: `${tab}: auto-spin after 6 s idle (0.6 rad/s), stops on input, off with reduceMotion` }, async () => ({
        pass: !early.spinning && on.spinning && Math.abs((on2.yaw - on.yaw) - 0.3) < 0.03 && !off.spinning && !rm.spinning && Math.abs(rm.yaw - rm.def) < 1e-6,
        detail: `5.4 s: spinning ${early.spinning}; 6.3 s: ${on.spinning} (rate ${((on2.yaw - on.yaw) / 0.5).toFixed(2)} rad/s); after a key: ${off.spinning}; reduceMotion 7.5 s: ${rm.spinning}`,
      }));
    });

    await suite.group('showcase', async () => {
      await rest(s); await step(s, 2);
      const a = await view(s);
      const cx = a.rect.x + a.rect.w / 2, cy = a.rect.y + a.rect.h * 0.5;
      await s.page.mouse.move(cx, cy); await step(s, 1);
      await s.page.mouse.down(); await step(s, 2); await s.page.mouse.up(); await step(s, 2);
      const t0 = await view(s);
      await step(s, 14);
      const prof = await view(s);
      let n = 0, b = prof;
      while (n < 480) { await step(s, 6); n += 6; b = await view(s); if (!b.seq) break; }
      await step(s, 30);
      const back = await view(s);
      await suite.check({ id: `showcase.${tab}`, group: 'showcase', ...G, title: `${tab}: a tap plays the showcase in profile and returns to the user's angle`, session: s }, async () => ({
        pass: t0.seq && prof.seq && Math.abs(Math.sin(prof.yaw)) < 0.02 && prof.anim !== 'idle' && Math.abs(back.yaw - a.yaw) < 0.01,
        detail: `start ${d(a.yaw)}; 0.25 s after the tap: yaw ${d(prof.yaw)}, anim '${prof.anim}'; showcase ${(n / 60).toFixed(2)} s; after: ${d(back.yaw)}`,
      }));
      // double tap resets
      await s.page.keyboard.down('Comma'); await step(s, 25); await s.page.keyboard.up('Comma'); await step(s, 2); await settle(s);
      const rot = await view(s);
      for (let i = 0; i < 2; i++) { await s.page.mouse.down(); await step(s, 2); await s.page.mouse.up(); await step(s, 5); }
      await settle(s, 240);
      const r = await view(s);
      await suite.check({ id: `doubletap.${tab}`, group: 'showcase', ...G, title: `${tab}: a double tap on the hero resets the view` }, async () => ({
        pass: Math.abs(rot.yaw - rot.def) > 0.3 && Math.abs(r.yaw - r.def) < 0.01,
        detail: `rotated to ${d(rot.yaw)} → double tap → ${d(r.yaw)} (default ${d(r.def)})`,
      }));
    });

    if (tab === 'equip') await suite.group('reveal', async () => {
      await rest(s); await step(s, 2);
      const r = await s.eval(() => {
        const t = window.__game.top.cur, v = t.view;
        const slots = t.slots, si = slots.indexOf('cloak') >= 0 ? slots.indexOf('cloak') : slots.indexOf('body');
        t.si = si; t.sub = 'list'; t.rebuild();
        const row = t.list.find((x) => !x.unequip && x.ok && !x.here);
        if (!row) return { none: true, slot: slots[si] };
        const y0 = v.yaw;
        t.doRow(row);
        return { slot: slots[si], name: row.inst.baseId, y0, mode: v.mode, span: v.tw ? v.tw.to - v.tw.from : null, dur: v.tw?.dur ?? null };
      });
      await step(s, 60); await settle(s);
      const b = await view(s);
      await suite.check({ id: 'reveal.equip', group: 'reveal', ...G, title: 'equip: armour/cloak equip spins one full turn in 0.8 s and stops at the same angle', session: s }, async () => {
        if (r.none) return { skip: `no equippable ${r.slot} in the seeded inventory` };
        return { pass: r.mode === 'tween' && Math.abs(Math.abs(r.span) - 2 * PI) < 0.01 && Math.abs(r.dur - 0.8) < 1e-6 && Math.abs(Math.cos(b.yaw - r.y0) - 1) < 1e-4, detail: `equipped ${r.name} (${r.slot}): tween ${d(r.span)} over ${r.dur} s → rests at ${d(b.yaw)} (was ${d(r.y0)})` };
      });
    });

    await suite.errors({ id: `desk.${tab}.errors`, group: 'errors' }, s);
    await s.close();
  }

  // ── pad: right stick and R3 (status tab) ─────────────────────────────────────────────────────
  await suite.group('stick', async () => {
    const s = await menuPage('desk', 'status', { initScripts: [fakePadInit({ connected: false })] });
    await connect(s.page);
    await freeze(s);
    await rest(s); await step(s, 4);
    const a = await view(s);
    await axes(s.page, 0, 0, 1, 0); await step(s, 30);
    const b = await view(s);
    await axes(s.page, 0, 0, 0, 0); await step(s, 2); await settle(s);
    await s.eval(() => { const v = window.__game.top.cur.view; v.autoSpin = false; });
    const c = await view(s);
    await setButton(s.page, BTN.R3, 1); await step(s, 4); await setButton(s.page, BTN.R3, 0); await step(s, 2);
    await settle(s, 90);
    const r = await view(s);
    await suite.check({ id: 'stick.rotate', group: 'stick', ...G, title: 'right stick X = 1 for 0.5 s rotates ≈ 1.6 rad', session: s }, async () => ({
      pass: Math.abs(Math.abs(b.yaw - a.yaw) - 1.6) <= 0.12 && b.yaw < a.yaw,
      detail: `0.5 s of RS X = 1 → ${(b.yaw - a.yaw).toFixed(3)} rad (right stick right = rotate right)`,
    }));
    await suite.check({ id: 'stick.r3', group: 'stick', ...G, title: 'R3 resets to the default view and toggles auto-spin' }, async () => ({
      pass: Math.abs(c.yaw - c.def) > 0.3 && (Math.abs(r.yaw - r.def) < 0.01 || r.spinning) && r.auto === true,
      detail: `before R3: ${d(c.yaw)}, auto ${c.auto}; after R3: ${d(r.yaw)} (default ${d(r.def)}), auto ${r.auto}, spinning ${r.spinning}`,
    }));
    await suite.errors({ id: 'stick.errors', group: 'stick' }, s);
    await s.close();
  }, env);

  // ── touch (phone2): buttons, swipe on the stage ───────────────────────────────────────────────
  await suite.group('touch', async () => {
    const s = await menuPage('phone2', 'equip');
    const t = new Touch(s.cdp, s.page);
    await freeze(s);
    await rest(s); await step(s, 8);
    const a = await view(s);
    const R = a.btns.find((b) => b.id === 'tt:R'), L = a.btns.find((b) => b.id === 'tt:L');
    if (!R || !L) {
      await suite.check({ id: 'touch.buttons', group: 'touch', ...G, title: 'touch: ⟲ ⟳ buttons are shown in touch mode', session: s }, async () => ({ pass: false, detail: `buttons ${fmt(a.btns)}` }));
    } else {
      await t.down(31, R.x, R.y); await step(s, 3); await t.up(31); await step(s, 2); await settle(s);
      const b = await view(s);
      await t.down(32, L.x, L.y); await step(s, 54); await t.up(32); await step(s, 2); await settle(s);
      const c = await view(s);
      await suite.check({ id: 'touch.buttons', group: 'touch', ...G, title: 'touch: ⟳ tap = one 45° step right, ⟲ hold = continuous rotation left', session: s }, async () => ({
        pass: Math.abs((b.yaw - a.yaw) + b.step) < 0.01 && (c.yaw - b.yaw) > b.step + 0.3 && onStep(c.yaw, c.step) && R.r * 2 >= 24,
        detail: `⟳ tap → ${d(b.yaw - a.yaw)}; ⟲ hold 0.9 s → ${d(c.yaw - b.yaw)} (rests on a step: ${onStep(c.yaw, c.step)}); button ⌀ ${(R.r * 2).toFixed(0)} CSS px + registry slop`,
      }));
    }
    // swipe across the stage: rotates, the tab does not change (platform §5.6)
    await rest(s); await step(s, 2);
    const s0 = await view(s);
    const y = s0.rect.y + s0.rect.h * 0.55, x0 = s0.rect.x + s0.rect.w * 0.2;
    await t.down(33, x0, y); await step(s, 1);
    for (let i = 1; i <= 6; i++) { await t.move(33, x0 + i * 22, y); await step(s, 1); }
    await t.up(33); await step(s, 3);
    await settle(s);
    const s1 = await view(s);
    await suite.check({ id: 'touch.swipe', group: 'touch', ...G, title: 'touch: a fast horizontal swipe on the stage rotates the hero and does not switch tabs', session: s }, async () => ({
      pass: Math.abs(s1.yaw - s0.yaw) > 20 * DEG && s1.ti === s0.ti,
      detail: `yaw ${d(s0.yaw)} → ${d(s1.yaw)}; tab index ${s0.ti} → ${s1.ti}`,
    }));
    await suite.errors({ id: 'touch.errors', group: 'touch' }, s);
    await s.close();
  }, env);

  // ── fallback: no painted views (puppets off) ─────────────────────────────────────────────────
  await suite.group('fallback', async () => {
    const s = await env.page('desk', 'index.html?scene=stage&stage=s02');
    await s.waitGame('!!g.world?.player');
    await s.eval(async () => { const P = await import('/src/render/hero_puppet.js'); P.setPuppetEnabled(false); });
    await s.wait(900); await s.skipDialogue();
    await s.eval(`import('/tools/menu_seed.js?seed=1&tab=status&n=fb')`);
    await s.page.waitForFunction('!!window.__game?.top?.cur?.view?.rect', null, { timeout: 15000 });
    await s.wait(400);
    await freeze(s);
    await s.eval(() => { const v = window.__game.top.cur.view; v.endSeq(); v.introT = 0; v.cool = 99; });
    await settle(s, 240);
    const a = await view(s);
    const cx = a.rect.x + a.rect.w * 0.3, cy = a.rect.y + a.rect.h * 0.55;
    await s.page.mouse.move(cx, cy); await step(s, 1); await s.page.mouse.down(); await step(s, 2);
    for (let i = 1; i <= 10; i++) { await s.page.mouse.move(cx + (a.rect.w * 0.35 * i) / 10, cy); await step(s, 1); }
    await step(s, 10); await s.page.mouse.up(); await step(s, 2); await settle(s);
    const b = await view(s);
    await s.eval(() => { window.__game.top.cur.view.idleT = 0; window.__game.top.cur.view.autoSpin = true; });
    await step(s, 7 * 60);
    const c = await view(s);
    await suite.check({ id: 'fallback.profile', group: 'fallback', ...G, title: 'no painted views: label 옆모습, default 0°, rests on a profile, no auto-spin', session: s }, async () => ({
      pass: !a.full && a.label === '옆모습' && Math.abs(a.def) < 1e-9 && Math.abs(Math.sin(b.yaw)) < 1e-3 && !c.spinning,
      detail: `full ${a.full}, label '${a.label}', default ${d(a.def)}, after a drag rests at ${d(b.yaw)}, 7 s idle spinning ${c.spinning}`,
    }));
    await suite.errors({ id: 'fallback.errors', group: 'fallback' }, s);
    await s.close();
  }, env);

  // ── tap audit (§6.3) ─────────────────────────────────────────────────────────────────────────
  await suite.group('taps', async () => {
    for (const vp of suite.vps(['phone2', 'phone1'])) {
      const s = await menuPage(vp, 'status');
      await installTapRecorder(s.page);
      for (const tab of TABS) {
        const a = await auditScene(s.page, `import('/tools/menu_seed.js?tab=${tab}&n=tt${tab}${vp}')`, { wait: 1200 });
        const mine = a.error ? null : { ...a, red: a.red.filter((r) => !/^menu\./.test(r.src || '')), yellow: a.yellow.filter((r) => !/^menu\./.test(r.src || '')) };
        await suite.check({ id: `taps.${tab}.${vp}`, group: 'taps', issue: 'P-04', pkg: 'PLAT-TURNTABLE', title: `${tab}: tab-content tap targets ≥ §6.3 minimums at ${VIEWPORTS[vp].css.w}×${VIEWPORTS[vp].css.h}`, session: s }, async () => ({
          pass: !a.error && mine.red.length === 0 && mine.yellow.length === 0 && a.n > 0,
          detail: a.error || describeAudit(mine), metrics: a.error ? null : { n: a.n, red: mine.red.slice(0, 12), yellow: mine.yellow.slice(0, 12) },
        }));
      }
      await suite.errors({ id: `taps.${vp}.errors`, group: 'taps' }, s);
      await s.close();
    }
  }, env);

  // ── gallery (acceptance 5) ───────────────────────────────────────────────────────────────────
  await suite.group('gallery', async () => {
    const s = await env.page('desk', 'tools/gallery_turntable.html', { wait: false });
    await s.page.waitForFunction('window.__ready === true', null, { timeout: 90000, polling: 200 });
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const shot = path.join(SHOT_DIR, 'gallery.png');
    await s.page.screenshot({ path: shot, fullPage: true });
    const info = await s.eval(() => ({ rows: window.__tt.rows, hv: window.__tt.heroView, heroes: window.__tt.heroes }));
    await suite.check({ id: 'gallery.render', group: 'gallery', ...G, title: 'gallery: 6 heroes × 3 looks × 8 yaws render (painted views loaded)' }, async () => ({
      pass: info.heroes.length === 6 && info.rows.length === 18 && info.rows.every((r) => r.painted),
      detail: `${info.heroes.join(', ')}; painted ${info.rows.filter((r) => r.painted).length}/18; HERO_VIEW ${fmt(info.hv)}; ${shot}`,
    }));
    await suite.errors({ id: 'gallery.errors', group: 'gallery' }, s);
    // renderer-contract metrics per hero (promoted look): front vs back, front symmetry, cape covers the back (equipped look)
    const m = await s.eval(() => {
      const T = window.__tt, W = 160, H = 190;
      const px = (c) => c.getContext('2d').getImageData(0, 0, W, H).data;
      const out = [];
      for (let hi = 0; hi < T.heroes.length; hi++) {
        const f = px(T.render(hi, 1, 90, W, H)), b = px(T.render(hi, 1, -90, W, H));
        let uni = 0, diff = 0, ia = 0, ua = 0;
        for (let i = 0; i < f.length; i += 4) {
          const af = f[i + 3] > 40, ab = b[i + 3] > 40;
          if (af || ab) { uni++; if (af !== ab || Math.abs(f[i] - b[i]) + Math.abs(f[i + 1] - b[i + 1]) + Math.abs(f[i + 2] - b[i + 2]) > 90) diff++; }
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const a1 = f[(y * W + x) * 4 + 3] > 40, a2 = f[(y * W + (W - 1 - x)) * 4 + 3] > 40;
          if (a1 && a2) ia++; if (a1 || a2) ua++;
        }
        // cape: equipped look back view with vs without the cloak, torso box (upper-middle of the figure)
        const cb = px(T.render(hi, 2, -90, W, H)), nb = px(T.renderNoCape(hi, 2, -90, W, H));
        let tor = 0, cov = 0;
        for (let y = Math.round(H * 0.3); y < Math.round(H * 0.65); y++) for (let x = Math.round(W * 0.35); x < Math.round(W * 0.65); x++) {
          const i = (y * W + x) * 4;
          if (nb[i + 3] > 40 || cb[i + 3] > 40) { tor++; if (Math.abs(cb[i] - nb[i]) + Math.abs(cb[i + 1] - nb[i + 1]) + Math.abs(cb[i + 2] - nb[i + 2]) + Math.abs(cb[i + 3] - nb[i + 3]) > 60) cov++; }
        }
        out.push({ hero: T.heroes[hi], frontBack: uni ? diff / uni : 0, sym: ua ? ia / ua : 0, cape: tor ? cov / tor : 0, hasCape: T.rows[hi * 3 + 2].cape });
      }
      return out;
    });
    for (const r of m) {
      await suite.check({ id: `gallery.contract.${r.hero}`, group: 'gallery', issue: null, pkg: 'ART-HERO-B', gate: 'ART-HERO-B', title: `${r.hero}: front ≠ back (> 8 %), front symmetric (silhouette IoU ≥ 0.8), cape covers the back (≥ 30 % of the torso)` }, async () => ({
        pass: r.frontBack > 0.08 && r.sym >= 0.8 && (!r.hasCape || r.cape >= 0.3),
        detail: `front/back differ ${(r.frontBack * 100).toFixed(1)} %, front mirror IoU ${r.sym.toFixed(2)}, cape covers ${(r.cape * 100).toFixed(0)} % of the back torso${r.hasCape ? '' : ' (no cape item)'}`,
      }));
    }
    await s.close();
  }, env);

  // ── perf: menu equip at fhd2x high (acceptance 6, P-11) ───────────────────────────────────────
  await suite.group('perf', async () => {
    const s = await menuPage('fhd2x', 'equip', { settings: { quality: 'high' } });
    await s.wait(1500);
    const r = await s.eval(() => {
      const g = window.__game, times = [];
      for (let i = 0; i < 6; i++) g.render();                  // warm-up (layer caches, glyphs)
      for (let i = 0; i < 40; i++) { const t0 = performance.now(); g.render(); times.push(performance.now() - t0); }
      times.sort((a, b) => a - b);
      const cv = g.canvas;
      return { med: times[20], p90: times[36], avg: times.reduce((a, b) => a + b, 0) / times.length, backing: `${cv.width}×${cv.height}`, scale: g.scale, uiK: g.uiK, tier: g.tier ?? g.quality };
    });
    await suite.check({ id: 'perf.equip.fhd2x', group: 'perf', issue: 'P-11', ...G, title: 'menu equip tab at fhd2x high renders in ≤ 20 ms per frame (median)', session: s }, async () => ({
      pass: r.med <= 20, detail: `median ${r.med.toFixed(1)} ms, p90 ${r.p90.toFixed(1)} ms, avg ${r.avg.toFixed(1)} ms (backing ${r.backing}, scale ${r.scale.toFixed(2)}, tier ${r.tier}) — was 172 ms`, metrics: r,
    }));
    await suite.errors({ id: 'perf.errors', group: 'perf' }, s);
    await s.close();
  }, env);
} finally {
  await env.close();
}
process.exit(await suite.finish());
