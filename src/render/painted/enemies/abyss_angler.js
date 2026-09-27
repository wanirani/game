// T2 painted puppet: 심해 아귀 (abyss_angler). Parts (Kling parts sheet 2, the right-facing fish): body (translucent ribbed
// flank, gaping needle-tooth jaws, ragged fins, hanging barbels; the lure stalk removed), torn tail fin (swings from the
// peduncle), lure stalk + glowing bulb (sways from the forehead, the light source of the creature).
// The body undulates by sheared strips (a swim wave travelling from the head to the tail).
// Driven by AI_C.swimmer: swim (lurk / stalk: slow wave, lure bobbing) · bite (wind-up: the fish coils back, the lure
// flares — e.lure — and the jaws glint) · lunge (state 'lunge', anim bite: stretched forward, fast tail) · aim + leap (nose
// follows the velocity out of the water, dripping) · flop (stranded: thrashing on its side) · hurt (flash, squash, recoil) ·
// death (body, tail and lure fall apart as corpse pieces, the lure light dies).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';

export const spec = {
  id: 'abyss_angler', tier: 'T2', src: 'abyss_angler',
  bake: { outline: 0.4, deep: { tail: 0.8 }, deepTint: 'rgb(170,120,120)', glow: { lure: '#aef8ff' } },
};

const _q = [0, 0], _l = [0, 0];
const LURE = '#aef8ff';

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim, st = e.state;
  const f = e.facing < 0 ? -1 : 1;
  const P = e.params || {};
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const lure = clamp(e.lure ?? 0, 0, 1);
  const lunging = an === 'bite' && st === 'lunge';
  const winding = an === 'bite' && !lunging ? clamp(at / (st === 'aim' ? (P.leapWindup ?? 0.35) : (P.windup ?? 0.45)), 0, 1) : 0;
  const flop = an === 'flop', leap = an === 'leap';
  const vx = (e.vx ?? 0) * f, vy = e.vy ?? 0;
  const freq = lunging ? 16 : flop ? 22 : winding > 0 ? 9 : 6;
  let rot = clamp(vy * 0.0015, -0.3, 0.3) - (hurt ? 0.2 : 0);
  if (leap) rot = clamp(Math.atan2(vy, Math.abs(vx) + 40), -1.2, 1.2);
  if (flop) rot = Math.sin(t * 22) * 0.35 + 0.1;
  if (st === 'aim') rot = -0.35 * winding;
  const bob = flop ? 0 : Math.sin(t * 2) * 1.5;
  const ax = 4 - winding * 5 + (lunging ? 3 : 0), ay = (flop ? -13 : -22) + bob;
  const sx = (1 + sq * 0.1) * (lunging ? 1.08 : 1 - winding * 0.05), sy = (1 - sq * 0.1) * (lunging ? 0.95 : 1 + winding * 0.04);
  const tailA = Math.sin(t * freq) * (lunging ? 0.5 : flop ? 0.6 : 0.3);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.begin(ctx, rig, 0);
      K.pivotPos('body', 'a', 'tail', ax, ay, rot, sx, sy, _q); const tx = _q[0], ty = _q[1];
      K.pivotPos('body', 'a', 'lure', ax, ay, rot, sx, sy, _l);
      K.end();
      K.spawnCorpse(world, e, rig, [
        { name: 'tail', pv: 'a', x: tx, y: ty, rot: rot + tailA, sx: 1, sy: 1, vn: 'base', vx: K.frand(-90, -20), vy: -K.frand(80, 200), vr: K.frand(-6, 6) },
        { name: 'body', pv: 'a', x: ax, y: ay, rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(-40, 40), vy: -K.frand(60, 140), vr: K.frand(-2, 2) },
        { name: 'lure', pv: 'a', x: _l[0], y: _l[1], rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(20, 120), vy: -K.frand(120, 260), vr: K.frand(-8, 8) },
      ], { life: 1.4, fade: 0.5, bounce: 0.3, dust: { n: 6, w: 20, h: 12, col: '#6a8a90' } });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  // lure light (the creature's own lamp): big soft halo first, so the fish is lit from the front
  K.pivotPos('body', 'a', 'lure', ax, ay, rot, sx, sy, _l);
  const lx = _l[0], ly = _l[1];
  const lsw = Math.sin(t * 2.2) * 0.14 + (lunging ? 0.35 : 0) - winding * 0.25;
  K.pivotPos('lure', 'a', 'bulb', lx, ly, rot + lsw, 1, 1, _q);
  const bx = _q[0], by = _q[1];
  if (!o.flash) K.glow(bx, by, 26 + 26 * lure, '#5ad8ff', 0.3 + 0.35 * lure);
  // tail behind the body
  K.pivotPos('body', 'a', 'tail', ax, ay, rot, sx, sy, _q);
  K.put('tail', 'a', _q[0] + 1, _q[1], rot + tailA, 1, 1 + Math.abs(tailA) * 0.1);
  // body: swim wave (strips along x, stronger toward the tail)
  const wave = (u) => { _q[0] = 0; _q[1] = Math.sin(t * freq - u * 4) * u * u * (lunging ? 3 : 2.2) * rig.td; return _q; };
  const sn = snoutAt(ax, ay, rot, sx, sy);
  K.strips('body', 'snout', sn[0], sn[1], rot, sx, sy, K.nStrips(8), 'x', wave, 1);
  // lure stalk on top
  K.put('lure', 'a', lx, ly, rot + lsw, 1, 1);
  if (!o.flash) {
    K.glow(bx, by, 5 + 4 * lure, '#ffffff', 0.85, 0.2);
    K.glow(bx, by, 10 + 10 * lure, LURE, 0.7 + 0.3 * lure);
    K.pivotPos('body', 'a', 'eye', ax, ay, rot, sx, sy, _q);
    K.glow(_q[0], _q[1], 2.5, '#e8fff8', 0.5 + 0.4 * lure);
    // teeth glint + cold light in the maw while biting
    if (winding > 0.3 || lunging) {
      K.pivotPos('body', 'a', 'mouth', ax, ay, rot, sx, sy, _q);
      K.glow(_q[0], _q[1], 7, '#9ff4ff', lunging ? 0.7 : winding * 0.6);
      K.pivotPos('body', 'a', 'snout', ax, ay, rot, sx, sy, _q);
      K.glow(_q[0] - 2, _q[1] - 3, 3 + 3 * winding, '#ffffff', winding, 0.15);
    }
  }
  K.end();
  // bubbles in water, drips out of it
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(20));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    if (e.inWater) for (let n = pool.rate(0, lunging ? 12 : 3, dt); n > 0; n--) pool.add(0, e.cx + f * sc * K.frand(-10, 30), e.bottom - sc * K.frand(10, 30), K.frand(-10, 10), K.frand(-50, -20), K.frand(0.6, 1.1), K.frand(2, 3.5), '#bff4ff');
    else for (let n = pool.rate(1, 8, dt); n > 0; n--) pool.add(1, e.cx + f * sc * K.frand(-25, 25), e.bottom - sc * K.frand(6, 20), 0, K.frand(20, 60), K.frand(0.4, 0.7), 1.3, '#9fe8ff');
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}

/** position of the body's 'snout' pivot for a body placed with its 'a' pivot at (ax, ay) — the strip warp pivots there
 *  (u = 0 at the head, 1 at the tail) */
const _s = [0, 0];
function snoutAt(ax, ay, rot, sx, sy) { K.pivotPos('body', 'a', 'snout', ax, ay, rot, sx, sy, _s); return _s; }
