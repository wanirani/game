// v2 interface - the three full screens: the chronicle (an open book of two pages), the bag and a keeper's shop (docs/v2/UI_API.md 10).
// Drawn with the kit on the game canvas, like the ending card: a dark veil over the picture, the frame, a header, and a list that scrolls by drag
// with momentum. While one is open hud.modal is 'pause' - the scene stops the rules exactly as for the pause panel (nothing else is needed).
//   hud.openScreen('chronicle' | 'bag' | 'shop', { at, shop, onClose })   hud.closeScreen()   hud.screen   hud.metrics().screen
// Cost: the header and every row are baked (rows into a small pool of canvases, only those near the window); a still frame is a veil, a few
// fills, one drawImage per visible row and the marks of new rows. Nothing is allocated per frame (UI_API 7). Everything shown comes from the
// model (model.js), which reads the story runner's state - a save and load, a crossing and a fall leave a screen exactly as it was.
import { glassPanel, chamfer, sprite, bakeText, fitText, measure, wrapLines, makeCanvas, clamp, COL, FONTS, gem, onAtlas } from './draw.js';
import { bakeIcon, hasIcon } from './icons.js';

const OPEN_T = 0.16, OUT_T = 0.12, POOL_MAX = 14, SEEN_T = 0.8;
const PAST = { rim: 'rgba(255,120,140,0.62)', title: '#ffd9de', page: 'rgba(74,16,30,0.34)', head: '#ffd9de' };   // the colours the night badge uses for 「그 밤」
const NOW = { rim: 'rgba(196,212,250,0.58)', title: COL.silver, page: 'rgba(22,32,70,0.34)', head: COL.silver };   // and for 「오늘 밤」
const TXT = '#eef0fa', DIM = 'rgba(196,206,235,0.74)', GOLD = '#fff2d2';

export function createScreens(env) {
  const L = env.hud.layout, px = env.hud.px, tsz = env.hud.tsz;
  const S = { kind: null, o: null, t: 0, outT: 0, outKind: null, epoch: -1, rev: -1, vw: 0, vh: 0, scroll: 0, max: 0, v: 0, sel: -1, armT: 0, say: '', sayT: 0, shakeI: -1, shakeT: 0, coinN: -1, keyT: 0, still: 0 };
  const G = { x0: 0, y0: 0, x1: 0, y1: 0, B: 56, hh: 0, lx: 0, ly: 0, lw: 0, lh: 0, colW: 0, sp: 0, cx: 0, cy: 0, cw: 0, sideW: 0, rs: 2, maxH: 0, body: null, fadeT: null, fadeB: null, spine: null };
  const D = { on: false, id: -1, y0: 0, s0: 0, ly: 0, acc: 0, moved: false, x: 0, y: 0 };
  const head = { c: null, w: 0, h: 0 }, closeP = { c: null, w: 0, h: 0 }, coinP = { c: null, w: 0, h: 0 }, sideP = { c: null, w: 0, h: 0 };
  let rows = [], N = 0, total = 0, shopD = null, portrait = null;
  let rowY = new Float32Array(48), rowH = new Float32Array(48), seenT = new Float32Array(48), glow = new Float32Array(48), slotOf = new Int16Array(48).fill(-1);
  const LAY = [];   // per row: what the bake needs (wrapped lines), made at layout time
  const slots = []; for (let i = 0; i < POOL_MAX; i++) slots.push({ c: null, i: -1 });
  const model = () => (env.model ? env.model() : null);
  const TX = () => model()?.T ?? {};
  const sound = (n) => { try { model()?.sound?.(n); } catch { /* no audio */ } };

  function canvasFor(p, w, h, s) {
    const cw = Math.max(1, Math.ceil(w * s)), ch = Math.max(1, Math.ceil(h * s));
    if (!p.c) p.c = makeCanvas(cw, ch); else if (p.c.width !== cw || p.c.height !== ch) { p.c.width = cw; p.c.height = ch; }
    p.w = w; p.h = h; const c = p.c.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch); c.setTransform(s, 0, 0, s, 0, 0); return c;
  }
  function grow(n) {
    if (n <= rowY.length) return; const k = Math.max(n, rowY.length * 2);
    const a = new Float32Array(k), b = new Float32Array(k), c = new Float32Array(k), d = new Float32Array(k), e = new Int16Array(k).fill(-1);
    a.set(rowY); b.set(rowH); c.set(seenT); d.set(glow); rowY = a; rowH = b; seenT = c; glow = d; slotOf = e;
    for (const sl of slots) sl.i = -1;
  }
  const text = (c, str, x, y, size, col, weight = 500, family = FONTS.body, align = 'left') => {
    c.font = `${weight} ${size}px ${family}`; c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = Math.max(2, size * 0.17); c.strokeStyle = 'rgba(4,4,12,0.8)'; c.strokeText(str, x, y); c.fillStyle = col; c.fillText(str, x, y);
  };

  // ───────────────────────── layout ─────────────────────────
  function sizes() { return { tT: tsz(15.5, L.tmin + 3), tB: tsz(13.5, L.tmin + 2.2), cp: px(10), cm: px(6) }; }
  function layout(s) {
    const sf = s.safe ?? ZERO, vw = s.viewW, vh = s.viewH, m = px(12), M = model();
    S.epoch = L.epoch; S.rev = M ? M.rev : 0; S.vw = vw; S.vh = vh;
    G.B = Math.max(56 / L.css, px(44));
    G.x0 = sf.l + m; G.x1 = vw - sf.r - m; G.y0 = sf.t + px(8); G.y1 = vh - sf.b - px(8);
    const wMax = px(1180); if (G.x1 - G.x0 > wMax) { const c = (G.x0 + G.x1) / 2; G.x0 = c - wMax / 2; G.x1 = c + wMax / 2; }
    G.hh = Math.max(G.B, px(54)); G.rs = Math.min(L.s, 2);
    G.cw = G.B; G.cx = G.x1 - G.B - px(4); G.cy = G.y0 + (G.hh - G.B) / 2 + px(2);
    const two = S.kind !== 'shop', Z = sizes(), ph = two ? Z.tT * 2.1 : 0;
    G.sp = two ? px(30) : 0; G.sideW = two ? 0 : clamp((G.x1 - G.x0) * 0.34, px(190), px(330));
    G.lx = G.x0 + px(10) + G.sideW; G.lw = G.x1 - px(10) - G.lx; G.ly = G.y0 + G.hh + ph + px(8); G.lh = G.y1 - px(10) - G.ly;
    G.colW = two ? (G.lw - G.sp) / 2 : G.lw;
    // the rows of this kind
    if (S.kind === 'chronicle') { rows = M ? M.book() : []; if (!rows.length) rows = EMPTY; }   // (nothing written yet: one line says so)
    else if (S.kind === 'bag') { const b = M ? M.bag() : { story: [], use: [] }; rows = []; const n = Math.max(b.story.length, b.use.length, 1); for (let i = 0; i < n; i++) rows.push({ L: b.story[i] ?? null, R: b.use[i] ?? null, empty: !b.story.length && !b.use.length }); }
    else { shopD = M ? M.shop(S.o?.shop ?? 'rook') : null; rows = shopD ? shopD.goods : []; }
    N = rows.length; grow(N); LAY.length = 0;
    let y = px(4), maxH = 0;
    for (let i = 0; i < N; i++) {
      const lay = S.kind === 'chronicle' ? layBook(rows[i], Z) : S.kind === 'bag' ? layBag(rows[i], Z) : layShop(rows[i], Z);
      LAY.push(lay); rowY[i] = y; rowH[i] = lay.h; y += lay.h; if (lay.h > maxH) maxH = lay.h;
    }
    total = y + px(6); G.maxH = maxH; S.max = Math.max(0, total - G.lh); S.scroll = clamp(S.scroll, 0, S.max);
    for (const sl of slots) sl.i = -1; slotOf.fill(-1);
    bakeHead(s, Z, ph); bakeClose(); S.coinN = -1; if (S.kind === 'shop') bakeSide(Z);
  }
  const cellW = () => G.colW - px(6) * 2;
  function layBook(r, Z) {
    if (r.kind === 'empty') return { h: px(90), Ll: null, Rl: null, hint: null };
    const w = cellW() - Z.cp * 2 - (r.kind === 'line' || r.kind === 'sealed' ? px(8) : 0), lh = Z.tB * 1.5;
    const lay = { h: 0, Ll: null, Rl: null, hint: null };
    if (r.L) lay.Ll = r.L.text ? wrapLines(r.L.text, w, Z.tB, 500) : [];
    if (r.R) lay.Rl = r.R.text ? wrapLines(r.R.text, w, Z.tB, 500) : [];
    if (r.kind === 'blank') lay.hint = wrapLines(r.hint ?? '', w, Z.tB, 500);
    else if (r.kind === 'half') lay.hint = wrapLines(TX().chronicle?.unseen ?? '', w, Z.tB, 500);
    const n = Math.max(lay.Ll ? lay.Ll.length : 0, lay.Rl ? lay.Rl.length : 0, lay.hint ? lay.hint.length : 0, 1);
    lay.h = Z.cm + Z.cp * 2 + Z.tT * 1.4 + n * lh;
    return lay;
  }
  function layBag(r, Z) {
    const ib = Math.max(px(46), Z.tT * 2.6), w = cellW() - Z.cp * 2 - ib - px(10), lh = Z.tB * 1.5, lay = { h: 0, Ll: null, Rl: null, ib };
    if (r.L) lay.Ll = wrapLines(r.L.desc ?? '', w, Z.tB, 500);
    if (r.R) lay.Rl = wrapLines(r.R.desc ?? '', w, Z.tB, 500);
    const n = Math.max(lay.Ll ? lay.Ll.length : 0, lay.Rl ? lay.Rl.length : 0, 1);
    lay.h = Z.cm + Math.max(Z.cp * 2 + Z.tT * 1.4 + n * lh, ib + Z.cp * 1.4);
    return lay;
  }
  function layShop(g, Z) {
    const ib = Math.max(px(50), Z.tT * 2.8), pw = px(96), w = G.colW - px(6) * 2 - Z.cp * 2 - ib - px(12) - pw, lh = Z.tB * 1.5, lay = { h: 0, Ll: wrapLines(g.line ?? '', w, Z.tB, 500), ib, pw };
    lay.h = Z.cm + Math.max(G.B, Z.cp * 2 + Z.tT * 1.4 + (lay.Ll.length + 1) * lh, ib + Z.cp * 1.6);
    return lay;
  }

  // ───────────────────────── baked pieces ─────────────────────────
  function bakeHead(s, Z, ph) {
    const w = G.x1 - G.x0, h = G.hh + ph + px(6), c = canvasFor(head, w, h, L.s), T = TX(), K = S.kind;
    const title = K === 'chronicle' ? T.chronicle?.title ?? '연대기' : K === 'bag' ? T.bag?.title ?? '가방' : shopD?.title ?? '';
    const ts = tsz(23, L.tmin + 7), ic = G.hh * 0.72, tx = px(16) + ic + px(8);
    const ib = bakeIcon(K === 'chronicle' ? 'book' : K === 'bag' ? 'bag' : 'coin', ic, L.s); c.drawImage(ib.c, px(14) + ic / 2 - ib.w / 2, G.hh / 2 - ib.w / 2 + px(2), ib.w, ib.w);
    const f = fitText(title, ts, w * 0.4, 800, FONTS.title, 0.7), tb = bakeText(f.str, L.s, { size: f.size, family: FONTS.title, weight: 800, fill: ['#ffffff', '#cdd5f3'], lw: 3.5, stroke: 'rgba(6,6,18,0.86)' });
    c.drawImage(tb.c, tx - tb.w * 0.06, G.hh / 2 - tb.h / 2 + px(2), tb.w, tb.h);
    const subX = tx + tb.w * 0.92, room = w - subX - G.B - px(150);
    if (K === 'chronicle' && T.chronicle?.sub && room > px(120)) { const fs = fitText(T.chronicle.sub, tsz(12.5), room, 600); text(c, fs.str, subX + px(6), G.hh / 2 + px(5), fs.size, DIM, 600); }
    c.fillStyle = 'rgba(214,224,250,0.3)'; c.fillRect(px(12), G.hh + px(1), w - px(24), 1);
    if (ph > 0) sprite(c, 'orn_div', G.lx - G.x0 + G.colW + G.sp / 2, G.hh + ph / 2 + px(3), px(132), px(132) * 64 / 480);   // a small ornament where the fold begins
    if (ph > 0) {   // the two page heads: that night on the left, tonight on the right (the bag: story things · things that are used up)
      const lx = G.lx - G.x0, hy = G.hh + ph / 2 + px(3), hs = Z.tT, book = K === 'chronicle';
      const a = book ? T.chronicle?.past ?? '그 밤 · 1697' : T.bag?.story ?? '', b = book ? T.chronicle?.now ?? '오늘 밤 · 1797' : T.bag?.use ?? '';
      for (let k = 0; k < 2; k++) {
        const col = book ? (k ? NOW : PAST) : NOW, cx = lx + (k ? G.colW + G.sp : 0) + G.colW / 2, str = k ? b : a, tw = measure(str, hs, 800, FONTS.title);
        if (book) sprite(c, k ? 'night_now' : 'night_past', cx - tw / 2 - hs * 1.05, hy, hs * 1.7, hs * 1.7);
        text(c, str, cx, hy, hs, col.head, 800, FONTS.title, 'center');
        const lw = Math.max(0, Math.min(G.colW * 0.2, G.colW / 2 - tw / 2 - hs * 2.4 - px(70))); c.fillStyle = col.rim; c.fillRect(cx - tw / 2 - hs * 2 - lw, hy, lw, 1); c.fillRect(cx + tw / 2 + hs * 0.9, hy, lw, 1);
      }
    }
  }
  function bakeClose() {
    const B = G.B, c = canvasFor(closeP, B, B, L.s), r = Math.min(B * 0.42, px(23));
    gem(c, B / 2, B / 2, r, { facets: 10 });
    const ib = bakeIcon('close', r * 1.5, L.s); c.drawImage(ib.c, B / 2 - ib.w / 2, B / 2 - ib.w / 2, ib.w, ib.w);
  }
  function bakeCoin(n) {
    const T = TX(), ts = tsz(16, L.tmin + 3.5), str = String(n), lab = S.kind === 'shop' ? T.shop?.silver ?? '' : T.bag?.silver ?? '', ls = tsz(12, L.tmin + 1.5);
    const ih = px(26), tw = measure(str, ts, 800), lw = lab ? measure(lab, ls, 600) + px(8) : 0, w = lw + ih + px(8) + tw + px(22), h = Math.max(px(34), ts * 1.9);
    const c = canvasFor(coinP, w + 6, h + 6, L.s);
    glassPanel(c, 3, 3, w, h, { cut: px(7), dense: 0.75, accent: 'gold', shadow: false });
    let x = 3 + px(10); if (lab) { text(c, lab, x, 3 + h / 2 + 1, ls, DIM, 600); x += lw; }
    sprite(c, 'pouch', x + ih / 2, 3 + h / 2, ih, ih); text(c, str, x + ih + px(6), 3 + h / 2 + 1, ts, GOLD, 800);
    S.coinN = n;
  }
  /** the keeper beside his goods: the bust (when its image has arrived) and what he says */
  function bakeSide(Z) {
    const w = G.sideW - px(6), h = G.y1 - px(10) - (G.y0 + G.hh + px(8)), c = canvasFor(sideP, w, h, L.s), d = shopD; if (!d) return;
    glassPanel(c, 2, 2, w - 4, h - 4, { cut: px(10), dense: 0.5, shadow: false });
    const line = S.say || d.line, lines = wrapLines(line, w - px(28), Z.tB, 500), lh = Z.tB * 1.5, th = Z.tT * 1.6 + lines.length * lh + px(18);
    const fh = Math.max(px(60), h - th - px(22)), fw = Math.min(w - px(24), fh * 0.82), fx = (w - fw) / 2, fy = px(10);
    c.save(); chamfer(c, fx, fy, fw, fh, px(10)); c.clip();
    const g = c.createLinearGradient(0, fy, 0, fy + fh); g.addColorStop(0, 'rgba(40,46,84,0.78)'); g.addColorStop(1, 'rgba(8,9,22,0.92)'); c.fillStyle = g; c.fillRect(fx, fy, fw, fh);
    const im = portrait;
    if (im && im.complete && im.naturalWidth) { const k = Math.max(fw / im.naturalWidth, fh / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k; c.drawImage(im, fx + (fw - dw) / 2, fy + (fh - dh) * 0.12, dw, dh); }
    c.restore();
    chamfer(c, fx, fy, fw, fh, px(10)); c.lineWidth = 1.4; c.strokeStyle = 'rgba(226,234,255,0.8)'; c.stroke();
    let y = fy + fh + px(8) + Z.tT * 0.7;
    text(c, d.keeper, w / 2, y, Z.tT, '#fff3d4', 800, FONTS.title, 'center'); y += Z.tT * 0.9 + lh * 0.5;
    for (let i = 0; i < lines.length; i++) { text(c, lines[i], w / 2, y, Z.tB, S.say ? GOLD : TXT, 500, FONTS.body, 'center'); y += lh; }
    sideP.im = !!(im && im.complete && im.naturalWidth);
  }
  /** one cell plate of a row: x, y, w, h in the row's canvas */
  function plateCell(c, x, y, w, h, col, dense) {
    chamfer(c, x, y, w, h, px(8)); c.fillStyle = dense ? 'rgba(8,10,24,0.62)' : 'rgba(8,10,24,0.3)'; c.fill();
    c.lineWidth = 1.1; c.strokeStyle = col.rim; c.stroke();
    chamfer(c, x + 2.4, y + 2.4, w - 4.8, h - 4.8, px(7)); c.lineWidth = 0.7; c.strokeStyle = 'rgba(255,255,255,0.08)'; c.stroke();
  }
  function emptyCell(c, x, y, w, h, label, Z) {
    c.setLineDash([px(7), px(6)]); chamfer(c, x + 1, y + 1, w - 2, h - 2, px(8)); c.lineWidth = 1.3; c.strokeStyle = 'rgba(214,224,250,0.5)'; c.stroke(); c.setLineDash([]);
    if (label) text(c, label, x + w / 2, y + h / 2, Z.tB, DIM, 600, FONTS.title, 'center');
  }
  function linesAt(c, lines, x, y, Z, col) { const lh = Z.tB * 1.5; if (lines) for (let i = 0; i < lines.length; i++) text(c, lines[i], x, y + lh * (i + 0.5), Z.tB, col, 500); }
  function bakeRow(i, sl) {
    const Z = sizes(), w = G.lw, h = rowH[i], c = canvasFor(sl, w, G.maxH, G.rs), r = rows[i], lay = LAY[i];
    const cw = cellW(), xL = px(6), xR = G.colW + G.sp + px(6), y = Z.cm / 2, ch = h - Z.cm, T = TX();
    if (S.kind === 'chronicle' && r.kind === 'empty') text(c, T.chronicle?.empty ?? '', w / 2, y + ch / 2, Z.tB, DIM, 600, FONTS.body, 'center');
    else if (S.kind === 'chronicle') {
      const ty = y + Z.cp + Z.tT * 0.6, by = y + Z.cp + Z.tT * 1.4, line = r.kind === 'line' || r.kind === 'sealed';
      for (let k = 0; k < 2; k++) {
        const x = k ? xR : xL, col = k ? NOW : PAST, cell = k ? r.R : r.L, ll = k ? lay.Rl : lay.Ll;
        if (cell) {
          plateCell(c, x, y, cw, ch, col, true);
          const ix = x + Z.cp + (line ? px(8) : 0);
          if (line) { c.fillStyle = COL.gold; c.fillRect(x + px(5), y + px(8), px(2.4), ch - px(16)); }   // a written line: it cannot change
          const f = fitText(cell.title, Z.tT, cw - Z.cp * 2 - px(8), 800, FONTS.title, 0.8); text(c, f.str, ix, ty, f.size, col.title, 800, FONTS.title);
          if (r.kind === 'sealed') text(c, '· · ·', ix, by + Z.tB * 0.75, Z.tB, DIM, 700); else linesAt(c, ll, ix, by, Z, TXT);
        } else if (r.kind === 'blank' && k === 0) emptyCell(c, x, y, cw, ch, T.chronicle?.blank ?? '빈칸', Z);
        else if (r.kind === 'blank') {   // the hint: the chronicle's own gap, said without telling
          plateCell(c, x, y, cw, ch, NOW, false);
          const f = fitText(r.title, Z.tT, cw - Z.cp * 2, 800, FONTS.title, 0.8); text(c, f.str, x + Z.cp, ty, f.size, DIM, 800, FONTS.title);
          linesAt(c, lay.hint, x + Z.cp, by, Z, DIM);
        } else if (r.kind === 'half' && k === 1) { emptyCell(c, x, y, cw, ch, '', Z); if (lay.hint) for (let q = 0; q < lay.hint.length; q++) text(c, lay.hint[q], x + cw / 2, y + ch / 2 + (q - (lay.hint.length - 1) / 2) * Z.tB * 1.5, Z.tB, DIM, 600, FONTS.body, 'center'); }
      }
      if (r.kind === 'pair' || r.kind === 'half') {   // the thin line across the fold: what was left that night -> what it has become tonight
        const x0 = xL + cw, x1 = xR, my = y + ch / 2, mx = (x0 + x1) / 2, q = px(4.6);
        c.lineWidth = 3.4; c.strokeStyle = 'rgba(4,5,14,0.8)'; c.beginPath(); c.moveTo(x0, my); c.lineTo(x1, my); c.stroke();
        c.lineWidth = 1.5; c.strokeStyle = COL.gold; c.beginPath(); c.moveTo(x0, my); c.lineTo(mx, my); c.stroke();
        if (r.kind === 'half') c.setLineDash([px(3), px(4)]); c.beginPath(); c.moveTo(mx, my); c.lineTo(x1, my); c.stroke(); c.setLineDash([]);
        c.beginPath(); c.moveTo(mx, my - q); c.lineTo(mx + q, my); c.lineTo(mx, my + q); c.lineTo(mx - q, my); c.closePath(); c.fillStyle = r.kind === 'pair' ? COL.gold : 'rgba(10,8,20,0.9)'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#fff6d8'; c.stroke();
        if (r.kind === 'pair') { c.beginPath(); c.moveTo(x1 - px(1), my); c.lineTo(x1 - px(7), my - px(3.4)); c.lineTo(x1 - px(7), my + px(3.4)); c.closePath(); c.fillStyle = COL.gold; c.fill(); }
        dot(c, x0, my, px(2.2));
      }
    } else if (S.kind === 'bag') {
      if (r.empty) { text(c, T.bag?.empty ?? '', w / 2, y + ch / 2, Z.tB, DIM, 600, FONTS.body, 'center'); return; }
      for (let k = 0; k < 2; k++) {
        const it = k ? r.R : r.L; if (!it) continue;
        const x = k ? xR : xL, ib = lay.ib;
        plateCell(c, x, y, cw, ch, NOW, true); thing(c, it.icon, x + Z.cp + ib / 2, y + ch / 2, ib, k ? 'gold' : null);
        const tx = x + Z.cp + ib + px(10), f = fitText(it.name, Z.tT, cw - Z.cp * 2 - ib - px(10) - (it.n > 1 ? Z.tT * 2.6 : 0), 800, FONTS.title, 0.8);
        text(c, f.str, tx, y + Z.cp + Z.tT * 0.6, f.size, '#fff3d4', 800, FONTS.title);
        if (it.n > 1) text(c, '×' + it.n, x + cw - Z.cp, y + Z.cp + Z.tT * 0.6, Z.tT, COL.gold, 800, FONTS.body, 'right');
        linesAt(c, k ? lay.Rl : lay.Ll, tx, y + Z.cp + Z.tT * 1.4, Z, DIM);
      }
    } else {   // a good of the shop
      const sel = i === S.sel, st = r.state, ok = st === 'ok', ib = lay.ib, x = px(6), cwS = G.colW - px(12);
      glassPanel(c, x, y, cwS, ch, { cut: px(9), dense: sel ? 0.7 : 0.42, accent: sel ? 'gold' : null, shadow: false });
      if (sel) { chamfer(c, x, y, cwS, ch, px(9)); c.lineWidth = 2; c.strokeStyle = COL.gold; c.stroke(); }
      c.globalAlpha = ok ? 1 : 0.55; thing(c, r.icon, x + Z.cp + ib / 2, y + ch / 2, ib, 'gold'); c.globalAlpha = 1;
      const tx = x + Z.cp + ib + px(12), rx = x + cwS - Z.cp, lh = Z.tB * 1.5;
      const f = fitText(r.name, Z.tT, cwS - Z.cp * 2 - ib - px(12) - lay.pw, 800, FONTS.title, 0.8); text(c, f.str, tx, y + Z.cp + Z.tT * 0.6, f.size, ok ? '#fff3d4' : COL.silverDim, 800, FONTS.title);
      linesAt(c, lay.Ll, tx, y + Z.cp + Z.tT * 1.4, Z, ok ? TXT : DIM);
      const note = sel ? T.shop?.again ?? '' : ok ? (r.have > 0 ? (T.shop?.have ?? '') + ' ' + r.have + (r.limit > 0 ? ' / ' + r.limit : '') : '') : T.shop?.[st] ?? '';
      if (note) { const fn = fitText(note, Z.tB, cwS - Z.cp * 2 - ib - px(12), 700, FONTS.body, 0.8); text(c, fn.str, tx, y + Z.cp + Z.tT * 1.4 + lh * (lay.Ll.length + 0.5), fn.size, sel ? COL.gold : ok ? COL.silverDim : '#ffb0bc', 700); }
      const ps = tsz(17, L.tmin + 4), ih = px(24), pstr = String(r.price), pw = measure(pstr, ps, 800);
      text(c, pstr, rx, y + Z.cp + Z.tT * 0.6 + px(2), ps, st === 'poor' ? '#ff8a9a' : GOLD, 800, FONTS.body, 'right'); sprite(c, 'pouch', rx - pw - px(6) - ih / 2, y + Z.cp + Z.tT * 0.6, ih, ih);
    }
  }
  function dot(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = COL.gold; c.fill(); }
  /** a thing's picture on its small dark plate */
  function thing(c, name, cx, cy, size, tint) {
    chamfer(c, cx - size / 2, cy - size / 2, size, size, px(7)); c.fillStyle = tint === 'gold' ? 'rgba(60,44,14,0.5)' : 'rgba(16,20,46,0.6)'; c.fill(); c.lineWidth = 1; c.strokeStyle = tint === 'gold' ? 'rgba(241,212,138,0.5)' : 'rgba(214,224,250,0.42)'; c.stroke();
    if (hasIcon(name)) { const b = bakeIcon(name, size * 0.8, L.s); c.drawImage(b.c, cx - b.w / 2, cy - b.w / 2, b.w, b.w); } else sprite(c, 'pouch', cx, cy, size * 0.7, size * 0.7);
  }
  function slotFor(i, top, bot) {
    let best = null, far = -1;
    for (let k = 0; k < slots.length; k++) { const sl = slots[k]; if (sl.i < 0) { best = sl; break; } const yy = rowY[sl.i], d = yy + rowH[sl.i] < top ? top - yy - rowH[sl.i] : yy > bot ? yy - bot : 0; if (d > far) { far = d; best = sl; } }
    if (best.i >= 0) slotOf[best.i] = -1;
    best.i = i; slotOf[i] = slots.indexOf(best); bakeRow(i, best);
    return best;
  }

  // ───────────────────────── open / close ─────────────────────────
  function show(kind, o, s) {
    const M = model(); if (!M || !s || s.cross || s.loading || s.message) return false;
    if (kind !== 'chronicle' && kind !== 'bag' && kind !== 'shop') return false;
    if (kind === 'shop' && !M.shop(o?.shop ?? 'rook')) return false;
    S.kind = kind; S.o = o ?? null; S.t = 0; S.outT = 0; S.scroll = 0; S.v = 0; S.sel = -1; S.armT = 0; S.say = ''; S.sayT = 0; S.shakeI = -1; S.epoch = -1; S.keyT = 0; S.still = 0; D.on = false;
    if (kind === 'shop') { const d = M.shop(o?.shop ?? 'rook'); portrait = null; if (d.portrait) { portrait = new Image(); portrait.decoding = 'async'; portrait.src = (env.portraitBase ?? '') + d.portrait + '.webp'; portrait.addEventListener('load', () => { if (S.kind === 'shop') S.epoch = -1; }, { once: true }); } }
    layout(s);
    seenT.fill(0); for (let i = 0; i < N; i++) glow[i] = rows[i] && rows[i].isNew ? 1 : 0;
    if (kind === 'chronicle') { M.opened(); if (o && o.at) for (let i = 0; i < N; i++) if (rows[i].id === o.at) { S.scroll = clamp(rowY[i] - (G.lh - rowH[i]) / 2, 0, S.max); glow[i] = 1; } }
    sound('ui.open');
    return true;
  }
  function close() {
    if (!S.kind) return;
    const o = S.o; S.outKind = S.kind; S.kind = null; S.o = null; S.outT = OUT_T; D.on = false; sound('ui.close');
    try { o?.onClose?.(); } catch (e) { console.error('[v2ui] screen onClose', e); }
  }
  const inRect = (x, y, rx, ry, rw, rh) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
  function rowAt(x, y) { if (!inRect(x, y, G.lx, G.ly, G.lw, G.lh)) return -1; const yy = y - G.ly + S.scroll; for (let i = 0; i < N; i++) if (yy >= rowY[i] && yy < rowY[i] + rowH[i]) return i; return -1; }
  /** a good was pressed (or confirmed by key): the first press chooses it, the second buys */
  function press(i) {
    const M = model(), g = rows[i]; if (!M || !g || S.kind !== 'shop') return;
    if (g.state !== 'ok') { S.sel = -1; S.say = shopD.say[g.state === 'poor' ? 'poor' : g.state === 'full' ? 'full' : 'none'] ?? ''; S.sayT = 2.4; S.shakeI = i; S.shakeT = 0.3; sound('shop.deny'); S.epoch = -1; return; }
    if (S.sel !== i) { S.sel = i; S.armT = 0; sound('ui.move'); S.epoch = -1; return; }
    if (S.armT < 0.12) return;   // (the same press, doubled by a bounce)
    const r = M.buy(shopD.id, g.id);
    S.sel = -1; S.say = r.ok ? shopD.say.bought ?? '' : shopD.say.none ?? ''; S.sayT = 2.4; sound(r.ok ? 'shop.buy' : 'shop.deny'); S.epoch = -1;
    if (r.ok) S.last = g.id;
  }
  function tap(x, y) {
    if (inRect(x, y, G.cx, G.cy, G.cw, G.cw)) { close(); return; }
    if (S.kind === 'shop') { const i = rowAt(x, y); if (i >= 0) press(i); else if (S.sel >= 0) { S.sel = -1; S.epoch = -1; } }
  }

  return {
    get open() { return S.kind; },
    show, close,
    // ───── pointer (logical px), from the HUD's window listeners while a screen is open ─────
    down(x, y, id) {
      if (!S.kind || S.t < 0.05) return;
      D.on = true; D.id = id; D.y0 = y; D.s0 = S.scroll; D.ly = y; D.acc = 0; D.moved = false; D.x = x; D.y = y; S.v = 0;
      D.list = inRect(x, y, G.lx, G.ly, G.lw, G.lh);
    },
    move(x, y, id) {
      if (!D.on || id !== D.id) return;
      if (!D.moved && Math.abs(y - D.y0) > 8 / L.css) D.moved = true;
      if (D.moved && D.list && S.max > 0) { let sc = D.s0 - (y - D.y0); if (sc < 0) sc *= 0.35; else if (sc > S.max) sc = S.max + (sc - S.max) * 0.35; D.acc += S.scroll - sc; S.scroll = sc; }
      D.ly = y;
    },
    up(x, y, id, cancel) {
      if (!D.on || id !== D.id) return; D.on = false;
      if (!D.moved && !cancel && S.kind) tap(D.x, D.y);
    },
    update(dt, s) {
      if (S.outT > 0) S.outT = Math.max(0, S.outT - dt);
      if (!S.kind) return;
      const M = model(); if (!M) { close(); return; }
      if (S.epoch !== L.epoch || S.rev !== M.rev || S.vw !== s.viewW || S.vh !== s.viewH) layout(s);
      S.t += dt; S.armT += dt; S.keyT += dt;
      if (S.sayT > 0 && (S.sayT -= dt) <= 0) { S.say = ''; S.epoch = -1; }
      if (S.shakeT > 0) S.shakeT = Math.max(0, S.shakeT - dt);
      // the list: the finger's speed is measured per tick, the momentum runs on the game's clock
      if (D.on) { if (dt > 0) S.v = S.v * 0.5 - (D.acc / dt) * 0.5; D.acc = 0; }
      else {
        if (S.scroll < 0 || S.scroll > S.max) { const to = S.scroll < 0 ? 0 : S.max; S.scroll += (to - S.scroll) * Math.min(1, dt * 14); S.v = 0; if (Math.abs(to - S.scroll) < 0.4) S.scroll = to; }
        else if (S.v !== 0) { S.scroll += S.v * dt; S.v *= Math.exp(-dt * 4.2); if (Math.abs(S.v) < 6) S.v = 0; if (S.scroll < -px(40)) { S.scroll = -px(40); S.v = 0; } else if (S.scroll > S.max + px(40)) { S.scroll = S.max + px(40); S.v = 0; } }
      }
      // new rows stop glowing once they have been on screen
      const top = S.scroll, bot = S.scroll + G.lh;
      for (let i = 0; i < N; i++) {
        const r = rows[i];
        if (r.isNew) { if (rowY[i] >= top - 2 && rowY[i] + rowH[i] <= bot + 2) { if ((seenT[i] += dt) >= SEEN_T) M.seen(r); } }
        else if (glow[i] > 0) glow[i] = Math.max(0, glow[i] - dt * 1.6);
      }
      // keys and the pad: back closes; up / down scroll (the shop: choose); confirm buys (twice)
      const inp = env.input;
      if (inp && inp.pressed && S.keyT > 0.12) {
        if (inp.pressed('up') || inp.pressed('down')) {
          const d = inp.pressed('down') ? 1 : -1;
          if (S.kind === 'shop') { if (N > 0) { S.sel = S.sel < 0 ? (d > 0 ? 0 : N - 1) : (S.sel + d + N) % N; S.armT = 1; S.epoch = -1; } }
          else S.v = d * px(520);
        } else if (inp.pressed('confirm') || inp.pressed('attack')) { if (S.kind === 'shop' && N > 0) { if (S.sel < 0) { S.sel = 0; S.armT = 0; S.epoch = -1; } else { S.armT = 1; press(S.sel); } } }   // (a key press is one press: choose, then buy)
        else if (inp.pressed('cancel') || inp.pressed('menu')) close();
      }
    },
    draw(ctx, s) {
      const K = S.kind ?? (S.outT > 0 ? S.outKind : null); if (!K) return;
      if (S.kind && (S.epoch !== L.epoch || S.vw !== s.viewW || S.vh !== s.viewH)) layout(s);
      if (!head.c) return;
      const a = S.kind ? clamp(S.t / OPEN_T, 0, 1) : S.outT / OUT_T, rise = S.kind ? (1 - a) * px(10) : 0, vw = s.viewW, vh = s.viewH;
      ctx.globalAlpha = 0.8 * a; ctx.fillStyle = '#04050c'; ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = a;
      const x0 = G.x0, y0 = G.y0 + rise, w = G.x1 - G.x0, h = G.y1 - G.y0;
      // the frame: dark glass, a pale rim, a dark hairline
      chamfer(ctx, x0, y0, w, h, px(16)); ctx.fillStyle = 'rgba(9,11,26,0.93)'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(214,224,250,0.7)'; ctx.stroke();
      chamfer(ctx, x0 + 3, y0 + 3, w - 6, h - 6, px(14)); ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.stroke();
      const two = K !== 'shop', ly = G.ly + rise;
      if (two) {   // the two pages and the fold between them
        const book = K === 'chronicle', py = G.y0 + G.hh + px(4) + rise, ph = G.y1 - px(6) - (G.y0 + G.hh + px(4));
        ctx.fillStyle = book ? PAST.page : NOW.page; ctx.fillRect(G.lx, py, G.colW, ph);
        ctx.fillStyle = NOW.page; ctx.fillRect(G.lx + G.colW + G.sp, py, G.colW, ph);
        const fx = G.lx + G.colW; ctx.fillStyle = 'rgba(2,3,10,0.55)'; ctx.fillRect(fx, py, G.sp, ph);
        ctx.fillStyle = 'rgba(214,224,250,0.22)'; ctx.fillRect(fx, py, 1, ph); ctx.fillRect(fx + G.sp - 1, py, 1, ph);
        ctx.fillStyle = 'rgba(241,212,138,0.35)'; ctx.fillRect(fx + G.sp / 2 - 0.5, py, 1, ph);
      }
      ctx.drawImage(head.c, x0, y0, head.w, head.h);
      if (!two && sideP.c) { if (S.kind && !sideP.im && portrait && portrait.complete && portrait.naturalWidth) bakeSide(sizes()); ctx.drawImage(sideP.c, G.x0 + px(10), G.y0 + G.hh + px(8) + rise, sideP.w, sideP.h); }
      // the rows in the window
      ctx.save(); ctx.beginPath(); ctx.rect(G.lx - 2, ly, G.lw + 4, G.lh); ctx.clip();
      const top = S.scroll, bot = S.scroll + G.lh, rs = G.rs;
      for (let i = 0; i < N; i++) {
        const ry = rowY[i], rh = rowH[i]; if (ry + rh < top || ry > bot) continue;
        let k = slotOf[i]; const sl = k >= 0 ? slots[k] : S.kind ? slotFor(i, top, bot) : null; if (!sl || !sl.c) continue;
        const dx = i === S.shakeI && S.shakeT > 0 ? Math.sin(S.shakeT * 60) * px(4) * (S.shakeT / 0.3) : 0;
        ctx.drawImage(sl.c, 0, 0, sl.c.width, Math.ceil(rh * rs), G.lx + dx, ly + ry - top, G.lw, Math.ceil(rh * rs) / rs);
        const gl = glow[i];
        if (gl > 0.01) {   // a new entry glows until it has been on screen
          const pulse = rows[i].isNew ? 0.55 + 0.45 * Math.sin(S.t * 5) : 1, cm = px(6), gy = ly + ry - top + cm / 2, gh = rh - cm, cw = cellW(), r = rows[i];
          ctx.strokeStyle = COL.gold;
          for (let q = 0; q < 2; q++) {
            if (!(q ? r.R : r.L)) continue; const gx = G.lx + (q ? G.colW + G.sp : 0) + px(6);
            ctx.globalAlpha = a * gl * pulse * 0.28; ctx.lineWidth = px(6); chamfer(ctx, gx, gy, cw, gh, px(8)); ctx.stroke();
            ctx.globalAlpha = a * gl * pulse; ctx.lineWidth = px(1.8); chamfer(ctx, gx, gy, cw, gh, px(8)); ctx.stroke();
          }
          ctx.globalAlpha = a;
        }
      }
      ctx.restore();
      if (S.max > 0) {   // where the window is in the list: a small gold mark on the fold (or at the right edge)
        const mx = two ? G.lx + G.colW + G.sp / 2 : G.x1 - px(7), k = clamp(S.scroll / S.max, 0, 1), th = Math.max(px(26), G.lh * G.lh / total), my = ly + px(4) + (G.lh - px(8) - th) * k;
        ctx.fillStyle = COL.gold; ctx.globalAlpha = a * 0.85; ctx.fillRect(mx - px(1.5), my, px(3), th); ctx.globalAlpha = a;
      }
      // the silver: it stands on the bag and in the shop
      if (K !== 'chronicle') {
        const n = model() ? model().coins() : 0; if (S.kind && n !== S.coinN) bakeCoin(n);
        if (coinP.c) ctx.drawImage(coinP.c, G.cx - px(10) - coinP.w, y0 + (G.hh - coinP.h) / 2 + px(2), coinP.w, coinP.h);
      }
      if (closeP.c) ctx.drawImage(closeP.c, G.cx, G.cy + rise, closeP.w, closeP.h);
      ctx.globalAlpha = 1;
      // rows near the window are baked ahead, one a frame (a fling never meets an unbaked row)
      if (S.kind && !D.on) {
        const t2 = top - G.lh * 0.5, b2 = bot + G.lh * 0.5; let room = false;   // (only into a slot that is free or holds a row outside that margin: the pool never churns)
        for (let k = 0; k < slots.length && !room; k++) { const q = slots[k].i; if (q < 0 || rowY[q] + rowH[q] < t2 || rowY[q] > b2) room = true; }
        if (room) for (let i = 0; i < N; i++) { if (slotOf[i] >= 0) continue; const ry = rowY[i]; if (ry + rowH[i] >= t2 && ry <= b2) { slotFor(i, t2, b2); break; } }
      }
    },
    /** QA: geometry in logical px */
    info() {
      if (!S.kind) return null;
      const vis = []; for (let i = 0; i < N; i++) { const y = G.ly + rowY[i] - S.scroll; vis.push({ i, id: rows[i].id ?? null, kind: rows[i].kind ?? null, state: rows[i].state ?? null, isNew: !!rows[i].isNew, x: G.lx, y, w: G.lw, h: rowH[i], on: y + rowH[i] > G.ly && y < G.ly + G.lh }); }
      return { kind: S.kind, t: S.t, frame: { x: G.x0, y: G.y0, w: G.x1 - G.x0, h: G.y1 - G.y0 }, close: { x: G.cx, y: G.cy, w: G.cw, h: G.cw }, list: { x: G.lx, y: G.ly, w: G.lw, h: G.lh }, colW: G.colW, fold: G.sp, scroll: S.scroll, max: S.max, v: S.v, sel: S.sel, say: S.say, keeper: S.kind === 'shop' && shopD ? shopD.keeper : null, line: S.kind === 'shop' && shopD ? shopD.line : null, side: S.kind === 'shop' && sideP.c ? { x: G.x0 + px(10), y: G.y0 + G.hh + px(8), w: sideP.w, h: sideP.h, bust: !!sideP.im } : null, rows: vis, n: N, last: S.last ?? null,
        coins: coinP.c && S.kind !== 'chronicle' ? { x: G.cx - px(10) - coinP.w, y: G.y0 + (G.hh - coinP.h) / 2 + px(2), w: coinP.w, h: coinP.h, n: S.coinN } : null, baked: slots.filter((q) => q.i >= 0).length, B: G.B };
    },
    release() { for (const p of [head, closeP, coinP, sideP, ...slots]) if (p.c) { p.c.width = 1; p.c.height = 1; p.c = null; } rows = []; N = 0; S.kind = null; },
  };
}
const ZERO = { l: 0, t: 0, r: 0, b: 0 }, EMPTY = [{ id: null, kind: 'empty', L: null, R: null, isNew: false, key: '' }];
