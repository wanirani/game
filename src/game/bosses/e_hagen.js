// 보스 b_hagen — 늑대잡이 하겐 / 은빛 늑대 (s23 외전 「빈칸의 현상금」) — docs/specs/ex_s23.md §2. 소유: EX3-BOSS
// BossC(c_common.js) 상속. 구조·전환·15% 강제는 e_nemain.js(unmask·eclipse), 소환은 spawnMinion, 판정은 c_common 키트.
// 그림은 벡터(2부 기준 디테일, 채색이 없거나 실패해도 모든 상태가 그려진다); 채색 퍼핏(render/painted/bosses/b_hagen.js)은 이 논리를 읽기만 한다.
//
// 모습: 1페이즈 = 옆모습의 키 큰 마른 노인 (얼굴 쪽 = facing). 챙 넓은 낡은 모자, 희끗한 수염, 늑대처럼 노랗게 빛나는 눈, 눈이 엉긴 긴 가죽 외투(허리띠·
//   뒤가 갈라진 무릎 길이 자락), 은 탄띠, 긴 장총, 허리의 사냥칼. 2페이즈 = 은회색 거대한 늑대 (네 발로 서고 일어설 수 있다, 역관절 뒷다리, 긴 꼬리) —
//   찢어진 외투 자락·탄띠가 몸에 남아 있고 노란 눈에 사람의 빛이 흔들린다. 50% 전환(moonrise)에서 달빛을 받아 늑대가 된다 (form2 '은빛 늑대').
// 판정 부위 (가까운 부위 우선): 1페이즈 머리(모자) 0.9 · 몸통 1.0 (장전 노출 1.15) · 다리 1.15.
//   2페이즈 머리(주둥이) 1.2 — 노릴 곳 · 몸통 1.0 (달 그림자 노출 0.7 · 가슴을 내줌 1.6) · 외투 자락 등판 0.85 · 다리 1.1. 무릎(stagger) 몸통 0.7 · 머리 0.6.
//   달 그림자의 하늘 위(화면 밖)·사망 중에는 판정 없음 (ghost).
// 패턴 (static PATTERNS — docs/specs/ex_s23.md §2.1): aimedShot(조준 사격) · trapLine(은 올가미) · buckshot(산탄, 6칸 안일 때만) · huntingKnife(사냥칼,
//   카운터 창) · packCall(무리 부르기, 1·2페이즈) · pounce(덮치기, 카운터 창 · 세 번에 한 번 벽 차기) · clawRush(할퀴기 연타) · moonDive(달 그림자) ·
//   보조 stagger(무릎) · offer(체력 15% 이하 한 번 가슴을 내준다 + 대사 b_hagen_last → 곧바로 clawRush).
//   전환 moonrise (1: 무적 2.4초, 0.4초 달빛 → 1.0초 외투가 찢어진다 → 2.0초 늑대 (판정 크기 112×118, 발 위치 그대로) → 대사 b_hagen_moon → 곧바로 packCall).
// 모든 패턴은 this.A(경기장 경계)와 A.floor 만 기준으로 움직인다 (투기장 maps/arena.js r1 · 무한의 탑 보스 층도 같다). 방 기믹 없음.
//   덮치기만 발판에 내려앉을 수 있다 (플레이어가 선 발판 — A.floor 아래로는 가지 않는다); 그 뒤 걷거나 달리다 발판 끝을 넘으면 떨어진다.
// this.inferno(회차·악몽/지옥)는 읽지 않는다 — 세기는 stage.level · diff 한 길로만 (ngplus.md §3.1, 2부·외전 보스와 같다).
// 결말 (체력 0): 보스 처치 처리(world.onBossDefeated)는 같고 연출만 '쓰러짐' (5초, 파편 폭발 없음): 늑대가 눈밭에 쓰러지고(0–1.5초) ·
//   산마루 너머 새벽빛(화면 가장자리 호박빛, 1.5–3초) · 은빛 털이 눈송이처럼 흩어지며 사람 모습으로 눕는다(3–5초, 그 자세 유지)
//   (스토리: 스테이지가 끝날 때까지 누운 채 남는다 · 아케이드: 3.5초에 눈보라로 흩어져 사라진다). 'STAGE CLEAR' 부제의 '격파' → '결착'.
// 채색 렌더러가 읽는 필드: zx, fy (발) · fk (좌우 −1..1, 연속) · facing · wolf · morph (0 사람 → 1 늑대, 그리기용) · tearT · ps {…} ·
//   pts (사람 골격, rig()) · wp (늑대 골격) · tail (꼬리 점 6) · rf (장총 {x,y,a}) · gun · knifeOut · hornOut · rifleDrop · aimLock · recoil ·
//   ghost · stunned · exposed · reloading · offering · cWin · bristle · moonK · dawnK · dieT · vanishK · lieHuman · state · t · flashT · hitPart · A
// 컬링: 긴 장총·꼬리·하늘의 달 그림자가 몸통 판정보다 크므로 아르겐·네메인과 같은 ArtCull 대리 개체가 artBounds() 로 그린다.
import { BossC, telegraph, strikeRect, strikeLine, strikeCircle, ringWave, spawnMinion, minionsAlive, screenTint, prewarmTint, phaseScript, clearMood } from './c_common.js';
import { PI, R, LG, ink, glow, glowE, glowSprite, warnLine, warnFloor, impact, hash } from './b_common.js';
import { heldByFreeze } from './boss.js';
import { Entity } from '../entity.js';
import { enemyStrike } from '../combat.js';
import { TILE } from '../../core/game.js';
import { T as TT } from '../../core/physics.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';
import { registerPainted, hasPainted, paintedDraw, paintedRig, paintedEnabled } from '../../render/painted/registry.js';   // 채색 퍼핏 등록 (그리기 전용)
import { bosses as EXB } from '../../render/painted/reg/ex-boss.js';

// ── 색 (docs/specs/ex_s23.md §2: 은회 · 가죽 · 짙은 남색 그림자 · 등불 호박 · 달빛 푸른 가장자리) ──
const SILV = '#c8ccd8', SILV_D = '#7a7e8c', LEATH = '#4a3426', LEATH_H = '#6e5038', LEATH_D = '#2a1c14', NAVY = '#1a2030', AMBER = '#ffcf6a';
const MOON = '#a8c8ff', FUR = '#b4b8c6', FUR_D = '#5e6270', FUR_L = '#e4e8f0', SKIN = '#c8a488', SKIN_D = '#8a6a54', BEARD = '#c8c4c0';
const WOOD = '#5a3a22', IRON = '#3a3c44', BRASS = '#c89a4a', RED = '#ff3a30', SNOW = '#eef4ff';
// ── 패턴 계약 (docs/specs/ex_s23.md §2.1 — 클래스의 static PATTERNS 가 c_common P2_PATTERNS 보다 이긴다) ──
const PATTERNS = {
  attacks: ['aimedShot', 'trapLine', 'buckshot', 'huntingKnife', 'packCall', 'pounce', 'clawRush', 'moonDive'],
  helpers: ['stagger', 'offer'],
  // applyAt 2.0/2.4 = 전환 2.0초 (늑대 모습 · form2 이름·초상화 교체)
  transitions: { 1: { state: 'moonrise', dur: 2.4, script: 'b_hagen_moon', form2: true, force: 'packCall', applyAt: 2.0 / 2.4 } },
  weights: [
    { aimedShot: 3, buckshot: 3, huntingKnife: 3, trapLine: 2, packCall: 1 },
    { pounce: 3, clawRush: 3, moonDive: 2, packCall: 1 },
  ],
  gimmicks: [],
  floorRow: 16,
  // 설계 방 (§1.1 boss 얼음 수도원 앞뜰 — s21 · s22 boss 방과 같은 뼈대): 60×18, 경기장 17열부터, 바닥 16–17행, 11행 발판 셋 + 7행 높은 발판 둘
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7]] },
};
const T48 = () => TILE || 48;
const SIZE_H = { w: 60, h: 146 }, SIZE_W = { w: 112, h: 118 };   // 사람 · 늑대 판정 크기 (발 위치 고정)
// ── 사람 몸 지역 좌표 (+x = 얼굴 쪽, y 아래가 양수, 원점 = 발 가운데 바닥) ──
const TH = 40, SH = 40, TORSO = 40, UA = 26, FA = 26;   // 넓적다리 · 정강이(발바닥까지) · 몸통(엉덩이→목) · 위팔 · 아래팔(주먹까지) — 채색 부품(full_a lps 0.0635)의 비례
const RIFLE = 104, RG = 30, RF = 64, KNIFE = 30;        // 장총 (개머리판 끝 → 총구) · 방아쇠 손 · 앞손 자리 · 사냥칼
// ── 늑대 (네 발) ──
const SPINE = 65, FU = 32, FL = 36, HU = 30, HS = 24, HM = 36, TAIL_N = 6, TAIL_L = 14;   // 엉덩이→어깨 · 앞다리 위/아래 · 뒷다리 위/아래/발등 · 꼬리 마디 — 채색 부품(beast_a lps 0.1)의 비례
const POSE0 = { lean: 0, crouch: 0, kneel: 0, hunch: 0, lie: 0, rear: 0, run: 0, howl: 0, jaw: 0, bare: 0, sway: 0, recoil: 0, air: 0 };
const POSE_RATE = { lean: 9, crouch: 9, kneel: 7, hunch: 5, lie: 2.6, rear: 6, run: 8, howl: 7, jaw: 12, bare: 5, sway: 3, recoil: 18, air: 10 };
/** 사람 팔 자세 (각 = 몸 지역: 0 앞, π/2 아래) · gk = 주먹에서 칼 방향 */
const ARM = {
  idle: { n1: 1.3, n2: -0.25, f1: 1.42, f2: -0.2, gk: -0.4 },
  wind: { n1: 2.5, n2: -0.5, f1: 1.0, f2: -0.6, gk: 0 },
  throw: { n1: -0.35, n2: 0.15, f1: 1.5, f2: -0.2, gk: 0 },
  knife: { n1: 0.85, n2: -1.75, f1: 1.25, f2: -0.9, gk: -0.2 },
  slash1: { n1: -0.55, n2: -0.15, f1: 1.6, f2: -0.4, gk: 0.1 },
  slash2: { n1: 0.95, n2: -0.25, f1: 1.1, f2: -1.0, gk: 0.1 },
  horn: { n1: -0.15, n2: -2.55, f1: 1.42, f2: -0.2, gk: 0 },
  reload: { n1: 1.1, n2: -0.9, f1: 0.75, f2: -0.75, gk: 0 },
  clutch: { n1: -1.6, n2: -2.3, f1: 0.9, f2: -2.2, gk: 0 },
  limp: { n1: 1.45, n2: 0.2, f1: 1.55, f2: 0.1, gk: 0 },
  spread: { n1: 0.4, n2: 0.1, f1: 2.2, f2: 0.1, gk: 0 },
  lie: { n1: 0.08, n2: 0.05, f1: 0.15, f2: 0.05, gk: 0 },
};
const pt = () => ({ x: 0, y: 0 });
const rot = (x, y, a, out) => { const c = Math.cos(a), s = Math.sin(a); out.x = x * c - y * s; out.y = x * s + y * c; return out; };
/** 두 마디 IK (S → Tg, 길이 l1·l2). pick(e1,e2) 가 팔꿈치/무릎 쪽을 고른다. E = 관절, H = 끝 (닿는 만큼) */
function ik(S, Tg, l1, l2, E, H, pick) {
  const dx = Tg.x - S.x, dy = Tg.y - S.y, d = clamp(Math.hypot(dx, dy), 4, l1 + l2 - 0.5);
  const a = Math.atan2(dy, dx), c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), off = Math.acos(c);
  const ax = S.x + Math.cos(a - off) * l1, ay = S.y + Math.sin(a - off) * l1, bx = S.x + Math.cos(a + off) * l1, by = S.y + Math.sin(a + off) * l1;
  if (pick(ax, ay, bx, by)) { E.x = ax; E.y = ay; } else { E.x = bx; E.y = by; }
  if (H) { H.x = S.x + Math.cos(a) * d; H.y = S.y + Math.sin(a) * d; }
}
const lower = (ax, ay, bx, by) => ay >= by;   // 아래쪽 관절 (팔꿈치)
const back = (ax, ay, bx, by) => ax <= bx;    // 뒤쪽 관절 (늑대 앞다리 팔꿈치)
const front = (ax, ay, bx, by) => ax >= bx;   // 앞쪽 관절 (무릎)

export class Hagen extends BossC {
  static get PATTERNS() { return PATTERNS; }

  setup() {
    // 채색 퍼핏: 모음(reg/index.js)에 ex-boss 줄이 아직 없으면 여기서 한 번 등록 (이미 있으면 아무것도 안 함)
    if (!hasPainted?.('b_hagen') && EXB?.b_hagen) registerPainted?.('b_hagen', { kind: 'boss', importer: EXB.b_hagen });
    const A = this.A;
    this.noGravity = true; this.vx = 0; this.vy = 0;
    this.zx = clamp(this.cx, A.x0 + 90, Math.max(A.x0 + 90, A.x1 - 90)); this.fy = A.floor; this.vfy = 0; this.air = false;
    const p0 = this.P;
    this.facing = this.fk = p0 && p0.cx < this.zx ? -1 : 1;
    this.tzx = this.zx; this.spd = 0; this.walkPh = 0; this.walkK = 0;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    this.arm = { ...ARM.idle }; this.armT = { ...ARM.idle }; this.armRate = 12;
    this.pts = { hip: pt(), neck: pt(), head: pt(), eye: pt(), mouth: pt(), shN: pt(), shF: pt(), elN: pt(), elF: pt(), hdN: pt(), hdF: pt(),
      knN: pt(), knF: pt(), ftN: pt(), ftF: pt(), kTip: pt(), tA: 0, hA: 0 };
    this.wp = { hip: pt(), sh: pt(), neck: pt(), head: pt(), snout: pt(), eye: pt(), elN: pt(), elF: pt(), pwN: pt(), pwF: pt(),
      knN: pt(), knF: pt(), hkN: pt(), hkF: pt(), ftN: pt(), ftF: pt(), wa: 0, ha: 0 };
    this.pawN = { x: 30, y: 0 }; this.pawF = { x: 16, y: 0 }; this.pawPh = 0; this.paw = 'idle'; this.swipeK = 0;
    this.tail = Array.from({ length: TAIL_N + 1 }, pt);
    this.gun = 'port'; this.rf = { x: 0, y: -60, a: -1.2 }; this.aimA = 0; this.aimLock = false; this.recoil = 0;
    this.knifeOut = false; this.hornOut = false; this.rifleDrop = null;
    this.wolf = false; this.morph = 0; this.morphT = -1; this.tearT = -1; this.bristle = 0;
    this.ghost = false; this.stunned = false; this.exposed = false; this.reloading = false; this.offering = false; this.cWin = false; this.mexp = 0;
    this.moonK = 0; this.moonT = 0; this.dawnK = 0; this.dieT = 0; this.vanishK = 0; this.lieHuman = false;
    this._offered = false; this._lastPending = false; this._bn = null; this.pounceN = 0;
    this.as = this.tl = this.bs = this.kn = this.pc = this.pn = this.cr = this.md = this.of = null;
    this.traps = [];
    this.pHead = { x: 0, y: 0, w: 34, h: 34, defMul: 0.9 };
    this.pBody = { x: 0, y: 0, w: 40, h: 58, defMul: 1.0 };
    this.pLegs = { x: 0, y: 0, w: 36, h: 70, defMul: 1.15 };
    this.pBack = { x: 0, y: 0, w: 56, h: 44, defMul: 0.85 };
    this.cBody = { x: 0, y: 0, w: 40, h: 110 };
    this._hp = []; this._cp = []; this._pt = { x: 0, y: 0 }; this._r = { x: 0, y: 0 };
    this.fxAcc = 0;
    // 싸움 중 새 캔버스 0 (MASTER_PLAN §5.2): 쓰는 발광 색은 등장 때 굽는다
    for (const c of [AMBER, MOON, RED, '#ffffff', SNOW, '#ffe0a0']) { glowSprite(c, false); glowSprite(c, true); }
    prewarmTint([MOON, AMBER]);
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  camTop() { const c = this.world?.camera; return c && Number.isFinite(c.y) ? c.y : -1e9; }
  /** 달 그림자의 하늘 (화면 위 밖): 카메라 위 −60 · 바닥 −460 중 더 높은 곳 */
  skyY() { return Math.min(this.camTop() - 60, this.A.floor - 460); }
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; this.arms('idle'); this.paw = 'idle'; }
  arms(name, rate = 12) { Object.assign(this.armT, ARM[name] ?? ARM.idle); this.armRate = rate; }
  faceP(th = 40) { const p = this.P; if (p) { const d = p.cx - this.zx; if (Math.abs(d) > th) this.facing = Math.sign(d); } }
  /** 몸 지역 → 월드 (좌우 fk) */
  toWorld(lx, ly, out = this._pt) { out.x = this.zx + this.fk * lx; out.y = this.fy + ly; return out; }
  place() { this.x = this.zx - this.w / 2; this.y = this.fy - this.h; this.vx = 0; this.vy = 0; }
  hpK() { return this.stats?.maxHp ? this.hp / this.stats.maxHp : 1; }
  /** x 에서 y0 이하(같거나 아래)의 첫 디딤면 (바닥·발판) — 없으면 A.floor. A.floor 아래로는 가지 않는다 */
  surface(x, y0) {
    const A = this.A, m = this.world?.map, T = T48();
    if (!m?.typeAt || !(y0 < A.floor - 1)) return A.floor;
    const tx = Math.floor(clamp(x, A.x0 + 1, A.x1 - 1) / T);
    for (let ty = Math.max(0, Math.ceil((y0 - 2) / T)); ty * T < A.floor; ty++) {
      const t = m.typeAt(tx, ty);
      if (t === TT.SOLID || t === TT.ONEWAY || t === TT.BREAK) return Math.min(A.floor, ty * T);
    }
    return A.floor;
  }

  /** 사람 골격 (몸 지역 좌표): 엉덩이 · 목 · 머리 · 어깨 · 팔꿈치 · 주먹 · 무릎 · 발 + 장총 자리. 그리기·판정·채색이 같이 쓴다 */
  rig() {
    const s = this.ps, P = this.pts, a = this.arm, t = this.t;
    const wk = this.walkK, wp = this.walkPh;
    const kn = clamp(s.kneel, 0, 1), cr = clamp(s.crouch, 0, 1), lie = clamp(s.lie, 0, 1), hu = clamp(s.hunch, 0, 1);
    P.hip.x = lerp(-2 - 6 * kn + Math.sin(wp * 2) * 1.5 * wk, -6, lie); P.hip.y = lerp(-82 + 14 * cr + 34 * kn + 10 * hu + Math.abs(Math.sin(wp)) * 2 * wk, -12, lie);
    let ta = 0.05 + 0.22 * s.lean + 0.1 * kn + 0.55 * hu - 0.12 * s.recoil + Math.sin(t * 1.1) * 0.012 + 0.04 * s.sway + (hu > 0.5 ? Math.sin(t * 31) * 0.05 * hu : 0);
    ta = lerp(ta, -1.5, lie);
    P.tA = ta;
    P.neck.x = P.hip.x + Math.sin(ta) * TORSO; P.neck.y = P.hip.y - Math.cos(ta) * TORSO;
    let ha = ta * 0.45 - 0.12 * s.lean + 0.3 * hu - 0.15 * s.recoil;
    ha = lerp(ha, -1.45, lie);
    P.hA = ha;
    const q = this._r;
    rot(3, -12, ha, q); P.head.x = P.neck.x + q.x; P.head.y = P.neck.y + q.y;
    rot(3, -1, ha, q); P.eye.x = P.head.x + q.x; P.eye.y = P.head.y + q.y;
    rot(9, 5, ha, q); P.mouth.x = P.head.x + q.x; P.mouth.y = P.head.y + q.y;
    P.shN.x = lerp(P.hip.x, P.neck.x, 0.86) + 1; P.shN.y = lerp(P.hip.y, P.neck.y, 0.86) + 1;
    P.shF.x = P.shN.x - 7; P.shF.y = P.shN.y - 1;
    this.rifle();
    // 팔: 장총을 쥔 손은 IK, 아니면 각 표
    const free = (S, E, H, a1, a2) => { E.x = S.x + Math.cos(a1) * UA; E.y = S.y + Math.sin(a1) * UA; H.x = E.x + Math.cos(a1 + a2) * FA; H.y = E.y + Math.sin(a1 + a2) * FA; };
    const g = this.gun, rf = this.rf, ca = Math.cos(rf.a), sa = Math.sin(rf.a);
    const grip = g === 'port' || g === 'aim' || g === 'hip', fore = g === 'aim' || g === 'hip';
    if (grip && !this.knifeOut && !this.hornOut) ik(P.shN, { x: rf.x + ca * RG, y: rf.y + sa * RG }, UA, FA, P.elN, P.hdN, lower);
    else free(P.shN, P.elN, P.hdN, a.n1, a.n2);
    if (fore && !this.reloading) ik(P.shF, { x: rf.x + ca * RF, y: rf.y + sa * RF }, UA, FA, P.elF, P.hdF, lower);
    else free(P.shF, P.elF, P.hdF, a.f1, a.f2);
    const ka = Math.atan2(P.hdN.y - P.elN.y, P.hdN.x - P.elN.x) + a.gk;
    P.kTip.x = P.hdN.x + Math.cos(ka) * KNIFE; P.kTip.y = P.hdN.y + Math.sin(ka) * KNIFE;
    // 다리: 서기(발 고정 + 걸음) ↔ 무릎 쏴 (가까운 다리 = 무릎을 세운다, 먼 다리 = 무릎을 땅에) ↔ 누움
    const step = Math.sin(wp) * 13 * wk;
    const fN = this._fN ??= pt(), fF = this._fF ??= pt();
    fN.x = 12 + 6 * s.lean + step; fN.y = 0; fF.x = -10 - step; fF.y = -Math.max(0, Math.cos(wp)) * 5 * wk;
    this.leg(P.hip, fN, P.knN);
    this.leg({ x: P.hip.x - 4, y: P.hip.y - 1 }, fF, P.knF);
    P.ftN.x = fN.x; P.ftN.y = fN.y; P.ftF.x = fF.x; P.ftF.y = fF.y;
    if (kn > 0.01) {
      P.ftN.x = lerp(P.ftN.x, 26, kn); P.knN.x = lerp(P.knN.x, 30, kn); P.knN.y = lerp(P.knN.y, -40, kn);
      P.knF.x = lerp(P.knF.x, -6, kn); P.knF.y = lerp(P.knF.y, -4, kn); P.ftF.x = lerp(P.ftF.x, -44, kn); P.ftF.y = lerp(P.ftF.y, -6, kn);
    }
    if (lie > 0.01) {
      P.knN.x = lerp(P.knN.x, 32, lie); P.knN.y = lerp(P.knN.y, -14, lie); P.ftN.x = lerp(P.ftN.x, 70, lie); P.ftN.y = lerp(P.ftN.y, -8, lie);
      P.knF.x = lerp(P.knF.x, 30, lie); P.knF.y = lerp(P.knF.y, -9, lie); P.ftF.x = lerp(P.ftF.x, 68, lie); P.ftF.y = lerp(P.ftF.y, -3, lie);
    }
  }
  /** 두 마디 다리 IK (엉덩이 H → 발 F, 무릎은 앞으로 굽는다) */
  leg(H, F, K) {
    const dx = F.x - H.x, dy = F.y - H.y, d = Math.min(TH + SH - 0.5, Math.max(8, Math.hypot(dx, dy)));
    const a = Math.atan2(dy, dx), c = clamp((TH * TH + d * d - SH * SH) / (2 * TH * d), -1, 1), off = Math.acos(c);
    K.x = H.x + Math.cos(a - off) * TH; K.y = H.y + Math.sin(a - off) * TH;
  }
  /** 장총 자리 (개머리판 끝 x,y · 각 a, 몸 지역): port = 오른손에 세워 듦 · aim = 어깨에 대고 조준 · hip = 허리 사격 · back = 등에 멤 */
  rifle() {
    const P = this.pts, rf = this.rf, g = this.gun, tg = this._rt ??= { x: 0, y: 0, a: 0 };
    if (g === 'none') return;
    if (g === 'aim') { tg.x = P.shN.x + 3; tg.y = P.shN.y + 4; tg.a = clamp(this.aimA, -0.95, 0.7); }
    else if (g === 'hip') { tg.a = this.reloading ? 0.35 : clamp(this.aimA, -0.45, 0.35); tg.x = P.hip.x - 4; tg.y = P.hip.y - 28; }
    else if (g === 'back') { tg.a = -2.05; tg.x = P.hip.x - 14 + Math.sin(P.tA) * 4; tg.y = P.hip.y - 2; }
    else { tg.a = -1.2; const gx = P.hip.x + 13, gy = P.hip.y - 8; tg.x = gx - Math.cos(tg.a) * RG; tg.y = gy - Math.sin(tg.a) * RG; }
    if (this.ps.lie > 0.5) { tg.a = 0.05; tg.x = P.hip.x - 30; tg.y = -8; }
    const k = this._rk ?? 1;
    rf.x += (tg.x - rf.x) * k; rf.y += (tg.y - rf.y) * k;
    rf.a += Math.atan2(Math.sin(tg.a - rf.a), Math.cos(tg.a - rf.a)) * k;
    rf.a -= this.ps.recoil * 0.25;
  }
  /** 총구 (월드) */
  muzzle(out = { x: 0, y: 0 }) { const rf = this.rf; return this.toWorld(rf.x + Math.cos(rf.a) * RIFLE, rf.y + Math.sin(rf.a) * RIFLE, out); }

  /** 늑대 골격 (네 발, 몸 지역 좌표): 엉덩이·어깨·목·머리·주둥이·눈 · 앞다리(팔꿈치 뒤로) · 뒷다리(무릎 앞으로 · 발목 뒤로 꺾인 역관절) · 꼬리 */
  rigW(dt = 0) {
    const s = this.ps, W = this.wp, t = this.t, q = this._r;
    const cr = clamp(s.crouch, 0, 1), rear = clamp(s.rear, 0, 1), run = clamp(s.run, 0, 1), lie = clamp(s.lie, 0, 1), howl = clamp(s.howl, 0, 1), air = clamp(s.air, 0, 1);
    const wk = this.walkK, ph = this.walkPh;
    const gal = run * Math.sin(ph * 1.6);
    W.hip.x = lerp(-40 + 6 * rear + 4 * air, -34, lie); W.hip.y = lerp(-70 + 22 * cr + 6 * rear - 6 * air + gal * 4 + Math.sin(t * 2.1) * 1.2, -24, lie);
    let wa = -0.04 * cr + 1.05 * rear - 0.08 * air + gal * 0.08 + 0.12 * s.bare + Math.sin(t * 2.1) * 0.015;
    wa = lerp(wa, 0.0, lie);
    W.wa = wa;
    rot(SPINE, 5, -wa, q); W.sh.x = W.hip.x + q.x; W.sh.y = W.hip.y + q.y;
    rot(33, -22, -wa * 0.55, q); W.neck.x = W.sh.x + q.x; W.neck.y = W.sh.y + q.y;
    // 머리 각 ha: 0 = 채색 머리 그림의 기울기 (목 → 주둥이가 조금 위), + = 숙인다
    let ha = 0.3 + 0.35 * cr + 0.15 * run - 1.2 * howl - 0.4 * rear + 0.25 * s.bare - 0.2 * air;
    ha = lerp(ha, 0.4, lie);
    W.ha = ha;
    rot(17, -19, ha, q); W.head.x = W.neck.x + q.x; W.head.y = W.neck.y + q.y;
    rot(54, -14, ha, q); W.snout.x = W.neck.x + q.x; W.snout.y = W.neck.y + q.y;
    rot(28, -24, ha, q); W.eye.x = W.neck.x + q.x; W.eye.y = W.neck.y + q.y;
    // 앞발 자리 (부드럽게 따라간다)
    const S = W.sh, tN = this._tN ??= pt(), tF = this._tF ??= pt();
    const walk = Math.sin(ph) * 14 * wk;
    switch (this.paw) {
      case 'run': { const u = ph * 1.6; tN.x = S.x + 18 + 26 * Math.sin(u); tN.y = -Math.max(0, Math.cos(u)) * 20; tF.x = S.x + 6 - 26 * Math.sin(u); tF.y = -Math.max(0, -Math.cos(u)) * 20; break; }
      case 'swipe': { const k = this.swipeK; tN.x = S.x + lerp(-6, 70, k); tN.y = S.y + lerp(-46, 30, k); tF.x = S.x + 10; tF.y = -2; break; }
      case 'up': tN.x = S.x + 30; tN.y = S.y + 26 - 30 * rear; tF.x = S.x + 18; tF.y = S.y + 34 - 30 * rear; break;
      case 'spread': tN.x = S.x + 6; tN.y = S.y + 66; tF.x = S.x - 16; tF.y = S.y + 62; break;
      case 'air': tN.x = S.x + 52; tN.y = S.y + 16; tF.x = S.x + 40; tF.y = S.y + 24; break;
      case 'dive': tN.x = S.x + 18; tN.y = S.y + 60; tF.x = S.x + 4; tF.y = S.y + 56; break;
      default: tN.x = S.x + 11 + walk; tN.y = -Math.max(0, Math.cos(ph)) * 8 * wk; tF.x = S.x + 22 - walk; tF.y = -Math.max(0, -Math.cos(ph)) * 8 * wk;
    }
    if (lie > 0.01) { tN.x = lerp(tN.x, S.x + 48, lie); tN.y = lerp(tN.y, -8, lie); tF.x = lerp(tF.x, S.x + 40, lie); tF.y = lerp(tF.y, -4, lie); }
    const pk = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;
    this.pawN.x += (tN.x - this.pawN.x) * pk; this.pawN.y += (tN.y - this.pawN.y) * pk;
    this.pawF.x += (tF.x - this.pawF.x) * pk; this.pawF.y += (tF.y - this.pawF.y) * pk;
    const shF = this._shF ??= pt(); shF.x = S.x + 6; shF.y = S.y - 2;
    ik(S, this.pawN, FU, FL, W.elN, W.pwN, back);
    ik(shF, this.pawF, FU, FL, W.elF, W.pwF, back);
    // 뒷다리: 발 → 발목(역관절, 발등은 거의 세로) → 무릎(앞으로)
    const fN = this._hN ??= pt(), fF = this._hF ??= pt();
    if (air > 0.5) { fN.x = W.hip.x - 44; fN.y = W.hip.y + 52; fF.x = W.hip.x - 34; fF.y = W.hip.y + 58; }
    else if (run > 0.3) { const u = ph * 1.6 + 1.2; fN.x = W.hip.x - 14 + 30 * Math.sin(u); fN.y = -Math.max(0, Math.cos(u)) * 18; fF.x = W.hip.x - 4 - 30 * Math.sin(u); fF.y = -Math.max(0, -Math.cos(u)) * 18; }
    else { fN.x = W.hip.x - 26 - walk + 22 * rear; fN.y = -Math.max(0, -Math.cos(ph)) * 7 * wk; fF.x = W.hip.x - 12 + walk + 18 * rear; fF.y = -Math.max(0, Math.cos(ph)) * 7 * wk; }
    if (lie > 0.01) { fN.x = lerp(fN.x, W.hip.x - 40, lie); fN.y = lerp(fN.y, -8, lie); fF.x = lerp(fF.x, W.hip.x - 46, lie); fF.y = lerp(fF.y, -3, lie); }
    const tilt = air > 0.5 ? -0.9 : lie > 0.5 ? -1.3 : -0.15;
    for (const [F, Hk, K] of [[fN, W.hkN, W.knN], [fF, W.hkF, W.knF]]) {
      rot(0, -HM, tilt, q); Hk.x = F.x + q.x; Hk.y = F.y + q.y;
      ik(W.hip, Hk, HU, HS, K, null, front);
    }
    W.ftN.x = fN.x; W.ftN.y = fN.y; W.ftF.x = fF.x; W.ftF.y = fF.y;
    // 꼬리: 엉덩이 뒤 → 뒤아래로 늘어진다 (흔들림 · 달리면 수평 · 울부짖으면 처진다 · 일어서면 아래로 · 누우면 바닥에). 각 = 화면 방향 (cos, sin), π = 뒤
    const T0 = this.tail;
    rot(-11, -12, -wa, q); T0[0].x = W.hip.x + q.x; T0[0].y = W.hip.y + q.y;
    let ang = PI - lerp(0.5 + 0.3 * howl - 0.4 * run - 0.45 * air + 0.15 * cr, 0.08, lie) - wa * 0.9;
    for (let i = 1; i <= TAIL_N; i++) {
      ang += (i > 3 ? 0.17 * (1 - 0.6 * lie) : 0) + Math.sin(t * 2.6 - i * 0.7) * (0.06 + 0.06 * this.bristle) * (1 - lie);
      T0[i].x = T0[i - 1].x + Math.cos(ang) * TAIL_L; T0[i].y = Math.min(-2, T0[i - 1].y + Math.sin(ang) * TAIL_L);
    }
  }
  /** 판정 부위를 월드 좌표로 (그리기와 같은 골격) */
  syncParts() {
    const W = this._pt;
    if (!this.wolf) {
      const P = this.pts;
      this.toWorld(P.head.x + 2, P.head.y - 4, W);
      const ph = this.pHead; ph.w = 34; ph.h = 34; ph.x = W.x - 17; ph.y = W.y - 17; ph.defMul = this.stunned ? 0.6 : 0.9;
      this.toWorld((P.hip.x + P.neck.x) / 2, (P.hip.y + P.neck.y) / 2 + 2, W);
      const pb = this.pBody; pb.w = 40; pb.h = 58; pb.x = W.x - 20; pb.y = W.y - 29; pb.defMul = this.stunned ? 0.7 : this.reloading ? 1.15 : this.offering ? 1.6 : 1.0;
      this.cBody.w = 40; this.cBody.x = W.x - 20; this.cBody.y = W.y - 30; this.cBody.h = Math.max(40, this.fy - (W.y - 30));
      this.toWorld(P.hip.x * 0.5, 0, W);
      const pl = this.pLegs; pl.w = 36; pl.h = Math.max(24, -P.hip.y); pl.x = W.x - 18; pl.y = this.fy - pl.h; pl.defMul = 1.15;
    } else {
      const P = this.wp;
      this.toWorld(P.head.x + 10, P.head.y + 2, W);
      const ph = this.pHead; ph.w = 48; ph.h = 40; ph.x = W.x - 24; ph.y = W.y - 20; ph.defMul = this.stunned ? 0.6 : 1.2;
      this.toWorld((P.hip.x + P.sh.x) / 2 + 4, (P.hip.y + P.sh.y) / 2 + 4, W);
      const pb = this.pBody; pb.w = 74; pb.h = 56; pb.x = W.x - 37; pb.y = W.y - 28;
      pb.defMul = this.stunned ? 0.7 : this.offering ? 1.6 : this.exposed ? 0.7 : 1.0;
      this.cBody.w = 70; this.cBody.x = W.x - 35; this.cBody.y = W.y - 28; this.cBody.h = Math.max(40, this.fy - (W.y - 28));
      this.toWorld(P.hip.x - 10, P.hip.y - 14, W);
      const pk = this.pBack; pk.x = W.x - 28; pk.y = W.y - 22; pk.defMul = 0.85;
      this.toWorld((P.hip.x + P.sh.x) / 2, 0, W);
      const pl = this.pLegs; pl.w = 96; pl.h = Math.max(24, -Math.max(P.hip.y, P.sh.y) - 18); pl.x = W.x - 48; pl.y = this.fy - pl.h; pl.defMul = 1.1;
    }
  }
  motion(dt, world) {
    const s = this.ps, pt0 = this.pt;
    for (const k in s) s[k] += (pt0[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt));
    const ar = 1 - Math.exp(-this.armRate * dt), a = this.arm, at = this.armT;
    for (const k in a) a[k] += (at[k] - a[k]) * ar;
    this._rk = dt > 0 ? 1 - Math.exp(-16 * dt) : 1;
    const A = this.A;
    const x0 = this.zx;
    if (this.spd > 0) this.zx = approach(this.zx, this.tzx, this.spd * dt);
    this.zx = clamp(this.zx, A.x0 + 30, A.x1 - 30);
    if (!this.air) {
      // 발판 끝을 넘으면 떨어진다 (늑대가 덮치기로 올라선 발판). 사람은 늘 바닥
      const sf = this.surface(this.zx, this.fy);
      if (this.fy < sf - 0.5) { this.vfy += 2600 * dt; this.fy = Math.min(sf, this.fy + this.vfy * dt); if (this.fy >= sf) { this.vfy = 0; if (dt > 0) this.landFx(world, 0.5); } }
      else { this.fy = sf; this.vfy = 0; }
    }
    this.fy = Math.min(this.fy, A.floor);
    const mv = dt > 0 ? Math.abs(this.zx - x0) / dt : 0;
    this.walkK = approach(this.walkK, mv > 30 && !this.air ? 1 : 0, dt * 6);
    this.walkPh += dt * Math.min(16, mv * (this.wolf ? 0.03 : 0.05));
    this.fk = approach(this.fk, this.facing, dt * 9);
    this.recoil = s.recoil;
    this.moonK = approach(this.moonK, this.wolf && !(this.dying > 0) ? 0.55 : this.moonT, dt * 1.5);
    this.bristle = approach(this.bristle, this.pt.crouch > 0.5 && this.wolf ? 1 : 0, dt * 4);
    if (this.morphT >= 0) this.morph = clamp((this.t - this.morphT) / 0.35, 0, 1) * (this.wolf ? 1 : 0) + (this.wolf ? 0 : 1 - clamp((this.t - this.morphT) / 0.35, 0, 1));
    else this.morph = this.wolf ? 1 : 0;
    this.place();
    this.rig();
    this.rigW(dt);
    this.syncParts();
  }
  landFx(world, k = 1) {
    if (!world?.fx) return;
    world.fx.burst('dust', this.zx, this.fy - 4, Math.round(6 * k) + 2, { color: '#dfe6f2', speed: 140 * k, angle: -PI / 2, spread: 1.4 });
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0 || this.hidden || this.ghost) return L;
    L.push(this.pHead, this.pBody);
    if (this.wolf) L.push(this.pBack);
    L.push(this.pLegs);
    return L;
  }
  /** 접촉은 몸통만. 하늘 위·무릎·가슴을 내줌·사망 중에는 없다 (그 피해는 예고된 지대가 맡는다) */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.hidden || this.ghost || this.dying > 0 || this.stunned || this.offering) return L;
    L.push(this.cBody);
    return L;
  }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (this.wolf) { if (Math.random() < 0.6) world.fx.burst('feather', x, y, 2, { color: FUR, speed: 140 }); }
    else if (Math.random() < 0.5) world.fx.burst('shard', x, y, 2, { color: LEATH_H, speed: 150 });
    if (this.dying > 0 || this.dead) return;
    // 카운터 창(사냥칼 끝 · 덮치기 착지 경직)에 맞으면 → 무릎 (stagger)
    if (this.cWin && (this.state === 'huntingKnife' || this.state === 'pounce')) { this.cWin = false; this.later(0, () => this.toStagger()); return; }
    // 달 그림자 노출 1초 안에 최대 체력 5% 이상 → 무릎
    if (this.exposed && this.state === 'moonDive') {
      this.mexp += Math.max(0, dmg || 0);
      if (this.mexp >= this.stats.maxHp * 0.05) { this.exposed = false; this.later(0, () => this.toStagger()); return; }
    }
    this.check15();
  }
  /** 체력 15% 이하에서 한 번(싸움마다): offer 강제 + 대사 b_hagen_last (스토리·처음만 — phaseScript 가 거른다) */
  check15() {
    if (this._offered || this.phase < 1 || this.dying > 0 || this.hpK() > 0.15) return;
    this._offered = true; this._lastPending = true;
    this.forceNext('offer');
  }
  toStagger() {
    if (this.dying > 0 || this.dead || this.state === 'stagger' || this._tr) return;
    this.clearJobs(); this.onCancel(this.world);
    this.setState('stagger');
  }

  // ═════════════════════════════ 패턴 고르기 ═════════════════════════════
  minionCount(id) { minionsAlive(this); let n = 0; for (const e of this._cMinions) if (e.id === id && !e.dead) n++; return n; }
  trapCount() { let n = 0; for (const e of this.traps) if (!e.dead) n++; return n; }
  /** 산탄은 플레이어가 6칸 안일 때만 · 1페이즈 무리 부르기는 늑대가 최대(3)면 고르지 않는다 · 은 올가미는 살아 있는 올가미가 4면 고르지 않는다 */
  weights(phase = this.phase) {
    const p = this.P, near = p && Math.abs(p.cx - this.zx) <= 6 * T48();
    return super.weights(phase).filter(([k]) => (k !== 'buckshot' || near) && (k !== 'trapLine' || this.trapCount() < 4) && (k !== 'packCall' || this.wolf || this.minionCount('snow_wolf') < 3));
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
    this.traps = this.traps.filter((e) => !e.dead);
  }
  ambient(dt, world) {
    if (this.ghost) return;
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (this.wolf ? 1.6 : 0.8);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const P = this.toWorld(rand(-30, 30), -rand(20, this.wolf ? 90 : 130));
      world.fx.emit('paper', P.x, P.y, { color: SNOW, speed: 30, angle: PI / 2, spread: 1.2, size: 2.4 });
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) {
    let x0 = this.zx - 200, x1 = this.zx + 200, y0 = this.fy - 220, y1 = this.fy + 30;
    const d = this.rifleDrop;
    if (d) { x0 = Math.min(x0, d.x - 70); x1 = Math.max(x1, d.x + 70); y1 = Math.max(y1, d.y + 20); }
    r.x = x0; r.y = y0; r.w = x1 - x0; r.h = y1 - y0;
    return r;
  }
  /**
   * 그리기: 채색이 준비됐으면 채색(대리 개체), 아니면 벡터. 쓰러짐 연출(사망 5초)은 스스로 보여 주므로
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
      this.gun = 'port'; this.setPose({ lean: -0.15 });
      audio.sfx('eye_glint', { vol: 0.6 }); audio.sfx('wolf_howl', { vol: 0.35, pitch: 0.75 });
      impact(world, { shake: 4, time: 0.4 });
    }
    if (this.at(0.7)) { audio.sfx('cylinder_spin', { vol: 0.7, pitch: 0.9 }); this.setPose({ lean: 0 }); }
    if (t >= 1.5) this.done(0.8);
  }
  /** 대기: 1페이즈는 플레이어와 340px 안팎을 지키며 천천히 걷는다 (붙으면 물러선다) · 2페이즈 늑대는 230px 안팎을 어슬렁거린다 */
  idleMove(dt, world, t) {
    this.faceP();
    const A = this.A, p = this.P;
    const px = p ? p.cx : A.cx;
    const side = Math.sign(this.zx - px) || -this.facing;
    const d = this.wolf ? 230 + Math.sin(this.t * 1.3) * 50 : 340 + Math.sin(this.t * 0.8) * 40;
    const close = p && Math.abs(p.cx - this.zx) < (this.wolf ? 110 : 150);
    this.tzx = clamp(px + side * d, A.x0 + 90, A.x1 - 90);
    this.spd = this.wolf ? (close ? 360 : 240) : (close ? 230 : 120);
    if (this.state === 'idle') this.setPose(this.wolf ? { crouch: close ? 0.4 : 0.1, lean: 0, rear: 0, run: 0 } : { lean: close ? -0.15 : 0.02, crouch: 0 });
  }
  /** 선택(§2.1): 스토리 · 1페이즈 · 플레이어가 빅터면 조준선 고정이 0.1초 늦다 (스승의 봐주기 — 아케이드 공정성에는 영향 없음) */
  mercy() { const w = this.world; return w?.mode === 'story' && this.phase < 1 && (w.hero?.charId === 'victor' || w.player?.hero?.charId === 'victor') ? 0.1 : 0; }
  /** 조준 각 (몸 지역, 0 = 앞): 어깨에서 플레이어 몸 가운데로 */
  aimTo(rate, dt) {
    const p = this.P; if (!p) return;
    const S = this.toWorld(this.pts.shN.x, this.pts.shN.y, this._r);
    const dx = (p.cx - S.x) * this.facing, dy = p.cy - S.y;
    const want = clamp(Math.atan2(dy, Math.max(20, dx)), -0.95, 0.7);
    this.aimA += (want - this.aimA) * (rate ? 1 - Math.exp(-rate * dt) : 1);
  }

  // ── aimedShot: 무릎 쏴 0.3초 → 조준선(플레이어를 따라감) 0.9초, 마지막 0.25초는 고정(선이 붉어지고 eye_glint) →
  //    은탄 한 발 1800px/s 관통 (폭 20, mv 0.85) → 장전 0.6초 = 노출 (몸통 1.15) ──
  s_aimedShot(dt, world, t) {
    const lockAt = 0.65 + this.mercy();   // 조준선 안 시각 (0.9 − 0.25)
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0; this.aimLock = false; this.knifeOut = false; this.hornOut = false;
      this.gun = 'aim'; this.setPose({ kneel: 1, lean: 0.12 });
      audio.sfx('step_snow', { vol: 0.6 });
      this.aimTo(0, dt);
    }
    if (!this.aimLock) this.aimTo(9, dt);
    if (this.at(0.3)) this.as = { z: this.silverShot(0.9, lockAt) };
    if (this.at(0.3 + lockAt)) { this.aimLock = true; audio.sfx('eye_glint', { vol: 0.75 }); }
    if (this.at(1.2)) { this.pt.recoil = 1; this.later(0.08, () => { this.pt.recoil = 0; }); }
    if (this.at(1.35)) { this.reloading = true; this.gun = 'hip'; this.arms('reload', 10); audio.sfx('cylinder_spin', { vol: 0.8 }); }
    if (this.at(1.95)) { this.reloading = false; this.aimLock = false; this.as = null; this.gun = 'port'; this.relax(); this.done(0.9); }
  }
  /** 은탄 (조준선 → 판정): 총구에서 경기장 끝까지. lockAt 전에는 총구·끝점이 플레이어를 따라가고, 그 뒤로는 고정 */
  silverShot(warn, lockAt) {
    const A = this.A, path = { x0: 0, y0: 0, dx: 1, dy: 0, len: 600, locked: false };
    const aim = () => {
      const m = this.muzzle(this._r), p = this.P;
      const tx = p ? p.cx : m.x + this.facing * 300, ty = p ? p.cy : m.y;
      let dx = tx - m.x, dy = ty - m.y;
      if (Math.sign(dx) !== this.facing || Math.abs(dx) < 20) dx = this.facing * Math.max(20, Math.abs(dx));
      const L0 = Math.hypot(dx, dy) || 1; dx /= L0; dy /= L0;
      // 경기장 사각형(좌우 벽 · 천장 · 바닥)까지
      let len = 2400;
      if (dx > 0) len = Math.min(len, (A.x1 - m.x) / dx); else if (dx < 0) len = Math.min(len, (A.x0 - m.x) / dx);
      if (dy > 0) len = Math.min(len, (A.floor - m.y) / dy); else if (dy < 0) len = Math.min(len, (Math.max(A.top ?? 0, this.camTop()) - 40 - m.y) / dy);
      path.x0 = m.x; path.y0 = m.y; path.dx = dx; path.dy = dy; path.len = Math.max(40, len);
    };
    aim();
    const end = () => ({ x: path.x0 + path.dx * path.len, y: path.y0 + path.dy * path.len });
    const e0 = end();
    return strikeLine(this, path.x0, path.y0, e0.x, e0.y, {
      th: 20, warn, life: 2.0, mv: 0.85, element: null, color: AMBER, sfx: null, kb: [460, -260], data: { shot: path, lockAt },
      track: (z) => {
        if (z.t < lockAt) aim(); else path.locked = true;
        const e = end(), L = z.line; L.x0 = path.x0; L.y0 = path.y0; L.x1 = e.x; L.y1 = e.y;
      },
      tick: (z) => {
        if (!z.started) return;
        const d = Math.min(path.len, 1800 * (z.t - z.warn)), L = z.line;
        if (d >= path.len && !z.landed) { z.landed = true; z.dur = Math.max(0.02, z.t - z.warn + 0.03); }
        L.x1 = path.x0 + path.dx * d; L.y1 = path.y0 + path.dy * d; L.x0 = L.x1 - path.dx * Math.min(d, 150); L.y0 = L.y1 - path.dy * Math.min(d, 150);
        z.x = Math.min(L.x0, L.x1) - 20; z.y = Math.min(L.y0, L.y1) - 20; z.w = Math.abs(L.x1 - L.x0) + 40; z.h = Math.abs(L.y1 - L.y0) + 40;
      },
      onStart: (z, w) => { audio.sfx('gun', { vol: 0.9, pitch: 0.8 }); impact(w, { shake: 5, time: 0.2 }); w.fx.burst('spark', path.x0, path.y0, 8, { color: '#ffe0a0', speed: 260 }); w.fx.burst('smoke', path.x0, path.y0, 3, { speed: 40 }); },
      onEnd: (z, w) => { const e = end(); w.fx.burst('spark', e.x, e.y, 8, { color: SILV, speed: 220 }); w.fx.burst('dust', e.x, e.y, 4, { color: '#dfe6f2', speed: 90 }); },
      paint: (ctx, z) => paintShot(ctx, z, path, lockAt, this.world),
    });
  }

  // ── trapLine: 0.5초 예고 → 은 올가미 3개를 던진다 (플레이어 발밑·좌우 2.5칸, 경기장 바닥 안으로 자름, 착지 자리 warnFloor 0.6초).
  //    올가미는 8초 남고, 밟으면 0.6초 묶임 + mv 0.5, 한 대 치면 부서진다. 살아 있는 올가미 ≤ 4. 전환 뒤에도 남은 것은 그대로 ──
  s_trapLine(dt, world, t) {
    const A = this.A, T = T48();
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0; this.gun = 'back';
      this.arms('wind', 10); this.setPose({ lean: -0.18 });
      telegraph(this, 0.5, { sfx: 'warning', vol: 0.4 });
    }
    if (this.at(0.5)) {
      this.arms('throw', 24); this.setPose({ lean: 0.25 });
      audio.sfx('whip', { pitch: 0.75, vol: 0.6 });
      const p = this.P, px = p ? p.cx : A.cx, n = Math.min(3, 4 - this.trapCount());
      const hand = this.toWorld(this.pts.hdN.x, this.pts.hdN.y, { x: 0, y: 0 });
      const xs = [px, px - 2.5 * T, px + 2.5 * T].map((x) => clamp(x, A.x0 + 30, A.x1 - 30));
      for (let i = 0; i < n; i++) this.traps.push(this.world.add(new HagenTrap(this, hand.x, hand.y, xs[i], A.floor, 0.6)));
    }
    if (this.at(0.85)) { this.relax(); this.gun = 'port'; }
    if (t >= 1.1) this.done(1.0);
  }

  // ── buckshot: (6칸 안일 때만 고른다) 허리 사격 자세 0.45초 → 7알 부채꼴 50°, 1200px/s, 수명 0.35초(≈ 7칸), 알마다 mv 0.35 · 한 번에 최대 3알 · 밀쳐 냄 ──
  s_buckshot(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(5); this.spd = 0; this.gun = 'hip'; this.knifeOut = false; this.hornOut = false;
      this.setPose({ crouch: 0.35, lean: 0.1 });
      telegraph(this, 0.45, { sfx: 'warning', vol: 0.35, pitch: 1.1 });
      audio.sfx('cylinder_spin', { vol: 0.5, pitch: 1.4 });
      this.aimTo(0, dt);
    }
    if (t < 0.4) this.aimTo(10, dt);
    if (this.at(0.45)) {
      const m = this.muzzle({ x: 0, y: 0 }), p = this.P, f = this.facing;
      let aw = p ? Math.atan2(p.cy - m.y, p.cx - m.x) : (f > 0 ? 0 : PI);
      // 앞쪽 ±30° 안으로
      const fa = f > 0 ? 0 : PI, da = clamp(Math.atan2(Math.sin(aw - fa), Math.cos(aw - fa)), -0.52, 0.52); aw = fa + da;
      const spread = 50 * PI / 180, base = 'hgB' + Math.floor(rand(0, 1e9));
      for (let k = 0; k < 7; k++) {
        const a = aw - spread / 2 + (k * spread) / 6;
        this.shoot({ x: m.x, y: m.y, vx: Math.cos(a) * 1200, vy: Math.sin(a) * 1200, w: 14, h: 14, life: 0.35, render: pelletRender, collideWalls: false,
          attack: { mv: 0.35, hitId: base + ':' + (k % 3), kb: [520, -260] }, light: { r: 30, color: AMBER, i: 0.3 } });
      }
      audio.sfx('shotgun', { vol: 0.95 }); impact(world, { shake: 5, time: 0.2 });
      world.fx.burst('spark', m.x, m.y, 10, { color: '#ffe0a0', speed: 300 }); world.fx.burst('smoke', m.x, m.y, 4, { speed: 60 });
      this.pt.recoil = 1; this.later(0.1, () => { this.pt.recoil = 0; });
    }
    if (this.at(0.9)) { this.relax(); this.gun = 'port'; }
    if (t >= 1.1) this.done(1.0);
  }

  // ── huntingKnife: 칼을 뽑음 0.4초(칼날 반짝, sheath) → 플레이어 쪽으로 미끄러지며 2연 베기 (앞 150×100, mv 0.7 · 0.8) → 끝 0.3초 = 카운터 창 ──
  s_huntingKnife(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(5); this.spd = 0; this.gun = 'back'; this.knifeOut = true; this.hornOut = false;
      this.arms('knife', 12); this.setPose({ lean: 0.2, crouch: 0.3 });
      audio.sfx('sheath', { vol: 0.8 });
      telegraph(this, 0.4, { sfx: null });
    }
    if (t < 0.4 && Math.random() < 0.35) { const k = this.toWorld(this.pts.kTip.x, this.pts.kTip.y, this._r); world.fx.emit('spark', k.x, k.y, { color: '#ffffff', speed: 30 }); }
    if (this.at(0.4)) {
      const p = this.P; this.faceP(0);
      this.tzx = clamp((p ? p.cx : this.zx) - this.facing * 70, A.x0 + 40, A.x1 - 40); this.spd = 520;
      this.slash(0.7, 'slash1');
    }
    if (this.at(0.62)) this.slash(0.8, 'slash2');
    if (this.at(0.85)) {
      this.spd = 0; this.cWin = true; this.telegraphFor(0.3);
      this.arms('knife', 10); this.setPose({ crouch: 0.5, lean: -0.1 });
    }
    if (this.at(1.15)) { this.cWin = false; this.knifeOut = false; audio.sfx('sheath', { vol: 0.5, pitch: 1.2 }); this.relax(); this.gun = 'port'; }
    if (t >= 1.3) this.done(1.0);
  }
  /** 앞 150×100 베기 한 타 (즉시 — 칼 뽑기가 예고). 보스가 미끄러지는 동안 판정이 따라온다 */
  slash(mv, pose) {
    const f = this.facing;
    this.arms(pose, 30); this.setPose({ lean: 0.35, crouch: 0.25 });
    strikeRect(this, { x: this.zx + (f > 0 ? 0 : -150), y: this.fy - 118, w: 150, h: 100 }, { warn: 0, life: 0.12, mv, element: null, color: AMBER, sfx: null, kb: [360, -280],
      tick: (z) => { z.x = this.zx + (f > 0 ? 0 : -150); z.y = this.fy - 118; },
      paint: (ctx, z) => paintSlash(ctx, z, f, pose === 'slash1', SILV) });
    audio.sfx('slash_heavy', { pitch: pose === 'slash1' ? 1.2 : 1.0, vol: 0.75 });
  }

  // ── packCall: 1페이즈 뿔피리 0.8초(war_horn) → 설원 늑대 2 (살아 있는 늑대 ≤ 3). 2페이즈 울부짖음 1.0초(wolf_howl) → 고리 충격파 (r 0→240, mv 0.5, 밀쳐 냄)
  //    + 늑대 2 (≤ 3). 늑대가 최대면 1페이즈는 고르지 않고, 2페이즈는 충격파만 ──
  s_packCall(dt, world, t) {
    const A = this.A, P2 = this.wolf, Tc = P2 ? 1.0 : 0.8;
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      if (P2) { this.setPose({ rear: 0.75, howl: 1, jaw: 1, crouch: 0 }); this.paw = 'up'; audio.sfx('wolf_howl', { vol: 0.8, pitch: 0.85 }); telegraph(this, 1.0, { sfx: null }); }
      else { this.gun = 'back'; this.hornOut = true; this.arms('horn', 10); this.setPose({ lean: -0.22 }); audio.sfx('war_horn', { vol: 0.8, pitch: 1.2 }); }
      world.fx.ring(this.zx, this.fy - 90, { color: P2 ? MOON : AMBER, r0: 20, r1: 180, life: 0.6, width: 3 });
    }
    if (this.at(Tc)) {
      if (P2) {
        ringWave(this, this.zx, this.fy - 50, { r0: 10, r1: 240, speed: 520, th: 30, warn: 0, mv: 0.5, kb: [520, -380], color: MOON, sfx: null });
        audio.sfx('wolf_howl', { vol: 0.6, pitch: 0.7 }); impact(world, { shake: 7, time: 0.4 });
        world.fx.burst('paper', this.zx, this.fy - 40, 16, { color: SNOW, speed: 320 });
      }
      const n = Math.min(2, 3 - this.minionCount('snow_wolf'));
      for (let i = 0; i < n; i++) {
        const x = clamp(this.zx + (i ? 1 : -1) * 130, A.x0 + 40, A.x1 - 40);
        if (spawnMinion(this, ['snow_wolf'], x, A.floor, { facing: this.facing })) world.fx.burst('paper', x, A.floor - 30, 14, { color: SNOW, speed: 200 });
      }
      if (!P2) audio.sfx('wolf_howl', { vol: 0.45, pitch: 1.3 });
      this.setPose({ jaw: 0, howl: 0.3 });
    }
    if (this.at(Tc + 0.3)) { this.hornOut = false; this.relax(); if (!this.wolf) this.gun = 'port'; }
    if (t >= Tc + 0.55) this.done(1.0);
  }

  // ── pounce (2페이즈): 몸을 낮춤 0.45초(털이 선다) → 착지점 warnFloor 0.45초 → 플레이어 자리로 포물선 도약 (발판 위면 그 발판, A.floor 아래로는 가지 않는다) →
  //    착지 충격 폭 200 mv 0.8 (wolf_bite) → 착지 경직 0.5초 = 카운터 창. 세 번에 한 번은 경기장 벽을 차고 한 번 더 ──
  s_pounce(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0; this.cWin = false;
      this.pn = { stage: 'crouch', st: 0, n: ++this.pounceN % 3 === 0 ? 2 : 1, k: 0, tx: this.zx, ty: A.floor, lp: null };
      this.setPose({ crouch: 1, run: 0, rear: 0, jaw: 0.4 }); this.paw = 'idle';
      telegraph(this, 0.9, { sfx: 'warning', vol: 0.4, pitch: 0.8 });
      audio.sfx('wolf_bite', { vol: 0.3, pitch: 0.6 });
    }
    const pn = this.pn;
    if (!pn) { this.done(0.5); return; }
    pn.st += dt;
    const go = (s) => { pn.stage = s; pn.st = 0; };
    switch (pn.stage) {
      case 'crouch': if (pn.st >= 0.45) { this.pounceMark(0.45); go('warn'); } break;
      case 'warn': if (pn.st >= 0.45) { this.leap(pn.tx, pn.ty); go('air'); } break;
      case 'air': if (this.leapTick(dt)) { this.pounceLand(world); go('stun'); } break;
      case 'stun':
        if (pn.st >= 0.5) {
          this.cWin = false;
          if (pn.k + 1 < pn.n) {
            // 벽 차기: 가까운 벽으로 뛰어 붙었다가 플레이어 자리로 한 번 더
            pn.k++; const wx = this.zx < A.cx ? A.x0 + 34 : A.x1 - 34;
            this.facing = wx > this.zx ? 1 : -1;
            this.leap(wx, A.floor - 3.4 * T48(), 0.35, 60); go('wall');
          } else { this.pn = null; this.relax(); this.done(0.9); }
        }
        break;
      case 'wall': if (this.leapTick(dt)) { this.air = true; this.vfy = 0; this.setPose({ crouch: 1, air: 0 }); audio.sfx('land', { pitch: 1.3, vol: 0.6 }); world.fx.burst('paper', this.zx, this.fy - 30, 10, { color: SNOW, speed: 200 }); this.faceP(0); this.pounceMark(0.4); go('cling'); } break;
      case 'cling': if (pn.st >= 0.4) { this.leap(pn.tx, pn.ty); go('air'); } break;
    }
    if (t > 8) { this.pn = null; this.air = false; this.relax(); this.done(0.8); }
  }
  /** 착지점 정하기 + 바닥 예고 (플레이어가 선 디딤면, 경기장 안) */
  pounceMark(warn) {
    const A = this.A, p = this.P, pn = this.pn;
    const tx = clamp(p ? p.cx : A.cx, A.x0 + 60, A.x1 - 60);
    const ty = p ? this.surface(tx, Math.min(A.floor, p.bottom - 6)) : A.floor;
    pn.tx = tx; pn.ty = Math.min(A.floor, ty);
    this.zone({ x: tx - 100, y: pn.ty - 30, w: 200, h: 30, warn: 0, life: warn, harmless: true, z: 5, data: { mark: true },
      paint: (ctx, z, w) => warnFloor(ctx, tx, pn.ty, 200, clamp(z.t / warn, 0, 1), MOON, w.time) });
  }
  /** 포물선 도약 시작 (x1, y1 = 착지 발 자리) */
  leap(x1, y1, T = null, h = null) {
    const d = Math.hypot(x1 - this.zx, y1 - this.fy);
    this.lp = { x0: this.zx, y0: this.fy, x1, y1, T: T ?? clamp(0.42 + d / 1500, 0.5, 0.9), h: h ?? 110 + d * 0.22, u: 0 };
    this.air = true; this.vfy = 0; this.spd = 0;
    if (Math.abs(x1 - this.zx) > 4) this.facing = Math.sign(x1 - this.zx);
    this.setPose({ crouch: 0, air: 1, jaw: 0.6 }); this.paw = 'air';
    audio.sfx('dash', { pitch: 0.8, vol: 0.6 });
  }
  /** 도약 진행 — 닿으면 true */
  leapTick(dt) {
    const L = this.lp;
    if (!L) return true;
    L.u += dt / L.T;
    const k = Math.min(1, L.u);
    this.zx = lerp(L.x0, L.x1, k); this.fy = lerp(L.y0, L.y1, k) - 4 * L.h * k * (1 - k);
    if (k < 1) return false;
    this.lp = null; this.air = false; this.vfy = 0; this.fy = L.y1;
    this.setPose({ air: 0 }); this.paw = 'idle';
    return true;
  }
  pounceLand(world) {
    const x = this.zx, y = this.fy;
    strikeRect(this, { x: x - 100, y: y - 70, w: 200, h: 70 }, { warn: 0, life: 0.15, mv: 0.8, element: null, color: MOON, sfx: null, kb: [440, -360], data: { land: true } });
    audio.sfx('wolf_bite', { vol: 0.9 }); impact(world, { shake: 8, time: 0.3 });
    world.fx.burst('paper', x, y - 6, 18, { color: SNOW, speed: 260, angle: -PI / 2, spread: 1.6 });
    world.fx.ring(x, y - 4, { color: MOON, r0: 10, r1: 110, life: 0.35, width: 4 });
    this.setPose({ crouch: 0.7, jaw: 0 }); this.cWin = true; this.telegraphFor(0.5);
  }

  // ── clawRush (2페이즈): 앞발을 듦 0.35초 → 900px/s 로 바닥을 달리며 3연 할퀴기 (앞 170×110, mv 0.55 · 0.55 · 0.8, 0.22초 간격) → 경기장 끝에서 멈춤 ──
  s_clawRush(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0; this.offering = false;
      this.setPose({ rear: 0.45, run: 0, crouch: 0, jaw: 0.8 }); this.paw = 'up';
      telegraph(this, 0.35, { sfx: 'warning', vol: 0.4, pitch: 1.2 });
      audio.sfx('wolf_bite', { vol: 0.4, pitch: 0.8 });
    }
    if (this.at(0.35)) {
      const dir = this.facing;
      this.cr = { dir, end: dir > 0 ? A.x1 - 60 : A.x0 + 60, n: 0, stop: 0 };
      this.tzx = this.cr.end; this.spd = 900;
      this.setPose({ rear: 0, run: 1, jaw: 0.6 }); this.paw = 'run';
      audio.sfx('dash', { pitch: 0.7, vol: 0.7 });
    }
    const cr = this.cr;
    if (!cr) { if (t > 0.5) this.done(0.5); return; }
    const mvs = [0.55, 0.55, 0.8];
    for (let k = 0; k < 3; k++) {
      if (this.at(0.45 + k * 0.22)) {
        const f = cr.dir;
        this.paw = 'swipe'; this.swipeK = 0;
        strikeRect(this, { x: this.zx + (f > 0 ? 0 : -170), y: this.fy - 116, w: 170, h: 110 }, { warn: 0, life: 0.12, mv: mvs[k], element: null, color: MOON, sfx: null, kb: [400, -300],
          tick: (z) => { z.x = this.zx + (f > 0 ? 0 : -170); z.y = this.fy - 116; },
          paint: (ctx, z) => paintClaw(ctx, z, f, k) });
        audio.sfx('slash_heavy', { pitch: 1.1 + k * 0.08, vol: 0.7 }); audio.sfx('wolf_bite', { vol: 0.35, pitch: 1.2 });
      }
    }
    if (this.paw === 'swipe') { this.swipeK = Math.min(1, this.swipeK + dt / 0.15); if (this.swipeK >= 1) this.paw = 'run'; }
    if (!cr.stop && t > 0.4 && (Math.abs(this.zx - cr.end) < 2 || t > 2.6)) {
      cr.stop = t; this.spd = 0; this.paw = 'idle';
      this.setPose({ run: 0, crouch: 0.4, jaw: 0 });
      world.fx.burst('paper', this.zx + cr.dir * 30, this.fy - 6, 12, { color: SNOW, speed: 220, angle: -PI / 2 - cr.dir * 0.6, spread: 0.6 });
      audio.sfx('step_snow', { vol: 0.8, pitch: 0.8 });
    }
    if (cr.stop && t >= cr.stop + 0.45) { this.cr = null; this.relax(); this.done(1.0); }
  }

  // ── moonDive (2페이즈): 위로 뛰어올라 화면 밖 0.4초(판정 없음) → 달빛에 그림자 → 세 번: 그 순간 플레이어 x 에 세로 warnLine 0.55초 →
  //    1400px/s 내리꽂기 (폭 90, mv 0.75) + 눈 파편 (r 120, mv 0.3), 0.35초 간격 → 마지막 착지 뒤 노출 1.0초 (몸통 0.7, 최대 체력 5% 이상이면 무릎) ──
  s_moonDive(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0; this.exposed = false; this.mexp = 0;
      this.setPose({ crouch: 1, jaw: 0.3 }); this.paw = 'idle';
      telegraph(this, 0.3, { sfx: null });
      this.md = { k: 0, stage: 'crouch', st: 0, x: this.zx, sky: this.skyY() };
    }
    const md = this.md;
    if (!md) { this.done(0.5); return; }
    md.st += dt;
    const go = (s) => { md.stage = s; md.st = 0; };
    switch (md.stage) {
      case 'crouch':
        if (md.st >= 0.3) { this.ghost = true; md.sky = this.skyY(); this.leap(this.zx, md.sky, 0.32, 0); this.setPose({ air: 1, crouch: 0 }); this.paw = 'dive'; audio.sfx('dash', { pitch: 0.6, vol: 0.7 }); world.fx.burst('paper', this.zx, this.fy - 4, 16, { color: SNOW, speed: 260, angle: -PI / 2, spread: 1 }); go('up'); }
        break;
      case 'up': if (this.leapTick(dt)) { this.air = true; this.fy = md.sky; go('sky'); } break;
      case 'sky':
        // 화면 밖 0.4초 (첫 번째) → 그 순간 플레이어 x 에 세로 예고 + 그림자
        if (md.st >= (md.k === 0 ? 0.4 : 0.05)) {
          const p = this.P; md.x = clamp(p ? p.cx : A.cx, A.x0 + 50, A.x1 - 50);
          this.zx = this.tzx = md.x; this.fy = md.sky;
          this.diveZone(md); audio.sfx('warning', { vol: 0.45, pitch: 1.1 + md.k * 0.1 });
          go('warn');
        }
        break;
      case 'warn': if (md.st >= 0.55) { this.setPose({ air: 1 }); this.paw = 'dive'; go('fall'); } break;
      case 'fall': {
        this.fy = Math.min(A.floor, this.fy + 1400 * dt);
        if (this.fy >= A.floor) {
          this.fy = A.floor; this.air = false; this.ghost = false; this.setPose({ air: 0, crouch: 0.8 }); this.paw = 'idle';
          strikeCircle(this, md.x, A.floor - 20, 120, { warn: 0, life: 0.2, mv: 0.3, element: null, color: SNOW, sfx: null, burstFx: 'paper', kb: [360, -320], data: { debris: true } });
          audio.sfx('wolf_bite', { vol: 0.7, pitch: 0.9 }); audio.sfx('hit_heavy', { pitch: 0.8, vol: 0.6 }); impact(world, { shake: 7, time: 0.25 });
          world.fx.burst('paper', md.x, A.floor - 6, 16, { color: SNOW, speed: 300, angle: -PI / 2, spread: 1.4 });
          if (md.k < 2) go('gap');
          else { this.exposed = true; this.mexp = 0; this.setPose({ crouch: 0.9, jaw: 0, howl: 0 }); go('exposed'); }
        }
        break;
      }
      case 'gap':
        if (md.st >= 0.07) { md.k++; this.ghost = true; this.leap(this.zx, md.sky, 0.28, 0); this.setPose({ air: 1, crouch: 0 }); this.paw = 'dive'; audio.sfx('dash', { pitch: 0.7, vol: 0.5 }); go('up'); }
        break;
      case 'exposed':
        if (md.st >= 1.0) { this.exposed = false; this.md = null; this.relax(); this.done(0.9); }
        break;
    }
    if (t > 9 && this.md) { this.md = null; this.air = false; this.ghost = false; this.exposed = false; this.relax(); this.done(0.8); }
  }
  /** 달 그림자 한 번: 세로 예고선 0.55초 → 내리꽂는 판정 (폭 90, 1400px/s 로 바닥까지 — 보스 발과 같이 내려온다) */
  diveZone(md) {
    const A = this.A, x = md.x, top = md.sky - 60;
    this.zone({ x: x - 70, y: A.floor - 24, w: 140, h: 24, warn: 0, life: 0.55 + (A.floor - md.sky) / 1400 + 0.05, harmless: true, z: 4, data: { shadow: true },
      paint: (ctx, z) => paintMoonShadow(ctx, x, A.floor, clamp(z.t / 0.55, 0, 1)) });
    strikeLine(this, x, top, x, A.floor, {
      th: 90, warn: 0.55, life: (A.floor - top) / 1400 + 0.1, mv: 0.75, element: null, color: MOON, sfx: null, kb: [300, -380], data: { dive: true },
      tick: (z) => {
        if (!z.started) return;
        const L = z.line, y1 = Math.min(A.floor, this.fy);
        L.x0 = x; L.x1 = x; L.y1 = y1; L.y0 = Math.max(top, y1 - 130);
        z.x = x - 45; z.y = L.y0 - 45; z.w = 90; z.h = L.y1 - L.y0 + 90;
        if (y1 >= A.floor && !z.landed) { z.landed = true; z.dur = Math.max(0.02, z.t - z.warn + 0.03); }
      },
      paint: (ctx, z) => paintDive(ctx, z, x, top, A.floor),
    });
  }

  /** 보조: 무릎 1.4초 (몸통 0.7 · 머리 0.6) — 사냥칼·덮치기 카운터 창에 맞음 · 달 그림자 노출 중 5% */
  s_stagger(dt, world, t) {
    if (this.at(0.001)) {
      this.stunned = true; this.ghost = false; this.cWin = false; this.exposed = false; this.reloading = false; this.offering = false; this.spd = 0;
      this.air = false; this.lp = null;
      if (this.wolf) { this.setPose({ crouch: 1, rear: 0, run: 0, howl: 0, jaw: 0.5, lean: 0 }); this.paw = 'idle'; }
      else { this.setPose({ kneel: 1, lean: 0.3, crouch: 0 }); this.arms('limp', 10); this.knifeOut = false; this.hornOut = false; this.gun = 'port'; }
      audio.sfx('hit_heavy', { pitch: 0.7 }); audio.sfx(this.wolf ? 'wolf_bite' : 'clang', { pitch: 0.6, vol: 0.5 });
      world.fx.burst('paper', this.zx, this.fy - 40, 12, { color: SNOW, speed: 200 });
      impact(world, { shake: 6, time: 0.3 });
    }
    if (this.stunned && Math.random() < 0.2 * (world.fx.quality ?? 1)) world.fx.emit('spark', this.zx + rand(-20, 20), this.fy - (this.wolf ? 80 : 120), { color: '#fff3c0', speed: 40, angle: -PI / 2 });
    if (this.at(1.4)) { this.stunned = false; this.setPose({ kneel: 0, crouch: 0, lean: 0 }); this.arms('idle', 8); }
    if (t >= 1.7) { this.relax(); this.done(0.6); }
  }

  /** 보조 offer: 체력 15% 이하 한 번(싸움마다) — 멈춰 서서 가슴을 드러낸다 2.5초 (공격 판정 없음, 몸통 1.6) + 대사 b_hagen_last (스토리·처음만).
   *  끝나면 곧바로 clawRush. 아케이드도 같은 2.5초 (대사만 없음) */
  s_offer(dt, world, t) {
    if (this.at(0.001)) {
      this.spd = 0; this.ghost = false; this.cWin = false; this.exposed = false; this.air = false; this.lp = null;
      this.offering = true; this.faceP(0);
      if (this.wolf) { this.setPose({ rear: 1, bare: 1, howl: 0.15, jaw: 0, crouch: 0, run: 0 }); this.paw = 'spread'; }
      else { this.setPose({ lean: -0.3 }); this.arms('spread', 8); this.gun = 'back'; this.knifeOut = false; this.hornOut = false; }
      audio.sfx('wolf_howl', { vol: 0.3, pitch: 0.65 });
      if (this._lastPending) { this._lastPending = false; phaseScript(this, 'b_hagen_last'); }
    }
    if (t < 2.5 && Math.random() < 0.15 * (world.fx.quality ?? 1)) world.fx.emit('paper', this.zx + rand(-30, 30), this.fy - rand(60, 120), { color: SNOW, speed: 20, angle: PI / 2 });
    if (this.at(2.5)) { this.offering = false; this.forceNext('clawRush'); this.relax(); if (!this.wolf) this.gun = 'port'; this.done(0.05); }
  }

  // ── 전환 moonrise (1→2): 무적 2.4초. 0.4초 달빛(가장자리 푸른빛) → 1.0초 몸이 뒤틀리고 외투가 찢어진다(채색 파편) → 2.0초 늑대 모습
  //    (applyAt → applyPhase(1): 판정 크기 112×118 · 발 위치 그대로 · form2 이름·초상화) → 끝에 대사 b_hagen_moon (스토리 1회) → 곧바로 packCall ──
  s_moonrise(dt, world, t) {
    if (this.at(0.001)) {
      this.transStart(world);
      this.setPose({ hunch: 0.25, lean: 0 }); this.arms('clutch', 6);
      audio.sfx('wolf_howl', { vol: 0.4, pitch: 0.6 });
    }
    if (this.at(0.4)) {
      this.moonT = 1;
      screenTint(this, { color: '#08142a', alpha: 0.2, edge: MOON, dur: 1.9 });
      audio.sfx('eye_glint', { vol: 0.8, pitch: 0.8 });
    }
    if (this.at(1.0)) {
      this.setPose({ hunch: 1 }); this.tearT = this.t;
      this.dropRifle();
      const P = this.toWorld(this.pts.neck.x, this.pts.neck.y + 20, { x: 0, y: 0 });
      world.fx.burst('shard', P.x, P.y, 14, { color: LEATH_H, speed: 280 });
      world.fx.burst('feather', P.x, P.y, 10, { color: FUR, speed: 200 });
      audio.sfx('slash_heavy', { pitch: 0.55, vol: 0.7 }); impact(world, { shake: 8, time: 0.6 });
    }
    if (this.at(2.0)) { this.setPose({ hunch: 0, rear: 0.8, howl: 1, jaw: 1 }); this.paw = 'up'; }
    if (this.at(2.25)) { this.setPose({ rear: 0, howl: 0, jaw: 0 }); this.paw = 'idle'; }
    this.transitionTick(dt, world, t);
  }
  transStart(world) {
    this.ghost = false; this.cWin = false; this.exposed = false; this.reloading = false; this.offering = false; this.stunned = false; this.spd = 0;
    this.air = false; this.lp = null; this.aimLock = false;
    this.as = this.tl = this.bs = this.kn = this.pc = this.pn = this.cr = this.md = this.of = null;
    this.knifeOut = false; this.hornOut = false;
    impact(world, { shake: 5, time: 0.5 });
  }
  /** 장총을 내던진다 (바닥에 놓인 채 남는다 — 그리기만) */
  dropRifle() {
    if (this.rifleDrop || this.gun === 'none') { this.gun = 'none'; return; }
    const A = this.A, x = clamp(this.zx - this.facing * 40, A.x0 + 40, A.x1 - 40);
    this.rifleDrop = { x, y: this.surface(x, this.fy - 4), a: this.facing > 0 ? 0.04 : PI - 0.04, t: this.t };
    this.gun = 'none';
    audio.sfx('clang', { pitch: 0.9, vol: 0.5 });
  }
  /** 형태 바꾸기 (페이즈마다 한 번, debugPhase 에도): 1 = 늑대 (판정 크기 112×118, 발 위치 고정) */
  applyPhase(k) {
    if (k >= 1 && !this.wolf) {
      this.dropRifle();
      this.wolf = true; this.morphT = this.t; this.knifeOut = false; this.hornOut = false; this.reloading = false;
      this.w = SIZE_W.w; this.h = SIZE_W.h; this.place();
      this.pt.hunch = 0; this.ps.hunch = 0; this.pt.kneel = 0; this.ps.kneel = 0;
      const w = this.world;
      if (w?.fx) {
        const P = this.toWorld(0, -60, { x: 0, y: 0 });
        w.fx.burst('feather', P.x, P.y, 16, { color: FUR, speed: 260 });
        w.fx.burst('paper', P.x, P.y, 14, { color: SNOW, speed: 240 });
        w.fx.ring(P.x, P.y, { color: MOON, r0: 10, r1: 220, life: 0.5, width: 5 });
        impact(w, { shake: 10, time: 0.5, flash: '#dfe8ff', fa: 0.3 });
        audio.sfx('wolf_howl', { vol: 0.7, pitch: 0.9 });
      }
    }
  }
  onCancel() {
    this.ghost = false; this.cWin = false; this.exposed = false; this.reloading = false; this.offering = false; this.stunned = false; this.spd = 0;
    this.air = false; this.lp = null; this.aimLock = false;
    this.as = this.tl = this.bs = this.kn = this.pc = this.pn = this.cr = this.md = this.of = null;
    this.knifeOut = false; this.hornOut = false;
    if (!this.wolf && this.gun !== 'none') this.gun = 'port';
    this.relax();
  }
  onReset() {
    this.onCancel();
    this.wolf = false; this.morph = 0; this.morphT = -1; this.tearT = -1; this.gun = 'port'; this.rifleDrop = null;
    this.w = SIZE_H.w; this.h = SIZE_H.h;
    this.moonK = 0; this.moonT = 0; this.dawnK = 0; this.vanishK = 0; this.lieHuman = false; this.bristle = 0;
    this._offered = false; this._lastPending = false; this.pounceN = 0;
    for (const e of this.traps) e.dead = true;
    this.traps.length = 0;
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    Object.assign(this.arm, ARM.idle); Object.assign(this.armT, ARM.idle);
    this.tzx = this.zx; this.fy = this.A.floor; this.vfy = 0;
    this.place();
  }

  // ═════════════════════════════ 쓰러짐 (체력 0) ═════════════════════════════
  onDeath(world) {
    this.clearJobs();   // 남은 지연 작업이 연출 중에 쏘지 않게
    this.dying = 5.0; this.dieT = 0; this._bn = null; this._thud = false; this._dawn = false; this._human = false; this._scattered = false;
    this.ghost = false; this.cWin = false; this.exposed = false; this.reloading = false; this.offering = false; this.stunned = false; this.spd = 0;
    this.air = false; this.lp = null; this.aimLock = false; this.knifeOut = false; this.hornOut = false;
    this.as = this.tl = this.bs = this.kn = this.pc = this.pn = this.cr = this.md = this.of = null;
    for (const e of this.traps) e.fade = true;
    if (this.wolf) { this.setPose({ crouch: 0.6, rear: 0, run: 0, howl: 0.4, jaw: 0.6, air: 0 }); this.paw = 'idle'; audio.sfx('wolf_howl', { vol: 0.5, pitch: 0.55 }); }
    else { this.setPose({ kneel: 1, lean: 0.3 }); this.arms('limp', 8); }
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    const T = this.dieT, q = world.fx?.quality ?? 1;
    // 'STAGE CLEAR' 부제: 낱말 '격파' 만 '결착' 으로 (보스 러시 'ROUND CLEAR'·탑 '축복' 안내 등 나머지는 그대로). 새 배너가 뜰 때마다 한 번씩
    const bn = world.banner;
    if (bn && bn !== this._bn) { this._bn = bn; if (typeof bn.sub === 'string' && bn.sub.includes('격파')) bn.sub = bn.sub.replace('격파', '결착'); }
    // 0–1.5초: 늑대가 눈밭에 쓰러진다 (사람이면 무릎을 꿇었다가 눕는다)
    if (T >= 0.5) this.setPose({ lie: 1, crouch: 0, rear: 0, howl: 0, jaw: 0.2, kneel: this.wolf ? 0 : 0.4 });
    if (!this._thud && T >= 1.1) { this._thud = true; audio.sfx('land', { pitch: 0.6, vol: 0.7 }); world.fx.burst('paper', this.zx, this.fy - 8, 16, { color: SNOW, speed: 160, angle: -PI / 2, spread: 1.6 }); }
    // 1.5–3초: 산마루 너머 새벽빛 (화면 가장자리 호박빛)
    if (!this._dawn && T >= 1.5) { this._dawn = true; screenTint(this, { color: AMBER, alpha: 0.08, edge: AMBER, dur: 3.4, fade: 0.9 }); audio.sfx('eye_glint', { vol: 0.4, pitch: 0.6 }); }
    this.dawnK = clamp((T - 1.5) / 1.5, 0, 1);
    // 3초: 은빛 털이 눈송이처럼 흩어지고 사람 모습으로 눕는다 (그 자세 유지)
    if (!this._human && T >= 3.0) {
      this._human = true;
      if (this.wolf) {
        const P = this.toWorld(this.wp.hip.x * 0.5 + this.wp.sh.x * 0.5, -24, { x: 0, y: 0 });
        world.fx.burst('feather', P.x, P.y, Math.round(18 * q) + 4, { color: FUR_L, speed: 120, angle: -PI / 2, spread: 1.8 });
        world.fx.burst('paper', P.x, P.y, Math.round(14 * q) + 4, { color: SNOW, speed: 90, angle: -PI / 2, spread: 2 });
      }
      this.wolf = false; this.lieHuman = true; this.morphT = this.t; this.moonK = 0;
      this.ps.lie = this.pt.lie = 1; this.ps.kneel = this.pt.kneel = 0; this.arms('lie', 30); Object.assign(this.arm, ARM.lie);
    }
    if (T >= 3.0 && T < 4.5 && Math.random() < 0.4 * q) world.fx.emit('feather', this.zx + rand(-50, 30), this.fy - rand(6, 30), { color: FUR_L, speed: 40, angle: -PI / 2, spread: 1 });
    const arcade = world.arcade ?? world.mode !== 'story';
    if (arcade) {
      // 아케이드: 3.5초에 눈보라로 흩어져 사라진다 (보스 러시 다음 라운드)
      if (T >= 3.5 && !this._scattered) { this._scattered = true; world.fx.burst('paper', this.zx, this.fy - 30, Math.round(30 * q) + 6, { color: SNOW, speed: 260 }); audio.sfx('wolf_howl', { vol: 0.25, pitch: 1.2 }); }
      if (T >= 3.5) this.vanishK = clamp((T - 3.5) / 0.45, 0, 1);
    } else if (this.dying < 0.25) this.dying = 0.25;   // 스토리: 누운 채 남는다 (스테이지가 끝날 때까지 — world.afterClear 는 clearT 7초에)
    this.motion(dt, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    if (this.hidden || this.vanishK >= 1) return;
    const e = this.wolf ? this.toWorld(this.wp.eye.x, this.wp.eye.y, { x: 0, y: 0 }) : this.toWorld(this.pts.eye.x, this.pts.eye.y, { x: 0, y: 0 });
    const k = this.dying > 0 ? 0.4 : 1;
    L.add(e.x, e.y, 70, AMBER, (this.aimLock ? 0.9 : 0.5) * k);
    L.add(this.zx, this.fy - 70, 200, AMBER, 0.3 * (1 - this.moonK) * k);
    if (this.moonK > 0.05) L.add(this.zx, this.fy - 140, 260, MOON, 0.45 * this.moonK);
    if (this.dawnK > 0.05) L.add(this.zx, this.fy - 60, 320, AMBER, 0.5 * this.dawnK);
    if (this.cWin) L.add(this.zx, this.fy - 70, 160, '#ffffff', 0.6);
  }

  // ═════════════════════════════ 그리기 (벡터) ═════════════════════════════
  bodyAlpha() { return 1 - this.vanishK; }
  paintBack(ctx, world) {
    if (R.fl) return;
    // 내던진 장총 (바닥)
    const d = this.rifleDrop;
    if (d && this.vanishK < 1) { ctx.save(); ctx.globalAlpha *= 1 - this.vanishK; ctx.translate(d.x, d.y - 3); ctx.rotate(d.a); ctx.translate(-RIFLE * 0.5, 0); drawRifle(ctx, false, false); ctx.restore(); }
    // 달빛 (전환 · 늑대) — 머리 위 푸른 기둥
    if (this.moonK > 0.05 && this.dying <= 0) glowE(ctx, this.zx, this.fy - 120, 70, 150, MOON, 0.18 * this.moonK);
  }
  paintBody(ctx, world, flash) {
    const a = this.bodyAlpha();
    if (a <= 0.01) return;
    const fl = R.fl;
    ctx.save();
    ctx.translate(this.zx, this.fy);
    ctx.scale(this.fk || 0.001, 1);
    ctx.globalAlpha *= a;
    const m = this.morph;
    if (m < 1) { ctx.save(); ctx.globalAlpha *= 1 - m; this.drawHuman(ctx, fl); ctx.restore(); }
    if (m > 0) { ctx.save(); ctx.globalAlpha *= m; this.drawWolf(ctx, fl); ctx.restore(); }
    ctx.restore();
  }
  paintFront(ctx, world) {
    if (R.fl) return;
    // 조준 고정 — 노란 눈이 번쩍인다
    if (this.aimLock || this.cWin) { const E = this.wolf ? this.wp.eye : this.pts.eye, e = this.toWorld(E.x, E.y, this._r); glow(ctx, e.x, e.y, 14, AMBER, 0.8); }
  }
  /** 사람 (지역 좌표: 원점 = 발 가운데, +x = 얼굴 쪽) */
  drawHuman(ctx, fl) {
    const back = this.gun === 'back' && !this.knifeOut;
    if (back) this.drawGun(ctx, fl);
    this.drawArm(ctx, true, fl);
    this.drawTails(ctx, fl);
    this.drawLegH(ctx, true, fl);
    this.drawLegH(ctx, false, fl);
    this.drawSkirt(ctx, fl);
    this.drawTorso(ctx, fl);
    this.drawHeadH(ctx, fl);
    if (!back && this.gun !== 'none') this.drawGun(ctx, fl);
    this.drawArm(ctx, false, fl);
  }
  drawGun(ctx, fl) {
    const rf = this.rf;
    ctx.save(); ctx.translate(rf.x, rf.y); ctx.rotate(rf.a); drawRifle(ctx, fl, this.gun === 'back'); ctx.restore();
  }
  /** 외투 뒷자락 두 띠 (허리 뒤에서 무릎 뒤로 늘어진다 — 걸음·무릎·누움) */
  drawTails(ctx, fl) {
    const P = this.pts, t = this.t, kn = clamp(this.ps.kneel, 0, 1), lie = clamp(this.ps.lie, 0, 1);
    const sw = Math.sin(t * 2) * 3 + this.walkK * 6;
    const hx = P.hip.x - 6, hy = P.hip.y - 4;
    const hemY = lerp(lerp(-30, -6, kn), -6, lie), hemX = lerp(hx - 18 - sw - 10 * kn, hx + 40, lie);
    for (let b = 0; b < 2; b++) {
      const ox = b ? -6 : 0;
      ctx.beginPath();
      ctx.moveTo(hx + 4 + ox, hy); ctx.quadraticCurveTo(hx - 10 + ox - sw * 0.4, (hy + hemY) / 2, hemX + ox - 6, hemY);
      for (let i = 0; i < 4; i++) ctx.lineTo(hemX + ox + i * 5 - 2, hemY + (i % 2 ? -5 : 2));
      ctx.lineTo(hemX + ox + 18, hemY - 4); ctx.quadraticCurveTo(hx + 6 + ox, (hy + hemY) / 2 + 6, hx + 10 + ox, hy + 2); ctx.closePath();
      ink(ctx, fl ? '#fff' : b ? LEATH_D : LG(ctx, 'hg_tail', 0, -80, 0, -20, [0, LEATH_H, 0.5, LEATH, 1, LEATH_D]), 1.3);
    }
  }
  /** 다리: 짙은 바지 · 무릎까지 오는 낡은 장화 */
  drawLegH(ctx, far, fl) {
    const P = this.pts, H = far ? { x: P.hip.x - 4, y: P.hip.y - 1 } : P.hip, K = far ? P.knF : P.knN, F = far ? P.ftF : P.ftN;
    const col = fl ? '#fff' : far ? '#1a1612' : '#2e2620', boot = fl ? '#fff' : far ? '#22180f' : '#3e2a1a';
    limb(ctx, H.x, H.y, K.x, K.y, 8, 6.5, col, far ? null : '#4a4038');
    limb(ctx, K.x, K.y, F.x - 1, F.y - 6, 7, 5.6, boot, far ? null : '#6a4a30');
    ctx.beginPath();
    ctx.moveTo(F.x - 7, F.y - 11); ctx.quadraticCurveTo(F.x + 6, F.y - 9, F.x + 14, F.y - 3); ctx.lineTo(F.x + 14, F.y); ctx.lineTo(F.x - 9, F.y); ctx.closePath();
    ink(ctx, boot, 1.3);
    if (fl || far) return;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.6;   // 장화 목 테두리
    const bx = lerp(K.x, F.x, 0.12), by = lerp(K.y, F.y, 0.12), b = Math.atan2(F.y - K.y, F.x - K.x);
    ctx.beginPath(); ctx.moveTo(bx - Math.sin(b) * 7.5, by + Math.cos(b) * 7.5); ctx.lineTo(bx + Math.sin(b) * 7.5, by - Math.cos(b) * 7.5); ctx.stroke();
    ctx.fillStyle = 'rgba(238,244,255,0.55)'; ctx.fillRect(F.x - 6, F.y - 3, 18, 2);   // 눈 묻은 발끝
  }
  /** 외투 앞자락 (허리 → 무릎, 두 넓적다리를 덮는다) */
  drawSkirt(ctx, fl) {
    const P = this.pts, H = P.hip, kn = P.knN, kf = P.knF, sw = Math.sin(this.t * 2.2) * 2 + this.walkK * 4;
    ctx.beginPath();
    ctx.moveTo(H.x + 11, H.y - 6); ctx.lineTo(H.x - 12, H.y - 6);
    ctx.lineTo(kf.x - 12 - sw, kf.y + 6);
    for (let i = 0; i < 5; i++) { const u = i / 4; ctx.lineTo(lerp(kf.x - 12 - sw, kn.x + 10, u), lerp(kf.y + 6, kn.y + 4, u) + (i % 2 ? -4 : 2)); }
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'hg_skirt', 0, -80, 0, -30, [0, LEATH_H, 0.6, LEATH, 1, LEATH_D]), 1.4);
    if (fl) return;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;   // 단추 줄
    ctx.beginPath(); ctx.moveTo(H.x + 8, H.y - 4); ctx.lineTo(kn.x + 6, kn.y + 2); ctx.stroke();
    ctx.strokeStyle = rgba(MOON, 0.3); ctx.beginPath(); ctx.moveTo(H.x - 11, H.y - 4); ctx.lineTo(kf.x - 11 - sw, kf.y + 4); ctx.stroke();
  }
  /** 몸통: 가죽 외투 윗판 · 허리띠(놋쇠 버클) · 은 탄띠(가슴을 가로지른다) · 세운 깃 */
  drawTorso(ctx, fl) {
    const P = this.pts, H = P.hip, N = P.neck, ta = P.tA;
    const c = Math.cos(ta), s = Math.sin(ta);
    const at = (u, side) => ({ x: lerp(H.x, N.x, u) + c * side, y: lerp(H.y, N.y, u) + s * side });
    const f0 = at(0, 12), f1 = at(0.5, 13), f2 = at(0.92, 9), b2 = at(1, -9), b1 = at(0.55, -13), b0 = at(0, -13);
    ctx.beginPath();
    ctx.moveTo(f0.x, f0.y); ctx.quadraticCurveTo(f1.x + 2, f1.y, f2.x, f2.y); ctx.lineTo(b2.x, b2.y); ctx.quadraticCurveTo(b1.x - 2, b1.y, b0.x, b0.y); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'hg_torso', -10, -130, 10, -80, [0, LEATH_H, 0.5, LEATH, 1, LEATH_D]), 1.6);
    if (fl) return;
    // 허리띠 + 버클
    const w0 = at(0.08, 12.5), w1 = at(0.08, -13);
    ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(w0.x, w0.y); ctx.lineTo(w1.x, w1.y); ctx.stroke();
    const bk = at(0.08, 9); ctx.fillStyle = BRASS; ctx.fillRect(bk.x - 2.5, bk.y - 3, 5, 6);
    // 탄띠 (등 위 → 가슴 아래, 은탄이 줄지어)
    const s0 = at(0.98, -8), s1 = at(0.2, 12);
    ctx.strokeStyle = '#2a1e14'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
    for (let i = 1; i < 8; i++) {
      const u = i / 8, x = lerp(s0.x, s1.x, u), y = lerp(s0.y, s1.y, u);
      ctx.fillStyle = i % 2 ? SILV : '#dfe4ee'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 3.4, ta + 0.6, 0, TAU); ctx.fill();
    }
    // 세운 깃 · 달빛 가장자리
    const n0 = at(1, 6), n1 = at(1, -9);
    ctx.beginPath(); ctx.moveTo(n0.x, n0.y); ctx.lineTo(n0.x - 2, n0.y - 9); ctx.lineTo(n1.x + 2, n1.y - 11); ctx.lineTo(n1.x, n1.y); ctx.closePath();
    ink(ctx, LEATH_H, 1.1);
    ctx.strokeStyle = rgba(MOON, 0.35); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(b2.x, b2.y + 2); ctx.quadraticCurveTo(b1.x - 2, b1.y, b0.x, b0.y); ctx.stroke();
    ctx.fillStyle = 'rgba(238,244,255,0.5)'; ctx.fillRect(n1.x - 2, n1.y - 11, 8, 2);   // 어깨의 눈
  }
  /** 머리: 옆얼굴 · 긴 회색 수염 · 뺨 흉터 · 노란 늑대 눈 · 챙 넓은 낡은 모자 */
  drawHeadH(ctx, fl) {
    const P = this.pts, h = P.head, ha = P.hA, t = this.t;
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(ha);
    // 뒷머리 (희끗한 긴 머리)
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.quadraticCurveTo(-14, 4, -11, 13); ctx.lineTo(-6, 9); ctx.lineTo(-4, -2); ctx.closePath();
    ink(ctx, fl ? '#fff' : '#8a8680', 1);
    // 얼굴 옆모습 (이마 → 매부리코 → 입 → 턱)
    ctx.beginPath();
    ctx.moveTo(-6, -9); ctx.quadraticCurveTo(5, -11, 8, -6); ctx.lineTo(13, 1); ctx.lineTo(9.5, 2.5); ctx.lineTo(10, 5); ctx.quadraticCurveTo(7, 10, 2, 10.5); ctx.quadraticCurveTo(-5, 10, -8, 4); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'hg_face', -8, -6, 12, 8, [0, SKIN_D, 0.5, SKIN, 1, '#e0c4aa']), 1.3);
    // 수염 (턱 → 가슴까지 길게)
    ctx.beginPath(); ctx.moveTo(10, 4); ctx.quadraticCurveTo(11, 14, 6, 24); ctx.lineTo(3, 18); ctx.lineTo(0, 25); ctx.quadraticCurveTo(-4, 14, -6, 6); ctx.quadraticCurveTo(2, 9, 10, 4); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'hg_beard', 0, 4, 0, 24, [0, '#d8d4d0', 1, '#8a8682']), 1);
    if (!fl) {
      ctx.strokeStyle = 'rgba(80,60,50,0.6)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(3, 5); ctx.stroke();   // 뺨 흉터
      ctx.fillStyle = '#1a120c'; ctx.beginPath(); ctx.ellipse(6, -3.5, 2.6, 1.6, 0.1, 0, TAU); ctx.fill();   // 눈두덩
      ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(6.6, -3.4, 1.3, 0, TAU); ctx.fill();
      glow(ctx, 6.6, -3.4, 8, AMBER, 0.55 + 0.25 * Math.sin(t * 4) + (this.aimLock ? 0.4 : 0));
      ctx.strokeStyle = '#d8d4d0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(3, -6.5); ctx.lineTo(9, -5.5); ctx.stroke();   // 희끗한 눈썹
    }
    // 모자: 높은 크라운 + 넓은 챙 (앞이 조금 처진다)
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.quadraticCurveTo(-10, -22, 0, -23); ctx.quadraticCurveTo(8, -24, 9, -10); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'hg_hat', 0, -24, 0, -9, [0, '#6a4c34', 1, '#2e2016']), 1.3);
    ctx.beginPath(); ctx.moveTo(-20, -8); ctx.quadraticCurveTo(-4, -14, 21, -8); ctx.quadraticCurveTo(24, -6, 22, -4.5); ctx.quadraticCurveTo(0, -9, -19, -5.5); ctx.closePath();
    ink(ctx, fl ? '#fff' : '#3a2a1c', 1.2);
    if (!fl) {
      ctx.strokeStyle = BRASS; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-8.5, -11.5); ctx.quadraticCurveTo(0, -13, 8.5, -11.5); ctx.stroke();   // 모자 띠
      ctx.fillStyle = 'rgba(238,244,255,0.6)'; ctx.fillRect(-6, -23, 10, 2);   // 크라운의 눈
    }
    ctx.restore();
  }
  /** 팔: 가죽 소매(털 커프스) · 거친 손 (손등에 은빛 털) · 사냥칼 · 뿔피리 */
  drawArm(ctx, far, fl) {
    const P = this.pts, S = far ? P.shF : P.shN, E = far ? P.elF : P.elN, H = far ? P.hdF : P.hdN;
    const col = fl ? '#fff' : far ? LEATH_D : LEATH;
    limb(ctx, S.x, S.y, E.x, E.y, 6, 5.2, col, far ? null : LEATH_H);
    limb(ctx, E.x, E.y, H.x, H.y, 5.2, 4.6, col, far ? null : LEATH_H);
    const fa = Math.atan2(H.y - E.y, H.x - E.x);
    if (!fl && !far) { const x = lerp(E.x, H.x, 0.82), y = lerp(E.y, H.y, 0.82); ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.ellipse(x, y, 3, 6, fa, 0, TAU); ctx.fill(); }   // 털 커프스
    if (!far && this.knifeOut) {
      const a = Math.atan2(P.kTip.y - H.y, P.kTip.x - H.x);
      ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(a); drawKnife(ctx, fl); ctx.restore();
    }
    if (!far && this.hornOut) {
      ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(Math.atan2(P.mouth.y - H.y, P.mouth.x - H.x)); drawHorn(ctx, fl); ctx.restore();
    }
    // 주먹
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(fa);
    ctx.beginPath(); ctx.moveTo(-3.5, -4); ctx.quadraticCurveTo(4, -5, 5, -1.5); ctx.quadraticCurveTo(5.6, 3, 2.4, 4.2); ctx.lineTo(-3.4, 3.8); ctx.quadraticCurveTo(-5, 0, -3.5, -4); ctx.closePath();
    ink(ctx, fl ? '#fff' : far ? SKIN_D : SKIN, 1.1);
    if (!fl && !far) { ctx.strokeStyle = 'rgba(220,224,236,0.7)'; ctx.lineWidth = 0.7; ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-2 + i * 1.5, -3.6); ctx.lineTo(-1 + i * 1.5, -5.2); } ctx.stroke(); }
    ctx.restore();
  }

  /** 늑대 (네 발 · 지역 좌표) */
  drawWolf(ctx, fl) {
    const W = this.wp;
    this.drawTail(ctx, fl);
    this.drawLegW(ctx, true, true, fl);
    this.drawLegW(ctx, false, true, fl);
    this.drawBodyW(ctx, fl);
    this.drawLegW(ctx, true, false, fl);
    this.drawHeadW(ctx, fl);
    this.drawLegW(ctx, false, false, fl);
    if (!fl && this.bristle > 0.05) {   // 곤두선 등털
      ctx.strokeStyle = rgba(FUR_L, 0.6 * this.bristle); ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < 7; i++) { const u = (i + 0.5) / 7, x = lerp(W.hip.x, W.sh.x, u), y = lerp(W.hip.y, W.sh.y, u) - 18; ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 8 * this.bristle); }
      ctx.stroke();
    }
  }
  drawTail(ctx, fl) {
    const T0 = this.tail;
    ctx.beginPath();
    ctx.moveTo(T0[0].x, T0[0].y - 7);
    for (let i = 1; i <= TAIL_N; i++) { const w = 8 * (1 - i / (TAIL_N + 2)) + 3; ctx.lineTo(T0[i].x, T0[i].y - w); }
    ctx.lineTo(T0[TAIL_N].x - 6, T0[TAIL_N].y);
    for (let i = TAIL_N; i >= 0; i--) { const w = 8 * (1 - i / (TAIL_N + 2)) + 3; ctx.lineTo(T0[i].x, T0[i].y + w * 0.8); }
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'hg_tail2', -120, -60, -40, -40, [0, FUR_L, 0.5, FUR, 1, FUR_D]), 1.2);
  }
  /** 다리 (fore = 앞다리 · far = 먼 쪽 어둡게): 앞다리 = 어깨 → 팔꿈치(뒤) → 발톱 · 뒷다리 = 엉덩이 → 무릎(앞) → 발목(뒤) → 발 */
  drawLegW(ctx, fore, far, fl) {
    const W = this.wp, col = fl ? '#fff' : far ? FUR_D : FUR, hi = far ? null : FUR_L;
    let paw;
    if (fore) {
      const S = far ? { x: W.sh.x - 6, y: W.sh.y - 2 } : W.sh, E = far ? W.elF : W.elN; paw = far ? W.pwF : W.pwN;
      limb(ctx, S.x, S.y, E.x, E.y, 11, 8, col, hi);
      limb(ctx, E.x, E.y, paw.x, paw.y - 3, 7.5, 5.5, col, hi);
    } else {
      const K = far ? W.knF : W.knN, Hk = far ? W.hkF : W.hkN; paw = far ? W.ftF : W.ftN;
      limb(ctx, W.hip.x, W.hip.y, K.x, K.y, 15, 9, col, hi);
      limb(ctx, K.x, K.y, Hk.x, Hk.y, 8, 5.5, col, hi);
      limb(ctx, Hk.x, Hk.y, paw.x, paw.y - 3, 5.5, 5, col, hi);
    }
    // 발 + 검은 발톱
    ctx.beginPath(); ctx.ellipse(paw.x + 3, paw.y - 3, 8, 4, 0, 0, TAU); ink(ctx, col, 1);
    if (fl) return;
    ctx.strokeStyle = '#0a0a10'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < 3; i++) { ctx.moveTo(paw.x + 6 + i * 2, paw.y - 3); ctx.lineTo(paw.x + 10 + i * 2.2, paw.y); }
    ctx.stroke();
  }
  /** 몸통: 굽은 등 · 깊은 가슴 · 찢어진 외투 자락 · 은 탄띠 */
  drawBodyW(ctx, fl) {
    const W = this.wp, H = W.hip, S = W.sh, wa = W.wa, t = this.t;
    const c = Math.cos(-wa), s = Math.sin(-wa);
    const L = (u, v) => ({ x: H.x + c * u - s * v, y: H.y + s * u + c * v });   // 몸 축 좌표 (u = 엉덩이→어깨, v = 아래 +)
    const pts = [L(-14, 4), L(-10, -18), L(10, -28), L(36, -34), L(64, -30), L(84, -16), L(88, 6), L(78, 22), L(56, 26), L(30, 18), L(4, 20), L(-12, 14)];
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) { const p0 = pts[i - 1], p1 = pts[i]; ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2); }
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'hg_wbody', 0, -110, 0, -30, [0, FUR_L, 0.45, FUR, 1, FUR_D]), 1.6);
    if (fl) return;
    // 털결
    ctx.strokeStyle = 'rgba(40,44,56,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 9; i++) { const p = L(4 + i * 9, -14 + (i % 3) * 8); ctx.moveTo(p.x, p.y); const q = L(-2 + i * 9, -8 + (i % 3) * 8); ctx.lineTo(q.x, q.y); }
    ctx.stroke();
    // 찢어진 외투 자락 (어깨·등에서 늘어진다)
    const sw = Math.sin(t * 2.4) * 2;
    ctx.beginPath();
    const c0 = L(14, -26), c1 = L(70, -30), c2 = L(66, 4);
    ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y);
    for (let i = 0; i < 7; i++) { const p = L(62 - i * 8, 10 + (i % 2 ? 10 : 0) + sw); ctx.lineTo(p.x, p.y); }
    ctx.closePath();
    ink(ctx, LG(ctx, 'hg_wcoat', 0, -110, 0, -40, [0, LEATH_H, 0.6, LEATH, 1, LEATH_D]), 1.2);
    // 탄띠 (가슴을 두르는 띠)
    const b0 = L(62, -30), b1 = L(72, 22);
    ctx.strokeStyle = '#2a1e14'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
    for (let i = 1; i < 7; i++) { const x = lerp(b0.x, b1.x, i / 7), y = lerp(b0.y, b1.y, i / 7); ctx.fillStyle = i % 2 ? SILV : '#dfe4ee'; ctx.beginPath(); ctx.ellipse(x, y, 3.4, 1.5, -wa, 0, TAU); ctx.fill(); }
    // 달빛 가장자리 (등)
    ctx.strokeStyle = rgba(MOON, 0.45); ctx.lineWidth = 1.6; ctx.beginPath();
    const r0 = L(-8, -18), r1 = L(36, -34), r2 = L(80, -20); ctx.moveTo(r0.x, r0.y); ctx.quadraticCurveTo(r1.x, r1.y - 2, r2.x, r2.y); ctx.stroke();
  }
  /** 늑대 머리: 두개골 · 젖힌 귀 · 주둥이(윗턱) · 아래턱(벌림 jaw) · 송곳니 · 노란 눈 · 외투 깃 조각 */
  drawHeadW(ctx, fl) {
    const W = this.wp, h = W.head, t = this.t, jaw = clamp(this.ps.jaw, 0, 1);
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(W.ha);
    // 목 갈기
    ctx.beginPath(); ctx.moveTo(-22, -6); ctx.quadraticCurveTo(-18, -20, -4, -16); ctx.lineTo(-2, 12); ctx.quadraticCurveTo(-16, 16, -24, 8); ctx.closePath();
    ink(ctx, fl ? '#fff' : FUR, 1.2);
    // 아래턱
    ctx.save(); ctx.translate(8, 6); ctx.rotate(0.55 * jaw);
    ctx.beginPath(); ctx.moveTo(-6, -1); ctx.lineTo(20, 0); ctx.quadraticCurveTo(22, 4, 18, 5); ctx.lineTo(-4, 7); ctx.closePath();
    ink(ctx, fl ? '#fff' : FUR_D, 1.1);
    if (!fl && jaw > 0.15) { ctx.fillStyle = '#f2ecdc'; for (const x of [4, 10, 16]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 1.5, -4); ctx.lineTo(x + 3, 0); ctx.fill(); } }
    ctx.restore();
    if (!fl && jaw > 0.15) { ctx.fillStyle = '#3a0a10'; ctx.beginPath(); ctx.moveTo(8, 5); ctx.lineTo(28, 6); ctx.lineTo(10, 6 + 14 * jaw); ctx.closePath(); ctx.fill(); }   // 입속
    // 두개골 + 윗턱 (주둥이)
    ctx.beginPath();
    ctx.moveTo(-10, -8); ctx.quadraticCurveTo(-2, -16, 8, -12); ctx.quadraticCurveTo(18, -8, 30, -1); ctx.quadraticCurveTo(33, 2, 30, 5); ctx.lineTo(8, 6); ctx.quadraticCurveTo(-4, 10, -10, 4); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'hg_whead', 0, -16, 0, 8, [0, FUR_L, 0.6, FUR, 1, FUR_D]), 1.4);
    // 귀 (뒤로 젖힘)
    ctx.beginPath(); ctx.moveTo(-6, -11); ctx.lineTo(-16, -24); ctx.lineTo(-1, -14); ctx.closePath(); ink(ctx, fl ? '#fff' : FUR_D, 1.1);
    if (!fl) {
      ctx.fillStyle = '#0a0a10'; ctx.beginPath(); ctx.ellipse(30, 0.5, 2.6, 2, 0, 0, TAU); ctx.fill();   // 코
      ctx.fillStyle = '#f2ecdc'; ctx.beginPath(); ctx.moveTo(22, 5); ctx.lineTo(23.5, 11 + 3 * jaw); ctx.lineTo(25, 5); ctx.fill();   // 송곳니
      ctx.fillStyle = '#1a1208'; ctx.beginPath(); ctx.ellipse(6, -6, 3, 1.8, -0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = AMBER; ctx.beginPath(); ctx.arc(6.5, -6, 1.4, 0, TAU); ctx.fill();
      glow(ctx, 6.5, -6, 10, AMBER, 0.6 + 0.25 * Math.sin(t * 5));
      ctx.strokeStyle = 'rgba(40,44,56,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, -9); ctx.quadraticCurveTo(20, -6, 28, -1); ctx.stroke();
      // 외투 깃 조각 (목에 감긴 채)
      ctx.beginPath(); ctx.moveTo(-14, 2); ctx.quadraticCurveTo(-8, 10, 0, 9); ctx.lineTo(-2, 16); ctx.lineTo(-8, 12); ctx.lineTo(-12, 18); ctx.lineTo(-18, 8); ctx.closePath();
      ink(ctx, LEATH, 1);
    }
    ctx.restore();
  }
}

// ═════════════════════════════ 소품: 은 올가미 ═════════════════════════════
/**
 * 은 올가미 (trapLine): 손에서 던져져 fly 초 동안 포물선으로 날아가고(착지 자리 warnFloor), 내려앉으면 8초 남는다.
 * 밟으면 (땅을 디딘 플레이어가 고리 안) 이빨이 닫히며 mv 0.5 + 0.6초 묶임 → 닫힌 채 사라진다. 플레이어의 공격 한 대에 부서진다 (kind 'prop').
 * 적 정지 중 멈춘다 · 보스가 쓰러지면 사라진다 · 전환 뒤에도 그대로 남는다 · 부활(onReset)에 지워진다.
 */
let _tid = 0;
class HagenTrap extends Entity {
  constructor(boss, x0, y0, x, floor, fly) {
    super(x - 22, floor - 22, 44, 22);
    this.kind = 'prop'; this.z = 3; this.boss = boss; this.world = boss.world;
    this.tx = x; this.floor = floor; this.from = { x: x0, y: y0 }; this.fly = fly; this.life = 8; this.armed = false;
    this.snapT = -1; this.bindT = 0; this.bx = 0; this.broken = false; this.fade = false; this.fadeT = 0; this.spin = rand(0, TAU);
    this.stats = { def: 0, res: 0, maxHp: 1 }; this.hp = 1;
    this.def = { id: 'hagen_trap', name: '은 올가미', material: 'metal' };
    this.noGuardianHit = true;
    this.attack = { owner: boss, stats: boss.stats, mv: 0.5, kb: [60, -80], dir: 1, hitId: 'hgT' + (++_tid), tags: ['boss'] };
  }
  get invuln() { return !this.armed || this.snapT >= 0 || this.fade || !!this.boss.dead || this.boss.dying > 0; }
  hurtbox() { return { x: this.tx - 26, y: this.floor - 34, w: 52, h: 34 }; }
  /** 한 대에 부서진다 */
  takeHit(dmg, attack, world) {
    if (this.invuln || attack?.tags?.includes('companion')) return false;
    this.broken = true; this.dead = true;
    audio.sfx('clang', { pitch: 1.5, vol: 0.6 });
    world.fx.burst('spark', this.tx, this.floor - 8, 10, { color: SILV, speed: 220 });
    world.fx.burst('shard', this.tx, this.floor - 8, 5, { color: SILV_D, speed: 200 });
    return true;
  }
  update(dt, world) {
    if (heldByFreeze(world, this.boss)) return;   // [hook:feel] 적 정지 중 멈춤
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt;
    const b = this.boss;
    if (b.dead || b.dying > 0) this.fade = true;
    if (this.fade) { this.fadeT += dt; if (this.fadeT > 0.6) this.dead = true; return; }
    if (!this.armed) {
      if (this.t >= this.fly) { this.armed = true; audio.sfx('clang', { pitch: 1.2, vol: 0.45 }); world.fx.burst('paper', this.tx, this.floor - 4, 6, { color: SNOW, speed: 120, angle: -PI / 2, spread: 1.2 }); }
      return;
    }
    const p = world.player;
    if (this.snapT >= 0) {
      this.snapT += dt;
      if (this.bindT > 0 && p && !p.dead) { this.bindT -= dt; p.x = this.bx; p.vx = 0; if (p.vy < 0) p.vy = 0; }
      if (this.snapT > 0.9) this.dead = true;
      return;
    }
    if (this.t - this.fly >= this.life) { this.fade = true; return; }
    // 밟음: 땅을 디딘 플레이어의 발이 고리 안
    if (p && !p.dead && Math.abs(p.bottom - this.floor) < 10 && Math.abs(p.cx - this.tx) < 22) {
      this.attack.dir = Math.sign(p.cx - this.tx) || 1;
      if (enemyStrike(world, { x: this.tx - 20, y: this.floor - 16, w: 40, h: 16 }, this.attack)) {
        this.snapT = 0; this.bindT = 0.6; this.bx = p.x;
        audio.sfx('clang', { pitch: 0.8, vol: 0.8 }); audio.sfx('wolf_bite', { vol: 0.3, pitch: 1.6 });
        world.fx.burst('spark', this.tx, this.floor - 10, 8, { color: SILV, speed: 200 });
      }
    }
  }
  lights(L) { if (this.armed && !this.fade) L.add(this.tx, this.floor - 8, 60, SILV, 0.25); }
  draw(ctx, world) {
    const a = this.fade ? 1 - clamp(this.fadeT / 0.6, 0, 1) : 1;
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= a;
    if (!this.armed) {
      // 날아가는 중: 착지 자리 예고 + 포물선 위 올가미
      const k = clamp(this.t / this.fly, 0, 1);
      warnFloor(ctx, this.tx, this.floor, 60, k, SILV, world.time);
      const x = lerp(this.from.x, this.tx, k), y = lerp(this.from.y, this.floor - 8, k) - Math.sin(k * PI) * 110;
      drawTrap(ctx, world, x, y, 0.75, this.spin + k * 9, false);
    } else drawTrap(ctx, world, this.tx, this.floor - 3, 1, 0, this.snapT >= 0);
    ctx.restore();
  }
}

// ═════════════════════════════ 그리기 도우미 ═════════════════════════════
const OUTL = 'rgba(6,4,8,0.9)';
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
  if (hi) { ctx.strokeStyle = rgba(hi, 0.75); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(x0 - nx * r0 * 0.5, y0 - ny * r0 * 0.5); ctx.lineTo(x1 - nx * r1 * 0.5, y1 - ny * r1 * 0.5); ctx.stroke(); }
}
/** 장총 (원점 = 개머리판 끝, +x = 총구). 등에 멨으면 어둡게 */
function drawRifle(ctx, fl, dim) {
  // 개머리판 · 몸통 나무
  ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(24, -3.5); ctx.lineTo(30, -2.5); ctx.lineTo(70, -2.5); ctx.lineTo(70, 1.5); ctx.lineTo(32, 2); ctx.lineTo(26, 5.5); ctx.lineTo(0, 6); ctx.closePath();
  ink(ctx, fl ? '#fff' : dim ? '#3a2616' : WOOD, 1.2);
  // 총열
  ctx.fillStyle = fl ? '#fff' : dim ? '#24262c' : IRON; ctx.fillRect(28, -5, RIFLE - 28, 2.6);
  if (fl) return;
  ctx.fillStyle = '#6a6c74'; ctx.fillRect(28, -5, RIFLE - 28, 0.8);   // 총열 광택
  ctx.fillStyle = SILV_D; ctx.fillRect(26, -4, 8, 6);   // 기관부
  ctx.strokeStyle = '#1a1a20'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(30, 3.5, 3, 0, PI); ctx.stroke();   // 방아쇠울
  ctx.fillStyle = IRON; ctx.fillRect(RIFLE - 3, -7, 2, 2.4);   // 가늠쇠
}
/** 사냥칼 (원점 = 주먹, +x = 칼끝) */
function drawKnife(ctx, fl) {
  ctx.fillStyle = fl ? '#fff' : '#e8e0cc'; ctx.fillRect(-4, -1.8, 6, 3.6);   // 뼈 손잡이
  ctx.beginPath(); ctx.moveTo(2, -3); ctx.quadraticCurveTo(18, -4.5, KNIFE, 0.5); ctx.quadraticCurveTo(18, 2, 2, 2.6); ctx.closePath();
  ink(ctx, fl ? '#fff' : '#c8ccd4', 1.1);
  if (fl) return;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(4, -2.4); ctx.quadraticCurveTo(18, -3.6, KNIFE - 2, 0); ctx.stroke();
  ctx.fillStyle = BRASS; ctx.fillRect(1, -4, 2, 8);   // 날밑
}
/** 뿔피리 (원점 = 손, +x = 입 쪽) */
function drawHorn(ctx, fl) {
  ctx.beginPath(); ctx.moveTo(-14, -6); ctx.quadraticCurveTo(-2, -1, 10, -1.5); ctx.lineTo(10, 1.5); ctx.quadraticCurveTo(-2, 3, -14, 6); ctx.closePath();
  ink(ctx, fl ? '#fff' : '#d8ccb0', 1.1);
  if (fl) return;
  ctx.fillStyle = BRASS; ctx.fillRect(9, -2, 4, 4); ctx.fillRect(-15, -6.5, 2.5, 13);
}
/** 은 올가미: 채색 퍼핏이 준비됐으면 그 그림(위에서 본 가시 고리를 납작하게 눌러 옆에서 본 모양으로), 아니면 벡터 */
const TRAP_W = 46;
function drawTrap(ctx, w, x, y, s, spin, shut) {
  const rig = paintedEnabled?.(w?.game) ? paintedRig?.('b_hagen') : null;
  const p = rig?.parts?.trap, im = p?.v?.base;
  ctx.save(); ctx.translate(x, y);
  if (im && p.c) {
    const k = (TRAP_W * s) / Math.max(1, p.w - p.pad * 2);
    if (spin) ctx.rotate(spin);
    ctx.scale(k, k * (shut ? 0.22 : 0.42)); ctx.drawImage(im, -p.c[0], -p.c[1]);
    ctx.restore();
    return;
  }
  if (spin) ctx.rotate(spin);
  ctx.scale(s, s);
  const sh = shut ? 0.3 : 1;
  // 바닥 판 + 위아래 이빨 턱 (열림 = 벌어짐, 닫힘 = 맞물림)
  ctx.fillStyle = '#2a2c34'; ctx.fillRect(-14, -2, 28, 4);
  for (const dir of [-1, 1]) {
    ctx.save(); ctx.rotate(dir * (shut ? 0.05 : 0.6));
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 7 * sh, 0, dir < 0 ? PI : 0, dir < 0 ? TAU : PI); ctx.strokeStyle = SILV; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = '#e8ecf4';
    for (let i = -3; i <= 3; i++) { const tx = i * 5.5; ctx.beginPath(); ctx.moveTo(tx - 2, dir * 2 * sh); ctx.lineTo(tx, dir * -4 * sh); ctx.lineTo(tx + 2, dir * 2 * sh); ctx.fill(); }
    ctx.restore();
  }
  glow(ctx, 0, -2, 14, SILV, shut ? 0.2 : 0.35);
  ctx.restore();
}
/** 산탄 알 */
function pelletRender(ctx, p) {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  glowE(ctx, -6, 0, 14, 4, AMBER, 0.5);
  ctx.fillStyle = '#fff4d8'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.2, 0, 0, TAU); ctx.fill();
}
/** 은탄: 예고 = 조준선 (노랑 → 고정 뒤 붉게 · 굵게) / 판정 = 은빛 탄과 꼬리 */
function paintShot(ctx, z, path, lockAt, w) {
  const L = z.line;
  if (!z.started) {
    const locked = z.t >= lockAt, k = clamp(z.t / Math.max(0.01, z.warn), 0, 1);
    warnLine(ctx, L.x0, L.y0, L.x1, L.y1, locked ? 1 : k * 0.8, locked ? RED : AMBER, locked ? 2.4 : 1.4);
    if (locked) { glow(ctx, L.x0, L.y0, 16, RED, 0.6); glow(ctx, L.x1, L.y1, 18, RED, 0.5); }
    return;
  }
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(AMBER, 0.45); ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.95); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(L.x0 + (L.x1 - L.x0) * 0.4, L.y0 + (L.y1 - L.y0) * 0.4); ctx.lineTo(L.x1, L.y1); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  // 탄 (채색 bullet 부품이 있으면 그 그림)
  const a = Math.atan2(path.dy, path.dx), rig = paintedEnabled?.(w?.game) ? paintedRig?.('b_hagen') : null, p = rig?.parts?.bullet, im = p?.v?.base;
  ctx.save(); ctx.translate(L.x1, L.y1); ctx.rotate(a);
  if (im && p.c) { const k = 16 / Math.max(1, p.w - p.pad * 2); ctx.scale(k, k); ctx.drawImage(im, -p.c[0], -p.c[1]); }
  else { ctx.fillStyle = SILV; ctx.beginPath(); ctx.ellipse(0, 0, 7, 2.6, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  glow(ctx, L.x1, L.y1, 14, '#ffffff', 0.7);
}
/** 베기 잔상 (지대 사각형 안) */
function paintSlash(ctx, z, f, up, col) {
  const k = clamp(z.t / Math.max(0.01, z.dur), 0, 1), a = 1 - k;
  const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [lw, c, al] of [[12, col, 0.4], [3.5, '#ffffff', 0.9]]) {
    ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw;
    ctx.beginPath();
    if (up) { ctx.moveTo(cx - f * z.w * 0.45, cy + z.h * 0.35); ctx.quadraticCurveTo(cx, cy - z.h * 0.15, cx + f * z.w * 0.45, cy - z.h * 0.4); }
    else { ctx.moveTo(cx - f * z.w * 0.45, cy - z.h * 0.35); ctx.quadraticCurveTo(cx, cy + z.h * 0.15, cx + f * z.w * 0.45, cy + z.h * 0.4); }
    ctx.stroke();
  }
}
/** 할퀴기 자국: 평행한 세 줄 */
function paintClaw(ctx, z, f, k) {
  const a = 1 - clamp(z.t / Math.max(0.01, z.dur), 0, 1), cx = z.x + z.w / 2, cy = z.y + z.h / 2;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    for (const [lw, c, al] of [[8, MOON, 0.4], [2.5, '#ffffff', 0.9]]) {
      ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw;
      ctx.beginPath();
      const up = k % 2 === 0 ? 1 : -1;
      ctx.moveTo(cx - f * z.w * 0.4, cy + up * z.h * 0.35 + i * 12); ctx.quadraticCurveTo(cx, cy + i * 12, cx + f * z.w * 0.42, cy - up * z.h * 0.35 + i * 12);
      ctx.stroke();
    }
  }
}
/** 달 그림자: 바닥의 둥근 그림자가 커진다 (내려앉을 자리) */
function paintMoonShadow(ctx, x, floor, k) {
  ctx.fillStyle = `rgba(6,10,24,${(0.25 + 0.45 * k).toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(x, floor - 3, 20 + 40 * k, 5 + 5 * k, 0, 0, TAU); ctx.fill();
  glowE(ctx, x, floor - 6, 60 * k + 10, 10, MOON, 0.25 * k);
}
/** 내리꽂기: 예고 = 세로 조준선 / 판정 = 푸른 달빛 꼬리 */
function paintDive(ctx, z, x, top, floor) {
  const L = z.line;
  if (!z.started) { warnLine(ctx, x, top + 60, x, floor, z.k, MOON, 3); return; }
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(MOON, 0.4); ctx.lineWidth = 60;
  ctx.beginPath(); ctx.moveTo(x, L.y0 - 60); ctx.lineTo(x, L.y1 - 40); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x, L.y0 - 30); ctx.lineTo(x, L.y1 - 40); ctx.stroke();
}

/** 벡터 그림 컬링 대리 개체 (e_nemain.js 와 같은 방식): 보스의 artBounds() 를 사각형으로 삼아 보스 draw 를 대신 부른다 */
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
