// 보스 B 공용 도구: 기반 클래스(BossB), 위험 지대(Zone), 선분 판정, 그리기 도우미(발광 스프라이트/그라디언트 캐시/경고 표시)
// 모든 b_*.js 보스가 사용한다. 좌표는 월드 px. 그리기 규칙: 뒤쪽 차가운 림라이트 + 앞/위 따뜻한 키라이트, 어두운 외곽선.
import { Boss } from './boss.js';
import { Entity } from '../entity.js';
import { enemyStrike } from '../combat.js';
import { isSolidType } from '../../core/physics.js';
import { TILE } from '../../core/game.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, rand, rgba } from '../../core/math.js';
import { ENEMIES } from '../../data/enemies.js';

export const PI = Math.PI;
export const OUT = '#07040c';     // 외곽선
export const RIM = '#a8c0ff';     // 차가운 역광
export const WARM = '#ffd9a0';    // 따뜻한 키라이트
export const EL = { holy: '#fff2b0', fire: '#ff7a2a', ice: '#9fe8ff', dark: '#b060ff', thunder: '#bfe0ff', blood: '#ff2a3a', soul: '#7dffb0', water: '#6fd8ff', gold: '#e8c872' };

// ───────────────────────── 피격 섬광 모드 ─────────────────────────
/** R.fl = true 인 동안 C()/그라디언트는 흰색을 돌려준다 (피격 섬광 덧그리기용) */
export const R = { fl: false };
export const C = (c) => (R.fl ? '#ffffff' : c);

// ───────────────────────── 그라디언트 캐시 (지역 좌표 고정용) ─────────────────────────
const GC = new Map();
export function LG(ctx, key, x0, y0, x1, y1, stops) {
  if (R.fl) return '#ffffff';
  let g = GC.get(key);
  if (!g) {
    g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    GC.set(key, g);
  }
  return g;
}
export function RG(ctx, key, x0, y0, r0, x1, y1, r1, stops) {
  if (R.fl) return '#ffffff';
  let g = GC.get(key);
  if (!g) {
    g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    GC.set(key, g);
  }
  return g;
}

// ───────────────────────── 발광 스프라이트 (색상별 1회 생성) ─────────────────────────
const GLOWS = new Map();
function makeCanvas(w, h) {
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
export function glowSprite(color, core = true) {
  const key = color + (core ? '1' : '0');
  let c = GLOWS.get(key);
  if (!c) {
    c = makeCanvas(64, 64);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (core) { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, rgba(color, 0.95)); }
    else gr.addColorStop(0, rgba(color, 0.9));
    gr.addColorStop(0.45, rgba(color, 0.35));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    GLOWS.set(key, c);
  }
  return c;
}
/** 가산 발광 원 (저비용) */
export function glow(ctx, x, y, r, color, a = 1, core = false) {
  if (R.fl || a <= 0.01 || r <= 0.5) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.drawImage(glowSprite(color, core), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 타원형 발광 */
export function glowE(ctx, x, y, rx, ry, color, a = 1, core = false) {
  if (R.fl || a <= 0.01) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.drawImage(glowSprite(color, core), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
/** 발광 눈동자 (코어 + 번짐) */
export function eye(ctx, x, y, r, color, a = 1) {
  if (R.fl) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); return; }
  glow(ctx, x, y, r * 5, color, 0.55 * a);
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha *= a;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha /= a || 1;
}
/** 외곽선 + 채우기 (현재 경로) */
export function ink(ctx, fill, lw = 2.5, out = OUT) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (!R.fl) { ctx.strokeStyle = out; ctx.lineWidth = lw; ctx.stroke(); }
  ctx.fillStyle = fill; ctx.fill();
}
/** 바닥 그림자 */
export function floorShadow(ctx, x, y, rx, a = 0.45) {
  if (R.fl) return;
  ctx.save();
  ctx.translate(x, y); ctx.scale(1, 0.22);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
  ctx.restore();
}

// ───────────────────────── 투사체 그리기 (캐시 스프라이트 사용) ─────────────────────────
/** 발광 구체 탄: 색/크기 지정 렌더 함수 생성 */
export function orbRender(color, k = 1, coreCol = '#ffffff') {
  return (ctx, p) => {
    const r = Math.max(p.w, p.h) * 0.5 * k;
    glow(ctx, 0, 0, r * 3.2, color, 0.85);
    ctx.fillStyle = coreCol; ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.fill();
  };
}
/** 길쭉한 탄 (진행 방향으로 늘어남) */
export function streakRender(color, len = 2.6) {
  return (ctx, p) => {
    const a = Math.atan2(p.vy, p.vx);
    const r = Math.max(p.w, p.h) * 0.5;
    ctx.rotate(a);
    glowE(ctx, -r * len * 0.5, 0, r * len * 1.6, r * 1.9, color, 0.8);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.55, 0, 0, TAU); ctx.fill();
  };
}

// ───────────────────────── 경고(텔레그래프) 표시 ─────────────────────────
/** 사각 경고: k=0→1 진행, 테두리 펄스 + 사선 */
export function warnRect(ctx, x, y, w, h, k, color = '#ff3040', t = 0) {
  if (R.fl) return;
  const pulse = 0.5 + 0.5 * Math.sin(t * 24);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(color, 0.07 + 0.16 * k);
  ctx.fillRect(x, y, w, h);
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = rgba(color, 0.12 + 0.18 * k);
  ctx.lineWidth = 6;
  const off = (t * 90) % 28;
  ctx.beginPath();
  for (let i = -h; i < w + h; i += 28) { ctx.moveTo(x + i + off, y + h); ctx.lineTo(x + i + off + h, y); }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(color, 0.35 + 0.5 * k * pulse);
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.restore();
}
/** 선 경고: 조준선 */
export function warnLine(ctx, x0, y0, x1, y1, k, color = '#ff3040', width = 2) {
  if (R.fl) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, 0.18 + 0.3 * k);
  ctx.lineWidth = width * (1 + k * 5);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.25 + 0.6 * k);
  ctx.lineWidth = Math.max(1, width * 0.6);
  ctx.setLineDash([14, 10]); ctx.lineDashOffset = -k * 80;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.restore();
}
/** 바닥 균열 경고 (분출 예고): x 중심, w 폭 */
export function warnFloor(ctx, x, floor, w, k, color = '#ff5030', t = 0) {
  if (R.fl) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowE(ctx, x, floor, w * 0.75, 10 + 24 * k, color, 0.35 + 0.5 * k);
  ctx.strokeStyle = rgba(color, 0.5 + 0.5 * k);
  ctx.lineWidth = 1.5 + 2 * k;
  ctx.beginPath();
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 2;
    const s = Math.sin(i * 12.9898 + x * 0.01) * 0.5;
    ctx.moveTo(x + a * w * 0.1, floor);
    ctx.lineTo(x + a * w * 0.28 + s * 8, floor - 3);
    ctx.lineTo(x + a * w * 0.5 * (0.6 + 0.4 * k), floor - 1 + s * 2);
  }
  ctx.stroke();
  // 솟는 입자 기둥 암시
  const hh = 14 + 60 * k;
  const g = ctx.createLinearGradient(0, floor, 0, floor - hh);
  g.addColorStop(0, rgba(color, 0.35 * k + 0.1)); g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - w * 0.45, floor - hh, w * 0.9, hh);
  ctx.restore();
}
/** 원형 경고 (조준 원) */
export function warnCircle(ctx, x, y, r, k, color = '#ff3040', t = 0) {
  if (R.fl) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(color, 0.3 + 0.6 * k);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([6, 8]); ctx.lineDashOffset = t * 40;
  ctx.beginPath(); ctx.arc(x, y, r * (1.4 - 0.4 * k), 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = rgba(color, 0.06 + 0.14 * k);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}
/** 큰 느낌표 경고 */
export function warnBang(ctx, x, y, s, a = 1, color = '#ff3a40') {
  if (R.fl || a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  glow(ctx, x, y, s * 2.4, color, 0.6);
  ctx.translate(x, y);
  ctx.fillStyle = color; ctx.strokeStyle = '#1a0006'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-s * 0.9, s * 0.8); ctx.lineTo(0, -s * 0.95); ctx.lineTo(s * 0.9, s * 0.8); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(-s * 0.09, -s * 0.35, s * 0.18, s * 0.62);
  ctx.fillRect(-s * 0.09, s * 0.38, s * 0.18, s * 0.18);
  ctx.restore();
}

// ───────────────────────── 판정 도우미 ─────────────────────────
const _r = { x: 0, y: 0, w: 0, h: 0 };
/** 선분 판정: (x0,y0)→(x1,y1), 두께 th. 플레이어 적중 시 true */
export function lineStrike(world, attack, x0, y0, x1, y1, th) {
  const p = world.player;
  if (!p || p.dead) return false;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const step = Math.max(8, th * 0.7);
  const n = Math.max(1, Math.ceil(len / step));
  // 빠른 거절: 선분 경계 상자
  const hb = p.hurtbox();
  const minX = Math.min(x0, x1) - th, maxX = Math.max(x0, x1) + th, minY = Math.min(y0, y1) - th, maxY = Math.max(y0, y1) + th;
  if (hb.x > maxX || hb.x + hb.w < minX || hb.y > maxY || hb.y + hb.h < minY) return false;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    _r.x = x0 + (x1 - x0) * k - th / 2; _r.y = y0 + (y1 - y0) * k - th / 2; _r.w = th; _r.h = th;
    if (_r.x < hb.x + hb.w && _r.x + th > hb.x && _r.y < hb.y + hb.h && _r.y + th > hb.y) {
      return enemyStrike(world, { x: _r.x, y: _r.y, w: th, h: th }, attack);
    }
  }
  return false;
}
/** 원형 판정 (근사: 원에 내접하는 사각 + 십자) */
export function circleStrike(world, attack, x, y, r) {
  const p = world.player;
  if (!p || p.dead) return false;
  const hb = p.hurtbox();
  const px = clamp(x, hb.x, hb.x + hb.w), py = clamp(y, hb.y, hb.y + hb.h);
  if ((px - x) ** 2 + (py - y) ** 2 > r * r) return false;
  return enemyStrike(world, { x: px - 2, y: py - 2, w: 4, h: 4 }, attack);
}

// ───────────────────────── 위험 지대 (예고 → 판정 → 소멸) ─────────────────────────
let _zid = 0;
/**
 * new Zone(boss, { x,y,w,h, warn(예고 초), life(판정 초), mv, element, kb, rehit, paint(ctx,z,world), tick(z,world,dt),
 *   onStart(z,world), onEnd(z,world), rects(z)→[rect] | line:{x0,y0,x1,y1,th} (판정 형태), harmless, z, light(L,z) })
 * z.k = 예고 진행 0→1, z.a = 판정 진행 0→1, z.on = 판정 중
 */
export class Zone extends Entity {
  constructor(boss, o) {
    super(o.x ?? 0, o.y ?? 0, o.w ?? 10, o.h ?? 10);
    this.kind = 'hazard';
    this.boss = boss; this.world = boss.world;
    this.z = o.z ?? 6;
    this.warn = o.warn ?? 0; this.dur = o.life ?? 0.3;
    this.paint = o.paint; this.tick = o.tick; this.onStart = o.onStart; this.onEnd = o.onEnd; this.rects = o.rects; this.light = o.light;
    this.line = o.line ?? null; this.circle = o.circle ?? null;
    this.harmless = !!o.harmless;
    this.data = o.data ?? {};
    this.attack = { owner: boss, stats: boss.stats, mv: o.mv ?? 1, kb: o.kb ?? [300, -380], element: o.element ?? null, hitId: 'bz' + (++_zid), rehit: o.rehit, tags: ['boss'], ...(o.attack || {}) };
    this.k = 0; this.a = 0; this.on = false;
  }
  update(dt, world) {
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt;
    if (this.boss.dying > 0 || this.boss.dead) { this.dead = true; return; }
    this.k = this.warn > 0 ? clamp(this.t / this.warn, 0, 1) : 1;
    this.tick?.(this, world, dt);
    if (this.t < this.warn) { this.on = false; return; }
    if (!this.started) { this.started = true; this.onStart?.(this, world); }
    const lt = this.t - this.warn;
    this.a = clamp(lt / this.dur, 0, 1);
    if (lt >= this.dur) { this.dead = true; this.on = false; this.onEnd?.(this, world); return; }
    this.on = true;
    if (this.harmless) return;
    const p = world.player;
    if (!p) return;
    this.attack.dir = Math.sign(p.cx - (this.line ? (this.line.x0 + this.line.x1) / 2 : this.cx)) || 1;
    if (this.line) { const L = this.line; lineStrike(world, this.attack, L.x0, L.y0, L.x1, L.y1, L.th); }
    else if (this.circle) circleStrike(world, this.attack, this.circle.x, this.circle.y, this.circle.r);
    else if (this.rects) { for (const r of this.rects(this)) if (enemyStrike(world, r, this.attack)) break; }
    else enemyStrike(world, this, this.attack);
  }
  lights(L) { this.light?.(L, this); }
  draw(ctx, world) { if (this.paint) { ctx.save(); this.paint(ctx, this, world); ctx.restore(); } }
}

// ───────────────────────── 경기장 정보 ─────────────────────────
function solidAt(map, tx, ty) { return map && isSolidType(map.typeAt(tx, ty)); }
/** 경기장 좌우/바닥/천장 (맵에서 추정) */
export function arenaOf(world, boss) {
  const a = world.arena, map = world.map;
  const x0 = a?.x0 ?? boss.cx - 760, x1 = a?.x1 ?? boss.cx + 380;
  const cx = (x0 + x1) / 2;
  let floor = boss.bottom;
  if (map?.typeAt) {
    // 여러 지점에서 바닥 추정: 스폰 높이 근처에서 가장 가까운 '빈칸 위 고체' 경계
    const votes = new Map();
    for (let i = 1; i <= 7; i++) {
      const tx = Math.floor((x0 + (x1 - x0) * i / 8) / TILE);
      let ty = Math.floor((boss.bottom - 4) / TILE);
      if (solidAt(map, tx, ty)) { while (ty > 0 && solidAt(map, tx, ty - 1)) ty--; }
      else { let n = 0; while (n++ < 30 && !solidAt(map, tx, ty + 1) && ty < map.h) ty++; ty++; }
      if (ty > 0 && ty <= map.h) votes.set(ty, (votes.get(ty) ?? 0) + 1);
    }
    let best = null, bn = 0;
    for (const [ty, n] of votes) if (n > bn) { bn = n; best = ty; }
    if (best !== null) floor = best * TILE;
  }
  let top = 0;
  if (map?.typeAt) {
    const tx = Math.floor(cx / TILE);
    for (let ty = Math.floor(floor / TILE) - 2; ty >= 0; ty--) if (solidAt(map, tx, ty)) { top = (ty + 1) * TILE; break; }
  }
  return { x0, x1, w: x1 - x0, cx, floor, top, h: floor - top };
}

// ───────────────────────── 기반 클래스 ─────────────────────────
const OFF = { x: -99999, y: -99999, w: 1, h: 1 };
/**
 * BossB: Boss 확장.
 *  - 자체 시계 this.st (시간 정지 반영), at(t)/every(p,a,b) 이벤트 헬퍼, 지연 작업 later(t, fn)
 *  - 상태 메서드 s_<state>(dt, world, t) 자동 호출
 *  - 다중 판정: hitParts() → 플레이어와 가장 가까운 부위가 피격 판정 (부위별 방어 배율 defMul)
 *  - contactParts() → 접촉 피해 판정
 *  - 피격 섬광: paintBody() 를 흰색으로 가산 덧그림
 */
export class BossB extends Boss {
  init() {
    this.st = 0; this.pst = 0;
    this.jobs = [];
    this.lastAtk = null; this.atkCount = 0;
    this.baseDef = this.stats.def; this.baseRes = this.stats.res;
    this.A = arenaOf(this.world, this);
    this.hitPart = null;
    this.alpha = 1;
    this.setup?.();
  }
  setState(s) { super.setState(s); this.st = 0; this.pst = 0; }
  /** 이번 프레임에 시각 t 를 지났는가 */
  at(t) { return this.pst < t && this.st >= t; }
  /** [a,b] 구간에서 period 마다 true */
  every(period, a = 0, b = 1e9) {
    if (this.st < a || this.pst > b) return false;
    const i0 = Math.floor((this.pst - a) / period), i1 = Math.floor((this.st - a) / period);
    return i1 > i0 && this.st >= a;
  }
  later(t, fn) { this.jobs.push({ t, fn }); }
  clearJobs() { this.jobs.length = 0; }
  runJobs(dt) {
    if (!this.jobs.length) return;
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i];
      j.t -= dt;
      if (j.t <= 0) { this.jobs.splice(i, 1); j.fn(); }
    }
  }
  /** 가중치 선택 (직전 패턴 반복 회피). opts: [[name, weight], ...] */
  choose(opts) {
    let tot = 0;
    for (const o of opts) if (o[0] !== this.lastAtk && o[1] > 0) tot += o[1];
    let r = Math.random() * tot;
    for (const o of opts) {
      if (o[0] === this.lastAtk || !(o[1] > 0)) continue;
      r -= o[1];
      if (r <= 0) { this.lastAtk = o[0]; this.atkCount++; return o[0]; }
    }
    this.lastAtk = opts[0][0];
    return opts[0][0];
  }
  /** 공격 후 휴식 시간 (난이도/페이즈 반영) */
  restTime(base) { return base / (this.aggro * (1 + this.phase * 0.12) * (this.inferno ? 1.25 : 1)); }
  zone(o) { return this.world.add(new Zone(this, o)); }
  get P() { return this.world.player; }
  /** 플레이어 방향 (±1) */
  dirTo(x = this.cx) { const p = this.world.player; return p ? (Math.sign(p.cx - x) || 1) : this.facing; }

  think(dt, world) {
    this.pst = this.st; this.st += dt;
    this.runJobs(dt);
    this.tickB?.(dt, world);
    const f = this['s_' + this.state];
    if (f) f.call(this, dt, world, this.st);
    else this.setState('idle');
  }
  update(dt, world) {
    if (this.dying > 0) {
      this.t += dt; this.animT += dt;
      if (this.flashT > 0) this.flashT -= dt;
      this.dying -= dt;
      this.dyingTick?.(dt, world);
      if (this.dying <= 0) this.dead = true;
      return;
    }
    super.update(dt, world);
    if (this.world.cutscene) this.idleAnim?.(dt, world);
  }

  // ── 판정 ──
  hitParts() { return this.hurtboxes(); }
  contactParts() { return [{ x: this.x + 6, y: this.y + 6, w: this.w - 12, h: this.h - 12 }]; }
  hurtboxes() { return this.harmless ? [] : this.contactParts(); }
  hurtbox() {
    if (this.invuln) return OFF;
    const parts = this.hitParts();
    const p = this.world.player;
    let best = null, bd = Infinity;
    const px = p ? p.cx : this.cx, py = p ? p.cy : this.cy;
    for (const r of parts) {
      if (!r || r.off) continue;
      const dx = px - clamp(px, r.x, r.x + r.w), dy = py - clamp(py, r.y, r.y + r.h);
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = r; }
    }
    this.hitPart = best;
    const m = best?.defMul ?? 1;
    this.stats.def = Math.round(this.baseDef * m + (best?.defAdd ?? 0));
    this.stats.res = Math.round(this.baseRes * m + (best?.defAdd ?? 0));
    return best || OFF;
  }
  takeHit(dmg, attack, world, info) {
    const part = this.hitPart;
    const r = super.takeHit(dmg, attack, world, info);
    if (part?.onHit) part.onHit(part, dmg, attack, world);
    if (part?.armor && !r) { audio.sfx('clang', { vol: 0.5, pitch: rand(0.9, 1.1) }); world.fx.burst('spark', info?.hx ?? this.cx, info?.hy ?? this.cy, 6, { color: '#ffe0a0' }); }
    this.onHurt?.(dmg, attack, world, info, part);
    return r;
  }

  // ── 그리기 ──
  render(ctx, world) {
    ctx.globalAlpha *= this.alpha;
    this.paintBack?.(ctx, world);
    this.paintBody(ctx, world);
    if (this.flashT > 0 && this.dying <= 0) {
      R.fl = true;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.55;
      try { this.paintBody(ctx, world, true); } finally { R.fl = false; ctx.restore(); }
    }
    this.paintFront?.(ctx, world);
  }
  paintBody(ctx) { this.defaultRender(ctx, this.world); }
  lights(L) {
    if (this.def.light) L.add(this.cx, this.cy, this.def.light.r ?? 220, this.def.light.color ?? '#ff4060', this.def.light.i ?? 0.8);
    this.lightsB?.(L);
  }
}

/** 공용 화면 연출: 섬광 + 흔들림 + 번개 */
export function impact(world, { shake = 8, time = 0.3, flash = null, fa = 0.35, stop = 0, zoom = 0 } = {}) {
  world.camera.shake(shake * (world.game.settings?.screenShake ?? 1), time);
  if (flash) world.game.flash(flash, fa, 4);
  if (stop) world.hitstop = Math.max(world.hitstop, stop);
  if (zoom) world.camera.punchZoom?.(zoom, 0.2);
}
/** 정의된 첫 적 ID 를 소환 (없으면 null) */
export function trySpawn(world, ids, x, y, opts = {}) {
  for (const id of ids) {
    if (!ENEMIES[id]) continue;
    try { return world.spawnEnemy(id, x, y, opts); } catch (err) { console.warn('소환 실패', id, err); }
  }
  return null;
}

// ───────────────────────── 곡선/도형 ─────────────────────────
/** 점 배열(평면 Float32Array [x0,y0,x1,y1...])로 부드러운 닫힌 곡선 */
export function smoothClosed(ctx, P, n) {
  let px = (P[(n - 1) * 2] + P[0]) / 2, py = (P[(n - 1) * 2 + 1] + P[1]) / 2;
  ctx.moveTo(px, py);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (P[i * 2] + P[j * 2]) / 2, my = (P[i * 2 + 1] + P[j * 2 + 1]) / 2;
    ctx.quadraticCurveTo(P[i * 2], P[i * 2 + 1], mx, my);
  }
  ctx.closePath();
}
/** 점 배열 열린 곡선 */
export function smoothOpen(ctx, P, n) {
  ctx.moveTo(P[0], P[1]);
  for (let i = 1; i < n - 1; i++) {
    const mx = (P[i * 2] + P[i * 2 + 2]) / 2, my = (P[i * 2 + 1] + P[i * 2 + 3]) / 2;
    ctx.quadraticCurveTo(P[i * 2], P[i * 2 + 1], mx, my);
  }
  ctx.lineTo(P[(n - 1) * 2], P[(n - 1) * 2 + 1]);
}
/** 번개 선 (지그재그) */
export function boltPath(ctx, x0, y0, x1, y1, seg = 8, amp = 14, seed = 0) {
  ctx.moveTo(x0, y0);
  for (let i = 1; i < seg; i++) {
    const k = i / seg;
    const s = Math.sin(seed * 7.13 + i * 12.9898) * 43758.5453;
    const j = (s - Math.floor(s) - 0.5) * 2 * amp;
    const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
    ctx.lineTo(x0 + (x1 - x0) * k + nx / L * j, y0 + (y1 - y0) * k + ny / L * j);
  }
  ctx.lineTo(x1, y1);
}
/** 해시 기반 의사난수 0~1 */
export const hash = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
