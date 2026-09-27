// T1 painted sprite + procedural deformation: 시체 까마귀 (crow). Parts: flying body (head, beak, tail feathers, tucked
// talons; cut below the wing roots), one spread wing (bending chain, drawn twice: far wing darkened behind the body,
// near wing in front), and a perched frame with folded wings.
// States (AI_A.diver): perch (sits on its talons, slow breathing sway, red eye) · alert (0.45 s caw: the perched crow
// crouches and shivers, beak glint, the wings snap open in the last third; from the air: wings thrown up, body shakes)
// · dive (wings swept back, body pitched along the velocity and stretched, 26 rad/s flutter) · climb / fly / hover
// (19 / 14 rad/s wing beat, the wing tips lag the stroke, body bobs with the beat) · hurt (flash, squash, wings jolt,
// feather puff) · death (strip dissolve + tumbling black feathers).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'crow', tier: 'T1', src: 'crow',
  bake: { outline: 0.35, deep: { wing: 0.62 }, deepTint: 'rgb(150,140,190)' },
};

const _q = [0, 0];
const PI = Math.PI;
const CY = -17;                         // body pivot (flying): a little above the centre of the 38x30 logic rect (like the vector crow)
const CX = 8;                           // body shifted forward: the head reaches the front of the logic rect, the tail overhangs behind
const FEATHER = '#1a1a2c';

/** wing stroke for the flying states: dir = world angle of the wing axis (shoulder -> tip) */
function stroke(e, t) {
  const st = e.state, an = e.anim;
  if (an === 'dive' || st === 'dive') return { dir: -2.95 + Math.sin(t * 26) * 0.08, freq: 26, swept: 1 };
  if (an === 'alert' || st === 'alert') return { dir: -1.75 + Math.sin(t * 34) * 0.1, freq: 34, swept: 0 };
  const freq = st === 'hover' ? 14 : 19;
  return { dir: -2.62 + Math.sin(t * freq) * 0.86, freq, swept: 0 };
}

let BEND_T = 0, BEND_F = 19, BEND_S = 0;
const bendNear = (u) => (BEND_S ? 0.05 : -0.2 * Math.cos(BEND_T * BEND_F)) * (0.35 + u) + 0.03;
const bendFar = (u) => -bendNear(u);

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const an = e.anim, st = e.state;
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  // perched → alert: remember that the crow is sitting (render-only flag) so the alert shiver happens on its perch
  if (st === 'perch' || an === 'perch') e._perched = true;
  else if (st !== 'alert') e._perched = false;
  const perched = !!e._perched;
  const alertK = an === 'alert' || st === 'alert' ? clamp((e.stateT ?? e.animT ?? 0) / ((e.params?.alert ?? 0.45) / Math.sqrt(e.aggro || 1)), 0, 1) : 0;

  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.begin(ctx, rig, 0);
      K.pivotPos('fly', 'a', 'wr', 0, CY, 0, 1, 1, _q); const wx = _q[0], wy = _q[1];
      K.end();
      K.spawnDissolve(world, e, rig, [
        { name: 'wing', pv: 'a', x: CX + wx - 3, y: wy + 1, rot: -2.4, sx: 0.9, sy: -1, vn: 'deep' },
        { name: perched ? 'perch' : 'fly', pv: 'a', x: CX, y: perched ? 0 : CY },
        { name: 'wing', pv: 'a', x: CX + wx, y: wy, rot: -2.2, sx: 1, sy: -1 },
      ], { life: 0.75, strips: 10, drift: 46, rise: 10, col: FEATHER, kind: 4, n: 16, spread: 170, cy: CY });
    }
    return;
  }

  ctx.translate(CX, 0);
  K.begin(ctx, rig, K.flashK(e, o));
  // ── perched (and the first two thirds of a perched alert) ──
  const open = perched ? ease.inQuad(clamp((alertK - 0.62) / 0.38, 0, 1)) : 1;   // wings snap open at the end
  if (perched && open < 1) {
    const br = Math.sin(t * 2.3);
    const crouch = alertK > 0 ? Math.min(1, alertK * 2.2) : 0;
    const shake = alertK > 0 ? Math.sin((e.stateT ?? 0) * 60) * 0.04 * crouch : 0;
    const rot = br * 0.02 + shake - crouch * 0.12 - (hurt ? 0.25 : 0);
    const sx = 1 + sq * 0.12 + crouch * 0.06, sy = 1 + br * 0.015 - sq * 0.12 - crouch * 0.1;
    K.shadow(11, 0.32);
    K.put('perch', 'a', 0, 0, rot, sx, sy, 1 - open);
    if (!o.flash) {
      K.pivotPos('perch', 'a', 'eye', 0, 0, rot, sx, sy, _q);
      K.glow(_q[0], _q[1], 2.2 + crouch * 1.4, '#ff2020', (0.7 + crouch * 0.3) * (1 - open));
      if (crouch > 0) { K.pivotPos('perch', 'a', 'beak', 0, 0, rot, sx, sy, _q); glint(ctx, _q[0], _q[1] - 1, 3.5 + 3 * crouch, '#ff8080', 0.35 + 0.4 * Math.abs(Math.sin((e.stateT ?? 0) * 25))); }
    }
    if (open <= 0) { K.end(); return; }
  }
  // ── flying ──
  const W = stroke(e, t);
  const f = e.facing < 0 ? -1 : 1;
  const vx = (e.vx ?? 0) * f, vy = e.vy ?? 0;
  const A = Math.sin(t * W.freq);
  let tilt = clamp(vy * 0.0011, -0.3, 0.35) + clamp(vx * 0.0004, -0.12, 0.12);
  if (W.swept) tilt = clamp(Math.atan2(vy, Math.abs(vx) + 1), -0.7, 1.2);
  if (an === 'alert' && !perched) tilt = -0.25 + Math.sin((e.stateT ?? 0) * 30) * 0.08;
  if (hurt) tilt -= 0.3;
  const bob = W.swept ? 0 : A * 1.8;
  const stretch = W.swept ? 1.12 : 1;
  const sx = stretch * (1 + sq * 0.12), sy = (1 - sq * 0.12) / (W.swept ? 1.06 : 1);
  const alpha = perched ? open : 1;
  const y0 = perched ? lerp(-9, CY, open) : CY;
  K.pivotPos('fly', 'a', 'wr', 0, y0 + bob, tilt, sx, sy, _q); const nx = _q[0], ny = _q[1];
  K.pivotPos('fly', 'a', 'wl', 0, y0 + bob, tilt, sx, sy, _q); const fx = _q[0], fy = _q[1];
  BEND_T = t; BEND_F = W.freq; BEND_S = W.swept;
  const openDir = perched ? lerp(-2.2, W.dir, open) : W.dir;
  const jolt = hurt ? 0.5 : 0;
  const n = K.nStrips(6);
  K.chain('wing', fx, fy, openDir + tilt + 0.14 - jolt, 0.86 * open, n, bendFar, alpha, 'deep', true);
  K.put('fly', 'a', 0, y0 + bob, tilt, sx, sy, alpha);
  K.chain('wing', nx, ny, openDir + tilt - jolt, open, n, bendNear, alpha, 'base', true);
  if (!o.flash) {
    K.pivotPos('fly', 'a', 'eye', 0, y0 + bob, tilt, sx, sy, _q);
    K.glow(_q[0], _q[1], an === 'alert' ? 3.4 : 2.4, '#ff2020', 0.85 * alpha);
    if (an === 'alert' && !perched) { K.pivotPos('fly', 'a', 'beak', 0, y0 + bob, tilt, sx, sy, _q); glint(ctx, _q[0] + 2, _q[1], 7, '#ff6060', 0.5 + 0.5 * Math.sin((e.stateT ?? 0) * 25)); }
  }
  K.end();
  // a puff of loose feathers when hit (render particles, world space)
  if (!(e.flashT > 0)) e._hitFx = false;
  if (world && o.cam && (e.flashT > 0.1 || e._fx?.n)) {
    const pool = e._fx ?? (e._fx = new K.FxPool(10));
    pool.step(K.clockOf(e, world));
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let k = 0; k < 6; k++) pool.add(4, e.cx + K.frand(-8, 8), e.cy + K.frand(-6, 6), K.frand(-90, 90), K.frand(-160, -40), K.frand(0.4, 0.7), K.frand(1.6, 2.6), FEATHER); }
    ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
  }
}
