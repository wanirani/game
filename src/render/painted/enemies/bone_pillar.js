// T1 painted sprite: 해골 기둥 (bone_pillar). A column of stacked vertebrae on a heap of bones and small skulls, crowned
// by three skulls: the horned dragon skull on top and the fanged skull below it are placed by their MOUTH pivots on the
// AI's two muzzle points (84 / 62 px above the feet, 16 px forward), a smaller darkened fanged skull sits lower down.
// Every skull bobs on its own; the mouths glow like a furnace.
// Driven by AI_A.pillar (never moves): idle (slow bob, embers in the jaws, heat shimmer glow) · charge (params.chargeT:
// the skulls rattle harder and harder, the mouths heat from orange to white, glints on both muzzles) · fire (the top
// skull, then the middle one 0.25 s later, recoil with a flash burst) · hurt (flash + shake) · death (the skulls and the
// column topple as tumbling corpse pieces, bone dust).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint, claimDebris } from './_biped.js';
import { Placer } from './blood_skeleton.js';

export const spec = {
  id: 'bone_pillar', tier: 'T1', src: 'bone_pillar',
  bake: { outline: 0.4, deep: { skull2: 0.62 }, deepTint: 'rgb(150,120,110)' },
};

const P = new Placer();
const _q = [0, 0];

function layout(e, heat, recoil) {
  P.reset();
  const t = e.t ?? 0, charge = e.anim === 'charge';
  const shake = (ph) => (charge ? Math.sin(t * 50 + ph) * 1.2 * heat : 0) + (e.flashT > 0 ? Math.sin(t * 70 + ph) * 1 : 0);
  P.place('column', 5, 0, 0);
  const s3 = P.place('skull2', 1 + shake(0.3), -38 + Math.sin(t * 1.5 + 0.3) * 0.6, Math.sin(t * 1.5 + 0.3) * 0.05, 'deep', 0.8, 0.8, 'a');
  s3.role = 3;
  const s2 = P.place('skull2', 15 + shake(1.1), -59 + Math.sin(t * 1.5 + 1.1) * 0.6, Math.sin(t * 1.5 + 1.1) * 0.05 - recoil[1] * 0.25, 'base', 1, 1, 'mouth');
  s2.role = 2;
  const s1 = P.place('skull1', 15 + shake(2), -81 + Math.sin(t * 1.5 + 2) * 0.6, Math.sin(t * 1.5 + 2) * 0.05 - recoil[0] * 0.25, 'base', 1, 1, 'mouth');
  s1.role = 1;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const wind = e.params?.chargeT ?? 0.6;
  const charge = an === 'charge', fire = an === 'fire';
  // AI: 'charge' until chargeT, then 'fire' (animT restarts): top skull fires at once, the middle one 0.25 s later
  const heat = charge ? clamp(at / wind, 0, 1) : fire ? clamp(1 - at / 0.55, 0, 1) : 0.15 + 0.1 * Math.sin(t * 3);
  const rc = [fire ? clamp(1 - at / 0.18, 0, 1) : 0, fire && at > 0.25 ? clamp(1 - (at - 0.25) / 0.18, 0, 1) : 0];
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      claimDebris(world, e);
      K.begin(ctx, rig, 0); layout(e, 0, [0, 0]); K.end();
      const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
      P.corpse(world, e, rig, (p) => p.name === 'column' ? [kb * 20, -60, K.frand(-2, 2)] : [kb * 40 + K.frand(-120, 120), -K.frand(160, 360), K.frand(-7, 7)],
        { life: 1.7, fade: 0.55, bounce: 0.3, dust: { n: 10, w: 16, h: 50, col: '#c8b898' } });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  K.shadow(20);
  if (!o.flash) K.glow(4, -70, 40, '#ff6a20', 0.12 + 0.3 * heat);
  layout(e, heat, rc);
  P.draw();
  if (!o.flash) {
    for (let i = 0; i < P.n; i++) {
      const p = P.L[i];
      if (!p.role) continue;
      K.pivotPos(p.name, p.pv, 'mouth', p.x, p.y, p.rot, p.sx, p.sy, _q);
      const mx = _q[0], my = _q[1];
      const big = p.role === 1 ? 1 : p.role === 2 ? 0.9 : 0.6;
      const burst = p.role === 1 ? rc[0] : p.role === 2 ? rc[1] : 0;
      K.glow(mx - 2, my - 1, (6 + 12 * heat + 14 * burst) * big, '#ff7a2a', (0.35 + 0.55 * heat + burst) * (p.role === 3 ? 0.5 : 1));
      if (heat > 0.4 || burst > 0) K.glow(mx - 2, my - 1, (3 + 5 * heat + 8 * burst) * big, '#fff0a0', Math.max(heat - 0.3, burst));
      K.pivotPos(p.name, p.pv, 'eye', p.x, p.y, p.rot, p.sx, p.sy, _q);
      K.glow(_q[0], _q[1], 2.6 * big, '#ff5a20', 0.55 + 0.4 * heat);
    }
    if (charge && heat > 0.55) { glint(ctx, 17, -81, 5 + 6 * heat, '#ffc080', (heat - 0.55) / 0.45); glint(ctx, 16, -59, 4 + 5 * heat, '#ffc080', (heat - 0.55) / 0.45); }
  }
  K.end();
}
