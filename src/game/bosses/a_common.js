// 보스 A(1~7장) 공용 툴킷
//  - ABoss: 패턴 상태기계(시간 교차 at(), 가중치 패턴 선택, 휴식), 경기장 정보, 소환 관리, 사망 연출
//  - 예고(Telegraph): 경고선/띠/기둥/바닥원/느낌표/부채꼴 — 모든 큰 공격은 이것으로 먼저 알린다
//  - 판정 엔티티: Beam(선분 광선·사슬), RingWave(틈이 있는 확장 고리), groundWave(지면 충격파), erupt(바닥 분출), dropHazard(낙하물)
//  - 그리기 도우미: 피격 섬광 색(C), 그라디언트 캐시(lg/rg), 발광(glow), 외곽선+채우기(ink), 림라이트(rim), 테이퍼 경로(taper)
// 순환 import 주의: import 한 값은 함수/클래스 본문 안에서만 사용한다 (Boss 상속만 최상위에서 필요).
import { Boss } from './boss.js';
import { Entity } from '../entity.js';
import { Hitbox } from '../projectiles.js';
import { enemyStrike } from '../combat.js';
import { Debris } from '../../core/physics.js';
import { rand, clamp, lerp, TAU, mix, rgba } from '../../core/math.js';
import { audio } from '../../core/audio.js';
import { paintedTick, paintedDraw, preloadPainted } from '../../render/painted/registry.js';

let _hid = 0;
export const PI = Math.PI;
export const OUT = '#07030a';        // 외곽선
export const RIM = '#9fc0ff';        // 차가운 역광
export const WARM = '#ffd9a0';       // 따뜻한 키라이트
export const BLOODC = '#c0142c';

// ───────────────────────── 그리기 도우미 ─────────────────────────
let FLASH = 0;
const FC = new Map();
const GC = new Map();
/** 보스 그리기 시작: 피격 섬광 상태 설정 */
export function beginDraw(b) { FLASH = b.flashT > 0 ? 1 : 0; }
export function endDraw() { FLASH = 0; }
export function flashing() { return FLASH > 0; }
/** 색 (피격 섬광 중이면 흰빛으로 섞음) */
export function C(c) {
  if (!FLASH || c[0] !== '#') return c;
  let v = FC.get(c);
  if (!v) { v = mix(c, '#fff4ec', 0.62); FC.set(c, v); }
  return v;
}
function cacheSet(k, g) { if (GC.size > 900) GC.clear(); GC.set(k, g); return g; }
/** 선형 그라디언트 (key 가 있으면 캐시: 로컬 좌표가 고정일 때만) */
export function lg(ctx, key, x0, y0, x1, y1, stops) {
  if (FLASH) return C(stops[stops.length > 3 ? 3 : 1]);
  let g = key && GC.get(key);
  if (g) return g;
  g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return key ? cacheSet(key, g) : g;
}
/** 방사형 그라디언트 */
export function rg(ctx, key, x0, y0, r0, x1, y1, r1, stops) {
  if (FLASH) return C(stops[stops.length > 3 ? 3 : 1]);
  let g = key && GC.get(key);
  if (g) return g;
  g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return key ? cacheSet(key, g) : g;
}
/** 부드러운 발광 (가산 합성, 섬광 영향 없음) */
export function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0.01 || r < 1) return;
  const R = Math.max(4, Math.round(r / 4) * 4);
  const k = 'gl' + color + R;
  let g = GC.get(k);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, rgba(color, 0.95)); g.addColorStop(0.28, rgba(color, 0.42)); g.addColorStop(1, rgba(color, 0));
    cacheSet(k, g);
  }
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.translate(x, y); ctx.fillStyle = g; ctx.fillRect(-R, -R, R * 2, R * 2); ctx.translate(-x, -y);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 현재 경로: 외곽선 → 채우기 */
export function ink(ctx, fill, lw = 3, out = OUT) {
  ctx.lineJoin = 'round';
  if (lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = C(out); ctx.stroke(); }
  ctx.fillStyle = fill; ctx.fill();
}
/** 현재 경로 안쪽 가장자리에 림라이트 (x0 쪽이 밝고 x1 쪽으로 사라짐). 경로는 유지된다 */
export function rim(ctx, x0, x1, color = RIM, lw = 4, a = 0.8, y0 = 0, y1 = 0) {
  if (FLASH || a <= 0.01) return;
  ctx.save();
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  ctx.strokeStyle = g; ctx.lineWidth = lw * 2;
  ctx.stroke();
  ctx.restore();
}
/** 현재 경로를 반투명 가산 광택으로 칠함 (키라이트/하이라이트) */
export function sheen(ctx, x0, y0, x1, y1, color = WARM, a = 0.35) {
  if (FLASH || a <= 0.01) return;
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g; ctx.fill();
  ctx.globalCompositeOperation = op;
}
const _LX = new Float32Array(128), _LY = new Float32Array(128), _RX = new Float32Array(128), _RY = new Float32Array(128);
/** 폴리라인(pts=[x0,y0,x1,y1,...], n점)을 따라 폭이 w0→w1 로 변하는 닫힌 경로 (부드러운 곡선) */
export function taper(ctx, pts, n, w0, w1, wfn = null) {
  n = Math.min(n, 128);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const u = n > 1 ? i / (n - 1) : 0;
    const w = (wfn ? wfn(u) : lerp(w0, w1, u)) / 2;
    const x = pts[i * 2], y = pts[i * 2 + 1];
    _LX[i] = x - ty * w; _LY[i] = y + tx * w; _RX[i] = x + ty * w; _RY[i] = y - tx * w;
  }
  ctx.beginPath();
  ctx.moveTo(_LX[0], _LY[0]);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(_LX[i], _LY[i], (_LX[i] + _LX[i + 1]) / 2, (_LY[i] + _LY[i + 1]) / 2);
  ctx.lineTo(_LX[n - 1], _LY[n - 1]);
  // 끝 둥글게
  const ex = pts[(n - 1) * 2], ey = pts[(n - 1) * 2 + 1];
  ctx.quadraticCurveTo(ex + (ex - pts[(n - 2) * 2]) * 0.5, ey + (ey - pts[(n - 2) * 2 + 1]) * 0.5, _RX[n - 1], _RY[n - 1]);
  for (let i = n - 2; i > 0; i--) ctx.quadraticCurveTo(_RX[i], _RY[i], (_RX[i] + _RX[i - 1]) / 2, (_RY[i] + _RY[i - 1]) / 2);
  ctx.lineTo(_RX[0], _RY[0]);
  ctx.closePath();
}
/** 부드러운 폴리라인(선) */
export function curve(ctx, pts, n) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[i * 2 + 2]) / 2, (pts[i * 2 + 1] + pts[i * 2 + 3]) / 2);
  ctx.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
}
/** 발광 눈 */
export function eye(ctx, x, y, r, color, a = 1, core = '#ffffff') {
  glow(ctx, x, y, r * 5, color, 0.8 * a);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, r * 1.25, r, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath(); ctx.arc(x + r * 0.15, y - r * 0.1, r * 0.45, 0, TAU); ctx.fill();
}
/** 바닥 그림자 */
export function shadow(ctx, x, y, rx, ry, a = 0.5) {
  if (a <= 0.01) return;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.fillStyle = rg(ctx, 'shd', 0, 0, 0, 0, 0, 1, [0, 'rgba(0,0,0,0.85)', 0.6, 'rgba(0,0,0,0.45)', 1, 'rgba(0,0,0,0)']);
  ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = ga;
}
/** 번개 줄기 (가산) */
export function bolt(ctx, x0, y0, x1, y1, color, w = 3, seed = 0, jag = 18) {
  const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 26));
  const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1;
  ctx.beginPath(); ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i++) {
    const u = i / n, o = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const off = ((o - Math.floor(o)) - 0.5) * jag * 2;
    ctx.lineTo(lerp(x0, x1, u) + nx / l * off, lerp(y0, y1, u) + ny / l * off);
  }
  ctx.lineTo(x1, y1);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, 0.35); ctx.lineWidth = w * 4; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w * 1.6; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.6; ctx.stroke();
  ctx.globalCompositeOperation = op;
}
const _FQ = new Float32Array(12);
/** 불꽃 혀 다발 (가산): (x,y) 에서 각도 a 방향으로 n 가닥, 길이 L */
export function flames(ctx, x, y, a, n, L, t, color, w0 = 8, seed = 0, color2 = null, alpha = 0.45) {
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const aa = a + (i - (n - 1) / 2) * 0.22, len = L * (0.6 + hash(i + seed) * 0.5) * (0.9 + 0.1 * Math.sin(t * 9 + i));
    let px = x, py = y;
    _FQ[0] = px; _FQ[1] = py;
    for (let j = 1; j < 5; j++) {
      const w = Math.sin(t * 7 + i * 1.7 + j + seed) * 0.25 * j / 4;
      px += Math.cos(aa + w) * len / 4; py += Math.sin(aa + w) * len / 4 - j * 1.5;
      _FQ[j * 2] = px; _FQ[j * 2 + 1] = py;
    }
    taper(ctx, _FQ, 5, w0, 0.5);
    ctx.fillStyle = rgba(color2 && i % 2 ? color2 : color, alpha); ctx.fill();
  }
  glow(ctx, x, y, L * 0.6, color, 0.35);
  ctx.globalCompositeOperation = op;
}
/** 파티클 옵션에서 undefined 값 제거 (Object.assign 으로 프리셋 색이 지워지지 않게) */
export function opt(o) { for (const k in o) if (o[k] === undefined) delete o[k]; return o; }
/** 결정론적 의사난수 (그리기용, 할당 없음) */
export function hash(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ───────────────────────── 예고(텔레그래프) ─────────────────────────
// type: 'line'(x0,y0→x1,y1, width) | 'column'(x, w, y0 위 ~ y1 바닥) | 'circle'(x,y,r 바닥 원) | 'ring'(x,y,r 공중)
//       'mark'(x,y 느낌표) | 'arc'(x,y 중심, r0~r1, a0~a1) | 'band'(x0~x1, y0~y1 가로 띠)
export class Telegraph extends Entity {
  constructor(o) {
    super(0, 0, 1, 1);
    this.kind = 'effect';
    Object.assign(this, { type: 'line', life: 0.8, color: '#ff2a3a', width: 26, z: 3, arrows: true }, o);
    this.maxLife = this.life;
    this.bbox();
  }
  bbox() {
    const o = this;
    switch (o.type) {
      case 'line': this.x = Math.min(o.x0, o.x1) - o.width; this.y = Math.min(o.y0, o.y1) - o.width; this.w = Math.abs(o.x1 - o.x0) + o.width * 2; this.h = Math.abs(o.y1 - o.y0) + o.width * 2; break;
      case 'band': this.x = o.x0; this.y = o.y0; this.w = o.x1 - o.x0; this.h = o.y1 - o.y0; break;
      case 'column': this.x = o.cx0 - o.cw; this.y = o.y0; this.w = o.cw * 2; this.h = o.y1 - o.y0; break;
      case 'arc': this.x = o.px - o.r1; this.y = o.py - o.r1; this.w = this.h = o.r1 * 2; break;
      case 'path': {
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let i = 0; i < o.pts.length; i += 2) { x0 = Math.min(x0, o.pts[i]); x1 = Math.max(x1, o.pts[i]); y0 = Math.min(y0, o.pts[i + 1]); y1 = Math.max(y1, o.pts[i + 1]); }
        this.x = x0 - o.width; this.y = y0 - o.width; this.w = x1 - x0 + o.width * 2; this.h = y1 - y0 + o.width * 2; break;
      }
      default: { const r = (o.r ?? 30) * 2.2; this.x = o.px - r; this.y = o.py - r; this.w = this.h = r * 2; }
    }
  }
  update(dt, world) {
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt; this.life -= dt;
    if (this.follow) { this.follow(this, dt, world); this.bbox(); }
    const own = this.owner;
    if (own && (own.dead || own.dying > 0)) { this.dead = true; return; }
    if (this.life <= 0) { this.dead = true; this.onEnd?.(this, world); }
  }
  draw(ctx) {
    const k = clamp(1 - this.life / this.maxLife, 0, 1);
    const blink = 0.55 + 0.45 * Math.sin(this.t * (10 + k * 26));
    const col = this.color;
    const fin = clamp(this.life / 0.12, 0, 1);
    ctx.save();
    ctx.globalAlpha *= fin;
    switch (this.type) {
      case 'line': {
        const dx = this.x1 - this.x0, dy = this.y1 - this.y0, L = Math.hypot(dx, dy) || 1, w = this.width;
        ctx.translate(this.x0, this.y0); ctx.rotate(Math.atan2(dy, dx));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(col, 0.1 + 0.12 * blink); ctx.fillRect(0, -w / 2, L, w);
        ctx.fillStyle = rgba(col, 0.28 + 0.3 * blink); ctx.fillRect(0, -w / 2, L * k, w);
        ctx.fillStyle = rgba(col, 0.9); ctx.fillRect(0, -w / 2, L, 2); ctx.fillRect(0, w / 2 - 2, L, 2);
        ctx.fillStyle = rgba('#ffffff', 0.5 + 0.5 * blink); ctx.fillRect(0, -1, L * k, 2);
        if (this.arrows) {
          ctx.strokeStyle = rgba(col, 0.75 * blink); ctx.lineWidth = 3;
          const off = (this.t * 260) % 44, hw = Math.min(w * 0.32, 14);
          ctx.beginPath();
          for (let x = off; x < L - 8; x += 44) { ctx.moveTo(x, -hw); ctx.lineTo(x + hw, 0); ctx.lineTo(x, hw); }
          ctx.stroke();
        }
        break;
      }
      case 'path': {
        const n = this.pts.length / 2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        curve(ctx, this.pts, n);
        ctx.strokeStyle = rgba(col, 0.12 + 0.14 * blink); ctx.lineWidth = this.width; ctx.stroke();
        ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 2; ctx.setLineDash([14, 10]); ctx.lineDashOffset = -this.t * 90; ctx.stroke();
        ctx.setLineDash([]);
        // 진행 표시 점
        const m = Math.min(n - 1, Math.floor(k * (n - 1)));
        glow(ctx, this.pts[m * 2], this.pts[m * 2 + 1], 26, col, 0.9);
        break;
      }
      case 'band': {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, this.y0, 0, this.y1);
        g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.5, rgba(col, 0.18 + 0.2 * blink)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.fillRect(this.x0, this.y0, this.x1 - this.x0, this.y1 - this.y0);
        ctx.fillStyle = rgba(col, 0.8 * blink);
        ctx.fillRect(this.x0, this.y0, this.x1 - this.x0, 2); ctx.fillRect(this.x0, this.y1 - 2, this.x1 - this.x0, 2);
        if (this.arrows) {
          const dir = this.dir ?? 1, my = (this.y0 + this.y1) / 2, hh = Math.min(16, (this.y1 - this.y0) * 0.3);
          ctx.strokeStyle = rgba(col, 0.8 * blink); ctx.lineWidth = 4;
          const off = (this.t * 300) % 60;
          ctx.beginPath();
          for (let x = this.x0 + off; x < this.x1; x += 60) { const xx = dir > 0 ? x : this.x1 - (x - this.x0); ctx.moveTo(xx, my - hh); ctx.lineTo(xx + dir * hh, my); ctx.lineTo(xx, my + hh); }
          ctx.stroke();
        }
        break;
      }
      case 'column': {
        const x = this.cx0, w = this.cw;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, this.y0, 0, this.y1);
        g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, 0.2 + 0.25 * blink));
        ctx.fillStyle = g; ctx.fillRect(x - w / 2, this.y0, w, this.y1 - this.y0);
        ctx.fillStyle = rgba(col, 0.5 * blink);
        ctx.fillRect(x - w / 2, this.y0, 2, this.y1 - this.y0); ctx.fillRect(x + w / 2 - 2, this.y0, 2, this.y1 - this.y0);
        ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x, this.y1 - 3, w * 0.55, 8, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.7 * blink); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, this.y1 - 3, w * 0.55 * (1.8 - k * 0.8), 8 * (1.8 - k * 0.8), 0, 0, TAU); ctx.stroke();
        break;
      }
      case 'circle': case 'ring': {
        const r = this.r ?? 40, flat = this.type === 'circle' ? 0.28 : 1;
        ctx.translate(this.px, this.py); ctx.scale(1, flat);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, rgba(col, 0.05)); g.addColorStop(0.8, rgba(col, 0.2 + 0.2 * blink)); g.addColorStop(1, rgba(col, 0.5));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 3 / Math.sqrt(flat); ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = 2 / Math.sqrt(flat);
        ctx.beginPath(); ctx.arc(0, 0, r * (2 - k), 0, TAU); ctx.stroke();
        if (this.type === 'ring') { ctx.beginPath(); ctx.moveTo(-r * 0.4, 0); ctx.lineTo(r * 0.4, 0); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.4); ctx.stroke(); }
        break;
      }
      case 'arc': {
        ctx.translate(this.px, this.py);
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(0, 0, this.r1, this.a0, this.a1, this.ccw ?? false); ctx.arc(0, 0, this.r0, this.a1, this.a0, !(this.ccw ?? false)); ctx.closePath();
        ctx.fillStyle = rgba(col, 0.12 + 0.18 * blink); ctx.fill();
        ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, lerp(this.r0, this.r1, k), this.a0, this.a1, this.ccw ?? false);
        ctx.strokeStyle = rgba('#ffffff', 0.7 * blink); ctx.lineWidth = 3; ctx.stroke();
        break;
      }
      case 'mark': {
        const s = (this.size ?? 1) * (1 + 0.25 * Math.max(0, 1 - this.t * 6));
        ctx.translate(this.px, this.py - Math.abs(Math.sin(this.t * 9)) * 6); ctx.scale(s, s);
        glow(ctx, 0, 0, 34, col, 0.8 * blink);
        ctx.fillStyle = OUT; ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(16, 6); ctx.lineTo(-16, 6); ctx.closePath();
        ctx.lineJoin = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = OUT; ctx.stroke();
        ctx.fillStyle = blink > 0.5 ? '#ffe070' : col; ctx.fill();
        ctx.fillStyle = OUT; ctx.fillRect(-2, -14, 4, 10); ctx.fillRect(-2, -1, 4, 4);
        break;
      }
    }
    ctx.restore();
  }
}

// ───────────────────────── 광선/사슬 (선분 판정) ─────────────────────────
// Beam: warn 초 동안 예고선 → active 초 동안 판정 → fade. follow(beam, dt, world) 로 끝점 갱신 가능.
// draw(ctx, beam, k, on) 로 모양 지정 (없으면 style 기본 모양)
export class Beam extends Entity {
  constructor(o) {
    super(0, 0, 1, 1);
    this.kind = 'hitbox';
    Object.assign(this, { warn: 0.6, active: 0.5, fade: 0.2, width: 28, color: '#b060ff', style: 'arcane', z: 6, mv: 1, element: null, type: 'mag', warnColor: null }, o);
    const b = this.owner;
    this.attack = { team: 'enemy', owner: b, stats: b?.stats, mv: this.mv, type: this.type, element: this.element, kb: this.kb ?? [300, -320], dir: 1, hitId: 'bm' + (++_hid), tags: ['projectile'] };
    this.fired = false;
    this.bbox();
  }
  bbox() { const w = this.width * 2; this.x = Math.min(this.x0, this.x1) - w; this.y = Math.min(this.y0, this.y1) - w; this.w = Math.abs(this.x1 - this.x0) + w * 2; this.h = Math.abs(this.y1 - this.y0) + w * 2; }
  get on() { return this.t >= this.warn && this.t < this.warn + this.active; }
  update(dt, world) {
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt;
    const own = this.owner;
    if (own && (own.dead || own.dying > 0)) { this.dead = true; return; }
    this.follow?.(this, dt, world);
    this.bbox();
    if (this.t >= this.warn && !this.fired) { this.fired = true; this.onFire?.(this, world); }
    if (this.on) {
      const p = world.player;
      if (p && !p.dead) {
        const hb = p.hurtbox();
        const cx = hb.x + hb.w / 2, cy = hb.y + hb.h / 2;
        const dx = this.x1 - this.x0, dy = this.y1 - this.y0, L2 = dx * dx + dy * dy || 1;
        const u = clamp(((cx - this.x0) * dx + (cy - this.y0) * dy) / L2, 0, 1);
        const qx = this.x0 + dx * u, qy = this.y0 + dy * u;
        const ex = Math.max(hb.x - qx, 0, qx - (hb.x + hb.w)), ey = Math.max(hb.y - qy, 0, qy - (hb.y + hb.h));
        if (ex * ex + ey * ey < (this.width * 0.42) ** 2) {
          this.attack.dir = Math.sign(dx) || 1;
          enemyStrike(world, hb, this.attack);
        }
      }
      this.tick?.(this, dt, world);
    }
    if (this.t > this.warn + this.active + this.fade) this.dead = true;
  }
  draw(ctx, world) {
    const t = this.t;
    ctx.save();
    if (t < this.warn) {
      const k = t / this.warn, blink = 0.5 + 0.5 * Math.sin(t * (14 + k * 30));
      const dx = this.x1 - this.x0, dy = this.y1 - this.y0, L = Math.hypot(dx, dy);
      ctx.translate(this.x0, this.y0); ctx.rotate(Math.atan2(dy, dx));
      ctx.globalCompositeOperation = 'lighter';
      const wc = this.warnColor || this.color;
      const w = this.width * (0.25 + 0.75 * k);
      ctx.fillStyle = rgba(wc, 0.08 + 0.16 * blink); ctx.fillRect(0, -w / 2, L, w);
      ctx.fillStyle = rgba(wc, 0.9); ctx.fillRect(0, -1, L, 2);
      ctx.fillStyle = rgba('#ffffff', 0.35 + 0.4 * blink); ctx.fillRect(0, -0.5, L * k, 1);
    } else {
      const k = t < this.warn + this.active ? 1 : clamp(1 - (t - this.warn - this.active) / this.fade, 0, 1);
      if (this.drawFn) this.drawFn(ctx, this, k);
      else drawBeamStyle(ctx, this, k);
    }
    ctx.restore();
  }
  lights(L) {
    if (this.t >= this.warn && this.t < this.warn + this.active + this.fade) {
      L.add(this.x1, this.y1, 120, this.color, 0.9);
      L.add((this.x0 + this.x1) / 2, (this.y0 + this.y1) / 2, 160, this.color, 0.7);
    }
  }
}
function drawBeamStyle(ctx, b, k) {
  const dx = b.x1 - b.x0, dy = b.y1 - b.y0, L = Math.hypot(dx, dy);
  ctx.translate(b.x0, b.y0); ctx.rotate(Math.atan2(dy, dx));
  ctx.globalCompositeOperation = 'lighter';
  const w = b.width * (0.6 + 0.4 * k) * (1 + 0.08 * Math.sin(b.t * 50));
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, rgba(b.color, 0)); g.addColorStop(0.3, rgba(b.color, 0.5 * k)); g.addColorStop(0.5, rgba('#ffffff', 0.95 * k)); g.addColorStop(0.7, rgba(b.color, 0.5 * k)); g.addColorStop(1, rgba(b.color, 0));
  ctx.fillStyle = g; ctx.fillRect(0, -w, L, w * 2);
  glow(ctx, 0, 0, w * 2.2, b.color, k);
  glow(ctx, L, 0, w * 1.6, b.color, k * 0.8);
}

// ───────────────────────── 확장 고리 (틈 있는 음파/통곡) ─────────────────────────
// gaps: [[중심각, 반폭], ...] 라디안 (0=오른쪽, +는 아래쪽). 틈으로 피한다.
export class RingWave extends Entity {
  constructor(o) {
    super(0, 0, 1, 1);
    this.kind = 'hitbox';
    Object.assign(this, { r: 20, speed: 320, maxR: 900, th: 16, color: '#ff4060', color2: '#ffffff', gaps: [], z: 6, mv: 0.9, element: null, style: 'sonic' }, o);
    const b = this.owner;
    this.attack = { team: 'enemy', owner: b, stats: b?.stats, mv: this.mv, type: 'mag', element: this.element, kb: [280, -300], dir: 1, hitId: 'rw' + (++_hid), tags: ['projectile'] };
    this.bbox();
  }
  bbox() { const r = this.r + this.th; this.x = this.px - r; this.y = this.py - r; this.w = this.h = r * 2; }
  inGap(a) {
    for (const g of this.gaps) { const d = Math.atan2(Math.sin(a - g[0]), Math.cos(a - g[0])); if (Math.abs(d) < g[1]) return true; }
    return false;
  }
  update(dt, world) {
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt;
    this.r += this.speed * dt;
    this.bbox();
    if (this.r > this.maxR) { this.dead = true; return; }
    const p = world.player;
    if (p && !p.dead && !this.harmless) {
      const hb = p.hurtbox();
      const cx = hb.x + hb.w / 2, cy = hb.y + hb.h / 2;
      const d = Math.hypot(cx - this.px, cy - this.py);
      if (Math.abs(d - this.r) < this.th + Math.min(hb.w, hb.h) * 0.35) {
        const a = Math.atan2(cy - this.py, cx - this.px);
        if (!this.inGap(a)) { this.attack.dir = Math.sign(cx - this.px) || 1; enemyStrike(world, hb, this.attack); }
      }
    }
  }
  draw(ctx) {
    const fade = clamp((this.maxR - this.r) / 140, 0, 1) * clamp(this.t * 8, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= fade;
    // 틈 사이 호들을 그림
    const gs = this.gaps.map((g) => [g[0] - g[1], g[0] + g[1]]).sort((a, b) => a[0] - b[0]);
    const segs = [];
    if (!gs.length) segs.push([0, TAU]);
    else for (let i = 0; i < gs.length; i++) { const a = gs[i][1], b = i + 1 < gs.length ? gs[i + 1][0] : gs[0][0] + TAU; if (b > a) segs.push([a, b]); }
    const wob = this.style === 'sonic' ? 3 : 5;
    for (const [a0, a1] of segs) {
      for (let k = 0; k < 3; k++) {
        const rr = this.r - k * this.th * 0.8 + Math.sin(this.t * 30 + k) * wob;
        if (rr <= 4) continue;
        ctx.beginPath(); ctx.arc(this.px, this.py, rr, a0, a1);
        ctx.strokeStyle = k === 0 ? rgba(this.color2, 0.9) : rgba(this.color, 0.55 - k * 0.15);
        ctx.lineWidth = k === 0 ? 3 : this.th * (1.2 - k * 0.3);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ───────────────────────── 지면 충격파/분출/낙하 ─────────────────────────
/** 지면을 따라 달리는 충격파 (점프로 회피). style: 'dust'|'fire'|'soul'|'blood'|'arcane'|'acid' */
export function groundWave(b, x, dir, o = {}) {
  const h = o.h ?? 46, floor = o.floor ?? b.floorY;
  const color = o.color ?? '#ffb060';
  return b.world.spawnProjectile({
    team: 'enemy', owner: b, x, y: floor - h / 2, vx: dir * (o.speed ?? 520), vy: 0, w: o.w ?? 34, h, life: o.life ?? 2.4, pierce: 99, collideWalls: true,
    color, color2: o.color2 ?? '#fff2c0', style: o.style ?? 'dust', light: { r: 90, color, i: 0.8 },
    onWall: (p) => { p.dead = true; },
    render: drawGroundWave,
    attack: { stats: b.stats, mv: o.mv ?? 0.9, kb: [320, -420], dir, element: o.element ?? null, type: o.type ?? 'phys' },
  });
}
function drawGroundWave(ctx, p, world) {
  const d = Math.sign(p.vx) || 1, h = p.h, w = p.w, t = p.t;
  ctx.scale(d, 1);
  ctx.globalCompositeOperation = 'lighter';
  const fl = 0.85 + 0.15 * Math.sin(t * 40);
  for (let i = 0; i < 3; i++) {
    const hh = h * (1.1 - i * 0.25) * fl, ww = w * (1.4 + i * 0.7);
    const g = ctx.createLinearGradient(-ww, 0, w * 0.4, 0);
    g.addColorStop(0, rgba(p.color, 0)); g.addColorStop(0.7, rgba(p.color, 0.45)); g.addColorStop(1, rgba(p.color2, 0.9 - i * 0.25));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-ww, h / 2);
    ctx.quadraticCurveTo(-ww * 0.2, h / 2 - hh * 1.1, w * 0.45, h / 2 - hh * 0.2 - 4);
    ctx.lineTo(w * 0.45, h / 2); ctx.closePath(); ctx.fill();
  }
  glow(ctx, 0, h * 0.3, h * 1.2, p.color, 0.6);
  // 부스러기/불꽃
  if (world && Math.random() < 0.5) {
    const type = { fire: 'fire', soul: 'soul', blood: 'blood', arcane: 'magic', acid: 'blood', dust: 'dust', ice: 'ice' }[p.style] || 'dust';
    world.fx.emit(type, p.cx - d * 10, p.bottom - 6, opt({ angle: -Math.PI / 2 - d * 0.5, spread: 0.5, speed: 160, color: p.style === 'acid' ? '#7cff5a' : undefined }));
  }
}
/**
 * 바닥 분출 기둥: delay 동안 경고 → life 동안 판정.
 * style: 'fire'|'soul'|'arcane'|'ice'|'blood'|'bone'|'hand'|'acid'|'thunder' , draw(ctx, hb, k) 로 교체 가능
 */
export function erupt(b, x, o = {}) {
  const w = o.w ?? 56, h = o.h ?? 190, floor = o.floor ?? b.floorY;
  const hb = new Hitbox({
    x: x - w / 2, y: floor - h, w, h, team: 'enemy', owner: b, delay: o.delay ?? 0.8, life: o.life ?? 0.45,
    color: o.color ?? '#ff7a2a', style: o.style ?? 'fire', drawFn: o.draw ?? null, fired: false, z: 6,
    attack: { owner: b, stats: b.stats, mv: o.mv ?? 1, type: o.type ?? 'mag', element: o.element ?? null, kb: [200, -620], dir: 1, tags: ['projectile'] },
    light: { r: 130, color: o.color ?? '#ff7a2a', i: 0 },
    render: drawEruption,
    tick: (h, world) => {
      if (!h.fired) {
        h.fired = true;
        h.light.i = 1;
        world.fx.burst(o.burst ?? 'fire', x, floor - 10, o.nfx ?? 10, opt({ speed: 260, angle: -Math.PI / 2, spread: 0.5, color: o.fxColor }));
        world.camera.shake(o.shake ?? 4, 0.15);
        if (o.sfx !== null) audio.sfx(o.sfx ?? 'fire', { vol: 0.5, pitch: rand(0.9, 1.1) });
        o.onFire?.(h, world);
      }
    },
  });
  b.world.add(hb);
  return hb;
}
function drawEruption(ctx, h, world) {
  const floor = h.y + h.h, cx = h.x + h.w / 2;
  if (h.owner && (h.owner.dying > 0)) { h.dead = true; return; }
  if (h.t < h.delay) {
    // 경고: 바닥 균열 + 빛기둥 암시
    const k = h.t / h.delay, blink = 0.5 + 0.5 * Math.sin(h.t * (14 + k * 30));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(0, floor - h.h * 0.6 * k, 0, floor);
    g.addColorStop(0, rgba(h.color, 0)); g.addColorStop(1, rgba(h.color, 0.25 + 0.3 * blink));
    ctx.fillStyle = g; ctx.fillRect(h.x, floor - h.h * 0.6 * k, h.w, h.h * 0.6 * k);
    ctx.strokeStyle = rgba(h.color, 0.9); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, floor - 2, h.w * 0.6, 7, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.6 * blink); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI - PI; ctx.moveTo(cx, floor - 2); ctx.lineTo(cx + Math.cos(a) * h.w * 0.7 * k, floor - 2 + Math.sin(a) * 6); }
    ctx.stroke();
    ctx.restore();
    if (Math.random() < 0.3 && world) world.fx.emit('dust', cx + rand(-h.w / 2, h.w / 2), floor - 4, { speed: 40, angle: -PI / 2 });
    return;
  }
  const k = clamp(h.life / h.maxLife, 0, 1);
  if (h.drawFn) { h.drawFn(ctx, h, k); return; }
  const rise = clamp((1 - k) * 6, 0, 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const hh = h.h * rise, x = cx, t = h.t;
  const g = ctx.createLinearGradient(0, floor - hh, 0, floor);
  g.addColorStop(0, rgba(h.color, 0)); g.addColorStop(0.3, rgba(h.color, 0.6 * k + 0.2)); g.addColorStop(1, rgba('#ffffff', 0.8 * k));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - h.w * 0.55, floor);
  for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(x - h.w * 0.5 * (1 - u * 0.6) + Math.sin(t * 30 + i * 2) * 5, floor - hh * u); }
  for (let i = 8; i >= 0; i--) { const u = i / 8; ctx.lineTo(x + h.w * 0.5 * (1 - u * 0.6) + Math.sin(t * 27 + i * 3) * 5, floor - hh * u); }
  ctx.closePath(); ctx.fill();
  glow(ctx, x, floor - hh * 0.4, h.w * 1.6, h.color, k);
  ctx.restore();
  if (world && Math.random() < 0.6) world.fx.emit(h.style === 'soul' ? 'soul' : h.style === 'arcane' ? 'magic' : h.style === 'ice' ? 'ice' : 'fire', x + rand(-h.w / 3, h.w / 3), floor - rand(0, hh), opt({ speed: 80, angle: -PI / 2, color: h.style === 'soul' || h.style === 'arcane' ? h.color : undefined }));
}
/**
 * 낙하물: 바닥에 예고 기둥 → delay 후 위에서 떨어짐. o.render 로 모양, o.onLand 로 착지 효과
 */
export function dropHazard(b, x, o = {}) {
  const top = o.top ?? b.floorY - 520, floor = o.floor ?? b.floorY;
  const tg = new Telegraph({
    type: 'column', cx0: x, cw: o.warnW ?? 44, y0: floor - (o.warnH ?? 220), y1: floor, life: o.delay ?? 0.8, color: o.warnColor ?? '#ff3040', owner: b, z: 2,
    onEnd: (tg, world) => {
      const pr = b.world.spawnProjectile({
        team: 'enemy', owner: b, x, y: top, vx: o.vx ?? 0, vy: o.speed ?? 700, w: o.w ?? 22, h: o.h ?? 30, life: 3, behavior: 'fall', gravity: o.gravity ?? 0.6, collideWalls: 'land', pierce: 1,
        render: o.render ?? 'bone', color: o.color ?? '#e8dcc0', spin: o.spin ?? 8, trail: o.trail ?? null, trailOpts: o.trailOpts, light: o.light ?? null,
        attack: { stats: b.stats, mv: o.mv ?? 0.8, kb: [160, -300], dir: 1, element: o.element ?? null, type: o.type ?? 'phys' },
        onLand: (p, world) => { p.dead = true; o.onLand?.(p, world); world.fx.burst(o.landFx ?? 'dust', p.cx, p.bottom - 4, 6, { speed: 120 }); },
        onExpire: (p, world, byHit) => { if (byHit) o.onLand?.(p, world); },
      });
      o.onSpawn?.(pr);
    },
  });
  b.world.add(tg);
  return tg;
}

// ───────────────────────── 기반 클래스 ─────────────────────────
export class ABoss extends Boss {
  init() {
    this.stats.mag = this.stats.atk;
    this.floorY = this.bottom;
    this.homeX = this.cx;
    this.cool = 0.6;
    this.last = null; this.last2 = null;
    this._pst = -1;
    this.A = { x0: 0, x1: 0, mid: 0, w: 0, floor: this.floorY, top: this.floorY - 420 };
    this.dropThrough = true;
    this.deathT = 0;
    this.phaseFx = 0;       // 페이즈 변신 연출 타이머
    this.rebuildOnRetry = true; // 페이즈 변형을 되돌리는 훅이 없음 → 플레이어 부활 시 world.resetBoss() 가 새로 생성
    this.updArena();
    this.setup?.();
    preloadPainted(this.def.id, this.world.game);   // 채색 렌더러가 등록된 보스면 굽기 시작 (등장 연출 뒤에서 끝남)
  }
  updArena() {
    const a = this.world.arena, A = this.A;
    A.x0 = a ? a.x0 : this.homeX - 660; A.x1 = a ? a.x1 : this.homeX + 660;
    A.mid = (A.x0 + A.x1) / 2; A.w = A.x1 - A.x0; A.floor = this.floorY; A.top = this.floorY - 420;
  }
  setState(s) { super.setState(s); this._pst = -1; this._sw = true; }
  /** 이번 프레임에 상태시간이 t 를 지났는가 (1회성 이벤트) */
  at(t) { return this._pst < t && this.stateT >= t; }
  /** 주기 이벤트: t0 부터 간격 iv 로 n 회 → 이번 프레임에 발생한 회차 index (없으면 -1) */
  every(t0, iv, n) {
    for (let i = 0; i < n; i++) { const t = t0 + i * iv; if (this._pst < t && this.stateT >= t) return i; }
    return -1;
  }
  get sp() { return 1 + this.phase * 0.14 + (this.inferno ? 0.18 : 0); }
  /** 비행체: 목표점으로 부드럽게 가속 */
  flyTo(tx, ty, k, maxSp, dt) {
    const dx = tx - this.cx, dy = ty - this.cy, d = Math.hypot(dx, dy) || 1;
    const sp = Math.min(maxSp, d * 3.2), a = Math.min(1, k * dt);
    this.vx += (dx / d * sp - this.vx) * a; this.vy += (dy / d * sp - this.vy) * a;
  }
  /** 페이즈 전환 공통 상태: onPhase 에서 this.setState('transform') */
  s_transform(dt, world, p) {
    this.invuln = true;
    this.vx *= 0.9; this.vy *= 0.9;
    this.transformTick?.(dt, world, p);
    if (this.stateT > (this.transformTime ?? 1.3)) { this.invuln = false; this.rest(0.35); }
  }
  think(dt, world) {
    this.updArena();
    if (this.phaseFx > 0) this.phaseFx -= dt;
    const p = this.player;
    if (!p) return;
    this._sw = false;
    const fn = this['s_' + this.state];
    if (fn) fn.call(this, dt, world, p);
    else if (this.state === 'intro') { this.onIntro?.(world); this.rest(0.6); }
    else this.rest(0.5);
    if (!this._sw) this._pst = this.stateT;
  }
  s_idle(dt, world, p) {
    this.idleMove?.(dt, world, p);
    this.cool -= dt * this.aggro;
    if (this.cool <= 0) this.decide();
  }
  /** 다음 패턴 선택: moves() = [[이름, 가중치], ...] */
  decide() {
    const all = this.moves().filter((m) => m[1] > 0);
    const list = all.length > 1 ? all.filter((m) => m[0] !== this.last) : all;
    let tot = 0; for (const m of list) tot += m[1];
    let r = Math.random() * tot, pick = list[list.length - 1]?.[0] ?? 'idle';
    for (const m of list) { r -= m[1]; if (r <= 0) { pick = m[0]; break; } }
    this.last2 = this.last; this.last = pick;
    this.setState(pick);
  }
  /** 휴식 후 다음 패턴 */
  rest(t = 1) { this.cool = t / this.sp; this.setState('idle'); }

  // ── 연출 도우미 ──
  get fx() { return this.world.fx; }
  shake(m, t = 0.3) { this.world.camera.shake(m, t); }
  impact(x, y, mag = 10, stop = 0.05, color = '#ffd8a0') {
    const w = this.world;
    this.shake(mag, 0.4);
    if (stop > 0) w.hitstop = Math.max(w.hitstop, stop);
    w.fx.ring(x, y, { color, r0: 10, r1: 90 + mag * 6, life: 0.35, width: 7 });
    w.fx.flash(x, y, { color, size: 90 + mag * 5, life: 0.16 });
    w.fx.burst('dust', x, y - 6, 14, { speed: 200, angle: -PI / 2, spread: 1.3 });
  }
  warn(o) { return this.world.add(new Telegraph({ owner: this, ...o })); }
  warnLine(x0, y0, x1, y1, life = 0.7, o = {}) { return this.warn({ type: 'line', x0, y0, x1, y1, life, ...o }); }
  warnMark(x, y, life = 0.6, o = {}) { return this.warn({ type: 'mark', px: x, py: y, life, z: 9, ...o }); }
  warnCircle(x, y, r, life = 0.7, o = {}) { return this.warn({ type: 'circle', px: x, py: y, r, life, ...o }); }
  beam(o) { return this.world.add(new Beam({ owner: this, ...o })); }
  ring(o) { return this.world.add(new RingWave({ owner: this, ...o })); }
  /** 소환: 최대 수 제한 */
  summon(id, x, y, max = 4, o = {}) {
    let n = 0;
    for (const e of this.world.entities) if (e.summoner === this && !e.dead && !(e.dying > 0)) n++;
    if (n >= max) return null;
    const e = this.world.spawnEnemy?.(id, x, y, { elite: false, facing: o.facing ?? -1, params: o.params });
    if (!e) return null;
    e.summoner = this;
    this.fx.burst(o.fx ?? 'dark', x, y - (e.h ?? 30) / 2, 12, { speed: 120 });
    this.fx.ring(x, y - (e.h ?? 30) / 2, { color: o.color ?? '#b060ff', r0: 6, r1: 60, life: 0.35, width: 4 });
    return e;
  }
  minionCount() { let n = 0; for (const e of this.world.entities) if (e.summoner === this && !e.dead && !(e.dying > 0)) n++; return n; }

  // ── 사망 ──
  onDeath(world) {
    for (const e of world.entities) {
      if (e === this) continue;
      if (e.owner === this && (e.kind === 'projectile' || e.kind === 'hitbox' || e.kind === 'effect')) e.dead = true;
      else if (e.summoner === this && !e.dead) {
        e.dead = true;
        world.fx.burst('fire', e.cx, e.cy, 8, { speed: 140 });
        world.fx.burst('ember', e.cx, e.cy, 6, { speed: 120 });
      }
    }
    this.vx = 0; this.vy = 0;
    this.deathT = 0;
    this.deathStart?.(world);
  }
  update(dt, world) {
    // 시간 정지(스톱워치) 중에는 패턴 시계도 느리게 (기본 Boss.update 는 stateT 를 실시간으로 올린다)
    if (world.timeStop > 0 && this.dying <= 0) { const k = dt * 0.75; this.stateT -= k; this.t -= k; }
    if (this.dying > 0) {
      this.deathT += dt;
      const before = this.deathT - dt;
      // 연쇄 폭발
      const iv = 0.16;
      if (Math.floor(this.deathT / iv) !== Math.floor(before / iv)) {
        const pt = this.deathPoint ? this.deathPoint() : { x: this.cx + rand(-this.w / 2, this.w / 2), y: this.cy + rand(-this.h / 2, this.h / 2) };
        world.fx.flash(pt.x, pt.y, { color: this.def.deathColor ?? '#ffb070', size: 90, life: 0.18 });
        world.fx.ring(pt.x, pt.y, { color: this.def.deathColor ?? '#ffb070', r0: 6, r1: 70, life: 0.3, width: 5 });
        world.fx.burst('fire', pt.x, pt.y, 8, { speed: 220 });
        world.fx.burst('ember', pt.x, pt.y, 6, { speed: 240 });
        this.shake(6, 0.2);
        audio.sfx('explode', { vol: 0.6, pitch: rand(0.8, 1.2) });
        if (this.debrisPiece && Math.random() < 0.7) this.spawnDebris(world, pt.x, pt.y, 1);
      }
      if (before < 2.0 && this.deathT >= 2.0) {
        // 최종 폭발
        world.fx.flash(this.cx, this.cy, { color: '#ffffff', size: 320, life: 0.4 });
        world.fx.ring(this.cx, this.cy, { color: this.def.deathColor ?? '#ffb070', r0: 20, r1: 340, life: 0.6, width: 12 });
        world.fx.ring(this.cx, this.cy, { color: '#ffffff', r0: 10, r1: 220, life: 0.45, width: 6 });
        world.fx.burst('fire', this.cx, this.cy, 40, { speed: 420, jitter: this.w * 0.3 });
        world.fx.burst(this.def.deathFx ?? 'ember', this.cx, this.cy, 36, { speed: 360 });
        this.shake(18, 0.8);
        world.game.flash?.('#ffffff', 0.7, 3);
        audio.sfx('explode', { vol: 1, pitch: 0.6 });
        if (this.debrisPiece) this.spawnDebris(world, this.cx, this.cy, 12);
        this.deathFinal?.(world);
      }
      this.deathTick?.(dt, world);
    }
    super.update(dt, world);
    paintedTick(this, world);
  }
  /** 채색 렌더러가 준비됐으면 그쪽(컬링 대리 개체)이 그린다 — 아니면 기존 벡터 그리기 */
  draw(ctx, world) {
    const pd = paintedDraw(this, ctx, world);   // true = 채색만, 0<k<1 = 벡터→채색 교차 페이드 중
    if (pd === true) return;
    if (pd) { ctx.save(); ctx.globalAlpha *= 1 - pd; super.draw(ctx, world); ctx.restore(); return; }
    super.draw(ctx, world);
  }
  spawnDebris(world, x, y, n) {
    if (!world.debrisList) return;
    for (let i = 0; i < n; i++) {
      const piece = this.debrisPiece(i);
      world.debrisList.push(new Debris(x + rand(-20, 20), y + rand(-20, 20), rand(-340, 340), rand(-700, -250), { size: piece.size ?? 12, draw: piece.draw, color: piece.color, life: rand(2.2, 3.4), bounce: 0.35 }));
    }
  }
  lights(L) {
    if (this.dying > 0) { L.add(this.cx, this.cy, 260, this.def.deathColor ?? '#ffb070', 1); return; }
    super.lights(L);
    this.extraLights?.(L);
  }
  /** 페이즈 변신 공통 연출 */
  phaseBurst(color, text) {
    const w = this.world;
    this.phaseFx = 1.2;
    w.fx.ring(this.cx, this.cy, { color, r0: 20, r1: 260, life: 0.7, width: 10 });
    w.fx.ring(this.cx, this.cy, { color: '#ffffff', r0: 10, r1: 160, life: 0.45, width: 5 });
    w.fx.flash(this.cx, this.cy, { color, size: 300, life: 0.3 });
    w.fx.burst('ember', this.cx, this.cy, 30, { speed: 320, color });
    w.camera.punchZoom?.(1.08, 0.35);
    w.slowmo = Math.max(w.slowmo, 0.35);
    if (text) w.fx.text(this.cx, this.y - 30, text, { color, size: 26, life: 1.6, vy: -40 });
  }
}
