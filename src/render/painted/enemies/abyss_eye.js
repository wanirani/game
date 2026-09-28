// T1 painted floater: 심연의 눈 (abyss_eye) — a wrinkled flesh sac around one huge veined eyeball, a bundle of tentacles
// with glowing red suckers swaying beneath it (bending chains of the painted bundle).
// The slit-pupil iris is a separate painted disc drawn CLIPPED inside the eye opening and slid toward the AI's gaze
// (e.lookA; e.beamA while aiming / firing — local angle mirrored with the facing flip), so the eye visibly tracks the
// player. The brow fold above the eye is a separate painted lid that slides down inside the same clip: idle blinks, the
// lid squints half shut while it recovers or flinches, and opens wide while it aims. AI_B.eyebeam states: idle (hover,
// tracking, blinking) · aim (1.1 s: lid opens wide, the iris locks on the beam direction, the pupil burns red → white,
// a glint crawls to the rim where the beam will leave) · fire (0.9 s sweep: white-hot iris, recoil shiver, red flare) ·
// recover (0.7 s: drooping lid, dimming ember) · hurt (flinch + flash) · death (the sac tears into drifting strips and
// the eye goes out in a burst of red sparks). The beam itself is the AI's zone (ZONE_B.beam), untouched.
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'abyss_eye', tier: 'T1', src: 'abyss_eye',
  bake: { outline: 0.4, flash: ['sac', 'tent', 'lid'], deep: { tent: 0.6 }, deepTint: 'rgb(150,90,100)' },
};

const EX = 232 * 0.085, EY = 212 * 0.085;       // eye opening half-axes (logical px, from the cut: eyeEllipse × k)
const E = [0, 0];
// tentacles under the sac: x offset from centre, direction, length scale, phase, variant
const TENT = [[-14, 2.0, 0.9, 0, 'deep'], [13, 1.2, 0.85, 1.9, 'deep'], [-6, 1.75, 1.05, 3.3, 'base'], [7, 1.42, 1.0, 4.6, 'base'], [0, 1.6, 1.15, 5.8, 'base']];

function pose(e) {
  const t = e.t ?? 0, an = e.anim, P = e.params ?? {};
  const q = { bob: Math.sin(t * 1.6) * 2, s: 1 + Math.sin(t * 2.3) * 0.015, open: 0.95, ak: 0, fire: 0, rec: 0, shake: 0 };
  if (an === 'aim') { q.ak = clamp((e.stateT ?? e.animT ?? 0) / (P.aim ?? 1.1), 0, 1); q.open = 0.9 + q.ak * 0.1; }
  else if (an === 'fire') { q.fire = 1; q.open = 1; q.shake = 1; }
  else if (an === 'recover') { q.rec = 1 - clamp((e.stateT ?? 0) / 0.7, 0, 1); q.open = lerp(0.95, 0.42, q.rec); }
  else if (Math.sin(t * 0.8) > 0.975) q.open = 0.08;                   // idle blink
  const hurt = K.hurtOf(e);
  if (hurt) q.open = Math.min(q.open, 0.45);
  return q;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, q = pose(e);
  const la = e.facing < 0 ? Math.PI - (e.lookA ?? 0.4) : (e.lookA ?? 0.4);   // world gaze → local (the dispatcher mirrors x)
  const sx0 = q.shake ? Math.sin(t * 70) * 0.8 : 0;
  const cx = sx0, cy = -35 + q.bob;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { e._pcorpse = true; die(e, world, rig, q, cx, cy, la); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.08 * sq, 1 - 0.08 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(cx, cy, 64, '#ff2a3a', 0.16 + q.ak * 0.3 + q.fire * 0.45);
  // tentacles (behind the sac: their stump hides under it)
  const n = K.lod() === 0 ? 3 : 5, seg = K.lod() === 0 ? 4 : 7;
  for (let i = TENT.length - n; i < TENT.length; i++) {
    const [x, dir, L, ph, vn] = TENT[i];
    const w = Math.sin(t * 2.4 + ph) * 0.18;
    K.chain('tent', cx + x, cy + 22, dir + w, L * (1 - q.fire * 0.08), seg, (u, j) => (j === 0 ? 0 : Math.sin(t * 3 + ph + u * 5) * 0.12 * (1 + q.fire)), 1, vn);
  }
  K.put('sac', 'a', cx, cy, 0, q.s, q.s);
  // the eye: iris + lid clipped to the opening
  K.pivotPos('sac', 'a', 'eye', cx, cy, 0, q.s, q.s, E);
  const rx = EX * q.s, ry = EY * q.s;
  K.local();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(E[0], E[1], rx * 0.97, ry * 0.97, 0, 0, Math.PI * 2); ctx.clip();
  const off = rx * 0.36, ix = E[0] + Math.cos(la) * off, iy = E[1] + Math.sin(la) * off * 0.9;
  K.put('iris', 'a', ix, iy, 0, 1 + q.ak * 0.08, 1 + q.ak * 0.08);
  if (!o.flash) {
    // the pupil burns: red while it aims, white-hot while it fires
    const burn = q.fire ? 1 : q.ak > 0.4 ? (q.ak - 0.4) / 0.6 : 0;
    if (burn > 0) { K.glow(ix, iy, 9 + 8 * burn, '#ff3040', burn); K.glow(ix, iy, 3 + 4 * burn, '#ffffff', burn * (q.fire ? 1 : 0.6)); }
    if (q.rec > 0) K.glow(ix, iy, 8, '#ff5040', q.rec * 0.6);
  }
  if (q.open < 0.985) K.put('lid', 'a', E[0], E[1] + (1 - q.open) * 2 * ry, 0, q.s, q.s);
  ctx.restore();
  if (!o.flash) {
    if (q.ak > 0.7) glint(ctx, E[0] + Math.cos(la) * rx, E[1] + Math.sin(la) * ry, 6 + 5 * Math.sin(t * 40), '#ff9090', (q.ak - 0.7) * 3.3);
    if (q.fire) K.glow(E[0] + Math.cos(la) * rx, E[1] + Math.sin(la) * ry, 22, '#ff4050', 0.9);
    const hurt = K.hurtOf(e);
    if (hurt) K.glow(cx, cy, 40, '#ff6060', 0.3 * hurt);
  }
  // red motes dripping off the sucker tips (world space)
  if (o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(K.lod() === 0 ? 8 : 14));
    const dt = pool.step(K.clockOf(e, world));
    if (dt > 0 && !o.flash) {
      const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
      for (let k = pool.rate(0, 3 + q.ak * 4 + q.fire * 8, dt); k > 0; k--) pool.add(3, e.cx + f * (cx + K.frand(-12, 12)) * sc, e.bottom + (cy + K.frand(30, 52)) * sc, K.frand(-8, 8), K.frand(10, 40), K.frand(0.4, 0.8), K.frand(1.2, 2.2), '#ff4a5a');
    }
    if (pool.n) { ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore(); }
  }
  K.end();
}

function die(e, world, rig, q, cx, cy, la) {
  const E0 = [cx + Math.cos(la) * 5, cy + 2 + Math.sin(la) * 4];
  K.spawnDissolve(world, e, rig, [
    { name: 'sac', pv: 'a', x: cx, y: cy, rot: 0, sx: q.s, sy: q.s },
    { name: 'iris', pv: 'a', x: E0[0], y: E0[1], rot: 0, sx: 0.9, sy: 0.9 },
  ], { life: 0.85, strips: 12, drift: 60, rise: 12, col: '#ff4a5a', kind: 3, n: 26, spread: 200, glow: '#ff2a3a', cy: cy });
}
