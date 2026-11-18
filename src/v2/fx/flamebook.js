// v2 fx - flame flipbook, painted in code once (docs/v2/FX.md 13). No canvas calls here: pure pixels, so the same painter runs in node
// (tools/v2/fire2_sheet.mjs writes the sheet as a PNG to look at) and in the game (sprites.js puts the frames into the particle atlas).
//   kind 0  FLAME  16 frames, a loop: a burning tuft, wide at the foot, licking and tearing at the top (the noise climbs one whole period per loop)
//   kind 1  WISP    8 frames, played once over a particle's life: a detached tongue that bends, thins and breaks into pieces
// A frame is 128 x 256 (flames are tall). RGB holds the heat colour (deep orange rim -> yellow -> near white core), A the density; the particle's
// vertex colour multiplies it, so one sheet serves the warm fires, the candles and the pale fire of the cold crypt.
export const FLIP = { W: 128, H: 256, FLAME: 16, WISP: 8 };

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const T = 128;
/** tileable value noise, a few octaves summed -> Float32Array(T*T) in 0..1; period 1 in both sample coordinates */
function table(cells, weights, seed) {
  const R = rng(seed), out = new Float32Array(T * T); let wsum = 0;
  for (let o = 0; o < cells.length; o++) {
    const c = cells[o], w = weights[o], gv = new Float32Array(c * c); wsum += w;
    for (let i = 0; i < gv.length; i++) gv[i] = R();
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const fx = x / T * c, fy = y / T * c, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % c, y1 = (y0 + 1) % c;
      const a = gv[y0 * c + x0], b = gv[y0 * c + x1], d = gv[y1 * c + x0], e = gv[y1 * c + x1];
      out[y * T + x] += w * (a + (b - a) * sx + (d - a) * sy + (a - b - d + e) * sx * sy);
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= wsum;
  return out;
}
let NA = null, NB = null, NC = null;
const tables = () => { if (!NA) { NA = table([2, 4], [0.65, 0.35], 11); NB = table([4, 8, 16], [0.55, 0.3, 0.15], 23); NC = table([8, 16, 32], [0.5, 0.32, 0.18], 37); } };
/** bilinear, wrapping; (x, y) in periods */
function samp(N, x, y) {
  x -= Math.floor(x); y -= Math.floor(y);
  const fx = x * T, fy = y * T, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, x1 = (x0 + 1) & (T - 1), y1 = (y0 + 1) & (T - 1), a = N[y0 * T + x0], b = N[y0 * T + x1], c = N[y1 * T + x0], d = N[y1 * T + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** heat 0..1 of the looping flame at (u -1..1, v 0 = foot .. 1 = top), phase p 0..1 */
function flameHeat(u, v, p) {
  const sway = samp(NA, u * 0.3 + 0.21, v * 0.75 - p) - 0.5;                // slow sideways bend, stronger higher up
  const x = u + sway * (0.1 + 1.05 * v);
  const n = 0.62 * samp(NB, x * 0.42 + 0.5, v * 0.85 - p * 2) + 0.38 * samp(NC, x * 0.8 + 0.13, v * 1.6 - p * 3);
  const foot = Math.min(1, 0.55 + v * 5);                                    // the foot is rounded, not a flat bar
  const hw = 0.8 * Math.pow(1 - v, 0.62) * foot + 0.03;
  const d = 1 - Math.abs(x) / hw;
  if (d < -0.6) return 0;
  return 1.3 * d - 0.14 + (n - 0.5) * (0.75 + 2.3 * v) - 0.5 * v * v;
}
/** heat of the detached tongue at age a 0..1 */
function wispHeat(u, v, a) {
  const cx = 0.3 * Math.sin(v * 4.2 + 1.1 + a * 2.4) * (0.25 + v) + 0.16 * Math.sin(v * 9.5 + a * 5.0);
  const th = (0.36 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, (v - 0.04) / 0.92))), 0.75) + 0.01) * (1 - 0.55 * a);
  const d = 1 - Math.abs(u - cx) / th;
  if (d < -1) return 0;
  const n = 0.6 * samp(NB, u * 0.4 + 0.7, v * 0.9 - a * 1.4) + 0.4 * samp(NC, u * 0.85 + 0.4, v * 1.7 - a * 2.2);
  return 1.25 * d - 0.1 + (n - 0.5) * (0.7 + 2.6 * a + 0.8 * v) - 0.62 * a * a;
}
/**
 * paints one frame into out (Uint8ClampedArray, FLIP.W * FLIP.H * 4, straight alpha, row 0 = top of the flame).
 * kind 0 = FLAME frame i of 16 (loop), 1 = WISP frame i of 8 (once)
 */
export function paintFlame(kind, i, out) {
  tables();
  const W = FLIP.W, H = FLIP.H, p = kind ? i / (FLIP.WISP - 1) : i / FLIP.FLAME;
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H, edge = sstep(0, 0.07, v) * sstep(0, 0.05, 1 - v);   // soft foot and top: the quad's edge never shows
    for (let x = 0; x < W; x++) {
      const u = ((x + 0.5) / W) * 2 - 1, o = (y * W + x) * 4;
      let h = kind ? wispHeat(u, v, p) : flameHeat(u, v, p);
      const side = sstep(0, 0.14, 1 - Math.abs(u));
      if (h <= 0 || side <= 0) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      h = Math.min(1, h);
      const a = sstep(0, 0.42, h) * edge * side, c = sstep(0.3, 1, h);          // density / how far towards the core colour
      // heat colour: deep orange rim -> orange -> yellow -> pale yellow-white
      const g = 0.2 + 0.5 * sstep(0.05, 0.6, h) + 0.27 * c, b = 0.03 + 0.2 * sstep(0.35, 0.8, h) + 0.5 * c * c;
      out[o] = 255; out[o + 1] = 255 * g; out[o + 2] = 255 * b; out[o + 3] = 255 * a * (0.5 + 0.5 * sstep(0, 0.5, h));
    }
  }
}
