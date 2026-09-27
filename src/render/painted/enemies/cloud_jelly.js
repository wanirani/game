// T1 painted sprite + procedural deformation: 뇌운 해파리 (cloud_jelly, 44×56). Parts (from the chosen Kling reference):
// the puffy storm-cloud bell with the glowing eyes + jagged mouth, and the whole hanging tendril mass (dark tentacles,
// pale frills, a baked lightning streak) swayed with the seam-free warpY. Lightning veins, the charge corona and the
// discharge are procedural VFX on top (render RNG only).
// States (AI_D.jelly): drift (bell pulses, tendrils trail against the drift/wind) · charge (aimK 0→1: the bell swells,
// white-blue veins crackle through the cloud, sparks gather, eyes flare) · shock (0.45 s: the bell kicks up, the tendrils
// splay out, a bright core flash) · hurt (flash + squash) · death (strip dissolve + spark burst; AI onDie adds the mini
// shock zone).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'cloud_jelly', tier: 'T1', src: 'cloud_jelly',
  bake: { outline: 0.35, glow: { bell: '#bfe8ff' } },
};

const _q = [0, 0], _o = [0, 0];
const BY = -29;                       // bell bottom (tendril root) above the feet line
let SW = 0, ST = 0, SP = 0;           // warp state for the hoisted tendril callback
const tendrilOff = (u) => { _o[0] = (Math.sin(ST * 2.4 - u * 4.2) * (1 + 4 * u) - SW * u * u * 9) * SP; return _o; };

/** jagged lightning polyline from (x0,y0) toward (x1,y1), n segments, deterministic per seed (local space) */
function bolt(ctx, x0, y0, x1, y1, n, amp, seed) {
  ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) {
    const k = i / n, j = (K.h1(seed * 7.3 + i * 1.91) - 0.5) * amp;
    ctx.lineTo(lerp(x0, x1, k) + j, lerp(y0, y1, k) + j * 0.5);
  }
  ctx.lineTo(x1, y1);
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, an = e.anim;
  const ch = an === 'charge' ? clamp(e.aimK ?? 0, 0, 1) : 0;
  const shock = an === 'shock' ? clamp(1 - (e.stateT ?? 0) / 0.45, 0, 1) : 0;
  const K1 = Math.max(ch, shock);
  const bob = Math.sin(t * 2.1) * 2 - shock * 3;
  const pulse = Math.sin(t * 3);
  const sq = K.squashK(e);
  const bsx = 1 + pulse * 0.04 + ch * 0.1 + shock * 0.16 + sq * 0.12;
  const bsy = 1 - pulse * 0.04 + ch * 0.06 - shock * 0.05 - sq * 0.12;
  const vx = (e.vx ?? 0) * (e.facing < 0 ? -1 : 1);
  const tilt = clamp(vx * 0.0009, -0.22, 0.22) + (K.hurtOf(e) ? -0.12 : 0);
  const by = BY + bob;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.spawnDissolve(world, e, rig, [
        { name: 'tendrils', pv: 'a', x: 0, y: by, rot: tilt },
        { name: 'bell', pv: 'a', x: 0, y: by, rot: tilt },
      ], { life: 0.75, strips: 10, drift: 46, rise: 18, col: '#cfeaff', kind: 3, n: 20, spread: 190, glow: '#9fd8ff', cy: -34 });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  // tendrils: trail against the drift; the discharge splays them out and lifts the tips
  SW = clamp(vx * 0.004, -1, 1); ST = t; SP = rig.td;
  const tsx = 1 + shock * 0.35 + ch * 0.06, tsy = 1 - shock * 0.18 + Math.sin(t * 1.7) * 0.03;
  if (!o.flash) K.glow(0, by + 10, 26 + 22 * K1, '#6ab8ff', 0.22 + 0.4 * K1);
  K.warpY('tendrils', 'a', 0, by - 1, tilt * 0.6, tsx, tsy, K.nStrips(10), tendrilOff, 1, 'base', 1);
  // bell (+ its baked glow silhouette as a soft corona while charging)
  if (!o.flash && K1 > 0.02) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('bell', 'a', 0, by, tilt, bsx * 1.05, bsy * 1.05, 0.25 + 0.45 * K1, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.put('bell', 'a', 0, by, tilt, bsx, bsy);
  if (!o.flash) {
    // inner lightning flicker (always a little; bright while charging)
    const fl = K.h1(Math.floor(t * 12) + (e.id?.length ?? 0)) > 0.78 ? 0.35 : 0;
    K.glow(0, by - 14, 22 + 18 * K1, '#9fd8ff', 0.18 + fl + 0.5 * K1);
    for (const pn of ['eyeL', 'eyeR']) {
      K.pivotPos('bell', 'a', pn, 0, by, tilt, bsx, bsy, _q);
      K.glow(_q[0], _q[1], 3.2 + 3 * K1, '#7affff', 0.8 + 0.2 * K1);
    }
    // crackling veins through the cloud (charge) / arcs down the tendrils (shock)
    if (K1 > 0.05 || fl) {
      K.local();
      const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const seed = Math.floor(t * 20);
      const nv = K1 > 0.05 ? 2 + Math.round(K1 * 3) : 1;
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = ga * (pass ? 0.95 : 0.4) * (0.45 + 0.55 * Math.max(K1, fl * 2));
        ctx.strokeStyle = pass ? '#f4fbff' : '#7fc8ff'; ctx.lineWidth = pass ? 0.9 : 2.6;
        ctx.beginPath();
        for (let i = 0; i < nv; i++) {
          const a = K.h1(seed + i * 3.1) * Math.PI * 2, r = 12 + K.h1(seed * 1.7 + i) * 10;
          bolt(ctx, 0, by - 14, Math.cos(a) * r * bsx, by - 14 + Math.sin(a) * r * 0.55 * bsy, 4, 5, seed + i);
        }
        if (shock > 0) for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 8 * tsx; bolt(ctx, x * 0.4, by + 2, x, by + 26 * tsy, 5, 6, seed * 3 + i); }
        ctx.stroke();
      }
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
    }
    if (shock > 0) K.glow(0, by - 6, 40 + 30 * shock, '#e8f6ff', 0.7 * shock, 0.15);
  }
  K.end();
  // gathering sparks while charging, drifting mist wisps (camera space, per-second emission)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(22));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    for (let n = pool.rate(0, K.lod() === 0 ? 2 : 4, dt); n > 0; n--) pool.add(2, e.cx + f * sc * K.frand(-18, 18), e.bottom + sc * (by - K.frand(4, 22)), K.frand(-14, 14) - (e.vx ?? 0) * 0.25, K.frand(-10, 4), K.frand(0.8, 1.4), K.frand(5, 9), '#a8b4c8');
    if (ch > 0) for (let n = pool.rate(1, 10 + 30 * ch, dt); n > 0; n--) {
      const a = K.frand(0, Math.PI * 2), r = K.frand(18, 30);
      pool.add(3, e.cx + Math.cos(a) * r * sc, e.bottom + sc * (by - 14) + Math.sin(a) * r * 0.7 * sc, -Math.cos(a) * 60, -Math.sin(a) * 50, K.frand(0.2, 0.4), K.frand(1.2, 2.4), '#dff4ff');
    }
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
