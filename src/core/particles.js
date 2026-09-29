// 파티클 시스템: 타격 불꽃, 피, 먼지, 불씨, 연기, 마법 입자, 충격파 링, 데미지 숫자 등 (owner: FEEL-REACT)
// fx.burst('spark', x, y, 12, {color:'#ffd', speed:300})
// fx.text(x, y, '1234', {color:'#fff', size:22, crit:true})
// fx.ring(x, y, {color:'#f44', r0:10, r1:80, life:0.3})
// fx.slash(x, y, angle, {len, color}) 휘두르기 궤적
// fx.ghost(draw(ctx, alpha), life, layer) 잔상·타격 스프라이트 (impact.js 가 캐시 스프라이트를 이걸로 그린다)
// ── 손맛 확장 (feel.md §4.7, §4.8, §9 WP2) ──
// 프리셋: ecto(엑토플라즘) paper(종이 조각) gravel(자갈) goo(점액) bloodmist(피 안개) feather(깃털)
// 모양:   sprite(캐시 캔버스, 커졌다 사라짐) decal(바닥·벽 자국, 'back' 층) streak(속도선) ering(타원 고리)
//         dmg(아틀라스 숫자) callout(판정 문구 스프라이트) flake(팔랑이는 조각)
// fx.sprite(img, x, y, {size, angle, life, s0, s1, alpha, add, layer})
// fx.ering(x, y, {r0, r1, ry, angle, color, width, life})      fx.speedLine(x, y, angle, {len, width, color, life, speed})
// fx.dmg(target, value, styleKey, {x, y, color, style})        DNF 숫자 기둥 · 3타 이상 '합계' · 품질별 살아 있는 숫자 상한
// fx.callout(x, y, text, {color, size, life, vy, outline, skew}) 캐시 스프라이트 문구
// fx.addDecal(d, cap) / fx.clearDecals()                       자국 (hitfx.stampDecal 이 자리를 잡는다; 방 로딩 때 비움)
// fx.setHudBand(rects, n, cx)                                  HUD 윗줄 월드 사각형 (world.render 가 매 프레임): 숫자·문구를 그 아래로
//   숫자 기둥은 살아 있는 이웃 기둥과 숫자 폭만큼 비켜 서고, 판정 문구는 겹치는 기둥·문구 위 줄로 올라간다 (R1-REQ-331/358)
// update(dt, map) 는 그대로 (히트스톱 중에는 world 가 0.3배 dt 로 부른다)
import { rand, TAU, clamp } from './math.js';
import { TILE } from './game.js';
import { isSolidType } from './physics.js';
import * as HFX from '../render/hitfx.js';
import * as FH from '../data/feel_hit.js';

const PRESETS = {
  spark:  () => ({ shape: 'spark', life: rand(0.15, 0.35), speed: rand(180, 520), size: rand(2, 3.5), color: '#fff3c0', grav: 600, drag: 0.9, add: true }),
  hit:    () => ({ shape: 'spark', life: rand(0.1, 0.22), speed: rand(300, 700), size: rand(2.5, 4), color: '#ffffff', grav: 0, drag: 0.85, add: true }),
  blood:  () => ({ shape: 'circle', life: rand(0.4, 0.9), speed: rand(80, 320), size: rand(2, 4.5), color: '#9a0d1c', grav: 1300, drag: 0.98, collide: true }),
  dust:   () => ({ shape: 'smoke', life: rand(0.35, 0.7), speed: rand(20, 90), size: rand(6, 12), color: '#8a8074', grav: -40, drag: 0.92, alpha: 0.45 }),
  smoke:  () => ({ shape: 'smoke', life: rand(0.6, 1.3), speed: rand(10, 60), size: rand(10, 22), color: '#3a3440', grav: -60, drag: 0.95, alpha: 0.5 }),
  ember:  () => ({ shape: 'circle', life: rand(0.6, 1.4), speed: rand(30, 120), size: rand(1.2, 2.6), color: '#ff9a3a', grav: -120, drag: 0.97, add: true, flicker: true }),
  fire:   () => ({ shape: 'smoke', life: rand(0.25, 0.55), speed: rand(40, 140), size: rand(8, 16), color: '#ff7a1a', color2: '#ffd070', grav: -260, drag: 0.9, add: true }),
  magic:  () => ({ shape: 'star', life: rand(0.4, 0.8), speed: rand(40, 200), size: rand(2, 4), color: '#b98cff', grav: -40, drag: 0.93, add: true }),
  holy:   () => ({ shape: 'star', life: rand(0.4, 0.9), speed: rand(40, 220), size: rand(2, 4.5), color: '#fff2b0', grav: -80, drag: 0.93, add: true }),
  ice:    () => ({ shape: 'square', life: rand(0.4, 0.8), speed: rand(80, 260), size: rand(2, 4), color: '#bff4ff', grav: 700, drag: 0.96, add: true }),
  dark:   () => ({ shape: 'smoke', life: rand(0.4, 0.9), speed: rand(30, 120), size: rand(6, 14), color: '#5a1a7a', grav: -30, drag: 0.93, add: false, alpha: 0.7 }),
  thunder:() => ({ shape: 'spark', life: rand(0.1, 0.25), speed: rand(300, 800), size: rand(2, 3), color: '#bfe8ff', grav: 0, drag: 0.8, add: true }),
  shard:  () => ({ shape: 'square', life: rand(0.5, 1.1), speed: rand(120, 380), size: rand(3, 6), color: '#7a7470', grav: 1500, drag: 0.99, collide: true, bounce: 0.3 }),
  soul:   () => ({ shape: 'circle', life: rand(0.8, 1.5), speed: rand(20, 70), size: rand(2, 4), color: '#8affc8', grav: -90, drag: 0.96, add: true }),
  gold:   () => ({ shape: 'star', life: rand(0.3, 0.6), speed: rand(60, 160), size: rand(2, 3), color: '#ffd84a', grav: -30, drag: 0.9, add: true }),
  water:  () => ({ shape: 'circle', life: rand(0.4, 0.8), speed: rand(100, 300), size: rand(2, 3.5), color: '#7ec8ff', grav: 1400, drag: 0.99, collide: true, alpha: 0.8 }),
  // ── 손맛 재질 프리셋 (feel §4.7) ──
  ecto:   () => ({ shape: 'circle', life: rand(0.6, 1.1), speed: rand(40, 140), size: rand(3, 6), color: '#8affc8', grav: -60, drag: 0.94, add: true, wob: rand(24, 50), wf: rand(7, 12), wp: rand(0, TAU) }),
  paper:  () => ({ shape: 'flake', life: rand(0.8, 1.5), speed: rand(120, 300), size: rand(4, 7), color: '#e8e0c8', grav: 200, drag: 0.93, wob: rand(20, 40), wf: rand(4, 7), wp: rand(0, TAU) }),
  gravel: () => ({ shape: 'square', life: rand(0.5, 1.0), speed: rand(140, 360), size: rand(2.5, 5), color: '#8a8480', grav: 1500, drag: 0.99, collide: true, bounce: 0.35 }),
  goo:    () => ({ shape: 'circle', life: rand(0.5, 1.0), speed: rand(100, 300), size: rand(2.5, 5), color: '#6adf4a', grav: 1100, drag: 0.98, collide: true, alpha: 0.95 }),
  bloodmist: () => ({ shape: 'smoke', life: rand(0.5, 0.9), speed: rand(10, 50), size: rand(10, 18), color: '#5a0610', grav: -20, drag: 0.93, alpha: 0.4 }),
  feather: () => ({ shape: 'flake', feather: true, life: rand(1.0, 1.8), speed: rand(60, 180), size: rand(5, 8), color: '#2a2230', grav: 120, drag: 0.92, wob: rand(30, 60), wf: rand(3, 6), wp: rand(0, TAU) }),
};
export const PARTICLE_PRESETS = Object.keys(PRESETS);

const COL_DEF = { gap: 0.5, step: 16, height: 8, totalAfter: 3, totalDelay: 0.35 };
// 숫자 기둥 가로 비키기 (R1-REQ-331): 새 기둥은 살아 있는 이웃 기둥과 '숫자 폭'만큼 떨어져 선다 (필살기로 80px 간격의 적 무리를
// 한꺼번에 치면 '434' '98' '44' 가 '4349844' 로 붙어 보이던 문제). 폭은 지금 숫자와 5글자 숫자 중 넓은 쪽을 예약한다 (마지막 큰 타격).
const COL_LIVE = 1.3;      // 마지막 타격 뒤 이만큼(초)은 자리를 차지한 기둥으로 본다 (숫자 hold + 사라짐 + 합계)
const COL_GAP = 12;        // 이웃 기둥 사이 최소 여백 (px)
const COL_V = 170;         // 이보다 위아래로 떨어진 기둥은 겹치지 않는 것으로 본다 (px; 기둥 8줄 + 떠오름 + 합계 높이쯤)
const COL_RESERVE = 5;     // 기둥 폭 예약 (글자 수)
const COL_STEP_X = 10;     // 빈자리 찾기 간격 (px)
const COL_SPREAD = 4.5;    // 빈자리 찾기 범위: 대상에서 좌우로 (기둥 폭 + 여백) × 이 배수까지 (필살기가 끌어모은 적 무리도 기둥마다 자리가 나게)
/** 그리기용 결정적 잡음 0..1 (mulberry32 한 번): 그리기 경로에서 Math.random 을 쓰지 않는다 (R1-REQ-333) */
function hash01(n) {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const qKey = (q) => (q >= 0.95 ? 'high' : q >= 0.7 ? 'medium' : 'low');
const DMG_CAP = { high: 24, medium: 16, low: 10 };

export class Particles {
  constructor(max = 1400) {
    this.max = max;
    this.list = [];
    this.quality = 1; // 0.4~1: 저사양에서 수 감소
    this.decals = [];     // 자국 (방마다 상한, FIFO)
    this.clock = 0;       // 파티클 시계 (데미지 숫자 기둥 · 합계 타이밍)
    this.dmgLive = 0;     // 살아 있는 데미지 숫자 수
    this._cols = [];      // 합계를 기다리는 숫자 기둥
    this._live = [];      // 자리를 차지한 숫자 기둥 (가로 비키기·판정 문구 차선)
    this._obst = [];      // 판정 문구 배치용 장애물 사각형 (그리기마다 재사용)
    this._seq = 0;        // 숫자 떨림 잡음 씨앗
    // HUD 윗줄(초상·체력·점수·콤보·위쪽 보스 바)의 월드 좌표 사각형 — world.render 가 매 프레임 setHudBand 로 준다.
    // 숫자 기둥·판정 문구는 이 아래로 내려 그린다 (크게 뜬 치명타가 이름·체력 바 뒤에 숨지 않게, R1-REQ-331)
    this.band = { n: 0, r: [], stamp: 0 };
  }
  clear() { this.list.length = 0; this.decals.length = 0; this._cols.length = 0; this.dmgLive = 0; this._live.length = 0; }
  /**
   * HUD 윗줄 사각형을 월드 좌표로 넘긴다: rects = [{x0, x1, y0, y1}] (재사용 배열이어도 된다 — 값을 복사한다), n = 개수, cx = 화면 가운데 x,
   * hw = 화면 반폭 (월드 단위; 새 숫자 기둥을 화면 밖으로 비키지 않게).
   * n 0 = 끔 (HUD 숨김·연출). 그리기 층 'top' 을 그리기 직전에 부른다.
   */
  setHudBand(rects, n = rects?.length ?? 0, cx = null, hw = null) {
    const B = this.band;
    B.stamp++;
    B.n = 0;
    B.cx = cx;   // 화면 가운데 x (차선이 막힌 문구를 기둥의 어느 옆에 둘지)
    B.hw = hw;   // 화면 반폭 (월드 단위, 없으면 null): 새 숫자 기둥 자리를 화면 안에서 찾는다
    for (let i = 0; i < n; i++) {
      const s = rects[i];
      if (!s || !(s.x1 > s.x0) || !(s.y1 > s.y0)) continue;
      const d = (B.r[B.n] ??= { x0: 0, x1: 0, y0: 0, y1: 0 });
      d.x0 = s.x0; d.x1 = s.x1; d.y0 = s.y0; d.y1 = s.y1;
      B.n++;
    }
  }
  /** (x0..x1) 가로 범위가 HUD 윗줄 사각형과 겹치고 위끝 top 이 그 안(또는 위)에 있으면, 사각형 아래로 내려야 할 거리 (0 = 그대로) */
  bandPush(x0, x1, top) {
    const B = this.band;
    let push = 0;
    for (let i = 0; i < B.n; i++) {
      const r = B.r[i];
      if (x1 > r.x0 && x0 < r.x1 && top < r.y1 + 3) push = Math.max(push, r.y1 + 3 - top);
    }
    return push;
  }
  /** 자국만 비운다 (world.loadRoom) */
  clearDecals() { this.decals.length = 0; }

  emit(type, x, y, opts = {}) {
    if (this.list.length >= this.max) this.list.shift();
    const base = PRESETS[type] ? PRESETS[type]() : PRESETS.spark();
    const p = Object.assign(base, opts);
    const ang = opts.angle !== undefined ? opts.angle + rand(-(opts.spread ?? 0.5), opts.spread ?? 0.5) : rand(0, TAU);
    const sp = opts.speed !== undefined ? opts.speed * rand(0.6, 1.1) : base.speed;
    p.x = x; p.y = y;
    p.vx = (opts.vx ?? 0) + Math.cos(ang) * sp;
    p.vy = (opts.vy ?? 0) + Math.sin(ang) * sp;
    p.max = p.life;
    p.rot = rand(0, TAU); p.vr = opts.vr ?? rand(-8, 8);
    p.layer = opts.layer ?? 'front';
    this.list.push(p);
    return p;
  }
  burst(type, x, y, n, opts = {}) {
    const k = Math.max(1, Math.round(n * this.quality));
    for (let i = 0; i < k; i++) this.emit(type, x + rand(-(opts.jitter ?? 0), opts.jitter ?? 0), y + rand(-(opts.jitter ?? 0), opts.jitter ?? 0), opts);
  }
  ring(x, y, { color = '#fff', r0 = 8, r1 = 70, life = 0.3, width = 4, add = true, layer = 'front' } = {}) {
    this.list.push({ shape: 'ring', x, y, vx: 0, vy: 0, r0, r1, life, max: life, color, width, add, layer, grav: 0, drag: 1 });
  }
  /** 타원 고리 (벽 바운드: 세로 타원 angle π/2, 바닥 바운드: ry 0.3) */
  ering(x, y, { color = '#fff', r0 = 8, r1 = 70, ry = 0.35, angle = 0, life = 0.3, width = 4, add = true, layer = 'front' } = {}) {
    this.list.push({ shape: 'ering', x, y, vx: 0, vy: 0, r0, r1, ry, angle, life, max: life, color, width, add, layer, grav: 0, drag: 1 });
  }
  flash(x, y, { color = '#fff', size = 60, life = 0.12 } = {}) {
    this.list.push({ shape: 'flash', x, y, vx: 0, vy: 0, size, life, max: life, color, add: true, layer: 'front', grav: 0, drag: 1 });
  }
  slash(x, y, angle, { len = 90, width = 14, color = '#fff', life = 0.14, arc = 1.4, dir = 1, radius } = {}) {
    this.list.push({ shape: 'slash', x, y, vx: 0, vy: 0, angle, len, width, color, life, max: life, arc, dir, radius: radius ?? len, add: true, layer: 'front', grav: 0, drag: 1 });
  }
  /** 잔상: draw(ctx, alpha) 콜백을 수명 동안 호출 */
  ghost(draw, life = 0.25, layer = 'back') {
    this.list.push({ shape: 'ghost', x: 0, y: 0, vx: 0, vy: 0, draw, life, max: life, layer, grav: 0, drag: 1 });
  }
  text(x, y, str, { color = '#fff', size = 20, crit = false, life = 0.9, vy = -90, outline = '#200008', font } = {}) {
    this.list.push({ shape: 'text', x: x + rand(-8, 8), y, vx: rand(-20, 20), vy, str: String(str), color, size, crit, life, max: life, outline, font, layer: 'top', grav: 160, drag: 0.96 });
  }
  /** 캐시 캔버스 한 장: s0 → s1 배로 2프레임 안에 커졌다가 35% 지점부터 사라진다 (size = 긴 변 px) */
  sprite(img, x, y, { size = 60, angle = 0, life = 0.12, s0 = 0, s1 = 1.2, alpha = 1, add = true, layer = 'front', vx = 0, vy = 0, vr = 0 } = {}) {
    if (!img) return null;
    if (this.list.length >= this.max) this.list.shift();
    const p = { shape: 'sprite', img, x, y, vx, vy, rot: angle, vr, size, s0, s1, alpha, life, max: life, add, layer, grav: 0, drag: 1 };
    this.list.push(p);
    return p;
  }
  /** 속도선 (앞이 굵고 꼬리가 뾰족한 선, 속도 방향) */
  speedLine(x, y, angle, { len = 60, width = 3, color = '#ffffff', life = 0.18, speed = 600, add = true, layer = 'front' } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ shape: 'streak', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, len, size: width, color, life, max: life, add, layer, grav: 0, drag: 0.9 });
  }
  /** 자국 추가 (hitfx.stampDecal). cap 을 넘으면 가장 오래된 것부터 지운다 */
  addDecal(d, cap = 40) {
    if (!d?.img || !(cap > 0)) return null;
    d.max ??= d.life ?? 18; d.life ??= d.max; d.fade ??= 3;
    const D = this.decals;
    D.push(d);
    while (D.length > cap) D.shift();
    return d;
  }

  // ───────────────────────── 데미지 숫자 (feel §4.8) ─────────────────────────
  dmgCap() { return FH.BUDGET?.[qKey(this.quality)]?.dmgNums ?? DMG_CAP[qKey(this.quality)]; }
  recountDmg() { let n = 0; for (const p of this.list) if (p.shape === 'dmg') n++; this.dmgLive = n; return n; }
  /**
   * 데미지 숫자. styleKey = DMG_STYLE 키 (normal crit weak resist counter ult total hurt heal).
   * o = { x, y, color(숫자 색 덮어쓰기, null = 스타일 색), style(DMG_STYLE 항목) }.
   * 같은 대상에 0.5초 안에 이어진 숫자는 16px 씩 위로 쌓고(8칸 뒤 다시 아래), 3타 이상이면 마지막 타격 0.35초 뒤 '합계'.
   * 살아 있는 숫자가 품질 상한(24/16/10)이면 새 숫자는 그리지 않고 기둥 합계에만 더한다 (플레이어 피격 숫자는 항상 그림).
   */
  dmg(target, value, key = 'normal', o = {}) {
    const st = o.style ?? HFX.dmgStyle?.(key) ?? {};
    const C = FH.DMG_STYLE?.column ?? COL_DEF;
    const x = o.x ?? target?.cx ?? 0, y = o.y ?? target?.y ?? 0;
    const color = o.color ?? null;
    const lay = this.layoutDmg(value, key, st, color);
    let px = x, py = y, col = null;
    if (target && typeof target === 'object' && key !== 'hurt' && key !== 'heal' && key !== 'total') {
      const now = this.clock;
      col = target._dmgCol;
      const w = lay?.L ? lay.L.w : 12 * String(lay?.str ?? Math.round(Number(value) || 0)).length;   // 아틀라스가 없으면(L null: 글자 대체 경로) 대략 폭
      // 기둥이 꽉 찼으면(높이 8칸) 맨 아래 칸에 겹쳐 쓰지 않고 옆에 새 기둥을 세운다 (연타가 빠른 필살기에서 아직 선명한 숫자 위에 겹쳐 한 숫자로 읽히던 문제)
      if (!col || col.done || now - col.t > (C.gap ?? 0.5) || col.n + 1 >= (C.height ?? 8)) {
        const wr = Math.max(w, lay?.str?.length ? (w / lay.str.length) * COL_RESERVE : w);
        col = target._dmgCol = { n: 0, hi: 0, t: now, t0: now, total: 0, hits: 0, x: x, y, w: wr, gh: 0, done: false, queued: false, tp: null };
        col.x = this.colX(x, y, now, wr, col);
      } else col.n++;
      col.hi = Math.max(col.hi ?? 0, col.n);
      col.t = now; col.total += Number(value) || 0; col.hits++;
      if (w > (col.w ?? 0)) col.w = w;
      px = col.x; py = col.y - col.n * (C.step ?? 16);
      if (col.hits >= (C.totalAfter ?? 3) && !col.queued) { col.queued = true; this._cols.push(col); }
    }
    if (key !== 'hurt' && key !== 'total' && this.dmgLive >= this.dmgCap() && this.recountDmg() >= this.dmgCap()) return null;
    const p = this.spawnDmg(px, py, value, key, st, color, lay);
    if (p && col) {   // 기둥 숫자는 기둥과 함께 떠오른다 (간격 16px 유지)
      p.col = col; col.gh = Math.max(col.gh ?? 0, (p.A.h / p.A.k));
      col.until = Math.max(col.until ?? 0, this.clock + p.max);   // 이 숫자가 사라질 때까지 기둥 자리를 비워 두지 않는다
      if (p.tagAbove && p.A.tag) col.tagH = Math.max(col.tagH ?? 0, (p.A.tag[3] / p.A.k) * 0.72);   // 'CRITICAL' 같은 윗 꼬리표
    }
    return p;
  }
  /**
   * 새 숫자 기둥의 x (R1-REQ-331): 살아 있는 다른 기둥과 (두 기둥 폭의 반 + COL_GAP) 이상 떨어진, 대상에 가장 가까운 화면 안 자리.
   * 위아래로 COL_V 넘게 떨어진 기둥은 비키지 않는다. 좌우 (기둥 폭 + 여백) × COL_SPREAD 안에 빈자리가 없으면 겹침이 가장 적은 자리.
   * (예전: 22px 안에서 시작한 기둥만 ±26/±52px 비켰다 — 80px 떨어진 적들의 긴 숫자는 그대로 붙어 보였다)
   */
  colX(x, y, now, w = 40, self = null) {
    const S = this._live;
    let k = 0;
    // 숫자가 보이는 동안(until: 마지막 숫자의 수명 끝) · 합계를 기다리거나 '합계'가 떠 있는 동안 자리를 차지한다
    for (let i = 0; i < S.length; i++) { const c = S[i]; if (c !== self && (now < (c.until ?? c.t + COL_LIVE) || (c.queued && !c.done) || (c.tp && c.tp.life > 0))) S[k++] = c; }
    S.length = k;
    const nTry = 1 + 2 * Math.ceil(Math.max(w + 40, COL_SPREAD * (w + COL_GAP)) / COL_STEP_X);
    const B = this.band, view = B.hw > 0 && Number.isFinite(B.cx) && x > B.cx - B.hw && x < B.cx + B.hw;   // 대상이 화면 안이면 자리도 화면 안에서
    const vx0 = view ? B.cx - B.hw + w / 2 + 4 : -Infinity, vx1 = view ? B.cx + B.hw - w / 2 - 4 : Infinity;
    const xc = view && vx0 <= vx1 ? Math.min(vx1, Math.max(vx0, x)) : x;   // 화면 가장자리 대상의 숫자가 잘리지 않게 안쪽에서 시작
    let best = xc, bestCost = Infinity;
    for (let i = 0; i < nTry; i++) {
      const cx = xc + (i & 1 ? 1 : -1) * Math.ceil(i / 2) * COL_STEP_X;   // 0, +10, -10, +20, -20 …
      if (i > 0 && (cx < vx0 || cx > vx1)) continue;
      let cost = 0;
      for (const c of S) {
        if (Math.abs(c.y - y) > COL_V) continue;
        const need = (c.w + w) / 2 + COL_GAP, gap = Math.abs(c.x - cx);
        if (gap < need) cost += need - gap;
      }
      if (cost === 0) { best = cx; break; }
      if (cost < bestCost - 0.5) { bestCost = cost; best = cx; }
    }
    if (self) { S.push(self); if (S.length > 48) S.shift(); }
    return best;
  }
  /**
   * 새 '합계'가 이웃 기둥의 떠 있는 '합계'와 겹치면 한 줄씩 위로 올린다 (최대 3줄). 합계는 큰 글씨에 '합계' 글자가 왼쪽에 붙어
   * 기둥 예약 폭보다 넓다 — 같은 타수로 나란히 끝난 이웃 기둥의 합계가 한 숫자로 붙어 보이던 문제 (R1-REQ-331)
   */
  staggerTotal(tp) {
    const box = (q) => { const k = q.A.k, tw = q.A.tag ? q.A.tag[2] / k : 0; return [q.x - q.w / 2 - tw, q.x + q.w / 2 + 2, (q.A.h / k) * 0.8]; };
    const [a0, a1, ah] = box(tp);
    for (let tries = 0; tries < 3; tries++) {
      let hit = false;
      for (const o of this._live) {
        const q = o.tp;
        if (!q || q === tp || !(q.life > 0)) continue;
        const [b0, b1, bh] = box(q);
        if (a1 <= b0 || a0 >= b1) continue;
        // 두 합계는 같은 곡선으로 떠오르므로, 지금(d0)과 먼저 뜬 합계가 사라질 때(dE) 사이의 세로 거리를 본다
        // (지금만 보면: 먼저 뜬 합계가 이미 떠오른 만큼 비껴 보여도 나중 합계가 따라 올라와 같은 줄에서 겹쳤다)
        const d0 = (q.y - this.riseOf(q)) - tp.y, dE = (q.y - q.rise) - (tp.y - this.riseAt(tp, Math.max(0, q.life)));
        if ((d0 > 0) !== (dE > 0) || Math.min(Math.abs(d0), Math.abs(dE)) < (ah + bh) / 2) { hit = true; break; }
      }
      if (!hit) return;
      tp.y -= ah + 2;
    }
  }
  /** 기둥의 지금 위끝 (월드 y, HUD 비키기 전): 가장 높은 숫자와 '합계' 중 위쪽 */
  colTop(c) {
    const step = FH.DMG_STYLE?.column?.step ?? COL_DEF.step;
    const gh = c.gh || 24;
    let top = c.y - this.colRise(c, 40) - (c.hi ?? c.n) * step - gh / 2 - (c.tagH ?? 0);
    const T = c.tp;
    if (T && T.life > 0) top = Math.min(top, T.y - this.riseOf(T) - (T.A ? T.A.h / T.A.k : gh) / 2);
    return top;
  }
  /** 기둥 전체를 HUD 윗줄 아래로 내리는 거리 (그리기 프레임마다 한 번 계산) */
  colShift(c) {
    const B = this.band;
    if (!B.n) return 0;
    if (c._shS === B.stamp) return c._sh;
    const hw = (c.w || 40) / 2;
    c._shS = B.stamp;
    c._sh = this.bandPush(c.x - hw, c.x + hw, this.colTop(c));
    return c._sh;
  }
  /** 기둥에 붙지 않은 숫자의 떠오름 (px) */
  riseOf(p) { return this.riseAt(p, p.max - p.life); }
  /** 나이 age(초)일 때의 떠오름 (px) */
  riseAt(p, age) { const u = Math.min(1, age / Math.max(0.2, p.max)); return p.rise * (1 - (1 - u) * (1 - u) * (1 - u)); }
  /** 숫자 문자열·아틀라스·배치 → {A, str, L} | null (아틀라스 없음) */
  layoutDmg(value, key, st, color) {
    const A = HFX.digitAtlas?.(key, color && color !== st.color ? color : null);
    let str = HFX.fmtDmg ? HFX.fmtDmg(value) : String(Math.round(value));
    if (key === 'crit') str += '!';
    if (st.prefix === '+') str = '+' + str;
    if (!A) return { A: null, str, L: null };
    return { A, str, L: HFX.dmgLayout(A, str) };
  }
  /** 숫자 기둥이 지금까지 떠오른 높이 (첫 타격부터 0.6초에 걸쳐 rise px) */
  colRise(col, rise) { const u = Math.min(1, Math.max(0, (this.clock - col.t0) / 0.6)); return rise * (1 - (1 - u) * (1 - u) * (1 - u)); }
  spawnDmg(x, y, value, key, st, color, lay = null) {
    const { A, str, L } = lay ?? this.layoutDmg(value, key, st, color);
    if (!A) {
      this.text(x, y, str, { color: color ?? st.color ?? '#fff', size: st.size ?? 20, crit: key === 'crit', outline: st.outline ?? '#200008', vy: st.fall ? 60 : -90 });
      return null;
    }
    const hold = st.hold ?? 0.6, life = hold + 0.28;
    const p = {
      shape: 'dmg', x, y, vx: 0, vy: 0, grav: 0, drag: 1, life, max: life, layer: 'top', add: false,
      A, q: L.q, w: L.w, key, pop: st.pop ?? 1.35, popT: key === 'crit' || key === 'total' ? 0.1 : 0.07, rise: st.rise ?? 40,
      fall: !!st.fall, jit: st.jitter ?? 0, jitT: st.jitterT ?? (st.fall ? 0.3 : 0.1), hold,
      star: st.star ? HFX.star?.('#ffe080') : null, tagAbove: !!st.tag, jx: 0, jy: 0, sd: (this._seq = (this._seq + 1) | 0),
    };
    this.list.push(p);
    this.dmgLive++;
    return p;
  }
  /** 판정 문구 ('COUNTER' '가드!' '벽 바운드!' …): 캐시 스프라이트가 튀어나와 떠오르다 사라진다 */
  callout(x, y, text, o = {}) {
    const life = o.life ?? FH.CALLOUT?.life ?? 0.6;
    const spr = HFX.textSprite?.(text, o);
    if (!spr) { this.text(x, y, text, { color: o.color ?? '#ffe8c0', size: o.size ?? 15, life, vy: o.vy ?? -70, outline: o.outline ?? '#1a0610' }); return null; }
    // 자리(가로·세로 비키기)는 그릴 때 정한다 (layoutCallouts): 숫자 기둥·다른 문구와 겹치면 그 위 줄로 (R1-REQ-358)
    const p = { shape: 'callout', spr, x, y, vx: 0, vy: o.vy ?? FH.CALLOUT?.vy ?? -70, grav: 0, drag: 0.95, life, max: life, layer: 'top', add: false, dx: x, dy: y };
    this.list.push(p);
    return p;
  }

  update(dt, map) {
    this.clock += dt;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.shape === 'dmg' && this.dmgLive > 0) this.dmgLive--; L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += (p.grav || 0) * dt;
      const d = Math.pow(p.drag ?? 1, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.wob) p.x += Math.sin((p.max - p.life) * (p.wf ?? 8) + (p.wp ?? 0)) * p.wob * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.collide && map) {
        const tt = map.typeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
        if (isSolidType(tt)) {
          p.y -= p.vy * dt;
          if (p.bounce && (p.nb = (p.nb ?? 0) + 1) <= 2 && p.vy > 0) { p.vy *= -p.bounce; p.vx *= 0.6; p.vr = (p.vr ?? 0) * 0.5; }
          else { p.vy *= -0.2; p.vx *= 0.5; p.grav = 0; p.drag = 0.8; p.collide = false; }
        }
      }
    }
    // 자국 수명 (FIFO 순서를 지키도록 앞에서부터). 타일이 바뀌면(부서지는 벽·무너지는 발판) 붙어 있던 칸이 사라진 자국도 지운다
    const D = this.decals;
    if (D.length) {
      const mv = map?.version;
      const recheck = mv !== undefined && mv !== this._mapVer;
      if (recheck) this._mapVer = mv;
      let w = 0;
      for (let i = 0; i < D.length; i++) {
        const d = D[i]; d.life -= dt;
        if (recheck && d.atx !== undefined) { const t = map.typeAt(d.atx, d.aty); if (!isSolidType(t) && t !== 2) d.life = 0; }
        if (d.life > 0) D[w++] = d;
      }
      D.length = w;
    } else if (map?.version !== undefined) this._mapVer = map.version;
    // 숫자 기둥 합계
    const Cq = this._cols;
    // 설정에서 데미지 숫자를 끈 뒤(일시정지 메뉴)에는 기다리던 합계도 띄우지 않는다
    if (Cq.length && typeof window !== 'undefined' && window.__game?.settings?.showDamage === false) { for (const c of Cq) c.done = true; Cq.length = 0; }
    if (Cq.length) {
      const delay = FH.DMG_STYLE?.column?.totalDelay ?? COL_DEF.totalDelay;
      for (let i = Cq.length - 1; i >= 0; i--) {
        const c = Cq[i];
        if (this.clock - c.t < delay) continue;
        Cq.splice(i, 1);
        if (c.done) continue;
        c.done = true;
        const st = HFX.dmgStyle?.('total') ?? {};
        const step = FH.DMG_STYLE?.column?.step ?? COL_DEF.step;
        const top = c.y - (c.n + 1) * step - 8 - this.colRise(c, HFX.dmgStyle?.('normal')?.rise ?? 40);
        const tp = this.spawnDmg(c.x, top, c.total, 'total', st, null);
        if (tp) { tp.colRef = c; c.tp = tp; this.staggerTotal(tp); }   // 합계는 기둥과 함께 HUD 아래로 비킨다
      }
    }
  }

  drawDecals(ctx) {
    const D = this.decals;
    if (!D.length) return;
    ctx.globalCompositeOperation = 'source-over';
    for (const d of D) {
      const a = (d.alpha ?? 0.92) * (d.life < d.fade ? d.life / d.fade : 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      if (d.rot || d.flip) {
        ctx.save(); ctx.translate(d.x, d.y);
        if (d.rot) ctx.rotate(d.rot);
        if (d.flip) ctx.scale(-1, 1);
        ctx.drawImage(d.img, -d.w / 2, -d.h / 2, d.w, d.h);
        ctx.restore();
      } else ctx.drawImage(d.img, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h);
    }
  }

  /**
   * 판정 문구 배치 (그리기 층 'top' 마다 한 번, R1-REQ-358): 살아 있는 숫자 기둥(HUD 비키기 포함)과 먼저 놓인 문구를 장애물로 두고,
   * 겹치는 문구는 그 장애물 위끝 바로 위로 올린다 (기둥 위 차선). 올라가다 HUD 윗줄에 걸리면 그 아래로 되돌린다.
   * 결과는 p.dx / p.dy (그리기 위치; 실제 위치 p.x / p.y 는 그대로)
   */
  layoutCallouts() {
    const O = this._obst, now = this.clock;
    let n = 0;
    const put = (x0, x1, y0, y1) => { const r = (O[n] ??= { x0: 0, x1: 0, y0: 0, y1: 0 }); r.x0 = x0; r.x1 = x1; r.y0 = y0; r.y1 = y1; n++; };
    for (const c of this._live) {
      if (now - c.t > 1.0 && !(c.tp && c.tp.life > 0)) continue;
      const hw = (c.w || 40) / 2, sh = this.colShift(c), gh = c.gh || 24;
      put(c.x - hw, c.x + hw, this.colTop(c) + sh, c.y - this.colRise(c, 40) + gh / 2 + sh);
    }
    for (const p of this.list) {
      if (p.shape !== 'callout' || p.layer !== 'top') continue;
      const spr = p.spr;
      if (!spr?.canvas) continue;
      const age = p.max - p.life, k = age < 0.08 ? 1.45 - 0.45 * (age / 0.08) : 1;   // 튀어나오는 순간의 크기까지 (그리기와 같은 식)
      const hw = (spr.w * k) / 2 + 2, hh = (spr.h * k) / 2 + 1;
      // 후보 자리: 제자리, 그리고 가로로 겹치는 장애물마다 그 바로 위·바로 아래 (그리고 좌우로 한 칸씩 비킨 제자리).
      // HUD 윗줄에 걸리지 않고 아무 장애물과도 겹치지 않는 후보 중 제자리에서 가장 가까운 곳 (위쪽을 조금 더 선호)
      const free = (x, y) => {
        if (this.band.n && this.bandPush(x - hw, x + hw, y - hh) > 0) return false;
        for (let i = 0; i < n; i++) { const r = O[i]; if (x + hw > r.x0 && x - hw < r.x1 && y + hh > r.y0 && y - hh < r.y1) return false; }
        return true;
      };
      let X = p.x, Y = p.y, best = Infinity;
      const tryAt = (x, y) => {
        const c = Math.abs(y - p.y) * (y > p.y ? 1.5 : 1) + Math.abs(x - p.x) * 2;
        if (c < best && free(x, y)) { best = c; X = x; Y = y; }
      };
      tryAt(p.x, p.y);
      if (best > 0) {
        for (let i = 0; i < n; i++) {
          const r = O[i];
          if (!(p.x + hw > r.x0 && p.x - hw < r.x1)) continue;
          tryAt(p.x, r.y0 - hh - 1); tryAt(p.x, r.y1 + hh + 1);
        }
        tryAt(p.x - (hw * 2 + 4), p.y); tryAt(p.x + (hw * 2 + 4), p.y);
        if (best === Infinity) { X = p.x; Y = this.band.n ? p.y + this.bandPush(p.x - hw, p.x + hw, p.y - hh) : p.y; }   // 빈자리 없음: HUD 아래로만
      }
      p.dx = X; p.dy = Y;
      put(X - hw, X + hw, Y - hh, Y + hh);
    }
  }

  draw(ctx, layer = 'front') {
    if (layer === 'back') this.drawDecals(ctx);
    if (layer === 'top') this.layoutCallouts();
    let capD = -1;   // 'sprite' 최대 그리기 크기 (월드 단위, 처음 필요할 때 계산): 0.9 × √(캔버스 넓이) (요청 #414)
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      const t = 1 - p.life / p.max; // 0→1
      // 깜빡임은 그리기 전용 값 (수명·위치로 만든 잡음): 게임 진행용 Math.random 을 소비하지 않는다 (렌더 빈도가 보스 AI 난수를 바꾸지 않게)
      const a = clamp((p.alpha ?? 1) * (p.life / p.max) * 1.4, 0, 1) * (p.flicker ? 0.8 + 0.2 * Math.sin(p.life * 57 + (p.x + p.y) * 0.31) : 1);
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      switch (p.shape) {
        case 'circle': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, TAU); ctx.fill();
          break;
        }
        case 'square': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
          break;
        }
        case 'flake': {
          // 종이·깃털: 뒤집히며 팔랑인다 (폭이 cos 로 줄었다 늘었다)
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          const fl = Math.cos(p.rot * 1.6) || 0.05, s = p.size;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * 0.35); ctx.scale(fl, 1);
          if (p.feather) { ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.28, 0, 0, TAU); ctx.fill(); }
          else ctx.fillRect(-s / 2, -s * 0.36, s, s * 0.72);
          ctx.restore();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
          break;
        }
        case 'streak': {
          // 머리가 굵고 꼬리가 뾰족한 속도선 (회전 없이 꼭짓점 계산)
          const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
          const len = (p.len ?? sp * 0.05) * (1 - t * 0.4), hw = p.size / 2;
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(p.x - uy * hw, p.y + ux * hw);
          ctx.lineTo(p.x + ux * hw, p.y + uy * hw);
          ctx.lineTo(p.x + uy * hw, p.y - ux * hw);
          ctx.lineTo(p.x - ux * len, p.y - uy * len);
          ctx.closePath(); ctx.fill();
          break;
        }
        case 'star': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          const s = p.size * (1.2 - t * 0.6);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(0, -s * 2); ctx.lineTo(s * 0.5, -s * 0.5); ctx.lineTo(s * 2, 0); ctx.lineTo(s * 0.5, s * 0.5);
          ctx.lineTo(0, s * 2); ctx.lineTo(-s * 0.5, s * 0.5); ctx.lineTo(-s * 2, 0); ctx.lineTo(-s * 0.5, -s * 0.5);
          ctx.closePath(); ctx.fill(); ctx.restore();
          break;
        }
        case 'smoke': {
          const r = p.size * (0.6 + t * 1.2);
          ctx.globalAlpha = a * 0.8;
          const col = p.color2 && t < 0.4 ? p.color2 : p.color;
          const img = HFX.soft?.(col);
          if (img) ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
          else {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
          }
          break;
        }
        case 'ring': {
          const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(t);
          ctx.globalAlpha = (1 - t);
          ctx.strokeStyle = p.color; ctx.lineWidth = p.width * (1 - t) + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
          break;
        }
        case 'ering': {
          const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(t);
          ctx.globalAlpha = (1 - t);
          ctx.strokeStyle = p.color; ctx.lineWidth = p.width * (1 - t) + 1;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.5, r), Math.max(0.5, r * p.ry), p.angle ?? 0, 0, TAU); ctx.stroke();
          break;
        }
        case 'flash': {
          ctx.globalAlpha = 1 - t;
          const img = HFX.soft?.(p.color);
          if (img) ctx.drawImage(img, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          else {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          }
          break;
        }
        case 'sprite': {
          const img = p.img, age = p.max - p.life, popT = 2 / 60;
          const k = age < popT ? p.s0 + (p.s1 - p.s0) * (age / popT) : p.s1 - (p.s1 - 1) * 0.4 * Math.min(1, (age - popT) / Math.max(0.01, p.max - popT));
          const al = p.alpha * (t < 0.35 ? 1 : Math.max(0, 1 - (t - 0.35) / 0.65));
          if (al <= 0.01 || k <= 0.001) break;
          const iw = img.width || 1, ih = img.height || 1, im = Math.max(iw, ih);
          let s = (p.size / im) * k;
          // 필살기 마무리의 큰 빛 스프라이트가 줌 연출과 겹쳐 화면 전체를 덮는 가산 블릿(전체 화면 패스, feel §8 예산)이 되지 않게
          // 그리는 크기를 화면 넓이의 0.81배 정사각형(16:9 에서 화면 높이의 1.2배)으로 제한한다 (요청 #414; 모양·위치는 그대로, 가장 큰 순간만 줄어든다)
          if (capD < 0) { let tf = null; try { tf = ctx.getTransform?.(); } catch { tf = null; } const sy = tf ? Math.hypot(tf.c, tf.d) : 0; const cv = ctx.canvas; capD = sy > 0 && cv?.height && cv?.width ? (0.9 * Math.sqrt(cv.width * cv.height)) / sy : Infinity; }
          if (im * s > capD) s = capD / im;
          ctx.globalAlpha = al;
          ctx.save(); ctx.translate(p.x, p.y); if (p.rot) ctx.rotate(p.rot);
          ctx.drawImage(img, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
          ctx.restore();
          break;
        }
        case 'slash': {
          // 초승달 모양 궤적
          const k = 1 - t;
          ctx.globalAlpha = k;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
          const R = p.radius, half = p.arc / 2;
          const g = ctx.createLinearGradient(-R, 0, R, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, p.color); g.addColorStop(1, '#ffffff');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, R, -half, half, false);
          ctx.arc(p.width * k * 0.8, 0, R - p.width * k, half, -half, true);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case 'ghost': {
          ctx.globalCompositeOperation = 'source-over';
          p.draw(ctx, (p.life / p.max) * 0.5);
          break;
        }
        case 'dmg': this.drawDmg(ctx, p); break;
        case 'callout': {
          const spr = p.spr, age = p.max - p.life;
          if (!spr?.canvas) break;   // 캐시에서 밀려난 문구 (hitfx.textSprite 가 캔버스를 다른 문구에 넘김)
          const k = age < 0.08 ? 1.45 - 0.45 * (age / 0.08) : 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = t < 0.65 ? 1 : clamp(1 - (t - 0.65) / 0.35, 0, 1);
          const w = spr.w * k, h = spr.h * k, X = p.dx ?? p.x, Y = p.dy ?? p.y;
          ctx.drawImage(spr.canvas, X - w / 2, Y - h / 2, w, h);
          break;
        }
        case 'text': {
          const pop = t < 0.12 ? 1 + (0.12 - t) * (p.crit ? 9 : 5) : 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = clamp(p.life / p.max * 2.5, 0, 1);
          const size = p.size * pop;
          ctx.font = p.font || `900 ${size}px "Cinzel", "Noto Sans KR", serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 5; ctx.strokeStyle = p.outline; ctx.strokeText(p.str, p.x, p.y);
          ctx.fillStyle = p.color; ctx.fillText(p.str, p.x, p.y);
          if (p.crit) { ctx.globalAlpha *= 0.5; ctx.fillStyle = '#fff'; ctx.fillText(p.str, p.x, p.y - 1); }
          ctx.textBaseline = 'alphabetic';
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** 아틀라스 숫자 한 개: 튀어나옴(pop) → 떠오름(rise) 또는 떨어짐(fall) → hold 뒤 사라짐 */
  drawDmg(ctx, p) {
    const A = p.A, cv = A?.canvas;
    if (!cv) return;
    const age = p.max - p.life;
    const sc = age < p.popT ? p.pop + (1 - p.pop) * (age / p.popT) : 1;
    let X = p.x, Y;
    if (p.fall) Y = p.y + 10 * age + 70 * age * age;
    else if (p.col) Y = p.y - this.colRise(p.col, p.rise);
    else Y = p.y - this.riseOf(p);
    if (p.jit && age < p.jitT) {
      // 떨림: 게임 프레임마다 한 번만 새 값 (고주사율 화면에서도 같은 떨림). 잡음은 (숫자, 시계) 해시 — 게임 난수를 쓰지 않는다 (R1-REQ-333)
      if (p._jf !== this.clock) {
        p._jf = this.clock;
        const f = Math.round(this.clock * 240) * 131 + (p.sd | 0) * 7919;
        p.jx = (hash01(f) * 2 - 1) * p.jit; p.jy = (hash01(f + 1) * 2 - 1) * p.jit;
      }
      X += p.jx; Y += p.jy;
    }
    const al = age < p.hold ? 1 : clamp(1 - (age - p.hold) / Math.max(0.05, p.max - p.hold), 0, 1);
    if (al <= 0.01) return;
    const k = A.k, gh = (A.h / k) * sc;
    // HUD 윗줄 아래로 (R1-REQ-331): 기둥 숫자·합계는 기둥째, 따로 뜬 숫자(플레이어 피격·회복)는 하나씩
    if (this.band.n) {
      const c = p.col ?? p.colRef;
      if (c) Y += this.colShift(c);
      else Y += this.bandPush(X - (p.w / 2) * sc, X + (p.w / 2) * sc, Y - gh / 2);
    }
    if (p.star) {
      const s = 48 * sc;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.75;
      ctx.drawImage(p.star, X - s / 2, Y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    for (const q of p.q) ctx.drawImage(cv, q[0], q[1], q[2], q[3], X + q[4] * sc, Y - gh / 2, (q[2] / k) * sc, gh);
    const T = A.tag;
    if (T) {
      const tw = (T[2] / k) * sc, th = (T[3] / k) * sc;
      if (p.tagAbove) ctx.drawImage(cv, T[0], T[1], T[2], T[3], X - tw / 2, Y - gh / 2 - th * 0.72, tw, th);
      else ctx.drawImage(cv, T[0], T[1], T[2], T[3], X - (p.w / 2) * sc - tw + 2, Y - th / 2, tw, th);
    }
  }
}
