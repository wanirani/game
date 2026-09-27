// T1 painted sprite (rig reuse): 황금 박쥐 (golden_bat). The painted bat rig gradient-mapped to gold offline
// (tools/painted/enemies/golden_bat/recolor.py → assets/painted/enemies/golden_bat/, 0 Kling images); the flight is the
// bat's bending-chain wing flap (drawBat), plus a warm gold halo, orbiting star glints and white eyes.
// States (AI_A.fleer): flee (jittery flight, anim 'fly') · escape (flies up through the ceiling, invulnerable) ·
// blink (life < 2 s: the whole bat flickers like the vector version, a warning that it is about to escape) ·
// hurt (flash + squash) · death (gold strip dissolve + coin-coloured sparks; AI.onDie adds the coin shower).
import * as K from '../enemy_kit.js';
import { drawBat } from './bat.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'golden_bat', tier: 'T1', src: 'golden_bat',
  scale: 0.93,        // 30×24 logic rect vs the bat's 34×26: the same painted body, a little smaller
  bake: { outline: 0.4, deep: { wing: 0.78 }, deepTint: 'rgb(200,160,90)' },
};

const OPT = { eye: '#ffffff', eyeA: 0.9, death: '#ffd84a', hang: false };
const TAU = Math.PI * 2;

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  if (e.dying > 0) { drawBat(ctx, e, world, o, rig, OPT); return; }
  // about to escape: flicker (same cadence as the vector renderer)
  const blink = (e.life ?? 9) < 2 ? (Math.sin(t * 40) > 0 ? 0.35 : 1) : 1;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * blink;
  if (!o.flash) {
    K.begin(ctx, rig, 0);
    K.glow(0, -12, 34, '#ffd84a', 0.5 + 0.2 * Math.sin(t * 8), 0.15);   // warm halo behind the body
    K.end();
  }
  drawBat(ctx, e, world, o, rig, OPT);
  if (!o.flash) {
    K.begin(ctx, rig, 0);
    for (let i = 0; i < 4; i++) {
      const p = (t * 1.3 + i * 0.25) % 1, a = i * 1.7 + t;
      glint(ctx, Math.cos(a) * (12 + p * 10), -12 + Math.sin(a * 1.3) * (8 + p * 6), 3 + 3 * Math.sin(p * Math.PI), '#fff6c0', Math.sin(p * Math.PI));
    }
    void TAU;
    K.end();
  }
  ctx.globalAlpha = ga;
}
