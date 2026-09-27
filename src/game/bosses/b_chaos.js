// 13장 보스: 혼돈의 군주 — 수많은 눈과 공허의 촉수, 부서진 왕관의 우주적 존재
// 패턴: 마안 광선(조준/격자) · 공허 촉수 · 탄막(나선/꽃잎/틈새 고리/별비) · 현실 왜곡(좌우 반전) · 옛 보스의 그림자 소환 · 글리치 순간이동
// 3페이즈(12%): 최후의 발악 '종언의 눈' — 화면이 어두워지고 거대한 탄막, 대신 코어가 크게 노출된다
import { BossB, PI, OUT, R, C, LG, RG, ink, glow, glowE, eye, warnRect, warnFloor, warnLine, warnCircle, warnBang, lineStrike, circleStrike, impact, hash, glowSprite } from './b_common.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, ease, rgba, mix, wrapAngle } from '../../core/math.js';
import { paintedRig, paintedEnabled } from '../../render/painted/registry.js';
/** 채색 리그의 그리기 도우미 (바닥 촉수) — 리그가 준비됐고 채색이 켜져 있을 때만 */
const pArt = () => (paintedEnabled() ? paintedRig('b_chaos')?.art : null) ?? null;
/** 채색 대리 개체가 이 보스를 그리는 중 (소용돌이·그림자 보스는 채색 렌더러가 그린다) */
const pLive = (b) => !!(b._painted?.proxy && !b._painted.proxy.dead);

const VOID = '#07030e', VOID_M = '#1c0a34', VIOLET = '#b060ff', VIOLET_L = '#e2c4ff', MAGENTA = '#ff3ad8', WHITE = '#ffffff';
const SHADOW_EYES = { lev: '#5fe8ff', col: '#ff9a3a', fq: '#bff4ff', death: '#7dffb0', drac: '#ff2a3a' };
const NEYE = 5;

export class ChaosLord extends BossB {
  setup() {
    const A = this.A;
    this.homeY = A.floor - 215;                // 코어 중심 높이
    this.cxT = this.cx;
    this.place(this.cx, this.homeY);
    this.eyes = [];
    for (let i = 0; i < NEYE; i++) this.eyes.push({ a: i / NEYE * TAU, r: 150, x: this.cx, y: this.cy, tx: null, ty: null, hp: 1, dead: false, open: 1, blink: rand(1, 4), look: 0, laser: null, part: { x: 0, y: 0, w: 40, h: 40, defMul: 1.2, eyeI: i } });
    for (const e of this.eyes) e.part.onHit = (part, dmg) => this.hitEye(part.eyeI, dmg);
    this.core = { x: 0, y: 0, w: 110, h: 110, defMul: 1 };
    this.shards = []; for (let i = 0; i < 12; i++) this.shards.push({ a: rand(0, TAU), r: rand(120, 190), s: rand(0.3, 0.8) * (i % 2 ? 1 : -1), z: rand(0.6, 1.2), rot: rand(0, TAU) });
    this.mouth = 0; this.mouthT = 0;
    this.third = 0; this.thirdT = 0;           // 이마의 세 번째 눈
    this.dim = 0; this.dimT = 0;               // 화면 어둠
    this.invert = 0;                            // 현실 왜곡 반전
    this.glitch = 0;
    this.shadows = [];                          // 그림자 보스 연출 {kind, x, y, t, life, ...}
    this.finaleDone = false;
    this.exposed = false;
    this.eyeHpMax = 0.035;                      // 눈 1개 체력 (보스 최대체력 비율)
  }
  setState(s) { super.setState(s); this.warpPreview = null; this.gridWarn = null; }
  debugAct(s) { const [v0, v1] = this.viewX(200); this.place(clamp(this.cx, v0, v1), this.homeY); for (const e of this.eyes) { e.x = this.cx; e.y = this.cy; } super.debugAct(s); }
  skipTransition() { if (this.phase >= 3) this.finaleDone = true; }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    world.fx.burst('magic', x, y, part?.eyeI !== undefined ? 8 : 5, { color: part?.eyeI !== undefined ? MAGENTA : VIOLET_L, speed: 240 });
    if (this.exposed && part === this.core) world.fx.burst('holy', x, y, 4, { speed: 200 });
  }
  onReset() { this.finaleDone = false; this.exposed = false; this.dimT = 0; this.thirdT = 0; this.regenEyes(); this.shadows.length = 0; }
  place(x, y) { this.x = x - this.w / 2; this.y = y - this.h / 2; }
  viewX(m = 160) {
    const cam = this.world.camera, A = this.A;
    return [Math.max(A.x0 + m, cam ? cam.x + m : A.x0 + m), Math.min(A.x1 - m, cam ? cam.x + cam.vw - m : A.x1 - m)];
  }
  hitEye(i, dmg) {
    const e = this.eyes[i];
    if (!e || e.dead) return;
    e.hp -= dmg / (this.stats.maxHp * this.eyeHpMax);
    e.open = 0.2;
    if (e.hp <= 0) {
      e.dead = true; e.laser = null;
      const w = this.world;
      w.fx.burst('dark', e.x, e.y, 16, { speed: 200 }); w.fx.burst('magic', e.x, e.y, 14, { color: VIOLET_L, speed: 260 });
      w.fx.ring(e.x, e.y, { color: VIOLET, r0: 6, r1: 70, life: 0.35, width: 4 });
      audio.sfx('enemy_die', { pitch: 0.6 });
      w.fx.text(e.x, e.y - 20, '눈 파괴!', { color: VIOLET_L, size: 18 });
    }
  }
  regenEyes() { for (const e of this.eyes) { if (e.dead) { e.dead = false; e.hp = 1; e.open = 0; e.x = this.cx; e.y = this.cy; } } }
  liveEyes() { return this.eyes.filter((e) => !e.dead); }

  // ───────────── 판정 ─────────────
  hitParts() {
    if (this.glitch > 0.6 || this.state === 'intro') return [];
    const c = this.core;
    c.x = this.cx - 55; c.y = this.cy - 70; c.defMul = this.exposed ? 0.45 : 1;
    const out = this._hp || (this._hp = []);
    out.length = 0; out.push(c);
    for (const e of this.eyes) if (!e.dead && e.open > 0.3) { e.part.x = e.x - 20; e.part.y = e.y - 20; out.push(e.part); }
    return out;
  }
  contactParts() { return this.glitch > 0.3 ? [] : [{ x: this.cx - 50, y: this.cy - 60, w: 100, h: 110 }]; }

  tickB(dt, world) {
    const k = (a, b, r) => a + (b - a) * (1 - Math.exp(-r * dt));
    this.mouth = k(this.mouth, this.mouthT, 8); this.third = k(this.third, this.thirdT, 5); this.dim = k(this.dim, this.dimT, 3);
    this.invert = Math.max(0, this.invert - dt * 0.7); this.glitch = Math.max(0, this.glitch - dt * 2.5);
    for (const s of this.shards) { s.a += s.s * dt; s.rot += dt * 2 * s.s; }
    // 떠다니는 눈: 목표 없으면 궤도
    const p = this.P;
    for (let i = 0; i < this.eyes.length; i++) {
      const e = this.eyes[i];
      e.a += dt * 0.6;
      const ox = this.cx + Math.cos(e.a) * e.r, oy = this.cy + Math.sin(e.a) * e.r * 0.55 - 20;
      const tx = e.tx ?? ox, ty = e.ty ?? oy;
      e.x = k(e.x, tx, 5); e.y = k(e.y, ty, 5);
      e.blink -= dt;
      if (e.blink <= 0) { e.blink = rand(2, 5); e.open = 0; }
      e.open = Math.min(1, e.open + dt * 3);
      if (p) e.look = Math.atan2(p.cy - e.y, p.cx - e.x);
    }
    for (let i = this.shadows.length - 1; i >= 0; i--) { const s = this.shadows[i]; s.t += dt; if (s.t >= s.life) this.shadows.splice(i, 1); }
    if (Math.random() < 0.5) world.fx.emit('dark', this.cx + rand(-90, 90), this.cy + rand(20, 110), { speed: 30, vy: 30, color: '#3a1060' });
    if (Math.random() < 0.3) world.fx.emit('magic', this.cx + rand(-140, 140), this.cy + rand(-120, 120), { color: VIOLET_L, speed: 20 });
  }
  drift(dt, rate = 0.8) {
    const p = this.P;
    const [v0, v1] = this.viewX(170);
    const want = clamp(p ? p.cx + Math.sin(this.t * 0.4) * 160 : this.cx, v0, v1);
    const k = 1 - Math.exp(-rate * dt);
    this.place(this.cx + (want - this.cx) * k, this.cy + ((this.homeY + Math.sin(this.t * 1.3) * 14) - this.cy) * k * 2);
  }

  // ───────────── 상태 ─────────────
  s_intro(dt, world, t) {
    const [v0, v1] = this.viewX(200);
    if (this.at(0.001)) { this.place(clamp(this.cx, v0, v1), this.homeY); this.glitch = 1; for (const e of this.eyes) { e.x = this.cx; e.y = this.cy; e.open = 0; } }
    this.glitch = t < 1 ? 1 : this.glitch;
    if (this.every(0.04, 0, 1.1)) { const a = rand(0, TAU), r = rand(160, 300); world.fx.emit('magic', this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, { vx: -Math.cos(a) * r * 1.6, vy: -Math.sin(a) * r * 1.6, speed: 0, grav: 0, life: 0.6, color: VIOLET_L }); }
    if (this.at(1.0)) { audio.sfx('boss_roar', { pitch: 0.35 }); audio.sfx('dark', { pitch: 0.4 }); impact(world, { shake: 14, time: 1, flash: VIOLET, fa: 0.4 }); world.fx.ring(this.cx, this.cy, { color: VIOLET, r0: 30, r1: 500, life: 0.9, width: 14 }); this.mouthT = 1; }
    if (this.at(1.9)) this.mouthT = 0.1;
    if (t > 2.2) this.setState('idle');
  }
  s_idle(dt, world, t) {
    this.drift(dt);
    this.mouthT = 0.1 + Math.sin(this.t * 2) * 0.05;
    for (const e of this.eyes) { e.tx = null; e.ty = null; }
    if (this.phase >= 3 && !this.finaleDone) { this.setState('finale'); return; }
    if (t < (this.rest ?? this.restTime(0.8))) return;
    this.rest = this.restTime(rand(0.5, 0.9));
    const ph = this.phase;
    const a = this.choose([
      ['lasers', this.liveEyes().length ? 3 : 0.5], ['grid', ph >= 1 && this.liveEyes().length >= 3 ? 2.2 : 0], ['tendrils', 2.8], ['spiral', 2.4], ['flower', 2], ['rings', 2.2], ['starfall', 1.6],
      ['warp', ph >= 1 ? 1.6 : 0], ['shadow', 3], ['blink', 1.2],
    ]);
    this.setState(a);
  }
  // 글리치 순간이동
  s_blink(dt, world, t) {
    if (this.at(0.05)) { this.glitch = 1; audio.sfx('dark', { pitch: 1.6 }); }
    if (this.at(0.3)) {
      const [v0, v1] = this.viewX(180);
      const p = this.P;
      const x = clamp(p ? p.cx + (Math.random() < 0.5 ? -1 : 1) * rand(160, 320) : this.cx, v0, v1);
      this.place(x, this.homeY + rand(-40, 20)); this.glitch = 1;
      world.fx.burst('magic', this.cx, this.cy, 20, { color: VIOLET_L, speed: 260 });
    }
    if (t > 0.7) this.setState('idle');
  }
  // 1) 마안 광선: 눈들이 흩어져 플레이어를 조준 후 순차 발사
  s_lasers(dt, world, t) {
    const p = this.P, A = this.A, F = A.floor;
    this.drift(dt, 0.5);
    const E = this.liveEyes();
    if (this.at(0.05)) {
      audio.sfx('charge_ready', { vol: 0.4, pitch: 0.6 });
      const [v0, v1] = this.viewX(60);
      E.forEach((e, i) => { e.tx = lerp(v0, v1, (i + 0.5) / E.length) + rand(-30, 30); e.ty = F - rand(300, 400); e.fireAt = 0.9 + i * 0.28; e.laser = null; });
    }
    for (const e of E) {
      if (e.fireAt === undefined) continue;
      const lt = t - (e.fireAt - 0.6);
      if (lt > 0 && lt < 0.6) {
        if (lt < 0.45 && p) e.aim = Math.atan2(p.cy - e.y, p.cx - e.x);
        e.laser = { a: e.aim, k: lt / 0.6, fire: false };
      }
      if (this.at(e.fireAt)) this.eyeBeam(world, e, e.aim, 0.35);
      if (t > e.fireAt + 0.1) e.laser = null;
    }
    const last = Math.max(0, ...E.map((e) => e.fireAt ?? 0));
    if (t > last + 0.6) { for (const e of E) { e.fireAt = undefined; e.laser = null; } this.setState('idle'); }
  }
  eyeBeam(world, e, a, life = 0.35, th = 22) {
    const A = this.A;
    const c = Math.cos(a), s = Math.sin(a);
    let L = 2200;
    if (s > 0.02) L = Math.min(L, (A.floor - e.y) / s);
    if (c > 0.02) L = Math.min(L, (A.x1 - e.x) / c);
    if (c < -0.02) L = Math.min(L, (A.x0 - e.x) / c);
    const line = { x0: e.x, y0: e.y, x1: e.x + c * L, y1: e.y + s * L, th };
    audio.sfx('thunderclap', { vol: 0.3, pitch: 1.9 }); audio.sfx('dark', { vol: 0.5, pitch: 1.3 });
    world.camera.shake(4, 0.15);
    this.zone({ x: 0, y: 0, w: 1, h: 1, life, mv: 1, element: 'dark', kb: [240, -300], line, z: 7,
      tick: (z, w) => { if (Math.random() < 0.7) w.fx.burst('magic', line.x1, line.y1, 2, { color: VIOLET_L, speed: 200 }); },
      paint: (ctx, z) => paintVoidBeam(ctx, line, z.a, this.t),
      light: (L2) => L2.add(line.x1, line.y1, 120, VIOLET, 0.7) });
  }
  // 2) 격자 광선 (70%↓): 위에서 세로 광선이 순차로 내리꽂힘
  s_grid(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    this.drift(dt, 0.4);
    const E = this.liveEyes();
    if (this.at(0.05)) {
      const [v0, v1] = this.viewX(40);
      const n = E.length;
      const gap = (v1 - v0) / n;
      const off = rand(0, gap * 0.5);
      E.forEach((e, i) => { e.tx = v0 + off + gap * (i + 0.5); e.ty = Math.max(A.top + 40, F - 440); });
      this.gridT = [0.9, 1.9, 2.9];
      audio.sfx('warning', { vol: 0.4 });
    }
    for (let r = 0; r < 3; r++) {
      const t0 = 0.9 + r * 1.0;
      E.forEach((e, i) => {
        const on = (i + r) % 2 === 0;
        if (!on) return;
        if (t > t0 - 0.6 && t < t0) e.laser = { a: PI / 2, k: (t - (t0 - 0.6)) / 0.6, fire: false };
        if (this.at(t0)) { e.laser = null; this.eyeBeam(world, e, PI / 2, 0.4, 34); }
      });
      // 다음 라운드를 위해 눈 조금 이동
      if (this.at(t0 + 0.45)) E.forEach((e) => { e.tx += (r % 2 ? -1 : 1) * 40; });
    }
    if (t > 3.6) { for (const e of E) e.laser = null; this.setState('idle'); }
  }
  // 3) 공허 촉수 (바닥 균열에서 솟구침)
  s_tendrils(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    this.drift(dt, 0.5);
    this.mouthT = 0.6;
    if (this.at(0.1)) {
      audio.sfx('dark', { pitch: 0.5 });
      const px = p ? p.cx : this.cx;
      const n = this.phase >= 2 ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const x = clamp(px + (i - (n - 1) / 2) * 120 + rand(-20, 20), A.x0 + 30, A.x1 - 30);
        this.tendril(x, 0.7 + Math.abs(i - (n - 1) / 2) * 0.12, i);
      }
      if (this.phase >= 1 || this.inferno) for (let i = 0; i < 4; i++) this.tendril(clamp(px + (i - 1.5) * 120 + 60, A.x0 + 30, A.x1 - 30), 1.9 + i * 0.1, i + 10);
    }
    if (t > (this.phase >= 1 ? 3.1 : 2.1)) this.setState('idle');
  }
  tendril(x, warn, seed) {
    const F = this.A.floor, H = 250;
    this.zone({
      x: x - 22, y: F - H, w: 44, h: H, warn, life: 0.8, mv: 1.05, element: 'dark', kb: [200, -600], z: 6,
      onStart: (z, w) => { w.fx.burst('dark', x, F - 10, 10, { speed: 220, angle: -PI / 2, spread: 0.6 }); audio.sfx('whip', { vol: 0.4, pitch: 0.5 }); w.camera.shake(2, 0.1); },
      paint: (ctx, z) => {
        if (!z.on) { warnFloor(ctx, x, F, 70, z.k, MAGENTA, this.t); return; }
        const g = z.a < 0.2 ? ease.outBack(z.a / 0.2) : z.a > 0.75 ? 1 - (z.a - 0.75) / 0.25 : 1;
        if (!pArt()?.tendril(ctx, x, F, H * g, 22, this.t, seed)) paintTentacle(ctx, x, F, H * g, 22, this.t, seed);   // 채색 촉수
      },
      light: (L, z) => { if (z.on) L.add(x, F - 100, 110, VIOLET, 0.5); },
    });
  }
  // 4) 탄막: 나선
  s_spiral(dt, world, t) {
    this.drift(dt, 0.3); this.mouthT = 1;
    const dur = 3.0, arms = this.phase >= 2 ? 4 : 3;
    if (this.at(0.05)) audio.sfx('magic', { pitch: 0.5 });
    if (this.every(this.inferno ? 0.08 : 0.11, 0.4, dur)) {
      const dir = this.phase >= 1 ? (Math.floor(this.st / 1.2) % 2 ? -1 : 1) : 1;
      for (let i = 0; i < arms; i++) { const a = this.st * 1.7 * dir + i / arms * TAU; this.orb(this.cx, this.cy + 10, a, 230, i % 2 ? MAGENTA : VIOLET); }
    }
    if (t > dur + 0.4) this.setState('idle');
  }
  // 5) 탄막: 꽃잎 (교차 속도 링)
  s_flower(dt, world, t) {
    this.drift(dt, 0.3); this.mouthT = 0.8;
    const bursts = this.phase >= 2 ? 5 : 4;
    for (let b = 0; b < bursts; b++) {
      if (this.at(0.4 + b * 0.55)) {
        const n = 18, off = b % 2 ? PI / n : 0;
        for (let i = 0; i < n; i++) { const a = off + i / n * TAU; this.orb(this.cx, this.cy + 10, a, i % 2 ? 170 : 250, i % 2 ? VIOLET : MAGENTA); }
        audio.sfx('magic', { vol: 0.5, pitch: 1.2 + b * 0.1 });
      }
    }
    if (t > 0.6 + bursts * 0.55) this.setState('idle');
  }
  // 6) 탄막: 틈새 고리 (플레이어 방향에 좁은 틈 → 그 틈으로 피해야)
  s_rings(dt, world, t) {
    const p = this.P;
    this.drift(dt, 0.3); this.mouthT = 0.7;
    const n = this.phase >= 1 ? 4 : 3;
    for (let r = 0; r < n; r++) {
      if (this.at(0.4 + r * 0.7)) {
        const aim = p ? Math.atan2(p.cy - this.cy, p.cx - this.cx) + rand(-0.5, 0.5) : 0;
        const cnt = 30;
        for (let i = 0; i < cnt; i++) { const a = aim + i / cnt * TAU; if (Math.abs(wrapAngle(a - aim)) < 0.3) continue; this.orb(this.cx, this.cy + 10, a, 200, VIOLET_L); }
        audio.sfx('dark', { vol: 0.5, pitch: 1.5 });
        world.fx.ring(this.cx, this.cy, { color: VIOLET, r0: 20, r1: 120, life: 0.3, width: 5 });
      }
    }
    if (t > 0.8 + n * 0.7) this.setState('idle');
  }
  // 7) 별비: 하늘에서 공허의 별이 쏟아짐
  s_starfall(dt, world, t) {
    const A = this.A, p = this.P;
    this.drift(dt, 0.5); this.mouthT = 0.5;
    const dur = 2.6;
    if (this.at(0.05)) audio.sfx('magic', { pitch: 0.7 });
    if (this.every(this.phase >= 2 ? 0.1 : 0.14, 0.3, dur)) {
      const [v0, v1] = this.viewX(20);
      const x = rand(v0, v1);
      this.shoot({ x, y: Math.max(A.top + 10, A.floor - 560), vx: rand(-40, 40), vy: rand(260, 360), w: 16, h: 16, life: 3, render: starRender, attack: { mv: 0.55, element: 'dark' }, collideWalls: true, onWall: (pr, w) => { w.fx.burst('magic', pr.cx, pr.cy, 5, { color: VIOLET_L, speed: 120 }); pr.dead = true; } });
    }
    if (t > dur + 0.3) this.setState('idle');
  }
  orb(x, y, a, sp, col) {
    return this.shoot({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 14, h: 14, life: 4.5, render: col === MAGENTA ? orbMag : col === VIOLET_L ? orbPale : orbVio, attack: { mv: 0.5, element: 'dark' }, collideWalls: true });
  }
  // 8) 현실 왜곡 (70%↓): 경고 후 플레이어 위치 좌우 반전 + 화면 반전
  s_warp(dt, world, t) {
    const A = this.A, p = this.P;
    this.drift(dt, 0.3); this.mouthT = 1; this.thirdT = 0.6;
    if (this.at(0.05)) { audio.sfx('warning', { vol: 0.6, pitch: 0.7 }); world.game.toast('현실이 뒤틀린다!', MAGENTA); }
    if (t < 1.1 && p) this.warpPreview = { x: A.x0 + A.x1 - p.cx, y: p.cy, k: t / 1.1 };
    if (this.at(1.1) && p && !p.dead) {
      const nx = A.x0 + A.x1 - p.cx;
      p.x = clamp(nx - p.w / 2, A.x0, A.x1 - p.w);
      p.iframes = Math.max(p.iframes ?? 0, 0.5);
      this.warpPreview = null;
      this.invert = 1; this.glitch = 0.8;
      world.game.flash('#ffffff', 0.6, 5); impact(world, { shake: 10, time: 0.4 });
      audio.sfx('thunderclap', { pitch: 0.5 }); audio.sfx('dark', { pitch: 0.3 });
      // 적 탄도 거울처럼 반전
      for (const e of world.entities) if (e.kind === 'projectile' && e.team === 'enemy') { e.x = A.x0 + A.x1 - e.cx - e.w / 2; e.vx = -e.vx; }
      this.place(A.x0 + A.x1 - this.cx, this.cy);
    }
    if (t > 1.1 && this.every(0.25, 1.2, 2.2)) { const a = rand(0, TAU); for (let i = 0; i < 8; i++) this.orb(this.cx, this.cy, a + i / 8 * TAU, 180, MAGENTA); }
    if (t > 2.6) { this.thirdT = 0; this.setState('idle'); }
  }
  // 9) 그림자 소환: 쓰러뜨린 보스들의 잔영이 필살기를 재현
  s_shadow(dt, world, t) {
    this.drift(dt, 0.4); this.mouthT = 0.9; this.thirdT = 0.4;
    if (this.at(0.05)) {
      const kinds = ['lev', 'col', 'fq', 'death', 'drac'].filter((k) => k !== this.lastShadow);
      const n = this.phase >= 2 || this.inferno ? 2 : 1;
      const pickd = [];
      while (pickd.length < n && kinds.length) pickd.push(kinds.splice(Math.floor(Math.random() * kinds.length), 1)[0]);
      this.lastShadow = pickd[0];
      pickd.forEach((k, i) => this.later(i * 0.9, () => this.summonShadow(world, k)));
      audio.sfx('ghost', { pitch: 0.5 });
      world.game.toast(`${SHADOW_NAMES[pickd[0]]}의 그림자가 깨어난다…`, VIOLET_L, 1.6);
    }
    if (t > (this.phase >= 2 || this.inferno ? 3.6 : 2.8)) { this.thirdT = 0; this.setState('idle'); }
  }
  summonShadow(world, kind) {
    const A = this.A, F = A.floor, p = this.P;
    const px = p ? p.cx : A.cx;
    const [v0, v1] = this.viewX(80);
    if (kind === 'lev') {
      // 레비아탄: 발밑에서 솟구치는 물어뜯기 ×2
      for (let k = 0; k < 2; k++) this.later(k * 0.85, () => {
        const x = clamp(this.P ? this.P.cx : px, A.x0 + 60, A.x1 - 60);
        this.shadows.push({ kind, x, y: F, t: 0, life: 1.3, warn: 0.7 });
        this.zone({ x: x - 50, y: F - 250, w: 100, h: 250, warn: 0.7, life: 0.35, mv: 1.1, element: 'dark', kb: [260, -600],
          onStart: (z, w) => { w.fx.burst('magic', x, F - 10, 16, { color: SHADOW_EYES.lev, speed: 300, angle: -PI / 2, spread: 0.6 }); w.camera.shake(5, 0.2); audio.sfx('splash', { vol: 0.6, pitch: 0.6 }); },
          paint: (ctx, z) => { if (!z.on) warnFloor(ctx, x, F, 110, z.k, SHADOW_EYES.lev, this.t); } });
      });
    } else if (kind === 'col') {
      // 태엽 거신: 하늘에서 거대한 톱니 주먹 + 충격파
      const x = clamp(px, A.x0 + 80, A.x1 - 80);
      this.shadows.push({ kind, x, y: F, t: 0, life: 1.8, warn: 0.9 });
      this.zone({ x: x - 70, y: F - 140, w: 140, h: 140, warn: 0.9, life: 0.15, mv: 1.3, element: 'dark', kb: [300, -600],
        onStart: (z, w) => { impact(w, { shake: 14, time: 0.4 }); audio.sfx('explode', { pitch: 0.6 }); w.fx.burst('dust', x, F - 6, 20, { speed: 300, angle: -PI / 2, spread: 1.4 }); for (const d of [-1, 1]) this.voidWave(x + d * 70, d); },
        paint: (ctx, z) => { if (!z.on) warnRect(ctx, x - 70, F - 140, 140, 140, z.k, SHADOW_EYES.col, this.t); } });
    } else if (kind === 'fq') {
      // 서리 여왕: 위쪽에 나타나 고드름 비
      const x = clamp(px, v0, v1);
      this.shadows.push({ kind, x, y: F - 380, t: 0, life: 2.2, warn: 0.5 });
      for (let i = 0; i < 8; i++) {
        const ix = clamp(px + (i - 3.5) * 95 + rand(-20, 20), A.x0 + 20, A.x1 - 20);
        const st = { y: F - 420, vy: 0 };
        this.zone({ x: ix - 10, y: F - 60, w: 20, h: 50, warn: 0.7 + (i % 4) * 0.12, life: 1.4, mv: 0.8, element: 'dark', kb: [150, -300],
          tick: (z, w, dt) => { if (z.t < z.warn) return; st.vy += 2600 * dt; st.y += st.vy * dt; z.y = st.y - 44; z.h = 44; if (st.y >= F) { w.fx.burst('magic', ix, F - 6, 8, { color: SHADOW_EYES.fq, speed: 200 }); z.dur = z.t - z.warn; } },
          paint: (ctx, z) => { if (z.t < z.warn) { warnLine(ctx, ix, F - 420, ix, F, z.k * 0.6, SHADOW_EYES.fq, 1); return; } drawShadowIcicle(ctx, ix, st.y); } });
      }
    } else if (kind === 'death') {
      // 사신: 거대한 그림자 낫이 바닥을 휩쓴다 (점프)
      const d = px > A.cx ? -1 : 1;
      const st = { x: d > 0 ? A.x0 - 160 : A.x1 + 160 };
      this.shadows.push({ kind, x: st.x, y: F - 30, t: 0, life: 2.2, warn: 0.9, d, st });
      const hb = { x: 0, y: F - 60, w: 150, h: 60 };
      this.zone({ x: 0, y: 0, w: 1, h: 1, warn: 0.9, life: (A.w + 320) / 1300, mv: 1.3, element: 'dark', kb: [480 * d, -420],
        rects: () => { hb.x = st.x - 75; return [hb]; },
        tick: (z, w, dt) => { if (z.on) st.x += d * 1300 * dt; },
        onStart: () => audio.sfx('slash_heavy', { pitch: 0.4 }),
        paint: (ctx, z) => { if (!z.on) warnRect(ctx, A.x0, F - 60, A.w, 60, z.k, SHADOW_EYES.death, this.t); } });
    } else if (kind === 'drac') {
      // 드라큘라: 옆에 나타나 헬파이어 3연발 ×2
      const x = px > (v0 + v1) / 2 ? v0 + 30 : v1 - 30;
      this.shadows.push({ kind, x, y: F, t: 0, life: 2.4, warn: 0.5, f: px > x ? 1 : -1 });
      for (let k = 0; k < 2; k++) this.later(0.6 + k * 0.7, () => {
        const pl = this.P, sx = x, sy = F - 90;
        const aim = pl ? Math.atan2(pl.cy - sy, pl.cx - sx) : 0;
        for (let i = -1; i <= 1; i++) { const a = aim + i * 0.22; this.shoot({ x: sx, y: sy, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, w: 20, h: 20, life: 3.5, render: voidFireRender, trail: 'dark', trailRate: 0.05, attack: { mv: 0.8, element: 'dark' } }); }
        audio.sfx('fire', { pitch: 0.6 });
      });
    }
  }
  voidWave(x, d) {
    const F = this.A.floor, H = 46;
    this.zone({ x: x - 22, y: F - H, w: 44, h: H, life: 1.3, mv: 0.9, element: 'dark', kb: [300 * d, -440], z: 7,
      tick: (z, w, dt) => { z.x += d * 500 * dt; if (Math.random() < 0.7) w.fx.emit('magic', z.cx, F - rand(4, H), { color: VIOLET_L, speed: 60 }); },
      paint: (ctx, z) => { const a = Math.min(1, (1 - z.a) * 3); ctx.globalAlpha *= a; ctx.translate(z.cx, F); ctx.scale(d, 1); glowE(ctx, 0, -H * 0.5, 40, H * 0.8, VIOLET, 0.7); ctx.fillStyle = 'rgba(30,8,60,0.9)'; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.quadraticCurveTo(-10, -H * 0.4, 4, -H); ctx.quadraticCurveTo(14, -H * 0.4, 22, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = VIOLET_L; ctx.lineWidth = 2; ctx.stroke(); } });
  }

  // ───────────── 최후의 발악 (12%) ─────────────
  s_finale(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    const dur = 8.5;
    if (this.at(0.001)) {
      this.finaleDone = true;
      this.clearJobs();
      for (const e of world.entities) if (e.kind === 'projectile' && e.team === 'enemy') e.dead = true;
      audio.sfx('boss_roar', { pitch: 0.3 }); audio.sfx('thunderclap', { pitch: 0.4 });
      impact(world, { shake: 18, time: 1.5, flash: '#ffffff', fa: 0.7 });
      world.banner = { text: '종언의 눈', sub: '혼돈의 군주가 마지막 힘을 해방한다!', t: 2.6, color: MAGENTA, big: true };
      this.regenEyes();
    }
    const [v0, v1] = this.viewX(200);
    const cx = (v0 + v1) / 2;
    this.place(this.cx + (cx - this.cx) * Math.min(1, dt * 2), this.cy + ((F - 270) - this.cy) * Math.min(1, dt * 2));
    this.dimT = t < dur ? 0.62 : 0; this.thirdT = t < dur ? 1 : 0; this.mouthT = 1;
    this.exposed = t > 1.2 && t < dur + 1.5;
    // 눈: 네 모서리로 흩어져 교차 광선
    const E = this.liveEyes();
    E.forEach((e, i) => { const a = i / E.length * TAU + t * 0.5; e.tx = this.cx + Math.cos(a) * 260; e.ty = this.cy + Math.sin(a) * 140; });
    if (t > 1.5 && t < dur) {
      if (this.every(this.inferno ? 0.12 : 0.15, 1.5, dur)) for (let k = 0; k < 2; k++) { const a = this.st * 1.3 + k * PI; this.orb(this.cx, this.cy, a, 210, MAGENTA); if (k === 0 || this.inferno) this.orb(this.cx, this.cy, -a * 0.8 + PI / 2, 170, VIOLET); }
      if (this.every(1.6, 2.2, dur - 0.5)) {
        const aim = p ? Math.atan2(p.cy - this.cy, p.cx - this.cx) : PI / 2;
        for (let i = 0; i < 28; i++) { const a = aim + i / 28 * TAU; if (Math.abs(wrapAngle(a - aim)) < 0.32) continue; this.orb(this.cx, this.cy, a, 250, VIOLET_L); }
        audio.sfx('dark', { vol: 0.6, pitch: 1.4 });
      }
      if (this.every(2.1, 3.0, dur - 0.5)) {
        E.forEach((e, i) => { if (i % 2 === Math.floor(this.st / 2.1) % 2) { const a = p ? Math.atan2(p.cy - e.y, p.cx - e.x) : PI / 2; e.laser = { a, k: 0, fire: false }; e.aimFin = a; this.later(0.55, () => { e.laser = null; if (!e.dead) this.eyeBeam(world, e, e.aimFin, 0.3); }); } });
      }
      if (this.every(1.9, 2.6, dur - 0.5) && p) this.tendril(clamp(p.cx, A.x0 + 30, A.x1 - 30), 0.6, 99);
      if (this.every(0.07, 1.5, dur)) E.forEach((e) => { if (e.laser) e.laser.k = Math.min(1, e.laser.k + 0.13); });
    }
    if (this.at(dur)) { world.game.toast('혼돈의 군주가 지쳐 코어가 드러났다!', VIOLET_L); audio.sfx('mist', { pitch: 0.5 }); }
    if (t > dur && t < dur + 1.6) { this.place(this.cx, this.cy + (F - 200 - this.cy) * Math.min(1, dt * 2)); this.mouthT = 0.3; }
    if (t > dur + 1.6) { this.exposed = false; this.setState('idle'); }
  }

  // ───────────── 페이즈/사망 ─────────────
  onPhase(n, world) {
    this.regenEyes();
    world.fx.ring(this.cx, this.cy, { color: MAGENTA, r0: 30, r1: 420, life: 0.8, width: 10 });
    this.glitch = 1;
    if (n === 1) world.game.toast('혼돈의 군주: "현실은 나의 꿈에 불과하다."', VIOLET_L);
    if (n === 2) world.game.toast('혼돈의 군주: "모든 것이 처음으로 돌아가리라."', VIOLET_L);
  }
  onDeath(world) {
    this.dying = 3.8; this.clearJobs(); this.exposed = false; this.dimT = 0.4; this.thirdT = 1; this.mouthT = 1;
    for (const e of world.entities) if ((e.kind === 'projectile' && e.team === 'enemy') || e.kind === 'hazard') e.dead = true;
    world.game.toast('혼돈의 군주: "빛이… 이토록… 눈부실 줄이야…"', VIOLET_L, 3.4);
    audio.sfx('boss_roar', { pitch: 0.3 });
  }
  dyingTick(dt, world) {
    const d = this.dying;
    this.tickB(dt, world);
    this.x += Math.sin(this.t * 70) * 1.2;
    this.glitch = Math.max(this.glitch, Math.random() < 0.2 ? 0.8 : 0);
    // 눈이 하나씩 터짐
    const alive = this.eyes.filter((e) => !e.dead);
    if (alive.length && Math.random() < dt * 3) this.hitEye(this.eyes.indexOf(alive[0]), 1e9);
    if (Math.random() < 0.6) world.fx.emit('magic', this.cx + rand(-120, 120), this.cy + rand(-120, 120), { vx: 0, vy: 0, speed: 200, color: Math.random() < 0.5 ? WHITE : VIOLET_L });
    if (d < 1.2 && !this._implode) {
      this._implode = true;
      world.fx.flash(this.cx, this.cy, { color: '#ffffff', size: 700, life: 0.6 });
      world.fx.ring(this.cx, this.cy, { color: WHITE, r0: 10, r1: 800, life: 1.0, width: 20 });
      world.fx.ring(this.cx, this.cy, { color: VIOLET, r0: 10, r1: 600, life: 0.8, width: 12 });
      world.fx.burst('magic', this.cx, this.cy, 80, { color: VIOLET_L, speed: 560 });
      impact(world, { shake: 26, time: 1.2 }); this.lightning(1);
      audio.sfx('explode', { pitch: 0.35 }); audio.sfx('thunderclap', { pitch: 0.4 });
      this.dimT = 0;
    }
  }

  // ───────────── 조명 ─────────────
  lightsB(L) {
    if (this.glitch > 0.9) return;
    L.add(this.cx, this.cy, 300, VIOLET, 0.8);
    L.add(this.cx, this.cy - 30, 140, MAGENTA, 0.5 + this.mouth * 0.4);
    for (const e of this.eyes) if (!e.dead) L.add(e.x, e.y, 70, VIOLET_L, 0.45);
  }

  // ───────────── 그리기 ─────────────
  paintBack(ctx) {
    const cam = this.world.camera, t = this.t, A = this.A, F = A.floor;
    if (R.fl) return;
    // 화면 어둠 (종언)
    if (this.dim > 0.01) { ctx.fillStyle = `rgba(4,0,10,${this.dim})`; ctx.fillRect(cam.x - 20, cam.y - 20, cam.vw + 40, cam.vh + 40); }
    // 현실 반전
    if (this.invert > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.invert * 1.3)})`; ctx.fillRect(cam.x - 20, cam.y - 20, cam.vw + 40, cam.vh + 40);
      ctx.restore();
    }
    // 우주 소용돌이 (몸 뒤) — 채색 렌더러가 붙어 있으면 그쪽이 그린다
    const x = this.cx, y = this.cy;
    if (!pLive(this)) {
    ctx.save();
    ctx.translate(x, y);
    const r = 230 + Math.sin(t * 1.3) * 8;
    const g = ctx.createRadialGradient(0, 0, 20, 0, 0, r);
    g.addColorStop(0, 'rgba(2,0,6,0.97)'); g.addColorStop(0.55, 'rgba(14,4,30,0.8)'); g.addColorStop(0.82, 'rgba(120,40,200,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = rgba(i % 2 ? MAGENTA : VIOLET, 0.22); ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) { const u = k / 20; const a = t * 0.6 + i / 5 * TAU + u * 3; const rr = 40 + u * 190; if (k) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); }
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i++) { const a = hash(i) * TAU + t * 0.1 * (hash(i + 5) - 0.5), rr = 40 + hash(i + 3) * 190; ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i)); ctx.fillRect(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, 1.6, 1.6); }
    ctx.restore();
    }
    // 레이저 예고선
    for (const e of this.eyes) if (e.laser && !e.dead) {
      const L = 1800; warnLine(ctx, e.x, e.y, e.x + Math.cos(e.laser.a) * L, e.y + Math.sin(e.laser.a) * L, e.laser.k, MAGENTA, 1.2);
    }
    // 현실 왜곡 예고: 반전될 위치의 잔상
    if (this.warpPreview) {
      const w = this.warpPreview;
      ctx.save(); ctx.globalAlpha = 0.25 + 0.5 * w.k;
      warnCircle(ctx, w.x, w.y, 40, w.k, MAGENTA, t);
      ctx.restore();
      warnBang(ctx, w.x, w.y - 70, 18, 0.5 + 0.5 * Math.sin(t * 20));
    }
    // 그림자 보스들
    if (!pLive(this)) for (const s of this.shadows) this.paintShadow(ctx, s);   // 채색이면 렌더러가 그림자 보스를 그린다
  }
  paintBody(ctx) {
    const t = this.t, fl = R.fl;
    if (this.glitch > 0 && !fl) {
      // 글리치: 가로 조각 어긋남 + 색 분리
      ctx.save();
      const g = this.glitch;
      for (let i = 0; i < 6; i++) {
        const y0 = this.cy - 150 + i * 50;
        ctx.save(); ctx.beginPath(); ctx.rect(this.cx - 250, y0, 500, 50); ctx.clip();
        ctx.translate((hash(i + Math.floor(t * 20)) - 0.5) * 60 * g, 0);
        ctx.globalAlpha *= 1 - g * 0.5;
        this.drawLord(ctx, t);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 * g;
      ctx.translate(8 * g, 0); this.drawLord(ctx, t, '#ff2080');
      ctx.translate(-16 * g, 0); this.drawLord(ctx, t, '#20a0ff');
      ctx.restore();
    } else this.drawLord(ctx, t);
    // 떠다니는 눈
    for (const e of this.eyes) if (!e.dead) drawEyeOrb(ctx, e, t, fl);
  }
  drawLord(ctx, t, tint = null) {
    const fl = R.fl || !!tint;
    const col = (c) => (tint ? tint : C(c));
    const x = this.cx, y = this.cy;
    ctx.save(); ctx.translate(x, y);
    // 공허 망토 촉수 (아래로 흐름)
    for (let i = 0; i < 7; i++) {
      const a = PI / 2 + (i - 3) * 0.32;
      const L = 130 + (i % 2) * 40;
      const sw = Math.sin(t * 1.8 + i * 1.3) * 18;
      ctx.beginPath();
      const bx = Math.cos(a) * 30, by = 30 + Math.sin(a) * 10;
      const ex = Math.cos(a) * L * 0.7 + sw, ey = by + L;
      ctx.moveTo(bx - 12, by); ctx.quadraticCurveTo(bx + sw * 0.5 - 16, by + L * 0.5, ex, ey); ctx.quadraticCurveTo(bx + sw * 0.5 + 16, by + L * 0.5, bx + 12, by); ctx.closePath();
      ctx.fillStyle = tint || (R.fl ? '#fff' : LG(ctx, 'ch_tent', 0, 20, 0, 190, [0, VOID, 0.6, VOID_M, 1, 'rgba(120,40,200,0.3)'])); ctx.fill();
      if (!fl) { ctx.strokeStyle = rgba(VIOLET, 0.55); ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    // 몸통 덩어리 (가시 돋친 어둠)
    ctx.beginPath();
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const a = PI * 0.15 + i / n * PI * 0.7;
      const rr = 76 + (i % 2 ? 10 : 22) + Math.sin(t * 3 + i) * 4;
      const px = Math.cos(a) * rr * 1.25, py = Math.sin(a) * rr * 0.9 + 16;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.lineTo(-96, -10); ctx.quadraticCurveTo(0, -40, 96, -10); ctx.closePath();
    ctx.fillStyle = tint || (R.fl ? '#fff' : RG(ctx, 'ch_body2', 0, -10, 10, 0, 20, 130, [0, '#24104a', 0.5, '#0c0418', 1, VOID])); ctx.fill();
    if (!fl) { ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(VIOLET, 0.45); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
    // 머리: 각진 크리스털 두개
    ctx.beginPath();
    ctx.moveTo(-70, 10); ctx.lineTo(-86, -30); ctx.lineTo(-60, -70); ctx.lineTo(-30, -96); ctx.lineTo(0, -104); ctx.lineTo(30, -96); ctx.lineTo(60, -70); ctx.lineTo(86, -30); ctx.lineTo(70, 10); ctx.lineTo(30, 34); ctx.lineTo(0, 40); ctx.lineTo(-30, 34); ctx.closePath();
    ctx.fillStyle = tint || (R.fl ? '#fff' : LG(ctx, 'ch_head2', -86, -100, 86, 40, [0, '#3a1668', 0.25, '#12061f', 0.7, '#05020a', 1, '#24104a'])); ctx.fill();
    if (!fl) {
      ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.stroke();
      // 역광 테두리 (밝은 보라 림라이트)
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(VIOLET_L, 0.55); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-70, 10); ctx.lineTo(-86, -30); ctx.lineTo(-60, -70); ctx.lineTo(-30, -96); ctx.lineTo(0, -104); ctx.lineTo(30, -96); ctx.lineTo(60, -70); ctx.lineTo(86, -30); ctx.lineTo(70, 10); ctx.stroke();
      ctx.restore();
      // 면 분할 (결정면)
      ctx.strokeStyle = 'rgba(160,100,255,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-60, -70); ctx.lineTo(-20, -30); ctx.lineTo(0, -104); ctx.moveTo(60, -70); ctx.lineTo(20, -30); ctx.lineTo(0, -104); ctx.moveTo(-86, -30); ctx.lineTo(-40, -10); ctx.moveTo(86, -30); ctx.lineTo(40, -10); ctx.stroke();
      // 빛나는 균열
      const pu = 0.6 + 0.4 * Math.sin(t * 4);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(MAGENTA, 0.7 * pu); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-50, -60); ctx.lineTo(-40, -44); ctx.lineTo(-52, -30); ctx.moveTo(48, -64); ctx.lineTo(36, -50); ctx.lineTo(46, -36); ctx.lineTo(38, -20); ctx.stroke();
      ctx.restore();
    }
    // 부서진 왕관 (가시 몇 개는 떨어져 떠 있음)
    for (let i = 0; i < 9; i++) {
      const u = i / 8 - 0.5;
      const bx = u * 140, by = -96 + Math.abs(u) * 60;
      const h = (i === 4 ? 70 : 40 + (i % 3) * 12) * (1 - Math.abs(u) * 0.5);
      const broken = i === 2 || i === 6;
      const lift = broken ? 14 + Math.sin(t * 2 + i) * 5 : 0;
      ctx.save(); ctx.translate(bx, by - lift); ctx.rotate(u * 0.8 + (broken ? Math.sin(t + i) * 0.2 : 0));
      ctx.beginPath(); ctx.moveTo(-8, 4); ctx.lineTo(-2, -h); ctx.lineTo(3, -h * 0.7); ctx.lineTo(8, 4); ctx.closePath();
      ctx.fillStyle = tint || (R.fl ? '#fff' : LG(ctx, 'ch_crown' + Math.round(h), 0, -h, 0, 4, [0, '#e2c4ff', 0.3, '#6a30b0', 1, '#0a0418'])); ctx.fill();
      if (!fl) { ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.restore();
    }
    // 눈 (양쪽 큰 눈) + 이마의 세 번째 눈
    if (!fl) {
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(s * 18, -44); ctx.lineTo(s * 58, -58); ctx.lineTo(s * 52, -36); ctx.lineTo(s * 22, -32); ctx.closePath(); ctx.fill();
        glow(ctx, s * 40, -44, 34, VIOLET, 0.9); glow(ctx, s * 40, -44, 12, WHITE, 1, true);
        ctx.fillStyle = '#f4e8ff'; ctx.beginPath(); ctx.moveTo(s * 26, -42); ctx.lineTo(s * 52, -52); ctx.lineTo(s * 48, -40); ctx.closePath(); ctx.fill();
      }
      const te = this.third;
      if (te > 0.02) {
        ctx.save(); ctx.translate(0, -76); ctx.scale(1, te);
        ctx.fillStyle = '#12021e'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 18, 0, 0, TAU); ctx.fill();
        glow(ctx, 0, 0, 40, MAGENTA, 0.9); glow(ctx, 0, 0, 12, WHITE, 1, true);
        ctx.fillStyle = MAGENTA; ctx.beginPath(); ctx.ellipse(0, 0, 8, 13, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#000'; ctx.fillRect(-1.6, -10, 3.2, 20);
        ctx.restore();
      }
    }
    // 아가리 (이빨 두 줄)
    const m = this.mouth;
    ctx.save(); ctx.translate(0, 4);
    ctx.beginPath(); ctx.moveTo(-40, -6); ctx.quadraticCurveTo(0, 10 + m * 34, 40, -6); ctx.quadraticCurveTo(0, 4, -40, -6); ctx.closePath();
    ctx.fillStyle = tint || C('#000000'); ctx.fill();
    if (!fl) {
      glowE(ctx, 0, 6 + m * 12, 30, 8 + m * 14, MAGENTA, 0.4 + m * 0.6);
      ctx.fillStyle = '#efe4ff';
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const u = i / 8 - 0.5, tx = u * 72, ty = -4 + Math.abs(u) * 4; ctx.moveTo(tx - 4, ty); ctx.lineTo(tx, ty + 10 + (i % 2) * 4); ctx.lineTo(tx + 4, ty); }
      for (let i = 0; i < 8; i++) { const u = i / 7 - 0.5, tx = u * 60, ty = 4 + m * 30 - Math.abs(u) * 10; ctx.moveTo(tx - 4, ty); ctx.lineTo(tx, ty - 9 - (i % 2) * 3); ctx.lineTo(tx + 4, ty); }
      ctx.fill();
    }
    ctx.restore();
    // 궤도 결정 파편
    if (!fl) for (const s of this.shards) {
      const px = Math.cos(s.a) * s.r, py = Math.sin(s.a) * s.r * 0.6 - 10;
      ctx.save(); ctx.translate(px, py); ctx.rotate(s.rot); ctx.scale(s.z, s.z);
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(6, 0); ctx.lineTo(0, 12); ctx.lineTo(-6, 0); ctx.closePath();
      ctx.fillStyle = '#1c0a34'; ctx.fill(); ctx.strokeStyle = VIOLET_L; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  paintShadow(ctx, s) {
    const t = this.t, k = clamp(s.t / (s.warn || 0.4), 0, 1), out = clamp((s.life - s.t) / 0.4, 0, 1);
    const a = Math.min(k, out);
    const ec = SHADOW_EYES[s.kind];
    ctx.save();
    ctx.globalAlpha *= a;
    if (s.kind === 'lev') {
      const rise = s.t < s.warn ? 0 : ease.outCubic(Math.min(1, (s.t - s.warn) / 0.18));
      const hy = s.y + 80 - rise * 290;
      ctx.beginPath(); ctx.rect(s.x - 300, s.y - 600, 600, 600); ctx.clip();
      ctx.translate(s.x, hy);
      ctx.fillStyle = 'rgba(20,6,40,0.9)';
      ctx.beginPath(); ctx.moveTo(-30, 300); ctx.lineTo(-34, 60); ctx.quadraticCurveTo(-40, 0, -14, -40); ctx.lineTo(-4, -86); ctx.lineTo(8, -40); ctx.quadraticCurveTo(38, 0, 34, 60); ctx.lineTo(30, 300); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(VIOLET, 0.8); ctx.lineWidth = 2; ctx.stroke();
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 20, -20); ctx.lineTo(sd * 50, -60); ctx.lineTo(sd * 26, -8); ctx.fill(); }
      glow(ctx, -10, -30, 14, ec, 0.9); glow(ctx, 10, -30, 14, ec, 0.9);
    } else if (s.kind === 'col') {
      const fall = s.t < s.warn ? 0 : Math.min(1, (s.t - s.warn) / 0.12);
      const fy = lerp(s.y - 520, s.y - 60, fall * fall);
      ctx.translate(s.x, s.t < s.warn ? s.y - 520 + k * 60 : fy);
      ctx.fillStyle = 'rgba(20,6,40,0.9)'; ctx.strokeStyle = rgba(VIOLET, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 12; i++) { const aa = i / 12 * TAU; ctx.lineTo(Math.cos(aa) * 64, Math.sin(aa) * 64); ctx.lineTo(Math.cos(aa + 0.26) * 52, Math.sin(aa + 0.26) * 52); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(-26, -200, 52, 150);
      glow(ctx, 0, 0, 40, ec, 0.6);
    } else if (s.kind === 'fq') {
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(20,6,40,0.85)'; ctx.strokeStyle = rgba(VIOLET, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-40, 60); ctx.quadraticCurveTo(-20, 0, -10, -30); ctx.lineTo(-8, -60); ctx.lineTo(8, -60); ctx.lineTo(10, -30); ctx.quadraticCurveTo(20, 0, 40, 60); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -70, 10, 0, TAU); ctx.fill();
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 5 - 2, -80); ctx.lineTo(i * 5, -94 - (i === 0 ? 10 : 0)); ctx.lineTo(i * 5 + 2, -80); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-8, -54); ctx.lineTo(-36, -84); ctx.moveTo(8, -54); ctx.lineTo(36, -84); ctx.stroke();
      glow(ctx, 3, -72, 8, ec, 1);
    } else if (s.kind === 'death') {
      const st = s.st;
      if (s.t < s.warn) { ctx.restore(); return; }
      ctx.translate(st.x, s.y); ctx.scale(s.d, 1);
      ctx.fillStyle = 'rgba(20,6,40,0.9)'; ctx.strokeStyle = rgba(VIOLET, 0.9); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(60, -10); ctx.bezierCurveTo(0, -60, -120, -50, -200, 10); ctx.bezierCurveTo(-110, -20, -20, -20, 60, 20); ctx.closePath(); ctx.fill(); ctx.stroke();
      glowE(ctx, -60, -10, 140, 30, ec, 0.4);
      ctx.fillRect(40, -120, 10, 160);
    } else if (s.kind === 'drac') {
      ctx.translate(s.x, s.y); ctx.scale(s.f || 1, 1);
      ctx.fillStyle = 'rgba(20,6,40,0.9)'; ctx.strokeStyle = rgba(VIOLET, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-50, 0); ctx.quadraticCurveTo(-60, -60, -16, -110); ctx.lineTo(-12, -132); ctx.lineTo(-4, -118); ctx.lineTo(6, -120); ctx.lineTo(14, -132); ctx.lineTo(18, -110); ctx.quadraticCurveTo(60, -60, 50, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(2, -118, 10, 0, TAU); ctx.fill();
      glow(ctx, 6, -120, 8, ec, 1);
    }
    ctx.restore();
  }
}

const SHADOW_NAMES = { lev: '레비아탄', col: '태엽 거신', fq: '서리 여왕', death: '사신', drac: '드라큘라' };

// ───────────── 도형/투사체 ─────────────
function drawEyeOrb(ctx, e, t, fl) {
  const r = 17;
  ctx.save(); ctx.translate(e.x, e.y);
  // 꼬리 촉수
  ctx.strokeStyle = C('#1c0a34'); ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 8); ctx.quadraticCurveTo(Math.sin(t * 3 + e.a) * 12, 26, Math.sin(t * 2 + e.a) * 16, 44); ctx.stroke();
  if (!fl) glow(ctx, 0, 0, r * 2.4, VIOLET, 0.5);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = fl ? '#fff' : RG(ctx, 'ch_eyeball', -5, -6, 2, 0, 0, r, [0, '#ffffff', 0.6, '#d8c8ec', 1, '#6a4a8a']); ctx.fill();
  if (!fl) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.stroke();
    // 홍채 + 동공 (플레이어를 봄)
    const lx = Math.cos(e.look) * 6, ly = Math.sin(e.look) * 6;
    ctx.fillStyle = MAGENTA; ctx.beginPath(); ctx.arc(lx, ly, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(lx, ly, 2.4, 6.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(lx - 3, ly - 3, 2, 0, TAU); ctx.fill();
    // 눈꺼풀 (깜빡임)
    const lid = 1 - clamp(e.open, 0, 1);
    if (lid > 0.02) { ctx.fillStyle = '#1c0a34'; ctx.beginPath(); ctx.rect(-r - 1, -r - 1, r * 2 + 2, (r * 2 + 2) * lid); ctx.fill(); }
    if (e.hp < 1) { ctx.strokeStyle = 'rgba(255,40,120,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-2, 0); ctx.lineTo(-8, 8); ctx.stroke(); }
  }
  ctx.restore();
}
function paintTentacle(ctx, x, F, H, w, t, seed) {
  if (H < 3) return;
  const n = 12;
  ctx.save();
  ctx.beginPath();
  const pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n; pts.push([x + Math.sin(t * 6 + u * 5 + seed) * 18 * u, F - H * u, w * (1 - u * 0.85)]); }
  ctx.moveTo(pts[0][0] - pts[0][2], F);
  for (const [px, py, pw] of pts) ctx.lineTo(px - pw, py);
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] + pts[i][2], pts[i][1]);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, '#0a0418'); g.addColorStop(0.5, '#3a1668'); g.addColorStop(1, '#0a0418');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = VIOLET_L; ctx.lineWidth = 1.8; ctx.stroke();
  // 빨판 (빛나는 점)
  for (let i = 2; i < n; i += 2) { const [px, py, pw] = pts[i]; glow(ctx, px, py, pw * 0.9, MAGENTA, 0.6); }
  glowE(ctx, x, F - 6, 40, 10, VIOLET, 0.8);
  ctx.restore();
}
function paintVoidBeam(ctx, l, a, t) {
  const fade = Math.min(1, a * 10, (1 - a) * 5);
  const dx = l.x1 - l.x0, dy = l.y1 - l.y0, L = Math.hypot(dx, dy);
  const th = l.th / 22;
  ctx.save();
  ctx.translate(l.x0, l.y0); ctx.rotate(Math.atan2(dy, dx));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 * fade; ctx.fillStyle = '#6a20c0'; ctx.fillRect(0, -22 * th, L, 44 * th);
  ctx.globalAlpha = 0.7 * fade; ctx.fillStyle = MAGENTA; ctx.fillRect(0, -11 * th, L, 22 * th);
  ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -4 * th, L, 8 * th);
  ctx.restore();
  glow(ctx, l.x0, l.y0, 40, MAGENTA, fade);
  glow(ctx, l.x1, l.y1, 70, VIOLET, fade);
}
function drawShadowIcicle(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(30,10,60,0.95)'; ctx.strokeStyle = SHADOW_EYES.fq; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-8, -44); ctx.lineTo(0, 0); ctx.lineTo(8, -44); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
// 탄 스프라이트 (색별 캐시 사용)
function mkOrb(col) {
  return (ctx, p) => {
    const r = 7;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite(col, true), -r * 2.6, -r * 2.6, r * 5.2, r * 5.2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#1a0630'; ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.4, 0, TAU); ctx.fill();
  };
}
const orbVio = mkOrb(VIOLET), orbMag = mkOrb(MAGENTA), orbPale = mkOrb(VIOLET_L);
function starRender(ctx, p) {
  ctx.rotate(p.t * 5);
  glow(ctx, 0, 0, 22, VIOLET, 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? 3 : 9; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
}
function voidFireRender(ctx, p) {
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  glowE(ctx, -12, 0, 30, 14, VIOLET, 0.8);
  glowE(ctx, -4, 0, 14, 9, MAGENTA, 0.9);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
}
