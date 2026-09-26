// 8장 보스: 레비아탄 — 검은 물에서 솟구치는 생물발광 해룡
// 패턴: 수압포(추적 물줄기) · 물덩이 투척 · 아래에서 물어뜯기 · 해일(점프 회피) · 몸통 도약 아치 · 간헐천(2페이즈) · 꼬리 내려치기(2페이즈)
// 몸통은 '목 모드'(수면 닻 → 머리 베지어 곡선)와 '도약 모드'(머리 궤적을 따라가는 마디) 두 방식으로 계산한다.
import { BossB, PI, OUT, R, C, LG, glow, glowE, eye, warnLine, warnFloor, warnCircle, warnBang, warnRect, impact, hash } from './b_common.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, ease, rgba, wrapAngle } from '../../core/math.js';

const N = 30;              // 몸통 마디 수
const SP = 17;             // 마디 간격(px)
const BIO = '#5fe8ff';     // 생물발광
const BIO2 = '#ff4f9a';    // 분노(3페이즈) 발광
const BODY = '#17393e', BODY_D = '#07161a', BODY_L = '#2f6b6c';
const BELLY = '#9fb8a2', BELLY_D = '#51695c';
const HORN = '#ddd3b8', HORN_D = '#5d574a';
const WATER = '#6fd8ff';

function segR(i) {
  const u = i / (N - 1);
  const grow = Math.sin(Math.min(1, u / 0.3) * PI / 2);
  const taper = 1 - 0.78 * Math.pow(Math.max(0, (u - 0.42) / 0.58), 1.25);
  return (21 + 14 * grow) * taper + 2;
}

export class Leviathan extends BossB {
  setup() {
    const A = this.A;
    this.side = 1;                          // 자리 잡은 쪽 (+1 오른쪽)
    this.facing = -1;
    this.ax = A.x1 - 170;                   // 목 닻 x (수면 진입점)
    this.hx = this.ax; this.hy = A.floor + 140; this.ha = -PI / 2;
    this.tx = this.hx; this.ty = this.hy; this.ta = this.ha; this.fk = 8;
    this.jaw = 0; this.jawT = 0; this.mouthGlow = 0; this.bio = 1;
    this.mode = 'neck';
    this.sx = new Float32Array(N); this.sy = new Float32Array(N); this.sa = new Float32Array(N); this.sr = new Float32Array(N);
    for (let i = 0; i < N; i++) this.sr[i] = segR(i);
    this.bz = new Float32Array(34 * 2);
    this.hist = new Float32Array(512 * 2); this.hn = 0; this.hi = 0;
    this.sub = true; this.invuln = true; this.harmless = true;
    this.px0 = this.hx; this.py0 = A.floor - 190;
    this.perchN = 0; this.enrage = 0;
    this.tail = null;                       // 꼬리 {x, y, a, k}
    this.ripples = [];                      // 수면 파문 {x, t, s}
    this.headR = { x: 0, y: 0, w: 104, h: 72 };
    this.bodyParts = []; for (let i = 0; i < 6; i++) this.bodyParts.push({ x: 0, y: 0, w: 0, h: 0, defMul: 2.4, armor: true, off: true });
    this.contacts = []; for (let i = 0; i < 16; i++) this.contacts.push({ x: 0, y: 0, w: 0, h: 0 });
    this.hitList = [this.headR, ...this.bodyParts];
    this.nContacts = 0;
    this.foamT = 0;
    this.updateBody();
  }

  // ───────────── 판정 ─────────────
  hitParts() { return this.sub ? [] : this.hitList; }
  hurtboxes() {
    if (this.harmless || this.sub) return [];
    const out = this._cl || (this._cl = []);
    out.length = 0;
    for (let i = 0; i < this.nContacts; i++) out.push(this.contacts[i]);
    return out;
  }

  // ───────────── 운동/몸통 ─────────────
  snap(x, y, a) { this.hx = this.tx = x; this.hy = this.ty = y; if (a !== undefined) this.ha = this.ta = a; }
  perchPos(side = this.side) {
    const A = this.A;
    const ax = side > 0 ? A.x1 - 150 : A.x0 + 150;
    return { ax, x: ax - side * 150, y: A.floor - 190 };
  }
  aimAngle(spread = 0.7) {
    const p = this.P;
    const base = this.facing > 0 ? 0.3 : PI - 0.3;
    if (!p) return base;
    const a = Math.atan2(p.cy - this.hy, p.cx - this.hx);
    const d = clamp(wrapAngle(a - base), -spread, spread);
    return base + d;
  }
  tickB(dt, world) {
    const k = 1 - Math.exp(-this.fk * dt);
    this.hx += (this.tx - this.hx) * k; this.hy += (this.ty - this.hy) * k;
    this.ha += wrapAngle(this.ta - this.ha) * Math.min(1, k * 1.2);
    this.jaw += (this.jawT - this.jaw) * (1 - Math.exp(-16 * dt));
    this.mouthGlow = Math.max(0, this.mouthGlow - dt * 0.8);
    this.x = this.hx - this.w / 2; this.y = this.hy - this.h / 2;
    this.vx = 0; this.vy = 0;
    if (this.mode === 'arc') this.pushHist();
    this.updateBody();
    // 수면 교차 지점 물보라
    this.foamT -= dt;
    if (this.foamT <= 0) {
      this.foamT = 0.07;
      const F = this.A.floor;
      for (let i = 0; i < N - 1; i++) {
        if ((this.sy[i] - F) * (this.sy[i + 1] - F) < 0) {
          const moving = this.mode === 'arc' || this.state === 'bite' || this.state === 'rise' || this.state === 'dive';
          world.fx.burst('water', this.sx[i], F - 4, moving ? 3 : 1, { speed: moving ? 260 : 90, angle: -PI / 2, spread: 0.9 });
        }
      }
    }
    for (const r of this.ripples) r.t += dt;
    if (this.ripples.length && this.ripples[0].t > 1.6) this.ripples.shift();
    this.updateParts();
  }
  pushHist() {
    const n = this.hn, H = this.hist;
    if (n > 0) {
      const j = ((this.hi - 1 + 512) % 512) * 2;
      if (Math.hypot(this.hx - H[j], this.hy - H[j + 1]) < 4) return;
    }
    H[this.hi * 2] = this.hx; H[this.hi * 2 + 1] = this.hy;
    this.hi = (this.hi + 1) % 512; this.hn = Math.min(512, n + 1);
  }
  /** 도약 모드 시작: 머리 아래로 늘어진 몸통 궤적 생성 */
  resetHist(x, y) {
    this.hn = 0; this.hi = 0;
    for (let i = 60; i >= 0; i--) { this.hx = x; this.hy = y + i * 10; this.pushHist(); }
    this.hx = x; this.hy = y;
  }
  updateBody() {
    const sx = this.sx, sy = this.sy, sa = this.sa;
    let pts, np, getX, getY;
    if (this.mode === 'arc' && this.hn > 1) {
      const H = this.hist, hi = this.hi, hn = this.hn;
      np = hn;
      getX = (j) => H[((hi - 1 - j + 1024) % 512) * 2];
      getY = (j) => H[((hi - 1 - j + 1024) % 512) * 2 + 1];
    } else {
      // 목 모드: 닻(수면 아래) → 머리까지 3차 베지어
      const F = this.A.floor;
      const ax = this.ax, ay = F + 110;
      const hx = this.hx, hy = this.hy;
      const dx = Math.cos(this.ha), dy = Math.sin(this.ha);
      const d = Math.hypot(hx - ax, hy - ay);
      const sway = Math.sin(this.t * 1.3) * 16;
      const p1x = ax + sway * 0.5, p1y = ay - d * 0.5;
      const p2x = hx - dx * d * 0.45 + sway, p2y = hy - dy * d * 0.45 + d * 0.08;
      pts = this.bz;
      for (let i = 0; i <= 32; i++) {
        const t = 1 - i / 32, u = 1 - t;
        pts[i * 2] = u * u * u * ax + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * hx;
        pts[i * 2 + 1] = u * u * u * ay + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * hy;
      }
      np = 33;
      getX = (j) => pts[j * 2]; getY = (j) => pts[j * 2 + 1];
    }
    // 폴리라인을 따라 SP 간격으로 마디 배치
    sx[0] = getX(0); sy[0] = getY(0);
    let seg = 1, acc = 0, px = sx[0], py = sy[0];
    for (let j = 1; j < np && seg < N; j++) {
      const qx = getX(j), qy = getY(j);
      let L = Math.hypot(qx - px, qy - py);
      while (acc + L >= SP && seg < N) {
        const f = (SP - acc) / L;
        px = px + (qx - px) * f; py = py + (qy - py) * f;
        sx[seg] = px; sy[seg] = py; seg++;
        L = Math.hypot(qx - px, qy - py); acc = 0;
      }
      acc += L; px = qx; py = qy;
    }
    // 부족하면 아래로 늘어뜨림
    for (; seg < N; seg++) { sx[seg] = sx[seg - 1]; sy[seg] = sy[seg - 1] + SP; }
    sa[0] = this.ha;
    for (let i = 1; i < N; i++) sa[i] = Math.atan2(sy[i - 1] - sy[i], sx[i - 1] - sx[i]);
  }
  updateParts() {
    const F = this.A.floor;
    const hr = this.headR, c = Math.cos(this.ha), s = Math.sin(this.ha);
    const hcx = this.hx + c * 48, hcy = this.hy + s * 30;
    hr.x = hcx - hr.w / 2; hr.y = hcy - hr.h / 2;
    hr.off = hcy > F + 10;
    let k = 0;
    for (let n = 0; n < this.bodyParts.length; n++) {
      const i = 4 + n * 4, bp = this.bodyParts[n];
      const r = this.sr[i] * 0.95;
      bp.x = this.sx[i] - r; bp.y = this.sy[i] - r; bp.w = bp.h = r * 2;
      bp.off = this.sy[i] > F - 8 || this.mode === 'arc';
    }
    // 접촉 판정: 머리 + 보이는 마디
    const cs = this.contacts;
    cs[k].x = hr.x + 8; cs[k].y = hr.y + 8; cs[k].w = hr.w - 16; cs[k].h = hr.h - 16;
    if (!hr.off) k++;
    for (let i = 3; i < N && k < cs.length; i += 2) {
      if (this.sy[i] > F - 6) continue;
      const r = this.sr[i] * 0.75;
      cs[k].x = this.sx[i] - r; cs[k].y = this.sy[i] - r; cs[k].w = cs[k].h = r * 2; k++;
    }
    this.nContacts = k;
  }
  ripple(x, s = 1) { this.ripples.push({ x, t: 0, s }); if (this.ripples.length > 10) this.ripples.shift(); }
  splash(world, x, n = 24, s = 1) {
    const F = this.A.floor;
    world.fx.burst('water', x, F - 4, n, { speed: 420 * s, angle: -PI / 2, spread: 0.8 });
    world.fx.burst('water', x, F - 4, Math.round(n * 0.5), { speed: 200 * s, angle: -PI / 2, spread: 1.4, color: '#d8fbff' });
    world.fx.ring(x, F - 2, { color: '#bff4ff', r0: 10, r1: 90 * s, life: 0.45, width: 5 });
    this.ripple(x, s);
    audio.sfx('splash', { vol: 0.8, pitch: rand(0.8, 1) });
  }
  mouthPos() {
    const c = Math.cos(this.ha), s = Math.sin(this.ha);
    const f = c < 0 ? -1 : 1;
    // 머리 지역 좌표 (96, 8) → 월드
    const lx = 96, ly = 8 * f;
    return { x: this.hx + c * lx - s * ly, y: this.hy + s * lx + c * ly };
  }

  // ───────────── 상태 ─────────────
  s_intro(dt, world, t) {
    const A = this.A, F = A.floor;
    if (this.at(0.01)) { this.side = 1; const pp = this.perchPos(); this.ax = pp.ax; this.snap(pp.ax, F + 160, -PI / 2); this.facing = -1; }
    if (this.every(0.25, 0, 1.2)) { this.ripple(this.ax + rand(-60, 60), 0.8); world.fx.burst('water', this.ax + rand(-50, 50), F - 4, 4, { speed: 160, angle: -PI / 2, spread: 0.6 }); }
    if (t > 1.2) this.goRise(1, 'roar');
  }
  goRise(side, after = 'idle') { this.side = side; this.after = after; this.setState('rise'); }
  s_rise(dt, world, t) {
    const F = this.A.floor;
    const pp = this.perchPos();
    if (this.at(0.001)) {
      this.mode = 'neck'; this.ax = pp.ax; this.facing = -this.side;
      this.snap(pp.ax + this.facing * 10, F + 150, -PI / 2);
      this.fk = 30;
    }
    if (this.at(0.12)) { this.sub = false; this.invuln = false; this.harmless = false; this.splash(world, pp.ax, 30, 1.2); impact(world, { shake: 6, time: 0.35 }); }
    const e = ease.outBack(clamp((t - 0.05) / 0.55, 0, 1));
    this.tx = lerp(pp.ax + this.facing * 10, pp.x, e);
    this.ty = lerp(F + 150, pp.y, e);
    this.ta = lerp(-PI / 2, this.aimAngle(0.4), clamp((t - 0.2) / 0.4, 0, 1));
    this.jawT = t > 0.3 && t < 0.8 ? 0.8 : 0.05;
    if (this.at(0.35)) audio.sfx('boss_roar', { vol: 0.7, pitch: 1.1 });
    if (t > 0.85) { this.fk = 8; this.px0 = pp.x; this.py0 = pp.y; this.perchN = 0; this.setState(this.after || 'idle'); }
  }
  s_roar(dt, world, t) {
    const F = this.A.floor;
    this.tx = this.px0 - this.facing * 20 + Math.sin(t * 30) * (t > 0.3 && t < 1.2 ? 5 : 0);
    this.ty = F - 260;
    this.ta = this.facing > 0 ? -0.5 : PI + 0.5;
    this.jawT = t > 0.25 && t < 1.3 ? 1 : 0.05;
    if (this.at(0.3)) {
      audio.sfx('boss_roar'); impact(world, { shake: 12, time: 0.9 });
      const m = this.mouthPos();
      world.fx.ring(m.x, m.y, { color: BIO, r0: 20, r1: 260, life: 0.6, width: 8 });
      world.fx.ring(m.x, m.y, { color: '#ffffff', r0: 10, r1: 160, life: 0.4, width: 4 });
    }
    if (this.every(0.12, 0.3, 1.2)) world.fx.burst('water', rand(this.A.x0, this.A.x1), this.A.top + 10, 3, { speed: 60, angle: PI / 2, spread: 0.3 });
    if (t > 1.5) { this.enrage = 0; this.setState('idle'); }
  }
  s_idle(dt, world, t) {
    const p = this.P;
    this.fk = 6;
    this.tx = this.px0 + Math.sin(this.t * 0.9) * 16;
    this.ty = this.py0 + Math.sin(this.t * 1.7) * 10 + (t < 0.4 ? 0 : 0);
    this.ta = this.aimAngle(0.6);
    this.jawT = 0.06 + 0.05 * Math.sin(this.t * 3);
    if (this.enrage) { this.setState('roar'); return; }
    if (t < (this.rest ?? this.restTime(1.0))) return;
    this.rest = this.restTime(rand(0.7, 1.2));
    const ph = this.phase;
    // 같은 자리에서 오래 머물면 이동
    if (this.perchN >= 2) {
      this.perchN = 0;
      const far = p && p.cx > this.A.cx ? -1 : 1;
      this.diveTo('move', far);
      return;
    }
    const a = this.choose([
      ['cannon', 3], ['spit', 3], ['bite', 2.5], ['wave', 2], ['arc', 2],
      ['geyser', ph >= 1 ? 2.5 : 0], ['tail', ph >= 1 ? 2 : 0],
    ]);
    if (a === 'cannon' || a === 'spit' || a === 'geyser' || a === 'tail') { this.perchN++; this.setState(a); }
    else this.diveTo(a);
  }
  diveTo(next, side) { this.after = next; this.nextSide = side ?? (this.P && this.P.cx > this.A.cx ? -1 : 1); this.setState('dive'); }
  s_dive(dt, world, t) {
    const F = this.A.floor;
    this.fk = 7;
    this.jawT = 0.1;
    if (t < 0.18) { this.ty = this.py0 - 40; this.ta = this.facing > 0 ? -0.3 : PI + 0.3; }
    else { this.tx = this.ax + this.facing * 30; this.ty = F + 170; this.ta = PI / 2 - this.facing * 0.3; }
    if (this.at(0.4)) this.splash(world, this.ax + this.facing * 30, 26, 1);
    if (t > 0.62) {
      this.sub = true; this.invuln = true; this.harmless = true;
      const n = this.after;
      if (n === 'move') this.goRise(this.nextSide);
      else this.setState(n);
    }
  }
  s_move() { this.goRise(this.nextSide ?? -this.side); }

  // 1) 수압포: 조준 → 추적 물줄기
  s_cannon(dt, world, t) {
    const F = this.A.floor;
    const T0 = 0.8, dur = this.phase >= 1 ? 1.5 : 1.15;
    this.fk = 5;
    if (t < T0) {
      this.tx = this.px0 - this.facing * 34; this.ty = this.py0 - 46;
      this.ta = this.aimAngle(0.75);
      this.jawT = 0.95; this.mouthGlow = Math.max(this.mouthGlow, t / T0);
      const m = this.mouthPos();
      if (this.every(0.03, 0, T0)) {
        const a = rand(0, TAU), r = rand(60, 120);
        world.fx.emit('water', m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, { vx: -Math.cos(a) * r * 4, vy: -Math.sin(a) * r * 4, speed: 0, grav: 0, life: 0.25, color: '#bff4ff' });
      }
      if (this.at(0.05)) audio.sfx('charge_ready', { vol: 0.5, pitch: 0.7 });
    }
    if (this.at(T0)) {
      audio.sfx('splash', { vol: 1, pitch: 0.6 }); audio.sfx('thunderclap', { vol: 0.35, pitch: 1.6 });
      impact(world, { shake: 7, time: dur });
      this.beamA = this.ha;
      const boss = this;
      this.beam = this.zone({
        x: 0, y: 0, w: 1, h: 1, life: dur, mv: 1.15, kb: [460, -300], element: null, z: 7,
        line: { x0: 0, y0: 0, x1: 0, y1: 0, th: 30 },
        tick(z, w, dt2) { boss.aimBeam(z, dt2, w); },
        paint: (ctx, z) => this.paintBeam(ctx, z),
        light: (L, z) => { L.add(z.line.x1, z.line.y1, 160, WATER, 0.9); L.add((z.line.x0 + z.line.x1) / 2, (z.line.y0 + z.line.y1) / 2, 200, WATER, 0.6); },
      });
    }
    if (t >= T0 && t < T0 + dur) {
      this.jawT = 1; this.mouthGlow = 1;
      this.tx = this.px0 - this.facing * (44 + Math.sin(t * 50) * 3); this.ty = this.py0 - 40;
      if (this.inferno && this.every(0.35, T0, T0 + dur)) this.dropRain(world, 2);
    }
    if (t >= T0 + dur) { this.jawT = 0.05; this.ta = this.aimAngle(0.5); }
    if (t > T0 + dur + 0.55) this.setState('idle');
  }
  aimBeam(z, dt, world) {
    const p = this.P;
    // 제한된 회전 속도로 플레이어 추적
    if (p) {
      const m0 = this.mouthPos();
      const want = Math.atan2(p.cy + 10 - m0.y, p.cx - m0.x);
      const turn = (this.phase >= 2 ? 0.75 : this.phase >= 1 ? 0.6 : 0.45) * (this.inferno ? 1.3 : 1);
      this.beamA += clamp(wrapAngle(want - this.beamA), -turn * dt, turn * dt);
      const base = this.facing > 0 ? 0.3 : PI - 0.3;
      this.beamA = base + clamp(wrapAngle(this.beamA - base), -1.1, 1.1);
    }
    this.ta = this.beamA;
    const m = this.mouthPos();
    const c = Math.cos(this.beamA), s = Math.sin(this.beamA);
    const F = this.A.floor;
    let L = 1600;
    if (s > 0.02) L = Math.min(L, (F - m.y) / s);
    if (c > 0.02) L = Math.min(L, (this.A.x1 + 40 - m.x) / c);
    if (c < -0.02) L = Math.min(L, (this.A.x0 - 40 - m.x) / c);
    const l = z.line;
    l.x0 = m.x; l.y0 = m.y; l.x1 = m.x + c * L; l.y1 = m.y + s * L;
    if (Math.random() < 0.7) world.fx.burst('water', l.x1, l.y1 - 4, 3, { speed: 380, angle: -PI / 2 - Math.sign(c) * 0.6, spread: 0.9 });
    if (Math.random() < 0.25) world.fx.emit('smoke', l.x1, l.y1 - 8, { color: '#9fdcff', alpha: 0.35, size: 18 });
  }
  paintBeam(ctx, z) {
    const l = z.line, t = this.t;
    const fade = Math.min(1, z.a * 8, (1 - z.a) * 6);
    const dx = l.x1 - l.x0, dy = l.y1 - l.y0, L = Math.hypot(dx, dy);
    ctx.translate(l.x0, l.y0); ctx.rotate(Math.atan2(dy, dx));
    ctx.globalCompositeOperation = 'lighter';
    const wob = 1 + Math.sin(t * 40) * 0.08;
    ctx.globalAlpha = 0.35 * fade; ctx.fillStyle = '#1b7fb0';
    ctx.fillRect(0, -30 * wob, L, 60 * wob);
    ctx.globalAlpha = 0.7 * fade; ctx.fillStyle = '#4fc8ff';
    ctx.fillRect(0, -17 * wob, L, 34 * wob);
    ctx.globalAlpha = 0.9 * fade; ctx.fillStyle = '#d8fbff';
    ctx.fillRect(0, -7, L, 14);
    // 흐름 줄무늬
    ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const off = ((t * 900 + i * 173) % 220);
      const yy = (hash(i) - 0.5) * 22;
      for (let x = off; x < L; x += 220) { ctx.moveTo(x, yy); ctx.lineTo(Math.min(L, x + 60), yy); }
    }
    ctx.stroke();
    glow(ctx, 0, 0, 70, WATER, fade);
    glow(ctx, L, 0, 110, WATER, fade);
    glowE(ctx, L, 0, 60, 90, '#ffffff', 0.5 * fade);
  }

  // 2) 물덩이 투척: 포물선 3발 × 3회
  s_spit(dt, world, t) {
    const n = this.phase >= 1 ? 4 : 3;
    const per = 0.42;
    this.fk = 9;
    const k = (t - 0.35) / per;
    const local = k - Math.floor(k);
    this.tx = this.px0 + (t > 0.35 && k < n ? (local < 0.3 ? this.facing * 26 : -this.facing * 8) : -this.facing * 16);
    this.ty = this.py0 + 20 + (local < 0.3 ? 12 : 0);
    this.ta = this.aimAngle(0.6);
    this.jawT = t > 0.25 && k < n ? (local < 0.35 ? 0.85 : 0.3) : 0.1;
    if (this.every(per, 0.35, 0.35 + per * (n - 0.5))) this.throwBlobs(world);
    if (t > 0.35 + per * n + 0.5) this.setState('idle');
  }
  throwBlobs(world) {
    const p = this.P; if (!p) return;
    const m = this.mouthPos();
    const cnt = this.inferno ? 5 : 3;
    const F = this.A.floor;
    for (let i = 0; i < cnt; i++) {
      const tx = p.cx + (i - (cnt - 1) / 2) * 95 + rand(-20, 20);
      const T = rand(0.75, 0.95);
      const g = 2000 * 0.7;
      const vx = (tx - m.x) / T, vy = ((F - 10 - m.y) - 0.5 * g * T * T) / T;
      this.shoot({ x: m.x, y: m.y, vx, vy, w: 22, h: 22, gravity: 0.7, life: 3, render: blobRender, trail: 'water', trailRate: 0.05,
        light: { r: 60, color: WATER, i: 0.6 }, attack: { mv: 0.8, kb: [240, -300] },
        onWall: (pr, w) => { this.splashSmall(w, pr.cx, pr.cy); pr.dead = true; },
        onExpire: (pr, w, hit) => { if (hit) this.splashSmall(w, pr.cx, pr.cy); } });
    }
    audio.sfx('splash', { vol: 0.6, pitch: 1.4 });
  }
  splashSmall(world, x, y) {
    world.fx.burst('water', x, y - 4, 12, { speed: 260, angle: -PI / 2, spread: 1.1 });
    world.fx.ring(x, y, { color: '#bff4ff', r0: 4, r1: 40, life: 0.3, width: 3 });
    if (Math.abs(y - this.A.floor) < 30) this.ripple(x, 0.5);
  }
  dropRain(world, n) {
    const A = this.A;
    for (let i = 0; i < n; i++) {
      const x = rand(A.x0 + 40, A.x1 - 40);
      this.shoot({ x, y: A.top + 10, vx: 0, vy: 380, w: 12, h: 22, life: 2.5, render: dropRender, collideWalls: true,
        attack: { mv: 0.5, kb: [120, -200] }, onWall: (pr, w) => { this.splashSmall(w, pr.cx, pr.cy); pr.dead = true; } });
    }
  }

  // 3) 아래에서 물어뜯기
  s_bite(dt, world, t) {
    const F = this.A.floor;
    const n = (this.phase >= 2 ? 4 : this.phase >= 1 ? 3 : 2) + (this.inferno ? 1 : 0);
    const warn = this.phase >= 1 ? 0.62 : 0.8;
    const per = warn + 0.16 + 0.22 + 0.5 + 0.3;
    const i = Math.floor(t / per), lt = t - i * per;
    if (i >= n) { this.goRise(this.P && this.P.cx > this.A.cx ? -1 : 1); return; }
    const p = this.P;
    if (lt < warn * 0.65 && p) this.biteX = clamp(p.cx, this.A.x0 + 60, this.A.x1 - 60);
    const bx = this.biteX ?? this.A.cx;
    this.mode = 'neck';
    if (lt < warn) {
      this.sub = true; this.invuln = true; this.harmless = true;
      this.ax = bx; this.facing = p && p.cx < bx ? -1 : 1;
      this.snap(bx, F + 170, -PI / 2);
      if (this.every(0.12, i * per, i * per + warn)) { this.ripple(bx + rand(-30, 30), 0.6); world.fx.burst('water', bx + rand(-40, 40), F - 4, 2, { speed: 120, angle: -PI / 2, spread: 0.5, color: '#d8fbff' }); }
      if (lt > warn - dt * 1.5 && !this._biteZ) {
        this._biteZ = true;
        this.zone({ x: bx - 52, y: F - 270, w: 104, h: 270, life: 0.34, mv: 1.25, kb: [300, -560] });
      }
    } else if (lt < warn + 0.16) {
      this._biteZ = false;
      if (this.sub) { this.sub = false; this.invuln = false; this.harmless = false; this.splash(world, bx, 34, 1.3); impact(world, { shake: 8, time: 0.3 }); audio.sfx('slash_heavy', { pitch: 0.7 }); }
      const e = ease.outCubic((lt - warn) / 0.16);
      this.snap(bx + this.facing * 8 * e, lerp(F + 170, F - 215, e), -PI / 2 + this.facing * 0.12);
      this.jawT = 1;
    } else if (lt < warn + 0.38) {
      this.jawT = lt < warn + 0.24 ? 1 : 0;
      if (Math.abs(lt - (warn + 0.24)) < dt) { audio.sfx('slash', { pitch: 0.6 }); world.fx.burst('hit', this.hx, this.hy - 60, 8, { color: '#ffffff' }); if (this.inferno) this.radialDrops(world, this.hx, this.hy - 40, 5); }
      this.fk = 12; this.tx = bx + this.facing * 8; this.ty = F - 205; this.ta = -PI / 2 + this.facing * 0.2;
    } else if (lt < warn + 0.88) {
      this.jawT = 0.1; this.fk = 6;
      this.tx = bx + this.facing * 30; this.ty = F - 185 + Math.sin(lt * 9) * 4; this.ta = -PI / 2 + this.facing * 0.9;
    } else {
      this.fk = 10; this.tx = bx; this.ty = F + 190; this.ta = PI / 2;
      if (lt > per - 0.08 && !this.sub) { this.sub = true; this.invuln = true; this.harmless = true; this.splash(world, bx, 16, 0.8); }
    }
  }
  radialDrops(world, x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -PI / 2 + (i - (n - 1) / 2) * 0.45;
      this.shoot({ x, y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, w: 14, h: 14, gravity: 0.6, life: 2.5, render: blobRender, attack: { mv: 0.5 },
        onWall: (pr, w) => { this.splashSmall(w, pr.cx, pr.cy); pr.dead = true; } });
    }
  }

  // 4) 해일: 뛰어넘어야 하는 파도
  s_wave(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    if (this.at(0.001)) {
      this.waveDir = p && p.cx > A.cx ? 1 : -1;                // 플레이어 반대쪽에서 몰려옴
      this.waveDir = -this.waveDir;
      this.waveDir = p ? (p.cx < A.cx ? -1 : 1) * -1 : 1;
      audio.sfx('warning', { vol: 0.6 });
    }
    const d = this.waveDir;                        // 파도 진행 방향
    const sx = d > 0 ? A.x0 : A.x1;
    const tall = this.phase >= 2;
    if (this.every(0.1, 0, 0.9)) { world.fx.burst('water', sx + d * rand(10, 70), F - 4, 4, { speed: 300, angle: -PI / 2, spread: 0.5 }); this.ripple(sx + d * 40, 0.8); }
    if (this.at(0.9)) this.spawnWave(world, sx, d, tall ? 150 : 100, 560);
    const second = this.phase >= 1 || this.inferno;
    if (second && this.at(2.0)) this.spawnWave(world, d > 0 ? A.x1 : A.x0, -d, 96, 600);
    if (t > (second ? 3.4 : 2.4)) this.goRise(p && p.cx > A.cx ? -1 : 1);
  }
  spawnWave(world, x, d, H, speed) {
    const F = this.A.floor, A = this.A;
    audio.sfx('splash', { vol: 1, pitch: 0.5 });
    impact(world, { shake: 5, time: 1.2 });
    const boss = this;
    const life = (A.w + 300) / speed;
    this.zone({
      x: x - 60, y: F - H, w: 110, h: H, warn: 0, life, mv: 1.2, kb: [520 * d, -420], z: 7,
      data: { d, H, speed, x0: x },
      tick(z, w, dt) {
        z.x += d * speed * dt;
        const cx = z.x + z.w / 2;
        if (Math.random() < 0.8) w.fx.burst('water', cx + d * 30, F - H + 10, 2, { speed: 260, angle: -PI / 2 + d * 0.5, spread: 0.7, color: '#d8fbff' });
        if (Math.random() < 0.3) w.fx.emit('smoke', cx, F - H * 0.6, { color: '#a8e4ff', alpha: 0.3, size: 26 });
        z.attack.dir = d;
      },
      paint: (ctx, z) => this.paintWave(ctx, z),
      light: (L, z) => L.add(z.cx, F - z.data.H * 0.5, 220, WATER, 0.6),
    });
  }
  paintWave(ctx, z) {
    const F = this.A.floor, { d, H } = z.data, t = this.t;
    const fx = z.x + z.w / 2 + d * 50;     // 파고 앞
    const fade = Math.min(1, (z.dur - (z.t - z.warn)) * 3);
    ctx.globalAlpha *= fade;
    ctx.translate(fx, F); ctx.scale(d, 1);
    // 뒤따르는 물 몸체
    const len = 360 + H;
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.bezierCurveTo(-len * 0.6, -H * 0.15, -H * 0.9, -H * 0.55, -H * 0.35, -H * 0.98);
    ctx.bezierCurveTo(-H * 0.05, -H * 1.12, H * 0.32, -H * 1.02, H * 0.36, -H * 0.7);
    ctx.bezierCurveTo(H * 0.18, -H * 0.82, H * 0.05, -H * 0.6, H * 0.2, -H * 0.4);
    ctx.bezierCurveTo(H * 0.3, -H * 0.2, H * 0.15, -H * 0.05, H * 0.1, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, 'rgba(160,236,255,0.92)'); g.addColorStop(0.3, 'rgba(40,140,190,0.9)'); g.addColorStop(1, 'rgba(8,40,70,0.85)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(4,14,24,0.8)'; ctx.lineWidth = 3; ctx.stroke();
    // 속 결 (가로 흐름)
    ctx.save(); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(160,240,255,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const yy = -H * (0.1 + i * 0.12);
      const off = (t * 300 + i * 70) % 140;
      for (let x = -len + off; x < H * 0.3; x += 140) { ctx.moveTo(x, yy); ctx.quadraticCurveTo(x + 30, yy - 6, x + 60, yy); }
    }
    ctx.stroke();
    // 파고 안쪽 레비아탄 실루엣 (눈빛)
    glow(ctx, -H * 0.25, -H * 0.55, H * 0.5, BIO, 0.35);
    eye(ctx, -H * 0.1, -H * 0.6, 3, '#dffcff', 0.9);
    ctx.restore();
    // 거품 마루
    ctx.fillStyle = 'rgba(235,252,255,0.95)';
    for (let i = 0; i < 9; i++) {
      const a = i / 8;
      const x = lerp(-H * 0.6, H * 0.34, a), y = -H * (0.9 + 0.12 * Math.sin(a * PI)) + Math.sin(t * 20 + i) * 3;
      ctx.beginPath(); ctx.arc(x, y, 6 + 5 * Math.sin(i * 2.3 + t * 12) ** 2, 0, TAU); ctx.fill();
    }
    glowE(ctx, H * 0.1, -H * 0.85, H * 0.6, H * 0.3, '#ffffff', 0.35);
  }

  // 5) 몸통 도약: 옆에서 솟아 플레이어 위치로 내리꽂는 아치
  s_arc(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    const n = 1 + (this.phase >= 1 ? 1 : 0) + (this.phase >= 2 || this.inferno ? 1 : 0);
    const warn = 0.75, T = 1.15, tailT = 0.9;
    const per = warn + T + tailT;
    const i = Math.floor(t / per), lt = t - i * per;
    if (i >= n) { this.mode = 'neck'; this.goRise(p && p.cx > A.cx ? -1 : 1); return; }
    if (lt < dt * 1.01 || this.arcI !== i) {
      this.arcI = i;
      const px = p ? p.cx : A.cx;
      // 시작점: 플레이어에서 먼 쪽, 끝점: 플레이어 위치
      const s0 = px > A.cx ? A.x0 + 90 : A.x1 - 90;
      let e0 = clamp(px + (px > A.cx ? 40 : -40), A.x0 + 90, A.x1 - 90);
      if (Math.abs(e0 - s0) < 420) e0 = s0 + Math.sign(e0 - s0 || 1) * 420;
      this.arcS = s0; this.arcE = clamp(e0, A.x0 + 70, A.x1 - 70);
      this.sub = true; this.invuln = true; this.harmless = true;
      this.mode = 'arc'; this.facing = Math.sign(this.arcE - this.arcS);
      this.snap(this.arcS, F + 150, -PI / 2);
      this.resetHist(this.arcS, F + 150);
      audio.sfx('warning', { vol: 0.5, pitch: 1.2 });
    }
    const S = this.arcS, E = this.arcE, d = Math.sign(E - S);
    if (lt < warn) {
      if (this.every(0.08, i * per, i * per + warn)) { world.fx.burst('water', S + rand(-30, 30), F - 4, 3, { speed: 280, angle: -PI / 2, spread: 0.5 }); this.ripple(S, 0.7); }
      this.fk = 30; this.snap(S, F + 150, -PI / 2);
      this.resetHist(S, F + 150);
    } else if (lt < warn + T) {
      const u = (lt - warn) / T;
      const apex = F - clamp(Math.abs(E - S) * 0.42, 220, 330);
      const x = lerp(S, E, u), y = (1 - u) * (1 - u) * (F + 150) + 2 * (1 - u) * u * (apex - (F + 150 - apex) * 0.95) + u * u * (F + 150);
      const u2 = Math.min(1, u + 0.01);
      const y2 = (1 - u2) * (1 - u2) * (F + 150) + 2 * (1 - u2) * u2 * (apex - (F + 150 - apex) * 0.95) + u2 * u2 * (F + 150);
      this.hx = this.tx = x; this.hy = this.ty = y;
      this.ha = this.ta = Math.atan2(y2 - y, lerp(S, E, u2) - x);
      this.jawT = u < 0.8 ? 0.7 : 0.2;
      if (this.sub && y < F) { this.sub = false; this.invuln = false; this.harmless = false; this.splash(world, S, 36, 1.4); impact(world, { shake: 7, time: 0.4 }); audio.sfx('boss_roar', { vol: 0.5, pitch: 1.3 }); }
      if (!this.sub && y > F + 10 && u > 0.5) {
        this.sub = true; this.invuln = true;
        this.splash(world, E, 40, 1.5); impact(world, { shake: 11, time: 0.4 });
        this.zone({ x: E - 80, y: F - 120, w: 160, h: 120, life: 0.18, mv: 1.3, kb: [360, -520] });
        if (this.phase >= 1 || this.inferno) this.radialDrops(world, E, F - 20, this.inferno ? 6 : 4);
      }
      if (!this.sub && this.every(0.07)) world.fx.burst('water', x, y + 20, 2, { speed: 60, angle: PI / 2, spread: 0.6 });
    } else {
      // 머리는 물속에서 되돌아가며 몸통이 끝점으로 빨려 들어감
      const u = (lt - warn - T) / tailT;
      this.hx = this.tx = E + d * 60 - d * u * 500; this.hy = this.ty = F + 150 + Math.sin(u * PI) * 20;
      this.ha = this.ta = d > 0 ? PI : 0;
      this.harmless = this.sy[N - 1] > F && this.sy[Math.floor(N / 2)] > F;
    }
  }

  // 6) 간헐천: 순차 분출 (2페이즈)
  s_geyser(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    this.fk = 6;
    this.tx = this.px0 - this.facing * 20; this.ty = this.py0 - 60;
    this.ta = this.facing > 0 ? -0.6 : PI + 0.6;
    this.jawT = t > 0.2 && t < 1.2 ? 0.9 : 0.1;
    if (this.at(0.25)) { audio.sfx('boss_roar', { vol: 0.6, pitch: 0.9 }); impact(world, { shake: 6, time: 0.6 }); }
    if (this.at(0.3)) {
      const rounds = this.phase >= 2 || this.inferno ? 2 : 1;
      const gap = 150;
      for (let r = 0; r < rounds; r++) {
        const off = (p ? p.cx : A.cx) % gap + (r ? gap / 2 : 0);
        let k = 0;
        const order = [];
        for (let x = A.x0 + 40 + ((off - A.x0) % gap + gap) % gap; x < A.x1 - 30; x += gap) order.push(x);
        if (this.facing < 0) order.reverse();
        for (const x of order) {
          if (Math.abs(x - this.ax) < 90) continue;
          this.geyser(x, 0.75 + k * 0.1 + r * 1.1);
          k++;
        }
      }
    }
    if (t > (this.phase >= 2 || this.inferno ? 3.4 : 2.4)) this.setState('idle');
  }
  geyser(x, warn) {
    const A = this.A, F = A.floor;
    const top = Math.max(A.top, F - 460);
    this.zone({
      x: x - 34, y: top, w: 68, h: F - top, warn, life: 0.6, mv: 1.1, kb: [200, -700],
      onStart: (z, w) => { w.fx.burst('water', x, F - 10, 16, { speed: 520, angle: -PI / 2, spread: 0.25 }); audio.sfx('splash', { vol: 0.7, pitch: 0.8 }); w.camera.shake(3, 0.15); this.ripple(x, 0.9); },
      tick: (z, w) => { if (!z.on && Math.random() < 0.3) w.fx.burst('water', x + rand(-20, 20), F - 4, 1, { speed: 90, angle: -PI / 2, spread: 0.3, color: '#d8fbff' }); if (z.on && Math.random() < 0.6) w.fx.burst('water', x, z.y + 20, 2, { speed: 240, angle: -PI / 2, spread: 1.2 }); },
      paint: (ctx, z) => {
        if (!z.on) { warnFloor(ctx, x, F, 90, z.k, WATER, this.t); return; }
        const grow = ease.outCubic(Math.min(1, z.a * 6)), fade = Math.min(1, (1 - z.a) * 4);
        const h = (F - z.y) * grow;
        ctx.globalAlpha *= fade;
        const g = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
        g.addColorStop(0, 'rgba(40,140,200,0.2)'); g.addColorStop(0.3, 'rgba(120,220,255,0.75)'); g.addColorStop(0.5, 'rgba(230,252,255,0.95)'); g.addColorStop(0.7, 'rgba(120,220,255,0.75)'); g.addColorStop(1, 'rgba(40,140,200,0.2)');
        ctx.fillStyle = g;
        const wv = Math.sin(this.t * 30 + x) * 4;
        ctx.beginPath(); ctx.moveTo(x - 26, F); ctx.lineTo(x - 30 + wv, F - h); ctx.lineTo(x + 30 - wv, F - h); ctx.lineTo(x + 26, F); ctx.closePath(); ctx.fill();
        glowE(ctx, x, F - h * 0.5, 60, h * 0.55, WATER, 0.5);
        ctx.fillStyle = 'rgba(240,252,255,0.9)';
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + (i - 2) * 12, F - h + Math.sin(this.t * 25 + i) * 5, 10, 0, TAU); ctx.fill(); }
      },
      light: (L, z) => { if (z.on) L.add(x, F - 150, 160, WATER, 0.6); },
    });
  }

  // 7) 꼬리 내려치기 (2페이즈)
  s_tail(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    this.fk = 6;
    this.tx = this.px0 + this.facing * 10; this.ty = this.py0 + 10;
    this.ta = this.aimAngle(0.5);
    this.jawT = 0.25;
    if (t < 0.55 && p) this.tailX = clamp(p.cx, A.x0 + 110, A.x1 - 110);
    const x = this.tailX ?? A.cx;
    const up = 0.95;
    if (t < up) {
      const e = ease.outCubic(clamp(t / 0.6, 0, 1));
      this.tail = { x: x - this.facing * 60, y: F + 60 - e * 330, a: -PI / 2 + Math.sin(t * 6) * 0.25, k: t / up, warn: true };
      if (this.every(0.1, 0, 0.3)) this.splash(world, x - this.facing * 60, 6, 0.6);
    } else if (t < up + 0.12) {
      const e = (t - up) / 0.12;
      this.tail = { x: x - this.facing * 60 + this.facing * e * 60, y: lerp(F - 270, F - 30, e * e), a: lerp(-PI / 2, -PI / 2 + this.facing * 1.4, e), k: 1, warn: false };
    } else if (t < up + 0.7) {
      this.tail = { x, y: F - 30 + (t - up - 0.12) * 200, a: -PI / 2 + this.facing * 1.4, k: 1, warn: false };
    } else this.tail = null;
    if (this.at(up)) this.zone({ x: x - 100, y: F - 170, w: 200, h: 170, warn: 0.1, life: 0.16, mv: 1.4, kb: [380, -520] });
    if (this.at(up + 0.1)) {
      this.splash(world, x, 44, 1.6);
      impact(world, { shake: 14, time: 0.45 }); audio.sfx('hit_heavy', { pitch: 0.6 });
      for (const d of [-1, 1]) this.lowWave(world, x + d * 90, d);
    }
    if (t > up + 1.2) { this.tail = null; this.setState('idle'); }
  }
  lowWave(world, x, d) {
    const F = this.A.floor;
    this.zone({
      x: x - 26, y: F - 44, w: 52, h: 44, life: 1.4, mv: 0.7, kb: [300 * d, -400], z: 7,
      tick(z, w, dt) { z.x += d * 430 * dt; if (Math.random() < 0.5) w.fx.burst('water', z.cx, F - 30, 1, { speed: 160, angle: -PI / 2 + d * 0.4, spread: 0.5 }); },
      paint: (ctx, z) => {
        const a = Math.min(1, (1 - z.a) * 4);
        ctx.globalAlpha *= a;
        ctx.translate(z.cx, F); ctx.scale(d, 1);
        ctx.beginPath(); ctx.moveTo(-90, 0); ctx.quadraticCurveTo(-30, -10, -8, -42); ctx.quadraticCurveTo(10, -50, 26, -30); ctx.quadraticCurveTo(14, -30, 20, 0); ctx.closePath();
        const g = ctx.createLinearGradient(0, -46, 0, 0); g.addColorStop(0, 'rgba(200,245,255,0.95)'); g.addColorStop(1, 'rgba(20,90,140,0.7)');
        ctx.fillStyle = g; ctx.fill();
        glow(ctx, 0, -30, 40, WATER, 0.4);
      },
    });
  }

  // ───────────── 페이즈/사망 ─────────────
  onPhase(n, world) {
    this.enrage = n;
    world.fx.burst('water', this.hx, this.hy, 30, { speed: 400 });
    if (n >= 2) world.game.toast('레비아탄이 분노로 붉게 빛난다!', '#ff7ab0');
  }
  skipTransition() { this.enrage = 0; }
  onDeath(world) {
    this.dying = 3.2;
    this.clearJobs();
    this.tail = null;
    if (this.sub || this.mode === 'arc') { this.mode = 'neck'; const pp = this.perchPos(); this.ax = pp.ax; this.facing = -this.side; this.snap(pp.x, this.A.floor - 150, this.aimAngle(0.3)); this.px0 = pp.x; this.py0 = pp.y; }
    this.sub = false;
    audio.sfx('boss_roar', { pitch: 0.7 });
    world.fx.ring(this.hx, this.hy, { color: BIO, r0: 20, r1: 300, life: 0.8, width: 10 });
  }
  dyingTick(dt, world) {
    const F = this.A.floor, d = this.dying;
    this.fk = 10;
    if (d > 1.9) {
      this.tx = this.px0 + Math.sin(this.t * 22) * 26; this.ty = F - 250 + Math.sin(this.t * 17) * 16;
      this.ta = (this.facing > 0 ? -0.9 : PI + 0.9) + Math.sin(this.t * 13) * 0.4;
      this.jawT = 1;
      if (Math.random() < 0.3) world.fx.burst('blood', this.hx, this.hy, 3, { speed: 200 });
    } else {
      this.fk = 3; this.tx = this.ax + this.facing * 40; this.ty = F + 200; this.ta = PI / 2; this.jawT = 0.6;
      if (Math.random() < 0.4) this.splash(world, this.ax + rand(-80, 80), 6, 0.8);
    }
    this.bio = clamp(d / 3.2, 0, 1);
    this.tickB(dt, world);
    if (Math.random() < 0.5) world.fx.emit('water', this.sx[randi(N)], this.sy[randi(N)], { speed: 120 });
  }

  // ───────────── 조명 ─────────────
  lightsB(L) {
    if (this.sub && this.mode !== 'arc') return;
    const b = this.bio;
    L.add(this.hx + Math.cos(this.ha) * 40, this.hy, 190, this.phase >= 2 ? BIO2 : BIO, 0.75 * b);
    for (let i = 6; i < N; i += 8) if (this.sy[i] < this.A.floor) L.add(this.sx[i], this.sy[i], 110, BIO, 0.45 * b);
    if (this.mouthGlow > 0.1) { const m = this.mouthPos(); L.add(m.x, m.y, 150, WATER, this.mouthGlow); }
  }

  // ───────────── 그리기 ─────────────
  paintBack(ctx) {
    // 얕은 수막 + 파문
    const A = this.A, F = A.floor, t = this.t;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.ripples) {
      const k = r.t / 1.6;
      ctx.strokeStyle = rgba('#9fe8ff', (1 - k) * 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, F - 1, 20 + k * 120 * r.s, 3 + k * 9 * r.s, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  paintBody(ctx, world, flash) {
    const F = this.A.floor;
    ctx.save();
    // 수면 위만 보이게 자름
    ctx.beginPath(); ctx.rect(this.A.x0 - 600, -2000, this.A.w + 1200, F + 2000 + 3); ctx.clip();
    this.paintSerpent(ctx);
    if (this.tail) this.paintTail(ctx, this.tail);
    const hvis = this.hy - 70 < F;
    if (hvis) this.paintHead(ctx, this.hx, this.hy, this.ha, this.jaw, 1);
    ctx.restore();
    if (!flash) this.paintFoam(ctx);
  }
  paintFoam(ctx) {
    const F = this.A.floor, t = this.t;
    for (let i = 0; i < N - 1; i++) {
      if ((this.sy[i] - F) * (this.sy[i + 1] - F) >= 0) continue;
      const k = (F - this.sy[i]) / (this.sy[i + 1] - this.sy[i]);
      const x = lerp(this.sx[i], this.sx[i + 1], k), r = this.sr[i] * 1.25;
      glowE(ctx, x, F - 2, r * 1.8, 12, '#bff4ff', 0.5);
      ctx.fillStyle = 'rgba(225,250,255,0.85)';
      for (let j = 0; j < 5; j++) {
        const a = j / 4 - 0.5;
        ctx.beginPath(); ctx.ellipse(x + a * r * 1.8, F - 3 - Math.abs(Math.sin(t * 9 + j * 1.7)) * 6, 7 + (j % 2) * 3, 4, 0, 0, TAU); ctx.fill();
      }
    }
  }
  paintSerpent(ctx) {
    const sx = this.sx, sy = this.sy, sa = this.sa, sr = this.sr, t = this.t;
    const F = this.A.floor;
    const bs = this.facing >= 0 ? 1 : -1;     // 배 쪽 부호
    // 보이는 범위
    let i0 = 0, i1 = N - 1;
    while (i1 > 0 && sy[i1] - sr[i1] > F + 4 && sy[i1 - 1] - sr[i1 - 1] > F + 4) i1--;
    if (i1 < 1) return;
    const bio = this.phase >= 2 ? BIO2 : BIO;
    const nx = (i) => -Math.sin(sa[i]) * bs, ny = (i) => Math.cos(sa[i]) * bs;
    // 등지느러미 (몸 뒤)
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const h = (i % 2 ? 0.55 : 1.15) * sr[i] * (0.6 + 0.4 * Math.sin(i * 0.9 + t * 3)) * (i < 3 ? 0.4 : 1);
      const bx = sx[i] - nx(i) * sr[i] * 0.8, by = sy[i] - ny(i) * sr[i] * 0.8;
      const tx = sx[i] - nx(i) * (sr[i] + h) - Math.cos(sa[i]) * 10, ty = sy[i] - ny(i) * (sr[i] + h) - Math.sin(sa[i]) * 10;
      if (i === i0) ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty); ctx.lineTo(sx[i] - nx(i) * sr[i] * 0.85 - Math.cos(sa[i]) * 8, sy[i] - ny(i) * sr[i] * 0.85 - Math.sin(sa[i]) * 8);
    }
    for (let i = i1; i >= i0; i--) ctx.lineTo(sx[i], sy[i]);
    ctx.closePath();
    ctx.fillStyle = C('rgba(24,92,96,0.92)');
    ctx.lineJoin = 'round';
    if (!R.fl) { ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.stroke(); }
    ctx.fill();
    // 지느러미 가시 (뼈)
    if (!R.fl) {
      ctx.strokeStyle = HORN_D; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = Math.max(3, i0); i <= i1; i += 2) {
        const h = 1.15 * sr[i] * (0.6 + 0.4 * Math.sin(i * 0.9 + t * 3));
        ctx.moveTo(sx[i] - nx(i) * sr[i] * 0.6, sy[i] - ny(i) * sr[i] * 0.6);
        ctx.lineTo(sx[i] - nx(i) * (sr[i] + h) - Math.cos(sa[i]) * 10, sy[i] - ny(i) * (sr[i] + h) - Math.sin(sa[i]) * 10);
      }
      ctx.stroke();
    }
    // 몸통 외곽 다각형
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx[i] + nx(i) * sr[i], sy[i] + ny(i) * sr[i]);
    const ti = i1;
    ctx.quadraticCurveTo(sx[ti] - Math.cos(sa[ti]) * sr[ti] * 1.6, sy[ti] - Math.sin(sa[ti]) * sr[ti] * 1.6, sx[ti] - nx(ti) * sr[ti], sy[ti] - ny(ti) * sr[ti]);
    for (let i = i1; i >= i0; i--) ctx.lineTo(sx[i] - nx(i) * sr[i], sy[i] - ny(i) * sr[i]);
    ctx.closePath();
    const bodyG = R.fl ? '#fff' : (() => {
      const g = ctx.createLinearGradient(0, F - 420, 0, F);
      g.addColorStop(0, '#24545a'); g.addColorStop(0.55, BODY); g.addColorStop(1, BODY_D);
      return g;
    })();
    ink(ctx, bodyG, 4);
    if (R.fl) return;
    // 배 비늘 띠
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx[i] + nx(i) * sr[i] * 0.96, sy[i] + ny(i) * sr[i] * 0.96);
    for (let i = i1; i >= i0; i--) ctx.lineTo(sx[i] + nx(i) * sr[i] * 0.3, sy[i] + ny(i) * sr[i] * 0.3);
    ctx.closePath();
    ctx.fillStyle = BELLY_D; ctx.fill();
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx[i] + nx(i) * sr[i] * 0.78, sy[i] + ny(i) * sr[i] * 0.78);
    for (let i = i1; i >= i0; i--) ctx.lineTo(sx[i] + nx(i) * sr[i] * 0.42, sy[i] + ny(i) * sr[i] * 0.42);
    ctx.closePath();
    ctx.fillStyle = BELLY; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
    // 배판 이음새
    ctx.strokeStyle = 'rgba(20,34,30,0.75)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = i0 + 1; i <= i1; i++) {
      ctx.moveTo(sx[i] + nx(i) * sr[i] * 0.95, sy[i] + ny(i) * sr[i] * 0.95);
      ctx.lineTo(sx[i] + nx(i) * sr[i] * 0.32 + Math.cos(sa[i]) * 4, sy[i] + ny(i) * sr[i] * 0.32 + Math.sin(sa[i]) * 4);
    }
    ctx.stroke();
    // 옆구리 비늘 무늬
    ctx.strokeStyle = 'rgba(4,16,20,0.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = i0 + 1; i <= i1; i++) {
      const cx = sx[i] - nx(i) * sr[i] * 0.2, cy = sy[i] - ny(i) * sr[i] * 0.2, rr = sr[i] * 0.42;
      const a = sa[i] + PI;
      ctx.moveTo(cx + Math.cos(a - 1.2) * rr, cy + Math.sin(a - 1.2) * rr);
      ctx.arc(cx, cy, rr, a - 1.2, a + 1.2);
    }
    ctx.stroke();
    // 등 하이라이트(따뜻한 키) + 차가운 림
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(120,200,190,0.28)'; ctx.lineWidth = 7;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx[i] - nx(i) * sr[i] * 0.55, sy[i] - ny(i) * sr[i] * 0.55);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,180,0.16)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx[i] - nx(i) * sr[i] * 0.62, sy[i] - ny(i) * sr[i] * 0.62);
    ctx.stroke();
    ctx.strokeStyle = rgba(bio, 0.45); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) ctx.lineTo(sx[i] - nx(i) * sr[i] * 0.95, sy[i] - ny(i) * sr[i] * 0.95);
    ctx.stroke();
    // 생물발광 점 (물결처럼 흐르는 맥동)
    const b = this.bio;
    for (let i = i0 + 1; i <= i1; i++) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5 - i * 0.55);
      const x = sx[i] - nx(i) * sr[i] * 0.18, y = sy[i] - ny(i) * sr[i] * 0.18;
      glow(ctx, x, y, sr[i] * 0.55 * (0.7 + pulse * 0.6), bio, 0.5 * b * (0.4 + pulse * 0.6));
      ctx.fillStyle = rgba('#e8ffff', 0.5 + 0.5 * pulse * b);
      ctx.beginPath(); ctx.arc(x, y, 1.6 + pulse * 1.4, 0, TAU); ctx.fill();
      if (i % 3 === 0) { ctx.beginPath(); ctx.arc(x + nx(i) * sr[i] * 0.4, y + ny(i) * sr[i] * 0.4, 1.3, 0, TAU); ctx.fill(); }
    }
  }
  paintTail(ctx, tl) {
    const F = this.A.floor;
    if (tl.warn && !R.fl) warnRect(ctx, this.tailX - 100, F - 170, 200, 170, tl.k, '#5fe8ff', this.t);
    ctx.save();
    ctx.translate(tl.x, tl.y); ctx.rotate(tl.a + PI / 2);
    // 꼬리 줄기 (아래로 수면까지)
    ctx.beginPath();
    ctx.moveTo(-16, 0); ctx.quadraticCurveTo(-22, 120, -26, 360); ctx.lineTo(26, 360); ctx.quadraticCurveTo(22, 120, 16, 0); ctx.closePath();
    ink(ctx, C(BODY), 3);
    // 지느러미 꼬리
    ctx.beginPath();
    ctx.moveTo(0, 10); ctx.bezierCurveTo(-40, -10, -90, -40, -110, -90); ctx.quadraticCurveTo(-50, -60, 0, -34);
    ctx.quadraticCurveTo(50, -60, 110, -90); ctx.bezierCurveTo(90, -40, 40, -10, 0, 10);
    ink(ctx, C('rgba(30,110,112,0.95)'), 3);
    if (!R.fl) {
      ctx.strokeStyle = HORN_D; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = -4; i <= 4; i++) { if (!i) continue; ctx.moveTo(0, -10); ctx.lineTo(i * 25, -30 - Math.abs(i) * 13); }
      ctx.stroke();
      glow(ctx, 0, -30, 60, this.phase >= 2 ? BIO2 : BIO, 0.35);
    }
    ctx.restore();
  }
  /** 머리: (x,y)=목 관절, a=주둥이 방향 */
  paintHead(ctx, x, y, a, jaw, s = 1) {
    const t = this.t, fl = R.fl;
    const bio = this.phase >= 2 ? BIO2 : BIO;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    if (Math.cos(a) < 0) ctx.scale(s, -s); else ctx.scale(s, s);
    const ja = jaw * 0.78;
    // 뿔 왕관 + 지느러미 프릴 (뒤)
    ctx.beginPath();
    ctx.moveTo(10, -24);
    ctx.bezierCurveTo(-20, -60, -50, -80, -84, -84);
    ctx.quadraticCurveTo(-50, -54, -42, -30);
    ctx.bezierCurveTo(-70, -44, -92, -40, -112, -26);
    ctx.quadraticCurveTo(-70, -16, -30, 2);
    ctx.bezierCurveTo(-60, 6, -80, 20, -96, 38);
    ctx.quadraticCurveTo(-50, 30, -6, 16);
    ctx.closePath();
    ink(ctx, C('rgba(22,86,92,0.95)'), 3);
    if (!fl) {
      ctx.strokeStyle = 'rgba(8,24,28,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const k = i / 5; ctx.moveTo(0, -10 + k * 22); ctx.lineTo(-60 - 30 * Math.sin(k * PI), -60 + k * 90); }
      ctx.stroke();
      glowE(ctx, -50, -20, 60, 40, bio, 0.25 * this.bio);
    }
    // 뿔
    const horn = (bx, by, c1x, c1y, tx, ty, w) => {
      ctx.beginPath();
      ctx.moveTo(bx - w, by); ctx.quadraticCurveTo(c1x, c1y, tx, ty); ctx.quadraticCurveTo(c1x + w * 0.5, c1y + w, bx + w, by + 2); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'lv_horn' + bx + by, bx, by, tx, ty, [0, HORN_D, 0.35, HORN, 1, '#fff8e0']), 2.2);
    };
    horn(18, -26, -10, -70, -46, -104, 7);
    horn(6, -22, -34, -50, -80, -62, 6);
    horn(28, -28, 30, -60, 10, -84, 5);
    // 아래턱
    ctx.save();
    ctx.translate(14, 8); ctx.rotate(ja);
    ctx.beginPath();
    ctx.moveTo(-8, -6); ctx.lineTo(88, -2); ctx.quadraticCurveTo(100, 0, 96, 8); ctx.quadraticCurveTo(70, 20, 30, 22); ctx.quadraticCurveTo(0, 22, -12, 10); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'lv_jaw', 0, -6, 0, 22, [0, BODY_L, 0.5, BODY, 1, BODY_D]), 3);
    if (!fl) {
      ctx.fillStyle = BELLY_D; ctx.beginPath(); ctx.moveTo(0, 12); ctx.quadraticCurveTo(50, 22, 92, 6); ctx.quadraticCurveTo(60, 14, 0, 6); ctx.fill();
      // 아래 이빨
      ctx.fillStyle = '#f2ecdc';
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const tx = 14 + i * 9; const h = 7 + (i % 3 === 1 ? 5 : 0); ctx.moveTo(tx - 3, -3); ctx.lineTo(tx, -3 - h); ctx.lineTo(tx + 3, -3); }
      ctx.fill();
    }
    ctx.restore();
    // 입 안 (벌어진 사이)
    if (jaw > 0.05) {
      ctx.beginPath();
      ctx.moveTo(14, 4); ctx.lineTo(108, 4);
      ctx.lineTo(14 + Math.cos(ja) * 88, 8 + Math.sin(ja) * 88);
      ctx.closePath();
      ctx.fillStyle = C('#2a0710'); ctx.fill();
      if (!fl) {
        glowE(ctx, 60, 12 + ja * 20, 50, 20 + ja * 30, '#7a1030', 0.5);
        if (this.mouthGlow > 0.02) { glow(ctx, 96, 8 + ja * 30, 40 + 50 * this.mouthGlow, WATER, this.mouthGlow); glow(ctx, 96, 8 + ja * 30, 18 + 12 * this.mouthGlow, '#ffffff', this.mouthGlow, true); }
      }
    }
    // 위턱/두개골
    ctx.beginPath();
    ctx.moveTo(-14, 10);
    ctx.bezierCurveTo(-18, -14, -4, -30, 20, -34);
    ctx.bezierCurveTo(44, -36, 58, -26, 86, -18);
    ctx.quadraticCurveTo(110, -12, 120, -2);
    ctx.quadraticCurveTo(122, 6, 112, 8);
    ctx.lineTo(20, 10);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'lv_skull', 0, -36, 0, 10, [0, '#3b7c7c', 0.3, '#205054', 0.75, BODY, 1, BODY_D]), 3.5);
    if (!fl) {
      // 위 이빨
      ctx.fillStyle = '#f5efe0';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const tx = 26 + i * 9; const h = 8 + (i % 3 === 0 ? 6 : 0); ctx.moveTo(tx - 3, 8); ctx.lineTo(tx + 1, 8 + h); ctx.lineTo(tx + 3, 8); }
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
      // 콧등 능선 하이라이트 (따뜻한 키라이트)
      ctx.strokeStyle = 'rgba(255,226,180,0.35)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(22, -31); ctx.bezierCurveTo(44, -33, 60, -24, 86, -16); ctx.quadraticCurveTo(104, -11, 116, -4); ctx.stroke();
      // 아래 가장자리 림라이트
      ctx.strokeStyle = rgba(bio, 0.45); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-12, 8); ctx.quadraticCurveTo(-18, -12, -2, -26); ctx.stroke();
      // 비늘 무늬
      ctx.strokeStyle = 'rgba(0,10,14,0.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const bx = 0 + i * 14, by = -12 + (i % 2) * 6; ctx.moveTo(bx - 6, by); ctx.quadraticCurveTo(bx, by - 7, bx + 6, by); }
      ctx.stroke();
      // 콧구멍
      ctx.fillStyle = '#04090b'; ctx.beginPath(); ctx.ellipse(106, -6, 5, 2, -0.3, 0, TAU); ctx.fill();
      // 아가미
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-2 + i * 7, -8); ctx.quadraticCurveTo(2 + i * 7, 0, -1 + i * 7, 8); } ctx.stroke();
      // 머리 발광 반점
      for (let i = 0; i < 5; i++) {
        const px = 4 + i * 16, py = -20 + i * 2;
        const pu = 0.5 + 0.5 * Math.sin(t * 5 - i * 0.7);
        glow(ctx, px, py, 8 + pu * 5, bio, 0.5 * this.bio);
        ctx.fillStyle = '#e8ffff'; ctx.beginPath(); ctx.arc(px, py, 1.5, 0, TAU); ctx.fill();
      }
    }
    // 눈두덩 가시
    ctx.beginPath(); ctx.moveTo(34, -30); ctx.quadraticCurveTo(40, -48, 30, -58); ctx.quadraticCurveTo(46, -44, 50, -28); ctx.closePath();
    ink(ctx, C(HORN), 2);
    // 눈
    const ex = 44, ey = -18;
    ctx.beginPath(); ctx.moveTo(ex - 11, ey + 1); ctx.quadraticCurveTo(ex, ey - 8, ex + 11, ey - 2); ctx.quadraticCurveTo(ex, ey + 5, ex - 11, ey + 1);
    ctx.fillStyle = C('#021012'); ctx.fill();
    if (!fl) {
      const ec = this.phase >= 2 ? '#ff9ac8' : '#c8fff6';
      glow(ctx, ex, ey - 1, 26, bio, 0.8 * this.bio);
      ctx.fillStyle = ec; ctx.beginPath(); ctx.moveTo(ex - 9, ey + 1); ctx.quadraticCurveTo(ex, ey - 6, ex + 9, ey - 2); ctx.quadraticCurveTo(ex, ey + 3, ex - 9, ey + 1); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillRect(ex - 1, ey - 5, 2.4, 8);
    }
    // 수염 (턱 아래로 흐름)
    if (!fl) {
      ctx.strokeStyle = 'rgba(160,230,220,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const w1 = Math.sin(t * 3 + k) * 12, w2 = Math.sin(t * 2.2 + k * 2) * 18;
        ctx.beginPath(); ctx.moveTo(96 - k * 20, 10); ctx.bezierCurveTo(70 - k * 20, 40 + w1, 20, 50 + w2, -30 - k * 20, 60 + w2 * 1.3); ctx.stroke();
        glow(ctx, -30 - k * 20, 60 + w2 * 1.3, 8, bio, 0.7 * this.bio);
      }
    }
    ctx.restore();
  }
}

const randi = (n) => Math.floor(Math.random() * n);

// 물덩이 탄
function blobRender(ctx, p) {
  const r = p.w * 0.55;
  const a = Math.atan2(p.vy, p.vx);
  glow(ctx, 0, 0, r * 3, WATER, 0.6);
  ctx.rotate(a);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.9, 0, 0, TAU);
  ctx.fillStyle = 'rgba(80,190,240,0.85)'; ctx.fill();
  ctx.strokeStyle = 'rgba(8,30,50,0.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(235,252,255,0.95)'; ctx.beginPath(); ctx.ellipse(r * 0.3, -r * 0.3, r * 0.4, r * 0.22, 0, 0, TAU); ctx.fill();
}
function dropRender(ctx, p) {
  glowE(ctx, 0, -6, 10, 22, WATER, 0.6);
  ctx.fillStyle = 'rgba(190,240,255,0.95)';
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(6, 4, 0, 8); ctx.quadraticCurveTo(-6, 4, 0, -14); ctx.fill();
}
