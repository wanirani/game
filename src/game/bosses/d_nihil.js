// 보스 b_nihil — 니힐, 태초의 공허 (s20 '공허의 중심', 2부 최종 보스) — world2 §6.8, MASTER_PLAN §1.14. 소유: BOSS-P2-4
// BossC(c_common.js) 상속 — 패턴 이름은 계약 (P2_PATTERNS.b_nihil):
//   공격  palmEyes · erase · starfall · grasp (P1) · echoDracula · echoChaos · echoNarkissa · echoZiz (P2+)
//         collapse (P3 진입 때 강제, 그 뒤 약 20초마다) · maw (P3) · lastLight (P4: 느린 별비 5개 / 반속 grasp 를 번갈아)
//   전환  form2 (75%, 2.0초: 가면이 일그러지며 쓰러뜨린 보스들의 얼굴이 스친다 · form2 이름 · 대사 b_nihil_form2 스토리 1회)
//         phase2 (45%, 1.6초: 실루엣이 세로로 찢어지며 무너지는 별의 아가리가 열린다 → 다음 패턴 collapse 강제)
//         final (15%, 2.2초: 실루엣이 핵으로 빨려 들어가 흰 불꽃을 두른 검은 태양이 된다 · 대사 b_nihil_final)
//         final 뒤 (afterTransition): run.sp = 100, 1차 전직 이상이면 run.aw = 100 (피날레 = 각성의 순간),
//         플레이어 buffs.holyaura 20초 + refreshStats, 핵 상시 노출(0.4), 공허의 벽 open(), 새벽빛 화면 색조.
//         피날레 보호 (takeHit): 15% 위에서 한 방에 쓰러뜨릴 피해(각성 등)는 경계 바로 아래에서 멈춰 final 을 건너뛸 수 없다.
// 판정 부위 (hitParts, 플레이어와 가장 가까운 것): 가면/핵 80×100 (1.0 · 아가리가 열리면 그 속 핵 0.5 · P4 검은 태양 150×150 0.4)
//   · 손바닥 눈 ×2 50×50 (뜬 동안 0.6 — 그때 손 판정은 빠진다) · 손 ×2 (1.3, 눈이 감긴 동안) · 수의(가면 아래 공허의 몸, 1.35, P1–P3)
//   접촉 피해는 가면/핵만 (공허의 옷자락은 몸을 통과한다). 손은 공격 지대(slam · grasp)로만 때린다.
// 공정성 (MAPS-P2-D 보스 방: 바닥 16행, '=' 발판 11행 24–28 · 46–50열, 7행 34–40열, 디딤돌 13행 19–21 · 53–55열, 9행 31–32 · 42–43열):
//   palmEyes · starfall 은 플레이어/그 열의 실제 발판 윗면을 친다 (발판 위도 안전지대가 아니다). grasp 는 바닥 0–116px 만 쓸어
//   13행 디딤돌 위(바닥 +144px)는 안전, 한 번 점프(가장 낮은 브란 131px + 이단 점프)로 넘을 수 있다. echoChaos 가로 광선은
//   바닥 위 250–290 · 400–460px (11행 발판과 7행 근처) — 바닥에 서서 세로 광선 틈을 찾으면 된다. erase 띠는 플레이어 높이 90px.
//   collapse: 1초 예고 뒤 벽이 80px/s 로 경기장 가운데 약 23칸(양쪽 10칸)까지 조여 오고 12초 뒤 열린다 (13행 디딤돌은 벽 속).
//   maw: 흡입(500px/s², 최고 230px/s — 달리기 245–305px/s 보다 느리다) 2.5초 → 0.65초 예고 뒤 앞쪽 300×200 물기.
// 그림: 채색 퍼핏 src/render/painted/bosses/b_nihil.js (ART-BOSS-8 — 준비되면 컬링 대리 개체가 대신 그린다, ?painted=0 이면 아래 벡터).
//   벡터(대체 그림): 보스 등장 때(setup) 한 번 굽는 것: 도자기 가면(흰 판·색 번짐 2장) ·
//   가면 위로 스치는 얼굴 7장(드라큘라·혼돈·나르키사·지즈·몰록·마라·사신) · 손바닥 눈알 · 메아리 실루엣 4장 · 흰 불꽃 코로나 ·
//   강착원반 · 별밤 무늬(패턴). 매 프레임: 별밤을 품은 두건 실루엣(프리즘 윤곽) · 빛의 갈비뼈 · 피해만큼 뜨는 작은 눈 수십 개 ·
//   이 빠진 후광 · 공허의 촉수 · 두 개의 거대한 도자기 손(마디 셋 손가락, 흑요석 손톱, 빛이 새는 금, 손바닥 눈) ·
//   P3 찢어진 아가리(별 조각 이빨 · 강착원반 · 무너지는 별 · 특이점) · P4 검은 태양. 싸움 중 새 캔버스 0 (MASTER_PLAN §5.2):
//   발광(glowSprite) · 조명 색광(lighting) · 연기 파티클(hitfx soft) 색도 등장 때 미리 굽는다.
// 채색 아트(ART-BOSS-8)가 읽는 상태 (읽기만): bx, by (가면 가운데; by 에 bob 을 더해 그린다) · face (−1..1, 몸 좌우 뒤집힘) · sxOf() · formPhase ·
//   introK · glitch · tear (P3 찢김 0~1) · mawK (아가리 열림 0~1) · sunK (P4 0~1) · implode (final 빨려듦 0~1) · tilt · look · lookY ·
//   echoKey/echoA/echoFlick · faceIdx/faceA · hands[{i, x, y, rot, s, curl, spread, point, eye(0~1), side, mode, a, hitT}] · _lastHit · coreY() · dieT
import { BossC, telegraph, warnText, strikeRect, strikeLine, strikeCircle, strikeColumn, strikeFloor, pullField, wallsClose, wallsOpen, wallsX, killTransients, darken, screenTint } from './c_common.js';
import { PI, R, LG, RG, glow, glowE, glowSprite, warnRect, warnLine, warnCircle, impact, boltPath } from './b_common.js';
import { Entity } from '../entity.js';
import { T } from '../../core/physics.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba, wrapAngle } from '../../core/math.js';
import * as HFX from '../../render/hitfx.js';
import { registerPainted, hasPainted } from '../../render/painted/registry.js';   // [hook:art-boss-8] 채색 퍼핏 등록 (그리기 전용)
import { bosses as ART8 } from '../../render/painted/reg/art-boss-8.js';   // [hook:art-boss-8]

// ───────────────────────── 색 · 치수 ─────────────────────────
const TS = 48;   // 타일 (core/game.js TILE — 모듈 최상위에서 import 값을 읽지 않는다)
const BODY = { w: 220, h: 280 }, SUN = { w: 170, h: 170 };
const MAW_Y = 60;                  // 아가리 가운데 (가면 기준 몸 지역 y)
const VOID = '#04010a', INK = '#120a1c', NAIL = '#07040c';
const PORC = '#e9e3f0', PORC_L = '#fbf8ff', PORC_M = '#b3a9c6', PORC_D = '#4e4462';
const VIO = '#b070ff', VIO_L = '#dcc8ff', VIO_D = '#2c0c50', NEB = '#8a6aff', PM = '#ff5ad0', PC = '#5ad8ff', WHITE = '#ffffff';
const HOLY = '#fff2b0', DAWN = '#fff6c8', IRIS = '#ffd86a', BITE = '#ff60c0', STARC = '#fff6e0';
const DRAC = '#ff2a3a', CHAOS = '#b060ff', GLASS = '#cfe8ff', BOLT = '#bfe0ff', ERASE = '#eef2ff';
/** 싸움 중 새 캔버스 0: 이 보스와 공격이 쓰는 발광 · 조명 · 연기 파티클 색을 등장 때 모두 굽는다 */
const GLOW_COLS = [VIO, VIO_L, VIO_D, NEB, PM, PC, WHITE, HOLY, DAWN, IRIS, BITE, STARC, DRAC, CHAOS, GLASS, BOLT, ERASE, '#c8a8ff', '#ff9070', '#ffe0b0', '#ff7a2a'];
const LIGHT_COLS = [VIO, VIO_L, NEB, WHITE, DAWN, HOLY, IRIS, BITE, STARC, DRAC, CHAOS, GLASS, BOLT];
// 연기 · 섬광 파티클(hitfx soft): dark · smoke · fire · dust 프리셋 + 진짜 공허의 벽이 뿜는 보라(gimmicks_b) + 플레이어 피격 섬광(impact)
const SOFT_COLS = ['#5a1a7a', '#3a3440', '#ff7a1a', '#ffd070', '#8a8074', '#8a6aff', '#ff2040'];
/** 메아리 (P2): 쓰러뜨린 보스의 그림자 · 색 · 가면에 겹칠 얼굴 번호 */
const ECHO = { dracula: { col: DRAC, face: 0 }, chaos: { col: CHAOS, face: 1 }, narkissa: { col: GLASS, face: 2 }, ziz: { col: BOLT, face: 3 } };
const ECHO_KEYS = ['dracula', 'chaos', 'narkissa', 'ziz'];
const FACE_T = 4.2;                // 가면이 다음 얼굴로 번지는 주기 (초)
/** 손가락 (정규 좌표: 손바닥 가운데 원점, 손가락 = −y, 엄지 = +x). b 뿌리 · a 부채꼴 각 · L 마디 길이 · r 굵기 */
const FINGERS = [
  { i: 0, b: [-28, -38], a: -0.3, L: [42, 31, 24], r: 7 },
  { i: 1, b: [-11, -46], a: -0.11, L: [53, 39, 29], r: 8 },
  { i: 2, b: [7, -49], a: 0.03, L: [60, 44, 32], r: 8.5 },
  { i: 3, b: [25, -44], a: 0.17, L: [53, 39, 29], r: 8 },
  { i: 4, b: [37, 4], a: 0.95, L: [42, 32], r: 9, thumb: true },
];
const CURL = [0.75, 1.75, 2.7];    // 마디별 접힘 (curl 1 에서 rad)
/** 손가락 칠하기 [색, 굵기 배율, 옆으로 비킴(빛 쪽 −)] — 외곽 · 그늘 · 살 · 빛 */
const FPASS_HI = [['#120a1c', 1.12, 0], ['#8e84a4', 1, 0], ['#e4ddee', 0.72, 0.2], ['#fdfbff', 0.28, 0.45]];
const FPASS_LO = [['#120a1c', 1.12, 0], ['#d2cadf', 1, 0]];
const FPASS_FL = [['#ffffff', 1, 0]];
/** 두건 · 옷자락 윤곽 (가면 가운데 원점, 오른쪽을 본다) [x, y, 흔들림]. 첫 점 = 뒤로 늘어진 두건 끝(뾰족),
 *  앞 두건 테두리가 얼굴 앞으로 튀어나왔다가 목에서 들어가고, 어깨 · 늘어진 소매 자락 · 해진 밑단(뾰족) · 뒷자락 */
const ROBE_A = [[-62, -232, 0.25], [2, -214, 0.1], [62, -182, 0.1], [102, -128, 0.14], [122, -70, 0.2], [106, -24, 0.25], [150, 4, 0.35], [200, 52, 0.5], [236, 120, 0.7], [250, 178, 0.9]];
const ROBE_B = [[-262, 178, 0.9], [-230, 96, 0.7], [-190, 30, 0.5], [-150, -24, 0.35], [-128, -98, 0.25], [-108, -166, 0.22], [-86, -208, 0.22]];
const HEM_N = 13;
/** 별밤 막 안쪽에서 밀려 나오는 얼굴들 [x, y, 배율, 얼굴 번호] */
const PRESSED = [[-120, 58, 0.52, 0], [96, 110, 0.48, 4], [-36, 150, 0.4, 1]];
const STAR_N = { n: 10, warn: 0.7, gap: 0.1, rest: 1.0 };      // starfall
const STAR_SLOW = { n: 5, warn: 1.2, gap: 0.25, rest: 1.1 };  // lastLight
const PRISM_HI = [[PM, -2.5, 0.55, 3], [PC, 2.5, 0.55, 3], [WHITE, 0, 0.75, 1.5]];
const PRISM_LO = [[VIO_L, 0, 0.7, 2]];
const h01 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

// ───────────────────────── 표 (처음 쓸 때 한 번) ─────────────────────────
let TAB = null;
function tabs() {
  if (TAB) return TAB;
  const L2 = (a, b, t) => a + (b - a) * t;
  // 별밤 속에서 뜨는 작은 눈 (피해만큼 늘어난다). 가면 자리는 비운다
  const eyes = [];
  for (let i = 0; eyes.length < 30 && i < 90; i++) {
    const y = L2(-120, 176, h01(i * 5.1 + 0.7));
    const half = y < -20 ? 58 + (y + 120) * 0.4 : 96 + (y + 20) * 0.58;
    const x = (h01(i * 9.7 + 1.3) * 2 - 1) * half * 0.82;
    if (Math.abs(x) < 64 && y < 60) continue;
    eyes.push({ x, y, s: 0.75 + h01(i * 2.9) * 0.9, ph: h01(i * 4.4) * Math.PI * 2 });
  }
  // 죽을 때 번지는 빛의 금 (가면에서 사방으로)
  const cracks = [];
  for (let i = 0; i < 9; i++) {
    const pts = [0, 0];
    let a = (i / 9) * Math.PI * 2 + h01(i) * 0.5, x = 0, y = 0;
    for (let k = 1; k <= 7; k++) {
      a += (h01(i * 13 + k * 3.1) - 0.5) * 0.9;
      const l = 26 + h01(i * 7 + k) * 26;
      x += Math.cos(a) * l; y += Math.sin(a) * l * 1.15;
      pts.push(x, y);
    }
    cracks.push(pts);
  }
  TAB = { eyes, cracks };
  return TAB;
}

// ───────────────────────── 굽기 (보스 등장 때 한 번, 모듈 캐시) ─────────────────────────
let ART = null;
function canvasOf(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}
function tinted(c, color) {
  const w = canvasOf(c.width, c.height);
  if (!w) return c;
  const g = w.getContext('2d');
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, w.width, w.height);
  return w;
}
/** w×h 논리 크기(원점 ox, oy)를 배율 K 로 굽는다. white: 피격 섬광용 흰 판도 */
function mk(K, w, h, ox, oy, fn, white = true) {
  const c = canvasOf(Math.ceil(w * K), Math.ceil(h * K));
  if (!c) return null;
  const g = c.getContext('2d');
  g.scale(K, K); g.translate(ox, oy);
  g.lineJoin = 'round'; g.lineCap = 'round';
  fn(g);
  return { c, f: white ? tinted(c, '#ffffff') : c, w, h, ox, oy };
}
/** 구운 그림 (피격 섬광이면 흰 판) */
function put(ctx, S, x, y, rot = 0, sx = 1, sy = sx) {
  if (!S || !sx || !sy) return;
  const img = R.fl ? S.f : S.c;
  if (!rot && sx === 1 && sy === 1) { ctx.drawImage(img, x - S.ox, y - S.oy, S.w, S.h); return; }
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.drawImage(img, -S.ox, -S.oy, S.w, S.h);
  ctx.restore();
}
function bakeScale(world) {
  const s = world?.game?.scale, z = world?.camera?.zoomTarget ?? 0.9;
  const k = Number.isFinite(s) && s > 0 ? s * z * 1.15 : 1.25;
  return clamp(Math.round(k * 2) / 2, 1, 2);
}
function ensureArt(world) {
  const K = bakeScale(world);
  if (ART && ART.K >= K) return ART;
  try { ART = bakeArt(K); } catch (e) { console.error('[nihil] 굽기 실패', e); }
  return ART;
}
function linG(g, x0, y0, x1, y1, st) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < st.length; i += 2) gr.addColorStop(st[i], st[i + 1]); return gr; }
function radG(g, x0, y0, r0, x1, y1, r1, st) { const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (let i = 0; i < st.length; i += 2) gr.addColorStop(st[i], st[i + 1]); return gr; }
function bakeArt(K) {
  const mask = mk(K, 110, 140, 55, 70, drawMaskArt);
  const KF = Math.min(K, 1.5);
  return {
    K, mask,
    maskM: mask && { ...mask, c: tinted(mask.c, PM), f: mask.f },
    maskC: mask && { ...mask, c: tinted(mask.c, PC), f: mask.f },
    faces: [faceDracula, faceChaos, faceNarkissa, faceZiz, faceMoloch, faceMara, faceDeath].map((fn) => mk(KF, 140, 176, 70, 92, fn, false)),
    eye: mk(K, 64, 64, 32, 32, drawEyeArt, false),
    echo: {
      dracula: mk(0.75, 460, 460, 230, 250, echoDracula, false),
      chaos: mk(0.75, 460, 460, 230, 250, echoChaos, false),
      narkissa: mk(0.75, 460, 460, 230, 250, echoNarkissa, false),
      ziz: mk(0.75, 460, 460, 230, 250, echoZiz, false),
    },
    corona: mk(Math.min(K, 1.25), 360, 360, 180, 180, drawCoronaArt, false),
    maw: mk(1, 320, 170, 160, 85, drawMawArt, false),
    stars: bakeStars(),
  };
}
/** 두건 속 별밤 (384² 이음새 없는 무늬 — 매 프레임 한 번의 fillRect 로 칠한다) */
function bakeStars() {
  const S = 384, c = canvasOf(S, S);
  if (!c) return null;
  const g = c.getContext('2d');
  for (const [x, y, r, col, a] of [[90, 100, 150, '#6a2aa8', 0.26], [290, 250, 170, '#1a4a9a', 0.2], [230, 60, 110, '#a02a8a', 0.16], [60, 320, 120, '#3a1a7a', 0.22], [340, 350, 90, '#2a6a9a', 0.14]]) {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const cx = x + ox, cy = y + oy;
      if (cx + r < 0 || cx - r > S || cy + r < 0 || cy - r > S) continue;
      g.fillStyle = radG(g, cx, cy, 0, cx, cy, r, [0, rgba(col, a), 1, rgba(col, 0)]);
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 420; i++) {
    const x = h01(i * 3.1 + 1) * S, y = h01(i * 7.3 + 2) * S, s = h01(i * 1.7 + 3);
    const r = s < 0.86 ? 0.45 + s * 0.8 : 1.1 + (s - 0.86) * 7;
    g.globalAlpha = 0.35 + h01(i * 5.1) * 0.65;
    g.fillStyle = s > 0.97 ? '#ffd8ec' : s > 0.93 ? '#c8e0ff' : '#ffffff';
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (s > 0.955) {
      g.strokeStyle = g.fillStyle; g.lineWidth = 0.7; g.globalAlpha *= 0.7;
      g.beginPath(); g.moveTo(x - r * 4, y); g.lineTo(x + r * 4, y); g.moveTo(x, y - r * 4); g.lineTo(x, y + r * 4); g.stroke();
    }
  }
  g.globalAlpha = 1;
  return { c, pat: g.createPattern(c, 'repeat'), S };
}
function almond(g, x, y, hw, hh, tilt = 0) {
  g.save(); g.translate(x, y); if (tilt) g.rotate(tilt);
  g.beginPath(); g.moveTo(-hw, 0); g.quadraticCurveTo(0, -hh * 2, hw, 0); g.quadraticCurveTo(0, hh * 2, -hw, 0); g.closePath();
  g.restore();
}
function maskPath(g) {
  g.beginPath();
  g.moveTo(0, -66);
  g.bezierCurveTo(30, -66, 47, -45, 47, -14);
  g.bezierCurveTo(47, 14, 40, 34, 26, 50);
  g.bezierCurveTo(16, 61, 7, 68, 0, 68);
  g.bezierCurveTo(-7, 68, -16, 61, -26, 50);
  g.bezierCurveTo(-40, 34, -47, 14, -47, -14);
  g.bezierCurveTo(-47, -45, -30, -66, 0, -66);
  g.closePath();
}
/** 하얀 도자기 가면: 눈구멍은 공허, 검은 눈물, 정수리에서 내려온 금, 꿰매진 입 */
function drawMaskArt(g) {
  maskPath(g);
  g.fillStyle = radG(g, -12, -26, 4, 0, -4, 80, [0, '#ffffff', 0.35, PORC_L, 0.7, PORC, 0.92, PORC_M, 1, '#8a809c']);
  g.fill();
  g.save(); maskPath(g); g.clip();
  g.fillStyle = linG(g, -47, 0, 47, 0, [0, 'rgba(60,40,90,0.35)', 0.3, 'rgba(60,40,90,0)', 0.75, 'rgba(60,40,90,0)', 1, 'rgba(40,20,70,0.45)']);
  g.fillRect(-50, -70, 100, 140);
  for (const s of [-1, 1]) {
    g.fillStyle = radG(g, s * 20, -4, 2, s * 20, -4, 26, [0, 'rgba(50,30,80,0.5)', 1, 'rgba(50,30,80,0)']);
    g.fillRect(s * 20 - 28, -32, 56, 56);
    g.fillStyle = radG(g, s * 27, 28, 2, s * 27, 28, 22, [0, 'rgba(70,40,100,0.28)', 1, 'rgba(70,40,100,0)']);
    g.fillRect(s * 27 - 24, 6, 48, 48);
  }
  // 검은 눈물 (눈구멍마다 세 줄기, 끝에 방울)
  g.fillStyle = 'rgba(6,2,12,0.9)'; g.strokeStyle = 'rgba(6,2,12,0.86)';
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const x0 = s * (12 + k * 6), y0 = -2, len = 26 + k * 14 + (s > 0 ? 6 : 0);
      g.lineWidth = 3.2 - k * 0.7;
      g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + s * 2, y0 + len * 0.4, x0 - s * 2, y0 + len * 0.7, x0 + s, y0 + len); g.stroke();
      g.beginPath(); g.arc(x0 + s, y0 + len + 2, 2.4 - k * 0.5, 0, TAU); g.fill();
    }
  }
  g.strokeStyle = 'rgba(20,10,30,0.8)'; g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(2, -66); g.lineTo(-3, -50); g.lineTo(3, -40); g.lineTo(-6, -28); g.lineTo(-12, -16);
  g.moveTo(-3, -50); g.lineTo(-12, -46); g.moveTo(3, -40); g.lineTo(12, -36);
  g.stroke();
  g.restore();
  g.fillStyle = '#000000';
  for (const s of [-1, 1]) { almond(g, s * 18, -8, 15, 8.5, s * 0.16); g.fill(); }
  g.strokeStyle = 'rgba(40,20,60,0.9)'; g.lineWidth = 1.5;
  for (const s of [-1, 1]) { almond(g, s * 18, -8, 15.5, 9, s * 0.16); g.stroke(); }
  g.strokeStyle = 'rgba(30,16,40,0.85)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-10, 40); g.quadraticCurveTo(0, 43, 10, 40); g.stroke();
  g.lineWidth = 1; g.beginPath();
  for (let k = -2; k <= 2; k++) { g.moveTo(k * 4.4, 37); g.lineTo(k * 4.4 + 0.6, 45); }
  g.stroke();
  maskPath(g); g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke();
  g.save(); maskPath(g); g.clip();
  g.strokeStyle = 'rgba(190,210,255,0.55)'; g.lineWidth = 3; g.translate(-2.5, 1.5); maskPath(g); g.stroke();
  g.restore();
}
// ── 가면 위로 스치는 얼굴들 (가면과 같은 좌표, 140×176 판) ──
function faceDracula(g) {
  g.fillStyle = 'rgba(12,4,10,0.92)';
  g.beginPath();
  g.moveTo(-46, -26); g.bezierCurveTo(-42, -58, -22, -70, 0, -70); g.bezierCurveTo(22, -70, 42, -58, 46, -26);
  g.bezierCurveTo(32, -44, 14, -48, 0, -34); g.bezierCurveTo(-14, -48, -32, -44, -46, -26);
  g.fill();
  for (const s of [-1, 1]) { g.fillStyle = radG(g, s * 18, -8, 0, s * 18, -8, 10, [0, '#ffe0d0', 0.3, DRAC, 1, 'rgba(255,42,58,0)']); g.fillRect(s * 18 - 11, -19, 22, 22); }
  g.strokeStyle = 'rgba(40,0,10,0.9)'; g.lineWidth = 2.8;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 5, -17); g.lineTo(s * 33, -25); g.stroke(); }
  g.fillStyle = '#7a0010'; g.beginPath(); g.moveTo(-14, 38); g.quadraticCurveTo(0, 47, 14, 38); g.quadraticCurveTo(0, 42, -14, 38); g.fill();
  g.fillStyle = '#ffffff';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 5.5, 40); g.lineTo(s * 9.5, 40); g.lineTo(s * 7.4, 51); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(170,0,20,0.85)';
  for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 7.4, 53.5, 1.5, 0, TAU); g.fill(); }
}
function faceChaos(g) {
  const E = [[0, -42, 7], [-30, -32, 5], [30, -34, 5.5], [-35, 18, 6], [35, 16, 5], [0, 20, 6.5], [-14, 52, 4.5], [16, 54, 4]];
  g.strokeStyle = 'rgba(120,20,160,0.6)'; g.lineWidth = 1;
  for (const [x, y] of E) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x * 0.5 + 6, y * 0.6, x * 0.2, y * 0.3 - 6); g.stroke(); }
  for (const [x, y, r] of E) {
    almond(g, x, y, r * 1.5, r * 0.8); g.fillStyle = '#f4ecff'; g.fill(); g.strokeStyle = '#3a0060'; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = CHAOS; g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU); g.fill();
    g.fillStyle = '#000000'; g.beginPath(); g.ellipse(x, y, r * 0.2, r * 0.5, 0, 0, TAU); g.fill();
  }
  for (const s of [-1, 1]) { g.fillStyle = radG(g, s * 18, -8, 0, s * 18, -8, 9, [0, '#f0d8ff', 0.4, CHAOS, 1, 'rgba(176,96,255,0)']); g.fillRect(s * 18 - 10, -18, 20, 20); }
}
function faceNarkissa(g) {
  g.strokeStyle = 'rgba(170,220,255,0.95)'; g.lineWidth = 1.3;
  const cx = 14, cy = 8;
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    let a = k * 0.63 + 0.2, x = cx, y = cy;
    g.moveTo(x, y);
    for (let j = 0; j < 3; j++) { a += (h01(k * 3 + j) - 0.5) * 0.7; const l = 10 + h01(k * 5 + j) * 14; x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); }
  }
  g.stroke();
  g.fillStyle = 'rgba(210,240,255,0.92)'; g.strokeStyle = 'rgba(40,80,120,0.9)'; g.lineWidth = 1.2;
  for (let k = -3; k <= 3; k++) {
    const x = k * 11, b = -62 + Math.abs(k) * 2.5, tip = -88 + Math.abs(k) * 6;
    g.beginPath(); g.moveTo(x - 5, b); g.lineTo(x, tip); g.lineTo(x + 5, b); g.closePath(); g.fill(); g.stroke();
  }
  for (const s of [-1, 1]) { g.fillStyle = radG(g, s * 18, -8, 0, s * 18, -8, 9, [0, '#ffffff', 0.4, GLASS, 1, 'rgba(207,232,255,0)']); g.fillRect(s * 18 - 10, -18, 20, 20); }
  g.strokeStyle = 'rgba(120,190,255,0.8)'; g.lineWidth = 1.6;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 18, 0); g.lineTo(s * 20, 24); g.stroke(); }
}
function faceZiz(g) {
  g.fillStyle = 'rgba(36,44,62,0.9)'; g.strokeStyle = 'rgba(190,224,255,0.7)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-7, -22); g.quadraticCurveTo(0, -30, 7, -22); g.lineTo(3, 20); g.lineTo(0, 44); g.lineTo(-3, 20); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(60,70,100,0.85)'; g.lineWidth = 2;
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const y = 10 + k * 12; g.beginPath(); g.moveTo(s * 20, y); g.lineTo(s * 30, y - 7); g.lineTo(s * 40, y); g.stroke(); }
  for (const s of [-1, 1]) { g.fillStyle = radG(g, s * 18, -8, 0, s * 18, -8, 11, [0, '#ffffff', 0.35, BOLT, 1, 'rgba(191,224,255,0)']); g.fillRect(s * 18 - 12, -20, 24, 24); }
  g.strokeStyle = 'rgba(210,235,255,0.85)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-30, -46); g.lineTo(-22, -36); g.lineTo(-27, -30); g.lineTo(-18, -20); g.stroke();
}
function faceMoloch(g) {
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 30, -48); g.bezierCurveTo(s * 56, -64, s * 62, -84, s * 50, -90); g.bezierCurveTo(s * 54, -76, s * 44, -66, s * 22, -56); g.closePath();
    g.fillStyle = linG(g, s * 22, -50, s * 55, -90, [0, '#4a2a18', 0.6, '#8a5a30', 1, '#e0b070']); g.fill();
    g.strokeStyle = '#1a0c06'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = radG(g, s * 18, -8, 0, s * 18, -8, 10, [0, '#fff0b0', 0.4, '#ff7a2a', 1, 'rgba(255,122,42,0)']); g.fillRect(s * 18 - 11, -19, 22, 22);
  }
  g.fillStyle = 'rgba(30,14,8,0.35)'; g.beginPath(); g.ellipse(0, 30, 30, 22, 0, 0, TAU); g.fill();
}
function faceMara(g) {
  g.strokeStyle = 'rgba(40,10,30,0.95)'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(0, 26); g.lineTo(0, 56); g.stroke();
  g.lineWidth = 1.3; g.beginPath();
  for (let k = 0; k < 5; k++) { const y = 29 + k * 6; g.moveTo(-5, y - 2); g.lineTo(5, y + 2); }
  g.stroke();
  for (const s of [-1, 1]) { g.fillStyle = radG(g, s * 28, 22, 0, s * 28, 22, 12, [0, 'rgba(255,120,170,0.55)', 1, 'rgba(255,120,170,0)']); g.fillRect(s * 28 - 13, 9, 26, 26); }
  g.strokeStyle = 'rgba(20,6,20,0.8)'; g.lineWidth = 1;
  g.beginPath();
  for (let k = -4; k <= 4; k++) { g.moveTo(k * 9, -64); g.quadraticCurveTo(k * 12, -80, k * 16 + (k % 2) * 6, -92); }
  g.stroke();
}
function faceDeath(g) {
  g.fillStyle = 'rgba(0,0,0,0.92)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 18, -6, 17, 14, s * 0.2, 0, TAU); g.fill(); }
  g.beginPath(); g.moveTo(0, 8); g.lineTo(-6, 22); g.lineTo(0, 20); g.lineTo(6, 22); g.closePath(); g.fill();
  g.fillStyle = 'rgba(40,30,60,0.35)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 30, 26, 10, 16, 0, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(10,6,16,0.9)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(-16, 40); g.lineTo(16, 40);
  for (let k = -3; k <= 3; k++) { g.moveTo(k * 4.6, 34); g.lineTo(k * 4.6, 47); }
  g.stroke();
}
/** 손바닥 눈알: 핏발 선 흰자 · 금빛 홍채 · 별 모양 동공 */
function drawEyeArt(g) {
  g.fillStyle = radG(g, -6, -6, 2, 0, 0, 30, [0, '#fffaf4', 0.6, '#f0dcd8', 0.9, '#c89aa8', 1, '#7a3a50']);
  g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(170,20,40,0.75)'; g.lineWidth = 1;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + h01(i) * 0.4;
    let x = Math.cos(a) * 29, y = Math.sin(a) * 29;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 3; k++) { const aa = a + Math.PI + (h01(i * 3 + k) - 0.5) * 1.2; x += Math.cos(aa) * 5; y += Math.sin(aa) * 5; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = radG(g, 0, 0, 0, 0, 0, 16, [0, '#1a0010', 0.35, '#6a2a90', 0.62, IRIS, 0.85, '#ff9a3a', 1, '#3a1020']);
  g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
  g.fillStyle = '#000000';
  g.beginPath(); g.moveTo(0, -9); g.lineTo(2.2, -2.2); g.lineTo(9, 0); g.lineTo(2.2, 2.2); g.lineTo(0, 9); g.lineTo(-2.2, 2.2); g.lineTo(-9, 0); g.lineTo(-2.2, -2.2); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(-6, -7, 4, 2.6, -0.5, 0, TAU); g.fill();
}
// ── 메아리 실루엣 (P2 · form2): 어둡게 채우고 빛나는 윤곽 ──
function ghostFill(g, col) { g.fillStyle = linG(g, 0, -220, 0, 200, [0, rgba(col, 0.55), 0.55, rgba(col, 0.28), 1, rgba(col, 0)]); g.fill(); }
function ghostEdge(g, col, lw = 3) {
  g.save(); g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba(col, 0.55); g.lineWidth = lw * 2.4; g.stroke();
  g.strokeStyle = rgba('#ffffff', 0.7); g.lineWidth = lw * 0.5; g.stroke();
  g.restore();
}
function echoDracula(g) {
  const base = '#3a0010';
  for (const s of [-1, 1]) {
    const tips = [[222, -120], [196, -34], [150, 18], [98, 76], [44, 124], [0, 150]];
    g.beginPath(); g.moveTo(0, -150);
    g.bezierCurveTo(s * 60, -175, s * 150, -196, s * 222, -120);
    for (let i = 1; i < tips.length; i++) { const [x0, y0] = tips[i - 1], [x1, y1] = tips[i]; g.quadraticCurveTo(s * (x0 + x1) * 0.43, (y0 + y1) / 2 - 16, s * x1, y1); }
    g.closePath();
    ghostFill(g, base); ghostEdge(g, DRAC, 2.5);
    g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = rgba(DRAC, 0.35); g.lineWidth = 2;
    g.beginPath(); for (const [x, y] of tips.slice(0, 5)) { g.moveTo(0, -140); g.lineTo(s * x, y); } g.stroke(); g.restore();
  }
  g.beginPath(); g.moveTo(-26, -150); g.lineTo(26, -150); g.lineTo(0, 150); g.closePath(); ghostFill(g, '#1a0006');
  g.beginPath();
  for (let k = -2; k <= 2; k++) { g.moveTo(k * 14 - 8, -160); g.lineTo(k * 18, -222 + Math.abs(k) * 12); g.lineTo(k * 14 + 8, -160); }
  ghostFill(g, base); ghostEdge(g, DRAC, 1.5);
  g.beginPath(); g.arc(0, -178, 30, 0, TAU); g.moveTo(-26, -190); g.lineTo(-38, -226); g.lineTo(-14, -202); g.moveTo(26, -190); g.lineTo(38, -226); g.lineTo(14, -202);
  g.fillStyle = 'rgba(20,0,6,0.9)'; g.fill(); ghostEdge(g, DRAC, 1.5);
  for (const s of [-1, 1]) { g.fillStyle = radG(g, s * 11, -180, 0, s * 11, -180, 14, [0, '#ffffff', 0.25, DRAC, 1, 'rgba(255,42,58,0)']); g.fillRect(s * 11 - 15, -195, 30, 30); }
}
function echoChaos(g) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.2, l = 150 + h01(i * 3) * 70, w = h01(i * 5) - 0.5;
    const x1 = Math.cos(a) * l, y1 = Math.sin(a) * l - 20, cx = Math.cos(a + w) * l * 0.55, cy = Math.sin(a + w) * l * 0.55 - 20;
    for (const [lw, c, al] of [[22, '#1a0030', 0.85], [10, '#4a1080', 0.8], [3, CHAOS, 0.9]]) {
      g.strokeStyle = rgba(c, al); g.lineWidth = lw; g.beginPath(); g.moveTo(0, -20); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
    }
    almond(g, x1, y1, 11, 6, a); g.fillStyle = '#f4ecff'; g.fill();
    g.fillStyle = CHAOS; g.beginPath(); g.arc(x1, y1, 4, 0, TAU); g.fill();
  }
  g.beginPath(); g.arc(0, -30, 92, 0, TAU); ghostFill(g, '#2a0848');
  almond(g, 0, -34, 72, 34); g.fillStyle = '#f4ecff'; g.fill(); g.strokeStyle = '#2a0048'; g.lineWidth = 3; g.stroke();
  g.fillStyle = radG(g, 0, -34, 0, 0, -34, 30, [0, '#000000', 0.3, '#3a0060', 0.7, CHAOS, 1, '#f0d8ff']);
  g.beginPath(); g.arc(0, -34, 30, 0, TAU); g.fill();
  g.fillStyle = '#000000'; g.beginPath(); g.ellipse(0, -34, 5, 22, 0, 0, TAU); g.fill();
  almond(g, 0, -34, 72, 34); ghostEdge(g, CHAOS, 2);
}
function echoNarkissa(g) {
  g.beginPath();
  g.moveTo(-70, -64); g.quadraticCurveTo(-40, -80, 0, -76); g.quadraticCurveTo(40, -80, 70, -64);
  g.quadraticCurveTo(110, 40, 160, 190); g.lineTo(96, 160); g.lineTo(40, 196); g.lineTo(0, 170); g.lineTo(-40, 196); g.lineTo(-96, 160); g.lineTo(-160, 190);
  g.quadraticCurveTo(-110, 40, -70, -64); g.closePath();
  ghostFill(g, '#0a2a44'); ghostEdge(g, GLASS, 2);
  g.beginPath(); g.moveTo(-9, -76); g.lineTo(-7, -150); g.lineTo(7, -150); g.lineTo(9, -76); g.closePath(); ghostFill(g, '#0a2a44');
  g.beginPath(); g.ellipse(0, -182, 26, 34, 0, 0, TAU); g.fillStyle = 'rgba(10,30,50,0.85)'; g.fill(); ghostEdge(g, GLASS, 1.5);
  for (let k = -3; k <= 3; k++) {
    g.beginPath(); g.moveTo(k * 10 - 6, -208); g.lineTo(k * 12, -250 + Math.abs(k) * 9); g.lineTo(k * 10 + 6, -208); g.closePath();
    g.fillStyle = 'rgba(200,235,255,0.55)'; g.fill(); ghostEdge(g, GLASS, 1);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4, x = Math.cos(a) * 180, y = Math.sin(a) * 150 - 30, r = 16 + h01(i) * 12;
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.6, y); g.lineTo(x, y + r * 1.3); g.lineTo(x - r * 0.6, y); g.closePath();
    g.fillStyle = 'rgba(190,225,255,0.4)'; g.fill(); ghostEdge(g, GLASS, 1);
  }
}
function echoZiz(g) {
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(0, -40);
    g.bezierCurveTo(s * 60, -120, s * 150, -170, s * 226, -160);
    for (let k = 0; k < 7; k++) {
      const u = k / 6, x = s * lerp(226, 30, u), y = lerp(-160, 40, u), fl = 70 + (1 - u) * 60;
      g.lineTo(x + s * 8, y + fl * 0.6); g.lineTo(x - s * 12, y + 20);
    }
    g.lineTo(0, 30); g.closePath();
    ghostFill(g, '#101c30'); ghostEdge(g, BOLT, 2);
  }
  g.beginPath(); g.ellipse(0, -60, 34, 50, 0, 0, TAU); g.fillStyle = 'rgba(12,20,34,0.9)'; g.fill(); ghostEdge(g, BOLT, 1.5);
  g.beginPath(); g.moveTo(14, -110); g.lineTo(96, -96); g.lineTo(16, -86); g.closePath(); g.fillStyle = 'rgba(40,50,70,0.9)'; g.fill(); ghostEdge(g, BOLT, 1.2);
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = radG(g, 0, -50, 0, 0, -50, 46, [0, '#ffffff', 0.25, BOLT, 1, 'rgba(191,224,255,0)']); g.fillRect(-48, -98, 96, 96);
  g.strokeStyle = rgba(BOLT, 0.6); g.lineWidth = 2;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, -50, 16 + k * 10, k, k + 3.6); g.stroke(); }
  g.restore();
}
/** 검은 태양의 흰 불꽃 코로나 */
function drawCoronaArt(g) {
  const R0 = 80;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = radG(g, 0, 0, R0 * 0.9, 0, 0, R0 * 2.15, [0, 'rgba(255,255,255,0.95)', 0.22, 'rgba(255,250,230,0.5)', 1, 'rgba(255,240,200,0)']);
  g.beginPath(); g.arc(0, 0, R0 * 2.15, 0, TAU); g.fill();
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU + h01(i) * 0.1, l = 24 + h01(i * 3.7) * 68, w = 0.05 + h01(i * 1.9) * 0.06, b = 0.08 * (h01(i * 2.3) - 0.5);
    g.beginPath();
    g.moveTo(Math.cos(a - w) * R0, Math.sin(a - w) * R0);
    g.quadraticCurveTo(Math.cos(a + b) * (R0 + l * 0.6), Math.sin(a + b) * (R0 + l * 0.6), Math.cos(a) * (R0 + l), Math.sin(a) * (R0 + l));
    g.quadraticCurveTo(Math.cos(a - b) * (R0 + l * 0.5), Math.sin(a - b) * (R0 + l * 0.5), Math.cos(a + w) * R0, Math.sin(a + w) * R0);
    g.closePath();
    g.fillStyle = `rgba(255,${240 + Math.floor(h01(i) * 15)},${200 + Math.floor(h01(i * 2) * 55)},0.34)`;
    g.fill();
  }
}
/** 아가리 속 강착원반 */
function drawMawArt(g) {
  g.globalCompositeOperation = 'lighter';
  for (const [rx, ry, c, a, lw] of [[140, 56, VIO, 0.25, 26], [128, 50, BITE, 0.35, 12], [118, 46, VIO_L, 0.6, 5], [112, 43, '#ffffff', 0.9, 2]]) {
    g.strokeStyle = rgba(c, a); g.lineWidth = lw; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU, r = 100 + h01(i * 3.1) * 40;
    g.strokeStyle = rgba(i % 3 ? VIO_L : '#ffffff', 0.35 + h01(i) * 0.4); g.lineWidth = 1 + h01(i * 2) * 2;
    g.beginPath(); g.ellipse(0, 0, r, r * 0.38, 0, a, a + 0.5 + h01(i * 5) * 0.6); g.stroke();
  }
}

// ───────────────────────── 지형 ─────────────────────────
/** x 열에서 fromY 아래 첫 발판 윗면 (고체 · 부서지는 벽 · 단방향 발판). 없으면 경기장 바닥 */
function surfaceBelow(world, A, x, fromY) {
  const m = world?.map;
  if (!m?.typeAt) return A.floor;
  const tx = Math.floor(x / TS);
  for (let ty = Math.max(0, Math.floor(fromY / TS)); ty < (m.h ?? 0); ty++) {
    const t = m.typeAt(tx, ty);
    if (t === T.SOLID || t === T.BREAK || t === T.ONEWAY) { const y = ty * TS; return y <= A.floor ? y : A.floor; }
  }
  return A.floor;
}
function mkHand(i, side) {
  return {
    i, side, x: 0, y: 0, tx: 0, ty: 0, rot: 0, trot: 0, curl: 1, tcurl: 1, spread: 1, tspread: 1, point: 0,
    eye: 0, eyeT: 0, k: 5, s: 1.18, a: 1, mode: 'float', hitT: 0,
    pEye: { x: 0, y: 0, w: 50, h: 50, defMul: 1.5, hand: i, eye: true },
    pHand: { x: 0, y: 0, w: 110, h: 110, defMul: 1.3, hand: i },
  };
}

export class Nihil extends BossC {
  setup() {
    // [hook:art-boss-8] 모음(reg/index.js)에 art-boss-8 줄이 아직 없으면 여기서 한 번 등록 (이미 있으면 아무것도 안 함). BossB.init 의 preloadPainted 보다 먼저 돈다
    if (!hasPainted?.('b_nihil') && ART8?.b_nihil) registerPainted?.('b_nihil', { kind: 'boss', importer: ART8.b_nihil });   // [hook:art-boss-8]
    ensureArt(this.world);
    tabs();
    this.noGravity = true;
    this.facing = -1; this.face = -1;
    const A = this.A;
    this.bx = clamp(this.cx, A.x0 + 200, Math.max(A.x0 + 200, A.x1 - 200));
    this.by = this.hoverY('mid');
    this.tx = this.bx; this.ty = this.by; this.spd = 115;
    this.bob = 0; this.tilt = 0; this.look = 0; this.lookY = 0;
    this.introK = 0; this.glitch = 0; this.glitchT = 0; this.glitchCD = 1; this.glitchSpike = 0;
    this.tear = 0; this.sunK = 0; this.mawK = 0; this.mawT = 0; this.implode = 0;
    this.echo = null; this.echoKey = null; this.echoA = 0; this.echoFlick = false; this.faceIdx = 0; this.faceA = 0;
    this.wallT = 0; this.collapseCD = 0; this.llK = 0; this.dieT = 0; this.whited = false; this.fxAcc = 0;
    this.sf = null; this.gr = null; this.mw = null; this._lastHit = null;
    this.hands = [mkHand(0, -1), mkHand(1, 1)];
    this.pCore = { x: 0, y: 0, w: 80, h: 100, defMul: 1, core: true };
    this.pShroud = { x: 0, y: 0, w: 220, h: 140, defMul: 1.35, shroud: true };
    this.cCore = { x: 0, y: 0, w: 64, h: 80 };
    this._hp = []; this._cp = []; this._pts = new Float32Array(2 * (ROBE_A.length + ROBE_B.length + HEM_N * 2 + 2)); this._nf = ROBE_A.length; this._nh = 0;
    this._n = 0; this._builtT = -1; this._fp = new Float32Array(8); this._ml = new Float32Array(34); this._mr = new Float32Array(34); this._lk = { x: 0, y: 0 };
    this._B = { x0: A.x0, x1: A.x1, w: A.w, cx: A.cx };
    // 캐시 스프라이트는 등장 연출 동안 만든다 (싸움 중 새 캔버스 0 — MASTER_PLAN §5.2)
    for (const c of GLOW_COLS) { glowSprite(c, false); glowSprite(c, true); }
    for (const c of SOFT_COLS) { try { HFX.soft?.(c, true); } catch { /* hitfx 없음 */ } }
    prewarmLights(this.world?.lighting);   // 조명 색광(lighting.js 캐시)도 지금 굽는다
    for (const h of this.hands) this.resetHand(h);
    this.place(); this.syncParts();
  }

  // ═════════════════════════════ 경기장 · 위치 ═════════════════════════════
  hoverY(kind = 'mid') {
    const A = this.A, top = A.top ?? 0, F = A.floor;
    const y = kind === 'high' ? F - 360 : kind === 'low' ? F - 190 : kind === 'sun' ? F - 200 : F - 262;
    return clamp(y, top + 230, F - 150);
  }
  /** 지금 싸울 수 있는 가로 범위 (공허의 벽이 조여 들면 그 안쪽) */
  bounds() {
    const A = this.A, w = wallsX(this);
    let x0 = A.x0, x1 = A.x1;
    if (w) { x0 = Math.max(x0, w.x0); x1 = Math.min(x1, w.x1); }
    if (!(x1 - x0 >= 3 * TS)) { x0 = A.x0; x1 = A.x1; }
    const B = this._B;
    B.x0 = x0; B.x1 = x1; B.w = x1 - x0; B.cx = (x0 + x1) / 2;
    return B;
  }
  /** 화면에 보이는 경기장 가로 범위 (별비 · 파편 비가 보이는 곳에 떨어지게) */
  viewBounds(m = 20) {
    const B = this.bounds(), cam = this.world?.camera;
    let x0 = B.x0 + m, x1 = B.x1 - m;
    if (cam) { x0 = Math.max(x0, cam.x + m); x1 = Math.min(x1, cam.x + (cam.vw ?? cam.w) - m); }
    if (!(x1 - x0 >= 6 * TS)) { x0 = B.x0 + m; x1 = B.x1 - m; }
    return { x0, x1, w: x1 - x0 };
  }
  surface(x, fromY) { return surfaceBelow(this.world, this.A, x, fromY); }
  /** 몸 좌우 배율: face(−1..1)를 따라 돌아서며 가로로 좁아졌다 넓어진다 */
  sxOf() { const f = this.face; return (f >= 0 ? 1 : -1) * (0.35 + 0.65 * Math.abs(f)); }
  /** 바닥까지 남은 높이 (몸 지역 y) — 옷자락 · 촉수가 바닥을 뚫지 않게 */
  roomBelow() { return Math.max(40, this.A.floor - (this.by + this.bob) - 8); }
  setSize(S) {
    if (this.w === S.w && this.h === S.h) return;
    this.w = S.w; this.h = S.h;
    this.place();
  }
  place() {
    const cy = this.by + this.bob;
    this.x = this.bx - this.w / 2;
    this.y = this.w === SUN.w ? cy - this.h / 2 : cy - 90;
    this.vx = 0; this.vy = 0;
  }
  glide(dt) {
    const B = this._B, hw = this.sunK > 0.5 ? 110 : 150;
    const tx = B.w > hw * 2 ? clamp(this.tx, B.x0 + hw, B.x1 - hw) : B.cx;
    this.bx += clamp((tx - this.bx) * 2.2, -this.spd, this.spd) * dt;
    this.by += clamp((this.ty - this.by) * 2.2, -this.spd, this.spd) * dt;
    const A = this.A;
    this.bx = clamp(this.bx, A.x0 + this.w / 2, Math.max(A.x0 + this.w / 2, A.x1 - this.w / 2));
  }
  /** 가면(P1·P2) · 아가리 속 핵(열렸을 때) · 검은 태양(P4) 의 월드 좌표 */
  coreY() {
    const cy = this.by + this.bob;
    if (this.sunK > 0.5) return cy;
    return this.mawK > 0.55 ? cy + MAW_Y : cy;
  }
  mawXY() { return { x: this.bx, y: this.by + this.bob + MAW_Y }; }

  // ═════════════════════════════ 손 ═════════════════════════════
  resetHand(h) {
    const cy = this.by + this.bob;
    h.mode = 'float'; h.k = 5; h.point = 0; h.eye = 0; h.eyeT = 0; h.hitT = 0; h.a = 1;
    h.x = h.tx = this.bx + h.side * 250; h.y = h.ty = cy + 66;
    h.rot = h.trot = h.side * 0.32; h.curl = 1; h.tcurl = 0.35; h.spread = h.tspread = 1;
  }
  holdHand(h, x, y, rot, curl = 0.3, spread = 1, k = 6) {
    h.mode = 'hold'; h.tx = x; h.ty = y; h.trot = rot; h.tcurl = curl; h.tspread = spread; h.k = k;
  }
  releaseHand(h) { h.mode = 'float'; h.k = 5; h.point = 0; }
  releaseHands() { for (const h of this.hands) this.releaseHand(h); }
  handNear(x) { const [a, b] = this.hands; return Math.abs(a.x - x) <= Math.abs(b.x - x) ? a : b; }
  tickHands(dt) {
    const cy = this.by + this.bob, sun = this.sunK, B = this._B;
    for (const h of this.hands) {
      if (h.mode === 'float') {
        const ph = this.t * 1.25 + h.i * 1.7;
        h.tx = this.bx + h.side * lerp(250, 190, sun) + Math.sin(ph * 0.7) * 10;
        h.ty = cy + lerp(66, 30, sun) + Math.sin(ph) * 16;
        h.trot = h.side * (0.32 + Math.sin(ph * 0.8) * 0.08);
        h.tcurl = 0.32 + Math.sin(ph * 1.3) * 0.12; h.tspread = 1; h.k = 4.5;
      } else if (h.mode === 'limp') {
        h.tx = h.x; h.ty = this.A.floor - 70; h.tcurl = 1; h.trot = h.side * 0.9; h.k = 1.2;
        h.a = clamp(1 - (this.dieT - 1.2) / 1.4, 0, 1);
      }
      if (h.mode !== 'sweep') {
        const k = 1 - Math.exp(-h.k * dt);
        h.x += (h.tx - h.x) * k; h.y += (h.ty - h.y) * k;
        if (h.mode !== 'limp') h.x = clamp(h.x, B.x0 + 30, B.x1 - 30);
      }
      h.rot += wrapAngle(h.trot - h.rot) * (1 - Math.exp(-8 * dt));
      h.curl = approach(h.curl, h.tcurl, dt * 3.2);
      h.spread = approach(h.spread, h.tspread, dt * 3);
      if (h.eyeT > 0) h.eyeT -= dt;
      h.eye = approach(h.eye, h.eyeT > 0 ? 1 : 0, dt * (h.eyeT > 0 ? 6 : 3.5));
      if (h.hitT > 0) h.hitT -= dt;
      h.s = lerp(1.18, 0.95, sun);
    }
  }
  /** 플레이어 방향 (손 지역 좌표, 거울 포함) — 손바닥 눈이 따라본다 */
  localLook(h) {
    const p = this.P, L = this._lk;
    if (!p) { L.x = 0; L.y = 0; return L; }
    const dx = p.cx - h.x, dy = p.cy - h.y, c = Math.cos(-h.rot), s = Math.sin(-h.rot);
    const lx = (dx * c - dy * s) * -h.side, ly = dx * s + dy * c, d = Math.hypot(lx, ly) || 1;
    L.x = lx / d; L.y = ly / d;
    return L;
  }

  // ═════════════════════════════ 애니메이션 · 판정 ═════════════════════════════
  animate(dt) {
    this.introK = approach(this.introK, 1, dt / 1.4);
    this.bob = Math.sin(this.t * 1.15) * 10 * (1 - this.sunK * 0.5);
    this.face = approach(this.face, this.facing, dt * 2.6);
    const p = this.P, my = this.by + this.bob;
    this.tilt = p ? clamp((p.cy - my) * 0.0009, -0.22, 0.22) : 0;
    this.look = p ? clamp((p.cx - this.bx) / 300, -1, 1) : 0;
    this.lookY = p ? clamp((p.cy - my) / 300, -1, 1) : 0;
    // 일그러짐 (P2 부터 가끔 튄다, 전환 중에는 계속)
    const alive = !(this.dying > 0);
    if (this.formPhase >= 1 && this.formPhase < 3 && alive) {
      this.glitchCD -= dt;
      if (this.glitchCD <= 0) { this.glitchCD = rand(0.7, 1.9); this.glitchSpike = 0.14; }
    }
    if (this.glitchSpike > 0) this.glitchSpike -= dt;
    if (this.glitchT > 0) this.glitchT -= dt;
    const gBase = this.formPhase >= 1 && this.formPhase < 3 ? 0.12 : 0;
    this.glitch = Math.max(gBase + (this.glitchSpike > 0 ? 0.8 : 0), this.glitchT > 0 ? 1 : 0);
    // 형태 (찢김 · 검은 태양 · 아가리)
    this.tear = approach(this.tear, this.formPhase === 2 ? 1 : 0, dt * 0.9);
    this.sunK = approach(this.sunK, this.formPhase >= 3 ? 1 : 0, dt * 0.8);
    this.mawK = approach(this.mawK, this.mawT, dt * (this.mawT > this.mawK ? 2.2 : 5));
    // 메아리
    this.echoA = approach(this.echoA, this.echo ? 1 : 0, dt * (this.echo ? 3.5 : 1.6));
    if (!this.echo && this.echoA <= 0) this.echoKey = null;
    // 가면 위를 스치는 얼굴
    if (this.echoKey) { this.faceIdx = ECHO[this.echoKey].face; this.faceA = 0.85 * this.echoA; }
    else if (this.glitch > 0.5) { this.faceIdx = Math.floor(h01(Math.floor(this.t * 14)) * 7); this.faceA = 0.7; }
    else {
      const u = this.t / FACE_T;
      this.faceIdx = Math.floor(u) % 7;
      this.faceA = Math.pow(Math.sin(PI * (u % 1)), 2) * (this.formPhase >= 1 ? 0.6 : 0.42);
    }
    this.tickHands(dt);
  }
  syncParts() {
    const cy = this.by + this.bob, sun = this.sunK > 0.5;
    const pc = this.pCore, cc = this.cCore, y = this.coreY();
    pc.w = sun ? 150 : 80; pc.h = sun ? 150 : 100;
    pc.x = this.bx - pc.w / 2; pc.y = y - pc.h / 2;
    pc.defMul = sun ? 0.4 : this.mawK > 0.55 ? 0.5 : 1.0;
    pc.exposed = sun || this.mawK > 0.55;
    cc.w = sun ? 120 : 64; cc.h = sun ? 120 : 80; cc.x = this.bx - cc.w / 2; cc.y = y - cc.h / 2;
    const ps = this.pShroud;
    ps.x = this.bx - 110; ps.y = cy + 50; ps.w = 220; ps.h = clamp(this.A.floor - (cy + 50), 20, 150);
    if (this.mawK > 0.55) { ps.y = cy + MAW_Y + 55; ps.h = clamp(this.A.floor - ps.y, 20, 100); }
    for (const h of this.hands) {
      const e = h.pEye, pr = h.pHand, s = h.s;
      e.x = h.x - 25; e.y = h.y - 25;
      e.defMul = h.eye > 0.5 ? 0.6 : 1.5;
      const fx = h.x + Math.sin(h.rot) * 30 * s, fy = h.y - Math.cos(h.rot) * 30 * s;
      pr.w = pr.h = 110 * s; pr.x = fx - pr.w / 2; pr.y = fy - pr.h / 2;
    }
  }
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0) return L;
    for (const h of this.hands) if (h.eye > 0.5 && h.a > 0.5) L.push(h.pEye);
    L.push(this.pCore);
    for (const h of this.hands) if (h.eye <= 0.5 && h.a > 0.5) L.push(h.pHand);
    if (this.sunK < 0.5 && this.implode < 0.5) L.push(this.pShroud);
    return L;
  }
  /** 접촉은 가면/핵만 (공허의 옷자락과 손은 몸을 통과한다 — 손은 공격 지대로만 때린다) */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.dying > 0 || this.introK < 0.5) return L;
    L.push(this.cCore);
    return L;
  }
  /**
   * 피날레는 건너뛸 수 없다: 마지막 경계(15%) 위에서 한 방에 쓰러뜨릴 피해(각성 · 필살 · 대미지 폭주)는 경계 바로 아래까지만
   * 들어가 final 전환(검은 태양 · b_nihil_final · 필살/각성 게이지 가득)이 먼저 온다. 이미 경계 아래면(마지막 페이즈 · 디버그 처치) 그대로
   */
  takeHit(dmg, attack, world, info) {
    const ph = this.def?.phases ?? [], last = ph[ph.length - 1], max = this.stats?.maxHp ?? 0;
    if (last > 0 && max > 0 && !(this.dying > 0) && !this.invuln && this.phase < ph.length && this.hp > max * last && dmg >= this.hp) {
      dmg = Math.max(1, this.hp - Math.floor(max * last * 0.95));
    }
    return super.takeHit(dmg, attack, world, info);
  }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (part && part.hand !== undefined) {
      const h = this.hands[part.hand];
      h.hitT = 0.15; this._lastHit = 'h' + part.hand;
      if (part.eye && h.eye > 0.5) { world.fx.burst('magic', x, y, 5, { color: IRIS, speed: 200 }); world.fx.burst('blood', x, y, 4, { color: '#6a0a3a', speed: 180 }); }
      else if (Math.random() < 0.6) world.fx.burst('shard', x, y, 3, { color: PORC, speed: 200 });
    } else if (part === this.pCore) {
      this._lastHit = 'core';
      if (this.sunK > 0.5) world.fx.burst('holy', x, y, 4, { speed: 220 });
      else if (this.mawK > 0.55) world.fx.burst('magic', x, y, 4, { color: BITE, speed: 220 });
      else if (Math.random() < 0.7) world.fx.burst('shard', x, y, 3, { color: PORC, speed: 180 });
    } else if (part === this.pShroud) {
      this._lastHit = 'shroud';
      if (Math.random() < 0.6) world.fx.burst('magic', x, y, 4, { color: WHITE, speed: 160 });
    }
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    this.bounds();
    this.animate(dt);
    this.glide(dt);
    this.place();
    this.syncParts();
    this.ambient(dt, world);
    this.ensureCull(world);
    // 공허의 벽: collapse 뒤 12초면 열린다
    if (this.wallT > 0) { this.wallT -= dt; if (this.wallT <= 0) { this.wallT = 0; wallsOpen(this, 120); } }
    // P3: 약 20초마다 다시 collapse (벽이 열려 있을 때, 다음 패턴으로)
    if (this.phase === 2 && this.formPhase === 2 && !this._tr) {
      this.collapseCD += dt;
      if (this.collapseCD >= 20 && this.wallT <= 0 && this.state === 'idle' && !this.forced.includes('collapse')) this.forceNext('collapse');
    }
  }
  idleAnim(dt) { this.bounds(); this.animate(dt); this.place(); this.syncParts(); }
  ambient(dt, world) {
    const q = world.fx?.quality ?? 1, sun = this.sunK > 0.5;
    this.fxAcc += dt * q * (sun ? 9 : 5) * this.introK;
    const cy = this.by + this.bob;
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      if (sun) { const a = rand(0, TAU), r = rand(80, 130); world.fx.emit('holy', this.bx + Math.cos(a) * r, cy + Math.sin(a) * r, { color: WHITE, speed: 50, angle: a, spread: 0.3 }); continue; }
      const sx = this.sxOf();
      world.fx.emit('magic', this.bx + rand(-200, 200) * Math.abs(sx), cy + rand(-140, 170), { color: Math.random() < 0.6 ? STARC : VIO_L, speed: 18, angle: -PI / 2, spread: 0.8, size: 2 });
      if (this.mawK > 0.3 || this.tear > 0.5) {
        const a = rand(0, TAU), r = rand(120, 190), m = this.mawXY();
        world.fx.emit('magic', m.x + Math.cos(a) * r, m.y + Math.sin(a) * r * 0.5, { color: WHITE, speed: 160, angle: a + PI, spread: 0.1, size: 2 });
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
    const cy = this.by + this.bob;
    let x0 = this.bx - 340, x1 = this.bx + 340, y0 = cy - 320, y1 = cy + 300;
    for (const h of this.hands) { x0 = Math.min(x0, h.x - 180); x1 = Math.max(x1, h.x + 180); y0 = Math.min(y0, h.y - 180); y1 = Math.max(y1, h.y + 180); }
    r.x = x0; r.y = y0; r.w = x1 - x0; r.h = y1 - y0;
    return r;
  }
  draw(ctx, world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world && !this._artDrawing) return;   // 대리 개체(ArtCull)가 그린다
    super.draw(ctx, world);
  }

  // ═════════════════════════════ 상태 ═════════════════════════════
  s_intro(dt, world, t) {
    if (this.at(0.001)) {
      audio.sfx('ghost', { pitch: 0.4, vol: 0.8 });
      world.fx.ring(this.bx, this.by, { color: WHITE, r0: 20, r1: 280, life: 0.8, width: 4 });
      for (const h of this.hands) h.tcurl = 0.3;
    }
    if (t >= 1.2) this.done(0.8);
  }
  idleMove(dt, world, t) {
    const p = this.P, B = this._B, sun = this.sunK > 0.5;
    this.facePlayer();
    const px = p ? p.cx : B.cx;
    const side = Math.sign(this.bx - px) || -this.facing;
    const want = sun ? 150 : 250;
    let tx = px + side * want;
    if (tx < B.x0 + 170 || tx > B.x1 - 170) tx = px - side * want;   // 경기장 끝에 몰리면 반대편으로 넘어간다
    this.tx = tx;
    this.ty = this.hoverY(sun ? 'sun' : 'mid') + Math.sin(this.t * 0.7) * 26;
    this.spd = sun ? 70 : 115;
  }

  // ── palmEyes: 손이 내려와 예고(warnCircle 0.8초) → 내려찍기(원 r 110, mv 1.8), 손바닥 눈이 1.8초 열린다 ──
  s_palmEyes(dt, world, t) {
    const second = this.inferno ? 0.55 : 0;
    if (this.at(0.001)) {
      this.facePlayer(); this.spd = 60;
      audio.sfx('ghost', { pitch: 0.5, vol: 0.7 });
      this.slam(null);
    }
    if (second && this.at(second)) this.slam(this.slamH);
    if (t >= second + 0.8 + 1.8 + 0.45) { this.releaseHands(); this.done(1.0); }
  }
  slam(avoid) {
    const p = this.P, B = this._B, A = this.A;
    const px = clamp(p ? p.cx : A.cx, B.x0 + 70, B.x1 - 70);
    const sy = this.surface(px, p ? p.bottom - 6 : A.floor - 10);
    const h = avoid ? this.hands.find((q) => q !== avoid) : this.handNear(px);
    this.slamH = h;
    const hy = sy - 100 * h.s, rot = PI + h.side * 0.28;
    this.holdHand(h, px - h.side * 40, hy - 190, rot, 0.12, 1.3, 7);
    strikeCircle(this, px, sy - 40, 110, {
      warn: 0.8, life: 0.3, mv: 1.8, element: 'dark', color: VIO, kb: [420, -560], sfx: null, burstFx: 'dark',
      onStart: (z, w) => {
        h.x = h.tx = px; h.y = h.ty = hy; h.rot = h.trot = rot; h.tcurl = 0.45; h.eyeT = 1.8;
        impact(w, { shake: 11, time: 0.35 });
        audio.sfx('explode', { pitch: 0.55 }); audio.sfx('hit_heavy', { pitch: 0.5 });
        w.fx.burst('shard', px, sy - 4, 12, { color: '#3a3050', speed: 300 });
        w.fx.ring(px, sy - 6, { color: VIO_L, r0: 20, r1: 150, life: 0.4, width: 6 });
      },
    });
    this.later(0.62, () => { if (h.mode === 'hold') { h.tx = px; h.ty = hy; h.k = 26; } });
    this.later(0.8 + 1.8, () => { if (h.mode === 'hold') this.releaseHand(h); });
  }

  // ── erase: 플레이어 높이의 90px 띠 예고(0.9초) → 지워진다 (mv 1.6). 손가락이 띠를 따라 긋는다 ──
  s_erase(dt, world, t) {
    const n = this.inferno ? 2 : 1;
    if (this.at(0.001)) { this.spd = 50; audio.sfx('magic', { pitch: 0.4 }); audio.sfx('ghost', { pitch: 0.7, vol: 0.5 }); this.eraseBand(0); }
    if (n > 1 && this.at(0.6)) this.eraseBand(1);
    if (t >= 0.9 + 0.3 + (n - 1) * 0.6 + 0.45) { this.releaseHands(); this.done(1.0); }
  }
  eraseBand(i) {
    const p = this.P, B = this._B, A = this.A, top = A.top ?? 0;
    const cy = clamp(p ? p.cy : A.floor - 60, top + 60, A.floor - 45);
    const y = cy - 45, left = this.bx < B.cx;
    const h = this.hands[(left ? 0 : 1) ^ (i & 1)];
    const sx = left ? B.x0 + 70 : B.x1 - 70, ex = left ? B.x1 - 70 : B.x0 + 70;
    this.holdHand(h, sx, cy, left ? PI / 2 : -PI / 2, 0.1, 0.6, 8);
    h.point = 1;
    strikeRect(this, { x: B.x0, y, w: B.w, h: 90 }, {
      warn: 0.9, life: 0.3, mv: 1.6, element: 'dark', color: ERASE, kb: [300, -300], sfx: null, z: 7,
      onStart: (z, w) => { h.tx = ex; h.k = 14; audio.sfx('slash_heavy', { pitch: 0.6 }); audio.sfx('thunderclap', { pitch: 1.8, vol: 0.4 }); w.camera?.shake?.(6, 0.25); },
      onEnd: () => { h.point = 0; },
      paint: (ctx, z, w) => paintErase(ctx, z, w),
    });
  }

  // ── starfall: 별 10개가 흩어진 x 에 (경고 원 r 40, 0.7초) mv 1.0 — 칸마다 하나씩이라 늘 틈이 있다 ──
  s_starfall(dt, world, t) { this.starTick(t, STAR_N); }
  starTick(t, o) {
    if (this.at(0.001)) {
      const V = this.viewBounds(40), n = o.n, xs = [];
      for (let i = 0; i < n; i++) xs.push(V.x0 + (V.w * (i + 0.5)) / n + (rand(-0.28, 0.28) * V.w) / n);
      for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const s = xs[i]; xs[i] = xs[j]; xs[j] = s; }
      this.sf = { xs, i: 0 };
      for (const h of this.hands) this.holdHand(h, this.bx + h.side * 170, this.by - 150, h.side * 0.5, 0.05, 1.35, 4);
      this.ty = this.hoverY('high'); this.spd = 50;
      audio.sfx('holy', { pitch: 0.5, vol: 0.7 }); audio.sfx('magic', { pitch: 0.6, vol: 0.5 });
    }
    const S = this.sf;
    if (!S) { this.done(0.6); return; }
    while (S.i < o.n && t >= S.i * o.gap) this.star(S.xs[S.i++], o.warn);
    if (t >= (o.n - 1) * o.gap + o.warn + 0.55) { this.sf = null; this.releaseHands(); this.done(o.rest); }
  }
  star(x, warn) {
    const A = this.A;
    const sy = this.surface(x, (A.top ?? 0) + 8), y = sy - 36;
    strikeCircle(this, x, y, 40, {
      warn, life: 0.25, mv: 1.0, color: STARC, sfx: null, burstFx: 'holy', kb: [220, -380],
      onStart: () => audio.sfx('explode', { pitch: 1.6, vol: 0.35 }),
      paint: (ctx, z, w) => paintStar(ctx, z, w, x, y),
    });
  }

  // ── grasp: 두 손이 경기장 끝 바닥(0–116px)에서 안쪽으로 1.0초에 쓸어 온다 (mv 1.5) — 예고 0.8초 ──
  s_grasp(dt, world, t) { this.graspTick(t, 1.0, 1.0); }
  graspTick(t, dur, rest) {
    const warn = dur > 1.5 ? 1.0 : 0.8, [L, Rh] = this.hands;
    if (this.at(0.001)) {
      const B = this._B, F = this.A.floor;
      // 손은 벽에 붙어서 출발한다 (판정 = 손 x −15…+105): 벽에 바짝 붙은 플레이어도 쓸린다 — 피하려면 뛰어넘을 것
      const G = this.gr = { x0: B.x0 + 30, x1: B.x1 - 30, mid: B.cx, F, on: false };
      this.holdHand(L, G.x0, F - 58, PI / 2, 0.25, 0.75, 9);
      this.holdHand(Rh, G.x1, F - 58, -PI / 2, 0.25, 0.75, 9);
      this.zone({ x: B.x0, y: F - 120, w: B.w, h: 120, warn: 0, life: warn, harmless: true, z: 5, paint: (ctx, z, w) => warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / warn, 0, 1), VIO, w.time) });
      telegraph(this, warn, { sfx: 'warning', vol: 0.4 });
      audio.sfx('ghost', { pitch: 0.45, vol: 0.7 });
      this.ty = this.hoverY('high'); this.spd = 60;
    }
    const G = this.gr;
    if (!G) { this.done(0.6); return; }
    if (this.at(warn)) {
      G.on = true;
      for (const [h, s] of [[L, 1], [Rh, -1]]) {
        h.mode = 'sweep';
        this.zone({ x: h.x + s * 45 - 60, y: G.F - 116, w: 120, h: 116, warn: 0, life: dur, mv: 1.5, element: 'dark', kb: [s * 540, -440], z: 7, tick: (z) => { z.x = h.x + s * 45 - 60; } });
      }
      audio.sfx('dash', { pitch: 0.4 }); audio.sfx('whip', { pitch: 0.3, vol: 0.8 });
    }
    if (G.on && t >= warn) {
      const u = clamp((t - warn) / dur, 0, 1);
      L.x = L.tx = lerp(G.x0, G.mid - 44, u); L.y = L.ty = G.F - 58;
      Rh.x = Rh.tx = lerp(G.x1, G.mid + 44, u); Rh.y = Rh.ty = G.F - 58;
      if (u < 1 && this.every(0.06, warn)) for (const h of this.hands) this.world.fx.emit('dust', h.x, G.F - 4, { speed: 120, angle: -PI / 2, spread: 0.6 });
    }
    if (G.on && this.at(warn + dur)) {
      G.on = false;
      for (const h of this.hands) { h.mode = 'hold'; h.tx = h.x; h.ty = h.y; }
      impact(this.world, { shake: 9, time: 0.35 });
      audio.sfx('hit_heavy', { pitch: 0.55 });
      this.world.fx.ring(G.mid, G.F - 50, { color: VIO_L, r0: 20, r1: 180, life: 0.4, width: 6 });
    }
    if (t >= warn + dur + 0.6) { this.gr = null; this.releaseHands(); this.done(rest); }
  }

  // ── 메아리 (P2+) ──
  setEcho(key) { this.echo = key; this.echoKey = key; }
  clearEcho() { this.echo = null; }
  /** echoDracula: 지옥불 기둥 셋(바닥 분출 예고) + 화염구 셋, 드라큘라 색 */
  s_echoDracula(dt, world, t) {
    if (this.at(0.001)) {
      this.setEcho('dracula'); this.spd = 50; this.facePlayer();
      audio.sfx('bat', { pitch: 0.6 }); audio.sfx('fire', { pitch: 0.6 });
      const p = this.P, B = this._B, px = p ? p.cx : B.cx;
      for (const dx of this.inferno ? [0, -220, 220, -440, 440] : [0, -220, 220]) this.hellPillar(clamp(px + dx, B.x0 + 44, B.x1 - 44));
      const h = this.hands[this.facing > 0 ? 1 : 0];
      this.holdHand(h, this.bx + this.facing * 150, this.by - 120, this.facing * 0.4, 0.55, 1.4, 6);
    }
    if (this.at(1.25)) this.hellBalls();
    if (t >= 2.3) { this.clearEcho(); this.releaseHands(); this.done(1.0); }
  }
  hellPillar(x) {
    const F = this.A.floor;
    strikeFloor(this, x, { w: 84, h: 380, warn: 0.85, life: 0.5, mv: 1.3, element: 'fire', color: DRAC, burstFx: 'fire', kb: [260, -640], paint: (ctx, z, w) => paintHell(ctx, z, w, x, F, 84, 380) });
  }
  hellBalls() {
    const p = this.P, h = this.hands[this.facing > 0 ? 1 : 0];
    const ox = h.x, oy = h.y - 30;
    const aim = p ? Math.atan2(p.cy - oy, p.cx - ox) : (this.facing > 0 ? 0 : PI);
    for (let i = 0; i < 3; i++) {
      const a = aim + (i - 1) * 0.22;
      this.shoot({ x: ox, y: oy, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, w: 22, h: 22, life: 3.5, render: hellRender, trail: 'fire', trailRate: 0.04, light: { r: 80, color: DRAC, i: 0.8 }, attack: { mv: 0.9, element: 'fire', kb: [260, -300] } });
    }
    audio.sfx('fire', { pitch: 0.8 }); this.world.fx.burst('fire', ox, oy, 10, { speed: 160 });
  }
  /** echoChaos: 눈 광선 격자 — 세로 4 + 가로 2 (예고 1.0초, mv 1.4), 보라 */
  s_echoChaos(dt, world, t) {
    if (this.at(0.001)) {
      this.setEcho('chaos'); this.spd = 40;
      audio.sfx('dark', { pitch: 0.5 }); audio.sfx('ghost', { pitch: 0.4, vol: 0.6 });
      const B = this._B, A = this.A, F = A.floor, top = A.top ?? 0, p = this.P, px = p ? p.cx : B.cx;
      const xs = [0, 1, 2, 3].map((i) => B.x0 + (B.w * (i + 0.5)) / 4 + rand(-40, 40));
      let k = 0, bd = Infinity;
      xs.forEach((x, i) => { const d = Math.abs(x - px); if (d < bd) { bd = d; k = i; } });
      xs[k] = clamp(px, B.x0 + 30, B.x1 - 30);   // 하나는 플레이어 자리 — 틈으로 옮겨야 한다
      const ys = [F - rand(250, 290), F - rand(400, 460)].map((y) => clamp(y, top + 40, F - 200));
      for (const x of xs) this.eyeLaser(x, top - 6, x, F);
      for (const y of ys) this.eyeLaser(B.x0 + 4, y, B.x1 - 4, y);
      for (const h of this.hands) this.holdHand(h, this.bx + h.side * 200, this.by - 40, h.side * 1.2, 0.05, 1.5, 5);
    }
    if (this.at(1.0)) { audio.sfx('magic', { pitch: 0.5, vol: 0.7 }); audio.sfx('thunderclap', { pitch: 1.4, vol: 0.35 }); }
    if (t >= 1.0 + 0.35 + 0.5) { this.clearEcho(); this.releaseHands(); this.done(1.0); }
  }
  eyeLaser(x0, y0, x1, y1) {
    strikeLine(this, x0, y0, x1, y1, { th: 30, warn: 1.0, life: 0.35, mv: 1.4, element: 'dark', color: CHAOS, kb: [300, -420], sfx: null, paint: (ctx, z, w) => paintEyeLaser(ctx, z, w) });
  }
  /** echoNarkissa: 거울 파편 비 (틈 2칸) */
  s_echoNarkissa(dt, world, t) {
    if (this.at(0.001)) {
      this.setEcho('narkissa');
      telegraph(this, 0.8);
      audio.sfx('ice', { pitch: 0.6 }); audio.sfx('magic', { pitch: 0.7, vol: 0.5 });
      const V = this.viewBounds(20), n = 9, sw = V.w / n, p = this.P;
      if (sw > 30) {
        const ps = clamp(Math.floor(((p?.cx ?? V.x0 + V.w / 2) - V.x0) / sw), 0, n - 1);
        const g1 = clamp(ps + Math.floor(rand(-1, 2)), 0, n - 1);
        let g2 = g1;
        for (let k = 0; k < 24 && Math.abs(g2 - g1) < 2; k++) g2 = Math.floor(rand(0, n));
        if (Math.abs(g2 - g1) < 2) g2 = g1 >= n / 2 ? 0 : n - 1;
        for (let k = 0; k < n; k++) if (k !== g1 && k !== g2) this.shardColumn(V.x0 + sw * (k + 0.5), sw * 0.86, k);
      }
      for (const h of this.hands) this.holdHand(h, this.bx + h.side * 150, this.by - 170, h.side * 0.2, 0.2, 1.2, 5);
    }
    if (t >= 2.3) { this.clearEcho(); this.releaseHands(); this.done(1.0); }
  }
  shardColumn(x, w, k) {
    const A = this.A, F = A.floor, top = A.top ?? 0;
    const st = { y: top - 30, landed: false };
    this.zone({
      x: x - w / 2, y: top, w, h: 70, warn: 0.8, life: 3, mv: 1.0, kb: [200, -320], z: 6,
      tick: (z, wd, dt) => {
        if (z.t < z.warn || st.landed) return;
        st.y += 720 * dt;
        z.y = st.y - 70; z.h = 70;
        if (st.y >= F) {
          st.landed = true;
          wd.fx.burst('shard', x, F - 6, 8, { color: GLASS, speed: 260 });
          if (k % 3 === 0) audio.sfx('break_wall', { pitch: rand(1.5, 1.8), vol: 0.35 });
          z.dur = z.t - z.warn;
        }
      },
      paint: (ctx, z, wd) => paintShard(ctx, z, wd, x, w, top, F, st),
    });
  }
  /** echoZiz: 번개 기둥 다섯 */
  s_echoZiz(dt, world, t) {
    if (this.at(0.001)) {
      this.setEcho('ziz');
      audio.sfx('thunder', { pitch: 0.6 }); audio.sfx('bat', { pitch: 0.4, vol: 0.6 });
      const B = this._B, p = this.P, px = p ? p.cx : B.cx, A = this.A;
      const top = Math.min(A.top ?? 0, world.camera?.y ?? 0) - 60;
      for (const o of [0, -200, 200, -400, 400]) {
        const x = clamp(px + o, B.x0 + 30, B.x1 - 30), seed = rand(0, 100);
        strikeColumn(this, x, {
          w: 60, warn: 0.9, life: 0.35, mv: 1.5, element: 'thunder', color: BOLT, top, bottom: A.floor, sfx: o === 0 ? undefined : null,
          onStart: (z, w) => { this.lightning(0.5); w.camera?.shake?.(4, 0.2); },
          paint: (ctx, z, w) => paintBolt(ctx, z, w, x, top, A.floor, seed),
        });
      }
      for (const h of this.hands) this.holdHand(h, this.bx + h.side * 230, this.by - 90, h.side * 1.0, 0.1, 1.5, 5);
    }
    if (t >= 1.8) { this.clearEcho(); this.releaseHands(); this.done(1.0); }
  }

  // ── collapse (P3): 공허의 벽이 양쪽에서 10칸씩 조여 12초 → open() ──
  s_collapse(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.collapseCD = 0;
      this.tx = (A.x0 + A.x1) / 2; this.spd = 90;
      telegraph(this, 1.0, { sfx: 'warning', vol: 0.5 });
      warnText(this, '공허가 조여 온다!', '#c8a8ff');
      audio.sfx('boss_roar', { pitch: 0.55 }); audio.sfx('thunderclap', { pitch: 0.4, vol: 0.5 });
      for (const h of this.hands) this.holdHand(h, h.side < 0 ? A.x0 + 110 : A.x1 - 110, this.by, -h.side * PI / 2, 0.05, 1.5, 3);
      darken(this, 0.12, 13.5);
    }
    if (this.at(1.0)) {
      const m = Math.max(2 * TS, Math.min(10 * TS, (A.w - 20 * TS) / 2));
      wallsClose(this, A.x0 + m, A.x1 - m, 80);
      this.wallT = 12;
      impact(world, { shake: 8, time: 0.6 });
      for (const h of this.hands) { h.tx = this.bx + h.side * 300; h.tcurl = 0.95; h.k = 1.6; }
    }
    if (t >= 2.2) { this.releaseHands(); this.done(0.9); }
  }

  // ── maw (P3): 아가리가 열려 핵 노출 → 2.5초 흡입(500px/s²) + 안쪽으로 날아드는 파편(mv 0.8) → 앞쪽 300×200 물기(mv 2.2) ──
  s_maw(dt, world, t) {
    const tIn = 0.6, pull = 2.5, tb = tIn + pull, warnB = 0.65;
    if (this.at(0.001)) {
      const p = this.P, B = this._B;
      this.mw = { n: 0 };
      this.mawT = 1; this.spd = 150; this.ty = this.hoverY('low');
      if (p) this.tx = clamp(p.cx + (Math.sign(this.bx - p.cx) || 1) * 260, B.x0 + 160, B.x1 - 160);
      telegraph(this, tIn, { sfx: 'warning', vol: 0.4 });
      audio.sfx('boss_roar', { pitch: 0.45 }); audio.sfx('ghost', { pitch: 0.3, vol: 0.7 });
    }
    if (t < tb + warnB + 0.3) {
      const m = this.mawXY();
      for (const h of this.hands) { h.mode = 'hold'; h.tx = m.x + h.side * (190 + 70 * this.mawK); h.ty = m.y - 20; h.trot = -h.side * 1.62; h.tcurl = 0.78; h.k = 6; }
    }
    if (this.at(tIn)) {
      this.spd = 30;
      const m = this.mawXY();
      pullField(this, m.x, m.y, { force: 500, maxV: 230, dur: pull, sfx: 'mist', paint: (ctx, z) => paintInhale(ctx, z, m.x, m.y) });
    }
    if (this.mw && t > tIn && t < tIn + pull - 0.2 && this.every(0.25, tIn)) this.debris();
    if (this.at(tb)) {
      const m = this.mawXY(), p = this.P, f = p ? (Math.sign(p.cx - m.x) || this.facing) : this.facing;
      this.facing = f;
      const r = { x: f > 0 ? m.x + 10 : m.x - 310, y: m.y - 100, w: 300, h: 200 };
      strikeRect(this, r, {
        warn: warnB, life: 0.25, mv: 2.2, element: 'dark', color: BITE, kb: [f * 700, -560], z: 7, sfx: null,
        onStart: (z, w) => { this.mawT = 0.12; impact(w, { shake: 14, time: 0.5 }); audio.sfx('hit_heavy', { pitch: 0.45 }); audio.sfx('explode', { pitch: 0.6, vol: 0.6 }); },
        paint: (ctx, z, w) => paintBite(ctx, z, w, r),
      });
      audio.sfx('charge_ready', { pitch: 0.6, vol: 0.5 });
    }
    if (t >= tb + warnB + 0.25 + 0.6) { this.mw = null; this.mawT = this.formPhase === 2 ? 0.25 : 0; this.releaseHands(); this.done(1.1); }
  }
  debris() {
    const B = this._B, A = this.A, m = this.mawXY(), top = A.top ?? 0;
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side < 0 ? B.x0 + 12 : B.x1 - 12, y = rand(Math.max(top + 60, A.floor - 330), A.floor - 30);
    const d = Math.hypot(m.x - x, m.y - y) || 1, sp = rand(320, 400);
    this.shoot({ x, y, vx: ((m.x - x) / d) * sp, vy: ((m.y - y) / d) * sp, w: 20, h: 20, life: d / sp, collideWalls: false, spin: rand(-8, 8), render: debrisRender, light: { r: 50, color: VIO_L, i: 0.4 }, attack: { mv: 0.8, element: 'dark', kb: [200, -260] } });
    if (this.mw) this.mw.n++;
  }

  // ── lastLight (P4): 느린 별비(5개, 예고 1.2초)와 반속 grasp 를 번갈아 — 피날레는 승리의 한 바퀴 ──
  s_lastLight(dt, world, t) {
    if (this.at(0.001)) { this.llK++; this.llMode = this.llK % 2 ? 'star' : 'grasp'; }
    if (this.llMode === 'grasp') this.graspTick(t, 2.0, 1.1);
    else this.starTick(t, STAR_SLOW);
  }

  // ── 전환 ──
  /** form2 (75%): 두 손이 가면을 움켜쥐고, 가면이 일그러지며 쓰러뜨린 자들의 얼굴과 그림자가 번갈아 스친다 */
  s_form2(dt, world, t) {
    if (this.at(0.001)) {
      this.glitchT = 2.0; this.echoFlick = true;
      audio.sfx('boss_roar', { pitch: 0.7 }); audio.sfx('ghost', { pitch: 0.35, vol: 0.9 });
      impact(world, { shake: 10, time: 0.8 });
      world.fx.ring(this.bx, this.by, { color: VIO, r0: 30, r1: 360, life: 0.8, width: 8 });
      for (const h of this.hands) this.holdHand(h, this.bx + h.side * 78, this.by + 6, -h.side * 0.55, 0.55, 1.25, 5);
    }
    if (this.every(0.12, 0, 1.8)) world.fx.emit('dark', this.bx + rand(-80, 80), this.by + rand(-80, 80), { speed: 90 });
    if (this.at(1.6)) { this.echoFlick = false; this.releaseHands(); }
    this.transitionTick(dt, world, t);
    if (this.state !== 'form2') this.echoFlick = false;
  }
  /** phase2 (45%): 손이 옷자락을 찢어 벌리자 몸이 세로로 갈라져 무너지는 별의 아가리가 열린다 */
  s_phase2(dt, world, t) {
    if (this.at(0.001)) {
      audio.sfx('break_wall', { pitch: 0.45 }); audio.sfx('boss_roar', { pitch: 0.5 });
      impact(world, { shake: 12, time: 0.7, flash: BITE, fa: 0.25 });
      for (const h of this.hands) this.holdHand(h, this.bx + h.side * 60, this.by + 80, -h.side * 1.4, 0.8, 1, 6);
      this.mawT = 0.7;
    }
    if (this.every(0.08, 0, 1.2)) world.fx.emit('magic', this.bx + rand(-40, 40), this.by + rand(20, 160), { color: WHITE, speed: 160 });
    if (this.at(0.8)) for (const h of this.hands) { h.tx = this.bx + h.side * 200; h.k = 3; }
    if (this.at(1.3)) { this.mawT = 0.25; this.releaseHands(); }
    this.transitionTick(dt, world, t);
  }
  /** final (15%): 실루엣이 핵으로 빨려 들어가 흰 불꽃을 두른 검은 태양이 된다 */
  s_final(dt, world, t) {
    if (this.at(0.001)) {
      audio.sfx('boss_roar', { pitch: 0.4 }); audio.sfx('dark', { pitch: 0.4 });
      this.mawT = 1; this.ty = this.hoverY('sun'); this.spd = 60;
      for (const h of this.hands) this.holdHand(h, this.bx + h.side * 150, this.by, -h.side * PI / 2, 1, 0.6, 3);
      darken(this, 0.25, 1.4);
    }
    if (this.formPhase < 3) this.implode = clamp(t / 1.1, 0, 1);
    if (this.every(0.05, 0, 1.1)) { const a = rand(0, TAU), r = rand(160, 300); world.fx.emit('magic', this.bx + Math.cos(a) * r, this.by + Math.sin(a) * r, { color: WHITE, speed: 420, angle: a + PI, spread: 0.05 }); }
    if (this.at(1.7)) this.releaseHands();
    this.transitionTick(dt, world, t);
  }
  applyPhase(k, world = this.world) {
    if (k === 1) this.glitchT = Math.max(this.glitchT, 0.6);
    if (k === 2) this.mawT = Math.max(this.mawT, 0.25);
    if (k === 3) this.enterSun(world);
  }
  afterTransition(k, world = this.world) {
    if (k === 3) this.finalGift(world);
  }
  enterSun(world) {
    wallsOpen(this, 200);
    // P3 의 20초 주기 collapse 가 대기열에 남아 있으면 P4 에서 벽이 다시 조인다 → 버린다 (P4 = lastLight 만, 벽은 열린 채)
    const fi = this.forced.indexOf('collapse');
    if (fi >= 0) this.forced.splice(fi, 1);
    this.wallT = 0; this.collapseCD = 0; this.mawT = 0; this.implode = 1;
    this.setSize(SUN);
    this.ty = this.hoverY('sun');
    if (!world) return;
    const cy = this.by + this.bob;
    impact(world, { shake: 16, time: 0.8, flash: WHITE, fa: 0.7 });
    world.fx?.ring?.(this.bx, cy, { color: WHITE, r0: 30, r1: 520, life: 0.8, width: 12 });
    world.fx?.burst?.('holy', this.bx, cy, 40, { speed: 360 });
    audio.sfx('explode', { pitch: 0.4 }); audio.sfx('holy', { pitch: 0.6 });
  }
  /** 피날레 (MASTER_PLAN §1.14): 필살 게이지 가득 · 1차 전직 이상이면 각성 게이지 가득 · 성광의 오라 20초 · 벽 열기 */
  finalGift(world) {
    if (!world) return;
    wallsOpen(this, 200);
    const run = world.run;
    if (run) {
      run.sp = Math.max(run.sp ?? 0, 100);
      if (world.awEnabled?.()) run.aw = Math.max(run.aw ?? 0, 100);
    }
    const p = world.player;
    if (p && !p.dead) {
      p.buffs ??= {};
      p.buffs.holyaura = Math.max(p.buffs.holyaura ?? 0, 20);
      p.refreshStats?.();
      world.fx?.ring?.(p.cx, p.cy, { color: HOLY, r0: 10, r1: 140, life: 0.6, width: 6 });
      world.fx?.burst?.('holy', p.cx, p.cy, 24, { speed: 220 });
    }
    screenTint(this, { color: DAWN, alpha: 0.07, fade: 1.2 });
    warnText(this, '모든 빛을 모아 — 일격을!', HOLY);
    audio.sfx('powerup'); audio.sfx('bell', { pitch: 0.8, vol: 0.7 });
  }
  onCancel(world = this.world) {
    this.releaseHands();
    for (const h of this.hands) { h.eyeT = 0; h.point = 0; }
    this.echo = null; this.sf = null; this.gr = null; this.mw = null;
    this.mawT = this.formPhase === 2 ? 0.25 : 0;
    this.spd = 115; this.ty = this.hoverY(this.formPhase >= 3 ? 'sun' : 'mid');
    if (world) killTransients(world, this);
  }
  onReset(world = this.world) {
    this.onCancel(world);
    this.setSize(BODY);
    this.tear = 0; this.sunK = 0; this.mawK = 0; this.mawT = 0; this.implode = 0;
    this.glitch = 0; this.glitchT = 0; this.glitchSpike = 0; this.echoA = 0; this.echoKey = null; this.echoFlick = false;
    this.wallT = 0; this.collapseCD = 0; this.llK = 0;
    const A = this.A;
    this.bx = clamp(this.bx, A.x0 + 200, Math.max(A.x0 + 200, A.x1 - 200)); this.tx = this.bx;
    this.by = this.ty = this.hoverY('mid');
    this.bounds();
    for (const h of this.hands) this.resetHand(h);
    for (const h of this.hands) h.curl = 0.35;
    this.place(); this.syncParts();
  }

  // ═════════════════════════════ 사망 (4초: 빛의 금 → 흰 섬광 → 고요 → b_nihil_post) ═════════════════════════════
  onDeath(world) {
    this.dying = 4.0; this.dieT = 0; this.whited = false;
    this.echo = null; this.sf = null; this.gr = null; this.mw = null; this.mawT = 0; this.echoFlick = false;
    for (const h of this.hands) { h.eyeT = 0; h.mode = 'limp'; }
    wallsOpen(this, 220); this.wallT = 0;
    killTransients(world, this);   // 쓰러진 뒤 날아다니던 화염구·파편이 플레이어를 치지 않게 (판정 지대는 BossB.zone 이 스스로 사라진다)
    audio.sfx('ghost', { pitch: 0.25, vol: 1 });
    world.fx.ring(this.bx, this.coreY(), { color: WHITE, r0: 20, r1: 300, life: 0.9, width: 6 });
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    this.animate(dt);
    this.place(); this.syncParts();
    const q = world.fx?.quality ?? 1;
    if (this.dieT < 2.7 && Math.random() < 0.7 * q) {
      const C = TAB.cracks[Math.floor(Math.random() * TAB.cracks.length)], k = clamp(this.dieT / 2.4, 0, 1);
      const j = Math.min(C.length / 2 - 1, Math.max(1, Math.floor(k * (C.length / 2 - 1))));
      const sx = this.sxOf();
      world.fx.emit('holy', this.bx + C[j * 2] * sx, this.by + this.bob + C[j * 2 + 1], { speed: 60, color: WHITE });
    }
    if (!this.whited && this.dieT >= 2.7) {
      this.whited = true;
      world.game?.flash?.('#ffffff', 1, 0.7);
      audio.stopMusic?.(0.05);
      world.camera?.shake?.(6, 0.3);
    }
  }
  render(ctx, world) {
    if (this.dying > 0) {
      // Boss.draw 의 기본 페이드 대신 직접: 2.7초 흰 섬광까지 선명, 그 뒤엔 작은 빛 하나만 사그라든다 (Boss.draw 가 save/restore)
      ctx.globalAlpha = 1;
      if (this.dieT < 2.7) super.render(ctx, world);
      this.drawDeathLight(ctx);
      return;
    }
    super.render(ctx, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    const cy = this.by + this.bob, dk = this.dying > 0 ? (this.dieT < 2.7 ? 1 : 0) : this.introK;
    if (this.sunK > 0.2) {
      // 검은 태양은 검게: 가운데는 어둠만 걷고(가산 색광 없음) 흰 불꽃 테두리에만 색광을 둘러친다
      const k = this.sunK * dk;
      L.add(this.bx, cy, 420, WHITE, 0.9 * k, false);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; L.add(this.bx + Math.cos(a) * 150, cy + Math.sin(a) * 150, 170, i % 2 ? DAWN : WHITE, 0.5 * k); }
    }
    if (this.sunK < 0.9) {
      const k = (1 - this.sunK) * dk;
      L.add(this.bx, cy, 210, VIO, 0.55 * k);
      L.add(this.bx, cy + 130, 320, NEB, 0.3 * k);
      L.add(this.bx, cy, 90, WHITE, 0.35 * k);
    }
    if (this.mawK > 0.15) { const m = this.mawXY(); L.add(m.x, m.y, 170, BITE, 0.7 * this.mawK * dk); }
    for (const h of this.hands) {
      if (h.a < 0.05) continue;
      L.add(h.x, h.y, 120, VIO_L, 0.28 * h.a);
      if (h.eye > 0.1) L.add(h.x, h.y, 100, IRIS, 0.6 * h.eye);
    }
    if (this.echoA > 0.05 && this.echoKey) L.add(this.bx, cy - 40, 280, ECHO[this.echoKey].col, 0.4 * this.echoA);
    if (this.dying > 0 && this.dieT < 2.7) L.add(this.bx, this.coreY(), 120 + this.dieT * 120, WHITE, 0.5 + 0.2 * this.dieT);
  }

  // ═════════════════════════════ 그리기 ═════════════════════════════
  /** 몸 지역 좌표 윤곽점 (두건 · 앞자락 · 해진 밑단 · 뒷자락) — 바닥보다 아래로는 내려가지 않는다 */
  buildRobe() {
    if (this._builtT === this.t) return;
    this._builtT = this.t;
    const P = this._pts, t = this.t, room = this.roomBelow(), g = this.glitch;
    const gb = Math.floor(t * 20);
    let n = 0;
    const push = (x, y, w) => {
      const sw = Math.sin(t * 1.1 + y * 0.012) * 7 * w + Math.sin(t * 2.3 + x * 0.02) * 3 * w;
      const gl = g > 0.3 ? (h01(gb + y * 0.07) - 0.5) * 18 * g : 0;
      P[n * 2] = x + sw + gl; P[n * 2 + 1] = Math.min(y, room); n++;
    };
    for (const [x, y, w] of ROBE_A) push(x, y, w);
    const nh0 = n;
    for (let i = 0; i < HEM_N; i++) {
      const u = (i + 0.5) / HEM_N, x = lerp(236, -248, u) + (h01(i * 1.9) - 0.5) * 26;
      if (i % 2 === 0) {
        // 찢어진 긴 자락: 끝이 비스듬히 잘린 가는 띠
        const extra = i === 4 || i === 8 ? 46 : 0, len = 26 + h01(i * 3.3) * 70 + extra + Math.sin(t * 1.7 + i) * 9;
        const hw = 5 + h01(i * 4.1) * 7, cut = (h01(i * 6.7) - 0.5) * 16;
        push(x + hw, 182 + len + cut, 1.15); push(x - hw, 182 + len - cut, 1.15);
      } else push(x, 182 - h01(i * 2.1) * 26, 1.0);   // 자락 사이 찢어져 올라간 틈
    }
    this._nh = n - nh0;
    for (const [x, y, w] of ROBE_B) push(x, y, w);
    this._n = n;
  }
  /** 윤곽 경로: 두건 끝 · 밑단 톱니는 뾰족하게, 나머지는 부드럽게 */
  traceRobe(ctx) {
    const P = this._pts, n = this._n, nf = this._nf, b0 = nf + this._nh;
    ctx.beginPath();
    ctx.moveTo(P[0], P[1]);
    for (let i = 1; i < nf - 1; i++) ctx.quadraticCurveTo(P[i * 2], P[i * 2 + 1], (P[i * 2] + P[i * 2 + 2]) / 2, (P[i * 2 + 1] + P[i * 2 + 3]) / 2);
    ctx.lineTo(P[(nf - 1) * 2], P[(nf - 1) * 2 + 1]);
    for (let i = nf; i < b0; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]);
    ctx.lineTo(P[b0 * 2], P[b0 * 2 + 1]);
    for (let i = b0 + 1; i < n - 1; i++) ctx.quadraticCurveTo(P[i * 2], P[i * 2 + 1], (P[i * 2] + P[i * 2 + 2]) / 2, (P[i * 2 + 1] + P[i * 2 + 3]) / 2);
    ctx.lineTo(P[(n - 1) * 2], P[(n - 1) * 2 + 1]);
    ctx.closePath();
  }
  paintBack(ctx, world) {
    this.buildRobe();
    if (R.fl) return;
    const cy = this.by + this.bob, a = this.introK;
    glowE(ctx, this.bx, cy + 40, 360, 330, VIO_D, 0.55 * a);
    glowE(ctx, this.bx, cy - 20, 220, 200, NEB, 0.14 * a * (1 - this.sunK));
    this.drawEcho(ctx);
    if (this.sunK < 0.99) {
      ctx.save();
      ctx.translate(this.bx, cy); ctx.scale(this.sxOf(), 1);
      ctx.globalAlpha *= (1 - this.sunK) * a;
      const s = 1 - 0.85 * this.implode;
      if (s !== 1) ctx.scale(s, s);
      this.drawHalo(ctx);
      this.drawTendrils(ctx, world?.fx?.quality ?? 1);
      ctx.restore();
    }
  }
  paintBody(ctx, world, flash) {
    const q = world?.fx?.quality ?? 1, cy = this.by + this.bob;
    const robeA = (1 - this.sunK) * this.introK, sx = this.sxOf();
    if (flash) {
      // 피격 섬광: 맞은 부위만 (거대한 실루엣 전체가 하얘지면 눈이 아프다)
      const lh = this._lastHit;
      if (lh === 'h0' || lh === 'h1') { this.drawHand(ctx, this.hands[lh === 'h0' ? 0 : 1]); return; }
      ctx.save(); ctx.translate(this.bx, cy); ctx.scale(sx, 1);
      if (this.sunK > 0.5) this.drawSun(ctx, q);
      else if (lh === 'shroud' && robeA > 0.3) { ctx.globalAlpha *= 0.3; this.traceRobe(ctx); ctx.fillStyle = '#ffffff'; ctx.fill(); }
      else if (this.mawK > 0.55) glow(ctx, 0, MAW_Y, 40, WHITE, 1);
      else this.drawMask(ctx);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(this.bx, cy); ctx.scale(sx, 1);
    if (robeA > 0.01) {
      ctx.save();
      ctx.globalAlpha *= robeA;
      const s = 1 - 0.85 * this.implode;
      if (s !== 1) ctx.scale(s, s);
      this.drawRobe(ctx, q);
      this.drawHood(ctx);
      this.drawMaw(ctx, q);
      this.drawMask(ctx);
      ctx.restore();
    }
    if (this.sunK > 0.01) this.drawSun(ctx, q);
    ctx.restore();
    for (const h of this.hands) this.drawHand(ctx, h);
  }
  paintFront(ctx) {
    if (this.dying > 0 && this.dieT < 2.7) this.drawCracks(ctx);
  }

  // ── 몸 ──
  drawRobe(ctx, q) {
    const t = this.t;
    this.traceRobe(ctx);
    ctx.fillStyle = VOID; ctx.fill();
    ctx.save(); ctx.clip();
    const st = ART?.stars;
    if (st?.pat) {
      const cam = this.world?.camera, S = st.S;
      const ox = (((cam?.x ?? 0) * 0.18 + t * 7) % S + S) % S, oy = ((t * 3) % S + S) % S;
      ctx.save(); ctx.translate(-ox, -oy); ctx.fillStyle = st.pat; ctx.fillRect(-300 + ox, -320 + oy, 620, 660); ctx.restore();
    }
    glowE(ctx, 0, 90, 200, 190, NEB, 0.22);
    glowE(ctx, -60, -40, 120, 140, PM, 0.08);
    glowE(ctx, 70, 120, 110, 120, PC, 0.07);
    this.drawPressed(ctx);
    if (q >= 0.5) this.drawRibs(ctx);
    this.drawSpotEyes(ctx, q);
    ctx.restore();
    // 프리즘 윤곽 (현실에서 도려낸 자리)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
    const ga = ctx.globalAlpha, fl = 0.75 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
    for (const [c, dx, a, lw] of q >= 0.7 ? PRISM_HI : PRISM_LO) {
      ctx.globalAlpha = ga * a * fl;
      ctx.translate(dx, 0);
      this.traceRobe(ctx);
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.stroke();
      ctx.translate(-dx, 0);
    }
    ctx.restore();
  }
  /** 별밤 막 안쪽에서 밀려 나오는 흐릿한 얼굴들 (쓰러뜨린 자들) — 숨 쉬듯 떠올랐다 가라앉는다 */
  drawPressed(ctx) {
    const S = ART?.mask;
    if (!S) return;
    const t = this.t, room = this.roomBelow(), ga = ctx.globalAlpha, k = this.formPhase >= 1 ? 1.5 : 1;
    for (let i = 0; i < PRESSED.length; i++) {
      const [x, y, sc, fi] = PRESSED[i];
      if (y + 60 * sc > room) continue;
      const a = (0.09 + 0.07 * Math.sin(t * 0.9 + i * 2.1)) * k, sw = Math.sin(t * 0.6 + i) * 0.12;
      ctx.globalAlpha = ga * a;
      put(ctx, S, x, y, sw, sc * (1 + 0.05 * Math.sin(t * 1.3 + i)), sc);
      const F = ART.faces?.[fi];
      if (F) { ctx.globalAlpha = ga * a * 1.2; put(ctx, F, x, y, sw, sc, sc); }
    }
    ctx.globalAlpha = ga;
  }
  drawRibs(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = VIO_L;
    const ga = ctx.globalAlpha;
    for (let i = 0; i < 5; i++) {
      const y = 62 + i * 24, w = 80 - i * 7, pulse = 0.5 + 0.5 * Math.sin(this.t * 1.6 - i * 0.7);
      ctx.globalAlpha = ga * (0.1 + 0.1 * pulse); ctx.lineWidth = 5 - i * 0.5;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 6, y - 8); ctx.quadraticCurveTo(s * w, y - 12, s * (w - 12), y + 22); ctx.stroke(); }
    }
    ctx.globalAlpha = ga * 0.14; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, 54); ctx.lineTo(0, Math.min(190, this.roomBelow())); ctx.stroke();
    ctx.restore();
  }
  /** 별밤 속에서 하나씩 뜨는 눈 — 피해가 쌓일수록 많아진다 */
  drawSpotEyes(ctx, q) {
    const E = TAB?.eyes;
    if (!E) return;
    const dmg = clamp((1 - this.hp / Math.max(1, this.stats.maxHp)) * 1.35 + (this.formPhase >= 1 ? 0.1 : 0), 0, 1);
    const n = Math.min(E.length, Math.floor(dmg * E.length), q >= 0.7 ? 99 : 12);
    if (n <= 0) return;
    const t = this.t, lx = this.look * Math.sign(this.sxOf()), room = this.roomBelow();
    for (let i = 0; i < n; i++) {
      const e = E[i];
      if (e.y > room - 6) continue;
      const bl = clamp(Math.sin(t * 0.9 + e.ph) * 4 + 3, 0, 1);
      if (bl < 0.05) continue;
      const w = 7 * e.s, hh = 3.6 * e.s * bl, ix = e.x + lx * w * 0.35;
      ctx.fillStyle = '#efe6ff';
      ctx.beginPath(); ctx.moveTo(e.x - w, e.y); ctx.quadraticCurveTo(e.x, e.y - hh * 2, e.x + w, e.y); ctx.quadraticCurveTo(e.x, e.y + hh * 2, e.x - w, e.y); ctx.fill();
      ctx.fillStyle = VIO; ctx.beginPath(); ctx.arc(ix, e.y, 2.4 * e.s * Math.min(1, bl * 1.5), 0, TAU); ctx.fill();
      ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(ix, e.y, e.s, 0, TAU); ctx.fill();
    }
  }
  /** 두건 속 깊은 어둠 (가면 뒤) */
  drawHood(ctx) {
    if (R.fl) return;
    ctx.save();
    ctx.translate(4, -6); ctx.scale(1, 1.32);
    ctx.fillStyle = RG(ctx, 'nHood', 0, 0, 10, 0, 0, 88, [0, 'rgba(0,0,0,1)', 0.62, 'rgba(0,0,0,0.92)', 1, 'rgba(0,0,0,0)']);
    ctx.beginPath(); ctx.arc(0, 0, 88, 0, TAU); ctx.fill();
    ctx.restore();
    glowE(ctx, 0, -8, 80, 98, VIO, 0.18);
    // 두건 테두리 주름 (얼굴을 감싸는 겹)
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(220,200,255,0.2)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(6, -14, 98, 124, 0.05, -2.75, 0.75); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,120,255,0.12)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(10, -8, 108, 134, 0.05, -2.5, 0.4); ctx.stroke();
    ctx.restore();
  }
  /** 이 빠진 별빛 후광 (P3 에는 흩어진다) */
  drawHalo(ctx) {
    const t = this.t, n = 22, cx = -16, cy = -118, r0 = 168, br = this.tear;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.12 * (1 - br); ctx.strokeStyle = VIO_L; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = ga;
    const gb = Math.floor(t * 12);
    for (let i = 0; i < n; i++) {
      if (i % 6 === 4) continue;
      const a = (i / n) * TAU + t * 0.07, r = r0 + br * (30 + h01(i) * 70), fk = this.glitch > 0.3 ? h01(gb + i) : 1;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      glow(ctx, x, y, 9, STARC, 0.55 * fk); glow(ctx, x, y, 3, WHITE, 0.9 * fk, true);
    }
    ctx.restore();
  }
  /** 밑단에 매달린 공허의 촉수 · 두건 뒤로 흩날리는 끈 */
  drawTendrils(ctx, q) {
    const t = this.t, room = this.roomBelow();
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const x0 = lerp(190, -210, i / 6), y0 = 150;
      const len = Math.min(120 + h01(i * 3.1) * 90, room - y0 + 20);
      if (len < 20) continue;
      const sw = Math.sin(t * 1.3 + i * 1.1) * 26;
      const cx = x0 + sw * 0.5 - 20, cy2 = y0 + len * 0.55, ex = x0 + sw - 30, ey = y0 + len;
      for (const [lw, u] of [[12, 0.4], [7, 0.7], [3, 1]]) {
        ctx.strokeStyle = VOID; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(lerp(x0, cx, u), lerp(y0, cy2, u), lerp(x0, ex, u), lerp(y0, ey, u)); ctx.stroke();
      }
      if (q >= 0.7) { ctx.strokeStyle = rgba(i % 2 ? PM : PC, 0.35); ctx.lineWidth = 1; ctx.stroke(); }
    }
    for (let i = 0; i < 3; i++) {
      const x0 = -80 - i * 14, y0 = -172 + i * 30, len = 120 + i * 20;
      const w1 = Math.sin(t * 1.6 + i) * 18, w2 = Math.sin(t * 2.1 + i * 1.7) * 24;
      ctx.strokeStyle = VOID; ctx.lineWidth = 8 - i * 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 - len * 0.35, y0 + w1, x0 - len * 0.7, y0 + w2, x0 - len, y0 + w1 + 20); ctx.stroke();
      if (q >= 0.7) { ctx.strokeStyle = rgba(PC, 0.3); ctx.lineWidth = 1; ctx.stroke(); }
    }
    ctx.restore();
  }
  /** P3 (또는 maw): 세로로 찢어진 아가리 — 별 조각 이빨 · 강착원반 · 무너지는 별 · 특이점 */
  drawMaw(ctx, q) {
    const open = Math.max(this.tear * 0.28, this.mawK);
    if (open < 0.02) return;
    const t = this.t, y0 = -34, y1 = Math.min(206, this.roomBelow() - 6);
    if (y1 - y0 < 60) return;
    const Lp = this._ml, Rp = this._mr, N = 16;
    for (let i = 0; i <= N; i++) {
      const u = i / N, y = lerp(y0, y1, u);
      const w = Math.pow(Math.sin(PI * u), 0.8) * (22 + 86 * open) * (1 + 0.25 * Math.sin(PI * Math.min(1, u * 1.6)));
      const j = (h01(i * 7.7) - 0.5) * 10 * open + Math.sin(t * 3 + i) * 2 * open;
      Lp[i * 2] = -w + j; Lp[i * 2 + 1] = y; Rp[i * 2] = w + j * 0.8; Rp[i * 2 + 1] = y;
    }
    ctx.beginPath();
    ctx.moveTo(Lp[0], Lp[1]);
    for (let i = 1; i <= N; i++) ctx.lineTo(Lp[i * 2], Lp[i * 2 + 1]);
    for (let i = N; i >= 0; i--) ctx.lineTo(Rp[i * 2], Rp[i * 2 + 1]);
    ctx.closePath();
    ctx.fillStyle = R.fl ? '#ffffff' : '#000000'; ctx.fill();
    if (R.fl) return;
    ctx.save(); ctx.clip();
    const S = ART?.maw, sc = 0.45 + 0.6 * open;
    if (S) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; put(ctx, S, 0, MAW_Y, Math.sin(t * 0.4) * 0.15, sc, sc); ctx.restore(); }
    const nS = q >= 0.7 ? 18 : 8;
    for (let i = 0; i < nS; i++) {
      const u = (t * 0.45 + i / nS) % 1, r = (1 - u) * (150 * open + 30), a = i * 2.39996 + t * 2.2 + u * 4;
      glow(ctx, Math.cos(a) * r, MAW_Y + Math.sin(a) * r * 0.42, 3 + u * 5, u > 0.7 ? WHITE : VIO_L, 0.4 + 0.5 * u, u > 0.8);
    }
    const pk = 0.8 + 0.2 * Math.sin(t * 9);
    glow(ctx, 0, MAW_Y, (40 + 60 * open) * pk, BITE, 0.55 * open + 0.2);
    glow(ctx, 0, MAW_Y, (18 + 16 * open) * pk, WHITE, 0.9, true);
    ctx.restore();
    ctx.lineJoin = 'round';
    for (const [E, s] of [[Lp, 1], [Rp, -1]]) {
      for (let i = 1; i < N; i++) {
        // 별 조각 이빨: 가장자리에서 안쪽(아래로 휜)으로, 길이 제각각 · 가끔 겹니
        const x = E[i * 2], y = E[i * 2 + 1], hv = h01(i * 3 + (s > 0 ? 1 : 2)), len = (12 + hv * 24) * (0.4 + 0.6 * open);
        const bw = 6 + hv * 3;
        ctx.beginPath(); ctx.moveTo(x - s * 2, y - bw); ctx.quadraticCurveTo(x + s * len * 0.6, y - 2, x + s * len, y + 4 + hv * 6); ctx.lineTo(x - s * 2, y + bw); ctx.closePath();
        ctx.fillStyle = hv > 0.7 ? '#fff6e0' : '#e6deff'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
        if (hv > 0.55 && i % 2) { ctx.beginPath(); ctx.moveTo(x - s * 4, y - 3); ctx.lineTo(x + s * len * 0.55, y + 8); ctx.lineTo(x - s * 4, y + 9); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
    }
    if (q >= 0.7) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2;
      for (const [E, c] of [[Lp, PM], [Rp, PC]]) {
        ctx.strokeStyle = rgba(c, 0.5); ctx.beginPath(); ctx.moveTo(E[0], E[1]);
        for (let i = 1; i <= N; i++) ctx.lineTo(E[i * 2], E[i * 2 + 1]);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  /** 도자기 가면: P2 일그러짐(조각 밀림 · 색 번짐) · P3 두 쪽으로 갈라짐 · 스치는 얼굴 · 별빛 눈동자 */
  drawMask(ctx) {
    const S = ART?.mask;
    const open = this.formPhase >= 2 || this.mawK > 0.05 ? Math.max(this.tear, this.mawK) : 0;
    ctx.save();
    ctx.rotate(this.tilt);
    ctx.scale(1.18, 1.18);
    if (!S) {
      ctx.fillStyle = R.fl ? '#ffffff' : PORC; ctx.beginPath(); ctx.ellipse(0, 0, 46, 66, 0, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    const img = R.fl ? S.f : S.c, K = img.width / S.w;
    if (open > 0.02) {
      const d = 6 + 44 * open;
      ctx.save(); ctx.translate(-d, 2); ctx.rotate(-0.1 * open);
      ctx.drawImage(img, 0, 0, S.ox * K, S.h * K, -S.ox, -S.oy, S.ox, S.h); ctx.restore();
      ctx.save(); ctx.translate(d, -2); ctx.rotate(0.1 * open);
      ctx.drawImage(img, S.ox * K, 0, (S.w - S.ox) * K, S.h * K, 0, -S.oy, S.w - S.ox, S.h); ctx.restore();
      if (!R.fl) {
        ctx.strokeStyle = INK; ctx.lineWidth = 2;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          for (let k = 0; k <= 8; k++) { const y = -66 + k * 16.75, x = s * d + (k % 2 ? 3 : -3) * s; if (k) ctx.lineTo(x, y + s * 2); else ctx.moveTo(x, y + s * 2); }
          ctx.stroke();
        }
      }
    } else if (this.glitch > 0.05 && !R.fl) {
      const n = 5, sh = S.h / n, gb = Math.floor(this.t * 24);
      for (let i = 0; i < n; i++) {
        const off = (h01(gb * 3.7 + i * 1.3) - 0.5) * 16 * this.glitch;
        ctx.drawImage(img, 0, i * sh * K, S.w * K, sh * K, -S.ox + off, -S.oy + i * sh, S.w, sh + 0.5);
      }
      if (this.glitch > 0.35 && ART.maskM) {
        ctx.save(); ctx.globalAlpha *= 0.35 * this.glitch;
        put(ctx, ART.maskM, -4, 0); put(ctx, ART.maskC, 4, 0);
        ctx.restore();
      }
    } else put(ctx, S, 0, 0);
    if (!R.fl && this.faceA > 0.02 && open < 0.3) {
      const F = ART.faces?.[this.faceIdx];
      if (F) { ctx.save(); ctx.globalAlpha *= this.faceA; put(ctx, F, 0, 0); ctx.restore(); }
    }
    if (!R.fl) {
      const lx = this.look * Math.sign(this.sxOf()), k = this.introK;
      for (const s of [-1, 1]) {
        const x = s * 18 + (open > 0.02 ? s * (6 + 44 * open) : 0) + lx * 4, y = -8 + this.lookY * 3;
        glow(ctx, x, y, 16, VIO_L, 0.7 * k); glow(ctx, x, y, 6, WHITE, 0.9 * k, true);
      }
    }
    ctx.restore();
  }
  /** P4: 흰 불꽃을 두른 검은 태양 (앞에 부서진 가면 한 쪽이 떠 있다) */
  drawSun(ctx, q) {
    const k = this.sunK, t = this.t, r = 84 * (0.35 + 0.65 * k);
    if (!R.fl) {
      const S = ART?.corona;
      ctx.save();
      ctx.globalAlpha *= k; ctx.globalCompositeOperation = 'lighter';
      if (S) {
        put(ctx, S, 0, 0, t * 0.12, 1.02 + 0.05 * Math.sin(t * 3.1));
        if (q >= 0.7) put(ctx, S, 0, 0, 1 - t * 0.19, 0.86 + 0.06 * Math.sin(t * 4.3 + 1));
      }
      glow(ctx, 0, 0, r * 3.2, DAWN, 0.35);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha *= Math.max(k, 0.01);
    ctx.fillStyle = R.fl ? '#ffffff' : '#000000';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    if (!R.fl) {
      ctx.strokeStyle = 'rgba(255,246,200,0.45)'; ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3.5; ctx.stroke();
      glowE(ctx, 0, 0, r * 0.8, r * 0.8, VIO_D, 0.5);
      const S = ART?.mask;
      if (S) {
        ctx.save();
        ctx.globalAlpha *= 0.55; ctx.translate(-10 + Math.sin(t * 0.8) * 4, 6 + Math.sin(t * 1.1) * 3); ctx.rotate(-0.35 + Math.sin(t * 0.6) * 0.05); ctx.scale(0.72, 0.72);
        ctx.drawImage(S.c, 0, 0, S.ox * (S.c.width / S.w), S.c.height, -S.ox, -S.oy, S.ox, S.h);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.82, -0.6 + t * 0.3, 0.3 + t * 0.3); ctx.stroke();
      // 마지막 눈: 검은 원반 가운데 세로로 찢어진 흰 눈이 플레이어를 본다
      const lx = this.look * Math.sign(this.sxOf()), ly = this.lookY, ew = r * 0.22, eh = r * 0.62 * (0.85 + 0.15 * Math.sin(t * 2.3));
      ctx.save();
      ctx.beginPath(); ctx.moveTo(0, -eh); ctx.quadraticCurveTo(ew * 2, 0, 0, eh); ctx.quadraticCurveTo(-ew * 2, 0, 0, -eh); ctx.closePath();
      ctx.fillStyle = '#fff8e8'; ctx.fill();
      ctx.clip();
      glow(ctx, lx * ew * 0.5, ly * eh * 0.25, ew * 2.2, IRIS, 0.9);
      ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.ellipse(lx * ew * 0.5, ly * eh * 0.25, ew * 0.35, eh * 0.55, 0, 0, TAU); ctx.fill();
      ctx.restore();
      glow(ctx, 0, 0, eh * 1.4, DAWN, 0.25);
    }
    ctx.restore();
    // 홍염: 테두리에서 솟았다 떨어지는 흰 불꽃 고리
    if (!R.fl && k > 0.3) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (let i = 0; i < (q >= 0.7 ? 4 : 2); i++) {
        const a = i * 1.7 + t * 0.21, life = (t * 0.35 + i * 0.27) % 1, hgt = r * (0.35 + 0.9 * Math.sin(PI * life));
        const c = Math.cos(a), sn = Math.sin(a), c2 = Math.cos(a + 0.5), s2 = Math.sin(a + 0.5), am = a + 0.25;
        ctx.strokeStyle = rgba(i % 2 ? DAWN : WHITE, 0.55 * k * Math.sin(PI * life)); ctx.lineWidth = 3 + 3 * (1 - life);
        ctx.beginPath(); ctx.moveTo(c * r, sn * r); ctx.quadraticCurveTo(Math.cos(am) * (r + hgt * 1.6), Math.sin(am) * (r + hgt * 1.6), c2 * r, s2 * r); ctx.stroke();
      }
      ctx.restore();
    }
  }
  /** P2 메아리: 쓰러뜨린 보스의 그림자가 몸 뒤에 겹친다 (form2 전환 중에는 넷이 번갈아) */
  drawEcho(ctx) {
    const key = this.echoFlick ? ECHO_KEYS[Math.floor(this.t * 7) % 4] : this.echoKey;
    const a = this.echoFlick ? 0.55 : this.echoA;
    if (!key || a < 0.02 || R.fl) return;
    const S = ART?.echo?.[key];
    if (!S) return;
    const cy = this.by + this.bob, jit = this.glitch > 0.3 ? (h01(Math.floor(this.t * 18)) - 0.5) * 10 : 0;
    const sc = 1.25 + 0.03 * Math.sin(this.t * 2);
    ctx.save();
    ctx.globalAlpha *= a * 0.62;
    put(ctx, S, this.bx + jit, cy - 30, 0, sc * (this.face >= 0 ? 1 : -1), sc);
    ctx.restore();
    glowE(ctx, this.bx, cy - 20, 300, 260, ECHO[key].col, 0.22 * a);
  }

  // ── 손 ──
  drawHand(ctx, h) {
    if (h.a <= 0.01) return;
    const fl = R.fl, F = this.A.floor;
    ctx.save();
    if (h.y + 260 > F) { ctx.beginPath(); ctx.rect(h.x - 400, h.y - 400, 800, Math.max(0, F + 3 - (h.y - 400))); ctx.clip(); }   // 땅에 박힌 손끝은 바닥 아래로 사라진다
    ctx.translate(h.x, h.y); ctx.rotate(h.rot); ctx.scale(-h.side * h.s, h.s);
    if (h.a < 1) ctx.globalAlpha *= h.a;
    if (!fl) this.drawWrist(ctx, h);
    palmPath(ctx);
    ctx.fillStyle = fl ? '#ffffff' : LG(ctx, 'nPalm', -50, -52, 44, 62, [0, PORC_L, 0.45, PORC, 0.85, PORC_M, 1, PORC_D]);
    ctx.fill();
    if (!fl) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke();
      this.drawPalmDetail(ctx, h);
    }
    for (const f of FINGERS) this.drawFinger(ctx, h, f);
    this.drawPalmEye(ctx, h);
    if (!fl && this.sunK > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      palmPath(ctx); ctx.strokeStyle = rgba(WHITE, 0.5 * this.sunK); ctx.lineWidth = 3; ctx.stroke();
      glow(ctx, 0, 0, 70, DAWN, 0.25 * this.sunK);
    }
    ctx.restore();
  }
  drawWrist(ctx, h) {
    const t = this.t;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const x0 = -24 + i * 16, y0 = 54, sw = Math.sin(t * 2.2 + i * 1.4 + h.i) * 16, len = 70 + (i % 2) * 30;
      ctx.strokeStyle = VOID; ctx.lineWidth = 12 - i * 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + sw, y0 + len * 0.5, x0 - sw * 0.6, y0 + len); ctx.stroke();
      ctx.strokeStyle = rgba(i % 2 ? PM : PC, 0.35); ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.fillStyle = VOID; ctx.beginPath(); ctx.ellipse(1, 57, 30, 10, 0, 0, TAU); ctx.fill();
    glowE(ctx, 1, 58, 34, 12, VIO, 0.3);
    ctx.restore();
  }
  drawPalmDetail(ctx, h) {
    ctx.save();
    palmPath(ctx); ctx.clip();
    ctx.strokeStyle = 'rgba(70,50,95,0.6)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(34, -30); ctx.quadraticCurveTo(10, -6, 18, 40);
    ctx.moveTo(-38, -18); ctx.quadraticCurveTo(0, -30, 30, -26);
    ctx.moveTo(-40, 4); ctx.quadraticCurveTo(-4, -4, 20, 8);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 3;
    for (const fx of [-28, -8, 12, 30]) { ctx.beginPath(); ctx.moveTo(fx * 0.4, 56); ctx.quadraticCurveTo(fx * 0.8, 10, fx, -44); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 3 + h.i);
    ctx.beginPath();
    ctx.moveTo(-46, 20); ctx.lineTo(-30, 26); ctx.lineTo(-24, 40); ctx.lineTo(-12, 46); ctx.moveTo(-30, 26); ctx.lineTo(-20, 16);
    ctx.moveTo(42, -42); ctx.lineTo(28, -30); ctx.lineTo(31, -17); ctx.lineTo(24, -8);
    ctx.strokeStyle = rgba(VIO_L, 0.7 * pulse); ctx.lineWidth = 2.4; ctx.stroke();
    ctx.strokeStyle = rgba(WHITE, 0.85 * pulse); ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();
  }
  /** 손가락: 마디마다 둥근 끝 선을 겹쳐 그려 이어진 살덩이처럼 (외곽 → 그늘 → 살 → 빛) · 마디 주름 · 흑요석 손톱 */
  drawFinger(ctx, h, f) {
    const curl = f.thumb ? h.curl * 0.6 : h.point > 0.5 ? (f.i === 3 ? 0.04 : 0.95) : h.curl;
    const a = f.a * (0.55 + 0.45 * h.spread), da = Math.sin(a), dc = -Math.cos(a), nx = -dc, ny = da;
    const tw0 = h.mode === 'float' ? 1 : 0.25, n = f.L.length, P = this._fp;
    let x = f.b[0], y = f.b[1], lastL = 1;
    P[0] = x; P[1] = y;
    for (let k = 0; k < n; k++) {
      const th = CURL[k] * curl * (f.thumb ? 0.8 : 1);
      const L = f.L[k] * Math.cos(th), side = f.L[k] * Math.sin(th) * 0.18 * (f.thumb ? -1 : 1);
      const tw = Math.sin(this.t * 7 + f.i * 1.3 + k) * 0.6 * tw0;
      x += da * L + nx * (side + tw); y += dc * L + ny * (side + tw);
      P[(k + 1) * 2] = x; P[(k + 1) * 2 + 1] = y; lastL = L;
    }
    const fl = R.fl, q = this.world?.fx?.quality ?? 1;
    const passes = fl ? FPASS_FL : q >= 0.7 ? FPASS_HI : FPASS_LO;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [col, wk, off] of passes) {
      ctx.strokeStyle = col;
      for (let k = 0; k < n; k++) {
        const r = f.r * (1 - (k + 0.5) * 0.16), o = off * r;
        ctx.lineWidth = Math.max(1, r * 2 * wk + (wk > 1 ? 2.5 : 0));
        ctx.beginPath(); ctx.moveTo(P[k * 2] - nx * o, P[k * 2 + 1] - ny * o); ctx.lineTo(P[k * 2 + 2] - nx * o, P[k * 2 + 3] - ny * o); ctx.stroke();
      }
    }
    if (!fl) {
      ctx.strokeStyle = 'rgba(70,46,92,0.7)'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (let k = 1; k < n; k++) {
        const r = f.r * (1 - k * 0.16), jx = P[k * 2], jy = P[k * 2 + 1];
        for (const d of [-2.5, 1.5]) { ctx.moveTo(jx - nx * r * 0.75 + da * d, jy - ny * r * 0.75 + dc * d); ctx.quadraticCurveTo(jx + da * (d + 2), jy + dc * (d + 2), jx + nx * r * 0.75 + da * d, jy + ny * r * 0.75 + dc * d); }
      }
      ctx.stroke();
    }
    const r1 = f.r * (1 - n * 0.16), sg = lastL < 0 ? -1 : 1, dx = da * sg, dy = dc * sg, nl = f.thumb ? 16 : 21, w = r1 * 0.95;
    x = P[n * 2]; y = P[n * 2 + 1];
    ctx.beginPath(); ctx.moveTo(x - dy * w, y + dx * w); ctx.quadraticCurveTo(x + dx * nl * 0.6 - dy * w * 0.5, y + dy * nl * 0.6 + dx * w * 0.5, x + dx * nl, y + dy * nl); ctx.lineTo(x + dy * w, y - dx * w); ctx.closePath();
    ctx.fillStyle = fl ? '#ffffff' : NAIL; ctx.fill();
    if (!fl) { ctx.strokeStyle = 'rgba(180,140,255,0.55)'; ctx.lineWidth = 1; ctx.stroke(); }
  }
  drawPalmEye(ctx, h) {
    const o = h.eye, cx = 0, cy = 4, hw = 27, fl = R.fl;
    if (o < 0.06) {
      ctx.strokeStyle = fl ? '#ffffff' : '#3a0a24'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(cx - hw, cy); ctx.quadraticCurveTo(cx, cy + 7, cx + hw, cy); ctx.stroke();
      if (!fl) {
        ctx.lineWidth = 1.4; ctx.beginPath();
        for (let i = -2; i <= 2; i++) { const x = cx + i * 9, y = cy + 3.5 - Math.abs(i) * 0.8; ctx.moveTo(x - 2, y - 5); ctx.lineTo(x + 2, y + 5); }
        ctx.stroke();
        glow(ctx, cx, cy + 2, 26, IRIS, 0.12 + 0.08 * Math.sin(this.t * 4 + h.i));
      }
      return;
    }
    const hh = 16 * o;
    const path = () => { ctx.beginPath(); ctx.moveTo(cx - hw, cy); ctx.quadraticCurveTo(cx, cy - hh * 2, cx + hw, cy); ctx.quadraticCurveTo(cx, cy + hh * 2, cx - hw, cy); ctx.closePath(); };
    path(); ctx.fillStyle = fl ? '#ffffff' : '#2a0010'; ctx.fill();
    if (fl) return;
    const L = this.localLook(h);
    ctx.save(); path(); ctx.clip();
    put(ctx, ART?.eye, cx + L.x * 8, cy + L.y * 5 * o, 0, 0.82);
    ctx.restore();
    path(); ctx.strokeStyle = '#5a0a2a'; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,190,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const u = (i + 0.5) / 7, x = cx - hw + u * hw * 2, y = cy - 4 * hh * u * (1 - u);
      ctx.moveTo(x, y); ctx.lineTo(x + (u - 0.5) * 6, y - 5 - 3 * o);
    }
    ctx.stroke();
    glow(ctx, cx, cy, 46, IRIS, 0.35 * o);
  }

  // ── 사망 ──
  drawCracks(ctx) {
    const k = clamp(this.dieT / 2.4, 0, 1);
    if (k <= 0 || !TAB) return;
    ctx.save();
    ctx.translate(this.bx, this.coreY()); ctx.scale(this.sxOf(), 1);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const C of TAB.cracks) {
      const segs = C.length / 2 - 1, m = k * segs, full = Math.floor(m), fr = m - full;
      ctx.beginPath(); ctx.moveTo(C[0], C[1]);
      for (let j = 1; j <= full; j++) ctx.lineTo(C[j * 2], C[j * 2 + 1]);
      if (full < segs) ctx.lineTo(lerp(C[full * 2], C[full * 2 + 2], fr), lerp(C[full * 2 + 1], C[full * 2 + 3], fr));
      ctx.strokeStyle = 'rgba(255,246,220,0.35)'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.2; ctx.stroke();
    }
    glow(ctx, 0, 0, 60 + k * 160, WHITE, 0.4 + 0.5 * k, true);
    ctx.restore();
  }
  drawDeathLight(ctx) {
    if (R.fl || this.dieT < 2.7) return;
    const u = clamp((this.dieT - 2.7) / 1.3, 0, 1), x = this.bx, y = this.coreY() - u * 20;
    glow(ctx, x, y, 70 * (1 - u) + 6, WHITE, 1 - u, true);
    glow(ctx, x, y, 160 * (1 - u), DAWN, 0.5 * (1 - u));
  }
}

// ───────────────────────── 손바닥 · 공격 그림 ─────────────────────────
function palmPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-34, -44);
  ctx.quadraticCurveTo(-4, -56, 34, -48);
  ctx.quadraticCurveTo(44, -26, 40, 0);
  ctx.quadraticCurveTo(46, 28, 26, 52);
  ctx.quadraticCurveTo(0, 64, -24, 56);
  ctx.quadraticCurveTo(-42, 24, -40, -8);
  ctx.quadraticCurveTo(-40, -30, -34, -44);
  ctx.closePath();
}
/** lighting.js 의 색광 스프라이트 캐시(모듈 내부)를 채운다: 어둠 0 · 세기 0 광원만 든 가짜 조명으로 render 를 한 번 돌려
 *  glowSprite(색) 만 부르게 한다. ctx 는 아무것도 그리지 않는 빈 객체. 업데이트/그리기 순서와 상관없이 등장 때 끝난다 */
const NOCTX = { save() {}, restore() {}, drawImage() {}, fillRect() {} };
function prewarmLights(L) {
  const render = L?.render;
  if (typeof render !== 'function') return;
  const lights = LIGHT_COLS.map((color) => ({ x: 8, y: 8, r: 4, color, i: 0, glow: true }));
  try { render.call({ enabled: true, darkness: 0, lightning: 0, res: 0.5, canvas: { width: 8, height: 8 }, lctx: null, lights }, NOCTX, { x: 0, y: 0, shakeX: 0, shakeY: 0, zoom: 1 }, 16, 16); } catch { /* 조명 구현이 바뀌면 조용히 건너뜀 */ }
}
function sparkle(ctx, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * 0.18, -s * 0.18); ctx.lineTo(s, 0); ctx.lineTo(s * 0.18, s * 0.18);
  ctx.lineTo(0, s); ctx.lineTo(-s * 0.18, s * 0.18); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.18, -s * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
/** 별비: 예고 동안 하늘에서 별이 떨어져 내려온다 */
function paintStar(ctx, z, w, x, y) {
  if (!z.started) {
    warnCircle(ctx, x, y, 40, z.k, STARC, w.time);
    const top = (w.camera?.y ?? y - 600) - 80, k = z.k, yy = lerp(top, y, k * k), xx = x + (1 - k) * 90;
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(VIO_L, 0.25 + 0.35 * k); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(xx + 50, yy - 160); ctx.lineTo(xx, yy); ctx.stroke();
    ctx.strokeStyle = rgba(WHITE, 0.6 + 0.3 * k); ctx.lineWidth = 1.6; ctx.stroke();
    glow(ctx, xx, yy, 26 + 10 * k, VIO_L, 0.7); glow(ctx, xx, yy, 10, WHITE, 1, true);
    sparkle(ctx, xx, yy, 14 + 6 * k, w.time * 4);
    return;
  }
  const f = 1 - z.a;
  glow(ctx, x, y, 90, STARC, 0.9 * f, true);
  glow(ctx, x, y, 150, VIO, 0.5 * f);
}
/** erase: 띠가 지워진 자리 = 검은 공허 + 흰 잡음 + 색 번짐 */
function paintErase(ctx, z, w) {
  const t = w.time;
  if (!z.started) {
    warnRect(ctx, z.x, z.y, z.w, z.h, z.k * 0.9, ERASE, t);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(ERASE, 0.1 + 0.15 * z.k);
    for (let y = z.y + 4; y < z.y + z.h; y += 7) ctx.fillRect(z.x, y, z.w, 1);
    return;
  }
  const f = 1 - z.a;
  ctx.fillStyle = `rgba(0,0,0,${(0.9 * f).toFixed(3)})`; ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(WHITE, 0.9 * f); ctx.fillRect(z.x, z.y - 2, z.w, 3); ctx.fillRect(z.x, z.y + z.h - 1, z.w, 3);
  ctx.fillStyle = rgba(PM, 0.55 * f); ctx.fillRect(z.x, z.y - 6, z.w, 2);
  ctx.fillStyle = rgba(PC, 0.55 * f); ctx.fillRect(z.x, z.y + z.h + 3, z.w, 2);
  const b = Math.floor(t * 30);
  ctx.fillStyle = rgba(WHITE, 0.7 * f);
  for (let i = 0; i < 46; i++) { const u = h01(b * 1.7 + i * 3.1), v = h01(b * 2.3 + i * 5.7); ctx.fillRect(z.x + u * z.w, z.y + v * z.h, 2 + h01(i + b) * 14, 1.5); }
}
/**
 * 바닥 분출 예고 = b_common warnFloor 와 같은 그림이지만, 솟는 빛 기둥의 세로 그라디언트를 색마다 한 번만 만들어 둔다
 * (warnFloor 는 부를 때마다 새 그라디언트 — 기둥 셋 + 번개 다섯이면 프레임당 8개, MASTER_PLAN §5.2 는 low 6개)
 */
function floorWarn(ctx, x, floor, w, k, color) {
  if (R.fl) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowE(ctx, x, floor, w * 0.75, 10 + 24 * k, color, 0.35 + 0.5 * k);
  ctx.strokeStyle = rgba(color, 0.5 + 0.5 * k);
  ctx.lineWidth = 1.5 + 2 * k;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 2, s = Math.sin(i * 12.9898 + x * 0.01) * 0.5;
    ctx.moveTo(x + a * w * 0.1, floor);
    ctx.lineTo(x + a * w * 0.28 + s * 8, floor - 3);
    ctx.lineTo(x + a * w * 0.5 * (0.6 + 0.4 * k), floor - 1 + s * 2);
  }
  ctx.stroke();
  const hh = 14 + 60 * k;
  ctx.globalAlpha *= 0.35 * k + 0.1;
  ctx.translate(x, floor); ctx.scale(1, hh);
  ctx.fillStyle = LG(ctx, 'nFloorWarn' + color, 0, 0, 0, -1, [0, rgba(color, 1), 1, rgba(color, 0)]);
  ctx.fillRect(-w * 0.45, -1, w * 0.9, 1);
  ctx.restore();
}
/** 드라큘라의 지옥불 기둥 */
function paintHell(ctx, z, w, x, F, W, H) {
  if (!z.started) { floorWarn(ctx, x, F, W, z.k, DRAC); return; }
  const k = z.a < 0.18 ? z.a / 0.18 : 1, f = 1 - Math.max(0, (z.a - 0.55) / 0.45), hh = H * k, t = w.time;
  glowE(ctx, x, F - hh / 2, W * 0.9, hh / 2 + 14, DRAC, 0.85 * f);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const ph = t * 9 + i * 2.1, ww = W * (0.45 - i * 0.1);
    ctx.fillStyle = rgba(i ? '#ff9070' : '#ffe0b0', (0.5 - i * 0.1) * f);
    ctx.beginPath(); ctx.moveTo(x - ww, F);
    ctx.quadraticCurveTo(x - ww * 0.6 + Math.sin(ph) * 8, F - hh * 0.6, x + Math.sin(ph * 1.3) * 10, F - hh);
    ctx.quadraticCurveTo(x + ww * 0.6 + Math.cos(ph) * 8, F - hh * 0.6, x + ww, F);
    ctx.closePath(); ctx.fill();
  }
  glow(ctx, x, F - 20, W, DRAC, 0.6 * f);
}
/** 혼돈의 눈 광선: 시작점에 눈이 뜬다 */
function paintEyeLaser(ctx, z, w) {
  const L = z.line, k = z.started ? 1 : z.k;
  if (!z.started) warnLine(ctx, L.x0, L.y0, L.x1, L.y1, z.k, CHAOS, 3);
  else {
    const f = 1 - z.a;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(CHAOS, 0.55 * f); ctx.lineWidth = L.th * 1.7;
    ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
    ctx.strokeStyle = rgba(WHITE, 0.9 * f); ctx.lineWidth = Math.max(2, L.th * 0.35); ctx.stroke();
    ctx.restore();
  }
  const ex = L.x0, ey = L.y0, r = 16;
  glow(ctx, ex, ey, 40, CHAOS, 0.5 + 0.4 * k);
  ctx.beginPath(); ctx.moveTo(ex - r, ey); ctx.quadraticCurveTo(ex, ey - r * k, ex + r, ey); ctx.quadraticCurveTo(ex, ey + r * k, ex - r, ey);
  ctx.fillStyle = '#f4ecff'; ctx.fill(); ctx.strokeStyle = '#2a0048'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = CHAOS; ctx.beginPath(); ctx.arc(ex, ey, 5 * k + 1, 0, TAU); ctx.fill();
}
function shardShape(ctx, x, y, hw, hl, a) {
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.beginPath();
  ctx.moveTo(x, y + hl * 0.62); ctx.lineTo(x + hw, y - hl * 0.1); ctx.lineTo(x + hw * 0.3, y - hl * 0.55); ctx.lineTo(x - hw * 0.5, y - hl * 0.4); ctx.lineTo(x - hw, y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(190,225,255,0.55)'; ctx.fill();
  ctx.strokeStyle = 'rgba(240,250,255,0.95)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(PM, 0.4); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - hw * 0.3, y - hl * 0.3); ctx.lineTo(x + hw * 0.2, y + hl * 0.3); ctx.stroke();
  glow(ctx, x, y, hw * 2.2, GLASS, 0.35);
  ctx.restore();
}
/** 나르키사의 거울 파편 (예고: 천장에서 떨고 있다 → 떨어진다) */
function paintShard(ctx, z, w, x, W, top, F, st) {
  if (!z.started) {
    warnRect(ctx, x - W * 0.35, top, W * 0.7, F - top, z.k * 0.7, GLASS, w.time);
    shardShape(ctx, x, top + 10 + Math.sin(w.time * 6 + x) * 3, W * 0.3, 60, 0.4 + 0.5 * z.k);
    return;
  }
  shardShape(ctx, x, st.y - 35, W * 0.34, 70, 1);
}
/** 지즈의 번개 기둥 */
function paintBolt(ctx, z, w, x, top, bot, seed) {
  const t0 = Math.max(top, (w.camera?.y ?? top) - 40);
  if (!z.started) { warnRect(ctx, x - 12, t0, 24, bot - t0, z.k * 0.8, BOLT, w.time); floorWarn(ctx, x, bot, 84, z.k, BOLT); return; }
  const f = 1 - z.a;
  glowE(ctx, x, (t0 + bot) / 2, 60, (bot - t0) / 2, BOLT, 0.7 * f);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
  const sd = seed + Math.floor(w.time * 20);
  ctx.strokeStyle = rgba(BOLT, 0.8 * f); ctx.lineWidth = 7;
  ctx.beginPath(); boltPath(ctx, x, t0, x, bot, 12, 22, sd); ctx.stroke();
  ctx.strokeStyle = rgba(WHITE, f); ctx.lineWidth = 2.5; ctx.stroke();
}
/** maw 흡입: 아가리로 빨려 드는 빛줄기 */
function paintInhale(ctx, z, mx, my) {
  if (z.t < z.warn) return;
  const f = clamp(Math.min(z.t - z.warn, z.dur + z.warn - z.t) / 0.3, 0, 1), t = z.t;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + Math.sin(i * 7.1) * 0.3, u = (t * 0.9 + h01(i * 3.3)) % 1, r0 = 420 * (1 - u) + 60, r1 = Math.max(20, r0 - 90);
    ctx.strokeStyle = rgba(i % 3 ? VIO_L : WHITE, 0.35 * f * u); ctx.lineWidth = 2 + u * 2;
    ctx.beginPath(); ctx.moveTo(mx + Math.cos(a) * r0, my + Math.sin(a) * r0 * 0.6); ctx.lineTo(mx + Math.cos(a + 0.1) * r1, my + Math.sin(a + 0.1) * r1 * 0.6); ctx.stroke();
  }
}
/** maw 물기: 위아래 별 조각 이빨이 다물린다 */
function paintBite(ctx, z, w, r) {
  if (!z.started) warnRect(ctx, r.x, r.y, r.w, r.h, z.k * 0.85, BITE, w.time);
  const close = z.started ? 1 : z.k * 0.35, gap = (r.h / 2) * (1 - close), my = r.y + r.h / 2, n = 7;
  ctx.fillStyle = z.started ? '#ffffff' : 'rgba(230,222,255,0.85)'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    const x = r.x + ((i + 0.5) * r.w) / n, tw = (r.w / n) * 0.42, tl = 26 + (i % 2) * 12;
    ctx.beginPath(); ctx.moveTo(x - tw, my - gap - tl * 0.2); ctx.lineTo(x, my - gap + tl); ctx.lineTo(x + tw, my - gap - tl * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - tw, my + gap + tl * 0.2); ctx.lineTo(x, my + gap - tl); ctx.lineTo(x + tw, my + gap + tl * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (z.started) { const f = 1 - z.a; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(BITE, 0.5 * f); ctx.fillRect(r.x, r.y, r.w, r.h); }
}
function debrisRender(ctx, p) {
  ctx.rotate(p.rot);
  glow(ctx, 0, 0, 26, VIO_L, 0.55);
  ctx.fillStyle = '#e6deff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-2, -11); ctx.lineTo(10, -3); ctx.lineTo(5, 9); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
}
function hellRender(ctx) {
  glow(ctx, 0, 0, 34, DRAC, 0.85);
  glow(ctx, 0, 0, 14, '#ffe0b0', 0.9, true);
}

// 갤러리(tools/gallery_bosses_d.html)의 설계 방 = MAPS-P2-D 의 진짜 s20 보스 방 (천장 1행 · X 16열 · 오른쪽 벽 59열 · 바닥 16행).
// '=' 발판(11행 · 7행 · 디딤돌 13행 · 9행)은 넣지 않는다: 갤러리 가짜 맵은 단방향 발판을 고체로만 흉내 내는데, 그러면 arenaOf 의
// 천장 추정(표본 열 일곱이 모두 발판에 걸린다)이 384px 로 내려와 진짜 방(천장 96px)과 경기장 높이가 달라진다.
Nihil.PATTERNS = {
  room: { w: 60, h: 18, x0: 16, solids: [[0, 16, 59, 17], [0, 0, 59, 0], [17, 1, 58, 1], [0, 0, 0, 17], [59, 0, 59, 17]] },
};

/** 벡터 그림 컬링 대리 개체 (d_mara.js · c_ziz.js 와 같은 방식): 보스의 artBounds() 를 사각형으로 삼아 보스 draw 를 대신 부른다 */
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
