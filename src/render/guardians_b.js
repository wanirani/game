// 수호신 렌더러 B — owner: CMP-GUARD-ART-B (companions §11.3; MASTER_PLAN §1.2 2부 수호신; ART_DECISION: 채색 퍼핏 + 절차 연출)
//
//  GUARDIAN_DRAW_B[id] = (ctx, g, world, opts) → true   틱톡 gd_clock · 모르스 gd_reaper · 미라 gd_mirra · 루멘 gd_lumen · 모모 gd_momo
//    절차(벡터 HD) 그림. render/guardians.js drawGuardian 이 채색 퍼핏(src/render/painted/companions/gd_*.js, reg/cmp-guard-art-b.js)이
//    없거나 준비 전·꺼짐(?painted=0 · __paintedOff · settings.painted=false)일 때 save/restore 로 감싸 부른다.
//    규약은 guardians.js 와 같다: ctx 는 월드(또는 메뉴) 좌표, g.cx/g.bottom 이 발 중앙, 이 함수가 facing 반전을 건다. world 는 null 일 수 있다(메뉴).
//  GUARDIAN_ICON_B[id] = (ctx, x, y, r) → true   원형 머리 아이콘 (초상화가 없을 때; 크기별로 한 번 구워 캐시)
//  연출 도우미 (guardian_ai_b.js 가 이름으로 찾는 선택 export — true 를 돌려주면 그쪽 대체 그림을 건너뛴다). 모두 (ctx, e, world), 월드 좌표:
//    fxGear (틱톡 톱니 탄, 원점 = 탄 중심, pr.t · pr.vx 로 회전) · fxMirrorShard (미라 파편 탄: orbit 이면 pr.orbitA, 아니면 속도 방향) ·
//    fxKaleido (만화경 궤도 고리: 플레이어 둘레, e.data.orbitT) · fxMirrorPane (되비추기 거울면: e.data {a, gx, gy}, 수명 0.26) ·
//    fxLumenFlash (심해의 등불 섬광: e 중심 = 루멘, e.data.R) · fxLumenBolts (번개 줄기: e.data.segs [x0,y0,x1,y1,…], color) ·
//    fxStunSparks (기절 표시: e.data.list, en.stun > 0 동안) · fxMomoVortex (악몽 포식 소용돌이: e 중심 = 모모의 입) · fxMorsel (삼킨 탄 조각)
//  애니메이션 타이밍은 guardian_ai_b.js · guardian.js 와 맞춘다:
//    틱톡 attack(burst) 0.46초 — 0.08/0.16/0.24 에 톱니 발사(반동) · skill 0.9초 — 0~0.35 태엽을 거꾸로 감음(fxClockFace 바늘과 같은 구간)
//    모르스 blink 0.1초(연기로 흩어짐) → attack (0.1 에 낫질) · skill 0.75초 — 0~0.18 들어 올림, 0.18~0.54 크게 휘두름(fxScytheSweep wind/sweep 과 같음)
//    미라 attack 0.3초 — 0.08 에 거울 번쩍 · skill 1.25초 거울을 높이 · 모모 attack(bite) 0.34초 — 0.14 에 코로 덥석 · skill 1.25초 들이마심 → 꺼억
// 규칙: 그리기는 게임 상태를 바꾸지 않는다, Math.random 금지 (결정적 해시), 그레이디언트·캔버스는 굽기 때만, 품질 world.fx.quality,
//   모바일 예산 (수호신 한 마리 ≤ 0.15 ms, MASTER_PLAN §5.2).
// 순환 import (guardians.js ↔ 이 파일): guardians.js 에서 가져오는 것은 함수 선언(호이스팅)뿐이고 모두 함수 안에서만 부른다.
import { TAU, clamp, lerp } from '../core/math.js';
import { gGlow, gStar, gHalo } from './guardians.js';
import { GUARDIANS } from '../data/companions.js';

// ───────────────────────── 공용 도우미 ─────────────────────────
const OUT = 'rgba(12,6,10,0.92)';
const hasDoc = typeof document !== 'undefined';
const hsh = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k));
const qOf = (world) => world?.fx?.quality ?? 1;
const hi = (world) => qOf(world) >= 0.95;
const alive = (e) => !!e && !e.dead && !(e.dying > 0);
const flashK = (world) => { const k = Number(world?.game?.settings?.flashFx ?? 1); return Number.isFinite(k) ? clamp(k, 0, 1) : 1; };

function mk(w, h) {
  if (!hasDoc) return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
const BS = 4;
/** 부위 스프라이트 굽기: 논리 좌표 상자 (x0,y0)-(x1,y1) 안을 fn(ctx) 로 (원점 = 피벗), S 텍셀/논리px */
function bake(x0, y0, x1, y1, fn, S = BS) {
  const c = mk((x1 - x0) * S, (y1 - y0) * S);
  if (!c) return null;
  const x = c.getContext('2d');
  x.scale(S, S); x.translate(-x0, -y0);
  x.lineJoin = 'round'; x.lineCap = 'round';
  fn(x);
  return { c, x0, y0, w: x1 - x0, h: y1 - y0 };
}
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
function blitAdd(ctx, s, x, y, rot, sx, sy, a) {
  if (!s || a <= 0.003) return;
  const g = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  blit(ctx, s, x, y, rot, sx, sy, a);
  ctx.globalCompositeOperation = g;
}
/** 실루엣 색 변형 (굽기 때 한 번) */
function tinted(s, color, alpha = 1) {
  if (!s) return null;
  const c = mk(s.c.width, s.c.height);
  if (!c) return null;
  const x = c.getContext('2d');
  x.drawImage(s.c, 0, 0);
  x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return { ...s, c };
}
function lin(x, x0, y0, x1, y1, stops) { const g = x.createLinearGradient(x0, y0, x1, y1); for (const [k, c] of stops) g.addColorStop(k, c); return g; }
function rad(x, cx, cy, r0, r1, stops, fx = cx, fy = cy) { const g = x.createRadialGradient(fx, fy, r0, cx, cy, r1); for (const [k, c] of stops) g.addColorStop(k, c); return g; }
function limb(x, pts, w, col, out = OUT, ow = 0.7) {
  x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
  x.strokeStyle = out; x.lineWidth = w + ow; x.stroke();
  x.strokeStyle = col; x.lineWidth = w; x.stroke();
}
function ball(x, cx, cy, r, stops, out = OUT, ow = 0.25) {
  x.fillStyle = rad(x, cx - r * 0.35, cy - r * 0.35, r * 0.1, r * 1.1, stops);
  x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
  if (ow) { x.strokeStyle = out; x.lineWidth = ow; x.stroke(); }
}
/** 톱니 윤곽 (중심 cx,cy · 바깥 r · 이 n) */
function gearPath(x, cx, cy, r, n, inner = 0.78, rot = 0) {
  x.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU, da = TAU / n;
    x.lineTo(cx + Math.cos(a - da * 0.28) * r * inner, cy + Math.sin(a - da * 0.28) * r * inner);
    x.lineTo(cx + Math.cos(a - da * 0.16) * r, cy + Math.sin(a - da * 0.16) * r);
    x.lineTo(cx + Math.cos(a + da * 0.16) * r, cy + Math.sin(a + da * 0.16) * r);
    x.lineTo(cx + Math.cos(a + da * 0.28) * r * inner, cy + Math.sin(a + da * 0.28) * r * inner);
  }
  x.closePath();
}
const CACHE = new Map();
function cached(key, make) {
  if (CACHE.has(key)) return CACHE.get(key);
  if (!hasDoc) return null;
  let v = null;
  try { v = make(); } catch (e) { v = null; }
  CACHE.set(key, v);
  return v;
}
const BRASS = [[0, '#fff0b0'], [0.45, '#d8a848'], [1, '#6a4418']];
const GOLD = [[0, '#fff6c8'], [0.5, '#e8b848'], [1, '#7a5010']];

/** 놋쇠 톱니 스프라이트 (앞모습, 64 텍셀) — 틱톡 궤도 톱니 · 톱니 탄 · 아이콘 */
function gearSpr(gold = false) {
  return cached(gold ? 'gearG' : 'gear', () => {
    const c = mk(64, 64), x = c.getContext('2d');
    x.translate(32, 32);
    gearPath(x, 0, 0, 30, 12, 0.8);
    x.fillStyle = rad(x, -8, -8, 2, 34, gold ? GOLD : BRASS); x.fill();
    x.lineWidth = 2.2; x.strokeStyle = gold ? '#5a3a08' : '#3a2410'; x.stroke();
    x.beginPath(); x.arc(0, 0, 18, 0, TAU); x.strokeStyle = gold ? '#fff2b0' : '#f0d088'; x.lineWidth = 2.4; x.stroke();
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + 0.3; x.beginPath(); x.ellipse(Math.cos(a) * 11, Math.sin(a) * 11, 4.4, 3.2, a, 0, TAU); x.fill(); }
    x.beginPath(); x.arc(0, 0, 3.6, 0, TAU); x.fill();
    x.globalCompositeOperation = 'source-over';
    x.beginPath(); x.arc(0, 0, 6.5, 0, TAU); x.strokeStyle = gold ? '#7a5010' : '#4a3018'; x.lineWidth = 2; x.stroke();
    x.fillStyle = 'rgba(255,255,240,0.55)'; x.beginPath(); x.ellipse(-12, -14, 7, 3, -0.7, 0, TAU); x.fill();
    return c;
  });
}
/** 탄 꼬리 (가로 막대 빛: 오른쪽이 머리) */
function streakSpr(color) {
  return cached('streak' + color, () => {
    const c = mk(128, 32), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 16, 128, 16);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, color); g.addColorStop(1, '#ffffff');
    x.fillStyle = g;
    x.beginPath(); x.moveTo(0, 16); x.quadraticCurveTo(80, 6, 128, 10); x.lineTo(128, 22); x.quadraticCurveTo(80, 26, 0, 16); x.fill();
    return c;
  });
}

// ───────────────────────── 공통 자세 값 ─────────────────────────
const ST = { t: 0, at: 0, an: 'idle', f: 1, vxf: 0, vy: 0, q: 1, hiQ: true, aw: false, appear: 1, hurt: 0 };
function pre(ctx, g, world, opts) {
  const s = ST;
  s.t = g.t ?? 0; s.at = g.animT ?? 0; s.an = g.anim ?? 'idle';
  s.f = g.facing < 0 ? -1 : 1;
  s.vxf = (g.vx ?? 0) * s.f; s.vy = g.vy ?? 0;
  s.q = qOf(world); s.hiQ = s.q >= 0.95;
  s.aw = !!(opts?.awakened ?? g.d?.awakened);
  s.appear = s.an === 'appear' ? easeOut(clamp(s.at / 0.3, 0, 1)) : 1;
  s.hurt = s.an === 'hurt' ? 1 - clamp(s.at / 0.3, 0, 1) : 0;
  const hop = opts?.hop ?? (typeof g.hopY === 'function' ? g.hopY() : 0);
  ctx.translate(g.cx ?? 0, (g.bottom ?? 0) + hop);
  ctx.scale(s.f, 1);
  if (s.hurt > 0) ctx.translate(Math.sin(s.t * 70) * 1.2 * s.hurt, 0);
  return s;
}
/** 돌진 줄 (협공 처음 0.14초) */
function dashLines(ctx, at, color, y = -14) {
  if (at >= 0.16) return;
  const a = 1 - at / 0.16;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= 0.65 * a; ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) ctx.fillRect(-22 - i * 6, y - 5 + i * 3.4, 14 - i, 0.8);
  ctx.restore();
}

// ═════════════════════════ 틱톡 (태엽 인형) ═════════════════════════
// 금 간 도자기 머리 · 호박색 유리 눈 · 남색 빅토리아 드레스(금 자수, 레이스) · 놋쇠 관절 · 등의 금빛 태엽 열쇠 · 톱니 달린 남색 양산.
// 발 원점, 몸 중심 (0,-16). 양산 = 톱니 탄을 쏘는 포신 (끝의 톱니가 돈다).
const PORC = [[0, '#ffffff'], [0.55, '#ece6e0'], [1, '#a8a0a4']];
function clockParts() {
  return cached('clock', () => {
    const body = bake(-10, -33, 10, 1, (x) => {
      // 먼 팔 (옆으로 늘어뜨림)
      limb(x, [[-3.2, -19.2], [-4.6, -15.6], [-4.3, -12.6]], 1.25, '#cfc8c4');
      ball(x, -4.6, -15.6, 0.75, BRASS);
      ball(x, -4.3, -12.3, 0.9, [[0, '#ffffff'], [1, '#c8c0c0']]);
      // 다리 (도자기 · 놋쇠 무릎 · 검은 구두)
      limb(x, [[-1.4, -8.4], [-2.4, -4.8], [-3.2, -2]], 1.25, '#d0c8c4');
      limb(x, [[1.5, -8.4], [2.1, -4.8], [1.8, -2]], 1.4, '#f0ebe8');
      ball(x, -2.4, -4.8, 0.72, BRASS); ball(x, 2.1, -4.9, 0.8, BRASS);
      x.fillStyle = '#0e0a12'; x.strokeStyle = OUT; x.lineWidth = 0.25;
      for (const [sx, sy, r] of [[-3.1, -1.2, 1.2], [2.3, -1.2, 1.35]]) { x.beginPath(); x.ellipse(sx + 0.4, sy, r * 1.25, r * 0.7, 0.1, 0, TAU); x.fill(); x.stroke(); }
      x.strokeStyle = 'rgba(200,200,230,0.6)'; x.lineWidth = 0.2; x.beginPath(); x.moveTo(1.4, -1.8); x.lineTo(3.4, -1.7); x.moveTo(-3.9, -1.8); x.lineTo(-2.2, -1.7); x.stroke();
      // 레이스 속치마 (물결 밑단)
      x.fillStyle = '#f4f0ec'; x.strokeStyle = 'rgba(40,30,50,0.7)'; x.lineWidth = 0.25;
      x.beginPath(); x.moveTo(-7.8, -9.6);
      for (let i = 0; i <= 12; i++) { const px = -7.8 + i * 1.3; x.quadraticCurveTo(px + 0.65, -7.3 + (i % 2) * 0.4, px + 1.3, -9.2 + Math.abs(i - 6) * 0.04); }
      x.lineTo(7.6, -10.6); x.lineTo(-7.6, -10.6); x.closePath(); x.fill(); x.stroke();
      // 치마 (남색 종 모양)
      x.fillStyle = lin(x, -6, -17, 5, -8, [[0, '#3a4a8a'], [0.45, '#232c5c'], [1, '#10142e']]);
      x.beginPath(); x.moveTo(-2.9, -16.2); x.bezierCurveTo(-4.8, -14.5, -7.2, -11.8, -8.2, -9.4);
      x.quadraticCurveTo(-4.2, -8.4, 0, -8.8); x.quadraticCurveTo(4.4, -8.4, 8.1, -9.6);
      x.bezierCurveTo(7, -12, 4.8, -14.6, 3, -16.2); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
      // 금 자수 (소용돌이)
      x.strokeStyle = 'rgba(232,184,80,0.85)'; x.lineWidth = 0.28;
      x.beginPath();
      for (const [cx, cy, r] of [[-5.2, -10.6, 1.2], [-1.4, -10.2, 1.1], [2.6, -10.3, 1.15], [6, -10.8, 1], [-3.2, -13, 0.8], [1.2, -13.4, 0.8], [4.4, -13, 0.7]]) {
        x.moveTo(cx + r, cy); x.arc(cx, cy, r, 0, 4.2); x.moveTo(cx - r * 0.2, cy + r * 0.2); x.arc(cx - r * 0.1, cy, r * 0.45, 0, 3.6);
      }
      x.stroke();
      x.strokeStyle = 'rgba(232,184,80,0.9)'; x.lineWidth = 0.35;
      x.beginPath(); x.moveTo(-8, -9.5); x.quadraticCurveTo(-4.2, -8.5, 0, -8.9); x.quadraticCurveTo(4.4, -8.5, 8, -9.7); x.stroke();
      // 몸통 (코르셋 · 금 끈)
      x.fillStyle = lin(x, -3, -21, 3, -16, [[0, '#46569a'], [1, '#161c40']]);
      x.beginPath(); x.moveTo(-3.1, -20.6); x.lineTo(3.2, -20.6); x.lineTo(2.9, -16); x.lineTo(0.2, -15.2); x.lineTo(-2.9, -16); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      x.strokeStyle = '#e8b850'; x.lineWidth = 0.25;
      x.beginPath(); for (let i = 0; i < 4; i++) { const y = -19.6 + i * 1.05; x.moveTo(-0.6, y); x.lineTo(1.1, y + 0.55); x.moveTo(1.1, y); x.lineTo(-0.6, y + 0.55); } x.stroke();
      // 먼 쪽 부푼 소매
      x.fillStyle = lin(x, -5, -21, -2, -17, [[0, '#3c4c8c'], [1, '#141a3a']]);
      x.beginPath(); x.ellipse(-3.3, -19.1, 1.9, 1.7, 0.2, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.28; x.stroke();
      // 레이스 옷깃 (주름 러프)
      x.fillStyle = '#fbf8f4'; x.strokeStyle = 'rgba(40,30,50,0.75)'; x.lineWidth = 0.22;
      x.beginPath(); x.moveTo(-2.8, -20.6);
      for (let i = 0; i <= 8; i++) { const px = -2.8 + i * 0.75; x.quadraticCurveTo(px + 0.38, -19.2, px + 0.75, -20.5); }
      x.lineTo(3.2, -21.4); x.lineTo(-2.8, -21.4); x.closePath(); x.fill(); x.stroke();
      // 리본
      x.fillStyle = '#0e1024'; x.beginPath(); x.moveTo(0.3, -20.8); x.lineTo(-1.2, -21.6); x.lineTo(-1.1, -20); x.closePath(); x.moveTo(0.3, -20.8); x.lineTo(1.9, -21.6); x.lineTo(1.8, -20); x.closePath(); x.fill();
      // 목 (놋쇠 공 관절)
      ball(x, 0.5, -21.8, 0.9, BRASS);
      // 머리 (윤나는 도자기 구)
      x.fillStyle = rad(x, 2.2, -28.4, 0.6, 6.4, PORC);
      x.beginPath(); x.arc(0.6, -26.4, 5.7, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
      x.fillStyle = 'rgba(160,180,230,0.25)'; x.beginPath(); x.arc(-0.6, -25.4, 4.4, 1.2, 3.6); x.fill();   // 푸른 반사광 (뒤)
      // 금 (갈라진 선)
      x.strokeStyle = '#2a1a1a'; x.lineWidth = 0.32;
      x.beginPath(); x.moveTo(-2.9, -31); x.lineTo(-2, -29.8); x.lineTo(-2.4, -28.9); x.lineTo(-1.2, -28.1); x.lineTo(-1.5, -27.1); x.lineTo(-0.6, -26.2);
      x.moveTo(-2, -29.8); x.lineTo(-0.9, -30.3); x.moveTo(-1.2, -28.1); x.lineTo(-2.5, -27.6); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 0.15; x.beginPath(); x.moveTo(-2.7, -30.9); x.lineTo(-1.9, -29.9); x.lineTo(-2.2, -29); x.stroke();
      // 머리 옆 놋쇠 톱니
      gearPath(x, -3.9, -28.4, 1.75, 8, 0.72); x.fillStyle = rad(x, -4.3, -28.8, 0.2, 2, BRASS); x.fill(); x.strokeStyle = '#3a2410'; x.lineWidth = 0.2; x.stroke();
      x.fillStyle = '#3a2410'; x.beginPath(); x.arc(-3.9, -28.4, 0.4, 0, TAU); x.fill();
      // 볼 연지 · 입술
      x.fillStyle = 'rgba(255,120,130,0.4)'; x.beginPath(); x.ellipse(4.3, -24.2, 1.1, 0.7, 0, 0, TAU); x.ellipse(-0.9, -24.3, 0.8, 0.6, 0, 0, TAU); x.fill();
      x.fillStyle = '#b02030'; x.beginPath(); x.ellipse(2.5, -22.9, 0.55, 0.35, 0, 0, TAU); x.fill();
      // 눈 (호박색 유리, 긴 속눈썹)
      for (const [ex, sc] of [[-0.3, 0.8], [3.2, 1]]) {
        x.fillStyle = '#fffaf2'; x.beginPath(); x.ellipse(ex, -25.9, 1.25 * sc, 1.45 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = rad(x, ex, -25.6, 0.1, 1.3 * sc, [[0, '#ffe08a'], [0.5, '#e08a20'], [1, '#6a3008']]);
        x.beginPath(); x.ellipse(ex + 0.1, -25.8, 1.05 * sc, 1.2 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = '#1a0a04'; x.beginPath(); x.ellipse(ex + 0.15, -25.7, 0.42 * sc, 0.55 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = '#ffffff'; x.beginPath(); x.arc(ex - 0.3 * sc, -26.3, 0.32 * sc, 0, TAU); x.arc(ex + 0.4 * sc, -25.2, 0.15 * sc, 0, TAU); x.fill();
        x.strokeStyle = '#140a0a'; x.lineWidth = 0.42;
        x.beginPath(); x.arc(ex, -25.7, 1.35 * sc, 3.5, 5.95); x.stroke();
        x.lineWidth = 0.22; x.beginPath(); x.moveTo(ex + 1.2 * sc, -26.3); x.lineTo(ex + 1.9 * sc, -26.9); x.moveTo(ex + 0.8 * sc, -26.9); x.lineTo(ex + 1.2 * sc, -27.6); x.stroke();
      }
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.ellipse(2.4, -30, 1.5, 0.7, -0.3, 0, TAU); x.fill();   // 윤기
    });
    // 우산을 쥔 팔 (어깨 피벗, +x 방향)
    const arm = bake(-2.4, -2.4, 8.6, 2.2, (x) => {
      limb(x, [[0.4, 0.2], [3.2, 0.4], [6.2, 0.1]], 1.3, '#f0ebe8');
      ball(x, 3.3, 0.4, 0.8, BRASS);
      ball(x, 7, 0.1, 1.15, [[0, '#ffffff'], [1, '#d0c8c8']]);
      x.fillStyle = lin(x, -2, -2, 1.5, 2, [[0, '#4a5a9e'], [1, '#141a3a']]);
      x.beginPath(); x.ellipse(0.2, 0, 2.1, 1.9, 0, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      x.strokeStyle = 'rgba(232,184,80,0.8)'; x.lineWidth = 0.22; x.beginPath(); x.arc(0.2, 0, 1.5, -1, 1.2); x.stroke();
    });
    // 우산 (손잡이 원점 · 위가 -y) — 톱니 끝장식은 따로 돌린다
    const umb = bake(-9.5, -21, 9.5, 3.2, (x) => {
      // 갈고리 손잡이 · 대
      x.strokeStyle = OUT; x.lineWidth = 1.1; x.beginPath(); x.moveTo(0, -13); x.lineTo(0, 0.6); x.arc(-1.1, 0.6, 1.1, 0, Math.PI * 0.95); x.stroke();
      x.strokeStyle = lin(x, 0, -13, 0, 2, [[0, '#f0d088'], [1, '#8a5a20']]); x.lineWidth = 0.6; x.stroke();
      // 덮개 (남색 돔 · 살 · 금 끝)
      x.fillStyle = lin(x, -8, -18, 6, -12, [[0, '#4a5aa0'], [0.5, '#262e64'], [1, '#0e1230']]);
      x.beginPath(); x.moveTo(-8.6, -12.2);
      x.bezierCurveTo(-7.6, -17.4, -3.6, -19.4, 0, -19.4); x.bezierCurveTo(3.6, -19.4, 7.6, -17.4, 8.6, -12.2);
      for (let i = 6; i >= 0; i--) { const px = -8.6 + i * (17.2 / 6); x.quadraticCurveTo(px + 1.43, -13.8, px, -12.2); }
      x.closePath(); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
      x.strokeStyle = 'rgba(10,12,30,0.8)'; x.lineWidth = 0.28;
      x.beginPath(); for (let i = 0; i <= 6; i++) { const px = -8.6 + i * (17.2 / 6); x.moveTo(0, -19.2); x.quadraticCurveTo(px * 0.6, -17.6, px, -12.2); } x.stroke();
      x.strokeStyle = 'rgba(160,180,255,0.35)'; x.lineWidth = 0.35; x.beginPath(); x.moveTo(-6.8, -15.4); x.quadraticCurveTo(-4.4, -18.4, -0.6, -18.8); x.stroke();
      x.strokeStyle = 'rgba(232,184,80,0.7)'; x.lineWidth = 0.22;
      x.beginPath(); for (let i = 0; i < 5; i++) { const px = -6.6 + i * 3.3; x.moveTo(px - 0.8, -14); x.quadraticCurveTo(px, -14.8, px + 0.8, -14); } x.stroke();
      x.fillStyle = '#e8b850'; for (let i = 0; i <= 6; i++) { const px = -8.6 + i * (17.2 / 6); x.beginPath(); x.arc(px, -12.1, 0.42, 0, TAU); x.fill(); }
      // 꼭대기 창끝
      x.fillStyle = lin(x, 0, -21, 0, -19, BRASS.map(([k, c]) => [k, c]));
      x.beginPath(); x.moveTo(0, -20.9); x.lineTo(0.55, -19.3); x.lineTo(-0.55, -19.3); x.closePath(); x.fill();
    });
    // 태엽 열쇠: 대 (등 → 뒤쪽 -x) · 손잡이 (돌려 그림)
    const keyShaft = bake(-6, -1.4, 0.8, 1.4, (x) => {
      x.fillStyle = lin(x, 0, -1, 0, 1, [[0, '#fff0b0'], [0.5, '#d8a848'], [1, '#7a5010']]);
      x.beginPath(); x.rect(-5.6, -0.55, 6, 1.1); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.25; x.stroke();
      x.beginPath(); x.rect(-1.2, -1.05, 1.4, 2.1); x.fill(); x.stroke();
      x.beginPath(); x.rect(-4.2, -0.9, 0.9, 1.8); x.fill(); x.stroke();
    });
    const keyBow = bake(-3.4, -3.8, 0.4, 3.8, (x) => {
      x.fillStyle = rad(x, -1.6, -1, 0.2, 3.6, GOLD);
      x.strokeStyle = OUT; x.lineWidth = 0.3;
      for (const [cx, cy, r] of [[-1.5, -2, 1.45], [-1.5, 2, 1.45], [-2.3, 0, 1.2]]) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); x.stroke(); }
      x.globalCompositeOperation = 'destination-out';
      for (const [cx, cy, r] of [[-1.5, -2, 0.7], [-1.5, 2, 0.7], [-2.3, 0, 0.5]]) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = '#e8b850'; x.beginPath(); x.rect(-0.8, -0.7, 1.2, 1.4); x.fill(); x.stroke();
    });
    const keyBowDark = tinted(keyBow, 'rgba(60,36,8,1)', 0.55);
    return { body, arm, umb, keyShaft, keyBow, keyBowDark };
  });
}
/** 궤도 톱니 (뒤쪽 반/앞쪽 반을 몸 앞뒤로 나눠 그린다) */
function clockOrbit(ctx, t, n, R, cy, spin, gold, front, a = 1) {
  const s = gearSpr(gold);
  if (!s) return;
  for (let i = 0; i < n; i++) {
    const an = spin + (i / n) * TAU, z = Math.sin(an);
    if ((z > 0) !== front) continue;
    const x = Math.cos(an) * R, y = cy + z * R * 0.28, r = (1.6 + (i % 2) * 0.6) * (0.85 + 0.15 * z);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * (i % 2 ? -5 : 5)); ctx.globalAlpha *= a * (front ? 1 : 0.7);
    ctx.drawImage(s, -r, -r, r * 2, r * 2); ctx.restore();
  }
}
function drawClock(ctx, g, world, opts) {
  const P = clockParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const cast = an === 'skill', atk = an === 'attack', asst = an === 'assist', emote = an === 'emote';
  const bob = Math.sin(t * 2.6 + (g.seed ?? 0)) * 1.3;
  let tilt = clamp(s.vxf * 0.0008, -0.18, 0.28) - s.hurt * 0.3, dip = 0, turn = 1;
  if (cast) tilt = -0.08;
  if (emote) {   // 공손한 인사(0~0.4) → 한 바퀴 빙글
    if (at < 0.4) { const k = Math.sin((at / 0.4) * Math.PI); dip = k * 1.6; tilt += k * 0.18; }
    else turn = Math.cos(easeIO(clamp((at - 0.4) / 0.55, 0, 1)) * TAU) || 0.01;
  }
  const sc = 0.5 + 0.5 * s.appear;
  // 태엽 회전: 평소 천천히 · 스킬 0~0.35 는 거꾸로 빠르게 (시계판 바늘과 같은 구간) · 인사 때 빙글
  let spin = t * 3;
  if (cast) spin = at < 0.35 ? -at * 42 : -14.7 + (at - 0.35) * 9;
  else if (emote) spin = t * 3 + at * 24;
  // 빛 (몸 뒤)
  gGlow(ctx, 0, -17 + bob, cast ? 28 : 12, '#ffd070', (cast ? 0.6 : 0.2) + Math.sin(t * 3) * 0.04);
  ctx.translate(0, bob + dip);
  ctx.translate(0, -16); ctx.rotate(tilt); if (sc !== 1 || turn !== 1) ctx.scale(sc * turn, sc); ctx.translate(0, 16);
  // 궤도 톱니 (스킬: 넷 · 각성: 금빛 둘이 늘)
  const orbN = cast ? 4 : s.aw ? 2 : 0, orbA = cast ? clamp(at / 0.2, 0, 1) * (1 - clamp((at - 0.75) / 0.15, 0, 1)) : 1;
  const orbR = cast ? 12 + 2 * orbA : 10, orbSpin = t * (cast ? 5 : 1.6);
  if (orbN) clockOrbit(ctx, t, orbN, orbR, -17, orbSpin, s.aw, false, orbA);
  // 태엽 열쇠 (등 뒤, 손잡이는 축을 따라 돈다)
  const kx = -4.6, ky = -17.6;
  blit(ctx, P.keyShaft, kx, ky, 0);
  const cs = Math.cos(spin);
  blit(ctx, cs >= 0 ? P.keyBow : P.keyBowDark, kx - 5.5, ky, 0, 1, Math.max(0.12, Math.abs(cs)));
  // 몸
  blit(ctx, P.body, 0, 0);
  // 팔 + 우산: 평소 머리 위로 받쳐 든다
  let aa = -1.2 + Math.sin(t * 1.8) * 0.06, ua = 0.12 + Math.sin(t * 2.2) * 0.05, kick = 0;
  if (atk) {   // 양산을 앞으로 겨눔 → 0.08/0.16/0.24 발사 반동 → 되돌림
    const inK = easeOut(clamp(at / 0.08, 0, 1)), outK = clamp((at - 0.3) / 0.16, 0, 1);
    aa = lerp(lerp(-1.2, -0.12, inK), -1.2, easeIO(outK)); ua = lerp(lerp(0.12, 1.5, inK), 0.12, easeIO(outK));
    for (const ts of [0.08, 0.16, 0.24]) if (at >= ts) kick = Math.max(kick, 1 - (at - ts) / 0.06);
    kick = clamp(kick, 0, 1);
  } else if (asst) {   // 톱니 드릴: 앞으로 찌른다
    const k = easeOut(clamp(at / 0.12, 0, 1)), back = clamp((at - 0.3) / 0.2, 0, 1);
    aa = lerp(lerp(-1.2, -0.05, k), -1.2, back); ua = lerp(lerp(0.12, 1.57, k), 0.12, back);
    if (at > 0.12 && at < 0.26) kick = 1 - (at - 0.12) / 0.14;
  } else if (cast) {
    const k = easeOut(clamp(at / 0.2, 0, 1));
    aa = lerp(-1.2, -1.5, k); ua = lerp(0.12, -0.05, k) + Math.sin(t * 20) * 0.04 * k;
  } else if (emote) { aa = -1.3 + Math.sin(at * 9) * 0.15; }
  else if (s.hurt > 0) { aa = -0.9; ua = 0.5; }
  const shx = 2.7, shy = -19.4 - kick * 0.2;
  aa -= kick * 0.14; ua -= kick * 0.1;
  blit(ctx, P.arm, shx - kick * 0.6, shy, aa);
  const hx = shx - kick * 0.6 + Math.cos(aa) * 7, hy = shy + Math.sin(aa) * 7;
  blit(ctx, P.umb, hx, hy, ua);
  // 톱니 끝장식 (돌아간다 — 쏠 때·주문 때 빠르게)
  const tipX = hx + Math.sin(ua) * 19.6, tipY = hy - Math.cos(ua) * 19.6;
  const cogX = hx + Math.sin(ua) * 18.6, cogY = hy - Math.cos(ua) * 18.6;
  const gs = gearSpr(s.aw);
  const cogSpin = t * (atk || asst || cast ? 22 : 3);
  if (gs) { ctx.save(); ctx.translate(cogX, cogY); ctx.rotate(ua); ctx.scale(1, 0.55); ctx.rotate(cogSpin); ctx.drawImage(gs, -2.3, -2.3, 4.6, 4.6); ctx.restore(); }
  if (atk || asst || cast) gHalo(ctx, cogX, cogY, 9, 2.6, '#ffd070', (cast ? 0.55 : 0.4) + kick * 0.4, 0.6, ua);
  if (kick > 0) {   // 발사 섬광
    gGlow(ctx, tipX, tipY, 6 + kick * 7, '#ffe6a8', 0.9 * kick, 0.25);
    gStar(ctx, tipX, tipY, 3 + kick * 4, kick, t * 6);
  }
  if (orbN) clockOrbit(ctx, t, orbN, orbR, -17, orbSpin, s.aw, true, orbA);
  // 눈빛 · 주문 고리
  gGlow(ctx, 3.2, -25.8, 1.8, '#ffb040', 0.28 + (cast ? 0.4 : 0));
  if (cast) {
    const k = clamp(at / 0.25, 0, 1), fade = 1 - clamp((at - 0.7) / 0.2, 0, 1);
    gHalo(ctx, 0, -17, 12 + 5 * k, 4 + 1.5 * k, '#ffd070', 0.75 * fade, 0.7, -0.15);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; gStar(ctx, Math.cos(a) * (12 + 5 * k), -17 + Math.sin(a) * (4 + 1.5 * k), i % 3 ? 0.9 : 1.6, 0.8 * fade); }
  }
  if (s.aw) gGlow(ctx, kx - 7, ky, 3.5, '#ffe6a8', 0.35 + Math.sin(t * 4) * 0.1);
  if (asst) dashLines(ctx, at, '#ffd070', -17);
  return true;
}

// ═════════════════════════ 모르스 (꼬마 사신) ═════════════════════════
// 깊은 검은 두건 · 상아색 해골 얼굴(초록 눈불) · 너덜너덜한 검은 로브(아래는 연기) · 제 키만 한 큰 낫 · 초록 영혼 등불 · 떠다니는 장부.
// 발 원점(연기 끝). 손잡이(쥔 곳) (6,-18) 을 중심으로 낫을 돌린다: 0 = 곧게 세움, + = 앞으로 내리침.
const IVORY = [[0, '#fffaf0'], [0.55, '#e4dcc4'], [1, '#8a8068']];
const GRIP = [6.2, -18];
function reaperParts() {
  return cached('reaper', () => {
    const body = bake(-13, -40, 11, 1, (x) => {
      // 연기처럼 풀어지는 밑단 (너덜 조각)
      x.fillStyle = lin(x, 0, -14, 0, 0, [[0, '#1a1420'], [0.6, 'rgba(26,20,32,0.75)'], [1, 'rgba(26,20,32,0)']]);
      x.beginPath(); x.moveTo(-8.6, -12);
      const tips = [[-9.4, -4], [-7, -7.4], [-5.8, -0.6], [-3.4, -6], [-1.4, 0.4], [0.8, -5.2], [2.8, -1.6], [4.4, -6.4], [6.4, -3.6], [7.2, -9]];
      for (const [px, py] of tips) x.lineTo(px, py);
      x.lineTo(7.4, -12); x.closePath(); x.fill();
      // 로브 몸 (어깨→밑단으로 넓어짐)
      x.fillStyle = lin(x, -8, -26, 6, -8, [[0, '#3a3444'], [0.35, '#1c1824'], [1, '#08060a']]);
      x.beginPath(); x.moveTo(-3.8, -26); x.bezierCurveTo(-7.4, -22, -9.2, -16, -9.4, -10.6);
      x.lineTo(-7.8, -8.6); x.lineTo(-6.2, -10.4); x.lineTo(-4.4, -7.6); x.lineTo(-2.6, -9.8); x.lineTo(-0.4, -7); x.lineTo(1.6, -9.6); x.lineTo(3.8, -7.4); x.lineTo(5.2, -10.2); x.lineTo(7, -8.8);
      x.bezierCurveTo(7.4, -14, 6.6, -20, 4.6, -25.4); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
      x.strokeStyle = 'rgba(120,110,140,0.35)'; x.lineWidth = 0.3;   // 주름
      x.beginPath(); x.moveTo(-5, -22); x.quadraticCurveTo(-6.6, -16, -6.4, -11); x.moveTo(-1.4, -23); x.quadraticCurveTo(-2.2, -16, -1.6, -10); x.moveTo(2.8, -21); x.quadraticCurveTo(3.8, -15, 3.4, -10.4); x.stroke();
      x.strokeStyle = 'rgba(122,255,154,0.18)'; x.lineWidth = 0.4; x.beginPath(); x.moveTo(-8.8, -12); x.bezierCurveTo(-8.6, -17, -7, -22, -4.2, -25.6); x.stroke();   // 초록 테두리광
      // 소매 (쥔 곳을 향해 앞으로)
      x.fillStyle = lin(x, 0, -23, 6, -16, [[0, '#2a2432'], [1, '#0c0a10']]);
      x.beginPath(); x.moveTo(0.4, -23.4); x.quadraticCurveTo(4.6, -21.8, 6.2, -20.2); x.lineTo(7.2, -17.2); x.lineTo(5.6, -16.4); x.lineTo(4.6, -17.6); x.quadraticCurveTo(2, -18, -0.8, -19.6); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      // 두건 (둥근 두건 + 뒤로 처진 끝)
      x.fillStyle = lin(x, -6, -38, 5, -22, [[0, '#3a3446'], [0.5, '#1a1622'], [1, '#07050a']]);
      x.beginPath(); x.moveTo(-3.6, -25); x.bezierCurveTo(-8.6, -27, -9.4, -33, -7.2, -35.6);
      x.quadraticCurveTo(-9.8, -38, -11.8, -37.2); x.quadraticCurveTo(-9.2, -36.8, -8.4, -35.2);
      x.bezierCurveTo(-5.6, -39.4, 3.4, -39.2, 6.4, -33.4); x.bezierCurveTo(7.8, -30, 7.4, -26.4, 5.2, -24.4); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.4; x.stroke();
      // 두건 속 어둠
      x.fillStyle = '#030204';
      x.beginPath(); x.ellipse(2.3, -29.4, 5.1, 5.4, 0.1, 0, TAU); x.fill();
      // 해골 얼굴
      x.fillStyle = rad(x, 3.2, -30.6, 0.3, 5.2, IVORY);
      x.beginPath(); x.moveTo(-1.2, -30.6); x.bezierCurveTo(-1.2, -34.4, 6.4, -34.8, 6.6, -30.4); x.bezierCurveTo(6.8, -28, 5.6, -26.8, 5, -25.8);
      x.lineTo(1.2, -25.6); x.bezierCurveTo(0, -26.6, -1.2, -28.2, -1.2, -30.6); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(40,30,20,0.8)'; x.lineWidth = 0.28; x.stroke();
      // 눈구멍 · 코 · 이
      x.fillStyle = '#0a0806';
      x.beginPath(); x.ellipse(1.3, -30.1, 1.35, 1.55, -0.1, 0, TAU); x.ellipse(4.6, -30, 1.25, 1.5, 0.1, 0, TAU); x.fill();
      x.beginPath(); x.moveTo(3, -28.4); x.lineTo(3.5, -27.3); x.lineTo(2.5, -27.3); x.closePath(); x.fill();
      x.fillStyle = '#f0e8d4'; x.strokeStyle = 'rgba(20,14,10,0.9)'; x.lineWidth = 0.2;
      x.beginPath(); x.rect(1.4, -26.6, 3.4, 1.1); x.fill(); x.stroke();
      x.beginPath(); for (let i = 1; i < 5; i++) { x.moveTo(1.4 + i * 0.68, -26.6); x.lineTo(1.4 + i * 0.68, -25.5); } x.stroke();
      x.strokeStyle = 'rgba(255,255,240,0.6)'; x.lineWidth = 0.25; x.beginPath(); x.arc(3, -31.2, 3, 3.6, 4.6); x.stroke();
    });
    // 뼈 손 두 개 (쥔 곳 원점) — 낫 자루 위에 그린다
    const hands = bake(-2, -3.4, 2.4, 3.2, (x) => {
      for (const [cx, cy] of [[0, -1.7], [0.1, 1.5]]) {
        x.fillStyle = rad(x, cx - 0.5, cy - 0.5, 0.2, 1.7, IVORY);
        x.beginPath(); x.ellipse(cx, cy, 1.35, 1.15, 0, 0, TAU); x.fill(); x.strokeStyle = 'rgba(30,20,14,0.85)'; x.lineWidth = 0.22; x.stroke();
        x.beginPath(); for (let i = 0; i < 3; i++) { x.moveTo(cx + 0.9, cy - 0.7 + i * 0.6); x.lineTo(cx - 0.4, cy - 0.7 + i * 0.6); } x.stroke();
      }
    });
    // 낫 (쥔 곳 원점: 자루 +14 ~ -36, 끝에 날)
    const scythe = bake(-3, -44, 24, 16, (x) => {
      x.strokeStyle = OUT; x.lineWidth = 1.7; x.beginPath(); x.moveTo(0.4, 14.5); x.quadraticCurveTo(-0.8, -10, 0.2, -36.4); x.stroke();
      x.strokeStyle = lin(x, -1, 0, 1, 0, [[0, '#6a4a30'], [0.5, '#4a3020'], [1, '#22140c']]); x.lineWidth = 1.1; x.stroke();
      x.fillStyle = '#3a2416'; for (const ky of [-24, -6, 8]) { x.beginPath(); x.ellipse(-0.35 - ky * 0.004, ky, 0.9, 0.45, 0.3, 0, TAU); x.fill(); }
      x.strokeStyle = 'rgba(200,160,110,0.35)'; x.lineWidth = 0.25; x.beginPath(); x.moveTo(-0.2, 12); x.quadraticCurveTo(-1, -10, -0.1, -34); x.stroke();
      // 쇠 고리
      x.fillStyle = lin(x, 0, -38, 0, -34, [[0, '#d8dce4'], [1, '#4a4e58']]);
      x.beginPath(); x.rect(-1.3, -38.6, 2.8, 3.2); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      // 날 (앞으로 굽은 초승달)
      x.fillStyle = lin(x, 0, -44, 18, -30, [[0, '#f4f8ff'], [0.4, '#b8c0cc'], [1, '#4a505c']]);
      x.beginPath(); x.moveTo(-1.6, -38); x.bezierCurveTo(6, -44.6, 17.4, -41.4, 22.6, -29.6);
      x.bezierCurveTo(16.6, -36.2, 8.6, -37.4, 1.4, -35); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.35; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 0.35; x.beginPath(); x.moveTo(0, -38.6); x.bezierCurveTo(7, -43.8, 17, -40.6, 22.4, -29.8); x.stroke();
      x.strokeStyle = 'rgba(40,44,56,0.7)'; x.lineWidth = 0.25; x.beginPath(); x.moveTo(3, -37.4); x.bezierCurveTo(9, -39.8, 15, -38, 19.4, -32.6); x.stroke();
      x.fillStyle = '#2a2e38'; x.beginPath(); x.moveTo(10.6, -40.8); x.lineTo(11.4, -39.4); x.lineTo(12.2, -40.6); x.closePath(); x.fill();   // 이 빠진 자국
    });
    // 영혼 등불 (고리 원점, 아래로 매달림)
    const lantern = bake(-2.4, -0.8, 2.4, 6.8, (x) => {
      x.strokeStyle = '#3a3a40'; x.lineWidth = 0.4; x.beginPath(); x.arc(0, 0.3, 0.6, 0, TAU); x.stroke();
      x.fillStyle = '#2a2a30'; x.beginPath(); x.moveTo(-1.6, 1.8); x.lineTo(0, 0.9); x.lineTo(1.6, 1.8); x.closePath(); x.fill();
      x.fillStyle = rad(x, 0, 3.6, 0.2, 2.2, [[0, '#f0fff4'], [0.4, '#7aff9a'], [1, '#1a6a30']]);
      x.beginPath(); x.rect(-1.4, 1.8, 2.8, 3.6); x.fill(); x.strokeStyle = '#1a1a20'; x.lineWidth = 0.35; x.stroke();
      x.beginPath(); x.moveTo(0, 1.8); x.lineTo(0, 5.4); x.stroke();
      x.fillStyle = '#2a2a30'; x.beginPath(); x.rect(-1.7, 5.4, 3.4, 0.9); x.fill();
    });
    // 장부 (펼친 책, 중심 원점)
    const book = bake(-5, -3.2, 5, 3, (x) => {
      x.fillStyle = '#4a2a18'; x.beginPath(); x.moveTo(-4.8, -1.8); x.lineTo(0, -0.8); x.lineTo(4.8, -1.8); x.lineTo(4.6, 2.4); x.lineTo(0, 2.9); x.lineTo(-4.6, 2.4); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      for (const sx of [-1, 1]) {
        x.fillStyle = lin(x, 0, -2, sx * 4, 2, [[0, '#f4e4b8'], [1, '#c8b080']]);
        x.beginPath(); x.moveTo(0, -0.9); x.quadraticCurveTo(sx * 2.2, -2.6, sx * 4.3, -1.8); x.lineTo(sx * 4.1, 1.9); x.quadraticCurveTo(sx * 2.2, 1.2, 0, 2.3); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(80,50,30,0.8)'; x.lineWidth = 0.2; x.stroke();
        x.strokeStyle = 'rgba(60,40,30,0.55)'; x.lineWidth = 0.16;
        x.beginPath(); for (let i = 0; i < 4; i++) { const y = -1 + i * 0.75; x.moveTo(sx * 0.7, y); x.lineTo(sx * 3.6, y - 0.35); } x.stroke();
      }
      x.fillStyle = '#7a1a1a'; x.fillRect(-0.25, 0.4, 0.5, 2.6);
    });
    const scytheGhost = tinted(scythe, '#7aff9a', 1);
    return { body, hands, scythe, lantern, book, scytheGhost };
  });
}
/** 낫 휘두름 자세: 각(rad) · 쥔 곳 들기 */
function reaperPose(an, at, t) {
  let rot = -0.14 + Math.sin(t * 1.7) * 0.05, lift = 0, trail = 0;
  if (an === 'attack') {
    if (at < 0.08) rot = lerp(-0.14, -1.05, easeOut(at / 0.08));
    else if (at < 0.17) { const k = easeIO((at - 0.08) / 0.09); rot = lerp(-1.05, 2.25, k); trail = 1; }
    else rot = lerp(2.25, -0.14, easeIO(clamp((at - 0.17) / 0.28, 0, 1)));
  } else if (an === 'assist') {
    if (at < 0.12) rot = lerp(-0.14, -0.95, easeOut(at / 0.12));
    else if (at < 0.21) { rot = lerp(-0.95, 2.1, easeIO((at - 0.12) / 0.09)); trail = 1; }
    else rot = lerp(2.1, -0.14, easeIO(clamp((at - 0.21) / 0.3, 0, 1)));
  } else if (an === 'skill') {   // 0~0.18 높이 들고 → 0.18~0.54 크게 휘두름 (fxScytheSweep 과 같은 시각) → 되돌림
    if (at < 0.18) { const k = easeOut(at / 0.18); rot = lerp(-0.14, -1.55, k); lift = -3 * k; }
    else if (at < 0.54) { const k = easeIO((at - 0.18) / 0.36); rot = lerp(-1.55, 2.7, k); lift = lerp(-3, 1, k); trail = 1; }
    else { const k = clamp((at - 0.54) / 0.21, 0, 1); rot = lerp(2.7, -0.14, easeIO(k)); lift = lerp(1, 0, k); }
  } else if (an === 'emote') {   // 낫 돌리기
    const k = clamp((at - 0.15) / 0.6, 0, 1);
    rot = -0.14 + easeIO(k) * TAU;
  } else if (an === 'hurt') rot = 0.5;
  return { rot, lift, trail };
}
function drawReaper(ctx, g, world, opts) {
  const P = reaperParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const blink = an === 'blink', cast = an === 'skill', atkLike = an === 'attack' || an === 'assist' || cast;
  const bob = Math.sin(t * 2.1 + (g.seed ?? 0)) * 1.6;
  const tilt = clamp(s.vxf * 0.0007, -0.15, 0.22) - s.hurt * 0.3 + (cast && at > 0.18 && at < 0.54 ? 0.12 : 0);
  let sc = 0.4 + 0.6 * s.appear, a = 1, sy = 1;
  if (an === 'appear') { sy = s.appear; }
  if (blink) { const k = clamp(at / 0.1, 0, 1); a = 1 - k * 0.85; sy = 1 + k * 0.5; sc *= 1 - k * 0.3; }
  if (a < 1) ctx.globalAlpha *= a;
  const pose = reaperPose(an, at, t);
  // 등불 흔들림 (진자): 휘두를 때 크게
  const swing = Math.sin(t * 3.1) * 0.25 + (pose.trail ? -0.8 : 0);
  // 초록 기운 (몸 뒤)
  gGlow(ctx, 0, -20 + bob, cast ? 30 : 14, '#7aff9a', (cast ? 0.45 : 0.14) + (s.aw ? 0.08 : 0));
  // 장부 (한가할 때 곁에 떠 있다)
  const bookOn = !atkLike && !blink;
  if (bookOn) {
    const em = an === 'emote', bx = em ? lerp(-13, -6, clamp(at / 0.2, 0, 1)) : -13, by = -26 + Math.sin(t * 1.9 + 1) * 1.4 + bob * 0.5;
    const flap = Math.sin(t * (em ? 9 : 2.4)) * 0.12;
    blit(ctx, P.book, bx, by, -0.25 + flap, 1, 0.9 + flap * 0.5, 0.95);
    if (s.hiQ) gGlow(ctx, bx, by, 5, '#f4e4b8', 0.12);
  }
  ctx.translate(0, bob);
  ctx.translate(0, -18); ctx.rotate(tilt); if (sc !== 1 || sy !== 1) ctx.scale(sc, sc * sy); ctx.translate(0, 18);
  const gx = GRIP[0], gy = GRIP[1] + pose.lift;
  // 각성: 뒤에 유령 낫 하나 더
  if (s.aw && P.scytheGhost) blitAdd(ctx, P.scytheGhost, gx - 5, gy + 1, -pose.rot * 0.6 - 0.35, -1, 1, 0.28 + Math.sin(t * 3) * 0.06);
  blit(ctx, P.body, 0, 0);
  // 휘두름 잔상 (날 끝 궤적)
  if (pose.trail && s.q > 0.5) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#7aff9a'; ctx.lineCap = 'round';
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = 0.28 / i;
      ctx.lineWidth = 3.4 - i * 0.7;
      ctx.beginPath(); ctx.arc(gx, gy, 40, pose.rot - Math.PI / 2 - 0.2 * i - 0.8, pose.rot - Math.PI / 2 + 0.25); ctx.stroke();
    }
    ctx.restore();
  }
  blit(ctx, P.scythe, gx, gy, pose.rot);
  // 등불: 날 아래 자루에 매달림
  const c = Math.cos(pose.rot), sn = Math.sin(pose.rot);
  const lx = gx + (0.6 * c + 32.5 * sn), ly = gy + (0.6 * sn - 32.5 * c);
  blit(ctx, P.lantern, lx, ly, swing - pose.rot * 0.2);
  const lgx = lx + Math.sin(-(swing - pose.rot * 0.2)) * 3.6, lgy = ly + Math.cos(swing - pose.rot * 0.2) * 3.6;
  gGlow(ctx, lgx, lgy, (cast ? 9 : 6) + Math.sin(t * 7) * 0.6, '#7aff9a', 0.6, 0.3);
  blit(ctx, P.hands, gx, gy, 0);
  // 눈불
  const ef = cast ? 1 + clamp(at / 0.18, 0, 1) : an === 'attack' || an === 'assist' ? 1.4 : 1;
  gGlow(ctx, 1.3, -30.1, 1.6 * ef, '#7aff9a', 0.9, 0.2); gGlow(ctx, 4.6, -30, 1.5 * ef, '#7aff9a', 0.9, 0.2);
  gGlow(ctx, 1.3, -30.1, 0.6, '#f0fff4', 1, 0.2); gGlow(ctx, 4.6, -30, 0.55, '#f0fff4', 1, 0.2);
  if (blink && s.q > 0.5) {   // 흩어지는 연기
    const k = clamp(at / 0.1, 0, 1);
    for (let i = 0; i < 5; i++) gGlow(ctx, -4 + i * 2.4 - k * 6, -8 - i * 5 - k * 4, 4 + k * 4, '#1a3a24', 0.5 * (1 - k * 0.5));
  }
  if (an === 'assist') dashLines(ctx, at, '#7aff9a', -20);
  return true;
}

// ═════════════════════════ 미라 (거울 요정) ═════════════════════════
// 긴 은발 · 뾰족 귀 · 얼음빛 눈 · 뺨의 유리 금 · 진줏빛 흰 드레스 · 수정 조각 날개 · 은 손거울 · 주위를 도는 거울 조각.
// 발 원점, 몸 중심 (0,-15).
const SKIN_M = [[0, '#fff6f2'], [0.6, '#f0dcd6'], [1, '#b8a0a4']];
function mirraParts() {
  return cached('mirra', () => {
    const hair = bake(-13, -4, 5, 23, (x) => {
      // 뒤로 흘러내리는 긴 머리 — 정수리 (0,-26) 가 원점 (그 둘레로 흔든다)
      x.translate(0, 26);
      x.fillStyle = lin(x, 0, -28, -10, -6, [[0, '#ffffff'], [0.5, '#d8dcf0'], [1, '#9aa0c0']]);
      x.beginPath(); x.moveTo(3.6, -27.6); x.bezierCurveTo(1, -30, -5, -29, -6.2, -24);
      x.bezierCurveTo(-8, -18, -11.8, -14, -12.4, -8.4); x.bezierCurveTo(-10.4, -9.6, -9.6, -7, -8.2, -4.2);
      x.bezierCurveTo(-7.4, -8, -6, -9.4, -4.6, -12); x.bezierCurveTo(-3.4, -8.6, -2.6, -7.6, -1.6, -6.4);
      x.bezierCurveTo(-2.2, -11, -1.8, -16, -1.4, -19); x.bezierCurveTo(0.6, -21, 2.6, -23.4, 3.6, -27.6); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 0.22;
      x.beginPath(); x.moveTo(-3.8, -26); x.bezierCurveTo(-7, -20, -9.4, -14, -11, -9.4); x.moveTo(-2.4, -24); x.bezierCurveTo(-5, -18, -6, -13, -5.2, -9); x.moveTo(-1, -22); x.bezierCurveTo(-2.4, -17, -2.6, -12, -2.2, -8); x.stroke();
      x.strokeStyle = 'rgba(120,130,180,0.5)'; x.beginPath(); x.moveTo(-5.4, -23); x.bezierCurveTo(-8, -17, -10.4, -12.6, -10.6, -8.8); x.stroke();
    });
    const body = bake(-8, -30, 8, 1, (x) => {
      // 다리 (맨발, 발끝을 아래로)
      limb(x, [[-1, -11], [-1.9, -6], [-2.6, -2.2]], 1.2, '#dcc4c0');
      limb(x, [[1.1, -11], [1.4, -5.6], [1.9, -1.4]], 1.35, '#f4e4e0');
      x.fillStyle = '#f4e4e0'; x.beginPath(); x.ellipse(2.1, -0.8, 0.7, 1, 0.3, 0, TAU); x.fill();
      x.fillStyle = '#dcc4c0'; x.beginPath(); x.ellipse(-2.8, -1.6, 0.6, 0.9, 0.3, 0, TAU); x.fill();
      // 먼 팔
      limb(x, [[-2.1, -19.4], [-3.2, -16], [-3.6, -13.2]], 0.95, '#dcc4c0');
      // 치마 (진줏빛 흰 드레스, 뾰족한 물결 밑단)
      x.fillStyle = lin(x, -5, -17, 5, -10, [[0, '#ffffff'], [0.5, '#e0e8f4'], [1, '#98a8c4']]);
      x.beginPath(); x.moveTo(-2.4, -16.4); x.bezierCurveTo(-4.2, -14.4, -5.6, -12.6, -6.2, -10.4);
      for (let i = 0; i <= 6; i++) { const px = -6.2 + i * 1.95; x.lineTo(px + 0.97, -9.2 + (i % 2) * 0.3); x.lineTo(px + 1.95, -10.6); }
      x.bezierCurveTo(5, -12.8, 3.8, -14.6, 2.4, -16.4); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      x.strokeStyle = 'rgba(180,220,255,0.6)'; x.lineWidth = 0.25;
      x.beginPath(); x.moveTo(-1, -15.8); x.quadraticCurveTo(-2.6, -13, -3.4, -10.2); x.moveTo(1.6, -15.8); x.quadraticCurveTo(2.6, -13, 3.2, -10.4); x.stroke();
      x.fillStyle = 'rgba(255,180,240,0.22)'; x.beginPath(); x.ellipse(1.4, -12.6, 2, 1.2, 0.3, 0, TAU); x.fill();
      x.fillStyle = 'rgba(160,230,255,0.25)'; x.beginPath(); x.ellipse(-2.6, -11.6, 1.6, 0.9, -0.3, 0, TAU); x.fill();
      // 몸통 · 부푼 소매
      x.fillStyle = lin(x, -2, -21, 2, -16, [[0, '#ffffff'], [1, '#c8d4e8']]);
      x.beginPath(); x.moveTo(-2.3, -20.6); x.lineTo(2.4, -20.6); x.lineTo(2.2, -16.2); x.lineTo(-2.2, -16.2); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.28; x.stroke();
      x.fillStyle = lin(x, -4, -21, -1, -18, [[0, '#ffffff'], [1, '#b8c4dc']]);
      x.beginPath(); x.ellipse(-2.4, -19.6, 1.6, 1.4, 0.3, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = '#b8d0f0'; x.beginPath(); x.arc(0, -19.4, 0.5, 0, TAU); x.fill();   // 가슴의 수정 장식
      // 목 · 얼굴
      x.fillStyle = '#f0dcd6'; x.fillRect(-0.4, -22, 1.2, 1.6);
      x.fillStyle = rad(x, 2, -25.4, 0.4, 4.4, SKIN_M);
      x.beginPath(); x.ellipse(1.1, -24.6, 3.3, 3.6, 0, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.28; x.stroke();
      // 뾰족 귀
      x.fillStyle = '#ecd2cc'; x.beginPath(); x.moveTo(-1.4, -25); x.lineTo(-4.6, -27.2); x.lineTo(-1.2, -23.6); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = 'rgba(255,140,150,0.4)'; x.beginPath(); x.moveTo(-1.6, -24.8); x.lineTo(-3.8, -26.6); x.lineTo(-1.5, -24); x.closePath(); x.fill();
      // 큰 얼음빛 눈
      for (const [ex, sc] of [[0.2, 0.78], [2.8, 1]]) {
        x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(ex, -24.6, 0.8 * sc, 1.05 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = rad(x, ex, -24.4, 0.1, 1 * sc, [[0, '#f0ffff'], [0.45, '#8ad8ff'], [1, '#2a6aa8']]);
        x.beginPath(); x.ellipse(ex + 0.08, -24.5, 0.66 * sc, 0.88 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = '#1a2a48'; x.beginPath(); x.ellipse(ex + 0.1, -24.4, 0.26 * sc, 0.45 * sc, 0, 0, TAU); x.fill();
        x.fillStyle = '#ffffff'; x.beginPath(); x.arc(ex - 0.2 * sc, -25, 0.24 * sc, 0, TAU); x.fill();
        x.strokeStyle = '#3a3a5a'; x.lineWidth = 0.32; x.beginPath(); x.arc(ex, -24.4, 0.95 * sc, 3.6, 5.9); x.stroke();
      }
      x.fillStyle = 'rgba(255,150,170,0.35)'; x.beginPath(); x.ellipse(3.4, -23.2, 0.9, 0.5, 0, 0, TAU); x.fill();
      x.strokeStyle = '#7a4a5a'; x.lineWidth = 0.22; x.beginPath(); x.arc(2.4, -22.6, 0.45, 0.3, 2.6); x.stroke();
      // 뺨의 유리 금 (반짝)
      x.strokeStyle = '#4a6a9a'; x.lineWidth = 0.22;
      x.beginPath(); x.moveTo(3.9, -24.2); x.lineTo(4.2, -23.4); x.lineTo(3.7, -22.8); x.lineTo(4, -22.1); x.moveTo(4.2, -23.4); x.lineTo(4.4, -23.1); x.stroke();
      x.strokeStyle = 'rgba(220,245,255,0.9)'; x.lineWidth = 0.12; x.beginPath(); x.moveTo(3.95, -24.1); x.lineTo(4.15, -23.5); x.stroke();
      // 앞머리 · 정수리
      x.fillStyle = lin(x, 0, -29, 0, -22, [[0, '#ffffff'], [1, '#c8d0e8']]);
      x.beginPath(); x.moveTo(-2.2, -24.6); x.bezierCurveTo(-2.6, -28.6, 2, -29.6, 4.4, -26.4); x.bezierCurveTo(4.6, -25.2, 4.2, -24.4, 3.8, -24);
      x.quadraticCurveTo(3.2, -25.6, 2.2, -25.4); x.quadraticCurveTo(1.6, -24.6, 0.8, -25.4); x.quadraticCurveTo(0, -24.2, -0.8, -25.2); x.quadraticCurveTo(-1.4, -24.6, -2.2, -24.6); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.26; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 0.2; x.beginPath(); x.moveTo(-1.2, -27.4); x.quadraticCurveTo(1, -28.8, 3.2, -27.4); x.stroke();
    });
    // 거울을 든 팔 (어깨 원점, +x) — 손 (6.2, 0.2), 거울 중심 (8.2,-3.4)
    const arm = bake(-1.2, -7.6, 11.6, 1.8, (x) => {
      limb(x, [[0, 0], [3, 0.4], [5.8, 0.1]], 0.95, '#f4e4e0');
      x.fillStyle = lin(x, -1, -1, 1, 1, [[0, '#ffffff'], [1, '#b8c4dc']]); x.beginPath(); x.ellipse(0.1, 0, 1.3, 1.2, 0, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.25; x.stroke();
      // 손잡이
      x.strokeStyle = OUT; x.lineWidth = 0.9; x.beginPath(); x.moveTo(6.3, 0.8); x.lineTo(7.7, -1.1); x.stroke();
      x.strokeStyle = '#d8dce8'; x.lineWidth = 0.5; x.stroke();
      x.fillStyle = '#f0e0dc'; x.beginPath(); x.ellipse(6.4, 0.2, 0.8, 0.7, 0, 0, TAU); x.fill();
      // 은테 · 유리
      x.fillStyle = lin(x, 6, -6, 10, -1, [[0, '#ffffff'], [0.5, '#c0c8d8'], [1, '#6a7288']]);
      x.beginPath(); x.ellipse(8.4, -3.6, 2.5, 3.3, 0.35, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      x.fillStyle = rad(x, 8, -4.2, 0.2, 3, [[0, '#ffffff'], [0.35, '#d8f4ff'], [1, '#5a8ac0']]);
      x.beginPath(); x.ellipse(8.4, -3.6, 1.9, 2.65, 0.35, 0, TAU); x.fill();
      x.fillStyle = '#e8ecf4'; for (const [dx, dy] of [[-0.9, -3], [1.6, -2.4], [0.4, 3.1], [-2.2, 0.6]]) { x.beginPath(); x.arc(8.4 + dx, -3.6 + dy, 0.45, 0, TAU); x.fill(); }
      x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 0.35; x.beginPath(); x.moveTo(7.3, -5); x.lineTo(8.1, -5.7); x.moveTo(7.4, -4.1); x.lineTo(9, -5.3); x.stroke();
    });
    // 수정 날개 (뿌리 원점, +x 로 펼침 · 위로 비스듬)
    const wing = bake(-0.8, -9.4, 12, 3, (x) => {
      const shard = (pts, c0, c1) => {
        x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]); x.closePath();
        x.fillStyle = lin(x, 0, 0, 11, -7, [[0, c0], [1, c1]]); x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 0.25; x.stroke();
      };
      shard([[0, 0], [4, -3.2], [11.4, -8.8], [6.6, -1.6]], 'rgba(220,240,255,0.75)', 'rgba(160,210,255,0.45)');
      shard([[0.2, 0.4], [6.4, -0.6], [10.6, -2.2], [5.4, 1.6]], 'rgba(230,245,255,0.7)', 'rgba(200,170,255,0.4)');
      shard([[0.2, 0.8], [4.4, 1.8], [7.4, 2.6], [3.2, 2.6]], 'rgba(235,248,255,0.65)', 'rgba(170,230,255,0.35)');
      x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 0.18;
      x.beginPath(); x.moveTo(1, -0.4); x.lineTo(9.6, -7.4); x.moveTo(1.2, 0.5); x.lineTo(9.4, -1.8); x.stroke();
    });
    // 거울 조각 (중심 원점, 위가 끝)
    const shard = bake(-1.8, -4.4, 1.8, 3.4, (x) => {
      x.beginPath(); x.moveTo(0, -4.2); x.lineTo(1.5, -0.4); x.lineTo(0.4, 3.2); x.lineTo(-1.4, 0.6); x.closePath();
      x.fillStyle = lin(x, -1.4, -4, 1.4, 3, [[0, '#ffffff'], [0.4, '#c8ecff'], [1, '#5a7ab0']]); x.fill();
      x.strokeStyle = 'rgba(40,60,100,0.85)'; x.lineWidth = 0.22; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 0.2; x.beginPath(); x.moveTo(0, -3.8); x.lineTo(-0.9, 0.5); x.stroke();
    });
    const wingFar = tinted(wing, 'rgba(90,110,160,1)', 0.35);
    return { hair, body, arm, wing, wingFar, shard };
  });
}
/** 주위를 도는 거울 조각 (앞/뒤) */
function mirraShards(ctx, P, t, n, R, cy, spd, front, a = 1) {
  for (let i = 0; i < n; i++) {
    const an = t * spd + (i / n) * TAU, z = Math.sin(an);
    if ((z > 0) !== front) continue;
    const x = Math.cos(an) * R, y = cy + z * R * 0.3 + Math.sin(t * 2 + i) * 1.2, sc = 0.7 + 0.2 * z;
    blit(ctx, P.shard, x, y, Math.sin(t * 1.3 + i * 2) * 0.6, sc, sc, a * (front ? 1 : 0.6));
    if (front && ((t * 1.6 + i * 0.37) % 1) < 0.14) gStar(ctx, x, y - 2, 1.8, 0.9, t * 3);
  }
}
function drawMirra(ctx, g, world, opts) {
  const P = mirraParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const cast = an === 'skill', atk = an === 'attack', asst = an === 'assist', emote = an === 'emote';
  const bob = Math.sin(t * 2.4 + (g.seed ?? 0)) * 1.4;
  let tilt = clamp(s.vxf * 0.0008, -0.16, 0.28) - s.hurt * 0.3;
  if (cast) tilt = -0.14;
  const sc = 0.5 + 0.5 * s.appear;
  let turn = 1;
  if (emote && at < 0.7) turn = Math.cos(easeIO(clamp(at / 0.7, 0, 1)) * TAU) || 0.01;
  // 빛
  gGlow(ctx, 0, -16 + bob, cast ? 26 : 12, '#dff4ff', (cast ? 0.55 : 0.2) + Math.sin(t * 3.4) * 0.05);
  ctx.translate(0, bob);
  ctx.translate(0, -15); ctx.rotate(tilt); if (sc !== 1 || turn !== 1) ctx.scale(sc * turn, sc); ctx.translate(0, 15);
  const nSh = cast ? 6 : 3, rSh = cast ? 13 + 3 * clamp(at / 0.3, 0, 1) : 11, spSh = cast ? 4.2 : 1.4;
  mirraShards(ctx, P, t, nSh, rSh, -15, spSh, false);
  // 날개 (등 뒤: 먼 쪽 어둡게, 반짝이며 떨림)
  const wv = Math.sin(t * 5.2) * 0.08 - (cast ? 0.2 : 0) - clamp(s.vxf * 0.0004, 0, 0.2);
  blit(ctx, P.wingFar, -1.6, -19, -0.35 + wv, -0.85, 0.85);
  // 머리칼 (움직일수록 뒤로 날림)
  const hs = Math.sin(t * 2.2) * 0.05 + clamp(s.vxf * 0.00025, 0, 0.12) + (emote ? Math.sin(at * 12) * 0.08 : 0);
  blit(ctx, P.hair, 0, -26, hs);
  blit(ctx, P.wing, -1.2, -19.4, -0.25 + wv, -1, 1, 0.95);
  if (s.hiQ) blitAdd(ctx, P.wing, -1.2, -19.4, -0.25 + wv, -1, 1, 0.18 + Math.sin(t * 6) * 0.08);
  blit(ctx, P.body, 0, 0);
  // 거울 팔
  let aa = -0.75 + Math.sin(t * 1.9) * 0.07;
  if (atk) aa = at < 0.08 ? lerp(-0.75, 0.05, easeOut(at / 0.08)) : lerp(0.05, -0.75, clamp((at - 0.12) / 0.18, 0, 1));
  else if (asst) aa = at < 0.12 ? lerp(-0.75, -0.2, at / 0.12) : lerp(0.05, -0.75, clamp((at - 0.16) / 0.2, 0, 1));
  else if (cast) aa = lerp(-0.75, -1.75, easeOut(clamp(at / 0.22, 0, 1)));
  else if (emote) aa = at < 0.7 ? -1 : lerp(-1, -2.1, easeOut(clamp((at - 0.7) / 0.15, 0, 1)));   // 빙글 돈 뒤 거울을 들여다본다
  else if (s.hurt > 0) aa = -0.2;
  const shx = 1.9, shy = -19.4;
  blit(ctx, P.arm, shx, shy, aa);
  const c = Math.cos(aa), sn = Math.sin(aa), mx = shx + c * 8.4 + 3.6 * sn, my = shy + sn * 8.4 - 3.6 * c;
  mirraShards(ctx, P, t, nSh, rSh, -15, spSh, true);
  // 거울 번쩍
  const fl = atk ? clamp(1 - Math.abs(at - 0.08) / 0.1, 0, 1) : asst ? clamp(1 - Math.abs(at - 0.14) / 0.1, 0, 1) : cast ? clamp(at / 0.25, 0, 1) : 0;
  const glint = ((t * 0.45) % 1) < 0.08 ? 0.7 : 0;
  gGlow(ctx, mx, my, 4 + fl * 9, '#dff4ff', 0.35 + fl * 0.6, 0.25);
  if (fl > 0.05 || glint) gStar(ctx, mx, my, 2.5 + fl * 6, Math.max(fl, glint), t * 2);
  if (cast) {
    const k = clamp(at / 0.3, 0, 1), fade = 1 - clamp((at - 1) / 0.25, 0, 1);
    gHalo(ctx, mx, my, 5 + 5 * k, 5 + 5 * k, '#dff4ff', 0.7 * fade, 0.6);
    gHalo(ctx, 0, -15, 15 + 3 * k, 5, '#dff4ff', 0.5 * fade, 0.6, t * 0.5);
  }
  // 각성: 머리 위 거울 조각 관
  if (s.aw) {
    for (let i = 0; i < 5; i++) {
      const a2 = t * 0.9 + i * TAU / 5, x = 1 + Math.cos(a2) * 4.2, y = -30.2 + Math.sin(a2) * 1.1;
      blit(ctx, P.shard, x, y, 0, 0.42, 0.42, Math.sin(a2) > 0 ? 1 : 0.55);
    }
    gGlow(ctx, 1, -30.2, 6, '#dff4ff', 0.3);
  }
  gGlow(ctx, 2.8, -24.6, 1.3, '#8ad8ff', 0.3);
  if (asst) dashLines(ctx, at, '#dff4ff', -15);
  return true;
}

// ═════════════════════════ 루멘 (등불 해파리) ═════════════════════════
// 청록·진주빛 반투명 갓 · 갓 속에 매달린 놋쇠 등불(금빛 불꽃) · 주름진 구완 · 분홍 끝의 가는 촉수. 발 원점 (촉수 끝), 갓 테두리 (0,-20).
const RIM_Y = -20;
function lumenParts() {
  return cached('lumen', () => {
    // 갓 (테두리 중심 원점, 위가 -y)
    const bell = bake(-10.4, -12, 10.4, 2.6, (x) => {
      x.fillStyle = rad(x, 0, -6, 1, 11, [[0, 'rgba(255,240,200,0.9)'], [0.45, 'rgba(160,240,255,0.7)'], [0.85, 'rgba(90,200,240,0.55)'], [1, 'rgba(60,160,220,0.45)']], 0, -3);
      x.beginPath(); x.moveTo(-9.6, 0); x.bezierCurveTo(-10, -7, -5.6, -11.2, 0, -11.2); x.bezierCurveTo(5.6, -11.2, 10, -7, 9.6, 0);
      x.quadraticCurveTo(0, 1.6, -9.6, 0); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(220,250,255,0.85)'; x.lineWidth = 0.35; x.stroke();
      // 갈빗살
      x.strokeStyle = 'rgba(230,255,255,0.45)'; x.lineWidth = 0.28;
      x.beginPath(); for (let i = -3; i <= 3; i++) { x.moveTo(i * 1.2, -10.6); x.quadraticCurveTo(i * 2.6, -6, i * 3.1, -0.4); } x.stroke();
      // 윗부분 반사광
      x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.ellipse(-3.2, -8.4, 3, 1.3, -0.35, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.ellipse(4.4, -7, 1.4, 0.7, 0.4, 0, TAU); x.fill();
      // 발광 반점
      for (let i = 0; i < 14; i++) { const a = hsh(i) * Math.PI, r = 3 + hsh(i + 9) * 6.5; x.fillStyle = i % 3 ? 'rgba(200,255,255,0.8)' : 'rgba(255,190,240,0.8)'; x.beginPath(); x.arc(Math.cos(a) * r, -Math.sin(a) * r * 0.9 - 0.8, 0.22 + hsh(i + 3) * 0.2, 0, TAU); x.fill(); }
      // 주름진 가장자리 (분홍빛)
      x.fillStyle = 'rgba(255,190,235,0.7)'; x.strokeStyle = 'rgba(255,230,250,0.9)'; x.lineWidth = 0.2;
      x.beginPath(); x.moveTo(-9.8, -0.4);
      for (let i = 0; i < 12; i++) { const px = -9.8 + i * (19.6 / 12); x.quadraticCurveTo(px + 0.8, 2.4 + (i % 2) * 0.3, px + 19.6 / 12, -0.2); }
      x.quadraticCurveTo(0, 1, -9.8, -0.4); x.closePath(); x.fill(); x.stroke();
    });
    // 놋쇠 등불 (고리 원점)
    const lamp = bake(-2.2, -0.8, 2.2, 6.4, (x) => {
      x.strokeStyle = '#4a3010'; x.lineWidth = 0.35; x.beginPath(); x.arc(0, 0.3, 0.55, 0, TAU); x.stroke();
      x.fillStyle = lin(x, -1.6, 0, 1.6, 0, [[0, '#f0c870'], [0.5, '#a07030'], [1, '#4a3010']]);
      x.beginPath(); x.moveTo(-1.7, 1.9); x.quadraticCurveTo(0, 0.6, 1.7, 1.9); x.closePath(); x.fill();
      x.fillStyle = rad(x, 0, 3.5, 0.2, 2, [[0, '#fffbe0'], [0.45, '#ffd070'], [1, '#c07020']]);
      x.beginPath(); x.rect(-1.3, 1.9, 2.6, 3.2); x.fill(); x.strokeStyle = '#3a2408'; x.lineWidth = 0.32; x.stroke();
      x.beginPath(); x.moveTo(-0.45, 1.9); x.lineTo(-0.45, 5.1); x.moveTo(0.45, 1.9); x.lineTo(0.45, 5.1); x.stroke();
      x.fillStyle = '#6a4418'; x.beginPath(); x.rect(-1.6, 5.1, 3.2, 0.8); x.fill();
    });
    // 주름 구완 (위 끝 원점, 아래로 늘어짐)
    const oral = bake(-2.4, -0.4, 2.4, 13.6, (x) => {
      x.fillStyle = lin(x, 0, 0, 0, 13, [[0, 'rgba(255,240,220,0.8)'], [0.5, 'rgba(150,230,255,0.65)'], [1, 'rgba(255,170,230,0.55)']]);
      x.beginPath(); x.moveTo(-1, 0);
      for (let i = 0; i <= 8; i++) { const y = i * 1.6; x.quadraticCurveTo(-2.3 - (i % 2) * 0.4, y + 0.8, -1.2 + Math.sin(i) * 0.4, y + 1.6); }
      x.lineTo(0.4, 13.4);
      for (let i = 8; i >= 0; i--) { const y = i * 1.6; x.quadraticCurveTo(2.2 + (i % 2) * 0.4, y + 0.8, 1 + Math.sin(i + 1) * 0.4, y); }
      x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,210,245,0.85)'; x.lineWidth = 0.2; x.stroke();
    });
    return { bell, lamp, oral };
  });
}
/** 촉수 (그때그때 선으로 — 꼬리처럼 흐른다). lash = 0..1 앞으로 채찍질 */
function lumenTentacles(ctx, t, pulse, lean, lash, q, zap) {
  const n = q >= 0.95 ? 6 : 4;
  ctx.save();
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
    ctx.strokeStyle = pass === 0 ? 'rgba(90,210,240,0.5)' : 'rgba(210,255,255,0.8)';
    ctx.lineWidth = pass === 0 ? 1.1 : 0.4;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x0 = -6 + (12 * i) / (n - 1), len = 17 + hsh(i) * 5 - pulse * 2;
      ctx.moveTo(x0, RIM_Y + 0.8);
      for (let k = 1; k <= 5; k++) {
        const u = k / 5, w = Math.sin(t * 3.2 - u * 4 + i * 1.3) * (1.2 + u * 1.8);
        const dx = w - lean * u * u * 8 + lash * u * u * 14, dy = u * len * (1 - lash * 0.35);
        ctx.lineTo(x0 * (1 - u * 0.3) + dx, RIM_Y + 0.8 + dy);
      }
    }
    ctx.stroke();
  }
  // 분홍 끝 · 번개
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x0 = -6 + (12 * i) / (n - 1), len = 17 + hsh(i) * 5 - pulse * 2;
    const w = Math.sin(t * 3.2 - 4 + i * 1.3) * 3, x = x0 * 0.7 + w - lean * 8 + lash * 14, y = RIM_Y + 0.8 + len * (1 - lash * 0.35);
    gGlow(ctx, x, y, 1.6, '#ff9ae8', 0.7, 0.3);
    if (zap > 0 && i % 2 === 0) {
      ctx.strokeStyle = '#e0fbff'; ctx.lineWidth = 0.5; ctx.globalAlpha = zap;
      ctx.beginPath(); ctx.moveTo(x0, RIM_Y + 2);
      for (let k = 1; k <= 4; k++) ctx.lineTo(lerp(x0, x, k / 4) + (hsh(i * 7 + k + Math.floor(t * 30)) - 0.5) * 3, lerp(RIM_Y + 2, y, k / 4));
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
function drawLumen(ctx, g, world, opts) {
  const P = lumenParts();
  if (!P?.bell) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const cast = an === 'skill', atk = an === 'attack', asst = an === 'assist', emote = an === 'emote';
  // 헤엄 박동: 수축(0~0.3) → 이완
  const per = Math.abs(s.vxf) > 60 ? 0.85 : 1.4;
  const ph = ((t + (g.seed ?? 0)) / per) % 1;
  let pulse = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI * 0.5) : 1 - easeOut((ph - 0.3) / 0.7);
  if (atk || asst) pulse = Math.max(pulse, 1 - clamp(at / 0.3, 0, 1));
  let flare = 0;
  if (cast) { flare = at < 0.15 ? at / 0.15 : 1 - clamp((at - 0.15) / 0.45, 0, 1); pulse = at < 0.1 ? 1 : pulse * 0.4; }
  const bob = Math.sin(t * 2 + (g.seed ?? 0)) * 1.2 - pulse * 1.4;
  const lean = clamp(s.vxf * 0.002, -0.6, 1);
  const lash = atk ? clamp(1 - Math.abs(at - 0.06) / 0.16, 0, 1) : asst ? clamp(1 - Math.abs(at - 0.14) / 0.14, 0, 1) : 0;
  const zap = atk || asst ? lash : cast ? flare * 0.7 : 0;
  let tilt = clamp(s.vxf * 0.0007, -0.14, 0.22) - s.hurt * 0.4 + lash * 0.18, spin = 0;
  if (emote) spin = easeIO(clamp((at - 0.1) / 0.7, 0, 1)) * TAU;
  const sc = 0.4 + 0.6 * s.appear;
  const lampCol = s.hurt > 0 && Math.sin(t * 40) > 0 ? '#ff9ae8' : '#ffd070';
  // 큰 빛 (몸 뒤)
  gGlow(ctx, 0, RIM_Y - 4 + bob, 16 + flare * 26 + (s.aw ? 4 : 0), '#6fe8ff', 0.28 + flare * 0.55 + (s.aw ? 0.1 : 0));
  ctx.translate(0, bob);
  ctx.translate(0, RIM_Y - 3); ctx.rotate(tilt + spin); if (sc !== 1) ctx.scale(sc, sc); ctx.translate(0, -(RIM_Y - 3));
  // 촉수 · 구완 (갓 뒤·아래)
  lumenTentacles(ctx, t, pulse, lean, lash, s.q, zap);
  for (let i = 0; i < 3; i++) {
    const ox = -2.6 + i * 2.6, sw = Math.sin(t * 2.6 + i * 1.7) * 0.12 - lean * 0.25 + lash * 0.35;
    blit(ctx, P.oral, ox, RIM_Y + 0.6, sw, 1, 1 - pulse * 0.12 - lash * 0.2, 0.9);
  }
  // 등불 (갓 속, 흔들림)
  const lsw = Math.sin(t * 2.3) * 0.18 - lean * 0.2;
  blit(ctx, P.lamp, 0, RIM_Y - 8.6 + pulse * 0.6, lsw);
  const fx = Math.sin(-lsw) * 3.5, fy = RIM_Y - 8.6 + pulse * 0.6 + Math.cos(lsw) * 3.5;
  const fl = 0.8 + Math.sin(t * 11) * 0.1 + Math.sin(t * 17) * 0.05;
  gGlow(ctx, fx, fy, (3 + flare * 7) * fl, lampCol, 0.9, 0.25);
  // 갓 (수축 = 옆으로 넓고 납작)
  const bx = 1 + pulse * 0.12 + flare * 0.2, by = 1 - pulse * 0.14 + flare * 0.15;
  blit(ctx, P.bell, 0, RIM_Y, 0, bx, by, 0.9);
  if (s.hiQ) blitAdd(ctx, P.bell, 0, RIM_Y, 0, bx, by, 0.12 + flare * 0.5 + Math.sin(t * 2.5) * 0.04);
  gGlow(ctx, fx, fy, 2, '#fffbe0', 0.9, 0.2);
  if (cast) {
    const k = clamp(at / 0.2, 0, 1), fade = 1 - clamp((at - 0.35) / 0.25, 0, 1);
    gStar(ctx, fx, fy, 6 + 10 * k, 0.9 * fade, t);
    gHalo(ctx, 0, RIM_Y - 5, 12 + 10 * k, 12 + 10 * k, '#6fe8ff', 0.6 * fade, 0.8);
  }
  if (s.aw) {   // 각성: 쌍둥이 빛방울 + 오로라 고리
    for (let i = 0; i < 2; i++) { const a2 = t * 1.6 + i * Math.PI; gGlow(ctx, Math.cos(a2) * 12, RIM_Y - 6 + Math.sin(a2) * 3, 2.6, i ? '#ff9ae8' : '#6fe8ff', 0.8, 0.25); }
    gHalo(ctx, 0, RIM_Y - 12.5, 6, 1.6, '#ff9ae8', 0.55 + Math.sin(t * 3) * 0.15, 0.5);
  }
  if (emote && s.q > 0.5) for (let i = 0; i < 4; i++) {   // 거품
    const k = ((at * 1.2 + i * 0.25) % 1);
    ctx.save(); ctx.globalAlpha *= (1 - k) * 0.8; ctx.strokeStyle = '#e0fbff'; ctx.lineWidth = 0.35;
    ctx.beginPath(); ctx.arc(-4 + i * 3 + Math.sin(k * 6 + i) * 1.5, RIM_Y - 12 - k * 14, 0.8 + i * 0.25, 0, TAU); ctx.stroke(); ctx.restore();
  }
  if (asst) dashLines(ctx, at, '#6fe8ff', RIM_Y);
  return true;
}

// ═════════════════════════ 모모 (꿈먹는 맥) ═════════════════════════
// 쪽빛 동그란 몸(금빛 별·초승달 무늬) · 크림색 가슴털 · 졸린 보랏빛 눈 · 둥근 귀 · 짧게 말린 코 · 뭉툭한 다리 · 곱슬 꼬리 · 보랏빛 꿈 구름.
// 발 원점 (구름 밑), 몸 중심 (0,-13). 코 뿌리 (13.4,-13.4) — guardian_ai_b mouth (cx + w*0.55, cy + 2) 와 같은 높이.
const INDIGO = [[0, '#5a54a0'], [0.5, '#2e2a62'], [1, '#141030']];
const TRUNK = [13.4, -14.6];
function momoParts() {
  return cached('momo', () => {
    const cloud = bake(-15.5, -8.6, 15.5, 0.6, (x) => {
      x.fillStyle = lin(x, 0, -8, 0, 0, [[0, '#d8c4ff'], [0.5, '#a888f0'], [1, '#6a4ab8']]);
      x.beginPath();
      for (const [cx, cy, r] of [[-11.6, -2.6, 3], [-7.6, -4.2, 3.8], [-2.6, -5, 4.4], [2.8, -5, 4.4], [7.8, -4, 3.8], [11.8, -2.6, 3]]) { x.moveTo(cx + r, cy); x.arc(cx, cy, r, 0, TAU); }
      x.rect(-13, -3, 26, 3); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.3)';
      x.beginPath(); for (const [cx, cy, r] of [[-7.8, -5.6, 1.8], [-2.8, -6.8, 2.2], [2.6, -6.8, 2], [7.6, -5.4, 1.6]]) { x.moveTo(cx + r, cy); x.arc(cx, cy, r, 0, TAU); } x.fill();
      x.fillStyle = 'rgba(60,30,120,0.35)'; x.beginPath(); x.ellipse(0, -0.6, 13, 1.3, 0, 0, TAU); x.fill();
    });
    const body = bake(-15, -24, 17, -2, (x) => {
      // 먼 쪽 다리 (어둡게)
      x.fillStyle = '#1a1634';
      for (const lx of [-7.2, 5.4]) { x.beginPath(); x.moveTo(lx - 1.4, -9); x.lineTo(lx - 1.2, -4.6); x.lineTo(lx + 1.3, -4.6); x.lineTo(lx + 1.4, -9); x.closePath(); x.fill(); }
      x.fillStyle = '#6a4a8a'; for (const lx of [-7.2, 5.4]) { x.beginPath(); x.ellipse(lx, -4.5, 1.5, 0.7, 0, 0, TAU); x.fill(); }
      // 몸통 (둥글고 통통한 등)
      x.fillStyle = rad(x, -2, -17, 1, 13, INDIGO, -3, -19);
      x.beginPath(); x.ellipse(-2.2, -12.8, 11.4, 7.8, 0, 0, TAU); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.4; x.stroke();
      // 크림색 가슴털 (목 아래 · 앞다리 위)
      x.fillStyle = rad(x, 5.6, -9.4, 0.5, 5, [[0, '#fff8e0'], [0.6, '#f0e0b8'], [1, '#c8b080']]);
      x.beginPath(); x.moveTo(2.4, -12.6); x.bezierCurveTo(4, -13.8, 7.6, -13.2, 8.8, -10.6); x.bezierCurveTo(9, -8.6, 8, -6.8, 6.8, -6.2);
      for (let i = 0; i < 5; i++) x.lineTo(6.2 - i * 0.9, -6 + (i % 2) * 0.9);
      x.bezierCurveTo(2.2, -7.6, 1.8, -10.6, 2.4, -12.6); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(160,130,90,0.6)'; x.lineWidth = 0.22; x.beginPath(); for (let i = 0; i < 5; i++) { x.moveTo(3.4 + i * 0.9, -11.4 + i * 0.6); x.lineTo(2.9 + i * 0.9, -9.8 + i * 0.6); } x.stroke();
      // 머리 (몸 앞 위쪽, 주둥이가 앞으로 길게)
      x.fillStyle = rad(x, 8.6, -17.2, 0.6, 6.4, INDIGO, 8, -18.6);
      x.beginPath(); x.moveTo(4.2, -18.4); x.bezierCurveTo(5.2, -21.8, 10.4, -21.6, 12, -18.2);
      x.bezierCurveTo(13.4, -16.6, 14.4, -15.6, 14.2, -13.8); x.bezierCurveTo(13.8, -12.4, 12.2, -11.6, 10.4, -11.8);
      x.bezierCurveTo(8, -11.6, 5.2, -12.6, 4.2, -14.6); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.38; x.stroke();
      x.fillStyle = 'rgba(140,130,220,0.3)'; x.beginPath(); x.ellipse(8.4, -19.4, 3, 1, -0.2, 0, TAU); x.fill();
      // 털결 (등)
      x.strokeStyle = 'rgba(140,130,220,0.35)'; x.lineWidth = 0.28;
      x.beginPath(); for (let i = 0; i < 9; i++) { const px = -11 + i * 2.2; x.moveTo(px, -18.6 + Math.abs(i - 4) * 0.35); x.lineTo(px - 0.8, -17.2 + Math.abs(i - 4) * 0.35); } x.stroke();
      // 가까운 다리
      const legG = lin(x, 0, -10, 0, -4, [[0, '#3a3470'], [1, '#1a1636']]);
      x.fillStyle = legG;
      for (const lx of [-5, 7.4]) { x.beginPath(); x.moveTo(lx - 1.6, -9.6); x.lineTo(lx - 1.4, -4.2); x.lineTo(lx + 1.5, -4.2); x.lineTo(lx + 1.7, -9.6); x.closePath(); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke(); }
      x.fillStyle = '#8a6aaa'; for (const lx of [-5, 7.4]) { x.beginPath(); x.ellipse(lx, -4, 1.7, 0.75, 0, 0, TAU); x.fill(); }
      // 귀
      x.fillStyle = '#2e2a62'; x.beginPath(); x.ellipse(5.4, -20.4, 1.8, 2.4, -0.3, 0, TAU); x.fill(); x.strokeStyle = OUT; x.lineWidth = 0.3; x.stroke();
      x.fillStyle = '#c890b8'; x.beginPath(); x.ellipse(5.5, -20.2, 1, 1.5, -0.3, 0, TAU); x.fill();
      // 금빛 별·초승달 무늬
      const moon = (cx, cy, r, rot) => { x.beginPath(); x.arc(cx, cy, r, rot + 0.7, rot + 5.6); x.arc(cx + Math.cos(rot) * r * 0.45, cy + Math.sin(rot) * r * 0.45, r * 0.78, rot + 5.2, rot + 1.1, true); x.closePath(); x.fill(); };
      const star = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); };
      x.fillStyle = '#ffe08a';
      moon(-3.4, -18.2, 1.9, 0.2); moon(8.2, -18.6, 1.4, -0.2);
      star(-8.2, -15, 1.3); star(-5.4, -12, 0.9); star(0.2, -16.2, 1.1); star(-10.4, -11.8, 0.7); star(2.2, -19, 0.6);
      x.beginPath(); for (const [dx, dy] of [[-6.8, -17.8], [-1.2, -13.6], [-9, -18.2], [1.6, -14.2], [-3, -9.8]]) { x.moveTo(dx + 0.3, dy); x.arc(dx, dy, 0.3, 0, TAU); } x.fill();
      // 졸린 눈 (감은 초승달 + 속눈썹) · 보랏빛 눈두덩 · 미소
      x.fillStyle = 'rgba(190,120,230,0.55)'; x.beginPath(); x.ellipse(9.2, -17, 1.8, 1.1, 0, 0, TAU); x.fill();
      x.strokeStyle = '#140c24'; x.lineWidth = 0.4; x.beginPath(); x.arc(9.3, -17.4, 1.2, 0.35, 2.7); x.stroke();
      x.lineWidth = 0.22; x.beginPath(); x.moveTo(10.4, -16.8); x.lineTo(11, -16.5); x.moveTo(9.9, -16.4); x.lineTo(10.3, -15.9); x.stroke();
      x.strokeStyle = '#140c24'; x.lineWidth = 0.28; x.beginPath(); x.moveTo(9.6, -13); x.quadraticCurveTo(10.8, -12.2, 12, -12.8); x.stroke();
      x.fillStyle = 'rgba(255,140,190,0.35)'; x.beginPath(); x.ellipse(10.2, -14.8, 1, 0.6, 0, 0, TAU); x.fill();
    });
    // 코 (뿌리 원점, +x 로 뻗고 끝이 아래로 말림)
    const trunk = bake(-0.8, -2.8, 7.4, 6.4, (x) => {
      x.fillStyle = lin(x, 0, -2, 0, 3, [[0, '#4a4488'], [1, '#1c1840']]);
      x.beginPath(); x.moveTo(-0.4, -2.4); x.bezierCurveTo(2.6, -2.6, 5.4, -1.8, 6.4, 0.8); x.bezierCurveTo(7, 2.8, 6.2, 5, 4.6, 5.6);
      x.bezierCurveTo(3.8, 4.8, 4.8, 3.4, 4.4, 2.2); x.bezierCurveTo(3.8, 1, 2, 1.6, -0.4, 2.2); x.closePath(); x.fill();
      x.strokeStyle = OUT; x.lineWidth = 0.34; x.stroke();
      x.strokeStyle = 'rgba(150,140,230,0.35)'; x.lineWidth = 0.2; x.beginPath(); x.moveTo(0.6, -1.9); x.bezierCurveTo(3, -1.9, 4.8, -1.2, 5.6, 0.8); x.stroke();
      x.fillStyle = '#0c0818'; x.beginPath(); x.ellipse(5, 5.2, 0.6, 0.38, 0.5, 0, TAU); x.fill();
    });
    // 꼬리 (뿌리 원점, -x 로)
    const tail = bake(-6.4, -4.6, 0.6, 2.2, (x) => {
      limb(x, [[0, 0], [-2, -0.6], [-3.4, -2.2], [-3, -3.4]], 0.6, '#2e2a62');
      x.fillStyle = '#1a1636'; x.strokeStyle = OUT; x.lineWidth = 0.25;
      x.beginPath(); for (let i = 0; i < 7; i++) { const a = i * TAU / 7; x.lineTo(-3.8 + Math.cos(a) * (1.6 + (i % 2) * 0.6), -3.6 + Math.sin(a) * (1.4 + (i % 2) * 0.5)); } x.closePath(); x.fill(); x.stroke();
    });
    return { cloud, body, trunk, tail };
  });
}
function drawMomo(ctx, g, world, opts) {
  const P = momoParts();
  if (!P?.body) return false;
  const s = pre(ctx, g, world, opts), t = s.t, at = s.at, an = s.an;
  const cast = an === 'skill', atk = an === 'attack', asst = an === 'assist', emote = an === 'emote';
  const bob = Math.sin(t * 1.7 + (g.seed ?? 0)) * 1.3;
  const breath = Math.sin(t * 2.1) * 0.025;
  let tilt = clamp(s.vxf * 0.0006, -0.12, 0.18) - s.hurt * 0.25, sx = 1 - breath, sy = 1 + breath, lift = 0;
  // 코 자세: 각 (0 = 앞으로, + = 아래로 말림) · 길이 배율
  let ta = 0.3 + Math.sin(t * 1.5) * 0.12, tl = 1, open = 0;
  if (atk) {   // 0~0.12 뒤로 젖힘 → 0.14 덥석 → 복귀 (bite 판정 0.14)
    if (at < 0.12) { ta = lerp(0.25, -0.75, easeOut(at / 0.12)); tilt -= 0.08 * (at / 0.12); }
    else if (at < 0.2) { const k = easeOut((at - 0.12) / 0.08); ta = lerp(-0.75, 0.3, k); tl = lerp(1, 1.75, k); tilt += 0.14 * k; open = k; }
    else { const k = clamp((at - 0.2) / 0.14, 0, 1); ta = lerp(0.3, 0.25, k); tl = lerp(1.75, 1, easeIO(k)); tilt += 0.14 * (1 - k); open = 1 - k; }
  } else if (asst) {   // 코 휘두르기 (0.12 돌진 뒤 크게 휘두름)
    const k = clamp((at - 0.12) / 0.2, 0, 1);
    ta = at < 0.12 ? lerp(0.25, -1.1, at / 0.12) : lerp(-1.1, 1.2, easeIO(k)); tl = 1.3;
    if (k >= 1) ta = lerp(1.2, 0.25, clamp((at - 0.32) / 0.2, 0, 1));
  } else if (cast) {   // 1.0초 들이마심 (몸이 부풀고 코를 앞으로 곧게) → 1.0~1.25 꺼억
    const k = clamp(at / 0.25, 0, 1);
    if (at < 1.0) { ta = lerp(0.25, -0.15, k) + Math.sin(t * 30) * 0.03; tl = lerp(1, 1.35, k); sx *= 1 + 0.1 * k; sy *= 1 + 0.12 * k; open = k; }
    else { const g2 = clamp((at - 1.0) / 0.25, 0, 1), b = Math.sin(g2 * Math.PI); sy *= 1 - 0.14 * b; sx *= 1 + 0.1 * b; ta = lerp(-0.15, 0.25, g2); tl = lerp(1.35, 1, g2); lift = -2 * b; }
  } else if (emote) {   // 하품: 코를 들어 올리고 기지개
    const k = Math.sin(clamp(at / 0.8, 0, 1) * Math.PI);
    ta = lerp(0.25, -1.2, k); sy *= 1 + 0.06 * k; tilt -= 0.1 * k; open = k;
  } else if (s.hurt > 0) { sy *= 1 - 0.12 * s.hurt; sx *= 1 + 0.08 * s.hurt; }
  const sc = 0.45 + 0.55 * s.appear;
  gGlow(ctx, 0, -12 + bob, cast ? 26 : 14, '#c060ff', (cast ? 0.45 : 0.16) + (s.aw ? 0.08 : 0));
  // 구름 (살짝 떠다니며 숨쉼)
  const cb = Math.sin(t * 1.3) * 0.04;
  blit(ctx, P.cloud, Math.sin(t * 0.9) * 0.6, 0, 0, 1 + cb, 1 - cb, 0.95);
  if (s.hiQ) blitAdd(ctx, P.cloud, 0, 0, 0, 1.02, 1.02, 0.12);
  ctx.translate(0, bob * 0.6 + lift);
  ctx.translate(0, -5); ctx.rotate(tilt); ctx.scale(sc * sx, sc * sy); ctx.translate(0, 5);
  // 꼬리 (살랑)
  blit(ctx, P.tail, -12.6, -15, Math.sin(t * 4.2) * 0.3 + (emote ? Math.sin(at * 14) * 0.3 : 0));
  blit(ctx, P.body, 0, 0);
  // 벌린 입 (코 아래 어두운 틈)
  if (open > 0.05) {
    ctx.save(); ctx.fillStyle = '#12081e'; ctx.globalAlpha *= clamp(open, 0, 1);
    ctx.beginPath(); ctx.ellipse(12, -11.4, 1.6, 0.9 * open + 0.2, 0.2, 0, TAU); ctx.fill(); ctx.restore();
    if (cast) gGlow(ctx, 12.4, -11.6, 3 + open * 3, '#c060ff', 0.5 * open);
  }
  blit(ctx, P.trunk, TRUNK[0], TRUNK[1], ta, tl, 1);
  // 무늬 반짝임 (몇 개만)
  const tw = (i) => 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.9)) + (s.aw ? 0.25 : 0) + (cast ? 0.3 : 0);
  gGlow(ctx, -3.4, -18.2, 3, '#ffe08a', tw(0), 0.3); gGlow(ctx, -8.2, -15, 2.4, '#ffe08a', tw(1), 0.3); gGlow(ctx, 0.2, -16.2, 2.2, '#ffe08a', tw(2), 0.3);
  if (s.hiQ) gGlow(ctx, 8.2, -18.6, 2.2, '#ffe08a', tw(3), 0.3);
  // 코끝 (덥석 섬광)
  const c = Math.cos(ta), sn = Math.sin(ta), tipX = TRUNK[0] + c * 5.2 * tl - sn * 4.6, tipY = TRUNK[1] + sn * 5.2 * tl + c * 4.6;
  if ((atk && at > 0.12 && at < 0.26) || (asst && at > 0.18 && at < 0.3)) { gGlow(ctx, tipX, tipY, 7, '#d080ff', 0.7, 0.25); gStar(ctx, tipX, tipY, 4, 0.8, t * 4); }
  // 각성: 머리 위 초승달 후광 + 별가루
  if (s.aw) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,224,138,0.75)';
    ctx.beginPath(); ctx.arc(8, -25, 2.6, 0.8, 5.5); ctx.arc(9.2, -25.6, 2.1, 5.1, 1.2, true); ctx.closePath(); ctx.fill();
    ctx.restore();
    gGlow(ctx, 8, -25, 6, '#ffe08a', 0.35);
    if (s.q > 0.5) for (let i = 0; i < 3; i++) { const k = (t * 0.5 + i / 3) % 1; gStar(ctx, -14 - k * 8, -12 + Math.sin(k * 7 + i) * 3, 1.4 * (1 - k), 0.8 * (1 - k), t + i); }
  }
  // 하품의 z
  if (emote && at > 0.3) {
    const k = clamp((at - 0.3) / 0.7, 0, 1);
    ctx.save(); ctx.globalAlpha *= 1 - k; ctx.strokeStyle = '#e8d8ff'; ctx.lineWidth = 0.6;
    const zx = 12 + k * 6, zy = -22 - k * 8, z = 2 + k;
    ctx.beginPath(); ctx.moveTo(zx, zy); ctx.lineTo(zx + z, zy); ctx.lineTo(zx, zy + z); ctx.lineTo(zx + z, zy + z); ctx.stroke(); ctx.restore();
  }
  if (asst) dashLines(ctx, at, '#d080ff', -12);
  return true;
}

/** 2부 수호신 다섯의 절차 그림 (render/guardians.js drawGuardian 이 위임) */
export const GUARDIAN_DRAW_B = { gd_clock: drawClock, gd_reaper: drawReaper, gd_mirra: drawMirra, gd_lumen: drawLumen, gd_momo: drawMomo };

// ───────────────────────── 원형 머리 아이콘 ─────────────────────────
/** [초점 x, y, 원 지름에 담을 폭] (발 원점 논리 좌표) */
const ICON_FOCUS = { gd_clock: [0.8, -25.4, 16], gd_reaper: [2.4, -29.6, 17], gd_mirra: [0.8, -24.4, 12.5], gd_lumen: [0, -26, 22], gd_momo: [7.4, -15.2, 18] };
const ICONS = new Map();
function iconG(def) {
  return { id: def.id, def, anim: 'idle', animT: 0, t: 0.35, facing: 1, alpha: 1, seed: 0, vx: 0, vy: 0, cx: 0, bottom: 0, perched: false, d: { awakened: false }, hopY: () => 0 };
}
function iconFor(id) {
  return (ctx, x, y, r) => {
    if (!hasDoc || !(r > 0)) return false;
    const m = ctx.getTransform(), k = Math.hypot(m.a, m.b) || 1;
    const px = clamp(Math.ceil(r * 2 * k), 16, 256), key = id + ':' + px;
    let c = ICONS.get(key);
    if (!c) {
      const def = GUARDIANS[id];
      if (!def) return false;
      c = mk(px, px);
      const x2 = c.getContext('2d'), R = px / 2, col = def.color ?? '#c8a060';
      const bg = x2.createRadialGradient(R, R * 0.7, 1, R, R, R);
      const n = parseInt(col.slice(1), 16);
      bg.addColorStop(0, `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0.55)`); bg.addColorStop(0.55, '#1a1018'); bg.addColorStop(1, '#07040a');
      x2.fillStyle = bg; x2.beginPath(); x2.arc(R, R, R, 0, TAU); x2.fill();
      x2.save(); x2.beginPath(); x2.arc(R, R, R - 0.5, 0, TAU); x2.clip();
      const fo = ICON_FOCUS[id], sc = (px * 0.95) / fo[2];
      x2.translate(R - fo[0] * sc, R - fo[1] * sc); x2.scale(sc, sc);
      try { GUARDIAN_DRAW_B[id](x2, iconG(def), null, {}); } catch { /* 아이콘 실패는 무시 */ }
      x2.restore();
      ICONS.set(key, c);
    }
    ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
    return true;
  };
}
/** render/guardians.js drawGuardianIcon 이 먼저 찾는 B 아이콘 */
export const GUARDIAN_ICON_B = Object.fromEntries(Object.keys(GUARDIAN_DRAW_B).map((id) => [id, iconFor(id)]));

// ───────────────────────── 연출 도우미 (guardian_ai_b.js 선택 export) ─────────────────────────
/** 틱톡 톱니 탄 (원점 = 탄 중심): 놋쇠 톱니가 돌며 금빛 꼬리를 끈다. 협공(톱니 드릴, 큰 탄)은 불꽃이 튄다 */
export function fxGear(ctx, pr, world) {
  const s = gearSpr(false), st = streakSpr('rgba(255,208,112,0.7)');
  if (!s) return false;
  const r = Math.max(pr.w ?? 14, pr.h ?? 14) * 0.62 * (pr.scale ?? 1), ang = Math.atan2(pr.vy ?? 0, pr.vx ?? 1), big = r > 11;
  const t = pr.t ?? 0;
  ctx.save();
  ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  if (st) { ctx.globalAlpha *= 0.8; ctx.drawImage(st, -r * 5.2, -r * 0.7, r * 5.2, r * 1.4); ctx.globalAlpha /= 0.8; }
  if (big && hi(world)) for (let i = 0; i < 4; i++) {   // 드릴 불꽃
    const k = (t * 6 + i / 4) % 1, a2 = (hsh(i + Math.floor(t * 6)) - 0.5) * 1.6;
    gGlow(ctx, -k * r * 2.2, Math.sin(a2) * r * k * 1.4, 2 + (1 - k) * 2, '#ffe6a8', 0.7 * (1 - k), 0.3);
  }
  ctx.restore();
  gGlow(ctx, 0, 0, r * 1.7, '#ffd070', big ? 0.55 : 0.4);
  ctx.save();
  ctx.rotate(t * 26 * (Math.sign(pr.vx) || 1));
  ctx.drawImage(s, -r, -r, r * 2, r * 2);
  ctx.restore();
  gStar(ctx, -r * 0.3, -r * 0.3, r * 0.5, 0.5, t * 4);
  return true;
}
let SHARD_SPR = null;
function shardSpr() {
  if (SHARD_SPR || !hasDoc) return SHARD_SPR;
  const P = mirraParts();
  SHARD_SPR = P?.shard ?? null;
  return SHARD_SPR;
}
/** 미라 거울 파편 탄 (원점 = 탄 중심): 궤도 중이면 pr.orbitA 방향, 날아갈 때는 속도 방향으로 끝을 향한다 */
export function fxMirrorShard(ctx, pr, world) {
  const S = shardSpr();
  if (!S) return false;
  const orb = pr.behavior === 'orbit', sc = (pr.scale ?? 1) * 1.7, t = pr.t ?? 0;
  const ang = orb ? (pr.orbitA ?? 0) : Math.atan2(pr.vy ?? 0, pr.vx ?? 1);
  if (hi(world)) gGlow(ctx, 0, 0, 14 * sc * 0.6, '#dff4ff', 0.55);
  ctx.save();
  ctx.rotate(ang + Math.PI / 2);
  if (!orb && hi(world)) {   // 잔상 두 겹 (진행 반대쪽)
    for (let i = 2; i >= 1; i--) blitAdd(ctx, S, 0, i * 5 * sc * 0.6, 0, sc * (1 - i * 0.15), sc * (1 - i * 0.15), 0.25 / i);
  }
  blit(ctx, S, 0, 0, 0, sc, sc);
  // 반짝 훑음
  const sw = (t * 2.5 + (pr.orbitA ?? 0)) % 1;
  if (sw < 0.3) gStar(ctx, 0, -3 * sc + sw * 12 * sc * 0.5, 2.6 * sc * 0.5, 1 - sw / 0.3, t * 5);
  ctx.restore();
  return true;
}
/** 미라 「만화경 난반사」 궤도 고리 (플레이어 둘레): 도는 육각별 + 거울 조각 판 여섯. e.data.orbitT 뒤 발사 순간 퍼지는 고리 */
export function fxKaleido(ctx, e, world) {
  const D = e.data ?? {}, p = world?.player;
  if (!p || !(D.orbitT > 0)) return true;
  const k = (e.t ?? 0) / D.orbitT;
  if (k > 1.3) return true;
  const a = Math.min(1, (e.t ?? 0) / 0.15) * clamp((1.2 - k) / 0.3, 0, 1);
  const x = p.cx, y = p.cy, R = 70, rot = (e.t ?? 0) * 1.6;
  ctx.globalCompositeOperation = 'lighter';
  if (a > 0.01) {
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalAlpha = (pass ? 0.75 : 0.25) * a; ctx.strokeStyle = pass ? '#ffffff' : '#bfe8ff'; ctx.lineWidth = pass ? 1.1 : 4;
      ctx.beginPath();
      for (let j = 0; j < 2; j++) for (let i = 0; i <= 3; i++) {
        const an = rot + (j * Math.PI) / 3 + (i * TAU) / 3, px = x + Math.cos(an) * R, py = y + Math.sin(an) * R;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, R * 1.05, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 거울 판 여섯 (육각별 꼭짓점에서 반대로 돈다)
    const S = shardSpr();
    for (let i = 0; i < 6; i++) {
      const an = -rot * 0.7 + (i * TAU) / 6, px = x + Math.cos(an) * R * 0.62, py = y + Math.sin(an) * R * 0.62;
      if (S) { ctx.save(); ctx.globalAlpha = a * 0.8; ctx.translate(px, py); ctx.rotate(an + Math.PI / 2); ctx.scale(1.3, 1.3); ctx.drawImage(S.c, S.x0, S.y0, S.w, S.h); ctx.restore(); }
      if (((e.t ?? 0) * 2 + i / 6) % 1 < 0.2) gStar(ctx, px, py, 4, a, e.t);
    }
    gGlow(ctx, x, y, R * 0.8, '#dff4ff', 0.18 * a);
  }
  if (k >= 1 && k < 1.3) {   // 발사 순간 퍼지는 고리
    const b = (k - 1) / 0.3;
    gHalo(ctx, x, y, R * (1 + b * 0.8), R * (1 + b * 0.8), '#dff4ff', (1 - b) * 0.8, 2);
  }
  return true;
}
/** 미라 되비추기 거울면 (탄 위치, 새 진행 방향 e.data.a 에 수직) + 미라에게서 뻗는 빛줄기 */
export function fxMirrorPane(ctx, e, world) {
  const D = e.data ?? {}, life = e.maxLife || 0.26, a = clamp((e.life ?? 0) / life, 0, 1);
  if (a <= 0.01) return true;
  const x = e.cx, y = e.cy, k = 1 - a;
  ctx.globalCompositeOperation = 'lighter';
  if (Number.isFinite(D.gx)) {
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.3 * a; ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(D.gx, D.gy); ctx.lineTo(x, y); ctx.stroke();
    ctx.globalAlpha = 0.85 * a; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(x, y); ctx.rotate(D.a ?? 0);
  const hh = 20 + k * 8;
  ctx.globalAlpha = 0.5 * a; ctx.fillStyle = '#9ad0ff'; ctx.fillRect(-3.5, -hh, 7, hh * 2);
  ctx.globalAlpha = 0.95 * a; ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -hh, 2, hh * 2);
  ctx.globalAlpha = 0.7 * a; ctx.strokeStyle = '#e8ecf4'; ctx.lineWidth = 1.2; ctx.strokeRect(-3.5, -hh, 7, hh * 2);
  ctx.restore();
  ctx.globalAlpha = 1;
  gStar(ctx, x, y, 10 + k * 8, a, k * 3);
  gGlow(ctx, x, y, 24, '#dff4ff', 0.55 * a);
  if (hi(world)) for (let i = 0; i < 5; i++) {   // 튀는 빛 조각
    const an = (D.a ?? 0) + (hsh(i) - 0.5) * 1.8, d = 6 + k * 34 * (0.6 + hsh(i + 4) * 0.6);
    gGlow(ctx, x + Math.cos(an) * d, y + Math.sin(an) * d, 3 * a + 1, '#ffffff', a);
  }
  return true;
}
/** 루멘 「심해의 등불」 섬광 (e 중심 = 루멘): 퍼지는 빛 · 흰 핵 · 돌아가는 빛살 · 물결 고리. 낮은 품질에서는 화면을 덮는 큰 빛 생략 */
export function fxLumenFlash(ctx, e, world) {
  const D = e.data ?? {}, t = e.t ?? 0, life = e.maxLife || 0.6;
  const k = clamp(t / 0.3, 0, 1), ek = 1 - (1 - k) * (1 - k) * (1 - k);
  const R = lerp(24, D.R ?? 300, ek), a = clamp(1 - t / life, 0, 1), x = e.cx, y = e.cy;
  if (a <= 0.01) return true;
  const fk = 0.35 + 0.65 * flashK(world);
  ctx.globalCompositeOperation = 'lighter';
  if (qOf(world) >= 0.6 || R < 300) gGlow(ctx, x, y, R, '#6fe8ff', 0.6 * a * fk, 0.25);
  gGlow(ctx, x, y, R * 0.35, '#ffffff', 0.85 * a * (1 - k * 0.6) * fk, 0.3);
  gGlow(ctx, x, y, 40, '#ffd070', 0.6 * a);
  ctx.lineCap = 'round';
  const n = hi(world) ? 12 : 8;
  ctx.globalAlpha = 0.5 * a; ctx.strokeStyle = '#e0fbff'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const an = (i / n) * TAU + t * 1.2, r0 = R * 0.16, r1 = R * (0.55 + 0.35 * hsh(i)); ctx.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0); ctx.lineTo(x + Math.cos(an) * r1, y + Math.sin(an) * r1); }
  ctx.stroke();
  for (let i = 0; i < 3; i++) {   // 물결 고리 (안쪽에서 번갈아)
    const kk = clamp(ek - i * 0.18, 0, 1);
    if (kk <= 0) continue;
    ctx.globalAlpha = 0.7 * a * (1 - kk * 0.6); ctx.strokeStyle = i === 1 ? '#ff9ae8' : '#bff8ff'; ctx.lineWidth = 3 - i * 0.7;
    ctx.beginPath(); ctx.arc(x, y, R * 0.8 * kk, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  gStar(ctx, x, y, 18 + 10 * (1 - k), a, t * 2);
  return true;
}
/** 루멘 번개 줄기 (e.data.segs 평평한 배열 [x0,y0,x1,y1,…]): 30Hz 로 떨리는 지그재그 두 겹 + 끝점 빛 */
export function fxLumenBolts(ctx, e, world) {
  const D = e.data ?? {}, S = D.segs;
  if (!S || S.length < 4) return true;
  const a = Math.min(1, (e.life ?? 0) / 0.1), fr = Math.floor((e.t ?? 0) * 30), col = D.color ?? '#6fe8ff';
  if (a <= 0.01) return true;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const steps = hi(world) ? 7 : 5;
  for (const [wd, c, al] of [[5, col, 0.55], [1.6, '#ffffff', 0.95]]) {
    ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.globalAlpha = al * a;
    ctx.beginPath();
    for (let i = 0; i + 3 < S.length; i += 4) {
      const x0 = S[i], y0 = S[i + 1], x1 = S[i + 2], y1 = S[i + 3], len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len, amp = Math.min(14, len * 0.08);
      ctx.moveTo(x0, y0);
      for (let s = 1; s <= steps; s++) {
        const k = s / steps, j = s < steps ? (hsh(i * 13 + s * 7 + fr) - 0.5) * 2 * amp : 0;
        ctx.lineTo(lerp(x0, x1, k) + nx * j, lerp(y0, y1, k) + ny * j);
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i + 3 < S.length; i += 4) gGlow(ctx, S[i + 2], S[i + 3], 12, col, 0.7 * a);
  return true;
}
/** 루멘 기절 표시: 기절한 적 머리 위를 도는 전기 별 셋 (en.stun > 0 동안) */
export function fxStunSparks(ctx, e, world) {
  const L = e.data?.list;
  if (!L || !L.length) return true;
  const t = world?.time ?? e.t ?? 0;
  for (let n = 0; n < L.length && n < 12; n++) {
    const en = L[n];
    if (!alive(en) || !(en.stun > 0.05)) continue;
    const a = Math.min(1, en.stun / 0.3), cy = en.y - 8;
    gGlow(ctx, en.cx, cy, 10, '#6fe8ff', 0.25 * a);
    for (let i = 0; i < 3; i++) {
      const an = t * 5 + (i * TAU) / 3 + n, x = en.cx + Math.cos(an) * 13, y = cy + Math.sin(an) * 4, front = Math.sin(an) > 0;
      gStar(ctx, x, y, front ? 4.2 : 3, a * (front ? 1 : 0.6), t * 4 + i);
      gGlow(ctx, x, y, 3.2, '#bff8ff', 0.6 * a);
    }
  }
  return true;
}
/** 모모 「악몽 포식」 소용돌이 (e 중심 = 모모의 입): 안으로 말려드는 보랏빛 나선 셋 + 빨려 드는 별 + 어두운 핵 */
export function fxMomoVortex(ctx, e, world) {
  const t = e.t ?? 0, a = Math.min(1, t / 0.12) * clamp((e.life ?? 0) / 0.15, 0, 1), x = e.cx, y = e.cy;
  if (a <= 0.01) return true;
  ctx.globalCompositeOperation = 'lighter';
  gGlow(ctx, x, y, 52, '#c060ff', 0.45 * a);
  ctx.lineCap = 'round';
  const arms = 3, seg = hi(world) ? 14 : 9;
  for (let j = 0; j < arms; j++) {
    for (const [w, c, al] of [[3.2, '#c060ff', 0.45], [1.1, '#f0e0ff', 0.85]]) {
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.globalAlpha = al * a;
      ctx.beginPath();
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, r = 6 + u * 42, an = -t * 7 + (j * TAU) / arms + u * 3.2;
        const px = x + Math.cos(an) * r, py = y + Math.sin(an) * r * 0.8;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const ns = hi(world) ? 8 : 4;
  for (let i = 0; i < ns; i++) {   // 빨려 드는 별 (바깥 → 입)
    const k = (t * 1.4 + hsh(i)) % 1, r = 48 * (1 - k), an = hsh(i + 3) * TAU - k * 4;
    gStar(ctx, x + Math.cos(an) * r, y + Math.sin(an) * r * 0.8, 1.5 + 2 * (1 - k), a * (0.4 + 0.6 * k), t * 3 + i);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#12081e';
  ctx.beginPath(); ctx.arc(x, y, 5 + Math.sin(t * 20) * 0.6, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  return true;
}
/** 모모가 삼킨 탄 조각 (입으로 빨려 드는 꿈 방울: 줄어들며 별이 반짝) */
export function fxMorsel(ctx, e, world) {
  const life = e.maxLife || 0.18, k = clamp((e.t ?? 0) / life, 0, 1), r = 7 * (1 - k * 0.7), x = e.cx, y = e.cy;
  gGlow(ctx, x, y, r * 2.4, '#c060ff', 0.6);
  ctx.globalAlpha *= 0.9;
  ctx.fillStyle = '#2a1040'; ctx.strokeStyle = '#e0b0ff'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  gStar(ctx, x - r * 0.2, y - r * 0.2, r * 0.9, 0.9, k * 6);
  return true;
}
