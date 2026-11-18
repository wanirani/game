// v2 play — breakables and pickups (rules side: data and hit circles, no screen). docs/v2/PLAY_API.md 13
//
//   W.breakables = [{ kind, x, z, rot?, drop?, y? }]   (AREA_FORMAT 15)  ->  sim.breakables[] (whole | broken) + sim.pickups[] (a fixed pool)
//   What breaks them: every hero hit shape (combo 1-3, sweep, charged whip, plunge + its landing circle) and, for clay only, the hero's ROLL
//   (the jar breaks before the body reaches it: the roll loses no speed). Crates and barrels need a hit and stop a roll. Enemies never break them.
//   On break: event break(b, by, dirX, dirZ) -> a drop drawn from the kind's table with the sim's own seedable generator (no Math.random here)
//   -> event drop(what, n, b) -> n pickups pop out in an arc, bounce, settle, are pulled to the hero when he is near, are taken on touch
//   -> event pickup(what, n, p). Coins count on hero.coins; heal and resonance use hero.hp / hero.reso and are never taken while that is full.
//   Nothing is allocated per tick: the pool objects, the probe and the breakable records are made once (initBreakables).
import { STEP_UP } from './collide.js';

/** kinds: r = half-size of the (square) collision and radius of the hit circle, h = height, mat = what it is made of, roll = the roll breaks it */
export const BREAK_KINDS = Object.freeze({
  jar: Object.freeze({ id: 'jar', mat: 'clay', r: 17, h: 66, roll: true }),        // tall storage jar
  pot: Object.freeze({ id: 'pot', mat: 'clay', r: 19, h: 40, roll: true }),        // round pot
  urn: Object.freeze({ id: 'urn', mat: 'clay', r: 11, h: 32, roll: true }),        // small urn / offering jar
  crate: Object.freeze({ id: 'crate', mat: 'wood', r: 27, h: 52, roll: false }),   // nailed boards
  barrel: Object.freeze({ id: 'barrel', mat: 'barrel', r: 23, h: 70, roll: false }),   // staves and iron hoops
});
/**
 * drop tables: shares in percent [nothing, coins, heal, resonance] and how many coins [least, most]. Barrels and crates are a little richer
 * than small pots. An area entry may fix its drop: drop: 'none' | 'coin' | 'coin3' (coin + count) | 'heal' | 'reso'.
 */
export const DROP_TABLE = Object.freeze({
  urn: Object.freeze({ share: Object.freeze([46, 34, 12, 8]), coins: Object.freeze([1, 2]) }),
  pot: Object.freeze({ share: Object.freeze([40, 35, 15, 10]), coins: Object.freeze([1, 3]) }),
  jar: Object.freeze({ share: Object.freeze([38, 36, 15, 11]), coins: Object.freeze([1, 4]) }),
  crate: Object.freeze({ share: Object.freeze([32, 40, 17, 11]), coins: Object.freeze([2, 5]) }),
  barrel: Object.freeze({ share: Object.freeze([30, 40, 18, 12]), coins: Object.freeze([2, 5]) }),
});
export const WHAT = Object.freeze(['coin', 'heal', 'reso']);
/** numbers of the pickups (px, seconds) */
export const PICK = Object.freeze({
  pool: 40,          // live pickups at most (the oldest is reused beyond that)
  life: 12,          // seconds on the ground before it vanishes (the last blink seconds it blinks)
  blink: 3,
  grav: 1500, bounce: 0.42, drag: 0.6,   // arc and bounce
  takeAfter: 0.28,   // it cannot be taken before this age (the pop is always seen)
  pullR: 118, pullV: 560, pullAcc: 9,   // within pullR of the hero it flies to him (faster than he runs)
  takeR: 24,         // touch
  heal: 12,          // health of one heal piece (a candle is 20 at three candles)
  reso: 0.34,        // resonance of one mote (cells)
  r: 6,              // body of a pickup against walls
});

const U32 = 4294967296;
/** mulberry32 on sim.brkSeed -> 0..1 */
function rand(S) { let t = (S.brkSeed = (S.brkSeed + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / U32; }
/** seed the drop generator (the scene does it when an area is entered; the tests fix it) */
export function seedBreak(S, seed) { S.brkSeed = (Number.isFinite(seed) ? seed : 1) | 0; }

/** (re)build the breakable records, their collision boxes and the pickup pool from W.breakables. Called from Sim.reset(). */
export function initBreakables(S) {
  const W = S.W, L = Array.isArray(W.breakables) ? W.breakables : [], B = W.boxes;
  if (S.brkSeed === undefined) S.brkSeed = 0x2F6E2B1;
  S.breakables = []; S.brkLive = 0; S.brkProbe = S.brkProbe ?? { x: 0.5, z: 0.5, y: 0.5, r: PICK.r, h: 40 };
  for (let i = 0; i < L.length; i++) {
    const d = L[i], K = BREAK_KINDS[d.kind]; if (!K || !Number.isFinite(d.x) || !Number.isFinite(d.z)) continue;
    S.qx = d.x; S.qz = d.z; S.qy = Number.isFinite(d.y) ? d.y + STEP_UP : 1e9; S._gq();
    const y = Number.isFinite(S.g) ? S.g : (d.y ?? 0);
    let box = null; for (let j = 0; j < B.length; j++) if (B[j].brk === i) { box = B[j]; break; }   // the scene's area loader makes it (same key layout as every other box)
    if (!box) { box = { x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0, solid: true, walk: false, brk: i }; B.push(box); }
    box.x0 = d.x - K.r; box.x1 = d.x + K.r; box.z0 = d.z - K.r; box.z1 = d.z + K.r; box.y0 = y - 20; box.y1 = y + K.h; box.solid = true; box.walk = false;
    S.breakables.push({ id: i, kind: K.id, mat: K.mat, def: K, x: d.x, z: d.z, y, r: K.r, h: K.h, rot: Number.isFinite(d.rot) ? d.rot : 0, drop: typeof d.drop === 'string' ? d.drop : null, broken: false, box, by: null });
    S.brkLive++;
  }
  if (!S.pickups) { S.pickups = []; for (let i = 0; i < PICK.pool; i++) S.pickups.push({ on: false, what: 0, x: 0.5, y: 0.5, z: 0.5, vx: 0.5, vy: 0.5, vz: 0.5, gy: 0.5, t: 0.5, rest: false, pull: false, n: 0, seq: 0 }); }
  for (let i = 0; i < S.pickups.length; i++) S.pickups[i].on = false;
  S.pickN = 0; S.pickSeq = 0;
}
/** break one (silent: no event, no drop — the scene's memory of what was already broken) */
export function breakOne(S, b, by, dx, dz, silent) {
  if (!b || b.broken) return false;
  b.broken = true; b.by = by; b.box.solid = false; S.brkLive--;
  if (silent) return true;
  let l = Math.sqrt(dx * dx + dz * dz); if (!(l > 1e-6)) { dx = 1; dz = 0; l = 1; }
  dx /= l; dz /= l;
  S.emit('break', b, by, dx, dz);
  rollDrop(S, b, dx, dz);
  return true;
}
/** the drop of a broken thing: table or the area's fixed drop -> pickups */
function rollDrop(S, b, dx, dz) {
  const T = DROP_TABLE[b.kind]; let what = -1, n = 0;
  if (b.drop) {
    const d = b.drop;
    if (d === 'none') what = -1; else if (d === 'heal') { what = 1; n = 1; } else if (d === 'reso') { what = 2; n = 1; }
    else if (d.indexOf('coin') === 0) { what = 0; const k = parseInt(d.slice(4), 10); n = k > 0 ? Math.min(8, k) : T.coins[0] + Math.floor(rand(S) * (T.coins[1] - T.coins[0] + 1)); }
  } else {
    const u = rand(S) * 100, s = T.share;
    if (u < s[0]) what = -1; else if (u < s[0] + s[1]) { what = 0; n = T.coins[0] + Math.floor(rand(S) * (T.coins[1] - T.coins[0] + 1)); } else if (u < s[0] + s[1] + s[2]) { what = 1; n = 1; } else { what = 2; n = 1; }
  }
  if (what < 0) { S.emit('drop', 'none', 0, b); return; }
  S.emit('drop', WHAT[what], n, b);
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(dz, dx) + (rand(S) - 0.5) * 2.4, sp = 70 + rand(S) * 95;
    spawnPickup(S, what, b.x, b.y + b.h * 0.55, b.z, Math.cos(a) * sp, 300 + rand(S) * 130, Math.sin(a) * sp * 0.85, b.y);
  }
}
/** one pickup into the pool -> the pool object (what: 0 coin · 1 heal · 2 resonance; gy = the ground it belongs to) */
export function spawnPickup(S, what, x, y, z, vx, vy, vz, gy) {
  const P = S.pickups; let p = null, old = null;
  for (let i = 0; i < P.length; i++) { const q = P[i]; if (!q.on) { p = q; break; } if (!old || q.seq < old.seq) old = q; }
  if (!p) p = old; else S.pickN++;
  p.on = true; p.what = what; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.gy = gy; p.t = 0; p.rest = false; p.pull = false; p.n = 1; p.seq = ++S.pickSeq;
  return p;
}
/** does the hero want it now? (a heal piece at full health and a mote at full resonance stay where they are) */
function wants(h, what) { return what === 0 || (what === 1 ? h.hp < h.hpMax - 1e-6 : h.reso < h.resoMax - 1e-6); }
/** pickups: arc, bounce, settle, pull, touch, time out. Called from Sim.update() while any is live. */
export function tickPickups(S, dt) {
  const P = S.pickups, h = S.hero, pr = S.brkProbe, K = PICK; let live = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i]; if (!p.on) continue;
    p.t += dt;
    if (p.t >= K.life) { p.on = false; continue; }
    live++;
    const hx = h.x - p.x, hz = h.z - p.z, d2 = hx * hx + hz * hz, near = !h.dead && p.t >= K.takeAfter && Math.abs(h.y - p.gy) < 90 && wants(h, p.what);
    if (near && d2 < K.takeR * K.takeR && p.y - h.y < 110) { take(S, p); live--; continue; }
    p.pull = near && d2 < K.pullR * K.pullR;
    let mx, mz;
    if (p.pull) {   // flies to the hero's chest, faster the nearer
      const d = Math.sqrt(d2) || 1, k = Math.min(1, K.pullAcc * dt), v = K.pullV * (0.45 + 0.55 * (1 - d / K.pullR));
      p.vx += (hx / d * v - p.vx) * k; p.vz += (hz / d * v - p.vz) * k; p.vy += ((h.y + 46 - p.y) * 9 - p.vy) * k; p.rest = false;
      mx = p.vx * dt; mz = p.vz * dt; p.y += p.vy * dt;
    } else if (p.rest) continue;
    else { p.vy -= K.grav * dt; mx = p.vx * dt; mz = p.vz * dt; p.y += p.vy * dt; }
    // walls: the body is tested at the ground it belongs to (a low wall stops it whatever its height in the air); floor edges turn it back
    pr.x = p.x; pr.z = p.z; pr.y = p.gy; S.qx = mx; S.qz = mz; S._mq(pr);
    if (Math.abs(pr.x - p.x) > Math.abs(mx) + 1e-6) pr.x = p.x;   // (born inside a solid box and thrown out of its far side - possibly into a wall: it stays on that axis instead)
    if (Math.abs(pr.z - p.z) > Math.abs(mz) + 1e-6) pr.z = p.z;
    S.qx = pr.x; S.qz = pr.z; S.qy = p.gy + STEP_UP; S._gq();
    if (!(S.g >= p.gy - 20)) { pr.x = p.x; pr.z = p.z; p.vx = -p.vx * 0.4; p.vz = -p.vz * 0.4; }   // no floor there (an edge, a pit): it stays on its floor
    else {
      if (Math.abs(pr.x - (p.x + mx)) > 1e-4) p.vx = -p.vx * 0.4;
      if (Math.abs(pr.z - (p.z + mz)) > 1e-4) p.vz = -p.vz * 0.4;
      p.gy = S.g;
    }
    p.x = pr.x; p.z = pr.z;
    if (p.y <= p.gy) {
      p.y = p.gy;
      if (p.pull) { if (p.vy < 0) p.vy = 0; }
      else if (p.vy < -90) { p.vy = -p.vy * K.bounce; p.vx *= K.drag; p.vz *= K.drag; S.emit('pickupLand', p, -p.vy); }
      else { p.vy = 0; p.vx = 0; p.vz = 0; p.rest = true; }
    }
  }
  S.pickN = live;
}
function take(S, p) {
  const h = S.hero; p.on = false;
  if (p.what === 0) h.coins = (h.coins || 0) + p.n;
  else if (p.what === 1) h.hp = Math.min(h.hpMax, h.hp + PICK.heal);
  else if (S.addReso) S.addReso(PICK.reso); else h.reso = Math.min(h.resoMax, h.reso + PICK.reso);
  S.emit('pickup', WHAT[p.what], p.n, p);
}
/** the hero's hit shape (box or arc of the move, as for enemies) against every whole breakable. Called from Sim._heroHit. */
export function breakHits(S, h, mv) {
  const L = S.breakables;
  for (let i = 0; i < L.length; i++) {
    const b = L[i]; if (b.broken) continue;
    if (!S._inShapeO(h, mv, b)) continue;
    breakOne(S, b, mv.id, b.x - h.x, b.z - h.z, false);
  }
}
/** everything whole inside a circle on the ground (the plunge's landing ring, a skill that hurts in an area) -> how many broke */
export function breakCircle(S, x, z, r, y0, y1, by) {
  const L = S.breakables; let n = 0;
  for (let i = 0; i < L.length; i++) {
    const b = L[i]; if (b.broken) continue;
    const dx = b.x - x, dz = b.z - z, rr = r + b.r;
    if (dx * dx + dz * dz > rr * rr || b.y > y1 || b.y + b.h < y0) continue;
    if (breakOne(S, b, by, dx, dz, false)) n++;
  }
  return n;
}
/**
 * the roll: clay in the path of the body breaks BEFORE the move of this tick (the body is the same square the walls stop, one step ahead),
 * so nothing ever clips the roll's speed. Wood is left alone (its box stops the roll). Called from Sim._hero while rolling.
 */
export function rollBreaks(S, h, dt) {
  const L = S.breakables, nx = h.x + h.vx * dt, nz = h.z + h.vz * dt, x0 = Math.min(h.x, nx), x1 = Math.max(h.x, nx), z0 = Math.min(h.z, nz), z1 = Math.max(h.z, nz);
  for (let i = 0; i < L.length; i++) {
    const b = L[i]; if (b.broken || !b.def.roll) continue;
    const m = h.r + b.r + 2;
    if (b.x < x0 - m || b.x > x1 + m || b.z < z0 - m || b.z > z1 + m || b.y > h.y + 80 || b.y + b.h < h.y + 4) continue;
    breakOne(S, b, 'roll', h.roll.dx, h.roll.dz, false);
  }
}
/** scene memory: break the ones named by index without events (what was already broken in this visit) */
export function breakSilent(S, ids) { const L = S.breakables; let n = 0; for (let i = 0; i < L.length; i++) if (ids.has ? ids.has(L[i].id) : ids.includes(L[i].id)) { if (breakOne(S, L[i], 'memory', 1, 0, true)) n++; } return n; }
