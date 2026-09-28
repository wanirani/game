// T1 painted sprite (bat-rig reuse): 얼음 박쥐 (ice_bat). The painted bat's parts re-painted as a frost bat by Kling edits
// that keep the bat's composition (tools/painted/enemies/ice_bat/parts.json reuses the bat's boxes and pivots): furry
// flying body with crystal ears, translucent ice-membrane wing (mirrored for the far side), wrapped hanging cocoon.
// Flight, dive and death reuse the bat's renderer (drawBat: bending-chain wing flap, tilt, strip dissolve) with ice
// colours; this module adds the frost aura, the drifting snow sparkle and the ice bat's own states.
// States (AI_B.icebat → AI.bat): hang (cocoon under the ceiling, slow sway, pale eye glint) · dive (wings swept back) ·
// fly (sine flight) · shiver (0.38 s: the bat shudders above the player, wings buzz, an icicle forms under its chin with a
// glint → the icicle drops when it peaks) · hurt (flash + squash) · death (strip dissolve with ice sparks + ice chips).
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { drawBat } from './bat.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'ice_bat', tier: 'T1', src: 'ice_bat',
  bake: { outline: 0.4, deep: { wing: 0.74 }, deepTint: 'rgb(150,176,214)' },
};

const OPT = { eye: '#c8f6ff', eyeA: 0.85, death: '#9fe8ff', hang: true };
const SHIVER = 0.38;                       // AI_B.icebat: the icicle drops at stateT > 0.38
const _q = [0, 0];
// reused stand-in for drawBat while shivering (faster wing beat): only the fields drawBat reads
const PX = { t: 0, anim: 'fly', state: 'fly', stateT: 0, aggro: 1, def: null, dying: 0, vx: 0, vy: 0, facing: 1, flashT: 0, stun: 0 };

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  if (e.dying > 0) {
    if (world && !e._iceChips) { e._iceChips = true; chips(world, e); }
    drawBat(ctx, e, world, o, rig, OPT);
    return;
  }
  const hanging = e.anim === 'hang' || e.state === 'hang';
  const shiver = e.state === 'shiver' || e.anim === 'shiver';
  const sk = shiver ? clamp((e.stateT ?? e.animT ?? 0) / SHIVER, 0, 1) : 0;
  if (hanging) { drawHang(ctx, e, o, rig, t); snow(ctx, e, world, o, 3); return; }
  // frost aura behind the body (brighter while it charges the icicle)
  if (!o.flash) { K.begin(ctx, rig, 0); K.glow(0, -13, 26 + sk * 10, '#8fdcff', 0.34 + 0.06 * Math.sin(t * 5) + sk * 0.3, 0.2); K.end(); }
  if (shiver) {
    const sh = Math.sin(t * 70) * 1.3 * (0.5 + sk);
    ctx.translate(sh, 0);
    PX.t = t * 1.7; PX.anim = 'fly'; PX.state = 'fly'; PX.stateT = e.stateT ?? 0; PX.aggro = e.aggro ?? 1; PX.def = e.def;
    PX.vx = 0; PX.vy = 0; PX.facing = e.facing; PX.flashT = e.flashT ?? 0; PX.stun = e.stun ?? 0; PX.dying = 0;
    drawBat(ctx, PX, world, o, rig, OPT);
  } else drawBat(ctx, e, world, o, rig, OPT);
  if (!o.flash && shiver) {
    // the icicle grows under the chin; its glint peaks on the drop frame
    K.begin(ctx, rig, 0);
    K.pivotPos('fly', 'a', 'chin', 0, -13, 0, 1, 1, _q);
    icicle(ctx, _q[0], _q[1] + 1, 2 + 7 * sk, sk);
    glint(ctx, _q[0], _q[1] + 3 + 6 * sk, 3 + 5 * sk, '#e8fbff', sk > 0.45 ? (sk - 0.45) / 0.55 : 0);
    K.end();
  }
  snow(ctx, e, world, o, shiver ? 14 : 5);
}

/** hanging cocoon (same pose as the bat's, with a pale frost glint on the sleeping face instead of the red one) */
function drawHang(ctx, e, o, rig, t) {
  const sq = K.squashK(e);
  K.begin(ctx, rig, K.flashK(e, o));
  const top = -(e.def?.size?.h ?? 24);
  const br = 1 + Math.sin(t * 2.2) * 0.03, sw = Math.sin(t * 1.8) * 0.08;
  K.put('hang', 'a', 0, top, sw, 1 + sq * 0.1, br - sq * 0.1);
  if (!o.flash) {
    K.pivotPos('hang', 'a', 'face', 0, top, sw, 1, br, _q);
    K.glow(_q[0], _q[1], 7, '#9fe8ff', 0.5 + 0.2 * Math.sin(t * 2.2));
  }
  K.end();
}

/** small procedural icicle (local space, tip down) */
function icicle(ctx, x, y, len, a) {
  if (len < 1 || a <= 0.01) return;
  K.local();
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * clamp(a * 1.6, 0, 1);
  ctx.fillStyle = 'rgba(214,244,255,0.95)';
  ctx.strokeStyle = 'rgba(30,70,110,0.85)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(x - 1.6, y); ctx.lineTo(x + 1.6, y); ctx.lineTo(x + 0.2, y + len); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = ga;
}

/** drifting frost sparkle around the bat (world space, per second of game time) */
function snow(ctx, e, world, o, perSec) {
  if (!world || !o.cam || o.flash) return;
  const pool = e._fx ?? (e._fx = new K.FxPool(14));
  const dt = pool.step(K.clockOf(e, world));
  for (let n = pool.rate(0, K.lod() === 0 ? perSec * 0.5 : perSec, dt); n > 0; n--) {
    pool.add(3, e.cx + K.frand(-12, 12), e.bottom - K.frand(6, 22), K.frand(-12, 12), K.frand(10, 34), K.frand(0.5, 0.9), K.frand(1.2, 2.2), '#dff6ff');
  }
  ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore();
}

/** ice chips thrown off on death (outlive the entity; render-only) */
function chips(world, e) {
  if (!world.fx?.ghost) return;
  const pool = new K.FxPool(12), t0 = world.time ?? 0, cy = e.bottom - 13;
  for (let i = 0; i < 10; i++) { const a = K.frand(0, Math.PI * 2), sp = K.frand(60, 190); pool.add(4, e.cx, cy, Math.cos(a) * sp, Math.sin(a) * sp - 120, K.frand(0.5, 0.9), K.frand(1.4, 2.6), i % 2 ? '#dff6ff' : '#8fd0f0'); }
  world.fx.ghost((ctx) => {
    const now = world.time ?? t0;
    if (now - t0 > 1) return;
    ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    pool.step(now); pool.draw(ctx);
    ctx.restore();
  }, 1.1, 'front');
}
