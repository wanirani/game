// 14장 보스: 나르키사 — 만경(萬鏡)의 여제 (world2 §6.2, s14 '만경의 옥좌'). owner: BOSS-P2-1
// BossC(c_common.js) 상속 — 패턴 이름은 계약 (P2_PATTERNS.b_narkissa):
//   공격  mirrorDive · reflectBeam · shardRain · armCombo · twinReflect(P2+) · kaleido(P2+) · thousandEyes(P3) · mirrorFall(P3)
//   전환  shatter1 (66%, 1.5초 무적: 비명·거울 섬광) · shatter (33%, 가면이 깨지며 form2 + 대사 b_narkissa_shatter, 스토리 1회)
//   보조  stun (진짜 거울을 치면 2초 기절, 얼굴 방어 ×0.5)
// 경기장 소품: 벽거울 M0–M3 (x0+60 / x1−60, 바닥−300 / 바닥−120) = NarkMirror (kind 'prop'). 뛰어든 거울은 2.5초 금빛 = 칠 수 있는 '진짜 거울'.
// 그림: 벡터 (2부 기준, world2 §0). 반복되는 세밀한 부위(비명 얼굴이 비친 거울 조각 드레스·가면·흉갑·칼날)는 보스 등장 때 한 번 굽고
// (모듈 캐시, 흰 실루엣 판은 피격 섬광용), 거미 다리·유리 팔·후광·눈·균열은 매 프레임 그린다. 피해 단계: 체력에 따라 균열이 번지고
// 드레스 조각이 떨어져 나가며, P2 에는 후광 바늘이 부러지고, P3 에는 가면이 사라져 눈이 가득한 얼굴과 거울 이빨 아가리·공전 파편이 드러난다.
// 채색 아트(ART-BOSS-6)가 읽을 상태: this.pose(자세) · inMirror(거울 속: 몸을 그리지 않는다) · dashing(가로 돌진, pose.rot) · stunned ·
//   formPhase(2 = 가면 없음) · twin(분신 개체) · legs(거미 다리 발 위치) · maskCrack(0~1). 거울 속에서는 this.hidden = true (kit 규칙).
//   거울 속 실루엣은 NarkMirror 가 그린다.
import { BossC, telegraph, strikeRect, strikeLine, spawnMinion } from './c_common.js';
import { PI, OUT, R, LG, glow, glowE, glowSprite, warnRect, impact } from './b_common.js';
import { heldByFreeze } from './boss.js';
import { Entity } from '../entity.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, rgba } from '../../core/math.js';

// ───────────────────────── 색 ─────────────────────────
const GL = '#dff4ff', GL_C = '#9fe8ff', GL_V = '#c8b0ff', GOLD = '#ffd86a', RED = '#ff3050', GEM = '#40ffb0', EYE_C = '#bff6ff';
const h01 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const OFF = { x: -99999, y: -99999, w: 1, h: 1, off: true };

// ───────────────────────── 몸 치수 (앵커 = 몸통 판정 아래 가운데, 위 = −y) ─────────────────────────
const WAIST = -150, NECK = -214, HEAD_S = 1.15, HEAD_S2 = 1.4, MASK_C = NECK - 33 * HEAD_S, FACE2_C = NECK - 50 * HEAD_S2, HOVER = 20;
const EYES1 = [[-8, -39, 3.4], [-11.5, -28, 2.2], [-5, -48, 1.6], [7.5, -36, 2.6]];
const EYES2 = [[-12, -62, 3], [-4, -71, 2.2], [5, -66, 3.4], [13, -57, 2.4], [-15, -49, 2.6], [-5, -54, 3.8], [8, -50, 2.4], [16, -44, 1.8], [-1, -80, 1.6], [-19, -38, 1.8], [11, -74, 1.6]];
/** 드레스 거울 조각: [x, y, 크기, 층, 떨어져 나가는 피해율(없으면 끝까지)] */
const GOWN = [
  [-92, -88, 1.02, 3, 0.8], [-56, -90, 1.06, 3, null], [-19, -88, 1.1, 3, 0.58], [19, -90, 1.1, 3, null], [56, -88, 1.06, 3, 0.42], [92, -90, 1.02, 3, null],
  [-68, -112, 1.0, 2, null], [-34, -114, 1.04, 2, 0.7], [0, -112, 1.08, 2, null], [34, -114, 1.04, 2, null], [68, -112, 1.0, 2, 0.3],
  [-45, -138, 0.86, 1, null], [-15, -140, 0.88, 1, 0.9], [15, -140, 0.88, 1, null], [45, -138, 0.86, 1, 0.5],
  [-22, -160, 0.66, 0, null], [0, -162, 0.68, 0, null], [22, -160, 0.66, 0, 0.66],
];
/** 등 칼날 팔 4개: [쪽, 어깨 x, y, 기본 a, 기본 e] (a = 아래에서 바깥쪽으로 잰 각) */
const BLADE_ARMS = [[-1, -20, -204, 2.55, -1.55], [1, 20, -204, 2.55, -1.55], [-1, -16, -180, 2.1, -1.95], [1, 16, -180, 2.1, -1.95]];
const SHARD_SHAPES = [
  [[0, 0], [22, 30], [18, 78], [3, 102], [-14, 84], [-22, 36]],
  [[0, 0], [20, 40], [12, 96], [-4, 104], [-18, 70], [-20, 24]],
  [[2, 0], [24, 26], [20, 70], [6, 100], [-10, 90], [-22, 40]],
  [[0, 0], [18, 34], [22, 64], [2, 104], [-20, 78], [-18, 30]],
  [[0, 0], [24, 44], [10, 100], [-8, 96], [-22, 54], [-14, 18]],
];

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
/** 스프라이트 굽기: w×h (월드 px), 기준점 (ox, oy). K = 월드 px 당 픽셀 */
function mk(K, w, h, ox, oy, fn, flash = true) {
  const c = canvasOf(Math.ceil(w * K), Math.ceil(h * K));
  if (!c) return null;
  const g = c.getContext('2d');
  g.scale(K, K); g.translate(ox, oy);
  g.lineJoin = 'round'; g.lineCap = 'round';
  fn(g);
  return { c, f: flash ? whiteOf(c) : c, w, h, ox, oy };
}
/** 구운 스프라이트를 (x, y) 기준점에 (피격 섬광 중이면 흰 실루엣) */
function put(ctx, S, x, y, rot = 0, sx = 1, sy = sx) {
  if (!S || !sx || !sy) return;
  const img = R.fl ? S.f : S.c;
  if (!rot && sx === 1 && sy === 1) { ctx.drawImage(img, x - S.ox, y - S.oy, S.w, S.h); return; }
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.drawImage(img, -S.ox, -S.oy, S.w, S.h);
  ctx.restore();
}
function bakeScale(world) {
  const s = world?.game?.scale, z = world?.camera?.zoomTarget ?? 0.8;
  const k = Number.isFinite(s) && s > 0 ? s * z * 1.15 : 1.25;
  return clamp(Math.round(k * 2) / 2, 1, 2);
}
function ensureArt(world) {
  const K = bakeScale(world);
  if (ART && ART.K >= K) return ART;
  try { ART = bakeArt(K); } catch (e) { console.error('[narkissa] 굽기 실패', e); }
  return ART;
}
function shapePath(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
function linG(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
function radG(g, x0, y0, r0, x1, y1, r1, stops) { const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
function dot(g, x, y, r, stops) { g.fillStyle = radG(g, x, y, 0, x, y, r, stops); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }

/** 비명 지르는 얼굴 (거울 조각 속 반영) — 중심 (0,0), 폭 ≈ 28 */
function screamFace(g, v) {
  const mo = [1, 1.3, 0.85, 1.45, 1.1][v];
  g.fillStyle = 'rgba(6,6,14,0.9)';
  g.beginPath(); g.ellipse(0, -1, 17, 24, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(52,54,80,0.9)'; g.lineWidth = 1.1;
  for (let i = 0; i < 9; i++) {
    const a = -PI / 2 + (i - 4) * 0.36;
    g.beginPath(); g.moveTo(Math.cos(a) * 9, Math.sin(a) * 14 - 5);
    g.quadraticCurveTo(Math.cos(a) * 21, Math.sin(a) * 9 + 6, Math.cos(a) * 15 + (i - 4) * 1.6, 22 + h01(i + v * 7) * 12);
    g.stroke();
  }
  g.fillStyle = radG(g, -3, -5, 2, 0, 2, 21, [0, '#eef0f8', 0.45, '#aab0c6', 1, '#3e4460']);
  g.beginPath(); g.moveTo(0, -19); g.bezierCurveTo(10, -19, 13, -6, 12, 4); g.bezierCurveTo(11, 15, 6, 22, 0, 23); g.bezierCurveTo(-6, 22, -11, 15, -12, 4); g.bezierCurveTo(-13, -6, -10, -19, 0, -19); g.fill();
  g.fillStyle = 'rgba(26,30,52,0.4)';
  g.beginPath(); g.ellipse(-7.5, 7, 3, 6.5, 0.25, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(7.5, 7, 3, 6.5, -0.25, 0, TAU); g.fill();
  g.fillStyle = '#070712';
  g.beginPath(); g.ellipse(-5, -4, 3.9, 3.4, 0.15, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(5, -4, 3.9, 3.4, -0.15, 0, TAU); g.fill();
  for (const sx of [-5, 5]) dot(g, sx, -4, 4.2, [0, 'rgba(255,255,255,1)', 0.28, 'rgba(190,240,255,0.95)', 1, 'rgba(110,190,255,0)']);
  g.strokeStyle = 'rgba(14,14,28,0.95)'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(-9.5, -8); g.quadraticCurveTo(-5, -11.5, -1.3, -11); g.moveTo(9.5, -8); g.quadraticCurveTo(5, -11.5, 1.3, -11); g.stroke();
  g.strokeStyle = 'rgba(40,44,74,0.45)'; g.lineWidth = 0.6;
  g.beginPath(); g.moveTo(-5, -13.5); g.quadraticCurveTo(0, -15.5, 5, -13.5); g.moveTo(-4, -15.8); g.quadraticCurveTo(0, -17.3, 4, -15.8); g.stroke();
  g.strokeStyle = 'rgba(40,44,74,0.7)'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(0.4, -2); g.lineTo(1.6, 3); g.lineTo(-0.6, 3.6); g.stroke();
  const my = 10, mw = 5.6, mh = 6.4 * mo, mc = my + mh * 0.35;
  g.fillStyle = '#10030a'; g.beginPath(); g.ellipse(0, mc, mw, mh, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(130,12,34,0.85)'; g.beginPath(); g.ellipse(0, mc + mh * 0.3, mw * 0.5, mh * 0.42, 0, 0, TAU); g.fill();
  g.fillStyle = '#f4f2ea';
  for (let i = -2; i <= 2; i++) {
    const x = i * 2, ty = mc - mh + 0.5, by = mc + mh - 0.5, L = 2.6 - Math.abs(i) * 0.35;
    g.beginPath(); g.moveTo(x - 0.95, ty); g.lineTo(x + 0.95, ty); g.lineTo(x, ty + L); g.closePath(); g.fill();
    if (Math.abs(i) < 2) { g.beginPath(); g.moveTo(x - 0.9, by); g.lineTo(x + 0.9, by); g.lineTo(x, by - L * 0.8); g.closePath(); g.fill(); }
  }
  g.strokeStyle = 'rgba(70,20,34,0.7)'; g.lineWidth = 0.8;
  g.beginPath(); g.ellipse(0, mc, mw + 0.8, mh + 0.8, 0, 0, TAU); g.stroke();
  if (v === 2 || v === 4) {   // 유리에 짓눌린 손
    for (const s of [-1, 1]) {
      const hx = s * 15, hy = 10;
      g.fillStyle = 'rgba(190,196,214,0.85)';
      g.beginPath(); g.ellipse(hx, hy, 4.2, 5.5, s * 0.2, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(190,196,214,0.85)'; g.lineWidth = 1.7;
      g.beginPath();
      for (let k = 0; k < 4; k++) { const a = -PI / 2 + s * (k - 1.5) * 0.3; g.moveTo(hx, hy - 3); g.lineTo(hx + Math.cos(a) * 9 + s * 1.5, hy + Math.sin(a) * 9 - 2); }
      g.stroke();
    }
  }
}
function drawFaceShard(g, pts, v) {
  shapePath(g, pts);
  g.fillStyle = linG(g, -24, 0, 24, 104, [0, '#34405e', 0.3, '#0c0e1a', 0.62, '#171530', 1, '#3c3660']);
  g.fill();
  g.save();
  shapePath(g, pts); g.clip();
  const fx = [0, -2, 3, 1, -1][v], fy = [52, 48, 56, 50, 54][v], s = [1, 0.92, 1.05, 0.95, 1][v], tilt = [0.05, -0.12, 0.1, -0.04, 0.14][v];
  g.save(); g.translate(fx, fy); g.rotate(tilt); g.scale(s, s); screamFace(g, v); g.restore();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = linG(g, -30, 10, 30, 96, [0, 'rgba(255,150,230,0)', 0.28, 'rgba(255,150,230,0.16)', 0.44, 'rgba(140,230,255,0.22)', 0.6, 'rgba(160,255,200,0.1)', 0.8, 'rgba(255,255,255,0)']);
  g.fillRect(-30, 0, 60, 110);
  g.fillStyle = 'rgba(255,255,255,0.11)';
  const o = v * 5;
  g.beginPath(); g.moveTo(-30, 28 + o); g.lineTo(30, -6 + o); g.lineTo(30, 6 + o); g.lineTo(-30, 40 + o); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(235,245,255,0.6)'; g.lineWidth = 0.7;
  g.beginPath();
  for (let k = 0; k < 3; k++) {
    let x = -16 + h01(v * 11 + k) * 32, y = 10 + h01(v * 5 + k * 3) * 84;
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) { x += (h01(v + k * 7 + j) - 0.5) * 16; y += (h01(v * 3 + k + j * 5) - 0.3) * 12; g.lineTo(x, y); }
  }
  g.stroke();
  g.restore();
  shapePath(g, pts);
  g.strokeStyle = '#04030a'; g.lineWidth = 2.6; g.stroke();
  g.strokeStyle = 'rgba(222,234,255,0.92)'; g.lineWidth = 1.1; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + 1); g.lineTo(pts[1][0] - 1, pts[1][1]); g.stroke();
}
function drawTorso(g) {
  // 어깨 가시 (유리)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const bx = s * (22 + i * 5), by = -62 + i * 4, L = 30 - i * 5, a = s * (0.35 + i * 0.32);
      const tx = bx + Math.sin(a) * L, ty = by - Math.cos(a) * L;
      g.beginPath(); g.moveTo(bx - 3.2, by + 2); g.lineTo(tx, ty); g.lineTo(bx + 3.2, by + 2); g.closePath();
      g.fillStyle = linG(g, bx, by, tx, ty, [0, '#141220', 0.6, '#4a5478', 1, '#e8f4ff']); g.fill();
      g.strokeStyle = '#030206'; g.lineWidth = 1.2; g.stroke();
    }
  }
  g.beginPath();
  g.moveTo(-13, 2);
  g.bezierCurveTo(-16, -14, -24, -26, -27, -38);
  g.bezierCurveTo(-30, -48, -37, -54, -35, -61);
  g.quadraticCurveTo(-24, -67, -9, -69);
  g.lineTo(9, -69);
  g.quadraticCurveTo(24, -67, 35, -61);
  g.bezierCurveTo(37, -54, 30, -48, 27, -38);
  g.bezierCurveTo(24, -26, 16, -14, 13, 2);
  g.closePath();
  g.fillStyle = linG(g, -36, 0, 36, 0, [0, '#05040a', 0.2, '#2a283c', 0.34, '#727498', 0.44, '#24222f', 0.74, '#0c0a13', 1, '#3a4466']);
  g.fill(); g.strokeStyle = '#020104'; g.lineWidth = 2.4; g.stroke();
  // 흉갑 (광택 돔)
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(s * 11, -46, 11, 9, s * 0.3, 0, TAU);
    g.fillStyle = radG(g, s * 11 - 4, -50, 1, s * 11, -46, 12, [0, '#8a8cae', 0.35, '#2a2838', 1, '#08070c']); g.fill();
    g.strokeStyle = '#030206'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(210,225,255,0.6)'; g.lineWidth = 0.9;
    g.beginPath(); g.ellipse(s * 11, -46, 8, 6, s * 0.3, PI * 1.1, PI * 1.7); g.stroke();
  }
  // 배 마디 (갑각)
  for (let i = 0; i < 5; i++) {
    const y = -6 - i * 6.2, w = 11 + i * 2.8;
    g.strokeStyle = '#020104'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-w, y + 1); g.quadraticCurveTo(0, y + 5, w, y + 1); g.stroke();
    g.strokeStyle = 'rgba(150,164,210,0.45)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(-w + 1, y - 0.6); g.quadraticCurveTo(0, y + 3.2, w - 1, y - 0.6); g.stroke();
  }
  // 흉골 능선 + 보석 받침
  g.strokeStyle = 'rgba(200,214,255,0.55)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -30); g.stroke();
  g.beginPath(); g.moveTo(0, -38 - 11); g.lineTo(-7, -38); g.lineTo(0, -38 + 11); g.lineTo(7, -38); g.closePath();
  g.fillStyle = linG(g, -7, -49, 7, -27, [0, '#c8d0ec', 0.5, '#3a3e58', 1, '#10101a']); g.fill();
  g.strokeStyle = '#020104'; g.lineWidth = 1.2; g.stroke();
  g.beginPath(); g.ellipse(0, -38, 4.2, 6.2, 0, 0, TAU);
  g.fillStyle = radG(g, -1.2, -40, 0.5, 0, -38, 6.5, [0, '#e8fff4', 0.25, '#50ffb8', 0.7, '#0c7a4a', 1, '#03301c']); g.fill();
  // 쇄골 · 목 받침
  g.fillStyle = '#0c0b12';
  g.beginPath(); g.moveTo(-10, -69); g.quadraticCurveTo(0, -62, 10, -69); g.lineTo(8, -73); g.lineTo(-8, -73); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(200,214,255,0.5)'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(-26, -60); g.quadraticCurveTo(-14, -63, -6, -67); g.moveTo(26, -60); g.quadraticCurveTo(14, -63, 6, -67); g.stroke();
  // 은빛 세공 (왼쪽 옆구리)
  g.strokeStyle = 'rgba(190,206,250,0.35)'; g.lineWidth = 0.7;
  g.beginPath();
  for (let i = 0; i < 3; i++) { const y = -18 - i * 10; g.moveTo(-20 + i * 2, y); g.bezierCurveTo(-26 + i, y - 5, -18, y - 9, -14, y - 4); }
  g.stroke();
  // 림라이트
  g.strokeStyle = 'rgba(168,192,255,0.75)'; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(-13, 0); g.bezierCurveTo(-16, -14, -24, -26, -27, -38); g.bezierCurveTo(-30, -48, -37, -54, -35, -61); g.stroke();
}
function maskShell(g, rx, ry, cy) {
  g.beginPath(); g.ellipse(0, cy, rx, ry, 0, 0, TAU);
}
function drawHead1(g) {
  g.beginPath(); g.moveTo(-6, 4); g.lineTo(-5, -12); g.lineTo(5, -12); g.lineTo(6, 4); g.closePath();
  g.fillStyle = linG(g, -6, 0, 6, 0, [0, '#060509', 0.4, '#3a3a52', 1, '#0b0a10']); g.fill();
  g.strokeStyle = '#020104'; g.lineWidth = 1.3; g.stroke();
  // 두건처럼 감싼 검은 유리 머리
  maskShell(g, 21, 28, -34);
  g.fillStyle = radG(g, -8, -46, 2, 0, -34, 30, [0, '#6a6c8c', 0.25, '#222030', 1, '#050408']); g.fill();
  g.strokeStyle = '#020104'; g.lineWidth = 2; g.stroke();
  g.save();
  maskShell(g, 16, 23, -33); g.clip();
  g.fillStyle = linG(g, -16, -56, 16, -10, [0, '#ffffff', 0.4, '#e6e8f2', 0.8, '#aeb4c8', 1, '#7c8298']); g.fillRect(-17, -57, 34, 48);
  // 검은 왼쪽 반 (들쭉날쭉한 이음매)
  g.beginPath(); g.moveTo(-20, -60); g.lineTo(1, -58); g.lineTo(-1.2, -50); g.lineTo(2, -43); g.lineTo(-1, -34); g.lineTo(1.6, -25); g.lineTo(-1, -17); g.lineTo(1, -8); g.lineTo(-20, -8); g.closePath();
  g.fillStyle = linG(g, -16, -56, 0, -14, [0, '#4c4e6a', 0.3, '#15141e', 1, '#050408']); g.fill();
  // 세공 무늬
  g.strokeStyle = 'rgba(200,214,255,0.45)'; g.lineWidth = 0.6;
  g.beginPath();
  g.moveTo(-14, -20); g.bezierCurveTo(-10, -24, -12, -30, -7, -31);
  g.moveTo(-13, -46); g.bezierCurveTo(-9, -44, -10, -52, -6, -53);
  g.moveTo(-3, -18); g.quadraticCurveTo(-7, -14, -11, -16);
  g.stroke();
  // 눈구멍 (왼쪽 셋)
  for (const [ex, ey, r] of EYES1.slice(0, 3)) {
    g.beginPath(); g.ellipse(ex, ey, r * 1.35, r * 1.1, -0.2, 0, TAU);
    g.fillStyle = '#010003'; g.fill();
    g.strokeStyle = 'rgba(210,222,255,0.8)'; g.lineWidth = 0.8; g.stroke();
  }
  // 오른쪽 아몬드 눈 틈
  const [rx0, ry0] = EYES1[3];
  g.beginPath(); g.moveTo(rx0 - 5, ry0); g.quadraticCurveTo(rx0, ry0 - 3.8, rx0 + 5.5, ry0 - 0.8); g.quadraticCurveTo(rx0, ry0 + 2.6, rx0 - 5, ry0);
  g.fillStyle = '#010003'; g.fill();
  g.strokeStyle = '#1a1a26'; g.lineWidth = 0.9; g.stroke();
  // 눈물 자국 금 · 잔금
  g.strokeStyle = 'rgba(40,44,70,0.75)'; g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(rx0 + 1, ry0 + 2.5); g.lineTo(rx0 + 2.4, ry0 + 8); g.lineTo(rx0 + 1.2, ry0 + 12); g.lineTo(rx0 + 3, ry0 + 17);
  g.moveTo(rx0 + 2.4, ry0 + 8); g.lineTo(rx0 + 6, ry0 + 10);
  g.moveTo(9, -52); g.lineTo(5, -47); g.lineTo(7, -44);
  g.moveTo(13, -28); g.lineTo(9, -24); g.lineTo(10, -20);
  g.stroke();
  // 입술: 가느다란 검은 선 + 비웃는 입꼬리
  g.strokeStyle = '#0c0a12'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(-6, -17); g.quadraticCurveTo(0, -15.4, 6.5, -17.8); g.stroke();
  g.strokeStyle = 'rgba(150,20,40,0.7)'; g.lineWidth = 0.7;
  g.beginPath(); g.moveTo(-3, -16.4); g.quadraticCurveTo(0, -15.8, 3, -16.6); g.stroke();
  g.restore();
  maskShell(g, 16, 23, -33);
  g.strokeStyle = 'rgba(226,236,255,0.95)'; g.lineWidth = 1.2; g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.6;
  g.beginPath(); g.ellipse(0, -33, 17.4, 24.4, 0, 0, TAU); g.stroke();
}
function drawHead2(g) {
  g.beginPath(); g.moveTo(-8, 6); g.lineTo(-7, -12); g.lineTo(7, -12); g.lineTo(8, 6); g.closePath();
  g.fillStyle = linG(g, -8, 0, 8, 0, [0, '#060509', 0.4, '#3a3a52', 1, '#0b0a10']); g.fill();
  g.strokeStyle = '#020104'; g.lineWidth = 1.3; g.stroke();
  // 깨진 껍데기 (위쪽 오른편이 부서져 뾰족)
  const shell = [[0, -84], [8, -82], [13, -86], [17, -76], [22, -72], [24, -60], [27, -50], [24, -38], [24, -24], [20, -18], [-20, -18], [-24, -26], [-26, -42], [-25, -58], [-20, -72], [-11, -82]];
  shapePath(g, shell);
  g.fillStyle = linG(g, -26, -84, 26, -18, [0, '#565876', 0.25, '#17161f', 0.5, '#07060b', 0.52, '#dfe2ec', 0.8, '#b4b8c8', 1, '#6e7488']); g.fill();
  g.strokeStyle = '#020104'; g.lineWidth = 2; g.stroke();
  // 흰 쪽 금
  g.strokeStyle = 'rgba(40,44,70,0.8)'; g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(3, -82); g.lineTo(6, -72); g.lineTo(3, -64); g.lineTo(9, -58); g.moveTo(6, -72); g.lineTo(14, -68);
  g.moveTo(22, -46); g.lineTo(16, -40); g.lineTo(18, -32); g.moveTo(16, -40); g.lineTo(10, -38);
  g.stroke();
  // 눈구멍들
  for (const [ex, ey, r] of EYES2) {
    g.beginPath(); g.ellipse(ex, ey, r * 1.35, r * 1.1, h01(ex) - 0.5, 0, TAU);
    g.fillStyle = '#010003'; g.fill();
    g.strokeStyle = ex < 1 ? 'rgba(210,222,255,0.7)' : 'rgba(30,30,44,0.9)'; g.lineWidth = 0.8; g.stroke();
  }
  // 아가리 (어두운 속 + 목구멍 빛)
  g.beginPath(); g.moveTo(-20, -32); g.quadraticCurveTo(0, -40, 20, -32); g.lineTo(21, -12); g.lineTo(-21, -12); g.closePath();
  g.fillStyle = radG(g, 0, -18, 1, 0, -22, 22, [0, '#6a0a22', 0.35, '#220410', 1, '#030104']); g.fill();
  // 윗니 (거울 조각)
  for (let i = 0; i < 9; i++) {
    const x = -18 + i * 4.5, top = -34 + Math.abs(i - 4) * 0.7, L = 7 + (i % 2) * 3 + h01(i * 3.3) * 3;
    g.beginPath(); g.moveTo(x - 2.2, top); g.lineTo(x + 2.2, top); g.lineTo(x + (h01(i) - 0.5) * 1.5, top + L); g.closePath();
    g.fillStyle = linG(g, x - 2, top, x + 2, top + L, [0, '#ffffff', 0.5, '#cfeaff', 1, '#6aa0d0']); g.fill();
    g.strokeStyle = '#0a0c18'; g.lineWidth = 0.6; g.stroke();
  }
}
function drawJaw2(g) {
  g.beginPath(); g.moveTo(-21, 0); g.quadraticCurveTo(-22, 20, -6, 28); g.lineTo(0, 34); g.lineTo(6, 28); g.quadraticCurveTo(22, 20, 21, 0); g.lineTo(16, 2); g.quadraticCurveTo(0, 12, -16, 2); g.closePath();
  g.fillStyle = linG(g, -22, 0, 22, 0, [0, '#3a3c54', 0.45, '#0a090e', 0.52, '#d6dae6', 1, '#7c8298']); g.fill();
  g.strokeStyle = '#020104'; g.lineWidth = 1.8; g.stroke();
  for (let i = 0; i < 8; i++) {
    const x = -15 + i * 4.3, base = 3 + Math.abs(i - 3.5) * -0.2 + 5 - Math.abs(i - 3.5) * 0.9, L = 6 + (i % 2) * 3;
    g.beginPath(); g.moveTo(x - 2, base); g.lineTo(x + 2, base); g.lineTo(x, base - L); g.closePath();
    g.fillStyle = linG(g, x, base, x, base - L, [0, '#6aa0d0', 0.5, '#cfeaff', 1, '#ffffff']); g.fill();
    g.strokeStyle = '#0a0c18'; g.lineWidth = 0.6; g.stroke();
  }
  g.strokeStyle = 'rgba(40,44,70,0.7)'; g.lineWidth = 0.7;
  g.beginPath(); g.moveTo(8, 16); g.lineTo(12, 22); g.lineTo(10, 26); g.stroke();
}
function drawBlade(g) {
  g.beginPath(); g.moveTo(-4, 0); g.lineTo(-6.5, -24); g.lineTo(-2.4, -70); g.lineTo(0, -80); g.lineTo(2.6, -64); g.lineTo(6.5, -26); g.lineTo(4, 0); g.closePath();
  g.fillStyle = linG(g, -7, 0, 7, 0, [0, '#3c5484', 0.4, '#d8f0ff', 0.55, '#ffffff', 0.7, '#a8c8f0', 1, '#6a58a8']); g.fill();
  g.strokeStyle = '#08091a'; g.lineWidth = 1.5; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.7;
  g.beginPath(); g.moveTo(0.4, -4); g.lineTo(0.4, -72); g.stroke();
}
function drawHand(g) {
  g.beginPath(); g.ellipse(6, 0, 7.5, 6, 0, 0, TAU);
  g.fillStyle = radG(g, 4, -3, 0.5, 6, 0, 8, [0, '#6a6c8c', 0.4, '#1c1a28', 1, '#050408']); g.fill();
  g.strokeStyle = '#020104'; g.lineWidth = 1.3; g.stroke();
  for (let k = 0; k < 4; k++) {
    const by = -4 + k * 2.7, mx = 20 + (k === 1 || k === 2 ? 3 : 0), my = by + (k - 1.5) * 2.2, tx = 33 + (k === 1 || k === 2 ? 4 : 0), ty = my + 5 + k * 0.6;
    g.strokeStyle = '#020104'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(10, by); g.quadraticCurveTo(mx, my - 2, tx, ty); g.stroke();
    g.strokeStyle = '#2a2838'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(10, by); g.quadraticCurveTo(mx, my - 2, tx, ty); g.stroke();
    g.strokeStyle = 'rgba(210,226,255,0.8)'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(12, by - 0.8); g.quadraticCurveTo(mx, my - 2.8, tx - 2, ty - 1.2); g.stroke();
    g.fillStyle = '#e8f4ff'; g.beginPath(); g.moveTo(tx - 1.5, ty - 1); g.lineTo(tx + 3, ty + 2.5); g.lineTo(tx, ty + 1.4); g.closePath(); g.fill();
  }
  g.strokeStyle = '#020104'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(6, -4); g.quadraticCurveTo(14, -12, 20, -10); g.stroke();
  g.strokeStyle = '#2a2838'; g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(6, -4); g.quadraticCurveTo(14, -12, 20, -10); g.stroke();
}
function drawHandMirror(g) {
  g.strokeStyle = '#0a0a12'; g.lineWidth = 4.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -22); g.stroke();
  g.strokeStyle = '#c8d0e8'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(0, -1); g.lineTo(0, -22); g.stroke();
  g.beginPath(); g.ellipse(0, -39, 15, 18, 0, 0, TAU);
  g.fillStyle = linG(g, -15, -57, 15, -21, [0, '#f2f6ff', 0.5, '#8a94b8', 1, '#3c4260']); g.fill();
  g.strokeStyle = '#08070e'; g.lineWidth = 1.6; g.stroke();
  g.beginPath(); g.ellipse(0, -39, 11, 14, 0, 0, TAU);
  g.fillStyle = linG(g, -11, -53, 11, -25, [0, '#ffffff', 0.35, '#bfe6ff', 0.7, '#5c7ab0', 1, '#28304e']); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-6, -46); g.lineTo(-1, -50); g.moveTo(-7, -40); g.lineTo(2, -48); g.stroke();
  for (let i = 0; i < 5; i++) { const a = -PI / 2 + (i - 2) * 0.4; g.fillStyle = '#e8f0ff'; g.beginPath(); g.moveTo(Math.cos(a) * 14, -39 + Math.sin(a) * 17); g.lineTo(Math.cos(a) * 22, -39 + Math.sin(a) * 24); g.lineTo(Math.cos(a + 0.12) * 14, -39 + Math.sin(a + 0.12) * 17); g.closePath(); g.fill(); }
}
function drawFrame(g) {
  // 벽거울: 은빛 바로크 틀 + 가시 왕관
  for (let i = 0; i < 7; i++) {
    const a = -PI / 2 + (i - 3) * 0.3, L = 16 + (3 - Math.abs(i - 3)) * 6;
    const bx = Math.cos(a) * 30, by = -8 + Math.sin(a) * 54;
    g.beginPath(); g.moveTo(bx - 3, by + 2); g.lineTo(bx + Math.cos(a) * L, by + Math.sin(a) * L); g.lineTo(bx + 3, by + 2); g.closePath();
    g.fillStyle = linG(g, bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L, [0, '#2a2c40', 1, '#f0f6ff']); g.fill();
    g.strokeStyle = '#05040a'; g.lineWidth = 1.1; g.stroke();
  }
  g.beginPath(); g.moveTo(-6, 56); g.lineTo(0, 70); g.lineTo(6, 56); g.closePath(); g.fillStyle = '#c8d0e8'; g.fill(); g.strokeStyle = '#05040a'; g.stroke();
  g.beginPath(); g.ellipse(0, 0, 33, 57, 0, 0, TAU);
  g.fillStyle = linG(g, -33, -57, 33, 57, [0, '#f4f8ff', 0.3, '#8a92b0', 0.55, '#2c3048', 0.8, '#a4acc8', 1, '#40465e']); g.fill();
  g.strokeStyle = '#05040a'; g.lineWidth = 2.2; g.stroke();
  // 틀 장식 알갱이
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    dot(g, Math.cos(a) * 29.5, Math.sin(a) * 53, 2.4, [0, '#ffffff', 0.5, '#9aa4c4', 1, 'rgba(40,44,64,0)']);
  }
  g.beginPath(); g.ellipse(0, 0, 25, 48, 0, 0, TAU);
  g.fillStyle = linG(g, -25, -48, 25, 48, [0, '#3a4668', 0.4, '#141a2c', 0.62, '#23304c', 1, '#070a12']); g.fill();
  g.strokeStyle = '#05040a'; g.lineWidth = 1.6; g.stroke();
  g.save(); g.beginPath(); g.ellipse(0, 0, 25, 48, 0, 0, TAU); g.clip();
  g.fillStyle = 'rgba(200,230,255,0.12)';
  g.beginPath(); g.moveTo(-30, 10); g.lineTo(30, -40); g.lineTo(30, -28); g.lineTo(-30, 22); g.closePath(); g.fill();
  g.fillStyle = 'rgba(200,230,255,0.07)';
  g.beginPath(); g.moveTo(-30, 34); g.lineTo(30, -10); g.lineTo(30, -4); g.lineTo(-30, 40); g.closePath(); g.fill();
  g.restore();
}
function drawHalo2(g) {
  // 가면이 깨진 뒤의 후광: 금 간 거울 원반
  g.beginPath(); g.ellipse(0, 0, 76, 84, 0, 0, TAU);
  g.fillStyle = radG(g, 0, -10, 6, 0, 0, 84, [0, 'rgba(240,250,255,0.5)', 0.5, 'rgba(180,210,255,0.24)', 0.9, 'rgba(150,170,255,0.1)', 1, 'rgba(150,170,255,0)']); g.fill();
  g.strokeStyle = 'rgba(235,245,255,0.7)'; g.lineWidth = 1.1;
  g.beginPath();
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * TAU + h01(i) * 0.3;
    let r = 18 + h01(i * 7) * 10;
    g.moveTo(Math.cos(a) * r, Math.sin(a) * r * 1.1);
    for (let j = 0; j < 3; j++) { r += 10 + h01(i * 3 + j) * 6; const aa = a + (h01(i + j * 9) - 0.5) * 0.3; g.lineTo(Math.cos(aa) * r, Math.sin(aa) * r * 1.1); }
  }
  for (let k = 0; k < 3; k++) { const r = 30 + k * 18; g.moveTo(r, 0); for (let i = 1; i <= 24; i++) { const a = (i / 24) * TAU; const rr = r + (h01(i * 5 + k) - 0.5) * 6; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 1.1); } }
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.6;
  g.beginPath(); g.ellipse(0, 0, 76, 84, 0, PI * 1.05, PI * 1.6); g.stroke();
}
function drawOrbitShard(g) {
  g.beginPath(); g.moveTo(-15, 0); g.lineTo(-4, -5.5); g.lineTo(15, 0); g.lineTo(-2, 5); g.closePath();
  g.fillStyle = linG(g, 0, -6, 0, 6, [0, '#ffffff', 0.4, '#bfe6ff', 1, '#5a6ab0']); g.fill();
  g.strokeStyle = '#0a0c18'; g.lineWidth = 1.1; g.stroke();
}
function drawKaleido(g) {
  for (let i = 0; i < 6; i += 2) {
    const a0 = (i / 6) * TAU + 0.1, a1 = a0 + TAU / 6 - 0.2;
    g.beginPath(); g.moveTo(Math.cos(a0) * 9, Math.sin(a0) * 9); g.lineTo(Math.cos(a0) * 31, Math.sin(a0) * 31); g.lineTo(Math.cos(a1) * 31, Math.sin(a1) * 31); g.lineTo(Math.cos(a1) * 9, Math.sin(a1) * 9); g.closePath();
    g.fillStyle = ['rgba(150,225,255,0.42)', 'rgba(255,160,225,0.36)', 'rgba(210,255,235,0.32)'][i / 2]; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.8; g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.8;
  for (const r of [20, 29]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
}
/** 균열 경로 (머리 좌표 · 몸 좌표). th = 드러나는 피해율 */
function genCracks() {
  const make = (n, seed, box) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      let x = lerp(box[0], box[2], h01(seed + i * 3.1)), y = lerp(box[1], box[3], h01(seed + i * 5.7));
      const pts = [x, y];
      const a0 = h01(seed + i * 9.3) * TAU;
      for (let j = 0; j < 4; j++) { const a = a0 + (h01(seed + i + j * 2.9) - 0.5) * 1.6; const L = 5 + h01(seed + i * 2 + j) * 9; x += Math.cos(a) * L; y += Math.sin(a) * L; pts.push(x, y); }
      out.push({ pts, th: 0.06 + (i / n) * 0.86 });
    }
    return out;
  };
  return { head: make(9, 11, [-14, -54, 14, -14]), body: make(22, 37, [-36, -200, 36, -20]) };
}
/** 왕관 바늘 11개 (머리 가운데 기준): 끝점 tx, ty 는 반짝임 자리 */
const CROWN = [46, 60, 74, 86, 98, 108, 98, 86, 74, 60, 46].map((L, i) => {
  const a = -PI / 2 + (i - 5) * 0.2, bx = Math.cos(a) * 15, by = Math.sin(a) * 18;
  return { L, a, bx, by, tx: bx + Math.cos(a) * L, ty: by + Math.sin(a) * L };
});
const crownBroken = (form, i) => (form >= 1 && (i === 2 || i === 7)) || (form >= 2 && i % 2 === 1);
function drawCrown(g, form, blade) {
  CROWN.forEach((c, i) => {
    const L = crownBroken(form, i) ? c.L * 0.42 : c.L;
    g.save(); g.translate(c.bx, c.by); g.rotate(c.a + PI / 2); g.scale(0.52, L / 80);
    blade(g);
    g.restore();
  });
}
function bakeArt(K) {
  if (!canvasOf(1, 1)) return null;
  const A = { K };
  A.crown = [0, 1, 2].map((f) => mk(K, 280, 170, 140, 150, (g) => drawCrown(g, f, drawBlade)));
  A.shards = SHARD_SHAPES.map((sh, v) => mk(K, 56, 112, 28, 4, (g) => drawFaceShard(g, sh, v)));
  A.torso = mk(K, 112, 108, 56, 98, drawTorso);
  A.head1 = mk(K, 60, 76, 30, 70, drawHead1);
  A.head2 = mk(K, 64, 100, 32, 92, drawHead2);
  A.jaw2 = mk(K, 50, 40, 25, 4, drawJaw2);
  A.blade = mk(K, 18, 86, 9, 83, drawBlade);
  A.hand = mk(K, 50, 36, 6, 18, drawHand);
  A.hmirror = mk(K, 54, 70, 27, 67, drawHandMirror);
  A.frame = mk(K, 96, 184, 48, 102, drawFrame);
  A.halo2 = mk(K, 164, 180, 82, 90, drawHalo2);
  A.orbit = mk(K, 34, 14, 17, 7, drawOrbitShard);
  A.kaleido = mk(1, 64, 64, 32, 32, drawKaleido, false);
  A.cracks = genCracks();
  for (const c of [GL, GL_C, GL_V, GOLD, RED, GEM, EYE_C, '#ffffff', '#8090c0']) { glowSprite(c, true); glowSprite(c, false); }
  return A;
}

// ───────────────────────── 매 프레임 그리기 도우미 ─────────────────────────
/** 검은 유리 원통 (다리·팔). 반지름은 정수로 (그라디언트 캐시 키) */
function gtube(ctx, x0, y0, x1, y1, r0, r1, dark = false) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 0.5) return;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  ctx.save(); ctx.translate(x0, y0); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -r0); ctx.lineTo(L, -r1); ctx.arc(L, 0, r1, -PI / 2, PI / 2); ctx.lineTo(0, r0); ctx.arc(0, 0, r0, PI / 2, -PI / 2);
  ctx.closePath();
  const rr = Math.max(1, Math.round(Math.max(r0, r1)));
  ctx.fillStyle = R.fl ? '#ffffff' : LG(ctx, 'nk_tube' + rr + (dark ? 'd' : ''), 0, -rr, 0, rr, dark
    ? [0, '#5a6284', 0.2, '#1e1c2a', 0.55, '#07060b', 0.85, '#121019', 1, '#3a4262']
    : [0, '#b4bede', 0.16, '#44425e', 0.5, '#0e0c16', 0.8, '#1e1c2a', 1, '#6c7aa8']);
  if (!R.fl) { ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fill();
  if (!R.fl && !dark) {
    ctx.strokeStyle = 'rgba(232,242,255,0.55)'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(r0 * 0.4, -r0 * 0.55); ctx.lineTo(L - r1 * 0.4, -r1 * 0.55); ctx.stroke();
  }
  ctx.restore();
}
/** 관절 원반 (초상화의 둥근 관절 뚜껑) */
function joint(ctx, x, y, r, dark = false) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = R.fl ? '#ffffff' : dark ? '#0a0910' : '#14121c';
  ctx.fill();
  if (R.fl) return;
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.strokeStyle = dark ? 'rgba(140,156,200,0.5)' : 'rgba(210,224,255,0.75)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, PI * 0.9, PI * 2.3); ctx.stroke();
  ctx.beginPath(); ctx.arc(x - r * 0.1, y - r * 0.05, r * 0.28, PI, PI * 2.2); ctx.stroke();
}
/** 두 마디 IK: 엉덩이 H → 발 F, 무릎은 바깥 위로 */
function ik2(hx, hy, fx, fy, L1, L2, side) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 1;
  const dc = clamp(d, Math.abs(L1 - L2) + 1, L1 + L2 - 1);
  const th = Math.atan2(dy, dx);
  const a1 = Math.acos(clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1));
  const ka = th - side * a1;
  const kx = hx + Math.cos(ka) * L1, ky = hy + Math.sin(ka) * L1;
  if (d > dc) { fx = hx + (dx / d) * dc; fy = hy + (dy / d) * dc; }
  return { kx, ky, fx, fy };
}
const LEG_L = [[118, 150], [148, 190], [172, 226]];
const LEG_REACH = [150, 212, 270];
/** 거미 다리 6개: 발이 바닥에 박혀 있다가 몸이 멀어지면 한 발씩 옮긴다 (바닥에서 높이 뜨면 늘어뜨린다) */
class SpiderLegs {
  constructor() {
    this.F = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) this.F.push({ s, i, x: 0, y: 0, x0: 0, y0: 0, tx: 0, ty: 0, k: 1, hx: 0, hy: 0, init: false });
  }
  reset() { for (const q of this.F) q.init = false; }
  hip(q, x, y, f, P) {
    const lx = q.s * (16 + q.i * 9), ly = -122 + q.i * 5;
    const r = P.rot || 0, c = Math.cos(r), sn = Math.sin(r);
    const dx = lx, dy = ly + 125;
    return { x: x + f * (dx * c - dy * sn), y: y + (dx * sn + dy * c) - 125 };
  }
  update(dt, world, x, y, floor, f, P, vx, t) {
    const planted = floor - y < 110 && !(P.fold > 0.5);
    for (const q of this.F) {
      const H = this.hip(q, x, y, f, P);
      q.hx = H.x; q.hy = H.y;
      const ix = x + q.s * LEG_REACH[q.i];
      if (!q.init) { q.x = ix; q.y = planted ? floor : H.y + 150; q.k = 1; q.init = true; }
      if (planted) {
        if (q.k < 1) {
          q.k = Math.min(1, q.k + dt / 0.2);
          const e = q.k * q.k * (3 - 2 * q.k);
          q.x = lerp(q.x0, q.tx, e); q.y = lerp(q.y0, q.ty, e) - Math.sin(q.k * PI) * 38;
          if (q.k >= 1 && world && (world.fx?.quality ?? 1) > 0.5 && Math.random() < 0.6) world.fx?.emit?.('dust', q.x, floor - 2, { speed: 40, size: 5 });
        } else {
          const busy = this.F.some((o) => o !== q && o.s === q.s && o.k < 1);
          if (!busy && (Math.abs(q.x - ix) > 56 + q.i * 14 || Math.abs(q.y - floor) > 3)) {
            q.x0 = q.x; q.y0 = q.y; q.tx = ix + clamp(vx * 0.22, -90, 90); q.ty = floor; q.k = 0;
          }
        }
      } else {
        const tx = H.x + q.s * (54 + q.i * 42) - vx * 0.12, ty = H.y + 118 + q.i * 22 + Math.sin(t * 3 + q.i + q.s) * 9;
        const k = 1 - Math.exp(-7 * dt);
        q.x += (tx - q.x) * k; q.y += (ty - q.y) * k; q.k = 1;
      }
    }
  }
  draw(ctx, ox, oy) {
    for (let i = 2; i >= 0; i--) {
      for (const q of this.F) {
        if (q.i !== i || !q.init) continue;
        const [L1, L2] = LEG_L[q.i];
        const J = ik2(q.hx, q.hy, q.x, q.y, L1, L2, q.s);
        const dark = q.i === 2;
        const hx = q.hx - ox, hy = q.hy - oy, kx = J.kx - ox, ky = J.ky - oy, fx = J.fx - ox, fy = J.fy - oy;
        gtube(ctx, hx, hy, kx, ky, 8 - q.i, 6 - q.i, dark);
        gtube(ctx, kx, ky, fx, fy, 5, 2, dark);
        joint(ctx, kx, ky, 8 - q.i * 0.5, dark);
        // 발끝 갈고리
        const a = Math.atan2(fy - ky, fx - kx);
        ctx.beginPath(); ctx.moveTo(fx - Math.sin(a) * 3, fy + Math.cos(a) * 3); ctx.lineTo(fx + Math.cos(a) * 12, fy + Math.sin(a) * 12 + 2); ctx.lineTo(fx + Math.sin(a) * 3, fy - Math.cos(a) * 3); ctx.closePath();
        ctx.fillStyle = R.fl ? '#fff' : '#d8e6ff'; ctx.fill();
      }
    }
  }
}

/** 자세 기본값 (a = 아래에서 바깥쪽으로 잰 팔 각, e = 팔꿈치 굽힘) */
const POSE_DEF = { bob: 0, tilt: 0, rot: 0, scale: 1, fade: 1, fa0a: 0.4, fa0e: 0.5, fa1a: 1.95, fa1e: 0.85, ba: 0, low: 0, high: 0, mirror: 0, scream: 0, jaw: 0.2, spread: 0, swing: 0, fold: 0, droop: 0 };
const POSE_RATE = { rot: 8, scale: 9, fade: 12 };
function easePose(P, T, dt) {
  for (const k in T) {
    if (k === 'bob' || k === 'swing') continue;   // 매 프레임 직접 계산
    const r = POSE_RATE[k] ?? 11;
    P[k] += (T[k] - P[k]) * (1 - Math.exp(-r * dt));
  }
}

/**
 * 나르키사 한 몸 그리기 (보스 · 거울 분신 공용). (x, y) = 앵커 (몸통 판정 아래 가운데), f = 방향
 * o: { t, form(0|1|2), dmg(0~1), twin, legs, tear, eyeGlow, look:{x,y}, maskCrack }
 */
function drawNark(ctx, x, y, f, P, o) {
  const A = ART, fl = R.fl, t = o.t ?? 0, form = o.form ?? 0, dmg = o.dmg ?? 0;
  const Y = y + P.bob;
  if (!A) {   // 굽기 실패(캔버스 없음) 대체: 실루엣
    ctx.fillStyle = fl ? '#fff' : '#14121c';
    ctx.beginPath(); ctx.ellipse(x, Y - 125, 55, 125, 0, 0, TAU); ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(x, Y);
  if (P.fade < 0.999) ctx.globalAlpha *= clamp(P.fade, 0, 1);
  if (!fl) {
    glowE(ctx, 0, -150, 130, 170, o.twin ? GL_C : '#8090c0', o.twin ? 0.3 : 0.16);
    const fr = (o.floor ?? y + HOVER) - Y;
    if (fr > -10 && fr < 90) glowE(ctx, 0, fr, 120, 16, GL, 0.18 * (1 - fr / 90));
  }
  o.legs?.draw(ctx, x, Y);
  ctx.scale(f, 1);
  if (P.rot) { ctx.translate(0, -125); ctx.rotate(P.rot); ctx.translate(0, 125); }
  if (Math.abs(P.scale - 1) > 0.002) { ctx.translate(0, -150); ctx.scale(P.scale, P.scale); ctx.translate(0, 150); }
  const HX = 0, HY = MASK_C;
  // ── 후광 (가면: 유리 바늘 왕관 / 깨진 뒤: 금 간 거울 원반) ──
  if (form >= 2) {
    put(ctx, A.halo2, HX, HY - 6, Math.sin(t * 0.4) * 0.08, 1 + Math.sin(t * 2) * 0.02);
    orbitShards(ctx, A, t, HY, false, P);
  }
  // 유리 바늘 왕관: 형태별로 한 장에 구워 둔 것 (숨쉬기·비명은 통째로 늘였다 줄인다)
  const crown = A.crown[Math.min(2, form)];
  const cs = 1 + Math.sin(t * 2) * 0.03 + P.scream * 0.12;
  put(ctx, crown, HX, HY, 0, cs * (1 + P.spread * 0.15), cs);
  if (!fl) {
    const i = (Math.floor(t * 1.3) * 3) % CROWN.length, c = CROWN[i];
    if (!crownBroken(form, i)) glow(ctx, HX + c.tx * cs, HY + c.ty * cs, 12, '#ffffff', 0.5 + 0.4 * Math.sin(t * 7 + i), true);
  }
  // ── 등 칼날 팔 ──
  for (let k = 0; k < 4; k++) {
    const [s, sx, sy, a0, e0] = BLADE_ARMS[k];
    const upper = k < 2;
    const tw = Math.sin(t * 2.3 + k * 1.7) * 0.07 + Math.sin(t * 7.1 + k) * 0.02;
    let a = a0 + P.ba * 0.45 + tw, e = e0 + P.ba * 0.7;
    const sw = upper ? P.high : P.low;
    if (sw > 0.01) { a = lerp(a, upper ? 1.62 : 0.75, sw); e = lerp(e, upper ? 0.05 : 0.35, sw); }
    if (P.droop > 0.01) { a = lerp(a, 0.5, P.droop); e = lerp(e, 0.2, P.droop); }
    const L1 = 64, L2 = 70;
    const ex = sx + s * Math.sin(a) * L1, ey = sy + Math.cos(a) * L1;
    const b = a + e;
    const wx = ex + s * Math.sin(b) * L2, wy = ey + Math.cos(b) * L2;
    gtube(ctx, sx, sy, ex, ey, 4, 3, true);
    gtube(ctx, ex, ey, wx, wy, 3, 2, true);
    joint(ctx, ex, ey, 4.5, true);
    put(ctx, A.blade, wx, wy, Math.atan2(Math.cos(b), s * Math.sin(b)) + PI / 2, 1.05, 1.05);
  }
  // ── 속치마 (검은 유리 종) ──
  ctx.beginPath();
  ctx.moveTo(-14, WAIST);
  ctx.bezierCurveTo(-40, WAIST + 40, -80, -40, -100 - P.spread * 14, 12);
  for (let i = 0; i <= 10; i++) ctx.lineTo(lerp(-100, 100, i / 10) * (1 + P.spread * 0.16), 12 + (i % 2) * 9 + Math.sin(t * 2 + i) * 2);
  ctx.bezierCurveTo(80, -40, 40, WAIST + 40, 14, WAIST);
  ctx.closePath();
  ctx.fillStyle = fl ? '#fff' : LG(ctx, 'nk_under', 0, WAIST, 0, 16, [0, '#1e1c2c', 0.5, '#0c0b14', 1, '#040308']);
  ctx.fill();
  if (!fl) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(170,186,236,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of [-1, -0.35, 0.35, 1]) { ctx.moveTo(s * 8, WAIST + 6); ctx.quadraticCurveTo(s * 40, -70, s * 74, 14); }
    ctx.stroke();
  }
  // ── 드레스: 비명이 비친 거울 조각들 (아래 층부터) ──
  const lost2 = form >= 2 ? 0.08 : 0;
  for (let tier = 3; tier >= 0; tier--) {
    for (let i = 0; i < GOWN.length; i++) {
      const g = GOWN[i];
      if (g[3] !== tier) continue;
      if (g[4] !== null && dmg > g[4] - lost2 && !o.twin) continue;
      const w = 1 + P.spread * 0.3;
      const sway = Math.sin(t * 1.35 + i * 1.7) * 0.035 + P.swing * 0.18 * (tier + 1) + P.spread * g[0] * 0.004;
      put(ctx, A.shards[(i * 3) % 5], g[0] * w, g[1], g[0] * 0.004 + sway, g[2]);
    }
  }
  if (!fl && dmg > 0.2) {   // 조각이 빠진 자리에서 새어 나오는 빛
    glowE(ctx, 0, -60, 60, 50, GL_V, 0.12 + dmg * 0.18);
  }
  // ── 몸통 ──
  put(ctx, A.torso, 0, WAIST, 0, 1.3, 1.0);
  if (!fl) glow(ctx, 0, WAIST - 38, 16 + Math.sin(t * 3) * 2, GEM, 0.55 + 0.25 * Math.sin(t * 3));
  // ── 앞팔 (뒤쪽 먼저) ──
  arm(ctx, A, -1, P.fa0a, P.fa0e, P, false);
  // ── 머리 ──
  ctx.save();
  ctx.translate(0, NECK);
  ctx.rotate(P.tilt + Math.sin(t * 0.9) * 0.03);
  if (form >= 2) ctx.scale(HEAD_S2, HEAD_S2); else ctx.scale(HEAD_S, HEAD_S);
  const shake = (o.maskCrack ?? 0) > 0 && form < 2 ? Math.sin(t * 60) * 1.2 * o.maskCrack : 0;
  if (shake) ctx.translate(shake, 0);
  if (form >= 2) {
    const jo = 4 + P.jaw * 18;
    if (!fl) {
      ctx.fillStyle = '#030104';
      ctx.beginPath(); ctx.ellipse(0, -22 + jo * 0.45, 19, 6 + jo * 0.55, 0, 0, TAU); ctx.fill();
      glowE(ctx, 0, -18 + jo * 0.5, 14, 6 + jo * 0.4, RED, 0.35 + P.jaw * 0.35);
    }
    put(ctx, A.jaw2, 0, -22 + jo);
    put(ctx, A.head2, 0, 0);
    eyes(ctx, EYES2, t, o, P, true);
  } else {
    put(ctx, A.head1, 0, 0);
    eyes(ctx, EYES1, t, o, P, false);
    if (o.tear && !fl) {
      const [ex, ey] = EYES1[3];
      ctx.strokeStyle = 'rgba(255,40,70,0.85)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(ex, ey + 2); ctx.quadraticCurveTo(ex + 1.5, ey + 9, ex + 0.5, ey + 16); ctx.stroke();
      glow(ctx, ex + 0.5, ey + 14, 6, RED, 0.6);
    }
  }
  if (!fl) cracksPath(ctx, A.cracks.head, form >= 2 ? 1 : Math.max(dmg * 1.1, o.maskCrack ?? 0), 0.9);
  ctx.restore();
  // ── 앞팔 (앞쪽) ──
  arm(ctx, A, 1, P.fa1a, P.fa1e, P, true);
  if (form >= 2) orbitShards(ctx, A, t, HY, true, P);
  if (!fl && dmg > 0.04) cracksPath(ctx, A.cracks.body, dmg, 0.7);
  ctx.restore();
}
/** 앞팔 한 쪽: 어깨 → 팔꿈치 → 손목 + 손 (앞쪽 손은 손거울을 들 수 있다) */
function arm(ctx, A, s, a, e, P, front) {
  if (P.droop > 0.01) { a = lerp(a, 0.12, P.droop); e = lerp(e, 0.15, P.droop); }
  const sx = s * 36, sy = -198, L1 = 66, L2 = 70;
  const ex = sx + s * Math.sin(a) * L1, ey = sy + Math.cos(a) * L1;
  const b = a + e;
  const wx = ex + s * Math.sin(b) * L2, wy = ey + Math.cos(b) * L2;
  gtube(ctx, sx, sy, ex, ey, 8, 6, !front);
  gtube(ctx, ex, ey, wx, wy, 6, 4, !front);
  joint(ctx, ex, ey, 7.5, !front);
  joint(ctx, sx, sy, 10, !front);
  const dir = Math.atan2(Math.cos(b), s * Math.sin(b));
  if (front && P.mirror > 0.3) put(ctx, A.hmirror, wx, wy, dir + PI / 2 - 0.3, clamp(P.mirror, 0, 1));
  put(ctx, A.hand, wx, wy, dir, 1.2, Math.cos(dir) < 0 ? -1.2 : 1.2);
}
/** 눈: 소켓(구운 그림) 위에 빛나는 눈동자. 플레이어 쪽을 본다, 가끔 깜빡 */
function eyes(ctx, list, t, o, P, many) {
  if (R.fl) return;
  const lx = clamp(o.lookX ?? 0, -1, 1), ly = clamp(o.lookY ?? 0, -1, 1);
  const g = o.eyeGlow ?? 0;
  for (let i = 0; i < list.length; i++) {
    const [ex, ey, r] = list[i];
    const blink = ((t * 0.37 + h01(i) * 7) % 3.1) < 0.12;
    if (blink && !g) continue;
    const col = many ? (i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? EYE_C : GL_V) : (i === 3 ? '#ffffff' : EYE_C);
    const wob = many ? Math.sin(t * 3 + i * 2.1) * 0.5 : 0;
    const px = ex + lx * r * 0.45 + wob, py = ey + ly * r * 0.35;
    glow(ctx, px, py, r * (3.2 + g * 1.4), col, 0.38 + g * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, Math.max(0.8, r * 0.55), 0, TAU); ctx.fill();
    if (many || i === 3) { ctx.fillStyle = '#0a0612'; ctx.beginPath(); ctx.ellipse(px + lx * 0.4, py, Math.max(0.4, r * 0.16), Math.max(0.6, r * 0.42), 0, 0, TAU); ctx.fill(); }
  }
}
function cracksPath(ctx, list, k, a) {
  if (!(k > 0.02)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  let n = 0;
  for (const c of list) {
    if (c.th > k) continue;
    const P = c.pts;
    ctx.moveTo(P[0], P[1]);
    for (let i = 2; i < P.length; i += 2) ctx.lineTo(P[i], P[i + 1]);
    n++;
  }
  if (n) {
    ctx.strokeStyle = rgba(GL_C, 0.28 * a); ctx.lineWidth = 3.2; ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.75 * a); ctx.lineWidth = 0.9; ctx.stroke();
  }
  ctx.restore();
}
/** 3페이즈: 머리 둘레를 도는 거울 파편 8개 (front = 앞쪽 절반만) */
function orbitShards(ctx, A, t, hy, front, P) {
  for (let i = 0; i < 8; i++) {
    const a = t * 0.9 + (i / 8) * TAU;
    const z = Math.sin(a);
    if ((z > 0) !== front) continue;
    const r = 118 + P.spread * 30, x = Math.cos(a) * r, y = hy + 40 + z * 26 + Math.sin(t * 2 + i) * 6;
    const s = 0.8 + 0.25 * z;
    put(ctx, A.orbit, x, y, a * 2 + i, s);
    if (!R.fl && front) glow(ctx, x, y, 14, GL, 0.35);
  }
}

// ───────────────────────── 경기장 소품: 벽거울 ─────────────────────────
/** 벽거울 M0–M3. 뛰어든 거울은 gold 초 동안 '진짜 거울' (칠 수 있음 → 여제 기절, 피해 없음) */
class NarkMirror extends Entity {
  constructor(boss, i, x, y) {
    super(x - 30, y - 54, 60, 108);
    this.kind = 'prop'; this.z = 3; this.boss = boss; this.world = boss.world; this.i = i;
    this.mx = x; this.my = y;
    this.stats = { def: 0, res: 0 };
    this.def = { id: 'nark_mirror', name: '거울', material: 'ice' };
    this.noGuardianHit = true;
    this.reset();
  }
  reset() { this.gold = 0; this.warnT = 0; this.flashT = 0; this.hitT = 0; this.crack = 0; this.dark = 0; this._hitIds = null; }
  get invuln() { return !(this.gold > 0) || !!this.boss.dead || this.boss.dying > 0; }
  hurtbox() { return this.gold > 0 ? this.rect() : OFF; }
  takeHit(dmg, attack, world) {
    if (!(this.gold > 0) || attack?.tags?.includes('companion')) return false;
    let id = attack?.hitId;
    if (typeof id === 'string') { if (id.startsWith('aura')) return false; id = id.replace(/:\d+$/, ''); }
    if (id != null) { const seen = (this._hitIds ??= new Set()); if (seen.has(id)) return false; seen.add(id); }
    this.hitT = 0.35;
    this.boss.onRealMirror?.(this, world);
    return false;
  }
  update(dt, world) {
    if (heldByFreeze(world, this.boss)) return;
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt;
    if (this.gold > 0) this.gold -= dt;
    if (this.warnT > 0) this.warnT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.hitT > 0) this.hitT -= dt;
    const b = this.boss;
    if ((b.dead || b.dying > 0) && this.crack < 1) { this.crack = Math.min(1, this.crack + dt * 0.8); this.dark = this.crack; this.gold = 0; this.warnT = 0; }
  }
  lights(L) {
    const k = this.gold > 0 ? 0.8 : this.warnT > 0 ? 0.9 : this.flashT > 0 ? 0.7 : 0.25 * (1 - this.dark);
    if (k > 0.05) L.add(this.mx, this.my, this.gold > 0 || this.warnT > 0 ? 170 : 110, this.gold > 0 || this.warnT > 0 ? GOLD : GL, k);
  }
  draw(ctx, world) {
    const A = ART;
    const b = this.boss, x = this.mx, y = this.my, t = this.t;
    const sx = this.hitT > 0 ? Math.sin(t * 90) * 3 * (this.hitT / 0.35) : 0;
    ctx.save();
    ctx.translate(sx, 0);
    if (A?.frame) put(ctx, A.frame, x, y);
    else { ctx.fillStyle = '#2a2e44'; ctx.beginPath(); ctx.ellipse(x, y, 30, 54, 0, 0, TAU); ctx.fill(); }
    // 유리 속: 흐르는 윤슬 · 여제 그림자 (clip 없이: 유리 타원 안쪽에만 들어가는 모양으로)
    const band = ((t * 0.3 + this.i * 0.27) % 1.2) - 0.1, by = y - 40 + band * 80;
    const hw = 22 * Math.sqrt(Math.max(0, 1 - ((by - y) / 46) ** 2));
    if (hw > 3) glowE(ctx, x, by, hw, 6, '#c8ecff', 0.35);
    if (b.inMirror === this || (b.inMirror && b.exitMirror === this)) {
      const k = 0.55 + 0.25 * Math.sin(t * 6);
      ctx.fillStyle = `rgba(10,8,18,${k.toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(x, y + 6, 13, 36, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y - 30, 8, 10, 0, 0, TAU); ctx.fill();
      glow(ctx, x - 3, y - 31, 6, EYE_C, 0.9); glow(ctx, x + 3, y - 30, 5, EYE_C, 0.8);
    }
    const warm = this.gold > 0 ? clamp(this.gold / 0.4, 0, 1) * (0.55 + 0.3 * Math.sin(t * 14)) : 0;
    const warn = this.warnT > 0 ? 0.5 + 0.45 * Math.sin(t * 24) : 0;
    const fk = Math.max(warm, warn);
    const glass = (fill, a) => { ctx.globalAlpha = a; ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, 25, 48, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; };
    if (fk > 0) { ctx.globalCompositeOperation = 'lighter'; glass(GOLD, 0.5 * fk); ctx.globalCompositeOperation = 'source-over'; }
    if (this.flashT > 0) { ctx.globalCompositeOperation = 'lighter'; glass('#ffffff', 0.6 * clamp(this.flashT, 0, 1)); ctx.globalCompositeOperation = 'source-over'; }
    if (this.dark > 0) glass('#04040a', 0.7 * this.dark);
    if (this.crack > 0) {
      ctx.strokeStyle = 'rgba(235,245,255,0.8)'; ctx.lineWidth = 1.1;
      ctx.beginPath();
      const n = Math.ceil(this.crack * 7);
      for (let i = 0; i < n; i++) { const a = (i / 7) * TAU + this.i; ctx.moveTo(x, y - 6); ctx.lineTo(x + Math.cos(a) * 12, y - 6 + Math.sin(a) * 20); ctx.lineTo(x + Math.cos(a + 0.2) * 24, y - 6 + Math.sin(a + 0.2) * 44); }
      ctx.stroke();
    }
    if (fk > 0) { glowE(ctx, x, y, 60, 90, GOLD, 0.4 * fk); if (this.gold > 0) glow(ctx, x, y - 70 + Math.sin(t * 5) * 4, 16, GOLD, 0.7); }
    ctx.restore();
  }
}

// ───────────────────────── 거울 분신 (twinReflect) ─────────────────────────
/** 분신: 세 번 맞으면 깨진다 (보스 피해 없음). 공격은 보스가 이 분신의 자리에서 낸다 */
class NarkTwin extends Entity {
  constructor(boss, x, bottom, facing) {
    super(x - 55, bottom - 250, 110, 250);
    this.kind = 'prop'; this.z = 4; this.boss = boss; this.world = boss.world;
    this.facing = facing; this.hits = 3; this.flashT = 0; this.fadeT = -1; this.inT = 0;
    this.stats = { def: 10, res: 10 };
    this.def = { id: 'nark_twin', name: '거울 분신', material: 'ice' };
    this.pose = { ...boss.pose }; this.poseT = { ...POSE_DEF };
    this.legs = new SpiderLegs();
  }
  get invuln() { return this.fadeT >= 0 || !!this.boss.dead || this.boss.dying > 0; }
  hurtbox() { return { x: this.x + 18, y: this.y - 24, w: this.w - 36, h: this.h + 14 }; }
  takeHit(dmg, attack, world) {
    if (this.invuln) return false;
    let id = attack?.hitId;
    if (typeof id === 'string') id = id.replace(/:\d+$/, '');
    if (id != null) { const seen = (this._hitIds ??= new Set()); if (seen.has(id)) return false; seen.add(id); }
    this.hits--; this.flashT = 0.14;
    audio.sfx('ice', { pitch: 1.6, vol: 0.6 });
    world.fx.burst('shard', this.cx, this.cy - 30, 6, { color: GL, speed: 220 });
    if (this.hits <= 0) { this.shatter(world); return true; }
    return false;
  }
  shatter(world) {
    if (this.dead) return;
    this.dead = true;
    world.fx.burst('shard', this.cx, this.cy - 20, 30, { color: GL, speed: 360 });
    world.fx.burst('ice', this.cx, this.cy - 20, 24, { speed: 300 });
    world.fx.ring(this.cx, this.cy - 20, { color: GL_C, r0: 10, r1: 150, life: 0.45, width: 6 });
    audio.sfx('break_wall', { pitch: 1.5, vol: 0.8 });
  }
  dismiss() { if (this.fadeT < 0) this.fadeT = 0; }
  update(dt, world) {
    const b = this.boss;
    if (b.dead || b.dying > 0) { this.shatter(world); return; }
    if (heldByFreeze(world, b)) return;
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt; this.inT = Math.min(1, this.inT + dt * 3);
    if (this.flashT > 0) this.flashT -= dt;
    if (this.fadeT >= 0) { this.fadeT += dt; if (this.fadeT > 0.45) { this.dead = true; world.fx.burst('ice', this.cx, this.cy, 10, { speed: 160 }); return; } }
    this.pose.bob = Math.sin(this.t * 1.6 + 1.3) * 6;
    easePose(this.pose, this.poseT, dt);
    this.legs.update(dt, world, this.cx, this.bottom + this.pose.bob, b.A.floor, this.facing, this.pose, 0, this.t);
  }
  lights(L) { L.add(this.cx, this.cy - 40, 170, GL_C, 0.45); }
  draw(ctx, world) {
    const a = 0.62 * this.inT * (this.fadeT >= 0 ? clamp(1 - this.fadeT / 0.45, 0, 1) : 1);
    if (a <= 0.01) return;
    const o = { t: this.t, form: this.boss.formPhase, dmg: 0, twin: true, legs: this.legs, lookX: 0, lookY: 0.3, floor: this.boss.A.floor };
    ctx.save();
    ctx.globalAlpha *= a;
    drawNark(ctx, this.cx, this.bottom, this.facing, this.pose, o);
    // 유리 분신의 옅은 빛 (흰 실루엣을 얇게 더해 유령처럼)
    R.fl = true;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.2;
    try { drawNark(ctx, this.cx, this.bottom, this.facing, this.pose, { ...o, legs: null }); } finally { R.fl = false; }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
    if (this.flashT > 0) {
      R.fl = true;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.7;
      try { drawNark(ctx, this.cx, this.bottom, this.facing, this.pose, o); } finally { R.fl = false; }
    }
    ctx.restore();
  }
}

// ───────────────────────── 보스 ─────────────────────────
const C_LOW = 0.4, W_LOW = 0.45, C_HIGH = C_LOW + W_LOW + 0.18, W_HIGH = 0.35, C_OVER = C_HIGH + W_HIGH + 0.18, W_OVER = 0.5, C_END = C_OVER + W_OVER + 0.3;

export class Narkissa extends BossC {
  setup() {
    ensureArt(this.world);
    this.noGravity = true;
    this.facing = -1;
    this.pose = { ...POSE_DEF }; this.poseT = { ...POSE_DEF };
    this.legs = new SpiderLegs();
    this.homeB = this.A.floor - HOVER;
    this.bottom = this.homeB;
    this.vx = this.vy = 0;
    this.inMirror = null; this.exitMirror = null; this.dashing = false; this.stunned = false;
    this.twin = null; this.twinUses = 0; this.diveLeft = 0;
    this.eyeGlow = 0; this.maskCrack = 0; this.shattered = false; this.dashZ = null;
    this.mirrors = [];
    const A = this.A, F = A.floor, top = (A.top ?? 0) + 70;
    const spots = [[A.x0 + 60, Math.max(top, F - 300)], [A.x0 + 60, F - 120], [A.x1 - 60, Math.max(top, F - 300)], [A.x1 - 60, F - 120]];
    spots.forEach(([x, y], i) => { this.mirrors.push(this.world.add(new NarkMirror(this, i, x, y))); });
  }
  // ── 판정 ──
  hitParts() {
    if (this.inMirror || this.invuln) return [];
    const cx = this.cx, b = this.bottom + this.pose.bob;
    if (this.dashing) return [{ x: cx - 125, y: this.cy - 45, w: 250, h: 90, defMul: 1.2 }];
    const f2 = this.formPhase >= 2;
    return [
      { x: cx - 20, y: b + (f2 ? FACE2_C : MASK_C) - 25, w: 40, h: 50, defMul: this.stunned ? 0.5 : f2 ? 0.6 : 1.0, face: true },
      { x: cx - 40, y: b - 170, w: 80, h: 180, defMul: 1.4 },
      { x: cx - 78, y: b - 206, w: 40, h: 120, defMul: 1.2 },
      { x: cx + 38, y: b - 206, w: 40, h: 120, defMul: 1.2 },
    ];
  }
  contactParts() {
    if (this.inMirror || this.dashing || this.stunned) return [];
    const b = this.bottom + this.pose.bob;
    return [{ x: this.cx - 34, y: b - 210, w: 68, h: 200 }];
  }
  /** 얼굴(눈) 월드 좌표 */
  facePos() { return { x: this.cx + this.facing * 2, y: this.bottom + this.pose.bob + (this.formPhase >= 2 ? FACE2_C : MASK_C) }; }
  /** 앞쪽 손 (손거울) 월드 좌표 */
  handPos() {
    const P = this.pose, a = P.fa1a, e = P.fa1e, b = a + e;
    const ex = 36 + Math.sin(a) * 66, ey = -198 + Math.cos(a) * 66;
    const wx = ex + Math.sin(b) * 70, wy = ey + Math.cos(b) * 70;
    return { x: this.cx + this.facing * (wx + 10), y: this.bottom + P.bob + wy - 30 };
  }
  aim(o) { Object.assign(this.poseT, POSE_DEF, o); }
  /** 목표 지점으로 (속도 상한) */
  moveTo(tx, tb, maxV = 320, k = 3) {
    this.vx = clamp((tx - this.cx) * k, -maxV, maxV);
    this.vy = clamp((tb - this.bottom) * k, -maxV, maxV);
  }
  place(x, b) { this.x = x - this.w / 2; this.y = b - this.h; this.vx = this.vy = 0; }
  // ── 매 프레임 ──
  animTick(dt, world) {
    const P = this.pose;
    P.bob = this.stunned || this.dashing || this.inMirror ? 0 : Math.sin(this.t * 1.6) * 6;
    easePose(P, this.poseT, dt);
    P.swing = clamp(-this.vx * this.facing / 900, -0.6, 0.6);
    if (this.eyeGlow > 0) this.eyeGlow = Math.max(0, this.eyeGlow - dt * 0.7);
    this.legs.update(dt, world, this.cx, this.bottom + P.bob, this.A.floor, this.facing, P, this.vx, this.t);
  }
  tickB(dt, world) {
    this.animTick(dt, world);
    if (this.twin?.dead) this.twin = null;
    const q = world.fx?.quality ?? 1;
    if (!this.inMirror && Math.random() < 0.18 * q) world.fx.emit('magic', this.cx + rand(-60, 60), this.bottom - rand(20, 260), { color: GL, speed: 20, size: 2 });
    if (this.formPhase >= 2 && Math.random() < 0.12 * q) world.fx.emit('ice', this.cx + rand(-40, 40), this.bottom - rand(160, 280), { speed: 40, vy: 30, grav: 200, size: 2 });
  }
  idleAnim(dt, world) { this.animTick(dt, world); }
  idleMove(dt, world, t) {
    const p = this.P, A = this.A;
    this.facePlayer();
    this.aim({ fa1e: 0.85 + Math.sin(this.t * 1.5) * 0.18, fa0a: 0.4 + Math.sin(this.t * 1.1) * 0.08, ba: 0.15 + Math.sin(this.t * 0.8) * 0.12 });
    if (!p) { this.moveTo(this.cx, this.homeB, 200, 2); return; }
    let side = Math.sign(this.cx - p.cx) || 1;
    let tx = p.cx + side * 330;
    if (tx < A.x0 + 150 || tx > A.x1 - 150) { side = -side; tx = p.cx + side * 330; }
    tx = clamp(tx, A.x0 + 150, A.x1 - 150);
    this.moveTo(tx, this.homeB, 190, 1.4);
  }
  onCancel(world) {
    this.inMirror = null; this.exitMirror = null; this.dashing = false; this.stunned = false; this.diveLeft = 0;
    if (this.dashZ) { this.dashZ.dead = true; this.dashZ = null; }
    for (const m of this.mirrors ?? []) { m.warnT = 0; m.gold = 0; }
    this.twin?.dismiss(); this.twin = null;
    this.aim({});
    this.pose.rot = 0; this.pose.scale = 1; this.pose.fade = 1;
  }
  onReset(world) {
    this.onCancel(world);
    for (const m of this.mirrors ?? []) m.reset();
    Object.assign(this.pose, POSE_DEF); Object.assign(this.poseT, POSE_DEF);
    this.eyeGlow = 0; this.maskCrack = 0; this.twinUses = 0; this.diveLeft = 0;
    this.place(clamp(this.cx, this.A.x0 + 150, this.A.x1 - 150), this.homeB);
    this.legs.reset();
  }
  // ── 등장 ──
  s_intro(dt, world, t) {
    this.facePlayer();
    this.aim({ fa0a: 2.3, fa0e: 0.5, fa1a: 2.5, fa1e: 0.5, ba: 1, spread: 0.6, scream: t > 0.3 && t < 1.1 ? 1 : 0 });
    this.moveTo(this.cx, this.homeB, 200, 3);
    if (this.at(0.3)) {
      audio.sfx('boss_roar', { pitch: 1.5, vol: 0.7 }); audio.sfx('ghost', { pitch: 0.6 });
      world.fx.ring(this.cx, this.bottom - 240, { color: GL, r0: 20, r1: 220, life: 0.6, width: 6 });
      this.eyeGlow = 1;
    }
    this.mirrors.forEach((m, i) => { if (this.at(0.35 + i * 0.12)) { m.flashT = 0.6; audio.sfx('ice', { pitch: 1.3 + i * 0.1, vol: 0.4 }); } });
    if (t > 1.3) this.done(0.8);
  }
  // ── 기절 (진짜 거울) ──
  s_stun(dt, world, t) {
    if (this.at(0.001) || !this.stunned) {
      this.stunned = true; this.harmless = true; this.invuln = false; this.inMirror = null; this.dashing = false;
      if (this.dashZ) { this.dashZ.dead = true; this.dashZ = null; }
      this.pose.rot = 0; this.pose.scale = 1; this.pose.fade = 1;
    }
    this.vx *= Math.pow(0.02, dt);
    this.moveTo(this.cx, this.A.floor - 4, 260, 3);
    this.aim({ droop: 1, tilt: 0.32 + Math.sin(this.t * 2) * 0.05, ba: -0.4, spread: -0.1 });
    if (this.every(0.25) && Math.random() < 0.8) {
      const fp = this.facePos();
      world.fx.emit('magic', fp.x + rand(-30, 30), fp.y - rand(0, 20), { color: GOLD, speed: 40, size: 3 });
    }
    if (t >= 2.0) { this.stunned = false; this.harmless = false; this.done(0.6); }
  }
  /** 진짜 거울을 맞았다: 거울 속이면 튕겨 나오고, 어디에 있든 2초 기절 */
  onRealMirror(m, world) {
    if (this.dying > 0 || this.dead || this._tr || this.state === 'stun') return;
    m.gold = 0; m.flashT = 0.5; m.crack = Math.max(m.crack, 0.3);
    const wasIn = !!this.inMirror;
    world.fx.burst('shard', m.mx, m.my, 18, { color: GOLD, speed: 300 });
    world.fx.ring(m.mx, m.my, { color: GOLD, r0: 10, r1: 120, life: 0.4, width: 6 });
    world.fx.text?.(m.mx, m.my - 70, '진짜 거울!', { color: GOLD, size: 24, life: 1.2, vy: -40 });
    audio.sfx('break_wall', { pitch: 1.4 }); audio.sfx('crit', { pitch: 0.8 });
    impact(world, { shake: 8, time: 0.3, stop: 0.06 });
    this.cancelPattern();
    if (wasIn) {
      this.place(clamp(m.mx + (m.mx < this.A.cx ? 90 : -90), this.A.x0 + 80, this.A.x1 - 80), Math.min(this.A.floor - 4, m.my + 125));
      this.facePlayer();
      world.fx.burst('ice', this.cx, this.cy, 24, { speed: 260 });
    }
    this.setState('stun');
  }

  // ═══════════════ 패턴 ═══════════════
  /** 거울 잠수: 가까운 거울로 스며들어 → 반대편 거울에서 가로로 돌진 (인페르노: 두 번 연속) */
  s_mirrorDive(dt, world, t) {
    const A = this.A, M = this.mirrors;
    if (this.at(0.001)) {
      if (!(this.diveLeft > 0)) this.diveLeft = this.inferno ? 2 : 1;
      let best = M[0], bd = Infinity;
      for (const m of M) { const d = Math.hypot(m.mx - this.cx, m.my - this.cy); if (d < bd) { bd = d; best = m; } }
      this.entry = best;
      const other = M.filter((m) => Math.sign(m.mx - A.cx) !== Math.sign(best.mx - A.cx));
      this.exitM = other[Math.floor(Math.random() * other.length)] ?? M[3];
      this.facing = Math.sign(best.mx - this.cx) || this.facing;
      audio.sfx('mist', { pitch: 1.5, vol: 0.7 });
    }
    const en = this.entry, ex = this.exitM;
    if (!en || !ex) { this.done(0.5); return; }
    if (t < 0.5) {
      this.moveTo(en.mx, en.my + 125, 900, 7);
      const k = t / 0.5;
      this.aim({ fa0a: 1.6, fa0e: 0.2, fa1a: 1.7, fa1e: 0.1, ba: 0.8, fold: 1, rot: this.facing * 0.5 * k });
      this.poseT.scale = 1 - 0.4 * k; this.poseT.fade = 1 - k;
      if (this.every(0.05)) world.fx.emit('magic', this.cx + rand(-40, 40), this.cy + rand(-80, 80), { color: GL, speed: 80, size: 3 });
      return;
    }
    if (this.at(0.5)) {
      this.place(en.mx, en.my + 125);
      this.inMirror = en; this.exitMirror = null; this.harmless = true;
      this.hidden = true;   // 거울 속: 그리지도(벡터·채색) 겨냥하지도 않는다 — 진짜 거울(소품)은 따로 맞는다
      en.gold = 2.5; en.flashT = 0.4;
      this.pose.fade = this.poseT.fade = 0;
      world.fx.burst('shard', en.mx, en.my, 14, { color: GL, speed: 200 });
      world.fx.ring(en.mx, en.my, { color: GL, r0: 60, r1: 8, life: 0.3, width: 4 });
      audio.sfx('ice', { pitch: 0.7 }); audio.sfx('magic', { pitch: 1.3, vol: 0.6 });
    }
    const dir = ex.mx < A.cx ? 1 : -1;
    const endX = dir > 0 ? A.x1 - 150 : A.x0 + 150;
    if (this.at(1.1)) {
      this.place(ex.mx, ex.my + 125);
      this.exitMirror = ex;
      ex.warnT = 0.7;
      this.facing = dir;
      audio.sfx('warning', { vol: 0.5, pitch: 1.2 });
      const my = ex.my, x0 = ex.mx;
      this.dashZ = this.zone({
        x: Math.min(x0, endX), y: my - 35, w: Math.abs(endX - x0), h: 70, warn: 0.7, life: 3.2, mv: 1.6, element: 'ice', kb: [dir * 520, -320], z: 7,
        line: { x0, y0: my, x1: x0 + dir * 10, y1: my, th: 70 },
        tick: (z) => {
          if (z.t < z.warn) return;
          if (!this.dashing || this.dying > 0) { z.dead = true; return; }
          const L = z.line; L.x0 = this.cx - dir * 130; L.x1 = this.cx + dir * 115; L.y0 = L.y1 = this.cy;
          z.x = Math.min(L.x0, L.x1) - 35; z.y = this.cy - 35; z.w = Math.abs(L.x1 - L.x0) + 70; z.h = 70;
        },
        paint: (ctx, z, w) => {
          if (!z.started) { warnRect(ctx, Math.min(x0, endX), my - 35, Math.abs(endX - x0), 70, z.k, GOLD, w.time); return; }
          if (R.fl) return;
          const L = z.line;
          glowE(ctx, (L.x0 + L.x1) / 2 - dir * 70, L.y0, 190, 40, GL_C, 0.55);
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(230,248,255,0.6)'; ctx.lineWidth = 3;
          ctx.beginPath();
          for (let i = -2; i <= 2; i++) { ctx.moveTo(L.x0 - dir * 60, L.y0 + i * 12); ctx.lineTo(L.x0 - dir * (180 + Math.abs(i) * 40), L.y0 + i * 14); }
          ctx.stroke();
        },
      });
    }
    if (t < 1.8) {
      if (t > 1.1) this.aim({ fa0a: 1.7, fa0e: 0.1, fa1a: 1.7, fa1e: 0.1, ba: 1, fold: 1, rot: dir * 1.3, fade: 0, scale: 0.6 });
      return;
    }
    if (this.at(1.8)) {
      this.inMirror = null; this.exitMirror = null; this.dashing = true; this.harmless = true; this.hidden = false;
      this.facing = dir;
      this.pose.fade = this.poseT.fade = 1; this.pose.scale = this.poseT.scale = 1; this.pose.rot = dir * 1.3;
      this.vx = dir * 900; this.vy = 0;
      world.fx.burst('shard', ex.mx, ex.my, 26, { color: GL, speed: 380, angle: dir > 0 ? 0 : PI, spread: 0.9 });
      world.fx.ring(ex.mx, ex.my, { color: GL_C, r0: 20, r1: 140, life: 0.35, width: 6 });
      audio.sfx('break_wall', { pitch: 1.5 }); audio.sfx('dash', { pitch: 0.7 });
      world.camera.shake(6, 0.25);
    }
    if (this.dashing) {
      this.aim({ fa0a: 1.7, fa0e: 0.1, fa1a: 1.7, fa1e: 0.1, ba: 1, fold: 1, rot: dir * 1.3 });
      this.vx = dir * 900; this.vy = 0;
      if (this.every(0.03)) {
        const gx = this.cx, gy = this.bottom, P = { ...this.pose }, tt = this.t, f = this.facing, fm = this.formPhase;
        world.fx.ghost((ctx, a) => { ctx.save(); ctx.globalAlpha = a * 0.3; drawNark(ctx, gx, gy, f, P, { t: tt, form: fm, dmg: 0, twin: true }); ctx.restore(); }, 0.2);
      }
      if ((this.cx - endX) * dir >= 0 || t > 5) {
        this.dashing = false; this.harmless = false; this.vx = dir * 120;
        if (this.dashZ) { this.dashZ.dead = true; this.dashZ = null; }
        world.fx.burst('ice', this.cx + dir * 80, this.cy, 14, { speed: 220 });
        this.aim({});
        if (this.diveLeft > 1) { this.diveLeft--; this.setState('mirrorDive'); return; }
        this.diveLeft = 0;
        this.done(1.0);
      }
    }
  }
  /** 반사 광선: 손거울 → 벽거울 → 반사되어 플레이어가 있던 자리로 (두 선분 모두 판정) */
  s_reflectBeam(dt, world, t) {
    const p = this.P, A = this.A;
    this.facePlayer();
    this.vx *= Math.pow(0.05, dt); this.vy *= Math.pow(0.05, dt);
    this.aim({ fa1a: 2.35, fa1e: 0.35, mirror: 1, fa0a: 0.9, fa0e: 1.2, ba: 0.5, tilt: -0.1 });
    if (this.at(0.001)) { telegraph(this, 1.2); audio.sfx('magic', { pitch: 0.8, vol: 0.6 }); }
    if (this.at(0.3)) {
      const px = p?.cx ?? A.cx;
      const side = this.mirrors.filter((m) => Math.sign(m.mx - A.cx) === (Math.sign(px - A.cx) || 1));
      const m = side[Math.floor(Math.random() * side.length)] ?? this.mirrors[0];
      const h = this.handPos();
      m.flashT = 1.4;
      strikeLine(this, h.x, h.y, m.mx, m.my, { th: 22, warn: 0.9, life: 0.5, mv: 1.5, color: GL, kb: [300, -300] });
      const ray = (tx, ty) => clipRay(m.mx, m.my, tx - m.mx, ty - m.my, A);
      const e0 = ray(px, p?.cy ?? A.floor - 60);
      strikeLine(this, m.mx, m.my, e0.x, e0.y, {
        th: 22, warn: 0.9, life: 0.5, mv: 1.5, color: GL_C, kb: [300, -300], sfx: null,
        track: (z, w) => { if (z.t > 0.6) return; const pl = w.player; if (!pl || pl.dead) return; const e = ray(pl.cx, pl.cy); z.line.x1 = e.x; z.line.y1 = e.y; },
      });
      this.beamMirror = m;
    }
    if (this.at(1.2)) {
      const m = this.beamMirror;
      if (m) { world.fx.burst('ice', m.mx, m.my, 12, { speed: 240 }); world.fx.ring(m.mx, m.my, { color: '#ffffff', r0: 10, r1: 90, life: 0.3, width: 5 }); }
      this.eyeGlow = 0.6;
    }
    if (t > 1.9) { this.beamMirror = null; this.done(1.0); }
  }
  /** 파편 비: 화면을 9칸으로 나눠 7기둥에 거울 조각이 쏟아진다 (빈 칸 둘, 하나는 플레이어 근처) */
  s_shardRain(dt, world, t) {
    const A = this.A, p = this.P;
    this.facePlayer();
    this.vx *= Math.pow(0.05, dt);
    this.aim({ fa0a: 2.75, fa0e: 0.25, fa1a: 2.75, fa1e: 0.25, ba: 1, spread: 0.4, scream: t < 0.9 ? 0.6 : 0, tilt: -0.15 });
    if (this.at(0.001)) {
      telegraph(this, 0.8);
      audio.sfx('ice', { pitch: 0.6 }); audio.sfx('magic', { pitch: 0.7, vol: 0.5 });
      const cam = world.camera;
      const vx0 = Math.max(A.x0 + 20, (cam?.x ?? A.x0) + 20), vx1 = Math.min(A.x1 - 20, (cam ? cam.x + cam.vw : A.x1) - 20);
      const n = 9, sw = (vx1 - vx0) / n;
      if (!(sw > 30)) { this.done(0.5); return; }
      const ps = clamp(Math.floor(((p?.cx ?? A.cx) - vx0) / sw), 0, n - 1);
      const g1 = clamp(ps + Math.floor(rand(-1, 2)), 0, n - 1);
      let g2 = g1;
      for (let k = 0; k < 20 && Math.abs(g2 - g1) < 2; k++) g2 = Math.floor(rand(0, n));
      for (let k = 0; k < n; k++) if (k !== g1 && k !== g2) this.shardColumn(world, vx0 + sw * (k + 0.5), sw * 0.86, k);
    }
    if (t > 2.2) this.done(1.0);
  }
  shardColumn(world, x, w, k) {
    const A = this.A, F = A.floor, top = A.top ?? 0;
    const st = { y: top - 30, landed: false };
    this.zone({
      x: x - w / 2, y: top, w, h: 70, warn: 0.8, life: 3, mv: 1.0, kb: [200, -320], z: 6,
      tick: (z, wd, dt) => {
        if (z.t < z.warn || st.landed) return;
        st.y += 700 * dt;
        z.y = st.y - 70; z.h = 70;
        if (st.y >= F) {
          st.landed = true;
          wd.fx.burst('shard', x, F - 6, 8, { color: GL, speed: 260 });
          if ((wd.fx.quality ?? 1) > 0.6) wd.fx.burst('ice', x, F - 6, 6, { speed: 200, angle: -PI / 2, spread: 1.1 });
          if (k % 2 === 0) audio.sfx('break_wall', { pitch: rand(1.5, 1.8), vol: 0.35 });
          for (const s of [-1, 1]) this.spikes(x + s * w * 0.22, 40, 1.2, 0.6, 0.6);
          z.dur = z.t - z.warn;
        }
      },
      paint: (ctx, z, wd) => {
        if (!z.started) {
          warnRect(ctx, x - w / 2, top, w, F - top, z.k * 0.8, GL, wd.time);
          for (let i = -1; i <= 1; i++) shardShape(ctx, x + i * w * 0.25 + Math.sin(wd.time * 30 + i) * 2 * z.k, top + 26, 16, 52, 0.55 + 0.45 * z.k);
          return;
        }
        if (st.landed) return;
        if (!R.fl) {
          glowE(ctx, x, st.y - 90, w * 0.45, 120, GL_C, 0.45);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(220,245,255,0.45)'; ctx.lineWidth = 2;
          ctx.beginPath(); for (let i = -1; i <= 1; i++) { const sx = x + i * w * 0.25; ctx.moveTo(sx, st.y - 60 - Math.abs(i) * 18); ctx.lineTo(sx, st.y - 190 - Math.abs(i) * 18); } ctx.stroke(); ctx.restore();
        }
        for (let i = -1; i <= 1; i++) shardShape(ctx, x + i * w * 0.25, st.y - 32 - Math.abs(i) * 18, 18, 64, 1);
      },
    });
  }
  /** 바닥 유리 가시 지대 */
  spikes(x, w, life, mv, rehit) {
    const F = this.A.floor;
    return strikeRect(this, { x: x - w / 2, y: F - 24, w, h: 24 }, {
      warn: 0, life, mv, rehit, sfx: null, kb: [120, -380], element: 'ice',
      paint: (ctx, z) => {
        const a = clamp(Math.min(z.t / 0.08, (z.dur - (z.t - z.warn)) / 0.3), 0, 1);
        if (a <= 0) return;
        const n = Math.max(2, Math.round(w / 16));
        ctx.globalAlpha *= a;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const sx = x - w / 2 + (i + 0.5) * (w / n), h = 16 + h01(i + x) * 12;
          ctx.moveTo(sx - 5, F); ctx.lineTo(sx + (h01(i * 3 + x) - 0.5) * 6, F - h); ctx.lineTo(sx + 5, F); ctx.closePath();
        }
        ctx.save(); ctx.translate(0, F);   // 경로는 월드 좌표 그대로, 그라디언트만 바닥 기준 (캐시 키 하나)
        ctx.fillStyle = R.fl ? '#fff' : LG(ctx, 'nk_spk', 0, -28, 0, 0, [0, '#ffffff', 0.5, GL_C, 1, '#3a4a80']); ctx.fill();
        ctx.restore();
        if (!R.fl) { ctx.strokeStyle = '#0a0c18'; ctx.lineWidth = 1; ctx.stroke(); }
        if (!R.fl) glowE(ctx, x, F - 6, w * 0.7, 10, GL_C, 0.35 * a);
      },
    });
  }
  /** 팔 연격: 다가와 낮게 → 높게 → 머리 위 내려치기 (분신도 같은 동작) */
  s_armCombo(dt, world, t) { this.comboTick(this, dt, world, t, false); if (t > C_END) this.done(1.1); }
  /** 거울 분신: 반대편에 분신이 나타나 함께 팔 연격. 분신은 세 번 맞으면 깨진다 (두 번에 한 번 '비친 자' 소환) */
  s_twinReflect(dt, world, t) {
    const A = this.A, p = this.P;
    if (this.at(0.001)) {
      this.twinUses++;
      const px = p?.cx ?? A.cx;
      const side = Math.sign(this.cx - px) || 1;
      const tx = clamp(px - side * 280, A.x0 + 100, A.x1 - 100);
      this.twin?.dismiss();
      this.twin = this.world.add(new NarkTwin(this, tx, this.A.floor - HOVER, side));
      world.fx.burst('shard', tx, this.A.floor - 140, 20, { color: GL, speed: 260 });
      world.fx.ring(tx, this.A.floor - 140, { color: GL_C, r0: 20, r1: 160, life: 0.5, width: 6 });
      audio.sfx('ice', { pitch: 0.8 }); audio.sfx('magic', { pitch: 1.2, vol: 0.6 });
      if (this.twinUses % 2 === 0) spawnMinion(this, ['reflection'], clamp(px + side * 200, A.x0 + 60, A.x1 - 60), this.A.floor, { max: 1, facing: -side });
    }
    this.comboTick(this, dt, world, t, false);
    const tw = this.twin;
    if (tw && !tw.dead) this.comboTick(tw, dt, world, t, true);
    if (t > C_END) { this.twin?.dismiss(); this.twin = null; this.done(1.1); }
  }
  /** 연격 한 사람분 (actor = 보스 또는 분신) */
  comboTick(actor, dt, world, t, twin) {
    const A = this.A, F = A.floor, p = this.P;
    const px = p?.cx ?? A.cx;
    const T = actor.poseT, f = actor.facing;
    const move = (tx, tb, maxV, k) => {
      if (actor === this) { this.moveTo(tx, tb, maxV, k); return; }
      actor.x += clamp((tx - actor.cx) * k, -maxV, maxV) * dt;
      actor.y += clamp((tb - actor.bottom) * k, -maxV, maxV) * dt;
    };
    const set = (o) => Object.assign(T, POSE_DEF, o);
    if (t < C_LOW) {
      const side = Math.sign(actor.cx - px) || (twin ? -1 : 1);
      actor.facing = -side;
      move(clamp(px + side * 150, A.x0 + 80, A.x1 - 80), F - 12, 520, 6);
      set({ fa1a: 2.6, fa1e: 0.6, fa0a: 1.2, fa0e: 0.8, ba: 0.6, low: 0.3 });
      return;
    }
    move(actor.cx, F - 12, 200, 4);
    if (actor === this) this.vx *= Math.pow(0.02, dt);
    const cx = actor.cx;
    const front = (w) => (f > 0 ? cx + 5 : cx - 5 - w);
    if (this.at(C_LOW)) {
      strikeRect(this, { x: front(260), y: F - 50, w: 260, h: 50 }, { warn: W_LOW, life: 0.18, mv: 1.2, color: GL_C, kb: [f * 360, -260], paint: slashPaint(f, 'low', F - 25) });
    }
    if (this.at(C_HIGH)) {
      strikeRect(this, { x: front(260), y: F - 160, w: 260, h: 70 }, { warn: W_HIGH, life: 0.18, mv: 1.2, color: GL_C, kb: [f * 360, -300], paint: slashPaint(f, 'high', F - 125) });
    }
    if (this.at(C_OVER)) {
      const ox = clamp(px, A.x0 + 60, A.x1 - 60);
      strikeRect(this, { x: ox - 60, y: F - 300, w: 120, h: 300 }, { warn: W_OVER, life: 0.22, mv: 1.5, color: GL, kb: [f * 200, -200], shake: 7, paint: slashPaint(f, 'over', F - 150) });
    }
    if (t < C_HIGH) set({ low: 1, ba: 0.9, fa1a: t < C_LOW + W_LOW ? 2.6 : 1.1, fa1e: t < C_LOW + W_LOW ? 0.6 : 0.2, fa0a: 0.8, tilt: 0.1 });
    else if (t < C_OVER) set({ high: 1, ba: 0.9, fa0a: t < C_HIGH + W_HIGH ? 2.2 : 1.5, fa0e: 0.1, fa1a: 1.5, fa1e: 0.1 });
    else if (t < C_OVER + W_OVER) set({ fa0a: 2.95, fa0e: 0.1, fa1a: 2.95, fa1e: 0.1, ba: 1, tilt: -0.2, scream: 0.4 });
    else set({ fa0a: 1.2, fa0e: 0.2, fa1a: 1.2, fa1e: 0.2, ba: 0.5, tilt: 0.25 });
  }
  /** 만화경: 거울 칼날 세 고리(8개씩)가 나선으로 퍼진다 + 화면 만화경 (1.5초, 시각 효과) */
  s_kaleido(dt, world, t) {
    this.facePlayer();
    this.moveTo(this.cx, this.homeB - 40, 160, 2);
    this.aim({ fa0a: 2.1, fa0e: 0.2, fa1a: 2.1, fa1e: 0.2, ba: 1, spread: 1, scream: t > 0.4 && t < 1.0 ? 0.5 : 0, jaw: 0.6 });
    if (this.at(0.001)) { telegraph(this, 0.5); audio.sfx('magic', { pitch: 0.7 }); world.fx.ring(this.cx, this.bottom - 150, { color: GL_V, r0: 180, r1: 20, life: 0.5, width: 4 }); }
    if (this.at(0.5)) {
      const cx0 = this.cx, cy0 = this.bottom - 150, base = rand(0, TAU);
      const T0 = [0, 0.35, 0.7], DIRS = [1, -1, 1], RING = 3, PER = 8;
      const shardAt = (z, ring, j) => {
        const u = (z.t - T0[ring]) / 3;
        if (u < 0 || u > 1) return null;
        const r = 140 + 280 * u, a = base + ring * 0.39 + j * (TAU / PER) + DIRS[ring] * u * 3.2;
        return { x: cx0 + Math.cos(a) * r, y: cy0 + Math.sin(a) * r * 0.8, a };
      };
      this.zone({
        x: cx0 - 440, y: cy0 - 360, w: 880, h: 720, warn: 0, life: 3.75, mv: 0.9, element: 'ice', rehit: 0.9, kb: [220, -260], z: 7,
        rects: (z) => {
          const pl = z.world.player, out = [];
          if (!pl || pl.dead) return out;
          for (let ring = 0; ring < RING; ring++) for (let j = 0; j < PER; j++) {
            const s = shardAt(z, ring, j);
            if (s && Math.abs(s.x - pl.cx) < 60 && Math.abs(s.y - pl.cy) < 70) out.push({ x: s.x - 12, y: s.y - 12, w: 24, h: 24 });
          }
          return out;
        },
        paint: (ctx, z) => {
          for (let ring = 0; ring < RING; ring++) for (let j = 0; j < PER; j++) {
            const s = shardAt(z, ring, j);
            if (!s) continue;
            if (!R.fl) glow(ctx, s.x, s.y, 20, ring === 1 ? GL_V : GL_C, 0.5);
            put(ctx, ART?.orbit, s.x, s.y, s.a + PI / 2 + z.t * 6, 1.1);
          }
        },
      });
      audio.sfx('ice', { pitch: 1.2 }); audio.sfx('magic', { pitch: 1.5, vol: 0.6 });
      this.kaleidoOverlay(world);
    }
    if (t > 1.6) this.done(1.2);
  }
  kaleidoOverlay(world) {
    const S = ART?.kaleido?.c;
    if (!S || !world.addOverlay) return;
    const set = world.game?.settings ?? {};
    const still = !!set.reduceMotion, fa = clamp(set.flashFx ?? 1, 0, 1);
    if (fa <= 0) return;
    world.addOverlay({
      owner: this, life: 1.5,
      draw(ctx, vw, vh) {
        const k = clamp(Math.min(this.t / 0.25, (1.5 - this.t) / 0.4), 0, 1) * 0.15 * fa;
        if (k <= 0.004) return;
        const s = Math.max(vw, vh) * 1.25;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k;
        ctx.translate(vw / 2, vh / 2);
        for (let i = 0; i < 6; i++) {
          ctx.save(); ctx.rotate(i * (PI / 3) + (still ? 0 : this.t * 0.5));
          ctx.drawImage(S, -s / 2 + s * 0.18, -s / 2, s, s);
          ctx.restore();
        }
      },
    });
  }
  /** 천 개의 눈: 얼굴에서 플레이어가 있던 자리로 광선 8개 (인페르노 12), 0.18초 간격 */
  s_thousandEyes(dt, world, t) {
    this.facePlayer();
    this.vx *= Math.pow(0.05, dt);
    const n = this.inferno ? 12 : 8;
    this.aim({ tilt: -0.12 + Math.sin(t * 9) * 0.03, jaw: 0.9, ba: 0.7, spread: 0.5, fa0a: 1.4, fa1a: 1.4, fa0e: 0.6, fa1e: 0.6 });
    if (this.at(0.001)) { this.fired = 0; this.eyeGlow = 1; audio.sfx('ghost', { pitch: 1.4, vol: 0.6 }); telegraph(this, 0.8); }
    this.eyeGlow = Math.max(this.eyeGlow, 0.8);
    while (this.fired < n && t >= 0.3 + this.fired * 0.18) {
      const i = this.fired++;
      const fp = this.facePos(), p = this.P;
      const list = this.formPhase >= 2 ? EYES2 : EYES1;
      const e = list[i % list.length];
      const sc = this.formPhase >= 2 ? HEAD_S2 : HEAD_S, cy0 = this.formPhase >= 2 ? -50 : -33;
      const ox = fp.x + this.facing * e[0] * sc, oy = fp.y + (e[1] - cy0) * sc;
      const tx = p?.cx ?? this.A.cx, ty = p?.cy ?? this.A.floor - 40;
      const end = clipRay(ox, oy, tx - ox, ty - oy, this.A);
      strikeLine(this, ox, oy, end.x, end.y, { th: 14, warn: 0.5, life: 0.22, mv: 1.0, color: EYE_C, kb: [240, -260], sfx: i % 2 ? null : 'magic', pitch: 1.4 });
    }
    if (t > 0.3 + n * 0.18 + 0.8) this.done(1.0);
  }
  /** 거울 낙하: 천장에서 거울 넷이 떨어진다 (경기장 4등분 자리) → 유리 가시 지대 3초 */
  s_mirrorFall(dt, world, t) {
    const A = this.A;
    this.facePlayer();
    this.vx *= Math.pow(0.05, dt);
    this.aim({ fa0a: 3.0, fa0e: 0.05, fa1a: 3.0, fa1e: 0.05, ba: 1, tilt: -0.28, scream: t < 0.6 ? 0.5 : 0, jaw: 0.8 });
    if (this.at(0.001)) { telegraph(this, 1.3); audio.sfx('boss_roar', { pitch: 1.6, vol: 0.5 }); }
    if (this.at(0.4)) for (let k = 0; k < 4; k++) this.fallingMirror(world, A.x0 + A.w * (k + 0.5) / 4, k);
    if (t > 1.9) this.done(1.0);
  }
  fallingMirror(world, x, k) {
    const A = this.A, F = A.floor, top = (A.top ?? 0) + 10;
    const st = { y: top + 50 };
    this.zone({
      x: x - 60, y: F - 40, w: 120, h: 40, warn: 0.9 + 0.22, life: 0.2, mv: 1.4, kb: [300, -420], z: 6, sfx: null,
      tick: (z) => { if (!z.started) { const u = clamp((z.t - 0.9) / 0.22, 0, 1); st.y = lerp(top + 50, F - 64, u * u); } },
      onStart: (z, wd) => {
        wd.fx.burst('shard', x, F - 20, 22, { color: GL, speed: 340 });
        wd.fx.burst('ice', x, F - 20, 14, { speed: 260, angle: -PI / 2, spread: 1.3 });
        wd.fx.ring(x, F - 10, { color: GL_C, r0: 10, r1: 110, life: 0.35, width: 5 });
        audio.sfx('break_wall', { pitch: 1.2 + k * 0.1 });
        wd.camera.shake(7, 0.25);
        this.spikes(x, 120, 3, 0.5, 0.4);
      },
      paint: (ctx, z, wd) => {
        if (!z.started) {
          warnRect(ctx, x - 60, top, 120, F - top, Math.min(1, z.t / 0.9) * 0.8, GL, wd.time);
          if (!R.fl && z.t < 0.9) { ctx.strokeStyle = 'rgba(200,210,230,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, top - 20); ctx.lineTo(x, st.y - 64); ctx.stroke(); }
          put(ctx, ART?.frame, x + Math.sin(wd.time * 20) * (z.t < 0.9 ? 2 : 0), st.y, Math.sin(wd.time * 3 + k) * 0.06, 0.85);
          return;
        }
        if (R.fl) return;
        const f = 1 - z.a;
        glowE(ctx, x, F - 20, 90, 30, GL_C, 0.8 * f);
      },
    });
  }

  // ═══════════════ 페이즈 전환 ═══════════════
  /** 66%: 비명, 모든 거울 섬광 (1.5초 무적) */
  s_shatter1(dt, world, t) {
    this.transitionTick(dt, world, t);
    this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
    this.aim({ scream: 1, fa0a: 2.4, fa0e: 1.2, fa1a: 2.4, fa1e: 1.2, ba: 1.2, spread: 0.8, tilt: -0.3 + Math.sin(t * 40) * 0.03 });
    if (this.at(0.05)) {
      audio.sfx('boss_roar', { pitch: 1.5 }); audio.sfx('ghost', { pitch: 0.5 }); audio.sfx('break_wall', { pitch: 1.3, vol: 0.6 });
      for (const m of this.mirrors) m.flashT = 1.3;
      const fp = this.facePos();
      world.fx.ring(fp.x, fp.y, { color: GL, r0: 20, r1: 320, life: 0.7, width: 8 });
      world.fx.burst('shard', this.cx, this.cy, 30, { color: GL, speed: 360 });
      impact(world, { shake: 10, time: 0.5 });
      this.eyeGlow = 1;
    }
    if (this.every(0.3) && t < 1.3) { const fp = this.facePos(); world.fx.ring(fp.x, fp.y, { color: GL_C, r0: 30, r1: 200, life: 0.4, width: 3 }); }
  }
  /** 33%: 가면이 금 가다 부서진다 → form2 (눈이 가득한 얼굴·아가리). 대사 b_narkissa_shatter */
  s_shatter(dt, world, t) {
    this.transitionTick(dt, world, t);
    this.vx *= Math.pow(0.02, dt); this.vy *= Math.pow(0.02, dt);
    if (this.formPhase < 2) {
      this.maskCrack = clamp(t / 1.0, 0, 1);
      this.aim({ fa0a: 2.2, fa0e: 1.9, fa1a: 2.2, fa1e: 1.9, ba: 0.8, tilt: 0.2 + Math.sin(t * 30) * 0.04, spread: 0.3 });
      if (this.every(0.12)) { const fp = this.facePos(); world.fx.emit('shard', fp.x + rand(-14, 14), fp.y + rand(-20, 20), { color: '#eef0f6', speed: 120, size: 3 }); audio.sfx('ice', { pitch: 1.6 + t * 0.5, vol: 0.4 }); }
    } else {
      this.aim({ scream: 1, jaw: 1, ba: 1.2, spread: 1, fa0a: 2.6, fa0e: 0.4, fa1a: 2.6, fa1e: 0.4, tilt: -0.25 });
      this.eyeGlow = 1;
    }
  }
  applyPhase(n, world) {
    if (n === 1) { this.eyeGlow = 1; return; }
    if (n === 2) {
      this.maskCrack = 0;
      const fp = this.facePos();
      world.fx.burst('shard', fp.x, fp.y, 40, { color: '#eef0f6', speed: 420 });
      world.fx.burst('shard', fp.x, fp.y, 16, { color: '#15141e', speed: 300 });
      world.fx.ring(fp.x, fp.y, { color: '#ffffff', r0: 10, r1: 260, life: 0.6, width: 10 });
      world.fx.flash?.(fp.x, fp.y, { color: '#ffffff', size: 260, life: 0.25 });
      audio.sfx('break_wall', { pitch: 1.1 }); audio.sfx('boss_roar', { pitch: 1.2 });
      impact(world, { shake: 14, time: 0.6, flash: '#dff4ff', fa: 0.35 });
      this.eyeGlow = 1;
    }
  }

  // ═══════════════ 사망 ═══════════════
  onDeath(world) {
    this.dying = 2.8;
    this.clearJobs();
    this.inMirror = null; this.dashing = false; this.stunned = false;
    this.pose.rot = 0; this.pose.fade = 1; this.pose.scale = 1;
    this.twin?.shatter(world); this.twin = null;
    this.aim({ scream: 1, jaw: 1, fa0a: 2.3, fa0e: 1.0, fa1a: 2.5, fa1e: 0.8, ba: 1.3, spread: 0.6, tilt: -0.3 });
    audio.sfx('ice', { pitch: 0.5 }); audio.sfx('ghost', { pitch: 0.4 });
  }
  dyingTick(dt, world) {
    const el = 2.8 - this.dying;
    this.vx = this.vy = 0;
    if (!this.shattered) {
      this.maskCrack = clamp(el / 1.5, 0, 1);
      this.animTick(dt * 0.25, world);
      if (Math.random() < 0.5) world.fx.emit('shard', this.cx + rand(-70, 70), this.bottom - rand(20, 280), { color: GL, speed: 60, size: 3 });
      if (this.every(0.25)) audio.sfx('ice', { pitch: 1.2 + el * 0.4, vol: 0.4 });
    }
    if (el >= 1.55 && !this.shattered) {
      this.shattered = true;
      const cx = this.cx, cy = this.bottom - 150;
      world.fx.burst('shard', cx, cy, 80, { color: GL, speed: 460 });
      world.fx.burst('shard', cx, cy - 60, 30, { color: '#15141e', speed: 380 });
      world.fx.burst('ice', cx, cy, 40, { speed: 380 });
      world.fx.ring(cx, cy, { color: GL, r0: 20, r1: 380, life: 0.8, width: 12 });
      world.fx.flash?.(cx, cy, { color: '#eef8ff', size: 380, life: 0.3 });
      impact(world, { shake: 14, time: 0.6 });
      audio.sfx('break_wall', { pitch: 1.0 }); audio.sfx('break_wall', { pitch: 1.6 }); audio.sfx('ice', { pitch: 0.7 });
    }
    if (this.shattered && Math.random() < 0.3) world.fx.emit('holy', this.cx + rand(-100, 100), this.bottom - rand(0, 200), { color: GL, speed: 40 });
  }
  /** 사망 중에는 금이 번지는 동안 선명하게, 산산조각 난 뒤에는 그리지 않는다 */
  render(ctx, world) {
    if (this.dying > 0) { if (this.shattered) return; ctx.globalAlpha = 1; }
    super.render(ctx, world);
  }

  // ═══════════════ 조명 · 그리기 ═══════════════
  lightsB(L) {
    if (this.inMirror || this.shattered) return;
    const fp = this.facePos();
    L.add(this.cx, this.bottom - 150, 260, GL, 0.55);
    L.add(fp.x, fp.y, 120, this.formPhase >= 2 ? EYE_C : GL, 0.6 + this.eyeGlow * 0.3);
    L.add(this.cx, this.bottom + this.pose.bob + WAIST - 38, 70, GEM, 0.45);
  }
  paintBody(ctx) {
    if (this.inMirror && this.pose.fade < 0.02) return;
    const p = this.world.player, fp = this.facePos();
    const lx = p ? clamp((p.cx - fp.x) / 300, -1, 1) * this.facing : 0, ly = p ? clamp((p.cy - fp.y) / 300, -1, 1) : 0;
    drawNark(ctx, this.cx, this.bottom, this.facing, this.pose, {
      t: this.t, form: this.formPhase, dmg: 1 - this.hp / this.stats.maxHp, legs: this.legs, floor: this.A.floor,
      tear: !!(this.twin && !this.twin.dead), eyeGlow: this.eyeGlow, lookX: lx, lookY: ly, maskCrack: this.maskCrack,
    });
  }
  paintFront(ctx) {
    if (!this.stunned || R.fl) return;
    const fp = this.facePos();
    for (let i = 0; i < 4; i++) {
      const a = this.t * 4 + i * (TAU / 4);
      glow(ctx, fp.x + Math.cos(a) * 30, fp.y - 40 + Math.sin(a) * 8, 10, GOLD, 0.8, true);
    }
  }
}

// ───────────────────────── 기타 도우미 ─────────────────────────
/** (x0,y0) 에서 (dx,dy) 방향 반직선이 경기장 상자를 나가는 점 */
function clipRay(x0, y0, dx, dy, A) {
  const L = Math.hypot(dx, dy) || 1;
  dx /= L; dy /= L;
  let tMax = 3000;
  const x1 = A.x0 - 40, x2 = A.x1 + 40, y1 = (A.top ?? 0) - 40, y2 = A.floor + 10;
  if (dx > 1e-4) tMax = Math.min(tMax, (x2 - x0) / dx); else if (dx < -1e-4) tMax = Math.min(tMax, (x1 - x0) / dx);
  if (dy > 1e-4) tMax = Math.min(tMax, (y2 - y0) / dy); else if (dy < -1e-4) tMax = Math.min(tMax, (y1 - y0) / dy);
  tMax = Math.max(40, tMax);
  return { x: x0 + dx * tMax, y: y0 + dy * tMax };
}
/** 떨어지는 거울 조각 (가늘고 긴 마름모) */
function shardShape(ctx, x, y, w, h, a) {
  ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w * 0.1, y + h / 2); ctx.lineTo(x - w / 2, y + h * 0.1); ctx.closePath();
  if (R.fl) { ctx.fillStyle = '#fff'; ctx.fill(); return; }
  ctx.globalAlpha *= a;
  ctx.fillStyle = LG(ctx, 'nk_fall' + h, 0, -h / 2, 0, h / 2, [0, '#ffffff', 0.5, GL_C, 1, '#4a5a90']);
  ctx.save(); ctx.translate(0, y); ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#0a0c18'; ctx.lineWidth = 1; ctx.stroke();
  ctx.globalAlpha /= a || 1;
}
/** 팔 연격 판정의 그림: 예고(사선 경고) → 유리 칼날 궤적 */
function slashPaint(f, kind, y) {
  return (ctx, z, w) => {
    if (!z.started) { warnRect(ctx, z.x, z.y, z.w, z.h, z.k, GL_C, w.time); return; }
    if (R.fl) return;
    const k = 1 - z.a;
    ctx.globalCompositeOperation = 'lighter';
    if (kind === 'over') {
      const x = z.x + z.w / 2;
      glowE(ctx, x, z.y + z.h / 2, z.w * 0.6, z.h / 2, GL, 0.8 * k);
      ctx.fillStyle = rgba('#ffffff', 0.8 * k); ctx.fillRect(x - 4, z.y, 8, z.h);
      return;
    }
    const x0 = f > 0 ? z.x : z.x + z.w, x1 = f > 0 ? z.x + z.w : z.x;
    ctx.lineCap = 'round';
    for (const [lw, c, a] of [[z.h * 0.9, GL_C, 0.35], [z.h * 0.35, '#ffffff', 0.85]]) {
      ctx.strokeStyle = rgba(c, a * k); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y + (kind === 'low' ? -8 : 10)); ctx.quadraticCurveTo((x0 + x1) / 2, y + (kind === 'low' ? 10 : -14), x1, y); ctx.stroke();
    }
  };
}
