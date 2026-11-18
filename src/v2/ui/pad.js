// v2 touch controls (docs/v2/UI_API.md 3): a floating stick on the left and the five-button cluster on the right,
// plus "next target" above attack and a small pause button. The v1 pad (src/core/touchpad.js) is not used and not
// changed: this module draws its own DOM layer (#v2pad) and feeds the v1 input layer through input.touch.set / axis.
//
// Cost: each button is one small canvas that is redrawn only when its state changes (press, cooldown step, icon).
// Presses and the stick move with CSS transforms only. No backdrop-filter, no CSS filters, no per-frame work.
import { gem, plate, plateWidth, sprite, makeCanvas, onAtlas, clamp, TAU, COL, FONTS } from './draw.js';

/** id, input action(s), base diameter (CSS px at k = 1), default icon, default label, offset from the attack centre (x to the left, y up) */
export const BUTTONS = [
  { id: 'attack', act: 'attack', d: 92, icon: 'attack', label: '공격', ox: 0, oy: 0, tier: 0, tint: 'ruby', iconK: 0.74 },
  { id: 'jump', act: 'jump', d: 66, icon: 'jump', label: '점프', ox: 96, oy: -8, tier: 0, iconK: 0.7 },
  { id: 'roll', act: 'dash,guard', d: 66, icon: 'roll', label: '구르기', ox: 72, oy: 70, tier: 1, iconK: 0.76 },
  { id: 'skill', act: 'skill1', d: 62, icon: 'hook', label: '솜씨', ox: 44, oy: 152, tier: 2, iconK: 0.74 },
  { id: 'bell', act: 'ult', d: 62, icon: 'bell', label: '종', ox: 162, oy: 54, tier: 1, iconK: 0.72 },
  { id: 'lock', act: 'lock', d: 46, icon: 'next', label: '다음 적', ox: -10, oy: 82, tier: 1, iconK: 0.74 },
  { id: 'pause', act: '', d: 46, icon: 'pause', label: '멈춤', corner: true, iconK: 0.62 },
];
const MIN_D = 44, MARGIN = 20, HIT_PAD = 8, DEAD = 10, CD_STEPS = 40;
const LABEL_PX = { normal: 10.5, large: 12, xlarge: 13.5 };

/**
 * Pure layout. bounds = the safe rectangle in CSS px {l, t, r, b} (absolute edges), scale = touchScale setting.
 * Returns { k, buttons: [{id, cx, cy, d}], stick: {cx, cy, r, zone: {x, y, w, h}}, labelPx }.
 */
export function padLayout(bounds, scale = 1, textSize = 'normal', leftHanded = false) {
  const W = bounds.r - bounds.l, H = bounds.b - bounds.t;
  const k = clamp(Math.min(W, H) / 520, 0.8, 1) * clamp(scale, 0.8, 1.3);
  const labelPx = LABEL_PX[textSize] ?? LABEL_PX.normal, lh = labelPx * 1.5;
  const sz = (b) => Math.max(MIN_D, Math.round(b.d * k));
  const A = sz(BUTTONS[0]);
  const ax = bounds.r - MARGIN - A / 2, ay = bounds.b - MARGIN - lh * 0.75 - A / 2;
  const out = [];
  for (const b of BUTTONS) {
    const d = sz(b);
    if (b.corner) { out.push({ id: b.id, cx: bounds.r - 14 - d / 2, cy: bounds.t + 12 + d / 2, d }); continue; }
    // small buttons keep their gap when the 44 px floor makes them larger than the scaled size
    // and each tier above the bottom row moves up (and a little outward) by what a larger name plate needs
    const grow = (d - b.d * k) / 2, len = Math.hypot(b.ox, b.oy) || 1, more = Math.max(0, labelPx * 0.9 - 9 * k) * 1.5 * (b.tier || 0);
    const ox = b.ox * k + (b.ox / len) * grow + (b.ox > 20 ? more * 0.45 : 0), oy = b.oy * k + (b.oy / len) * grow + more;
    out.push({ id: b.id, cx: ax - ox, cy: ay - oy, d });
  }
  const sr = Math.round(66 * k);
  const stick = { cx: bounds.l + 30 + sr, cy: bounds.b - 30 - sr, r: sr, zone: { x: bounds.l, y: bounds.t + 64, w: W * 0.45, h: H - 64 } };
  if (leftHanded) {   // mirror the cluster and the stick; the pause button keeps its corner (the status block owns the top left)
    for (let i = 0; i < out.length; i++) if (!BUTTONS[i].corner) out[i].cx = bounds.l + bounds.r - out[i].cx;
    stick.cx = bounds.l + bounds.r - stick.cx; stick.zone.x = bounds.r - stick.zone.w;
  }
  return { k, labelPx, leftHanded, buttons: out, stick };
}

export function createPad(game, opts = {}) {
  const input = opts.input ?? game.input;
  const mount = opts.mount ?? document.getElementById('app') ?? document.body;
  const root = document.createElement('div');
  root.id = 'v2pad'; root.setAttribute('aria-hidden', 'true');
  root.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:12;pointer-events:none;touch-action:none;display:none;contain:layout style;user-select:none;-webkit-user-select:none;';
  mount.appendChild(root);

  const dpr = () => Math.min(window.devicePixelRatio || 1, 3);
  const B = BUTTONS.map((def) => {
    const cv = document.createElement('canvas');
    cv.className = 'v2b'; cv.dataset.id = def.id;
    cv.style.cssText = 'position:absolute;left:0;top:0;will-change:transform;transform-origin:50% 42%;transition:transform 70ms ease-out;';
    root.appendChild(cv);
    return { id: def.id, def, sent: '', cv, ctx: cv.getContext('2d'), cx: 0, cy: 0, d: 0, pad: 0, cw: 0, ch: 0, lw: 0, down: false, ptr: -1, t0: 0, cd: 0, charge: 0, disabled: false, icon: def.icon, label: def.label, dirty: true };
  });
  const byId = Object.fromEntries(B.map((b) => [b.id, b]));
  const mk = (cls) => { const c = document.createElement('canvas'); c.className = cls; c.style.cssText = 'position:absolute;left:0;top:0;will-change:transform,opacity;'; root.appendChild(c); return c; };
  const baseCv = mk('v2s-base'), knobCv = mk('v2s-knob');
  const S = { shown: false, want: true, modal: false, L: null, bounds: { l: 0, t: 0, r: 0, b: 0 }, textSize: 'normal', repaints: 0, layoutN: 0,
    stick: { ptr: -1, ox: 0, oy: 0, x: 0, y: 0, live: false, dir: [false, false, false, false] }, lastAlive: 0, idle: 0 };

  function readBounds() {
    const r = game.canvasRect ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    const ins = game.safeCss ?? { l: 0, t: 0, r: 0, b: 0 };
    const b = S.bounds;
    b.l = Math.max(r.x, ins.l); b.t = Math.max(r.y, ins.t);
    b.r = Math.min(r.x + r.w, window.innerWidth - ins.r); b.b = Math.min(r.y + r.h, window.innerHeight - ins.b);
    return b;
  }

  function layout() {
    const st = game.settings ?? {};
    S.textSize = st.textSize ?? 'normal';
    const L = (S.L = padLayout(readBounds(), Number(st.touchScale) || 1, S.textSize, !!st.touchLeftHanded));
    const s = dpr();
    const m = makeCanvas(2, 2).getContext('2d');
    for (const b of B) {
      const p = L.buttons.find((q) => q.id === b.id);
      b.cx = p.cx; b.cy = p.cy; b.d = p.d;
      b.lw = plateWidth(m, b.label, L.labelPx);
      b.pad = 9;
      b.cw = Math.max(b.d, b.lw) + b.pad * 2; b.ch = b.d + b.pad * 2 + L.labelPx * 0.95;
      b.cv.width = Math.ceil(b.cw * s); b.cv.height = Math.ceil(b.ch * s);
      b.cv.style.width = b.cw + 'px'; b.cv.style.height = b.ch + 'px';
      place(b); b.dirty = true;
    }
    // stick: base ring and knob, drawn once per layout
    const R = L.stick.r, bw = R * 2 + 16, kw = R * 0.92 + 12;
    baseCv.width = Math.ceil(bw * s); baseCv.height = Math.ceil(bw * s); baseCv.style.width = baseCv.style.height = bw + 'px';
    knobCv.width = Math.ceil(kw * s); knobCv.height = Math.ceil(kw * s); knobCv.style.width = knobCv.style.height = kw + 'px';
    drawStickBase(baseCv.getContext('2d'), bw, R, s); drawKnob(knobCv.getContext('2d'), kw, R * 0.46, s);
    S.stick.ox = L.stick.cx; S.stick.oy = L.stick.cy; S.stick.x = 0; S.stick.y = 0;
    // opacity goes on each small canvas, not on the full-screen root (a group opacity would cost a screen-sized surface)
    S.op = clamp(Number(st.touchOpacity ?? 0.95) + 0.05, 0.4, 1);
    for (const b of B) b.cv.style.opacity = String(S.op);
    baseCv.style.opacity = ''; moveStick();
    S.layoutN++;
    paint();
  }
  function place(b) { b.cv.style.transform = `translate3d(${(b.cx - b.cw / 2).toFixed(1)}px,${(b.cy - b.d / 2 - b.pad).toFixed(1)}px,0) scale(${b.down ? 0.94 : 1})`; }
  function moveStick() {
    const st = S.stick, L = S.L, bw = L.stick.r * 2 + 16, kw = L.stick.r * 0.92 + 12;
    const tr = st.live ? 'none' : 'transform 120ms ease-out';   // the knob eases home, but follows the finger without lag
    if (knobCv.style.transition !== tr) { knobCv.style.transition = tr; baseCv.style.transition = tr; }
    baseCv.style.transform = `translate3d(${(st.ox - bw / 2).toFixed(1)}px,${(st.oy - bw / 2).toFixed(1)}px,0)`;
    knobCv.style.transform = `translate3d(${(st.ox + st.x - kw / 2).toFixed(1)}px,${(st.oy + st.y - kw / 2).toFixed(1)}px,0)`;
    const o = String((st.live ? 1 : 0.66) * (S.op ?? 1));
    if (baseCv.style.opacity !== o) { baseCv.style.opacity = o; knobCv.style.opacity = String((st.live ? 1 : 0.8) * (S.op ?? 1)); }
  }

  function drawStickBase(ctx, w, R, s) {
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.clearRect(0, 0, w, w);
    const c = w / 2;
    let g = ctx.createRadialGradient(c, c, R * 0.2, c, c, R);
    g.addColorStop(0, 'rgba(14,18,40,0.05)'); g.addColorStop(0.8, 'rgba(10,12,30,0.16)'); g.addColorStop(1, 'rgba(4,5,16,0.40)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.fill();
    g = ctx.createRadialGradient(c, c - R, R * 0.1, c, c - R * 0.6, R);
    g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(c - R, c - R, 2 * R, R); ctx.restore();
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(232,238,255,0.72)'; ctx.beginPath(); ctx.arc(c, c, R - 0.7, 0, TAU); ctx.stroke();
    ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(c, c, R - 5, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(2,3,10,0.55)'; ctx.beginPath(); ctx.arc(c, c, R + 0.6, 0, TAU); ctx.stroke();
    // four thorn tips (the same motif as the lock-on ring) and fine ticks
    ctx.fillStyle = 'rgba(238,242,255,0.86)';
    for (let i = 0; i < 4; i++) {
      const a = i * TAU / 4 - TAU / 4, cs = Math.cos(a), sn = Math.sin(a), t = R * 0.2;
      ctx.beginPath(); ctx.moveTo(c + cs * (R - t), c + sn * (R - t));
      ctx.lineTo(c + cs * (R - 2) - sn * t * 0.34, c + sn * (R - 2) + cs * t * 0.34); ctx.lineTo(c + cs * (R + 5), c + sn * (R + 5));
      ctx.lineTo(c + cs * (R - 2) + sn * t * 0.34, c + sn * (R - 2) - cs * t * 0.34); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.26)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 24; i++) { if (i % 6 === 0) continue; const a = i * TAU / 24; ctx.moveTo(c + Math.cos(a) * (R - 5), c + Math.sin(a) * (R - 5)); ctx.lineTo(c + Math.cos(a) * (R - 1.5), c + Math.sin(a) * (R - 1.5)); }
    ctx.stroke();
  }
  function drawKnob(ctx, w, r, s) {
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.clearRect(0, 0, w, w);
    const c = w / 2;
    gem(ctx, c, c, r, { facets: 10 });
    // the red crescent (kept from the ink direction)
    ctx.save(); ctx.beginPath(); ctx.arc(c, c, r * 0.56, 0, TAU); ctx.arc(c + r * 0.2, c - r * 0.12, r * 0.47, 0, TAU, true);
    const g = ctx.createLinearGradient(c - r * 0.5, c - r * 0.5, c + r * 0.4, c + r * 0.5);
    g.addColorStop(0, '#ff7a8c'); g.addColorStop(1, COL.rubyDeep);
    ctx.fillStyle = g; ctx.fill('evenodd'); ctx.restore();
  }

  function drawButton(b) {
    const s = dpr(), ctx = b.ctx, L = S.L;
    ctx.setTransform(s, 0, 0, s, 0, 0); ctx.clearRect(0, 0, b.cw, b.ch);
    const cx = b.cw / 2, cy = b.pad + b.d / 2, r = b.d / 2;
    gem(ctx, cx, cy, r, { pressed: b.down && !b.disabled, disabled: b.disabled, tint: b.def.tint, held: b.charge > 0 });
    ctx.globalAlpha = b.disabled ? 0.34 : 1;
    sprite(ctx, b.icon, cx, cy - r * 0.02, b.d * b.def.iconK, b.d * b.def.iconK);
    ctx.globalAlpha = 1;
    if (b.cd > 0) {   // cooldown: a dark fan that sweeps away clockwise, with a bright leading edge
      const a0 = -TAU / 4, a1 = a0 + TAU * (1 - b.cd);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, TAU); ctx.clip();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a1, a0 + TAU); ctx.closePath();
      ctx.fillStyle = 'rgba(4,6,16,0.62)'; ctx.fill();
      ctx.strokeStyle = 'rgba(235,242,255,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r); ctx.stroke();
      ctx.restore();
    }
    if (b.charge > 0) {   // charge: a gold arc filling the rim
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2.4, r * 0.1); ctx.strokeStyle = COL.gold;
      ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth * 0.5, -TAU / 4, -TAU / 4 + TAU * clamp(b.charge, 0, 1)); ctx.stroke(); ctx.lineCap = 'butt';
    }
    plate(ctx, b.label, cx, b.pad + b.d + L.labelPx * 0.12, L.labelPx, { alpha: b.disabled ? 0.5 : 1 });
    b.dirty = false; S.repaints++;
  }
  function paint() { for (let i = 0; i < B.length; i++) if (B[i].dirty) drawButton(B[i]); }

  // ───── input ─────
  const acts = (b) => {
    if (b.id === 'roll' && opts.rollGuard === 'split') return (input._touchVec?.mag ?? 0) > 0.25 || S.stick.live && Math.hypot(S.stick.x, S.stick.y) > S.L.stick.r * 0.3 ? 'dash' : 'guard';
    return b.def.act;
  };
  function press(b, on, ptr, cancel) {
    if (b.down === on) return;
    b.down = on; b.ptr = on ? ptr : -1; b.dirty = true; place(b);
    if (b.disabled) { if (on) { try { opts.onDisabledPress?.(b.id); } catch (e) { console.error(e); } } return; }   // a button that cannot be used yet still answers: the scene says why
    if (on) {
      b.t0 = performance.now(); b.sent = acts(b);
      if (b.sent) input.touch.set(b.sent, true);
      try { opts.onPress?.(b.id); } catch (e) { console.error(e); }
    } else {
      if (b.sent) {
        input.touch.set(b.sent, false);
        if (!cancel && performance.now() - b.t0 < 34) input.touch.tap(b.sent);   // a very short tap still reaches one game step
      }
      b.sent = '';
      if (b.id === 'pause' && !cancel) { try { opts.onPause?.(); } catch (e) { console.error(e); } }
    }
  }
  function hit(x, y) {
    let best = null, bd = 1e9;
    for (const b of B) { const d = Math.hypot(x - b.cx, y - b.cy) - b.d / 2; if (d <= HIT_PAD && d < bd) { bd = d; best = b; } }
    return best;
  }
  function stickSet(dx, dy) {
    const st = S.stick, R = S.L.stick.r, len = Math.hypot(dx, dy);
    if (len > R * 1.4) { const k = (len - R * 1.4) / len; st.ox += dx * k; st.oy += dy * k; dx -= dx * k; dy -= dy * k; }   // the base follows
    const l2 = Math.hypot(dx, dy), c = l2 > R ? R / l2 : 1;
    st.x = dx * c; st.y = dy * c;
    if (l2 <= DEAD) input.touch.axis(0, 0, false); else input.touch.axis(dx / R, dy / R, false);
    const vx = l2 <= DEAD ? 0 : dx / R, vy = l2 <= DEAD ? 0 : dy / R, D = st.dir;
    dirSet(0, 'left', vx < (D[0] ? -0.35 : -0.45)); dirSet(1, 'right', vx > (D[1] ? 0.35 : 0.45));
    dirSet(2, 'up', vy < (D[2] ? -0.35 : -0.45)); dirSet(3, 'down', vy > (D[3] ? 0.35 : 0.45));
    moveStick();
  }
  function dirSet(i, name, on) { const D = S.stick.dir; if (D[i] !== on) { D[i] = on; input.touch.set(name, on); } }
  function stickEnd() {
    const st = S.stick; if (st.ptr < 0 && !st.live) return;
    st.ptr = -1; st.live = false; st.x = 0; st.y = 0; st.ox = S.L.stick.cx; st.oy = S.L.stick.cy;
    input.touch.axis(0, 0, false); for (let i = 0; i < 4; i++) dirSet(i, ['left', 'right', 'up', 'down'][i], false);
    moveStick();
  }
  function releaseAll() { for (const b of B) press(b, false, -1, true); stickEnd(); paint(); }

  const usable = (e) => S.shown && !opts.isModal?.() && (e.pointerType !== 'mouse' || opts.mouse) && !opts.claims?.(e);
  const claim = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
  function onDown(e) {
    if (!usable(e)) return;
    const x = e.clientX, y = e.clientY, b = hit(x, y);
    if (b) { claim(e); press(b, true, e.pointerId); paint(); return; }
    const z = S.L.stick.zone, st = S.stick;
    if (st.ptr < 0 && x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
      claim(e); st.ptr = e.pointerId; st.live = true;
      const R = S.L.stick.r, bd = S.bounds;
      st.ox = clamp(x, bd.l + R + 6, bd.r - R - 6); st.oy = clamp(y, bd.t + R + 6, bd.b - R - 6);
      stickSet(x - st.ox, y - st.oy);
    }
  }
  function onMove(e) {
    const st = S.stick;
    if (e.pointerId === st.ptr) { claim(e); stickSet(e.clientX - st.ox, e.clientY - st.oy); return; }
    for (const b of B) if (b.down && b.ptr === e.pointerId) {
      claim(e);
      const n = hit(e.clientX, e.clientY);
      if (n && n !== b && !n.down && n.id !== 'pause' && b.id !== 'pause') { press(b, false, -1, true); press(n, true, e.pointerId); paint(); }
      return;
    }
  }
  function onUp(e) {
    const st = S.stick;
    if (e.pointerId === st.ptr) { claim(e); stickEnd(); return; }
    for (const b of B) if (b.down && b.ptr === e.pointerId) { claim(e); press(b, false, -1, e.type === 'pointercancel'); paint(); return; }
  }
  const LO = { capture: true, passive: false };
  window.addEventListener('pointerdown', onDown, LO); window.addEventListener('pointermove', onMove, LO);
  window.addEventListener('pointerup', onUp, LO); window.addEventListener('pointercancel', onUp, LO);
  const onBlur = () => releaseAll(), onResize = () => { if (S.L) layout(); };
  window.addEventListener('blur', onBlur); window.addEventListener('resize', onResize);
  // if the scene stops calling the HUD (another scene on top, a crash), the pad must not stay on screen.
  // Counted in timer ticks without a HUD call, not in wall time: one long frame (a hitch blocks the timer as well) or a
  // slow stretch of frames must not hide the pad and drop a held stick or button.
  const watchdog = setInterval(() => { if (S.shown && ++S.idle >= 4) show(false); }, 250);

  function show(v) {
    if (S.shown === v) return;
    S.shown = v; root.style.display = v ? 'block' : 'none';
    if (!v) releaseAll(); else { if (!S.L) layout(); paint(); }
  }
  onAtlas(() => { for (const b of B) b.dirty = true; if (S.shown) paint(); });

  return {
    el: root,
    get shown() { return S.shown; },
    layout,
    /** Called every tick by the HUD: visibility follows the input mode and the modal state; repaints only what changed. */
    tick(modal, pad) {
      S.lastAlive = performance.now(); S.idle = 0;
      const mode = opts.forceShow ? 'touch' : (input.mode ?? 'touch');
      show(S.want && !modal && mode === 'touch');
      if (!S.shown) return;
      const st = game.settings;
      if (st && (st.textSize ?? 'normal') !== S.textSize) layout();
      if (pad) this.setState(pad);
      paint();
    },
    alive() { S.lastAlive = performance.now(); S.idle = 0; },
    /** partial: { skill: {mode, cd, disabled, label}, bell: {mode, charge, disabled}, roll: {...}, attack, jump, lock } */
    setState(p) {
      for (const id in p) {
        const b = byId[id], v = p[id]; if (!b || !v) continue;
        const cd = v.cd > 0 ? Math.ceil(clamp(v.cd, 0, 1) * CD_STEPS) / CD_STEPS : 0;
        const ch = v.charge > 0 ? Math.ceil(clamp(v.charge, 0, 1) * CD_STEPS) / CD_STEPS : 0;
        const dis = !!v.disabled;
        let icon = b.def.icon;
        if (id === 'skill' && v.mode === 'call') icon = 'call'; else if (id === 'bell' && v.mode === 'long') icon = 'bell_long'; else if (id === 'roll' && v.mode === 'guard') icon = 'guard';
        if (cd !== b.cd || ch !== b.charge || dis !== b.disabled || icon !== b.icon) {
          if (dis && !b.disabled && b.down) press(b, false, -1, true);
          b.cd = cd; b.charge = ch; b.disabled = dis; b.icon = icon; b.dirty = true;
        }
      }
    },
    setWanted(v) { S.want = !!v; },
    /** QA: geometry in CSS px. */
    metrics() {
      return {
        k: S.L?.k, labelPx: S.L?.labelPx, bounds: { ...S.bounds }, shown: S.shown, repaints: S.repaints,
        buttons: B.map((b) => ({ id: b.id, cx: b.cx, cy: b.cy, d: b.d, label: b.label, labelW: b.lw, labelRect: { x: b.cx - b.lw / 2, y: b.cy + b.d / 2 + S.L.labelPx * 0.12 - S.L.labelPx * 0.75, w: b.lw, h: S.L.labelPx * 1.5 }, down: b.down, cd: b.cd, disabled: b.disabled, icon: b.icon })),
        stick: S.L ? { ...S.L.stick, live: S.stick.live } : null,
      };
    },
    release() {
      clearInterval(watchdog);
      window.removeEventListener('pointerdown', onDown, LO); window.removeEventListener('pointermove', onMove, LO);
      window.removeEventListener('pointerup', onUp, LO); window.removeEventListener('pointercancel', onUp, LO);
      window.removeEventListener('blur', onBlur); window.removeEventListener('resize', onResize);
      releaseAll(); root.remove();
      for (const b of B) { b.cv.width = 1; b.cv.height = 1; }
      baseCv.width = baseCv.height = knobCv.width = knobCv.height = 1;
    },
  };
}
