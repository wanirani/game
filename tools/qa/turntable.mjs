// Turntable suite — platform.md §7.1–7.3, §11 WP-5 acceptance 1–6 (user request #6: rotate the hero in the menu).
//
//   node tools/qa/turntable.mjs [--only drag,fling,keys,stick,wheel,auto,showcase,reveal,touch,edges,fallback,taps,gallery,perf] [--strict] [--shots]
//
// Checks (status, equip and class tabs unless noted):
//   drag      mouse drag of 1.1 × stage width rotates 180° ± 10° (right = yaw decreases, grab-the-surface)       — acceptance 1
//   fling     a fast drag released without a pause settles on a 45° step within 1.2 s (game time)               — acceptance 1
//   keys      hold , / . 0.5 s = ±1.3 rad (2.6 rad/s); / toggles auto-spin; / / (double) resets                   — acceptance 2
//   stick     fake pad right stick X = 1 for 0.5 s ≈ 1.6 rad; R3 resets to the default view and toggles auto-spin — acceptance 2
//             + status → equip → class reached with RB (real flow, no rest()): the stick rotates on tab entry and
//             during a showcase (and ends it) on every turntable tab                                             — #371
//   wheel     one notch over the stage = 22.5° then the next 45° step; wheel over another panel does not rotate    — §7.2
//   auto      auto-spin starts after 6 s idle, stops on input, never with reduceMotion                              — acceptance 3
//   showcase  a tap on the hero plays the showcase in profile and yaw returns to the user's angle; double tap resets — acceptance 4
//   reveal    equipping armour/head/cloak/accessory spins one full turn (0.8 s) back to the same angle              — §7.2
//             + a right stick pushed mostly up/down (list scroll) does not rotate
//   touch     phone2 touch: ⟳ tap = 45° step, ⟲ hold = continuous (no long-press buzz), ▶ spins at once,
//             a swipe on the stage rotates and keeps the tab                                                     — §7.2, §5.6
//   edges     a drag cut short by a tab switch does not fling on return; a short , . tap = one step; the 영웅 자동 회전
//             setting changed over the menu is followed; the class tab keeps the chosen angle across a view drop-out
//   fallback  painted views unavailable (puppets off): label '옆모습', default 0°, no auto-spin, rests on a profile    — §7.3 fallback
//   taps      tap audit of the three tabs at 740×360 and 844×390 (§6.3)                                               — P-04
//   gallery   tools/gallery_turntable.html: CHAR_ORDER heroes (7) × 3 looks × 8 yaws, zero page errors; with the renderer contract:
//             front vs back differ > 8 %, front view left-right symmetric, cape covers the back (gated on ART-HERO-B)  — acceptance 5
//             + a yaw view costs ≤ 1.5 × the side view per drawHero (CPU time; gated on ART-HERO-B)                      — §7.3
//   perf      menu equip tab at fhd2x high renders in ≤ 20 ms per frame (main-thread CPU, chrome/tab split)     — acceptance 6, P-11
// Gameplay-time checks run on a frozen, stepped clock (requestAnimationFrame/performance.now replaced; step(n) advances n
// frames of 1/60 s) so a loaded machine cannot change the result. Report: /tmp/claude-0/qa/platform/turntable.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Suite, fmt } from './lib/suite.mjs';
import { openEnv, REPORT_DIR } from './lib/server.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';
import { Touch, ensureTouchMode } from './lib/touch.mjs';
import { installTapRecorder, auditScene, describeAudit } from './lib/taps.mjs';
import { fakePadInit, connect, axes, setButton, BTN } from './lib/fakepad.mjs';
import { CHAR_ORDER } from '../../src/data/characters.js';

const suite = new Suite('turntable');
const env = await openEnv();
const TABS = ['status', 'equip', 'class'];
const MENU_TAB_COUNT = 12;   // RB presses before giving up on reaching a tab (MENU_TABS has 10; RB wraps)
const PI = Math.PI, DEG = PI / 180;
const G = { pkg: 'PLAT-TURNTABLE', gate: 'PLAT-TURNTABLE' };
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
    window.__realRaf = window.requestAnimationFrame.bind(window);
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
/** Chrome delivers mouse moves and wheel events aligned to its own (native) frames: wait for one before stepping. */
const flush = (s) => s.eval(() => new Promise((r) => window.__realRaf(() => setTimeout(r, 0))));
const mmove = async (s, x, y) => { await s.page.mouse.move(x, y); await flush(s); };
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
    let s;
    try { s = await menuPage('desk', tab); await freeze(s); } catch (e) {
      await suite.check({ id: `desk.${tab}.open`, group: 'errors', title: `${tab}: the menu tab opens` }, async () => { throw e; });
      await env.closeSessions();
      continue;
    }

    await suite.group('drag', async () => {
      await rest(s); await step(s, 2);
      const a = await view(s);
      // drag toward the open side of the screen (the game reads pointer moves over the canvas only)
      const vw = await s.eval(() => innerWidth);
      const dir = a.rect.x + a.rect.w / 2 + 1.1 * a.rect.w < vw - 8 ? 1 : -1;
      const cx = a.rect.x + a.rect.w * (dir > 0 ? 0.3 : 0.7), cy = a.rect.y + a.rect.h * 0.55, dx = 1.1 * a.rect.w * dir;
      await mmove(s, cx, cy); await step(s, 1);
      await s.page.mouse.down(); await flush(s); await step(s, 2);
      for (let i = 1; i <= 24; i++) { await mmove(s, cx + (dx * i) / 24, cy); await step(s, 1); }
      await step(s, 10);                                         // hold still ≥ 80 ms → no fling
      const mid = await view(s);
      await s.page.mouse.up(); await flush(s); await step(s, 2);
      await settle(s);
      const b = await view(s);
      const turned = b.yaw - a.yaw;
      await suite.check({ id: `drag.${tab}`, group: 'drag', ...G, title: `${tab}: mouse drag of 1.1 × stage width rotates 180° ± 10°`, session: s }, async () => ({
        pass: Math.abs(Math.abs(turned) - PI) <= 10 * DEG && Math.sign(turned) === -dir,
        detail: `stage ${a.rect.uw.toFixed(0)} UI px, drag ${dx.toFixed(0)} CSS px (${dir > 0 ? 'right' : 'left'}) → while held ${d(mid.yaw - a.yaw)}, settled ${d(turned)} (mode ${b.mode}, view '${b.label}')`,
      }));
    }, { closeSessions: async () => {} });

    await suite.group('fling', async () => {
      await rest(s); await step(s, 2);
      const a = await view(s);
      const cx = a.rect.x + a.rect.w * 0.25, cy = a.rect.y + a.rect.h * 0.55;
      await mmove(s, cx, cy); await step(s, 1);
      await s.page.mouse.down(); await flush(s); await step(s, 1);
      for (let i = 1; i <= 5; i++) { await mmove(s, cx + i * 36, cy); await step(s, 1); }
      await s.page.mouse.up(); await flush(s); await step(s, 1);
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
      await mmove(s, a.rect.x + a.rect.w / 2, a.rect.y + a.rect.h / 2); await step(s, 2);
      await s.page.mouse.wheel(0, 100); await flush(s); await flush(s); await step(s, 12);
      const b = await view(s);
      await step(s, 40); await settle(s);
      const c = await view(s);
      // wheel over the other panels (right side of the menu) must not rotate
      await mmove(s, a.rect.x + a.rect.w + 260, a.rect.y + a.rect.h * 0.8); await step(s, 2);
      const e0 = await view(s);
      await s.page.mouse.wheel(0, 300); await flush(s); await flush(s); await step(s, 20);
      const e1 = await view(s);
      await suite.check({ id: `wheel.${tab}`, group: 'wheel', ...G, title: `${tab}: one wheel notch over the stage = 22.5°, then the next step; wheel elsewhere does not rotate` }, async () => ({
        pass: Math.abs((b.yaw - a.yaw) + 22.5 * DEG) <= 3 * DEG && onStep(c.yaw, c.step) && Math.abs(c.yaw - a.yaw) > 20 * DEG && Math.abs(e1.yaw - e0.yaw) < 1e-6,
        detail: `notch → ${d(b.yaw - a.yaw)} after 0.2 s, rests at ${d(c.yaw - a.yaw)}; wheel over another panel → ${d(e1.yaw - e0.yaw)}`,
      }));
    });

    await suite.group('auto', async () => {
      await rest(s, { autoSpin: true }); await step(s, 2);
      await mmove(s, 2, 2); await step(s, 2);            // park the mouse (moving it resets the idle timer)
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
      await mmove(s, cx, cy); await step(s, 1);
      await s.page.mouse.down(); await flush(s); await step(s, 2); await s.page.mouse.up(); await flush(s); await step(s, 2);
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
      for (let i = 0; i < 2; i++) { await s.page.mouse.down(); await flush(s); await step(s, 2); await s.page.mouse.up(); await flush(s); await step(s, 5); }
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
    // the right stick also scrolls lists (Scroller, Y): pushing it mostly up/down must not turn the hero
    await rest(s); await step(s, 4);
    const v0 = await view(s);
    await axes(s.page, 0, 0, 0.25, 0.95); await step(s, 60); await axes(s.page, 0, 0, 0, 0); await step(s, 2); await settle(s);
    const v1 = await view(s);
    await suite.check({ id: 'stick.vertical', group: 'stick', ...G, title: 'right stick pushed mostly vertically (list scroll) does not rotate the hero' }, async () => ({
      pass: Math.abs(v1.yaw - v0.yaw) < 1e-6,
      detail: `RS (0.25, 0.95) for 1 s → ${d(v1.yaw - v0.yaw)}`,
    }));
    // every turntable tab (#371): the real pad flow — RB moves to the tab (no seeding, no rest()), the stick is pushed
    // right away (whatever the tab-entry state is: intro delay, spin-in tween), then again while a showcase plays
    // (the intro's showcase), so a tab whose entry/showcase state swallows the stick shows up here
    const tabName = () => s.eval(() => (window.__game.top?.cur?.constructor?.name || '').toLowerCase());
    const push = async () => {
      const a = await view(s);
      await axes(s.page, 0, 0, 1, 0); await step(s, 30);
      const b = await view(s);
      await axes(s.page, 0, 0, 0, 0); await step(s, 2); await settle(s);
      return { a, b, dy: b && a ? b.yaw - a.yaw : NaN };
    };
    const rotOk = (r) => Math.abs(Math.abs(r.dy) - 1.6) <= 0.12 && r.dy < 0;
    for (const tab of TABS) {
      let name = await tabName();
      for (let i = 0; i < MENU_TAB_COUNT && !name.startsWith(tab); i++) {
        await setButton(s.page, BTN.RB, 1); await step(s, 3); await setButton(s.page, BTN.RB, 0); await step(s, 3);
        name = await tabName();
      }
      const reached = name.startsWith(tab);
      let entry = null, show = null;
      if (reached && tab !== 'status') { await step(s, 4); entry = await push(); }   // status: its entry was covered by stick.rotate above
      if (reached) {
        await s.eval(() => { const v = window.__game.top.cur.view; v.autoSpin = false; v.cool = 99; v.showcase(); });
        await step(s, 40);   // the spin to profile (TT.SHOW_T) is over and the showcase moves are playing
        const playing = (await view(s))?.seq;
        show = { playing, ...(await push()) };
        show.after = (await view(s))?.seq;
      }
      if (tab !== 'status') {
        await suite.check({ id: `stick.rotate.${tab}`, group: 'stick', ...G, title: `${tab}: right stick X = 1 for 0.5 s rotates ≈ 1.6 rad (tab reached with RB)`, session: s }, async () => {
          if (!reached) return { pass: false, detail: `RB did not reach the ${tab} tab (on ${name || 'nothing'})` };
          return { pass: rotOk(entry), detail: `on entry (mode ${entry.a?.mode}, showcase ${entry.a?.seq}): 0.5 s of RS X = 1 → ${entry.dy.toFixed(3)} rad` };
        });
      }
      await suite.check({ id: `stick.showcase.${tab}`, group: 'stick', ...G, title: `${tab}: the right stick rotates during a showcase and ends it`, session: s }, async () => {
        if (!reached) return { pass: false, detail: `RB did not reach the ${tab} tab (on ${name || 'nothing'})` };
        if (!show.playing) return { skip: `no showcase playing 40 frames after showcase() (mode ${show.a?.mode})` };
        return { pass: rotOk(show) && !show.after, detail: `showcase playing → 0.5 s of RS X = 1 → ${show.dy.toFixed(3)} rad; showcase after: ${show.after}` };
      });
    }
    await suite.errors({ id: 'stick.errors', group: 'stick' }, s);
    await s.close();
  }, env);

  // ── touch (phone2): buttons, swipe on the stage ───────────────────────────────────────────────
  await suite.group('touch', async () => {
    // navigator.vibrate is counted: holding ⟲ ⟳ is continuous rotation, not the menu's long press (no 10 ms buzz)
    const vib = () => { window.__vib = 0; const f = navigator.vibrate?.bind(navigator); navigator.vibrate = (p) => { window.__vib++; try { return f?.(p) ?? true; } catch { return false; } }; };
    const s = await menuPage('phone2', 'equip', { initScripts: [vib] });
    const t = new Touch(s.cdp, s.page);
    await freeze(s);
    await rest(s); await step(s, 8);
    const a = await view(s);
    const R = a.btns.find((b) => b.id === 'tt:R'), L = a.btns.find((b) => b.id === 'tt:L'), AU = a.btns.find((b) => b.id === 'tt:auto');
    if (!R || !L) {
      await suite.check({ id: 'touch.buttons', group: 'touch', ...G, title: 'touch: ⟲ ⟳ buttons are shown in touch mode', session: s }, async () => ({ pass: false, detail: `buttons ${fmt(a.btns)}` }));
    } else {
      await t.down(31, R.x, R.y); await step(s, 3); await t.up(31); await step(s, 2); await settle(s);
      const b = await view(s);
      const vib0 = await s.eval(() => window.__vib);
      await t.down(32, L.x, L.y); await step(s, 54); await t.up(32); await step(s, 2); await settle(s);
      const c = await view(s);
      const vib1 = await s.eval(() => window.__vib);
      await suite.check({ id: 'touch.buttons', group: 'touch', ...G, title: 'touch: ⟳ tap = one 45° step right, ⟲ hold = continuous rotation left (no long-press buzz)', session: s }, async () => ({
        pass: Math.abs((b.yaw - a.yaw) + b.step) < 0.01 && (c.yaw - b.yaw) > b.step + 0.3 && onStep(c.yaw, c.step) && R.r * 2 >= 24 && vib1 === vib0,
        detail: `⟳ tap → ${d(b.yaw - a.yaw)}; ⟲ hold 0.9 s → ${d(c.yaw - b.yaw)} (rests on a step: ${onStep(c.yaw, c.step)}); vibrate calls during the hold ${vib1 - vib0}; button ⌀ ${(R.r * 2).toFixed(0)} CSS px + registry slop`,
      }));
      // ▶ turns auto-spin on and spins at once (the finger's release must not stop it again)
      if (AU) {
        await s.eval(() => { const v = window.__game.top.cur.view; v.autoSpin = false; v.idleT = 0; });
        await t.down(34, AU.x, AU.y); await step(s, 3); await t.up(34); await step(s, 12);
        const on = await view(s);
        await step(s, 30);
        const on2 = await view(s);
        await suite.check({ id: 'touch.auto', group: 'touch', ...G, title: 'touch: ▶ turns auto-spin on and the hero spins at once', session: s }, async () => ({
          pass: on.auto === true && on.spinning && on2.spinning && Math.abs(on2.yaw - on.yaw) > 0.2,
          detail: `after ▶: auto ${on.auto}, spinning ${on.spinning}; 0.5 s later spinning ${on2.spinning}, turned ${d(on2.yaw - on.yaw)}`,
        }));
      }
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

  // ── edges: tab switch mid-drag, short key taps, settings changed over the menu, class angle kept across a load ──
  await suite.group('edges', async () => {
    const s = await menuPage('desk', 'status');
    await freeze(s);
    // (1) switch tabs (E) while dragging, release on the other tab, come back (Q): no stale fling
    await rest(s); await step(s, 2);
    const a = await view(s);
    const cx = a.rect.x + a.rect.w * 0.3, cy = a.rect.y + a.rect.h * 0.55;
    await mmove(s, cx, cy); await step(s, 1);
    await s.page.mouse.down(); await flush(s); await step(s, 2);
    for (let i = 1; i <= 6; i++) { await mmove(s, cx + i * 25, cy); await step(s, 1); }
    await s.page.keyboard.down('KeyE'); await step(s, 3); await s.page.keyboard.up('KeyE'); await step(s, 3);
    await s.page.mouse.up(); await flush(s); await step(s, 20);
    await s.page.keyboard.down('KeyQ'); await step(s, 3); await s.page.keyboard.up('KeyQ'); await step(s, 2);
    const back = await view(s);
    await settle(s);
    const back2 = await view(s);
    await suite.check({ id: 'edges.tabswitch', group: 'edges', ...G, title: 'a drag cut short by a tab switch does not fling when the tab comes back', session: s }, async () => ({
      pass: back.mode !== 'free' && Math.abs(back.vel) < 3 && onStep(back2.yaw, back2.step) && Math.abs(back2.yaw - a.yaw) <= PI / 2 + 1e-6,
      detail: `back on the tab: mode ${back.mode}, velocity ${back.vel.toFixed(2)} rad/s → rests at ${d(back2.yaw)} (was ${d(a.yaw)})`,
    }));
    // (1b) a fling whose drag crosses the ±4π re-centre (yaw grows during long auto-spins) keeps its direction
    await rest(s); await s.eval(() => { const v = window.__game.top.cur.view; v.yaw = v.yawGoal = v.userYaw = 4 * Math.PI - 0.05; }); await step(s, 2);
    const w0 = await view(s);
    const fx = w0.rect.x + w0.rect.w * 0.75, fy = w0.rect.y + w0.rect.h * 0.55;
    await mmove(s, fx, fy); await step(s, 1);
    await s.page.mouse.down(); await flush(s); await step(s, 2);
    for (let i = 1; i <= 6; i++) { await mmove(s, fx - i * 10, fy); await step(s, 1); }   // drag left = yaw grows past 4π (≈ 5.7 rad/s)
    await s.page.mouse.up(); await flush(s); await step(s, 1);
    const w1 = await view(s);
    await settle(s);
    await suite.check({ id: 'edges.recentre', group: 'edges', ...G, title: 'a fling across the yaw re-centre keeps the drag direction (no reversed max-speed spin)' }, async () => ({
      pass: w1.vel > 0.5 && w1.vel < 12 - 1e-6,
      detail: `drag left from ${d(w0.yaw)}: release velocity ${w1.vel.toFixed(2)} rad/s (mode ${w1.mode}; + = the drag's direction)`,
    }));
    // (2) ten short '.' taps (2 frames each) = ten 45° steps
    await rest(s); await step(s, 2);
    const k0 = await view(s);
    for (let i = 0; i < 10; i++) { await s.page.keyboard.down('Period'); await step(s, 2); await s.page.keyboard.up('Period'); await step(s, 1); }
    await settle(s);
    const k1 = await view(s);
    await suite.check({ id: 'edges.keytaps', group: 'edges', ...G, title: 'a short , / . tap turns one step (ten taps = ten steps)' }, async () => ({
      pass: Math.abs((k1.yaw - k0.yaw) / k1.step + 10) < 0.01,
      detail: `${d(k0.yaw)} → ${d(k1.yaw)} (${((k1.yaw - k0.yaw) / k1.step).toFixed(2)} steps)`,
    }));
    // (3) the 영웅 자동 회전 setting changed while the menu is open (options opens over the menu) is followed
    await rest(s, { autoSpin: true }); await step(s, 2);
    await s.eval(() => { window.__game.settings.turntableAuto = false; }); await step(s, 3);
    const off = await view(s);
    await s.eval(() => { window.__game.settings.turntableAuto = true; }); await step(s, 3);
    const onv = await view(s);
    await suite.check({ id: 'edges.setting', group: 'edges', ...G, title: 'turning 영웅 자동 회전 off/on over the menu is followed by the open tab' }, async () => ({
      pass: off.auto === false && onv.auto === true,
      detail: `setting off → autoSpin ${off.auto}; on → ${onv.auto}`,
    }));
    await suite.errors({ id: 'edges.errors.status', group: 'edges' }, s);
    // (4) class tab: the user's angle survives a moment without painted views (another class's turn sheet loading)
    // (the loop is frozen: open the tab and step frames until it has rendered with painted views)
    await s.eval(() => import(`/tools/menu_seed.js?tab=class&n=edges${Math.random().toString(36).slice(2)}`));
    for (let i = 0; i < 80; i++) { await step(s, 6); const v = await view(s); if (v?.rect && v.full && /class/i.test(await s.eval(() => window.__game.top.cur.constructor.name))) break; await s.wait(50); }
    await rest(s); await step(s, 2);
    await s.page.keyboard.down('Comma'); await step(s, 30); await s.page.keyboard.up('Comma'); await step(s, 2); await settle(s);
    const c0 = await view(s);
    await s.eval(async () => { const P = await import('/src/render/hero_puppet.js'); P.setPuppetEnabled(false); });
    await step(s, 45); await settle(s);
    const c1 = await view(s);
    await s.eval(async () => { const P = await import('/src/render/hero_puppet.js'); P.setPuppetEnabled(true); });
    await step(s, 45); await settle(s);
    const c2 = await view(s);
    await suite.check({ id: 'edges.keepangle', group: 'edges', ...G, title: 'class tab: the chosen angle comes back after painted views drop out and return', session: s }, async () => ({
      pass: !c1.full && c1.label === '옆모습' && Math.abs(Math.sin(c1.yaw)) < 1e-3 && c2.full && Math.abs(c2.yaw - c0.yaw) < 0.01 && Math.abs(Math.sin(c0.yaw)) > 0.5,
      detail: `rotated to ${d(c0.yaw)} → painted views off: ${d(c1.yaw)} '${c1.label}' (full ${c1.full}) → on again: ${d(c2.yaw)} (full ${c2.full})`,
    }));
    await suite.errors({ id: 'edges.errors', group: 'edges' }, s);
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
    await mmove(s, cx, cy); await step(s, 1); await s.page.mouse.down(); await flush(s); await step(s, 2);
    for (let i = 1; i <= 10; i++) { await mmove(s, cx + (a.rect.w * 0.35 * i) / 10, cy); await step(s, 1); }
    await step(s, 10); await s.page.mouse.up(); await flush(s); await step(s, 2); await settle(s);
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
    const NH = CHAR_ORDER.length;
    await suite.check({ id: 'gallery.render', group: 'gallery', ...G, title: `gallery: ${NH} heroes × 3 looks × 8 yaws render (painted views loaded)` }, async () => ({
      pass: info.heroes.join() === CHAR_ORDER.join() && info.rows.length === NH * 3 && info.rows.every((r) => r.painted),
      detail: `${info.heroes.join(', ')}; painted ${info.rows.filter((r) => r.painted).length}/${NH * 3}; HERO_VIEW ${fmt(info.hv)}; ${shot}`,
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
    // renderer cost (platform §7.3, MASTER_PLAN §5.2): a yaw view costs ≤ 1.5 × the side view (CPU time, interleaved runs)
    await s.cdp.send('Performance.enable');
    const cpu = async () => (await s.cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'ThreadTime')?.value ?? NaN;
    const YAWSET = [45, 90, 135, -45, -90, -135, 20, -160, 0, 180];
    await s.eval((Y) => { window.__tt.bench(null, 3); window.__tt.bench(Y, 3); }, YAWSET);
    const cost = { side: [], yaw: [] };
    // ≈ 0.3 ms per drawHero: batches of 12 × 6 draws (≈ 20 ms) were too short for ThreadTime on a loaded machine
    // (the ratio swung 0.65–1.46 between runs) → 40 × NH draws per batch, 5 interleaved batches, best of each
    const BN = 40;
    for (let rep = 0; rep < 5; rep++) {
      for (const k of ['side', 'yaw']) {
        const c0 = await cpu();
        await s.eval(([Y, k, n]) => window.__tt.bench(k === 'side' ? null : Y, n), [YAWSET, k, BN]);
        cost[k].push(((await cpu()) - c0) * 1000 / (BN * NH));
      }
    }
    const side = Math.min(...cost.side), yawC = Math.min(...cost.yaw);
    await suite.check({ id: 'gallery.cost', group: 'gallery', issue: null, pkg: 'ART-HERO-B', gate: 'ART-HERO-B', title: 'turntable view (opts.yaw) costs ≤ 1.5 × the side view per drawHero (platform §7.3)' }, async () => ({
      pass: yawC <= 1.5 * side,
      detail: `side ${side.toFixed(2)} ms, yaw ${yawC.toFixed(2)} ms per drawHero (×${(yawC / side).toFixed(2)}; CPU, ${NH} heroes × promoted look, yaws ${YAWSET.join('/')}°)`,
      metrics: { side, yaw: yawC, runs: cost },
    }));
    // front-symmetry floor per hero: isolde holds her spear upright on one side (a long vertical bar the mirror cannot match)
    // and her braid hangs over one shoulder, so her painted front view mirrors at 0.72–0.80 by design (docs/art/notes_hero7.md §4)
    const SYM_MIN = { isolde: 0.72 };
    for (const r of m) {
      const symMin = SYM_MIN[r.hero] ?? 0.8;
      await suite.check({ id: `gallery.contract.${r.hero}`, group: 'gallery', issue: null, pkg: 'ART-HERO-B', gate: 'ART-HERO-B', title: `${r.hero}: front ≠ back (> 8 %), front symmetric (silhouette IoU ≥ ${symMin}), cape covers the back (≥ 30 % of the torso)` }, async () => ({
        pass: r.frontBack > 0.08 && r.sym >= symMin && (!r.hasCape || r.cape >= 0.3),
        detail: `front/back differ ${(r.frontBack * 100).toFixed(1)} %, front mirror IoU ${r.sym.toFixed(2)}, cape covers ${(r.cape * 100).toFixed(0)} % of the back torso${r.hasCape ? '' : ' (no cape item)'}`,
      }));
    }
    await s.close();
  }, env);

  // ── perf: menu equip at fhd2x high (acceptance 6, P-11) ───────────────────────────────────────
  // Frame cost = main-thread CPU time (CDP Performance.getMetrics ThreadTime) of game.render() + a 1-px read-back that
  // forces the software raster, on a frozen loop. CPU time, not wall time: this machine often runs at load 40-60, which
  // multiplies wall time 5-10× but leaves CPU time roughly alone. The menu chrome alone (tab render stubbed) is reported
  // too, so the owner of the remaining cost is visible (tab content = PLAT-TURNTABLE, chrome = PLAT-MENU).
  await suite.group('perf', async () => {
    const s = await menuPage('fhd2x', 'equip', { settings: { quality: 'high' } });
    await s.wait(1500);
    await freeze(s);
    await s.cdp.send('Performance.enable');
    const cpu = async () => (await s.cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'ThreadTime')?.value ?? NaN;
    const run = (n, chrome) => s.eval(([n, chrome]) => {
      const g = window.__game, T = g.top.cur, probe = g.ctx || g.canvas.getContext('2d');
      const own = Object.prototype.hasOwnProperty.call(T, 'render');
      if (chrome) T.render = () => {};
      const w0 = Date.now();
      try { for (let i = 0; i < n; i++) { g.render(); probe.getImageData(0, 0, 1, 1); } } finally { if (chrome && !own) delete T.render; }
      return Date.now() - w0;
    }, [n, chrome]);
    await run(6, false); await run(4, true);                     // warm-up (layer caches, glyphs, JIT)
    // 4 interleaved batches, best of each: on this shared machine (load 20–45 on 4 cores) CPU time per frame swings ±20 %
    // between batches (SMT/cache contention); the minimum is the estimate closest to an unloaded desktop
    const N = 16, res = { full: [], chrome: [], wall: [] };
    for (let rep = 0; rep < 4; rep++) {
      for (const chrome of [false, true]) {
        const c0 = await cpu();
        const wall = await run(N, chrome);
        const c1 = await cpu();
        res[chrome ? 'chrome' : 'full'].push(((c1 - c0) * 1000) / N);
        if (!chrome) res.wall.push(wall / N);
      }
    }
    const info = await s.eval(() => { const g = window.__game, cv = g.canvas; return { backing: `${cv.width}×${cv.height}`, scale: g.scale, tier: g.tier ?? g.quality }; });
    const full = Math.min(...res.full), chrome = Math.min(...res.chrome), wall = Math.min(...res.wall);
    const load = os.loadavg()[0];
    const r = { cpuFull: +full.toFixed(1), cpuChrome: +chrome.toFixed(1), cpuTab: +(full - chrome).toFixed(1), wall: +wall.toFixed(1), load: +load.toFixed(1), ...info, runs: res };
    await suite.check({ id: 'perf.equip.fhd2x', group: 'perf', issue: 'P-11', ...G, title: 'menu equip tab at fhd2x high renders in ≤ 20 ms per frame (main-thread CPU)', session: s }, async () => ({
      pass: full <= 20,
      detail: `CPU ${full.toFixed(1)} ms/frame = menu chrome ${chrome.toFixed(1)} (PLAT-MENU: snapshot, backdrop layer, embers, bars) + tab ${(full - chrome).toFixed(1)} (stage, turntable, lists); wall ${wall.toFixed(1)} ms at load ${load.toFixed(0)}; backing ${info.backing}, scale ${info.scale.toFixed(2)}, tier ${info.tier} — was 172 ms`,
      metrics: r,
    }));
    await suite.errors({ id: 'perf.errors', group: 'perf' }, s);
    await s.close();
  }, env);
} finally {
  await env.close();
}
process.exit(await suite.finish());
