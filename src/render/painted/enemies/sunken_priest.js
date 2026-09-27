// T2 painted puppet: 수몰 사제 (sunken_priest). Parts: armless body (drowned bishop — mitre crusted with barnacles,
// bloated grinning head, seaweed hair, teal-and-gold cope over a rotting alb; the robe hem sways by sheared strips),
// alb sleeve (near + darkened far upper arm), near fist gripping the white coral crozier with the glowing pearl (one
// rigid part hanging from the sleeve cuff), bare far forearm with the open clawed hand.
// Driven by AI_C.tidecaller: idle (breathing, pearl pulse, drips) · walk (heavy waddle, the crozier planted and swung
// forward) · cast — state 'cast' (P.windup 0.7: the crozier is raised overhead, the pearl and the maw flare, the tide
// gathers at the feet; at the wind-up end the crozier is slammed down as the geysers erupt) / state 'throw' (bubble,
// P.bubbleWindup 0.6: the far hand reaches forward and a bubble swells in the palm, then the palm pushes it off) ·
// bless — state 'gather' (P.blessWindup 0.6: crozier and far hand raised, the pearl glows sea-green) · hurt (flash,
// squash, recoil, the crozier wobbles) · death (the priest topples, the crozier and a sleeve fall apart, splash).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'sunken_priest', tier: 'T2', src: 'sunken_priest',
  bake: { outline: 0.4, deep: { sleeve: 0.72, fore: 0.75 }, deepTint: 'rgb(80,110,120)' },
};

const _q = [0, 0], _e = [0, 0], _p = [0, 0], _m = [0, 0];
const H = Math.PI / 2;
const TIDE = '#8ad8ff', HOLY = '#7fe8d0';
const ease = (k) => k * (2 - k);

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim, st = e.state;
  const f = e.facing < 0 ? -1 : 1;
  const P = e.params || {};
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const walk = an === 'walk';
  const geyser = an === 'cast' && st !== 'throw';
  const throwing = an === 'cast' && st === 'throw';
  const bless = an === 'bless';
  const wu = geyser ? (P.windup ?? 0.7) : throwing ? (P.bubbleWindup ?? 0.6) : (P.blessWindup ?? 0.6);
  const w = geyser || throwing || bless ? clamp(at / wu, 0, 1) : 0;
  const rel = w >= 1 ? clamp((at - wu) / 0.12, 0, 1) : 0;   // release snap
  // body: heavy waddle while walking, breathing otherwise; leans back to raise the crozier, forward on the slam
  const step = walk ? Math.sin(t * 6) : 0;
  const bob = walk ? -Math.abs(step) * 1.6 : 0;
  let rot = walk ? step * 0.025 : Math.sin(t * 1.3) * 0.012;
  if (geyser) rot += rel > 0 ? 0.06 * (1 - (at - wu) / 0.5) : -0.07 * ease(w);
  if (bless) rot -= 0.05 * ease(w);
  if (hurt) rot -= 0.12;
  const ax = hurt ? -2 : 0, ay = bob;
  const br = 1 + Math.sin(t * 2.2) * 0.012;
  const sx = (1 + sq * 0.1) * (2 - br), sy = (1 - sq * 0.08) * br;
  // near arm (sleeve from the shoulder) + crozier (rigid, hangs from the cuff; texel orientation = arm hanging down)
  // dS = sleeve direction (world, π/2 = hanging); sr = crozier rotation from its painted lean (0 = held at the side)
  let dS = 1.27 + (walk ? -step * 0.12 : Math.sin(t * 1.3 + 1) * 0.03), sr = dS - H;
  if (geyser) {
    if (rel > 0) { const k = ease(clamp((at - wu) / 0.18, 0, 1)); dS = lerp(-0.9, 0.85, k); sr = lerp(-0.2, 0.4, k); }   // slammed forward
    else { const k = ease(w); dS = lerp(dS, -0.9, k); sr = lerp(sr, -0.2, k); }                                         // raised overhead
  } else if (bless) { const k = ease(w); dS = lerp(dS, -1.1, k); sr = lerp(sr, -0.05, k); }
  else if (throwing) { const k = ease(w); dS = lerp(dS, 1.05, k); sr = lerp(sr, 0.2, k); }                           // crozier tipped forward
  if (hurt) { dS += 0.25; sr += 0.1 + 0.08 * Math.sin(t * 40); }
  // far arm: sleeve + bare forearm (open palm forward for the bubble, raised for the blessing)
  let dF1 = 1.45 + Math.sin(t * 1.3) * 0.04, dF2 = 1.35;
  if (throwing) { dF1 = lerp(dF1, rel > 0 ? 0.2 : 0.55, ease(w)); dF2 = lerp(dF2, rel > 0 ? -0.35 : -0.05, ease(w)); }   // palm under the crook
  else if (bless) { dF1 = lerp(dF1, -0.2, ease(w)); dF2 = lerp(dF2, -1.2, ease(w)); }
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.begin(ctx, rig, 0);
      K.pivotPos('body', 'a', 'sh', ax, ay, rot, sx, sy, _q);
      const shx = _q[0], shy = _q[1];
      const sp = K.part('sleeve'), L = sp ? sp.len : 16;
      const cx = shx + Math.cos(dS + rot) * L, cy = shy + Math.sin(dS + rot) * L;
      K.end();
      K.spawnCorpse(world, e, rig, [
        { name: 'staff', pv: 'a', x: cx, y: cy, rot: sr + rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(40, 140), vy: -K.frand(120, 240), vr: K.frand(-7, 7) },
        { name: 'body', pv: 'a', x: ax, y: ay, rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(-50, 10), vy: -K.frand(40, 110), vr: K.frand(-2.5, -0.8) },
        { name: 'sleeve', pv: 'a', x: shx, y: shy, rot: dS + rot - H, sx: 1, sy: 1, vn: 'base', vx: K.frand(20, 90), vy: -K.frand(80, 180), vr: K.frand(-6, 6) },
      ], { life: 1.5, fade: 0.5, bounce: 0.22, dust: { n: 10, w: 26, h: 10, col: '#8fd0e0', k: 1 } });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) {
    K.shadow(20, 0.4);
    // the tide gathering at the feet (geyser wind-up) / sea-green halo (blessing)
    if (geyser) K.glow(8, -4, 26 + 20 * w, TIDE, rel > 0 ? 0.6 * (1 - clamp((at - wu) / 0.5, 0, 1)) : 0.15 + 0.35 * w);
    if (bless) K.glow(0, -44, 40 + 12 * w, HOLY, 0.12 + 0.3 * w);
  }
  K.pivotPos('body', 'a', 'sh', ax, ay, rot, sx, sy, _q); const shx = _q[0], shy = _q[1];
  K.pivotPos('body', 'a', 'shF', ax, ay, rot, sx, sy, _q); const fsx = _q[0], fsy = _q[1];
  // far arm behind the body
  const fe = K.bone('sleeve', fsx, fsy, dF1 + rot, 0.95, 'deep');
  _e[0] = fe[0]; _e[1] = fe[1];
  K.bone('fore', _e[0] - Math.cos(dF1 + rot) * 2, _e[1] - Math.sin(dF1 + rot) * 2, dF2 + rot, 1, 'deep');
  const fp = K.part('fore'), FL = fp ? fp.len : 20;
  _p[0] = _e[0] - Math.cos(dF1 + rot) * 2 + Math.cos(dF2 + rot) * FL; _p[1] = _e[1] - Math.sin(dF1 + rot) * 2 + Math.sin(dF2 + rot) * FL;
  // body: the robe hem sways (strips below the knees shift sideways, the wave runs down to the hem)
  K.pivotPos('body', 'a', 'top', ax, ay, rot, sx, sy, _q);
  const tx = _q[0], ty = _q[1];
  const hamp = walk ? 2.4 : 1.1 + (geyser ? 1.5 * w : 0);
  if (o.flash) K.put('body', 'top', tx, ty, rot, sx, sy);           // flash frame: one blit (no strip seams in the white)
  else K.strips('body', 'top', tx, ty, rot, sx, sy, K.nStrips(10), 'y', (u) => {
    const k = clamp((u - 0.62) / 0.38, 0, 1);
    _q[0] = (Math.sin(t * (walk ? 6 : 2.2) - u * 5) * hamp * k * k - (walk ? step * 1.2 * k : 0)) * rig.td; _q[1] = 0; return _q;
  }, 1);
  // near arm: crozier first (the fist comes out of the cuff), then the sleeve over the wrist
  const sp = K.part('sleeve'), L = sp ? sp.len : 16;
  const cx = shx + Math.cos(dS + rot) * L, cy = shy + Math.sin(dS + rot) * L;
  const srot = sr + rot;
  K.put('staff', 'a', cx, cy, srot, 1, 1);
  K.bone('sleeve', shx, shy, dS + rot, 1);
  if (!o.flash) {
    // pearl: the lamp of the drowned church
    K.pivotPos('staff', 'a', 'pearl', cx, cy, srot, 1, 1, _q);
    const pk = geyser ? (rel > 0 ? 1 - clamp((at - wu) / 0.4, 0, 1) : w) : bless ? w : throwing ? 0.3 * w : 0;
    const pc = bless ? HOLY : TIDE;
    K.glow(_q[0], _q[1], 10 + 16 * pk + Math.sin(t * 3) * 1.5, pc, 0.35 + 0.5 * pk);
    K.glow(_q[0], _q[1], 2.5 + 2 * pk, '#ffffff', 0.7, 0.2);
    // eyes (pale, bulging) and the maw chanting cold light
    K.pivotPos('body', 'a', 'eye', ax, ay, rot, sx, sy, _q);
    K.glow(_q[0], _q[1], 2.2, '#e8fff4', 0.35 + 0.4 * Math.max(w, hurt));
    const chant = geyser || bless ? w : throwing ? 0.5 * w : 0;
    if (chant > 0.05) {
      K.pivotPos('body', 'a', 'mouth', ax, ay, rot, sx, sy, _q);
      K.glow(_q[0], _q[1], 5 + 6 * chant, bless ? HOLY : '#9ff0ff', 0.25 + 0.4 * chant, 0.25);
    }
    // bubble swelling in the far palm (the projectile itself leaves at the wind-up end)
    if (throwing && rel <= 0) {
      const r = 3 + 10 * ease(w);
      K.glow(_p[0] + 3, _p[1] - 2, r * 1.8, TIDE, 0.25 + 0.35 * w);
      K.glow(_p[0] + 3, _p[1] - 2, r, '#dff8ff', 0.18 + 0.2 * w, 0.8);
      K.glow(_p[0] + 3 - r * 0.35, _p[1] - 2 - r * 0.35, r * 0.25, '#ffffff', 0.8, 0.2);
    }
    if (bless) K.glow(_p[0], _p[1], 4 + 6 * w, HOLY, 0.5 * w);
  }
  K.pivotPos('body', 'a', 'mfront', ax, ay, rot, sx, sy, _m);
  K.end();
  // drips from the seaweed and the hem, bubbles from the chanting maw, a splash on the slam (world space, per second)
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(28));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    for (let n = pool.rate(0, 3, dt); n > 0; n--) pool.add(1, e.cx + f * sc * K.frand(-14, 2), e.bottom - sc * K.frand(30, 50), 0, K.frand(10, 40), K.frand(0.5, 0.9), 1.3, '#8fc8b0');
    for (let n = pool.rate(1, 2, dt); n > 0; n--) pool.add(1, e.cx + f * sc * K.frand(-18, 18), e.bottom - sc * K.frand(2, 8), 0, K.frand(10, 30), K.frand(0.3, 0.5), 1.2, '#9fe0f0');
    if (geyser || bless || throwing) {
      const mx = e.cx + f * sc * _m[0], my = e.bottom + sc * _m[1];
      for (let n = pool.rate(2, 5 + 10 * w, dt); n > 0; n--) pool.add(0, mx + K.frand(-2, 2), my + K.frand(-2, 2), f * K.frand(10, 40), K.frand(-60, -25), K.frand(0.4, 0.8), K.frand(1.5, 3), '#bff4ff');
    }
    if (geyser && rel > 0 && !e._slam) {
      e._slam = true;
      const gx = e.cx + f * sc * 22, gy = e.bottom - 2;
      for (let i = 0; i < 14; i++) pool.add(1, gx + K.frand(-6, 6), gy, K.frand(-120, 120), K.frand(-260, -80), K.frand(0.4, 0.7), K.frand(1.4, 2.4), '#bff0ff');
    }
    if (!geyser || rel <= 0) e._slam = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
