// 보스 b_bride — 엘제베트 / 시든 신부 (s24 외전 「시드는 장미」) — docs/specs/ex_s24.md §2. 소유: EX4-BOSS
// BossC(c_common.js) 상속. 두 모습·전환·15% 강제는 e_hagen.js(moonrise · 고친 뒤의 check15: 다음 틱에 하던 패턴을 끊는다), 소환은 spawnMinion,
// 판정은 c_common 키트. 새로 쓰는 것은 회복(goblet)과 잔상(lastDance) 둘뿐.
// 그림은 벡터(2부 기준 디테일, 채색이 없거나 실패해도 모든 상태가 그려진다); 채색 퍼핏(render/painted/bosses/b_bride.js)은 이 논리를 읽기만 한다.
//
// 모습: 1페이즈 = 옆모습의 창백한 귀부인 (얼굴 쪽 = facing). 붉은 장미 관을 얹은 검은 레이스 베일, 몸에 붙는 진홍·검정 드레스와 긴 끌자락,
//   금빛 성배(가까운 손 = 왼손), 장미 가시 덩굴 채찍(먼 손 = 오른손). 다리는 치마 속 — 미끄러지듯 걷는다.
//   2페이즈 = 같은 드레스가 넝마가 된 바싹 마른 노파: 금 간 도자기 같은 얼굴, 하얗게 센 긴 머리채, 긴 손톱, 발 대신 넝마 자락 셋이 흩날리며 반 칸 떠 있다.
//   50% 전환(wither)에서 베일이 타고 얼굴에 금이 번져 노파가 된다 (form2 '시든 신부').
// 판정 부위 (가까운 부위 우선, defMul = 방어 배율 — 작을수록 아프다): 1페이즈 머리(베일) 0.9 · 몸통 1.0 · 드레스 자락 1.15 · 성배(잔을 든 동안만, 맞으면 끊김).
//   2페이즈 머리(금 간 얼굴) 0.8 — 노릴 곳 · 몸통 1.0 · 넝마 자락 1.2. 무릎(stagger) 몸통 0.7 · 머리 0.6 (15% 긴 무릎 몸통 0.6) · 세월 흡수 노출 몸통 0.7.
//   박쥐로 흩어진 동안(왈츠)·사망 중에는 판정 없음 (ghost).
// 패턴 (static PATTERNS — docs/specs/ex_s24.md §2.1): waltz(피의 왈츠, 카운터 창) · thornLash(가시 채찍) · roseBloom(핏빛 장미) · brides(신부들의 부름) ·
//   goblet(회춘의 잔 — 85% 이하 · 성공 < 2, 성배 한 대·몸통 3% 로 끊김, 회복 4% · 2페이즈는 49.9% 까지) · crimsonBath(피의 욕조) · drain(세월 흡수) ·
//   lastDance(마지막 왈츠 — 젊은 날의 잔상 · 카운터 창) · 보조 stagger(무릎).
//   창 상한(POLISH-4, DANCE_CAP · STAG_CAP · takeHit): 1페이즈 왈츠 한 번 15% · 무릎 한 번 10% 까지만 잃는다. 수호신 자동 공격은 성배를 깨지 않는다(몸통으로 센다).
//   전환 wither (1: 무적 2.4초, 0.4초 베일이 탄다 → 1.0초 얼굴에 금·흰머리 → 2.0초 노파 (판정 84×150, 아래 끝 A.floor − 24, 발 x 그대로) →
//   대사 b_bride_wither → 곧바로 crimsonBath). 15% 이하 한 번: 다음 틱에 하던 패턴을 끊고 goblet (스토리·처음이면 대사 b_bride_last → 카밀라가
//   성배를 깨고 2.5초 긴 무릎, 아케이드·다시 볼 때는 보통 회춘의 잔).
// 모든 패턴은 this.A(경기장 경계)와 A.floor 만 기준으로 움직인다 (투기장 maps/arena.js r1 · 무한의 탑 보스 층도 같다). 방 기믹 없음.
//   왈츠 두 가지만 플레이어가 선 발판에 내려앉을 수 있다 (A.floor 아래로는 가지 않는다); 그 뒤 걷다가 발판 끝을 넘으면 떨어진다.
// this.inferno(회차·악몽/지옥)는 쓰지 않는다 — 세기는 stage.level · diff 한 길로만 (ngplus.md §3.1).
// 결말 (체력 0): 보스 처치 처리(world.onBossDefeated)는 같고 부제도 기본 '격파!' (악역). 쓰러질 때는 언제나 노파 모습 — 50% 를 한 방에 넘겨 쓰러뜨려도
//   onDeath 가 world.onBossDefeated 보다 먼저 form2 를 적용하므로 배너 이름이 처음부터 '시든 신부' 다 (renameBanner 는 다른 배너가 옛 이름을 쓴 경우의 안전망).
//   스토리: 무릎을 꿇은 자세 그대로 남는다 (b_bride_post 가 바스러짐을 말한다) · 아케이드: 무릎 1.2초 → 시든 꽃잎으로 바스러져 3.0초에 사라진다 (파편 폭발 없음).
// 채색 렌더러가 읽는 필드: zx, fy (발) · fk (좌우 −1..1, 연속 — 왈츠 회전 중에는 cos) · facing · crone · morph (0 귀부인 → 1 노파) · hov (그림 뜬 높이) ·
//   ps {…} · pts (골격, rig()) · vine (채찍 점 9) · train (끌자락 점 7) · veil (베일 점 5) · rags (넝마 자락 3×5) · hair (머리채 2×5) · gobletUp · gobBreakT ·
//   burnK · crackK · ghost · stunned · exposed · cWin · spinT · dieT · vanishK · state · t · flashT · hitPart · A
// 컬링: 펼친 채찍(8칸)·끌자락이 몸통 판정보다 크므로 하겐과 같은 ArtCull 대리 개체가 artBounds() 로 그린다.
import { BossC, telegraph, strikeRect, strikeColumn, strikeCircle, pullField, warnMark, spawnMinion, minionsAlive, screenTint, prewarmTint, phaseScript, canShowScript } from './c_common.js';
import { PI, R, LG, ink, glow, glowE, glowSprite, warnFloor, warnRect, impact } from './b_common.js';
import { Entity } from '../entity.js';
import { TILE } from '../../core/game.js';
import { T as TT } from '../../core/physics.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';
import { registerPainted, hasPainted, paintedDraw, paintedRig, paintedEnabled } from '../../render/painted/registry.js';   // 채색 퍼핏 등록 (그리기 전용)
import { bosses as EXB } from '../../render/painted/reg/ex-boss.js';

// ── 색 (docs/specs/ex_s24.md §2: 진홍 · 장미 · 금 · 상아 · 검정 · 잿빛) ──
const CRIM = '#c0143a', ROSE = '#ff6a8a', GOLD = '#e8c872', IVORY = '#f2e6dc', BLACK = '#140a10', ASH = '#e8e4ea';
const CRIM_D = '#5a0818', CRIM_H = '#e8405e', LACE = '#2a1220', VINE = '#3a4420', VINE_D = '#1c240e', THORN = '#d8c8a0', BLOOD = '#8a0a1a';
const SKIN = '#f4e8e2', SKIN_D = '#c4aeb0', CRONE = '#d6cabc', CRONE_D = '#8a7a70', HAIR = '#1a1016', WHITE = '#efeaf2', RAG = '#4a1420', RAG_D = '#24080e', GOLD_D = '#8a6a2a';
// ── 패턴 계약 (docs/specs/ex_s24.md §2.1 — 클래스의 static PATTERNS 가 c_common P2_PATTERNS 보다 이긴다) ──
const PATTERNS = {
  attacks: ['waltz', 'thornLash', 'roseBloom', 'brides', 'goblet', 'crimsonBath', 'drain', 'lastDance'],
  helpers: ['stagger'],
  // applyAt 2.0/2.4 = 전환 2.0초 (노파 모습 · form2 이름·초상화 교체)
  transitions: { 1: { state: 'wither', dur: 2.4, script: 'b_bride_wither', form2: true, force: 'crimsonBath', applyAt: 2.0 / 2.4 } },
  weights: [
    { waltz: 3, thornLash: 3, roseBloom: 3, brides: 1, goblet: 1 },
    { lastDance: 3, crimsonBath: 2, drain: 2, roseBloom: 2, thornLash: 2, goblet: 1, brides: 1 },
  ],
  gimmicks: [],
  floorRow: 16,
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7]] },   // s21–s23 boss 방과 같은 뼈대
};
const T48 = () => TILE || 48;
const SIZE_L = { w: 64, h: 150 }, SIZE_C = { w: 84, h: 150 }, HOV = 24;   // 귀부인 · 노파 판정 크기 (발 x 고정) · 노파 판정 아래 끝 = 디딤면 − 24
const HEAL = 0.04, HEAL_AT = 0.85, HEAL_MAX = 2, BREAK_DMG = 0.03, EXPOSE_DMG = 0.05;   // 회춘의 잔 (§2.1)
// 창 상한 (페이즈별 [1페이즈], 최대 체력 비 — POLISH-4, docs/specs/ex_s24.md §10): 왈츠 한 번(세 걸음 · 무릎 인사) 15% · 무릎 한 번 10% 까지만 잃는다 (2페이즈 · 15% 긴 무릎은 상한 없음).
//   닿으면 남는 피해는 버리고('저항' 숫자), 무릎이면 곧바로 일어선다. 강한 영웅만 닿는다 — 첫 왈츠(26–35%) + 카운터 무릎(22–31%)이 1페이즈를 한 번에 끝내던 것
const DANCE_CAP = [0.15], STAG_CAP = [0.10];
// ── 몸 지역 좌표 (+x = 얼굴 쪽, y 아래가 양수, 원점 = 발 가운데 바닥) ──
const TORSO = 34, TORSO_C = 44, UA = 24, FA = 23, VINE_N = 8, TRAIN_N = 6, STRAND_N = 4;   // 몸통(허리→목) 귀부인 · 노파 — 채색 부품(full_a lps 0.06 · crone_a lps 0.07)의 비례
const POSE0 = { lean: 0, bow: 0, kneel: 0, hunch: 0, flare: 0, sway: 0, rise: 0, veil: 0 };
const POSE_RATE = { lean: 8, bow: 7, kneel: 7, hunch: 3, flare: 6, sway: 3, rise: 5, veil: 6 };
/** 팔 자세 (각 = 몸 지역: 0 앞, π/2 아래). n = 가까운 팔(성배), f = 먼 팔(채찍) */
const ARM = {
  idle: { n1: 1.3, n2: -1.15, f1: 1.55, f2: -0.15 },
  waltz: { n1: 0.25, n2: -0.45, f1: 2.7, f2: 0.35 },
  lashWind: { n1: 1.2, n2: -1.1, f1: -2.3, f2: -0.4 },
  lash: { n1: 1.3, n2: -1.0, f1: 0.05, f2: 0.05 },
  throwWind: { n1: 1.2, n2: -1.1, f1: 2.9, f2: -0.6 },
  throw: { n1: 1.25, n2: -1.1, f1: -0.45, f2: 0.15 },
  raise: { n1: -1.48, n2: -0.08, f1: 1.6, f2: -0.2 },
  drink: { n1: -0.35, n2: -2.25, f1: 1.6, f2: -0.2 },
  unveil: { n1: -1.05, n2: -1.5, f1: -1.15, f2: -1.35 },
  spread: { n1: -0.45, n2: 0.1, f1: -2.75, f2: -0.1 },
  curtsey: { n1: 0.95, n2: 0.25, f1: 1.95, f2: 0.2 },
  limp: { n1: 1.5, n2: 0.15, f1: 1.62, f2: 0.1 },
  clutch: { n1: -1.25, n2: -2.15, f1: -1.05, f2: -2.25 },
  claw: { n1: 0.15, n2: 0.35, f1: 2.85, f2: 0.4 },
};
const pt = () => ({ x: 0, y: 0 });
const pts = (n) => Array.from({ length: n }, pt);
const rot = (x, y, a, out) => { const c = Math.cos(a), s = Math.sin(a); out.x = x * c - y * s; out.y = x * s + y * c; return out; };
let GHOST = null;   // 젊은 날의 잔상 실루엣 (귀부인 자세 하나를 한 번 구운 비트맵 — 페이지마다 한 번)

export class Bride extends BossC {
  static get PATTERNS() { return PATTERNS; }

  setup() {
    // 채색 퍼핏: 모음(reg/index.js)에 ex-boss 줄이 아직 없으면 여기서 한 번 등록 (이미 있으면 아무것도 안 함)
    if (!hasPainted?.('b_bride') && EXB?.b_bride) registerPainted?.('b_bride', { kind: 'boss', importer: EXB.b_bride });
    const A = this.A;
    this.noGravity = true; this.vx = 0; this.vy = 0;
    this.zx = clamp(this.cx, A.x0 + 90, Math.max(A.x0 + 90, A.x1 - 90)); this.fy = A.floor; this.vfy = 0;
    const p0 = this.P;
    this.facing = this.fk = p0 && p0.cx < this.zx ? -1 : 1;
    this.tzx = this.zx; this.spd = 0; this.walkK = 0; this.lp = null; this.spinT = -9; this.hov = 0;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    this.arm = { ...ARM.idle }; this.armT = { ...ARM.idle }; this.armRate = 12;
    this.pts = { hip: pt(), neck: pt(), head: pt(), eye: pt(), mouth: pt(), shN: pt(), shF: pt(), elN: pt(), elF: pt(), hdN: pt(), hdF: pt(), gob: pt(), hemF: pt(), hemB: pt(), tA: 0, hA: 0 };
    this.vine = pts(VINE_N + 1); this.vineMode = 'coil'; this.lashK = 0; this.lashY = -40; this.vineGlow = 0;
    this.train = pts(TRAIN_N + 1); this.trainLag = 0;
    this.veil = pts(STRAND_N + 1);
    this.rags = [pts(STRAND_N + 1), pts(STRAND_N + 1), pts(STRAND_N + 1)];
    this.hair = [pts(STRAND_N + 1), pts(STRAND_N + 1)];
    this.crone = false; this.morph = 0; this.morphT = -1; this.burnK = 0; this.crackK = 0; this.burnT = -1; this.crackT = -1;
    this.ghost = false; this.stunned = false; this.stagLong = false; this.exposed = false; this.cWin = false; this.dexp = 0; this.capHp = null; this.wakeT = 9;
    this.gobletUp = false; this.gobAcc = 0; this.gobBreakT = -9; this.heals = 0; this._lastMode = false; this._lastEnd = false; this._gobForce = false;
    this._forced15 = false; this._gobNow = false; this._breakNow = false; this._stagNow = false; this._bn = null;
    this.dieT = 0; this.vanishK = 0; this.petalAcc = 0;
    this.wz = this.ld = this.bathZ = this.pullZ = null;
    this.pHead = { x: 0, y: 0, w: 30, h: 30, defMul: 0.9 };
    this.pBody = { x: 0, y: 0, w: 34, h: 46, defMul: 1.0 };
    this.pSkirt = { x: 0, y: 0, w: 58, h: 70, defMul: 1.15 };
    this.pGob = { x: 0, y: 0, w: 44, h: 44, defMul: 1.0, goblet: true };
    this.cBody = { x: 0, y: 0, w: 36, h: 110 };
    this._hp = []; this._cp = []; this._pt = { x: 0, y: 0 }; this._r = { x: 0, y: 0 };
    this.fxAcc = 0;
    // 싸움 중 새 캔버스 0 (MASTER_PLAN §5.2): 쓰는 발광 색은 등장 때 굽는다 · 잔상 실루엣도 지금 한 번
    for (const c of [ROSE, CRIM, GOLD, '#ffffff', ASH, '#ffe0a0']) { glowSprite(c, false); glowSprite(c, true); }
    prewarmTint([ROSE, ASH]);
    this.motion(0, this.world);
    bakeGhost(this);
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; this.pt.hunch = this.crone ? 1 : 0; this.arms('idle'); }
  arms(name, rate = 12) { Object.assign(this.armT, ARM[name] ?? ARM.idle); this.armRate = rate; }
  faceP(th = 40) { const p = this.P; if (p) { const d = p.cx - this.zx; if (Math.abs(d) > th) this.facing = Math.sign(d); } }
  /** 몸 지역 → 월드 (좌우 fk) */
  toWorld(lx, ly, out = this._pt) { out.x = this.zx + this.fk * lx; out.y = this.fy + ly; return out; }
  /** 판정 사각형의 뜬 높이: 노파 24 + 욕조에서 떠오른 1칸 */
  boxHov() { return (this.crone ? HOV : 0) + T48() * this.ps.rise; }
  place() { const h = this.boxHov(); this.x = this.zx - this.w / 2; this.y = this.fy - h - this.h; this.vx = 0; this.vy = 0; }
  hpK() { return this.stats?.maxHp ? this.hp / this.stats.maxHp : 1; }
  /** x 에서 y0 이하(같거나 아래)의 첫 디딤면 (바닥·발판) — 없으면 A.floor. A.floor 아래로는 가지 않는다 (e_hagen.js 와 같다) */
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
  /** 왈츠 착지점: 플레이어 x ±jit (경기장 안), 플레이어가 선 디딤면 (발판이면 그 발판, 아니면 A.floor) */
  landing(jit = 48) {
    const A = this.A, p = this.P;
    const tx = clamp((p ? p.cx : A.cx) + rand(-1, 1) * jit, A.x0 + 50, A.x1 - 50);
    const ty = p ? this.surface(tx, Math.min(A.floor, p.bottom - 6)) : A.floor;
    return { tx, ty: Math.min(A.floor, ty) };
  }

  /** 골격 (몸 지역 좌표): 허리 · 목 · 머리 · 어깨 · 팔꿈치 · 손 · 성배 · 치마 단. 그리기·판정·채색이 같이 쓴다 */
  rig() {
    const s = this.ps, P = this.pts, a = this.arm, t = this.t, hov = this.hov;
    const hn = clamp(s.hunch, 0, 1), kn = clamp(s.kneel, 0, 1), bw = clamp(s.bow, 0, 1);
    P.hip.x = -2 * hn - 3 * kn - 4 * bw; P.hip.y = -86 + 9 * hn + 30 * kn + 12 * bw - hov + Math.sin(t * 1.7) * 1.2 * s.sway;
    const ta = 0.04 + 0.2 * s.lean + 0.3 * hn + 0.45 * bw + 0.18 * kn + Math.sin(t * 1.3) * 0.015 + Math.sin(t * 2.1) * 0.05 * s.sway;
    P.tA = ta;
    const tl = lerp(TORSO, TORSO_C, hn);
    P.neck.x = P.hip.x + Math.sin(ta) * tl; P.neck.y = P.hip.y - Math.cos(ta) * tl;
    const ha = ta * 0.45 + 0.35 * hn - 0.25 * bw - 0.12 * s.lean;
    P.hA = ha;
    const q = this._r;
    rot(3, -11, ha, q); P.head.x = P.neck.x + q.x; P.head.y = P.neck.y + q.y;
    rot(6, -2, ha, q); P.eye.x = P.head.x + q.x; P.eye.y = P.head.y + q.y;
    rot(8, 5, ha, q); P.mouth.x = P.head.x + q.x; P.mouth.y = P.head.y + q.y;
    P.shN.x = lerp(P.hip.x, P.neck.x, 0.86) + 1; P.shN.y = lerp(P.hip.y, P.neck.y, 0.86) + 1;
    P.shF.x = P.shN.x - 6; P.shF.y = P.shN.y - 1;
    const ua = UA + 3 * hn, fa = FA + 4 * hn;
    const arm = (S, E, H, a1, a2) => { E.x = S.x + Math.cos(a1) * ua; E.y = S.y + Math.sin(a1) * ua; H.x = E.x + Math.cos(a1 + a2) * fa; H.y = E.y + Math.sin(a1 + a2) * fa; };
    arm(P.shN, P.elN, P.hdN, a.n1, a.n2);
    arm(P.shF, P.elF, P.hdF, a.f1, a.f2);
    P.gob.x = P.hdN.x + 1; P.gob.y = P.hdN.y - 13;   // 성배는 늘 똑바로 (잔 가운데)
    // 치마 단 (귀부인): 펄럭임 flare · 무릎 · 인사에 따라 앞뒤로 퍼진다. 노파는 넝마 자락이 대신한다
    P.hemF.x = 20 + 14 * s.flare + 10 * kn + 8 * bw; P.hemF.y = -hov;
    P.hemB.x = -26 - 18 * s.flare - 14 * kn - 6 * bw; P.hemB.y = -hov;
  }
  /** 늘어진 것들 (dt 로 부드럽게): 채찍 · 끌자락 · 베일 · 넝마 자락 · 머리채 */
  rigStrands(dt) {
    const P = this.pts, t = this.t, k = dt > 0 ? 1 - Math.exp(-22 * dt) : 1, hov = this.hov;
    // 채찍 (먼 손에서): coil = 손 아래로 늘어진 덩굴 · raised = 뒤 위로 감아 올림 · lash = 8칸 앞 띠까지 뻗음
    const V = this.vine, H = P.hdF, tg = this._vt ??= pt();
    const len = 8 * T48() * this.lashK;
    for (let i = 0; i <= VINE_N; i++) {
      const u = i / VINE_N;
      if (this.vineMode === 'lash') {
        const ex = H.x + Math.max(30, len), ey = this.lashY;
        tg.x = lerp(H.x, ex, u); tg.y = lerp(H.y, ey, Math.min(1, u * 1.6)) + Math.sin(u * PI * 3 - t * 40) * 6 * (1 - u) * this.lashK;
      } else if (this.vineMode === 'raised') {
        tg.x = H.x - i * 9; tg.y = H.y - Math.sin(u * PI) * 22 - i * 3 + Math.sin(t * 9 + i) * 1.5;
      } else {
        tg.x = H.x - 2 + Math.sin(i * 0.8 + t * 1.6) * 2.5 - i * 0.8; tg.y = H.y + i * 5.2 - Math.max(0, i - 5) * 3.5;
      }
      if (i === 0) { V[0].x = H.x; V[0].y = H.y; continue; }
      V[i].x += (tg.x - V[i].x) * k; V[i].y += (tg.y - V[i].y) * k;
    }
    // 끌자락: 치마 뒷단에서 바닥을 따라 뒤로 (움직임 반대쪽으로 끌린다)
    const Tr = this.train, f = this.ps.flare, kn = clamp(this.ps.kneel, 0, 1);
    for (let i = 0; i <= TRAIN_N; i++) {
      const u = i / TRAIN_N;
      const x = P.hemB.x + 6 - i * (15 + 5 * f + 3 * kn) + this.trainLag * u * u;
      const y = -hov - 1 - Math.sin(u * PI) * 2 - Math.max(0, u - 0.7) * 6 * f + Math.sin(t * 2 - i) * 0.8;
      if (dt <= 0) { Tr[i].x = x; Tr[i].y = y; } else { Tr[i].x += (x - Tr[i].x) * k * 0.6; Tr[i].y += (y - Tr[i].y) * k * 0.6; }
    }
    // 베일 (머리 뒤 → 등으로)
    const q = this._r, Vl = this.veil, vu = clamp(this.ps.veil, 0, 1);
    rot(-6, -7, P.hA, q);
    const vx = P.head.x + q.x, vy = P.head.y + q.y;
    for (let i = 0; i <= STRAND_N; i++) {
      const x = vx - 3 - i * (4 + 3 * f) + Math.sin(t * 1.8 - i * 0.7) * i * 0.8 + vu * i * 7, y = vy + i * (14 - 18 * vu) - vu * i * 2;
      if (dt <= 0 || i === 0) { Vl[i].x = x; Vl[i].y = y; } else { Vl[i].x += (x - Vl[i].x) * k; Vl[i].y += (y - Vl[i].y) * k; }
    }
    // 넝마 자락 셋 (노파: 허리에서 아래로, 발 대신 흩날린다)
    for (let r = 0; r < 3; r++) {
      const S = this.rags[r], rx = P.hip.x - 8 + r * 8, ry = P.hip.y + 16, L = 15 + r * 1.5;
      for (let i = 0; i <= STRAND_N; i++) {
        const x = rx - i * (2.5 + r) + Math.sin(t * 4.2 + r * 1.7 - i * 0.6) * i * 1.8 - this.walkK * i * 3, y = ry + i * L;
        if (dt <= 0 || i === 0) { S[i].x = x; S[i].y = y; } else { S[i].x += (x - S[i].x) * k; S[i].y += (y - S[i].y) * k; }
      }
    }
    // 흰 머리채 둘 (노파: 머리 뒤에서 등으로)
    rot(-7, -3, P.hA, q);
    for (let h = 0; h < 2; h++) {
      const S = this.hair[h], hx = P.head.x + q.x + h * 3, hy = P.head.y + q.y;
      for (let i = 0; i <= STRAND_N; i++) {
        const x = hx - i * (3 + h * 2) - Math.sin(t * 2.3 + h - i * 0.8) * i * 1.2, y = hy + i * (12 - h);
        if (dt <= 0 || i === 0) { S[i].x = x; S[i].y = y; } else { S[i].x += (x - S[i].x) * k; S[i].y += (y - S[i].y) * k; }
      }
    }
  }
  /** 판정 부위를 월드 좌표로 (그리기와 같은 골격) */
  syncParts() {
    const W = this._pt, P = this.pts, c = this.crone;
    this.toWorld(P.head.x + 1, P.head.y - 2, W);
    const ph = this.pHead, hs = c ? 34 : 30; ph.w = ph.h = hs; ph.x = W.x - hs / 2; ph.y = W.y - hs / 2; ph.defMul = this.stunned ? 0.6 : c ? 0.8 : 0.9;
    this.toWorld((P.hip.x + P.neck.x) / 2, (P.hip.y + P.neck.y) / 2, W);
    const pb = this.pBody, bwid = c ? 40 : 34; pb.w = bwid; pb.h = 46; pb.x = W.x - bwid / 2; pb.y = W.y - 23;
    pb.defMul = this.stunned ? (this.stagLong ? 0.6 : 0.7) : this.exposed ? 0.7 : 1.0;
    const bot = this.fy - this.boxHov();
    this.cBody.w = bwid; this.cBody.x = W.x - bwid / 2; this.cBody.y = W.y - 23; this.cBody.h = Math.max(40, bot - this.cBody.y);
    this.toWorld(P.hip.x - 4, 0, W);
    const sk = this.pSkirt, sy = this.fy + P.hip.y + 10;
    sk.w = c ? 60 : 58; sk.x = W.x - sk.w / 2; sk.y = Math.min(sy, bot - 24); sk.h = Math.max(24, bot - sk.y); sk.defMul = c ? 1.2 : 1.15;
    const gs = this.gobBig() ? 52 : 44, G = this.toWorld(P.gob.x, P.gob.y - 4, W);
    this.pGob.w = this.pGob.h = gs; this.pGob.x = G.x - gs / 2; this.pGob.y = G.y - gs / 2;
  }
  /** 선택(§2.1): 스토리 모드에서 세라면 성배 판정 52×52 (아케이드 영향 없음) */
  gobBig() { const w = this.world; return w?.mode === 'story' && (w.hero?.charId === 'sera' || w.player?.hero?.charId === 'sera'); }
  motion(dt, world) {
    const s = this.ps, pt0 = this.pt;
    for (const k in s) { s[k] += (pt0[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt)); if (Math.abs(pt0[k] - s[k]) < 1e-3) s[k] = pt0[k]; }
    const ar = 1 - Math.exp(-this.armRate * dt), a = this.arm, at = this.armT;
    for (const k in a) a[k] += (at[k] - a[k]) * ar;
    const A = this.A, x0 = this.zx;
    const L = this.lp;
    if (L) {
      // 미끄러지듯 옮겨 감 (마지막 왈츠 — 발판으로 오르내리면 작은 포물선)
      L.u += dt / L.T; const k = Math.min(1, L.u), e = k * k * (3 - 2 * k);
      this.zx = lerp(L.x0, L.x1, e); this.fy = lerp(L.y0, L.y1, e) - (L.y0 !== L.y1 ? 4 * 50 * e * (1 - e) : 0);
      if (k >= 1) { this.lp = null; this.zx = L.x1; this.fy = L.y1; }
    } else if (this.spd > 0) this.zx = approach(this.zx, this.tzx, this.spd * dt);
    this.zx = clamp(this.zx, A.x0 + 30, A.x1 - 30);
    if (!this.lp) {
      // 발판 끝을 넘으면 떨어진다 (왈츠로 올라선 발판). 노파는 천천히 내려앉는다
      const sf = this.surface(this.zx, this.fy);
      if (this.fy < sf - 0.5) { this.vfy += (this.crone ? 1300 : 2400) * dt; this.fy = Math.min(sf, this.fy + this.vfy * dt); if (this.fy >= sf) { this.vfy = 0; if (dt > 0) this.landFx(world); } }
      else { this.fy = sf; this.vfy = 0; }
    }
    this.fy = Math.min(this.fy, A.floor);
    const mv = dt > 0 ? (this.zx - x0) / dt : 0;
    this.walkK = approach(this.walkK, Math.abs(mv) > 30 ? 1 : 0, dt * 5);
    this.trainLag = approach(this.trainLag, clamp(-mv * this.fk * 0.05, -26, 30), dt * 60);
    const sp = this.t - this.spinT;
    if (sp >= 0 && sp < 0.4) this.fk = this.facing * Math.cos((sp / 0.4) * TAU);   // 회전 베기: 한 바퀴 (fk = cos)
    else this.fk = approach(this.fk, this.facing, dt * 9);
    this.hov = (this.crone ? HOV + Math.sin(this.t * 2.2) * 3 : 0) + T48() * s.rise;
    if (this.morphT >= 0) { const k = clamp((this.t - this.morphT) / 0.35, 0, 1); this.morph = this.crone ? k : 1 - k; } else this.morph = this.crone ? 1 : 0;
    this.burnK = this.burnT >= 0 ? clamp((this.t - this.burnT) / 0.6, 0, 1) : 0;
    this.crackK = this.crackT >= 0 ? clamp((this.t - this.crackT) / 1.0, 0, 1) : 0;
    this.lashK = this.vineMode === 'lash' ? Math.min(1, this.lashK + dt / 0.1) : 0;
    this.vineGlow = approach(this.vineGlow, this.vineMode === 'raised' || this.vineMode === 'lash' ? 1 : 0, dt * 4);
    this.place();
    this.rig();
    this.rigStrands(dt);
    this.syncParts();
  }
  landFx(world) {
    if (!world?.fx) return;
    world.fx.burst('paper', this.zx, this.fy - 6, 5, { color: CRIM_H, speed: 120, angle: -PI / 2, spread: 1.4 });
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0 || this.hidden || this.ghost) return L;
    if (this.gobletUp && !this._lastMode) L.push(this.pGob);
    L.push(this.pHead, this.pBody, this.pSkirt);
    return L;
  }
  /** 접촉은 몸통만. 박쥐로 흩어짐·무릎·사망 중에는 없다 (그 피해는 예고된 지대가 맡는다) */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.hidden || this.ghost || this.dying > 0 || this.stunned) return L;
    L.push(this.cBody);
    return L;
  }
  /**
   * 창 상한 (DANCE_CAP · STAG_CAP, d_nihil.js 피날레 보호와 같은 틀 — takeHit 에서 줄인다): 왈츠 한 번 · 무릎 한 번에 잃는 체력은 1페이즈에서 상한까지.
   * 넘는 피해는 상한까지만 들어가고(숫자도 줄인 값, 1 이하면 impact.js capFn 처럼 '저항'), 무릎이면 그 틱에 일어선다. 필살·각성은 빼고(제 상한 capFn 30%).
   */
  takeHit(dmg, attack, world, info) {
    const burst = attack?.tags?.includes('ult') || attack?.tags?.includes('awaken');
    if (this.capHp != null && !burst && !(this.dying > 0) && !this.invuln && this.hp - dmg <= this.capHp) {
      dmg = Math.max(1, Math.round(this.hp - this.capHp));
      if (info) { info.dmg = dmg; info.capped = true; if (dmg <= 1) info.resist = true; }
      if (this.state === 'stagger' && this.stunned) this.wakeT = this.st + 1e-3;
    }
    return super.takeHit(dmg, attack, world, info);
  }
  /** 상태가 바뀔 때마다 창 상한을 새로 연다 (왈츠 두 가지 · 무릎만 — 그 상태가 끝나면 닫힌다, 15% 긴 무릎은 없음) */
  setState(s) {
    super.setState(s);
    const c = (s === 'waltz' || s === 'lastDance' ? DANCE_CAP : s === 'stagger' && !this.stagLong ? STAG_CAP : null)?.[this.phase], mx = this.stats?.maxHp;
    this.capHp = c && mx ? this.hp - mx * c : null;
  }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (Math.random() < 0.5) world.fx.burst('paper', x, y, 2, { color: this.crone ? RAG : CRIM_H, speed: 150 });
    if (this.dying > 0 || this.dead) { this.renameBanner(world); return; }
    this.check15();
    const mx = this.stats.maxHp;
    // 회춘의 잔: 성배 판정 한 대 · 몸통에 최대 체력 3% → 성배가 깨진다 (스토리 15% 의 대사 성배는 카밀라가 깬다).
    //   수호신의 자동 공격은 성배를 '한 대'로 깨지 않는다 — 몸통 피해로만 센다 (e_hagen.js 올가미 noGuardianHit 과 같은 뜻: 끊을지는 플레이어가 고른다)
    if (this.state === 'goblet' && this.gobletUp && !this._lastMode) {
      if (part === this.pGob && !attack?.tags?.includes('guardian')) { this._breakNow = true; return; }
      this.gobAcc += Math.max(0, dmg || 0);
      if (this.gobAcc >= mx * BREAK_DMG) { this._breakNow = true; return; }
    }
    // 카운터 창(왈츠 두 가지의 무릎 인사)에 맞으면 → 무릎 (stagger)
    if (this.cWin && (this.state === 'waltz' || this.state === 'lastDance')) { this.cWin = false; this._stagNow = true; return; }
    // 세월 흡수 노출 0.9초 안에 최대 체력 5% 이상 → 무릎
    if (this.exposed && this.state === 'drain') {
      this.dexp += Math.max(0, dmg || 0);
      if (this.dexp >= mx * EXPOSE_DMG) { this.exposed = false; this._stagNow = true; }
    }
  }
  /**
   * 체력 15% 이하에서 한 번(싸움마다): 다음 틱(tickB)에 하던 패턴을 끊고 goblet (회복 성공 횟수와 무관). 전환 중이면 전환 뒤로 (forceNext).
   * 스토리·처음이면 그 성배는 대사 b_bride_last 뒤 카밀라가 깬다 (s_goblet 이 canShowScript 로 고른다) — e_hagen.js check15 와 같은 틀 (s23 VERIFY ① 교훈)
   */
  check15() {
    if (this._forced15 || this.phase < 1 || this.dying > 0 || this.hpK() > 0.15) return;
    this._forced15 = true; this._gobNow = true;
  }
  toForced() {
    this._gobNow = false; this._breakNow = false; this._stagNow = false;
    if (this.dying > 0 || this.dead) return;
    this._gobForce = true;
    if (this._tr) { this.forceNext('goblet'); return; }
    this.clearJobs(); this.onCancel(this.world);
    this.lastAtk = 'goblet';
    this.setState('goblet');
  }
  toStagger(long = false) {
    this._stagNow = false;
    if (this.dying > 0 || this.dead || this._tr) return;
    this.clearJobs(); this.onCancel(this.world);
    this.stagLong = long;
    this.setState('stagger');
  }

  // ═════════════════════════════ 패턴 고르기 ═════════════════════════════
  minionCount(id) { minionsAlive(this); let n = 0; for (const e of this._cMinions) if (e.id === id && !e.dead) n++; return n; }
  /** 회춘의 잔은 체력 85% 이하 · 이번 싸움 회복 성공 < 2 일 때만 · 신부들의 부름은 신부(1페이즈)·박쥐 떼(2페이즈)가 최대(2)면 고르지 않는다 */
  weights(phase = this.phase) {
    return super.weights(phase).filter(([k]) => (k !== 'goblet' || (this.hpK() <= HEAL_AT && this.heals < HEAL_MAX))
      && (k !== 'brides' || this.minionCount(this.crone ? 'bat_swarm' : 'vampire_bride') < 2));
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    // 피격 처리 안이 아니라 여기서 (runJobs 밖 — clearJobs 가 안전하다): 15% 강제 > 성배 깨짐 > 무릎
    if (this._gobNow) this.toForced();
    else if (this._breakNow) this.breakGoblet(world);
    else if (this._stagNow) this.toStagger();
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
  }
  ambient(dt, world) {
    if (this.ghost) return;
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (this.crone ? 1.4 : 0.7);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const P = this.toWorld(rand(-30, 26), -rand(20, 120) - this.hov);
      world.fx.emit(this.crone ? 'ember' : 'paper', P.x, P.y, this.crone ? { color: ASH, speed: 20, angle: -PI / 2, spread: 1 } : { color: CRIM_H, speed: 30, angle: PI / 2, spread: 1.2, size: 2.6 });
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) {
    const reach = this.vineMode === 'lash' ? 8 * T48() + 60 : 160;
    let x0 = this.zx - 200, x1 = this.zx + 200;
    if (this.facing > 0) x1 = Math.max(x1, this.zx + reach); else x0 = Math.min(x0, this.zx - reach);
    r.x = x0; r.y = this.fy - 240 - this.hov; r.w = x1 - x0; r.h = this.fy + 30 - r.y;
    return r;
  }
  /**
   * 그리기: 채색이 준비됐으면 채색(대리 개체), 아니면 벡터. 쓰러짐 연출은 스스로 보여 주므로
   * Boss.draw 의 사망 투명도 감쇠를 쓰지 않는다 (채색 렌더러의 ownsDeathFade 와 같은 규칙 — e_hagen.js 와 같다)
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
      this.setPose({ bow: 0.6 }); this.arms('curtsey', 6);
      audio.sfx('eye_glint', { vol: 0.6 }); audio.sfx('bat', { vol: 0.35, pitch: 0.8 });
      impact(world, { shake: 3, time: 0.4 });
    }
    if (this.at(0.9)) { this.setPose({ bow: 0 }); this.arms('idle', 6); }
    if (t >= 1.5) this.done(0.8);
  }
  /** 대기: 귀부인은 플레이어와 280px 안팎을 지키며 춤추듯 미끄러진다 (붙으면 빠르게 물러선다 — 서서 맞는 틈을 줄인다, §2 체급) · 노파는 210px 안팎을 떠다닌다 */
  idleMove(dt, world, t) {
    this.faceP();
    const A = this.A, p = this.P;
    const px = p ? p.cx : A.cx;
    const side = Math.sign(this.zx - px) || -this.facing;
    const d = this.crone ? 210 + Math.sin(this.t * 1.1) * 40 : 280 + Math.sin(this.t * 0.9) * 50;
    const close = p && Math.abs(p.cx - this.zx) < (this.crone ? 120 : 170);
    this.tzx = clamp(px + side * d, A.x0 + 80, A.x1 - 80);
    this.spd = this.crone ? (close ? 330 : 190) : (close ? 320 : 150);
    if (this.state === 'idle') this.setPose({ sway: 1, flare: this.crone ? 0 : 0.12 + 0.2 * this.walkK, lean: close ? -0.12 : 0 });
  }

  // ── waltz (1페이즈): 세 걸음 (3/4 박자, 걸음마다 0.62초): 착지점 warnMark 0.45초 (플레이어 x ±1칸, 선 발판 또는 A.floor) →
  //    박쥐로 흩어짐 0.15초 (판정 없음, mist) → 나타나며 회전 베기 strikeCircle r 120 mv 0.6 (whip) → 셋째 걸음 뒤 무릎 인사 0.6초 = 카운터 창 ──
  s_waltz(dt, world, t) { this.dance(dt, world, t, { n: 3, step: 0.62, warn: 0.45, r: 120, mv: 0.6, bow: 0.6, bats: true }); }
  // ── lastDance (2페이즈): 다섯 걸음 (걸음마다 0.5초, warnMark 0.35초) — 걸음마다 회전 베기 r 110 mv 0.55, 그리고 젊은 날의 잔상(귀부인 모습 반투명)이
  //    0.45초 뒤 같은 자리에서 한 번 더 (mv 0.5) → 다섯째 뒤 무릎 인사 0.5초 = 카운터 창. 노파는 박쥐 대신 잿빛 꽃잎 속을 미끄러진다 ──
  s_lastDance(dt, world, t) { this.dance(dt, world, t, { n: 5, step: 0.5, warn: 0.35, r: 110, mv: 0.55, bow: 0.5, bats: false, after: 0.45 }); }
  dance(dt, world, t, o) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0; this.cWin = false;
      this.wz = { k: -1, tx: this.zx, ty: this.fy };
      this.arms(this.crone ? 'claw' : 'waltz', 8); this.setPose({ flare: 0.45, sway: 0, lean: 0 });
      audio.sfx('bell', { vol: 0.35, pitch: 0.8 });
    }
    const wz = this.wz;
    if (!wz) { if (t > 0.5) this.done(0.5); return; }
    const S = o.step;
    for (let k = 0; k < o.n; k++) {
      const t0 = k * S;
      if (this.at(t0 + 0.001)) {
        const L = this.landing(T48()); wz.k = k; wz.tx = L.tx; wz.ty = L.ty;
        warnMark(this, L.tx, L.ty - 28, o.warn, ROSE);
        this.zone({ x: L.tx - 60, y: L.ty - 8, w: 120, h: 8, warn: 0, life: o.warn, harmless: true, z: 4, data: { mark: true, tx: L.tx, ty: L.ty },
          paint: (ctx, z, w) => warnFloor(ctx, L.tx, L.ty, 120, clamp(z.t / o.warn, 0, 1), ROSE, w.time) });
      }
      if (o.bats && this.at(t0 + o.warn - 0.15)) {
        // 박쥐로 흩어짐 (0.15초, 판정 없음): 지금 자리 → 착지점
        this.ghost = true; audio.sfx('mist', { vol: 0.6, pitch: 1.2 }); audio.sfx('bat', { vol: 0.4, pitch: 1.3 });
        batsZone(this, this.zx, this.fy - 80 - this.hov, wz.tx, wz.ty - 80, 0.15);
      }
      if (!o.bats && this.at(t0 + o.warn - 0.15)) {
        this.lp = { x0: this.zx, y0: this.fy, x1: wz.tx, y1: wz.ty, T: 0.15, u: 0 };
        world.fx.burst('ember', this.zx, this.fy - 60 - this.hov, 8, { color: ASH, speed: 120 });
        audio.sfx('mist', { vol: 0.4, pitch: 0.8 });
      }
      if (this.at(t0 + o.warn)) {
        this.lp = null; this.zx = this.tzx = wz.tx; this.fy = wz.ty; this.vfy = 0; this.ghost = false; this.faceP(0);
        this.spinT = this.t;
        const cx = wz.tx, cy = wz.ty - 70 - (this.crone ? HOV : 0);
        strikeCircle(this, cx, cy, o.r, { warn: 0, life: 0.15, mv: o.mv, color: this.crone ? ASH : ROSE, sfx: null, kb: [360, -300], data: { spin: true, k },
          paint: (ctx, z) => paintSpin(ctx, cx, cy, o.r, z, this.crone ? ASH : ROSE) });
        audio.sfx('whip', { vol: 0.75, pitch: 1.1 - k * 0.04 });
        if (o.bats) world.fx.burst('feather', cx, cy, 6, { color: BLACK, speed: 160 });
        if (o.after) {
          // 젊은 날의 잔상: 같은 자리에서 0.45초 뒤 한 번 더 (구운 실루엣 비트맵 — 퍼핏을 두 번 그리지 않는다)
          const f = this.facing;
          strikeCircle(this, cx, cy, o.r, { warn: o.after, life: 0.15, mv: 0.5, color: ROSE, sfx: 'whip', pitch: 1.3, vol: 0.5, kb: [320, -280], data: { after: true, k, x: cx, y: cy, t0: this.t },
            paint: (ctx, z) => paintAfterimage(ctx, wz.tx, wz.ty, f, z, o.r) });
        }
      }
    }
    const end = o.n * S;
    if (this.at(end)) {
      // 무릎 인사 = 카운터 창
      this.cWin = true; this.telegraphFor(o.bow); this.setPose({ bow: 1, flare: 0.6 }); this.arms('curtsey', 10);
      audio.sfx('bell', { vol: 0.3, pitch: 1.2 });
    }
    if (this.at(end + o.bow)) { this.cWin = false; this.relax(); }
    if (t >= end + o.bow + 0.15) { this.wz = null; this.done(1.0); }
  }

  // ── thornLash: 덩굴이 붉게 빛남 0.6초 → 보스에서 플레이어 쪽으로 8칸 strikeRect 두 번: 낮은 띠(디딤면−1칸…디딤면, 뛰어넘는다)와
  //    가운데 띠(디딤면−2.6…−1.8칸, 땅에 붙어 피한다)를 무작위 순서로 0.35초 간격, warnRect 0.6초 (mv 0.7 · 0.75, whip_crack) ──
  s_thornLash(dt, world, t) {
    const T = T48();
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.arms('lashWind', 8); this.setPose({ lean: -0.15 }); this.vineMode = 'raised';
      telegraph(this, 0.6, { sfx: null });
      audio.sfx('whip', { vol: 0.35, pitch: 0.6 });
      const f = this.facing, base = Math.min(this.A.floor, this.fy);
      const bands = [{ y: base - T, h: T, low: true }, { y: base - 2.6 * T, h: 0.8 * T, low: false }];
      if (Math.random() < 0.5) bands.reverse();
      this.tl = { f, base, bands, x: 0 };
      // 덩굴을 감아 올리며 한 걸음 뒤로 미끄러진다 (붙어 있던 플레이어와 틈을 벌린다)
      this.tzx = clamp(this.zx - f * 70, this.A.x0 + 60, this.A.x1 - 60); this.spd = 220;
    }
    const tl = this.tl;
    if (!tl) { if (t > 0.5) this.done(0.5); return; }
    if (this.at(0.6)) {
      this.spd = 0; tl.x = tl.f > 0 ? this.zx : this.zx - 8 * T;
      tl.bands.forEach((b, i) => {
        strikeRect(this, { x: tl.x, y: b.y, w: 8 * T, h: b.h }, { warn: 0.6 + i * 0.35, life: 0.15, mv: i ? 0.75 : 0.7, color: CRIM, sfx: 'whip_crack', vol: 0.8, kb: [380, b.low ? -420 : -200],
          data: { lash: true, low: b.low, i }, onStart: () => { this.lashY = b.y + b.h / 2 - this.fy; this.lashK = 0; this.vineMode = 'lash'; this.arms('lash', 30); },
          paint: (ctx, z, w) => { if (!z.started) warnRect(ctx, z.x, z.y, z.w, z.h, z.k, CRIM, w.time); else paintLash(ctx, z, tl.f); } });
      });
    }
    if (this.at(1.9)) { this.vineMode = 'coil'; this.relax(); }
    if (t >= 2.1) { this.tl = null; this.done(1.0); }
  }

  // ── roseBloom: 장미 3송이(2페이즈 5)를 던진다: 플레이어 x 와 ±3칸(2페이즈 ±2·±4, 플레이어가 선 발판 포함) 바닥에 warnFloor 0.8초 →
  //    핏물 기둥 strikeColumn 폭 64 · 높이 4칸 mv 0.7, 0.12초 간격 (splash, pitch 0.7) ──
  s_roseBloom(dt, world, t) {
    const n = this.crone ? 5 : 3;
    if (this.at(0.001)) {
      this.faceP(10);
      this.arms('throwWind', 10); this.setPose({ lean: -0.15 });
      telegraph(this, 0.3, { sfx: 'warning', vol: 0.35, pitch: 1.1 });
      this.tzx = clamp(this.zx - this.facing * 50, this.A.x0 + 60, this.A.x1 - 60); this.spd = 200;   // 던지며 뒤로 미끄러짐
    }
    if (this.at(0.3)) {
      this.spd = 0; this.arms('throw', 24); this.setPose({ lean: 0.2 });
      audio.sfx('whip', { vol: 0.5, pitch: 1.4 });
      const offs = this.crone ? [0, -2, 2, -4, 4] : [0, -3, 3];
      this.roses(offs, { w: 64, h: 4, mv: 0.7, warn: 0.8, gap: 0.12 });
    }
    if (this.at(0.75)) this.relax();
    if (t >= 0.3 + 0.8 + 0.12 * (n - 1) + 0.4) this.done(1.0);
  }
  /** 장미를 던져 핏물 기둥 (플레이어 x + offs 칸, 플레이어가 선 높이의 디딤면). 손 → 착지점 포물선은 지대 그림이 그린다 */
  roses(offs, o) {
    const A = this.A, p = this.P, T = T48(), px = p ? p.cx : A.cx, py = p ? Math.min(A.floor, p.bottom - 6) : A.floor;
    const hand = this.toWorld(this.pts.hdF.x, this.pts.hdF.y, { x: 0, y: 0 });
    offs.forEach((dx, i) => {
      const x = clamp(px + dx * T, A.x0 + 32, A.x1 - 32), fl = this.surface(x, py), warn = o.warn + i * o.gap;
      strikeColumn(this, x, { w: o.w, top: fl - o.h * T, bottom: fl, warn, life: 0.3, mv: o.mv, color: CRIM, sfx: 'splash', pitch: 0.7, vol: 0.6, kb: [240, -420], data: { rose: true, x, fl },
        onStart: (z, w) => w.fx.burst('blood', x, fl - 8, 10, { speed: 300, angle: -PI / 2, spread: 0.5 }),
        paint: (ctx, z, w) => paintRoseColumn(ctx, z, hand.x, hand.y, x, fl, o.w, o.h * T, warn, w) });
    });
  }

  // ── brides: 베일을 젖힘 0.9초 (bat) → 1페이즈 흡혈 신부 2 (살아 있는 수 ≤ 2), 2페이즈 박쥐 떼 1 (≤ 2). 최대면 고르지 않는다 ──
  s_brides(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.arms('unveil', 8); this.setPose({ lean: -0.12, veil: 1 });
      audio.sfx('bat', { vol: 0.8, pitch: this.crone ? 0.8 : 1.0 });
      telegraph(this, 0.9, { sfx: null });
      world.fx.ring(this.zx, this.fy - 100 - this.hov, { color: ROSE, r0: 20, r1: 170, life: 0.6, width: 3 });
    }
    if (this.at(0.9)) {
      const id = this.crone ? 'bat_swarm' : 'vampire_bride', n = this.crone ? Math.min(1, 2 - this.minionCount(id)) : Math.min(2, 2 - this.minionCount(id));
      for (let i = 0; i < n; i++) {
        const x = clamp(this.zx + (i ? 1 : -1) * 120, A.x0 + 40, A.x1 - 40), y = this.fy - (this.crone ? 140 : 110);
        if (spawnMinion(this, [id], x, y, { facing: this.facing })) world.fx.burst('dark', x, y, 12, { speed: 160 });
      }
      audio.sfx('bat', { vol: 0.6, pitch: 1.3 });
    }
    if (this.at(1.2)) this.relax();
    if (t >= 1.4) this.done(1.0);
  }

  // ── goblet 회춘의 잔: (고르는 조건: 체력 ≤ 85% · 이번 싸움 회복 성공 < 2) 성배를 머리 위로 1.8초(2페이즈 1.5초) — 성배에 금빛 고리, eye_glint.
  //    그동안 성배 판정(44×44, 손 위)을 한 대 치거나 몸통에 최대 체력 3% 이상 → 성배가 깨짐(ice pitch 1.6 + 금 파편) → stagger.
  //    못 끊으면 최대 체력 4% 회복(heal pitch 0.6, 붉은 숫자) — 2페이즈는 49.9% 까지 (전환이 다시 걸리지 않게).
  //    15% 강제(_gobForce) + 스토리·처음: 성배를 들자마자 대사 b_bride_last → 대사가 끝나면 카밀라가 성배를 깨고 긴 무릎 2.5초 (몸통 0.6) ──
  s_goblet(dt, world, t) {
    const dur = this.crone ? 1.5 : 1.8;
    if (this.at(0.001)) {
      this.spd = 0; this.faceP(0);
      this._lastMode = this._gobForce && canShowScript(world, 'b_bride_last'); this._gobForce = false; this._lastEnd = false;
      this.gobletUp = true; this.gobAcc = 0;
      this.arms('raise', 8); this.setPose({ lean: -0.2 });
      audio.sfx('eye_glint', { vol: 0.8 });
      const G = this.pGob;
      this.zone({ x: G.x, y: G.y, w: G.w, h: G.h, warn: 0, life: this._lastMode ? 9 : dur, harmless: true, z: 8, data: { gobRing: true },
        tick: (z) => { if (!this.gobletUp || this.state !== 'goblet') z.dead = true; },
        paint: (ctx, z) => paintGobRing(ctx, this, z) });
      warnMark(this, this.pGob.x + this.pGob.w / 2, this.pGob.y - 26, Math.min(0.8, dur), GOLD);
    }
    if (this._lastMode) {
      // 스토리 15%: 성배를 든 첫 프레임에 대사 b_bride_last (대사 동안 월드가 멈춘다) → 대사가 끝나면 카밀라가 깬다. 보여 줄 수 없게 되면 보통 회춘의 잔으로.
      //   명세의 '0.6초' 대신 곧바로 — 0.6초를 기다리면 강한 영웅(스토리 봇 카엘)이 남은 13% 를 깎아 대사 없이 쓰러뜨렸다 (s23 VERIFY ① 과 같은 교훈)
      if (this.at(0.001)) { Object.assign(this.arm, ARM.raise); this.rig(); this.syncParts(); }
      if (this.at(0.001) && !phaseScript(this, 'b_bride_last', { onEnd: () => { this._lastEnd = true; } })) { this._lastMode = false; this._lastEnd = false; }
      else { if (this._lastEnd || t > 8) this.breakGoblet(world, true); return; }
    }
    if (this.gobletUp && this.at(dur)) {
      this.gobletUp = false; this.heal(world);
      this.arms('drink', 10); this.setPose({ lean: -0.35 });
    }
    if (this.at(dur + 0.55)) this.relax();
    if (t >= dur + 0.7) this.done(0.9);
  }
  /** 4% 회복 (2페이즈는 49.9% 를 넘지 않는다). 성공 횟수 +1 */
  heal(world) {
    const mx = this.stats.maxHp, cap = this.phase >= 1 ? Math.floor(mx * 0.499) : mx - 1;
    const add = Math.max(0, Math.min(Math.round(mx * HEAL), cap - this.hp));
    this.hp += add; this.heals++;
    audio.sfx('heal', { vol: 0.8, pitch: 0.6 });
    const G = this.toWorld(this.pts.gob.x, this.pts.gob.y, { x: 0, y: 0 });
    world.fx.text(G.x, G.y - 20, '+' + add, { color: '#ff4a6a', size: 24, life: 1.2 });
    world.fx.burst('blood', G.x, G.y, 8, { speed: 120, angle: -PI / 2, spread: 1 });
    world.fx.burst('bloodmist', this.zx, this.fy - 80 - this.hov, 6, { speed: 40 });
    return add;
  }
  /** 성배가 깨진다 (플레이어 한 대 · 몸통 3% · 스토리 15% 의 카밀라) → 무릎 (카밀라면 긴 무릎 2.5초) */
  breakGoblet(world = this.world, camilla = false) {
    this._breakNow = false;
    if (this.dying > 0 || this.dead) return;
    const G = this.toWorld(this.pts.gob.x, this.pts.gob.y, { x: 0, y: 0 });
    this.gobletUp = false; this._lastMode = false; this.gobBreakT = this.t;
    audio.sfx('ice', { vol: 0.9, pitch: 1.6 });
    world.fx.burst('shard', G.x, G.y, 10, { color: GOLD, speed: 260 });
    world.fx.burst('gold', G.x, G.y, 10, { speed: 160 });
    world.fx.burst('blood', G.x, G.y, 8, { speed: 180 });
    impact(world, { shake: 5, time: 0.3 });
    this.toStagger(camilla);
  }

  // ── crimsonBath (2페이즈): 1칸 떠오름 → 바닥 띠 경고 1.0초 (warnRect 경기장 폭 전체, A.floor−1.6칸…A.floor, 거품) → 핏물 띠 2.4초
  //    (mv 0.35, rehit 0.4, 위로 튕김) → 0.4초에 빠진다. 그동안 발판 쪽으로 장미 2송이 (roseBloom 작은 판, mv 0.6). 답 = 발판·공중. 전환 직후 강제 ──
  s_crimsonBath(dt, world, t) {
    const A = this.A, T = T48();
    if (this.at(0.001)) {
      this.spd = 0; this.faceP(0);
      this.setPose({ rise: 1, lean: -0.1 }); this.arms('spread', 6);
      audio.sfx('splash', { vol: 0.7, pitch: 0.5 }); audio.sfx('heartbeat', { vol: 0.6 });
      const y = A.floor - 1.6 * T;
      this.bathZ = strikeRect(this, { x: A.x0, y, w: A.w, h: 1.6 * T }, { warn: 1.0, life: 2.4, mv: 0.35, rehit: 0.4, color: BLOOD, sfx: 'splash', pitch: 0.6, kb: [120, -760], data: { bath: true },
        onStart: (z, w) => { impact(w, { shake: 6, time: 0.4 }); for (let i = 0; i < 6; i++) w.fx.burst('blood', A.x0 + A.w * (i + 0.5) / 6, A.floor - 20, 6, { speed: 260, angle: -PI / 2, spread: 0.6 }); },
        onEnd: (z, w) => { this.zone({ x: A.x0, y, w: A.w, h: 1.6 * T, warn: 0, life: 0.4, harmless: true, z: 6, data: { recede: true }, paint: (ctx, z2, w2) => paintBath(ctx, A, z2, w2, 'recede') }); },
        paint: (ctx, z, w) => paintBath(ctx, A, z, w, z.started ? 'on' : 'warn') });
    }
    if (this.at(1.4)) { this.arms('throw', 20); audio.sfx('whip', { vol: 0.4, pitch: 1.4 }); this.roses([0, this.facing * -2], { w: 48, h: 3, mv: 0.6, warn: 0.8, gap: 0.2 }); }
    if (this.at(1.8)) this.arms('spread', 6);
    if (this.at(3.4)) { this.setPose({ rise: 0 }); this.relax(); }
    if (t >= 3.8) { this.bathZ = null; this.done(1.0); }
  }

  // ── drain (2페이즈): 두 팔을 벌림 0.5초(잿빛 안개) → pullField 1.6초 (보스 쪽으로 260px/s, 달리기·대시로 버틴다) + 둘레 가시 warnCircle r 150 →
  //    터짐 strikeCircle r 150 mv 0.85 → 노출 0.9초 (몸통 0.7, 최대 체력 5% 이상이면 무릎) ──
  s_drain(dt, world, t) {
    if (this.at(0.001)) {
      this.spd = 0; this.faceP(0); this.exposed = false; this.dexp = 0;
      this.arms('spread', 6); this.setPose({ lean: -0.25 });
      audio.sfx('mist', { vol: 0.7, pitch: 0.5 });
      telegraph(this, 0.5, { sfx: null });
      world.fx.burst('smoke', this.zx, this.fy - 80 - this.hov, 10, { color: ASH, speed: 90 });
    }
    if (this.at(0.5)) {
      const cx = this.zx, cy = this.fy - 70 - this.hov;
      this.pullZ = pullField(this, cx, cy, { dur: 1.6, force: 900, maxV: 260, color: ASH, data: { drain: true } });
      strikeCircle(this, cx, cy, 150, { warn: 1.6, life: 0.2, mv: 0.85, color: ROSE, sfx: 'dark', vol: 0.9, kb: [460, -360], data: { drainBurst: true }, burstFx: 'blood' });
      audio.sfx('dark', { vol: 0.5, pitch: 0.6 });
    }
    if (t > 0.5 && t < 2.1 && Math.random() < 0.5 * (world.fx.quality ?? 1)) {
      const a = rand(0, TAU), r = rand(120, 220);
      world.fx.emit('ember', this.zx + Math.cos(a) * r, this.fy - 70 - this.hov + Math.sin(a) * r * 0.6, { color: ASH, speed: 60, angle: a + PI, spread: 0.2 });
    }
    if (this.at(2.1)) { this.pullZ = null; this.exposed = true; this.dexp = 0; this.arms('limp', 8); this.setPose({ lean: 0.3 }); }
    if (this.at(3.0)) { this.exposed = false; this.relax(); }
    if (t >= 3.15) this.done(0.9);
  }

  /** 보조: 무릎 1.4초 (몸통 0.7 · 머리 0.6) — 왈츠 카운터 창 · 성배를 깸 · 세월 흡수 노출 중 5%. 15% 의 카밀라 성배는 긴 무릎 2.5초 (몸통 0.6).
   *  무릎 한 번에 STAG_CAP 만큼 잃으면 그 자리에서 일어선다 (wakeT, takeHit) */
  s_stagger(dt, world, t) {
    if (this.at(0.001)) this.wakeT = 9;
    const L = this.stagLong ? 2.5 : Math.min(1.4, this.wakeT);
    if (this.at(0.001)) {
      this.stunned = true; this.ghost = false; this.cWin = false; this.exposed = false; this.gobletUp = false; this.spd = 0; this.lp = null;
      this.setPose({ kneel: 1, bow: 0, lean: 0.2, rise: 0, flare: 0.5 }); this.arms('limp', 10); this.vineMode = 'coil';
      audio.sfx('hit_heavy', { pitch: 0.7 });
      world.fx.burst('paper', this.zx, this.fy - 50, 12, { color: this.crone ? RAG : CRIM_H, speed: 180 });
      impact(world, { shake: 6, time: 0.3 });
    }
    if (this.stunned && Math.random() < 0.2 * (world.fx.quality ?? 1)) world.fx.emit('spark', this.zx + rand(-20, 20), this.fy - 120 - this.hov, { color: '#fff3c0', speed: 40, angle: -PI / 2 });
    if (this.at(L)) { this.stunned = false; this.setPose({ kneel: 0, lean: 0 }); this.arms(this.crone ? 'claw' : 'idle', 8); }
    if (t >= L + 0.3) { this.stagLong = false; this.relax(); this.done(0.6); }
  }

  // ── 전환 wither (1→2): 무적 2.4초. 0.4초 베일에 불이 붙음(잿빛으로 바래며 불씨) → 1.0초 얼굴에 금이 번지고 머리가 하얗게 셈 → 2.0초 노파 모습
  //    (applyAt → applyPhase(1): 판정 크기 84×150 · 아래 끝 A.floor − 24 · 발 x 그대로 · form2 이름·초상화) → 끝에 대사 b_bride_wither (스토리 1회) → 곧바로 crimsonBath ──
  s_wither(dt, world, t) {
    if (this.at(0.001)) {
      this.transStart(world);
      this.setPose({ lean: -0.1, hunch: 0 }); this.arms('clutch', 6);
      audio.sfx('heartbeat', { vol: 0.8 });
    }
    if (this.at(0.4)) {
      if (this.burnT < 0) this.burnT = this.t;
      screenTint(this, { color: '#1a0408', alpha: 0.2, edge: ROSE, dur: 1.9 });
      audio.sfx('mist', { vol: 0.7, pitch: 0.7 });
    }
    if (t > 0.4 && t < 2.0 && Math.random() < 0.5 * (world.fx.quality ?? 1)) { const P = this.toWorld(this.veil[2].x, this.veil[2].y, this._r); world.fx.emit('ember', P.x + rand(-10, 10), P.y + rand(-14, 14), { color: '#ff9a5a', speed: 60, angle: -PI / 2, spread: 1 }); }
    if (this.at(1.0)) { if (this.crackT < 0) this.crackT = this.t; this.setPose({ hunch: 0.5 }); audio.sfx('ice', { vol: 0.6, pitch: 0.5 }); impact(world, { shake: 6, time: 0.5 }); }
    if (this.at(2.25)) this.relax();
    this.transitionTick(dt, world, t);
  }
  transStart(world) {
    this.ghost = false; this.cWin = false; this.exposed = false; this.stunned = false; this.gobletUp = false; this.spd = 0; this.lp = null;
    this.wz = this.tl = null; this.vineMode = 'coil';
    impact(world, { shake: 5, time: 0.5 });
  }
  /** 형태 바꾸기 (페이즈마다 한 번, debugPhase 에도): 1 = 노파 (판정 크기 84×150, 아래 끝 디딤면 − 24, 발 x 고정) */
  applyPhase(k) {
    if (k >= 1 && !this.crone) {
      this.crone = true; this.morphT = this.t; this.burnT = this.burnT >= 0 ? this.burnT : this.t - 1; this.crackT = this.crackT >= 0 ? this.crackT : this.t - 1;
      this.w = SIZE_C.w; this.h = SIZE_C.h;
      this.pt.hunch = 1; this.place();
      const w = this.world;
      if (w?.fx) {
        const P = this.toWorld(0, -80, { x: 0, y: 0 });
        w.fx.burst('paper', P.x, P.y, 18, { color: CRIM_H, speed: 260 });
        w.fx.burst('ember', P.x, P.y, 14, { color: ASH, speed: 200 });
        w.fx.ring(P.x, P.y, { color: ROSE, r0: 10, r1: 220, life: 0.5, width: 5 });
        impact(w, { shake: 10, time: 0.5, flash: '#ffd6e0', fa: 0.3 });
        audio.sfx('dark', { vol: 0.7, pitch: 0.7 });
      }
    }
  }
  onCancel() {
    this.ghost = false; this.cWin = false; this.exposed = false; this.stunned = false; this.gobletUp = false; this.spd = 0; this.lp = null;
    this._lastMode = false; this._lastEnd = false; this.stagLong = false;
    this.wz = this.tl = null; this.vineMode = 'coil';
    // 끊긴 패턴의 흡수장은 바로 · 핏물 띠는 0.4초 안에 빠진다 (성배 강제·무릎이 그 위에서 시작하지 않게)
    if (this.pullZ && !this.pullZ.dead) this.pullZ.dead = true;
    const bz = this.bathZ;
    if (bz && !bz.dead) { if (bz.started) bz.dur = Math.min(bz.dur, bz.t - bz.warn + 0.05); else bz.dead = true; }
    this.pullZ = this.bathZ = null;
    this.pt.rise = 0;
    this.relax();
  }
  onReset() {
    this.onCancel();
    // 부활: 소환한 신부·박쥐 떼는 resetArena 가 지웠다 — 그들이 쏜 탄도 같이 (보스 소유가 아니라 killTransients 가 남긴다)
    for (const e of this.world?.entities ?? []) if (!e.dead && (e.kind === 'projectile' || e.kind === 'hazard') && e.owner?.summoner === this) e.dead = true;
    this.crone = false; this.morph = 0; this.morphT = -1; this.burnT = -1; this.crackT = -1; this.burnK = 0; this.crackK = 0;
    this.w = SIZE_L.w; this.h = SIZE_L.h;
    this.vanishK = 0; this.heals = 0; this.gobBreakT = -9; this.spinT = -9;
    this._forced15 = false; this._gobNow = false; this._breakNow = false; this._stagNow = false; this._gobForce = false;
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    Object.assign(this.arm, ARM.idle); Object.assign(this.armT, ARM.idle);
    this.tzx = this.zx; this.fy = this.A.floor; this.vfy = 0; this.hov = 0;
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 쓰러짐 (체력 0) ═════════════════════════════
  onDeath(world) {
    this.clearJobs();   // 남은 지연 작업이 연출 중에 쏘지 않게
    // 쓰러질 때는 언제나 노파 (50% 를 한 방에 넘겨도). world.onBossDefeated 보다 먼저 — 배너 이름이 처음부터 form2
    this._tr = null; this.applyPhasesTo(Math.max(1, this.phase), world);
    this.dying = 3.2; this.dieT = 0; this._bn = null; this._crumble = false; this._thud = false;
    this.ghost = false; this.cWin = false; this.exposed = false; this.stunned = false; this.gobletUp = false; this.spd = 0; this.lp = null;
    this.wz = this.tl = null; this.vineMode = 'coil';
    this.setPose({ kneel: 1, bow: 0, lean: 0.35, rise: 0, flare: 0.6, hunch: 1 }); this.arms('limp', 6);
    audio.sfx('dark', { vol: 0.5, pitch: 0.5 });
  }
  /**
   * 배너 이름 안전망: 부제는 기본 '격파!' 그대로 (악역 — ex_s24.md §2). 처치 타격 바로 뒤(onHurt)와 쓰러짐 틱에서 새 배너가 뜰 때마다 한 번씩,
   * 부제에 1페이즈 이름(엘제베트)이 남아 있으면 지금 모습의 이름(시든 신부)으로 — onDeath 가 먼저 form2 를 적용하므로 보통은 바꿀 것이 없다
   */
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
    if (!this._thud && T >= 0.5) { this._thud = true; audio.sfx('land', { pitch: 0.6, vol: 0.6 }); world.fx.burst('paper', this.zx, this.fy - 8, 12, { color: RAG, speed: 120, angle: -PI / 2, spread: 1.6 }); }
    const arcade = world.arcade ?? world.mode !== 'story';
    if (arcade) {
      // 아케이드: 무릎 1.2초 → 시든 꽃잎으로 바스러져 3.0초에 사라진다 (파편 폭발 없음 — 꽃잎 입자)
      if (T >= 1.2) {
        if (!this._crumble) { this._crumble = true; audio.sfx('mist', { vol: 0.5, pitch: 0.6 }); }
        this.vanishK = clamp((T - 1.2) / 1.8, 0, 1);
        this.petalAcc += dt * 40 * q * (1 - this.vanishK * 0.6);
        while (this.petalAcc >= 1) {
          this.petalAcc -= 1;
          const P = this.toWorld(rand(-30, 26), -rand(4, 130) * (1 - this.vanishK * 0.7) - this.hov, this._r);
          world.fx.emit('paper', P.x, P.y, { color: Math.random() < 0.5 ? CRIM_D : '#6a2030', speed: rand(40, 120), angle: -PI / 2 - this.facing * 0.6, spread: 1.2, size: rand(3, 5) });
        }
      }
    } else if (this.dying < 0.25) this.dying = 0.25;   // 스토리: 무릎 꿇은 채 남는다 (스테이지가 끝날 때까지 — world.afterClear 는 clearT 7초에)
    this.motion(dt, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    if (this.hidden || this.vanishK >= 1) return;
    const k = this.dying > 0 ? 0.4 * (1 - this.vanishK) : 1;
    const e = this.toWorld(this.pts.eye.x, this.pts.eye.y, { x: 0, y: 0 });
    L.add(e.x, e.y, 60, CRIM, 0.5 * k);
    L.add(this.zx, this.fy - 80 - this.hov, 200, this.crone ? ASH : ROSE, 0.3 * k);
    if (this.gobletUp) { const G = this.toWorld(this.pts.gob.x, this.pts.gob.y, { x: 0, y: 0 }); L.add(G.x, G.y, 110, GOLD, 0.8); }
    if (this.vineGlow > 0.05) { const H = this.toWorld(this.pts.hdF.x, this.pts.hdF.y, { x: 0, y: 0 }); L.add(H.x, H.y, 90, CRIM, 0.6 * this.vineGlow); }
    if (this.cWin) L.add(this.zx, this.fy - 80, 160, '#ffffff', 0.6);
  }

  // ═════════════════════════════ 그리기 (벡터) ═════════════════════════════
  bodyAlpha() { return 1 - this.vanishK; }
  paintBack(ctx, world) {
    if (R.fl) return;
    if (this.crone && this.dying <= 0) glowE(ctx, this.zx, this.fy - 4, 46, 8, CRIM, 0.18);   // 떠 있는 노파 아래 핏빛 그림자
  }
  paintBody(ctx, world, flash) {
    const a = this.bodyAlpha();
    if (a <= 0.01 || this.ghost) return;
    const fl = R.fl;
    ctx.save();
    ctx.translate(this.zx, this.fy);
    ctx.scale(this.fk || 0.001, 1);
    ctx.globalAlpha *= a;
    const m = this.morph;
    if (m < 1) { ctx.save(); ctx.globalAlpha *= 1 - m; this.drawLady(ctx, fl); ctx.restore(); }
    if (m > 0) { ctx.save(); ctx.globalAlpha *= m; this.drawCrone(ctx, fl); ctx.restore(); }
    ctx.restore();
  }
  paintFront(ctx, world) {
    if (R.fl || this.ghost) return;
    if (this.cWin || this.gobletUp) { const e = this.toWorld(this.pts.eye.x, this.pts.eye.y, this._r); glow(ctx, e.x, e.y, 12, CRIM, 0.8); }
  }
  /** 귀부인 (지역 좌표: 원점 = 발 가운데, +x = 얼굴 쪽) */
  drawLady(ctx, fl) {
    const lash = this.vineMode === 'lash';
    this.drawArm(ctx, true, fl, false);
    if (!lash) drawVine(ctx, this.vine, fl, this.vineGlow);
    this.drawTrain(ctx, fl);
    drawStrand(ctx, this.veil, 9, 2, fl ? '#fff' : rgba(LACE, 0.85), fl ? null : rgba(ASH, 0.25 * (1 - this.burnK)));
    if (this.burnK > 0 && !fl) drawStrand(ctx, this.veil, 9 * this.burnK, 1, rgba('#a8a0a8', 0.6 * this.burnK), null);
    this.drawSkirt(ctx, fl);
    this.drawBodice(ctx, fl);
    this.drawHeadL(ctx, fl);
    if (lash) drawVine(ctx, this.vine, fl, this.vineGlow);
    this.drawArm(ctx, false, fl, false);
    if (!(this.gobBreakT > 0 && this.t - this.gobBreakT < 1.5)) drawGoblet(ctx, this.pts.gob.x, this.pts.gob.y, fl, this.gobletUp ? 1 : 0, this.t);
  }
  /** 노파 (지역 좌표) */
  drawCrone(ctx, fl) {
    const lash = this.vineMode === 'lash';
    this.drawArm(ctx, true, fl, true);
    if (!lash) drawVine(ctx, this.vine, fl, this.vineGlow);
    for (let r = 2; r >= 0; r--) drawStrand(ctx, this.rags[r], 11 - r * 1.5, 3, fl ? '#fff' : r === 1 ? RAG_D : RAG, fl ? null : rgba(CRIM, 0.35), true);
    for (const H of this.hair) drawStrand(ctx, H, 5, 1.5, fl ? '#fff' : WHITE, fl ? null : rgba('#b8b0c0', 0.7));
    this.drawTorsoC(ctx, fl);
    this.drawHeadC(ctx, fl);
    if (lash) drawVine(ctx, this.vine, fl, this.vineGlow);
    this.drawArm(ctx, false, fl, true);
    if (!(this.gobBreakT > 0 && this.t - this.gobBreakT < 1.5)) drawGoblet(ctx, this.pts.gob.x, this.pts.gob.y, fl, this.gobletUp ? 1 : 0, this.t);
  }
  /** 끌자락: 치마 뒷단에서 바닥을 따라 뒤로 (위 가장자리 = 점 + 위로 폭, 아래 = 바닥) */
  drawTrain(ctx, fl) {
    const Tr = this.train, n = TRAIN_N;
    ctx.beginPath();
    ctx.moveTo(Tr[0].x, Tr[0].y - 18);
    for (let i = 1; i <= n; i++) { const w = 18 * (1 - i / (n + 1)) + 3; ctx.lineTo(Tr[i].x, Tr[i].y - w); }
    ctx.quadraticCurveTo(Tr[n].x - 8, Tr[n].y, Tr[n].x - 2, Tr[n].y + 1);
    for (let i = n; i >= 0; i--) ctx.lineTo(Tr[i].x, Tr[i].y + 1);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bd_train', 0, -20, 0, 0, [0, CRIM, 1, CRIM_D]), 1.2);
    if (fl) return;
    ctx.strokeStyle = rgba(BLACK, 0.7); ctx.lineWidth = 1.6; ctx.beginPath();   // 레이스 단
    for (let i = 0; i <= n; i++) { const x = Tr[i].x, y = Tr[i].y; if (i) ctx.lineTo(x, y - 1); else ctx.moveTo(x, y - 1); }
    ctx.stroke();
  }
  /** 치마: 허리에서 바닥까지 종 모양 (단은 물결 · 검은 레이스) */
  drawSkirt(ctx, fl) {
    const P = this.pts, H = P.hip, F = P.hemF, B = P.hemB, t = this.t, sw = Math.sin(t * 2.4) * 2 + this.walkK * 3;
    ctx.beginPath();
    ctx.moveTo(H.x + 9, H.y - 3);
    ctx.quadraticCurveTo(H.x + 12 + (F.x - H.x) * 0.25, (H.y + F.y) * 0.5, F.x + sw, F.y);
    const n = 7;
    for (let i = 1; i <= n; i++) { const u = i / n; ctx.lineTo(lerp(F.x + sw, B.x, u), F.y - (i % 2 ? 3 : 0) - Math.sin(t * 3 + i) * 0.6); }
    ctx.quadraticCurveTo(H.x - 14 + (B.x - H.x) * 0.3, (H.y + B.y) * 0.5, H.x - 10, H.y - 3);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bd_skirt', -20, -80, 20, 0, [0, CRIM_H, 0.35, CRIM, 1, CRIM_D]), 1.4);
    if (fl) return;
    // 앞판의 검은 레이스 띠 · 주름
    ctx.strokeStyle = rgba(BLACK, 0.55); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(H.x + 7, H.y); ctx.quadraticCurveTo(H.x + 9 + (F.x - H.x) * 0.2, (H.y + F.y) * 0.5, F.x - 4 + sw, F.y - 2); ctx.stroke();
    ctx.strokeStyle = rgba(CRIM_D, 0.8); ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { const u = 0.3 + i * 0.2; ctx.beginPath(); ctx.moveTo(H.x + lerp(4, -6, u), H.y + 8); ctx.lineTo(lerp(F.x, B.x, u) + sw * 0.5, F.y - 4); ctx.stroke(); }
    ctx.fillStyle = BLACK;
    for (let i = 0; i < 8; i++) { const u = i / 7; ctx.beginPath(); ctx.arc(lerp(F.x + sw, B.x, u), F.y - 1.5, 2.6, PI, TAU); ctx.fill(); }
  }
  /** 몸통(귀부인): 가는 허리 · 진홍 코르셋 · 검은 레이스 목깃 */
  drawBodice(ctx, fl) {
    const P = this.pts, H = P.hip, N = P.neck, ta = P.tA, c = Math.cos(ta), s = Math.sin(ta);
    const at = (u, side) => ({ x: lerp(H.x, N.x, u) + c * side, y: lerp(H.y, N.y, u) + s * side });
    const f0 = at(0, 8), f1 = at(0.55, 11), f2 = at(0.92, 8), b2 = at(1, -7), b1 = at(0.5, -9), b0 = at(0, -9);
    ctx.beginPath();
    ctx.moveTo(f0.x, f0.y); ctx.quadraticCurveTo(f1.x + 2, f1.y, f2.x, f2.y); ctx.lineTo(b2.x, b2.y); ctx.quadraticCurveTo(b1.x - 1, b1.y, b0.x, b0.y); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bd_bodice', -10, -130, 10, -70, [0, CRIM_H, 0.5, CRIM, 1, CRIM_D]), 1.5);
    if (fl) return;
    // 코르셋 끈 · 레이스 목깃 · 허리 띠
    ctx.strokeStyle = rgba(BLACK, 0.6); ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) { const p0 = at(i * 0.16, 6), p1 = at(i * 0.16 + 0.08, 2); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
    const n0 = at(1, 5), n1 = at(1, -6);
    ctx.beginPath(); ctx.moveTo(n0.x, n0.y + 2); ctx.lineTo(n0.x + 1, n0.y - 8); ctx.lineTo(n1.x - 1, n1.y - 9); ctx.lineTo(n1.x, n1.y + 2); ctx.closePath(); ink(ctx, LACE, 1);
    const w0 = at(0.05, 8.5), w1 = at(0.05, -9.5);
    ctx.strokeStyle = BLACK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w0.x, w0.y); ctx.lineTo(w1.x, w1.y); ctx.stroke();
    glow(ctx, at(0.05, 7).x, at(0.05, 7).y, 4, GOLD, 0.5);
  }
  /** 머리(귀부인): 매끈한 옆얼굴 · 붉은 눈 · 검은 쪽 · 장미 관 (전환 중: crackK 만큼 금이 번지고 머리가 하얗게) */
  drawHeadL(ctx, fl) {
    const P = this.pts, h = P.head, t = this.t, ck = this.crackK;
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(P.hA);
    const hairC = fl ? '#fff' : ck > 0 ? mixHex(HAIR, WHITE, ck) : HAIR;
    ctx.beginPath(); ctx.ellipse(-6, -2, 8, 9, 0.2, 0, TAU); ink(ctx, hairC, 1);   // 뒷머리 쪽
    ctx.beginPath();
    ctx.moveTo(-6, -8); ctx.quadraticCurveTo(4, -11, 7, -5); ctx.lineTo(10.5, 0.5); ctx.lineTo(7.5, 2); ctx.lineTo(8, 4.5); ctx.quadraticCurveTo(6, 9, 1, 9.5); ctx.quadraticCurveTo(-5, 9, -7, 3); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bd_face', -6, -6, 10, 8, [0, SKIN_D, 0.5, SKIN, 1, '#fffaf6']), 1.2);
    if (!fl) {
      ctx.fillStyle = '#a0102a'; ctx.beginPath(); ctx.ellipse(7.2, 5.4, 1.6, 0.9, 0.1, 0, TAU); ctx.fill();   // 입술
      ctx.fillStyle = BLACK; ctx.beginPath(); ctx.ellipse(4.5, -3, 2.4, 1.3, 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = CRIM_H; ctx.beginPath(); ctx.arc(5, -3, 1.1, 0, TAU); ctx.fill();
      glow(ctx, 5, -3, 6, CRIM, 0.5 + 0.2 * Math.sin(t * 3));
      if (ck > 0) {   // 도자기에 금이 간다
        ctx.strokeStyle = rgba('#3a1a20', 0.8 * ck); ctx.lineWidth = 0.7; ctx.beginPath();
        ctx.moveTo(-2, -7); ctx.lineTo(1, -2); ctx.lineTo(-1, 2); ctx.lineTo(3, 7 * ck);
        ctx.moveTo(1, -2); ctx.lineTo(5, 1); ctx.moveTo(6, -7); ctx.lineTo(3, -5 + 3 * ck);
        ctx.stroke();
      }
    }
    // 앞머리 · 장미 관 (전환 중에는 시든다)
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.quadraticCurveTo(-2, -14, 7, -7); ctx.quadraticCurveTo(1, -9, -4, -5); ctx.closePath(); ink(ctx, hairC, 1);
    for (let i = 0; i < 5; i++) {
      const x = -8 + i * 3.6, y = -12 - Math.sin(i * 0.8) * 1.5, r = 2.6 - (i % 2) * 0.4;
      drawRose(ctx, x, y, r, fl, ck);
    }
    ctx.restore();
  }
  /** 몸통(노파): 굽은 등 · 해진 드레스 · 앙상한 쇄골 */
  drawTorsoC(ctx, fl) {
    const P = this.pts, H = P.hip, N = P.neck, ta = P.tA, c = Math.cos(ta), s = Math.sin(ta);
    const at = (u, side) => ({ x: lerp(H.x, N.x, u) + c * side, y: lerp(H.y, N.y, u) + s * side });
    const f0 = at(0, 9), f1 = at(0.5, 9), f2 = at(0.92, 7), b2 = at(1, -9), b1 = at(0.5, -14), b0 = at(0, -11);
    ctx.beginPath();
    ctx.moveTo(f0.x, f0.y); ctx.quadraticCurveTo(f1.x, f1.y, f2.x, f2.y); ctx.lineTo(b2.x, b2.y); ctx.quadraticCurveTo(b1.x - 4, b1.y, b0.x, b0.y);
    for (let i = 0; i < 4; i++) { const p = at(-0.08 - (i % 2) * 0.1, -11 + i * 6.5); ctx.lineTo(p.x, p.y); }
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bd_ctorso', -10, -130, 10, -60, [0, RAG, 0.6, RAG_D, 1, BLACK]), 1.5);
    if (fl) return;
    ctx.strokeStyle = rgba(CRONE_D, 0.9); ctx.lineWidth = 1;   // 드러난 갈비
    for (let i = 0; i < 3; i++) { const p0 = at(0.55 + i * 0.1, 7), p1 = at(0.5 + i * 0.1, 1); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
    ctx.strokeStyle = rgba(CRIM, 0.4); ctx.lineWidth = 1.4;   // 해진 실밥
    for (let i = 0; i < 4; i++) { const p0 = at(0.1 + i * 0.2, -12); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p0.x - 4, p0.y + 5); ctx.stroke(); }
  }
  /** 머리(노파): 금 간 도자기 얼굴 · 움푹한 붉은 눈 · 흰 머리 · 시든 장미 관 */
  drawHeadC(ctx, fl) {
    const P = this.pts, h = P.head, t = this.t;
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(P.hA);
    ctx.beginPath(); ctx.ellipse(-6, -1, 9, 10, 0.3, 0, TAU); ink(ctx, fl ? '#fff' : WHITE, 1);   // 흰 머리
    ctx.beginPath();
    ctx.moveTo(-6, -8); ctx.quadraticCurveTo(4, -12, 7, -5); ctx.lineTo(11.5, 1.5); ctx.lineTo(8, 2.5); ctx.lineTo(8.5, 5); ctx.quadraticCurveTo(5, 11, -1, 10); ctx.quadraticCurveTo(-6, 8, -7, 2); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bd_cface', -6, -6, 10, 8, [0, CRONE_D, 0.5, CRONE, 1, '#ece2d6']), 1.2);
    if (!fl) {
      ctx.strokeStyle = 'rgba(40,16,20,0.85)'; ctx.lineWidth = 0.8; ctx.beginPath();   // 금 (얼굴 전체)
      ctx.moveTo(-4, -8); ctx.lineTo(0, -3); ctx.lineTo(-2, 2); ctx.lineTo(2, 9); ctx.moveTo(0, -3); ctx.lineTo(6, 0); ctx.lineTo(9, 4);
      ctx.moveTo(5, -9); ctx.lineTo(3, -5); ctx.moveTo(-2, 2); ctx.lineTo(-6, 4); ctx.stroke();
      ctx.fillStyle = '#1a0a0e'; ctx.beginPath(); ctx.ellipse(4.5, -2.5, 3, 2, 0.1, 0, TAU); ctx.fill();   // 움푹한 눈
      ctx.fillStyle = CRIM_H; ctx.beginPath(); ctx.arc(5, -2.5, 1.2, 0, TAU); ctx.fill();
      glow(ctx, 5, -2.5, 8, CRIM, 0.55 + 0.25 * Math.sin(t * 4));
      ctx.fillStyle = '#3a1418'; ctx.fillRect(4, 6, 4, 1.2);   // 마른 입
    }
    for (let i = 0; i < 4; i++) drawRose(ctx, -8 + i * 4, -13 - Math.sin(i) * 1.2, 2.2, fl, 1);
    ctx.restore();
  }
  /** 팔: 귀부인 = 진홍 소매(레이스 커프스) · 창백한 손 / 노파 = 앙상한 팔 · 긴 손톱 */
  drawArm(ctx, far, fl, crone) {
    const P = this.pts, S = far ? P.shF : P.shN, E = far ? P.elF : P.elN, H = far ? P.hdF : P.hdN;
    const col = fl ? '#fff' : crone ? (far ? CRONE_D : CRONE) : far ? CRIM_D : CRIM;
    limb(ctx, S.x, S.y, E.x, E.y, crone ? 3.4 : 4.4, crone ? 2.8 : 3.8, col, far ? null : crone ? '#f0e8dc' : CRIM_H);
    limb(ctx, E.x, E.y, H.x, H.y, crone ? 2.8 : 3.8, crone ? 2.2 : 3.2, col, far ? null : crone ? '#f0e8dc' : CRIM_H);
    const fa = Math.atan2(H.y - E.y, H.x - E.x);
    if (!fl && !crone) { const x = lerp(E.x, H.x, 0.85), y = lerp(E.y, H.y, 0.85); ctx.fillStyle = BLACK; ctx.beginPath(); ctx.ellipse(x, y, 2.6, 4.6, fa, 0, TAU); ctx.fill(); }   // 레이스 커프스
    if (!fl && crone) { ctx.strokeStyle = rgba(RAG, 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(lerp(S.x, E.x, 0.6), lerp(S.y, E.y, 0.6) + 3); ctx.stroke(); }   // 넝마 소매
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(fa);
    ctx.beginPath(); ctx.ellipse(1.5, 0, 3.6, 2.6, 0, 0, TAU); ink(ctx, fl ? '#fff' : crone ? (far ? CRONE_D : CRONE) : far ? SKIN_D : SKIN, 1);
    if (crone && !fl) {   // 긴 손톱
      ctx.strokeStyle = '#e8d8a0'; ctx.lineWidth = 1.1; ctx.beginPath();
      for (let i = 0; i < 3; i++) { ctx.moveTo(4, -1.5 + i * 1.5); ctx.quadraticCurveTo(9, -2 + i * 1.6, 12, 1 + i * 1.8); }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ═════════════════════════════ 그리기 도우미 ═════════════════════════════
const OUTL = 'rgba(6,4,8,0.9)';
function mixHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp(pa >> 16, pb >> 16, k)), g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k)), bl = Math.round(lerp(pa & 255, pb & 255, k));
  return `rgb(${r},${g},${bl})`;
}
/** 끝이 가는 팔다리 (외곽선 + 위쪽 광택) — e_hagen.js 와 같다 */
function limb(ctx, x0, y0, x1, y1, r0, r1, col, hi) {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
  ctx.beginPath();
  ctx.moveTo(x0 + nx * r0, y0 + ny * r0); ctx.lineTo(x1 + nx * r1, y1 + ny * r1);
  ctx.arc(x1, y1, r1, a + PI / 2, a - PI / 2, true);
  ctx.lineTo(x0 - nx * r0, y0 - ny * r0);
  ctx.arc(x0, y0, r0, a - PI / 2, a + PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = OUTL; ctx.lineWidth = 1.3; ctx.stroke();
  if (hi) { ctx.strokeStyle = rgba(hi, 0.7); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x0 - nx * r0 * 0.5, y0 - ny * r0 * 0.5); ctx.lineTo(x1 - nx * r1 * 0.5, y1 - ny * r1 * 0.5); ctx.stroke(); }
}
/** 점 띠 (베일·머리채·넝마 자락): 뿌리 폭 w0 → 끝 폭 w1 의 가늘어지는 띠. ragged = 끝이 톱니 */
function drawStrand(ctx, S, w0, w1, col, hi, ragged = false) {
  const n = S.length - 1;
  if (n < 1) return;
  const L = [], Rr = [];
  for (let i = 0; i <= n; i++) {
    const a = S[Math.min(n, i + 1)], b = S[Math.max(0, i - 1)], ang = Math.atan2(a.y - b.y, a.x - b.x), w = lerp(w0, w1, i / n) / 2;
    L.push([S[i].x - Math.sin(ang) * w, S[i].y + Math.cos(ang) * w]); Rr.push([S[i].x + Math.sin(ang) * w, S[i].y - Math.cos(ang) * w]);
  }
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i <= n; i++) ctx.lineTo(L[i][0], L[i][1]);
  if (ragged) { const e = S[n]; ctx.lineTo(e.x - 2, e.y + 5); ctx.lineTo(e.x + 1, e.y + 1); ctx.lineTo(e.x + 3, e.y + 6); }
  for (let i = n; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = OUTL; ctx.lineWidth = 1; ctx.stroke();
  if (hi) { ctx.strokeStyle = hi; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(S[0].x, S[0].y); for (let i = 1; i <= n; i++) ctx.lineTo(S[i].x, S[i].y); ctx.stroke(); }
}
/** 가시 덩굴 채찍 (점 9개): 굵은 덩굴 + 가시, 빛(glow 0..1)이면 붉게 */
function drawVine(ctx, V, fl, gk) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = fl ? '#fff' : VINE_D; ctx.lineWidth = 4.2;
  ctx.beginPath(); ctx.moveTo(V[0].x, V[0].y); for (let i = 1; i < V.length; i++) ctx.lineTo(V[i].x, V[i].y); ctx.stroke();
  if (fl) return;
  ctx.strokeStyle = gk > 0.05 ? mixHex(VINE, '#c02040', gk) : VINE; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(V[0].x, V[0].y); for (let i = 1; i < V.length; i++) ctx.lineTo(V[i].x, V[i].y); ctx.stroke();
  ctx.fillStyle = THORN;
  for (let i = 1; i < V.length; i++) {
    const a = V[i - 1], b = V[i], ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, sd = i % 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(mx - Math.cos(ang) * 2, my - Math.sin(ang) * 2); ctx.lineTo(mx - Math.sin(ang) * 5 * sd, my + Math.cos(ang) * 5 * sd); ctx.lineTo(mx + Math.cos(ang) * 2, my + Math.sin(ang) * 2); ctx.fill();
  }
  if (gk > 0.05) { const e = V[V.length - 1]; glow(ctx, e.x, e.y, 10, CRIM, 0.6 * gk); }
}
/** 장미 한 송이 (wither 0..1 = 시들어 검붉게) — 채색 퍼핏이 준비됐으면 rose 부품 */
function drawRose(ctx, x, y, r, fl, wither = 0) {
  ctx.fillStyle = fl ? '#fff' : wither > 0 ? mixHex(CRIM, '#3a1418', wither) : CRIM;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  if (fl) return;
  ctx.strokeStyle = wither > 0.5 ? '#1a0a0c' : '#600a1a'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.arc(x + 0.3, y - 0.2, r * 0.55, 0.5, 4.8); ctx.stroke();
}
/** 금빛 성배 (원점 = 잔 가운데). up = 머리 위로 든 동안 빛남 */
function drawGoblet(ctx, x, y, fl, up, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.moveTo(-6.5, -5); ctx.lineTo(6.5, -5); ctx.quadraticCurveTo(6, 3, 1.4, 4.5); ctx.lineTo(1.2, 9); ctx.lineTo(4.5, 11); ctx.lineTo(-4.5, 11); ctx.lineTo(-1.2, 9); ctx.lineTo(-1.4, 4.5); ctx.quadraticCurveTo(-6, 3, -6.5, -5); ctx.closePath();
  ink(ctx, fl ? '#fff' : LG(ctx, 'bd_gob', -6, -5, 6, 11, [0, '#fff0b0', 0.4, GOLD, 1, GOLD_D]), 1.1);
  if (!fl) {
    ctx.fillStyle = BLOOD; ctx.beginPath(); ctx.ellipse(0, -5, 6, 1.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = CRIM_H; ctx.fillRect(-1.5, -1, 1.6, 1.6); ctx.fillRect(2, -2, 1.4, 1.4);   // 루비
    if (up) glow(ctx, 0, 0, 16, GOLD, 0.45 + 0.25 * Math.sin(t * 8));
  }
  ctx.restore();
}
/** 회전 베기 자국 (원 둘레 호 두 겹) */
function paintSpin(ctx, x, y, r, z, col) {
  const a = 1 - z.a;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [lw, c, al, rr] of [[12, col, 0.4, 0.9], [3, '#ffffff', 0.9, 0.85]]) {
    ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.ellipse(x, y, r * rr, r * rr * 0.42, 0, z.a * TAU, z.a * TAU + PI * 1.4); ctx.stroke();
  }
}
/** 가시 채찍 판정 (띠 사각형 안): 붉은 덩굴이 휘몰아친 자국 */
function paintLash(ctx, z, f) {
  const a = 1 - z.a, x0 = f > 0 ? z.x : z.x + z.w, x1 = f > 0 ? z.x + z.w : z.x, cy = z.y + z.h / 2;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [lw, c, al] of [[z.h * 0.7, CRIM, 0.45], [3, '#ffd0d8', 0.9]]) {
    ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0, cy);
    for (let i = 1; i <= 8; i++) { const u = i / 8; ctx.lineTo(lerp(x0, x1, u), cy + Math.sin(u * 9 + z.t * 30) * z.h * 0.2); }
    ctx.stroke();
  }
}
/** 장미 기둥: 예고 = 바닥 장미 표시 + 손에서 날아가는 장미 / 판정 = 솟구치는 핏물 */
function paintRoseColumn(ctx, z, hx, hy, x, fl, w, h, warn, world) {
  if (!z.started) {
    const k = clamp(z.t / warn, 0, 1);
    warnFloor(ctx, x, fl, w * 1.3, k, CRIM, world.time);
    const fk = clamp(z.t / Math.min(0.5, warn), 0, 1);
    if (fk < 1) {
      const rx = lerp(hx, x, fk), ry = lerp(hy, fl - 6, fk) - Math.sin(fk * PI) * 120;
      drawRosePart(ctx, world, rx, ry, 1, z.t * 12);
    } else drawRosePart(ctx, world, x, fl - 5, 1 - (k - fk * 0.6) * 0.3, 0);
    return;
  }
  const f = 1 - z.a, rise = clamp(z.a / 0.25, 0, 1), hh = h * rise;
  glowE(ctx, x, fl - hh / 2, w * 0.7, hh / 2 + 8, CRIM, 0.85 * f);
  ctx.fillStyle = rgba(BLOOD, 0.85 * f); ctx.fillRect(x - w * 0.32, fl - hh, w * 0.64, hh);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffb0c0', 0.55 * f); ctx.fillRect(x - w * 0.08, fl - hh, w * 0.16, hh);
}
/** 장미 한 송이 (월드): 채색 퍼핏이 준비됐으면 그 rose 부품, 아니면 벡터 */
const ROSE_W = 22;
function drawRosePart(ctx, w, x, y, s, spin) {
  const rig = paintedEnabled?.(w?.game) ? paintedRig?.('b_bride') : null;
  const p = rig?.parts?.rose, im = p?.v?.base;
  ctx.save(); ctx.translate(x, y); if (spin) ctx.rotate(spin);
  if (im && p.c) { const k = (ROSE_W * s) / Math.max(1, p.w - p.pad * 2); ctx.scale(k, k); ctx.drawImage(im, -p.c[0], -p.c[1]); ctx.restore(); return; }
  ctx.scale(s, s);
  ctx.strokeStyle = VINE; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-10, 2); ctx.lineTo(-2, 0); ctx.stroke();
  drawRose(ctx, 2, 0, 5.5, false, 0);
  glow(ctx, 2, 0, 10, CRIM, 0.4);
  ctx.restore();
}
/** 피의 욕조: 예고 = 거품이 이는 바닥 띠 / 판정 = 출렁이는 핏물 / recede = 0.4초에 빠진다 */
function paintBath(ctx, A, z, w, mode) {
  const top = z.y, bot = z.y + z.h, t = w.time ?? z.t;
  if (mode === 'warn') {
    warnRect(ctx, z.x, z.y, z.w, z.h, z.k, CRIM, t);
    ctx.fillStyle = rgba(BLOOD, 0.5 * z.k);
    for (let i = 0; i < 18; i++) { const x = A.x0 + ((i * 97.3 + t * 40) % A.w), y = bot - 4 - ((i * 13 + t * 60) % 20) * z.k; ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, TAU); ctx.fill(); }
    return;
  }
  const k = mode === 'recede' ? 1 - z.a : Math.min(1, z.t / 0.25), lvl = lerp(bot, top, k);
  ctx.fillStyle = rgba(BLOOD, 0.78);
  ctx.beginPath(); ctx.moveTo(A.x0, bot);
  for (let x = A.x0; x <= A.x1 + 1; x += 24) ctx.lineTo(x, lvl + Math.sin(x * 0.03 + t * 3) * 4 + Math.sin(x * 0.07 - t * 2) * 2);
  ctx.lineTo(A.x1, bot); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(CRIM_H, 0.7); ctx.lineWidth = 2.4; ctx.beginPath();
  for (let x = A.x0; x <= A.x1 + 1; x += 24) { const y = lvl + Math.sin(x * 0.03 + t * 3) * 4 + Math.sin(x * 0.07 - t * 2) * 2; if (x === A.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
}
/** 성배의 금빛 고리 (성배 판정을 따라간다) */
function paintGobRing(ctx, b, z) {
  const G = b.pGob, x = G.x + G.w / 2, y = G.y + G.h / 2, k = 0.6 + 0.4 * Math.sin(z.t * 10);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(GOLD, 0.7 * k); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, G.w * 0.5 + 2 * Math.sin(z.t * 6), 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba('#fff4c0', 0.5 * k); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, G.w * 0.36, z.t * 3, z.t * 3 + PI * 1.3); ctx.stroke();
}
/** 박쥐 (작은 실루엣, 날갯짓 ph) */
function drawBat(ctx, x, y, s, ph) {
  const fl = Math.sin(ph) * 0.8;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = BLACK;
  ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 2.4, 0, 0, TAU); ctx.fill();
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 2, -1); ctx.quadraticCurveTo(sd * 7, -5 - fl * 5, sd * 11, -1 - fl * 6); ctx.quadraticCurveTo(sd * 8, 1, sd * 6, 2.5); ctx.quadraticCurveTo(sd * 4, 1, sd * 2, 1.5); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = ROSE; ctx.fillRect(1, -1, 1, 1); ctx.fillRect(-2, -1, 1, 1);
  ctx.restore();
}
/** 박쥐로 흩어져 옮겨 감 (판정 없음): (x0,y0) 에서 흩어져 (x1,y1) 로 모인다 (하네스 지대 — 벡터·채색 모두에서 보인다) */
function batsZone(b, x0, y0, x1, y1, dur) {
  const N = 7, seed = rand(0, 100);
  b.zone({ x: Math.min(x0, x1) - 80, y: Math.min(y0, y1) - 80, w: Math.abs(x1 - x0) + 160, h: Math.abs(y1 - y0) + 160, warn: 0, life: dur + 0.12, harmless: true, z: 7, data: { bats: true },
    paint: (ctx, z) => {
      const k = clamp(z.t / dur, 0, 1), sp = Math.sin(k * PI);
      for (let i = 0; i < N; i++) {
        const a = seed + i * 2.4, r = 40 + (i % 3) * 18;
        const x = lerp(x0, x1, k) + Math.cos(a) * r * sp, y = lerp(y0, y1, k) + Math.sin(a) * r * 0.6 * sp - 30 * sp;
        drawBat(ctx, x, y, 1.3, z.t * 40 + i);
      }
    } });
}
/** 젊은 날의 잔상: 예고 동안 귀부인 실루엣이 그 자리에 떠오르고(반투명 장미빛), 판정 때 한 바퀴 돈다 */
function paintAfterimage(ctx, x, floor, f, z, r) {
  const g = GHOST;
  const k = z.started ? 1 - z.a : clamp(z.t / Math.max(0.01, z.warn), 0, 1);
  if (g) {
    const spin = z.started ? Math.cos(z.a * TAU) : 1;
    ctx.save(); ctx.translate(x, floor); ctx.scale(f * (Math.abs(spin) < 0.05 ? 0.05 * Math.sign(spin || 1) : spin), 1);
    ctx.globalAlpha *= 0.55 * k;
    ctx.drawImage(g.c, -g.ox, -g.oy);
    ctx.restore();
  } else glowE(ctx, x, floor - 75, 28, 75, ROSE, 0.4 * k);
  if (z.started) paintSpin(ctx, x, floor - 70, r, z, ROSE);
}
/** 잔상 실루엣 굽기 (한 번): 귀부인 왈츠 자세를 벡터로 그려 장미빛 단색으로 */
function bakeGhost(b) {
  if (GHOST || typeof document === 'undefined') return;
  try {
    const c = document.createElement('canvas'); c.width = 200; c.height = 190;
    const g = c.getContext('2d'), ox = 100, oy = 176;
    const save = { arm: { ...b.arm }, flare: b.ps.flare, fk: b.fk };
    Object.assign(b.arm, ARM.waltz); b.ps.flare = 0.45; b.fk = 1;
    b.rig(); b.rigStrands(0);
    g.translate(ox, oy); b.drawLady(g, false);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in';
    const gr = g.createLinearGradient(0, 0, 0, 190); gr.addColorStop(0, '#ffd6e0'); gr.addColorStop(1, ROSE);
    g.fillStyle = gr; g.fillRect(0, 0, 200, 190);
    Object.assign(b.arm, save.arm); b.ps.flare = save.flare; b.fk = save.fk; b.rig(); b.rigStrands(0);
    GHOST = { c, ox, oy };
  } catch (e) { GHOST = null; }
}

/** 벡터 그림 컬링 대리 개체 (e_hagen.js 와 같은 방식): 보스의 artBounds() 를 사각형으로 삼아 보스 draw 를 대신 부른다 */
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
