// 보스 b_ziz — 지즈, 폭풍을 부르는 거신조 (s17) — world2 §6.5. 소유: BOSS-P2-2
// BossC(c_common.js) 상속. 그림은 벡터(2부 기준 디테일); 채색 퍼핏(ART-BOSS-7, W3)은 이 논리를 읽기만 한다.
//
// 모습: 화면보다 큰 거신조. 해골 부리, 날개 앞가장자리마다 눈 여섯, 번개가 흐르는 폭풍구름 깃털, 뜯긴 가슴의 갈비뼈
//   속 구전(球電) 코어, 부서진 첨탑 같은 돌 발톱, 몸을 감싼 폭풍구름. 바닥(A.floor) − 380 에 떠서 플레이어 쪽으로 흘러간다.
//   페이즈마다 깃털이 찢기고(dmg 0..2) P2 에 날개 눈이 뜨인다.
// 판정 부위 (world2 §6.5): 날개 눈 ×12 (0.8, P2+ · 각 최대 체력 1.2%, 부서지면 더 쏘지 않음) · 머리 (1.0) ·
//   갈비뼈 코어 (드러나면 0.5, 아니면 1.6 — gust 날개를 들 때와 crash 기절 때 드러난다) · 날개 ×2 (1.4)
// 패턴 (P2_PATTERNS.b_ziz): gust · bolts · talon · feathers · eyestorm(P2+) · cyclone(P2+) · crash(P3).
//   전환 phase1 · phase2 는 c_common 기본 전환(transitionTick) + 포효·번개 연출. 돌풍은 방의 wind 기믹(없으면 대역).
// 채색 렌더러가 읽는 필드: zx, zy (몸 중심) · facing (머리 방향) · tilt (몸 기울기) · flapPh (날갯짓 위상) ·
//   ps {raise, spread, fold, crash, mouth, neck, coreOpen, talon, eyes} · wing[-1|1] {S, E, Wr, Tp} (날개 골격 점, 몸 지역) ·
//   eyes[{side, j, alive, open, fireT, hitT, x, y}] · head {x, y} · dmg (0..2) · stunned · sw (talon 휩쓸기 {x0, x1, by, on}) · dieT
// 컬링: 날개 폭이 1200px 가 넘으므로 ArtCull 대리 개체가 artBounds() 로 그린다 (화면 가장자리에서 통째로 사라지지 않게).
import { BossC, telegraph, warnText, strikeRect, strikeColumn, groundWave, windGust } from './c_common.js';
import { PI, R, C, LG, ink, glow, glowE, glowSprite, warnRect, warnFloor, impact, hash, tube, boltPath } from './b_common.js';
import { Entity } from '../entity.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';
import { registerPainted, hasPainted } from '../../render/painted/registry.js';   // [hook:art-boss-7] 채색 퍼핏 등록 (그리기 전용)
import { bosses as ART7 } from '../../render/painted/reg/art-boss-7.js';

const STORM = '#2c3448', STORM_D = '#0a0e17', STORM_L = '#6f7f9c', RUFF = '#3c465e';
const BONE = '#e4dfcc', BONE_D = '#6e6a5b', SPIRE = '#8e909b', SPIRE_D = '#383a43', SPIRE_L = '#c4c6d0';
const CORE = '#bfe0ff', BOLT = '#e8f6ff', EYEC = '#fff2a0', BLOOD = '#5a0a14', GOLD = '#c8a860';
const L1 = 210, L2 = 190, L3 = 190;   // 날개 뼈 길이 (위팔 · 아래팔 · 손)
const EYE_K = [0.1, 0.24, 0.38, 0.52, 0.66, 0.8];   // 앞가장자리(어깨→손목) 위 눈 위치
const POSE0 = { raise: 0, spread: 0, fold: 0, crash: 0, mouth: 0, neck: 0, coreOpen: 0, talon: 0, eyes: 0 };
const POSE_RATE = { raise: 7, spread: 6, fold: 2.5, crash: 7, mouth: 12, neck: 6, coreOpen: 6, talon: 7, eyes: 9 };
// 깃털 목록 (날개 한쪽): 셋째날개 5 · 둘째날개 8 · 첫째날개 7
const FEATHERS = (() => {
  const out = [];
  for (let i = 0; i < 5; i++) out.push({ seg: 0, k: 0.15 + i * 0.19, len: 118 - i * 4, da: 0.28, i: out.length });
  for (let i = 0; i < 8; i++) out.push({ seg: 1, k: i / 7, len: 150 + Math.sin((i / 7) * PI) * 26, da: 0.1 - (i / 7) * 0.15, i: out.length });
  for (let i = 0; i < 7; i++) out.push({ seg: 2, k: i / 6, len: 175 + (i / 6) * 115, da: -(i / 6) * 1.1, fan: i / 6, i: out.length });
  return out;
})();
const CLOUDS = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ a: (i / 7) * TAU, r: 170 + hash(i * 3.3) * 170, s: 220 + hash(i * 1.7) * 140, y: -40 + hash(i * 5.1) * 120, sp: 0.12 + hash(i * 2.2) * 0.1 }));

let _cloud = null;
function cloudSprite() {
  if (_cloud) return _cloud;
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(128, 128) : null);
  if (!c) return null;
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(26,32,48,0.95)'); gr.addColorStop(0.5, 'rgba(20,26,40,0.6)'); gr.addColorStop(1, 'rgba(14,18,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _cloud = c;
  return c;
}

export class Ziz extends BossC {
  setup() {
    // [hook:art-boss-7] 모음(reg/index.js)에 art-boss-7 줄이 아직 없으면 여기서 한 번 등록 (이미 있으면 아무것도 안 함). BossB.init 의 preloadPainted 보다 먼저 돈다
    if (!hasPainted?.('b_ziz') && ART7?.b_ziz) registerPainted?.('b_ziz', { kind: 'boss', importer: ART7.b_ziz });
    const A = this.A;
    this.facing = -1;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    const p0 = this.P;   // 들어오는 플레이어 쪽으로 (등장 연출에서 보이게)
    this.zx = clamp(p0 ? p0.cx + 620 : this.cx, A.x0 + 260, Math.max(A.x0 + 260, A.x1 - 260)); this.zy = this.hoverY();
    this.tzx = this.zx; this.tzy = this.zy; this.spd = 150; this.spdY = 140;
    this.lvx = 0; this.tilt = 0; this.flapPh = 0; this.flapMul = 1;
    this.dmg = 0; this.stunned = false; this.sw = null; this.cr = null; this.dieT = 0;
    this.eyesOpen = false; this.eyesForce = 0; this.fxAcc = 0; this.gdir = 1; this.cdir = 1; this.esq = null;
    this.wing = { '-1': { S: { x: 0, y: 0 }, E: { x: 0, y: 0 }, Wr: { x: 0, y: 0 }, Tp: { x: 0, y: 0 }, a1: 0, a2: 0, a3: 0 }, '1': { S: { x: 0, y: 0 }, E: { x: 0, y: 0 }, Wr: { x: 0, y: 0 }, Tp: { x: 0, y: 0 }, a1: 0, a2: 0, a3: 0 } };
    this.head = { x: 0, y: 0, lx: 0, ly: 0, a: 0 };
    this._pt = { x: 0, y: 0 };
    const ehp = Math.max(1, Math.round(this.stats.maxHp * 0.012));
    this.eyes = [];
    for (const side of [-1, 1]) for (let j = 0; j < 6; j++) {
      const e = { side, j, hp: ehp, max: ehp, alive: true, open: 0, fireT: 0, hitT: 0, lx: 0, ly: 0, ang: 0, x: 0, y: 0 };
      e.part = { x: 0, y: 0, w: 30, h: 30, defMul: 0.8, eye: e, onHit: (part, dmg) => this.hitEye(e, dmg) };
      this.eyes.push(e);
    }
    this.pHead = { x: 0, y: 0, w: 60, h: 60, defMul: 1.0 };
    this.pCore = { x: 0, y: 0, w: 90, h: 90, defMul: 1.6 };
    this.pWing = [{ x: 0, y: 0, w: 10, h: 10, defMul: 1.4 }, { x: 0, y: 0, w: 10, h: 10, defMul: 1.4 }];
    this.cBody = { x: 0, y: 0, w: 150, h: 170 };
    this.cTalon = { x: 0, y: 0, w: 170, h: 90 };
    this._hp = []; this._cp = [];
    // 캐시 캔버스는 등장 연출 동안 만든다 (싸움 중 새 캔버스 0 — MASTER_PLAN §5.2)
    cloudSprite();
    for (const c of [CORE, BOLT, EYEC, '#ffffff', '#9fd0ff', '#ff4050', '#6a9cff']) { glowSprite(c, false); glowSprite(c, true); }
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  /** 카메라 윗변 (없으면 -무한). 낮은 방(보스 러시 경기장)에서 머리가 화면 위로 잘리지 않게 */
  camTop() { const c = this.world?.camera; return c && Number.isFinite(c.y) ? c.y : -1e9; }
  hoverY() { const A = this.A; return Math.min(A.floor - 250, Math.max((A.top ?? 0) + 190, A.floor - 380, this.camTop() + 240)); }
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; }
  faceP() { const p = this.P; if (p && !this.sw?.on) { const d = p.cx - this.zx; if (Math.abs(d) > 40) this.facing = Math.sign(d); } }
  /** 몸 지역 좌표 → 월드 (기울기 반영) */
  toWorld(lx, ly, out = this._pt) {
    const c = Math.cos(this.tilt), s = Math.sin(this.tilt);
    out.x = this.zx + lx * c - ly * s; out.y = this.zy + lx * s + ly * c;
    return out;
  }
  place() {
    this.x = this.zx - this.w / 2; this.y = this.zy - this.h / 2;
    this.vx = 0; this.vy = 0;
  }
  /** 골격: 날개 뼈 · 눈 · 머리 (몸 지역 좌표, 그리기와 판정이 같이 쓴다) */
  rig() {
    const s = this.ps, t = this.t;
    const osc = Math.sin(this.flapPh);
    const flapA = osc * (0.2 + 0.1 * this.flapMul) * (1 - s.fold) * (1 - s.crash);
    for (const side of [-1, 1]) {
      const W = this.wing[side];
      let a1 = -0.42 - s.raise * 0.75 + flapA - s.spread * 0.12;
      let a2 = a1 + 0.42 + s.raise * 0.25 - flapA * 0.5 + s.spread * 0.05;
      let a3 = a2 + 0.38 + s.raise * 0.1 - flapA * 0.4 - s.spread * 0.12;
      a1 = lerp(a1, 0.08, s.crash); a2 = lerp(a2, 0.22, s.crash); a3 = lerp(a3, 0.4, s.crash);
      a1 = lerp(a1, 1.15, s.fold); a2 = lerp(a2, 2.3, s.fold); a3 = lerp(a3, 2.7, s.fold);
      W.a1 = a1; W.a2 = a2; W.a3 = a3;
      W.S.x = side * 62; W.S.y = -46 + s.crash * 20;
      W.E.x = W.S.x + side * Math.cos(a1) * L1; W.E.y = W.S.y + Math.sin(a1) * L1;
      W.Wr.x = W.E.x + side * Math.cos(a2) * L2; W.Wr.y = W.E.y + Math.sin(a2) * L2;
      W.Tp.x = W.Wr.x + side * Math.cos(a3) * L3; W.Tp.y = W.Wr.y + Math.sin(a3) * L3;
    }
    // 눈: 어깨→팔꿈치→손목 앞가장자리 위
    for (const e of this.eyes) {
      const W = this.wing[e.side], u = EYE_K[e.j] * 2;
      const A0 = u < 1 ? W.S : W.E, B0 = u < 1 ? W.E : W.Wr, k = u < 1 ? u : u - 1;
      e.lx = lerp(A0.x, B0.x, k); e.ly = lerp(A0.y, B0.y, k) - 4;
      e.ang = Math.atan2(B0.y - A0.y, B0.x - A0.x);
    }
    // 머리 (facing 방향)
    const f = this.facing, H = this.head;
    H.lx = f * (96 - s.neck * 8 - s.crash * 30); H.ly = -170 - s.neck * 52 + s.crash * 110 + Math.sin(t * 1.6) * 4;
    H.a = -0.08 - s.neck * 0.35 + s.crash * 0.5 + s.mouth * -0.08;
  }
  syncParts() {
    const P = this._pt;
    for (const e of this.eyes) { this.toWorld(e.lx, e.ly, P); e.x = P.x; e.y = P.y; e.part.x = P.x - 15; e.part.y = P.y - 15; }
    this.toWorld(this.head.lx, this.head.ly, P); this.head.x = P.x; this.head.y = P.y; this.pHead.x = P.x - 30; this.pHead.y = P.y - 30;
    this.toWorld(0, 8, P); this.pCore.x = P.x - 45; this.pCore.y = P.y - 45;
    this.pCore.defMul = this.ps.coreOpen > 0.5 ? 0.5 : 1.6;
    for (let i = 0; i < 2; i++) {
      const W = this.wing[i ? 1 : -1], pw = this.pWing[i];
      const x0 = Math.min(W.S.x, W.E.x), x1 = Math.max(W.S.x, W.E.x) + (i ? 20 : -20);
      const y0 = Math.min(W.S.y, W.E.y) - 6, y1 = Math.max(W.S.y, W.E.y) + 110;
      this.toWorld((x0 + x1) / 2, (y0 + y1) / 2, P);
      pw.w = Math.max(60, Math.abs(x1 - x0)); pw.h = Math.max(60, y1 - y0); pw.x = P.x - pw.w / 2; pw.y = P.y - pw.h / 2;
    }
    const cb = this.cBody, ct = this.cTalon;
    this.toWorld(0, 0, P); cb.x = P.x - cb.w / 2; cb.y = P.y - cb.h / 2;
    this.toWorld(this.facing * 30 * this.ps.talon, 190, P); ct.x = P.x - ct.w / 2; ct.y = P.y - ct.h / 2;
  }
  motion(dt, world) {
    const s = this.ps, pt = this.pt;
    for (const k in s) s[k] += (pt[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt));
    const x0 = this.zx;
    if (!this.sw?.on) {
      this.zx = approach(this.zx, this.tzx, this.spd * dt);
      this.zy = approach(this.zy, this.tzy, this.spdY * dt);
    }
    const A = this.A;
    this.zx = clamp(this.zx, A.x0 + 60, A.x1 - 60);
    const vx = dt > 0 ? (this.zx - x0) / dt : 0;
    this.lvx += (vx - this.lvx) * (1 - Math.exp(-6 * dt));
    const tt = clamp(this.lvx / 1400, -0.16, 0.16) * (1 - s.crash) * (1 - s.fold);
    this.tilt += (tt - this.tilt) * (1 - Math.exp(-5 * dt));
    this.flapPh += dt * (2.1 + 1.6 * (this.flapMul - 1)) * (1 - s.crash * 0.9) * (1 - s.fold * 0.8);
    const eyeT = (this.eyesOpen || this.eyesForce > 0) ? 1 : 0;
    if (this.eyesForce > 0) this.eyesForce -= dt;
    for (const e of this.eyes) {
      e.open = approach(e.open, e.alive ? eyeT : 0, dt * (eyeT ? 3.5 : 2.5));
      if (e.fireT > 0) e.fireT -= dt;
      if (e.hitT > 0) e.hitT -= dt;
    }
    this.place();
    this.rig();
    this.syncParts();
  }
  idleAnim(dt) { this.flapPh += dt * 2.1; }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0) return L;
    for (const e of this.eyes) if (e.alive && e.open > 0.6) L.push(e.part);
    L.push(this.pHead, this.pCore);
    if (this.ps.fold < 0.5) L.push(this.pWing[0], this.pWing[1]);
    return L;
  }
  /**
   * 접촉 피해는 몸통만. talon · crash 동안은 몸 접촉이 없다: 그 피해는 예고된 지대(휩쓸기 1.7 · 추락 2.0 + 충격파)가 맡는다.
   * (검수: 발톱 접촉 판정(0.9)이 예고 없이 — 시작 자리로 1600px/s 로 날아가는 도중·추락 상승 중에 — 먼저 맞거나,
   *  추락 순간 몸 접촉(0.9)이 먼저 맞아 무적 시간 때문에 추락 2.0 이 빠졌다.) cTalon 은 채색 렌더러·디버그용으로 계속 계산한다
   */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.stunned || this.dying > 0 || this.state === 'talon' || this.state === 'crash') return L;
    L.push(this.cBody);
    return L;
  }
  hitEye(e, dmg) {
    if (!e.alive || this.dying > 0 || this.dead) return;
    e.hp -= Math.max(1, dmg || 0); e.hitT = 0.15;
    if (e.hp > 0) return;
    e.alive = false; e.hp = 0;
    const w = this.world;
    w.fx.burst('blood', e.x, e.y, 14, { speed: 240 });
    w.fx.burst('thunder', e.x, e.y, 10, { speed: 320 });
    w.fx.ring(e.x, e.y, { color: EYEC, r0: 8, r1: 70, life: 0.35, width: 4 });
    audio.sfx('hit_heavy', { pitch: 1.2, vol: 0.8 }); audio.sfx('bat', { pitch: 1.4, vol: 0.5 });
  }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (part?.eye) return;
    if (Math.random() < 0.6) world.fx.burst('feather', x, y, 2, { speed: 140 });
    if (part === this.pCore) world.fx.burst('thunder', x, y, 5, { speed: 260 });
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
  }
  ambient(dt, world) {
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * 4;
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1, W = this.wing[side], k = Math.random();
      const P = this.toWorld(lerp(W.E.x, W.Tp.x, k), lerp(W.E.y, W.Tp.y, k) + 90);
      if (Math.random() < 0.5) world.fx.emit('feather', P.x, P.y, { speed: 40, color: STORM });
      else world.fx.emit('thunder', P.x, P.y, { speed: 160, size: 2 });
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) { r.x = this.zx - 720; r.y = this.zy - 540; r.w = 1440; r.h = 940; return r; }
  draw(ctx, world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world && !this._artDrawing) return;   // 대리 개체(ArtCull)가 그린다
    super.draw(ctx, world);
  }
  /** 살아 있는 눈이 없으면 eyestorm 은 고르지 않는다 (부서진 눈은 쏘지 않는다) */
  weights(phase = this.phase) {
    const w = super.weights(phase);
    if (this.eyes.some((e) => e.alive)) return w;
    const f = w.filter(([k]) => k !== 'eyestorm');
    return f.length ? f : w;
  }

  // ═════════════════════════════ 상태 ═════════════════════════════
  s_intro(dt, world, t) {
    if (this.at(0.001)) { this.setPose({ raise: 1, spread: 1, mouth: 1, neck: 0.8 }); audio.sfx('bat', { pitch: 0.3, vol: 1 }); audio.sfx('thunderclap', { pitch: 0.7 }); this.lightning(0.9); impact(world, { shake: 8, time: 0.6 }); }
    if (this.at(0.8)) this.setPose({ raise: -0.6, mouth: 0.2, neck: 0 });
    if (this.at(1.2)) this.relax();
    if (t >= 1.4) this.done(0.8);
  }
  idleMove(dt, world, t) {
    this.faceP();
    const A = this.A, p = this.P;
    const px = p ? p.cx : A.cx;
    const side = Math.sign(this.zx - px) || -this.facing;
    this.tzx = clamp(px + side * 190, A.x0 + 240, A.x1 - 240);
    this.tzy = this.hoverY() + Math.sin(this.t * 1.3) * 18;
    this.spd = 150; this.spdY = 140;
  }

  // ── gust: 날개를 든다 1.0초(코어 드러남) → 플레이어를 밀어내는 돌풍 2.5초 + 바람 탄 깃털 8 ──
  s_gust(dt, world, t) {
    if (this.at(0.001)) {
      const p = this.P;
      this.gdir = p ? (Math.sign(p.cx - this.zx) || this.facing) : this.facing;
      telegraph(this, 1.0, { sfx: 'warning', vol: 0.4 });
      this.setPose({ raise: 1, coreOpen: 1, spread: 1, mouth: 0.8, neck: 0.4 });
      audio.sfx('bat', { pitch: 0.35, vol: 0.9 });
      windGust(this, this.gdir, 1300, 2.5, 1.0);   // 기믹 경고(1.0초)가 날개 들기와 겹친다 → 1.0초 뒤 2.5초 돌풍
      this.tzy = this.hoverY() - 30;
    }
    if (this.at(1.0)) {
      this.setPose({ raise: -0.85, spread: 0.6, mouth: 0.3, coreOpen: 0.4 });
      impact(world, { shake: 7, time: 0.4 });
      audio.sfx('whip', { pitch: 0.35 });
      for (let i = 0; i < 8; i++) this.later(i * 0.15, () => this.windFeather(this.gdir));
    }
    if (this.at(1.4)) this.setPose({ raise: 0, coreOpen: 0, spread: 0, mouth: 0, neck: 0 });
    if (t >= 3.2) this.done(1.0);
  }
  windFeather(dir) {
    const A = this.A;
    const y = rand(A.floor - 420, A.floor - 40);
    const x = dir > 0 ? Math.max(A.x0 + 20, this.zx - 160) : Math.min(A.x1 - 20, this.zx + 160);
    this.shoot({ x, y, vx: dir * 420, vy: rand(-25, 25), w: 36, h: 12, life: 5, render: featherRender, attack: { mv: 0.8, element: 'thunder' }, light: { r: 60, color: CORE, i: 0.45 } });
  }

  // ── bolts: 플레이어 x 와 ±200 에 낙뢰 기둥 (P2+ 두 번, 인페르노 5줄) ──
  s_bolts(dt, world, t) {
    const two = this.phase >= 1;
    if (this.at(0.001)) { this.faceP(); this.setPose({ neck: 1, mouth: 1, raise: 0.4 }); audio.sfx('bat', { pitch: 0.5, vol: 0.7 }); this.volley(); }
    if (two && this.at(1.1)) { this.setPose({ mouth: 1 }); this.volley(); }
    if (this.at(two ? 2.0 : 0.95)) this.setPose({ neck: 0, mouth: 0, raise: 0 });
    if (t >= (two ? 2.6 : 1.6)) this.done();
  }
  volley() {
    const A = this.A, p = this.P, px = p ? p.cx : A.cx;
    const top = (A.top ?? 0) - 400, bot = A.floor;
    for (const o of this.inferno ? [0, -200, 200, -400, 400] : [0, -200, 200]) {
      const x = clamp(px + o, A.x0 + 30, A.x1 - 30), seed = rand(0, 100);
      strikeColumn(this, x, {
        w: 60, warn: 0.9, life: 0.35, mv: 1.5, element: 'thunder', color: CORE, top, bottom: bot,
        onStart: (z, w) => { this.lightning(0.55); w.camera?.shake?.(4, 0.2); },
        paint: (ctx, z, w) => paintBolt(ctx, z, x, Math.max(top, (w.camera?.y ?? top) - 40), bot, w, seed),
      });
    }
  }

  // ── talon: 플레이어 높이의 띠 예고 0.8초 → 발톱이 경기장을 1초에 가로지른다 ──
  s_talon(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      const p = this.P;
      const left = this.zx < A.cx;
      const x0 = left ? A.x0 + 170 : A.x1 - 170, x1 = left ? A.x1 - 170 : A.x0 + 170;
      const by = clamp(p ? p.cy : A.floor - 60, (A.top ?? 0) + 220, A.floor - 60);
      this.sw = { x0, x1, dir: Math.sign(x1 - x0) || 1, by, on: false, t0: 0 };
      this.tzx = x0; this.tzy = by - 175; this.spd = 1600; this.spdY = 900;
      this.facing = this.sw.dir;
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.45 });
      this.zone({ x: A.x0, y: by - 60, w: A.w, h: 120, warn: 0, life: 0.8, harmless: true, z: 5, paint: (ctx, z, w) => warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / 0.8, 0, 1), CORE, w.time) });
      this.setPose({ talon: 1, raise: 0.6, spread: 0.3, mouth: 0.5 });
      audio.sfx('bat', { pitch: 0.45 });
    }
    const s = this.sw;
    if (s && this.at(0.8)) {
      s.on = true; s.t0 = t;
      this.zx = s.x0; this.zy = s.by - 175; this.facing = s.dir;
      this.setPose({ raise: -0.6 });
      this.zone({ x: this.zx - 90, y: s.by - 60, w: 180, h: 120, warn: 0, life: 1.0, mv: 1.7, z: 7, kb: [460, -380], tick: (z) => { z.x = this.zx - 90 + s.dir * 30; z.y = s.by - 60; } });
      audio.sfx('dash', { pitch: 0.5 }); audio.sfx('whip', { pitch: 0.3 });
      impact(world, { shake: 5, time: 0.3 });
    }
    if (s?.on) {
      const k = clamp((t - s.t0) / 1.0, 0, 1);
      this.zx = lerp(s.x0, s.x1, k * k * (3 - 2 * k));
      this.zy = s.by - 175;
      if (Math.random() < 0.8 * (world.fx.quality ?? 1)) world.fx.emit('dust', this.zx - s.dir * 60, Math.min(A.floor - 4, s.by + 60), { speed: 120, angle: -PI / 2 - s.dir * 0.6, spread: 0.5 });
      if (k >= 1) { s.on = false; this.tzx = this.zx; this.tzy = this.hoverY(); this.spd = 300; this.spdY = 320; this.setPose({ talon: 0, raise: 0.3, mouth: 0 }); }
    }
    if (t >= 2.6) { if (s) s.on = false; this.setPose({ raise: 0, talon: 0 }); this.done(); }
  }

  // ── feathers: 번개 깃털 9개 부채꼴 ──
  s_feathers(dt, world, t) {
    if (this.at(0.001)) { this.faceP(); telegraph(this, 0.6, { sfx: 'warning', vol: 0.35, pitch: 1.2 }); this.setPose({ spread: 1, raise: 0.5, coreOpen: 0.3 }); audio.sfx('mist', { pitch: 1.4 }); }
    if (this.at(0.6)) { this.fan(); this.setPose({ raise: -0.4, spread: 0.4 }); }
    if (this.at(1.0)) this.setPose({ spread: 0, raise: 0, coreOpen: 0 });
    if (t >= 1.4) this.done();
  }
  fan() {
    const p = this.P, o = this.toWorld(0, 20, { x: 0, y: 0 });
    const a0 = p ? Math.atan2(p.cy - o.y, p.cx - o.x) : PI / 2;
    for (let i = 0; i < 9; i++) {
      const a = a0 + (i - 4) * 0.13;
      this.shoot({ x: o.x + Math.cos(a) * 70, y: o.y + Math.sin(a) * 70, vx: Math.cos(a) * 480, vy: Math.sin(a) * 480, w: 30, h: 12, life: 4, render: featherRender, attack: { mv: 0.9, element: 'thunder' }, light: { r: 50, color: CORE, i: 0.4 } });
    }
    audio.sfx('thunder', { pitch: 1.3, vol: 0.7 });
    this.world.fx.burst('thunder', o.x, o.y, 10, { speed: 300 });
  }

  // ── eyestorm (P2+): 살아 있는 날개 눈이 0.12초 간격으로 번개 구슬 ──
  s_eyestorm(dt, world, t) {
    if (this.at(0.001)) {
      this.eyesForce = 3.2;
      const p = this.P, px = p ? p.cx : this.zx;
      this.esq = this.eyes.filter((e) => e.alive).sort((a, b) => Math.abs(b.x - px) - Math.abs(a.x - px));
      if (!this.esq.length) { this.done(0.6); return; }
      telegraph(this, 0.5, { sfx: 'warning', vol: 0.4, pitch: 1.3 });
      this.setPose({ spread: 0.8, raise: 0.3, mouth: 0.5 });
      audio.sfx('ghost', { pitch: 1.4, vol: 0.6 });
    }
    const n = this.esq?.length ?? 0;
    for (let i = 0; i < n; i++) if (this.at(0.5 + i * 0.12)) this.bead(this.esq[i]);
    if (t >= 0.5 + n * 0.12 + 0.6) { this.setPose({ spread: 0, raise: 0, mouth: 0 }); this.done(); }
  }
  bead(e) {
    if (!e?.alive) return;
    const p = this.P, a = p ? Math.atan2(p.cy - e.y, p.cx - e.x) : PI / 2;
    this.shoot({ x: e.x, y: e.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, w: 16, h: 16, life: 3.5, render: beadRender, attack: { mv: 0.7, element: 'thunder' }, light: { r: 60, color: EYEC, i: 0.6 } });
    e.fireT = 0.22;
    audio.sfx('thunder', { pitch: 1.8, vol: 0.3 });
  }

  // ── cyclone (P2+): 6초 동안 1.5초마다 바람 방향이 뒤집히고, 깃털 부채 두 번 ──
  s_cyclone(dt, world, t) {
    if (this.at(0.001)) {
      const p = this.P;
      this.cdir = p ? (Math.sign(p.cx - this.zx) || 1) : 1;
      telegraph(this, 0.6, { sfx: 'warning', vol: 0.4 });
      warnText(this, '폭풍이 몰아친다!', '#bfe0ff');
      this.setPose({ spread: 0.6, mouth: 0.6 }); this.flapMul = 3;
      windGust(this, this.cdir, 1100, 1.2, 0.6);
      audio.sfx('bat', { pitch: 0.4 });
    }
    if (this.at(1.8)) windGust(this, -this.cdir, 1100, 1.2, 0.3);
    if (this.at(3.3)) windGust(this, this.cdir, 1100, 1.2, 0.3);
    if (this.at(4.8)) windGust(this, -this.cdir, 1100, 1.2, 0.3);
    if (this.at(0.9) || this.at(3.7)) this.setPose({ spread: 1, coreOpen: 0.3 });
    if (this.at(1.2) || this.at(4.0)) { this.faceP(); this.fan(); this.setPose({ spread: 0.6, coreOpen: 0 }); }
    if (t >= 6.4) { this.flapMul = 1; this.setPose({ spread: 0, mouth: 0 }); this.done(); }
  }

  // ── crash (P3): 한쪽에 400×300 예고 1.2초 → 추락 + 충격파 → 3.5초 기절(코어 드러남, 바닥−120) → 일어남 ──
  s_crash(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      const p = this.P, px = p ? p.cx : A.cx;
      const sd = px < A.cx ? -1 : 1, w = Math.min(400, A.w * 0.4);
      const x = sd < 0 ? A.x0 : A.x1 - w;
      this.cr = { x, w, cx: x + w / 2, sd };
      this.tzx = x + w / 2; this.tzy = Math.min(A.floor - 260, Math.max((A.top ?? 0) + 140, A.floor - 560, this.camTop() + 120)); this.spd = 1100; this.spdY = 700;
      strikeRect(this, { x, y: A.floor - 300, w, h: 300 }, { warn: 1.2, life: 0.3, mv: 2.0, color: CORE, sfx: null, kb: [0, -700] });
      this.setPose({ raise: 1, spread: 1, mouth: 1, talon: 1, neck: 0.6 });
      audio.sfx('bat', { pitch: 0.3, vol: 1 });
    }
    if (this.at(0.95)) { this.tzy = A.floor - 120; this.spdY = 2800; this.spd = 2400; this.setPose({ raise: 0.9, talon: 0.5, neck: -0.2 }); }
    if (this.at(1.2) && this.cr) {
      const c = this.cr;
      this.zx = this.tzx = c.cx; this.zy = this.tzy = A.floor - 120;
      impact(world, { shake: 16, time: 0.6, stop: 0.08 });
      this.lightning(1);
      audio.sfx('explode', { pitch: 0.5 }); audio.sfx('thunderclap', { pitch: 0.6 });
      groundWave(this, c.cx, -1, { h: 40, speed: 520, mv: 1.0, color: CORE });
      groundWave(this, c.cx, 1, { h: 40, speed: 520, mv: 1.0, color: CORE });
      world.fx.burst('dust', c.cx, A.floor - 10, 24, { speed: 320, angle: -PI / 2, spread: 1.4 });
      world.fx.burst('feather', c.cx, A.floor - 80, 18, { speed: 260 });
      world.fx.burst('thunder', c.cx, A.floor - 60, 16, { speed: 420 });
      this.stunned = true;
      this.setPose({ crash: 1, raise: 0, spread: 0, talon: 0, mouth: 0.4, coreOpen: 1, neck: 0 });
    }
    if (this.stunned && Math.random() < 0.25 * (world.fx.quality ?? 1)) { const P = this.toWorld(rand(-50, 50), rand(-20, 40)); world.fx.emit('thunder', P.x, P.y, { speed: 200 }); }
    if (this.at(4.7)) { this.stunned = false; this.setPose({ crash: 0, coreOpen: 0, raise: 0.8, mouth: 0.8 }); this.tzy = this.hoverY(); this.spdY = 280; audio.sfx('bat', { pitch: 0.5 }); }
    if (this.at(5.1)) this.setPose({ raise: 0, mouth: 0 });
    if (t >= 5.5) this.done(0.9);
  }

  // ── 전환: 기본 transitionTick + 비명 · 번개 ──
  s_phase1(dt, world, t) { this.transFx(world); this.transitionTick(dt, world, t); }
  s_phase2(dt, world, t) { this.transFx(world); this.transitionTick(dt, world, t); }
  transFx(world) {
    if (this.at(0.001)) {
      this.stunned = false; if (this.sw) this.sw.on = false; this.flapMul = 1;
      this.tzx = this.zx; this.tzy = this.hoverY() - 40; this.spd = 200; this.spdY = 300;
      this.setPose({ raise: 1, spread: 1, mouth: 1, neck: 0.8, crash: 0, talon: 0 });
      audio.sfx('bat', { pitch: 0.3 }); audio.sfx('thunderclap', { pitch: 0.8 });
      this.lightning(0.9); impact(world, { shake: 10, time: 0.7 });
    }
    if (this.at(0.7)) { const P = this._pt; for (const e of this.eyes) { this.toWorld(e.lx, e.ly, P); world.fx.burst('thunder', P.x, P.y, 2, { speed: 200 }); } }
    if (this.at(1.2)) this.relax();
  }
  applyPhase(k) {
    this.dmg = Math.max(this.dmg, k);
    if (k >= 1) this.eyesOpen = true;   // P2: 날개 눈이 뜨인다 (판정 부위)
  }
  onCancel() {
    this.stunned = false; this.flapMul = 1;
    if (this.sw) this.sw.on = false;
    this.relax();
    this.spd = 150; this.spdY = 140; this.tzy = this.hoverY();
  }
  onReset() {
    this.dmg = 0; this.stunned = false; this.sw = null; this.cr = null; this.flapMul = 1;
    this.eyesOpen = false; this.eyesForce = 0;
    for (const e of this.eyes) { e.alive = true; e.hp = e.max; e.open = 0; e.fireT = 0; e.hitT = 0; }
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    this.tzx = this.zx; this.zy = this.tzy = this.hoverY(); this.spd = 150; this.spdY = 140;
  }
  onDeath(world) {
    this.dying = 3.6; this.dieT = 0;
    this.stunned = false; if (this.sw) this.sw.on = false;
    this.setPose({ fold: 1, raise: 0, spread: 0, mouth: 1, neck: -0.6, coreOpen: 1, talon: 0, crash: 0 });
    audio.sfx('bat', { pitch: 0.25 }); audio.sfx('thunderclap', { pitch: 0.5 });
    this.lightning(1);
    world.fx.ring(this.zx, this.zy, { color: CORE, r0: 30, r1: 420, life: 0.9, width: 12 });
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    this.tzx = this.zx; this.tzy = this.A.floor - 150; this.spdY = 90 + this.dieT * 40;
    this.motion(dt, world);
    const q = world.fx.quality ?? 1;
    if (Math.random() < 0.9 * q) {
      // 깃털에서 번개가 빠져나간다
      const side = Math.random() < 0.5 ? -1 : 1, W = this.wing[side], k = Math.random();
      const P = this.toWorld(lerp(W.S.x, W.Tp.x, k), lerp(W.S.y, W.Tp.y, k) + rand(0, 120));
      world.fx.emit('thunder', P.x, P.y, { speed: 220, angle: PI / 2, spread: 0.6 });
    }
    if (Math.random() < 0.3 * q) world.fx.emit('feather', this.zx + rand(-200, 200), this.zy + rand(-60, 100), { speed: 60 });
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    const dk = this.dying > 0 ? clamp(1 - this.dieT / 3, 0, 1) : 1;
    const P = this.toWorld(0, 8, { x: 0, y: 0 });
    L.add(P.x, P.y, 240 + 120 * this.ps.coreOpen, CORE, (0.55 + 0.35 * this.ps.coreOpen) * dk);
    L.add(this.head.x, this.head.y, 140, CORE, 0.45 * dk);
    for (const e of this.eyes) if (e.alive && e.open > 0.5) L.add(e.x, e.y, 70, EYEC, 0.35 * e.open * dk);
    if (this.dying > 0) L.add(this.zx, this.zy + this.dieT * 110, 150, '#6a9cff', clamp(this.dieT - 0.8, 0, 1));
  }

  // ═════════════════════════════ 그리기 ═════════════════════════════
  paintBack(ctx) {
    if (R.fl) return;
    // 몸을 감싼 폭풍구름 (캐시 스프라이트)
    const spr = cloudSprite();
    if (!spr) return;
    const t = this.t, cyc = this.flapMul > 1 ? 1 : 0, dk = this.dying > 0 ? clamp(1 - this.dieT / 3, 0, 1) : 1;
    ctx.save();
    for (const c of CLOUDS) {
      const a = c.a + t * c.sp * (1 + cyc * 6);
      const r = c.r * (1 + cyc * 0.3);
      const x = this.zx + Math.cos(a) * r, y = this.zy + c.y + Math.sin(a) * r * 0.35;
      ctx.globalAlpha = (0.42 + cyc * 0.2) * dk;
      ctx.drawImage(spr, x - c.s / 2, y - c.s * 0.35, c.s, c.s * 0.7);
    }
    ctx.restore();
    // 구름 속 번개 (시간 조각마다 한 번)
    const b = Math.floor(t * 5), h = hash(b * 1.37);
    if (h < 0.35 * dk) {
      const c = CLOUDS[Math.floor(hash(b * 2.9) * CLOUDS.length)], a = c.a + t * c.sp;
      const x = this.zx + Math.cos(a) * c.r, y = this.zy + c.y + Math.sin(a) * c.r * 0.35;
      glow(ctx, x, y, 120, '#9fd0ff', 0.35);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(BOLT, 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); boltPath(ctx, x - 40, y - 30, x + 50, y + 40, 6, 12, b); ctx.stroke();
      ctx.restore();
    }
  }
  paintBody(ctx, world, flash) {
    const A = this.A, fl = R.fl;
    this.rig();
    ctx.save();
    ctx.beginPath(); ctx.rect(this.zx - 2000, -6000, 4000, A.floor + 6004); ctx.clip();   // 바닥 아래로 늘어진 깃털은 자른다
    ctx.translate(this.zx, this.zy);
    if (this.tilt) ctx.rotate(this.tilt);
    if (flash) {
      // 피격 섬광: 화면을 덮는 날개까지 하얗게 칠하면 눈이 아프다 → 몸통·머리·날개 뼈만, 약하게
      ctx.globalAlpha *= 0.6;
      for (const side of [-1, 1]) this.drawWingArm(ctx, side, fl);
      this.drawTorso(ctx, fl); this.drawHead(ctx, fl);
    } else this.drawZiz(ctx, fl);
    ctx.restore();
  }
  paintFront(ctx) {
    if (R.fl) return;
    // 사망: 폭풍빛 심장이 떨어진다
    if (this.dying > 0 && this.dieT > 0.8) {
      const k = clamp(this.dieT - 0.8, 0, 1), x = this.zx, y = Math.min(this.A.floor - 20, this.zy + 10 + (this.dieT - 0.8) ** 2 * 60);
      glow(ctx, x, y, 90, '#6a9cff', 0.7 * k);
      ctx.save(); ctx.translate(x, y); const sc = 1 + Math.sin(this.t * 8) * 0.06; ctx.scale(sc, sc);
      ctx.globalAlpha *= k;
      ctx.fillStyle = '#b0c8ff';
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.bezierCurveTo(-26, -4, -14, -24, 0, -10); ctx.bezierCurveTo(14, -24, 26, -4, 0, 14); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(BOLT, 0.8); ctx.lineWidth = 1.5;
      ctx.beginPath(); boltPath(ctx, -8, -12, 6, 10, 4, 4, Math.floor(this.t * 12)); ctx.stroke();
      glow(ctx, 0, -2, 30, '#ffffff', 0.6 * k, true);
      ctx.restore();
    }
  }

  /** 몸 전체 (지역 좌표: 원점 = 몸 중심, 날개는 좌우 대칭, 머리만 facing) */
  drawZiz(ctx, fl) {
    this.drawTail(ctx, fl);
    for (const side of [-1, 1]) this.drawWingFeathers(ctx, side, fl);
    this.drawLegs(ctx, fl);
    for (const side of [-1, 1]) this.drawWingArm(ctx, side, fl);
    this.drawTorso(ctx, fl);
    this.drawHead(ctx, fl);
  }

  drawTail(ctx, fl) {
    const t = this.t, s = this.ps;
    for (let i = 0; i < 5; i++) {
      const u = i / 4 - 0.5, sw = Math.sin(t * 1.4 + i) * 16;
      const x0 = u * 40, y0 = 96, x2 = u * 250 + sw, y2 = 330 - Math.abs(u) * 60 - s.crash * 140;
      ctx.beginPath();
      ctx.moveTo(x0 - 12, y0);
      ctx.quadraticCurveTo(u * 120 - 16 + sw * 0.5, (y0 + y2) / 2, x2, y2);
      ctx.quadraticCurveTo(u * 120 + 16 + sw * 0.5, (y0 + y2) / 2, x0 + 12, y0);
      ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'zz_tail', 0, 90, 0, 330, [0, STORM, 0.6, STORM_D, 1, 'rgba(10,14,23,0.3)']), 2);
    }
  }

  /** 깃털 한 장: 기준 길이 200 템플릿을 len 으로 늘여 그린다 (그라디언트 캐시 1개) */
  feather(ctx, x, y, ang, len, torn, fl, bolt) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(len / 200, 1);
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(100, -24, torn ? 150 : 200, torn ? -8 : -2);
    if (torn) { ctx.lineTo(138, -1); ctx.lineTo(158, 5); ctx.lineTo(134, 10); }
    else ctx.lineTo(196, 6);
    ctx.quadraticCurveTo(100, 20, 0, 12);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'zz_feather', 0, 0, 200, 0, [0, STORM_L, 0.25, STORM, 0.8, '#1a2030', 1, STORM_D]), 2.4);
    if (!fl) {
      ctx.strokeStyle = 'rgba(180,200,235,0.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.quadraticCurveTo(100, -3, torn ? 146 : 194, 0); ctx.stroke();
      if (bolt) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(BOLT, 0.85); ctx.lineWidth = 2;
        ctx.beginPath(); boltPath(ctx, 10, 0, torn ? 140 : 190, 0, 7, 7, bolt); ctx.stroke();
        glowE(ctx, 100, 0, 110, 18, '#9fd0ff', 0.35);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }
  drawWingFeathers(ctx, side, fl) {
    const W = this.wing[side], s = this.ps, t = this.t, dmg = this.dmg;
    const segs = [[W.S, W.E, W.a1], [W.E, W.Wr, W.a2], [W.Wr, W.Tp, W.a3]];
    const bucket = Math.floor(t * 7);
    const FT = this._ft ?? (this._ft = FEATHERS.map(() => ({ x: 0, y: 0, a: 0, len: 0, skip: false, torn: false, h: 0 })));
    for (const F of FEATHERS) {
      const q = FT[F.i], h = hash(F.i * 3.71 + (side > 0 ? 17 : 0));
      const [P0, P1, a] = segs[F.seg];
      q.x = lerp(P0.x, P1.x, F.k); q.y = lerp(P0.y, P1.y, F.k);
      let an = a + PI / 2 + F.da - (F.fan ?? 0) * s.spread * 0.35 + Math.sin(t * 2.2 + F.i * 0.7) * 0.03;
      an = lerp(an, a + PI / 2 + 0.6, s.fold * 0.6);
      q.a = side > 0 ? an : PI - an;
      q.len = F.len * (1 - s.crash * 0.1);
      q.skip = (dmg >= 1 && h < 0.07) || (dmg >= 2 && h < 0.2);
      q.torn = dmg >= 1 && h < (dmg >= 2 ? 0.34 : 0.18);
      q.h = h;
    }
    // 날개 덩어리: 뼈대와 깃털 끝을 잇는 어두운 막 (빠진 깃털 자리는 찢긴 홈)
    ctx.beginPath();
    ctx.moveTo(W.S.x - side * 20, W.S.y + 30); ctx.lineTo(W.S.x, W.S.y); ctx.lineTo(W.E.x, W.E.y); ctx.lineTo(W.Wr.x, W.Wr.y); ctx.lineTo(W.Tp.x, W.Tp.y);
    for (let i = FEATHERS.length - 1; i >= 0; i--) {
      const q = FT[i], L = q.len * (q.skip ? 0.5 : q.torn ? 0.68 : 0.86);
      ctx.lineTo(q.x + Math.cos(q.a) * L, q.y + Math.sin(q.a) * L);
    }
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'zz_web', 0, -120, 0, 240, [0, '#232a3c', 0.5, '#151a28', 1, '#0a0d16']), 3);
    if (!fl) {
      // 폭풍구름 깃 끝
      const spr = cloudSprite();
      if (spr) {
        ctx.save(); ctx.globalAlpha *= 0.45;
        for (let i = 13; i < FEATHERS.length; i += 2) { const q = FT[i], L = q.len * 0.9, x = q.x + Math.cos(q.a) * L, y = q.y + Math.sin(q.a) * L, sz = 90 + (i % 3) * 30 + Math.sin(t + i) * 8; ctx.drawImage(spr, x - sz / 2, y - sz * 0.35, sz, sz * 0.7); }
        ctx.restore();
      }
    }
    for (const F of FEATHERS) {
      const q = FT[F.i];
      if (q.skip) continue;
      const bolt = !fl && hash(bucket * 1.3 + F.i * 7.1 + side) < 0.1 ? bucket + F.i : 0;
      this.feather(ctx, q.x, q.y, q.a, q.len, q.torn, fl, bolt);
    }
    if (!fl && dmg >= 2) {
      // 찢긴 날개막의 피 구멍
      const x = lerp(W.E.x, W.Wr.x, 0.5), y = lerp(W.E.y, W.Wr.y, 0.5) + 60;
      ctx.fillStyle = BLOOD; ctx.beginPath(); ctx.ellipse(x, y, 16, 10, 0.3, 0, TAU); ctx.fill();
      const dy = (t * 50) % 30; ctx.beginPath(); ctx.arc(x, y + 10 + dy, 2.5, 0, TAU); ctx.fill();
    }
  }
  drawWingArm(ctx, side, fl) {
    const W = this.wing[side], t = this.t;
    // 뼈가 드러난 날개 팔
    tube(ctx, W.S.x, W.S.y, W.E.x, W.E.y, 17, 12, fl ? '#fff' : RUFF, 'zz_hum', 2.6);
    tube(ctx, W.E.x, W.E.y, W.Wr.x, W.Wr.y, 12, 9, fl ? '#fff' : RUFF, 'zz_rad', 2.4);
    tube(ctx, W.Wr.x, W.Wr.y, W.Tp.x, W.Tp.y, 9, 4, fl ? '#fff' : RUFF, 'zz_hand', 2.2);
    if (!fl) {
      // 드러난 뼈 능선 + 가시 (팔꿈치 · 손목 발톱)
      ctx.strokeStyle = BONE; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(W.S.x, W.S.y - 10); ctx.lineTo(W.E.x, W.E.y - 9); ctx.lineTo(W.Wr.x, W.Wr.y - 7); ctx.lineTo(W.Tp.x, W.Tp.y - 3); ctx.stroke();
      ctx.strokeStyle = BONE_D; ctx.lineWidth = 1.2; ctx.stroke();
      // 앞가장자리 비늘깃 (물결)
      ctx.fillStyle = '#1c2232';
      for (let k = 0; k < 14; k++) {
        const u = k / 13, A0 = u < 0.5 ? W.S : W.E, B0 = u < 0.5 ? W.E : W.Wr, kk = u < 0.5 ? u * 2 : u * 2 - 1;
        const x = lerp(A0.x, B0.x, kk), y = lerp(A0.y, B0.y, kk) + 12;
        ctx.beginPath(); ctx.ellipse(x, y, 13, 9, 0, 0, PI); ctx.fill();
      }
    }
    for (const [P, a, L] of [[W.E, W.a1 - 0.9, 34], [W.Wr, W.a2 - 1.0, 44]]) {
      const ang = side > 0 ? a : PI - a;
      ctx.beginPath();
      ctx.moveTo(P.x + Math.cos(ang + 1.6) * 6, P.y + Math.sin(ang + 1.6) * 6);
      ctx.quadraticCurveTo(P.x + Math.cos(ang) * L * 0.6, P.y + Math.sin(ang) * L * 0.6 - 6, P.x + Math.cos(ang) * L, P.y + Math.sin(ang) * L);
      ctx.lineTo(P.x + Math.cos(ang - 1.6) * 6, P.y + Math.sin(ang - 1.6) * 6); ctx.closePath();
      ink(ctx, C(BONE), 1.8);
    }
    // 날개 눈 여섯
    for (const e of this.eyes) if (e.side === side) this.drawEye(ctx, e, fl, t);
  }
  drawEye(ctx, e, fl, t) {
    const ang = e.side > 0 ? e.ang : e.ang - PI;
    ctx.save();
    ctx.translate(e.lx, e.ly); ctx.rotate(ang);
    const w = 21, o = e.open, h = 3 + 12 * o;
    if (!e.alive) {
      if (!fl) {
        ctx.fillStyle = '#1a0206'; ctx.beginPath(); ctx.ellipse(0, 0, w, 8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = BLOOD; ctx.beginPath(); ctx.ellipse(0, 1, w * 0.7, 5, 0, 0, TAU); ctx.fill();
        const dy = (t * 40 + e.j * 7) % 26; ctx.fillStyle = '#7a0a1a'; ctx.beginPath(); ctx.arc(-2, 6 + dy, 2, 0, TAU); ctx.fill();
      }
      ctx.restore();
      return;
    }
    // 눈꺼풀 둔덕
    ctx.beginPath(); ctx.ellipse(0, 0, w + 5, 7 + 7 * o, 0, 0, TAU); ink(ctx, C('#3a3040'), 2);
    if (o > 0.05) {
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, -h * 1.1, w, 0); ctx.quadraticCurveTo(0, h * 1.1, -w, 0); ctx.closePath();
      ctx.fillStyle = fl ? '#fff' : (e.hitT > 0 ? '#ffffff' : '#f4ecc8'); ctx.fill();
      if (!fl) {
        ctx.save(); ctx.clip();
        // 핏발
        ctx.strokeStyle = 'rgba(200,40,50,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-w, -2); ctx.lineTo(-6, 0); ctx.moveTo(w, 2); ctx.lineTo(6, -1); ctx.moveTo(-w + 3, 4); ctx.lineTo(-7, 3); ctx.stroke();
        // 홍채 + 세로 동공 (플레이어를 본다)
        const p = this.P;
        let lx = 0, ly = 0;
        if (p) { const dx = p.cx - e.x, dy = p.cy - e.y, d = Math.hypot(dx, dy) || 1; const c = Math.cos(-ang), s = Math.sin(-ang); lx = ((dx * c - dy * s) / d) * 6; ly = ((dx * s + dy * c) / d) * 3; }
        ctx.fillStyle = e.fireT > 0 ? '#ffffff' : EYEC; ctx.beginPath(); ctx.arc(lx, ly, 9, 0, TAU); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#7a5a10'; ctx.stroke();
        ctx.fillStyle = '#0a0806'; ctx.beginPath(); ctx.ellipse(lx, ly, 2, 7.5, 0, 0, TAU); ctx.fill();
        ctx.restore();
        glow(ctx, 0, 0, 22 + (e.fireT > 0 ? 30 : 0), EYEC, 0.35 * o + (e.fireT > 0 ? 0.5 : 0));
      }
    } else if (!fl) {
      // 감긴 눈: 꿰맨 듯한 틈
      ctx.strokeStyle = '#0c0a10'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, 3, w, 0); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); for (let k = -3; k <= 3; k++) { ctx.moveTo(k * 4.5, 1); ctx.lineTo(k * 4.5 + 1, 5); } ctx.stroke();
    }
    ctx.restore();
  }

  drawLegs(ctx, fl) {
    const s = this.ps, t = this.t, f = this.facing, dmg = this.dmg;
    for (const side of [-1, 1]) {
      const hx = side * 36, hy = 78;
      const fwd = s.talon * f * 70, spread = s.crash * side * 110;
      const kx = hx + side * 16 + fwd * 0.6 + spread, ky = 134 - s.talon * 20 - s.crash * 40 + Math.sin(t * 1.3 + side) * 3;
      const ax = kx + side * 4 + fwd * 0.5 + spread * 0.4, ay = 198 - s.talon * 36 - s.crash * 80;
      // 넓적다리 (깃털)
      tube(ctx, hx, hy, kx, ky, 22, 15, fl ? '#fff' : STORM, 'zz_thigh', 2.4);
      // 정강이: 부서진 첨탑 (돌기둥 + 띠 + 창)
      const ang = Math.atan2(ay - ky, ax - kx), L = Math.hypot(ax - kx, ay - ky);
      ctx.save(); ctx.translate(kx, ky); ctx.rotate(ang - PI / 2);
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-9, L); ctx.lineTo(9, L); ctx.lineTo(12, 0); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'zz_spire', -12, 0, 12, 0, [0, SPIRE_D, 0.4, SPIRE, 0.6, SPIRE_L, 1, SPIRE_D]), 2.2);
      if (!fl) {
        ctx.fillStyle = GOLD; ctx.fillRect(-12, L * 0.3, 24, 3); ctx.fillRect(-11, L * 0.72, 22, 3);
        ctx.fillStyle = '#12141a'; ctx.beginPath(); ctx.moveTo(-3, L * 0.62); ctx.lineTo(-3, L * 0.44); ctx.arc(0, L * 0.44, 3, PI, 0); ctx.lineTo(3, L * 0.62); ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,26,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6, L * 0.1); ctx.lineTo(0, L * 0.2); ctx.lineTo(-4, L * 0.28); ctx.stroke();
      }
      ctx.restore();
      // 발톱 셋: 끝이 부러진 돌 첨탑
      const open = 0.3 + s.talon * 0.7 + s.crash * 0.5;
      for (let k = -1; k <= 1; k++) {
        const ta = PI / 2 + k * (0.3 + open * 0.4) + fwd * 0.004 - side * s.crash * 0.9;
        const TL = 62 + (k === 0 ? 18 : 0) - (dmg >= 2 && k === 1 && side > 0 ? 26 : 0);
        const tx = ax + Math.cos(ta) * TL, ty = ay + Math.sin(ta) * TL;
        const nx = -Math.sin(ta), ny = Math.cos(ta);
        ctx.beginPath();
        ctx.moveTo(ax + nx * 8, ay + ny * 8);
        ctx.quadraticCurveTo(ax + Math.cos(ta) * TL * 0.6 + nx * 7, ay + Math.sin(ta) * TL * 0.6 + ny * 7, tx + nx * 2, ty + ny * 2);
        ctx.lineTo(tx + Math.cos(ta) * 6, ty + Math.sin(ta) * 6); ctx.lineTo(tx - nx * 3, ty - ny * 3);
        ctx.quadraticCurveTo(ax + Math.cos(ta) * TL * 0.6 - nx * 7, ay + Math.sin(ta) * TL * 0.6 - ny * 7, ax - nx * 8, ay - ny * 8);
        ctx.closePath();
        ink(ctx, C(k === 0 ? SPIRE_L : SPIRE), 2);
        if (!fl) { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(ax + Math.cos(ta) * TL * 0.35, ay + Math.sin(ta) * TL * 0.35, 2.5, 0, TAU); ctx.fill(); }
      }
    }
  }

  drawTorso(ctx, fl) {
    const s = this.ps, t = this.t, dmg = this.dmg;
    // 몸통 실루엣 (폭풍 깃털)
    ctx.beginPath();
    ctx.moveTo(0, -112);
    ctx.bezierCurveTo(60, -112, 96, -70, 98, -20);
    ctx.bezierCurveTo(100, 40, 64, 96, 30, 112);
    ctx.lineTo(0, 122); ctx.lineTo(-30, 112);
    ctx.bezierCurveTo(-64, 96, -100, 40, -98, -20);
    ctx.bezierCurveTo(-96, -70, -60, -112, 0, -112);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'zz_torso', 0, -112, 0, 122, [0, RUFF, 0.4, STORM, 1, STORM_D]), 3.2);
    if (!fl) {
      // 깃털 비늘 무늬
      ctx.strokeStyle = 'rgba(140,160,200,0.22)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let r = 0; r < 5; r++) for (let c = -3; c <= 3; c++) {
        const x = c * 26 + (r % 2) * 13, y = -96 + r * 20;
        if (Math.abs(x) > 86 - r * 2) continue;
        ctx.moveTo(x - 11, y); ctx.quadraticCurveTo(x, y + 10, x + 11, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(160,200,255,0.3)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-92, -30); ctx.bezierCurveTo(-94, -76, -60, -108, -10, -110); ctx.stroke();
    }
    // 뜯긴 가슴: 갈비뼈 우리와 구전 코어
    const op = s.coreOpen, pulse = 0.8 + 0.2 * Math.sin(t * 9) + 0.1 * Math.sin(t * 23);
    ctx.beginPath(); ctx.ellipse(0, 12, 58 + op * 10, 66 + op * 6, 0, 0, TAU);
    ctx.fillStyle = C('#12060e'); ctx.fill();
    if (!fl) {
      ctx.strokeStyle = '#3a0612'; ctx.lineWidth = 5; ctx.stroke();
      // 찢긴 살 가장자리
      ctx.fillStyle = '#5a1020';
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU, rx = 58 + op * 10, ry = 66 + op * 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * rx, 12 + Math.sin(a) * ry); ctx.lineTo(Math.cos(a + 0.12) * (rx - 10 - hash(k) * 8), 12 + Math.sin(a + 0.12) * (ry - 10 - hash(k) * 8)); ctx.lineTo(Math.cos(a + 0.25) * rx, 12 + Math.sin(a + 0.25) * ry); ctx.fill(); }
      // 코어
      const cr = 30 + op * 8;
      glow(ctx, 0, 10, cr * 3.2 * pulse, CORE, 0.8);
      glow(ctx, 0, 10, cr * 1.3, '#ffffff', 0.9 * pulse, true);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(BOLT, 0.8); ctx.lineWidth = 1.8;
      const b = Math.floor(t * 14);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { const a = hash(b + k * 3.3) * TAU; boltPath(ctx, 0, 10, Math.cos(a) * (58 + op * 8), 12 + Math.sin(a) * (60 + op * 6), 5, 6, b + k); }
      ctx.stroke();
      ctx.restore();
    }
    // 갈비뼈 (코어가 드러나면 벌어진다)
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const y = -34 + i * 19, spread = 1 + op * 0.35;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 5, y - 6);
        ctx.bezierCurveTo(side * 34 * spread, y - 18, side * 60 * spread, y - 2, side * (54 + i * 2) * spread, y + 24);
        if (!fl) { ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 6.5; ctx.stroke(); }
        ctx.strokeStyle = C(BONE); ctx.lineWidth = 4; ctx.stroke();
        if (dmg >= 1 && i === 2 && side > 0 && !fl) { ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(side * 40, y - 8); ctx.lineTo(side * 44, y); ctx.stroke(); }
      }
    }
    if (!fl) {   // 갈비 사이로 새어 나오는 코어 빛
      glow(ctx, 0, 10, (46 + op * 16) * pulse, CORE, 0.55 + op * 0.35);
      glow(ctx, 0, 10, 20 + op * 8, '#ffffff', 0.6 * pulse, true);
    }
    // 용골 (가슴뼈)
    ctx.beginPath(); ctx.moveTo(-7, -58); ctx.lineTo(7, -58); ctx.lineTo(5, 72); ctx.lineTo(0, 86); ctx.lineTo(-5, 72); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'zz_keel', -7, 0, 7, 0, [0, BONE_D, 0.5, BONE, 1, BONE_D]), 2);
    // 목깃 (가시 깃)
    ctx.beginPath();
    ctx.moveTo(-70, -84);
    for (let i = 0; i <= 10; i++) { const u = i / 10, x = -70 + u * 140, y = -96 - Math.sin(u * PI) * 20; ctx.lineTo(x - 6, y - 14 - (i % 2) * 12); ctx.lineTo(x + 7, y); }
    ctx.lineTo(70, -84); ctx.quadraticCurveTo(0, -64, -70, -84); ctx.closePath();
    ink(ctx, fl ? '#fff' : RUFF, 2.2);
  }

  drawHead(ctx, fl) {
    const s = this.ps, H = this.head, f = this.facing, t = this.t, dmg = this.dmg;
    // 목 (굵은 깃털 관)
    const P = this._np ?? (this._np = new Float32Array(10));
    const x0 = f * 10, y0 = -96;
    for (let k = 0; k < 5; k++) {
      const u = k / 4;
      P[k * 2] = lerp(x0, H.lx - f * 22, u) + Math.sin(u * PI) * f * -18;
      P[k * 2 + 1] = lerp(y0, H.ly + 8, u) - Math.sin(u * PI) * 12;
    }
    taperZ(ctx, P, 5, 30, 20);
    ink(ctx, fl ? '#fff' : RUFF, 2.6);
    if (!fl) {
      ctx.strokeStyle = 'rgba(140,160,200,0.3)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); for (let k = 1; k < 4; k++) { const x = P[k * 2], y = P[k * 2 + 1]; ctx.moveTo(x - 14, y - 4); ctx.quadraticCurveTo(x, y + 8, x + 14, y - 4); } ctx.stroke();
    }
    ctx.save();
    ctx.translate(H.lx, H.ly); ctx.scale(f, 1); ctx.rotate(H.a);
    const jaw = 0.05 + s.mouth * 0.55;
    // 볏: 들쭉날쭉한 번개 깃
    ctx.beginPath();
    ctx.moveTo(-10, -26);
    for (let i = 0; i < 5; i++) { const a = -2.2 - i * 0.22, L = 60 + (i % 2) * 22 - i * 3 + Math.sin(t * 3 + i) * 4; ctx.lineTo(-16 + Math.cos(a) * L * 0.4, -18 + Math.sin(a) * L * 0.4); ctx.lineTo(-16 + Math.cos(a - 0.08) * L, -18 + Math.sin(a - 0.08) * L); ctx.lineTo(-16 + Math.cos(a - 0.2) * L * 0.5, -18 + Math.sin(a - 0.2) * L * 0.5); }
    ctx.lineTo(-40, 0); ctx.closePath();
    ink(ctx, fl ? '#fff' : STORM, 2);
    if (!fl) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(BOLT, 0.6); ctx.lineWidth = 1.5;
      const b = Math.floor(t * 8);
      ctx.beginPath(); boltPath(ctx, -20, -24, -16 + Math.cos(-2.4) * 70, -18 + Math.sin(-2.4) * 70, 5, 5, b); ctx.stroke();
      ctx.restore();
    }
    // 입 안 (번개)
    if (jaw > 0.1) {
      ctx.beginPath(); ctx.moveTo(14, 4); ctx.lineTo(140, 4); ctx.lineTo(14 + Math.cos(jaw) * 128, 8 + Math.sin(jaw) * 128); ctx.closePath();
      ctx.fillStyle = C('#1a0610'); ctx.fill();
      if (!fl) glowE(ctx, 60, 10 + jaw * 30, 60, 22, CORE, 0.5 * s.mouth);
    }
    // 아래 부리
    ctx.save(); ctx.translate(16, 8); ctx.rotate(jaw);
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(112, 2); ctx.quadraticCurveTo(120, 6, 112, 12); ctx.lineTo(4, 16); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'zz_mand', 0, -2, 0, 16, [0, BONE, 1, BONE_D]), 2.4);
    if (!fl) { ctx.strokeStyle = '#2a2620'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 9; k++) { ctx.moveTo(14 + k * 11, 0); ctx.lineTo(18 + k * 11, -4); } ctx.stroke(); }
    ctx.restore();
    // 해골 + 갈고리 윗부리
    ctx.beginPath();
    ctx.moveTo(-40, 6);
    ctx.bezierCurveTo(-46, -30, -10, -44, 20, -30);
    ctx.bezierCurveTo(70, -26, 130, -18, 156, 4);
    ctx.quadraticCurveTo(168, 18, 158, 34);
    ctx.quadraticCurveTo(152, 18, 138, 10);
    ctx.lineTo(20, 10);
    ctx.quadraticCurveTo(-10, 22, -40, 6);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'zz_skull', 0, -44, 0, 30, [0, '#fbf8ee', 0.35, BONE, 1, BONE_D]), 2.8);
    if (!fl) {
      // 톱니 날 (그로테스크)
      ctx.fillStyle = BONE_D; ctx.beginPath(); for (let k = 0; k < 8; k++) { const x = 30 + k * 13; ctx.moveTo(x, 10); ctx.lineTo(x + 4, 17); ctx.lineTo(x + 8, 10); } ctx.fill();
      // 콧구멍 · 봉합선 · 금
      ctx.fillStyle = '#1a1612'; ctx.beginPath(); ctx.ellipse(62, -14, 6, 2.5, -0.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(60,54,40,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-30, -18); ctx.lineTo(-18, -12); ctx.lineTo(-22, -4); ctx.lineTo(-10, 2); ctx.stroke();
      if (dmg >= 1) { ctx.strokeStyle = '#2a2218'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(96, -18); ctx.lineTo(104, -8); ctx.lineTo(98, 2); ctx.lineTo(108, 8); ctx.stroke(); }
      if (dmg >= 2) { ctx.fillStyle = '#12060c'; ctx.beginPath(); ctx.moveTo(146, -4); ctx.lineTo(160, 10); ctx.lineTo(150, 14); ctx.closePath(); ctx.fill(); }
      // 눈구멍 + 번개 눈동자
      ctx.fillStyle = '#060408'; ctx.beginPath(); ctx.ellipse(4, -12, 15, 12, -0.2, 0, TAU); ctx.fill();
      const k = 0.7 + 0.3 * Math.sin(t * 11);
      glow(ctx, 6, -12, 30, CORE, 0.7 * k);
      glow(ctx, 6, -12, 9, '#ffffff', 0.95, true);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(BOLT, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); boltPath(ctx, 6, -12, 30, -30, 4, 4, Math.floor(t * 10)); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }
}

// ═════════════════════════════ 도우미 ═════════════════════════════
function taperZ(ctx, P, n, r0, r1) {
  ctx.beginPath();
  for (let side = 1; side >= -1; side -= 2) {
    for (let j = 0; j < n; j++) {
      const k = side > 0 ? j : n - 1 - j;
      const i0 = Math.max(0, k - 1), i1 = Math.min(n - 1, k + 1);
      const dx = P[i1 * 2] - P[i0 * 2], dy = P[i1 * 2 + 1] - P[i0 * 2 + 1], L = Math.hypot(dx, dy) || 1;
      const r = lerp(r0, r1, k / (n - 1));
      const x = P[k * 2] - (dy / L) * r * side, y = P[k * 2 + 1] + (dx / L) * r * side;
      if (side > 0 && j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}
/** 번개 깃털 탄 (원점 = 탄 중심) */
function featherRender(ctx, p) {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  glowE(ctx, -6, 0, 34, 12, '#9fd0ff', 0.55);
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.quadraticCurveTo(0, -7, -20, -3); ctx.lineTo(-24, 0); ctx.lineTo(-20, 3); ctx.quadraticCurveTo(0, 7, 18, 0); ctx.closePath();
  ctx.fillStyle = '#3a4460'; ctx.fill();
  ctx.strokeStyle = BOLT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(17, 0); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(BOLT, 0.8); ctx.lineWidth = 1.2;
  ctx.beginPath(); boltPath(ctx, -20, 0, 16, 0, 4, 4, Math.floor(p.t * 20)); ctx.stroke();
}
/** 눈에서 쏜 번개 구슬 */
function beadRender(ctx, p) {
  const r = Math.max(p.w, p.h) * 0.5;
  glow(ctx, 0, 0, r * 3.4, EYEC, 0.8);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(BOLT, 0.8); ctx.lineWidth = 1;
  const b = Math.floor(p.t * 24);
  ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = hash(b + k) * TAU; boltPath(ctx, 0, 0, Math.cos(a) * r * 2.2, Math.sin(a) * r * 2.2, 3, 3, b + k); } ctx.stroke();
}
/** 낙뢰 기둥: 예고 = 기둥 윤곽 + 바닥 균열, 판정 = 갈래 번개 */
function paintBolt(ctx, z, x, top, bot, w, seed) {
  if (!z.started) {
    warnRect(ctx, x - 18, top, 36, bot - top, z.k * 0.8, CORE, w.time);
    warnFloor(ctx, x, bot, 84, z.k, CORE, w.time);
    return;
  }
  const f = 1 - z.a;
  ctx.globalCompositeOperation = 'lighter';
  glowE(ctx, x, (top + bot) / 2, 60, (bot - top) / 2, CORE, 0.55 * f);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const b = Math.floor(z.t * 30) + seed;
  ctx.strokeStyle = rgba(CORE, 0.8 * f); ctx.lineWidth = 12;
  ctx.beginPath(); boltPath(ctx, x, top, x, bot, 14, 22, b); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.95 * f); ctx.lineWidth = 4;
  ctx.beginPath(); boltPath(ctx, x, top, x, bot, 14, 22, b); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = rgba(BOLT, 0.7 * f);
  ctx.beginPath();
  for (let k = 0; k < 3; k++) { const y0 = lerp(top, bot, 0.3 + k * 0.2); boltPath(ctx, x, y0, x + (hash(b + k) - 0.5) * 160, y0 + 90, 5, 10, b + k); }
  ctx.stroke();
  glow(ctx, x, bot - 10, 90, '#ffffff', 0.7 * f);
}

/** 벡터 그림 컬링 대리 개체 (c_dagon.js 와 같은 방식): 보스의 artBounds() 를 사각형으로 삼아 보스 draw 를 대신 부른다 */
class ArtCull extends Entity {
  constructor(host) {
    super(host.x, host.y, host.w, host.h);
    this.kind = 'bossart'; this.host = host; this.z = host.z;
    this._r = { x: 0, y: 0, w: 0, h: 0 };
    this.sync();
  }
  sync() { const r = this.host.artBounds(this._r); this.x = r.x; this.y = r.y; this.w = r.w; this.h = r.h; }
  update(dt, world) {
    this.t += dt;
    const h = this.host;
    if (h.dead || h.world !== world) { this.dead = true; return; }
    this.z = h.z;
    this.sync();
  }
  draw(ctx, world) {
    const h = this.host;
    if (h.dead || h._artDrawing) return;
    h._artDrawing = true;
    try { h.draw(ctx, world); } finally { h._artDrawing = false; }
  }
}
