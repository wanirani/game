// v2 interface - the ending card of the first release (CHAPTER lane; docs/v2/UI_API.md, docs/v2/ENGINE_API.md 12.4).
//   hud.showEnd({ title, head, sub, home, far: [a, b], cont, hint, onDone })      hud.tapEnd() -> true when the card was closed by it
// The game's picture stays behind a dark veil. On it: the title, the bell-sound circle growing by one ring until it reaches the two places that
// lie beyond the village (GDD 9.2 cut scene 8 - as far as it can be shown before the valley map exists), "to be continued", and the hint.
// It is drawn straight into the game canvas while it is open (a few lines of text and a handful of rings a frame; the fight is over).
import { clamp, COL, FONTS, TAU } from './draw.js';

const T_VEIL = 1.0, T_TITLE = 0.5, T_RING0 = 1.5, T_RING1 = 4.4, T_CONT = 4.9, READY = 5.6;   // seconds since the card came up
const ease = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

export function createEndCard(env) {
  const px = env.hud.px, tsz = env.hud.tsz;
  const E = { open: false, t: 0, o: null, done: false };
  function line(ctx, str, x, y, size, o = {}) {
    if (!str) return;
    ctx.font = `${o.weight ?? 700} ${size}px ${o.family ?? FONTS.body}`; ctx.textAlign = o.align ?? 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.globalAlpha = clamp(o.a ?? 1, 0, 1);
    ctx.lineWidth = Math.max(2, size * 0.16); ctx.strokeStyle = 'rgba(4,5,12,0.9)'; ctx.strokeText(str, x, y);
    ctx.fillStyle = o.color ?? COL.silver; ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }
  /** a small bell: the village the sound starts from */
  function bell(ctx, x, y, r, a) {
    ctx.globalAlpha = a; ctx.fillStyle = COL.gold; ctx.strokeStyle = 'rgba(4,5,12,0.9)'; ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.62); ctx.quadraticCurveTo(x - r * 0.62, y + r * 0.2, x - r * 0.56, y - r * 0.3); ctx.quadraticCurveTo(x - r * 0.5, y - r, x, y - r);
    ctx.quadraticCurveTo(x + r * 0.5, y - r, x + r * 0.56, y - r * 0.3); ctx.quadraticCurveTo(x + r * 0.62, y + r * 0.2, x + r, y + r * 0.62); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y + r * 0.86, r * 0.2, 0, TAU); ctx.stroke(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function ring(ctx, x, y, r, sq, a, w, col, dash) {
    if (a <= 0.004 || r <= 0) return;
    ctx.globalAlpha = clamp(a, 0, 1); ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * sq, 0, 0, TAU); ctx.stroke();
    if (dash) ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  return {
    get open() { return E.open; },
    show(o) { E.open = true; E.t = 0; E.o = o || {}; E.done = false; },
    close() { E.open = false; E.o = null; },
    update(dt) { if (E.open) E.t += dt; },
    /** a tap or the confirm key: once the circle has grown the card is done (onDone, once) */
    tap() {
      if (!E.open || E.done || E.t < READY) return false;
      E.done = true; const f = E.o && E.o.onDone;
      try { if (f) f(); } catch (e) { console.error('[v2ui] ending card', e); }
      return true;
    },
    draw(ctx, s) {
      if (!E.open) return;
      const o = E.o, t = E.t, vw = s.viewW, vh = s.viewH, sf = s.safe ?? { l: 0, t: 0, r: 0, b: 0 }, cx = vw / 2;
      ctx.save();
      ctx.globalAlpha = 0.8 * ease(t / T_VEIL); ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = 1;
      const top = sf.t + vh * 0.06, bot = vh - sf.b - vh * 0.05, H = bot - top;
      // the title
      const ta = ease((t - T_TITLE) / 0.9), ts = tsz(46), ty = top + H * 0.1 + (1 - ta) * px(8);
      line(ctx, o.title, cx, ty, ts, { weight: 800, family: FONTS.title, color: COL.gold, a: ta });
      { const w = px(150) * ta; ctx.globalAlpha = 0.7 * ta; ctx.fillStyle = COL.goldDeep; ctx.fillRect(cx - w, ty + ts * 0.74, w * 2, Math.max(1, px(1.5))); ctx.globalAlpha = 1; }
      line(ctx, o.head, cx, ty + ts * 1.32, tsz(17), { weight: 600, color: COL.silver, a: ease((t - T_TITLE - 0.5) / 0.9) });
      // the bell-sound circle: the ring that was, the new ring growing out to the places it now reaches, and what still lies beyond
      // (laid out from both ends, so that nothing meets on a low screen: title and head above, "to be continued" and the hint below, the circle and its line in the room between)
      const sq = 0.5, contY = bot - px(38), subS = tsz(15.5), g0 = top + H * 0.1 + ts * 1.32 + tsz(17) * 0.5 + px(14), g1 = contY - tsz(18) * 0.5 - px(22) - subS - px(14);
      const gy = (g0 + g1) / 2, r1 = Math.max(px(36), Math.min(vw * 0.3, (g1 - g0) / 2 / sq)), r0 = r1 * 0.5, ga = ease((t - 1.0) / 0.8), k = ease((t - T_RING0) / (T_RING1 - T_RING0)), r = r0 + (r1 - r0) * k;
      const kOut = Math.max(1.2, Math.min(1.9, (contY - tsz(18) * 0.5 - px(6) - gy) / (r1 * sq)));   // the outermost ring ends above "to be continued"
      ring(ctx, cx, gy, r1 * Math.min(1.42, (1 + kOut) / 2), sq, 0.16 * ga, px(1.2), COL.silverDim, [px(3), px(7)]);
      ring(ctx, cx, gy, r1 * kOut, sq, 0.1 * ga, px(1.2), COL.silverDim, [px(3), px(9)]);
      ring(ctx, cx, gy, r0, sq, 0.55 * ga, px(1.6), COL.goldDeep);
      if (k > 0) { ring(ctx, cx, gy, r, sq, 0.22 * ga, px(9), COL.gold); ring(ctx, cx, gy, r, sq, 0.95 * ga, px(2.4), COL.gold); }
      for (let i = 1; i <= 2; i++) { const q = (t * 0.45 + i * 0.5) % 1; ring(ctx, cx, gy, r * q, sq, 0.3 * ga * (1 - q), px(1.2), COL.gold); }   // the sound itself, running out from the bell
      bell(ctx, cx, gy - px(4), px(11), ga);
      line(ctx, o.home, cx, gy + px(24), tsz(14.5), { weight: 700, color: COL.silver, a: ga });
      const far = Array.isArray(o.far) ? o.far : [], AN = [-0.62, 2.62];   // up to the right, down to the left
      for (let i = 0; i < far.length && i < 2; i++) {
        const an = AN[i], rr = r1 * 0.9, x = cx + Math.cos(an) * rr, y = gy + Math.sin(an) * rr * sq, lit = ease((r - rr * 0.94) / (r1 * 0.08)), a = ga * (0.22 + 0.78 * lit), d = px(5) * (1 + 0.5 * lit);
        ctx.globalAlpha = a; ctx.fillStyle = lit > 0.5 ? COL.gold : COL.silverDim; ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        line(ctx, far[i], x, y + (i ? px(21) : -px(21)), tsz(14.5), { weight: 700, color: lit > 0.5 ? COL.silver : COL.silverDim, a });
      }
      line(ctx, o.sub, cx, gy + r1 * sq + px(14) + subS * 0.5, subS, { weight: 600, color: COL.gold, a: ease((t - T_RING1 + 0.4) / 0.8) });   // right under the circle
      // to be continued · the hint
      line(ctx, o.cont, cx, contY, tsz(18), { weight: 700, family: FONTS.title, color: COL.silver, a: ease((t - T_CONT) / 0.8) });
      if (t >= READY) line(ctx, o.hint, cx, bot - px(8), tsz(12.5), { weight: 500, color: COL.silverDim, a: 0.55 + 0.35 * Math.sin((t - READY) * 3) });
      ctx.restore();
    },
    info() { return { open: E.open, t: E.t, ready: E.open && E.t >= READY, done: E.done }; },
    release() { E.open = false; E.o = null; },
  };
}
