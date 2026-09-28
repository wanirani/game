// T1 painted blob: 혼돈의 씨앗 (chaos_spawn) — one boiling, many-eyed flesh ball (fanged maw, red slit eyes, glowing
// magenta veins, its own short painted tentacles) plus a long painted tentacle swung as bending chains out from behind it.
// Driven by AI_B.chaos: idle (slow boil: squash-stretch breathing, tentacles swaying) · walk (the lurching crawl follows
// the AI's own speed pulse sin(t·5): the ball stretches forward as it surges, squats as it stalls) · swell (0.6 s: the
// ball inflates 25–30 %, shivers, the veins burn through a magenta halo, motes are sucked in, the maw glows; the AI then
// fires five chaos orbs) · leap (stretched along its flight, tentacles streaming behind) · hurt (squash + flash) ·
// death (the ball tears into strips that drift up and wink out in a burst of magenta sparks and dark ichor).
import * as K from '../enemy_kit.js';
import { clamp, ease } from '../../../core/math.js';
import { glint } from './_biped.js';

export const spec = {
  id: 'chaos_spawn', tier: 'T1', src: 'chaos_spawn',
  bake: { outline: 0.4, deep: { tent: 0.55 }, deepTint: 'rgb(120,70,140)', glow: { body: '#e040ff' } },
};

const C = [0, 0], _q = [0, 0];
// tentacles out from behind the ball: root angle about the centre (local, y down), length scale, phase
const TENT = [[2.55, 0.62, 0], [3.1, 0.7, 1.7], [3.75, 0.55, 3.1], [4.45, 0.5, 4.4], [0.55, 0.5, 5.6]];

function pose(e) {
  const t = e.t ?? 0, an = e.anim, at = e.animT ?? 0;
  const q = { sx: 1, sy: 1, rot: 0, lift: 0, sk: 0, wave: 1, trail: 0 };
  q.sx = 1 + Math.sin(t * 5) * 0.045; q.sy = 1 - Math.sin(t * 5) * 0.045;
  if (an === 'walk') {
    const s = Math.sin(t * 5);                         // the AI's crawl speed pulse
    q.sx = 1 + Math.max(0, s) * 0.12 - 0.03; q.sy = 1 - Math.max(0, s) * 0.09 + 0.02; q.rot = s * 0.06; q.wave = 1.6;
  } else if (an === 'swell') {
    const k = ease.outCubic(clamp((e.stateT ?? at) / 0.6, 0, 1));
    q.sk = k; q.sx = 1 + k * 0.25 + Math.sin(t * 40) * 0.02 * k; q.sy = 1 + k * 0.3; q.wave = 0.6 + k * 2;
  } else if (an === 'leap') {
    const vy = e.vy ?? 0;
    q.sx = 0.86; q.sy = 1.18; q.rot = clamp(vy / 900, -0.4, 0.4); q.lift = 4; q.wave = 0.5; q.trail = clamp(Math.abs(vy) / 600, 0, 1);
  }
  if (e.onGround === false && an !== 'leap') { q.sx = 0.92; q.sy = 1.1; }
  return q;
}

function layout(ctx, e, q, o) {
  const t = e.t ?? 0;
  // the ball squashes about its foot point; tentacle roots follow the squashed centre
  K.pivotPos('body', 'a', 'c', 0, -q.lift, q.rot, q.sx, q.sy, C);
  const n = K.lod() === 0 ? 3 : 5, seg = K.lod() === 0 ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const [a0, L, ph] = TENT[i];
    const rx = C[0] + Math.cos(a0) * 13 * q.sx, ry = C[1] + Math.sin(a0) * 12 * q.sy;
    const sway = Math.sin(t * 2.2 * q.wave + ph) * 0.35;
    const dir = a0 + sway * 0.4 + (q.trail ? (Math.PI - a0) * 0.25 * q.trail : 0);
    K.chain('tent', rx, ry, dir, L * (1 + q.sk * 0.2), seg, (u, j) => (j === 0 ? 0 : Math.sin(t * 3 * q.wave + ph + u * 4) * 0.22 + (q.trail ? 0.05 : 0)), 1, 'deep');
  }
  if (q.sk > 0.02 && !o.flash) {                       // swell: the veins burn through a magenta halo
    const gco = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    K.put('body', 'a', 0, -q.lift + 1, q.rot, q.sx * 1.06, q.sy * 1.06, q.sk * (0.35 + 0.15 * Math.sin(t * 30)), 'glow');
    ctx.globalCompositeOperation = gco;
  }
  K.put('body', 'a', 0, -q.lift, q.rot, q.sx, q.sy);
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, q = pose(e);
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { e._pcorpse = true; die(e, world, rig, q); }
    return;
  }
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.1 * sq, 1 - 0.1 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (e.anim !== 'leap' && e.onGround !== false) K.shadow(22 * q.sx);
  K.pivotPos('body', 'a', 'c', 0, -q.lift, q.rot, q.sx, q.sy, C);
  if (!o.flash) K.glow(C[0], C[1], 40 + q.sk * 16, '#b030ff', 0.16 + q.sk * 0.25);
  layout(ctx, e, q, o);
  if (!o.flash) {
    // the big eye smoulders; the maw glows while it swells
    K.pivotPos('body', 'a', 'eye', 0, -q.lift, q.rot, q.sx, q.sy, _q);
    K.glow(_q[0], _q[1], 7 + q.sk * 5, '#ff2a4a', 0.35 + 0.15 * Math.sin(t * 3.1) + q.sk * 0.4);
    if (q.sk > 0) {
      K.pivotPos('body', 'a', 'mouth', 0, -q.lift, q.rot, q.sx, q.sy, _q);
      K.glow(_q[0], _q[1], 4 + 6 * q.sk, '#ff60e0', q.sk * 0.6);
      if (q.sk > 0.5) { K.pivotPos('body', 'a', 'top', 0, -q.lift, q.rot, q.sx, q.sy, _q); glint(ctx, _q[0], _q[1] + 4, 5 + 6 * q.sk, '#f0b0ff', (q.sk - 0.5) * 2); }
    }
    const hurt = K.hurtOf(e);
    if (hurt) K.glow(C[0], C[1], 30, '#ff80ff', 0.35 * hurt);
  }
  // world-space motes: ichor drips while it boils, magenta sparks sucked in while it swells
  if (o.cam) {
    const pool = e._fx ?? (e._fx = new K.FxPool(K.lod() === 0 ? 10 : 18));
    const dt = pool.step(K.clockOf(e, world));
    if (dt > 0 && !o.flash) {
      const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
      const wx = e.cx + f * C[0] * sc, wy = e.bottom + C[1] * sc;
      for (let n = pool.rate(0, e.anim === 'walk' ? 3 : 1.5, dt); n > 0; n--) pool.add(1, wx + K.frand(-14, 14) * sc, wy + K.frand(4, 14) * sc, 0, K.frand(10, 40), K.frand(0.4, 0.7), K.frand(1.2, 2), '#c040e0');
      if (q.sk > 0) for (let n = pool.rate(1, 26, dt); n > 0; n--) {
        const a = K.frand(0, 6.283), r = K.frand(30, 46) * sc;
        pool.add(3, wx + Math.cos(a) * r, wy + Math.sin(a) * r, -Math.cos(a) * r * 3, -Math.sin(a) * r * 3, 0.28, K.frand(1.5, 2.6), K.fr() < 0.5 ? '#ff70ff' : '#c060ff');
      }
    }
    if (pool.n) { ctx.save(); ctx.setTransform(o.cam); pool.draw(ctx); ctx.restore(); }
  }
  K.end();
}

function die(e, world, rig, q) {
  K.spawnDissolve(world, e, rig, [{ name: 'body', pv: 'a', x: 0, y: -q.lift, rot: q.rot, sx: q.sx, sy: q.sy }], {
    life: 0.8, strips: 12, drift: 70, rise: 18, col: '#e050ff', kind: 3, n: 24, spread: 190, glow: '#c040ff', cy: -28,
  });
  if (!world.fx?.ghost) return;
  // dark ichor splashes to the floor
  const pool = new K.FxPool(14), t0 = world.time ?? 0, sc = (e.scale || 1) * (rig.scale ?? 1);
  for (let i = 0; i < 14; i++) pool.add(1, e.cx + K.frand(-16, 16) * sc, e.bottom - K.frand(10, 40) * sc, K.frand(-160, 160), -K.frand(80, 320), K.frand(0.5, 0.9), K.frand(1.6, 2.8), i % 2 ? '#5a1a6a' : '#c040e0');
  world.fx.ghost((c) => {
    if ((world.time ?? t0) - t0 > 1.0) return;
    c.save(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    pool.step(world.time ?? t0); pool.draw(c);
    c.restore();
  }, 1.05, 'front');
}
