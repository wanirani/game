// T2 painted puppet: 사슬 간수 (chain_warden). Parts: body (horned cage-visor helm, flayed grey hide with glowing red
// gashes, blood-rusted leather apron, boots; the near upper arm is a stump on the body = the upper arm), forearm with
// the spiked chain wound round the wrist + fist, one tiling period of the rusted chain (tiled along straight or sagging
// paths), crescent hook with its ring.
// Driven by AI_C.chainhook: idle / walk (the hook hangs from the fist on a short chain and swings like a pendulum) · aim
// (P.windup 0.5: the fist is raised and the hook whirls round it, the visor eyes flare) · throw (the arm snaps forward;
// the flying chain + hook are ZONE_C.hook → drawHookZone below, fed from the painted fist) · reel (the arm hauls back,
// the body leans back) · smash (state 'slam': cocked low behind, then an uppercut that swings the hook over the head) ·
// sweep (P.sweepWindup 0.6: the hook is dragged behind, then whipped low along the floor 150 px ahead) · hurt (flash,
// squash, recoil) · death (the warden topples, the forearm and the hook clatter away).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'chain_warden', tier: 'T2', src: 'chain_warden',
  bake: { outline: 0.45, deepTint: 'rgb(120,90,80)' },
};

const _q = [0, 0], _f = [0, 0];
const H = Math.PI / 2;
const EMBER = '#ff4a20';
const ease = (k) => k * (2 - k);

/** chain along a quadratic path (x0,y0)→(x1,y1), control point = midpoint + (cx, cy); tiled 4-link sprite */
function chainPath(x0, y0, x1, y1, cx, cy, alpha = 1) {
  const cp = K.part('chain'); if (!cp) return;
  const CL = cp.len || 17;
  const mx = (x0 + x1) / 2 + cx, my = (y0 + y1) / 2 + cy;
  const L = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(cx, cy) * 0.5;
  const n = Math.max(1, Math.min(40, Math.ceil(L / CL)));
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const qx = u * u * x0 + 2 * u * t * mx + t * t * x1, qy = u * u * y0 + 2 * u * t * my + t * t * y1;
    const dx = qx - px, dy = qy - py, d = Math.hypot(dx, dy);
    if (d > 0.01) K.put('chain', 'a', px, py, Math.atan2(dy, dx), (d + 0.6) / CL, 1, alpha);
    px = qx; py = qy;
  }
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim;
  const f = e.facing < 0 ? -1 : 1;
  const P = e.params || {};
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const walk = an === 'walk';
  const aim = an === 'aim' ? clamp(at / (P.windup ?? 0.5), 0, 1) : 0;
  const smash = an === 'smash', sweep = an === 'sweep', reel = an === 'reel', thrown = an === 'throw';
  const swu = e.smashWu ?? 0.2, wwu = P.sweepWindup ?? 0.6;
  const sw = smash ? clamp(at / swu, 0, 1) : sweep ? clamp(at / wwu, 0, 1) : 0;         // wind-up
  const ss = smash ? clamp((at - swu) / 0.14, 0, 1) : sweep ? clamp((at - wwu) / 0.15, 0, 1) : 0;   // swing
  const bob = walk ? -Math.abs(Math.cos(t * 7)) * 2 : Math.sin(t * 2) * 0.5;
  let rot = walk ? Math.sin(t * 7) * 0.02 : 0;
  if (reel) rot -= 0.09;
  if (smash) rot += ss > 0 ? -0.1 * (1 - ss) + 0.06 * ss : 0.08 * sw;
  if (sweep) rot += ss > 0 ? 0.08 : -0.06 * sw;
  if (aim) rot -= 0.04 * aim;
  if (hurt) rot -= 0.12;
  const ax = hurt ? -2 : 0, ay = bob;
  const sx = 1 + sq * 0.1, sy = (1 - sq * 0.08) * (1 + Math.sin(t * 2) * 0.006);
  // forearm direction (world, π/2 = hanging) from the stump's elbow
  let dF = 1.35 + Math.sin(t * 1.7) * 0.05;
  if (walk) dF = 1.25 + Math.sin(t * 7) * 0.28;
  if (aim) dF = lerp(dF, -1.25, ease(Math.min(1, aim * 2)));
  if (thrown) dF = lerp(-1.1, -0.05, ease(clamp(at / 0.1, 0, 1)));
  if (reel) dF = lerp(-0.05, 2.35, ease(clamp(at / 0.2, 0, 1)));
  if (smash) dF = ss > 0 ? lerp(2.5, -1.35, ease(ss)) : lerp(1.35, 2.5, ease(sw));
  if (sweep) dF = ss > 0 ? lerp(2.6, 0.25, ease(ss)) : lerp(1.35, 2.6, ease(sw));
  if (hurt) dF += 0.3;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.begin(ctx, rig, 0);
      K.pivotPos('body', 'a', 'elbow', ax, ay, rot, sx, sy, _q);
      const ex = _q[0], ey = _q[1];
      const fp = K.part('fore'), FL = fp ? fp.len : 16;
      K.end();
      K.spawnCorpse(world, e, rig, [
        { name: 'hook', pv: 'a', x: ex + Math.cos(dF + rot) * FL, y: ey + Math.sin(dF + rot) * FL + 10, rot: 0, sx: 1, sy: 1, vn: 'base', vx: K.frand(40, 160), vy: -K.frand(160, 300), vr: K.frand(-9, 9) },
        { name: 'body', pv: 'a', x: ax, y: ay, rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(-60, -10), vy: -K.frand(40, 120), vr: K.frand(-2.8, -1.2) },
        { name: 'fore', pv: 'a', x: ex, y: ey, rot: dF + rot - H, sx: 1, sy: 1, vn: 'base', vx: K.frand(-40, 60), vy: -K.frand(120, 220), vr: K.frand(-7, 7) },
      ], { life: 1.5, fade: 0.5, bounce: 0.25, dust: { n: 10, w: 24, h: 10, col: '#6a5040' } });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.shadow(20, 0.42);
  K.pivotPos('body', 'a', 'elbow', ax, ay, rot, sx, sy, _q);
  const ex = _q[0], ey = _q[1];
  const fp = K.part('fore'), FL = fp ? fp.len : 16;
  const fx = ex + Math.cos(dF + rot) * FL, fy = ey + Math.sin(dF + rot) * FL;     // fist
  _f[0] = fx; _f[1] = fy;
  K.put('body', 'a', ax, ay, rot, sx, sy);
  // the hook in hand (not while the thrown one is out: ZONE_C.hook draws that one)
  const out = e.hook && !e.hook.dead && world;
  let hx = 0, hy = 0, hd = H, cxo = 0, cyo = 0, show = !out && !reel;
  if (thrown && !out) { hx = fx + 44; hy = fy; hd = 0; }                                              // gallery: frozen throw
  else if (aim) { const a = t * 18; const r = 12 + 6 * aim; hx = fx + Math.cos(a) * r; hy = fy + Math.sin(a) * r * 0.55; hd = a; }
  else if (smash) {
    const a = ss > 0 ? lerp(2.7, -1.2, ease(ss)) : lerp(H + 0.2, 2.7, ease(sw));                     // behind-low → overhead-front
    hx = fx + Math.cos(a) * 24; hy = fy + Math.sin(a) * 24; hd = a;
  } else if (sweep) {
    if (ss > 0) { const k = ease(ss); hx = lerp(fx - 30, fx + 120, k); hy = -7; hd = lerp(Math.PI, 0.1, k); cyo = 6 * (1 - k); }
    else { hx = fx - 10 - 22 * ease(sw); hy = -7; hd = Math.PI - 0.3; cyo = 5; }
  } else {
    const sway = Math.sin(t * (walk ? 7 : 2.1)) * (walk ? 0.35 : 0.12) - (hurt ? 0.4 : 0);
    hd = H + sway; hx = fx + Math.cos(hd) * 11; hy = fy + Math.sin(hd) * 11; cxo = 0; cyo = 1.5;
  }
  if (show) {
    if (aim && !o.flash) {                                                                             // whirl blur
      K.local();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,140,80,${0.25 * aim})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(fx, fy, 12 + 6 * aim, (12 + 6 * aim) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (smash && ss > 0 && ss < 1 && !o.flash) {                                                     // uppercut streak
      K.local();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,120,60,${0.45 * (1 - ss * 0.6)})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(fx, fy, 24, lerp(2.7, -1.2, ease(ss)) + 0.9, lerp(2.7, -1.2, ease(ss)), true); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    chainPath(fx, fy, hx, hy, cxo, cyo);
  }
  K.bone('fore', ex, ey, dF + rot, 1);
  if (show) K.bone('hook', hx, hy, hd, 1);
  if (!o.flash) {
    K.pivotPos('body', 'a', 'eye', ax, ay, rot, sx, sy, _q);
    const flare = Math.max(aim, sw, reel ? 0.6 : 0);
    K.glow(_q[0], _q[1], 3 + 4 * flare, '#ff2a10', 0.75 + 0.25 * flare, 0.3);
    K.glow(_q[0] + 2, _q[1], 1.6, '#fff0c0', 0.8, 0.2);
    // gashes smoulder
    const p = 0.35 + 0.25 * Math.sin(t * 3.1);
    for (const pn of ['w1', 'w2', 'w3']) { K.pivotPos('body', 'a', pn, ax, ay, rot, sx, sy, _q); K.glow(_q[0], _q[1], 3.2, EMBER, p); }
    if (sweep && ss > 0 && ss < 1) K.glow(hx, -4, 14, '#ffb070', 0.5 * (1 - ss));
  }
  K.end();
  // fist position in world space (the thrown chain in drawHookZone starts here)
  if (world) {
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    e._pfist = e._pfist || [0, 0];
    e._pfist[0] = e.cx + f * sc * _f[0]; e._pfist[1] = e.bottom + sc * _f[1];
    e._pfistT = world.time ?? 0;
  }
  // sparks where the hook scrapes the floor in the sweep; dust off the boots when walking
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(20));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    if (sweep) for (let n = pool.rate(0, ss > 0 && ss < 1 ? 60 : sw > 0.2 ? 10 : 0, dt); n > 0; n--) pool.add(3, e.cx + f * sc * hx, e.bottom - 3, f * K.frand(-60, 140), K.frand(-160, -40), K.frand(0.2, 0.45), K.frand(1.2, 2.2), '#ffc080');
    if (e.flashT > 0.1 && !e._hitFx) { e._hitFx = true; for (let i = 0; i < 7; i++) pool.add(1, e.cx + K.frand(-8, 8), e.bottom - 60 + K.frand(-10, 10), K.frand(-140, 140), K.frand(-200, -40), K.frand(0.4, 0.7), 1.6, '#8a1a10'); }
    if (e.flashT <= 0) e._hitFx = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}

/**
 * ZONE_C.hook (world space): the thrown chain + hook, painted. Starts at the warden's painted fist (e._pfist, last
 * frame) and runs to the hook zone; the hook flies ring-first-behind, flares red when it has caught the player.
 * Returns false while the rig is not ready (render/enemies_c.js then draws the vector chain).
 */
export function drawHookZone(ctx, z, world) {
  const rig = K.rigReady(spec);
  const d = z.data;
  if (!rig || !d) return false;
  const e = z.owner;
  const dir = d.dir || 1;
  const sc = (e?.scale || 1) * (rig.scale ?? 1);
  const recent = e?._pfist && Math.abs((world?.time ?? 0) - (e._pfistT ?? -9)) < 0.2;
  const x0 = recent ? e._pfist[0] : d.hx, y0 = recent ? e._pfist[1] : d.hy;
  const hx = z.cx, hy = z.cy;
  ctx.save();
  ctx.translate(x0, y0); ctx.scale(dir * sc, sc);
  K.begin(ctx, rig, 0);
  const lx = (hx - x0) * dir / sc, ly = (hy - y0) / sc;
  const sag = Math.min(10, Math.abs(lx) * 0.04) * (d.back ? 1.4 : 0.6);
  chainPath(0, 0, lx, ly, 0, sag);
  const spin = d.back ? Math.PI + Math.sin((z.t ?? 0) * 20) * 0.2 : (d.dist ?? 0) * 0.02;
  K.bone('hook', lx - 2, ly, spin, 1.1);
  if (d.hooked) K.glow(lx + 6, ly, 12, '#ff4a2a', 0.55, 0.3);
  else K.glow(lx + 4, ly, 7, '#ffb080', 0.25);
  K.end();
  ctx.restore();
  return true;
}
