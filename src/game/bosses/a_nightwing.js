// 1장 보스: 나이트윙 — 거대 흡혈 박쥐왕
// 패턴: 급강하(곡선 예고선) / 음파 고리(틈으로 회피) / 발톱 낙하(지면 충격파) / 핏빛 칼날 부채 / 박쥐 소환 / (3페이즈) 피의 비
// 페이즈: 1 = 격노(핏줄 발광, 연속 급강하) · 2 = 피의 광란(몸이 핏빛으로 물들고 피의 비 추가)
import { ABoss, opt, beginDraw, endDraw, C, rg, lg, glow, ink, rim, sheen, taper, eye, shadow, hash, PI, OUT, RIM, groundWave, dropHazard, erupt } from './a_common.js';
import { rand, clamp, lerp, TAU, angleTo, ease, rgba } from '../../core/math.js';
import { audio } from '../../core/audio.js';
import { paintedDebris } from '../../render/painted/registry.js';

const FUR = '#2e1b17', FUR2 = '#5a3a30', MEM = '#5a0c1c', MEM2 = '#b41c34', BONE = '#2a1712', CLAW = '#eadfcc';
const _P = new Float32Array(16);

export class Nightwing extends ABoss {
  setup() {
    this.flap = 0; this.flapRate = 7; this.spread = 1; this.mouth = 0; this.claw = 0; this.lean = 0;
    this.lastX = this.cx; this.dvx = 0; this.rage = 0; this.gT = 0; this.cont = false; this.chainLeft = 0;
    this.y = this.floorY - 150 - this.h;
  }
  hurtboxes() { return [{ x: this.x + 10, y: this.y + 4, w: this.w - 20, h: this.h - 10 }]; }
  onIntro(world) {
    audio.sfx('boss_roar', { pitch: 1.3 });
    this.mouth = 1.2;
    this.fx.ring(this.cx, this.cy - 40, { color: '#ff3050', r0: 20, r1: 220, life: 0.5, width: 6 });
  }
  moves() {
    const ph = this.phase;
    return [
      ['swoop', 3], ['screech', 2.2], ['talon', 2.4], ['blades', 2.2],
      ['summon', this.minionCount() < 3 ? 1.3 : 0],
      ['bloodRain', ph >= 2 ? 2.4 : 0],
    ];
  }
  idleMove(dt, world, p) {
    const A = this.A;
    const side = this.cx > p.cx ? 1 : -1;
    const tx = clamp(p.cx + side * 290, A.x0 + 130, A.x1 - 130);
    this.flyTo(tx, A.floor - 200 + Math.sin(this.t * 1.7) * 24, 2.2, 280, dt);
    this.facePlayer();
    this.relax(dt);
  }
  relax(dt) {
    this.spread = lerp(this.spread, 1, Math.min(1, dt * 4));
    this.mouth = lerp(this.mouth, 0, Math.min(1, dt * 5));
    this.claw = lerp(this.claw, 0, Math.min(1, dt * 5));
    this.flapRate = lerp(this.flapRate, 7 + this.phase, Math.min(1, dt * 3));
  }
  think(dt, world) {
    super.think(dt, world);
    // 공통 애니메이션
    this.flap += dt * this.flapRate;
    this.dvx = lerp(this.dvx, (this.cx - this.lastX) / Math.max(dt, 1e-4), Math.min(1, dt * 10));
    this.lastX = this.cx;
    this.lean = lerp(this.lean, clamp(this.dvx / 1000, -0.4, 0.4) * this.facing, Math.min(1, dt * 8));
    this.rage = lerp(this.rage, this.phase / 2, Math.min(1, dt * 2));
    if (this.phase >= 1 && Math.random() < dt * (4 + this.phase * 6)) this.fx.emit(this.phase >= 2 ? 'blood' : 'dark', this.cx + rand(-30, 30), this.cy + rand(-10, 30), opt({ speed: 40, color: this.phase >= 2 ? '#c0102a' : undefined }));
    // 날갯짓 소리
    if (Math.floor(this.flap / TAU) !== Math.floor((this.flap - dt * this.flapRate) / TAU) && this.state !== 'swoop') audio.sfx('bat', { vol: 0.25, pitch: 0.45 });
  }

  // ── 급강하: 곡선 예고선 → 고정된 지점을 지나 반대편으로 ──
  s_swoop(dt, world, p) {
    const A = this.A, first = !this.cont;
    const lockT = first ? 0.3 : 0.12, T0 = first ? 0.85 : 0.55, dur = 0.95 / (1 + 0.1 * this.phase + (this.inferno ? 0.1 : 0));
    if (this.at(0)) {
      if (first) this.chainLeft = (this.phase >= 2 || this.inferno) ? 2 : this.phase >= 1 ? 1 : 0;
      this.cont = false;
      this.warnMark(this.cx, this.y - 40, 0.5);
      audio.sfx('bat', { pitch: 0.5, vol: 0.8 });
    }
    if (this.stateT < lockT) {
      this.flyTo(this.cx - this.facing * 30, A.floor - 265, 5, 480, dt);
      this.facePlayer();
    }
    if (this.at(lockT)) {
      const dir = p.cx > this.cx ? 1 : -1;
      this.facing = dir;
      this.P0x = this.cx; this.P0y = this.cy;
      this.Lx = p.cx; this.Ly = clamp(p.cy - 6, A.floor - 150, A.floor - 60);
      this.P2x = clamp(this.Lx + dir * 430, A.x0 + 80, A.x1 - 80); this.P2y = A.floor - 255;
      if (Math.abs(this.P2x - this.Lx) < 150) this.P2x = clamp(this.Lx - dir * 380, A.x0 + 80, A.x1 - 80);
      this.P1x = 2 * this.Lx - (this.P0x + this.P2x) / 2; this.P1y = 2 * this.Ly - (this.P0y + this.P2y) / 2;
      const pts = [];
      for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(this.bz(u, 'x'), this.bz(u, 'y')); }
      this.warn({ type: 'path', pts, width: 70, life: T0 - lockT, color: '#ff2a44' });
    }
    if (this.stateT < T0) {
      if (this.stateT >= lockT) { this.vx *= 0.8; this.vy *= 0.8; }
      this.spread = lerp(this.spread, 1.2, Math.min(1, dt * 6)); this.flapRate = 3; this.mouth = lerp(this.mouth, 0.6, dt * 6);
      return;
    }
    if (this.at(T0)) { audio.sfx('dash', { pitch: 0.7 }); audio.sfx('bat', { pitch: 0.7 }); }
    const u = clamp((this.stateT - T0) / dur, 0, 1), e = ease.inOutQuad(u);
    const x = this.bz(e, 'x'), y = this.bz(e, 'y');
    this.x = x - this.w / 2; this.y = y - this.h / 2; this.vx = 0; this.vy = 0;
    const low = 1 - Math.abs(e - 0.5) * 2;
    this.spread = lerp(1, 0.35, low); this.claw = low; this.flapRate = 2; this.mouth = 0.8;
    for (const hb of this.hurtboxes()) this.strikeRect(hb, 1.05, { kb: [440, -420] });
    this.gT -= dt;
    if (this.gT <= 0) { this.gT = 0.045; this.afterimage(); }
    if (low > 0.6 && Math.random() < 0.5) this.fx.emit('dust', x + rand(-40, 40), A.floor - 4, { speed: 120, angle: -PI / 2 });
    if (u >= 1) {
      if (this.chainLeft > 0) { this.chainLeft--; this.cont = true; this.setState('swoop'); }
      else this.rest(1.05);
    }
  }
  bz(u, k) {
    const a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return k === 'x' ? a * this.P0x + b * this.P1x + c * this.P2x : a * this.P0y + b * this.P1y + c * this.P2y;
  }
  afterimage() {
    const s = { x: this.cx, b: this.bottom, lean: this.lean, f: this.facing, flap: this.flap, spread: this.spread, claw: this.claw, mouth: this.mouth };
    this.fx.ghost((ctx, a) => this.drawGhost(ctx, s, a), 0.26, 'back');
  }
  drawGhost(ctx, s, a) {
    // 채색 퍼핏이 그리는 중이면 잔상도 채색 발광 실루엣으로 (그리기 전용)
    const pp = this._painted?.proxy;
    if (pp && !pp.dead && pp.entry?.state === 'ready' && pp.entry.mod?.ghost?.(ctx, this, s, a, pp.entry.rig, pp.st)) return;
    const keep = [this.flap, this.spread, this.claw, this.mouth];
    this.flap = s.flap; this.spread = s.spread; this.claw = s.claw; this.mouth = s.mouth;
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    ctx.translate(s.x, s.b - 60); ctx.rotate(s.lean); ctx.scale(s.f, 1); ctx.translate(0, 60);
    this.drawFigure(ctx, true);
    ctx.restore();
    [this.flap, this.spread, this.claw, this.mouth] = keep;
  }

  // ── 음파 고리: 입을 벌려 힘을 모은 뒤 틈이 있는 고리를 발사 ──
  s_screech(dt, world, p) {
    const A = this.A, n = (this.phase >= 1 ? 2 : 1) + (this.inferno ? 1 : 0), W = 0.8, iv = 0.75;
    this.flyTo(clamp(this.cx, A.x0 + 150, A.x1 - 150), A.floor - 235, 3, 240, dt);
    this.facePlayer();
    this.spread = lerp(this.spread, 1.15, Math.min(1, dt * 5));
    if (this.at(0)) { this.warnMark(this.cx, this.y - 44, W); audio.sfx('bat', { pitch: 0.35, vol: 0.9 }); }
    const mx = this.cx + this.facing * 4, my = this.y + 20;
    if (this.stateT < W) {
      this.mouth = lerp(this.mouth, 1.1, Math.min(1, dt * 5));
      if (this.every(0.05, 0.18, 4) >= 0) this.fx.ring(mx, my, { color: '#ff3a5a', r0: 150, r1: 12, life: 0.3, width: 3 });
    }
    const k = this.every(W, iv, n);
    if (k >= 0) {
      const a = angleTo(mx, my, p.cx, p.cy);
      const base = a + (Math.random() < 0.5 ? -1 : 1) * rand(0.42, 0.7);
      const gaps = [];
      for (let i = 0; i < 3; i++) gaps.push([base + i * TAU / 3, 0.21]);
      this.ring({ px: mx, py: my, r: 24, speed: 290 + this.phase * 30, th: 13, gaps, color: '#ff3050', color2: '#ffd0da', maxR: 1150, mv: 0.9, element: 'dark' });
      this.fx.flash(mx, my, { color: '#ff4060', size: 120, life: 0.15 });
      this.shake(5, 0.25);
      this.mouth = 1.4;
      audio.sfx('dark', { pitch: 1.5, vol: 0.9 });
    }
    if (this.stateT > W + n * iv + 0.2) this.rest(1.1);
  }

  // ── 발톱 낙하: 플레이어 머리 위를 추적 → 수직 낙하 → 착지 충격파 ──
  s_talon(dt, world, p) {
    const A = this.A, TR = 0.85, HOLD = 0.3 - this.phase * 0.05;
    if (this.at(0)) {
      this.leapLanded = false;
      this.warnMark(this.cx, this.y - 40, 0.5);
      this.warn({ type: 'column', cx0: this.cx, cw: 110, y0: A.floor - 300, y1: A.floor, life: TR + HOLD, color: '#ff3040', follow: (tg) => { if (this.state === 'talon' && this.stateT < TR) tg.cx0 = this.cx; } });
      audio.sfx('bat', { pitch: 0.6 });
    }
    if (this.stateT < TR) {
      this.flyTo(clamp(p.cx, A.x0 + 70, A.x1 - 70), A.floor - 275, 6, 560, dt);
      this.facePlayer();
      this.spread = lerp(this.spread, 1.2, Math.min(1, dt * 6)); this.claw = lerp(this.claw, 1, Math.min(1, dt * 4));
      return;
    }
    if (this.stateT < TR + HOLD) { this.vx = 0; this.vy = -80; this.flapRate = 2; return; }
    if (!this.leapLanded && this.state === 'talon') {
      if (this.at(TR + HOLD)) { this.vy = 1350; audio.sfx('dash', { pitch: 0.6 }); }
      this.vx = 0;
      this.spread = lerp(this.spread, 0.45, Math.min(1, dt * 10));
      this.gT -= dt; if (this.gT <= 0) { this.gT = 0.04; this.afterimage(); }
      for (const hb of this.hurtboxes()) this.strikeRect(hb, 1.1, { kb: [300, -520] });
      if (this.bottom >= this.floorY - 2) {
        this.y = this.floorY - this.h; this.vy = 0;
        this.leapLanded = true; this.landT = this.stateT;
        this.impact(this.cx, this.floorY, 12, 0.06, '#ffc090');
        world.fx.burst('shard', this.cx, this.floorY - 4, 10, { color: '#6a5a4a', speed: 320, angle: -PI / 2, spread: 1.2 });
        audio.sfx('hit_heavy', { pitch: 0.6 });
        const sp = 470 + this.phase * 40;
        groundWave(this, this.cx - 30, -1, { speed: sp, color: '#ff9a6a', style: 'dust', mv: 0.85 });
        groundWave(this, this.cx + 30, 1, { speed: sp, color: '#ff9a6a', style: 'dust', mv: 0.85 });
        if (this.phase >= 1) for (const s of [-1, 1]) erupt(this, this.cx + s * 170, { delay: 0.3, w: 50, h: 150, color: '#ff2040', style: 'blood', burst: 'blood', element: 'dark', mv: 0.9, sfx: 'splash' });
        if (this.inferno || this.phase >= 2) {
          for (let i = 0; i < 9; i++) {
            const a = -PI + (i / 8) * PI;
            this.shoot({ x: this.cx, y: this.floorY - 30, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, w: 14, h: 14, render: drawBloodOrb, color: '#ff2040', life: 2.4, light: { r: 50, color: '#ff2040', i: 0.6 }, attack: { mv: 0.7, type: 'mag', element: 'dark' } });
          }
        }
      }
      if (this.stateT > TR + HOLD + 1.5) this.leapLanded = true;
      return;
    }
    // 착지 후 발톱을 뽑고 다시 상승
    this.claw = 1; this.spread = lerp(this.spread, 1.1, Math.min(1, dt * 4));
    if (this.stateT - this.landT > 0.5) { this.leapLanded = false; this.vy = -420; this.rest(0.9); }
  }

  // ── 핏빛 칼날: 날개를 뒤로 젖혔다가 부채꼴로 막 발사 ──
  s_blades(dt, world, p) {
    const A = this.A, W = 0.6, n = this.phase >= 1 ? 7 : 5, vol = (this.phase >= 2 || this.inferno) ? 2 : 1;
    this.flyTo(clamp(this.cx, A.x0 + 150, A.x1 - 150), A.floor - 215, 3, 200, dt);
    this.facePlayer();
    const cx = this.cx + this.facing * 10, cy = this.cy - 10;
    if (this.at(0)) {
      this.warnMark(this.cx, this.y - 40, W);
      const a = angleTo(cx, cy, p.cx, p.cy);
      for (const d of [-0.32, 0, 0.32]) this.warnLine(cx, cy, cx + Math.cos(a + d) * 420, cy + Math.sin(a + d) * 420, W, { width: 16, color: '#ff3050', arrows: false });
    }
    const k = this.every(W, 0.42, vol);
    if (this.stateT < W || (vol > 1 && this.stateT < W + 0.42 && this.stateT > W + 0.2)) {
      this.spread = lerp(this.spread, 1.35, Math.min(1, dt * 8)); this.flapRate = 0.5;
      this.flap = lerp(this.flap, Math.round(this.flap / TAU) * TAU - PI / 2, Math.min(1, dt * 8));
      if (Math.random() < 0.5) this.fx.emit('blood', cx + rand(-120, 120), cy + rand(-60, 20), { speed: 30, color: '#ff2040' });
    }
    if (k >= 0) {
      this.flap = Math.round(this.flap / TAU) * TAU + PI / 2; this.flapRate = 14;
      const a = angleTo(cx, cy, p.cx, p.cy), sp = 520 + this.phase * 40;
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.15 + (k % 2 ? 0.075 : 0);
        this.shoot({ x: cx, y: cy, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, w: 18, h: 18, render: drawBlade, color: '#ff2a44', life: 2.2, light: { r: 50, color: '#ff2040', i: 0.5 }, attack: { mv: 0.75, element: 'dark', type: 'mag' } });
      }
      this.fx.burst('blood', cx, cy, 14, { speed: 260, angle: a, spread: 0.8 });
      this.shake(4, 0.2);
      audio.sfx('slash_heavy', { pitch: 0.7 }); audio.sfx('bat', { pitch: 0.9, vol: 0.6 });
    }
    if (this.stateT > W + vol * 0.42 + 0.35) this.rest(1.0);
  }

  // ── 박쥐 소환 ──
  s_summon(dt, world, p) {
    const A = this.A;
    this.flyTo(clamp(this.cx, A.x0 + 160, A.x1 - 160), A.floor - 255, 3, 220, dt);
    this.facePlayer();
    this.spread = lerp(this.spread, 1.3, Math.min(1, dt * 5)); this.mouth = lerp(this.mouth, 1, Math.min(1, dt * 4));
    if (this.at(0)) { audio.sfx('bat', { pitch: 0.4, vol: 1 }); this.warnMark(this.cx, this.y - 40, 0.7); }
    if (this.stateT < 0.7 && Math.random() < 0.6) {
      const s = Math.random() < 0.5 ? -1 : 1;
      this.fx.emit('dark', this.cx + s * rand(80, 180), this.cy + rand(-60, 20), { speed: 60 });
    }
    if (this.at(0.7)) {
      const n = this.phase >= 1 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const s = i % 2 ? 1 : -1;
        const e = this.summon('bat', this.cx + s * rand(90, 170), this.cy + rand(-20, 40), 5, { params: { hang: false }, facing: s, fx: 'blood', color: '#ff3050' });
        if (e) { e.setState?.('dive'); e.vx = s * 200; }
      }
      audio.sfx('bat', { pitch: 1.2, vol: 0.9 });
      this.fx.ring(this.cx, this.cy, { color: '#ff3050', r0: 20, r1: 200, life: 0.4, width: 5 });
    }
    if (this.stateT > 1.25) this.rest(0.9);
  }

  // ── 피의 비 (3페이즈): 천장 높이 떠올라 전장에 핏방울을 뿌림 ──
  s_bloodRain(dt, world, p) {
    const A = this.A, T0 = 0.8, T1 = 4.0;
    this.flyTo(A.mid, A.floor - 290, 3, 360, dt);
    this.facePlayer();
    this.spread = lerp(this.spread, 1.3, Math.min(1, dt * 4)); this.flapRate = 4; this.mouth = lerp(this.mouth, 0.9, Math.min(1, dt * 3));
    if (this.at(0)) {
      audio.sfx('boss_roar', { pitch: 1.4, vol: 0.8 });
      this.warnMark(this.cx, this.y - 40, T0);
      this.fx.ring(this.cx, this.cy, { color: '#ff1030', r0: 30, r1: 260, life: 0.6, width: 8 });
    }
    if (Math.random() < 0.7) this.fx.emit('blood', this.cx + rand(-50, 50), this.cy + rand(0, 40), { speed: 60, angle: PI / 2, spread: 0.4 });
    if (this.stateT >= T0 && this.stateT < T1) {
      const iv = this.inferno ? 0.12 : 0.16;
      const k = this.every(T0, iv, Math.ceil((T1 - T0) / iv));
      if (k >= 0) {
        const x = k % 4 === 0 ? clamp(p.cx + rand(-30, 30), A.x0 + 20, A.x1 - 20) : rand(A.x0 + 20, A.x1 - 20);
        dropHazard(this, x, {
          delay: 0.7, warnW: 34, warnH: 170, warnColor: '#ff1a3a', render: drawBloodDrop, speed: 520, gravity: 0.5, w: 16, h: 24, spin: 0, mv: 0.7, element: 'dark', type: 'mag', landFx: 'blood',
          top: A.floor - 480,
          onLand: (pr, w) => { w.fx.burst('blood', pr.cx, A.floor - 4, 8, { speed: 200, angle: -PI / 2, spread: 1.2 }); },
        });
      }
    }
    if (this.stateT > T1 + 0.5) this.rest(1.1);
  }

  // ── 페이즈 전환 ──
  onPhase(n, world) {
    this.setState('transform');
    this.transformTime = 1.4;
    world.banner = n === 1
      ? { text: '격노', sub: '나이트윙의 핏줄이 붉게 타오른다', t: 1.8, color: '#ff4060' }
      : { text: '피의 광란', sub: '밤하늘이 핏빛으로 물든다', t: 2, color: '#ff2040' };
  }
  transformTick(dt, world, p) {
    const A = this.A;
    this.flyTo(clamp(this.cx, A.x0 + 160, A.x1 - 160), A.floor - 265, 3, 300, dt);
    this.spread = lerp(this.spread, 1.4, Math.min(1, dt * 6)); this.mouth = 1.3; this.flapRate = 12; this.claw = 1;
    if (this.at(0.25)) {
      this.phaseBurst(this.phase >= 2 ? '#ff1030' : '#ff4060');
      audio.sfx('boss_roar', { pitch: 1.1 });
      this.ring({ px: this.cx, py: this.cy - 20, r: 30, speed: 520, th: 10, gaps: [[0, PI]], color: '#ff2040', color2: '#ffffff', maxR: 700, mv: 0, harmless: true });
    }
    if (Math.random() < 0.8) this.fx.emit('blood', this.cx + rand(-60, 60), this.cy + rand(-40, 40), { speed: 220 });
  }
  deathStart(world) { audio.sfx('bat', { pitch: 0.3, vol: 1 }); }
  deathTick(dt, world) { this.flap += dt * 20; this.spread = 1.3; this.mouth = 1.3; this.vy = 60; this.lean = Math.sin(this.deathT * 30) * 0.08; }
  debrisPiece(i) { return paintedDebris(this, i) ?? { size: 10, draw: i % 3 ? drawFurTuft : drawFang }; }

  extraLights(L) {
    L.add(this.cx + this.facing * 4, this.y + 6, 60 + this.rage * 60, '#ff2040', 0.9);
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx, world) {
    beginDraw(this);
    const X = this.cx, B = this.bottom;
    const alt = clamp((this.floorY - B) / 360, 0, 1);
    shadow(ctx, X, this.floorY - 2, 130 * (1 - alt * 0.45), 16 * (1 - alt * 0.45), 0.55 * (1 - alt * 0.55));
    ctx.save();
    const jx = this.flashT > 0 ? Math.sin(this.t * 173) * 2.5 : 0;   // 그리기에서는 게임플레이 난수(Math.random)를 쓰지 않는다 — 채색/벡터 경로가 같은 난수열을 쓰도록
    ctx.translate(X + jx, B - 60); ctx.rotate(this.lean); ctx.scale(this.facing, 1); ctx.translate(0, 60);
    this.drawFigure(ctx, false);
    ctx.restore();
    endDraw();
  }
  drawFigure(ctx, ghost) {
    const t = this.t, rage = this.rage;
    // 실루엣 분리용 후광
    if (!ghost) {
      glow(ctx, 0, -86, 170, '#5a0616', 0.55);
      if (rage > 0.02) glow(ctx, 0, -80, 220, '#ff1030', (0.18 + 0.1 * Math.sin(t * 6)) * rage);
      if (this.state === 'transform') glow(ctx, 0, -90, 260, '#ff3050', 0.5 + 0.3 * Math.sin(t * 30));
    }
    const fl = Math.sin(this.flap);
    this.wing(ctx, -1, fl, ghost);
    this.wing(ctx, 1, fl, ghost);
    this.legs(ctx);
    this.torso(ctx, ghost);
    this.head(ctx, ghost);
  }
  wing(ctx, s, fl, ghost) {
    const sp = this.spread, up = -fl * 0.5, t = this.t;
    const a1 = -0.78 - up * 0.9 + (1 - sp) * 1.35;
    const a2 = a1 + 0.58 - (sp - 1) * 0.35 + (1 - sp) * 0.9;
    const Sx = 34, Sy = -100;
    const Ex = Sx + Math.cos(a1) * 46, Ey = Sy + Math.sin(a1) * 46;
    const Wx = Ex + Math.cos(a2) * 64, Wy = Ey + Math.sin(a2) * 64;
    const fan = 0.4 * sp + 0.14, base = a2 + 0.5 + up * 0.3 + (1 - sp) * 0.55, L = [108, 118, 104, 88], k = 0.55 + 0.45 * Math.min(sp, 1.2);
    const tip = _P;
    for (let i = 0; i < 4; i++) {
      const a = base + i * fan + Math.sin(t * 5 + i) * 0.02;
      tip[i * 2] = Wx + Math.cos(a) * L[i] * k; tip[i * 2 + 1] = Wy + Math.sin(a) * L[i] * k;
    }
    const Hx = 22, Hy = -24;
    ctx.save(); ctx.scale(s, 1);
    // 막
    ctx.beginPath();
    ctx.moveTo(Sx, Sy); ctx.lineTo(Ex, Ey); ctx.lineTo(Wx, Wy); ctx.lineTo(tip[0], tip[1]);
    const torn = this.phase;
    for (let i = 1; i <= 4; i++) {
      const x0 = tip[(i - 1) * 2], y0 = tip[(i - 1) * 2 + 1];
      const x1 = i < 4 ? tip[i * 2] : Hx, y1 = i < 4 ? tip[i * 2 + 1] : Hy;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const cx = lerp(mx, Wx, 0.34), cy = lerp(my, Wy, 0.34);
      if (torn >= 1 && i === 2) {
        // 찢어진 가장자리
        ctx.quadraticCurveTo(lerp(x0, cx, 0.5), lerp(y0, cy, 0.5), lerp(x0, x1, 0.35), lerp(y0, y1, 0.35) - 6);
        ctx.lineTo(lerp(x0, x1, 0.45), lerp(y0, y1, 0.45) + 10);
        ctx.lineTo(lerp(x0, x1, 0.55), lerp(y0, y1, 0.55) - 8);
        ctx.quadraticCurveTo(lerp(cx, x1, 0.5), lerp(cy, y1, 0.5), x1, y1);
      } else ctx.quadraticCurveTo(cx, cy, x1, y1);
    }
    ctx.closePath();
    const memFill = ghost ? '#8a1028' : rg(ctx, null, Wx, Wy, 6, Wx, Wy, 190, [0, C('#1e040c'), 0.45, C(MEM), 0.85, C(MEM2), 1, C('#e0405a')]);
    ctx.globalAlpha *= 0.96;
    ink(ctx, memFill, 2.5);
    ctx.globalAlpha /= 0.96;
    if (!ghost) {
      rim(ctx, 0, 0, RIM, 3, 0.45, Wy - 20, Wy + 90);
      // 핏줄
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = this.phase >= 1 ? rgba('#ff3050', 0.35 + 0.25 * Math.sin(t * 8)) : 'rgba(200,40,60,0.28)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const x1 = i < 3 ? (tip[i * 2] + tip[i * 2 + 2]) / 2 : (tip[6] + Hx) / 2, y1 = i < 3 ? (tip[i * 2 + 1] + tip[i * 2 + 3]) / 2 : (tip[7] + Hy) / 2;
        ctx.moveTo(lerp(Wx, x1, 0.15), lerp(Wy, y1, 0.15));
        ctx.quadraticCurveTo(lerp(Wx, x1, 0.5) + 8, lerp(Wy, y1, 0.5) - 6, lerp(Wx, x1, 0.8), lerp(Wy, y1, 0.8));
      }
      ctx.stroke();
      ctx.restore();
      // 찢긴 구멍 (3페이즈)
      if (this.phase >= 2) {
        ctx.fillStyle = 'rgba(8,0,4,0.8)';
        ctx.beginPath(); ctx.ellipse(lerp(Wx, tip[2], 0.55), lerp(Wy, tip[3], 0.55), 9, 5, 0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(lerp(Wx, tip[6], 0.6), lerp(Wy, tip[7], 0.6), 6, 4, 1, 0, TAU); ctx.fill();
      }
    }
    // 뼈대
    _Q[0] = Sx; _Q[1] = Sy; _Q[2] = Ex; _Q[3] = Ey; _Q[4] = Wx; _Q[5] = Wy;
    taper(ctx, _Q, 3, 11, 7);
    ink(ctx, ghost ? '#6a1020' : lg(ctx, null, Sx, Sy - 10, Sx, Sy + 20, [0, C('#5a3a30'), 1, C(BONE)]), 2);
    for (let i = 0; i < 4; i++) {
      _Q[0] = Wx; _Q[1] = Wy; _Q[2] = lerp(Wx, tip[i * 2], 0.55) + (i - 1.5) * 2; _Q[3] = lerp(Wy, tip[i * 2 + 1], 0.55) - 4; _Q[4] = tip[i * 2]; _Q[5] = tip[i * 2 + 1];
      taper(ctx, _Q, 3, 5.5, 1.6);
      ink(ctx, C(BONE), 1.5);
    }
    // 관절 하이라이트
    if (!ghost) {
      ctx.fillStyle = C('#7a5a4a');
      ctx.beginPath(); ctx.arc(Ex, Ey, 3.5, 0, TAU); ctx.arc(Wx, Wy, 4.5, 0, TAU); ctx.fill();
    }
    // 엄지 발톱
    ctx.beginPath(); ctx.moveTo(Wx - 3, Wy - 2); ctx.quadraticCurveTo(Wx - 4, Wy - 16, Wx + 6, Wy - 20); ctx.quadraticCurveTo(Wx + 1, Wy - 12, Wx + 4, Wy - 2); ctx.closePath();
    ink(ctx, C(CLAW), 1.5);
    ctx.restore();
  }
  legs(ctx) {
    const c = this.claw, t = this.t;
    for (const s of [-1, 1]) {
      const hx = s * 17, hy = -40;
      const kx = s * (27 + c * 3), ky = -20 + c * 8;
      const ax = s * (19 + c * 5), ay = -4 + c * 14 + Math.sin(t * 3 + s) * 1.5;
      _Q[0] = hx; _Q[1] = hy; _Q[2] = kx; _Q[3] = ky; _Q[4] = ax; _Q[5] = ay;
      taper(ctx, _Q, 3, 22, 9);
      ink(ctx, lg(ctx, 'nwleg', 0, -40, 0, 0, [0, C('#3a2420'), 1, C('#140a08')]), 2.5);
      // 무릎 털
      ctx.beginPath(); ctx.moveTo(kx - s * 4, ky - 6); ctx.lineTo(kx + s * 9, ky + 2); ctx.lineTo(kx - s * 2, ky + 4); ctx.closePath();
      ctx.fillStyle = C('#1a0e0c'); ctx.fill();
      // 발톱 3개
      for (let i = -1; i <= 1; i++) {
        const a = PI / 2 + i * (0.35 + c * 0.4) + s * 0.12;
        const L = 15 + c * 6, bx = ax + Math.cos(a) * L, by = ay + Math.sin(a) * L;
        ctx.beginPath(); ctx.moveTo(ax - 3, ay); ctx.quadraticCurveTo(bx + i * 4, by - 3, bx - i * 2 + s * 2, by + 3 - c * 3); ctx.lineTo(ax + 3, ay); ctx.closePath();
        ink(ctx, lg(ctx, 'nwclaw', 0, ay, 0, ay + 20, [0, C('#3a2a22'), 0.4, C(CLAW), 1, C('#fff8ee')]), 1.4);
      }
    }
  }
  torso(ctx, ghost) {
    const t = this.t, br = Math.sin(t * 2.4) * 1.2;
    // 근육질 몸통 (부드러운 윤곽)
    ctx.beginPath();
    ctx.moveTo(-12, -114);
    ctx.quadraticCurveTo(-30, -112 - br, -42, -101);
    ctx.quadraticCurveTo(-47, -92, -38, -82);
    ctx.quadraticCurveTo(-26, -68, -23, -54);
    ctx.quadraticCurveTo(-27, -44, -24, -36);
    ctx.quadraticCurveTo(-10, -28, 2, -29);
    ctx.quadraticCurveTo(14, -28, 26, -36);
    ctx.quadraticCurveTo(29, -44, 25, -54);
    ctx.quadraticCurveTo(28, -68, 40, -82);
    ctx.quadraticCurveTo(49, -92, 44, -101);
    ctx.quadraticCurveTo(32, -112 - br, 14, -114);
    ctx.closePath();
    const bodyFill = ghost ? '#6a1020' : rg(ctx, 'nwbody' + this.phase, 14, -92, 4, 2, -72, 62, [0, C(this.phase >= 2 ? '#8a3a34' : '#6e4a3c'), 0.45, C(FUR), 1, C('#0c0505')]);
    ink(ctx, bodyFill, 3);
    if (ghost) return;
    rim(ctx, -50, -8, RIM, 3.5, 0.6);
    // 가슴·복근 음영
    ctx.strokeStyle = C('#120808'); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-28, -86); ctx.quadraticCurveTo(-14, -76, -2, -82);
    ctx.moveTo(4, -82); ctx.quadraticCurveTo(18, -76, 32, -86);
    ctx.moveTo(1, -98); ctx.lineTo(1, -44);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const y = -70 + i * 10; ctx.moveTo(-12, y); ctx.quadraticCurveTo(-6, y + 3, -1, y); ctx.moveTo(3, y); ctx.quadraticCurveTo(9, y + 3, 15, y); }
    ctx.stroke();
    // 근육 하이라이트 (따뜻한 키라이트)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg(ctx, 'nwpec', 18, -92, 1, 18, -92, 18, [0, 'rgba(255,190,140,0.2)', 1, 'rgba(255,190,140,0)']);
    ctx.beginPath(); ctx.arc(18, -92, 18, 0, TAU); ctx.fill();
    ctx.fillStyle = rg(ctx, 'nwpec2', -12, -90, 1, -12, -90, 14, [0, 'rgba(255,190,140,0.1)', 1, 'rgba(255,190,140,0)']);
    ctx.beginPath(); ctx.arc(-12, -90, 14, 0, TAU); ctx.fill();
    ctx.restore();
    // 옆구리 털
    ctx.fillStyle = C('#1a0e0c');
    for (const s of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const y = -80 + i * 9, x = s * (36 - i * 3.5);
        ctx.moveTo(x, y); ctx.lineTo(x + s * (9 + Math.sin(t * 4 + i) * 1.5), y + 5); ctx.lineTo(x - s * 1, y + 8);
      }
      ctx.fill();
    }
    // 갈기 (목·어깨)
    ctx.beginPath();
    ctx.moveTo(-40, -100);
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, x = lerp(-40, 42, u), y = -104 + Math.sin(u * PI) * -8;
      const len = 11 + Math.sin(u * PI) * 8 + (i % 3 === 0 ? 4 : 0) + Math.sin(t * 3 + i) * 1.5;
      ctx.lineTo(x + (u - 0.5) * 6, y + (i % 2 ? len : 3));
    }
    ctx.lineTo(42, -102); ctx.quadraticCurveTo(22, -126, 0, -124); ctx.quadraticCurveTo(-22, -126, -40, -100); ctx.closePath();
    ink(ctx, lg(ctx, 'nwruff', 0, -126, 0, -84, [0, C('#9a7a66'), 0.5, C('#5a4034'), 1, C('#241612')]), 2);
    rim(ctx, -44, 0, RIM, 3, 0.55, -126, -90);
    // 핏빛 균열 (1~2페이즈)
    if (this.phase >= 1) {
      const k = this.phase >= 2 ? 1 : 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ff2a40', (0.55 + 0.3 * Math.sin(t * 9)) * k); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, -84); ctx.lineTo(-13, -72); ctx.lineTo(-18, -56);
      ctx.moveTo(22, -84); ctx.lineTo(12, -68); ctx.lineTo(17, -52);
      ctx.moveTo(-5, -62); ctx.lineTo(5, -48);
      ctx.stroke();
      ctx.restore();
    }
  }
  head(ctx, ghost) {
    const t = this.t, m = clamp(this.mouth, 0, 1.4), hx = 4, hy = -128;
    const sway = Math.sin(t * 2.2) * 2 - Math.sin(this.flap) * 2;
    // 귀 (뒤쪽 → 앞쪽)
    for (const s of [-1, 1]) {
      const bx = hx + s * 10, tx = hx + s * (30 + (s > 0 ? 4 : 0)), ty = hy - 50 + sway * (s > 0 ? 1 : 0.6);
      ctx.beginPath();
      ctx.moveTo(bx - s * 10, hy - 8);
      ctx.quadraticCurveTo(bx + s * 24, hy - 14, tx, ty);
      ctx.quadraticCurveTo(bx - s * 6, hy - 30, bx - s * 8, hy - 14);
      ctx.closePath();
      ink(ctx, ghost ? '#6a1020' : C('#2a1814'), 2.5);
      if (!ghost) {
        ctx.beginPath();
        ctx.moveTo(bx - s * 4, hy - 12);
        ctx.quadraticCurveTo(bx + s * 16, hy - 18, lerp(bx, tx, 0.86), lerp(hy, ty, 0.86));
        ctx.quadraticCurveTo(bx - s * 1, hy - 26, bx - s * 4, hy - 14);
        ctx.closePath();
        ctx.fillStyle = rg(ctx, 'nwear' + s, bx + s * 9, hy - 26, 2, bx + s * 9, hy - 26, 26, [0, C('#e84858'), 0.5, C('#8a1a2a'), 1, C('#3a0a12')]);
        ctx.fill();
        glow(ctx, bx + s * 10, hy - 28, 24, '#ff3040', 0.28);
      }
    }
    // 머리
    ctx.beginPath(); ctx.ellipse(hx, hy, 21, 19, 0, 0, TAU);
    ink(ctx, ghost ? '#6a1020' : rg(ctx, 'nwhead' + this.phase, hx + 9, hy - 9, 2, hx, hy, 25, [0, C(this.phase >= 2 ? '#7a3430' : '#5a3a30'), 0.6, C(FUR), 1, C('#0c0505')]), 3);
    if (ghost) return;
    rim(ctx, hx - 27, hx + 4, RIM, 4, 0.65);
    // 주둥이 (앞으로 돌출)
    ctx.beginPath(); ctx.ellipse(hx + 7, hy + 10, 14, 10 + m * 3, 0.1, 0, TAU);
    ink(ctx, rg(ctx, 'nwsnout', hx + 11, hy + 5, 1, hx + 7, hy + 10, 15, [0, C('#8a5e50'), 1, C('#3a2420')]), 2.2);
    // 코잎
    ctx.beginPath(); ctx.moveTo(hx + 8, hy - 3); ctx.lineTo(hx + 15, hy + 5); ctx.lineTo(hx + 8, hy + 8); ctx.lineTo(hx + 2, hy + 5); ctx.closePath();
    ink(ctx, C('#5a2a2a'), 1.5);
    ctx.fillStyle = C('#0a0204'); ctx.beginPath(); ctx.arc(hx + 6, hy + 5, 1.5, 0, TAU); ctx.arc(hx + 10.5, hy + 5, 1.5, 0, TAU); ctx.fill();
    // 입
    const mx = hx + 7, my = hy + 14, mh = 2 + m * 10;
    ctx.beginPath(); ctx.ellipse(mx, my + mh * 0.4, 10 + m * 2, mh * 0.6 + 1, 0, 0, TAU);
    ink(ctx, C('#3a0610'), 2);
    if (m > 0.2) { ctx.fillStyle = C('#9a1a2a'); ctx.beginPath(); ctx.ellipse(mx, my + mh * 0.75, 5, mh * 0.25, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = C('#f6eedc');
    for (const s of [-1, 1]) {
      const fx = mx + s * 6;
      ctx.beginPath(); ctx.moveTo(fx - 2.4, my - 1); ctx.lineTo(fx + 2.4, my - 1); ctx.lineTo(fx + s * 0.6, my + 8 + m * 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(fx - 1.7, my + mh + 1); ctx.lineTo(fx + 1.7, my + mh + 1); ctx.lineTo(fx, my + mh - 4); ctx.closePath(); ctx.fill();
    }
    // 눈 (움푹한 그늘 + 발광)
    ctx.fillStyle = C('#080305');
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + s * 8 + 3, hy - 3, 6.5, 5, s * -0.3, 0, TAU); ctx.fill(); }
    const ec = this.phase >= 2 ? '#ff5060' : '#ff2a3a', er = 3.2 + this.rage * 1.3;
    for (const s of [-1, 1]) eye(ctx, hx + s * 8 + 3, hy - 3, er, ec, 0.9 + this.rage * 0.4);
    ctx.strokeStyle = C('#050102'); ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - 13, hy - 12); ctx.lineTo(hx - 1, hy - 7); ctx.moveTo(hx + 21, hy - 12); ctx.lineTo(hx + 8, hy - 7); ctx.stroke();
  }
}
const _Q = new Float32Array(8);

// ───────────────────────── 투사체 그리기 ─────────────────────────
function drawBlade(ctx, p) {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 26, '#ff2040', 0.6);
  ctx.fillStyle = 'rgba(255,40,70,0.55)';
  ctx.beginPath(); ctx.moveTo(-26, -8); ctx.quadraticCurveTo(0, -14, 14, 0); ctx.quadraticCurveTo(0, 14, -26, 8); ctx.quadraticCurveTo(-6, 0, -26, -8); ctx.fill();
  ctx.fillStyle = '#ffd0d8';
  ctx.beginPath(); ctx.moveTo(-10, -4); ctx.quadraticCurveTo(4, -6, 14, 0); ctx.quadraticCurveTo(4, 6, -10, 4); ctx.quadraticCurveTo(0, 0, -10, -4); ctx.fill();
}
function drawBloodOrb(ctx, p) {
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 24, '#ff1030', 0.8);
  ctx.fillStyle = '#ff6070'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-1.5, -1.5, 2.2, 0, TAU); ctx.fill();
}
function drawBloodDrop(ctx, p) {
  const st = clamp(p.vy / 900, 0.6, 1.6);
  ctx.scale(1 / Math.sqrt(st), st);
  glow(ctx, 0, 0, 22, '#ff1030', 0.45);
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(8, 2, 0, 9); ctx.quadraticCurveTo(-8, 2, 0, -14); ctx.closePath();
  ctx.fillStyle = '#9a0a1c'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#2a0006'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,200,200,0.8)'; ctx.beginPath(); ctx.ellipse(-2, 0, 1.6, 3, 0, 0, TAU); ctx.fill();
}
function drawFurTuft(ctx) {
  ctx.fillStyle = '#3a2420'; ctx.beginPath(); ctx.moveTo(-7, 3); ctx.lineTo(-3, -6); ctx.lineTo(0, 2); ctx.lineTo(3, -7); ctx.lineTo(7, 3); ctx.closePath(); ctx.fill();
}
function drawFang(ctx) {
  ctx.fillStyle = '#efe6d2'; ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(3, -6); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill();
}
