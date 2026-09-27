// T1 painted sprite: 유령 검 (phantom_sword). One painted rune-etched longsword (bat-wing gold guard, eye-gem pommel)
// turned to the AI's world angle e.swordA (π/2 = hanging point-down).
// Driven by AI_A.phantom: fly (hangs point-down, bobs and sways, violet aura, three souls orbit it) · aim (turns to the
// locked angle and trembles, the runes and the aura flare, a glint swells on the point — the lunge follows at
// params.aimT) · dash (the AI's own violet afterimage ghosts trail it; the painted blade adds three stretched
// afterimages of its baked violet silhouette) · recover · hurt (flash + squash) · death (strip dissolve, violet sparks).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { glint } from './_biped.js';
import { claimDeathDebris } from './blood_skeleton.js';

export const spec = {
  id: 'phantom_sword', tier: 'T1', src: 'phantom_sword',
  bake: { outline: 0.35, glow: { sword: '#a060ff' } },
};

const HP = Math.PI / 2;
const _q = [0, 0];

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, an = e.anim;
  const wa = e.swordA ?? HP;
  const la = (e.facing ?? 1) > 0 ? wa : Math.PI - wa;       // world angle → local (facing right)
  const aim = an === 'aim', dash = an === 'dash';
  const cx = aim ? Math.sin(t * 70) * 1.3 : 0, cy = -30 + (dash ? 0 : Math.sin(t * 2.5) * 3);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      claimDeathDebris(world, e);            // material 'metal': the dissolve replaces the vector grey scrap
      K.spawnDissolve(world, e, rig, [{ name: 'sword', pv: 'c', x: cx, y: cy, rot: la }],
        { life: 0.8, strips: 12, drift: 50, rise: 16, col: '#c890ff', kind: 3, n: 20, spread: 140, glow: '#9a50ff', cy: -30 });
    }
    return;
  }
  const sq = K.squashK(e), sx = 1 + sq * 0.1, sy = 1 - sq * 0.12;
  const ak = aim ? clamp((e.animT ?? 0) / 0.5, 0, 1) : 0;
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) {
    K.glow(cx, cy, 38, '#9a50ff', 0.42 + 0.3 * ak);
    for (let i = 0; i < 3; i++) {             // souls orbiting the blade
      const a = t * 2.2 + i * Math.PI * 2 / 3, x = cx + Math.cos(a) * 18, y = cy + Math.sin(a) * 9;
      K.glow(x, y, 7, '#c890ff', 0.8);
      K.glow(x, y, 2, '#ffffff', 0.9);
    }
    if (dash) {                               // afterimages along the dash line (baked violet silhouette, additive)
      const gco = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 3; i++) K.put('sword', 'c', cx - Math.cos(la) * i * 14, cy - Math.sin(la) * i * 14, la, 1.06, 1, 0.38 - i * 0.09, 'glow');
      ctx.globalCompositeOperation = gco;
    }
  }
  K.put('sword', 'c', cx, cy, la, sx, sy);
  if (!o.flash) {
    // runes breathe (baked violet silhouette over the blade), stronger while aiming — high quality only
    if (K.lod() > 1) {
      const gco = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter';
      K.put('sword', 'c', cx, cy, la, sx, sy, 0.12 + 0.1 * Math.sin(t * 4) + 0.3 * ak, 'glow');
      ctx.globalCompositeOperation = gco;
    }
    // the ghostly hand on the grip + the bloodshot eye in the pommel
    K.pivotPos('sword', 'c', 'a', cx, cy, la, sx, sy, _q);
    K.glow(_q[0] - Math.cos(la) * 5, _q[1] - Math.sin(la) * 5, 7, '#aa78ff', 0.45);
    K.pivotPos('sword', 'c', 'eye', cx, cy, la, sx, sy, _q);
    K.glow(_q[0], _q[1], 3.2 + ak * 2, '#ff3040', 0.6 + 0.25 * Math.sin(t * 5));
  }
  if (aim) {
    K.pivotPos('sword', 'c', 'b', cx, cy, la, sx, sy, _q);
    glint(ctx, _q[0], _q[1], 6 + 8 * ak, '#f0d8ff', clamp((e.animT ?? 0) / 0.35, 0, 1));
  }
  K.end();
}
