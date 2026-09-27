// T1 painted sprite: 벼룩 사내 (flea_man). Three painted frames of the same hunched goblin (one Kling image): idle
// (hunched, giggling), crouch (coiled — the jump tell) and leap (stretched out, legs kicked back); frames swap with a
// short cross-fade and are squashed/stretched and tilted by the jump velocity.
// Driven by AI_A.flea: idle (giggle bob, head jitter) · crouch (0.14 s before every hop: squashes down, the knife
// glints) · jump (leap frame, tilts along the flight arc: nose up while rising, down while falling, stretched by speed) ·
// hurt (flash + squash) · death (strip dissolve with ragged cloth scraps).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'flea_man', tier: 'T1', src: 'flea_man',
  bake: { outline: 0.35 },
};

const _q = [0, 0];

function frameOf(e) {
  const air = e.anim === 'jump' || (e.onGround === false && e.anim !== 'idle' && e.anim !== 'crouch');
  return air ? 'leap' : e.anim === 'crouch' ? 'crouch' : 'idle';
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  const fr = frameOf(e);
  // short cross-fade between frames (render-side memory on the entity)
  if (e._ffr !== fr) { e._fprev = e._ffr; e._ffr = fr; e._fT = t; }
  const fade = e._fprev ? clamp((t - (e._fT ?? t)) / 0.08, 0, 1) : 1;
  const sq = K.squashK(e);
  const vx = Math.abs(e.vx ?? 0), vy = e.vy ?? 0;
  const place = (name, a) => {
    if (name === 'leap') {
      const tilt = clamp(vy / 900, -0.45, 0.55), st = 1 + Math.min(0.18, Math.hypot(vx, vy) * 0.00022);
      K.put('leap', 'a', 0, -20, tilt, st * (1 + sq * 0.1), (2 - st) * (1 - sq * 0.1), a);
    } else {
      const crouch = name === 'crouch';
      const bob = crouch ? 0 : Math.abs(Math.sin(t * 9)) * 1.4;
      const sx = (crouch ? 1.1 : 1 + Math.sin(t * 9) * 0.02) * (1 + sq * 0.12), sy = (crouch ? 0.84 : 1 - Math.sin(t * 9) * 0.02) * (1 - sq * 0.12);
      K.put(name, 'a', 0, -bob, crouch ? 0.05 : Math.sin(t * 5) * 0.04, sx, sy, a);
    }
  };
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      const p = fr === 'leap' ? { name: 'leap', pv: 'a', x: 0, y: -20, rot: 0 } : { name: fr, pv: 'a', x: 0, y: 0, rot: 0 };
      K.spawnDissolve(world, e, rig, [p], { life: 0.7, strips: 10, drift: 44, rise: 12, col: '#6a3a70', kind: 4, n: 16, spread: 150, cy: -18 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (fr !== 'leap') K.shadow(11);
  if (fade < 1 && e._fprev) place(e._fprev, 1 - fade);
  place(fr, fade);
  if (!o.flash) {
    // yellow eye glint so the tiny goblin still reads on dark stages
    const src = fr === 'leap' ? ['leap', 0, -20] : [fr, 0, 0];
    K.pivotPos(src[0], 'a', 'eye', src[1], src[2], 0, 1, 1, _q);
    K.glow(_q[0], _q[1], 3, '#ffe060', 0.55);
    if (fr === 'crouch') {
      K.pivotPos('crouch', 'a', 'tip', 0, 0, 0.05, 1.1, 0.84, _q);
      glint(ctx, _q[0], _q[1], 6, '#ffe080', 0.75);
    }
  }
  K.end();
}
