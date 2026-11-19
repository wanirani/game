// v2 whip - the lash: a chain of nodes with length constraints, gravity, damping, ground and body avoidance,
// held to an authored curve while a move plays (so every attack reads the same) and left to the physics afterwards.
// docs/v2/WHIP.md. World: x right, y up, z into the screen, px (1 m = 58). Nothing is allocated after createWhip().
import { MOVES } from '../play/moves.js';
import { shapeOf } from './shapes.js';

export const TRAIL_N = 10;
export const WHIP_TIERS = { low: { n: 12, sub: 2, sides: 6 }, mid: { n: 16, sub: 3, sides: 8 }, high: { n: 20, sub: 4, sides: 10 } };
const GRAV = -1400, MAXV = 3400, NS = 25, HANDLE_FWD = 11, BOW = 0.945, SLACK = 0.78;   // gravity px/s2, speed cap px/s, curve samples, grip -> lash root along the handle
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Whip {
  constructor(opts = {}) {
    const T = WHIP_TIERS[opts.tier] ?? WHIP_TIERS.mid;
    this.tier = WHIP_TIERS[opts.tier] ? opts.tier : 'mid';
    this.n = opts.nodes ?? T.n; this.sub = T.sub; this.sides = T.sides;
    const n = this.n;
    this.L0 = opts.length ?? 96; this.len = this.L0; this.lenWant = this.L0;
    this.onEvent = opts.onEvent ?? null; this.teleport = opts.teleport ?? 220; this.groundY = opts.ground ?? 0;
    this.nodes = new Float32Array(n * 3);      // current positions (tick)
    this.prev = new Float32Array(n * 3);       // previous tick (for display interpolation)
    this.vel = new Float32Array(n * 3);
    this.tgt = new Float32Array(n * 3);        // authored curve for this tick
    this.wn = new Float32Array(n);             // per node hold weight
    this._s = new Float32Array(n * 3);         // positions before the step
    this._bz = new Float32Array(NS * 3); this._bl = new Float32Array(NS);
    this._k = new Float32Array(8);             // one evaluated key: f r y w bf br by
    this._w = new Float32Array(9);             // scratch: world tip xyz, slack xyz, peak xyz
    this.tip = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, speed: 0 };
    this.hist = new Float32Array(TRAIL_N * 4);   // tip path of the last ticks, newest first: x y z strength (the streak behind the tip - mesh.js draws it)
    this.trailLive = 0; this.trailW = 1;
    this.root = { x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0 };   // where the lash leaves the handle + handle direction
    this.grip = { x: 0, y: 0, z: 0 };
    this.pg = new Float32Array(6);            // grip + handle direction of the previous tick (display interpolation)
    this.glowCol = new Float32Array([1.0, 0.84, 0.48]);
    this.ev = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, strength: 'M', move: '', kind: '' };
    this.mode = 'rest'; this.style = 'coil'; this.restT = 9;
    this.sw = { id: '', shape: null, hitCrack: false, hasHit: false, hx: 0, hy: 0, hz: 0, hs: 0, t: 0, hit0: 0.13, hit1: 0.25, dur: 0.44, s: -1, ps: -1, landT: -1, hasT: false, tx: 0, ty: 0, tz: 0, str: 'M', started: false };
    this.tg = { x: 0, y: 0, z: 0, r: 14, phase: 'throw', t: 0, throwT: 0.13, caught: false, since: 0, sx: 0, sy: 0, sz: 0, kind: 'hook', pull: false };
    this.fx = 1; this.fz = 0; this.bx = 0; this.by = 0; this.bz = 0; this.br = 12; this.bh = 104; this.hasBody = false;
    this.time = 0; this.flash = 0; this.kick = 0; this.taut = 0; this.ext = 0; this.trail = 0; this.spin = 0; this.resonance = 0; this.glow = 0; this.pulse = 0; this.dragT = 0;
    this.spinA = 0; this.spinLv = 0; this._pin = 0;
    this.ready = false; this._lx = 0; this._ly = 0; this._lz = 0;
  }

  /** fill hand {x,y,z,dx,dy,dz} from a weapon world matrix (origin = grip, +Y = out of the handle) */
  handFromMatrix(W, hand) {
    const l = Math.hypot(W[4], W[5], W[6]) || 1;
    hand.x = W[12]; hand.y = W[13]; hand.z = W[14]; hand.dx = W[4] / l; hand.dy = W[5] / l; hand.dz = W[6] / l;
    return hand;
  }

  _emit(name, x, y, z, dx, dy, dz, kind) {
    if (!this.onEvent) return;
    const e = this.ev; e.x = x; e.y = y; e.z = z; e.dx = dx; e.dy = dy; e.dz = dz; e.kind = kind; e.move = this.sw.id; e.strength = this.sw.str;
    this.onEvent(name, e);
  }

  /** mode: rest | stow | swing | crack | wrap | hook | ring. See docs/v2/WHIP.md section 2 */
  set(mode, p) {
    if (mode === 'crack') {
      this.flash = 1; this.kick = 1; this.sw.hitCrack = true;   // a hit voices the crack: the same swing does not crack in the air as well
      if (this.mode === 'swing' && p && p.x != null) { const sw = this.sw; sw.hasHit = true; sw.hx = p.x; sw.hy = p.y; sw.hz = p.z; sw.hs = sw.s; this.kick = 0; }   // and the lash lands ON what it hit (see _aimSwing)
      const n = this.n, V = this.vel, k = 260 * (p && p.strength != null ? +p.strength || 1 : 1), r = this.root, t = this.tip;
      let dx = r.x - t.x, dy = r.y - t.y, dz = r.z - t.z; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      for (let i = (n * 0.6) | 0; i < n; i++) { const o = i * 3, q = i / (n - 1); V[o] += dx * k * q; V[o + 1] += (dy * k + 160) * q; V[o + 2] += dz * k * q; }
      this._emit('crack', p && p.x != null ? p.x : t.x, p && p.y != null ? p.y : t.y, p && p.z != null ? p.z : t.z, -dx, -dy, -dz, 'hit');
      return;
    }
    if (mode === 'spin') {   // charging: the lash circles over the head, faster as the charge fills (p.level 0..1)
      if (this.mode === 'wrap' || this.mode === 'hook') this._leaveLine();
      if (this.mode !== 'spin') { this.mode = 'spin'; this.spinA = Math.atan2(this.tip.z - this.bz, this.tip.x - this.bx); }
      this.spinLv = p && p.level != null ? clamp(p.level, 0, 1) : 0.5;
      return;
    }
    if (mode === 'ring') { this._swing('ring_' + ((p && p.kind) || 'short'), p); return; }
    if (mode === 'swing') { this._swing(p.move, p); return; }
    if (mode === 'wrap' || mode === 'hook') {
      const g = this.tg, fresh = this.mode !== mode || (p.phase === 'throw' && (g.phase !== 'throw' || (p.t != null && p.t < g.t - 1e-4)));
      if (fresh) {
        g.caught = p.phase !== 'throw' && p.phase != null; g.since = 0; g.t = 0; g.sx = this.tip.x; g.sy = this.tip.y; g.sz = this.tip.z; g.pull = false; this.mode = mode; g.kind = mode;
        if (g.caught) { this.flash = 0.8; this._emit(mode + '.catch', p.x, p.y, p.z, 0, 0, 0, ''); } else this._emit(mode + '.throw', this.tip.x, this.tip.y, this.tip.z, 0, 0, 0, '');
      }
      g.x = p.x; g.y = p.y; g.z = p.z; if (p.r != null) g.r = p.r; if (p.throwT != null) g.throwT = p.throwT;
      if (p.t != null) g.t = p.t; g.ext = p.t != null;
      if (p.phase === 'pull' && !g.pull) { g.pull = true; g.since = 0; this._emit('wrap.pull', g.x, g.y, g.z, 0, 0, 0, ''); }
      if (p.phase === 'release') { this._emit(mode + '.release', g.x, g.y, g.z, 0, 0, 0, ''); this._leaveLine(); this.mode = 'rest'; this.style = 'hang'; this.restT = 0; }
      g.phase = p.phase || 'throw';
      return;
    }
    // rest / stow
    if (this.mode === 'wrap' || this.mode === 'hook') this._leaveLine();
    if (this.mode !== 'rest') this.restT = 0;
    this.mode = 'rest'; this.style = mode === 'stow' ? 'stow' : (p && p.style) || 'coil';
  }

  _swing(id, p) {
    const sw = this.sw, t = (p && p.t) || 0;
    if (this.mode !== 'swing' || id !== sw.id || t < sw.t - 1e-4) {
      if (this.mode === 'wrap' || this.mode === 'hook') this._leaveLine();
      const sh = shapeOf(id), mv = MOVES[id], nm = sh.nominal;
      sw.id = id; sw.shape = sh; sw.ps = -1.001; sw.started = false; sw.hitCrack = false; sw.hasHit = false; this.mode = 'swing';
      const hit = (p && p.hit) || (mv && mv.hit) || (nm && nm.hit);
      sw.hit0 = hit ? hit[0] : 0.13; sw.hit1 = hit ? hit[1] : 0.25;
      sw.dur = (p && p.dur) || (mv && mv.dur) || (nm && nm.dur) || 0.44;
      sw.str = (mv && (mv.strength || mv.str)) || 'M';   // the feel strength of the move (moves.js feel), the rules' str when it has none
    }
    sw.t = t; sw.landT = p && p.landT != null ? p.landT : -1;
    sw.hasT = !!(p && p.x != null); if (sw.hasT) { sw.tx = p.x; sw.ty = p.y; sw.tz = p.z; }
    if (p && p.dirX != null) { this.fx = p.dirX; this.fz = p.dirZ; this._faceSet = true; }
  }

  /** phase s of the running move: -1..0 wind-up, 0..1 hit window, 1..2 recovery */
  _phase() {
    const sw = this.sw, t = sw.t, sh = sw.shape;
    if (t < sw.hit0) return -1 + t / Math.max(1e-3, sw.hit0);
    if (sh.hold != null && sw.hit1 > 5) {   // window open until landing (plunge)
      const a = Math.min(sh.hold, ((t - sw.hit0) / 0.1) * sh.hold);
      if (sw.landT < 0) return a;
      const b = sh.hold + ((t - sw.landT) / 0.1) * (1 - sh.hold);
      return b <= 1 ? Math.max(a, b) : Math.min(2, 1 + (t - sw.landT - 0.1) / 0.3);
    }
    if (t < sw.hit1) return (t - sw.hit0) / Math.max(1e-3, sw.hit1 - sw.hit0);
    return Math.min(2, 1 + (t - sw.hit1) / Math.max(0.05, sw.dur - sw.hit1));
  }

  /** evaluate the key track at phase s -> this._k (f r y w bf br by). Positions: non-uniform Catmull-Rom, rest linear */
  _key(keys, s) {
    const m = keys.length / 8, K = this._k;
    let i = 0; while (i < m - 2 && keys[(i + 1) * 8] <= s) i++;
    const a = i * 8, b = a + 8, s0 = keys[a], s1 = keys[b], h = s1 - s0, u = clamp((s - s0) / h, 0, 1);
    const p = i > 0 ? a - 8 : a, q = i < m - 2 ? b + 8 : b, hp = keys[b] - keys[p], hq = keys[q] - keys[a];
    const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    for (let c = 1; c <= 3; c++) {
      const m0 = (keys[b + c] - keys[p + c]) / hp, m1 = (keys[q + c] - keys[a + c]) / hq;
      K[c - 1] = h00 * keys[a + c] + h10 * h * m0 + h01 * keys[b + c] + h11 * h * m1;
    }
    for (let c = 4; c < 8; c++) K[c - 1] = keys[a + c] + (keys[b + c] - keys[a + c]) * u;
    return K;
  }

  /** hero frame (or aim frame) point -> world, into this._w at offset o */
  _toWorld(sh, f, r, y, o) {
    const W = this._w, sw = this.sw;
    if (sh.frame === 'aim') {
      const cx = this.bx, cy = this.by + 70, cz = this.bz;
      let tx, ty, tz;
      if (sw.hasT) { tx = sw.tx; ty = sw.ty; tz = sw.tz; } else { const d = (sh.nominal && sh.nominal.reach ? sh.nominal.reach : 300) * 0.8; tx = cx + this.fx * d; ty = cy; tz = cz + this.fz * d; }
      const dx = tx - cx, dz = tz - cz, hl = Math.hypot(dx, dz) || 1, rx = dz / hl, rz = -dx / hl;
      W[o] = cx + dx * f + rx * r; W[o + 1] = cy + (ty - cy) * f + y; W[o + 2] = cz + dz * f + rz * r;
    } else if (sh.frame === 'hand') {   // offsets from the lash root, hero axes (poses that must follow whatever the arm does)
      const R = this.root; W[o] = R.x + this.fx * f + this.fz * r; W[o + 1] = R.y + y; W[o + 2] = R.z + this.fz * f - this.fx * r;
    } else {
      W[o] = this.bx + this.fx * f + this.fz * r; W[o + 1] = this.by + y; W[o + 2] = this.bz + this.fz * f - this.fx * r;
    }
  }

  /**
   * Lay the authored curve: from the lash root to the tip target, exactly len long.
   * Short of len -> the slack bulges toward (sx,sy,sz) and leaves the handle along its direction. Beyond len -> a straight lash that stops short.
   */
  _curve(tx, ty, tz, sx, sy, sz, wave = 0) {
    const n = this.n, T = this.tgt, r = this.root, len = this.len;
    const cx = tx - r.x, cy = ty - r.y, cz = tz - r.z, c = Math.hypot(cx, cy, cz);
    if (c >= len * 0.992 || c < 1e-3) {
      const k = c < 1e-3 ? 0 : Math.min(len, c) / c;
      for (let i = 0; i < n; i++) { const u = (i / (n - 1)) * k, o = i * 3; T[o] = r.x + cx * u; T[o + 1] = r.y + cy * u; T[o + 2] = r.z + cz * u; }
      return;
    }
    const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
    // where the lash leaves the root: along the handle; in a strike (wave > 0) along the chord, so the little slack that is left all
    // goes to the outer part: straight from the hand, then hooking over onto the target - a lash caught mid-crack, not a rod
    let hx = r.dx, hy = r.dy, hz = r.dz;
    if (wave > 0) {
      hx = hx * (1 - wave) + (cx / c) * wave; hy = hy * (1 - wave) + (cy / c) * wave; hz = hz * (1 - wave) + (cz / c) * wave;
      const hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
    }
    const B = this._bz, L = this._bl, A = 0.55 - 0.3 * wave;
    let lo = 0, hi = len * 3, k = 0, tot = 0;
    for (let it = 0; it < 11; it++) {
      k = it < 10 ? (lo + hi) * 0.5 : k;
      const ax = r.x + hx * A * k, ay = r.y + hy * A * k, az = r.z + hz * A * k, bx = tx + sx * k, by = ty + sy * k, bz = tz + sz * k;
      const m = it < 10 ? 13 : NS;
      let px = r.x, py = r.y, pz = r.z; tot = 0;
      if (it === 10) { B[0] = px; B[1] = py; B[2] = pz; L[0] = 0; }
      for (let j = 1; j < m; j++) {
        const u = j / (m - 1), v = 1 - u, b0 = v * v * v, b1 = 3 * v * v * u, b2 = 3 * v * u * u, b3 = u * u * u;
        const x = b0 * r.x + b1 * ax + b2 * bx + b3 * tx, y = b0 * r.y + b1 * ay + b2 * by + b3 * ty, z = b0 * r.z + b1 * az + b2 * bz + b3 * tz;
        tot += Math.hypot(x - px, y - py, z - pz); px = x; py = y; pz = z;
        if (it === 10) { B[j * 3] = x; B[j * 3 + 1] = y; B[j * 3 + 2] = z; L[j] = tot; }
      }
      if (it < 10) { if (tot < len) lo = k; else hi = k; }
    }
    let j = 1;
    for (let i = 0; i < n; i++) {
      const want = (i / (n - 1)) * tot, o = i * 3;
      while (j < NS - 1 && L[j] < want) j++;
      const l0 = L[j - 1], u = L[j] > l0 ? (want - l0) / (L[j] - l0) : 0, a = (j - 1) * 3, b = j * 3;
      T[o] = B[a] + (B[b] - B[a]) * u; T[o + 1] = B[a + 1] + (B[b + 1] - B[a + 1]) * u; T[o + 2] = B[a + 2] + (B[b + 2] - B[a + 2]) * u;
    }
  }

  // -- per mode targets (fills tgt + wn, sets lenWant) --
  _aimSwing() {
    const sw = this.sw, sh = sw.shape, W = this._w, r = this.root, n = this.n, wn = this.wn;
    const s = this._phase(); sw.s = s;
    const P = this._key(sh.keys, sh.peak); this._toWorld(sh, P[0], P[1], P[2], 6);
    const pk = Math.hypot(W[6] - r.x, W[7] - r.y, W[8] - r.z);
    const K = this._key(sh.keys, s); this._toWorld(sh, K[0], K[1], K[2], 0);
    const w = K[3], lim = sh.len, lo = (lim ? lim[0] : 0.7) * this.L0, hi = (lim ? lim[1] : 1.5) * this.L0;
    let chord = Math.hypot(W[0] - r.x, W[1] - r.y, W[2] - r.z);
    // lash length for this move: what the peak needs. Long throws (far, hold-attack) pay the lash out as the tip flies
    // (BOW: even fully extended the lash keeps a slight bow, laid toward the key's slack direction - a dead straight lash reads as a stick)
    const pkL = pk / BOW, long = pkL > this.L0 * 1.5, near = long ? this.L0 * 1.1 : pkL;
    // away from the strike the tip never goes farther than SLACK of the lash from the hand: there is always a loop of slack to
    // curve (a lash drawn out straight in a wind-up reads as a pole)
    const em0 = clamp((w - 0.75) / 0.17, 0, 1);
    if (!long || em0 <= 0) { const maxc = near * SLACK; if (chord > maxc) { const k0 = maxc / chord; W[0] = r.x + (W[0] - r.x) * k0; W[1] = r.y + (W[1] - r.y) * k0; W[2] = r.z + (W[2] - r.z) * k0; chord = maxc; } }
    this.lenWant = clamp(long ? Math.max(near, (chord / BOW) * (1 + 0.08 * (1 - w))) : pkL, lo, hi);
    // held hard (w >= 0.9) = the strike: the lash is laid out straight, full length, along the direction of the key
    const em = clamp((w - 0.75) / 0.17, 0, 1), e = em * em * (3 - 2 * em);
    if (e > 0 && chord > 1e-3) {
      if (e > 0.5) this.len = this.lenWant;
      const k = 1 + ((this.lenWant * BOW) / chord - 1) * e;
      W[0] = r.x + (W[0] - r.x) * k; W[1] = r.y + (W[1] - r.y) * k; W[2] = r.z + (W[2] - r.z) * k; chord *= k;
    }
    // the rules reported a hit: for a moment the tip stays on the hit point (nearer or a little farther than the authored end) and the lash
    // is taken in to fit, then it lets go into the follow-through. Without this the lash would sweep on through the enemy
    if (sw.hasHit) {
      const q = clamp(1 - (s - sw.hs - 0.3) / 0.3, 0, 1);
      if (q <= 0) sw.hasHit = false;
      else {
        // (the lash pays out a little past the move's own limit to land on what it hit: a plunge hits from high above - without this the
        // freeze frame showed the tip some 50 px off the hit point and it snapped on later, when the fall had brought the hand near enough)
        const dh = Math.hypot(sw.hx - r.x, sw.hy - r.y, sw.hz - r.z), hiH = Math.max(hi, this.L0 * 2.1);
        if (dh > 8 && dh < hiH * BOW * 1.02) {
          W[0] += (sw.hx - W[0]) * q; W[1] += (sw.hy - W[1]) * q; W[2] += (sw.hz - W[2]) * q;
          chord = Math.hypot(W[0] - r.x, W[1] - r.y, W[2] - r.z);
          if (q > 0.5) { this.lenWant = clamp(chord / BOW, lo * 0.6, hiH); this.len = this.lenWant; this._pin = q; }
        }
      }
    }
    // slack direction: hero frame -> world
    const bf = K[4], br = K[5], by = K[6];
    this._curve(W[0], W[1], W[2], this.fx * bf + this.fz * br, by + 1.1 * e, this.fz * bf - this.fx * br, e);   // in the strike the hook rises (a bow in the ground plane is invisible from the game camera)
    const kick = this.kick;
    const pin = this._pin; this._pin = 0;
    for (let i = 0; i < n; i++) { const q = i / (n - 1); wn[i] = pin > 0.5 ? 1 : w * (1 - kick * q * q * 0.85); }
    // events
    if (!sw.started && s >= -0.5) { sw.started = true; this._emit('swing', r.x, r.y, r.z, this.fx, 0, this.fz, ''); }
    // the bell rings exactly at the peak; the crack in the air comes a moment after full extension (0.2 of the window, one or two ticks)
    // so that a hit the rules report in between voices the crack instead
    const pe = sh.ev === 'ring' ? sh.peak : sh.peak + 0.2;
    if (sw.ps < pe && s >= pe) {
      const t = this.tip, sp = t.speed || 1;
      if (sh.ev === 'ring') { this.pulse = 1; this._emit('ring', W[0], W[1], W[2], 0, 1, 0, sh.kind); } else if (!sw.hitCrack) { this.flash = Math.max(this.flash, 0.7); this._emit('crack', t.x, t.y, t.z, t.vx / sp, t.vy / sp, t.vz / sp, 'air'); }
    }
    sw.ps = s;
    this.trail = sh.trail !== false && s > -0.35 && s < 1.25 ? 1 : 0;
  }

  _aimRest(h) {
    const n = this.n, T = this.tgt, wn = this.wn, r = this.root, st = this.style;
    this.lenWant = this.L0; this.trail = 0;
    this.restT += h;
    if (st === 'hang') { for (let i = 0; i < n; i++) wn[i] = 0; return; }
    // coil: loops hanging from the hand in a vertical plane a little outward of the facing
    const stow = st === 'stow', rc = stow ? 7.5 : 9.5, seg = this.len / (n - 1);
    const ramp = clamp((this.restT - 0.3) / 0.45, 0, 1), wBase = (stow ? 0.5 : 0.3) * ramp * ramp;
    const ax = this.fx * 0.94 + this.fz * 0.34, az = this.fz * 0.94 - this.fx * 0.34, sx = this.fz, sz = -this.fx;   // loop plane axis, side
    for (let i = 0; i < n; i++) {
      const a = (i * seg) / rc, o = i * 3, side = (i / (n - 1) - 0.4) * 5;
      T[o] = r.x + ax * rc * Math.sin(a) + sx * side; T[o + 1] = r.y - rc + rc * Math.cos(a) - 1.5; T[o + 2] = r.z + az * rc * Math.sin(a) + sz * side;
      wn[i] = wBase;
    }
  }

  _aimSpin(h) {
    const n = this.n, wn = this.wn, lv = this.spinLv, r = this.root, R = 56 + 12 * lv;
    this.spinA -= (8.5 + 9 * lv) * h;
    const c = Math.cos(this.spinA), s = Math.sin(this.spinA);
    this.lenWant = this.L0;
    // the tip rides a circle over the hand; the slack trails the rotation, so the lash is a curved arc (a lasso), never a spoke
    this._curve(r.x + c * R, r.y + 30 + 5 * Math.sin(this.spinA * 0.5), r.z + s * R, -s * 1.0 - c * 0.25, 0.1, c * 1.0 - s * 0.25);
    for (let i = 0; i < n; i++) wn[i] = 0.8;
    this.trail = lv > 0.45 ? 1 : 0;
  }

  _aimLine(h) {
    const g = this.tg, n = this.n, T = this.tgt, wn = this.wn, r = this.root, hook = g.kind === 'hook';
    if (!g.ext) g.t += h;
    this.trail = 0;
    if (!g.caught) {
      const u = clamp(g.t / g.throwT, 0, 1), e = 1 - (1 - u) * (1 - u), d0 = Math.hypot(g.x - g.sx, g.y - g.sy, g.z - g.sz);
      const tx = g.sx + (g.x - g.sx) * e, ty = g.sy + (g.y - g.sy) * e + Math.sin(u * Math.PI) * d0 * 0.07, tz = g.sz + (g.z - g.sz) * e;
      const chord = Math.hypot(tx - r.x, ty - r.y, tz - r.z);
      this.lenWant = Math.max(this.L0 * 0.7, chord * 1.03); this.len = Math.max(this.len, chord * 1.01);
      this._curve(tx, ty, tz, -this.fx * 0.5, -1, -this.fz * 0.5);
      for (let i = 0; i < n; i++) wn[i] = 0.92;
      this.trail = 1;
      if (u >= 1) { g.caught = true; g.since = 0; this.flash = 0.8; this._emit(g.kind + '.catch', g.x, g.y, g.z, (g.x - r.x) / (chord || 1), (g.y - r.y) / (chord || 1), (g.z - r.z) / (chord || 1), ''); }
      return;
    }
    g.since += h;
    // taut line root -> target (+ winding for wrap). Nodes are placed directly (weight 1): no stretch, no sag
    let dx = g.x - r.x, dy = g.y - r.y, dz = g.z - r.z; const dH = Math.hypot(dx, dz) || 1, d = Math.hypot(dx, dy, dz) || 1;
    const amp = 6 * Math.exp(-g.since * 7) + 0.5, ph = this.time * 46;
    // a direction across the line for the shiver
    let px = -dz / dH, pz = dx / dH, py = 0.6; const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
    const nw = hook ? 0 : Math.max(5, Math.round(n * 0.45)), nl = n - nw;
    let ex = g.x, ey = g.y, ez = g.z, a0 = 0, R = g.r;
    if (!hook) {   // tangent point on the target circle
      const aH = Math.atan2(r.z - g.z, r.x - g.x); a0 = aH + Math.acos(Math.min(1, R / dH));
      ex = g.x + Math.cos(a0) * R; ez = g.z + Math.sin(a0) * R; dx = ex - r.x; dy = ey - r.y; dz = ez - r.z;
    }
    const lineLen = Math.hypot(dx, dy, dz), turns = 1.6;
    for (let i = 0; i < nl; i++) {
      const u = i / Math.max(1, nl - (hook ? 1 : 0)), o = i * 3, wv = Math.sin(u * Math.PI) * amp * Math.sin(ph + u * 9);
      T[o] = r.x + dx * u + px * wv; T[o + 1] = r.y + dy * u + py * wv; T[o + 2] = r.z + dz * u + pz * wv; wn[i] = 1;
    }
    for (let i = 0; i < nw; i++) {
      const u = (i + 1) / nw, a = a0 + u * turns * 6.2832, o = (nl + i) * 3;
      T[o] = g.x + Math.cos(a) * R; T[o + 1] = ey - u * 5; T[o + 2] = g.z + Math.sin(a) * R; wn[nl + i] = 1;
    }
    this.len = this.lenWant = lineLen + (hook ? 0 : turns * 6.2832 * R);
    this._lineLen = lineLen; this._d = d;
  }

  /** leaving a taut line: spread the nodes evenly along the current polyline so the chain constraints hold again */
  _leaveLine() {
    const n = this.n, P = this.nodes, S = this._s, V = this.vel;
    let tot = 0; S[0] = 0;
    const L = this.wn; L[0] = 0;
    for (let i = 1; i < n; i++) { const o = i * 3; tot += Math.hypot(P[o] - P[o - 3], P[o + 1] - P[o - 2], P[o + 2] - P[o - 1]); L[i] = tot; }
    const T = this.tgt; let j = 1;
    for (let i = 0; i < n; i++) {
      const want = (i / (n - 1)) * tot, o = i * 3;
      while (j < n - 1 && L[j] < want) j++;
      const l0 = L[j - 1], u = L[j] > l0 ? (want - l0) / (L[j] - l0) : 0, a = (j - 1) * 3, b = j * 3;
      T[o] = P[a] + (P[b] - P[a]) * u; T[o + 1] = P[a + 1] + (P[b + 1] - P[a + 1]) * u; T[o + 2] = P[a + 2] + (P[b + 2] - P[a + 2]) * u;
    }
    P.set(T); this.prev.set(T); V.fill(0); this.len = Math.max(this.L0 * 0.7, tot); this.taut = 0;
  }

  /** move everything (area change, respawn): no velocity is created */
  warp(dx, dy, dz) {
    const P = this.nodes, Q = this.prev, n = this.n;
    for (let i = 0; i < n; i++) { const o = i * 3; P[o] += dx; P[o + 1] += dy; P[o + 2] += dz; Q[o] += dx; Q[o + 1] += dy; Q[o + 2] += dz; }
    this.tg.sx += dx; this.tg.sy += dy; this.tg.sz += dz;
    const H = this.hist; for (let i = 0; i < TRAIL_N * 4; i += 4) { H[i] += dx; H[i + 1] += dy; H[i + 2] += dz; }
  }

  /** drop the lash straight under the hand, at rest */
  reset(hand) {
    const n = this.n, P = this.nodes, seg = this.L0 / (n - 1);
    this._hand(hand);
    const r = this.root, gy = this._gy + 1.2;
    for (let i = 0; i < n; i++) { const o = i * 3; P[o] = r.x + this.fx * i * 0.4; P[o + 1] = Math.max(gy, r.y - i * seg); P[o + 2] = r.z + this.fz * i * 0.4; }
    this.prev.set(P); this.vel.fill(0); this.len = this.L0; this.mode = 'rest'; this.restT = 9; this.ready = true;
    this._lx = hand.x; this._ly = hand.y; this._lz = hand.z; this.flash = 0; this.kick = 0; this.taut = 0; this.trail = 0;
    this._tipState(); this._keepGrip();
    const H = this.hist; for (let i = 0; i < TRAIL_N * 4; i += 4) { H[i] = this.tip.x; H[i + 1] = this.tip.y; H[i + 2] = this.tip.z; H[i + 3] = 0; }
    this.trailLive = 0;
  }

  _hand(hand) {
    const r = this.root, g = this.grip;
    let dx = hand.dx ?? 0, dy = hand.dy ?? -1, dz = hand.dz ?? 0; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    g.x = hand.x; g.y = hand.y; g.z = hand.z; r.dx = dx; r.dy = dy; r.dz = dz;
    r.x = hand.x + dx * HANDLE_FWD; r.y = hand.y + dy * HANDLE_FWD; r.z = hand.z + dz * HANDLE_FWD;
    if (hand.fx != null && !this._faceSet) { this.fx = hand.fx; this.fz = hand.fz; }
    this._faceSet = false;
    this.hasBody = hand.bx != null;
    if (this.hasBody) { this.bx = hand.bx; this.by = hand.by; this.bz = hand.bz; if (hand.br != null) this.br = hand.br; if (hand.bh != null) this.bh = hand.bh; }
    else { this.bx = hand.x - this.fx * 20; this.by = this.groundY; this.bz = hand.z - this.fz * 20; }
    this._gy = hand.ground ?? (this.hasBody ? Math.min(this.by, this.groundY) : this.groundY);
  }

  _keepGrip() { const g = this.grip, r = this.root, p = this.pg; p[0] = g.x; p[1] = g.y; p[2] = g.z; p[3] = r.dx; p[4] = r.dy; p[5] = r.dz; }

  _tipState() {
    const n = this.n, P = this.nodes, V = this.vel, t = this.tip, o = (n - 1) * 3, r = this.root;
    t.x = P[o]; t.y = P[o + 1]; t.z = P[o + 2]; t.vx = V[o]; t.vy = V[o + 1]; t.vz = V[o + 2]; t.speed = Math.hypot(t.vx, t.vy, t.vz);
    this.ext = Math.hypot(t.x - r.x, t.y - r.y, t.z - r.z) / Math.max(1, this.len);
  }

  /** one tick. dt = 0 freezes the lash with the world (hit-stop); small dt (slow motion) and large dt are both fine */
  update(dt, hand) {
    if (!this.ready) { this.reset(hand); if (!(dt > 0)) return; }
    if (!(dt > 0)) { this.prev.set(this.nodes); this._keepGrip(); return; }
    const jx = hand.x - this._lx, jy = hand.y - this._ly, jz = hand.z - this._lz;
    if (jx * jx + jy * jy + jz * jz > this.teleport * this.teleport) this.warp(jx, jy, jz);
    this._lx = hand.x; this._ly = hand.y; this._lz = hand.z;
    this.prev.set(this.nodes); this._keepGrip();
    this._hand(hand);
    const steps = Math.min(4, Math.max(1, Math.ceil(dt * 60 - 0.01))), h = dt / steps;
    const ox = this.tip.x, oy = this.tip.y, oz = this.tip.z;
    for (let k = 0; k < steps; k++) this._step(h);
    this._tipState();
    {   // the streak: where the tip was, and how hard it was moving (frozen with the world: no tick, no shift)
      const H = this.hist, t = this.tip, sp = Math.hypot(t.x - ox, t.y - oy, t.z - oz) / dt;
      H.copyWithin(4, 0, (TRAIL_N - 1) * 4);
      H[0] = t.x; H[1] = t.y; H[2] = t.z; H[3] = this.trail > 0 ? clamp((sp - 260) / 1100, 0, 1) : 0;
      let m = 0; for (let i = 3; i < TRAIL_N * 4; i += 4) if (H[i] > m) m = H[i];
      this.trailLive = m; this.trailW = this.mode === 'swing' && (this.sw.str === 'F' || this.sw.str === 'H') ? 1.5 : 1;
    }
    // slow values
    const d60 = dt * 60;
    this.flash *= Math.pow(0.78, d60); if (this.flash < 0.004) this.flash = 0;
    this.kick *= Math.pow(0.8, d60); if (this.kick < 0.004) this.kick = 0;
    this.pulse *= Math.pow(0.955, d60); if (this.pulse < 0.004) this.pulse = 0;
    this.glow = clamp(0.16 + 0.84 * this.resonance + this.pulse * 0.9, 0, 2);
    this.spin += dt * (2 + this.tip.speed * 0.012);
    const line = (this.mode === 'hook' || this.mode === 'wrap') && this.tg.caught;
    this.taut += ((line ? 1 : 0) - this.taut) * (1 - Math.pow(0.6, d60));
    if (this.dragT > 0) this.dragT -= dt;
    else if (this.tip.y <= this._gy + 2 && Math.hypot(this.tip.vx, this.tip.vz) > 220) { this.dragT = 0.12; this._emit('drag', this.tip.x, this.tip.y, this.tip.z, 0, 1, 0, ''); }
  }

  _step(h) {
    const n = this.n, P = this.nodes, V = this.vel, T = this.tgt, wn = this.wn, S = this._s, r = this.root;
    this.time += h;
    const wasCaught = this.tg.caught;   // the tick the throw arrives is still a throw: it keeps its constraints (length, ground, body) and the taut line starts on the next
    if (this.mode === 'swing') this._aimSwing(); else if (this.mode === 'rest') this._aimRest(h); else if (this.mode === 'spin') this._aimSpin(h); else this._aimLine(h);
    // pays out at once; reels in smoothly at rest, tightly while a move drives the lash (so it is straight at the peak)
    if (this.lenWant > this.len) this.len = this.lenWant; else this.len += (this.lenWant - this.len) * (1 - Math.exp(-h * (this.mode === 'swing' && this.sw.s > -0.45 && this.sw.s < 1.05 ? 150 : 30)));
    const seg = this.len / (n - 1), h60 = h * 60, resting = this.mode === 'rest';
    const damp = Math.pow(resting ? 0.95 : 0.985, h60), gy = this._gy + 1.2;
    S.set(P);
    P[0] = r.x; P[1] = r.y; P[2] = r.z;
    for (let i = 1; i < n; i++) {
      const o = i * 3, w = wn[i] >= 1 ? 1 : 1 - Math.pow(1 - wn[i], h60);
      V[o + 1] += GRAV * h;
      let x = P[o] + V[o] * damp * h, y = P[o + 1] + V[o + 1] * damp * h, z = P[o + 2] + V[o + 2] * damp * h;
      x += (T[o] - x) * w; y += (T[o + 1] - y) * w; z += (T[o + 2] - z) * w;
      P[o] = x; P[o + 1] = y; P[o + 2] = z;
    }
    const line = (this.mode === 'hook' || this.mode === 'wrap') && this.tg.caught && wasCaught;
    if (!line) {
      const bx = this.bx, bz = this.bz, br = this.br, y0 = this.by + 2, y1 = this.by + this.bh * 0.95, body = this.hasBody;
      for (let it = 0; it < 5; it++) {
        for (let i = 1; i < n; i++) {   // length: root is pinned, the rest share the correction
          const a = (i - 1) * 3, b = i * 3;
          let dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2]; const d = Math.hypot(dx, dy, dz) || 1e-6, c = (d - seg) / d;
          if (i === 1) { P[b] -= dx * c; P[b + 1] -= dy * c; P[b + 2] -= dz * c; }
          else { const k = c * 0.5; P[a] += dx * k; P[a + 1] += dy * k; P[a + 2] += dz * k; P[b] -= dx * k; P[b + 1] -= dy * k; P[b + 2] -= dz * k; }
        }
        for (let i = 0; i < n - 2; i++) {   // no sharp kinks: stiff by the handle, soft at the tip
          const a = i * 3, b = (i + 2) * 3, q = i / (n - 3), min = 2 * seg * (0.86 - 0.42 * q);
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
          if (d < min) { const c = ((min - d) / d) * 0.5, ka = i === 0 ? 0 : 0.5, kb = i === 0 ? 1 : 0.5; P[a] -= dx * c * ka; P[a + 1] -= dy * c * ka; P[a + 2] -= dz * c * ka; P[b] += dx * c * kb; P[b + 1] += dy * c * kb; P[b + 2] += dz * c * kb; }
        }
        for (let i = 1; i < n; i++) {   // ground, body
          const o = i * 3;
          if (P[o + 1] < gy) P[o + 1] = gy;
          if (body && i > 2 && P[o + 1] > y0 && P[o + 1] < y1) {
            const dx = P[o] - bx, dz = P[o + 2] - bz, d2 = dx * dx + dz * dz;
            if (d2 < br * br) { if (d2 > 1e-4) { const d = Math.sqrt(d2), k = br / d; P[o] = bx + dx * k; P[o + 2] = bz + dz * k; } else { P[o] = bx + this.fz * br; P[o + 2] = bz - this.fx * br; } }
          }
        }
      }
      for (let pass = 0; pass < 3; pass++) for (let i = 1; i < n; i++) {   // last word: the lash never stretches (follow the leader from the hand)
        const a = (i - 1) * 3, b = i * 3, dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2], d = Math.hypot(dx, dy, dz), m = seg * 1.02;
        if (d > m) { const k = m / d; P[b] = P[a] + dx * k; P[b + 1] = P[a + 1] + dy * k; P[b + 2] = P[a + 2] + dz * k; }
        if (P[b + 1] < gy) P[b + 1] = gy;
        if (body && i > 2 && P[b + 1] > y0 && P[b + 1] < y1) {   // and never ends inside the hero
          const ex = P[b] - bx, ez = P[b + 2] - bz, d2 = ex * ex + ez * ez;
          if (d2 < br * br && d2 > 1e-4) { const k = br / Math.sqrt(d2); P[b] = bx + ex * k; P[b + 2] = bz + ez * k; }
        }
      }
    }
    const ih = 1 / h;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      let vx = (P[o] - S[o]) * ih, vy = (P[o + 1] - S[o + 1]) * ih, vz = (P[o + 2] - S[o + 2]) * ih;
      const sp = Math.hypot(vx, vy, vz);
      if (sp > MAXV) { const k = MAXV / sp; vx *= k; vy *= k; vz *= k; }
      if (P[o + 1] <= gy + 0.01) { vx *= 0.82; vz *= 0.82; }
      V[o] = vx; V[o + 1] = vy; V[o + 2] = vz;
    }
  }

  /** node positions for display, between the previous tick and this one. out: Float32Array(n * 3) */
  sample(alpha, out) {
    const P = this.nodes, Q = this.prev, m = this.n * 3, a = alpha == null ? 1 : alpha;
    for (let i = 0; i < m; i++) out[i] = Q[i] + (P[i] - Q[i]) * a;
    return out;
  }
}

export function createWhip(opts) { return new Whip(opts); }
