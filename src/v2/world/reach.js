// WORLD: walk reachability on the kit's own collision (W.boxes from compileEnv). Pure JS. docs/v2/AREA_FORMAT.md 10
import { groundAt, STEP_UP, JUMP_UP } from '../b/world.js';

/**
 * Breadth-first flood from (sx, sz) on a 20-unit grid. A cell is standable when there is ground under it and no solid
 * non-walkable box within R of its centre (same rule as the prototype's validateStage). Steps up to JUMP_UP are allowed (walk + jump).
 * opt.seeds = [[x, z], ...] more start points (a bell crossing from the twin night lands the hero at the same x, z).
 * opt.hooks = W.hookPoints-like [{ x, z, y, to: [x, z] }]: once a cell within HOOK_R of a whip ring is reached, its landing spot is reached too.
 * Gaps: a hop over at most JUMP_GAP units of "no ground / lower ground" in a straight line onto ground not higher than JUMP_UP is a step too
 * (the hero jumps about 150 into the screen and 170 sideways; walls are never hopped).
 * -> { reachable(x,z), anyIn(x0,x1,z0,z1), near(x,z,r), blocked(x,z,r), path(x,z) -> [[x,z],...] | null, cells }
 */
export const HOOK_R = 300, HOOK_RISE = 280, JUMP_GAP = 100;
export function reachGrid(W, sx, sz, R = 14, opt = {}) {
  const C = 20; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const b of W.boxes) if (b.walk) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1); }
  const nx = Math.ceil((x1 - x0) / C), nz = Math.ceil((z1 - z0) / C), gy = new Float32Array(nx * nz).fill(NaN), seen = new Uint8Array(nx * nz), par = new Int32Array(nx * nz).fill(-1);
  const cellOf = (x, z) => { const i = Math.floor((x - x0) / C), j = Math.floor((z - z0) / C); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
  const centre = (k) => [x0 + (k % nx + 0.5) * C, z0 + (Math.floor(k / nx) + 0.5) * C];
  const blockedAt = (cx, cz, g, r) => { for (const b of W.boxes) if (b.solid && !b.walk && cx + r > b.x0 && cx - r < b.x1 && cz + r > b.z0 && cz - r < b.z1 && b.y1 > g + STEP_UP && b.y0 < g + 60) return true; return false; };
  const ground = (k) => { if (Number.isNaN(gy[k])) { const [cx, cz] = centre(k); let g = groundAt(W, cx, cz); if (Number.isFinite(g) && blockedAt(cx, cz, g, R)) g = -Infinity; gy[k] = g; } return gy[k]; };
  let cells = 0; const q = [], hooks = (opt.hooks ?? []).filter((p) => p.to && !p.off).map((p) => ({ ...p, done: false })), nGap = Math.round(JUMP_GAP / C);
  const push = (m, k) => { if (m >= 0 && !seen[m] && Number.isFinite(ground(m))) { seen[m] = 1; par[m] = k; q.push(m); } };
  const wallAt = (m, g) => { const [cx, cz] = centre(m); return blockedAt(cx, cz, g, 4); };   // something solid stands in the way of a hop at this height
  for (const [x, z] of [...(opt.noStart ? [] : [[sx, sz]]), ...(opt.seeds ?? [])]) push(cellOf(x, z), -1);
  for (let h = 0; h < q.length; h++) {
    const k = q[h], g = ground(k), i = k % nx, j = Math.floor(k / nx); cells++;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const m = b * nx + a;
      const g2 = ground(m);
      if (Number.isFinite(g2) && g2 - g <= JUMP_UP) { if (!seen[m]) { seen[m] = 1; par[m] = k; q.push(m); } if (g2 >= g - STEP_UP) continue; }   // level or a step up/down: no need to look further
      else if (Number.isFinite(g2)) continue;                                                       // a ledge too high
      // hop: over cells with no ground or lower ground, onto the first cell at about this height
      for (let s = 2; s <= nGap + 1; s++) {
        const a2 = i + di * s, b2 = j + dj * s; if (a2 < 0 || b2 < 0 || a2 >= nx || b2 >= nz) break;
        const mid = (j + dj * (s - 1)) * nx + i + di * (s - 1); if (wallAt(mid, g)) break;
        const m2 = b2 * nx + a2, g3 = ground(m2);
        if (Number.isFinite(g3) && g3 - g <= STEP_UP && g3 >= g - JUMP_UP) { if (!seen[m2]) { seen[m2] = 1; par[m2] = k; q.push(m2); } break; }
        if (Number.isFinite(g3) && g3 > g + STEP_UP) break;
      }
    }
    if (hooks.length) { const [cx, cz] = centre(k); for (const p of hooks) if (!p.done && (p.x - cx) ** 2 + (p.z - cz) ** 2 < HOOK_R * HOOK_R && Math.abs((p.y ?? 0) - g) < HOOK_RISE) { p.done = true; push(cellOf(p.to[0], p.to[1]), k); } }
  }
  const reachable = (x, z) => { const k = cellOf(x, z); return k >= 0 && !!seen[k]; };
  const anyIn = (ax0, ax1, az0, az1) => { for (let x = ax0 + 4; x < ax1; x += 10) for (let z = az0 + 4; z < az1; z += 10) if (reachable(x, z)) return [x, z]; return null; };
  const near = (x, z, r) => { let best = null, bd = 1e9; for (let dx = -r; dx <= r; dx += 10) for (let dz = -r; dz <= r; dz += 10) { const d = Math.hypot(dx, dz); if (d <= r && d < bd && reachable(x + dx, z + dz)) { bd = d; best = [x + dx, z + dz]; } } return best; };
  const blocked = (x, z, r) => { const g = groundAt(W, x, z); return !Number.isFinite(g) || blockedAt(x, z, g, r); };
  /** full = every cell of the route (20 apart, axis-aligned steps: a bot that has to jump ledges needs them all); default = every second cell */
  const path = (x, z, full = false) => { let k = cellOf(x, z); if (k < 0 || !seen[k]) return null; const out = []; for (; k >= 0; k = par[k]) out.push(centre(k)); out.reverse(); const thin = full ? out : out.filter((_, i) => i % 2 === 0 || i === out.length - 1); thin.push([x, z]); return thin; };
  return { reachable, anyIn, near, blocked, path, cells, ground: (x, z) => groundAt(W, x, z) };
}
