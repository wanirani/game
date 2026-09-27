// T2 painted puppet: 거울 기사 (mirror_knight). Parts (Step-4 edit of the side figure, cape removed): body (faceted
// mirror-glass helm with the cracked visor, shard collar, breastplate, glass-scale skirt, thigh stubs), near arm
// (rerebrace → vambrace → gauntlet fist, one rigid piece swinging from under the pauldron), pauldron (re-drawn over the
// arm root), back / near leg from mid-thigh down, glass greatsword (sheet 1).
// Driven by AI_B.swordsman (P.combo 3, windup 0.5, guard, wave 'ice'): idle (breathing, visor glint) · walk (stiff heavy
// gait: the legs swing from the hips, the sword arm sways) · slash comboI 0 (P.windup: the sword is raised back over the
// helm, then an overhead chop) · comboI 1 (0.3 s: a rising cut from low behind) · comboI 2 = last (0.3 s, or 0.25 s as the
// counter after a guard: the heaviest overhead chop, the ice wave leaves at the feet) · guard (the blade held upright in
// front, the mirror plates flare white — the reflected hit) · hurt (flash, squash, recoil) · death (the glass armour falls
// apart: helm/torso, legs, arm, pauldron and sword tumble as corpse pieces with a burst of mirror shards).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';

export const spec = {
  id: 'mirror_knight', tier: 'T2', src: 'mirror_knight',
  bake: { outline: 0.4, deep: { legB: 0.72 }, deepTint: 'rgb(110,130,170)', glow: { sword: '#bfe8ff', body: '#9fd8ff' } },
};

const _q = [0, 0], _t = [0, 0];
const H = Math.PI / 2;
const ICE = '#bfe8ff';
const ease = (k) => k * (2 - k);

/** sword arm pose for a slash: [arm dir, sword dir] at wind-up w (0..1) / swing s (0..1) of combo step i */
function slashPose(i, w, s, out) {
  if (i === 1) {                                                 // rising cut: low behind → high in front
    if (s > 0) { out[0] = lerp(1.9, -0.9, ease(s)); out[1] = lerp(2.7, -1.0, ease(s)); }
    else { out[0] = lerp(1.25, 1.9, ease(w)); out[1] = lerp(0.45, 2.7, ease(w)); }
  } else {                                                       // overhead chop (the last one is heavier)
    if (s > 0) { out[0] = lerp(-2.05, 0.55, ease(s)); out[1] = lerp(-2.7, 0.75, ease(s)); }
    else { out[0] = lerp(1.25, -2.05, ease(w)); out[1] = lerp(0.45, -2.7, ease(w)); }
  }
  return out;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, at = e.animT ?? 0, an = e.anim;
  const f = e.facing < 0 ? -1 : 1;
  const P = e.params || {};
  const hurt = K.hurtOf(e), sq = K.squashK(e);
  const walk = an === 'walk', guard = an === 'guard', slash = an === 'slash';
  const ci = e.comboI ?? 0, last = ci >= (P.combo ?? 2) - 1;
  const wu = e.counter ? 0.25 : ci === 0 ? (P.windup ?? 0.55) : 0.3;
  const ph = slash ? K.atkPhase(at, wu, last ? 0.12 : 0.1) : null;
  const w = ph ? ph.w : 0, s = ph ? ph.s : 0;
  const gait = walk ? Math.sin(t * 7.5) : 0;
  const bob = walk ? -Math.abs(Math.cos(t * 7.5)) * 2 : Math.sin(t * 2.4) * 0.6;
  let rot = walk ? 0.03 : 0;
  if (slash) rot += s > 0 ? 0.1 * ease(s) * (last ? 1.4 : 1) : -0.08 * w;
  if (guard) rot -= 0.05;
  if (hurt) rot -= 0.12;
  const ax = (hurt ? -2 : 0) + (slash && s > 0 ? 3 * ease(s) : 0), ay = bob;
  const sx = 1 + sq * 0.1, sy = (1 - sq * 0.08) * (1 + Math.sin(t * 2.4) * 0.005);
  // legs: swing from the hips (walking), braced apart on the chop
  let lB = gait * 0.32, lN = -gait * 0.32;
  if (slash) { const k = s > 0 ? 1 : w; lB = 0.12 * k; lN = -0.2 * k; }
  if (guard) { lB = 0.1; lN = -0.12; }
  // arm + sword
  let dA = 1.25 + (walk ? gait * 0.12 : Math.sin(t * 2.4) * 0.03), dS = 0.45 + (walk ? gait * 0.1 : 0);
  if (slash) { slashPose(ci === 1 && !last ? 1 : 0, w, s, _t); dA = _t[0]; dS = _t[1]; }
  if (guard) { dA = 0.35; dS = -1.45; }
  if (an === 'shiver') { dA += Math.sin(t * 50) * 0.05; dS += Math.sin(t * 43) * 0.06; }
  if (hurt) { dA += 0.3; dS += 0.35; }
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      e._pcorpse = true;
      K.begin(ctx, rig, 0);
      K.pivotPos('body', 'a', 'sh', ax, ay, rot, sx, sy, _q); const shx = _q[0], shy = _q[1];
      K.pivotPos('body', 'a', 'hipB', ax, ay, rot, sx, sy, _q); const bx = _q[0], by = _q[1];
      K.pivotPos('body', 'a', 'hipN', ax, ay, rot, sx, sy, _q); const nx = _q[0], ny = _q[1];
      const ap = K.part('arm'), AL = ap ? ap.len : 26, pa = ap ? ap.ang : 1.33;
      K.end();
      const hx = shx + Math.cos(dA + rot) * AL, hy = shy + Math.sin(dA + rot) * AL;
      K.spawnCorpse(world, e, rig, [
        { name: 'legB', pv: 'a', x: bx, y: by, rot: rot + lB, sx: 1, sy: 1, vn: 'deep', vx: K.frand(-60, -10), vy: -K.frand(60, 140), vr: K.frand(-3, 3) },
        { name: 'legN', pv: 'a', x: nx, y: ny, rot: rot + lN, sx: 1, sy: 1, vn: 'base', vx: K.frand(-10, 60), vy: -K.frand(60, 140), vr: K.frand(-3, 3) },
        { name: 'body', pv: 'a', x: ax, y: ay, rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(-50, 10), vy: -K.frand(80, 160), vr: K.frand(-2.5, -0.8) },
        { name: 'arm', pv: 'a', x: shx, y: shy, rot: dA + rot - pa, sx: 1, sy: 1, vn: 'base', vx: K.frand(20, 110), vy: -K.frand(140, 260), vr: K.frand(-6, 6) },
        { name: 'sword', pv: 'a', x: hx, y: hy, rot: dS + rot + H, sx: 1, sy: 1, vn: 'base', vx: K.frand(60, 180), vy: -K.frand(200, 320), vr: K.frand(-9, 9) },
        { name: 'pauldron', pv: 'a', x: shx, y: shy - 6, rot, sx: 1, sy: 1, vn: 'base', vx: K.frand(-40, 80), vy: -K.frand(180, 300), vr: K.frand(-8, 8) },
      ], { life: 1.6, fade: 0.55, bounce: 0.35, dust: { n: 14, w: 26, h: 30, col: ICE, k: 3 } });
    }
    return;
  }
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) {
    K.shadow(20, 0.42);
    K.glow(ax + 2, ay - 55, 34, '#7fb8ff', 0.14 + (guard ? 0.3 : 0) + 0.1 * w);
  }
  K.pivotPos('body', 'a', 'hipB', ax, ay, rot, sx, sy, _q);
  K.put('legB', 'a', _q[0], _q[1], rot + lB, 1, 1, 1, 'deep');
  K.pivotPos('body', 'a', 'hipN', ax, ay, rot, sx, sy, _q);
  K.put('legN', 'a', _q[0], _q[1], rot + lN, 1, 1);
  K.put('body', 'a', ax, ay, rot, sx, sy);
  if (!o.flash && K.lod() > 0) {                                    // mirror plates catch the light (guard: the reflection flare)
    const fl = guard ? 0.16 + 0.1 * Math.sin(t * 30) : 0.04 + 0.05 * Math.max(0, Math.sin(t * 1.3));
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'a', ax, ay, rot, sx, sy, fl, 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.pivotPos('body', 'a', 'sh', ax, ay, rot, sx, sy, _q);
  const shx = _q[0], shy = _q[1];
  const ap = K.part('arm'), AL = ap ? ap.len : 26;
  const hx = shx + Math.cos(dA + rot) * AL, hy = shy + Math.sin(dA + rot) * AL;
  const sd = dS + rot;
  // slash trail along the sword tip path
  if (slash && s > 0 && s < 1 && !o.flash) {
    const swp = K.part('sword'), SL = swp ? swp.len : 42;
    K.local();
    ctx.globalCompositeOperation = 'lighter';
    const r = AL * 0.8 + SL;
    const a1 = Math.atan2(hy + Math.sin(sd) * SL - shy, hx + Math.cos(sd) * SL - shx);
    const back = ci === 1 && !last ? 1.05 : -1.05;
    ctx.strokeStyle = `rgba(200,240,255,${0.5 * (1 - s * 0.5)})`; ctx.lineWidth = last ? 7 : 5;
    ctx.beginPath(); ctx.arc(shx, shy, r, a1 + (back > 0 ? 0 : back), a1 + (back > 0 ? back : 0)); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - s)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(shx, shy, r, a1 + (back > 0 ? 0 : back * 0.6), a1 + (back > 0 ? back * 0.6 : 0)); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  K.bone('sword', hx, hy, sd, 1);
  if (!o.flash && (w > 0.5 || guard)) {
    const gco = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
    K.bone('sword', hx, hy, sd, 1, 'glow', guard ? 0.35 : 0.5 * (w - 0.5) * 2);
    ctx.globalCompositeOperation = gco;
  }
  K.bone('arm', shx, shy, dA + rot, 1);
  const pa = ap ? ap.ang : 1.33;
  K.put('pauldron', 'a', shx, shy - 7.5, rot + (dA - pa) * 0.18, 1, 1);
  if (!o.flash) {
    K.pivotPos('body', 'a', 'eye', ax, ay, rot, sx, sy, _q);
    K.glow(_q[0], _q[1], 3 + 3 * w + (guard ? 2 : 0), ICE, 0.6 + 0.3 * Math.sin(t * 4), 0.3);
    if (slash && last && w > 0.3 && s === 0) {                       // frost gathering on the blade before the heavy chop
      const swp = K.part('sword'), SL = swp ? swp.len : 42;
      K.glow(hx + Math.cos(sd) * SL * 0.7, hy + Math.sin(sd) * SL * 0.7, 8 + 8 * w, ICE, 0.5 * w);
    }
  }
  K.end();
  // glass glints off the plates, frost burst at the feet on the heavy chop
  if (world && o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(24));
    const sc = (e.scale || 1) * (rig.scale ?? 1);
    const dt = pool.step(K.clockOf(e, world));
    for (let n = pool.rate(0, walk ? 3 : 1.5, dt); n > 0; n--) pool.add(3, e.cx + f * sc * K.frand(-14, 14), e.bottom - sc * K.frand(20, 85), 0, K.frand(-20, -5), K.frand(0.2, 0.4), K.frand(1, 2), '#e8f8ff');
    if (slash && last && s > 0 && !e._chop) {
      e._chop = true;
      for (let i = 0; i < 12; i++) pool.add(4, e.cx + f * sc * K.frand(20, 60), e.bottom - 4, f * K.frand(40, 220), K.frand(-260, -80), K.frand(0.4, 0.8), K.frand(2, 3.5), i % 2 ? '#dff4ff' : '#9fc8f0');
    }
    if (!(slash && last && s > 0)) e._chop = false;
    ctx.setTransform(o.cam);
    pool.draw(ctx);
  }
}
