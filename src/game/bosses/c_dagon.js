// 보스 b_dagon — 다곤, 가라앉은 성소의 사제왕 (s16) — world2 §6.4. 소유: BOSS-P2-2
// BossC(c_common.js) 상속. 그림은 벡터(2부 기준 디테일); 채색 퍼핏(ART-BOSS-6, W3)은 이 논리를 읽기만 한다.
//
// 모습: 거대한 아귀 머리의 사제왕. 따개비가 들러붙은 회록색 살, 늑골을 가로지르는 아가미, 생물발광 미끼 셋이 달린
//   산호 왕관, 산호 목장(지팡이), 뱀장어 촉수 하반신, 등에 녹아 붙은 가라앉은 파이프 오르간, 등살에 진주처럼 박힌
//   익사한 순례자들. 수면(deep 기믹, 없으면 c_common 대역 물)에서 상반신을 드러내며 떠오르고, 가라앉으면 미끼 빛만 남는다.
//   바닥 아래는 잘라 그린다 (심연에서 솟은 몸). 페이즈마다 상처가 늘어난다 (dmg 0..2).
// 판정 부위 (world2 §6.4): 떠다니는 미끼(lure 패턴, 1.0 · 맞으면 터져 사라짐) · 왕관 미끼 ×3 (1.0, 각 최대 체력 2% →
//   부서지면 1초 경직 stagger, P3 에 다시 자람) · 얼굴/왕관 (1.0) · 아가미 ×2 (펼침 0.6 / 평소 1.3) · 몸통 (1.3)
// 패턴 (P2_PATTERNS.b_dagon): whirl · lure · organ · tentacle · flood(P2+) · charge(P2+) · choir(P3). 보조: stagger.
//   전환 phase1 · phase2 는 c_common 기본 전환(transitionTick) + 포효 연출.
// 채색 렌더러가 읽는 필드: ox, oy (몸 원점 = 상체 밑 수면선, 발 아님) · facing · rot (돌진 회전 0..1, 머리가 진행 방향) ·
//   sink (0 떠오름 … 1 잠김) · wy (수면 y) · ps {mouth, gill, crook, arms, crown, pipes, wail, slump, lean, inhale} ·
//   K (골격 점: hx, hy, ha 머리, mx, my 입, gl/gr 아가미, crookX/Y 지팡이 끝) · bulbs[{i, alive, grow, hitT, x, y}] ·
//   lures[{x, y, t}] · dmg (0..2) · dash ({dir, y} | null) · dieT (사망 연출 시간)
// 컬링: 그림이 판정 사각형보다 훨씬 커서 화면 가장자리에서 통째로 사라지지 않게 ArtCull 대리 개체가 artBounds() 로 그린다.
import { BossC, telegraph, warnText, strikeRect, strikeCircle, ringWave, pullField, setWater, waterY, darken, spawnMinion } from './c_common.js';
import { PI, R, C, LG, RG, ink, glow, glowE, glowSprite, warnRect, impact, hash, tube } from './b_common.js';
import { Entity } from '../entity.js';
import { T } from '../../core/physics.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';
import { registerPainted, hasPainted, paintedRig, paintedEnabled } from '../../render/painted/registry.js';
import { bosses as ART6 } from '../../render/painted/reg/art-boss-6.js';

// ───────────────────────── 채색 퍼핏 (ART-BOSS-6) ─────────────────────────
// 모음(reg/index.js)에 art-boss-6 줄이 아직 없으면 여기서 한 번 등록한다 (이미 있으면 아무것도 안 함).
// 채색 준비 전·?painted=0·굽기 실패 때는 아래 벡터 그림이 그대로 쓰인다.
if (!hasPainted('b_dagon') && ART6.b_dagon) registerPainted('b_dagon', { kind: 'boss', importer: ART6.b_dagon });
/** 채색 소품 도우미 (떠다니는 미끼 전구 · 수면 촉수). 없으면 null → 벡터 */
const pArt = (world) => (paintedEnabled(world?.game) ? paintedRig('b_dagon')?.art ?? null : null);

const TS = 48;
const SINK = 430;            // 완전히 잠겼을 때 몸이 내려가는 거리(px)
const DEG = PI / 180;
const BIO = '#6fffe8', WATER = '#6fd8ff', ICHOR = '#58ffd8';
const FLESH = '#4d6358', FLESH_L = '#93ac9b', FLESH_D = '#141f1b';
const BELLY = '#b6c0a6', BELLY_D = '#5f6d59';
const GILL = '#c62a40', GILL_D = '#3e0610', MOUTH = '#22030a', TOOTH = '#ece7d3';
const BARN = '#a19d8a', BARN_D = '#2f2d25';
const PIPE = '#5f7d64', PIPE_L = '#b8d4aa', PIPE_D = '#18261c', BAND = '#a08a4a';
const ROBE = '#163844', ROBE_D = '#061319', GOLD = '#bf9f52';
const CORAL = '#d4553f', CORAL_L = '#ff9d7e', PEARL = '#e8f0f4', PALE = '#9fb3b8', EEL = '#2f3a44', EEL_L = '#6e7f8c';

const POSE0 = { mouth: 0, gill: 0, crook: 0, arms: 0, crown: 0, pipes: 0, wail: 0, slump: 0, lean: 0, inhale: 0 };
const POSE_RATE = { mouth: 14, gill: 10, crook: 6, arms: 7, crown: 9, pipes: 5, wail: 4, slump: 6, lean: 6, inhale: 5 };

// 등의 파이프 오르간 (x, 폭, 높이, 기울기, P2 부터 부러짐)
const PIPES = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
  x: -132 + i * 19, w: 15 + (i % 3) * 4, h: 150 + hash(i * 3.17 + 1) * 120 + (i === 3 ? 40 : 0), a: -0.26 + i * 0.055, broken: i === 1 || i === 4 || i === 5,
}));
// 따개비 무리 (몸 지역 좌표, r)
const BARNS = (() => {
  const out = [];
  const cl = [[-70, -150, 7], [-86, -110, 5], [-40, -170, 6], [60, -140, 5], [-95, -40, 5], [70, -40, 4]];
  cl.forEach(([cx, cy, n], k) => { for (let i = 0; i < n; i++) out.push({ x: cx + (hash(k * 9 + i) - 0.5) * 34, y: cy + (hash(k * 7 + i * 3.3) - 0.5) * 26, r: 3 + hash(k + i * 5.1) * 4.5 }); });
  return out;
})();
// 촉수 뿌리 (몸 지역 좌표 x, 뒤/앞)
const TENT_BACK = [-70, -30, 10];
const TENT_FRONT = [-40, 0, 36, 70];

export class Dagon extends BossC {
  setup() {
    const A = this.A;
    this.facing = -1;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    this.K = { br: 0, hx: 50, hy: -214, ha: 0, mx: 120, my: -200, gl: { x: -46, y: -104 }, gr: { x: 44, y: -100 }, fx: 90, fy: -226, crookX: 120, crookY: -330 };
    this.wy = this.surfaceY();
    const p0 = this.P;   // 들어오는 플레이어 가까이 (등장 연출에서 보이게)
    this.bx = clamp(p0 ? p0.cx + 560 : this.cx, A.x0 + 220, Math.max(A.x0 + 220, A.x1 - 220)); this.tbx = this.bx; this.moveSp = 80;
    this.sink = 0; this.tsink = 0; this.sinkRate = 1.8;
    this.rot = 0; this.dash = null; this.dmg = 0; this.u0 = 0; this.twitch = 0;
    this.floodT = 0; this.dieT = 0; this.fxAcc = 0; this.wc = this.bx;
    this.lures = [];
    this._pt = { x: 0, y: 0 };
    const hp = Math.max(1, Math.round(this.stats.maxHp * 0.02));
    this.bulbs = [0, 1, 2].map((i) => {
      const b = { i, hp, max: hp, alive: true, grow: 1, hitT: 0, out: false, x: 0, y: 0, lx: 0, ly: 0, sx: 0, sy: 0, tx: 0, ty: 0 };
      b.part = { x: 0, y: 0, w: 32, h: 32, defMul: 1.0, bulb: b, onHit: (part, dmg) => this.hitBulb(b, dmg) };
      return b;
    });
    this.pFace = { x: 0, y: 0, w: 80, h: 66, defMul: 1.0 };
    this.pGill = [{ x: 0, y: 0, w: 38, h: 66, defMul: 1.3 }, { x: 0, y: 0, w: 38, h: 66, defMul: 1.3 }];
    this.pBody = { x: 0, y: 0, w: 180, h: 240, defMul: 1.3 };
    this.cBody = { x: 0, y: 0, w: 140, h: 190 };
    this._hp = []; this._cp = [];
    // 발광 스프라이트는 보스 등장 연출 동안 미리 만든다 (싸움 중 새 캔버스 0 — MASTER_PLAN §5.2)
    for (const c of [BIO, WATER, ICHOR, GILL, CORAL_L, '#dff4ff', '#3ad0c8', '#ffffff', '#bff4ff', '#ff5a6a', '#ff4a60', '#4aa8ff']) { glowSprite(c, false); glowSprite(c, true); }
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  /** 수면 y: 물 기믹(진짜/대역)의 수면, 없으면 바닥 4칸 위 */
  surfaceY() {
    const y = waterY(this);
    return Number.isFinite(y) ? y : this.A.floor - 4 * TS;
  }
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; if (this.phase >= 2) this.pt.wail = 0.35; }
  /** 떠오르기. 반환 = 패턴이 기다릴 시간(초) */
  emerge(rate = 1.9) {
    const d = this.sink > 0.1 ? this.sink / rate + 0.05 : 0;
    this.tsink = 0; this.sinkRate = rate;
    if (d > 0) this.splash(0.8);
    return d;
  }
  submerge(rate = 2.2) { this.tsink = 1; this.sinkRate = rate; this.splash(0.7); }
  /**
   * 패턴 시작: 떠오르기 지연을 u0 에 (패턴 시간표는 u(x) 로). idle 에서 잠수해 헤엄쳐 가던 중이면 잠긴 채 도착한 뒤
   * 떠오른다 — 떠오른 채 수면을 650px/s 로 미끄러지며 공격하지 않게 (검수: 합창·홍수·오르간이 이동 중에 시작됐다)
   */
  begin(emerge = true) {
    this.faceP();
    const far = Math.abs(this.tbx - this.bx);
    if (emerge && far > 6 && this.moveSp > 300) {
      const wait = far / this.moveSp;
      this.tsink = Math.max(this.tsink, 0.8);
      const sinkAt = approach(this.sink, this.tsink, this.sinkRate * wait);
      this.u0 = wait + sinkAt / 1.9 + 0.05;
      this.later(wait, () => { this.bx = this.tbx; this.moveSp = 80; this.emerge(1.9); this.faceP(); });
      return;
    }
    this.u0 = emerge ? this.emerge() : 0;
  }
  /** 헤엄쳐 가던 곳에 닿았는가 */
  arrived() { return Math.abs(this.tbx - this.bx) <= 6; }
  u(x) { return this.at(this.u0 + x); }
  faceP() { const p = this.P; if (p && !this.dash) this.facing = Math.sign(p.cx - this.bx) || this.facing; }
  /** 떠오를 수면 지점: 플레이어와 약 420px (최소 260) 떨어지고, 가능하면 지금 화면 안 (좁은 폰 화면에서도 보이게) */
  pickSpot() {
    const A = this.A, p = this.P, px = p ? p.cx : A.cx, cam = this.world?.camera;
    let lo = A.x0 + 170, hi = Math.max(lo, A.x1 - 170);
    if (cam && Number.isFinite(cam.x) && cam.vw > 400) {
      const c0 = Math.max(lo, cam.x + 170), c1 = Math.min(hi, cam.x + cam.vw - 170);
      if (c1 - c0 > 240) { lo = c0; hi = c1; }
    }
    let best = this.bx, bs = -1e9;
    for (let i = 0; i <= 10; i++) {
      const x = lerp(lo, hi, i / 10) + rand(-24, 24), d = Math.abs(x - px);
      const s = -Math.abs(d - 420) - Math.abs(x - this.bx) * 0.1 + (d < 260 ? -600 : 0);
      if (s > bs) { bs = s; best = x; }
    }
    return clamp(best, A.x0 + 170, Math.max(A.x0 + 170, A.x1 - 170));
  }
  /** 지금 화면 밖인가 (카메라 없으면 false) */
  offscreen() {
    const cam = this.world?.camera;
    if (!cam || !Number.isFinite(cam.x) || !(cam.vw > 400)) return false;
    return this.bx < cam.x + 40 || this.bx > cam.x + cam.vw - 40;
  }
  /** 몸 지역 좌표 → 월드 (facing · 돌진 회전 반영; 회전 중심 = 몸통 가운데 (0, -70)) */
  toWorld(lx, ly, out = this._pt) {
    const f = this.facing;
    if (this.rot) {
      const a = this.rot * PI / 2, c = Math.cos(a), s = Math.sin(a), dy = ly + 70;
      out.x = this.ox + f * (lx * c - dy * s); out.y = this.oy - 70 + (lx * s + dy * c);
    } else { out.x = this.ox + f * lx; out.y = this.oy + ly; }
    return out;
  }
  place() {
    const bob = Math.sin(this.t * 1.1) * 4 * (1 - this.sink);
    this.ox = this.bx;
    this.oy = this.dash ? this.dash.y + 70 : this.wy + this.sink * SINK + bob;
    // 화면이 낮은 방(보스 러시 경기장)이나 홍수 때 왕관이 화면 위로 잘리지 않게: 몸 원점은 카메라 윗변 + 330 아래
    if (!this.dash && this.camLim != null) this.oy = Math.max(this.oy, this.camLim);
    this.x = this.bx - this.w / 2;
    this.y = this.dash ? this.dash.y - this.h / 2 : this.oy - 190;
    this.vx = 0; this.vy = 0;
  }
  /** 골격 점 (몸 지역 좌표): 그리기와 판정이 같이 쓴다 */
  rig() {
    const s = this.ps, t = this.t, K = this.K;
    K.br = Math.sin(t * 1.7);
    K.hx = 50 + s.lean * 18 - s.slump * 8 - s.inhale * 6;
    K.hy = -214 + s.slump * 36 - s.crook * 10 - s.inhale * 8 + K.br * 2;
    K.ha = -0.05 - s.mouth * 0.14 + s.slump * 0.4 - s.crook * 0.12 + s.crown * 0.32 - s.lean * 0.1 + Math.sin(t * 0.9) * 0.03;
    const c = Math.cos(K.ha), sn = Math.sin(K.ha);
    const hl = (x, y, o) => { o.x = K.hx + x * c - y * sn; o.y = K.hy + x * sn + y * c; return o; };
    const m = hl(84, 10, this._pt); K.mx = m.x; K.my = m.y;
    const fc = hl(36, -16, this._pt); K.fx = fc.x; K.fy = fc.y;
    // 왕관 미끼: 줄기 뿌리(머리 지역) → 끝 (몸 지역). crown > 0 이면 앞으로 숙여 흔든다
    for (const b of this.bulbs) {
      const i = b.i;
      const base = hl([-14, 12, 38][i], [-58, -68, -60][i], this._pt); b.sx = base.x; b.sy = base.y;
      const sw = Math.sin(t * 1.9 + i * 2.1) * 9 + Math.sin(t * 3.3 + i) * 3;
      const reach = 1 + s.crown * 0.35;
      const tx = [-50, 18, 92][i] * reach + sw + s.crown * 60, ty = [-128, -156, -120][i] * (1 - s.crown * 0.5) + Math.cos(t * 1.7 + i) * 5;
      const tip = hl(tx, ty, this._pt);
      b.lx = tip.x; b.ly = tip.y + 16 + Math.sin(t * 2.4 + i) * 3;   // 실에 매달린 전구
      b.tx = tip.x; b.ty = tip.y;
    }
    K.gl.x = -48; K.gl.y = -102 + s.slump * 14;
    K.gr.x = 46; K.gr.y = -98 + s.slump * 14;
    K.crookX = 124 + s.crook * 10; K.crookY = -330 - s.crook * 150 + s.slump * 40;
  }
  syncParts() {
    const P = this._pt;
    this.toWorld(this.K.fx, this.K.fy, P); setR(this.pFace, P.x, P.y);
    const fl = this.ps.gill > 0.5;
    this.toWorld(this.K.gl.x, this.K.gl.y, P); setR(this.pGill[0], P.x, P.y); this.pGill[0].defMul = fl ? 0.6 : 1.3;
    this.toWorld(this.K.gr.x, this.K.gr.y, P); setR(this.pGill[1], P.x, P.y); this.pGill[1].defMul = fl ? 0.6 : 1.3;
    const pb = this.pBody, cb = this.cBody;
    if (this.dash) {
      pb.w = 280; pb.h = 150; pb.x = this.bx - 140; pb.y = this.dash.y - 75;
      cb.w = 240; cb.h = 120; cb.x = this.bx - 120; cb.y = this.dash.y - 60;
    } else {
      pb.w = 180; pb.h = 240; pb.x = this.x; pb.y = this.y;
      cb.w = 140; cb.h = 180; cb.x = this.bx - 70; cb.y = this.oy - 180;
    }
    for (const b of this.bulbs) { this.toWorld(b.lx, b.ly, P); b.x = P.x; b.y = P.y; setR(b.part, P.x, P.y); }
  }
  /** 매 논리 프레임: 수면 · 잠김 · 걸음 · 자세 · 판정 부위 */
  motion(dt, world) {
    const cam = world?.camera;
    if (cam && Number.isFinite(cam.y)) { const lim = cam.y + 330; this.camLim = this.camLim == null || dt <= 0 ? lim : approach(this.camLim, lim, 260 * dt); }
    const W = this.surfaceY();
    this.wy = Math.abs(W - this.wy) > 260 ? W : approach(this.wy, W, 150 * dt);
    this.sink = approach(this.sink, this.tsink, this.sinkRate * dt);
    if (!this.dash) this.bx = approach(this.bx, this.tbx, this.moveSp * dt);
    const s = this.ps, pt = this.pt;
    for (const k in s) s[k] += (pt[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt));
    this.rot += ((this.dash ? 1 : 0) - this.rot) * (1 - Math.exp(-12 * dt));
    if (this.rot < 0.002) this.rot = 0;
    if (this.twitch > 0) this.twitch = Math.max(0, this.twitch - dt);
    for (const b of this.bulbs) {
      if (b.hitT > 0) b.hitT -= dt;
      if (b.alive && b.grow < 1) b.grow = Math.min(1, b.grow + dt / 2.2);
    }
    this.place();
    this.rig();
    this.syncParts();
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0) return L;
    for (const l of this.lures) L.push(l.part);
    for (const b of this.bulbs) if (b.alive && b.grow >= 1 && b.y < this.A.floor - 12) L.push(b.part);
    if (this.sink < 0.55) {
      if (!this.dash) L.push(this.pFace, this.pGill[0], this.pGill[1]);
      L.push(this.pBody);
    }
    return L;
  }
  /**
   * 접촉 피해는 떠올라 있을 때 몸통만. 돌진(dash) 중에는 몸 접촉이 없다: 그 피해는 몸통을 다 덮는 돌진 지대(mv 1.7)가 맡는다
   * (검수: 지금 갱신 순서에서는 지대가 먼저 닿지만, 접촉(0.8)이 먼저 처리되면 무적 시간 때문에 돌진 1.7 이 빠진다 — 순서에
   *  기대지 않게. 지즈 talon · crash 와 같은 규칙)
   */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.sink < 0.5 && !this.dash && !(this.dying > 0)) L.push(this.cBody);
    return L;
  }
  hitBulb(b, dmg) {
    if (!b.alive || this.dying > 0 || this.dead) return;
    b.hp -= Math.max(1, dmg || 0); b.hitT = 0.16;
    if (b.hp > 0) return;
    b.alive = false; b.hp = 0;
    const w = this.world;
    w.fx.burst('water', b.x, b.y, 14, { speed: 260 });
    w.fx.burst('soul', b.x, b.y, 12, { color: BIO, speed: 170 });
    w.fx.ring(b.x, b.y, { color: BIO, r0: 10, r1: 96, life: 0.4, width: 5 });
    audio.sfx('hit_heavy', { pitch: 1.4, vol: 0.8 }); audio.sfx('ghost', { pitch: 0.5, vol: 0.6 });
    this.startStagger();
  }
  startStagger() {
    if (this.dying > 0 || this.dead || this._tr || this.invuln) return;
    this.cancelPattern();
    this.setState('stagger');
  }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (part?.bulb || part?.lure) return;
    world.fx.burst('water', x, y, 4, { speed: 180 });
    if (Math.random() < 0.5) world.fx.burst('soul', x, y, 3, { color: ICHOR, speed: 120 });
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    if (!this._wInit) { this._wInit = true; this.gim('deep'); }   // 물 기믹이 없는 방(보스 러시)엔 대역 물
    this.motion(dt, world);
    this.tickLures(dt, world);
    if (this.floodT > 0) { this.floodT -= dt; if (this.floodT <= 0) { this.floodT = 0; this.recede(); } }
    this.ambient(dt, world);
    this.ensureCull(world);
  }
  /** 물거품·물방울 (품질 배율) */
  ambient(dt, world) {
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (this.sink > 0.4 ? 10 : 5);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      if (this.sink > 0.4) world.fx.emit('soul', this.bx + rand(-90, 90), Math.min(this.A.floor - 10, this.wy + rand(20, 160)), { color: '#bff4ff', size: rand(2, 4), speed: 40, angle: -PI / 2, spread: 0.4 });
      else if (!this.dash) world.fx.emit('water', this.bx + rand(-100, 100), this.wy - 2, { speed: 90, angle: -PI / 2, spread: 0.8, size: rand(1.5, 3) });
    }
  }
  splash(k = 1) {
    const w = this.world;
    if (!w?.fx) return;
    w.fx.burst('water', this.bx, this.wy - 4, Math.round(18 * k), { speed: 340, angle: -PI / 2, spread: 1.1 });
    w.fx.ring?.(this.bx, this.wy, { color: '#bff4ff', r0: 20, r1: 150 * k, life: 0.5, width: 3 });
  }
  /** 벡터 그림이 화면 가장자리에서 잘리지 않도록 그림 전체를 덮는 대리 개체 */
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) {
    if (this.rot > 0.3) { r.x = this.ox - 470; r.y = this.oy - 70 - 240; r.w = 940; r.h = 480; }
    else { r.x = this.ox - 330; r.y = this.oy - 470; r.w = 660; r.h = 620; }
    return r;
  }
  draw(ctx, world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world && !this._artDrawing) return;   // 대리 개체(ArtCull)가 그린다
    super.draw(ctx, world);
  }

  // ─── 떠다니는 미끼 (lure) ───
  spawnLures() {
    const P = this._pt, h = this.toWorld(this.K.hx, this.K.hy - 20, { x: 0, y: 0 });
    for (const b of this.bulbs) {
      this.toWorld(b.lx, b.ly, P);
      const dx = P.x - h.x, dy = P.y - h.y, d = Math.hypot(dx, dy) || 1;
      const l = { x: P.x, y: P.y, vx: (dx / d) * 260, vy: (dy / d) * 200 - 60, t: 0, life: 5, seed: rand(0, 10) };
      l.part = { x: l.x - 15, y: l.y - 15, w: 30, h: 30, defMul: 1.0, lure: l, onHit: () => this.popLure(l) };
      this.lures.push(l);
      if (b.alive) b.grow = 0;
      this.world.fx.burst('soul', P.x, P.y, 6, { color: BIO, speed: 120 });
    }
  }
  tickLures(dt, world) {
    const p = world.player, A = this.A;
    for (let i = this.lures.length - 1; i >= 0; i--) {
      const l = this.lures[i];
      l.t += dt;
      if (l.t < 0.45) { const k = Math.pow(0.08, dt); l.vx *= k; l.vy *= k; }
      else if (p && !p.dead) {
        const want = Math.atan2(p.cy - l.y, p.cx - l.x);
        let cur = Math.atan2(l.vy, l.vx);
        if (Math.hypot(l.vx, l.vy) < 30) cur = want;
        const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        cur += clamp(d, -1.2 * dt, 1.2 * dt);
        const sp = approach(Math.hypot(l.vx, l.vy), 120, 420 * dt);
        l.vx = Math.cos(cur) * sp; l.vy = Math.sin(cur) * sp;
      }
      l.x = clamp(l.x + l.vx * dt, A.x0 + 10, A.x1 - 10);
      l.y = Math.min(A.floor - 14, l.y + l.vy * dt + Math.sin(l.t * 3 + l.seed) * 12 * dt);
      l.part.x = l.x - 15; l.part.y = l.y - 15;
      if (p && !p.dead && l.t > 0.3) {
        const hb = p.hurtbox?.() ?? p;
        const nx = clamp(l.x, hb.x, hb.x + hb.w), ny = clamp(l.y, hb.y, hb.y + hb.h);
        if ((nx - l.x) ** 2 + (ny - l.y) ** 2 < 18 * 18) { this.explodeLure(i, true); continue; }
      }
      if (l.t >= l.life) this.explodeLure(i, false);
    }
  }
  explodeLure(i, contact) {
    const l = this.lures[i];
    if (!l) return;
    this.lures.splice(i, 1);
    strikeCircle(this, l.x, l.y, 70, { warn: contact ? 0 : 0.3, life: 0.25, mv: 1.2, color: BIO, burstFx: 'water', sfx: 'explode', vol: 0.55 });
  }
  popLure(l) {
    const i = this.lures.indexOf(l);
    if (i < 0) return;
    this.lures.splice(i, 1);
    const w = this.world;
    w.fx.burst('soul', l.x, l.y, 10, { color: BIO, speed: 180 });
    w.fx.ring(l.x, l.y, { color: BIO, r0: 6, r1: 50, life: 0.3, width: 3 });
    audio.sfx('hit', { pitch: 1.6, vol: 0.5 });
  }
  /** 플레이어가 물속인가 (진짜 deep: 기믹이 매 프레임 계산 / 대역: 수면 비교 / 없으면 타일) */
  inWater(p = this.P) {
    if (!p) return false;
    const g = this.gim('deep', { create: false });
    if (g?.standIn) return g.inWater(p);
    if (g && typeof g.inWater === 'boolean') return g.inWater;
    return this.world.map?.typeAtPx?.(p.cx, p.cy) === T.LIQUID;
  }
  flood() {
    setWater(this, 9, 21, 55, 3);
    this.floodT = 3 + (this.inferno ? 14 : 10);
    this.forceNext('charge');
  }
  recede() { setWater(this, 12, 21, 55, 3); }
  /** 홍수 동안은 돌진만 (world2 §6.4: flood 는 charge 로 10초 버틴다) */
  weights(phase = this.phase) {
    const w = super.weights(phase);
    if (this.floodT > 0 && typeof this.s_charge === 'function') return [['charge', 1]];
    return w;
  }

  // ═════════════════════════════ 상태 ═════════════════════════════
  s_intro(dt, world, t) {
    if (this.at(0.001)) { this.setPose({ mouth: 1, arms: 1, crook: 0.6, lean: -0.4, pipes: 0.8 }); audio.sfx('boss_roar', { pitch: 0.55 }); impact(world, { shake: 8, time: 0.5 }); this.splash(1.4); }
    if (this.at(0.9)) this.relax();
    if (t >= 1.2) this.done(0.8);
  }
  idleMove(dt, world, t) {
    this.faceP();
    const p = this.P;
    if (Math.abs(this.tbx - this.bx) > 6) { if (this.moveSp > 300) this.tsink = Math.max(this.tsink, 0.8); return; }   // 헤엄쳐 이동 중
    this.tsink = 0; this.moveSp = 80;
    if (!p) return;
    const d = Math.abs(p.cx - this.bx), off = this.offscreen();
    if (d < 230 || d > 760 || off) {
      this.tbx = this.pickSpot();
      // 멀면(화면 밖 포함) 잠수해서 빠르게 헤엄쳐 간다 (좁은 폰 화면에서도 패턴을 화면 안에서 시작하게)
      if (Math.abs(this.tbx - this.bx) > 240 || off) { this.moveSp = 650; this.tsink = 0.8; this.sinkRate = 2.6; }
      else this.moveSp = 70;
    }
  }

  // ── organ: 들숨(아가미 = 약점) → 틈이 있는 고리 2개 (인페르노 3) ──
  s_organ(dt, world, t) {
    if (this.at(0.001)) this.begin();
    const u0 = this.u0, n = this.inferno ? 3 : 2;
    if (this.u(0.01)) {
      telegraph(this, 1.2, { sfx: 'warning', vol: 0.35, pitch: 0.7 });
      this.setPose({ inhale: 1, gill: 1, pipes: 0.6, mouth: 0.15 });
      audio.sfx('mist', { pitch: 0.4, vol: 0.6 });
    }
    if (t > u0 && t < u0 + 1.2) this.inhaleFx(dt, world);
    if (this.u(1.2)) this.organRings(n);
    if (this.u(1.2 + 0.45 * n + 0.3)) this.relax();
    if (t >= u0 + 1.2 + 0.45 * n + 0.7) this.done();
  }
  inhaleFx(dt, world) {
    if (Math.random() > 0.5 * (world.fx.quality ?? 1)) return;
    const m = this.toWorld(this.K.mx, this.K.my), a = rand(0, TAU), r = rand(120, 220);
    world.fx.emit('soul', m.x + Math.cos(a) * r, m.y + Math.sin(a) * r, { color: '#bff4ff', size: rand(2, 3.5), speed: 0, vx: -Math.cos(a) * r * 1.6, vy: -Math.sin(a) * r * 1.6, life: 0.5, grav: 0 });
  }
  organRings(n, gap = 0.45) {
    this.setPose({ inhale: 0, mouth: 1, gill: 0.3, pipes: 1, lean: -0.45 });
    const a0 = rand(0, TAU);
    for (let i = 0; i < n; i++) this.later(i * gap, () => this.ring(a0 + i * (PI / 3)));
  }
  ring(a) {
    const w = this.world, m = this.toWorld(this.K.mx, this.K.my, { x: 0, y: 0 });
    ringWave(this, m.x, m.y, { r0: 20, r1: 700, speed: 380, th: 18, mv: 1.2, gaps: [a, a + TAU / 3, a + (2 * TAU) / 3], gapW: 55 * DEG, color: WATER, warn: 0, sfx: null });
    audio.sfx('bell', { pitch: 0.32, vol: 0.7 }); audio.sfx('boss_roar', { pitch: 0.42, vol: 0.4 });
    w.camera?.shake?.(5, 0.3);
    const P = this._pt;
    for (const pp of PIPES) { this.toWorld(pp.x, -150 - pp.h * 0.8, P); w.fx.emit('soul', P.x, P.y, { color: '#bff4ff', speed: 140, angle: -PI / 2, spread: 0.5, size: 3 }); }
  }

  // ── lure: 미끼 셋이 떨어져 나와 느리게 쫓는다 + 어둠 ──
  s_lure(dt, world, t) {
    if (this.at(0.001)) this.begin();
    const u0 = this.u0;
    if (this.u(0.01)) { telegraph(this, 0.7, { sfx: null }); audio.sfx('ghost', { pitch: 0.55, vol: 0.6 }); this.setPose({ crown: 1, lean: 0.4, mouth: 0.35 }); }
    if (this.u(0.7)) { this.spawnLures(); darken(this, 0.25, 5); this.setPose({ crown: -0.4 }); audio.sfx('magic', { pitch: 0.45 }); }
    if (this.u(1.1)) this.relax();
    if (t >= u0 + 1.6) this.done();
  }

  // ── tentacle: 수면 띠(수면-40 … 수면+30)를 촉수 넷이 휩쓴다. 발판 위나 수면 80px 아래가 안전 ──
  s_tentacle(dt, world, t) {
    if (this.at(0.001)) this.begin();
    const u0 = this.u0;
    if (this.u(0.01)) {
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.4, pitch: 0.8 });
      this.setPose({ arms: 1, mouth: 0.5, lean: 0.2 });
      this.bandWarn(0.8);
      audio.sfx('splash', { pitch: 0.5 });
    }
    if (this.u(0.8)) {
      for (const [dir, d, k] of [[-1, 0, 0], [1, 0, 1], [-1, 0.2, 2], [1, 0.2, 3]]) this.later(d, () => this.lash(dir, k));
      audio.sfx('whip', { pitch: 0.45, vol: 0.9 });
    }
    if (this.u(2.3)) this.relax();
    if (t >= u0 + 2.6) this.done();
  }
  bandWarn(sec) {
    const A = this.A;
    this.zone({
      x: A.x0, y: this.wy - 40, w: A.w, h: 70, warn: 0, life: sec, harmless: true, z: 5,
      tick: (z) => { z.y = this.wy - 40; },
      paint: (ctx, z, w) => {
        const k = clamp(z.t / sec, 0, 1);
        warnRect(ctx, z.x, z.y, z.w, z.h, k, BIO, w.time);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba('#dff4ff', 0.25 + 0.35 * k); ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 18; i++) {
          const x = z.x + hash(i * 3.7) * z.w, ph = (w.time * 1.4 + hash(i * 1.9)) % 1;
          ctx.moveTo(x + 10 + ph * 50, this.wy); ctx.ellipse(x, this.wy, 10 + ph * 50, 3 + ph * 6, 0, 0, TAU);
        }
        ctx.stroke();
      },
    });
  }
  lash(dir, k) {
    const A = this.A, x0 = this.bx + dir * 60, x1 = dir < 0 ? A.x0 : A.x1, dur = 1.2, hold = 0.18;
    const seed = k * 1.7 + rand(0, 3);
    let acc = 0;
    this.zone({
      x: x0, y: this.wy - 40, w: 10, h: 70, warn: 0, life: dur + hold, mv: 1.4, z: 7, kb: [360, -300],
      tick: (z, w, dt) => {
        const e = 1 - (1 - clamp(z.t / dur, 0, 1)) ** 2;
        z.tip = x0 + (x1 - x0) * e;
        z.x = Math.min(x0, z.tip); z.w = Math.max(10, Math.abs(z.tip - x0)); z.y = this.wy - 40; z.h = 70;
        acc += dt * 26 * (w.fx.quality ?? 1);
        while (acc >= 1 && z.t < dur) { acc -= 1; w.fx.emit('water', z.tip, this.wy - 4, { speed: 240, angle: -PI / 2 - dir * 0.5, spread: 0.6 }); }
      },
      onStart: () => audio.sfx('splash', { pitch: 0.7, vol: 0.5 }),
      paint: (ctx, z) => this.paintLash(ctx, x0, z.tip ?? x0, dir, z.t, dur, hold, seed),
    });
  }

  // ── whirl: 잠수 → 플레이어 x 에 소용돌이(물속이면 끌어당김) + 물창 넷 ──
  s_whirl(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) { this.wUp = null; this.wRel = false; this.submerge(2.4); this.setPose({ mouth: 0.6, arms: 0.6 }); audio.sfx('splash', { pitch: 0.6 }); telegraph(this, 0.6, { sfx: null }); }
    if (this.at(0.5)) {
      const p = this.P;
      const cx = clamp(p ? p.cx : A.cx, A.x0 + 120, A.x1 - 120);
      this.wc = cx; this.tbx = cx; this.moveSp = 500;
      const depth = Math.max(60, A.floor - this.wy), cy = this.wy + depth * 0.55;
      pullField(this, cx, cy, { r: 200, force: 420, maxV: 300, vertical: true, dur: 3, when: (w, pl) => this.inWater(pl), paint: (ctx, z) => this.paintWhirl(ctx, z, cx) });
      audio.sfx('mist', { pitch: 0.35, vol: 0.8 });
      this.spear(cx - 170, 0.7); this.spear(cx + 170, 0.7);
    }
    if (this.at(1.5)) {
      const p = this.P;
      let x2 = p ? p.cx : this.wc + 120;
      if (Math.abs(x2 - this.wc) < 70) x2 = this.wc + (x2 >= this.wc ? 1 : -1) * 110;
      this.spear(this.wc, 0.7); this.spear(x2, 0.7);
    }
    if (this.at(3.4)) { this.tbx = this.pickSpot(); this.moveSp = 700; }
    // 새 자리에 닿은 뒤에 떠오른다 (멀면 조금 늦게 — 떠오른 채 미끄러지지 않게)
    if (this.wUp == null && (t >= 3.9 && this.arrived() || t >= 6.5)) {
      this.wUp = t; this.bx = this.tbx; this.moveSp = 80; this.faceP();
      this.emerge(1.6); this.setPose({ mouth: 0.8, arms: 1 }); audio.sfx('splash', { pitch: 0.7 });
    }
    if (this.wUp != null && !this.wRel && t >= this.wUp + 0.6) { this.wRel = true; this.relax(); }
    if (this.wUp != null && t >= this.wUp + 0.8) this.done();
  }
  /** 물창: 바닥(물 밑)에서 수면 위 200px 까지 치솟는 물기둥 (폭 40) */
  spear(x, warn) {
    const A = this.A;
    x = clamp(x, A.x0 + 24, A.x1 - 24);
    const top = this.wy - 200, bot = A.floor;
    strikeRect(this, { x: x - 20, y: top, w: 40, h: bot - top }, {
      warn, life: 0.35, mv: 1.2, color: WATER, sfx: 'splash', kb: [0, -620],
      onStart: (z, w) => w.fx.burst('water', x, this.wy, 16, { angle: -PI / 2, spread: 0.45, speed: 560 }),
      paint: (ctx, z, w) => this.paintSpear(ctx, z, x, top, bot, w),
    });
  }

  // ── charge: 잠수 → 플레이어 깊이에 거품 줄 예고 0.8초 → 수평 돌진 950px/s ──
  s_charge(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) { this.cEnd = null; this.cMoved = false; this.cUp = false; this.submerge(3); this.setPose({ mouth: 0.4, arms: 0.3 }); audio.sfx('splash', { pitch: 0.8 }); }
    if (this.at(0.4)) {
      const p = this.P, px = p ? p.cx : A.cx;
      const dir = px < A.cx ? -1 : 1;
      const x0 = dir < 0 ? A.x1 - 110 : A.x0 + 110;
      const y = clamp(p ? p.cy : this.wy + 60, this.wy - 90, A.floor - 80);
      this.cd = { dir, x0, y };
      this.bx = this.tbx = x0; this.facing = dir;
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.4 });
      this.trailWarn(y, dir, 0.8);
    }
    if (this.at(1.2) && this.cd) {
      const d = this.cd;
      this.dash = { dir: d.dir, y: d.y, zone: null };
      this.sink = 0; this.tsink = 0; this.facing = d.dir;
      this.setPose({ mouth: 1, arms: 0, lean: 0.6 });
      this.dash.zone = this.zone({
        x: this.bx - 130, y: d.y - 70, w: 260, h: 140, warn: 0, life: 6, mv: 1.7, z: 3, kb: [520, -360],
        tick: (z) => { const ds = this.dash; if (!ds || ds.zone !== z) { z.x = -99999; z.dead = true; return; } z.x = this.bx - 130; z.y = ds.y - 70; },
      });
      audio.sfx('boss_roar', { pitch: 0.75, vol: 0.6 }); audio.sfx('dash', { pitch: 0.6 });
      impact(world, { shake: 7, time: 0.3 });
      world.fx.burst('water', this.bx, d.y, 24, { speed: 380 });
    }
    if (this.dash) {
      const ds = this.dash;
      this.bx += ds.dir * 950 * dt;
      if (Math.random() < 0.7 * (world.fx.quality ?? 1)) world.fx.emit('soul', this.bx - ds.dir * 120, ds.y + rand(-40, 40), { color: '#bff4ff', size: rand(2, 4), speed: 60 });
      const end = ds.dir > 0 ? A.x1 - 110 : A.x0 + 110;
      if ((ds.dir > 0 && this.bx >= end) || (ds.dir < 0 && this.bx <= end)) {
        this.bx = this.tbx = end;
        this.endDash(); this.submerge(1.6); this.cEnd = t; this.relax();
        world.camera?.shake?.(5, 0.3);
      }
    }
    if (this.cEnd != null && t >= this.cEnd + 0.5 && !this.cMoved) { this.cMoved = true; this.tbx = this.pickSpot(); this.moveSp = 800; }
    // 새 자리에 닿은 뒤 떠오른다 (떠오른 채 미끄러지지 않게)
    if (this.cEnd != null && t >= this.cEnd + 1.0 && !this.cUp && (this.arrived() || t >= this.cEnd + 3.0)) { this.cUp = t; this.bx = this.tbx; this.moveSp = 80; this.faceP(); this.emerge(2); }
    if (this.cUp && t >= this.cUp + 0.6) this.done(0.8);
    if (t > 9) { this.endDash(); this.emerge(); this.done(); }   // 안전장치
  }
  endDash() {
    const d = this.dash;
    if (!d) return;
    this.dash = null;
    this.sink = clamp((d.y + 70 - this.wy) / SINK, 0, 1);   // 돌진 높이에서 이어서 가라앉게
    this.tsink = this.sink;
    if (d.zone) { d.zone.x = -99999; d.zone.dead = true; }
  }
  trailWarn(y, dir, sec) {
    const A = this.A;
    this.zone({
      x: A.x0, y: y - 70, w: A.w, h: 140, warn: 0, life: sec, harmless: true, z: 5,
      paint: (ctx, z, w) => {
        const k = clamp(z.t / sec, 0, 1);
        warnRect(ctx, z.x, z.y, z.w, z.h, k * 0.8, BIO, w.time);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba('#dff4ff', 0.35 + 0.4 * k);
        for (let i = 0; i < 40; i++) {
          const ph = (w.time * (0.7 + hash(i) * 0.6) + hash(i * 2.3)) % 1;
          const x = dir > 0 ? z.x + ((hash(i * 5.1) + w.time * 0.5) % 1) * z.w : z.x + z.w - ((hash(i * 5.1) + w.time * 0.5) % 1) * z.w;
          ctx.beginPath(); ctx.arc(x, y + 50 - ph * 100, 2 + hash(i * 7.7) * 4, 0, TAU); ctx.fill();
        }
      },
    });
  }

  // ── flood (P2+): 물을 9행까지 → 10초(인페르노 14) 돌진만 → 12행으로 ──
  s_flood(dt, world, t) {
    if (this.at(0.001)) this.begin();
    const u0 = this.u0;
    if (this.u(0.01)) {
      telegraph(this, 1.0, { sfx: null });
      this.setPose({ crook: 1, mouth: 0.6, arms: 0.5 });
      warnText(this, '물이 차오른다!', '#6fe8ff');
      audio.sfx('bell', { pitch: 0.3, vol: 0.8 });
    }
    if (t > u0 && t < u0 + 1.0 && Math.random() < 0.6 * (world.fx.quality ?? 1)) {
      const c = this.toWorld(this.K.crookX, this.K.crookY, this._pt);
      world.fx.emit('soul', c.x + rand(-30, 30), c.y + rand(-30, 30), { color: CORAL_L, speed: 60, size: 3 });
    }
    if (this.u(1.0)) { this.flood(); impact(world, { shake: 8, time: 0.6 }); audio.sfx('splash', { pitch: 0.4, vol: 1 }); this.splash(1.6); }
    if (this.u(1.8)) this.relax();
    if (t >= u0 + 2.1) this.done(0.6);
  }

  // ── choir (P3): 익사체 최대 3 + 고리 셋 오르간 ──
  s_choir(dt, world, t) {
    if (this.at(0.001)) this.begin();
    const u0 = this.u0;
    if (this.u(0.01)) { telegraph(this, 0.9, { sfx: null }); this.setPose({ arms: 1, wail: 1, pipes: 0.7, mouth: 0.5, crook: 0.5 }); audio.sfx('ghost', { pitch: 0.4, vol: 0.8 }); }
    if (this.u(0.6)) this.summon();
    if (this.u(1.3)) { telegraph(this, 0.8, { sfx: null }); this.setPose({ inhale: 1, gill: 1, mouth: 0.1 }); }
    if (t > u0 + 1.3 && t < u0 + 2.1) this.inhaleFx(dt, world);
    if (this.u(2.1)) this.organRings(3);
    if (this.u(3.6)) this.relax();
    if (t >= u0 + 4.0) this.done();
  }
  summon() {
    const A = this.A, p = this.P, px = p ? p.cx : A.cx, m = this.world.map;
    for (const x0 of [px - 280, px + 280, this.bx + this.facing * 220]) {
      let x = clamp(x0, A.x0 + 60, A.x1 - 60);
      for (let k = 0; k < 4 && m?.isSolidPx?.(x, A.floor - 30); k++) x = clamp(x + (x < A.cx ? 96 : -96), A.x0 + 60, A.x1 - 60);
      const e = spawnMinion(this, ['drowned'], x, A.floor, { max: 3 });
      if (e) { this.world.fx.burst('soul', x, A.floor - 30, 10, { color: '#bff4ff', speed: 120 }); this.world.fx.burst('dark', x, A.floor - 20, 6, { speed: 80 }); }
    }
  }

  // ── stagger (보조): 미끼가 부서지면 1초 ──
  s_stagger(dt, world, t) {
    if (this.at(0.001)) {
      this.setPose({ slump: 1, gill: 1, mouth: 0.8, crown: 0, arms: 0.2 });
      if (this.tsink > 0.2) { this.tsink = 0.15; this.sinkRate = 2; }
      this.twitch = 0.6;
      audio.sfx('boss_roar', { pitch: 1.25, vol: 0.5 });
    }
    if (t >= 1.0) { this.relax(); this.done(0.5); }
  }

  // ── 전환: 기본 transitionTick + 포효 ──
  s_phase1(dt, world, t) { this.transFx(world); this.transitionTick(dt, world, t); }
  s_phase2(dt, world, t) { this.transFx(world); this.transitionTick(dt, world, t); }
  transFx(world) {
    if (this.at(0.001)) {
      if (this.dash) this.endDash();
      this.tsink = 0; this.sinkRate = 2;
      this.setPose({ mouth: 1, arms: 1, lean: -0.5, pipes: 1, gill: 1 });
      audio.sfx('boss_roar', { pitch: 0.5 }); impact(world, { shake: 10, time: 0.7 }); this.splash(1.6);
    }
    if (this.at(0.6)) { const P = this._pt; for (const pp of PIPES) { this.toWorld(pp.x, -150 - pp.h, P); world.fx.burst('water', P.x, P.y, 5, { speed: 260, angle: -PI / 2, spread: 0.6 }); } }
    if (this.at(1.1)) this.relax();
  }
  applyPhase(k) {
    this.dmg = Math.max(this.dmg, k);
    if (k >= 2) for (const b of this.bulbs) { if (!b.alive) b.grow = 0; b.alive = true; b.hp = b.max; }   // P3: 미끼가 다시 자란다
  }
  onCancel() {
    if (this.dash) this.endDash();
    this.relax(); this.twitch = 0;
    if (this.tsink > 0.5) { this.tsink = 0; this.sinkRate = 1.9; }
    this.moveSp = 80; this.tbx = this.bx;   // 헤엄치던 중이면 그 자리에서 멈춘다 (떠오른 채 미끄러지지 않게)
  }
  onReset() {
    this.dmg = 0; this.floodT = 0; this.lures.length = 0; this.dash = null; this.rot = 0; this.twitch = 0;
    for (const b of this.bulbs) { b.alive = true; b.hp = b.max; b.grow = 1; b.hitT = 0; b.out = false; }
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    this.tsink = 0; this.sinkRate = 1.8; this.moveSp = 80; this.tbx = this.bx;
  }
  onDeath(world) {
    this.dying = 3.4; this.dieT = 0;
    if (this.dash) this.endDash();
    for (const l of this.lures) world.fx.burst('soul', l.x, l.y, 6, { color: BIO, speed: 90 });
    this.lures.length = 0;
    this.floodT = 0; this.recede();
    // 잠긴 채(휘몰이·돌진 뒤) 쓰러져도 사망 연출이 보이게: 먼저 떠올랐다가 (dyingTick 0.7초 뒤) 천천히 가라앉는다
    this.moveSp = 80; this.tbx = this.bx;
    this.tsink = 0; this.sinkRate = 2.2;
    this.setPose({ slump: 1, mouth: 1, arms: 0.4, gill: 1, crown: 0.5, wail: 1, crook: 0 });
    audio.sfx('boss_roar', { pitch: 0.4 });
    world.fx.ring(this.bx, this.wy - 120, { color: BIO, r0: 20, r1: 320, life: 0.9, width: 10 });
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    if (this.dieT > 0.7 && this.tsink < 1) { this.tsink = 1; this.sinkRate = 0.26; }
    this.motion(dt, world);
    if (Math.random() < 0.6 * (world.fx.quality ?? 1)) world.fx.emit('soul', this.bx + rand(-110, 110), this.wy + rand(-10, 60), { color: '#bff4ff', speed: 70, angle: -PI / 2, spread: 0.5, size: rand(2, 5) });
    for (const b of this.bulbs) if (!b.out && this.dieT > 0.5 + b.i * 0.55) { b.out = true; world.fx.burst('soul', b.x, b.y, 8, { color: BIO, speed: 90 }); audio.sfx('candle', { pitch: 0.6, vol: 0.4 }); }
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    const dk = this.dying > 0 ? clamp(1 - this.dieT / 2.6, 0, 1) : 1;
    for (const b of this.bulbs) if (b.alive && !b.out && b.grow > 0.3) L.add(b.x, b.y, 130, BIO, 0.75 * b.grow * (b.y < this.A.floor ? 1 : 0.3));
    for (const l of this.lures) L.add(l.x, l.y, 150, BIO, 0.85);
    if (this.sink < 0.8) L.add(this.ox, this.oy - 130, 260, '#3ad0c8', 0.4 * dk * (1 - this.sink));
    const c = this.toWorld(this.K.crookX, this.K.crookY, { x: 0, y: 0 });
    if (this.sink < 0.7) L.add(c.x, c.y, 90 + 70 * this.ps.crook, CORAL_L, (0.4 + 0.4 * this.ps.crook) * dk);
    if (this.ps.pipes > 0.15) { const m = this.toWorld(this.K.mx, this.K.my, { x: 0, y: 0 }); L.add(m.x, m.y, 170, WATER, 0.6 * this.ps.pipes); }
    if (this.dying > 0) L.add(this.bx, this.wy - 80 - this.dieT * 70, 160, '#4aa8ff', clamp(this.dieT - 0.8, 0, 1));
  }

  // ═════════════════════════════ 그리기 ═════════════════════════════
  paintBack(ctx) {
    // 몸 둘레 수면 파문 (떠 있을 때)
    if (this.sink > 0.85 || this.dash || R.fl) return;
    const t = this.t, y = this.wy;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.45 + i / 3) % 1;
      ctx.strokeStyle = rgba('#bff4ff', (1 - k) * 0.45 * (1 - this.sink));
      ctx.beginPath(); ctx.ellipse(this.bx, y, 120 + k * 200, 6 + k * 14, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  paintBody(ctx, world, flash) {
    const A = this.A, fl = R.fl;
    this.rig();
    ctx.save();
    if (flash) ctx.globalAlpha *= 0.7;   // 피격 섬광을 조금 약하게 (몸이 화면 절반을 덮는다)
    ctx.beginPath(); ctx.rect(A.x0 - 1200, -4000, A.w + 2400, A.floor + 4002); ctx.clip();   // 바닥 아래(심연)는 보이지 않는다
    let tx = 0;
    if (this.twitch > 0) tx = Math.sin(this.t * 60) * 5 * this.twitch;
    ctx.translate(this.ox + tx, this.oy - 70);
    ctx.scale(this.facing, 1);
    if (this.rot) ctx.rotate(this.rot * PI / 2);
    ctx.translate(0, 70);
    this.drawFigure(ctx, fl);
    ctx.restore();
  }
  paintFront(ctx) {
    if (R.fl) return;
    const t = this.t;
    // 떠다니는 미끼
    const PA = this.lures.length ? pArt(this.world) : null;
    for (const l of this.lures) {
      const pulse = 0.75 + 0.25 * Math.sin(l.t * 9 + l.seed), warnK = clamp((l.t - (l.life - 1.2)) / 1.2, 0, 1);
      glow(ctx, l.x, l.y, 46 + 16 * pulse, BIO, 0.7);
      if (warnK > 0) glow(ctx, l.x, l.y, 70, '#ffffff', warnK * (0.5 + 0.5 * Math.sin(l.t * 30)));
      ctx.strokeStyle = 'rgba(20,40,40,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(l.x, l.y - 10); ctx.quadraticCurveTo(l.x - l.vx * 0.12, l.y - 26, l.x - l.vx * 0.2 + Math.sin(l.t * 4) * 6, l.y - 40); ctx.stroke();
      if (PA?.bulb(ctx, l.x, l.y, 11 * (0.95 + 0.08 * pulse), Math.sin(l.t * 3 + l.seed) * 0.2)) glow(ctx, l.x, l.y, 16, BIO, 0.7 * pulse, true);   // 채색 전구
      else bulbShape(ctx, l.x, l.y, 11, pulse, false);
    }
    // 사망: 파란 심장이 떠오른다
    if (this.dying > 0 && this.dieT > 0.8) {
      const k = clamp(this.dieT - 0.8, 0, 1), y = this.wy - 60 - (this.dieT - 0.8) * 70, x = this.bx;
      glow(ctx, x, y, 90, '#4aa8ff', 0.7 * k);
      ctx.save(); ctx.translate(x, y); ctx.scale(1 + Math.sin(t * 8) * 0.06, 1 + Math.sin(t * 8) * 0.06);
      ctx.globalAlpha *= k;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath(); ctx.moveTo(0, 14); ctx.bezierCurveTo(-26, -4, -14, -24, 0, -10); ctx.bezierCurveTo(14, -24, 26, -4, 0, 14); ctx.fill();
      glow(ctx, 0, -2, 30, '#ffffff', 0.6 * k, true);
      ctx.restore();
    }
  }

  /** 몸 전체 (지역 좌표: 원점 = 상체 밑 수면선, +x = 앞) */
  drawFigure(ctx, fl) {
    const s = this.ps;
    // 1) 뒤 촉수
    for (let i = 0; i < TENT_BACK.length; i++) this.drawTentacle(ctx, TENT_BACK[i], 26, i, false, fl);
    // 2) 등의 파이프 오르간
    this.drawPipes(ctx, fl);
    // 3) 뒤팔
    this.drawBackArm(ctx, fl);
    // 4) 망토 뒷자락
    this.drawRobeBack(ctx, fl);
    // 5) 몸통
    this.drawTorso(ctx, fl);
    // 6) 등살에 박힌 순례자들
    this.drawPilgrim(ctx, -94, -118 + s.slump * 12, -0.5, 1.0, 0, fl);
    this.drawPilgrim(ctx, -102, -46 + s.slump * 8, -0.25, 0.9, 1, fl);
    this.drawPilgrim(ctx, -62, -168 + s.slump * 14, -0.9, 0.78, 2, fl);
    // 7) 영대(목도리)
    this.drawStole(ctx, fl);
    // 8) 머리 · 왕관 · 미끼
    this.drawHead(ctx, fl);
    // 9) 앞팔 + 산호 목장
    this.drawFrontArm(ctx, fl);
    // 10) 앞 촉수
    for (let i = 0; i < TENT_FRONT.length; i++) this.drawTentacle(ctx, TENT_FRONT[i], 30, i + 3, true, fl);
  }

  drawTentacle(ctx, bx, r0, i, front, fl) {
    const t = this.t, s = this.ps, P = this._tp ?? (this._tp = new Float32Array(22));
    const n = 11, len = front ? 200 : 170;
    const lift = s.arms * (front ? 1 : 0.6);
    let a = PI / 2 + (front ? -0.55 + (i - 3) * 0.28 : 0.35 + i * 0.3) - lift * (front ? 0.9 : 0.5);
    let x = bx, y = 24;
    for (let k = 0; k < n; k++) {
      P[k * 2] = x; P[k * 2 + 1] = y;
      const w = Math.sin(t * (1.6 + i * 0.13) - k * 0.55 + i * 1.7) * (0.22 + k * 0.03) * (1 + lift);
      a += w * 0.35 + (front ? -0.04 : 0.03) * (1 + lift);
      x += Math.cos(a) * (len / n); y += Math.sin(a) * (len / n);
    }
    const col = front ? EEL : mixD(EEL);
    taper(ctx, P, n, r0 * (front ? 1 : 0.85), 4);
    ink(ctx, fl ? '#fff' : col, 3);
    if (fl) return;
    // 등 쪽 광택 + 빨판
    ctx.strokeStyle = rgba(front ? EEL_L : '#3e4a54', 0.6); ctx.lineWidth = 2.5;
    ctx.beginPath(); for (let k = 0; k < n; k++) { const px = P[k * 2] - 5 * (1 - k / n), py = P[k * 2 + 1] - 4; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke();
    if (front) {
      ctx.fillStyle = '#c9b7b0';
      for (let k = 2; k < n - 1; k++) { const rr = (r0 * (1 - k / n) + 4) * 0.28; ctx.beginPath(); ctx.arc(P[k * 2] + rr * 1.6, P[k * 2 + 1] + rr, rr, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(40,10,20,0.7)';
      for (let k = 2; k < n - 1; k++) { const rr = (r0 * (1 - k / n) + 4) * 0.12; ctx.beginPath(); ctx.arc(P[k * 2] + rr * 3.6, P[k * 2 + 1] + rr * 2.2, rr, 0, TAU); ctx.fill(); }
    }
  }

  drawPipes(ctx, fl) {
    const s = this.ps, t = this.t, dmg = this.dmg;
    for (let i = 0; i < PIPES.length; i++) {
      const pp = PIPES[i];
      const broken = dmg >= 1 && pp.broken;
      const h = pp.h * (broken ? 0.7 : 1), w = pp.w;
      ctx.save();
      ctx.translate(pp.x, -146 + s.slump * 14 - s.inhale * 4);
      ctx.rotate(pp.a + s.lean * 0.06 + Math.sin(t * 0.8 + i) * 0.01);
      ctx.beginPath();
      if (broken) { ctx.moveTo(-w / 2, 30); ctx.lineTo(-w / 2, -h); ctx.lineTo(-w * 0.2, -h - 10); ctx.lineTo(0, -h + 4); ctx.lineTo(w * 0.25, -h - 14); ctx.lineTo(w / 2, -h - 2); ctx.lineTo(w / 2, 30); ctx.closePath(); }
      else ctx.rect(-w / 2, -h, w, h + 30);
      ink(ctx, fl ? '#fff' : LG(ctx, 'dg_pipe' + w, -w / 2, 0, w / 2, 0, [0, PIPE_D, 0.22, PIPE, 0.5, PIPE_L, 0.72, PIPE, 1, PIPE_D]), 2.2);
      if (!broken) { ctx.beginPath(); ctx.ellipse(0, -h, w * 0.62, w * 0.24, 0, 0, TAU); ink(ctx, C(PIPE_D), 1.8); }
      if (!fl) {
        ctx.fillStyle = BAND;
        ctx.fillRect(-w / 2, -h * 0.66, w, 4); ctx.fillRect(-w / 2, -h * 0.36, w, 3);
        // 녹청 줄눈물
        ctx.strokeStyle = 'rgba(160,230,190,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-w * 0.2, -h * 0.66 + 4); ctx.lineTo(-w * 0.22, -h * 0.4); ctx.moveTo(w * 0.15, -h * 0.36 + 3); ctx.lineTo(w * 0.12, -h * 0.12); ctx.stroke();
        // 입(소리 구멍): 오르간 때 빛난다
        const my = -h * 0.2;
        ctx.fillStyle = '#040806';
        ctx.beginPath(); ctx.moveTo(-w / 2 + 2, my); ctx.quadraticCurveTo(0, my - w * 1.1, w / 2 - 2, my); ctx.quadraticCurveTo(0, my - w * 0.4, -w / 2 + 2, my); ctx.fill();
        if (s.pipes > 0.05) glow(ctx, 0, my - w * 0.4, 20 + 34 * s.pipes, WATER, s.pipes * 0.85);
        if (broken) {
          // 깨진 관에서 검은 물이 흘러내린다
          ctx.strokeStyle = 'rgba(10,30,40,0.8)'; ctx.lineWidth = 3;
          const dy = (t * 60 + i * 30) % 40;
          ctx.beginPath(); ctx.moveTo(-w * 0.1, -h); ctx.lineTo(-w * 0.12, -h + 30 + dy); ctx.stroke();
          ctx.fillStyle = 'rgba(88,255,216,0.25)'; ctx.beginPath(); ctx.arc(-w * 0.12, -h + 34 + dy, 2.5, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  drawBackArm(ctx, fl) {
    const s = this.ps, t = this.t;
    const sx = -66, sy = -150 + s.slump * 14;
    const ex = -118 - s.arms * 40, ey = -86 - s.arms * 70 + Math.sin(t * 1.3) * 4;
    const hx = -110 - s.arms * 70, hy = -10 - s.arms * 170 + Math.sin(t * 1.3 + 0.5) * 6;
    tube(ctx, sx, sy, ex, ey, 20, 15, fl ? '#fff' : mixD(FLESH), 'dg_arm_b', 2.5);
    tube(ctx, ex, ey, hx, hy, 15, 10, fl ? '#fff' : mixD(FLESH), 'dg_arm_b2', 2.5);
    this.drawClaw(ctx, hx, hy, Math.atan2(hy - ey, hx - ex), 0.9, fl, true);
  }
  drawClaw(ctx, x, y, a, sc, fl, back) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(sc, sc);
    // 물갈퀴 손
    ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(30, -18); ctx.lineTo(36, -2); ctx.lineTo(34, 12); ctx.lineTo(-4, 12); ctx.closePath();
    ink(ctx, fl ? '#fff' : rgba(back ? '#3a4e46' : '#5c7466', 0.9), 2);
    ctx.fillStyle = C(back ? '#222c28' : '#2c3833');
    for (let k = 0; k < 4; k++) {
      const yy = -14 + k * 8;
      ctx.beginPath(); ctx.moveTo(10, yy - 3); ctx.quadraticCurveTo(34, yy - 4, 44 + k * 2, yy + 4); ctx.lineTo(12, yy + 3); ctx.closePath(); ctx.fill();
      if (!fl) { ctx.fillStyle = '#d8d2bc'; ctx.beginPath(); ctx.moveTo(42 + k * 2, yy + 1); ctx.lineTo(52 + k * 2, yy + 8); ctx.lineTo(43 + k * 2, yy + 6); ctx.fill(); ctx.fillStyle = C(back ? '#222c28' : '#2c3833'); }
    }
    ctx.restore();
  }

  drawRobeBack(ctx, fl) {
    const t = this.t, s = this.ps;
    ctx.beginPath();
    ctx.moveTo(-60, -160 + s.slump * 12);
    ctx.bezierCurveTo(-120, -120, -150, -40, -140 + Math.sin(t * 1.2) * 8, 40);
    for (let i = 0; i < 5; i++) { const x = -140 + i * 22, y = 40 + ((i * 37) % 3) * 12 + Math.sin(t * 1.5 + i) * 6; ctx.lineTo(x + 6, y + 18); ctx.lineTo(x + 14, y); }
    ctx.lineTo(-40, 30); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dg_robeb', 0, -160, 0, 60, [0, ROBE, 0.6, ROBE_D, 1, '#020608']), 2.5);
  }

  drawTorso(ctx, fl) {
    const s = this.ps, K = this.K, dmg = this.dmg;
    const ex = 1 + K.br * 0.012 + s.inhale * 0.07;
    ctx.save();
    ctx.translate(0, -70); ctx.scale(ex, 1 + s.inhale * 0.02); ctx.translate(0, 70);
    // 실루엣
    ctx.beginPath();
    ctx.moveTo(-74, 44);
    ctx.bezierCurveTo(-104, -40, -108, -130, -64 - s.slump * 4, -178 + s.slump * 14);
    ctx.quadraticCurveTo(-24, -206 + s.slump * 16, 20, -182 + s.slump * 18);
    ctx.bezierCurveTo(66, -170, 90, -122, 86, -68);
    ctx.bezierCurveTo(84, -20, 74, 30, 54, 48);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dg_torso', 0, -200, 0, 50, [0, FLESH_L, 0.25, FLESH, 0.7, '#2c3a34', 1, FLESH_D]), 3.5);
    if (!fl) {
      // 역광 (등)
      ctx.strokeStyle = 'rgba(150,230,220,0.35)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-96, -40); ctx.bezierCurveTo(-102, -110, -86, -160, -60, -176 + s.slump * 14); ctx.stroke();
      // 늘어진 배
      ctx.fillStyle = LG(ctx, 'dg_belly', 0, -120, 0, 40, [0, rgba(BELLY, 0.0), 0.3, rgba(BELLY, 0.55), 1, rgba(BELLY_D, 0.6)]);
      ctx.beginPath(); ctx.ellipse(28, -40, 52, 70, -0.15, 0, TAU); ctx.fill();
      // 얼룩
      ctx.fillStyle = 'rgba(12,24,20,0.35)';
      for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(-60 + hash(i * 4.1) * 120, -160 + hash(i * 2.7) * 170, 5 + hash(i) * 9, 3 + hash(i * 1.3) * 6, hash(i * 9) * 3, 0, TAU); ctx.fill(); }
      // 늑골 윤곽
      ctx.strokeStyle = 'rgba(8,18,14,0.55)'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const y = -140 + i * 22; ctx.moveTo(-6, y); ctx.bezierCurveTo(20, y - 8, 48, y + 4, 66, y + 16); ctx.moveTo(-14, y + 2); ctx.bezierCurveTo(-36, y - 6, -62, y + 6, -78, y + 20); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(190,230,210,0.18)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const y = -143 + i * 22; ctx.moveTo(-4, y); ctx.bezierCurveTo(20, y - 10, 48, y + 2, 64, y + 12); } ctx.stroke();
    }
    // 아가미 (늑골을 가로지름)
    this.drawGill(ctx, K.gl.x, K.gl.y, -1, fl);
    this.drawGill(ctx, K.gr.x, K.gr.y, 1, fl);
    if (!fl) {
      // 따개비
      for (const b of BARNS) barnacle(ctx, b.x, b.y + s.slump * 12, b.r);
      // 상처 (페이즈)
      if (dmg >= 1) {
        wound(ctx, 18, -128, 62, 0.5, this.t);
        wound(ctx, -34, -70, 50, -0.35, this.t + 1);
        wound(ctx, 44, -24, 40, 0.2, this.t + 2);
      }
      if (dmg >= 2) {
        // 찢어진 옆구리 사이로 드러난 뼈
        ctx.fillStyle = '#2a060c';
        ctx.beginPath(); ctx.moveTo(-92, -112); ctx.quadraticCurveTo(-56, -128, -26, -104); ctx.quadraticCurveTo(-30, -46, -76, -30); ctx.quadraticCurveTo(-100, -70, -92, -112); ctx.fill();
        ctx.fillStyle = '#6a1422'; ctx.beginPath(); ctx.ellipse(-58, -72, 22, 30, 0.2, 0, TAU); ctx.fill();   // 드러난 내장
        ctx.strokeStyle = '#e6dcc2'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); for (let i = 0; i < 4; i++) { const y = -106 + i * 19; ctx.moveTo(-90 + i * 3, y); ctx.quadraticCurveTo(-60, y - 10, -32, y + 6); } ctx.stroke();
        ctx.strokeStyle = 'rgba(40,20,16,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
        glowE(ctx, -60, -72, 44, 44, ICHOR, 0.35);
        const dy = (this.t * 45) % 40;
        ctx.fillStyle = rgba(ICHOR, 0.6); ctx.beginPath(); ctx.arc(-70, -36 + dy, 2.5, 0, TAU); ctx.arc(-44, -44 + dy * 0.8, 2, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  drawGill(ctx, x, y, side, fl) {
    const g = this.ps.gill, t = this.t;
    ctx.save(); ctx.translate(x, y); ctx.scale(side, 1);
    for (let i = 0; i < 3; i++) {
      const yy = -20 + i * 18, open = 2 + g * 7 + Math.sin(t * 5 + i) * g * 1.5;
      // 벌어진 틈 (붉은 주름)
      ctx.beginPath(); ctx.moveTo(-14, yy - 4); ctx.quadraticCurveTo(4, yy - open - 2, 18, yy + 2); ctx.quadraticCurveTo(4, yy + open * 0.4, -14, yy - 4); ctx.closePath();
      ctx.fillStyle = C(g > 0.3 ? GILL : GILL_D); ctx.fill();
      if (!fl && g > 0.2) {
        ctx.strokeStyle = rgba('#ff7a8a', 0.6 * g); ctx.lineWidth = 1;
        ctx.beginPath(); for (let k = 0; k < 5; k++) { const xx = -8 + k * 5; ctx.moveTo(xx, yy - 2); ctx.lineTo(xx + 1, yy - open * 0.8); } ctx.stroke();
      }
      // 덮개 (들린다)
      ctx.beginPath(); ctx.moveTo(-16, yy - 5); ctx.quadraticCurveTo(2, yy - 8 - g * 10, 20, yy - 1 - g * 6); ctx.lineTo(18, yy + 2); ctx.quadraticCurveTo(2, yy - 4, -16, yy - 5); ctx.closePath();
      ink(ctx, C('#3e5248'), 1.5);
    }
    if (!fl && g > 0.5) glowE(ctx, 2, 0, 28, 36, '#ff5a6a', (g - 0.5) * 0.5);
    ctx.restore();
  }

  drawPilgrim(ctx, x, y, a, sc, i, fl) {
    const t = this.t, wl = this.ps.wail;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(sc, sc);
    // 진주층 낭종: 들쭉날쭉한 진주 테두리 + 어두운 구멍
    ctx.beginPath();
    for (let k = 0; k < 14; k++) { const an = (k / 14) * TAU, r = (k % 2 ? 26 : 31) + hash(i * 7 + k) * 4; const px = Math.cos(an) * r * 1.15, py = Math.sin(an) * r * 0.9; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath();
    ink(ctx, fl ? '#fff' : RG(ctx, 'dg_nacre', -10, -10, 2, 0, 0, 34, [0, '#ffffff', 0.3, PEARL, 0.7, '#93a9b6', 1, '#34444e']), 2);
    if (!fl) {
      glow(ctx, 0, 0, 44, '#dff4ff', 0.16 + wl * 0.3);
      ctx.fillStyle = '#081014'; ctx.beginPath(); ctx.ellipse(0, 2, 24, 18, 0, 0, TAU); ctx.fill();
    }
    // 반쯤 빠져나온 익사체: 어깨·가슴(갈비), 뒤로 젖힌 머리, 흩날리는 머리카락
    ctx.beginPath(); ctx.moveTo(-16, 16); ctx.quadraticCurveTo(-18, -2, -6, -6); ctx.quadraticCurveTo(10, -8, 18, 4); ctx.quadraticCurveTo(16, 18, 4, 20); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dg_corpse', 0, -8, 0, 20, [0, '#c4d2d4', 1, '#6c8088']), 1.4);
    if (!fl) { ctx.strokeStyle = 'rgba(40,56,62,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(-8, 4 + k * 4); ctx.quadraticCurveTo(0, 2 + k * 4, 10, 6 + k * 4); } ctx.stroke(); }
    const hx = -8 + Math.sin(t * 0.9 + i) * 1.5, hy = -14;
    if (!fl) {
      ctx.strokeStyle = 'rgba(28,38,44,0.85)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); for (let k = 0; k < 6; k++) { ctx.moveTo(hx - 6 + k * 2.4, hy - 8); ctx.bezierCurveTo(hx - 14 + k, hy - 22, hx - 26 + k * 2, hy - 18 + Math.sin(t * 2 + k) * 4, hx - 36 + k * 2, hy - 14 + Math.sin(t * 1.6 + k + i) * 7); } ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(hx, hy, 9, 11, -0.35, 0, TAU); ink(ctx, C('#cdd8d8'), 1.4);
    if (!fl) {
      // 움푹 꺼진 눈, 찢어지게 벌린 입 (P3 울부짖음 때 빛난다)
      ctx.fillStyle = wl > 0.3 ? rgba(BIO, 0.55 + 0.45 * wl) : '#18242a';
      ctx.beginPath(); ctx.ellipse(hx - 4, hy - 3, 2.4, 3.2, -0.3, 0, TAU); ctx.ellipse(hx + 3, hy - 4, 2.4, 3.2, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#10070a';
      ctx.beginPath(); ctx.ellipse(hx, hy + 5, 2.4 + wl * 1.2, 2.2 + wl * 4 + Math.sin(t * 7 + i) * (0.6 + wl), -0.3, 0, TAU); ctx.fill();
      if (wl > 0.3) glow(ctx, hx, hy - 3, 12, BIO, wl * 0.7);
      ctx.fillStyle = 'rgba(60,20,30,0.5)'; ctx.fillRect(hx - 6, hy + 1, 1.5, 4);   // 멍
    }
    // 밖으로 뻗은 손 (손가락이 길다)
    const reach = Math.sin(t * 1.3 + i * 2) * 4 + wl * 9;
    const ax = 30 + reach, ay = -18 - reach * 0.6;
    ctx.lineCap = 'round'; ctx.strokeStyle = C('#aebdc0');
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(12, 2); ctx.quadraticCurveTo(22, -4, ax, ay); ctx.stroke();
    ctx.lineWidth = 1.8; ctx.beginPath();
    for (let k = 0; k < 4; k++) { const fa = -1.2 + k * 0.35 + Math.sin(t * 3 + k + i) * 0.1; ctx.moveTo(ax, ay); ctx.lineTo(ax + Math.cos(fa) * 10, ay + Math.sin(fa) * 10); ctx.lineTo(ax + Math.cos(fa + 0.4) * 15, ay + Math.sin(fa + 0.4) * 15); }
    ctx.stroke();
    ctx.restore();
  }

  drawStole(ctx, fl) {
    const t = this.t, s = this.ps;
    // 목에서 가슴 양쪽으로 늘어진 사제의 영대 (금실 테두리, 썩어 찢김)
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -24 : 26, y0 = -176 + s.slump * 16;
      const sw = Math.sin(t * 1.4 + side) * 6;
      ctx.beginPath();
      ctx.moveTo(x0 - 10, y0);
      ctx.bezierCurveTo(x0 + side * 14 - 14, y0 + 60, x0 + side * 8 - 16 + sw, y0 + 140, x0 - 14 + sw * 1.5, y0 + 222);
      ctx.lineTo(x0 - 6 + sw * 1.5, y0 + 206); ctx.lineTo(x0 + 2 + sw * 1.5, y0 + 230); ctx.lineTo(x0 + 10 + sw * 1.5, y0 + 212);
      ctx.bezierCurveTo(x0 + side * 8 + 16 + sw, y0 + 140, x0 + side * 14 + 14, y0 + 60, x0 + 10, y0);
      ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'dg_stole' + side, 0, y0, 0, y0 + 230, [0, '#1e4a58', 0.5, ROBE, 1, ROBE_D]), 2);
      if (!fl) {
        ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0 - 8, y0 + 4); ctx.bezierCurveTo(x0 + side * 14 - 12, y0 + 60, x0 + side * 8 - 14 + sw, y0 + 140, x0 - 12 + sw * 1.5, y0 + 214); ctx.stroke();
        // 수놓은 눈 문양 (녹슨 금)
        ctx.fillStyle = rgba(GOLD, 0.8);
        for (let k = 0; k < 3; k++) { const yy = y0 + 50 + k * 50, xx = x0 + side * 6 + sw * (k / 3); ctx.beginPath(); ctx.ellipse(xx, yy, 5, 3, 0, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#0a1a20'; for (let k = 0; k < 3; k++) { const yy = y0 + 50 + k * 50, xx = x0 + side * 6 + sw * (k / 3); ctx.beginPath(); ctx.arc(xx, yy, 1.8, 0, TAU); ctx.fill(); }
      }
    }
  }

  drawHead(ctx, fl) {
    const s = this.ps, K = this.K, t = this.t, dmg = this.dmg;
    // 줄기(미끼) 먼저: 머리 뒤에서 나와 앞으로 휜다 — 몸 지역 좌표
    for (const b of this.bulbs) {
      const sway = Math.sin(t * 1.9 + b.i * 2.1) * 10;
      ctx.beginPath(); ctx.moveTo(b.sx, b.sy);
      ctx.quadraticCurveTo((b.sx + b.tx) / 2 - 18 + sway, Math.min(b.sy, b.ty) - 40, b.tx, b.ty);
      ctx.lineCap = 'round';
      if (!fl) { ctx.strokeStyle = '#0c1412'; ctx.lineWidth = 8; ctx.stroke(); }
      ctx.strokeStyle = C('#5a6e62'); ctx.lineWidth = 5; ctx.stroke();
      if (!fl) {
        ctx.strokeStyle = 'rgba(160,210,190,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
        // 실
        ctx.strokeStyle = 'rgba(180,255,240,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(b.tx, b.ty); ctx.lineTo(b.lx, b.ly - 8); ctx.stroke();
      }
      if (b.alive && b.grow > 0 && !b.out) bulbShape(ctx, b.lx, b.ly, 13 * (0.3 + 0.7 * b.grow), 0.8 + 0.2 * Math.sin(t * 5 + b.i) + (b.hitT > 0 ? 0.6 : 0), fl);
      else if (!fl) {
        // 부서진 미끼: 찢긴 살 끝에서 빛나는 체액이 떨어진다
        ctx.fillStyle = '#3a0a14'; ctx.beginPath(); ctx.arc(b.tx, b.ty, 5, 0, TAU); ctx.fill();
        const dy = (t * 50 + b.i * 13) % 30;
        ctx.fillStyle = rgba(ICHOR, 0.6); ctx.beginPath(); ctx.arc(b.tx, b.ty + 6 + dy, 2, 0, TAU); ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(K.hx, K.hy); ctx.rotate(K.ha);
    const jaw = 0.06 + s.mouth * 0.62 + Math.max(0, Math.sin(t * 2.3)) * 0.03;
    // 등지느러미 가시 (머리 위에서 혹까지)
    ctx.beginPath();
    ctx.moveTo(-58, -12);
    for (let i = 0; i < 6; i++) { const x = -54 + i * 13, h = 30 + (i % 2) * 14 - i * 2 + Math.sin(t * 2 + i) * 3; ctx.lineTo(x - 4, -40 - h * 0.3); ctx.lineTo(x + 2, -46 - h); ctx.lineTo(x + 7, -44 - h * 0.3); }
    ctx.lineTo(24, -44); ctx.closePath();
    ink(ctx, fl ? '#fff' : rgba('#44584f', 0.9), 2);
    if (!fl) { ctx.fillStyle = 'rgba(200,80,90,0.25)'; ctx.fill(); }
    // 입 안 (턱 사이)
    if (jaw > 0.1) {
      ctx.beginPath(); ctx.moveTo(-18, 10); ctx.lineTo(104, 4);
      ctx.lineTo(-18 + Math.cos(jaw) * 130, 12 + Math.sin(jaw) * 130); ctx.closePath();
      ctx.fillStyle = C(MOUTH); ctx.fill();
      if (!fl) {
        glowE(ctx, 40, 24 + jaw * 30, 50, 30, s.pipes > 0.2 ? WATER : '#ff4a60', 0.3 + s.pipes * 0.5);
        // 목구멍의 또 다른 입 (그로테스크)
        ctx.fillStyle = '#5a0a1a'; ctx.beginPath(); ctx.ellipse(10, 20 + jaw * 20, 10, 6 + jaw * 8, 0.4, 0, TAU); ctx.fill();
        ctx.fillStyle = TOOTH; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; ctx.beginPath(); ctx.arc(10 + Math.cos(a) * 8, 20 + jaw * 20 + Math.sin(a) * (5 + jaw * 6), 1.6, 0, TAU); ctx.fill(); }
      }
    }
    // 아래턱 (주걱턱, 앞으로 튀어나옴)
    ctx.save();
    ctx.translate(-18, 12); ctx.rotate(jaw);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.bezierCurveTo(40, -8, 104, -14, 136, -4); ctx.quadraticCurveTo(134, 16, 104, 26); ctx.bezierCurveTo(64, 38, 18, 32, -4, 12); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dg_jaw', 0, -8, 0, 34, [0, FLESH_L, 0.4, FLESH, 1, FLESH_D]), 3);
    if (!fl) {
      ctx.fillStyle = rgba(BELLY, 0.45); ctx.beginPath(); ctx.moveTo(10, 16); ctx.quadraticCurveTo(70, 34, 130, 4); ctx.quadraticCurveTo(80, 22, 10, 10); ctx.fill();
      // 아래 바늘이빨 (길고 삐뚤다)
      ctx.fillStyle = TOOTH;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const x = 18 + i * 11.5, h = 12 + hash(i * 3.3) * 16 + (i === 8 ? 10 : 0), lean = (hash(i * 7.7) - 0.5) * 8; ctx.moveTo(x - 2.5, -7); ctx.lineTo(x + lean, -7 - h); ctx.lineTo(x + 2.5, -7); }
      ctx.fill();
      // 수염 (턱밑 촉수)
      ctx.strokeStyle = '#3a4a44'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const x = 40 + i * 20; ctx.moveTo(x, 26); ctx.quadraticCurveTo(x + 4, 44, x - 4 + Math.sin(t * 2.2 + i) * 8, 60 + i * 4); } ctx.stroke();
    }
    ctx.restore();
    // 위 두개골 · 주둥이
    ctx.beginPath();
    ctx.moveTo(-58, 14);
    ctx.bezierCurveTo(-68, -34, -18, -64, 34, -52);
    ctx.bezierCurveTo(68, -44, 96, -24, 106, -4);
    ctx.lineTo(102, 6);
    ctx.quadraticCurveTo(40, 8, -18, 20);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dg_skull', 0, -60, 0, 20, [0, FLESH_L, 0.35, FLESH, 1, '#1f2c27']), 3);
    if (!fl) {
      // 윗 바늘이빨
      ctx.fillStyle = TOOTH;
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const x = 10 + i * 12, h = 9 + hash(i * 5.5) * 12; ctx.moveTo(x - 2, 6); ctx.lineTo(x + 1, 6 + h); ctx.lineTo(x + 3, 6); } ctx.fill();
      // 아가미 덮개 선
      ctx.strokeStyle = 'rgba(10,20,16,0.7)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-30, -30); ctx.bezierCurveTo(-14, -12, -16, 6, -30, 16); ctx.stroke();
      // 따개비 · 혹
      barnacle(ctx, -20, -44, 6); barnacle(ctx, -6, -50, 4); barnacle(ctx, -36, -30, 5); barnacle(ctx, 60, -38, 3.5);
      // 눈: 부풀어 오른 흐린 눈 + 작은 눈들
      if (dmg >= 2) {
        ctx.fillStyle = '#1a0206'; ctx.beginPath(); ctx.ellipse(56, -24, 13, 11, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(ICHOR, 0.7); const dy = (t * 40) % 26; ctx.beginPath(); ctx.arc(54, -14 + dy, 2.5, 0, TAU); ctx.fill();
        glow(ctx, 56, -24, 20, ICHOR, 0.3);
      } else {
        // 부풀어 오른 백내장 눈 (눈꺼풀 없음, 핏발)
        ctx.beginPath(); ctx.arc(56, -26, 15, 0, TAU);
        ink(ctx, RG(ctx, 'dg_eye', 51, -31, 1, 56, -26, 15, [0, '#f4f8f2', 0.45, '#c3d2c8', 0.8, '#7f978c', 1, '#3a4a42']), 2.5);
        const p = this.P, look = p ? clamp((p.cy - (this.oy - 200)) / 300, -1, 1) : 0;
        ctx.fillStyle = 'rgba(96,120,128,0.7)'; ctx.beginPath(); ctx.ellipse(59, -25 + look * 3, 7, 8, 0.3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0c1214'; ctx.beginPath(); ctx.ellipse(60, -25 + look * 4, 1.8, 4.6, 0.2, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(52, -31, 2.4, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(190,30,45,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(42, -30); ctx.lineTo(48, -27); ctx.lineTo(51, -29); ctx.moveTo(43, -18); ctx.lineTo(49, -20); ctx.moveTo(68, -36); ctx.lineTo(63, -32); ctx.lineTo(64, -29); ctx.moveTo(66, -14); ctx.lineTo(62, -18); ctx.stroke();
      }
      // 잔눈들: 윤기 나는 검은 물고기 눈
      for (const [ex, ey, er] of [[80, -12, 5], [34, -40, 5.5], [86, -26, 3.5], [22, -32, 3.2], [44, -46, 2.6]]) {
        ctx.fillStyle = '#2a3833'; ctx.beginPath(); ctx.arc(ex, ey, er + 1.3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#05080a'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(160,230,255,0.75)'; ctx.beginPath(); ctx.arc(ex - er * 0.35, ey - er * 0.35, er * 0.32, 0, TAU); ctx.fill();
      }
      // 코 구멍 · 주름
      ctx.fillStyle = '#0c1410'; ctx.beginPath(); ctx.ellipse(96, -8, 3, 2, 0.4, 0, TAU); ctx.fill();
      if (dmg >= 1) { ctx.strokeStyle = '#4a0a14'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, -50); ctx.lineTo(18, -30); ctx.lineTo(12, -20); ctx.stroke(); glowE(ctx, 14, -34, 10, 18, ICHOR, 0.25); }
    }
    // 왕관: 녹슨 금테 + 산호 가지
    ctx.beginPath(); ctx.moveTo(-34, -46); ctx.quadraticCurveTo(6, -66, 46, -52); ctx.lineTo(44, -42); ctx.quadraticCurveTo(6, -56, -32, -36); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'dg_crown', 0, -66, 0, -36, [0, '#f2d890', 0.4, GOLD, 1, '#5a4420']), 2);
    ctx.lineCap = 'round';
    const coral = (x, y, a, L, w, depth) => {
      const x2 = x + Math.cos(a) * L, y2 = y + Math.sin(a) * L;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
      if (depth > 0) { coral(x2, y2, a - 0.45, L * 0.6, w * 0.65, depth - 1); coral(x2, y2, a + 0.4, L * 0.55, w * 0.6, depth - 1); }
    };
    if (!fl) { ctx.strokeStyle = '#3a0c08'; coral(-26, -44, -PI / 2 - 0.5, 22, 8, 1); coral(40, -50, -PI / 2 + 0.4, 20, 8, 1); }
    ctx.strokeStyle = C(CORAL);
    coral(-26, -44, -PI / 2 - 0.5, 22, 5, 1); coral(40, -50, -PI / 2 + 0.4, 20, 5, 1); coral(8, -58, -PI / 2 - 0.1, 16, 4, 1);
    if (!fl) {
      ctx.fillStyle = CORAL_L; for (const [cx, cy] of [[-36, -74], [50, -76], [6, -80]]) { ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TAU); ctx.fill(); }
      if (dmg >= 1) { ctx.strokeStyle = '#1a0a04'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(4, -60); ctx.lineTo(0, -52); ctx.lineTo(6, -46); ctx.stroke(); }
      // 진주 장식
      ctx.fillStyle = PEARL; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-20 + i * 18, -50 - Math.sin(i) * 3, 3, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  drawFrontArm(ctx, fl) {
    const s = this.ps, K = this.K, t = this.t;
    const sx = 50, sy = -150 + s.slump * 14;
    const hx = 112 + s.crook * 4, hy = -110 - s.crook * 150 + s.slump * 30 + Math.sin(t * 1.2) * 3;
    const ex = 104 - s.crook * 10, ey = -64 - s.crook * 70 + s.slump * 18;
    // 목장: 손에서 위로 산호 갈고리, 아래로 물속까지
    const topX = K.crookX, topY = K.crookY;
    const botX = hx + 16, botY = hy + 230;
    ctx.lineCap = 'round';
    if (!fl) { ctx.strokeStyle = '#1a0806'; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(botX, botY); ctx.lineTo(topX, topY + 40); ctx.stroke(); }
    ctx.strokeStyle = C('#9a4a34');
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(botX, botY); ctx.lineTo(topX, topY + 40); ctx.stroke();
    if (!fl) { ctx.strokeStyle = 'rgba(255,170,140,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(botX - 2, botY); ctx.lineTo(topX - 2, topY + 40); ctx.stroke(); }
    // 산호 갈고리 (소용돌이)
    ctx.save(); ctx.translate(topX, topY + 40);
    ctx.strokeStyle = fl ? '#fff' : '#1a0806'; ctx.lineWidth = 12;
    const hook = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-6, -40, 20, -66, 44, -56); ctx.bezierCurveTo(64, -46, 58, -18, 40, -18); ctx.bezierCurveTo(28, -18, 26, -32, 36, -36); };
    if (!fl) { hook(); ctx.stroke(); }
    ctx.strokeStyle = C(CORAL); ctx.lineWidth = 8; hook(); ctx.stroke();
    if (!fl) {
      ctx.strokeStyle = rgba(CORAL_L, 0.7); ctx.lineWidth = 2; hook(); ctx.stroke();
      // 가지 돌기
      ctx.strokeStyle = CORAL; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(4, -30); ctx.lineTo(-12, -44); ctx.moveTo(22, -60); ctx.lineTo(18, -76); ctx.moveTo(52, -50); ctx.lineTo(66, -62); ctx.stroke();
      // 진주 (빛남)
      const k = 0.6 + 0.4 * Math.sin(t * 3) + s.crook * 0.6;
      glow(ctx, 38, -30, 26 + 22 * s.crook, CORAL_L, 0.5 * k);
      ctx.fillStyle = PEARL; ctx.beginPath(); ctx.arc(38, -30, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(36, -32, 2.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 팔
    tube(ctx, sx, sy, ex, ey, 24, 17, fl ? '#fff' : FLESH, 'dg_arm_f', 3);
    tube(ctx, ex, ey, hx, hy, 17, 12, fl ? '#fff' : FLESH, 'dg_arm_f2', 3);
    if (!fl) { barnacle(ctx, sx + 12, sy + 6, 5); barnacle(ctx, sx + 22, sy + 16, 4); barnacle(ctx, ex - 4, ey - 6, 4); }
    // 지팡이를 쥔 손
    ctx.save(); ctx.translate(hx + 10, hy);
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 12, 0.3, 0, TAU); ink(ctx, C('#5c7466'), 2.2);
    ctx.fillStyle = C('#34463e');
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(8, -8 + k * 5.5, 7, 3, 0.2, 0, TAU); ctx.fill(); }
    if (!fl) { ctx.fillStyle = '#d8d2bc'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(13, -9 + k * 5.5); ctx.lineTo(19, -6 + k * 5.5); ctx.lineTo(13, -6 + k * 5.5); ctx.fill(); } }
    ctx.restore();
  }

  paintLash(ctx, x0, tip, dir, t, dur, hold, seed) {
    if (R.fl) return;
    if (pArt(this.world)?.lash(ctx, x0, tip, dir, t, dur, hold, seed, this.wy)) return;   // 채색 뱀장어 촉수 타일
    const y = this.wy, n = 16, len = Math.abs(tip - x0);
    if (len < 4) return;
    const fade = clamp((dur + hold - t) / 0.18, 0, 1);
    const P = this._lp ?? (this._lp = new Float32Array(n * 2));
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1), x = x0 + (tip - x0) * u;
      P[k * 2] = x; P[k * 2 + 1] = y - 6 + Math.sin(u * 9 - t * 16 + seed) * 12 * u + Math.sin(u * 3 + seed) * 6;
    }
    ctx.globalAlpha *= fade;
    taper(ctx, P, n, 22, 5);
    ink(ctx, EEL, 3);
    ctx.strokeStyle = rgba(EEL_L, 0.7); ctx.lineWidth = 2;
    ctx.beginPath(); for (let k = 0; k < n; k++) { if (k) ctx.lineTo(P[k * 2], P[k * 2 + 1] - 6 * (1 - k / n)); else ctx.moveTo(P[0], P[1] - 6); } ctx.stroke();
    ctx.fillStyle = '#c9b7b0';
    for (let k = 1; k < n - 1; k += 1) { const r = 4.5 * (1 - k / n) + 1.2; ctx.beginPath(); ctx.arc(P[k * 2], P[k * 2 + 1] + r * 2.2, r, 0, TAU); ctx.fill(); }
    // 끝의 물보라
    glowE(ctx, tip, y - 4, 60, 18, '#bff4ff', 0.55);
  }
  paintSpear(ctx, z, x, top, bot, w) {
    if (!z.started) {
      // 예고: 물밑에서 거품이 솟고 수면이 부푼다
      const k = z.k;
      warnRect(ctx, x - 20, top, 40, bot - top, k * 0.7, WATER, w.time);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#dff4ff', 0.4 + 0.4 * k);
      for (let i = 0; i < 10; i++) { const ph = (w.time * 1.8 + hash(i + x)) % 1; ctx.beginPath(); ctx.arc(x + (hash(i * 3.1 + x) - 0.5) * 30, bot - ph * (bot - this.wy), 2 + hash(i) * 3, 0, TAU); ctx.fill(); }
      glowE(ctx, x, this.wy, 30 + 20 * k, 10, WATER, 0.5 * k);
      return;
    }
    const f = 1 - z.a, h = (bot - top) * Math.min(1, z.a * 5 + 0.3);
    ctx.globalCompositeOperation = 'lighter';
    glowE(ctx, x, bot - h / 2, 36, h / 2 + 20, WATER, 0.7 * f);
    ctx.fillStyle = rgba('#e6fbff', 0.8 * f);
    ctx.beginPath(); ctx.moveTo(x - 14, bot); ctx.lineTo(x - 6, bot - h); ctx.lineTo(x, bot - h - 24); ctx.lineTo(x + 6, bot - h); ctx.lineTo(x + 14, bot); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.9 * f);
    ctx.fillRect(x - 3, bot - h, 6, h);
  }
  paintWhirl(ctx, z, cx) {
    if (z.t < z.warn) return;
    const k = clamp(Math.min(z.t, z.dur - z.t) / 0.4, 0, 1), y0 = this.wy, bot = this.A.floor, t = z.t;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // 수면의 소용돌이 고리
    for (let i = 0; i < 5; i++) {
      const r = 30 + i * 30, a0 = t * (5 - i * 0.6) + i;
      ctx.strokeStyle = rgba('#bff4ff', (0.5 - i * 0.07) * k); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, y0, r, r * 0.22, 0, a0, a0 + 4.2); ctx.stroke();
    }
    // 아래로 좁아지는 깔때기
    ctx.strokeStyle = rgba(WATER, 0.35 * k); ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const ph = t * 6 + i * 2.1;
      for (let s = 0; s <= 12; s++) {
        const u = s / 12, yy = y0 + (bot - y0) * u, r = 150 * (1 - u) + 12, xx = cx + Math.cos(ph + u * 8) * r;
        if (s) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
      }
    }
    ctx.stroke();
    glowE(ctx, cx, (y0 + bot) / 2, 90, (bot - y0) / 2 + 20, WATER, 0.25 * k);
  }
}

// ═════════════════════════════ 도우미 ═════════════════════════════
function setR(r, cx, cy) { r.x = cx - r.w / 2; r.y = cy - r.h / 2; }
function mixD(c) { return c === EEL ? '#222b33' : '#33443c'; }
/** 점 배열(몸 지역)을 따라 굵기 r0 → r1 로 가늘어지는 닫힌 경로 */
function taper(ctx, P, n, r0, r1) {
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
function barnacle(ctx, x, y, r) {
  ctx.fillStyle = BARN_D; ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, TAU); ctx.fill();
  ctx.fillStyle = BARN; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d8d4c2'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); ctx.fill();
  ctx.fillStyle = '#12100c'; ctx.beginPath(); ctx.ellipse(x, y, r * 0.45, r * 0.25, 0.5, 0, TAU); ctx.fill();
}
function wound(ctx, x, y, L, a, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#2a040c';
  ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.quadraticCurveTo(0, -7, L / 2, 0); ctx.quadraticCurveTo(0, 8, -L / 2, 0); ctx.fill();
  ctx.strokeStyle = rgba(ICHOR, 0.7); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-L / 2 + 4, 0); ctx.quadraticCurveTo(0, -3, L / 2 - 4, 0); ctx.stroke();
  const dy = (t * 30) % 22;
  ctx.fillStyle = rgba(ICHOR, 0.55); ctx.beginPath(); ctx.arc(-4, 4 + dy, 2, 0, TAU); ctx.fill();
  glowE(ctx, 0, 0, L * 0.6, 10, ICHOR, 0.22);
  ctx.restore();
}
/** 생물발광 미끼 전구 */
function bulbShape(ctx, x, y, r, k, fl) {
  if (!fl) glow(ctx, x, y, r * 4.2, BIO, 0.55 * k);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fl ? '#fff' : rgba('#dffff8', 0.92); ctx.fill();
  if (fl) return;
  ctx.strokeStyle = 'rgba(20,70,70,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
  glow(ctx, x, y, r * 1.4, BIO, 0.8 * k, true);
  ctx.strokeStyle = 'rgba(40,120,110,0.6)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.2); ctx.lineTo(x, y + r * 0.3); ctx.lineTo(x + r * 0.5, y - r * 0.2); ctx.stroke();
}

/**
 * 벡터 그림 컬링 대리 개체: world.render 는 개체 사각형 ±200px 로 자르는데, 이 보스 그림은 판정 사각형보다 훨씬 크다.
 * 보스의 artBounds() 를 사각형으로 삼아 보스 draw 를 대신 부른다 (채색 렌더러가 붙으면 보스 draw 가 스스로 건너뛴다).
 * 공격 개체가 아니므로 BOSS_TRANSIENT·killTransients 정리 대상이 아니다 (host 필드만 쓴다).
 */
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
