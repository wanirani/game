// env kit - props of the THINGS lane (2026-11-19, docs/v2/ENV_KIT.md 25). Same shape as props3.js: PROPS[name](G, x, y, z, o), code-built
// (the paid image-to-3D route was refused that day: /tmp/claude-0/v2/things/gen_requests.json holds the pictures that were wanted).
//   stairstump - what is left of a stone stair that fell: a landing the hero can stand on, the fallen treads flat in the earth before it
//   things with a footprint that a person who lives there put down: ladder, logpile, barrow, trough, anvil, bench, grindstone, shrine, fingerpost,
//   and for ground nobody reaches: hayrick, scarecrow.  o.old = the same thing a hundred years on (fallen, rotten, half in weeds).
import { hash } from './geo.js';
import { PROPS } from './props.js';

const fx = (G) => G.fx ?? (G.fx = { glows: [], pools: [], shadows: [] });
const shadow = (G, x, y, z, rx, rz = rx * 0.62, a = 0.5) => fx(G).shadows.push({ x, y, z, rx, rz, a });
const IRON = [0.46, 0.46, 0.52], RUST = [0.74, 0.43, 0.3], OAK = [0.92, 0.8, 0.7], GREY = [0.66, 0.64, 0.66], ROT = [0.5, 0.45, 0.42], MOSS = [0.52, 0.66, 0.5], HAY = [1.12, 0.98, 0.62], HAYOLD = [0.62, 0.58, 0.46];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** a slab lying on the ground: centre (cx, cz), half sizes (hw, hd), turned by a, its far end (+u) sunk by `sink`; th thick */
function slab(G, mat, cx, y, cz, hw, hd, a, th, sink, o) {
  const c = Math.cos(a), s = Math.sin(a), P = (u, v, yy) => [cx + c * u - s * v, yy, cz + s * u + c * v];
  const yl = y + th, yr = y + Math.max(0.6, th - sink), A = P(-hw, -hd, yl), B = P(hw, -hd, yr), C = P(hw, hd, yr), D = P(-hw, hd, yl);
  G.quad4(mat, A, B, C, D, [0, 1, 0], { ...o, keep: true });
  G.quad4(mat, P(-hw, -hd, y), P(hw, -hd, y), B, A, [s, 0, -c], { ...o, k: (o.k ?? 1) * 0.62, keep: true });
  G.quad4(mat, P(hw * (c < 0 ? 1 : -1), -hd, y), P(hw * (c < 0 ? 1 : -1), hd, y), c < 0 ? C : D, c < 0 ? B : A, [c < 0 ? c : -c, 0, c < 0 ? s : -s], { ...o, k: (o.k ?? 1) * 0.74, keep: true });
}
/** tufts of weeds: n blades fanning from the ground round (x, z) within r - what grows through a thing nobody moved for a hundred years */
function weeds(G, x, y, z, r, n, seed, hgt = 16) {
  for (let i = 0; i < n; i++) {
    const a = hash(i, seed) * 6.283, d = r * (0.25 + 0.75 * hash(seed, i * 3 + 1)), bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d * 0.6, hh = hgt * (0.6 + 0.7 * hash(i * 7, seed + 2)), lean = (hash(i, seed + 5) - 0.5) * 9;
    G.tri('white', [bx - 2.2, y, bz], [bx + 2.2, y, bz], [bx + lean, y + hh, bz - 1], [0, 0, -1], { tint: [0.3 + 0.1 * hash(i, 3), 0.42 + 0.12 * hash(3, i), 0.26], vary: 0, keep: true });
  }
}

Object.assign(PROPS, {
  /**
   * The head of a stone stair whose flight has fallen (graveyard: below the ossuary terrace). { w, d, h }; x, z = the middle of the block's footprint, its back (+z)
   * against the terrace. The area gives it a solid box of exactly that size WITH `walk`: a body that leaves the terrace here steps onto the landing and goes off its
   * broken end onto open ground (docs/v2/ENV_KIT.md 25 - drop-in). ONE level: PLAY's rules know boxes, not slopes, and a second, lower tread would be a way up
   * (jump apex 112 + step 18 = 130: h must stay over that). The fallen treads lie flat (at most 5 high, drawn only, no box: nothing to come down into).
   */
  stairstump(G, x, y, z, o = {}) {
    const w = o.w ?? 120, d = o.d ?? 44, h = o.h ?? 134, x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, sd = Math.round(x * 1.3 + z), cap = 9, old = !!o.old;
    G.box('ashlar', x0, y, z0 + 4, x1, y + h - cap, z1, { faces: 'LR', cell: 44, vary: 0.3 });                                   // the flanks, dressed like the stair bay behind
    G.quad('stone', [x0, y, z0 + 5], [w, 0, 0], [0, h - cap, 0], [0, 0, -1], { k: 0.42, vary: 0.2 });                              // the core behind the torn courses (dark)
    const rows = 5, rh = (h - cap) / rows;                                                                                        // the broken end: courses torn off at different depths
    for (let r = 0; r < rows; r++) {
      let u = x0, i = 0;
      while (u < x1 - 2) {
        const bw = Math.min(x1 - u, 24 + 30 * hash(r * 7 + i, sd)), gone = hash(i * 5 + r * 3, sd + 3) < 0.2 && r > 0, zz = z0 + (gone ? 5 : 3.6 * hash(i + r * 11, sd + 9));
        if (!gone) G.box(r % 2 ? 'ashlar' : 'stone', u + 0.6, y + r * rh, zz, Math.min(x1, u + bw) - 0.6, y + (r + 1) * rh - 0.8, z0 + 6, { faces: 'FLRT', vary: 0.34, k: 0.8 + 0.3 * hash(r, i + sd), tint: old ? [0.8, 0.86, 0.86] : undefined });
        u += bw; i++;
      }
    }
    G.box('trimstone', x0 - 2, y + h - cap, z0 - 1.5, x1 + 2, y + h, z1, { faces: 'FLRT', vary: 0.22, cell: 60 });               // the landing: the stair's top step, still whole
    G.box('trimstone', x0 + w * 0.5, y + h - cap - 11, z0 - 1, x1 - 6, y + h - cap, z0 + 6, { faces: 'FLRT', vary: 0.3, k: 0.86 });   // half of the next tread hangs under it
    // the fallen flight: treads lying where they slid, each lower and further out, the last ones broken
    const T = [[-6, 30, 0.07, 52, 0], [12, 62, -0.16, 50, 1.5], [-18, 96, 0.3, 30, 2], [30, 104, -0.5, 20, 3], [-34, 132, 0.62, 22, 2.5], [22, 142, 0.1, 16, 3.4]];
    for (const [ox, oz, a, hw, sink] of T) slab(G, 'trimstone', x + ox, y, z0 - oz, hw, 8.5, a, 4.6, sink, { vary: 0.3, k: 0.84 + 0.2 * hash(ox, oz), tint: old ? [0.84, 0.92, 0.88] : [1, 1, 1] });
    if (old) { weeds(G, x - 40, y, z0 - 70, 34, 7, sd + 1, 13); weeds(G, x + 44, y, z0 - 118, 30, 6, sd + 2, 12); weeds(G, x + 54, y, z0 - 22, 14, 4, sd + 4, 15); }
    shadow(G, x, y, z0 - 6, w * 0.6, 24, 0.5);
  },
});
