// 보스 b_johan — 요한 / 돌아오지 못한 수문지기 (s27 1부 외전 Ⅱ 「돌아오지 못한 수문지기」) — docs/specs/ex_s27.md §2. 소유: EX-BOSS
// BossC(c_common.js) 상속. 틀은 e_paracel.js (전환 · 15% 강제 · 1페이즈 창 상한 · ArtCull 대리 개체 · this.inferno 지옥 갈래).
// 판정은 모두 c_common 키트 (strikeRect · strikeColumn · strikeCircle · strikeLine · groundWave · warnMark) + 보스 소유 Zone.
// 역류(undertow)의 물살은 보스 소유 바람 기믹 this.gim('wind') (보스 방 gimmick: null — 대역이 돈다). 타일은 바꾸지 않는다.
//
// 모습: 크고 둥근 황동 잠수 투구(징 박힌 통 · 둥근 창 셋 — 앞 창은 금이 가 안에서 검푸른 빛) · 물 먹은 범포 잠수복 · 가슴 쇠판 ·
//   가슴께의 기름 등불(유일한 따뜻한 빛 — 깜박이지만 꺼지지 않는다) · 허리 사슬과 닻 · 납 장화 · 투구 꼭대기에서 위로 이어지는 주름진
//   공기 호스 · 사람 키만 한 T자 수문 열쇠(망치처럼 쓴다). 2페이즈(breach, 50%): 앞 창이 터져 검은 물이 쏟아지고 레비아탄 비늘의
//   검은 장어 머리가 창으로 기어 나온다 · 공기 호스가 끊겨 채찍이 된다.
// 판정 부위 (가까운 부위 우선, defMul — 작을수록 아프다): 투구 0.85 (무릎 0.6) · 몸통 1.0 (무릎 0.7 · 긴 무릎 0.6) · 다리 1.15 ·
//   열쇠 자루 1.0 (카운터 창 동안만, prio) · 2페이즈 장어 머리 0.75 (약점, 긴 무릎 0.6). 호스는 그림만.
// 패턴 (static PATTERNS — ex_s27.md §2.1): keySlam(수문 열쇠 내려치기 · 박힌 열쇠 자루 = 카운터) · anchorChain(닻 사슬 — 던짐 · 되감기) ·
//   ballastDrop(납 장화 낙하 · 박힌 장화 = 카운터) · airVolley(공기 방울) · sluiceJet(수문 물줄기 — 세 높이 중 하나씩) ·
//   eelBurst(검은 장어 기둥) · undertow(역류 — 물띠 + 보스 쪽 물살 + 열쇠 원 휘두르기) · hoseLash(끊어진 호스 채찍) · 보조 stagger · lastLight(15%).
//   **모든 공격의 예고는 0.6초 이상, 첫 피해도 0.6초 이후** (계속 지대 — 역류 물띠 — 는 data.cont).
// 지옥 갈래 (this.inferno): 물보라 6칸 · 허리 높이 둘째 닻 · 충격파 두 번 · 방울 +2 · 물줄기 예고 0.75 + 셋째 물결 · 장어 6 + 둘째 줄 ·
//   물살 +15% + 원 두 번 · 호스 되돌려 한 번 더.
// 창 상한 (POLISH-4 교훈): 1페이즈 무릎 한 번 STAG_CAP 10% (takeHit 에서 줄여 '저항', capNote). 필살·각성 · 2페이즈 · 15% 긴 무릎은 상한 밖.
//   열쇠 자루 · 장화 카운터의 '한 대'는 플레이어·탈것 공격만 센다 (ownHit — 수호신 자동 공격 제외).
// 모든 패턴은 this.A(경기장 경계)와 A.floor 만 기준 — 보스 방(s27 boss 60×18) · 투기장(maps/arena.js r1) · 무한의 탑 보스 층이 같다.
// 결말 (체력 0): 보스 처치 처리(world.onBossDefeated)는 같고 부제는 기본 '격파!' (renameBanner 안전망).
//   스토리: 무릎 꿇은 갑옷이 두 손으로 열쇠를 바른 쪽으로 돌려 수문 바퀴를 닫는다 (dieT 0–2.2) → 검은 물이 빠지고 투구가 앞으로 떨어진다 →
//   등불은 바닥에서 계속 탄다 (b_johan_post) · 아케이드: 갑옷이 검은 물웅덩이로 무너져 3.0초에 사라진다 (바퀴 없음).
// 수문 바퀴 소품: s27 보스 방에서만 (world.stage?.id === 's27') 경기장 가운데 뒤쪽 (A.x0 + A.w/2, 바닥 3칸 위)에 뒤 그림으로. sluiceJet 때 돈다.
// 채색 렌더러(render/painted/bosses/b_johan.js)가 읽을 필드: zx, fy (발) · fk (좌우 −1..1, 연속) · facing · ps {lean, crouch, kneel, keyUp,
//   keyTurn, chain, hoseK, lash, clutch, jump} · pts (골격, rig()) · hose (호스 7점, 지역 좌표) · breached · eelK (장어가 나온 정도 0–1) ·
//   eel (장어 목 5점, 지역 좌표) · lampK (등불 밝기) · keyA (열쇠 각, 지역) · wheelA (바퀴 각) · wheelOn · anchor {x,y,on} (월드) · stunned ·
//   dieT · vanishK · helmOff (투구가 떨어진 정도) · state · t · flashT · A. 벡터 그림은 아래 paintBack/paintBody/paintFront — 채색이 없거나
//   실패해도 모든 상태가 그려진다. 그리기 함수 안에서는 난수·입자 생성을 하지 않는다 (hook_tags draw.fx / draw.rng) — 흔들림은 hash(시각) 로.
import { BossC, telegraph, strikeRect, strikeColumn, strikeCircle, strikeLine, groundWave, warnMark, phaseScript, canShowScript, capNote, nudgePlayer } from './c_common.js';
import { PI, R, ink, glow, glowE, glowSprite, warnRect, warnFloor, warnCircle, warnLine, impact, ownHit, hash } from './b_common.js';
import { Entity } from '../entity.js';
import { TILE } from '../../core/game.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba, mix } from '../../core/math.js';
import { registerPainted, hasPainted, paintedDraw } from '../../render/painted/registry.js';   // 채색 퍼핏 (그리기 전용)
import { bosses as EXB } from '../../render/painted/reg/ex-boss.js';
import { JOHAN_MV } from '../../data/bosses_e.js';   // 패턴 피해 배율 (balance.mjs s27 검사와 같은 표)

// ── 색 (ex_s27.md §2: 황동 · 녹슨 쇠 · 범포 · 검은 물 + 청록 윤 · 등불 · 레비아탄 비늘) ──
const BRASS = '#b08a4a', BRASS_H = '#ecc888', BRASS_D = '#5a4220', IRON = '#4a4038', IRON_H = '#7a6c5c', IRON_D = '#221c18';
const CANVAS = '#6a6450', CANVAS_H = '#948c70', CANVAS_D = '#36321f', BLACKW = '#0a1a1c', TEAL = '#3aa8a0', TEAL_H = '#a8f0e0';
const LAMP = '#ffc860', LAMP_H = '#fff4c8', SCALE = '#2a5a60', SCALE_H = '#6ab0b0', LEATHER = '#3e2c1c', LEATHER_H = '#6e5032', OUTL = '#05080a';
// ── 패턴 계약 (ex_s27.md §2.1 — 클래스의 static PATTERNS 가 c_common P2_PATTERNS 보다 이긴다) ──
const PATTERNS = {
  attacks: ['keySlam', 'anchorChain', 'ballastDrop', 'airVolley', 'sluiceJet', 'eelBurst', 'undertow', 'hoseLash'],
  helpers: ['stagger', 'lastLight'],
  transitions: { 1: { state: 'breach', dur: 2.6, script: 'b_johan_breach', form2: true, force: 'eelBurst', applyAt: 1.6 / 2.6 } },
  weights: [
    { keySlam: 3, anchorChain: 2, ballastDrop: 2, airVolley: 2, sluiceJet: 2 },
    { eelBurst: 3, undertow: 2, hoseLash: 3, keySlam: 2, sluiceJet: 1, ballastDrop: 1, anchorChain: 1 },
  ],
  gimmicks: ['wind'],   // 역류(undertow) 전용 보스 소유 바람 — 스테이지 기믹이 아니다 (보스 방 gimmick: null 그대로)
  floorRow: 16,
  // s26 boss 방과 같은 뼈대 (src/data/maps/s27.js boss — 13행 한쪽 디딤 둘 포함)
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7], [18, 13, 20, 13], [55, 13, 58, 13]] },
};
const T48 = () => TILE || 48;
const SIZE = { w: 104, h: 168 };
const STAG_CAP = [0.10];              // 1페이즈 무릎 한 번 (최대 체력 비율) — 2페이즈는 상한 없음
const KEY_LEN = 132;                  // 수문 열쇠 길이 (손 → 소켓 머리)
const POSE0 = { lean: 0, crouch: 0, kneel: 0, keyUp: 0, keyTurn: 0, chain: 0, hoseK: 0, lash: 0, clutch: 0, jump: 0 };
const POSE_RATE = { lean: 6, crouch: 7, kneel: 5, keyUp: 7, keyTurn: 6, chain: 8, hoseK: 4, lash: 9, clutch: 6, jump: 30 };
/** 패턴 피해 배율 — data/bosses_e.js JOHAN_MV (한 곳에서만 정한다) */
const MV = JOHAN_MV;
const pt = () => ({ x: 0, y: 0 });

export class Johan extends BossC {
  static get PATTERNS() { return PATTERNS; }

  setup() {
    // 채색 퍼핏: 모음(reg/ex-boss.js)에 b_johan 줄이 생기면 여기서 한 번 등록 (없으면 아무것도 안 함 — 벡터만)
    if (!hasPainted?.('b_johan') && EXB?.b_johan) registerPainted?.('b_johan', { kind: 'boss', importer: EXB.b_johan });
    const A = this.A;
    this.noGravity = true; this.vx = 0; this.vy = 0;
    this.w = SIZE.w; this.h = SIZE.h;
    this.zx = this.clampX(this.cx); this.fy = A.floor; this.airH = 0;
    const p0 = this.P;
    this.facing = this.fk = p0 && p0.cx < this.zx ? -1 : 1;
    this.tzx = this.zx; this.spd = 0; this.walkK = 0; this.walkPh = 0; this.stepI = 0;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    this.pts = { hip: pt(), neck: pt(), helm: pt(), win: pt(), chest: pt(), lamp: pt(), shN: pt(), shF: pt(), elN: pt(), hdN: pt(), elF: pt(), hdF: pt(),
      knN: pt(), knF: pt(), ftN: pt(), ftF: pt(), keyE: pt(), belt: pt(), tA: 0 };
    this.hose = Array.from({ length: 7 }, pt);
    this.eel = Array.from({ length: 5 }, pt);
    this.breached = false; this.eelK = 0; this.lampK = 0.7; this.keyA = 1.2; this.wheelA = 0; this.wheelOn = false; this.wheelSpin = 0;
    this.anchor = { x: 0, y: 0, on: false, x0: 0 };
    this.helmOff = 0; this.drainK = 0; this.closeK = 0;
    this.stunned = false; this.stagLong = false; this.keyStuck = false; this.bootStuck = false;
    this.capBud = null; this.capSaid = false; this.wakeT = 9;
    this._forced15 = false; this._lastNow = false; this._stagNow = false; this._lastMode = false; this._lastEnd = false; this._bn = null;
    this.dieT = 0; this.vanishK = 0; this.dustAcc = 0; this.fxAcc = 0; this._n = 0; this._end = 0; this.drop = null;
    this.pHelm = { x: 0, y: 0, w: 56, h: 52, defMul: 0.85 };
    this.pTorso = { x: 0, y: 0, w: 70, h: 76, defMul: 1.0 };
    this.pLegs = { x: 0, y: 0, w: 60, h: 70, defMul: 1.15 };
    this.pKey = { x: 0, y: 0, w: 40, h: 60, defMul: 1.0, key: true, prio: false };   // prio(카운터 창 동안만): 겹치면 가까운 부위보다 먼저 (combat.js pickPart)
    this.pEel = { x: 0, y: 0, w: 34, h: 34, defMul: 0.75 };
    this.cBody = { x: 0, y: 0, w: 60, h: 150 };
    this._hp = []; this._cp = []; this._r = pt(); this._q = pt();
    // 싸움 중 새 캔버스 0 (MASTER_PLAN §5.2): 쓰는 발광 색은 등장 때 굽는다
    for (const c of [LAMP, TEAL, TEAL_H, '#ffffff', '#9ad0e0', BRASS_H]) { glowSprite(c, false); glowSprite(c, true); }
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; }
  clampX(x) { const A = this.A; return clamp(x, A.x0 + 64, Math.max(A.x0 + 64, A.x1 - 64)); }
  faceP(th = 30) { const p = this.P; if (p) { const d = p.cx - this.zx; if (Math.abs(d) > th) this.facing = Math.sign(d); } }
  hpK() { return this.stats?.maxHp ? this.hp / this.stats.maxHp : 1; }
  /** 지역 좌표 (앞 = +x, 위 = −y, 발 = 0,0) → 월드 */
  toW(lx, ly, out = this._r) { out.x = this.zx + lx * this.facing; out.y = this.fy + ly; return out; }
  handW(out = this._q) { return this.toW(this.pts.hdN.x, this.pts.hdN.y, out); }
  keyEndW(out = this._q) { return this.toW(this.pts.keyE.x, this.pts.keyE.y, out); }
  helmW(out = this._q) { return this.toW(this.pts.helm.x, this.pts.helm.y, out); }
  winW(out = this._q) { return this.toW(this.pts.win.x, this.pts.win.y, out); }
  place() { this.x = this.zx - this.w / 2; this.y = this.fy - this.h; }
  /** 수문 바퀴 자리 (s27 보스 방에서만) */
  wheelPos() { const A = this.A; return { x: A.x0 + A.w / 2, y: A.floor - 3 * T48() - 10, r: 2.5 * T48() }; }
  hasWheel() { return this.world?.stage?.id === 's27'; }
  /** 골격 (지역 좌표). 자세 ps 를 따른다 — 채색 렌더러도 읽는다 */
  rig() {
    const P = this.ps, S = this.pts, t = this.t;
    const breathe = Math.sin(t * 1.7) * 1.4, walk = this.walkK, ph = this.walkPh;
    const hipY = -66 + P.crouch * 14 + P.kneel * 26 + Math.abs(Math.sin(ph)) * 3 * walk;
    S.hip.x = 2 * walk * Math.sin(ph); S.hip.y = hipY;
    const tA = 0.06 + P.lean * 0.4 + P.crouch * 0.2 + P.kneel * 0.22;   // 무거운 몸 — 거의 곧다
    S.tA = tA;
    const c = Math.cos(tA), s = Math.sin(tA);
    const rotP = (x, y, o) => { o.x = S.hip.x + x * c - y * s; o.y = S.hip.y + x * s + y * c; return o; };
    rotP(2, -62 + breathe, S.neck);
    rotP(10, -54, S.shN); rotP(-10, -54, S.shF);
    rotP(8, -34, S.chest); rotP(20, -30 + Math.sin(t * 2.3) * 1.2, S.lamp);
    rotP(4, -4, S.belt);
    if (this.drainK > 0) { S.lamp.x = lerp(S.lamp.x, 34, this.drainK); S.lamp.y = lerp(S.lamp.y, -16, this.drainK); }   // 스토리 죽음: 등불이 바닥에 놓여 계속 탄다
    S.helm.x = S.neck.x + 6 + Math.sin(t * 0.8) * 1.2; S.helm.y = S.neck.y - 22;
    S.win.x = S.helm.x + 20; S.win.y = S.helm.y + 2;
    // 다리 (가까운 쪽 앞, 먼 쪽 뒤) — 무릎 꿇기면 가까운 무릎이 바닥에
    const stride = Math.sin(ph) * 14 * walk;
    S.ftN.x = 16 + stride - P.kneel * 30; S.ftN.y = 0;
    S.ftF.x = -14 - stride + P.kneel * 4; S.ftF.y = 0;
    ik(S.hip.x + 8, S.hip.y, S.ftN.x, S.ftN.y, 36, 36, 1, S.knN);
    ik(S.hip.x - 8, S.hip.y, S.ftF.x, S.ftF.y, 36, 36, 1, S.knF);
    if (P.kneel > 0.5) { S.knN.x = lerp(S.knN.x, 22, P.kneel); S.knN.y = lerp(S.knN.y, -6, P.kneel); }
    // 가까운 팔 (열쇠 손): 0 쉼(열쇠 끝이 바닥 앞) · 1 머리 위로 · 2 앞 아래로 내려침 · 3 소켓에 꽂음(앞에 세움)
    const a = clamp(P.keyUp, 0, 3), sh = S.shN;
    const tgt = [[16, 34], [-2, -60], [44, 26], [30, 4]];
    const i0 = Math.min(3, Math.floor(a)), i1 = Math.min(3, i0 + 1), k = a - i0;
    let hx = sh.x + lerp(tgt[i0][0], tgt[i1][0], k), hy = sh.y + lerp(tgt[i0][1], tgt[i1][1], k) + breathe * 0.5;
    if (P.clutch > 0) { hx = lerp(hx, S.win.x + 8, P.clutch); hy = lerp(hy, S.win.y + 6, P.clutch); }
    ik(sh.x, sh.y, hx, hy, 30, 30, -1, S.elN);
    S.hdN.x = hx; S.hdN.y = hy;
    // 열쇠 각 (지역: 0 = 앞 수평, +π/2 = 아래). 쉼 = 앞 아래 · 들어 올림 = 뒤 위 · 내려침 = 앞 아래(끝이 바닥) · 소켓 = 곧게 아래
    const KA = [1.15, -2.2, 0.55, PI / 2];
    let ka = lerp(KA[i0], KA[i1], k);
    if (P.chain > 0) ka = lerp(ka, 1.5, P.chain);
    // 휘두르기(원) — keyTurn 이 한 바퀴를 돈다
    if (P.keyTurn > 0.01) ka += P.keyTurn * TAU;
    if (P.clutch > 0) ka = lerp(ka, 1.4, P.clutch);
    this.keyA = ka;
    let ex = S.hdN.x + Math.cos(ka) * KEY_LEN, ey = S.hdN.y + Math.sin(ka) * KEY_LEN;
    if (ey > 2 && this.airH <= 0) { const sc = (2 - S.hdN.y) / Math.max(1, ey - S.hdN.y); ex = S.hdN.x + (ex - S.hdN.x) * sc; ey = 2; }   // 바닥 밑으로 들어가지 않게 (소켓에 박힘)
    S.keyE.x = ex; S.keyE.y = ey;
    // 먼 팔: 닻 사슬을 돌림(chain) · 쉼 = 허리 · 소켓 때 열쇠 손잡이를 같이 잡음
    const f = S.shF, ch = P.chain;
    const fx = ch > 0 ? f.x - 10 + Math.cos(t * 14) * 26 * ch : (a > 2 ? S.hdN.x - 6 : f.x + 6), fy2 = ch > 0 ? f.y - 30 * ch + Math.sin(t * 14) * 18 * ch : (a > 2 ? S.hdN.y + 4 : f.y + 52);
    ik(f.x, f.y, fx, fy2, 28, 28, -1, S.elF);
    S.hdF.x = fx; S.hdF.y = fy2;
    // 공기 호스 7점: 1페이즈 = 투구 꼭대기에서 뒤 위로 (천장까지) · 2페이즈 = 끊겨 채찍 (lash −1 뒤로 젖힘 · +1 앞 바닥까지)
    const H = this.hose, top = { x: S.helm.x - 6, y: S.helm.y - 24 };
    if (!this.breached && !this._whip) {
      for (let j = 0; j < 7; j++) {
        const u = j / 6, sw = Math.sin(t * 1.3 + j * 0.9) * 6 * u, bulge = P.hoseK * Math.sin(t * 18 - j * 1.4) * 4;
        H[j].x = top.x - 40 * u - 30 * u * u + sw + bulge; H[j].y = top.y - 360 * u;
      }
    } else {
      // 쉼 = 뒤로 축 늘어짐 (2.3 rad) · lift(채찍질 중) 1 이면 lash 각: −1 뒤로 젖힘(3.9) → +1 머리 위를 넘어 앞 아래로(6.93)
      const L = P.lash, lift = this._whip ? 1 : 0;
      const aw = lerp(3.9, 6.93, (L + 1) / 2), base = lerp(2.3, aw, lift);
      for (let j = 0; j < 7; j++) {
        const u = j / 6, tw = Math.sin(t * 4.2 + j * 1.2) * (4 + 8 * u) * (1 - lift * 0.7);
        const ang = base + (lift ? u * 0.35 : u * 0.5), len = 26 * j;
        H[j].x = top.x + Math.cos(ang) * len + tw * 0.4; H[j].y = top.y + Math.sin(ang) * len + tw + (lift ? 0 : 10 * u * u);
      }
    }
    // 장어 (2페이즈): 앞 창에서 eelK 만큼 기어 나온 목 5점
    const E = this.eel, ek = this.eelK, sway = Math.sin(t * 3.4) * 8;
    for (let j = 0; j < 5; j++) {
      const u = j / 4;
      E[j].x = S.win.x + (6 + 46 * u) * ek + Math.sin(t * 3 + j) * 3 * u * ek; E[j].y = S.win.y + (-6 * u + Math.sin(u * PI) * -14) * ek + sway * u * ek;
    }
    if (P.clutch > 0) { E[4].x = lerp(E[4].x, S.win.x + 18, P.clutch); E[4].y = lerp(E[4].y, S.win.y + 4, P.clutch); }
  }
  /** 판정 부위 (월드 사각형) */
  syncParts() {
    const S = this.pts, f = this.facing;
    const box = (r, lx, ly, w, h) => { const cx = this.zx + lx * f; r.x = cx - w / 2; r.y = this.fy + ly - h / 2; r.w = w; r.h = h; };
    box(this.pHelm, S.helm.x, S.helm.y, 56, 52);
    box(this.pTorso, (S.hip.x + S.neck.x) / 2 + 2, (S.hip.y + S.neck.y) / 2, 70, Math.max(40, S.hip.y - S.neck.y + 18));
    box(this.pLegs, 2, S.hip.y / 2, 60, Math.max(20, -S.hip.y));
    const kx = (S.hdN.x + S.keyE.x) / 2, ky = (S.hdN.y + S.keyE.y) / 2;
    box(this.pKey, kx, ky, Math.max(36, Math.abs(S.keyE.x - S.hdN.x) + 20), Math.max(36, Math.abs(S.keyE.y - S.hdN.y) + 20));
    box(this.pEel, this.eel[4].x, this.eel[4].y, 34, 34);
    box(this.cBody, (S.hip.x + S.neck.x) / 2, S.helm.y / 2 + 4, 60, -S.helm.y + 20);
    this.pKey.prio = this.keyStuck;
    const st = this.stunned, lng = this.stagLong;
    this.pTorso.defMul = st ? (lng ? 0.6 : 0.7) : 1.0;
    this.pHelm.defMul = st ? 0.6 : 0.85;
    this.pEel.defMul = lng ? 0.6 : 0.75;
  }
  /** 이동 · 자세 보간 · 골격 · 판정 (논리 틱 — 그리기에서 부르지 않는다) */
  motion(dt, world) {
    for (const k in this.ps) this.ps[k] = approach(this.ps[k], this.pt[k], (POSE_RATE[k] ?? 6) * dt);
    if (dt > 0 && this.spd > 0) {
      const d = this.tzx - this.zx;
      if (Math.abs(d) > 2) this.zx += Math.sign(d) * Math.min(Math.abs(d), this.spd * dt);
      this.walkK = approach(this.walkK, Math.abs(d) > 6 ? 1 : 0, dt * 4);
    } else this.walkK = approach(this.walkK, 0, dt * 4);
    const ph0 = this.walkPh;
    this.walkPh += dt * 5.2 * this.walkK;
    if (this.walkK > 0.5 && Math.floor(ph0 / PI) !== Math.floor(this.walkPh / PI) && world?.camera) {   // 납 장화 한 걸음 (작은 흔들림)
      audio.sfx('land', { vol: 0.25, pitch: 0.55 }); world.camera.shake?.(1.2, 0.08);
    }
    this.zx = this.clampX(this.zx); this.fy = this.A.floor - this.airH;
    this.fk = approach(this.fk, this.facing, dt * 5);
    if (this.wheelOn) this.wheelA += dt * this.wheelSpin;
    this.rig();
    this.place();
    this.syncParts();
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0 || this.hidden) return L;
    if (this.keyStuck) L.push(this.pKey);
    if (this.breached && this.eelK > 0.5) L.push(this.pEel);
    L.push(this.pHelm, this.pTorso, this.pLegs);
    return L;
  }
  /** 접촉은 몸통 기둥만. 무릎·사망 중에는 없다 */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.hidden || this.dying > 0 || this.stunned) return L;
    L.push(this.cBody);
    return L;
  }
  /** 1페이즈 무릎 창 상한 (e_paracel.js 와 같은 틀 — 남은 예산 capBud). 필살·각성은 빼고 */
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
    if (Math.random() < 0.5) world.fx.burst(part === this.pEel ? 'water' : 'spark', x, y, 2, { color: part === this.pEel ? TEAL : BRASS_H, speed: 150 });
    if (this.dying > 0 || this.dead) { this.renameBanner(world); return; }
    this.check15();
    const own = ownHit(attack);
    // 카운터 창: 박힌 열쇠 자루(keySlam) 또는 박힌 장화(ballastDrop) 동안 플레이어·탈것 한 대 → 무릎
    if (own && ((this.keyStuck && this.state === 'keySlam') || (this.bootStuck && this.state === 'ballastDrop'))) { this.keyStuck = false; this.bootStuck = false; this._stagNow = true; }
  }
  /** 체력 15% 이하 한 번(싸움마다): 다음 틱에 하던 패턴을 끊고 lastLight */
  check15() {
    if (this._forced15 || this.phase < 1 || this.dying > 0 || this.hpK() > 0.15) return;
    this._forced15 = true; this._lastNow = true;
  }
  toForced() {
    this._lastNow = false; this._stagNow = false;
    if (this.dying > 0 || this.dead) return;
    if (this._tr) { this.forceNext('lastLight'); return; }
    this.clearJobs(); this.onCancel(this.world);
    this.lastAtk = 'lastLight';
    this.setState('lastLight');
  }
  toStagger(long = false) {
    this._stagNow = false;
    if (this.dying > 0 || this.dead || this._tr) return;
    this.clearJobs(); this.onCancel(this.world);
    this.stagLong = long;
    this.setState('stagger');
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    // 피격 처리 안이 아니라 여기서 (runJobs 밖 — clearJobs 가 안전하다): 15% 강제 > 무릎
    if (this._lastNow) this.toForced();
    else if (this._stagNow) this.toStagger();
    const lampT = this.dying > 0 ? 0.9 : this.state === 'lastLight' ? 1 : 0.62 + 0.1 * Math.sin(this.t * 7.3) * Math.sin(this.t * 3.1);
    this.lampK = approach(this.lampK, lampT, dt * 3);
    if (this.breached && !(this.dying > 0)) this.eelK = approach(this.eelK, this.state === 'stagger' && !this.stagLong ? 0.55 : 1, dt * 2);
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
  }
  ambient(dt, world) {
    if (this.vanishK >= 1) return;
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (this.breached ? 3.2 : 1.8);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const r = Math.random();
      if (r < 0.45) { const J = this.toW(this.pts.hip.x + rand(-26, 26), this.pts.hip.y + rand(-50, 20), this._r); world.fx.emit('water', J.x, J.y, { color: TEAL, speed: 30, angle: PI / 2, spread: 0.3 }); }
      else if (r < 0.75) { const H = this.toW(this.pts.helm.x + rand(-10, 10), this.pts.helm.y - 20, this._r); world.fx.emit('water', H.x, H.y, { color: '#cfefff', speed: 40, angle: -PI / 2, spread: 0.5 }); }
      else if (this.breached) { const W = this.winW(this._r); world.fx.emit('water', W.x + this.facing * 6, W.y + 6, { color: BLACKW, speed: 60, angle: PI / 2, spread: 0.4 }); }
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) {
    // 열쇠 · 호스(1페이즈는 천장까지) · 바퀴(s27)까지 잘리지 않게
    let x0 = this.zx - 190, x1 = this.zx + 190, y0 = this.fy - 260;
    if (!this.breached) y0 = Math.min(y0, (this.A.top ?? this.fy - 600) - 20);
    if (this.anchor.on) { x0 = Math.min(x0, this.anchor.x - 40); x1 = Math.max(x1, this.anchor.x + 40); }
    if (this.hasWheel()) { const W = this.wheelPos(); x0 = Math.min(x0, W.x - W.r - 20); x1 = Math.max(x1, W.x + W.r + 20); y0 = Math.min(y0, W.y - W.r - 20); }
    r.x = x0; r.y = y0; r.w = x1 - x0; r.h = this.fy + 40 - y0;
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
  /** 등장: 수문 바퀴 앞에서 열쇠를 돌리다 돌아본다 (노크 세 번) */
  s_intro(dt, world, t) {
    if (this.at(0.001)) { this.setPose({ keyUp: 3, lean: 0.2 }); this.wheelOn = this.hasWheel(); this.wheelSpin = -0.6; }
    if (this.at(0.25) || this.at(0.6) || this.at(0.95)) { audio.sfx('clang', { vol: 0.5, pitch: 0.7 }); }
    if (this.at(1.2)) { this.faceP(0); this.wheelOn = false; this.setPose({ keyUp: 0, lean: -0.1 }); audio.sfx('boss_roar', { vol: 0.35, pitch: 0.5 }); impact(world, { shake: 3, time: 0.3 }); }
    if (this.at(1.6)) this.relax();
    if (t >= 1.8) this.done(0.8);
  }
  /** 대기: 플레이어와 3–5칸을 두고 납 장화로 무겁게 걷는다 (가까우면 열쇠를 앞으로 겨눈다) · 2페이즈는 조금 빠르게 */
  idleMove(dt, world, t) {
    const A = this.A, p = this.P, px = p ? p.cx : A.cx, T = T48();
    this.faceP(30);
    const side = Math.sign(this.zx - px) || -this.facing;
    const d = 4 * T + Math.sin(this.t * 0.6) * T, close = p && Math.abs(p.cx - this.zx) < 2.6 * T;
    this.tzx = clamp(px + side * d, A.x0 + 64, A.x1 - 64);
    this.spd = (close ? 120 : 80) * (this.breached ? 1.2 : 1);
    if (this.state === 'idle') this.setPose({ lean: close ? 0.1 : 0, keyUp: close ? 0.4 : 0, lash: 0, chain: 0, hoseK: 0 });
  }

  // ── keySlam 수문 열쇠 내려치기: 열쇠를 머리 위로 천천히 들어 올림 0.75초 (앞 3.6칸 바닥 표시) → 내려침 strikeRect 앞 3.6칸 · 높이 150 MV.slam
  //    + 양옆 2칸 물보라 groundWave 높이 36 MV.splash. 열쇠가 바닥에 박혀 0.8초 = 카운터 창 (열쇠 자루 한 대 → 무릎). 지옥: 물보라 6칸 ──
  s_keySlam(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ keyUp: 1, lean: -0.2, crouch: 0.1 });
      audio.sfx('clang', { vol: 0.4, pitch: 0.5 });
      const A = this.A, T = T48(), f = this.facing, fy = A.floor, reach = 3.6 * T, x0 = this.zx + f * 10;
      const xa = clamp(f > 0 ? x0 : x0 - reach, A.x0, A.x1), xb = clamp(f > 0 ? x0 + reach : x0, A.x0, A.x1);
      const xs = (xa + xb) / 2, spl = (this.inferno ? 6 : 2) * T;
      strikeRect(this, { x: xa, y: fy - 150, w: Math.max(10, xb - xa), h: 150 }, { warn: 0.75, life: 0.2, mv: MV.slam, kb: [380, -520], color: BRASS_H, sfx: 'slash_heavy', vol: 0.8,
        onStart: (z, w) => {
          this.pt.keyUp = 2; this.ps.keyUp = Math.max(this.ps.keyUp, 1.7); this.setPose({ lean: 0.35, crouch: 0.3 });
          audio.sfx('break_wall', { vol: 0.7, pitch: 0.7 }); audio.sfx('splash', { vol: 0.6, pitch: 0.8 });
          impact(w, { shake: 9, time: 0.35 });
          const E = this.keyEndW(pt()); w.fx?.burst?.('water', E.x, fy - 6, 14, { color: TEAL_H, speed: 300, angle: -PI / 2, spread: 1.2 });
        },
        paint: (ctx, z, w) => {
          if (!z.started) { warnRect(ctx, z.x, fy - 26, z.w, 26, z.k, BRASS_H, w.time); warnFloor(ctx, xs, fy, z.w, z.k, BRASS_H, w.time); return; }
          const g = 1 - z.a;
          glowE(ctx, xs, fy - 40, z.w * 0.6, 50, TEAL, 0.6 * g);
        } });
      // 물보라: 내려친 자리 양옆으로 (뛰어넘는다)
      for (const d of [-1, 1]) {
        const sx = clamp(xs + d * reach / 2, A.x0 + 4, A.x1 - 4), to = clamp(sx + d * spl, A.x0 + 2, A.x1 - 2);
        groundWave(this, sx, d, { h: 36, w: 40, speed: 520, warn: 0.75, mv: MV.splash, color: TEAL_H, to, sfx: null, kb: [260, -420],
          paint: (ctx, z) => { if (!z.started) return; const fx = sx + d * 520 * Math.max(0, z.t - z.warn); drawSplashWave(ctx, fx, fy, d, 36, 1 - z.a); } });
      }
    }
    if (this.at(0.95)) { this.keyStuck = true; this.telegraph = false; }
    if (this.at(1.75)) { this.keyStuck = false; this.setPose({ keyUp: 0, lean: 0, crouch: 0 }); audio.sfx('clang', { vol: 0.35, pitch: 0.8 }); }
    if (t >= 2.05) this.done(0.9);
  }

  // ── anchorChain 닻 사슬: 허리의 닻을 풀어 휘휘 돌림 0.8초 (바닥 높이 띠 예고 — 플레이어 쪽 7칸) → 닻이 바닥을 긁으며 날아감 (바닥 위 0–40px 띠 MV.anchor)
  //    → 벽/7칸에서 멈춤 → 0.5초 뒤 되감기 (사슬이 그대로 보이는 게 예고 + 띠 0.5초) 같은 띠 MV.reel. 지옥: 0.4초 뒤 허리 높이(70–110px) 둘째 닻 ──
  s_anchorChain(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ chain: 1, lean: -0.1 });
      audio.sfx('clang', { vol: 0.4, pitch: 0.9 }); audio.sfx('whip', { vol: 0.3, pitch: 0.5 });
      const A = this.A, T = T48(), f = this.facing, fy = A.floor, x0 = this.zx + f * 30;
      const end = clamp(x0 + f * 7 * T, A.x0 + 24, A.x1 - 24);
      const xa = Math.min(x0, end), xb = Math.max(x0, end);
      this.anchor.x0 = x0; this.anchor.x1 = end; this.anchor.x = x0; this.anchor.y = fy; this.anchor.on = false; this.anchor.hi = false;
      const band = (y0, h, warn, mv, show, kind) => strikeRect(this, { x: xa, y: fy - y0 - h, w: Math.max(10, xb - xa), h }, { warn, life: 0.3, mv, kb: [320, -360], color: IRON_H, sfx: 'whip_crack', vol: 0.7,
        onStart: (z, w) => { if (kind === 'throw') { this.anchor.on = true; this.anchor.hi = y0 > 0; this.pt.chain = 0; audio.sfx('slash_heavy', { vol: 0.6, pitch: 0.6 }); w.camera?.shake?.(3, 0.15); } else if (kind === 'reel') { audio.sfx('clang', { vol: 0.5, pitch: 0.7 }); } },
        tick: (z) => { if (kind === 'throw' && z.started) { this.anchor.x = lerp(x0, end, clamp(z.a * 1.4, 0, 1)); this.anchor.y = fy - y0; } else if (kind === 'reel' && z.started) { this.anchor.x = lerp(end, x0, z.a); } },
        paint: (ctx, z, w) => {
          if (!z.started) { if (z.t >= z.warn - show) warnRect(ctx, z.x, z.y, z.w, z.h, clamp((z.t - (z.warn - show)) / show, 0, 1), IRON_H, w.time); return; }
          const g = 1 - z.a; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#cfe0e8', 0.35 * g); ctx.fillRect(z.x, z.y + z.h * 0.3, z.w, z.h * 0.4);
        } });
      band(0, 40, 0.8, MV.anchor, 0.8, 'throw');
      band(0, 40, 0.8 + 0.3 + 0.5 + 0.1, MV.reel, 0.6, 'reel');
      if (this.inferno) band(70, 40, 1.2, MV.anchor, 0.8, 'hi');
    }
    if (this.at(1.7)) { this.setPose({ chain: 0.6 }); }
    if (this.at(2.05)) { this.anchor.on = false; this.relax(); }
    if (t >= 2.3) this.done(1.0);
  }

  // ── ballastDrop 납 장화 낙하: 무릎을 굽힘 0.6초 → 천천히 뛰어오름 · 플레이어 x 에 착지 표시 0.9초 (0.6–0.9 추적, 마지막 0.6초 고정) → 착지 폭 3칸 MV.drop
  //    + 양쪽 충격파 groundWave 높이 40 MV.quake (뛰어넘는다) → 장화가 바닥에 박혀 1.0초 = 카운터 창. 지옥: 충격파 한 번 더 (0.6초 뒤, 자기 표시 0.6초) ──
  s_ballastDrop(dt, world, t) {
    const A = this.A, T = T48(), fy = A.floor;
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ crouch: 1, lean: 0.2, keyUp: 0.3 });
      telegraph(this, 0.6, { sfx: 'warning', vol: 0.3 });
      const p = this.P;
      this.drop = { x0: this.zx, tx: this.clampX(p ? p.cx : A.cx), fixed: false };
      const D = this.drop;
      strikeRect(this, { x: D.tx - 1.5 * T, y: fy - 168, w: 3 * T, h: 168 }, { warn: 1.5, life: 0.2, mv: MV.drop, kb: [360, -560], color: BRASS_H, sfx: 'break_wall', vol: 0.8,
        tick: (z) => { if (!z.started) { z.x = D.tx - 1.5 * T; } },
        onStart: (z, w) => { audio.sfx('land', { vol: 0.9, pitch: 0.4 }); impact(w, { shake: 11, time: 0.4 }); w.fx?.burst?.('dust', D.tx, fy - 4, 18, { speed: 260, angle: -PI / 2, spread: 1.8 }); w.fx?.burst?.('water', D.tx, fy - 4, 10, { color: TEAL_H, speed: 240, angle: -PI / 2, spread: 1.2 }); },
        paint: (ctx, z, w) => {
          if (!z.started) { if (z.t < 0.6) return; const k = clamp((z.t - 0.6) / 0.9, 0, 1); warnFloor(ctx, z.x + z.w / 2, fy, z.w, k, BRASS_H, w.time); warnRect(ctx, z.x + z.w * 0.3, fy - 168, z.w * 0.4, 168, k * 0.5, BRASS_H, w.time); return; }
          glowE(ctx, z.x + z.w / 2, fy - 20, z.w * 0.7, 40, BRASS_H, 0.7 * (1 - z.a));
        } });
    }
    const D = this.drop;
    if (!D) { if (t >= 0.1) this.done(0.8); return; }
    if (t >= 0.6 && t < 0.9) { const p = this.P; if (p) D.tx = approach(D.tx, this.clampX(p.cx), 900 * dt); }
    if (this.at(0.6)) { this.setPose({ crouch: 0, jump: 1, keyUp: 1 }); audio.sfx('splash', { vol: 0.5, pitch: 0.6 }); }
    if (this.at(0.9)) {
      D.fixed = true;
      const waves = this.inferno ? [0.6, 1.2] : [0.6];
      for (const wv of waves) for (const d of [-1, 1]) {
        const sx = clamp(D.tx + d * 1.5 * T, A.x0 + 4, A.x1 - 4), to = d > 0 ? A.x1 - 2 : A.x0 + 2;
        groundWave(this, sx, d, { h: 40, w: 44, speed: 560, warn: wv, mv: MV.quake, color: BRASS_H, to, sfx: null, kb: [260, -460] });
      }
    }
    if (t >= 0.6 && t < 1.5) {
      const k = clamp((t - 0.6) / 0.9, 0, 1);
      this.airH = Math.sin(k * PI) * 210 * (k < 0.5 ? 1 : 1);
      this.zx = lerp(D.x0, D.tx, k * k * (3 - 2 * k));
      this.tzx = this.zx;
    }
    if (this.at(1.5)) { this.airH = 0; this.zx = D.tx; this.tzx = D.tx; this.setPose({ jump: 0, crouch: 0.7, keyUp: 2, lean: 0.3 }); this.bootStuck = true; this.telegraph = false; }
    if (this.at(2.5)) { this.bootStuck = false; this.setPose({ crouch: 0, keyUp: 0, lean: 0 }); }
    if (t >= 2.8) { this.drop = null; this.done(1.0); }
  }

  // ── airVolley 공기 방울: 공기 호스가 부풂 0.8초 (투구 둘레 방울 빛) → 커다란 공기 방울이 플레이어 쪽으로 느리게 떠감
  //    (0.25초 간격, 초속 140–180, 1.6초 뒤 또는 닿으면 터짐 r 40 MV.bubble). 1페이즈 4방울 · 2페이즈 6방울 · 지옥 +2 ──
  s_airVolley(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ hoseK: 1, lean: -0.15 });
      audio.sfx('mist', { vol: 0.5, pitch: 0.5 }); audio.sfx('splash', { vol: 0.3, pitch: 1.4 });
      const n = this._n = (this.phase ? 6 : 4) + (this.inferno ? 2 : 0);
      for (let i = 0; i < n; i++) this.bubble(i, 0.8 + i * 0.25);
    }
    if (this.at(0.8)) this.setPose({ hoseK: 0.4, lean: 0.1 });
    if (t >= 0.8 + this._n * 0.25 + 1.0) { this.relax(); this.done(1.0); }
  }
  bubble(i, warn) {
    const A = this.A, r = 40, life = 1.6;
    const B = { x: 0, y: 0, vx: 0, vy: 0, launched: false };
    const home = () => { const H = this.helmW(this._q); return { x: H.x + this.facing * 26, y: H.y - 6 }; };
    const z = this.zone({ x: 0, y: 0, w: r * 2, h: r * 2, circle: { x: 0, y: 0, r }, warn, life, mv: MV.bubble, kb: [220, -320], z: 8,
      tick: (z2, w, dt) => {
        if (!B.launched) {
          const h = home(); B.x = h.x; B.y = h.y;
          if (z2.t >= z2.warn - 1e-6) {
            B.launched = true;
            const p = this.P, tx = p ? p.cx : B.x + this.facing * 300, ty = p ? p.cy - 10 : B.y;
            const sp = 140 + 40 * hash(i * 3.7 + this.t), a = Math.atan2(ty - B.y, tx - B.x) + (hash(i * 9.1) - 0.5) * 0.35;
            B.vx = Math.cos(a) * sp; B.vy = Math.sin(a) * sp;
          }
        } else {
          B.x += B.vx * dt; B.y += B.vy * dt + Math.sin(z2.t * 4 + i) * 12 * dt; B.vy -= 10 * dt;
        }
        B.x = clamp(B.x, A.x0 + r, A.x1 - r); B.y = clamp(B.y, (A.top ?? 0) + r, A.floor - r * 0.6);
        z2.circle.x = B.x; z2.circle.y = B.y; z2.x = B.x - r; z2.y = B.y - r;
      },
      onHitP: (z2, w) => { z2.dead = true; audio.sfx('splash', { vol: 0.5, pitch: 1.6 }); w.fx?.burst?.('water', B.x, B.y, 12, { color: '#cfefff', speed: 220 }); },
      onEnd: (z2, w) => { audio.sfx('splash', { vol: 0.35, pitch: 1.8 }); w.fx?.burst?.('water', B.x, B.y, 10, { color: '#cfefff', speed: 200 }); },
      paint: (ctx, z2, w) => {
        if (!z2.started) { const k = clamp(1 - (z2.warn - z2.t) / 0.8, 0, 1); if (k > 0) drawBubble(ctx, B.x, B.y, r * (0.25 + 0.55 * k), w.time + i, 0.6 * k); return; }
        drawBubble(ctx, B.x, B.y, r * (0.85 + 0.1 * Math.sin(z2.t * 9)), w.time + i, 1);
      } });
    return z;
  }

  // ── sluiceJet 수문 물줄기: 열쇠를 바닥 소켓에 꽂고 돌림 → 양쪽 벽의 세 높이(바닥 0–44 · 허리 70–120 · 머리 140–190, A.floor 기준) 중 한 높이에서 물이 샘
  //    (띠 예고 0.9초, 지옥 0.75) → 벽에서 벽까지 물줄기 0.8초 MV.jet · 밀림. 1페이즈 한 물결 · 2페이즈 두 물결 (끝난 뒤 0.1초, 둘째는 다른 높이 · 자기 예고 0.7초)
  //    — 같은 순간에는 한 높이만. 지옥: 셋째 물결 (첫 물결 높이 다시) ──
  s_sluiceJet(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ keyUp: 3, lean: 0.25, crouch: 0.15 });
      this.wheelOn = this.hasWheel(); this.wheelSpin = 1.4;
      audio.sfx('clang', { vol: 0.5, pitch: 0.6 });
      const BANDS = [[0, 44], [70, 120], [140, 190]];
      const p = this.P, A = this.A;
      // 첫 높이: 플레이어가 공중(발판)이면 허리/머리, 바닥이면 아무거나 — 무작위
      const b0 = Math.floor(rand(0, 3)) % 3, b1 = (b0 + 1 + Math.floor(rand(0, 2))) % 3;
      const seq = [b0];
      if (this.phase) seq.push(b1);
      if (this.inferno) seq.push(b0);
      const w0 = this.inferno ? 0.75 : 0.9, act = 0.8, gap = 0.1, show2 = this.inferno ? 0.6 : 0.7;
      let start = w0;
      seq.forEach((bi, k) => {
        const [lo, hi] = BANDS[bi], show = k === 0 ? w0 : show2;
        this.jet(lo, hi, start, act, show);
        start += act + gap;
      });
      this._end = start + 0.3;
      void p; void A;
    }
    if (t >= this._end) { this.wheelOn = false; this.relax(); this.done(1.0); }
  }
  jet(lo, hi, warn, life, show) {
    const A = this.A, fy = A.floor, y = fy - hi, h = hi - lo;
    return strikeRect(this, { x: A.x0, y, w: A.x1 - A.x0, h }, { warn, life, mv: MV.jet, kb: [420, -200], color: TEAL_H, sfx: 'splash', vol: 0.8,
      onStart: (z, w) => { audio.sfx('mist', { vol: 0.5, pitch: 0.4 }); w.camera?.shake?.(3, 0.3); },
      paint: (ctx, z, w) => {
        if (!z.started) {
          if (z.t < z.warn - show) return;
          const k = clamp((z.t - (z.warn - show)) / show, 0, 1);
          warnRect(ctx, z.x, z.y, z.w, z.h, k * 0.8, TEAL_H, w.time);
          drawLeak(ctx, A.x0, y + h / 2, 1, k, w.time); drawLeak(ctx, A.x1, y + h / 2, -1, k, w.time);
          return;
        }
        drawJet(ctx, A.x0, A.x1, y, h, z.a, w.time);
      } });
  }

  // ── eelBurst 검은 장어 (2페이즈 — 전환 직후 강제): 바닥에 검은 물이 번짐 warnMark 0.8초 — 그때의 플레이어 자리(첫 마리) ± 3칸씩 넷 →
  //    장어가 솟음 strikeColumn 폭 48 · 높이 150 MV.eel (0.22초 간격) → 0.6초 뒤 웅덩이로 가라앉음. 지옥: 6마리 · 둘째 줄(0.9초 뒤, 첫 줄 사이 자리) ──
  s_eelBurst(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ lean: 0.3, crouch: 0.3, keyUp: 3 });
      audio.sfx('dark', { vol: 0.6, pitch: 0.5 }); audio.sfx('splash', { vol: 0.5, pitch: 0.5 });
      const A = this.A, T = T48(), p = this.P, px = clamp(p ? p.cx : A.cx, A.x0 + 40, A.x1 - 40);
      const towards = px < (A.x0 + A.x1) / 2 ? 1 : -1;
      const offs = this.inferno ? [0, 3, -3, 6, -6, 9] : [0, 3, -3, 6];
      const xs = offs.map((o) => { let x = px + o * T; if (x < A.x0 + 30 || x > A.x1 - 30) x = px - o * T * 0.5 + towards * T * 1.5 * Math.sign(o || 1); return clamp(x, A.x0 + 30, A.x1 - 30); });
      xs.forEach((x, i) => this.eelAt(x, 0.8 + i * 0.22));
      let last = 0.8 + (xs.length - 1) * 0.22;
      if (this.inferno) {
        const s = [...xs].sort((a, b) => a - b), mids = [];
        for (let i = 0; i + 1 < s.length; i++) mids.push((s[i] + s[i + 1]) / 2);
        mids.forEach((x, i) => this.eelAt(clamp(x, A.x0 + 30, A.x1 - 30), 0.8 + 0.9 + i * 0.22));
        last = 0.8 + 0.9 + (mids.length - 1) * 0.22;
      }
      this._end = last + 1.0;
    }
    if (this.at(0.8)) this.setPose({ crouch: 0.5, lean: 0.4 });
    if (t >= this._end) { this.relax(); this.done(1.0); }
  }
  eelAt(x, warn) {
    const A = this.A, fy = A.floor, top = fy - 150;
    warnMark(this, x, fy - 40, Math.min(0.8, warn), TEAL);
    return strikeColumn(this, x, { w: 48, top, bottom: fy, warn, life: 0.3, mv: MV.eel, color: TEAL, sfx: 'splash', vol: 0.6, kb: [240, -560],
      onStart: (z, w) => { audio.sfx('dark', { vol: 0.35, pitch: 1.2 }); w.fx?.burst?.('water', x, fy - 10, 10, { color: BLACKW, speed: 260, angle: -PI / 2, spread: 0.8 }); },
      onEnd: () => this.zone({ x: x - 40, y: fy - 150, w: 80, h: 150, warn: 0, life: 0.6, harmless: true, z: 6, paint: (ctx, z) => drawEelPillar(ctx, x, fy, 150 * (1 - z.a), 1 - z.a, z.t * 6 + x) }),
      paint: (ctx, z, w) => {
        const shw = Math.min(0.8, z.warn);
        if (!z.started) { if (z.t < z.warn - shw) return; const k = clamp((z.t - (z.warn - shw)) / shw, 0, 1); drawBlackPool(ctx, x, fy, 18 + 26 * k, k, w.time + x); warnRect(ctx, x - 14, top, 28, 150, k * 0.6, TEAL, w.time); return; }
        drawEelPillar(ctx, x, fy, 150 * Math.min(1, z.a * 6 + 0.3), 1, w.time * 6 + x);
      } });
  }

  // ── undertow 역류 (2페이즈): 투구 창에서 검은 물이 쏟아짐 → 경기장 바닥에 얕은 물띠 (계속 지대 cont 높이 32 · 4초 · 느려짐 0.7 · MV.undertow rehit 0.5)
  //    + 보스 쪽으로 끄는 물살 (보스 소유 바람 gust 예고 0.8 · 2.6초) → 끝에 열쇠를 한 바퀴 휘두름 strikeCircle r 120 MV.sweep, 예고 0.9초.
  //    발판(11·13·7행)에 서면 물띠 밖. 끌리는 속도 = force × 0.36 (대역 바람) ≤ 가장 느린 영웅(브란 245)의 70 % = 171 → force 400 (144) · 지옥 460 (166).
  //    지옥: 물살 +15 % · 원 휘두르기 두 번 (0.7초 간격) ──
  s_undertow(dt, world, t) {
    const A = this.A, fy = A.floor;
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.setPose({ lean: -0.25, keyUp: 0.4 });
      audio.sfx('splash', { vol: 0.7, pitch: 0.4 }); audio.sfx('dark', { vol: 0.5, pitch: 0.4 });
      const p = this.P, dir = Math.sign(this.zx - (p ? p.cx : A.cx)) || this.facing;
      const g = this.gim('wind');
      g?.gust?.(dir, this.inferno ? 460 : 400, 2.6, 0.8);
      this._gust = true;
      const band = 32;
      this.zone({ x: A.x0, y: fy - band, w: A.x1 - A.x0, h: band, warn: 0.8, life: 4.0, rehit: 0.5, mv: MV.undertow, kb: [60, -160], data: { cont: true, pool: 'undertow' }, z: 5,
        tick: (z, w, dt2) => {
          if (!z.on) return;
          const P2 = w.player;
          if (P2 && !P2.dead && P2.bottom >= fy - band && P2.bottom <= fy + 4 && Math.abs(P2.vx) > 1) nudgePlayer(w, -P2.vx * dt2 * 0.3, 0);   // 물띠 안 느려짐 0.7
        },
        paint: (ctx, z, w) => {
          if (!z.started) { drawTide(ctx, A.x0, A.x1, fy, band * z.k, z.k * 0.7, w.time, this.zx); return; }
          drawTide(ctx, A.x0, A.x1, fy, band, 1 - Math.max(0, (z.a - 0.85) / 0.15), w.time, this.zx);
        } });
      const swings = this.inferno ? [0, 0.7] : [0];
      for (const s of swings) strikeCircle(this, this.zx, fy - 80, 120, { warn: 0.8 + 2.6 - 0.2 + s, life: 0.3, mv: MV.sweep, color: LAMP, sfx: 'slash_heavy', vol: 0.8, burstFx: 'water', kb: [480, -420],
        onStart: () => { this.pt.keyTurn = this.pt.keyTurn >= 1 ? 0 : 1; audio.sfx('whip', { vol: 0.6, pitch: 0.5 }); },
        paint: (ctx, z, w) => {
          if (!z.started) { if (z.t < z.warn - 0.9) return; warnCircle(ctx, this.zx, fy - 80, 120, clamp((z.t - (z.warn - 0.9)) / 0.9, 0, 1), LAMP, w.time); return; }
          glow(ctx, this.zx, fy - 80, 170, TEAL, 0.8 * (1 - z.a), true);
        } });
      this._end = 0.8 + 2.6 - 0.2 + swings[swings.length - 1] + 0.7;
    }
    if (this.at(0.8)) this.setPose({ lean: 0.1, keyUp: 1 });
    if (this.at(0.8 + 2.6 - 1.1)) this.setPose({ keyUp: 1, lean: -0.2, crouch: 0.2 });
    if (t >= this._end) { this.pt.keyTurn = 0; this.ps.keyTurn = 0; this.relax(); this._gust = false; this.done(1.0); }
  }

  // ── hoseLash 끊어진 호스 채찍 (2페이즈): 끊어진 호스를 뒤로 젖힘 0.7초 (호스 끝 궤적 예고 — 위에서 바닥까지 부채꼴) → 머리 높이에서 바닥까지
  //    쓸어내림 strikeLine 세 토막 (두께 30) MV.lash → 끝에 바닥 내리침 strikeColumn 폭 56 MV.lashSlam (예고는 같은 부채꼴). 지옥: 반대로 한 번 더 (0.6초 예고) ──
  s_hoseLash(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0; this._whip = true;
      this.setPose({ lash: -1, lean: -0.2 });
      audio.sfx('whip', { vol: 0.5, pitch: 0.4 });
      this.sweep(0.7, false, 0.7);
      this._end = 1.6;
      if (this.inferno) { this.sweep(0.7 + 0.45 + 0.6, true, 0.6); this._end = 2.6; }
    }
    if (this.at(0.7)) this.setPose({ lash: 1, lean: 0.25 });
    if (this.inferno && this.at(1.2)) this.setPose({ lash: -0.6, lean: -0.1 });
    if (this.inferno && this.at(1.75)) this.setPose({ lash: 1, lean: 0.2 });
    if (t >= this._end) { this._whip = false; this.relax(); this.done(1.0); }
  }
  sweep(warn, back, show) {
    const A = this.A, fy = A.floor, f = this.facing, T = T48();
    const R0 = this.toW(this.pts.helm.x - 6, this.pts.helm.y - 24, pt());
    const ends = [[4.6 * T, fy - 180], [4.9 * T, fy - 96], [4.4 * T, fy - 12]];
    if (back) ends.reverse();
    const cx = (x) => clamp(x, A.x0 + 6, A.x1 - 6);
    ends.forEach(([dx, y], i) => {
      const x1 = cx(R0.x + f * dx);
      strikeLine(this, R0.x, R0.y, x1, y, { warn: warn + i * 0.07, life: 0.12, th: 30, mv: MV.lash, color: TEAL_H, sfx: i === 0 ? 'whip_crack' : null, vol: 0.8, kb: [380, -360],
        paint: (ctx, z, w) => {
          if (!z.started) { if (i !== 0 || z.t < z.warn - show) return; drawFan(ctx, R0.x, R0.y, ends.map(([d, yy]) => [cx(R0.x + f * d), yy]), clamp((z.t - (z.warn - show)) / show, 0, 1), w.time); return; }
          ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(TEAL_H, 0.6 * (1 - z.a)); ctx.lineWidth = 20;
          ctx.beginPath(); ctx.moveTo(R0.x, R0.y); ctx.lineTo(x1, y); ctx.stroke();
        } });
    });
    const sx = cx(R0.x + f * 4.4 * T);
    strikeColumn(this, sx, { w: 56, top: fy - 140, bottom: fy, warn: warn + 0.25, life: 0.25, mv: MV.lashSlam, color: TEAL, sfx: 'break_wall', vol: 0.6, kb: [260, -520],
      onStart: (z, w) => { impact(w, { shake: 6, time: 0.25 }); w.fx?.burst?.('water', sx, fy - 6, 12, { color: BLACKW, speed: 260, angle: -PI / 2, spread: 1.0 }); },
      paint: (ctx, z, w) => { if (!z.started) { if (z.t < z.warn - show - 0.25) return; warnFloor(ctx, sx, fy, 80, clamp((z.t - (z.warn - show - 0.25)) / (show + 0.25), 0, 1), TEAL, w.time); return; } glowE(ctx, sx, fy - 50, 50, 70, TEAL, 0.8 * (1 - z.a)); } });
  }

  // ── stagger (보조): 1.5초 (투구 0.6 · 몸통 0.7) · 긴 무릎 2.5초 (몸통 0.6 · 장어 0.6). 들어가는 길: 열쇠 자루 · 장화 카운터 · 15% 대사 뒤 ──
  s_stagger(dt, world, t) {
    if (this.at(0.001)) {
      this.wakeT = 9; this.stunned = true; this.keyStuck = false; this.bootStuck = false; this.spd = 0; this.airH = 0;
      this.setPose({ kneel: 1, lean: 0.35, keyUp: 0, lash: 0, chain: 0, hoseK: 0, clutch: this.stagLong && this.breached ? 1 : 0 });
      audio.sfx('hit_heavy', { pitch: 0.6 }); audio.sfx('clang', { vol: 0.5, pitch: 0.6 });
      world.fx.burst('spark', this.zx, this.fy - 120, 12, { color: BRASS_H, speed: 180 });
      impact(world, { shake: 7, time: 0.3 });
    }
    const L = this.stagLong ? 2.5 : Math.min(1.5, this.wakeT);
    if (this.stunned && Math.random() < 0.2 * (world.fx.quality ?? 1)) { const H = this.toW(this.pts.helm.x, this.pts.helm.y - 30, this._r); world.fx.emit('spark', H.x + rand(-14, 14), H.y, { color: '#fff3c0', speed: 40, angle: -PI / 2 }); }
    if (this.at(L)) { this.stunned = false; this.setPose({ kneel: 0, lean: 0, clutch: 0 }); }
    if (t >= L + 0.4) { this.stagLong = false; this.relax(); this.done(0.6); }
  }

  // ── lastLight (보조, 15%): 하던 패턴을 끊고 갑옷이 굳는다 · 등불이 확 밝아짐 0.6초. 스토리·처음이면 곧바로 b_johan_last (그동안 월드가 멈춘다)
  //    → 장갑 낀 손이 투구 창의 장어 목을 움켜쥐고 누른다 → 긴 무릎 2.5초 (몸통 0.6 · 장어 0.6). 아케이드·다시 볼 때는 검은 물 파열 (r 170 · 예고 0.8 · MV.last, 무릎 없음) ──
  s_lastLight(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this._lastMode = canShowScript(world, 'b_johan_last'); this._lastEnd = false;
      this.setPose({ lean: -0.15, keyUp: 0, lash: 0, crouch: 0.1 });
      audio.sfx('holy', { vol: 0.5, pitch: 0.7 }); audio.sfx('clang', { vol: 0.4, pitch: 1.2 });
      if (this._lastMode && !phaseScript(this, 'b_johan_last', { onEnd: () => { this._lastEnd = true; } })) { this._lastMode = false; this._lastEnd = false; }
      if (!this._lastMode) strikeCircle(this, this.zx, this.fy - 84, 170, { warn: 0.8, life: 0.35, mv: MV.last, color: TEAL, sfx: 'splash', vol: 0.9, burstFx: 'water', kb: [460, -420],
        paint: (ctx, z, w) => { if (!z.started) { warnCircle(ctx, this.zx, this.fy - 84, 170, z.k, TEAL, w.time); return; } glow(ctx, this.zx, this.fy - 84, 230, TEAL, 0.9 * (1 - z.a), true); } });
    }
    if (this._lastMode) {
      if (this._lastEnd || t > 8) {
        this._lastMode = false;
        const W = this.winW(pt());
        audio.sfx('clang', { vol: 0.8, pitch: 0.5 }); audio.sfx('holy', { vol: 0.6, pitch: 0.6 });
        world.fx.burst('water', W.x, W.y, 14, { color: BLACKW, speed: 200 });
        impact(world, { shake: 8, time: 0.4, flash: LAMP_H, fa: 0.18 });
        this.toStagger(true);
      }
      return;
    }
    if (this.at(1.2)) this.relax();
    if (t >= 1.4) this.done(1.0);
  }

  // ── 전환 breach (1→2): 무적 2.6초. 0.4초 앞 창에 금 → 1.0초 창이 터지며 검은 물 · 유리 조각 · 호스가 끊어짐 → 1.6초 (applyAt → applyPhase(1):
  //    form2 이름·칭호 · 장어 머리가 창으로 나옴 · breached) → 끝에 대사 b_johan_breach (스토리 1회) → 곧바로 eelBurst ──
  s_breach(dt, world, t) {
    if (this.at(0.001)) { this.spd = 0; this.airH = 0; this.anchor.on = false; this.setPose({ crouch: 0.3, lean: -0.3, keyUp: 0 }); audio.sfx('dark', { vol: 0.6, pitch: 0.5 }); this.crackT = this.t; }
    if (this.at(0.4)) { audio.sfx('ice', { vol: 0.6, pitch: 0.6 }); const W = this.winW(pt()); world.fx.burst('shard', W.x, W.y, 6, { color: '#cfefff', speed: 120 }); }
    if (this.at(1.0)) {
      const W = this.winW(pt());
      audio.sfx('break_wall', { vol: 0.9, pitch: 1.2 }); audio.sfx('splash', { vol: 0.9, pitch: 0.5 }); audio.sfx('whip_crack', { vol: 0.5, pitch: 0.6 });
      world.fx.burst('shard', W.x, W.y, 16, { color: '#cfefff', speed: 300 });
      world.fx.burst('water', W.x, W.y, 18, { color: BLACKW, speed: 260 });
      impact(world, { shake: 9, time: 0.45 });
      this.hoseCut = true;
      this.setPose({ lean: 0.35, crouch: 0.5 });
    }
    this.transitionTick(dt, world, t);
  }
  applyPhase(k) {
    if (k >= 1 && !this.breached) {
      this.breached = true; this.hoseCut = true;
      const w = this.world;
      if (w?.fx) {
        const W = this.winW(pt());
        w.fx.burst('water', W.x, W.y, 14, { color: TEAL, speed: 220 });
        w.fx.ring(W.x, W.y, { color: TEAL, r0: 10, r1: 200, life: 0.5, width: 4 });
        impact(w, { shake: 8, time: 0.4, flash: '#9ad0e0', fa: 0.2 });
        audio.sfx('boss_roar', { vol: 0.5, pitch: 0.7 });
      }
    }
  }
  onCancel() {
    if (this._gust) { const g = this.gim('wind', { create: false }); g?.reset?.(); this._gust = false; }
    this._whip = false; this.pt.keyTurn = 0; this.ps.keyTurn = 0;
    this.stunned = false; this.keyStuck = false; this.bootStuck = false; this.spd = 0;
    this._lastMode = false; this._lastEnd = false; this.stagLong = false;
    this.airH = 0; this.drop = null; this.anchor.on = false; this.wheelOn = false;
    this.relax();
  }
  onReset() {
    this.onCancel();
    for (const e of this.world?.entities ?? []) if (!e.dead && (e.kind === 'projectile' || e.kind === 'hazard') && (e.owner?.summoner === this || e.boss === this)) e.dead = true;
    const g = this.gim('wind', { create: false }); if (g) g.reset?.();
    this.breached = false; this.hoseCut = false; this.eelK = 0; this.vanishK = 0; this.helmOff = 0; this.drainK = 0; this.closeK = 0; this.wheelA = 0;
    this._forced15 = false; this._lastNow = false; this._stagNow = false;
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    this.zx = this.clampX(this.zx); this.tzx = this.zx; this.fy = this.A.floor; this.fk = this.facing;
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 쓰러짐 (체력 0) ═════════════════════════════
  onDeath(world) {
    this.clearJobs();
    this._tr = null; this.applyPhasesTo(Math.max(1, this.phase), world);   // 쓰러질 때는 언제나 창이 터진 모습 (50% 를 한 방에 넘겨도)
    this.dying = 3.2; this.dieT = 0; this._bn = null; this._crumble = false; this._thud = false; this._shut = false;
    this.stunned = false; this.keyStuck = false; this.bootStuck = false; this.spd = 0; this.airH = 0; this.anchor.on = false;
    const g = this.gim('wind', { create: false }); if (g) g.reset?.();
    this.setPose({ kneel: 1, lean: 0.25, keyUp: 3, lash: 0, chain: 0, hoseK: 0, clutch: 0 });
    audio.sfx('dark', { vol: 0.5, pitch: 0.5 });
  }
  /** 배너 이름 안전망 (e_bride.js · e_paracel.js 와 같은 틀) — 쓰러질 때는 언제나 form2 이름 「검은 물」 (처치 처리가 처음 이름을 쓰면 바꾼다) */
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
    if (!this._thud && T >= 0.4) { this._thud = true; audio.sfx('land', { pitch: 0.5, vol: 0.7 }); world.fx.burst('dust', this.zx, this.fy - 6, 12, { speed: 120, angle: -PI / 2, spread: 1.6 }); }
    const arcade = world.arcade ?? world.mode !== 'story';
    this.eelK = approach(this.eelK, 0, dt * 1.2);
    if (arcade) {
      // 검은 물웅덩이로 무너진다 (바퀴 없음)
      if (T >= 1.2) {
        if (!this._crumble) { this._crumble = true; audio.sfx('splash', { vol: 0.7, pitch: 0.5 }); }
        this.vanishK = clamp((T - 1.2) / 1.8, 0, 1);
        this.dustAcc += dt * 30 * q * (1 - this.vanishK * 0.6);
        while (this.dustAcc >= 1) { this.dustAcc -= 1; const P = this.toW(rand(-30, 30), -rand(4, 140) * (1 - this.vanishK * 0.7), this._r); world.fx.emit('water', P.x, P.y, { color: Math.random() < 0.3 ? TEAL : BLACKW, speed: rand(30, 90), angle: PI / 2, spread: 0.6 }); }
      }
    } else {
      // 스토리: 바른 쪽으로 열쇠를 돌려 바퀴를 닫는다 (0–2.2초) → 검은 물이 빠지고 투구가 앞으로 떨어진다 → 등불은 계속 탄다
      this.closeK = clamp(T / 2.2, 0, 1);
      this.pt.keyTurn = 0; this.wheelOn = this.hasWheel(); this.wheelSpin = T < 2.2 ? 0.9 : 0;
      if (T < 2.2 && Math.floor((T - dt) / 0.55) !== Math.floor(T / 0.55)) audio.sfx('clang', { vol: 0.35, pitch: 0.55 });
      if (!this._shut && T >= 2.2) { this._shut = true; this.wheelOn = false; audio.sfx('break_wall', { vol: 0.6, pitch: 0.5 }); impact(world, { shake: 6, time: 0.4 }); }
      if (T >= 2.2) { this.drainK = clamp((T - 2.2) / 0.8, 0, 1); this.helmOff = clamp((T - 2.6) / 0.6, 0, 1); }
      if (this.dying < 0.25) this.dying = 0.25;   // 스테이지가 끝날 때까지 무릎 꿇은 빈 갑옷으로 남는다
    }
    this.motion(dt, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    if (this.hidden || this.vanishK >= 1) return;
    const k = this.dying > 0 ? 0.8 * (1 - this.vanishK) : 1;
    const Lp = this.toW(this.pts.lamp.x, this.pts.lamp.y, pt());
    L.add(Lp.x, Lp.y, 120 + 120 * this.lampK, LAMP, (0.35 + 0.45 * this.lampK) * k);
    const W = this.winW(pt());
    if (!(this.dying > 0)) L.add(W.x, W.y, 70, TEAL, 0.35 * k);
    if (this.keyStuck) L.add(this.keyEndW(pt()).x, this.fy - 30, 110, BRASS_H, 0.35);
  }

  // ═════════════════════════════ 그리기 (벡터 — 무겁고 단단하게, 1부 화풍의 무게로) ═════════════════════════════
  bodyAlpha() { return 1 - this.vanishK; }
  /** 수문 바퀴(s27 보스 방) · 바닥 그림자 · 1페이즈 공기 호스(몸 뒤) · 무너진 검은 물웅덩이 */
  paintBack(ctx) {
    if (this.hasWheel()) { const W = this.wheelPos(); drawWheel(ctx, W.x, W.y, W.r, this.wheelA, this.closeK, this.t); }
    const a = this.bodyAlpha();
    ctx.save();
    ctx.globalAlpha *= Math.max(a, this.vanishK > 0 ? 0.8 : 0) * 0.5;
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(this.zx, this.A.floor + 2, 58 - Math.min(30, this.airH * 0.15), 8, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (this.vanishK > 0 || this.drainK > 0) { ctx.save(); drawBlackPool(ctx, this.zx, this.A.floor, 40 + 50 * Math.max(this.vanishK, this.drainK), 1 - Math.max(0, this.vanishK - 0.8) * 5, this.t); ctx.restore(); }
    if (a <= 0.01) return;
    if (!this.breached && !this._whip) { ctx.save(); ctx.globalAlpha *= a; drawHose(ctx, this, false); ctx.restore(); }
  }
  paintBody(ctx, world, flash = false) {
    const a = this.bodyAlpha();
    if (a <= 0.01) return;
    const P = this.ps, S = this.pts, t = this.t, fk = this.fk, sx = Math.abs(fk) < 0.2 ? Math.sign(fk || this.facing) * 0.2 : fk;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(this.zx, this.fy);
    ctx.scale(sx, 1 - this.vanishK * 0.5);
    // ── 먼 쪽: 먼 팔 · 먼 다리 · 닻(허리에 걸림) ──
    drawArm(ctx, S.shF.x, S.shF.y, S.elF.x, S.elF.y, S.hdF.x, S.hdF.y, true, P.chain > 0.3);
    drawLeg(ctx, S.hip.x - 8, S.hip.y, S.knF.x, S.knF.y, S.ftF.x, S.ftF.y, true);
    if (!this.anchor.on && P.chain < 0.3) drawAnchor(ctx, S.belt.x - 26, S.belt.y + 20, 0.4, 0.8, true);
    // ── 몸통: 범포 잠수복 · 가슴 쇠판 · 허리 사슬 ──
    drawLeg(ctx, S.hip.x + 8, S.hip.y, S.knN.x, S.knN.y, S.ftN.x, S.ftN.y, false);
    drawSuit(ctx, S, t, this.breached);
    // 투구 (떨어지는 중이면 앞으로 굴러 내린다)
    const hk = this.helmOff;
    if (hk > 0) { ctx.save(); ctx.translate(lerp(0, 40, hk), lerp(0, -S.helm.y - 28, hk * hk)); ctx.rotate(hk * 1.3); ctx.translate(-S.helm.x, -S.helm.y); drawHelm(ctx, S.helm.x, S.helm.y, t, this.breached, 0, this.drainK); ctx.restore(); }
    else drawHelm(ctx, S.helm.x, S.helm.y, t, this.breached, this.eelK, this.drainK);
    if (this.breached && this.eelK > 0.02 && hk <= 0) drawEel(ctx, this.eel, S.win, this.eelK, t, this.stunned);
    if ((this.breached || this._whip) && hk <= 0) drawHose(ctx, this, true);
    // 등불 (가슴께 — 따로 흔들림)
    drawLamp(ctx, S.lamp.x, S.lamp.y, this.lampK, t, this.dying > 0 && this.drainK > 0.5);
    // 가까운 팔 + 수문 열쇠
    drawKey(ctx, S.hdN.x, S.hdN.y, S.keyE.x, S.keyE.y, this.keyStuck, t);
    drawArm(ctx, S.shN.x, S.shN.y, S.elN.x, S.elN.y, S.hdN.x, S.hdN.y, false, true);
    ctx.restore();
  }
  paintFront(ctx) {
    if (this.anchor.on) { const H = this.toW(this.pts.hdF.x, this.pts.hdF.y, this._r); drawChain(ctx, H.x, H.y, this.anchor.x, this.anchor.y, this.t); drawAnchorW(ctx, this.anchor.x, this.anchor.y, this.facing); }
    if (this.keyStuck) { const E = this.keyEndW(this._r); glow(ctx, E.x, this.fy - 30, 70 + 12 * Math.sin(this.t * 14), BRASS_H, 0.35); }
    if (this.bootStuck) glow(ctx, this.zx, this.fy - 20, 80 + 12 * Math.sin(this.t * 14), BRASS_H, 0.35);
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
/** 끝이 둥근 굵은 살 (두 원 사이를 잇는 사다리꼴) */
function limb(ctx, x0, y0, x1, y1, r0, r1, col, lw = 2.4) {
  const ang = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(ang), ny = Math.cos(ang);
  ctx.beginPath();
  ctx.moveTo(x0 + nx * r0, y0 + ny * r0); ctx.lineTo(x1 + nx * r1, y1 + ny * r1);
  ctx.arc(x1, y1, r1, ang + PI / 2, ang - PI / 2, true);
  ctx.lineTo(x0 - nx * r0, y0 - ny * r0);
  ctx.arc(x0, y0, r0, ang - PI / 2, ang + PI / 2, true);
  ctx.closePath();
  ink(ctx, fl(col), lw, OUTL);
}
function drawLeg(ctx, hx, hy, kx, ky, fx, fy, far) {
  const c = far ? CANVAS_D : CANVAS;
  limb(ctx, hx, hy, kx, ky, 15, 13, c);
  limb(ctx, kx, ky, fx, fy - 12, 13, 12, c);
  // 무릎 덧댐
  ctx.beginPath(); ctx.arc(kx, ky, 8, 0, TAU); ink(ctx, fl(far ? LEATHER : LEATHER_H), 2, OUTL);
  // 납 장화 (두꺼운 밑창 · 끈)
  ctx.beginPath(); ctx.moveTo(fx - 16, fy); ctx.lineTo(fx - 14, fy - 24); ctx.lineTo(fx + 10, fy - 24); ctx.lineTo(fx + 24, fy - 8); ctx.lineTo(fx + 24, fy); ctx.closePath();
  ink(ctx, fl(far ? IRON_D : IRON), 2.4, OUTL);
  if (!R.fl) { ctx.fillStyle = far ? '#2a2420' : IRON_H; ctx.fillRect(fx - 16, fy - 6, 40, 6); ctx.fillStyle = rgba(BRASS_H, far ? 0.25 : 0.5); for (let i = 0; i < 3; i++) ctx.fillRect(fx - 10 + i * 9, fy - 20, 3, 3); }
}
function drawArm(ctx, sx, sy, ex, ey, hx, hy, far, fist) {
  const c = far ? CANVAS_D : CANVAS;
  limb(ctx, sx, sy, ex, ey, 14, 12, c);
  limb(ctx, ex, ey, hx, hy, 12, 10, c);
  // 가죽 장갑 (두툼한 손)
  ctx.beginPath(); ctx.arc(hx, hy, fist ? 11 : 10, 0, TAU); ink(ctx, fl(far ? '#2a1e14' : LEATHER), 2, OUTL);
  if (!R.fl) { ctx.fillStyle = rgba(LEATHER_H, far ? 0.25 : 0.5); ctx.beginPath(); ctx.arc(hx - 3, hy - 3, 4, 0, TAU); ctx.fill(); }
  // 소맷부리 쇠고리
  if (!R.fl) { const a = Math.atan2(hy - ey, hx - ex); ctx.strokeStyle = far ? BRASS_D : BRASS; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(lerp(ex, hx, 0.72), lerp(ey, hy, 0.72), 10, a + PI / 2 - 1.2, a + PI / 2 + 1.2); ctx.stroke(); }
}
function drawSuit(ctx, S, t, breached) {
  const h = S.hip, n = S.neck, tA = S.tA;
  ctx.save();
  ctx.translate(h.x, h.y); ctx.rotate(tA);
  // 부푼 범포 몸통 (물 먹은 자루)
  const puff = breached ? 1.08 : 1;
  ctx.beginPath();
  ctx.moveTo(-30 * puff, 6); ctx.bezierCurveTo(-44 * puff, -18, -40 * puff, -58, -26, -66); ctx.lineTo(28, -66);
  ctx.bezierCurveTo(44 * puff, -56, 46 * puff, -16, 32 * puff, 6); ctx.quadraticCurveTo(0, 14, -30 * puff, 6); ctx.closePath();
  ink(ctx, fl(CANVAS), 2.6, OUTL);
  if (!R.fl) {
    ctx.fillStyle = rgba(CANVAS_D, 0.7); ctx.beginPath(); ctx.ellipse(-16, -26, 14, 30, 0.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(CANVAS_D, 0.9); ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-28 + i * 16, 4); ctx.quadraticCurveTo(-24 + i * 16, -30, -20 + i * 14, -60); ctx.stroke(); }
    // 이음매에서 배어 나오는 검은 물
    ctx.fillStyle = rgba(BLACKW, 0.75);
    for (let i = 0; i < 3; i++) { const x = -18 + i * 18, L = 10 + 8 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 2)); ctx.beginPath(); ctx.ellipse(x, -4 + L / 2, 3, L / 2, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = rgba(TEAL, 0.35); ctx.fillRect(-20, -2, 2, 6);
  }
  // 가슴 쇠판 (징 · 녹)
  ctx.beginPath(); ctx.moveTo(-26, -66); ctx.lineTo(30, -66); ctx.quadraticCurveTo(36, -46, 24, -36); ctx.lineTo(-20, -36); ctx.quadraticCurveTo(-32, -48, -26, -66); ctx.closePath();
  ink(ctx, fl(BRASS), 2.4, OUTL);
  if (!R.fl) {
    ctx.fillStyle = rgba(BRASS_H, 0.35); ctx.fillRect(-18, -62, 40, 5);
    ctx.fillStyle = rgba('#3a5a40', 0.45); ctx.beginPath(); ctx.ellipse(-8, -44, 10, 5, 0.3, 0, TAU); ctx.fill();   // 녹
    ctx.fillStyle = BRASS_H; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-20 + i * 9, -40, 2, 0, TAU); ctx.fill(); }
  }
  // 허리 사슬 + 납 추
  if (!R.fl) {
    ctx.strokeStyle = IRON_H; ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.ellipse(-32 + i * 9, -4 + Math.sin(i) * 1.5, 5, 3, i % 2 ? 0 : PI / 2, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = IRON_D; ctx.fillRect(-8, -2, 14, 12); ctx.strokeStyle = OUTL; ctx.lineWidth = 1.5; ctx.strokeRect(-8, -2, 14, 12);
  }
  ctx.restore();
}
/** 투구: 징 박힌 황동 통, 둥근 창 셋 (앞 · 위 · 옆). breached = 앞 창이 터져 검은 물 수염 · drain = 검은 물이 빠져 빈 속 */
function drawHelm(ctx, x, y, t, breached, eelK, drain) {
  const r = 27;
  // 목 받침 (어깨 쇠고리)
  ctx.beginPath(); ctx.ellipse(x - 4, y + 22, 30, 10, 0, 0, TAU); ink(ctx, fl(BRASS_D), 2.4, OUTL);
  // 통
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ink(ctx, fl(BRASS), 2.6, OUTL);
  if (!R.fl) {
    const g = ctx.createRadialGradient(x - 8, y - 10, 2, x, y, r);
    g.addColorStop(0, rgba(BRASS_H, 0.75)); g.addColorStop(0.5, rgba(BRASS, 0)); g.addColorStop(1, rgba(BRASS_D, 0.6));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    // 띠 · 징
    ctx.strokeStyle = BRASS_D; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r - 4, -PI * 0.15, PI * 1.15); ctx.stroke();
    ctx.fillStyle = BRASS_H; for (let i = 0; i < 9; i++) { const a = -PI * 0.15 + i * (PI * 1.3 / 8); ctx.beginPath(); ctx.arc(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), 1.8, 0, TAU); ctx.fill(); }
    // 위 창 · 옆 창
    for (const [wx, wy, wr] of [[x - 4, y - r + 4, 6], [x - 12, y + 2, 7]]) {
      ctx.fillStyle = IRON_D; ctx.beginPath(); ctx.arc(wx, wy, wr + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = drain > 0.5 ? '#141a1c' : rgba(TEAL, 0.55 + 0.15 * Math.sin(t * 2 + wx)); ctx.beginPath(); ctx.arc(wx, wy, wr, 0, TAU); ctx.fill();
    }
  }
  // 앞 창 (금 · 터짐)
  const wx = x + 20, wy = y + 2, wr = 11;
  ctx.beginPath(); ctx.arc(wx, wy, wr + 3, 0, TAU); ink(ctx, fl(IRON), 2.2, OUTL);
  if (R.fl) return;
  if (!breached) {
    ctx.fillStyle = rgba(TEAL, 0.7 + 0.2 * Math.sin(t * 2.4)); ctx.beginPath(); ctx.arc(wx, wy, wr, 0, TAU); ctx.fill();
    glow(ctx, wx, wy, 18, TEAL, 0.35);
    ctx.strokeStyle = rgba('#e8fff8', 0.7); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(wx - 7, wy - 6); ctx.lineTo(wx + 1, wy); ctx.lineTo(wx - 2, wy + 8); ctx.moveTo(wx + 1, wy); ctx.lineTo(wx + 8, wy - 3); ctx.stroke();
  } else {
    ctx.fillStyle = drain > 0.5 ? '#0c1012' : BLACKW; ctx.beginPath(); ctx.arc(wx, wy, wr, 0, TAU); ctx.fill();
    // 깨진 유리 이빨
    ctx.fillStyle = rgba('#cfefff', 0.6);
    for (let i = 0; i < 7; i++) { const a = i * TAU / 7 + 0.3; ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr); ctx.lineTo(wx + Math.cos(a + 0.2) * (wr - 5 - (i % 3) * 2), wy + Math.sin(a + 0.2) * (wr - 5 - (i % 3) * 2)); ctx.lineTo(wx + Math.cos(a + 0.45) * wr, wy + Math.sin(a + 0.45) * wr); ctx.fill(); }
    // 검은 물 수염 (빠지면 사라진다)
    if (drain < 1) {
      ctx.fillStyle = rgba(BLACKW, 0.9 * (1 - drain));
      for (let i = 0; i < 3; i++) { const L = 20 + 14 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7)); ctx.beginPath(); ctx.moveTo(wx - 6 + i * 6, wy + 6); ctx.quadraticCurveTo(wx - 4 + i * 6 + Math.sin(t * 3 + i) * 3, wy + 6 + L / 2, wx - 3 + i * 5, wy + 6 + L); ctx.lineTo(wx + i * 5, wy + 6 + L * 0.9); ctx.quadraticCurveTo(wx + i * 6, wy + 6 + L / 2, wx + 2 + i * 6, wy + 6); ctx.fill(); }
      ctx.fillStyle = rgba(TEAL, 0.5 * (1 - drain)); ctx.fillRect(wx - 2, wy + 8, 2, 10);
    }
  }
}
function drawEel(ctx, E, win, k, t, stunned) {
  ctx.save();
  ctx.globalAlpha *= clamp(k * 1.6, 0, 1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTL; ctx.lineWidth = 17;
  ctx.beginPath(); ctx.moveTo(win.x, win.y); for (const p of E) ctx.lineTo(p.x, p.y); ctx.stroke();
  ctx.strokeStyle = fl(SCALE); ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(win.x, win.y); for (const p of E) ctx.lineTo(p.x, p.y); ctx.stroke();
  if (!R.fl) {
    ctx.strokeStyle = rgba(SCALE_H, 0.6); ctx.lineWidth = 2;
    for (let j = 1; j < E.length; j++) { const p = E[j], q = E[j - 1]; ctx.beginPath(); ctx.arc((p.x + q.x) / 2, (p.y + q.y) / 2 - 2, 4, PI, TAU); ctx.stroke(); }
  }
  // 머리 (뾰족한 턱 · 청록 눈)
  const h = E[4], q = E[3], a = Math.atan2(h.y - q.y, h.x - q.x);
  ctx.translate(h.x, h.y); ctx.rotate(a);
  const open = stunned ? 0.2 : 0.35 + 0.25 * Math.sin(t * 5);
  ctx.beginPath(); ctx.moveTo(-8, -9); ctx.quadraticCurveTo(10, -10, 22, -2 - open * 6); ctx.lineTo(6, 0); ctx.lineTo(20, 4 + open * 8); ctx.quadraticCurveTo(8, 10, -8, 8); ctx.closePath();
  ink(ctx, fl(SCALE), 2.2, OUTL);
  if (!R.fl) {
    ctx.fillStyle = '#e8f0e8'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(8 + i * 3.5, -1 - open * 3); ctx.lineTo(9.5 + i * 3.5, 3); ctx.lineTo(11 + i * 3.5, -1 - open * 3); ctx.fill(); }
    glow(ctx, 2, -5, 8, TEAL_H, 0.8); ctx.fillStyle = TEAL_H; ctx.beginPath(); ctx.arc(2, -5, 2.2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
/** 공기 호스 (지역 좌표 — paintBody 안이면 front=true, paintBack 은 월드에서 직접) */
function drawHose(ctx, b, local) {
  const H = b.hose, f = b.facing, sx = local ? 1 : f;
  const X = (p) => (local ? p.x : b.zx + p.x * sx), Y = (p) => (local ? p.y : b.fy + p.y);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTL; ctx.lineWidth = 15;
  const path = () => { ctx.beginPath(); ctx.moveTo(X(H[0]), Y(H[0])); for (let j = 1; j < 7; j++) { const p = H[j - 1], q = H[j]; ctx.quadraticCurveTo(X(p), Y(p), (X(p) + X(q)) / 2, (Y(p) + Y(q)) / 2); } ctx.lineTo(X(H[6]), Y(H[6])); };
  path(); ctx.stroke();
  ctx.strokeStyle = fl(LEATHER); ctx.lineWidth = 11; path(); ctx.stroke();
  if (!R.fl) {
    ctx.strokeStyle = rgba(LEATHER_H, 0.7); ctx.lineWidth = 2;
    for (let j = 0; j < 6; j++) for (let s = 0; s < 3; s++) { const u = s / 3, p = H[j], q = H[j + 1], x = lerp(X(p), X(q), u), y = lerp(Y(p), Y(q), u); ctx.beginPath(); ctx.arc(x, y, 5.5, 0, PI); ctx.stroke(); }
    if (b.breached || b._whip) {   // 끊어진 끝 (검은 물이 샌다)
      const e = H[6]; ctx.fillStyle = BLACKW; ctx.beginPath(); ctx.arc(X(e), Y(e), 6, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(TEAL, 0.5); ctx.beginPath(); ctx.arc(X(e), Y(e), 3, 0, TAU); ctx.fill();
    } else if (b.ps.hoseK > 0.05) {   // 부푼 호스 마디 빛
      for (let j = 1; j < 6; j++) glow(ctx, X(H[j]), Y(H[j]), 10 + 8 * b.ps.hoseK, '#cfefff', 0.35 * b.ps.hoseK);
    }
  }
  ctx.restore();
}
function drawLamp(ctx, x, y, k, t, onFloor) {
  ctx.save();
  const sw = onFloor ? 0 : Math.sin(t * 2.3) * 0.25;
  ctx.translate(x, y); ctx.rotate(sw);
  ctx.strokeStyle = IRON_D; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(7, -2); ctx.lineTo(8, 14); ctx.lineTo(-8, 14); ctx.closePath(); ink(ctx, fl(IRON), 1.8, OUTL);
  if (!R.fl) {
    const fl2 = 0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 7);
    ctx.fillStyle = mix(LAMP, LAMP_H, k * fl2); ctx.fillRect(-5, 1, 10, 11);
    ctx.strokeStyle = IRON_D; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 12); ctx.moveTo(-5, 6); ctx.lineTo(5, 6); ctx.stroke();
    glow(ctx, 0, 7, 22 + 26 * k, LAMP, (0.45 + 0.4 * k) * fl2, true);
  }
  ctx.restore();
}
/** T자 수문 열쇠: 손(T 손잡이) → 끝(네모 소켓 머리) */
function drawKey(ctx, hx, hy, ex, ey, stuck, t) {
  const a = Math.atan2(ey - hy, ex - hx), nx = -Math.sin(a), ny = Math.cos(a);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTL; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(hx - Math.cos(a) * 8, hy - Math.sin(a) * 8); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = fl(IRON); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(hx - Math.cos(a) * 8, hy - Math.sin(a) * 8); ctx.lineTo(ex, ey); ctx.stroke();
  if (!R.fl) { ctx.strokeStyle = rgba(IRON_H, 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + nx * 2, hy + ny * 2); ctx.lineTo(ex + nx * 2, ey + ny * 2); ctx.stroke(); }
  // T 손잡이 (손 뒤로 가로대)
  const tx = hx - Math.cos(a) * 10, ty = hy - Math.sin(a) * 10;
  ctx.strokeStyle = OUTL; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(tx + nx * 22, ty + ny * 22); ctx.lineTo(tx - nx * 22, ty - ny * 22); ctx.stroke();
  ctx.strokeStyle = fl(BRASS); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(tx + nx * 22, ty + ny * 22); ctx.lineTo(tx - nx * 22, ty - ny * 22); ctx.stroke();
  // 네모 소켓 머리
  ctx.translate(ex, ey); ctx.rotate(a);
  ctx.beginPath(); ctx.rect(-14, -11, 22, 22); ink(ctx, fl(stuck ? BRASS : IRON), 2.4, OUTL);
  if (!R.fl) { ctx.fillStyle = IRON_D; ctx.fillRect(0, -5, 8, 10); ctx.fillStyle = rgba(BRASS_H, 0.5); ctx.fillRect(-12, -9, 18, 3); if (stuck) glow(ctx, 0, 0, 22, BRASS_H, 0.4 + 0.2 * Math.sin(t * 12)); }
  ctx.restore();
}
function drawAnchor(ctx, x, y, rot, s, far) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUTL; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, 18); ctx.moveTo(-18, 6); ctx.quadraticCurveTo(0, 30, 18, 6); ctx.moveTo(-10, -14); ctx.lineTo(10, -14); ctx.stroke();
  ctx.strokeStyle = fl(far ? IRON_D : IRON); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, 18); ctx.moveTo(-18, 6); ctx.quadraticCurveTo(0, 30, 18, 6); ctx.moveTo(-10, -14); ctx.lineTo(10, -14); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -28, 5, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = fl(IRON_H); ctx.stroke();
  ctx.restore();
}
function drawAnchorW(ctx, x, y, dir) { drawAnchor(ctx, x, y - 14, dir > 0 ? -PI / 2 : PI / 2, 1.2, false); }
function drawChain(ctx, x0, y0, x1, y1, t) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.floor(d / 11)), sag = Math.min(40, d * 0.08);
  ctx.save(); ctx.strokeStyle = fl(IRON_H); ctx.lineWidth = 2.6;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = lerp(x0, x1, u), y = lerp(y0, y1, u) + Math.sin(u * PI) * sag;
    ctx.beginPath(); ctx.ellipse(x, y, 5.5, 3.2, Math.atan2(y1 - y0, x1 - x0) + (i % 2 ? PI / 2 : 0), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
/** 수문 바퀴 (뒤 소품): 쇠 테 · 바큇살 여덟 · 가운데 소켓 */
function drawWheel(ctx, x, y, r, a, closeK, t) {
  ctx.save();
  ctx.translate(x, y);
  // 수문 틀 (어두운 쇠판)
  ctx.fillStyle = 'rgba(8,16,18,0.55)'; ctx.beginPath(); ctx.arc(0, 0, r + 16, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(30,40,42,0.7)'; ctx.fillRect(-10, r + 4, 20, 34);   // 축 받침
  ctx.fillStyle = rgba(BLACKW, 0.7 * (1 - closeK)); ctx.fillRect(-r * 0.6, r + 18, r * 1.2, 20);   // 틈으로 새는 검은 물 (닫히면 멈춘다)
  ctx.rotate(a);
  ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#4a3e34'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 6; ctx.strokeStyle = '#3a3028';
  for (let i = 0; i < 8; i++) { const b = i * TAU / 8; ctx.beginPath(); ctx.moveTo(Math.cos(b) * 14, Math.sin(b) * 14); ctx.lineTo(Math.cos(b) * (r - 4), Math.sin(b) * (r - 4)); ctx.stroke(); }
  ctx.fillStyle = '#5a4a38'; for (let i = 0; i < 8; i++) { const b = i * TAU / 8 + TAU / 16; ctx.beginPath(); ctx.arc(Math.cos(b) * r, Math.sin(b) * r, 5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = '#2a2420'; ctx.fillRect(-12, -12, 24, 24); ctx.fillStyle = '#0a0806'; ctx.fillRect(-6, -6, 12, 12);
  ctx.restore();
  if (closeK >= 1) glow(ctx, x, y, r * 0.8, LAMP, 0.08 + 0.04 * Math.sin(t * 2));
}
function drawBlackPool(ctx, x, fy, rx, f, t) {
  if (f <= 0) return;
  ctx.save(); ctx.globalAlpha *= clamp(f, 0, 1);
  ctx.fillStyle = BLACKW; ctx.beginPath(); ctx.ellipse(x, fy - 2, rx, 9, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(TEAL, 0.5); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(x + Math.sin(t) * 6, fy - 3, rx * 0.6, 4, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}
function drawSplashWave(ctx, fx, fy, dir, h, f) {
  ctx.save(); ctx.globalAlpha *= clamp(f + 0.3, 0, 1);
  ctx.fillStyle = rgba(TEAL, 0.55);
  ctx.beginPath(); ctx.moveTo(fx - dir * 60, fy); ctx.quadraticCurveTo(fx - dir * 10, fy - h * 1.4, fx + dir * 20, fy); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba('#e8fff8', 0.6); ctx.beginPath(); ctx.moveTo(fx - dir * 30, fy - h * 0.5); ctx.quadraticCurveTo(fx, fy - h * 1.2, fx + dir * 14, fy - 2); ctx.lineTo(fx - dir * 6, fy - h * 0.4); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBubble(ctx, x, y, r, t, a) {
  if (r <= 1 || a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(240,255,255,0.55)'); g.addColorStop(0.6, 'rgba(120,200,210,0.16)'); g.addColorStop(1, 'rgba(160,230,240,0.5)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * (1 + 0.05 * Math.sin(t * 7)), r * (1 - 0.05 * Math.sin(t * 7)), 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(220,250,255,0.75)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.18, r * 0.1, -0.6, 0, TAU); ctx.fill();
  ctx.restore();
}
/** 벽 틈에서 새는 물 (예고): dir = 경기장 안쪽 */
function drawLeak(ctx, x, y, dir, k, t) {
  ctx.save(); ctx.globalAlpha *= clamp(k, 0, 1);
  ctx.fillStyle = rgba(TEAL_H, 0.7);
  for (let i = 0; i < 4; i++) { const u = (t * 2.4 + i * 0.25) % 1, dx = dir * (8 + 40 * u * k), dy = 30 * u * u; ctx.beginPath(); ctx.ellipse(x + dx, y - 10 + i * 6 + dy, 3, 5, 0, 0, TAU); ctx.fill(); }
  glowE(ctx, x + dir * 10, y, 22, 26, TEAL, 0.5 * k);
  ctx.restore();
}
function drawJet(ctx, x0, x1, y, h, a, t) {
  const f = a < 0.15 ? a / 0.15 : a > 0.85 ? (1 - a) / 0.15 : 1;
  ctx.save(); ctx.globalAlpha *= f;
  ctx.fillStyle = rgba(TEAL, 0.55); ctx.fillRect(x0, y + 2, x1 - x0, h - 4);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#e8fff8', 0.5); ctx.fillRect(x0, y + h * 0.35, x1 - x0, h * 0.3);
  ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { const yy = y + 4 + (h - 8) * (i / 4); ctx.beginPath(); for (let x = x0; x <= x1; x += 40) { const w = Math.sin(x * 0.03 - t * 18 + i) * 3; if (x === x0) ctx.moveTo(x, yy + w); else ctx.lineTo(x, yy + w); } ctx.stroke(); }
  ctx.restore();
}
/** 검은 장어 기둥 (솟음 · 가라앉음) */
function drawEelPillar(ctx, x, fy, h, f, ph) {
  if (h <= 2 || f <= 0) return;
  ctx.save(); ctx.globalAlpha *= clamp(f, 0, 1);
  ctx.lineCap = 'round';
  const pts = []; for (let i = 0; i <= 6; i++) { const u = i / 6; pts.push([x + Math.sin(u * 5 + ph) * 10 * (1 - u * 0.3), fy - h * u]); }
  ctx.strokeStyle = OUTL; ctx.lineWidth = 26; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
  ctx.strokeStyle = SCALE; ctx.lineWidth = 20; ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
  ctx.strokeStyle = rgba(SCALE_H, 0.55); ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) { const [px, py] = pts[i]; ctx.beginPath(); ctx.arc(px, py, 7, PI * 0.1, PI * 0.9); ctx.stroke(); }
  const [hx, hy] = pts[6];
  ctx.beginPath(); ctx.moveTo(hx - 12, hy + 6); ctx.quadraticCurveTo(hx - 4, hy - 26, hx + 10, hy - 30); ctx.lineTo(hx + 4, hy - 8); ctx.lineTo(hx + 14, hy - 18); ctx.quadraticCurveTo(hx + 12, hy, hx + 10, hy + 6); ctx.closePath();
  ink(ctx, SCALE, 2, OUTL);
  glow(ctx, hx + 2, hy - 14, 7, TEAL_H, 0.9);
  drawBlackPool(ctx, x, fy, 34, 1, ph);
  ctx.restore();
}
/** 역류 물띠 (경기장 바닥, 보스 쪽으로 흐르는 물결) */
function drawTide(ctx, x0, x1, fy, h, f, t, bx) {
  if (h <= 0.5 || f <= 0) return;
  ctx.save(); ctx.globalAlpha *= clamp(f, 0, 1);
  ctx.fillStyle = rgba(BLACKW, 0.75); ctx.fillRect(x0, fy - h, x1 - x0, h);
  ctx.strokeStyle = rgba(TEAL, 0.6); ctx.lineWidth = 2;
  ctx.beginPath(); for (let x = x0; x <= x1; x += 24) { const yy = fy - h + Math.sin(x * 0.04 + t * 5) * 3; if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke();
  ctx.strokeStyle = rgba(TEAL_H, 0.45); ctx.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) { const u = ((i / 10) + t * 0.35) % 1, xl = lerp(x0, bx, u), xr = lerp(x1, bx, u), yy = fy - h * 0.4 - (i % 3) * 5; ctx.beginPath(); ctx.moveTo(xl, yy); ctx.lineTo(xl + 14 * Math.sign(bx - xl), yy); ctx.moveTo(xr, yy); ctx.lineTo(xr + 14 * Math.sign(bx - xr), yy); ctx.stroke(); }
  ctx.restore();
}
/** 호스 채찍 부채꼴 예고: 뿌리 (x, y) → 끝점들 */
function drawFan(ctx, x, y, ends, k, t) {
  ctx.save();
  ctx.fillStyle = rgba(TEAL_H, 0.12 + 0.16 * k);
  ctx.beginPath(); ctx.moveTo(x, y); for (const [ex, ey] of ends) ctx.lineTo(ex, ey); ctx.closePath(); ctx.fill();
  for (const [ex, ey] of ends) warnLine(ctx, x, y, ex, ey, k, TEAL_H, 2 + 2 * k);
  ctx.restore();
  void t;
}

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
