// 15장 보스: 몰록 — 용광로의 우상 (world2 §6.3, s15 '몰록의 제단'). owner: BOSS-P2-1
// BossC(c_common.js) 상속 — 패턴 이름은 계약 (P2_PATTERNS.b_moloch):
//   공격  hammer · tongs · pour · chimney · tide(P2+) · furnaceBeam(P2+) · souls(P3) · chains(P3)
//   전환  phase1 (60%, 1.4초: 포효·굴뚝 분출) · hornbreak (30%, 1.8초: 뿔이 부러지고 영혼이 새어 나온다)
// 약점: 배 속 화로 창살 (열려 있으면 방어 ×0.5, 닫혀 있으면 ×2.0) — pour · furnaceBeam · souls 때 열린다.
// 용암: gimmickOf('magma') (방 기믹 manual, 휴식 17행) — c_common setMagma 로 올리고 내린다 (보스 러시 경기장은 대역 용암).
//   tide: 13.5행(인페르노 12.5)까지 차오른 뒤 6초 유지, 그동안은 chimney · furnaceBeam 만 쓴다. P2/P3 에서는 약 14초마다 다시.
// 몸: 바닥에 발을 묻은 우상 — 중력 없이 경기장 오른쪽 60% 안에서 초당 60px 이하로 움직인다 (받침대 지형과 부딪치지 않게).
// 그림: 벡터 (2부 기준). 청동 몸통(화로 구멍·갈비뼈·리벳·녹청)·황소 머리·뿔·굴뚝·망치·집게·앞치마·영혼 얼굴·사슬 고리·용암 웅덩이는
// 보스 등장 때 한 번 굽고(모듈 캐시, 흰 실루엣 판은 피격 섬광용), 팔·창살·화로 불꽃·굴뚝 불기둥·사슬 흔들림·균열은 매 프레임 그린다.
// 피해 단계: 체력에 따라 쇳물 균열이 번지고, P2 에는 굴뚝 하나가 금 가 검은 연기를 뿜으며, P3 에는 뿔이 부러진 그루터기에서
// 쇳물이 흐르고 가슴이 갈라져 불똥이 떨어진다.
// 채색 아트(ART-BOSS-6)가 읽을 상태: this.pose(자세) · grateK(창살 열림 0~1) · turnK(돌아서기 −1~1) · formPhase(2 = 뿔 없음) ·
//   tongs(날아간 집게 위치 또는 null) · exploded(사망: 화로 폭발) · sink(가라앉은 깊이).
import { BossC, telegraph, warnText, strikeRect, strikeCircle, strikeFloor, groundWave, pullField, setMagma } from './c_common.js';
import { PI, OUT, R, LG, glow, glowE, glowSprite, warnRect, warnFloor, warnCircle, warnLine, warnBang, impact } from './b_common.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, rgba, approach } from '../../core/math.js';

// ───────────────────────── 색 ─────────────────────────
const FIRE = '#ff7a2a', HOT = '#ffd070', LAVA = '#ff5a1a', SOUL = '#ffe8a0', DARKF = '#b060ff';
const h01 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

// ───────────────────────── 몸 치수 (앵커 = 발밑 가운데 = 바닥, 위 = −y, 오른쪽 = 바라보는 쪽) ─────────────────────────
const SHOULDER = [100, -222], L_UP = 82, L_FORE = 78, HAFT = 150;
const FURN = [0, -142, 46, 54];             // 화로 구멍 (x, y, rx, ry)
const GRATE_C = -142;                        // 창살 가운데 높이
const HEAD_Y = -244, HEAD_S = 1.3, HEAD_C = HEAD_Y - 50 * HEAD_S;   // 목 (머리 기준점) · 머리 배율 · 머리 가운데

// ───────────────────────── 굽기 ─────────────────────────
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
function mk(K, w, h, ox, oy, fn, flash = true) {
  const c = canvasOf(Math.ceil(w * K), Math.ceil(h * K));
  if (!c) return null;
  const g = c.getContext('2d');
  g.scale(K, K); g.translate(ox, oy);
  g.lineJoin = 'round'; g.lineCap = 'round';
  fn(g);
  return { c, f: flash ? whiteOf(c) : c, w, h, ox, oy };
}
function put(ctx, S, x, y, rot = 0, sx = 1, sy = sx) {
  if (!S) return;
  const img = R.fl ? S.f : S.c;
  if (!rot && sx === 1 && sy === 1) { ctx.drawImage(img, x - S.ox, y - S.oy, S.w, S.h); return; }
  ctx.save();
  ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
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
  try { ART = bakeArt(K); } catch (e) { console.error('[moloch] 굽기 실패', e); }
  return ART;
}
function linG(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
function radG(g, x0, y0, r0, x1, y1, r1, stops) { const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
/** 두들겨 편 청동 질감: 현재 경로 안에 얼룩 · 녹청 · 긁힘 (bx,by,bw,bh = 대략의 범위) */
function bronzeTexture(g, bx, by, bw, bh, seed, n = 60) {
  g.save(); g.clip();
  for (let i = 0; i < n; i++) {
    const x = bx + h01(seed + i * 1.7) * bw, y = by + h01(seed + i * 3.1) * bh, r = 1.5 + h01(seed + i * 5.3) * 4;
    g.fillStyle = h01(seed + i) < 0.5 ? 'rgba(20,10,2,0.22)' : 'rgba(255,220,150,0.13)';
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, h01(i) * 3, 0, TAU); g.fill();
  }
  for (let i = 0; i < 6; i++) {
    const x = bx + h01(seed * 2 + i * 7.7) * bw, y = by + h01(seed * 3 + i * 2.3) * bh;
    g.fillStyle = radG(g, x, y, 0, x, y, 16, [0, 'rgba(70,150,120,0.34)', 1, 'rgba(70,150,120,0)']);
    g.beginPath(); g.arc(x, y, 16, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(30,14,4,0.35)'; g.lineWidth = 0.7;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const x = bx + h01(seed + i * 9.1) * bw, y = by + h01(seed + i * 4.4) * bh; g.moveTo(x, y); g.lineTo(x + (h01(i + seed) - 0.5) * 18, y + (h01(i * 2 + seed) - 0.5) * 10); }
  g.stroke();
  g.restore();
}
function rivet(g, x, y, r = 2.6) {
  g.fillStyle = radG(g, x - r * 0.35, y - r * 0.35, 0, x, y, r, [0, '#fff0c8', 0.35, '#b08a50', 1, '#2a1606']);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
const BRONZE = (g, x0, y0, x1, y1) => linG(g, x0, y0, x1, y1, [0, '#2a1808', 0.18, '#6a4520', 0.42, '#c89a58', 0.55, '#8a6030', 0.8, '#4a2c10', 1, '#1e1006']);

function drawTorso(g) {
  // 몸통 실루엣 (앵커 좌표 그대로: 허리 −66 ~ 목 −262)
  const P = [[-66, -64], [-84, -110], [-92, -150], [-104, -188], [-126, -206], [-124, -226], [-108, -244], [-78, -250], [-42, -258], [-30, -266]];
  g.beginPath();
  g.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]);
  for (let i = P.length - 1; i >= 0; i--) g.lineTo(-P[i][0], P[i][1]);
  g.closePath();
  g.fillStyle = BRONZE(g, -126, -150, 126, -150); g.fill();
  bronzeTexture(g, -126, -266, 252, 206, 3, 90);
  g.beginPath();
  g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); for (let i = P.length - 1; i >= 0; i--) g.lineTo(-P[i][0], P[i][1]); g.closePath();
  g.strokeStyle = '#140802'; g.lineWidth = 3; g.stroke();
  // 어깨 근육 돔 + 가시
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(s * 104, -214, 28, 26, s * 0.3, 0, TAU);
    g.fillStyle = radG(g, s * 96, -226, 2, s * 104, -214, 30, [0, '#ffd89a', 0.25, '#b0823e', 0.7, '#5a3814', 1, '#241206']); g.fill();
    g.strokeStyle = '#140802'; g.lineWidth = 2; g.stroke();
    for (let i = 0; i < 4; i++) {
      const a = -PI / 2 + s * (0.2 + i * 0.38), bx = s * 104 + Math.cos(a) * 22, by = -214 + Math.sin(a) * 22, L = 16 - i * 2;
      g.beginPath(); g.moveTo(bx - Math.sin(a) * 5, by + Math.cos(a) * 5); g.lineTo(bx + Math.cos(a) * L, by + Math.sin(a) * L); g.lineTo(bx + Math.sin(a) * 5, by - Math.cos(a) * 5); g.closePath();
      g.fillStyle = linG(g, bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L, [0, '#6a4520', 1, '#ffe0a0']); g.fill();
      g.strokeStyle = '#140802'; g.lineWidth = 1.2; g.stroke();
    }
  }
  // 가슴판
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 6, -250); g.bezierCurveTo(s * 50, -254, s * 88, -236, s * 86, -206); g.bezierCurveTo(s * 80, -186, s * 44, -190, s * 6, -200); g.closePath();
    g.fillStyle = linG(g, s * 6, -254, s * 60, -190, [0, '#e0b070', 0.45, '#9a6a30', 1, '#3a2008']); g.fill();
    bronzeTexture(g, s > 0 ? 6 : -88, -254, 82, 66, 11 + s, 24);
    g.beginPath(); g.moveTo(s * 6, -250); g.bezierCurveTo(s * 50, -254, s * 88, -236, s * 86, -206); g.bezierCurveTo(s * 80, -186, s * 44, -190, s * 6, -200); g.closePath();
    g.strokeStyle = '#1a0a02'; g.lineWidth = 2; g.stroke();
    // 새겨진 룬
    g.strokeStyle = 'rgba(255,150,60,0.42)'; g.lineWidth = 1;
    g.beginPath();
    const rx = s * 46, ry = -224;
    g.arc(rx, ry, 9, 0, TAU); g.moveTo(rx - 6, ry); g.lineTo(rx + 6, ry); g.moveTo(rx, ry - 12); g.lineTo(rx, ry + 12); g.moveTo(rx - 4, ry - 5); g.lineTo(rx + 4, ry + 5);
    g.stroke();
  }
  // 옆구리 근육 결
  g.strokeStyle = 'rgba(20,8,2,0.5)'; g.lineWidth = 1.6;
  g.beginPath();
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.moveTo(s * (62 + i * 6), -176 + i * 20); g.quadraticCurveTo(s * (80 + i * 3), -168 + i * 20, s * (86 + i * 2), -150 + i * 18); }
  g.stroke();
  // 화로 구멍 둘레 갈비뼈 (구멍 파기 전에 그린다)
  const [fx, fy, frx, fry] = FURN;
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a0 = -PI / 2 + s * (0.35 + i * 0.5), a1 = a0 + s * 0.42;
    g.strokeStyle = '#1a0a02'; g.lineWidth = 9;
    g.beginPath(); g.ellipse(fx, fy, frx + 14, fry + 12, 0, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
    g.strokeStyle = linG(g, fx - 60, fy, fx + 60, fy, [0, '#e8d0a8', 0.5, '#fff0d0', 1, '#c0a070']); g.lineWidth = 5.5;
    g.beginPath(); g.ellipse(fx, fy, frx + 14, fry + 12, 0, Math.min(a0, a1), Math.max(a0, a1)); g.stroke();
  }
  // 무쇠 테 + 리벳
  g.beginPath(); g.ellipse(fx, fy, frx + 6, fry + 6, 0, 0, TAU);
  g.strokeStyle = '#140a04'; g.lineWidth = 14; g.stroke();
  g.strokeStyle = '#4a3a30'; g.lineWidth = 9; g.stroke();
  g.strokeStyle = 'rgba(255,200,140,0.35)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(fx, fy, frx + 8, fry + 8, 0, PI * 1.1, PI * 1.8); g.stroke();
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; rivet(g, fx + Math.cos(a) * (frx + 6), fy + Math.sin(a) * (fry + 6), 2.8); }
  // 허리 무쇠 띠 + 버클
  g.fillStyle = linG(g, 0, -80, 0, -62, [0, '#6a5a50', 0.4, '#2a201a', 1, '#0e0806']);
  g.beginPath(); g.moveTo(-72, -80); g.lineTo(72, -80); g.lineTo(68, -62); g.lineTo(-68, -62); g.closePath(); g.fill();
  g.strokeStyle = '#0a0402'; g.lineWidth = 2; g.stroke();
  for (let i = -3; i <= 3; i++) rivet(g, i * 20, -71, 2.4);
  g.fillStyle = linG(g, -12, -84, 12, -58, [0, '#ffe0a0', 0.5, '#8a6030', 1, '#3a2008']);
  g.beginPath(); g.moveTo(-13, -84); g.lineTo(13, -84); g.lineTo(10, -58); g.lineTo(-10, -58); g.closePath(); g.fill();
  g.strokeStyle = '#140802'; g.lineWidth = 1.6; g.stroke();
  // 구멍 파기
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.ellipse(fx, fy, frx, fry, 0, 0, TAU); g.fill();
  g.globalCompositeOperation = 'source-over';
  // 림라이트 (왼쪽 차가운 빛 · 오른쪽 용광로 반사)
  g.strokeStyle = 'rgba(168,190,255,0.55)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-66, -64); g.lineTo(-84, -110); g.lineTo(-92, -150); g.lineTo(-104, -188); g.stroke();
  g.strokeStyle = 'rgba(255,150,60,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(66, -64); g.lineTo(84, -110); g.lineTo(92, -150); g.stroke();
}
function drawHead(g) {
  // 목 기준 (0,0), 위로 −104
  // 귀
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 30, -64); g.quadraticCurveTo(s * 62, -80, s * 70, -60); g.quadraticCurveTo(s * 56, -50, s * 30, -52); g.closePath();
    g.fillStyle = linG(g, s * 30, -70, s * 70, -56, [0, '#6a4520', 0.6, '#b08040', 1, '#3a2008']); g.fill();
    g.strokeStyle = '#140802'; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = 'rgba(80,20,8,0.7)'; g.beginPath(); g.ellipse(s * 50, -60, 11, 4, s * -0.2, 0, TAU); g.fill();
  }
  // 두개골 + 주둥이
  g.beginPath();
  g.moveTo(-34, -96); g.quadraticCurveTo(0, -106, 34, -96);
  g.bezierCurveTo(40, -76, 34, -52, 26, -32);
  g.bezierCurveTo(34, -20, 32, 0, 18, 8);
  g.quadraticCurveTo(0, 14, -18, 8);
  g.bezierCurveTo(-32, 0, -34, -20, -26, -32);
  g.bezierCurveTo(-34, -52, -40, -76, -34, -96);
  g.closePath();
  g.fillStyle = linG(g, -40, -60, 40, -60, [0, '#2a1606', 0.25, '#7a5024', 0.48, '#d8a860', 0.62, '#9a6a30', 1, '#2a1606']); g.fill();
  bronzeTexture(g, -40, -106, 80, 120, 21, 40);
  g.beginPath();
  g.moveTo(-34, -96); g.quadraticCurveTo(0, -106, 34, -96); g.bezierCurveTo(40, -76, 34, -52, 26, -32); g.bezierCurveTo(34, -20, 32, 0, 18, 8); g.quadraticCurveTo(0, 14, -18, 8); g.bezierCurveTo(-32, 0, -34, -20, -26, -32); g.bezierCurveTo(-34, -52, -40, -76, -34, -96); g.closePath();
  g.strokeStyle = '#140802'; g.lineWidth = 2.6; g.stroke();
  // 이마 털 뭉치 (거친 청동 갈기)
  g.strokeStyle = '#3a2008'; g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i < 11; i++) { const x = -30 + i * 6; g.moveTo(x, -98); g.quadraticCurveTo(x + (h01(i) - 0.5) * 8, -86, x + (h01(i + 3) - 0.5) * 10, -76 + h01(i * 2) * 8); }
  g.stroke();
  g.strokeStyle = 'rgba(255,220,150,0.55)'; g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 0; i < 11; i++) { const x = -29 + i * 6; g.moveTo(x, -97); g.quadraticCurveTo(x + (h01(i) - 0.5) * 8, -88, x + (h01(i + 3) - 0.5) * 8, -80); }
  g.stroke();
  // 성난 이마뼈 + 눈구멍
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 4, -60); g.quadraticCurveTo(s * 18, -70, s * 32, -62); g.lineTo(s * 30, -56); g.quadraticCurveTo(s * 18, -62, s * 6, -54); g.closePath();
    g.fillStyle = '#4a2c10'; g.fill(); g.strokeStyle = '#140802'; g.lineWidth = 1.4; g.stroke();
    g.beginPath(); g.moveTo(s * 8, -54); g.quadraticCurveTo(s * 18, -58, s * 28, -54); g.quadraticCurveTo(s * 20, -46, s * 9, -49); g.closePath();
    g.fillStyle = '#0a0402'; g.fill();
  }
  // 콧등 주름 · 콧구멍 · 코뚜레
  g.strokeStyle = 'rgba(20,8,2,0.6)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-10, -40); g.quadraticCurveTo(0, -36, 10, -40); g.moveTo(-12, -32); g.quadraticCurveTo(0, -28, 12, -32); g.stroke();
  g.beginPath(); g.ellipse(0, -10, 26, 18, 0, 0, TAU);
  g.fillStyle = linG(g, 0, -28, 0, 8, [0, '#b08040', 0.5, '#7a5024', 1, '#3a2008']); g.fill();
  g.strokeStyle = '#140802'; g.lineWidth = 2; g.stroke();
  for (const s of [-1, 1]) {
    g.beginPath(); g.ellipse(s * 11, -8, 6, 7.5, s * 0.3, 0, TAU); g.fillStyle = '#0a0302'; g.fill();
    g.fillStyle = 'rgba(255,90,20,0.55)'; g.beginPath(); g.ellipse(s * 11, -6, 3, 4, s * 0.3, 0, TAU); g.fill();
  }
  g.strokeStyle = '#0a0806'; g.lineWidth = 5; g.beginPath(); g.arc(0, 4, 10, 0.1, PI - 0.1); g.stroke();
  g.strokeStyle = '#8a8a90'; g.lineWidth = 3; g.beginPath(); g.arc(0, 4, 10, 0.1, PI - 0.1); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.beginPath(); g.arc(0, 4, 10, 0.5, 1.4); g.stroke();
  // 입 (살짝 벌어진 틈 + 이빨)
  g.fillStyle = '#1a0402'; g.beginPath(); g.moveTo(-16, 6); g.quadraticCurveTo(0, 14, 16, 6); g.lineTo(12, 10); g.quadraticCurveTo(0, 16, -12, 10); g.closePath(); g.fill();
  g.fillStyle = '#e8d8b0';
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 3.8 - 1.4, 7 + Math.abs(i) * -0.3); g.lineTo(i * 3.8 + 1.4, 7 + Math.abs(i) * -0.3); g.lineTo(i * 3.8, 10.5); g.closePath(); g.fill(); }
  // 금 · 림라이트
  g.strokeStyle = 'rgba(20,8,2,0.7)'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(20, -90); g.lineTo(14, -80); g.lineTo(18, -72); g.moveTo(-22, -40); g.lineTo(-16, -34); g.stroke();
  g.strokeStyle = 'rgba(168,190,255,0.5)'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-34, -94); g.bezierCurveTo(-40, -76, -34, -52, -26, -32); g.stroke();
}
function drawHorn(g) {
  // 기준점 = 뿔 뿌리 (0,0), 바깥(+x)으로 뻗었다가 위로 휜다
  g.beginPath();
  g.moveTo(-6, -16);
  g.bezierCurveTo(34, -24, 80, -20, 104, -44);
  g.quadraticCurveTo(116, -56, 120, -70);
  g.quadraticCurveTo(116, -48, 104, -32);
  g.bezierCurveTo(80, -2, 38, 10, -6, 14);
  g.closePath();
  g.fillStyle = linG(g, 0, -24, 0, 14, [0, '#fff0d0', 0.25, '#d8b890', 0.6, '#8a6a48', 1, '#3a2410']); g.fill();
  g.strokeStyle = '#140802'; g.lineWidth = 2.4; g.stroke();
  g.strokeStyle = 'rgba(60,30,10,0.55)'; g.lineWidth = 1.3;
  g.beginPath();
  for (let i = 1; i < 9; i++) {
    const k = i / 9, x = lerp(0, 106, k), y0 = lerp(-18, -50, k * k), y1 = lerp(14, -36, k * k);
    g.moveTo(x - 2, y0 + 2); g.quadraticCurveTo(x + 4, (y0 + y1) / 2, x - 2, y1 - 2);
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(4, -14); g.bezierCurveTo(36, -22, 78, -18, 100, -40); g.stroke();
  // 뿌리 쇠고리
  g.strokeStyle = '#1a1210'; g.lineWidth = 6; g.beginPath(); g.moveTo(6, -18); g.lineTo(6, 14); g.stroke();
  g.strokeStyle = '#6a5a50'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(6, -17); g.lineTo(6, 13); g.stroke();
}
function drawStump(g) {
  g.beginPath(); g.moveTo(-6, -16); g.bezierCurveTo(10, -20, 20, -22, 28, -30); g.lineTo(24, -18); g.lineTo(32, -12); g.lineTo(26, -4); g.lineTo(30, 6); g.bezierCurveTo(16, 10, 4, 12, -6, 14); g.closePath();
  g.fillStyle = linG(g, 0, -24, 0, 14, [0, '#fff0d0', 0.3, '#c8a880', 0.7, '#7a5a38', 1, '#3a2410']); g.fill();
  g.strokeStyle = '#140802'; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.moveTo(28, -30); g.lineTo(24, -18); g.lineTo(32, -12); g.lineTo(26, -4); g.lineTo(30, 6);
  g.strokeStyle = '#ffb040'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = '#fff4c0'; g.lineWidth = 1.2; g.stroke();
}
function drawChimney(g) {
  // 기준점 = 굴뚝 아래 가운데, 위로 −132
  g.beginPath(); g.moveTo(-17, 0); g.lineTo(-15, -118); g.lineTo(-23, -122); g.lineTo(-24, -132); g.lineTo(24, -132); g.lineTo(23, -122); g.lineTo(15, -118); g.lineTo(17, 0); g.closePath();
  g.fillStyle = linG(g, -24, 0, 24, 0, [0, '#120c0a', 0.3, '#4a3e38', 0.5, '#7a6a60', 0.7, '#2e2622', 1, '#0e0806']); g.fill();
  g.strokeStyle = '#080404'; g.lineWidth = 2.2; g.stroke();
  for (const y of [-12, -46, -80, -112]) {
    g.fillStyle = linG(g, -19, 0, 19, 0, [0, '#1a1210', 0.45, '#8a7a70', 1, '#1a1210']);
    g.fillRect(-18, y - 4, 36, 8);
    g.strokeStyle = '#080404'; g.lineWidth = 1; g.strokeRect(-18, y - 4, 36, 8);
    for (let i = -2; i <= 2; i++) rivet(g, i * 7, y, 1.6);
  }
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(-6 + i * 5, -128 + i * 10, 3, 12, 0, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,120,40,0.25)'; g.fillRect(-15, -132, 30, 5);
}
function drawHammerHead(g) {
  // 기준점 = 자루 끼우는 구멍 (0,0), 머리는 좌우(±50)로, 자루 축은 y
  g.beginPath();
  g.moveTo(-50, -26); g.lineTo(-44, -32); g.lineTo(44, -32); g.lineTo(50, -26); g.lineTo(50, 26); g.lineTo(44, 32); g.lineTo(-44, 32); g.lineTo(-50, 26); g.closePath();
  g.fillStyle = linG(g, 0, -32, 0, 32, [0, '#b8a898', 0.2, '#5a4a40', 0.55, '#2a201a', 0.85, '#4a3a30', 1, '#120a06']); g.fill();
  bronzeTexture(g, -50, -32, 100, 64, 41, 30);
  g.beginPath(); g.moveTo(-50, -26); g.lineTo(-44, -32); g.lineTo(44, -32); g.lineTo(50, -26); g.lineTo(50, 26); g.lineTo(44, 32); g.lineTo(-44, 32); g.lineTo(-50, 26); g.closePath();
  g.strokeStyle = '#080402'; g.lineWidth = 2.6; g.stroke();
  for (const s of [-1, 1]) {
    g.fillStyle = linG(g, s * 40, -34, s * 40, 34, [0, '#d8b070', 0.5, '#6a4520', 1, '#2a1606']);
    g.fillRect(s * 40 - 4, -34, 8, 68);
    g.strokeStyle = '#080402'; g.lineWidth = 1.2; g.strokeRect(s * 40 - 4, -34, 8, 68);
    for (const y of [-24, 0, 24]) rivet(g, s * 40, y, 2.2);
    // 두들겨 닳은 타격면
    g.fillStyle = 'rgba(255,230,190,0.28)'; g.fillRect(s > 0 ? 46 : -50, -24, 4, 48);
  }
  // 앞면 룬 원판
  g.beginPath(); g.arc(0, 0, 20, 0, TAU);
  g.fillStyle = radG(g, -5, -6, 1, 0, 0, 21, [0, '#e8c080', 0.5, '#8a6030', 1, '#2a1606']); g.fill();
  g.strokeStyle = '#140802'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = 'rgba(255,140,50,0.75)'; g.lineWidth = 1.3;
  g.beginPath(); g.arc(0, 0, 14, 0, TAU);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); }
  g.stroke();
  g.fillStyle = '#ffb050'; g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill();
}
function drawFist(g) {
  // 손목 (0,0), 주먹은 +x 쪽
  g.beginPath(); g.moveTo(-2, -14); g.lineTo(26, -20); g.quadraticCurveTo(42, -18, 42, -2); g.quadraticCurveTo(42, 16, 26, 20); g.lineTo(-2, 14); g.closePath();
  g.fillStyle = linG(g, 0, -20, 0, 20, [0, '#e0b070', 0.4, '#9a6a30', 1, '#2a1606']); g.fill();
  g.strokeStyle = '#140802'; g.lineWidth = 2; g.stroke();
  g.strokeStyle = 'rgba(20,8,2,0.7)'; g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < 4; i++) { const y = -13 + i * 8.5; g.moveTo(24, y); g.quadraticCurveTo(38, y + 1, 40, y + 4); }
  g.moveTo(12, -18); g.quadraticCurveTo(20, -6, 14, 4);
  g.stroke();
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,230,180,0.5)'; g.beginPath(); g.ellipse(34, -12 + i * 8.5, 3, 2, 0, 0, TAU); g.fill(); }
}
function drawTongJaw(g) {
  // 기준점 (0,0) = 경첩, +x 로 뻗은 집게 한 쪽 (끝은 달아오른 갈고리)
  g.beginPath(); g.moveTo(-4, -4); g.lineTo(60, -7); g.quadraticCurveTo(82, -8, 90, 4); g.lineTo(84, 6); g.quadraticCurveTo(78, -1, 60, 1); g.lineTo(-4, 4); g.closePath();
  g.fillStyle = linG(g, 0, -8, 0, 6, [0, '#8a7a70', 0.4, '#2a201a', 1, '#0e0806']); g.fill();
  g.strokeStyle = '#060302'; g.lineWidth = 1.8; g.stroke();
  g.beginPath(); g.moveTo(66, -6); g.quadraticCurveTo(82, -8, 90, 4); g.lineTo(84, 6); g.quadraticCurveTo(78, -1, 66, 0); g.closePath();
  g.fillStyle = linG(g, 66, 0, 90, 0, [0, '#ff6a10', 0.5, '#ffc050', 1, '#fff4c0']); g.fill();
  rivet(g, 0, 0, 4);
}
function drawLoin(g) {
  // 기준점 = 허리띠 아래 가운데, 아래로 늘어진 누더기 가죽 앞치마
  g.beginPath();
  g.moveTo(-60, 0); g.lineTo(60, 0);
  g.bezierCurveTo(64, 30, 70, 58, 72, 78);
  const pts = [[72, 78], [60, 90], [50, 76], [38, 92], [24, 80], [10, 96], [-4, 82], [-18, 94], [-32, 78], [-46, 92], [-58, 76], [-70, 88]];
  for (const [x, y] of pts) g.lineTo(x, y);
  g.bezierCurveTo(-70, 58, -64, 30, -60, 0);
  g.closePath();
  g.fillStyle = linG(g, 0, 0, 0, 96, [0, '#4a2a18', 0.5, '#3a1e10', 1, '#1e0e06']); g.fill();
  g.strokeStyle = '#0e0602'; g.lineWidth = 2; g.stroke();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  g.beginPath(); for (let i = 0; i < 6; i++) { const x = -48 + i * 19; g.moveTo(x, 4); g.quadraticCurveTo(x + 4, 44, x - 2, 92); } g.stroke();
  g.strokeStyle = 'rgba(200,150,110,0.2)'; g.lineWidth = 1;
  g.beginPath(); for (let i = 0; i < 6; i++) { const x = -46 + i * 19; g.moveTo(x, 6); g.quadraticCurveTo(x + 4, 44, x, 90); } g.stroke();
  // 탄 자국 · 꿰맨 자국
  for (let i = 0; i < 5; i++) { const x = -40 + h01(i * 3) * 80, y = 20 + h01(i * 7) * 50; g.fillStyle = radG(g, x, y, 0, x, y, 10, [0, 'rgba(10,4,2,0.6)', 1, 'rgba(10,4,2,0)']); g.beginPath(); g.arc(x, y, 10, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(210,180,140,0.55)'; g.lineWidth = 1;
  g.beginPath(); for (let i = 0; i < 7; i++) { g.moveTo(-20 + i * 3, 30 + i * 4); g.lineTo(-16 + i * 3, 33 + i * 4); } g.stroke();
  g.restore();
  // 해골 장식
  g.beginPath(); g.ellipse(0, 22, 11, 12, 0, 0, TAU); g.fillStyle = '#d8c8a0'; g.fill(); g.strokeStyle = '#2a1606'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#1a0a04';
  g.beginPath(); g.ellipse(-4, 20, 3, 3.5, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(4, 20, 3, 3.5, 0, 0, TAU); g.fill();
  g.fillRect(-4, 28, 8, 3);
}
function drawSoul(g, v) {
  // 창살 뒤에 짓눌린 영혼 (해골 같은 얼굴)
  g.beginPath(); g.ellipse(0, -2, 13, 16, 0, 0, TAU);
  g.fillStyle = radG(g, -3, -6, 1, 0, 0, 17, [0, '#fff4d8', 0.5, '#e0c090', 1, '#7a4a20']); g.fill();
  g.strokeStyle = '#3a1a06'; g.lineWidth = 1.4; g.stroke();
  g.beginPath(); g.moveTo(-8, 8); g.quadraticCurveTo(0, 16 + v * 2, 8, 8); g.lineTo(6, 16); g.lineTo(-6, 16); g.closePath();
  g.fillStyle = '#e8d0a0'; g.fill(); g.stroke();
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 5, -3, 3.8, 4.6, s * 0.2, 0, TAU); g.fillStyle = '#1a0602'; g.fill(); }
  g.fillStyle = '#2a0802'; g.beginPath(); g.ellipse(0, 9 + v, 4, 4 + v * 1.5, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff4d8'; for (let i = -2; i <= 2; i++) g.fillRect(i * 2 - 0.6, 5 + v * 0.3, 1.2, 2);
  g.strokeStyle = 'rgba(58,26,6,0.7)'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(0, -18); g.lineTo(2, -10); g.lineTo(-1, -6); g.stroke();
}
function drawLinkA(g) {
  g.beginPath(); g.ellipse(0, 0, 8, 5, 0, 0, TAU);
  g.strokeStyle = '#0a0806'; g.lineWidth = 4; g.stroke();
  g.strokeStyle = '#5a4e48'; g.lineWidth = 2.4; g.stroke();
  g.strokeStyle = 'rgba(255,230,200,0.6)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(0, 0, 8, 5, 0, PI * 1.1, PI * 1.7); g.stroke();
}
function drawLinkB(g) {
  g.fillStyle = '#0a0806'; g.fillRect(-9, -2.6, 18, 5.2);
  g.fillStyle = '#6a5e58'; g.fillRect(-8, -1.4, 16, 2.8);
}
function drawPool(g) {
  g.beginPath(); g.ellipse(0, 0, 168, 22, 0, 0, TAU);
  g.fillStyle = radG(g, 0, -4, 6, 0, 0, 170, [0, '#fff4b0', 0.2, '#ffb040', 0.5, '#ff5a10', 0.85, '#8a1a02', 1, 'rgba(60,8,0,0)']);
  g.save(); g.scale(1, 22 / 168); g.beginPath(); g.arc(0, 0, 168, 0, TAU); g.restore(); g.fill();
  // 가장자리에 굳어 가는 검붉은 겉껍질 띠 + 안쪽으로 소용돌이치는 밝은 쇳물 결
  g.strokeStyle = 'rgba(40,6,0,0.55)'; g.lineWidth = 7;
  g.beginPath(); g.ellipse(0, 0, 158, 19, 0, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,170,60,0.6)'; g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(0, 0, 152, 17, 0, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,246,190,0.55)'; g.lineWidth = 1.4;
  g.beginPath();
  for (let i = 0; i < 4; i++) { const r = 40 + i * 26; g.ellipse(0, 1, r, r * 0.11, 0, PI * (0.1 + i * 0.45), PI * (0.9 + i * 0.45)); }
  g.stroke();
}
function genCracks() {
  const make = (n, seed, box) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      let x = lerp(box[0], box[2], h01(seed + i * 3.1)), y = lerp(box[1], box[3], h01(seed + i * 5.7));
      if (Math.hypot((x - FURN[0]) / (FURN[2] + 12), (y - FURN[1]) / (FURN[3] + 12)) < 1) x += x < 0 ? -40 : 40;
      const pts = [x, y];
      const a0 = h01(seed + i * 9.3) * TAU;
      for (let j = 0; j < 3; j++) { const a = a0 + (h01(seed + i + j * 2.9) - 0.5) * 1.2; const L = 6 + h01(seed + i * 2 + j) * 8; x += Math.cos(a) * L; y += Math.sin(a) * L; if (Math.hypot((x - FURN[0]) / (FURN[2] + 10), (y - FURN[1]) / (FURN[3] + 10)) < 1) break; pts.push(x, y); }
      out.push({ pts, th: 0.06 + (i / n) * 0.86 });
    }
    return out;
  };
  return { body: make(16, 17, [-100, -250, 100, -84]).filter((c) => c.pts.length >= 4), head: make(5, 71, [-26, -90, 26, -20]) };
}
function bakeArt(K) {
  if (!canvasOf(1, 1)) return null;
  const A = { K };
  A.torso = mk(K, 264, 214, 132, 270, drawTorso);
  A.head = mk(K, 150, 124, 75, 110, drawHead);
  A.horn = mk(K, 134, 96, 12, 78, drawHorn);
  A.stump = mk(K, 44, 40, 10, 22, drawStump);
  A.chimney = mk(K, 52, 140, 26, 136, drawChimney);
  A.hammer = mk(K, 108, 76, 54, 38, drawHammerHead);
  A.fist = mk(K, 48, 46, 4, 23, drawFist);
  A.jaw = mk(K, 98, 22, 6, 11, drawTongJaw);
  A.loin = mk(K, 150, 100, 75, 4, drawLoin);
  A.souls = [0, 1, 2].map((v) => mk(K, 32, 40, 16, 20, (g) => drawSoul(g, v)));
  A.linkA = mk(K, 20, 14, 10, 7, drawLinkA);
  A.linkB = mk(K, 20, 8, 10, 4, drawLinkB);
  A.pool = mk(K, 344, 50, 172, 25, drawPool, false);
  A.cracks = genCracks();
  for (const c of [FIRE, HOT, LAVA, SOUL, DARKF, '#ffffff', '#ff4020', '#ffe0a0']) { glowSprite(c, true); glowSprite(c, false); }
  return A;
}

// ───────────────────────── 매 프레임 그리기 도우미 ─────────────────────────
/** 청동 원통 (팔·허벅지). 반지름은 정수 (그라디언트 캐시 키) */
function btube(ctx, x0, y0, x1, y1, r0, r1) {
  const L = Math.hypot(x1 - x0, y1 - y0);
  if (L < 0.5) return;
  ctx.save();
  ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  ctx.beginPath();
  ctx.moveTo(0, -r0); ctx.lineTo(L, -r1); ctx.arc(L, 0, r1, -PI / 2, PI / 2); ctx.lineTo(0, r0); ctx.arc(0, 0, r0, PI / 2, -PI / 2);
  ctx.closePath();
  const rr = Math.max(1, Math.round(Math.max(r0, r1)));
  ctx.fillStyle = R.fl ? '#ffffff' : LG(ctx, 'mo_tube' + rr, 0, -rr, 0, rr, [0, '#ffe0a0', 0.15, '#c08a48', 0.45, '#7a5024', 0.8, '#2e1806', 1, '#6a4a70']);
  if (!R.fl) { ctx.strokeStyle = '#140802'; ctx.lineWidth = 2.6; ctx.stroke(); }
  ctx.fill();
  if (!R.fl) {
    ctx.strokeStyle = 'rgba(40,20,6,0.45)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(L * 0.3, -r0 * 0.7); ctx.quadraticCurveTo(L * 0.5, 0, L * 0.35, r0 * 0.6); ctx.stroke();
  }
  ctx.restore();
}
/** 사슬: (x0,y0)→(x1,y1) 처진 곡선을 따라 고리 스프라이트 */
function chain(ctx, A, x0, y0, x1, y1, sag, n, swing = 0) {
  if (!A?.linkA) return;
  let px = x0, py = y0;
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const x = lerp(x0, x1, k) + Math.sin(k * PI) * swing, y = lerp(y0, y1, k) + Math.sin(k * PI) * sag;
    const mx = (px + x) / 2, my = (py + y) / 2, a = Math.atan2(y - py, x - px);
    put(ctx, i % 2 ? A.linkA : A.linkB, mx, my, a, 0.9);
    px = x; py = y;
  }
}
/** 긴 사슬 (싸게): 처진 곡선에 굵은 점선 두 겹 — 스프라이트 고리를 수십 개 찍지 않는다 */
function chainLine(ctx, x0, y0, x1, y1, sag, t = 0) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
  if (R.fl) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.stroke(); ctx.restore(); return; }
  ctx.strokeStyle = '#0a0806'; ctx.lineWidth = 7; ctx.setLineDash([11, 3]); ctx.lineDashOffset = -t * 60; ctx.stroke();
  ctx.strokeStyle = '#5a4e48'; ctx.lineWidth = 3.4; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 60 - 1.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,180,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
/** 팔 관절 위치: 어깨(sx,sy) · a(아래에서 바깥쪽으로) · e(굽힘) · s(쪽) */
function armJoints(s, a, e) {
  const sx = s * SHOULDER[0], sy = SHOULDER[1];
  const ex = sx + s * Math.sin(a) * L_UP, ey = sy + Math.cos(a) * L_UP;
  const b = a + e;
  const wx = ex + s * Math.sin(b) * L_FORE, wy = ey + Math.cos(b) * L_FORE;
  return { sx, sy, ex, ey, wx, wy, b };
}
/** 방향각(아래 = 0, 쪽 s) → 캔버스 각 */
const canvasAng = (s, a) => Math.atan2(Math.cos(a), s * Math.sin(a));

const POSE_DEF = { ha: 0.3, he: 1.3, hd: 2.9, ta: 0.4, te: 0.9, td: 0.9, tongOpen: 0.15, roar: 0, lean: 0, tilt: 0, chim: 0 };
function easePose(P, T, dt, r = 9) { for (const k in T) P[k] += (T[k] - P[k]) * (1 - Math.exp(-r * dt)); }

// ───────────────────────── 보스 ─────────────────────────
export class Moloch extends BossC {
  setup() {
    ensureArt(this.world);
    this.noGravity = true;   // 발은 바닥(용암)에 묻혀 있다 — 받침대 지형과 부딪치지 않게 직접 움직인다
    this.facing = -1; this.turnK = -1;
    this.pose = { ...POSE_DEF }; this.poseT = { ...POSE_DEF };
    this.poseRate = 9;
    this.bottom = this.A.floor;
    this.vx = this.vy = 0;
    this.grateK = 0; this.grateT = 0; this.heat = 0;
    this.tideHold = 0; this.tideCd = 14;
    this.tongs = null; this.pourK = 0; this.beam = null; this.hamGlow = 0;
    this.sink = 0; this.exploded = false; this.stepAcc = 0;
    this.chainSw = 0;
  }
  get homeX0() { return this.A.x0 + this.A.w * 0.4 + 110; }
  get homeX1() { return this.A.x1 - 110; }
  // ── 판정 ──
  hitParts() {
    const cx = this.cx, b = this.bottom;
    const open = this.grateK > 0.5;
    return [
      { x: cx - 40, y: b + GRATE_C - 45, w: 80, h: 90, defMul: open ? 0.5 : 2.0, grate: true },
      { x: cx - 30, y: b + HEAD_C - 30, w: 60, h: 60, defMul: 0.9 },
      { x: cx - 70, y: b - 250, w: 140, h: 220, defMul: 1.5 },
    ];
  }
  contactParts() { const b = this.bottom; return [{ x: this.cx - 70, y: b - 250, w: 140, h: 240 }, { x: this.cx - 30, y: b + HEAD_C - 30, w: 60, h: 56 }]; }
  /** 창살 가운데 (월드) */
  grateP() { return { x: this.cx + this.turnK * 4, y: this.bottom + GRATE_C }; }
  /** 손목 (월드): s = +1 망치 팔(바라보는 쪽) / −1 집게 팔 */
  wrist(s) {
    const P = this.pose;
    const J = s > 0 ? armJoints(1, P.ha, P.he) : armJoints(-1, P.ta, P.te);
    return { x: this.cx + J.wx * this.turnK, y: this.bottom + J.wy };
  }
  aim(o) { Object.assign(this.poseT, POSE_DEF, o); }
  /** 용암이 차 있는 동안은 chimney · furnaceBeam 만 (world2 §6.3 tide) */
  weights(phase = this.phase) {
    if (this.tideHold > 0) return [['chimney', 1], ['furnaceBeam', 1]].filter(([k]) => typeof this['s_' + k] === 'function');
    return super.weights(phase);
  }
  // ── 매 프레임 ──
  animTick(dt, world) {
    easePose(this.pose, this.poseT, dt, this.poseRate);
    this.poseRate = 9;
    this.turnK = approach(this.turnK, this.facing, dt * 3.2);
    this.grateK = approach(this.grateK, this.grateT > 0 ? 1 : 0, dt * (this.grateT > 0 ? 4 : 2.5));
    if (this.grateT > 0) this.grateT -= dt;
    if (this.hamGlow > 0) this.hamGlow = Math.max(0, this.hamGlow - dt * 1.5);
    this.heat = approach(this.heat, this.grateT > 0 ? 1 : 0.35, dt * 2);
    this.chainSw = Math.sin(this.t * 1.3) * 6 + this.vx * 0.08;
  }
  tickB(dt, world) {
    this.animTick(dt, world);
    const q = world.fx?.quality ?? 1;
    // 굴뚝 연기 · 불똥
    if (Math.random() < 0.3 * q) {
      const s = Math.random() < 0.5 ? -1 : 1, cracked = this.formPhase >= 1 && s < 0;
      const x = this.cx + this.turnK * s * 64, y = this.bottom - 356;
      world.fx.emit(cracked ? 'smoke' : 'smoke', x, y, { color: cracked ? '#141010' : '#3a3034', speed: 40, angle: -PI / 2, spread: 0.4, size: cracked ? 22 : 16 });
      if (Math.random() < 0.5) world.fx.emit('ember', x, y + 6, { speed: 110, angle: -PI / 2, spread: 0.7 });
    }
    if (this.formPhase >= 2 && Math.random() < 0.25 * q) world.fx.emit('fire', this.cx + rand(-50, 50), this.bottom - rand(170, 240), { speed: 30, angle: PI / 2, spread: 0.3, size: 5, grav: 500 });
    if (Math.random() < 0.2 * q) world.fx.emit('ember', this.cx + rand(-140, 140), this.bottom - 6, { speed: 70, angle: -PI / 2, spread: 0.5 });
    // 용암 조수: 유지 시간이 끝나면 내리고, P2/P3 에서는 약 14초마다 다시
    if (this.tideHold > 0) { this.tideHold -= dt; if (this.tideHold <= 0) { this.tideHold = 0; setMagma(this, 17, 120); } }
    else if (this.formPhase >= 1) {
      this.tideCd -= dt;
      if (this.tideCd <= 0 && this.state === 'idle' && !this.forced.includes('tide')) { this.forceNext('tide'); this.tideCd = 14; }
    }
  }
  idleAnim(dt, world) { this.animTick(dt, world); }
  idleMove(dt, world, t) {
    const p = this.P;
    this.facePlayer();
    this.aim({ ha: 0.3 + Math.sin(this.t * 1.1) * 0.05, he: 1.3, hd: 2.9, ta: 0.4 + Math.sin(this.t * 0.9) * 0.06, te: 0.9, roar: 0, lean: Math.sin(this.t * 0.7) * 0.02 });
    let tx = this.cx;
    if (p) tx = clamp(p.cx + (Math.sign(this.cx - p.cx) || 1) * 280, this.homeX0, this.homeX1);
    this.vx = clamp((tx - this.cx) * 0.8, -60, 60); this.vy = 0;
    this.bottom = this.A.floor;
    this.wade(dt, world);
  }
  /** 걸을 때: 용암을 헤치는 불티 + 쿵 */
  wade(dt, world) {
    if (Math.abs(this.vx) < 8) return;
    this.stepAcc += dt * Math.abs(this.vx) / 60;
    if (this.stepAcc >= 1.1) {
      this.stepAcc = 0;
      world.camera.shake(2.5, 0.15);
      audio.sfx('land_heavy', { pitch: 0.5, vol: 0.35 });
      world.fx.burst('ember', this.cx + this.turnK * rand(-60, 60), this.bottom - 4, 8, { speed: 160, angle: -PI / 2, spread: 0.8 });
    }
  }
  onCancel() {
    this.tongs = null; this.beam = null; this.pourK = 0;
    if (!(this.tideHold > 0)) this.grateT = 0;
    this.aim({});
  }
  onReset(world) {
    this.onCancel();
    this.tideHold = 0; this.tideCd = 14; this.grateT = 0; this.grateK = 0; this.heat = 0.35;
    Object.assign(this.pose, POSE_DEF); Object.assign(this.poseT, POSE_DEF);
    this.x = clamp(this.cx, this.homeX0, this.homeX1) - this.w / 2; this.bottom = this.A.floor; this.vx = this.vy = 0;
    this.sink = 0;
  }
  afterTransition(n) { if (n === 1) this.tideCd = 2.5; }
  // ── 등장 ──
  s_intro(dt, world, t) {
    this.facePlayer();
    this.vx = 0;
    this.aim({ ha: 2.6, he: 0.3, hd: 3.0, ta: 2.2, te: 0.5, td: 2.6, roar: t > 0.3 && t < 1.2 ? 1 : 0, lean: -0.05, chim: 1 });
    if (this.at(0.3)) {
      audio.sfx('boss_roar', { pitch: 0.55 }); audio.sfx('fire', { pitch: 0.5 });
      impact(world, { shake: 10, time: 0.6 });
      for (const s of [-1, 1]) world.fx.burst('fire', this.cx + this.turnK * s * 64, this.bottom - 356, 18, { speed: 260, angle: -PI / 2, spread: 0.5 });
      this.grateT = 0.8;
    }
    if (t > 1.4) this.done(0.8);
  }

  // ═══════════════ 패턴 ═══════════════
  /** 망치: 0.8초 들어 올려 → 내리찍기 160×80 + 양쪽 충격파 + 리벳 낙하 2개 */
  s_hammer(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P, f = this.facing;
    this.vx = 0;
    if (this.at(0.001)) {
      this.facePlayer();
      const fx = this.facing, near = this.cx + fx * 200, far = this.cx + fx * 330;
      const px = p?.cx ?? far;
      this.hamX = clamp(clamp(px, Math.min(near, far), Math.max(near, far)), A.x0 + 60, A.x1 - 60);
      telegraph(this, 0.8, { sfx: null });
      audio.sfx('boss_roar', { pitch: 0.4, vol: 0.5 });
      const ix = this.hamX;
      strikeRect(this, { x: ix - 80, y: F - 80, w: 160, h: 80 }, {
        warn: 0.8, life: 0.2, mv: 1.9, kb: [fx * 380, -560], sfx: null,
        paint: (ctx, z, w) => {
          if (!z.started) { warnFloor(ctx, ix, F, 120, z.k, FIRE, w.time); warnRect(ctx, ix - 80, F - 80, 160, 80, z.k * 0.6, FIRE, w.time); return; }
          if (R.fl) return;
          glowE(ctx, ix, F - 30, 120, 50, HOT, 0.9 * (1 - z.a));
        },
      });
    }
    const ix = this.hamX ?? this.cx + f * 260;
    if (t < 0.8) this.aim({ ha: 2.75, he: 0.25, hd: 3.05, ta: 0.7, te: 1.0, lean: -0.08, roar: 0.3 });
    else if (t < 1.45) {
      const sx = this.cx + f * SHOULDER[0];
      const a = Math.atan2(Math.abs(ix - sx), -SHOULDER[1]);
      this.aim({ ha: a, he: 0, hd: a, ta: 0.5, te: 1.2, lean: 0.08, roar: 0.8 });
      if (t < 0.9) this.poseRate = 40;
    } else this.aim({});
    if (this.at(0.8)) {
      impact(world, { shake: 14, time: 0.45, stop: 0.05 });
      audio.sfx('hit_heavy', { pitch: 0.45 }); audio.sfx('explode', { pitch: 0.6, vol: 0.8 });
      world.fx.burst('dust', ix, F - 6, 18, { speed: 260, angle: -PI / 2, spread: 1.2 });
      world.fx.burst('gravel', ix, F - 10, 14, { speed: 320, angle: -PI / 2, spread: 1.0 });
      world.fx.burst('ember', ix, F - 10, 16, { speed: 300 });
      world.fx.ring(ix, F - 6, { color: HOT, r0: 20, r1: 180, life: 0.4, width: 8 });
      this.hamGlow = 1;
      const waves = this.inferno ? 3 : 1;
      for (let k = 0; k < waves; k++) {
        const go = () => { for (const d of [-1, 1]) groundWave(this, ix, d, { h: 40, w: 44, speed: 520, mv: 1.0, element: 'fire', color: '#ffb060', kb: [d * 320, -420], sfx: k ? null : 'hit_heavy' }); };
        if (k === 0) go(); else this.later(k * 0.32, go);
      }
      for (let k = 0; k < 2; k++) this.rivet(world, k);
    }
    if (t > 1.75) this.done(1.1);
  }
  /** 리벳 낙하 (0.6초 예고) */
  rivet(world, k) {
    const A = this.A, F = A.floor, cam = world.camera;
    const x0 = Math.max(A.x0 + 40, (cam?.x ?? A.x0) + 40), x1 = Math.min(A.x1 - 40, (cam ? cam.x + cam.vw : A.x1) - 40);
    const x = rand(x0, Math.max(x0 + 1, x1));
    const top = (A.top ?? 0) + 10, st = { y: top, done: false };
    this.zone({
      x: x - 14, y: top, w: 28, h: 28, warn: 0.6 + k * 0.15, life: 2, mv: 0.8, kb: [160, -300], z: 6,
      tick: (z, wd, dt) => {
        if (z.t < z.warn || st.done) return;
        st.y += 900 * dt; z.y = st.y - 28;
        if (st.y >= F) { st.done = true; z.dur = z.t - z.warn; wd.fx.burst('spark', x, F - 4, 10, { color: '#ffe0a0', speed: 260 }); audio.sfx('clang', { pitch: 0.7, vol: 0.5 }); }
      },
      paint: (ctx, z, wd) => {
        if (!z.started) { warnBang(ctx, x, top + 40, 14, 0.6 + 0.4 * Math.sin(wd.time * 20), FIRE); warnFloor(ctx, x, F, 40, z.k, FIRE, wd.time); return; }
        if (st.done || R.fl) return;
        glowE(ctx, x, st.y - 40, 10, 40, FIRE, 0.5);
        ctx.fillStyle = '#6a5a50'; ctx.strokeStyle = '#140a04'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, st.y - 14, 12, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8b8a8'; ctx.beginPath(); ctx.arc(x - 3, st.y - 17, 4, 0, TAU); ctx.fill();
      },
    });
  }
  /** 집게: 0.6초 달아오름 → 사슬 달린 집게를 바닥으로 내던져 경기장 60%를 1초에 쓸기 (높이 70) */
  s_tongs(dt, world, t) {
    const A = this.A, F = A.floor;
    this.vx = 0;
    if (this.at(0.001)) {
      this.facePlayer();
      telegraph(this, 0.6);
      audio.sfx('fire', { pitch: 0.6 });
      const f = this.facing;
      this.tongX0 = this.cx + f * 120;
      this.tongX1 = clamp(this.tongX0 + f * A.w * 0.6, A.x0 + 50, A.x1 - 50);
    }
    const f = this.facing, x0 = this.tongX0, x1 = this.tongX1;
    if (t < 0.6) {
      this.aim({ ta: 2.3, te: 0.6, td: 2.6, tongOpen: 1, ha: 0.5, he: 1.0, lean: -0.06 });
      if (this.every(0.06)) { const w = this.wrist(-1); world.fx.emit('ember', w.x, w.y, { speed: 90 }); }
      return;
    }
    if (this.at(0.6)) {
      audio.sfx('whip_crack', { pitch: 0.5 }); audio.sfx('slash_heavy', { pitch: 0.6 });
      const H = 70, W = 110;
      this.zone({
        x: x0 - W / 2, y: F - H, w: W, h: H, warn: 0, life: 1.0, mv: 1.5, element: 'fire', kb: [f * 440, -380], z: 6,
        tick: (z, wd) => {
          const u = clamp(z.t / 1.0, 0, 1), e = 1 - (1 - u) * (1 - u);
          const x = lerp(x0, x1, e);
          z.x = x - W / 2;
          this.tongs = { x, y: F - 26, open: 0.6 + 0.4 * Math.sin(z.t * 20) };
          if (Math.random() < 0.7 * (wd.fx.quality ?? 1)) wd.fx.emit('fire', x - f * 30, F - 10, { speed: 60, angle: -PI / 2, spread: 0.6, size: 10 });
        },
        paint: (ctx, z) => {
          if (R.fl) return;
          const u = clamp(z.t / 1.0, 0, 1), e = 1 - (1 - u) * (1 - u), x = lerp(x0, x1, e);
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = rgba(FIRE, 0.28); ctx.fillRect(Math.min(x0, x), F - 8, Math.abs(x - x0), 8);
          glowE(ctx, x, F - 30, 80, 40, FIRE, 0.6);
        },
      });
    }
    if (t < 1.6) this.aim({ ta: -0.9, te: 0.2, td: -0.9, tongOpen: 0.6, ha: 0.4, he: 1.1, lean: 0.1 });
    else {
      // 되감기
      const u = clamp((t - 1.6) / 0.4, 0, 1), w = this.wrist(-1);
      if (this.tongs) { this.tongs.x = lerp(x1, w.x, u * u); this.tongs.y = lerp(F - 26, w.y, u * u); }
      this.aim({ ta: 0.4, te: 0.9, td: 0.9, tongOpen: 0.3 });
      if (u >= 1) this.tongs = null;
    }
    if (t > 2.05) { this.tongs = null; this.done(1.0); }
  }
  /** 쇳물 붓기: 창살 달아오름 0.7초 → 2.5초 열림(약점) → 앞쪽 260px 에 용암 웅덩이 3.5초 */
  s_pour(dt, world, t) {
    const A = this.A, F = A.floor;
    this.vx = 0;
    if (this.at(0.001)) { this.facePlayer(); telegraph(this, 0.7); audio.sfx('fire', { pitch: 0.45 }); this.heat = 1; }
    const f = this.facing;
    this.aim({ ha: 0.6, he: 1.0, ta: 0.9, te: 0.9, lean: t > 0.7 ? 0.12 : -0.04, roar: t > 0.7 && t < 1.2 ? 0.8 : 0 });
    if (this.at(0.7)) {
      this.grateT = 2.5;
      audio.sfx('door', { pitch: 0.5 }); audio.sfx('fire', { pitch: 0.7 });
      const G = this.grateP();
      world.fx.burst('fire', G.x, G.y, 16, { speed: 200, angle: f > 0 ? 0.3 : PI - 0.3, spread: 0.7 });
    }
    if (this.at(0.9)) {
      const xa = this.cx + f * 50, xb = this.cx + f * 310;
      const x = Math.min(xa, xb), w = 260;
      this.pourK = 1;
      strikeRect(this, { x, y: F - 22, w, h: 22 }, {
        warn: 0.25, life: 3.5, mv: 0.6, rehit: 0.35, element: 'fire', kb: [f * 120, -420], sfx: 'fire', color: FIRE,
        paint: (ctx, z, wd) => {
          if (!z.started) { warnFloor(ctx, x + w / 2, F, w, z.k, FIRE, wd.time); return; }
          lavaPuddle(ctx, x, F, w, z.t - z.warn, z.dur, wd.time);
        },
        light: (L, z) => { if (z.on) L.add(x + w / 2, F - 10, 200, FIRE, 0.6 * (1 - z.a * 0.5)); },
      });
    }
    if (t > 0.9 && t < 2.4 && this.every(0.05)) {
      const G = this.grateP();
      world.fx.emit('fire', G.x + f * 30, G.y + 20, { speed: 80, angle: PI / 2 - f * 0.4, spread: 0.3, size: 12 });
    }
    if (t > 2.4) this.pourK = Math.max(0, this.pourK - dt * 3);
    if (t > 3.4) { this.pourK = 0; this.done(0.9); }
  }
  /** 굴뚝: 0.6초 달아오름 → 유성 6개가 예고 원(0.9초, 0.15초 간격)에 떨어진다 */
  s_chimney(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    this.vx = 0;
    this.aim({ chim: 1, ha: 1.2, he: 0.8, ta: 1.2, te: 0.8, lean: -0.1, roar: t > 0.5 && t < 1.1 ? 1 : 0.2, tilt: -0.08 });
    if (this.at(0.001)) { telegraph(this, 0.6); audio.sfx('fire', { pitch: 0.4 }); world.camera.shake(3, 0.6); }
    if (this.at(0.6)) {
      audio.sfx('explode', { pitch: 0.7 }); audio.sfx('boss_roar', { pitch: 0.5, vol: 0.6 });
      for (const s of [-1, 1]) world.fx.burst('fire', this.cx + this.turnK * s * 64, this.bottom - 356, 22, { speed: 380, angle: -PI / 2, spread: 0.35 });
      const cam = world.camera;
      const x0 = Math.max(A.x0 + 60, (cam?.x ?? A.x0) + 60), x1 = Math.min(A.x1 - 60, (cam ? cam.x + cam.vw : A.x1) - 60);
      const xs = [clamp(p?.cx ?? (x0 + x1) / 2, x0, x1)];
      for (let i = 0; xs.length < 6 && i < 60; i++) { const x = rand(x0, Math.max(x0 + 1, x1)); if (xs.every((q) => Math.abs(q - x) > 90)) xs.push(x); }
      while (xs.length < 6) xs.push(rand(x0, Math.max(x0 + 1, x1)));
      xs.forEach((x, i) => this.meteor(x, 0.9 + i * 0.15, i));
    }
    if (t > 2.3) this.done(1.0);
  }
  meteor(x, warn, i) {
    const A = this.A, F = A.floor, top = (A.top ?? 0) - 60, y = F - 24;
    strikeCircle(this, x, y, 60, {
      warn, life: 0.25, mv: 1.2, element: 'fire', color: FIRE, kb: [260, -460], shake: 5, sfx: i % 2 ? 'hit_heavy' : 'explode',
      paint: (ctx, z, w) => {
        if (!z.started) {
          const k = z.k;
          ctx.save(); ctx.translate(x, F - 4); ctx.scale(1, 0.3);
          warnCircle(ctx, 0, 0, 60, k, FIRE, w.time);
          ctx.restore();
          if (R.fl) return;
          const my = lerp(top, y, k * k);
          glowE(ctx, x, my - 60, 22, 80, FIRE, 0.55);
          glow(ctx, x, my, 30, HOT, 0.9, true);
          ctx.fillStyle = '#2a1206'; ctx.beginPath(); ctx.arc(x, my, 10, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(x - 3, my - 3, 4, 0, TAU); ctx.fill();
          return;
        }
        if (R.fl) return;
        glow(ctx, x, y, 110, FIRE, 0.9 * (1 - z.a), true);
      },
    });
  }
  /** 조수: 1.5초 경고 → 용암이 13.5행(인페르노 12.5)까지 → 6초 유지 (그동안 chimney · furnaceBeam) → 17행으로 */
  s_tide(dt, world, t) {
    const A = this.A, F = A.floor;
    this.vx = 0;
    this.aim({ ha: 2.5, he: 0.4, hd: 3.0, ta: 2.5, te: 0.4, td: 2.8, roar: t < 1.5 ? 1 : 0.3, lean: -0.1, chim: 0.8 });
    if (this.at(0.001)) {
      warnText(this, '용암이 차오른다!', '#ff9a4a');
      audio.sfx('boss_roar', { pitch: 0.45 }); audio.sfx('fire', { pitch: 0.4 });
      telegraph(this, 0.6, { sfx: null });
    }
    if (t < 1.5) {
      if (this.every(0.3)) world.camera.shake(3, 0.3);
      const q = world.fx?.quality ?? 1;
      if (Math.random() < 0.8 * q) world.fx.emit('fire', rand(A.x0, A.x1), F - 4, { speed: 70, angle: -PI / 2, spread: 0.4, size: rand(8, 14) });
      if (Math.random() < 0.8 * q) world.fx.emit('ember', rand(A.x0, A.x1), F - 4, { speed: 120, angle: -PI / 2, spread: 0.5 });
    }
    if (this.at(1.5)) {
      const row = this.inferno ? 12.5 : 13.5;
      setMagma(this, row, 90);
      const rise = Math.max(0, (17 - row) * 48 / 90);
      this.tideHold = rise + 6; this.tideCd = 14;
      audio.sfx('explode', { pitch: 0.4, vol: 0.6 });
    }
    if (t > 2.0) {
      this.forceNext(Math.random() < 0.5 ? 'chimney' : 'furnaceBeam');
      this.done(0.4);
    }
  }
  /** 화로 광선: 창살이 열리고(약점) 배에서 가로 불줄기 — 끝이 바닥−260 → 바닥−40 → 바닥−260 으로 2초 동안 훑는다 */
  s_furnaceBeam(dt, world, t) {
    const A = this.A, F = A.floor;
    this.vx = 0;
    if (this.at(0.001)) { this.facePlayer(); telegraph(this, 0.6, { sfx: 'warning' }); this.grateT = 2.8; audio.sfx('fire', { pitch: 0.35 }); }
    const f = this.facing;
    const G = this.grateP();
    const ex = f > 0 ? A.x1 + 20 : A.x0 - 20;
    const endY = (u) => F - 260 + 220 * Math.sin(PI * clamp(u, 0, 1));
    this.aim({ ha: 1.0, he: 1.0, ta: 1.0, te: 1.0, lean: 0.05, roar: t > 0.6 && t < 2.6 ? 1 : 0.3, tilt: -0.05 });
    if (t < 0.6) { this.beam = { x0: G.x, y0: G.y, x1: ex, y1: endY(0), warn: t / 0.6 }; return; }
    if (this.at(0.6)) {
      audio.sfx('fire', { pitch: 0.6 }); audio.sfx('explode', { pitch: 0.9, vol: 0.5 });
      const line = { x0: G.x, y0: G.y, x1: ex, y1: endY(0), th: 40 };
      this.zone({
        x: Math.min(G.x, ex), y: F - 280, w: Math.abs(ex - G.x), h: 280, warn: 0, life: 2.0, mv: 0.7, rehit: 0.25, element: 'fire', kb: [f * 300, -260], z: 7,
        line,
        tick: (z) => {
          const P2 = this.grateP();
          line.x0 = P2.x + f * 10; line.y0 = P2.y; line.x1 = ex; line.y1 = endY(z.t / 2.0);
          this.beam = { ...line, warn: 1 };
        },
        onEnd: () => { this.beam = null; },
        paint: (ctx) => { if (!R.fl) flameBeam(ctx, line, this.t); },
        light: (L) => { L.add((line.x0 + line.x1) / 2, (line.y0 + line.y1) / 2, 320, FIRE, 0.7); },
      });
    }
    if (t > 2.6) { this.beam = null; this.grateT = Math.min(this.grateT, 0.2); this.done(1.0); }
  }
  /** 영혼: 창살에서 유도 영혼 5개 (속도 200, 선회 2.2, 수명 4, 어둠) */
  s_souls(dt, world, t) {
    this.vx = 0;
    if (this.at(0.001)) { this.facePlayer(); telegraph(this, 0.5); this.grateT = 1.6; audio.sfx('ghost', { pitch: 0.6 }); }
    const f = this.facing;
    this.aim({ ha: 0.6, he: 1.0, ta: 0.6, te: 1.0, lean: 0.08, roar: 1, tilt: -0.1 });
    for (let i = 0; i < 5; i++) {
      if (!this.at(0.5 + i * 0.16)) continue;
      const G = this.grateP();
      const a = f > 0 ? -0.9 + i * 0.35 : PI + 0.9 - i * 0.35;   // 앞쪽 위로 부채꼴
      const sp = 200;
      this.shoot({
        x: G.x, y: G.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 22, h: 22, life: 4, behavior: 'homing', homingTurn: 2.2, homingDelay: 0.25,
        collideWalls: false, render: soulRender, color: SOUL, light: { r: 70, color: SOUL, i: 0.6 },
        attack: { mv: 0.9, element: 'dark', kb: [200, -240] },
      });
      audio.sfx('ghost', { pitch: 1.2 + i * 0.1, vol: 0.45 });
      world.fx.burst('soul', G.x, G.y, 6, { color: SOUL, speed: 120 });
    }
    if (t > 1.6) this.done(1.0);
  }
  /** 사슬: 플레이어 자리와 ±220 에 사슬 기둥 셋 (0.7초 예고) → 1.2초 동안 우상 쪽으로 끌어당김 */
  s_chains(dt, world, t) {
    const A = this.A, F = A.floor, p = this.P;
    this.vx = 0;
    this.aim({ ta: 2.6, te: 0.3, td: 2.9, ha: 2.6, he: 0.3, hd: 3.0, roar: t < 0.8 ? 1 : 0.4, lean: t < 0.7 ? -0.08 : 0.1 });
    if (this.at(0.001)) {
      this.facePlayer();
      audio.sfx('boss_roar', { pitch: 0.5, vol: 0.6 });
      const px = p?.cx ?? A.cx;
      const xs = [px, px - 220, px + 220].map((x) => clamp(x, A.x0 + 40, A.x1 - 40));
      const cx = this.cx;
      for (const x of xs) {
        const dir = Math.sign(cx - x) || 1;
        strikeFloor(this, x, {
          w: 56, h: 280, warn: 0.7, life: 1.2, mv: 1.1, kb: [dir * 280, -200], color: FIRE, sfx: 'whip_crack',
          paint: (ctx, z, wd) => {
            if (!z.started) { warnFloor(ctx, x, F, 70, z.k, FIRE, wd.time); return; }
            chainColumn(ctx, x, F, 280, z.t - z.warn, cx, this.bottom - 120);
          },
        });
      }
      pullField(this, cx, F - 60, { warn: 0.7, dur: 1.2, force: 600, maxV: 320, r: 1100, sfx: null, paint: () => {} });
    }
    if (this.at(0.7)) { audio.sfx('clang', { pitch: 0.5 }); world.camera.shake(6, 0.3); }
    if (t > 2.1) this.done(1.0);
  }

  // ═══════════════ 페이즈 전환 ═══════════════
  /** 60%: 포효 · 굴뚝 분출 (1.4초) */
  s_phase1(dt, world, t) {
    this.transitionTick(dt, world, t);
    this.vx = 0;
    this.aim({ ha: 2.7, he: 0.3, hd: 3.0, ta: 2.7, te: 0.3, td: 3.0, roar: 1, lean: -0.12, chim: 1, tilt: -0.1 + Math.sin(t * 30) * 0.02 });
    if (this.at(0.05)) {
      audio.sfx('boss_roar', { pitch: 0.45 }); audio.sfx('explode', { pitch: 0.5 });
      impact(world, { shake: 12, time: 0.6, flash: '#ff7a2a', fa: 0.25 });
      for (const s of [-1, 1]) world.fx.burst('fire', this.cx + this.turnK * s * 64, this.bottom - 356, 30, { speed: 420, angle: -PI / 2, spread: 0.4 });
      world.fx.burst('smoke', this.cx - this.turnK * 64, this.bottom - 356, 14, { color: '#0e0a0a', speed: 120, angle: -PI / 2, spread: 0.6 });
      this.grateT = 1.2;
    }
  }
  /** 30%: 뿔이 부러지고 영혼들이 새어 나온다 (1.8초) */
  s_hornbreak(dt, world, t) {
    this.transitionTick(dt, world, t);
    this.vx = 0;
    const pre = this.formPhase < 2;
    this.aim({ ha: pre ? 2.9 : 1.4, he: pre ? 1.6 : 0.8, hd: pre ? 3.1 : 2.4, ta: pre ? 2.9 : 1.4, te: pre ? 1.6 : 0.8, roar: 1, lean: pre ? 0.12 : -0.14, tilt: pre ? 0.2 + Math.sin(t * 40) * 0.05 : -0.2 });
    if (pre && this.every(0.15)) { const H = this.headP(); world.fx.emit('spark', H.x + rand(-60, 60), H.y - 40, { color: '#ffe0a0', speed: 200 }); audio.sfx('clang', { pitch: 0.4 + t * 0.4, vol: 0.4 }); }
    if (!pre && this.every(0.12) && t < 1.7) { const G = this.grateP(); world.fx.emit('soul', G.x + rand(-30, 30), G.y + rand(-30, 30), { color: SOUL, speed: 120, angle: -PI / 2, spread: 0.8 }); }
    this.grateT = Math.max(this.grateT, 0.3);
  }
  applyPhase(n, world) {
    if (n === 1) { this.tideCd = 2.5; return; }
    if (n === 2) {
      const H = this.headP();
      for (const s of [-1, 1]) {
        const hx = H.x + this.turnK * s * 40 * HEAD_S, hy = H.y - 74 * HEAD_S;
        world.fx.burst('shard', hx, hy, 14, { color: '#d8b890', speed: 300 });
        world.fx.burst('fire', hx, hy, 12, { speed: 200 });
        const fx = hx, fy = hy, dir = this.turnK * s;
        world.fx.ghost((ctx, a) => {   // 부러진 뿔이 튕겨 나가 떨어진다 (a: 0.5 → 0)
          if (!ART?.horn) return;
          const u = 1 - a * 2, x = fx + dir * u * 180, y = fy + u * 120 + u * u * 500;
          ctx.save(); ctx.globalAlpha = Math.min(1, a * 4);
          put(ctx, ART.horn, x, y, dir * u * 6, dir * 0.9, 0.9);
          ctx.restore();
        }, 1.0, 'front');
      }
      world.fx.ring(H.x, H.y - 40, { color: HOT, r0: 20, r1: 260, life: 0.6, width: 10 });
      world.fx.burst('soul', this.grateP().x, this.grateP().y, 24, { color: SOUL, speed: 260 });
      audio.sfx('break_wall', { pitch: 0.6 }); audio.sfx('boss_roar', { pitch: 0.4 }); audio.sfx('ghost', { pitch: 0.8 });
      impact(world, { shake: 16, time: 0.6, flash: '#ffb060', fa: 0.3, stop: 0.08 });
    }
  }
  headP() { return { x: this.cx + this.turnK * 2, y: this.bottom + HEAD_Y + this.headBob() }; }
  headBob() { return Math.sin(this.t * 1.4) * 2 + this.pose.roar * -4; }

  // ═══════════════ 사망 ═══════════════
  onDeath(world) {
    this.dying = 3.2;
    this.clearJobs();
    this.tongs = null; this.beam = null; this.pourK = 0;
    this.tideHold = 0;
    setMagma(this, 17, 120);
    this.grateT = 3;
    this.aim({ ha: 2.9, he: 0.5, hd: 3.1, ta: 2.9, te: 0.5, td: 3.1, roar: 1, lean: -0.15, chim: 1, tilt: -0.25 });
    audio.sfx('boss_roar', { pitch: 0.35 }); audio.sfx('fire', { pitch: 0.4 });
  }
  dyingTick(dt, world) {
    const el = 3.2 - this.dying;
    this.animTick(dt, world);
    if (!this.exploded) {
      this.x += Math.sin(this.t * 60) * 1.2;
      if (Math.random() < 0.6) { const G = this.grateP(); world.fx.emit('fire', G.x + rand(-40, 40), G.y + rand(-40, 40), { speed: 160, size: 14 }); }
      if (this.every(0.2)) world.camera.shake(4, 0.2);
    }
    if (el >= 1.2 && !this.exploded) {
      this.exploded = true;
      const G = this.grateP();
      world.fx.burst('fire', G.x, G.y, 60, { speed: 480 });
      world.fx.burst('smoke', G.x, G.y, 20, { speed: 200, color: '#1a1010' });
      world.fx.burst('gravel', G.x, G.y, 20, { speed: 420, color: '#8a6030' });
      world.fx.ring(G.x, G.y, { color: HOT, r0: 20, r1: 420, life: 0.8, width: 14 });
      world.fx.flash?.(G.x, G.y, { color: '#fff0c0', size: 420, life: 0.35 });
      impact(world, { shake: 18, time: 0.8 });
      audio.sfx('explode', { pitch: 0.5 }); audio.sfx('explode', { pitch: 0.8 }); audio.sfx('boss_die', { pitch: 0.8 });
    }
    if (this.exploded) {
      this.sink += dt * 70;
      if (Math.random() < 0.7) { const G = this.grateP(); world.fx.emit('gold', G.x + rand(-40, 40), G.y + rand(-20, 20), { color: '#ffe38a', speed: 90, angle: -PI / 2, spread: 0.7, grav: -160, life: 1.6 }); }
      if (Math.random() < 0.3) world.fx.emit('holy', this.cx + rand(-120, 120), this.bottom - rand(40, 320), { color: '#fff0b0', speed: 60, angle: -PI / 2, spread: 0.5 });
    }
  }
  render(ctx, world) {
    if (this.dying > 0) ctx.globalAlpha = clamp(this.dying / 1.2, 0, 1);
    super.render(ctx, world);
  }

  // ═══════════════ 조명 · 그리기 ═══════════════
  lightsB(L) {
    const G = this.grateP();
    L.add(G.x, G.y, 200 + this.heat * 140, FIRE, 0.55 + this.heat * 0.4);
    const H = this.headP();
    L.add(H.x, H.y - 50 * HEAD_S, 110, '#ff5020', 0.5 + this.pose.roar * 0.3);
    for (const s of [-1, 1]) L.add(this.cx + this.turnK * s * 64, this.bottom - 360, 150 + this.pose.chim * 100, FIRE, 0.5 + this.pose.chim * 0.4);
    L.add(this.cx, this.bottom - 4, 260, LAVA, 0.5);
  }
  paintBack(ctx) {
    if (!this.beam || R.fl || this.beam.warn >= 1) return;
    const b = this.beam;
    warnLine(ctx, b.x0, b.y0, b.x1, b.y1, b.warn, FIRE, 3);
  }
  paintBody(ctx) {
    const A = ART, fl = R.fl, P = this.pose, t = this.t;
    const x = this.cx, y = this.bottom + this.sink;
    if (!A) {
      ctx.fillStyle = fl ? '#fff' : '#6a4520';
      ctx.beginPath(); ctx.ellipse(x, y - 150, 100, 150, 0, 0, TAU); ctx.fill();
      return;
    }
    const dmg = 1 - this.hp / this.stats.maxHp, f2 = this.formPhase >= 2, f1 = this.formPhase >= 1;
    const tk = Math.abs(this.turnK) < 0.18 ? Math.sign(this.turnK || 1) * 0.18 : this.turnK;
    const breath = Math.sin(t * 1.4) * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(tk, 1);
    ctx.rotate(P.lean);
    // ── 굴뚝 (등 뒤) ──
    for (const s of [-1, 1]) {
      const cx = s * 64, cy = -222 + breath;
      put(ctx, A.chimney, cx, cy, s * 0.06);
      if (!fl) {
        const k = 0.5 + P.chim * 0.5, fk = 0.7 + Math.sin(t * 13 + s) * 0.15;
        const cracked = f1 && s < 0;
        glowE(ctx, cx, cy - 140, 26, 16, cracked ? '#ff4020' : FIRE, 0.7 * k);
        flame(ctx, cx, cy - 132, 20 * fk * (cracked ? 0.6 : 1), (60 + 70 * P.chim) * fk * (cracked ? 0.6 : 1), t, s);
        if (cracked) { ctx.strokeStyle = 'rgba(255,120,40,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx - 6, cy - 110); ctx.lineTo(cx + 2, cy - 90); ctx.lineTo(cx - 3, cy - 70); ctx.stroke(); }
      }
    }
    // ── 집게 팔 (뒤쪽, −x) ──
    this.drawArm(ctx, A, -1, P.ta, P.te, P, breath);
    // ── 허벅지 (용암 속으로) ──
    for (const s of [-1, 1]) btube(ctx, s * 44, -78, s * 60, 6, 32, 26);
    // ── 화로 속 (구멍 뒤): 불 · 짓눌린 영혼 ──
    const [fx, fy, frx, fry] = FURN;
    const heat = this.heat, gk = this.grateK;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(fx, fy + breath, frx + 2, fry + 2, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = fl ? '#fff' : LG(ctx, 'mo_furn', 0, fy - fry, 0, fy + fry, [0, '#ffe890', 0.35, '#ff9a30', 0.75, '#c03a08', 1, '#4a0a00']);
    ctx.fillRect(fx - frx - 4, fy - fry - 4 + breath, frx * 2 + 8, fry * 2 + 8);
    if (!fl) {
      for (let i = 0; i < 3; i++) {
        const sx = fx - 22 + i * 22 + Math.sin(t * 1.7 + i * 2) * 3, sy = fy - 6 + (i === 1 ? 12 : 0) + Math.sin(t * 2.3 + i) * 3 + breath;
        put(ctx, A.souls[i], sx, sy, Math.sin(t * 1.3 + i) * 0.12, 0.95 + (i === 1 ? 0.1 : 0));
        glow(ctx, sx - 4, sy - 3, 5, '#ff4020', 0.8); glow(ctx, sx + 4, sy - 3, 5, '#ff4020', 0.8);
      }
      glowE(ctx, fx, fy + fry * 0.4 + breath, frx, fry * 0.6, HOT, 0.35 + heat * 0.45 + Math.sin(t * 9) * 0.05);
    }
    ctx.restore();
    // ── 몸통 ──
    put(ctx, A.torso, 0, breath);
    // ── 창살 (열리면 위로 말려 들어간다) ──
    ctx.save();
    ctx.beginPath(); ctx.ellipse(fx, fy + breath, frx + 1, fry + 1, 0, 0, TAU); ctx.clip();
    const top = fy - fry - 2 + breath, len = (fry * 2 + 4) * (1 - gk * 0.92);
    for (let i = 0; i < 6; i++) {
      const bx = fx - 35 + i * 14;
      ctx.fillStyle = fl ? '#fff' : LG(ctx, 'mo_bar', -4, 0, 4, 0, [0, '#1a1210', 0.4, '#8a7a70', 1, '#0e0806']);
      ctx.save(); ctx.translate(bx, 0); ctx.fillRect(-3.5, top, 7, len); ctx.restore();
      if (!fl && heat > 0.4) { ctx.fillStyle = rgba('#ff8a30', (heat - 0.4) * 0.8); ctx.fillRect(bx - 1.5, top, 3, len); }
    }
    if (!fl) { ctx.fillStyle = '#140a04'; ctx.fillRect(fx - 44, top + len - 4, 88, 6); }
    ctx.restore();
    if (!fl && gk > 0.3) glowE(ctx, fx, fy + breath, frx * 1.5, fry * 1.4, HOT, 0.3 * gk + Math.sin(t * 20) * 0.05);
    // ── 가슴의 사슬 (목에 건 굵은 사슬) ──
    chain(ctx, A, -74, -236 + breath, 74, -236 + breath, 64, 14, this.chainSw * 0.3);
    // ── 앞치마 ──
    ctx.save(); ctx.translate(0, -62 + breath); ctx.transform(1, 0, Math.sin(t * 1.1) * 0.04 - this.vx * 0.0015 * tk, 1, 0, 0);
    put(ctx, A.loin, 0, 0);
    ctx.restore();
    // ── 머리 + 뿔 ──
    ctx.save();
    ctx.translate(0, HEAD_Y + this.headBob() + breath);
    ctx.rotate(P.tilt + Math.sin(t * 0.8) * 0.02);
    ctx.scale(HEAD_S, HEAD_S);
    for (const s of [-1, 1]) {
      if (f2) put(ctx, A.stump, s * 32, -74, 0, s, 1);
      else put(ctx, A.horn, s * 30, -74, 0, s, 1);
    }
    if (!fl) {
      if (f2) for (const s of [-1, 1]) { glow(ctx, s * 58, -80, 14, HOT, 0.8); if (Math.random() < 0.15) this.world.fx.emit('fire', this.cx + this.turnK * s * 58 * HEAD_S, this.bottom + HEAD_Y - 80 * HEAD_S, { speed: 30, angle: PI / 2, spread: 0.3, size: 4, grav: 600 }); }
    }
    put(ctx, A.head, 0, 0);
    if (!fl) {
      const eg = 0.7 + P.roar * 0.3 + (f2 ? 0.3 : 0);
      for (const s of [-1, 1]) {
        glow(ctx, s * 18, -52, 16 + P.roar * 6, '#ff4020', eg * 0.8);
        ctx.fillStyle = f2 ? '#fff4c0' : '#ffb040'; ctx.beginPath(); ctx.ellipse(s * 18, -52, 5, 2.4, s * -0.25, 0, TAU); ctx.fill();
      }
      if (P.roar > 0.2) { glowE(ctx, 0, 10, 20, 8 + P.roar * 6, FIRE, P.roar * 0.8); }
      cracksPath(ctx, A.cracks.head, dmg, '#ff9a3a');
      // 쇳물 침
      const dk = (t * 0.6) % 1;
      ctx.strokeStyle = 'rgba(255,170,60,0.9)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(-10, 12 + dk * 22); ctx.stroke();
      glow(ctx, -10, 12 + dk * 22, 5, HOT, 0.8);
    }
    ctx.restore();
    // ── 망치 팔 (앞, +x) ──
    this.drawArm(ctx, A, 1, P.ha, P.he, P, breath);
    // ── 팔목 사슬 ──
    if ((this.world.fx?.quality ?? 1) > 0.55) {
      const J = armJoints(1, P.ha, P.he), K = armJoints(-1, P.ta, P.te);
      chain(ctx, A, J.wx - 6, J.wy + breath, J.wx - 20, J.wy + 150 + breath, 0, 10, this.chainSw);
      chain(ctx, A, K.wx + 6, K.wy + breath, K.wx + 24, K.wy + 130 + breath, 0, 9, -this.chainSw);
    }
    // ── 균열 (피해에 따라) ──
    if (!fl) cracksPath(ctx, A.cracks.body, dmg, '#ff8a2a', breath);
    if (!fl && f2) {
      ctx.strokeStyle = 'rgba(255,200,90,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-30, -250 + breath); ctx.lineTo(-12, -226 + breath); ctx.lineTo(-20, -210 + breath); ctx.lineTo(4, -196 + breath); ctx.stroke();
      glowE(ctx, -12, -222 + breath, 30, 24, FIRE, 0.5);
    }
    // ── 용암 웅덩이 (허리 아래가 잠긴 자리) ──
    ctx.restore();
    ctx.save();
    ctx.translate(x, this.bottom);
    if (!fl) {
      put(ctx, A.pool, 0, 2, 0, 1 + Math.sin(t * 1.2) * 0.02, 1);
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.7 + i * 0.25) % 1, bx = Math.sin(i * 7.3 + Math.floor(t * 0.7 + i * 0.25) * 3) * 120;
        glow(ctx, bx, -2 - k * 6, 8 + k * 10, HOT, (1 - k) * 0.7);
      }
    }
    ctx.restore();
  }
  /** 팔 한 쪽 (s = +1 망치 · −1 집게) */
  drawArm(ctx, A, s, a, e, P, breath) {
    const J = armJoints(s, a, e);
    const sy = J.sy + breath, ey = J.ey + breath, wy = J.wy + breath;
    btube(ctx, J.sx, sy, J.ex, ey, 26, 21);
    btube(ctx, J.ex, ey, J.wx, wy, 22, 17);
    // 이두근 덩어리 · 무쇠 팔찌(가시)
    const ua = Math.atan2(ey - sy, J.ex - J.sx), fa = Math.atan2(wy - ey, J.wx - J.ex);
    ctx.save(); ctx.translate(lerp(J.sx, J.ex, 0.45), lerp(sy, ey, 0.45)); ctx.rotate(ua);
    ctx.beginPath(); ctx.ellipse(0, s * -6, 30, 20, 0, 0, TAU);
    ctx.fillStyle = R.fl ? '#fff' : LG(ctx, 'mo_bic', 0, -26, 0, 14, [0, '#ffe0a0', 0.3, '#b08040', 0.75, '#5a3814', 1, '#241206']);
    if (!R.fl) { ctx.strokeStyle = '#140802'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fill();
    if (!R.fl) { ctx.strokeStyle = 'rgba(255,150,60,0.55)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-18, s * -2); ctx.bezierCurveTo(-6, s * -12, 4, s * 2, 18, s * -8); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.translate(lerp(J.ex, J.wx, 0.72), lerp(ey, wy, 0.72)); ctx.rotate(fa);
    ctx.fillStyle = R.fl ? '#fff' : LG(ctx, 'mo_brc', 0, -22, 0, 22, [0, '#8a7a70', 0.4, '#2a201a', 1, '#0e0806']);
    ctx.fillRect(-14, -21, 28, 42);
    if (!R.fl) {
      ctx.strokeStyle = '#060302'; ctx.lineWidth = 2; ctx.strokeRect(-14, -21, 28, 42);
      for (const k of [-8, 8]) for (const q of [-1, 1]) { ctx.fillStyle = '#c8b8a8'; ctx.beginPath(); ctx.arc(k, q * 15, 2.2, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#d8c8b8';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 9 - 4, -21); ctx.lineTo(i * 9, -34); ctx.lineTo(i * 9 + 4, -21); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#140802'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    ctx.restore();
    if (!R.fl) {
      ctx.fillStyle = LG(ctx, 'mo_elb', 0, -12, 0, 12, [0, '#ffe0a0', 0.5, '#8a6030', 1, '#2a1606']);
      ctx.save(); ctx.translate(J.ex, ey); ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = '#140802'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#e8d0a0'; ctx.beginPath(); ctx.moveTo(-5, -8); ctx.lineTo(s * 16, -18); ctx.lineTo(5, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const dirF = canvasAng(s, J.b);
    if (s > 0) {
      // 망치: 자루(나무+쇠띠) → 머리
      const hd = canvasAng(1, P.hd);
      const hx = J.wx + Math.cos(hd) * HAFT, hy = wy + Math.sin(hd) * HAFT;
      const bx = J.wx - Math.cos(hd) * 24, by = wy - Math.sin(hd) * 24;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = R.fl ? '#fff' : '#140802'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
      if (!R.fl) {
        ctx.strokeStyle = '#5a3418'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,210,150,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, by - 2); ctx.lineTo(hx, hy - 2); ctx.stroke();
        ctx.strokeStyle = '#3a3230'; ctx.lineWidth = 11;
        ctx.beginPath();
        for (const k of [0.25, 0.55, 0.85]) { const cx = lerp(bx, hx, k), cy = lerp(by, hy, k); ctx.moveTo(cx - Math.cos(hd) * 4, cy - Math.sin(hd) * 4); ctx.lineTo(cx + Math.cos(hd) * 4, cy + Math.sin(hd) * 4); }
        ctx.stroke();
      }
      ctx.lineCap = 'round';
      put(ctx, A.hammer, hx, hy, hd - PI / 2);
      if (!R.fl && this.hamGlow > 0) glow(ctx, hx, hy, 60, HOT, this.hamGlow * 0.8);
      put(ctx, A.fist, J.wx, wy, dirF, 1, Math.cos(dirF) < 0 ? -1 : 1);
    } else {
      put(ctx, A.fist, J.wx, wy, dirF, 1, Math.cos(dirF) < 0 ? -1 : 1);
      // 집게: 손에 들었거나(날아가지 않았을 때) 사슬 끝에
      const T = this.tongs;
      if (T) {
        const lx = (T.x - this.cx) / (Math.abs(this.turnK) < 0.18 ? Math.sign(this.turnK || 1) * 0.18 : this.turnK), ly = T.y - this.bottom - this.sink;
        chainLine(ctx, J.wx, wy, lx, ly, 30, this.t);
        const op = T.open * 0.5;
        put(ctx, A.jaw, lx - 40, ly, -op); put(ctx, A.jaw, lx - 40, ly, op, 1, -1);
        if (!R.fl) glow(ctx, lx + 40, ly, 30, HOT, 0.8);
      } else {
        const td = canvasAng(-1, P.td), op = P.tongOpen * 0.45;
        put(ctx, A.jaw, J.wx, wy, td - op); put(ctx, A.jaw, J.wx, wy, td + op, 1, -1);
        if (!R.fl) glow(ctx, J.wx + Math.cos(td) * 84, wy + Math.sin(td) * 84, 14 + P.tongOpen * 10, HOT, 0.6 + P.tongOpen * 0.3);
      }
    }
  }
  paintFront(ctx) {
    if (R.fl || !(this.pourK > 0.02)) return;
    // 창살에서 앞쪽 바닥으로 흘러내리는 쇳물 줄기
    const G = this.grateP(), f = this.facing, F = this.A.floor, k = this.pourK;
    const x0 = G.x + f * 30, y0 = G.y + 30, x1 = G.x + f * 150, y1 = F - 8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const [lw, c, a] of [[26, FIRE, 0.45], [12, HOT, 0.8], [4, '#ffffff', 0.9]]) {
      ctx.strokeStyle = rgba(c, a * k); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + f * 90, y0 + 10 + Math.sin(this.t * 12) * 4, x1, y1); ctx.stroke();
    }
    ctx.restore();
  }
}

// ───────────────────────── 기타 그리기 ─────────────────────────
/** 굴뚝 불기둥: 흔들리는 세 갈래 불꽃 */
function flame(ctx, x, y, w, h, t, s) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const ph = t * (8 + i * 3) + s * 2 + i * 1.7, hh = h * (0.7 + 0.3 * Math.sin(ph)), ww = w * (1 - i * 0.25), sw = Math.sin(ph * 0.7) * 8;
    ctx.fillStyle = rgba(i === 2 ? '#fff4c0' : i === 1 ? HOT : FIRE, 0.55 - i * 0.08);
    ctx.beginPath();
    ctx.moveTo(x - ww, y);
    ctx.quadraticCurveTo(x - ww * 0.7 + sw, y - hh * 0.5, x + sw * 1.5, y - hh);
    ctx.quadraticCurveTo(x + ww * 0.7 + sw, y - hh * 0.5, x + ww, y);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
/** 쇳물 웅덩이 (퍼졌다가 굳는다) */
function lavaPuddle(ctx, x, F, w, age, dur, time) {
  if (R.fl) return;
  const spread = clamp(age / 0.35, 0, 1), cool = clamp((age - dur + 0.8) / 0.8, 0, 1);
  const cx = x + w / 2, rw = (w / 2) * (0.4 + 0.6 * spread);
  ctx.save();
  ctx.fillStyle = `rgba(110,24,4,${(0.9 * (1 - cool * 0.6)).toFixed(3)})`;
  ctx.beginPath(); ctx.ellipse(cx, F - 5, rw, 13, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(40,8,0,${(0.7).toFixed(2)})`; ctx.lineWidth = 3; ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  glowE(ctx, cx, F - 8, rw * 1.05, 26, FIRE, 0.8 * (1 - cool));
  glowE(ctx, cx, F - 5, rw * 0.75, 9, HOT, 0.75 * (1 - cool));
  for (let i = 0; i < 4; i++) {
    const k = (time * 1.3 + i * 0.27) % 1, bx = cx + Math.sin(i * 5.1 + Math.floor(time * 1.3 + i * 0.27) * 2.3) * rw * 0.8;
    glow(ctx, bx, F - 6 - k * 10, 5 + k * 8, HOT, (1 - k) * 0.8 * (1 - cool));
  }
  ctx.restore();
}
/** 화로 광선 (선분 불줄기) */
function flameBeam(ctx, L, t) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  const fl = 1 + Math.sin(t * 40) * 0.08;
  for (const [lw, c, a] of [[L.th * 2.2 * fl, FIRE, 0.35], [L.th * 1.2 * fl, '#ff9a3a', 0.6], [L.th * 0.45, HOT, 0.9], [L.th * 0.15, '#ffffff', 0.9]]) {
    ctx.strokeStyle = rgba(c, a); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
  }
  const n = 6;
  for (let i = 0; i < n; i++) {
    const k = ((t * 2.5 + i / n) % 1), x = lerp(L.x0, L.x1, k), y = lerp(L.y0, L.y1, k);
    glow(ctx, x, y + Math.sin(t * 20 + i) * 6, L.th * (1.2 + k), '#ffb050', 0.5);
  }
  glow(ctx, L.x0, L.y0, 70, HOT, 0.9, true);
  ctx.restore();
}
/** 사슬 기둥 (솟구친 뒤 우상 쪽으로 당겨지는 사슬) */
function chainColumn(ctx, x, F, h, age, ix, iy) {
  const A = ART;
  const k = clamp(age / 0.12, 0, 1), top = F - h * k;
  if (!R.fl) glowE(ctx, x, F - 10, 50, 14, FIRE, 0.6);
  if (A?.linkA) {
    const n = Math.max(2, Math.floor((F - top) / 14));
    for (let i = 0; i < n; i++) put(ctx, i % 2 ? A.linkA : A.linkB, x + Math.sin(age * 20 + i) * 1.5, F - 7 - i * 14, PI / 2, 1.1);
    if (age > 0.12) chainLine(ctx, x, top + 10, ix, iy, 40 * Math.max(0, 1 - age), age);
  }
  // 갈고리
  ctx.save(); ctx.translate(x, top);
  ctx.strokeStyle = R.fl ? '#fff' : '#1a1210'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -6); ctx.arc(-9, -6, 9, 0, -PI * 1.2, true); ctx.stroke();
  if (!R.fl) { ctx.strokeStyle = '#ff9a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -6); ctx.arc(-9, -6, 9, 0, -PI * 1.2, true); ctx.stroke(); }
  ctx.restore();
}
function cracksPath(ctx, list, k, col, oy = 0) {
  if (!(k > 0.02)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  let n = 0;
  for (const c of list) {
    if (c.th > k) continue;
    const P = c.pts;
    ctx.moveTo(P[0], P[1] + oy);
    for (let i = 2; i < P.length; i += 2) ctx.lineTo(P[i], P[i + 1] + oy);
    n++;
  }
  if (n) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(20,6,0,0.8)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ff4a08', 0.75); ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.45); ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.restore();
}
/** 유도 영혼 탄 (원점 = 탄 중심) */
function soulRender(ctx, p) {
  const a = Math.atan2(p.vy, p.vx), t = p.t;
  glowE(ctx, -Math.cos(a) * 16, -Math.sin(a) * 16, 26, 14, SOUL, 0.35);
  glow(ctx, 0, 0, 26, '#ffb050', 0.6);
  const S = ART?.souls?.[Math.floor(p.t * 3) % 3];
  if (S) put(ctx, S, 0, 0, Math.sin(t * 6) * 0.2, 0.6);
  else { ctx.fillStyle = SOUL; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill(); }
  glow(ctx, -3, -2, 4, '#ff4020', 0.9); glow(ctx, 3, -2, 4, '#ff4020', 0.9);
}
