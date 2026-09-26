// 5장 보스: 본 드래곤 — 카타콤을 휘감은 해골룡
// 바닥/벽의 구멍에서 뼈 목(역운동학 체인)을 뻗어 공격한다. 머리가 주 판정.
// 패턴: 물어뜯기(돌진) / 영혼불 브레스(바닥을 훑음) / 뼈의 비 / 잠행 분출(발밑에서 솟구침) / 벽 관통 돌격 / 뼈 파편 뱉기
// 페이즈: 1 = 영혼불 격화(분출 2연속) · 2 = 쌍두(반대편 바닥에서 두 번째 머리가 솟아 독자적으로 공격)
import { ABoss, beginDraw, endDraw, C, rg, lg, glow, ink, rim, sheen, taper, eye, shadow, hash, opt, flames, PI, OUT, RIM, groundWave, erupt, dropHazard } from './a_common.js';
import { rand, clamp, lerp, TAU, angleTo, rgba, ease, approach } from '../../core/math.js';
import { audio } from '../../core/audio.js';
import { paintedDebris } from '../../render/painted/registry.js';

const BONE = '#e6dac0', BONE2 = '#a8987a', BONED = '#4a3e30', SOUL = '#6aff8a', SOUL2 = '#b8ffc8';
const _Q = new Float32Array(16);

/** 뼈 목 + 머리 하나 */
class Wyrm {
  constructor(b, x, y, o = {}) {
    this.b = b; this.N = o.N ?? 17; this.L = o.L ?? 34; this.scale = o.scale ?? 1; this.soul = o.soul ?? SOUL;
    this.pts = []; for (let i = 0; i <= this.N; i++) this.pts.push({ x, y });
    this.hole = { x, y, nx: 0, ny: -1 };
    this.ext = 0; this.extT = this.N * this.L; this.extSp = 900;
    this.hx = x; this.hy = y; this.tx = x; this.ty = y - 200; this.follow = 5;
    this.a = -PI / 2; this.aT = -PI / 2; this.jaw = 0; this.flare = 0; this.wing = 0.5; this.k = 0;
    this.hidden = true; this.st = 'idle'; this.stT = 0; this.cool = 2.5; this.autoExt = true;
  }
  get maxLen() { return this.N * this.L; }
  setHole(x, y, nx, ny) { const h = this.hole; h.x = x; h.y = y; h.nx = nx; h.ny = ny; }
  update(dt) {
    // 필요한 만큼만 목을 내민다 (남는 길이가 고리처럼 부풀지 않게)
    if (this.autoExt) { const h = this.hole; this.extT = clamp(Math.hypot(this.tx - h.x, this.ty - h.y) * 1.22 + 50, 140, this.maxLen); }
    this.ext = approach(this.ext, this.extT, this.extSp * dt);
    this.hx += (this.tx - this.hx) * Math.min(1, dt * this.follow);
    this.hy += (this.ty - this.hy) * Math.min(1, dt * this.follow);
    this.solve();
    let d = this.aT - this.a; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.a += d * Math.min(1, dt * 8);
    const h = this.hole;
    this.hidden = this.ext < 30 || (h.ny < 0 ? this.hy > h.y + 10 : h.nx < 0 ? this.hx > h.x + 10 : this.hx < h.x - 10);
  }
  solve() {
    const L = this.L, ext = Math.max(2, this.ext), P = this.pts, h = this.hole;
    const k = Math.max(1, Math.min(this.N, Math.ceil(ext / L)));
    const lastL = ext - (k - 1) * L;
    if (k > this.k) for (let i = this.k + 1; i <= k; i++) { P[i].x = h.x - h.nx * 2; P[i].y = h.y - h.ny * 2; }
    this.k = k;
    let dx = this.hx - h.x, dy = this.hy - h.y, d = Math.hypot(dx, dy) || 1;
    if (d > ext) { this.hx = h.x + dx / d * ext; this.hy = h.y + dy / d * ext; }
    for (let it = 0; it < 2; it++) {
      P[0].x = this.hx; P[0].y = this.hy;
      for (let i = 1; i <= k; i++) {
        const len = i === k ? lastL : L;
        const ax = P[i].x - P[i - 1].x, ay = P[i].y - P[i - 1].y, dd = Math.hypot(ax, ay) || 1;
        P[i].x = P[i - 1].x + ax / dd * len; P[i].y = P[i - 1].y + ay / dd * len;
      }
      P[k].x = h.x; P[k].y = h.y;
      for (let i = k - 1; i >= 0; i--) {
        const len = i === k - 1 ? lastL : L;
        let ax = P[i].x - P[i + 1].x, ay = P[i].y - P[i + 1].y, dd = Math.hypot(ax, ay) || 1;
        ax /= dd; ay /= dd;
        if (i >= k - 2) { const w = i === k - 1 ? 0.8 : 0.4; ax = lerp(ax, h.nx, w); ay = lerp(ay, h.ny, w); const n = Math.hypot(ax, ay) || 1; ax /= n; ay /= n; }
        P[i].x = P[i + 1].x + ax * len; P[i].y = P[i + 1].y + ay * len;
      }
    }
    this.hx = P[0].x; this.hy = P[0].y;
  }
  box() { const s = this.scale; return { x: this.hx - 44 * s, y: this.hy - 36 * s, w: 88 * s, h: 72 * s }; }
  mouth() { const s = this.scale, c = Math.cos(this.a), sn = Math.sin(this.a); return { x: this.hx + c * 58 * s - sn * 6 * s, y: this.hy + sn * 58 * s + c * 6 * s }; }
}

export class BoneDragon extends ABoss {
  setup() {
    const A = this.A;
    this.noGravity = true;
    this.main = new Wyrm(this, this.cx, this.floorY, { soul: SOUL });
    this.main.setHole(clamp(this.cx, A.x0 + 200, A.x1 - 160), this.floorY, 0, -1);
    this.main.ext = this.main.maxLen * 0.8; this.main.tx = this.main.hole.x - 120; this.main.ty = this.floorY - 230;
    this.main.hx = this.main.hole.x; this.main.hy = this.floorY - 300;
    for (let i = 0; i < 30; i++) this.main.update(1 / 60);
    this.twin = null;
    this.heads = [this.main];
    this.fury = 0;
    this.syncRect();
  }
  syncRect() { const b = this.main.box(); this.x = b.x; this.y = b.y; this.w = b.w; this.h = b.h; this.vx = 0; this.vy = 0; }
  hurtboxes() {
    const out = [this.main.box()];
    if (this.twin && !this.twin.hidden) out.push(this.twin.box());
    return out;
  }
  /** 플레이어 공격은 가장 가까운 머리에 맞는다 */
  hurtbox() {
    const p = this.player;
    if (this.twin && !this.twin.hidden && p) {
      const a = this.main.box(), b = this.twin.box();
      const da = Math.abs(a.x + a.w / 2 - p.cx) + Math.abs(a.y + a.h / 2 - p.cy), db = Math.abs(b.x + b.w / 2 - p.cx) + Math.abs(b.y + b.h / 2 - p.cy);
      if (db < da) return b;
    }
    return this.main.box();
  }
  onIntro() { audio.sfx('boss_roar', { pitch: 0.55 }); this.main.jaw = 1; this.main.flare = 1; }
  moves() {
    const ph = this.phase, p = this.player, m = this.main;
    const reach = p ? Math.hypot(p.cx - m.hole.x, p.cy - m.hole.y) < m.maxLen * 0.9 : true;
    return [
      ['bite', reach ? 3 : 0.5], ['breath', 2.4], ['boneRain', 1.8], ['burrow', reach ? 2 : 3.5], ['wall', 1.8], ['spit', 2],
    ];
  }
  idleMove(dt, world, p) {
    const m = this.main, A = this.A;
    m.follow = 3; m.autoExt = true; m.extSp = 900;
    const side = Math.sign(p.cx - m.hole.x) || -1;
    m.tx = clamp(lerp(m.hole.x, p.cx, 0.45) + Math.sin(this.t * 0.9) * 40, A.x0 + 60, A.x1 - 60);
    m.ty = A.floor - 230 + Math.sin(this.t * 1.3) * 30;
    m.aT = angleTo(m.hx, m.hy, p.cx, p.cy - 20);
    m.jaw = lerp(m.jaw, 0.08 + Math.sin(this.t * 2) * 0.05, Math.min(1, dt * 4));
    m.flare = lerp(m.flare, 0, Math.min(1, dt * 3));
    this.facing = side;
  }
  think(dt, world) {
    super.think(dt, world);
    const p = this.player;
    this.fury = lerp(this.fury, this.phase / 2, Math.min(1, dt * 2));
    for (const h of this.heads) { h.update(dt); h.wing = lerp(h.wing, h.flare > 0.5 ? 1 : 0.55, Math.min(1, dt * 3)); }
    if (this.twin && p && this.state !== 'transform') this.twinAI(dt, world, p);
    this.syncRect();
    this.invuln = this.state === 'transform' || this.main.hidden;
    this.harmless = this.main.hidden;
    // 영혼불 불씨
    if (Math.random() < dt * (6 + this.phase * 6)) { const m = this.main; if (!m.hidden) this.fx.emit('soul', m.hx + rand(-20, 20), m.hy + rand(-20, 10), { speed: 40, color: m.soul }); }
  }
  // 모든 공격 공통: 머리 조준 + 입 크기
  aim(h, p, dt, k = 8) { h.aT = angleTo(h.hx, h.hy, p.cx, p.cy - 10); }

  // ── 물어뜯기 ──
  s_bite(dt, world, p) {
    const m = this.main, A = this.A, W = 0.6, n = this.phase >= 1 || this.inferno ? 2 : 1, per = 1.25;
    const i = Math.floor(this.stateT / per), u = this.stateT - i * per;
    if (i >= n) { m.follow = 3; if (this.stateT > n * per + 0.1) this.rest(0.8); return; }
    if (u < W) {
      if (this.at(i * per)) {
        this.tgx = p.cx; this.tgy = clamp(p.cy - 6, A.floor - 200, A.floor - 40);
        audio.sfx('boss_roar', { pitch: 1.4, vol: 0.5 });
      }
      // 뒤로 젖힘
      const bx = lerp(m.hole.x, this.tgx, 0.25), by = A.floor - 270;
      m.follow = 6; m.tx = bx; m.ty = by; m.aT = angleTo(m.hx, m.hy, this.tgx, this.tgy);
      m.jaw = lerp(m.jaw, 0.9, Math.min(1, dt * 6)); m.flare = 1;
      if (this.at(i * per + 0.12)) this.warnLine(m.hx, m.hy, this.tgx, this.tgy, W - 0.12, { width: 70, color: '#8aff9a', follow: (tg) => { tg.x0 = m.hx; tg.y0 = m.hy; } });
      return;
    }
    if (this.at(i * per + W)) { audio.sfx('dash', { pitch: 0.6 }); }
    if (u < W + 0.28) {
      const dx = this.tgx - m.hole.x, dy = this.tgy - m.hole.y, d = Math.hypot(dx, dy) || 1, r = Math.min(d + 40, m.maxLen - 5);
      m.follow = 20; m.tx = m.hole.x + dx / d * r; m.ty = m.hole.y + dy / d * r;
      m.jaw = u < W + 0.18 ? 0.9 : 0;
      if (this.at(i * per + W + 0.18)) { audio.sfx('clang', { pitch: 0.5 }); this.shake(6, 0.2); world.fx.burst('shard', m.hx, m.hy, 8, { color: BONE, speed: 200 }); }
      this.strikeRect(m.box(), 1.3, { kb: [440, -420] });
      return;
    }
    m.follow = 4; m.jaw = lerp(m.jaw, 0.1, dt * 6);
  }

  // ── 영혼불 브레스: 높이 치켜든 머리에서 바닥을 훑는 녹색 불길 ──
  s_breath(dt, world, p) {
    const m = this.main, A = this.A, W = 0.9, D = 1.35;
    if (this.at(0)) {
      this.bdir = Math.sign(p.cx - m.hole.x) || -1;
      this.bx0 = m.hole.x + this.bdir * 60; this.bx1 = clamp(m.hole.x + this.bdir * 820, A.x0 + 10, A.x1 - 10);
      if (Math.random() < 0.5) { const t = this.bx0; this.bx0 = this.bx1; this.bx1 = t; }
      audio.sfx('boss_roar', { pitch: 0.8, vol: 0.8 });
      this.warn({ type: 'band', x0: Math.min(this.bx0, this.bx1), x1: Math.max(this.bx0, this.bx1), y0: A.floor - 90, y1: A.floor, life: W + 0.1, color: '#8aff9a', dir: Math.sign(this.bx1 - this.bx0) });
      this.warnMark(m.hx, m.hy - 70, W);
    }
    m.follow = 4; m.tx = m.hole.x + (Math.sign(this.bx0 + this.bx1 - 2 * m.hole.x) || -1) * 90; m.ty = A.floor - 300;
    if (this.stateT < W) {
      m.aT = angleTo(m.hx, m.hy, this.bx0, A.floor); m.jaw = lerp(m.jaw, 0.8, Math.min(1, dt * 4)); m.flare = 1;
      const mo = m.mouth();
      if (Math.random() < 0.8) world.fx.emit('soul', mo.x + rand(-6, 6), mo.y + rand(-6, 6), { speed: 40, color: m.soul });
      glowPulse(world, mo);
      return;
    }
    if (this.stateT < W + D) {
      const u = (this.stateT - W) / D, gx = lerp(this.bx0, this.bx1, ease.inOutQuad(u));
      const mo = m.mouth();
      m.aT = angleTo(mo.x, mo.y, gx, A.floor); m.jaw = 1;
      if (this.every(W, 0.035, 60) >= 0) {
        const a = angleTo(mo.x, mo.y, gx + rand(-20, 20), A.floor) + rand(-0.04, 0.04), sp = 780;
        this.shoot({ x: mo.x, y: mo.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 30, h: 30, render: drawSoulFlame, scale: 1.4, color: m.soul, life: 1.4, collideWalls: true, pierce: 99, attack: { mv: 0.55, element: 'dark', type: 'mag', rehit: 0.5 },
          onWall: (pr, w) => { pr.dead = true; if (Math.random() < 0.35) erupt(this, pr.cx, { delay: 0, life: 0.9, w: 44, h: 64, color: SOUL, style: 'soul', burst: 'soul', mv: 0.5, element: 'dark', sfx: null, shake: 0, nfx: 3 }); } });
      }
      if (this.every(W, 0.25, 8) >= 0) audio.sfx('fire', { pitch: 0.6, vol: 0.6 });
      this.shake(2, 0.05);
      return;
    }
    m.jaw = lerp(m.jaw, 0.1, dt * 4);
    if (this.stateT > W + D + 0.6) this.rest(1.0);
  }

  // ── 뼈의 비 ──
  s_boneRain(dt, world, p) {
    const m = this.main, A = this.A, T0 = 0.7, n = 12 + this.phase * 3;
    m.follow = 3; m.tx = m.hole.x; m.ty = A.floor - 320; m.aT = -PI / 2 + Math.sin(this.stateT * 10) * 0.1; m.jaw = 1; m.flare = 1;
    if (this.at(0)) { audio.sfx('boss_roar', { pitch: 0.5 }); this.warnMark(m.hx, m.hy - 80, T0); }
    if (this.at(T0 - 0.2)) { this.shake(8, 1.4); world.fx.ring(m.hx, m.hy, { color: SOUL, r0: 20, r1: 260, life: 0.5, width: 6 }); }
    const k = this.every(T0, 0.14, n);
    if (k >= 0) {
      const x = k % 4 === 0 ? clamp(p.cx + rand(-20, 20), A.x0 + 20, A.x1 - 20) : rand(A.x0 + 20, A.x1 - 20);
      dropHazard(this, x, { delay: 0.75, render: k % 5 === 0 ? drawSkullFall : 'bone', w: 22, h: 26, speed: 420, gravity: 0.7, spin: rand(-10, 10), mv: 0.75, warnColor: '#8aff9a', warnW: 40, top: A.floor - 520,
        onLand: (pr, w) => { w.fx.burst('shard', pr.cx, A.floor - 6, 6, { color: BONE, speed: 200, angle: -PI / 2, spread: 1.2 }); } });
    }
    if (this.stateT > T0 + n * 0.14 + 0.9) { m.jaw = 0.1; this.rest(0.9); }
  }

  // ── 잠행 분출: 구멍으로 들어갔다가 플레이어 발밑에서 솟구친다 ──
  s_burrow(dt, world, p) {
    const m = this.main, A = this.A, n = this.phase >= 1 || this.inferno ? 2 : 1, per = 1.9;
    const i = Math.floor(this.stateT / per), u = this.stateT - i * per;
    if (i >= n) { m.autoExt = true; m.extSp = 700; if (this.stateT > n * per + 0.2) this.rest(0.9); return; }
    m.autoExt = false;
    if (u < 0.5) {
      // 파고듦
      if (this.at(i * per)) { audio.sfx('break_wall', { pitch: 0.6 }); }
      m.follow = 10; m.tx = m.hole.x; m.ty = m.hole.y + 60; m.aT = PI / 2; m.extT = 0; m.extSp = 1500;
      if (Math.random() < 0.6) world.fx.emit('dust', m.hole.x + rand(-40, 40), A.floor - 4, { speed: 80, angle: -PI / 2 });
      return;
    }
    if (this.at(i * per + 0.5)) {
      this.hx0 = clamp(p.cx, A.x0 + 60, A.x1 - 60);
      m.setHole(this.hx0, A.floor, 0, -1); m.ext = 0; m.extT = 0; m.hx = this.hx0; m.hy = A.floor + 40; m.tx = m.hx; m.ty = m.hy; m.k = 0;
      this.warn({ type: 'column', cx0: this.hx0, cw: 120, y0: A.floor - 380, y1: A.floor, life: 0.8, color: '#8aff9a', follow: (tg) => { if (this.stateT < i * per + 0.9) { this.hx0 = clamp(p.cx, A.x0 + 60, A.x1 - 60); m.setHole(this.hx0, A.floor, 0, -1); m.hx = m.tx = this.hx0; tg.cx0 = this.hx0; } } });
    }
    if (u < 1.3) { if (Math.random() < 0.7) world.fx.emit('dust', this.hx0 + rand(-50, 50), A.floor - 4, { speed: 120, angle: -PI / 2 }); if (Math.random() < 0.3) world.fx.emit('soul', this.hx0 + rand(-40, 40), A.floor - 4, { speed: 80, angle: -PI / 2, color: SOUL }); return; }
    if (this.at(i * per + 1.3)) {
      m.extSp = 2600; m.extT = 330; m.follow = 30; m.tx = m.hole.x; m.ty = A.floor - 320; m.aT = -PI / 2; m.jaw = 1; m.flare = 1;
      this.impact(m.hole.x, A.floor, 12, 0.05, '#b8ffc8');
      audio.sfx('explode', { pitch: 0.6 }); audio.sfx('boss_roar', { pitch: 1.2, vol: 0.7 });
      world.fx.burst('shard', m.hole.x, A.floor - 6, 16, { color: '#6a5a4a', speed: 420, angle: -PI / 2, spread: 0.9 });
      if (this.phase >= 1) for (const s of [-1, 1]) groundWave(this, m.hole.x + s * 40, s, { speed: 460, color: SOUL, color2: '#e8ffe8', style: 'soul', mv: 0.8, element: 'dark' });
    }
    if (u < 1.6) this.strikeRect({ x: m.hole.x - 50, y: Math.min(m.hy - 40, A.floor - 40), w: 100, h: A.floor - Math.min(m.hy - 40, A.floor - 40) }, 1.35, { kb: [300, -700] });
    m.jaw = lerp(m.jaw, 0.2, dt * 3);
    if (u > 1.6) { m.follow = 3; m.extSp = 700; m.autoExt = true; m.tx = m.hole.x - Math.sign(m.hole.x - p.cx || 1) * 60; m.ty = A.floor - 240; }
  }

  // ── 벽 관통 돌격: 경기장 벽에서 머리가 튀어나와 가로지른다 ──
  s_wall(dt, world, p) {
    const m = this.main, A = this.A;
    m.autoExt = this.stateT >= 2.5;
    if (this.stateT < 0.5) {
      m.follow = 10; m.tx = m.hole.x - m.hole.nx * 60; m.ty = m.hole.y - m.hole.ny * 60; m.extT = 0; m.extSp = 1500;
      if (this.at(0)) audio.sfx('break_wall', { pitch: 0.5 });
      return;
    }
    if (this.at(0.5)) {
      const fromRight = p.cx < A.mid;
      const wx = fromRight ? A.x1 + 4 : A.x0 - 4, nx = fromRight ? -1 : 1;
      this.wy = clamp(p.cy - 4, A.floor - 190, A.floor - 50);
      m.setHole(wx, this.wy, nx, 0); m.ext = 0; m.extT = 0; m.k = 0; m.hx = m.tx = wx - nx * 30; m.hy = m.ty = this.wy;
      const reach = m.maxLen;
      this.warn({ type: 'band', x0: Math.min(wx, wx + nx * reach), x1: Math.max(wx, wx + nx * reach), y0: this.wy - 50, y1: this.wy + 50, life: 0.9, color: '#8aff9a', dir: nx });
      audio.sfx('warning', { vol: 0.5 });
    }
    if (this.stateT < 1.4) { if (Math.random() < 0.6) world.fx.emit('dust', m.hole.x + m.hole.nx * 6, this.wy + rand(-40, 40), { speed: 100, angle: m.hole.nx > 0 ? 0 : PI, spread: 0.6 }); return; }
    if (this.at(1.4)) {
      m.extSp = 2400; m.extT = m.maxLen; m.follow = 30; m.tx = m.hole.x + m.hole.nx * m.maxLen; m.ty = this.wy; m.aT = m.hole.nx > 0 ? 0 : PI; m.jaw = 0.9; m.flare = 1;
      this.impact(m.hole.x, this.wy, 10, 0.04, '#b8ffc8'); audio.sfx('boss_roar', { pitch: 1.3, vol: 0.7 });
      world.fx.burst('shard', m.hole.x, this.wy, 14, { color: '#6a5a4a', speed: 380, angle: m.hole.nx > 0 ? 0 : PI, spread: 0.9 });
    }
    if (this.stateT < 1.9) { this.strikeRect(m.box(), 1.3, { kb: [480, -380] }); return; }
    if (this.stateT < 2.5) { m.follow = 8; m.extT = 0; m.extSp = 1400; m.tx = m.hole.x; m.ty = this.wy; m.jaw = 0.2; return; }
    if (this.at(2.5)) {
      // 벽 근처 바닥으로 복귀
      const x = m.hole.nx > 0 ? A.x0 + 170 : A.x1 - 170;
      m.setHole(x, A.floor, 0, -1); m.ext = 0; m.k = 0; m.hx = m.tx = x; m.hy = A.floor + 30; m.ty = A.floor - 240; m.extSp = 1100; m.follow = 5;
      this.impact(x, A.floor, 8, 0.03, '#b8ffc8'); world.fx.burst('shard', x, A.floor - 6, 10, { color: '#6a5a4a', speed: 320, angle: -PI / 2, spread: 0.9 });
    }
    if (this.stateT > 3.0) this.rest(0.8);
  }

  // ── 뼈 파편 뱉기 ──
  s_spit(dt, world, p) {
    const m = this.main, A = this.A, W = 0.5, n = 3 + this.phase;
    m.follow = 4; m.tx = lerp(m.hole.x, p.cx, 0.3); m.ty = A.floor - 260;
    this.aim(m, p, dt);
    if (this.at(0)) { this.warnMark(m.hx, m.hy - 70, W); audio.sfx('boss_roar', { pitch: 1.6, vol: 0.4 }); }
    if (this.stateT < W) { m.jaw = lerp(m.jaw, 0.7, dt * 6); return; }
    if (this.at(W)) {
      const mo = m.mouth();
      for (let i = 0; i < n; i++) {
        const dx = p.cx - mo.x + (i - (n - 1) / 2) * 110, T = 0.9;
        this.shoot({ x: mo.x, y: mo.y, vx: dx / T, vy: (A.floor - 20 - mo.y) / T - 0.5 * 1400 * T * 0.6, w: 20, h: 20, behavior: 'arc', gravity: 0.6, collideWalls: 'land', render: 'bone', spin: 12, color: BONE, life: 3,
          attack: { mv: 0.8, kb: [240, -300] },
          onLand: (pr, w) => { pr.dead = true; w.fx.burst('shard', pr.cx, pr.cy, 8, { color: BONE, speed: 220 }); for (const s of [-1, 1]) this.shoot({ x: pr.cx, y: pr.cy - 8, vx: s * 260, vy: -380, w: 12, h: 12, behavior: 'arc', gravity: 0.7, render: 'bone', spin: 16, color: BONE, life: 1.4, attack: { mv: 0.5 } }); } });
      }
      audio.sfx('axe', { pitch: 0.6 }); m.jaw = 1; this.shake(3, 0.15);
    }
    m.jaw = lerp(m.jaw, 0.1, dt * 3);
    if (this.stateT > W + 0.8) this.rest(0.9);
  }

  // ── 쌍두 (3페이즈): 두 번째 머리의 독자 행동 ──
  twinAI(dt, world, p) {
    const h = this.twin, A = this.A;
    h.stT += dt;
    if (h.st === 'idle') {
      h.follow = 3; h.autoExt = true;
      h.tx = clamp(lerp(h.hole.x, p.cx, 0.35), A.x0 + 60, A.x1 - 60); h.ty = A.floor - 250 + Math.sin(this.t * 1.1 + 2) * 30;
      h.aT = angleTo(h.hx, h.hy, p.cx, p.cy - 20); h.jaw = lerp(h.jaw, 0.1, dt * 4);
      h.cool -= dt * this.aggro;
      if (h.cool <= 0 && this.state !== 'boneRain') { h.st = Math.random() < 0.5 ? 'bite' : 'spit'; h.stT = 0; }
      return;
    }
    if (h.st === 'bite') {
      if (h.stT < 0.65) {
        if (!h.lock) { h.lock = { x: p.cx, y: clamp(p.cy, A.floor - 200, A.floor - 40) }; this.warnLine(h.hx, h.hy, h.lock.x, h.lock.y, 0.6, { width: 60, color: '#a0c8ff', follow: (tg) => { tg.x0 = h.hx; tg.y0 = h.hy; } }); audio.sfx('boss_roar', { pitch: 1.7, vol: 0.4 }); }
        h.follow = 6; h.tx = lerp(h.hole.x, h.lock.x, 0.2); h.ty = A.floor - 290; h.aT = angleTo(h.hx, h.hy, h.lock.x, h.lock.y); h.jaw = 0.9; h.flare = 1;
        return;
      }
      if (h.stT < 0.95) {
        const dx = h.lock.x - h.hole.x, dy = h.lock.y - h.hole.y, d = Math.hypot(dx, dy) || 1, r = Math.min(d + 30, h.maxLen - 5);
        h.follow = 20; h.tx = h.hole.x + dx / d * r; h.ty = h.hole.y + dy / d * r; h.jaw = h.stT < 0.85 ? 0.9 : 0;
        this.strikeRect(h.box(), 1.2, { kb: [420, -400] });
        return;
      }
      h.lock = null; h.st = 'idle'; h.cool = 2.6; return;
    }
    if (h.st === 'spit') {
      h.aT = angleTo(h.hx, h.hy, p.cx, p.cy); h.jaw = lerp(h.jaw, 0.8, dt * 6);
      if (h.stT > 0.5 && !h.shot) {
        h.shot = true;
        const mo = h.mouth();
        for (let i = -1; i <= 1; i++) {
          const a = angleTo(mo.x, mo.y, p.cx, p.cy) + i * 0.2;
          this.shoot({ x: mo.x, y: mo.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, w: 18, h: 18, render: drawSoulFlame, color: '#8ac8ff', life: 2.4, light: { r: 50, color: '#8ac8ff', i: 0.6 }, attack: { mv: 0.7, element: 'ice', type: 'mag' } });
        }
        audio.sfx('ice', { pitch: 0.7 });
      }
      if (h.stT > 1.0) { h.shot = false; h.st = 'idle'; h.cool = 2.8; }
    }
  }

  // ── 페이즈 ──
  onPhase(n, world) {
    this.setState('transform'); this.transformTime = n === 2 ? 1.8 : 1.3;
    world.banner = n === 1
      ? { text: '영혼불 격화', sub: '해골룡의 눈구멍에서 녹색 불길이 치솟는다', t: 1.8, color: SOUL }
      : { text: '쌍두룡', sub: '반대편 바닥을 뚫고 두 번째 머리가 솟아오른다', t: 2, color: '#a0c8ff' };
  }
  transformTick(dt, world, p) {
    const m = this.main, A = this.A;
    m.follow = 3; m.tx = m.hole.x; m.ty = A.floor - 310; m.aT = -PI / 2; m.jaw = 1; m.flare = 1;
    if (this.at(0.3)) { this.phaseBurst(SOUL); audio.sfx('boss_roar', { pitch: 0.5 }); }
    if (this.phase >= 2 && this.at(0.7)) this.spawnTwin(true);
    if (Math.random() < 0.8) world.fx.emit('soul', m.hx + rand(-40, 40), m.hy + rand(-40, 40), { speed: 160, color: SOUL });
  }
  spawnTwin(fx) {
    if (this.twin) return;
    const A = this.A, m = this.main;
    const x = m.hole.x > A.mid ? A.x0 + 180 : A.x1 - 180;
    const h = new Wyrm(this, x, A.floor, { soul: '#8ac8ff', scale: 0.9, N: 15 });
    h.setHole(x, A.floor, 0, -1); h.ext = 0; h.extT = h.maxLen; h.extSp = 1200; h.hx = x; h.hy = A.floor + 20; h.tx = x; h.ty = A.floor - 280; h.cool = 1.5;
    this.twin = h; this.heads = [h, m];
    if (fx) {
      this.impact(x, A.floor, 14, 0.06, '#c0d8ff'); audio.sfx('explode', { pitch: 0.5 }); audio.sfx('boss_roar', { pitch: 0.9 });
      this.fx.burst('shard', x, A.floor - 6, 20, { color: '#6a5a4a', speed: 420, angle: -PI / 2, spread: 1 });
    }
  }
  phaseApply(n) { if (n >= 2) { this.spawnTwin(false); this.setState('idle'); for (let i = 0; i < 40; i++) this.twin.update(1 / 60); } }
  deathStart() { audio.sfx('boss_roar', { pitch: 0.4 }); }
  deathTick(dt) {
    for (const h of this.heads) { h.jaw = 1; h.follow = 2; h.ty = h.hole.y - 120 + this.deathT * 60; h.aT = -PI / 2 + Math.sin(this.deathT * 20) * 0.2; h.update(dt); }
    this.syncRect();
  }
  deathPoint() {
    const h = Math.random() < 0.7 || !this.twin ? this.main : this.twin;
    const i = Math.floor(rand(0, h.k)), pt = h.pts[i];
    return { x: pt.x + rand(-14, 14), y: Math.min(pt.y, this.floorY - 10) + rand(-14, 14) };
  }
  debrisPiece(i) { return paintedDebris(this, i) ?? { size: 12, draw: i % 5 === 0 ? drawSkullBit : i % 2 ? drawVertebraBit : drawBoneBit }; }
  extraLights(L) {
    for (const h of this.heads) if (!h.hidden) { L.add(h.hx, h.hy, 100 + h.flare * 60, h.soul, 0.9); const mid = h.pts[Math.floor(h.k / 2)]; L.add(mid.x, mid.y, 110, h.soul, 0.35); }
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx, world) {
    beginDraw(this);
    const t = this.t;
    if (this.twin) this.drawWyrm(ctx, this.twin, t, world);
    this.drawWyrm(ctx, this.main, t, world);
    endDraw();
  }
  drawWyrm(ctx, h, t, world) {
    const hole = h.hole, P = h.pts, k = h.k, s = h.scale, A = this.A;
    const floorHole = hole.ny < 0;
    // 구멍 (뒤)
    ctx.save();
    ctx.translate(hole.x, hole.y);
    if (!floorHole) ctx.rotate(hole.nx > 0 ? -PI / 2 : PI / 2);
    ctx.fillStyle = C('#050303');
    ctx.beginPath(); ctx.ellipse(0, 0, 58 * s, 13, 0, PI, TAU); ctx.fill();
    glow(ctx, 0, -6, 70 * s, h.soul, 0.25 + h.flare * 0.2);
    ctx.restore();
    // 몸 (지면 위만 보이게 클립)
    ctx.save();
    ctx.beginPath();
    if (floorHole) ctx.rect(A.x0 - 800, hole.y - 2000, A.w + 1600, 2000);
    else if (hole.nx < 0) ctx.rect(hole.x - 3000, hole.y - 2000, 3000, 4000);
    else ctx.rect(hole.x, hole.y - 2000, 3000, 4000);
    ctx.clip();
    if (!h.hidden || h.ext > 10) {
      // 날개 (어깨 = 구멍에서 1.5마디)
      const wi = Math.max(0, k - 2);
      if (k >= 3) this.drawWings(ctx, h, P[wi], P[wi + 1], t);
      // 척추 마디 (구멍 → 머리 순)
      for (let i = k - 1; i >= 0; i--) {
        const a = P[i], b = P[i + 1];
        const u = i / Math.max(1, h.N);
        this.vertebra(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, Math.atan2(b.y - a.y, b.x - a.x), lerp(0.95, 1.55, u) * s, i, t, h, i > k - 7 && i > 2);
      }
      this.skull(ctx, h, t);
    }
    ctx.restore();
    // 구멍 앞 테두리 (잔해)
    ctx.save();
    ctx.translate(hole.x, hole.y);
    if (!floorHole) ctx.rotate(hole.nx > 0 ? -PI / 2 : PI / 2);
    for (let i = 0; i < 9; i++) {
      const x = (-50 + i * 12.5) * s, hh = 6 + hash(i + (hole.x | 0)) * 10;
      ctx.beginPath(); ctx.moveTo(x - 9, 2); ctx.lineTo(x - 3, -hh); ctx.lineTo(x + 5, -hh * 0.7); ctx.lineTo(x + 9, 2); ctx.closePath();
      ink(ctx, C(i % 3 === 0 ? BONE2 : '#3a302a'), 1.5);
    }
    ctx.restore();
  }
  vertebra(ctx, x, y, a, s, i, t, h, ribs) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
    const up = Math.cos(a) >= 0 ? -1 : 1;
    // 영혼불 척수 (뒤)
    glow(ctx, 0, 0, 30, h.soul, 0.22 + this.fury * 0.2 + Math.sin(t * 6 + i) * 0.06);
    // 갈비뼈 (아래쪽으로 휘어짐)
    if (ribs) {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, -up * 6); ctx.quadraticCurveTo(-18, -up * 30, -2, -up * 46); ctx.moveTo(6, -up * 6); ctx.quadraticCurveTo(-4, -up * 28, 12, -up * 42);
      ctx.strokeStyle = C(OUT); ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = C(BONE2); ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = C('#fff4dc'); ctx.lineWidth = 1.2; ctx.stroke();
    }
    // 가시돌기 (뒤로 젖혀진 칼날 모양)
    ctx.beginPath(); ctx.moveTo(-10, up * 8); ctx.quadraticCurveTo(-8, up * 22, -16, up * (34 + (i % 2) * 8)); ctx.quadraticCurveTo(0, up * 20, 10, up * 8); ctx.closePath();
    ink(ctx, lg(ctx, 'bdsp' + up, 0, up * 8, 0, up * 40, [0, C(BONE), 1, C(BONED)]), 2);
    // 가로돌기
    ctx.beginPath(); ctx.moveTo(-4, -up * 4); ctx.lineTo(-10, -up * 16); ctx.lineTo(4, -up * 8); ctx.closePath(); ink(ctx, C(BONE2), 1.5);
    // 추체 (앞뒤 관절면이 넓은 실패 모양)
    ctx.beginPath();
    ctx.moveTo(-19, -12); ctx.quadraticCurveTo(-12, -8, 0, -9); ctx.quadraticCurveTo(12, -8, 19, -12);
    ctx.quadraticCurveTo(23, 0, 19, 12); ctx.quadraticCurveTo(12, 8, 0, 9); ctx.quadraticCurveTo(-12, 8, -19, 12);
    ctx.quadraticCurveTo(-23, 0, -19, -12); ctx.closePath();
    ink(ctx, rg(ctx, 'bdv', -5, up * 6, 1, 0, 0, 22, [0, C('#fff8e6'), 0.45, C(BONE), 1, C(BONED)]), 2.4);
    ctx.strokeStyle = C('rgba(60,45,30,0.6)'); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-14, -6); ctx.quadraticCurveTo(-16, 0, -14, 6); ctx.moveTo(14, -6); ctx.quadraticCurveTo(16, 0, 14, 6); ctx.stroke();
    ctx.restore();
  }
  drawWings(ctx, h, a, b, t) {
    const ang = Math.atan2(a.y - b.y, a.x - b.x), sp = h.wing * h.scale, fl = Math.sin(t * 2.2) * 0.08;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(ang); ctx.scale(h.scale, s * h.scale);
      const ex = 34, ey = -64 * sp, wx = 96 * sp + 18, wy = -120 * sp - fl * 50;
      const tips = [[wx + 88 * sp, wy + 40], [wx + 58 * sp, wy + 96], [wx + 10, wy + 128], [wx - 36, wy + 118]];
      // 찢긴 막
      ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(ex, ey); ctx.lineTo(wx, wy);
      for (let i = 0; i < tips.length; i++) {
        const [tx, ty] = tips[i]; const px = i ? tips[i - 1][0] : wx, py = i ? tips[i - 1][1] : wy;
        const mx = lerp((px + tx) / 2, wx, 0.3), my = lerp((py + ty) / 2, wy, 0.3);
        if (i === 1 || i === 3) { ctx.lineTo(lerp(px, tx, 0.3), lerp(py, ty, 0.3) - 4); ctx.lineTo(lerp(mx, (px + tx) / 2, 0.2), lerp(my, (py + ty) / 2, 0.2) + 8); ctx.lineTo(lerp(px, tx, 0.7), lerp(py, ty, 0.7) - 6); ctx.lineTo(tx, ty); }
        else ctx.quadraticCurveTo(mx, my, tx, ty);
      }
      ctx.quadraticCurveTo(26, 20, 8, 10); ctx.closePath();
      ctx.save(); ctx.globalAlpha *= 0.6;
      ctx.fillStyle = rg(ctx, null, wx, wy, 4, wx, wy, 150, [0, C('#1a2418'), 0.6, C('#2e3a2a'), 1, C('#4a5a40')]);
      ctx.fill(); ctx.restore();
      ctx.strokeStyle = C('rgba(8,14,8,0.9)'); ctx.lineWidth = 1.5; ctx.stroke();
      glow(ctx, wx, wy + 40, 70, h.soul, 0.12);
      // 팔뼈
      _Q[0] = 4; _Q[1] = -6; _Q[2] = ex; _Q[3] = ey; _Q[4] = wx; _Q[5] = wy;
      taper(ctx, _Q, 3, 12, 7); ink(ctx, lg(ctx, 'bdwing', 0, -6, wx, wy, [0, C(BONE2), 1, C(BONE)]), 2);
      // 손가락뼈 (살짝 굽음)
      ctx.lineCap = 'round';
      for (const [tx, ty] of tips) {
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo((wx + tx) / 2 + 8, (wy + ty) / 2 - 10, tx, ty);
        ctx.strokeStyle = C(OUT); ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = C(BONE2); ctx.lineWidth = 3.5; ctx.stroke();
        ctx.strokeStyle = C('#fff2d8'); ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(wx, wy, 6, 0, TAU); ink(ctx, C(BONE), 1.5);
      ctx.beginPath(); ctx.moveTo(wx - 2, wy - 4); ctx.quadraticCurveTo(wx - 4, wy - 20, wx + 8, wy - 24); ctx.quadraticCurveTo(wx + 2, wy - 14, wx + 5, wy - 2); ctx.closePath(); ink(ctx, C('#fff2d8'), 1.3);
      ctx.restore();
    }
  }
  skull(ctx, h, t) {
    const s = h.scale * 1.12, a = h.a, flip = Math.cos(a) < 0;
    ctx.save(); ctx.translate(h.hx, h.hy); ctx.rotate(a); ctx.scale(s, flip ? -s : s);
    const jaw = clamp(h.jaw, 0, 1.1) * 0.62;
    glow(ctx, 0, 0, 90, '#0a1a0a', 0.5);
    // 뿔 (뒤쪽)
    ctx.beginPath(); ctx.moveTo(-26, -20); ctx.quadraticCurveTo(-60, -40, -92, -30); ctx.quadraticCurveTo(-60, -26, -30, -8); ctx.closePath();
    ink(ctx, lg(ctx, 'bdhorn', -90, -30, -30, -10, [0, C('#fff4dc'), 0.4, C(BONE2), 1, C(BONED)]), 2);
    ctx.beginPath(); ctx.moveTo(-34, -6); ctx.quadraticCurveTo(-66, -4, -86, 12); ctx.quadraticCurveTo(-60, 4, -34, 6); ctx.closePath();
    ink(ctx, C(BONE2), 1.8);
    // 아래턱 (경첩 -22, 8)
    ctx.save(); ctx.translate(-22, 8); ctx.rotate(jaw);
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(70, 2); ctx.quadraticCurveTo(76, 8, 66, 14); ctx.lineTo(8, 16); ctx.quadraticCurveTo(-6, 10, 0, -4); ctx.closePath();
    ink(ctx, lg(ctx, 'bdjaw', 0, -4, 0, 16, [0, C('#fff2d8'), 0.6, C(BONE), 1, C(BONED)]), 2.4);
    ctx.fillStyle = C('#fff8ea');
    for (let i = 0; i < 7; i++) { const x = 14 + i * 8; ctx.beginPath(); ctx.moveTo(x - 2.5, 2); ctx.lineTo(x, -8 + (i % 2) * 2); ctx.lineTo(x + 2.5, 2); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // 입 속 영혼불
    if (jaw > 0.1) { glow(ctx, 20, 12, 40 + jaw * 40, h.soul, 0.4 + jaw * 0.6); }
    // 위 두개골
    ctx.beginPath();
    ctx.moveTo(-40, 8); ctx.quadraticCurveTo(-46, -18, -26, -28); ctx.quadraticCurveTo(-4, -34, 14, -22);
    ctx.quadraticCurveTo(40, -18, 62, -10); ctx.quadraticCurveTo(70, -4, 64, 4); ctx.lineTo(4, 8); ctx.quadraticCurveTo(-18, 14, -40, 8); ctx.closePath();
    ink(ctx, lg(ctx, 'bdskull', 0, -34, 0, 10, [0, C('#fffaec'), 0.45, C(BONE), 1, C(BONE2)]), 2.8);
    rim(ctx, 0, 0, RIM, 3, 0.5, -34, -10);
    // 윗니
    ctx.fillStyle = C('#fff8ea');
    for (let i = 0; i < 8; i++) { const x = 8 + i * 7.5; ctx.beginPath(); ctx.moveTo(x - 2.5, 4); ctx.lineTo(x, 14 - (i % 2) * 3); ctx.lineTo(x + 2.5, 4); ctx.closePath(); ctx.fill(); }
    // 뼈 볏 가시
    for (let i = 0; i < 4; i++) { const x = -30 + i * 11; ctx.beginPath(); ctx.moveTo(x - 4, -26 + i * 0.5); ctx.lineTo(x - 8, -40 + i * 2); ctx.lineTo(x + 4, -27 + i); ctx.closePath(); ink(ctx, C(BONE2), 1.4); }
    // 균열 · 콧구멍
    ctx.strokeStyle = C('#5a4a38'); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(20, -20); ctx.lineTo(28, -12); ctx.lineTo(26, -4); ctx.moveTo(-20, -24); ctx.lineTo(-14, -16); ctx.stroke();
    ctx.fillStyle = C('#1a120a'); ctx.beginPath(); ctx.ellipse(56, -8, 4, 2.5, 0.3, 0, TAU); ctx.fill();
    // 눈구멍 + 영혼불
    ctx.fillStyle = C('#0a0806'); ctx.beginPath(); ctx.ellipse(-6, -14, 11, 8, -0.15, 0, TAU); ctx.fill();
    const fk = 0.8 + h.flare * 0.6 + this.fury * 0.4;
    flames(ctx, -6, -16, -PI / 2 - 0.5, 4, 22 * fk, t, h.soul, 6, 2, '#ffffff', 0.5);
    eye(ctx, -4, -14, 3.2 + h.flare * 1.2, h.soul, 1, '#f0fff0');
    ctx.restore();
  }
}

// ───────────────────────── 투사체/파편 ─────────────────────────
function glowPulse(world, mo) { if (Math.random() < 0.3) world.fx.flash(mo.x, mo.y, { color: SOUL, size: 50, life: 0.1 }); }
function drawSoulFlame(ctx, p) {
  ctx.globalCompositeOperation = 'lighter';
  const a = Math.atan2(p.vy, p.vx), k = clamp(p.life / 0.4, 0, 1);
  ctx.rotate(a);
  const sc = p.scale ?? 1, grow = sc > 1 ? 1 + p.t * 1.6 : 1;
  ctx.scale(sc * grow, sc * grow);
  glow(ctx, 0, 0, 30 * (1.3 - k * 0.3), p.color, 0.6);
  ctx.fillStyle = rgba(p.color, 0.5);
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.quadraticCurveTo(0, -12, -30, Math.sin(p.t * 30) * 4); ctx.quadraticCurveTo(0, 12, 14, 0); ctx.fill();
  ctx.fillStyle = 'rgba(240,255,244,0.85)'; ctx.beginPath(); ctx.ellipse(4, 0, 6, 4, 0, 0, TAU); ctx.fill();
}
function drawSkullFall(ctx, p) {
  ctx.rotate(p.rot);
  ctx.fillStyle = '#efe4cc'; ctx.strokeStyle = '#1a120a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -2, 10, PI * 0.9, PI * 2.1); ctx.lineTo(7, 8); ctx.lineTo(-7, 8); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#1a120a'; ctx.beginPath(); ctx.arc(-4, -1, 2.8, 0, TAU); ctx.arc(4, -1, 2.8, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#6aff8a'; ctx.beginPath(); ctx.arc(-4, -1, 1.2, 0, TAU); ctx.arc(4, -1, 1.2, 0, TAU); ctx.fill();
}
function drawBoneBit(ctx) { ctx.fillStyle = '#e8dcc0'; ctx.fillRect(-7, -1.5, 14, 3); ctx.beginPath(); ctx.arc(-7, 0, 2.5, 0, TAU); ctx.arc(7, 0, 2.5, 0, TAU); ctx.fill(); }
function drawVertebraBit(ctx) { ctx.fillStyle = '#d8ccb0'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a2018'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill(); }
function drawSkullBit(ctx) { ctx.fillStyle = '#efe4cc'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a120a'; ctx.fillRect(-4, -2, 3, 3); ctx.fillRect(1, -2, 3, 3); }
