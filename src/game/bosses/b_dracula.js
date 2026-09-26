// 12장 보스: 드라큘라 백작 — 1형태(귀족) → 50%에서 진정한 모습(거대한 날개 달린 마왕)으로 변신
// 1형태: 망토 소용돌이 순간이동 · 헬파이어(3연 화염구) · 암흑 업화 기둥 · 박쥐 변신 돌진 · 피의 나선(75%↓) · 권속 소환
// 2형태: 운석 비 · 피의 광선 · 발톱 연격 · 도약 내려찍기(충격파) · 지옥불 숨결(불타는 바닥) · 날갯짓 돌풍 · 헬파이어 노바(25%↓)
import { BossB, PI, OUT, R, C, LG, RG, ink, glow, glowE, eye, warnRect, warnFloor, warnLine, warnCircle, warnBang, lineStrike, impact, hash, tube, trySpawn } from './b_common.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, ease, rgba, mix } from '../../core/math.js';

const BLOOD = '#ff2a3a', BLOOD_D = '#6a0010', CRIMSON = '#b3122a';
const CAPE = '#0b070e', CAPE_M = '#221828', LINING = '#8a0c1e', LINING_L = '#e0304a';
const SKIN = '#e9e3ec', SKIN_D = '#9c8ca8';
const GOLD = '#e8c872', GOLD_D = '#7a5a1a';
const HELL = '#ff7a2a', HELL_L = '#ffd070';
const DARKF = '#b060ff';
const HIDE = '#a8181e', HIDE_D = '#3e0508', HIDE_L = '#ff7458';
const HORN = '#2a2220', HORN_L = '#c8b8a0';
const EYE2 = '#ffd060';
const BATS_MAX = 90;

export class Dracula extends BossB {
  setup() {
    this.form = 1;
    this.facing = -1;
    this.cape = 0.15; this.capeT = 0.15;       // 망토 벌림 0~1
    this.wrap = 0; this.wrapT = 0;             // 망토로 몸 감싸기 0~1
    this.armL = 0; this.armR = 0;              // 팔 들기 (0 내림 ~ 1 들어올림)
    this.armLT = 0; this.armRT = 0;
    this.vanish = 0;
    this.bats = [];                            // 박쥐 입자 {x,y,vx,vy,life,ph,s,tx,ty}
    this.swarm = null;                         // 박쥐 떼 중심 {x,y}
    this.floorY = this.A.floor;
    // 2형태 자세
    this.d2 = { scale: 0, wing: 0.3, wingT: 0.3, jaw: 0, jawT: 0, hover: 0, hoverT: 0, crouch: 0, crouchT: 0, lx: 0, ly: 0, rx: 0, ry: 0, glowC: 0 };
    this.hands = { l: { x: 0, y: 0, tx: 0, ty: 0 }, r: { x: 0, y: 0, tx: 0, ty: 0 } };
    this.redSky = 0;
  }
  setState(s) { super.setState(s); this.laneWarn = null; this.beam = null; this.leapWarn = null; this.clawWarn = null; }
  debugAct(s) {
    const [v0, v1] = this.viewX(this.form === 2 ? 240 : 160);
    this.place(clamp(this.cx, v0, v1));
    this.facePlayer();
    super.debugAct(s);
  }
  skipTransition() {
    if (this.phase >= 2 && this.form === 1) this.becomeDemon(true);
  }
  get F() { return this.A.floor; }
  place(x, y = this.F) { this.x = x - this.w / 2; this.y = y - this.h; }
  viewX(m = 140) {
    const cam = this.world.camera, A = this.A;
    return [Math.max(A.x0 + m, cam ? cam.x + m : A.x0 + m), Math.min(A.x1 - m, cam ? cam.x + cam.vw - m : A.x1 - m)];
  }

  // ───────────── 판정 ─────────────
  hitParts() {
    if (this.vanish > 0.5 || this.state === 'transform') return [];
    if (this.form === 1) return [{ x: this.cx - 20, y: this.bottom - 134, w: 40, h: 70 }];     // 고전 드라큘라: 상반신만
    const s = this.d2.scale, b = this.bottom - this.d2.hover;
    return [
      { x: this.cx - 44 * s + this.facing * 10, y: b - 290 * s, w: 88 * s, h: 76 * s, defMul: 0.85 },
      { x: this.cx - 64 * s, y: b - 222 * s, w: 128 * s, h: 100 * s, defMul: 1.1 },
      { x: this.cx - 70 * s, y: b - 120 * s, w: 140 * s, h: 120 * s, defMul: 2.2, armor: true },
    ];
  }
  contactParts() {
    if (this.vanish > 0.3 || this.state === 'transform') return [];
    if (this.form === 1) return [{ x: this.cx - 16, y: this.bottom - 120, w: 32, h: 116 }];
    return [];
  }

  tickB(dt, world) {
    const k = (a, b, r) => a + (b - a) * (1 - Math.exp(-r * dt));
    this.cape = k(this.cape, this.capeT, 9); this.wrap = k(this.wrap, this.wrapT, 10);
    this.armL = k(this.armL, this.armLT, 10); this.armR = k(this.armR, this.armRT, 10);
    const d = this.d2;
    d.wing = k(d.wing, d.wingT, 5); d.jaw = k(d.jaw, d.jawT, 12); d.hover = k(d.hover, d.hoverT, 4); d.crouch = k(d.crouch, d.crouchT, 8);
    d.glowC = Math.max(0, d.glowC - dt);
    for (const hk of ['l', 'r']) { const h = this.hands[hk]; h.x = k(h.x, h.tx, 10); h.y = k(h.y, h.ty, 10); }
    this.updateBats(dt, world);
    if (this.form === 2 && Math.random() < 0.5) world.fx.emit('ember', this.cx + rand(-120, 120), this.bottom - rand(0, 40), { speed: 60, vy: -100 });
    if (this.phase >= 3 && this.form === 2) this.redSky = Math.min(0.35, this.redSky + dt * 0.3);
  }

  // ───────────── 박쥐 입자 ─────────────
  spawnBats(x, y, n, spread = 200, converge = null) {
    for (let i = 0; i < n && this.bats.length < BATS_MAX; i++) {
      const a = rand(0, TAU), sp = rand(120, spread * 2);
      const b = { x: x + rand(-10, 10), y: y + rand(-30, 30), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: rand(0.6, 1.1), max: 1, ph: rand(0, TAU), s: rand(0.7, 1.3), tx: null, ty: null };
      if (converge) { b.x = converge.x + Math.cos(a) * rand(120, 260); b.y = converge.y + Math.sin(a) * rand(80, 180); b.tx = converge.x + rand(-14, 14); b.ty = converge.y + rand(-50, 30); b.vx = 0; b.vy = 0; }
      b.max = b.life;
      this.bats.push(b);
    }
  }
  updateBats(dt) {
    const B = this.bats;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      b.life -= dt; b.ph += dt * 30;
      if (this.swarm && b.sw) {
        const a = b.ph * 0.2 + i;
        const tx = this.swarm.x + Math.cos(a) * 46 * b.s, ty = this.swarm.y + Math.sin(a * 1.3) * 30 * b.s;
        b.vx += (tx - b.x) * 12 * dt; b.vy += (ty - b.y) * 12 * dt; b.vx *= 0.9; b.vy *= 0.9;
        b.life = Math.max(b.life, 0.3);
      } else if (b.tx !== null) {
        b.vx += (b.tx - b.x) * 16 * dt; b.vy += (b.ty - b.y) * 16 * dt; b.vx *= 0.88; b.vy *= 0.88;
      } else { b.vy -= 40 * dt; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0) { B[i] = B[B.length - 1]; B.pop(); }
    }
  }
  paintBats(ctx) {
    for (const b of this.bats) {
      const a = Math.min(1, b.life / Math.min(0.3, b.max) );
      drawBat(ctx, b.x, b.y, 9 * b.s, b.ph, a, b.vx);
    }
  }

  // ───────────── 1형태 상태 ─────────────
  s_intro(dt, world, t) {
    const [v0, v1] = this.viewX(200);
    if (this.at(0.001)) { this.place(clamp(this.cx, v0, v1)); this.wrapT = 1; this.capeT = 0; }
    this.facePlayer();
    if (this.at(0.7)) { this.wrapT = 0; this.capeT = 1; this.armLT = 0.9; this.armRT = 0.9; audio.sfx('mist', { pitch: 0.7 }); this.spawnBats(this.cx, this.bottom - 80, 18, 260); impact(world, { shake: 6, time: 0.4 }); }
    if (this.at(1.5)) { this.capeT = 0.15; this.armLT = 0; this.armRT = 0; }
    if (t > 2.0) this.setState('idle');
  }
  s_idle(dt, world, t) {
    if (this.form === 2) { this.setState('d_idle'); return; }
    this.facePlayer();
    this.capeT = 0.15 + Math.sin(this.t * 1.4) * 0.04; this.wrapT = 0; this.armLT = 0; this.armRT = 0.05;
    if (t < (this.rest ?? this.restTime(0.8))) return;
    this.rest = this.restTime(rand(0.6, 1.0));
    const ph = this.phase;
    if (this.needTele) { this.needTele = false; this.setState('tele'); return; }
    const a = this.choose([
      ['hellfire', 3.2], ['inferno', 2.6], ['batdash', 2], ['spiral', ph >= 1 ? 2.2 : 0], ['summon', ph >= 1 && !this.summoned ? 1 : 0], ['tele', 1.2],
    ]);
    this.needTele = a !== 'tele' && Math.random() < 0.7;
    this.setState(a);
  }
  /** 망토 소용돌이 순간이동 */
  s_tele(dt, world, t) {
    const p = this.P;
    if (t < 0.28) { this.wrapT = 1; this.capeT = 0; if (this.at(0.05)) audio.sfx('mist', { vol: 0.8 }); }
    else if (t < 0.4) {
      if (this.vanish < 1) { this.vanish = 1; this.invuln = true; this.spawnBats(this.cx, this.bottom - 70, 22, 300); audio.sfx('bat', { vol: 0.8 }); world.fx.burst('dark', this.cx, this.bottom - 60, 12, { speed: 120 }); }
    } else if (t < 0.85) {
      if (!this.teleTo) {
        const [v0, v1] = this.viewX(120);
        let x = p ? p.cx + (Math.random() < 0.5 ? -1 : 1) * rand(230, 380) : this.cx;
        if (x < v0 || x > v1) x = p ? p.cx - Math.sign(x - p.cx) * rand(230, 380) : this.cx;
        this.teleTo = clamp(x, v0, v1);
        this.spawnBats(this.teleTo, this.F - 70, 22, 200, { x: this.teleTo, y: this.F - 70 });
      }
      if (this.every(0.05, 0.4, 0.85)) world.fx.emit('dark', this.teleTo + rand(-20, 20), this.F - rand(10, 120), { speed: 30 });
    } else {
      if (this.teleTo !== null && this.teleTo !== undefined) { this.place(this.teleTo); this.teleTo = null; this.facePlayer(); audio.sfx('mist', { vol: 0.6, pitch: 1.3 }); }
      this.vanish = Math.max(0, this.vanish - dt * 6); this.invuln = this.vanish > 0.5;
      this.wrapT = 0; this.capeT = t < 1.1 ? 1 : 0.15; this.armLT = t < 1.1 ? 0.8 : 0; this.armRT = this.armLT;
      if (t > 1.3) { this.vanish = 0; this.invuln = false; this.setState('idle'); }
    }
  }
  // 1) 헬파이어: 망토를 펼쳐 화염구 3발 (페이즈 1↑ 2연발)
  s_hellfire(dt, world, t) {
    const p = this.P;
    this.facePlayer();
    const volleys = this.phase >= 1 ? 2 : 1;
    const per = 0.75;
    if (t < 0.45) { this.capeT = 1; this.armLT = 1; this.armRT = 0.85; if (this.at(0.05)) audio.sfx('charge_ready', { vol: 0.4, pitch: 0.8 }); }
    for (let v = 0; v < volleys; v++) {
      if (this.at(0.45 + v * per)) {
        const x = this.cx + this.facing * 16, y = this.bottom - 92;
        const aim = p ? Math.atan2(p.cy - y, p.cx - x) : (this.facing > 0 ? 0 : PI);
        const n = this.inferno ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = aim + (i - (n - 1) / 2) * 0.22 + (v % 2 ? 0.11 : 0);
          this.shoot({ x, y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, w: 22, h: 22, life: 3.5, render: hellRender, trail: 'fire', trailRate: 0.03, light: { r: 80, color: HELL, i: 0.8 }, attack: { mv: 0.9, element: 'fire', kb: [260, -300] },
            onExpire: this.inferno ? (pr, w) => { for (let k = 0; k < 3; k++) { const b = k / 3 * TAU; this.shoot({ x: pr.cx, y: pr.cy, vx: Math.cos(b) * 180, vy: Math.sin(b) * 180, w: 10, h: 10, life: 1.2, render: hellRender, attack: { mv: 0.4, element: 'fire' } }); } } : null });
        }
        audio.sfx('fire', { pitch: 0.8 }); world.fx.burst('fire', x, y, 10, { speed: 160 });
      }
    }
    if (t > 0.45 + volleys * per) { this.capeT = 0.15; this.armLT = 0; this.armRT = 0; }
    if (t > 0.75 + volleys * per) this.setState('idle');
  }
  // 2) 암흑 업화 기둥
  s_inferno(dt, world, t) {
    const A = this.A, F = this.F, p = this.P;
    this.facePlayer();
    this.armRT = t < 1.4 ? 1 : 0; this.capeT = 0.5;
    if (this.at(0.3)) {
      audio.sfx('dark', { pitch: 0.7 });
      const px = p ? p.cx : A.cx;
      const xs = this.phase >= 2 || this.inferno ? [-300, -150, 0, 150, 300] : [-220, 0, 220];
      xs.forEach((dx, i) => this.darkPillar(clamp(px + dx, A.x0 + 40, A.x1 - 40), 0.75 + Math.abs(dx) / 1200));
      if (this.phase >= 1) xs.forEach((dx, i) => this.darkPillar(clamp(px + dx + 75, A.x0 + 40, A.x1 - 40), 1.9 + Math.abs(dx) / 1200));
    }
    if (t > (this.phase >= 1 ? 3.0 : 1.9)) this.setState('idle');
  }
  darkPillar(x, warn) {
    const F = this.F;
    const H = 300;
    this.zone({
      x: x - 34, y: F - H, w: 68, h: H, warn, life: 0.85, mv: 1.1, element: 'dark', kb: [200, -600], z: 6,
      onStart: (z, w) => { audio.sfx('fire', { vol: 0.6, pitch: 0.6 }); w.camera.shake(3, 0.15); w.fx.burst('dark', x, F - 20, 10, { speed: 200, angle: -PI / 2, spread: 0.5 }); },
      tick: (z, w) => { if (z.on && Math.random() < 0.8) w.fx.emit('fire', x + rand(-22, 22), F - rand(10, H * 0.8), { color: '#7a20c0', color2: '#ff4060', speed: 60, vy: -260 }); },
      paint: (ctx, z) => {
        if (!z.on) { warnFloor(ctx, x, F, 90, z.k, '#c040ff', this.t); return; }
        const g = ease.outCubic(Math.min(1, z.a * 6)), fade = Math.min(1, (1 - z.a) * 4);
        paintDarkFlame(ctx, x, F, H * g, 40, this.t, fade);
      },
      light: (L, z) => { if (z.on) L.add(x, F - 120, 160, '#c040ff', 0.7); },
    });
  }
  // 3) 박쥐 변신 돌진
  s_batdash(dt, world, t) {
    const A = this.A, F = this.F, p = this.P;
    const n = this.phase >= 1 ? 2 : 1;
    if (t < 0.3) { this.wrapT = 1; this.capeT = 0; return; }
    if (!this.swarm) {
      this.vanish = 1; this.invuln = true;
      this.swarm = { x: this.cx, y: this.bottom - 70 };
      this.spawnBats(this.cx, this.bottom - 70, 40, 120);
      for (const b of this.bats) { b.sw = true; b.life = 99; }
      audio.sfx('bat'); audio.sfx('mist', { pitch: 0.6 });
      this.dashI = -1;
    }
    const per = 1.35;
    const lt = t - 0.3, i = Math.floor(lt / per), u = lt - i * per;
    if (i >= n) {
      // 재집결
      if (!this.reform) { this.reform = true; this.place(clamp(this.swarm.x, A.x0 + 80, A.x1 - 80)); for (const b of this.bats) { b.sw = false; b.tx = this.cx + rand(-14, 14); b.ty = this.bottom - rand(30, 110); b.life = 0.45; } audio.sfx('mist', { pitch: 1.2 }); }
      this.vanish = Math.max(0, this.vanish - dt * 4);
      this.wrapT = 0; this.capeT = 0.9; this.armLT = 0.7; this.armRT = 0.7;
      if (this.vanish <= 0) { this.swarm = null; this.reform = false; this.invuln = false; this.setState('idle'); }
      return;
    }
    if (this.dashI !== i) {
      this.dashI = i;
      const [v0, v1] = this.viewX(80);
      const from = this.swarm.x;
      const d = p ? Math.sign(p.cx - from) || 1 : 1;
      this.dashFrom = { x: from, y: this.swarm.y };
      this.dashTo = clamp((p ? p.cx : from) + d * 320, A.x0 + 60, A.x1 - 60);
      this.dashY = p ? clamp(p.cy - 10, F - 150, F - 40) : F - 60;
      this.dashD = d;
    }
    if (u < 0.55) {
      // 목표 높이로 이동하며 예고
      this.swarm.x += (this.dashFrom.x - this.swarm.x) * Math.min(1, dt * 6);
      this.swarm.y += (this.dashY - this.swarm.y) * Math.min(1, dt * 6);
      this.laneWarn = { x0: Math.min(this.swarm.x, this.dashTo) - 60, x1: Math.max(this.swarm.x, this.dashTo) + 60, y: this.dashY, k: u / 0.55 };
      if (u < dt * 1.5) audio.sfx('warning', { vol: 0.35, pitch: 1.5 });
    } else if (u < 1.05) {
      this.laneWarn = null;
      const e = ease.inOutQuad((u - 0.55) / 0.5);
      this.swarm.x = lerp(this.dashFrom.x, this.dashTo, e);
      if (u < 0.55 + dt * 1.5) {
        audio.sfx('bat'); audio.sfx('dash', { pitch: 0.7 });
        const hb = { x: 0, y: 0, w: 130, h: 80 };
        this.zone({ x: 0, y: 0, w: 1, h: 1, life: 0.5, mv: 1.1, kb: [380 * this.dashD, -400], rects: () => { hb.x = this.swarm.x - 65; hb.y = this.swarm.y - 40; return [hb]; } });
      }
    } else { this.dashFrom.x = this.swarm.x; }
    this.x = this.swarm.x - this.w / 2;
  }
  // 4) 피의 나선 (75%↓)
  s_spiral(dt, world, t) {
    this.facePlayer();
    this.capeT = 1; this.armLT = 1; this.armRT = 1;
    const dur = 2.2;
    if (this.at(0.1)) audio.sfx('dark', { pitch: 1.1 });
    if (this.every(this.inferno ? 0.09 : 0.12, 0.4, dur)) {
      const x = this.cx, y = this.bottom - 90;
      for (let k = 0; k < 2; k++) {
        const a = this.st * 2.6 + k * PI;
        this.shoot({ x, y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, w: 14, h: 14, life: 3, render: bloodRender, attack: { mv: 0.55 }, light: { r: 40, color: BLOOD, i: 0.4 } });
      }
    }
    if (t > dur + 0.3) { this.capeT = 0.15; this.armLT = 0; this.armRT = 0; this.setState('idle'); }
  }
  // 5) 권속 소환 (박쥐)
  s_summon(dt, world, t) {
    this.facePlayer();
    this.armRT = 1; this.capeT = 0.6;
    if (this.at(0.4)) {
      this.summoned = true;
      audio.sfx('bat'); world.game.toast('드라큘라: "밤의 아이들이여, 오라."', '#ff8090');
      for (let i = 0; i < 3; i++) { const x = this.cx + (i - 1) * 90; trySpawn(world, ['bat', 'ice_bat'], x, this.F - 180 - i * 20, { elite: false }); this.spawnBats(x, this.F - 180, 6, 120); }
    }
    if (t > 1.2) this.setState('idle');
  }

  // ───────────── 변신 ─────────────
  onPhase(n, world) {
    if (n === 1) world.game.toast('드라큘라: "후후… 조금은 즐길 만하군."', '#ff8090');
    if (n === 2 && this.form === 1) { this.clearJobs(); this.swarm = null; for (const b of this.bats) b.sw = false; this.setState('transform'); }
    if (n >= 3) { world.game.toast('진·드라큘라: "피의 달이여, 떠올라라!"', '#ff8090'); }
  }
  update(dt, world) {
    // 변신 연출 중에는 world.cutscene 이어도 직접 진행
    if (this.state === 'transform' && this.dying <= 0) {
      this.decayLtn(dt, world);
      this.t += dt; this.animT += dt; this.stateT += dt;
      if (this.flashT > 0) this.flashT -= dt;
      this.pst = this.st; this.st += dt;
      this.tickB(dt, world);
      this.s_transform(dt, world, this.st);
      return;
    }
    super.update(dt, world);
  }
  s_transform(dt, world, t) {
    const F = this.F;
    this.invuln = true; this.harmless = true;
    if (this.at(0.001) || !this.tfStarted) {
      this.tfStarted = true;
      world.cutscene = true;
      // 남은 적 탄/장판 제거 (공정성)
      for (const e of world.entities) if ((e.kind === 'projectile' && e.team === 'enemy') || e.kind === 'hazard') e.dead = true;
      audio.stopMusic?.(0.4);
      audio.sfx('boss_roar', { pitch: 0.8 });
      world.game.toast('드라큘라: "크윽… 인간 따위가…!"', '#ff8090');
      impact(world, { shake: 8, time: 1.0 });
      this.vanish = 0; this.wrapT = 0; this.capeT = 1; this.armLT = 1; this.armRT = 1;
    }
    // 1) 몸부림 + 떠오름
    if (t < 1.6) {
      this.y -= 40 * dt;
      this.x += Math.sin(this.t * 50) * 1.2;
      if (Math.random() < 0.6) world.fx.emit('dark', this.cx + rand(-60, 60), this.bottom - rand(0, 140), { vx: 0, vy: 0, speed: 60 });
      if (this.every(0.07, 0.3, 1.6)) { const a = rand(0, TAU), r = rand(140, 260); world.fx.emit('fire', this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r, { vx: -Math.cos(a) * r * 2.4, vy: -Math.sin(a) * r * 2.4, speed: 0, grav: 0, color: BLOOD, color2: '#ff9090', life: 0.4 }); }
      if (this.at(0.6) || this.at(1.1)) { this.lightning(1); audio.sfx('thunderclap'); world.game.flash('#ff2040', 0.35, 4); }
    }
    // 2) 폭발적으로 갈라짐
    if (this.at(1.6)) {
      world.game.flash('#ffffff', 1, 2.2); impact(world, { shake: 22, time: 1.2 });
      audio.sfx('explode', { pitch: 0.5 }); audio.sfx('thunderclap', { pitch: 0.6 });
      world.fx.burst('blood', this.cx, this.cy, 40, { speed: 500 });
      world.fx.ring(this.cx, this.cy, { color: BLOOD, r0: 20, r1: 520, life: 0.8, width: 16 });
      this.spawnBats(this.cx, this.cy, 50, 420);
      this.becomeDemon(false);
    }
    // 3) 마왕 형태가 어둠 속에서 자라남
    if (t >= 1.6) {
      const g = clamp((t - 1.8) / 0.9, 0, 1);
      this.d2.scale = ease.outBack(g);
      this.d2.wingT = g < 1 ? 0.2 : 1; this.d2.jawT = t > 2.7 && t < 3.6 ? 1 : 0.15;
      this.restHands(g < 0.3);
      if (t > 2.7 && t < 3.6) { this.hands.l.ty -= 120 * this.d2.scale; this.hands.r.ty -= 120 * this.d2.scale; }
      this.redSky = Math.max(this.redSky, 0.25 * (1 - Math.max(0, t - 3.4)));
      if (Math.random() < 0.8) world.fx.emit('fire', this.cx + rand(-160, 160), F - rand(0, 60), { speed: 120, vy: -200 });
    }
    if (this.at(2.8)) {
      audio.sfx('boss_roar', { pitch: 0.45 }); audio.sfx('boss_roar', { pitch: 0.6, vol: 0.7 });
      impact(world, { shake: 18, time: 1.2 });
      world.fx.ring(this.cx, this.bottom - 240, { color: HELL, r0: 30, r1: 600, life: 0.9, width: 14 });
      this.lightning(0.8);
      world.banner = { text: this.def.name, sub: this.def.title, t: 3, color: '#ff3048', big: true };
      audio.music('dracula');
    }
    if (t > 4.0) {
      world.cutscene = false;
      this.invuln = false; this.harmless = false; this.tfStarted = false;
      this.setState('d_idle');
      // 스토리 모드: 변신 직후 대사 (최초 1회)
      if (world.mode === 'story' && !world.state?.progress?.seenScripts?.includes('b_dracula_transform')) world.playScript?.('b_dracula_transform');
    }
  }
  onHurt(dmg, attack, world, info) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (this.form === 1) { if (Math.random() < 0.35) this.spawnBats(x, y, 1, 160); }
    else { world.fx.burst('ember', x, y, 6, { speed: 220 }); world.fx.burst('fire', x, y, 3, { speed: 140 }); }
  }
  onReset(world) {
    if (this.form === 2) {
      const cx = this.cx;
      this.form = 1; this.def = this.def0; this.w = this.def.size?.w ?? 56; this.h = this.def.size?.h ?? 126;
      this.place(cx); this.d2.scale = 0; this.d2.hover = this.d2.hoverT = 0; this.redSky = 0;
    }
    this.vanish = 0; this.swarm = null; this.summoned = false; this.tfStarted = false;
    if (world.cutscene && this.state === 'transform') world.cutscene = false;
  }
  becomeDemon(instant) {
    const cx = this.cx, F = this.F;
    this.form = 2;
    const f2 = this.def.form2 || {};
    this.def = { ...this.def, name: f2.name ?? this.def.name, title: f2.title ?? this.def.title, portrait: f2.portrait ?? this.def.portrait, contact: 0 };
    this.w = 150; this.h = 280;
    const [v0, v1] = this.viewX(230);
    this.place(clamp(cx, Math.max(v0, this.A.x0 + 240), Math.min(v1, this.A.x1 - 240)), F);
    this.vanish = 0; this.wrapT = 0;
    this.d2.scale = instant ? 1 : 0.05; this.d2.wing = this.d2.wingT = 0.6;
    this.restHands(true);
  }

  // ───────────── 2형태 ─────────────
  handRest(side) { const s = this.d2.scale || 1; return { x: this.cx + side * 112 * s, y: this.bottom - this.d2.hover - 96 * s + Math.sin(this.t * 1.4 + side) * 5 }; }
  restHands(snap = false) {
    for (const [k, s] of [['l', -1], ['r', 1]]) { const r = this.handRest(s); const h = this.hands[k]; h.tx = r.x; h.ty = r.y; if (snap) { h.x = r.x; h.y = r.y; } }
  }
  s_d_idle(dt, world, t) {
    const p = this.P, d = this.d2;
    this.facePlayer();
    d.wingT = 0.55 + Math.sin(this.t * 1.2) * 0.08; d.jawT = 0.12; d.hoverT = 0; d.crouchT = 0;
    this.restHands();
    // 플레이어와 너무 멀면 천천히 걸어감
    if (p && Math.abs(p.cx - this.cx) > 420) { const [v0, v1] = this.viewX(200); this.x += Math.sign(p.cx - this.cx) * 60 * dt; this.x = clamp(this.cx, Math.max(v0, this.A.x0 + 200), Math.min(v1, this.A.x1 - 200)) - this.w / 2; }
    if (t < (this.rest ?? this.restTime(0.9))) return;
    this.rest = this.restTime(rand(0.6, 1.0));
    const near = p && Math.abs(p.cx - this.cx) < 260;
    const a = this.choose([
      ['meteor', 2.6], ['beams', 2.6], ['claw', near ? 3.5 : 1.2], ['quake', 2.2], ['breath', 2.2], ['gust', 1.4], ['nova', this.phase >= 3 ? 2.6 : 0],
    ]);
    this.setState(a);
  }
  // 1) 운석 비
  s_meteor(dt, world, t) {
    const A = this.A, F = this.F, p = this.P, d = this.d2;
    this.facePlayer();
    d.jawT = t > 0.2 && t < 1 ? 1 : 0.2; d.wingT = 1;
    this.hands.l.ty = this.bottom - 290 * d.scale; this.hands.r.ty = this.bottom - 290 * d.scale;
    this.hands.l.tx = this.cx - 170 * d.scale; this.hands.r.tx = this.cx + 170 * d.scale;
    if (this.at(0.25)) { audio.sfx('boss_roar', { pitch: 0.7 }); impact(world, { shake: 8, time: 0.6 }); }
    if (this.at(0.4)) {
      const n = (this.phase >= 3 ? 11 : 8) + (this.inferno ? 3 : 0);
      const px = p ? p.cx : A.cx;
      for (let i = 0; i < n; i++) {
        const x = clamp(i === 0 ? px : px + rand(-480, 480), A.x0 + 40, A.x1 - 40);
        this.meteorAt(world, x, 0.9 + i * 0.16 + rand(0, 0.1));
      }
    }
    if (t > 0.4 + 0.9 + (this.phase >= 3 ? 11 : 8) * 0.16 + 0.5) this.setState('d_idle');
  }
  meteorAt(world, x, warn) {
    const F = this.F, A = this.A;
    const sx = x + rand(-160, 160), sy = Math.max(A.top, F - 620);
    const st = { x: sx, y: sy };
    const T = 0.45;
    this.zone({
      x: x - 60, y: F - 110, w: 120, h: 110, warn: warn + T, life: 0.2, mv: 1.25, element: 'fire', kb: [300, -520], z: 7,
      tick: (z, w) => {
        if (z.t > warn && z.t < warn + T) { const u = (z.t - warn) / T; st.x = lerp(sx, x, u); st.y = lerp(sy, F - 20, u * u); if (Math.random() < 0.9) w.fx.emit('fire', st.x, st.y, { speed: 40 }); }
      },
      onStart: (z, w) => { w.fx.burst('fire', x, F - 20, 22, { speed: 320 }); w.fx.burst('smoke', x, F - 30, 8, { speed: 120 }); w.fx.ring(x, F - 10, { color: HELL, r0: 10, r1: 110, life: 0.35, width: 6 }); w.camera.shake(6, 0.2); audio.sfx('explode', { vol: 0.6, pitch: rand(0.8, 1.1) }); },
      paint: (ctx, z) => {
        const k = clamp(z.t / (warn + T), 0, 1);
        if (z.t < warn + T) {
          ctx.save(); ctx.translate(x, F); ctx.scale(1, 0.25);
          warnCircle(ctx, 0, -30, 60, k, HELL, this.t);
          ctx.restore();
          if (z.t > warn) { glow(ctx, st.x, st.y, 60, HELL, 0.9); glow(ctx, st.x, st.y, 20, '#ffffff', 1, true); ctx.fillStyle = '#3a1a10'; ctx.beginPath(); ctx.arc(st.x, st.y, 14, 0, TAU); ctx.fill(); ctx.strokeStyle = HELL_L; ctx.lineWidth = 3; ctx.stroke(); }
        } else glowE(ctx, x, F - 40, 90, 70, HELL, 1 - z.a);
      },
      light: (L, z) => { if (z.t > warn) L.add(st.x, st.y, 150, HELL, 0.8); },
    });
  }
  // 2) 피의 광선 (조준 고정 후 발사 ×3)
  s_beams(dt, world, t) {
    const p = this.P, d = this.d2;
    this.facePlayer();
    const n = this.phase >= 3 ? 5 : 3;
    const per = 0.9;
    const i = Math.floor(t / per), lt = t - i * per;
    if (i >= n) { this.beam = null; this.setState('d_idle'); return; }
    d.jawT = lt > 0.3 ? 0.8 : 0.3; d.glowC = 0.6;
    const s = d.scale;
    const mx = this.cx + this.facing * 26 * s, my = this.bottom - d.hover - 256 * s;
    if (lt < 0.55) {
      if (lt < 0.4 && p) this.beamAim = Math.atan2(p.cy - my, p.cx - mx);
      const L = 1800;
      this.beam = { x0: mx, y0: my, x1: mx + Math.cos(this.beamAim) * L, y1: my + Math.sin(this.beamAim) * L, k: lt / 0.55, fire: false };
      if (lt < dt * 1.5) audio.sfx('charge_ready', { vol: 0.35, pitch: 1.1 });
    } else if (this.beamI !== i) {
      this.beamI = i;
      const L = this.clipLen(mx, my, this.beamAim);
      const line = { x0: mx, y0: my, x1: mx + Math.cos(this.beamAim) * L, y1: my + Math.sin(this.beamAim) * L, th: 30 };
      this.beam = null;
      audio.sfx('dark', { pitch: 0.6 }); audio.sfx('thunderclap', { vol: 0.3, pitch: 1.8 });
      impact(world, { shake: 6, time: 0.3 });
      this.zone({ x: 0, y: 0, w: 1, h: 1, life: 0.32, mv: 1.15, kb: [300, -300], line, z: 7,
        tick: (z, w) => { if (Math.random() < 0.8) w.fx.burst('blood', line.x1, line.y1, 3, { speed: 280 }); },
        paint: (ctx, z) => paintRedBeam(ctx, line, z.a, this.t),
        light: (L2) => { L2.add(line.x1, line.y1, 140, BLOOD, 0.8); L2.add((line.x0 + line.x1) / 2, (line.y0 + line.y1) / 2, 200, BLOOD, 0.6); } });
    }
  }
  clipLen(x, y, a) {
    const A = this.A, c = Math.cos(a), s = Math.sin(a);
    let L = 2000;
    if (s > 0.02) L = Math.min(L, (A.floor - y) / s);
    if (s < -0.02) L = Math.min(L, (A.top - y) / s);
    if (c > 0.02) L = Math.min(L, (A.x1 - x) / c);
    if (c < -0.02) L = Math.min(L, (A.x0 - x) / c);
    return Math.max(40, L);
  }
  // 3) 발톱 연격 (돌진하며 좌우 할퀴기)
  s_claw(dt, world, t) {
    const p = this.P, d = this.d2, A = this.A, F = this.F;
    const s = d.scale;
    if (t < 0.05) this.facePlayer();
    const f = this.facing;
    const hits = this.phase >= 3 ? 3 : 2;
    const per = 0.55;
    if (t < 0.45) {
      // 뒤로 젖히며 예고
      d.crouchT = 0.5; d.jawT = 0.6;
      const h = f > 0 ? this.hands.r : this.hands.l;
      h.tx = this.cx - f * 60 * s; h.ty = this.bottom - 300 * s;
      if (t < dt * 1.5) audio.sfx('boss_roar', { vol: 0.5, pitch: 1.2 });
      this.clawWarn = { x0: f > 0 ? this.cx : this.cx - 280 * s, w: 280 * s, k: t / 0.45 };
    } else {
      this.clawWarn = null;
      const k = Math.floor((t - 0.45) / per), u = (t - 0.45) - k * per;
      if (k >= hits) { d.crouchT = 0; this.restHands(); if (t > 0.45 + hits * per + 0.4) this.setState('d_idle'); return; }
      // 한 걸음 전진
      if (u < 0.2) { this.x += f * 260 * dt; this.x = clamp(this.cx, A.x0 + 140, A.x1 - 140) - this.w / 2; }
      const useR = (k % 2 === 0) === (f > 0);
      const h = useR ? this.hands.r : this.hands.l;
      const other = useR ? this.hands.l : this.hands.r;
      const sw = clamp(u / 0.15, 0, 1);
      h.tx = this.cx + f * lerp(-40, 240, sw) * s; h.ty = this.bottom - lerp(300, 60, sw) * s;
      const r2 = this.handRest(useR ? -1 : 1); other.tx = r2.x; other.ty = r2.y;
      if (u < dt * 1.5) {
        audio.sfx('slash_heavy', { pitch: 0.6 }); impact(world, { shake: 7, time: 0.2 });
        this.zone({ x: f > 0 ? this.cx + 10 : this.cx - 270 * s, y: this.bottom - 250 * s, w: 260 * s, h: 250 * s, life: 0.14, mv: 1.35, kb: [460 * f, -480] });
        const cx = this.cx + f * 140 * s, cy = this.bottom - 150 * s;
        world.fx.slash(cx, cy, f > 0 ? 0.9 : PI - 0.9, { len: 200 * s, width: 30, color: BLOOD, life: 0.2, arc: 1.8, dir: f });
        world.fx.slash(cx + f * 10, cy - 20, f > 0 ? 0.9 : PI - 0.9, { len: 170 * s, width: 12, color: '#ffe0e0', life: 0.16, arc: 1.6, dir: f });
      }
    }
  }
  // 4) 도약 내려찍기 + 충격파
  s_quake(dt, world, t) {
    const p = this.P, d = this.d2, A = this.A, F = this.F;
    if (t < 0.35) { d.crouchT = 1; d.wingT = 0.3; if (t < dt * 1.5) { this.qFrom = this.cx; } }
    else if (t < 1.25) {
      d.crouchT = 0; d.wingT = 1;
      if (t < 0.35 + dt * 1.5) { audio.sfx('double_jump', { pitch: 0.5 }); audio.sfx('mist', { pitch: 0.5 }); world.fx.burst('dust', this.cx, F - 4, 20, { speed: 260, angle: -PI / 2, spread: 1.4 }); }
      if (t < 0.95 && p) this.qTo = clamp(p.cx, A.x0 + 200, A.x1 - 200);
      const u = clamp((t - 0.35) / 0.9, 0, 1);
      d.hoverT = Math.sin(u * PI) * 260; d.hover = d.hoverT;
      this.place(lerp(this.qFrom, this.qTo ?? this.qFrom, ease.inOutQuad(u)), F);
      this.leapWarn = { x: this.qTo ?? this.cx, k: u };
    } else if (t < 1.35) {
      d.hover = d.hoverT = 0; this.leapWarn = null;
      if (!this._qland) {
        this._qland = true;
        impact(world, { shake: 20, time: 0.6, stop: 0.06 }); audio.sfx('explode', { pitch: 0.45 }); audio.sfx('hit_heavy', { pitch: 0.4 });
        world.fx.burst('dust', this.cx, F - 4, 40, { speed: 380, angle: -PI / 2, spread: 1.6 });
        world.fx.burst('fire', this.cx, F - 10, 30, { speed: 300, angle: -PI / 2, spread: 1.4 });
        this.zone({ x: this.cx - 130, y: F - 120, w: 260, h: 120, life: 0.12, mv: 1.4, kb: [360, -560] });
        const waves = this.phase >= 3 || this.inferno ? 2 : 1;
        for (let w2 = 0; w2 < waves; w2++) for (const dd of [-1, 1]) this.later(w2 * 0.45, () => this.fireWave(this.cx + dd * 110, dd));
        for (let i = 0; i < 5; i++) { const x = clamp(this.cx + rand(-500, 500), A.x0 + 30, A.x1 - 30); this.rockFall(x, 0.4 + i * 0.12); }
      }
    } else { this._qland = false; d.crouchT = t < 1.6 ? 0.8 : 0; if (t > 1.9) this.setState('d_idle'); }
  }
  fireWave(x, d) {
    const F = this.F, H = 54;
    this.zone({
      x: x - 24, y: F - H, w: 48, h: H, life: 1.5, mv: 1, element: 'fire', kb: [320 * d, -460], z: 7,
      tick: (z, w, dt) => { z.x += d * 520 * dt; if (Math.random() < 0.9) w.fx.emit('fire', z.cx + rand(-10, 10), F - rand(4, H), { speed: 60, vy: -120 }); },
      paint: (ctx, z) => { const a = Math.min(1, (1 - z.a) * 3); paintHellWave(ctx, z.cx, F, H, d, this.t, a); },
      light: (L, z) => L.add(z.cx, F - 30, 110, HELL, 0.6),
    });
  }
  rockFall(x, warn) {
    const F = this.F, A = this.A;
    const st = { y: A.top, vy: 0, rot: rand(0, TAU) };
    this.zone({
      x: x - 20, y: F - 40, w: 40, h: 40, warn, life: 2, mv: 0.8, kb: [200, -300],
      tick: (z, w, dt) => { if (z.t < z.warn) return; st.vy += 2200 * dt; st.y += st.vy * dt; st.rot += dt * 5; z.y = st.y - 20; if (st.y > F - 16) { w.fx.burst('shard', x, F - 10, 8, { color: '#5a4a4a' }); w.fx.burst('dust', x, F - 6, 6, {}); z.dur = z.t - z.warn; } },
      paint: (ctx, z) => {
        if (z.t < z.warn) { ctx.fillStyle = `rgba(0,0,0,${0.4 * z.k})`; ctx.beginPath(); ctx.ellipse(x, F - 2, 22 * z.k, 5, 0, 0, TAU); ctx.fill(); return; }
        ctx.translate(x, st.y); ctx.rotate(st.rot);
        ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(-6, -17); ctx.lineTo(12, -12); ctx.lineTo(17, 6); ctx.lineTo(2, 16); ctx.lineTo(-14, 10); ctx.closePath();
        ink(ctx, '#4a3c40', 2); ctx.fillStyle = 'rgba(255,200,160,0.2)'; ctx.fillRect(-8, -10, 10, 6);
      },
    });
  }
  // 5) 지옥불 숨결: 불덩이를 흩뿌려 바닥을 태운다 (틈새로 회피)
  s_breath(dt, world, t) {
    const p = this.P, d = this.d2, A = this.A, F = this.F;
    this.facePlayer();
    d.jawT = t > 0.4 && t < 1.8 ? 1 : 0.2; d.glowC = t < 1.8 ? 1 : 0;
    const s = d.scale;
    const mx = this.cx + this.facing * 30 * s, my = this.bottom - 250 * s;
    if (this.at(0.1)) audio.sfx('fire', { pitch: 0.5 });
    if (this.at(0.45)) {
      const n = 7;
      const base = p ? p.cx : this.cx + this.facing * 300;
      const offs = [];
      for (let i = 0; i < n; i++) offs.push(-330 + i * 110 + rand(-10, 10));
      offs.forEach((o, i) => this.later(i * 0.1, () => {
        const tx = clamp(base + o, A.x0 + 40, A.x1 - 40);
        const T = 0.75, g = 2000 * 0.8;
        const vx = (tx - mx) / T, vy = ((F - 16 - my) - 0.5 * g * T * T) / T;
        this.shoot({ x: mx, y: my, vx, vy, w: 22, h: 22, gravity: 0.8, life: 2, render: hellRender, trail: 'fire', trailRate: 0.03, attack: { mv: 0.8, element: 'fire' }, light: { r: 70, color: HELL, i: 0.7 },
          onWall: (pr, w) => { pr.dead = true; this.burnPatch(pr.cx); } });
        audio.sfx('fire', { vol: 0.5, pitch: 0.8 + i * 0.05 });
      }));
    }
    if (t > 0.45 && t < 1.3 && Math.random() < 0.8) world.fx.emit('fire', mx, my, { speed: 120, angle: this.facing > 0 ? 0.6 : PI - 0.6, spread: 0.4 });
    if (t > 2.4) this.setState('d_idle');
  }
  burnPatch(x) {
    const F = this.F;
    this.world.fx.burst('fire', x, F - 10, 12, { speed: 200, angle: -PI / 2, spread: 1 });
    this.zone({ x: x - 34, y: F - 34, w: 68, h: 34, life: 1.8, mv: 0.5, element: 'fire', kb: [150, -380], rehit: 0.6, z: 5,
      tick: (z, w) => { if (Math.random() < 0.5) w.fx.emit('fire', x + rand(-28, 28), F - 6, { speed: 40, vy: -160 }); },
      paint: (ctx, z) => { const a = Math.min(1, z.a * 8, (1 - z.a) * 4); glowE(ctx, x, F - 10, 50, 24, HELL, 0.8 * a); glowE(ctx, x, F - 4, 30, 8, HELL_L, 0.8 * a); },
      light: (L) => L.add(x, F - 20, 80, HELL, 0.5) });
  }
  // 6) 날갯짓 돌풍: 밀어내며 박쥐 떼가 쏟아짐
  s_gust(dt, world, t) {
    const p = this.P, d = this.d2, A = this.A;
    this.facePlayer();
    const dur = 2.0;
    d.wingT = 0.5 + Math.sin(t * 9) * 0.5;
    if (this.at(0.2)) { audio.sfx('mist', { vol: 1, pitch: 0.4 }); audio.sfx('bat'); }
    if (t > 0.3 && t < dur && p && !p.dead) {
      const dir = Math.sign(p.cx - this.cx) || 1;
      p.x += dir * 150 * dt; p.x = clamp(p.x, A.x0, A.x1 - p.w);
      if (Math.random() < 0.6) world.fx.emit('smoke', this.cx + dir * rand(60, 400), this.bottom - rand(20, 260), { vx: dir * 500, speed: 0, grav: 0, color: '#5a2a3a', alpha: 0.35, size: 20 });
    }
    if (this.every(0.35, 0.4, dur)) {
      const dir = p ? Math.sign(p.cx - this.cx) || 1 : this.facing;
      const y = this.bottom - rand(40, 200);
      this.shoot({ x: this.cx + dir * 80, y, vx: dir * rand(380, 460), vy: rand(-40, 40), w: 26, h: 18, life: 3, behavior: 'wave', waveAmp: 120, waveFreq: 7, render: batProjRender, attack: { mv: 0.6 } });
    }
    if (t > dur + 0.3) this.setState('d_idle');
  }
  // 7) 헬파이어 노바 (25%↓): 공중에서 틈이 있는 화염 고리 3연
  s_nova(dt, world, t) {
    const d = this.d2;
    this.facePlayer();
    d.hoverT = 160; d.wingT = 1; d.jawT = t < 2.6 ? 1 : 0.2; d.glowC = 1;
    if (this.at(0.1)) { audio.sfx('boss_roar', { pitch: 0.5 }); world.game.toast('헬파이어 노바!', HELL_L); }
    for (let w = 0; w < 3; w++) {
      if (this.at(0.8 + w * 0.7)) {
        const n = 26, gap = rand(0, TAU), cx = this.cx, cy = this.bottom - d.hover - 160;
        for (let i = 0; i < n; i++) {
          const a = gap + i / n * TAU;
          if (Math.abs(Math.sin((a - gap) / 2)) < 0.2) continue;      // 빠져나갈 틈
          this.shoot({ x: cx, y: cy, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, w: 16, h: 16, life: 4, render: hellRender, attack: { mv: 0.6, element: 'fire' }, collideWalls: true });
        }
        audio.sfx('fire', { pitch: 0.6 }); impact(world, { shake: 6, time: 0.3 });
        world.fx.ring(cx, cy, { color: HELL, r0: 20, r1: 160, life: 0.4, width: 8 });
      }
    }
    if (t > 3.2) { d.hoverT = 0; this.setState('d_idle'); }
  }

  // ───────────── 사망 ─────────────
  onDeath(world) {
    this.dying = 3.6; this.clearJobs(); this.vanish = 0; this.swarm = null;
    if (this.form === 1) this.becomeDemon(true);
    world.game.toast('드라큘라: "어리석은 인간이여… 나는 몇 번이고 되살아나리라…"', '#ff8090', 3.4);
    audio.sfx('boss_roar', { pitch: 0.4 });
  }
  dyingTick(dt, world) {
    const d = this.d2, dy = this.dying;
    d.jawT = 1; d.wingT = 0.2 + Math.sin(this.t * 14) * 0.2; d.hoverT = 0;
    d.crouchT = dy < 2.4 ? 1 : 0.3;
    this.tickB(dt, world);
    this.x += Math.sin(this.t * 60) * 1;
    if (Math.random() < 0.5) world.fx.burst('fire', this.cx + rand(-120, 120), this.bottom - rand(20, 280), 5, { speed: 180 });
    if (Math.random() < 0.3) this.spawnBats(this.cx + rand(-100, 100), this.bottom - rand(40, 260), 2, 300);
    if (dy < 1.4 && !this._ash) {
      this._ash = true;
      world.fx.flash(this.cx, this.bottom - 150, { color: '#ffe0d0', size: 520, life: 0.5 });
      world.fx.ring(this.cx, this.bottom - 150, { color: BLOOD, r0: 30, r1: 640, life: 0.9, width: 16 });
      world.fx.burst('blood', this.cx, this.bottom - 150, 60, { speed: 520 });
      this.spawnBats(this.cx, this.bottom - 150, 60, 480);
      impact(world, { shake: 22, time: 0.9 });
      audio.sfx('explode', { pitch: 0.4 }); audio.sfx('bat');
    }
    if (dy < 1.4) { d.scale = Math.max(0, d.scale - dt * 0.8); if (Math.random() < 0.9) world.fx.emit('smoke', this.cx + rand(-80, 80), this.bottom - rand(0, 200), { color: '#2a2020', speed: 60, vy: -80, alpha: 0.6 }); }
  }

  // ───────────── 조명 ─────────────
  lightsB(L) {
    if (this.form === 1) {
      if (this.vanish > 0.8) { if (this.swarm) L.add(this.swarm.x, this.swarm.y, 140, BLOOD, 0.6); return; }
      L.add(this.cx, this.bottom - 118, 110, BLOOD, 0.7);
      L.add(this.cx, this.bottom - 70, 200, '#ff4060', 0.45);
      if (this.state === 'hellfire') L.add(this.cx + this.facing * 16, this.bottom - 92, 150, HELL, 0.8);
    } else {
      const s = this.d2.scale, b = this.bottom - this.d2.hover;
      L.add(this.cx, b - 150 * s, 360 * s, HELL, 0.75);
      L.add(this.cx + this.facing * 16 * s, b - 262 * s, 150, EYE2, 0.8);
      L.add(this.cx, b - 10, 260, HELL, 0.5);
    }
  }

  // ───────────── 그리기 ─────────────
  paintBack(ctx) {
    const F = this.F, cam = this.world.camera;
    if (this.redSky > 0.01 && !R.fl) {
      ctx.save();
      ctx.fillStyle = `rgba(120,0,16,${this.redSky})`; ctx.fillRect(cam.x - 20, cam.y - 20, cam.vw + 40, cam.vh + 40);
      // 피의 달
      const mx = cam.x + cam.vw * 0.8, my = cam.y + 90;
      glow(ctx, mx, my, 150, '#ff2030', this.redSky * 2);
      ctx.globalAlpha = Math.min(1, this.redSky * 2.6);
      ctx.fillStyle = '#c01020'; ctx.beginPath(); ctx.arc(mx, my, 46, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,120,0.35)'; ctx.beginPath(); ctx.arc(mx - 12, my - 10, 30, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (this.laneWarn) { const w = this.laneWarn; warnRect(ctx, w.x0, w.y - 42, w.x1 - w.x0, 84, w.k, BLOOD, this.t); }
    if (this.clawWarn && this.state === 'claw') warnRect(ctx, this.clawWarn.x0, this.bottom - 250 * this.d2.scale, this.clawWarn.w, 250 * this.d2.scale, this.clawWarn.k, BLOOD, this.t);
    if (this.leapWarn) { ctx.save(); ctx.translate(this.leapWarn.x, F); ctx.scale(1, 0.25); warnCircle(ctx, 0, -20, 130, this.leapWarn.k, HELL, this.t); ctx.restore(); }
    if (this.beam && !R.fl) warnLine(ctx, this.beam.x0, this.beam.y0, this.beam.x1, this.beam.y1, this.beam.k, BLOOD, 1.5);
  }
  paintBody(ctx) {
    if (this.form === 1) {
      if (this.vanish >= 1) return;
      ctx.save(); ctx.globalAlpha *= 1 - this.vanish;
      this.paintCount(ctx, this.cx, this.bottom, this.facing, this.t);
      ctx.restore();
    } else {
      if (this.d2.scale <= 0.01) return;
      this.paintDemon(ctx, this.cx, this.bottom - this.d2.hover, this.facing, this.t, this.d2.scale);
    }
  }
  paintFront(ctx) { if (!R.fl) this.paintBats(ctx); }

  // ── 1형태: 백작 ──
  paintCount(ctx, x, y, f, t) {
    const fl = R.fl, cp = this.cape, wr = this.wrap;
    const aL = this.armL, aR = this.armR;
    ctx.save();
    ctx.translate(x, y); ctx.scale(f, 1);
    // 뒤 망토 (펼침 정도에 따라 날개처럼)
    const spread = lerp(26, 92, cp) * (1 - wr * 0.7);
    const flow = Math.sin(t * 2) * 5;
    ctx.beginPath();
    ctx.moveTo(-14, -112);
    ctx.bezierCurveTo(-spread * 0.8, -110 + cp * 10, -spread - 6, -60, -spread - 10 + flow, 0);
    // 박쥐 날개처럼 물결치는 밑단
    const hemL = -spread - 10 + flow, hemR = spread * 0.7 + flow * 0.5;
    for (let i = 1; i <= 4; i++) { const xa = lerp(hemL, hemR, (i - 0.5) / 4), xb = lerp(hemL, hemR, i / 4); ctx.quadraticCurveTo(xa, -12 - cp * 6, xb, (i % 2 ? 2 : -2)); }
    ctx.bezierCurveTo(spread * 0.6, -60, spread * 0.55, -104 + cp * 14, 16, -112);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dr_capeIn' + Math.round(spread), -spread, 0, spread, 0, [0, '#3a0610', 0.3, LINING, 0.55, LINING_L, 0.75, LINING, 1, '#3a0610']), 3);
    if (!fl) {
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(40,0,8,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(i * 6, -108); ctx.quadraticCurveTo(i * spread * 0.3 + flow, -60, i * spread * 0.42, 0); } ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,140,0.18)'; ctx.fillRect(-spread, -112, spread * 0.6, 112);
      ctx.restore();
    }
    // 망토 겉감 테두리 (검은 바깥 자락)
    ctx.beginPath();
    ctx.moveTo(-14, -112); ctx.bezierCurveTo(-spread * 0.8, -110 + cp * 10, -spread - 6, -60, -spread - 10 + flow, 0);
    ctx.lineTo(-spread - 18 + flow, 0); ctx.bezierCurveTo(-spread - 14, -66, -spread * 0.9, -114 + cp * 10, -18, -118); ctx.closePath();
    ink(ctx, C(CAPE), 2);
    // 다리
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 9 - 5, -62); ctx.lineTo(s * 8 - 5, -4); ctx.lineTo(s * 8 + 6, -4); ctx.lineTo(s * 9 + 5, -62); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dr_leg', -6, 0, 6, 0, [0, '#241c2a', 0.5, '#0e0a12', 1, '#1a1420']), 2);
      ctx.beginPath(); ctx.moveTo(s * 8 - 7, -16); ctx.lineTo(s * 8 - 7, 0); ctx.lineTo(s * 8 + 12, 0); ctx.quadraticCurveTo(s * 8 + 10, -8, s * 8 + 6, -16); ctx.closePath();
      ink(ctx, C('#0a0608'), 2);
      if (!fl) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(s * 8 - 4, -13, 3, 8); }
    }
    // 연미복 몸통
    ctx.beginPath();
    ctx.moveTo(-15, -104); ctx.lineTo(-13, -70); ctx.lineTo(-17, -40); ctx.lineTo(-6, -58); ctx.lineTo(6, -58); ctx.lineTo(17, -40); ctx.lineTo(13, -70); ctx.lineTo(15, -104); ctx.quadraticCurveTo(0, -110, -15, -104);
    ink(ctx, fl ? '#fff' : LG(ctx, 'dr_coat', -16, 0, 16, 0, [0, '#3a3048', 0.15, '#110c16', 0.6, '#1c1622', 0.9, '#2a2234', 1, '#0c080e']), 2.2);
    // 붉은 조끼 + 흰 크라바트 + 메달
    ctx.beginPath(); ctx.moveTo(-7, -104); ctx.lineTo(-6, -66); ctx.lineTo(0, -60); ctx.lineTo(6, -66); ctx.lineTo(7, -104); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dr_vest', 0, -104, 0, -60, [0, '#c01a30', 1, '#5a0414']), 1.5);
    if (!fl) {
      ctx.fillStyle = GOLD; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, -92 + i * 9, 1.4, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#f4f0f4'; ctx.beginPath(); ctx.moveTo(-5, -108); ctx.quadraticCurveTo(0, -96, 5, -108); ctx.quadraticCurveTo(3, -100, 0, -97); ctx.quadraticCurveTo(-3, -100, -5, -108); ctx.fill();
      glow(ctx, 0, -95, 10, BLOOD, 0.8); ctx.fillStyle = BLOOD; ctx.beginPath(); ctx.arc(0, -95, 2.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, -95, 3.4, 0, TAU); ctx.stroke();
      // 림라이트
      ctx.strokeStyle = 'rgba(170,190,255,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-15, -102); ctx.lineTo(-13, -70); ctx.lineTo(-16, -44); ctx.stroke();
    }
    // 뒤팔
    this.countArm(ctx, -1, aL, t);
    // 목 + 머리
    this.countHead(ctx, t);
    // 높은 옷깃 (머리 뒤에서 솟음)
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(s * 6, -108); ctx.quadraticCurveTo(s * 20, -118, s * 22, -140); ctx.quadraticCurveTo(s * 14, -126, s * 8, -118); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dr_collar' + s, 0, -140, 0, -108, [0, LINING_L, 0.5, LINING, 1, '#2a0208']), 1.8);
    }
    // 앞팔 + 앞 망토 자락 (손으로 쥔 가장자리)
    this.countArm(ctx, 1, aR, t);
    // 감싸기 망토 (앞을 덮음)
    if (wr > 0.02) {
      ctx.save(); ctx.globalAlpha *= Math.min(1, wr * 1.4);
      ctx.beginPath();
      ctx.moveTo(-18, -112); ctx.quadraticCurveTo(10, -120, 24, -100); ctx.quadraticCurveTo(30 + wr * 4, -50, 20, 0); ctx.lineTo(-22, 0); ctx.quadraticCurveTo(-30, -60, -18, -112);
      ink(ctx, fl ? '#fff' : LG(ctx, 'dr_wrap', -28, 0, 28, 0, [0, '#07040a', 0.5, CAPE_M, 0.8, '#3a2e48', 1, '#07040a']), 2.5);
      if (!fl) { ctx.strokeStyle = 'rgba(160,140,200,0.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, -104); ctx.quadraticCurveTo(0, -60, -4, -4); ctx.moveTo(10, -104); ctx.quadraticCurveTo(16, -60, 12, -4); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
  }
  countArm(ctx, side, raise, t) {
    const fl = R.fl;
    const sx = side > 0 ? 12 : -12, sy = -102;
    // 들어올림: 어깨각 0(아래)→2.2(옆 위)
    const a = lerp(0.15, side > 0 ? 2.3 : 2.0, raise);
    const L1 = 24, L2 = 22;
    const ex = sx + Math.sin(a) * L1 * (side > 0 ? 1 : -1) * (side > 0 ? 1 : 1), ey = sy + Math.cos(a) * L1;
    const ea = a + (raise > 0.5 ? -0.3 : 0.25);
    const hx = ex + Math.sin(ea) * L2 * (side > 0 ? 1 : -1), hy = ey + Math.cos(ea) * L2;
    const X = (v) => (side > 0 ? v : v);
    // 소매 (검정)
    ctx.lineCap = 'round';
    ctx.strokeStyle = C(OUT); ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(X(ex), ey); ctx.lineTo(X(hx), hy); ctx.stroke();
    ctx.strokeStyle = C(side > 0 ? '#1e1826' : '#120e18'); ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(X(ex), ey); ctx.lineTo(X(hx), hy); ctx.stroke();
    // 흰 소맷부리 + 손
    ctx.fillStyle = C('#f0ecf2'); ctx.beginPath(); ctx.arc(X(hx), hy, 4.2, 0, TAU); ctx.fill();
    ctx.fillStyle = C(SKIN); ctx.beginPath(); ctx.ellipse(X(hx) + Math.sin(ea) * 4 * side, hy + Math.cos(ea) * 4, 3.2, 4.2, 0, 0, TAU); ctx.fill();
    if (!fl) { ctx.strokeStyle = SKIN_D; ctx.lineWidth = 1; ctx.beginPath(); for (let k = -1; k <= 1; k++) { const bx = X(hx) + Math.sin(ea) * 7 * side, by = hy + Math.cos(ea) * 7; ctx.moveTo(bx + k * 1.4, by); ctx.lineTo(bx + k * 2.4 + Math.sin(ea) * 4 * side, by + 4); } ctx.stroke(); }
    // 펼친 망토 앞자락 (앞손이 쥠)
    if (side > 0 && this.cape > 0.3 && this.wrap < 0.5) {
      const k = this.cape;
      const ex2 = X(hx) + 2, ey2 = hy + 2, bot = 0;
      const outX = ex2 + 18 * k;
      ctx.beginPath();
      ctx.moveTo(14, -110);
      ctx.quadraticCurveTo(lerp(14, ex2, 0.5), lerp(-110, ey2, 0.5) - 14 * k, ex2, ey2);
      ctx.bezierCurveTo(outX + 10, lerp(ey2, bot, 0.35), outX, lerp(ey2, bot, 0.75), outX - 4, bot);
      for (let i = 1; i <= 3; i++) { const xa = lerp(outX - 4, 16, (i - 0.5) / 3), xb = lerp(outX - 4, 16, i / 3); ctx.quadraticCurveTo(xa, bot - 12, xb, bot + (i % 2 ? -2 : 1)); }
      ctx.quadraticCurveTo(20, -60, 14, -110);
      ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dr_flap', 10, 0, 70, 0, [0, '#5a0614', 0.35, LINING, 0.7, LINING_L, 1, '#4a0612']), 2);
      if (!fl) {
        ctx.strokeStyle = 'rgba(40,0,8,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); for (let i = 1; i <= 2; i++) { const u = i / 3; ctx.moveTo(lerp(14, ex2, u), lerp(-108, ey2, u)); ctx.quadraticCurveTo(lerp(18, outX, u) + 4, -50, lerp(16, outX - 4, u), -4); } ctx.stroke();
        // 겉감(검정) 가장자리
        ctx.strokeStyle = CAPE; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex2, ey2); ctx.bezierCurveTo(outX + 10, lerp(ey2, bot, 0.35), outX, lerp(ey2, bot, 0.75), outX - 4, bot); ctx.stroke();
      }
    }
    if (this.state === 'hellfire' && side > 0 && !fl) glow(ctx, X(hx), hy, 24, HELL, 0.8);
  }
  countHead(ctx, t) {
    const fl = R.fl;
    ctx.save(); ctx.translate(2, -124); ctx.scale(0.92, 0.92);
    // 뒷머리 (어깨까지 흐르는 흑발)
    ctx.beginPath(); ctx.moveTo(-9, -12); ctx.quadraticCurveTo(-16, 4, -13, 20 + Math.sin(t * 2) * 2); ctx.lineTo(-7, 18); ctx.quadraticCurveTo(-6, 4, -1, -8); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dr_hb', 0, -12, 0, 20, [0, '#1a1622', 1, '#050308']), 1.5);
    // 목
    ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-3, 16); ctx.lineTo(5, 16); ctx.lineTo(5, 5); ctx.closePath();
    ctx.fillStyle = fl ? '#fff' : LG(ctx, 'dr_nk', -3, 0, 5, 0, [0, SKIN_D, 1, SKIN]); ctx.fill();
    // 얼굴: 각진 턱, 높은 광대, 매부리코
    ctx.beginPath();
    ctx.moveTo(-7, -5);
    ctx.bezierCurveTo(-8, -15, -1, -18, 5, -15);
    ctx.quadraticCurveTo(9, -12, 9, -7);          // 이마
    ctx.lineTo(12, 0);                            // 콧날
    ctx.lineTo(9.5, 1.2);                         // 코밑
    ctx.quadraticCurveTo(10, 3.5, 9, 4.5);        // 윗입술
    ctx.lineTo(9.3, 6);                           // 아랫입술
    ctx.quadraticCurveTo(8.5, 10, 5, 10.5);       // 턱
    ctx.lineTo(-1, 9);                            // 턱선
    ctx.quadraticCurveTo(-6, 5, -7, -5);
    ink(ctx, fl ? '#fff' : LG(ctx, 'dr_face2', -7, 0, 12, 0, [0, '#7a6a88', 0.35, SKIN_D, 0.62, SKIN, 1, '#ffffff']), 1.4);
    if (!fl) {
      // 광대 그늘 + 눈두덩
      ctx.fillStyle = 'rgba(60,40,90,0.35)';
      ctx.beginPath(); ctx.moveTo(1, -1); ctx.quadraticCurveTo(5, 1, 8, 5); ctx.quadraticCurveTo(3, 5, 0, 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(40,20,60,0.45)'; ctx.beginPath(); ctx.ellipse(5.5, -5, 3.6, 2, -0.1, 0, TAU); ctx.fill();
      // 붉은 눈 (가는 불꽃)
      ctx.fillStyle = '#ff2a3a'; ctx.beginPath(); ctx.moveTo(3.2, -5); ctx.quadraticCurveTo(5.8, -6.6, 8.4, -5.4); ctx.quadraticCurveTo(5.8, -4.2, 3.2, -5); ctx.fill();
      glow(ctx, 6, -5.2, 5, BLOOD, 0.9);
      ctx.fillStyle = '#fff0f0'; ctx.fillRect(5.6, -5.8, 1.1, 1.1);
      // 눈썹 (날카로운)
      ctx.strokeStyle = '#0a0610'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(2.2, -7.8); ctx.lineTo(9.2, -7.2); ctx.stroke();
      // 입 + 송곳니
      ctx.strokeStyle = '#3a0818'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(5.5, 5); ctx.lineTo(9.3, 4.9); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(7.8, 5); ctx.lineTo(8.3, 7.4); ctx.lineTo(8.8, 5); ctx.fill();
      // 코 하이라이트
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(9.5, -5); ctx.lineTo(11.3, -0.5); ctx.stroke();
      // 뾰족 귀
      ctx.fillStyle = SKIN_D; ctx.beginPath(); ctx.moveTo(-2.5, -4); ctx.lineTo(-7.5, -12); ctx.lineTo(-0.5, -6.5); ctx.closePath(); ctx.fill();
    }
    // 올백 흑발 (M자 이마선)
    ctx.beginPath();
    ctx.moveTo(-9, -3); ctx.bezierCurveTo(-11, -17, -2, -21, 6, -18); ctx.quadraticCurveTo(10.5, -16, 9, -11.5);
    ctx.lineTo(6.5, -12.4); ctx.lineTo(4, -9.6); ctx.lineTo(1.2, -12); ctx.quadraticCurveTo(-4, -11, -5.5, -3); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dr_hair2', 0, -21, 0, -3, [0, '#4a4458', 0.35, '#141020', 1, '#050308']), 1.3);
    if (!fl) { ctx.strokeStyle = 'rgba(190,200,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, -16); ctx.quadraticCurveTo(0, -20, 6, -17); ctx.moveTo(-8, -10); ctx.quadraticCurveTo(-5, -16, 0, -17); ctx.stroke(); }
    ctx.restore();
  }
  // ── 2형태: 마왕 ──
  paintDemon(ctx, x, y, f, t, s) {
    const fl = R.fl, d = this.d2;
    ctx.save();
    ctx.translate(x, y); ctx.scale(f * s, s);
    const cr = d.crouch * 20;
    const breathe = Math.sin(t * 1.6) * 3;
    // 지옥불 오라
    if (!fl) { glowE(ctx, 0, -10, 180, 40, HELL, 0.55); glowE(ctx, 0, -150, 200, 180, '#ff3020', 0.18); }
    // 날개
    for (const sd of [-1, 1]) this.demonWing(ctx, sd, t, d.wing, fl);
    // 꼬리
    ctx.beginPath();
    ctx.moveTo(-10, -100 + cr);
    ctx.bezierCurveTo(-80, -70, -130, -10, -170 + Math.sin(t * 2) * 10, -30);
    ctx.lineTo(-168 + Math.sin(t * 2) * 10, -20);
    ctx.bezierCurveTo(-120, 0, -70, -54, 0, -88 + cr);
    ctx.closePath();
    ink(ctx, C(HIDE_D), 3);
    ctx.save(); ctx.translate(-172 + Math.sin(t * 2) * 10, -26); ctx.rotate(-0.4);
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-22, -14); ctx.lineTo(-30, 0); ctx.lineTo(-22, 14); ctx.lineTo(0, 4); ctx.closePath(); ink(ctx, C(HIDE), 2.5);
    ctx.restore();
    // 다리 (역관절)
    for (const sd of [-1, 1]) {
      const hx = sd * 36, hy = -112 + cr;
      const kx = sd * 60 + 14, ky = -68 + cr * 0.6;
      const ax = sd * 44 - 4, ay = -24;
      muscle(ctx, hx, hy, kx, ky, 26, 18, 10, sd > 0 ? HIDE : mix(HIDE, '#000000', 0.25), 'dm_thigh');
      muscle(ctx, kx, ky, ax, ay, 17, 11, 6, sd > 0 ? HIDE : mix(HIDE, '#000000', 0.25), 'dm_shin');
      ctx.fillStyle = C('#1a0c0a'); ctx.beginPath(); ctx.moveTo(kx + 8, ky - 6); ctx.lineTo(kx + 24, ky - 2); ctx.lineTo(kx + 8, ky + 8); ctx.closePath(); ctx.fill();
      // 발 + 발톱
      ctx.save(); ctx.translate(ax, ay);
      ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(24, -4); ctx.quadraticCurveTo(34, 8, 26, 24); ctx.lineTo(-16, 24); ctx.quadraticCurveTo(-20, 8, -14, -6); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dm_foot', 0, -6, 0, 24, [0, HIDE, 1, HIDE_D]), 3);
      ctx.fillStyle = C('#140a08');
      for (let k = 0; k < 3; k++) { const bx = -6 + k * 13; ctx.beginPath(); ctx.moveTo(bx, 20); ctx.quadraticCurveTo(bx + 10, 20, bx + 14, 30); ctx.quadraticCurveTo(bx + 6, 28, bx, 26); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // 허리 누더기
    ctx.beginPath(); ctx.moveTo(-44, -120 + cr); ctx.lineTo(44, -120 + cr);
    for (let i = 0; i < 7; i++) ctx.lineTo(40 - i * 13, -86 + cr + (i % 2) * 14 + Math.sin(t * 2 + i) * 3);
    ctx.closePath();
    ink(ctx, C('#1a0a0e'), 2.5);
    // 몸통
    ctx.save(); ctx.translate(0, cr + breathe * 0.3);
    ctx.beginPath();
    ctx.moveTo(-40, -118);
    ctx.bezierCurveTo(-54, -150, -82, -178, -88, -208);
    ctx.quadraticCurveTo(-60, -232, 0, -230);
    ctx.quadraticCurveTo(60, -232, 88, -208);
    ctx.bezierCurveTo(82, -178, 54, -150, 40, -118);
    ctx.quadraticCurveTo(0, -108, -40, -118); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dm_torso', -90, 0, 90, 0, [0, mix(HIDE_D, '#8aa0ff', 0.3), 0.14, HIDE_D, 0.45, HIDE, 0.72, mix(HIDE, HIDE_L, 0.4), 0.9, HIDE, 1, HIDE_D]), 4);
    if (!fl) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = LG(ctx, 'dm_torso_v', 0, -232, 0, -110, [0, 'rgba(255,200,160,0.18)', 0.4, 'rgba(0,0,0,0)', 1, 'rgba(20,0,0,0.5)']);
      ctx.fillRect(-100, -240, 200, 140);
      // 가슴 근육 + 복근 판
      ctx.strokeStyle = 'rgba(40,0,4,0.75)'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-60, -206); ctx.quadraticCurveTo(-30, -184, 0, -196); ctx.quadraticCurveTo(30, -184, 60, -206);
      ctx.moveTo(0, -196); ctx.lineTo(0, -120);
      for (let i = 0; i < 3; i++) { const yy = -172 + i * 17; ctx.moveTo(-26 + i * 2, yy); ctx.quadraticCurveTo(0, yy + 5, 26 - i * 2, yy); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,110,0.22)';
      ctx.beginPath(); ctx.ellipse(-30, -206, 22, 10, 0.3, 0, TAU); ctx.ellipse(34, -206, 22, 10, -0.3, 0, TAU); ctx.fill();
      ctx.restore();
      // 가슴 지옥불 문양
      const pu = 0.7 + 0.3 * Math.sin(t * 5) + d.glowC * 0.4;
      glow(ctx, 0, -176, 46 * pu, HELL, 0.8);
      ctx.strokeStyle = HELL_L; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, -196); ctx.lineTo(-10, -178); ctx.lineTo(0, -160); ctx.lineTo(10, -178); ctx.closePath(); ctx.moveTo(-18, -186); ctx.lineTo(18, -186); ctx.stroke();
    }
    ctx.restore();
    // 팔 (IK) — 손 위치는 월드 좌표 → 지역으로 변환
    const toL = (hx, hy) => ({ x: (hx - this.cx) / (f * s), y: (hy - (this.bottom - d.hover)) / s });
    const hl = toL(this.hands.l.x, this.hands.l.y), hr = toL(this.hands.r.x, this.hands.r.y);
    const armBack = f > 0 ? hl : hr, armFront = f > 0 ? hr : hl;
    this.demonArm(ctx, -1, armBack, cr, fl, t);
    // 머리
    this.demonHead(ctx, t, cr, fl);
    this.demonArm(ctx, 1, armFront, cr, fl, t);
    ctx.restore();
  }
  demonArm(ctx, sd, hand, cr, fl, t) {
    const sx = sd * 84, sy = -206 + cr;
    const L1 = 70, L2 = 66;
    let dx = hand.x - sx, dy = hand.y - sy, dd = Math.hypot(dx, dy);
    const reach = L1 + L2 - 4;
    let wx = hand.x, wy = hand.y;
    if (dd > reach) { wx = sx + dx / dd * reach; wy = sy + dy / dd * reach; dd = reach; }
    const a0 = Math.atan2(wy - sy, wx - sx);
    const ce = clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd || 1), -1, 1);
    const ea = a0 - sd * Math.acos(ce);
    const ex = sx + Math.cos(ea) * L1, ey = sy + Math.sin(ea) * L1;
    const col = sd > 0 ? HIDE : mix(HIDE, '#000000', 0.3);
    // 어깨 가시
    ctx.beginPath(); ctx.moveTo(sx - 20, sy - 6); ctx.quadraticCurveTo(sx + sd * 10, sy - 50, sx + sd * 30, sy - 60); ctx.quadraticCurveTo(sx + sd * 18, sy - 30, sx + 20, sy - 6); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dm_ssp' + sd + '_' + Math.round(sy), 0, sy - 60, 0, sy, [0, HORN_L, 1, HORN]), 2.5);
    muscle(ctx, sx, sy, ex, ey, 30, 22, 12, col, 'dm_uarm');
    muscle(ctx, ex, ey, wx, wy, 23, 16, 8, col, 'dm_farm');
    ctx.save(); ctx.translate(ex, ey);
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU); ink(ctx, fl ? '#fff' : RG(ctx, 'dm_elb' + sd, -6, -6, 2, 0, 0, 18, [0, mix(col, '#ffc0a0', 0.4), 1, mix(col, '#000000', 0.4)]), 2.5);
    ctx.restore();
    // 팔뚝 가시
    ctx.fillStyle = C('#1a0c0a');
    for (let k = 0; k < 3; k++) { const u = 0.25 + k * 0.25, px = lerp(ex, wx, u), py = lerp(ey, wy, u); ctx.beginPath(); ctx.moveTo(px - 5, py - 16); ctx.lineTo(px - sd * 12, py - 32); ctx.lineTo(px + 5, py - 18); ctx.closePath(); ctx.fill(); }
    // 손 + 발톱
    ctx.save(); ctx.translate(wx, wy); ctx.rotate(Math.atan2(wy - ey, wx - ex) - PI / 2);
    ctx.beginPath(); ctx.ellipse(0, 10, 22, 18, 0, 0, TAU); ink(ctx, C(col), 3);
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath(); ctx.moveTo(k * 8 - 4, 20); ctx.quadraticCurveTo(k * 12, 44, k * 14 + 6, 54); ctx.quadraticCurveTo(k * 10 + 6, 36, k * 8 + 4, 20); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dm_claw', 0, 20, 0, 54, [0, '#2a1410', 0.6, '#0a0404', 1, '#ffd0a0']), 1.5);
    }
    ctx.restore();
  }
  demonHead(ctx, t, cr, fl) {
    const d = this.d2;
    ctx.save(); ctx.translate(14, -250 + cr);
    // 뿔 (뒤로 휘었다 위로 솟음)
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * 18 - 6, -22); ctx.bezierCurveTo(sd * 60, -40, sd * 76, -10, sd * 70, -70); ctx.quadraticCurveTo(sd * 66, -100, sd * 46, -118);
      ctx.quadraticCurveTo(sd * 60, -76, sd * 48, -48); ctx.quadraticCurveTo(sd * 36, -34, sd * 10 - 4, -10); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dm_horn' + sd, 0, -118, 0, -10, [0, '#fff4e0', 0.25, HORN_L, 0.7, HORN, 1, '#0a0606']), 3);
      if (!fl) { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let k = 0; k < 5; k++) { const u = k / 5; ctx.moveTo(sd * lerp(24, 62, u), lerp(-24, -90, u)); ctx.lineTo(sd * lerp(30, 70, u) + 6, lerp(-14, -80, u)); } ctx.stroke(); }
    }
    // 머리 (황소/박쥐 혼합의 악마 얼굴)
    ctx.beginPath();
    ctx.moveTo(-30, -18); ctx.bezierCurveTo(-34, -44, -10, -54, 10, -50); ctx.bezierCurveTo(30, -46, 42, -30, 44, -12);
    ctx.lineTo(50, 4); ctx.quadraticCurveTo(46, 12, 36, 12); ctx.lineTo(-16, 16); ctx.quadraticCurveTo(-30, 6, -30, -18);
    ink(ctx, fl ? '#fff' : LG(ctx, 'dm_head', -30, 0, 50, 0, [0, HIDE_D, 0.4, HIDE, 0.8, mix(HIDE, HIDE_L, 0.5), 1, HIDE]), 3.5);
    // 아래턱 (포효 시 벌어짐)
    const ja = d.jaw * 0.6;
    ctx.save(); ctx.translate(-10, 10); ctx.rotate(ja);
    ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(52, -2); ctx.quadraticCurveTo(50, 14, 30, 20); ctx.lineTo(0, 18); ctx.quadraticCurveTo(-10, 10, -6, -4); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dm_jaw', 0, -4, 0, 20, [0, HIDE, 1, HIDE_D]), 3);
    if (!fl) { ctx.fillStyle = '#fff4e0'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const tx = 6 + i * 8; ctx.moveTo(tx - 2.5, -2); ctx.lineTo(tx, -10 - (i % 2) * 4); ctx.lineTo(tx + 2.5, -2); } ctx.fill(); }
    ctx.restore();
    // 입 속 지옥불
    if (d.jaw > 0.05 && !fl) {
      ctx.fillStyle = '#2a0404'; ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(48, 8); ctx.lineTo(-8 + Math.cos(ja) * 56, 10 + Math.sin(ja) * 56); ctx.closePath(); ctx.fill();
      glowE(ctx, 24, 16 + ja * 20, 34, 16 + ja * 20, HELL, 0.4 + d.jaw * 0.6 + d.glowC * 0.4);
    }
    if (!fl) {
      // 윗니
      ctx.fillStyle = '#fff4e0'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const tx = 0 + i * 8; ctx.moveTo(tx - 2.5, 10); ctx.lineTo(tx, 20 + (i % 2) * 5); ctx.lineTo(tx + 2.5, 10); } ctx.fill();
      // 눈 (분노의 눈썹뼈 아래 빛나는 눈)
      ctx.fillStyle = '#1a0202'; ctx.beginPath(); ctx.moveTo(8, -30); ctx.lineTo(34, -24); ctx.lineTo(30, -16); ctx.lineTo(10, -20); ctx.closePath(); ctx.fill();
      glow(ctx, 24, -21, 26, EYE2, 0.9); glow(ctx, 24, -21, 8, '#ffffff', 1, true);
      ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.moveTo(14, -23); ctx.lineTo(30, -21); ctx.lineTo(26, -18); ctx.lineTo(15, -20); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1a0202'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, -36); ctx.lineTo(38, -26); ctx.stroke();
      // 콧구멍 + 주름
      ctx.fillStyle = '#1a0202'; ctx.beginPath(); ctx.ellipse(44, -4, 3, 2, 0.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(40,0,4,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(30, -10); ctx.quadraticCurveTo(38, -6, 40, 2); ctx.moveTo(-8, -40); ctx.quadraticCurveTo(0, -34, 6, -38); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,190,150,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-20, -40); ctx.quadraticCurveTo(10, -54, 34, -38); ctx.stroke();
    }
    // 귀 (박쥐)
    ctx.beginPath(); ctx.moveTo(-22, -34); ctx.lineTo(-52, -58); ctx.lineTo(-30, -20); ctx.closePath(); ink(ctx, C(HIDE_D), 2);
    ctx.restore();
  }
  demonWing(ctx, sd, t, open, fl) {
    const flap = Math.sin(t * 2.2) * 0.08;
    const k = 0.35 + open * 0.65;
    ctx.save();
    ctx.translate(sd * 40, -212);
    ctx.scale(sd, 1);
    ctx.rotate(-flap - (1 - k) * 0.6);
    ctx.scale(k, lerp(0.8, 1, k));
    const wx = 150, wy = -130;
    const tips = [[300, -70], [320, 30], [270, 130], [180, 170]];
    // 막
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wx, wy);
    for (let i = 0; i < tips.length; i++) {
      const [tx, ty] = tips[i];
      ctx.lineTo(tx, ty);
      const nx = i + 1 < tips.length ? tips[i + 1] : [30, 90];
      const ix = lerp((tx + nx[0]) / 2, wx, 0.32), iy = lerp((ty + nx[1]) / 2, wy, 0.32);
      ctx.quadraticCurveTo(ix, iy, nx[0], nx[1]);
    }
    ctx.closePath();
    if (!fl) {
      ctx.fillStyle = LG(ctx, 'dm_memb', 0, -130, 0, 170, [0, 'rgba(110,14,26,0.96)', 0.55, 'rgba(60,6,14,0.96)', 1, 'rgba(30,2,6,0.9)']);
      ctx.fill();
      ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();
      // 혈관 (막 안쪽에만 그려지도록 짧게)
      ctx.strokeStyle = 'rgba(255,80,60,0.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const [tx, ty] of tips) { const mx = (wx + tx) / 2, my = (wy + ty) / 2; ctx.moveTo(mx, my); ctx.quadraticCurveTo(mx - 20, my + 22, mx - 40, my + 34); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,80,0.1)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wx, wy); ctx.lineTo(tips[0][0], tips[0][1]); ctx.closePath(); ctx.fill();
    } else { ctx.fillStyle = '#fff'; ctx.fill(); }
    // 뼈대
    ctx.lineCap = 'round';
    for (const [col, lw] of [[OUT, 12], [HIDE_D, 8]]) {
      ctx.strokeStyle = C(col); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(wx, wy); for (const [tx, ty] of tips) { ctx.moveTo(wx, wy); ctx.lineTo(tx, ty); } ctx.stroke();
    }
    if (!fl) { ctx.strokeStyle = 'rgba(255,150,120,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -6); ctx.lineTo(wx, wy - 4); ctx.stroke(); }
    ctx.fillStyle = C(HORN_L); ctx.beginPath(); ctx.moveTo(wx - 6, wy - 4); ctx.lineTo(wx + 6, wy - 34); ctx.lineTo(wx + 10, wy); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ───────────── 도형/투사체 ─────────────
/** 근육질 팔다리: 한쪽이 불룩한 곡선 실루엣 + 원통 음영 + 근육 하이라이트 */
function muscle(ctx, x0, y0, x1, y1, r0, r1, bulge, col, key) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  ctx.beginPath();
  ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(L * 0.42, -(r0 + r1) / 2 - bulge, L, -r1);
  ctx.arc(L, 0, r1, -PI / 2, PI / 2);
  ctx.quadraticCurveTo(L * 0.5, (r0 + r1) / 2 + bulge * 0.45, 0, r0);
  ctx.arc(0, 0, r0, PI / 2, -PI / 2);
  ctx.closePath();
  const rr = Math.max(r0, r1) + bulge;
  const g = R.fl ? '#fff' : LG(ctx, key + col + Math.round(rr), 0, -rr, 0, rr, [0, mix(col, '#ffd0b0', 0.45), 0.3, col, 0.7, mix(col, '#000000', 0.5), 0.92, mix(col, '#9fb0ff', 0.25), 1, mix(col, '#000000', 0.65)]);
  ink(ctx, g, 3.2);
  if (!R.fl) {
    ctx.strokeStyle = 'rgba(40,0,4,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L * 0.18, -r0 * 0.2); ctx.quadraticCurveTo(L * 0.45, -bulge * 0.6, L * 0.8, -r1 * 0.1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,150,0.3)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(L * 0.15, -r0 * 0.75); ctx.quadraticCurveTo(L * 0.42, -(r0 + r1) / 2 - bulge * 0.85, L * 0.82, -r1 * 0.8); ctx.stroke();
  }
  ctx.restore();
}
function drawBat(ctx, x, y, s, ph, a, vx) {
  if (a <= 0.02) return;
  const fl = Math.sin(ph) * 0.8;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.translate(x, y); ctx.scale(vx < 0 ? -1 : 1, 1);
  ctx.fillStyle = '#0a0508';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-s * 0.6, -s * (0.6 + fl), -s * 1.4, -s * fl * 0.6);
  ctx.quadraticCurveTo(-s * 0.9, -s * 0.1, -s * 0.5, s * 0.2);
  ctx.quadraticCurveTo(0, s * 0.1, s * 0.5, s * 0.2);
  ctx.quadraticCurveTo(s * 0.9, -s * 0.1, s * 1.4, -s * fl * 0.6);
  ctx.quadraticCurveTo(s * 0.6, -s * (0.6 + fl), 0, 0);
  ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 0.28, s * 0.35, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff3040'; ctx.fillRect(s * 0.05, -s * 0.05, 1.5, 1.5);
  ctx.restore();
}
function hellRender(ctx, p) {
  const r = Math.max(p.w, p.h) * 0.5;
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  glowE(ctx, -r * 1.4, 0, r * 3.2, r * 1.8, HELL, 0.75);
  glowE(ctx, -r * 0.4, 0, r * 1.6, r * 1.1, HELL_L, 0.9);
  ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.fill();
}
function bloodRender(ctx, p) {
  const r = Math.max(p.w, p.h) * 0.5;
  glow(ctx, 0, 0, r * 2.6, BLOOD, 0.7);
  ctx.fillStyle = '#6a0010'; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff9aa4'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.3, 0, TAU); ctx.fill();
}
function batProjRender(ctx, p) {
  glow(ctx, 0, 0, 22, BLOOD, 0.35);
  drawBat(ctx, 0, 0, 13, p.t * 30, 1, p.vx);
}
function paintDarkFlame(ctx, x, F, H, w, t, a) {
  if (H < 2) return;
  ctx.save();
  ctx.globalAlpha *= a;
  glowE(ctx, x, F - H * 0.5, w * 1.6, H * 0.6, '#9030e0', 0.6);
  // 불꽃 혀
  for (let i = 0; i < 3; i++) {
    const k = 1 - i * 0.28;
    ctx.beginPath();
    ctx.moveTo(x - w * k, F);
    for (let j = 1; j <= 6; j++) { const u = j / 6; ctx.lineTo(x - w * k * (1 - u) + Math.sin(t * 14 + j * 2 + i) * 6 * (1 - u), F - H * u * (0.8 + 0.2 * k)); }
    for (let j = 6; j >= 0; j--) { const u = j / 6; ctx.lineTo(x + w * k * (1 - u) + Math.sin(t * 13 + j * 1.7 + i) * 6 * (1 - u), F - H * u * (0.75 + 0.2 * k)); }
    ctx.closePath();
    ctx.fillStyle = i === 0 ? 'rgba(40,6,60,0.9)' : i === 1 ? 'rgba(150,40,220,0.85)' : 'rgba(255,90,130,0.9)';
    ctx.fill();
  }
  glowE(ctx, x, F - 10, w, 16, '#ff6090', 0.8);
  ctx.restore();
}
function paintHellWave(ctx, x, F, H, d, t, a) {
  ctx.save(); ctx.globalAlpha *= a;
  ctx.translate(x, F); ctx.scale(d, 1);
  glowE(ctx, 0, -H * 0.5, 50, H * 0.8, HELL, 0.6);
  ctx.beginPath(); ctx.moveTo(-70, 0); ctx.quadraticCurveTo(-20, -H * 0.4, 0, -H); ctx.quadraticCurveTo(10, -H * 0.4 + Math.sin(t * 20) * 4, 26, 0); ctx.closePath();
  const g = ctx.createLinearGradient(0, -H, 0, 0); g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(0.5, 'rgba(255,120,40,0.85)'); g.addColorStop(1, 'rgba(120,20,0,0.5)');
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
}
function paintRedBeam(ctx, l, a, t) {
  const fade = Math.min(1, a * 10, (1 - a) * 5);
  const dx = l.x1 - l.x0, dy = l.y1 - l.y0, L = Math.hypot(dx, dy);
  ctx.save();
  ctx.translate(l.x0, l.y0); ctx.rotate(Math.atan2(dy, dx));
  ctx.globalCompositeOperation = 'lighter';
  const wob = 1 + Math.sin(t * 50) * 0.1;
  ctx.globalAlpha = 0.35 * fade; ctx.fillStyle = '#a00018'; ctx.fillRect(0, -28 * wob, L, 56 * wob);
  ctx.globalAlpha = 0.7 * fade; ctx.fillStyle = BLOOD; ctx.fillRect(0, -15 * wob, L, 30 * wob);
  ctx.globalAlpha = 0.95 * fade; ctx.fillStyle = '#ffe0e4'; ctx.fillRect(0, -5, L, 10);
  ctx.restore();
  glow(ctx, l.x0, l.y0, 60, BLOOD, fade);
  glow(ctx, l.x1, l.y1, 90, BLOOD, fade);
}
