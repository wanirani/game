// 보스 b_behemoth — 베헤모스, 부패한 대지의 짐승 (s19 '베헤모스의 늪') — world2 §6.7. 소유: BOSS-P2-3
// BossC(c_common.js) 상속 — 패턴 이름은 계약 (P2_PATTERNS.b_behemoth):
//   공격  charge · roots · sporeBurst · stomp · queenThorns(P2+) · husks(P2+) · rotBreath(P3) · bloom(P3)
//   전환  phase1 (60%, 1.4초: 균사의 여왕이 깨어난다) · phase2 (30%, 1.6초: 여왕의 비명, 두개골이 갈라지고 버섯이 부푼다)
//   보조  kneel (돌진이 벽에 부딪혀 2.5초 무릎 꿇음 — 여왕이 바닥−150 까지 내려온다) · stun (옆구리 주머니 셋을 모두 터뜨리면 4초, 뒤에 다시 자란다)
// 몸: 산 같은 썩은 멧돼지-하마. 등에 죽은 나무와 창백한 거대 버섯, 얼굴 반쪽은 드러난 두개골, 찢긴 옆구리의 갈비뼈 사이에
//     맥동하는 포자 주머니 셋, 척추에 녹아 붙은 창백한 균사의 여왕. 판정 몸통 340×230 (그림은 훨씬 크다).
//     중력 없이 바닥(A.floor)에 발을 딛고 직접 움직인다 — 둔덕(30–33 · 56–59열)은 다리가 넘어 딛는다 (몸은 그대로, 발만 둔덕 위).
//     등장 자리가 둔덕과 겹치면(0.72 지점 = 56–59열) 가까운 평평한 자리로 옮긴다 (MAPS-P2-C 요청: 가운데 67열 이상).
//     대기 중에는 플레이어 쪽으로 60px/s 이하로 걸어오고, 뒤로 돌 때는 몸을 종이처럼 뒤집는다(그림만).
// 판정 부위: 여왕 50×90 (P1 1.2 잠듦 → P2 부터 0.55) · 옆구리 주머니 ×3 50×50 (0.8, 각 최대 체력 2.5%) · 두개골 70×70 (1.0) · 몸통 (1.6).
//   접촉: 몸통 340×230 + 머리 (위쪽 '=' 발판(10행 = 바닥−288)에 선 플레이어는 닿지 않는다: 포효 · 앞발 치켜들기로 머리가 솟아도
//   머리 접촉 윗면은 바닥−HEAD_TOP 에서 자른다). 돌진 중에는 몸을 따라가는 지대(mv 1.8)가 맡는다.
// 그림: 벡터 (2부 기준). 가죽 몸통(이끼·균열·선반버섯·찢긴 옆구리 갈비뼈) · 두개골 반쪽 머리 · 아래턱 · 죽은 나무 셋 · 버섯 둘은
//   보스 등장 때 한 번 굽고(모듈 캐시, 흰 판 = 피격 섬광), 다리 · 꼬리 · 포자 주머니 · 여왕 · 뿌리 · 이끼 늘어짐 · 상처는 매 프레임 그린다.
//   피해 단계: 체력이 줄수록 몸통에 깊은 상처가 벌어지고, P2 에는 가운데 나무가 부러지고 여왕이 눈을 뜨며, P3 에는 뒤쪽 나무도
//   부러지고 두개골이 갈라지며 버섯이 부풀어 빛난다. 사망: 여왕이 시들어 떨어지고, 짐승은 길게 신음하며 눕고, 등에 새싹이 핀다.
// 채색 아트(ART-BOSS-8, W3)가 읽을 상태: bx (몸 가운데) · by (= 바닥) · facing · turnK (그림 좌우 −1~1) · pose {rear, kneel, slump, lie,
//   roar, headDown, scrape, breath, qRaise, pulse} · bodyA · drop · headA · jawK · legs[{hip, knee, foot}] (몸 지역) · sacs[{alive, grow, x, y}] ·
//   queenAwake · dmgStage (0~2) · kneeling · stunned · rushing · qFall (사망 때 떨어지는 여왕) · bloomK (사망 새싹 0~1) · dieT
import { BossC, telegraph, warnText, strikeFloor, groundWave, sporeCloud, sporePod, spawnMinion, minionsAlive } from './c_common.js';
import { PI, R, C, LG, ink, glow, glowE, glowSprite, warnRect, warnFloor, impact, hash, tube, ownHit } from './b_common.js';
import { Entity } from '../entity.js';
import { T } from '../../core/physics.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, lerp, rand, approach, rgba, mix } from '../../core/math.js';
import { registerPainted, hasPainted } from '../../render/painted/registry.js';   // [hook:art-boss-7] 채색 퍼핏 등록 (그리기 전용)
import { bosses as ART7 } from '../../render/painted/reg/art-boss-7.js';   // [hook:art-boss-7]

// ───────────────────────── 색 · 치수 ─────────────────────────
const TS = 48;
const HIDE = '#3e4028', HIDE_D = '#16170c', MOSS = '#56702a', BONE = '#ddd3b4', BONE_D = '#6e6450', FLESH = '#5a1c1a';
const SAC = '#c8d88a', SPORE = '#b8e04a', GLOW = '#9ad040', QUEEN = '#e6e2d4', QUEEN_D = '#8a8872', HOOF = '#1e1812', GOO = '#8ab83a';
const POSE0 = { rear: 0, kneel: 0, slump: 0, lie: 0, roar: 0, headDown: 0, scrape: 0, breath: 0, qRaise: 0, pulse: 0 };
const POSE_RATE = { rear: 7, kneel: 5, slump: 4, lie: 1.6, roar: 7, headDown: 5, scrape: 9, breath: 6, qRaise: 6, pulse: 8 };
const PIVOT = [-150, -178];             // 몸 기울기 중심 (뒷다리 엉덩이)
const NECK = [190, -218];               // 머리 관절 (몸 지역)
const QBASE = [80, -318];               // 여왕이 붙은 자리 (어깨 혹)
/** 다리 넷: 엉덩이(몸 지역) · 발 기본 x · 걸음 위상 · 가까운 쪽 · 무릎 방향(1 = 앞, −1 = 뒤) */
const LEGS = [
  { id: 'FF', hip: [112, -182], fx: 118, ph: PI, near: 0, side: 1 },
  { id: 'BF', hip: [-168, -184], fx: -164, ph: 0, near: 0, side: -1 },
  { id: 'FN', hip: [130, -176], fx: 136, ph: 0, near: 1, side: 1 },
  { id: 'BN', hip: [-150, -178], fx: -146, ph: PI, near: 1, side: -1 },
];
/** 싸움 중 새 캔버스 0 (MASTER_PLAN §5.2): 이 보스와 그 공격이 쓰는 발광(b_common glowSprite) · 조명(lighting 색광) 색을 등장 때 모두 굽는다 */
const GLOW_WARM = [GLOW, SPORE, '#e8ff90', '#ffffff', '#c8ff6a', '#6a8a2a', '#3a5a10', MOSS, '#b8d060', '#e8ffb0', '#c8e060', '#8ab82e', '#e0c080', '#e8ffd0', '#fff0f8'];
const LIGHT_WARM = [GLOW, SPORE, '#e8ffd0', '#fff0f8', '#c8ff6a'];
const LU = 94, LL = 88;                 // 다리 뼈 길이 (위 · 아래)
const HEAD_TOP = 280;                   // 머리 접촉 윗면 한계 (바닥 위 px): s19 '=' 발판 윗면 바닥−288 보다 아래
const SACS = [[-104, -208], [-36, -196], [32, -214]];
const GASHES = [
  [0.2, [[-200, -250], [-178, -238], [-160, -244], [-138, -230]]],
  [0.45, [[120, -270], [138, -250], [132, -232], [150, -214]]],
  [0.7, [[-230, -190], [-212, -206], [-190, -198], [-176, -214], [-160, -206]]],
];
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
function put(ctx, S, x, y, rot = 0, sx = 1, sy = sx) {
  if (!S || !sx || !sy) return;
  const img = R.fl ? S.f : S.c;
  if (!rot && sx === 1 && sy === 1) { ctx.drawImage(img, x - S.ox, y - S.oy, S.w, S.h); return; }
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.drawImage(img, -S.ox, -S.oy, S.w, S.h);
  ctx.restore();
}
function bakeScale(world) {
  const s = world?.game?.scale, z = world?.camera?.zoomTarget ?? 0.88;
  const k = Number.isFinite(s) && s > 0 ? s * z * 1.1 : 1.25;
  return clamp(Math.round(k * 2) / 2, 1, 2);
}
function ensureArt(world) {
  const K = bakeScale(world);
  if (ART && ART.K >= K) return ART;
  try { ART = bakeArt(K); } catch (e) { console.error('[behemoth] 굽기 실패', e); }
  return ART;
}
function linG(g, x0, y0, x1, y1, st) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < st.length; i += 2) gr.addColorStop(st[i], st[i + 1]); return gr; }
function radG(g, x0, y0, r0, x1, y1, r1, st) { const gr = g.createRadialGradient(x0, y0, r0, x1, y1, r1); for (let i = 0; i < st.length; i += 2) gr.addColorStop(st[i], st[i + 1]); return gr; }
function bakeArt(K) {
  return {
    K,
    torso: mk(K, 510, 260, 272, 350, drawTorsoArt),
    head: mk(K, 225, 180, 44, 100, drawHeadArt),
    jaw: mk(K, 160, 80, 16, 64, drawJawArt),
    trees: [mk(K, 180, 320, 90, 305, (g) => drawTreeArt(g, 1, 240)), mk(K, 200, 350, 100, 335, (g) => drawTreeArt(g, 2, 290)), mk(K, 170, 270, 85, 255, (g) => drawTreeArt(g, 3, 200))],
    mush: [mk(K, 170, 140, 85, 132, (g) => drawMushArt(g, 1, 62, 92)), mk(K, 120, 100, 60, 94, (g) => drawMushArt(g, 2, 40, 60))],
  };
}

/** 몸통 윤곽 (몸 지역, 오른쪽이 머리) */
function torsoPath(g) {
  g.beginPath();
  g.moveTo(-238, -250);
  g.bezierCurveTo(-222, -284, -170, -296, -110, -304);
  g.bezierCurveTo(-40, -312, 30, -318, 80, -326);
  g.bezierCurveTo(128, -326, 170, -306, 200, -266);
  g.bezierCurveTo(214, -238, 214, -196, 196, -168);
  g.bezierCurveTo(178, -140, 140, -126, 90, -122);
  g.bezierCurveTo(20, -114, -60, -112, -130, -124);
  g.bezierCurveTo(-190, -132, -234, -152, -252, -196);
  g.bezierCurveTo(-258, -220, -250, -240, -238, -250);
  g.closePath();
}
/** 몸통: 이끼 낀 나무껍질 같은 가죽 · 균열 · 선반버섯 · 찢긴 옆구리(갈비뼈) · 척추 가시 · 혹 */
function drawTorsoArt(g) {
  // 척추 가시 (몸통 뒤)
  for (let i = 0; i < 10; i++) {
    const u = i / 9, x = -210 + u * 360, y = -300 - Math.sin(u * PI) * 22 + (u > 0.8 ? (u - 0.8) * 180 : 0), L = 16 + Math.sin(u * PI) * 14 + h01(i) * 8;
    g.beginPath(); g.moveTo(x - 7, y + 6); g.lineTo(x + 3 - L * 0.2, y - L); g.lineTo(x + 8, y + 6); g.closePath();
    g.fillStyle = linG(g, x, y - L, x, y + 6, [0, '#f0e8cc', 1, BONE_D]); g.fill();
    g.strokeStyle = '#0c0a06'; g.lineWidth = 1.4; g.stroke();
  }
  torsoPath(g);
  g.fillStyle = linG(g, -120, -330, 60, -110, [0, '#6a6a44', 0.35, HIDE, 0.75, '#282a18', 1, HIDE_D]); g.fill();
  g.save(); torsoPath(g); g.clip();
  // 아래쪽 그림자 · 위쪽 따뜻한 빛 · 뒤쪽 차가운 역광
  g.fillStyle = linG(g, 0, -170, 0, -110, [0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,0.55)']); g.fillRect(-270, -170, 500, 70);
  g.fillStyle = radG(g, 40, -300, 10, 40, -300, 170, [0, 'rgba(255,230,160,0.22)', 1, 'rgba(255,230,160,0)']); g.fillRect(-270, -340, 500, 230);
  g.fillStyle = linG(g, -260, 0, -200, 0, [0, 'rgba(150,180,255,0.35)', 1, 'rgba(150,180,255,0)']); g.fillRect(-270, -340, 70, 230);
  // 나무껍질 같은 균열 결
  g.strokeStyle = 'rgba(10,10,4,0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 90; i++) {
    const x = -250 + h01(i * 1.7) * 450, y = -320 + h01(i * 3.3) * 200, L = 6 + h01(i * 5.1) * 16;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + L * 0.9, y + (h01(i) - 0.5) * 6); g.lineTo(x + L * 1.3, y + (h01(i * 2) - 0.5) * 10); g.stroke();
  }
  g.strokeStyle = 'rgba(160,160,110,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 50; i++) { const x = -250 + h01(i * 7.3) * 450, y = -320 + h01(i * 2.9) * 200; g.beginPath(); g.moveTo(x, y + 1.5); g.lineTo(x + 10, y + 1.5); g.stroke(); }
  // 이끼 뭉치 (등 · 어깨)
  for (let i = 0; i < 16; i++) {
    const x = -220 + h01(i * 4.1) * 400, y = -318 + h01(i * 6.7) * 60 + Math.abs(x) * 0.05, r = 10 + h01(i * 2.3) * 18;
    g.fillStyle = radG(g, x, y, 0, x, y, r, [0, 'rgba(110,150,50,0.8)', 0.6, 'rgba(80,110,36,0.55)', 1, 'rgba(60,90,30,0)']);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // 지의류 반점
  for (let i = 0; i < 40; i++) { const x = -240 + h01(i * 9.9) * 430, y = -300 + h01(i * 4.4) * 170; g.fillStyle = h01(i) < 0.5 ? 'rgba(200,210,160,0.35)' : 'rgba(160,190,90,0.3)'; g.beginPath(); g.arc(x, y, 1.5 + h01(i * 3) * 3, 0, TAU); g.fill(); }
  // 선반버섯 (옆구리 뒤쪽)
  for (const [x, y, s] of [[-200, -214, 1], [-186, -196, 0.8], [-214, -232, 0.7], [150, -190, 0.9]]) {
    for (let k = 0; k < 3; k++) {
      const yy = y + k * 6 * s, w = (22 - k * 5) * s;
      g.beginPath(); g.ellipse(x, yy, w, 6 * s, 0, PI, TAU); g.fillStyle = linG(g, x, yy - 6, x, yy, [0, '#d8c8a0', 1, '#7a6440']); g.fill();
      g.strokeStyle = '#2a2010'; g.lineWidth = 1; g.stroke();
    }
  }
  // 찢긴 옆구리: 검붉은 속살 + 갈비뼈 + 균사 실
  const hole = () => {
    g.beginPath();
    g.moveTo(-150, -214);
    const P = [[-140, -244], [-110, -252], [-80, -246], [-50, -256], [-12, -248], [22, -256], [58, -246], [80, -226], [82, -196], [64, -168], [30, -164], [-6, -170], [-44, -162], [-84, -170], [-118, -168], [-144, -186]];
    for (const [x, y] of P) g.lineTo(x + (h01(x) - 0.5) * 4, y + (h01(y) - 0.5) * 4);
    g.closePath();
  };
  hole();
  g.fillStyle = radG(g, -36, -206, 10, -36, -206, 130, [0, '#8a2a24', 0.4, FLESH, 0.8, '#2a0a08', 1, '#120404']); g.fill();
  g.save(); hole(); g.clip();
  g.strokeStyle = 'rgba(160,50,40,0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 12; i++) { const x = -150 + i * 20; g.beginPath(); g.moveTo(x, -250); g.bezierCurveTo(x + 8, -220, x - 8, -196, x + 4, -164); g.stroke(); }
  g.strokeStyle = 'rgba(230,230,200,0.35)'; g.lineWidth = 0.8;
  for (let i = 0; i < 14; i++) { const x = -140 + h01(i * 3.7) * 210, y = -240 + h01(i * 1.3) * 60; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 14, y + 10, x + 24, y + 4); g.stroke(); }
  g.restore();
  for (let i = 0; i < 6; i++) {
    const x = -130 + i * 38, top = -252 + (i % 2) * 6;
    g.beginPath(); g.moveTo(x, top); g.bezierCurveTo(x + 14, top + 24, x + 10, top + 60, x + 2, -164);
    g.strokeStyle = '#0c0806'; g.lineWidth = 10; g.stroke();
    g.strokeStyle = linG(g, x - 5, 0, x + 12, 0, [0, BONE_D, 0.5, BONE, 1, '#8a8068']); g.lineWidth = 7; g.stroke();
    g.strokeStyle = 'rgba(255,250,230,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 3, top + 4); g.bezierCurveTo(x + 14, top + 26, x + 11, top + 56, x + 5, -170); g.stroke();
  }
  // 상처 가장자리: 찢어진 가죽 너덜
  hole(); g.strokeStyle = '#0e0a06'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#4a4a2e';
  for (let i = 0; i < 9; i++) { const x = -140 + i * 25, y = -252 + (i % 2) * 5; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 2, y + 10 + h01(i) * 10); g.lineTo(x + 8, y); g.closePath(); g.fill(); }
  // 엉덩이의 균사 혹
  g.fillStyle = radG(g, -226, -176, 2, -222, -176, 34, [0, '#e8e0c8', 0.5, '#b0a482', 1, '#5a5038']);
  g.beginPath(); g.ellipse(-224, -176, 30, 24, 0.3, 0, TAU); g.fill();
  g.strokeStyle = '#2a2414'; g.lineWidth = 1.5; g.stroke();
  for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(-230 + k * 6, -182 + (k % 2) * 8, 3, 0, TAU); g.fillStyle = 'rgba(190,230,110,0.5)'; g.fill(); }
  g.restore();
  torsoPath(g); g.strokeStyle = '#080804'; g.lineWidth = 3.2; g.stroke();
  // 배에서 늘어진 이끼 가닥
  g.strokeStyle = 'rgba(120,150,70,0.85)'; g.lineWidth = 2;
  for (let i = 0; i < 16; i++) { const x = -200 + i * 24 + h01(i) * 8, y = -124 + Math.abs(x) * 0.02, L = 10 + h01(i * 3) * 18; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3, y + L * 0.5, x - 1, y + L); g.stroke(); }
}
/** 머리 (아래턱 제외): 뒤쪽은 썩은 가죽, 앞쪽 반은 드러난 두개골 · 코뼈 · 윗니 · 짧은 윗엄니. 원점 = 목 관절 */
function headPath(g) {
  g.beginPath();
  g.moveTo(-14, -58); g.bezierCurveTo(10, -80, 60, -84, 100, -70);
  g.bezierCurveTo(130, -60, 158, -36, 170, -12);
  g.quadraticCurveTo(176, 4, 164, 16);
  g.lineTo(40, 26);
  g.bezierCurveTo(20, 38, -4, 44, -24, 32);
  g.bezierCurveTo(-36, 12, -34, -34, -14, -58);
  g.closePath();
}
function drawHeadArt(g) {
  headPath(g);
  g.fillStyle = linG(g, 0, -84, 0, 40, [0, '#6a6a46', 0.5, HIDE, 1, HIDE_D]); g.fill();
  // 앞쪽 반: 드러난 두개골
  g.save(); headPath(g); g.clip();
  g.beginPath(); g.moveTo(56, -90);
  const edge = [[62, -70], [52, -56], [64, -40], [54, -24], [66, -6], [58, 10], [62, 30]];
  for (const [x, y] of edge) g.lineTo(x, y);
  g.lineTo(200, 30); g.lineTo(200, -90); g.closePath();
  g.fillStyle = linG(g, 60, -80, 150, 20, [0, '#f4ecd2', 0.5, BONE, 1, '#8a7e62']); g.fill();
  // 뼈 봉합선 · 금 · 얼룩
  g.strokeStyle = 'rgba(80,70,50,0.6)'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(80, -76); g.lineTo(88, -60); g.lineTo(82, -48); g.lineTo(94, -36); g.moveTo(120, -64); g.lineTo(126, -50); g.lineTo(120, -40); g.stroke();
  for (let i = 0; i < 10; i++) { const x = 70 + h01(i * 3.1) * 90, y = -70 + h01(i * 7.3) * 80; g.fillStyle = 'rgba(90,70,40,0.25)'; g.beginPath(); g.ellipse(x, y, 4 + h01(i) * 5, 2 + h01(i * 2) * 3, h01(i) * 3, 0, TAU); g.fill(); }
  // 코 구멍 (길쭉한 검은 틈)
  g.fillStyle = '#0a0806'; g.beginPath(); g.moveTo(140, -30); g.quadraticCurveTo(160, -20, 162, -6); g.quadraticCurveTo(150, -12, 136, -24); g.closePath(); g.fill();
  // 가죽 쪽: 균열 · 이끼
  g.strokeStyle = 'rgba(10,10,4,0.5)'; g.lineWidth = 1.1;
  for (let i = 0; i < 16; i++) { const x = -28 + h01(i * 2.1) * 80, y = -70 + h01(i * 5.3) * 100; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10, y + (h01(i) - 0.5) * 6); g.stroke(); }
  for (let i = 0; i < 6; i++) { const x = -10 + h01(i * 4.4) * 60, y = -74 + h01(i * 8.8) * 30, r = 8 + h01(i) * 8; g.fillStyle = radG(g, x, y, 0, x, y, r, [0, 'rgba(110,150,50,0.8)', 1, 'rgba(60,90,30,0)']); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.restore();
  // 가죽이 찢겨 나간 가장자리 (너덜 · 구더기)
  g.strokeStyle = '#0e0a06'; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(56, -86); for (const [x, y] of edge) g.lineTo(x, y); g.stroke();
  g.fillStyle = '#5a1c1a'; for (const [x, y] of edge) { g.beginPath(); g.ellipse(x - 3, y, 3, 5, 0, 0, TAU); g.fill(); }
  g.fillStyle = '#e8e0c0'; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(52 + h01(i) * 10, -60 + i * 12, 2.2, 1.2, 0.6, 0, TAU); g.fill(); }
  // 빈 눈구멍 (경계에 걸쳐 있다 — 빛은 매 프레임)
  g.fillStyle = '#060404'; g.beginPath(); g.ellipse(76, -42, 16, 13, -0.2, 0, TAU); g.fill();
  g.strokeStyle = '#e8dcc0'; g.lineWidth = 2; g.beginPath(); g.ellipse(76, -42, 17, 14, -0.2, PI * 1.1, PI * 2.1); g.stroke();
  // 윗니 (뭉툭하고 부러진)
  for (let i = 0; i < 7; i++) {
    const x = 60 + i * 15, h = i === 3 ? 4 : 12 + h01(i) * 8;
    g.beginPath(); g.moveTo(x - 6, 20); g.lineTo(x - 5, 20 + h); g.quadraticCurveTo(x, 24 + h, x + 5, 20 + h); g.lineTo(x + 6, 20); g.closePath();
    g.fillStyle = linG(g, x, 20, x, 22 + h, [0, '#e8dcb8', 1, '#8a7a50']); g.fill(); g.strokeStyle = '#1a140a'; g.lineWidth = 1.2; g.stroke();
  }
  // 짧은 윗엄니
  g.beginPath(); g.moveTo(150, 14); g.quadraticCurveTo(176, 8, 180, -20); g.quadraticCurveTo(172, -2, 156, 22); g.closePath();
  g.fillStyle = linG(g, 150, 20, 180, -20, [0, '#c8bc98', 1, '#fff8e8']); g.fill(); g.strokeStyle = '#1a140a'; g.lineWidth = 1.4; g.stroke();
  // 찢긴 귀 · 머리 위 작은 버섯
  g.beginPath(); g.moveTo(-8, -62); g.quadraticCurveTo(-20, -96, 6, -90); g.lineTo(2, -80); g.lineTo(10, -74); g.closePath();
  g.fillStyle = '#4a3a28'; g.fill(); g.strokeStyle = '#0e0a06'; g.lineWidth = 1.5; g.stroke();
  for (const [x, y, r] of [[26, -80, 9], [40, -84, 6], [14, -78, 5]]) {
    g.fillStyle = '#d8ccb0'; g.fillRect(x - 1.5, y, 3, 8);
    g.beginPath(); g.ellipse(x, y, r, r * 0.55, 0, PI, TAU); g.fillStyle = linG(g, x, y - r, x, y, [0, '#f0e6d0', 1, '#8a6a58']); g.fill(); g.strokeStyle = '#2a1e14'; g.lineWidth = 1; g.stroke();
  }
  headPath(g); g.strokeStyle = '#080804'; g.lineWidth = 2.8; g.stroke();
}
/** 아래턱 (원점 = 턱 관절): 뒤는 가죽, 앞은 뼈. 아랫니 · 휘어 오른 큰 엄니 */
function drawJawArt(g) {
  const jaw = () => { g.beginPath(); g.moveTo(-6, -6); g.lineTo(118, 0); g.quadraticCurveTo(130, 6, 124, 18); g.quadraticCurveTo(80, 34, 10, 28); g.quadraticCurveTo(-14, 18, -6, -6); g.closePath(); };
  jaw(); g.fillStyle = linG(g, 0, -6, 0, 30, [0, '#5a5a3a', 1, HIDE_D]); g.fill();
  g.save(); jaw(); g.clip();
  g.fillStyle = linG(g, 50, 0, 120, 30, [0, BONE, 1, '#7a6e52']);
  g.beginPath(); g.moveTo(44, -10); g.lineTo(40, 6); g.lineTo(50, 14); g.lineTo(42, 34); g.lineTo(140, 34); g.lineTo(140, -10); g.closePath(); g.fill();
  g.restore();
  for (let i = 0; i < 6; i++) {
    const x = 36 + i * 14, h = 8 + h01(i * 2.7) * 8;
    g.beginPath(); g.moveTo(x - 5, 0); g.lineTo(x - 3, -h); g.lineTo(x + 3, -h + 2); g.lineTo(x + 5, 0); g.closePath();
    g.fillStyle = '#d8ccaa'; g.fill(); g.strokeStyle = '#1a140a'; g.lineWidth = 1; g.stroke();
  }
  // 큰 엄니 (금이 가 있다)
  g.beginPath(); g.moveTo(98, 2); g.bezierCurveTo(104, -30, 128, -46, 122, -60); g.bezierCurveTo(116, -52, 108, -38, 112, 6); g.closePath();
  g.fillStyle = linG(g, 100, 6, 124, -60, [0, '#b8ac88', 0.6, '#f4ecd4', 1, '#ffffff']); g.fill();
  g.strokeStyle = '#1a140a'; g.lineWidth = 1.6; g.stroke();
  g.strokeStyle = 'rgba(60,50,30,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(108, -14); g.lineTo(114, -20); g.lineTo(110, -28); g.stroke();
  jaw(); g.strokeStyle = '#080804'; g.lineWidth = 2.4; g.stroke();
}
/** 죽은 나무 (원점 = 뿌리 밑동): 뒤틀린 줄기 · 갈래 가지 · 늘어진 이끼 · 창백한 버섯 */
function drawTreeArt(g, seed, H) {
  const rnd = (i) => h01(seed * 17.3 + i * 3.7);
  // 뿌리
  g.strokeStyle = '#2a2014'; g.lineCap = 'round';
  for (let k = 0; k < 5; k++) { const a = PI * (0.1 + k * 0.2); g.lineWidth = 6 - k * 0.6; g.beginPath(); g.moveTo(0, -6); g.quadraticCurveTo(Math.cos(a) * 30, 4, Math.cos(a) * 52, 6 + rnd(k) * 6); g.stroke(); }
  // 가지 (재귀, 줄기 먼저)
  const segs = [];
  const branch = (x, y, a, len, w, d, i) => {
    const bend = (rnd(i) - 0.5) * 0.6;
    const x1 = x + Math.cos(a) * len * 0.5 + Math.cos(a + bend) * len * 0.5, y1 = y + Math.sin(a) * len * 0.5 + Math.sin(a + bend) * len * 0.5;
    segs.push([x, y, (x + x1) / 2 + Math.cos(a + PI / 2) * len * 0.12 * (rnd(i + 9) - 0.5), (y + y1) / 2, x1, y1, w, d]);
    if (d >= 4 || len < 18) return;
    const n = d === 0 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const na = a + (k - (n - 1) / 2) * (0.7 + rnd(i + k) * 0.4) + (rnd(i * 2 + k) - 0.5) * 0.3;
      branch(x1, y1, na, len * (0.55 + rnd(i + k * 5) * 0.2), w * 0.6, d + 1, i * 3 + k + 1);
    }
  };
  branch(0, 0, -PI / 2 + (rnd(1) - 0.5) * 0.3, H * 0.45, 20, 0, seed);
  for (const [x0, y0, cx, cy, x1, y1, w] of segs) {
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1);
    g.strokeStyle = '#0c0a06'; g.lineWidth = w + 2.5; g.stroke();
    g.strokeStyle = linG(g, x0 - w, 0, x0 + w, 0, [0, '#2a2418', 0.4, '#5a4c36', 1, '#1a160e']); g.lineWidth = w; g.stroke();
  }
  // 줄기 껍질 결 · 옹이 구멍
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
  for (let k = 0; k < 14; k++) { const s = segs[0], u = k / 14, x = lerp(s[0], s[4], u) + (rnd(k) - 0.5) * s[6] * 0.6, y = lerp(s[1], s[5], u); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd(k + 3) - 0.5) * 4, y - 10); g.stroke(); }
  const s0 = segs[0];
  g.fillStyle = '#050402'; g.beginPath(); g.ellipse(lerp(s0[0], s0[4], 0.4) + 2, lerp(s0[1], s0[5], 0.4), 4, 8, 0, 0, TAU); g.fill();
  // 늘어진 이끼 (가지 끝에서)
  for (const [, , , , x1, y1, w, d] of segs) {
    if (d < 2 || rnd(x1) < 0.4) continue;
    const L = 20 + rnd(y1) * 40;
    g.strokeStyle = 'rgba(150,170,110,0.75)'; g.lineWidth = 1.4;
    g.beginPath(); for (let q = 0; q < 3; q++) { g.moveTo(x1 + q * 2 - 2, y1); g.quadraticCurveTo(x1 + q * 3, y1 + L * 0.5, x1 + q * 2 - 3, y1 + L - q * 5); } g.stroke();
  }
  // 줄기의 창백한 버섯 셋
  for (let k = 0; k < 3; k++) {
    const u = 0.25 + k * 0.22, x = lerp(s0[0], s0[4], u) + (k % 2 ? 1 : -1) * s0[6] * 0.5, y = lerp(s0[1], s0[5], u), r = 7 - k;
    g.beginPath(); g.ellipse(x, y, r * 1.4, r * 0.6, 0, PI, TAU); g.fillStyle = '#e0d6bc'; g.fill(); g.strokeStyle = '#2a2014'; g.lineWidth = 1; g.stroke();
  }
}
/** 거대 버섯 (원점 = 대 밑동): 볼록한 갓 · 주름 · 빛나는 반점 · 핏줄 선 대 */
function drawMushArt(g, seed, r, h) {
  // 대
  g.beginPath(); g.moveTo(-r * 0.22, 0); g.quadraticCurveTo(-r * 0.3, -h * 0.5, -r * 0.18, -h); g.lineTo(r * 0.18, -h); g.quadraticCurveTo(r * 0.3, -h * 0.5, r * 0.22, 0); g.closePath();
  g.fillStyle = linG(g, -r * 0.3, 0, r * 0.3, 0, [0, '#8a8068', 0.5, '#e8dcc4', 1, '#6a604a']); g.fill(); g.strokeStyle = '#1e180e'; g.lineWidth = 1.6; g.stroke();
  g.strokeStyle = 'rgba(120,60,70,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-3, -4); g.bezierCurveTo(4, -h * 0.4, -5, -h * 0.6, 2, -h * 0.95); g.stroke();
  // 밑동 주머니
  g.beginPath(); g.ellipse(0, -2, r * 0.36, r * 0.12, 0, 0, TAU); g.fillStyle = '#b8ac8e'; g.fill(); g.stroke();
  // 주름 (갓 아래)
  g.beginPath(); g.ellipse(0, -h, r, r * 0.22, 0, 0, PI); g.fillStyle = '#6a5a48'; g.fill();
  g.strokeStyle = 'rgba(30,20,12,0.6)'; g.lineWidth = 1; g.beginPath();
  for (let k = 0; k < 14; k++) { const a = (k / 13) * PI; g.moveTo(0, -h + 2); g.lineTo(Math.cos(a) * r * 0.95, -h + Math.sin(a) * r * 0.2); } g.stroke();
  // 갓
  g.beginPath(); g.moveTo(-r, -h); g.bezierCurveTo(-r, -h - r * 0.9, r, -h - r * 0.9, r, -h); g.quadraticCurveTo(0, -h + r * 0.12, -r, -h); g.closePath();
  g.fillStyle = radG(g, -r * 0.3, -h - r * 0.6, 2, 0, -h - r * 0.3, r * 1.1, [0, '#fbf4e6', 0.5, '#e0d0b4', 1, '#8a6c5a']); g.fill();
  g.strokeStyle = '#1e160e'; g.lineWidth = 2; g.stroke();
  for (let k = 0; k < 9; k++) {
    const x = (h01(seed * 7 + k) - 0.5) * r * 1.5, y = -h - r * 0.15 - h01(seed * 3 + k) * r * 0.55, rr = 2 + h01(k + seed) * r * 0.08;
    g.fillStyle = 'rgba(140,90,120,0.55)'; g.beginPath(); g.ellipse(x, y, rr * 1.4, rr, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(200,255,140,0.5)'; g.beginPath(); g.arc(x, y, rr * 0.5, 0, TAU); g.fill();
  }
}

// ───────────────────────── 지형 ─────────────────────────
const solidT = (t) => t === T.SOLID || t === T.BREAK;
/** x 열에서 윗면이 (fromY − climb) 보다 아래인 첫 단단한 칸 윗면 (없으면 바닥) — 발이 둔덕 위를 딛게 */
function groundAt(world, A, x, fromY, climb = 180) {
  const m = world?.map;
  if (!m?.typeAt || !A) return A?.floor ?? fromY;
  const tx = Math.floor(x / TS), ty1 = Math.min((m.h ?? 999) - 1, Math.floor(A.floor / TS) + 1);
  for (let ty = Math.max(0, Math.ceil((fromY - climb) / TS)); ty <= ty1; ty++) if (solidT(m.typeAt(tx, ty))) return Math.min(ty * TS, A.floor);
  return A.floor;
}
/** 두 뼈 IK: 뿌리 → 끝, 관절이 side 쪽(1 = +x, −1 = −x)으로 굽는다. out = [kx, ky] */
function ikSide(ax, ay, bx, by, l1, l2, side, out) {
  const dx = bx - ax, dy = by - ay;
  const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
  const a = Math.atan2(dy, dx), off = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const k1 = a + off, k2 = a - off;
  const x1 = ax + Math.cos(k1) * l1, x2 = ax + Math.cos(k2) * l1;
  const k = (x1 - x2) * side > 0 ? k1 : k2;
  out[0] = ax + Math.cos(k) * l1; out[1] = ay + Math.sin(k) * l1;
  return out;
}

// ───────────────────────── 보스 ─────────────────────────
export class Behemoth extends BossC {
  setup() {
    // [hook:art-boss-7] 모음(reg/index.js)에 art-boss-7 줄이 아직 없으면 여기서 한 번 등록 (이미 있으면 아무것도 안 함). BossB.init 의 preloadPainted 보다 먼저 돈다
    if (!hasPainted?.('b_behemoth') && ART7?.b_behemoth) registerPainted?.('b_behemoth', { kind: 'boss', importer: ART7.b_behemoth });   // [hook:art-boss-7]
    ensureArt(this.world);
    this.noGravity = true;
    this.facing = -1; this.turnK = -1;
    this.pose = { ...POSE0 }; this.pt = { ...POSE0 };
    const A = this.A;
    this.bx = this.clearX(clamp(this.cx, A.x0 + 180, A.x1 - 180));
    this.by = A.floor;
    this.mvx = 0; this.gph = 0; this.moving = 0; this.stepAcc = 0;
    this.bodyA = 0; this.drop = 0; this.headA = 0; this.jawK = 0;
    this.kneeling = false; this.stunned = false; this.rushing = false; this.cdir = 1;
    this.queenAwake = false; this.queenAct = 0; this.queenGlow = 0; this.dmgStage = 0;
    this.dieT = 0; this.qFall = null; this.bloomK = 0; this.fxAcc = 0; this.pendStun = false; this.rockPending = false;
    const shp = Math.max(1, Math.round(this.stats.maxHp * 0.025));
    this.sacs = SACS.map(([x, y], i) => {
      const s = { i, lx: x, ly: y, hp: shp, max: shp, alive: true, grow: 1, hitT: 0, x: 0, y: 0 };
      s.part = { x: 0, y: 0, w: 50, h: 50, defMul: 0.8, sac: s, onHit: (part, dmg, atk) => { if (ownHit(atk)) this.hitSac(s, dmg); } };   // 수호신 자동 공격은 주머니를 깨지 않는다 (피해만 — BAL-RULES)
      return s;
    });
    this.legs = LEGS.map((d) => ({ ...d, hipL: [0, 0], kneeL: [0, 0], footL: [0, 0], fxw: 0, fyw: 0 }));
    this.pQueen = { x: 0, y: 0, w: 50, h: 90, defMul: 1.2, queen: true };
    this.pSkull = { x: 0, y: 0, w: 70, h: 70, defMul: 1.0, skull: true };
    this.pBody = { x: 0, y: 0, w: 1, h: 1, defMul: 1.6 };
    this.cBody = { x: 0, y: 0, w: 340, h: 230 }; this.cHead = { x: 0, y: 0, w: 130, h: 120 };
    this.headP = { x: 0, y: 0 }; this.mouthP = { x: 0, y: 0 }; this.queenP = { x: 0, y: 0 }; this.qHand = { x: 0, y: 0 };
    this._hp = []; this._cp = []; this._pt = { x: 0, y: 0 }; this._k = [0, 0];
    for (const c of GLOW_WARM) { glowSprite(c, false); glowSprite(c, true); }
    this._lw = 2;   // 조명 스프라이트(lighting.js 색광 캐시)도 첫 두 프레임에 화면 안 세기 0 광원으로 미리 굽는다
    this.place(); this.rig(); this.syncParts();
  }

  // ═════════════════════════════ 위치 ═════════════════════════════
  /**
   * 그림 전체(바라보는 쪽 머리 끝 330 · 반대쪽 꼬리 250) 아래에 바닥 위로 솟은 지형(둔덕)이 없는 가까운 자리 — 오른쪽을 먼저 찾는다.
   * s19: 기본 자리(0.72 → 64열)는 머리가 56–59열 둔덕에 걸린다 → 67열 (MAPS-P2-C 요청)
   */
  clearX(x) {
    const A = this.A, m = this.world?.map;
    if (!m?.typeAt) return x;
    const fy = Math.round(A.floor / TS), f = this.facing || -1;
    const blocked = (cx) => {
      const x0 = f < 0 ? cx - 330 : cx - 250, x1 = f < 0 ? cx + 250 : cx + 330;
      for (let tx = Math.floor(x0 / TS); tx <= Math.floor(x1 / TS); tx++) if (solidT(m.typeAt(tx, fy - 1))) return true;
      return false;
    };
    if (!blocked(x)) return x;
    for (let d = 24; d < A.w; d += 24) {
      for (const s of [1, -1]) { const nx = x + s * d; if (nx >= A.x0 + 180 && nx <= A.x1 - 180 && !blocked(nx)) return nx; }
    }
    return x;
  }
  setPose(o) { Object.assign(this.pt, o); }
  relax() { for (const k in this.pt) this.pt[k] = 0; }
  faceP() { const p = this.P; if (p) { const d = p.cx - this.bx; if (Math.abs(d) > 60) this.facing = Math.sign(d); } }
  place() { this.x = this.bx - this.w / 2; this.y = this.by - this.h; this.vx = 0; this.vy = 0; }
  /** 몸 기울기 · 내려앉음 적용 (몸 지역 → 몸 지역) */
  bodyPt(lx, ly, out) {
    const a = this.bodyA, c = Math.cos(a), s = Math.sin(a), dx = lx - PIVOT[0], dy = ly - PIVOT[1];
    out[0] = PIVOT[0] + dx * c - dy * s; out[1] = PIVOT[1] + dx * s + dy * c + this.drop;
    return out;
  }
  /** 몸 지역 → 월드 (논리 facing 기준) */
  toWorld(lx, ly, out = this._pt) { out.x = this.bx + lx * this.facing; out.y = this.by + ly; return out; }
  /** 머리 지역 → 몸 지역 */
  headPt(hx, hy, out) {
    const n = this.bodyPt(NECK[0], NECK[1], out), c = Math.cos(this.headA), s = Math.sin(this.headA);
    const x = n[0] + hx * c - hy * s, y = n[1] + hx * s + hy * c;
    out[0] = x; out[1] = y;
    return out;
  }

  // ═════════════════════════════ 움직임 · 골격 ═════════════════════════════
  animTick(dt) {
    const s = this.pose, pt = this.pt;
    for (const k in s) s[k] += (pt[k] - s[k]) * (1 - Math.exp(-POSE_RATE[k] * dt));
    this.turnK = approach(this.turnK, this.facing, dt / 0.4);
    this.moving = approach(this.moving, Math.abs(this.mvx) > 10 ? 1 : 0, dt * 4);
    this.gph += Math.abs(this.mvx) * dt / 120;
    const br = Math.sin(this.t * 1.6) * 0.012;
    this.bodyA = -s.rear * 0.22 + s.kneel * 0.2 + s.slump * 0.04 + s.lie * 0.03 + br * (1 - s.lie);
    this.drop = s.kneel * 44 + s.slump * 58 + s.lie * 96;
    this.headA = -s.roar * 0.3 + s.headDown * 0.34 + s.kneel * 0.02 + s.slump * 0.3 + s.lie * 0.22 - s.breath * 0.12 + Math.sin(this.t * 1.3) * 0.03 * (1 - s.lie);
    this.jawK = clamp(s.roar * 0.55 + s.breath * 0.95 + s.lie * 0.2 + (this.dying > 0 ? 0.15 : 0), 0, 1);
    this.queenGlow = approach(this.queenGlow, (this.queenAwake || this.queenAct > 0) && !(this.dying > 0) ? 1 : 0, dt * 1.5);
    if (this.queenAct > 0) this.queenAct -= dt;
    for (const sc of this.sacs) { if (sc.hitT > 0) sc.hitT -= dt; if (sc.alive && sc.grow < 1) sc.grow = approach(sc.grow, 1, dt / 2); }
  }
  move(dt) {
    const A = this.A;
    this.bx = clamp(this.bx + this.mvx * dt, A.x0 + 175, A.x1 - 175);
    this.by = A.floor;
  }
  motion(dt, world) {
    this.animTick(dt);
    this.move(dt);
    this.place();
    this.rig();
    this.syncParts();
    this.footsteps(dt, world);
  }
  idleAnim(dt) { this.animTick(dt); this.rig(); this.syncParts(); }
  /** 다리 넷 (엉덩이는 몸 기울기를 따르고, 발은 월드 지형을 딛는다) */
  rig() {
    const s = this.pose, f = this.facing, A = this.A, mv = this.moving, t = this.t;
    for (const L of this.legs) {
      this.bodyPt(L.hip[0], L.hip[1], L.hipL);
      const front = L.side > 0;
      let fx = L.fx + (front ? -s.kneel * 60 + s.rear * 40 : 0) + s.lie * (front ? -40 : 30) + s.slump * (front ? 14 : -10);
      const ph = this.gph * TAU + L.ph;
      fx += Math.sin(ph) * 46 * mv;
      const wx = this.bx + fx * f;
      let fy = groundAt(this.world, A, wx, this.by) - this.by;
      fy -= Math.max(0, Math.cos(ph)) * 34 * mv;
      if (front && s.rear > 0.05) fy -= s.rear * 70;           // 앞발을 치켜든다
      if (front && s.scrape > 0.05 && L.near) { fx += Math.sin(t * 16) * 24 * s.scrape; fy -= Math.max(0, Math.sin(t * 16)) * 12 * s.scrape; }
      L.footL[0] = fx; L.footL[1] = fy;
      L.fxw = this.bx + fx * f; L.fyw = this.by + fy;
      ikSide(L.hipL[0], L.hipL[1], fx, fy, LU, LL, front ? (s.kneel > 0.3 || s.lie > 0.3 ? 1 : -1) : -1, L.kneeL);
    }
  }
  syncParts() {
    const f = this.facing, k = this._k, P = this._pt, s = this.pose;
    // 머리 · 두개골 · 입
    this.headPt(95, -10, k); this.toWorld(k[0], k[1], P); this.headP.x = P.x; this.headP.y = P.y;
    this.pSkull.x = P.x - 35; this.pSkull.y = P.y - 35;
    this.headPt(150, 26 + this.jawK * 20, k); this.toWorld(k[0], k[1], P); this.mouthP.x = P.x; this.mouthP.y = P.y;
    // 여왕: 붙은 자리(어깨 혹)에서 몸을 세운다. 무릎 꿇으면 앞으로 늘어져 바닥−150 까지 내려온다
    this.bodyPt(QBASE[0], QBASE[1], k);
    const kn = Math.max(s.kneel, s.slump * 0.7), qa = this.queenA(), ca = Math.cos(qa + this.bodyA), sa = Math.sin(qa + this.bodyA);
    // 몸통 가운데 (허리 위 45) — 무릎 꿇으면 늘어진 팔까지 바닥−150 으로 내려온다 (그림의 늘어진 팔과 같은 자리)
    const cx0 = k[0] + 4 * ca + 45 * sa, cy0 = k[1] + 4 * sa - 45 * ca;
    const qx = cx0 + kn * 12, qy = lerp(cy0, -150, kn);
    this.toWorld(qx, qy, P); this.queenP.x = P.x; this.queenP.y = P.y;
    const pq = this.pQueen; pq.x = P.x - 25; pq.y = P.y - 45;
    pq.defMul = this.formPhase >= 1 ? 0.55 : 1.2;
    this.toWorld(k[0] + 30 + 20 * s.qRaise, k[1] - 70 - 40 * s.qRaise, this.qHand);
    // 주머니
    for (const sc of this.sacs) { this.bodyPt(sc.lx, sc.ly, k); this.toWorld(k[0], k[1], P); sc.x = P.x; sc.y = P.y; sc.part.x = P.x - 25; sc.part.y = P.y - 25; }
    // 몸통 판정 (부위 중 가장 크다) · 접촉
    const pb = this.pBody, top = this.by - 320 + this.drop;
    pb.x = this.bx - 220; pb.w = 440; pb.y = top; pb.h = this.by - top;
    const cb = this.cBody; cb.x = this.bx - 170; cb.y = this.by - 230 + this.drop * 0.8; cb.w = 340; cb.h = 230 - this.drop * 0.8;
    const ch = this.cHead, hTop = this.headP.y - 55, hBot = hTop + 120;
    ch.x = this.headP.x - 65 + f * 10; ch.w = 130;
    ch.y = Math.max(hTop, this.by - HEAD_TOP); ch.h = Math.max(0, hBot - ch.y);   // 발판 위 플레이어 보호 (머리 판정 부위 pSkull 은 그대로)
  }
  footsteps(dt, world) {
    if (this.moving < 0.2 || this.dying > 0) return;
    const prev = this.stepAcc;
    this.stepAcc = this.gph % 0.5;
    if (this.stepAcc < prev) {
      const heavy = this.rushing ? 5 : 2.5;
      world.camera?.shake?.(heavy, 0.15);
      audio.sfx('hit_heavy', { pitch: this.rushing ? 0.4 : 0.3, vol: this.rushing ? 0.5 : 0.3 });
      const L = this.legs[Math.floor(this.gph * 2) % 2 ? 2 : 3];
      world.fx.burst('dust', L.fxw, L.fyw - 4, this.rushing ? 6 : 3, { speed: 100, angle: -PI / 2, spread: 1.2 });
    }
  }

  // ═════════════════════════════ 판정 ═════════════════════════════
  hitParts() {
    const L = this._hp;
    L.length = 0;
    if (this.dying > 0) return L;
    L.push(this.pQueen);
    for (const sc of this.sacs) if (sc.alive && sc.grow > 0.9) L.push(sc.part);
    L.push(this.pSkull, this.pBody);
    return L;
  }
  /** 접촉: 몸통 + 머리. 무릎 꿇음 · 기절 · 돌진(지대가 맡는다) 동안은 없다 */
  contactParts() {
    const L = this._cp;
    L.length = 0;
    if (this.dying > 0 || this.kneeling || this.stunned || this.rushing) return L;
    L.push(this.cBody);
    if (this.cHead.h > 4) L.push(this.cHead);
    return L;
  }
  hitSac(sc, dmg) {
    if (!sc.alive || this.dying > 0 || this.dead) return;
    sc.hp -= Math.max(1, dmg || 0); sc.hitT = 0.15;
    if (sc.hp > 0) return;
    sc.alive = false; sc.hp = 0; sc.grow = 0;
    const w = this.world;
    w.fx.burst('goo', sc.x, sc.y, 18, { speed: 260 });
    w.fx.burst('soul', sc.x, sc.y, 12, { color: SPORE, speed: 160 });
    w.fx.ring(sc.x, sc.y, { color: SPORE, r0: 8, r1: 70, life: 0.35, width: 4 });
    audio.sfx('mist', { pitch: 0.6, vol: 0.8 }); audio.sfx('hit_heavy', { pitch: 0.7, vol: 0.6 });
    if (this.sacs.every((x) => !x.alive)) this.pendStun = true;
  }
  regrowSacs() { for (const sc of this.sacs) { sc.alive = true; sc.hp = sc.max; sc.grow = 0; sc.hitT = 0; } }
  onHurt(dmg, attack, world, info, part) {
    const x = info?.hx ?? this.cx, y = info?.hy ?? this.cy;
    if (part === this.pSkull) { if (Math.random() < 0.6) world.fx.burst('shard', x, y, 3, { color: BONE, speed: 200 }); }
    else if (part === this.pQueen) { if (Math.random() < 0.7) world.fx.burst('soul', x, y, 4, { color: '#e8ffd0', speed: 140 }); }
    else if (!part?.sac && Math.random() < 0.5) world.fx.burst('gravel', x, y, 3, { color: '#4a4a2e', speed: 180 });
  }

  // ═════════════════════════════ 논리 틱 ═════════════════════════════
  tickB(dt, world) {
    this.motion(dt, world);
    this.ambient(dt, world);
    this.ensureCull(world);
    if (this.pendStun && !this._tr && !(this.dying > 0) && this.state !== 'stun' && !this.invuln) {
      this.pendStun = false;
      this.cancelPattern();
      this.setState('stun');
    }
  }
  ambient(dt, world) {
    const q = world.fx?.quality ?? 1;
    this.fxAcc += dt * q * (2.5 + this.dmgStage * 1.5 + this.pose.pulse * 8);
    const k = this._k;
    while (this.fxAcc >= 1) {
      this.fxAcc -= 1;
      const r = Math.random();
      if (r < 0.5) { const sc = this.sacs[Math.floor(Math.random() * 3)]; world.fx.emit('soul', sc.x + rand(-10, 10), sc.y + rand(-10, 10), { color: SPORE, speed: 30 }); }
      else { this.bodyPt(rand(-200, 150), -320, k); const P = this.toWorld(k[0], k[1]); world.fx.emit('magic', P.x, P.y - rand(0, 80), { color: '#c8ff6a', speed: 20, size: 2 }); }
    }
  }
  ensureCull(world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world) return;
    if (typeof world?.add !== 'function' || !Array.isArray(world.entities)) return;
    this._cull = world.add(new ArtCull(this));
  }
  artBounds(r) { r.x = this.bx - 400; r.y = this.by - 640; r.w = 800; r.h = 680; return r; }
  draw(ctx, world) {
    const c = this._cull;
    if (c && !c.dead && c.world === world && !this._artDrawing) return;   // 대리 개체(ArtCull)가 그린다
    super.draw(ctx, world);
  }

  // ═════════════════════════════ 상태 ═════════════════════════════
  s_intro(dt, world, t) {
    if (this.at(0.001)) { this.setPose({ roar: 1, rear: 0.5 }); audio.sfx('boss_roar', { pitch: 0.45, vol: 1 }); impact(world, { shake: 12, time: 0.8 }); }
    if (this.at(0.4)) world.fx.burst('dust', this.bx, this.by - 6, 24, { speed: 260, angle: -PI / 2, spread: 1.4 });
    if (this.at(1.0)) this.setPose({ roar: 0, rear: 0 });
    if (t >= 1.4) this.done(0.8);
  }
  /** 대기: 플레이어 쪽으로 60px/s 이하로 걸어온다 (머리가 닿을 즈음 멈춤) */
  idleMove(dt, world, t) {
    this.faceP();
    const p = this.P;
    if (!p) { this.mvx = approach(this.mvx, 0, 200 * dt); return; }
    const d = p.cx - this.bx, want = Math.abs(d) > 300 ? Math.sign(d) * 60 : 0;
    this.mvx = approach(this.mvx, Math.abs(this.turnK - this.facing) > 0.3 ? 0 : want, 160 * dt);
  }
  hold() { this.mvx = 0; }

  // ── charge: 앞발로 땅 긁기 1.0초 → 반대쪽 벽까지 700px/s (접촉 mv 1.8) → 벽에 부딪혀 kneel 2.5초 + 떨어지는 바위 3 ──
  s_charge(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(); this.hold();
      this.cdir = this.facing;
      telegraph(this, 1.0, { sfx: 'warning', vol: 0.5 });
      this.setPose({ scrape: 1, headDown: 0.7, roar: 0.25 });
      audio.sfx('boss_roar', { pitch: 0.5, vol: 0.8 });
      const dir = this.cdir, x0 = dir > 0 ? this.bx : A.x0, x1 = dir > 0 ? A.x1 : this.bx;
      this.zone({ x: x0, y: A.floor - 230, w: Math.max(10, x1 - x0), h: 230, warn: 0, life: 1.0, harmless: true, z: 5,
        paint: (ctx, z, w) => { warnRect(ctx, z.x, z.y, z.w, z.h, clamp(z.t / 1.0, 0, 1), '#c8e060', w.time); chevrons(ctx, z, dir, w.time); } });
    }
    if (t < 1.0 && this.every(0.2)) {
      const L = this.legs[2];
      world.fx.burst('dust', L.fxw, L.fyw - 4, 5, { speed: 150, angle: -PI / 2 - this.cdir * 0.9, spread: 0.6 });
      audio.sfx('footstep', { pitch: 0.5, vol: 0.5 });
    }
    if (this.at(1.0)) {
      this.rushing = true;
      this.mvx = this.cdir * 700;
      this.setPose({ scrape: 0, headDown: 1, roar: 0.5 });
      audio.sfx('boss_roar', { pitch: 0.6 }); audio.sfx('dash', { pitch: 0.4 });
      this.zone({
        x: this.cBody.x, y: this.cBody.y, w: 470, h: 230, warn: 0, life: 7, mv: 1.8, kb: [680, -480], rehit: 0.6, z: 6,
        tick: (z) => {
          if (!this.rushing || this.state !== 'charge') { z.dead = true; return; }
          const b = this.cBody, h = this.cHead;
          z.x = Math.min(b.x, h.x); z.y = Math.min(b.y, h.y); z.w = Math.max(b.x + b.w, h.x + h.w) - z.x; z.h = b.y + b.h - z.y;
        },
      });
    }
    if (this.rushing) {
      this.mvx = this.cdir * 700;
      if (Math.random() < 0.8 * (world.fx.quality ?? 1)) world.fx.emit('dust', this.bx - this.cdir * 160, A.floor - 6, { speed: 140, angle: -PI / 2 - this.cdir * 0.6, spread: 0.6 });
      const edge = this.cdir > 0 ? A.x1 - 176 : A.x0 + 176;
      if ((this.cdir > 0 && this.bx >= edge) || (this.cdir < 0 && this.bx <= edge) || t > 7) {
        this.rushing = false; this.mvx = 0;
        impact(world, { shake: 18, time: 0.7, stop: 0.1 });
        audio.sfx('explode', { pitch: 0.4 }); audio.sfx('break_wall', { pitch: 0.5 });
        const wx = this.cdir > 0 ? A.x1 - 6 : A.x0 + 6;
        world.fx.burst('gravel', wx, A.floor - 140, 24, { speed: 320 });
        world.fx.burst('dust', wx, A.floor - 100, 20, { speed: 240 });
        this.rocks();
        this.setState('kneel');
      }
    }
  }
  /** 벽에 부딪힌 충격으로 천장에서 바위 셋 (0.6초 예고, mv 1.0) */
  rocks() {
    const A = this.A, p = this.P, px = p ? p.cx : A.cx;
    const top = (A.top ?? 0) + 4, bot = A.floor;
    for (const o of [0, -190, 190]) {
      const x = clamp(px + o + rand(-20, 20), A.x0 + 40, A.x1 - 40);
      this.zone({
        x: x - 34, y: top, w: 68, h: bot - top, warn: 0.6, life: 0.42, mv: 1.0, kb: [240, -300], z: 7,
        data: { rock: true, x, rot: rand(0, TAU) },
        rects: (z) => { const k = clamp((z.t - z.warn) / z.dur, 0, 1), y = lerp(top, bot - 30, k * k); return [{ x: x - 30, y: y - 30, w: 60, h: 60 }]; },
        onEnd: (z, w) => { w.fx.burst('gravel', x, bot - 6, 10, { speed: 220, angle: -PI / 2, spread: 1.2 }); w.camera?.shake?.(4, 0.15); audio.sfx('hit_heavy', { pitch: 0.8, vol: 0.4 }); },
        paint: (ctx, z, w) => paintRock(ctx, z, w, x, top, bot),
      });
    }
  }
  // ── kneel (보조): 2.5초 무릎 꿇음 — 접촉 없음, 여왕이 바닥−150 까지 늘어진다 ──
  s_kneel(dt, world, t) {
    if (this.at(0.001) || !this.kneeling) {
      this.kneeling = true; this.rushing = false; this.mvx = 0;
      this.setPose({ kneel: 1, headDown: 0.8, roar: 0, scrape: 0, rear: 0 });
      audio.sfx('boss_roar', { pitch: 0.35, vol: 0.6 });
    }
    if (this.every(0.3, 0.2, 2.3)) { const h = this.headP; world.fx.emit('soul', h.x + rand(-30, 30), h.y - 30, { color: SPORE, speed: 30 }); }
    if (t >= 2.5) { this.kneeling = false; this.setPose({ kneel: 0, headDown: 0 }); this.done(0.9); }
  }

  // ── roots: 플레이어 쪽으로 달려가는 뿌리 파도 셋 (예고 0.7초씩, 70×120, mv 1.3) ──
  s_roots(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(); this.hold();
      telegraph(this, 0.7, { sfx: 'warning', vol: 0.4 });
      this.setPose({ roar: 0.8, rear: 0.2 });
      audio.sfx('boss_roar', { pitch: 0.7, vol: 0.6 });
    }
    for (let i = 0; i < 3; i++) if (this.at(0.05 + i * 0.7)) this.rootWave(i);
    if (this.at(0.6)) this.setPose({ roar: 0.3, rear: 0 });
    if (t >= 3.2) { this.setPose({ roar: 0 }); this.done(1.0); }
  }
  rootWave(i) {
    const A = this.A, p = this.P, f = this.facing;
    const x0 = clamp(this.bx + f * 170, A.x0 + 20, A.x1 - 20);
    const dir = p ? (Math.sign(p.cx - x0) || f) : f;
    const len = Math.min(900, Math.max(60, dir > 0 ? A.x1 - 20 - x0 : x0 - A.x0 - 20)), speed = 620, floor = A.floor;
    const front = (z) => x0 + dir * Math.min(len, speed * Math.max(0, z.t - z.warn));
    this.zone({
      x: x0 - 35, y: floor - 120, w: 70, h: 120, warn: 0.7, life: len / speed + 0.25, mv: 1.3, kb: [300, -520], z: 6,
      data: { x0, dir, len, spikes: [] },
      rects: (z) => { const fx = front(z); return [{ x: fx - 35, y: floor - 120, w: 70, h: 120 }]; },
      tick: (z, w, dt) => {
        if (z.t < z.warn) return;
        const fx = front(z), d = z.data, last = d.spikes[d.spikes.length - 1];
        if (!last || Math.abs(fx - last.x) >= 38) { d.spikes.push({ x: fx, t: z.t, s: rand(0.8, 1.2) }); if (d.spikes.length % 3 === 0) audio.sfx('hit_heavy', { pitch: 1.2, vol: 0.25 }); w.fx?.emit?.('gravel', fx, floor - 4, { speed: 160, angle: -PI / 2, spread: 0.6 }); }
        z.x = Math.min(x0, fx) - 35; z.w = Math.abs(fx - x0) + 70;
      },
      onStart: () => audio.sfx('break_wall', { pitch: 1.3, vol: 0.4 }),
      paint: (ctx, z, w) => paintRoots(ctx, z, w, x0, dir, len, floor),
    });
  }

  // ── sporeBurst: 주머니가 1.0초 부푼다 → 포자 구름 셋 200×140, 5초 (blight.addCloud · 없으면 대역 독 지대 mv 0.3) ──
  s_sporeBurst(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(); this.hold();
      telegraph(this, 1.0, { sfx: 'warning', vol: 0.4, pitch: 0.9 });
      this.setPose({ pulse: 1, roar: 0.3 });
      audio.sfx('mist', { pitch: 0.5, vol: 0.8 });
    }
    if (t < 1.0 && this.every(0.12)) { for (const sc of this.sacs) if (sc.alive) world.fx.emit('soul', sc.x, sc.y, { color: SPORE, speed: 80 }); }
    if (this.at(1.0)) {
      const A = this.A, p = this.P, px = p ? p.cx : A.cx;
      const src = this.sacs.filter((s) => s.alive);
      const from = src.length ? src : [{ x: this.mouthP.x, y: this.mouthP.y }];
      [px - 230, px, px + 230].forEach((x, i) => {
        const cx = clamp(x, A.x0 + 100, A.x1 - 100);
        sporeCloud(this, cx - 100, A.floor - 140, 200, 140, 5);
        const o = from[i % from.length];
        this.world.fx.burst('soul', o.x, o.y, 10, { color: SPORE, speed: 260 });
        this.world.fx.burst('soul', cx, A.floor - 70, 12, { color: '#c8ff6a', speed: 120 });
      });
      audio.sfx('mist', { pitch: 0.8, vol: 0.9 }); audio.sfx('explode', { pitch: 1.4, vol: 0.4 });
      impact(world, { shake: 6, time: 0.3 });
      this.setPose({ pulse: 0, roar: 0.6 });
    }
    if (this.at(1.3)) this.setPose({ roar: 0 });
    if (t >= 1.7) this.done(1.0);
  }

  // ── stomp: 0.8초 앞발을 쳐든다 → 양쪽으로 달리는 충격파 (높이 50, mv 1.4) ──
  s_stomp(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(); this.hold();
      telegraph(this, 0.8, { sfx: 'warning', vol: 0.45 });
      this.setPose({ rear: 1, roar: 1 });
      audio.sfx('boss_roar', { pitch: 0.45, vol: 0.9 });
    }
    if (this.at(0.8)) {
      this.setPose({ rear: -0.15, roar: 0.3 });
      const A = this.A, fx = clamp(this.bx + this.facing * 125, A.x0 + 10, A.x1 - 10);
      for (const d of [-1, 1]) groundWave(this, fx, d, { h: 50, w: 44, speed: 560, mv: 1.4, color: '#b8d060', kb: [360, -560] });
      impact(world, { shake: 16, time: 0.5, stop: 0.06 });
      world.fx.burst('dust', fx, A.floor - 6, 26, { speed: 300, angle: -PI / 2, spread: 1.4 });
      world.fx.burst('gravel', fx, A.floor - 6, 14, { speed: 280 });
      audio.sfx('explode', { pitch: 0.4 }); audio.sfx('hit_heavy', { pitch: 0.35 });
    }
    if (this.at(1.05)) this.setPose({ rear: 0, roar: 0 });
    if (t >= 1.5) this.done(1.0);
  }

  // ── queenThorns (P2+): 여왕이 가시 다발을 다섯 번 던진다 (포물선, mv 0.9) ──
  s_queenThorns(dt, world, t) {
    if (this.at(0.001)) {
      this.faceP(); this.hold();
      telegraph(this, 0.6, { sfx: 'warning', vol: 0.4, pitch: 1.3 });
      this.queenAct = 3.2;
      this.setPose({ qRaise: 1 });
      audio.sfx('ghost', { pitch: 1.2, vol: 0.6 });
    }
    for (let i = 0; i < 5; i++) if (this.at(0.6 + i * 0.35)) this.thornVolley(i);
    if (this.at(2.5)) this.setPose({ qRaise: 0 });
    if (t >= 2.7) this.done(1.0);
  }
  thornVolley(i) {
    const A = this.A, p = this.P, o = this.qHand;
    const px = p ? p.cx : A.cx, py = p ? p.bottom - 20 : A.floor - 20;
    const g = 2000 * 0.7, T_ = 0.85;
    for (let k = -1; k <= 1; k++) {
      const tx = clamp(px + k * 80 + rand(-20, 20), A.x0 + 20, A.x1 - 20), ty = py;
      const vx = (tx - o.x) / T_, vy = (ty - o.y - 0.5 * g * T_ * T_) / T_;
      this.shoot({ x: o.x, y: o.y, vx, vy, w: 16, h: 16, life: 3, behavior: 'arc', gravity: 0.7, render: thornRender, attack: { mv: 0.9, kb: [220, -260] } });
    }
    audio.sfx('whip', { pitch: 1.6 + i * 0.05, vol: 0.5 });
    this.world.fx.burst('soul', o.x, o.y, 6, { color: '#e8ffd0', speed: 120 });
  }

  // ── husks (P2+): 플레이어 근처 땅에서 균사 망자가 일어선다 (최대 3) ──
  s_husks(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(); this.hold();
      telegraph(this, 0.6, { sfx: 'warning', vol: 0.4 });
      warnText(this, '균사 망자가 일어선다!', '#c8ff6a');
      this.queenAct = 1.5; this.setPose({ qRaise: 0.8, roar: 0.5 });
      audio.sfx('ghost', { pitch: 0.6 });
      const p = this.P, px = p ? p.cx : A.cx;
      const free = Math.max(0, 3 - minionsAlive(this));
      this.huskAt = [];
      const offs = [-150, 150, 260, -260, 80, -80];
      for (const o of offs) {
        if (this.huskAt.length >= free) break;
        const x = clamp(px + o, A.x0 + 40, A.x1 - 40);
        if (groundAt(world, A, x, A.floor) < A.floor - 1) continue;   // 둔덕 위에는 세우지 않는다
        if (this.huskAt.some((q) => Math.abs(q - x) < 70)) continue;
        this.huskAt.push(x);
        this.zone({ x: x - 40, y: A.floor - 90, w: 80, h: 90, warn: 0, life: 0.6, harmless: true, z: 5, paint: (ctx, z, w) => { warnFloor(ctx, x, A.floor, 90, clamp(z.t / 0.6, 0, 1), '#c8ff6a', w.time); paintTendrils(ctx, x, A.floor, z.t / 0.6); } });
      }
    }
    if (this.at(0.6)) {
      for (const x of this.huskAt ?? []) {
        const e = spawnMinion(this, ['fungal_husk'], x, A.floor, { max: 3 });
        if (e) { world.fx.burst('gravel', x, A.floor - 6, 10, { speed: 200, angle: -PI / 2, spread: 0.8 }); world.fx.burst('soul', x, A.floor - 30, 8, { color: SPORE, speed: 90 }); }
      }
      audio.sfx('break_wall', { pitch: 0.9, vol: 0.5 });
      this.setPose({ qRaise: 0, roar: 0 });
    }
    if (t >= 1.4) this.done(1.0);
  }

  // ── rotBreath (P3): 0.9초 예고 → 앞쪽 520×200 부패의 숨 1.5초 (0.3초마다, mv 0.8) + 원뿔을 따라 포자 구름 ──
  s_rotBreath(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.faceP(); this.hold();
      telegraph(this, 0.9, { sfx: 'warning', vol: 0.5 });
      this.setPose({ roar: 1, breath: 0.4 });
      audio.sfx('boss_roar', { pitch: 0.4, vol: 0.7 });
      const f = this.facing, x0 = this.mouthP.x;
      const rects = [[0, 170, 60], [170, 350, 80], [350, 520, 100]].map(([a, b, hh]) => ({ x: f > 0 ? x0 + a : x0 - b, y: A.floor - hh * 2, w: b - a, h: hh * 2 }));
      this.breathZ = this.zone({
        x: Math.min(x0, x0 + f * 520), y: A.floor - 200, w: 520, h: 200, warn: 0.9, life: 1.5, mv: 0.8, rehit: 0.3, kb: [120, -120], z: 7,
        data: { x0, f },
        rects: () => rects,
        onStart: () => { audio.sfx('mist', { pitch: 0.4, vol: 1 }); this.setPose({ roar: 0.2, breath: 1 }); },
        paint: (ctx, z, w) => paintBreath(ctx, z, w, this.mouthP, f, A.floor, rects),
      });
    }
    if (this.at(1.2)) {
      const f = this.facing, x0 = this.mouthP.x;
      for (const d of [150, 330, 500]) { const cx = clamp(x0 + f * d, A.x0 + 90, A.x1 - 90); sporeCloud(this, cx - 90, A.floor - 120, 180, 120, 5); }
    }
    if (t > 0.9 && t < 2.4 && Math.random() < 0.9 * (world.fx.quality ?? 1)) {
      const f = this.facing, m = this.mouthP;
      world.fx.emit('smoke', m.x + f * rand(0, 60), m.y + rand(-10, 10), { color: '#6a8a2a', speed: 320, angle: f > 0 ? 0.35 : PI - 0.35, spread: 0.35 });
    }
    if (this.at(2.4)) this.setPose({ breath: 0, roar: 0 });
    if (t >= 2.8) this.done(1.0);
  }

  // ── bloom (P3): 바닥 곳곳에 포자 주머니 넷이 돋는다 (blight.spawnPod) ──
  s_bloom(dt, world, t) {
    const A = this.A;
    if (this.at(0.001)) {
      this.hold();
      telegraph(this, 0.6, { sfx: 'warning', vol: 0.4 });
      warnText(this, '포자 주머니가 돋아난다!', '#c8ff6a');
      this.setPose({ roar: 1, pulse: 0.6 });
      audio.sfx('boss_roar', { pitch: 0.55, vol: 0.7 });
    }
    if (this.at(0.6)) {
      const n = this.inferno ? 6 : 4, fy = Math.round(A.floor / TS), m = world.map;
      const t0 = Math.ceil(A.x0 / TS) + 1, t1 = Math.floor(A.x1 / TS) - 2;
      const picks = [];
      for (let tries = 0; picks.length < n && tries < 80; tries++) {
        const tx = Math.floor(rand(t0, t1 + 1));
        if (m?.typeAt && solidT(m.typeAt(tx, fy - 1))) continue;
        if (picks.some((q) => Math.abs(q - tx) < 3)) continue;
        picks.push(tx);
      }
      for (const tx of picks) {
        if (sporePod(this, tx, fy - 1)) world.fx.burst('soul', tx * TS + TS / 2, A.floor - 20, 8, { color: SPORE, speed: 100 });
      }
      audio.sfx('mist', { pitch: 1.1, vol: 0.6 });
      this.setPose({ roar: 0.2, pulse: 0 });
    }
    if (t >= 1.4) { this.setPose({ roar: 0 }); this.done(1.0); }
  }

  // ── stun (보조): 옆구리 주머니 셋을 모두 터뜨리면 4초 주저앉는다 (접촉 없음) → 주머니가 다시 자란다 ──
  s_stun(dt, world, t) {
    if (this.at(0.001) || !this.stunned) {
      this.stunned = true; this.rushing = false; this.kneeling = false; this.mvx = 0;
      this.setPose({ slump: 1, headDown: 1, roar: 0, rear: 0, scrape: 0, breath: 0, pulse: 0 });
      audio.sfx('boss_roar', { pitch: 0.3, vol: 0.8 });
      impact(world, { shake: 12, time: 0.5 });
      world.fx.burst('dust', this.bx, this.by - 6, 24, { speed: 240, angle: -PI / 2, spread: 1.6 });
    }
    if (this.every(0.25, 0.2, 3.8)) { for (const sc of this.sacs) world.fx.emit('goo', sc.x, sc.y + 10, { speed: 40 }); }
    if (t >= 4.0) {
      this.stunned = false;
      this.setPose({ slump: 0, headDown: 0 });
      if (this.sacs.every((s) => !s.alive)) this.regrowSacs();
      this.done(0.8);
    }
  }

  // ── 전환 ──
  s_phase1(dt, world, t) {
    if (this.at(0.001)) {
      this.onCancel(world);
      this.queenAct = 2; this.setPose({ roar: 1, rear: 0.6, qRaise: 1 });
      audio.sfx('boss_roar', { pitch: 0.5 }); audio.sfx('ghost', { pitch: 0.9, vol: 0.8 });
      impact(world, { shake: 12, time: 0.8 });
      world.fx.ring(this.queenP.x, this.queenP.y, { color: '#e8ffd0', r0: 10, r1: 260, life: 0.8, width: 6 });
    }
    if (this.at(1.0)) this.setPose({ roar: 0, rear: 0, qRaise: 0 });
    this.transitionTick(dt, world, t);
  }
  s_phase2(dt, world, t) {
    if (this.at(0.001)) {
      this.onCancel(world);
      this.queenAct = 2.2; this.setPose({ roar: 1, rear: 0.8, qRaise: 1, pulse: 1 });
      audio.sfx('boss_roar', { pitch: 0.4 }); audio.sfx('ghost', { pitch: 1.5, vol: 1 });
      impact(world, { shake: 14, time: 0.9 });
      world.fx.ring(this.queenP.x, this.queenP.y, { color: SPORE, r0: 10, r1: 340, life: 0.9, width: 8 });
    }
    if (this.every(0.12, 0, 1.2)) world.fx.emit('soul', this.bx + rand(-200, 200), this.by - rand(200, 360), { color: SPORE, speed: 60 });
    if (this.at(1.2)) this.setPose({ roar: 0, rear: 0, qRaise: 0, pulse: 0 });
    this.transitionTick(dt, world, t);
  }
  applyPhase(k, world = this.world) {
    this.dmgStage = Math.max(this.dmgStage, k);
    if (k >= 1) this.queenAwake = true;
    const P = this._k;
    this.bodyPt(k === 1 ? -90 : -190, k === 1 ? -302 : -288, P);
    const W = this.toWorld(P[0], P[1], { x: 0, y: 0 });
    world.fx.burst('shard', W.x, W.y - 60, 16, { color: '#5a4c36', speed: 260 });
    world.fx.burst('gravel', W.x, W.y - 30, 10, { speed: 200 });
    audio.sfx('break_wall', { pitch: 0.6, vol: 0.7 });
  }
  onCancel() {
    this.rushing = false; this.kneeling = false; this.stunned = false; this.mvx = 0;
    this.relax();
  }
  onReset(world = this.world) {
    this.onCancel(world);
    this.dmgStage = 0; this.queenAwake = false; this.queenAct = 0; this.pendStun = false;
    for (const sc of this.sacs) { sc.alive = true; sc.hp = sc.max; sc.grow = 1; sc.hitT = 0; }
    for (const k in this.pt) { this.pt[k] = 0; this.pose[k] = 0; }
    this.place(); this.rig(); this.syncParts();
  }

  // ═════════════════════════════ 사망 ═════════════════════════════
  onDeath(world) {
    this.dying = 4.0; this.dieT = 0;
    this.rushing = false; this.kneeling = false; this.stunned = false; this.mvx = 0;
    this.setPose({ lie: 1, roar: 0.6, headDown: 0, rear: 0, kneel: 0, slump: 0, scrape: 0, breath: 0, qRaise: 0, pulse: 0 });
    audio.sfx('boss_roar', { pitch: 0.25, vol: 1 });
    world.fx.ring(this.bx, this.by - 180, { color: GLOW, r0: 30, r1: 420, life: 1.0, width: 10 });
  }
  dyingTick(dt, world) {
    this.dieT += dt;
    this.motion(dt, world);
    const q = world.fx.quality ?? 1;
    // 여왕이 시들어 떨어진다
    if (this.dieT > 0.9 && !this.qFall) {
      this.qFall = { x: this.queenP.x, y: this.queenP.y, vx: this.facing * rand(40, 90), vy: -180, rot: 0, vr: this.facing * 2.4, floor: this.A.floor - 16, landed: false };
      audio.sfx('ghost', { pitch: 1.8, vol: 0.6 });
      world.fx.burst('soul', this.queenP.x, this.queenP.y, 16, { color: '#e8ffd0', speed: 160 });
    }
    const Q = this.qFall;
    if (Q && !Q.landed) {
      Q.vy += 1400 * dt; Q.x += Q.vx * dt; Q.y += Q.vy * dt; Q.rot += Q.vr * dt;
      if (Q.y >= Q.floor) { Q.y = Q.floor; Q.landed = true; Q.vr = 0; world.fx.burst('dust', Q.x, Q.floor, 10, { speed: 120 }); audio.sfx('hit_heavy', { pitch: 1.1, vol: 0.4 }); }
    }
    if (this.at_(1.4)) audio.sfx('boss_roar', { pitch: 0.2, vol: 0.7 });   // 길고 부드러운 신음
    this.bloomK = clamp((this.dieT - 1.8) / 1.4, 0, 1);
    if (Math.random() < 0.5 * q) { const k = this._k; this.bodyPt(rand(-220, 180), -310, k); const P = this.toWorld(k[0], k[1]); world.fx.emit(this.bloomK > 0 ? 'holy' : 'soul', P.x, P.y - rand(0, 40), { color: this.bloomK > 0 ? '#fff0f8' : SPORE, speed: 30 }); }
  }
  at_(t) { return this.dieT - (1 / 60) < t && this.dieT >= t; }
  /** 사망: 마지막 0.8초에만 흐려진다 (눕고 새싹이 피는 모습을 보여 준다) */
  render(ctx, world) {
    if (this.dying > 0) {
      ctx.globalAlpha = 1 - clamp((this.dieT - 3.2) / 0.8, 0, 1);
      if (ctx.globalAlpha <= 0.01) return;
    }
    super.render(ctx, world);
  }

  // ═════════════════════════════ 조명 ═════════════════════════════
  lightsB(L) {
    if (this._lw > 0) { this._lw--; const cam = this.world?.camera; if (cam) for (const c of LIGHT_WARM) L.add(cam.x + 40, cam.y + 40, 4, c, 0); }
    const dk = this.dying > 0 ? clamp(1 - this.dieT / 3, 0, 1) : 1;
    L.add(this.bx, this.by - 200, 300, GLOW, 0.45 * dk);
    for (const sc of this.sacs) if (sc.alive) L.add(sc.x, sc.y, 80 + 40 * this.pose.pulse, SPORE, (0.35 + 0.4 * this.pose.pulse) * dk);
    L.add(this.headP.x, this.headP.y - 20, 110, GLOW, 0.5 * dk);
    if (this.queenGlow > 0.05) L.add(this.queenP.x, this.queenP.y - 30, 140, '#e8ffd0', 0.5 * this.queenGlow);
    if (this.pose.breath > 0.1) L.add(this.mouthP.x, this.mouthP.y, 200, '#9ad040', 0.7 * this.pose.breath);
    if (this.bloomK > 0) L.add(this.bx, this.by - 250, 260, '#fff0f8', 0.5 * this.bloomK);
  }

  // ═════════════════════════════ 그리기 ═════════════════════════════
  get dmg() { return clamp(1 - this.hp / Math.max(1, this.stats.maxHp), 0, 1); }
  paintBack(ctx) {
    if (R.fl) return;
    const k = this.dying > 0 ? clamp(1 - this.dieT / 3.5, 0, 1) : 1;
    glowE(ctx, this.bx, this.by - 230, 360, 220, '#3a5a10', 0.3 * k);
  }
  paintBody(ctx, world, flash) {
    ctx.save();
    ctx.translate(this.bx, this.by);
    const sx = Math.abs(this.turnK) < 0.12 ? Math.sign(this.turnK || this.facing) * 0.12 : this.turnK;
    ctx.scale(sx, 1);
    if (flash) { ctx.globalAlpha *= 0.6; this.drawCore(ctx); }
    else this.drawBeast(ctx);
    ctx.restore();
  }
  paintFront(ctx) {
    if (R.fl) return;
    const Q = this.qFall;
    if (Q) {
      // 시들어 떨어진 여왕 (몸 밖, 월드 좌표)
      ctx.save(); ctx.translate(Q.x, Q.y); ctx.rotate(Q.rot); ctx.scale(this.facing, 1);
      ctx.globalAlpha *= clamp(1 - (this.dieT - 2.6) / 1.2, 0, 1);
      this.drawQueenFigure(ctx, 0, 0, 1, true);
      ctx.restore();
    }
  }
  /** 섬광용: 몸통 · 머리 · 여왕만 */
  drawCore(ctx) {
    ctx.save(); this.bodyXf(ctx);
    put(ctx, ART?.torso, 0, 0);
    this.drawHead(ctx);
    if (!this.qFall) this.drawQueen(ctx);
    ctx.restore();
  }
  /** 몸 변환 (기울기 · 내려앉음) — 그리는 쪽 */
  bodyXf(ctx) { ctx.translate(0, this.drop); ctx.translate(PIVOT[0], PIVOT[1]); ctx.rotate(this.bodyA); ctx.translate(-PIVOT[0], -PIVOT[1]); }
  drawBeast(ctx) {
    const t = this.t;
    for (const L of this.legs) if (!L.near) this.drawLeg(ctx, L, true);
    ctx.save(); this.bodyXf(ctx);
    this.drawTail(ctx);
    this.drawForest(ctx);
    put(ctx, ART?.torso, 0, 0);
    if (!ART && !R.fl) { ctx.fillStyle = HIDE; ctx.beginPath(); ctx.ellipse(-20, -214, 220, 96, 0, 0, TAU); ctx.fill(); }
    this.drawWounds(ctx);
    for (const sc of this.sacs) this.drawSac(ctx, sc, t);
    this.drawHead(ctx);
    if (!this.qFall) this.drawQueen(ctx);
    this.drawBlooms(ctx);
    ctx.restore();
    for (const L of this.legs) if (L.near) this.drawLeg(ctx, L, false);
    this.drawMossDrapes(ctx);
  }
  /**
   * 다리 하나 (몸 지역, 오른쪽 = 앞): 몸통에 녹아드는 살진 허벅지 · 코끼리처럼 주름진 정강이 · 하마 같은 뭉툭한 발 (말라붙은 진흙, 금 간 발톱 넷).
   * 가까운 다리에는 이끼 · 선반버섯 · 사마귀. 피해 단계: P2 부터 가까운 앞다리, P3 에는 가까운 뒷다리의 무릎 가죽이 찢겨 뼈가 드러나고 피가 흐른다.
   */
  drawLeg(ctx, L, far) {
    const fl = R.fl, h = L.hipL, k = L.kneeL, f = L.footL, front = L.side > 0, t = this.t;
    const col = far ? '#25271a' : HIDE;
    const ax = f[0] + (front ? 5 : -5), ay = f[1] - 34;   // 발목
    // 허벅지: 뿌리(몸통 안) 쪽 윤곽선은 그리지 않아 엉덩이 살덩이처럼 몸에 붙는다.
    // 뒷다리 엉덩이는 조금 뒤로 물려 그린다 (옆구리 상처의 포자 주머니 = 약점을 가리지 않게)
    const hx = h[0] + (front ? 0 : -12), hy = h[1] + (front ? 0 : 4);
    fleshLimb(ctx, hx, hy, k[0], k[1], far ? 40 : (front ? 50 : 44), far ? 22 : 27, far ? 6 : 11, col, far ? 'bh_thf' : 'bh_th', { open: front ? 0.34 : 0.42, folds: far ? 0 : 3, moss: !far });
    // 정강이 (무릎 아래 주름 · 발목 위 주름)
    fleshLimb(ctx, k[0], k[1], ax, ay, far ? 22 : 27, far ? 17 : 21, far ? 2 : 4, col, far ? 'bh_shf' : 'bh_sh', { folds: far ? 2 : 4, rootFolds: far ? 0 : 3 });
    // 발 (발 지역: 원점 = 발 밑 가운데)
    const fw = far ? 30 : 37, adx = ax - f[0];
    ctx.save(); ctx.translate(f[0], f[1]);
    ctx.beginPath();
    ctx.moveTo(adx - 18, -38);
    ctx.bezierCurveTo(adx - 24, -20, -fw, -18, -fw, -3);
    ctx.lineTo(fw + 3, -3);
    ctx.bezierCurveTo(fw + 1, -20, adx + 26, -24, adx + 19, -38);
    ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, far ? 'bh_footf' : 'bh_foot', 0, -40, 0, 0, far ? [0, '#25271a', 0.6, '#1a1a10', 1, '#0e0c08'] : [0, HIDE, 0.45, '#3a3a24', 0.75, '#2e2618', 1, '#1a140c']), 2.4);
    if (!fl) {
      // 발 주름 · 말라붙은 진흙
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); for (let q = 0; q < 3; q++) { const y = -26 + q * 7; ctx.moveTo(adx - 16 - q * 4, y); ctx.quadraticCurveTo(adx + 2, y + 4, adx + 18 + q * 5, y); } ctx.stroke();
      ctx.fillStyle = far ? 'rgba(40,32,20,0.6)' : 'rgba(70,56,34,0.75)';
      for (let q = 0; q < 4; q++) { ctx.beginPath(); ctx.ellipse(-fw * 0.7 + q * fw * 0.5 + h01(q + L.ph) * 6, -6 - h01(q * 3 + L.ph) * 5, 6 + h01(q) * 4, 3, 0, 0, TAU); ctx.fill(); }
      // 발톱 (앞쪽이 크다): 누렇게 금 가고 흙이 끼었다
      const nails = far ? 3 : 4;
      for (let q = 0; q < nails; q++) {
        const u = nails === 1 ? 0.5 : q / (nails - 1), x = lerp(-fw * 0.5, fw * 0.92, u), nw = 5 + u * 3.5, nh = 11 + u * 5;
        ctx.beginPath(); ctx.moveTo(x - nw, -1); ctx.quadraticCurveTo(x - nw - 1, -nh, x, -nh - 2); ctx.quadraticCurveTo(x + nw + 1, -nh, x + nw + 2, -1); ctx.closePath();
        ink(ctx, far ? '#6e6650' : LG(ctx, 'bh_nail', 0, -16, 0, 0, [0, '#e8dcb8', 0.5, '#b8a880', 1, '#4a3e28']), 1.6);
        if (!far) { ctx.strokeStyle = 'rgba(40,30,16,0.8)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(x - 1, -nh + 2); ctx.lineTo(x + 1, -nh * 0.5); ctx.lineTo(x - 1, -3); ctx.stroke(); }
      }
    }
    ctx.restore();
    if (fl || far) return;
    // 정강이 뒤쪽의 선반버섯 둘
    const mx = lerp(k[0], ax, 0.45) - (front ? 20 : 22), my = lerp(k[1], ay, 0.45);
    for (let q = 0; q < 2; q++) {
      ctx.beginPath(); ctx.ellipse(mx - q * 3, my + q * 11, 12 - q * 3, 5, -0.15, PI * 0.95, TAU + 0.05);
      ink(ctx, q ? '#c8b890' : '#e2d6b0', 1.2, '#2a2010');
      ctx.strokeStyle = 'rgba(90,70,40,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let r = 0; r < 4; r++) { ctx.moveTo(mx - q * 3 - 8 + r * 5, my + q * 11 - 1); ctx.lineTo(mx - q * 3 - 7 + r * 5, my + q * 11 - 4); } ctx.stroke();
    }
    // 피해 단계: 무릎 가죽이 찢겨 뼈(무릎뼈)가 드러난다
    const wound = (front && this.dmgStage >= 1) || (!front && this.dmgStage >= 2);
    if (wound) {
      const wx = k[0] + (front ? 6 : -4), wy = k[1] - 2;
      ctx.beginPath(); ctx.ellipse(wx, wy, 17, 13, 0.3, 0, TAU); ink(ctx, '#3a0c0a', 2, '#120402');
      ctx.strokeStyle = '#7a2a1c'; ctx.lineWidth = 2.2; ctx.beginPath();
      for (let q = 0; q < 7; q++) { const a = (q / 7) * TAU; ctx.moveTo(wx + Math.cos(a) * 14, wy + Math.sin(a) * 10); ctx.lineTo(wx + Math.cos(a + 0.2) * 19, wy + Math.sin(a + 0.2) * 15); }
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(wx + 1, wy - 1, 9, 8, 0.2, 0, TAU); ink(ctx, LG(ctx, 'bh_patella', 0, -9, 0, 9, [0, '#f2ead0', 0.6, BONE, 1, BONE_D]), 1.4);
      ctx.strokeStyle = '#3a3020'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(wx - 3, wy - 7); ctx.lineTo(wx + 1, wy - 1); ctx.lineTo(wx - 2, wy + 5); ctx.stroke();
      const dy = (t * 34 + L.ph * 7) % 40;
      ctx.fillStyle = '#6a1210'; ctx.beginPath(); ctx.moveTo(wx - 4, wy + 10); ctx.quadraticCurveTo(wx - 6, wy + 10 + dy * 0.6, wx - 4, wy + 12 + dy); ctx.quadraticCurveTo(wx - 2, wy + 10 + dy * 0.6, wx - 4, wy + 10); ctx.fill();
    }
  }
  drawTail(ctx) {
    const fl = R.fl, t = this.t, sw = Math.sin(t * 2) * 10;
    tube(ctx, -246, -214, -284, -196 + sw * 0.3, 16, 10, fl ? '#fff' : HIDE, 'bh_tail', 2.4);
    if (fl) return;
    ctx.strokeStyle = '#3a3020'; ctx.lineWidth = 2;
    ctx.beginPath(); for (let k = 0; k < 6; k++) { ctx.moveTo(-282, -196 + sw * 0.3); ctx.quadraticCurveTo(-296 - k * 3, -180 + k * 4, -300 - k * 5 + sw, -150 + k * 7); } ctx.stroke();
  }
  /** 등의 숲: 죽은 나무 셋 · 거대 버섯 둘 (피해 단계마다 나무가 부러진다) */
  drawForest(ctx) {
    const fl = R.fl, t = this.t, st = this.dmgStage, s = this.pose;
    const trees = ART?.trees;
    const sway = (i) => Math.sin(t * 0.9 + i * 1.7) * 0.03 + s.rear * -0.06 + s.lie * 0.08;
    // A 뒤쪽 (P3 부터 부러짐) · B 가운데 가장 큼 (P2 부터 부러짐) · C 앞쪽
    const spots = [[-188, -288, 0, st >= 2], [-92, -302, 1, st >= 1], [8, -312, 2, false]];
    for (const [x, y, i, broken] of spots) {
      if (broken) { this.drawStump(ctx, x, y, i); continue; }
      put(ctx, trees?.[i], x, y + 6, sway(i));
    }
    const glowK = 0.3 + 0.35 * st + 0.3 * s.pulse;
    for (const [x, y, i, sc] of [[-140, -296, 0, 1 + st * 0.12], [128, -304, 1, 1 + st * 0.15]]) {
      put(ctx, ART?.mush?.[i], x, y + 6, sway(i + 3) * 0.5, sc);
      if (!fl) glowE(ctx, x, y - (i ? 70 : 110) * sc, (i ? 44 : 70) * sc, (i ? 24 : 36) * sc, '#c8ff6a', 0.18 * glowK);
    }
    if (!fl) {
      // 작은 버섯 무리 (여왕 발치)
      for (let k = 0; k < 5; k++) {
        const x = 30 + k * 12, y = -316 + (k % 2) * 3, r = 6 + (k % 3) * 2 + st;
        ctx.fillStyle = '#d8ccb0'; ctx.fillRect(x - 1.5, y - 8, 3, 8);
        ctx.beginPath(); ctx.ellipse(x, y - 8, r, r * 0.55, 0, PI, TAU); ctx.fillStyle = '#ece0c6'; ctx.fill(); ctx.strokeStyle = '#2a1e14'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }
  drawStump(ctx, x, y, i) {
    const fl = R.fl;
    ctx.beginPath(); ctx.moveTo(x - 16, y + 4); ctx.lineTo(x - 13, y - 48); ctx.lineTo(x - 4, y - 38); ctx.lineTo(x + 2, y - 62); ctx.lineTo(x + 8, y - 44); ctx.lineTo(x + 14, y - 52); ctx.lineTo(x + 17, y + 4); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bh_stump', x - 16, 0, x + 16, 0, [0, '#2a2418', 0.5, '#5a4c36', 1, '#1a160e']), 2.4);
    if (!fl) { ctx.fillStyle = '#c8b890'; ctx.beginPath(); ctx.moveTo(x - 4, y - 38); ctx.lineTo(x + 2, y - 62); ctx.lineTo(x + 8, y - 44); ctx.closePath(); ctx.fill(); }
  }
  /** 체력이 줄수록 벌어지는 깊은 상처 + P3 두개골 금 */
  drawWounds(ctx) {
    if (R.fl) return;
    const dm = this.dmg;
    for (const [th, pts] of GASHES) {
      if (dm < th) continue;
      const k = clamp((dm - th) / 0.1, 0, 1);
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = '#0a0404'; ctx.lineWidth = 9 * k; ctx.stroke();
      ctx.strokeStyle = '#6a1a18'; ctx.lineWidth = 5 * k; ctx.stroke();
      ctx.strokeStyle = 'rgba(200,90,70,0.6)'; ctx.lineWidth = 1.5 * k; ctx.stroke();
      const e = pts[pts.length - 1], dy = (this.t * 30) % 22;
      ctx.fillStyle = '#5a1010'; ctx.beginPath(); ctx.arc(e[0], e[1] + 6 + dy * k, 2.5, 0, TAU); ctx.fill();
    }
  }
  /** 포자 주머니 (맥동 · 핏줄 · 속의 포자) / 터진 자리 */
  drawSac(ctx, sc, t) {
    const fl = R.fl, x = sc.lx, y = sc.ly;
    if (!sc.alive) {
      if (fl) return;
      ctx.fillStyle = '#2a0e08'; ctx.beginPath(); ctx.ellipse(x, y, 18, 14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a9a50'; ctx.lineWidth = 2; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; ctx.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 10); ctx.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 16 + 4); }
      ctx.stroke();
      const dy = (t * 26 + sc.i * 9) % 30; ctx.fillStyle = GOO; ctx.beginPath(); ctx.arc(x + 2, y + 14 + dy, 2.4, 0, TAU); ctx.fill();
      return;
    }
    const g = sc.grow, pul = 1 + Math.sin(t * (3 + this.pose.pulse * 14) + sc.i * 2) * (0.05 + 0.1 * this.pose.pulse);
    const r = (20 + sc.i * 2) * (0.3 + 0.7 * g) * pul;
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.9, 0.2, 0, TAU);
    ink(ctx, fl ? '#fff' : LG(ctx, 'bh_sac', 0, -24, 0, 24, [0, '#f0ffb0', 0.45, SAC, 1, '#5a6a20']), 2);
    if (!fl) {
      ctx.strokeStyle = 'rgba(120,40,40,0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = k * 1.6 + sc.i; ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.9); ctx.quadraticCurveTo(Math.cos(a + 0.5) * r * 0.4, Math.sin(a + 0.5) * r * 0.4, 0, 0); } ctx.stroke();
      glow(ctx, 0, 0, r * 1.8, SPORE, 0.35 + 0.4 * this.pose.pulse + (sc.hitT > 0 ? 0.6 : 0));
      ctx.fillStyle = 'rgba(230,255,160,0.8)'; for (let k = 0; k < 5; k++) { const a = t * 1.5 + k * 1.3; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.45, Math.sin(a * 1.3) * r * 0.4, 1.6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.3, r * 0.16, -0.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  /** 머리: 구운 머리 + 빈 눈구멍의 초록 불빛 + 턱 + 침 + P3 두개골 금 */
  drawHead(ctx) {
    const fl = R.fl, t = this.t;
    ctx.save();
    ctx.translate(NECK[0], NECK[1]);          // 몸 변환(bodyXf) 안이므로 목 관절 그대로
    ctx.rotate(this.headA - this.bodyA);
    // 목 살 (몸통과 머리를 잇는다)
    ctx.beginPath(); ctx.moveTo(-40, -60); ctx.quadraticCurveTo(-10, -70, 10, -56); ctx.lineTo(0, 36); ctx.quadraticCurveTo(-30, 50, -52, 30); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bh_neck', 0, -70, 0, 50, [0, '#5a5a3a', 1, HIDE_D]), 2.4);
    // 아래턱 (관절 = 머리 지역 (40, 24))
    const ja = 0.04 + this.jawK * 0.55;
    put(ctx, ART?.jaw, 40, 24, ja);
    if (!fl && this.jawK > 0.15) {
      // 입속 · 침 · (부패의 숨) 초록 빛
      ctx.fillStyle = '#1a0806'; ctx.beginPath(); ctx.moveTo(44, 22); ctx.lineTo(160, 18); ctx.lineTo(44 + Math.cos(ja) * 110, 26 + Math.sin(ja) * 110); ctx.closePath(); ctx.fill();
      glowE(ctx, 110, 30 + this.jawK * 20, 60, 22, '#9ad040', 0.3 * this.jawK + 0.6 * this.pose.breath);
      ctx.strokeStyle = 'rgba(190,220,140,0.55)'; ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { const x = 80 + k * 26, L = 18 + ((t * 20 + k * 11) % 26); ctx.beginPath(); ctx.moveTo(x, 20); ctx.quadraticCurveTo(x + 3, 20 + L * 0.5, x, 20 + L); ctx.stroke(); }
    }
    put(ctx, ART?.head, 0, 0);
    if (!ART && !fl) { ctx.fillStyle = BONE; ctx.beginPath(); ctx.ellipse(80, -20, 80, 40, 0, 0, TAU); ctx.fill(); }
    if (!fl) {
      // 빈 눈구멍의 초록 불빛
      const pk = 0.7 + 0.3 * Math.sin(t * 5);
      glow(ctx, 76, -42, 26, GLOW, 0.8 * pk);
      glow(ctx, 78, -42, 6, '#ffffff', 0.9, true);
      if (this.dmgStage >= 2) {
        ctx.strokeStyle = '#1a140a'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(100, -72); ctx.lineTo(108, -54); ctx.lineTo(100, -42); ctx.lineTo(114, -26); ctx.lineTo(108, -10); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,255,90,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    ctx.restore();
  }
  /** 여왕이 붙은 자리에서 기우는 각 (몸 기울기 제외): 잠들면 조금, 무릎 꿇으면 앞으로 푹 늘어진다 */
  queenA() {
    const s = this.pose, kn = Math.max(s.kneel, s.slump * 0.7);
    return -0.08 + kn * 1.5 + (this.queenAwake ? 0 : 0.18) - s.qRaise * 0.12;
  }
  /** 여왕 (몸 변환 안): 붙은 자리에서 몸을 세우고, 뿌리로 짐승의 살에 박혀 있다 */
  drawQueen(ctx) {
    const s = this.pose;
    const kn = Math.max(s.kneel, s.slump * 0.7);
    const bx = QBASE[0], by = QBASE[1];
    const fl = R.fl, t = this.t;
    // 살로 파고든 뿌리
    if (!fl) {
      ctx.strokeStyle = '#c8c0a4'; ctx.lineWidth = 2.4;
      for (let k = 0; k < 6; k++) {
        const ex = bx - 90 + k * 34, ey = by + 40 + (k % 2) * 16, pk = 0.5 + 0.5 * Math.sin(t * 3 + k);
        ctx.beginPath(); ctx.moveTo(bx - 6 + k * 3, by + 4); ctx.bezierCurveTo(bx - 20 + k * 6, by + 18, ex + 10, ey - 20, ex, ey); ctx.stroke();
        glowE(ctx, ex, ey, 10, 6, SPORE, 0.25 * pk * (0.4 + this.queenGlow));
      }
    }
    // 여왕 몸 (무릎 꿇으면 앞으로 늘어진다)
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(this.queenA());
    this.drawQueenFigure(ctx, 0, 0, 1, false);
    ctx.restore();
    // 무릎 꿇으면 늘어진 두 팔이 바닥 가까이까지 (판정도 바닥−150 까지 내려온다)
    if (kn > 0.05 && !R.fl) {
      const c = Math.cos(this.queenA()), sn = Math.sin(this.queenA());
      const sxw = bx + 9 * c + 58 * sn, syw = by + 9 * sn - 58 * c;          // 어깨 (여왕 지역 (9, −58))
      const tip = this.localFromBody(this.bx, -150 + 30);
      const ex = lerp(sxw + 30, tip[0] + 40, kn), ey = lerp(syw - 20, tip[1], kn);
      ctx.strokeStyle = QUEEN; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const o of [0, 14]) { ctx.beginPath(); ctx.moveTo(sxw, syw); ctx.quadraticCurveTo(sxw + 40 + o, syw + 20, ex + o, ey - o * 0.5); ctx.stroke(); }
      ctx.strokeStyle = '#d8d2bc'; ctx.lineWidth = 1.4;
      ctx.beginPath(); for (let q = 0; q < 5; q++) { ctx.moveTo(ex + 6, ey); ctx.quadraticCurveTo(ex + 10 + q * 3, ey + 10, ex + 4 + q * 5, ey + 22 + (q % 2) * 6); } ctx.stroke();
    }
  }
  /** 몸 지역 좌표(기울기 적용 전 좌표계 = 캔버스가 bodyXf 된 상태)로 되돌린다: 목표 점 (몸 지역 기울기 후 x · y) → 그리는 좌표 */
  localFromBody(_bx, ly) {
    const k = this._k2 ?? (this._k2 = [0, 0]);
    this.bodyPt(QBASE[0], QBASE[1], k);
    // 목표: 여왕 앞 바닥 쪽 (기울기 후 좌표) → 기울기 전 좌표로 역변환
    const tx = k[0] + 60, ty = ly;
    const a = -this.bodyA, c = Math.cos(a), s = Math.sin(a), dx = tx - PIVOT[0], dy = ty - this.drop - PIVOT[1];
    k[0] = PIVOT[0] + dx * c - dy * s; k[1] = PIVOT[1] + dx * s + dy * c;
    return k;
  }
  /** 여왕 형상 (원점 = 허리 밑동, 위 = −y). withered = 시든 모습 */
  drawQueenFigure(ctx, x, y, sc, withered) {
    const fl = R.fl, t = this.t, s = this.pose, gk = withered ? 0 : this.queenGlow;
    const skin = fl ? '#fff' : withered ? '#8a846a' : QUEEN;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    // 허리 아래: 균사 덩어리
    ctx.beginPath(); ctx.ellipse(0, 2, 26, 12, 0, 0, TAU);
    ink(ctx, fl ? '#fff' : withered ? '#6a644a' : '#cfc8b0', 2);
    // 균사 머리카락 (뒤로 흐른다)
    if (!fl) {
      ctx.strokeStyle = withered ? 'rgba(140,130,100,0.8)' : 'rgba(240,238,220,0.85)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k < 9; k++) { const sw = Math.sin(t * 1.4 + k) * 8; ctx.moveTo(4, -84 + k); ctx.bezierCurveTo(-14 - k * 3, -80, -30 - k * 4 + sw, -60 + k * 3, -44 - k * 5 + sw, -30 + k * 6); }
      ctx.stroke();
    }
    // 몸통 (야윈 창백한 상체)
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.bezierCurveTo(-16, -24, -10, -48, -8, -62); ctx.quadraticCurveTo(2, -70, 12, -62);
    ctx.bezierCurveTo(16, -46, 16, -22, 12, 0); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, withered ? 'bh_qw' : 'bh_q', -14, 0, 16, 0, [0, QUEEN_D, 0.5, skin, 1, QUEEN_D]), 1.8);
    if (!fl) {
      ctx.strokeStyle = 'rgba(80,90,50,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const yy = -50 + k * 8; ctx.moveTo(-8, yy); ctx.quadraticCurveTo(0, yy + 4, 10, yy); } ctx.stroke();
      // 몸을 타고 오르는 균사 핏줄
      ctx.strokeStyle = withered ? 'rgba(80,70,40,0.6)' : rgba(SPORE, 0.4 + 0.4 * gk); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.bezierCurveTo(-2, -20, -10, -36, -4, -56); ctx.moveTo(6, 0); ctx.bezierCurveTo(10, -18, 2, -34, 8, -54); ctx.stroke();
    }
    // 팔 (뿌리 같은 긴 손가락) — 깨어나면 들어 올린다
    const up = withered ? -0.5 : s.qRaise;
    for (const side of [-1, 1]) {
      const sx = side * 9, sy = -58;
      const ex = sx + side * 18 - up * side * 6, ey = sy + 20 - up * 46;
      const hx = ex + side * 12 + up * 8, hy = ey + 22 - up * 44;
      ctx.strokeStyle = skin; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
      if (!fl) {
        ctx.strokeStyle = '#1a1810'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.strokeStyle = withered ? '#6a6450' : '#d8d2bc'; ctx.lineWidth = 1.4;
        ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = Math.atan2(hy - ey, hx - ex) + (k - 1.5) * 0.35; ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8 + 2, hx + Math.cos(a) * 16, hy + Math.sin(a) * 16 + 6); } ctx.stroke();
      }
    }
    // 머리: 창백한 얼굴 + 버섯 갓 왕관
    ctx.beginPath(); ctx.ellipse(4, -76, 9, 11, 0.1, 0, TAU);
    ink(ctx, fl ? '#fff' : skin, 1.6);
    if (!fl) {
      if (gk > 0.05) { glow(ctx, 1, -77, 7, '#e8ffb0', 0.9 * gk); glow(ctx, 8, -76, 7, '#e8ffb0', 0.9 * gk); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, -78, 2, 2); ctx.fillRect(7, -77, 2, 2); }
      else { ctx.strokeStyle = '#2a2818'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-1, -77); ctx.lineTo(3, -76); ctx.moveTo(6, -76); ctx.lineTo(10, -75); ctx.stroke(); }
      ctx.fillStyle = '#1a1208'; ctx.beginPath(); ctx.ellipse(5, -69, 2, 1.2 + s.qRaise * 1.5, 0, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-18, -84); ctx.bezierCurveTo(-16, -104, 24, -106, 26, -84); ctx.quadraticCurveTo(4, -80, -18, -84); ctx.closePath();
    ink(ctx, fl ? '#fff' : LG(ctx, 'bh_qcap', 0, -104, 0, -82, [0, '#f8f0dc', 1, '#8a7060']), 1.6);
    if (!fl) {
      ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let k = 0; k < 7; k++) { ctx.moveTo(-14 + k * 6, -84); ctx.lineTo(-12 + k * 6, -80); } ctx.stroke();
      for (let k = 0; k < 4; k++) { ctx.fillStyle = rgba('#c8ff6a', 0.4 + 0.5 * gk); ctx.beginPath(); ctx.arc(-8 + k * 9, -94 + (k % 2) * 3, 1.8, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }
  /** 사망: 등에 하얀 꽃과 새싹이 핀다 */
  drawBlooms(ctx) {
    const k = this.bloomK;
    if (k <= 0 || R.fl) return;
    for (let i = 0; i < 14; i++) {
      const u = i / 13, x = -210 + u * 360, y = -300 - Math.sin(u * PI) * 16, g = clamp(k * 1.6 - h01(i) * 0.6, 0, 1);
      if (g <= 0) continue;
      ctx.strokeStyle = '#6aa040'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 10 * g, x + 2, y - 18 * g); ctx.stroke();
      ctx.fillStyle = '#8ac850'; ctx.beginPath(); ctx.ellipse(x - 5 * g, y - 10 * g, 4 * g, 2 * g, -0.6, 0, TAU); ctx.fill();
      if (g > 0.6) { const r = 4 * (g - 0.6) / 0.4; ctx.fillStyle = i % 3 ? '#fff4fa' : '#ffd8ec'; for (let q = 0; q < 5; q++) { const a = q * TAU / 5 + i; ctx.beginPath(); ctx.arc(x + 2 + Math.cos(a) * r, y - 20 + Math.sin(a) * r, r * 0.7, 0, TAU); ctx.fill(); } ctx.fillStyle = '#ffe070'; ctx.beginPath(); ctx.arc(x + 2, y - 20, r * 0.45, 0, TAU); ctx.fill(); }
    }
  }
  /** 배 아래에서 흔들리는 이끼 늘어짐 (가까운 다리 앞) */
  drawMossDrapes(ctx) {
    if (R.fl) return;
    const t = this.t, dr = this.drop;
    ctx.strokeStyle = 'rgba(120,150,70,0.75)'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const x = -170 + i * 34, y = -124 + dr + Math.abs(x) * 0.03, L = 14 + h01(i) * 22, sw = Math.sin(t * 2 + i) * 4; ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw, y + L * 0.5, x - 2 + sw * 1.5, y + L); }
    ctx.stroke();
  }
}

// ───────────────────────── 다리 살덩이 ─────────────────────────
/** 가늘어지는 살덩이 팔다리 경로 (팔다리 지역: 원점 = 뿌리, +x = 끝 쪽). 위쪽 윤곽이 근육처럼 부푼다 */
function limbPath(ctx, len, r0, r1, bulge) {
  const rm = (r0 + r1) * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(len * 0.42, -rm - bulge, len, -r1);
  ctx.arc(len, 0, r1, -PI / 2, PI / 2);
  ctx.quadraticCurveTo(len * 0.55, rm + bulge * 0.45, 0, r0);
  ctx.arc(0, 0, r0, PI / 2, PI * 1.5);
  ctx.closePath();
}
/**
 * 살진 팔다리 한 마디: (x0,y0) 굵기 r0 → (x1,y1) 굵기 r1. 그라디언트는 팔다리 지역 좌표로 캐시(LG)한다.
 * o.open (0~1): 뿌리 쪽 이 비율까지는 윤곽선을 그리지 않는다 (몸통에 녹아든다) · o.folds / o.rootFolds: 끝 · 뿌리 쪽 가죽 주름 수 · o.moss: 이끼 얼룩
 */
function fleshLimb(ctx, x0, y0, x1, y1, r0, r1, bulge, col, key, o = {}) {
  const len = Math.max(1, Math.hypot(x1 - x0, y1 - y0)), fl = R.fl, rm = (r0 + r1) * 0.5;
  const rr = Math.round(Math.max(r0, r1) + bulge);
  ctx.save();
  ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
  limbPath(ctx, len, r0, r1, bulge);
  ctx.fillStyle = fl ? '#ffffff' : LG(ctx, `${key}${col}${rr}`, 0, -rr, 0, rr, [0, mix(col, '#e8e0b0', 0.3), 0.24, col, 0.68, mix(col, '#000000', 0.5), 0.88, mix(col, '#8aa060', 0.22), 1, mix(col, '#000000', 0.72)]);
  ctx.fill();
  if (fl) { ctx.restore(); return; }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o.open) {
    ctx.save();
    ctx.beginPath(); ctx.rect(len * o.open, -rr - 30, len + r1 + 60, rr * 2 + 60); ctx.clip();
    limbPath(ctx, len, r0, r1, bulge);
    ctx.strokeStyle = '#080904'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.restore();
  } else { ctx.strokeStyle = '#080904'; ctx.lineWidth = 2.6; ctx.stroke(); }
  // 가죽 주름 (관절 쪽으로 몰린다): 어두운 골 + 밝은 턱
  const fold = (x, w) => { ctx.moveTo(x, -w * 0.86); ctx.quadraticCurveTo(x - 7, 0, x + 1, w * 0.86); };
  if (o.folds || o.rootFolds) {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < (o.folds ?? 0); i++) fold(len - r1 * 0.2 - i * 8, lerp(r1, rm, i * 0.18));
    for (let i = 0; i < (o.rootFolds ?? 0); i++) fold(r0 * 0.6 + i * 8, lerp(r0, rm, i * 0.18));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,220,160,0.16)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < (o.folds ?? 0); i++) fold(len - r1 * 0.2 - i * 8 + 2.5, lerp(r1, rm, i * 0.18) * 0.8);
    for (let i = 0; i < (o.rootFolds ?? 0); i++) fold(r0 * 0.6 + i * 8 + 2.5, lerp(r0, rm, i * 0.18) * 0.8);
    ctx.stroke();
  }
  if (o.moss) {
    // 이끼 얼룩 · 사마귀 (윗면)
    glowE(ctx, len * 0.38, -rm * 0.55, rm * 0.7, rm * 0.35, MOSS, 0.55);
    ctx.fillStyle = '#4a4a2c'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(len * (0.3 + i * 0.13), -rm * (0.25 + (i % 2) * 0.3), 2.2 + (i % 3), 0, TAU); ctx.fill(); ctx.stroke(); }
  }
  ctx.restore();
}

// ───────────────────────── 지대 · 탄 그림 ─────────────────────────
function chevrons(ctx, z, dir, t) {
  ctx.globalCompositeOperation = 'lighter';
  const k = clamp(z.t / 1.0, 0, 1), y = z.y + z.h * 0.55;
  ctx.fillStyle = rgba('#e8ff90', 0.2 + 0.5 * k);
  const n = Math.max(1, Math.floor(z.w / 110));
  for (let i = 0; i < n; i++) {
    const u = ((i / n + t * 0.7) % 1), x = dir > 0 ? z.x + u * z.w : z.x + z.w - u * z.w;
    ctx.beginPath(); ctx.moveTo(x + dir * 24, y); ctx.lineTo(x - dir * 8, y - 20); ctx.lineTo(x - dir * 8, y + 20); ctx.closePath(); ctx.fill();
  }
}
function paintRock(ctx, z, w, x, top, bot) {
  if (!z.started) {
    warnFloor(ctx, x, bot, 80, z.k, '#e0c080', w.time);
    warnRect(ctx, x - 16, Math.max(top, (w.camera?.y ?? top)), 32, bot - Math.max(top, (w.camera?.y ?? top)), z.k * 0.5, '#e0c080', w.time);
    return;
  }
  const k = clamp((z.t - z.warn) / z.dur, 0, 1), y = lerp(top, bot - 30, k * k);
  ctx.save(); ctx.translate(x, y); ctx.rotate(z.data.rot + z.t * 4);
  ctx.beginPath(); ctx.moveTo(-26, -8); ctx.lineTo(-12, -28); ctx.lineTo(14, -26); ctx.lineTo(30, -4); ctx.lineTo(20, 24); ctx.lineTo(-16, 26); ctx.lineTo(-30, 8); ctx.closePath();
  ctx.fillStyle = R.fl ? '#fff' : LG(ctx, 'bh_rock', 0, -28, 0, 26, [0, '#8a8068', 1, '#2a2418']); ctx.fill();
  ctx.strokeStyle = '#0a0806'; ctx.lineWidth = 2.4; ctx.stroke();
  if (!R.fl) { ctx.fillStyle = 'rgba(100,140,50,0.7)'; ctx.beginPath(); ctx.ellipse(-6, -18, 10, 5, 0.3, 0, TAU); ctx.fill(); }
  ctx.restore();
}
/** 뿌리 파도: 예고 = 바닥 길을 따라 초록 균열, 판정 = 앞머리에서 솟는 뾰족한 뿌리와 지나간 자리의 가라앉는 뿌리 */
function paintRoots(ctx, z, w, x0, dir, len, floor) {
  if (!z.started) {
    const k = z.k;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#b8e04a', 0.25 + 0.5 * k); ctx.lineWidth = 2 + 3 * k;
    ctx.beginPath();
    for (let d = 0; d <= len; d += 20) { const x = x0 + dir * d, yy = floor - 2 - Math.sin(d * 0.08 + w.time * 6) * 2 * k; if (d === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
    warnFloor(ctx, x0, floor, 90, k, '#b8e04a', w.time);
    return;
  }
  if (R.fl) return;
  for (const s of z.data.spikes) {
    const age = z.t - s.t, grow = clamp(age / 0.08, 0, 1) * clamp(1 - (age - 0.25) / 0.25, 0, 1);
    if (grow <= 0.01) continue;
    const h = 120 * s.s * grow;
    for (const o of [-18, 0, 16]) {
      const hh = h * (o === 0 ? 1 : 0.65), bx = s.x + o * s.s;
      ctx.beginPath(); ctx.moveTo(bx - 9, floor); ctx.quadraticCurveTo(bx - 4 + dir * 4, floor - hh * 0.5, bx + dir * 6, floor - hh); ctx.quadraticCurveTo(bx + 4, floor - hh * 0.4, bx + 9, floor); ctx.closePath();
      ctx.fillStyle = LG(ctx, 'bh_root', 0, floor - 120, 0, floor, [0, '#d8d0a0', 0.4, '#6a5a3a', 1, '#2a2014']); ctx.fill();
      ctx.strokeStyle = '#0a0806'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    glowE(ctx, s.x, floor - 6, 40, 10, '#b8e04a', 0.35 * grow);
  }
}
/** 균사 망자가 솟을 자리의 꿈틀대는 뿌리 */
function paintTendrils(ctx, x, floor, k) {
  if (R.fl) return;
  ctx.strokeStyle = rgba('#d8d0a0', 0.4 + 0.5 * k); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const ox = (i - 2) * 12, h = 10 + 30 * k * (0.6 + (i % 2) * 0.4); ctx.moveTo(x + ox, floor); ctx.quadraticCurveTo(x + ox + Math.sin(k * 20 + i) * 8, floor - h * 0.5, x + ox + (i - 2) * 4, floor - h); }
  ctx.stroke();
}
/** 부패의 숨: 예고 = 원뿔 영역, 판정 = 노란 초록 독기 뭉게 */
function paintBreath(ctx, z, w, m, f, floor, rects) {
  if (!z.started) {
    for (const r of rects) warnRect(ctx, r.x, r.y, r.w, r.h, z.k * 0.8, '#b8e04a', w.time);
    return;
  }
  if (R.fl) return;
  const a = clamp(Math.min((z.t - z.warn) / 0.2, (z.dur + z.warn - z.t) / 0.3), 0, 1);
  for (let i = 0; i < 8; i++) {
    const u = ((z.t * 1.6 + i / 8) % 1), x = m.x + f * u * 520, y = lerp(m.y, floor - 100, Math.min(1, u * 1.6)) + Math.sin(z.t * 5 + i) * 10, r = 40 + u * 70;
    glowE(ctx, x, y, r, r * 0.7, i % 2 ? '#8ab82e' : '#c8e060', 0.45 * a * (1 - u * 0.4));
  }
}
function thornRender(ctx, p) {
  ctx.rotate(Math.atan2(p.vy, p.vx));
  glowE(ctx, -6, 0, 22, 7, '#c8ff6a', 0.4);
  ctx.fillStyle = '#e8e0c4'; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-10, -4); ctx.lineTo(-14, 0); ctx.lineTo(-10, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#2a2014'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = '#6a5a3a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(-6, -8); ctx.moveTo(2, 3); ctx.lineTo(-2, 8); ctx.stroke();
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
