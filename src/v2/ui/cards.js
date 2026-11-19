// v2 interface - the rising cards and the book chip (docs/v2/UI_API.md 10.3, 10.4). They never stop the game and hold nothing.
//   hud.card('chronicle', { id, title })      「연대기에 적혔다 — <title>」, about 2.5 s; a tap on it opens the book at that entry
//   hud.card('item', { name, icon, n })       「얻었다 — <name>」 with the thing's picture, about 2 s
//   hud.card('note', { text, icon, kind })    one line with a picture (a thing the story took away, a draught used, a purchase)
// The cards stand at the right edge under the pause button (the place UI_API 6 keeps for item notices): never on the banner, the toasts or the
// dialogue box. As many as fit above the pad's buttons are up at once (three on the Fold, one on a phone); the rest wait their turn.
// The chip: a small book left of the pause button while model.chip is set (something was written and the book has not been opened since).
// Cost: a card is baked once when it comes up; a frame is one drawImage per card and one for the chip. Nothing is allocated per frame.
import { glassPanel, chamfer, sprite, fitText, measure, makeCanvas, clamp, COL, FONTS, gem, hasSprite } from './draw.js';
import { bakeIcon, hasIcon } from './icons.js';

const SLOTS = 3, QUEUE = 8, RISE = 0.18, FADE = 0.3;

export function createCards(env) {
  const L = env.hud.layout, px = env.hud.px, tsz = env.hud.tsz;
  const cards = []; for (let i = 0; i < SLOTS; i++) cards.push({ c: null, w: 0, h: 0, on: false, t: 0, dur: 2, kind: '', text: '', icon: '', id: null, tap: false, x: 0, y: 0, ep: -1, order: 0, tint: 'gold' });
  const queue = [];
  const chip = { c: null, w: 0, h: 0, ep: -1, r: 0 }, CH = new Float64Array(2), CA = 0, CT = 1;   // CH: the chip's alpha and age
  // where they stand, kept in a typed array: a fractional number stored into a plain object's field is a new boxed number every tick (UI_API 7)
  const R = new Float64Array(9), RIGHT = 0, TOP = 1, BOT = 2, MAX = 3, RH = 4, GAP = 5, PX = 6, PY = 7, CB = 8; R[MAX] = 1; R[CB] = 56;
  let seq = 0, n = 0;
  const model = () => (env.model ? env.model() : null);
  const sound = (name) => { try { model()?.sound?.(name); } catch { /* no audio */ } };

  function canvasFor(p, w, h) {
    const s = L.s || 2, cw = Math.max(1, Math.ceil(w * s)), ch = Math.max(1, Math.ceil(h * s));
    if (!p.c) p.c = makeCanvas(cw, ch); else if (p.c.width !== cw || p.c.height !== ch) { p.c.width = cw; p.c.height = ch; }
    p.w = w; p.h = h; const c = p.c.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch); c.setTransform(s, 0, 0, s, 0, 0); return c;
  }
  function bakeCard(o) {
    const ts = tsz(14, L.tmin + 2.4), h = Math.round(px(46)), ih = px(34), maxT = Math.min(L.vw * 0.4, px(340));   // (whole px: a whole number handed to drawImage is not boxed)
    const ft = fitText(o.text, ts, maxT, 700, FONTS.body, 0.82), tw = measure(ft.str, ft.size, 700), w = Math.ceil(px(10) + ih + px(10) + tw + px(o.tap ? 30 : 16));
    const c = canvasFor(o, w + 8, h + 10);
    glassPanel(c, 4, 4, w, h, { cut: px(9), dense: 0.84, accent: o.tint === 'ruby' ? 'ruby' : o.tint === 'none' ? null : 'gold' });
    const ix = 4 + px(10) + ih / 2, iy = 4 + h / 2;
    chamfer(c, ix - ih / 2, iy - ih / 2, ih, ih, px(6)); c.fillStyle = 'rgba(10,12,30,0.6)'; c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(241,212,138,0.5)'; c.stroke();
    if (hasIcon(o.icon)) { const b = bakeIcon(o.icon, ih * 0.84, L.s || 2); c.drawImage(b.c, ix - b.w / 2, iy - b.w / 2, b.w, b.w); } else sprite(c, hasSprite(o.icon) ? o.icon : 'pouch', ix, iy, ih * 0.8, ih * 0.8);
    c.font = `700 ${ft.size}px ${FONTS.body}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = 'rgba(4,4,12,0.85)';
    const tx = ix + ih / 2 + px(10); c.strokeText(ft.str, tx, iy + 1); c.fillStyle = '#fff2d2'; c.fillText(ft.str, tx, iy + 1);
    if (o.tap) { const q = px(4.4), ax = 4 + w - px(13); c.beginPath(); c.moveTo(ax - q, iy - q * 1.5); c.lineTo(ax + q, iy); c.lineTo(ax - q, iy + q * 1.5); c.lineWidth = 2; c.strokeStyle = COL.gold; c.stroke(); }   // it can be pressed: the book opens there
    c.textBaseline = 'alphabetic'; o.ep = L.epoch;
  }
  function bakeChip() {
    const r = Math.round(px(19)), w = r * 2 + 14, c = canvasFor(chip, w, w);
    gem(c, w / 2, w / 2, r, { facets: 10 });
    const b = bakeIcon('book', r * 1.5, L.s || 2); c.drawImage(b.c, w / 2 - b.w / 2, w / 2 - b.w / 2 + 1, b.w, b.w);
    c.beginPath(); c.arc(w / 2 + r * 0.72, w / 2 - r * 0.72, px(4.4), 0, Math.PI * 2); c.fillStyle = COL.gold; c.fill(); c.lineWidth = 1.2; c.strokeStyle = 'rgba(4,5,14,0.9)'; c.stroke();
    chip.r = r; chip.ep = L.epoch;
  }
  const BT = new Float64Array(3);
  /** where the cards and the chip stand this tick (logical px), from the pad's own measures (pad = the touch layer, or null) */
  function place(s, pad) {
    const sf = s.safe ?? ZERO, g = env.game, rect = g.canvasRect ?? null, css = L.css || 1;
    const rd = Math.round;
    R[RIGHT] = rd(s.viewW - sf.r - px(12)); R[RH] = rd(px(46)); R[GAP] = rd(px(4)); R[TOP] = rd(sf.t + px(64)); R[BOT] = rd(s.viewH * 0.56); R[PX] = -1;
    R[CB] = Math.ceil(Math.max(56 / css, px(38)));
    if (pad && rect) {   // by the pad's layout whether or not it is on screen now (a dialogue or a cut hides buttons that are back a moment later: a card must not be found on one)
      for (let i = 0, nb = pad.count; i < nb; i++) {
        if (!pad.at(i, BT)) break;
        const cx = (BT[0] - rect.x) / css, cy = (BT[1] - rect.y) / css, rr = BT[2] / 2 / css;
        if (pad.idAt(i) === 'pause') { R[TOP] = rd(cy + rr + px(12)); R[PX] = Math.floor(cx - rr - (8 + 2) / css - R[CB] / 2); R[PY] = rd(cy); }
        else if (cx > s.viewW * 0.5 && cy - rr - 10 / css < R[BOT]) R[BOT] = cy - rr - 10 / css;   // the highest button on that side: the cards end above it
      }
    }
    if (R[PX] < 0) { R[PX] = rd(s.viewW - sf.r - px(14) - R[CB] / 2); R[PY] = rd(sf.t + px(12) + R[CB] / 2); R[TOP] = rd(R[PY] + R[CB] / 2 + px(6)); }
    R[MAX] = clamp(Math.floor((R[BOT] - R[TOP] + R[GAP]) / (R[RH] + 10 + R[GAP])), 1, SLOTS);
  }

  return {
    /** a card joins the line */
    push(kind, o = {}) {
      const T = model()?.T ?? {};
      let text = '', icon = o.icon ?? 'pouch', dur = 2.0, tap = false, tint = 'gold';
      if (kind === 'chronicle') { text = String(T.chronicle?.card ?? '{title}').replace('{title}', o.title ?? ''); icon = 'book'; dur = 2.5; tap = true; }
      else if (kind === 'item') text = String(T.bag?.got ?? '{name}').replace('{name}', o.name ?? '') + (o.n > 1 ? ' ×' + o.n : '');
      else { text = String(o.text ?? ''); tint = o.kind === 'warn' ? 'ruby' : o.kind === 'plain' ? 'none' : 'gold'; }
      if (!text) return;
      if (queue.length >= QUEUE) queue.shift();
      queue.push({ kind, text, icon, id: o.id ?? null, dur: o.time ?? dur, tap, tint });
    },
    update(dt, s, modal, pad) {
      place(s, pad);
      const M = model(), frozen = modal === 'pause' || modal === 'end' || !!s.message;
      n = 0; for (let i = 0; i < SLOTS; i++) if (cards[i].on) n++;
      if (!frozen) {
        while (queue.length && n < R[MAX]) {   // the next one comes up (a card is baked here, once)
          let o = null; for (let i = 0; i < SLOTS; i++) if (!cards[i].on) { o = cards[i]; break; } if (!o) break;
          const q = queue.shift(); o.on = true; o.t = 0; o.dur = q.dur; o.kind = q.kind; o.text = q.text; o.icon = q.icon; o.id = q.id; o.tap = q.tap; o.tint = q.tint; o.order = ++seq; bakeCard(o); n++;
          if (q.kind !== 'chronicle') sound('card.rise');
        }
        for (let i = 0; i < SLOTS; i++) {
          const o = cards[i]; if (!o.on) continue;
          o.t += dt; if (modal === 'dialog' && o.tap && o.t > o.dur - 1.2) o.t = o.dur - 1.2;   // a card that can be pressed waits for the dialogue box to close
          if (o.t >= o.dur) o.on = false;
        }
      }
      // the chip: up while something was written and the book has not been opened
      const want = M && M.chip && !modal && !s.message ? 1 : 0;
      CH[CA] += (want - CH[CA]) * Math.min(1, dt * (want ? 9 : 14)); if (CH[CA] < 0.01) CH[CA] = 0; CH[CT] += dt;
    },
    draw(ctx, s, modal) {
      if (modal === 'end' || s.message) return;
      const k = s.cross ? clamp(s.cross.k, 0, 1) : 1; if (k <= 0.004) return;
      if (CH[CA] > 0) {
        if (chip.ep !== L.epoch) bakeChip();
        const pop = CH[CT] < 3 ? 1 + 0.06 * Math.sin(CH[CT] * 7) : 1, w = chip.w * pop;
        ctx.globalAlpha = CH[CA] * k; ctx.drawImage(chip.c, R[PX] - w / 2, R[PY] - w / 2, w, w); ctx.globalAlpha = 1;
      }
      // the cards, the oldest on top; each rises into its place and fades out there
      let y = R[TOP], last = 0;
      for (let pass = 0; pass < SLOTS; pass++) {
        let o = null; for (let i = 0; i < SLOTS; i++) { const q = cards[i]; if (q.on && q.order > last && (!o || q.order < o.order)) o = q; }
        if (!o) break; last = o.order;
        if (o.ep !== L.epoch) bakeCard(o);
        const a = clamp(Math.min(o.t / RISE, (o.dur - o.t) / FADE), 0, 1), rise = o.t < RISE ? Math.round((1 - o.t / RISE) * px(12)) : 0;
        o.x = R[RIGHT] - o.w + 4; o.y = y;
        ctx.globalAlpha = a * k * (modal === 'pause' ? 0.5 : 1); ctx.drawImage(o.c, o.x, y + rise, o.w, o.h); ctx.globalAlpha = 1;
        y += o.h + R[GAP];
      }
    },
    /** what a touch at a logical point would press: 'chip', a card that can be pressed, or null (hit areas are 56 CSS px or more) */
    hit(x, y, s, modal) {
      if (modal || !s || s.cross || s.message || s.loading) return null;
      if (CH[CA] > 0.5 && Math.abs(x - R[PX]) <= R[CB] / 2 && Math.abs(y - R[PY]) <= R[CB] / 2) return 'chip';
      for (let i = 0; i < SLOTS; i++) {
        const o = cards[i]; if (!o.on || !o.tap || o.t < 0.12) continue;
        const g = Math.max(0, (R[CB] - o.h) / 2);
        if (x >= o.x - 6 && x <= o.x + o.w + 6 && y >= o.y - g && y <= o.y + o.h + g) return o;
      }
      return null;
    },
    /** the pressed card leaves at once (the book is opening) */
    take(o) { if (o && o !== 'chip') { o.on = false; } },
    clear() { queue.length = 0; for (let i = 0; i < SLOTS; i++) cards[i].on = false; },
    info() {
      const up = []; for (let i = 0; i < SLOTS; i++) { const o = cards[i]; if (o.on) up.push({ kind: o.kind, text: o.text, icon: o.icon, id: o.id, tap: o.tap, t: o.t, dur: o.dur, x: o.x + 4, y: o.y + 4, w: o.w - 8, h: o.h - 10, hitH: Math.max(o.h, R[CB]) }); }
      up.sort((a, b) => a.y - b.y);
      return { up, waiting: queue.length, max: R[MAX], top: R[TOP], bot: R[BOT], chip: CH[CA] > 0.5 ? { x: R[PX] - R[CB] / 2, y: R[PY] - R[CB] / 2, w: R[CB], h: R[CB], a: CH[CA], r: chip.r } : null };
    },
    release() { for (const p of [chip, ...cards]) if (p.c) { p.c.width = 1; p.c.height = 1; p.c = null; } queue.length = 0; },
  };
}
const ZERO = { l: 0, t: 0, r: 0, b: 0 };
