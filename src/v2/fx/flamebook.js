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

/**
 * paints one frame into out (Uint8ClampedArray, FLIP.W * FLIP.H * 4, straight alpha, row 0 = top of the flame).
 * kind 0 = FLAME frame i of 16 (loop), 1 = WISP frame i of 8 (once). Everything that depends on the row only is worked out once per row and
 * only the span the flame can reach is visited (the 24 frames take about 60 ms in all).
 */
export function paintFlame(kind, i, out) {
  tables();
  const W = FLIP.W, H = FLIP.H, p = kind ? i / (FLIP.WISP - 1) : i / FLIP.FLAME;
  out.fill(0);
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H, edge = sstep(0, 0.07, v) * sstep(0, 0.05, 1 - v);   // soft foot and top: the quad's edge never shows
    let c0, hw, reach;   // centre line, half width, how far from the centre anything can burn (in u)
    let swK = 0, nK, bias, tK;
    if (!kind) {         // FLAME: wide at the rounded foot, tapering; the noise climbs (2 and 3 whole periods per loop) and tears the top
      const foot = Math.min(1, 0.35 + v * 6.5);
      hw = 0.78 * Math.pow(1 - v, 0.7) * foot + 0.03; c0 = 0; swK = 0.12 + 1.15 * v; reach = hw * 1.9 + swK * 0.5;
      nK = 0.9 + 3.0 * v; bias = -0.1 - 0.35 * v; tK = 1.02 - 0.5 * v;
    } else {             // WISP: a detached tongue - fuller low, long and thin at the tip, bending; with age it thins and breaks into pieces
      const bend = samp(NA, v * 0.5 + 0.4, p * 0.3 + 0.2) - 0.5, w = Math.sin(Math.PI * Math.min(1, Math.max(0, (v - 0.03) / 0.94)));
      c0 = bend * 0.9 * (0.3 + v) + 0.12 * Math.sin(v * 7.0 + p * 4.0);
      hw = (0.6 * Math.pow(w, 0.8) * (0.55 + 0.45 * (1 - v)) + 0.01) * (1 - 0.28 * p); reach = hw * 2.2;
      nK = 1.3 + 3.0 * p + 1.0 * v; bias = -0.1 - 0.6 * p * p - 0.15 * v; tK = 0.8;
    }
    const xa = Math.max(0, Math.floor(((c0 - reach + 1) / 2) * W)), xb = Math.min(W - 1, Math.ceil(((c0 + reach + 1) / 2) * W));
    for (let x = xa; x <= xb; x++) {
      const u = ((x + 0.5) / W) * 2 - 1;
      let d, n;
      if (!kind) {
        const xx = u + (samp(NA, u * 0.3 + 0.21, v * 0.75 - p) - 0.5) * swK;   // slow sideways bend, stronger higher up
        d = 1 - Math.abs(xx) / hw; if (d < -0.9) continue;
        n = 0.6 * samp(NB, xx * 0.42 + 0.5, v * 0.85 - p * 2) + 0.4 * samp(NC, xx * 0.8 + 0.13, v * 1.6 - p * 3);
      } else {
        d = 1 - Math.abs(u - c0) / hw; if (d < -1.2) continue;
        n = 0.6 * samp(NB, u * 0.4 + 0.7, v * 0.9 - p * 1.4) + 0.4 * samp(NC, u * 0.85 + 0.4, v * 1.7 - p * 2.2);
      }
      const h = (kind ? 1.1 : 1.15) * d + bias + (n - 0.5) * nK, side = sstep(0, 0.14, 1 - Math.abs(u));
      if (h <= 0 || side <= 0) continue;
      const o = (y * W + x) * 4, a = sstep(0, 0.34, h) * edge * side;          // density
      const t = Math.min(1, h * tK);                                           // colour heat: cooler towards the tips
      // heat colour: deep red-orange rim -> orange -> yellow -> pale yellow-white core
      const g = 0.16 + 0.42 * sstep(0.1, 0.55, t) + 0.38 * sstep(0.5, 1, t), b = 0.02 + 0.14 * sstep(0.4, 0.75, t) + 0.6 * sstep(0.72, 1, t);
      out[o] = 255; out[o + 1] = 255 * g; out[o + 2] = 255 * b; out[o + 3] = 255 * a * (0.45 + 0.55 * sstep(0, 0.6, h));
    }
  }
}
