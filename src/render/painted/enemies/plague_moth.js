// T1 painted flyer: 역병 나방 (plague_moth, 56×40). Parts (Kling parts sheet 2): the furry wingless body (feathered
// antennae, black glass eye, banded abdomen with the tail hook, dangling legs) and one raised wing pair (forewing with
// the yellow eye-spot + hindwing, torn holes), used twice — the far pair smaller, half-transparent and a beat behind. Flapping is a
// vertical scale flip about the wing root (up 1 → edge-on → down −0.65) so the side-view wings sweep over and under
// the body. States (AI_D.moth): fly (steady 3.5 Hz beat, spore specks sifting down) · dust (cast 0.45 s, aimK: the
// moth pitches nose-down, the wings shiver fast, the eye-spots light up and a curtain of spore dust pours below it) ·
// hurt (flash, wings clap shut) · death (the wings tear off and flutter down, the body drops in a spore puff).
import * as K from '../enemy_kit.js';
import { claimDebris } from './_biped.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'plague_moth', tier: 'T1', src: 'plague_moth',
  // T1 budget (≤ 0.2 MB desktop): the wing pair is the big texture, so it is baked once (no flash, no darkened copy) —
  // the far pair is the same image drawn smaller and half-transparent, and the hurt pose claps both pairs shut
  bake: { outline: 0.4, flash: ['body'] },
};

const _q = [0, 0], _r = [0, 0];
const Q = { ph: 0, up: 0, upF: 0, bob: 0, rot: 0, dust: 0, fold: 0 };
function pose(e) {
  const t = e.t ?? 0, q = Q, dusting = e.anim === 'dust';
  q.dust = dusting ? clamp(e.aimK ?? 0, 0, 1) : 0;
  q.ph = t * (dusting ? 34 : 22);
  q.up = (Math.sin(q.ph) + 1) / 2; q.upF = (Math.sin(q.ph - 0.45) + 1) / 2;
  q.bob = -(1 - q.up) * 2.2 + Math.sin(t * 2.1) * 1.2;
  q.rot = clamp((e.vx ?? 0) * (e.facing < 0 ? -1 : 1) / 900, -0.12, 0.2) + 0.04 + 0.28 * q.dust;
  q.fold = 0;
  if (K.hurtOf(e)) { q.fold = 1; q.rot -= 0.25; }
  return q;
}

const L = { bx: 0, by: 0, rx: 0, ry: 0 };
function layout(q) {
  L.bx = 0; L.by = -20 + q.bob;
  K.pivotPos('body', 'a', 'root', L.bx, L.by, q.rot, 1, 1, _q); L.rx = _q[0]; L.ry = _q[1];
  return L;
}
/** wing flip: up 1 = raised as painted, 0 = swept down under the body (mirrored, shorter); fold = clapped shut above */
function wingSY(up, fold) { return lerp(lerp(-0.65, 1, up), 0.35, fold); }
function wingRot(up, rot) { return rot + lerp(0.3, -0.12, up); }

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      K.spawnCorpse(world, e, rig, [
        { name: 'wing', pv: 'a', x: L.rx + 2, y: L.ry - 1, rot: wingRot(q.upF, q.rot), sy: wingSY(q.upF, 0) * 0.92, vx: K.frand(-80, -20), vy: -K.frand(40, 120), vr: K.frand(-4, 4) },
        { name: 'body', pv: 'a', x: L.bx, y: L.by, rot: q.rot, vx: K.frand(-30, 30), vy: -K.frand(20, 80), vr: K.frand(-3, 3) },
        { name: 'wing', pv: 'a', x: L.rx, y: L.ry, rot: wingRot(q.up, q.rot), sy: wingSY(q.up, 0), vx: K.frand(20, 90), vy: -K.frand(60, 160), vr: K.frand(-5, 5) },
      ], { life: 1.4, fade: 0.5, bounce: 0.2, grav: 900, dust: { n: 10, w: 20, h: 20, col: '#9ab84a', k: 0 } });
    }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  layout(q);
  if (!o.flash) K.glow(0, -16 + q.bob, 22 + 18 * q.dust, '#9ac83a', 0.18 + 0.3 * q.dust);
  // far wing pair (darkened, a beat behind), body, near wing pair
  const tr = q.dust * Math.sin(t * 90) * 0.05;
  if (!o.flash) K.put('wing', 'a', L.rx + 2.5, L.ry - 1, wingRot(q.upF, q.rot) - tr, 0.92, wingSY(q.upF, q.fold) * 0.92, 0.55);
  K.put('body', 'a', L.bx, L.by, q.rot, 1, 1);
  const rotN = wingRot(q.up, q.rot) + tr, syN = wingSY(q.up, q.fold);
  K.put('wing', 'a', L.rx, L.ry, rotN, 1, syN);
  if (!o.flash) {
    // the painted eye-spot stares when it dusts; the real eye glints
    const eyeA = 0.15 + 0.75 * q.dust;
    if (Math.abs(syN) > 0.25) { K.pivotPos('wing', 'a', 'eye1', L.rx, L.ry, rotN, 1, syN, _r); K.glow(_r[0], _r[1], 3 + 4 * q.dust, '#e8ff7a', eyeA); }
    K.pivotPos('body', 'a', 'eye', L.bx, L.by, q.rot, 1, 1, _q); K.glow(_q[0], _q[1], 2, '#c8ff6a', 0.5);
  }
  K.end();
  // spore specks sift off the wings; the dust state pours a curtain of them (camera space)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(24));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    const base = K.lod() === 0 ? 1 : 2.5;
    for (let n = pool.rate(0, base + q.dust * (K.lod() === 0 ? 12 : 28), dt); n > 0; n--) {
      pool.add(3, e.cx + f * sc * K.frand(-22, 10), e.bottom - sc * K.frand(8, 24), K.frand(-15, 15), K.frand(30, 70) + q.dust * 60, K.frand(0.5, 1.0), K.frand(1, 1.8), '#c8ff6a');
    }
    if (q.dust > 0.3) for (let n = pool.rate(1, K.lod() === 0 ? 3 : 7, dt); n > 0; n--) pool.add(0, e.cx + f * sc * K.frand(-16, 12), e.bottom + sc * K.frand(-4, 10), K.frand(-20, 20), K.frand(20, 50), K.frand(0.5, 0.9), K.frand(4, 7), '#9ac83a');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
