// v2g — breakables and pickups, scene side (docs/v2/ENGINE_API.md 13). Rules: src/v2/play/breakables.js. Meshes: src/v2/env/breakables.js.
//   whole things   one static buffer for the area (lit like the kit's props), one draw call; a broken one's vertices are folded to nothing
//   pieces         a pool of small rigid bodies (thrown from the hit, tumbling, one or two bounces, lying flat a moment, fading) written into
//                  one dynamic buffer every frame together with the pickups: one draw call (+ one blended call while pieces fade)
//   pickups        the rules' pool (sim.pickups) drawn as small 3D things: a spinning silver coin, a red cut stone, a blue-white mote
//   feel           sound event break.clay / break.crate / break.barrel (layer set and pitch change per break), a tiny hit-stop, a light shake,
//                  a puff of dust (effect preset break.puff)
//   memory         what is broken stays broken while the hero stays in the area (rebuild, save and load); a new arrival finds everything whole
// Nothing is allocated per tick or per frame.
import { wholeModel, pieceModels, pickupModels, bakeWhole, writeDyn, paintBreakAtlas, BRK_VERT, KIND_TONE } from '../env/breakables.js';
import { BREAK_KINDS, breakSilent, seedBreak, PICK } from '../play/index.js';
import { feel } from '../feel/index.js';
import { PRESET_IDS } from '../fx/index.js';

const MAX_SH = 128, DYN_VERTS = 30000, G = 1500, FADE = 0.5;
const CLAY_EV = ['break.clay', 'break.clay.b', 'break.clay.c'];
const SIZE_P = { jar: 0.9, pot: 1, urn: 1.2, crate: 1, barrel: 1 };   // a small urn rings higher than a tall jar
const lcg = (s) => () => ((s.v = (Math.imul(s.v, 1664525) + 1013904223) >>> 0) / 4294967296);

export class Breakables {
  constructor(sc) {
    this.sc = sc; this.coins = 0; this.broken = new Set(); this.brokenArea = ''; this.keepNext = false; this.visits = 0;
    this.L0 = null; this.canvas = null; this.tex = null; this.whole = null; this.wf = null; this.wu = null; this.ranges = []; this.live = 0; this.wholeTris = 0;
    this.dab = new ArrayBuffer(DYN_VERTS * BRK_VERT); this.df = new Float32Array(this.dab); this.du = new Uint8Array(this.dab); this.dbuf = null; this.dgen = -1; this.dn = 0; this.dfade = 0;
    this.sh = []; for (let i = 0; i < MAX_SH; i++) this.sh.push({ on: false, m: null, x: 0.5, y: 0.5, z: 0.5, px: 0.5, py: 0.5, pz: 0.5, vx: 0.5, vy: 0.5, vz: 0.5, wx: 0.5, wy: 0.5, wz: 0.5, q: new Float32Array(4), qt: new Float32Array(4), R: new Float32Array(9), fx: 0.5, fy: 0.5, fz: 0.5, restH: 0.5, st: 0, t: 0.5, restT: 0.5, n: 0, gy: 0.5, lr: 0.5, lg: 0.5, lb: 0.5, al: 0.5, seq: 0, r: 0.5 });
    this.shN = 0; this.shSeq = 0; this.shPeak = 0;
    this.pp = new Float32Array(PICK.pool * 6); this.pseq = new Int32Array(PICK.pool);   // previous and current positions of the pickups (drawn between ticks)
    this.Rm = new Float32Array(9); this.tint = new Float32Array(3); this.rs = { v: 0x9E3779B9 }; this.rnd = lcg(this.rs);
    this.lastClay = -1; this.fxT = 0; this.clinkT = 0; this.time = 0; this.stat = { draws: 0, tris: 0, whole: 0, shards: 0, pickups: 0 };
  }
  /** the rules' events this module answers (added to the scene's hook object before the Sim is made) */
  hook(H) {
    const me = this, ev = H.event;
    H.break = (b, by, dx, dz) => me._onBreak(b, by, dx, dz);
    H.pickup = (what, n, p) => me._onPickup(what, n, p);
    H.pickupLand = (p, v) => me._onLand(p, v);
    H.event = (name, a, b, c, d) => { if (name !== 'pickupLand' && ev) ev.call(H, name, a, b, c, d); };   // (a coin's bounce is not a story event)
    return H;
  }
  key(b) { return b.kind + '@' + Math.round(b.x) + ',' + Math.round(b.z); }
  /** the save: which are broken in the area the hero stands in, and back (the next area load keeps them only if it is that area) */
  brokenOut() { return [...this.broken]; }
  restore(areaId, list, coins) { this.broken.clear(); this.brokenArea = typeof areaId === 'string' ? areaId : ''; if (Array.isArray(list)) for (const k of list) if (typeof k === 'string' && this.broken.size < 400) this.broken.add(k); this.keepNext = true; this.coins = Number.isFinite(coins) && coins > 0 ? Math.min(999999, Math.floor(coins)) : 0; }
  /** new game */
  reset() { this.broken.clear(); this.brokenArea = ''; this.keepNext = false; this.coins = 0; }
  seed(n) { if (this.sc.sim) seedBreak(this.sc.sim, n); }
  /**
   * after the area's Sim exists and the hero stands at his place: what was broken in this visit stays broken (same = the area rebuilt in place
   * or the first load of a save made here); anything whole that overlaps the hero's body starts broken (he must never be shut in or thrown back
   * to the spawn by a jar that stands again); then the whole ones are baked into one buffer.
   */
  enter(area, same) {
    const sc = this.sc, sim = sc.sim, glr = sc.glr, L = sim.breakables ?? [];
    const keep = (same || this.keepNext) && this.brokenArea === area.id; this.keepNext = false;
    if (!keep) { this.broken.clear(); this.brokenArea = area.id; this.visits++; }
    { const m = /[?&]v2seed=(-?\d+)/.exec(globalThis.location?.search ?? ''); let hsh = 0; for (let i = 0; i < area.id.length; i++) hsh = (Math.imul(hsh, 31) + area.id.charCodeAt(i)) | 0; seedBreak(sim, m ? parseInt(m[1], 10) : (Date.now() ^ hsh ^ Math.imul(this.visits, 0x9E3779B1)) | 0); }
    const h = sim.hero, ids = [];
    for (let i = 0; i < L.length; i++) {
      const b = L[i], k = this.key(b), m = h.r + b.r + 3;
      if (this.broken.has(k)) ids.push(b.id);
      else if (Math.abs(h.x - b.x) < m && Math.abs(h.z - b.z) < m && Math.abs(h.y - b.y) < 90) { ids.push(b.id); this.broken.add(k); }
    }
    if (ids.length) breakSilent(sim, ids);
    this.L0 = sim.breakables;
    for (let i = 0; i < this.sh.length; i++) this.sh[i].on = false; this.shN = 0; this.pseq.fill(0);
    this._bake(area, L, glr);
    sc.state.coins = this.coins; h.coins = this.coins;
  }
  _bake(area, L, glr) {
    this.release();
    if (!this.tex) {   // the atlas: drawn once, lives as long as the scene (the renderer re-uploads it after a lost context)
      const c = document.createElement('canvas'); c.width = 512; c.height = 512; paintBreakAtlas(c.getContext('2d')); this.canvas = c; (this.sc._canvases ?? (this.sc._canvases = [])).push(c);
      this.tex = glr.texture(() => c, { repeat: false, mip: true });
    }
    let nv = 0; for (let i = 0; i < L.length; i++) nv += wholeModel(L[i].kind, L[i].id).n;
    this.ranges.length = 0; this.live = 0; this.wholeTris = 0;
    if (!nv) return;
    const ab = new ArrayBuffer(nv * BRK_VERT), f = new Float32Array(ab), u = new Uint8Array(ab); let v = 0;
    for (let i = 0; i < L.length; i++) {
      const b = L[i], m = wholeModel(b.kind, b.id), tone = this._tone(b);
      bakeWhole(m, area.W, b.x, b.y, b.z, b.mat === 'clay' ? 0 : b.rot, f, u, v, [tone, tone, tone]);
      this.ranges.push(v, m.n); v += m.n;
      if (b.broken) this._fold(f, i); else { this.live++; this.wholeTris += m.n / 3; }
    }
    this.wf = f; this.wu = u; this.whole = glr.mesh(ab, nv);
  }
  /** how dark this one is drawn: the kind's tone and a little of its own (no two jars of a group quite alike) */
  _tone(b) { return (KIND_TONE[b.kind] ?? 0.8) * (0.93 + 0.14 * (((Math.imul(b.id + 1, 2654435761)) >>> 0) / 4294967296)); }
  _fold(f, i) { const v0 = this.ranges[i * 2], n = this.ranges[i * 2 + 1]; for (let k = v0; k < v0 + n; k++) { f[k * 7] = 0; f[k * 7 + 1] = -9999; f[k * 7 + 2] = 0; } }
  /** the area's buffer goes when the area goes */
  release() {
    const glr = this.sc.glr, m = this.whole; this.whole = null; this.wf = null; this.wu = null;
    if (!m || !glr) return;
    if (m.buf) { try { glr.gl.deleteBuffer(m.buf); } catch { /* lost context */ } glr.stats.bufBytes -= m.data.byteLength; }
    const i = glr.meshList.indexOf(m); if (i >= 0) glr.meshList.splice(i, 1);
  }
  // ───────── events of the rules ─────────
  _onBreak(b, by, dx, dz) {
    const sc = this.sc, R = this.rnd, glr = sc.glr, clay = b.mat === 'clay', i = sc.sim.breakables.indexOf(b);
    this.broken.add(this.key(b));
    if (this.whole && this.wf && i >= 0 && this.ranges.length > i * 2) {   // the whole one leaves the picture in this very tick
      const v0 = this.ranges[i * 2], n = this.ranges[i * 2 + 1]; this._fold(this.wf, i); this.live--; this.wholeTris -= n / 3;
      if (this.whole.buf && glr && !glr.lost) { const gl = glr.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.whole.buf); gl.bufferSubData(gl.ARRAY_BUFFER, v0 * BRK_VERT, this.wu.subarray(v0 * BRK_VERT, (v0 + n) * BRK_VERT)); }
    }
    // pieces: each starts exactly where it sat in the whole thing and leaves along the hit, outward and up
    const P = pieceModels(b.kind, b.id), rot = clay ? 0 : b.rot, cs = Math.cos(rot), sn = Math.sin(rot), T = this.tint, tn = this._tone(b);
    const roll = by === 'roll', heavy = by === 'c3' || by === 'plunge' || by === 'whip' || by === 'sweep', push = roll ? 170 : heavy ? 250 : 190;
    for (let k = 0; k < P.length; k++) {
      const q = P[k], s = this._alloc(); s.m = q.m; s.r = q.r;
      s.x = s.px = b.x + q.ox * cs - q.oz * sn; s.y = s.py = b.y + q.oy; s.z = s.pz = b.z + q.ox * sn + q.oz * cs; s.gy = b.y; s.restH = q.restH;
      const ox = q.out[0] * cs - q.out[1] * sn, oz = q.out[0] * sn + q.out[1] * cs, along = ox * dx + oz * dz, f = (0.4 + 0.6 * R()) * (along < -0.3 ? 0.55 : 1);
      s.q[0] = 0; s.q[1] = -Math.sin(rot / 2); s.q[2] = 0; s.q[3] = Math.cos(rot / 2);   // (the kit's turn about y: x' = x cos - z sin)
      s.fx = q.flat[0]; s.fy = q.flat[1]; s.fz = q.flat[2]; s.al = 1; s.n = 0; s.t = 0;
      // lit as the whole thing was on that side (the kit's own light at the piece, facing the way it faced), so nothing jumps in colour at the break
      if (ox || oz) this._lightN(s.x, s.y, s.z, ox * 0.97, 0.25, oz * 0.97, T); else this._lightN(s.x, s.y, s.z, 0, 0.45, -0.89, T);
      s.lr = T[0] * tn; s.lg = T[1] * tn; s.lb = T[2] * tn;
      if (q.stay) { s.st = 1; s.vx = s.vy = s.vz = 0; s.wx = s.wy = s.wz = 0; s.restT = 2.4 + R() * 1.2; s.qt.set(s.q); }
      else {
        s.st = 0; s.restT = 1.0 + R() * 1.5;
        s.vx = ox * (30 + 100 * R()) + dx * push * f + (R() - 0.5) * 60; s.vz = oz * (30 + 100 * R()) + dz * push * f + (R() - 0.5) * 60;
        s.vy = 90 + 170 * R() + (q.oy / (b.h || 1)) * 100 + (heavy ? 50 : 0);
        const w = (q.hoop ? 3 : 6) + R() * (q.hoop ? 5 : 11), ax = R() - 0.5, ay = (R() - 0.5) * 0.6, az = R() - 0.5, l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        s.wx = ax / l * w; s.wy = ay / l * w; s.wz = az / l * w;
      }
      this._mat(s);
    }
    // sound, the tiny freeze, the light shake, the dust
    const name = clay ? this._clayName() : b.mat === 'barrel' ? 'break.barrel' : 'break.crate', pitch = (SIZE_P[b.kind] ?? 1) * (0.9 + 0.24 * R()), vol = 0.9 + 0.2 * R();
    let r = null; try { r = feel.play(name, b, vol, pitch); } catch { r = null; }
    const fx = sc.fx, F = fx ? fx.feel : null;
    if (F) { if (!roll) F.hitStop(r && r.stop > 0 ? r.stop : 0.03); fx.trauma(r && r.shake > 0 ? r.shake * (roll ? 0.7 : 1) : 0.06, dx, 0, dz); }
    if (PRESET_IDS['break.puff'] !== undefined) sc._fxp('break.puff', b.x, b.y, b.z, dx, dz, clay ? (b.kind === 'urn' ? 0.7 : 1) : b.mat === 'barrel' ? 3 : 2, true);
    else sc._fxp('move.land', b.x, b.y, b.z, dx, dz, 0.9, true);
    sc.feelN++;
  }
  /** the kit's baked prop light (b/world.js lightAt, lifted like env/geo.js) at a point with a normal, without making an array */
  _lightN(x, y, z, nx, ny, nz, out) {
    const W = this.sc.W, L = W.light, md = L.moonDir, nd = Math.max(0, nx * md[0] + ny * md[1] + nz * md[2]), PL = W.lights;
    let r = L.ambient[0] + L.moon[0] * nd, g = L.ambient[1] + L.moon[1] * nd, b = L.ambient[2] + L.moon[2] * nd;
    for (let i = 0; i < PL.length; i++) {
      const p = PL[i], dx = p.x - x, dy = p.y - y, dz = p.z - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 > p.r * p.r) continue;
      const d = Math.sqrt(d2) || 1, k0 = 1 - d / p.r, lam = Math.max(0.12, (nx * dx + ny * dy + nz * dz) / d), k = k0 * k0 * lam * p.i;
      r += p.c[0] * k; g += p.c[1] * k; b += p.c[2] * k;
    }
    out[0] = Math.min(1.6, 0.42 + 0.72 * r); out[1] = Math.min(1.6, 0.42 + 0.72 * g); out[2] = Math.min(1.6, 0.42 + 0.72 * b);
    return out;
  }
  _clayName() { const R = this.rnd; let i = (R() * CLAY_EV.length) | 0; if (i === this.lastClay) i = (i + 1 + ((R() * (CLAY_EV.length - 1)) | 0)) % CLAY_EV.length; this.lastClay = i; return feel.has(CLAY_EV[i]) ? CLAY_EV[i] : CLAY_EV[0]; }
  _onPickup(what, n, p) {
    const sc = this.sc, h = sc.sim.hero, pow = what === 'heal' ? 2 : what === 'reso' ? 3 : 1;
    if (what === 'coin') { this.coins += n; h.coins = this.coins; sc.state.coins = this.coins; }
    if (this.time - this.fxT > 0.09 || pow > 1) { this.fxT = this.time; sc._fxp('pickup', h.x, h.y, h.z, 1, 0, pow, false); }
    else { try { sc.bridge.onEvent('pickup.coin', h.x, h.y, h.z, 0.8); } catch { /* no audio */ } }   // coins in a row: one ring of light, every coin heard
  }
  _onLand(p, v) { if (p.what !== 0 || this.time - this.clinkT < 0.05) return; this.clinkT = this.time; try { feel.play('pickup.clink', p, Math.min(1, 0.45 + v / 500), 0.92 + 0.3 * this.rnd()); } catch { /* no audio */ } }
  _alloc() {
    const S = this.sh; let s = null, old = S[0];
    for (let i = 0; i < S.length; i++) { const q = S[i]; if (!q.on) { s = q; break; } if (q.seq < old.seq) old = q; }
    if (!s) s = old; else this.shN++;
    s.on = true; s.seq = ++this.shSeq; if (this.shN > this.shPeak) this.shPeak = this.shN;
    return s;
  }
  /** quaternion -> the piece's rotation matrix (row major) */
  _mat(s) {
    const q = s.q, x = q[0], y = q[1], z = q[2], w = q[3], R = s.R;
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y);
  }
  // ───────── tick ─────────
  /** pdt = play time of this tick (0 while the hit-stop holds the world: the burst freezes with it) */
  tick(pdt) {
    const sc = this.sc, sim = sc.sim; if (!sim) return;
    sc.state.coins = this.coins; sim.hero.coins = this.coins;
    if (sim.breakables !== this.L0) {   // the rules started the area over (the hero fell with no rest spot): the same visit, so what he broke stays broken
      this.L0 = sim.breakables; const L = sim.breakables, ids = []; for (let i = 0; i < L.length; i++) if (this.broken.has(this.key(L[i]))) ids.push(L[i].id); if (ids.length) breakSilent(sim, ids);
    }
    const P = sim.pickups, pp = this.pp, ps = this.pseq;
    if (P) for (let i = 0; i < P.length; i++) {
      const p = P[i], o = i * 6; if (!p.on) { ps[i] = 0; continue; }
      if (ps[i] !== p.seq) { ps[i] = p.seq; pp[o] = p.x; pp[o + 1] = p.y; pp[o + 2] = p.z; } else { pp[o] = pp[o + 3]; pp[o + 1] = pp[o + 4]; pp[o + 2] = pp[o + 5]; }
      pp[o + 3] = p.x; pp[o + 4] = p.y; pp[o + 5] = p.z;
    }
    if (!(pdt > 0)) return;
    this.time += pdt;
    if (!this.shN) return;
    const S = this.sh, B = sc.W.boxes; let live = 0;
    for (let i = 0; i < S.length; i++) {
      const s = S[i]; if (!s.on) continue;
      s.px = s.x; s.py = s.y; s.pz = s.z; s.t += pdt;
      if (s.st === 0) {
        s.vy -= G * pdt;
        let nx = s.x + s.vx * pdt, nz = s.z + s.vz * pdt, g = -1e9; const y = s.y;
        for (let j = 0; j < B.length; j++) {   // one pass over the boxes: the floor under it and a wall in its way
          const b = B[j]; if (nx < b.x0 || nx > b.x1 || nz < b.z0 || nz > b.z1) continue;
          if (b.walk) { if (b.y1 <= y + 14 && b.y1 > g) g = b.y1; if (!(b.solid && b.y1 > y + 14)) continue; }
          else if (!b.solid || y >= b.y1 || y + 4 <= b.y0) continue;
          if (s.x < b.x0 || s.x > b.x1) { s.vx = -s.vx * 0.35; nx = s.x; } else { s.vz = -s.vz * 0.35; nz = s.z; }   // it came in from the side: off the wall it goes
        }
        if (g < -1e8) g = s.gy;
        s.x = nx; s.z = nz; s.y += s.vy * pdt; s.gy = g;
        // spin
        const q = s.q, hx = s.wx * pdt * 0.5, hy = s.wy * pdt * 0.5, hz = s.wz * pdt * 0.5, qx = q[0], qy = q[1], qz = q[2], qw = q[3];
        q[0] = qx + hx * qw + hy * qz - hz * qy; q[1] = qy - hx * qz + hy * qw + hz * qx; q[2] = qz + hx * qy - hy * qx + hz * qw; q[3] = qw - hx * qx - hy * qy - hz * qz;
        const l = 1 / (Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1); q[0] *= l; q[1] *= l; q[2] *= l; q[3] *= l;
        this._mat(s);
        if (s.y <= g + s.restH && s.vy < 0) {
          s.y = g + s.restH;
          if (s.vy < -120 && s.n < 2) { s.vy = -s.vy * 0.34; s.vx *= 0.5; s.vz *= 0.5; s.wx *= 0.55; s.wy *= 0.55; s.wz *= 0.55; s.n++; }
          else {   // it comes to rest lying on its flat side: the turn that lays the flat axis along the ground's normal, taken over a few ticks
            s.st = 1; s.t = 0; s.vx = s.vy = s.vz = 0;
            const R = s.R, ax = R[0] * s.fx + R[1] * s.fy + R[2] * s.fz, ay = R[3] * s.fx + R[4] * s.fy + R[5] * s.fz, az = R[6] * s.fx + R[7] * s.fy + R[8] * s.fz, sg = ay < 0 ? -1 : 1;
            // rotation from (ax, ay, az) to (0, sg, 0): axis = a x t = (-az * sg, 0, ax * sg), cos = ay * sg
            const c = Math.min(1, ay * sg), kx = -az * sg, kz = ax * sg, kl = Math.sqrt(kx * kx + kz * kz), t = s.qt;
            if (kl < 1e-4) t.set(q);
            else { const half = Math.acos(c) / 2, sh = Math.sin(half) / kl, bx = kx * sh, bz = kz * sh, bw = Math.cos(half);   // t = b * q
              t[0] = bw * q[0] + bx * q[3] - bz * q[1]; t[1] = bw * q[1] + bz * q[0] - bx * q[2]; t[2] = bw * q[2] + bz * q[3] + bx * q[1]; t[3] = bw * q[3] - bx * q[0] - bz * q[2]; }
          }
        }
      } else {
        if (s.t < 0.16) { const q = s.q, t = s.qt, k = Math.min(1, pdt / Math.max(0.016, 0.16 - s.t + pdt)), d = q[0] * t[0] + q[1] * t[1] + q[2] * t[2] + q[3] * t[3] < 0 ? -1 : 1;
          q[0] += (t[0] * d - q[0]) * k; q[1] += (t[1] * d - q[1]) * k; q[2] += (t[2] * d - q[2]) * k; q[3] += (t[3] * d - q[3]) * k;
          const l = 1 / (Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]) || 1); q[0] *= l; q[1] *= l; q[2] *= l; q[3] *= l; this._mat(s); }
        s.al = s.t <= s.restT ? 1 : 1 - (s.t - s.restT) / FADE;
        if (s.al <= 0) { s.on = false; continue; }
      }
      live++;
    }
    this.shN = live;
  }
  // ───────── picture ─────────
  /** contact shadows into the scene's ground batch: the whole things, and what lies on the ground waiting to be picked up */
  shadows(b, a) {
    const sc = this.sc, sim = sc.sim, L = sim.breakables, bl = sc.spr.blob, tx = sc.cam.tx, tz = sc.cam.tz;
    if (L) for (let i = 0; i < L.length; i++) {
      const q = L[i]; if (q.broken || Math.abs(q.x - tx) > 1500 || q.z - tz < -700 || q.z - tz > 2600) continue;
      const r = q.r * 1.7;
      b.quad(sc._flat(q.x, q.y + 0.9, q.z + 2, r, r * 0.62), bl.u0, bl.v0, bl.u1, bl.v1, 0, 0, 0, 0.62, 1, 0, 4, 1);
      b.quad(sc._flat(q.x, q.y + 1.0, q.z, q.r * 1.12, q.r * 0.74), bl.u0, bl.v0, bl.u1, bl.v1, 0, 0, 0, 0.7, 1, 0, 4, 1);   // the dark seam where it stands
    }
    const P = sim.pickups, pp = this.pp;
    if (P && sim.pickN) for (let i = 0; i < P.length; i++) {
      const p = P[i]; if (!p.on) continue;
      const o = i * 6, x = pp[o] + (pp[o + 3] - pp[o]) * a, z = pp[o + 2] + (pp[o + 5] - pp[o + 2]) * a, hgt = Math.max(0, p.y - p.gy), k = 1 / (1 + hgt / 60);
      b.quad(sc._flat(x, p.gy + 0.9, z, 9 * k + 3, (9 * k + 3) * 0.62), bl.u0, bl.v0, bl.u1, bl.v1, 0, 0, 0, 0.55 * k, 1, 0, 4, 1);
    }
  }
  /** additive light into the scene's glow batch: the glint of a coin's face, the glow of a heal piece and of a mote */
  glows(b, a) {
    const sc = this.sc, sim = sc.sim, P = sim.pickups; if (!P || !sim.pickN) return;
    const g = sc.spr.glow, Rv = sc.camR, U = sc.camU, Q = sc.P12, pp = this.pp, t = this.time;
    for (let i = 0; i < P.length; i++) {
      const p = P[i]; if (!p.on || !this._shown(p)) continue;
      const o = i * 6, x = pp[o] + (pp[o + 3] - pp[o]) * a, y = pp[o + 1] + (pp[o + 4] - pp[o + 1]) * a + this._lift(p, t), z = pp[o + 2] + (pp[o + 5] - pp[o + 2]) * a;
      let rr, cr, cg, cb, al;
      if (p.what === 0) { const f = Math.abs(Math.cos(t * 7.5 + p.seq * 1.7)), k = f > 0.93 ? (f - 0.93) / 0.07 : 0; if (k <= 0) continue; rr = 7 + 15 * k; cr = 1.5; cg = 1.6; cb = 1.9; al = 0.85 * k; }
      else if (p.what === 1) { rr = 15 + 2 * Math.sin(t * 5 + p.seq); cr = 1.7; cg = 0.25; cb = 0.22; al = 0.42; }
      else { rr = 19 + 3 * Math.sin(t * 6 + p.seq); cr = 0.45; cg = 0.95; cb = 1.9; al = 0.55; }
      for (let j = 0; j < 4; j++) { const su = j === 0 || j === 3 ? -rr : rr, sv = j < 2 ? -rr : rr; Q[j * 3] = x + Rv[0] * su + U[0] * sv; Q[j * 3 + 1] = y + Rv[1] * su + U[1] * sv; Q[j * 3 + 2] = z + Rv[2] * su + U[2] * sv; }
      b.quad(Q, g.u0, g.v0, g.u1, g.v1, cr, cg, cb, al, 0, 0, 12, 0.5);
    }
  }
  /** blinking out in its last seconds (faster and faster) */
  _shown(p) { const left = PICK.life - p.t; if (left > PICK.blink) return true; const f = 5 + 9 * (1 - left / PICK.blink); return ((p.t * f) % 1) < 0.62; }
  _lift(p, t) { return p.what === 0 ? 7.6 + (p.rest ? 1.2 + 1.2 * Math.sin(t * 3.2 + p.seq) : 0) : p.what === 1 ? 9 + (p.rest ? 2 + 1.6 * Math.sin(t * 2.6 + p.seq) : 0) : 12 + 3 * Math.sin(t * 2.2 + p.seq * 0.7); }
  /** called right after the static world meshes, with the world program bound: the whole things, then pieces and pickups */
  draw(glr, a) {
    const gl = glr.gl, st = this.stat; st.draws = 0; st.tris = 0; st.whole = this.live; st.shards = this.shN; st.pickups = this.sc.sim?.pickN ?? 0;
    if (!this.tex || !this.tex.tex || glr.lost) return;
    const dynN = this._fill(a);
    if (!(this.live > 0 && this.whole && this.whole.buf) && !dynN) return;
    gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.depthMask(true); gl.bindTexture(gl.TEXTURE_2D, this.tex.tex);
    if (this.live > 0 && this.whole && this.whole.buf) { gl.bindBuffer(gl.ARRAY_BUFFER, this.whole.buf); glr._attribs(); gl.drawArrays(gl.TRIANGLES, 0, this.whole.count); st.draws++; st.tris += this.wholeTris; }
    if (dynN) {
      if (!this.dbuf || this.dgen !== glr.restored) { this.dbuf = gl.createBuffer(); this.dgen = glr.restored; gl.bindBuffer(gl.ARRAY_BUFFER, this.dbuf); gl.bufferData(gl.ARRAY_BUFFER, this.dab.byteLength, gl.DYNAMIC_DRAW); } else gl.bindBuffer(gl.ARRAY_BUFFER, this.dbuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.du.subarray(0, dynN * BRK_VERT)); glr._attribs();
      const solid = dynN - this.dfade;
      if (solid) { gl.drawArrays(gl.TRIANGLES, 0, solid); st.draws++; }
      if (this.dfade) { gl.enable(gl.BLEND); gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, solid, this.dfade); gl.depthMask(true); gl.disable(gl.BLEND); st.draws++; }
      st.tris += dynN / 3;
    }
    glr.stats.draws += st.draws; glr.stats.tris += st.tris;
  }
  /** pieces and pickups into the dynamic buffer: solid pieces, then pickups, then the fading pieces (drawn blended) -> vertices */
  _fill(a) {
    const sc = this.sc, sim = sc.sim; let v = 0; this.dfade = 0;
    if (this.shN) v = this._pieces(false, v, a);
    const P = sim ? sim.pickups : null;
    if (P && sim.pickN) {
      const M = pickupModels(), pp = this.pp, R = this.Rm, t = this.time, T = this.tint, f = this.df, u = this.du;
      for (let i = 0; i < P.length; i++) {
        const p = P[i]; if (!p.on || !this._shown(p)) continue;
        const m = M[p.what]; if (v + m.n > DYN_VERTS) break;
        const o = i * 6, x = pp[o] + (pp[o + 3] - pp[o]) * a, y = pp[o + 1] + (pp[o + 4] - pp[o + 1]) * a + this._lift(p, t), z = pp[o + 2] + (pp[o + 5] - pp[o + 2]) * a;
        const ang = p.what === 0 ? t * 7.5 + p.seq * 1.7 : p.what === 1 ? t * 2.4 + p.seq : t * 3.6 + p.seq, c = Math.cos(ang), s = Math.sin(ang);
        if (p.what === 2) { const ct = 0.956, st = 0.292; R[0] = c * ct; R[1] = -c * st; R[2] = s; R[3] = st; R[4] = ct; R[5] = 0; R[6] = -s * ct; R[7] = s * st; R[8] = c; }   // a mote stands upright, leaning 17 degrees, and turns about the vertical (it tumbled on two axes and read as a flat square)
        else { R[0] = c; R[1] = 0; R[2] = s; R[3] = 0; R[4] = 1; R[5] = 0; R[6] = -s; R[7] = 0; R[8] = c; }
        sc._tintAt(sc.W, x, y, z, 0, 1.6, T);
        const k = p.what === 0 ? 0.95 : 1.0, sz = (p.pull ? 0.86 : 1) * (p.what === 2 ? 1 + 0.12 * Math.sin(t * 6 + p.seq) : 1) * Math.min(1, 0.4 + p.t * 5);
        v += writeDyn(m, f, u, v, R, sz, x, y, z, T[0] * k, T[1] * k, T[2] * k, 1, p.what === 0 ? 0.06 : 0.35);
      }
    }
    if (this.shN) { const v0 = v; v = this._pieces(true, v, a); this.dfade = v - v0; }
    this.dn = v;
    return v;
  }
  _pieces(fading, v, a) {
    const S = this.sh, f = this.df, u = this.du;
    for (let i = 0; i < S.length; i++) {
      const s = S[i]; if (!s.on || (s.al < 1) !== fading || v + s.m.n > DYN_VERTS) continue;
      v += writeDyn(s.m, f, u, v, s.R, 1, s.px + (s.x - s.px) * a, s.py + (s.y - s.py) * a, s.pz + (s.z - s.pz) * a, s.lr, s.lg, s.lb, s.al, 0);
    }
    return v;
  }
}
export { BREAK_KINDS };
