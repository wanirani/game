// 보스 b_charon — 카론 / 사신의 마부 (s25 외전 「불탄 목장의 밤」) — docs/specs/ex_s25.md §2. 소유: EX5-BOSS
// BossC(c_common.js) 상속. 두 모습·전환·15% 강제·1페이즈 창 상한은 e_bride.js(wither · check15 · DANCE_CAP/STAG_CAP)와 같은 틀, 소환은 spawnMinion,
// 판정은 c_common 키트. 새로 쓰는 것은 셋뿐: 마차 돌진 이동(바닥을 따라 벽 앞까지) · 크기 교체(마차 200×130 → 사람 66×168) · 말 둘 그리기.
// 그림은 벡터(채색이 없거나 실패해도 모든 상태가 그려진다); 채색 퍼핏(render/painted/bosses/b_charon.js)은 이 논리를 읽기만 하고,
// 말 둘은 채색이든 벡터든 이 파일의 drawHorses() 가 벡터 탈것 리그(render/mounts.js drawMount, 'horse' 템플릿, id mt_morgen)로 그린다.
//
// 모습: 1페이즈 = 오른쪽(facing)으로 달리는 검은 영구 마차 — 옻칠한 검은 상자(금박 테 · 유리창 너머의 관), 지붕 난간에 쌓인 관(roofN),
//   앞 모서리 등불 둘(녹청 혼불), 큰 살바퀴 둘, 끌채 — 와 앞쪽 마부석에 앉은 키 큰 마부(높은 모자 · 겹망토 외투 · 해골 같은 잿빛 얼굴 · 긴 채찍).
//   마차를 끄는 말 둘은 혼(판정 없음): 가까운 말 = 모르겐(투명도 0.85 + 녹청 빛 + 굴레 줄), 먼 말 = 헤이즐(같은 그림의 어두운 녹청 tint).
//   2페이즈 = 잔해에서 일어선 마부 혼자 — 끊어진 고삐를 사슬처럼 감아쥔 먼 손, 등불을 든 가까운 손.
// 판정 부위 (가까운 부위 우선, defMul = 방어 배율 — 작을수록 아프다, s23 VERIFY 교훈): 1페이즈 마부(마부석) 0.85 — 노릴 곳(점프로 닿는다) ·
//   마차 몸통 1.0 · 바퀴 둘 1.15 · 혼불 등불(부푼 동안만, 플레이어·탈것 한 대로 꺼짐). 말은 판정 없음.
//   2페이즈 머리(모자) 0.85 · 몸통 1.0 · 외투 자락 1.15. 무릎(stagger) 몸통 0.7 · 머리 0.6 (15% 긴 주저앉음 몸통 0.6) · 등불 노출 마부 0.7 ·
//   망자 부르기 노출 몸통 0.7. 빈 영구차(마차 혼)·쓰러짐 중에는 판정 없음.
// 패턴 (static PATTERNS — docs/specs/ex_s25.md §2.1): deathRun(영구차 질주 · 카운터 창) · whipCrack(마부의 채찍) · coffinDrop(관 떨구기) ·
//   soulLantern(혼불 등불 — 끊으면 노출, 못 끊으면 도깨비불·혼불) · rearStomp(앞발 짓밟기) · reinChain(고삐 사슬) · lanternSwing(혼불 휘두르기) ·
//   toll(통행료) · hearseGhost(빈 영구차 — 전환 직후 강제) · gatherSouls(망자 부르기 · 노출) · 보조 stagger · lastLoad(15%).
//   모든 공격은 어느 모습에서든 돈다 (debugAct — 마차가 없으면 마부가, 마부가 마부석에 있으면 마부석에서).
//   창 상한(POLISH-4 교훈, 처음부터, RUN_CAP · STAG_CAP · LANTERN_CAP · takeHit): 1페이즈 질주 한 번(경고·돌진·카운터 창) 12% · 무릎 한 번 10% ·
//   등불 노출 한 번 8% 까지만 잃는다. 수호신 자동 공격은 등불을 끄지도, 카운터 창을 열지도 않는다 (플레이어·탈것 공격만 '한 대').
//   전환 unbridle (1: 무적 2.6초, 0.3초 휘파람 → 0.6초 굴레가 끊어짐 → 말 둘이 경기장 밖으로 달려 빛으로 → 1.2초 마차가 기울어 나뒹굴고 부서짐 →
//   2.0초 마부가 잔해에서 일어섬 (판정 66×168, 발 = 마차 가운데 x · A.floor, form2 칭호) → 대사 b_charon_unbridle → 곧바로 hearseGhost).
//   15% 이하 한 번: 다음 틱에 하던 패턴을 끊고 lastLoad (스토리·처음이면 대사 b_charon_last → 그림메인이 들이받아 2.5초 긴 주저앉음,
//   아케이드·다시 볼 때는 올가미가 보통 공격 warnLine → strikeLine).
// 모든 패턴은 this.A(경기장 경계)와 A.floor 만 기준으로 움직인다 (투기장 maps/arena.js r1 · 무한의 탑 보스 층도 같다). 방 기믹 없음.
//   마차는 말 머리까지 A 안에 있도록 zx ∈ [A.x0 + EDGE, A.x1 − EDGE] — 질주도 말 머리가 벽 앞에서 멈춘다.
// this.inferno(회차·악몽/지옥)는 쓰지 않는다 — 세기는 stage.level · diff 한 길로만 (ngplus.md §3.1).
// 결말 (체력 0): 보스 처치 처리(world.onBossDefeated)는 같고 부제도 기본 '격파!'. 쓰러질 때는 언제나 걸어서 떠날 마부 — 50% 를 한 방에 넘겨 쓰러뜨려도
//   onDeath 가 world.onBossDefeated 보다 먼저 form2 를 적용한다 (이름은 두 모습 모두 '카론', 칭호만 '말을 잃은 마부' — renameBanner 는 e_bride.js 와 같은 안전망).
//   스토리: 주저앉은 자세 그대로 남는다 (b_charon_post 가 걸어서 떠나는 것을 말한다) · 아케이드: 주저앉음 1.2초 → 재와 혼불로 흩어져 3.0초에 사라진다 (파편 폭발 없음).
// 채색 렌더러가 읽는 필드: zx, fy (마차 가운데 바닥 / 마부 발) · fk (좌우 −1..1, 연속 — 돌아설 때 0.3초) · facing · coach (마차 있음) · broke (부서진 시각) ·
//   tilt · pivot · joltY (마차 기울기·축·덜컹) · wA (바퀴 각) · roofN · lanK (등불 부풂 0..1) · lanOutT · man ('seat'|'thrown'|'stand') · O {x, y} · oRot (마부 틀) ·
//   ps {…} · pts (골격, rig()) · whip (채찍 점 10) · chain (고삐 사슬 점 10) · tails (외투 자락 2×5) · hatK · stunned · exposed · cWin · ghost · dieT · vanishK ·
//   horsesOn · state · t · flashT · hitPart · A · drawHorses(ctx, world)
// 컬링: 말·채찍·사슬이 몸통 판정보다 크므로 e_bride.js 와 같은 ArtCull 대리 개체가 artBounds() 로 그린다.
import { BossC, telegraph, strikeRect, strikeColumn, strikeCircle, strikeLine, groundWave, pullField, warnMark, spawnMinion, minionsAlive, screenTint, prewarmTint, phaseScript, canShowScript } from './c_common.js';
import { PI, R, LG, ink, glow, glowE, glowSprite, warnRect, warnFloor, warnCircle, impact } from './b_common.js';
import { Entity } from '../entity.js';
import { TILE } from '../../core/game.js';
import { T as TT } from '../../core/physics.js';
import { audio } from '../../core/audio.js';
import '../../core/audio_companions.js';   // gallop · neigh 등록 (본 게임은 companions.js 가 이미 불러 둔다 — 갤러리·도구용)
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';
import { mountPose, ik2 } from '../../render/mount_rig.js';
import { drawMount } from '../../render/mounts.js';
import { registerPainted, hasPainted, paintedDraw, paintedRig, paintedEnabled } from '../../render/painted/registry.js';   // 채색 퍼핏 등록 (그리기 전용)
import { bosses as EXB } from '../../render/painted/reg/ex-boss.js';

// ── 색 (docs/specs/ex_s25.md §2: 검정 · 금박 · 혼불 녹청 · 잿빛 · 불길) ──
const BLACK = '#120e14', GOLD = '#c8a050', SOUL = '#7dffb0', ASH = '#b8b4b0', EMBER = '#ffb060';
const LACQ = '#1c1620', LACQ_H = '#3a3044', LACQ_D = '#08060a', GOLD_D = '#7a5a28', GOLD_H = '#f0d890', WOOD = '#3a2a20', WOOD_D = '#1e140e';
const COAT = '#16141a', COAT_H = '#34303c', COAT_D = '#060508', LINING = '#1e3a2e', BAND = '#6a1418', BRASS = '#c8a050', SKIN = '#c8c4bc', SKIN_D = '#7a7670';
const SOUL_D = '#1d4a3c', SOUL_H = '#d8ffe8', GLASS = '#3a7a64', IRON = '#2a282c', IRON_H = '#6a6870', LEATHER = '#2a1c16', COIN = '#d8dce4';
// ── 패턴 계약 (docs/specs/ex_s25.md §2.1 — 클래스의 static PATTERNS 가 c_common P2_PATTERNS 보다 이긴다) ──
const PATTERNS = {
  attacks: ['deathRun', 'whipCrack', 'coffinDrop', 'soulLantern', 'rearStomp', 'reinChain', 'lanternSwing', 'toll', 'hearseGhost', 'gatherSouls'],
  helpers: ['stagger', 'lastLoad'],
  transitions: { 1: { state: 'unbridle', dur: 2.6, script: 'b_charon_unbridle', form2: true, force: 'hearseGhost', applyAt: 2.0 / 2.6 } },
  weights: [
    { deathRun: 3, whipCrack: 3, rearStomp: 2, soulLantern: 2, coffinDrop: 2 },
    { reinChain: 3, lanternSwing: 3, toll: 2, gatherSouls: 2, hearseGhost: 1 },
  ],
  gimmicks: [],
  floorRow: 16,
  // s21–s24 boss 방과 같은 뼈대 — 15행 턱은 없고 (영구차가 경기장 끝까지 달린다) 13행 한쪽 발판 둘 [18–20] [55–58] (EX5-MAP 요청: 띠 위 19px — 브란·세라·빅터가 11행으로 오르는 디딤)
  room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11], [29, 7, 31, 7], [43, 7, 45, 7], [18, 13, 20, 13], [55, 13, 58, 13]] },
};
const T48 = () => TILE || 48;
const SIZE_H = { w: 200, h: 130 }, SIZE_M = { w: 66, h: 168 };   // 마차 · 마부 판정 크기 (명세 §2.1 전환)
// 마차 지역 좌표 (+x = 말 쪽 = facing, 원점 = 마차 가운데 바닥): 말 머리 끝 · 마차 뒤 끝 · 경계 여백 · 마부석 · 등불 · 바퀴 · 말 자리
const HEAD_X = 254, REAR_X = 104, EDGE = 258;
const SEAT = { x: 82, y: -112 }, LANT = { x: 106, y: -94 }, WHL = [{ x: -60, y: -38, r: 38 }, { x: 58, y: -30, r: 30 }];
const H1 = { x: 176, y: 0 }, H2 = { x: 144, y: -6 }, HS = 1.25;   // 가까운 말(모르겐) · 먼 말(헤이즐) · 말 크기
// 창 상한 (페이즈별 [1페이즈], 최대 체력 비 — POLISH-4 교훈을 처음부터, docs/specs/ex_s25.md §2.1): 질주 한 번 12% · 무릎 한 번 10% · 등불 노출 한 번 8%.
//   닿으면 남는 피해는 버리고('저항' 숫자), 무릎이면 곧바로 일어선다 (필살·각성 · 2페이즈 · 15% 긴 주저앉음은 상한 밖)
const RUN_CAP = [0.12], STAG_CAP = [0.10], LANTERN_CAP = [0.08];
// EX5-BOSS 확인 2 (실제 엔진 싸움 길이): 고정 세이브 카엘은 한 대가 최대 체력 6–8% 라 위 세 창만으로는 마차(피하지 않는 큰 과녁)의 1페이즈가 패턴 1–2개 · 4–7초에 끝났다
//   → 나머지 1페이즈 창에도 같은 틀의 상한: 질주 밖의 1페이즈 패턴 한 번 PAT_CAP · 패턴 사이 쉼 한 번 IDLE_CAP (bosses_e.js 머리말 b_charon 확인 2)
const PAT_CAP = [0.05], IDLE_CAP = [0.025];
const P1_PAT = new Set(['whipCrack', 'coffinDrop', 'soulLantern', 'rearStomp', 'reinChain', 'lanternSwing', 'toll', 'hearseGhost', 'gatherSouls', 'lastLoad']);
const RUN_SPEED = 1100, GHOST_SPEED = 1300, EXPOSE_DMG = 0.05;
// ── 마부 몸 지역 좌표 (+x = 얼굴 쪽, y 아래 양수). 원점 O = 앉았으면 마부석, 서 있으면 두 발 가운데 바닥 ──
const TORSO = 48, UA = 26, FA = 25, THIGH = 40, SHIN = 44, WHIP_N = 9, CHAIN_N = 9, TAIL_N = 4;
const POSE0 = { lean: 0, kneel: 0, slump: 0, bow: 0, hat: 0, tumble: 0 };
const POSE_RATE = { lean: 8, kneel: 7, slump: 5, bow: 7, hat: 6, tumble: 5 };
/** 팔 자세 (각 = 몸 지역: 0 앞, π/2 아래). n = 가까운 팔(채찍 · 등불), f = 먼 팔(고삐 · 사슬) */
const ARM = {
  seat: { n1: 1.0, n2: -1.75, f1: 0.75, f2: -0.55 },
  stand: { n1: 1.45, n2: -0.3, f1: 1.62, f2: -0.15 },
  hatTip: { n1: -0.85, n2: -1.95, f1: 0.75, f2: -0.55 },
  whipWind: { n1: -2.3, n2: -0.55, f1: 0.75, f2: -0.6 },
  whipCrack: { n1: 0.1, n2: 0.0, f1: 0.75, f2: -0.6 },
  reins: { n1: 1.0, n2: -1.75, f1: 0.2, f2: -0.95 },
  raise: { n1: -0.55, n2: -0.85, f1: 0.75, f2: -0.55 },
  flinch: { n1: -1.85, n2: -2.35, f1: -1.6, f2: -2.25 },
  chainWind: { n1: 1.4, n2: -0.45, f1: -2.4, f2: -0.5 },
  chainLash: { n1: 1.4, n2: -0.45, f1: 0.05, f2: 0.05 },
  swingBack: { n1: 2.5, n2: 0.3, f1: 1.4, f2: -0.6 },
  swing: { n1: -0.35, n2: -0.1, f1: 1.5, f2: -0.4 },
  coin: { n1: 0.45, n2: -1.45, f1: 1.6, f2: -0.2 },
  flick: { n1: -0.65, n2: -0.6, f1: 1.6, f2: -0.2 },
  whistle: { n1: 0.9, n2: -2.65, f1: 1.6, f2: -0.2 },
  ground: { n1: 1.2, n2: 0.25, f1: 0.95, f2: 0.6 },
  noose: { n1: 1.3, n2: -0.6, f1: -2.1, f2: -1.0 },
  throwNoose: { n1: 1.3, n2: -0.6, f1: 0.05, f2: 0.0 },
  limp: { n1: 1.5, n2: 0.15, f1: 1.65, f2: 0.05 },
  sprawl: { n1: 2.4, n2: 0.25, f1: 2.6, f2: 0.3 },
};
const pt = () => ({ x: 0, y: 0 });
const pts = (n) => Array.from({ length: n }, pt);
const rot = (x, y, a, out) => { const c = Math.cos(a), s = Math.sin(a); out.x = x * c - y * s; out.y = x * s + y * c; return out; };
const ownHit = (attack) => !(attack?.tags?.includes('guardian') || attack?.tags?.includes('companion'));   // 플레이어·탈것의 '한 대'만 (수호신·동료 자동 공격 제외)
let GHOST = null;   // 빈 영구차 실루엣 (마차를 한 번 구운 비트맵 — 페이지마다 한 번)

export class Charon extends BossC {
  static get PATTERNS() { return PATTERNS; }

  setup() {
    // 채색 퍼핏: 모음(reg/index.js)에 ex-boss 줄이 아직 없으면 여기서 한 번 등록 (이미 있으면 아무것도 안 함)
    if (!hasPainted?.('b_charon') && EXB?.b_charon) registerPainted?.('b_charon', { kind: 'boss', importer: EXB.b_charon });
    const A = this.A;
    this.noGravity = true; this.vx = 0; this.vy = 0;
    this.w = SIZE_H.w; this.h = SIZE_H.h;
    this.zx = this.clampX(this.cx); this.fy = A.floor;
    const p0 = this.P;
    this.facing = this.fk = p0 && p0.cx < this.zx ? -1 : 1;
    this.tzx = this.zx; this.spd = 0; this.walkK = 0; this.walkPh = 0; this.run = null; this.turnT = -9;
    this.coach = true; this.broke = -9; this.tilt = 0; this.tiltT = 0; this.pivot = { x: 70, y: 0 }; this.joltY = 0; this.joltT = -9; this.wA = 0; this.roofN = 3;
    this.lanK = 0; this.lanUp = false; this.lanOutT = -9; this.lanBroken = false;
    this.man = 'seat'; this.O = { x: 0, y: 0 }; this.oRot = 0; this.thr = null;
    this.ps = { ...POSE0 }; this.pt = { ...POSE0 };
    this.arm = { ...ARM.seat }; this.armT = { ...ARM.seat }; this.armRate = 12;
    this.pts = { hip: pt(), neck: pt(), head: pt(), eye: pt(), hatB: pt(), shN: pt(), shF: pt(), elN: pt(), elF: pt(), hdN: pt(), hdF: pt(), knN: pt(), knF: pt(), ftN: pt(), ftF: pt(), lan: pt(), tA: 0, hA: 0, lanA: 0 };
    this.whip = pts(WHIP_N + 1); this.whipMode = 'rest'; this.crack = null;
    this.chain = pts(CHAIN_N + 1); this.chainMode = 'coil'; this.lashK = 0; this.lashY = -40;
    this.tails = [pts(TAIL_N + 1), pts(TAIL_N + 1)];
    this.horsesOn = true; this.hRun = 0; this.hA = 1; this.hFree = false;
    this.horses = [mkHorse(0), mkHorse(1.7)];
    this.ghost = false; this.stunned = false; this.stagLong = false; this.exposed = false; this.cWin = false; this.dexp = 0; this.capBud = null; this.wakeT = 9;
    this._forced15 = false; this._lastNow = false; this._lanNow = false; this._stagNow = false; this._lastMode = false; this._lastEnd = false; this._bn = null;
    this.dieT = 0; this.vanishK = 0; this.ashAcc = 0;
    this.runZ = this.pullZ = this.ghostZ = null; this.tl = null; this.wc = null;
    this.pMan = { x: 0, y: 0, w: 44, h: 84, defMul: 0.85 };
    this.pBody = { x: 0, y: 0, w: 184, h: 80, defMul: 1.0 };
    this.pWheelR = { x: 0, y: 0, w: 76, h: 76, defMul: 1.15 };
    this.pWheelF = { x: 0, y: 0, w: 60, h: 60, defMul: 1.15 };
    this.pLan = { x: 0, y: 0, w: 44, h: 44, defMul: 1.0, lantern: true };
    this.pHead = { x: 0, y: 0, w: 30, h: 40, defMul: 0.85 };
    this.pTorso = { x: 0, y: 0, w: 36, h: 52, defMul: 1.0 };
    this.pSkirt = { x: 0, y: 0, w: 54, h: 60, defMul: 1.15 };
    this.cBox = { x: 0, y: 0, w: 156, h: 82 }; this.cMan = { x: 0, y: 0, w: 30, h: 110 };
    this._hp = []; this._cp = []; this._pt = { x: 0, y: 0 }; this._r = { x: 0, y: 0 }; this._q = { x: 0, y: 0 };
    this.fxAcc = 0;
    // 싸움 중 새 캔버스 0 (MASTER_PLAN §5.2): 쓰는 발광 색은 등장 때 굽는다 · 빈 영구차 실루엣도 지금 한 번
    for (const c of [SOUL, GOLD, '#ffffff', ASH, EMBER, SOUL_H]) { glowSprite(c, false); glowSprite(c, true); }
    prewarmTint([SOUL]);
    this.motion(0, this.world);
    bakeGhost(this);
  }

  // ═════════════════════════════ 위치 · 자세 ═════════════════════════════
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; this.arms(this.coach ? 'seat' : 'stand'); }
  arms(name, rate = 12) { Object.assign(this.armT, ARM[name] ?? ARM.stand); this.armRate = rate; }
  /** 마차가 있으면 말 머리까지 경기장 안에 들도록 (EDGE), 마부면 몸 폭만 */
  clampX(x) { const A = this.A, m = (this.coach ?? true) ? EDGE : 40; return clamp(x, A.x0 + m, Math.max(A.x0 + m, A.x1 - m)); }
  /** 플레이어 쪽을 본다 (마차는 돌아서는 데 0.3초 — fk 가 따라간다) */
  faceP(th = 40) { const p = this.P; if (p) { const d = p.cx - this.zx; if (Math.abs(d) > th) { const f = Math.sign(d); if (f !== this.facing) { this.facing = f; this.turnT = this.t; } } } }
  hpK() { return this.stats?.maxHp ? this.hp / this.stats.maxHp : 1; }
  /** 마차 지역 → 월드 (기울기 tilt 는 pivot 둘레, 덜컹 joltY) */
  toWorld(lx, ly, out = this._pt) {
    let x = lx, y = ly;
    if (this.tilt) { const c = Math.cos(this.tilt), s = Math.sin(this.tilt), dx = lx - this.pivot.x, dy = ly - this.pivot.y; x = this.pivot.x + dx * c - dy * s; y = this.pivot.y + dx * s + dy * c; }
    out.x = this.zx + this.fk * x; out.y = this.fy + this.joltY + y; return out;
  }
  /** 마부 지역 → 월드 (원점 O, 틀 회전 oRot) */
  toWorldM(lx, ly, out = this._pt) {
    let x = lx, y = ly;
    if (this.oRot) { const c = Math.cos(this.oRot), s = Math.sin(this.oRot); x = lx * c - ly * s; y = lx * s + ly * c; }
    out.x = this.O.x + this.fk * x; out.y = this.O.y + y; return out;
  }
  place() {
    this.x = this.zx - this.w / 2; this.y = this.fy - this.h; this.vx = 0; this.vy = 0;
  }
  /** x 에서 y0 이하(같거나 아래)의 첫 디딤면 (바닥·발판) — 없으면 A.floor (e_bride.js 와 같다) */
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
  /** 질주·빈 영구차 띠 (경기장 바닥 위 2.6칸) */
  bandY() { return this.A.floor - 2.6 * T48(); }
  /** 손 · 등불 (월드) */
  handN(out = this._q) { return this.toWorldM(this.pts.hdN.x, this.pts.hdN.y, out); }
  handF(out = this._q) { return this.toWorldM(this.pts.hdF.x, this.pts.hdF.y, out); }
  lanternW(out = this._q) { return this.coach ? this.toWorld(LANT.x, LANT.y + 11, out) : this.toWorldM(this.pts.lan.x, this.pts.lan.y, out); }   // 등불 유리 가운데

  /** 골격 (마부 지역 좌표): 허리 · 목 · 머리 · 어깨 · 팔꿈치 · 손 · 무릎 · 발 · 등불. 그리기·판정·채색이 같이 쓴다 */
  rig() {
    const s = this.ps, P = this.pts, a = this.arm, t = this.t;
    const kn = clamp(s.kneel, 0, 1), sl = clamp(s.slump, 0, 1), bw = clamp(s.bow, 0, 1);
    const seat = this.man === 'seat';
    if (seat) { P.hip.x = -1; P.hip.y = -1 + Math.sin(t * 9) * 1.2 * this.walkK; }
    else {
      const bob = this.walkK * Math.abs(Math.sin(this.walkPh * TAU)) * 2.5;
      P.hip.x = -2 * kn - 6 * sl; P.hip.y = lerp(lerp(-80 + bob, -48, kn), -20, sl);
    }
    const ta = 0.06 + 0.22 * s.lean + 0.18 * kn - 0.3 * sl + 0.55 * bw + (seat ? 0.08 : 0) + Math.sin(t * 1.4) * 0.015;
    P.tA = ta;
    P.neck.x = P.hip.x + Math.sin(ta) * TORSO; P.neck.y = P.hip.y - Math.cos(ta) * TORSO;
    const ha = ta * 0.4 + 0.3 * bw - 0.1 * s.lean + 0.25 * sl;
    P.hA = ha;
    const q = this._r;
    rot(3, -12, ha, q); P.head.x = P.neck.x + q.x; P.head.y = P.neck.y + q.y;
    rot(6, -2, ha, q); P.eye.x = P.head.x + q.x; P.eye.y = P.head.y + q.y;
    rot(0, -9 - 12 * s.hat, ha + 0.25 * s.hat, q); P.hatB.x = P.head.x + q.x + 4 * s.hat; P.hatB.y = P.head.y + q.y;
    P.shN.x = lerp(P.hip.x, P.neck.x, 0.86) + 1; P.shN.y = lerp(P.hip.y, P.neck.y, 0.86) + 1;
    P.shF.x = P.shN.x - 5; P.shF.y = P.shN.y - 1;
    const arm = (S, E, H, a1, a2) => { E.x = S.x + Math.cos(a1) * UA; E.y = S.y + Math.sin(a1) * UA; H.x = E.x + Math.cos(a1 + a2) * FA; H.y = E.y + Math.sin(a1 + a2) * FA; };
    arm(P.shN, P.elN, P.hdN, a.n1, a.n2);
    arm(P.shF, P.elF, P.hdF, a.f1, a.f2);
    // 다리: 앉으면 허벅지 앞으로 · 정강이 아래로 발판까지 / 서면 두 마디 IK (걷기 · 무릎 · 주저앉음)
    if (seat) {
      P.knN.x = P.hip.x + 34; P.knN.y = P.hip.y + 3; P.ftN.x = P.knN.x + 5; P.ftN.y = P.knN.y + 36;
      P.knF.x = P.hip.x + 30; P.knF.y = P.hip.y + 1; P.ftF.x = P.knF.x + 3; P.ftF.y = P.knF.y + 35;
    } else {
      const u = this.walkPh * TAU, wk = this.walkK * (1 - kn) * (1 - sl);
      let nx = 6 + Math.sin(u) * 16 * wk, ny = -Math.max(0, Math.cos(u)) * 7 * wk;
      let fx = -8 - Math.sin(u) * 16 * wk, fy2 = -Math.max(0, -Math.cos(u)) * 7 * wk;
      nx = lerp(lerp(nx, -26, kn), 46, sl); ny = lerp(ny, 0, Math.max(kn, sl));
      fx = lerp(lerp(fx, 20, kn), 38, sl); fy2 = lerp(fy2, 0, Math.max(kn, sl));
      const ik = this._ik ??= { kx: 0, ky: 0, fx: 0, fy: 0, a1: 0, a2: 0 };
      ik2(P.hip.x + 2, P.hip.y + 4, nx, ny, THIGH, SHIN, -1, ik); P.knN.x = ik.kx; P.knN.y = ik.ky; P.ftN.x = ik.fx; P.ftN.y = ik.fy;
      ik2(P.hip.x - 3, P.hip.y + 3, fx, fy2, THIGH, SHIN, -1, ik); P.knF.x = ik.kx; P.knF.y = ik.ky; P.ftF.x = ik.fx; P.ftF.y = ik.fy;
    }
    // 손에 든 등불 (2페이즈 · 가까운 손): 고리는 손, 등불은 늘 아래로 (휘두를 때만 손 방향으로 쏠린다)
    const sw = this.state === 'lanternSwing' ? clamp((this.st - 0.5) / 0.2, 0, 1) * (1 - clamp((this.st - 0.9) / 0.3, 0, 1)) : 0;
    P.lanA = PI / 2 - sw * 1.3 + Math.sin(t * 3) * 0.06;
    P.lan.x = P.hdN.x + Math.cos(P.lanA) * 14; P.lan.y = P.hdN.y + Math.sin(P.lanA) * 14;
  }
  /** 늘어진 것들 (dt 로 부드럽게): 채찍 · 고삐 사슬 · 외투 자락 */
  rigStrands(dt) {
    const P = this.pts, t = this.t, k = dt > 0 ? 1 - Math.exp(-22 * dt) : 1;
    // 채찍 (가까운 손): rest = 손잡이를 세우고 끈은 뒤로 늘어짐 · raised = 머리 위로 감아 올림 · crack = 목표점까지 뻗음
    const W = this.whip, H = P.hdN, tg = this._wt ??= pt(), c = this.crack;
    for (let i = 0; i <= WHIP_N; i++) {
      const u = i / WHIP_N;
      if (this.whipMode === 'crack' && c) {
        const kk = clamp(c.k, 0, 1), ex = lerp(H.x, c.x, kk), ey = lerp(H.y, c.y, kk);
        tg.x = lerp(H.x, ex, u); tg.y = lerp(H.y, ey, u) - Math.sin(u * PI) * 24 * (1 - kk) + Math.sin(u * PI * 3 - t * 40) * 4 * (1 - u);
      } else if (this.whipMode === 'raised') {
        tg.x = H.x - 4 - i * 7 + Math.sin(t * 8 + i) * 2; tg.y = H.y - 26 - Math.sin(u * PI) * 18 + i * 1.5;
      } else {
        const up = Math.min(i, 3);
        tg.x = H.x - 3 - up * 1.5 - Math.max(0, i - 3) * 5 + Math.sin(t * 1.6 + i * 0.7) * 1.5; tg.y = H.y - up * 9 + Math.max(0, i - 3) * 7;
      }
      if (i === 0) { W[0].x = H.x; W[0].y = H.y; continue; }
      if (dt <= 0) { W[i].x = tg.x; W[i].y = tg.y; } else { W[i].x += (tg.x - W[i].x) * k; W[i].y += (tg.y - W[i].y) * k; }
    }
    // 고삐 사슬 (먼 손): coil = 손에서 고리로 늘어짐 · raised = 머리 위로 휘돌림 · lash = 9칸 띠까지 뻗음
    const C = this.chain, F = P.hdF, tc = this._ct ??= pt();
    const len = 9 * T48() * this.lashK;
    for (let i = 0; i <= CHAIN_N; i++) {
      const u = i / CHAIN_N;
      if (this.chainMode === 'lash') {
        const ex = F.x + Math.max(30, len), ey = this.lashY;
        tc.x = lerp(F.x, ex, u); tc.y = lerp(F.y, ey, Math.min(1, u * 1.6)) + Math.sin(u * PI * 3 - t * 40) * 5 * (1 - u) * this.lashK;
      } else if (this.chainMode === 'raised') {
        const a = t * 14 + u * 2.4; tc.x = F.x + Math.cos(a) * 26 * u; tc.y = F.y - 10 * u + Math.sin(a) * 12 * u;
      } else { tc.x = F.x + 2 + Math.sin(u * PI) * 10 + Math.sin(t * 1.5 + i) * 1; tc.y = F.y + Math.sin(u * PI) * 22 + u * 4; }
      if (i === 0) { C[0].x = F.x; C[0].y = F.y; continue; }
      if (dt <= 0) { C[i].x = tc.x; C[i].y = tc.y; } else { C[i].x += (tc.x - C[i].x) * k; C[i].y += (tc.y - C[i].y) * k; }
    }
    // 외투 자락 둘 (허리 뒤에서 아래로, 움직임 반대쪽으로 끌린다). 앉으면 마부석 뒤로 늘어진다
    const seat = this.man === 'seat';
    for (let r = 0; r < 2; r++) {
      const S = this.tails[r], rx = P.hip.x - 9 - r * 3, ry = P.hip.y + 4, L = seat ? 9 : 12.5 - r * 1.2;
      for (let i = 0; i <= TAIL_N; i++) {
        const x = rx - i * (seat ? 2.5 : 1.2 + r) - this.walkK * i * (3 + r) + Math.sin(t * 3.4 + r * 1.9 - i * 0.6) * i * 0.9, y = ry + i * L;
        if (dt <= 0 || i === 0) { S[i].x = x; S[i].y = y; } else { S[i].x += (x - S[i].x) * k; S[i].y += (y - S[i].y) * k; }
      }
    }
  }
  /** 판정 부위를 월드 좌표로 (그리기와 같은 골격) */
  syncParts() {
    const W = this._pt, P = this.pts;
    if (this.coach) {
      const st = this.stunned;
      this.toWorldM((P.hip.x + P.head.x) / 2 + 2, (P.hip.y + P.head.y) / 2 - 4, W);
      const pm = this.pMan; pm.x = W.x - pm.w / 2; pm.y = W.y - pm.h / 2; pm.defMul = st ? 0.6 : this.exposed ? 0.7 : 0.85;
      this.toWorld(-12, -91, W); const pb = this.pBody; pb.x = W.x - pb.w / 2; pb.y = W.y - pb.h / 2; pb.defMul = st ? (this.stagLong ? 0.6 : 0.7) : 1.0;
      this.toWorld(WHL[0].x, WHL[0].y, W); const r0 = this.pWheelR; r0.x = W.x - r0.w / 2; r0.y = Math.min(W.y - r0.h / 2, this.fy - r0.h);
      this.toWorld(WHL[1].x, WHL[1].y, W); const r1 = this.pWheelF; r1.x = W.x - r1.w / 2; r1.y = Math.min(W.y - r1.h / 2, this.fy - r1.h);
      this.toWorld(-6, -82, W); const cb = this.cBox; cb.x = W.x - cb.w / 2; cb.y = W.y - cb.h / 2;
    } else {
      const st = this.stunned;
      this.toWorldM(P.head.x + 1, P.head.y - 8, W);
      const ph = this.pHead; ph.x = W.x - ph.w / 2; ph.y = W.y - ph.h / 2; ph.defMul = st ? 0.6 : 0.85;
      this.toWorldM((P.hip.x + P.neck.x) / 2, (P.hip.y + P.neck.y) / 2, W);
      const pb = this.pTorso; pb.x = W.x - pb.w / 2; pb.y = W.y - pb.h / 2;
      pb.defMul = st ? (this.stagLong ? 0.6 : 0.7) : this.exposed ? 0.7 : 1.0;
      const top = W.y - 20;
      this.toWorldM(P.hip.x - 4, P.hip.y + 30, W);
      const sk = this.pSkirt; sk.x = W.x - sk.w / 2; sk.y = Math.min(W.y - sk.h / 2, this.O.y - sk.h); sk.h = Math.max(30, Math.min(60, this.O.y - sk.y));
      const cm = this.cMan; cm.x = this.O.x - cm.w / 2; cm.y = top; cm.h = Math.max(30, this.O.y - top - 4);
    }
    const L = this.lanternW(W), lp = this.pLan; lp.x = L.x - lp.w / 2; lp.y = L.y - lp.h / 2;
  }
  motion(dt, world) {
    const s = this.ps, pt0 = this.pt;
    for (const k in s) { s[k] += (pt0[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt)); if (Math.abs(pt0[k] - s[k]) < 1e-3) s[k] = pt0[k]; }
    const ar = 1 - Math.exp(-this.armRate * dt), a = this.arm, at = this.armT;
    for (const k in a) a[k] += (at[k] - a[k]) * ar;
    const A = this.A, x0 = this.zx;
    const R0 = this.run;
    if (R0 && dt > 0) this.runStep(R0, dt);
    else if (this.spd > 0) this.zx = approach(this.zx, this.tzx, this.spd * dt);
    this.zx = this.coach ? this.clampX(this.zx) : clamp(this.zx, A.x0 + 30, A.x1 - 30);
    this.fy = A.floor;
    const mv = dt > 0 ? (this.zx - x0) / dt : 0;
    this.mv = mv;
    this.walkK = approach(this.walkK, Math.abs(mv) > 20 ? 1 : 0, dt * 6);
    if (!this.coach) this.walkPh = (this.walkPh + Math.abs(mv) * dt / 68) % 1;
    // 돌아서기: 마차 0.3초 · 마부 0.15초 (fk 가 facing 을 따라간다)
    this.fk = approach(this.fk, this.facing, dt * (this.coach ? 2 / 0.3 : 2 / 0.15));
    if (Math.abs(this.fk) < 0.02) this.fk = 0.02 * Math.sign(this.fk || this.facing);
    // 바퀴 (굴러간 거리 / 반지름) · 덜컹 · 기울기
    this.wA += (mv * this.facing) * dt / WHL[0].r;
    const jt = this.t - this.joltT;
    this.joltY = jt >= 0 && jt < 0.5 ? -Math.abs(Math.sin(jt * 18)) * 7 * (1 - jt / 0.5) : 0;
    this.lanK = approach(this.lanK, this.lanUp ? 1 : 0, dt * (this.lanUp ? 1.6 : 4));
    this.lashK = this.chainMode === 'lash' ? Math.min(1, this.lashK + dt / 0.1) : 0;
    if (this.crack) this.crack.k = Math.min(1, this.crack.k + dt / 0.08);
    // 마부 틀 원점: 마부석 (마차와 같이 기울고 덜컹) · 내던져짐 (포물선) · 바닥
    const O = this.O;
    if (this.man === 'seat') { this.toWorld(SEAT.x, SEAT.y + Math.sin(this.wA * 2) * 1.2 * this.walkK, O); this.oRot = this.tilt; }
    else if (this.man === 'thrown' && this.thr) {
      const k = clamp((this.t - this.thr.t0) / this.thr.T, 0, 1);
      O.x = lerp(this.thr.x0, this.zx, k); O.y = lerp(this.thr.y0, this.fy, k) - Math.sin(k * PI) * 60; this.oRot = lerp(this.thr.r0, 0, k) + Math.sin(k * PI) * 0.5;
    } else { O.x = this.zx; O.y = this.fy; this.oRot = 0; }
    this.place();
    this.rig();
    this.rigStrands(dt);
    this.syncParts();
    this.horseTick(dt);
  }
  /** 영구차 질주 (s_deathRun 의 run): 1100px/s 로 목표 앞까지 → 0.25초 미끄러짐 (속도가 0 으로) */
  runStep(R, dt) {
    if (R.ph === 'run') {
      const d = R.x1 - this.zx, slideD = RUN_SPEED * 0.25 / 2;
      if (Math.abs(d) <= slideD + 1e-3) { R.ph = 'slide'; R.t0 = this.t; R.xs = this.zx; }
      else this.zx += Math.sign(d) * Math.min(Math.abs(d) - slideD, RUN_SPEED * dt);
    }
    if (R.ph === 'slide') {
      const k = clamp((this.t - R.t0) / 0.25, 0, 1);
      this.zx = lerp(R.xs, R.x1, 1 - (1 - k) * (1 - k));
      if (k >= 1) { R.ph = 'stop'; R.t0 = this.t; }
    }
  }

  // ═════════════════════════════ 말 (벡터 탈것 리그) ═════════════════════════════
  /** 말 둘의 걸음 · 앞들기 · 땅 긁기 → mountPose (그리기는 drawHorses) */
  horseTick(dt) {
    if (!this.horsesOn) return;
    const st = this.state, run = this.run, fr = this.hFree;
    let anim = 'idle', sp = Math.abs(this.mv ?? 0), rear = 0;
    if (fr) { anim = 'run'; sp = 520; }
    else if (st === 'deathRun' && run?.ph === 'paw') anim = 'dig';
    else if (st === 'deathRun' && (run?.ph === 'run' || run?.ph === 'slide')) anim = 'run';
    else if ((st === 'deathRun' && run?.ph === 'stop') || st === 'rearStomp') rear = 1;
    else if (st === 'stagger' && this.coach) anim = 'knocked';
    else if (sp > 15) anim = sp > 300 ? 'run' : 'walk';
    if (st === 'rearStomp' && this.st > 0.62) rear = 0;
    for (const h of this.horses) {
      if (anim !== h.anim) { h.anim = anim; h.animT = 0; }
      h.t += dt; h.animT += dt;
      const r2 = anim === 'run' ? Math.max(sp, 420) : sp;
      h.vx = r2; h.speedK = r2 / 400; h.onGround = true;
      h.phase = (h.phase + r2 * dt / (anim === 'run' ? 110 : 70)) % 1;
      h.rearK = dt > 0 ? approach(h.rearK, rear, dt * (rear ? 1 / 0.45 : 3)) : rear;
      h.pitch = -0.7 * h.rearK;
      try { h.pose = mountPose(h, dt); } catch { h.pose = null; }
    }
  }
  /**
   * 말 둘 그리기 (마차 지역 좌표 — 부르는 쪽이 translate(zx, fy) · scale(fk, 1) 를 해 둔다). 채색 렌더러도 이것을 부른다.
   * 먼 말 = 헤이즐 (어두운 녹청 tint), 가까운 말 = 모르겐 (투명도 0.85 + 녹청 빛). 굴레 줄·끌채는 마차 그림이 그린다
   */
  drawHorses(ctx, world, which = 'both') {
    if (!this.horsesOn || this.hA <= 0.01 || R.fl) return;   // 말은 혼 — 맞아도 번쩍이지 않는다
    const [h1, h2] = this.horses, off = this.hRun;
    if (which !== 'near' && h2.pose) {
      h2.cx = H2.x + off * 0.92; h2.bottom = H2.y;
      if (!R.fl) glowE(ctx, h2.cx - 4, h2.bottom - 52 * HS, 58, 34, SOUL, 0.18 * this.hA);
      drawMount(ctx, h2, world, 'back', { alpha: 0.8 * this.hA, tint: R.fl ? '#ffffff' : SOUL_D, scale: HS, rider: false, noFx: true });
    }
    if (which !== 'far' && h1.pose) {
      h1.cx = H1.x + off; h1.bottom = H1.y;
      if (!R.fl) glowE(ctx, h1.cx - 4, h1.bottom - 50 * HS, 64, 40, SOUL, 0.28 * this.hA);
      drawMount(ctx, h1, world, 'back', { alpha: 0.85 * this.hA, scale: HS, rider: false, flash: R.fl });
      drawMount(ctx, h1, world, 'front', { alpha: 0.85 * this.hA, scale: HS, rider: false, flash: R.fl });
    }
  }
  /** 가까운 말 굴레 점 (마차 지역) — 고삐가 닿는 곳 */
  bridleOf(i = 0) {
    const h = this.horses[i], P = h.pose, X = (i ? H2.x : H1.x) + this.hRun * (i ? 0.92 : 1), Y = i ? H2.y : H1.y;
    if (!P) return { x: X + 50, y: Y - 80 };
    return { x: X + (P.hx + Math.cos(P.ha) * 8) * HS, y: Y + (P.hy + Math.sin(P.ha) * 8) * HS };
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0 || this.hidden || this.ghost) return L;
    if (this.lanUp && this.state === 'soulLantern') L.push(this.pLan);
    if (this.coach) L.push(this.pMan, this.pBody, this.pWheelR, this.pWheelF);
    else L.push(this.pHead, this.pTorso, this.pSkirt);
    return L;
  }
  /** 접촉은 마차 상자 안쪽 · 마부 몸통만. 질주 중(띠가 맡는다)·무릎·사망 중에는 없다. 말은 혼 — 판정 없음 */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.hidden || this.ghost || this.dying > 0 || this.stunned || this.run || this.man === 'thrown') return L;
    L.push(this.coach ? this.cBox : this.cMan);
    return L;
  }
  /**
   * 창 상한 (RUN_CAP · STAG_CAP · LANTERN_CAP, e_bride.js 와 같은 틀 — takeHit 에서 줄인다): 1페이즈 질주 한 번 · 무릎 한 번 · 등불 노출 한 번에 잃는 체력은 상한까지.
   * 넘는 피해는 상한까지만 들어가고(숫자도 줄인 값, 1 이하면 '저항'), 무릎이면 그 틱에 일어서고 등불 노출이면 노출이 끝난다. 필살·각성은 빼고.
   */
  takeHit(dmg, attack, world, info) {
    const burst = attack?.tags?.includes('ult') || attack?.tags?.includes('awaken');
    if (this.capBud != null && !burst && !(this.dying > 0) && !this.invuln) {
      if (dmg >= this.capBud) {
        dmg = Math.max(1, Math.round(this.capBud)); this.capBud = 0;
        if (info) { info.dmg = dmg; info.capped = true; if (dmg <= 1) info.resist = true; }
        if (this.state === 'stagger' && this.stunned) this.wakeT = this.st + 1e-3;
        if (this.state === 'soulLantern' && this.exposed) this.exposeEnd = this.st + 1e-3;
      } else this.capBud -= dmg;
    }
    return super.takeHit(dmg, attack, world, info);
  }
  /**
   * 상태가 바뀔 때마다 창 상한을 새로 연다 (1페이즈만 — 그 상태가 끝나면 닫힌다): 질주 RUN_CAP · 무릎 STAG_CAP (15% 긴 주저앉음 제외) ·
   * 그 밖의 1페이즈 패턴 PAT_CAP · 쉼(idle) IDLE_CAP. 등불 노출은 노출이 시작될 때 openCap(LANTERN_CAP) 으로 따로 연다
   */
  setState(s) {
    super.setState(s);
    this.openCap(s === 'deathRun' ? RUN_CAP : s === 'stagger' ? (this.stagLong ? null : STAG_CAP) : s === 'idle' ? IDLE_CAP : P1_PAT.has(s) ? PAT_CAP : null);
  }
  /** 남은 피해 예산 (최대 체력 × 상한) — 체력 값이 아니라 이 창에서 잃은 양으로 센다 */
  openCap(C) { const c = C?.[this.phase], mx = this.stats?.maxHp; this.capBud = c && mx ? mx * c : null; }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (Math.random() < 0.5) world.fx.burst(this.coach ? 'spark' : 'dark', x, y, 2, { color: this.coach ? GOLD : ASH, speed: 150 });
    if (this.dying > 0 || this.dead) { this.renameBanner(world); return; }
    this.check15();
    const own = ownHit(attack);
    // 혼불 등불: 플레이어·탈것이 부푼 등불을 한 대 → 꺼짐 (수호신 자동 공격은 몸통 피해로만 센다 — POLISH-4 성배 교훈)
    if (this.state === 'soulLantern' && this.lanUp && part === this.pLan && own) { this._lanNow = true; return; }
    // 카운터 창(질주 끝 앞들기)에 플레이어·탈것 한 대 → 무릎
    if (this.cWin && this.state === 'deathRun' && own) { this.cWin = false; this._stagNow = true; return; }
    // 망자 부르기 노출 0.9초 안에 최대 체력 5% 이상 → 무릎
    if (this.exposed && this.state === 'gatherSouls') {
      this.dexp += Math.max(0, dmg || 0);
      if (this.dexp >= this.stats.maxHp * EXPOSE_DMG) { this.exposed = false; this._stagNow = true; }
    }
  }
  /**
   * 체력 15% 이하에서 한 번(싸움마다): 다음 틱(tickB)에 하던 패턴을 끊고 lastLoad. 전환 중이면 전환 뒤로 (forceNext).
   * 스토리·처음이면 올가미 대사 b_charon_last 뒤 그림메인이 들이받는다 (s_lastLoad 가 canShowScript 로 고른다) — e_bride.js check15 와 같은 틀
   */
  check15() {
    if (this._forced15 || this.phase < 1 || this.dying > 0 || this.hpK() > 0.15) return;
    this._forced15 = true; this._lastNow = true;
  }
  toForced() {
    this._lastNow = false; this._lanNow = false; this._stagNow = false;
    if (this.dying > 0 || this.dead) return;
    if (this._tr) { this.forceNext('lastLoad'); return; }
    this.clearJobs(); this.onCancel(this.world);
    this.lastAtk = 'lastLoad';
    this.setState('lastLoad');
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

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    // 피격 처리 안이 아니라 여기서 (runJobs 밖 — clearJobs 가 안전하다): 15% 강제 > 등불 꺼짐 > 무릎
    if (this._lastNow) this.toForced();
    else if (this._lanNow) this.breakLantern(world);
    else if (this._stagNow) this.toStagger();
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
  }
  ambient(dt, world) {
    if (this.ghost) return;
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (this.horsesOn ? 2.2 : 0.8);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      if (this.horsesOn && this.hA > 0.3) {
        const h = this.horses[Math.random() < 0.65 ? 0 : 1], x = (h === this.horses[0] ? H1.x : H2.x) + this.hRun + rand(-30, 40);
        const P = this.toWorld(x, -rand(30, 110) * HS, this._r);
        world.fx.emit('soul', P.x, P.y, { color: SOUL, speed: 30, angle: -PI / 2, spread: 1 });
      } else {
        const L = this.lanternW(this._r);
        world.fx.emit('ember', L.x + rand(-6, 6), L.y + rand(-6, 6), { color: SOUL, speed: 24, angle: -PI / 2, spread: 0.8 });
      }
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) {
    let x0, x1;
    if (this.coach || this.horsesOn) {
      const f = this.facing, ext = HEAD_X + 30 + this.hRun;
      x0 = f > 0 ? this.zx - REAR_X - 60 : this.zx - ext; x1 = f > 0 ? this.zx + ext : this.zx + REAR_X + 60;
    } else { x0 = this.zx - 180; x1 = this.zx + 180; }
    const reach = this.chainMode === 'lash' ? 9 * T48() + 60 : this.whipMode === 'crack' ? 12 * T48() : 0;
    if (reach) { if (this.facing > 0) x1 = Math.max(x1, this.zx + reach); else x0 = Math.min(x0, this.zx - reach); }
    if (this.whipMode === 'crack' && this.crack) { const c = this.toWorldM(this.crack.x, this.crack.y, this._r); x0 = Math.min(x0, c.x - 40); x1 = Math.max(x1, c.x + 40); }
    r.x = x0; r.y = this.fy - (this.coach ? 280 : 240); r.w = x1 - x0; r.h = this.fy + 30 - r.y;
    return r;
  }
  /**
   * 그리기: 채색이 준비됐으면 채색(대리 개체), 아니면 벡터. 쓰러짐 연출은 스스로 보여 주므로
   * Boss.draw 의 사망 투명도 감쇠를 쓰지 않는다 (e_bride.js 와 같다)
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
    if (world.game?.debug) { ctx.save(); ctx.strokeStyle = '#0ff'; for (const hb of this.hurtboxes()) ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); ctx.strokeStyle = '#ff0'; for (const hb of this.hitParts()) ctx.strokeRect(hb.x, hb.y, hb.w, hb.h); ctx.restore(); }
  }

  // ═════════════════════════════ 상태 ═════════════════════════════
  /** 등장: 마부가 모자를 들어 정중히 인사한다 */
  s_intro(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0);
      this.setPose({ hat: 1, bow: 0.4 }); this.arms('hatTip', 6);
      audio.sfx('bell', { vol: 0.5, pitch: 0.7 }); audio.sfx('neigh', { vol: 0.4, pitch: 0.8 });
      impact(world, { shake: 3, time: 0.4 });
    }
    if (this.at(1.0)) { this.setPose({ hat: 0, bow: 0 }); this.relax(); }
    if (t >= 1.5) this.done(0.8);
  }
  /** 대기: 마차는 60px/s 로 플레이어와 6칸 거리를 오간다 (돌아설 때 0.3초) · 마부는 3–5칸을 두고 걷고, 붙으면 한 걸음 물러선다 (엘제베트 320px/s 틀) */
  idleMove(dt, world, t) {
    const A = this.A, p = this.P, px = p ? p.cx : A.cx, T = T48();
    if (this.coach) {
      const turning = Math.abs(this.fk - this.facing) > 0.05;
      this.faceP(T * 1.5);
      this.tzx = this.clampX(px - this.facing * 6 * T);
      this.spd = turning ? 0 : 60;
    } else {
      this.faceP(30);
      const side = Math.sign(this.zx - px) || -this.facing;
      const d = 4 * T + Math.sin(this.t * 0.8) * T, close = p && Math.abs(p.cx - this.zx) < 2.2 * T;
      this.tzx = clamp(px + side * d, A.x0 + 60, A.x1 - 60);
      this.spd = close ? 320 : 150;
      if (this.state === 'idle') this.setPose({ lean: close ? -0.15 : 0.05 });
    }
  }

  // ── deathRun 영구차 질주 (1페이즈): 말들이 땅을 긁음 0.9초 (warnRect 경기장 폭 전체 A.floor−2.6칸…A.floor, gallop·neigh) → 1100px/s 로 반대쪽 벽 앞까지
  //    (판정 = 말 머리부터 마차 끝까지의 띠, mv 0.9, kb [420, −520]) → 0.25초 미끄러짐 → 말들이 앞발을 듦 0.6초 = 카운터 창 → 돌아섬 (0.3초).
  //    마차가 없으면 (2페이즈 debugAct) 빈 영구차와 같은 마차 혼이 마부 자리에서 달린다. 창 상한 RUN_CAP 12% ──
  s_deathRun(dt, world, t) {
    const A = this.A, T = T48(), by = this.bandY();
    if (!this.coach) { this.ghostRun(dt, world, t, { warn: 0.9, speed: RUN_SPEED, mv: 0.9, from: 'self' }); return; }
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0; this.cWin = false;
      this.run = { ph: 'paw', f: this.facing, x1: this.zx, t0: this.t };
      this.arms('reins', 8); this.setPose({ lean: 0.2 });
      audio.sfx('gallop', { vol: 0.7, pitch: 0.8 }); audio.sfx('neigh', { vol: 0.8 });
      this.zone({ x: A.x0, y: by, w: A.w, h: 2.6 * T, warn: 0, life: 0.9, harmless: true, z: 4, data: { runWarn: true },
        paint: (ctx, z, w) => warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / 0.9, 0, 1), SOUL, w.time) });
      telegraph(this, 0.9, { sfx: null });
    }
    const Rn = this.run;
    if (!Rn) { if (t > 0.5) this.done(0.5); return; }
    if (this.at(0.9)) {
      Rn.f = this.facing; Rn.ph = 'run'; Rn.x1 = this.clampX(Rn.f > 0 ? A.x1 : A.x0); Rn.t0 = this.t;
      audio.sfx('gallop', { vol: 1.0, pitch: 1.1 }); audio.sfx('gallop', { vol: 0.8, pitch: 0.9, delay: 0.12 });
      impact(world, { shake: 5, time: 0.4 });
      this.runZ = this.zone({ x: this.zx, y: by, w: 10, h: 2.6 * T, warn: 0, life: 9, mv: 0.9, kb: [420, -520], z: 4, data: { run: true },
        tick: (z) => {
          const R2 = this.run;
          if (!R2 || this.state !== 'deathRun' || R2.ph === 'stop') { z.dur = Math.min(z.dur, z.t); return; }
          const xa = this.zx - R2.f * REAR_X, xb = this.zx + R2.f * HEAD_X;
          z.x = Math.min(xa, xb); z.w = Math.abs(xb - xa);
        },
        paint: (ctx, z, w) => paintRunBand(ctx, z, w, this.facing) });
    }
    if (Rn.ph === 'run' || Rn.ph === 'slide') {
      if (Math.random() < 0.6 * (world.fx.quality ?? 1)) { const P = this.toWorld(rand(-100, 220), -4, this._r); world.fx.emit('dust', P.x, P.y, { speed: 120, angle: -PI / 2 - this.facing * 0.5, spread: 0.6 }); }
    }
    if (Rn.ph === 'stop') {
      const k = this.t - Rn.t0;
      if (!Rn.rear) {
        // 카운터 창: 말들이 앞발을 든 0.6초 (boss.telegraph). 플레이어·탈것 한 대 → 무릎
        Rn.rear = true; this.cWin = true; this.telegraphFor(0.6);
        audio.sfx('neigh', { vol: 0.9, pitch: 1.1 }); impact(world, { shake: 4, time: 0.2 });
      }
      if (k >= 0.6 && this.cWin) { this.cWin = false; }
      if (k >= 0.6 && !Rn.turn) { Rn.turn = true; this.facing = -this.facing; this.turnT = this.t; this.relax(); }
      if (k >= 0.95) { this.run = null; this.runZ = null; this.done(1.0); }
    }
    if (t > 6) { this.run = null; this.cWin = false; this.done(0.8); }   // 안전망
  }

  // ── whipCrack 마부의 채찍: 채찍을 머리 위로 0.45초 (whip) → 플레이어 자리(발판 위 포함, 마부 손에서 12칸 안)에 warnMark 0.4초 × 3, 0.35초 간격 →
  //    strikeCircle r 80 mv 0.6 (whip_crack). 마차가 없으면 고삐 사슬로 같은 동작 ──
  s_whipCrack(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.arms('whipWind', 9); this.setPose({ lean: -0.1 }); this.whipMode = 'raised';
      audio.sfx('whip', { vol: 0.5, pitch: 0.7 });
      telegraph(this, 0.45, { sfx: null });
      this.wc = [];
    }
    if (!this.wc) { if (t > 0.5) this.done(0.5); return; }
    for (let k = 0; k < 3; k++) {
      const t0 = 0.45 + k * 0.35;
      if (this.at(t0)) {
        const A = this.A, p = this.P, H = this.handN({ x: 0, y: 0 }), T = T48();
        let tx = p ? p.cx : A.cx, ty = p ? p.cy : A.floor - 40;
        const d = Math.hypot(tx - H.x, ty - H.y), mx = 12 * T;
        if (d > mx) { tx = H.x + (tx - H.x) * mx / d; ty = H.y + (ty - H.y) * mx / d; }
        tx = clamp(tx, A.x0 + 40, A.x1 - 40); ty = clamp(ty, (A.top ?? 0) + 40, A.floor - 30);
        warnMark(this, tx, ty - 50, 0.4, EMBER);
        strikeCircle(this, tx, ty, 80, { warn: 0.4, life: 0.12, mv: 0.6, color: EMBER, sfx: 'whip_crack', vol: 0.8, kb: [320, -340], data: { crack: true, k },
          onStart: () => { this.crackAt(tx, ty); this.arms('whipCrack', 30); },
          paint: (ctx, z, w) => { if (!z.started) warnCircle(ctx, tx, ty, 80, z.k, EMBER, w.time); else paintCrack(ctx, tx, ty, 80, z); } });
        this.wc.push({ tx, ty });
      }
      if (this.at(t0 + 0.4 + 0.12)) { this.arms('whipWind', 14); this.whipMode = 'raised'; this.crack = null; }
    }
    if (this.at(0.45 + 0.7 + 0.6)) { this.whipMode = 'rest'; this.crack = null; this.relax(); }
    if (t >= 0.45 + 0.7 + 0.75) { this.wc = null; this.done(1.0); }
  }
  /** 채찍 끝이 (월드) x, y 로 뻗는다 (마부 지역 좌표로 바꿔 둔다) */
  crackAt(x, y) {
    const lx = (x - this.O.x) / this.fk, ly = y - this.O.y;
    let ux = lx, uy = ly;
    if (this.oRot) { const c = Math.cos(-this.oRot), s = Math.sin(-this.oRot); ux = lx * c - ly * s; uy = lx * s + ly * c; }
    this.crack = { x: ux, y: uy, k: 0 }; this.whipMode = 'crack';
  }

  // ── coffinDrop 관 떨구기: 마차가 덜컹 0.5초 → 지붕의 관 둘이 포물선으로 플레이어 x 와 ±4칸(A 안으로 자름)에 warnFloor 0.8초 →
  //    strikeColumn 폭 72 · 높이 2.5칸 mv 0.7 (break_wall) → 첫 관에서 spawnMinion(['skeleton']) 1 (살아 있는 수 ≤ 2, 최대면 관만) ──
  s_coffinDrop(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.joltT = this.t; this.arms('reins', 10); this.setPose({ lean: -0.15 });
      audio.sfx('clang', { vol: 0.6, pitch: 0.6 });
      telegraph(this, 0.5, { sfx: null });
    }
    if (this.at(0.5)) {
      const A = this.A, p = this.P, T = T48(), px = p ? p.cx : A.cx, py = p ? Math.min(A.floor, p.bottom - 6) : A.floor;
      const side = Math.random() < 0.5 ? -1 : 1;
      const xs = [px, px + side * 4 * T];
      if (xs[1] < A.x0 + 40 || xs[1] > A.x1 - 40) xs[1] = px - side * 4 * T;
      const src = this.coach ? this.toWorld(-30, -150, { x: 0, y: 0 }) : { x: this.zx, y: this.fy - 300 };
      this.roofN = this.coach ? Math.max(0, this.roofN - 2) : this.roofN;
      audio.sfx('whip', { vol: 0.5, pitch: 0.6 });
      xs.forEach((x0, i) => {
        const x = clamp(x0, A.x0 + 40, A.x1 - 40), fl = this.surface(x, py), warn = 0.8 + i * 0.1;
        strikeColumn(this, x, { w: 72, top: fl - 2.5 * T, bottom: fl, warn, life: 0.3, mv: 0.7, color: SOUL, sfx: 'break_wall', vol: 0.7, kb: [260, -420], data: { coffin: true, i, x, fl },
          onStart: (z, w) => {
            w.fx.burst('dust', x, fl - 6, 12, { speed: 240, angle: -PI / 2, spread: 0.9 });
            w.fx.burst('spark', x, fl - 20, 6, { color: GOLD, speed: 200 });
            impact(w, { shake: 4, time: 0.2 });
            if (i === 0 && this.minionCount('skeleton') < 2 && !(this.dying > 0)) spawnMinion(this, ['skeleton'], x, fl - 2, { facing: this.facing });
          },
          paint: (ctx, z, w) => paintCoffin(ctx, z, w, src.x, src.y, x, fl, warn, i) });
      });
    }
    if (this.at(1.1)) this.relax();
    if (this.at(2.4)) this.roofN = 3;   // 지붕에 새 관이 혼불 속에서 다시 실린다
    if (t >= 2.5) this.done(1.0);
  }

  // ── soulLantern 혼불 등불: 앞 모서리 등불(2페이즈는 손의 등불)이 푸르게 부풀어 1.2초 (ghost, 등불 판정 44×44). 그동안 플레이어·탈것이 등불을 한 대 치면
  //    꺼짐(ice pitch 1.4 + 녹청 불티) → 마부 멈칫 0.8초 = 노출 (마부 0.7, LANTERN_CAP 8%). 못 끊으면 spawnMinion(['wisp']) 2 (≤ 3) +
  //    혼불 셋이 200px/s 로 2.5초 따라옴 (mv 0.5, 맞으면 사라짐). 수호신 자동 공격은 '한 대'로 세지 않는다 ──
  s_soulLantern(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0; this.lanBroken = false; this.exposed = false; this.exposeEnd = 0;
      this.lanUp = true; this.arms('raise', 8); this.setPose({ lean: -0.1 });
      audio.sfx('ghost', { vol: 0.7, pitch: 0.8 });
      telegraph(this, 1.2, { sfx: null });
      this.zone({ x: this.pLan.x, y: this.pLan.y, w: 44, h: 44, warn: 0, life: 1.2, harmless: true, z: 8, data: { lanRing: true },
        tick: (z) => { if (!this.lanUp || this.state !== 'soulLantern') z.dead = true; },
        paint: (ctx, z) => paintLanRing(ctx, this, z) });
    }
    if (this.lanBroken) {
      // 꺼진 뒤: 노출 0.8초 (마부 멈칫)
      if (this.st >= this.exposeEnd && this.exposed) { this.exposed = false; this.capBud = null; this.relax(); }
      if (this.st >= this.exposeEnd + 0.15) this.done(1.0);
      return;
    }
    if (this.lanUp && this.at(1.2)) {
      // 못 끊음: 도깨비불 둘 (≤ 3) + 따라오는 혼불 셋
      this.lanUp = false; this.relax();
      const L = this.lanternW({ x: 0, y: 0 }), A = this.A;
      audio.sfx('ghost', { vol: 0.9, pitch: 1.2 });
      world.fx.burst('soul', L.x, L.y, 14, { color: SOUL, speed: 200 });
      const n = Math.max(0, Math.min(2, 3 - this.minionCount('wisp')));
      for (let i = 0; i < n; i++) spawnMinion(this, ['wisp'], clamp(L.x + (i ? 70 : -70), A.x0 + 40, A.x1 - 40), L.y - 30, { facing: this.facing });
      for (let i = 0; i < 3; i++) seeker(this, L.x, L.y, i);
    }
    if (t >= 1.8) this.done(1.0);
  }
  /** 등불이 꺼진다 (플레이어·탈것 한 대) → 마부 멈칫 0.8초 = 노출 (LANTERN_CAP) */
  breakLantern(world = this.world) {
    this._lanNow = false;
    if (this.dying > 0 || this.dead || this.state !== 'soulLantern' || !this.lanUp) return;
    const L = this.lanternW({ x: 0, y: 0 });
    this.lanUp = false; this.lanBroken = true; this.lanOutT = this.t; this.lanK = 0;
    audio.sfx('ice', { vol: 0.9, pitch: 1.4 });
    world.fx.burst('soul', L.x, L.y, 14, { color: SOUL, speed: 260 });
    world.fx.burst('spark', L.x, L.y, 8, { color: SOUL_H, speed: 200 });
    impact(world, { shake: 4, time: 0.25 });
    this.exposed = true; this.exposeEnd = this.st + 0.8; this.openCap(LANTERN_CAP);
    this.arms('flinch', 14); this.setPose({ lean: -0.35 });
  }

  // ── rearStomp 앞발 짓밟기: 말들이 앞발을 듦 0.55초 (neigh) → 말 발밑 strikeCircle r 110 mv 0.75 + 바닥을 타고 양쪽으로 groundWave (높이 1칸, 600px/s, mv 0.5).
  //    답 = 점프. 마차가 없으면 마부가 발을 구른다 ──
  s_rearStomp(dt, world, t) {
    const T = T48();
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.arms(this.coach ? 'reins' : 'raise', 8); this.setPose({ lean: -0.2 });
      audio.sfx('neigh', { vol: 0.9, pitch: 0.9 });
      telegraph(this, 0.55, { sfx: null });
    }
    if (this.at(0.55)) {
      const A = this.A, x = clamp(this.coach ? this.toWorld(H1.x + 22, 0, { x: 0, y: 0 }).x : this.zx + this.facing * 20, A.x0 + 30, A.x1 - 30), y = A.floor;
      strikeCircle(this, x, y - 10, 110, { warn: 0, life: 0.15, mv: 0.75, color: SOUL, sfx: 'hit_heavy', vol: 0.9, kb: [380, -480], burstFx: 'dust', data: { stomp: true } });
      groundWave(this, x, 1, { h: T, speed: 600, mv: 0.5, color: SOUL, data: { wave: 1 } });
      groundWave(this, x, -1, { h: T, speed: 600, mv: 0.5, color: SOUL, data: { wave: -1 } });
      impact(world, { shake: 8, time: 0.35 });
      this.joltT = this.t; this.setPose({ lean: 0.15 });
    }
    if (this.at(0.9)) this.relax();
    if (t >= 1.15) this.done(1.0);
  }

  // ── reinChain 고삐 사슬 (2페이즈): 끊어진 고삐를 감아쥠 0.5초 → 앞으로 9칸 두 번: 낮은 띠(A.floor−1칸…A.floor, 뛰어넘는다) · 가운데 띠(A.floor−2.6…−1.8칸,
  //    붙어 피한다) 무작위 순서 0.35초 간격, warnRect 0.55초 (mv 0.7 · 0.75, whip_crack · clang) ──
  s_reinChain(dt, world, t) {
    const T = T48();
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.arms('chainWind', 8); this.setPose({ lean: -0.15 }); this.chainMode = 'raised';
      telegraph(this, 0.5, { sfx: null });
      audio.sfx('clang', { vol: 0.4, pitch: 0.7 });
      const f = this.facing, base = this.A.floor;
      const bands = [{ y: base - T, h: T, low: true }, { y: base - 2.6 * T, h: 0.8 * T, low: false }];
      if (Math.random() < 0.5) bands.reverse();
      this.tl = { f, base, bands, x: 0 };
      if (!this.coach) { this.tzx = clamp(this.zx - f * 60, this.A.x0 + 60, this.A.x1 - 60); this.spd = 200; }
    }
    const tl = this.tl;
    if (!tl) { if (t > 0.5) this.done(0.5); return; }
    if (this.at(0.5)) {
      this.spd = 0;
      const hx = this.coach ? this.toWorld(SEAT.x + 20, 0, this._r).x : this.zx, A = this.A;
      tl.x = clamp(tl.f > 0 ? hx : hx - 9 * T, A.x0, A.x1 - 9 * T);
      tl.bands.forEach((b, i) => {
        strikeRect(this, { x: tl.x, y: b.y, w: 9 * T, h: b.h }, { warn: 0.55 + i * 0.35, life: 0.15, mv: i ? 0.75 : 0.7, color: SOUL, sfx: i ? 'clang' : 'whip_crack', vol: 0.8, kb: [380, b.low ? -420 : -200],
          data: { chain: true, low: b.low, i }, onStart: () => { this.lashY = b.y + b.h / 2 - this.O.y; this.lashK = 0; this.chainMode = 'lash'; this.arms('chainLash', 30); },
          paint: (ctx, z, w) => { if (!z.started) warnRect(ctx, z.x, z.y, z.w, z.h, z.k, SOUL, w.time); else paintChainBand(ctx, z, tl.f); } });
      });
    }
    if (this.at(1.75)) { this.chainMode = 'coil'; this.relax(); }
    if (t >= 1.95) { this.tl = null; this.done(1.0); }
  }

  // ── lanternSwing 혼불 휘두르기 (2페이즈): 등불을 뒤로 젖힘 0.5초 → 앞쪽 반원 strikeCircle r 140 mv 0.8 (fire pitch 0.6, 녹청 불) →
  //    앞 2·4·6칸 바닥에 혼불 셋 2.0초 (폭 60, rehit 0.5, mv 0.25) ──
  s_lanternSwing(dt, world, t) {
    const T = T48();
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this.arms('swingBack', 8); this.setPose({ lean: -0.2 });
      telegraph(this, 0.5, { sfx: null });
      audio.sfx('ghost', { vol: 0.4, pitch: 1.3 });
    }
    if (this.at(0.5)) {
      const A = this.A, f = this.facing, L = this.coach ? this.toWorld(LANT.x, LANT.y, { x: 0, y: 0 }) : { x: this.zx, y: this.fy - 80 };
      const cx = clamp(L.x + f * 50, A.x0 + 20, A.x1 - 20), cy = Math.min(L.y, A.floor - 70);
      this.arms('swing', 26); this.setPose({ lean: 0.3 });
      strikeCircle(this, cx, cy, 140, { warn: 0, life: 0.18, mv: 0.8, color: SOUL, sfx: 'fire', pitch: 0.6, vol: 0.9, kb: [400, -360], burstFx: 'soul', data: { swing: true },
        paint: (ctx, z) => paintSwing(ctx, cx, cy, 140, z, f) });
      const base = this.coach ? this.toWorld(LANT.x, 0, { x: 0, y: 0 }).x : this.zx;
      for (const k of [2, 4, 6]) {
        const x = base + f * k * T;
        if (x < A.x0 + 30 || x > A.x1 - 30) continue;
        strikeRect(this, { x: x - 30, y: A.floor - 44, w: 60, h: 44 }, { warn: 0.12, life: 2.0, rehit: 0.5, mv: 0.25, color: SOUL, sfx: null, kb: [140, -320], data: { flame: true, k },
          paint: (ctx, z, w) => paintSoulFlame(ctx, x, A.floor, z, w) });
      }
    }
    if (this.at(1.0)) this.relax();
    if (t >= 1.25) this.done(1.0);
  }

  // ── toll 통행료 (2페이즈): 은화 두 닢을 튕김 0.4초 (coin) → 그 순간 플레이어 x 에 warnMark 0.6초 → 혼불 기둥 strikeColumn 폭 64 · 경기장 높이 mv 0.75,
  //    0.5초 간격 둘 (체력 30% 이하 넷) ──
  s_toll(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.arms('coin', 10); this.setPose({ lean: -0.05 });
      telegraph(this, 0.4, { sfx: null });
      this.tollN = this.hpK() <= 0.3 ? 4 : 2;
    }
    if (this.at(0.4)) {
      this.arms('flick', 30);
      audio.sfx('coin', { vol: 0.9 }); audio.sfx('coin', { vol: 0.7, pitch: 1.2, delay: 0.08 });
      const H = this.handN({ x: 0, y: 0 });
      this.zone({ x: H.x - 60, y: H.y - 160, w: 120, h: 170, warn: 0, life: 0.6, harmless: true, z: 8, data: { coins: true }, paint: (ctx, z) => paintCoins(ctx, H.x, H.y, z, this.facing) });
    }
    const n = this.tollN ?? 2;
    for (let k = 0; k < n; k++) {
      if (this.at(0.4 + k * 0.5)) {
        const A = this.A, p = this.P, x = clamp(p ? p.cx : A.cx, A.x0 + 32, A.x1 - 32);
        warnMark(this, x, A.floor - 60, 0.6, SOUL);
        strikeColumn(this, x, { w: 64, top: A.top ?? 0, bottom: A.floor, warn: 0.6, life: 0.35, mv: 0.75, color: SOUL, sfx: 'fire', pitch: 0.8, vol: 0.7, kb: [200, -480], data: { toll: true, k } });
      }
    }
    if (this.at(0.9)) this.relax();
    if (t >= 0.4 + (n - 1) * 0.5 + 0.6 + 0.45) this.done(1.0);
  }

  // ── hearseGhost 빈 영구차 (2페이즈 · 전환 직후 강제): 휘파람 0.5초 (bell) → 경기장 끝(플레이어에게서 먼 쪽)에 말 없는 반투명 마차 혼 (구운 실루엣) →
  //    띠 경고 0.8초 (질주와 같은 띠) → 1300px/s 로 가로지름 (mv 0.8) → 사라짐. 답 = 발판 · 이단 점프 ──
  s_hearseGhost(dt, world, t) { this.ghostRun(dt, world, t, { warn: 0.8, speed: GHOST_SPEED, mv: 0.8, from: 'far', whistle: 0.5 }); }
  /** 마차 혼이 경기장을 가로지른다 (빈 영구차 · 2페이즈 debugAct 의 질주). 띠 = 마차 혼 폭 208, A.floor−2.6칸…A.floor */
  ghostRun(dt, world, t, o) {
    const A = this.A, T = T48(), by = this.bandY(), w0 = o.whistle ?? 0;
    if (this.at(0.001)) {
      this.faceP(10); this.spd = 0;
      this.arms('whistle', 10); this.setPose({ lean: -0.05 });
      audio.sfx('bell', { vol: 0.7, pitch: 1.4 });
      telegraph(this, w0 + o.warn, { sfx: null });
    }
    if (this.at(w0 + 0.001)) {
      const p = this.P, px = p ? p.cx : A.cx;
      const left = o.from === 'self' ? this.zx < A.cx : px > A.cx;
      const gx0 = left ? A.x0 + REAR_X : A.x1 - REAR_X, gx1 = left ? A.x1 - REAR_X : A.x0 + REAR_X, dir = left ? 1 : -1;
      const D = Math.abs(gx1 - gx0) / o.speed;
      this.relax(); this.arms('raise', 8);
      audio.sfx('ghost', { vol: 0.8, pitch: 0.6 }); audio.sfx('gallop', { vol: 0.6, pitch: 0.7 });
      const G = { x: gx0 };
      this.ghostZ = this.zone({ x: A.x0, y: by, w: A.w, h: 2.6 * T, warn: o.warn, life: D, mv: o.mv, kb: [420, -520], z: 5, data: { ghost: true, gx0, gx1 },
        tick: (z) => { if (z.t >= z.warn) { G.x = lerp(gx0, gx1, clamp((z.t - z.warn) / D, 0, 1)); z.x = G.x - REAR_X; z.w = 2 * REAR_X; } },
        onStart: (z, w) => impact(w, { shake: 5, time: 0.4 }),
        onEnd: (z, w) => { this.zone({ x: G.x - 120, y: by - 40, w: 240, h: 2.6 * T + 40, warn: 0, life: 0.35, harmless: true, z: 5, data: { ghostFade: true }, paint: (ctx, z2) => paintGhost(ctx, G.x, A.floor, dir, 1 - z2.a, null) }); w.fx.burst('soul', G.x, A.floor - 60, 14, { color: SOUL, speed: 220 }); },
        paint: (ctx, z, w) => {
          if (!z.started) { warnRect(ctx, A.x0, by, A.w, 2.6 * T, z.k, SOUL, w.time); paintGhost(ctx, gx0, A.floor, dir, 0.6 * z.k, null); }
          else paintGhost(ctx, G.x, A.floor, dir, 0.75, z);
        } });
      this.ghostT = { end: w0 + o.warn + D + 0.35 };
    }
    const g = this.ghostT;
    if (g && this.at(g.end - 0.3)) this.relax();
    if (g && t >= g.end) { this.ghostT = null; this.ghostZ = null; this.done(1.0); }
    if (t > 6) { this.ghostT = null; this.done(0.8); }
  }

  // ── gatherSouls 망자 부르기 (2페이즈): 무릎 꿇고 땅을 짚음 0.5초 (dark) → pullField 1.4초 (마부 쪽으로 240px/s, 달리기·대시로 버틴다) + spawnMinion(['ghost']) 1 (≤ 2) +
  //    둘레 warnCircle r 150 → 터짐 strikeCircle r 150 mv 0.85 → 노출 0.9초 (몸통 0.7) = 카운터 창 (최대 체력 5% 이상이면 무릎) ──
  s_gatherSouls(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0; this.exposed = false; this.dexp = 0;
      if (!this.coach) this.setPose({ kneel: 1, lean: 0.2 }); else this.setPose({ lean: 0.3 });
      this.arms('ground', 8);
      audio.sfx('dark', { vol: 0.7, pitch: 0.6 });
      telegraph(this, 0.5, { sfx: null });
      world.fx.burst('smoke', this.zx, this.fy - 10, 10, { color: SOUL_D, speed: 90 });
    }
    if (this.at(0.5)) {
      const cx = this.coach ? this.toWorld(0, -70, { x: 0, y: 0 }).x : this.zx, cy = this.fy - 70;
      this.pullZ = pullField(this, cx, cy, { dur: 1.4, force: 900, maxV: 240, color: SOUL });
      this.pullZ.data.gather = true;
      strikeCircle(this, cx, cy, 150, { warn: 1.4, life: 0.2, mv: 0.85, color: SOUL, sfx: 'dark', vol: 0.9, kb: [460, -360], burstFx: 'soul', data: { gatherBurst: true } });
      if (this.minionCount('ghost') < 2) spawnMinion(this, ['ghost'], clamp(cx - this.facing * 120, this.A.x0 + 40, this.A.x1 - 40), this.fy - 120, { facing: this.facing });
      audio.sfx('mist', { vol: 0.5, pitch: 0.5 });
    }
    if (t > 0.5 && t < 1.9 && Math.random() < 0.5 * (world.fx.quality ?? 1)) {
      const a = rand(0, TAU), r = rand(120, 220);
      world.fx.emit('soul', this.zx + Math.cos(a) * r, this.fy - 70 + Math.sin(a) * r * 0.6, { color: SOUL, speed: 60, angle: a + PI, spread: 0.2 });
    }
    if (this.at(1.9)) { this.pullZ = null; this.exposed = true; this.dexp = 0; this.cWinG = true; this.telegraphFor(0.9); this.arms('limp', 8); this.setPose({ kneel: 0.6, lean: 0.35 }); }
    if (this.at(2.8)) { this.exposed = false; this.cWinG = false; this.relax(); }
    if (t >= 2.95) this.done(0.9);
  }

  /** 보조: 무릎 1.4초 (몸통 0.7 · 머리 0.6) — 질주 카운터 창 · 망자 부르기 노출 중 5%. 15% 의 그림메인 들이받기는 긴 주저앉음 2.5초 (몸통 0.6).
   *  1페이즈는 말들이 휘청이고 마차가 기울며 마부가 고꾸라진다. 무릎 한 번에 STAG_CAP 만큼 잃으면 그 자리에서 일어선다 (wakeT, takeHit) */
  s_stagger(dt, world, t) {
    if (this.at(0.001)) this.wakeT = 9;
    const L = this.stagLong ? 2.5 : Math.min(1.4, this.wakeT);
    if (this.at(0.001)) {
      this.stunned = true; this.ghost = false; this.cWin = false; this.exposed = false; this.lanUp = false; this.spd = 0; this.run = null;
      this.whipMode = 'rest'; this.chainMode = 'coil'; this.crack = null;
      if (this.coach) { this.setPose({ bow: 0.8, lean: 0.3 }); this.arms('limp', 10); this.tilt = 0.06; this.pivot.x = -REAR_X; }
      else if (this.stagLong) { this.setPose({ slump: 1, tumble: 1 }); this.arms('sprawl', 8); }
      else { this.setPose({ kneel: 1, lean: 0.25 }); this.arms('limp', 10); }
      audio.sfx('hit_heavy', { pitch: 0.7 });
      world.fx.burst(this.coach ? 'spark' : 'dark', this.zx, this.fy - 60, 12, { color: this.coach ? GOLD : ASH, speed: 180 });
      impact(world, { shake: 6, time: 0.3 });
    }
    if (this.stunned && Math.random() < 0.2 * (world.fx.quality ?? 1)) { const P = this.toWorldM(this.pts.head.x, this.pts.head.y - 20, this._r); world.fx.emit('spark', P.x + rand(-14, 14), P.y, { color: '#fff3c0', speed: 40, angle: -PI / 2 }); }
    if (this.at(L)) { this.stunned = false; this.tilt = 0; this.setPose({ kneel: 0, lean: 0, bow: 0, slump: 0, tumble: 0 }); this.arms(this.coach ? 'seat' : 'stand', 8); }
    if (t >= L + 0.35) { this.stagLong = false; this.relax(); this.done(0.6); }
  }

  // ── lastLoad (보조, 15%): 하던 패턴을 끊고 고삐 올가미를 감음 0.6초. 스토리 모드·처음이면 곧바로 대사 b_charon_last (그 동안 월드가 멈춘다) →
  //    대사가 끝나면 그림메인이 들이받아 긴 주저앉음 2.5초 (몸통 0.6 — 마부가 옆으로 나동그라진다, 말 그림 없음).
  //    아케이드·다시 볼 때는 올가미가 보통 공격 (warnLine 0.6초 → strikeLine mv 0.8, 주저앉음 없음) ──
  s_lastLoad(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(0); this.spd = 0;
      this._lastMode = canShowScript(world, 'b_charon_last'); this._lastEnd = false;
      this.arms('noose', 10); this.setPose({ lean: -0.2 }); this.chainMode = 'raised';
      audio.sfx('clang', { vol: 0.5, pitch: 0.6 });
      if (this._lastMode && !phaseScript(this, 'b_charon_last', { onEnd: () => { this._lastEnd = true; } })) { this._lastMode = false; this._lastEnd = false; }
      if (!this._lastMode) {
        const A = this.A, p = this.P, H = this.handF({ x: 0, y: 0 }), f = this.facing;
        const tx = clamp(p ? p.cx + f * 40 : H.x + f * 400, A.x0 + 20, A.x1 - 20), ty = p ? clamp(p.cy, (A.top ?? 0) + 30, A.floor - 20) : A.floor - 40;
        strikeLine(this, H.x, H.y, tx, ty, { warn: 0.6, life: 0.3, th: 26, mv: 0.8, color: SOUL, sfx: 'whip_crack', vol: 0.9, kb: [380, -300], data: { noose: true },
          onStart: () => { this.chainMode = 'lash'; this.lashY = ty - this.O.y; this.lashK = 0; this.arms('throwNoose', 28); } });
      }
    }
    if (this._lastMode) {
      // 대사가 끝나면 (또는 보여 줄 수 없게 되면) 그림메인이 들이받는다 → 긴 주저앉음
      if (this._lastEnd || t > 8) { this._lastMode = false; this.ramFx(world); this.toStagger(true); }
      return;
    }
    if (this.at(1.1)) { this.chainMode = 'coil'; this.relax(); }
    if (t >= 1.3) this.done(1.0);
  }
  /** 그림메인이 마부를 들이받는 순간 (말 그림 없음 — 붉은 불티와 흙먼지만) */
  ramFx(world) {
    const P = this.toWorldM(0, -80, { x: 0, y: 0 });
    audio.sfx('hit_heavy', { pitch: 0.6, vol: 1 }); audio.sfx('neigh', { vol: 1, pitch: 0.85 });
    world.fx.burst('ember', P.x - this.facing * 30, P.y, 18, { color: '#ff5a3a', speed: 320 });
    world.fx.burst('dust', P.x, this.fy - 6, 14, { speed: 260, angle: -PI / 2, spread: 1.2 });
    impact(world, { shake: 12, time: 0.5, flash: '#ffd0a0', fa: 0.25 });
    this.chainMode = 'coil';
  }

  // ── 전환 unbridle (1→2): 무적 2.6초. 0.3초 휘파람(아케이드는 neigh 만) → 0.6초 말들이 멈추고 굴레가 끊어짐(금빛 불티) → 말 둘이 경기장 밖으로 달려
  //    빛 입자로 사라짐 → 1.2초 마차가 기울어 나뒹굴고 부서짐(나무 파편 둘 · 관 하나) → 2.0초 마부가 잔해에서 일어섬 (applyAt → applyPhase(1):
  //    판정 66×168 · 발 = 마차 가운데 x · A.floor · form2 칭호) → 끝에 대사 b_charon_unbridle (스토리 1회) → 곧바로 hearseGhost ──
  s_unbridle(dt, world, t) {
    if (this.at(0.001)) {
      this.transStart(world);
      this.arms('reins', 6); this.setPose({ lean: -0.1 });
    }
    if (this.at(0.3)) {
      if (world.mode === 'story') audio.sfx('bell', { vol: 0.4, pitch: 2.0 });
      audio.sfx('neigh', { vol: 1.0 }); audio.sfx('neigh', { vol: 0.7, pitch: 1.2, delay: 0.2 });
      screenTint(this, { color: '#08201a', alpha: 0.18, edge: SOUL, dur: 2.0 });
    }
    if (this.coach && this.at(0.6)) {
      // 굴레가 끊어진다 → 말 둘이 앞으로 내달린다 (빛이 되어 사라진다)
      this.hFree = true; this.arms('flinch', 10);
      for (const i of [0, 1]) { const b = this.bridleOf(i), P = this.toWorld(b.x - 30, b.y + 20, { x: 0, y: 0 }); world.fx.burst('spark', P.x, P.y, 12, { color: GOLD_H, speed: 240 }); }
      audio.sfx('whip_crack', { vol: 0.8, pitch: 0.7 });
    }
    if (this.hFree && this.horsesOn) {
      this.hRun += 560 * dt;
      this.hA = clamp(1 - (t - 0.9) / 0.6, 0, 1);
      if (this.hA <= 0) {
        const P = this.toWorld(H1.x + this.hRun, -60, { x: 0, y: 0 });
        world.fx.burst('holy', P.x, P.y, 16, { speed: 200 }); world.fx.burst('soul', P.x, P.y, 12, { color: SOUL, speed: 160 });
        this.horsesOn = false;
      }
    }
    if (this.coach && t >= 1.2 && t < 1.55) {
      // 마차가 앞으로 기울어 나뒹군다 (앞바퀴 아래 축) · 마부가 내던져진다
      this.pivot.x = WHL[1].x + WHL[1].r; this.pivot.y = 0;
      this.tilt = 0.6 * clamp((t - 1.2) / 0.35, 0, 1) ** 2;
      if (this.man === 'seat') { this.man = 'thrown'; this.thr = { t0: this.t, T: 0.45, x0: this.O.x, y0: this.O.y, r0: this.oRot }; this.setPose({ slump: 1 }); this.arms('sprawl', 10); audio.sfx('neigh', { vol: 0.5, pitch: 0.7 }); }
    }
    if (this.coach && t >= 1.55) this.wreck(world);
    if (this.at(2.25)) { this.setPose({ slump: 0 }); this.relax(); }
    this.transitionTick(dt, world, t);
  }
  transStart(world) {
    this.ghost = false; this.cWin = false; this.exposed = false; this.stunned = false; this.lanUp = false; this.spd = 0; this.run = null;
    this.tl = this.wc = null; this.whipMode = 'rest'; this.chainMode = 'coil'; this.crack = null;
    impact(world, { shake: 5, time: 0.5 });
  }
  /** 마차가 부서진다 (한 번): 나무 파편 둘 · 관 하나 · 금빛 불티 — 그 뒤 마차 그림 없음 */
  wreck(world = this.world) {
    if (!this.coach) return;
    const C = this.toWorld(0, -70, { x: 0, y: 0 });
    this.coach = false; this.broke = this.t; this.tilt = 0; this.joltY = 0; this.roofN = 0;
    this.horsesOn = false; this.hFree = false;
    if (this.man === 'seat') { this.man = 'thrown'; this.thr = { t0: this.t, T: 0.3, x0: this.O.x, y0: this.O.y, r0: this.oRot }; this.setPose({ slump: 1 }); this.arms('sprawl', 10); }
    if (world?.fx) {
      world.fx.burst('shard', C.x, C.y, 14, { color: LACQ_H, speed: 320 });
      world.fx.burst('spark', C.x, C.y, 12, { color: GOLD, speed: 260 });
      world.fx.burst('dust', C.x, this.fy - 10, 16, { speed: 260, angle: -PI / 2, spread: 1.3 });
      world.fx.burst('soul', C.x, C.y, 12, { color: SOUL, speed: 180 });
      impact(world, { shake: 10, time: 0.5 });
      audio.sfx('break_wall', { vol: 1, pitch: 0.8 });
      // 나무 파편 둘 · 관 하나 (잔해 — 무해한 지대가 3초 동안 바닥에 남아 사라진다)
      const f = this.facing, fl = this.fy;
      this.zone({ x: C.x - 160, y: fl - 80, w: 320, h: 80, warn: 0, life: 3.0, harmless: true, z: 3, data: { wreck: true }, paint: (ctx, z) => paintWreck(ctx, C.x, fl, f, z) });
    }
  }
  /** 형태 바꾸기 (페이즈마다 한 번, debugPhase 에도): 1 = 마부 혼자 (판정 66×168, 발 = 마차 가운데 x · A.floor) */
  applyPhase(k) {
    if (k >= 1 && (this.coach || this.man !== 'stand')) {
      if (this.coach) this.wreck(this.world);
      this.man = 'stand'; this.thr = null; this.horsesOn = false; this.hFree = false;
      this.w = SIZE_M.w; this.h = SIZE_M.h;
      this.zx = clamp(this.zx, this.A.x0 + 40, this.A.x1 - 40); this.fy = this.A.floor;
      this.O.x = this.zx; this.O.y = this.fy; this.oRot = 0;
      this.ps.slump = this.pt.slump = this.state === 'unbridle' ? 1 : 0; this.pt.slump = 0;
      this.arms('stand', 6);
      this.place();
      const w = this.world;
      if (w?.fx) {
        w.fx.burst('soul', this.zx, this.fy - 80, 16, { color: SOUL, speed: 220 });
        w.fx.ring(this.zx, this.fy - 80, { color: SOUL, r0: 10, r1: 200, life: 0.5, width: 4 });
        impact(w, { shake: 8, time: 0.4, flash: '#c8ffe0', fa: 0.25 });
        audio.sfx('dark', { vol: 0.7, pitch: 0.7 });
      }
    }
  }
  onCancel() {
    this.ghost = false; this.cWin = false; this.cWinG = false; this.exposed = false; this.stunned = false; this.lanUp = false; this.lanBroken = false; this.spd = 0;
    this.run = null; this._lastMode = false; this._lastEnd = false; this.stagLong = false; this.ghostT = null;
    this.tl = this.wc = null; this.whipMode = 'rest'; this.chainMode = 'coil'; this.crack = null;
    if (this.coach) this.tilt = 0;
    // 끊긴 패턴의 흡수장 · 질주 띠 · 마차 혼은 바로 사라진다 (15% 강제·무릎이 그 위에서 시작하지 않게)
    for (const k of ['pullZ', 'runZ', 'ghostZ']) { const z = this[k]; if (z && !z.dead) z.dead = true; this[k] = null; }
    if (this.coach) this.roofN = 3;
    this.relax();
  }
  onReset() {
    this.onCancel();
    // 부활: 소환한 해골·도깨비불·원혼은 resetArena 가 지웠다 — 그들이 쏜 탄도 같이 (보스 소유가 아니라 killTransients 가 남긴다)
    for (const e of this.world?.entities ?? []) if (!e.dead && (e.kind === 'projectile' || e.kind === 'hazard') && e.owner?.summoner === this) e.dead = true;
    this.coach = true; this.broke = -9; this.man = 'seat'; this.thr = null; this.tilt = 0; this.joltY = 0; this.joltT = -9; this.roofN = 3;
    this.horsesOn = true; this.hFree = false; this.hRun = 0; this.hA = 1;
    this.w = SIZE_H.w; this.h = SIZE_H.h;
    this.vanishK = 0; this.lanK = 0; this.lanOutT = -9;
    this._forced15 = false; this._lastNow = false; this._lanNow = false; this._stagNow = false;
    for (const k in this.pt) { this.pt[k] = 0; this.ps[k] = 0; }
    Object.assign(this.arm, ARM.seat); Object.assign(this.armT, ARM.seat);
    this.zx = this.clampX(this.zx); this.tzx = this.zx; this.fy = this.A.floor; this.fk = this.facing;
    this.motion(0, this.world);
  }

  // ═════════════════════════════ 쓰러짐 (체력 0) ═════════════════════════════
  onDeath(world) {
    this.clearJobs();   // 남은 지연 작업이 연출 중에 쏘지 않게
    // 쓰러질 때는 언제나 마차를 잃은 마부 (50% 를 한 방에 넘겨도). world.onBossDefeated 보다 먼저 — 배너·칭호가 처음부터 form2
    this._tr = null; this.applyPhasesTo(Math.max(1, this.phase), world);
    this.dying = 3.2; this.dieT = 0; this._bn = null; this._crumble = false; this._thud = false;
    this.ghost = false; this.cWin = false; this.exposed = false; this.stunned = false; this.lanUp = false; this.spd = 0; this.run = null;
    this.tl = this.wc = null; this.whipMode = 'rest'; this.chainMode = 'coil'; this.crack = null;
    this.man = 'stand'; this.O.x = this.zx; this.O.y = this.fy; this.oRot = 0;
    this.setPose({ slump: 1, kneel: 0, lean: 0, bow: 0.3, tumble: 0 }); this.arms('limp', 6);
    audio.sfx('dark', { vol: 0.5, pitch: 0.5 });
  }
  /**
   * 배너 이름 안전망: 부제는 기본 '격파!' 그대로. 처치 타격 바로 뒤(onHurt)와 쓰러짐 틱에서 새 배너가 뜰 때마다 한 번씩,
   * 부제에 1페이즈 이름이 남아 있으면 지금 모습의 이름으로 — 카론은 두 모습 이름이 같아 바꿀 것이 없다 (e_bride.js 와 같은 틀)
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
    if (!this._thud && T >= 0.5) { this._thud = true; audio.sfx('land', { pitch: 0.6, vol: 0.6 }); world.fx.burst('dust', this.zx, this.fy - 6, 12, { speed: 120, angle: -PI / 2, spread: 1.6 }); }
    const arcade = world.arcade ?? world.mode !== 'story';
    if (arcade) {
      // 아케이드: 주저앉음 1.2초 → 재와 혼불로 흩어져 3.0초에 사라진다 (파편 폭발 없음 — 입자)
      if (T >= 1.2) {
        if (!this._crumble) { this._crumble = true; audio.sfx('mist', { vol: 0.5, pitch: 0.6 }); }
        this.vanishK = clamp((T - 1.2) / 1.8, 0, 1);
        this.ashAcc += dt * 40 * q * (1 - this.vanishK * 0.6);
        while (this.ashAcc >= 1) {
          this.ashAcc -= 1;
          const P = this.toWorldM(rand(-26, 26), -rand(4, 120) * (1 - this.vanishK * 0.7), this._r);
          const soul = Math.random() < 0.35;
          world.fx.emit(soul ? 'soul' : 'ember', P.x, P.y, { color: soul ? SOUL : ASH, speed: rand(30, 110), angle: -PI / 2 - this.facing * 0.5, spread: 1.2 });
        }
      }
    } else if (this.dying < 0.25) this.dying = 0.25;   // 스토리: 주저앉은 채 남는다 (스테이지가 끝날 때까지 — world.afterClear 는 clearT 7초에)
    this.motion(dt, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    if (this.hidden || this.vanishK >= 1) return;
    const k = this.dying > 0 ? 0.4 * (1 - this.vanishK) : 1;
    const e = this.toWorldM(this.pts.eye.x, this.pts.eye.y, { x: 0, y: 0 });
    L.add(e.x, e.y, 50, SOUL, 0.5 * k);
    const ln = this.lanternW({ x: 0, y: 0 }), lk = this.lanBroken && this.t - this.lanOutT < 3 ? 0.15 : 0.55 + 0.5 * this.lanK;
    L.add(ln.x, ln.y, 140 + 80 * this.lanK, SOUL, lk * k);
    if (this.coach) L.add(this.zx, this.fy - 80, 240, SOUL, 0.25 * k);
    if (this.horsesOn) { const P = this.toWorld(H1.x + this.hRun, -60, { x: 0, y: 0 }); L.add(P.x, P.y, 170, SOUL, 0.45 * this.hA * k); }
    if (this.cWin || this.cWinG) L.add(this.zx, this.fy - 80, 200, '#ffffff', 0.5);
  }

  // ═════════════════════════════ 그리기 (벡터) ═════════════════════════════
  bodyAlpha() { return 1 - this.vanishK; }
  paintBack(ctx, world) {
    if (R.fl) return;
    if (this.coach) glowE(ctx, this.zx, this.fy - 2, 130, 10, SOUL_D, 0.35);
  }
  paintBody(ctx, world, flash) {
    const a = this.bodyAlpha();
    if (a <= 0.01 || this.ghost) return;
    const fl = R.fl;
    ctx.save();
    ctx.translate(this.zx, this.fy + this.joltY);
    ctx.scale(this.fk || 0.001, 1);
    ctx.globalAlpha *= a;
    if (this.horsesOn) this.drawHorses(ctx, world, 'far');
    if (this.coach) {
      ctx.save();
      if (this.tilt) { ctx.translate(this.pivot.x, this.pivot.y); ctx.rotate(this.tilt); ctx.translate(-this.pivot.x, -this.pivot.y); }
      drawCoach(ctx, this, fl, 'back');
      ctx.restore();
    }
    ctx.restore();
    // 마부 (자기 틀)
    ctx.save();
    ctx.translate(this.O.x, this.O.y); ctx.scale(this.fk || 0.001, 1); if (this.oRot) ctx.rotate(this.oRot);
    ctx.globalAlpha *= a;
    if (this.ps.tumble > 0.01) { ctx.translate(-10, 0); ctx.rotate(-0.5 * this.ps.tumble); ctx.translate(10, 0); }
    this.drawMan(ctx, fl);
    ctx.restore();
    // 앞: 마차 앞판 · 등불 · 고삐 · 가까운 말
    ctx.save();
    ctx.translate(this.zx, this.fy + this.joltY);
    ctx.scale(this.fk || 0.001, 1);
    ctx.globalAlpha *= a;
    if (this.coach) {
      ctx.save();
      if (this.tilt) { ctx.translate(this.pivot.x, this.pivot.y); ctx.rotate(this.tilt); ctx.translate(-this.pivot.x, -this.pivot.y); }
      drawCoach(ctx, this, fl, 'front');
      ctx.restore();
    }
    if (this.horsesOn) { this.drawHorses(ctx, world, 'near'); if (this.coach && !this.hFree) drawReins(ctx, this, fl); }
    ctx.restore();
  }
  paintFront(ctx, world) {
    if (R.fl || this.ghost) return;
    if (this.cWin || this.cWinG || this.exposed) { const e = this.toWorldM(this.pts.eye.x, this.pts.eye.y, this._r); glow(ctx, e.x, e.y, 12, SOUL, 0.8); }
  }
  /** 마부 (지역 좌표: 원점 O, +x = 얼굴 쪽) */
  drawMan(ctx, fl) {
    const P = this.pts, seat = this.man === 'seat';
    // 1) 먼 팔 · 고삐 사슬 (2페이즈) · 먼 다리
    this.drawArm(ctx, true, fl);
    if (!this.coach && this.chainMode !== 'lash') drawChain(ctx, this.chain, fl, 0.7);
    drawLeg(ctx, P, false, fl);
    // 2) 외투 자락 (뒤) · 가까운 다리 · 외투 몸통 · 머리
    for (let r = 1; r >= 0; r--) drawTail(ctx, this.tails[r], r ? 11 : 13, r ? 4 : 5, fl ? '#fff' : r ? COAT_D : COAT, fl);
    drawLeg(ctx, P, true, fl);
    this.drawCoat(ctx, fl, seat);
    this.drawHead(ctx, fl);
    // 3) 채찍 (마차가 있을 때) · 가까운 팔 · 등불 (2페이즈)
    if (this.coach || this.man !== 'stand') drawWhip(ctx, this.whip, fl, this.whipMode === 'crack');
    if (!this.coach && this.chainMode === 'lash') drawChain(ctx, this.chain, fl, 1);
    this.drawArm(ctx, false, fl);
    if (!this.coach && this.man === 'stand') drawLanternAt(ctx, P.hdN.x, P.hdN.y, P.lanA - PI / 2, fl, this.lanK, this.lanBroken && this.t - this.lanOutT < 2.5, this.t, 0.9);
  }
  /** 외투: 겹망토(어깨) + 몸판 + 앞자락 (앉으면 무릎을 덮는다) */
  drawCoat(ctx, fl, seat) {
    const P = this.pts, H = P.hip, N = P.neck, ta = P.tA, c = Math.cos(ta), s = Math.sin(ta);
    const at = (u, side) => ({ x: lerp(H.x, N.x, u) + c * side, y: lerp(H.y, N.y, u) + s * side });
    const hem = seat ? 18 : 44 - 20 * clamp(this.ps.kneel, 0, 1);
    const f0 = at(0, 10), f1 = at(0.6, 11), f2 = at(1, 7), b2 = at(1, -8), b1 = at(0.5, -12), b0 = at(0, -12);
    ctx.beginPath();
    ctx.moveTo(f2.x, f2.y); ctx.quadraticCurveTo(f1.x + 2, f1.y, f0.x, f0.y);
    if (seat) { ctx.lineTo(P.knN.x + 4, P.knN.y - 4); ctx.lineTo(P.knN.x + 2, P.knN.y + 10); ctx.lineTo(H.x - 4, H.y + hem); }
    else { ctx.lineTo(f0.x + 4 + this.walkK * 3, H.y + hem); ctx.lineTo(b0.x - 6 - this.walkK * 6, H.y + hem + 2); }
    ctx.lineTo(b0.x, b0.y); ctx.quadraticCurveTo(b1.x - 2, b1.y, b2.x, b2.y); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'ch_coat', -10, -60, 10, 20, [0, COAT_H, 0.45, COAT, 1, COAT_D]), 1.4);
    if (fl) return;
    // 단추 · 녹색 안감 · 겹망토
    ctx.fillStyle = BRASS;
    for (let i = 0; i < 4; i++) { const p = at(0.2 + i * 0.2, 8); ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = rgba(LINING, 0.9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(f0.x + 2, f0.y); ctx.lineTo(seat ? P.knN.x + 2 : f0.x + 4, seat ? P.knN.y + 8 : H.y + hem - 1); ctx.stroke();
    const s0 = at(0.98, 9), s1 = at(0.98, -10), s2 = at(0.62, -15), s3 = at(0.62, 13);
    ctx.beginPath(); ctx.moveTo(s0.x, s0.y - 2); ctx.quadraticCurveTo(s3.x + 6, s3.y - 8, s3.x + 2, s3.y); ctx.lineTo(s2.x - 2, s2.y + 1); ctx.quadraticCurveTo(s1.x - 4, s1.y - 2, s1.x, s1.y - 3); ctx.closePath();
    ink(ctx, LG(ctx, 'ch_cape', -10, -140, 10, -100, [0, COAT_H, 1, COAT_D]), 1.2);
    ctx.strokeStyle = rgba(COAT_H, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lerp(s3.x, s2.x, 0.1), s3.y - 6); ctx.lineTo(lerp(s3.x, s2.x, 0.9), s2.y - 5); ctx.stroke();
  }
  /** 머리: 해골 같은 잿빛 옆얼굴 · 움푹한 녹청 눈 · 높은 모자(붉은 띠 · 놋쇠 고리) */
  drawHead(ctx, fl) {
    const P = this.pts, h = P.head, t = this.t;
    ctx.save();
    ctx.translate(h.x, h.y); ctx.rotate(P.hA);
    ctx.beginPath(); ctx.ellipse(-5, -1, 7, 9, 0.2, 0, TAU); ink(ctx, fl ? '#fff' : '#1a1418', 1);   // 뒷머리
    ctx.beginPath();
    ctx.moveTo(-6, -8); ctx.quadraticCurveTo(4, -11, 7, -5); ctx.lineTo(9, 0); ctx.lineTo(7, 2); ctx.lineTo(8, 6); ctx.quadraticCurveTo(5, 10, 0, 10); ctx.quadraticCurveTo(-5, 8, -6, 2); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'ch_face', -6, -6, 9, 8, [0, SKIN_D, 0.5, SKIN, 1, '#e8e4dc']), 1.2);
    if (!fl) {
      ctx.fillStyle = '#0a0808'; ctx.beginPath(); ctx.ellipse(3.8, -2.6, 2.8, 2.2, 0.1, 0, TAU); ctx.fill();   // 움푹한 눈
      ctx.fillStyle = SOUL; ctx.beginPath(); ctx.arc(4.2, -2.6, 1.1, 0, TAU); ctx.fill();
      glow(ctx, 4.2, -2.6, 6, SOUL, 0.55 + 0.2 * Math.sin(t * 3));
      ctx.strokeStyle = 'rgba(30,24,24,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1, 3); ctx.lineTo(5, 4); ctx.moveTo(3, 6); ctx.lineTo(7, 6.5); ctx.stroke();   // 광대 · 이
    }
    ctx.restore();
    // 모자 (머리 위 — 인사할 때 들린다)
    const hb = P.hatB;
    ctx.save(); ctx.translate(hb.x, hb.y); ctx.rotate(P.hA + 0.25 * this.ps.hat);
    drawHat(ctx, fl);
    ctx.restore();
  }
  /** 팔: 검은 외투 소매 · 검은 장갑 */
  drawArm(ctx, far, fl) {
    const P = this.pts, S = far ? P.shF : P.shN, E = far ? P.elF : P.elN, H = far ? P.hdF : P.hdN;
    const col = fl ? '#fff' : far ? COAT_D : COAT;
    limb(ctx, S.x, S.y, E.x, E.y, 4.8, 4.2, col, far ? null : COAT_H);
    limb(ctx, E.x, E.y, H.x, H.y, 4.2, 3.4, col, far ? null : COAT_H);
    const fa = Math.atan2(H.y - E.y, H.x - E.x);
    ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(fa);
    ctx.beginPath(); ctx.ellipse(1.5, 0, 3.8, 2.8, 0, 0, TAU); ink(ctx, fl ? '#fff' : far ? '#08060a' : '#16121a', 1);
    ctx.restore();
  }
}

// ═════════════════════════════ 말 보기 개체 (render/mounts.js drawMount 계약 — 메뉴 미리보기 'view' 와 같은 모양) ═════════════════════════════
function mkHorse(t0) {
  return { id: 'mt_morgen', rig: 'horse', def: { rig: 'horse' }, state: 'view', anim: 'idle', animT: 0, t: t0, cx: 0, bottom: 0, facing: 1, vx: 0, vy: 0, onGround: true,
    speedK: 0, gait: 'idle', phase: t0 * 0.37 % 1, skid: false, pitch: 0, rearK: 0, duck: 0, lean: 0, bob: 0, wingK: 0, alpha: 1, scale: 1, pose: null };
}

// ═════════════════════════════ 그리기 도우미 ═════════════════════════════
const OUTL = 'rgba(6,4,8,0.9)';
/** 끝이 가는 팔다리 (외곽선 + 위쪽 광택) — e_bride.js 와 같다 */
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
/** 다리: 검은 바지 허벅지 + 긴 승마 장화 */
function drawLeg(ctx, P, near, fl) {
  const hx = P.hip.x + (near ? 2 : -3), hy = P.hip.y + (near ? 4 : 3), K = near ? P.knN : P.knF, F = near ? P.ftN : P.ftF;
  limb(ctx, hx, hy, K.x, K.y, 5.5, 4.6, fl ? '#fff' : near ? COAT : COAT_D, near ? COAT_H : null);
  limb(ctx, K.x, K.y, F.x, F.y - 3, 4.6, 4, fl ? '#fff' : near ? '#1a1416' : '#0a0809', near ? '#4a4048' : null);
  ctx.beginPath(); ctx.moveTo(F.x - 4, F.y - 6); ctx.lineTo(F.x + 9, F.y - 3); ctx.lineTo(F.x + 9, F.y); ctx.lineTo(F.x - 5, F.y); ctx.closePath();
  ink(ctx, fl ? '#fff' : near ? '#1a1416' : '#0a0809', 1);
}
/** 외투 자락 (점 띠, 뿌리 폭 w0 → 끝 폭 w1) */
function drawTail(ctx, S, w0, w1, col, fl) {
  const n = S.length - 1, L = [], Rr = [];
  for (let i = 0; i <= n; i++) {
    const a = S[Math.min(n, i + 1)], b = S[Math.max(0, i - 1)], ang = Math.atan2(a.y - b.y, a.x - b.x), w = lerp(w0, w1, i / n) / 2;
    L.push([S[i].x - Math.sin(ang) * w, S[i].y + Math.cos(ang) * w]); Rr.push([S[i].x + Math.sin(ang) * w, S[i].y - Math.cos(ang) * w]);
  }
  ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i <= n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.strokeStyle = OUTL; ctx.lineWidth = 1; ctx.stroke();
  if (!fl) { ctx.strokeStyle = rgba(LINING, 0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Rr[0][0], Rr[0][1]); for (let i = 1; i <= n; i++) ctx.lineTo(Rr[i][0], Rr[i][1]); ctx.stroke(); }
}
/** 높은 모자 (원점 = 챙 가운데, 위가 −y) */
function drawHat(ctx, fl) {
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-7, -26); ctx.quadraticCurveTo(0, -29, 7, -26); ctx.lineTo(8, 0); ctx.closePath();
  ink(ctx, fl ? '#fff' : LG(ctx, 'ch_hat', -8, -26, 8, 0, [0, '#2a2630', 0.5, '#141016', 1, '#060508']), 1.2);
  ctx.beginPath(); ctx.ellipse(0, 0, 14, 2.6, 0, 0, TAU); ink(ctx, fl ? '#fff' : '#0e0c10', 1);
  if (fl) return;
  ctx.fillStyle = BAND; ctx.fillRect(-7.6, -6.5, 15.4, 5);
  ctx.fillStyle = BRASS; ctx.fillRect(2, -6, 3.2, 4);
}
/** 채찍: 손잡이(두꺼운 첫 세 마디) + 가늘어지는 끈. crack 이면 끝에 불티 */
function drawWhip(ctx, W, fl, crack) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = fl ? '#fff' : LEATHER; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(W[0].x, W[0].y); for (let i = 1; i <= 3; i++) ctx.lineTo(W[i].x, W[i].y); ctx.stroke();
  ctx.strokeStyle = fl ? '#fff' : '#120c0a'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(W[3].x, W[3].y); for (let i = 4; i < W.length; i++) ctx.lineTo(W[i].x, W[i].y); ctx.stroke();
  if (!fl) { ctx.fillStyle = BRASS; ctx.beginPath(); ctx.arc(W[3].x, W[3].y, 1.6, 0, TAU); ctx.fill(); }
  if (crack && !fl) { const e = W[W.length - 1]; glow(ctx, e.x, e.y, 12, EMBER, 0.8); }
}
/** 고삐 사슬 (끊어진 가죽 고삐 + 쇠고리) */
function drawChain(ctx, C, fl, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = fl ? '#fff' : LEATHER; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(C[0].x, C[0].y); for (let i = 1; i < C.length; i++) ctx.lineTo(C[i].x, C[i].y); ctx.stroke();
  if (!fl) {
    ctx.strokeStyle = IRON_H; ctx.lineWidth = 1.2;
    for (let i = 1; i < C.length; i += 2) { ctx.beginPath(); ctx.ellipse(C[i].x, C[i].y, 2.6, 1.6, Math.atan2(C[i].y - C[i - 1].y, C[i].x - C[i - 1].x), 0, TAU); ctx.stroke(); }
  }
  ctx.restore();
}
/** 등불 (원점 = 고리, 아래로 매달림). k = 부풂 0..1 · out = 꺼짐 */
function drawLanternAt(ctx, x, y, ang, fl, k, out, t, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
  ctx.strokeStyle = fl ? '#fff' : IRON_H; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -3, 3, PI, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(7, 4); ctx.lineTo(-7, 4); ctx.closePath(); ink(ctx, fl ? '#fff' : IRON, 1);
  ctx.beginPath(); ctx.rect(-5.5, 4, 11, 13); ink(ctx, fl ? '#fff' : out ? '#1a2a24' : LG(ctx, 'ch_glass', 0, 4, 0, 17, [0, SOUL_H, 0.5, GLASS, 1, SOUL_D]), 1);
  ctx.beginPath(); ctx.moveTo(-7, 17); ctx.lineTo(7, 17); ctx.lineTo(5, 21); ctx.lineTo(-5, 21); ctx.closePath(); ink(ctx, fl ? '#fff' : IRON, 1);
  if (!fl) {
    ctx.strokeStyle = IRON; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, 17); ctx.stroke();
    if (!out) { glow(ctx, 0, 11, 9 + 8 * k, SOUL, 0.7 + 0.3 * k, true); if (k > 0.05) glow(ctx, 0, 11, 26 * k + 10, SOUL, 0.45 * k + 0.1 * Math.sin(t * 12) * k); }
  }
  ctx.restore();
}
/**
 * 영구 마차 (마차 지역 좌표, 원점 = 가운데 바닥, +x = 말 쪽). layer 'back' = 끌채(먼) · 뒷바퀴 · 상자 · 지붕 관 · 마부석 / 'front' = 앞바퀴 · 발판 · 등불 · 끌채(가까운)
 */
function drawCoach(ctx, b, fl, layer) {
  const t = b.t;
  if (layer === 'back') {
    shaft(ctx, fl, -3, true);
    wheel(ctx, WHL[0].x - 4, WHL[0].y - 2, WHL[0].r, b.wA, fl, true);   // 먼 뒷바퀴
    // 지붕 관 (난간 뒤)
    for (let i = 0; i < b.roofN; i++) { ctx.save(); ctx.translate(-70 + i * 48, -136 - (i === 1 ? 2 : 0)); drawCoffinShape(ctx, 0.62, fl, 0); ctx.restore(); }
    // 상자 몸통
    ctx.beginPath();
    ctx.moveTo(-100, -52); ctx.lineTo(-104, -112); ctx.quadraticCurveTo(-100, -132, -82, -134); ctx.lineTo(56, -134); ctx.quadraticCurveTo(68, -132, 70, -118); ctx.lineTo(72, -52); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'ch_box', 0, -134, 0, -52, [0, LACQ_H, 0.35, LACQ, 1, LACQ_D]), 2);
    if (!fl) {
      // 금박 테 · 장식 · 유리창 너머의 관
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-98, -58); ctx.lineTo(66, -58); ctx.moveTo(-100, -126); ctx.lineTo(62, -126); ctx.stroke();
      ctx.beginPath(); ctx.rect(-78, -118, 120, 50); ctx.fillStyle = 'rgba(40,80,70,0.55)'; ctx.fill(); ctx.strokeStyle = GOLD_D; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.save(); ctx.translate(-18, -86); drawCoffinShape(ctx, 0.95, false, 1); ctx.restore();
      ctx.fillStyle = rgba(SOUL_H, 0.12); ctx.beginPath(); ctx.moveTo(-74, -116); ctx.lineTo(-48, -116); ctx.lineTo(-74, -78); ctx.closePath(); ctx.fill();   // 유리 반사
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.2;
      for (const x of [-92, 54]) { ctx.beginPath(); ctx.moveTo(x, -66); ctx.quadraticCurveTo(x + 6, -92, x, -118); ctx.stroke(); }
      // 지붕 난간
      ctx.strokeStyle = IRON_H; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-96, -146); ctx.lineTo(60, -146);
      for (let x = -96; x <= 60; x += 26) { ctx.moveTo(x, -146); ctx.lineTo(x, -134); }
      ctx.stroke();
    }
    // 마부석 (상자 앞쪽 위) · 등받이
    ctx.beginPath(); ctx.moveTo(66, -100); ctx.lineTo(66, -118); ctx.lineTo(98, -118); ctx.lineTo(100, -108); ctx.closePath(); ink(ctx, fl ? '#fff' : LACQ, 1.4);
    ctx.beginPath(); ctx.moveTo(62, -110); ctx.lineTo(60, -146); ctx.lineTo(68, -146); ctx.lineTo(70, -110); ctx.closePath(); ink(ctx, fl ? '#fff' : LACQ_D, 1.2);
    wheel(ctx, WHL[0].x, WHL[0].y, WHL[0].r, b.wA, fl, false);   // 가까운 뒷바퀴
    // 차대
    ctx.strokeStyle = fl ? '#fff' : IRON; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-98, -50); ctx.lineTo(102, -50); ctx.stroke();
    return;
  }
  // front
  wheel(ctx, WHL[1].x, WHL[1].y, WHL[1].r, b.wA * WHL[0].r / WHL[1].r, fl, false);
  ctx.beginPath(); ctx.moveTo(70, -84); ctx.lineTo(116, -84); ctx.lineTo(114, -78); ctx.lineTo(72, -78); ctx.closePath(); ink(ctx, fl ? '#fff' : LACQ, 1.2);   // 발판
  ctx.beginPath(); ctx.moveTo(100, -82); ctx.lineTo(104, -50); ctx.lineTo(96, -50); ctx.lineTo(92, -82); ctx.closePath(); ink(ctx, fl ? '#fff' : LACQ_D, 1.2);   // 앞판
  shaft(ctx, fl, 0, false);
  // 앞 모서리 등불 둘 (먼 것은 어둡게) — 부풀면 커진다
  const k = b.lanK, out = b.lanBroken && t - b.lanOutT < 2.5;
  ctx.strokeStyle = fl ? '#fff' : IRON; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(96, -104); ctx.lineTo(LANT.x, -104); ctx.lineTo(LANT.x, LANT.y - 3); ctx.stroke();
  drawLanternAt(ctx, LANT.x - 6, LANT.y - 4, 0, fl, 0, false, t, 0.85);
  drawLanternAt(ctx, LANT.x, LANT.y, 0, fl, k, out, t, 1 + 0.25 * k);
}
function shaft(ctx, fl, dy, far) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = fl ? '#fff' : far ? WOOD_D : WOOD; ctx.lineWidth = 3.6;
  ctx.beginPath(); ctx.moveTo(98, -46 + dy); ctx.quadraticCurveTo(130, -50 + dy, H1.x - 18, -56 * HS + dy); ctx.stroke();
  if (!fl && !far) { ctx.strokeStyle = GOLD_D; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(100, -47); ctx.quadraticCurveTo(130, -51, H1.x - 20, -57 * HS); ctx.stroke(); }
}
/** 살바퀴 (a = 굴러간 각) */
function wheel(ctx, x, y, r, a, fl, far) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = fl ? '#fff' : far ? '#0a080c' : IRON; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r - 3, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = fl ? '#fff' : far ? '#140e0c' : WOOD; ctx.stroke();
  ctx.rotate(a);
  ctx.strokeStyle = fl ? '#fff' : far ? '#140e0c' : WOOD; ctx.lineWidth = 2.2;
  ctx.beginPath(); for (let i = 0; i < 10; i++) { const q = i * TAU / 10; ctx.moveTo(Math.cos(q) * 5, Math.sin(q) * 5); ctx.lineTo(Math.cos(q) * (r - 3), Math.sin(q) * (r - 3)); } ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ink(ctx, fl ? '#fff' : far ? '#1a1418' : GOLD_D, 1);
  ctx.restore();
}
/** 관 (원점 = 가운데, 가로로 누운 옆모습). lid 1 = 유리창 속 관 (어둡게) */
function drawCoffinShape(ctx, s, fl, lid) {
  ctx.save(); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(-36, -4); ctx.lineTo(-30, -11); ctx.lineTo(26, -11); ctx.lineTo(36, -5); ctx.lineTo(36, 5); ctx.lineTo(26, 11); ctx.lineTo(-30, 11); ctx.lineTo(-36, 4); ctx.closePath();
  ink(ctx, fl ? '#fff' : lid ? '#140e0c' : LG(ctx, 'ch_coffin', 0, -11, 0, 11, [0, '#5a4030', 1, WOOD_D]), 1.4);
  if (!fl) { ctx.strokeStyle = lid ? GOLD_D : 'rgba(20,12,8,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(30, 0); ctx.stroke(); }
  ctx.restore();
}
/** 고삐 (마부의 먼 손 → 두 말의 굴레). 굴레 줄은 녹청 빛 */
function drawReins(ctx, b, fl) {
  const P = b.pts, O = b.O;
  // 마부 손 (마차 지역으로): O 는 월드, 마차 틀은 zx·fy 기준
  const hx = (O.x - b.zx) / b.fk + P.hdF.x, hy = O.y - (b.fy + b.joltY) + P.hdF.y;
  for (const i of [1, 0]) {
    const br = b.bridleOf(i);
    ctx.strokeStyle = fl ? '#fff' : i ? rgba(SOUL_D, 0.8) : LEATHER; ctx.lineWidth = i ? 1 : 1.4;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + br.x) / 2, Math.max(hy, br.y) + 18, br.x, br.y); ctx.stroke();
    if (!fl && !i) { ctx.strokeStyle = rgba(SOUL, 0.35); ctx.lineWidth = 3; ctx.stroke(); }
  }
}

// ── 지대 그림 ──
/** 질주 띠: 말발굽 먼지와 녹청 잔광 (띠 사각형 안) */
function paintRunBand(ctx, z, w, f) {
  const a = 0.5 + 0.2 * Math.sin((w.time ?? z.t) * 30);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(f > 0 ? z.x : z.x + z.w, 0, f > 0 ? z.x + z.w : z.x, 0);
  g.addColorStop(0, rgba(SOUL, 0)); g.addColorStop(1, rgba(SOUL, 0.28 * a));
  ctx.fillStyle = g; ctx.fillRect(z.x, z.y, z.w, z.h);
}
/** 채찍 소리 자국 (짧은 별 모양 섬광) */
function paintCrack(ctx, x, y, r, z) {
  const a = 1 - z.a;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(EMBER, 0.8 * a); ctx.lineWidth = 3;
  ctx.beginPath(); for (let i = 0; i < 6; i++) { const q = i * TAU / 6 + 0.3; ctx.moveTo(x + Math.cos(q) * r * 0.2, y + Math.sin(q) * r * 0.2); ctx.lineTo(x + Math.cos(q) * r * (0.6 + 0.4 * z.a), y + Math.sin(q) * r * (0.6 + 0.4 * z.a)); } ctx.stroke();
  glow(ctx, x, y, r * 0.8, EMBER, 0.6 * a, true);
}
/** 관: 예고 = 지붕에서 날아가는 관 + 바닥 표시 / 판정 = 부서지는 관과 혼불 기둥 */
function paintCoffin(ctx, z, w, sx, sy, x, fl, warn, i) {
  if (!z.started) {
    const k = clamp(z.t / warn, 0, 1);
    warnFloor(ctx, x, fl, 72 * 1.3, k, SOUL, w.time);
    const cx = lerp(sx, x, k), cy = lerp(sy, fl - 18, k) - Math.sin(k * PI) * 180;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(k * (i ? -4 : 5)); drawCoffinPart(ctx, w, 0.8); ctx.restore();
    return;
  }
  const f = 1 - z.a, h = z.h;
  glowE(ctx, x, fl - h / 2, 40, h / 2 + 6, SOUL, 0.7 * f);
  ctx.save(); ctx.globalAlpha *= f; ctx.translate(x, fl - 10); ctx.rotate(0.2); drawCoffinPart(ctx, w, 0.8); ctx.restore();
}
/** 관 하나 (월드): 채색 퍼핏이 준비됐으면 그 coffin 부품, 아니면 벡터 */
const COFFIN_W = 58;
function drawCoffinPart(ctx, w, s) {
  const rig = paintedEnabled?.(w?.game) ? paintedRig?.('b_charon') : null;
  const p = rig?.parts?.coffin, im = p?.v?.base;
  if (im && p.c) { const k = (COFFIN_W * s) / Math.max(1, p.w - p.pad * 2); ctx.scale(k, k); ctx.drawImage(im, -p.c[0], -p.c[1]); return; }
  drawCoffinShape(ctx, s, false, 0);
}
/** 혼불 등불의 고리 (등불 판정을 따라간다) */
function paintLanRing(ctx, b, z) {
  const G = b.pLan, x = G.x + G.w / 2, y = G.y + G.h / 2, k = 0.6 + 0.4 * Math.sin(z.t * 10);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(SOUL, 0.75 * k); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, G.w * 0.5 + 3 * Math.sin(z.t * 6), 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba(SOUL_H, 0.5 * k); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, G.w * 0.36, z.t * 3, z.t * 3 + PI * 1.3); ctx.stroke();
}
/** 따라오는 혼불 (200px/s, 2.5초, mv 0.5, 맞으면 사라짐) */
function seeker(b, x, y, i) {
  const st = { x: x + (i - 1) * 30, y: y - 10 * i, vx: (i - 1) * 120, vy: -160 };
  b.zone({ x: st.x - 14, y: st.y - 14, w: 28, h: 28, warn: 0.15 + i * 0.12, life: 2.5, mv: 0.5, kb: [200, -200], circle: { x: st.x, y: st.y, r: 14 }, z: 7, data: { seeker: true, i },
    tick: (z, w, dt) => {
      if (z.t < z.warn) return;
      const p = w.player;
      if (p && !p.dead) {
        const dx = p.cx - st.x, dy = p.cy - st.y, d = Math.hypot(dx, dy) || 1;
        st.vx += (dx / d * 200 - st.vx) * Math.min(1, dt * 3); st.vy += (dy / d * 200 - st.vy) * Math.min(1, dt * 3);
        const sp = Math.hypot(st.vx, st.vy); if (sp > 200) { st.vx *= 200 / sp; st.vy *= 200 / sp; }
      }
      const A = b.A;
      st.x = clamp(st.x + st.vx * dt, A.x0 + 10, A.x1 - 10); st.y = clamp(st.y + st.vy * dt, (A.top ?? 0) + 10, A.floor - 10);
      z.circle.x = st.x; z.circle.y = st.y; z.x = st.x - 14; z.y = st.y - 14;
    },
    onHitP: (z) => { z.dead = true; z.world.fx?.burst?.('soul', st.x, st.y, 8, { color: SOUL, speed: 140 }); },
    paint: (ctx, z) => {
      const a = z.t < z.warn ? z.t / z.warn : 1 - Math.max(0, (z.t - z.warn - 2.2) / 0.3);
      glow(ctx, st.x, st.y, 22, SOUL, 0.6 * a, true);
      glow(ctx, st.x, st.y, 7, SOUL_H, 0.9 * a, true);
    } });
}
/** 고삐 사슬 판정 (띠 사각형 안): 녹청 빛을 두른 사슬이 휘몰아친 자국 */
function paintChainBand(ctx, z, f) {
  const a = 1 - z.a, x0 = f > 0 ? z.x : z.x + z.w, x1 = f > 0 ? z.x + z.w : z.x, cy = z.y + z.h / 2;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (const [lw, c, al] of [[z.h * 0.6, SOUL, 0.4], [3, SOUL_H, 0.9]]) {
    ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0, cy);
    for (let i = 1; i <= 8; i++) { const u = i / 8; ctx.lineTo(lerp(x0, x1, u), cy + Math.sin(u * 9 + z.t * 30) * z.h * 0.2); }
    ctx.stroke();
  }
}
/** 등불 휘두르기: 앞쪽 반원 호 (녹청 불) */
function paintSwing(ctx, x, y, r, z, f) {
  const a = 1 - z.a;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const a0 = f > 0 ? -PI / 2 : PI / 2, a1 = f > 0 ? PI / 2 : PI * 1.5;
  for (const [lw, c, al, rr] of [[16, SOUL, 0.45, 0.85], [4, SOUL_H, 0.9, 0.8]]) {
    ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(x, y, r * rr, a0 + (1 - z.a) * 0.3 * f, a1, false); ctx.stroke();
  }
}
/** 바닥 혼불 (2.0초) */
function paintSoulFlame(ctx, x, floor, z, w) {
  const t = w.time ?? z.t, a = z.started ? Math.min(1, z.t * 6) * (1 - Math.max(0, (z.a - 0.85) / 0.15)) : z.k * 0.5;
  ctx.globalCompositeOperation = 'lighter';
  glowE(ctx, x, floor - 18, 30, 24, SOUL, 0.55 * a);
  for (let i = 0; i < 3; i++) {
    const ph = t * 6 + i * 2.1, hh = 30 + Math.sin(ph) * 8;
    ctx.fillStyle = rgba(i === 1 ? SOUL_H : SOUL, 0.55 * a);
    ctx.beginPath(); ctx.moveTo(x - 14 + i * 9, floor); ctx.quadraticCurveTo(x - 12 + i * 9 + Math.sin(ph) * 4, floor - hh * 0.6, x - 9 + i * 9, floor - hh); ctx.quadraticCurveTo(x - 4 + i * 9, floor - hh * 0.5, x - 2 + i * 9, floor); ctx.closePath(); ctx.fill();
  }
}
/** 은화 두 닢이 튀어 오른다 (판정 없음) */
function paintCoins(ctx, x, y, z, f) {
  for (let i = 0; i < 2; i++) {
    const k = z.t, cx = x + f * (10 + i * 14) * k * 3, cy = y - (260 * k - 520 * k * k) - i * 6;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(Math.cos(z.t * 18 + i), 1);
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ink(ctx, COIN, 0.8);
    ctx.restore();
    glow(ctx, cx, cy, 8, SOUL_H, 0.5);
  }
}
/** 빈 영구차 (마차 혼): 구운 실루엣 비트맵 하나 (퍼핏을 두 번 그리지 않는다). dir = 달리는 쪽 */
function paintGhost(ctx, x, floor, dir, a, z) {
  const g = GHOST;
  const k = z ? Math.min(1, z.t - z.warn < 0.15 ? (z.t - z.warn) / 0.15 + 0.4 : 1) : 1;
  ctx.save(); ctx.globalAlpha *= clamp(a * k, 0, 1);
  if (g) { ctx.translate(x, floor); ctx.scale(dir, 1); ctx.drawImage(g.c, -g.ox, -g.oy); }
  else glowE(ctx, x, floor - 70, 110, 70, SOUL, 0.5);
  ctx.restore();
  if (z?.started) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glowE(ctx, x - dir * 120, floor - 60, 90, 40, SOUL, 0.25); ctx.restore(); }
}
/** 마차 잔해 (나무 파편 둘 · 관 하나, 3초에 걸쳐 사라진다) */
function paintWreck(ctx, x, floor, f, z) {
  const a = 1 - Math.max(0, (z.a - 0.6) / 0.4);
  ctx.save(); ctx.globalAlpha *= a;
  ctx.save(); ctx.translate(x + f * 40, floor - 10); ctx.rotate(0.35 * f); drawCoffinShape(ctx, 0.85, false, 0); ctx.restore();
  for (const [dx, r, w2] of [[-70, -0.4, 46], [96, 0.6, 38]]) {
    ctx.save(); ctx.translate(x + f * dx, floor - 6); ctx.rotate(r * f);
    ctx.beginPath(); ctx.moveTo(-w2 / 2, -6); ctx.lineTo(w2 / 2, -9); ctx.lineTo(w2 / 2 - 6, 4); ctx.lineTo(-w2 / 2 + 4, 6); ctx.closePath();
    ink(ctx, LACQ, 1.2); ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w2 / 2 + 2, -3); ctx.lineTo(w2 / 2 - 2, -5); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
/** 빈 영구차 실루엣 굽기 (한 번): 벡터 마차(말 · 마부 없이)를 녹청 단색 그라디언트로 */
function bakeGhost(b) {
  if (GHOST || typeof document === 'undefined') return;
  try {
    const c = document.createElement('canvas'); c.width = 250; c.height = 180;
    const g = c.getContext('2d'), ox = 118, oy = 172;
    g.translate(ox, oy);
    const save = { roofN: b.roofN, wA: b.wA, lanK: b.lanK };
    b.roofN = 3; b.wA = 0; b.lanK = 0;
    drawCoach(g, b, false, 'back'); drawCoach(g, b, false, 'front');
    Object.assign(b, save);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in';
    const gr = g.createLinearGradient(0, 0, 0, 180); gr.addColorStop(0, SOUL_H); gr.addColorStop(1, SOUL);
    g.fillStyle = gr; g.fillRect(0, 0, 250, 180);
    GHOST = { c, ox, oy };
  } catch (e) { GHOST = null; }
}

/** 벡터 그림 컬링 대리 개체 (e_bride.js 와 같은 방식): 보스의 artBounds() 를 사각형으로 삼아 보스 draw 를 대신 부른다 */
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
