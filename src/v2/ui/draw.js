// v2 interface "cut glass" - shared canvas pieces (docs/v2/UI_API.md).
// Everything here is used at bake time (offscreen canvases) or by the touch pad when a button changes state.
// Nothing in this file runs per frame except sprite(), which is one drawImage.
import { SPRITES } from './atlas_map.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const FONTS = {
  body: '"Noto Sans KR", "Noto Sans KR Ext", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  title: '"Hahmlet", "Hahmlet Ext", serif',
  brush: '"BN Brush", "Hahmlet", "Hahmlet Ext", serif',
  num: '"BN Num", "Cinzel", "Noto Sans KR", sans-serif',
};
export const COL = {
  silver: '#eef2ff', silverDim: 'rgba(196,206,235,0.82)', ink: 'rgba(7,9,20,0.9)', ruby: '#e2364e', rubyDeep: '#8e1226',
  gold: '#f1d48a', goldDeep: '#b98a3a', ice: '#bfe6ff',
};

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ───────────── atlas ─────────────
/** One image for every icon. `img` stays null until it has decoded; draw calls before that do nothing. */
export const atlas = { img: null, ready: false, failed: false, url: '', waiters: [] };
export function loadAtlas(base) {
  if (atlas.url) return;
  atlas.url = base + 'atlas.webp';
  const im = new Image();
  im.decoding = 'async';
  im.onload = () => { atlas.img = im; atlas.ready = true; for (const f of atlas.waiters.splice(0)) { try { f(); } catch (e) { console.error(e); } } };
  im.onerror = () => { atlas.failed = true; console.warn('[v2ui] icon atlas failed to load: ' + atlas.url); };
  im.src = atlas.url;
}
export function onAtlas(fn) { if (atlas.ready) fn(); else atlas.waiters.push(fn); }
export const hasSprite = (name) => !!SPRITES[name];
/** Draw sprite `name` fitted inside the box (cx, cy, w, h), keeping its aspect. One drawImage. */
export function sprite(ctx, name, cx, cy, w, h) {
  const r = SPRITES[name]; if (!r || !atlas.img) return;
  const k = Math.min(w / r[2], h / r[3]), dw = r[2] * k, dh = r[3] * k;
  ctx.drawImage(atlas.img, r[0], r[1], r[2], r[3], cx - dw / 2, cy - dh / 2, dw, dh);
}
/** Same, anchored at the bottom centre (candles, cells), with a source crop from the bottom (frac 0..1). */
export function spriteUp(ctx, name, cx, by, h, frac = 1) {
  const r = SPRITES[name]; if (!r || !atlas.img) return;
  const k = h / r[3], dw = r[2] * k, sh = r[3] * frac;
  ctx.drawImage(atlas.img, r[0], r[1] + r[3] - sh, r[2], sh, cx - dw / 2, by - h * frac, dw, h * frac);
}
export const spriteAspect = (name) => { const r = SPRITES[name]; return r ? r[2] / r[3] : 1; };

// ───────────── shapes ─────────────
/** Rectangle with cut corners (the signature shape of every panel). */
export function chamfer(ctx, x, y, w, h, c) {
  c = Math.min(c, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
}

function rimGradient(ctx, x0, y0, x1, y1, a = 1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, `rgba(246,249,255,${0.92 * a})`); g.addColorStop(0.3, `rgba(150,166,210,${0.55 * a})`);
  g.addColorStop(0.55, `rgba(236,242,255,${0.8 * a})`); g.addColorStop(0.8, `rgba(104,118,164,${0.55 * a})`);
  g.addColorStop(1, `rgba(214,224,250,${0.75 * a})`);
  return g;
}

/**
 * Glass panel with cut corners, drawn into ctx in the current units.
 * o: { cut, top, bot (body colours), dense (0..1 extra darkness for text panels), accent ('ruby'|'gold'|null), shadow }
 */
export function glassPanel(ctx, x, y, w, h, o = {}) {
  const c = o.cut ?? 8, dense = o.dense ?? 0;
  if (o.shadow !== false) {   // soft outer shade, then punched out so it does not darken the glass itself
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    chamfer(ctx, x, y, w, h, c); ctx.fillStyle = '#000'; ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; chamfer(ctx, x, y, w, h, c); ctx.fill(); ctx.restore();
  }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, o.top ?? `rgba(24,28,52,${0.26 + dense * 0.4})`);
  g.addColorStop(1, o.bot ?? `rgba(7,8,20,${0.42 + dense * 0.42})`);
  chamfer(ctx, x, y, w, h, c); ctx.fillStyle = g; ctx.fill();
  ctx.save();
  chamfer(ctx, x, y, w, h, c); ctx.clip();
  const hl = ctx.createLinearGradient(0, y, 0, y + Math.min(h * 0.55, 30));
  hl.addColorStop(0, 'rgba(255,255,255,0.17)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.fillRect(x, y, w, Math.min(h * 0.55, 30));
  if (o.accent) {   // a breath of colour from below
    const ag = ctx.createLinearGradient(0, y + h, 0, y + h * 0.35);
    ag.addColorStop(0, o.accent === 'ruby' ? 'rgba(190,30,56,0.30)' : 'rgba(220,170,80,0.24)'); ag.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ag; ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  // bevel: one inner line, then the bright cut rim, then a dark hairline outside
  chamfer(ctx, x + 2.6, y + 2.6, w - 5.2, h - 5.2, Math.max(1, c - 1.6)); ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,0.11)'; ctx.stroke();
  chamfer(ctx, x, y, w, h, c); ctx.lineWidth = 1.3; ctx.strokeStyle = rimGradient(ctx, x, y, x + w, y + h); ctx.stroke();
  chamfer(ctx, x - 1, y - 1, w + 2, h + 2, c + 0.6); ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(2,3,10,0.55)'; ctx.stroke();
}

function conic(ctx, cx, cy, start) {
  if (typeof ctx.createConicGradient !== 'function') return null;
  const g = ctx.createConicGradient(start, cx, cy);
  const S = ['#ffffff', '#8492bd', '#e9eeff', '#5d6a94', '#f7f9ff', '#93a1cb', '#dfe6fb', '#566289', '#ffffff'];
  for (let i = 0; i < S.length; i++) g.addColorStop(i / (S.length - 1), S[i]);
  return g;
}

/**
 * Round cut-glass button plate. Clear in the middle (the scene shows through), darker toward the rim, a fine faceted
 * silver rim, a soft inner highlight on top. o: { pressed, held, disabled, tint: 'ruby'|'gold'|null, facets }
 */
export function gem(ctx, cx, cy, r, o = {}) {
  const dis = !!o.disabled, pr = !!o.pressed;
  // outer shade ring (separates the glass from a bright scene)
  let g = ctx.createRadialGradient(cx, cy + 1, r * 0.92, cx, cy + 1, r + 7);
  g.addColorStop(0, 'rgba(0,0,0,0.34)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy + 1, r + 7, 0, TAU); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  ctx.clearRect(cx - r - 1, cy - r - 1, 2 * r + 2, 2 * r + 2);
  // body: clear centre, denser edge
  g = ctx.createRadialGradient(cx, cy + r * 0.08, r * 0.1, cx, cy, r);
  if (o.tint === 'ruby') { g.addColorStop(0, 'rgba(70,10,26,0.20)'); g.addColorStop(0.72, 'rgba(60,8,22,0.34)'); g.addColorStop(1, 'rgba(26,3,12,0.60)'); }
  else { g.addColorStop(0, 'rgba(16,20,44,0.17)'); g.addColorStop(0.72, 'rgba(10,12,30,0.30)'); g.addColorStop(1, 'rgba(4,5,16,0.56)'); }
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  // facets of the cut: a ring of short radial lines and a faint inner polygon
  const n = o.facets ?? (r > 36 ? 16 : 12);
  ctx.lineWidth = Math.max(0.6, r * 0.014); ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.26, a2 = ((i + 1) / n) * TAU + 0.26;
    ctx.moveTo(cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.moveTo(cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84); ctx.lineTo(cx + Math.cos(a2) * r * 0.84, cy + Math.sin(a2) * r * 0.84);
  }
  ctx.stroke();
  // soft inner highlight on top + a small caustic at the bottom
  g = ctx.createRadialGradient(cx, cy - r * 0.95, r * 0.05, cx, cy - r * 0.7, r * 1.05);
  g.addColorStop(0, 'rgba(255,255,255,0.30)'); g.addColorStop(0.55, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, r * 1.25);
  g = ctx.createRadialGradient(cx, cy + r * 1.05, r * 0.05, cx, cy + r * 1.05, r * 0.62);
  g.addColorStop(0, o.tint === 'ruby' ? 'rgba(255,90,110,0.30)' : 'rgba(170,205,255,0.20)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy + r * 0.3, 2 * r, r * 0.7);
  if (pr) {   // pressed: the glass lights up from inside
    g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, o.tint === 'ruby' ? 'rgba(255,150,165,0.42)' : 'rgba(200,225,255,0.40)'); g.addColorStop(0.7, 'rgba(160,190,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  ctx.restore();
  // rim: faceted silver ring + hairlines
  const lw = Math.max(1.6, r * 0.058);
  ctx.globalAlpha = dis ? 0.45 : 1;
  ctx.beginPath(); ctx.arc(cx, cy, r - lw / 2, 0, TAU); ctx.lineWidth = lw;
  ctx.strokeStyle = conic(ctx, cx, cy, -2.2) ?? rimGradient(ctx, cx - r, cy - r, cx + r, cy + r); ctx.stroke();
  if (o.tint === 'ruby') { ctx.globalAlpha = dis ? 0.2 : 0.5; ctx.strokeStyle = '#ff5a72'; ctx.lineWidth = lw * 0.45; ctx.beginPath(); ctx.arc(cx, cy, r - lw * 1.45, 0, TAU); ctx.stroke(); ctx.globalAlpha = dis ? 0.45 : 1; }
  if (pr || o.held) { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.arc(cx, cy, r - lw / 2, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r - lw - 0.6, 0, TAU); ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r + 0.5, 0, TAU); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(2,3,10,0.6)'; ctx.stroke();
}

/** Small name plate (cut corners) with a text label centred at (cx, cy). Returns its width. */
export function plate(ctx, text, cx, cy, size, o = {}) {
  ctx.font = `${o.weight ?? 700} ${size}px ${o.family ?? FONTS.body}`;
  const tw = ctx.measureText(text).width, w = tw + size * 1.1, h = size * 1.5;
  const x = cx - w / 2, y = cy - h / 2;
  chamfer(ctx, x, y, w, h, h * 0.3);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(26,30,54,0.80)'); g.addColorStop(1, 'rgba(6,7,18,0.86)');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = o.rim ?? 'rgba(214,224,250,0.62)'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = o.color ?? COL.silver; ctx.globalAlpha = o.alpha ?? 1;
  ctx.fillText(text, cx, cy + size * 0.06);
  ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  return w;
}
export function plateWidth(ctx, text, size, weight = 700, family = FONTS.body) {
  ctx.font = `${weight} ${size}px ${family}`;
  return ctx.measureText(text).width + size * 1.1;
}

// ───────────── baked text ─────────────
const meas = makeCanvas(4, 4).getContext('2d');
/**
 * Bake one line of text into its own canvas (s = device px per logical px). Returned object is reused by the caller:
 * { c, w, h } in logical px; draw with drawImage(c, x - w/2, y - h/2, w, h).
 * o: { size, family, weight, fill (colour or [top, bottom]), stroke, lw, glow (colour), glowBlur, swoosh (colour) }
 */
export function bakeText(str, s, o, into) {
  const size = o.size, fam = o.family ?? FONTS.body, wt = o.weight ?? 700, lw = o.lw ?? 0;
  const font = `${wt} ${size}px ${fam}`;
  meas.font = font;
  const tw = Math.max(1, meas.measureText(str).width), pad = lw + (o.glow ? (o.glowBlur ?? 6) : 0) + 3;
  const w = tw + pad * 2 + size * 0.3, h = size * 1.5 + pad * 2;
  const out = into ?? { c: null, w: 0, h: 0 };
  const cw = Math.ceil(w * s), ch = Math.ceil(h * s);
  if (!out.c) out.c = makeCanvas(cw, ch); else if (out.c.width !== cw || out.c.height !== ch) { out.c.width = cw; out.c.height = ch; }
  out.w = w; out.h = h;
  const ctx = out.c.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cw, ch); ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const cx = w / 2, cy = h / 2 + size * 0.04;
  if (o.swoosh) {   // one dry brush stroke under the word
    const g = ctx.createLinearGradient(cx - tw * 0.6, 0, cx + tw * 0.6, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.15, o.swoosh); g.addColorStop(0.8, o.swoosh); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(cx - tw * 0.6, cy + size * 0.42);
    ctx.quadraticCurveTo(cx, cy + size * 0.28, cx + tw * 0.62, cy + size * 0.36);
    ctx.quadraticCurveTo(cx, cy + size * 0.5, cx - tw * 0.6, cy + size * 0.42); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (o.glow) { ctx.save(); ctx.shadowColor = o.glow; ctx.shadowBlur = (o.glowBlur ?? 6) * s; ctx.fillStyle = o.glow; ctx.fillText(str, cx, cy); ctx.restore(); }
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = o.stroke ?? COL.ink; ctx.strokeText(str, cx, cy); }
  if (Array.isArray(o.fill)) {
    const g = ctx.createLinearGradient(0, cy - size * 0.55, 0, cy + size * 0.55);
    g.addColorStop(0, o.fill[0]); g.addColorStop(1, o.fill[1]); ctx.fillStyle = g;
  } else ctx.fillStyle = o.fill ?? COL.silver;
  ctx.fillText(str, cx, cy);
  ctx.textBaseline = 'alphabetic';
  return out;
}
export function measure(str, size, weight = 700, family = FONTS.body) { meas.font = `${weight} ${size}px ${family}`; return meas.measureText(str).width; }
/** Wrap text into lines no wider than maxW (Korean: breaks at spaces first, then between characters). */
export function wrapLines(str, maxW, size, weight = 500, family = FONTS.body) {
  meas.font = `${weight} ${size}px ${family}`;
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const w of para.split(/(\s+)/)) {
      if (meas.measureText(line + w).width <= maxW) { line += w; continue; }
      if (line.trim()) out.push(line.trimEnd());
      line = w.trimStart();
      while (meas.measureText(line).width > maxW && line.length > 1) {
        let k = line.length; while (k > 1 && meas.measureText(line.slice(0, k)).width > maxW) k--;
        out.push(line.slice(0, k)); line = line.slice(k);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
