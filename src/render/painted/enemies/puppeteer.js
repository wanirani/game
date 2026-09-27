// T2 painted floating string-puller: 악몽 인형사 (puppeteer, 44×90). Parts (Kling parts sheet 2): grinning top-hatted
// skull head with violet eye-lights, the headless tailcoat body with dangling legs and ragged violet-lined tails
// (strip-warped so the coat and legs trail and sway like something hung on its own strings), one impossibly long black
// sleeve + silver-thimbled claw hand (upper arm + forearm, used for both arms; far arm darkened behind the coat).
// Glowing threads run from the fingertips to every live puppet (e.puppets) or dangle and twitch when there is none.
// States (AI_D.puppeteer): float (slow bob, fingers twitching as if working strings) · summon (cast 0.8 s, aimK: both
// arms rise over the head, fingers splay, a violet sigil glows between the hands) · throw (0.5 s wind-up behind the
// head, then the near arm flings forward → needles) · hurt (flash, squash, head snaps back) · death (corpse: hat, head,
// arms and coat fall; the threads snap).
import * as K from '../enemy_kit.js';
import { claimDebris } from './_biped.js';
import { clamp, lerp, ease } from '../../../core/math.js';

export const spec = {
  id: 'puppeteer', tier: 'T2', src: 'puppeteer',
  bake: { outline: 0.42, deep: { uarm: 0.6, farm: 0.6 }, deepTint: 'rgb(130,110,150)' },
};

const PI = Math.PI;
const _q = [0, 0];
const PL = []; let NP = 0;
function place(name, x, y, rot, vn = 'base', sx = 1, sy = 1, pv = 'a', kind = 0) {
  const o = PL[NP] ?? (PL[NP] = {});
  o.name = name; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; o.pv = pv; o.kind = kind; NP++;
  return o;
}
let CT = 0, CV = 0, TD = 2;
const _w = [0, 0];
const coatOff = (u) => { _w[0] = (Math.sin(CT * 2.2 - u * 3.5) * u * u * 2.2 - CV * u * u * 4) * TD; _w[1] = 0; return _w; };

const Q = { bob: 0, lean: 0, head: 0, uaN: 0, faN: 0, uaF: 0, faF: 0, glow: 0, fling: 0, tw: 0 };
function pose(e) {
  const t = e.t ?? 0, an = e.anim, q = Q, k = clamp(e.aimK ?? 0, 0, 1);
  q.bob = Math.sin(t * 1.6) * 2.5; q.lean = 0.05 + Math.sin(t * 0.9) * 0.03; q.head = Math.sin(t * 1.1) * 0.06 - 0.05;
  // float: forearms held forward at chest height like working a marionette cross; fingers twitch
  q.uaN = 0.6 + Math.sin(t * 2.3) * 0.08; q.faN = 1.25 + Math.sin(t * 3.1) * 0.12;
  q.uaF = 0.8 + Math.sin(t * 2.1 + 1) * 0.08; q.faF = 1.45 + Math.sin(t * 2.7 + 2) * 0.12;
  q.glow = 0.25; q.fling = 0; q.tw = Math.sin(t * 9) * 0.08;
  if (an === 'summon') {
    const kk = ease.outCubic(k);
    q.uaN = lerp(q.uaN, 2.55, kk); q.faN = lerp(q.faN, 2.85, kk); q.uaF = lerp(q.uaF, 2.3, kk); q.faF = lerp(q.faF, 2.65, kk);
    q.lean = lerp(q.lean, -0.12, kk); q.head = lerp(q.head, -0.2, kk); q.glow = 0.25 + 0.75 * k; q.tw *= 2;
  } else if (an === 'throw') {
    if (k < 0.8) { const w = ease.outCubic(k / 0.8); q.uaN = lerp(q.uaN, 3.4, w); q.faN = lerp(q.faN, 3.9, w); q.lean = lerp(q.lean, -0.1, w); }
    else { const s = ease.outCubic((k - 0.8) / 0.2); q.uaN = lerp(3.4, 1.2, s); q.faN = lerp(3.9, 1.45, s); q.lean = lerp(-0.1, 0.18, s); q.fling = 1 - s * 0.3; }
    if (k >= 1) { const s = clamp(((e.stateT ?? 0.5) - 0.5) / 0.25, 0, 1); q.uaN = lerp(1.2, 0.6, s); q.faN = lerp(1.45, 1.25, s); q.fling = 1 - s; }
    q.glow = 0.3 + 0.4 * k;
  }
  if (K.hurtOf(e)) { q.head -= 0.4; q.lean -= 0.25; q.uaN -= 0.5; q.uaF -= 0.4; q.faN -= 0.6; }
  q.lean += K.deathK(e) * 0.5;
  return q;
}

const L = { nx: 0, ny: 0, hx: 0, hy: 0, hr: 0, tips: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], handN: [0, 0], handF: [0, 0] };
const TIPS = ['t1', 't2', 't3', 't4'];
function arm(side, sx, sy, ua, fa, vn, tw, out, ti) {
  const u = K.part('uarm'), f = K.part('farm');
  const dirU = PI / 2 - ua, dirF = PI / 2 - fa;       // limb angle (0 = hanging down, + = forward) → world dir
  place('uarm', sx, sy, dirU - u.ang, vn);
  const ex = sx + Math.cos(dirU) * u.len, ey = sy + Math.sin(dirU) * u.len;
  const rot = dirF - f.ang + tw;
  place('farm', ex, ey, rot, vn);
  K.pivotPos('farm', 'a', 'b', ex, ey, rot, 1, 1, _q); out[0] = _q[0]; out[1] = _q[1];
  for (let i = 0; i < 4; i++) { K.pivotPos('farm', 'a', TIPS[i], ex, ey, rot, 1, 1, _q); L.tips[ti + i * 2] = _q[0]; L.tips[ti + i * 2 + 1] = _q[1]; }
}
function layout(e, q) {
  NP = 0;
  const by = -70 + q.bob;
  const rot = q.lean;
  K.pivotPos('body', 'a', 'shL', 0, by, rot, 1, 1, _q); const lx = _q[0], ly = _q[1];
  K.pivotPos('body', 'a', 'shR', 0, by, rot, 1, 1, _q); const rx = _q[0], ry = _q[1];
  // far arm (behind the coat), coat, head, near arm
  arm('F', lx + 2, ly, q.uaF, q.faF, 'deep', -q.tw, L.handF, 8);
  place('body', 0, by, rot, 'base', 1, 1, 'a', 1);
  L.nx = 0; L.ny = by; L.hr = rot * 0.6 + q.head;
  place('head', 1, by + 3, L.hr);
  arm('N', rx - 1, ry, q.uaN, q.faN, 'base', q.tw, L.handN, 0);
  return L;
}

function drawAll(flash) {
  for (let i = 0; i < NP; i++) {
    const p = PL[i];
    // the white hit flash is drawn unwarped (one blit: no strip seams across the silhouette)
    if (p.kind === 1 && !flash) K.strips('body', 'a', p.x, p.y, p.rot, 1, 1, K.nStrips(7), 'y', coatOff, 1, p.vn);
    else K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, 1, p.vn);
  }
}

/** glowing threads: fingertips → puppets (world → local), or dangling/twitching lines */
function threads(ctx, e, q, t) {
  K.local();
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 0.7; ctx.strokeStyle = '#e6dcff';
  ctx.globalAlpha = ga * (0.35 + 0.35 * q.glow);
  ctx.beginPath();
  const P = e.puppets ?? [], f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
  let n = 0;
  for (let i = 0; i < P.length; i++) {
    const k = P[i];
    if (!k || k.dead) continue;
    const tx = (k.cx - e.cx) * f / sc, ty = ((k.y ?? k.cy) - e.bottom) / sc;
    for (let j = 0; j < 3; j++) { const ti = ((n * 3 + j) % 8) * 2; ctx.moveTo(L.tips[ti], L.tips[ti + 1]); ctx.lineTo(tx + (j - 1) * 5, ty + 2); }
    n++;
  }
  if (!n) for (let j = 0; j < 8; j++) {
    const x = L.tips[j * 2], y = L.tips[j * 2 + 1], len = 16 + 8 * Math.sin(t * 1.3 + j) + (e.anim === 'summon' ? 24 * clamp(e.aimK ?? 0, 0, 1) : 0);
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sin(t * 2 + j) * 3, y + len * 0.5, x + Math.sin(t * 1.7 + j * 1.3) * 5, y + len);
  }
  ctx.stroke();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}

export function draw(ctx, e, world, o, rig) {
  const q = pose(e), t = e.t ?? 0;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0); layout(e, q); K.end();
      e._pcorpse = true; claimDebris(world, e);
      const pieces = [];
      for (let i = 0; i < NP; i++) { const p = PL[i]; pieces.push({ name: p.name, pv: p.pv, x: p.x, y: p.y, rot: p.rot, sx: p.sx, sy: p.sy, vn: p.vn, vx: K.frand(-90, 90), vy: -K.frand(80, 260) * (p.name === 'head' ? 1.4 : 1), vr: K.frand(-7, 7) }); }
      K.spawnCorpse(world, e, rig, pieces, { life: 1.6, fade: 0.55, bounce: 0.25, dust: { n: 8, w: 22, h: 26, col: '#4a3a5a' } });
    }
    return;
  }
  CT = t; TD = rig.td; CV = clamp((e.vx ?? 0) * (e.facing < 0 ? -1 : 1) / 200, -1, 1);
  const sq = K.squashK(e);
  if (sq > 0) ctx.scale(1 + 0.06 * sq, 1 - 0.06 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (!o.flash) K.glow(0, -60 + q.bob, 34, '#5a2a8a', 0.22);
  const L0 = layout(e, q);
  drawAll(!!o.flash);
  if (!o.flash) {
    for (const pn of ['eyeL', 'eyeR']) { K.pivotPos('head', 'a', pn, 1, L0.ny + 3, L0.hr, 1, 1, _q); K.glow(_q[0], _q[1], 3 + 2.5 * q.glow, '#c870ff', 0.9); }
    threads(ctx, e, q, t);
    if (e.anim === 'summon') {
      const k = clamp(e.aimK ?? 0, 0, 1), mx = (L0.handN[0] + L0.handF[0]) / 2, my = (L0.handN[1] + L0.handF[1]) / 2 - 6;
      K.glow(mx, my, 10 + 18 * k, '#c060ff', 0.4 + 0.5 * k);
      K.glow(mx, my, 4 + 6 * k, '#f4e8ff', 0.7 * k, 0.2);
    }
    if (q.fling > 0) K.glow(L0.handN[0] + 6, L0.handN[1], 10, '#e8dcff', 0.7 * q.fling);
  }
  K.end();
  // violet motes drifting off the coat tails (camera space)
  if (world && o.cam && !o.flash) {
    const pool = e._fx ?? (e._fx = new K.FxPool(14));
    const dt = pool.step(K.clockOf(e, world));
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    for (let n = pool.rate(0, K.lod() === 0 ? 2 : 4, dt); n > 0; n--) pool.add(0, e.cx + f * sc * K.frand(-16, 12), e.bottom - sc * K.frand(0, 20), K.frand(-10, 10), K.frand(-30, -10), K.frand(0.6, 1.1), K.frand(2, 4), '#9a5ad0');
    if (pool.n) { ctx.setTransform(o.cam); pool.draw(ctx); }
  }
}
