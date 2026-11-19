// v2 canvas HUD (docs/v2/UI_API.md 1, 2, 6): candles, resonance cells, night badge, moon cell, lock-on ring, boss bar,
// brush damage numbers and callouts, banners, toasts, button prompts. Drawn into the game canvas by hud.draw(ctx, state).
//
// Cost rules: every static piece is baked once into an offscreen canvas (re-baked only when the scale, the text size or
// a string changes) and blitted with drawImage; text is never laid out per frame; nothing is allocated per frame.
import { sprite, spriteUp, spriteAspect, glassPanel, gem, plate, bakeText, fitText, makeCanvas, measure, chamfer, clamp, TAU, COL, FONTS, atlas, onAtlas } from './draw.js';
import { bakeIcon } from './icons.js';   // SCREENS: the draught beside the candles, the guide candle's line

const P = { x: 0, y: 0, w: 0 };
const TEXT_K = { normal: 1, large: 1.15, xlarge: 1.3 }, TEXT_MIN = { normal: 9.5, large: 12, xlarge: 13.5 };
const NUM_SLOTS = 40, CALL_SLOTS = 10, TOAST_SLOTS = 3, PROMPT_SLOTS = 4;
const KEY_NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab' };
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start'];
const PROMPT_ICON = { attack: 'attack', jump: 'jump', dash: 'roll', guard: 'guard', skill1: 'hook', ult: 'bell', lock: 'next', interact: 'interact', confirm: 'interact', menu: 'pause' };

export function createCanvasHud(game, opts = {}) {
  const input = opts.input ?? game.input;
  const L = { s: 0, hs: 1, css: 1, tk: 1, tmin: 9.5, textSize: 'normal', epoch: 1, vw: 0, vh: 0 };   // layout numbers shared by every piece
  const T = { t: 0, hurt: 0, lit: -1, litShown: 0, max: 5, res: 0, bossShown: 1, bossId: '', lockId: null, lockPulse: 0, secId: null, areaId: null, areaName: null, areaWait: 0, flashLow: 0 };
  const phase = new Float32Array(16), smoke = new Float32Array(16);
  for (let i = 0; i < 16; i++) phase[i] = (i * 2.399) % TAU;

  // ───── baked pieces (each: { c, w, h, key }) ─────
  const mkPiece = () => ({ c: null, w: 0, h: 0, key: '' });
  const badge = { now: mkPiece(), past: mkPiece() }, shelves = {}, moonP = mkPiece(), bossP = mkPiece(), bossFill = mkPiece(), secP = mkPiece(), objP = mkPiece();
  const bannerP = mkPiece(), bandP = mkPiece(), promptRow = mkPiece(), msgP = mkPiece(), msg2P = mkPiece(), dbgP = mkPiece(), resLabel = mkPiece();
  const nums = []; for (let i = 0; i < NUM_SLOTS; i++) nums.push({ c: null, w: 0, h: 0, str: null, color: null, big: false, ep: 0 });
  const calls = []; for (let i = 0; i < CALL_SLOTS; i++) calls.push({ c: null, w: 0, h: 0, on: false, t: 0, x: 0, y: 0, z: 0, kind: '', dur: 1 });
  const toasts = []; for (let i = 0; i < TOAST_SLOTS; i++) toasts.push({ c: null, w: 0, h: 0, on: false, t: 0, dur: 2.6, y: 0, text: '', icon: null, kind: '', img: null, rx: 0, ry: 0 });
  const wprompts = []; for (let i = 0; i < PROMPT_SLOTS; i++) wprompts.push({ c: null, w: 0, h: 0, key: '' });
  const banner = { on: false, kind: '', t: 0, dur: 2.8, title: '', sub: '' }, BR = { x: 0, y: 0, w: 0, h: 0 };
  const icons = new Map();   // toast icon URL -> Image
  const taps = { n: 0, rect: new Float32Array(8 * 4), ref: [null, null, null, null, null, null, null, null] }, rowX = new Float32Array(8), rowW = new Float32Array(8);   // prompt chips that can be tapped (touch)
  const tapAdd = (p, x, y, w, h) => { if (taps.n >= 8) return; const i = taps.n++ * 4; taps.rect[i] = x; taps.rect[i + 1] = y; taps.rect[i + 2] = w; taps.rect[i + 3] = h; taps.ref[taps.n - 1] = p; };

  const px = (v) => v * L.hs;                                           // HUD graphics size (logical px)
  const tsz = (base, min = L.tmin) => Math.max(base * L.hs * L.tk, min / L.css);   // text size with the setting and the CSS-px floor
  function ctxOf(p, w, h) {
    const cw = Math.ceil(w * L.s), ch = Math.ceil(h * L.s);
    if (!p.c) p.c = makeCanvas(cw, ch); else if (p.c.width !== cw || p.c.height !== ch) { p.c.width = cw; p.c.height = ch; }
    p.w = w; p.h = h;
    const c = p.c.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch); c.setTransform(L.s, 0, 0, L.s, 0, 0);
    return c;
  }
  const blit = (ctx, p, x, y) => { if (p.c) ctx.drawImage(p.c, x, y, p.w, p.h); };

  function metrics(s) {
    const css = game.cssScale ?? opts.cssScale ?? 1, st = game.settings ?? {};
    const sc = Math.min(3, Math.max(1, Math.round((s.scale ?? 1) * 4) / 4));
    const ts = st.textSize ?? 'normal';
    if (sc !== L.s || css !== L.css || ts !== L.textSize || s.viewW !== L.vw || s.viewH !== L.vh) {
      L.s = sc; L.css = css; L.textSize = ts; L.tk = TEXT_K[ts] ?? 1; L.tmin = TEXT_MIN[ts] ?? 9.5; L.vw = s.viewW; L.vh = s.viewH;
      L.hs = clamp(0.8 / css, 1, 1.3);
      L.epoch++;
    }
  }
  // has this piece been baked for these values at this epoch? (plain comparisons: no strings are built per frame)
  const stale = (p, a, b, c) => { if (p.ep === L.epoch && p.ka === a && p.kb === b && p.kc === c) return false; p.ep = L.epoch; p.ka = a; p.kb = b; p.kc = c; return true; };

  // night badge: a small gem with the emblem and a name plate
  function bakeBadge(which) {
    const p = badge[which]; if (!stale(p, which)) return p;
    const r = px(27), ts = tsz(11), label = which === 'past' ? (opts.labels?.past ?? '그 밤') : (opts.labels?.now ?? '오늘 밤');
    const w = Math.max(r * 2 + 16, measure(label, ts) + ts * 1.1 + 8), h = r * 2 + 12 + ts * 1.3;
    const c = ctxOf(p, w, h);
    gem(c, w / 2, r + 6, r, { tint: which === 'past' ? 'ruby' : null, facets: 12 });
    sprite(c, which === 'past' ? 'night_past' : 'night_now', w / 2, r + 6, r * 1.8, r * 1.8);
    plate(c, label, w / 2, r * 2 + 6 + ts * 0.5, ts, { rim: which === 'past' ? 'rgba(255,120,140,0.7)' : undefined, color: which === 'past' ? '#ffd9de' : COL.silver });
    return p;
  }
  // CROSSING: the year that runs in the corner of the night badge - ten digits baked once, so nothing is laid out or allocated while it counts
  const yearP = mkPiece();
  function bakeYear() {
    if (!stale(yearP, 1)) return yearP;
    const ts = tsz(15, L.tmin + 3), dw = Math.ceil(measure('0', ts, 800)) + 2, h = Math.ceil(ts * 1.5);
    const c = ctxOf(yearP, dw * 10 + 4, h);
    c.font = `800 ${ts}px ${FONTS.body}`; c.textBaseline = 'middle'; c.textAlign = 'center'; c.lineWidth = 3.5; c.strokeStyle = 'rgba(4,4,12,0.9)'; c.lineJoin = 'round'; c.fillStyle = '#fff2d2';
    for (let i = 0; i < 10; i++) { const x = 2 + dw * i + dw / 2, d = String.fromCharCode(48 + i); c.strokeText(d, x, h / 2 + 1); c.fillText(d, x, h / 2 + 1); }
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    yearP.dw = dw;
    return yearP;
  }
  /** CROSSING (state.cross, written by src/v2/game/crossing.js): everything but the night badge steps back (k 1 -> 0) and returns; the badge beats with the
   *  bell's rings, shows the year running in its corner (the long form) and turns over to the other night with a small ceremony (turn 0 -> 1). */
  function drawCross(ctx, s) {
    const X = s.cross, sf = s.safe ?? ZERO, x0 = sf.l + px(10), y0 = sf.t + px(8), r = px(27);
    if (X.k > 0.004 && X.k < 0.996) { ctx.globalCompositeOperation = 'destination-in'; ctx.globalAlpha = X.k; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s.viewW, s.viewH); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    const tn = X.turn, flip = tn > 0 && tn < 1, past = (tn >= 0.5 ? X.to : X.from) === 'past', bd = bakeBadge(past ? 'past' : 'now');
    const cx = x0 + bd.w / 2, gy = y0 + r + 6, pop = 1 + 0.06 * X.beat + (flip ? 0.2 * Math.sin(tn * Math.PI) : 0), sx = flip ? Math.max(0.05, Math.abs(Math.cos(tn * Math.PI))) : 1;
    if (flip || X.beat > 0.01) {   // light around the gem: a thin ring on every beat of the passage, a wide one when it turns
      ctx.globalAlpha = flip ? (1 - tn) * 0.9 : X.beat * 0.55; ctx.strokeStyle = past ? '#ffb9a4' : '#bcd6ff'; ctx.lineWidth = px(flip ? 2.6 : 1.8);
      ctx.beginPath(); ctx.arc(cx, gy, r * (flip ? 1.05 + tn * 1.4 : 1.04 + (1 - X.beat) * 0.45), 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // the gem turns (squeezed about its upright axis); the name plate under it does not turn, it changes over
    const gh = r * 2 + 10, gs = Math.min(bd.c.height, Math.ceil(gh * L.s));
    ctx.save(); ctx.translate(cx, gy); ctx.scale(pop * sx, pop); ctx.drawImage(bd.c, 0, 0, bd.c.width, gs, -bd.w / 2, -(r + 6), bd.w, gs / L.s); ctx.restore();
    if (flip) ctx.globalAlpha = Math.max(0, Math.min(1, tn >= 0.5 ? (tn - 0.5) * 2 : 1 - tn * 2));   // the old name fades out before the half turn, the new one in after it
    ctx.drawImage(bd.c, 0, gs, bd.c.width, bd.c.height - gs, x0, y0 + gs / L.s, bd.w, bd.h - gs / L.s); ctx.globalAlpha = 1;
    if (flip) {   // six sparks thrown off the turning gem
      ctx.fillStyle = '#fff6d8'; ctx.globalAlpha = 1 - tn;
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.5, rr = r * (0.95 + tn * 1.7), q = px(2.6) * (1 - tn * 0.5), qx = cx + Math.cos(a) * rr, qy = gy + Math.sin(a) * rr; ctx.beginPath(); ctx.moveTo(qx, qy - q * 1.6); ctx.lineTo(qx + q, qy); ctx.lineTo(qx, qy + q * 1.6); ctx.lineTo(qx - q, qy); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    if (X.year > 0 && tn < 1) {   // the year, on a small dark chip at the gem's lower right
      const yp = bakeYear(), dw = yp.dw, y = X.year | 0, bx = cx + r * 0.42, by = gy + r * 0.3;
      ctx.globalAlpha = 1 - tn;
      ctx.fillStyle = 'rgba(6,6,16,0.78)'; ctx.fillRect(bx - 3, by + yp.h * 0.1, dw * 4 + 6, yp.h * 0.8);
      ctx.fillStyle = past ? 'rgba(255,120,140,0.7)' : 'rgba(170,200,255,0.7)'; ctx.fillRect(bx - 3, by + yp.h * 0.9 - 1, dw * 4 + 6, 1);
      for (let i = 0; i < 4; i++) { const d = i === 0 ? ((y / 1000) | 0) % 10 : i === 1 ? ((y / 100) | 0) % 10 : i === 2 ? ((y / 10) | 0) % 10 : y % 10; ctx.drawImage(yp.c, (2 + dw * d) * L.s, 0, dw * L.s, yp.c.height, bx + dw * i, by, dw, yp.h); }
      ctx.globalAlpha = 1;
    }
  }
  // the altar ledge the candles stand on
  function bakeShelf(n, step) {
    const shelf = shelves[n] ?? (shelves[n] = mkPiece());
    if (!stale(shelf, n, step)) return shelf;
    const w = (n - 1) * step + px(36), h = px(10);
    const c = ctxOf(shelf, w + 4, h + 6);
    glassPanel(c, 2, 2, w, h, { cut: px(3.5), shadow: false, top: 'rgba(40,46,80,0.50)', bot: 'rgba(8,9,22,0.62)' });
    return shelf;
  }
  function bakeMoon(ph) {
    const q = Math.round(clamp(ph, 0, 1) * 24);
    if (!stale(moonP, q)) return moonP;
    const r = px(13), w = r * 2 + 8, c = ctxOf(moonP, w, w), cx = w / 2;
    c.save(); c.beginPath(); c.arc(cx, cx, r, 0, TAU); c.clip();
    sprite(c, 'moon', cx, cx, r * 2.06, r * 2.06);
    // the dark side: an offset disc of night blue
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(6,8,22,0.86)';
    c.beginPath(); c.arc(cx - (q / 24) * r * 2.3, cx, r * 1.08, 0, TAU); c.fill();
    c.restore();
    c.lineWidth = 1.1; c.strokeStyle = 'rgba(230,236,255,0.7)'; c.beginPath(); c.arc(cx, cx, r, 0, TAU); c.stroke();
    c.lineWidth = 0.8; c.strokeStyle = 'rgba(2,3,10,0.55)'; c.beginPath(); c.arc(cx, cx, r + 1, 0, TAU); c.stroke();
    return moonP;
  }
  function bossW() { return Math.max(px(150), Math.min(px(400), L.vw * 0.44, 2 * (L.vw / 2 - (T.statusR || 0) - px(14)))); }
  function bakeBoss(b) {
    if (!stale(bossP, b.name, b.sub, Math.round(bossW()))) return bossP;
    const name = String(b.name ?? ''), sub = String(b.sub ?? '');
    const bw = bossW(), ts = tsz(17, L.tmin + 2), crestH = px(34), barH = px(13), w = bw + 24, h = crestH + ts * 1.5 + barH + px(14);
    const c = ctxOf(bossP, w, h);
    sprite(c, 'orn_boss', w / 2, crestH / 2 + 1, px(150), crestH);
    // a long name is shrunk, then cut, to the bar width; the sub line sits right of the name only where it fits
    const fn = fitText(name, ts, bw - ts * 0.9, 800, FONTS.title), nameStr = fn.str, nameTs = fn.size;
    const nm = bakeText(nameStr, L.s, { size: nameTs, family: FONTS.title, weight: 800, fill: ['#ffffff', '#cfd6f2'], lw: 3, stroke: 'rgba(8,6,18,0.86)' });
    c.drawImage(nm.c, w / 2 - nm.w / 2, crestH - px(4) + (ts - nameTs) * 0.75, nm.w, nm.h);
    const subRoom = w / 2 - nm.w / 2 + 4 - 16;
    if (sub && subRoom >= px(44)) { const fs = fitText(sub, tsz(11), subRoom, 600), sb = bakeText(fs.str, L.s, { size: fs.size, weight: 600, fill: COL.silverDim, lw: 2.4 }); c.drawImage(sb.c, w / 2 + nm.w / 2 - 4, crestH - px(4) + (ts - nameTs) * 0.75 + (nm.h - sb.h) / 2 + 2, sb.w, sb.h); }
    const by = crestH + ts * 1.5 - px(2);
    glassPanel(c, 12, by, bw, barH, { cut: px(4), top: 'rgba(30,10,20,0.62)', bot: 'rgba(8,4,12,0.74)' });
    bossP.barX = 12; bossP.barY = by; bossP.barW = bw; bossP.barH = barH;
    // the fill strip (ruby with a bright upper edge) and the pale chip strip, drawn once
    const f = ctxOf(bossFill, bw, barH * 2);
    let g = f.createLinearGradient(0, 0, 0, barH);
    g.addColorStop(0, '#ff8a9a'); g.addColorStop(0.28, '#e2364e'); g.addColorStop(1, '#7c0f22');
    f.fillStyle = g; f.fillRect(0, 0, bw, barH);
    f.fillStyle = 'rgba(255,255,255,0.35)'; f.fillRect(0, 1, bw, Math.max(1, barH * 0.14));
    g = f.createLinearGradient(0, barH, 0, barH * 2); g.addColorStop(0, '#fff3d6'); g.addColorStop(1, '#c9b48a');
    f.fillStyle = g; f.fillRect(0, barH, bw, barH);
    return bossP;
  }
  function bakeSection(label, left, maxW) {
    if (!stale(secP, label, left, Math.round(maxW))) return secP;
    const full = left > 0 ? label + ' · ' + (opts.labels?.left ?? '남은 적') + ' ' + left : label;
    const ft = fitText(full, tsz(12.5), Math.max(px(40), maxW - 12), 600, FONTS.body, 0.85), str = ft.str;
    const t = bakeText(str, L.s, { size: ft.size, weight: 600, fill: left > 0 ? '#ffd9de' : COL.silverDim, lw: 2.6, stroke: 'rgba(6,6,16,0.8)' }, secP.t);
    secP.t = t; secP.c = t.c; secP.w = t.w; secP.h = t.h;
    return secP;
  }
  /** the objective line under the resonance cells (state.objective, one short gold line; '' = none) */
  function bakeObjective(text, maxW) {
    if (!stale(objP, text, Math.round(maxW), 0)) return objP;
    const ft = fitText(text, tsz(13), Math.max(px(60), maxW - 12), 700, FONTS.body, 0.8);
    const t = bakeText(ft.str, L.s, { size: ft.size, weight: 700, fill: ['#fff2c8', COL.gold], lw: 2.8, stroke: 'rgba(8,6,16,0.86)' }, objP.t);
    objP.t = t; objP.c = t.c; objP.w = t.w; objP.h = t.h;
    return objP;
  }
  function bakeBanner() {
    const b = banner, big = b.kind === 'area' || b.kind === 'clear', night = b.kind === 'night', dead = b.kind === 'dead';
    const ts = tsz(night ? 40 : big ? 34 : dead ? 32 : 24, L.tmin + 6), divW = px(night ? 330 : big ? 300 : 210), divH = divW * (64 / 480);
    const room = (T.availW || L.vw) - px(36);   // long titles shrink, then are cut, to the safe width
    const ft = fitText(b.title, ts, room - ts, night ? 700 : dead ? 900 : 800, night ? FONTS.brush : FONTS.title, 0.6), tstr = ft.str, tsF = ft.size;
    const fsub = b.sub ? fitText(b.sub, tsz(14, L.tmin + 1), room - 20, 600) : null, substr = fsub ? fsub.str : '', subTs = fsub ? fsub.size : 0;
    const title = bakeText(tstr, L.s, night
      ? { size: tsF, family: FONTS.brush, weight: 700, fill: ['#fff6e0', '#ffc9a0'], lw: 4, stroke: 'rgba(20,4,10,0.9)', glow: 'rgba(226,54,78,0.55)', glowBlur: 9 }
      : dead ? { size: tsF, family: FONTS.title, weight: 900, fill: ['#ffd0d6', '#ff5a72'], lw: 4, stroke: 'rgba(16,2,8,0.9)' }
      : { size: tsF, family: FONTS.title, weight: 800, fill: ['#ffffff', '#cdd5f3'], lw: 4, stroke: 'rgba(6,6,18,0.86)' });
    const sub = substr ? bakeText(substr, L.s, { size: subTs, weight: 600, fill: COL.silverDim, lw: 2.6 }) : null;
    const w = Math.max(title.w, divW, sub ? sub.w : 0) + 8, h = divH * (big || night ? 2 : 1) + title.h * 0.86 + (sub ? sub.h * 0.8 : 0) + 6;
    const c = ctxOf(bannerP, w, h);
    let y = 2;
    if (big || night) { sprite(c, 'orn_div', w / 2, y + divH / 2, divW, divH); y += divH * 0.82; }
    c.drawImage(title.c, w / 2 - title.w / 2, y - title.h * 0.07, title.w, title.h); y += title.h * 0.80;
    if (sub) { c.drawImage(sub.c, w / 2 - sub.w / 2, y - sub.h * 0.1, sub.w, sub.h); y += sub.h * 0.72; }
    c.save(); c.translate(w / 2, y + divH / 2); if (big || night) c.scale(1, -1); sprite(c, 'orn_div', 0, 0, divW, divH); c.restore();
    if (!bandP.c || stale(bandP, 1)) {   // the soft dark band behind big banners: a 1 px wide gradient, stretched when drawn
      const k = ctxOf(bandP, 1, 64), g = k.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(4,4,12,0)'); g.addColorStop(0.32, 'rgba(4,4,12,0.56)'); g.addColorStop(0.68, 'rgba(4,4,12,0.56)'); g.addColorStop(1, 'rgba(4,4,12,0)');
      k.fillStyle = g; k.fillRect(0, 0, 1, 64);
    }
  }
  function bakeToast(o) {
    const ft = fitText(o.text, tsz(13.5, L.tmin + 1.5), Math.min(L.vw * 0.36, px(330)), 600, FONTS.body, 0.85), text = ft.str, ts = ft.size;   // a toast never grows into the fight
    const ih = px(26), tw = measure(text, ts, 600), w = tw + ih + px(34), h = px(34);
    const c = ctxOf(o, w + 6, h + 8);
    glassPanel(c, 3, 3, w, h, { cut: px(7), dense: 0.8, accent: o.kind === 'warn' ? 'ruby' : o.kind === 'item' ? 'gold' : null });
    const ix = 3 + px(9) + ih / 2, iy = 3 + h / 2;
    if (o.img && o.img.complete && o.img.naturalWidth) c.drawImage(o.img, ix - ih / 2, iy - ih / 2, ih, ih);
    else sprite(c, typeof o.icon === 'string' && !o.img ? o.icon : 'pouch', ix, iy, ih, ih);
    c.font = `600 ${ts}px ${FONTS.body}`; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.lineWidth = 3; c.strokeStyle = 'rgba(4,4,12,0.85)'; c.lineJoin = 'round'; c.strokeText(text, ix + ih / 2 + px(8), iy + 1);
    c.fillStyle = o.kind === 'item' ? '#fff2d2' : '#ffffff'; c.fillText(text, ix + ih / 2 + px(8), iy + 1);
    c.textBaseline = 'alphabetic';
  }
  // coins (state.coins — BREAK lane): a small glass chip with the pouch and the count, under the status block where the toasts start. It slides in when
  // the count changes, counts up quickly, stays a few seconds and fades (the pause panel always shows the count: dialog.js).
  const coinP = mkPiece(), CN = { last: -1, shown: 0, t: 99, a: 0 };
  function bakeCoins(n) {
    if (!stale(coinP, n)) return coinP;
    const ts = tsz(14.5, L.tmin + 2.5), str = String(n), ih = px(23), tw = measure(str, ts, 700), w = tw + ih + px(27), h = px(30);
    const c = ctxOf(coinP, w + 6, h + 8);
    glassPanel(c, 3, 3, w, h, { cut: px(7), dense: 0.75, accent: 'gold' });
    const ix = 3 + px(9) + ih / 2, iy = 3 + h / 2;
    sprite(c, 'pouch', ix, iy, ih, ih);
    c.font = `700 ${ts}px ${FONTS.body}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = 'rgba(4,4,12,0.85)'; c.lineJoin = 'round';
    c.strokeText(str, ix + ih / 2 + px(6), iy + 1); c.fillStyle = '#fff2d2'; c.fillText(str, ix + ih / 2 + px(6), iy + 1);
    c.textBaseline = 'alphabetic';
    return coinP;
  }
  // SCREENS (11-19): the draughts the hero carries (Rook's holy water - model.draughts), a small bottle and its count right of the candles; and the line of the
  // guide candle under the objective (model.guideLine()). Both are baked when their value changes and cost one drawImage a frame.
  const drP = mkPiece(), guideP = mkPiece();
  function bakeDraught(n) {
    if (!stale(drP, n)) return drP;
    const ts = tsz(13.5, L.tmin + 2), ih = px(27), str = '×' + n, tw = measure(str, ts, 800), w = ih + tw + px(6), h = px(34);
    const c = ctxOf(drP, w + 4, h);
    const b = bakeIcon('draught', ih, L.s); c.drawImage(b.c, 2 + ih / 2 - b.w / 2, h / 2 - b.w / 2, b.w, b.w);
    c.font = `800 ${ts}px ${FONTS.body}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = 'rgba(4,4,12,0.85)'; c.lineJoin = 'round';
    c.strokeText(str, 2 + ih + px(1), h / 2 + px(4)); c.fillStyle = '#dff0ff'; c.fillText(str, 2 + ih + px(1), h / 2 + px(4)); c.textBaseline = 'alphabetic';
    return drP;
  }
  function bakeGuide(text, maxW) {
    if (!stale(guideP, text, Math.round(maxW), 0)) return guideP;
    const ih = px(17), ft = fitText(text, tsz(12.5), Math.max(px(60), maxW - ih - 12), 700, FONTS.body, 0.8), tw = measure(ft.str, ft.size, 700), h = Math.max(ih, ft.size * 1.5) + 4, w = ih + px(4) + tw + 8;
    const c = ctxOf(guideP, w, h);
    const b = bakeIcon('guide', ih, L.s); c.drawImage(b.c, ih / 2 - b.w / 2, h / 2 - b.w / 2, b.w, b.w);
    c.font = `700 ${ft.size}px ${FONTS.body}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.lineWidth = 2.8; c.strokeStyle = 'rgba(8,6,16,0.86)'; c.lineJoin = 'round';
    c.strokeText(ft.str, ih + px(4), h / 2 + 1); c.fillStyle = '#ffe9b8'; c.fillText(ft.str, ih + px(4), h / 2 + 1); c.textBaseline = 'alphabetic';
    return guideP;
  }
  // one prompt chip: [key cap | action icon] label
  function promptW(p, ts) { return measure(p.label ?? '', ts, 600) + px(18) + px(26); }
  function drawPrompt(c, p, x, y, ts, mode) {
    const h = px(28), w = promptW(p, ts);
    glassPanel(c, x, y, w, h, { cut: px(6), dense: 0.45 });
    const ix = x + px(8) + px(11), iy = y + h / 2;
    if (mode === 'touch') sprite(c, p.icon ?? PROMPT_ICON[p.action] ?? 'interact', ix, iy, px(23), px(23));
    else {
      const name = keyName(p.action, mode), ks = Math.max(9, ts * 0.86), kw = Math.max(px(20), measure(name, ks, 800) + 8);
      chamfer(c, ix - kw / 2, iy - px(10), kw, px(20), px(4)); c.fillStyle = 'rgba(236,241,255,0.92)'; c.fill();
      c.font = `800 ${ks}px ${FONTS.body}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#0b0d1c'; c.fillText(name, ix, iy + 0.5);
    }
    c.font = `600 ${ts}px ${FONTS.body}`; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.lineWidth = 2.4; c.lineJoin = 'round'; c.strokeStyle = 'rgba(4,4,12,0.7)'; c.strokeText(p.label ?? '', x + px(8) + px(26), iy + 1);
    c.fillStyle = COL.silver; c.fillText(p.label ?? '', x + px(8) + px(26), iy + 1); c.textBaseline = 'alphabetic';
    return w;
  }
  function keyName(action, mode) {
    try {
      if (opts.keyLabel) { const v = opts.keyLabel(action, mode); if (v) return v; }
      if (mode === 'pad') { const b = input?.bindings?.pad?.[action]?.[0]; return typeof b === 'number' ? (PAD_NAMES[b] ?? 'B' + b) : String(b ?? '?'); }
      const code = input?.bindings?.key?.[action]?.[0] ?? '';
      return KEY_NAMES[code] ?? String(code).replace(/^Key|^Digit|^Arrow|^Numpad/, '') ?? '?';
    } catch { return '?'; }
  }
  const promptSig = [];
  function bakePrompts(s, mode) {
    const list = s.prompts; let n = 0, changed = promptRow.ep !== L.epoch || promptRow.mode !== mode;
    if (list) for (let i = 0; i < list.length; i++) { const p = list[i]; if (p.x != null) continue; if (promptSig[n * 2] !== p.action || promptSig[n * 2 + 1] !== p.label) { changed = true; promptSig[n * 2] = p.action; promptSig[n * 2 + 1] = p.label; } n++; }
    if (promptRow.n !== n) changed = true;
    if (!changed) return;
    promptRow.ep = L.epoch; promptRow.mode = mode; promptRow.n = n;
    if (!n) { promptRow.w = 0; return; }
    const ts = tsz(13, L.tmin + 1), gap = px(8); let w = 6;
    for (let i = 0; i < list.length; i++) if (list[i].x == null) w += promptW(list[i], ts) + gap;
    const c = ctxOf(promptRow, w, px(28) + 10); let x = 3;
    for (let i = 0, k = 0; i < list.length; i++) if (list[i].x == null) { const cw = drawPrompt(c, list[i], x, 4, ts, mode); if (k < 8) { rowX[k] = x; rowW[k] = cw; k++; } x += cw + gap; }
  }
  function bakeWorldPrompt(slot, p, mode) {
    if (!stale(slot, mode, p.action, p.label)) return;
    const ts = tsz(13, L.tmin + 1), w = promptW(p, ts), c = ctxOf(slot, w + 8, px(28) + 10);
    drawPrompt(c, p, 4, 4, ts, mode);
  }
  const NUM_STYLE = { size: 0, family: FONTS.brush, weight: 700, fill: null, lw: 0, stroke: 'rgba(10,6,18,0.92)', glow: null, glowBlur: 7, swoosh: null }, NUM_FILL = ['#fff', '#fff'];
  function bakeNumber(slot, n) {
    slot.str = n.str; slot.color = n.color; slot.big = !!n.big; slot.ep = L.epoch;
    const big = !!n.big, col = n.color || '#fff', white = col === '#fff' || col === '#ffffff' || col === 'white';
    const o = NUM_STYLE; o.size = tsz(big ? 52 : 35, L.tmin + 6); o.lw = big ? 5 : 4;
    NUM_FILL[0] = big ? '#fff5da' : white ? '#ffffff' : col; NUM_FILL[1] = big ? '#ff5a72' : white ? '#c9d3f5' : col; o.fill = NUM_FILL;
    o.glow = big ? 'rgba(226,54,78,0.6)' : null; o.swoosh = big ? 'rgba(226,54,78,0.8)' : null;
    bakeText(String(n.str), L.s, o, slot);
  }
  const CALL_STYLE = {
    parry: { fill: ['#fffbe8', '#f1d48a'], glow: 'rgba(241,212,138,0.55)', swoosh: 'rgba(241,212,138,0.75)' },
    guard: { fill: ['#ffffff', '#bcd0ff'], glow: null, swoosh: 'rgba(170,196,255,0.6)' },
    break: { fill: ['#fff0f2', '#ff5a72'], glow: 'rgba(226,54,78,0.6)', swoosh: 'rgba(226,54,78,0.8)' },
    info: { fill: ['#ffffff', '#d6ddf7'], glow: null, swoosh: null },
  };

  // ───── events ─────
  function setBanner(kind, title, sub) {
    banner.on = true; banner.kind = kind; banner.t = 0; banner.sub = sub ?? '';
    banner.title = title ?? (kind === 'night' ? (opts.labels?.nightChanged ?? '오늘 밤이 달라졌다') : '');
    banner.dur = kind === 'night' ? 3.6 : kind === 'area' ? 3.2 : kind === 'dead' ? 1e9 : kind === 'clear' ? 1e9 : 2.6;
    banner.dirty = true;
  }
  function addToast(text, o = {}) {
    let slot = toasts.find((q) => !q.on);
    if (!slot) { slot = toasts[0]; for (const q of toasts) if (q.t > slot.t) slot = q; }
    slot.on = true; slot.t = 0; slot.dur = o.time ?? 2.6; slot.text = String(text); slot.kind = o.kind ?? 'info'; slot.icon = o.icon ?? (slot.kind === 'item' ? 'pouch' : slot.kind === 'warn' ? 'candle_dead' : 'bell'); slot.img = null; slot.dirty = true; slot.y = -1;
    if (typeof o.icon === 'string' && /[./]/.test(o.icon)) {   // an image URL (item art): bake again when it arrives
      let im = icons.get(o.icon);
      if (!im) { im = new Image(); im.src = o.icon; icons.set(o.icon, im); }
      slot.img = im; if (!im.complete) im.addEventListener('load', () => { if (slot.img === im) slot.dirty = true; }, { once: true });
    }
  }
  function addCallout(x, y, z, text, kind = 'info', big = false) {
    let slot = calls.find((q) => !q.on); if (!slot) { slot = calls[0]; for (const q of calls) if (q.t > slot.t) slot = q; }
    slot.on = true; slot.t = 0; slot.x = x; slot.y = y; slot.z = z; slot.kind = kind; slot.dur = kind === 'num' ? 0.8 : 1.15;
    if (kind === 'num') { NUMTMP.str = text; NUMTMP.color = '#fff'; NUMTMP.big = big; bakeNumber(slot, NUMTMP); }
    else { const st = CALL_STYLE[kind] ?? CALL_STYLE.info; bakeText(String(text), L.s || 2, { size: tsz(31, L.tmin + 5), family: FONTS.brush, weight: 700, fill: st.fill, lw: 4, stroke: 'rgba(10,6,18,0.92)', glow: st.glow, glowBlur: 7, swoosh: st.swoosh }, slot); }
  }
  const NUMTMP = { str: '', color: '#fff', big: false };
  onAtlas(() => { L.epoch++; });

  // ───── per tick ─────
  function update(dt, s) {
    metrics(s);
    T.t += dt;
    const hero = s.hero ?? {}, hpMax = s.heroHpMax || 1;
    const max = clamp(Math.round(s.candles?.max ?? s.candleMax ?? 5), 3, 16);
    const lit = s.candles ? s.candles.lit : clamp((hero.hp ?? hpMax) / hpMax, 0, 1) * max;
    if (T.lit < 0) { T.lit = lit; T.litShown = lit; }
    if (lit < T.lit - 1e-3) { T.hurt = 0.7; for (let i = Math.ceil(lit); i < Math.ceil(T.lit) && i < 16; i++) smoke[i] = 0.9; }
    T.lit = lit; T.max = max;
    T.litShown += (lit - T.litShown) * Math.min(1, dt * 9);
    T.hurt = Math.max(0, T.hurt - dt);
    for (let i = 0; i < 16; i++) if (smoke[i] > 0) smoke[i] = Math.max(0, smoke[i] - dt);
    const rv = s.resonance ? s.resonance.value : 0; T.res += (rv - T.res) * Math.min(1, dt * 8);
    { const n = s.coins | 0;   // the purse: no pop for the count the game starts with; a change shows the chip and the number runs up to it
      if (CN.last < 0) { CN.last = n; CN.shown = n; } else if (n !== CN.last) { if (n < CN.shown) CN.shown = n; CN.last = n; CN.t = 0; }
      if (CN.shown < n) CN.shown = Math.min(n, CN.shown + Math.max(dt * 24, (n - CN.shown) * dt * 9));
      CN.t += dt; const want = CN.t < 3.6 ? 1 : 0; CN.a += (want - CN.a) * Math.min(1, dt * (want ? 14 : 2.6)); if (CN.a < 0.004) CN.a = 0; }
    const b = s.boss;
    if (b) { const k = clamp(b.hp / (b.hpMax || 1), 0, 1); if (T.bossId !== b.name) { T.bossId = b.name; T.bossShown = k; } T.bossShown = k > T.bossShown ? k : T.bossShown + (k - T.bossShown) * Math.min(1, dt * 2.2); } else T.bossId = '';
    const lk = hero.lock ?? null; if (lk !== T.lockId) { T.lockId = lk; T.lockPulse = 0.28; } T.lockPulse = Math.max(0, T.lockPulse - dt);
    // names appear by themselves when the place changes
    const aid = s.area?.id ?? null, sid = s.section?.id ?? null;
    if (!s.loading && !s.message) {
      const keep = banner.on && banner.kind === 'night';   // the night banner is never replaced by a place name
      // STORY2 (11-19): the place name never sits over a scene. It is not shown at all on arriving in the other night of the same place (same name: the night badge, the
      // year stamp and the night banner say it); otherwise it waits while the story holds the hero (state.story / state.cut) and comes up when the story lets go - or
      // is dropped when the scene lasts longer than five seconds (the place has been looked at all that time; the story's own banner had the stage).
      if (aid !== T.areaId) { const twin = !!s.area?.name && s.area.name === T.areaName; T.areaId = aid; T.secId = sid; T.areaName = s.area?.name ?? null; T.areaWait = s.area?.name && !twin ? 1e-4 : 0; }
      if (T.areaWait > 0) {
        if (s.story || s.cut) { if ((T.areaWait += dt) > 5) T.areaWait = 0; }
        else { T.areaWait = 0; if (!keep && !(banner.on && banner.kind === 'area')) setBanner('area', s.area.name, s.section?.label && s.section.label !== s.area.name ? s.section.label : ''); }
      }
      else if (sid !== T.secId) { T.secId = sid; if (s.section?.label && !keep && !(banner.on && banner.kind === 'area' && banner.t < 1.5)) setBanner('section', s.section.label); }
    }
    if (s.done && !(banner.on && banner.kind === 'clear')) setBanner('clear', s.doneTitle ?? opts.labels?.clear ?? '시범 구간 끝', s.doneSub ?? opts.labels?.clearSub ?? '공격 단추를 누르면 처음부터 다시 시작합니다');
    else if (!s.done && banner.on && banner.kind === 'clear') banner.on = false;
    if (hero.dead && !(banner.on && banner.kind === 'dead')) setBanner('dead', opts.labels?.dead ?? '촛불이 꺼졌다');
    else if (!hero.dead && banner.on && banner.kind === 'dead') banner.on = false;
    if (banner.on) { banner.t += dt; if (banner.t >= banner.dur) banner.on = false; }
    for (let i = 0; i < TOAST_SLOTS; i++) { const o = toasts[i]; if (o.on) { o.t += dt; if (o.t >= o.dur) o.on = false; } }
    for (let i = 0; i < CALL_SLOTS; i++) { const o = calls[i]; if (o.on) { o.t += dt; if (o.t >= o.dur) o.on = false; } }
  }

  // ───── per frame ─────
  function draw(ctx, s) {
    if (!L.s) metrics(s);
    const vw = s.viewW, vh = s.viewH, sf = s.safe ?? ZERO, hero = s.hero ?? ZERO;
    if (s.message) {   // loading / error: the only opaque screen
      ctx.fillStyle = '#080611'; ctx.fillRect(0, 0, vw, vh);
      if (stale(msgP, s.message)) { const t = bakeText(String(s.message), L.s, { size: tsz(21), family: FONTS.title, weight: 700, fill: '#e8e2f4' }, msgP.t); msgP.t = t; msgP.c = t.c; msgP.w = t.w; msgP.h = t.h; }
      blit(ctx, msgP, vw / 2 - msgP.w / 2, vh / 2 - msgP.h / 2 - 10);
      if (s.message2) { if (stale(msg2P, s.message2)) { const t = bakeText(String(s.message2), L.s, { size: tsz(13.5), weight: 500, fill: '#b3adc6' }, msg2P.t); msg2P.t = t; msg2P.c = t.c; msg2P.w = t.w; msg2P.h = t.h; } blit(ctx, msg2P, vw / 2 - msg2P.w / 2, vh / 2 + 12); }
      // behind the loading screen: bake the static pieces now, so the first frame of play does not pay for them
      if (atlas.ready && T.warm !== L.epoch) { T.warm = L.epoch; bakeBadge('now'); bakeBadge('past'); bakeShelf(T.max > 8 ? Math.ceil(T.max / 2) : T.max, px(25)); bakeMoon(s.moon?.phase ?? 0); }
      return;
    }
    const mode = opts.forceMode ?? input?.mode ?? 'touch';
    taps.n = 0; T.availW = vw - sf.l - sf.r;
    if (s.cross && s.cross.k <= 0.004) { if (atlas.ready) drawCross(ctx, s); return; }   // CROSSING: only the night badge is left on the picture
    // 1) world-anchored: enemy bars, lock ring, numbers, callouts, prompts
    const E = s.enemies; let target = null;
    if (E) for (let i = 0; i < E.length; i++) {
      const e = E[i]; if (e.dead || e.state === 'dead') continue;
      if (hero.lock != null && e.id === hero.lock) target = e;
      if (e.hp >= e.hpMax || (e._a3 && !e._a3.vis)) continue;
      s.project(e.x, e.y + (e.h ?? 80) + 26, e.z, P); if (P.w <= 1) continue;
      const k = clamp(880 / P.w, 0.5, 1.4), w = 44 * k, hg = 4.5 * k, x = P.x - w / 2;
      ctx.fillStyle = 'rgba(4,5,14,0.72)'; ctx.fillRect(x - 1.5, P.y - 1.5, w + 3, hg + 3);
      ctx.fillStyle = '#e2364e'; ctx.fillRect(x, P.y, w * clamp(e.hp / e.hpMax, 0, 1), hg);
      ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fillRect(x, P.y, w * clamp(e.hp / e.hpMax, 0, 1), hg * 0.34);
      ctx.fillStyle = 'rgba(232,238,255,0.8)'; ctx.fillRect(x - 1.5, P.y - 1.5, w + 3, 0.8);
    }
    if (target && atlas.img) {
      s.project(target.x, target.y + (target.h ?? 80) * 0.52, target.z, P);
      if (P.w > 1) {
        const k = clamp(880 / P.w, 0.5, 1.5), pulse = 1 + (T.lockPulse / 0.28) * 0.7, d = Math.max(48, (target.h ?? 80) * 0.95) * k * pulse;
        ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(T.t * 0.7); ctx.globalAlpha = 0.92 - (T.lockPulse / 0.28) * 0.4;
        sprite(ctx, 'lock', 0, 0, d, d); ctx.restore(); ctx.globalAlpha = 1;
        s.project(target.x, target.y + (target.h ?? 80) + 40, target.z, P);
        if (P.w > 1) { const q = 5 * k, by = P.y + Math.sin(T.t * 5) * 2; ctx.fillStyle = '#ff5a72'; ctx.beginPath(); ctx.moveTo(P.x, by + q * 1.5); ctx.lineTo(P.x + q, by); ctx.lineTo(P.x, by - q * 1.1); ctx.lineTo(P.x - q, by); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,240,244,0.9)'; ctx.lineWidth = 1; ctx.stroke(); }
      }
    }
    const N = s.numbers;
    if (N) for (let i = 0; i < N.length && i < NUM_SLOTS; i++) {
      const n = N[i]; if (n.on === false || n.str == null || n.t >= 0.8) continue;
      const slot = nums[i];
      if (slot.str !== n.str || slot.color !== n.color || slot.big !== !!n.big || slot.ep !== L.epoch) bakeNumber(slot, n);
      s.project(n.x, n.y + n.t * 70, n.z, P); if (P.w <= 1) continue;
      const nk = clamp(880 / P.w, 0.6, 1.5);
      drawPop(ctx, slot, P.x + (((i * 53) % 5) - 2) * 11 * nk, P.y, nk, n.t, 0.8, i);   // quick hits on one enemy fan out sideways instead of stacking on one spot
    }
    for (let i = 0; i < CALL_SLOTS; i++) {
      const o = calls[i]; if (!o.on) continue;
      s.project(o.x, o.y + o.t * 46, o.z, P); if (P.w <= 1) continue;
      drawPop(ctx, o, P.x, P.y, clamp(880 / P.w, 0.7, 1.4), o.t, o.dur, i + 3);
    }
    ctx.globalAlpha = 1;
    const PR = s.prompts;
    if (PR) { let j = 0; for (let i = 0; i < PR.length && j < PROMPT_SLOTS; i++) { const p = PR[i]; if (p.x == null) continue; const slot = wprompts[j++]; bakeWorldPrompt(slot, p, mode); s.project(p.x, p.y ?? 0, p.z ?? 0, P); if (P.w > 1) { const wx = clamp(P.x - slot.w / 2, sf.l + 4, vw - sf.r - slot.w - 4), wy = P.y - slot.h - 8; blit(ctx, slot, wx, wy + Math.sin(T.t * 3) * 2); tapAdd(p, wx, wy, slot.w, slot.h); } } }

    // the banner goes under the status block and the toasts (its soft dark band spans the screen)
    if (banner.on) {
      if (banner.dirty || bannerP.key2 !== L.epoch) { bakeBanner(); banner.dirty = false; bannerP.key2 = L.epoch; }
      const hold = banner.dur > 1e8, a = clamp(hold ? banner.t / 0.5 : Math.min(banner.t / 0.4, (banner.dur - banner.t) / 0.8), 0, 1);
      const big = banner.kind !== 'section', cy = banner.kind === 'section' ? sf.t + vh * 0.2 : vh * (banner.kind === 'night' ? 0.36 : 0.33);
      ctx.globalAlpha = a;
      if (big && bandP.c) ctx.drawImage(bandP.c, 0, cy - bannerP.h * 0.85, vw, bannerP.h * 1.7);
      const rise = (1 - clamp(banner.t / 0.5, 0, 1)) * px(10);
      blit(ctx, bannerP, vw / 2 - bannerP.w / 2, cy - bannerP.h / 2 + rise);
      ctx.globalAlpha = 1; BR.x = vw / 2 - bannerP.w / 2; BR.y = cy - bannerP.h / 2; BR.w = bannerP.w; BR.h = bannerP.h;   // (QA: where the banner's own box is - the cards keep clear of it)
    }
    // 2) top left: night badge, candles on their ledge, resonance cells, moon cell, place name
    const x0 = sf.l + px(10), y0 = sf.t + px(8);
    const which = (s.night ?? s.area?.era) === 'past' ? 'past' : 'now';
    const bd = bakeBadge(which); if (!s.cross) blit(ctx, bd, x0, y0);   // (CROSSING: drawCross draws the badge while a crossing runs)
    // candles: one row up to eight; more stand on two altar tiers (the back tier is drawn first, half a step aside)
    const max = T.max, per = max > 8 ? Math.ceil(max / 2) : max, two = max > per, step = px(25), ch = px(43);
    const cx0 = x0 + bd.w + px(14), baseY = y0 + px(50) + (two ? px(20) : 0);
    const litN = T.litShown, hurtK = Math.max(T.hurt / 0.7, T.lit <= 1.05 ? 0.38 : 0);   // the last candle gutters
    T.statusR = cx0 + (per - 1) * step + px(20) + (two ? step / 2 : 0);
    if (two) { const sh2 = bakeShelf(max - per, step); blit(ctx, sh2, cx0 + step / 2 - px(18) - 2, baseY - px(24) - px(4.5)); for (let i = per; i < max; i++) candle(ctx, i, cx0 + step / 2 + (i - per) * step, baseY - px(24), ch * 0.92, litN, hurtK); }
    const sh = bakeShelf(per, step); blit(ctx, sh, cx0 - px(18) - 2, baseY - px(4.5));
    for (let i = 0; i < per; i++) candle(ctx, i, cx0 + i * step, baseY, ch, litN, hurtK);
    const MD = opts.model ? opts.model() : null;
    { const dr = MD ? MD.dr | 0 : 0;   // SCREENS: the draughts carried, right of the candles (the boss bar keeps clear of it through T.statusR)
      if (dr > 0) { const dp = bakeDraught(dr); blit(ctx, dp, T.statusR - px(8), baseY - dp.h + px(3)); T.drR = T.drR ?? { x: 0, y: 0, w: 0, h: 0, n: 0 }; T.drR.x = T.statusR - px(8); T.drR.y = baseY - dp.h + px(3); T.drR.w = dp.w; T.drR.h = dp.h; T.drR.n = dr; T.statusR += dp.w - px(6); }
      else if (T.drR) T.drR.n = 0; }
    // resonance cells
    const cells = clamp(Math.round(s.resonance?.cells ?? 3), 3, 5), gy = baseY + px(41), cellH = px(32), cstep = px(18), full = T.res >= cells - 0.02;
    for (let i = 0; i < cells; i++) {
      const cx = cx0 + px(2) + i * cstep, f = clamp(T.res - i, 0, 1);
      spriteUp(ctx, 'cell_empty', cx, gy, cellH);
      if (f > 0.02) spriteUp(ctx, 'cell', cx, gy, cellH, f);
      if (f >= 0.98 && full) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.25 * Math.sin(T.t * 6 + i); spriteUp(ctx, 'cell', cx, gy, cellH); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
    let rx = cx0 + cells * cstep + px(4);
    if (s.moon) { const mp = bakeMoon(s.moon.phase ?? 0); blit(ctx, mp, rx, gy - cellH / 2 - mp.h / 2); rx += mp.w + px(4); }
    if (s.section?.label) {   // the place name stays left of the boss bar (or of the screen centre) however long it is
      const secMax = (s.boss ? vw / 2 - bossW() / 2 - px(6) : vw * 0.5) - rx;
      const sp = bakeSection(s.section.label, s.left ?? (s.section.id === 'yard' && !s.done ? (s.yardLeft | 0) : 0), secMax); blit(ctx, sp, rx, gy - cellH / 2 - sp.h / 2);
    }

    // 2b) the objective of the story (state.objective): one gold line under the cells, a small mark in front of it
    let objH = 0;
    if (s.objective) {
      const op = bakeObjective(String(s.objective), vw * 0.46 - cx0), oy = gy + cellH / 2 + px(3);
      ctx.fillStyle = COL.gold; ctx.beginPath(); ctx.moveTo(cx0 + px(4), oy + op.h / 2 - px(4)); ctx.lineTo(cx0 + px(8), oy + op.h / 2); ctx.lineTo(cx0 + px(4), oy + op.h / 2 + px(4)); ctx.lineTo(cx0, oy + op.h / 2); ctx.closePath(); ctx.fill();
      blit(ctx, op, cx0 + px(11), oy); objH = op.h + px(4); if (!T.objR) T.objR = { x: 0, y: 0, w: 0, h: 0 }; T.objR.x = cx0; T.objR.y = oy; T.objR.w = op.w + px(11); T.objR.h = op.h; T.objOn = true;
    } else T.objOn = false;
    { const gl = MD ? MD.guideLine() : '';   // SCREENS: the guide candle - where the nearest blank can be filled, one small line under the objective
      if (gl) { const gp = bakeGuide(gl, vw * 0.46 - cx0), gy2 = gy + cellH / 2 + px(3) + objH; blit(ctx, gp, cx0, gy2); objH += gp.h + px(2); if (!T.guideR) T.guideR = { x: 0, y: 0, w: 0, h: 0 }; T.guideR.x = cx0; T.guideR.y = gy2; T.guideR.w = gp.w; T.guideR.h = gp.h; T.guideOn = true; } else T.guideOn = false; }

    // 3) toasts under the status block
    let ty = Math.max(y0 + bd.h + px(52), gy + cellH / 2 + px(3) + objH);
    if (CN.a > 0) {   // the coin chip takes the first place of the toast column (toasts move down under it: nothing is ever covered)
      const cp = bakeCoins(Math.floor(CN.shown + 1e-6)), k = Math.min(1, CN.a), cx = x0 - 3 - (1 - k) * px(26);
      ctx.globalAlpha = k; blit(ctx, cp, cx, ty); ctx.globalAlpha = 1; T.coinR = T.coinR ?? { x: 0, y: 0, w: 0, h: 0, a: 0, n: 0 }; T.coinR.x = cx; T.coinR.y = ty; T.coinR.w = cp.w; T.coinR.h = cp.h; T.coinR.a = k; T.coinR.n = Math.floor(CN.shown + 1e-6);
      ty += cp.h + px(2);
    } else if (T.coinR) T.coinR.a = 0;
    for (let i = 0; i < TOAST_SLOTS; i++) {
      const o = toasts[i]; if (!o.on) continue;
      if (o.dirty || o.ep !== L.epoch) { bakeToast(o); o.dirty = false; o.ep = L.epoch; }
      const a = clamp(Math.min(o.t / 0.22, (o.dur - o.t) / 0.4), 0, 1), slide = (1 - clamp(o.t / 0.22, 0, 1)) * -px(26);
      ctx.globalAlpha = a; blit(ctx, o, x0 - 3 + slide, ty); ctx.globalAlpha = 1; o.rx = x0 - 3; o.ry = ty; ty += o.h + px(2);
    }

    // 4) top centre: boss, or the banner
    const b = s.boss;
    if (b) {
      const bp = bakeBoss(b), bx = vw / 2 - bp.w / 2, by = sf.t + px(4);
      blit(ctx, bp, bx, by);
      const k = clamp(b.hp / (b.hpMax || 1), 0, 1), fx = bx + bp.barX + 1.5, fy = by + bp.barY + 1.5, fw = bp.barW - 3, fh = bp.barH - 3, S = L.s;
      if (T.bossShown > k) ctx.drawImage(bossFill.c, 0, bp.barH * S, fw * T.bossShown * S, fh * S, fx, fy, fw * T.bossShown, fh);
      if (k > 0) ctx.drawImage(bossFill.c, 0, 0, fw * k * S, fh * S, fx, fy, fw * k, fh);
      if (b.stagger > 0) { ctx.fillStyle = COL.gold; ctx.fillRect(fx, fy + fh + 2.5, fw * clamp(b.stagger, 0, 1), px(2.2)); }
      if (b.phase) {   // acts of the fight: two small diamonds right of the bar, lit up to the act the boss is in (state.boss.phase 1｜2)
        const ps = px(4.2), py = fy + fh * 0.5;
        for (let i = 0; i < 2; i++) { const cx = fx + fw + px(10) + i * px(11); ctx.beginPath(); ctx.moveTo(cx, py - ps); ctx.lineTo(cx + ps, py); ctx.lineTo(cx, py + ps); ctx.lineTo(cx - ps, py); ctx.closePath(); ctx.fillStyle = i < b.phase ? COL.gold : 'rgba(10,8,20,0.7)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke(); }
      }
    }
    // 5) bottom centre: button prompts
    bakePrompts(s, mode);
    if (promptRow.n > 0 && promptRow.c) {
      // a row wider than the free middle (between the stick and the buttons on touch) is drawn smaller, never under them
      const room = mode === 'touch' ? vw * 0.46 : vw - sf.l - sf.r - px(24), pk = promptRow.w > room ? room / promptRow.w : 1;
      const bx = vw / 2 - promptRow.w * pk / 2, by = vh - sf.b - promptRow.h * pk - px(mode === 'touch' ? 8 : 14);
      ctx.drawImage(promptRow.c, bx, by, promptRow.w * pk, promptRow.h * pk);
      if (PR) for (let i = 0, k = 0; i < PR.length && k < 8; i++) if (PR[i].x == null) { tapAdd(PR[i], bx + rowX[k] * pk, by + 4 * pk, rowW[k] * pk, px(28) * pk); k++; }
    }
    if (s.debug && s.debugLine) {
      if ((T.dbgN = (T.dbgN ?? 0) - 1) <= 0) { T.dbgN = 30; const t = bakeText(String(s.debugLine()), L.s, { size: 11, weight: 500, fill: 'rgba(225,228,245,0.7)', lw: 2 }, dbgP.t); dbgP.t = t; dbgP.c = t.c; dbgP.w = t.w; dbgP.h = t.h; }
      blit(ctx, dbgP, vw / 2 - dbgP.w / 2, vh - sf.b - dbgP.h + 2);
    }
    if (s.cross && atlas.ready) drawCross(ctx, s);   // CROSSING: the rest fades by cross.k, the badge stays and turns over
  }
  function candle(ctx, i, cx, baseY, ch, litN, hurtK) {
    const f = clamp(litN - i, 0, 1);
    if (f > 0.02) {
      spriteUp(ctx, 'candle', cx, baseY, ch);
      const fl = 1 + 0.07 * Math.sin(T.t * 11 + phase[i]) + 0.05 * Math.sin(T.t * 23.7 + phase[i] * 2) + hurtK * 0.35 * Math.sin(T.t * 47 + phase[i] * 3);
      const fh = ch * 0.6 * (0.55 + 0.45 * f) * fl, sway = hurtK * px(2.2) * Math.sin(T.t * 31 + phase[i]);
      ctx.globalAlpha = clamp(0.86 + 0.14 * Math.sin(T.t * 17 + phase[i]) - hurtK * 0.25 * (0.5 + 0.5 * Math.sin(T.t * 53 + i)), 0.3, 1);
      spriteUp(ctx, 'flame', cx + sway, baseY - ch * 0.80, fh);
      ctx.globalAlpha = 1;
    } else {
      spriteUp(ctx, 'candle_dead', cx, baseY, ch);
      const sm = smoke[i];
      if (sm > 0) { const k = 1 - sm / 0.9; ctx.globalAlpha = (1 - k) * 0.55; ctx.fillStyle = '#c9cfe6'; ctx.beginPath(); ctx.arc(cx + Math.sin(k * 7 + i) * px(3), baseY - ch - k * px(16), px(2 + k * 4), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    }
  }
  // a baked word that pops, rises (the caller moves it) and fades; tilt differs per slot so numbers do not line up
  function drawPop(ctx, slot, x, y, k, t, dur, i) {
    if (!slot.c) return;
    const sc = k * (t < 0.12 ? 1.55 - (t / 0.12) * 0.55 : 1), w = slot.w * sc, h = slot.h * sc;
    ctx.save(); ctx.translate(x, y); ctx.rotate((((i * 37) % 7) - 3) * 0.035);
    ctx.globalAlpha = clamp((dur - t) / 0.25, 0, 1);
    ctx.drawImage(slot.c, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  return {
    update, banner: setBanner, toast: addToast, callout: addCallout,
    draw,
    number(x, y, z, str, o) { addCallout(x, y, z, String(str), 'num', !!o?.big); },
    resize() { L.epoch++; L.s = 0; },
    /** touch: the prompt chip under a logical point (hit area grown to 44 CSS px), or null */
    promptAt(x, y) {
      for (let k = 0; k < taps.n; k++) {
        const i = k * 4, h = taps.rect[i + 3], g = Math.max(0, (44 / L.css - h) / 2);
        if (x >= taps.rect[i] - 6 && x <= taps.rect[i] + taps.rect[i + 2] + 6 && y >= taps.rect[i + 1] - g && y <= taps.rect[i + 1] + h + g) return taps.ref[k];
      }
      return null;
    },
    promptRects() { const o = []; for (let k = 0; k < taps.n; k++) o.push({ action: taps.ref[k]?.action, x: taps.rect[k * 4], y: taps.rect[k * 4 + 1], w: taps.rect[k * 4 + 2], h: taps.rect[k * 4 + 3] }); return o; },
    layout: L, px, tsz,
    info() { return { scale: L.s, hs: L.hs, textSize: L.textSize, epoch: L.epoch, banner: banner.on ? banner.kind : null, bannerTitle: banner.on ? banner.title : '', toasts: toasts.filter((q) => q.on).length, lit: T.lit, max: T.max, coins: T.coinR && T.coinR.a > 0 ? { ...T.coinR } : null, bannerRect: banner.on ? { ...BR } : null, toastRects: toasts.filter((q) => q.on).map((q) => ({ x: q.rx, y: q.ry, w: q.w, h: q.h })), objective: T.objOn && T.objR ? { ...T.objR } : null, guide: T.guideOn && T.guideR ? { ...T.guideR } : null, draughts: T.drR && T.drR.n > 0 ? { ...T.drR } : null, statusR: T.statusR }; },
    release() { for (const p of [badge.now, badge.past, yearP, ...Object.values(shelves), moonP, bossP, bossFill, bannerP, bandP, promptRow, msgP, msg2P, dbgP, drP, guideP, ...nums, ...calls, ...toasts, ...wprompts]) if (p.c) { p.c.width = 1; p.c.height = 1; p.c = null; } icons.clear(); },
  };
}
const ZERO = { l: 0, t: 0, r: 0, b: 0 };
