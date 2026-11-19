// v2 dialogue box and pause menu (docs/v2/UI_API.md 4, 5) - the same cut-glass language, denser where text sits.
// Both are baked: the dialogue box is one canvas (panel, ornaments, portrait, name plate), each text page is one canvas
// revealed line by line with drawImage source rectangles; the pause menu is one canvas per selected row.
import { sprite, glassPanel, plate, bakeText, fitText, makeCanvas, measure, wrapLines, chamfer, clamp, COL, FONTS, onAtlas } from './draw.js';
import { createChoiceCards } from './choice.js';   // SCREENS: a choice is two large cards, confirmed by a second tap
import { bakeIcon } from './icons.js';

const CPS = 38, MAX_LINES = 4;

export function createDialog(env) {   // env: { game, input, hud (canvas HUD: layout L, px, tsz), portraitBase }
  const L = env.hud.layout, px = env.hud.px, tsz = env.hud.tsz;
  const D = { d: null, src: null, open: false, pages: [], page: 0, shown: 0, total: 0, sel: 0, t: 0, epoch: -1, portrait: null, pid: '', done: false };
  const box = { c: null, w: 0, h: 0, x: 0, y: 0, tx: 0, ty: 0, tw: 0, lineH: 0, ts: 0 }, pageC = { c: null, w: 0, h: 0, cum: [], starts: [] };
  const cards = createChoiceCards({ px, tsz, L, text: () => env.model?.()?.T ?? {}, sound: (n) => { try { env.model?.()?.sound?.(n); } catch { /* no audio */ } } });
  const portraits = new Map();
  let vw = 0, vh = 0, sf = { l: 0, t: 0, r: 0, b: 0 };

  function portraitOf(id) {
    if (!id) return null;
    let im = portraits.get(id);
    if (!im) { im = new Image(); im.decoding = 'async'; im.src = /[./]/.test(id) ? id : env.portraitBase + id + '.webp'; im.addEventListener('load', () => { D.epoch = -1; }, { once: true }); portraits.set(id, im); }
    return im;
  }
  function ctxOf(p, w, h) {
    const cw = Math.ceil(w * L.s), ch = Math.ceil(h * L.s);
    if (!p.c) p.c = makeCanvas(cw, ch); else if (p.c.width !== cw || p.c.height !== ch) { p.c.width = cw; p.c.height = ch; }
    p.w = w; p.h = h; const c = p.c.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch); c.setTransform(L.s, 0, 0, L.s, 0, 0); return c;
  }
  function geometry() {
    const d = D.d, ts = tsz(17.5, L.tmin + 3.5), lineH = ts * 1.52;
    const pw = Math.min(vw - sf.l - sf.r - px(28), px(800)), ph = Math.max(px(112), lineH * MAX_LINES + px(34));
    const hasP = !!d.portrait, pz = hasP ? ph + px(30) : 0, right = d.side === 'right';
    box.ts = ts; box.lineH = lineH; box.pw = pw; box.ph = ph; box.pz = pz; box.top = pz ? pz - ph + px(6) : px(18);
    box.x = (vw - pw) / 2 - 8; box.y = vh - sf.b - ph - px(14) - box.top;
    box.tw = pw - px(40) - (hasP ? pz * 0.86 + px(6) : 0);
    box.tx = 8 + px(22) + (hasP && !right ? pz * 0.86 + px(6) : 0); box.ty = box.top + px(24);
  }
  function bakeBox() {
    const d = D.d; geometry();
    const pw = box.pw, ph = box.ph, top = box.top, c = ctxOf(box, pw + 16, top + ph + 10), right = d.side === 'right';
    glassPanel(c, 8, top, pw, ph, { cut: px(13), dense: 0.72 });
    // corner ornaments (one sprite, mirrored)
    const o = px(40);
    for (let i = 0; i < 4; i++) { c.save(); c.translate(8 + (i % 2 ? pw - 3 : 3), top + (i > 1 ? ph - 3 : 3)); c.scale(i % 2 ? -1 : 1, i > 1 ? -1 : 1); c.globalAlpha = 0.9; sprite(c, 'orn_corner', o / 2, o / 2, o, o); c.restore(); }
    if (d.portrait) {   // bust in a cut frame that rises above the panel
      const pz = box.pz, fw = pz * 0.82, x = right ? 8 + pw - fw - px(12) : 8 + px(12), y = 2, fh = pz - px(8);
      c.save(); chamfer(c, x, y, fw, fh, px(12)); c.clip();
      const g = c.createLinearGradient(0, y, 0, y + fh); g.addColorStop(0, 'rgba(40,46,84,0.78)'); g.addColorStop(1, 'rgba(8,9,22,0.92)'); c.fillStyle = g; c.fillRect(x, y, fw, fh);
      const im = D.portrait;
      if (im && im.complete && im.naturalWidth) { const k = Math.max(fw / im.naturalWidth, fh / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k; c.drawImage(im, x + (fw - dw) / 2, y + (fh - dh) * 0.12, dw, dh); }
      const sh = c.createLinearGradient(0, y + fh * 0.72, 0, y + fh); sh.addColorStop(0, 'rgba(6,7,18,0)'); sh.addColorStop(1, 'rgba(6,7,18,0.7)'); c.fillStyle = sh; c.fillRect(x, y + fh * 0.72, fw, fh * 0.28);
      c.restore();
      chamfer(c, x, y, fw, fh, px(12)); c.lineWidth = 1.5; const rg = c.createLinearGradient(x, y, x + fw, y + fh); rg.addColorStop(0, 'rgba(246,249,255,0.95)'); rg.addColorStop(0.5, 'rgba(140,156,200,0.6)'); rg.addColorStop(1, 'rgba(226,234,255,0.85)'); c.strokeStyle = rg; c.stroke();
      chamfer(c, x + 3, y + 3, fw - 6, fh - 6, px(10)); c.lineWidth = 0.8; c.strokeStyle = 'rgba(255,255,255,0.16)'; c.stroke();
    }
    if (d.speaker) {   // name plate on the top edge
      // a long name is shrunk, then cut, so the plate never leaves the panel
      const fsp = fitText(d.speaker, tsz(15, L.tmin + 2.5), box.tw - px(10), 800, FONTS.title), who = fsp.str, ns = fsp.size, nx = box.tx + measure(who, ns, 800, FONTS.title) / 2 + ns * 0.4;
      plate(c, who, right && d.portrait ? 8 + px(22) + measure(who, ns, 800, FONTS.title) / 2 + ns * 0.4 : nx, top + 1, ns, { family: FONTS.title, weight: 800, color: '#fff3d4', rim: 'rgba(241,212,138,0.8)' });
    }
    box.tx = 8 + px(22) + (d.portrait && !right ? box.pz * 0.86 + px(6) : 0);
  }
  function bakePage() {
    const lines = D.pages[D.page] ?? [], ts = box.ts, lh = box.lineH;
    const c = ctxOf(pageC, box.tw + 6, lh * MAX_LINES + 6);
    c.font = `500 ${ts}px ${FONTS.body}`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.lineJoin = 'round';
    pageC.cum.length = 0; pageC.starts.length = 0; let n = 0;
    for (let i = 0; i < lines.length; i++) {
      const y = 3 + lh * (i + 0.5), ln = lines[i];
      c.lineWidth = 2.6; c.strokeStyle = 'rgba(4,4,12,0.75)'; c.strokeText(ln, 2, y);
      c.fillStyle = '#f2f4ff'; c.fillText(ln, 2, y);
      pageC.starts.push(n); const cum = [0]; for (let k = 1; k <= ln.length; k++) cum.push(c.measureText(ln.slice(0, k)).width + 4); pageC.cum.push(cum); n += ln.length;
    }
    D.total = n; c.textBaseline = 'alphabetic';
  }
  function rebuild() {
    const d = D.d;
    D.portrait = portraitOf(d.portrait);
    geometry();
    const lines = wrapLines(d.text ?? '', box.tw - 6, box.ts, 500);
    D.pages.length = 0; for (let i = 0; i < lines.length; i += MAX_LINES) D.pages.push(lines.slice(i, i + MAX_LINES));
    if (!D.pages.length) D.pages.push(['']);
    D.page = Math.min(D.page, D.pages.length - 1);
    bakeBox(); bakePage(); D.epoch = L.epoch;
  }
  const lastPage = () => D.page >= D.pages.length - 1;
  const revealed = () => D.shown >= D.total;
  const asking = () => !!D.d && !!D.d.choices && revealed() && lastPage();
  function finish(choice) {
    const d = D.d; D.open = false; D.d = null; D.done = true; cards.close();
    try { if (choice != null) d.onChoice?.(choice); else d.onDone?.(); } catch (e) { console.error('[v2ui] dialog callback', e); }
  }

  return {
    get open() { return D.open; },
    show(d, fromState = false) { D.d = d; D.fromState = fromState; D.open = true; D.page = 0; D.shown = 0; D.sel = 0; D.t = 0; D.epoch = -1; D.done = false; cards.close(); },
    close() { D.open = false; D.d = null; cards.close(); },
    /** state.dialog path: the same object keeps the same conversation; a new object starts a new one; null closes. */
    sync(obj) {
      obj = obj ?? null;
      if (obj === D.src) return;
      D.src = obj;
      if (!obj) { if (D.open && D.fromState) this.close(); return; }
      this.show(obj, true);
    },
    advance() {
      if (!D.open) return;
      if (!revealed()) { D.shown = D.total; return; }
      if (!lastPage()) { D.page++; D.shown = 0; bakePage(); return; }
      if (D.d.choices) return;   // SCREENS: a choice is made on its cards only (choice.js: chosen, then confirmed by a second press) - never by the press that turned the page
      finish(null);
    },
    /** tap in logical px */
    tap(x, y) {
      if (!D.open) return;
      if (asking()) { if (cards.open) cards.tap(x, y); return; }
      this.advance();
    },
    update(dt, s) {
      if (!D.open) return;
      vw = s.viewW; vh = s.viewH; sf = s.safe ?? sf;
      if (D.epoch !== L.epoch) rebuild();
      D.t += dt; D.shown = Math.min(D.total, D.shown + dt * CPS);
      const inp = env.input;
      if (asking()) {   // the cards come up when the question has been read out; from then on every press belongs to them
        if (!cards.open) { const d = D.d; cards.show(d.choices, d.choiceMeta ?? null, (i) => { if (D.d === d) { D.sel = i; finish(i); } }); }
        cards.update(dt); cards.keys(inp);
      } else if (inp?.pressed) {
        if (inp.pressed('confirm') || inp.pressed('attack') || inp.pressed('jump')) this.advance();
      }
      if (D.open && D.d.auto && revealed() && D.t > D.total / CPS + 1.6) { D.t = 0; this.advance(); }
    },
    draw(ctx, s) {
      if (!D.open) return;
      vw = s.viewW; vh = s.viewH; sf = s.safe ?? sf;
      if (D.epoch !== L.epoch) rebuild();
      const a = clamp(D.t / 0.18, 0, 1), dy = (1 - a) * px(12);
      ctx.globalAlpha = a;
      ctx.drawImage(box.c, box.x, box.y + dy, box.w, box.h);
      const S = L.s, lh = box.lineH, ox = box.x + box.tx, oy = box.y + box.ty + dy;
      for (let i = 0; i < pageC.cum.length; i++) {
        const k = Math.floor(D.shown) - pageC.starts[i]; if (k <= 0) break;
        const cum = pageC.cum[i], w = cum[Math.min(k, cum.length - 1)]; if (w <= 0) continue;
        ctx.drawImage(pageC.c, 0, Math.floor((3 + lh * i) * S), Math.ceil(w * S), Math.ceil(lh * S), ox, oy + lh * i, Math.ceil(w * S) / S, Math.ceil(lh * S) / S);
      }
      if (revealed()) {
        if (D.d.choices && lastPage()) { if (cards.open) { cards.draw(ctx, s, box.y, dy, a); ctx.globalAlpha = a; } }
        else {   // "next" marker: a small diamond that bobs
          const mx = box.x + 8 + box.pw - px(24), my = box.y + box.top + box.ph - px(18) + Math.sin(D.t * 5) * px(2.5), q = px(5.5);
          ctx.fillStyle = COL.gold; ctx.beginPath(); ctx.moveTo(mx, my + q * 1.25); ctx.lineTo(mx + q, my); ctx.lineTo(mx, my - q * 0.8); ctx.lineTo(mx - q, my); ctx.closePath(); ctx.fill();
          ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,250,235,0.9)'; ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    },
    info() { return D.open ? { page: D.page, pages: D.pages.length, shown: Math.floor(D.shown), total: D.total, sel: cards.open ? cards.sel : D.sel, choices: D.d.choices ?? null, cards: cards.info(), box: { x: box.x + 8, y: box.y + box.top, w: box.pw, h: box.ph, top: box.y }, text: { x: box.x + box.tx, y: box.y + box.ty, w: box.tw, h: box.lineH * MAX_LINES }, choiceRects: cards.rects() } : null; },
    /** STORY2 (11-19): the busts of everyone who can speak, loaded and decoded ahead (the scene calls it while its first area loads; nothing waits on the first
     *  frame for it) - the first page of a speaker's first line of a session used to open with an empty frame. -> a promise: { n, ms } when all are ready (or failed) */
    preload(ids) {
      const t0 = performance.now(), P = [];
      for (const id of ids ?? []) { const im = portraitOf(id); if (!im || (im.complete && im.naturalWidth > 0)) continue; P.push((im.decode ? im.decode() : new Promise((r) => { im.addEventListener('load', r, { once: true }); im.addEventListener('error', r, { once: true }); })).catch(() => {})); }
      return Promise.all(P).then(() => { D.epoch = -1; return (D.pre = { n: portraits.size, ms: Math.round(performance.now() - t0) }); });
    },
    get preloaded() { return D.pre ?? null; },
    release() { for (const p of [box, pageC]) if (p.c) { p.c.width = 1; p.c.height = 1; p.c = null; } cards.release(); portraits.clear(); },
  };
}

const ROWS = [['resume', '이어 하기'], ['settings', '설정'], ['leave', '나가기']];
export function createPause(env) {
  const L = env.hud.layout, px = env.hud.px, tsz = env.hud.tsz;
  const M = { open: false, sel: 0, t: 0, key: -1, o: null, x: 0, y: 0, rowY: [0, 0, 0], rowX: [0, 0, 0], rowW: 0, rowH: 0, rows: ROWS, cols: 1, per: 3, vh: 0, sfH: 0 };   // rows = resume, the screens' rows (SCREENS: 연대기 · 가방), settings, opts.extra rows ([icon, label, {onPick}]), leave
  const panel = { c: null, w: 0, h: 0 };
  function bake() {
    // SCREENS (11-19): every row is a 56 px target (it was 46), and when the rows do not fit the screen's height one above the other (a phone with the two screens' rows
    // and the scene's two) they stand in two columns - down the first, then down the second: the order of `ids` and of the keys is the same either way, 「나가기」 is last.
    const ts = tsz(17, L.tmin + 4), rowH = Math.max(px(46), 56 / L.css, ts * 2.5), R = M.rows, n = R.length, titleH = px(74), room = (M.sfH || M.vh || 1e9) - 24 - px(8);
    const cols = titleH + rowH * n + px(34) > room && n > 3 ? 2 : 1, per = Math.ceil(n / cols), h = titleH + rowH * per + px(34);
    let cw1 = px(300) - px(40); for (let i = 0; i < n; i++) cw1 = Math.max(cw1, measure(R[i][1], ts, 700) + px(130));
    const gapX = px(10), w = cols * cw1 + (cols - 1) * gapX + px(40);
    M.cols = cols; M.per = per; M.rowW = cw1;
    const cw = Math.ceil((w + 24) * L.s), ch = Math.ceil((h + 24) * L.s);
    if (!panel.c) panel.c = makeCanvas(cw, ch); else if (panel.c.width !== cw || panel.c.height !== ch) { panel.c.width = cw; panel.c.height = ch; }
    panel.w = w + 24; panel.h = h + 24;
    const c = panel.c.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch); c.setTransform(L.s, 0, 0, L.s, 0, 0);
    glassPanel(c, 12, 12, w, h, { cut: px(16), dense: 0.78 });
    const o = px(44);
    for (let i = 0; i < 4; i++) { c.save(); c.translate(12 + (i % 2 ? w - 3 : 3), 12 + (i > 1 ? h - 3 : 3)); c.scale(i % 2 ? -1 : 1, i > 1 ? -1 : 1); sprite(c, 'orn_corner', o / 2, o / 2, o, o); c.restore(); }
    const title = bakeText(M.o?.title ?? '잠시 멈춤', L.s, { size: tsz(24, L.tmin + 7), family: FONTS.title, weight: 800, fill: ['#ffffff', '#cdd5f3'], lw: 3.5, stroke: 'rgba(6,6,18,0.86)' });
    c.drawImage(title.c, 12 + w / 2 - title.w / 2, 12 + px(10), title.w, title.h);
    sprite(c, 'orn_div', 12 + w / 2, 12 + px(10) + title.h * 0.92, w * 0.62, w * 0.62 * 64 / 480);
    for (let i = 0; i < n; i++) {
      const col = Math.floor(i / per), y = 12 + titleH + (i - col * per) * rowH, sel = i === M.sel, rx = 12 + px(20) + col * (cw1 + gapX), rw = cw1;
      glassPanel(c, rx, y + 3, rw, rowH - 7, { cut: px(8), shadow: false, dense: sel ? 0.5 : 0.1, accent: sel ? 'gold' : null });
      if (sel) { chamfer(c, rx, y + 3, rw, rowH - 7, px(8)); c.lineWidth = 1.8; c.strokeStyle = COL.gold; c.stroke(); }
      if (R[i][2] && R[i][2].draw) { const b = bakeIcon(R[i][2].draw, rowH * 0.62, L.s); c.drawImage(b.c, rx + rowH * 0.55 - b.w / 2, y + rowH / 2 - b.w / 2, b.w, b.w); }   // (a picture drawn in code: icons.js)
      else sprite(c, R[i][0], rx + rowH * 0.55, y + rowH / 2, rowH * 0.66, rowH * 0.66);
      c.font = `700 ${ts}px ${FONTS.body}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = 2.6; c.strokeStyle = 'rgba(4,4,12,0.75)';
      c.strokeText(R[i][1], rx + rowH * 1.1, y + rowH / 2 + 1); c.fillStyle = sel ? '#fff3d4' : COL.silver; c.fillText(R[i][1], rx + rowH * 1.1, y + rowH / 2 + 1);
      c.textBaseline = 'alphabetic'; M.rowY[i] = y; M.rowX[i] = rx;
    }
    M.rowH = rowH; M.key = L.epoch * 8 + M.sel;
  }
  function pick(i) {
    const o = M.o ?? {}, g = env.game, row = M.rows[i] ?? ROWS[0], id = row[0]; M.open = false;
    try {
      if (row[2]) row[2].onPick?.();   // an extra row of the caller (opts.extra)
      else if (id === 'resume') o.onResume?.();
      else if (id === 'settings') { if (o.onSettings) o.onSettings(); else if (g.registry?.options && g.push) g.push('options'); }
      else if (o.onLeave) o.onLeave(); else if (g.registry?.v2pick) g.go('v2pick', {}, { fade: true }); else if (g.registry?.title) g.go('title', {}, { fade: true });
    } catch (e) { console.error('[v2ui] pause callback', e); }
  }
  onAtlas(() => { M.key = -1; });
  return {
    get open() { return M.open; },
    show(o) {
      M.o = o ?? null; M.open = true; M.sel = 0; M.t = 0; M.key = -1;
      const ex = Array.isArray(o?.extra) ? o.extra.slice(0, 2).filter((x) => x && x.label) : [];
      // SCREENS: while the story's model is there, 「연대기」 and 「가방」 stand right under 「이어 하기」. A row opens its screen in the same press (hud.modal stays 'pause'
      // from the panel to the screen); closing the screen brings the panel back with that row chosen - back / ESC closes the top one first.
      const top = [], md = env.model?.(), scr = env.screens;
      if (md && scr && o?.screens !== false) {
        const T = md.T?.pause ?? {}, self = this;
        for (const k of ['chronicle', 'bag']) top.push([k, T[k] ?? k, { id: k, draw: k === 'chronicle' ? 'book' : 'bag', onPick: () => { const i = M.rows.findIndex((r) => r[2] && r[2].id === k); if (!scr.show(k, { onClose: () => { self.show(M.o); M.sel = Math.max(0, i); } }, env.last?.())) { self.show(M.o); M.sel = Math.max(0, i); } } }]);
      }
      M.rows = ex.length || top.length ? [ROWS[0], ...top, ROWS[1], ...ex.map((x) => [x.icon ?? 'next', String(x.label), x]), ROWS[2]] : ROWS;
    },
    close() { if (M.open) pick(0); },
    tap(x, y) {
      if (!M.open) return;
      const lx = x - M.x, ly = y - M.y;
      for (let i = 0; i < M.rows.length; i++) if (lx >= M.rowX[i] && lx <= M.rowX[i] + M.rowW && ly >= M.rowY[i] && ly < M.rowY[i] + M.rowH) { M.sel = i; pick(i); return; }
    },
    update(dt, s) {
      if (!M.open) return;
      M.t += dt;
      { const sf = s.safe ?? null, sh = s.viewH - (sf ? sf.t + sf.b : 0); if (s.viewH !== M.vh || sh !== M.sfH) { M.vh = s.viewH; M.sfH = sh; M.key = -1; } }
      const inp = env.input; if (!inp?.pressed || M.t < 0.12) return;
      const n = M.rows.length;
      if (inp.pressed('up')) M.sel = (M.sel + n - 1) % n; else if (inp.pressed('down')) M.sel = (M.sel + 1) % n;
      else if (M.cols > 1 && (inp.pressed('left') || inp.pressed('right'))) { const q = M.sel + (inp.pressed('right') ? M.per : -M.per); if (q >= 0 && q < n) M.sel = q; }   // (two columns: across)
      else if (inp.pressed('confirm') || inp.pressed('attack')) pick(M.sel);
      else if (inp.pressed('cancel') || inp.pressed('menu')) pick(0);
    },
    draw(ctx, s) {
      if (!M.open) return;
      if (!M.vh) { const sf = s.safe ?? null; M.vh = s.viewH; M.sfH = s.viewH - (sf ? sf.t + sf.b : 0); }
      if (M.key !== L.epoch * 8 + M.sel) bake();
      const a = clamp(M.t / 0.16, 0, 1);
      ctx.globalAlpha = a * 0.58; ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, s.viewW, s.viewH);
      M.x = s.viewW / 2 - panel.w / 2; M.y = s.viewH / 2 - panel.h / 2;
      ctx.globalAlpha = a; ctx.drawImage(panel.c, M.x, M.y + (1 - a) * px(10), panel.w, panel.h);
      {   // the purse (state.coins — BREAK lane): always shown here, in the strip under the rows
        const n = s.coins | 0, ts = tsz(15, L.tmin + 3), ih = px(24), cy = M.y + (1 - a) * px(10) + panel.h - 12 - px(17);
        if (M.coinN !== n) { M.coinN = n; M.coinS = String(n); }
        ctx.font = `700 ${ts}px ${FONTS.body}`; const tw = ctx.measureText(M.coinS).width, cx = M.x + panel.w / 2 - (ih + px(6) + tw) / 2;
        sprite(ctx, 'pouch', cx + ih / 2, cy, ih, ih);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(4,4,12,0.85)'; ctx.strokeText(M.coinS, cx + ih + px(6), cy + 1);
        ctx.fillStyle = '#fff2d2'; ctx.fillText(M.coinS, cx + ih + px(6), cy + 1); ctx.textBaseline = 'alphabetic';
        M.coinR = { x: cx, y: cy - ih / 2, w: ih + px(6) + tw, h: ih };
      }
      ctx.globalAlpha = 1;
    },
    info() { return M.open ? { sel: M.sel, coins: M.coinR ? { ...M.coinR, n: M.coinN } : null, ids: M.rows.map((r) => (r[2] ? r[2].id ?? 'extra' : r[0])), cols: M.cols, rows: M.rowY.slice(0, M.rows.length).map((y, i) => ({ x: M.x + M.rowX[i], y: M.y + y, w: M.rowW, h: M.rowH })) } : null; },
    release() { if (panel.c) { panel.c.width = 1; panel.c.height = 1; panel.c = null; } },
  };
}
