// v2 interface "cut glass" - entry point (docs/v2/UI_API.md).
//   import { createHud } from '../ui/index.js';
//   const hud = createHud(game, opts);   hud.update(dt, state);   hud.draw(ctx, state);   hud.resize();   hud.release();
// The scene hides the v1 pad when hud.hidePad is true; this module brings its own touch layer (pad.js).
import { createPad } from './pad.js';
import { createCanvasHud } from './hud.js';
import { createDialog, createPause } from './dialog.js';
import { createEndCard } from './endcard.js';   // CHAPTER: the ending card of the first release
import { createScreens } from './screens.js';   // SCREENS: the chronicle book, the bag, the shop (UI_API 10)
import { createCards } from './cards.js';       // SCREENS: the rising cards and the book chip
import { loadAtlas, atlas } from './draw.js';

export { padLayout, BUTTONS } from './pad.js';
export const UI_ASSETS = ['assets/v2/ui/gem/atlas.webp'];

export function createHud(game, opts = {}) {
  const input = opts.input ?? game.input;
  loadAtlas(opts.assetBase ?? 'assets/v2/ui/gem/');
  // brush font for numbers and callouts: the game registers it lazily (core/ui.js FontFace "BN Brush"); ask for it once
  // and bake the brush pieces again when it arrives. Until then the title font stands in.
  try { (opts.loadBrush ? opts.loadBrush() : document.fonts?.load?.('700 32px "BN Brush"', '0가'))?.then?.(() => canvas.resize(), () => {}); } catch { /* no font API */ }
  const canvas = createCanvasHud(game, opts);
  // SCREENS: opts.model() -> the screens' model (src/v2/ui/model.js; the story host owns it) or null (no story: no screens, no cards, no chip)
  const env = { game, input, hud: canvas, portraitBase: opts.portraitBase ?? 'assets/v2/portraits/', model: () => (opts.model ? opts.model() ?? null : null), last: () => last, screens: null };
  const dialog = createDialog(env), pause = createPause(env), end = createEndCard(env), screens = (env.screens = createScreens(env)), cards = createCards(env);
  const perf = { draw: new Float32Array(240), n: 0, i: 0, upd: 0, updN: 0 };
  let last = null, released = false;

  const hud = {
    hidePad: opts.pad !== false,
    get ready() { return atlas.ready; },
    get modal() { return pause.open || screens.open ? 'pause' : dialog.open ? 'dialog' : end.open ? 'end' : null; },   // 'end' = the ending card is up (CHAPTER). SCREENS: a screen rides on 'pause' - the scene stops the rules exactly as for the panel
    get screen() { return screens.open; },   // 'chronicle' | 'bag' | 'shop' | null
    get dialogOpen() { return dialog.open; },
    get pauseOpen() { return pause.open; },

    update(dt, s) {
      const t0 = performance.now();
      last = s;
      if (s.dialog !== undefined) dialog.sync(s.dialog);
      const scr = !!screens.open; screens.update(dt, s);   // (a screen that closes in this tick hands nothing on: the key that closed it is not read by the panel under it)
      if (!scr) { if (pause.open) pause.update(dt, s); else if (dialog.open) dialog.update(dt, s); else if (end.open) end.update(dt); }
      canvas.update(dt, s); cards.update(dt, s, hud.modal, pad);
      const cross = s.cross ?? null;   // CROSSING: while the bell crossing runs the pad stays in place, faded out and deaf (it does not pop off for the load)
      pad?.setBack(!!(cross && cross.back));
      pad?.setCut(!!s.cut);   // STORY2 (11-19): state.cut = a camera cut or a lockInput step of the story holds the hero - the stick and the action buttons step aside, the pause button stays and works (pad.js setCut); everything is back the tick the story lets go
      pad?.tick(pause.open || !!screens.open || dialog.open || end.open || !!s.message || (!!s.loading && !cross), s.pad);   // a dialogue, the pause panel, the ending card, a message: the whole pad is off
      perf.upd += performance.now() - t0; perf.updN++;
    },
    draw(ctx, s) {
      const t0 = performance.now();
      last = s; pad?.alive();
      canvas.draw(ctx, s); cards.draw(ctx, s, hud.modal);
      if (!s.message) { end.draw(ctx, s); dialog.draw(ctx, s); pause.draw(ctx, s); screens.draw(ctx, s); }
      perf.draw[perf.i] = performance.now() - t0; perf.i = (perf.i + 1) % perf.draw.length; if (perf.n < perf.draw.length) perf.n++;
    },
    resize() { canvas.resize(); pad?.layout(); },

    banner: canvas.banner, toast: canvas.toast, callout: canvas.callout, number: canvas.number,
    showDialog(d) { dialog.show(d); }, advanceDialog() { dialog.advance(); }, closeDialog() { dialog.close(); },
    preloadPortraits(ids) { return dialog.preload(ids); }, get portraitsReady() { return dialog.preloaded; },   // STORY2: the speakers' busts ahead of the first line (UI_API 2) -> a promise { n, ms }
    openPause(o) { pause.show(o); }, closePause() { pause.close(); },
    showEnd(o) { end.show(o); }, tapEnd() { return end.tap(); }, closeEnd() { end.close(); },   // CHAPTER: the ending card (endcard.js)
    // SCREENS (UI_API 10): a full screen that stops the game (kind 'chronicle' | 'bag' | 'shop'; o = { at: entry id, shop: shop id, onClose }) -> false when it cannot open
    // (no story model, a crossing or a load under way); a card that rises without stopping anything
    openScreen(kind, o) { return screens.show(kind, o, last); }, closeScreen() { screens.close(); },
    card(kind, o) { cards.push(kind, o); },
    setPad(p) { pad?.setState(p); },

    stats() {
      const n = perf.n, a = Array.from(perf.draw.subarray(0, n)).sort((x, y) => x - y);
      let sum = 0; for (const v of a) sum += v;
      return { drawMs: { avg: n ? sum / n : 0, p50: n ? a[n >> 1] : 0, p95: n ? a[Math.min(n - 1, Math.floor(n * 0.95))] : 0, max: n ? a[n - 1] : 0, n }, updMs: perf.updN ? perf.upd / perf.updN : 0, padRepaints: pad?.metrics().repaints ?? 0, atlas: atlas.ready, ...canvas.info() };
    },
    /** QA: geometry of everything that can be measured (CSS px for the pad, logical px for the canvas pieces). */
    metrics() { return { pad: pad?.metrics() ?? null, dialog: dialog.info(), pause: pause.info(), hud: canvas.info(), prompts: canvas.promptRects(), end: end.info(), screen: screens.info(), cards: cards.info(), modal: hud.modal }; },
    release() {
      if (released) return; released = true;
      window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onUp, true);
      for (const part of [pad, dialog, pause, end, screens, cards, canvas]) { try { part?.release(); } catch (e) { console.warn('[v2ui] release', e); } }   // one part failing must not keep the others (INTEGRATE-VERIFY)
    },
  };
  hud.dispose = hud.release;

  const pad = opts.pad === false ? null : createPad(game, { ...opts, input, isModal: () => pause.open || !!screens.open || dialog.open || end.open, claims: (e) => !!promptHit(e) || !!cardHit(e), onPause: () => { if (opts.onPause) opts.onPause(); else hud.openPause(); } });

  // taps while a dialogue or the pause menu is open are taken here (the canvas under it gets nothing);
  // in play, a tap on a prompt chip (touch mode) presses that prompt's action for one step
  const LP = { x: 0, y: 0 };
  function toLogical(e) {
    const r = game.canvasRect ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    LP.x = ((e.clientX - r.x) / (r.w || 1)) * last.viewW; LP.y = ((e.clientY - r.y) / (r.h || 1)) * last.viewH;
    return LP;
  }
  function promptHit(e) {
    if (!last || hud.modal || e.pointerType === 'mouse' || (opts.forceMode ?? input?.mode ?? 'touch') !== 'touch') return null;
    const q = toLogical(e); return canvas.promptAt(q.x, q.y);
  }
  /** SCREENS: the book chip or a card that can be pressed, under this touch (play only: never while anything modal is up or a crossing runs) */
  function cardHit(e) { if (!last || hud.modal) return null; const q = toLogical(e); return cards.hit(q.x, q.y, last, null); }
  function onDown(e) {
    if (!last) return;
    const m = hud.modal;
    if (!m) {
      const c = cardHit(e);
      if (c) {   // the chip, or the card 「연대기에 적혔다」: the book opens (at that entry). The touch goes nowhere else - no roll, no swing.
        e.stopPropagation(); if (e.cancelable) e.preventDefault();
        const at = c === 'chip' ? null : c.id; cards.take(c); screens.show('chronicle', { at }, last);
        return;
      }
      const p = promptHit(e); if (!p) return;
      e.stopPropagation();
      try { if (p.onTap) p.onTap(p); else input.touch.tap(p.action); } catch (err) { console.error('[v2ui] prompt tap', err); }
      return;
    }
    const q = toLogical(e);
    e.stopPropagation();
    if (screens.open) { if (e.cancelable) e.preventDefault(); screens.down(q.x, q.y, e.pointerId); }   // a screen: the press begins a drag of its list, or a tap when the finger lifts where it came down
    else if (m === 'pause') pause.tap(q.x, q.y); else if (m === 'end') end.tap(); else dialog.tap(q.x, q.y);
  }
  function onMove(e) { if (!last || !screens.open) return; const q = toLogical(e); e.stopPropagation(); screens.move(q.x, q.y, e.pointerId); }
  function onUp(e) { if (!last || !screens.open) return; const q = toLogical(e); e.stopPropagation(); screens.up(q.x, q.y, e.pointerId, e.type === 'pointercancel'); }
  window.addEventListener('pointerdown', onDown, true); window.addEventListener('pointermove', onMove, true); window.addEventListener('pointerup', onUp, true); window.addEventListener('pointercancel', onUp, true);
  return hud;
}
