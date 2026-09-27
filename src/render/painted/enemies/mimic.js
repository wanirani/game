// T1 painted sprite + hinged jaw: 미믹 (mimic). Parts: the open chest body (spider legs, lower teeth, maw with the
// single yellow eye, lolling tongue), its lid with the upper teeth (hinged at the back corner, so the jaw can chomp)
// and the closed, legless chest used as the disguise.
// States (AI.mimic → AI.jumper): closed (disguise: sits like a treasure chest, the lid breathes a hair open now and
// then and a red glint leaks from the seam — a hint for sharp-eyed hunters) · open (0.35 s wake: the chest pops, the
// closed frame crossfades into the monster, the lid flies open) · hunt idle (crouched on its legs, lid chomping,
// eye glowing) · jump (stretches on take-off, squashes on the way down, the jaw snaps fast, tilts with the arc) ·
// hurt (flash + squash, lid jolts open) · death (strip dissolve + a burst of gold sparks — AI drops the loot).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';
import { claimDeathDebris } from './skeleton.js';

export const spec = {
  id: 'mimic', tier: 'T1', src: 'mimic',
  bake: { outline: 0.45 },
};

const _q = [0, 0];

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const closed = an === 'closed';
  const wake = an === 'open' ? clamp(at / 0.35, 0, 1) : closed ? 0 : 1;
  const air = an === 'jump' || (!closed && e.onGround === false);
  const vy = e.vy ?? 0;

  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      claimDeathDebris(world, e);                   // the gold dissolve replaces the generic metal chips (material 'metal')
      K.begin(ctx, rig, 0);
      K.pivotPos('box', 'a', 'hinge', 0, 0, 0, 1, 1, _q);
      K.end();
      K.spawnDissolve(world, e, rig, [{ name: 'box', pv: 'a', x: 0, y: 0, rot: 0 }, { name: 'lid', pv: 'a', x: _q[0], y: _q[1], rot: -0.2 }],
        { life: 0.8, strips: 11, drift: 50, rise: 10, col: '#ffd060', kind: 3, n: 22, spread: 190, glow: '#ffcf60', cy: -18 });
    }
    return;
  }

  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(22, air ? 0.2 : 0.4);
  // ── disguise (and the first half of the wake-up crossfade) ──
  if (wake < 1) {
    const breathe = closed ? Math.max(0, Math.sin(t * 1.3)) ** 6 : 0;
    const pop = an === 'open' ? Math.sin(wake * Math.PI) * 0.12 : 0;
    const a = an === 'open' ? 1 - ease.inQuad(wake) : 1;
    K.put('closed', 'a', 0, 0, 0, 1 + pop + sq * 0.1, 1 + breathe * 0.02 + pop * 0.6 - sq * 0.1, a);
    if (closed && !o.flash && Math.sin(t * 0.7) > 0.85) {
      K.pivotPos('closed', 'a', 'seam', 0, 0, 0, 1, 1 + breathe * 0.02, _q);
      glint(ctx, _q[0] + 3, _q[1], 4, '#ff5050', (Math.sin(t * 0.7) - 0.85) / 0.15);
    }
    if (closed) { K.end(); return; }
  }
  // ── the monster ──
  const chompF = air ? 16 : 7;
  let lidRot = 0.36 * Math.abs(Math.sin(t * chompF));                   // 0 = wide open (as painted), + = jaw closing
  if (an === 'open') lidRot = lerp(0.95, 0, ease.outBack(wake));        // bursts open while waking
  if (hurt) lidRot = -0.15;
  // take-off stretch / landing squash, hop bob while crouching, tilt with the jump arc
  let sx = 1, sy = 1, tilt = 0, lift = 0;
  if (air) { const k = clamp(-vy / 700, -1, 1); sx = 1 - k * 0.1; sy = 1 + k * 0.14; tilt = clamp(vy * 0.0005, -0.25, 0.25); }
  else { const hop = Math.abs(Math.sin(t * 7)); lift = hop * 1.2; sy = 1 - hop * 0.05; sx = 1 + hop * 0.04; }
  sx *= 1 + sq * 0.14; sy *= 1 - sq * 0.14;
  const alpha = an === 'open' ? ease.outQuad(clamp(wake * 1.6, 0, 1)) : 1;
  K.put('box', 'a', 0, -lift, tilt, sx, sy, alpha);
  K.pivotPos('box', 'a', 'hinge', 0, -lift, tilt, sx, sy, _q);
  K.put('lid', 'a', _q[0], _q[1], tilt + lidRot, sx, sy, alpha);
  if (!o.flash) {
    K.pivotPos('box', 'a', 'eye', 0, -lift, tilt, sx, sy, _q);
    K.glow(_q[0], _q[1], 4 + (1 - lidRot) * 2, '#ffc020', 0.55 * alpha * (1 - lidRot * 0.8));
    K.pivotPos('box', 'a', 'maw', 0, -lift, tilt, sx, sy, _q);
    K.glow(_q[0], _q[1], 12, '#ff3040', 0.25 * alpha * (1 - lidRot));
  }
  K.end();
}
