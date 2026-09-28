// 수호신 렌더러 · 연출 도우미 — owner: CMP-GUARD-ART-A (companions §11.3; ART_DECISION: 채색 퍼핏 + 절차 연출)
//
//  drawGuardian(ctx, g, world, opts) → true = 그렸다 (guardian.js 의 자리 표시 그림을 건너뛴다)
//    1) 채색 퍼핏: 레지스트리(kind 'companion', reg/cmp-guard-art-*.js)에 등록되어 있고 리그가 준비됐으면 그것 (어느 수호신 id 든).
//       준비 전에는 아래 절차 그림 → 준비되면 0.3초 교차 페이드. 끄기: ?painted=0 · window.__paintedOff · settings.painted=false
//    2) 절차 그림(벡터 HD): 1부 여섯 = GUARDIAN_DRAW_A (이 파일), 나머지 = guardians_b.js GUARDIAN_DRAW_B[id] (CMP-GUARD-ART-B)
//    3) 둘 다 없으면 false → guardian.js drawPlaceholder
//    호출 규약 (guardian.js · companion_join.js): ctx 는 월드(또는 메뉴) 좌표, save/restore 안, globalAlpha 에 g.alpha 가 이미 곱해져 있다.
//    g 필드: id def anim animT facing t seed vx vy perched hopY() d.awakened act target (메뉴의 가짜 g 도 같다, world 는 null 일 수 있다)
//    opts = { alpha (이미 적용됨 — 다시 곱하지 않는다), hop (지면형 깡충 높이), awakened (유대 4단계 외형) }
//  drawGuardianIcon(ctx, id, x, y, r)  초상화가 없을 때 쓰는 원형 머리 아이콘 (크기별로 한 번 구워 캐시). B 수호신은 GUARDIAN_DRAW_B 그림으로
//  GUARDIAN_DRAW_A[id] = (ctx, g, world, opts)   발 중앙 원점·facing 반전을 스스로 한다 (true 반환)
//  drawGuardianProcedural(ctx, g, world, opts)   채색을 건너뛰고 절차 그림만 (갤러리 A/B 비교용)
//  연출 도우미 — 모두 (ctx, e, world) 이고 그렸으면 true (guardian.js / guardian_ai_b.js 의 drew() 가 대체 그림을 건너뛴다):
//    fxFairyDome (아리아 결계 GFx: 플레이어 사각형) · fxShieldWall (가웨인 방패벽 GFx: e.data.f) · fxMeteor (운석 투사체: 원점 = 중심) ·
//    fxPhantomWolf (늑대 무리 투사체: 원점 = 중심) · fxHolyBeam (성광 GHit: e.data.f) · fxBoneShard (뼛조각 투사체) ·
//    fxClockFace (틱톡 시계판: e.cx/cy 중심, e.data {R, hm, hh, hs, ga}) · fxScytheSweep (모르스 낫 띠: e.data {f, k, wind, color}) ·
//    fxSecretOutline (올빼미 비밀의 눈: (ctx, g, world), g.mem.secrets = [tx,ty,…]) · fxBreath (크론 뼈불 원뿔 GHit: e.data.f)
//  채색 모듈 공유 (src/render/painted/companions/*.js 가 import): PO (이번 그리기의 {cam, opts, world}) · gGlow · gStar · gHalo · gSparkles
//
// 규칙: 그리기 코드는 게임 상태를 바꾸지 않는다 (g._g* 렌더 전용 필드만), Math.random 금지 (결정적 해시), 그레이디언트는 굽기 때만
// (프레임마다 새로 만들지 않는다), 품질: world.fx.quality (<0.95 이면 번짐·잔상 줄임), 모바일 예산 §5.2 (수호신 한 마리 ≤ 0.15 ms).
import { TAU, clamp, lerp } from '../core/math.js';
import { TILE } from '../core/game.js';
import * as GB from './guardians_b.js';
import { GUARDIANS } from '../data/companions.js';
import { hasPainted, paintedState, paintedEnabled, preloadPainted, drawPaintedDirect } from './painted/registry.js';

// ───────────────────────── 공용 도우미 ─────────────────────────
const OUT = 'rgba(12,6,10,0.92)';
const hasDoc = typeof document !== 'undefined';
const hsh = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
/** 연출 품질 0.4~1 (메뉴: 1) */
const qOf = (world) => world?.fx?.quality ?? 1;
const hi = (world) => qOf(world) >= 0.95;
const gameOf = (world) => world?.game ?? (typeof window !== 'undefined' ? window.__game : null);
const timeOf = (g, world) => world?.time ?? g?.t ?? 0;

function mk(w, h) {
  if (!hasDoc) return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
/** 부위 스프라이트 굽기: 논리 좌표 상자 (x0,y0)-(x1,y1) 안을 fn(ctx) 로 그린다 (원점 = 피벗). 배율 S 텍셀/논리px */
const BS = 4;
function bake(x0, y0, x1, y1, fn, S = BS) {
  const c = mk((x1 - x0) * S, (y1 - y0) * S);
  if (!c) return null;
  const x = c.getContext('2d');
  x.scale(S, S); x.translate(-x0, -y0);
  x.lineJoin = 'round'; x.lineCap = 'round';
  fn(x);
  return { c, x0, y0, w: x1 - x0, h: y1 - y0 };
}
/** 구운 스프라이트를 피벗 (x,y) 에 회전·배율로 */
function blit(ctx, s, x, y, rot = 0, sx = 1, sy = 1, a = 1) {
  if (!s || a <= 0.003) return;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (a !== 1) ctx.globalAlpha *= a;
  ctx.drawImage(s.c, s.x0, s.y0, s.w, s.h);
  ctx.restore();
}
/** 같은 스프라이트를 가산 합성으로 (빛나는 테두리·번짐) */
function blitAdd(ctx, s, x, y, rot, sx, sy, a) {
  if (!s || a <= 0.003) return;
  const g = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  blit(ctx, s, x, y, rot, sx, sy, a);
  ctx.globalCompositeOperation = g;
}
/** 실루엣 색 변형 (굽기 때 한 번): 불투명 부분을 color 로 */
function tinted(s, color, alpha = 1) {
  if (!s) return null;
  const c = mk(s.c.width, s.c.height);
  if (!c) return null;
  const x = c.getContext('2d');
  x.drawImage(s.c, 0, 0);
  x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return { ...s, c };
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
const GLOWS = new Map();
function glowSpr(color, hard = 0.35) {
  const k = color + hard;
  let c = GLOWS.get(k);
  if (c || !hasDoc) return c ?? null;
  c = mk(64, 64);
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(hard, hexA(color, 0.42)); gr.addColorStop(1, hexA(color, 0));
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  GLOWS.set(k, c);
  return c;
}
/** 가산 빛 (x,y 반지름 r) — 채색 모듈도 쓴다 */
export function gGlow(ctx, x, y, r, color, a = 1, hard = 0.35) {
  if (a <= 0.01 || r <= 0) return;
  const s = glowSpr(color, hard);
  if (!s) return;
  const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
}
let STAR = null;
function starSpr() {
  if (STAR || !hasDoc) return STAR;
  const c = mk(32, 32), x = c.getContext('2d');
  const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,190,0.55)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  x.fillStyle = 'rgba(255,255,240,0.95)';
  x.beginPath(); x.moveTo(16, 1); x.lineTo(17.3, 14.7); x.lineTo(31, 16); x.lineTo(17.3, 17.3); x.lineTo(16, 31); x.lineTo(14.7, 17.3); x.lineTo(1, 16); x.lineTo(14.7, 14.7); x.closePath(); x.fill();
  STAR = c;
  return c;
}
/** 반짝이 (네 갈래 별) — 채색 모듈도 쓴다 */
export function gStar(ctx, x, y, r, a = 1, rot = 0) {
  const s = starSpr();
  if (!s || a <= 0.01) return;
  const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * Math.min(1, a);
  if (rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.drawImage(s, -r, -r, r * 2, r * 2); ctx.restore(); }
  else ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
}
/** 후광 고리 (타원 + 번짐) — 채색 모듈도 쓴다 */
export function gHalo(ctx, x, y, rx, ry, color = '#ffe7a0', a = 1, w = 0.9, rot = 0) {
  if (a <= 0.01) return;
  const gco = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * a * 0.45; ctx.strokeStyle = color; ctx.lineWidth = w * 2.6;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.stroke();
  ctx.globalAlpha = ga * a; ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = w;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.stroke();
  ctx.globalCompositeOperation = gco; ctx.globalAlpha = ga;
}
/** 뒤로 흩날리는 반짝이 꼬리 (결정적): 몸 기준 (x,y) 뒤쪽으로 n 개 */
export function gSparkles(ctx, t, x, y, n, spread = 12, color = '#fff2b0', a = 1) {
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.9 + i / n + hsh(i) * 0.3) % 1;
    const sx = x - 1 - ph * spread - hsh(i + 7) * 3, sy = y + ph * spread * 0.7 + Math.sin(t * 3 + i * 1.7) * 1.6;
    gStar(ctx, sx, sy, (1.8 + hsh(i + 3) * 1.4) * (1 - ph), a * (1 - ph) * 0.9, t * 2 + i);
    if (i % 2 === 0) gGlow(ctx, sx, sy, 3 * (1 - ph), color, 0.25 * a * (1 - ph));
  }
}
/** 윤곽선 있는 굵은 선 (팔다리·뼈) */
function limb(x, pts, w, col, out = OUT, ow = 0.7) {
  x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
  x.strokeStyle = out; x.lineWidth = w + ow; x.stroke();
  x.strokeStyle = col; x.lineWidth = w; x.stroke();
}
function lin(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); for (const [k, c] of stops) g.addColorStop(k, c); return g; }
function rad(x, cx, cy, r0, r1, stops, fx = cx, fy = cy) { const g = x.createRadialGradient(fx, fy, r0, cx, cy, r1); for (const [k, c] of stops) g.addColorStop(k, c); return g; }
/** 잎/꽃잎 모양 (뿌리 원점 → len 방향) */
function leaf(x, cx, cy, len, wid, ang, c0, c1, vein = 'rgba(220,255,190,0.45)') {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.45, -wid, len, 0); x.quadraticCurveTo(len * 0.45, wid, 0, 0); x.closePath();
  x.fillStyle = lin(x, 0, 0, len, 0, [[0, c0], [1, c1]]); x.fill();
  x.strokeStyle = OUT; x.lineWidth = 0.28; x.stroke();
  x.strokeStyle = vein; x.lineWidth = 0.2; x.beginPath(); x.moveTo(len * 0.08, 0); x.lineTo(len * 0.85, 0); x.stroke();
  x.restore();
}
/** 뾰족한 털 뭉치 가장자리 (늑대 등) */
function tufts(x, pts, dir, len, col, w = 0.45) {
  x.strokeStyle = col; x.lineWidth = w;
  x.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i], a = dir + (hsh(i + px) - 0.5) * 0.5, l = len * (0.6 + hsh(i * 3 + py) * 0.6);
    x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l * 0.6 + 0.4, py + Math.sin(a) * l * 0.6, px + Math.cos(a) * l, py + Math.sin(a) * l);
  }
  x.stroke();
}
/** 곡선 위 점들 (베지어) */
function bez(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
const CACHE = new Map();
function cached(key, make) {
  if (CACHE.has(key)) return CACHE.get(key);
  if (!hasDoc) return null;
  const v = make();
  CACHE.set(key, v);
  return v;
}

// ───────────────────────── 채색 퍼핏 연결 ─────────────────────────
/** 채색 모듈이 읽는 이번 그리기의 부가 정보 (cam: 월드 변환 전 ctx 행렬 — 월드 좌표 연출용, opts, world) */
export const PO = { cam: null, opts: null, world: null };
/** 채색 모듈용: 각성 여부 (drawGuardian opts.awakened 우선, 없으면 g.d.awakened — 절차 그림 pre() 와 같은 규칙) */
export const gAwake = (g) => !!(PO.opts?.awakened ?? g?.d?.awakened);
/** 0 = 채색 없음/실패/꺼짐 · 1 = 굽는 중 · 2 = 준비됨 */
function paintedReady(id, world) {
  if (!hasPainted(id)) return 0;
  const game = gameOf(world);
  if (!paintedEnabled(game)) return 0;
  const st = paintedState(id);
  if (st === 'ready') return 2;
  if (st === 'failed' || st === 'none') return 0;
  if (st === 'idle') preloadPainted(id, game);
  return 1;
}
const FADE_MS = 300;

/** 수호신 그리기 (위 설명). true = 그렸다 */
export function drawGuardian(ctx, g, world, opts = {}) {
  if (!g || !g.def) return false;
  const id = g.id ?? g.def.id;
  const pr = paintedReady(id, world);
  if (pr === 2) {
    let k = 1;
    if (g._gvSeen) {
      const now = performance.now();
      if (g._gpT === undefined) g._gpT = now;
      k = clamp((now - g._gpT) / FADE_MS, 0, 1);
      if (k >= 1) g._gvSeen = false;
    }
    if (k < 1) { ctx.save(); ctx.globalAlpha *= 1 - k; drawGuardianProcedural(ctx, g, world, opts); ctx.restore(); }
    ctx.save();
    if (k < 1) ctx.globalAlpha *= k;
    PO.cam = ctx.getTransform(); PO.opts = opts; PO.world = world;
    const f = g.facing < 0 ? -1 : 1, hop = opts.hop ?? (typeof g.hopY === 'function' ? g.hopY() : 0);
    ctx.translate(g.cx, g.bottom + hop);
    ctx.scale(f, 1);
    let ok = false;
    try { ok = drawPaintedDirect(g, ctx, world, id); } catch { ok = false; }
    ctx.restore();
    PO.world = null;
    if (ok) return true;
    // 채색 그리기 실패 (레지스트리가 벡터로 되돌렸다) → 절차 그림
  } else if (pr === 1) g._gvSeen = true;
  return drawGuardianProcedural(ctx, g, world, opts);
}
/** 절차 그림만 (A 는 이 파일, B 는 GUARDIAN_DRAW_B). 없으면 false */
export function drawGuardianProcedural(ctx, g, world, opts = {}) {
  const id = g?.id ?? g?.def?.id;
  const fa = GUARDIAN_DRAW_A[id];
  if (fa) return fa(ctx, g, world, opts) !== false;
  const fb = GB.GUARDIAN_DRAW_B?.[id];
  if (typeof fb === 'function') {
    let r;
    ctx.save();
    try { r = fb(ctx, g, world, opts); } finally { ctx.restore(); }
    return r !== false;
  }
  return false;
}

// ───────────────────────── 공통 자세 값 ─────────────────────────
/** 그리기 준비: 발 중앙으로 옮기고 facing 반전. 반환 = 상태 묶음 (재사용 객체) */
const ST = { t: 0, at: 0, an: 'idle', f: 1, vxf: 0, vy: 0, q: 1, hiQ: true, aw: false, appear: 1, hurt: 0 };
function pre(ctx, g, world, opts) {
  const s = ST;
  s.t = g.t ?? 0; s.at = g.animT ?? 0; s.an = g.anim ?? 'idle';
  s.f = g.facing < 0 ? -1 : 1;
  s.vxf = (g.vx ?? 0) * s.f; s.vy = g.vy ?? 0;
  s.q = qOf(world); s.hiQ = s.q >= 0.95;
  s.aw = !!(opts.awakened ?? g.d?.awakened);
  s.appear = s.an === 'appear' ? easeOut(clamp(s.at / 0.3, 0, 1)) : 1;
  s.hurt = s.an === 'hurt' ? 1 - clamp(s.at / 0.3, 0, 1) : 0;
  const hop = opts.hop ?? (typeof g.hopY === 'function' ? g.hopY() : 0);
  ctx.translate(g.cx ?? 0, (g.bottom ?? 0) + hop);
  ctx.scale(s.f, 1);
  if (s.hurt > 0) ctx.translate(Math.sin(s.t * 70) * 1.2 * s.hurt, 0);
  return s;
}
const isAtk = (an) => an === 'attack' || an === 'assist' || an === 'pounce' || an === 'blink';

// ═════════════════════════ 아리아 (빛의 요정) ═════════════════════════
// 발 원점, 몸 중심 (0,-12). 황금 머리 · 잎사귀 꽃잎 드레스 · 잠자리 날개 두 쌍(움직임 번짐) · 별 지팡이 · 빛의 핵 · 반짝이 꼬리
function fairyParts() {
  return cached('fairy', () => {
    const SK = '#f6d2ae', SKD = '#d9a07c';
    const body = bake(-8, -27, 8, 1, (x) => {
      // 다리 (뒤로 살짝 굽힘)
      limb(x, [[-0.4, -9.4], [-2.4, -5.4], [-4.8, -2.8]], 1.15, SKD);
      limb(x, [[0.8, -9.4], [-0.5, -5], [-2.6, -1.2]], 1.3, SK);
      x.fillStyle = SK; x.strokeStyle = OUT; x.lineWidth = 0.3;
      x.beginPath(); x.ellipse(-3.1, -1, 1.05, 0.55, -0.5, 0, TAU); x.fill(); x.stroke();
      // 먼 팔 (옆으로 늘어뜨림)
      limb(x, [[-1.3, -14.4], [-2.6, -11.8], [-2.3, -9.8]], 0.95, SKD);
      // 치마: 잎 꽃잎 두 겹
      for (let i = 0; i < 7; i++) leaf(x, 0.2, -11.6, 5.2 - Math.abs(i - 3) * 0.2, 1.7, 2.05 - i * 0.16, '#3f7a2c', '#23491a');
      for (let i = 0; i < 6; i++) leaf(x, 0.3, -11.8, 4.6, 1.6, 1.97 - i * 0.16, '#9ad870', '#4f9a36', 'rgba(235,255,200,0.55)');
      // 상의 (위로 뻗은 잎)
      x.fillStyle = lin(x, -2, -15, 2, -11, [[0, '#a6e07a'], [1, '#4f9a36']]);
      x.beginPath(); x.moveTo(-2, -11.2); x.quadraticCurveTo(-2.3, -14.3, -1, -15.2); x.lineTo(1.4, -15.1); x.quadraticCurveTo(2.5, -13.8, 2, -11.2); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      for (let i = 0; i < 3; i++) leaf(x, -0.2 + i * 0.7, -12.2, 3.4, 0.9, -1.35 - i * 0.22, '#b8ec8a', '#5aa83e');
      // 목·어깨
      x.fillStyle = SK; x.beginPath(); x.ellipse(0.4, -15.4, 1.1, 0.7, 0, 0, TAU); x.fill();
      // 뒷머리
      x.fillStyle = rad(x, 0.5, -19.5, 0.5, 4.6, [[0, '#fff3b0'], [0.55, '#f2c64a'], [1, '#b47a1c']]);
      x.beginPath(); x.ellipse(0, -19.1, 4.1, 3.9, -0.2, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.32; x.stroke();
      // 뾰족 귀 (뒤쪽)
      x.fillStyle = SKD; x.beginPath(); x.moveTo(-1.6, -18.6); x.lineTo(-4.6, -20.6); x.lineTo(-1.4, -17.3); x.closePath(); x.fill(); x.stroke();
      // 얼굴
      x.fillStyle = rad(x, 1.6, -18.8, 0.3, 3.4, [[0, '#ffe8cc'], [1, '#eab08a']]);
      x.beginPath(); x.ellipse(1.1, -18.1, 3.0, 3.1, 0, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,110,120,0.35)'; x.beginPath(); x.ellipse(2.8, -17, 0.9, 0.55, 0, 0, TAU); x.fill();
      // 큰 눈 둘 (호박빛 초록)
      for (const [ex, sc] of [[1.5, 0.85], [3.4, 1]]) {
        x.fillStyle = '#fffaf0'; x.beginPath(); x.ellipse(ex, -18.3, 0.62 * sc, 0.9 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = rad(x, ex, -18.1, 0.1, 0.8, [[0, '#d8f070'], [1, '#4a8a26']]); x.beginPath(); x.ellipse(ex + 0.08, -18.2, 0.5 * sc, 0.72 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = '#1a1208'; x.beginPath(); x.ellipse(ex + 0.1, -18.15, 0.24 * sc, 0.42 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = '#ffffff'; x.beginPath(); x.arc(ex + 0.3, -18.6, 0.16 * sc, 0, TAU); x.fill();
      }
      x.strokeStyle = '#6a2a20'; x.lineWidth = 0.28; x.beginPath(); x.arc(2.7, -16.9, 0.55, 0.2, Math.PI - 0.5); x.stroke();
      // 앞머리 · 올린 머리(번)
      x.fillStyle = rad(x, 0.5, -21, 0.5, 4, [[0, '#fff6c0'], [0.6, '#f4c848'], [1, '#c08a20']]);
      x.beginPath(); x.moveTo(-2.2, -20.4); x.quadraticCurveTo(0.2, -23.2, 3.8, -20.6); x.quadraticCurveTo(3.4, -19.6, 2.6, -19.9);
      x.quadraticCurveTo(2.2, -19.2, 1.4, -19.8); x.quadraticCurveTo(0.8, -19, 0, -19.7); x.quadraticCurveTo(-1.2, -19.2, -2.2, -20.4); x.closePath(); x.fill(); x.stroke();
      x.beginPath(); x.arc(-0.6, -22.8, 1.55, 0, TAU); x.fill(); x.stroke();
      x.strokeStyle = 'rgba(255,255,220,0.7)'; x.lineWidth = 0.25;
      x.beginPath(); x.moveTo(-1.8, -21.3); x.quadraticCurveTo(0, -22.4, 2.4, -21.2); x.moveTo(-1.2, -23.5); x.quadraticCurveTo(-0.4, -24, 0.3, -23.3); x.stroke();
    });
    const arm = bake(-1.6, -2.6, 14.6, 2.6, (x) => {
      limb(x, [[0, 0], [2.4, 0.4], [4.4, 0.1]], 1.05, SK);
      x.fillStyle = SK; x.strokeStyle = OUT; x.lineWidth = 0.28; x.beginPath(); x.arc(4.7, 0, 0.8, 0, TAU); x.fill(); x.stroke();
      limb(x, [[4.1, 0.4], [11.3, 0]], 0.55, '#f0c848', OUT, 0.45);
      x.strokeStyle = 'rgba(255,255,220,0.8)'; x.lineWidth = 0.18; x.beginPath(); x.moveTo(5, 0.1); x.lineTo(11, -0.15); x.stroke();
      x.fillStyle = rad(x, 12.3, 0, 0.2, 2.2, [[0, '#ffffff'], [0.5, '#fff2a0'], [1, '#f0b830']]);
      x.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.9 : 2.1; x.lineTo(12.3 + Math.cos(a) * r, Math.sin(a) * r); }
      x.closePath(); x.fill(); x.strokeStyle = '#a06a10'; x.lineWidth = 0.25; x.stroke();
    });
    const wing = bake(-0.8, -3.4, 14, 2.4, (x) => {
      x.beginPath(); x.moveTo(0, -0.3); x.bezierCurveTo(3, -2.8, 9, -3, 12.8, -1.1); x.bezierCurveTo(13.7, 0, 11.4, 1.5, 8, 1.4); x.bezierCurveTo(4, 1.3, 1.5, 0.9, 0, 0.4); x.closePath();
      x.fillStyle = lin(x, 0, 0, 13, 0, [[0, 'rgba(200,240,255,0.62)'], [0.45, 'rgba(255,205,245,0.42)'], [1, 'rgba(255,240,170,0.55)']]); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 0.3; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 0.16;
      x.beginPath();
      for (let i = 0; i < 4; i++) { x.moveTo(0.4, 0); x.quadraticCurveTo(5, -1.8 + i * 0.9, 12.4 - i * 1.4, -1.1 + i * 0.75); }
      for (let i = 1; i < 12; i++) { const vx = i * 1.05; x.moveTo(vx, -2.2 + Math.abs(6 - i) * 0.12); x.lineTo(vx + 0.3, 1.1 - Math.abs(6 - i) * 0.05); }
      x.stroke();
      x.fillStyle = 'rgba(120,255,220,0.22)'; x.beginPath(); x.ellipse(6, -0.8, 2.2, 0.8, 0, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,120,220,0.18)'; x.beginPath(); x.ellipse(9.5, 0, 1.8, 0.7, 0, 0, TAU); x.fill();
    });
    return { body, arm, wing };
  });
}
const FAIRY_WINGS = [[-2.2, 1, 0.62], [-2.55, 0.86, 0.5], [2.85, 0.8, 0.55], [2.62, 0.7, 0.45]];   // [각도, 배율, 알파]
function drawFairy(ctx, g, world, opts) {
  const P = fairyParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const perch = an === 'perch' || !!g.perched;
  const cast = an === 'skill', atk = isAtk(an), emote = an === 'emote';
  const bob = perch ? Math.sin(t * 2) * 0.3 : Math.sin(t * 3 + (g.seed ?? 0)) * 1.4;
  let tilt = perch ? -0.08 : clamp(s.vxf * 0.0009, -0.2, 0.35) - s.hurt * 0.35;
  if (cast) tilt = -0.12;
  const sc = 0.55 + 0.45 * s.appear;
  // 반짝이 꼬리 · 빛의 핵 (몸 뒤)
  if (!perch && s.q > 0.5) gSparkles(ctx, t, -1, -12 + bob, s.hiQ ? 6 : 3, 10 + Math.max(0, s.vxf) * 0.02, '#fff2b0', 0.85);
  gGlow(ctx, 0, -13 + bob, (cast ? 20 : 10) * sc, '#fff2b0', (cast ? 0.75 : 0.32) + Math.sin(t * 4) * 0.06);
  ctx.translate(0, -12 + bob);
  ctx.rotate(tilt);
  if (sc !== 1) ctx.scale(sc, sc);
  if (emote) { const k = clamp(at / 0.9, 0, 1); ctx.scale(Math.cos(easeIO(k) * TAU) || 0.01, 1); ctx.translate(0, -Math.sin(k * Math.PI) * 2); }
  // 날개 넷 (움직임 번짐: 두 벌을 반씩)
  const amp = perch ? 0.07 : cast ? 0.32 : 0.24, ph = t * 44;
  for (let i = 0; i < 4; i++) {
    const [a0, ws, wa] = FAIRY_WINGS[i];
    const fold = perch ? (i < 2 ? 0.45 : -0.5) : 0;
    const d = Math.sin(ph + i * 0.9) * amp;
    blit(ctx, P.wing, -1.3, -2.2, a0 + fold + d, ws, ws, wa);
    if (s.q > 0.5) blit(ctx, P.wing, -1.3, -2.2, a0 + fold - d * 0.7, ws, ws, wa * 0.55);
  }
  blit(ctx, P.body, 0, 12);
  // 지팡이 팔
  let aa = -1.05 + Math.sin(t * 2.2) * 0.08;
  if (atk) { const k = clamp(at / 0.14, 0, 1); aa = at < 0.14 ? lerp(-1.9, -0.12, easeOut(k)) : lerp(-0.12, -0.9, clamp((at - 0.14) / 0.3, 0, 1)); }
  else if (cast) aa = lerp(-1.1, -1.72, easeOut(clamp(at / 0.2, 0, 1)));
  else if (emote) aa = -1.2 + Math.sin(at * 14) * 0.5;
  else if (perch) aa = -0.55;
  else if (s.hurt > 0) aa = -0.4;
  const shx = 1.2, shy = -2.3;
  blit(ctx, P.arm, shx, shy, aa);
  const tx = shx + Math.cos(aa) * 12.3, ty = shy + Math.sin(aa) * 12.3;
  const star = atk ? 1 - clamp((at - 0.1) / 0.3, 0, 1) : cast ? 1 : 0;
  gGlow(ctx, tx, ty, 3.5 + star * 7, '#fff2b0', 0.55 + star * 0.45, 0.2);
  gStar(ctx, tx, ty, 2.2 + star * 4 + Math.sin(t * 9) * 0.4, 0.8, t * 1.5);
  if (cast) {   // 빛의 고리 (가호)
    const k = clamp(at / 0.25, 0, 1);
    gHalo(ctx, 0, 0, 9 + 5 * k, 3.2 + k, '#ffe070', 0.8 * (1 - clamp((at - 0.5) / 0.3, 0, 1)), 0.7, Math.sin(t * 3) * 0.2);
    gHalo(ctx, 0, -3, 6 + 7 * k, 2 + k, '#fff2b0', 0.5, 0.5, -0.3);
  }
  if (s.aw) gHalo(ctx, 0.4, -11.4, 3.7, 1.15, '#ffe070', 0.85 + Math.sin(t * 3) * 0.15, 0.55);
  if (an === 'assist' && at < 0.2) { ctx.globalAlpha *= 0.6; for (let i = 0; i < 3; i++) { ctx.fillStyle = '#fff2b0'; ctx.fillRect(-18 - i * 5, -4 + i * 3, 12, 0.7); } }
  return true;
}

// ═════════════════════════ 하티 (영혼 늑대) ═════════════════════════
// 반투명 청록 늑대: 별빛 반점 · 불꽃 같은 귀끝과 꼬리 · 흰 눈. 발 원점, 몸 중심 (0,-20)
const WC = { l: '#e8fbff', m: '#7ee0ff', d: '#3a8ab0', k: '#0e2a3a' };
function wolfParts() {
  return cached('wolf', () => {
    const bodyPath = (x) => {
      x.beginPath(); x.moveTo(-20, -3);
      x.bezierCurveTo(-14, -8.6, -3, -8.2, 5, -7.2);
      x.bezierCurveTo(9.5, -8.4, 12.5, -11.5, 14.5, -13.2);
      x.lineTo(19, -8.4);
      x.bezierCurveTo(17.6, -3, 15, 2.6, 11, 5.4);
      x.bezierCurveTo(6, 6.8, -4, 5.4, -11, 5);
      x.bezierCurveTo(-17, 5.2, -21.6, 2, -20, -3); x.closePath();
    };
    const body = bake(-24, -16, 22, 10, (x) => {
      bodyPath(x);
      x.fillStyle = rad(x, -1, -3, 1, 20, [[0, 'rgba(232,251,255,0.95)'], [0.45, 'rgba(126,224,255,0.9)'], [1, 'rgba(58,138,176,0.85)']], 4, -6); x.fill();
      x.strokeStyle = 'rgba(14,42,58,0.9)'; x.lineWidth = 0.6; x.stroke();
      // 배 쪽 어둠 · 등 쪽 테두리 빛
      x.save(); bodyPath(x); x.clip();
      x.fillStyle = lin(x, 0, -2, 0, 7, [[0, 'rgba(14,42,58,0)'], [1, 'rgba(14,42,58,0.45)']]); x.fillRect(-24, -2, 46, 10);
      x.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 22; i++) { const px = -18 + hsh(i) * 32, py = -6 + hsh(i + 40) * 10; x.beginPath(); x.arc(px, py, 0.18 + hsh(i + 9) * 0.3, 0, TAU); x.fill(); }
      x.restore();
      tufts(x, [[-18, -4], [-14, -6.6], [-10, -7.6], [-6, -7.8], [-2, -7.6], [2, -7.4], [6, -7.8], [9, -9.4], [12, -11.6]], -2.6, 3, 'rgba(232,251,255,0.9)', 0.5);
      tufts(x, [[18, -7], [17.5, -4], [16.4, -1], [14.6, 2], [12.4, 4.2]], 0.3, 2.6, 'rgba(200,245,255,0.85)', 0.5);
      tufts(x, [[8, 5.6], [3, 5.8], [-2, 5.4], [-7, 5.2], [-12, 5], [-17, 4.2]], 1.9, 2.4, 'rgba(126,224,255,0.75)', 0.45);
      x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 0.4;
      x.beginPath(); x.moveTo(-18, -4.4); x.bezierCurveTo(-12, -8.4, -2, -7.9, 5, -7); x.stroke();
    });
    const headShape = (x, open) => {
      // 귀 (먼 귀 → 가까운 귀)
      x.fillStyle = 'rgba(58,138,176,0.9)'; x.strokeStyle = 'rgba(14,42,58,0.9)'; x.lineWidth = 0.45;
      x.beginPath(); x.moveTo(4.4, -6.2); x.lineTo(5.6, -11.6); x.lineTo(7.2, -5.8); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = rad(x, 3, -8, 0.3, 5, [[0, '#e8fbff'], [1, '#7ee0ff']]);
      x.beginPath(); x.moveTo(1.2, -5.6); x.lineTo(2.2, -12.4); x.lineTo(5.2, -6.6); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = 'rgba(14,42,58,0.55)'; x.beginPath(); x.moveTo(2.2, -6.4); x.lineTo(2.6, -10.2); x.lineTo(4.2, -6.8); x.closePath(); x.fill();
      // 머리뼈 · 주둥이
      x.fillStyle = rad(x, 4.5, -4, 0.5, 9, [[0, 'rgba(240,253,255,0.97)'], [0.6, 'rgba(126,224,255,0.93)'], [1, 'rgba(58,138,176,0.9)']], 5, -5);
      x.beginPath(); x.moveTo(-1, 0.5); x.bezierCurveTo(-1.8, -4.5, 1.6, -7.4, 5.6, -6.4);
      x.bezierCurveTo(8, -5.8, 9.4, -4.6, 13.4, -2.8); x.quadraticCurveTo(14.4, -2, 13.6, -1);
      if (open) { x.lineTo(8.2, -0.4); x.lineTo(5.4, 1.8); } else { x.bezierCurveTo(12, 0.4, 8.6, 1.4, 6.2, 2); }
      x.bezierCurveTo(3.4, 3.4, 0.2, 3, -1, 0.5); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(14,42,58,0.9)'; x.lineWidth = 0.5; x.stroke();
      tufts(x, [[0.2, 2.6], [1.6, 3.1], [3.2, 3], [-0.6, 1.2]], 1.9, 2.2, 'rgba(200,245,255,0.85)', 0.4);
      // 코 · 입 · 눈두덩
      x.fillStyle = '#0e2a3a'; x.beginPath(); x.ellipse(13.5, -2.2, 0.9, 0.6, 0.3, 0, TAU); x.fill();
      if (!open) { x.strokeStyle = 'rgba(14,42,58,0.9)'; x.lineWidth = 0.35; x.beginPath(); x.moveTo(13, -0.8); x.quadraticCurveTo(10, 0.2, 7.4, 0.4); x.stroke(); }
      x.fillStyle = 'rgba(14,42,58,0.8)'; x.beginPath(); x.ellipse(7.3, -4.1, 1.3, 0.6, -0.25, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 0.35; x.beginPath(); x.moveTo(1.5, -6.2); x.quadraticCurveTo(6, -6.8, 12.6, -3.4); x.stroke();
    };
    const head = bake(-3, -14, 16, 5, (x) => headShape(x, false));
    const headOpen = bake(-3, -14, 16, 8, (x) => {
      headShape(x, true);
      // 벌린 턱 (아래)
      x.fillStyle = 'rgba(40,10,24,0.95)'; x.beginPath(); x.moveTo(7.6, -0.2); x.lineTo(12.4, 1.8); x.lineTo(6.2, 2.4); x.closePath(); x.fill();
      x.fillStyle = rad(x, 8, 3.2, 0.3, 6, [[0, '#dff8ff'], [1, '#5ab8e0']]);
      x.beginPath(); x.moveTo(5.2, 1.6); x.lineTo(12.2, 2.2); x.quadraticCurveTo(12.4, 3.6, 10.6, 3.9); x.bezierCurveTo(8, 4.6, 5, 4.4, 3.4, 3); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(14,42,58,0.9)'; x.lineWidth = 0.45; x.stroke();
      x.fillStyle = '#ffffff';
      for (const [px, py, d] of [[12.6, -1.1, 1], [9.4, -0.6, 1], [11.6, 2.1, -1], [8.4, 2.4, -1]]) { x.beginPath(); x.moveTo(px - 0.35, py); x.lineTo(px + 0.35, py); x.lineTo(px, py + d * 1.1); x.closePath(); x.fill(); }
    });
    const legPath = (x, hind) => {
      x.beginPath();
      if (hind) { x.moveTo(-3.6, 0); x.bezierCurveTo(-4.2, 4, -1.4, 6.8, 1.6, 8.4); x.lineTo(0.2, 14.4); x.lineTo(-1.4, 14.6); x.lineTo(-0.6, 8.8); x.bezierCurveTo(-3.8, 7.6, -5.6, 3.6, -4.6, 0); }
      else { x.moveTo(-2.4, 0); x.bezierCurveTo(-2.8, 5, -1.4, 9, -1.2, 14.4); x.lineTo(0.6, 14.6); x.bezierCurveTo(0.8, 9, 2.4, 4, 2.6, 0); }
      x.closePath();
    };
    const mkLeg = (hind, deep) => bake(-6, -1.5, 5, 17.5, (x) => {
      legPath(x, hind);
      x.fillStyle = lin(x, 0, 0, 0, 15, deep ? [[0, 'rgba(58,138,176,0.88)'], [1, 'rgba(22,66,96,0.8)']] : [[0, 'rgba(210,248,255,0.95)'], [0.6, 'rgba(126,224,255,0.9)'], [1, 'rgba(90,180,220,0.85)']]);
      x.fill(); x.strokeStyle = 'rgba(14,42,58,0.9)'; x.lineWidth = 0.45; x.stroke();
      // 발
      x.fillStyle = deep ? 'rgba(40,110,150,0.9)' : 'rgba(200,245,255,0.95)';
      x.beginPath(); x.ellipse(hind ? 0 : 0.3, 15.1, 2.1, 1.1, 0, 0, TAU); x.fill(); x.stroke();
      tufts(x, [[hind ? -1 : -1.4, 13.5], [hind ? 1 : 1.2, 13.6]], Math.PI / 2 + 0.3, 1.6, deep ? 'rgba(126,224,255,0.5)' : 'rgba(232,251,255,0.8)', 0.35);
    });
    const tail = bake(-17, -5, 1.5, 5, (x) => {
      x.beginPath(); x.moveTo(0.5, -1.6); x.bezierCurveTo(-4, -4.6, -10, -4.4, -16, -2.4); x.bezierCurveTo(-12, -0.8, -12, 2.8, -15, 3.8); x.bezierCurveTo(-9, 3.4, -4, 2.6, 0.5, 1.4); x.closePath();
      x.fillStyle = lin(x, 0, 0, -16, 0, [[0, 'rgba(126,224,255,0.92)'], [0.6, 'rgba(190,240,255,0.8)'], [1, 'rgba(232,251,255,0.15)']]); x.fill();
      x.save(); x.clip(); x.strokeStyle = 'rgba(14,42,58,0.55)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(0.5, -1.6); x.bezierCurveTo(-4, -4.6, -8, -4.4, -11, -3.4); x.moveTo(0.5, 1.4); x.bezierCurveTo(-4, 2.6, -8, 3.2, -11, 3.4); x.stroke(); x.restore();
      tufts(x, [[-3, -2.8], [-7, -3.6], [-11, -3.4], [-14, -2.6], [-5, 2.2], [-9, 2.8], [-13, 3.2]], Math.PI, 2.4, 'rgba(232,251,255,0.8)', 0.4);
    });
    const flame = bake(-9, -3.2, 1, 3.2, (x) => {
      x.beginPath(); x.moveTo(0.5, -2); x.bezierCurveTo(-3, -3.4, -6, -1.4, -8.6, -2.6); x.bezierCurveTo(-7, -0.6, -8, 1.4, -8.8, 2.6); x.bezierCurveTo(-5, 1.8, -2.4, 2.6, 0.5, 1.8); x.closePath();
      x.fillStyle = lin(x, 0, 0, -9, 0, [[0, 'rgba(232,251,255,0.95)'], [0.5, 'rgba(126,224,255,0.75)'], [1, 'rgba(126,224,255,0)']]); x.fill();
    });
    return { body, head, headOpen, fleg: mkLeg(false, false), fleg2: mkLeg(false, true), hleg: mkLeg(true, false), hleg2: mkLeg(true, true), tail, flame };
  });
}
/** 늑대 자세 (재사용 객체): 다리 각 (0 = 곧게 아래, + = 발이 앞으로), 몸 기울기, 머리 각, 턱, 꼬리 */
const WP = { fN: 0, fF: 0, hN: 0, hF: 0, pitch: 0, bob: 0, lunge: 0, head: 0, open: 0, tail: 0, tailA: 0.12, tailF: 3, crouch: 0 };
function wolfPose(an, t, at, vxf, vy, hurt) {
  const q = WP;
  q.fN = 0.04; q.fF = -0.04; q.hN = -0.04; q.hF = 0.04; q.pitch = 0; q.bob = Math.sin(t * 2.4) * 0.4; q.lunge = 0; q.head = Math.sin(t * 1.3) * 0.04; q.open = 0;
  q.tail = 0.25 + Math.sin(t * 1.5) * 0.08; q.tailA = 0.12; q.tailF = 3; q.crouch = 0;
  if (an === 'run' || an === 'move' || an === 'assist') {
    const ph = t * 15, A = 0.85;
    q.fN = Math.sin(ph) * A; q.fF = Math.sin(ph + 0.35) * A; q.hN = Math.sin(ph + 2.5) * A; q.hF = Math.sin(ph + 2.85) * A;
    q.pitch = Math.sin(ph) * 0.06; q.bob = Math.sin(ph * 2) * 1.5; q.tail = 0.05; q.tailA = 0.1; q.tailF = 16; q.head = -0.08 + Math.sin(ph) * 0.05;
  } else if (an === 'pounce') {
    q.fN = q.fF = 1.0; q.hN = q.hF = -1.05; q.pitch = clamp(vy * 0.0012, -0.35, 0.35); q.tail = 0; q.tailF = 10; q.head = -0.1; q.open = 0.4;
  } else if (an === 'attack') {
    const ch = Math.abs(Math.sin(at * 26));
    q.open = ch; q.lunge = 3 * ch; q.head = 0.12 - ch * 0.1; q.fN = 0.35; q.fF = 0.2; q.hN = -0.3; q.hF = -0.2; q.pitch = 0.1;
  } else if (an === 'howl' || an === 'skill') {
    const k = easeOut(clamp(at / 0.2, 0, 1));
    q.head = -0.95 * k; q.open = 0.8 * k; q.pitch = -0.22 * k; q.hN = q.hF = -0.35 * k; q.fN = 0.1; q.fF = -0.1; q.crouch = 3 * k;
    q.tail = 0.5; q.tailA = 0.05; q.tailF = 20;
  } else if (an === 'emote') {
    const k = Math.sin(clamp(at, 0, 1) * Math.PI);
    q.pitch = 0.22 * k; q.fN = q.fF = 0.7 * k; q.tail = 0.7; q.tailA = 0.35; q.tailF = 18; q.head = -0.2 * k;
  }
  if (hurt > 0) { q.pitch = -0.18 * hurt; q.head = -0.3 * hurt; q.lunge = -3 * hurt; }
  return q;
}
/** 늑대 형체 그리기 (몸 원점 기준 좌표에서 발 원점). 늑대 무리 연출도 이것을 쓴다 */
function wolfFigure(ctx, P, q, t, o) {
  const HP = Math.PI / 2;
  const legReach = 15.2;
  const ay = -(legReach + 4.4) + q.bob + q.crouch * 0.5, ax = q.lunge;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(q.pitch);
  // 먼 다리 (어둡게)
  blit(ctx, P.hleg2, -12.2, 1.6 + q.crouch * 0.3, -q.hF);
  blit(ctx, P.fleg2, 9.4, 2.2, -q.fF);
  // 꼬리 (두 갈래: 각성)
  const tw = Math.sin(t * q.tailF) * q.tailA;
  const tails = o.twin ? [-0.22, 0.2] : [0];
  for (const off of tails) {
    const ta = q.tail + off + tw;
    ctx.save(); ctx.translate(-19.2, -2.6); ctx.rotate(-ta);
    blit(ctx, P.tail, 0, 0);
    ctx.translate(-15.5, 0.4); ctx.rotate(Math.sin(t * q.tailF * 1.3 - 0.8) * q.tailA * 1.6);
    const fl = 1 + Math.sin(t * 17) * 0.12;
    blitAdd(ctx, P.flame, 3, 0, 0, 1.35 * fl, 1.2 + Math.sin(t * 13) * 0.15, 0.95);
    if (!o.noFx) gGlow(ctx, -2, 0, 5, '#bff4ff', 0.4);
    ctx.restore();
  }
  blit(ctx, P.body, 0, 0);
  blit(ctx, P.hleg, -13.4, 1.2 + q.crouch * 0.3, -q.hN);
  blit(ctx, P.fleg, 10.2, 2, -q.fN);
  // 머리 (목 끝 (15,-9))
  const hs = q.open > 0.3 ? P.headOpen : P.head;
  ctx.save(); ctx.translate(15.2, -9.4); ctx.rotate(q.head);
  blit(ctx, hs, 0, 0);
  if (!o.noFx) {
    gGlow(ctx, 7.5, -4.3, 2.6, '#ffffff', 0.9, 0.3);
    gGlow(ctx, 7.5, -4.3, 5, '#bff4ff', 0.35);
    // 귀끝 불꽃
    const fl = 0.8 + Math.sin(t * 15) * 0.2;
    gGlow(ctx, 2.3, -12.4, 2.2 * fl, '#e8fbff', 0.7, 0.3);
    gGlow(ctx, 5.7, -11.8, 1.8 * fl, '#bff4ff', 0.5, 0.3);
  }
  ctx.restore();
  if (!o.noFx && o.hi) {
    // 몸 속 별빛 반짝임
    for (let i = 0; i < 5; i++) {
      const tw2 = 0.5 + 0.5 * Math.sin(t * (2 + hsh(i) * 3) + i * 2.1);
      gStar(ctx, -15 + hsh(i + 20) * 27, -5 + hsh(i + 60) * 8, 0.9 + tw2 * 0.9, 0.3 + tw2 * 0.6, i);
    }
  }
  ctx.restore();
}
function drawWolf(ctx, g, world, opts) {
  const P = wolfParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  // 그림자 (지면형)
  ctx.globalAlpha *= 1;
  gGlow(ctx, 0, -1, 22, '#0e2a3a', 0.0);
  ctx.save(); ctx.globalAlpha *= 0.28; ctx.fillStyle = '#021018'; ctx.beginPath(); ctx.ellipse(0, -0.5, 20, 2.6, 0, 0, TAU); ctx.fill(); ctx.restore();
  const q = wolfPose(an === 'idle' && Math.abs(s.vxf) > 60 ? 'run' : an, t, at, s.vxf, s.vy, s.hurt);
  const ap = s.appear;
  if (ap < 1) { ctx.scale(1, 0.3 + 0.7 * ap); gGlow(ctx, 0, -8, 26, '#7ee0ff', 0.7 * (1 - ap)); }
  ctx.save();
  ctx.globalAlpha *= 0.9;
  wolfFigure(ctx, P, q, t, { twin: s.aw, hi: s.hiQ });
  ctx.restore();
  // 영체의 가산 테두리 빛 (높음)
  if (s.hiQ) gGlow(ctx, -2, -20, 26, '#7ee0ff', 0.18 + (an === 'howl' || an === 'skill' ? 0.3 : 0));
  if ((an === 'howl' || an === 'skill') && at < 0.9) {
    const k = clamp(at / 0.9, 0, 1);
    for (let i = 0; i < 3; i++) { const kk = (k + i * 0.3) % 1; gHalo(ctx, 24, -40, 6 + kk * 18, 4 + kk * 12, '#bff4ff', (1 - kk) * 0.6, 0.8); }
  }
  if (s.aw) gGlow(ctx, -20, -26, 10, '#e8fbff', 0.35 + Math.sin(t * 5) * 0.1);
  return true;
}

// ═════════════════════════ 핌 (소악마 마법사) ═════════════════════════
// 적자색 피부 · 두건 망토 · 큰 이빨 웃음 · 말린 뿔 · 박쥐 날개 · 뾰족 꼬리 · 해골 지팡이(불꽃). 발 원점, 몸 중심 (0,-14)
function impParts() {
  return cached('imp', () => {
    const SKIN = [[0, '#e0708a'], [0.55, '#c04a6a'], [1, '#6a1a3a']];
    const bodyFn = (x, cackle) => {
      // 다리 (가늘게 매달림)
      limb(x, [[-1.8, 5], [-2.6, 8.6], [-3.6, 11]], 1.1, '#8a2a5a');
      limb(x, [[1.8, 5], [2.2, 8.8], [1.4, 11.4]], 1.25, '#b04064');
      x.strokeStyle = '#1a0a14'; x.lineWidth = 0.45;
      x.beginPath(); for (const [fx, fy] of [[-3.6, 11], [1.4, 11.4]]) { x.moveTo(fx, fy); x.lineTo(fx + 1.2, fy + 0.8); x.moveTo(fx, fy); x.lineTo(fx - 0.4, fy + 1.1); } x.stroke();
      // 먼 팔
      limb(x, [[-3.6, -0.6], [-5, 2.6], [-4.6, 4.6]], 1.05, '#8a2a5a');
      // 망토 (뒤)
      x.fillStyle = lin(x, 0, -10, 0, 7, [[0, '#3a1a3a'], [1, '#140812']]);
      x.beginPath(); x.moveTo(-5.6, -8); x.bezierCurveTo(-8.4, -3, -8.6, 3, -7.6, 7.2);
      for (let i = 0; i < 6; i++) x.lineTo(-7 + i * 2.2, 6.4 + (i % 2 ? 1.8 : 0));
      x.lineTo(5.6, 5.4); x.bezierCurveTo(6.4, 1, 5.2, -4, 3.4, -7.4); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.4; x.stroke();
      // 배 (올챙이배)
      x.fillStyle = rad(x, 2.2, 1, 0.4, 5.6, SKIN, 3.2, 0);
      x.beginPath(); x.ellipse(1.4, 1.6, 4.4, 4.2, 0, 0, TAU); x.fill(); x.stroke();
      x.strokeStyle = 'rgba(90,20,50,0.6)'; x.lineWidth = 0.3; x.beginPath(); x.arc(2.2, 2.8, 0.6, 0, TAU); x.stroke();
      // 망토 앞자락
      x.fillStyle = '#2a1028';
      x.beginPath(); x.moveTo(-3.8, -6); x.lineTo(-1.6, -5.2); x.bezierCurveTo(-2.4, -1, -2.2, 3, -3, 6.6); x.lineTo(-5.4, 5.6); x.closePath(); x.fill();
      // 큰 귀
      x.fillStyle = rad(x, -8, -8, 0.3, 5, SKIN);
      x.beginPath(); x.moveTo(-4.4, -8.6); x.lineTo(-11.8, -11.4); x.lineTo(-5, -5.6); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = 'rgba(80,10,40,0.5)'; x.beginPath(); x.moveTo(-5, -8); x.lineTo(-10, -10.4); x.lineTo(-5.4, -6.4); x.closePath(); x.fill();
      // 머리
      x.fillStyle = rad(x, 2.4, -8, 0.5, 7.6, SKIN, 3.6, -9.4);
      x.beginPath(); x.ellipse(1.6, -6.8, 6.4, 5.9, 0, 0, TAU); x.fill(); x.stroke();
      // 두건 (머리 뒤·위를 덮음)
      x.fillStyle = lin(x, -6, -12, 2, -2, [[0, '#4a2048'], [1, '#1a0a1a']]);
      x.beginPath(); x.moveTo(-4.6, -1.6); x.bezierCurveTo(-7.4, -6, -5.8, -12.6, 0.4, -12.8); x.bezierCurveTo(3.2, -12.8, 5.2, -11.8, 6.4, -10.2);
      x.bezierCurveTo(3.4, -11.2, -0.6, -10.4, -2.2, -7.2); x.bezierCurveTo(-3.2, -5.2, -3.4, -3.4, -4.6, -1.6); x.closePath(); x.fill(); x.stroke();
      // 뿔 (까만 말린 뿔)
      x.fillStyle = lin(x, 0, -16, 0, -11, [[0, '#4a4048'], [1, '#0e080c']]);
      for (const [hx, hy, s] of [[-0.8, -11.6, 1], [3.6, -11.8, 0.85]]) {
        x.beginPath(); x.moveTo(hx - 1.1 * s, hy); x.bezierCurveTo(hx - 1.8 * s, hy - 3 * s, hx + 0.6 * s, hy - 4.6 * s, hx + 1.8 * s, hy - 3.8 * s);
        x.bezierCurveTo(hx + 0.6 * s, hy - 3.2 * s, hx + 0.2 * s, hy - 1.8 * s, hx + 1 * s, hy); x.closePath(); x.fill(); x.stroke();
      }
      // 눈 (주황 · 세로 동공)
      for (const [ex, r] of [[2.4, 1.55], [5.6, 1.35]]) {
        x.fillStyle = rad(x, ex, -7.4, 0.2, r, [[0, '#fff0a0'], [0.5, '#ffaa30'], [1, '#c05010']]);
        x.beginPath(); x.ellipse(ex, -7.2, r, r * 1.05, 0, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
        x.fillStyle = '#1a0806'; x.beginPath(); x.ellipse(ex + 0.25, -7.1, 0.35, r * 0.75, 0, 0, TAU); x.fill();
        x.fillStyle = '#fff'; x.beginPath(); x.arc(ex - 0.4, -7.8, 0.3, 0, TAU); x.fill();
      }
      x.strokeStyle = '#4a0a24'; x.lineWidth = 0.45; x.beginPath(); x.moveTo(0.8, -9.4); x.lineTo(3, -8.8); x.moveTo(4.6, -8.9); x.lineTo(6.6, -9.4); x.stroke();
      // 이빨 웃음
      const mh = cackle ? 2.6 : 1.3;
      x.fillStyle = '#3a0612';
      x.beginPath(); x.moveTo(-0.4, -3.8); x.quadraticCurveTo(3.4, -2.2 + mh * 0.6, 7.4, -4.2); x.quadraticCurveTo(3.6, -3.2 + mh * 1.6, -0.4, -3.8); x.closePath(); x.fill();
      x.fillStyle = '#fff8ec';
      x.beginPath();
      for (let i = 0; i < 7; i++) { const tx = 0.2 + i * 1.02, ty = -3.7 + Math.sin(i / 6 * Math.PI) * 0.9; x.moveTo(tx, ty); x.lineTo(tx + 0.5, ty + 0.95); x.lineTo(tx + 1, ty + 0.1); }
      for (let i = 0; i < 6; i++) { const tx = 0.8 + i * 1.02, ty = -3.4 + Math.sin(i / 5 * Math.PI) * (0.9 + mh * 0.9); x.moveTo(tx, ty); x.lineTo(tx + 0.5, ty - 0.9); x.lineTo(tx + 1, ty); }
      x.fill();
      x.strokeStyle = 'rgba(255,190,200,0.5)'; x.lineWidth = 0.3; x.beginPath(); x.arc(-1.6, -8.6, 3.2, 3.6, 4.4); x.stroke();
    };
    const body = bake(-13, -18.5, 9, 13, (x) => bodyFn(x, false));
    const bodyC = bake(-13, -18.5, 9, 13, (x) => bodyFn(x, true));
    const arm = bake(-1.5, -16, 8.5, 12, (x) => {
      // 지팡이 (울퉁불퉁)
      x.strokeStyle = OUT; x.lineWidth = 1.5; x.beginPath(); x.moveTo(5.2, 10.8); x.bezierCurveTo(4.4, 4, 6.2, -2, 5.4, -10.6); x.stroke();
      x.strokeStyle = lin(x, 0, -10, 0, 10, [[0, '#7a5030'], [1, '#3a2014']]); x.lineWidth = 0.95; x.stroke();
      x.fillStyle = '#5a3820'; for (const ky of [-5, 1.5, 6.5]) { x.beginPath(); x.ellipse(5.3, ky, 0.8, 0.5, 0.3, 0, TAU); x.fill(); }
      // 해골
      x.fillStyle = rad(x, 5.2, -12.8, 0.3, 2.6, [[0, '#fffaf0'], [1, '#c8b898']]);
      x.beginPath(); x.ellipse(5.4, -12.6, 2.1, 1.9, 0, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
      x.fillStyle = '#e8dcc0'; x.beginPath(); x.rect(4.4, -11.2, 2.2, 1.2); x.fill(); x.stroke();
      x.fillStyle = '#1a0a08'; x.beginPath(); x.ellipse(4.7, -12.8, 0.55, 0.65, 0, 0, TAU); x.ellipse(6.3, -12.8, 0.55, 0.65, 0, 0, TAU); x.fill();
      // 팔 · 손
      limb(x, [[0, 0], [2.4, 0.9], [4.6, 0.4]], 1.25, '#c04a6a');
      x.fillStyle = '#b04064'; x.strokeStyle = OUT; x.lineWidth = 0.3; x.beginPath(); x.ellipse(5.2, 0.3, 1.2, 1, 0, 0, TAU); x.fill(); x.stroke();
    });
    const wing = bake(-15, -12, 1.5, 5, (x) => {
      const tips = [[-10.8, -10], [-14, -4.4], [-11, 1.2], [-6, 3.6]];
      x.beginPath(); x.moveTo(0.4, -0.6); x.lineTo(-4.2, -7.4); x.lineTo(tips[0][0], tips[0][1]);
      x.quadraticCurveTo(-10.4, -6.2, tips[1][0], tips[1][1]); x.quadraticCurveTo(-10.4, -1.8, tips[2][0], tips[2][1]); x.quadraticCurveTo(-7, 0.6, tips[3][0], tips[3][1]); x.quadraticCurveTo(-2, 1.6, 0.4, 0.8); x.closePath();
      x.fillStyle = rad(x, -3, -3, 0.5, 13, [[0, '#8a2a60'], [0.6, '#5a1a44'], [1, '#2a0c20']]); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.4; x.stroke();
      x.strokeStyle = '#2a0c1c'; x.lineWidth = 0.55;
      x.beginPath(); x.moveTo(0.2, -0.2); x.lineTo(-4.2, -7.4); x.lineTo(-10.8, -10); x.moveTo(-4.2, -7.4); x.lineTo(-14, -4.4); x.moveTo(-4.2, -7.4); x.lineTo(-11, 1.2); x.moveTo(-4.2, -7.4); x.lineTo(-6, 3.6); x.stroke();
      x.strokeStyle = 'rgba(255,150,190,0.35)'; x.lineWidth = 0.3; x.beginPath(); x.moveTo(-0.6, -1.4); x.lineTo(-4, -7); x.lineTo(-10.2, -9.6); x.stroke();
      x.fillStyle = '#e8c8b0'; x.beginPath(); x.moveTo(-4.2, -7.4); x.lineTo(-4.8, -9); x.lineTo(-3.6, -7.8); x.closePath(); x.fill();
    });
    const wing2 = tinted(wing, 'rgba(20,6,16,1)', 0.45);
    const tail = bake(-14, -4, 1, 5, (x) => {
      limb(x, [[0, 0], [-4, 2.4], [-8.6, 2.8], [-11.4, 0.6]], 0.8, '#a03a5a');
      x.fillStyle = '#6a1a3a'; x.strokeStyle = OUT; x.lineWidth = 0.35;
      x.beginPath(); x.moveTo(-11, 1.2); x.lineTo(-13.6, -1.8); x.lineTo(-10.4, -1.2); x.lineTo(-11.6, 0.4); x.closePath(); x.fill(); x.stroke();
    });
    return { body, bodyC, arm, wing, wing2, tail };
  });
}
function drawImp(ctx, g, world, opts) {
  const P = impParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const cast = an === 'skill', atk = isAtk(an), emote = an === 'emote';
  const beat = Math.sin(t * 14);
  const bob = -beat * 1.6 + Math.sin(t * 2.3 + (g.seed ?? 0)) * 1.2;
  let tilt = clamp(s.vxf * 0.001, -0.25, 0.3) - s.hurt * 0.35;
  let sx = 1 - beat * 0.04, sy = 1 + beat * 0.06;
  if (emote) { const b = Math.abs(Math.sin(at * 16)); sy *= 1 - b * 0.14; sx *= 1 + b * 0.1; }
  if (cast) { const k = clamp(at / 0.2, 0, 1); sy *= 1 + 0.08 * k; }
  const ap = s.appear;
  gGlow(ctx, 0, -14 + bob, cast ? 26 : 14, '#ff7a2a', (cast ? 0.5 : 0.18) + Math.max(0, beat) * 0.04);
  ctx.translate(0, -14 + bob);
  ctx.rotate(tilt);
  ctx.scale(sx * (0.5 + 0.5 * ap), sy * (0.5 + 0.5 * ap));
  const wa = -0.1 + beat * 0.55 - (cast ? 0.3 : 0);
  blit(ctx, P.wing2, -2.6, -1.2, wa + 0.35, 0.9, 0.9);
  const tsw = Math.sin(t * 3.4) * 0.25;
  blit(ctx, P.tail, -4.6, 5.2, -0.2 + tsw);
  blit(ctx, (emote || cast || an === 'assist') ? P.bodyC : P.body, 0, 0);
  // 지팡이 팔
  let aa = Math.sin(t * 2) * 0.06;
  if (atk) { aa = at < 0.14 ? lerp(-0.7, 0.95, easeOut(at / 0.14)) : lerp(0.95, 0, clamp((at - 0.14) / 0.25, 0, 1)); }
  else if (cast) aa = lerp(0, -0.55, easeOut(clamp(at / 0.2, 0, 1)));
  else if (emote) aa = Math.sin(at * 16) * 0.2;
  const shx = 3.2, shy = -0.4, ay = cast ? -3 : 0;
  blit(ctx, P.arm, shx, shy + ay, aa);
  const c = Math.cos(aa), sn = Math.sin(aa), fx0 = 5.4, fy0 = -14.4;
  const fx = shx + c * fx0 - sn * fy0, fy = shy + ay + sn * fx0 + c * fy0;
  const fk = cast ? 1.8 : atk ? 1.4 : 1;
  for (let i = 0; i < 3; i++) {
    const fl = Math.sin(t * (13 + i * 4) + i) * 0.5 + 0.5;
    gGlow(ctx, fx + Math.sin(t * 7 + i) * 0.6, fy - i * 1.4 * fk - fl * 0.8, (2.8 - i * 0.6) * fk, i === 0 ? '#ffd070' : '#ff6a1a', 0.85 - i * 0.18, 0.2);
  }
  gGlow(ctx, fx, fy, 7 * fk, '#ff7a2a', 0.35);
  blit(ctx, P.wing, -1.6, -1.6, wa, 1, 1);
  // 눈빛
  gGlow(ctx, 2.4, -7.2, 2.4, '#ffb040', 0.55); gGlow(ctx, 5.6, -7.1, 2.1, '#ffb040', 0.5);
  if (s.aw) for (const [hx, hy] of [[1.2, -15.6], [5.2, -15.4]]) gGlow(ctx, hx, hy - Math.abs(Math.sin(t * 11 + hx)) * 0.8, 2.6, '#ff8a2a', 0.85, 0.2);
  if (cast) {   // 소환진
    const k = clamp(at / 0.25, 0, 1), fade = 1 - clamp((at - 0.55) / 0.2, 0, 1);
    gHalo(ctx, fx, fy - 6, 5 + 7 * k, 1.8 + 2.4 * k, '#ff8a3a', 0.9 * fade, 0.6, 0);
    for (let i = 0; i < 6; i++) { const a = t * 3 + i * TAU / 6; gStar(ctx, fx + Math.cos(a) * (5 + 7 * k), fy - 6 + Math.sin(a) * (1.8 + 2.4 * k), 1.3, 0.8 * fade); }
  }
  return true;
}

// ═════════════════════════ 가웨인 (망령 기사) ═════════════════════════
// 반투명 푸른 판금 · 빛나는 눈 틈 · 너덜너덜한 망토 · 연 모양 방패(바랜 십자) · 장검 · 하반신은 안개. 발 원점 (안개 끝)
const KC = { l: '#e8f4ff', m: '#8ac8ff', d: '#3a5a8a', k: '#101828', gold: '#c8a040' };
function knightParts() {
  return cached('knight', () => {
    const plate = [[0, 'rgba(232,244,255,0.95)'], [0.4, 'rgba(138,200,255,0.92)'], [1, 'rgba(58,90,138,0.9)']];
    const torsoFn = (x, gold) => {
      const trim = gold ? KC.gold : 'rgba(232,244,255,0.85)';
      // 안개 하반신
      x.fillStyle = lin(x, 0, -34, 0, -4, [[0, 'rgba(138,200,255,0.85)'], [0.55, 'rgba(90,150,210,0.4)'], [1, 'rgba(90,150,210,0)']]);
      x.beginPath(); x.moveTo(-7, -34); x.bezierCurveTo(-9, -24, -4, -14, -3, -4); x.bezierCurveTo(-1, -10, 2, -16, 1, -8); x.bezierCurveTo(3, -16, 7, -24, 8, -34); x.closePath(); x.fill();
      // 허리 판금 (겹판)
      for (let i = 0; i < 3; i++) {
        const y = -40 + i * 3;
        x.fillStyle = lin(x, -8, y, 9, y, plate); x.beginPath();
        x.moveTo(-7.4 + i * 0.3, y); x.lineTo(8.6 - i * 0.2, y - 0.4); x.lineTo(8.2 - i * 0.4, y + 3.4); x.lineTo(-7 + i * 0.6, y + 3.8); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(16,24,40,0.9)'; x.lineWidth = 0.5; x.stroke();
        x.strokeStyle = trim; x.lineWidth = 0.3; x.beginPath(); x.moveTo(-7 + i * 0.6, y + 3.5); x.lineTo(8.2 - i * 0.4, y + 3.1); x.stroke();
      }
      // 흉갑
      x.fillStyle = rad(x, 3, -52, 1, 12, plate, 5, -54);
      x.beginPath(); x.moveTo(-6.8, -56.6); x.bezierCurveTo(-1, -58, 6, -57.6, 8.4, -55); x.bezierCurveTo(10.8, -50, 10.4, -44, 8.8, -40.4); x.lineTo(-7.2, -40.2); x.bezierCurveTo(-8.2, -46, -8, -52, -6.8, -56.6); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(16,24,40,0.9)'; x.lineWidth = 0.6; x.stroke();
      x.strokeStyle = trim; x.lineWidth = 0.4; x.beginPath(); x.moveTo(2.6, -57.4); x.bezierCurveTo(6.6, -52, 6.8, -46, 5, -40.8); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 0.5; x.beginPath(); x.moveTo(-5.6, -55.4); x.bezierCurveTo(-1, -56.8, 4, -56.4, 7.4, -54.2); x.stroke();
      // 먼 어깨받이
      x.fillStyle = 'rgba(58,90,138,0.9)'; x.beginPath(); x.ellipse(-4.6, -55, 4.2, 3.2, -0.3, Math.PI, TAU); x.fill(); x.stroke();
      // 목가리개 · 투구
      x.fillStyle = lin(x, 0, -60, 0, -56, [[0, 'rgba(58,90,138,0.95)'], [1, 'rgba(16,24,40,0.95)']]); x.fillRect(-3.4, -60, 7.6, 4);
      x.fillStyle = rad(x, 1, -67, 1, 9, plate, 2.6, -69);
      x.beginPath(); x.moveTo(-5.2, -59.4); x.lineTo(-5.8, -67); x.bezierCurveTo(-5.6, -72, 3.6, -73.2, 5.8, -69); x.lineTo(6.6, -63.6); x.lineTo(5.8, -59.6); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(16,24,40,0.95)'; x.lineWidth = 0.6; x.stroke();
      x.strokeStyle = trim; x.lineWidth = 0.4; x.beginPath(); x.moveTo(0.4, -72.6); x.lineTo(0.8, -59.6); x.stroke();
      // 눈 틈 (어두운 홈, 빛은 실행 중에)
      x.fillStyle = '#0a1020'; x.beginPath(); x.moveTo(1.4, -66.4); x.lineTo(6.6, -66.2); x.lineTo(6.5, -64.8); x.lineTo(1.4, -65.2); x.closePath(); x.fill();
      x.fillStyle = 'rgba(16,24,40,0.9)'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(4.2 + i * 0.9, -62 + (i % 2) * 0.5, 0.25, 0, TAU); x.fill(); }
      // 가까운 어깨받이
      x.fillStyle = rad(x, 4, -56, 0.5, 6, plate, 3, -57.6);
      x.beginPath(); x.moveTo(-0.4, -54.8); x.bezierCurveTo(0, -59.4, 7.8, -59.4, 8.8, -55.2); x.bezierCurveTo(8.4, -52.6, 6.4, -51.2, 4.2, -51); x.bezierCurveTo(2, -51.4, 0.2, -52.6, -0.4, -54.8); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(16,24,40,0.95)'; x.lineWidth = 0.5; x.stroke();
      x.strokeStyle = trim; x.lineWidth = 0.35; x.beginPath(); x.moveTo(0.6, -54.2); x.bezierCurveTo(2.4, -52.2, 6, -52, 8, -54.6); x.stroke();
    };
    const torso = bake(-12, -75, 13, -2, (x) => torsoFn(x, false));
    const torsoG = bake(-12, -75, 13, -2, (x) => torsoFn(x, true));
    const cape = bake(-17, -1, 4, 43, (x) => {
      x.beginPath(); x.moveTo(-3, 0); x.bezierCurveTo(-6, 6, -10, 16, -15.6, 38);
      const hem = [[-15.6, 38], [-13.6, 35.4], [-12.4, 40.6], [-10, 36.4], [-8.2, 41.8], [-6.2, 37], [-4.2, 40], [-2.4, 35.6]];
      for (const [hx, hy] of hem) x.lineTo(hx, hy);
      x.bezierCurveTo(-1.6, 24, 0.6, 10, 3, 0.4); x.closePath();
      x.fillStyle = lin(x, -6, 0, -8, 40, [[0, 'rgba(34,58,104,0.95)'], [0.6, 'rgba(20,34,70,0.9)'], [1, 'rgba(10,20,44,0.75)']]); x.fill();
      x.strokeStyle = 'rgba(8,12,24,0.95)'; x.lineWidth = 0.5; x.stroke();
      x.strokeStyle = 'rgba(138,200,255,0.3)'; x.lineWidth = 0.4;
      x.beginPath(); x.moveTo(-2, 3); x.quadraticCurveTo(-6, 20, -11, 36); x.moveTo(0, 4); x.quadraticCurveTo(-2, 20, -5, 37); x.stroke();
      x.fillStyle = 'rgba(0,0,0,0)';
    });
    const arm = bake(-3.2, -1.8, 3.4, 18, (x) => {
      x.fillStyle = lin(x, -3, 0, 3, 0, plate);
      x.beginPath(); x.moveTo(-2.4, 0); x.lineTo(2.2, 0); x.lineTo(1.8, 8); x.lineTo(2.4, 14); x.lineTo(-2, 14.4); x.lineTo(-1.8, 8); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(16,24,40,0.9)'; x.lineWidth = 0.45; x.stroke();
      x.beginPath(); x.moveTo(-2.1, 7.6); x.lineTo(2.1, 7.8); x.stroke();
      x.fillStyle = 'rgba(138,200,255,0.95)'; x.beginPath(); x.ellipse(0.2, 15.3, 2.2, 2, 0, 0, TAU); x.fill(); x.stroke();
    });
    const sword = bake(-4.8, -37, 4.8, 6, (x) => {
      x.fillStyle = lin(x, -1.2, 0, 1.2, 0, [[0, 'rgba(150,210,255,0.95)'], [0.5, 'rgba(250,254,255,1)'], [1, 'rgba(120,180,240,0.95)']]);
      x.beginPath(); x.moveTo(-1.2, -3); x.lineTo(-1, -32); x.lineTo(0, -35.6); x.lineTo(1, -32); x.lineTo(1.2, -3); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(16,24,40,0.9)'; x.lineWidth = 0.4; x.stroke();
      x.strokeStyle = 'rgba(60,110,180,0.6)'; x.lineWidth = 0.3; x.beginPath(); x.moveTo(0, -4); x.lineTo(0, -30); x.stroke();
      x.fillStyle = '#5a7aa8'; x.beginPath(); x.rect(-4.4, -3.6, 8.8, 1.3); x.fill(); x.stroke();
      x.fillStyle = '#2a3a58'; x.fillRect(-0.7, -2.3, 1.4, 5); x.strokeRect(-0.7, -2.3, 1.4, 5);
      x.fillStyle = '#8ac8ff'; x.beginPath(); x.arc(0, 3.6, 1.1, 0, TAU); x.fill(); x.stroke();
    });
    const shieldFn = (x, gold) => {
      x.beginPath(); x.moveTo(-8, -11); x.quadraticCurveTo(0, -13, 8, -11); x.bezierCurveTo(8.6, -1, 5, 8, 0, 15.6); x.bezierCurveTo(-5, 8, -8.6, -1, -8, -11); x.closePath();
      x.fillStyle = rad(x, -2, -6, 1, 18, [[0, 'rgba(200,230,255,0.95)'], [0.5, 'rgba(120,175,235,0.92)'], [1, 'rgba(50,80,130,0.92)']]); x.fill();
      x.strokeStyle = gold ? KC.gold : 'rgba(40,64,104,0.95)'; x.lineWidth = 1.2; x.stroke();
      x.strokeStyle = 'rgba(16,24,40,0.95)'; x.lineWidth = 0.4; x.stroke();
      x.fillStyle = 'rgba(20,32,60,0.7)';
      x.beginPath(); x.rect(-1.1, -8.4, 2.2, 18); x.rect(-5.8, -4.6, 11.6, 2.2); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 0.4; x.beginPath(); x.moveTo(-6.8, -10.2); x.quadraticCurveTo(0, -12, 6.8, -10.2); x.stroke();
    };
    const shield = bake(-9.5, -14, 9.5, 17, (x) => shieldFn(x, false));
    const shieldG = bake(-9.5, -14, 9.5, 17, (x) => shieldFn(x, true));
    const wisp = bake(-3, -10, 3, 1, (x) => {
      x.fillStyle = lin(x, 0, 0, 0, -10, [[0, 'rgba(180,220,255,0)'], [0.4, 'rgba(160,210,255,0.55)'], [1, 'rgba(120,180,240,0)']]);
      x.beginPath(); x.moveTo(0, 0.5); x.bezierCurveTo(-3, -3, 2, -6, -1, -10); x.bezierCurveTo(3, -6, 2.6, -2, 0, 0.5); x.closePath(); x.fill();
    });
    return { torso, torsoG, cape, arm, sword, shield, shieldG, wisp };
  });
}
function drawKnight(ctx, g, world, opts) {
  const P = knightParts();
  if (!P?.torso) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const cast = an === 'skill', guard = an === 'guard', emote = an === 'emote';
  const attack = an === 'attack', bash = an === 'assist';
  const bob = Math.sin(t * 2.6 + (g.seed ?? 0)) * 1.5;
  const moving = Math.abs(s.vxf) > 60;
  let lean = clamp(s.vxf * 0.0004, -0.1, 0.16) - s.hurt * 0.15 + (attack ? 0.06 : 0);
  ctx.save(); ctx.globalAlpha *= 0.3; ctx.fillStyle = '#081020'; ctx.beginPath(); ctx.ellipse(0, -0.5, 13, 2.2, 0, 0, TAU); ctx.fill(); ctx.restore();
  const ap = s.appear;
  if (ap < 1) { ctx.translate(0, (1 - ap) * 20); gGlow(ctx, 0, -30, 34, '#8ac8ff', 0.7 * (1 - ap)); }
  gGlow(ctx, 0, -44 + bob, 30, '#8ac8ff', (cast || guard ? 0.45 : 0.16) + (s.aw ? 0.12 : 0));
  ctx.translate(0, bob);
  ctx.globalAlpha *= 0.9;
  // 안개 자락 (뒤로 흐름)
  for (let i = 0; i < (s.hiQ ? 3 : 2); i++) {
    const ph = t * 1.4 + i * 2.1;
    blitAdd(ctx, P.wisp, -3 + i * 3 - (moving ? 6 : 0) + Math.sin(ph) * 2, -2 - i * 5, -0.4 - (moving ? 0.5 : 0) + Math.sin(ph * 0.7) * 0.3, 1.2 - i * 0.2, 1.1 + Math.sin(ph) * 0.2, 0.6);
  }
  ctx.save();
  ctx.translate(0, -36); ctx.rotate(lean); ctx.translate(0, 36);
  // 망토 (흔들림 = 기울임 변형)
  const shx = Math.sin(t * 1.8) * 0.06 - (moving ? 0.28 : 0) - lean * 0.6;
  ctx.save(); ctx.translate(-2, -56); ctx.transform(1, 0, shx, 1, 0, 0);
  blit(ctx, P.cape, 0, 0, 0, 1, 1 + Math.sin(t * 2.3) * 0.02);
  ctx.restore();
  // 검 팔 (먼 쪽)
  let ar = -0.55 + Math.sin(t * 1.6) * 0.05, sr = 0.42;
  if (attack) {
    const n = Math.floor(at / 0.18), p = (at % 0.18) / 0.18;
    ar = n % 2 === 0 ? lerp(-2.6, 0.9, easeIO(p)) : lerp(0.9, -2.2, easeIO(p));
    sr = 0.2;
  } else if (cast) { ar = lerp(0.2, -2.95, easeOut(clamp(at / 0.2, 0, 1))); sr = 0.1; }
  else if (emote) { ar = -1.7 + Math.sin(clamp(at, 0, 1) * Math.PI) * 0.1; sr = -1.2; }
  else if (bash) { ar = 0.5; sr = -0.1; }
  else if (s.hurt > 0) ar = 0.6;
  const sax = -1.2, say = -53.5;
  ctx.save(); ctx.translate(sax, say); ctx.rotate(ar);
  blit(ctx, P.arm, 0, 0);
  ctx.translate(0.2, 15.2); ctx.rotate(sr - Math.PI / 2 + Math.PI / 2);
  const swordA = (attack || cast) ? 1 : 0.92;
  blit(ctx, P.sword, 0, 0, 0, 1, 1, swordA);
  blitAdd(ctx, P.sword, 0, 0, 0, 1, 1, s.hiQ ? 0.25 + (attack ? 0.35 : 0) : 0);
  ctx.restore();
  // 검 궤적 (휘두를 때)
  if (attack && s.q > 0.5) {
    const n = Math.floor(at / 0.18), p = (at % 0.18) / 0.18;
    if (p > 0.2 && p < 0.95) {
      const a0 = n % 2 === 0 ? -2.6 : 0.9, a1 = ar;
      ctx.save(); ctx.translate(sax, say); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(190,230,255,0.35)'; ctx.lineWidth = 5; ctx.beginPath();
      const st = Math.min(a0, a1) + Math.PI / 2, en = Math.max(a0, a1) + Math.PI / 2;
      ctx.arc(0, 0, 36, st, en); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, 37, st, en); ctx.stroke();
      ctx.restore();
    }
  }
  blit(ctx, s.aw ? P.torsoG : P.torso, 0, 0);
  if (s.hiQ) blitAdd(ctx, P.torso, 0, 0, 0, 1, 1, 0.12);
  // 눈 틈 빛
  gGlow(ctx, 4.4, -65.6, 3.2, '#ffffff', 0.95, 0.25);
  gGlow(ctx, 5, -65.6, 8, '#bfe6ff', 0.45);
  // 방패 (가까운 쪽)
  let sxp = 6.4, syp = -45, srot = -0.05, ssc = 1;
  if (guard) { const k = easeOut(clamp(at / 0.12, 0, 1)); sxp = lerp(6.4, 11, k); syp = lerp(-45, -52, k); ssc = 1 + 0.08 * k; }
  else if (cast) { sxp = 10; syp = -48; }
  else if (bash) { const k = at < 0.1 ? easeOut(at / 0.1) : 1 - clamp((at - 0.1) / 0.2, 0, 1); sxp = 6.4 + 8 * k; srot = -0.15 * k; }
  else if (attack) { sxp = 4.6; syp = -43; srot = 0.1; }
  blit(ctx, s.aw ? P.shieldG : P.shield, sxp, syp, srot, ssc, ssc, 0.95);
  if (guard || cast) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 10);
    gGlow(ctx, sxp, syp, 18, '#bfe6ff', 0.4 + 0.2 * pulse);
    gHalo(ctx, sxp + 2, syp, 7 + pulse * 2, 12 + pulse * 2, '#8ac8ff', 0.5, 0.6);
  }
  ctx.restore();
  if (cast) {   // 하늘로 치솟는 빛
    const k = clamp(at / 0.3, 0, 1), fade = 1 - clamp((at - 0.45) / 0.2, 0, 1);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.4 * fade;
    ctx.fillStyle = '#8ac8ff'; ctx.fillRect(-7, -120 * k - 70, 10, 120 * k);
    ctx.fillStyle = '#e8f4ff'; ctx.fillRect(-3.5, -120 * k - 70, 3, 120 * k); ctx.restore();
  }
  return true;
}

// ═════════════════════════ 크론 (새끼 본 드래곤) ═════════════════════════
// 큰 해골 · 갈비뼈 속 보랏빛 영혼불 · 찢어진 막의 뼈 날개 · 꿈틀대는 뼈 꼬리. 발 원점, 몸 중심 (0,-15)
const BONE = [[0, '#fffaf0'], [0.55, '#e8e0d0'], [1, '#9a9080']];
function whelpParts() {
  return cached('whelp', () => {
    const body = bake(-13, -8, 9, 11, (x) => {
      // 속 어둠 (영혼불 자리)
      x.fillStyle = 'rgba(42,32,48,0.85)'; x.beginPath(); x.ellipse(-2, 0.4, 6.4, 4.8, 0, 0, TAU); x.fill();
      // 다리 (접음)
      limb(x, [[-8.6, 1.6], [-10.6, 5], [-8.4, 7.6]], 1.05, '#b8ae9a');
      limb(x, [[2.2, 3], [0.8, 6.4], [3, 8.2]], 1.05, '#b8ae9a');
      limb(x, [[-7.6, 2.2], [-9, 5.8], [-6.8, 8.2]], 1.2, '#e0d8c6');
      limb(x, [[3.2, 3.2], [2.2, 6.8], [4.6, 8.4]], 1.2, '#e0d8c6');
      x.strokeStyle = '#2a2030'; x.lineWidth = 0.35; x.beginPath();
      for (const [fx, fy] of [[-6.8, 8.2], [4.6, 8.4]]) { x.moveTo(fx, fy); x.lineTo(fx + 1.2, fy + 0.4); x.moveTo(fx, fy); x.lineTo(fx + 0.9, fy + 1); }
      x.stroke();
      // 척추
      limb(x, [[6, -3.6], [2, -5], [-4, -4.8], [-9, -2.6], [-10.6, -0.6]], 1.1, '#e8e0d0');
      x.fillStyle = '#fffaf0'; x.strokeStyle = OUT; x.lineWidth = 0.25;
      for (let i = 0; i < 7; i++) { const px = 5 - i * 2.2, py = -4.6 + Math.pow(i / 6, 2) * 3.4; x.beginPath(); x.moveTo(px - 0.6, py); x.lineTo(px - 0.2, py - 1.3); x.lineTo(px + 0.4, py - 0.1); x.closePath(); x.fill(); x.stroke(); }
      // 갈비뼈
      for (let i = 0; i < 5; i++) {
        const rx = 3 - i * 2.1;
        limb(x, [[rx + 0.2, -4.6], [rx + 2.2 - i * 0.2, -1], [rx + 1.2 - i * 0.2, 3.6 - i * 0.2], [rx - 0.6, 4.6 - i * 0.3]], 0.75, i % 2 ? '#e0d8c6' : '#f0e8d8', OUT, 0.5);
      }
      // 골반
      x.fillStyle = rad(x, -9.6, 0.6, 0.2, 2.8, BONE); x.beginPath(); x.ellipse(-9.6, 0.6, 2.2, 1.6, 0.3, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
    });
    const skull = bake(-5, -13.5, 17, 5, (x) => {
      // 뿔
      x.fillStyle = lin(x, 0, -12, 0, -5, [[0, '#fffaf0'], [1, '#a89c86']]); x.strokeStyle = OUT; x.lineWidth = 0.35;
      for (const [hx, s] of [[1.2, 1], [3.6, 0.8]]) {
        x.beginPath(); x.moveTo(hx, -5.4); x.bezierCurveTo(hx - 2.4 * s, -8.6 * s, hx - 4.8 * s, -10.6, hx - 3.8 * s, -12.8); x.bezierCurveTo(hx - 2.6 * s, -10.4, hx + 0.6, -8.6, hx + 2.2, -6.2); x.closePath(); x.fill(); x.stroke();
      }
      // 머리뼈 (크고 둥글게)
      x.fillStyle = rad(x, 5, -5, 0.5, 9, BONE, 4, -7);
      x.beginPath(); x.moveTo(-2, -1); x.bezierCurveTo(-3.4, -7.6, 3.6, -10.8, 8.4, -8.2); x.bezierCurveTo(11, -6.8, 12.6, -5, 15.6, -3.4);
      x.quadraticCurveTo(16.6, -2.2, 15.4, -1.2); x.lineTo(9, 0.6); x.bezierCurveTo(5.6, 2.2, 0.2, 2.4, -2, -1); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.45; x.stroke();
      // 금 · 콧구멍
      x.strokeStyle = 'rgba(90,80,70,0.8)'; x.lineWidth = 0.3; x.beginPath(); x.moveTo(3.4, -8.8); x.lineTo(4.4, -6.8); x.lineTo(3.8, -5.6); x.stroke();
      x.fillStyle = '#2a2030'; x.beginPath(); x.ellipse(14.4, -3.4, 0.7, 0.4, -0.4, 0, TAU); x.fill();
      // 큰 눈구멍
      x.fillStyle = '#1a1020'; x.beginPath(); x.ellipse(7.2, -4.6, 2.5, 2.3, 0.1, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(120,100,90,0.8)'; x.lineWidth = 0.4; x.beginPath(); x.arc(7.2, -4.6, 2.6, 3.4, 5.6); x.stroke();
      // 윗니
      x.fillStyle = '#fffaf0'; x.strokeStyle = OUT; x.lineWidth = 0.22;
      for (let i = 0; i < 5; i++) { const tx = 9.4 + i * 1.2; x.beginPath(); x.moveTo(tx, -0.4 - i * 0.18); x.lineTo(tx + 0.45, 0.9 - i * 0.18); x.lineTo(tx + 0.9, -0.5 - i * 0.18); x.closePath(); x.fill(); x.stroke(); }
    });
    const jaw = bake(-1, -1.5, 14, 4, (x) => {
      x.fillStyle = rad(x, 5, 1, 0.3, 8, BONE);
      x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(4, 2.8, 9, 2.6, 13.4, 0.6); x.lineTo(12.8, -0.4); x.bezierCurveTo(9, 0.8, 4, 0.6, 0.6, -1); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
      x.fillStyle = '#fffaf0';
      for (let i = 0; i < 4; i++) { const tx = 7.6 + i * 1.3; x.beginPath(); x.moveTo(tx, 0.4); x.lineTo(tx + 0.45, -0.9); x.lineTo(tx + 0.9, 0.3); x.closePath(); x.fill(); x.stroke(); }
    });
    const wingFn = (x, fire) => {
      x.beginPath(); x.moveTo(0, 0); x.lineTo(-5, -7.6); x.lineTo(-12.4, -10.6); x.lineTo(-11.4, -8.4); x.lineTo(-13, -6.2); x.lineTo(-14.8, -4.6);
      x.lineTo(-12, -3.2); x.lineTo(-11.4, 0.2); x.lineTo(-9.6, -0.6); x.lineTo(-8, 2); x.lineTo(-4.6, 0.4); x.lineTo(-2, 1.4); x.closePath();
      x.fillStyle = fire ? rad(x, -6, -4, 0.5, 12, [[0, 'rgba(255,220,255,0.9)'], [0.5, 'rgba(200,110,255,0.75)'], [1, 'rgba(120,40,200,0.4)']])
        : rad(x, -6, -4, 0.5, 12, [[0, 'rgba(110,64,140,0.9)'], [0.7, 'rgba(70,40,96,0.85)'], [1, 'rgba(42,24,56,0.8)']]);
      x.fill();
      if (!fire) {   // 찢어진 구멍
        x.globalCompositeOperation = 'destination-out';
        for (const [hx, hy, r] of [[-9.6, -5.4, 0.9], [-7, -2.6, 0.6], [-11.6, -1.6, 0.5]]) { x.beginPath(); x.arc(hx, hy, r, 0, TAU); x.fill(); }
        x.globalCompositeOperation = 'source-over';
      }
      x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      limb(x, [[0, 0], [-5, -7.6], [-12.4, -10.6]], 0.8, '#e8e0d0', OUT, 0.5);
      for (const [fx, fy] of [[-14.8, -4.6], [-11.4, 0.2], [-8, 2]]) limb(x, [[-5, -7.6], [fx, fy]], 0.5, '#d8d0bc', OUT, 0.4);
      x.fillStyle = '#fffaf0'; x.beginPath(); x.arc(-5, -7.6, 0.8, 0, TAU); x.fill();
    };
    const wing = bake(-16, -12, 1.5, 3.5, (x) => wingFn(x, false));
    const wingF = bake(-16, -12, 1.5, 3.5, (x) => wingFn(x, true));
    const wing2 = tinted(wing, 'rgba(20,10,30,1)', 0.45);
    const vert = bake(-1.6, -1.2, 1.6, 1.2, (x) => {
      x.fillStyle = rad(x, 0, -0.3, 0.1, 1.6, BONE); x.beginPath(); x.ellipse(0, 0, 1.3, 0.9, 0, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.25; x.stroke();
      x.fillStyle = '#e8e0d0'; x.beginPath(); x.moveTo(-0.4, -0.7); x.lineTo(0.1, -1.15); x.lineTo(0.5, -0.6); x.fill();
    });
    return { body, skull, jaw, wing, wingF, wing2, vert };
  });
}
function drawWhelp(ctx, g, world, opts) {
  const P = whelpParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const cast = an === 'skill', emote = an === 'emote', atk = an === 'attack', ast = an === 'assist';
  const beat = Math.sin(t * 11);
  const bob = -beat * 1.4 + Math.sin(t * 2.1 + (g.seed ?? 0)) * 1.2;
  let tilt = clamp(s.vxf * 0.0008, -0.2, 0.25) - s.hurt * 0.3;
  let open = 0.08 + Math.max(0, Math.sin(t * 1.7)) * 0.06, head = Math.sin(t * 1.9) * 0.05;
  if (atk) { open = 0.6; head = 0.12; }
  else if (cast) { const k = easeOut(clamp(at / 0.2, 0, 1)); open = 0.75 * k; head = -0.3 * k; }
  else if (emote) { open = Math.abs(Math.sin(at * 18)) * 0.45; head = 0.25; }
  else if (ast) { open = at < 0.08 ? at / 0.08 * 0.6 : Math.max(0, 0.6 - (at - 0.08) * 4); }
  const sc = 0.55 + 0.45 * s.appear;
  const fireA = 0.6 + 0.25 * Math.sin(t * 9) + (cast ? 0.5 : 0) + (atk ? 0.3 : 0);
  gGlow(ctx, -2, -15 + bob, cast ? 24 : 14, '#b060ff', 0.22 + (cast ? 0.35 : 0));
  ctx.translate(0, -15 + bob);
  ctx.rotate(tilt);
  if (sc !== 1) ctx.scale(sc, sc);
  const wa = -0.15 + beat * 0.6 + (cast ? -0.4 : 0) + (atk ? 0.2 : 0);
  blit(ctx, P.wing2, -1, -4.2, wa + 0.3, 0.85, 0.85);
  // 꼬리 (척추 사슬)
  let px = -10.4, py = -0.2;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const ang = Math.PI + 0.25 + Math.sin(t * 4 - i * 0.7) * (0.12 + k * 0.28);
    px += Math.cos(ang) * 2.1; py += Math.sin(ang) * 2.1;
    blit(ctx, P.vert, px, py, ang, 1 - k * 0.45, 1 - k * 0.45);
  }
  gGlow(ctx, px - 1, py, 2.4, '#c080ff', 0.5, 0.3);
  blit(ctx, P.body, 0, 0);
  // 갈비뼈 속 영혼불
  for (let i = 0; i < 3; i++) gGlow(ctx, -2 + Math.sin(t * 7 + i * 2) * 1.4, 0.6 - i * 1.2 - Math.abs(Math.sin(t * 9 + i)) * 1.2, 4.4 - i * 0.9, i ? '#c070ff' : '#f0d8ff', fireA * (0.9 - i * 0.2), 0.25);
  // 머리 (목 끝 (6,-4))
  ctx.save(); ctx.translate(6, -4); ctx.rotate(head);
  blit(ctx, P.jaw, 3.6, 0.4, open);
  blit(ctx, P.skull, 0, 0);
  gGlow(ctx, 7.4, -4.6, 2.2, '#f0d8ff', 0.95, 0.25);
  gGlow(ctx, 7.4, -4.6, 5, '#b060ff', 0.55);
  if (open > 0.3) gGlow(ctx, 14, 0.8, 4 + open * 5, '#c080ff', open * 0.7);
  ctx.restore();
  blit(ctx, P.wing, -0.2, -4.6, wa, 1, 1);
  if (s.aw) blitAdd(ctx, P.wingF, -0.2, -4.6, wa, 1, 1, 0.45 + 0.25 * Math.sin(t * 13));
  return true;
}

// ═════════════════════════ 미네르바 (성스러운 올빼미) ═════════════════════════
// 흰·금 원숭이올빼미: 하트 모양 얼굴 · 금빛 눈 · 층층이 깃털 날개 · 머리 뒤 후광. 발 원점, 몸 중심 (0,-12)
function owlParts() {
  return cached('owl', () => {
    const face = (x) => {
      // 머리
      x.fillStyle = rad(x, 1, -7, 0.5, 6, [[0, '#fffaf0'], [0.7, '#f0e4c8'], [1, '#c8a870']]);
      x.beginPath(); x.ellipse(1, -6.4, 5.2, 4.9, 0, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.4; x.stroke();
      // 하트 얼굴판
      x.fillStyle = rad(x, 2.2, -6, 0.3, 4.6, [[0, '#ffffff'], [0.8, '#f6eedc'], [1, '#e0cca0']]);
      x.beginPath(); x.moveTo(2.2, -2.2); x.bezierCurveTo(-1.8, -3.4, -2.4, -8.6, -0.4, -9.8); x.quadraticCurveTo(1.2, -10.2, 2.2, -8.8); x.quadraticCurveTo(3.4, -10.4, 5, -9.6);
      x.bezierCurveTo(6.8, -8.2, 6, -3.4, 2.2, -2.2); x.closePath(); x.fill();
      x.strokeStyle = '#c8a040'; x.lineWidth = 0.45; x.stroke();
      // 눈 (금 · 빛은 실행 중)
      for (const ex of [0.7, 3.8]) { x.fillStyle = rad(x, ex, -6.4, 0.1, 1.4, [[0, '#fff2a0'], [0.6, '#f0b020'], [1, '#8a5a10']]); x.beginPath(); x.arc(ex, -6.4, 1.25, 0, TAU); x.fill(); x.fillStyle = '#1a1008'; x.beginPath(); x.arc(ex + 0.1, -6.35, 0.55, 0, TAU); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(ex - 0.3, -6.8, 0.25, 0, TAU); x.fill(); }
      // 부리
      x.fillStyle = '#e8c890'; x.beginPath(); x.moveTo(1.8, -5.4); x.lineTo(2.9, -5.4); x.lineTo(2.3, -3.7); x.closePath(); x.fill(); x.strokeStyle = '#6a5030'; x.lineWidth = 0.25; x.stroke();
    };
    const breast = (x, folded) => {
      x.fillStyle = rad(x, 1.4, 1, 0.5, 8, [[0, '#ffffff'], [0.6, '#f4ead4'], [1, '#c8a870']]);
      x.beginPath(); x.ellipse(0.4, 1.4, 5.4, 7, 0, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.4; x.stroke();
      x.fillStyle = '#d8a830';
      for (let i = 0; i < 16; i++) { const px = -2.8 + hsh(i) * 6.8, py = -2.6 + hsh(i + 30) * 8.6; x.beginPath(); x.ellipse(px, py, 0.32, 0.22, 0, 0, TAU); x.fill(); }
      if (folded) {   // 접은 날개 (옆면)
        x.fillStyle = lin(x, -5, -3, 3, 9, [[0, '#e8d4a0'], [0.5, '#c8a060'], [1, '#8a6a30']]);
        x.beginPath(); x.moveTo(-4.8, -3); x.bezierCurveTo(0, -4.4, 4.4, 1, 3.4, 6); x.bezierCurveTo(2, 10, -3.4, 11.6, -6.4, 12.6); x.bezierCurveTo(-5.8, 8, -6.2, 2, -4.8, -3); x.closePath(); x.fill();
        x.strokeStyle = OUT; x.lineWidth = 0.4; x.stroke();
        x.strokeStyle = 'rgba(255,248,216,0.8)'; x.lineWidth = 0.3; x.beginPath();
        for (let i = 0; i < 4; i++) { x.moveTo(-4.6 + i * 0.5, 2 + i * 2.2); x.quadraticCurveTo(-1 + i * 0.4, 1.8 + i * 2.2, 2.4 - i * 0.6, 4 + i * 1.8); }
        x.stroke();
        x.fillStyle = '#fff2c0'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(-3 + hsh(i + 70) * 5, 0 + hsh(i + 80) * 8, 0.3, 0, TAU); x.fill(); }
      }
    };
    const talons = (x, spread) => {
      for (const lx of [-1, 1.8]) {
        limb(x, [[lx, 7], [lx + (spread ? 0.8 : 0.2), 10.2]], 1.2, '#f0e4c8');
        x.strokeStyle = '#2a2018'; x.lineWidth = 0.4; x.beginPath();
        const fy = 10.4;
        x.moveTo(lx, fy); x.lineTo(lx + (spread ? 1.8 : 1.2), fy + (spread ? 0.8 : 0.6)); x.moveTo(lx, fy); x.lineTo(lx + 0.3, fy + 1.3); x.moveTo(lx, fy); x.lineTo(lx - (spread ? 1.2 : 0.8), fy + 0.8);
        x.stroke();
      }
    };
    const body = bake(-7, -13, 8, 13, (x) => { talons(x, true); breast(x, false); face(x); });
    const perched = bake(-8, -13, 8, 14, (x) => { talons(x, false); breast(x, true); face(x); });
    const wing = bake(-17, -9, 1.5, 6, (x) => {
      // 첫째 날개깃 (부채꼴)
      for (let i = 0; i < 6; i++) {
        const a = Math.PI + 0.55 - i * 0.2, L = 15 - i * 0.6;
        x.save(); x.rotate(a);
        x.beginPath(); x.moveTo(3, -1); x.quadraticCurveTo(L * 0.6, -1.8, L, -0.2); x.quadraticCurveTo(L * 0.6, 1.4, 3, 1); x.closePath();
        x.fillStyle = lin(x, 3, 0, L, 0, [[0, '#c8a060'], [0.75, '#e0c078'], [1, '#fff4d0']]); x.fill();
        x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
        x.strokeStyle = 'rgba(90,60,20,0.6)'; x.lineWidth = 0.18; x.beginPath(); x.moveTo(4, 0); x.lineTo(L - 1, -0.1); x.stroke();
        x.restore();
      }
      // 덮깃 (흰 바탕 · 금 반점)
      x.fillStyle = rad(x, -3, -2, 0.5, 8, [[0, '#ffffff'], [0.7, '#f0e4c8'], [1, '#d8b878']]);
      x.beginPath(); x.moveTo(1, -1.8); x.bezierCurveTo(-3, -5, -8, -5.4, -10.4, -3.4); x.bezierCurveTo(-8, -0.6, -5, 1.6, 1, 1.6); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
      x.strokeStyle = 'rgba(200,160,80,0.8)'; x.lineWidth = 0.25; x.beginPath();
      for (let i = 0; i < 3; i++) { x.moveTo(-1 - i * 2.6, -3.2 + i * 0.2); x.quadraticCurveTo(-2.4 - i * 2.6, -1, -1 - i * 2.4, 0.6); }
      x.stroke();
      x.fillStyle = '#d8a830'; for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(-1 - hsh(i + 90) * 8, -3 + hsh(i + 99) * 3.4, 0.28, 0, TAU); x.fill(); }
    });
    const wing2 = tinted(wing, 'rgba(60,40,20,1)', 0.35);
    return { body, perched, wing, wing2 };
  });
}
function drawOwl(ctx, g, world, opts) {
  const P = owlParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const perch = an === 'perch' || (!!g.perched && an === 'idle');
  const cast = an === 'skill', emote = an === 'emote', atk = isAtk(an);
  const bob = perch ? 0 : Math.sin(t * 2.4 + (g.seed ?? 0)) * 1.3;
  let tilt = perch ? 0 : clamp(s.vxf * 0.0008, -0.2, 0.3) - s.hurt * 0.3;
  if (atk) tilt = 0.55;
  if (emote) tilt = Math.sin(clamp(at, 0, 1) * Math.PI * 2) * 0.28;
  const sc = 0.55 + 0.45 * s.appear;
  gGlow(ctx, 0, -12 + bob, cast ? 24 : 12, '#ffe7a0', (cast ? 0.55 : 0.2));
  ctx.translate(0, -12 + bob);
  if (sc !== 1) ctx.scale(sc, sc);
  // 후광 (머리 뒤)
  const haloA = 0.75 + Math.sin(t * 2.4) * 0.15 + (cast ? 0.3 : 0);
  ctx.save(); ctx.rotate(tilt * 0.6);
  gHalo(ctx, 0.2, -8.2, 5.8, 5.6, '#ffe7a0', haloA, 0.5);
  if (s.aw) gHalo(ctx, 0.2, -8.2, 8.2, 7.8, '#fff2c0', haloA * 0.7, 0.4, t * 0.5);
  ctx.restore();
  if (perch) {
    ctx.rotate(tilt);
    blit(ctx, P.perched, 0, 0);
  } else {
    ctx.rotate(tilt);
    let wa = 0.75 + Math.sin(t * 9) * 0.7, wsy = 1;
    if (atk) { wa = 0.12; wsy = 0.8; }
    else if (cast) { wa = lerp(0.75, 1.3, easeOut(clamp(at / 0.2, 0, 1))); }
    else if (Math.abs(s.vxf) > 200) { wa = 0.35 + Math.sin(t * 6) * 0.2; }
    wsy *= 0.85 + 0.15 * Math.abs(Math.cos(t * 9));
    blit(ctx, P.wing2, -1.4, -2.6, wa + 0.35, 0.9, 0.9 * wsy);
    blit(ctx, P.body, 0, 0);
    blit(ctx, P.wing, -0.6, -2, wa, 1, wsy);
  }
  // 눈빛 (깜빡임: 앉아 있을 때 가끔)
  const blink = perch && ((t % 3.7) < 0.12);
  if (!blink) {
    const ea = cast ? 1 : 0.6;
    gGlow(ctx, 0.7, -6.4, cast ? 4 : 2.2, '#ffe070', ea, 0.25); gGlow(ctx, 3.8, -6.4, cast ? 4 : 2.2, '#ffe070', ea, 0.25);
  } else { ctx.fillStyle = '#e8d8b0'; ctx.fillRect(-0.6, -6.8, 2.6, 0.8); ctx.fillRect(2.5, -6.8, 2.6, 0.8); }
  if (cast) gGlow(ctx, 6, -6.4, 10 + Math.sin(t * 20) * 1.5, '#fff2a0', 0.7);
  return true;
}

/** 1부 수호신 여섯의 절차 그림 */
export const GUARDIAN_DRAW_A = { gd_fairy: drawFairy, gd_spiritwolf: drawWolf, gd_imp: drawImp, gd_knight: drawKnight, gd_whelp: drawWhelp, gd_owl: drawOwl };

// ───────────────────────── 원형 머리 아이콘 ─────────────────────────
/** 아이콘 초점 (발 원점 논리 좌표의 머리 중심 · 원 지름에 담을 폭) */
const ICON_FOCUS = {
  gd_fairy: [1, -19, 11], gd_spiritwolf: [17, -35, 20], gd_imp: [1.5, -21, 17], gd_knight: [1, -64, 18], gd_whelp: [10, -20, 21], gd_owl: [1, -18, 14],
};
const ICONS = new Map();
function fakeG(def) {
  return { id: def.id, def, anim: 'idle', animT: 0, t: 0.35, facing: 1, alpha: 1, seed: 0, vx: 0, vy: 0, cx: 0, bottom: 0, perched: false, d: { awakened: false }, hopY: () => 0 };
}
/** 초상화가 없을 때의 원형 아이콘 (주의: 호출 측이 이름 첫 글자를 그린 위에 원판을 덮는다) */
export function drawGuardianIcon(ctx, id, x, y, r) {
  if (!hasDoc || !(r > 0)) return false;
  const custom = GB.GUARDIAN_ICON_B?.[id];
  if (typeof custom === 'function') { try { return custom(ctx, x, y, r) !== false; } catch { return false; } }
  const fa = GUARDIAN_DRAW_A[id], fb = GB.GUARDIAN_DRAW_B?.[id];
  if (!fa && typeof fb !== 'function') return false;
  const m = ctx.getTransform(), k = Math.hypot(m.a, m.b) || 1;
  const px = clamp(Math.ceil(r * 2 * k), 16, 256);
  const key = id + ':' + px;
  let c = ICONS.get(key);
  if (!c) {
    const def = GUARDIANS[id] ?? null;
    if (!def) return false;
    c = mk(px, px);
    const x2 = c.getContext('2d'), R = px / 2;
    const col = def.color ?? '#c8a060';
    const bg = x2.createRadialGradient(R, R * 0.7, 1, R, R, R);
    bg.addColorStop(0, hexA(col.length === 7 ? col : '#c8a060', 0.55)); bg.addColorStop(0.55, '#1a1018'); bg.addColorStop(1, '#07040a');
    x2.fillStyle = bg; x2.beginPath(); x2.arc(R, R, R, 0, TAU); x2.fill();
    x2.save(); x2.beginPath(); x2.arc(R, R, R - 0.5, 0, TAU); x2.clip();
    const fo = ICON_FOCUS[id] ?? [0, -(def.size?.h ?? 24) * 0.65, (def.size?.w ?? 24) * 1.1];
    const sc = (px * 0.95) / fo[2];
    x2.translate(R - fo[0] * sc, R - fo[1] * sc); x2.scale(sc, sc);
    try { if (fa) fa(x2, fakeG(def), null, {}); else fb(x2, fakeG(def), null, {}); } catch { /* 아이콘 실패는 무시 */ }
    x2.restore();
    ICONS.set(key, c);
  }
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
  return true;
}

// ───────────────────────── 연출 도우미 ─────────────────────────
/** 아리아 「요정의 가호」 결계 (GFx: 플레이어 사각형을 따라간다) */
let DOME = null;
function domeSpr() {
  if (DOME || !hasDoc) return DOME;
  const c = mk(256, 256), x = c.getContext('2d'), R = 128;
  const g = x.createRadialGradient(R, R, R * 0.45, R, R, R);
  g.addColorStop(0, 'rgba(255,240,170,0)'); g.addColorStop(0.78, 'rgba(255,224,112,0.16)'); g.addColorStop(0.95, 'rgba(255,248,210,0.55)'); g.addColorStop(1, 'rgba(255,248,210,0)');
  x.fillStyle = g; x.beginPath(); x.arc(R, R, R, 0, TAU); x.fill();
  // 육각 격자 (가장자리로 갈수록 진하게)
  x.save(); x.beginPath(); x.arc(R, R, R * 0.97, 0, TAU); x.clip();
  x.strokeStyle = 'rgba(255,236,150,0.35)'; x.lineWidth = 1.2;
  const hs = 20;
  for (let row = -1; row < 16; row++) for (let col = -1; col < 16; col++) {
    const cx = col * hs * 1.5, cy = row * hs * 1.732 + (col % 2 ? hs * 0.866 : 0);
    const d = Math.hypot(cx - R, cy - R) / R;
    if (d > 1.05) continue;
    x.globalAlpha = clamp((d - 0.35) * 1.6, 0, 1);
    x.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; x.lineTo(cx + Math.cos(a) * hs * 0.95, cy + Math.sin(a) * hs * 0.95); } x.closePath(); x.stroke();
  }
  x.restore();
  DOME = c;
  return c;
}
export function fxFairyDome(ctx, e, world) {
  const s = domeSpr();
  if (!s) return false;
  const fade = clamp(Math.min(e.life / 0.3, (e.t ?? 0) / 0.15 + 0.2), 0, 1);
  const r = Math.max(e.w, e.h) * 0.75 + 12, cx = e.cx, cy = e.cy, t = world?.time ?? e.t ?? 0;
  const pul = 1 + Math.sin(t * 8) * 0.025;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= 0.9 * fade;
  ctx.drawImage(s, cx - r * pul, cy - r * pul, r * 2 * pul, r * 2 * pul);
  gHalo(ctx, cx, cy, r * 0.98, r * 0.98, '#ffe070', 0.55, 1.4);
  gHalo(ctx, cx, cy + r * 0.62, r * 0.7, r * 0.18, '#fff2b0', 0.6, 1.2, 0);
  // 오르는 빛 알갱이
  const n = hi(world) ? 8 : 4;
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.6 + i / n) % 1, a = i * 2.4 + t * 0.5;
    gStar(ctx, cx + Math.cos(a) * r * 0.8 * (1 - ph * 0.4), cy + r * 0.5 - ph * r * 1.3, 3 * (1 - ph) + 1, (1 - ph) * 0.9, t + i);
  }
  return true;
}
/** 가웨인 「수호의 방패진」 방패벽 (GFx x,y,w,h — data.f 방향) */
let WALL = null;
function wallSpr() {
  if (WALL || !hasDoc) return WALL;
  const c = mk(96, 256), x = c.getContext('2d');
  x.scale(96 / 34, 256 / 120);
  const g = x.createLinearGradient(0, 0, 34, 0);
  g.addColorStop(0, 'rgba(138,200,255,0)'); g.addColorStop(0.5, 'rgba(170,220,255,0.5)'); g.addColorStop(1, 'rgba(138,200,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 34, 120);
  x.lineJoin = 'round';
  for (let i = 0; i < 3; i++) {   // 겹친 연 방패 윤곽
    const cy = 20 + i * 38, cx = 17;
    x.beginPath(); x.moveTo(cx - 12, cy - 14); x.quadraticCurveTo(cx, cy - 17, cx + 12, cy - 14); x.bezierCurveTo(cx + 13, cy, cx + 7, cy + 12, cx, cy + 22); x.bezierCurveTo(cx - 7, cy + 12, cx - 13, cy, cx - 12, cy - 14); x.closePath();
    x.fillStyle = 'rgba(160,210,255,0.16)'; x.fill();
    x.strokeStyle = 'rgba(232,244,255,0.85)'; x.lineWidth = 1.4; x.stroke();
    x.fillStyle = 'rgba(232,244,255,0.55)'; x.fillRect(cx - 1.2, cy - 10, 2.4, 22); x.fillRect(cx - 7, cy - 4, 14, 2.4);
  }
  WALL = c;
  return c;
}
export function fxShieldWall(ctx, e, world) {
  const s = wallSpr();
  if (!s) return false;
  const fade = clamp(Math.min(e.life / 0.3, (e.t ?? 0) / 0.15), 0, 1);
  const t = world?.time ?? e.t ?? 0, cx = e.x + e.w / 2, W = 34, H = e.h;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= fade;
  const rise = Math.min(1, (e.t ?? 0) / 0.15);
  ctx.drawImage(s, cx - W / 2, e.y + H * (1 - rise), W, H * rise);
  gGlow(ctx, cx, e.y + H * 0.5, 50, '#8ac8ff', 0.35 + Math.sin(t * 6) * 0.08);
  // 위로 흐르는 물결
  ctx.strokeStyle = 'rgba(200,235,255,0.6)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.8 + i / 3) % 1, y = e.y + H * (1 - k);
    ctx.globalAlpha = fade * (1 - k) * 0.7;
    ctx.beginPath(); ctx.ellipse(cx, y, W * 0.55, 3, 0, 0, TAU); ctx.stroke();
  }
  return true;
}
/** 핌 「지옥불 소나기」 운석 (투사체 render: 원점 = 중심). guardian.js 가 연결하면 쓰인다 */
let METEOR = null;
function meteorSpr() {
  if (METEOR || !hasDoc) return METEOR;
  const c = mk(160, 48), x = c.getContext('2d');
  const tr = x.createLinearGradient(0, 24, 130, 24);
  tr.addColorStop(0, 'rgba(255,90,20,0)'); tr.addColorStop(0.7, 'rgba(255,140,40,0.55)'); tr.addColorStop(1, 'rgba(255,220,120,0.9)');
  x.fillStyle = tr; x.beginPath(); x.moveTo(0, 24); x.quadraticCurveTo(80, 6, 132, 12); x.lineTo(132, 36); x.quadraticCurveTo(80, 42, 0, 24); x.fill();
  const rk = x.createRadialGradient(134, 20, 2, 138, 24, 18);
  rk.addColorStop(0, '#fff2c0'); rk.addColorStop(0.35, '#ff8a2a'); rk.addColorStop(0.75, '#6a2410'); rk.addColorStop(1, '#2a1008');
  x.fillStyle = rk; x.beginPath();
  for (let i = 0; i < 9; i++) { const a = i * TAU / 9, r = 14 + hsh(i) * 4; x.lineTo(138 + Math.cos(a) * r, 24 + Math.sin(a) * r); }
  x.closePath(); x.fill();
  x.strokeStyle = 'rgba(255,200,90,0.8)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(130, 18); x.lineTo(140, 26); x.lineTo(134, 32); x.stroke();
  METEOR = c;
  return c;
}
export function fxMeteor(ctx, p, world) {
  const s = meteorSpr();
  if (!s) return false;
  const a = Math.atan2(p.vy ?? 1, p.vx ?? 0), sc = (p.scale ?? 1) * 0.42;
  ctx.rotate(a);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(s, -138 * sc, -24 * sc, 160 * sc, 48 * sc);
  ctx.globalCompositeOperation = 'source-over';
  gGlow(ctx, 0, 0, 16 * (p.scale ?? 1), '#ff7a2a', 0.6);
  return true;
}
/** 하티 「늑대 무리」 유령 늑대 (투사체 render: 원점 = 중심, vx 로 방향) */
export function fxPhantomWolf(ctx, pr, world) {
  const P = wolfParts();
  if (!P?.body) return false;
  const f = Math.sign(pr.vx) || 1, a = clamp((pr.life ?? 1) / 0.15, 0, 1) * clamp((pr.t ?? 1) / 0.08, 0, 1);
  const t = (pr.t ?? 0) + (pr.x ?? 0) * 0.001;
  const q = wolfPose('run', t * 1.25, 0, 900, 0, 0);
  ctx.scale(f * 1.15, 1.15);
  ctx.translate(0, 18);
  ctx.globalCompositeOperation = 'lighter';
  const trail = hi(world) ? 2 : 1;
  for (let i = trail; i >= 0; i--) {
    ctx.save();
    ctx.globalAlpha *= a * (i === 0 ? 0.85 : 0.3 / i);
    ctx.translate(-i * 16, 0);
    wolfFigure(ctx, P, q, t - i * 0.04, { noFx: i > 0, hi: false });
    ctx.restore();
  }
  gGlow(ctx, 10, -24, 26, '#7ee0ff', 0.45 * a);
  return true;
}
/** 미네르바 「성광의 눈」 광선 (GHit: x..x+w, 높이 h, data.f) */
let BEAM = null;
function beamSpr() {
  if (BEAM || !hasDoc) return BEAM;
  const c = mk(8, 64), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,242,160,0)'); g.addColorStop(0.3, 'rgba(255,230,140,0.55)'); g.addColorStop(0.44, 'rgba(255,252,230,0.95)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(0.56, 'rgba(255,252,230,0.95)'); g.addColorStop(0.7, 'rgba(255,230,140,0.55)'); g.addColorStop(1, 'rgba(255,242,160,0)');
  x.fillStyle = g; x.fillRect(0, 0, 8, 64);
  BEAM = c;
  return c;
}
export function fxHolyBeam(ctx, h, world) {
  const s = beamSpr();
  if (!s) return false;
  const t = world?.time ?? h.t ?? 0;
  const fade = clamp(Math.min(h.life / 0.2, ((h.t ?? 0) - (h.delay ?? 0)) / 0.06 + 0.2), 0, 1);
  if (fade <= 0) return true;
  const f = h.data?.f ?? 1, y = h.y + h.h / 2, x0 = f > 0 ? h.x : h.x + h.w, len = h.w;
  const wob = 1 + Math.sin(t * 40) * 0.08;
  const grow = clamp(((h.t ?? 0) - (h.delay ?? 0)) / 0.08, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= fade;
  const L = len * grow, bx = f > 0 ? x0 : x0 - L;
  ctx.drawImage(s, bx, y - h.h * 0.9 * wob, L, h.h * 1.8 * wob);
  ctx.globalAlpha *= 0.6;
  ctx.drawImage(s, bx, y - h.h * 0.35, L, h.h * 0.7);
  ctx.globalAlpha /= 0.6;
  // 흐르는 고리
  const n = hi(world) ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const k = ((t * 2.2 + i / n) % 1) * grow;
    gHalo(ctx, x0 + f * len * k, y, 3.5, h.h * 0.55, '#fff2a0', (1 - k) * 0.8, 1.2);
  }
  gGlow(ctx, x0, y, 30, '#fff2a0', 0.8);
  gStar(ctx, x0, y, 14 + Math.sin(t * 30) * 2, 0.9, t * 3);
  gGlow(ctx, x0 + f * L, y, 22, '#ffe7a0', 0.6 * grow);
  return true;
}
/** 크론 뼛조각 (투사체 render: 원점 = 중심) */
export function fxBoneShard(ctx, p, world) {
  const P = whelpParts();
  if (!P?.vert) return false;
  const t = p.t ?? 0, rot = (p.rot ?? 0) + t * (p.spin || 14);
  gGlow(ctx, 0, 0, 14, '#b060ff', 0.45);
  ctx.save(); ctx.rotate(rot);
  ctx.fillStyle = '#e8e0d0'; ctx.strokeStyle = OUT; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-9, -1.5); ctx.lineTo(7, -1.2); ctx.lineTo(10, 0); ctx.lineTo(7, 1.2); ctx.lineTo(-9, 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  for (const ex of [-9, 9]) { ctx.beginPath(); ctx.arc(ex, -1.6, 2, 0, TAU); ctx.arc(ex, 1.6, 2, 0, TAU); ctx.fill(); }
  ctx.restore();
  gGlow(ctx, 0, 0, 5, '#f0d8ff', 0.6, 0.25);
  return true;
}
/** 틱톡 「정지된 초침」 시계판 (GFx: e.cx/cy 중심, e.data {R, hm, hh, hs, ga}) */
let DIAL = null, GEAR = null;
function dialSpr() {
  if (DIAL || !hasDoc) return DIAL;
  const c = mk(512, 512), x = c.getContext('2d'), R = 256;
  x.translate(R, R);
  const g = x.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
  g.addColorStop(0, 'rgba(255,230,168,0.1)'); g.addColorStop(0.8, 'rgba(255,208,112,0.18)'); g.addColorStop(0.93, 'rgba(255,230,168,0.55)'); g.addColorStop(1, 'rgba(255,230,168,0)');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(255,220,140,0.9)';
  for (const [r, w] of [[0.9, 5], [0.84, 2], [0.62, 2], [0.2, 3]]) { x.lineWidth = w; x.beginPath(); x.arc(0, 0, R * r, 0, TAU); x.stroke(); }
  for (let i = 0; i < 60; i++) {
    const a = i * TAU / 60, major = i % 5 === 0;
    const r0 = R * (major ? 0.72 : 0.8), r1 = R * 0.84;
    x.lineWidth = major ? 5 : 2;
    x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); x.stroke();
    if (major) {   // 마름모 장식
      const rr = R * 0.67;
      x.fillStyle = 'rgba(255,236,180,0.9)';
      x.beginPath(); x.moveTo(Math.cos(a) * (rr + 9), Math.sin(a) * (rr + 9));
      x.lineTo(Math.cos(a + 0.05) * rr, Math.sin(a + 0.05) * rr); x.lineTo(Math.cos(a) * (rr - 9), Math.sin(a) * (rr - 9)); x.lineTo(Math.cos(a - 0.05) * rr, Math.sin(a - 0.05) * rr); x.closePath(); x.fill();
    }
  }
  // 안쪽 무늬 (꽃잎 호)
  x.lineWidth = 1.5; x.strokeStyle = 'rgba(255,220,140,0.45)';
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12; x.beginPath(); x.arc(Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4, R * 0.2, 0, TAU); x.stroke(); }
  DIAL = c;
  return c;
}
function gearSpr() {
  if (GEAR || !hasDoc) return GEAR;
  const c = mk(128, 128), x = c.getContext('2d');
  x.translate(64, 64);
  x.fillStyle = 'rgba(255,208,112,0.85)'; x.strokeStyle = 'rgba(120,80,20,0.9)'; x.lineWidth = 3;
  x.beginPath();
  for (let i = 0; i < 24; i++) { const a = i * TAU / 24, r = i % 2 ? 50 : 62; x.lineTo(Math.cos(a - 0.08) * r, Math.sin(a - 0.08) * r); x.lineTo(Math.cos(a + 0.08) * r, Math.sin(a + 0.08) * r); }
  x.closePath(); x.fill(); x.stroke();
  x.globalCompositeOperation = 'destination-out';
  x.beginPath(); x.arc(0, 0, 16, 0, TAU); x.fill();
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5; x.beginPath(); x.arc(Math.cos(a) * 34, Math.sin(a) * 34, 9, 0, TAU); x.fill(); }
  GEAR = c;
  return c;
}
export function fxClockFace(ctx, e, world) {
  const D = e.data ?? {}, dial = dialSpr(), gear = gearSpr();
  if (!dial || !(D.R > 0)) return false;
  const t = e.t ?? 0;
  const a = Math.min(1, t / 0.2) * clamp(e.life / 0.3, 0, 1);
  if (a <= 0.01) return true;
  const k = Math.min(1, t / 0.28), sc = 0.78 + 0.22 * easeOut(k);
  const R = D.R * sc, x = e.cx, y = e.cy;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 * a;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-(D.ga ?? 0) * 0.05); ctx.drawImage(dial, -R, -R, R * 2, R * 2); ctx.restore();
  if (gear) {
    const n = hi(world) ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const an = (D.ga ?? 0) + (i * TAU) / n, gx = x + Math.cos(an) * R * 1.02, gy = y + Math.sin(an) * R * 1.02, gr = R * (i === 0 ? 0.17 : 0.11);
      ctx.globalAlpha = 0.55 * a;
      ctx.save(); ctx.translate(gx, gy); ctx.rotate((D.ga ?? 0) * (i % 2 ? -3 : 3)); ctx.drawImage(gear, -gr, -gr, gr * 2, gr * 2); ctx.restore();
    }
  }
  ctx.lineCap = 'round';
  const hand = (ang, len, w, col, al) => {
    ctx.globalAlpha = al * a; ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * len * 0.12, y - Math.sin(ang) * len * 0.12); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
  };
  hand(D.hh ?? 0, R * 0.45, Math.max(4, R * 0.045), 'rgba(255,208,112,0.6)', 1); hand(D.hh ?? 0, R * 0.45, Math.max(2, R * 0.02), '#fff4d0', 0.9);
  hand(D.hm ?? 0, R * 0.72, Math.max(3, R * 0.03), 'rgba(255,208,112,0.6)', 1); hand(D.hm ?? 0, R * 0.72, Math.max(1.5, R * 0.014), '#fff4d0', 0.9);
  hand(D.hs ?? 0, R * 0.84, Math.max(1.5, R * 0.01), '#ff9a7a', 0.95);
  ctx.globalAlpha = 1;
  gGlow(ctx, x, y, R * 0.14, '#ffe6a8', a);
  gStar(ctx, x, y, R * 0.09, a, t);
  return true;
}
/** 모르스 「영혼 수확」 화면 가득 낫 (GFx 세로 띠: e.data {f, k, wind, color}) */
let SCYTHE = null;
function scytheSpr() {
  if (SCYTHE || !hasDoc) return SCYTHE;
  const c = mk(256, 512), x = c.getContext('2d');
  // 초승달 날: 바깥 호 (0..256 폭, 가운데 높이 256)
  x.translate(0, 256);
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(10,40,20,0)'); g.addColorStop(0.55, 'rgba(60,200,110,0.35)'); g.addColorStop(0.9, 'rgba(160,255,190,0.75)'); g.addColorStop(1, 'rgba(240,255,245,0.95)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(10, -250); x.quadraticCurveTo(330, 0, 10, 250); x.quadraticCurveTo(200, 0, 10, -250); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(240,255,245,0.95)'; x.lineWidth = 5; x.beginPath(); x.moveTo(10, -250); x.quadraticCurveTo(330, 0, 10, 250); x.stroke();
  SCYTHE = c;
  return c;
}
export function fxScytheSweep(ctx, e, world) {
  const D = e.data ?? {}, s = scytheSpr();
  if (!s) return false;
  if ((e.t ?? 0) < (D.wind ?? 0)) return true;
  const a = Math.min(1, (1 - (D.k ?? 0)) * 3 + 0.25) * clamp(e.life / 0.12, 0, 1);
  if (a <= 0.01) return true;
  const H = e.h * 0.95, W = H * 0.5, f = D.f ?? 1;
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(e.cx, e.cy); ctx.scale(f, 1);
  const n = hi(world) ? 4 : 2;
  for (let i = n; i >= 0; i--) {
    ctx.globalAlpha = a * (i === 0 ? 0.95 : 0.35 / i);
    ctx.drawImage(s, -W * 0.7 - i * 40, -H / 2, W, H);
  }
  ctx.globalAlpha = a;
  gGlow(ctx, W * 0.15, 0, H * 0.35, D.color ?? '#7aff9a', 0.35);
  // 영혼 알갱이
  const t = world?.time ?? e.t;
  for (let i = 0; i < (hi(world) ? 8 : 4); i++) {
    const yy = (hsh(i) - 0.5) * H * 0.9, xx = -W * 0.5 - hsh(i + 5) * 60 - ((t * 200 + i * 37) % 80);
    gGlow(ctx, xx, yy, 6 + hsh(i + 9) * 6, '#7aff9a', 0.6);
  }
  return true;
}
/** 미네르바 비밀의 눈: 부서지는 벽·가짜 벽 금빛 윤곽 ((ctx, g, world), g.mem.secrets = [tx,ty,…]) */
export function fxSecretOutline(ctx, g, world) {
  const L = g?.mem?.secrets;
  if (!L || !L.length) return true;
  const t = world?.time ?? g.t ?? 0;
  const a = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 4));
  ctx.lineJoin = 'round';
  ctx.globalAlpha = a * 0.45; ctx.strokeStyle = '#ffd870'; ctx.lineWidth = 5;
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  for (let i = 0; i < L.length; i += 2) ctx.rect(L[i] * TILE + 3, L[i + 1] * TILE + 3, TILE - 6, TILE - 6);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a; ctx.strokeStyle = '#ffe8a0'; ctx.lineWidth = 1.6;
  ctx.stroke();
  // 모서리 반짝임 (칸마다 하나, 돌아가며)
  ctx.globalAlpha = 1;
  for (let i = 0; i < L.length; i += 2) {
    const k = (t * 0.7 + hsh(i) ) % 1;
    const cx = L[i] * TILE + 3 + (k < 0.5 ? k * 2 * (TILE - 6) : TILE - 6), cy = L[i + 1] * TILE + 3 + (k < 0.5 ? 0 : (k - 0.5) * 2 * (TILE - 6));
    gStar(ctx, cx, cy, 5, a * 1.6, t * 2);
  }
  return true;
}
/** 크론 뼈불 숨결 원뿔 (GHit: data.f · data.color) */
let CONE = null;
function coneSpr() {
  if (CONE || !hasDoc) return CONE;
  const c = mk(256, 96), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(250,230,255,0.95)'); g.addColorStop(0.25, 'rgba(200,120,255,0.8)'); g.addColorStop(0.7, 'rgba(140,60,220,0.45)'); g.addColorStop(1, 'rgba(90,30,160,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, 44); x.quadraticCurveTo(120, 10, 256, 0); x.lineTo(256, 96); x.quadraticCurveTo(120, 86, 0, 52); x.closePath(); x.fill();
  // 불꽃 혀
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const y0 = 48 + (hsh(i) - 0.5) * 50, x0 = 40 + hsh(i + 3) * 150;
    const fg = x.createRadialGradient(x0, y0, 1, x0, y0, 22);
    fg.addColorStop(0, 'rgba(255,220,255,0.5)'); fg.addColorStop(1, 'rgba(180,90,255,0)');
    x.fillStyle = fg; x.beginPath(); x.ellipse(x0, y0, 26, 10, (hsh(i + 5) - 0.5) * 0.6, 0, TAU); x.fill();
  }
  CONE = c;
  return c;
}
export function fxBreath(ctx, h, world) {
  const s = coneSpr();
  if (!s) return false;
  const f = h.data?.f ?? 1, fade = clamp(h.life / 0.15, 0, 1), t = world?.time ?? h.t ?? 0;
  const grow = clamp((h.t - (h.delay ?? 0)) / 0.1, 0, 1);
  const x0 = f > 0 ? h.x : h.x + h.w, len = h.w * grow, y = h.y + h.h / 2;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= fade;
  ctx.save(); ctx.translate(x0, y); ctx.scale(f, 1);
  const wob = 1 + Math.sin(t * 30) * 0.06;
  ctx.drawImage(s, 0, -h.h * 0.8 * wob, len, h.h * 1.6 * wob);
  const n = hi(world) ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const k = ((t * 3 + i / n) % 1);
    gGlow(ctx, len * k, Math.sin(t * 12 + i * 2) * h.h * 0.25 * k, 8 + k * 14, i % 2 ? '#c080ff' : '#f0d8ff', (1 - k) * 0.7);
  }
  ctx.restore();
  gGlow(ctx, x0, y, 14, '#f0d8ff', 0.8);
  return true;
}
