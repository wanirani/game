// T2 painted mini-puppet: 피의 해골 (blood_skeleton). The skeleton rig's Kling art re-coloured as blood-soaked bone
// (tools/painted/enemies/blood_skeleton/make_src.py) + a rag-wrapped femur club from the ART-ENEMY-2 props sheet.
// Driven by AI_A.reviver (walker + collapse/pile/reform):
//   idle / walk (9 rad/s stride) · attack (overhead club: wind-up glint → strike at params.windup → crimson trail) ·
//   hurt (flash + squash + recoil) · airborne · collapse (every bone drops into a heap, 0.35 s) · pile (heap on a blood
//   pool; trembles and pulses red before it revives) · reform (the bones fly back up in sequence, 0.7 s) ·
//   death (the corpse scatters from wherever the bones are — standing or heaped).
// Blood drips (render-only FxPool, per second of game time) run off the ribs and the club.
//
// This module also exports the small puppet helpers shared by the other ART-ENEMY-2 renderers (Placer, seedOf, runeCircle, claimDeathDebris).
import * as K from '../enemy_kit.js';
import { clamp, lerp, ease } from '../../../core/math.js';
import { bipedPose, dirOf, swingTrail, glint, HP } from './_biped.js';

export const spec = {
  id: 'blood_skeleton', tier: 'T2', src: 'blood_skeleton',
  bake: { outline: 0.42, deep: { '*': 0.62 }, deepTint: 'rgb(150,120,128)' },
};

// ─────────────────────────────── shared puppet helpers (ART-ENEMY-2) ───────────────────────────────
const _b = [0, 0];
/** reusable list of part placements (no per-frame allocation) */
export class Placer {
  constructor() { this.L = []; this.n = 0; }
  reset() { this.n = 0; }
  place(name, x, y, rot, vn = 'base', sx = 1, sy = 1, pv = 'a') {
    let o = this.L[this.n];
    if (!o) o = this.L[this.n] = { name: '', x: 0, y: 0, rot: 0, vn: 'base', sx: 1, sy: 1, pv: 'a', fx: null, alpha: 1 };
    o.name = name; o.x = x; o.y = y; o.rot = rot; o.vn = vn; o.sx = sx; o.sy = sy; o.pv = pv; o.fx = null; o.alpha = 1;
    this.n++;
    return o;
  }
  /** part with pivot a at (x,y) and its a→b axis along world dir (scaled s); returns pivot b (shared array) */
  bone(name, x, y, dir, vn = 'base', s = 1) {
    const p = K.part(name);
    if (!p) { _b[0] = x; _b[1] = y; return _b; }
    this.place(name, x, y, dir - p.ang, vn, s, s);
    _b[0] = x + Math.cos(dir) * p.len * s; _b[1] = y + Math.sin(dir) * p.len * s;
    return _b;
  }
  draw(alpha = 1) {
    for (let i = 0; i < this.n; i++) {
      const p = this.L[i];
      if (p.fx) p.fx(p, alpha); else K.put(p.name, p.pv, p.x, p.y, p.rot, p.sx, p.sy, alpha * p.alpha, p.vn);
    }
  }
  /** local centre + rotation of placement i → out [x, y, rot] (re-pivot on the part centre) */
  centre(i, rig, out) {
    const p = this.L[i], part = rig.parts[p.name];
    if (!part) { out[0] = p.x; out[1] = p.y; out[2] = p.rot; return out; }
    const q = typeof p.pv === 'string' ? (part.piv[p.pv] ?? [part.w / 2, part.h / 2]) : p.pv;
    const k = 1 / rig.td, lx = (part.w / 2 - q[0]) * p.sx * k, ly = (part.h / 2 - q[1]) * p.sy * k;
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    out[0] = p.x + c * lx - s * ly; out[1] = p.y + s * lx + c * ly; out[2] = p.rot;
    return out;
  }
  /** hand the placements to a world.fx corpse; velOf(p, i) → [vx, vy, vr] */
  corpse(world, e, rig, velOf, o) {
    const pieces = [];
    for (let i = 0; i < this.n; i++) {
      const p = this.L[i];
      if (p.noCorpse) continue;
      const v = velOf(p, i);
      pieces.push({ name: p.name, pv: p.pv, x: p.x, y: p.y, rot: p.rot, sx: p.sx, sy: p.sy, vn: p.vn === 'glow' ? 'base' : p.vn, alpha: p.alpha, vx: v[0], vy: v[1], vr: v[2] });
    }
    K.spawnCorpse(world, e, rig, pieces, o);
  }
}
/** Claims the vector death debris (world.spawnBones / spawnDebris, pushed by Enemy.die for bone/metal/stone) for a
 *  painted death. Same test as _biped.claimDebris, but the age window follows the time since the death (e.dying counts
 *  down from def.dieTime) instead of a fixed 0.06 s: on a slow frame several fixed update steps run before the first
 *  render of the dying enemy, the debris is already older than 0.06 s and would otherwise stay on screen next to the
 *  painted corpse. The body may slide after the kill, so the position window grows with the age.
 *  Only materials that spawn such debris claim any: a paper/flesh/ghost body would otherwise take the bones of a
 *  vector-drawn (or culled) neighbour that died next to it. */
const DEBRIS_MAT = new Set(['bone', 'metal', 'stone']);
export function claimDeathDebris(world, e) {
  const L = world?.debrisList;
  if (!L || !DEBRIS_MAT.has(e.def?.material)) return;
  const t0 = e.def?.dieTime ?? 0.35;
  const win = clamp(t0 - (e.dying ?? t0), 0, t0) + 0.07;
  for (const d of L) {
    const age = d.maxLife - d.life;
    if (age < win && Math.abs(d.x - e.cx) < 14 + 600 * age + d.w && Math.abs(d.y - e.cy) < 24 + 700 * age + 450 * age * age + d.h) d.life = 0;
  }
}
/** procedural rune circle (additive, local space; flat = seen from the side as an ellipse on the floor) */
export function runeCircle(ctx, x, y, r, t, color, a, flat = true) {
  if (r < 2 || a <= 0.02) return;
  K.local();
  const ga = ctx.globalAlpha, gco = ctx.globalCompositeOperation;
  ctx.globalAlpha = ga * a; ctx.globalCompositeOperation = 'lighter';
  ctx.save(); ctx.translate(x, y); if (flat) ctx.scale(1, 0.32);
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(t * 1.5);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 2) / 6) * Math.PI * 2; ctx.moveTo(Math.cos(a0) * r * 0.78, Math.sin(a0) * r * 0.78); ctx.lineTo(Math.cos(a1) * r * 0.78, Math.sin(a1) * r * 0.78); }
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) { const a0 = (i / 8) * Math.PI * 2; ctx.fillRect(Math.cos(a0) * r * 0.89 - 1.5, Math.sin(a0) * r * 0.89 - 1.5, 3, 3); }
  ctx.restore();
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = gco;
}
/** render-side seed of an entity (stable per instance: spawn position) */
export const seedOf = (e) => ((e.spawnX ?? 0) * 0.137 + (e.spawnY ?? 0) * 0.071) % 97;

// ─────────────────────────────── blood skeleton ───────────────────────────────
const P = new Placer();
const _q = [0, 0], _c = [0, 0, 0];

function layout(e, q) {
  P.reset();
  const hipY = -40 + q.bob, sx0 = q.stepX;
  // back leg
  let b = P.bone('thigh', sx0 - 1.5, hipY, dirOf(q.hipB), 'deep');
  const bkx = b[0], bky = b[1];
  P.bone('shin', bkx, bky, dirOf(q.hipB + q.knB), 'deep');
  const pr = q.lean * 0.35;
  P.place('pelvis', sx0, hipY, pr, 'base', 1, 1, 'hip');
  K.pivotPos('pelvis', 'hip', 'a', sx0, hipY, pr, 1, 1, _q);
  const lx = _q[0], ly = _q[1];
  const tp = K.part('torso'), trot = (-HP + q.lean) - tp.ang;
  K.pivotPos('torso', 'a', 'shoulder', lx, ly, trot, 1, 1, _q); const shx = _q[0], shy = _q[1];
  K.pivotPos('torso', 'a', 'neck', lx, ly, trot, 1, 1, _q); const nx = _q[0], ny = _q[1];
  // back arm (empty hand, clawing)
  b = P.bone('uarm', shx - 1.5, shy, dirOf(q.shB), 'deep');
  const bex = b[0], bey = b[1];
  const fp = K.part('farm');
  P.place('farm', bex, bey, dirOf(q.shB + q.elB) - fp.ang, 'deep');
  P.place('torso', lx, ly, trot);
  // front leg
  b = P.bone('thigh', sx0 + 1.5, hipY, dirOf(q.hipF));
  P.bone('shin', b[0], b[1], dirOf(q.hipF + q.knF));
  // skull + jaw
  const hr = q.lean * 0.6 + q.head;
  P.place('skull', nx, ny, hr);
  K.pivotPos('skull', 'a', 'jaw', nx, ny, hr, 1, 1, _q);
  P.place('jaw', _q[0], _q[1], hr + q.jaw * 0.9);
  // front arm + club (club first so the finger bones wrap the grip)
  b = P.bone('uarm', shx + 0.5, shy, dirOf(q.shF));
  const fex = b[0], fey = b[1];
  const ffr = dirOf(q.shF + q.elF) - fp.ang;
  K.pivotPos('farm', 'a', 'grip', fex, fey, ffr, 1, 1, _q);
  const gx = _q[0], gy = _q[1];
  const cp = K.part('club'), cdir = dirOf(q.wA);
  P.place('club', gx, gy, cdir - cp.ang);
  K.pivotPos('club', 'a', 'head', gx, gy, cdir - cp.ang, 1, 1, _q);
  const hx = _q[0], hy = _q[1];
  P.place('farm', fex, fey, ffr);
  return { shx, shy, hx, hy, nx, ny, hr, reach: (K.part('uarm').len + fp.len + cp.len) };
}

/** heap target of placement i (centre x, centre y, rot) — deterministic per instance */
function heapOf(i, rig, seed, out) {
  const p = P.L[i], part = rig.parts[p.name];
  const h = K.h1(seed + i * 7.13), h2 = K.h1(seed * 1.7 + i * 3.31);
  const big = p.name === 'torso' || p.name === 'pelvis';
  let rot;
  if (p.name === 'skull') rot = 0.35 + h2 * 0.5;
  else if (p.name === 'jaw') rot = -0.3 + h2 * 0.6;
  else if (part?.ang != null && part.len) rot = (h2 < 0.5 ? 0 : Math.PI) - part.ang + (h - 0.5) * 0.4;
  else rot = (h2 < 0.5 ? 1 : -1) * HP + (h - 0.5) * 0.3;
  const w = (part?.w ?? 8) / rig.td, hh = (part?.h ?? 8) / rig.td;
  const half = (Math.abs(Math.sin(rot)) * w + Math.abs(Math.cos(rot)) * hh) / 2 * 0.82;
  const lift = p.name === 'skull' ? 7 : p.name === 'jaw' ? 0 : (i / P.n) * 4;
  out[0] = (h - 0.5) * (big ? 10 : 30); out[1] = -half - lift; out[2] = rot;
  return out;
}

const _h = [0, 0, 0];
/** heap blend of the current AI state: k 0 standing … 1 heaped, mode 'fall' (collapse / pile) | 'rise' (reform) */
const HK = { k: 1, mode: 'fall', shake: 0 };
function heapK(e) {
  const st = e.state, T = e.params?.revive ?? 3.2, tS = e.stateT ?? 0;
  HK.k = 1; HK.mode = 'fall'; HK.shake = 0;
  if (st === 'collapse') HK.k = clamp(tS / 0.35, 0, 1);
  else if (st === 'reform') { HK.k = clamp(tS / 0.7, 0, 1); HK.mode = 'rise'; HK.shake = (1 - HK.k) * 1.2; }
  else if (tS > T - 0.8) HK.shake = 1.5;
  return HK;
}
/** draw the placements as a heap blend: k=0 standing (stored or current) … 1 heaped; mode 'fall' | 'rise'.
 *  dry = only record each bone's current pose (p._hx/_hy/_hr) without drawing (a death in mid-collapse / mid-reform
 *  scatters the bones from where they are, not from the finished heap) */
function drawHeap(e, rig, k, mode, shake, dry = false) {
  const seed = seedOf(e), st = e._bsStand;
  for (let i = 0; i < P.n; i++) {
    const p = P.L[i], part = rig.parts[p.name];
    if (!part) continue;
    P.centre(i, rig, _c);
    // falling: from the last standing pose before the collapse; rising: towards the current (idle) layout
    const useSt = mode === 'fall' && st && st.n === P.n;
    const sx = useSt ? st.a[i * 3] : _c[0], sy = useSt ? st.a[i * 3 + 1] : _c[1], sr = useSt ? st.a[i * 3 + 2] : _c[2];
    heapOf(i, rig, seed, _h);
    let u;
    if (mode === 'fall') u = clamp(k * (1.25 - (i % 4) * 0.08), 0, 1);
    else { const d = (i / P.n) * 0.4; u = 1 - clamp((k - d) / 0.6, 0, 1); }
    const fall = mode === 'fall' ? u * u : ease.inOutCubic(u);
    const x = lerp(sx, _h[0], mode === 'fall' ? ease.outCubic(u) : fall) + shake * Math.sin((e.t ?? 0) * 50 + i);
    let y = lerp(sy, _h[1], fall);
    if (mode === 'fall' && u > 0.82) y -= Math.sin((u - 0.82) / 0.18 * Math.PI) * 2.5;            // clatter bounce
    if (mode === 'rise' && u < 1 && u > 0) y -= Math.sin(u * Math.PI) * 6;                          // bones leap up
    const rot = lerp(sr, _h[2], mode === 'fall' ? ease.outCubic(u) : fall);
    if (!dry) K.put(p.name, [part.w / 2, part.h / 2], x, y, rot, p.sx, p.sy, 1, p.vn);
    p._hx = x; p._hy = y; p._hr = rot;          // current heap pose (death from the heap)
  }
}
function storeStand(e, rig) {
  let st = e._bsStand;
  if (!st) st = e._bsStand = { a: new Float32Array(60), n: 0 };
  st.n = P.n;
  for (let i = 0; i < P.n && i < 20; i++) { P.centre(i, rig, _c); st.a[i * 3] = _c[0]; st.a[i * 3 + 1] = _c[1]; st.a[i * 3 + 2] = _c[2]; }
}

function die(e, world, rig, heaped) {
  e._pcorpse = true;
  claimDeathDebris(world, e);
  const kb = Math.sign(e.vx || 0) * (e.facing < 0 ? -1 : 1);
  if (heaped) {
    // shattered heap: re-pivot every bone on its centre at its heap pose, small scatter
    for (let i = 0; i < P.n; i++) { const p = P.L[i], part = rig.parts[p.name]; if (!part || p._hx == null) continue; p.x = p._hx; p.y = p._hy; p.rot = p._hr; p.pv = [part.w / 2, part.h / 2]; }
  }
  P.corpse(world, e, rig, (p) => {
    const up = p.name === 'skull' ? 1.4 : p.name === 'club' ? 0.6 : 1;
    return [kb * 60 + K.frand(-110, 110), -K.frand(heaped ? 60 : 120, heaped ? 220 : 380) * up, K.frand(-9, 9)];
  }, { life: 1.5, fade: 0.5, bounce: 0.32, dust: { n: 7, w: 14, h: 24, col: '#6a1a1a' } });
}

const EYE = '#ffd040';
export function draw(ctx, e, world, o, rig) {
  const st = e.state, T = e.params?.revive ?? 3.2;
  const heapState = st === 'collapse' || st === 'pile' || st === 'reform';
  if (e.dying > 0 && world) {
    if (!e._pcorpse) {
      K.begin(ctx, rig, 0);
      if (heapState) {
        // same layout + heap blend as the last drawn heap frame (the bones scatter from where they are)
        layout(e, bipedPose(IDLE, { stride: 9 }));
        const h = heapK(e);
        drawHeap(e, rig, h.k, h.mode, 0, true);
      } else layout(e, bipedPose(e, { stride: 9, pose: 'overhead', windup: e.params?.windup, stepAmp: 4, restWA: 2.75 }));
      K.end();
      die(e, world, rig, heapState);
    }
    return;
  }
  const q = bipedPose(e, { stride: 9, pose: 'overhead', windup: e.params?.windup, stepAmp: 4, restWA: 2.75 });
  const sq = K.squashK(e);
  if (sq > 0 && !heapState) ctx.scale(1 + 0.07 * sq, 1 - 0.07 * sq);
  K.begin(ctx, rig, K.flashK(e, o));
  if (heapState) {
    const { k, mode, shake } = heapK(e);
    const tS = e.stateT ?? 0;
    // blood pool under the heap (grows while it lies there)
    const pool = st === 'pile' ? clamp(0.5 + tS / T, 0, 1) : st === 'collapse' ? k * 0.5 : 1 - k;
    K.shadow(20 * (0.6 + 0.5 * pool), 0.35 + 0.3 * pool);
    if (!o.flash) K.glow(0, -2, 16 + 10 * pool, '#5a0008', 0.35 * pool, 0.6);
    layout(e, bipedPose(IDLE, { stride: 9 }));
    drawHeap(e, rig, k, mode, shake);
    // revive warning: red pulse builds up over the last 1.2 s of the heap, peaks through the reform
    const pulse = st === 'reform' ? 1 - k * 0.6 : st === 'pile' ? clamp((tS - (T - 1.2)) / 1.2, 0, 1) : 0;
    if (pulse > 0 && !o.flash) {
      K.glow(0, -10, 34 + 10 * Math.sin((e.t ?? 0) * 18), '#ff2030', pulse * 0.75);
      for (let i = 0; i < P.n; i++) { const p = P.L[i]; if (p.name === 'skull') { K.glow(p._hx ?? 0, (p._hy ?? 0) - 1, 5 + 3 * pulse, EYE, 0.5 + 0.5 * pulse); break; } }
    }
    K.end();
    drips(ctx, e, world, o, rig, true);
    return;
  }
  K.shadow(15);
  const L = layout(e, q);
  P.draw();
  storeStand(e, rig);
  if (q.trail && !o.flash) swingTrail(ctx, L.shx, L.shy, q.trail[0], q.trail[1], L.reach, 13, '#ff4a3a', q.trail[2]);
  if (q.tele > 0.45) glint(ctx, L.hx, L.hy, 5 + 5 * q.tele, '#ff8070', (q.tele - 0.45) / 0.55);
  if (!o.flash) {
    K.pivotPos('skull', 'a', 'eye', L.nx, L.ny, L.hr, 1, 1, _q);
    K.glow(_q[0], _q[1], 2.8 + (q.tele > 0 ? 2.5 * q.tele : 0), EYE, 0.55 + 0.2 * Math.sin((e.t ?? 0) * 6) + q.tele * 0.3);
  }
  K.end();
  drips(ctx, e, world, o, rig, false);
}
const IDLE = { t: 0, animT: 0, anim: 'idle', params: {}, flashT: 0, stun: 0, dying: 0, onGround: true, def: {} };

/** blood drips: shed from the ribs / club while standing, seep from the heap while lying (world space, per second) */
function drips(ctx, e, world, o, rig, heaped) {
  if (!world || !o.cam) return;
  const pool = e._fx ?? (e._fx = new K.FxPool(14));
  const dt = pool.step(K.clockOf(e, world));
  const f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
  for (let n = pool.rate(0, heaped ? 2 : 3.2, dt); n > 0; n--) {
    const x = heaped ? K.frand(-12, 12) : K.frand(-6, 8), y = heaped ? -K.frand(2, 10) : -K.frand(30, 58);
    pool.add(1, e.cx + f * sc * x, e.bottom + sc * y, 0, K.frand(10, 40), K.frand(0.35, 0.6), 1.3, '#9a0a14');
  }
  ctx.setTransform(o.cam);
  pool.draw(ctx);
}
