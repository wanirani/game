// 2장 보스: 밴시 여왕 — 통곡하는 묘지의 여왕
// 패턴: 통곡 고리(틈으로 회피) / 영혼 사슬(벽·천장에서 날아드는 선 공격) / 무덤의 손(바닥에서 솟는 손) /
//       위상 이동(투명화 후 등 뒤로 순간이동 + 영혼탄) / 영혼 나선탄 / 원혼 소환 / (3페이즈) 레퀴엠(궤도 사슬추 + 통곡)
// 페이즈: 1 = 원한의 사슬(사슬 발광·증가) · 2 = 레퀴엠(해골 얼굴, 머리칼이 치솟음)
import { ABoss, beginDraw, endDraw, C, rg, lg, glow, ink, rim, taper, eye, shadow, hash, opt, PI, OUT, erupt } from './a_common.js';
import { VerletChain } from '../../core/physics.js';
import { rand, clamp, lerp, TAU, angleTo, rgba, ease } from '../../core/math.js';
import { audio } from '../../core/audio.js';

const TEAL = '#5affd0', PALE = '#dff8f2', VEIL = '#b8e8e0', DEEP = '#1c4a4a';
const _Q = new Float32Array(32);
const SC = 1.22; // 그림 배율

export class Banshee extends ABoss {
  setup() {
    this.y = this.floorY - 110 - this.h;
    this.arms = 0.2; this.armsUp = 0; this.mouth = 0; this.alpha = 1; this.lean = 0; this.skull = 0; this.fury = 0;
    this.lastX = this.cx; this.dvx = 0;
    this.chainsV = [new VerletChain(7, 11, { gravity: 700, damping: 0.94 }), new VerletChain(7, 11, { gravity: 700, damping: 0.94 })];
    this.orbs = [];
  }
  hurtboxes() { return [{ x: this.x + 12, y: this.y + 6, w: this.w - 24, h: this.h - 30 }]; }
  onIntro() { audio.sfx('ghost', { pitch: 0.6, vol: 1 }); this.mouth = 1; this.arms = 1; }
  moves() {
    const ph = this.phase;
    return [
      ['wail', 2.4], ['chains', 2.6], ['hands', 2.4], ['phase', 1.8], ['spiral', 2],
      ['summon', this.minionCount() < 2 ? 1.2 : 0],
      ['requiem', ph >= 2 ? 2.2 : 0],
    ];
  }
  idleMove(dt, world, p) {
    const A = this.A, side = this.cx > p.cx ? 1 : -1;
    this.flyTo(clamp(p.cx + side * 260, A.x0 + 110, A.x1 - 110), A.floor - 190 + Math.sin(this.t * 1.4) * 20, 1.8, 220, dt);
    this.facePlayer();
    this.relax(dt);
  }
  relax(dt) {
    const k = Math.min(1, dt * 4);
    this.arms = lerp(this.arms, 0.2, k); this.armsUp = lerp(this.armsUp, 0, k); this.mouth = lerp(this.mouth, 0, k);
    this.alpha = lerp(this.alpha, 1, Math.min(1, dt * 6));
  }
  think(dt, world) {
    super.think(dt, world);
    this.dvx = lerp(this.dvx, (this.cx - this.lastX) / Math.max(dt, 1e-4), Math.min(1, dt * 8));
    this.lastX = this.cx;
    this.lean = lerp(this.lean, clamp(this.dvx / 900, -0.35, 0.35), Math.min(1, dt * 6));
    this.skull = lerp(this.skull, this.phase >= 2 ? 1 : 0, Math.min(1, dt * 1.5));
    this.fury = lerp(this.fury, this.phase / 2, Math.min(1, dt * 2));
    // 손목 사슬 (월드 좌표 물리)
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1, w = this.wrist(s);
      const wx = this.cx + this.facing * w.x * SC, wy = this.bottom + w.y * SC;
      this.chainsV[i].update(dt, wx, wy, -this.dvx * 0.6, 0);
    }
    if (Math.random() < dt * 10 * this.alpha) this.fx.emit('soul', this.cx + rand(-30, 30), this.bottom - rand(0, 40), opt({ speed: 30, color: this.phase >= 2 ? '#a0fff0' : undefined }));
  }
  /** 손목 로컬 좌표 (발 중앙 기준, 오른쪽을 보는 기준) */
  wrist(s) {
    const sx = s * 21 + 2, sy = -148;
    const a0 = lerp(PI / 2 - 0.35 * s, -0.25, this.arms) - this.armsUp * 1.1;
    const ang = s > 0 ? a0 : PI - a0;
    const ex = sx + Math.cos(ang) * 34, ey = sy + Math.sin(ang) * 34;
    const b = s > 0 ? a0 - 0.2 * this.arms : PI - (a0 - 0.2 * this.arms);
    return { sx, sy, ex, ey, x: ex + Math.cos(b) * 32, y: ey + Math.sin(b) * 32 };
  }

  // ── 통곡: 입이 찢어지게 벌어지며 틈 있는 고리를 연속 방출 ──
  s_wail(dt, world, p) {
    const A = this.A, W = 0.85, n = this.phase >= 1 ? 3 : 2, iv = 0.7;
    this.flyTo(clamp(this.cx, A.x0 + 150, A.x1 - 150), A.floor - 215, 2.5, 200, dt);
    this.facePlayer();
    this.arms = lerp(this.arms, 1, Math.min(1, dt * 5)); this.armsUp = lerp(this.armsUp, 0.3, Math.min(1, dt * 5));
    const hx = this.cx + this.facing * 5, hy = this.bottom - 195;
    if (this.at(0)) { this.warnMark(this.cx, this.y - 36, W); audio.sfx('ghost', { pitch: 0.5, vol: 0.9 }); }
    if (this.stateT < W) {
      this.mouth = lerp(this.mouth, 1, Math.min(1, dt * 4));
      if (this.every(0.05, 0.2, 4) >= 0) this.fx.ring(hx, hy, { color: TEAL, r0: 160, r1: 10, life: 0.3, width: 3 });
      if (Math.random() < 0.6) { const a = rand(0, TAU); this.fx.emit('soul', hx + Math.cos(a) * 120, hy + Math.sin(a) * 120, { vx: -Math.cos(a) * 200, vy: -Math.sin(a) * 200, speed: 0 }); }
    }
    const k = this.every(W, iv, n);
    if (k >= 0) {
      const a = angleTo(hx, hy, p.cx, p.cy);
      const base = a + (k % 2 ? 1 : -1) * rand(0.45, 0.75);
      const ng = this.phase >= 2 || this.inferno ? 2 : 3;
      const gaps = [];
      for (let i = 0; i < ng; i++) gaps.push([base + i * TAU / ng, 0.22]);
      this.ring({ px: hx, py: hy, r: 20, speed: 280 + this.phase * 25, th: 15, gaps, color: TEAL, color2: '#f0fffa', maxR: 1150, mv: 0.85, element: 'dark', style: 'wail' });
      this.fx.flash(hx, hy, { color: TEAL, size: 130, life: 0.18 });
      this.shake(6, 0.3); this.mouth = 1.35;
      audio.sfx('ghost', { pitch: 0.4 + k * 0.1, vol: 1 });
    }
    if (this.stateT > W + n * iv + 0.2) this.rest(1.1);
  }

  // ── 영혼 사슬: 벽·천장에서 플레이어를 가로지르는 사슬이 박힌다 ──
  s_chains(dt, world, p) {
    const A = this.A, n = 3 + this.phase + (this.inferno ? 1 : 0);
    this.flyTo(clamp(this.cx, A.x0 + 140, A.x1 - 140), A.floor - 230, 2, 180, dt);
    this.facePlayer();
    this.arms = lerp(this.arms, 0.9, Math.min(1, dt * 4)); this.armsUp = lerp(this.armsUp, 0.8, Math.min(1, dt * 4));
    if (this.at(0)) { audio.sfx('ghost', { pitch: 0.8 }); this.warnMark(this.cx, this.y - 36, 0.6); }
    const k = this.every(0.1, 0.22, n);
    if (k >= 0) {
      // 시작점: 천장/좌우 벽, 플레이어를 지나 반대편까지
      const tx = p.cx + rand(-40, 40), ty = clamp(p.cy + rand(-30, 20), A.floor - 160, A.floor - 30);
      let sx, sy;
      const r = (k + (this.phase % 2)) % 3;
      if (r === 0) { sx = A.x0 - 10; sy = A.floor - rand(120, 320); }
      else if (r === 1) { sx = A.x1 + 10; sy = A.floor - rand(120, 320); }
      else { sx = tx + rand(-260, 260); sy = A.floor - 460; }
      const a = Math.atan2(ty - sy, tx - sx), L = 1800;
      this.beam({ x0: sx, y0: sy, x1: sx + Math.cos(a) * L, y1: sy + Math.sin(a) * L, warn: 0.75, active: 0.45, fade: 0.25, width: 26, color: TEAL, warnColor: '#7affe0', mv: 0.9, element: 'dark', drawFn: drawChainBeam,
        onFire: (b, w) => { audio.sfx('whip_crack', { pitch: 0.6, vol: 0.7 }); w.camera.shake(4, 0.12); } });
    }
    if (this.stateT > 0.1 + n * 0.22 + 1.1) this.rest(1.0);
  }

  // ── 무덤의 손: 바닥에서 유령 손이 연속으로 솟구친다 ──
  s_hands(dt, world, p) {
    const A = this.A, n = 5 + this.phase, iv = 0.2;
    this.flyTo(clamp(this.cx, A.x0 + 140, A.x1 - 140), A.floor - 205, 2, 180, dt);
    this.facePlayer();
    this.arms = lerp(this.arms, 1, Math.min(1, dt * 4)); this.armsUp = lerp(this.armsUp, -0.5, Math.min(1, dt * 4));
    if (this.at(0)) {
      this.warnMark(this.cx, this.y - 36, 0.5); audio.sfx('ghost', { pitch: 0.6 });
      this.hx0 = p.cx - Math.sign(p.cx - this.cx || 1) * 180; this.hdir = Math.sign(p.cx - this.cx) || 1;
    }
    const k = this.every(0.15, iv, n);
    if (k >= 0) {
      const x = clamp(this.hx0 + this.hdir * k * 95, A.x0 + 30, A.x1 - 30);
      erupt(this, x, { delay: 0.75, life: 0.55, w: 56, h: 150, color: TEAL, style: 'soul', burst: 'soul', mv: 0.95, element: 'dark', draw: drawGraveHand, sfx: 'ghost', shake: 3 });
    }
    // 2페이즈 이상: 플레이어 발밑 추격 손 2개
    if (this.phase >= 1) {
      const j = this.every(0.5, 0.55, 2);
      if (j >= 0) erupt(this, p.cx, { delay: 0.7, life: 0.55, w: 56, h: 150, color: '#9affe8', style: 'soul', burst: 'soul', mv: 0.95, element: 'dark', draw: drawGraveHand, sfx: 'ghost' });
    }
    if (this.stateT > 0.15 + n * iv + 1.2) this.rest(0.9);
  }

  // ── 위상 이동: 흐려지며 사라졌다가 등 뒤에서 나타나 영혼탄 ──
  s_phase(dt, world, p) {
    const A = this.A;
    if (this.at(0)) { audio.sfx('mist', { pitch: 0.8 }); this.harmless = true; }
    if (this.stateT < 0.45) {
      this.alpha = lerp(1, 0.08, this.stateT / 0.45); this.invuln = this.stateT > 0.2;
      this.vx *= 0.9; this.vy *= 0.9;
      if (Math.random() < 0.6) this.fx.emit('soul', this.cx + rand(-30, 30), this.cy + rand(-60, 60), { speed: 60 });
      return;
    }
    if (this.at(0.45)) {
      const side = p.cx > A.mid ? -1 : 1;
      this.tx = clamp(p.cx + (Math.random() < 0.65 ? -p.facing : side) * 230, A.x0 + 90, A.x1 - 90);
      this.ty = A.floor - 180;
      this.warn({ type: 'ring', px: this.tx, py: this.ty, r: 60, life: 0.45, color: TEAL });
    }
    if (this.stateT < 0.9) {
      this.x = lerp(this.x, this.tx - this.w / 2, Math.min(1, dt * 12)); this.y = lerp(this.y, this.ty - this.h / 2, Math.min(1, dt * 12));
      this.vx = 0; this.vy = 0;
      return;
    }
    if (this.at(0.9)) { this.facePlayer(); this.fx.burst('soul', this.cx, this.cy, 20, { speed: 200 }); this.fx.ring(this.cx, this.cy, { color: TEAL, r0: 10, r1: 110, life: 0.3, width: 5 }); audio.sfx('ghost', { pitch: 1.2 }); }
    this.alpha = lerp(this.alpha, 1, Math.min(1, dt * 10));
    if (this.stateT > 1.0) { this.invuln = false; this.harmless = false; }
    this.facePlayer();
    this.arms = lerp(this.arms, 1, Math.min(1, dt * 8)); this.mouth = lerp(this.mouth, 0.7, Math.min(1, dt * 8));
    const n = this.phase >= 1 ? 5 : 3;
    const k = this.every(1.15, 0.12, n);
    if (k >= 0) {
      const hx = this.cx + this.facing * 30, hy = this.cy - 20;
      const a = angleTo(hx, hy, p.cx, p.cy) + (k - (n - 1) / 2) * 0.22;
      this.shoot({ x: hx, y: hy, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, w: 16, h: 16, render: drawSoulOrb, color: TEAL, life: 2.6, behavior: 'homing', homingTurn: 0.9, homingDelay: 0.2, light: { r: 60, color: TEAL, i: 0.7 }, trail: 'soul', trailRate: 0.05, attack: { mv: 0.7, type: 'mag', element: 'dark' } });
      audio.sfx('magic', { pitch: 1.3, vol: 0.5 });
    }
    if (this.stateT > 1.15 + n * 0.12 + 0.5) this.rest(0.9);
  }

  // ── 영혼 나선탄 ──
  s_spiral(dt, world, p) {
    const A = this.A, T0 = 0.6, dur = 1.6 + this.phase * 0.3;
    this.flyTo(clamp(this.cx, A.x0 + 150, A.x1 - 150), A.floor - 200, 2, 160, dt);
    this.arms = lerp(this.arms, 1, Math.min(1, dt * 5)); this.armsUp = 0.2 + Math.sin(this.stateT * 8) * 0.3; this.mouth = lerp(this.mouth, 0.5, dt * 3);
    if (this.at(0)) { this.warnMark(this.cx, this.y - 36, T0); audio.sfx('ghost', { pitch: 0.9 }); this.spin = rand(0, TAU); }
    if (this.stateT < T0) { if (Math.random() < 0.7) this.fx.emit('soul', this.cx + rand(-80, 80), this.cy + rand(-80, 80), { speed: 40 }); return; }
    const iv = 0.1;
    const k = this.every(T0, iv, Math.floor(dur / iv));
    if (k >= 0) {
      const arms = this.phase >= 1 ? 3 : 2;
      for (let j = 0; j < arms; j++) {
        const a = this.spin + k * 0.37 + j * TAU / arms;
        this.shoot({ x: this.cx, y: this.cy - 10, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, w: 14, h: 14, render: drawSoulOrb, color: '#8affe0', life: 4, light: { r: 40, color: TEAL, i: 0.5 }, collideWalls: true, attack: { mv: 0.6, type: 'mag', element: 'dark' } });
      }
      if (k % 3 === 0) audio.sfx('magic', { pitch: 1.5, vol: 0.35 });
    }
    if (this.stateT > T0 + dur + 0.4) this.rest(1.0);
  }

  // ── 원혼 소환 ──
  s_summon(dt, world, p) {
    const A = this.A;
    this.flyTo(clamp(this.cx, A.x0 + 150, A.x1 - 150), A.floor - 220, 2, 160, dt);
    this.arms = lerp(this.arms, 1, Math.min(1, dt * 4)); this.armsUp = lerp(this.armsUp, 1, Math.min(1, dt * 4)); this.mouth = lerp(this.mouth, 0.8, dt * 4);
    if (this.at(0)) { audio.sfx('ghost', { pitch: 0.45, vol: 1 }); this.warnMark(this.cx, this.y - 36, 0.7); }
    if (this.stateT < 0.8 && Math.random() < 0.7) this.fx.emit('soul', rand(A.x0, A.x1), A.floor - 4, { speed: 80, angle: -PI / 2 });
    if (this.at(0.8)) {
      const n = this.phase >= 1 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const x = clamp(p.cx + (i - (n - 1) / 2) * 260 + rand(-30, 30), A.x0 + 40, A.x1 - 40);
        this.summon('ghost', x, A.floor - 10, 3, { fx: 'soul', color: TEAL });
        erupt(this, x, { delay: 0, life: 0.3, w: 40, h: 90, color: TEAL, style: 'soul', burst: 'soul', mv: 0.5, element: 'dark', sfx: null });
      }
      audio.sfx('ghost', { pitch: 1.1 });
    }
    if (this.stateT > 1.3) this.rest(0.9);
  }

  // ── 레퀴엠 (3페이즈): 궤도를 도는 사슬추가 점점 넓게 퍼지다 사방으로 흩어진다 ──
  s_requiem(dt, world, p) {
    const A = this.A, n = this.inferno ? 8 : 6, T1 = 3.2;
    this.flyTo(A.mid, A.floor - 230, 2.2, 260, dt);
    this.arms = 1; this.armsUp = lerp(this.armsUp, 0.9, Math.min(1, dt * 3)); this.mouth = lerp(this.mouth, 1.1, dt * 3);
    if (this.at(0)) {
      audio.sfx('boss_roar', { pitch: 1.6, vol: 0.7 });
      this.warnMark(this.cx, this.y - 36, 0.7);
      this.orbs.length = 0;
      for (let i = 0; i < n; i++) {
        const o = this.shoot({ x: this.cx, y: this.cy, vx: 0, vy: 0, w: 26, h: 26, behavior: 'orbit', orbitR: 70, orbitSpeed: 2.4, render: drawChainWeight, color: TEAL, life: T1 + 0.3, collideWalls: false, pierce: 99, light: { r: 60, color: TEAL, i: 0.7 }, attack: { mv: 0.8, type: 'phys', element: 'dark' } });
        o.orbitA = (i / n) * TAU;
        this.orbs.push(o);
      }
    }
    const grow = clamp((this.stateT - 0.5) / (T1 - 0.9), 0, 1);
    for (const o of this.orbs) { o.orbitR = 70 + ease.inOutQuad(grow) * 230; o.orbitSpeed = 2.4 - grow * 0.9; }
    const k = this.every(1.0, 1.0, 2);
    if (k >= 0) {
      const a = angleTo(this.cx, this.cy, p.cx, p.cy) + 0.6;
      this.ring({ px: this.cx, py: this.cy - 20, r: 20, speed: 300, th: 13, gaps: [[a, 0.25], [a + TAU / 3, 0.25], [a + TAU * 2 / 3, 0.25]], color: TEAL, color2: '#f0fffa', maxR: 1100, mv: 0.8, element: 'dark' });
      audio.sfx('ghost', { pitch: 0.5 }); this.shake(5, 0.2);
    }
    if (this.at(T1)) {
      for (const o of this.orbs) {
        if (o.dead) continue;
        const a = Math.atan2(o.cy - this.cy, o.cx - this.cx);
        o.behavior = 'straight'; o.vx = Math.cos(a) * 380; o.vy = Math.sin(a) * 380; o.life = 2.5; o.collideWalls = true;
      }
      audio.sfx('whip_crack', { pitch: 0.5 }); this.shake(6, 0.3);
    }
    if (this.stateT > T1 + 0.7) this.rest(1.1);
  }

  onPhase(n, world) {
    this.setState('transform');
    this.transformTime = 1.4;
    this.alpha = 1; this.harmless = false;
    world.banner = n === 1
      ? { text: '원한의 사슬', sub: '밴시 여왕의 사슬이 푸르게 불타오른다', t: 1.8, color: TEAL }
      : { text: '레퀴엠', sub: '여왕의 얼굴이 해골로 일그러진다', t: 2, color: '#a0fff0' };
  }
  transformTick(dt, world, p) {
    const A = this.A;
    this.flyTo(clamp(this.cx, A.x0 + 160, A.x1 - 160), A.floor - 230, 3, 260, dt);
    this.arms = 1; this.armsUp = 0.9; this.mouth = 1.3;
    if (this.at(0.25)) {
      this.phaseBurst(TEAL);
      audio.sfx('ghost', { pitch: 0.3, vol: 1 });
      this.ring({ px: this.cx, py: this.cy - 30, r: 30, speed: 560, th: 10, gaps: [], color: TEAL, color2: '#ffffff', maxR: 700, harmless: true });
    }
    if (Math.random() < 0.8) this.fx.emit('soul', this.cx + rand(-60, 60), this.cy + rand(-70, 60), { speed: 180 });
  }
  deathStart() { audio.sfx('ghost', { pitch: 0.3, vol: 1 }); }
  deathTick(dt) { this.mouth = 1.4; this.arms = 1; this.armsUp = 1; this.vy = -40; }
  debrisPiece(i) { return { size: 10, draw: drawWisp }; }
  deathPoint() { return { x: this.cx + rand(-50, 50), y: this.bottom - rand(20, 230) }; }
  extraLights(L) { L.add(this.cx, this.bottom - 200, 100, TEAL, 0.8 * this.alpha); }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx, world) {
    beginDraw(this);
    const X = this.cx, B = this.bottom, t = this.t;
    const alt = clamp((this.floorY - B) / 300, 0, 1);
    shadow(ctx, X, this.floorY - 2, 80 * (1 - alt * 0.4), 11, 0.4 * (1 - alt * 0.5) * this.alpha);
    // 사슬 (월드 좌표)
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    for (const ch of this.chainsV) drawChainPts(ctx, ch.pts, this.phase >= 1 ? 1 : 0.5, t);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    const jx = this.flashT > 0 ? rand(-2, 2) : 0;
    ctx.translate(X + jx, B - 100); ctx.rotate(this.lean * 0.6); ctx.scale(this.facing * SC, SC); ctx.translate(0, 100 / SC);
    this.drawFigure(ctx);
    ctx.restore();
    endDraw();
  }
  drawFigure(ctx) {
    const t = this.t, fury = this.fury, bob = Math.sin(t * 2) * 3;
    glow(ctx, 0, -110, 200, '#0c3a3a', 0.6);
    glow(ctx, 0, -120, 160, TEAL, 0.14 + fury * 0.14 + (this.state === 'transform' ? 0.3 : 0));
    if (this.phase >= 2) glow(ctx, 0, -60, 130, '#6a40ff', 0.18 + 0.08 * Math.sin(t * 5));
    // 바깥 베일 (반투명, 크게 휘날림)
    this.outerVeil(ctx, t);
    this.hair(ctx, t, 0);
    this.arm(ctx, -1);
    this.gown(ctx, t);
    this.arm(ctx, 1);
    this.face(ctx, t, bob);
    this.hair(ctx, t, 1);
  }
  outerVeil(ctx, t) {
    ctx.beginPath();
    ctx.moveTo(-6, -196);
    ctx.quadraticCurveTo(-60, -170 + Math.sin(t * 1.7) * 6, -86 - Math.sin(t * 1.3) * 10, -90);
    const N = 7;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      ctx.lineTo(lerp(-96, 70, u) + Math.sin(t * 2.2 + i * 1.3) * 8 - (1 - u) * 18, -18 + (i % 2 ? 30 : 0) + Math.sin(t * 2.8 + i) * 8);
    }
    ctx.quadraticCurveTo(64, -120, 20, -190);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha *= 0.32;
    ctx.fillStyle = lg(ctx, 'bsveil', 0, -196, 0, 10, [0, C('#e8fffa'), 0.6, C('#6ac8c0'), 1, 'rgba(60,160,150,0)']);
    ctx.fill();
    ctx.globalAlpha /= 0.32; ctx.globalAlpha *= 0.5;
    ctx.strokeStyle = C('#a8fff0'); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  hair(ctx, t, front) {
    const hx = 4, hy = -176, n = front ? 2 : 7, up = this.fury * 0.5 + (this.state === 'transform' ? 0.6 : 0);
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0;
      const ox = front ? (i ? -15 : 17) : -16 + u * 22, len = front ? 58 + i * 10 : 110 + hash(i + 3) * 70;
      const baseA = front ? PI / 2 + (i ? 0.28 : -0.12) : PI / 2 + 0.7 + u * 0.5 - up * 1.3;
      let x = hx + ox, y = hy + (front ? -2 : -10);
      _Q[0] = x; _Q[1] = y;
      for (let j = 1; j < 8; j++) {
        const a = baseA + Math.sin(t * 2.2 + i * 1.3 + j * 0.8) * (0.1 + j * 0.035) + (front ? 0 : j * 0.04);
        x += Math.cos(a) * len / 7; y += Math.sin(a) * len / 7;
        _Q[j * 2] = x; _Q[j * 2 + 1] = y;
      }
      taper(ctx, _Q, 8, front ? 6 : 15, 1.2);
      ctx.globalAlpha *= front ? 0.95 : 0.85;
      ink(ctx, lg(ctx, 'bshair' + (front ? 1 : 0), 0, hy, 0, hy + 150, [0, C('#f4fffc'), 0.6, C('#b8dcd8'), 1, C('#5a8a88')]), 1.5, '#0a1a1c');
      ctx.globalAlpha /= front ? 0.95 : 0.85;
    }
  }
  arm(ctx, s) {
    const w = this.wrist(s);
    _Q[0] = w.sx; _Q[1] = w.sy; _Q[2] = w.ex; _Q[3] = w.ey; _Q[4] = w.x; _Q[5] = w.y;
    taper(ctx, _Q, 3, 9, 5);
    ink(ctx, s > 0 ? lg(ctx, null, w.sx, w.sy, w.x, w.y, [0, C('#e8fff8'), 1, C('#8ab8b4')]) : C('#6a9a98'), 2, '#08181a');
    // 늘어진 종 모양 소매
    const ang = Math.atan2(w.y - w.sy, w.x - w.sx), t = this.t;
    ctx.save(); ctx.translate(w.ex, w.ey);
    ctx.beginPath();
    ctx.moveTo(-Math.cos(ang) * 20, -Math.sin(ang) * 20 - 4);
    ctx.lineTo(Math.cos(ang) * 22, Math.sin(ang) * 22 - 4);
    const hang = 46 + this.arms * 16;
    for (let i = 0; i <= 4; i++) {
      const u = i / 4, bx = lerp(Math.cos(ang) * 26, -Math.cos(ang) * 16, u) - this.dvx * 0.02;
      ctx.lineTo(bx + Math.sin(t * 3 + i) * 4, hang * (0.75 + (i % 2) * 0.25) + Math.sin(t * 3.4 + i * 2) * 5);
    }
    ctx.closePath();
    ctx.globalAlpha *= 0.62;
    ink(ctx, lg(ctx, 'bssleeve' + s, 0, -10, 0, 60, [0, C(s > 0 ? '#e8fffa' : '#8ab8b4'), 1, 'rgba(80,170,160,0.1)']), 1.2, '#08181a');
    ctx.globalAlpha /= 0.62;
    ctx.restore();
    // 손 (긴 손가락)
    const ha = Math.atan2(w.y - w.ey, w.x - w.ex);
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(ha);
    ctx.strokeStyle = C(s > 0 ? '#e0fff8' : '#7aa8a4'); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const a = -0.5 + i * 0.33, cl = 0.3 + this.arms * 0.2; ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a) * 9, Math.sin(a) * 9, Math.cos(a + cl) * 16, Math.sin(a + cl) * 16); }
    ctx.stroke();
    ctx.fillStyle = C('#3a4a4c'); ctx.fillRect(-6, -5, 6, 10);
    ctx.strokeStyle = C('#9affe8'); ctx.lineWidth = 1; ctx.strokeRect(-6, -5, 6, 10);
    ctx.restore();
  }
  gown(ctx, t) {
    // 어깨 → 넓게 퍼지는 드레스 → 물결치는 영기 꼬리 (뒤쪽으로 끌림)
    const N = 10, drag = this.lean * 30;
    ctx.beginPath();
    ctx.moveTo(-18, -152);
    ctx.quadraticCurveTo(-28, -118, -40, -84);
    ctx.quadraticCurveTo(-58, -56, -66, -40);
    for (let i = 0; i <= N; i++) {
      const u = i / N, x = lerp(-66, 58, u);
      const tail = (i % 2 ? 40 + (1 - u) * 24 : 12) + Math.sin(t * 3.2 + i * 1.7) * 9 + hash(i) * 10;
      ctx.lineTo(x + Math.sin(t * 2 + i) * 6 - drag - (1 - u) * 16, -44 + tail);
      if (i < N) ctx.lineTo(lerp(-66, 58, u + 0.5 / N) - drag * 0.5, -40 + Math.sin(t * 3 + i) * 3);
    }
    ctx.lineTo(58, -44);
    ctx.quadraticCurveTo(50, -66, 36, -90);
    ctx.quadraticCurveTo(28, -122, 22, -152);
    ctx.quadraticCurveTo(2, -160, -18, -152);
    ctx.closePath();
    const g = lg(ctx, 'bsgown' + (this.phase >= 2 ? 1 : 0), 0, -158, 0, 12, [0, C('#f4fffd'), 0.35, C(this.phase >= 2 ? '#9ad0cc' : VEIL), 0.78, C(this.phase >= 2 ? '#2a5a64' : '#4a8a88'), 1, 'rgba(40,110,110,0.05)']);
    ctx.globalAlpha *= 0.9;
    ink(ctx, g, 2.2, '#07181a');
    ctx.globalAlpha /= 0.9;
    rim(ctx, -70, 4, '#8affe8', 4, 0.6);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = lg(ctx, 'bsglow', 0, -150, 0, 0, [0, 'rgba(90,255,208,0.2)', 1, 'rgba(90,255,208,0)']);
    ctx.fill();
    // 부드러운 주름 하이라이트
    ctx.strokeStyle = 'rgba(200,255,240,0.22)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { const x = i * 16; ctx.moveTo(x * 0.3 + 4, -140); ctx.quadraticCurveTo(x * 0.9 + Math.sin(t * 2 + i) * 3, -90, x * 1.8 + Math.sin(t * 3 + i) * 6 - drag, -36); }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = C('rgba(20,60,60,0.35)'); ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = -1; i <= 1; i += 2) { const x = i * 24; ctx.moveTo(x * 0.3, -130); ctx.quadraticCurveTo(x * 0.9, -86, x * 1.6 + Math.sin(t * 3 + i) * 6 - drag, -40); }
    ctx.stroke();
    // 허리 사슬
    ctx.strokeStyle = C(this.phase >= 1 ? '#9affe8' : '#6a8a8c'); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-30, -104); ctx.quadraticCurveTo(0, -92, 30, -106); ctx.stroke();
    if (this.phase >= 1) glow(ctx, 0, -98, 40, TEAL, 0.25);
    // 찢긴 베일 구멍 (1페이즈 이후)
    if (this.phase >= 1) {
      ctx.fillStyle = 'rgba(4,16,18,0.7)';
      ctx.beginPath(); ctx.ellipse(-28, -60, 5, 9, 0.3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(22, -70, 4, 7, -0.2, 0, TAU); ctx.fill();
    }
  }
  face(ctx, t, bob) {
    const hx = 4, hy = -170 + bob * 0.3, m = clamp(this.mouth, 0, 1.4), sk = this.skull;
    // 두건 베일
    ctx.beginPath();
    ctx.moveTo(hx - 20, hy + 20);
    ctx.quadraticCurveTo(hx - 26, hy - 14, hx - 4, hy - 26);
    ctx.quadraticCurveTo(hx + 18, hy - 28, hx + 22, hy - 4);
    ctx.quadraticCurveTo(hx + 22, hy + 14, hx + 18, hy + 24);
    ctx.quadraticCurveTo(hx, hy + 30, hx - 20, hy + 20);
    ctx.closePath();
    ctx.globalAlpha *= 0.92;
    ink(ctx, lg(ctx, 'bshood', hx, hy - 26, hx, hy + 30, [0, C('#f4fffc'), 1, C('#6aa8a4')]), 2, '#07181a');
    ctx.globalAlpha /= 0.92;
    rim(ctx, hx - 28, hx, '#8affe8', 3, 0.6);
    // 얼굴
    ctx.beginPath();
    ctx.moveTo(hx - 9, hy - 10);
    ctx.quadraticCurveTo(hx + 4, hy - 16, hx + 14, hy - 8);
    ctx.quadraticCurveTo(hx + 16, hy + 8, hx + 8, hy + 16 + m * 10);
    ctx.quadraticCurveTo(hx + 1, hy + 20 + m * 10, hx - 5, hy + 14 + m * 8);
    ctx.quadraticCurveTo(hx - 12, hy + 4, hx - 9, hy - 10);
    ctx.closePath();
    ink(ctx, rg(ctx, 'bsface' + (sk > 0.5 ? 1 : 0), hx + 6, hy - 4, 1, hx + 2, hy + 4, 22, [0, C(sk > 0.5 ? '#e8e0d0' : '#f4fffc'), 0.7, C(sk > 0.5 ? '#9a9888' : '#9ad0c8'), 1, C('#3a5a58')]), 1.8, '#07181a');
    // 해골화: 광대 그늘
    if (sk > 0.05) {
      ctx.fillStyle = rgba('#0a1414', 0.55 * sk);
      ctx.beginPath(); ctx.ellipse(hx - 3, hy + 6, 4, 6, 0.2, 0, TAU); ctx.ellipse(hx + 11, hy + 6, 3, 6, -0.2, 0, TAU); ctx.fill();
    }
    // 텅 빈 눈구멍 + 발광 눈동자
    ctx.fillStyle = C('#040a0c');
    ctx.beginPath(); ctx.ellipse(hx - 2, hy - 2, 4.5, 5.5 + sk, 0.2, 0, TAU); ctx.ellipse(hx + 9, hy - 2, 4, 5.5 + sk, -0.2, 0, TAU); ctx.fill();
    const ec = sk > 0.5 ? '#c0fff4' : TEAL;
    eye(ctx, hx - 2, hy - 1.5, 1.8 + this.fury * 0.8, ec, 1);
    eye(ctx, hx + 9, hy - 1.5, 1.6 + this.fury * 0.8, ec, 1);
    // 검은 눈물 (레퀴엠)
    if (sk > 0.3) {
      ctx.strokeStyle = rgba('#051010', 0.8 * sk); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(hx - 2, hy + 3); ctx.lineTo(hx - 3, hy + 12); ctx.moveTo(hx + 9, hy + 3); ctx.lineTo(hx + 10, hy + 13); ctx.stroke();
    }
    // 입 (통곡)
    const my = hy + 9, mh = 2 + m * 13;
    ctx.beginPath(); ctx.ellipse(hx + 4, my + mh / 2, 3 + m * 2.5, mh / 2, 0, 0, TAU);
    ctx.fillStyle = C('#020606'); ctx.fill();
    if (sk > 0.5 && m > 0.3) {
      ctx.fillStyle = C('#d8d0c0');
      for (let i = -1; i <= 1; i++) { ctx.fillRect(hx + 4 + i * 2.2 - 0.8, my, 1.6, 2.4); ctx.fillRect(hx + 4 + i * 2.2 - 0.8, my + mh - 2.4, 1.6, 2.4); }
    }
    if (m > 0.4) glow(ctx, hx + 4, my + mh / 2, 26 * m, TEAL, 0.35 * m);
  }
}

// ───────────────────────── 그리기 도우미 ─────────────────────────
function drawChainPts(ctx, pts, k, t) {
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
    ctx.beginPath();
    if (i % 2) ctx.ellipse(0, 0, 7, 3.5, 0, 0, TAU); else { ctx.moveTo(-6, 0); ctx.lineTo(6, 0); }
    ctx.strokeStyle = C('#0a1618'); ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = C(i % 2 ? '#8ab0b0' : '#5a7a7c'); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  const e = pts[pts.length - 1];
  glow(ctx, e.x, e.y, 22, TEAL, 0.3 + 0.4 * k);
  ctx.restore();
}
function drawChainBeam(ctx, b, k) {
  const dx = b.x1 - b.x0, dy = b.y1 - b.y0, L = Math.hypot(dx, dy);
  const ext = clamp((b.t - b.warn) / 0.1, 0, 1), len = L * ext;
  ctx.translate(b.x0, b.y0); ctx.rotate(Math.atan2(dy, dx));
  ctx.globalAlpha *= k;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, -14, 0, 14);
  g.addColorStop(0, 'rgba(90,255,208,0)'); g.addColorStop(0.5, 'rgba(90,255,208,0.35)'); g.addColorStop(1, 'rgba(90,255,208,0)');
  ctx.fillStyle = g; ctx.fillRect(0, -14, len, 28);
  ctx.globalCompositeOperation = 'source-over';
  for (let x = 0; x < len; x += 13) {
    const odd = Math.round(x / 13) % 2;
    ctx.strokeStyle = '#06201c'; ctx.lineWidth = 4.5;
    ctx.beginPath(); odd ? ctx.ellipse(x, 0, 7.5, 4, 0, 0, TAU) : (ctx.moveTo(x - 6, 0), ctx.lineTo(x + 6, 0)); ctx.stroke();
    ctx.strokeStyle = odd ? '#c8fff0' : '#7affd8'; ctx.lineWidth = 2;
    ctx.beginPath(); odd ? ctx.ellipse(x, 0, 7.5, 4, 0, 0, TAU) : (ctx.moveTo(x - 6, 0), ctx.lineTo(x + 6, 0)); ctx.stroke();
  }
  // 창끝 갈고리
  ctx.save(); ctx.translate(len, 0);
  ctx.fillStyle = '#e8fff8'; ctx.strokeStyle = '#06201c'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-4, -8); ctx.lineTo(0, 0); ctx.lineTo(-4, 8); ctx.closePath(); ctx.stroke(); ctx.fill();
  glow(ctx, 4, 0, 30, TEAL, 0.9);
  ctx.restore();
}
function drawGraveHand(ctx, h, k) {
  const floor = h.y + h.h, cx = h.x + h.w / 2;
  const rise = ease.outBack(clamp((1 - k) * 4.5, 0, 1)) * (k < 0.25 ? k / 0.25 : 1);
  const top = floor - h.h * rise;
  ctx.save();
  glow(ctx, cx, floor - 10, 70, TEAL, 0.5 * rise);
  // 팔뚝
  ctx.beginPath();
  ctx.moveTo(cx - 13, floor); ctx.quadraticCurveTo(cx - 16, (floor + top) / 2, cx - 10, top + 34);
  ctx.lineTo(cx + 12, top + 34); ctx.quadraticCurveTo(cx + 16, (floor + top) / 2, cx + 13, floor); ctx.closePath();
  ctx.fillStyle = 'rgba(160,240,224,0.75)'; ctx.fill();
  ctx.strokeStyle = '#06201c'; ctx.lineWidth = 2; ctx.stroke();
  // 손바닥 + 손가락
  ctx.beginPath(); ctx.ellipse(cx, top + 30, 15, 12, 0, 0, TAU);
  ctx.fillStyle = '#d8fff4'; ctx.fill(); ctx.stroke();
  const curl = Math.sin(h.t * 8) * 0.15;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const a = -PI / 2 + (i - 2) * 0.32 + (i === 0 ? -0.4 : 0), L = i === 0 ? 20 : 30 - Math.abs(i - 2.5) * 3;
    const bx = cx + Math.cos(a) * 12, by = top + 28 + Math.sin(a) * 10;
    const ex = bx + Math.cos(a + curl) * L, ey = by + Math.sin(a + curl) * L;
    ctx.strokeStyle = '#06201c'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + Math.cos(a) * L * 0.6, by + Math.sin(a) * L * 0.6, ex, ey); ctx.stroke();
    ctx.strokeStyle = '#e8fffa'; ctx.lineWidth = 4;
    ctx.stroke();
  }
  // 흙 파편 테두리
  ctx.fillStyle = '#2a2420';
  for (let i = 0; i < 6; i++) { const x = cx - 30 + i * 12; ctx.beginPath(); ctx.moveTo(x, floor); ctx.lineTo(x + 5, floor - 8 - hash(i) * 8); ctx.lineTo(x + 10, floor); ctx.fill(); }
  ctx.restore();
}
function drawSoulOrb(ctx, p) {
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, 26, '#5affd0', 0.8);
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  ctx.fillStyle = 'rgba(160,255,230,0.6)';
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.quadraticCurveTo(0, -8, -20, 0); ctx.quadraticCurveTo(0, 8, 8, 0); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(2, 0, 4.5, 0, TAU); ctx.fill();
}
function drawChainWeight(ctx, p) {
  ctx.rotate(p.t * 6);
  glow(ctx, 0, 0, 34, '#5affd0', 0.7);
  ctx.fillStyle = '#2a3a3c'; ctx.strokeStyle = '#06201c'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, r = i % 2 ? 9 : 15; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#9affe8'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
}
function drawWisp(ctx) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(140,255,220,0.7)'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 4, 0, 0, TAU); ctx.fill();
}
