// 6장 보스: 그리모어 — 금단의 살아있는 마도서
// 패턴: 책장 폭풍(칼날 종이 파도) / 마도서 악령 소환 / 원소 주문 순환(화염 기둥 → 빙창 고리 → 낙뢰) / 눈의 광선(추적 후 쓸기) /
//       내려찍기(종이 충격파) / 물어뜯기 돌진
// 페이즈: 1 = 붉은 잉크(룬 2배, 책장이 핏빛으로) · 2 = 금단의 장(사슬이 끊기고 보랏빛 불꽃, 두 원소 동시 시전)
import { ABoss, beginDraw, endDraw, C, rg, lg, glow, ink, rim, sheen, taper, eye, shadow, hash, opt, flames, bolt, PI, OUT, RIM, groundWave, erupt } from './a_common.js';
import { rand, clamp, lerp, TAU, angleTo, rgba, ease } from '../../core/math.js';
import { audio } from '../../core/audio.js';
import { paintedDebris } from '../../render/painted/registry.js';

const LEATHER = '#241a2a', LEATHER2 = '#4a3050', ARC = '#b060ff', ARC2 = '#e0b0ff', PAGE = '#efe2c4', IRON = '#8a8494', GOLD = '#c8a048';
const ELEM = { fire: { c: '#ff7a2a', c2: '#ffd070', name: '화염' }, ice: { c: '#9fe8ff', c2: '#ffffff', name: '냉기' }, thunder: { c: '#bfe0ff', c2: '#ffffff', name: '번개' } };
const CYCLE = ['fire', 'ice', 'thunder'];

export class Grimoire extends ABoss {
  setup() {
    this.y = this.floorY - 130 - this.h;
    this.open = 0; this.eyeOpen = 1; this.blink = 0; this.lookX = 0; this.lookY = 0; this.tilt = 0; this.fury = 0;
    this.elemI = 0; this.elem = 'fire'; this.runeK = 0; this.chainsBroken = false;
    this.flutter = 0;
  }
  hurtboxes() { return [{ x: this.x + 8, y: this.y + 6, w: this.w - 16, h: this.h - 12 }]; }
  onIntro() { audio.sfx('magic', { pitch: 0.5 }); this.eyeOpen = 1; this.open = 0.6; }
  moves() {
    const ph = this.phase;
    return [['pages', 2.6], ['summon', this.minionCount() < (ph >= 2 ? 3 : 2) ? 1.4 : 0], ['spell', 3], ['beam', 2.2], ['slam', 1.8], ['bite', 2]];
  }
  idleMove(dt, world, p) {
    const A = this.A, side = this.cx > p.cx ? 1 : -1;
    this.flyTo(clamp(p.cx + side * 290, A.x0 + 120, A.x1 - 120), A.floor - 220 + Math.sin(this.t * 1.5) * 24, 2, 240, dt);
    this.facePlayer();
    this.relax(dt);
  }
  relax(dt) {
    const k = Math.min(1, dt * 4);
    this.open = lerp(this.open, 0.08 + Math.sin(this.t * 1.7) * 0.05, k); this.runeK = lerp(this.runeK, 0, Math.min(1, dt * 2));
  }
  think(dt, world) {
    super.think(dt, world);
    const p = this.player;
    this.fury = lerp(this.fury, this.phase / 2, Math.min(1, dt * 2));
    // 낙뢰 섬광 (직접 설정한 만큼만 되돌림)
    if (this.flashL > 0 && world.lighting) { this.flashL = Math.max(0, this.flashL - dt * 3); world.lighting.lightning = this.flashL; }
    this.tilt = lerp(this.tilt, clamp(this.vx / 900, -0.3, 0.3), Math.min(1, dt * 5));
    this.flutter += dt * (4 + this.open * 20);
    // 눈동자가 플레이어를 추적
    if (p) {
      const ex = this.cx + this.facing * 10, ey = this.cy - 8;
      const a = angleTo(ex, ey, p.cx, p.cy - 20), d = Math.min(1, Math.hypot(p.cx - ex, p.cy - ey) / 300);
      this.lookX = lerp(this.lookX, Math.cos(a) * 9 * d * this.facing, Math.min(1, dt * 8)); this.lookY = lerp(this.lookY, Math.sin(a) * 7 * d, Math.min(1, dt * 8));
    }
    // 깜빡임
    this.blink -= dt;
    if (this.blink < -3.5 + Math.random() * 0.5) this.blink = 0.14;
    if (Math.random() < dt * (5 + this.phase * 5)) this.fx.emit('magic', this.cx + rand(-60, 60), this.cy + rand(-70, 70), { speed: 30, color: this.phase >= 1 ? '#ff5a8a' : ARC });
  }
  get eyePos() { return { x: this.cx + this.facing * (10 + this.lookX * 0.2) * 1.22, y: this.cy - 6 }; }

  // ── 책장 폭풍 ──
  s_pages(dt, world, p) {
    const W = 0.6, waves = 3 + (this.phase >= 2 ? 1 : 0), n = this.phase >= 1 ? 6 : 5;
    this.vx *= 0.9; this.vy *= 0.9; this.facePlayer();
    this.open = lerp(this.open, 1, Math.min(1, dt * 6));
    if (this.at(0)) { this.warnMark(this.cx, this.y - 30, W); audio.sfx('magic', { pitch: 0.7 }); }
    if (this.stateT < W) { if (Math.random() < 0.8) this.fx.emit('magic', this.cx + this.facing * 40, this.cy + rand(-40, 40), { speed: 60, color: '#fff2d0' }); return; }
    const k = this.every(W, 0.38, waves);
    if (k >= 0) {
      const mx = this.cx + this.facing * 50, my = this.cy;
      const a = angleTo(mx, my, p.cx, p.cy - 10);
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.2 + (k % 2 ? 0.1 : 0), sp = 340 + (i % 2) * 40;
        this.shoot({ x: mx, y: my, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, w: 18, h: 18, render: drawRazorPage, color: this.phase >= 1 ? '#ff5a8a' : ARC, life: 3, spin: 14 * (i % 2 ? 1 : -1), collideWalls: true, attack: { mv: 0.6, kb: [180, -200] } });
      }
      audio.sfx('slash', { pitch: 1.4, vol: 0.6 }); this.flutter += 3;
    }
    if (this.stateT > W + waves * 0.38 + 0.4) this.rest(1.0);
  }

  // ── 마도서 악령 소환 ──
  s_summon(dt, world, p) {
    this.vx *= 0.9; this.vy *= 0.9; this.facePlayer();
    this.open = lerp(this.open, 1.1, Math.min(1, dt * 5)); this.runeK = lerp(this.runeK, 1, dt * 4);
    if (this.at(0)) { audio.sfx('magic', { pitch: 0.4, vol: 0.9 }); this.warnMark(this.cx, this.y - 30, 0.8); }
    if (this.stateT < 0.8 && Math.random() < 0.8) { const a = rand(0, TAU); this.fx.emit('magic', this.cx + Math.cos(a) * 90, this.cy + Math.sin(a) * 90, { vx: -Math.cos(a) * 120, vy: -Math.sin(a) * 120, speed: 0, color: ARC2 }); }
    if (this.at(0.8)) {
      const n = this.phase >= 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const s = i % 2 ? 1 : -1;
        this.summon('book_fiend', this.cx + s * rand(70, 130), this.cy + rand(-20, 40), this.phase >= 2 ? 3 : 2, { fx: 'magic', color: ARC });
      }
      audio.sfx('magic', { pitch: 1.2 });
    }
    if (this.stateT > 1.3) this.rest(0.9);
  }

  // ── 원소 주문 순환 ──
  s_spell(dt, world, p) {
    const A = this.A;
    this.vx *= 0.9; this.vy *= 0.9; this.facePlayer();
    this.open = lerp(this.open, 0.85, Math.min(1, dt * 5)); this.runeK = lerp(this.runeK, 1, Math.min(1, dt * 5));
    if (this.at(0)) {
      this.elem = CYCLE[this.elemI % 3]; this.elemI++;
      this.elem2 = this.phase >= 2 || this.inferno ? CYCLE[this.elemI % 3] : null;
      audio.sfx(this.elem === 'thunder' ? 'thunder' : this.elem, { pitch: 0.6 });
      this.warnMark(this.cx, this.y - 30, 0.7, { color: ELEM[this.elem].c });
      world.fx.text(this.cx, this.y - 50, `${ELEM[this.elem].name}의 장${this.elem2 ? ' · ' + ELEM[this.elem2].name + '의 장' : ''}`, { color: ELEM[this.elem].c, size: 18, life: 1.2, vy: -30 });
    }
    const T = 0.55;
    this.cast(this.elem, T, dt, world, p, 0);
    if (this.elem2) this.cast(this.elem2, T + 0.5, dt, world, p, 1);
    if (this.stateT > T + (this.elem2 ? 3.1 : 2.6)) this.rest(1.0);
  }
  cast(el, T, dt, world, p, slot) {
    const A = this.A;
    if (el === 'fire') {
      const n = 3 + this.phase;
      const k = this.every(T, 0.22, n);
      if (k >= 0) {
        const x = k === 0 ? p.cx : clamp(p.cx + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 150 + rand(-20, 20), A.x0 + 30, A.x1 - 30);
        erupt(this, x, { delay: 0.85, life: 0.5, w: 70, h: 230, color: '#ff7a2a', style: 'fire', mv: 1.0, element: 'fire', draw: null });
        this.warn({ type: 'circle', px: x, py: A.floor, r: 46, life: 0.85, color: '#ff7a2a' });
      }
    } else if (el === 'ice') {
      const n = 8;
      if (this.at(T)) {
        this.shards = [];
        for (let i = 0; i < n; i++) this.shards.push({ a: (i / n) * TAU, born: this.stateT });
      }
      if (this.shards && this.stateT >= T && this.stateT < T + 0.8) {
        for (const s of this.shards) { const r = 96, x = this.cx + Math.cos(s.a + this.stateT) * r, y = this.cy + Math.sin(s.a + this.stateT) * r; if (Math.random() < 0.15) world.fx.emit('ice', x, y, { speed: 20 }); }
      }
      const k = this.every(T + 0.8, 0.12, n);
      if (k >= 0 && this.shards) {
        const s = this.shards[k], x = this.cx + Math.cos(s.a + this.stateT) * 96, y = this.cy + Math.sin(s.a + this.stateT) * 96;
        const a = angleTo(x, y, p.cx, p.cy - 10);
        this.shoot({ x, y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, w: 18, h: 18, render: 'shard', color: '#bff4ff', life: 2.4, light: { r: 50, color: '#9fe8ff', i: 0.6 }, trail: 'ice', trailRate: 0.05, attack: { mv: 0.7, element: 'ice', type: 'mag' } });
        audio.sfx('ice', { pitch: 1.2, vol: 0.5 });
      }
    } else {
      const n = 3 + this.phase;
      const k = this.every(T, 0.28, n);
      if (k >= 0) {
        const x = k === 0 ? p.cx : clamp(rand(A.x0 + 40, A.x1 - 40), A.x0 + 30, A.x1 - 30);
        const top = A.floor - 520;
        this.beam({ x0: x, y0: top, x1: x, y1: A.floor, warn: 0.85, active: 0.22, fade: 0.2, width: 56, color: '#bfe0ff', warnColor: '#9fc8ff', mv: 1.0, element: 'thunder', drawFn: drawLightning,
          onFire: (b, w) => { audio.sfx('thunderclap', { vol: 0.8 }); w.camera.shake(7, 0.2); w.fx.burst('thunder', x, A.floor - 6, 16, { speed: 400 }); w.fx.flash(x, A.floor - 40, { color: '#dff0ff', size: 160, life: 0.15 }); this.flashL = 0.6; } });
      }
    }
  }

  // ── 눈의 광선 ──
  s_beam(dt, world, p) {
    const A = this.A, W = 1.0, D = 1.3;
    this.vx *= 0.9; this.vy *= 0.9;
    this.open = lerp(this.open, 0, Math.min(1, dt * 8));
    if (this.at(0)) {
      this.facePlayer();
      audio.sfx('charge_ready', { pitch: 0.5 });
      this.bA = angleTo(this.eyePos.x, this.eyePos.y, p.cx, p.cy - 10);
      this.bSweep = (p.vx > 30 ? 1 : p.vx < -30 ? -1 : (Math.random() < 0.5 ? 1 : -1)) * 0.55 * (Math.cos(this.bA) >= 0 ? 1 : -1);
      const self = this;
      this.beamE = this.beam({ x0: this.eyePos.x, y0: this.eyePos.y, x1: this.eyePos.x, y1: this.eyePos.y, warn: W, active: D, fade: 0.25, width: 48, color: ARC, warnColor: '#ff5ad0', mv: 0.28, element: 'dark',
        onFire: (b, w) => { audio.sfx('dark', { pitch: 0.6 }); audio.sfx('magic', { pitch: 0.4 }); w.camera.shake(6, 0.3); },
        tick: (b, dtt, w) => { b.attack.rehit = 0.25; if (Math.random() < 0.5) w.fx.emit('magic', b.x1, b.y1, { speed: 200, color: ARC2 }); },
        follow: (b, dtt, w) => {
          const e = self.eyePos;
          if (b.t < W * 0.75) self.bA = lerp(self.bA, angleTo(e.x, e.y, p.cx, p.cy - 10), Math.min(1, dtt * 6));
          else if (b.t > W) self.bA += self.bSweep * dtt / D;
          b.x0 = e.x; b.y0 = e.y;
          // 광선 끝: 바닥 또는 1400px
          const cx = Math.cos(self.bA), cy = Math.sin(self.bA);
          let L = 1400;
          if (cy > 0.01) L = Math.min(L, (A.floor - e.y) / cy);
          b.x1 = e.x + cx * L; b.y1 = e.y + cy * L;
        } });
    }
    if (this.stateT < W) { this.eyeOpen = 1 + this.stateT * 0.4; return; }
    if (this.stateT < W + D) { if (this.beamE) { const b = this.beamE; if (b.y1 >= A.floor - 4 && Math.random() < 0.6) world.fx.emit('magic', b.x1, A.floor - 4, { speed: 160, angle: -PI / 2, color: ARC }); } return; }
    this.eyeOpen = 1;
    if (this.stateT > W + D + 0.5) this.rest(1.0);
  }

  // ── 내려찍기 ──
  s_slam(dt, world, p) {
    const A = this.A, TR = 0.75;
    if (this.at(0)) { this.leapLanded = false; audio.sfx('magic', { pitch: 0.4 }); this.warn({ type: 'column', cx0: this.cx, cw: 150, y0: A.floor - 360, y1: A.floor, life: TR + 0.2, color: ARC, follow: (tg) => { if (this.stateT < TR) tg.cx0 = this.cx; } }); }
    this.open = lerp(this.open, 0, Math.min(1, dt * 8));
    if (this.stateT < TR) { this.flyTo(clamp(p.cx, A.x0 + 80, A.x1 - 80), A.floor - 330, 6, 560, dt); return; }
    if (this.stateT < TR + 0.2) { this.vx = 0; this.vy = -80; this.tilt = 0; return; }
    if (!this.leapLanded) {
      if (this.at(TR + 0.2)) { this.vy = 1450; audio.sfx('dash', { pitch: 0.5 }); }
      this.vx = 0;
      for (const hb of this.hurtboxes()) this.strikeRect(hb, 1.3);
      if (this.bottom >= this.floorY - 2) {
        this.y = this.floorY - 2 - this.h; this.vy = 0; this.leapLanded = true; this.landT = this.stateT;
        this.impact(this.cx, this.floorY, 13, 0.06, ARC2);
        audio.sfx('hit_heavy', { pitch: 0.6 }); audio.sfx('explode', { pitch: 0.9, vol: 0.5 });
        for (const s of [-1, 1]) groundWave(this, this.cx + s * 40, s, { speed: 500 + this.phase * 40, color: ARC, color2: '#fff0ff', style: 'arcane', mv: 0.9, element: 'dark', type: 'mag' });
        world.fx.burst('shard', this.cx, this.floorY - 20, 16, { color: PAGE, speed: 320, grav: 200 });
      }
      if (this.stateT > TR + 2.2) { this.leapLanded = true; this.landT = this.stateT; }
      return;
    }
    if (this.stateT - this.landT > 0.55) { this.vy = -380; this.rest(0.8); }
  }

  // ── 물어뜯기 돌진 ──
  s_bite(dt, world, p) {
    const W = 0.55;
    if (this.at(0)) {
      this.facePlayer(); this.vx = 0; this.vy = 0;
      this.tx = p.cx; this.ty = p.cy - 20;
      this.warnLine(this.cx, this.cy, this.tx, this.ty, W, { width: 90, color: '#ff4ad0' });
      audio.sfx('magic', { pitch: 0.5 });
    }
    if (this.stateT < W) { this.open = lerp(this.open, 1.25, Math.min(1, dt * 8)); this.vx *= 0.8; this.vy *= 0.8; return; }
    if (this.at(W)) { const a = angleTo(this.cx, this.cy, this.tx, this.ty); this.vx = Math.cos(a) * 900; this.vy = Math.sin(a) * 900; audio.sfx('dash', { pitch: 0.8 }); }
    if (this.stateT < W + 0.35) {
      for (const hb of this.hurtboxes()) this.strikeRect(hb, 1.25, { kb: [420, -380] });
      if (this.bottom > this.floorY - 4 && this.vy > 0) { this.vy = 0; this.y = this.floorY - 4 - this.h; }
      if (this.stateT > W + 0.22 && this.open > 0.5) { this.open = 0; audio.sfx('clang', { pitch: 0.9, vol: 0.7 }); this.shake(5, 0.15); this.fx.burst('shard', this.cx + this.facing * 40, this.cy, 10, { color: PAGE, speed: 220, grav: 200 }); }
      return;
    }
    this.vx *= 0.9; this.vy *= 0.9;
    if (this.stateT > W + 0.8) this.rest(0.8);
  }

  // ── 페이즈 ──
  onPhase(n, world) {
    this.setState('transform'); this.transformTime = 1.4;
    world.banner = n === 1
      ? { text: '붉은 잉크', sub: '책장이 핏빛 글자로 물들어 간다', t: 1.8, color: '#ff5a8a' }
      : { text: '금단의 장', sub: '봉인의 사슬이 끊기고 금서가 스스로를 펼친다', t: 2, color: ARC };
  }
  transformTick(dt, world, p) {
    this.open = 1.2; this.runeK = 1.3; this.flutter += dt * 20;
    if (this.at(0.35)) {
      this.phaseBurst(this.phase >= 2 ? ARC : '#ff5a8a');
      audio.sfx('dark', { pitch: 0.5 }); audio.sfx('magic', { pitch: 0.3 });
      if (this.phase >= 2) { this.chainsBroken = true; this.fx.burst('spark', this.cx, this.cy, 24, { color: IRON, speed: 400 }); audio.sfx('clang', { pitch: 1.4 }); }
    }
    if (Math.random() < 0.9) this.fx.emit('magic', this.cx + rand(-70, 70), this.cy + rand(-80, 80), { speed: 180, color: this.phase >= 2 ? ARC2 : '#ff8ab0' });
  }
  phaseApply(n) { if (n >= 2) this.chainsBroken = true; }
  deathStart() { audio.sfx('magic', { pitch: 0.3 }); }
  deathTick(dt) { this.open = 1.2 + Math.sin(this.deathT * 30) * 0.1; this.flutter += dt * 40; this.vy = 30; if (Math.random() < 0.6) this.fx.emit('shard', this.cx, this.cy, { color: PAGE, speed: 300, grav: 150, size: 6 }); }
  debrisPiece(i) { return paintedDebris(this, i) ?? { size: 12, draw: i % 3 ? drawPageBit : drawCornerBit }; }   // 채색 렌더러가 준비됐으면 채색 낱장·표지 조각
  extraLights(L) { const e = this.eyePos; L.add(e.x, e.y, 90 + this.fury * 40, ARC, 0.9); if (this.runeK > 0.1) L.add(this.cx, this.cy, 180, ELEM[this.elem].c, 0.5 * this.runeK); }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx, world) {
    beginDraw(this);
    const X = this.cx, Y = this.cy, t = this.t;
    const alt = clamp((this.floorY - this.bottom) / 300, 0, 1);
    shadow(ctx, X, this.floorY - 2, 80 * (1 - alt * 0.4), 12, 0.5 * (1 - alt * 0.5));
    ctx.save();
    const jx = this.flashT > 0 ? rand(-2, 2) : 0;
    ctx.translate(X + jx, Y + Math.sin(t * 2.2) * 3); ctx.rotate(this.tilt + Math.sin(t * 1.3) * 0.03); ctx.scale(this.facing * 1.22, 1.22);
    this.drawBook(ctx, t);
    ctx.restore();
    endDraw();
  }
  drawBook(ctx, t) {
    const o = clamp(this.open, 0, 1.3), fury = this.fury, W = 118, H = 150, hw = W / 2, hh = H / 2;
    const ec = this.runeK > 0.05 ? ELEM[this.elem].c : ARC;
    // 오라 + 룬 원
    glow(ctx, 0, 0, 200, '#2a0a3a', 0.7);
    glow(ctx, 0, 0, 170, this.phase >= 1 ? '#ff3a8a' : ARC, 0.14 + fury * 0.12);
    if (this.chainsBroken) flames(ctx, 0, -hh + 10, -PI / 2, 7, 60 + Math.sin(t * 5) * 8, t, ARC, 16, 4, '#ff8aff', 0.35);
    this.runeCircle(ctx, t, ec);
    // 궤도를 도는 책장
    this.orbitPages(ctx, t, 0);
    // 뒤표지
    ctx.beginPath(); roundRect(ctx, -hw - 6, -hh - 4, W + 8, H + 8, 8);
    ink(ctx, lg(ctx, 'grback', 0, -hh, 0, hh, [0, C('#3a2640'), 1, C('#140c18')]), 3);
    // 책장 뭉치 (책배가 이빨처럼)
    ctx.beginPath();
    ctx.moveTo(-hw + 2, -hh + 4); ctx.lineTo(hw + 2, -hh + 6);
    for (let i = 0; i <= 12; i++) { const y = lerp(-hh + 6, hh - 6, i / 12); ctx.lineTo(hw + 2 + (i % 2 ? 9 + o * 8 : 0) + Math.sin(this.flutter + i) * o * 2, y); }
    ctx.lineTo(hw + 2, hh - 4); ctx.lineTo(-hw + 2, hh - 2); ctx.closePath();
    ink(ctx, lg(ctx, 'grpages' + (this.phase >= 1 ? 1 : 0), -hw, 0, hw + 10, 0, [0, C('#8a7a5a'), 0.6, C(PAGE), 1, C(this.phase >= 1 ? '#f0b0a0' : '#fff8e8')]), 2);
    // 펼쳐진 안쪽 (소용돌이 입)
    if (o > 0.05) {
      const k = clamp(o, 0, 1);
      ctx.save();
      ctx.beginPath(); ctx.rect(-hw + 4, -hh + 8, W - 8, H - 16); ctx.clip();
      ctx.fillStyle = lg(ctx, null, -hw, 0, hw, 0, [0, C('#d8c8a0'), 1, C(PAGE)]);
      ctx.fillRect(-hw + 4, -hh + 8, W - 8, H - 16);
      // 글자 줄
      ctx.strokeStyle = C(this.phase >= 1 ? 'rgba(150,20,40,0.55)' : 'rgba(60,40,30,0.45)'); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const y = -hh + 18 + i * 11; ctx.moveTo(-hw + 12, y); ctx.lineTo(-hw + 12 + 40 + hash(i) * 50, y); }
      ctx.stroke();
      // 소용돌이 마귀 입
      const mr = 26 + k * 22;
      const g = ctx.createRadialGradient(8, 0, 2, 8, 0, mr);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.2, this.phase >= 2 ? '#ff8aff' : ARC2); g.addColorStop(0.6, '#3a0a5a'); g.addColorStop(1, 'rgba(20,0,30,0)');
      ctx.globalAlpha *= k;
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(8, 0, mr, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(ARC2, 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); for (let i = 0; i < 3; i++) { const a0 = t * 4 + i * 2.1; ctx.arc(8, 0, mr * (0.4 + i * 0.2), a0, a0 + 2.2); } ctx.stroke();
      // 이빨 (종이 가장자리)
      ctx.fillStyle = C('#fffaf0'); ctx.strokeStyle = C(OUT); ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + t * 0.3, x = 8 + Math.cos(a) * mr * 0.95, y = Math.sin(a) * mr * 0.95;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a + 1.6) * 5, y + Math.sin(a + 1.6) * 5); ctx.lineTo(8 + Math.cos(a) * mr * 0.55, Math.sin(a) * mr * 0.55); ctx.lineTo(x + Math.cos(a - 1.6) * 5, y + Math.sin(a - 1.6) * 5); ctx.closePath(); ctx.stroke(); ctx.fill();
      }
      ctx.restore();
    }
    // 앞표지 (경첩 = 뒤쪽 가장자리, 열리면 앞으로 젖혀짐)
    const th = clamp(o, 0, 1.3) * PI * 0.62, cw = Math.cos(th) * W, pers = Math.sin(th) * 12;
    ctx.beginPath();
    ctx.moveTo(-hw, -hh); ctx.lineTo(-hw + cw, -hh - pers); ctx.lineTo(-hw + cw, hh + pers); ctx.lineTo(-hw, hh); ctx.closePath();
    const inside = cw < 0;
    ink(ctx, inside ? lg(ctx, 'grinside', -hw, 0, -hw + cw, 0, [0, C('#3a1a30'), 1, C('#6a2a4a')]) : lg(ctx, 'grcover' + (this.phase >= 2 ? 2 : 0), -hw, -hh, hw, hh, [0, C(LEAKY(this.phase)), 0.4, C(LEATHER), 0.8, C('#120a14'), 1, C('#2a1a2e')]), 3);
    if (!inside && cw > 30) {
      const sx = cw / W;
      ctx.save(); ctx.translate(-hw, 0); ctx.scale(sx, 1); ctx.translate(hw, 0);
      rim(ctx, -hw - 6, -hw + 30, RIM, 3, 0.5);
      // 음각 테두리 + 문양
      ctx.strokeStyle = C(GOLD); ctx.lineWidth = 2.2;
      ctx.beginPath(); roundRect(ctx, -hw + 10, -hh + 10, W - 20, H - 20, 6); ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, -4, 42, 0, TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 0.2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 42, -4 + Math.sin(a) * 42); ctx.lineTo(Math.cos(a) * 50, -4 + Math.sin(a) * 50); ctx.stroke(); }
      // 모서리 금속 + 가시
      for (const [cx, cy, sx2, sy2] of [[-hw, -hh, 1, 1], [hw, -hh, -1, 1], [-hw, hh, 1, -1], [hw, hh, -1, -1]]) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sx2 * 26, cy); ctx.lineTo(cx, cy + sy2 * 26); ctx.closePath();
        ink(ctx, lg(ctx, 'grcorner', cx, cy, cx + sx2 * 20, cy + sy2 * 20, [0, C('#d8d0e0'), 1, C('#4a4454')]), 1.8);
        ctx.beginPath(); ctx.moveTo(cx + sx2 * 4, cy + sy2 * 10); ctx.lineTo(cx - sx2 * 12, cy - sy2 * 12); ctx.lineTo(cx + sx2 * 10, cy + sy2 * 4); ctx.closePath();
        ink(ctx, C('#b8b0c8'), 1.4);
      }
      // 사슬 (2페이즈에 끊김)
      if (!this.chainsBroken) {
        ctx.strokeStyle = C(OUT); ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(-hw, 30); ctx.quadraticCurveTo(0, 42, hw + 6, 26); ctx.stroke();
        ctx.strokeStyle = C(IRON); ctx.lineWidth = 3; ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); roundRect(ctx, hw - 6, 18, 14, 18, 3); ink(ctx, C('#6a6474'), 1.5);
      }
      // 거대한 눈
      this.drawEye(ctx, t);
      ctx.restore();
    }
    this.orbitPages(ctx, t, 1);
  }
  drawEye(ctx, t) {
    const ey = -4, open = this.blink > 0 ? 0.1 : clamp(this.eyeOpen, 0, 1.6), ew = 36, eh = 20 * open;
    // 눈꺼풀 주름
    ctx.beginPath(); ctx.ellipse(0, ey, ew + 6, eh + 8, 0, 0, TAU);
    ink(ctx, lg(ctx, 'grlid', 0, ey - 28, 0, ey + 28, [0, C('#5a3a5a'), 1, C('#1a0c1c')]), 2.5);
    if (open < 0.15) { ctx.strokeStyle = C('#0a040c'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-ew, ey); ctx.quadraticCurveTo(0, ey + 6, ew, ey); ctx.stroke(); return; }
    // 흰자
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-ew, ey); ctx.quadraticCurveTo(0, ey - eh * 2, ew, ey); ctx.quadraticCurveTo(0, ey + eh * 2, -ew, ey); ctx.closePath();
    ctx.fillStyle = rg(ctx, 'grwhite' + (this.phase >= 2 ? 1 : 0), 0, ey, 2, 0, ey, ew, [0, C('#fff6f0'), 0.7, C(this.phase >= 2 ? '#e8b0b0' : '#e8dcd0'), 1, C('#8a5a6a')]);
    ctx.fill();
    ctx.clip();
    // 핏발
    if (this.phase >= 1) {
      ctx.strokeStyle = rgba('#c01030', 0.35 + this.phase * 0.2); ctx.lineWidth = 1;
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r0 = ew * 0.95; ctx.moveTo(Math.cos(a) * r0, ey + Math.sin(a) * r0 * 0.6); ctx.lineTo(Math.cos(a + 0.2) * r0 * 0.6, ey + Math.sin(a + 0.1) * r0 * 0.35); } ctx.stroke();
    }
    // 홍채 + 동공
    const ix = this.lookX, iy = ey + this.lookY * 0.6, ir = 15;
    ctx.fillStyle = rg(ctx, 'griris' + (this.phase >= 2 ? 1 : 0), 0, 0, 1, 0, 0, ir, [0, C(this.phase >= 2 ? '#ffb0ff' : '#e0b0ff'), 0.5, C(this.phase >= 2 ? '#c030a0' : '#8a30d0'), 1, C('#2a0840')]);
    ctx.save(); ctx.translate(ix, iy); ctx.beginPath(); ctx.arc(0, 0, ir, 0, TAU); ctx.fill();
    ctx.strokeStyle = C('rgba(255,220,255,0.4)'); ctx.lineWidth = 1;
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); } ctx.stroke();
    const pw = this.state === 'beam' ? 2 + this.stateT * 2 : 3.5;
    ctx.fillStyle = '#05000a'; ctx.beginPath(); ctx.ellipse(0, 0, pw, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(-5, -5, 3, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
    glow(ctx, ix, iy, 40 + (this.state === 'beam' ? this.stateT * 30 : 0), this.phase >= 2 ? '#ff5ad0' : ARC, 0.45);
    // 속눈썹 가시
    ctx.fillStyle = C('#1a0c1c');
    for (let i = 0; i < 7; i++) { const u = i / 6, x = lerp(-ew + 4, ew - 4, u), y = ey - Math.sin(u * PI) * eh * 1.9; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + (u - 0.5) * 8, y - 9 - Math.sin(u * PI) * 5); ctx.lineTo(x + 3, y); ctx.closePath(); ctx.fill(); }
  }
  runeCircle(ctx, t, color) {
    const k = this.runeK + (this.phase >= 1 ? 0.3 : 0);
    if (k < 0.03) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= clamp(k, 0, 1);
    const R = 108;
    ctx.strokeStyle = rgba(color, 0.7); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, R - 12, 0, TAU); ctx.stroke();
    ctx.save(); ctx.rotate(t * 0.8);
    ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.lineTo(Math.cos(a) * (R - 12), Math.sin(a) * (R - 12)); } ctx.closePath(); ctx.stroke();
    ctx.fillStyle = rgba(color, 0.9); ctx.font = '700 14px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const glyphs = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.save(); ctx.translate(Math.cos(a) * (R - 6), Math.sin(a) * (R - 6)); ctx.rotate(a + PI / 2); ctx.fillText(glyphs[i], 0, 0); ctx.restore(); }
    ctx.restore();
    ctx.restore();
  }
  orbitPages(ctx, t, front) {
    const n = 7 + this.phase * 2;
    for (let i = 0; i < n; i++) {
      const a = t * (0.9 + (i % 3) * 0.15) + (i / n) * TAU, z = Math.sin(a);
      if ((z > 0) !== !!front) continue;
      const x = Math.cos(a) * (96 + (i % 2) * 22), y = z * 26 + Math.sin(t * 2 + i) * 10 - 20 + (i % 3) * 22;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 3 + i) * 0.6); ctx.scale(0.8 + z * 0.2, 0.8 + z * 0.2);
      ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(8, -9); ctx.lineTo(9, 10); ctx.lineTo(-7, 11); ctx.closePath();
      ctx.fillStyle = C(this.phase >= 1 && i % 2 ? '#f0c8c0' : PAGE); ctx.strokeStyle = C(OUT); ctx.lineWidth = 1.2; ctx.stroke(); ctx.fill();
      ctx.strokeStyle = C('rgba(60,40,30,0.5)'); ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(5, -5); ctx.moveTo(-5, 0); ctx.lineTo(4, 0); ctx.moveTo(-5, 5); ctx.lineTo(3, 5); ctx.stroke();
      glow(ctx, 0, 0, 16, this.phase >= 1 ? '#ff5a8a' : ARC, 0.25);
      ctx.restore();
    }
  }
}
function LEAKY(ph) { return ph >= 2 ? '#6a2a5a' : LEATHER2; }
function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ───────────────────────── 투사체 ─────────────────────────
function drawRazorPage(ctx, p) {
  ctx.rotate(p.rot);
  glow(ctx, 0, 0, 22, p.color, 0.5);
  ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(10, -10); ctx.lineTo(11, 12); ctx.lineTo(-9, 13); ctx.closePath();
  ctx.fillStyle = '#f4e8cc'; ctx.strokeStyle = '#1a1010'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fill();
  ctx.strokeStyle = 'rgba(80,50,40,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(-6, -6 + i * 5); ctx.lineTo(6 - (i % 2) * 3, -6 + i * 5); } ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(11, 12); ctx.stroke();
}
function drawLightning(ctx, b, k) {
  const seed = Math.floor(b.t * 30);
  ctx.globalAlpha *= k;
  bolt(ctx, b.x0 + rand(-6, 6), b.y0, b.x1, b.y1, '#bfe0ff', 5, seed, 26);
  bolt(ctx, b.x0 + rand(-20, 20), b.y0, b.x1 + rand(-30, 30), b.y1, '#8ab8ff', 2, seed + 7, 34);
  glow(ctx, b.x1, b.y1 - 10, 90, '#bfe0ff', k);
}
function drawPageBit(ctx) { ctx.fillStyle = '#efe2c4'; ctx.fillRect(-6, -8, 12, 16); ctx.strokeStyle = 'rgba(60,40,30,0.5)'; ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(4, -3); ctx.moveTo(-4, 2); ctx.lineTo(3, 2); ctx.stroke(); }
function drawCornerBit(ctx) { ctx.fillStyle = '#8a8494'; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(8, -6); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill(); }
