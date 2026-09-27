// T1 painted sprite + procedural deformation: 무의 파편 (nihil_spawn, 48×48). Parts (from the chosen Kling reference):
// the obsidian crystal cluster with the white-hot core, and three loose shards that orbit it (drawn behind the core on
// the far half of the orbit, in front on the near half). Prismatic edge glints, the core flare and void motes are
// procedural VFX (render RNG only).
// States (AI_B.chaos): idle (slow hover wobble) · walk (lurching hops, shards trail) · swell (0.6 s: the cluster
// swells ×1.3 and shudders, shards are pulled in, the core flares white → the AI fires 5 orbs) · leap (stretched along
// the jump, spinning) · hurt (flash + squash, shards flung out) · death (shatter: strip dissolve + prismatic sparks).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';

export const spec = {
  id: 'nihil_spawn', tier: 'T1', src: 'nihil_spawn',
  bake: { outline: 0.35, deep: { shardA: 0.55, shardB: 0.55, shardC: 0.55 }, deepTint: 'rgb(120,110,160)' },
};

const PRISM = ['#ff5a8a', '#ffe05a', '#5affb0', '#5a9aff', '#c86aff'];
const SH = ['shardA', 'shardB', 'shardC'];
const _q = [0, 0];
const FRONT = new Float32Array(12);                 // near-half shards drawn after the core: (index, x, y, rot) × 3, reused

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const sw = an === 'swell' ? clamp(at / 0.6, 0, 1) : 0;
  const leap = an === 'leap', walk = an === 'walk';
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const hov = -27 - Math.sin(t * 2.2) * 2.5 - (walk ? Math.abs(Math.sin(t * 5)) * 4 : 0);
  const shake = sw > 0.3 ? (K.h1(Math.floor(t * 40)) - 0.5) * 2.4 * sw : 0;
  const pul = 1 + sw * 0.3 + Math.sin(t * (4 + sw * 22)) * (0.025 + sw * 0.05);
  const sx = leap ? 0.86 : pul + sq * 0.12, sy = leap ? 1.18 : pul - sq * 0.12;
  const rot = leap ? t * 9 : Math.sin(t * 0.8) * 0.08 + (hurt ? -0.2 : 0);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'core', pv: 'a', x: 0, y: hov, rot }], { life: 0.8, strips: 12, drift: 70, rise: 10, col: '#e8e0ff', kind: 3, n: 26, spread: 230, glow: '#ffffff', cy: -27 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(0, hov, 30 + 40 * sw, '#8a6aff', 0.28 + 0.4 * sw);
  // orbiting shards: pulled in while swelling, flung out when hit
  const R = (24 + 5 * Math.sin(t * 1.3)) * (1 - 0.45 * sw) + (hurt ? 8 : 0);
  let nf = 0;
  for (let i = 0; i < 3; i++) {
    const a = t * (1.3 + i * 0.35) * (walk ? 1.5 : 1) + i * 2.1;
    const x = Math.cos(a) * R, y = hov + Math.sin(a) * R * 0.45 - (leap ? 6 : 0);
    const r = a * 0.7 + i;
    if (Math.sin(a) < 0) K.put(SH[i], 'a', x + shake, y, r, 0.9, 0.9, 1, 'deep');
    else { FRONT[nf] = i; FRONT[nf + 1] = x; FRONT[nf + 2] = y; FRONT[nf + 3] = r; nf += 4; }
  }
  K.put('core', 'a', shake, hov, rot, sx, sy);
  for (let j = 0; j < nf; j += 4) K.put(SH[FRONT[j]], 'a', FRONT[j + 1] + shake, FRONT[j + 2], FRONT[j + 3], 1, 1);
  if (!o.flash) {
    // white-hot core + prismatic glints travelling along the crystal tips
    K.glow(shake, hov, 7 + 12 * sw, '#ffffff', 0.85, 0.2);
    K.glow(shake, hov, 16 + 20 * sw, '#dcd4ff', 0.35 + 0.4 * sw);
    for (let i = 0; i < 3; i++) {
      const g = (t * 0.9 + i / 3) % 1;
      const a = i * 2.2 + t * 0.4, r = 10 + 12 * g;
      K.glow(shake + Math.cos(a + rot) * r * sx, hov + Math.sin(a + rot) * r * sy, 2.2, PRISM[(i + Math.floor(t * 2)) % 5], Math.sin(g * Math.PI) * 0.9);
    }
    K.pivotPos('core', 'a', 'top', shake, hov, rot, sx, sy, _q);
    K.glow(_q[0], _q[1] + 2, 3, PRISM[Math.floor(t * 3) % 5], 0.6);
  }
  K.end();
  // void motes rising from the cluster (camera space, per-second emission)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(16));
    const dt = pool.step(K.clockOf(e, world));
    const sc = e.scale || 1;
    for (let n = pool.rate(0, (K.lod() === 0 ? 2 : 4) + sw * 14, dt); n > 0; n--) {
      pool.add(0, e.cx + K.frand(-16, 16) * sc, e.bottom + (hov + K.frand(-12, 12)) * sc, K.frand(-12, 12), K.frand(-40, -15), K.frand(0.5, 1), K.frand(2, 4), sw > 0.4 ? '#f0e8ff' : '#9a7aff');
    }
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
