// CDP touch helpers and a driver for the virtual pad (platform.md §5; MASTER_PLAN §1.4 touch layout).
//
//   const t = new Touch(s.cdp, s.page);
//   await t.tap(300, 200);                          // one finger, CSS px (client coordinates)
//   await t.drag(300, 260, 300, 100, { steps: 10 }); // swipe / scroll
//   await t.down(1, x, y); await t.move(1, x2, y2); await t.up(1);   // multi-touch by finger id
//
//   const pad = await padLayout(s.page);            // { source, visible, buttons: { attack: {cx, cy, d, x, y, w, h}, … } }
//   await pressButton(t, s.page, 'attack', 120);    // presses the canvas pad (#tpad) or the legacy DOM pad by button id
//   await stickHold(t, s.page, 40, 0, 500);         // floating stick: touch in the left zone and push +40 px right
//   await padVisible(s.page)                        // { visible, source }
//   await waitPadVisible(s.page, false, 1500)       // { ok, ms, ticks, source } — frame-accurate latency
//   await ensureTouchMode(t, s.page)                // back to touch mode after a keyboard press (neutral tap)
//
import { waitFrames } from './server.mjs';

// Button ids: attack jump dash sub skill1 skill2 ult swap mount guard pause bag (fullscreen on the legacy pad).
// Sources, in order: the canvas pad API touchpad.buttons() (PLAT-TOUCH), touchpad.occupiedRects() entries that carry an id,
// the legacy DOM pad (#touch [data-act]), and finally the MASTER_PLAN §1.4 layout model (layoutModel()).

export class Touch {
  constructor(cdp, page) { this.cdp = cdp; this.page = page; this.active = new Map(); }
  _points() { return [...this.active.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 6, radiusY: 6, force: 1 })); }
  async down(id, x, y) { this.active.set(id, { x, y }); await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this._points() }); }
  async move(id, x, y) { if (!this.active.has(id)) return; this.active.set(id, { x, y }); await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this._points() }); }
  async up(id) { if (!this.active.delete(id)) return; await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: this._points() }); }
  async upAll() { for (const id of [...this.active.keys()]) await this.up(id); }
  async tap(x, y, ms = 60, id = 91) { await this.down(id, x, y); await this.page.waitForTimeout(ms); await this.up(id); }
  /** Straight-line drag. hold: ms to wait at the end before lifting (0 = fling). */
  async drag(x0, y0, x1, y1, { steps = 10, stepMs = 16, id = 92, hold = 0, lift = true } = {}) {
    await this.down(id, x0, y0);
    for (let i = 1; i <= steps; i++) {
      await this.move(id, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
      await this.page.waitForTimeout(stepMs);
    }
    if (hold) await this.page.waitForTimeout(hold);
    if (lift) await this.up(id);
  }
  async longPress(x, y, ms = 600, id = 93) { await this.down(id, x, y); await this.page.waitForTimeout(ms); await this.up(id); }
}

/** Default layout, size class S, CSS px from the safe-area bottom-right corner (MASTER_PLAN §1.4). */
export const LAYOUT_S = {
  attack: { right: 108, bottom: 58, d: 72 },
  jump: { right: 36, bottom: 118, d: 68 },
  dash: { right: 190, bottom: 44, d: 56 },
  sub: { right: 118, bottom: 146, d: 54 },
  skill1: { right: 190, bottom: 122, d: 54 },
  skill2: { right: 50, bottom: 200, d: 54 },
  ult: { right: 262, bottom: 96, d: 58 },
  swap: { right: 128, bottom: 214, d: 44 },
  mount: { right: 262, bottom: 176, d: 48 },
  guard: { right: 196, bottom: 200, d: 48 },
};
export const PAD_BUTTON_IDS = Object.keys(LAYOUT_S);
export const SIZE_CLASS = (cssH) => (cssH < 400 ? { id: 'S', k: 1 } : cssH < 700 ? { id: 'M', k: 1.1 } : { id: 'L', k: 1.25 });

/**
 * The §1.4 layout for a CSS viewport (no tablet band handling): {id: {cx, cy, d}} in client px.
 * Used as the last-resort driver source and by the static layout checks.
 */
export function layoutModel(cssW, cssH, { touchScale = 1, insets = { l: 0, r: 0, t: 0, b: 0 }, leftHanded = false, ids = PAD_BUTTON_IDS } = {}) {
  const k = SIZE_CLASS(cssH).k * touchScale;
  const out = {};
  for (const id of ids) {
    const L = LAYOUT_S[id];
    let cx = cssW - insets.r - L.right * k;
    const cy = cssH - insets.b - L.bottom * k;
    if (leftHanded) cx = cssW - cx;
    const d = L.d * k;
    out[id] = { cx, cy, d, x: cx - d / 2, y: cy - d / 2, w: d, h: d };
  }
  return out;
}

/** Min circle-to-circle gap (px) and the pair, over a {id:{cx,cy,d}} map. */
export function minGap(buttons) {
  const ids = Object.keys(buttons);
  let best = { gap: Infinity, a: null, b: null };
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = buttons[ids[i]], B = buttons[ids[j]];
    const gap = Math.hypot(A.cx - B.cx, A.cy - B.cy) - A.d / 2 - B.d / 2;
    if (gap < best.gap) best = { gap, a: ids[i], b: ids[j] };
  }
  return best;
}

/**
 * Current pad layout in client CSS px. { source: 'tpad'|'dom'|'model'|'none', visible, buttons, stick, all }
 * all=true asks the canvas pad for every button of the layout, including ones hidden for the current state (mount/guard).
 */
export async function padLayout(page, { all = false } = {}) {
  return page.evaluate(async ({ all, LAYOUT }) => {
    const g = window.__game;
    const cv = document.getElementById('screen')?.getBoundingClientRect();
    const toCss = (r) => (cv && g ? { x: cv.x + (r.x * cv.width) / g.viewW, y: cv.y + (r.y * cv.height) / g.viewH, w: (r.w * cv.width) / g.viewW, h: (r.h * cv.height) / g.viewH } : r);
    const norm = (b) => { const d = b.d ?? Math.min(b.w, b.h); const cx = b.cx ?? b.x + b.w / 2, cy = b.cy ?? b.y + b.h / 2; return { cx, cy, d, x: cx - (b.w ?? d) / 2, y: cy - (b.h ?? d) / 2, w: b.w ?? d, h: b.h ?? d }; };
    const tpad = document.getElementById('tpad');
    if (tpad) {
      let tp = null;
      try { tp = (await import('/src/core/touchpad.js')).touchpad; } catch { tp = null; }
      const vis = (() => { const c = document.getElementById('tpadcv') || tpad; const s = getComputedStyle(c); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.02 && (tp?.visible ?? true); })();
      let list = null, unit = 'css';
      if (typeof tp?.buttons === 'function') { try { list = tp.buttons({ all }); } catch { list = null; } }
      if (!list && typeof tp?.occupiedRects === 'function') { try { const r = tp.occupiedRects(); if (r?.some?.((x) => x.id)) { list = r.filter((x) => x.id); unit = 'logical'; } } catch { list = null; } }
      const buttons = {};
      for (const b of list || []) buttons[b.id] = norm(unit === 'logical' ? toCss(b) : b);
      let stick = null;
      try { const z = tp?.stickZone?.(); if (z) stick = toCss(z); } catch { stick = null; }
      return { source: list ? 'tpad' : 'tpad-noapi', visible: vis, buttons, stick, all };
    }
    const root = document.getElementById('touch');
    if (root) {
      const s = getComputedStyle(root);
      const visible = s.display !== 'none' && s.visibility !== 'hidden' && !root.classList.contains('hidden') && !root.classList.contains('scene-off');
      const buttons = {};
      for (const el of root.querySelectorAll('[data-act], #fsBtn')) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const act = el.id === 'pauseBtn' ? 'pause' : el.id === 'fsBtn' ? 'fullscreen' : el.dataset.act.split(',')[0];
        buttons[act] = { cx: r.x + r.width / 2, cy: r.y + r.height / 2, d: Math.min(r.width, r.height), x: r.x, y: r.y, w: r.width, h: r.height };
      }
      const st = root.querySelector('#stick')?.getBoundingClientRect();
      return { source: 'dom', visible, buttons, stick: st ? { x: st.x, y: st.y, w: st.width, h: st.height } : null, all };
    }
    return { source: 'none', visible: false, buttons: {}, stick: null, all };
  }, { all, LAYOUT: LAYOUT_S });
}

/** { visible, source } of the virtual pad right now. */
export async function padVisible(page) {
  const L = await padLayout(page);
  return { visible: L.visible, source: L.source };
}

/**
 * Wait (in the page, frame by frame) until the pad visibility equals `want`.
 * → { ok, ms (wall time), ticks (game steps, 60 per simulated second), source }
 */
export async function waitPadVisible(page, want, timeoutMs = 1500) {
  return page.evaluate(async ({ want, timeoutMs }) => {
    // the canvas pad may hide by its own flag (touchpad.visible) while its layers keep their CSS: read both
    let tp = null;
    if (document.getElementById('tpad')) { try { tp = (await import('/src/core/touchpad.js')).touchpad; } catch { tp = null; } }
    return new Promise((resolve) => {
      const g = window.__game, t0 = performance.now(), f0 = g.frame;
      const vis = () => {
        const c = document.getElementById('tpadcv') || document.getElementById('tpad');
        if (c) { const s = getComputedStyle(c); return { v: s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.02 && (typeof tp?.visible === 'boolean' ? tp.visible : true), src: 'tpad' }; }
        const root = document.getElementById('touch');
        if (root) { const s = getComputedStyle(root); return { v: s.display !== 'none' && s.visibility !== 'hidden' && !root.classList.contains('hidden') && !root.classList.contains('scene-off'), src: 'dom' }; }
        return { v: false, src: 'none' };
      };
      const f = () => {
        const r = vis();
        const ms = performance.now() - t0;
        if (r.v === want) resolve({ ok: true, ms: Math.round(ms), ticks: g.frame - f0, source: r.src });
        else if (ms > timeoutMs) resolve({ ok: false, ms: Math.round(ms), ticks: g.frame - f0, source: r.src });
        else requestAnimationFrame(f);
      };
      f();
    });
  }, { want, timeoutMs });
}

/** The game's current input device: input.mode (PLAT-INPUT) or the legacy touchMode flag → 'touch' | 'kb'. */
export function inputMode(page) {
  return page.evaluate(() => { const i = window.__game?.input; return i?.mode ?? (i?.touchMode ? 'touch' : 'kb'); });
}

/**
 * Put the game back into touch mode (a keyboard press, e.g. skipDialogue's Enter, switches the device to 'kb').
 * Taps once at (x, y) client px — pick a spot with no control under it (default: middle of the screen, 30 % down,
 * which is empty in a stage). Returns the mode afterwards.
 */
export async function ensureTouchMode(t, page, at = null) {
  if ((await inputMode(page)) === 'touch') return 'touch';
  const [w, h] = await page.evaluate(() => [innerWidth, innerHeight]);
  const [x, y] = at || [Math.round(w * 0.5), Math.round(h * 0.3)];
  await t.tap(x, y, 50);
  await waitFrames(page, { ms: 120, frames: 3, ticks: 2 });
  return inputMode(page);
}

async function buttonCenter(page, id) {
  const L = await padLayout(page);
  let b = L.buttons[id];
  if (!b && (L.source === 'tpad-noapi' || L.source === 'none')) {
    const vp = await page.evaluate(() => [innerWidth, innerHeight]);
    b = layoutModel(vp[0], vp[1])[id];
  }
  if (!b) throw new Error(`pad button '${id}' not found (source ${L.source}; have ${Object.keys(L.buttons).join(',') || 'none'})`);
  return b;
}

/** Press a pad button by id for ms (touch down at its centre, lift). finger: CDP touch id. */
export async function pressButton(t, page, id, ms = 100, finger = 11) {
  const b = await buttonCenter(page, id);
  await t.down(finger, b.cx, b.cy);
  await waitFrames(page, { ms, frames: 3, ticks: 2 });
  await t.up(finger);
  await waitFrames(page, { ms: 40, frames: 2, ticks: 1 });
  return b;
}
/** Touch down on a button and keep holding (release with t.up(finger)). */
export async function holdButton(t, page, id, finger = 12) {
  const b = await buttonCenter(page, id);
  await t.down(finger, b.cx, b.cy);
  return b;
}

/**
 * Stick input: touch down in the stick zone (floating stick: left 45 % of the screen, below the top 64 px;
 * legacy DOM pad: the #stick centre), move by (dx, dy) CSS px in a few steps, hold ms, lift (unless keep).
 */
export async function stickHold(t, page, dx, dy, ms = 400, { finger = 21, keep = false, at = null } = {}) {
  const L = await padLayout(page);
  const vp = await page.evaluate(() => [innerWidth, innerHeight]);
  let x0, y0;
  if (at) [x0, y0] = at;
  else if (L.source === 'dom' && L.stick) { x0 = L.stick.x + L.stick.w / 2; y0 = L.stick.y + L.stick.h / 2; }
  else { x0 = Math.round(vp[0] * 0.2); y0 = Math.round(vp[1] * 0.68); }
  await t.down(finger, x0, y0);
  await page.waitForTimeout(30);
  for (let i = 1; i <= 4; i++) { await t.move(finger, x0 + (dx * i) / 4, y0 + (dy * i) / 4); await page.waitForTimeout(16); }
  await waitFrames(page, { ms, frames: 3, ticks: 2 });
  if (!keep) { await t.up(finger); await waitFrames(page, { ms: 40, frames: 2, ticks: 1 }); }
  return { x0, y0 };
}
