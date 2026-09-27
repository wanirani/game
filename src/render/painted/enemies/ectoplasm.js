// T1 painted sprite: 엑토플라즘 (ectoplasm). One painted translucent green blob packed with the anguished faces of the
// library's lost (its drip stalk faded out). The body wobbles through a seam-free warpY ripple, breathes, squashes
// and stretches; ectoplasm drips and wisps shed from it (render-only FxPool, per second of game time).
// Driven by AI_A.ecto: fly (slow pursuit, bob, ripple) · squash (0.35 s: flattens and bulges, the core flares, a glint
// swells on its front — then it lunges) · lunge (stretches toward the player) · hurt (flash, violent wobble, splatter)
// · the small split-off blobs (params.gen 1) are the same art scaled by the AI (e.scale) · death (strip dissolve into
// green ectoplasm).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'ectoplasm', tier: 'T1', src: 'ectoplasm',
  bake: { outline: 0.3, glow: { body: '#50ff90' } },
};

const _q = [0, 0];
let T = 0, AMP = 1, TD = 2;
function ripple(u) {       // u = 0 at the blob centre … 1 at the top / drip tips: gentle sideways sway, drips swing most
  const d = u * u;
  _q[0] = (Math.sin(T * 3.1 + u * 5.5) * 1.1 + Math.sin(T * 5.3 - u * 3) * 0.5) * AMP * (0.3 + d * 1.6) * TD; _q[1] = 0;
  return _q;
}

export function draw(ctx, e, world, o, rig) {
  T = e.t ?? 0; TD = rig.td;
  const an = e.anim, at = e.animT ?? 0;
  const squash = an === 'squash' ? clamp(at / 0.35, 0, 1) : 0;
  const lunge = an === 'lunge' ? 1 : 0;
  const sq = K.squashK(e);
  AMP = 1 + squash * 0.8 + sq * 2.5;
  const breath = Math.sin(T * 2.2) * 0.03;
  const sx = 1 + squash * 0.26 + lunge * 0.14 + breath + sq * 0.1, sy = 1 - squash * 0.24 - lunge * 0.07 - breath - sq * 0.1;
  const cx = lunge * 3, cy = -21 + Math.sin(T * 2.6) * 2 + squash * 3;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: cx, y: cy, rot: 0, sx, sy }],
        { life: 0.85, strips: 12, drift: 46, rise: 20, col: '#8affb0', kind: 0, n: 22, spread: 130, glow: '#40ff90', cy: -21 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(cx, cy, 40, '#50ff90', 0.36 + squash * 0.25);
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (o.flash ? 1 : 0.93);
  if (!o.flash && K.lod() > 1) {               // soft additive halo of its own silhouette (high quality only)
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'a', cx, cy, 0, sx * 1.05, sy * 1.05, 0.16 + 0.12 * squash, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.warpY('body', 'a', cx, cy, lunge * 0.08, sx, sy, K.nStrips(10), ripple, 1, 'base', 1);
  ctx.globalAlpha = ga;
  if (!o.flash) {
    K.pivotPos('body', 'a', 'core', cx, cy, 0, sx, sy, _q);
    const pk = 0.5 + 0.5 * Math.sin(T * 4);
    K.glow(_q[0], _q[1], 9 + pk * 3 + squash * 6, '#c8ffb0', 0.35 + pk * 0.25 + squash * 0.35, 0.15);
  }
  if (squash > 0.5) glint(ctx, cx + 17 * sx, cy, 6 + 5 * squash, '#c0ffd0', (squash - 0.5) * 2);
  K.end();
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(16));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const bx = e.cx + f * sc * cx, by = e.bottom + sc * (cy + 16 * sy);
    for (let n = pool.rate(0, 2.2, dt); n > 0; n--) pool.add(1, bx + K.frand(-12, 12) * sc, by, 0, K.frand(20, 60), K.frand(0.5, 0.9), 1.6 * sc, '#6aff9a');
    for (let n = pool.rate(1, K.lod() === 0 ? 3 : 6, dt); n > 0; n--) pool.add(0, bx + K.frand(-14, 14) * sc, by - K.frand(4, 26) * sc, -f * K.frand(4, 20) - (e.vx ?? 0) * 0.15, K.frand(-26, -6), K.frand(0.5, 1.0), K.frand(4, 8) * sc, '#7affb0');
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 7; i++) pool.add(1, bx + K.frand(-10, 10), by - K.frand(4, 30), K.frand(-120, 120), K.frand(-160, -40), K.frand(0.4, 0.7), 2 * sc, '#8affb0'); }
    if (e.flashT <= 0) e._hitFx = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
