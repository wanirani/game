// Painted enemy kit — runtime for Kling-painted regular enemies (docs/art/ENEMY_PIPELINE.md).
//
// Tiers
//   T1 'painted sprite + procedural deformation'  (bats, ghosts, heads, wisps …): 1–3 painted pieces, squash/stretch, bob,
//      tilt, mesh-free slice warps (displacement strips / bending chains), lunges, hit squash, strip-dissolve death.
//   T2 'mini puppet' (walkers, humanoids): 6–10 parts on a small FK skeleton driven by the enemy's own animation fields
//      (anim/animT/state/stateT/vx/vy/onGround/flashT/stun/dying/params), death collapse via world.fx.ghost corpses.
//   T3 'large puppet' (elites, big walkers): T2 + damage variants (by HP), bigger textures, richer VFX (boss-kit tech).
//
// Everything expensive happens once per enemy TYPE at load: parts are cut from one source atlas (webp), resampled to the
// device texel density, then baked into ONE runtime atlas canvas per type with the variants each part needs
// (outlined base, white flash silhouette, darkened 'deep' for far limbs, colour 'glow' silhouette, damage levels).
// Per frame a part is one setTransform + one drawImage from that atlas (Skia batches consecutive draws of one texture).
//
// Rules (boss-prototype lessons): visuals never touch gameplay Math.random (render RNG below); bake behind the room's
// fade (preload by stage roster); bilinear 'low' smoothing; memory budget ≈ 0.3–1.5 MB per enemy type.
import { clamp, lerp, TAU } from '../../core/math.js';
import { game } from '../../core/game.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SEAM ─ shared painted-kit primitives. The boss core agent owns src/render/painted/kit.js; the functions in this block
// mirror its bake helpers (outline / silhouette / darken / damage / render RNG). If kit.js exports the same names they
// can be swapped for `import { … } from './kit.js'` without touching the enemy renderers (they only use the API below).
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
/** render-only RNG (xorshift32): visuals must never consume gameplay Math.random */
let _rs = 0x9e3779b9;
export function fr() { _rs ^= _rs << 13; _rs >>>= 0; _rs ^= _rs >> 17; _rs ^= _rs << 5; _rs >>>= 0; return _rs / 4294967296; }
export const frand = (a, b) => a + (b - a) * fr();
/** stable hash 0..1 */
export function h1(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
/** seeded rng (bake-time) */
export function srng(seed) { let s = (Math.imul(seed | 0, 2654435761) ^ 0x2545f491) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function silhouette(src, color) {
  const c = mkCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
/** thin dark outline (readability over painted backgrounds). r in texels */
export function withOutline(img, r, color = 'rgba(8,4,8,0.92)') {
  const c = mkCanvas(img.width, img.height), g = c.getContext('2d');
  if (r > 0.2) {
    const sil = silhouette(img, color), n = r > 1.4 ? 12 : 8;
    for (let i = 0; i < n; i++) { const a = i / n * TAU; g.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); }
  }
  g.drawImage(img, 0, 0);
  return c;
}
export function darken(src, k, tint = null) {
  const c = mkCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = tint ?? `rgb(${k * 255 | 0},${k * 255 | 0},${k * 255 | 0})`; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  return c;
}
/** procedural wear for T3 damage states: soot/char blotches, scratches/cracks, torn edge nicks (all clipped to alpha) */
export function damageVariant(src, level, seed, o = {}) {
  const w = src.width, h = src.height, c = mkCanvas(w, h), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const R = srng(seed * 7919 + level * 131), data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : data[((y | 0) * w + (x | 0)) * 4 + 3];
  const pick = (pred) => { for (let t = 0; t < 300; t++) { const x = R() * w, y = R() * h; if (A(x, y) > 200 && (!pred || pred(x, y))) return [x, y]; } return null; };
  const sc = Math.sqrt(w * h) / 120;
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < (o.char ?? 3) * level; i++) {
    const p = pick(); if (!p) break;
    const r = (6 + R() * 12) * sc, gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    gr.addColorStop(0, `rgba(${o.charCol ?? '20,10,6'},0.75)`); gr.addColorStop(1, `rgba(${o.charCol ?? '20,10,6'},0)`);
    g.fillStyle = gr; g.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < (o.cracks ?? 2) * level; i++) {
    const p = pick(); if (!p) break;
    let [x, y] = p, a = R() * TAU; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 7; s++) { a += (R() - 0.5) * 1.2; x += Math.cos(a) * 3 * sc; y += Math.sin(a) * 3 * sc; g.lineTo(x, y); }
    g.strokeStyle = 'rgba(14,8,6,0.85)'; g.lineWidth = Math.max(0.8, 0.9 * sc); g.stroke();
    if (o.crackGlow) { g.strokeStyle = o.crackGlow; g.lineWidth = Math.max(0.5, 0.4 * sc); g.stroke(); }
  }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < (o.nicks ?? 2) * level; i++) {
    const p = pick((x, y) => A(x + 4 * sc, y) < 30 || A(x - 4 * sc, y) < 30 || A(x, y + 4 * sc) < 30); if (!p) continue;
    const r = (1.5 + R() * 3) * sc; g.beginPath();
    for (let j = 0; j < 7; j++) { const aa = j / 7 * TAU, rr = r * (0.5 + R() * 0.8); j ? g.lineTo(p[0] + Math.cos(aa) * rr, p[1] + Math.sin(aa) * rr) : g.moveTo(p[0] + Math.cos(aa) * rr, p[1] + Math.sin(aa) * rr); }
    g.closePath(); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════ /SEAM ═══

const PAD = 3;               // texels around every baked part (outline room + bilinear bleed)
export const stats = { rigs: 0, bakeMs: 0, bytes: 0 };

/** texel density (device px per logical px) the runtime atlas is baked at */
function chooseTD(srcTD) {
  const s = game?.scale || 2;
  return clamp(Math.round(s * 1.2 * 4) / 4, 1.25, Math.min(srcTD, 2.75));
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + src)); i.src = src; });
}

/** shelf packer for the runtime atlas */
function pack(items, maxW = 1024) {
  items.sort((a, b) => b.c.height - a.c.height);
  let x = 0, y = 0, rowH = 0, W = 0;
  for (const it of items) {
    const w = it.c.width, h = it.c.height;
    if (x + w > maxW) { x = 0; y += rowH + 1; rowH = 0; }
    it.x = x; it.y = y; x += w + 1; rowH = Math.max(rowH, h); W = Math.max(W, x);
  }
  return { w: W, h: y + rowH };
}

// ─────────────────────────────────────────── rigs (one per enemy type) ───────────────────────────────────────────
const RIGS = new Map();   // key -> rig
/**
 * spec = { src:'skeleton', bake:{ outline:0.55 (logical px), deep:{part:k}, glow:{part:'#hex'}, flash:true|[parts],
 *          damage:{ part:{cracks,char,nicks,crackGlow} } } }
 */
export function requestRig(spec) {
  let rig = RIGS.get(spec.src);
  if (rig) return rig;
  rig = { src: spec.src, ready: false, failed: false, parts: {}, atlas: null, td: 1, promise: null };
  RIGS.set(spec.src, rig);
  rig.promise = buildRig(rig, spec).catch((err) => { rig.failed = true; console.warn('[painted enemy]', spec.src, err?.message ?? err); });
  return rig;
}
export const rigReady = (spec) => { const r = requestRig(spec); return r.ready ? r : null; };

async function buildRig(rig, spec) {
  const base = `assets/painted/enemies/${spec.src}/`;
  const man = await (await fetch(base + 'rig.json')).json();
  const img = await loadImg(base + (man.atlas ?? 'atlas.webp') + (man.v ? `?v=${man.v}` : ''));
  if (img.decode) await img.decode().catch(() => {});
  const t0 = performance.now();
  const srcTD = man.srcTD ?? 3, td = chooseTD(srcTD), f = td / srcTD;
  const B = spec.bake ?? {}, olr = (B.outline ?? 0.5) * td;
  const items = [];
  for (const [name, p] of Object.entries(man.parts)) {
    const [rx, ry, rw, rh] = p.rect;
    const w = Math.ceil(rw * f) + PAD * 2, h = Math.ceil(rh * f) + PAD * 2;
    const raw = mkCanvas(w, h), g = raw.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, rx, ry, rw, rh, PAD, PAD, rw * f, rh * f);
    const part = { name, w, h, v: {}, piv: {}, meta: p.meta ?? {} };
    for (const [k, q] of Object.entries(p.piv ?? {})) part.piv[k] = [q[0] * f + PAD, q[1] * f + PAD];
    if (part.piv.a && part.piv.b) {
      const dx = part.piv.b[0] - part.piv.a[0], dy = part.piv.b[1] - part.piv.a[1];
      part.ang = Math.atan2(dy, dx);           // intrinsic a→b direction in texel space
      part.len = Math.hypot(dx, dy) / td;      // logical px
    }
    const olK = B.outlineParts?.[name] ?? 1;
    const baseC = withOutline(raw, olr * olK);
    const vars = { base: baseC };
    if (B.flash !== false && (!Array.isArray(B.flash) || B.flash.includes(name))) vars.flash = silhouette(baseC, B.flashColor ?? '#fff4ec');
    const dk = B.deep?.[name] ?? B.deep?.['*'];
    if (dk) vars.deep = darken(baseC, dk, B.deepTint);
    const gl = B.glow?.[name] ?? B.glow?.['*'];
    if (gl) vars.glow = silhouette(raw, gl);
    const dmg = B.damage?.[name] ?? B.damage?.['*'];
    if (dmg) {
      for (const L of [1, 2]) {
        const d = withOutline(damageVariant(raw, L, name.length * 31 + L, dmg), olr * olK);
        vars['dmg' + L] = d;
        if (dk) vars['deep_dmg' + L] = darken(d, dk, B.deepTint);
      }
    }
    for (const [k, c] of Object.entries(vars)) items.push({ part, k, c });
    rig.parts[name] = part;
  }
  const { w, h } = pack(items, 1024);
  const atlas = mkCanvas(w, h), ag = atlas.getContext('2d');
  for (const it of items) { ag.drawImage(it.c, it.x, it.y); it.part.v[it.k] = [it.x, it.y, it.c.width, it.c.height]; it.c.width = it.c.height = 0; }
  rig.atlas = atlas; rig.td = td; rig.srcTD = srcTD; rig.man = man;
  rig.bytes = w * h * 4;
  rig.bakeMs = performance.now() - t0;
  stats.rigs++; stats.bakeMs += rig.bakeMs; stats.bytes += rig.bytes;
  rig.ready = true;
  return rig;
}
export function rigStats() {
  const out = {};
  for (const [k, r] of RIGS) out[k] = { ready: r.ready, failed: r.failed, td: r.td, atlas: r.atlas ? `${r.atlas.width}x${r.atlas.height}` : null, MB: +(r.bytes / 1048576 || 0).toFixed(3), bakeMs: +(r.bakeMs ?? 0).toFixed(1) };
  return out;
}

// ─────────────────────────────────────────── drawing ───────────────────────────────────────────
// Base matrix captured at the start of an enemy draw (camera · feet translate · facing flip · elite/bestiary scale).
const M = new Float64Array(6);
let CTX = null, RIG = null, FLASH = 0, VK = '';
/** begin drawing parts of `rig`; flash 0..1 overlays the white silhouette; vk = variant prefix ('' | 'deep_' handled per call) */
export function begin(ctx, rig, flash = 0) {
  const t = ctx.getTransform();
  M[0] = t.a; M[1] = t.b; M[2] = t.c; M[3] = t.d; M[4] = t.e; M[5] = t.f;
  CTX = ctx; RIG = rig; FLASH = flash;
  ctx.imageSmoothingQuality = 'low';
}
export function end() { if (CTX) CTX.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); CTX = null; RIG = null; }
/** restore the captured base transform (e.g. before procedural VFX in local space) */
export function local() { CTX.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); }
export const part = (name) => RIG.parts[name];

/** set the transform so that texel point (px,py) of the part lands on local (x,y), rotated by rot, scaled by sx,sy */
function setT(px, py, x, y, rot, sx, sy) {
  const k = 1 / RIG.td, c = Math.cos(rot), s = Math.sin(rot);
  const a = c * sx * k, b = s * sx * k, cc = -s * sy * k, d = c * sy * k;
  const e = x - (a * px + cc * py), f = y - (b * px + d * py);
  CTX.setTransform(M[0] * a + M[2] * b, M[1] * a + M[3] * b, M[0] * cc + M[2] * d, M[1] * cc + M[3] * d, M[0] * e + M[2] * f + M[4], M[1] * e + M[3] * f + M[5]);
}
function blit(v, alpha) {
  const ctx = CTX;
  if (alpha !== 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha; ctx.drawImage(RIG.atlas, v[0], v[1], v[2], v[3], 0, 0, v[2], v[3]); ctx.globalAlpha = ga; }
  else ctx.drawImage(RIG.atlas, v[0], v[1], v[2], v[3], 0, 0, v[2], v[3]);
}
function variantOf(p, vn) { return p.v[vn] ?? p.v[vn.replace(/^deep_/, '')] ?? p.v.base; }
/**
 * draw part `name` with pivot `pv` ('a' | pivot name | [x,y] texels) at local (x,y).
 * rot = rotation added to the painted orientation (radians), sx/sy = scale (negative = mirror), vn = variant name.
 */
export function put(name, pv, x, y, rot = 0, sx = 1, sy = 1, alpha = 1, vn = 'base') {
  const p = RIG.parts[name];
  if (!p || alpha <= 0.003) return;
  const q = typeof pv === 'string' ? (p.piv[pv] ?? [p.w / 2, p.h / 2]) : pv;
  setT(q[0], q[1], x, y, rot, sx, sy);
  blit(variantOf(p, vn), alpha);
  if (FLASH > 0 && p.v.flash) blit(p.v.flash, alpha * FLASH);
}
/**
 * limb helper: put part so its a→b axis points along angle `dir` (world radians, 0 = +x, π/2 = down) with pivot a at (x,y).
 * s = uniform scale, stretch = extra scale along the bone. Returns the logical position of pivot b.
 */
const _pb = [0, 0];
export function bone(name, x, y, dir, s = 1, vn = 'base', alpha = 1, stretch = 1, flipY = false) {
  const p = RIG.parts[name];
  if (!p) { _pb[0] = x; _pb[1] = y; return _pb; }
  const rot = dir - p.ang;
  // stretch along the a→b axis: express as scale in the part frame (only exact for axis-aligned parts; fine for |stretch-1|<0.2)
  const ax = Math.abs(Math.cos(p.ang)), sx = s * lerp(1, stretch, ax), sy = s * lerp(1, stretch, 1 - ax) * (flipY ? -1 : 1);
  put(name, 'a', x, y, rot, sx, sy, alpha, vn);
  const L = p.len * s * stretch;
  _pb[0] = x + Math.cos(dir) * L; _pb[1] = y + Math.sin(dir) * L;
  return _pb;
}
/** local position of pivot `pn` of a part placed with put(name, pv, x, y, rot, sx, sy) */
export function pivotPos(name, pv, pn, x, y, rot = 0, sx = 1, sy = 1, out = [0, 0]) {
  const p = RIG.parts[name], k = 1 / RIG.td;
  const q = typeof pv === 'string' ? p.piv[pv] : pv, r = p.piv[pn];
  if (!p || !q || !r) { out[0] = x; out[1] = y; return out; }
  const lx = (r[0] - q[0]) * sx * k, ly = (r[1] - q[1]) * sy * k, c = Math.cos(rot), s = Math.sin(rot);
  out[0] = x + c * lx - s * ly; out[1] = y + s * lx + c * ly;
  return out;
}

/**
 * displacement-strip warp (mesh-free): the part is cut into n strips along its texel X (axis 'x') or Y (axis 'y');
 * strip i (u = 0 at pivot side … 1 far side) is shifted by off(u, i) → [dx, dy] in TEXELS of the part frame.
 * Used for cloth/ectoplasm ripples, capes, coat tails. Strips overlap by 1 texel to hide seams.
 */
export function strips(name, pv, x, y, rot, sx, sy, n, axis, off, alpha = 1, vn = 'base') {
  const p = RIG.parts[name];
  if (!p || alpha <= 0.003) return;
  const q = typeof pv === 'string' ? (p.piv[pv] ?? [p.w / 2, p.h / 2]) : pv;
  const v = variantOf(p, vn), fv = FLASH > 0 ? p.v.flash : null;
  const k = 1 / RIG.td, c = Math.cos(rot), s = Math.sin(rot);
  const a = c * sx * k, b = s * sx * k, cc = -s * sy * k, d = c * sy * k;
  const e0 = x - (a * q[0] + cc * q[1]), f0 = y - (b * q[0] + d * q[1]);
  const ctx = CTX, ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * alpha;
  const L = axis === 'y' ? v[3] : v[2], step = L / n;
  const pivU = axis === 'y' ? q[1] / L : q[0] / L;           // strips are ordered from the pivot side
  for (let i = 0; i < n; i++) {
    const t0 = Math.floor(i * step), t1 = Math.min(L, Math.ceil((i + 1) * step) + 1);
    const um = (t0 + t1) / 2 / L, u = Math.abs(um - pivU) / Math.max(pivU, 1 - pivU);
    const o = off(u, i);
    const e = e0 + a * o[0] + cc * o[1], f = f0 + b * o[0] + d * o[1];
    ctx.setTransform(M[0] * a + M[2] * b, M[1] * a + M[3] * b, M[0] * cc + M[2] * d, M[1] * cc + M[3] * d, M[0] * e + M[2] * f + M[4], M[1] * e + M[3] * f + M[5]);
    if (axis === 'y') {
      ctx.drawImage(RIG.atlas, v[0], v[1] + t0, v[2], t1 - t0, 0, t0, v[2], t1 - t0);
      if (fv) { ctx.globalAlpha = ga * alpha * FLASH; ctx.drawImage(RIG.atlas, fv[0], fv[1] + t0, fv[2], t1 - t0, 0, t0, fv[2], t1 - t0); ctx.globalAlpha = ga * alpha; }
    } else {
      ctx.drawImage(RIG.atlas, v[0] + t0, v[1], t1 - t0, v[3], t0, 0, t1 - t0, v[3]);
      if (fv) { ctx.globalAlpha = ga * alpha * FLASH; ctx.drawImage(RIG.atlas, fv[0] + t0, fv[1], t1 - t0, fv[3], t0, 0, t1 - t0, fv[3]); ctx.globalAlpha = ga * alpha; }
    }
  }
  ctx.globalAlpha = ga;
}
/**
 * bending-chain warp (mesh-free): strips along texel X starting at pivot `a` towards pivot `b`; strip i is rotated by
 * the cumulative bend(u) (radians) about the end of the previous strip → wings curl, tails whip, tentacles sway.
 * The first strip is placed like bone(): pivot a at (x,y), axis along `dir`.
 */
export function chain(name, x, y, dir, s, n, bend, alpha = 1, vn = 'base', flipY = false, sy2 = 1) {
  const p = RIG.parts[name];
  if (!p || !p.piv.a || !p.piv.b || alpha <= 0.003) return;
  const v = variantOf(p, vn), fv = FLASH > 0 ? p.v.flash : null;
  const A = p.piv.a, sgn = p.piv.b[0] >= A[0] ? 1 : -1;
  const k = s / RIG.td, ctx = CTX, ga = ctx.globalAlpha, syf = sy2 * (flipY ? -1 : 1);
  ctx.globalAlpha = ga * alpha;
  // texel columns from A.x to the far edge in direction sgn; a painted tip pointing left is mirrored (not rotated) so the
  // part keeps its up side up. The stub behind the pivot is drawn with the first strip.
  const span = sgn > 0 ? v[2] - A[0] : A[0], step = span / n;
  let jx = x, jy = y, cum = 0;
  for (let i = 0; i < n; i++) {
    cum += bend(i / n, i);
    const rot = dir + cum, c = Math.cos(rot), sn = Math.sin(rot);
    const a = c * k * sgn, b = sn * k * sgn, cc = -sn * k * syf, d = c * k * syf;
    const ci = A[0] + sgn * i * step, cn = A[0] + sgn * (i + 1) * step;
    let s0, s1;
    if (sgn > 0) { s0 = i === 0 ? 0 : Math.floor(ci); s1 = Math.min(v[2], Math.ceil(cn) + 1); }
    else { s0 = Math.max(0, Math.floor(cn) - 1); s1 = i === 0 ? v[2] : Math.ceil(ci); }
    const w = s1 - s0;
    if (w > 0) {
      const e = jx - (a * ci + cc * A[1]), f = jy - (b * ci + d * A[1]);
      ctx.setTransform(M[0] * a + M[2] * b, M[1] * a + M[3] * b, M[0] * cc + M[2] * d, M[1] * cc + M[3] * d, M[0] * e + M[2] * f + M[4], M[1] * e + M[3] * f + M[5]);
      ctx.drawImage(RIG.atlas, v[0] + s0, v[1], w, v[3], s0, 0, w, v[3]);
      if (fv) { ctx.globalAlpha = ga * alpha * FLASH; ctx.drawImage(RIG.atlas, fv[0] + s0, fv[1], w, fv[3], s0, 0, w, fv[3]); ctx.globalAlpha = ga * alpha; }
    }
    jx += c * step * k; jy += sn * step * k;
  }
  ctx.globalAlpha = ga;
}

// ─────────────────────────────────────────── cheap cached sprites ───────────────────────────────────────────
const _spr = new Map();
/** soft radial puff/glow sprite (64px), additive or normal */
export function puff(color, hard = 0.45) {
  const key = color + hard;
  let c = _spr.get(key);
  if (c) return c;
  c = mkCanvas(64, 64);
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(hard, hexA(color, 0.45)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _spr.set(key, c);
  return c;
}
function hexA(hex, a) {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex.replace(/rgba?\(([^,]+),([^,]+),([^,)]+)(?:,[^)]+)?\)/, `rgba($1,$2,$3,${a})`);
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** additive glow at local (x,y) radius r (call between begin/end; resets transform to the base) */
export function glow(x, y, r, color, a = 1) {
  if (a <= 0.01 || r <= 0) return;
  local();
  const ctx = CTX, gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.drawImage(puff(color), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
}
/** soft contact shadow ellipse at the feet (local space) */
export function shadow(rx, a = 0.42, y = 0) {
  local();
  const ctx = CTX, ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.drawImage(puff('#000000', 0.55), -rx, y - rx * 0.22, rx * 2, rx * 0.44);
  ctx.globalAlpha = ga;
}

// ─────────────────────────────────────────── per-enemy render particles ───────────────────────────────────────────
// Tiny pooled system stored on the entity (world coords, render RNG). Drawn by the owner in camera space.
// kinds: 0 additive puff, 1 drip (gravity, stretched), 2 normal puff (dust/smoke), 3 additive spark, 4 chip (tumbling quad)
export class FxPool {
  constructor(max = 24) {
    this.max = max; this.n = 0;
    const F = () => new Float32Array(max);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.l = F(); this.l0 = F(); this.s = F(); this.r = F(); this.k = new Uint8Array(max); this.c = new Array(max);
    this.lt = -1;
  }
  add(k, x, y, vx, vy, life, s, col) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.k[i] = k; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy; this.l[i] = this.l0[i] = life; this.s[i] = s; this.r[i] = fr() * TAU; this.c[i] = col;
  }
  /** dt from the owner's clock (clamped); returns dt */
  step(now) {
    const dt = this.lt < 0 ? 0 : clamp(now - this.lt, 0, 0.05); this.lt = now;
    let i = 0;
    while (i < this.n) {
      this.l[i] -= dt;
      if (this.l[i] <= 0) { this.kill(i); continue; }
      const k = this.k[i];
      if (k === 1 || k === 4) this.vy[i] += 900 * dt;
      else { const d = Math.pow(k === 2 ? 0.9 : 0.96, dt * 60); this.vx[i] *= d; this.vy[i] *= d; }
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt; this.r[i] += dt * (k === 4 ? 12 : 1.5);
      i++;
    }
    return dt;
  }
  kill(i) {
    const j = --this.n;
    this.k[i] = this.k[j]; this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
    this.l[i] = this.l[j]; this.l0[i] = this.l0[j]; this.s[i] = this.s[j]; this.r[i] = this.r[j]; this.c[i] = this.c[j];
  }
  /** draw in camera space (ctx transform must be the camera transform) */
  draw(ctx) {
    if (!this.n) return;
    const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
    for (let i = 0; i < this.n; i++) {
      const k = this.k[i], u = this.l[i] / this.l0[i], s = this.s[i];
      if (k === 0 || k === 3) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = ga * u * (k === 3 ? 1 : 0.55);
        const r = k === 3 ? s : s * (1.4 - u * 0.6);
        ctx.drawImage(puff(this.c[i] ?? '#9fe8ff', k === 3 ? 0.2 : 0.45), this.x[i] - r, this.y[i] - r, r * 2, r * 2);
      } else if (k === 2) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = ga * u * 0.5;
        const r = s * (1.6 - u * 0.8);
        ctx.drawImage(puff(this.c[i] ?? '#8a7a66', 0.5), this.x[i] - r, this.y[i] - r, r * 2, r * 2);
      } else if (k === 1) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = ga * Math.min(1, u * 2);
        ctx.strokeStyle = this.c[i] ?? '#7affd8'; ctx.lineWidth = s; ctx.lineCap = 'round';
        const st = Math.min(4, 1 + Math.abs(this.vy[i]) * 0.01);
        ctx.beginPath(); ctx.moveTo(this.x[i], this.y[i] - s * st); ctx.lineTo(this.x[i], this.y[i]); ctx.stroke();
      } else if (k === 4) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = ga * Math.min(1, u * 3);
        const c = Math.cos(this.r[i]) * s, sn = Math.sin(this.r[i]) * s;
        ctx.fillStyle = this.c[i] ?? '#d8cbb0';
        ctx.beginPath(); ctx.moveTo(this.x[i] - c, this.y[i] - sn); ctx.lineTo(this.x[i] + sn * 0.5, this.y[i] - c * 0.5); ctx.lineTo(this.x[i] + c, this.y[i] + sn); ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
  }
}

// ─────────────────────────────────────────── corpses (outlive the entity) ───────────────────────────────────────────
/**
 * Death collapse: hand the posed parts to world.fx.ghost so they keep falling/tumbling after the entity is removed.
 * pieces: [{ name, pv, x, y, rot, sx, sy, vn, vx, vy, vr, z }] in the enemy's LOCAL frame (feet origin, facing right).
 * o: { life, floor (local y of the ground, default 0), bounce, fade, glowCol, burst:{kind,col,n} }
 */
export function spawnCorpse(world, e, rig, pieces, o = {}) {
  if (!world?.fx?.ghost) return;
  const ox = e.cx, oy = e.bottom, fx = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
  const life = o.life ?? 1.3, t0 = world.time ?? 0, floor = o.floor ?? 0;
  let last = t0;
  const P = pieces.map((p) => ({ ...p }));
  const pool = o.dust ? new FxPool(28) : null;
  if (pool) for (let i = 0; i < o.dust.n; i++) pool.add(o.dust.k ?? 2, ox + fx * sc * frand(-o.dust.w, o.dust.w), oy - frand(0, o.dust.h), frand(-40, 40), frand(-60, -10), frand(0.5, 1.1), frand(4, 9) * sc, o.dust.col);
  world.fx.ghost((ctx) => {
    const now = world.time ?? t0, dt = clamp(now - last, 0, 0.05); last = now;
    const age = now - t0, fade = clamp((life - age) / (o.fade ?? 0.45), 0, 1);
    if (fade <= 0) return;
    for (const p of P) {
      if (p.static) continue;
      p.vy += (o.grav ?? 1500) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const fl = floor - (p.r ?? 3);
      if (p.y > fl) { p.y = fl; p.vy *= -(o.bounce ?? 0.28); p.vx *= 0.6; p.vr *= 0.5; if (Math.abs(p.vy) < 40) p.vy = 0; }
    }
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(fx * sc, sc);
    begin(ctx, rig, 0);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = fade;
    for (const p of P) put(p.name, p.pv ?? 'a', p.x, p.y, p.rot, p.sx ?? 1, p.sy ?? 1, p.alpha ?? 1, p.vn ?? 'base');
    if (o.after) o.after(age, fade);
    ctx.globalAlpha = ga;
    end();
    ctx.restore();
    if (pool) { pool.step(now); pool.draw(ctx); }
  }, life, o.layer ?? 'back');
}

// ─────────────────────────────────────────── common pose helpers ───────────────────────────────────────────
/** attack progress: wind-up 0→1, swing 0→1, time after the swing (same contract as the vector renderers) */
export function atkPhase(at, windup, swingDur = 0.1) {
  if (at < windup) return { w: at / windup, s: 0, after: 0 };
  return { w: 1, s: clamp((at - windup) / swingDur, 0, 1), after: at - windup };
}
export const hurtOf = (e) => (e.flashT > 0 ? 1 : 0) || (e.stun > 0.06 ? 0.7 : 0);
export const deathK = (e) => (e.dying > 0 ? 1 - clamp(e.dying / (e.def.dieTime ?? 0.35), 0, 1) : 0);
/** hit squash 0..1 (peaks on the frame the hit lands, decays over flashT) */
export const squashK = (e) => (e.flashT > 0 ? clamp(e.flashT / 0.12, 0, 1) : 0);
/** flash overlay strength for part blits */
export const flashK = (e, o) => (o?.flash ? 0.82 : 0);
/** clock for render-side dt (world time when available, else entity time) */
export const clockOf = (e, world) => world?.time ?? e.t ?? 0;
