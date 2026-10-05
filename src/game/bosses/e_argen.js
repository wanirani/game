// 보스 b_argen — 아르겐, 공허에 물든 은룡 (s21 외전 「하늘 정원의 용」) — docs/specs/ex_s21.md §2. 소유: EX-BOSS
// BossC(c_common.js) 상속. 그림은 벡터(2부 기준 디테일); 채색 퍼핏(render/painted/bosses/b_argen.js)은 이 논리를 읽기만 한다.
//
// 모습: 옆모습의 거대한 은빛 하늘 용 (머리 쪽 = facing). 긴 S자 목, 뒤로 뻗은 상아색 뿔, 은빛 비늘과 상아색 배 비늘,
//   막이 은청색으로 비치는 두 날개(가까운 날개는 몸 앞, 먼 날개는 몸 뒤), 지느러미 꼬리. 등·목·꼬리·날개·머리에 검보라 공허 결정이
//   돋아 있고(2페이즈에서 더 자란다), 가슴에 공허의 핵이 박혀 있다(2페이즈부터 비늘이 벌어져 드러남 = 약점).
//   3페이즈 전환(awaken)에서 날개·머리 결정 일부가 깨지며 은빛이 돌아오고, 체력 0 이면 핵이 부서지고 '정화'된다 (죽지 않는다).
// 판정 부위 (가까운 부위 우선, 목록 순서 = 겹칠 때 우선순위): 공허 핵 (2페이즈+, 0.75 · 크게 열리면 0.45) · 머리 (1.0) ·
//   목 (1.05) · 몸통 (1.15) · 가까운 날개 (1.3, 접으면 없음) · 꼬리 (1.2). 숨은 동안(vanish) 판정 없음.
// 패턴 (static PATTERNS): breath(은빛 번개 숨결, 바닥을 가로로 쓴다) · dive(급강하 돌진) · gust(날개 돌풍, 방의 wind 기믹) ·
//   crystals(공허 결정 비) · tail(꼬리 휩쓸기, 2페이즈+ 높은 되휩쓸기) · vanish(하늘로 사라졌다 내리꽂기, 2페이즈+) ·
//   coreBurst(공허 핵 노출 — 약점 창 + 공허 고리, 2페이즈+) · storm(은빛 번개 비행, 3페이즈) · 보조 stagger(핵을 세게 맞으면 추락).
//   전환 corrupt(1: 결정이 자라고 핵이 드러남, 곧바로 coreBurst) · awaken(2: 결정이 깨지며 은빛, 이름 교체, 곧바로 storm).
// 결말: 체력 0 → 보스 처치 처리(world.onBossDefeated)는 다른 보스와 같고, 연출만 정화:
//   핵 균열(0~1.1초) → 핵이 부서짐(섬광) → 결정이 하나씩 깨짐 · 은빛이 번짐 → 내려앉음 → 고개를 들고 날아오른다 (5초, 'STAGE CLEAR' 부제 '정화!').
// 채색 렌더러가 읽는 필드: zx, zy (몸 중심) · fk (좌우 −1..1, 뒤돌기 중 연속) · facing · pitch · flapPh · dmg (0..2) ·
//   ps {raise, spread, fold, rear, lunge, mouth, coreOpen, tail, curl, legs, roar, bow} · neck(Float32Array 9점) · tailP(11점) ·
//   head {lx, ly, a, jaw, x, y} · wing.n / wing.f {S, E, Wr, F[4], a1, a2, fa[4], sc} · legs {hn, hf, fn} (hip/knee/foot) ·
//   crys[{at, x, y, a, s, alive, grow, brk}] (몸 지역) · coreBase · voidK (0..1 공허 기세) · silverK (0..1 은빛) · coreCrack ·
//   stunned · hidden · alpha · br (숨결 {on, x}) · dieT · purified · state · t · flashT · A
// 컬링: 날개·꼬리가 몸통 판정보다 훨씬 크므로 지즈와 같은 ArtCull 대리 개체가 artBounds() 로 그린다.
import { BossC, telegraph, warnText, strikeColumn, strikeFloor, groundWave, ringWave, windGust, screenTint, prewarmTint } from './c_common.js';
import { PI, R, C, LG, ink, glow, glowE, glowSprite, warnRect, warnLine, warnFloor, warnCircle, impact, hash, tube, boltPath } from './b_common.js';
import { Entity } from '../entity.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';
import { registerPainted, hasPainted, paintedDraw } from '../../render/painted/registry.js';   // 채색 퍼핏 등록 (그리기 전용)
import { bosses as EXB } from '../../render/painted/reg/ex-boss.js';

// ── 색 ──
const SIL = '#d6dded', SIL_L = '#f7f9ff', SIL_M = '#a4aec2', SIL_D = '#5a6276', SIL_DD = '#262b38';
const BELLY = '#e6dcc4', BELLY_D = '#958a72', HORN = '#efe5cc', HORN_D = '#857a64';
const VOID = '#8a3cff', VOID_D = '#16052a', VOID_M = '#4a1688', VOID_L = '#d4a8ff';
const PURE = '#bfe8ff', BOLT = '#eef6ff', SKY = '#9fd8ff', MOUTH = '#2a0814', THROAT = '#6a1424';
const FAR = '#3a4152';
// ── 패턴 계약 (c_common P2_PATTERNS 와 같은 모양 — 클래스의 static PATTERNS 가 이긴다) ──
const PATTERNS = {
  attacks: ['breath', 'dive', 'gust', 'crystals', 'tail', 'vanish', 'coreBurst', 'storm'],
  helpers: ['stagger'],
  transitions: {
    1: { state: 'corrupt', dur: 1.8, script: 'b_argen_corrupt', force: 'coreBurst' },
    2: { state: 'awaken', dur: 2.2, script: 'b_argen_awaken', form2: true, force: 'storm' },
  },
  weights: [
    { breath: 2, dive: 3, gust: 2, crystals: 2, tail: 3 },
    { vanish: 3, coreBurst: 2, breath: 2, dive: 2, crystals: 2, tail: 2, gust: 1 },
    { storm: 3, breath: 2, vanish: 2, dive: 2, coreBurst: 2, crystals: 1, tail: 1, gust: 1 },
  ],
  gimmicks: ['wind'],
  floorRow: 16,
  // 설계 방 (docs/specs/ex_s21.md · EX-MAP 요청): 60×18, 경기장 17열부터, 바닥 16–17행(구덩이 없음), 11행 발판 셋 + 7행 높은 발판 둘
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7]] },
};
// ── 몸 지역 좌표 (+x = 머리 쪽, y 아래가 양수, 원점 = 몸 중심) ──
const NB = [94, -30];           // 목 뿌리
const TB = [-110, -2];          // 꼬리 뿌리
const CC = [64, 18];            // 가슴의 공허 핵
const SHN = [30, -44], SHF = [18, -52];   // 날개 뿌리 (가까운 · 먼)
const BACK = [-66, -30];        // 날개막이 몸에 붙는 곳
const L1 = 150, L2 = 165, FL = [240, 214, 180, 136];
const NN = 9, TN = 11;          // 목 · 꼬리 점 수
const POSE0 = { raise: 0, spread: 0, fold: 0, rear: 0, lunge: 0, mouth: 0, coreOpen: 0, tail: 0, curl: 0, legs: 0, roar: 0, bow: 0 };
const POSE_RATE = { raise: 7, spread: 6, fold: 4, rear: 5, lunge: 7, mouth: 12, coreOpen: 5, tail: 9, curl: 5, legs: 4, roar: 6, bow: 2.5 };
// 공허 결정 (ph = 이 페이즈부터 자람, brk = 이 페이즈 전환에서 깨짐 · 9 = 정화 때만)
const CRYS = [
  { at: 'body', lx: -22, ly: -50, a: -1.75, s: 1.0, ph: 0, brk: 9 },
  { at: 'body', lx: 12, ly: -52, a: -1.4, s: 0.8, ph: 0, brk: 2 },
  { at: 'body', lx: -66, ly: -36, a: -2.15, s: 0.86, ph: 0, brk: 9 },
  { at: 'body', lx: 44, ly: -40, a: -1.1, s: 0.66, ph: 1, brk: 2 },
  { at: 'body', lx: 88, ly: 4, a: -0.25, s: 0.55, ph: 0, brk: 9 },
  { at: 'body', lx: 48, ly: 42, a: 1.25, s: 0.55, ph: 1, brk: 9 },
  { at: 'body', lx: -88, ly: 16, a: 2.55, s: 0.6, ph: 1, brk: 2 },
  { at: 'neck', i: 3, s: 0.6, ph: 0, brk: 9 },
  { at: 'neck', i: 6, s: 0.48, ph: 1, brk: 2 },
  { at: 'tail', i: 2, s: 0.8, ph: 0, brk: 9 },
  { at: 'tail', i: 5, s: 0.62, ph: 0, brk: 2 },
  { at: 'tail', i: 7, s: 0.48, ph: 1, brk: 9 },
  { at: 'wing', i: 0, s: 0.7, ph: 0, brk: 2 },
  { at: 'wing', i: 1, s: 0.55, ph: 1, brk: 9 },
  { at: 'head', lx: -44, ly: -20, a: -2.5, s: 0.5, ph: 0, brk: 2 },
];
const AURA = [0, 1, 2, 3, 4, 5].map((i) => ({ a: (i / 6) * TAU, r: 120 + hash(i * 3.1) * 90, s: 150 + hash(i * 1.9) * 120, y: -20 + hash(i * 4.7) * 70, sp: 0.15 + hash(i * 2.3) * 0.12 }));

let _mist = null;
/** 공허 안개 덩이 (128², 한 번만 — 싸움 중 새 캔버스 0) */
function mistSprite() {
  if (_mist) return _mist;
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(128, 128) : null);
  if (!c) return null;
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(60,16,100,0.8)'); gr.addColorStop(0.5, 'rgba(36,8,64,0.45)'); gr.addColorStop(1, 'rgba(20,4,36,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _mist = c;
  return c;
}
/** 2차 베지어 점 n 개 → out (Float32Array, x,y 번갈아) */
function bez(out, n, x0, y0, cx, cy, x1, y1) {
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), v = 1 - u;
    out[i * 2] = v * v * x0 + 2 * v * u * cx + u * u * x1;
    out[i * 2 + 1] = v * v * y0 + 2 * v * u * cy + u * u * y1;
  }
  return out;
}
const pt = () => ({ x: 0, y: 0 });
const wingRig = (sx, sy, sc) => ({ S: { x: sx, y: sy }, E: pt(), Wr: pt(), F: [pt(), pt(), pt(), pt()], a1: 0, a2: 0, fa: [0, 0, 0, 0], sc });

export class Argen extends BossC {
  static get PATTERNS() { return PATTERNS; }

  setup() {
    // 채색 퍼핏: 모음(reg/index.js)에 ex-boss 줄이 아직 없으면 여기서 한 번 등록 (이미 있으면 아무것도 안 함). BossB.init 의 preloadPainted 보다 먼저 돈다
    if (!hasPainted?.('b_argen') && EXB?.b_argen) registerPainted?.('b_argen', { kind: 'boss', importer: EXB.b_argen });
    const A = this.A;
    this.facing = -1; this.fk = -1;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    const p0 = this.P;
    this.zx = clamp(p0 ? p0.cx + 640 : this.cx, A.x0 + 240, Math.max(A.x0 + 240, A.x1 - 240));
    if (p0 && this.zx > p0.cx) this.facing = this.fk = -1; else this.facing = this.fk = 1;
    this.zy = this.hoverY();
    this.tzx = this.zx; this.tzy = this.zy; this.spd = 160; this.spdY = 150;
    this.lvx = 0; this.pitch = 0; this.pitchT = null; this.flapPh = 0; this.flapMul = 1;
    this.dmg = 0; this.stunned = false; this.dieT = 0; this.purified = false; this.coreCrack = 0; this._bannered = false;
    this.coreBase = 0; this.voidK = 0.7; this.silverK = 0; this.aimA = 0; this.aimK = 0; this.swing = -1; this.swingY = 160;
    this.br = null; this.dv = null; this.tl = null; this.vn = null; this.cb = null; this.sm = null; this.diveLeft = 0; this.gdir = 1;
    this.neck = new Float32Array(NN * 2); this.tailP = new Float32Array(TN * 2); this._tw = new Float32Array(TN * 2);
    this.head = { lx: 0, ly: 0, a: 0, jaw: 0, x: 0, y: 0 };
    this.wing = { n: wingRig(SHN[0], SHN[1], 1), f: wingRig(SHF[0], SHF[1], 0.9) };
    this.legs = { hn: { hip: { x: -56, y: 30 }, knee: pt(), foot: pt() }, hf: { hip: { x: -44, y: 26 }, knee: pt(), foot: pt() }, fn: { hip: { x: 70, y: 34 }, knee: pt(), foot: pt() } };
    this.crys = CRYS.map((c) => ({ ...c, x: 0, y: 0, wa: c.a ?? 0, alive: c.ph === 0, grow: c.ph === 0 ? 1 : 0, gone: 0, breakIn: 0 }));
    this.mouthW = { x: 0, y: 0 }; this.coreW = { x: 0, y: 0 };
    this.pCore = { x: 0, y: 0, w: 74, h: 74, defMul: 0.75, onHit: (part, dmg) => this.hitCore(dmg) };
    this.pHead = { x: 0, y: 0, w: 76, h: 60, defMul: 1.0 };
    this.pNeck = { x: 0, y: 0, w: 66, h: 66, defMul: 1.05 };
    this.pBody = { x: 0, y: 0, w: 214, h: 98, defMul: 1.15 };
    this.pWing = { x: 0, y: 0, w: 60, h: 60, defMul: 1.3 };
    this.pTail = { x: 0, y: 0, w: 60, h: 60, defMul: 1.2 };
    this.cBody = { x: 0, y: 0, w: 176, h: 80 };
    this._hp = []; this._cp = []; this._pt = { x: 0, y: 0 }; this._pl = { x: 0, y: 0 };
    this.fxAcc = 0;
    // 캐시 캔버스는 등장 연출 동안 만든다 (싸움 중 새 캔버스 0 — MASTER_PLAN §5.2)
    mistSprite();
    for (const c of [VOID, VOID_L, PURE, BOLT, SKY, '#ffffff', '#6a9cff', '#ff4050']) { glowSprite(c, false); glowSprite(c, true); }
    prewarmTint('#8a3cff');
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  camTop() { const c = this.world?.camera; return c && Number.isFinite(c.y) ? c.y : -1e9; }
  hoverY() { const A = this.A; return Math.min(A.floor - 250, Math.max((A.top ?? 0) + 180, A.floor - 340, this.camTop() + 230)); }
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; }
  /** 플레이어 쪽을 본다 (90px 문턱 — 머리 아래에 서 있어도 몸이 계속 뒤집히지 않게) */
  faceP(th = 90) { const p = this.P; if (p) { const d = p.cx - this.zx; if (Math.abs(d) > th) this.facing = Math.sign(d); } }
  /** 몸 지역 좌표 → 월드 (좌우 fk · 기울기 pitch 반영) */
  toWorld(lx, ly, out = this._pt) {
    const c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    out.x = this.zx + this.fk * (lx * c - ly * s); out.y = this.zy + lx * s + ly * c;
    return out;
  }
  /** 월드 → 몸 지역 (숨결 겨냥용) */
  toLocal(wx, wy, out = this._pl) {
    const f = Math.abs(this.fk) < 0.2 ? (this.facing || 1) : this.fk;
    const rx = (wx - this.zx) / f, ry = wy - this.zy, c = Math.cos(this.pitch), s = Math.sin(this.pitch);
    out.x = rx * c + ry * s; out.y = -rx * s + ry * c;
    return out;
  }
  place() { this.x = this.zx - this.w / 2; this.y = this.zy - this.h / 2; this.vx = 0; this.vy = 0; }

  /** 골격: 목 · 머리 · 날개 · 꼬리 · 다리 · 결정 (몸 지역 좌표, 그리기·판정·채색이 같이 쓴다) */
  rig() {
    const s = this.ps, t = this.t;
    // 머리
    const H = this.head;
    H.lx = 205 - 75 * s.rear + 90 * s.lunge - 30 * s.bow + Math.sin(t * 1.3) * 5;
    H.ly = -118 - 55 * s.rear + 120 * s.lunge - 45 * s.roar + 125 * s.bow + Math.cos(t * 1.1) * 5;
    let ha = 0.12 - 0.55 * s.rear + 0.55 * s.lunge - 0.55 * s.roar + 0.75 * s.bow;
    if (this.aimK > 0) ha = lerp(ha, this.aimA, this.aimK);
    H.a = ha; H.jaw = 0.05 + 0.62 * s.mouth;
    // 목: 뿌리 → 조절점 → 머리 뒤 (베지어 9점)
    const ca = Math.cos(ha), sa = Math.sin(ha);
    const nex = H.lx - 42 * ca - 6 * sa, ney = H.ly - 42 * sa + 6 * ca;
    bez(this.neck, NN, NB[0], NB[1], NB[0] + 70 - 30 * s.lunge, NB[1] - 95 + 40 * s.lunge - 30 * s.rear, nex, ney);
    // 날개 (가까운 · 먼)
    for (const key of ['n', 'f']) {
      const W = this.wing[key], far = key === 'f';
      const ph = this.flapPh - (far ? 0.35 : 0);
      let up = clamp(0.5 + 0.42 * Math.sin(ph) * (1 - s.fold) + 0.5 * s.raise, -0.15, 1.15);
      let a1 = lerp(-3.5, -1.8, up), a2 = a1 - lerp(1.15, 0.55, up) * (1 - 0.35 * s.spread);
      a1 = lerp(a1, -2.2, s.fold); a2 = lerp(a2, -3.25, s.fold);
      W.a1 = a1; W.a2 = a2;
      const k = W.sc;
      W.E.x = W.S.x + Math.cos(a1) * L1 * k; W.E.y = W.S.y + Math.sin(a1) * L1 * k;
      W.Wr.x = W.E.x + Math.cos(a2) * L2 * k; W.Wr.y = W.E.y + Math.sin(a2) * L2 * k;
      const fan = lerp(1, 0.3, s.fold) * (1 + 0.2 * s.spread), fl = lerp(1, 0.55, s.fold) * k;
      for (let i = 0; i < 4; i++) {
        const fa = a2 - (0.05 + i * 0.42 * fan);
        W.fa[i] = fa;
        W.F[i].x = W.Wr.x + Math.cos(fa) * FL[i] * fl; W.F[i].y = W.Wr.y + Math.sin(fa) * FL[i] * fl;
      }
    }
    // 꼬리: 비행 물결 ↔ 휩쓸기 베지어 (ps.tail 가중치)
    const T = this.tailP, TW = this._tw;
    let x = TB[0], y = TB[1];
    TW[0] = x; TW[1] = y;
    for (let i = 1; i < TN; i++) {
      const a = PI - (0.12 + 0.03 * i) + Math.sin(t * 1.8 - i * 0.6) * 0.08 * (0.4 + i * 0.12) + s.curl * 0.11 * i;
      x += Math.cos(a) * 40; y += Math.sin(a) * 40;
      TW[i * 2] = x; TW[i * 2 + 1] = y;
    }
    const tk = s.tail;
    if (tk > 0.01) {
      const tx = this.swing * 440, ty = this.swingY;
      bez(T, TN, TB[0], TB[1], (TB[0] + tx) * 0.5 - 40, Math.max(TB[1], ty) + 110, tx, ty);
      for (let i = 0; i < TN * 2; i++) T[i] = lerp(TW[i], T[i], tk);
    } else T.set(TW);
    // 다리
    const L = this.legs, lg = s.legs, sw = Math.sin(t * 1.5) * 4;
    for (const [leg, ox] of [[L.hn, 0], [L.hf, 8]]) {
      leg.knee.x = leg.hip.x + 22 + 10 * lg + ox; leg.knee.y = leg.hip.y + 44 + 8 * lg + sw;
      leg.foot.x = leg.knee.x - 18 + 8 * lg; leg.foot.y = leg.knee.y + 46 + 24 * lg;
    }
    L.fn.knee.x = L.fn.hip.x + 20; L.fn.knee.y = L.fn.hip.y + 26 + 16 * lg - sw * 0.5;
    L.fn.foot.x = L.fn.knee.x + 22 - 10 * lg; L.fn.foot.y = L.fn.knee.y + 18 + 28 * lg;
    // 결정 (부착점)
    for (const c of this.crys) this.crysPos(c);
  }
  crysPos(c) {
    if (c.at === 'body') { c.x = c.lx; c.y = c.ly; c.wa = c.a; return; }
    if (c.at === 'head') {
      const H = this.head, ca = Math.cos(H.a), sa = Math.sin(H.a);
      c.x = H.lx + c.lx * ca - c.ly * sa; c.y = H.ly + c.lx * sa + c.ly * ca; c.wa = c.a + H.a; return;
    }
    if (c.at === 'wing') {
      const W = this.wing.n, P = c.i === 0 ? W.Wr : W.E;
      c.x = P.x; c.y = P.y; c.wa = (c.i === 0 ? W.a2 : W.a1) - 1.3; return;
    }
    const A = c.at === 'neck' ? this.neck : this.tailP, n = c.at === 'neck' ? NN : TN;
    const i = Math.min(c.i, n - 2);
    const tx = A[i * 2 + 2] - A[i * 2], ty = A[i * 2 + 3] - A[i * 2 + 1], L = Math.hypot(tx, ty) || 1;
    // 등 쪽 법선: 목은 앞으로, 꼬리는 뒤로 뻗으므로 방향이 반대
    const nx = c.at === 'neck' ? ty / L : -ty / L, ny = c.at === 'neck' ? -tx / L : tx / L;
    const r = c.at === 'neck' ? 22 : Math.max(6, 24 - i * 2);
    c.x = A[i * 2] + nx * r * 0.7; c.y = A[i * 2 + 1] + ny * r * 0.7; c.wa = Math.atan2(ny, nx);
  }
  /** 판정 부위를 월드 좌표로 (그리기와 같은 골격) */
  syncParts() {
    const P = this._pt, H = this.head;
    const ca = Math.cos(H.a), sa = Math.sin(H.a);
    this.toWorld(H.lx + 14 * ca, H.ly + 14 * sa, P); H.x = P.x; H.y = P.y;
    this.pHead.x = P.x - this.pHead.w / 2; this.pHead.y = P.y - this.pHead.h / 2;
    this.toWorld(H.lx + 72 * ca - 12 * sa, H.ly + 72 * sa + 12 * ca, P); this.mouthW.x = P.x; this.mouthW.y = P.y;
    this.toWorld(this.neck[8], this.neck[9], P); this.pNeck.x = P.x - this.pNeck.w / 2; this.pNeck.y = P.y - this.pNeck.h / 2;
    this.toWorld(CC[0], CC[1], P); this.coreW.x = P.x; this.coreW.y = P.y;
    this.pCore.x = P.x - this.pCore.w / 2; this.pCore.y = P.y - this.pCore.h / 2;
    this.pCore.defMul = this.coreOpenK() > 0.8 ? 0.45 : 0.75;
    this.toWorld(0, 2, P);
    this.pBody.x = P.x - this.pBody.w / 2; this.pBody.y = P.y - this.pBody.h / 2;
    this.cBody.x = P.x - this.cBody.w / 2; this.cBody.y = P.y - this.cBody.h / 2;
    // 가까운 날개: 어깨 → 손목 상자 (+ 막 아래로 60)
    const W = this.wing.n;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of [W.S, W.E, W.Wr]) { this.toWorld(q.x, q.y, P); x0 = Math.min(x0, P.x); x1 = Math.max(x1, P.x); y0 = Math.min(y0, P.y); y1 = Math.max(y1, P.y); }
    const pw = this.pWing; pw.x = x0 - 10; pw.y = y0 - 10; pw.w = Math.max(60, x1 - x0 + 20); pw.h = Math.max(60, y1 - y0 + 60);
    // 꼬리: 2~6번 점 상자
    x0 = 1e9; y0 = 1e9; x1 = -1e9; y1 = -1e9;
    for (let i = 2; i <= 6; i++) { this.toWorld(this.tailP[i * 2], this.tailP[i * 2 + 1], P); x0 = Math.min(x0, P.x); x1 = Math.max(x1, P.x); y0 = Math.min(y0, P.y); y1 = Math.max(y1, P.y); }
    const ptl = this.pTail; ptl.x = x0 - 18; ptl.y = y0 - 18; ptl.w = x1 - x0 + 36; ptl.h = y1 - y0 + 36;
  }
  coreOpenK() { return Math.max(this.coreBase, this.ps.coreOpen); }
  motion(dt, world) {
    const s = this.ps, pt0 = this.pt;
    for (const k in s) s[k] += (pt0[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt));
    const x0 = this.zx;
    this.zx = approach(this.zx, this.tzx, this.spd * dt);
    this.zy = approach(this.zy, this.tzy, this.spdY * dt);
    const A = this.A;
    this.zx = clamp(this.zx, A.x0 + 60, A.x1 - 60);
    const vx = dt > 0 ? (this.zx - x0) / dt : 0;
    this.lvx += (vx - this.lvx) * (1 - Math.exp(-6 * dt));
    // 좌우: 뒤돌기는 0.35초 종이 뒤집기 (fk 가 −1..1 로 연속)
    this.fk = approach(this.fk, this.facing, dt * 5.5);
    // 기울기: 앞으로 날면 머리가 살짝 숙여진다. 급강하·추락은 pitchT 로 직접
    const want = this.pitchT ?? clamp(this.lvx * Math.sign(this.fk || 1) / 2200, -0.1, 0.14) * (1 - s.fold * 0.5);
    this.pitch += (want - this.pitch) * (1 - Math.exp(-(this.pitchT != null ? 9 : 4) * dt));
    this.flapPh += dt * (2.2 + 1.8 * (this.flapMul - 1)) * (1 - s.fold * 0.85);
    // 결정이 자란다
    for (const c of this.crys) {
      if (c.alive && c.grow < 1) c.grow = Math.min(1, c.grow + dt * 1.4);
      if (c.breakIn > 0 && (c.breakIn -= dt) <= 0) { c.breakIn = 0; this.breakCrystal(c); }   // 예약된 깨짐 (지연 작업이 아니라 clearJobs 에 지워지지 않는다)
    }
    this.place();
    this.rig();
    this.syncParts();
  }
  idleAnim(dt) { this.flapPh += dt * 2.2; }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0 || this.hidden) return L;
    if (this.coreOpenK() > 0.3) L.push(this.pCore);
    L.push(this.pHead, this.pNeck, this.pBody);
    if (this.ps.fold < 0.5) L.push(this.pWing);
    L.push(this.pTail);
    return L;
  }
  /** 접촉은 몸통만. 급강하·숨은 동안·내리꽂기·사망 중에는 없다 (그 피해는 예고된 지대가 맡는다) */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.hidden || this.dying > 0 || this.state === 'dive' || this.state === 'vanish' || this.state === 'stagger') return L;
    L.push(this.cBody);
    return L;
  }
  /** 공허 핵 피격: coreBurst 중 최대 체력 5% 를 넘게 맞으면 추락(stagger) */
  hitCore(dmg) {
    const cb = this.cb;
    if (this.state !== 'coreBurst' || !cb || cb.broke || this.dying > 0) return;
    cb.dmg += Math.max(0, dmg || 0);
    if (cb.dmg >= this.stats.maxHp * 0.05) { cb.broke = true; this.later(0, () => { if (this.state === 'coreBurst' && !(this.dying > 0)) { this.clearJobs(); this.setState('stagger'); } }); }
  }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (part === this.pCore) { world.fx.burst('magic', x, y, 5, { color: VOID_L, speed: 220 }); return; }
    if (Math.random() < 0.5) world.fx.burst('shard', x, y, 2, { color: SIL, speed: 160 });
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
  }
  ambient(dt, world) {
    if (this.hidden) return;
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (2 + 3 * this.voidK);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const c = this.crys[Math.floor(Math.random() * this.crys.length)];
      if (!c.alive) continue;
      const P = this.toWorld(c.x, c.y);
      world.fx.emit('dark', P.x, P.y, { speed: 30, color: VOID_M, angle: -PI / 2, spread: 0.8 });
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) { r.x = this.zx - 720; r.y = this.zy - 560; r.w = 1440; r.h = 1000; return r; }
  /**
   * 그리기: 채색이 준비됐으면 채색(대리 개체), 아니면 벡터. 정화 연출(사망 5초)은 스스로 보여 주므로
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
      this.setPose({ raise: 1, spread: 1, roar: 1, mouth: 1 }); this.flapMul = 1.8;
      audio.sfx('bat', { pitch: 0.35, vol: 1 }); audio.sfx('dark', { pitch: 0.5, vol: 0.7 });
      impact(world, { shake: 8, time: 0.6 });
      world.fx.ring(this.coreW.x, this.coreW.y, { color: VOID_L, r0: 20, r1: 260, life: 0.6, width: 6 });
    }
    if (this.at(0.9)) this.setPose({ raise: -0.5, roar: 0.4, mouth: 0.3 });
    if (this.at(1.3)) { this.relax(); this.flapMul = 1; }
    if (t >= 1.5) this.done(0.8);
  }
  idleMove(dt, world, t) {
    this.faceP();
    const A = this.A, p = this.P;
    const px = p ? p.cx : A.cx;
    const side = Math.sign(this.zx - px) || -this.facing;
    this.tzx = clamp(px + side * 290, A.x0 + 220, A.x1 - 220);
    this.tzy = this.hoverY() + Math.sin(this.t * 1.2) * 16;
    this.spd = 160; this.spdY = 150;
  }

  // ── breath: 은빛 번개 숨결 — 고개를 젖히고(1.0초 예고) 먼 쪽 바닥부터 가슴 앞까지 가로로 쓸어 온다 (3페이즈 되쓸기) ──
  //   피하는 법: 용의 몸 아래·뒤로 들어간다 (가슴 앞 130px 에서 멈춘다). 바닥 띠가 쓸리는 범위를 미리 보여 준다
  s_breath(dt, world, t) {
    const A = this.A, P3 = this.phase >= 2;
    if (this.at(0.001)) {
      this.faceP(10);
      const f = this.facing;
      this.tzx = this.zx; this.tzy = this.hoverY() - 40; this.spd = 120;
      const xs = f > 0 ? A.x1 - 40 : A.x0 + 40, xe = clamp(this.zx + f * 130, A.x0 + 40, A.x1 - 40);
      this.br = { f, xs, xe, x: xs, on: false, t0: 0, dur: P3 ? 1.2 : 1.5, back: P3, seed: Math.floor(rand(0, 1000)) };
      this.setPose({ rear: 1, mouth: 0.45, raise: 0.6, spread: 0.6, coreOpen: this.phase >= 1 ? 1 : 0 });
      telegraph(this, 1.0, { sfx: 'warning', vol: 0.45 });
      audio.sfx('thunder', { pitch: 0.45, vol: 0.5 });
      const x0 = Math.min(xs, xe), w = Math.abs(xe - xs);
      this.zone({ x: x0, y: A.floor - 30, w, h: 30, warn: 0, life: 1.0, harmless: true, z: 5, paint: (ctx, z, w2) => warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / 1.0, 0, 1), SKY, w2.time) });
    }
    const b = this.br;
    if (!b) { this.done(0.5); return; }
    if (!b.on && t < 1.0) {
      // 입 안에 번개가 모인다
      if (Math.random() < 0.6 * (world.fx.quality ?? 1)) world.fx.emit('thunder', this.mouthW.x + rand(-14, 14), this.mouthW.y + rand(-10, 10), { speed: 120 });
      this.aimK = 0;
    }
    if (this.at(1.0)) {
      b.on = true; b.t0 = t;
      this.setPose({ rear: 0.25, lunge: 0.25, mouth: 1 });
      audio.sfx('thunderclap', { pitch: 0.9 }); audio.sfx('magic', { pitch: 0.5, vol: 0.6 });
      this.lightning(0.5);
      const life = b.dur * (b.back ? 2 : 1);
      this.zone({
        x: 0, y: 0, w: 10, h: 10, warn: 0, life, mv: 1.25, element: 'thunder', rehit: 0.5, kb: [320, -320], z: 7,
        line: { x0: this.mouthW.x, y0: this.mouthW.y, x1: b.x, y1: A.floor, th: 30 },
        tick: (z) => {
          const L = z.line;
          L.x0 = this.mouthW.x; L.y0 = this.mouthW.y; L.x1 = b.x; L.y1 = A.floor - 4;
          z.x = Math.min(L.x0, L.x1) - 30; z.y = Math.min(L.y0, L.y1) - 30; z.w = Math.abs(L.x1 - L.x0) + 60; z.h = Math.abs(L.y1 - L.y0) + 60;
        },
        paint: (ctx, z, w2) => paintBreath(ctx, z, w2, b),
        light: (Lt, z) => { if (z.on) Lt.add(b.x, A.floor - 40, 200, PURE, 0.9); },
      });
    }
    if (b.on) {
      const tt = t - b.t0, k1 = clamp(tt / b.dur, 0, 1), e1 = k1 * k1 * (3 - 2 * k1);
      if (tt <= b.dur || !b.back) b.x = lerp(b.xs, b.xe, e1);
      else { const k2 = clamp((tt - b.dur) / b.dur, 0, 1), e2 = k2 * k2 * (3 - 2 * k2); b.x = lerp(b.xe, b.xs, e2); }
      const L = this.toLocal(b.x, A.floor), H = this.head;
      this.aimA = Math.atan2(L.y - H.ly, L.x - H.lx);
      this.aimK = approach(this.aimK, 1, dt * 6);
      if (Math.random() < 0.9 * (world.fx.quality ?? 1)) world.fx.emit('thunder', b.x + rand(-20, 20), A.floor - 6, { speed: 260, angle: -PI / 2, spread: 1.1 });
      if (Math.random() < 0.4 * (world.fx.quality ?? 1)) world.fx.emit('dust', b.x, A.floor - 4, { speed: 80, angle: -PI / 2, spread: 0.6 });
      if (tt >= b.dur * (b.back ? 2 : 1)) { b.on = false; this.setPose({ mouth: 0.2, lunge: 0, rear: 0, coreOpen: 0 }); }
    } else if (b.t0 > 0) this.aimK = approach(this.aimK, 0, dt * 4);
    if (t >= 1.0 + b.dur * (b.back ? 2 : 1) + 0.5) { this.br = null; this.aimK = 0; this.relax(); this.done(1.0); }
  }

  // ── dive: 뒤로 물러나 솟구친 뒤(1.0초 예고, 0.75초까지 플레이어를 겨냥) 직선 급강하 → 바닥을 미끄러진다 (3페이즈 두 번) ──
  s_dive(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      if (!(this.diveLeft > 0)) this.diveLeft = this.phase >= 2 ? 2 : 1;
      this.faceP(10);
      const f = this.facing;
      this.tzx = clamp(this.zx - f * 170, A.x0 + 200, A.x1 - 200); this.tzy = this.hoverY() - 110; this.spd = 420; this.spdY = 380;
      this.dv = { f, tx: this.P?.cx ?? A.cx, ty: A.floor - 88, on: false, t0: 0, sx: 0, sy: 0, dur: 0.4, hit: false, lock: false };
      this.setPose({ raise: 1, spread: 0.8, rear: 0.6, roar: 0.3, mouth: 0.5 });
      telegraph(this, this.diveLeft < 2 && this.phase >= 2 ? 0.7 : 1.0, { sfx: 'warning', vol: 0.45 });
      audio.sfx('bat', { pitch: 0.4 });
      const d = this.dv;
      this.zone({
        x: A.x0, y: (A.top ?? 0), w: A.w, h: A.floor - (A.top ?? 0), warn: 0, life: 1.0, harmless: true, z: 5,
        paint: (ctx, z) => {
          const ex = clamp(d.tx + d.f * 380, A.x0 + 40, A.x1 - 40);
          warnLine(ctx, this.zx, this.zy, d.tx, d.ty, clamp(z.t / 1.0, 0, 1), VOID_L, 3);
          warnLine(ctx, d.tx, d.ty + 40, ex, d.ty + 40, clamp(z.t / 1.0, 0, 1), VOID_L, 2);
        },
      });
    }
    const d = this.dv;
    if (!d) { this.done(0.5); return; }
    if (!d.on && t < 0.75 && this.P) { d.tx = approach(d.tx, clamp(this.P.cx, A.x0 + 80, A.x1 - 80), dt * 900); this.facing = d.f = Math.sign(d.tx - this.zx) || d.f; }
    if (this.at(1.0)) {
      d.on = true; d.t0 = t; d.sx = this.zx; d.sy = this.zy;
      d.dur = clamp(Math.hypot(d.tx - d.sx, d.ty - d.sy) / 1800, 0.18, 0.6);
      this.pitchT = clamp(Math.atan2(d.ty - d.sy, Math.abs(d.tx - d.sx) || 1), 0, 1.1);
      this.setPose({ fold: 0.85, raise: 0, lunge: 0.7, rear: 0, roar: 0, mouth: 0.8, legs: 0.6 });
      audio.sfx('dash', { pitch: 0.45 }); audio.sfx('whip', { pitch: 0.3 });
      this.zone({ x: this.zx - 110, y: this.zy - 60, w: 220, h: 120, warn: 0, life: d.dur + 0.55, mv: 1.6, z: 7, kb: [520, -420], tick: (z) => { z.x = this.zx - 110 + this.fk * 30; z.y = this.zy - 55; } });
    }
    if (d.on) {
      const tt = t - d.t0;
      if (tt <= d.dur) {
        const k = tt / d.dur;
        this.zx = this.tzx = lerp(d.sx, d.tx, k); this.zy = this.tzy = lerp(d.sy, d.ty, k * k);
      } else {
        if (!d.hit) {
          d.hit = true; this.pitchT = 0.05;
          impact(world, { shake: 10, time: 0.35 });
          world.fx.burst('dust', d.tx, A.floor - 6, 18, { speed: 260, angle: -PI / 2, spread: 1.3 });
          audio.sfx('hit_heavy', { pitch: 0.6 });
          if (this.phase >= 1) for (const s of [-1, 1]) groundWave(this, d.tx, s, { h: 34, w: 36, speed: 540, mv: 1.0, color: VOID_L, sfx: null });
          d.ex = clamp(d.tx + d.f * 380, A.x0 + 80, A.x1 - 80);
        }
        const k = clamp((tt - d.dur) / 0.5, 0, 1);
        this.zx = this.tzx = lerp(d.tx, d.ex, 1 - (1 - k) * (1 - k)); this.zy = this.tzy = d.ty;
        if (Math.random() < 0.7 * (world.fx.quality ?? 1)) world.fx.emit('dust', this.zx - d.f * 60, A.floor - 4, { speed: 110, angle: -PI / 2 - d.f * 0.6, spread: 0.5 });
        if (k >= 1) { d.on = false; this.pitchT = null; this.tzy = this.hoverY(); this.spd = 300; this.spdY = 360; this.setPose({ fold: 0, raise: 0.8, lunge: 0, legs: 0, mouth: 0 }); }
      }
    }
    if (d.hit && !d.on && t >= d.t0 + d.dur + 0.5 + 0.35) {
      this.diveLeft--;
      this.dv = null; this.pitchT = null;
      if (this.diveLeft > 0) { this.setState('dive'); return; }
      this.relax(); this.done(1.0);
    }
    if (t > 5) { this.diveLeft = 0; this.dv = null; this.pitchT = null; this.relax(); this.done(0.8); }
  }

  // ── gust: 날개를 크게 든다(1.0초 예고, 2페이즈+ 핵 드러남) → 내려쳐 돌풍 2.5초 (방의 wind 기믹) + 바람 칼날 6 (2페이즈+ 공허 파편 3) ──
  s_gust(dt, world, t) {
    if (this.at(0.001)) {
      const p = this.P;
      this.gdir = p ? (Math.sign(p.cx - this.zx) || this.facing) : this.facing;
      this.facing = this.gdir;
      telegraph(this, 1.0, { sfx: 'warning', vol: 0.4 });
      this.setPose({ raise: 1, spread: 1, rear: 0.4, mouth: 0.6, coreOpen: this.phase >= 1 ? 1 : 0 });
      audio.sfx('bat', { pitch: 0.32, vol: 0.9 });
      windGust(this, this.gdir, 1300, 2.5, 1.0);   // 기믹 경고(1.0초)가 날개 들기와 겹친다 → 1.0초 뒤 2.5초 돌풍
      this.tzy = this.hoverY() - 30;
    }
    if (this.at(1.0)) {
      this.setPose({ raise: -1, spread: 0.7, rear: 0, mouth: 0.3 });
      impact(world, { shake: 7, time: 0.4 });
      audio.sfx('whip', { pitch: 0.32 });
      for (let i = 0; i < 6; i++) this.later(i * 0.18, () => this.windBlade(this.gdir, false));
      if (this.phase >= 1) for (let i = 0; i < 3; i++) this.later(0.09 + i * 0.36, () => this.windBlade(this.gdir, true));
    }
    if (this.at(1.5)) this.setPose({ raise: 0, spread: 0, coreOpen: 0 });
    if (t >= 3.4) { this.relax(); this.done(1.0); }
  }
  windBlade(dir, shard) {
    const A = this.A;
    const y = rand(A.floor - 330, A.floor - 30);
    const x = dir > 0 ? Math.max(A.x0 + 20, this.zx - 120) : Math.min(A.x1 - 20, this.zx + 120);
    if (shard) this.shoot({ x, y, vx: dir * 460, vy: rand(-30, 30), w: 26, h: 16, life: 5, render: shardRender, attack: { mv: 0.9, element: 'dark' }, light: { r: 60, color: VOID, i: 0.5 } });
    else this.shoot({ x, y, vx: dir * 420, vy: rand(-20, 20), w: 34, h: 30, life: 5, render: bladeRender, attack: { mv: 0.8 }, light: { r: 50, color: PURE, i: 0.35 } });
  }

  // ── crystals: 포효(0.6초 예고) → 공허 결정이 하늘에서 떨어진다. 파도 2(1페이즈)/3, 줄 4/4/5, 파도마다 반 칸씩 엇갈린다 ──
  s_crystals(dt, world, t) {
    const A = this.A, waves = this.phase >= 1 ? 3 : 2;
    if (this.at(0.001)) {
      this.faceP(10);
      this.setPose({ roar: 1, mouth: 1, raise: 0.6, spread: 1, coreOpen: this.phase >= 1 ? 1 : 0.3 });
      telegraph(this, 0.6, { sfx: 'warning', vol: 0.4, pitch: 0.8 });
      audio.sfx('ghost', { pitch: 0.5, vol: 0.7 }); audio.sfx('ice', { pitch: 0.5, vol: 0.6 });
      world.fx.ring(this.coreW.x, this.coreW.y, { color: VOID_L, r0: 20, r1: 200, life: 0.5, width: 5 });
    }
    for (let i = 0; i < waves; i++) if (this.at(0.6 + i * 1.0)) this.crystalWave(i);
    if (this.at(0.6 + waves * 1.0 - 0.6)) this.setPose({ roar: 0, mouth: 0, raise: 0, spread: 0, coreOpen: 0 });
    if (t >= 0.6 + waves * 1.0 + 0.6) { this.relax(); this.done(1.0); }
  }
  crystalWave(i) {
    const A = this.A, p = this.P, px = p ? p.cx : A.cx;
    const n = this.phase >= 2 ? 5 : 4, gap = 340;
    const off = i % 2 ? gap / 2 : 0;
    const xs = [];
    for (let k = 0; k < n; k++) {
      const o = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * gap + off;
      const x = clamp(px + o, A.x0 + 40, A.x1 - 40);
      if (!xs.some((q) => Math.abs(q - x) < 90)) xs.push(x);
    }
    const top = Math.min(A.floor - 420, this.camTop() - 40);
    for (const x of xs) {
      const seed = rand(0, 100);
      strikeColumn(this, x, {
        w: 74, warn: 0.95, life: 0.3, mv: 1.2, element: 'dark', color: VOID_L, top, bottom: A.floor, sfx: null,
        onStart: (z, w) => { audio.sfx('ice', { pitch: 0.55 + Math.random() * 0.2, vol: 0.5 }); w.fx.burst('magic', x, A.floor - 10, 8, { color: VOID_L, speed: 240 }); w.camera?.shake?.(3, 0.15); },
        paint: (ctx, z, w) => paintCrystalFall(ctx, z, w, x, top, A.floor, seed),
      });
    }
  }

  // ── tail: 플레이어 곁으로 낮게 내려와(0.8초 예고) 꼬리로 바닥을 휩쓴다 = 뛰어서 피한다.
  //    2페이즈+: 0.5초 뒤 높은 띠로 되휩쓴다 = 땅에 붙어 피한다 (예고 띠 높이가 다르다)
  s_tail(dt, world, t) {
    const A = this.A, two = this.phase >= 1;
    if (this.at(0.001)) {
      this.faceP(10);
      const p = this.P, px = p ? p.cx : A.cx;
      this.tzx = clamp(px - this.facing * 40, A.x0 + 300, A.x1 - 300); this.tzy = A.floor - 235; this.spd = 700; this.spdY = 600;
      this.swing = -1; this.swingY = 185;
      this.setPose({ curl: 1, tail: 1, raise: 0.5, legs: 0.3, rear: 0.3 });
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.45 });
      audio.sfx('whip', { pitch: 0.5, vol: 0.6 });
      this.tl = { on: 0, t0: 0, cx: this.tzx };
      const tl = this.tl;
      this.zone({ x: tl.cx - 470, y: A.floor - 100, w: 940, h: 100, warn: 0, life: 0.85, harmless: true, z: 5, tick: (z) => { z.x = this.zx - 470; }, paint: (ctx, z, w) => warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / 0.85, 0, 1), VOID_L, w.time) });
    }
    const tl = this.tl;
    if (!tl) { this.done(0.5); return; }
    if (this.at(0.85)) this.sweep(1, A.floor - 100, 100, 0.85);
    if (two && this.at(1.35)) {
      telegraph(this, 0.5, { sfx: 'warning', vol: 0.4, pitch: 1.3 });
      this.zone({ x: this.zx - 470, y: A.floor - 235, w: 940, h: 95, warn: 0, life: 0.5, harmless: true, z: 5, paint: (ctx, z, w) => warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / 0.5, 0, 1), PURE, w.time) });
    }
    if (two && this.at(1.85)) this.sweep(-1, A.floor - 235, 95, 1.85);
    if (tl.on) {
      const k = clamp((t - tl.t0) / 0.45, 0, 1), e = k * k * (3 - 2 * k);
      this.swing = tl.on > 0 ? lerp(-1, 1, e) : lerp(1, -1, e);
      if (Math.random() < 0.6 * (world.fx.quality ?? 1) && tl.y > A.floor - 120) { const P = this.toWorld(this.tailP[20], this.tailP[21]); world.fx.emit('dust', P.x, A.floor - 4, { speed: 120, angle: -PI / 2, spread: 0.7 }); }
      if (k >= 1) tl.on = 0;
    }
    if (t >= (two ? 2.6 : 1.7)) { this.tl = null; this.swing = -1; this.relax(); this.tzy = this.hoverY(); this.spdY = 300; this.done(1.0); }
  }
  /** 꼬리 한 번 휩쓸기: dir +1 = 뒤 → 앞, −1 = 앞 → 뒤. 판정 띠(140 폭)가 꼬리 끝을 따라간다 */
  sweep(dir, y, h, t0) {
    const tl = this.tl;
    tl.on = dir; tl.t0 = t0; tl.y = y;
    this.swingY = this.toLocal(this.zx, y + h * 0.5).y;
    this.setPose({ curl: 0, raise: -0.4 });
    audio.sfx('whip', { pitch: 0.28 }); audio.sfx('dash', { pitch: 0.5 });
    this.zone({
      x: this.zx - 70, y, w: 140, h, warn: 0, life: 0.45, mv: 1.3, z: 7, kb: [520, -380],
      tick: (z) => { const P = this.toWorld(this.tailP[20], this.tailP[21]); z.x = P.x - 70; },
    });
  }

  // ── vanish (2페이즈+): 하늘로 솟구쳐 사라진다 → 바닥 그림자가 플레이어를 쫓다가 멈춘다(1.2초) → 그 자리에 내리꽂힌다
  //    (기둥 + 양쪽 충격파) → 1.4초 동안 바닥에서 숨을 고른다 (핵이 드러난 반격 창). 3페이즈: 내리꽂힌 뒤 양옆에 결정 가시
  s_vanish(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.setPose({ raise: 1, spread: 1, roar: 0.5, mouth: 0.4 }); this.flapMul = 2.6;
      this.tzy = this.camTop() - 420; this.spdY = 950; this.spd = 200;
      this.pitchT = -0.3;
      audio.sfx('bat', { pitch: 0.4, vol: 0.9 }); audio.sfx('whip', { pitch: 0.4 });
      world.fx.burst('dust', this.zx, A.floor - 6, 12, { speed: 200, angle: -PI / 2, spread: 1.2 });
    }
    if (this.at(0.7)) {
      this.hidden = true; this.invuln = true; this.harmless = true; this.flapMul = 1; this.pitchT = null;
      const p = this.P;
      this.vn = { x: p ? p.cx : A.cx, lock: false, stun: false };
      const vn = this.vn;
      this.zone({
        x: vn.x - 120, y: A.floor - 30, w: 240, h: 30, warn: 0, life: 1.3, harmless: true, z: 5,
        tick: (z) => { z.x = vn.x - 120; },
        paint: (ctx, z, w) => {
          const k = clamp(z.t / 1.25, 0, 1);
          ctx.fillStyle = `rgba(10,4,20,${(0.25 + 0.45 * k).toFixed(3)})`;
          ctx.beginPath(); ctx.ellipse(vn.x, A.floor - 4, 60 + 70 * k, 9 + 6 * k, 0, 0, TAU); ctx.fill();
          warnFloor(ctx, vn.x, A.floor, 220, k, VOID_L, w.time);
        },
      });
      audio.sfx('warning', { vol: 0.4, pitch: 0.8 });
    }
    const vn = this.vn;
    if (vn && !vn.lock && t < 1.75 && this.P) vn.x = approach(vn.x, clamp(this.P.cx, A.x0 + 120, A.x1 - 120), dt * 900);
    if (vn && this.at(1.75)) { vn.lock = true; telegraph(this, 0.3, { sfx: null }); }
    if (vn && this.at(1.95)) {
      this.hidden = false; this.invuln = false; this.harmless = true;
      this.zx = this.tzx = vn.x; this.zy = this.camTop() - 260; this.tzy = A.floor - 125; this.spdY = 0;
      this.pitchT = 0.5;
      this.setPose({ fold: 0.75, lunge: 1, mouth: 1, legs: 1, raise: 0, spread: 0, roar: 0 });
      audio.sfx('dash', { pitch: 0.35 });
    }
    if (vn && t > 1.95 && t < 2.2) { const k = clamp((t - 1.95) / 0.25, 0, 1); this.zy = this.tzy = lerp(this.camTop() - 260, A.floor - 125, k * k); }
    if (vn && this.at(2.2)) {
      this.zy = this.tzy = A.floor - 125; this.pitchT = 0.12; this.harmless = false;
      strikeColumn(this, vn.x, { w: 220, warn: 0, life: 0.25, mv: 1.8, element: 'dark', color: VOID_L, top: A.floor - 430, bottom: A.floor, sfx: 'explode', shake: 0 });
      for (const s of [-1, 1]) groundWave(this, vn.x, s, { h: 44, w: 40, speed: 600, mv: 1.0, color: VOID_L, sfx: null });
      impact(world, { shake: 16, time: 0.6, stop: 0.08 });
      world.fx.burst('dust', vn.x, A.floor - 8, 26, { speed: 320, angle: -PI / 2, spread: 1.4 });
      world.fx.burst('magic', vn.x, A.floor - 30, 16, { color: VOID_L, speed: 360 });
      this.stunned = true; vn.stun = true;
      this.setPose({ fold: 0.2, lunge: 0.6, mouth: 0.5, legs: 1, coreOpen: 1, bow: 0.3 });
      if (this.phase >= 2) for (const o of [-300, 300, -520, 520]) strikeFloor(this, clamp(vn.x + o, A.x0 + 40, A.x1 - 40), { w: 70, h: 150, warn: 0.6, life: 0.35, mv: 1.1, element: 'dark', color: VOID_L, sfx: null, onStart: () => audio.sfx('ice', { pitch: 0.6, vol: 0.5 }) });
    }
    if (vn?.stun && Math.random() < 0.3 * (world.fx.quality ?? 1)) world.fx.emit('dark', this.coreW.x, this.coreW.y, { speed: 60, color: VOID_M });
    if (vn && this.at(3.6)) { this.stunned = false; vn.stun = false; this.pitchT = null; this.setPose({ fold: 0, lunge: 0, legs: 0, coreOpen: 0, bow: 0, raise: 0.9, mouth: 0.6 }); this.tzy = this.hoverY(); this.spdY = 330; audio.sfx('bat', { pitch: 0.5 }); }
    if (t >= 4.1) { this.vn = null; this.relax(); this.done(0.9); }
  }

  // ── coreBurst (2페이즈+): 공허에 맞서 몸부림친다 — 가슴 비늘이 벌어져 핵이 크게 드러난다 (3.6초, 핵 방어 0.45 = 약점 창).
  //    그동안 핵에서 틈 둘 달린 공허 고리 셋이 퍼진다 (틈 하나는 플레이어 쪽 근처). 핵에 최대 체력 5% 를 넣으면 추락(stagger)
  s_coreBurst(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(10);
      this.tzx = clamp(this.zx, A.x0 + 260, A.x1 - 260); this.tzy = A.floor - 265; this.spd = 240; this.spdY = 260;
      this.setPose({ rear: 0.8, roar: 1, mouth: 1, coreOpen: 1, raise: -0.3, spread: 1, legs: 0.5 });
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.45, pitch: 0.7 });
      audio.sfx('dark', { pitch: 0.55, vol: 0.8 });
      screenTint(this, { color: '#1c0030', alpha: 0.12, edge: '#8a3cff', dur: 3.6 });
      this.cb = { dmg: 0, broke: false };
    }
    for (const at of [0.8, 1.9, 3.0]) {
      if (!this.at(at)) continue;
      const p = this.P, cx = this.coreW.x, cy = this.coreW.y;
      const toP = p ? Math.atan2(p.cy - cy, p.cx - cx) : PI / 2;
      const g = toP + rand(-0.7, 0.7);
      ringWave(this, cx, cy, { r0: 30, r1: 900, speed: 340, th: 20, warn: 0.45, gaps: [g, g + PI], gapW: 0.9, mv: 1.0, element: 'dark', color: VOID_L, sfx: null, onStart: () => audio.sfx('magic', { pitch: 0.45, vol: 0.6 }) });
      this.setPose({ rear: 0.8 + 0.2 * Math.sin(at * 7), roar: 1 });
    }
    if (Math.random() < 0.5 * (world.fx.quality ?? 1)) world.fx.emit('magic', this.coreW.x + rand(-20, 20), this.coreW.y + rand(-20, 20), { color: VOID_L, speed: 120 });
    if (t >= 3.9) { this.cb = null; this.relax(); this.tzy = this.hoverY(); this.done(0.8); }
  }
  /** 보조: 핵을 세게 맞아 추락 — 바닥 가까이 2초 기절 (핵 0.45), 그 뒤 날아오른다 */
  s_stagger(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.stunned = true; this.cb = null;
      this.tzy = A.floor - 140; this.spdY = 900; this.pitchT = 0.25;
      this.setPose({ fold: 0.4, coreOpen: 1, mouth: 0.7, roar: 0, rear: 0, legs: 1, bow: 0.5, raise: 0, spread: 0 });
      audio.sfx('hit_heavy', { pitch: 0.5 }); audio.sfx('dark', { pitch: 0.4 });
      world.fx.burst('magic', this.coreW.x, this.coreW.y, 14, { color: VOID_L, speed: 300 });
      warnText(this, '공허의 핵이 흔들린다!', VOID_L);
    }
    if (this.at(0.45)) { impact(world, { shake: 9, time: 0.35 }); world.fx.burst('dust', this.zx, A.floor - 6, 16, { speed: 240, angle: -PI / 2, spread: 1.3 }); }
    if (this.stunned && Math.random() < 0.3 * (world.fx.quality ?? 1)) world.fx.emit('dark', this.coreW.x, this.coreW.y, { speed: 50, color: VOID_M });
    if (this.at(2.4)) { this.stunned = false; this.pitchT = null; this.setPose({ fold: 0, coreOpen: 0, legs: 0, bow: 0, raise: 0.9, mouth: 0.5 }); this.tzy = this.hoverY(); this.spdY = 330; audio.sfx('bat', { pitch: 0.5 }); }
    if (t >= 2.9) { this.relax(); this.done(0.8); }
  }

  // ── storm (3페이즈): 은빛이 돌아오며 공허와 다툰다 — 경기장 한쪽 끝에서 다른 끝까지 높이 날며(2.4초)
  //    지나가는 자리 바로 아래에 0.25초마다 은빛 낙뢰(0.55초 예고), 0.6초마다 몸에서 공허 파편 셋이 튀어 포물선으로 떨어진다
  s_storm(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      const sx = this.zx < A.cx ? A.x0 + 180 : A.x1 - 180, ex = sx < A.cx ? A.x1 - 180 : A.x0 + 180;
      this.sm = { sx, ex, dir: Math.sign(ex - sx) || 1, on: false, t0: 0, next: 0, nextS: 0 };
      this.tzx = sx; this.tzy = Math.max((A.top ?? 0) + 150, A.floor - 430, this.camTop() + 170); this.spd = 900; this.spdY = 500;
      this.facing = this.sm.dir;
      this.setPose({ raise: 1, spread: 1, roar: 0.6, mouth: 0.6 });
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.45 });
      warnText(this, '은빛 번개가 깨어난다!', PURE);
      audio.sfx('thunderclap', { pitch: 0.7 }); this.lightning(0.7);
    }
    const s = this.sm;
    if (!s) { this.done(0.5); return; }
    if (this.at(0.8)) { s.sx = this.zx; s.dir = Math.sign(s.ex - s.sx) || s.dir; s.on = true; s.t0 = t; s.next = 0; s.nextS = 0.3; this.facing = s.dir; this.flapMul = 2; this.setPose({ raise: 0, spread: 0.5, roar: 0, mouth: 0.4 }); }
    if (s.on) {
      const tt = t - s.t0, k = clamp(tt / 2.4, 0, 1);
      this.zx = this.tzx = lerp(s.sx, s.ex, k);
      if (tt >= s.next && k < 0.98) {
        s.next += 0.25;
        const x = clamp(this.zx + s.dir * 110, A.x0 + 30, A.x1 - 30), seed = rand(0, 100), top = this.zy + 50;
        strikeColumn(this, x, {
          w: 62, warn: 0.55, life: 0.3, mv: 1.3, element: 'thunder', color: PURE, top, bottom: A.floor, sfx: null,
          onStart: (z, w) => { audio.sfx('thunder', { pitch: 1.1, vol: 0.45 }); w.fx.burst('thunder', x, A.floor - 6, 6, { speed: 260 }); },
          paint: (ctx, z, w) => paintBolt(ctx, z, x, top, A.floor, w, seed),
        });
      }
      if (tt >= s.nextS && k < 0.95) {
        s.nextS += 0.6;
        const P = this.toWorld(-10, -40, { x: 0, y: 0 });
        for (let i = 0; i < 3; i++) this.shoot({ x: P.x, y: P.y, vx: rand(-260, 260), vy: rand(-620, -420), w: 22, h: 22, life: 4, gravity: 0.45, render: shardRender, attack: { mv: 0.9, element: 'dark' }, light: { r: 50, color: VOID, i: 0.45 } });
        audio.sfx('ice', { pitch: 0.7, vol: 0.4 });
      }
      if (k >= 1) { s.on = false; this.flapMul = 1; this.tzy = this.hoverY(); this.spd = 160; this.spdY = 200; }
    }
    if (t >= 0.8 + 2.4 + 0.6) { this.sm = null; this.flapMul = 1; this.relax(); this.done(0.9); }
  }

  // ── 전환: corrupt (공허가 몸을 더 삼킨다: 결정이 자라고 가슴 비늘이 터져 핵이 드러남) · awaken (결정이 깨지며 은빛이 돌아온다) ──
  s_corrupt(dt, world, t) {
    if (this.at(0.001)) {
      this.transStart(world);
      this.setPose({ roar: 1, mouth: 1, rear: 0.7, raise: 1, spread: 1, coreOpen: 1 });
      screenTint(this, { color: '#1c0030', alpha: 0.22, edge: '#8a3cff', dur: 1.6 });
      audio.sfx('dark', { pitch: 0.4 });
    }
    if (this.at(0.7)) { world.fx.ring(this.coreW.x, this.coreW.y, { color: VOID_L, r0: 20, r1: 320, life: 0.7, width: 8 }); world.fx.burst('magic', this.coreW.x, this.coreW.y, 20, { color: VOID_L, speed: 320 }); impact(world, { shake: 9, time: 0.5 }); }
    if (this.at(1.4)) this.relax();
    this.transitionTick(dt, world, t);
  }
  s_awaken(dt, world, t) {
    if (this.at(0.001)) {
      this.transStart(world);
      this.setPose({ roar: 1, mouth: 1, rear: 0.5, raise: 1, spread: 1 });
      audio.sfx('thunderclap', { pitch: 0.8 }); this.lightning(0.9);
    }
    if (this.at(1.0)) { impact(world, { shake: 10, time: 0.6, flash: '#dff0ff', fa: 0.35 }); world.fx.ring(this.zx, this.zy, { color: PURE, r0: 30, r1: 420, life: 0.8, width: 10 }); audio.sfx('holy', { pitch: 0.8 }); }
    if (this.at(1.7)) this.relax();
    this.transitionTick(dt, world, t);
  }
  transStart(world) {
    this.stunned = false; this.hidden = false; this.flapMul = 1.5; this.aimK = 0; this.swing = -1; this.pitchT = null;
    this.br = this.dv = this.tl = this.vn = this.cb = this.sm = null; this.diveLeft = 0;
    this.tzx = this.zx; this.tzy = this.hoverY() - 40; this.spd = 200; this.spdY = 300;
    if (this.zy < this.camTop() - 40) this.zy = this.camTop() - 40;   // 하늘에 숨은 채 전환되면 화면 위에서 내려온다
    audio.sfx('bat', { pitch: 0.3 });
    impact(world, { shake: 8, time: 0.6 });
  }
  /** 형태 바꾸기 (페이즈마다 한 번, debugPhase 에도): 1 = 결정 성장 + 핵 노출, 2 = 결정 일부 깨짐 + 은빛 */
  applyPhase(k) {
    this.dmg = Math.max(this.dmg, k);
    if (k >= 1) { this.coreBase = 0.6; this.voidK = 1; for (const c of this.crys) if (c.ph <= 1 && c.brk > 1 && !c.alive) { c.alive = true; c.grow = 0; } }
    if (k >= 2) {
      this.silverK = Math.max(this.silverK, 0.45); this.voidK = 0.55; this.flapMul = 1;
      let n = 0;
      for (const c of this.crys) if (c.alive && c.brk <= 2 && !(c.breakIn > 0)) c.breakIn = 0.001 + 0.08 * n++;
    }
  }
  /** 결정 하나가 깨진다 (파편 효과 + 소리) */
  breakCrystal(c, fx = true) {
    if (!c.alive) return;
    c.alive = false; c.gone = 1;
    const w = this.world;
    if (!fx || !w?.fx) return;
    const P = this.toWorld(c.x, c.y);
    w.fx.burst('shard', P.x, P.y, 7, { color: VOID_M, speed: 260 });
    w.fx.burst('magic', P.x, P.y, 6, { color: VOID_L, speed: 200 });
    w.fx.burst('holy', P.x, P.y, 3, { color: PURE, speed: 120 });
    audio.sfx('ice', { pitch: 0.5 + Math.random() * 0.3, vol: 0.55 });
  }
  onCancel() {
    this.stunned = false; this.flapMul = 1; this.aimK = 0; this.pitchT = null; this.swing = -1;
    this.br = this.dv = this.tl = this.vn = this.cb = this.sm = null; this.diveLeft = 0;
    this.relax();
    if (this.zy < this.camTop() - 40) this.zy = this.camTop() - 40;
    this.spd = 160; this.spdY = 220; this.tzy = this.hoverY();
  }
  onReset() {
    this.dmg = 0; this.stunned = false; this.flapMul = 1; this.aimK = 0; this.pitchT = null; this.swing = -1;
    this.br = this.dv = this.tl = this.vn = this.cb = this.sm = null; this.diveLeft = 0;
    this.coreBase = 0; this.voidK = 0.7; this.silverK = 0; this.coreCrack = 0; this.hidden = false;
    for (const c of this.crys) { c.alive = c.ph === 0; c.grow = c.alive ? 1 : 0; c.gone = 0; c.breakIn = 0; }
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    this.tzx = this.zx; this.zy = this.tzy = this.hoverY(); this.spd = 160; this.spdY = 150;
  }

  // ═════════════════════════════ 정화 (체력 0) ═════════════════════════════
  onDeath(world) {
    this.clearJobs();   // 남은 지연 작업(바람 칼날 등)이 정화 중에 쏘지 않게
    this.dying = 5.0; this.dieT = 0; this.purified = false; this._bannered = false; this._landed = false; this._shattered = false;
    this.stunned = false; this.hidden = false; this.aimK = 0; this.pitchT = null; this.swing = -1; this.flapMul = 1.2;
    this.br = this.dv = this.tl = this.vn = this.cb = this.sm = null;
    if (this.zy < this.camTop() + 60) this.zy = this.camTop() + 60;
    this.tzx = this.zx; this.tzy = this.zy; this.spd = 60; this.spdY = 80;
    this.setPose({ roar: 1, rear: 0.6, mouth: 1, spread: 1, raise: 0.7, coreOpen: 1, fold: 0, lunge: 0, tail: 0, curl: 0, legs: 0, bow: 0 });
    audio.sfx('boss_roar', { pitch: 0.8 }); audio.sfx('dark', { pitch: 0.35 });
    world.fx.ring(this.coreW.x, this.coreW.y, { color: VOID_L, r0: 20, r1: 300, life: 0.8, width: 10 });
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    const T = this.dieT, A = this.A, q = world.fx.quality ?? 1;
    // 'STAGE CLEAR' 부제: 격파 → 정화 (보스 처치 처리는 그대로, 글자만)
    if (!this._bannered && world.banner?.sub) { this._bannered = true; world.banner.sub = `${this.def.name} 정화!`; }
    if (T < 1.1) {
      this.coreCrack = clamp(T / 1.0, 0, 1);
      this.tzx = this.zx + Math.sin(T * 41) * 2;
      if (Math.random() < 0.7 * q) world.fx.emit('magic', this.coreW.x + rand(-16, 16), this.coreW.y + rand(-16, 16), { color: VOID_L, speed: 160 });
    } else if (!this._shattered) {
      // 핵이 부서진다
      this._shattered = true; this.coreCrack = 1; this.coreBase = 0; this.purified = true;
      impact(world, { shake: 14, time: 0.8, flash: '#e8f2ff', fa: 0.55 });
      world.fx.ring(this.coreW.x, this.coreW.y, { color: '#ffffff', r0: 10, r1: 520, life: 0.9, width: 14 });
      world.fx.burst('magic', this.coreW.x, this.coreW.y, 30, { color: VOID_L, speed: 420 });
      world.fx.burst('shard', this.coreW.x, this.coreW.y, 18, { color: VOID_M, speed: 380 });
      world.fx.burst('holy', this.coreW.x, this.coreW.y, 20, { color: PURE, speed: 260 });
      audio.sfx('explode', { pitch: 1.3 }); audio.sfx('holy', { pitch: 0.7 }); this.lightning(1);
      // 남은 결정이 하나씩 깨진다 (1.1~2.7초)
      const left = this.crys.filter((c) => c.alive);
      left.forEach((c, i) => { c.breakIn = 0.12 + i * (1.4 / Math.max(1, left.length)); });
    }
    if (T > 1.1) {
      this.voidK = approach(this.voidK, 0, dt * 0.9);
      this.silverK = approach(this.silverK, 1, dt * 0.7);
      this.setPose({ coreOpen: 0 });
      if (Math.random() < 0.5 * q) { const P = this.toWorld(rand(-120, 120), rand(-60, 40)); world.fx.emit('holy', P.x, P.y, { color: PURE, speed: 60, angle: -PI / 2, spread: 0.8 }); }
    }
    // 1.6초: 날개를 접고 천천히 내려앉는다
    if (T >= 1.6 && T < 3.4) {
      this.setPose({ fold: 0.35, raise: 0.2, roar: 0, rear: 0, mouth: 0.1, legs: 1, spread: 0, bow: 0.55 });
      this.tzy = A.floor - 118; this.spdY = 150; this.flapMul = 0.8;
      if (!this._landed && this.zy >= A.floor - 122) { this._landed = true; world.fx.burst('dust', this.zx, A.floor - 6, 16, { speed: 180, angle: -PI / 2, spread: 1.4 }); audio.sfx('land', { pitch: 0.6 }); }
    }
    // 3.4초: 고개를 들고 날개를 편다 → 3.9초: 날아오른다
    if (T >= 3.4 && T < 3.9) this.setPose({ bow: 0, roar: 0.5, raise: 1, spread: 1, fold: 0, legs: 0.6, mouth: 0.3 });
    if (T >= 3.9) {
      this.setPose({ roar: 0.2, raise: 0, spread: 0.6, legs: 0, mouth: 0 });
      this.flapMul = 2.4; this.pitchT = -0.25;
      this.tzy = this.camTop() - 700; this.spdY = Math.min(1100, 200 + (T - 3.9) * 900);
      if (!this._rose) { this._rose = true; audio.sfx('bat', { pitch: 0.6, vol: 0.9 }); world.fx.ring(this.zx, this.zy, { color: PURE, r0: 30, r1: 360, life: 0.7, width: 8 }); }
    }
    this.motion(dt, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    if (this.hidden) return;
    const co = this.coreOpenK(), dk = this.dying > 0 ? clamp(1.1 - this.dieT, 0, 1) : 1;
    L.add(this.coreW.x, this.coreW.y, 160 + 140 * co, VOID, (0.35 + 0.45 * co) * dk * (0.4 + 0.6 * this.voidK));
    if (this.ps.mouth > 0.3 && (this.state === 'breath' || this.state === 'intro')) L.add(this.mouthW.x, this.mouthW.y, 160, PURE, 0.7 * this.ps.mouth);
    const sk = this.silverK;
    if (sk > 0.05) L.add(this.zx, this.zy, 320, PURE, 0.55 * sk);
    else L.add(this.zx, this.zy, 220, '#d8e4ff', 0.3);
  }

  // ═════════════════════════════ 그리기 (벡터) ═════════════════════════════
  paintBack(ctx) {
    if (R.fl) return;
    const spr = mistSprite();
    const vk = this.voidK * (this.dying > 0 ? clamp(1 - this.dieT / 2.4, 0, 1) : 1);
    if (spr && vk > 0.05) {
      ctx.save();
      for (const c of AURA) {
        const a = c.a + this.t * c.sp;
        const x = this.zx + Math.cos(a) * c.r, y = this.zy + c.y + Math.sin(a) * c.r * 0.4;
        ctx.globalAlpha = 0.32 * vk;
        ctx.drawImage(spr, x - c.s / 2, y - c.s * 0.35, c.s, c.s * 0.7);
      }
      ctx.restore();
    }
    if (this.silverK > 0.05) glowE(ctx, this.zx, this.zy - 20, 360, 220, PURE, 0.22 * this.silverK);
  }
  paintBody(ctx, world, flash) {
    const A = this.A, fl = R.fl;
    this.rig();
    ctx.save();
    ctx.beginPath(); ctx.rect(this.zx - 2000, -6000, 4000, A.floor + 6004); ctx.clip();   // 바닥 아래로는 그리지 않는다
    ctx.translate(this.zx, this.zy);
    ctx.scale(this.fk || 0.001, 1);
    if (this.pitch) ctx.rotate(this.pitch);
    if (flash) {
      // 피격 섬광: 화면을 덮는 날개막까지 하얗게 칠하지 않는다 → 몸통·목·머리·꼬리만, 약하게
      ctx.globalAlpha *= 0.6;
      this.drawTail(ctx, fl); this.drawTorso(ctx, fl); this.drawNeck(ctx, fl); this.drawHead(ctx, fl);
    } else this.drawArgen(ctx, fl);
    ctx.restore();
  }
  paintFront(ctx) {
    if (R.fl) return;
    // 정화: 몸을 감싸는 은빛 + 핵 자리의 빛
    if (this.dying > 0 && this.dieT > 1.1) {
      const k = clamp((this.dieT - 1.1) / 1.2, 0, 1) * (1 - clamp((this.dieT - 4.6) / 0.4, 0, 1));
      glowE(ctx, this.zx, this.zy, 260, 140, PURE, 0.35 * k);
      glow(ctx, this.coreW.x, this.coreW.y, 80, '#ffffff', 0.5 * k, true);
    }
  }
  /** 몸 전체 (지역 좌표: 원점 = 몸 중심, +x = 머리 쪽) */
  drawArgen(ctx, fl) {
    this.drawWing(ctx, this.wing.f, true, fl);
    this.drawLeg(ctx, this.legs.hf, true, fl);
    this.drawTail(ctx, fl);
    this.drawTorso(ctx, fl);
    this.drawCrystals(ctx, fl, 'body', 'tail');
    this.drawLeg(ctx, this.legs.hn, false, fl);
    this.drawFore(ctx, fl);
    this.drawNeck(ctx, fl);
    this.drawHead(ctx, fl);
    this.drawCrystals(ctx, fl, 'neck', 'head');
    this.drawWing(ctx, this.wing.n, false, fl);
    this.drawCrystals(ctx, fl, 'wing');
    this.drawCore(ctx, fl);
    if (!fl && this.silverK > 0.05) this.drawSilver(ctx);
  }

  drawWing(ctx, W, far, fl) {
    const S = W.S, E = W.E, Wr = W.Wr, F = W.F, t = this.t, dmg = this.dmg;
    // 막 (손가락 끝 사이는 오목한 물결)
    if (!fl) {
      ctx.beginPath();
      ctx.moveTo(S.x, S.y); ctx.lineTo(E.x, E.y); ctx.lineTo(Wr.x, Wr.y); ctx.lineTo(F[0].x, F[0].y);
      for (let i = 1; i < 4; i++) {
        const mx = (F[i - 1].x + F[i].x) / 2, my = (F[i - 1].y + F[i].y) / 2;
        ctx.quadraticCurveTo(lerp(mx, Wr.x, 0.42), lerp(my, Wr.y, 0.42), F[i].x, F[i].y);
      }
      ctx.quadraticCurveTo(lerp(lerp(F[3].x, BACK[0], 0.5), Wr.x, 0.3), lerp(lerp(F[3].y, BACK[1], 0.5), Wr.y, 0.3), BACK[0], BACK[1]);
      ctx.closePath();
      ctx.fillStyle = far ? 'rgba(70,82,110,0.86)' : LG(ctx, 'ag_memb', 0, -360, 0, 160, [0, 'rgba(220,232,250,0.74)', 0.5, 'rgba(164,184,222,0.7)', 1, 'rgba(96,112,150,0.8)']);
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,6,16,0.85)'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();
      // 막의 결: 손목 → 손가락 사이 · 공허 핏줄
      ctx.strokeStyle = far ? 'rgba(30,34,48,0.35)' : 'rgba(80,94,130,0.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const mx = (F[i].x + F[i + 1].x) / 2, my = (F[i].y + F[i + 1].y) / 2; ctx.moveTo(Wr.x, Wr.y); ctx.quadraticCurveTo(lerp(Wr.x, mx, 0.5) + 6, lerp(Wr.y, my, 0.5), mx, my); }
      ctx.stroke();
      if (this.voidK > 0.1 && !far) {
        ctx.strokeStyle = rgba(VOID, 0.45 * this.voidK); ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const u = 0.2 + i * 0.18; ctx.moveTo(lerp(E.x, Wr.x, u), lerp(E.y, Wr.y, u) + 6); ctx.lineTo(lerp(E.x, Wr.x, u) - 18 + hash(i) * 10, lerp(E.y, Wr.y, u) + 40 + hash(i + 3) * 30); }
        ctx.stroke();
      }
      // 찢긴 막 (손상 단계)
      if (dmg >= 1) {
        ctx.fillStyle = 'rgba(10,8,18,0.85)';
        const tears = dmg >= 2 ? 3 : 1;
        for (let i = 0; i < tears; i++) {
          const a = F[i], b = F[i + 1], x = lerp(lerp(a.x, b.x, 0.5), Wr.x, 0.35), y = lerp(lerp(a.y, b.y, 0.5), Wr.y, 0.35);
          ctx.beginPath(); ctx.moveTo(x - 8, y - 6); ctx.lineTo(x + 10, y - 2); ctx.lineTo(x + 2, y + 12); ctx.lineTo(x - 6, y + 4); ctx.closePath(); ctx.fill();
        }
      }
    }
    // 손가락 뼈
    const bone = far ? FAR : SIL_M;
    if (!fl) {
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = 'rgba(8,6,16,0.9)'; ctx.lineWidth = 7 - i;
        ctx.beginPath(); ctx.moveTo(Wr.x, Wr.y); ctx.lineTo(F[i].x, F[i].y); ctx.stroke();
        ctx.strokeStyle = bone; ctx.lineWidth = 4.2 - i * 0.7; ctx.stroke();
      }
    }
    // 팔 (위팔 · 아래팔) + 손목 발톱
    tube(ctx, S.x, S.y, E.x, E.y, 15 * W.sc, 11 * W.sc, fl ? '#fff' : far ? FAR : SIL, far ? 'ag_hum_f' : 'ag_hum', 2.4);
    tube(ctx, E.x, E.y, Wr.x, Wr.y, 11 * W.sc, 7 * W.sc, fl ? '#fff' : far ? FAR : SIL, far ? 'ag_rad_f' : 'ag_rad', 2.2);
    const ca = W.a2 - PI / 2 - 0.4;
    ctx.beginPath();
    ctx.moveTo(Wr.x + Math.cos(ca + 1.5) * 5, Wr.y + Math.sin(ca + 1.5) * 5);
    ctx.quadraticCurveTo(Wr.x + Math.cos(ca) * 16, Wr.y + Math.sin(ca) * 16 - 4, Wr.x + Math.cos(ca) * 26, Wr.y + Math.sin(ca) * 26);
    ctx.lineTo(Wr.x + Math.cos(ca - 1.5) * 5, Wr.y + Math.sin(ca - 1.5) * 5); ctx.closePath();
    ink(ctx, C(far ? HORN_D : HORN), 1.6);
    if (!fl && !far) {
      // 팔 등줄기 비늘 능선
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(S.x, S.y - 10); ctx.lineTo(E.x, E.y - 8); ctx.lineTo(Wr.x, Wr.y - 5); ctx.stroke();
    }
  }

  drawLeg(ctx, leg, far, fl) {
    const H = leg.hip, K = leg.knee, F = leg.foot, col = fl ? '#fff' : far ? FAR : SIL;
    tube(ctx, H.x, H.y, K.x, K.y, 22, 14, col, far ? 'ag_th_f' : 'ag_th', 2.4);
    tube(ctx, K.x, K.y, F.x, F.y, 12, 8, col, far ? 'ag_sh_f' : 'ag_sh', 2.2);
    // 발톱 넷
    const open = 0.35 + this.ps.legs * 0.4;
    for (let k = 0; k < 4; k++) {
      const a = PI / 2 + (k - 1.5) * (0.28 + open * 0.2), L = 26 + (k === 1 || k === 2 ? 6 : 0);
      const tx = F.x + Math.cos(a) * L, ty = F.y + Math.sin(a) * L, nx = -Math.sin(a), ny = Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(F.x + nx * 5, F.y + ny * 5);
      ctx.quadraticCurveTo(F.x + Math.cos(a) * L * 0.6 + nx * 4, F.y + Math.sin(a) * L * 0.6 + ny * 4, tx, ty);
      ctx.quadraticCurveTo(F.x + Math.cos(a) * L * 0.6 - nx * 4, F.y + Math.sin(a) * L * 0.6 - ny * 4, F.x - nx * 5, F.y - ny * 5);
      ctx.closePath();
      ink(ctx, C(far ? HORN_D : HORN), 1.6);
    }
  }
  drawFore(ctx, fl) {
    const L = this.legs.fn, col = fl ? '#fff' : SIL;
    tube(ctx, L.hip.x, L.hip.y, L.knee.x, L.knee.y, 13, 9, col, 'ag_fu', 2.2);
    tube(ctx, L.knee.x, L.knee.y, L.foot.x, L.foot.y, 9, 6, col, 'ag_fl', 2);
    for (let k = 0; k < 3; k++) {
      const a = 0.6 + k * 0.45, x = L.foot.x, y = L.foot.y;
      ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.quadraticCurveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12 - 2, x + Math.cos(a) * 18, y + Math.sin(a) * 18); ctx.lineTo(x + 3, y + 3); ctx.closePath();
      ink(ctx, C(HORN), 1.4);
    }
  }

  drawTail(ctx, fl) {
    const T = this.tailP;
    taper(ctx, T, TN, 27, 5);
    ink(ctx, fl ? '#fff' : LG(ctx, 'ag_tail', 0, -80, 0, 220, [0, SIL_L, 0.35, SIL, 0.75, SIL_M, 1, SIL_D]), 2.6);
    if (fl) return;
    // 배 비늘 띠 (아래쪽) + 등 가시
    bellyBand(ctx, T, TN, 27, 5, 1, 'ag_tbelly');
    for (let i = 1; i < TN - 1; i++) {
      const x = T[i * 2], y = T[i * 2 + 1], tx = T[i * 2 + 2] - T[i * 2 - 2], ty = T[i * 2 + 3] - T[i * 2 - 1], L = Math.hypot(tx, ty) || 1;
      const nx = -ty / L, ny = tx / L, r = lerp(27, 5, i / (TN - 1));
      if (r > 6) {
        const bx = x + nx * r * 0.9, by = y + ny * r * 0.9, sl = r * 0.7;
        ctx.beginPath(); ctx.moveTo(bx - tx / L * 5, by - ty / L * 5); ctx.lineTo(bx + nx * sl - tx / L * 6, by + ny * sl - ty / L * 6); ctx.lineTo(bx + tx / L * 5, by + ty / L * 5); ctx.closePath();
        ink(ctx, HORN, 1.2);
      }
    }
    // 비늘 무늬
    ctx.strokeStyle = 'rgba(70,80,104,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 1; i < TN - 2; i++) { const x = T[i * 2], y = T[i * 2 + 1]; const r = lerp(22, 5, i / (TN - 1)); ctx.moveTo(x - r * 0.5, y - r * 0.2); ctx.quadraticCurveTo(x, y + r * 0.3, x + r * 0.5, y - r * 0.2); }
    ctx.stroke();
    // 꼬리 지느러미 (잎 모양)
    const n = TN - 1, ex = T[n * 2], ey = T[n * 2 + 1], a = Math.atan2(ey - T[n * 2 - 1], ex - T[n * 2 - 2]);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(18, -30, 52, -6); ctx.quadraticCurveTo(30, 2, 52, 10); ctx.quadraticCurveTo(18, 26, -6, 0); ctx.closePath();
    ink(ctx, LG(ctx, 'ag_fin', 0, -30, 0, 26, [0, SIL_L, 0.6, SIL_M, 1, SIL_D]), 1.8);
    ctx.strokeStyle = 'rgba(80,90,120,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(40, -6); ctx.moveTo(0, 0); ctx.lineTo(38, 8); ctx.stroke();
    ctx.restore();
  }

  drawTorso(ctx, fl) {
    const t = this.t;
    ctx.beginPath();
    ctx.moveTo(104, -32);
    ctx.bezierCurveTo(80, -60, 10, -64, -40, -54);
    ctx.bezierCurveTo(-80, -46, -112, -30, -116, -14);
    ctx.lineTo(-114, 14);
    ctx.bezierCurveTo(-90, 34, -40, 58, 10, 58);
    ctx.bezierCurveTo(60, 56, 96, 46, 110, 26);
    ctx.bezierCurveTo(118, 10, 116, -14, 104, -32);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'ag_torso', 0, -64, 0, 60, [0, SIL_L, 0.3, SIL, 0.72, SIL_M, 1, SIL_D]), 3);
    if (fl) return;
    // 배 비늘판
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-104, 18); ctx.bezierCurveTo(-60, 44, 0, 60, 60, 52); ctx.bezierCurveTo(90, 46, 108, 30, 110, 20); ctx.lineTo(96, 30); ctx.bezierCurveTo(60, 44, 0, 46, -60, 30); ctx.closePath();
    ctx.fillStyle = BELLY; ctx.fill();
    ctx.strokeStyle = BELLY_D; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < 9; i++) { const u = i / 8, x = lerp(-96, 104, u), y0 = 24 + Math.sin(u * PI) * 24; ctx.moveTo(x - 6, y0 - 2); ctx.lineTo(x - 2, y0 + 12); }
    ctx.stroke();
    ctx.restore();
    // 비늘 무늬
    ctx.strokeStyle = 'rgba(70,80,104,0.32)'; ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let r = 0; r < 4; r++) for (let c = -5; c <= 4; c++) {
      const x = c * 22 + (r % 2) * 11, y = -44 + r * 18;
      if (Math.abs(x) > 104 - r * 6) continue;
      ctx.moveTo(x - 10, y); ctx.quadraticCurveTo(x, y + 9, x + 10, y);
    }
    ctx.stroke();
    // 등 가시 줄
    for (let i = 0; i < 9; i++) {
      const u = i / 8, x = lerp(96, -104, u), y = -54 - Math.sin(u * PI) * 8 + (u > 0.8 ? (u - 0.8) * 120 : 0), h = 12 + Math.sin(u * PI) * 6;
      ctx.beginPath(); ctx.moveTo(x - 7, y + 4); ctx.lineTo(x - 2, y - h); ctx.lineTo(x + 7, y + 4); ctx.closePath();
      ink(ctx, HORN, 1.3);
    }
    // 등 윤곽 은빛 하이라이트
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(98, -38); ctx.bezierCurveTo(70, -58, 10, -60, -40, -50); ctx.stroke();
    // 공허 핏줄 (결정·핵에서 퍼진다)
    const vk = this.voidK;
    if (vk > 0.05) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(VOID, 0.35 * vk + 0.1 * vk * Math.sin(t * 3)); ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9 + 0.4, L = 30 + hash(i * 2.7) * 40 * (0.6 + this.dmg * 0.25);
        ctx.moveTo(CC[0], CC[1]); ctx.quadraticCurveTo(CC[0] + Math.cos(a) * L * 0.5 + 8, CC[1] + Math.sin(a) * L * 0.5, CC[0] + Math.cos(a) * L, CC[1] + Math.sin(a) * L);
      }
      for (const c of this.crys) {
        if (c.at !== 'body' || !c.alive) continue;
        for (let k = 0; k < 2; k++) { const a = c.a + PI + (k - 0.5) * 1.2; ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26); }
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  drawNeck(ctx, fl) {
    const N = this.neck;
    taper(ctx, N, NN, 31, 19);
    ink(ctx, fl ? '#fff' : LG(ctx, 'ag_neck', 0, -260, 0, 40, [0, SIL_L, 0.45, SIL, 1, SIL_M]), 2.6);
    if (fl) return;
    bellyBand(ctx, N, NN, 31, 19, -1, 'ag_nbelly');
    for (let i = 1; i < NN - 1; i++) {
      const x = N[i * 2], y = N[i * 2 + 1], tx = N[i * 2 + 2] - N[i * 2 - 2], ty = N[i * 2 + 3] - N[i * 2 - 1], L = Math.hypot(tx, ty) || 1;
      const nx = ty / L, ny = -tx / L, r = lerp(31, 19, i / (NN - 1));
      // 등 가시
      const bx = x + nx * r * 0.92, by = y + ny * r * 0.92, sl = 10;
      ctx.beginPath(); ctx.moveTo(bx - tx / L * 5, by - ty / L * 5); ctx.lineTo(bx + nx * sl - tx / L * 7, by + ny * sl - ty / L * 7); ctx.lineTo(bx + tx / L * 5, by + ty / L * 5); ctx.closePath();
      ink(ctx, HORN, 1.2);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < NN; i++) { const x = N[i * 2], y = N[i * 2 + 1] - lerp(24, 15, i / (NN - 1)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  }

  drawHead(ctx, fl) {
    const H = this.head, t = this.t, s = this.ps, sk = this.silverK;
    ctx.save();
    ctx.translate(H.lx, H.ly); ctx.rotate(H.a);
    const jaw = H.jaw;
    // 뿔 둘 (뒤쪽 뿔은 어둡게)
    for (const [k, col] of [[0, HORN_D], [1, HORN]]) {
      const oy = k ? 0 : -6, ox = k ? 0 : 8;
      ctx.beginPath();
      ctx.moveTo(-18 + ox, -20 + oy); ctx.quadraticCurveTo(-60 + ox, -44 + oy, -118 + ox * 2, -40 + oy * 2);
      ctx.quadraticCurveTo(-70 + ox, -30 + oy, -30 + ox, -8 + oy); ctx.closePath();
      ink(ctx, fl ? '#fff' : (k ? LG(ctx, 'ag_horn', 0, -44, 0, -8, [0, '#fffaf0', 0.5, HORN, 1, HORN_D]) : col), 1.8);
      if (!fl) { ctx.strokeStyle = 'rgba(120,108,84,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); for (let r = 1; r < 5; r++) { const x = -30 - r * 16 + ox, y = -24 - r * 3 + oy; ctx.moveTo(x, y - 6); ctx.lineTo(x + 3, y + 5); } ctx.stroke(); }
    }
    // 입 안 (번개 숨결 빛)
    if (jaw > 0.12) {
      ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(78, 8); ctx.lineTo(-14 + Math.cos(jaw) * 92, 14 + Math.sin(jaw) * 92); ctx.closePath();
      ctx.fillStyle = C(MOUTH); ctx.fill();
      if (!fl) { glowE(ctx, 22, 14 + jaw * 26, 46, 18, THROAT, 0.6); if (this.state === 'breath' || s.mouth > 0.7) glowE(ctx, 30, 14 + jaw * 24, 70, 24, PURE, 0.55 * s.mouth); }
    }
    // 아래턱 (경첩 (−16, 12) 에서 돈다)
    ctx.save(); ctx.translate(-16, 12); ctx.rotate(jaw);
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(88, -2); ctx.quadraticCurveTo(94, 2, 86, 8); ctx.lineTo(10, 14); ctx.quadraticCurveTo(-6, 12, 0, -3); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'ag_jaw', 0, -3, 0, 14, [0, SIL, 1, SIL_D]), 2.2);
    if (!fl) {
      ctx.fillStyle = BELLY; ctx.beginPath(); ctx.moveTo(8, 10); ctx.lineTo(80, 6); ctx.lineTo(84, 9); ctx.lineTo(10, 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fbf6e8'; ctx.beginPath(); for (let k = 0; k < 8; k++) { const x = 16 + k * 9; ctx.moveTo(x, -2); ctx.lineTo(x + 3, -9); ctx.lineTo(x + 6, -2); } ctx.fill();
    }
    ctx.restore();
    // 위턱 + 머리뼈
    ctx.beginPath();
    ctx.moveTo(-46, 4);
    ctx.bezierCurveTo(-50, -18, -26, -30, 0, -26);
    ctx.bezierCurveTo(30, -22, 62, -12, 82, -2);
    ctx.quadraticCurveTo(92, 4, 84, 10);
    ctx.lineTo(-10, 12);
    ctx.quadraticCurveTo(-34, 16, -46, 4);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'ag_skull', 0, -30, 0, 14, [0, SIL_L, 0.4, SIL, 1, SIL_D]), 2.6);
    if (!fl) {
      ctx.fillStyle = '#fbf6e8'; ctx.beginPath(); for (let k = 0; k < 9; k++) { const x = 4 + k * 8.5; ctx.moveTo(x, 10); ctx.lineTo(x + 3, 17); ctx.lineTo(x + 6, 10); } ctx.fill();
      // 머리 볏 가시
      for (let k = 0; k < 4; k++) { const x = -40 + k * 9, y = -14 - k * 4; ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x - 12, y - 8); ctx.lineTo(x + 5, y + 2); ctx.closePath(); ink(ctx, HORN, 1.1); }
      // 콧구멍 · 뺨 비늘 · 눈썹 능선
      ctx.fillStyle = '#1a1620'; ctx.beginPath(); ctx.ellipse(70, -4, 5, 2.2, -0.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(70,80,104,0.45)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const x = -26 + k * 12; ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + 5, 6, x + 10, 0); } ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-30, -24); ctx.bezierCurveTo(-6, -30, 30, -22, 76, -6); ctx.stroke();
      if (this.voidK > 0.1) { ctx.strokeStyle = rgba(VOID, 0.5 * this.voidK); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-20, 4); ctx.lineTo(-4, -2); ctx.lineTo(4, 6); ctx.moveTo(-30, -6); ctx.lineTo(-18, -12); ctx.stroke(); }
      // 눈: 공허 보라 → 은빛 하늘색
      const ec = sk > 0.5 ? PURE : VOID_L, ek = 0.75 + 0.25 * Math.sin(t * 7);
      ctx.fillStyle = '#0a0612'; ctx.beginPath(); ctx.moveTo(-2, -12); ctx.quadraticCurveTo(10, -20, 22, -12); ctx.quadraticCurveTo(10, -6, -2, -12); ctx.fill();
      glow(ctx, 10, -12, 26, ec, 0.75 * ek);
      ctx.fillStyle = sk > 0.5 ? '#e8f8ff' : '#f0d8ff'; ctx.beginPath(); ctx.ellipse(10, -12.5, 7, 3.2, -0.15, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0a0612'; ctx.beginPath(); ctx.ellipse(11, -12.5, 1.4, 3, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /** 공허 결정 (부착 종류별). 깨진 결정은 그리지 않는다 (파편은 효과 입자) */
  drawCrystals(ctx, fl, ...kinds) {
    for (const c of this.crys) {
      if (!c.alive || c.grow <= 0.02 || !kinds.includes(c.at)) continue;
      drawCrystal(ctx, c.x, c.y, c.wa, c.s * (0.3 + 0.7 * c.grow), fl, this.t, c.s * 13.7 + (c.i ?? 0));
    }
  }
  /** 가슴의 공허 핵: 1페이즈는 비늘 아래 희미한 빛, 2페이즈부터 비늘이 벌어져 드러난다. 정화 때 금이 가 부서진다 */
  drawCore(ctx, fl) {
    const co = this.coreOpenK(), t = this.t, x = CC[0], y = CC[1];
    const shattered = this.purified;
    const r = 14 + co * 12;
    if (co > 0.05 || shattered) {
      // 벌어진 비늘 구멍
      ctx.beginPath(); ctx.ellipse(x, y, r + 8, r + 5, 0.2, 0, TAU);
      ctx.fillStyle = C('#14061f'); ctx.fill();
      if (!fl) {
        ctx.strokeStyle = SIL_D; ctx.lineWidth = 3; ctx.stroke();
        // 들뜬 비늘 조각
        ctx.fillStyle = SIL_M; ctx.strokeStyle = OUTL; ctx.lineWidth = 1.2;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * TAU + 0.3, rr = r + 8, lift = co * 8;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a - 0.3) * rr, y + Math.sin(a - 0.3) * rr);
          ctx.lineTo(x + Math.cos(a) * (rr + lift + 6), y + Math.sin(a) * (rr + lift + 6));
          ctx.lineTo(x + Math.cos(a + 0.3) * rr, y + Math.sin(a + 0.3) * rr);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
    }
    if (fl) return;
    if (shattered) { glow(ctx, x, y, 40, PURE, 0.6 * this.silverK, true); return; }
    const pulse = 0.8 + 0.2 * Math.sin(t * 6) + 0.08 * Math.sin(t * 17);
    if (co < 0.05) { glow(ctx, x, y, 26 * pulse, VOID, 0.35); return; }
    // 핵 보석 (깎인 면) + 맥동
    glow(ctx, x, y, r * 3.6 * pulse, VOID, 0.75 * co);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.4);
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, rr = r * (k % 2 ? 0.78 : 1); if (k) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fillStyle = '#2a0a4a'; ctx.fill(); ctx.strokeStyle = VOID_L; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = rgba(VOID_L, 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.stroke();
    ctx.restore();
    glow(ctx, x, y, r * 1.1, '#ffffff', 0.55 * pulse * co, true);
    // 정화 직전의 금
    if (this.coreCrack > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = 1.6;
      ctx.beginPath();
      const n = 1 + Math.floor(this.coreCrack * 5);
      for (let k = 0; k < n; k++) { const a = hash(k * 3.1) * TAU; boltPath(ctx, x, y, x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4, 4, 4, k + 7); }
      ctx.stroke(); ctx.restore();
    }
  }
  /** 은빛이 돌아온다: 비늘 가장자리의 빛 + 몸에 흐르는 은빛 */
  drawSilver(ctx) {
    const k = this.silverK, t = this.t;
    glowE(ctx, 0, -10, 150, 70, PURE, 0.28 * k);
    glowE(ctx, this.head.lx, this.head.ly, 70, 50, PURE, 0.3 * k);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(BOLT, 0.5 * k); ctx.lineWidth = 1.5;
    const b = Math.floor(t * 6);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const u = hash(b + i * 5.3); boltPath(ctx, lerp(-90, 90, u), -50, lerp(-90, 90, u) + 30, 30, 4, 6, b + i); }
    ctx.stroke(); ctx.restore();
  }
}

// ═════════════════════════════ 도우미 ═════════════════════════════
const OUTL = 'rgba(8,6,16,0.9)';
/** 점 배열을 따라 굵기가 r0 → r1 로 줄어드는 몸통 경로 */
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
/**
 * 배 비늘 띠: 점 배열의 배 쪽(side: +1 = 진행 방향의 오른쪽 법선 (꼬리처럼 뒤로 뻗을 때 아래), −1 = 반대 (목))
 * 바깥 가장자리 r·0.95 ~ 안쪽 r·0.2 를 채우고 판 경계선을 긋는다
 */
function bellyBand(ctx, P, n, r0, r1, side, key) {
  const nx = (i) => { const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), dx = P[i1 * 2] - P[i0 * 2], dy = P[i1 * 2 + 1] - P[i0 * 2 + 1], L = Math.hypot(dx, dy) || 1; return [side * -dy / L * -1, side * dx / L * -1]; };
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const [ax, ay] = nx(i), r = lerp(r0, r1, i / (n - 1)) * 0.95; const x = P[i * 2] + ax * r, y = P[i * 2 + 1] + ay * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  for (let i = n - 1; i >= 0; i--) { const [ax, ay] = nx(i), r = lerp(r0, r1, i / (n - 1)) * 0.2; ctx.lineTo(P[i * 2] + ax * r, P[i * 2 + 1] + ay * r); }
  ctx.closePath();
  ctx.fillStyle = LG(ctx, key, 0, -200, 0, 220, [0, '#f4ecd8', 0.5, BELLY, 1, BELLY_D]); ctx.fill();
  ctx.strokeStyle = BELLY_D; ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 1; i < n - 1; i++) { const [ax, ay] = nx(i), r = lerp(r0, r1, i / (n - 1)); ctx.moveTo(P[i * 2] + ax * r * 0.95, P[i * 2 + 1] + ay * r * 0.95); ctx.lineTo(P[i * 2] + ax * r * 0.25, P[i * 2 + 1] + ay * r * 0.25); }
  ctx.stroke();
}
/** 공허 결정 한 무더기 (조각 셋, 바닥 → a 방향으로 자란다) */
function drawCrystal(ctx, x, y, a, s, fl, t, seed) {
  if (s <= 0.01) return;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(a + PI / 2); ctx.scale(s, s);
  if (!fl) glow(ctx, 0, -14, 34, VOID, 0.4 + 0.15 * Math.sin(t * 3 + seed));
  const shards = [[0, 46, 15], [-0.48, 30, 11], [0.42, 25, 10]];
  for (const [da, L, w] of shards) {
    ctx.save(); ctx.rotate(da);
    ctx.beginPath(); ctx.moveTo(-w / 2, 2); ctx.lineTo(-w * 0.42, -L * 0.7); ctx.lineTo(0, -L); ctx.lineTo(w * 0.45, -L * 0.66); ctx.lineTo(w / 2, 2); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'ag_crys', 0, 0, 0, -46, [0, VOID_D, 0.5, '#2c0c52', 0.85, VOID_M, 1, VOID_L]), 1.6);
    if (!fl) {
      ctx.strokeStyle = rgba(VOID_L, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -L); ctx.lineTo(w * 0.05, 0); ctx.moveTo(-w * 0.42, -L * 0.7); ctx.lineTo(0, -L * 0.5); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
/** 은빛 번개 숨결: 입 → 바닥 지점 (판정 = 같은 선분, 굵기 30) */
function paintBreath(ctx, z, w, b) {
  const L = z.line;
  if (!L || !z.on) return;
  const f = 0.85 + 0.15 * Math.sin(w.time * 40);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(SKY, 0.45 * f); ctx.lineWidth = 46;
  ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
  ctx.strokeStyle = rgba(PURE, 0.8 * f); ctx.lineWidth = 22;
  ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.95); ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
  const s = Math.floor(z.t * 24) + b.seed;
  ctx.strokeStyle = rgba(BOLT, 0.8); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let k = 0; k < 2; k++) boltPath(ctx, L.x0, L.y0, L.x1, L.y1, 9, 18, s + k * 5);
  ctx.stroke();
  glow(ctx, L.x1, L.y1, 110, PURE, 0.8 * f);
  glow(ctx, L.x0, L.y0, 50, '#ffffff', 0.7, true);
}
/** 떨어지는 공허 결정: 예고 = 바닥 표식 + 흐린 기둥, 막판에 결정이 떨어진다 → 판정 = 바닥에 박혀 부서짐 */
function paintCrystalFall(ctx, z, w, x, top, bot, seed) {
  if (!z.started) {
    warnRect(ctx, x - 14, top, 28, bot - top, z.k * 0.5, VOID_L, w.time);
    warnFloor(ctx, x, bot, 96, z.k, VOID_L, w.time);
    if (z.k > 0.55) { const k = (z.k - 0.55) / 0.45; drawCrystal(ctx, x, lerp(top, bot - 30, k * k), PI / 2, 1.0, false, w.time, seed); }
    return;
  }
  const f = 1 - z.a;
  drawCrystal(ctx, x, bot - 4, -PI / 2, 1.1 * (0.4 + 0.6 * f), false, w.time, seed);
  ctx.globalCompositeOperation = 'lighter';
  glowE(ctx, x, (top + bot) / 2, 34, (bot - top) / 2, VOID, 0.35 * f);
  glow(ctx, x, bot - 20, 90, VOID_L, 0.7 * f);
}
/** 은빛 낙뢰 (storm) */
function paintBolt(ctx, z, x, top, bot, w, seed) {
  if (!z.started) {
    warnRect(ctx, x - 16, top, 32, bot - top, z.k * 0.7, PURE, w.time);
    warnFloor(ctx, x, bot, 80, z.k, PURE, w.time);
    return;
  }
  const f = 1 - z.a;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  glowE(ctx, x, (top + bot) / 2, 50, (bot - top) / 2, PURE, 0.5 * f);
  const b = Math.floor(z.t * 30) + seed;
  ctx.strokeStyle = rgba(PURE, 0.85 * f); ctx.lineWidth = 10;
  ctx.beginPath(); boltPath(ctx, x, top, x, bot, 12, 18, b); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.95 * f); ctx.lineWidth = 3.5;
  ctx.beginPath(); boltPath(ctx, x, top, x, bot, 12, 18, b); ctx.stroke();
  glow(ctx, x, bot - 10, 80, '#ffffff', 0.7 * f);
}
/** 바람 칼날 (초승달, 원점 = 탄 중심) */
function bladeRender(ctx, p) {
  const d = Math.sign(p.vx) || 1;
  ctx.scale(d, 1);
  glowE(ctx, -6, 0, 30, 18, PURE, 0.5);
  ctx.beginPath(); ctx.moveTo(-10, -16); ctx.quadraticCurveTo(18, 0, -10, 16); ctx.quadraticCurveTo(6, 0, -10, -16); ctx.closePath();
  ctx.fillStyle = 'rgba(230,244,255,0.85)'; ctx.fill();
  ctx.strokeStyle = 'rgba(159,216,255,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = 'rgba(220,240,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-26, -8); ctx.lineTo(-12, -6); ctx.moveTo(-30, 4); ctx.lineTo(-14, 3); ctx.stroke();
}
/** 공허 파편 탄 */
function shardRender(ctx, p) {
  ctx.rotate(Math.atan2(p.vy, p.vx) + PI / 2);
  glow(ctx, 0, 0, 26, VOID, 0.55);
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(6, 2); ctx.lineTo(0, 10); ctx.lineTo(-6, 2); ctx.closePath();
  ctx.fillStyle = '#2c0c52'; ctx.fill(); ctx.strokeStyle = VOID_L; ctx.lineWidth = 1.4; ctx.stroke();
}

/** 벡터 그림 컬링 대리 개체 (c_ziz.js 와 같은 방식): 보스의 artBounds() 를 사각형으로 삼아 보스 draw 를 대신 부른다 */
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
