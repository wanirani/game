// T1 painted sprite: 살인 물고기 (killer_fish, 38×26). One painted piranha (Kling reference): deep navy back, blood-red
// belly, a gaping underbite full of jagged teeth, a furious red eye. The body bends through a mesh-free strip warp that
// grows from the rigid head to the tail (swim wave), the whole fish pitches along its leap velocity.
// Driven by AI_B.fishleap: swim (under the surface: dim and water-tinted, slow tail beat, a V wake at the surface) ·
// ripple (0.35 s: the fin breaks the surface, rings spread, a glint at the lip → it leaps) · leap (fast tail thrash, nose
// follows the arc, water drips shed while rising) · hurt (flash + squash) · death (strip dissolve into spray and blood).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'killer_fish', tier: 'T1', src: 'killer_fish',
  bake: { outline: 0.3 },
};

const _q = [0, 0];
let T = 0, AMP = 1, FREQ = 12, TD = 2;
/** swim wave: u = 0 at the head pivot … 1 at the tail tip (texel offsets) */
function wave(u) {
  const d = u * u;
  _q[0] = 0; _q[1] = Math.sin(T * FREQ - u * 4.2) * d * AMP * 3.2 * TD;
  return _q;
}

/** local geometry: the fish is drawn centred at (0, CY) (feet origin = e.bottom, the body centre half a height up) */
const CY = -15, HX = 11;    // head pivot sits HX px right of the body centre

function pose(e) {
  const an = e.anim, at = e.animT ?? 0;
  const under = an === 'swim' || an === 'ripple';
  const q = { under, rot: 0, dy: 0, alpha: 1, amp: 1, freq: 10, rip: 0 };
  if (an === 'leap' || (!under && e.dying > 0)) {
    q.rot = Math.atan2(e.vy ?? 0, Math.abs(e.vx ?? 1) + 1) * 0.85;
    q.amp = 1.5; q.freq = 18;
  } else if (under) {
    q.alpha = 0.5; q.dy = 4; q.amp = 0.8; q.freq = 8;
    if (an === 'ripple') { q.rip = clamp(at / 0.35, 0, 1); q.dy = 4 - 3 * q.rip; q.alpha = 0.55 + 0.25 * q.rip; q.amp = 1.3; q.freq = 16; }
  }
  return q;
}

function die(e, world, rig, q) {
  e._pcorpse = true;
  K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'head', x: HX, y: CY + q.dy, rot: q.rot, sx: 1, sy: 1 }],
    { life: 0.7, strips: 8, drift: 50, rise: 8, col: '#bfe8ff', kind: 1, n: 16, spread: 170, cy: -13 });
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e);
  T = e.t ?? 0; TD = rig.td; AMP = q.amp; FREQ = q.freq;
  if (e.dying > 0 && world) { if (!e._pcorpse) die(e, world, rig, q); return; }
  const sq = K.squashK(e);
  const sx = 1 - 0.08 * sq, sy = 1 + 0.1 * sq;
  const surf = -(e.def?.size?.h ?? 26) - 6;             // water surface in local coords while the fish lurks (AI: y = baseY + 6)
  K.begin(ctx, rig, K.flashK(e, o));
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * q.alpha;
  // head pivot placed HX right of the centre, rotated with the leap pitch
  const c = Math.cos(q.rot), s = Math.sin(q.rot);
  K.strips('body', 'head', c * HX, CY + q.dy + s * HX, q.rot, sx, sy, K.nStrips(8), 'x', wave, 1, 'base');
  ctx.globalAlpha = ga;
  if (!o.flash) {
    K.pivotPos('body', 'head', 'eye', c * HX, CY + q.dy + s * HX, q.rot, sx, sy, _q);
    K.glow(_q[0], _q[1], 3 + 2 * q.rip, '#ff3a2a', (q.under ? 0.5 : 0.85) + 0.3 * q.rip, 0.15);
    if (q.under) {
      // V-shaped wake / rings at the surface over the lurking fish
      K.local();
      const n = q.rip > 0 ? 3 : 2, gco = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.2;
      for (let i = 0; i < n; i++) {
        const u = (T * (q.rip > 0 ? 1.8 : 0.9) + i / n) % 1;
        ctx.globalAlpha = ga * (1 - u) * (0.35 + 0.45 * q.rip);
        ctx.strokeStyle = '#bfe8ff';
        ctx.beginPath(); ctx.ellipse(4, surf, (8 + q.rip * 10) * (0.3 + u), 1.5 + u * 2.5, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
      if (q.rip > 0.3) glint(ctx, 6, surf - 2, 4 + 4 * q.rip, '#dff4ff', (q.rip - 0.3) / 0.7);
    }
  }
  K.end();
  // water shed while leaping (render-only, per second of game time)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(14));
    const dt = pool.step(K.clockOf(e, world));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    if (!q.under) for (let n = pool.rate(0, K.lod() === 0 ? 7 : 14, dt); n > 0; n--) pool.add(1, e.cx + K.frand(-12, 12) * sc, e.bottom - K.frand(6, 20) * sc, K.frand(-30, 30), K.frand(-40, 20), K.frand(0.3, 0.55), 1.4 * sc, '#a8dcff');
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 6; i++) pool.add(1, e.cx + K.frand(-8, 8), e.bottom - 13 * sc, K.frand(-140, 140), K.frand(-200, -40), K.frand(0.3, 0.5), 1.8 * sc, '#c8303a'); }
    if (e.flashT <= 0) e._hitFx = false;
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
