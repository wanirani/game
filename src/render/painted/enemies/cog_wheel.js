// T1 painted sprite: 굴러오는 톱니 (cog_wheel, 44×44). One painted bronze cogwheel ringed with steel saw teeth (Kling
// reference) that turns with the distance rolled (AI's e.rot), and a disc of its burning mechanical eye + bezel cut from the
// same image, drawn un-rotated over the hub so the slit pupil always stays upright.
// Driven by AI_B.roller: roll (rot = distance / radius; fast rolls leave motion-blurred afterimages and scrape sparks off
// the floor) · wind (0.45 s: spins up in place, heats up orange, sparks spray behind, glint above → charges) · hurt (flash
// + squash) · death (the wheel and the eye break apart and clatter onto the floor, sparks).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint } from './_biped.js';
import { claimDeathDebris } from './blood_skeleton.js';

export const spec = {
  id: 'cog_wheel', tier: 'T1', src: 'cog_wheel',
  bake: { outline: 0.35 },
};

function die(e, world, rig, R, rot) {
  e._pcorpse = true;
  claimDeathDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  K.spawnCorpse(world, e, rig, [
    { name: 'wheel', pv: 'a', x: 0, y: -R, rot, sx: 1, sy: 1, vx: kb * 120 + K.frand(-40, 40), vy: -K.frand(160, 260), vr: kb * 9 + K.frand(-3, 3) },
    { name: 'eye', pv: 'a', x: 0, y: -R, rot: 0, sx: 1, sy: 1, vx: -kb * 60 + K.frand(-60, 60), vy: -K.frand(240, 360), vr: K.frand(-12, 12) },
  ], { life: 1.4, fade: 0.5, bounce: 0.35, dust: { n: 10, w: 16, h: 10, col: '#ffb040', k: 3 } });
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  // e.rot is the world roll angle (distance / radius); the local frame is mirrored when facing left, so the spin is
  // mirrored back with the facing sign — otherwise a wheel rolling left turns clockwise (skids backwards)
  const R = (e.def?.size?.h ?? 44) / 2, rot = (e.rot ?? t) * (e.facing < 0 ? -1 : 1);
  const wind = an === 'wind', fast = Math.abs(e.vx ?? 0) > 180;
  const heat = wind ? clamp(at / 0.45, 0, 1) : fast ? 0.7 : 0.35;
  if (e.dying > 0 && world) { if (!e._pcorpse) die(e, world, rig, R, rot); return; }
  const sq = K.squashK(e);
  const sx = 1 + 0.06 * sq, sy = 1 - 0.08 * sq;
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(R * 0.8, 0.45);
  if (!o.flash) K.glow(0, -R, R * 1.5, '#ff9a3a', 0.12 + heat * 0.3);
  // motion afterimages trail behind the roll (local -x = behind when moving forward)
  if (fast && !o.flash && K.lod() > 0) {
    const d = Math.sign(e.vx) * (e.facing < 0 ? -1 : 1) || 1;
    for (let i = 2; i >= 1; i--) K.put('wheel', 'a', -d * i * 6, -R, rot - d * i * 0.35, sx, sy, 0.16 / i);
  }
  K.put('wheel', 'a', 0, -R * sy, rot, sx, sy);
  K.put('eye', 'a', 0, -R * sy, 0, sx, sy);
  if (!o.flash) {
    const pk = 0.5 + 0.5 * Math.sin(t * 6);
    K.glow(0, -R * sy, 7 + heat * 6, '#ff8a2a', 0.35 + heat * 0.45 + pk * 0.1, 0.15);
    if (wind) glint(ctx, R * 0.7, -R * 1.7, 4 + 5 * heat, '#ffd080', heat);
  }
  K.end();
  // scrape sparks off the floor (render-only, per second of game time); the AI adds its own gameplay sparks on hits
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(18));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
    const rate = wind ? 22 * heat : fast && e.onGround !== false ? 10 : 0;
    if (rate > 0) for (let n = pool.rate(0, K.lod() === 0 ? rate * 0.5 : rate, dt); n > 0; n--) pool.add(3, e.cx - f * R * 0.5 * sc, e.bottom - 1, -f * K.frand(60, 220), K.frand(-220, -60), K.frand(0.15, 0.35), K.frand(1.2, 2.2), '#ffc060');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
