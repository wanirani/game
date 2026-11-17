// v2 interface "cut glass" - entry point (docs/v2/UI_API.md).
//   import { createHud } from '../ui/index.js';
//   const hud = createHud(game, opts);   hud.update(dt, state);   hud.draw(ctx, state);   hud.resize();   hud.release();
// The scene hides the v1 pad when hud.hidePad is true; this module brings its own touch layer (pad.js).
import { createPad } from './pad.js';
import { createCanvasHud } from './hud.js';
import { createDialog, createPause } from './dialog.js';
import { loadAtlas, atlas } from './draw.js';

export { padLayout, BUTTONS } from './pad.js';
export const UI_ASSETS = ['assets/v2/ui/gem/atlas.webp'];

export function createHud(game, opts = {}) {
  const input = opts.input ?? game.input;
  loadAtlas(opts.assetBase ?? 'assets/v2/ui/gem/');
  // brush font for numbers and callouts: the game ships it and loads it on first use
  try { (opts.loadBrush ?? (() => import('../../core/ui.js').then((m) => m.loadBrush?.())))()?.then?.(() => canvas.resize(), () => {}); } catch { /* the title font stands in */ }
  const canvas = createCanvasHud(game, opts);
  const env = { game, input, hud: canvas, portraitBase: opts.portraitBase ?? 'assets/v2/portraits/' };
  const dialog = createDialog(env), pause = createPause(env);
  const perf = { draw: new Float32Array(240), n: 0, i: 0, upd: 0, updN: 0 };
  let last = null, released = false;

  const hud = {
    hidePad: opts.pad !== false,
    get ready() { return atlas.ready; },
    get modal() { return pause.open ? 'pause' : dialog.open ? 'dialog' : null; },
    get dialogOpen() { return dialog.open; },
    get pauseOpen() { return pause.open; },

    update(dt, s) {
      const t0 = performance.now();
      last = s;
      if (s.dialog !== undefined) dialog.sync(s.dialog);
      if (pause.open) pause.update(dt, s); else if (dialog.open) dialog.update(dt, s);
      canvas.update(dt, s);
      pad?.tick(pause.open || dialog.open || !!s.message || !!s.loading, s.pad);
      perf.upd += performance.now() - t0; perf.updN++;
    },
    draw(ctx, s) {
      const t0 = performance.now();
      last = s; pad?.alive();
      canvas.draw(ctx, s);
      if (!s.message) { dialog.draw(ctx, s); pause.draw(ctx, s); }
      perf.draw[perf.i] = performance.now() - t0; perf.i = (perf.i + 1) % perf.draw.length; if (perf.n < perf.draw.length) perf.n++;
    },
    resize() { canvas.resize(); pad?.layout(); },

    banner: canvas.banner, toast: canvas.toast, callout: canvas.callout, number: canvas.number,
    showDialog(d) { dialog.show(d); }, advanceDialog() { dialog.advance(); }, closeDialog() { dialog.close(); },
    openPause(o) { pause.show(o); }, closePause() { pause.close(); },
    setPad(p) { pad?.setState(p); },

    stats() {
      const n = perf.n, a = Array.from(perf.draw.subarray(0, n)).sort((x, y) => x - y);
      let sum = 0; for (const v of a) sum += v;
      return { drawMs: { avg: n ? sum / n : 0, p50: n ? a[n >> 1] : 0, p95: n ? a[Math.min(n - 1, Math.floor(n * 0.95))] : 0, max: n ? a[n - 1] : 0, n }, updMs: perf.updN ? perf.upd / perf.updN : 0, padRepaints: pad?.metrics().repaints ?? 0, atlas: atlas.ready, ...canvas.info() };
    },
    /** QA: geometry of everything that can be measured (CSS px for the pad, logical px for the canvas pieces). */
    metrics() { return { pad: pad?.metrics() ?? null, dialog: dialog.info(), pause: pause.info(), hud: canvas.info(), modal: hud.modal }; },
    release() {
      if (released) return; released = true;
      window.removeEventListener('pointerdown', onDown, true);
      pad?.release(); dialog.release(); pause.release(); canvas.release();
    },
  };
  hud.dispose = hud.release;

  const pad = opts.pad === false ? null : createPad(game, { ...opts, input, onPause: () => { if (opts.onPause) opts.onPause(); else hud.openPause(); } });

  // taps while a dialogue or the pause menu is open: taken here (the canvas under it gets nothing)
  function onDown(e) {
    const m = hud.modal; if (!m || !last) return;
    const r = game.canvasRect ?? (game.canvas?.getBoundingClientRect ? (() => { const b = game.canvas.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })() : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
    const x = ((e.clientX - r.x) / (r.w || 1)) * last.viewW, y = ((e.clientY - r.y) / (r.h || 1)) * last.viewH;
    e.stopPropagation();
    if (m === 'pause') pause.tap(x, y); else dialog.tap(x, y);
  }
  window.addEventListener('pointerdown', onDown, true);
  return hud;
}
