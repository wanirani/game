// 보스 b_mara — 마라, 악몽을 낳는 자 (s18 '마라의 요람') — world2 §6.6. 소유: BOSS-P2-3
// BossC(c_common.js) 상속 — 패턴 이름은 계약 (P2_PATTERNS.b_mara):
//   공격  lullaby · threads · dolls · scissors · cradleRush(P2+) · faces(P2+) · falseDawn(P3 첫 패턴, 싸움당 한 번) · scream(P3)
//   전환  dreamshift (60%, 2.0초: 꿈빛 화면 색조 + 역비네트 · 심장 박동 2.6초 · '요람의 마라'(form2)로 변신 · 대사 b_mara_dream 스토리 1회)
//         phase2 (30%, 1.5초: 요람의 짐승이 일어서며 피를 흘린다 → 다음 패턴 falseDawn 강제)
//   보조  collapse (P2+ 인형 머리 셋을 모두 부수면 3초 붕괴 — 일어설 때 머리가 다시 돋는다)
// 몸: P1 = 떠 있는 거대한 쇠 요람 위에 쪼그려 앉은 네 팔의 노파 (판정 140×220). 심장 박동 기둥(z/Z) 사이 통로 안에서만 떠다닌다
//     (MAPS-P2-C 요청: 경기장 0.72 지점에서 태어나면 Z 기둥을 막는다 → setup() 이 통로 가운데로 옮긴다).
//     P2+ = 노파와 요람이 합쳐진 거미 같은 '요람의 짐승' (판정 260×180, 바닥). 도자기 인형 다리 여덟, 가까운 쪽 셋의 무릎에 아기 인형 머리.
//     바닥 이동은 중력 없이 직접 한다: 지형(박동 기둥)을 타고 넘고, 벽을 차고 뛰어오른다.
// 판정 부위: 얼굴·상체(1.0) · 비명 때 입속 눈(0.5, 2.5초) · 요람(1.5, P2 는 다리 포함) · P2+ 인형 머리 ×3(0.9, 각 최대 체력 2%).
// falseDawn: 흰 섬광 + 가짜 'STAGE CLEAR' 배너 + 음악 1초 멈춤 → '…라고 생각했니?' + 위에서 바늘 12발 방사. 2.4초 동안 무적.
//   world.cleared 를 건드리지 않고 이벤트도 보내지 않는다 (배너·섬광·음악만). 보스는 쓰러진 척할 뿐 계속 보인다.
// 그림: 벡터 (2부 기준). 도자기 얼굴 · 쇠 요람 · 잠든 얼굴 · 아기 인형 머리는 보스 등장 때 한 번 굽고(모듈 캐시, 흰 판 = 피격 섬광),
//   노파의 몸 · 네 팔과 손가락 · 실 머리카락 · 인형 다리 · 사슬 · 균열 · 입속 눈은 매 프레임 그린다.
//   피해 단계: 체력이 줄수록 얼굴 균열이 번지고, P2 에는 요람 창살 사이에 살덩이가 차오르며, P3 에는 이마가 떨어져 나가
//   검은 속과 보랏빛 눈이 드러나고 창살이 휘어 피가 샌다.
// 채색 아트(ART-BOSS-7, W3)가 읽을 상태: bx, by (몸 발밑 가운데, by 에 bob 을 더해 그린다) · form (1|2) · morph (변신 0~1) ·
//   pose {sing, raise, cut, throw, lean, crouch, slump, reach, rear, grin} · rock (요람 흔들림 rad) · jt (관절, 몸 지역 좌표) ·
//   legs[{kx, ky, fxw, fyw}] (P2 무릎·발, 월드) · heads[{alive, grow, x, y}] · faceP · mouthP · mouthK (입 벌림 0~1) · eyeT ·
//   dawn ({fake}) · collapsed · rush · dieT
import { BossC, telegraph, warnText, warnMark, strikeLine, strikeCircle, ringWave, gimmickOf, setBeat, screenTint, darken, muteMusic } from './c_common.js';
import { PI, R, C, LG, ink, glow, glowE, glowSprite, warnRect, warnLine, impact, hash, tube } from './b_common.js';
import { Entity } from '../entity.js';
import { T } from '../../core/physics.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba } from '../../core/math.js';

// ───────────────────────── 색 · 치수 ─────────────────────────
const TS = 48;   // 타일 (core/game.js TILE — 모듈 최상위에서 import 값을 읽지 않는다)
const F1 = { w: 140, h: 220 }, F2 = { w: 260, h: 180 };
const PORC = '#efe8e0', SKIN = '#9d8ea4', SKIN_D = '#4a3c54', GOWN = '#1e1524', GOWN_L = '#3a2a46';
const HAIR = '#0c070c', DREAM = '#c060ff', DREAM_L = '#e8c0ff', BLOOD = '#5a0818', NAIL = '#d8d0c8', FLESH = '#5a1a2e';
const GRAV = 2400;
const POSE0 = { sing: 0, raise: 0, cut: 0, throw: 0, lean: 0, crouch: 0, slump: 0, reach: 0, rear: 0, grin: 0 };
const POSE_RATE = { sing: 6, raise: 7, cut: 12, throw: 11, lean: 5, crouch: 8, slump: 3.5, reach: 7, rear: 6, grin: 7 };
const UA = 60, FA = 58;            // 팔 뼈 길이 (위팔 · 아래팔)
const LF = 118, LT = 140;          // 인형 다리 뼈 길이 (넙다리 · 정강이)
/** P2 거미 다리 8개: near(가까운 쪽) · rx(뿌리 x, 몸 지역) · fx(발 기본 위치) · ph(걸음 위상) */
const LEGS = [
  { near: 1, rx: 50, fx: 185, ph: 0 },
  { near: 1, rx: 12, fx: 88, ph: PI },
  { near: 1, rx: -34, fx: -40, ph: 0.5 * PI },
  { near: 1, rx: -84, fx: -170, ph: 1.5 * PI },
  { near: 0, rx: 40, fx: 150, ph: PI },
  { near: 0, rx: 2, fx: 50, ph: 0 },
  { near: 0, rx: -44, fx: -82, ph: 1.5 * PI },
  { near: 0, rx: -92, fx: -205, ph: 0.5 * PI },
];
const HEAD_LEGS = [0, 1, 3];       // 아기 인형 머리가 달린 다리 (가까운 쪽 — 앞에 그려져 보인다)
/** 실 머리카락 끝에 매달린 잠든 얼굴 (정수리 기준 오프셋, 몸 지역) */
const SLEEPERS = [[[-140, -62], [-62, -138], [70, -118]], [[-200, -60], [-100, -150], [20, -160]]];
const h01 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

// ───────────────────────── 굽기 (보스 등장 때 한 번, 모듈 캐시) ─────────────────────────
let ART = null;
function canvasOf(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  return null;
}
function whiteOf(c) {
  const w = canvasOf(c.width, c.height);
  if (!w) return c;
  const g = w.getContext('2d');
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, w.width, w.height);
  return w;
}
function mk(K, w, h, ox, oy, fn) {
  const c = canvasOf(Math.ceil(w * K), Math.ceil(h * K));
  if (!c) return null;
  const g = c.getContext('2d');
  g.scale(K, K); g.translate(ox, oy);
  g.lineJoin = 'round'; g.lineCap = 'round';
  fn(g);
  return { c, f: whiteOf(c), w, h, ox, oy };
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
  try { ART = bakeArt(K); } catch (e) { console.error('[mara] 굽기 실패', e); }
  return ART;
}
function linG(g, x0, y0, x1, y1, st) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < st.length; i += 2) gr.addColorStop(st[i], st[i + 1]); return gr; }
function radG(g, x0, y0, r0, x1, y1, r1, st) { const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (let i = 0; i < st.length; i += 2) gr.addColorStop(st[i], st[i + 1]); return gr; }
function bakeArt(K) {
  return {
    K,
    face: mk(K, 72, 90, 36, 46, drawFaceArt),
    cradle: mk(K, 280, 210, 140, 168, drawCradleArt),
    sleep: mk(K, 58, 70, 29, 35, drawSleepArt),
    baby: mk(K, 48, 48, 24, 24, drawBabyArt),
  };
}

/** 도자기 인형 얼굴 (오른쪽을 보는 3/4 얼굴, 원점 = 얼굴 가운데). 눈이 없고, 입은 세로로 꿰매져 있다 */
function faceShape(g) {
  g.beginPath();
  g.moveTo(-2, -38);
  g.bezierCurveTo(19, -39, 30, -21, 29, -2);
  g.bezierCurveTo(28, 17, 19, 33, 6, 40);
  g.bezierCurveTo(-3, 43, -14, 37, -20, 27);
  g.bezierCurveTo(-28, 12, -29, -12, -23, -26);
  g.bezierCurveTo(-18, -34, -10, -38, -2, -38);
  g.closePath();
}
function drawFaceArt(g) {
  // 뒤통수에 붙은 검은 실 머리 뿌리
  g.fillStyle = HAIR;
  g.beginPath(); g.moveTo(-26, -8); g.bezierCurveTo(-32, -34, -10, -48, 12, -42); g.bezierCurveTo(-6, -40, -18, -26, -20, -4); g.closePath(); g.fill();
  faceShape(g);
  g.fillStyle = radG(g, 8, -16, 2, 2, 0, 46, [0, '#fffaf4', 0.38, '#ede4dc', 0.72, '#c4b6c2', 1, '#6e5e7a']);
  g.fill();
  // 바랜 뺨 칠
  for (const [x, y, r] of [[-9, 13, 9], [19, 11, 7]]) { g.fillStyle = radG(g, x, y, 0, x, y, r, [0, 'rgba(226,110,140,0.34)', 1, 'rgba(226,110,140,0)']); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  // 눈 없는 눈자리: 얕게 파인 오목 + 칠한 감은 눈꺼풀 · 속눈썹
  for (const [x, y, rx, ry] of [[-6, -6, 8.5, 5.5], [17, -5, 7, 5]]) {
    g.fillStyle = radG(g, x + 1, y - 1, 0, x, y, rx + 3, [0, 'rgba(70,50,84,0.62)', 0.55, 'rgba(130,110,146,0.34)', 1, 'rgba(200,190,205,0)']);
    g.beginPath(); g.ellipse(x, y, rx + 3, ry + 3, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(36,16,34,0.75)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(x - rx, y + 1); g.quadraticCurveTo(x, y + ry, x + rx, y + 1); g.stroke();
    g.lineWidth = 0.8; g.beginPath();
    for (let k = -2; k <= 2; k++) { const lx = x + k * rx * 0.36, ly = y + ry * 0.72 - Math.abs(k) * 0.6; g.moveTo(lx, ly); g.lineTo(lx + k * 0.9, ly + 3.2); }
    g.stroke();
  }
  // 칠한 코
  g.fillStyle = 'rgba(120,86,108,0.38)'; g.beginPath(); g.moveTo(9, -1); g.quadraticCurveTo(15, 5, 10, 8); g.quadraticCurveTo(8, 6, 9, -1); g.fill();
  // 꿰맨 세로 입 (턱 끝까지) + 검붉은 진물
  g.strokeStyle = '#2a0a18'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(7, 12); g.quadraticCurveTo(5, 22, 6, 32); g.stroke();
  g.strokeStyle = '#120610'; g.lineWidth = 1.3; g.beginPath();
  for (let k = 0; k < 6; k++) { const y = 13.5 + k * 3.4; g.moveTo(1.5, y - 1.6); g.lineTo(11, y + 1.6); }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(1.5, 12 + k * 3.4, 0.9, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(70,6,24,0.8)'; g.beginPath(); g.moveTo(6, 31); g.quadraticCurveTo(8.5, 38, 6, 43); g.quadraticCurveTo(4, 38, 6, 31); g.fill();
  // 원래 있던 금 (이마 → 눈자리)
  g.strokeStyle = '#1c0c16'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(-14, -34); g.lineTo(-10, -24); g.lineTo(-13, -17); g.lineTo(-7, -11); g.moveTo(-10, -24); g.lineTo(-4, -27); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-13, -34); g.lineTo(-9, -24); g.lineTo(-12, -17); g.stroke();
  // 광택 · 역광 · 외곽선
  g.fillStyle = 'rgba(255,255,255,0.58)'; g.beginPath(); g.ellipse(5, -25, 11, 4, -0.3, 0, TAU); g.fill();
  g.save(); faceShape(g); g.clip();
  g.fillStyle = linG(g, -30, 0, -14, 0, [0, 'rgba(160,190,255,0.55)', 1, 'rgba(160,190,255,0)']); g.fillRect(-32, -42, 18, 86);
  g.fillStyle = linG(g, 0, 20, 0, 42, [0, 'rgba(60,30,70,0)', 1, 'rgba(60,30,70,0.35)']); g.fillRect(-30, 20, 60, 24);
  g.restore();
  faceShape(g); g.strokeStyle = '#140812'; g.lineWidth = 2.2; g.stroke();
}

/** 쇠 요람 한 벌 (옆모습, 오른쪽이 발치, 왼쪽이 덮개). far = 먼 쪽 (어둡게, 창살·장식 생략) */
function ironStroke(g, w, far) {
  g.strokeStyle = '#07040a'; g.lineWidth = w + 2.4; g.stroke();
  g.strokeStyle = far ? '#1a1620' : '#34303c'; g.lineWidth = w; g.stroke();
  if (far) return;
  g.save(); g.translate(-0.6, -0.9); g.strokeStyle = 'rgba(170,160,184,0.55)'; g.lineWidth = Math.max(0.8, w * 0.32); g.stroke(); g.restore();
}
function cradleFrame(g, far) {
  // 흔들 다리 (활 모양) + 끝의 소용돌이
  g.beginPath(); g.moveTo(-124, -22); g.quadraticCurveTo(0, 18, 124, -22); ironStroke(g, 7, far);
  for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 124, -30, 8, s > 0 ? PI * 0.5 : PI * 0.5, s > 0 ? PI * 2.1 : -PI * 1.1, s < 0); ironStroke(g, 3.5, far); }
  // 기둥 넷 + 꼭대기 창끝 장식
  for (const x of [-100, 100]) {
    g.beginPath(); g.moveTo(x, -6); g.lineTo(x, -100); ironStroke(g, 6, far);
    if (!far) {
      g.fillStyle = linG(g, x - 6, -118, x + 6, -104, [0, '#8a8294', 0.5, '#3a3444', 1, '#120e16']);
      g.beginPath(); g.moveTo(x, -124); g.lineTo(x + 5, -110); g.lineTo(x, -104); g.lineTo(x - 5, -110); g.closePath(); g.fill();
      g.strokeStyle = '#07040a'; g.lineWidth = 1.2; g.stroke();
      g.beginPath(); g.arc(x, -103, 4.5, 0, TAU); g.fillStyle = '#4a4454'; g.fill(); g.stroke();
    }
  }
  // 아래 · 위 난간
  g.beginPath(); g.moveTo(-100, -30); g.lineTo(100, -30); ironStroke(g, 5, far);
  g.beginPath(); g.moveTo(-104, -94); g.quadraticCurveTo(0, -88, 104, -94); ironStroke(g, 6, far);
  if (far) return;
  // 창살 (몇 개는 휘었다)
  for (let i = 0; i < 17; i++) {
    const x = -90 + i * 11.2, bend = (i === 5 || i === 12) ? (i === 5 ? 5 : -6) : 0;
    g.beginPath(); g.moveTo(x, -31); g.quadraticCurveTo(x + bend, -62, x, -92); ironStroke(g, 2.4, false);
  }
  // 가운데 소용돌이 띠
  g.beginPath();
  for (let i = 0; i < 8; i++) { const x = -86 + i * 24; g.moveTo(x, -60); g.bezierCurveTo(x + 6, -70, x + 14, -70, x + 12, -60); g.bezierCurveTo(x + 10, -52, x + 18, -50, x + 24, -60); }
  ironStroke(g, 2, false);
  // 덮개 (뒤쪽 아치 창살 + 너덜한 검은 레이스)
  g.beginPath(); g.moveTo(-104, -94); g.bezierCurveTo(-104, -150, -52, -156, -46, -96); ironStroke(g, 4, false);
  for (let k = 1; k < 5; k++) { const u = k / 5; g.beginPath(); g.moveTo(-104 + u * 58, -95); g.quadraticCurveTo(-100 + u * 50, -150 + Math.abs(u - 0.5) * 30, -78, -148); ironStroke(g, 1.6, false); }
  g.fillStyle = 'rgba(10,6,14,0.82)';
  g.beginPath(); g.moveTo(-106, -108); g.bezierCurveTo(-100, -150, -54, -152, -48, -110);
  for (let k = 0; k <= 10; k++) { const x = -48 - k * 5.8, y = -112 + (k % 2 ? 16 : 6) + h01(k) * 10; g.lineTo(x, y); }
  g.closePath(); g.fill();
  // 녹 · 긁힘
  for (let i = 0; i < 26; i++) {
    const x = -110 + h01(i * 3.1) * 220, y = -100 + h01(i * 7.7) * 96;
    g.fillStyle = h01(i) < 0.6 ? 'rgba(120,52,30,0.45)' : 'rgba(200,120,70,0.28)';
    g.beginPath(); g.ellipse(x, y, 1.5 + h01(i * 2) * 3, 1 + h01(i * 5) * 2, h01(i) * 3, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(110,46,26,0.55)'; g.lineWidth = 1;
  for (let i = 0; i < 9; i++) { const x = -96 + h01(i * 9.3) * 190; g.beginPath(); g.moveTo(x, -30); g.lineTo(x + 1, -22 + h01(i) * 12); g.stroke(); }
}
function drawCradleArt(g) {
  g.save(); g.translate(-9, -9); cradleFrame(g, true); g.restore();
  // 담요 (창살 뒤): 얼룩진 잿빛 보라
  g.beginPath();
  g.moveTo(-98, -31); g.bezierCurveTo(-90, -70, -60, -84, -30, -76); g.bezierCurveTo(-4, -92, 30, -78, 52, -86); g.bezierCurveTo(78, -92, 96, -70, 98, -31); g.closePath();
  g.fillStyle = linG(g, 0, -92, 0, -30, [0, '#8a7c90', 0.5, '#5e5066', 1, '#2e2434']); g.fill();
  g.strokeStyle = 'rgba(20,10,24,0.6)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-70, -40); g.quadraticCurveTo(-50, -70, -30, -72); g.moveTo(-10, -44); g.quadraticCurveTo(10, -76, 30, -76); g.moveTo(50, -40); g.quadraticCurveTo(62, -70, 80, -78); g.stroke();
  for (const [x, y, r] of [[-40, -52, 12], [36, -60, 9]]) { g.fillStyle = radG(g, x, y, 0, x, y, r, [0, 'rgba(90,40,20,0.55)', 1, 'rgba(90,40,20,0)']); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  // 안에서 창살을 붙잡은 작은 인형 손
  for (const [x, y, s] of [[-46, -54, 1], [6, -46, 0.9], [60, -60, 1.1]]) dollHandArt(g, x, y, s);
  cradleFrame(g, false);
  // 발치 쪽으로 늘어진 찢긴 담요 자락
  g.beginPath(); g.moveTo(52, -96); g.bezierCurveTo(74, -94, 96, -80, 100, -50);
  for (let k = 0; k <= 6; k++) { const x = 100 - k * 6, y = -44 + (k % 2 ? 10 : 0) + h01(k * 3) * 8; g.lineTo(x, y); }
  g.bezierCurveTo(64, -60, 58, -80, 52, -96); g.closePath();
  g.fillStyle = linG(g, 52, -96, 100, -40, [0, '#8e8094', 1, '#3e3446']); g.fill();
  g.strokeStyle = '#140c18'; g.lineWidth = 1.4; g.stroke();
}
/** 창살을 쥔 작은 도자기 손 */
function dollHandArt(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = radG(g, -2, -2, 0, 0, 0, 8, [0, '#fbf4ee', 1, '#b8aab4']);
  g.beginPath(); g.ellipse(0, 3, 5, 6, 0, 0, TAU); g.fill();
  g.strokeStyle = '#2a1a26'; g.lineWidth = 0.9; g.stroke();
  for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(-4.5 + k * 3, -3, 1.5, 3.2, 0, 0, TAU); g.fill(); g.stroke(); }
  g.restore();
}
/** 잠든 얼굴 (정면, 가장자리가 흐려진다) */
function drawSleepArt(g) {
  g.fillStyle = radG(g, -4, -8, 2, 0, 0, 30, [0, '#f2ecf4', 0.5, '#c6bed2', 0.82, 'rgba(118,106,140,0.85)', 1, 'rgba(70,60,96,0)']);
  g.beginPath(); g.ellipse(0, 0, 20, 27, 0, 0, TAU); g.fill();
  // 꺼진 볼 · 눈두덩
  for (const s of [-1, 1]) {
    g.fillStyle = radG(g, s * 10, 8, 0, s * 10, 8, 9, [0, 'rgba(80,60,100,0.32)', 1, 'rgba(80,60,100,0)']); g.beginPath(); g.arc(s * 10, 8, 9, 0, TAU); g.fill();
    g.fillStyle = radG(g, s * 7.5, -6, 0, s * 7.5, -6, 7, [0, 'rgba(70,50,90,0.4)', 1, 'rgba(70,50,90,0)']); g.beginPath(); g.arc(s * 7.5, -6, 7, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30,14,36,0.8)'; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(s * 3, -5); g.quadraticCurveTo(s * 7.5, -1.5, s * 12, -5); g.stroke();
    g.lineWidth = 0.7; g.beginPath(); for (let k = 0; k < 4; k++) { const lx = s * (4 + k * 2.6); g.moveTo(lx, -3.5); g.lineTo(lx + s * 0.5, -1); } g.stroke();
  }
  // 코 · 반쯤 벌어진 입 · 눈물 자국
  g.strokeStyle = 'rgba(60,40,70,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -2); g.lineTo(-1.5, 6); g.lineTo(1.5, 7); g.stroke();
  g.fillStyle = '#1c0c20'; g.beginPath(); g.ellipse(0, 14, 4.5, 2.6, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(200,220,255,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-9, -2); g.quadraticCurveTo(-10, 8, -8, 16); g.stroke();
  // 정수리의 실 매듭
  g.strokeStyle = HAIR; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -27); g.lineTo(0, -34); g.stroke();
  g.fillStyle = HAIR; g.beginPath(); g.ellipse(0, -27, 4, 2.4, 0, 0, TAU); g.fill();
}
/** 아기 인형 머리 (도자기, 유리 눈을 뜨고 있다) */
function drawBabyArt(g) {
  g.beginPath(); g.arc(0, 1, 19, 0, TAU);
  g.fillStyle = radG(g, -6, -7, 2, 0, 0, 22, [0, '#fffaf2', 0.5, '#ecdcd4', 0.85, '#b8a0aa', 1, '#6e5462']); g.fill();
  g.strokeStyle = '#1c0c16'; g.lineWidth = 1.8; g.stroke();
  // 칠한 곱슬머리
  g.strokeStyle = 'rgba(120,70,40,0.75)'; g.lineWidth = 2;
  g.beginPath(); g.arc(-4, -14, 4, PI * 0.9, PI * 2.2); g.moveTo(3, -17); g.arc(6, -14, 3.5, PI, PI * 2.3); g.stroke();
  // 큰 유리 눈 (파란 홍채 · 무거운 눈꺼풀)
  for (const s of [-1, 1]) {
    const x = s * 7.5, y = -1;
    g.fillStyle = '#f8f4f0'; g.beginPath(); g.ellipse(x, y, 5.8, 4.8, 0, 0, TAU); g.fill();
    g.fillStyle = radG(g, x - 1, y - 1, 0, x, y, 4, [0, '#9fd0ff', 0.6, '#3060a8', 1, '#182848']); g.beginPath(); g.arc(x, y + 0.5, 3.6, 0, TAU); g.fill();
    g.fillStyle = '#060408'; g.beginPath(); g.arc(x, y + 0.5, 1.6, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 1.2, y - 1, 0.9, 0, TAU); g.fill();
    g.fillStyle = 'rgba(160,110,120,0.8)'; g.beginPath(); g.ellipse(x, y - 3.4, 6.2, 2.4, 0, PI, TAU); g.fill();
    g.strokeStyle = '#1a0c14'; g.lineWidth = 1; g.beginPath(); g.ellipse(x, y, 5.8, 4.8, 0, 0, TAU); g.stroke();
  }
  // 볼 · 작은 입
  for (const s of [-1, 1]) { g.fillStyle = radG(g, s * 10, 7, 0, s * 10, 7, 5, [0, 'rgba(240,120,140,0.4)', 1, 'rgba(240,120,140,0)']); g.beginPath(); g.arc(s * 10, 7, 5, 0, TAU); g.fill(); }
  g.fillStyle = '#b0304a'; g.beginPath(); g.ellipse(0, 10, 2.6, 1.8, 0, 0, TAU); g.fill();
  // 금
  g.strokeStyle = '#1c0c16'; g.lineWidth = 1; g.beginPath(); g.moveTo(8, -17); g.lineTo(11, -10); g.lineTo(8, -6); g.lineTo(13, 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(-7, -10, 5, 2.4, -0.5, 0, TAU); g.fill();
}

// ───────────────────────── 지형 ─────────────────────────
const solidT = (t) => t === T.SOLID || t === T.BREAK;
/** x0~x1 열에서 (fromY − climb) 아래로 처음 만나는 단단한 칸 윗면 중 가장 높은 y (없으면 경기장 바닥) */
function groundTop(world, A, x0, x1, fromY, climb = 210) {
  const m = world?.map;
  if (!m?.typeAt || !A) return A?.floor ?? fromY;
  const ty0 = Math.max(0, Math.floor((fromY - climb) / TS)), ty1 = Math.min((m.h ?? 999) - 1, Math.floor(A.floor / TS) + 1);
  let top = Infinity;
  for (let tx = Math.floor(x0 / TS); tx <= Math.floor((x1 - 1) / TS); tx++) {
    for (let ty = ty0; ty <= ty1; ty++) if (solidT(m.typeAt(tx, ty))) { top = Math.min(top, ty * TS); break; }
  }
  return Number.isFinite(top) ? Math.min(top, A.floor) : A.floor;
}
/** (x, fromY) 아래 maxDown 안의 첫 바닥(단단한 칸 · 단방향 발판) 윗면, 없으면 null */
function floorUnder(world, x, fromY, maxDown = 80) {
  const m = world?.map;
  if (!m?.typeAt) return null;
  const tx = Math.floor(x / TS);
  for (let ty = Math.max(0, Math.floor(fromY / TS)); ty * TS <= fromY + maxDown; ty++) {
    const t = m.typeAt(tx, ty);
    if ((solidT(t) || t === T.ONEWAY) && ty * TS >= fromY - 2) return ty * TS;
  }
  return null;
}
/** (x0,y0) 에서 (dx,dy) 방향 반직선이 경기장 상자를 나가는 점 */
function clipRay(x0, y0, dx, dy, A) {
  const L = Math.hypot(dx, dy) || 1;
  dx /= L; dy /= L;
  let tMax = 3000;
  const xa = A.x0 - 40, xb = A.x1 + 40, ya = (A.top ?? 0) - 40, yb = A.floor + 20;
  if (dx > 1e-4) tMax = Math.min(tMax, (xb - x0) / dx); else if (dx < -1e-4) tMax = Math.min(tMax, (xa - x0) / dx);
  if (dy > 1e-4) tMax = Math.min(tMax, (yb - y0) / dy); else if (dy < -1e-4) tMax = Math.min(tMax, (ya - y0) / dy);
  tMax = Math.max(40, tMax);
  return { x: x0 + dx * tMax, y: y0 + dy * tMax };
}
/** 두 뼈 IK: 뿌리 (ax, ay) → 끝 (bx, by), 길이 l1 · l2. up = 1 이면 관절이 위쪽(작은 y)으로 굽는다. out = [kx, ky] */
function ik2(ax, ay, bx, by, l1, l2, up, out) {
  const dx = bx - ax, dy = by - ay;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
  const a = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const off = Math.acos(c);
  const k1 = a + off, k2 = a - off;
  const y1 = ay + Math.sin(k1) * l1, y2 = ay + Math.sin(k2) * l1;
  const k = (up > 0) === (y1 < y2) ? k1 : k2;
  out[0] = ax + Math.cos(k) * l1; out[1] = ay + Math.sin(k) * l1;
  return out;
}

// ───────────────────────── 보스 ─────────────────────────
export class Mara extends BossC {
  setup() {
    ensureArt(this.world);
    this.noGravity = true;
    this.facing = -1;
    this.pose = { ...POSE0 }; this.pt = { ...POSE0 };
    this.scanLanes();
    const L = this.home;
    this.form = 1; this.morph = 0; this.legK = 0;
    this.bx = clamp((L.x0 + L.x1) / 2 + 70, L.x0 + 100, Math.max(L.x0 + 100, L.x1 - 100));
    this.by = this.hoverB('high');
    this.tx = this.bx; this.tb = this.by; this.spd = 150; this.spdY = 170;
    this.mvx = 0; this.mvy = 0; this.air = false; this.gph = 0; this.moving = 0;
    this.rock = 0; this.rockAmp = 1; this.bob = 0;
    this.mouthK = 0; this.eyeT = 0; this.collapsed = false; this.rush = null; this.dawn = null; this.dawnUsed = false;
    this.pendCollapse = false; this.dieT = 0; this.fxAcc = 0; this.needleO = null; this._fakeBanner = null;
    // 관절 (몸 지역 좌표, 오른쪽을 본다)
    const P = () => [0, 0];
    this.jt = {
      footN: P(), footF: P(), kneeN: P(), kneeF: P(), hip: P(), chest: P(), sho: P(), head: P(), headA: 0, crown: P(), mouth: P(), body: P(), bodyA: 0,
      arms: [0, 1, 2, 3].map(() => ({ r: P(), e: P(), h: P(), a: 0 })),
    };
    this.legs = LEGS.map((d, i) => ({ ...d, i, rl: [0, 0], kl: [0, 0], fl: [0, 0], kx: 0, ky: 0, fxw: 0, fyw: 0 }));
    const hhp = Math.max(1, Math.round(this.stats.maxHp * 0.02));
    this.heads = HEAD_LEGS.map((leg, i) => {
      const h = { i, leg, hp: hhp, max: hhp, alive: true, grow: 1, hitT: 0, x: 0, y: 0 };
      h.part = { x: 0, y: 0, w: 34, h: 34, defMul: 0.9, head: h, onHit: (part, dmg) => this.hitHead(h, dmg) };
      return h;
    });
    this.pFace = { x: 0, y: 0, w: 70, h: 118, defMul: 1.0, face: true };
    this.pEye = { x: 0, y: 0, w: 36, h: 44, defMul: 0.5, eye: true };
    this.pCradle = { x: 0, y: 0, w: 216, h: 104, defMul: 1.5 };
    this.cBody = { x: 0, y: 0, w: 1, h: 1 }; this.cTop = { x: 0, y: 0, w: 1, h: 1 };
    this.faceP = { x: 0, y: 0 }; this.mouthP = { x: 0, y: 0 };
    this._hp = []; this._cp = []; this._pt = { x: 0, y: 0 }; this._k = [0, 0];
    // 캐시 스프라이트는 등장 연출 동안 만든다 (싸움 중 새 캔버스 0 — MASTER_PLAN §5.2)
    for (const c of [DREAM, DREAM_L, '#ffffff', '#ff6a9a', '#8a60c0', '#ffd0f0']) { glowSprite(c, false); glowSprite(c, true); }
    this.place(); this.rig(); this.syncParts();
  }

  // ═════════════════════════════ 경기장 · 위치 ═════════════════════════════
  /** 박동 기둥(z/Z) 가로 구간 → 기둥이 없는 통로들. 가장 넓은 통로 = home (P1 은 이 안에서만 떠다닌다) */
  scanLanes() {
    const A = this.A, g = gimmickOf(this.world, 'heartbeat');
    const cols = new Map();
    for (const c of g?.cells ?? []) {
      if (!Number.isFinite(c?.tx)) continue;
      const x = c.tx * TS;
      if (x + TS <= A.x0 || x >= A.x1) continue;
      cols.set(c.tx, Math.min(cols.get(c.tx) ?? 1e9, c.ty));
    }
    const blocks = [];
    for (const tx of [...cols.keys()].sort((a, b) => a - b)) {
      const last = blocks[blocks.length - 1];
      if (last && tx === last.t1 + 1) { last.t1 = tx; last.top = Math.min(last.top, cols.get(tx)); } else blocks.push({ t0: tx, t1: tx, top: cols.get(tx) });
    }
    this.pillars = blocks.map((b) => ({ x0: b.t0 * TS, x1: (b.t1 + 1) * TS, top: b.top * TS }));
    const lanes = [];
    let x = A.x0;
    for (const p of this.pillars) { if (p.x0 - x >= 3 * TS) lanes.push({ x0: x, x1: p.x0 }); x = Math.max(x, p.x1); }
    if (A.x1 - x >= 3 * TS) lanes.push({ x0: x, x1: A.x1 });
    if (!lanes.length) lanes.push({ x0: A.x0, x1: A.x1 });
    this.lanes = lanes;
    this.home = lanes.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a));
  }
  /** 통로 안으로 (반폭 half 만큼 여유). 통로가 좁으면 가운데 */
  laneX(x, half) {
    const L = this.home, a = L.x0 + half + 8, b = L.x1 - half - 8;
    return a <= b ? clamp(x, a, b) : (L.x0 + L.x1) / 2;
  }
  hoverB(kind) {
    const A = this.A, top = A.top ?? 0;
    if (kind === 'high') return Math.min(A.floor - 150, Math.max(top + 250, A.floor - 300));
    if (kind === 'mid') return A.floor - 140;
    return A.floor - 36;
  }
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; }
  faceP_() { const p = this.P; if (p && !this.rush) { const d = p.cx - this.bx; if (Math.abs(d) > 40) this.facing = Math.sign(d); } }
  place() {
    this.x = this.bx - this.w / 2; this.y = this.by - this.h;
    this.vx = 0; this.vy = 0;
  }
  setForm(n) {
    this.form = n;
    const S = n === 2 ? F2 : F1;
    this.w = S.w; this.h = S.h;
    this.place();
  }
  /** 몸 지역 좌표 → 월드 (P1 은 요람 흔들림 회전 포함) */
  toWorld(lx, ly, out = this._pt) {
    let x = lx, y = ly;
    if (this.form === 1 && this.rock) {
      const c = Math.cos(this.rock), s = Math.sin(this.rock), dy = ly + 50;
      x = lx * c - dy * s; y = -50 + lx * s + dy * c;
    }
    out.x = this.bx + x * this.facing; out.y = this.by + this.bob + y;
    return out;
  }
  /** 손 i 의 월드 좌표 */
  handW(i) { const a = this.jt.arms[i]; return this.toWorld(a.h[0], a.h[1], { x: 0, y: 0 }); }

  // ═════════════════════════════ 움직임 ═════════════════════════════
  moveHover(dt) {
    const A = this.A;
    this.bx = approach(this.bx, this.tx, this.spd * dt);
    this.by = approach(this.by, this.tb, this.spdY * dt);
    this.bx = clamp(this.bx, A.x0 + this.w / 2, A.x1 - this.w / 2);
    this.by = clamp(this.by, (A.top ?? 0) + this.h + 10, A.floor);
  }
  /** 요람 짐승: 수평 mvx, 지형 윗면을 타고 넘는다 (중력은 직접) */
  moveGround(dt) {
    const A = this.A, hw = this.w / 2;
    const nx = clamp(this.bx + this.mvx * dt, A.x0 + hw, A.x1 - hw);
    if (nx !== this.bx + this.mvx * dt && this.air) this.mvx *= -0.2;
    this.bx = nx;
    const gy = groundTop(this.world, A, nx - hw + 34, nx + hw - 34, this.by);
    if (this.air) {
      this.mvy = Math.min(1400, this.mvy + GRAV * dt); this.by += this.mvy * dt;
      if (this.mvy > 0 && this.by >= gy) { this.by = gy; this.air = false; this.mvy = 0; }
    } else if (gy < this.by - 1) this.by = Math.max(gy, this.by - 1100 * dt);   // 기둥을 기어오른다
    else if (gy > this.by + 6) { this.air = true; this.mvy = 0; }
    else this.by = gy;
  }
  animTick(dt) {
    const s = this.pose, pt = this.pt;
    for (const k in s) s[k] += (pt[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt));
    this.rockAmp = approach(this.rockAmp, this.dying > 0 || this.collapsed ? 0 : 1, dt * (this.dying > 0 ? 0.45 : 2));
    this.rock = Math.sin(this.t * 1.35) * 0.055 * this.rockAmp * (1 + s.sing * 1.6);
    this.bob = this.form === 1 ? Math.sin(this.t * 1.7) * 7 * (1 - s.slump) * this.rockAmp : 0;
    this.mouthK = approach(this.mouthK, this.eyeT > 0 ? 1 : 0, dt * (this.eyeT > 0 ? 3.2 : 2));
    if (this.eyeT > 0) this.eyeT -= dt;
    if (this.form === 2) this.legK = approach(this.legK, 1, dt * 1.3);
    this.moving = approach(this.moving, Math.abs(this.mvx) > 20 && !this.air ? 1 : 0, dt * 5);
    this.gph += Math.abs(this.mvx) * dt / 190;
    for (const h of this.heads) { if (h.hitT > 0) h.hitT -= dt; if (h.alive && h.grow < 1) h.grow = approach(h.grow, 1, dt / 1.5); }
  }
  motion(dt, world) {
    this.animTick(dt);
    if (this.form === 2) this.moveGround(dt); else this.moveHover(dt);
    this.place();
    this.rig();
    this.syncParts();
  }
  idleAnim(dt) { this.animTick(dt); this.rig(); this.syncParts(); }

  // ═════════════════════════════ 골격 ═════════════════════════════
  rig() { if (this.form === 2) this.rig2(); else this.rig1(); }
  /** 팔 i: 뿌리 (rx, ry) → 손 (hx, hy), 팔꿈치 방향 bend (1 = 위로) */
  arm(i, rx, ry, hx, hy, bend) {
    const a = this.jt.arms[i];
    a.r[0] = rx; a.r[1] = ry; a.h[0] = hx; a.h[1] = hy;
    ik2(rx, ry, hx, hy, UA, FA, bend, a.e);
    a.a = Math.atan2(hy - a.e[1], hx - a.e[0]);
  }
  rig1() {
    const s = this.pose, t = this.t, J = this.jt, sl = s.slump;
    const br = Math.sin(t * 2.2) * 2.2 * (1 - sl);
    J.footN[0] = 34; J.footN[1] = -94; J.footF[0] = -22; J.footF[1] = -94;
    J.kneeN[0] = 50 - sl * 10; J.kneeN[1] = -160 + sl * 26;
    J.kneeF[0] = -30 + sl * 8; J.kneeF[1] = -166 + sl * 26;
    J.hip[0] = 4 + sl * 6; J.hip[1] = -122 + sl * 10;
    const lean = s.lean * 16 + s.cut * 4 - s.sing * 8 + s.reach * 8;
    J.chest[0] = J.hip[0] + 10 + lean * 0.6; J.chest[1] = -164 + sl * 34 + br;
    J.sho[0] = J.hip[0] + 16 + lean; J.sho[1] = -186 + sl * 50 - s.raise * 4 + br;
    J.head[0] = J.sho[0] + 8 + lean * 0.6 + sl * 12; J.head[1] = J.sho[1] - 32 + sl * 24 - s.sing * 4;
    J.headA = -0.08 - s.sing * 0.45 + sl * 0.75 + s.lean * 0.15 + s.grin * (0.42 + Math.sin(t * 7) * 0.05);
    this.faceTail();
    const sw = (i) => Math.sin(t * 1.3 + i * 1.7) * 4;
    const blend = (b, tg) => {   // [기본, raise, sing, cut, reach, slump] 목표를 자세 가중치로 섞는다
      let x = b[0], y = b[1];
      const mixIn = (p, k) => { if (p && k > 0) { x = lerp(x, p[0], k); y = lerp(y, p[1], k); } };
      mixIn(tg.raise, s.raise); mixIn(tg.sing, s.sing); mixIn(tg.cut, Math.max(0, s.cut)); mixIn(tg.reach, s.reach); mixIn(tg.slump, sl);
      return [x, y];
    };
    const so = J.sho, ch = J.chest;
    let h0 = blend([88, -100], { raise: [64, -300], sing: [74, -244], cut: [132, -196], reach: [150, -170], slump: [44, -128] });
    if (s.throw > 0) h0 = [lerp(h0[0], -44, s.throw), lerp(h0[1], -258, s.throw)];
    else if (s.throw < 0) h0 = [lerp(h0[0], 138, -s.throw / 0.6), lerp(h0[1], -214, -s.throw / 0.6)];
    this.arm(0, so[0] + 4, so[1] + 2, h0[0] + sw(0), h0[1] + sw(1), -1);
    const h1 = blend([-52, -142], { raise: [-46, -302], sing: [-34, -250], cut: [118, -150], reach: [104, -214], slump: [10, -120] });
    this.arm(1, so[0] - 6, so[1] + 4, h1[0] + sw(2), h1[1] + sw(3), -1);
    const h2 = blend([58, -152], { raise: [104, -232], sing: [96, -206], cut: [104, -118], reach: [134, -132], slump: [52, -118] });
    this.arm(2, ch[0] + 2, ch[1] + 10, h2[0] + sw(4), h2[1] + sw(5), -1);
    const h3 = blend([-18, -150], { raise: [-84, -222], sing: [-64, -212], cut: [72, -112], reach: [112, -122], slump: [2, -118] });
    this.arm(3, ch[0] - 4, ch[1] + 10, h3[0] + sw(6), h3[1] + sw(7), -1);
  }
  /** 머리 기울기로 정수리 · 입 위치 */
  faceTail() {
    const J = this.jt, c = Math.cos(J.headA), s = Math.sin(J.headA);
    J.crown[0] = J.head[0] + (-4 * c + 34 * s); J.crown[1] = J.head[1] + (-4 * s - 34 * c);
    J.mouth[0] = J.head[0] + (6 * c - 22 * s); J.mouth[1] = J.head[1] + (6 * s + 22 * c);
  }
  rig2() {
    const s = this.pose, t = this.t, J = this.jt, sl = s.slump, rear = s.rear, lean = s.lean;
    const lift = -rear * 34 + sl * 44 + s.crouch * 20;
    const br = Math.sin(t * 2.4) * 2.5 * (1 - sl);
    J.body[0] = -28; J.body[1] = -98 + lift + br * 0.5;
    J.bodyA = -0.05 - rear * 0.2 + lean * 0.05 + sl * 0.1;
    J.hip[0] = 56; J.hip[1] = -118 + lift;
    J.chest[0] = 78 + lean * 20 - rear * 8; J.chest[1] = -160 + lift - rear * 22 + lean * 22 + br;
    J.sho[0] = 86 + lean * 38 - rear * 10; J.sho[1] = -186 + lift - rear * 30 + lean * 38 + br;
    J.head[0] = J.sho[0] + 16 + lean * 16; J.head[1] = J.sho[1] - 30 + lean * 14;
    J.headA = 0.08 + lean * 0.4 - rear * 0.32 + sl * 0.6 + s.grin * (0.42 + Math.sin(t * 7) * 0.05);
    this.faceTail();
    const sw = (i) => Math.sin(t * 1.6 + i * 1.3) * 5;
    const so = J.sho, ch = J.chest;
    const mixT = (b, raise, reach, slump) => [lerp(lerp(lerp(b[0], raise[0], s.raise), reach[0], Math.max(s.reach, lean * 0.7)), slump[0], sl), lerp(lerp(lerp(b[1], raise[1], s.raise), reach[1], Math.max(s.reach, lean * 0.7)), slump[1], sl)];
    const h0 = mixT([168, -244], [150, -330], [236, -150], [150, -40]);
    this.arm(0, so[0] + 4, so[1] + 2, h0[0] + sw(0), h0[1] + sw(1), 1);
    const h1 = mixT([126, -272], [110, -340], [214, -196], [120, -40]);
    this.arm(1, so[0] - 6, so[1] + 4, h1[0] + sw(2), h1[1] + sw(3), 1);
    const h2 = mixT([196, -14], [210, -60], [240, -24], [170, -4]);
    this.arm(2, ch[0] + 2, ch[1] + 12, h2[0] + sw(4) * 0.4, h2[1], -1);
    const h3 = mixT([168, -10], [190, -50], [220, -20], [150, -4]);
    this.arm(3, ch[0] - 4, ch[1] + 12, h3[0] + sw(5) * 0.4, h3[1], -1);
    // 거미 다리 (발은 월드에서 지형에 딛고, 관절은 몸 지역으로)
    const f = this.facing, A = this.A, lk = this.legK, mv = this.moving;
    const ry = J.body[1] + 34;
    for (const L of this.legs) {
      const home = this.bx + f * lerp(L.rx * 0.6, L.fx, lk) * (1 + sl * 0.25);
      const ph = this.gph * TAU + L.ph;
      let fx = home + f * Math.sin(ph) * 34 * mv, fy;
      if (this.air) { fx = home - f * 16; fy = this.by + 18 + Math.sin(t * 9 + L.i) * 6; }
      else fy = groundTop(this.world, A, fx - 3, fx + 3, this.by) - Math.max(0, Math.cos(ph)) * 30 * mv;
      L.fxw = fx; L.fyw = fy;
      L.rl[0] = L.rx; L.rl[1] = ry + (L.near ? 0 : -6);
      L.fl[0] = (fx - this.bx) * f; L.fl[1] = fy - this.by;
      ik2(L.rl[0], L.rl[1], L.fl[0], L.fl[1], LF * (0.5 + 0.5 * lk), LT * (0.5 + 0.5 * lk), 1, L.kl);
      L.kx = this.bx + L.kl[0] * f; L.ky = this.by + L.kl[1];
    }
  }
  syncParts() {
    const J = this.jt, P = this._pt;
    this.toWorld(J.head[0], J.head[1], P); this.faceP.x = P.x; this.faceP.y = P.y;
    this.toWorld(J.mouth[0], J.mouth[1], P); this.mouthP.x = P.x; this.mouthP.y = P.y;
    const pf = this.pFace;
    pf.x = this.faceP.x - 35; pf.y = this.faceP.y - 36; pf.w = 70; pf.h = this.form === 2 ? 108 : 118;
    const pe = this.pEye; pe.x = this.mouthP.x - 18; pe.y = this.mouthP.y - 22;
    const pc = this.pCradle, cb = this.cBody, ct = this.cTop;
    if (this.form === 1) {
      pc.x = this.bx - 108; pc.y = this.by + this.bob - 104; pc.w = 216; pc.h = 104;
      cb.x = this.bx - 56; cb.y = this.by + this.bob - 226; cb.w = 112; cb.h = 220;
    } else {
      pc.x = this.bx - 150; pc.y = this.by - 178; pc.w = 300; pc.h = 178;
      cb.x = this.bx - 120; cb.y = this.by - 164; cb.w = 240; cb.h = 158;
      ct.x = this.faceP.x - 30; ct.y = this.faceP.y - 36; ct.w = 60; ct.h = 100;
    }
    for (const h of this.heads) { const L = this.legs[h.leg]; h.x = L.kx; h.y = L.ky; h.part.x = h.x - 17; h.part.y = h.y - 17; }
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0) return L;
    if (this.eyeT > 0 && this.mouthK > 0.45) L.push(this.pEye);
    if (this.form === 2) for (const h of this.heads) if (h.alive && h.grow > 0.9) L.push(h.part);
    L.push(this.pFace, this.pCradle);
    return L;
  }
  /** 접촉은 몸통만. 돌진 · 붕괴 · 가짜 죽음 동안은 없다 (돌진 피해는 몸을 따라가는 지대가 맡는다) */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.dying > 0 || this.collapsed || this.rush || this.dawn?.fake) return L;
    L.push(this.cBody);
    if (this.form === 2) L.push(this.cTop);
    return L;
  }
  hitHead(h, dmg) {
    if (!h.alive || this.dying > 0 || this.dead) return;
    h.hp -= Math.max(1, dmg || 0); h.hitT = 0.15;
    if (h.hp > 0) return;
    h.alive = false; h.hp = 0; h.grow = 0;
    const w = this.world;
    w.fx.burst('shard', h.x, h.y, 16, { color: PORC, speed: 300 });
    w.fx.burst('blood', h.x, h.y, 10, { speed: 200 });
    w.fx.ring(h.x, h.y, { color: '#ffd0f0', r0: 6, r1: 60, life: 0.35, width: 4 });
    audio.sfx('break_wall', { pitch: 1.7, vol: 0.6 }); audio.sfx('ghost', { pitch: 2.0, vol: 0.5 });
    if (this.heads.every((x) => !x.alive)) this.pendCollapse = true;
  }
  regrowHeads() { for (const h of this.heads) { h.alive = true; h.hp = h.max; h.grow = 0; h.hitT = 0; } }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (part === this.pFace || part === this.pEye) { if (Math.random() < 0.7) world.fx.burst('shard', x, y, 3, { color: PORC, speed: 180 }); }
    else if (part === this.pCradle && Math.random() < 0.5) world.fx.burst('spark', x, y, 3, { color: '#c0b0c8' });
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
    // 인형 머리를 모두 부순 뒤 안전한 때에 붕괴
    if (this.pendCollapse && !this._tr && !(this.dying > 0) && !this.dawn && this.state !== 'collapse' && !this.invuln) {
      this.pendCollapse = false;
      this.cancelPattern();
      this.setState('collapse');
    }
  }
  ambient(dt, world) {
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (this.form === 2 ? 5 : 3);
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      if (this.form === 1) world.fx.emit('magic', this.bx + rand(-100, 100), this.by + this.bob - rand(0, 60), { color: DREAM, speed: 18, size: 2 });
      else {
        const P = this.toWorld(rand(-120, 40), rand(-150, -60));
        world.fx.emit(Math.random() < 0.6 ? 'magic' : 'bloodmist', P.x, P.y, { color: DREAM, speed: 20 });
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
    if (this.form === 2) { r.x = this.bx - 320; r.y = this.by - 420; r.w = 640; r.h = 450; }
    else { r.x = this.bx - 280; r.y = this.by + this.bob - 460; r.w = 560; r.h = 520; }
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
      this.setPose({ sing: 1, raise: 0.5 });
      audio.sfx('ghost', { pitch: 0.55, vol: 0.9 });
      this.tb = this.hoverB('mid'); this.spdY = 120;
      world.fx.ring(this.faceP.x, this.faceP.y, { color: DREAM, r0: 20, r1: 200, life: 0.7, width: 5 });
    }
    if (this.at(0.9)) this.setPose({ sing: 0, raise: 0 });
    if (t >= 1.3) this.done(0.8);
  }
  idleMove(dt, world, t) {
    this.faceP_();
    const p = this.P, px = p ? p.cx : this.bx;
    const side = Math.sign(this.bx - px) || -this.facing;
    if (this.form === 1) {
      this.tx = this.laneX(px + side * 300, 80);
      this.tb = this.hoverB('low') - 36 - Math.sin(this.t * 0.7) * 42;
      this.spd = 130; this.spdY = 90;
    } else {
      const tx = this.laneX(px + side * 250, this.w / 2);
      this.mvx = approach(this.mvx, clamp((tx - this.bx) * 1.5, -110, 110), 420 * dt);
    }
  }
  /** 패턴 시작 공통: 멈추거나 (짐승) 공중 높이를 바꾼다 (노파) */
  hold(alt = 'mid') {
    if (this.form === 1) { this.tx = this.laneX(this.bx, 80); this.tb = this.hoverB(alt); this.spdY = 130; }
    else this.mvx = 0;
  }

  // ── lullaby: 노래 1.0초 → 틈(40°)이 있는 느린 고리 3개 (속도 200, 굵기 14) · 어둠 +0.2 (4초) ──
  s_lullaby(dt, world, t) {
    const n = this.inferno ? 4 : 3;
    if (this.at(0.001)) {
      telegraph(this, 1.0, { sfx: 'warning', vol: 0.35, pitch: 0.8 });
      this.setPose({ sing: 1, raise: 0.3 });
      this.hold('mid');
      audio.sfx('ghost', { pitch: 0.45, vol: 0.8 });
      darken(this, 0.2, 4);
    }
    if (this.every(0.16, 0, 1.0 + n * 0.6)) world.fx.emit('magic', this.mouthP.x + rand(-6, 6), this.mouthP.y, { color: DREAM_L, speed: 60, angle: -PI / 2, spread: 1.2, size: 3 });
    for (let i = 0; i < n; i++) if (this.at(1.0 + i * 0.6)) this.ring(i);
    if (t >= 1.0 + n * 0.6 + 0.3) { this.setPose({ sing: 0, raise: 0 }); this.done(1.0); }
  }
  ring(i) {
    const m = this.mouthP, A = this.A;
    const R1 = Math.hypot(Math.max(m.x - A.x0, A.x1 - m.x), Math.max(m.y - (A.top ?? 0), A.floor - m.y)) + 60;
    const g1 = rand(0.22, 0.78) * PI;              // 아래쪽 반원 어딘가 (바닥에 선 플레이어가 찾아 들어갈 틈)
    const g2 = g1 + PI * rand(0.8, 1.2);
    ringWave(this, m.x, m.y, { r0: 26, r1: R1, speed: 200, th: 14, gaps: [g1, g2], gapW: 40 * PI / 180, mv: 0.9, element: 'dark', color: '#d8a0ff', warn: 0, sfx: null, kb: [240, -260] });
    audio.sfx('magic', { pitch: 0.5 + i * 0.12, vol: 0.5 });
    this.world.fx.ring(m.x, m.y, { color: DREAM, r0: 10, r1: 70, life: 0.45, width: 3 });
  }

  // ── threads: 세로 실 5가닥 예고 0.7초 → 각자 200px 옆으로 1.0초 동안 쓸어 간다 (mv 1.1) ──
  s_threads(dt, world, t) {
    const n = this.inferno ? 7 : 5;
    if (this.at(0.001)) {
      telegraph(this, 0.7, { sfx: 'warning', vol: 0.4 });
      this.setPose({ raise: 1, sing: 0.3 });
      this.hold('mid');
      audio.sfx('whip', { pitch: 0.5 });
      const A = this.A, p = this.P, seg = A.w / n;
      let near = -1, nd = Infinity;
      const xs = [];
      for (let i = 0; i < n; i++) {
        const x = clamp(A.x0 + seg * (i + 0.5) + rand(-0.3, 0.3) * seg, A.x0 + 20, A.x1 - 20);
        xs.push(x);
        const d = p ? Math.abs(p.cx - x) : 0;
        if (d < nd) { nd = d; near = i; }
      }
      xs.forEach((x, i) => {
        const dir = i === near && p ? (Math.sign(p.cx - x) || 1) : (Math.random() < 0.5 ? -1 : 1);
        this.thread(x, dir, i * 0.04);
      });
    }
    if (this.at(0.7)) this.setPose({ raise: 0.6, reach: 1 });
    if (t >= 2.1) { this.setPose({ raise: 0, reach: 0, sing: 0 }); this.done(1.0); }
  }
  thread(x, dir, delay) {
    const A = this.A, top = (A.top ?? 0) - 20, bot = A.floor;
    this.zone({
      x: x - 10, y: top, w: 20, h: bot - top, warn: 0.7 + delay, life: 1.0, mv: 1.1, element: 'dark', kb: [300, -300], z: 7,
      line: { x0: x, y0: top, x1: x, y1: bot, th: 12 },
      tick: (z) => {
        if (z.t < z.warn) return;
        const k = clamp((z.t - z.warn) / z.dur, 0, 1), e = k * k * (3 - 2 * k), xx = x + dir * 200 * e;
        z.line.x0 = z.line.x1 = xx; z.x = xx - 10;
      },
      onStart: () => audio.sfx('whip', { pitch: 0.7, vol: 0.4 }),
      paint: (ctx, z, w) => paintThread(ctx, z, w, top, bot, dir),
    });
  }

  // ── dolls: 도자기 인형 셋을 던진다 → 땅에 닿으면 기어 오는 지대 (90px/s, 3초) → 닿거나 시간이 다하면 폭발 (반지름 60, mv 1.2) ──
  s_dolls(dt, world, t) {
    if (this.at(0.001)) {
      telegraph(this, 0.6, { sfx: 'warning', vol: 0.35, pitch: 1.1 });
      this.setPose({ throw: 1 });
      this.hold('mid');
      audio.sfx('ghost', { pitch: 1.4, vol: 0.5 });
    }
    for (let i = 0; i < 3; i++) if (this.at(0.6 + i * 0.26)) { this.setPose({ throw: i % 2 ? 1 : -0.6 }); this.throwDoll(i); }
    if (this.at(1.4)) this.setPose({ throw: 0 });
    if (t >= 1.9) this.done(1.0);
  }
  throwDoll(i) {
    const o = this.handW(0), p = this.P, A = this.A;
    const tx = clamp((p ? p.cx : A.cx) + (i - 1) * 150 + rand(-30, 30), A.x0 + 30, A.x1 - 30);
    const T_ = 0.85, g = 2000, ty = A.floor - 14;
    const vx = (tx - o.x) / T_, vy = (ty - o.y - 0.5 * g * T_ * T_) / T_;
    this.shoot({
      x: o.x, y: o.y, vx, vy, w: 22, h: 22, life: 3, behavior: 'arc', collideWalls: 'land', render: dollRender, spin: 9 * (Math.sign(vx) || 1),
      attack: { mv: 0.8, kb: [200, -300] },
      onLand: (pr) => { pr.dead = true; this.crawler(pr.cx, pr.bottom); },
      onExpire: (pr, w, byHit) => { if (!byHit && !pr.landedOnce) this.crawler(pr.cx, Math.min(A.floor, pr.bottom)); },
    });
    audio.sfx('whip', { pitch: 1.3, vol: 0.5 });
  }
  crawler(x, y) {
    if (this.dying > 0 || this.dead) return null;
    const A = this.A;
    y = clamp(y, (A.top ?? 0) + 30, A.floor);
    return this.zone({
      x: x - 16, y: y - 24, w: 32, h: 24, warn: 0, life: 3.0, harmless: true, z: 6,
      data: { fuse: -1, vx: 0, vy: 0, dir: 1, seed: Math.random() * 10, boomed: false },
      tick: (z, w, dt) => {
        const d = z.data;
        if (d.boomed) return;
        if (d.fuse >= 0) { d.fuse += dt; if (d.fuse >= 0.3) this.dollBoom(z); return; }
        const p = w.player;
        if (!p || p.dead || w.cutscene) return;
        const hb = p.hurtbox?.() ?? p;
        const dir = Math.sign(hb.x + hb.w / 2 - z.cx) || d.dir;
        d.dir = dir;
        d.vx = approach(d.vx, dir * 90, 360 * dt);
        const nx = z.x + d.vx * dt, ex = dir > 0 ? nx + z.w : nx;
        if (!w.map?.isSolidPx?.(ex, z.y + z.h * 0.5)) z.x = clamp(nx, A.x0, A.x1 - z.w); else d.vx = 0;
        const gy = floorUnder(w, z.cx, z.bottom - 6, 40);
        if (gy === null) { d.vy = Math.min(900, d.vy + 2000 * dt); z.y += d.vy * dt; const g2 = floorUnder(w, z.cx, z.bottom - 30, 40); if (g2 !== null && z.bottom > g2) { z.y = g2 - z.h; d.vy = 0; } }
        else { z.y = gy - z.h; d.vy = 0; }
        if (z.bottom > A.floor) z.y = A.floor - z.h;
        if (hb.x < z.x + z.w + 6 && hb.x + hb.w > z.x - 6 && hb.y < z.y + z.h + 6 && hb.y + hb.h > z.y - 6) { d.fuse = 0; audio.sfx('clock_tick', { pitch: 1.6, vol: 0.5 }); }
      },
      onEnd: (z) => this.dollBoom(z),
      paint: (ctx, z, w) => paintCrawler(ctx, z, w),
    });
  }
  dollBoom(z) {
    const d = z.data;
    if (d.boomed) return;
    d.boomed = true; z.dead = true;
    if (this.dying > 0 || this.dead) return;
    const x = z.cx, y = z.bottom - 18;
    strikeCircle(this, x, y, 60, { warn: 0, life: 0.25, mv: 1.2, color: '#e8c8ff', sfx: 'explode', burstFx: 'magic' });
    this.world.fx.burst('shard', x, y, 12, { color: PORC, speed: 280 });
  }

  // ── scissors: 경기장을 가로지르는 사선 두 줄 예고 0.8초 → X 자로 자른다 (굵기 30, mv 1.6) ──
  s_scissors(dt, world, t) {
    if (this.at(0.001)) {
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.45 });
      this.setPose({ cut: 1, raise: 0.2 });
      this.hold('mid');
      const A = this.A, p = this.P;
      const cx = p ? p.cx : A.cx, cy = clamp(p ? p.cy : A.floor - 60, (A.top ?? 0) + 80, A.floor - 30);
      for (const s of [-1, 1]) {
        const a = s * 0.72, dx = Math.cos(a), dy = Math.sin(a);
        const P0 = clipRay(cx, cy, -dx, -dy, A), P1 = clipRay(cx, cy, dx, dy, A);
        strikeLine(this, P0.x, P0.y, P1.x, P1.y, { warn: 0.8, life: 0.3, th: 30, mv: 1.6, color: '#ff9ad0', sfx: null, kb: [520, -420], paint: bladePaint(s) });
      }
      audio.sfx('clang', { pitch: 0.6, vol: 0.5 });
    }
    if (this.at(0.8)) { this.setPose({ cut: -0.4 }); audio.sfx('slash_heavy', { pitch: 0.7 }); audio.sfx('clang', { pitch: 1.3 }); impact(world, { shake: 8, time: 0.3 }); }
    if (this.at(1.1)) this.setPose({ cut: 0, raise: 0 });
    if (t >= 1.4) this.done(1.1);
  }

  // ── cradleRush (P2+): 먼지 0.8초 → 경기장 끝까지 돌진 (지형을 타고 넘는다) → 벽을 차고 뛰어오른다 (mv 1.7) ──
  s_cradleRush(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP_();
      const dir = this.facing;
      this.rushDir = dir;
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.45 });
      this.setPose({ crouch: 1, lean: 0.6 });
      this.mvx = 0;
      const hh = this.form === 2 ? 200 : 250;
      const x0 = dir > 0 ? this.bx : A.x0, x1 = dir > 0 ? A.x1 : this.bx;
      this.zone({ x: x0, y: A.floor - hh, w: Math.max(10, x1 - x0), h: hh, warn: 0, life: 0.8, harmless: true, z: 5,
        paint: (ctx, z, w) => { warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / 0.8, 0, 1), DREAM, w.time); paintArrows(ctx, z, dir, w.time); } });
      if (this.form === 1) { this.tb = A.floor - 30; this.spdY = 260; }
      audio.sfx('ghost', { pitch: 0.6 });
    }
    if (t < 0.8 && this.every(0.1)) world.fx.emit('dust', this.bx + rand(-100, 100), A.floor - 4, { speed: 80, angle: -PI / 2, spread: 0.8 });
    if (this.at(0.8)) {
      const dir = this.rushDir;
      this.rush = { dir, phase: 'run', t1: 0, t2: 0 };
      this.setPose({ crouch: 0, lean: 1 });
      if (this.form === 2) this.mvx = dir * 760;
      const rz = this.zone({
        x: this.cBody.x, y: this.cBody.y, w: this.cBody.w, h: this.cBody.h, warn: 0, life: 5, mv: 1.7, kb: [620, -460], rehit: 0.6, z: 6,
        tick: (z) => {
          if (!this.rush || this.state !== 'cradleRush') { z.dead = true; return; }
          const b = this.cBody; z.x = b.x; z.y = b.y; z.w = b.w; z.h = b.h;
        },
      });
      rz.paint = null;
      audio.sfx('dash', { pitch: 0.6 }); audio.sfx('boss_roar', { pitch: 1.6, vol: 0.5 });
    }
    const r = this.rush;
    if (r) {
      if (r.phase === 'run') {
        if (this.form === 1) { this.tx = this.bx + r.dir * 1000; this.spd = 760; this.tb = A.floor - 30; }
        else this.mvx = r.dir * 760;
        if (Math.random() < 0.7 * (world.fx.quality ?? 1)) world.fx.emit('dust', this.bx - r.dir * 90, Math.min(A.floor, this.by) - 4, { speed: 120, angle: -PI / 2 - r.dir * 0.6, spread: 0.5 });
        const edge = r.dir > 0 ? A.x1 - this.w / 2 - 2 : A.x0 + this.w / 2 + 2;
        if ((r.dir > 0 && this.bx >= edge) || (r.dir < 0 && this.bx <= edge) || t > 3.8) {
          // 벽을 차고 뛰어오른다
          r.phase = 'leap'; r.t1 = t;
          impact(world, { shake: 10, time: 0.3, stop: 0.05 });
          audio.sfx('hit_heavy', { pitch: 0.6 }); audio.sfx('break_wall', { pitch: 0.8, vol: 0.5 });
          world.fx.burst('dust', r.dir > 0 ? A.x1 - 10 : A.x0 + 10, this.by - 90, 16, { speed: 240 });
          if (this.form === 2) { this.air = true; this.mvy = -1050; this.mvx = -r.dir * 430; }
          else { this.tb = this.hoverB('high'); this.spdY = 700; this.tx = this.laneX(this.bx - r.dir * 420, 80); this.spd = 480; }
          this.facing = -r.dir;
          this.setPose({ lean: 0.2, crouch: 0.4 });
        }
      } else if (r.phase === 'leap') {
        const landed = this.form === 2 ? (!this.air && t - r.t1 > 0.12) : t - r.t1 > 0.75;
        if (landed) {
          r.phase = 'land'; r.t2 = t; this.mvx = 0;
          impact(world, { shake: 12, time: 0.35 });
          audio.sfx('explode', { pitch: 0.5, vol: 0.6 });
          world.fx.burst('dust', this.bx, Math.min(A.floor, this.by) - 6, 20, { speed: 260, angle: -PI / 2, spread: 1.4 });
          this.setPose({ crouch: 1, lean: 0 });
        }
      } else if (t - r.t2 > 0.35) { this.rush = null; this.setPose({ crouch: 0, lean: 0 }); this.done(1.0); return; }
    }
    if (t > 6.5) { this.rush = null; this.mvx = 0; this.setPose({ crouch: 0, lean: 0 }); this.done(1.0); }   // 안전장치
  }

  // ── faces (P2+): 경기장 곳곳의 잠든 얼굴 여섯이 차례로 깨어나 플레이어에게 비명 탄 (속도 400, mv 0.8) ──
  s_faces(dt, world, t) {
    const n = 6, gap = 0.4;
    if (this.at(0.001)) {
      telegraph(this, 0.6, { sfx: 'warning', vol: 0.35, pitch: 1.2 });
      warnText(this, '잠든 얼굴들이 눈을 뜬다!', DREAM_L);
      this.setPose({ raise: 1, sing: 0.5 });
      this.hold('mid');
      audio.sfx('ghost', { pitch: 0.8 });
      const A = this.A, top = A.top ?? 0;
      const order = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
      for (let i = 0; i < n; i++) {
        const x = A.x0 + A.w * (i + 0.5) / n + rand(-40, 40);
        const y = clamp(top + 110 + (i % 2) * 120 + rand(-20, 20), top + 70, A.floor - 190);
        this.faceProp(x, y, 0.6 + order[i] * gap);
      }
    }
    if (this.at(1.0)) this.setPose({ raise: 0.5 });
    if (t >= 0.6 + n * gap + 0.9) { this.setPose({ raise: 0, sing: 0 }); this.done(1.0); }
  }
  faceProp(x, y, wake) {
    return this.zone({
      x: x - 30, y: y - 36, w: 60, h: 72, warn: 0, life: wake + 1.2, harmless: true, z: 7,
      data: { x, y, wake, fired: false, seed: rand(0, 10) },
      tick: (z) => {
        const d = z.data;
        d.y = y + Math.sin(z.t * 1.6 + d.seed) * 6;
        if (!d.fired && z.t >= d.wake + 0.35) { d.fired = true; this.wail(d.x, d.y + 10); }
      },
      paint: (ctx, z) => paintSleeper(ctx, z),
    });
  }
  wail(x, y) {
    if (this.dying > 0 || this.dead) return;
    const p = this.P;
    const a = p ? Math.atan2(p.cy - y, p.cx - x) : PI / 2;
    this.shoot({ x, y, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, w: 22, h: 22, life: 4, render: wailRender, attack: { mv: 0.8, element: 'dark' }, light: { r: 70, color: DREAM, i: 0.5 } });
    audio.sfx('ghost', { pitch: 1.6 + Math.random() * 0.3, vol: 0.45 });
  }

  // ── falseDawn (P3, 싸움당 한 번): 가짜 클리어 → '…라고 생각했니?' + 위에서 바늘 12발. 2.4초 무적 ──
  s_falseDawn(dt, world, t) {
    if (this.at(0.001)) {
      this.dawnUsed = true;
      this.dawn = { fake: true };
      this.invuln = true; this.harmless = true; this.telegraph = false;
      this.mvx = 0; this.eyeT = 0; this.rush = null;
      this.setPose({ slump: 1, raise: 0, sing: 0, lean: 0, grin: 0, reach: 0 });
      if (this.form === 1) { this.tb = this.A.floor - 16; this.spdY = 220; }
      impact(world, { shake: 12, time: 0.6, flash: '#ffffff', fa: 0.85 });
      this._fakeBanner = world.banner = { text: 'STAGE CLEAR', sub: '마라 격파!', t: 1.0, color: '#ffe070', big: true };
      muteMusic(this, 1.0);
      audio.sfx('boss_die', { vol: 0.9 });
      world.fx.burst('magic', this.cx, this.cy, 30, { color: DREAM, speed: 260 });
    }
    if (this.at(1.0)) {
      this.dawn = { fake: false };
      this.harmless = false;
      this._fakeBanner = world.banner = { text: '…라고 생각했니?', sub: '', t: 1.4, color: '#c060ff', big: true };
      this.setPose({ slump: 0, grin: 1, raise: 1 });
      audio.sfx('ghost', { pitch: 0.5, vol: 1 }); audio.sfx('boss_roar', { pitch: 1.7, vol: 0.8 });
      impact(world, { shake: 10, time: 0.5, flash: '#6a00a0', fa: 0.4 });
      const A = this.A, p = this.P;
      this.needleO = { x: clamp(p ? p.cx : A.cx, A.x0 + 60, A.x1 - 60), y: (A.top ?? 0) + 34 };
      warnMark(this, this.needleO.x, this.needleO.y + 34, 0.3, DREAM);
    }
    if (this.at(1.3)) this.needles();
    if (this.at(2.0)) this.setPose({ raise: 0, grin: 0.3 });
    if (t >= 2.4) { this.invuln = false; this.harmless = false; this.dawn = null; this._fakeBanner = null; this.setPose({ grin: 0 }); this.done(1.0); }
  }
  needles() {
    const A = this.A, o = this.needleO ?? { x: A.cx, y: (A.top ?? 0) + 34 };
    for (let i = 0; i < 12; i++) {
      const a = lerp(0.3, PI - 0.3, i / 11);
      this.shoot({ x: o.x + Math.cos(a) * 18, y: o.y + Math.sin(a) * 18, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, w: 12, h: 12, life: 3, render: needleRender, attack: { mv: 0.9 }, light: { r: 40, color: DREAM, i: 0.35 } });
    }
    audio.sfx('dagger', { pitch: 0.7 }); audio.sfx('magic', { pitch: 1.4, vol: 0.5 });
    this.world.fx.ring(o.x, o.y, { color: DREAM, r0: 10, r1: 90, life: 0.35, width: 4 });
  }

  // ── scream (P3): 꿰맨 입이 세로로 찢어지며 거대한 눈 (약점 2.5초) → 앞쪽 비명 원뿔 400×200 (예고 0.6, 0.8초, mv 1.3) ──
  s_scream(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP_(); this.mvx = 0;
      this.eyeT = 2.5;
      this.setPose({ lean: this.form === 2 ? 1 : 0.5, grin: 0, raise: 0.4 });
      if (this.form === 1) { this.tx = this.laneX(this.bx, 80); this.tb = this.hoverB('low'); this.spdY = 160; }
      audio.sfx('ghost', { pitch: 0.4, vol: 1 }); audio.sfx('break_wall', { pitch: 1.8, vol: 0.4 });
      world.fx.burst('blood', this.mouthP.x, this.mouthP.y, 8, { speed: 120 });
    }
    if (this.at(0.9)) this.screamZone();
    if (this.at(2.4)) this.setPose({ lean: 0, raise: 0 });
    if (t >= 2.7) this.done(1.0);
  }
  screamZone() {
    const f = this.facing, m = this.mouthP, A = this.A;
    const cy = clamp(Math.max(m.y, A.floor - 110), (A.top ?? 0) + 100, A.floor - 100);
    const x0 = m.x;
    const rects = [[0, 130, 50], [130, 270, 78], [270, 400, 100]].map(([a, b, hh]) => ({ x: f > 0 ? x0 + a : x0 - b, y: cy - hh, w: b - a, h: hh * 2 }));
    this.zone({
      x: Math.min(x0, x0 + f * 400), y: cy - 100, w: 400, h: 200, warn: 0.6, life: 0.8, mv: 1.3, kb: [760, -560], element: 'dark', z: 7,
      rects: () => rects,
      onStart: (z, w) => { audio.sfx('boss_roar', { pitch: 1.9 }); audio.sfx('ghost', { pitch: 0.3 }); impact(w, { shake: 10, time: 0.5 }); },
      paint: (ctx, z, w) => paintScream(ctx, z, w, x0, m.y, cy, f, rects),
    });
  }

  // ── collapse (보조): 인형 머리 셋을 모두 부수면 3초 무너진다 (접촉 없음) → 일어서며 머리가 다시 돋는다 ──
  s_collapse(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.collapsed = true; this.mvx = 0; this.eyeT = 0; this.rush = null;
      this.setPose({ slump: 1, raise: 0, lean: 0, crouch: 0, sing: 0, reach: 0 });
      if (this.form === 1) { this.tb = A.floor - 10; this.spdY = 260; }
      audio.sfx('break_wall', { pitch: 1.2 }); audio.sfx('ghost', { pitch: 1.6, vol: 0.6 });
      impact(world, { shake: 10, time: 0.4 });
    }
    if (this.every(0.28, 0.2, 2.8)) { const a = this.t * 4; world.fx.emit('magic', this.faceP.x + Math.cos(a) * 30, this.faceP.y - 36, { color: '#ffd0f0', speed: 20, size: 3 }); }
    if (t >= 3.0) {
      this.collapsed = false;
      this.setPose({ slump: 0 });
      if (this.heads.every((h) => !h.alive)) this.regrowHeads();
      this.done(0.8);
    }
  }

  // ── 전환 ──
  /** dreamshift (60%): 몸을 낮추며 요람과 노파가 뒤엉킨다 → 가운데(applyAt)에 form2 · 화면 색조 · 박동 2.6초 */
  s_dreamshift(dt, world, t) {
    if (this.at(0.001)) {
      this.eyeT = 0; this.rush = null; this.collapsed = false; this.mvx = 0;
      this.setPose({ sing: 0, raise: 1, slump: 0, lean: 0, cut: 0, throw: 0, grin: 1 });
      if (this.form === 1) { this.tx = this.laneX(this.bx, F2.w / 2); this.tb = this.A.floor - 20; this.spdY = 240; }
      audio.sfx('ghost', { pitch: 0.35, vol: 1 }); audio.sfx('boss_roar', { pitch: 1.4, vol: 0.7 });
      impact(world, { shake: 8, time: 0.8 });
      world.fx.ring(this.faceP.x, this.faceP.y, { color: DREAM, r0: 20, r1: 320, life: 0.8, width: 8 });
    }
    this.morph = this.form === 1 ? clamp(t / 1.0, 0, 1) : Math.max(0, 1 - (t - 1.0) / 0.6);
    if (this.every(0.1, 0, 1.6)) { const P = this.toWorld(rand(-100, 100), rand(-140, -20)); world.fx.emit('dark', P.x, P.y, { speed: 90 }); }
    if (this.at(1.6)) this.setPose({ raise: 0, grin: 0 });
    this.transitionTick(dt, world, t);
    if (this.state !== 'dreamshift') this.morph = 0;
  }
  /** phase2 (30%): 짐승이 뒷다리로 일어서며 창살 사이로 피를 쏟는다 → falseDawn 강제 */
  s_phase2(dt, world, t) {
    if (this.at(0.001)) {
      this.eyeT = 0; this.rush = null; this.collapsed = false; this.mvx = 0;
      this.setPose({ rear: 1, raise: 1, grin: 1, slump: 0 });
      audio.sfx('boss_roar', { pitch: 1.2 }); audio.sfx('ghost', { pitch: 0.5 });
      impact(world, { shake: 12, time: 0.7 });
    }
    if (this.every(0.15, 0, 1.2)) { const P = this.toWorld(rand(-120, 60), rand(-120, -60)); world.fx.emit('blood', P.x, P.y, { speed: 80 }); }
    if (this.at(1.1)) this.setPose({ rear: 0, raise: 0, grin: 0 });
    this.transitionTick(dt, world, t);
  }
  applyPhase(k, world = this.world) {
    if (k === 1) this.enterForm2(world);
  }
  enterForm2(world) {
    if (this.form === 2) return;
    const A = this.A;
    this.setForm(2);
    this.bx = this.laneX(this.bx, F2.w / 2);
    this.by = groundTop(world, A, this.bx - 96, this.bx + 96, A.floor);
    this.air = false; this.mvx = 0; this.mvy = 0; this.legK = 0;
    this.place(); this.rig(); this.syncParts();
    screenTint(this, { color: '#3c005a', alpha: 0.25, edge: '#b070ff' });
    setBeat(this, 2.6);
    world.fx.burst('dark', this.bx, this.by - 90, 30, { speed: 300 });
    world.fx.burst('shard', this.bx, this.by - 90, 20, { color: PORC, speed: 320 });
    world.fx.ring(this.bx, this.by - 90, { color: DREAM, r0: 30, r1: 360, life: 0.7, width: 10 });
    impact(world, { shake: 14, time: 0.6, flash: '#5a0090', fa: 0.35 });
    audio.sfx('break_wall', { pitch: 0.7 }); audio.sfx('boss_roar', { pitch: 1.0 });
  }
  onCancel(world = this.world) {
    this.rush = null; this.mvx = 0; this.collapsed = false; this.eyeT = 0;
    if (this.dawn && world && world.banner && world.banner === this._fakeBanner) world.banner = null;
    this.dawn = null; this._fakeBanner = null;
    this.relax();
    if (this.form === 1) { this.tb = this.hoverB('mid'); this.spd = 150; this.spdY = 170; }
  }
  onReset(world = this.world) {
    this.onCancel(world);
    this.setForm(1);
    this.morph = 0; this.legK = 0; this.air = false; this.mvy = 0; this.mouthK = 0; this.dawnUsed = false; this.pendCollapse = false;
    for (const h of this.heads) { h.alive = true; h.hp = h.max; h.grow = 1; h.hitT = 0; }
    for (const k in this.pt) { this.pt[k] = 0; this.pose[k] = 0; }
    this.bx = this.laneX(this.bx, 80); this.by = this.tb = this.hoverB('mid'); this.tx = this.bx;
    this.place(); this.rig(); this.syncParts();
  }

  // ═════════════════════════════ 사망 ═════════════════════════════
  onDeath(world) {
    this.dying = 3.4; this.dieT = 0;
    this.rush = null; this.collapsed = false; this.eyeT = 0; this.mvx = 0; this.dawn = null;
    this.setPose({ slump: 1, raise: 0, sing: 0.6, lean: 0, grin: 0, rear: 0, crouch: 0, reach: 0 });
    if (this.form === 1) { this.tb = this.A.floor - 8; this.spdY = 60; }
    audio.sfx('ghost', { pitch: 0.3, vol: 1 });
    world.fx.ring(this.faceP.x, this.faceP.y, { color: DREAM, r0: 30, r1: 380, life: 0.9, width: 10 });
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    this.motion(dt, world);
    const q = world.fx.quality ?? 1;
    if (Math.random() < 0.6 * q) { const P = this.toWorld(rand(-110, 110), rand(-200, 0)); world.fx.emit('magic', P.x, P.y, { color: DREAM_L, speed: 30, angle: -PI / 2, spread: 0.8 }); }
    if (this.dieT > 1.6 && Math.random() < 0.4 * q) world.fx.emit('dark', this.bx + rand(-120, 120), this.by - rand(0, 160), { speed: 40 });
  }
  /** 사망: 요람이 멈추고 웅크린 채 서서히 사라진다 — 보랏빛 심장만 남는다 */
  render(ctx, world) {
    if (this.dying > 0) {
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * (1 - clamp((this.dieT - 1.4) / 1.6, 0, 1));
      if (ctx.globalAlpha > 0.01) super.render(ctx, world);
      ctx.globalAlpha = a0;
      this.drawHeart(ctx);
      return;
    }
    super.render(ctx, world);
  }
  drawHeart(ctx) {
    if (R.fl || this.dieT < 1.0) return;
    const k = clamp((this.dieT - 1.0) / 0.8, 0, 1) * clamp(this.dying / 0.5, 0, 1);
    const x = this.bx, y = (this.form === 2 ? this.by - 110 : this.by + this.bob - 70) - (this.dieT - 1) * 8;
    glow(ctx, x, y, 110, DREAM, 0.7 * k);
    ctx.save(); ctx.translate(x, y); const sc = 1.3 + Math.sin(this.t * 7) * 0.08; ctx.scale(sc, sc);
    ctx.globalAlpha *= k;
    ctx.fillStyle = '#b060e8';
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.bezierCurveTo(-26, -4, -14, -24, 0, -10); ctx.bezierCurveTo(14, -24, 26, -4, 0, 14); ctx.fill();
    ctx.strokeStyle = '#3a0a50'; ctx.lineWidth = 1.5; ctx.stroke();
    glow(ctx, -4, -6, 18, '#ffffff', 0.6 * k, true);
    ctx.restore();
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    const dk = this.dying > 0 ? clamp(1 - (this.dieT - 1.4) / 1.6, 0, 1) : 1;
    L.add(this.faceP.x, this.faceP.y, 170, DREAM, 0.6 * dk);
    L.add(this.bx, this.form === 2 ? this.by - 100 : this.by + this.bob - 60, 230, '#8a60c0', 0.4 * dk);
    if (this.mouthK > 0.1) L.add(this.mouthP.x, this.mouthP.y, 110, '#ff80c0', 0.7 * this.mouthK);
    if (this.form === 2) for (const h of this.heads) if (h.alive && h.grow > 0.5) L.add(h.x, h.y, 50, '#ffd0f0', 0.25);
    if (this.dying > 0 && this.dieT > 1) L.add(this.bx, this.form === 2 ? this.by - 110 : this.by - 70, 160, DREAM, 0.8 * clamp(this.dieT - 1, 0, 1));
  }

  // ═════════════════════════════ 그리기 ═════════════════════════════
  paintBody(ctx, world, flash) {
    ctx.save();
    ctx.translate(this.bx, this.by + this.bob);
    ctx.scale(this.facing, 1);
    if (this.form === 1) { ctx.translate(0, -50); ctx.rotate(this.rock); ctx.translate(0, 50); }
    if (flash) {
      // 피격 섬광: 요람과 노파 몸통 · 머리만 (실 머리카락 · 인형 다리까지 하얗게 하면 눈이 아프다)
      ctx.globalAlpha *= 0.7;
      if (this.form === 2) this.drawBeastCore(ctx);
      else { this.drawCradle1(ctx); this.drawHagBody(ctx, 1); this.drawHead(ctx); }
    } else if (this.form === 2) this.drawForm2(ctx);
    else this.drawForm1(ctx);
    ctx.restore();
  }
  get dmg() { return clamp(1 - this.hp / Math.max(1, this.stats.maxHp), 0, 1); }

  // ── P1: 요람 위의 노파 ──
  drawForm1(ctx) {
    const m = this.morph, t = this.t;
    if (m > 0) ctx.translate(Math.sin(t * 60) * 3 * m, 0);
    this.drawHair(ctx, true);
    this.drawArm(ctx, 1, true); this.drawArm(ctx, 3, true);
    this.drawUnderDolls(ctx);
    this.drawCradle1(ctx);
    this.drawChains(ctx);
    this.drawHagBody(ctx, 1);
    this.drawHead(ctx);
    this.drawArm(ctx, 2, false); this.drawArm(ctx, 0, false);
    this.drawHair(ctx, false);
    if (m > 0 && !R.fl) {
      // 변신: 요람 창살 사이로 검은 살이 부풀어 오른다
      glowE(ctx, 0, -60, 140 * m, 70 * m, DREAM, 0.5 * m);
      ctx.fillStyle = rgba('#12020c', 0.6 * m);
      ctx.beginPath(); ctx.ellipse(0, -60, 100 * m, 40 * m, 0, 0, TAU); ctx.fill();
    }
  }
  drawCradle1(ctx) {
    put(ctx, ART?.cradle, 0, 0);
    if (!ART && !R.fl) { ctx.strokeStyle = '#3a3440'; ctx.lineWidth = 6; ctx.strokeRect(-100, -94, 200, 64); }
  }
  /** 요람 밑에서 기어 나오는 도자기 인형 팔다리 */
  drawUnderDolls(ctx) {
    if (R.fl) return;
    const t = this.t;
    for (let i = 0; i < 4; i++) {
      const x = -60 + i * 38, sw = Math.sin(t * 3 + i * 1.9);
      const x1 = x + sw * 14, y1 = 22 + Math.cos(t * 2.4 + i) * 6 + (i % 2) * 8;
      tube(ctx, x, -14, x1, y1, 4.5, 3, PORC, 'mr_ud', 1.4);
      ctx.fillStyle = PORC; ctx.strokeStyle = '#2a1a26'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x1, y1 + 3, 4, 5, sw * 0.4, 0, TAU); ctx.fill(); ctx.stroke();
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x1 - 3 + k * 3, y1 + 6); ctx.lineTo(x1 - 4 + k * 4, y1 + 12 + sw * 2); ctx.stroke(); }
    }
  }
  drawChains(ctx) {
    if (R.fl) return;
    const t = this.t;
    ctx.strokeStyle = '#4a4452'; ctx.lineWidth = 2.2;
    for (const [x, ph] of [[-112, 0], [110, 1.7]]) {
      const sw = Math.sin(t * 1.5 + ph) * 10 - this.rock * 120;
      for (let k = 0; k < 7; k++) {
        const u = k / 7, cx = x + sw * u * u, cy = -16 + k * 10;
        ctx.beginPath(); ctx.ellipse(cx, cy, k % 2 ? 2 : 3.5, 5, 0, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = '#2a2430'; ctx.beginPath(); ctx.arc(x + sw, 56, 4, 0, TAU); ctx.fill();
    }
  }
  /** 노파 몸: 다리(쪼그림) · 누더기 잠옷 · 여윈 몸통 · 목 (form 1 · 2 공용, form 2 는 다리 대신 요람에 녹아 붙는다) */
  drawHagBody(ctx, form) {
    const J = this.jt, fl = R.fl, t = this.t, dm = this.dmg;
    if (form === 1) {
      // 먼 다리
      tube(ctx, J.hip[0] - 8, J.hip[1], J.kneeF[0], J.kneeF[1], 10, 8, fl ? '#fff' : SKIN_D, 'mr_thf', 2);
      tube(ctx, J.kneeF[0], J.kneeF[1], J.footF[0], J.footF[1], 7.5, 5, fl ? '#fff' : SKIN_D, 'mr_shf', 2);
      this.drawFoot(ctx, J.footF[0], J.footF[1], true);
    }
    // 누더기 잠옷 (등 뒤로 늘어진 자락)
    const hemY = form === 1 ? -40 : J.hip[1] + 40;
    ctx.beginPath();
    ctx.moveTo(J.sho[0] - 14, J.sho[1] + 4);
    ctx.bezierCurveTo(J.sho[0] - 44, J.sho[1] + 30, J.hip[0] - 48, J.hip[1] - 4, J.hip[0] - 52, hemY);
    for (let k = 0; k <= 8; k++) {
      const x = J.hip[0] - 52 + k * 10, y = hemY + (k % 2 ? 14 : 2) + Math.sin(t * 2.4 + k) * 4 - dm * (k % 3) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(J.hip[0] + 28, J.hip[1] + 6);
    ctx.lineTo(J.chest[0] + 10, J.chest[1]);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'mr_gown', 0, -200, 0, -40, [0, GOWN_L, 1, GOWN]), 2);
    // 몸통 (갈비뼈가 드러난 여윈 가슴 · 늘어진 뱃가죽)
    const hx = J.hip[0], hy = J.hip[1], cx = J.chest[0], cy = J.chest[1], sx = J.sho[0], sy = J.sho[1];
    ctx.beginPath();
    ctx.moveTo(hx - 14, hy + 4);
    ctx.bezierCurveTo(hx - 20, hy - 20, cx - 22, cy + 6, sx - 16, sy + 2);
    ctx.quadraticCurveTo(sx, sy - 8, sx + 16, sy + 2);
    ctx.bezierCurveTo(cx + 20, cy + 4, cx + 14, cy + 22, hx + 12, hy - 8);
    ctx.quadraticCurveTo(hx + 16, hy + 4, hx + 4, hy + 8);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'mr_torso', -30, 0, 30, 0, [0, SKIN_D, 0.4, SKIN, 0.75, '#c8bccc', 1, SKIN_D]), 2.2);
    if (!fl) {
      ctx.strokeStyle = 'rgba(40,24,48,0.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) { const u = i / 5, x = lerp(sx, cx, 0.3 + u * 0.7), y = lerp(sy, cy, 0.3 + u * 0.7) + 4; ctx.moveTo(x - 12, y - 2); ctx.quadraticCurveTo(x, y + 5, x + 12, y - 3); }
      ctx.stroke();
      // 배의 꿰맨 흉터 (입과 같은 실)
      ctx.strokeStyle = '#1a0812'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx + 2, cy + 14); ctx.lineTo(hx + 4, hy - 4);
      for (let k = 0; k < 4; k++) { const u = (k + 0.5) / 4, x = lerp(cx + 2, hx + 4, u), y = lerp(cy + 14, hy - 4, u); ctx.moveTo(x - 4, y - 1); ctx.lineTo(x + 4, y + 1); }
      ctx.stroke();
      // 척추 돌기
      ctx.fillStyle = 'rgba(210,200,216,0.5)';
      for (let k = 0; k < 5; k++) { const u = k / 5; ctx.beginPath(); ctx.arc(lerp(sx - 14, hx - 12, u) - 3, lerp(sy + 6, hy, u), 2.2, 0, TAU); ctx.fill(); }
      // 멍 · 반점
      ctx.fillStyle = 'rgba(80,30,70,0.3)'; ctx.beginPath(); ctx.ellipse(cx - 4, cy - 2, 6, 4, 0.4, 0, TAU); ctx.fill();
    }
    // 목 (힘줄)
    const nx = J.head[0] - 4, ny = J.head[1] + 22;
    tube(ctx, sx + 2, sy + 2, nx, ny, 7, 5, fl ? '#fff' : SKIN, 'mr_neck', 1.8);
    if (!fl) { ctx.strokeStyle = 'rgba(40,24,48,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 5, sy); ctx.lineTo(nx + 3, ny + 2); ctx.stroke(); }
    if (form === 1) {
      // 가까운 다리 (앞)
      tube(ctx, hx + 4, hy, J.kneeN[0], J.kneeN[1], 11, 8, fl ? '#fff' : SKIN, 'mr_thn', 2.2);
      tube(ctx, J.kneeN[0], J.kneeN[1], J.footN[0], J.footN[1], 8, 5.5, fl ? '#fff' : SKIN, 'mr_shn', 2.2);
      if (!fl) { ctx.fillStyle = 'rgba(230,220,236,0.6)'; ctx.beginPath(); ctx.ellipse(J.kneeN[0] + 2, J.kneeN[1] - 2, 5, 4, 0, 0, TAU); ctx.fill(); }
      this.drawFoot(ctx, J.footN[0], J.footN[1], false);
      // 무릎을 덮는 잠옷 앞자락
      ctx.beginPath();
      ctx.moveTo(hx - 6, hy - 6); ctx.quadraticCurveTo(J.kneeN[0] - 6, J.kneeN[1] - 10, J.kneeN[0] + 10, J.kneeN[1] - 4);
      for (let k = 0; k <= 5; k++) ctx.lineTo(J.kneeN[0] + 8 - k * 7, J.kneeN[1] + 14 + (k % 2) * 10 + Math.sin(t * 2 + k) * 3);
      ctx.closePath();
      ink(ctx, fl ? '#fff' : GOWN_L, 1.6);
    }
  }
  drawFoot(ctx, x, y, far) {
    const fl = R.fl;
    ctx.fillStyle = fl ? '#fff' : (far ? SKIN_D : SKIN); ctx.strokeStyle = '#140a14'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x + 4, y - 3, 10, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // 난간을 감싼 긴 발가락 · 발톱
    for (let k = 0; k < 4; k++) {
      const bx = x + 8 + k * 3.5;
      ctx.beginPath(); ctx.moveTo(bx, y - 2); ctx.quadraticCurveTo(bx + 5, y + 2, bx + 2, y + 7); ctx.stroke();
      if (!fl) { ctx.fillStyle = NAIL; ctx.beginPath(); ctx.arc(bx + 2, y + 7, 1.2, 0, TAU); ctx.fill(); }
    }
  }
  /** 팔 하나: 위팔 · 아래팔 · 긴 손가락 네 개 (바늘 같은 손톱) */
  drawArm(ctx, i, far) {
    const a = this.jt.arms[i], fl = R.fl, t = this.t;
    const col = fl ? '#fff' : (far ? SKIN_D : SKIN);
    tube(ctx, a.r[0], a.r[1], a.e[0], a.e[1], 6, 4.5, col, far ? 'mr_uaf' : 'mr_ua', 1.8);
    tube(ctx, a.e[0], a.e[1], a.h[0], a.h[1], 4.8, 3.2, col, far ? 'mr_faf' : 'mr_fa', 1.6);
    if (!fl) { ctx.fillStyle = far ? '#6a5a74' : '#d8cce0'; ctx.beginPath(); ctx.arc(a.e[0], a.e[1], 4, 0, TAU); ctx.fill(); }
    // 손 + 손가락
    const ang = a.a, curl = 0.25 + 0.2 * Math.sin(t * 2 + i);
    ctx.save(); ctx.translate(a.h[0], a.h[1]); ctx.rotate(ang);
    ctx.fillStyle = col; ctx.strokeStyle = '#140a14'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(3, 0, 7, 5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.strokeStyle = fl ? '#fff' : (far ? '#3a2e44' : '#8a7c92');
    for (let k = 0; k < 4; k++) {
      const s = (k - 1.5) * 0.28, L1 = 14 + (k === 1 || k === 2 ? 4 : 0), L2 = 12;
      const x1 = 7 + Math.cos(s) * L1, y1 = Math.sin(s) * L1;
      const a2 = s + curl * (1 + k * 0.1);
      const x2 = x1 + Math.cos(a2) * L2, y2 = y1 + Math.sin(a2) * L2;
      ctx.beginPath(); ctx.moveTo(6, s * 8); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (!fl) { ctx.strokeStyle = NAIL; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 + Math.cos(a2 + 0.2) * 8, y2 + Math.sin(a2 + 0.2) * 8); ctx.stroke(); ctx.lineWidth = 2.2; ctx.strokeStyle = far ? '#3a2e44' : '#8a7c92'; }
    }
    ctx.restore();
  }
  /** 머리: 도자기 얼굴 + 균열 · 떨어져 나간 조각 · 찢어진 입속 눈 */
  drawHead(ctx) {
    const J = this.jt, fl = R.fl, t = this.t, dm = this.dmg, mk_ = this.mouthK;
    ctx.save();
    ctx.translate(J.head[0], J.head[1]); ctx.rotate(J.headA);
    put(ctx, ART?.face, 0, 0);
    if (!ART && !fl) { ctx.fillStyle = PORC; ctx.beginPath(); ctx.ellipse(0, 0, 26, 36, 0, 0, TAU); ctx.fill(); }
    if (!fl) {
      // 피해 균열 (체력이 줄수록 번진다)
      const n = Math.min(CRACKS.length, Math.floor(dm * 8));
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#1c0c16';
      for (let i = 0; i < n; i++) { const C0 = CRACKS[i]; ctx.beginPath(); ctx.moveTo(C0[0], C0[1]); for (let k = 2; k < C0.length; k += 2) ctx.lineTo(C0[k], C0[k + 1]); ctx.stroke(); }
      // P3: 이마 한쪽이 떨어져 나가 검은 속과 보랏빛 눈이 보인다
      if (this.formPhase >= 2) {
        ctx.fillStyle = '#07030a';
        ctx.beginPath(); ctx.moveTo(8, -38); ctx.lineTo(24, -26); ctx.lineTo(20, -16); ctx.lineTo(12, -20); ctx.lineTo(9, -12); ctx.lineTo(2, -24); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
        const pk = 0.6 + 0.4 * Math.sin(t * 5);
        glow(ctx, 13, -22, 10, DREAM, 0.8 * pk);
        glow(ctx, 13, -22, 3, '#ffffff', 0.9, true);
      }
    }
    // 찢어진 입 (세로) → 거대한 눈
    if (mk_ > 0.02) {
      const hw = 3 + 10 * mk_, hh = 7 + 16 * mk_, mx = 6, my = 22;
      ctx.fillStyle = C('#12020a');
      ctx.beginPath(); ctx.ellipse(mx, my, hw + 1.5, hh + 1.5, 0, 0, TAU); ctx.fill();
      if (!fl) {
        ctx.save(); ctx.beginPath(); ctx.ellipse(mx, my, hw, hh, 0, 0, TAU); ctx.clip();
        ctx.fillStyle = '#f4ecf0'; ctx.beginPath(); ctx.ellipse(mx, my, hw * 0.92, hh * 0.8, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(200,40,60,0.6)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(mx - hw, my - 4); ctx.lineTo(mx - 3, my - 1); ctx.moveTo(mx + hw, my + 5); ctx.lineTo(mx + 3, my + 2); ctx.stroke();
        // 홍채 + 세로 동공이 플레이어를 본다
        const p = this.P, e = this.mouthP;
        let lx = 0, ly = 0;
        if (p) { const dx = (p.cx - e.x) * this.facing, dy = p.cy - e.y, d = Math.hypot(dx, dy) || 1; lx = dx / d * hw * 0.35; ly = dy / d * hh * 0.25; }
        ctx.fillStyle = radG2(ctx, mx + lx, my + ly, hw);
        ctx.beginPath(); ctx.arc(mx + lx, my + ly, hw * 0.62, 0, TAU); ctx.fill();
        ctx.fillStyle = '#050206'; ctx.beginPath(); ctx.ellipse(mx + lx, my + ly, hw * 0.14, hw * 0.52, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(mx + lx - hw * 0.2, my + ly - hw * 0.25, 1.4, 0, TAU); ctx.fill();
        ctx.restore();
        // 끊어진 실밥
        ctx.strokeStyle = '#120610'; ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) { const y = my - hh * 0.8 + k * hh * 0.4, sw = Math.sin(t * 6 + k) * 2; ctx.moveTo(mx - hw - 1, y); ctx.lineTo(mx - hw - 5 + sw, y + 5); ctx.moveTo(mx + hw + 1, y); ctx.lineTo(mx + hw + 5 - sw, y + 5); }
        ctx.stroke();
        glow(ctx, mx, my, hh * 1.6, '#ff80c0', 0.35 * mk_);
      }
    }
    ctx.restore();
  }
  /** 실 머리카락 (+ 매달린 잠든 얼굴). back = 뒤쪽 가닥 · 얼굴 */
  drawHair(ctx, back) {
    if (R.fl) return;
    const J = this.jt, t = this.t, f2 = this.form === 2 ? 1 : 0;
    const cx = J.crown[0], cy = J.crown[1];
    const S = SLEEPERS[f2];
    ctx.lineCap = 'round';
    if (back) {
      // 얼굴에 이어진 실 셋 + 잠든 얼굴
      for (let i = 0; i < 3; i++) {
        const o = S[i], fx = cx + o[0] + Math.sin(t * 0.9 + i * 2) * 14, fy = cy + o[1] + Math.cos(t * 1.1 + i) * 10;
        ctx.strokeStyle = 'rgba(12,6,14,0.9)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo((cx + fx) / 2 + Math.sin(t * 1.5 + i) * 20, Math.min(cy, fy) - 30, fx, fy - 32); ctx.stroke();
        ctx.strokeStyle = rgba(DREAM, 0.35); ctx.lineWidth = 0.8; ctx.stroke();
        ctx.save(); ctx.translate(fx, fy); ctx.scale(this.facing, 1);   // 얼굴은 뒤집지 않는다
        ctx.globalAlpha *= 0.9;
        put(ctx, ART?.sleep, 0, 0, Math.sin(t * 0.8 + i) * 0.2, 0.9);
        ctx.restore();
      }
      // 뒤로 흩날리는 굵은 가닥
      ctx.strokeStyle = HAIR;
      for (let i = 0; i < 6; i++) {
        const L = 110 + i * 22 + f2 * 60, a = -2.4 - i * 0.12 + Math.sin(t * 1.3 + i) * 0.1 + f2 * 0.5;
        const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.7 + 20 * f2;
        ctx.lineWidth = 3 - i * 0.3;
        ctx.beginPath(); ctx.moveTo(cx - 2, cy + 4);
        ctx.bezierCurveTo(cx - 20 + Math.sin(t * 2 + i) * 10, cy - 30, (cx + ex) / 2 + Math.sin(t * 1.7 + i * 1.3) * 18, (cy + ey) / 2 - 20, ex, ey);
        ctx.stroke();
      }
    } else {
      // 얼굴 앞으로 흘러내린 몇 가닥
      ctx.strokeStyle = HAIR; ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const x0 = cx + 4 + i * 5, y0 = cy + 6, sw = Math.sin(t * 1.8 + i) * 5;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + 16, y0 + 20, x0 + 10 + sw, y0 + 50, x0 + 6 + sw, y0 + 72 + i * 10); ctx.stroke();
      }
    }
  }

  // ── P2: 요람의 짐승 ──
  drawForm2(ctx) {
    const lk = this.legK;
    this.drawHair(ctx, true);
    for (const L of this.legs) if (!L.near) this.drawLeg(ctx, L, true);
    this.drawArm(ctx, 3, true); this.drawArm(ctx, 1, true);
    this.drawBeastCore(ctx);
    for (const L of this.legs) if (L.near) this.drawLeg(ctx, L, false);
    this.drawArm(ctx, 2, false); this.drawArm(ctx, 0, false);
    this.drawHair(ctx, false);
    if (lk < 1 && !R.fl) glowE(ctx, -20, -90, 200 * (1 - lk), 90 * (1 - lk), DREAM, 0.5 * (1 - lk));
  }
  /** 요람 배(살덩이가 창살 사이로 부푼다) + 노파 상체 + 머리 */
  drawBeastCore(ctx) {
    const J = this.jt, fl = R.fl, t = this.t, dm = this.dmg;
    ctx.save();
    ctx.translate(J.body[0], J.body[1]); ctx.rotate(J.bodyA);
    // 살덩이 (창살 뒤)
    const pul = 1 + Math.sin(t * 3.2) * 0.03;
    ctx.beginPath(); ctx.ellipse(0, -8, 118 * pul, 54 * pul, 0, 0, TAU);
    ink(ctx, fl ? '#fff' : LG(ctx, 'mr_flesh', 0, -60, 0, 50, [0, '#8a2a48', 0.5, FLESH, 1, '#1a0410']), 2);
    if (!fl) {
      ctx.strokeStyle = 'rgba(200,60,90,0.45)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const x = -90 + k * 36; ctx.moveTo(x, -40); ctx.bezierCurveTo(x + 10, -20, x - 8, 0, x + 6, 30); }
      ctx.stroke();
      // 살에 박힌 잠든 얼굴 (눌려 있다)
      ctx.save(); ctx.globalAlpha *= 0.55; put(ctx, ART?.sleep, -40, -14, 0.3, 0.8); put(ctx, ART?.sleep, 46, -4, -0.2, 0.7); ctx.restore();
    }
    // 요람 (창살 = 갈비뼈)
    put(ctx, ART?.cradle, 0, 56, 0, 1.2);
    if (!fl) {
      // P2 이상: 창살 사이 살 틈새의 핏줄 · P3: 창살이 휘고 피가 흐른다
      if (this.formPhase >= 2 || dm > 0.7) {
        ctx.strokeStyle = BLOOD; ctx.lineWidth = 2.4;
        for (let k = 0; k < 6; k++) {
          const x = -96 + k * 38 + h01(k) * 10, y0 = 20, len = 10 + ((t * 30 + k * 13) % 26);
          ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + 1, y0 + len); ctx.stroke();
          ctx.fillStyle = BLOOD; ctx.beginPath(); ctx.arc(x + 1, y0 + len + 2, 2.6, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.restore();
    // 노파 상체 (요람 앞쪽에 녹아 붙었다)
    this.drawHagBody(ctx, 2);
    if (!fl) {
      // 허리가 요람 살에 녹아든 뿌리 같은 힘줄
      ctx.strokeStyle = FLESH; ctx.lineWidth = 4;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { const x = J.hip[0] - 10 + k * 8; ctx.moveTo(x, J.hip[1] + 4); ctx.quadraticCurveTo(x - 18 - k * 4, J.hip[1] + 20, x - 36 - k * 8, J.hip[1] + 26 + k * 3); }
      ctx.stroke();
    }
    this.drawHead(ctx);
  }
  /** 도자기 인형 다리 (구체 관절) — near 쪽 세 다리의 무릎엔 아기 인형 머리 */
  drawLeg(ctx, L, far) {
    const fl = R.fl, t = this.t;
    const col = fl ? '#fff' : (far ? '#8a7e8c' : PORC);
    const r = L.rl, k = L.kl, f = L.fl;
    tube(ctx, r[0], r[1], k[0], k[1], 9, 7, col, far ? 'mr_lff' : 'mr_lf', 2);
    tube(ctx, k[0], k[1], f[0], f[1], 7, 3, col, far ? 'mr_ltf' : 'mr_lt', 1.8);
    if (!fl) {
      // 구체 관절
      ctx.fillStyle = far ? '#6e6474' : '#e6dcd6'; ctx.strokeStyle = '#1a0c16'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(k[0], k[1], 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(k[0] - 2.5, k[1] - 2.5, 2.4, 0, TAU); ctx.fill();
      // 금 간 곳
      if (h01(L.i * 3.3) < 0.5) { ctx.strokeStyle = '#1c0c16'; ctx.lineWidth = 1; ctx.beginPath(); const mx = lerp(k[0], f[0], 0.4), my = lerp(k[1], f[1], 0.4); ctx.moveTo(mx - 3, my - 2); ctx.lineTo(mx + 1, my + 2); ctx.lineTo(mx - 1, my + 6); ctx.stroke(); }
      // 발끝: 땅을 짚은 작은 인형 손
      ctx.fillStyle = far ? '#6e6474' : '#ede4de'; ctx.strokeStyle = '#1a0c16'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(f[0], f[1] - 3, 6, 4, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); for (let q = 0; q < 4; q++) { ctx.moveTo(f[0] - 4 + q * 3, f[1] - 1); ctx.lineTo(f[0] - 6 + q * 4, f[1] + 2); } ctx.stroke();
    }
    if (!far) {
      const h = this.heads.find((q) => q.leg === L.i);
      if (h) this.drawBabyHead(ctx, h, k[0], k[1], t);
    }
  }
  drawBabyHead(ctx, h, x, y, t) {
    const fl = R.fl;
    if (!h.alive) {
      if (fl) return;
      // 부서진 목 그루터기
      ctx.fillStyle = '#e6dcd6'; ctx.strokeStyle = '#1a0c16'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 8, y - 6); ctx.lineTo(x - 5, y - 16); ctx.lineTo(x - 1, y - 10); ctx.lineTo(x + 3, y - 18); ctx.lineTo(x + 8, y - 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = BLOOD; ctx.beginPath(); ctx.arc(x, y - 7, 3, 0, TAU); ctx.fill();
      return;
    }
    const g = h.grow, sc = 0.25 + 0.75 * g, wob = Math.sin(t * 5 + h.i * 2) * 0.12;
    const hy = y - 18 * sc;
    ctx.save();
    ctx.translate(x, hy); ctx.scale(this.facing, 1);   // 얼굴은 늘 정면 (몸 뒤집힘을 되돌린다)
    put(ctx, ART?.baby, 0, 0, wob, sc);
    if (!fl && h.hitT > 0) glow(ctx, 0, 0, 30, '#ffffff', h.hitT * 4);
    if (!fl && g > 0.9) { const k = 0.4 + 0.3 * Math.sin(t * 6 + h.i); glow(ctx, -7 * sc, -1, 7, '#9fd0ff', k); glow(ctx, 7 * sc, -1, 7, '#9fd0ff', k); }
    ctx.restore();
  }
}

// ───────────────────────── 얼굴 균열 (얼굴 지역 좌표 폴리라인) ─────────────────────────
const CRACKS = [
  [16, -36, 13, -26, 17, -18, 12, -10],
  [-22, 4, -14, 6, -12, 14, -4, 18],
  [26, 2, 20, 6, 22, 14, 16, 22],
  [-6, -38, -4, -30, 2, -28, 4, -20],
  [-24, -12, -16, -14, -10, -8],
  [22, -30, 26, -22, 20, -14, 24, -6],
  [-14, 28, -8, 24, -6, 32, 0, 36],
  [0, -6, 4, 2, 0, 8, 6, 10],
];
const _rg = new Map();
/** 입속 눈의 홍채 그라디언트 (반지름 버킷별 캐시) */
function radG2(ctx, x, y, r) {
  const k = Math.round(r);
  let g = _rg.get(k);
  if (!g) { g = ctx.createRadialGradient(0, 0, 0, 0, 0, k * 0.62); g.addColorStop(0, '#ffe0ff'); g.addColorStop(0.35, '#c070ff'); g.addColorStop(0.8, '#5a108a'); g.addColorStop(1, '#1a0428'); _rg.set(k, g); }
  ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.translate(-x, -y);
  return 'rgba(0,0,0,0)';
}

// ───────────────────────── 지대 · 탄 그림 ─────────────────────────
function paintThread(ctx, z, w, top, bot, dir) {
  const x = z.line.x0;
  if (!z.started) {
    warnLine(ctx, x, top, x, bot, z.k, '#d070ff', 1.5);
    // 진행 방향 화살표 (바닥)
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(DREAM, 0.25 + 0.4 * z.k);
    for (let i = 0; i < 3; i++) { const ax = x + dir * (26 + i * 26), ay = bot - 16; ctx.beginPath(); ctx.moveTo(ax + dir * 10, ay); ctx.lineTo(ax - dir * 4, ay - 8); ctx.lineTo(ax - dir * 4, ay + 8); ctx.closePath(); ctx.fill(); }
    return;
  }
  if (R.fl) return;
  const f = clamp((z.dur + z.warn - z.t) / 0.15, 0, 1);
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(DREAM, 0.5 * f); ctx.lineWidth = 10;
  ctx.beginPath();
  for (let y = top; y <= bot; y += 24) { const xx = x + Math.sin(y * 0.05 + z.t * 30) * 2.5; if (y === top) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); }
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.9 * f); ctx.lineWidth = 2; ctx.stroke();
  glowE(ctx, x, bot - 4, 34, 9, DREAM, 0.6 * f);
  // 실 끝에 매달려 흔들리는 작은 인형
  const dy = bot - 60 - Math.sin(z.t * 6) * 10;
  ctx.globalCompositeOperation = 'source-over';
  drawMiniDoll(ctx, x, dy, 0.8, z.t, Math.sin(z.t * 5) * 0.4);
}
function paintArrows(ctx, z, dir, t) {
  ctx.globalCompositeOperation = 'lighter';
  const k = clamp(z.t / 0.8, 0, 1), y = z.y + z.h * 0.55;
  ctx.fillStyle = rgba(DREAM_L, 0.2 + 0.5 * k);
  const n = Math.floor(z.w / 90);
  for (let i = 0; i < n; i++) {
    const u = ((i / n + t * 0.8) % 1), x = dir > 0 ? z.x + u * z.w : z.x + z.w - u * z.w;
    ctx.beginPath(); ctx.moveTo(x + dir * 18, y); ctx.lineTo(x - dir * 6, y - 14); ctx.lineTo(x - dir * 6, y + 14); ctx.closePath(); ctx.fill();
  }
}
/** 가위 날: 예고 = 조준선, 판정 = 녹슨 거대 가위 날이 선을 따라 스친다 */
function bladePaint(s) {
  return (ctx, z) => {
    const L = z.line;
    if (!z.started) { warnLine(ctx, L.x0, L.y0, L.x1, L.y1, z.k, '#ff7ab0', 3); return; }
    if (R.fl) return;
    const f = 1 - z.a;
    const mx = (L.x0 + L.x1) / 2, my = (L.y0 + L.y1) / 2, a = Math.atan2(L.y1 - L.y0, L.x1 - L.x0), len = Math.hypot(L.x1 - L.x0, L.y1 - L.y0);
    ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
    ctx.globalAlpha *= f;
    ctx.beginPath();
    ctx.moveTo(-len / 2, s * 4); ctx.lineTo(len / 2, s * 1); ctx.lineTo(len / 2 + 16, 0); ctx.lineTo(len / 2, -s * 2); ctx.lineTo(-len / 2, -s * 16);
    ctx.closePath();
    ctx.fillStyle = LG(ctx, 'mr_blade' + s, 0, -16, 0, 6, [0, '#2a2430', 0.6, '#6e6474', 1, '#d8d0e0']); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-len / 2, s * 3); ctx.lineTo(len / 2 + 14, 0); ctx.stroke();
    ctx.strokeStyle = rgba('#ff9ad0', 0.5); ctx.lineWidth = 16;
    ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.restore();
  };
}
function paintScream(ctx, z, w, x0, my, cy, f, rects) {
  if (!z.started) {
    for (const r of rects) warnRect(ctx, r.x, r.y, r.w, r.h, z.k * 0.8, '#ff70c0', w.time);
    return;
  }
  if (R.fl) return;
  const k = 1 - z.a;
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const u = ((z.t * 2.2 + i / 5) % 1), rr = 30 + u * 380, a = 1 - u;
    ctx.strokeStyle = rgba(i % 2 ? '#ff80c0' : DREAM_L, 0.6 * a * k); ctx.lineWidth = 6 + u * 10;
    const cxx = x0, cyy = lerp(my, cy, 0.5 + 0.5 * u);
    ctx.beginPath(); ctx.ellipse(cxx + f * rr * 0.5, cyy, rr * 0.5, 30 + u * 80, 0, f > 0 ? -1.2 : PI - 1.2, f > 0 ? 1.2 : PI + 1.2); ctx.stroke();
  }
  glowE(ctx, x0 + f * 200, cy, 220, 100, '#ff60b0', 0.35 * k);
}
function paintCrawler(ctx, z, w) {
  const d = z.data, t = z.t;
  const x = z.cx, y = z.bottom, dir = d.dir || 1;
  const shake = d.fuse >= 0 ? Math.sin(t * 80) * 2 : 0;
  ctx.save(); ctx.translate(x + shake, y); ctx.scale(dir, 1);
  // 기는 인형: 몸은 엎드리고, 팔로 끌어당긴다
  const c = Math.sin(t * 10);
  ctx.strokeStyle = '#2a1a26'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(16 + c * 4, -2); ctx.moveTo(0, -8); ctx.lineTo(10 - c * 4, 0); ctx.moveTo(-12, -6); ctx.lineTo(-22 - c * 3, -1); ctx.stroke();
  ctx.strokeStyle = '#e8dcd4'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#6a3a5a'; ctx.beginPath(); ctx.ellipse(-4, -9, 12, 6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1a0a14'; ctx.lineWidth = 1.2; ctx.stroke();
  drawMiniHead(ctx, 12, -14, 0.9, d.fuse >= 0);
  ctx.restore();
  if (d.fuse >= 0 && !R.fl) glow(ctx, x, y - 12, 40, '#ff60c0', 0.5 + 0.4 * Math.sin(t * 40));
}
function drawMiniHead(ctx, x, y, s, angry) {
  ctx.fillStyle = PORC; ctx.strokeStyle = '#1a0a14'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(x, y, 7 * s, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = angry ? '#ff3060' : '#1a0a14';
  ctx.beginPath(); ctx.arc(x - 2.5 * s, y - 1, 1.6 * s, 0, TAU); ctx.arc(x + 2.5 * s, y - 1, 1.6 * s, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#1a0a14'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4 * s, y - 6 * s); ctx.lineTo(x + 1 * s, y - 2 * s); ctx.stroke();
}
function drawMiniDoll(ctx, x, y, s, t, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.strokeStyle = '#e8dcd4'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-8, 12 + Math.sin(t * 8) * 2); ctx.moveTo(3, 4); ctx.lineTo(8, 12 - Math.sin(t * 8) * 2); ctx.moveTo(-2, 14); ctx.lineTo(-3, 22); ctx.moveTo(2, 14); ctx.lineTo(3, 22); ctx.stroke();
  ctx.fillStyle = '#6a3a5a'; ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(6, 2); ctx.lineTo(8, 16); ctx.lineTo(-8, 16); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1a0a14'; ctx.lineWidth = 1; ctx.stroke();
  drawMiniHead(ctx, 0, -4, 1, false);
  ctx.restore();
}
function dollRender(ctx, p) {
  ctx.rotate(p.rot);
  glow(ctx, 0, 0, 22, DREAM, 0.35);
  drawMiniDoll(ctx, 0, -2, 1, p.t);
}
function needleRender(ctx, p) {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  glowE(ctx, -8, 0, 30, 7, DREAM, 0.6);
  ctx.fillStyle = '#ece4f4'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-16, -2); ctx.lineTo(-16, 2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1a0c18'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(-12, 0, 2.6, 1.2, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba(DREAM, 0.85); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-13, 0); ctx.quadraticCurveTo(-24, 4 * Math.sin(p.t * 20), -36, 0); ctx.stroke();
}
function wailRender(ctx, p) {
  const a = Math.atan2(p.vy, p.vx);
  ctx.rotate(a);
  glowE(ctx, -16, 0, 44, 16, DREAM, 0.55);
  glow(ctx, 0, 0, 18, '#ffe0ff', 0.7);
  ctx.rotate(-a);
  ctx.fillStyle = 'rgba(20,6,26,0.85)';
  ctx.beginPath(); ctx.arc(-4, -3, 2.2, 0, TAU); ctx.arc(4, -3, 2.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 4, 2.6, 4 + Math.sin(p.t * 30), 0, 0, TAU); ctx.fill();
}
/** 깨어나는 잠든 얼굴: 떠오름 → 잠 → 눈을 뜨며 고리(예고) → 비명 → 사라짐 */
function paintSleeper(ctx, z) {
  const d = z.data, t = z.t, x = d.x, y = d.y;
  const fin = clamp(t / 0.3, 0, 1), fout = d.fired ? clamp(1 - (t - d.wake - 0.35) / 0.8, 0, 1) : 1;
  const a = fin * fout;
  if (a <= 0.01) return;
  const waking = t >= d.wake, wk = clamp((t - d.wake) / 0.35, 0, 1);
  ctx.save();
  ctx.globalAlpha *= a;
  if (!R.fl) glow(ctx, x, y, 50, waking ? '#ff80c0' : DREAM, 0.35 + 0.3 * wk);
  put(ctx, ART?.sleep, x + (waking ? Math.sin(t * 60) * 1.5 * wk : 0), y, 0, 1.1 + wk * 0.15);
  if (waking && !R.fl) {
    for (const s of [-1, 1]) { glow(ctx, x + s * 8, y - 6, 9, '#ffffff', 0.9 * wk, true); glow(ctx, x + s * 8, y - 6, 16, '#ff60c0', 0.6 * wk); }
    ctx.fillStyle = '#12020a'; ctx.beginPath(); ctx.ellipse(x, y + 15, 4 + 5 * wk, 3 + 9 * wk, 0, 0, TAU); ctx.fill();
    if (!d.fired) { ctx.strokeStyle = rgba('#ff80c0', 0.8 * wk); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 34 - 12 * wk, 0, TAU); ctx.stroke(); }
  }
  ctx.restore();
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
