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
//    TapZones.add (primary), Hits.add (primary).
// Only regions registered while the TOP scene runs update()/render() count (scenes underneath are not tappable).
// Rect coordinates are the scene's own: UI px for scenes with uiScale (× game.uiK) and logical px otherwise.
//
// Minimums in CSS px (§6.3): primary 44 (both sides), icon/arrow 44×44, list row 36 tall, dense row 28 tall.
// yellow = below its kind's minimum; red = shorter side below 32. The effective size includes the region's slop.

export const MIN_CSS = { primary: 44, icon: 44, row: 36, dense: 28 };
export const RED_CSS = 32;

export async function installTapRecorder(page) {
  await page.evaluate(async () => {
    if (window.__qaTaps) return;
    const R = window.__qaTaps = { list: [], text: [], cur: null, on: true };
    const g = window.__game;
    const KIND = { list: 'row', row: 'row', primary: 'primary', icon: 'icon', dense: 'dense', arrow: 'icon', button: 'primary' };
    const rec = (src, kind) => (r, extra = {}) => {
      if (!R.on || !r || !(r.w > 0) || !(r.h > 0)) return;
      if (R.cur !== g.top) return;
      R.list.push({ src, kind: KIND[extra.kind] || kind, id: extra.id ?? null, slop: extra.slop || 0, x: r.x, y: r.y, w: r.w, h: r.h, scene: g.top?.name, ui: !!g.top?.uiScale });
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
    g.tick = function (dt) { for (const sc of g.scenes) wrapScene(sc); return T(dt); };
    const Rn = g.render.bind(g);
    g.render = function () { for (const sc of g.scenes) wrapScene(sc); return Rn(); };
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
    if (t && typeof t === 'object') {
      try { if ('record' in t) t.record = true; } catch { /* read-only */ }
      P(t, 'note', 'ui.taps', 'primary', 0, 1);
      P(t, 'add', 'ui.taps', 'primary', 1, 2);
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
        if (px > 0) R.text.push({ s: String(str).slice(0, 24), bpx: px * Math.hypot(m.a, m.b) });
      }
      return ft.call(this, str, x, y, mw);
    };
  });
}

/**
 * Run `ev` (a JS expression string or function) in the page, wait, clear, wait again (one fresh frame set), and audit.
 * cssScale is measured from the canvas box; uiK from game.uiK (1 when missing).
 */
export async function auditScene(page, ev, { wait = 900, settle = 350 } = {}) {
  await page.evaluate(() => { window.__qaTaps.list.length = 0; window.__qaTaps.text.length = 0; });
  if (ev) {
    try { await page.evaluate(ev); } catch (e) { return { error: 'EVAL ' + String(e.message).slice(0, 160) }; }
  }
  await page.waitForTimeout(wait);
  await page.evaluate(() => { window.__qaTaps.list.length = 0; window.__qaTaps.text.length = 0; });
  await page.waitForTimeout(settle);
  return page.evaluate(({ MIN, RED }) => {
    const g = window.__game, R = window.__qaTaps;
    const cv = g.canvas.getBoundingClientRect();
    const cssScale = cv.height / g.viewH;
    const backingPerCss = g.canvas.width / cv.width;
    const uiK = typeof g.uiK === 'number' && g.uiK > 0 ? g.uiK : 1;
    const top = g.top;
    // one region per geometry; an explicit registry kind wins over a guessed one
    const seen = new Map();
    for (const r of R.list) {
      const k = [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)].join(',');
      const prev = seen.get(k);
      if (!prev || (r.src === 'ui.taps' && prev.src !== 'ui.taps')) seen.set(k, r);
    }
    const vw = top?.uiScale ? (g.uiW ?? g.viewW / uiK) : g.viewW, vh = top?.uiScale ? (g.uiH ?? g.viewH / uiK) : g.viewH;
    const regions = [];
    for (const r of seen.values()) {
      if (r.x + r.w <= 0 || r.y + r.h <= 0 || r.x >= vw || r.y >= vh) continue; // off screen (scrolled away)
      const k = cssScale * (r.ui ? uiK : 1);
      const w = (r.w + 2 * r.slop) * k, h = (r.h + 2 * r.slop) * k;
      const kind = MIN[r.kind] ? r.kind : 'primary';
      const need = MIN[kind];
      const size = kind === 'row' || kind === 'dense' ? h : Math.min(w, h);
      const level = Math.min(w, h) < RED ? 'red' : size < need ? 'yellow' : 'ok';
      regions.push({ src: r.src, kind, id: r.id, w: +w.toFixed(1), h: +h.toFixed(1), level, lx: Math.round(r.x), ly: Math.round(r.y), lw: Math.round(r.w), lh: Math.round(r.h) });
    }
    const red = regions.filter((r) => r.level === 'red'), yellow = regions.filter((r) => r.level === 'yellow');
    const sizes = R.text.map((t) => t.bpx / backingPerCss).sort((a, b) => a - b);
    const q = (p) => (sizes.length ? +sizes[Math.min(sizes.length - 1, Math.floor(p * sizes.length))].toFixed(2) : null);
    const text = { n: sizes.length, min: q(0), p10: q(0.1), median: q(0.5), smallest: R.text.slice().sort((a, b) => a.bpx - b.bpx).slice(0, 4).map((t) => `${t.s}@${(t.bpx / backingPerCss).toFixed(1)}`) };
    return { scene: g.scenes.map((s) => s.name).join('>'), top: top?.name, cssScale: +cssScale.toFixed(3), uiK: +uiK.toFixed(3), uiScale: !!top?.uiScale, n: regions.length, red, yellow, ok: red.length === 0 && yellow.length === 0, regions, text };
  }, { MIN: MIN_CSS, RED: RED_CSS });
}

/** Short text for a failing audit: counts and a few examples. */
export function describeAudit(a, max = 5) {
  if (a.error) return a.error;
  const ex = [...a.red, ...a.yellow].slice(0, max).map((r) => `${r.src}${r.id != null ? ':' + r.id : ''} ${r.kind} ${Math.round(r.w)}x${Math.round(r.h)}css`);
  return `${a.top}: ${a.n} regions, red ${a.red.length}, yellow ${a.yellow.length}${ex.length ? ' — ' + ex.join(' | ') : ''} (cssScale ${a.cssScale}, uiK ${a.uiK}${a.uiScale ? ', uiScale' : ''})`;
}

/** Scene visits per platform_view group (expressions run in the page; `B` pops back to the base scene). */
export const BACK = '(()=>{const g=__game;while(g.scenes.length>1)g.pop()})()';
export const VISITS = {
  front: [
    ['title', "__game.go('title',{},{fade:false})", 2200],
    ['title-menu', "(__game.top.mode='menu',0)", 700],
    ['slots', "__game.push('slots',{mode:'new'})", 1100],
    ['difficulty', `(${BACK},__game.push('difficulty',{slot:1}))`, 1100],
    ['charselect', `(${BACK},__game.push('charselect',{slot:1,difficulty:'normal'}))`, 1400],
    ['highscore', `(${BACK},__game.push('highscore',{}))`, 1100],
    ['confirm', `(${BACK},__game.push('frontConfirm',{title:'확인',message:'테스트',onYes(){}}))`, 900],
    ['saveCode', `(${BACK},__game.push('saveCode',{mode:'export',slot:1}))`, 1000],
  ],
  options: [['options', "__game.push('options',{})", 1100]],
  account: [
    ['account', "__game.push('account',{})", 1300],
    ['cloudConflict', `(${BACK},__game.push('cloudConflict',{slot:1,mode:'conflict'}))`, 1200],
  ],
  arcade: [['arcade', "__game.go('arcade',{},{fade:false})", 1500]],
  town: [
    ['shop', "__game.push('shop',{world:__game.world,from:'hub'})", 1200],
    ['smith', `(${BACK},__game.push('smith',{world:__game.world,from:'hub'}))`, 1200],
    ['church', `(${BACK},__game.push('church',{world:__game.world,from:'hub'}))`, 1200],
    ['questboard', `(${BACK},__game.push('questboard',{world:__game.world,from:'hub'}))`, 1200],
    ['party', `(${BACK},__game.push('party',{world:__game.world,from:'hub'}))`, 1200],
    ['worldmap', `(${BACK},__game.push('worldmap',{world:__game.world,from:'hub'}))`, 1300],
  ],
  games: [
    ['inn', "__game.go('inn',{},{fade:false})", 1500],
    ['minigame_dice', "__game.push('minigame_dice',{})", 1400],
    ['minigame_blackjack', `(${BACK},__game.push('minigame_blackjack',{}))`, 1400],
    ['minigame_slot', `(${BACK},__game.push('minigame_slot',{}))`, 1400],
    ['minigame_duel', `(${BACK},__game.push('minigame_duel',{}))`, 1400],
    ['minigame_memory', `(${BACK},__game.push('minigame_memory',{}))`, 1400],
  ],
  pause: [['pause', "__game.push('pause',{world:__game.world})", 1000]],
  dialogue: [['dialogue', "__game.push('dialogue',{npc:'npc_marta',world:__game.world})", 2400]],
  results: [['results', "__game.push('results',{world:__game.world})", 2600]],
};
/** Base URL per group (the scene the visits start from). */
export const VISIT_BASE = {
  front: 'index.html', options: 'index.html', account: 'index.html', arcade: 'index.html',
  town: 'index.html?scene=hub', games: 'index.html?scene=hub',
  pause: 'index.html?scene=stage&stage=s01', dialogue: 'index.html?scene=hub', results: 'index.html?scene=stage&stage=s01',
};
