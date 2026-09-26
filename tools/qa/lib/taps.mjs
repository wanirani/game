// Tap-target audit (platform.md §6.3, P-04): records every tap region the top scene registers and measures it in CSS px.
//
//   await installTapRecorder(s.page);               // once per page, after window.__game exists
//   const r = await auditScene(s.page, "__game.push('options',{})", { wait: 1000 });
//   r → { scene, cssScale, uiK, uiScale, n, red: [...], yellow: [...], ok, regions,
//         text: {n, min, p10, median, smallest} }   ← font size (CSS px) of every fillText the top scene drew (P-03)
//
// Sources, merged (one region per geometry; an explicit registry kind wins):
//  - ui.taps (platform §6.3 registry; FONTS-FU/PLAT-CORE): taps.note(rect, kind, src) and taps.add(id, rect, {kind, slop})
//    are wrapped (taps.record is switched on); kinds 'list'→row, 'primary', 'icon'/'arrow', 'dense';
//  - the legacy helpers, patched on their prototypes (the audit prototype): ListMenu.hit (row), Gesture.tap (row),
//    TapZones.add (primary), Hits.add (primary);
//  - when nothing at all was recorded (town scenes hit-test privately today): the top scene's rect fields
//    (closeRect, tabRects, rects, …, ScrollList rows) as src 'fields'.
// Only regions registered while the TOP scene runs update()/render() count (scenes underneath are not tappable).
// Rect coordinates are the scene's own: UI px for scenes with uiScale (× game.uiK) and logical px otherwise.
//
// Minimums in CSS px (§6.3): primary 44 (both sides), icon/arrow 44×44, list row 36 tall, dense row 28 tall.
// ok = at least its kind's minimum; otherwise red when the shorter side is below 32, else yellow.
// The effective size includes the region's slop.
// Slop is measured as a phone user gets it (touch mode; the audit runs at phone sizes):
//  - taps.add regions use the registry's own rule (core/ui.js tapSlop): max(opts.slop ?? taps.slop, half of what the
//    kind's CSS minimum is short of), capped at SLOP_MAX_LOGICAL region px;
//  - legacy helpers (ListMenu/Gesture/TapZones/Hits/fields) hit-test without slop;
//  - §6.3 "gap ≥ 4 px, or no overlap of slop": on each side the slop stops at the midpoint of the gap to the nearest
//    neighbouring target (0 when they touch), so a stack of thin rows cannot pass on overlapping slop.

export const MIN_CSS = { primary: 44, icon: 44, row: 36, dense: 28 };
export const RED_CSS = 32;
/** core/ui.js TAP_SLOP_MAX (logical px); ui.taps.slopMax wins when the registry exposes it. */
export const SLOP_MAX_LOGICAL = 28;

export async function installTapRecorder(page) {
  await page.evaluate(async () => {
    if (window.__qaTaps) return;
    const R = window.__qaTaps = { list: [], text: [], cur: null, on: true, frame: 0 };
    const g = window.__game;
    const KIND = { list: 'row', row: 'row', primary: 'primary', icon: 'icon', dense: 'dense', arrow: 'icon', button: 'primary' };
    const rec = (src, kind) => (r, extra = {}) => {
      if (!R.on || !r || !(r.w > 0) || !(r.h > 0)) return;
      if (R.cur !== g.top) return;
      R.list.push({ src, kind: KIND[extra.kind] || kind, id: extra.id ?? null, slop: extra.slop || 0, auto: !!extra.auto, hit: extra.hit !== false, x: r.x, y: r.y, w: r.w, h: r.h, scene: g.top?.name, ui: !!g.top?.uiScale, f: R.frame });
    };
    const wrapScene = (sc) => {
      if (!sc || sc.__qaTapWrap) return;
      sc.__qaTapWrap = true;
      for (const m of ['update', 'render']) {
        const o = sc[m];
        if (typeof o !== 'function') continue;
        sc[m] = function (...a) { const prev = R.cur; R.cur = this; try { return o.apply(this, a); } finally { R.cur = prev; } };
      }
    };
    const T = g.tick.bind(g);
    g.tick = function (...a) { for (const sc of g.scenes) wrapScene(sc); return T(...a); };
    const Rn = g.render.bind(g);
    g.render = function (...a) { R.frame++; for (const sc of g.scenes) wrapScene(sc); return Rn(...a); };
    const P = (obj, name, src, kind, argi, optsi = -1) => {
      if (!obj || typeof obj[name] !== 'function') return;
      const o = obj[name]; const f = rec(src, kind);
      obj[name] = function (...a) {
        try {
          const opts = optsi >= 0 && a[optsi] && typeof a[optsi] === 'object' ? a[optsi] : typeof a[optsi] === 'string' ? { kind: a[optsi] } : {};
          f(a[argi], opts);
        } catch { /* ignore */ }
        return o.apply(this, a);
      };
    };
    const tryImport = async (u) => { try { return await import(u); } catch { return {}; } };
    const ui = await tryImport('/src/core/ui.js');
    const mc = await tryImport('/src/scenes/menu/common.js');
    const fc = await tryImport('/src/scenes/front/common.js');
    const gc = await tryImport('/src/scenes/games/common.js');
    // the shared registry (platform §6.3): taps.note(rect, kind, src) from the legacy helpers, taps.add(id, rect, opts) from new code
    const t = ui.taps;
    R.slopMax = t && typeof t.slopMax === 'number' ? t.slopMax : null;
    if (t && typeof t === 'object') {
      try { if ('record' in t) t.record = true; } catch { /* read-only */ }
      P(t, 'note', 'ui.taps', 'primary', 0, 1);
      // taps.add(id, rect, {slop, kind, disabled}): hit regions with the registry's touch slop (auto-grown to the kind's
      // minimum, see the header); the audit applies it as a phone user gets it, whatever the current input mode is
      if (typeof t.add === 'function') {
        const o = t.add; const f = rec('ui.taps', 'primary');
        t.add = function (id, r, opts = {}) {
          try { f(r, { id, kind: opts?.kind, slop: opts?.slop ?? t.slop ?? 0, auto: true, hit: !opts?.disabled }); } catch { /* ignore */ }
          return o.apply(this, arguments);
        };
      }
    }
    P(ui.ListMenu?.prototype, 'hit', 'ListMenu', 'row', 1);
    P(mc.Gesture?.prototype, 'tap', 'Gesture', 'row', 0);
    P(fc.TapZones?.prototype, 'add', 'TapZones', 'primary', 1);
    P(gc.Hits?.prototype, 'add', 'Hits', 'primary', 1);
    // legibility: font size of every fillText the top scene draws on the game canvas, in CSS px
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (str, x, y, mw) {
      if (R.on && R.cur && R.cur === g.top && this.canvas === g.canvas && R.text.length < 5000) {
        const m = this.getTransform();
        const px = parseFloat((/([\d.]+)px/.exec(this.font) || [])[1] || '0');
        if (px > 0) R.text.push({ s: String(str).slice(0, 40), bpx: px * Math.hypot(m.a, m.b), ly: (m.b * x + m.d * y + m.f) / (g.scale || 1) });
      }
      return ft.call(this, str, x, y, mw);
    };
  });
}

/**
 * Run `ev` (a JS expression string or function) in the page, wait, clear, wait again (one fresh frame set), and audit.
 * cssScale is measured from the canvas box; uiK from game.uiK (1 when missing).
 */
export async function auditScene(page, ev, { wait = 900, settle = 150 } = {}) {
  await page.evaluate(() => { window.__qaTaps.list.length = 0; window.__qaTaps.text.length = 0; });
  if (ev) {
    try { await page.evaluate(ev); } catch (e) { return { error: 'EVAL ' + String(e.message).slice(0, 160) }; }
  }
  await page.waitForTimeout(wait);
  // clear, then let the game render a few fresh frames (frame-based so a loaded machine does not truncate the sample)
  await page.evaluate(() => { window.__qaTaps.list.length = 0; window.__qaTaps.text.length = 0; });
  await page.evaluate((ms) => new Promise((res) => { const t0 = performance.now(); let n = 0; const f = () => { if (++n >= 4 && performance.now() - t0 >= ms) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), settle);
  return page.evaluate(({ MIN, RED, SMAX }) => {
    const g = window.__game, R = window.__qaTaps;
    const cv = g.canvas.getBoundingClientRect();
    const cssScale = cv.height / g.viewH;
    const backingPerCss = g.canvas.width / cv.width;
    const uiK = typeof g.uiK === 'number' && g.uiK > 0 ? g.uiK : 1;
    const top = g.top;
    // one region per geometry; an explicit registry kind wins over a guessed one. taps.add regions are re-registered
    // every drawn frame and the registry hit-tests only the last batch, so only the newest frame of them counts (a
    // button that bobs or slides by a pixel is one target, not two overlapping ones); legacy helpers are unioned
    // over the sampled frames (some only report a rect on the frames they hit-test)
    const lastAdd = R.list.reduce((m, r) => (r.auto && r.f > m ? r.f : m), -1);
    const seen = new Map();
    for (const r of R.list) {
      if (r.auto && r.f !== lastAdd) continue;
      const k = [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)].join(',');
      const prev = seen.get(k);
      if (!prev || (r.src === 'ui.taps' && prev.src !== 'ui.taps')) seen.set(k, r);
    }
    // fallback for scenes whose hit tests go through no helper at all (town hitRect, ScrollList rows): read the
    // well-known rect fields of the top scene (only when nothing was recorded, so a registered scene is never guessed)
    if (!seen.size && top) {
      const isR = (r) => r && typeof r === 'object' && ['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number') && r.w > 0 && r.h > 0;
      const add = (r, kind, id) => { if (isR(r)) seen.set(`f${seen.size}`, { src: 'fields', kind, id, slop: 0, x: r.x, y: r.y, w: r.w, h: r.h, ui: !!top.uiScale }); };
      const scan = (o, depth) => {
        if (!o || typeof o !== 'object' || depth > 1) return;
        for (const [k, v] of Object.entries(o)) {
          if (/^(closeRect|backRect|okRect|readRect|sortRect)$/.test(k)) add(v, 'icon', k);
          else if (/^(tabRects|btnRects|buttonRects|rects|qRects|filterRects|modeRects|sectRects)$/.test(k) && Array.isArray(v)) v.forEach((r, i) => add(Array.isArray(r) ? r[0] : r, 'primary', `${k}[${i}]`));
          else if (v && typeof v === 'object' && isR(v.rect) && typeof v.rowH === 'number' && typeof v.count === 'number') {
            for (let i = 0; i < Math.min(v.count, 12); i++) add({ x: v.rect.x, y: v.rect.y + i * v.rowH - (v.scroll || 0), w: v.rect.w, h: v.rowH }, 'row', `${k}.row${i}`);
          } else if (/^(list|modal|popup|cur|panel)$/.test(k)) scan(v, depth + 1);
        }
      };
      scan(top, 0);
    }
    const vw = top?.uiScale ? (g.uiW ?? g.viewW / uiK) : g.viewW, vh = top?.uiScale ? (g.uiH ?? g.viewH / uiK) : g.viewH;
    // touch slop per side (region px): the registry rule for taps.add regions, none for legacy helpers
    const smax = typeof R.slopMax === 'number' ? R.slopMax : SMAX;
    const list = [];
    for (const r of seen.values()) {
      if (r.x + r.w <= 0 || r.y + r.h <= 0 || r.x >= vw || r.y >= vh) continue; // off screen (scrolled away)
      const k = cssScale * (r.ui ? uiK : 1);
      const kind = MIN[r.kind] ? r.kind : 'primary';
      let s = Math.max(0, r.slop || 0);
      if (r.auto) s = Math.min(smax, Math.max(s, (MIN[kind] / k - Math.min(r.w, r.h)) / 2));
      s = Math.max(0, s);
      list.push({ r, k, kind, s: { l: s, r: s, t: s, b: s } });
    }
    // §6.3 "no overlap of slop": each side's slop stops at the midpoint of the gap to the neighbour on that side
    const contains = (p, q) => p.x <= q.x + 0.5 && p.y <= q.y + 0.5 && p.x + p.w >= q.x + q.w - 0.5 && p.y + p.h >= q.y + q.h - 0.5;
    for (const A of list) {
      const a = A.r;
      if (!(A.s.l > 0)) continue;
      for (const B of list) {
        const b = B.r;
        if (B === A || contains(a, b) || contains(b, a)) continue; // a panel around its buttons is not a neighbour
        const ovY = b.y < a.y + a.h && b.y + b.h > a.y, ovX = b.x < a.x + a.w && b.x + b.w > a.x;
        if (ovY && !ovX) {
          if (b.x >= a.x + a.w) A.s.r = Math.min(A.s.r, (b.x - a.x - a.w) / 2);
          else A.s.l = Math.min(A.s.l, (a.x - b.x - b.w) / 2);
        } else if (ovX && !ovY) {
          if (b.y >= a.y + a.h) A.s.b = Math.min(A.s.b, (b.y - a.y - a.h) / 2);
          else A.s.t = Math.min(A.s.t, (a.y - b.y - b.h) / 2);
        } else if (ovX && ovY) { // partial overlap: no slop towards the other target
          if (b.x < a.x) A.s.l = 0;
          if (b.x + b.w > a.x + a.w) A.s.r = 0;
          if (b.y < a.y) A.s.t = 0;
          if (b.y + b.h > a.y + a.h) A.s.b = 0;
        }
      }
    }
    const regions = [];
    for (const { r, k, kind, s } of list) {
      const w = (r.w + s.l + s.r) * k, h = (r.h + s.t + s.b) * k;
      const need = MIN[kind];
      const size = kind === 'row' || kind === 'dense' ? h : Math.min(w, h);
      // ok at the kind's minimum (a dense row needs 28, below the 32 px red line); otherwise red when a side is < 32
      const level = size >= need ? 'ok' : Math.min(w, h) < RED ? 'red' : 'yellow';
      regions.push({ src: r.src, kind, id: r.id, w: +w.toFixed(1), h: +h.toFixed(1), level, slop: +((s.l + s.r + s.t + s.b) / 4).toFixed(1), lx: Math.round(r.x), ly: Math.round(r.y), lw: Math.round(r.w), lh: Math.round(r.h) });
    }
    const red = regions.filter((r) => r.level === 'red'), yellow = regions.filter((r) => r.level === 'yellow');
    const sizes = R.text.map((t) => t.bpx / backingPerCss).sort((a, b) => a - b);
    const q = (p) => (sizes.length ? +sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))].toFixed(2) : null);
    const text = { n: sizes.length, min: q(0), p10: q(0.1), median: q(0.5), smallest: R.text.slice().sort((a, b) => a.bpx - b.bpx).slice(0, 4).map((t) => `${t.s}@${(t.bpx / backingPerCss).toFixed(1)}`) };
    return { scene: g.scenes.map((s) => s.name).join('>'), top: top?.name, cssScale: +cssScale.toFixed(3), uiK: +uiK.toFixed(3), uiScale: !!top?.uiScale, n: regions.length, red, yellow, ok: red.length === 0 && yellow.length === 0, regions, text };
  }, { MIN: MIN_CSS, RED: RED_CSS, SMAX: SLOP_MAX_LOGICAL });
}

/**
 * Strings the top scene draws on the game canvas over a few fresh frames, optionally only those whose baseline
 * lies in [minY, maxY] (logical view px, e.g. the bottom hint bar: minY = viewH - 48). Needs installTapRecorder().
 */
export async function drawnText(page, { minY = -Infinity, maxY = Infinity, frames = 4 } = {}) {
  await page.evaluate(() => { window.__qaTaps.text.length = 0; });
  await page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), frames);
  return page.evaluate(({ minY, maxY }) => [...new Set(window.__qaTaps.text.filter((t) => t.ly >= minY && t.ly <= maxY).map((t) => t.s))], { minY: Number.isFinite(minY) ? minY : -1e9, maxY: Number.isFinite(maxY) ? maxY : 1e9 });
}

/** Keyboard-only labels (keycaps and legacy hint text) that must not show while a controller is the active device. */
export const KEYBOARD_LABEL = /^(Z|X|Q|E|S|D|A|C|F|V|R|G|W|J|K|M|I|Esc|ESC|Enter|Tab|Space|Shift|Backspace)$|Z\/Enter|Enter\/Z|\bEsc\b|\bESC\b/;

/** Short text for a failing audit: counts and a few examples. */
export function describeAudit(a, max = 5) {
  if (a.error) return a.error;
  const ex = [...a.red, ...a.yellow].slice(0, max).map((r) => `${r.src}${r.id != null ? ':' + r.id : ''} ${r.kind} ${Math.round(r.w)}x${Math.round(r.h)}css`);
  return `${a.top}: ${a.n} regions, red ${a.red.length}, yellow ${a.yellow.length}${ex.length ? ' — ' + ex.join(' | ') : ''} (cssScale ${a.cssScale}, uiK ${a.uiK}${a.uiScale ? ', uiScale' : ''})`;
}

/**
 * Scene visits per platform_view group: [name, expression run in the page, wait ms, opts].
 * opts.regions false = the scene may have no tap regions (title attract); opts.scale false = not in the §6.2 uiScale opt-in list.
 * BACK pops back to the base scene of the group (VISIT_BASE).
 */
export const BACK = '(()=>{const g=__game;while(g.scenes.length>1)g.pop()})()';
export const VISITS = {
  front: [
    ['title', "__game.go('title',{},{fade:false})", 1500, { regions: false, scale: false }],
    ['title-menu', "(__game.top.mode='menu',0)", 500, { scale: false }],
    ['slots', "__game.push('slots',{mode:'new'})", 800],
    ['difficulty', `(${BACK},__game.push('difficulty',{slot:1}))`, 800],
    ['charselect', `(${BACK},__game.push('charselect',{slot:1,difficulty:'normal'}))`, 1000],
    ['highscore', `(${BACK},__game.push('highscore',{}))`, 800],
    ['confirm', `(${BACK},__game.push('frontConfirm',{title:'확인',message:'테스트',onYes(){}}))`, 600],
    ['saveCode', `(${BACK},__game.push('saveCode',{mode:'export',slot:1}))`, 700],
  ],
  options: [['options', "__game.push('options',{})", 800]],
  account: [
    ['account', "__game.push('account',{})", 900],
    ['cloudConflict', `(${BACK},__game.push('cloudConflict',{slot:1,mode:'conflict'}))`, 800],
  ],
  arcade: [['arcade', "__game.go('arcade',{},{fade:false})", 1000]],
  town: [
    ['shop', "__game.push('shop',{world:__game.world,from:'hub'})", 800],
    ['smith', `(${BACK},__game.push('smith',{world:__game.world,from:'hub'}))`, 800],
    ['church', `(${BACK},__game.push('church',{world:__game.world,from:'hub'}))`, 800],
    ['questboard', `(${BACK},__game.push('questboard',{world:__game.world,from:'hub'}))`, 800],
    ['party', `(${BACK},__game.push('party',{world:__game.world,from:'hub'}))`, 800],
    ['worldmap', `(${BACK},__game.push('worldmap',{world:__game.world,from:'hub'}))`, 900, { pkg: 'WORLDMAP-P2' }],
  ],
  games: [
    ['inn', "__game.go('inn',{},{fade:false})", 1000],
    ['minigame_dice', "__game.push('minigame_dice',{})", 1000],
    ['minigame_blackjack', `(${BACK},__game.push('minigame_blackjack',{}))`, 1000],
    ['minigame_slot', `(${BACK},__game.push('minigame_slot',{}))`, 1000],
    ['minigame_duel', `(${BACK},__game.push('minigame_duel',{}))`, 1000],
    ['minigame_memory', `(${BACK},__game.push('minigame_memory',{}))`, 1000],
  ],
  pause: [['pause', "__game.push('pause',{world:__game.world})", 700]],
  dialogue: [['dialogue', "__game.push('dialogue',{npc:'npc_marta',world:__game.world})", 1700]],
  results: [['results', "__game.push('results',{world:__game.world})", 1800, { regions: false }]], // tap anywhere = continue
};
/** Base URL per group (the scene the visits start from). */
export const VISIT_BASE = {
  front: 'index.html', options: 'index.html', account: 'index.html', arcade: 'index.html',
  town: 'index.html?scene=hub', games: 'index.html?scene=hub',
  pause: 'index.html?scene=stage&stage=s01', dialogue: 'index.html?scene=hub', results: 'index.html?scene=stage&stage=s01',
};
