// v2 interface - a choice as two large cards (docs/v2/UI_API.md 4.1): the name, the picture and the one line the story gives each option.
// A choice is CONFIRMED BY A SECOND TAP: the first press on a card chooses it (it lifts, its rim turns gold, 「한 번 더 누르면 정한다」 appears),
// the second press on the same card decides. Why a second tap and not a hold: a hold cannot be seen, it is the bell's own gesture in this game
// (hold to cross), and a second tap works the same with a finger, a key and a pad button. A choice can never be made by a stray tap meant for
// the dialogue before it: the cards take nothing for 0.35 s after they come up, no card is chosen beforehand, a press beside the cards lets
// go of the chosen one, and a confirm key with nothing chosen only chooses the first card.
// The built-in HUD of the old pad gets the same cards through attachChoiceCards(hud, game) (the story host calls it when a choice comes up).
import { glassPanel, chamfer, fitText, wrapLines, measure, makeCanvas, clamp, COL, FONTS } from './draw.js';
import { bakeIcon, hasIcon } from './icons.js';

const ARM = 0.35, AGAIN = 0.12;   // seconds: the cards take nothing at first · the least time between the tap that chooses and the tap that decides (a bounce is not a second tap)

/** M = { px(v), tsz(base, min), L: { s, css, tmin, epoch }, text(): TEXT.screens | {}, sound(name) } */
export function createChoiceCards(M) {
  const px = M.px, tsz = M.tsz, L = M.L;
  const C = { open: false, labels: null, meta: null, onPick: null, sel: -1, t: 0, selT: 0, n: 0, big: false, key: '', vw: 0, vh: 0, bot: 0 };
  const P = [{ c: null, w: 0, h: 0, x: 0, y: 0 }, { c: null, w: 0, h: 0, x: 0, y: 0 }];
  const G = { cw: 0, ch: 0, gap: 0, ic: 0 };
  function canvasFor(p, w, h) {
    const s = L.s || 2, cw = Math.max(1, Math.ceil(w * s)), ch = Math.max(1, Math.ceil(h * s));
    if (!p.c) p.c = makeCanvas(cw, ch); else if (p.c.width !== cw || p.c.height !== ch) { p.c.width = cw; p.c.height = ch; }
    p.w = w; p.h = h; const c = p.c.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch); c.setTransform(s, 0, 0, s, 0, 0); return c;
  }
  const say = (c, str, x, y, size, col, weight, family) => { c.font = `${weight} ${size}px ${family}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = Math.max(2.4, size * 0.17); c.strokeStyle = 'rgba(4,4,12,0.8)'; c.strokeText(str, x, y); c.fillStyle = col; c.fillText(str, x, y); };
  /** sizes for this screen: the cards stand side by side, their lower edge at `bot` (the top of the dialogue box) or in the middle of the screen */
  function layout(s, bot) {
    const sf = s.safe ?? ZERO, vw = s.viewW, vh = s.viewH, B = 56 / (L.css || 1), availW = vw - sf.l - sf.r - px(40), top = sf.t + px(10);
    C.vw = vw; C.vh = vh; C.bot = bot; G.gap = Math.round(px(18));
    const ts = tsz(19, (L.tmin ?? 9.5) + 5), ls = tsz(13, (L.tmin ?? 9.5) + 2);
    if (C.big) {
      G.cw = Math.round(clamp((availW - G.gap) / 2, px(150), px(264)));
      const room = (bot > 0 ? bot : vh - sf.b) - top - px(10);
      G.ch = Math.round(clamp(px(196), Math.max(B, ts * 4), Math.max(B, room))); G.ic = clamp(G.ch - ts * 1.7 - ls * 4.6 - px(20), px(34), px(84));
    } else {
      let w = px(150); for (let i = 0; i < C.n; i++) w = Math.max(w, measure(C.labels[i], ts, 800, FONTS.title) + px(48));
      G.cw = Math.round(Math.min(w, (availW - G.gap) / 2)); G.ch = Math.ceil(Math.max(B, ts * 2.5 + ls * 1.6)); G.ic = 0;
    }
    const tw = G.cw * C.n + G.gap * (C.n - 1), x0 = Math.round((vw - tw) / 2), y = Math.round(bot > 0 ? Math.max(top, bot - px(12) - G.ch) : (vh - G.ch) / 2);   // (whole px: a still frame hands the canvas no fractions)
    for (let i = 0; i < C.n; i++) { P[i].x = x0 + i * (G.cw + G.gap) - 8; P[i].y = y - 8; }
    for (let i = 0; i < C.n; i++) bake(i);
    C.key = L.epoch;
  }
  function bake(i) {
    const p = P[i], w = G.cw, h = G.ch, sel = i === C.sel, c = canvasFor(p, w + 16, h + 16), m = C.meta && C.meta[i] ? C.meta[i] : null;
    const ts = tsz(19, (L.tmin ?? 9.5) + 5), ls = tsz(13, (L.tmin ?? 9.5) + 2), cx = 8 + w / 2;
    glassPanel(c, 8, 8, w, h, { cut: px(13), top: sel ? 'rgba(34,32,50,0.95)' : 'rgba(22,26,50,0.92)', bot: 'rgba(7,8,20,0.95)', accent: sel ? 'gold' : null });   // (dense: a choice is read against a busy street)
    chamfer(c, 8, 8, w, h, px(13)); c.lineWidth = sel ? 2.4 : 1; c.strokeStyle = sel ? COL.gold : 'rgba(214,224,250,0.25)'; c.stroke();
    let y = 8 + px(12);
    if (C.big && G.ic > 0) {
      const ic = G.ic; chamfer(c, cx - ic / 2, y, ic, ic, px(9)); c.fillStyle = sel ? 'rgba(60,44,14,0.55)' : 'rgba(16,20,46,0.6)'; c.fill(); c.lineWidth = 1; c.strokeStyle = sel ? 'rgba(241,212,138,0.7)' : 'rgba(214,224,250,0.4)'; c.stroke();
      if (m && hasIcon(m.icon)) { const b = bakeIcon(m.icon, ic * 0.84, L.s || 2); c.drawImage(b.c, cx - b.w / 2, y + ic / 2 - b.w / 2, b.w, b.w); }
      y += ic + px(8);
    } else if (!C.big) y = 8 + h / 2 - ts * 0.75 - (sel ? ls * 0.5 : 0);
    const f = fitText(C.labels[i], ts, w - px(20), 800, FONTS.title, 0.7); say(c, f.str, cx, y + ts * 0.7, f.size, sel ? '#fff3d4' : COL.silver, 800, FONTS.title); y += ts * 1.5;
    if (C.big && m && m.line) { const ln = wrapLines(m.line, w - px(22), ls, 500); for (let k = 0; k < ln.length && k < 2; k++) say(c, ln[k], cx, y + ls * (0.75 + k * 1.45), ls, 'rgba(214,222,246,0.9)', 500, FONTS.body); }
    if (sel) { const again = M.text()?.choice?.again ?? '한 번 더 누르면 정한다', fa = fitText(again, ls, w - px(16), 700, FONTS.body, 0.75); say(c, fa.str, cx, 8 + h - ls * 0.95, fa.size, COL.gold, 700, FONTS.body); }
  }
  function choose(i) { if (i === C.sel) return; C.sel = i; C.selT = 0; C.key = ''; if (i >= 0) M.sound('ui.move'); }
  function decide(i) { const f = C.onPick; C.open = false; C.onPick = null; M.sound('ui.ok'); try { f?.(i); } catch (e) { console.error('[v2ui] choice callback', e); } }
  return {
    get open() { return C.open; }, get sel() { return C.sel; }, get armed() { return C.open && C.t >= ARM; },
    /** labels: two strings; meta: [{ icon, line }] or null (plain cards); onPick(i) is called once */
    show(labels, meta, onPick) {
      C.open = true; C.labels = labels; C.n = Math.min(2, labels.length); C.meta = Array.isArray(meta) ? meta : null; C.onPick = onPick ?? null; C.sel = -1; C.t = 0; C.selT = 0; C.key = '';
      C.big = !!C.meta && C.meta.some((m) => m && (m.icon || m.line));
    },
    close() { C.open = false; C.onPick = null; },
    /** a press at a logical point: the first on a card chooses it, the second decides; a press elsewhere lets go */
    tap(x, y) {
      if (!C.open || C.t < ARM) return false;
      for (let i = 0; i < C.n; i++) { const p = P[i]; if (x >= p.x + 8 && x <= p.x + 8 + G.cw && y >= p.y + 8 && y <= p.y + 8 + G.ch) { if (C.sel !== i) choose(i); else if (C.selT >= AGAIN) decide(i); return true; } }
      choose(-1); return false;
    },
    /** keys and the pad: left / right (up / down) choose, confirm decides the chosen card - with none chosen it only chooses the first */
    keys(inp) {
      if (!C.open || !inp || !inp.pressed || C.t < ARM) return;
      if (inp.pressed('left') || inp.pressed('up')) choose(0); else if (inp.pressed('right') || inp.pressed('down')) choose(Math.min(1, C.n - 1));
      else if (inp.pressed('confirm') || inp.pressed('attack') || inp.pressed('jump')) { if (C.sel < 0) choose(0); else if (C.selT >= AGAIN) decide(C.sel); }
    },
    /** s = the HUD state, bot = the y the cards stand above: the cards are laid out here (not first in draw), so their rects are true from the tick they come up */
    update(dt, s, bot = 0) { if (!C.open) return; C.t += dt; C.selT += dt; if (s && (C.key !== L.epoch || C.vw !== s.viewW || C.vh !== s.viewH || C.bot !== bot)) layout(s, bot); },
    /** bot = the y the cards stand above (0: the middle of the screen); dy / a = the dialogue box's own rise and fade */
    draw(ctx, s, bot = 0, dy = 0, a = 1) {
      if (!C.open) return;
      if (C.key !== L.epoch || C.vw !== s.viewW || C.vh !== s.viewH || C.bot !== bot) layout(s, bot);
      const k = clamp(C.t / 0.18, 0, 1), ga = ctx.globalAlpha;
      for (let i = 0; i < C.n; i++) { const p = P[i], lift = i === C.sel ? Math.round(px(7) * clamp(C.selT / 0.1, 0, 1)) : 0; ctx.globalAlpha = a * k; ctx.drawImage(p.c, p.x, p.y + Math.round(dy + (1 - k) * px(12)) - lift, p.w, p.h); }
      ctx.globalAlpha = ga;
    },
    rects() { const o = []; if (C.open) for (let i = 0; i < C.n; i++) o.push({ x: P[i].x + 8, y: P[i].y + 8, w: G.cw, h: G.ch }); return o; },
    info() { return C.open ? { sel: C.sel, t: C.t, armed: C.t >= ARM, big: C.big, rects: this.rects() } : null; },
    release() { for (const p of P) if (p.c) { p.c.width = 1; p.c.height = 1; p.c = null; } C.open = false; },
  };
}

/**
 * The old pad's built-in HUD (src/v2/game/hud.js) shows the same cards: its dialogue box says the page, then the cards come up in the middle of the
 * screen and are pressed twice like everywhere else. The HUD object is extended in place, once: showDialog, update, draw and `modal`.
 * game = the shell (cssScale, input with pointer.tapped in logical px), texts = () => TEXT.screens.
 */
export function attachChoiceCards(hud, game, texts, sound) {
  if (!hud || hud.choiceCards) return hud ? hud.choiceCards : null;
  const L = { s: 2, css: 1, tmin: 9.5, epoch: 1 }, hs = () => clamp(0.8 / (L.css || 1), 1, 1.3);
  const cards = createChoiceCards({ px: (v) => v * hs(), tsz: (b, min = 9.5) => Math.max(b * hs(), min / (L.css || 1)), L, text: texts ?? (() => ({})), sound: sound ?? (() => {}) });
  const show0 = hud.showDialog.bind(hud), upd0 = hud.update.bind(hud), draw0 = hud.draw.bind(hud), close0 = hud.closeDialog ? hud.closeDialog.bind(hud) : null, md = Object.getOwnPropertyDescriptor(hud, 'modal');
  const modal0 = md && md.get ? md.get.bind(hud) : () => null;
  hud.showDialog = (d) => {
    if (d && d.choices && d.choices.length) { const pick = d.onChoice; show0({ ...d, choices: undefined, onDone: () => cards.show(d.choices, d.choiceMeta ?? null, (i) => pick?.(i)) }); }
    else show0(d);
  };
  if (close0) hud.closeDialog = () => { cards.close(); close0(); };
  Object.defineProperty(hud, 'modal', { configurable: true, get: () => modal0() ?? (cards.open ? 'dialog' : null) });
  hud.update = (dt, s) => {
    if (cards.open && modal0() !== 'pause') {
      const inp = game.input, sc = Math.min(3, Math.max(1, Math.round((s.scale ?? 2) * 4) / 4));
      if (sc !== L.s || (game.cssScale ?? 1) !== L.css) { L.s = sc; L.css = game.cssScale ?? 1; L.epoch++; }
      cards.update(dt, s, 0); cards.keys(inp);
      if (cards.open && inp && inp.pointer && inp.pointer.tapped) cards.tap(inp.pointer.x, inp.pointer.y);
    }
    upd0(dt, s);
  };
  hud.draw = (ctx, s) => { draw0(ctx, s); if (cards.open && !s.message) cards.draw(ctx, s, 0, 0, 1); };
  hud.choiceCards = cards;
  return cards;
}
const ZERO = { l: 0, t: 0, r: 0, b: 0 };
