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
import { game, TILE } from '../../core/game.js';
import { isSolidType, T as TT } from '../../core/physics.js';

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SEAM ─ shared painted-kit primitives come from the boss core's src/render/painted/kit.js (bake canvases, outline,
// silhouette, darken, damage bake with cracks/char/holes, render RNG, texture density, bake time-slicing). Until kit.js
// existed this block held self-contained copies; the enemy renderers only use the API exported below, so the swap was
// local to this file.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
import { makeCanvas, silhouette as kSilhouette, outlined, darkened, bakeDamage, rr, hash1, seeded, textureDensity, nextIdle, sliceStart, quality } from './kit.js';

/** runtime (GPU) canvas — scratch targets and sprites that are drawn every frame */
export function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
/** render-only RNG (shared with the boss kit): visuals must never consume gameplay Math.random */
export const fr = () => rr.next();
export const frand = (a, b) => rr.range(a, b);
export const h1 = hash1;
export const srng = (seed) => { const R = seeded(seed); return () => R.next(); };
export const silhouette = kSilhouette;
/** thin dark outline around an already padded part canvas (r in texels) */
export const withOutline = (img, r, color = 'rgba(8,4,8,0.92)') => outlined(img, { width: r > 0.2 ? r : 0, color, pad: 0 });
export const darken = darkened;
/** damage level 1/2 of a raw (un-outlined) part: kit.bakeDamage opts {char, cracks, holes, chips, stain, crackMinLum} */
export const damageVariant = (src, level, seed, o = {}) => bakeDamage(src, level, seed, o, false).canvas;
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════ /SEAM ═══

const PAD = 3;               // texels around every baked part (outline room + bilinear bleed)
export const stats = { bakes: 0, bakeMs: 0 };      // cumulative bake work (live memory: rigStats())

/** texel density (device px per logical px) the runtime atlas is baked at (kit: canvas scale × quality, oversampled) */
function chooseTD(srcTD) {
  return textureDensity(game, 1, { min: 1.25, max: Math.min(srcTD, 2.75), over: 1.2 });
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
 * spec = { src:'skeleton', scale:1 (whole-figure scale so the art fills the logic rect; applied by render/enemies.js
 *          and by corpses/dissolves), bake:{ outline:0.55 (logical px), deep:{part:k}, glow:{part:'#hex'},
 *          flash:true|[parts], damage:{ part:{cracks,char,nicks,crackGlow} } } }
 */
export function requestRig(spec) {
  let rig = RIGS.get(spec.src);
  if (rig) return rig;
  rig = newRig(spec);
  RIGS.set(spec.src, rig);
  return rig;
}
function newRig(spec, prev = null) {
  const rig = { src: spec.src, spec, scale: spec.scale ?? 1, ready: false, failed: false, parts: {}, atlas: null, td: 1, promise: null };
  rig.promise = buildRig(rig, spec)
    .then(() => { if (prev && RIGS.get(spec.src) === prev) RIGS.set(spec.src, rig); })   // swap only when the re-bake is done
    .catch((err) => { rig.failed = true; if (prev) prev.rebaking = false; console.warn('[painted enemy]', spec.src, err?.message ?? err); });
  return rig;
}
export const rigReady = (spec) => { const r = requestRig(spec); return r.ready ? r : null; };
/**
 * Texel density follows the canvas scale: if the window grew (small window → fullscreen, rotation, quality raised) or
 * shrank (auto quality drop on a slow phone) by more than 25 % since the bake, re-bake in the background and swap the
 * new rig in when it is ready (live entities pick it up on their next requestRig; corpses keep the old object, so
 * nothing jumps or pops). Called on roomEntered, i.e. behind the room fade.
 */
export function refreshRig(spec) {
  const rig = RIGS.get(spec.src);
  if (!rig || !rig.ready || rig.rebaking) return rig ?? requestRig(spec);
  const td = chooseTD(rig.srcTD ?? 4);
  if (Math.abs(td / rig.td - 1) < 0.25) return rig;
  rig.rebaking = true;
  newRig(spec, rig);
  return rig;
}
/**
 * Drop the baked atlases of enemy types the new stage does not use (memory stays at one stage roster instead of
 * growing with every stage visited). Safe while corpses of a released type are still falling: they hold their own
 * reference to the rig object; a later requestRig simply bakes a fresh one.
 */
export function releaseRigs(keepSrcs) {
  const keep = new Set(keepSrcs);
  for (const [k, r] of RIGS) {
    if (keep.has(k) || !r.ready) continue;
    RIGS.delete(k);
  }
}

async function buildRig(rig, spec) {
  const base = `assets/painted/enemies/${spec.src}/`;
  const man = await (await fetch(base + 'rig.json')).json();
  const img = await loadImg(base + (man.atlas ?? 'atlas.webp') + (man.v ? `?v=${man.v}` : ''));
  if (img.decode) await img.decode().catch(() => {});
  const t0 = performance.now();
  sliceStart();
  const srcTD = man.srcTD ?? 3, td = chooseTD(srcTD), f = td / srcTD;
  const B = spec.bake ?? {}, olr = (B.outline ?? 0.5) * td;
  const items = [];
  for (const [name, p] of Object.entries(man.parts)) {
    const [rx, ry, rw, rh] = p.rect;
    const w = Math.ceil(rw * f) + PAD * 2, h = Math.ceil(rh * f) + PAD * 2;
    const dmg = B.damage?.[name] ?? B.damage?.['*'];
    const raw = makeCanvas(w, h), g = raw.getContext('2d', { willReadFrequently: true });
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
    if (dmg) {
      for (const L of [1, 2]) {
        const d = withOutline(damageVariant(raw, L, name.length * 31 + L, dmg), olr * olK);
        vars['dmg' + L] = d;
        if (dk) vars['deep_dmg' + L] = darken(d, dk, B.deepTint);
      }
    }
    for (const [k, c] of Object.entries(vars)) items.push({ part, k, c });
    rig.parts[name] = part;
    await nextIdle(6);                        // time-slice the bake (behind the room fade, never one long frame)
  }
  const { w, h } = pack(items, 1024);
  const atlas = mkCanvas(w, h), ag = atlas.getContext('2d');
  for (const it of items) { ag.drawImage(it.c, it.x, it.y); it.part.v[it.k] = [it.x, it.y, it.c.width, it.c.height]; it.c.width = it.c.height = 0; }
  rig.atlas = atlas; rig.td = td; rig.srcTD = srcTD; rig.man = man;
  rig.bytes = w * h * 4;
  rig.bakeMs = performance.now() - t0;
  stats.bakes++; stats.bakeMs += rig.bakeMs;
  rig.ready = true;
  return rig;
}
export function rigStats() {
  const out = {};
  for (const [k, r] of RIGS) out[k] = { ready: r.ready, failed: r.failed, td: r.td, atlas: r.atlas ? `${r.atlas.width}x${r.atlas.height}` : null, MB: +(r.bytes / 1048576 || 0).toFixed(3), bakeMs: +(r.bakeMs ?? 0).toFixed(1), ...(r.rebaking ? { rebaking: true } : {}) };
  return out;
}
/** total baked MB of the rigs currently held */
export const rigMemMB = () => { let b = 0; for (const r of RIGS.values()) b += r.bytes || 0; return b / 1048576; };

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
/** texel row t of a part → row in the stretched part (rows y0..y1 stretched by ext texels, rows below shifted) */
export function stretchMap(t, st) {
  const y0 = st[0], y1 = st[1], ext = st[2];
  return t < y0 ? t : t <= y1 ? y0 + (t - y0) * (y1 - y0 + ext) / (y1 - y0) : t + ext;
}
/**
 * put() with one section of the part lengthened along its texel Y: rows y0..y1 are stretched by `ext` texels and
 * everything below moves down by ext (three blits, the stretched middle first so the ends cover its 1-texel overlap).
 * For uniform sections only — a tool handle, a spear shaft, a chain — so the painted head/blade keeps its proportions
 * while the reach matches the AI's strike rect. The pivot pv is given in unstretched texels.
 */
export function putStretch(name, pv, x, y, rot, sx, sy, alpha, vn, y0, y1, ext) {
  const p = RIG.parts[name];
  if (!p || alpha <= 0.003) return;
  if (!(ext > 0.5) || !(y1 > y0)) { put(name, pv, x, y, rot, sx, sy, alpha, vn); return; }
  const q = typeof pv === 'string' ? (p.piv[pv] ?? [p.w / 2, p.h / 2]) : pv;
  setT(q[0], stretchMap(q[1], [y0, y1, ext]), x, y, rot, sx, sy);
  const ctx = CTX, ga = ctx.globalAlpha, a0 = Math.round(y0), a1 = Math.round(y1);
  const draw = (v, a) => {
    ctx.globalAlpha = ga * a;
    const W = v[2], H = v[3], d1 = a1 + ext;
    ctx.drawImage(RIG.atlas, v[0], v[1] + a0, W, a1 - a0, 0, a0 - 0.5, W, d1 - a0 + 1);   // stretched middle (+overlap)
    ctx.drawImage(RIG.atlas, v[0], v[1], W, a0, 0, 0, W, a0);                             // top, unchanged
    ctx.drawImage(RIG.atlas, v[0], v[1] + a1, W, H - a1, 0, d1, W, H - a1);               // bottom, shifted
  };
  draw(variantOf(p, vn), alpha);
  if (FLASH > 0 && p.v.flash) draw(p.v.flash, alpha * FLASH);
  ctx.globalAlpha = ga;
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
 * strip i (u = 0 at pivot side … 1 far side) is shifted by off(u, i) → [dx, dy] in TEXELS of the part frame (null = skip).
 * Used for cloth/ectoplasm ripples, capes, coat tails. Strips overlap by 1 texel to hide seams.
 */
export function strips(name, pv, x, y, rot, sx, sy, n, axis, off, alpha = 1, vn = 'base', smooth = true) {
  const p = RIG.parts[name];
  if (!p || alpha <= 0.003) return;
  const q = typeof pv === 'string' ? (p.piv[pv] ?? [p.w / 2, p.h / 2]) : pv;
  const v = variantOf(p, vn), fv = FLASH > 0 ? p.v.flash : null;
  const k = 1 / RIG.td, c = Math.cos(rot), s = Math.sin(rot);
  const a = c * sx * k, b = s * sx * k, cc = -s * sy * k, d = c * sy * k;
  const e0 = x - (a * q[0] + cc * q[1]), f0 = y - (b * q[0] + d * q[1]);
  const ctx = CTX, ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * alpha;
  const Y = axis === 'y', L = Y ? v[3] : v[2], step = L / n;
  const pivT = Y ? q[1] : q[0], span = Math.max(pivT, L - pivT) || 1;
  const uOf = (tt) => Math.abs(tt - pivT) / span;
  // smooth: offsets are sampled at the strip edges and each strip is SHEARED between them (continuous silhouette,
  // no stair steps); !smooth: one rigid offset per strip (used by the dissolve)
  let o0x = 0, o0y = 0;
  if (smooth) { const o = off(uOf(0), -1) ?? _zero; o0x = o[0]; o0y = o[1]; }
  for (let i = 0; i < n; i++) {
    const t0 = Math.floor(i * step), t1 = Math.min(L, Math.ceil((i + 1) * step) + (i < n - 1 ? 1 : 0));
    if (t1 <= t0) continue;
    let lc, ld, le, lf, la, lb;                 // local affine (texel space) applied before the part transform
    if (smooth) {
      const o1 = off(uOf(Math.min(L, (i + 1) * step)), i);
      if (!o1) { continue; }
      const o1x = o1[0], o1y = o1[1], h = step || 1;
      const shx = (o1x - o0x) / h, shy = (o1y - o0y) / h, tb = i * step;
      if (Y) { la = 1; lb = shy * 0; lc = shx; ld = 1 + shy; le = o0x - shx * tb; lf = o0y - shy * tb; }
      else { la = 1 + shx; lb = shy; lc = 0; ld = 1; le = o0x - shx * tb; lf = o0y - shy * tb; }
      o0x = o1x; o0y = o1y;
    } else {
      const um = uOf((t0 + t1) / 2), o = off(um, i);
      if (!o) continue;                                         // strip hidden (dissolve)
      la = 1; lb = 0; lc = 0; ld = 1; le = o[0]; lf = o[1];
    }
    // compose: part (a b cc d e0 f0) × local (la lb lc ld le lf), then the captured base M
    const A = a * la + cc * lb, B = b * la + d * lb, C = a * lc + cc * ld, D = b * lc + d * ld;
    const E = a * le + cc * lf + e0, F = b * le + d * lf + f0;
    ctx.setTransform(M[0] * A + M[2] * B, M[1] * A + M[3] * B, M[0] * C + M[2] * D, M[1] * C + M[3] * D, M[0] * E + M[2] * F + M[4], M[1] * E + M[3] * F + M[5]);
    if (Y) {
      ctx.drawImage(RIG.atlas, v[0], v[1] + t0, v[2], t1 - t0, 0, t0, v[2], t1 - t0);
      if (fv) { ctx.globalAlpha = ga * alpha * FLASH; ctx.drawImage(RIG.atlas, fv[0], fv[1] + t0, fv[2], t1 - t0, 0, t0, fv[2], t1 - t0); ctx.globalAlpha = ga * alpha; }
    } else {
      ctx.drawImage(RIG.atlas, v[0] + t0, v[1], t1 - t0, v[3], t0, 0, t1 - t0, v[3]);
      if (fv) { ctx.globalAlpha = ga * alpha * FLASH; ctx.drawImage(RIG.atlas, fv[0] + t0, fv[1], t1 - t0, fv[3], t0, 0, t1 - t0, fv[3]); ctx.globalAlpha = ga * alpha; }
    }
  }
  ctx.globalAlpha = ga;
}
const _zero = [0, 0];
/**
 * seam-free cloth warp for TRANSLUCENT parts (ghost shrouds, ectoplasm, mist): the part is re-rasterised into a small
 * scratch canvas as horizontal strips on integer texel rows, each strip x-sheared between the offsets sampled at its
 * edges (no strip boundaries are ever anti-aliased twice → no double-alpha lines, no conflation gaps), then blitted
 * once with the part transform. off(u) → [dx] in texels (u = 0 at the pivot row). slot = scratch index (0..3).
 */
const SCR = [];
const _wo = new Float32Array(66), _wt = new Int32Array(66);
export function warpY(name, pv, x, y, rot, sx, sy, n, off, alpha = 1, vn = 'base', slot = 0) {
  const p = RIG.parts[name];
  if (!p || alpha <= 0.003) return;
  const v = variantOf(p, vn), fv = FLASH > 0 && vn !== 'glow' ? p.v.flash : null;
  const q = typeof pv === 'string' ? (p.piv[pv] ?? [p.w / 2, p.h / 2]) : pv;
  const H = v[3];
  const step = Math.max(1, Math.round(H / Math.min(n, 64))), span = Math.max(q[1], H - q[1]) || 1;
  // sample the row offsets first: the scratch margins follow the actual displacement (a fixed margin clipped the
  // trailing hem of a fast ghost with a hard vertical edge)
  let m = 0, lo = 0, hi = 0;
  for (let t = 0; ; t = Math.min(H, t + step)) {
    const o = off(Math.abs(t - q[1]) / span)[0];
    _wt[m] = t; _wo[m++] = o; if (o < lo) lo = o; if (o > hi) hi = o;
    if (t >= H || m >= 65) break;
  }
  const padL = Math.ceil(-lo) + 2, padR = Math.ceil(hi) + 2, W = v[2] + padL + padR;
  let sc = SCR[slot];
  if (!sc || sc.c.width < W || sc.c.height < H) { const c = mkCanvas(Math.max(W, sc?.c.width ?? 0), Math.max(H, sc?.c.height ?? 0)); sc = SCR[slot] = { c, g: c.getContext('2d') }; }
  const g = sc.g;
  // clear everything the previous use dirtied too: the blit below samples bilinearly, and Chrome may read one texel
  // past the source rect → stale pixels just outside W×H showed up as a thin vertical line beside the ghost
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.clearRect(0, 0, Math.max(W, sc.dw ?? 0) + 2, Math.max(H, sc.dh ?? 0) + 2);
  sc.dw = W; sc.dh = H;
  g.imageSmoothingQuality = 'low';
  for (let i = 0; i < m - 1; i++) {
    const t0 = _wt[i], t1 = _wt[i + 1];
    if (t1 <= t0) continue;
    const o0 = _wo[i], sh = (_wo[i + 1] - o0) / (t1 - t0);
    g.setTransform(1, 0, sh, 1, padL + o0 - sh * t0, 0);
    g.globalAlpha = 1;
    g.drawImage(RIG.atlas, v[0], v[1] + t0, v[2], t1 - t0, 0, t0, v[2], t1 - t0);
    if (fv) { g.globalAlpha = FLASH; g.drawImage(RIG.atlas, fv[0], fv[1] + t0, fv[2], t1 - t0, 0, t0, fv[2], t1 - t0); }
  }
  setT(q[0] + padL, q[1], x, y, rot, sx, sy);
  const ctx = CTX, ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * alpha;
  ctx.drawImage(sc.c, 0, 0, W, H, 0, 0, W, H);
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
  /** how many particles of stream `key` to emit this frame for `perSec` per second of the owner's clock (dt from
   *  step(); fractional remainders carry over, so the density does not depend on the frame rate) */
  rate(key, perSec, dt) {
    const acc = (this.acc ??= [0, 0, 0, 0, 0, 0, 0, 0]);
    acc[key] += perSec * dt;
    const n = Math.floor(acc[key]);
    acc[key] -= n;
    return n;
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
 * Ground under a world point: top y of the first solid / one-way tile at or below (wx, wy), searched `maxTiles` down.
 * Returns +Infinity over a pit (nothing within reach) so pieces keep falling out of view while they fade.
 */
export function groundBelow(world, wx, wy, maxTiles = 16) {
  const map = world?.map;
  if (!map?.typeAt) return Infinity;
  const tx = Math.floor(wx / TILE);
  let ty = Math.floor(wy / TILE);
  if (isSolidType(map.typeAt(tx, ty))) return wy;                 // already inside a wall: rest where it is
  for (let k = 0; k < maxTiles; k++) {
    ty++;
    const t = map.typeAt(tx, ty);
    if (isSolidType(t) || t === TT.ONEWAY) return ty * TILE;
  }
  return Infinity;
}
/**
 * Death collapse: hand the posed parts to world.fx.ghost so they keep falling/tumbling after the entity is removed.
 * pieces: [{ name, pv, x, y, rot, sx, sy, vn, vx, vy, vr, stretch? }] in the enemy's LOCAL frame (feet origin, facing
 * right; stretch = [y0, y1, ext] like putStretch). Every piece lands on the real ground under ITS column (tile map):
 * an enemy killed in the air (launcher / juggle) collapses onto the floor below, pieces that fly over a ledge or a pit
 * keep falling. o: { life, bounce, fade, grav, dust:{n,w,h,col,k}, after(age, fade), layer }
 */
export function spawnCorpse(world, e, rig, pieces, o = {}) {
  if (!world?.fx?.ghost) return;
  const ox = e.cx, oy = e.bottom, fx = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
  const life = o.life ?? 1.3, t0 = world.time ?? 0;
  let last = t0;
  // re-pivot every piece on its centre so it tumbles naturally and rests ON the floor (not on its joint pivot)
  const P = [];
  for (const p0 of pieces) {
    const part = rig.parts[p0.name];
    if (!part) continue;
    const p = { ...p0 };
    const ext = p.stretch ? p.stretch[2] : 0;
    const c = [part.w / 2, part.h / 2];
    const q = typeof p.pv === 'string' ? (part.piv[p.pv] ?? c) : (p.pv ?? c);
    const my = (t) => (p.stretch ? stretchMap(t, p.stretch) : t);
    const k = 1 / rig.td, lx = (c[0] - q[0]) * (p.sx ?? 1) * k, ly = (my(c[1]) - my(q[1])) * (p.sy ?? 1) * k, cs = Math.cos(p.rot), sn = Math.sin(p.rot);
    p.x += cs * lx - sn * ly; p.y += sn * lx + cs * ly; p.pv = c;
    const hw = (part.w - 6) / 2 * k * Math.abs(p.sx ?? 1), hh = (part.h + ext - 6) / 2 * k * Math.abs(p.sy ?? 1);
    p.r = Math.min(hw, hh); p.long = hw >= hh ? 0 : Math.PI / 2;
    p.col = null; p.fl = 0;
    P.push(p);
  }
  // local floor (feet-origin frame) under a piece; cached per tile column
  const floorOf = (p) => {
    const wx = ox + fx * sc * p.x, col = Math.floor(wx / TILE);
    if (p.col !== col) {
      p.col = col;
      const gy = groundBelow(world, wx, Math.min(oy - 2, oy + sc * p.y));
      p.fl = gy === Infinity ? Infinity : (gy - oy) / sc;
    }
    return p.fl;
  };
  const pool = o.dust ? new FxPool(28) : null;
  if (pool) {
    const gy = groundBelow(world, ox, oy - 2), dy = gy === Infinity || gy - oy > 400 ? 0 : gy - oy;   // dust on the floor below
    for (let i = 0; i < o.dust.n; i++) pool.add(o.dust.k ?? 2, ox + fx * sc * frand(-o.dust.w, o.dust.w), oy + dy - frand(0, o.dust.h), frand(-40, 40), frand(-60, -10), frand(0.5, 1.1), frand(4, 9) * sc, o.dust.col);
  }
  world.fx.ghost((ctx) => {
    const now = world.time ?? t0, dt = clamp(now - last, 0, 0.05); last = now;
    const age = now - t0, fade = clamp((life - age) / (o.fade ?? 0.45), 0, 1);
    if (fade <= 0) return;
    for (const p of P) {
      if (p.static) continue;
      p.vy += (o.grav ?? 1500) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const fl = floorOf(p) - (p.r ?? 3);
      if (p.y >= fl - 0.5) {
        if (p.y > fl) { p.y = fl; p.vy *= -(o.bounce ?? 0.28); p.vx *= 0.6; p.vr *= 0.5; if (Math.abs(p.vy) < 40) p.vy = 0; }
        // resting: topple onto the long side
        const flat = p.long + Math.round((p.rot - p.long) / Math.PI) * Math.PI;
        p.rot += (flat - p.rot) * Math.min(1, dt * 10); p.vx *= Math.pow(0.02, dt);
      }
    }
    ctx.save();
    // fx.draw hands ghost callbacks whatever globalAlpha / composite the previous particle left behind → set both
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.translate(ox, oy); ctx.scale(fx * sc, sc);
    begin(ctx, rig, 0);
    ctx.globalAlpha = fade;
    for (const p of P) {
      if (p.stretch) putStretch(p.name, p.pv, p.x, p.y, p.rot, p.sx ?? 1, p.sy ?? 1, p.alpha ?? 1, p.vn ?? 'base', p.stretch[0], p.stretch[1], p.stretch[2]);
      else put(p.name, p.pv, p.x, p.y, p.rot, p.sx ?? 1, p.sy ?? 1, p.alpha ?? 1, p.vn ?? 'base');
    }
    if (o.after) o.after(age, fade);
    end();
    ctx.restore();
    if (pool) {
      ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      pool.step(now); pool.draw(ctx);
      ctx.restore();
    }
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
/** level of detail from the shared quality flag: 'low' halves warp strips and drops secondary glow passes */
export const lod = () => (quality(game).name === 'low' ? 0 : quality(game).name === 'medium' ? 1 : 2);
/** strip count for warps at the current LOD */
export const nStrips = (n) => (lod() === 0 ? Math.max(3, n >> 1) : n);
/** clock for render-side dt (world time when available, else entity time) */
export const clockOf = (e, world) => world?.time ?? e.t ?? 0;

// ─────────────────────────────────────────── T1 death: strip dissolve ───────────────────────────────────────────
/**
 * Painted T1 death: the posed pieces are sliced into horizontal strips that drift apart, rise and wink out in a noise
 * order (mesh-free dissolve), while render-only particles (embers / ectoplasm / feathers) burst out. Outlives the
 * entity through world.fx.ghost. placements: [{ name, pv, x, y, rot, sx, sy, vn }] in the enemy's local frame.
 * o: { life, strips, drift, rise, col (particle colour), kind (FxPool kind), n, spread, glow }
 */
export function spawnDissolve(world, e, rig, placements, o = {}) {
  if (!world?.fx?.ghost) return;
  const ox = e.cx, oy = e.bottom, fx = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
  const life = o.life ?? 0.75, t0 = world.time ?? 0, N = o.strips ?? 10;
  const P = placements.map((p) => ({ ...p }));
  const pool = new FxPool(o.n ?? 20);
  const cy = o.cy ?? -(e.def?.size?.h ?? 40) / 2;
  for (let i = 0; i < (o.n ?? 20); i++) {
    const a = fr() * TAU, sp = frand(40, o.spread ?? 150);
    pool.add(o.kind ?? 3, ox + fx * sc * frand(-10, 10), oy + sc * (cy + frand(-12, 12)), Math.cos(a) * sp, Math.sin(a) * sp - 60, frand(0.35, 0.8), frand(2, 5) * sc, o.col ?? '#ff9a40');
  }
  world.fx.ghost((ctx) => {
    const now = world.time ?? t0, age = now - t0, k = clamp(age / life, 0, 1);
    if (k >= 1) return;
    ctx.save();
    // fx.draw leaves the previous particle's globalAlpha/composite in place (embers flicker) → start from a clean state
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.translate(ox, oy); ctx.scale(fx * sc, sc);
    begin(ctx, rig, k < 0.12 ? 0.8 * (1 - k / 0.12) : 0);
    const ga = ctx.globalAlpha;
    for (let j = 0; j < P.length; j++) {
      const p = P[j];
      strips(p.name, p.pv ?? 'a', p.x, p.y - k * (o.rise ?? 14), p.rot, p.sx ?? 1, p.sy ?? 1, N, 'y', (u, i) => {
        const h = h1(i * 3.7 + j * 11.1);
        if (k * 1.35 > 1 - h) return null;
        _dz[0] = (h1(i + j * 5.3) - 0.5) * k * (o.drift ?? 60) * RIG.td; _dz[1] = -k * k * h * 40 * RIG.td;
        return _dz;
      }, (1 - k) ** 0.6, p.vn ?? 'base', false);
    }
    if (o.glow) glow(P[0].x, cy, 30 * (1 - k), o.glow, 0.8 * (1 - k));
    ctx.globalAlpha = ga;
    end();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    pool.step(now); pool.draw(ctx);
    ctx.restore();
  }, life + 0.4, o.layer ?? 'front');
}
const _dz = [0, 0];
