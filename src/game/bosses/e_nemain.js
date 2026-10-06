// 보스 b_nemain — 둥지어미 / 네메인 (s22 외전 「까마귀의 이름」) — docs/specs/ex_s22.md §2. 소유: EX2-BOSS
// BossC(c_common.js) 상속. 구조는 e_argen.js, 소환은 c_narkissa.js(spawnMinion), 망토는 b_death 채색 렌더러를 본으로.
// 그림은 벡터(2부 기준 디테일); 채색 퍼핏(render/painted/bosses/b_nemain.js)은 이 논리를 읽기만 한다.
//
// 모습: 옆모습의 키 큰 마른 여인 (얼굴 쪽 = facing). 검은 칠의 까마귀 부리 반가면(금이 간다), 땅에 끌리는 검은 까마귀 깃털 망토
//   (안감 진홍, 자락마다 붉은 눈이 깜빡인다), 몸에 붙는 검은 가죽 암살복·은 버클, 목의 까마귀 문신, 까마귀 부리 단검 두 자루.
//   50% 전환(unmask)에서 가면이 두 쪽으로 깨져 떨어지고 리아와 같은 붉은 눈·은빛 머리가 드러난다 (form2 '네메인').
// 판정 부위 (가까운 부위 우선, 목록 순서 = 겹칠 때 우선순위): 머리 40×40 (가면 0.85 · 맨얼굴 1.0 · 무릎 0.6) · 몸통 (1.0 · 노출·무릎 0.7) ·
//   다리 (1.15) · 펼친 망토 (1.3, 펼친 동안만). 가라앉음(그림자 걸음)·까마귀 떼(까마귀 폭풍)·그믐 어둠 동안 판정 없음 (ghost).
// 패턴 (static PATTERNS — docs/specs/ex_s22.md §2.1): featherVolley(깃털 비수) · crowDive(까마귀 급습) · shadowStep(그림자 걸음, 카운터 창) ·
//   nameless(비석 없는 무덤) · nestCall(둥지의 부름, 소환) · murder(까마귀 폭풍, 2페이즈) · featherCage(둥지 고리, 2페이즈) ·
//   eclipse(그믐, 2페이즈 · 체력 15% 이하 한 번 강제 + 대사 b_nemain_last) · 보조 stagger(무릎).
//   전환 unmask (1: 무적 2초, 0.6초에 가면이 깨진다 → form2 → 대사 b_nemain_unmask → 곧바로 murder).
// 모든 패턴은 this.A(경기장 경계)와 A.floor 만 기준으로 움직인다 (투기장 maps/arena.js r1 · 무한의 탑 보스 층도 같다). 방 기믹 없음.
// 결말 (체력 0): 보스 처치 처리(world.onBossDefeated)는 다른 보스와 같고 연출만 '굴복' (5초, 파편 폭발 없음):
//   망토에서 까마귀 떼가 하늘로 흩어지고(0–1.5초) · 단검 두 자루가 떨어져 울리고(1.2초) · 한쪽 무릎을 꿇는다(1.5–2.5초) → 그 자세를 유지
//   (스토리: 스테이지가 끝날 때까지 무릎 꿇은 채 남는다 · 아케이드: 3.5초에 까마귀로 흩어져 사라진다). 'STAGE CLEAR' 부제의 '격파' → '결착'.
// 채색 렌더러가 읽는 필드: zx, fy (발 = A.floor) · fk (좌우 −1..1, 연속) · facing · ps {lean, crouch, kneel, spread, caw, bow} · arm {n1,n2,f1,f2,gn,gf} ·
//   pts (몸 지역 좌표의 골격 점 — rig()) · masked · maskBreakT · sink (0..1 가라앉음) · swarm (0..1 까마귀 떼로 흩어짐) · dark (0..1 그믐) ·
//   ghost · stunned · exposed · cWin · flock {x,y,ph (Float32Array 40), a, n} · cage · daggersDown · dieT · vanishK · state · t · flashT · A
// 컬링: 펼친 망토·까마귀 떼가 몸통 판정보다 훨씬 크므로 아르겐과 같은 ArtCull 대리 개체가 artBounds() 로 그린다.
import { BossC, telegraph, strikeRect, strikeColumn, strikeLine, ringWave, spawnMinion, minionsAlive, darken, screenTint, prewarmTint, phaseScript, clearMood } from './c_common.js';
import { PI, R, C, LG, ink, glow, glowE, glowSprite, warnRect, warnLine, warnFloor, impact, hash, ownHit } from './b_common.js';
import { Entity } from '../entity.js';
import { TILE } from '../../core/game.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';
import { registerPainted, hasPainted, paintedDraw, paintedRig, paintedEnabled } from '../../render/painted/registry.js';   // 채색 퍼핏 등록 (그리기 전용)
import { bosses as EXB } from '../../render/painted/reg/ex-boss.js';

// ── 색 ──
const BLK = '#141018', BLK2 = '#221c28', PLUM = '#3a1420', CRIM = '#c0142a', CRIM_L = '#ff4a6a', EYE = '#d02a3a';
const SILV = '#c8c8d0', SILV_D = '#7a7a88', LEATH = '#1c1820', LEATH_H = '#3c3648', SKIN = '#e6dcd8', SKIN_D = '#a8949a';
const HAIR = '#b4b8c6', HAIR_D = '#4a4a58', LACQ = '#0c0a10', LACQ_H = '#5a5a6e', MOON = '#a8c0ff';
// ── 패턴 계약 (docs/specs/ex_s22.md §2.1 — 클래스의 static PATTERNS 가 c_common P2_PATTERNS 보다 이긴다) ──
const PATTERNS = {
  attacks: ['featherVolley', 'crowDive', 'shadowStep', 'nameless', 'nestCall', 'murder', 'featherCage', 'eclipse'],
  helpers: ['stagger'],
  // applyAt 0.3 = 전환 0.6초 (가면이 깨지는 순간 form2 이름·초상화 교체)
  transitions: { 1: { state: 'unmask', dur: 2.0, script: 'b_nemain_unmask', form2: true, force: 'murder', applyAt: 0.3 } },
  weights: [
    { featherVolley: 3, crowDive: 3, shadowStep: 3, nameless: 2, nestCall: 1 },
    { shadowStep: 3, murder: 3, featherCage: 2, eclipse: 2, featherVolley: 2, nameless: 2, crowDive: 1, nestCall: 1 },
  ],
  gimmicks: [],
  floorRow: 16,
  // 설계 방 (§1.1 boss 무너진 종루 — s21 boss 방과 같은 뼈대): 60×18, 경기장 17열부터, 바닥 16–17행(구덩이 없음), 11행 발판 셋 + 7행 높은 발판 둘
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7]] },
};
const T48 = () => TILE || 48;
// ── 몸 지역 좌표 (+x = 얼굴 쪽, y 아래가 양수, 원점 = 발 가운데 바닥) ──
const UA = 30, FA = 29, TH = 41, SH = 45, TORSO = 43, DAG = 36;   // 위팔 · 아래팔(주먹까지) · 넓적다리 · 정강이(발바닥까지) · 몸통(엉덩이→목) · 단검 — 채색 부품(full_a lps 0.06)의 비례
const POSE0 = { lean: 0, crouch: 0, kneel: 0, spread: 0, caw: 0, bow: 0, sway: 0 };
const POSE_RATE = { lean: 9, crouch: 9, kneel: 5, spread: 6, caw: 8, bow: 4, sway: 3 };
/** 팔 자세 (각 = 몸 지역: 0 앞, π/2 아래) · gn/gf = 주먹에서 단검 방향 (역수 쥐기 ≈2.6 = 칼날이 뒤아래) */
const ARM = {
  idle: { n1: 1.15, n2: -1.55, f1: 1.35, f2: -1.35, gn: 2.6, gf: 2.7 },
  raise: { n1: -2.3, n2: -0.6, f1: -2.0, f2: -0.7, gn: 0.3, gf: 0.3 },
  throw: { n1: -0.15, n2: 0.05, f1: 0.3, f2: 0.2, gn: 0, gf: 0 },
  point: { n1: -1.25, n2: -0.2, f1: 1.4, f2: -1.2, gn: 0, gf: 2.7 },
  ready: { n1: 0.55, n2: -1.9, f1: 0.85, f2: -2.0, gn: 0.25, gf: 0.25 },
  slash1: { n1: 0.15, n2: 0.0, f1: 1.6, f2: -0.6, gn: 0.1, gf: 0.1 },
  slash2: { n1: 1.5, n2: -0.4, f1: 0.05, f2: 0.0, gn: 0.1, gf: 0.1 },
  spread: { n1: -0.55, n2: -0.15, f1: -2.6, f2: 0.15, gn: 1.6, gf: 1.6 },
  limp: { n1: 1.5, n2: 0.15, f1: 1.62, f2: 0.1, gn: 1.4, gf: 1.4 },
  clutch: { n1: -1.85, n2: -2.25, f1: 1.4, f2: -1.4, gn: 2.6, gf: 2.7 },
};
const NF = 40;   // 까마귀 떼 (논리 40마리 — 그리는 수는 world.fx.quality × 40, 최소 16)
const flockN = (world) => clamp(Math.round(NF * (world?.fx?.quality ?? 1)), 16, NF);
// 망토 자락의 붉은 눈 (망토 지역 좌표 0..1: u = 어깨→밑단, v = 앞→뒤)
const CLOAK_EYES = Array.from({ length: 14 }, (_, i) => ({ u: 0.28 + hash(i * 3.3) * 0.66, v: 0.2 + hash(i * 7.1) * 0.75, s: 0.7 + hash(i * 1.7) * 0.6, k: hash(i * 9.9) * 10 }));
const pt = () => ({ x: 0, y: 0 });

export class Nemain extends BossC {
  static get PATTERNS() { return PATTERNS; }

  setup() {
    // 채색 퍼핏: 모음(reg/index.js)에 ex-boss 줄이 아직 없으면 여기서 한 번 등록 (이미 있으면 아무것도 안 함)
    if (!hasPainted?.('b_nemain') && EXB?.b_nemain) registerPainted?.('b_nemain', { kind: 'boss', importer: EXB.b_nemain });
    const A = this.A;
    this.noGravity = true; this.vx = 0; this.vy = 0;
    this.zx = clamp(this.cx, A.x0 + 90, Math.max(A.x0 + 90, A.x1 - 90)); this.fy = A.floor;
    const p0 = this.P;
    this.facing = this.fk = p0 && p0.cx < this.zx ? -1 : 1;
    this.tzx = this.zx; this.spd = 0; this.walkPh = 0; this.walkK = 0;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    this.arm = { ...ARM.idle }; this.armT = { ...ARM.idle }; this.armRate = 14;
    this.pts = { hip: pt(), neck: pt(), head: pt(), shN: pt(), shF: pt(), elN: pt(), elF: pt(), hdN: pt(), hdF: pt(), dgN: pt(), dgF: pt(),
      knN: pt(), knF: pt(), ftN: pt(), ftF: pt(), beak: pt(), eye: pt(), tA: 0, hA: 0 };
    this.masked = true; this.maskBreakT = -1; this.dmg = 0;
    this.sink = 0; this.sinkT = 0; this.swarm = 0; this.swarmT = 0; this.dark = 0; this.darkT = 0; this.vanishK = 0;
    this.ghost = false; this.stunned = false; this.exposed = false; this.cWin = false; this.mexp = 0;
    this.daggersDown = false; this.dieT = 0; this._last15 = false; this._lastPending = false; this._bn = null;
    this.vd = this.cd = this.ss = this.nm = this.md = this.cg = this.ec = null;
    this.flock = { x: new Float32Array(NF), y: new Float32Array(NF), vx: new Float32Array(NF), vy: new Float32Array(NF), ph: new Float32Array(NF), a: 0, aT: 0, mode: 'off', cx: 0, cy: 0, rx: 120, ry: 60, n: NF };
    for (let i = 0; i < NF; i++) this.flock.ph[i] = hash(i * 5.7) * TAU;
    this.pHead = { x: 0, y: 0, w: 40, h: 40, defMul: 0.85 };
    this.pBody = { x: 0, y: 0, w: 42, h: 56, defMul: 1.0 };
    this.pLegs = { x: 0, y: 0, w: 38, h: 74, defMul: 1.15 };
    this.pCloak = { x: 0, y: 0, w: 200, h: 130, defMul: 1.3 };
    this.cBody = { x: 0, y: 0, w: 40, h: 110 };
    this._hp = []; this._cp = []; this._pt = { x: 0, y: 0 };
    this.fxAcc = 0;
    // 싸움 중 새 캔버스 0 (MASTER_PLAN §5.2): 쓰는 발광 색은 등장 때 굽는다
    for (const c of [CRIM, CRIM_L, EYE, '#ffffff', MOON, '#ff8090']) { glowSprite(c, false); glowSprite(c, true); }
    prewarmTint('#c0142a');
    this.motion(0, this.world);
    this.flockHome();
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  camTop() { const c = this.world?.camera; return c && Number.isFinite(c.y) ? c.y : -1e9; }
  /** 하늘 높이 (까마귀 급습 출발): 경기장 천장 · 화면 위 · 바닥 −600 중 가장 낮은 곳 */
  skyY() { const A = this.A; return Math.max((A.top ?? 0) + 50, this.camTop() + 60, A.floor - 600); }
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; this.arms('idle'); }
  arms(name, rate = 14) { Object.assign(this.armT, ARM[name] ?? ARM.idle); this.armRate = rate; }
  faceP(th = 40) { const p = this.P; if (p) { const d = p.cx - this.zx; if (Math.abs(d) > th) this.facing = Math.sign(d); } }
  /** 몸 지역 → 월드 (좌우 fk, 가라앉음만큼 아래로) */
  toWorld(lx, ly, out = this._pt) { out.x = this.zx + this.fk * lx; out.y = this.fy + ly + this.sink * 170; return out; }
  place() { this.x = this.zx - this.w / 2; this.y = this.fy - this.h; this.vx = 0; this.vy = 0; }
  hpK() { return this.stats?.maxHp ? this.hp / this.stats.maxHp : 1; }

  /** 골격 (몸 지역 좌표): 엉덩이 · 목 · 머리 · 어깨 · 팔꿈치 · 주먹 · 단검 끝 · 무릎 · 발. 그리기·판정·채색이 같이 쓴다 */
  rig() {
    const s = this.ps, P = this.pts, a = this.arm, t = this.t;
    const wk = this.walkK, wp = this.walkPh;
    const kn = clamp(s.kneel, 0, 1), cr = clamp(s.crouch, 0, 1);
    // 엉덩이 · 몸통 기울기 (앞 = +)
    P.hip.x = -2 - 8 * kn + Math.sin(wp * 2) * 1.5 * wk; P.hip.y = -84 + 16 * cr + 40 * kn + Math.abs(Math.sin(wp)) * 2 * wk;
    const ta = 0.05 + 0.24 * s.lean - 0.08 * s.caw + 0.3 * s.bow + 0.12 * kn + Math.sin(t * 1.3) * 0.015 + 0.04 * s.sway;
    P.tA = ta;
    P.neck.x = P.hip.x + Math.sin(ta) * TORSO; P.neck.y = P.hip.y - Math.cos(ta) * TORSO;
    const ha = ta * 0.5 - 0.42 * s.caw + 0.5 * s.bow;
    P.hA = ha;
    P.head.x = P.neck.x + 4 + Math.sin(ha) * 12; P.head.y = P.neck.y - 12 + (1 - Math.cos(ha)) * 3;
    const ca = Math.cos(ha), sa = Math.sin(ha);
    P.beak.x = P.head.x + 24 * ca + 6 * sa; P.beak.y = P.head.y + 24 * sa - 6 * ca + 8;
    P.eye.x = P.head.x + 7 * ca + 4 * sa; P.eye.y = P.head.y + 7 * sa - 4 * ca;
    // 어깨 (가까운 = 앞쪽 약간, 먼 = 뒤)
    P.shN.x = lerp(P.hip.x, P.neck.x, 0.78) + 1; P.shN.y = lerp(P.hip.y, P.neck.y, 0.78) + 1;
    P.shF.x = P.shN.x - 7; P.shF.y = P.shN.y - 1;
    // 팔
    const arm = (S, E, H, D, a1, a2, g) => {
      E.x = S.x + Math.cos(a1) * UA; E.y = S.y + Math.sin(a1) * UA;
      H.x = E.x + Math.cos(a1 + a2) * FA; H.y = E.y + Math.sin(a1 + a2) * FA;
      const da = a1 + a2 + g;
      D.x = H.x + Math.cos(da) * DAG; D.y = H.y + Math.sin(da) * DAG;
    };
    arm(P.shN, P.elN, P.hdN, P.dgN, a.n1, a.n2, a.gn);
    arm(P.shF, P.elF, P.hdF, P.dgF, a.f1, a.f2, a.gf);
    // 다리: 서기(발 고정 + 걸음) ↔ 무릎 꿇기 (가까운 다리 = 앞 무릎을 세운다, 먼 다리 = 무릎을 땅에)
    const step = Math.sin(wp) * 14 * wk;
    const fN = { x: 11 + 8 * s.lean + step, y: 0 }, fF = { x: -10 - step, y: -Math.max(0, Math.cos(wp)) * 5 * wk };
    this.leg(P.hip, fN, P.knN, 1);
    this.leg({ x: P.hip.x - 4, y: P.hip.y - 1 }, fF, P.knF, 1);
    P.ftN.x = fN.x; P.ftN.y = fN.y; P.ftF.x = fF.x; P.ftF.y = fF.y;
    if (kn > 0.01) {
      P.ftN.x = lerp(P.ftN.x, 26, kn); P.ftN.y = lerp(P.ftN.y, 0, kn); P.knN.x = lerp(P.knN.x, 30, kn); P.knN.y = lerp(P.knN.y, -40, kn);
      P.knF.x = lerp(P.knF.x, -8, kn); P.knF.y = lerp(P.knF.y, -4, kn); P.ftF.x = lerp(P.ftF.x, -48, kn); P.ftF.y = lerp(P.ftF.y, -6, kn);
    }
  }
  /** 두 마디 다리 IK (엉덩이 H → 발 F, 무릎은 앞으로 굽는다) */
  leg(H, F, K, bend) {
    const dx = F.x - H.x, dy = F.y - H.y, d = Math.min(TH + SH - 0.5, Math.max(8, Math.hypot(dx, dy)));
    const a = Math.atan2(dy, dx), c = clamp((TH * TH + d * d - SH * SH) / (2 * TH * d), -1, 1), off = Math.acos(c) * bend;
    K.x = H.x + Math.cos(a - off) * TH; K.y = H.y + Math.sin(a - off) * TH;
  }
  /** 판정 부위를 월드 좌표로 (그리기와 같은 골격) */
  syncParts() {
    const P = this.pts, W = this._pt;
    this.toWorld(P.head.x + 2, P.head.y, W);
    const ph = this.pHead; ph.x = W.x - 20; ph.y = W.y - 20;
    ph.defMul = this.stunned ? 0.6 : this.masked ? 0.85 : 1.0;
    this.toWorld((P.hip.x + P.neck.x) / 2, (P.hip.y + P.neck.y) / 2 + 2, W);
    const pb = this.pBody; pb.x = W.x - 21; pb.y = W.y - 28; pb.defMul = this.exposed || this.stunned ? 0.7 : 1.0;
    this.cBody.x = W.x - 20; this.cBody.y = W.y - 30; this.cBody.h = Math.max(40, this.fy - (W.y - 30));
    this.toWorld(P.hip.x * 0.5, P.hip.y * 0.5, W);
    const pl = this.pLegs; pl.h = Math.max(30, -P.hip.y); pl.x = W.x - 19; pl.y = this.fy + this.sink * 170 - pl.h;
    this.toWorld(-34, P.shN.y + 40, W);
    const pc = this.pCloak; pc.x = W.x - 100; pc.y = W.y - 80;
  }
  motion(dt, world) {
    const s = this.ps, pt0 = this.pt;
    for (const k in s) s[k] += (pt0[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt));
    const ar = 1 - Math.exp(-this.armRate * dt), a = this.arm, at = this.armT;
    for (const k in a) a[k] += (at[k] - a[k]) * ar;
    const A = this.A;
    const x0 = this.zx;
    if (this.spd > 0) this.zx = approach(this.zx, this.tzx, this.spd * dt);
    this.zx = clamp(this.zx, A.x0 + 36, A.x1 - 36);
    this.fy = A.floor;
    const mv = dt > 0 ? Math.abs(this.zx - x0) / dt : 0;
    this.walkK = approach(this.walkK, mv > 30 && !this.ghost ? 1 : 0, dt * 6);
    this.walkPh += dt * Math.min(14, mv * 0.045);
    this.fk = approach(this.fk, this.facing, dt * 9);
    this.sink = approach(this.sink, this.sinkT, dt * 3.2);
    this.swarm = approach(this.swarm, this.swarmT, dt * 3);
    this.dark = approach(this.dark, this.darkT, dt * 4);
    this.flockTick(dt);
    this.place();
    this.rig();
    this.syncParts();
  }

  // ═════════════════════════════ 까마귀 떼 (논리 40마리, 그리기 전용 — 판정은 지대가 맡는다) ═════════════════════════════
  /** 떼를 몸 가까이로 (보이지 않게) */
  flockHome() {
    const F = this.flock, c = this.toWorld(this.pts.hip.x - 10, -90, { x: 0, y: 0 });
    for (let i = 0; i < NF; i++) { F.x[i] = c.x + (hash(i * 2.1) - 0.5) * 60; F.y[i] = c.y + (hash(i * 3.9) - 0.5) * 80; F.vx[i] = 0; F.vy[i] = 0; }
    F.mode = 'off'; F.a = 0; F.aT = 0;
  }
  /** 떼 상태: off · burst(몸에서 사방으로) · swarm(중심 cx,cy 둘레를 맴돈다) · gather(몸으로 모인다) · up(하늘로 흩어진다) */
  flockSet(mode, o = {}) {
    const F = this.flock;
    if (mode === 'burst' || mode === 'up') {
      const c = this.toWorld(this.pts.hip.x - 6, -92, { x: 0, y: 0 });
      for (let i = 0; i < NF; i++) {
        const a = mode === 'up' ? -PI / 2 + (hash(i * 4.3) - 0.5) * 2.4 : hash(i * 4.3) * TAU, sp = (o.speed ?? 420) * (0.55 + hash(i * 6.1) * 0.7);
        F.x[i] = c.x + (hash(i * 2.1) - 0.5) * 50; F.y[i] = c.y + (hash(i * 3.9) - 0.5) * 70;
        F.vx[i] = Math.cos(a) * sp; F.vy[i] = Math.sin(a) * sp - (mode === 'up' ? 120 : 60);
      }
      F.a = 1; F.aT = 1;
    }
    if (o.cx != null) F.cx = o.cx;
    if (o.cy != null) F.cy = o.cy;
    if (o.rx != null) F.rx = o.rx;
    if (o.ry != null) F.ry = o.ry;
    if (o.aT != null) F.aT = o.aT; else if (mode === 'swarm' || mode === 'gather') F.aT = 1;
    F.mode = mode;
  }
  flockTick(dt) {
    const F = this.flock;
    F.a = approach(F.a, F.aT, dt * (F.aT > F.a ? 6 : 1.6));
    for (let i = 0; i < NF; i++) F.ph[i] += dt * (9 + hash(i * 1.3) * 5);
    if (F.mode === 'off' || F.a <= 0.001 && F.aT <= 0) return;
    const t = this.t;
    if (F.mode === 'burst' || F.mode === 'up') {
      const damp = Math.exp(-(F.mode === 'up' ? 0.6 : 2.2) * dt);
      for (let i = 0; i < NF; i++) {
        F.vx[i] *= damp; F.vy[i] = F.vy[i] * damp - (F.mode === 'up' ? 90 * dt : 0);
        F.x[i] += F.vx[i] * dt; F.y[i] += F.vy[i] * dt;
      }
      return;
    }
    const k = 1 - Math.exp(-(F.mode === 'gather' ? 7 : 11) * dt);
    const gc = F.mode === 'gather' ? this.toWorld(this.pts.hip.x - 6, -92, { x: 0, y: 0 }) : null;
    for (let i = 0; i < NF; i++) {
      let tx, ty;
      if (gc) { const r = (1 - Math.min(1, F.a)) * 0 + 18 + hash(i * 7.3) * 26; tx = gc.x + Math.cos(t * 3 + i) * r; ty = gc.y + Math.sin(t * 2.6 + i * 1.7) * r * 1.6; }
      else {
        const u = hash(i * 2.9) * TAU + t * (1.6 + hash(i * 5.1) * 1.2) * (i % 2 ? 1 : -1);
        const rr = 0.35 + hash(i * 8.7) * 0.65;
        tx = F.cx + Math.cos(u) * F.rx * rr; ty = F.cy + Math.sin(u * 1.3) * F.ry * rr;
      }
      F.x[i] += (tx - F.x[i]) * k; F.y[i] += (ty - F.y[i]) * k;
    }
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0 || this.hidden || this.ghost) return L;
    L.push(this.pHead, this.pBody, this.pLegs);
    if (this.ps.spread > 0.5 && !this.stunned) L.push(this.pCloak);
    return L;
  }
  /** 접촉은 몸통만. 숨은 동안·무릎·사망 중에는 없다 (그 피해는 예고된 지대가 맡는다) */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.hidden || this.ghost || this.dying > 0 || this.stunned || this.state === 'shadowStep' || this.state === 'eclipse') return L;
    L.push(this.cBody);
    return L;
  }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (Math.random() < 0.6) world.fx.burst('dark', x, y, 3, { color: BLK2, speed: 150 });
    if (part === this.pHead && this.masked) world.fx.burst('shard', x, y, 2, { color: LACQ_H, speed: 170 });
    if (this.dying > 0 || this.dead) { this.renameBanner(world); return; }
    // 카운터 창(그림자 걸음·그믐의 솟아오름)에 플레이어·탈것이 한 대 → 무릎 (stagger). 수호신 자동 공격은 창을 쓰지 않는다 (ownHit — BAL-RULES)
    if (this.cWin && (this.state === 'shadowStep' || this.state === 'eclipse') && ownHit(attack)) { this.cWin = false; this.later(0, () => this.toStagger()); return; }
    // 까마귀 폭풍 노출 1초 안에 최대 체력 5% 이상 → 무릎
    if (this.exposed && this.state === 'murder') {
      this.mexp += Math.max(0, dmg || 0);
      if (this.mexp >= this.stats.maxHp * 0.05) { this.exposed = false; this.later(0, () => this.toStagger()); return; }
    }
    this.check15();
  }
  /** 체력 15% 이하에서 한 번: 그믐 강제 + 대사 b_nemain_last (스토리·처음만 — phaseScript 가 거른다) */
  check15() {
    if (this._last15 || this.phase < 1 || this.dying > 0 || this.hpK() > 0.15) return;
    this._last15 = true; this._lastPending = true;
    this.forceNext('eclipse');
  }
  toStagger() {
    if (this.dying > 0 || this.dead || this.state === 'stagger' || this._tr) return;
    this.clearJobs(); this.onCancel(this.world);
    this.setState('stagger');
  }

  // ═════════════════════════════ 패턴 고르기 ═════════════════════════════
  minionCount(id) { minionsAlive(this); let n = 0; for (const e of this._cMinions) if (e.id === id && !e.dead) n++; return n; }
  /** 둥지의 부름: 부를 것이 남았는가 (까마귀 ≤ 4 · 2페이즈 그림자 헌터 ≤ 1) */
  canCall() { return this.minionCount('crow') < 4 || (this.phase >= 1 && this.minionCount('shadow_hunter') < 1); }
  weights(phase = this.phase) { return super.weights(phase).filter(([k]) => k !== 'nestCall' || this.canCall()); }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
    this.dmg = this.masked ? (this.hpK() > 0.75 ? 0 : 1) : 2;
  }
  ambient(dt, world) {
    if (this.ghost || this.swarm > 0.5) return;
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (1.2 + 1.5 * this.ps.spread);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const P = this.toWorld(-30 - Math.random() * 30, -20 - Math.random() * 90);
      world.fx.emit('dark', P.x, P.y, { speed: 26, color: PLUM, angle: -PI / 2, spread: 0.9 });
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) {
    let x0 = this.zx - 300, x1 = this.zx + 300, y0 = this.fy - 380, y1 = this.fy + 40;
    const F = this.flock;
    if (F.a > 0.01) for (let i = 0; i < NF; i++) { const x = F.x[i], y = F.y[i]; if (x - 40 < x0) x0 = x - 40; if (x + 40 > x1) x1 = x + 40; if (y - 40 < y0) y0 = y - 40; if (y + 40 > y1) y1 = y + 40; }
    r.x = x0; r.y = y0; r.w = x1 - x0; r.h = y1 - y0;
    return r;
  }
  /**
   * 그리기: 채색이 준비됐으면 채색(대리 개체), 아니면 벡터. 굴복 연출(사망 5초)은 스스로 보여 주므로
   * Boss.draw 의 사망 투명도 감쇠를 쓰지 않는다 (채색 렌더러의 ownsDeathFade 와 같은 규칙)
   */
  draw(ctx, world) {
    if (this.hidden) return;
    const c = this._cull;
    if (c && !c.dead && c.world === world && !this._artDrawing) return;   // 대리 개체(ArtCull)가 그린다
    const pd = paintedDraw(this, ctx, world);
    if (pd === true) return;
    ctx.save();
    if (pd) ctx.globalAlpha *= 1 - pd;
    this.render(ctx, world);
    ctx.restore();
    if (world.game?.debug) { ctx.save(); ctx.strokeStyle = '#0ff'; for (const hb of this.hurtboxes()) ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); ctx.restore(); }
  }

  // ═════════════════════════════ 상태 ═════════════════════════════
  s_intro(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0);
      this.setPose({ spread: 1, caw: 1, lean: -0.2 }); this.arms('spread', 8);
      audio.sfx('crow_caw', { vol: 0.45, pitch: 0.9 }); audio.sfx('bat', { pitch: 0.55, vol: 0.7 });
      impact(world, { shake: 6, time: 0.5 });
      this.flockSet('burst', { speed: 360 }); this.flock.aT = 0;
      world.fx.ring(this.zx, this.fy - 90, { color: CRIM_L, r0: 20, r1: 240, life: 0.6, width: 5 });
    }
    if (this.at(1.1)) { this.setPose({ spread: 0.2, caw: 0, lean: 0 }); this.arms('idle', 8); }
    if (t >= 1.5) { this.flockHome(); this.done(0.8); }
  }
  /** 대기: 플레이어와 280px 안팎을 유지하며 미끄러지듯 걷는다 (너무 붙으면 물러선다) */
  idleMove(dt, world, t) {
    this.faceP();
    const A = this.A, p = this.P;
    const px = p ? p.cx : A.cx;
    const side = Math.sign(this.zx - px) || -this.facing;
    const close = p && Math.abs(p.cx - this.zx) < 150;
    this.tzx = clamp(px + side * (280 + Math.sin(this.t * 0.9) * 40), A.x0 + 90, A.x1 - 90);
    this.spd = close ? 380 : 170;
    if (this.state === 'idle') { this.setPose({ lean: close ? -0.15 : 0.05, crouch: 0, spread: 0.08 }); }
  }

  // ── featherVolley: 팔을 들고(0.55초 예고) 등 뒤에 깃털이 부채처럼 선다 → 깃털 비수 5개 부채꼴(48°), 640px/s, mv 0.5, 수명 1.6초.
  //    2페이즈 7개 + 0.35초 뒤 반 칸 어긋난 두 번째 부채
  s_featherVolley(dt, world, t) {
    const P2 = this.phase >= 1;
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.arms('raise', 12); this.setPose({ spread: 0.5, lean: -0.2, caw: 0.3 });
      telegraph(this, 0.55, { sfx: 'warning', vol: 0.4 });
      audio.sfx('bat', { pitch: 0.85, vol: 0.55 });
    }
    if (this.at(0.55)) { this.arms('throw', 22); this.setPose({ lean: 0.3, caw: 0 }); this.volley(P2 ? 7 : 5, 0); }
    if (P2 && this.at(0.9)) this.volley(7, 0.5);
    if (t >= (P2 ? 1.5 : 1.15)) { this.relax(); this.done(1.0); }
  }
  volley(n, half) {
    const p = this.P, o = this.toWorld(-8, -116, { x: 0, y: 0 });
    const aim = p ? Math.atan2(p.cy - o.y, p.cx - o.x) : (this.facing > 0 ? 0 : PI);
    const spread = 48 * PI / 180, step = spread / (n - 1);
    for (let k = 0; k < n; k++) {
      const a = aim - spread / 2 + (k + half) * step;
      this.shoot({ x: o.x, y: o.y, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, w: 26, h: 12, life: 1.6, render: featherRender, attack: { mv: 0.5, element: 'dark' }, light: { r: 40, color: CRIM_L, i: 0.3 } });
    }
    audio.sfx('whip', { pitch: half ? 1.45 : 1.3, vol: 0.7 });
    this.world.fx.burst('dark', o.x, o.y, 6, { color: BLK2, speed: 220 });
  }

  // ── crowDive: 화면 위쪽에 까마귀 3마리(2페이즈 5) → 각자 그 순간 플레이어 자리로 warnLine 0.6초 → 900px/s 로 꽂힌다
  //    (strikeLine 폭 34, mv 0.55, 0.18초 간격). 까마귀는 선을 따라 날아가 바닥에 부딪혀 깃털로 흩어진다
  s_crowDive(dt, world, t) {
    const A = this.A, P2 = this.phase >= 1;
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.arms('point', 12); this.setPose({ caw: 1, lean: -0.15 });
      telegraph(this, 0.45, { sfx: null });
      audio.sfx('crow_caw', { vol: 0.4, pitch: 1.05 });
      const n = P2 ? 5 : 3, top = this.skyY(), p = this.P, px = p ? p.cx : A.cx;
      this.cd = { n, left: n, endT: 0 };
      for (let i = 0; i < n; i++) {
        const x = clamp(px + (i - (n - 1) / 2) * 230 + rand(-30, 30), A.x0 + 40, A.x1 - 40), y = top + rand(0, 40);
        const lock = 0.45 + i * 0.18, warn = lock + 0.6;
        this.crowDiver(x, y, lock, warn);
      }
    }
    const cd = this.cd;
    if (!cd) { this.done(0.5); return; }
    if (this.at(0.6)) { this.setPose({ caw: 0 }); this.arms('idle', 8); }
    if (cd.left <= 0 && !cd.endT) cd.endT = t + 0.3;
    if ((cd.endT && t >= cd.endT) || t > 5) { this.cd = null; this.relax(); this.done(0.9); }
  }
  /** 까마귀 한 마리: lock 초까지 플레이어를 겨누다 고정 → warn 초에 출발, 900px/s 로 선을 따라 바닥까지 (판정 = 까마귀 앞 50px 선분) */
  crowDiver(x, y, lock, warn) {
    const A = this.A, path = { x0: x, y0: y, x1: x, y1: A.floor, dx: 0, dy: 1, len: A.floor - y, seed: rand(0, 100) };
    const aimAt = (px, py) => {
      let dx = px - x, dy = Math.max(40, py - y);
      const L0 = Math.hypot(dx, dy) || 1; dx /= L0; dy /= L0;
      const len = Math.min(1400, (A.floor - 4 - y) / dy);
      path.dx = dx; path.dy = dy; path.len = len; path.x1 = x + dx * len; path.y1 = y + dy * len;
    };
    const p = this.P; aimAt(p ? p.cx : A.cx, p ? p.cy : A.floor - 60);
    const cd = this.cd;
    strikeLine(this, x, y, path.x1, path.y1, {
      th: 34, warn, life: 1.7, mv: 0.55, element: 'dark', color: CRIM_L, sfx: null,
      track: (z, w) => { if (z.t < lock && w.player) aimAt(w.player.cx, w.player.cy); const L = z.line; L.x0 = x; L.y0 = y; L.x1 = path.x1; L.y1 = path.y1; },
      tick: (z) => {
        if (!z.started) return;
        const d = Math.min(path.len, 900 * (z.t - z.warn)), L = z.line;
        if (d >= path.len && !z.landed) { z.landed = true; z.dur = Math.max(0.02, z.t - z.warn + 0.03); }   // 바닥에 닿으면 끝 (onEnd)
        L.x1 = x + path.dx * d; L.y1 = y + path.dy * d; L.x0 = L.x1 - path.dx * 50; L.y0 = L.y1 - path.dy * 50;
        z.x = Math.min(L.x0, L.x1) - 34; z.y = Math.min(L.y0, L.y1) - 34; z.w = Math.abs(L.x1 - L.x0) + 68; z.h = Math.abs(L.y1 - L.y0) + 68;
      },
      onStart: () => audio.sfx('dash', { pitch: 1.4, vol: 0.45 }),
      onEnd: (z, w) => { cd.left--; w.fx.burst('dark', path.x1, path.y1 - 6, 8, { color: BLK2, speed: 220 }); w.fx.burst('dust', path.x1, A.floor - 4, 6, { speed: 160, angle: -PI / 2, spread: 1 }); w.camera?.shake?.(2, 0.1); },
      paint: (ctx, z, w) => paintDiver(ctx, z, w, path, lock, x, y),
    });
  }

  // ── shadowStep: 바닥 그림자로 가라앉음 0.35초(판정 없음) → 붉은 반짝임이 섞인 그림자 웅덩이가 플레이어 등 뒤로 0.6초 →
  //    솟아오름 0.25초 = 카운터 창(boss.telegraph, 맞으면 무릎) → 십자 베기 2타 (앞 160×110, mv 0.75 · 0.85). 2페이즈는 반대쪽에서 한 번 더
  s_shadowStep(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) this.ss = { k: 0, n: this.phase >= 1 ? 2 : 1, t0: 0, side: 0, sx: this.zx, tx: this.zx, lock: false };
    const ss = this.ss;
    if (!ss) { this.done(0.5); return; }
    const u = t - ss.t0, hes = this.hesitate();
    const at = (v) => this.pst - ss.t0 < v && u >= v;
    if (at(0.001)) {
      this.ghost = true; this.cWin = false; this.spd = 0; this.sinkT = 1;
      this.setPose({ crouch: 1, spread: 0.25, lean: 0.2 }); this.arms('ready', 10);
      audio.sfx('dark', { pitch: 0.7, vol: 0.6 });
      world.fx.burst('dark', this.zx, A.floor - 8, 12, { color: BLK2, speed: 160, angle: -PI / 2, spread: 1.2 });
      ss.sx = this.zx; ss.lock = false;
    }
    if (u > 0.35 && u < 0.95 + hes) {
      // 등 뒤(1번째) · 반대쪽(2번째)
      const p = this.P;
      if (!ss.lock && p) {
        const back = -(p.facing || Math.sign(p.cx - this.zx) || 1);
        if (!ss.side) ss.side = ss.k === 0 ? back : -ss.side;
        ss.tx = clamp(p.cx + ss.side * 95, A.x0 + 50, A.x1 - 50);
        if (u >= 0.85) ss.lock = true;
      }
      const k = clamp((u - 0.35) / 0.6, 0, 1), e = k * k * (3 - 2 * k);
      this.zx = lerp(ss.sx, ss.tx, e);
      if (Math.random() < 0.6 * (world.fx.quality ?? 1)) world.fx.emit('spark', this.zx + rand(-40, 40), A.floor - 4, { color: CRIM_L, speed: 60, angle: -PI / 2, spread: 0.8 });
    }
    if (at(0.95 + hes)) {
      // 솟아오름 = 카운터 창
      const p = this.P; if (p) this.facing = Math.sign(p.cx - this.zx) || this.facing;
      this.fk = this.facing;
      this.ghost = false; this.cWin = true; this.sinkT = 0;
      this.telegraphFor(0.25);
      this.setPose({ crouch: 0.4, spread: 0.6, lean: 0.1 });
      audio.sfx('eye_glint', { vol: 0.6 }); audio.sfx('whip', { pitch: 0.6, vol: 0.5 });
    }
    if (at(1.2 + hes)) { this.cWin = false; this.sink = 0; this.slash(0.75, 'slash1'); }
    if (at(1.38 + hes)) this.slash(0.85, 'slash2');
    if (at(1.75 + hes)) {
      if (ss.k + 1 < ss.n) { ss.k++; ss.t0 = t; ss.side = -ss.side || 1; ss.lock = false; return; }
      this.ss = null; this.relax(); this.done(1.0);
    }
  }
  /** 앞 160×110 십자 베기 한 타 (즉시 — 솟아오름이 예고) */
  slash(mv, pose) {
    const f = this.facing, x = this.zx + (f > 0 ? 6 : -166), y = this.fy - 122;
    this.arms(pose, 30); this.setPose({ lean: 0.35, crouch: 0.2 });
    strikeRect(this, { x, y, w: 160, h: 110 }, { warn: 0, life: 0.12, mv, element: 'dark', color: CRIM_L, sfx: null, kb: [360, -300],
      paint: (ctx, z) => paintSlash(ctx, z, f, pose === 'slash1') });
    audio.sfx('slash_heavy', { pitch: pose === 'slash1' ? 1.15 : 0.95, vol: 0.75 });
  }
  /** 선택(§2.1): 스토리 · 2페이즈 · 플레이어가 리아면 솟아오름이 0.12초 늦다 (어미의 망설임 — 아케이드 공정성에는 영향 없음) */
  hesitate() { const w = this.world; return w?.mode === 'story' && this.phase >= 1 && (w.hero?.charId === 'lia' || w.player?.hero?.charId === 'lia') ? 0.12 : 0; }

  // ── nameless: 단검 5자루(2페이즈 7)를 던져 경기장 바닥에 고르게 꽂는다 (warnFloor 0.9초, 자루가 비석처럼 보인다) →
  //    먼 쪽부터 플레이어 쪽으로 0.15초 간격으로 그림자 칼날 기둥 (strikeColumn 폭 56, 높이 5칸, mv 0.7)
  s_nameless(dt, world, t) {
    const A = this.A, n = this.phase >= 1 ? 7 : 5;
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.arms('raise', 12); this.setPose({ lean: -0.15, spread: 0.3 });
      telegraph(this, 0.35, { sfx: 'warning', vol: 0.4, pitch: 0.85 });
    }
    if (this.at(0.35)) {
      this.arms('throw', 24); this.setPose({ lean: 0.3 });
      audio.sfx('whip', { pitch: 0.9, vol: 0.7 }); audio.sfx('sheath', { vol: 0.5 });
      const p = this.P, px = p ? p.cx : A.cx, xs = [];
      for (let k = 0; k < n; k++) xs.push(A.x0 + 70 + (k * (A.w - 140)) / (n - 1));
      xs.sort((a, b) => Math.abs(b - px) - Math.abs(a - px));   // 먼 쪽부터
      const hand = this.toWorld(this.pts.hdN.x, this.pts.hdN.y, { x: 0, y: 0 }), top = A.floor - 5 * T48();
      xs.forEach((x, j) => {
        const seed = rand(0, 100), from = { x: hand.x, y: hand.y };
        strikeColumn(this, x, {
          w: 56, warn: 0.9 + j * 0.15, life: 0.3, mv: 0.7, element: 'dark', color: CRIM_L, top, bottom: A.floor, sfx: null,
          onStart: (z, w) => { audio.sfx('slash', { pitch: 0.55 + Math.random() * 0.15, vol: 0.5 }); w.fx.burst('dark', x, A.floor - 20, 8, { color: BLK2, speed: 240, angle: -PI / 2, spread: 0.6 }); w.camera?.shake?.(2, 0.12); },
          paint: (ctx, z, w) => paintGrave(ctx, z, w, x, top, A.floor, from, seed),
        });
      });
      this.nm = { end: 0.35 + 0.9 + (n - 1) * 0.15 + 0.3 + 0.35 };
    }
    if (this.at(0.7)) { this.arms('idle', 8); this.setPose({ lean: 0, spread: 0 }); }
    if (this.nm && t >= this.nm.end) { this.nm = null; this.relax(); this.done(1.0); }
    if (t > 4) { this.nm = null; this.relax(); this.done(0.8); }
  }

  // ── nestCall: 까악(crow_caw) 1.0초 → spawnMinion 까마귀 2마리 (살아 있는 수 ≤ 4), 2페이즈는 그림자 헌터 1 (≤ 1). 최대치면 고르지 않는다 ──
  s_nestCall(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.setPose({ spread: 1, caw: 1, lean: -0.25 }); this.arms('spread', 9);
      audio.sfx('crow_caw', { vol: 0.5, pitch: 0.95 });
      world.fx.ring(this.zx, this.fy - 100, { color: CRIM_L, r0: 20, r1: 200, life: 0.6, width: 4 });
    }
    if (this.at(1.0)) {
      const crows = this.minionCount('crow');
      for (let i = 0; i < Math.min(2, 4 - crows); i++) {
        const x = clamp(this.zx + (i ? 1 : -1) * 90, A.x0 + 40, A.x1 - 40), y = this.fy - 190;
        if (spawnMinion(this, ['crow'], x, y, { facing: this.facing })) world.fx.burst('dark', x, y - 15, 10, { color: BLK2, speed: 200 });
      }
      if (this.phase >= 1 && this.minionCount('shadow_hunter') < 1) {
        const x = clamp(this.zx - this.facing * 120, A.x0 + 40, A.x1 - 40);
        if (spawnMinion(this, ['shadow_hunter'], x, A.floor, { facing: this.facing })) world.fx.burst('dark', x, A.floor - 40, 14, { color: '#b060ff', speed: 220 });
      }
      audio.sfx('bat', { pitch: 0.7, vol: 0.7 });
      this.setPose({ caw: 0.3 });
    }
    if (this.at(1.35)) this.relax();
    if (t >= 1.6) this.done(1.0);
  }

  // ── murder (2페이즈): 몸이 까마귀 떼로 터진다 0.4초(판정 없음) → 띠 경고 0.8초(경기장 폭 전체): 낮은 띠(바닥−2.4칸…바닥) 또는
  //    높은 띠(바닥−6.6칸…바닥−3.6칸) → 떼가 1100px/s 로 띠를 휩쓴다 (mv 0.45, rehit 0.25) → 반대쪽에서 다른 띠로 한 번 더 →
  //    먼 쪽에서 다시 모인다 + 노출 1.0초 (몸통 0.7, 최대 체력 5% 이상 맞으면 무릎). 전환 직후 강제
  band(kind) { const A = this.A, T = T48(); return kind === 'low' ? { y0: A.floor - 2.4 * T, y1: A.floor } : { y0: A.floor - 6.6 * T, y1: A.floor - 3.6 * T }; }
  s_murder(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.spd = 0; this.ghost = true; this.swarmT = 1; this.cWin = false; this.exposed = false; this.mexp = 0;
      this.setPose({ spread: 1, caw: 1 }); this.arms('spread', 12);
      const first = Math.random() < 0.5 ? 'low' : 'high';
      this.md = { k: 0, kinds: [first, first === 'low' ? 'high' : 'low'], dir: this.zx < A.cx ? 1 : -1, t0: 0, sweep: null, gx: 0, phase: 'burst' };
      this.flockSet('burst', { speed: 460 });
      audio.sfx('crow_caw', { vol: 0.55, pitch: 0.85 }); audio.sfx('bat', { pitch: 0.45, vol: 0.9 });
      impact(world, { shake: 7, time: 0.4 });
    }
    const md = this.md;
    if (!md) { this.done(0.5); return; }
    const sweepLife = (A.w + 260) / 1100;
    // 띠 하나 = 경고 0.8초 + 휩쓸기 sweepLife
    const runBand = (k, tw) => {
      const kind = md.kinds[k], b = this.band(kind), dir = k === 0 ? md.dir : -md.dir;
      const sx = dir > 0 ? A.x0 - 130 : A.x1 + 130;
      if (this.at(tw)) {
        this.zone({ x: A.x0, y: b.y0, w: A.w, h: b.y1 - b.y0, warn: 0, life: 0.8, harmless: true, z: 5, data: { band: kind },
          paint: (ctx, z, w) => warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / 0.8, 0, 1), CRIM_L, w.time) });
        audio.sfx('warning', { vol: 0.4, pitch: kind === 'low' ? 0.8 : 1.2 });
        this.flockSet('swarm', { cx: sx, cy: (b.y0 + b.y1) / 2, rx: 120, ry: (b.y1 - b.y0) * 0.45 });
      }
      if (this.at(tw + 0.8)) {
        const sw = md.sweep = { x: sx, dir, kind };
        this.zone({ x: sx - 130, y: b.y0, w: 260, h: b.y1 - b.y0, warn: 0, life: sweepLife, mv: 0.45, rehit: 0.25, element: 'dark', z: 7, kb: [dir * 300, -260], data: { band: kind, sweep: true },
          tick: (z, w, dt2) => { sw.x += dir * 1100 * dt2; z.x = sw.x - 130; this.flock.cx = sw.x; },
          onStart: () => { audio.sfx('bat', { pitch: 0.6, vol: 1 }); audio.sfx('crow_caw', { vol: 0.35, pitch: 1.2 }); } });
      }
    };
    runBand(0, 0.4);
    const t2 = 0.4 + 0.8 + sweepLife;
    runBand(1, t2);
    const t3 = t2 + 0.8 + sweepLife;
    if (this.at(t3)) {
      // 먼 쪽(플레이어에게서 먼 끝)에서 다시 모인다
      const p = this.P;
      md.gx = clamp(p && p.cx < A.cx ? A.x1 - 170 : A.x0 + 170, A.x0 + 60, A.x1 - 60);
      this.zx = this.tzx = md.gx;
      this.flockSet('gather');
      this.faceP(0); this.fk = this.facing;
    }
    if (this.at(t3 + 0.5)) {
      this.ghost = false; this.swarmT = 0; this.swarm = 0.4; this.exposed = true; this.mexp = 0;
      this.flock.aT = 0;
      this.setPose({ spread: 0, caw: 0, bow: 0.45, crouch: 0.5 }); this.arms('limp', 8);
      audio.sfx('dark', { pitch: 0.6, vol: 0.6 });
      this.world.fx.burst('dark', this.zx, this.fy - 80, 14, { color: BLK2, speed: 200 });
    }
    if (this.at(t3 + 1.5)) { this.exposed = false; this.flock.mode = 'off'; this.relax(); this.done(0.8); this.md = null; }
  }

  // ── featherCage (2페이즈): 0.5초 예고 → 플레이어를 둘러싼 까마귀 고리 (반지름 300 → 1.6초에 70, 두께 36, mv 0.6, rehit 0.5).
  //    70° 틈 하나(진홍 깃털 빛)가 초당 40° 돈다 → 틈으로 빠지거나 무적 대시로 뚫는다. 끝에 고리가 바깥으로 터진다 (ringWave r 0→260, mv 0.5)
  s_featherCage(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.setPose({ spread: 1, caw: 0.6, lean: -0.2 }); this.arms('spread', 10);
      telegraph(this, 0.5, { sfx: 'warning', vol: 0.4, pitch: 1.1 });
      audio.sfx('crow_caw', { vol: 0.45, pitch: 1.1 });
      const p = this.P, cx = p ? p.cx : this.A.cx, cy = p ? p.cy : this.A.floor - 40;
      const away = Math.atan2(cy - (this.fy - 90), cx - this.zx);   // 보스 반대쪽에 틈 (± 40°)
      this.cg = { cx, cy, g0: away + rand(-0.7, 0.7), r: 300, gap: away, t: 0, on: false };
      const cg = this.cg;
      this.zone({ x: cx - 320, y: cy - 320, w: 640, h: 640, warn: 0, life: 0.5, harmless: true, z: 5,
        paint: (ctx, z) => paintCage(ctx, cg, clamp(z.t / 0.5, 0, 1), z.world ?? this.world, true) });
    }
    const cg = this.cg;
    if (!cg) { this.done(0.5); return; }
    if (this.at(0.5)) {
      cg.on = true;
      this.zone({ x: cg.cx - 320, y: cg.cy - 320, w: 640, h: 640, warn: 0, life: 1.6, mv: 0.6, rehit: 0.5, element: 'dark', z: 7, kb: [260, -320], data: { cage: cg },
        tick: (z) => { cg.t = z.t; const k = clamp(z.t / 1.6, 0, 1); cg.r = 300 - 230 * (k * k * (3 - 2 * k)); cg.gap = cg.g0 + (40 * PI / 180) * z.t; },
        rects: (z) => cageRects(z, cg),
        paint: (ctx, z, w) => paintCage(ctx, cg, 1, w, false) });
      audio.sfx('bat', { pitch: 0.75, vol: 0.9 });
    }
    if (this.at(2.1)) {
      cg.on = false;
      ringWave(this, cg.cx, cg.cy, { r0: 10, r1: 260, speed: 560, th: 30, warn: 0, mv: 0.5, element: 'dark', color: CRIM_L, sfx: null, onStart: () => audio.sfx('bat', { pitch: 0.55, vol: 1 }) });
      this.world.fx.burst('dark', cg.cx, cg.cy, 16, { color: BLK2, speed: 320 });
      this.setPose({ spread: 0.2, caw: 0 }); this.arms('idle', 8);
    }
    if (t >= 2.6) { this.cg = null; this.relax(); this.done(1.0); }
  }

  // ── eclipse (2페이즈): darken(0.45, 4.5) — 붉은 눈 한 쌍만 보인다 → 기습 3번: 매번 0.55초 전 그 자리에 붉은 눈 + crow_caw
  //    (플레이어 옆, 좌우 번갈아) → 베기(170×110, mv 0.8). 솟아오르는 순간 = 카운터 창. 끝나면 가운데로 돌아오고 빛이 돌아온다.
  //    체력 15% 이하에서 한 번 강제 (check15 → forceNext · 대사 b_nemain_last 는 여기서 — 어둠이 내린 뒤 보여 준다)
  s_eclipse(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.spd = 0; this.cWin = false;
      darken(this, 0.45, 4.5);
      screenTint(this, { color: '#08000a', alpha: 0.18, edge: '#c0142a', dur: 4.4 });
      audio.sfx('dark', { pitch: 0.5, vol: 0.7 });
      this.setPose({ crouch: 0.6, spread: 0.6 }); this.arms('ready', 10);
      this.darkT = 1;
      const p = this.P;
      this.ec = { k: 0, side: p && p.cx > this.zx ? 1 : -1, eyeX: this.zx, rise: false };
      if (this._lastPending) { this._lastPending = false; phaseScript(this, 'b_nemain_last'); }
    }
    const ec = this.ec;
    if (!ec) { this.done(0.5); return; }
    if (this.at(0.35)) { this.ghost = true; this.sinkT = 0; }
    const hes = this.hesitate();
    for (let k = 0; k < 3; k++) {
      const T0 = 0.55 + k * 1.2;
      if (this.at(T0)) {
        // 그 자리에 붉은 눈 (0.55초 예고)
        const p = this.P, px = p ? p.cx : A.cx;
        ec.side = -ec.side; ec.k = k;
        ec.eyeX = clamp(px + ec.side * 110, A.x0 + 50, A.x1 - 50);
        this.zx = this.tzx = ec.eyeX; this.facing = this.fk = -ec.side;
        audio.sfx('crow_caw', { vol: 0.32, pitch: 1.25 });
        this.zone({ x: ec.eyeX - 30, y: this.fy - 160, w: 60, h: 40, warn: 0, life: 0.55 + hes, harmless: true, z: 9, data: { eyes: true }, paint: (ctx, z) => paintEyes(ctx, ec.eyeX + this.facing * 8, this.fy - 138, clamp(z.t / 0.2, 0, 1)) });
      }
      if (this.at(T0 + 0.55 + hes)) {
        ec.rise = true; this.ghost = false; this.cWin = true; this.darkT = 0.35;
        this.telegraphFor(0.2);
        this.setPose({ crouch: 0.2, lean: 0.25 }); this.arms('ready', 20);
        audio.sfx('eye_glint', { vol: 0.6 });
      }
      if (this.at(T0 + 0.75 + hes)) {
        this.cWin = false;
        const f = this.facing, x = this.zx + (f > 0 ? 4 : -174);
        strikeRect(this, { x, y: this.fy - 124, w: 170, h: 110 }, { warn: 0, life: 0.15, mv: 0.8, element: 'dark', color: CRIM_L, sfx: null, kb: [380, -300],
          paint: (ctx, z) => paintSlash(ctx, z, f, k % 2 === 0) });
        this.arms(k % 2 ? 'slash2' : 'slash1', 30);
        audio.sfx('slash_heavy', { pitch: 1.0 + k * 0.08, vol: 0.75 });
      }
      if (this.at(T0 + 0.98 + hes)) { ec.rise = false; this.ghost = true; this.darkT = 1; this.arms('ready', 10); }
    }
    const tEnd = 0.55 + 3 * 1.2 + hes;
    if (this.at(tEnd)) {
      this.zx = this.tzx = clamp(A.cx, A.x0 + 90, A.x1 - 90);
      this.faceP(0); this.fk = this.facing;
      this.ghost = false; this.darkT = 0; this.sinkT = 0;
      this.setPose({ crouch: 0, spread: 0.3 });
      this.world.fx.burst('dark', this.zx, this.fy - 80, 12, { color: BLK2, speed: 180 });
    }
    if (t >= tEnd + 0.5) { this.ec = null; this.relax(); this.done(1.0); }
  }

  /** 보조: 무릎 1.4초 (몸통 0.7 · 머리 0.6) — 카운터 창에 맞음 · 까마귀 폭풍 노출 중 5% */
  s_stagger(dt, world, t) {
    if (this.at(0.001)) {
      this.stunned = true; this.ghost = false; this.cWin = false; this.exposed = false; this.spd = 0;
      this.swarmT = 0; this.swarm = 0; this.sinkT = 0; this.sink = 0; this.darkT = 0; this.dark = 0;
      clearMood(world, this, { soft: true });   // 그믐의 카운터 창에 맞았으면 어둠(+0.45)·색조도 걷는다 — 무릎 꿇은 동안 방이 칠흑으로 남지 않게
      this.flock.aT = 0;
      this.setPose({ kneel: 1, bow: 0.7, spread: 0, caw: 0, crouch: 0, lean: 0 }); this.arms('limp', 10);
      audio.sfx('hit_heavy', { pitch: 0.7 }); audio.sfx('dark', { pitch: 0.5, vol: 0.5 });
      world.fx.burst('dark', this.zx, this.fy - 60, 14, { color: BLK2, speed: 240 });
      impact(world, { shake: 6, time: 0.3 });
    }
    if (this.stunned && Math.random() < 0.25 * (world.fx.quality ?? 1)) world.fx.emit('dark', this.zx + rand(-20, 20), this.fy - 90, { color: PLUM, speed: 40, angle: -PI / 2 });
    if (this.at(1.4)) { this.stunned = false; this.setPose({ kneel: 0, bow: 0 }); this.arms('idle', 8); }
    if (t >= 1.7) { this.relax(); this.done(0.6); }
  }

  // ── 전환 unmask (1→2): 무적 2.0초. 0.6초에 가면이 두 쪽으로 깨져 떨어지고 까마귀가 터져 나온다 (applyAt 0.3 → applyPhase(1)),
  //    form2 이름·초상화 교체, 끝에 대사 b_nemain_unmask (스토리 1회) → 곧바로 murder ──
  s_unmask(dt, world, t) {
    if (this.at(0.001)) {
      this.transStart(world);
      this.setPose({ bow: 0.6, crouch: 0.35 }); this.arms('clutch', 10);
      screenTint(this, { color: '#1a0008', alpha: 0.2, edge: '#c0142a', dur: 1.8 });
      audio.sfx('dark', { pitch: 0.45, vol: 0.7 });
    }
    if (this.at(1.1)) { this.setPose({ bow: 0, caw: 1, spread: 1, crouch: 0 }); this.arms('spread', 10); audio.sfx('crow_caw', { vol: 0.5, pitch: 0.8 }); }
    if (this.at(1.7)) { this.setPose({ caw: 0, spread: 0.3 }); this.arms('idle', 8); }
    this.transitionTick(dt, world, t);
  }
  transStart(world) {
    this.ghost = false; this.cWin = false; this.exposed = false; this.stunned = false; this.spd = 0;
    this.sinkT = 0; this.sink = 0; this.swarmT = 0; this.swarm = 0; this.darkT = 0;
    this.vd = this.cd = this.ss = this.nm = this.md = this.cg = this.ec = null;
    this.flock.aT = 0;
    audio.sfx('bat', { pitch: 0.4 });
    impact(world, { shake: 6, time: 0.5 });
  }
  /** 형태 바꾸기 (페이즈마다 한 번, debugPhase 에도): 1 = 가면이 깨진다 */
  applyPhase(k) {
    if (k >= 1 && this.masked) {
      this.masked = false; this.maskBreakT = this.t; this.dmg = 2;
      const w = this.world;
      if (w?.fx) {
        const P = this.toWorld(this.pts.head.x + 6, this.pts.head.y, { x: 0, y: 0 });
        w.fx.burst('shard', P.x, P.y, 10, { color: LACQ_H, speed: 300 });
        w.fx.burst('dark', P.x, P.y, 12, { color: BLK2, speed: 260 });
        w.fx.ring(P.x, P.y, { color: CRIM_L, r0: 10, r1: 220, life: 0.5, width: 5 });
        impact(w, { shake: 10, time: 0.5, flash: '#ffd0d8', fa: 0.25 });
        audio.sfx('break_wall', { pitch: 1.3, vol: 0.6 }); audio.sfx('crow_caw', { vol: 0.5, pitch: 0.9 });
      }
      this.flockSet('burst', { speed: 520 }); this.flock.aT = 0;
    }
  }
  onCancel() {
    this.ghost = false; this.cWin = false; this.exposed = false; this.stunned = false; this.spd = 0;
    this.sinkT = 0; this.sink = 0; this.swarmT = 0; this.swarm = 0; this.darkT = 0;
    this.vd = this.cd = this.ss = this.nm = this.md = this.cg = this.ec = null;
    if (this.flock.mode !== 'burst') this.flock.aT = 0;
    this.relax();
  }
  onReset() {
    this.onCancel();
    this.masked = true; this.maskBreakT = -1; this.dmg = 0; this.dark = 0; this.vanishK = 0;
    this._last15 = false; this._lastPending = false; this.daggersDown = false;
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    Object.assign(this.arm, ARM.idle); Object.assign(this.armT, ARM.idle);
    this.flockHome();
    this.tzx = this.zx; this.fy = this.A.floor;
  }

  // ═════════════════════════════ 굴복 (체력 0) ═════════════════════════════
  onDeath(world) {
    this.clearJobs();   // 남은 지연 작업이 연출 중에 쏘지 않게
    this.dying = 5.0; this.dieT = 0; this._bn = null; this._dropped = false; this._knelt = false; this._scattered = false;
    this.ghost = false; this.cWin = false; this.exposed = false; this.stunned = false; this.spd = 0;
    this.sinkT = 0; this.sink = 0; this.swarmT = 0; this.swarm = 0; this.darkT = 0; this.dark = 0; this.vanishK = 0;
    this.vd = this.cd = this.ss = this.nm = this.md = this.cg = this.ec = null;
    this.setPose({ spread: 1, caw: 0.6, bow: 0, kneel: 0, crouch: 0.2, lean: -0.1 }); this.arms('spread', 10);
    this.flockSet('up', { speed: 520 });
    audio.sfx('crow_caw', { vol: 0.6, pitch: 0.8 }); audio.sfx('bat', { pitch: 0.45, vol: 1 });
    world.fx.ring(this.zx, this.fy - 90, { color: CRIM_L, r0: 20, r1: 320, life: 0.8, width: 6 });
  }
  /**
   * 'STAGE CLEAR' 부제: 낱말 '격파' 만 '결착' 으로 (보스 러시 'ROUND CLEAR'·탑 '축복' 안내 등 나머지는 그대로). 새 배너가 뜰 때마다 한 번씩.
   * 처치 타격 바로 뒤(onHurt — world.onBossDefeated 가 배너를 단 직후)에도 부른다: 굴복 틱만 기다리면 처치 히트스톱 동안 '격파!' 가 보였다 (e_hagen.js 와 같다)
   */
  renameBanner(world) {
    const bn = world?.banner;
    if (bn && bn !== this._bn) { this._bn = bn; if (typeof bn.sub === 'string' && bn.sub.includes('격파')) bn.sub = bn.sub.replace('격파', '결착'); }
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    const T = this.dieT, q = world.fx?.quality ?? 1;
    this.renameBanner(world);
    // 0–1.5초: 망토에서 까마귀 떼가 하늘로 (망토가 접힌다)
    if (T < 1.5 && Math.random() < 0.6 * q) world.fx.emit('dark', this.zx - this.facing * 30 + rand(-30, 30), this.fy - 60 - rand(0, 60), { color: BLK2, speed: 120, angle: -PI / 2, spread: 0.8 });
    if (T >= 0.6 && T < 1.0) this.setPose({ spread: 0.3, caw: 0 });
    // 1.2초: 단검 두 자루가 떨어져 울린다
    if (T >= 1.2 && !this._dropped) {
      this._dropped = true; this.daggersDown = true; this.arms('limp', 8);
      audio.sfx('clang', { pitch: 1.3, vol: 0.7 });
      world.fx.burst('spark', this.zx + this.facing * 26, this.fy - 4, 6, { color: SILV, speed: 160, angle: -PI / 2, spread: 1 });
    }
    if (T >= 1.32 && T - dt < 1.32) audio.sfx('clang', { pitch: 1.55, vol: 0.45 });
    // 1.5–2.5초: 한쪽 무릎을 꿇는다 → 그 자세를 유지
    if (T >= 1.5) { this.setPose({ kneel: 1, bow: 0.65, spread: 0, caw: 0, crouch: 0, lean: 0 }); if (!this._knelt && T >= 2.3) { this._knelt = true; audio.sfx('land', { pitch: 0.7, vol: 0.5 }); world.fx.burst('dust', this.zx, this.fy - 4, 10, { speed: 120, angle: -PI / 2, spread: 1.3 }); } }
    if (T >= 1.6) this.flock.aT = 0;
    const arcade = world.arcade ?? world.mode !== 'story';
    if (arcade) {
      // 아케이드: 3.5초에 까마귀로 흩어져 사라진다 (보스 러시 다음 라운드)
      if (T >= 3.5 && !this._scattered) { this._scattered = true; this.flockSet('up', { speed: 420 }); audio.sfx('bat', { pitch: 0.6, vol: 0.9 }); audio.sfx('crow_caw', { vol: 0.4, pitch: 1.1 }); }
      if (T >= 3.5) this.vanishK = clamp((T - 3.5) / 0.45, 0, 1);
    } else if (this.dying < 0.25) this.dying = 0.25;   // 스토리: 무릎 꿇은 채 남는다 (스테이지가 끝날 때까지 — world.afterClear 는 clearT 7초에)
    this.motion(dt, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    if (this.hidden || this.vanishK >= 1) return;
    const e = this.toWorld(this.pts.eye.x, this.pts.eye.y, { x: 0, y: 0 });
    const vis = (1 - this.swarm) * (this.ghost && this.dark < 0.5 ? 0.2 : 1);
    L.add(e.x, e.y, 60 + 30 * this.dark, EYE, (0.45 + 0.4 * this.dark) * vis);
    if (this.dark < 0.5) L.add(this.zx, this.fy - 80, 200, '#ff4a6a', 0.35 * (1 - this.dark) * vis);
    if (this.cWin) L.add(this.zx, this.fy - 70, 160, CRIM_L, 0.7);
  }

  // ═════════════════════════════ 그리기 (벡터) ═════════════════════════════
  /** 몸 투명도: 까마귀 떼로 흩어진 만큼 · 그믐 어둠 · 아케이드 굴복의 사라짐 */
  bodyAlpha() { return clamp(1 - this.swarm, 0, 1) * (1 - 0.92 * clamp(this.dark, 0, 1)) * (1 - this.vanishK); }
  paintBack(ctx, world) {
    if (R.fl) return;
    // 그림자 웅덩이 (가라앉음 · 그림자 걸음 이동)
    const sk = Math.max(this.sink, this.state === 'shadowStep' && this.ghost ? 1 : 0);
    if (sk > 0.04) {
      const A = this.A, x = this.zx, t = this.t;
      ctx.save();
      ctx.fillStyle = `rgba(6,2,8,${(0.55 + 0.3 * sk).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(x, A.floor - 3, 46 + 30 * sk, 9 + 4 * sk, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) { const u = hash(i * 3.1 + Math.floor(t * 8)) - 0.5; glow(ctx, x + u * 90 * sk, A.floor - 5 - hash(i * 7.7) * 6, 9, CRIM_L, 0.5 * sk); }
      ctx.restore();
    }
    // 그믐: 어둠 속 붉은 눈 한 쌍 (숨어 있어도 보인다)
    if (this.dark > 0.4 && this.dying <= 0) paintEyes(ctx, this.toWorld(this.pts.eye.x, 0).x, this.toWorld(0, this.pts.eye.y).y, clamp((this.dark - 0.4) / 0.6, 0, 1) * (this.ghost && !(this.ec?.rise) ? 0.6 : 1));
  }
  paintBody(ctx, world, flash) {
    const a = this.bodyAlpha();
    if (a <= 0.01) return;
    const A = this.A, fl = R.fl;
    this.rig();
    ctx.save();
    ctx.beginPath(); ctx.rect(this.zx - 2000, -6000, 4000, A.floor + 6000); ctx.clip();   // 바닥 아래로는 그리지 않는다 (가라앉음)
    ctx.translate(this.zx, this.fy + this.sink * 170);
    ctx.scale(this.fk || 0.001, 1);
    ctx.globalAlpha *= a;
    if (flash) { ctx.globalAlpha *= 0.6; this.drawLegs(ctx, true); this.drawTorso(ctx, true); this.drawHead(ctx, true); this.drawArm(ctx, false, true); }
    else this.drawNemain(ctx, fl);
    ctx.restore();
  }
  paintFront(ctx, world) {
    if (R.fl) return;
    // 까마귀 떼 (그리는 수 = 품질 × 40, 최소 16)
    const F = this.flock;
    if (F.a > 0.01) {
      const n = flockN(world);
      ctx.save();
      ctx.globalAlpha *= clamp(F.a, 0, 1);
      for (let i = 0; i < n; i++) {
        const vx = F.mode === 'burst' || F.mode === 'up' ? F.vx[i] : Math.cos(F.ph[i] * 0.2);
        drawCrowV(ctx, F.x[i], F.y[i], vx >= 0 ? 1 : -1, Math.sin(F.ph[i]), 0.9 + hash(i * 3.3) * 0.5);
      }
      ctx.restore();
    }
    // 떨어진 단검 (굴복)
    if (this.daggersDown && this.dying > 0 && this.vanishK < 1) {
      ctx.save(); ctx.globalAlpha *= 1 - this.vanishK;
      for (const [dx, a] of [[24, -0.08], [40, 0.12]]) drawDagger(ctx, this.zx + this.facing * dx, this.fy - 3, a + (this.facing < 0 ? PI : 0), false);
      ctx.restore();
    }
  }
  /** 몸 전체 (지역 좌표: 원점 = 발 가운데, +x = 얼굴 쪽) */
  drawNemain(ctx, fl) {
    this.drawCloak(ctx, fl);
    this.drawArm(ctx, true, fl);
    this.drawLegs(ctx, fl);
    this.drawTorso(ctx, fl);
    this.drawHair(ctx, fl);
    this.drawHead(ctx, fl);
    this.drawCollar(ctx, fl);
    this.drawArm(ctx, false, fl);
  }
  /** 망토: 닫힘 = 어깨에서 뒤로 늘어져 바닥에 끌리는 깃털 자락 (물결) · 펼침 = 까마귀 날개처럼 위·뒤로 펼친 깃털 두 장 (몸 뒤) */
  drawCloak(ctx, fl) {
    const P = this.pts, s = this.ps, t = this.t, sp = clamp(s.spread, 0, 1);
    const sx = P.shN.x - 5, sy = P.shN.y - 3;
    if (sp > 0.03) { crowWing(ctx, sx, sy, sp, t, true, fl); crowWing(ctx, sx, sy, sp, t, false, fl); }
    // 늘어진 뒤판: 어깨 → 바닥 (뒤로 끌린다 — 걸음·물결·무릎)
    const kn = clamp(s.kneel, 0, 1), sw = Math.sin(t * 2.1) * 5 + this.walkK * 9 + s.sway * 10;
    const hemX = -46 - 28 * sp - this.walkK * 16 - 22 * kn, hemY = 0;
    const front = (u) => ({ x: lerp(sx + 3, P.hip.x - 2, Math.min(1, u * 1.4)) + sw * u * u * 0.4, y: lerp(sy + 4, -4, u) });
    const back = (u) => ({ x: lerp(sx - 10, hemX + sw, u) - Math.sin(u * PI) * 10, y: lerp(sy - 2, hemY - 6, u) });
    ctx.beginPath();
    let q = back(0); ctx.moveTo(q.x, q.y);
    for (let i = 1; i <= 8; i++) { q = back(i / 8); ctx.lineTo(q.x, q.y); }
    // 너덜너덜한 깃털 밑단 (뒤 → 앞)
    const b1 = back(1), f1 = front(1);
    for (let i = 1; i <= 9; i++) { const u = i / 9, x = lerp(b1.x, f1.x, u), y = lerp(b1.y, f1.y, u) + (i % 2 ? 4 + 5 * hash(i * 2.7) : -3); ctx.lineTo(x, y); }
    for (let i = 8; i >= 0; i--) { q = front(i / 8); ctx.lineTo(q.x, q.y); }
    ctx.closePath();
    ctx.fillStyle = fl ? '#fff' : LG(ctx, 'nm_cloak2', 0, -120, -40, 0, [0, '#1c1824', 0.45, '#120e16', 0.85, '#1e0a12', 1, '#3a0c16']);
    ctx.fill();
    if (fl) return;
    ctx.strokeStyle = 'rgba(6,3,8,0.9)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    // 겹친 깃털 비늘 (어깨에서 아래로 줄마다 작아진다) — 결정적 무늬
    ctx.lineWidth = 1;
    for (let r = 0; r < 6; r++) {
      const u = 0.08 + r * 0.15, fa = front(u), ba = back(u), n = 4;
      for (let k = 0; k < n; k++) {
        const v = (k + 0.5 + (r % 2) * 0.5) / (n + 0.5), x = lerp(ba.x, fa.x, v), y = lerp(ba.y, fa.y, v), L = 12 - r;
        ctx.strokeStyle = (k + r) % 3 ? 'rgba(110,120,170,0.22)' : 'rgba(150,40,60,0.3)';
        ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x - 4, y + L * 0.6, x - 1, y + L); ctx.quadraticCurveTo(x + 1, y + L * 0.5, x + 2, y); ctx.stroke();
      }
    }
    // 진홍 안감 (앞 가장자리) · 달빛 가장자리 (뒤)
    ctx.strokeStyle = rgba(CRIM, 0.8); ctx.lineWidth = 2.4;
    ctx.beginPath(); q = front(0); ctx.moveTo(q.x, q.y); for (let i = 1; i <= 8; i++) { q = front(i / 8); ctx.lineTo(q.x, q.y); } ctx.stroke();
    ctx.strokeStyle = rgba(MOON, 0.3); ctx.lineWidth = 1.2;
    ctx.beginPath(); q = back(0.05); ctx.moveTo(q.x, q.y); for (let i = 1; i <= 6; i++) { q = back(0.05 + i * 0.13); ctx.lineTo(q.x, q.y); } ctx.stroke();
    // 자락마다 깜빡이는 붉은 눈 (위아래 눈꺼풀이 감긴다)
    for (let i = 0; i < CLOAK_EYES.length; i++) {
      const E = CLOAK_EYES[i];
      const open = clamp(Math.sin(t * 0.9 + E.k) * 3 + 1.6, 0.05, 1);
      const fa = front(E.u), ba = back(E.u), x = lerp(ba.x, fa.x, 0.25 + E.v * 0.6), y = lerp(ba.y, fa.y, 0.5);
      ctx.fillStyle = '#08040a'; ctx.beginPath(); ctx.ellipse(x, y, 3.2 * E.s, 2 * E.s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(EYE, 0.95); ctx.beginPath(); ctx.ellipse(x, y, 2.4 * E.s, 1.3 * E.s * open + 0.15, 0, 0, TAU); ctx.fill();
      if (open > 0.5) { ctx.fillStyle = '#ffd0d8'; ctx.fillRect(x - 0.4, y - 0.4, 0.9, 0.9); glow(ctx, x, y, 7 * E.s, CRIM_L, 0.4 * open); }
    }
  }
  /** 다리: 가죽 넓적다리(끈 둘) · 무릎 덮개 달린 긴 장화(은 버클 · 굽) */
  drawLegs(ctx, fl) {
    const P = this.pts;
    for (const far of [true, false]) {
      const H = far ? { x: P.hip.x - 4, y: P.hip.y - 1 } : P.hip, K = far ? P.knF : P.knN, F = far ? P.ftF : P.ftN;
      const col = fl ? '#fff' : far ? '#0d0a10' : LEATH, boot = fl ? '#fff' : far ? '#09070b' : '#121016';
      limb(ctx, H.x, H.y, K.x, K.y, 8.5, 6.2, col, far ? null : LEATH_H);
      limb(ctx, K.x, K.y, F.x - 1, F.y - 6, 6.4, 5, boot, far ? null : '#4a4658');
      const a = Math.atan2(K.y - H.y, K.x - H.x), b = Math.atan2(F.y - K.y, F.x - K.x);
      // 발 (발가락 쪽 뾰족 · 굽)
      ctx.beginPath();
      ctx.moveTo(F.x - 6, F.y - 10); ctx.quadraticCurveTo(F.x + 4, F.y - 8, F.x + 15, F.y - 2); ctx.lineTo(F.x + 15, F.y); ctx.lineTo(F.x - 2, F.y);
      ctx.lineTo(F.x - 3, F.y - 1); ctx.lineTo(F.x - 6, F.y - 1); ctx.lineTo(F.x - 6, F.y); ctx.lineTo(F.x - 9, F.y); ctx.closePath();
      ink(ctx, boot, 1.3);
      if (fl || far) continue;
      // 넓적다리 끈 · 무릎 덮개 · 장화 버클
      ctx.strokeStyle = '#06040a'; ctx.lineWidth = 2;
      for (const u of [0.35, 0.62]) { const x = lerp(H.x, K.x, u), y = lerp(H.y, K.y, u); ctx.beginPath(); ctx.moveTo(x - Math.sin(a) * 8, y + Math.cos(a) * 8); ctx.lineTo(x + Math.sin(a) * 8, y - Math.cos(a) * 8); ctx.stroke(); ctx.fillStyle = SILV; ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8); }
      ctx.beginPath(); ctx.ellipse(K.x + 1, K.y, 6.5, 5, b, 0, TAU); ink(ctx, '#1a1820', 1.1);
      const bx = lerp(K.x, F.x, 0.55), by = lerp(K.y, F.y, 0.55);
      ctx.strokeStyle = SILV; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx - Math.sin(b) * 5.5, by + Math.cos(b) * 5.5); ctx.lineTo(bx + Math.sin(b) * 5.5, by - Math.cos(b) * 5.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,210,235,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(K.x + 3, K.y + 4); ctx.lineTo(F.x + 3, F.y - 10); ctx.stroke();
    }
  }
  /** 몸통: 가는 허리 · 가슴 곡선의 가죽 암살복 (끈 셋 · 은 버클 · 가슴 끈 교차) + 목 (까마귀 문신) */
  drawTorso(ctx, fl) {
    const P = this.pts, H = P.hip, N = P.neck, ta = P.tA;
    const c = Math.cos(ta), s = Math.sin(ta);
    const at = (u, side) => ({ x: lerp(H.x, N.x, u) + c * side, y: lerp(H.y, N.y, u) + s * side });
    const f0 = at(0, 9), f1 = at(0.38, 6.5), f2 = at(0.72, 12), f3 = at(0.95, 6), b3 = at(1, -7), b2 = at(0.62, -9), b1 = at(0.22, -8), b0 = at(0, -12);
    // 엉덩이
    ctx.beginPath(); ctx.ellipse(H.x - 2, H.y + 3, 12.5, 10, ta, 0, TAU); ink(ctx, fl ? '#fff' : LEATH, 1.3);
    ctx.beginPath();
    ctx.moveTo(f0.x, f0.y); ctx.quadraticCurveTo(f1.x - 1, f1.y, f2.x, f2.y); ctx.quadraticCurveTo(f3.x + 7, f3.y + 2, f3.x, f3.y);
    ctx.lineTo(b3.x, b3.y); ctx.quadraticCurveTo(b2.x - 3, b2.y, b1.x, b1.y); ctx.quadraticCurveTo(b0.x - 4, b0.y - 4, b0.x, b0.y); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'nm_torso2', -10, -125, 12, -80, [0, '#4a4458', 0.35, LEATH_H, 0.7, LEATH, 1, '#0a080e']), 1.6);
    if (fl) return;
    // 가죽 판 이음선 · 끈 셋 (은 버클) · 가슴을 가로지르는 끈
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2;
    for (const u of [0.16, 0.36, 0.56]) { const a0 = at(u, 9.5), a1 = at(u, -8.5); ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.stroke(); const q = at(u, 5.5); ctx.fillStyle = SILV; ctx.fillRect(q.x - 2.2, q.y - 1.8, 4.4, 3.6); ctx.fillStyle = '#2a2830'; ctx.fillRect(q.x - 0.9, q.y - 0.8, 1.8, 1.6); }
    const x0 = at(0.92, 7), x1 = at(0.62, -8), x2 = at(0.92, -6), x3 = at(0.64, 9);
    ctx.strokeStyle = '#08060c'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x0.x, x0.y); ctx.lineTo(x1.x, x1.y); ctx.moveTo(x2.x, x2.y); ctx.lineTo(x3.x, x3.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,210,240,0.28)'; ctx.lineWidth = 1;   // 가죽 광택 (앞 · 가슴)
    ctx.beginPath(); ctx.moveTo(f1.x - 2, f1.y); ctx.quadraticCurveTo(f2.x - 2, f2.y, f3.x - 2, f3.y + 2); ctx.stroke();
    ctx.strokeStyle = rgba(MOON, 0.35); ctx.lineWidth = 1.2;   // 등쪽 달빛 가장자리
    ctx.beginPath(); ctx.moveTo(b3.x, b3.y + 2); ctx.quadraticCurveTo(b2.x - 3, b2.y, b1.x, b1.y); ctx.stroke();
    // 목 (창백한 피부 + 까마귀 문신 — 날개 편 새 모양 줄)
    const n0 = at(1, 0), hd = P.head;
    ctx.beginPath(); ctx.moveTo(n0.x - 4, n0.y + 2); ctx.lineTo(hd.x - 5, hd.y + 6); ctx.lineTo(hd.x + 2, hd.y + 8); ctx.lineTo(n0.x + 4, n0.y + 1); ctx.closePath();
    ink(ctx, SKIN_D, 1.1);
    ctx.strokeStyle = '#140a12'; ctx.lineWidth = 1;
    ctx.beginPath();
    const tx = lerp(n0.x, hd.x, 0.45) - 1, ty = lerp(n0.y, hd.y, 0.45) + 3;
    ctx.moveTo(tx - 3.5, ty - 1.5); ctx.lineTo(tx, ty + 1); ctx.lineTo(tx + 3.5, ty - 1.5); ctx.moveTo(tx, ty + 1); ctx.lineTo(tx, ty + 3.5);
    ctx.moveTo(tx - 2.5, ty - 4.5); ctx.lineTo(tx, ty - 2.5); ctx.lineTo(tx + 2.5, ty - 4.5);
    ctx.stroke();
  }
  /** 은빛이 섞인 긴 머리 (머리 뒤로 흘러내려 어깨까지 — 걸음·흔들림) */
  drawHair(ctx, fl) {
    const P = this.pts, h = P.head, t = this.t, sw = Math.sin(t * 2.3) * 2.5 + this.walkK * 5 + (this.ps.bow > 0.3 ? 3 : 0);
    const ox = h.x - 4, oy = h.y - 10;
    ctx.beginPath();
    ctx.moveTo(ox + 4, oy - 1);
    ctx.quadraticCurveTo(ox - 13, oy, ox - 14 - sw * 0.4, oy + 16);
    ctx.quadraticCurveTo(ox - 17 - sw, oy + 32, ox - 12 - sw * 1.3, oy + 40);
    ctx.lineTo(ox - 9 - sw, oy + 33); ctx.lineTo(ox - 7 - sw * 0.8, oy + 38);
    ctx.quadraticCurveTo(ox - 5, oy + 22, ox + 1, oy + 12);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'nm_hair2', 0, -150, -8, -100, [0, '#d8dce8', 0.45, HAIR, 1, HAIR_D]), 1.1);
    if (fl) return;
    ctx.strokeStyle = 'rgba(30,28,40,0.55)'; ctx.lineWidth = 0.9;   // 검은 가닥
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(ox - 2 - i * 3, oy + 2); ctx.quadraticCurveTo(ox - 9 - i * 2.4 - sw * 0.6, oy + 16, ox - 9 - i * 1.6 - sw, oy + 30 + (i % 2) * 5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(240,244,255,0.5)'; ctx.lineWidth = 0.8;   // 달빛 가닥
    ctx.beginPath(); ctx.moveTo(ox - 4, oy + 1); ctx.quadraticCurveTo(ox - 11 - sw * 0.5, oy + 12, ox - 12 - sw, oy + 26); ctx.stroke();
  }
  /** 머리: 가면(정수리·눈·코를 덮고 앞아래로 휜 긴 부리, 아래 가장자리는 이빨처럼 갈라진다, 금이 커진다) / 맨얼굴(남은 옻칠 조각 · 붉은 눈 · 흉터) */
  drawHead(ctx, fl) {
    const P = this.pts, h = P.head, ha = P.hA, t = this.t;
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(ha); ctx.scale(0.86, 0.86);
    // 얼굴 옆모습 (이마 → 코 → 입술 → 턱 → 목)
    ctx.beginPath();
    ctx.moveTo(-8, -12); ctx.quadraticCurveTo(4, -15, 8, -9); ctx.lineTo(9.5, -6); ctx.lineTo(13.5, 0); ctx.lineTo(10.2, 1.2); ctx.lineTo(10.6, 3.4); ctx.lineTo(9.6, 4.6);
    ctx.lineTo(10.2, 6.4); ctx.quadraticCurveTo(9.4, 10.5, 5, 11.6); ctx.quadraticCurveTo(-1, 12.5, -5, 10); ctx.quadraticCurveTo(-11, 6, -11, -2); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'nm_face', -10, -6, 12, 8, [0, SKIN_D, 0.45, SKIN, 1, '#f6eeee']), 1.3);
    if (!fl) {
      ctx.fillStyle = '#24101a'; ctx.beginPath(); ctx.moveTo(9.4, 4.8); ctx.quadraticCurveTo(10.6, 5.2, 10.1, 6.3); ctx.lineTo(8.4, 5.8); ctx.closePath(); ctx.fill();   // 검붉은 입술
      ctx.strokeStyle = 'rgba(120,90,110,0.5)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1, 4); ctx.quadraticCurveTo(4, 8, 8, 9.6); ctx.stroke();   // 광대 그늘
      ctx.strokeStyle = rgba(MOON, 0.45); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-10, -4); ctx.quadraticCurveTo(-11, 6, -4, 10.5); ctx.stroke();
    }
    if (this.masked) {
      // 부리 반가면: 정수리·눈·코를 덮고, 앞아래로 휜 긴 검은 부리
      ctx.beginPath();
      ctx.moveTo(-11, -3); ctx.quadraticCurveTo(-12.5, -16.5, -1, -17); ctx.quadraticCurveTo(9, -16.5, 11, -8);
      ctx.quadraticCurveTo(19, -5, 26, 2); ctx.quadraticCurveTo(31, 7, 30, 12); ctx.quadraticCurveTo(26, 6, 20, 4.5); ctx.quadraticCurveTo(15, 3.5, 11, 3.2);
      // 아래 가장자리: 이빨처럼 갈라진 옻칠
      for (let i = 0; i < 5; i++) { const x = 9 - i * 4; ctx.lineTo(x, 1.5 + (i % 2 ? 4 : 0)); }
      ctx.lineTo(-11, 1); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'nm_mask2', 0, -17, 4, 8, [0, LACQ_H, 0.3, '#24222e', 0.7, '#0e0c14', 1, LACQ]), 1.4);
      if (!fl) {
        // 부리 능선 · 콧구멍 · 눈 둘레 깃 무늬
        ctx.strokeStyle = 'rgba(210,220,245,0.5)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(10, -7.5); ctx.quadraticCurveTo(20, -4, 28.5, 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, -14.5); ctx.quadraticCurveTo(4, -15.5, 9, -10); ctx.stroke();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(15.5, -1.5, 1.8, 0.8, 0.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(-2 + i * 1.6, -11.5 + i * 0.4); ctx.lineTo(-4 + i * 1.6, -9 + i * 0.4); } ctx.stroke();
        // 눈구멍 + 붉은 빛
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(4, -6.5, 3.6, 2.2, 0.15, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(120,130,160,0.6)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(4, -6.5, 4.4, PI * 1.1, PI * 1.95); ctx.stroke();
        ctx.fillStyle = EYE; ctx.beginPath(); ctx.arc(5, -6.4, 1.5, 0, TAU); ctx.fill();
        glow(ctx, 5, -6.4, 9, CRIM_L, 0.65 + 0.2 * Math.sin(t * 5));
        ctx.fillStyle = '#ffd0d8'; ctx.fillRect(5.2, -7.1, 1, 1);
        // 금 (손상 단계)
        ctx.strokeStyle = 'rgba(255,90,110,0.75)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(2, -17); ctx.lineTo(0, -13); ctx.lineTo(2.5, -10.5); ctx.lineTo(1, -8.5);
        if (this.dmg >= 1) { ctx.moveTo(11, -6); ctx.lineTo(16, -2.5); ctx.lineTo(21, -1); ctx.lineTo(24, 3); ctx.moveTo(-8, -10); ctx.lineTo(-4, -12.5); ctx.lineTo(-1, -11); ctx.moveTo(0, -13); ctx.lineTo(-4, -15.5); }
        ctx.stroke();
      }
    } else {
      // 깨진 가면의 남은 조각 (정수리 쪽 옻칠 모자 — 앞이 들쭉날쭉 깨졌다)
      ctx.beginPath(); ctx.moveTo(-11, -5); ctx.quadraticCurveTo(-12.5, -17, -1, -17); ctx.quadraticCurveTo(8, -17, 10, -12); ctx.lineTo(6, -12.5); ctx.lineTo(7, -10); ctx.lineTo(3, -11); ctx.lineTo(1, -8.5); ctx.lineTo(-3, -10.5); ctx.lineTo(-6, -7.5); ctx.closePath();
      ink(ctx, fl ? '#fff' : LG(ctx, 'nm_cap', 0, -17, 0, -6, [0, LACQ_H, 0.4, '#1a1822', 1, LACQ]), 1.2);
      if (!fl) {
        ctx.strokeStyle = 'rgba(210,220,245,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, -14.5); ctx.quadraticCurveTo(2, -16, 7, -13); ctx.stroke();
        // 눈 (흰자 · 리아와 같은 붉은 눈동자) · 눈썹 · 피눈물 흉터
        ctx.fillStyle = '#fff4f4'; ctx.beginPath(); ctx.moveTo(2.5, -5.5); ctx.quadraticCurveTo(5.5, -7.6, 8.4, -5.6); ctx.quadraticCurveTo(5.5, -4, 2.5, -5.5); ctx.fill();
        ctx.fillStyle = EYE; ctx.beginPath(); ctx.arc(6.2, -5.6, 1.45, 0, TAU); ctx.fill();
        glow(ctx, 6.2, -5.6, 10, CRIM_L, 0.6 + 0.25 * Math.sin(t * 4));
        ctx.strokeStyle = '#1e0c14'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(2, -8.4); ctx.quadraticCurveTo(5.5, -9.6, 9, -7.8); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,10,24,0.85)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(5, -4.2); ctx.lineTo(3.6, 1); ctx.lineTo(4.2, 5.5); ctx.moveTo(6.8, -4); ctx.lineTo(7.4, -0.5); ctx.moveTo(3, -9.5); ctx.lineTo(4.4, -6.8); ctx.stroke();
      }
    }
    ctx.restore();
  }
  /** 어깨를 덮는 깃털 깃 (몸 앞, 겹겹이) */
  drawCollar(ctx, fl) {
    const P = this.pts, sx = P.shN.x - 1, sy = P.shN.y - 3, t = this.t;
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 6; i++) {
        const a = -2.75 + i * 0.36 + r * 0.18 + Math.sin(t * 2 + i + r) * 0.03, L = (r ? 11 : 15) + 4 * Math.sin(i * 1.3);
        featherBlade(ctx, sx - 3 + i * 1.3, sy + 1 + r * 3, a + PI, L, r ? 3.6 : 4.6, fl ? '#fff' : (i + r) % 2 ? BLK : '#1e1a28', !fl && r === 0 && i % 3 === 0 ? CRIM : null);
      }
    }
  }
  /** 팔: 위팔(겹친 어깨받이 + 까마귀 해골 장식) · 아래팔(은 버클 팔찌 셋) · 창백한 주먹(손등 문신) · 까마귀 부리 단검 */
  drawArm(ctx, far, fl) {
    const P = this.pts, S = far ? P.shF : P.shN, E = far ? P.elF : P.elN, H = far ? P.hdF : P.hdN, D = far ? P.dgF : P.dgN;
    const col = fl ? '#fff' : far ? '#0d0a10' : LEATH;
    const ua = Math.atan2(E.y - S.y, E.x - S.x), fa = Math.atan2(H.y - E.y, H.x - E.x);
    limb(ctx, S.x, S.y, E.x, E.y, 5.4, 4.6, col, far ? null : LEATH_H);
    limb(ctx, E.x, E.y, H.x, H.y, 4.6, 4, col, far ? null : LEATH_H);
    if (!far && !fl) {
      // 아래팔 팔찌 (은 버클 셋)
      for (const u of [0.3, 0.52, 0.74]) {
        const x = lerp(E.x, H.x, u), y = lerp(E.y, H.y, u), nx = -Math.sin(fa), ny = Math.cos(fa);
        ctx.strokeStyle = '#06040a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x + nx * 4.6, y + ny * 4.6); ctx.lineTo(x - nx * 4.6, y - ny * 4.6); ctx.stroke();
        ctx.fillStyle = SILV; ctx.fillRect(x - nx * 2.6 - 1, y - ny * 2.6 - 1, 2, 2);
      }
      // 겹친 어깨받이 (판 셋) + 까마귀 해골
      for (let k = 2; k >= 0; k--) {
        const x = S.x + Math.cos(ua) * (k * 3.4), y = S.y + Math.sin(ua) * (k * 3.4);
        ctx.beginPath(); ctx.ellipse(x, y, 8.2 - k * 1.2, 5.6 - k * 0.6, ua, PI, TAU); ctx.closePath();
        ink(ctx, k ? '#24202c' : '#36303e', 1.1);
      }
      ctx.fillStyle = '#d8d4dc'; ctx.beginPath(); ctx.ellipse(S.x, S.y - 1.5, 2.6, 2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(S.x + 2, S.y - 1.8); ctx.lineTo(S.x + 5, S.y - 0.5); ctx.lineTo(S.x + 2, S.y - 0.2); ctx.fill();
      ctx.fillStyle = EYE; ctx.fillRect(S.x - 0.2, S.y - 2.2, 1.2, 1.2);
    }
    // 단검 (주먹 → 칼끝) — 굴복에서 떨어진 뒤에는 없다
    if (!this.daggersDown) {
      const a = Math.atan2(D.y - H.y, D.x - H.x);
      ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(a);
      drawBlade(ctx, fl, far);
      ctx.restore();
    }
    // 창백한 주먹 (손가락 마디 · 손등 문신)
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(fa);
    ctx.beginPath(); ctx.moveTo(-3.5, -3.8); ctx.quadraticCurveTo(3.5, -4.6, 4.8, -1.5); ctx.quadraticCurveTo(5.4, 2.6, 2.4, 3.9); ctx.lineTo(-3.2, 3.6); ctx.quadraticCurveTo(-4.8, 0, -3.5, -3.8); ctx.closePath();
    ink(ctx, fl ? '#fff' : far ? SKIN_D : SKIN, 1.1);
    if (!fl && !far) {
      ctx.strokeStyle = 'rgba(90,70,80,0.6)'; ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(3.4 - i * 0.2, -2.6 + i * 2); ctx.lineTo(4.6, -2.2 + i * 2); } ctx.stroke();
      ctx.strokeStyle = '#14080e'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1.5, -1.5); ctx.lineTo(0, 0.2); ctx.lineTo(1.5, -1.5); ctx.moveTo(0, 0.2); ctx.lineTo(0, 2); ctx.stroke();
    }
    ctx.restore();
  }
}

// ═════════════════════════════ 그리기 도우미 ═════════════════════════════
const OUTL = 'rgba(6,3,8,0.9)';
/** 끝이 가는 팔다리 (외곽선 + 위쪽 광택) */
function limb(ctx, x0, y0, x1, y1, r0, r1, col, hi) {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
  ctx.beginPath();
  ctx.moveTo(x0 + nx * r0, y0 + ny * r0); ctx.lineTo(x1 + nx * r1, y1 + ny * r1);
  ctx.arc(x1, y1, r1, a + PI / 2, a - PI / 2, true);
  ctx.lineTo(x0 - nx * r0, y0 - ny * r0);
  ctx.arc(x0, y0, r0, a - PI / 2, a + PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = OUTL; ctx.lineWidth = 1.5; ctx.stroke();
  if (hi) { ctx.strokeStyle = rgba(hi, 0.9); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0 - nx * r0 * 0.5, y0 - ny * r0 * 0.5); ctx.lineTo(x1 - nx * r1 * 0.5, y1 - ny * r1 * 0.5); ctx.stroke(); }
}
/** 깃털 한 장 (뿌리 x,y → 각 a, 길이 L, 폭 w) — 안감 색(lin)이 있으면 한쪽 가장자리를 진홍으로 */
function featherBlade(ctx, x, y, a, L, w, col, lin) {
  const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  const tx = x + c * L, ty = y + s * L;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + c * L * 0.5 + nx * w, y + s * L * 0.5 + ny * w, tx, ty);
  ctx.quadraticCurveTo(x + c * L * 0.5 - nx * w * 0.6, y + s * L * 0.5 - ny * w * 0.6, x, y);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  if (col === '#fff') return;
  ctx.strokeStyle = OUTL; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(110,120,170,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  if (lin) { ctx.strokeStyle = rgba(lin, 0.55); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x + nx * 1.5, y + ny * 1.5); ctx.quadraticCurveTo(x + c * L * 0.5 + nx * w * 0.8, y + s * L * 0.5 + ny * w * 0.8, tx, ty); ctx.stroke(); }
}
/** 펼친 까마귀 날개 (어깨 sx,sy 뿌리, 펼침 sp): 뼈대 능선 + 칼깃 8 (끝으로 갈수록 뼈 방향, 뿌리 쪽은 아래로 늘어진다) + 덮깃 6.
 *  먼 쪽은 어둡게 뒤·위로, 가까운 쪽은 앞·위로 (둘 다 몸 뒤에 그린다) */
function crowWing(ctx, sx, sy, sp, t, far, fl) {
  const a = (far ? lerp(1.9, -2.5, sp) : lerp(1.3, -0.85, sp)) + Math.sin(t * 3.1 + (far ? 0.6 : 0)) * 0.06 * sp;
  const L1 = 46 * (0.35 + 0.65 * sp), k = 0.35 + 0.65 * sp;
  const wx = sx + Math.cos(a) * L1, wy = sy + Math.sin(a) * L1;   // 손목
  // 뼈에 수직이면서 아래를 향한 방향 (깃이 늘어지는 쪽)
  const p1 = a + PI / 2, p2 = a - PI / 2, down = Math.sin(p1) > Math.sin(p2) ? p1 : p2;
  const turn = (from, to, u) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * u;
  const col = fl ? '#fff' : far ? '#0c0a10' : BLK, col2 = fl ? '#fff' : far ? '#110d17' : '#1e1a28';
  for (let i = 7; i >= 0; i--) {
    const u = i / 7, ox = lerp(sx, wx, 0.3 + 0.7 * u), oy = lerp(sy, wy, 0.3 + 0.7 * u);
    const fa = turn(a, down, 0.85 - 0.6 * u) + Math.sin(t * 2 + i) * 0.02;
    featherBlade(ctx, ox, oy, fa, (34 + 30 * u) * k, 6.5, col, !fl && !far && i % 3 === 1 ? CRIM : null);
  }
  for (let i = 0; i < 6; i++) {
    const u = (i + 0.5) / 6, ox = lerp(sx, wx, u), oy = lerp(sy, wy, u);
    featherBlade(ctx, ox, oy, turn(a, down, 0.7), 15 * k, 5, col2, null);
  }
  if (!fl) { ctx.strokeStyle = far ? 'rgba(60,64,90,0.6)' : 'rgba(150,160,200,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(wx, wy); ctx.stroke(); }
}
/** 까마귀 부리 단검 칼날 (원점 = 주먹, +x = 칼끝) */
function drawBlade(ctx, fl, far) {
  ctx.beginPath();
  ctx.moveTo(2, -2.4); ctx.quadraticCurveTo(20, -4.5, DAG, 1.5); ctx.quadraticCurveTo(20, 1.5, 2, 2.4); ctx.closePath();
  ink(ctx, fl ? '#fff' : far ? '#141218' : '#1c1a22', 1.2);
  if (fl) return;
  ctx.strokeStyle = far ? '#5a5a66' : SILV; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(4, -2.2); ctx.quadraticCurveTo(20, -4.2, DAG - 1, 1.2); ctx.stroke();
  ctx.fillStyle = far ? '#5a5a66' : SILV; ctx.fillRect(-1, -3.5, 2.4, 7);   // 날밑
}
/** 바닥에 떨어진 단검 (월드 좌표) */
function drawDagger(ctx, x, y, a, fl) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.translate(-DAG * 0.45, 0);
  drawBlade(ctx, fl, false);
  ctx.fillStyle = '#2a2430'; ctx.fillRect(-9, -2, 9, 4); ctx.fillStyle = SILV; ctx.beginPath(); ctx.arc(-10, 0, 2.2, 0, TAU); ctx.fill();
  ctx.restore();
}
/** 벡터 까마귀 (월드 좌표, dir ±1, flap −1..1, 크기 s) */
export function drawCrowV(ctx, x, y, dir, flap, s = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(dir * s, s);
  ctx.fillStyle = BLK;
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 5, -0.1, 0, TAU); ctx.fill();   // 몸
  ctx.beginPath(); ctx.arc(9, -2, 4.2, 0, TAU); ctx.fill();   // 머리
  ctx.beginPath(); ctx.moveTo(12, -3); ctx.lineTo(19, -1); ctx.lineTo(12, 0.5); ctx.closePath(); ctx.fill();   // 부리
  ctx.beginPath(); ctx.moveTo(-8, -1); ctx.lineTo(-17, -3); ctx.lineTo(-16, 3); ctx.closePath(); ctx.fill();   // 꼬리
  const wy = -16 * flap;   // 날개 (위 ↔ 아래)
  ctx.fillStyle = '#1c1826';
  ctx.beginPath(); ctx.moveTo(-3, -2); ctx.quadraticCurveTo(-6, wy * 0.6 - 2, -12, wy); ctx.lineTo(-2, wy * 0.45); ctx.lineTo(5, -2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = CRIM_L; ctx.fillRect(10, -3.5, 1.6, 1.6);   // 붉은 눈
  ctx.restore();
}
/** 지대(급습·둥지 고리)의 까마귀: 채색 퍼핏이 준비됐으면 그 까마귀 그림(날개 위/아래 두 장), 아니면 벡터 */
const CROW_W = 46;   // 크기 1 의 까마귀 폭 (월드 px)
function drawCrow(ctx, w, x, y, dir, flap, s = 1) {
  const rig = paintedEnabled?.(w?.game) ? paintedRig?.('b_nemain') : null;
  const p = rig?.parts?.[flap > 0 ? 'crowU' : 'crowD'];
  const im = p?.v?.base;
  if (im && p.c) {
    const k = (CROW_W * s) / Math.max(1, p.w - p.pad * 2);
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * k, k); ctx.drawImage(im, -p.c[0], -p.c[1]); ctx.restore();
    return;
  }
  drawCrowV(ctx, x, y, dir, flap, s);
}
/** 깃털 비수 탄 (진행 방향, 원점 = 탄 중심) */
function featherRender(ctx, p) {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  glowE(ctx, -4, 0, 18, 7, CRIM, 0.45);
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.quadraticCurveTo(0, -5, -14, -1.5); ctx.lineTo(-12, 0); ctx.lineTo(-14, 1.5); ctx.quadraticCurveTo(0, 5, 14, 0); ctx.closePath();
  ctx.fillStyle = '#0e0a12'; ctx.fill(); ctx.strokeStyle = CRIM_L; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,200,210,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-13, 0); ctx.stroke();
}
/** 붉은 눈 한 쌍 (그믐) */
function paintEyes(ctx, x, y, a) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const dx of [-5, 5]) { glow(ctx, x + dx, y, 16, CRIM_L, 0.75 * a); glow(ctx, x + dx, y, 4, '#ffffff', 0.85 * a, true); }
  ctx.restore();
}
/** 까마귀 급습: 출발 전 = 하늘에서 맴도는 까마귀 (lock 뒤 0.6초 조준선), 출발 뒤 = 선을 따라 내리꽂는 까마귀 + 꼬리 */
function paintDiver(ctx, z, w, path, lock, x, y) {
  const t = z.t;
  if (!z.started) {
    const hover = Math.sin(t * 9 + path.seed) * 3;
    if (t >= lock) warnLine(ctx, x, y, path.x1, path.y1, clamp((t - lock) / 0.6, 0, 1), CRIM_L, 2.5);
    drawCrow(ctx, w, x, y + hover, path.dx >= 0 ? 1 : -1, Math.sin(t * 14 + path.seed), 1.25);
    glow(ctx, x + 6 * Math.sign(path.dx || 1), y - 3 + hover, 8, CRIM_L, 0.6);
    return;
  }
  const L = z.line, f = 1 - z.a * 0.4;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(CRIM, 0.5 * f); ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(L.x0 - path.dx * 60, L.y0 - path.dy * 60); ctx.lineTo(L.x1, L.y1); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  drawCrow(ctx, w, L.x1, L.y1, path.dx >= 0 ? 1 : -1, -0.6, 1.3);
}
/** 십자 베기 잔상 (지대 사각형 안) */
function paintSlash(ctx, z, f, up) {
  const k = clamp(z.t / Math.max(0.01, z.dur), 0, 1), a = 1 - k;
  const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [lw, col, al] of [[14, CRIM, 0.45], [4, '#ffe0e6', 0.9]]) {
    ctx.strokeStyle = rgba(col, al * a); ctx.lineWidth = lw;
    ctx.beginPath();
    if (up) { ctx.moveTo(cx - f * z.w * 0.45, cy + z.h * 0.4); ctx.quadraticCurveTo(cx, cy - z.h * 0.1, cx + f * z.w * 0.45, cy - z.h * 0.45); }
    else { ctx.moveTo(cx - f * z.w * 0.45, cy - z.h * 0.4); ctx.quadraticCurveTo(cx, cy + z.h * 0.1, cx + f * z.w * 0.45, cy + z.h * 0.45); }
    ctx.stroke();
  }
}
/** 비석 없는 무덤: 예고 = 던진 단검이 날아가 바닥에 비석처럼 꽂힌다 + 바닥 표식 → 판정 = 그림자 칼날 기둥 */
function paintGrave(ctx, z, w, x, top, bot, from, seed) {
  const fly = 0.32;
  if (!z.started) {
    if (z.t < fly) {
      const k = z.t / fly, px = lerp(from.x, x, k), py = lerp(from.y, bot - 18, k) - Math.sin(k * PI) * 120;
      ctx.save(); ctx.translate(px, py); ctx.rotate(k * 9 + seed); ctx.translate(-DAG / 2, 0); drawBlade(ctx, false, false); ctx.restore();
      return;
    }
    warnFloor(ctx, x, bot, 76, z.k, CRIM_L, w.time);
    // 비석처럼 꽂힌 단검 (칼날은 땅속, 자루·날밑이 위로)
    ctx.save(); ctx.translate(x, bot - 2); ctx.rotate(PI / 2 + Math.sin(seed) * 0.12);
    ctx.translate(-DAG + 14, 0); drawBlade(ctx, false, false);
    ctx.restore();
    ctx.fillStyle = '#2a2430'; ctx.fillRect(x - 2, bot - 26, 4, 12); ctx.fillStyle = SILV; ctx.fillRect(x - 6, bot - 15, 12, 2.4);
    ctx.beginPath(); ctx.arc(x, bot - 27, 2.6, 0, TAU); ctx.fill();
    if (z.k > 0.6) glow(ctx, x, bot - 16, 22, CRIM_L, (z.k - 0.6) * 1.6);
    return;
  }
  const f = 1 - z.a;
  glowE(ctx, x, (top + bot) / 2, 34, (bot - top) / 2, CRIM, 0.55 * f);
  ctx.fillStyle = rgba('#08040a', 0.9 * f);
  ctx.beginPath(); ctx.moveTo(x - 22, bot); ctx.lineTo(x - 6, top + 18); ctx.lineTo(x, top); ctx.lineTo(x + 6, top + 18); ctx.lineTo(x + 22, bot); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(CRIM_L, 0.85 * f); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 22, bot); ctx.lineTo(x - 6, top + 18); ctx.lineTo(x, top); ctx.lineTo(x + 6, top + 18); ctx.lineTo(x + 22, bot); ctx.stroke();
}
/** 둥지 고리 판정: 고리 띠(반지름 r, 두께 36) 안이고 틈(70°) 밖이면 플레이어 판정 상자 */
const NONE = [];
export function cageRects(z, cg) {
  const p = z.world?.player;
  if (!p || p.dead) return NONE;
  const hb = p.hurtbox(), x = cg.cx, y = cg.cy, r = cg.r, th = 36;
  const px = clamp(x, hb.x, hb.x + hb.w), py = clamp(y, hb.y, hb.y + hb.h);
  const fx = x < hb.x + hb.w / 2 ? hb.x + hb.w : hb.x, fy = y < hb.y + hb.h / 2 ? hb.y + hb.h : hb.y;
  const dn = Math.hypot(px - x, py - y), df = Math.hypot(fx - x, fy - y);
  if (r + th / 2 < dn || r - th / 2 > df) return NONE;
  if (cageInGap(cg, Math.atan2(hb.y + hb.h / 2 - y, hb.x + hb.w / 2 - x))) return NONE;
  return [hb];
}
export function cageInGap(cg, ang) { const d = Math.abs(Math.atan2(Math.sin(ang - cg.gap), Math.cos(ang - cg.gap))); return d < (70 * PI / 180) / 2; }
/** 둥지 고리 그림: 고리를 따라 도는 까마귀들 + 진홍 깃털 빛의 틈 (예고 중에는 흐린 원과 틈 표시) */
function paintCage(ctx, cg, k, w, warn) {
  const n = flockN(w), r = warn ? 300 : cg.r, t = w?.time ?? 0;
  ctx.save();
  if (warn) {
    ctx.strokeStyle = rgba(CRIM_L, 0.35 * k); ctx.lineWidth = 3; ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.arc(cg.cx, cg.cy, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  const gw = 70 * PI / 180, gap = warn ? cg.g0 : cg.gap;
  // 틈: 진홍 깃털 빛
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(CRIM_L, (warn ? 0.4 : 0.6) * k); ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(cg.cx, cg.cy, r, gap - gw / 2, gap + gw / 2); ctx.stroke();
  glow(ctx, cg.cx + Math.cos(gap) * r, cg.cy + Math.sin(gap) * r, 40, CRIM_L, 0.5 * k);
  ctx.globalCompositeOperation = 'source-over';
  if (!warn) {
    // 띠 (어둡게) + 까마귀
    ctx.strokeStyle = 'rgba(10,6,14,0.45)'; ctx.lineWidth = 30;
    ctx.beginPath(); ctx.arc(cg.cx, cg.cy, r, gap + gw / 2, gap - gw / 2 + TAU); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, a = gap + gw / 2 + u * (TAU - gw) + Math.sin(t * 3 + i) * 0.02;
      const rr = r + Math.sin(t * 7 + i * 1.9) * 8;
      drawCrow(ctx, w, cg.cx + Math.cos(a) * rr, cg.cy + Math.sin(a) * rr, Math.sin(a) >= 0 ? -1 : 1, Math.sin(t * 16 + i * 2.1), 0.95);
    }
  }
  ctx.restore();
}

/** 벡터 그림 컬링 대리 개체 (e_argen.js 와 같은 방식): 보스의 artBounds() 를 사각형으로 삼아 보스 draw 를 대신 부른다 */
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
