// 보스 b_paracel — 파라켈 박사 / 수은의 연금술사 (s26 외전 「파라켈의 지하 공방」) — docs/specs/ex_s26.md §2. 소유: CH26-A
// **아직 어디에도 등록하지 않았다** (새 파일만 — bosses_e.js · lazy.js · index.js · data/bosses_e.js · reg/ex-boss.js 는 /tmp/claude-0/s5/ch26_wiring.md).
// BossC(c_common.js) 상속. 틀은 e_charon.js · e_bride.js (전환 · 15% 강제 · 1페이즈 창 상한 · ArtCull 대리 개체) 와 같고, 판정은 모두 c_common 키트
// (strikeRect · strikeColumn · strikeCircle · strikeLine · strikeFloor · groundWave · warnMark) + 보스 소유 Zone. 타일은 바꾸지 않는다 (금 바닥·수은은 그림 + 판정 지대).
//
// 모습: 키 큰 깡마른 노인. 가죽 앞치마 · 검은 외투 · 허리띠의 세 빛깔 플라스크(불 붉음 · 얼음 푸름 · 독 초록) + 금빛 약병.
//   대머리의 긴 두개골, 얼굴 절반을 덮은 은빛 수은 핏줄, 한쪽 눈에 겹겹이 끼운 황동 확대경, 금으로 굳은 손끝.
//   등에는 사람 몸통만 한 유리 배양조 — 그 안의 태아 같은 호문쿨루스가 관으로 등뼈에 이어져 숨 쉰다.
//   먼 쪽 팔은 이어 붙인 호문쿨루스의 팔: 관절이 너무 많고, 끝에 아기 손 여럿이 달렸다 (접합 팔 휘두르기).
//   2페이즈(fuse, 50%): 배양조를 스스로 깨고 호문쿨루스를 가슴에 받아들인다 — 가슴의 두 번째 얼굴 · 깨진 유리 조각 · 다리부터 번지는 금 (goldK).
// 판정 부위 (가까운 부위 우선, defMul = 방어 배율 — 작을수록 아프다): 머리 0.85 (노릴 곳) · 몸통 1.0 · 다리 1.15 ·
//   1페이즈 배양조 1.0 (배양조 부풂 동안만 prio — 플레이어·탈것 한 대로 깨짐 → 무릎) · 2페이즈 가슴의 얼굴 0.75 (약점).
//   무릎(stagger) 몸통 0.7 · 머리 0.6 (15% 긴 무릎 0.6). 수은 해일로 녹아 있는 동안은 판정·접촉 없음.
// 패턴 (static PATTERNS — docs/specs/ex_s26.md §2.1): flaskVolley(삼원소 플라스크 — 던질 때마다 불→얼음→독 차례로) · mercuryPool(수은 웅덩이) ·
//   tankBrood(배양조 — 끊으면 무릎, 못 끊으면 호문쿨루스) · graftLash(접합 팔 휘두르기) · burningGlass(불타는 렌즈 광선) ·
//   goldFloor(황금 변성 — 바닥 구간이 금이 됐다가 깨진다) · mercuryWave(수은 해일 — 녹아 가로지르고 반대편에서 솟는다 · 솟는 순간 카운터) ·
//   elixirRain(금빛 약비) · 보조 stagger · lastDose(15%). 모든 공격은 어느 페이즈에서든 돈다 (debugAct).
//   **모든 공격의 예고는 0.6초 이상** (플라스크 낙하 표시 ≥ 1.2초 · 웅덩이 0.75 · 배양조 0.9 · 팔 0.6/0.95 · 렌즈 1.0 · 금 바닥 1.2 (지옥 1.0) ·
//   해일 0.7 (지옥 되돌이 0.6) · 약비 0.7 · 15% 금빛 파열 0.8).
// 지옥 갈래 (this.inferno — 악몽/지옥 난이도 · 회차 · 앞으로의 악몽 재대결 opts.nightmare): 1부 보스(a_*/b_*)와 같은 규칙으로 읽는다 —
//   플라스크 +2 · 웅덩이 4 · 호문쿨루스 3마리(상한 4) · 1페이즈에도 낮은 두 번째 휘두르기 · 렌즈 광선 +1 · 금 바닥 +1구간 · 3물결 · 예고 1.0 ·
//   해일 되돌아옴 · 약비 8방울. 휴식은 BossB.restTime 이 이미 ×1/1.25.
// 창 상한 (POLISH-4 교훈 — 처음부터): 1페이즈 무릎 한 번 STAG_CAP 10% (takeHit 에서 줄여 '저항', capNote). 필살·각성 · 2페이즈 · 15% 긴 무릎은 상한 밖.
//   배양조 깨기·해일 카운터의 '한 대'는 플레이어·탈것 공격만 센다 (ownHit — 수호신 자동 공격 제외).
// 모든 패턴은 this.A(경기장 경계)와 A.floor 만 기준 — 보스 방(s26 boss 60×18) · 투기장(maps/arena.js r1) · 무한의 탑 보스 층이 같다. 방 기믹 없음.
// 결말 (체력 0): 보스 처치 처리(world.onBossDefeated)는 같고 부제는 기본 '격파!' (이름이 두 모습 같은 '파라켈 박사' — renameBanner 는 안전망).
//   스토리: 무릎 꿇은 채 발끝부터 금으로 굳어 조각상으로 남는다 (b_paracel_post) · 아케이드: 굳은 뒤 1.8초부터 금가루로 흩어져 3.0초에 사라진다.
// 채색 렌더러(render/painted/bosses/b_paracel.js — 다음 작업)가 읽을 필드: zx, fy (발) · fk (좌우 −1..1, 연속) · facing · ps {lean, crouch, kneel, armN, lash,
//   lashLow, lens, melt, tankK} · pts (골격, rig()) · graft (접합 팔 점 7) · fused · tankBroke · goldK · sunk · exposed · stunned · dieT · vanishK ·
//   lensOn · state · t · flashT · A. 벡터 그림은 아래 paintBack/paintBody/paintFront — 채색이 없거나 실패해도 모든 상태가 그려진다.
// 그리기 함수 안에서는 난수·입자 생성을 하지 않는다 (hook_tags draw.fx / draw.rng) — 흔들림은 hash(시각) 로.
import { BossC, telegraph, strikeRect, strikeColumn, strikeCircle, strikeLine, groundWave, warnMark, spawnMinion, minionsAlive, phaseScript, canShowScript, capNote } from './c_common.js';
import { PI, R, LG, ink, glow, glowE, glowSprite, warnRect, warnFloor, warnCircle, warnLine, impact, ownHit, hash } from './b_common.js';
import { Entity } from '../entity.js';
import { TILE } from '../../core/game.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';
import { registerPainted, hasPainted, paintedDraw } from '../../render/painted/registry.js';   // 채색 퍼핏 (그리기 전용)
import { bosses as EXB } from '../../render/painted/reg/ex-boss.js';

// ── 색 (docs/specs/ex_s26.md §2: 수은 은빛 · 금 · 배양액 녹청 · 가죽 · 병자의 살빛) ──
const SILVER = '#c8d4e0', SILVER_H = '#f4f8ff', SILVER_D = '#5e6874', GOLD = '#e8c060', GOLD_H = '#fff0b0', GOLD_D = '#7a5a1c';
const SKIN = '#c4b2a0', SKIN_D = '#7e6c5c', SKIN_H = '#e8dccc', FLESH = '#d8968c', FLESH_D = '#8a4a46', FLESH_H = '#f4c8c0';
const COAT = '#1c1820', COAT_H = '#3a3240', LEATHER = '#4a3424', LEATHER_D = '#24180e', LEATHER_H = '#7a5a3c', BRASS = '#b48a40', BRASS_H = '#f0d090';
const GLASS = '#8fd8b8', BROTH = '#5a8a3a', BROTH_H = '#c8f080', OUTL = '#07040c';
const EL3 = [
  { id: 'fire', col: '#ff7a2a', hi: '#ffd8a0', dk: '#7a1e04' },
  { id: 'ice', col: '#9fe8ff', hi: '#ffffff', dk: '#1e4a6a' },
  { id: 'poison', col: '#7cff5a', hi: '#e8ffc8', dk: '#1e5a12' },
];
// ── 패턴 계약 (docs/specs/ex_s26.md §2.1 — 클래스의 static PATTERNS 가 c_common P2_PATTERNS 보다 이긴다) ──
const PATTERNS = {
  attacks: ['flaskVolley', 'mercuryPool', 'tankBrood', 'graftLash', 'burningGlass', 'goldFloor', 'mercuryWave', 'elixirRain'],
  helpers: ['stagger', 'lastDose'],
  transitions: { 1: { state: 'fuse', dur: 2.4, script: 'b_paracel_fuse', form2: true, force: 'goldFloor', applyAt: 1.6 / 2.4 } },
  weights: [
    { flaskVolley: 3, mercuryPool: 2, tankBrood: 2, graftLash: 3, burningGlass: 2 },
    { goldFloor: 3, mercuryWave: 2, elixirRain: 2, flaskVolley: 2, graftLash: 1, burningGlass: 1, tankBrood: 1 },
  ],
  gimmicks: [],
  floorRow: 16,
  // s21–s25 boss 방과 같은 뼈대 (src/data/maps/s26.js boss — 13행 한쪽 디딤 둘 포함)
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7], [18, 13, 20, 13], [55, 13, 58, 13]] },
};
const T48 = () => TILE || 48;
const SIZE = { w: 84, h: 176 };
const STAG_CAP = [0.10];              // 1페이즈 무릎 한 번 (최대 체력 비율) — 2페이즈는 상한 없음
const SEG_TILES = 4;                  // 황금 변성 바닥 구간 폭 (칸)
const WAVE_SPEED = 980;               // 수은 해일 (px/s)
const POSE0 = { lean: 0, crouch: 0, kneel: 0, armN: 0, lash: 0, lashLow: 0, lens: 0, melt: 0, tankK: 0 };
const POSE_RATE = { lean: 6, crouch: 7, kneel: 5, armN: 9, lash: 10, lashLow: 10, lens: 8, melt: 3.2, tankK: 4 };
const pt = () => ({ x: 0, y: 0 });

export class Paracel extends BossC {
  static get PATTERNS() { return PATTERNS; }

  setup() {
    // 채색 퍼핏: 모음(reg/ex-boss.js)에 b_paracel 줄이 생기면 여기서 한 번 등록 (없으면 아무것도 안 함 — 벡터만)
    if (!hasPainted?.('b_paracel') && EXB?.b_paracel) registerPainted?.('b_paracel', { kind: 'boss', importer: EXB.b_paracel });
    const A = this.A;
    this.noGravity = true; this.vx = 0; this.vy = 0;
    this.w = SIZE.w; this.h = SIZE.h;
    this.zx = this.clampX(this.cx); this.fy = A.floor;
    const p0 = this.P;
    this.facing = this.fk = p0 && p0.cx < this.zx ? -1 : 1;
    this.tzx = this.zx; this.spd = 0; this.walkK = 0; this.walkPh = 0;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    this.pts = { hip: pt(), neck: pt(), head: pt(), eyeN: pt(), shN: pt(), shF: pt(), elN: pt(), hdN: pt(), knN: pt(), knF: pt(), ftN: pt(), ftF: pt(), tank: pt(), chest: pt(), lens: pt(), tA: 0 };
    this.graft = Array.from({ length: 7 }, pt);
    this.fused = false; this.tankBroke = -9; this.goldK = 0.06; this.elemI = 0;
    this.sunk = false; this.exposed = false; this.stunned = false; this.stagLong = false; this.lensOn = false; this.tankUp = false;
    this.capBud = null; this.capSaid = false; this.wakeT = 9;
    this._forced15 = false; this._lastNow = false; this._tankNow = false; this._stagNow = false; this._lastMode = false; this._lastEnd = false; this._bn = null;
    this.dieT = 0; this.vanishK = 0; this.dustAcc = 0; this.fxAcc = 0;
    this.ventZ = null; this.wv = null; this._n = 0; this._end = 0;
    this.pHead = { x: 0, y: 0, w: 34, h: 40, defMul: 0.85 };
    this.pTorso = { x: 0, y: 0, w: 48, h: 86, defMul: 1.0 };
    this.pLegs = { x: 0, y: 0, w: 44, h: 62, defMul: 1.15 };
    this.pTank = { x: 0, y: 0, w: 40, h: 66, defMul: 1.0, tank: true, prio: false };   // prio(부풂 동안만): 공격 판정이 겹치면 가까운 부위보다 먼저 (combat.js pickPart)
    this.pChest = { x: 0, y: 0, w: 30, h: 30, defMul: 0.75 };
    this.cBody = { x: 0, y: 0, w: 40, h: 140 };
    this._hp = []; this._cp = []; this._r = pt(); this._q = pt();
    // 싸움 중 새 캔버스 0 (MASTER_PLAN §5.2): 쓰는 발광 색은 등장 때 굽는다
    for (const c of [SILVER, GOLD, GLASS, '#ffffff', ...EL3.map((e) => e.col), '#ffd060']) { glowSprite(c, false); glowSprite(c, true); }
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; }
  clampX(x) { const A = this.A; return clamp(x, A.x0 + 56, Math.max(A.x0 + 56, A.x1 - 56)); }
  faceP(th = 30) { const p = this.P; if (p) { const d = p.cx - this.zx; if (Math.abs(d) > th) this.facing = Math.sign(d); } }
  hpK() { return this.stats?.maxHp ? this.hp / this.stats.maxHp : 1; }
  /** 지역 좌표 (앞 = +x, 위 = −y, 발 = 0,0) → 월드 */
  toW(lx, ly, out = this._r) { out.x = this.zx + lx * this.facing; out.y = this.fy + ly; return out; }
  handW(out = this._q) { return this.toW(this.pts.hdN.x, this.pts.hdN.y, out); }
  tankW(out = this._q) { return this.fused ? this.toW(this.pts.chest.x, this.pts.chest.y, out) : this.toW(this.pts.tank.x, this.pts.tank.y, out); }
  lensW(out = this._q) { return this.toW(this.pts.lens.x, this.pts.lens.y, out); }
  place() { this.x = this.zx - this.w / 2; this.y = this.fy - this.h; }
  /** 금 바닥 구간 (A 안을 SEG_TILES 칸씩) */
  segs() {
    const A = this.A, W = SEG_TILES * T48(), n = Math.max(3, Math.floor(A.w / W)), w = A.w / n, out = [];
    for (let i = 0; i < n; i++) out.push({ i, x0: A.x0 + i * w, x1: A.x0 + (i + 1) * w });
    return out;
  }
  /** 골격 (지역 좌표). 자세 ps 를 따른다 — 채색 렌더러도 읽는다 */
  rig() {
    const P = this.ps, S = this.pts, t = this.t;
    const breathe = Math.sin(t * 2.1) * 1.6, walk = this.walkK, ph = this.walkPh;
    const hipY = -84 + P.crouch * 14 + P.kneel * 34 + Math.abs(Math.sin(ph)) * 2 * walk;
    S.hip.x = 2 * walk * Math.sin(ph); S.hip.y = hipY;
    const tA = 0.2 + P.lean * 0.45 + P.crouch * 0.25 + P.kneel * 0.2;   // 앞으로 굽은 등
    S.tA = tA;
    const c = Math.cos(tA), s = Math.sin(tA);
    const rotP = (x, y, o) => { o.x = S.hip.x + x * c - y * s; o.y = S.hip.y + x * s + y * c; return o; };
    rotP(2, -60 + breathe, S.neck);
    rotP(8, -56, S.shN); rotP(-8, -55, S.shF);
    rotP(-30, -32, S.tank);
    rotP(12, -40, S.chest);
    const hA = tA * 0.6 + 0.12 + Math.sin(t * 0.9) * 0.03;
    S.head.x = S.neck.x + 8 * Math.cos(hA) + 16 * Math.sin(hA); S.head.y = S.neck.y + 8 * Math.sin(hA) - 16 * Math.cos(hA);
    S.eyeN.x = S.head.x + 9; S.eyeN.y = S.head.y - 2;
    // 다리 (가까운 쪽 앞, 먼 쪽 뒤) — 무릎 꿇기면 가까운 무릎이 바닥에
    const stride = Math.sin(ph) * 16 * walk;
    S.ftN.x = 14 + stride - P.kneel * 34; S.ftN.y = 0;
    S.ftF.x = -12 - stride + P.kneel * 6; S.ftF.y = 0;
    ik(S.hip.x + 5, S.hip.y, S.ftN.x, S.ftN.y, 44, 46, 1, S.knN);
    ik(S.hip.x - 5, S.hip.y, S.ftF.x, S.ftF.y, 44, 46, 1, S.knF);
    if (P.kneel > 0.5) { S.knN.x = lerp(S.knN.x, 20, P.kneel); S.knN.y = lerp(S.knN.y, -4, P.kneel); }
    // 가까운 팔: 0 쉼 · 1 머리 위로 · 2 앞으로 던짐 · 3 앞 아래로 부음 · 4 입으로 (약병)
    const a = P.armN, sh = S.shN;
    const tgt = [[18, 30], [8, -46], [40, -18], [36, 18], [S.head.x - sh.x + 6, S.head.y - sh.y + 8]];
    const i0 = Math.max(0, Math.min(4, Math.floor(a))), i1 = Math.min(4, i0 + 1), k = clamp(a - i0, 0, 1);
    const tx = sh.x + lerp(tgt[i0][0], tgt[i1][0], k), ty = sh.y + lerp(tgt[i0][1], tgt[i1][1], k) + breathe * 0.5;
    ik(sh.x, sh.y, tx, ty, 30, 30, -1, S.elN);
    S.hdN.x = tx; S.hdN.y = ty;
    // 렌즈 (가까운 손 위)
    S.lens.x = S.hdN.x + 6; S.lens.y = S.hdN.y - 14 * P.lens - 4;
    // 접합 팔: 어깨에서 7점. 쉼 = 늘어져 무릎까지 꿈틀 · −1 = 등 뒤로 감김 · +1 = 앞으로 뻗음 (lashLow = 바닥 높이)
    const L = P.lash, low = P.lashLow, G = this.graft, f = S.shF;
    const reach = L > 0 ? 40 + L * 196 : 40 - L * 10, dropY = L > 0 ? lerp(-36, 48 + low * 34, L) : 60 + L * 20;
    for (let j = 0; j < 7; j++) {
      const u = j / 6, tw = Math.sin(t * 3.1 + j * 1.3) * (6 + 6 * u) * (1 - Math.max(0, L));
      if (L >= 0) { G[j].x = f.x + reach * u + tw * 0.3; G[j].y = f.y + dropY * u * u + 18 * Math.sin(PI * u) * (1 - L) + tw; }
      else { const ang = -PI * 0.25 - u * PI * 1.1 * (-L); G[j].x = f.x - 8 + Math.cos(ang) * 46 * u - 22 * u * (-L); G[j].y = f.y + 20 * u + Math.sin(ang) * 46 * u + tw; }
    }
  }
  /** 판정 부위 (월드 사각형) */
  syncParts() {
    const S = this.pts, f = this.facing;
    const box = (r, lx, ly, w, h) => { const cx = this.zx + lx * f; r.x = cx - w / 2; r.y = this.fy + ly - h / 2; r.w = w; r.h = h; };
    box(this.pHead, S.head.x, S.head.y, 34, 40);
    box(this.pTorso, (S.hip.x + S.neck.x) / 2 + 4, (S.hip.y + S.neck.y) / 2, 48, Math.max(40, S.hip.y - S.neck.y + 26));
    box(this.pLegs, 2, S.hip.y / 2, 44, Math.max(20, -S.hip.y));
    box(this.pTank, S.tank.x, S.tank.y, 40, 66);
    box(this.pChest, S.chest.x, S.chest.y, 30, 30);
    box(this.cBody, (S.hip.x + S.neck.x) / 2, (S.neck.y) / 2, 40, -S.neck.y);
    this.pTank.prio = this.tankUp && !this.fused;   // 배양조 부풂 동안만 먼저 맞는다
    const st = this.stunned, lng = this.stagLong;
    this.pTorso.defMul = st ? (lng ? 0.6 : 0.7) : 1.0;
    this.pHead.defMul = st ? 0.6 : 0.85;
  }
  /** 이동 · 자세 보간 · 골격 · 판정 (논리 틱 — 그리기에서 부르지 않는다) */
  motion(dt, world) {
    for (const k in this.ps) this.ps[k] = approach(this.ps[k], this.pt[k], (POSE_RATE[k] ?? 6) * dt);
    if (dt > 0 && this.spd > 0 && !this.sunk) {
      const d = this.tzx - this.zx;
      if (Math.abs(d) > 2) this.zx += Math.sign(d) * Math.min(Math.abs(d), this.spd * dt);
      this.walkK = approach(this.walkK, Math.abs(d) > 6 ? 1 : 0, dt * 5);
    } else this.walkK = approach(this.walkK, 0, dt * 5);
    this.walkPh += dt * 7 * this.walkK;
    this.zx = this.clampX(this.zx); this.fy = this.A.floor;
    this.fk = approach(this.fk, this.facing, dt * 6);
    this.rig();
    this.place();
    this.syncParts();
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0 || this.hidden || this.sunk) return L;
    if (this.tankUp && !this.fused) L.push(this.pTank);
    L.push(this.pHead, this.pTorso, this.pLegs);
    if (this.fused) L.push(this.pChest);
    else if (!this.tankUp) L.push(this.pTank);
    return L;
  }
  /** 접촉은 몸통 기둥만. 녹은 동안·무릎·사망 중에는 없다 */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.hidden || this.sunk || this.dying > 0 || this.stunned) return L;
    L.push(this.cBody);
    return L;
  }
  /** 1페이즈 무릎 창 상한 (e_charon.js · e_bride.js 와 같은 틀 — 남은 예산 capBud). 필살·각성은 빼고 */
  takeHit(dmg, attack, world, info) {
    const burst = attack?.tags?.includes('ult') || attack?.tags?.includes('awaken');
    if (this.capBud != null && !burst && !(this.dying > 0) && !this.invuln) {
      if (dmg >= this.capBud) {
        dmg = Math.max(0, Math.round(this.capBud)); this.capBud = 0;
        capNote(this, info, dmg);
        if (this.state === 'stagger' && this.stunned) this.wakeT = this.st + 1e-3;
      } else this.capBud -= dmg;
    }
    return super.takeHit(dmg, attack, world, info);
  }
  setState(s) {
    super.setState(s);
    const c = s === 'stagger' && !this.stagLong ? STAG_CAP[this.phase] : null, mx = this.stats?.maxHp;
    this.capBud = c && mx ? mx * c : null; this.capSaid = false;
  }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (Math.random() < 0.5) world.fx.burst(part === this.pTank ? 'water' : 'spark', x, y, 2, { color: part === this.pTank ? GLASS : SILVER, speed: 150 });
    if (this.dying > 0 || this.dead) { this.renameBanner(world); return; }
    this.check15();
    const own = ownHit(attack);
    // 배양조 부풂 동안 플레이어·탈것이 배양조를 한 대 → 깨짐 (소환 없음, 1페이즈 무릎)
    if (this.state === 'tankBrood' && this.tankUp && part === this.pTank && own && !this.fused) { this._tankNow = true; return; }
    // 수은 해일 뒤 다시 솟는 순간(exposed)에 한 대 → 무릎
    if (this.exposed && this.state === 'mercuryWave' && own) { this.exposed = false; this._stagNow = true; }
  }
  /** 체력 15% 이하 한 번(싸움마다): 다음 틱에 하던 패턴을 끊고 lastDose (e_charon.js check15 와 같은 틀) */
  check15() {
    if (this._forced15 || this.phase < 1 || this.dying > 0 || this.hpK() > 0.15) return;
    this._forced15 = true; this._lastNow = true;
  }
  toForced() {
    this._lastNow = false; this._tankNow = false; this._stagNow = false;
    if (this.dying > 0 || this.dead) return;
    if (this._tr) { this.forceNext('lastDose'); return; }
    this.clearJobs(); this.onCancel(this.world);
    this.lastAtk = 'lastDose';
    this.setState('lastDose');
  }
  toStagger(long = false) {
    this._stagNow = false;
    if (this.dying > 0 || this.dead || this._tr) return;
    this.clearJobs(); this.onCancel(this.world);
    this.stagLong = long;
    this.setState('stagger');
  }
  breakTank(world = this.world) {
    this._tankNow = false;
    if (this.ventZ && !this.ventZ.dead) this.ventZ.dead = true;
    this.ventZ = null; this.tankUp = false;
    const B = this.tankW(pt());
    audio.sfx('break_wall', { vol: 0.8, pitch: 1.4 }); audio.sfx('splash', { vol: 0.6, pitch: 0.7 });
    world.fx.burst('shard', B.x, B.y, 14, { color: GLASS, speed: 260 });
    world.fx.burst('goo', B.x, B.y, 10, { color: BROTH_H, speed: 200 });
    impact(world, { shake: 6, time: 0.3, flash: '#d0ffe8', fa: 0.18 });
    this.tankCrackT = this.t;
    this.toStagger(false);
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    // 피격 처리 안이 아니라 여기서 (runJobs 밖 — clearJobs 가 안전하다): 15% 강제 > 배양조 깨짐 > 무릎
    if (this._lastNow) this.toForced();
    else if (this._tankNow) this.breakTank(world);
    else if (this._stagNow) this.toStagger();
    if (this.fused && !(this.dying > 0)) this.goldK = approach(this.goldK, 0.35 + 0.45 * (1 - this.hpK() / 0.5), dt * 0.2);
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
  }
  ambient(dt, world) {
    if (this.sunk || this.vanishK >= 1) return;
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * 2.4;
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const r = Math.random();
      if (r < 0.4) { const H = this.toW(this.pts.head.x + rand(-4, 8), this.pts.head.y + 10, this._r); world.fx.emit('water', H.x, H.y, { color: SILVER, speed: 20, angle: PI / 2, spread: 0.3 }); }
      else if (r < 0.75 && !this.fused) { const B = this.toW(this.pts.tank.x + rand(-8, 8), this.pts.tank.y + rand(-16, 16), this._r); world.fx.emit('water', B.x, B.y, { color: BROTH_H, speed: 30, angle: -PI / 2, spread: 0.4 }); }
      else { const P = this.toW(rand(-14, 18), -rand(4, 60 + 80 * this.goldK), this._r); world.fx.emit('gold', P.x, P.y, { color: GOLD, speed: 24, angle: -PI / 2, spread: 1 }); }
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) {
    const reach = this.ps.lash > 0.05 ? 260 : 120;
    let x0 = this.zx - 120, x1 = this.zx + 120;
    if (this.facing > 0) x1 = Math.max(x1, this.zx + reach); else x0 = Math.min(x0, this.zx - reach);
    r.x = x0; r.y = this.fy - 240; r.w = x1 - x0; r.h = 270;
    return r;
  }
  /** 그리기: 채색이 준비됐으면 채색(대리 개체), 아니면 벡터. 쓰러짐은 스스로 보여 주므로 Boss.draw 의 사망 투명도 감쇠를 쓰지 않는다 */
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
    if (world.game?.debug) { ctx.save(); ctx.strokeStyle = '#0ff'; for (const hb of this.hurtboxes()) ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); ctx.strokeStyle = '#ff0'; for (const hb of this.hitParts()) ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); ctx.restore(); }
  }

  // ═════════════════════════════ 상태 ═════════════════════════════
  /** 등장: 도가니를 들여다보다 돌아선다 */
  s_intro(dt, world, t) {
    if (this.at(0.001)) { this.setPose({ crouch: 0.4, lean: 0.4, armN: 3 }); audio.sfx('mist', { vol: 0.5, pitch: 0.6 }); }
    if (this.at(0.7)) { this.faceP(0); this.setPose({ crouch: 0, lean: -0.15, armN: 1 }); audio.sfx('magic', { vol: 0.5, pitch: 0.6 }); impact(world, { shake: 3, time: 0.3 }); }
    if (this.at(1.3)) this.relax();
    if (t >= 1.6) this.done(0.8);
  }
  /** 대기: 플레이어와 4–6칸을 두고 걷는다 (붙으면 물러선다) · 2페이즈는 조금 빠르게 */
  idleMove(dt, world, t) {
    const A = this.A, p = this.P, px = p ? p.cx : A.cx, T = T48();
    this.faceP(30);
    const side = Math.sign(this.zx - px) || -this.facing;
    const d = 5 * T + Math.sin(this.t * 0.7) * T, close = p && Math.abs(p.cx - this.zx) < 2.4 * T;
    this.tzx = clamp(px + side * d, A.x0 + 60, A.x1 - 60);
    this.spd = (close ? 230 : 110) * (this.fused ? 1.2 : 1);
    if (this.state === 'idle') this.setPose({ lean: close ? -0.1 : 0.05, armN: 0, lash: 0, lens: 0 });
  }

  // ── flaskVolley 삼원소 플라스크: 띠에서 병을 뽑아 0.5초(예고) → 0.16초 간격으로 플레이어 자리(±2.4칸 간격)에 포물선 투척 (비행 0.72초+).
  //    떨어질 자리는 손을 들 때부터 바닥 표시 (예고 ≥ 1.2초). 병마다 원소가 차례로: 불(폭발 r72 mv 0.8 + 불바닥 1.1초) → 얼음(얼음 기둥 mv 0.85)
  //    → 독(웅덩이 3초 rehit 0.5 mv 0.18). 1페이즈 3병 · 2페이즈 5병 · 지옥 +2 ──
  s_flaskVolley(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      const n = this._n = (this.phase ? 5 : 3) + (this.inferno ? 2 : 0);
      this.setPose({ lean: -0.1, armN: 1 });
      telegraph(this, 0.5, { sfx: 'warning', vol: 0.3 }); audio.sfx('magic', { vol: 0.5, pitch: 0.7 });
      const A = this.A, p = this.P, T = T48();
      const px = p ? p.cx : A.cx;
      const H = this.toW(this.pts.shN.x + 8, this.pts.shN.y - 46, pt());
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 2.4 * T + rand(-0.35, 0.35) * T;
        const x = clamp(px + off, A.x0 + 40, A.x1 - 40);
        const el = EL3[this.elemI++ % 3];
        this.flask(H.x, H.y, x, A.floor, 0.5 + i * 0.16, 0.72 + 0.04 * i, el);
      }
    }
    if (this.at(0.5)) this.setPose({ armN: 2 });
    if (this.every(0.16, 0.5, 0.5 + this._n * 0.16)) { this.pt.armN = this.pt.armN === 2 ? 1.6 : 2; audio.sfx('dagger', { vol: 0.4, pitch: 0.6 }); }
    if (this.at(0.6 + this._n * 0.16)) this.relax();
    if (t >= 1.5 + this._n * 0.16) this.done(1.0);
  }
  /** 날아가는 병 (그림만, 판정 없음) + 떨어진 자리의 원소 효과 (지금 만들고 예고 = 대기 + 비행) */
  flask(x0, y0, x1, y1, delay, flight, el) {
    const warn = delay + flight, peak = Math.min(y0, y1) - 150;
    this.zone({ x: Math.min(x0, x1) - 20, y: peak - 20, w: Math.abs(x1 - x0) + 40, h: y1 - peak + 40, warn: 0, life: warn, harmless: true, z: 8,
      paint: (ctx, z) => {
        if (z.t < delay) return;
        const k = clamp((z.t - delay) / flight, 0, 1), x = lerp(x0, x1, k), y = lerp(y0, y1, k) - 4 * (y0 - peak) * k * (1 - k) * 0.9;
        drawFlaskBottle(ctx, x, y, z.t * 12, el, 1);
      } });
    const fy = y1;
    if (el.id === 'fire') {
      strikeCircle(this, x1, fy - 34, 72, { warn, life: 0.3, mv: 0.8, element: 'fire', color: el.col, sfx: 'explode', vol: 0.5, burstFx: 'fire',
        onStart: () => this.patch(x1, fy, 100, 1.1, 0.2, 'fire', el) });
    } else if (el.id === 'ice') {
      this.zone({ x: x1 - 34, y: fy - 124, w: 68, h: 124, warn, life: 0.45, mv: 0.85, element: 'ice', kb: [240, -520],
        onStart: (z, w) => { audio.sfx('ice', { vol: 0.7, pitch: 0.8 }); w.fx?.burst?.('ice', x1, fy - 40, 12, { speed: 260 }); },
        paint: (ctx, z, w) => {
          if (!z.started) { warnFloor(ctx, x1, fy, 90, z.k, el.col, w.time); return; }
          const g = z.a < 0.2 ? z.a / 0.2 : 1, f = 1 - Math.max(0, (z.a - 0.6) / 0.4);
          drawIceSpikes(ctx, x1, fy, 124 * g, f, el);
        } });
    } else {
      this.zone({ x: x1 - 64, y: fy - 22, w: 128, h: 22, warn, life: 3.0, rehit: 0.5, mv: 0.18, kb: [120, -260], data: { pool: 'poison' },
        onStart: (z, w) => { audio.sfx('splash', { vol: 0.6, pitch: 0.9 }); w.fx?.burst?.('goo', x1, fy - 10, 10, { color: el.col, speed: 200 }); },
        paint: (ctx, z, w) => {
          if (!z.started) { warnFloor(ctx, x1, fy, 128, z.k, el.col, w.time); return; }
          const f = Math.min(1, z.a * 8) * (1 - Math.max(0, (z.a - 0.85) / 0.15));
          drawPuddle(ctx, x1, fy, 64 * (0.6 + 0.4 * Math.min(1, z.a * 6)), f, el.col, el.hi, el.dk, w.time, x1);
        } });
    }
  }
  /** 바닥에 남는 불·독 (예고 없는 잔불 — 이미 예고한 폭발 자리) */
  patch(x, fy, w, life, mv, element, el) {
    return this.zone({ x: x - w / 2, y: fy - 24, w, h: 24, warn: 0, life, rehit: 0.35, mv, element, kb: [100, -240], data: { cont: true },
      paint: (ctx, z, wd) => drawFlames(ctx, x, fy, w, 1 - z.a, el, wd.time) });
  }

  // ── mercuryPool 수은 웅덩이: 접합 팔 끝에서 수은을 쏟음 — 플레이어 자리와 ±3.5칸 (지옥 +7칸)에 바닥 표시 0.75초 → 튐(r44 mv 0.5) +
  //    웅덩이 (폭 140, 1페이즈 5초 · 2페이즈 4초, rehit 0.5 mv 0.22). 살아 있는 웅덩이는 여섯까지 (오래된 것부터 마른다) ──
  s_mercuryPool(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ lash: 0.55, armN: 3, lean: 0.15 });
      telegraph(this, 0.75, { sfx: 'warning', vol: 0.3 }); audio.sfx('splash', { vol: 0.6, pitch: 0.55 });
      const A = this.A, p = this.P, T = T48(), px = p ? p.cx : A.cx;
      const xs = [px, px - 3.5 * T, px + 3.5 * T];
      if (this.inferno) xs.push(px + (px < A.cx ? 7 : -7) * T);
      const pools = (this.world.entities ?? []).filter((e) => !e.dead && e.boss === this && e.data?.pool === 'mercury');
      for (let i = 0; i < pools.length + xs.length - 6; i++) pools[i].dead = true;
      const G = this.graft[6], H = this.toW(G.x, G.y, pt());
      for (const x0 of xs) {
        const x = clamp(x0, A.x0 + 70, A.x1 - 70);
        this.zone({ x: Math.min(H.x, x) - 10, y: Math.min(H.y, A.floor) - 40, w: Math.abs(x - H.x) + 20, h: Math.abs(A.floor - H.y) + 40, warn: 0, life: 0.75, harmless: true, z: 8,
          paint: (ctx, z) => drawMercuryStream(ctx, H.x, H.y, x, A.floor, z.t / 0.75) });
        strikeCircle(this, x, A.floor - 20, 44, { warn: 0.75, life: 0.22, mv: 0.5, color: SILVER, sfx: 'splash', vol: 0.4, burstFx: 'water' });
        this.mercuryPuddle(x, 140, this.phase ? 4.0 : 5.0, 0.75);
      }
    }
    if (this.at(1.0)) this.relax();
    if (t >= 1.6) this.done(1.0);
  }
  mercuryPuddle(x, w, life, warn) {
    const fy = this.A.floor;
    return this.zone({ x: x - w / 2, y: fy - 20, w, h: 20, warn, life, rehit: 0.5, mv: 0.22, kb: [120, -280], data: { pool: 'mercury' },
      paint: (ctx, z, wd) => {
        if (!z.started) { warnFloor(ctx, x, fy, w, z.k, SILVER, wd.time); return; }
        const f = Math.min(1, z.a * 10) * (1 - Math.max(0, (z.a - 0.88) / 0.12));
        drawPuddle(ctx, x, fy, w / 2 * (0.7 + 0.3 * Math.min(1, z.a * 5)), f, SILVER, SILVER_H, SILVER_D, wd.time, x * 0.37);
      } });
  }

  // ── tankBrood 배양조: 몸을 웅크리고 등의 배양조가 0.9초 부풂 (예고 · 배양조 판정 prio) — 그동안 플레이어·탈것이 배양조를 한 대 치면 깨져 무릎 (1페이즈).
  //    못 깨면 배양액이 터짐 (배양조 둘레 r96 mv 0.7) + 호문쿨루스 2 (지옥 3, 살아 있는 수 ≤ 3 · 지옥 ≤ 4). 2페이즈는 가슴의 태아가 토해 낸다 (깨기 없음) ──
  s_tankBrood(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ crouch: 0.6, lean: 0.35, tankK: 1 });
      this.tankUp = true;
      telegraph(this, 0.9, { sfx: 'mist', vol: 0.6 }); audio.sfx('dark', { vol: 0.5, pitch: 0.6 });
      const B = this.tankW(pt());
      this.ventZ = strikeCircle(this, B.x, B.y, 96, { warn: 0.9, life: 0.3, mv: 0.7, color: GLASS, sfx: 'splash', vol: 0.7, burstFx: 'goo' });
    }
    if (this.at(0.9)) {
      this.tankUp = false; this.ventZ = null;
      const B = this.tankW(pt()), n = this.inferno ? 3 : 2, max = this.inferno ? 4 : 3;
      for (let i = 0; i < n; i++) spawnMinion(this, ['homunculus'], B.x + (i - (n - 1) / 2) * 34, this.A.floor - 4, { max, facing: -this.facing });
      this.pt.tankK = 0;
    }
    if (this.at(1.3)) this.relax();
    if (t >= 1.6) this.done(1.1);
  }

  // ── graftLash 접합 팔 휘두르기: 팔을 등 뒤로 감음 0.6초 → 앞 4.8칸 몸통 높이 띠(바닥 위 20–128px) mv 1.0.
  //    2페이즈·지옥: 0.35초 뒤 바닥 띠(바닥 위 0–46px, 5.4칸) mv 0.8 — 예고 0.95초 (뛰어넘는다) ──
  s_graftLash(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ lash: -1, lean: -0.15 });
      audio.sfx('whip', { vol: 0.4, pitch: 0.5 });
      const A = this.A, T = T48(), f = this.facing, fy = A.floor, x0 = this.zx + f * 18;
      const band = (reach, y0, h, warn, mv, low) => {
        const xa = clamp(f > 0 ? x0 : x0 - reach, A.x0, A.x1), xb = clamp(f > 0 ? x0 + reach : x0, A.x0, A.x1);
        strikeRect(this, { x: xa, y: fy - y0 - h, w: Math.max(10, xb - xa), h }, { warn, life: 0.22, mv, kb: low ? [360, -520] : [440, -320], color: FLESH, sfx: 'whip', vol: 0.8,
          onStart: () => { this.pt.lash = 1; this.pt.lashLow = low ? 1 : 0; audio.sfx('slash_heavy', { vol: 0.5, pitch: 0.7 }); } });
      };
      band(4.8 * T, 20, 108, 0.6, 1.0, false);
      if (this.phase || this.inferno) band(5.4 * T, 0, 46, 0.95, 0.8, true);
    }
    if (this.at(0.85)) this.setPose({ lash: -0.6 });
    if (this.at(1.3)) this.relax();
    if (t >= 1.5) this.done(1.0);
  }

  // ── burningGlass 불타는 렌즈: 황동 테 확대경을 치켜듦 → 빛점이 1.0초 플레이어를 따라감 (마지막 0.35초는 고정) → 광선 strikeLine th 24 mv 0.9 불 +
  //    바닥 잔불 1.0초. 1페이즈 1줄 · 2페이즈 2줄(0.9초 간격) · 지옥 +1 ──
  s_burningGlass(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ armN: 1, lens: 1, lean: -0.2 }); this.lensOn = true;
      audio.sfx('magic', { vol: 0.5, pitch: 1.4 });
      this._n = (this.phase ? 2 : 1) + (this.inferno ? 1 : 0);
      for (let i = 0; i < this._n; i++) this.later(0.25 + i * 0.9, () => this.beam());
    }
    if (t >= 1.9 + (this._n - 1) * 0.9) { this.lensOn = false; this.relax(); this.done(1.0); }
  }
  beam() {
    const A = this.A, fy = A.floor;
    const aimAt = (out) => {
      const L = this.lensW(this._q), p = this.P;
      const tx = p ? p.cx : L.x + this.facing * 300, ty = p ? p.cy : fy;
      const dy = Math.max(30, ty - L.y), s = (fy - L.y) / dy;
      out.x0 = L.x; out.y0 = L.y; out.x1 = clamp(L.x + (tx - L.x) * s, A.x0, A.x1); out.y1 = fy;
      return out;
    };
    const l0 = aimAt({});
    strikeLine(this, l0.x0, l0.y0, l0.x1, l0.y1, { warn: 1.0, life: 0.4, th: 24, mv: 0.9, element: 'fire', color: '#ffd060', sfx: 'fire', vol: 0.7, kb: [300, -360],
      track: (z) => { const L = z.line; if (z.t > z.warn - 0.35) { const l = this.lensW(this._q); L.x0 = l.x; L.y0 = l.y; return; } const n = aimAt({}); L.x0 = n.x0; L.y0 = n.y0; L.x1 = lerp(L.x1, n.x1, 0.25); L.y1 = n.y1; },
      onStart: (z) => { this.patch(z.line.x1, fy, 80, 1.0, 0.15, 'fire', EL3[0]); impact(this.world, { shake: 3, time: 0.2 }); },
      paint: (ctx, z, w) => {
        const L = z.line;
        if (!z.started) { warnLine(ctx, L.x0, L.y0, L.x1, L.y1, z.k, '#ffd060', 1.5 + z.k * 2); glow(ctx, L.x1, L.y1, 14 + 22 * z.k, '#ffd060', 0.5 + 0.5 * z.k, true); return; }
        const f = 1 - z.a;
        ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = rgba('#ff9a30', 0.55 * f); ctx.lineWidth = 42; ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
        ctx.strokeStyle = rgba('#fff4c0', 0.95 * f); ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
        glow(ctx, L.x1, L.y1, 60, '#ffd060', f, true);
      } });
  }

  // ── goldFloor 황금 변성 (2페이즈): 두 손을 치켜듦 → 경기장 바닥을 4칸씩 나눈 구간 중 넷(지옥 다섯)이 1.2초(지옥 1.0초) 동안 금으로 번짐 → 깨지며 솟는 금 조각
  //    (구간 폭 · 높이 104px mv 0.85). 첫 물결은 플레이어가 선 구간을 늘 포함 · 둘째 물결(1.0초 뒤)은 첫 물결이 아닌 구간에서 — 늘 두 구간 이상 비운다.
  //    지옥은 셋째 물결 (첫 물결 구간 다시). 발판(11·13·7행)은 높이 밖이라 안전 ──
  s_goldFloor(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ armN: 1, lean: -0.3, crouch: 0.15 });
      audio.sfx('holy', { vol: 0.6, pitch: 0.5 }); audio.sfx('dark', { vol: 0.4, pitch: 0.5 });
      impact(world, { shake: 4, time: 0.4 });
      const S = this.segs(), n = S.length, p = this.P, k = Math.min(n - 2, this.inferno ? 5 : 4);
      const vis = this.inferno ? 1.0 : 1.2, gap = 1.0;
      const pi = p ? clamp(S.findIndex((s) => p.cx >= s.x0 && p.cx < s.x1), 0, n - 1) : 0;
      const order = S.map((s) => s.i).filter((i) => i !== pi).sort(() => Math.random() - 0.5);
      const w1 = [pi, ...order.slice(0, k - 1)];
      const rest = S.map((s) => s.i).filter((i) => !w1.includes(i)).sort(() => Math.random() - 0.5);
      const w2 = rest.slice(0, Math.max(1, Math.min(k, rest.length - 2)));
      const waves = [w1, w2];
      if (this.inferno) waves.push(w1.slice(0, k - 1));
      waves.forEach((set, wi) => { for (const i of set) this.goldSeg(S[i], vis + wi * gap, vis); });
      this._end = vis + (waves.length - 1) * gap + 0.9;
    }
    if (this.at(0.6)) this.setPose({ armN: 1.3, crouch: 0.3 });
    if (t >= this._end) { this.relax(); this.done(1.1); }
  }
  goldSeg(s, warn, vis) {
    const fy = this.A.floor, x0 = s.x0 + 4, w = s.x1 - s.x0 - 8, seed = s.i * 7.31;
    return this.zone({ x: x0, y: fy - 104, w, h: 104, warn, life: 0.35, mv: 0.85, kb: [260, -620],
      onStart: (z, wd) => { audio.sfx('break_wall', { vol: 0.55, pitch: 1.2 }); wd.fx?.burst?.('gold', x0 + w / 2, fy - 20, 12, { color: GOLD, speed: 300 }); wd.camera?.shake?.(3, 0.15); },
      onEnd: () => this.zone({ x: x0, y: fy - 30, w, h: 30, warn: 0, life: 0.8, harmless: true, z: 5, paint: (ctx, z) => drawGoldRubble(ctx, x0, fy, w, 1 - z.a, seed) }),
      paint: (ctx, z, wd) => {
        if (!z.started) {
          const k = clamp((z.t - (z.warn - vis)) / vis, 0, 1);
          if (k <= 0) return;
          drawGoldCreep(ctx, x0, fy, w, k, wd.time, seed);
          return;
        }
        drawGoldShards(ctx, x0, fy, w, 104 * Math.min(1, z.a * 5), 1 - Math.max(0, (z.a - 0.5) / 0.5), seed);
      } });
  }

  // ── mercuryWave 수은 해일 (2페이즈): 몸이 수은으로 녹음 0.7초 (경기장 바닥 띠 예고 warnRect 72px) → 해일이 플레이어 쪽으로 반대편 벽 앞까지 980px/s
  //    (groundWave 높이 72 · mv 0.85, 그동안 판정·접촉 없음) → 반대편에서 솟음 0.5초 → **솟은 몸 0.9초 = 카운터 창** (플레이어·탈것 한 대 → 무릎).
  //    지옥: 솟은 뒤 0.6초 예고로 해일이 한 번 더 되돌아온다 (그때는 녹지 않고 발밑에서 내보낸다) ──
  s_mercuryWave(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      const A = this.A, fy = A.floor, dir = this.facing, to = dir > 0 ? A.x1 - 70 : A.x0 + 70;
      this.wv = { dir, to, from: this.zx, t1: 0, t2: 0, back: false };
      this.setPose({ melt: 1, crouch: 0.4 });
      telegraph(this, 0.7, { sfx: 'warning', vol: 0.4 }); audio.sfx('splash', { vol: 0.6, pitch: 0.4 });
      const xa = Math.min(this.zx, to), xb = Math.max(this.zx, to);
      this.zone({ x: xa, y: fy - 72, w: xb - xa, h: 72, warn: 0, life: 0.7, harmless: true, z: 7, paint: (ctx, z, w) => warnRect(ctx, xa, fy - 72, xb - xa, 72, z.t / 0.7, SILVER, w.time) });
    }
    const W = this.wv;
    if (!W) { this.done(0.8); return; }
    if (this.at(0.7)) {
      this.sunk = true; this.invuln = true; this.harmless = true;
      this.waveFrom(this.zx, W.dir, W.to, 0);
      W.t1 = 0.7 + Math.abs(W.to - this.zx) / WAVE_SPEED;
    }
    if (W.t1 && this.at(W.t1)) {
      this.zx = this.clampX(W.to); this.facing = -W.dir; this.fk = this.facing;
      this.sunk = false; this.invuln = false; this.harmless = false;
      this.setPose({ melt: 0, crouch: 0.2, lean: 0.2 }); this.ps.melt = 1;
      audio.sfx('splash', { vol: 0.7, pitch: 0.7 }); world.fx.burst('water', this.zx, this.fy - 20, 14, { color: SILVER, speed: 260 });
      W.t2 = W.t1 + 0.5;
    }
    if (W.t2 && this.at(W.t2)) {
      this.exposed = true; this.telegraph = false;
      if (this.inferno && !W.back) {
        W.back = true;
        const A = this.A, fy = A.floor, dir = -W.dir, to = dir > 0 ? A.x1 - 40 : A.x0 + 40, xa = Math.min(this.zx, to), xb = Math.max(this.zx, to);
        this.zone({ x: xa, y: fy - 72, w: xb - xa, h: 72, warn: 0, life: 0.6, harmless: true, z: 7, paint: (ctx, z, w) => warnRect(ctx, xa, fy - 72, xb - xa, 72, z.t / 0.6, SILVER, w.time) });
        this.later(0.6, () => this.waveFrom(this.zx, dir, to, 0));
        telegraph(this, 0.6);
      }
    }
    if (W.t2 && this.at(W.t2 + 0.9)) { this.exposed = false; this.relax(); }
    if (W.t2 && t >= W.t2 + 1.1) { this.wv = null; this.done(1.0); }
  }
  waveFrom(x, dir, to, warn) {
    const fy = this.A.floor;
    audio.sfx('splash', { vol: 0.8, pitch: 0.5 });
    return groundWave(this, x, dir, { h: 72, w: 84, speed: WAVE_SPEED, warn, mv: 0.85, color: SILVER, to, sfx: null, kb: [360, -560], data: { cont: true },   // 띠 예고(0.7 · 0.6초)는 앞의 무해 지대
      paint: (ctx, z) => { const fx = x + dir * WAVE_SPEED * Math.max(0, z.t - z.warn); drawMercuryWave(ctx, fx, fy, dir, 72, x); } });
  }

  // ── elixirRain 금빛 약비 (2페이즈): 금빛 약병을 하늘로 던짐 0.5초 → 0.28초 간격 여섯 방울(지옥 여덟): 그때의 플레이어 자리 ±3칸 (첫 방울은 바로 그 자리)에
  //    warnMark 0.7초 → 금빛 기둥 strikeColumn 폭 56 mv 0.7 ──
  s_elixirRain(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ armN: 1, lean: -0.25 });
      telegraph(this, 0.5, { sfx: 'warning', vol: 0.3 }); audio.sfx('magic', { vol: 0.5, pitch: 0.9 });
      this._n = this.inferno ? 8 : 6;
      for (let i = 0; i < this._n; i++) this.later(0.5 + i * 0.28, () => this.drop(i));
    }
    if (this.at(0.5)) { this.setPose({ armN: 2 }); audio.sfx('dagger', { vol: 0.4, pitch: 0.5 }); }
    if (this.at(1.0)) this.relax();
    if (t >= 0.5 + this._n * 0.28 + 1.2) this.done(1.0);
  }
  drop(i) {
    const A = this.A, p = this.P, T = T48();
    const x = clamp((p ? p.cx : A.cx) + (i === 0 ? 0 : rand(-3, 3) * T), A.x0 + 30, A.x1 - 30);
    warnMark(this, x, A.floor - 40, 0.7, GOLD);
    strikeColumn(this, x, { w: 56, warn: 0.7, life: 0.3, mv: 0.7, color: GOLD, sfx: 'holy', vol: 0.35, kb: [200, -300],
      paint: (ctx, z, w) => {
        const top = A.top ?? 0, fy = A.floor;
        if (!z.started) { warnRect(ctx, x - 12, top, 24, fy - top, z.k * 0.7, GOLD, w.time); warnFloor(ctx, x, fy, 80, z.k, GOLD, w.time); return; }
        drawElixirColumn(ctx, x, top, fy, 1 - z.a);
      } });
  }

  // ── stagger (보조): 1.5초 (몸통 0.7 · 머리 0.6) · 긴 무릎 2.5초 (몸통 0.6). 들어가는 길: 배양조 깨기 · 해일 카운터 · 15% 대사 뒤 ──
  s_stagger(dt, world, t) {
    if (this.at(0.001)) {
      this.wakeT = 9; this.stunned = true; this.exposed = false; this.tankUp = false; this.lensOn = false; this.spd = 0; this.sunk = false;
      this.setPose({ kneel: 1, lean: 0.4, armN: 0, lash: 0, tankK: 0, melt: 0 });
      audio.sfx('hit_heavy', { pitch: 0.7 });
      world.fx.burst('spark', this.zx, this.fy - 90, 12, { color: SILVER, speed: 180 });
      impact(world, { shake: 6, time: 0.3 });
    }
    const L = this.stagLong ? 2.5 : Math.min(1.5, this.wakeT);
    if (this.stunned && Math.random() < 0.2 * (world.fx.quality ?? 1)) { const H = this.toW(this.pts.head.x, this.pts.head.y - 24, this._r); world.fx.emit('spark', H.x + rand(-14, 14), H.y, { color: '#fff3c0', speed: 40, angle: -PI / 2 }); }
    if (this.at(L)) { this.stunned = false; this.setPose({ kneel: 0, lean: 0 }); }
    if (t >= L + 0.35) { this.stagLong = false; this.relax(); this.done(0.6); }
  }

  // ── lastDose (보조, 15%): 하던 패턴을 끊고 허리띠의 금빛 약병을 뽑아 입으로 0.6초. 스토리 모드·처음이면 곧바로 대사 b_paracel_last (그동안 월드가 멈춘다)
  //    → 대사가 끝나면 작은 호문쿨루스가 손목에 매달려 병이 깨짐 → 긴 무릎 2.5초 (몸통 0.6). 아케이드·다시 볼 때는 금빛 파열 (둘레 r170 · 예고 0.8 · mv 0.9) ──
  s_lastDose(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this._lastMode = canShowScript(world, 'b_paracel_last'); this._lastEnd = false;
      this.setPose({ armN: 4, lean: -0.1, lash: 0 });
      audio.sfx('clang', { vol: 0.4, pitch: 1.3 });
      if (this._lastMode && !phaseScript(this, 'b_paracel_last', { onEnd: () => { this._lastEnd = true; } })) { this._lastMode = false; this._lastEnd = false; }
      if (!this._lastMode) strikeCircle(this, this.zx, this.fy - 84, 170, { warn: 0.8, life: 0.35, mv: 0.9, color: GOLD, sfx: 'holy', vol: 0.8, burstFx: 'gold', kb: [460, -420] });
    }
    if (this._lastMode) {
      if (this._lastEnd || t > 8) { this._lastMode = false; this.spillFx(world); this.toStagger(true); }
      return;
    }
    if (this.at(1.2)) this.relax();
    if (t >= 1.4) this.done(1.0);
  }
  /** 약병이 깨지는 순간 (꼬마 그림 없음 — 금빛 튐과 유리 조각) */
  spillFx(world) {
    const H = this.handW(pt());
    audio.sfx('break_wall', { vol: 0.7, pitch: 1.5 }); audio.sfx('splash', { vol: 0.7, pitch: 1.1 });
    world.fx.burst('gold', H.x, H.y, 16, { color: GOLD, speed: 240 });
    world.fx.burst('shard', H.x, this.fy - 8, 10, { color: GOLD_H, speed: 200 });
    impact(world, { shake: 8, time: 0.4, flash: '#fff0b0', fa: 0.2 });
    this.goldK = Math.min(0.95, this.goldK + 0.1);
  }

  // ── 전환 fuse (1→2): 무적 2.4초. 0.4초 배양조를 주먹으로 깸(유리 조각 · 배양액) → 1.0초 호문쿨루스가 가슴으로 파고듦 → 1.6초 (applyAt → applyPhase(1):
  //    fused · form2 칭호 · 금이 다리에서 번지기 시작) → 끝에 대사 b_paracel_fuse (스토리 1회) → 곧바로 goldFloor ──
  s_fuse(dt, world, t) {
    if (this.at(0.001)) { this.spd = 0; this.sunk = false; this.setPose({ crouch: 0.5, lean: 0.3, armN: 1 }); audio.sfx('dark', { vol: 0.6, pitch: 0.6 }); }
    if (this.at(0.4)) {
      this.tankBroke = this.t; this.setPose({ armN: 0 });
      const B = this.toW(this.pts.tank.x, this.pts.tank.y, pt());
      audio.sfx('break_wall', { vol: 0.9, pitch: 1.3 }); audio.sfx('splash', { vol: 0.8, pitch: 0.6 });
      world.fx.burst('shard', B.x, B.y, 18, { color: GLASS, speed: 300 });
      world.fx.burst('goo', B.x, B.y, 14, { color: BROTH_H, speed: 220 });
      impact(world, { shake: 8, time: 0.4 });
    }
    if (this.at(1.0)) { audio.sfx('dark', { vol: 0.7, pitch: 0.45 }); const C = this.toW(this.pts.chest.x, this.pts.chest.y, pt()); world.fx.burst('blood', C.x, C.y, 10, { speed: 160 }); this.setPose({ crouch: 0.1, lean: -0.3 }); }
    this.transitionTick(dt, world, t);
  }
  applyPhase(k) {
    if (k >= 1 && !this.fused) {
      this.fused = true; this.tankUp = false;
      if (this.tankBroke < 0) this.tankBroke = this.t;
      this.goldK = Math.max(this.goldK, 0.35);
      const w = this.world;
      if (w?.fx) {
        w.fx.burst('gold', this.zx, this.fy - 70, 18, { color: GOLD, speed: 240 });
        w.fx.ring(this.zx, this.fy - 70, { color: GOLD, r0: 10, r1: 220, life: 0.5, width: 4 });
        impact(w, { shake: 8, time: 0.4, flash: '#fff0c0', fa: 0.22 });
        audio.sfx('holy', { vol: 0.7, pitch: 0.6 });
      }
    }
  }
  onCancel() {
    this.exposed = false; this.stunned = false; this.tankUp = false; this.lensOn = false; this.spd = 0;
    this._lastMode = false; this._lastEnd = false; this.stagLong = false;
    if (this.ventZ && !this.ventZ.dead) this.ventZ.dead = true;
    this.ventZ = null;
    if (this.sunk) { this.sunk = false; this.invuln = false; this.harmless = false; }
    this.wv = null;
    this.relax();
  }
  onReset() {
    this.onCancel();
    for (const e of this.world?.entities ?? []) if (!e.dead && (e.kind === 'projectile' || e.kind === 'hazard') && e.owner?.summoner === this) e.dead = true;
    this.fused = false; this.tankBroke = -9; this.goldK = 0.06; this.elemI = 0; this.vanishK = 0;
    this._forced15 = false; this._lastNow = false; this._tankNow = false; this._stagNow = false;
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    this.zx = this.clampX(this.zx); this.tzx = this.zx; this.fy = this.A.floor; this.fk = this.facing;
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 쓰러짐 (체력 0) ═════════════════════════════
  onDeath(world) {
    this.clearJobs();
    this._tr = null; this.applyPhasesTo(Math.max(1, this.phase), world);   // 쓰러질 때는 언제나 배양조를 받아들인 모습 (50% 를 한 방에 넘겨도)
    this.dying = 3.2; this.dieT = 0; this._bn = null; this._crumble = false; this._thud = false;
    this.exposed = false; this.stunned = false; this.tankUp = false; this.lensOn = false; this.spd = 0; this.sunk = false; this.wv = null;
    this.setPose({ kneel: 1, lean: 0.25, armN: 4, lash: 0, melt: 0, crouch: 0 });
    audio.sfx('dark', { vol: 0.5, pitch: 0.5 });
  }
  /** 배너 이름 안전망 (e_bride.js · e_charon.js 와 같은 틀) — 두 모습 이름이 같아 보통은 바꿀 것이 없다 */
  renameBanner(world) {
    const bn = world?.banner, n0 = this.def0?.name, n1 = this.def?.name;
    if (!bn || bn === this._bn) return;
    this._bn = bn;
    if (n0 && n1 && n0 !== n1 && typeof bn.sub === 'string' && bn.sub.includes(n0)) bn.sub = bn.sub.replace(n0, n1);
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    const T = this.dieT, q = world.fx?.quality ?? 1;
    this.renameBanner(world);
    this.goldK = Math.min(1, this.goldK + dt * 0.55);   // 발끝부터 금으로 굳는다
    if (!this._thud && T >= 0.5) { this._thud = true; audio.sfx('land', { pitch: 0.6, vol: 0.6 }); world.fx.burst('dust', this.zx, this.fy - 6, 12, { speed: 120, angle: -PI / 2, spread: 1.6 }); }
    const arcade = world.arcade ?? world.mode !== 'story';
    if (arcade) {
      if (T >= 1.8) {
        if (!this._crumble) { this._crumble = true; audio.sfx('mist', { vol: 0.5, pitch: 0.8 }); }
        this.vanishK = clamp((T - 1.8) / 1.2, 0, 1);
        this.dustAcc += dt * 40 * q * (1 - this.vanishK * 0.6);
        while (this.dustAcc >= 1) {
          this.dustAcc -= 1;
          const P = this.toW(rand(-26, 30), -rand(4, 150) * (1 - this.vanishK * 0.7), this._r);
          world.fx.emit('gold', P.x, P.y, { color: Math.random() < 0.3 ? GOLD_H : GOLD, speed: rand(30, 110), angle: -PI / 2 - this.facing * 0.4, spread: 1.2 });
        }
      }
    } else if (this.dying < 0.25) this.dying = 0.25;   // 스토리: 금 조각상으로 남는다 (스테이지가 끝날 때까지)
    this.motion(dt, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    if (this.hidden || this.vanishK >= 1) return;
    const k = this.dying > 0 ? 0.5 * (1 - this.vanishK) : 1;
    const H = this.toW(this.pts.eyeN.x, this.pts.eyeN.y, pt());
    L.add(H.x, H.y, 60, SILVER, 0.45 * k);
    if (!this.fused) { const B = this.toW(this.pts.tank.x, this.pts.tank.y, pt()); L.add(B.x, B.y, 120 + 60 * this.ps.tankK, GLASS, 0.35 * k); }
    else { const C = this.toW(this.pts.chest.x, this.pts.chest.y, pt()); L.add(C.x, C.y, 140, GOLD, 0.4 * k); }
    if (this.lensOn) { const l = this.lensW(pt()); L.add(l.x, l.y, 90, '#ffd060', 0.6); }
    if (this.exposed) L.add(this.zx, this.fy - 80, 200, '#ffffff', 0.4);
  }

  // ═════════════════════════════ 그리기 (벡터 — 기괴하게, 그러나 1부 화풍의 무게로) ═════════════════════════════
  bodyAlpha() { return 1 - this.vanishK; }
  /** 바닥 그림자 · 녹은 몸(수은 웅덩이) */
  paintBack(ctx) {
    const a = this.bodyAlpha();
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= a * 0.5;
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(this.zx, this.fy + 2, 46 + 20 * this.ps.melt, 7, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (this.ps.melt > 0.05 || this.sunk) {
      ctx.save(); ctx.globalAlpha *= a;
      drawPuddle(ctx, this.zx, this.fy, 30 + 46 * Math.max(this.ps.melt, this.sunk ? 1 : 0), 1, SILVER, SILVER_H, SILVER_D, this.t, 3.1);
      ctx.restore();
    }
  }
  paintBody(ctx, world, flash = false) {
    if (this.sunk) return;
    const a = this.bodyAlpha();
    if (a <= 0.01) return;
    const P = this.ps, S = this.pts, t = this.t, fk = this.fk, sx = Math.abs(fk) < 0.2 ? Math.sign(fk || this.facing) * 0.2 : fk;
    const melt = P.melt;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(this.zx, this.fy);
    ctx.scale(sx, 1 - melt * 0.8);
    if (melt > 0) ctx.transform(1, 0, Math.sin(t * 9) * 0.06 * melt, 1, 0, 0);
    const gold = this.goldK;
    // ── 먼 쪽: 접합 팔 · 배양조 · 먼 다리 ──
    drawGraftArm(ctx, this.graft, t, gold, P.lash);
    if (!this.fused) drawTank(ctx, S.tank.x, S.tank.y, S.tA, P.tankK, t, this.t - (this.tankCrackT ?? -9));
    else drawBrokenTank(ctx, S.tank.x, S.tank.y, S.tA, t);
    drawLeg(ctx, S.hip.x - 5, S.hip.y, S.knF.x, S.knF.y, S.ftF.x, S.ftF.y, true, gold);
    // ── 몸통: 외투 자락 · 가죽 앞치마 · 허리띠 ──
    drawCoat(ctx, S, t, P);
    drawLeg(ctx, S.hip.x + 5, S.hip.y, S.knN.x, S.knN.y, S.ftN.x, S.ftN.y, false, gold);
    drawTorso(ctx, S, t, this.fused, gold);
    drawBelt(ctx, S, P.armN, this.elemI);
    if (this.fused) drawChestFace(ctx, S.chest.x, S.chest.y, t, this.exposed || this.stunned);
    drawHead(ctx, S.head.x, S.head.y, S.tA, t, this.stunned, this.dying > 0, gold);
    drawNearArm(ctx, S, P, t, gold, this.lensOn, EL3[this.elemI % 3]);
    // ── 금이 번진 자리 (다리부터 위로 — goldK) ──
    if (gold > 0.08 && !R.fl) drawGoldCreepBody(ctx, S, gold, t);
    ctx.restore();
  }
  paintFront(ctx) {
    if (this.exposed && !this.sunk) glow(ctx, this.zx, this.fy - 90, 90, '#ffffff', 0.25 + 0.15 * Math.sin(this.t * 14));
    if (this.tankUp && !this.fused) { const B = this.toW(this.pts.tank.x, this.pts.tank.y, this._r); glow(ctx, B.x, B.y, 70 + 18 * Math.sin(this.t * 16), GLASS, 0.5); }
  }
}

// ═════════════════════════════ 골격 도우미 ═════════════════════════════
/** 두 마디 IK: (x0,y0) → (x1,y1), 길이 a·b, bend ±1 (무릎 앞으로 = +1). out = 가운데 관절 */
function ik(x0, y0, x1, y1, a, b, bend, out) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.max(1, Math.min(a + b - 0.5, Math.hypot(dx, dy)));
  const c = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), base = Math.atan2(dy, dx), ang = base - bend * Math.acos(c);
  out.x = x0 + Math.cos(ang) * a; out.y = y0 + Math.sin(ang) * a;
  return out;
}
const fl = (c) => (R.fl ? '#ffffff' : c);
/** 끝이 둥근 가는 살 (두 원 사이를 잇는 사다리꼴) */
function limb(ctx, x0, y0, x1, y1, r0, r1, col, hi, lw = 2.4) {
  const ang = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(ang), ny = Math.cos(ang);
  ctx.beginPath();
  ctx.moveTo(x0 + nx * r0, y0 + ny * r0); ctx.lineTo(x1 + nx * r1, y1 + ny * r1);
  ctx.arc(x1, y1, r1, ang + PI / 2, ang - PI / 2, true);
  ctx.lineTo(x0 - nx * r0, y0 - ny * r0);
  ctx.arc(x0, y0, r0, ang - PI / 2, ang + PI / 2, true);
  ctx.closePath();
  ink(ctx, fl(col), lw, OUTL);
  if (hi && !R.fl) { ctx.strokeStyle = rgba(hi, 0.45); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0 + nx * r0 * 0.5, y0 + ny * r0 * 0.5); ctx.lineTo(x1 + nx * r1 * 0.5, y1 + ny * r1 * 0.5); ctx.stroke(); }
}
function drawLeg(ctx, hx, hy, kx, ky, fx, fy, far, gold) {
  const col = far ? '#2a2228' : COAT, boot = far ? '#1a120c' : LEATHER_D;
  limb(ctx, hx, hy, kx, ky, 9, 7, col, far ? null : COAT_H);
  limb(ctx, kx, ky, fx, fy - 6, 7, 6, col, far ? null : COAT_H);
  // 장화 (금이 번지면 금빛)
  const g = gold > 0.2 && !far;
  ctx.beginPath(); ctx.moveTo(fx - 8, fy - 14); ctx.lineTo(fx + 6, fy - 16); ctx.quadraticCurveTo(fx + 18, fy - 6, fx + 16, fy); ctx.lineTo(fx - 9, fy); ctx.closePath();
  ink(ctx, fl(g ? GOLD : boot), 2.2, OUTL);
  if (g && !R.fl) { ctx.fillStyle = rgba(GOLD_H, 0.6); ctx.fillRect(fx - 4, fy - 13, 8, 3); }
}
function drawCoat(ctx, S, t, P) {
  const h = S.hip, n = S.neck, sway = Math.sin(t * 1.7) * 3 + P.lean * 6;
  // 뒤 자락 (외투 꼬리 — 무릎 아래까지)
  ctx.beginPath();
  ctx.moveTo(n.x - 14, n.y + 6);
  ctx.quadraticCurveTo(h.x - 34 - sway, h.y + 10, h.x - 28 - sway * 1.5, h.y + 64 - P.kneel * 20);
  ctx.lineTo(h.x - 6, h.y + 58 - P.kneel * 20);
  ctx.quadraticCurveTo(h.x - 4, h.y + 10, n.x - 2, n.y + 8);
  ctx.closePath();
  ink(ctx, LG(ctx, 'pc_coat', 0, -150, 0, 0, [0, '#2c2632', 0.5, COAT, 1, '#0c0a0e']), 2.6, OUTL);
  if (!R.fl) { ctx.strokeStyle = rgba(COAT_H, 0.5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(h.x - 20, h.y + 2); ctx.quadraticCurveTo(h.x - 26 - sway, h.y + 30, h.x - 22 - sway, h.y + 56 - P.kneel * 20); ctx.stroke(); }
}
function drawTorso(ctx, S, t, fused, gold) {
  const h = S.hip, n = S.neck, c = Math.cos(S.tA), s = Math.sin(S.tA);
  const L = (x, y) => [h.x + x * c - y * s, h.y + x * s + y * c];
  // 앙상한 몸통 (셔츠가 벌어져 갈비뼈)
  ctx.beginPath();
  let p = L(-14, 2); ctx.moveTo(p[0], p[1]);
  p = L(-16, -36); let q = L(-18, -18); ctx.quadraticCurveTo(q[0], q[1], p[0], p[1]);
  p = L(-10, -62); q = L(-18, -54); ctx.quadraticCurveTo(q[0], q[1], p[0], p[1]);
  p = L(14, -60); ctx.lineTo(p[0], p[1]);
  p = L(18, -30); q = L(22, -46); ctx.quadraticCurveTo(q[0], q[1], p[0], p[1]);
  p = L(16, 2); q = L(20, -12); ctx.quadraticCurveTo(q[0], q[1], p[0], p[1]);
  ctx.closePath();
  ink(ctx, LG(ctx, 'pc_skin', -18, 0, 22, 0, [0, SKIN_D, 0.45, SKIN, 1, SKIN_H]), 2.4, OUTL);
  if (!R.fl) {
    // 갈비뼈 · 수은 핏줄
    ctx.strokeStyle = rgba(SKIN_D, 0.85); ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) { const a = L(-10, -48 + i * 7), b = L(12, -50 + i * 7), m = L(2, -44 + i * 7); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(m[0], m[1], b[0], b[1]); ctx.stroke(); }
    ctx.strokeStyle = rgba(SILVER, 0.8); ctx.lineWidth = 1.3;
    ctx.beginPath(); let v = L(8, -60); ctx.moveTo(v[0], v[1]); v = L(4, -44); ctx.lineTo(v[0], v[1]); v = L(10, -30); ctx.lineTo(v[0], v[1]); v = L(6, -14); ctx.lineTo(v[0], v[1]); ctx.stroke();
    ctx.beginPath(); v = L(-6, -58); ctx.moveTo(v[0], v[1]); v = L(-2, -40); ctx.lineTo(v[0], v[1]); v = L(-8, -26); ctx.lineTo(v[0], v[1]); ctx.stroke();
  }
  // 가죽 앞치마 (가슴께부터 무릎 아래까지, 얼룩)
  ctx.beginPath();
  p = L(-10, -52); ctx.moveTo(p[0], p[1]);
  p = L(16, -54); ctx.lineTo(p[0], p[1]);
  p = L(24, 0); q = L(22, -26); ctx.quadraticCurveTo(q[0], q[1], p[0], p[1]);
  ctx.lineTo(S.knN.x + 10, S.knN.y + 18);
  ctx.lineTo(S.knF.x - 4, S.knF.y + 16);
  p = L(-14, 0); ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ink(ctx, LG(ctx, 'pc_apron', 0, -140, 0, -20, [0, LEATHER_H, 0.35, LEATHER, 1, LEATHER_D]), 2.4, OUTL);
  if (!R.fl) {
    ctx.fillStyle = rgba(SILVER, 0.35); ctx.beginPath(); p = L(8, -20); ctx.ellipse(p[0], p[1], 6, 9, 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#5a8a3a', 0.4); ctx.beginPath(); p = L(-2, -6); ctx.ellipse(p[0], p[1], 8, 5, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#3a0c08', 0.45); ctx.beginPath(); ctx.ellipse(S.knN.x + 4, S.knN.y + 6, 7, 4, 0.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(LEATHER_H, 0.55); ctx.lineWidth = 1.1;
    p = L(-6, -46); q = L(18, -48); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();   // 앞치마 윗단 박음질
  }
  // 목과 어깨 (깃 세운 외투)
  ctx.beginPath(); p = L(-16, -58); ctx.moveTo(p[0], p[1]); p = L(-6, -70); ctx.lineTo(p[0], p[1]); p = L(18, -64); ctx.lineTo(p[0], p[1]); p = L(16, -54); ctx.lineTo(p[0], p[1]); ctx.closePath();
  ink(ctx, fl(COAT), 2.2, OUTL);
  limb(ctx, n.x - 2, n.y + 4, S.head.x - 8, S.head.y + 12, 6, 5, SKIN, SKIN_H, 2);
  if (fused && !R.fl) {   // 깨진 배양조 관이 등뼈에서 덜렁인다
    ctx.strokeStyle = rgba('#3a4a3a', 0.9); ctx.lineWidth = 3;
    p = L(-14, -40); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.quadraticCurveTo(p[0] - 18, p[1] + 10 + Math.sin(t * 3) * 4, p[0] - 22, p[1] + 34); ctx.stroke();
    ctx.fillStyle = BROTH; ctx.beginPath(); ctx.arc(p[0] - 22, p[1] + 36 + Math.sin(t * 3) * 2, 2.5, 0, TAU); ctx.fill();
  }
}
function drawBelt(ctx, S, armN, elemI) {
  const h = S.hip, c = Math.cos(S.tA), s = Math.sin(S.tA);
  const L = (x, y) => [h.x + x * c - y * s, h.y + x * s + y * c];
  let p = L(-16, -6), q = L(22, -8);
  ctx.strokeStyle = fl(LEATHER_D); ctx.lineWidth = 6; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  if (!R.fl) { ctx.strokeStyle = BRASS; ctx.lineWidth = 1.4; ctx.strokeRect(L(2, -9)[0] - 3, L(2, -9)[1], 6, 6); }
  // 띠의 병 넷: 불 · 얼음 · 독 · 금빛 약 — 다음에 던질 원소가 살짝 빛난다
  const xs = [-12, -4, 12, 19];
  for (let i = 0; i < 4; i++) {
    const el = i < 3 ? EL3[i] : { col: GOLD, hi: GOLD_H, dk: GOLD_D };
    const P = L(xs[i], -2);
    if (i === 3 && armN > 3.5) continue;   // 금빛 약병은 손에 들려 있다
    drawFlaskBottle(ctx, P[0], P[1] + 6, 0, el, 0.62);
    if (i === elemI % 3 && !R.fl) glow(ctx, P[0], P[1] + 6, 10, el.col, 0.45);
  }
}
function drawHead(ctx, x, y, tA, t, stunned, dying, gold) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(tA * 0.5 + 0.08);
  // 긴 대머리 두개골 (뒤통수가 길다)
  ctx.beginPath();
  ctx.moveTo(-12, 10); ctx.quadraticCurveTo(-20, -6, -10, -20); ctx.quadraticCurveTo(2, -27, 13, -16);
  ctx.quadraticCurveTo(17, -6, 15, 4); ctx.lineTo(12, 10); ctx.quadraticCurveTo(6, 18, -2, 17); ctx.closePath();
  ink(ctx, LG(ctx, 'pc_head', -18, 0, 16, 0, [0, SKIN_D, 0.5, SKIN, 1, SKIN_H]), 2.4, OUTL);
  if (!R.fl) {
    // 움푹한 볼 · 수은 핏줄이 얼굴 절반을 덮는다 · 흘러내리는 은빛 침
    ctx.fillStyle = rgba(SKIN_D, 0.55); ctx.beginPath(); ctx.ellipse(6, 6, 5, 6, 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(SILVER, 0.9); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-8, -2); ctx.lineTo(-10, 6); ctx.lineTo(-4, 10); ctx.moveTo(-8, -2); ctx.lineTo(-2, -12); ctx.lineTo(4, -18); ctx.moveTo(-10, 6); ctx.lineTo(-16, 8); ctx.stroke();
    ctx.fillStyle = rgba(SILVER, 0.5); ctx.beginPath(); ctx.ellipse(-8, -4, 5, 7, 0.4, 0, TAU); ctx.fill();
    const dr = 4 + 3 * Math.sin(t * 2.3);
    ctx.strokeStyle = rgba(SILVER_H, 0.8); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(8, 13); ctx.lineTo(8.5, 13 + dr); ctx.stroke();
    ctx.fillStyle = SILVER_H; ctx.beginPath(); ctx.arc(8.5, 14 + dr, 1.6, 0, TAU); ctx.fill();
    // 입 (꿰맨 입꼬리)
    ctx.strokeStyle = OUTL; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(4, 11); ctx.quadraticCurveTo(9, 13, 13, 9); ctx.stroke();
    ctx.lineWidth = 0.9; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(10 + i * 1.6, 9); ctx.lineTo(10.6 + i * 1.6, 13); ctx.stroke(); }
    // 흐린 먼 눈
    ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.ellipse(1, -4, 2.6, 2, 0, 0, TAU); ctx.fill();
  }
  // 가까운 눈의 황동 확대경 (렌즈 셋을 겹친 통)
  ctx.save(); ctx.translate(10, -5);
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ink(ctx, fl(BRASS), 2, OUTL);
  ctx.beginPath(); ctx.arc(2, 0, 5, 0, TAU); ink(ctx, fl('#2a3a34'), 1.4, OUTL);
  if (!R.fl) {
    const glint = 0.5 + 0.5 * Math.sin(t * 3.7);
    ctx.fillStyle = rgba(stunned ? '#ffe0a0' : '#d0fff0', 0.6 + 0.3 * glint); ctx.beginPath(); ctx.arc(2.6, -0.4, 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(1, -2, 1, 0, TAU); ctx.fill();
    ctx.strokeStyle = BRASS_H; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 7, -2.4, -1.2); ctx.stroke();
    ctx.strokeStyle = BRASS; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(-16, -8); ctx.stroke();   // 머리띠
    if (!dying) glow(ctx, 2.6, -0.4, 10, '#c8ffe8', 0.35);
  }
  ctx.restore();
  // 정수리까지 번진 금 (죽어 갈 때)
  if (gold > 0.8 && !R.fl) { ctx.fillStyle = rgba(GOLD, clamp((gold - 0.8) / 0.2, 0, 1) * 0.85); ctx.beginPath(); ctx.ellipse(-2, -6, 15, 18, 0.2, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawNearArm(ctx, S, P, t, gold, lensOn, nextEl) {
  const sh = S.shN, el = S.elN, hd = S.hdN;
  limb(ctx, sh.x, sh.y, el.x, el.y, 6, 5, COAT, COAT_H);
  limb(ctx, el.x, el.y, hd.x, hd.y, 5, 4, SKIN, SKIN_H);
  // 손 (금으로 굳은 손끝)
  ctx.beginPath(); ctx.ellipse(hd.x, hd.y, 5.5, 4.5, 0, 0, TAU); ink(ctx, fl(SKIN), 2, OUTL);
  if (!R.fl) {
    ctx.fillStyle = GOLD;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(hd.x + 4 + i * 1.5, hd.y - 2 + i * 2.2, 2.2, 1.4, 0.4, 0, TAU); ctx.fill(); }
  }
  // 손에 든 것: 렌즈 · 던질 병 · 금빛 약병
  if (P.lens > 0.05) {
    const lx = S.lens.x, ly = S.lens.y, r = 14 * P.lens;
    ctx.strokeStyle = fl(BRASS); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hd.x, hd.y); ctx.lineTo(lx, ly + r); ctx.stroke();
    ctx.beginPath(); ctx.arc(lx, ly, r, 0, TAU); ink(ctx, fl('rgba(200,240,255,0.35)'), 3, BRASS);
    if (!R.fl) { ctx.fillStyle = rgba('#ffffff', 0.5); ctx.beginPath(); ctx.ellipse(lx - r * 0.3, ly - r * 0.3, r * 0.35, r * 0.18, -0.6, 0, TAU); ctx.fill(); if (lensOn) glow(ctx, lx, ly, r * 2.6, '#ffd060', 0.55 + 0.25 * Math.sin(t * 20), true); }
  } else if (P.armN > 3.5) drawFlaskBottle(ctx, hd.x + 2, hd.y - 6, 0.4, { col: GOLD, hi: GOLD_H, dk: GOLD_D }, 0.9);
  else if (P.armN > 0.5 && P.armN < 2.6) drawFlaskBottle(ctx, hd.x + 2, hd.y - 6, t * 8 * (P.armN > 1.5 ? 1 : 0), nextEl, 0.85);
}
/** 이어 붙인 호문쿨루스 팔 — 관절이 너무 많고, 끝에 아기 손 여럿 */
function drawGraftArm(ctx, G, t, gold, lash) {
  // 꿰맨 어깨 이음매
  if (!R.fl) { ctx.strokeStyle = rgba('#2a1010', 0.9); ctx.lineWidth = 1.2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(G[0].x - 6 + i * 2.5, G[0].y - 6); ctx.lineTo(G[0].x - 4 + i * 2.5, G[0].y + 6); ctx.stroke(); } }
  for (let j = 0; j < 6; j++) {
    const a = G[j], b = G[j + 1], r0 = 7.5 - j * 0.6, r1 = 7.5 - (j + 1) * 0.6;
    limb(ctx, a.x, a.y, b.x, b.y, r0, r1, j % 2 ? FLESH : '#cc8a80', FLESH_H, 2.2);
    if (j > 0) { ctx.beginPath(); ctx.arc(a.x, a.y, r0 + 1.4, 0, TAU); ink(ctx, fl(FLESH_D), 1.8, OUTL); }   // 혹 같은 관절
    if (!R.fl && j % 2 === 0) { ctx.strokeStyle = rgba('#5a1a1a', 0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lerp(a.x, b.x, 0.5) - 3, lerp(a.y, b.y, 0.5) - 3); ctx.lineTo(lerp(a.x, b.x, 0.5) + 3, lerp(a.y, b.y, 0.5) + 3); ctx.stroke(); }
  }
  // 아기 손 다섯 (끝에서 부채꼴로) — 꼼지락
  const e = G[6], d = G[5], ang = Math.atan2(e.y - d.y, e.x - d.x);
  for (let i = 0; i < 5; i++) {
    const a2 = ang + (i - 2) * 0.42 + Math.sin(t * 6 + i * 1.7) * 0.15, len = 9 + (i % 2) * 3 + Math.max(0, lash) * 4;
    const hx = e.x + Math.cos(a2) * len, hy = e.y + Math.sin(a2) * len;
    limb(ctx, e.x, e.y, hx, hy, 2.6, 2.2, FLESH_H, null, 1.6);
    ctx.beginPath(); ctx.arc(hx, hy, 3.2, 0, TAU); ink(ctx, fl(FLESH_H), 1.4, OUTL);
    if (!R.fl) { ctx.strokeStyle = rgba(FLESH_D, 0.9); ctx.lineWidth = 0.9; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a2 + k * 0.5) * 4.5, hy + Math.sin(a2 + k * 0.5) * 4.5); ctx.stroke(); } }
  }
  if (gold > 0.6 && !R.fl) { ctx.fillStyle = rgba(GOLD, (gold - 0.6) * 1.6); ctx.beginPath(); ctx.arc(G[1].x, G[1].y, 8, 0, TAU); ctx.fill(); }
}
/** 등의 유리 배양조: 황동 뚜껑 · 녹청 배양액 · 관으로 이어진 태아 · 거품. k = 부풂 */
function drawTank(ctx, x, y, tA, k, t, crack) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(tA * 0.8);
  const bw = 17 + 4 * k + Math.sin(t * 18) * 1.4 * k, bh = 32 + 2 * k;
  // 관 (등뼈로)
  if (!R.fl) { ctx.strokeStyle = '#2a3a2e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(10, -10); ctx.quadraticCurveTo(26, -4, 28, 14); ctx.moveTo(10, 8); ctx.quadraticCurveTo(22, 14, 26, 26); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(0, 0, bw, bh, 0, 0, TAU);
  ink(ctx, R.fl ? '#ffffff' : rgba(GLASS, 0.35), 2.6, OUTL);
  if (!R.fl) {
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, bw - 2, bh - 2, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = LG(ctx, 'pc_broth', 0, -34, 0, 34, [0, 'rgba(120,180,90,0.5)', 0.4, 'rgba(90,138,58,0.82)', 1, 'rgba(40,70,30,0.95)']);
    ctx.fillRect(-bw, -bh * 0.55, bw * 2, bh * 1.6);
    // 태아 호문쿨루스 (웅크린 몸 · 큰 머리 · 탯줄)
    const bob = Math.sin(t * 1.3) * 2;
    ctx.fillStyle = FLESH; ctx.strokeStyle = rgba(FLESH_D, 0.9); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(1, -8 + bob, 8 + 2 * k, 7 + 2 * k, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-1, 6 + bob, 6, 9, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a0a0a'; ctx.beginPath(); ctx.arc(4, -9 + bob, 1.6 + k, 0, TAU); ctx.fill();
    if (k > 0.3) { ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.arc(4, -9 + bob, 0.8 * k, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = rgba('#a04a40', 0.9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-2, 10 + bob); ctx.quadraticCurveTo(-10, 20, 4, 28); ctx.stroke();
    // 거품
    for (let i = 0; i < 5; i++) { const u = (t * 0.6 + i * 0.21) % 1, bx = -9 + i * 4.5 + Math.sin(t * 2 + i) * 2, by = bh * 0.8 - u * bh * 1.6; ctx.strokeStyle = rgba(BROTH_H, 0.7 * (1 - u)); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 1.2 + i % 2, 0, TAU); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = rgba('#ffffff', 0.35); ctx.beginPath(); ctx.ellipse(-bw * 0.45, -bh * 0.25, 2.5, bh * 0.5, 0, 0, TAU); ctx.fill();
    if (crack < 1.5) { ctx.strokeStyle = rgba('#ffffff', 0.8 * (1 - crack / 1.5)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(3, -3); ctx.lineTo(-2, 6); ctx.lineTo(6, 14); ctx.stroke(); }
  }
  // 황동 뚜껑 · 받침
  ctx.beginPath(); ctx.rect(-bw - 2, -bh - 4, bw * 2 + 4, 8); ink(ctx, fl(BRASS), 2, OUTL);
  ctx.beginPath(); ctx.rect(-bw - 2, bh - 4, bw * 2 + 4, 8); ink(ctx, fl(BRASS), 2, OUTL);
  if (!R.fl) { ctx.fillStyle = BRASS_H; ctx.fillRect(-bw, -bh - 3, bw * 2, 2); for (const sx of [-bw + 3, bw - 3]) { ctx.beginPath(); ctx.arc(sx, -bh, 1.4, 0, TAU); ctx.fill(); } }
  ctx.restore();
}
function drawBrokenTank(ctx, x, y, tA, t) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(tA * 0.8);
  ctx.beginPath(); ctx.rect(-19, 28, 38, 8); ink(ctx, fl(BRASS), 2, OUTL);
  // 받침에 남은 유리 조각
  ctx.beginPath(); ctx.moveTo(-17, 28); ctx.lineTo(-14, 6); ctx.lineTo(-9, 18); ctx.lineTo(-4, -4); ctx.lineTo(2, 16); ctx.lineTo(8, 2); ctx.lineTo(13, 20); ctx.lineTo(17, 28); ctx.closePath();
  ink(ctx, R.fl ? '#ffffff' : rgba(GLASS, 0.4), 2, OUTL);
  if (!R.fl) { ctx.fillStyle = rgba(BROTH, 0.7); ctx.fillRect(-15, 24, 30, 4); ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-12, 10); ctx.lineTo(-10, 22); ctx.stroke(); }
  ctx.restore();
}
/** 가슴의 두 번째 얼굴 (2페이즈 — 받아들인 호문쿨루스) */
function drawChestFace(ctx, x, y, t, open) {
  ctx.save();
  ctx.translate(x, y);
  const pulse = 1 + 0.06 * Math.sin(t * 5);
  ctx.beginPath(); ctx.ellipse(0, 0, 12 * pulse, 13 * pulse, 0, 0, TAU);
  ink(ctx, fl(FLESH), 2.2, OUTL);
  if (!R.fl) {
    ctx.strokeStyle = rgba(FLESH_D, 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, 14 * pulse, 15 * pulse, 0, 0, TAU); ctx.stroke();   // 살에 파묻힌 테두리
    for (const ex of [-4.5, 4.5]) { ctx.fillStyle = '#140808'; ctx.beginPath(); ctx.ellipse(ex, -3, 2.6, open ? 3 : 2.2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = open ? '#fff0b0' : '#ffd060'; ctx.beginPath(); ctx.arc(ex, -3, 1, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#2a0808'; ctx.beginPath(); ctx.ellipse(0, 5, 3.5, 2 + 1.5 * Math.abs(Math.sin(t * 3)), 0, 0, TAU); ctx.fill();
    glow(ctx, 0, 0, 22, GOLD, 0.25);
  }
  ctx.restore();
}
/** 금이 몸을 타고 오르는 판 (goldK 0..1 — 발에서 머리까지): 장화 → 정강이 → 허벅지 → 앞치마 → 몸통 → 팔 순서로 금빛 판이 덮인다 */
function drawGoldCreepBody(ctx, S, k, t) {
  const a = 0.5 + 0.4 * k;
  const plate = (x0, y0, x1, y1, r0, r1, on) => { if (k < on) return; ctx.save(); ctx.globalAlpha *= a * clamp((k - on) / 0.15, 0, 1); limb(ctx, x0, y0, x1, y1, r0, r1, GOLD, GOLD_H, 1.4); ctx.restore(); };
  ctx.save();
  plate(S.knN.x, S.knN.y, S.ftN.x, S.ftN.y - 6, 7.5, 6.5, 0.08);
  plate(S.knF.x, S.knF.y, S.ftF.x, S.ftF.y - 6, 7, 6, 0.12);
  plate(S.hip.x + 5, S.hip.y, S.knN.x, S.knN.y, 9.5, 7.5, 0.3);
  plate(S.hip.x - 5, S.hip.y, S.knF.x, S.knF.y, 9, 7, 0.36);
  plate(S.hip.x + 4, S.hip.y + 6, S.hip.x + 8, S.hip.y - 22, 14, 12, 0.48);
  plate(S.hip.x + 2, S.hip.y - 20, S.neck.x + 2, S.neck.y + 16, 13, 11, 0.62);
  plate(S.shN.x, S.shN.y, S.elN.x, S.elN.y, 6.5, 5.5, 0.72);
  plate(S.elN.x, S.elN.y, S.hdN.x, S.hdN.y, 5.5, 4.5, 0.78);
  ctx.restore();
  // 금의 경계에 반짝이는 줄 (가장 높이 오른 판의 윗변)
  const topY = lerp(-4, S.neck.y + 10, clamp(k / 0.75, 0, 1));
  ctx.strokeStyle = rgba(GOLD_H, 0.55 + 0.3 * Math.sin(t * 6)); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-16, topY); for (let i = 1; i <= 6; i++) ctx.lineTo(-16 + i * 6, topY + (i % 2 ? -3 : 2)); ctx.stroke();
}

// ═════════════════════════════ 효과 그리기 (지대 paint) ═════════════════════════════
function drawFlaskBottle(ctx, x, y, rot, el, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(-3, -12); ctx.lineTo(3, -12); ctx.lineTo(3, -6); ctx.quadraticCurveTo(9, -2, 8, 5); ctx.quadraticCurveTo(6, 11, 0, 11); ctx.quadraticCurveTo(-6, 11, -8, 5); ctx.quadraticCurveTo(-9, -2, -3, -6); ctx.closePath();
  ink(ctx, fl(rgba(el.col, 0.9)), 2, OUTL);
  if (!R.fl) {
    ctx.fillStyle = rgba(el.hi, 0.7); ctx.beginPath(); ctx.ellipse(-3, 2, 2, 4, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = LEATHER_H; ctx.fillRect(-3.5, -15, 7, 4);
  }
  ctx.restore();
  if (s >= 0.95) glow(ctx, x, y, 18, el.col, 0.5);
}
function drawIceSpikes(ctx, x, fy, h, f, el) {
  ctx.save();
  ctx.globalAlpha *= f;
  for (let i = -2; i <= 2; i++) {
    const hx = x + i * 13, hh = h * (1 - Math.abs(i) * 0.22);
    ctx.beginPath(); ctx.moveTo(hx - 9, fy); ctx.lineTo(hx + (i % 2) * 2, fy - hh); ctx.lineTo(hx + 9, fy); ctx.closePath();
    ink(ctx, fl(rgba(el.col, 0.85)), 1.8, el.dk);
    if (!R.fl) { ctx.fillStyle = rgba('#ffffff', 0.55); ctx.beginPath(); ctx.moveTo(hx - 3, fy - 4); ctx.lineTo(hx + (i % 2) * 2, fy - hh + 6); ctx.lineTo(hx, fy - 4); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
  glowE(ctx, x, fy - h / 2, 50, h / 2 + 10, el.col, 0.45 * f);
}
function drawPuddle(ctx, x, fy, rx, f, col, hi, dk, time, seed) {
  if (f <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= clamp(f, 0, 1);
  ctx.beginPath();
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const u = i / n, px = x - rx + u * rx * 2, wob = Math.sin(time * 3 + seed + i * 1.7) * 2;
    const py = fy - 4 - Math.sin(u * PI) * (8 + 3 * hash(seed + i)) + wob * 0.6;
    if (i === 0) ctx.moveTo(px, fy); ctx.lineTo(px, py);
  }
  ctx.lineTo(x + rx, fy); ctx.closePath();
  ink(ctx, fl(col), 1.6, dk);
  if (!R.fl) {
    ctx.fillStyle = rgba(hi, 0.7); ctx.beginPath(); ctx.ellipse(x - rx * 0.3, fy - 8, rx * 0.25, 2, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 3; i++) { const u = (time * 0.8 + i * 0.33 + hash(seed) ) % 1; ctx.strokeStyle = rgba(hi, 0.8 * (1 - u)); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + (hash(seed + i * 3) - 0.5) * rx * 1.4, fy - 6 - u * 8, 1.5 + u * 2, 0, TAU); ctx.stroke(); }
  }
  ctx.restore();
}
function drawFlames(ctx, x, fy, w, f, el, time) {
  if (f <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const fx = x - w / 2 + (i + 0.5) * (w / 6), h = (16 + 10 * Math.sin(time * 17 + i * 2.1)) * f;
    ctx.fillStyle = rgba(el.col, 0.75 * f); ctx.beginPath(); ctx.ellipse(fx, fy - h / 2, 7, h / 2 + 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(el.hi, 0.6 * f); ctx.beginPath(); ctx.ellipse(fx, fy - h / 3, 3, h / 3 + 1, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawMercuryStream(ctx, x0, y0, x1, y1, k) {
  if (k <= 0) return;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const u = clamp(k * 1.4 - i * 0.06, 0, 1);
    if (u <= 0) continue;
    const x = lerp(x0, x1, u), y = lerp(y0, y1, u) - Math.sin(u * PI) * 60;
    ctx.beginPath(); ctx.ellipse(x, y, 4.5, 3.5, 0, 0, TAU); ink(ctx, fl(SILVER), 1.2, SILVER_D);
    if (!R.fl) { ctx.fillStyle = SILVER_H; ctx.beginPath(); ctx.arc(x - 1.5, y - 1, 1.2, 0, TAU); ctx.fill(); }
  }
}
function drawMercuryWave(ctx, fx, fy, dir, h, seed) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(fx - dir * 120, fy);
  ctx.quadraticCurveTo(fx - dir * 70, fy - h * 0.35, fx - dir * 20, fy - h);
  ctx.quadraticCurveTo(fx + dir * 10, fy - h * 1.08, fx + dir * 34, fy - h * 0.55);
  ctx.quadraticCurveTo(fx + dir * 46, fy - h * 0.2, fx + dir * 40, fy);
  ctx.closePath();
  ink(ctx, LG(ctx, 'pc_wave', 0, fy - 80, 0, fy, [0, SILVER_H, 0.4, SILVER, 1, SILVER_D]), 2, SILVER_D);
  ctx.strokeStyle = rgba('#ffffff', 0.75); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(fx - dir * 46, fy - h * 0.62); ctx.quadraticCurveTo(fx - dir * 14, fy - h * 0.98, fx + dir * 18, fy - h * 0.8); ctx.stroke();
  for (let i = 0; i < 4; i++) { const sx = fx - dir * (20 + i * 22) + hash(seed + i) * 8, sy = fy - h * (0.9 + 0.3 * hash(seed + i * 2)); ctx.fillStyle = SILVER_H; ctx.beginPath(); ctx.arc(sx, sy, 2 + hash(i + seed) * 2, 0, TAU); ctx.fill(); }
  ctx.restore();
  glowE(ctx, fx, fy - h / 2, 70, h * 0.6, SILVER, 0.3);
}
function drawGoldCreep(ctx, x0, fy, w, k, time, seed) {
  ctx.save();
  // 바닥 윗면이 가운데부터 금빛으로 번진다 + 금이 가는 줄 + 위로 오르는 금가루
  const cx = x0 + w / 2, half = w / 2 * clamp(k * 1.3, 0, 1);
  ctx.fillStyle = LG(ctx, 'pc_goldf', 0, fy - 14, 0, fy + 6, [0, GOLD_H, 0.5, GOLD, 1, GOLD_D]);
  ctx.globalAlpha *= 0.55 + 0.4 * k;
  ctx.fillRect(cx - half, fy - 6, half * 2, 10);
  ctx.globalAlpha = Math.min(1, ctx.globalAlpha + 0.2);
  ctx.strokeStyle = rgba('#3a2a08', 0.85); ctx.lineWidth = 1.3;
  const nCrack = Math.floor(2 + k * 5);
  for (let i = 0; i < nCrack; i++) {
    const sx = x0 + hash(seed + i * 1.9) * w, sh = 4 + hash(seed + i) * 6;
    if (Math.abs(sx - cx) > half) continue;
    ctx.beginPath(); ctx.moveTo(sx, fy - 6); ctx.lineTo(sx + 3, fy - 6 + sh * 0.5); ctx.lineTo(sx - 1, fy + 2); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    const u = (time * 0.9 + i / 6 + hash(seed + i)) % 1, gx = cx + (hash(seed * 3 + i) - 0.5) * half * 2, gy = fy - 6 - u * 60 * k;
    ctx.fillStyle = rgba(GOLD_H, 0.8 * (1 - u) * k); ctx.fillRect(gx - 1.5, gy - 1.5, 3, 3);
  }
  ctx.restore();
  if (k > 0.6) warnFloor(ctx, cx, fy, w, k, GOLD, time);
}
function drawGoldShards(ctx, x0, fy, w, h, f, seed) {
  if (f <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= f;
  const n = Math.max(3, Math.round(w / 26));
  for (let i = 0; i < n; i++) {
    const bx = x0 + (i + 0.5) * (w / n) + (hash(seed + i) - 0.5) * 10, bh = h * (0.55 + 0.45 * hash(seed + i * 2.7)), lean = (hash(seed + i * 4.1) - 0.5) * 16;
    ctx.beginPath(); ctx.moveTo(bx - 10, fy); ctx.lineTo(bx + lean, fy - bh); ctx.lineTo(bx + 10, fy); ctx.closePath();
    ink(ctx, fl(i % 2 ? GOLD : '#d8a840'), 1.8, GOLD_D);
    if (!R.fl) { ctx.fillStyle = rgba(GOLD_H, 0.7); ctx.beginPath(); ctx.moveTo(bx - 3, fy - 3); ctx.lineTo(bx + lean, fy - bh + 5); ctx.lineTo(bx + 1, fy - 3); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
  glowE(ctx, x0 + w / 2, fy - h / 2, w * 0.6, h / 2 + 10, GOLD, 0.4 * f);
}
function drawGoldRubble(ctx, x0, fy, w, f, seed) {
  if (f <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= f;
  for (let i = 0; i < 7; i++) {
    const bx = x0 + hash(seed + i * 1.3) * w, s = 3 + hash(seed + i) * 5;
    ctx.beginPath(); ctx.moveTo(bx - s, fy); ctx.lineTo(bx, fy - s * 1.2); ctx.lineTo(bx + s, fy); ctx.closePath();
    ink(ctx, fl(GOLD), 1.2, GOLD_D);
  }
  ctx.restore();
}
function drawElixirColumn(ctx, x, top, fy, f) {
  if (f <= 0.01) return;
  glowE(ctx, x, (top + fy) / 2, 40, (fy - top) / 2, GOLD, 0.7 * f);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(GOLD_H, 0.85 * f); ctx.fillRect(x - 7, top, 14, fy - top);
  ctx.fillStyle = rgba('#ffffff', 0.7 * f); ctx.fillRect(x - 2.5, top, 5, fy - top);
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(x, fy - 4, 30 * f + 10, 6, 0, 0, TAU); ctx.fillStyle = rgba(GOLD, 0.7 * f); ctx.fill();
}

/** 컬링 대리 개체: 접합 팔·렌즈·배양조가 몸통 판정보다 크다 — e_charon.js 와 같은 틀 (artBounds 로 그린다) */
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
