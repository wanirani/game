// 기믹 종류 B — heartbeat(심장 박동 벽) · blight(부패 포자) · voidwall(공허의 벽) 과 포자 주머니 소품 SporePod ('y')
// owner: GIMMICK-KINDS-B   (world2 §3.5, §14 · MASTER_PLAN §1.2 blightMul)
//
// ── 계약: gimmicks.js 머리말의 "멤버(종류별 기믹) 계약" 을 따른다 (GimmickSet 이 GIMMICKS_B[kind] 로 만들어 호출) ──
//  GIMMICKS_B[kind](world, params, set) → member   그냥 함수 (new 로 불러도 된다). 인자 순서는 가리지 않는다
//                                                 (world = entities 를 가진 객체, room = map 배열을 가진 객체, 나머지 첫 객체 = params).
//                                                 .create 도 같은 함수, .Class 는 실제 클래스.
//  member.kind
//  update(dt, paused)             world 시간 간격 (히트스톱 중에는 불리지 않음). world.cutscene·transitioning 중에는 진행을 멈추고 연출만.
//  prePhysics(p, dt) / postPhysics(p, dt)       Player.physics() 앞뒤 (voidwall 밀어내기)
//  onJumpInput(p) → false
//  healMul() → number             blight 상태 이상 0.5
//  get noRegen → bool             blight 상태 이상
//  get speedMul → number          blight 상태 이상 0.9
//  get bgFlip → false
//  get hasMeter → bool            이번 프레임에 HUD 게이지 1줄을 쓰는가 (blight 만)
//  lights(L)
//  drawWorld(ctx, cam, layer)     layer 'under' | 'back' | 'front' (카메라 변환이 적용된 월드 좌표)
//  drawScreen(ctx, vw, vh, hud)   화면 좌표. 게이지는 hud.meter() 가 준 줄에만 그린다 (null = world.hudHidden 이거나 줄 없음 → 안 그림).
//                                 hud 대신 줄 번호(숫자)나 {x,y,w,h} 를 넘겨도 된다. 화면 색조는 hudHidden 이어도 그린다.
//  onFell(p) · onRespawn() · cleanse(n) · reset() · dispose()
//
// 종류별 API (world.gimmickOf(kind) 가 돌려주는 구성원)
//  heartbeat { beatIndex, beat, warning, setBeat(sec), reset() }
//  blight    { meter, status, addCloud(x, y, w, h, life = 5)(px), spawnPod(tx, ty, {respawn}), cleanse(n), reset() }
//            포자 흡수량 × (p.mount?.riding ? p.mount.def.blightMul ?? 1 : 1)
//  voidwall  { mode, wallX, wallR, closeIn(x0px, x1px, speed = 80), open(speed = 120), reset() }
//
// 맵 문자: z/Z 는 map.phaseTiles 의 key 'even'/'odd' (없으면 z/Z 마커) 를 읽어 이 파일이 고체/빈칸을 정한다.
//          'y' 포자 주머니는 blight 구성원이 직접 만든다 (world·엔진은 만들지 않는다. 같은 칸에 둘이 생기면 첫 update 에서 하나만 남긴다).
// SporePod(tx, ty, opts) — 타일 좌표 (props.js 의 다른 소품과 같은 규칙). 공격받으면 부풀었다 터지고, 화염 속성
//  (또는 정화의 불꽃: attack.purge / tags 'purge' / id 'tech_purge') 에는 타 버린다. 수호신 공격(tags 'companion')은 무시한다.
// 순환 import: gimmicks.js ↔ 이 파일. 서로의 값을 모듈 최상위에서 쓰지 않는다 (함수 안에서만).
//             gimmicks.js 는 이름공간(GE)으로만 불러 GE.drawMeter?.() 처럼 쓴다 (없으면 이 파일의 대체 그림).
import { Entity } from './entity.js';
import { TILE } from '../core/game.js';
import { T } from '../core/physics.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text } from '../core/ui.js';
import { clamp, rand, approach, RNG } from '../core/math.js';
import { hudLayout } from '../render/hud_layout.js';
import * as GE from './gimmicks.js';

// ─────────────────────────── 공용 도우미 ───────────────────────────
const TWO_PI = Math.PI * 2;
/** 모서리만 닿은 것은 겹침이 아니다 (e px 안쪽으로 줄여 판정) — 바닥 위에 선 몸은 그 타일과 겹치지 않는다 */
function hits(a, b, e = 1) {
  return a.x < b.x + b.w - e && a.x + a.w > b.x + e && a.y < b.y + b.h - e && a.y + a.h > b.y + e;
}
function union(a, b) {
  if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
/** 플레이어 몸 (탑승 중이면 탈것 몸까지 — hurtbox() 가 탈것 판정을 돌려준다) */
function playerBody(p) {
  if (!p || p.dead) return null;
  let hb = null;
  try { hb = p.hurtbox?.() ?? null; } catch { hb = null; }
  return union({ x: p.x, y: p.y, w: p.w, h: p.h }, hb && Number.isFinite(hb.x) ? hb : null);
}
const settingsOf = (world) => world?.game?.settings ?? {};
const qualityOf = (world) => world?.fx?.quality ?? 1;
const isSolidT = (t) => t === T.SOLID || t === T.BREAK;
const isFloorT = (t) => t === T.SOLID || t === T.BREAK || t === T.ONEWAY;

// ── 캐시 스프라이트 (한 번만 만들어 모든 방이 같이 쓴다; 매 프레임 그라디언트/캔버스를 만들지 않는다) ──
const SPR = Object.create(null);
function sprite(key, w, h, paint) {
  let c = SPR[key];
  if (c !== undefined) return c;
  c = null;
  if (typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    try { paint(c.getContext('2d'), w, h); } catch { c = null; }
  }
  SPR[key] = c;
  return c;
}
/** 화면 가장자리 비네트 (가운데 투명 → 가장자리 rgb) */
function vignetteSprite(key, rgb) {
  return sprite('vig_' + key, 320, 180, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(0.55, `rgba(${rgb},0.3)`);
    gr.addColorStop(1, `rgba(${rgb},1)`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
/** 포자 구름 덩어리 (부드러운 원) — tone 0 연두, 1 탁한 올리브 */
function blobSprite(tone) {
  return sprite('blob' + tone, 128, 128, (g) => {
    const c = tone ? '118,146,44' : '178,216,78';
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${c},0.62)`);
    gr.addColorStop(0.45, `rgba(${c},0.34)`);
    gr.addColorStop(0.8, `rgba(${c},0.1)`);
    gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
}
/** 공허의 별밭 (반복 무늬) */
function starSprite() {
  return sprite('stars', 256, 256, (g, w, h) => {
    g.fillStyle = '#030108'; g.fillRect(0, 0, w, h);
    const rng = new RNG(20);
    for (const [x, y, r, c] of [[70, 80, 120, '60,20,120'], [190, 190, 110, '20,40,120'], [200, 40, 70, '120,20,90']]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${c},0.32)`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    const cols = ['#ffffff', '#cfd8ff', '#ffd6f4', '#b8fff0', '#fff2c0'];
    for (let i = 0; i < 120; i++) {
      g.globalAlpha = rng.range(0.25, 1);
      g.fillStyle = rng.pick(cols);
      const s = rng.next() < 0.12 ? 2 : 1;
      g.fillRect(Math.floor(rng.range(0, w)), Math.floor(rng.range(0, h)), s, s);
    }
    g.globalAlpha = 1;
  });
}
const PATTERNS = new WeakMap();
function starPattern(ctx) {
  let p = PATTERNS.get(ctx);
  if (!p) {
    const s = starSprite();
    p = (s && ctx.createPattern?.(s, 'repeat')) || '#030108';
    PATTERNS.set(ctx, p);
  }
  return p;
}
/** 가로 그라디언트 띠: 왼쪽 불투명 → 오른쪽 투명 (화면 가장자리 어둠, 공허 가장자리 빛) */
function bandSprite(key, rgb, a0) {
  return sprite('band_' + key, 256, 4, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, `rgba(${rgb},${a0})`);
    gr.addColorStop(0.45, `rgba(${rgb},${a0 * 0.42})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
/** 심장 박동 벽의 살점 덮개 ('flesh') / 사라지기 직전 검붉은 혈관 ('dark') — 48×48 */
function veinSprite(kind) {
  return sprite('vein_' + kind, 48, 48, (g, w, h) => {
    const rng = new RNG(kind === 'flesh' ? 7 : 13);
    if (kind === 'flesh') {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(120,14,34,0.62)'); gr.addColorStop(1, 'rgba(46,2,14,0.72)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(20,0,6,0.7)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = 'rgba(255,90,110,0.18)';
        g.beginPath(); g.ellipse(rng.range(8, 40), rng.range(8, 40), rng.range(4, 9), rng.range(3, 6), rng.range(0, 3), 0, TWO_PI); g.fill();
      }
    }
    const lines = kind === 'flesh' ? [['rgba(22,0,8,0.85)', 3], ['rgba(200,40,70,0.75)', 1.2]] : [['rgba(16,0,6,0.9)', 3.4], ['rgba(110,0,26,0.75)', 1.4]];
    const paths = [];
    for (let i = 0; i < 5; i++) {
      const side = i % 4, e = rng.range(4, 44);
      const x0 = side === 0 ? 0 : side === 1 ? w : e, y0 = side === 2 ? 0 : side === 3 ? h : e;
      paths.push([x0, y0, rng.range(10, 38), rng.range(10, 38), rng.range(6, 42), rng.range(6, 42)]);
    }
    for (const [col, lw] of lines) {
      g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
      for (const [x0, y0, cx, cy, x1, y1] of paths) { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke(); }
    }
  });
}
/** 포자 주머니 절차적 대체 그림 (이미지가 없을 때) — 서 있는 방향, 96×96 */
function podFallback() {
  return sprite('pod', 96, 96, (g) => {
    g.fillStyle = '#2a2410';
    for (const dx of [-26, -10, 10, 26]) { g.beginPath(); g.ellipse(48 + dx, 92, 7, 4, 0, 0, TWO_PI); g.fill(); }
    const gr = g.createRadialGradient(40, 44, 4, 48, 58, 42);
    gr.addColorStop(0, '#f0ffb0'); gr.addColorStop(0.35, '#a8d040'); gr.addColorStop(0.8, '#4e6e14'); gr.addColorStop(1, '#223006');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(48, 58, 40, 35, 0, 0, TWO_PI); g.fill();
    g.strokeStyle = 'rgba(230,255,120,0.85)'; g.lineWidth = 1.6;
    for (const [a, b, c, d] of [[20, 50, 40, 70], [52, 30, 62, 62], [70, 44, 80, 70], [34, 36, 30, 60]]) { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo((a + c) / 2 + 8, (b + d) / 2, c, d); g.stroke(); }
    g.fillStyle = '#5a4a20'; g.fillRect(45, 14, 6, 12);
    g.fillStyle = '#8a7a3a'; g.beginPath(); g.ellipse(48, 14, 6, 4, 0, 0, TWO_PI); g.fill();
  });
}
function glowSprite() {
  return sprite('podglow', 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(220,255,130,0.9)'); gr.addColorStop(0.5, 'rgba(160,230,60,0.35)'); gr.addColorStop(1, 'rgba(120,200,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
}
/** 게이지 줄 사각형: GimmickSet 의 hud.meter() (null = 숨김·줄 없음) · 줄 번호 · {x,y,w,h} 를 모두 받는다 */
function meterRect(world, vw, vh, hud) {
  if (world?.hudHidden) return null;
  if (hud && typeof hud.meter === 'function') { const r = hud.meter(); return r && Number.isFinite(r.x) ? r : null; }
  if (hud && typeof hud === 'object' && Number.isFinite(hud.x)) return hud;
  const i = Number.isFinite(hud) ? hud : 0;
  try { const r = hudLayout(world, vw, vh)?.meter?.(i); if (r && Number.isFinite(r.x)) return r; } catch { /* 배치 모듈 오류 → 기본값 */ }
  return { x: vw / 2 - 100, y: 12 + 20 * i, w: 200, h: 16 };
}
/** 게이지 한 줄 — 엔진(gimmicks.js)의 drawMeter 와 같은 모양 (없으면 같은 규격의 대체 그림). 막대 영역 {x,y,w,h} 를 돌려준다 */
function drawGauge(ctx, r, label, ratio, color, opts = {}) {
  const bh = Math.max(4, Math.min(12, r.h - 4)), bar = { x: r.x + 2, y: r.y + (r.h - bh) / 2, w: r.w - 4, h: bh };
  if (typeof GE.drawMeter === 'function') { GE.drawMeter(ctx, r, label, ratio, color, opts); return bar; }
  const fw = bar.w * clamp(ratio, 0, 1), ty = r.y + r.h / 2 + 1;
  ctx.save();
  ctx.globalAlpha = !opts.blink || Math.sin((opts.time ?? 0) * 16) > -0.3 ? 1 : 0.45;
  ctx.fillStyle = 'rgba(8,4,12,0.72)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bar.x, bar.y, bar.w, bh);
  ctx.fillStyle = color; ctx.fillRect(bar.x, bar.y, fw, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(bar.x, bar.y, fw, Math.min(2, bh));
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  const lc = opts.labelColor ?? '#ffffff';
  text(ctx, label, r.x + 8, ty, { size: 12, weight: 800, color: lc, baseline: 'middle', ow: 3 });
  if (opts.sub) text(ctx, opts.sub, r.x + r.w - 8, ty, { size: 12, weight: 700, color: lc, align: 'right', baseline: 'middle', ow: 3 });
  ctx.restore();
  return bar;
}

// ─────────────────────────── 구성원 기반 ───────────────────────────
/** GimmickSet 구성원 공통 (모든 훅을 가진 빈 구현) */
class MemberB {
  constructor(world, cfg, room, defaults) {
    this.world = world;
    this.room = room ?? world?.room ?? null;
    this.cfg = { ...defaults, ...(cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {}) };
    this.kind = defaults.kind;
    this.cfg.kind = defaults.kind;
    this.t = 0;
    this.disposed = false;
  }
  /** 진행을 멈추는 때: 컷신·방 전환 중 (연출용 시간 this.t 는 계속 흐른다) */
  paused() { const w = this.world; return !!(w?.cutscene || w?.transitioning); }
  update(dt) { this.t += dt; }
  prePhysics(p, dt) {}
  postPhysics(p, dt) {}
  onJumpInput(p) { return false; }
  healMul() { return 1; }
  get noRegen() { return false; }
  get speedMul() { return 1; }
  get bgFlip() { return false; }
  get hasMeter() { return false; }
  lights(L) {}
  drawWorld(ctx, cam, layer) {}
  drawScreen(ctx, vw, vh, row) {}
  onFell(p) {}
  onRespawn() {}
  cleanse(n) { return false; }
  dispose() { this.disposed = true; }
}

// ─────────────────────────── heartbeat ───────────────────────────
// { kind:'heartbeat', beat:3.2, warn:0.8, light:260 } — beat 초마다 z(짝수 박)/Z(홀수 박) 벽이 번갈아 생긴다.
// 새로 고체가 될 칸이 플레이어·적과 겹치면 빈칸으로 두었다가(pending) 비는 즉시 굳힌다 (절대 끼이지 않는다).
const HEARTBEAT_DEF = { kind: 'heartbeat', beat: 3.2, warn: 0.8, light: 260 };
export class HeartbeatGimmick extends MemberB {
  constructor(world, cfg, room) {
    super(world, cfg, room, HEARTBEAT_DEF);
    const c = this.cfg;
    this.baseBeat = Math.max(0.4, Number(c.beat) || HEARTBEAT_DEF.beat);
    this.beat = this.baseBeat;
    this.warn = Math.max(0, Number(c.warn ?? HEARTBEAT_DEF.warn) || 0);
    this.lightR = Math.max(0, Number(c.light ?? HEARTBEAT_DEF.light) || 0);
    this.beatIndex = 0;
    this.timer = 0;          // 마지막 박동 뒤 흐른 시간
    this.sinceBeat = 9;      // 연출용
    this.dubT = -1;          // '쿵-짝' 두 번째 소리까지 남은 시간
    this.cells = [];         // {tx, ty, idx, even, pending}
    this.byIdx = new Map();
    this.pendingN = 0;
    this.queue = [];         // 다음 프레임들에 적용할 칸 묶음 (apply(stagger))
    this.collect();
    this.apply(false);
  }
  /** z/Z 칸 수집: GIMMICK-ENGINE 의 map.phaseTiles(key 'even'/'odd') → 없으면 z/Z 마커 */
  collect() {
    const m = this.world?.map;
    if (!m) return;
    const add = (tx, ty, even) => {
      if (!(tx >= 0 && ty >= 0 && tx < m.w && ty < m.h)) return;
      const idx = ty * m.w + tx;
      if (this.byIdx.has(idx)) return;
      const c = { tx, ty, idx, even, pending: false };
      this.cells.push(c); this.byIdx.set(idx, c);
    };
    for (const pt of m.phaseTiles ?? []) {
      const k = pt.key ?? pt.phase ?? pt.ch;
      const tx = pt.tx ?? (pt.idx % m.w), ty = pt.ty ?? Math.floor(pt.idx / m.w);
      if (k === 'even' || k === 'z') add(tx, ty, true);
      else if (k === 'odd' || k === 'Z') add(tx, ty, false);
    }
    for (const mk of m.markers ?? []) if (mk.ch === 'z' || mk.ch === 'Z') add(mk.tx, mk.ty, mk.ch === 'z');
  }
  wants(c, i = this.beatIndex) { return c.even === (i % 2 === 0); }
  get warning() { return this.warn > 0 && this.timer >= this.beat - this.warn; }
  /** 칸을 막는 몸들: 플레이어 (탑승 시 탈것 포함) + 살아 있는 적·보스. 수호신(kind 'companion')은 무시 */
  bodies() {
    const out = [];
    const pb = playerBody(this.world?.player);
    if (pb) out.push(pb);
    for (const e of this.world?.entities ?? []) {
      if ((e.kind !== 'enemy' && e.kind !== 'boss') || e.dead) continue;
      out.push(e);
    }
    return out;
  }
  blocked(c, bodies) {
    const r = { x: c.tx * TILE, y: c.ty * TILE, w: TILE, h: TILE };
    for (const b of bodies) if (hits(r, b)) return true;
    return false;
  }
  setTile(c, type) {
    const w = this.world, m = w?.map;
    if (!m || m.tiles[c.idx] === type) return false;
    m.set(c.tx, c.ty, type);
    w.tiles?.invalidate?.(c.tx, c.ty);
    return true;
  }
  /**
   * 현재 박자에 맞게 칸을 맞춘다 (겹치는 칸은 보류).
   * stagger: 화면 근처에서 실제로 바뀌는 칸은 타일 청크(16칸) 묶음별로 한 프레임에 하나씩 적용한다 — 타일 렌더러가 바뀐
   * 청크 캔버스를 통째로 다시 굽기 때문에 한 프레임에 몰리지 않게 나눈다 (길어야 몇 프레임). 화면 밖 칸은 즉시.
   */
  apply(stagger = false) {
    this.queue.length = 0;
    const m = this.world?.map, cam = this.world?.camera;
    if (!stagger || !m || !cam?.visible) { this.applyCells(this.cells); return; }
    const now = [], groups = new Map();
    for (const c of this.cells) {
      const change = (this.wants(c) ? T.SOLID : T.EMPTY) !== m.tiles[c.idx];
      if (!change || !cam.visible(c.tx * TILE, c.ty * TILE, TILE, TILE, 3 * TILE)) { now.push(c); continue; }
      const k = (c.tx >> 4) * 4096 + (c.ty >> 4);
      let g = groups.get(k);
      if (!g) groups.set(k, (g = []));
      g.push(c);
    }
    const gs = [...groups.values()];
    if (gs.length) now.push(...gs.shift());
    this.applyCells(now);
    for (const g of gs) this.queue.push(g);
  }
  applyCells(list) {
    if (list.length) {
      const bodies = this.bodies();
      for (const c of list) {
        if (this.wants(c)) {
          if (this.blocked(c, bodies)) { this.setTile(c, T.EMPTY); c.pending = true; }
          else { this.setTile(c, T.SOLID); c.pending = false; }
        } else { this.setTile(c, T.EMPTY); c.pending = false; }
      }
    }
    let pend = 0;
    for (const c of this.cells) if (c.pending) pend++;
    this.pendingN = pend;
  }
  /** 보류된 칸: 아무것도 겹치지 않게 되면 굳힌다 */
  settle() {
    if (!this.pendingN) return;
    const bodies = this.bodies();
    let pend = 0;
    for (const c of this.cells) {
      if (!c.pending) continue;
      if (!this.wants(c)) { c.pending = false; continue; }
      if (this.blocked(c, bodies)) { pend++; continue; }
      c.pending = false;
      this.setTile(c, T.SOLID);
      const fx = this.world?.fx;
      if (fx && this.world.camera?.visible?.(c.tx * TILE, c.ty * TILE, TILE, TILE, 0)) fx.burst('blood', c.tx * TILE + TILE / 2, c.ty * TILE + TILE / 2, 3, { speed: 90 });
    }
    this.pendingN = pend;
  }
  /** 안전장치: 플레이어가 고체 박동 벽 안에 놓이면 (부활·낙사 복귀 등) 그 칸을 비우고 보류로 돌린다 */
  unstick() {
    const w = this.world, m = w?.map, p = w?.player;
    const pb = playerBody(p);
    if (!pb || !m || !this.cells.length) return;
    const tx0 = Math.floor(pb.x / TILE), tx1 = Math.floor((pb.x + pb.w - 0.01) / TILE);
    const ty0 = Math.floor(pb.y / TILE), ty1 = Math.floor((pb.y + pb.h - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
        const c = this.byIdx.get(ty * m.w + tx);
        if (!c || m.tiles[c.idx] !== T.SOLID) continue;
        if (!hits({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE }, pb)) continue;
        this.setTile(c, T.EMPTY);
        if (this.wants(c) && !c.pending) { c.pending = true; this.pendingN++; }
      }
    }
  }
  update(dt, paused = false) {
    this.t += dt; this.sinceBeat += dt;
    if (this.dubT >= 0) { this.dubT -= dt; if (this.dubT < 0) audio.sfx('hit', { pitch: 0.5, vol: 0.25 }); }
    if (this.queue.length) this.applyCells(this.queue.shift());   // 나눠 둔 박동 적용분
    this.unstick();
    this.settle();
    if (paused || this.paused()) return;
    this.timer += dt;
    if (this.timer >= this.beat) {
      this.timer = Math.min(this.timer - this.beat, this.beat * 0.5);
      this.doBeat();
    }
  }
  doBeat() {
    this.beatIndex++;
    this.apply(true);
    this.sinceBeat = 0;
    audio.sfx('hit_heavy', { pitch: 0.45, vol: 0.35 });
    this.dubT = 0.18;
  }
  /** 박동 간격 변경 (마라 dreamshift 등). 진행 중인 박자는 유지한다 */
  setBeat(sec) {
    this.beat = Math.max(0.4, Number(sec) || this.baseBeat);
    if (this.timer > this.beat) this.timer = this.beat;
    return this.beat;
  }
  /** 기본 박동으로 되돌림 (보스 onReset) */
  reset() {
    this.beat = this.baseBeat; this.timer = 0; this.beatIndex = 0; this.sinceBeat = 9;
    this.apply(false);
  }
  onRespawn() { this.beat = this.baseBeat; this.unstick(); }
  onFell() { this.unstick(); }
  /** 쿵(0 s) · 짝(0.18 s) 맥동 세기 0..1 */
  pulse() {
    const s = this.sinceBeat;
    const lub = Math.max(0, 1 - s / 0.3), dub = s > 0.18 ? Math.max(0, 1 - (s - 0.18) / 0.25) * 0.6 : 0;
    return Math.min(1, lub + dub);
  }
  lights(L) {
    const p = this.world?.player;
    if (!p || p.dead || !this.lightR) return;
    const k = this.pulse();
    L.add(p.cx, p.cy - 10, this.lightR * (1 + 0.06 * k), '#b080ff', 0.45 + 0.12 * k);
  }
  drawWorld(ctx, cam, layer) {
    if (layer !== 'back' || !this.cells.length) return;
    const m = this.world?.map;
    if (!m) return;
    const x0 = cam.x - TILE, x1 = cam.x + (cam.vw ?? cam.w) + TILE, y0 = cam.y - TILE, y1 = cam.y + (cam.vh ?? cam.h) + TILE;
    const warn = this.warning;
    const wk = warn ? clamp((this.timer - (this.beat - this.warn)) / Math.max(0.01, this.warn), 0, 1) : 0;
    const blink = 0.5 + 0.5 * Math.sin(this.t * (9 + 16 * wk));
    const pk = this.pulse();
    const flesh = veinSprite('flesh'), dark = veinSprite('dark');
    const nextEven = (this.beatIndex + 1) % 2 === 0;
    const vis = (c) => { const x = c.tx * TILE, y = c.ty * TILE; return x < x1 && x + TILE > x0 && y < y1 && y + TILE > y0; };
    ctx.save();
    // 1) 살아 있는 벽: 살점 덮개 (+ 곧 사라질 벽은 검붉은 혈관)
    for (const c of this.cells) {
      if (m.tiles[c.idx] !== T.SOLID || !vis(c)) continue;
      const x = c.tx * TILE, y = c.ty * TILE;
      ctx.globalAlpha = 0.78 + 0.22 * pk;
      if (flesh) ctx.drawImage(flesh, x, y, TILE, TILE);
      else { ctx.fillStyle = '#5a0a1a'; ctx.fillRect(x, y, TILE, TILE); }
      if (warn && c.even !== nextEven && dark) { ctx.globalAlpha = 0.3 + 0.6 * wk * blink; ctx.drawImage(dark, x, y, TILE, TILE); }
    }
    // 2) 빈 박동 칸: 옅은 막 + 점선 (벽이 생길 자리를 읽을 수 있게)
    ctx.beginPath();
    let any = false;
    for (const c of this.cells) {
      if (m.tiles[c.idx] === T.SOLID || !vis(c)) continue;
      if (warn && c.even === nextEven) continue;
      ctx.rect(c.tx * TILE + 1.5, c.ty * TILE + 1.5, TILE - 3, TILE - 3); any = true;
    }
    if (any) {
      ctx.globalAlpha = 0.07 + 0.05 * pk; ctx.fillStyle = 'rgb(140,14,36)'; ctx.fill();
      ctx.globalAlpha = 0.22; ctx.strokeStyle = 'rgb(220,70,90)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    }
    // 3) 경고: 곧 벽이 될 칸이 붉게 맥동 (보류 칸은 굵은 테두리)
    if (warn) {
      ctx.beginPath(); any = false;
      for (const c of this.cells) {
        if (m.tiles[c.idx] === T.SOLID || c.even !== nextEven || !vis(c)) continue;
        ctx.rect(c.tx * TILE, c.ty * TILE, TILE, TILE); any = true;
      }
      if (any) {
        ctx.globalAlpha = 0.25 * (0.35 + 0.65 * blink) + 0.12 * wk; ctx.fillStyle = 'rgb(255,40,60)'; ctx.fill();
        ctx.globalAlpha = 0.35 + 0.4 * blink; ctx.strokeStyle = 'rgb(255,90,110)'; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    if (this.pendingN) {
      ctx.beginPath(); any = false;
      for (const c of this.cells) if (c.pending && vis(c)) { ctx.rect(c.tx * TILE + 2, c.ty * TILE + 2, TILE - 4, TILE - 4); any = true; }
      if (any) {
        ctx.globalAlpha = 0.18 + 0.12 * blink; ctx.fillStyle = 'rgb(200,20,50)'; ctx.fill();
        ctx.globalAlpha = 0.6 + 0.3 * blink; ctx.strokeStyle = 'rgb(255,60,90)'; ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
    ctx.restore();
  }
  drawScreen(ctx, vw, vh) {
    const k = Math.max(0, 1 - this.sinceBeat / 0.4);
    if (k <= 0.01) return;
    const s = settingsOf(this.world);
    const a = 0.32 * k * (s.flashFx ?? 1) * (s.reduceMotion ? 0.5 : 1);
    const v = vignetteSprite('heart', '120,0,20');
    if (!v || a <= 0.004) return;
    ctx.save(); ctx.globalAlpha = a; ctx.drawImage(v, 0, 0, vw, vh); ctx.restore();
  }
  dispose() { this.disposed = true; this.cells.length = 0; this.byIdx.clear(); }
}

// ─────────────────────────── blight ───────────────────────────
// { kind:'blight', gain:30, decay:12, on:100, off:40, dot:0.015, spores:[[tx,ty,tw,th],…], podRespawn:12 }
const BLIGHT_DEF = { kind: 'blight', gain: 30, decay: 12, on: 100, off: 40, dot: 0.015, spores: [], podRespawn: 12 };
const MAX_DYN_CLOUDS = 16;
const MAX_PODS = 24;
function makeCloud(x, y, w, h, life, isStatic) {
  const area = w * h;
  const sp = Math.max(64, Math.sqrt(area / 34));
  const cols = Math.max(1, Math.round(w / sp)), rows = Math.max(1, Math.round(h / sp));
  const blobs = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      blobs.push({
        x: x + (i + 0.5) * (w / cols) + rand(-0.22, 0.22) * (w / cols),
        y: y + (j + 0.5) * (h / rows) + rand(-0.22, 0.22) * (h / rows),
        r: Math.min(sp * rand(0.72, 0.98) + 18, Math.max(w, h) * 0.75 + 30),
        ph: rand(0, TWO_PI), a: rand(0.7, 1), tone: (i + j) % 3 === 2 ? 1 : 0,
      });
    }
  }
  const nm = clamp(Math.round(area / 4200), 4, 40);
  const motes = [];
  for (let i = 0; i < nm; i++) motes.push({ u: Math.random(), v: Math.random(), sp: rand(10, 26), ph: rand(0, TWO_PI) });
  return { x, y, w, h, life, max: life, age: 0, static: isStatic, blobs, motes };
}
export class BlightGimmick extends MemberB {
  constructor(world, cfg, room) {
    super(world, cfg, room, BLIGHT_DEF);
    const c = this.cfg;
    for (const k of ['gain', 'decay', 'on', 'off', 'dot', 'podRespawn']) { const v = Number(c[k]); c[k] = Number.isFinite(v) ? v : BLIGHT_DEF[k]; }
    this.meter = 0;
    this.status = false;
    this.inside = false;
    this.clouds = [];
    this.pods = [];
    this.adopted = false;
    this.fxAcc = 0;
    this.statusT = 0;
    for (const r of Array.isArray(c.spores) ? c.spores : []) {
      if (!Array.isArray(r) || r.length < 4) continue;
      const [tx, ty, tw, th] = r.map(Number);
      if (![tx, ty, tw, th].every(Number.isFinite) || tw <= 0 || th <= 0) continue;
      this.clouds.push(makeCloud(tx * TILE, ty * TILE, tw * TILE, th * TILE, Infinity, true));
    }
    const m = world?.map;
    for (const mk of m?.markers ?? []) if (mk.ch === 'y') this.spawnPod(mk.tx, mk.ty, { respawn: true, marker: true });
  }
  /** 동적 포자 구름 (px). life 초 뒤 사라지고 마지막 1초 동안 옅어진다 */
  addCloud(x, y, w, h, life = 5) {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    let dyn = 0, oldest = -1;
    for (let i = 0; i < this.clouds.length; i++) if (!this.clouds[i].static) { dyn++; if (oldest < 0) oldest = i; }
    if (dyn >= MAX_DYN_CLOUDS && oldest >= 0) this.clouds.splice(oldest, 1);
    const cl = makeCloud(x, y, w, h, Math.max(0.3, Number(life) || 5), false);
    this.clouds.push(cl);
    return cl;
  }
  /** 포자 주머니 심기 (타일 좌표). 맵 마커가 아닌 것은 바닥까지 내려앉고, 터진 뒤 다시 자라지 않는다 (respawn:true 로 바꿀 수 있음) */
  spawnPod(tx, ty, opts = {}) {
    const w = this.world;
    if (!w?.map || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    this.pods = this.pods.filter((q) => !q.dead);
    if (this.pods.length >= MAX_PODS) return null;
    const pod = new SporePod(tx, ty, { gimmick: this, respawn: opts.respawn ?? !!opts.marker, drop: !opts.marker, marker: !!opts.marker });
    pod.place(w.map);
    if (w.add) w.add(pod); else { w.entities?.push(pod); pod.world = w; }
    if (!opts.marker) pod.sprout();
    this.pods.push(pod);
    return pod;
  }
  /** 다른 곳에서 만든 포자 주머니를 거둔다 (같은 칸의 중복은 지운다) */
  adoptPods() {
    this.adopted = true;
    for (const e of this.world?.entities ?? []) {
      if (!(e instanceof SporePod) || e.dead || this.pods.includes(e)) continue;
      if (this.pods.some((q) => !q.dead && q.tx === e.tx && q.ty === e.ty)) { e.dead = true; continue; }
      e.gimmick = this; this.pods.push(e);
    }
  }
  /** 정화: meter −n, off 이하로 내려가면 즉시 상태 이상 해제 (여신상 100 · 음식 30 · 정화의 불꽃 50) */
  cleanse(n = 100) {
    const v = Number(n);
    const k = Number.isFinite(v) ? Math.max(0, v) : 100;
    const before = this.meter;
    this.meter = Math.max(0, this.meter - k);
    if (this.status && this.meter <= this.cfg.off) this.setStatus(false, true);
    return before > this.meter;
  }
  setStatus(on, quiet = false) {
    if (this.status === on) return;
    this.status = on; this.statusT = 0;
    const w = this.world, p = w?.player;
    if (quiet || !p || p.dead) return;
    if (on) {
      audio.sfx('dark', { pitch: 0.7, vol: 0.55 });
      w.fx?.text?.(p.cx, p.y - 16, '부패!', { color: '#c07ae0', size: 22 });
      w.fx?.burst?.('soul', p.cx, p.cy, 12, { color: '#b8e04a', speed: 120 });
    } else {
      audio.sfx('heal', { pitch: 1.3, vol: 0.4 });
      w.fx?.text?.(p.cx, p.y - 16, '정화', { color: '#c8ff9a', size: 20 });
    }
  }
  healMul() { return this.status ? 0.5 : 1; }
  get noRegen() { return this.status; }
  get speedMul() { return this.status ? 0.9 : 1; }
  get hasMeter() { return this.status || this.meter > 0.5; }
  cloudAlpha(c) { return c.static ? 1 : clamp(Math.min(c.age / 0.3, c.life / 1), 0, 1); }
  /** 몸이 구름 안인가 (막 생긴 구름 0.15 초·사라지는 마지막 0.4 초는 무해) */
  inCloud(r) {
    for (const c of this.clouds) {
      if (!c.static && (c.age < 0.15 || c.life < 0.4)) continue;
      if (r.x < c.x + c.w && r.x + r.w > c.x && r.y < c.y + c.h && r.y + r.h > c.y) return true;
    }
    return false;
  }
  update(dt, paused = false) {
    this.t += dt; this.statusT += dt;
    if (!this.adopted) this.adoptPods();
    if (paused || this.paused()) return;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.age += dt;
      if (!c.static && (c.life -= dt) <= 0) this.clouds.splice(i, 1);
    }
    const w = this.world, p = w?.player;
    if (!p || p.dead) { this.inside = false; return; }
    let hb = null;
    try { hb = p.hurtbox?.() ?? null; } catch { hb = null; }
    this.inside = this.inCloud(hb && Number.isFinite(hb.x) ? hb : p);
    const mul = p.mount?.riding ? (p.mount.def?.blightMul ?? 1) : 1;   // 탈것 blightMul (백록 실바 0.5)
    const c = this.cfg;
    if (this.inside) this.meter = Math.min(100, this.meter + c.gain * mul * dt);
    else this.meter = Math.max(0, this.meter - c.decay * dt);
    if (!this.status && this.meter >= Math.min(100, c.on) - 1e-6) this.setStatus(true);
    else if (this.status && this.meter <= c.off) this.setStatus(false);
    if (this.status && !w.cleared) {
      const maxHp = p.stats?.hp ?? 100;
      if (p.hp > 1) p.hp = Math.max(1, p.hp - c.dot * maxHp * dt);   // 1 아래로는 깎지 않는다
      this.fxAcc += dt * 5 * qualityOf(w);
      while (this.fxAcc >= 1) {
        this.fxAcc -= 1;
        w.fx?.emit?.('soul', p.cx + rand(-14, 14), p.y + rand(12, Math.max(14, p.h - 8)), { color: '#b8e04a', speed: 30, angle: -Math.PI / 2, spread: 0.9, life: rand(0.5, 0.9) });
      }
    }
  }
  onRespawn() {
    this.meter = 0; this.setStatus(false, true); this.inside = false;
    this.clouds = this.clouds.filter((c) => c.static);
    for (const pod of this.pods) { if (pod.marker) pod.reset(); else pod.dead = true; }
    this.pods = this.pods.filter((q) => !q.dead);
  }
  dispose() { this.disposed = true; this.clouds.length = 0; }
  visibleClouds(cam, margin = 120) {
    const vw = cam.vw ?? cam.w, vh = cam.vh ?? cam.h;
    return this.clouds.filter((c) => c.x + c.w + margin > cam.x && c.x - margin < cam.x + vw && c.y + c.h + margin > cam.y && c.y - margin < cam.y + vh);
  }
  lights(L) {
    const cam = this.world?.camera;
    if (!cam || !this.clouds.length) return;
    let n = 0;
    for (const c of this.visibleClouds(cam, 200)) {
      if (n++ >= 6) break;
      L.add(c.x + c.w / 2, c.y + c.h / 2, Math.min(420, Math.max(c.w, c.h) * 0.55 + 40), '#9ad040', 0.24 * this.cloudAlpha(c));
    }
  }
  drawWorld(ctx, cam, layer) {
    if ((layer !== 'back' && layer !== 'front') || !this.clouds.length) return;
    const list = this.visibleClouds(cam);
    if (!list.length) return;
    const q = qualityOf(this.world), t = this.t;
    const s0 = blobSprite(0), s1 = blobSprite(1);
    ctx.save();
    if (layer === 'back') {
      const step = q < 0.6 ? 2 : 1;
      for (const c of list) {
        const ca = this.cloudAlpha(c);
        for (let i = 0; i < c.blobs.length; i += step) {
          const b = c.blobs[i], spr = b.tone ? s1 : s0;
          if (!spr) continue;
          const r = b.r * (1 + 0.06 * Math.sin(t * 0.6 + b.ph));
          const x = b.x + Math.sin(t * 0.35 + b.ph) * 9, y = b.y + Math.cos(t * 0.27 + b.ph * 1.3) * 6;
          ctx.globalAlpha = ca * b.a * 0.85;
          ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
        }
      }
    } else {
      // 앞쪽 옅은 안개 (몸이 구름 속에 잠겨 보이게) + 떠도는 포자 알갱이
      for (const c of list) {
        const ca = this.cloudAlpha(c);
        if (s0) {
          for (let i = 0; i < c.blobs.length; i += 3) {
            const b = c.blobs[i];
            const r = b.r * 0.8;
            const x = b.x + Math.cos(t * 0.3 + b.ph) * 12, y = b.y + Math.sin(t * 0.22 + b.ph) * 8;
            ctx.globalAlpha = ca * 0.28;
            ctx.drawImage(s0, x - r, y - r, r * 2, r * 2);
          }
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = '#d8ff7a';
        const nm = Math.max(1, Math.round(c.motes.length * q));
        for (let i = 0; i < nm; i++) {
          const m = c.motes[i];
          const x = c.x + ((m.u * c.w + Math.sin(t * 0.8 + m.ph) * 10) % c.w + c.w) % c.w;
          const y = c.y + ((m.v * c.h + t * m.sp) % c.h);
          ctx.globalAlpha = ca * (0.35 + 0.35 * Math.sin(t * 2.4 + m.ph));
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }
  drawScreen(ctx, vw, vh, hud) {
    const w = this.world;
    const vg = vignetteSprite('blight', '60,110,10');
    ctx.save();
    if (this.status) {
      ctx.fillStyle = 'rgba(90,140,20,0.12)'; ctx.fillRect(0, 0, vw, vh);
      if (vg) { ctx.globalAlpha = 0.5 + 0.12 * Math.sin(this.t * 3); ctx.drawImage(vg, 0, 0, vw, vh); }
    } else if (this.meter > 1 && vg) {
      ctx.globalAlpha = 0.35 * (this.meter / 100); ctx.drawImage(vg, 0, 0, vw, vh);
    }
    ctx.restore();
    if (!this.hasMeter) return;              // 게이지 줄은 그릴 때만 받는다 (hud.meter() 는 줄을 하나 소비한다)
    const r = meterRect(w, vw, vh, hud);
    if (!r) return;
    if (this.status) {
      const bar = drawGauge(ctx, r, '부패', this.meter / 100, '#8a3aa8', { blink: true, time: this.t, sub: '부패!', labelColor: '#f4e0ff' });
      const ox = bar.x + bar.w * clamp(this.cfg.off / 100, 0, 1);   // 이 선 아래로 내려가야 풀린다
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(Math.round(ox) - 1, bar.y - 1, 2, bar.h + 2);
    } else {
      drawGauge(ctx, r, '부패', this.meter / 100, '#9ad040', { time: this.t, sub: `${Math.floor(this.meter)}`, labelColor: '#f4ffe0' });
    }
  }
  /** 보스 재도전 등: 동적 구름·심은 주머니 정리, 게이지 0 */
  reset() { this.onRespawn(); }
}

// ─────────────────────────── voidwall ───────────────────────────
// { kind:'voidwall', mode:'chase'|'arena', speed:115, delay:2.5, startTx:-3, stopTx:null, dmg:0.15 }
const VOIDWALL_DEF = { kind: 'voidwall', mode: 'chase', speed: 115, delay: 2.5, startTx: -3, stopTx: null, dmg: 0.15 };
const PUSH_V = 520;
export class VoidWallGimmick extends MemberB {
  constructor(world, cfg, room) {
    super(world, cfg, room, VOIDWALL_DEF);
    const c = this.cfg;
    this.mode = c.mode === 'arena' ? 'arena' : 'chase';
    for (const k of ['speed', 'delay', 'startTx', 'dmg']) { const v = Number(c[k]); c[k] = Number.isFinite(v) ? v : VOIDWALL_DEF[k]; }
    this.pushDir = 0;        // 다음 물리 단계에서 밀어낼 방향 (+1 오른쪽, −1 왼쪽)
    this.hooked = false;     // prePhysics 훅이 실제로 불리는가
    this.fxAcc = 0; this.rumbleT = 0;
    this.pts = new Float32Array(96);
    this.reset();
  }
  get startX() { return this.cfg.startTx * TILE; }
  get stopX() { const s = this.cfg.stopTx; return s === null || s === undefined || !Number.isFinite(Number(s)) ? Infinity : Number(s) * TILE; }
  /** 경기장 경계 (보스전 전에는 X 마커 열 ~ 방 오른쪽 끝) */
  bounds() {
    const w = this.world, a = w?.arena;
    const x0 = a?.x0 ?? w?.arenaX ?? 0, x1 = a?.x1 ?? w?.map?.pxW ?? x0 + 960;
    return { x0, x1 };
  }
  reset() {
    this.pushDir = 0; this.halted = false;
    if (this.mode === 'chase') {
      this.wallX = this.startX; this.wallR = Infinity;
      this.waitT = Math.max(0, this.cfg.delay); this.started = false;
    } else {
      const b = this.bounds();
      this.wallX = b.x0; this.wallR = b.x1;
      this.active = false; this.opening = false; this.tgtL = b.x0; this.tgtR = b.x1; this.moveSpeed = 80;
    }
  }
  /** 경기장 모드: 두 벽이 x0·x1(px) 까지 안쪽으로 조여 온다 */
  closeIn(x0, x1, speed = 80) {
    if (this.mode !== 'arena') return false;
    const b = this.bounds();
    if (!this.active) { this.wallX = b.x0; this.wallR = b.x1; }
    this.tgtL = clamp(Number(x0) || b.x0, b.x0, b.x1);
    this.tgtR = clamp(Number(x1) || b.x1, Math.min(b.x1, this.tgtL + 2 * TILE), b.x1);
    this.moveSpeed = Math.max(1, Number(speed) || 80);
    this.active = true; this.opening = false;
    audio.sfx('thunderclap', { pitch: 0.45, vol: 0.4 });
    this.world?.camera?.shake?.(4, 0.4);
    return true;
  }
  /** 경기장 모드: 벽을 경계까지 되돌린다. 추격 모드: 벽을 그 자리에 멈춘다 */
  open(speed = 120) {
    if (this.mode !== 'arena') { this.halted = true; return true; }
    if (!this.active) return false;
    const b = this.bounds();
    this.tgtL = b.x0; this.tgtR = b.x1; this.moveSpeed = Math.max(1, Number(speed) || 120); this.opening = true;
    return true;
  }
  prePhysics(p, dt) {
    this.hooked = true;
    if (this.pushDir && p && !p.dead) p.vx = this.pushDir > 0 ? Math.max(p.vx, PUSH_V) : Math.min(p.vx, -PUSH_V);
  }
  update(dt, paused = false) {
    this.t += dt;
    const w = this.world, p = w?.player;
    const hooked = this.hooked; this.hooked = false;
    if (paused || this.paused()) { this.pushDir = 0; return; }
    if (this.mode === 'chase') this.moveChase(dt, p); else this.moveArena(dt);
    this.pushDir = 0;
    if (p && !p.dead && !w.cleared) this.contact(p, hooked);
    if (this.mode === 'chase') {
      // 공허 속으로 완전히 넘어간 적은 조용히 사라진다 (전리품·경험치 없음)
      for (const e of w.entities) if (e.kind === 'enemy' && !e.dead && e.x + e.w < this.wallX) e.dead = true;
    }
    this.emitFx(dt);
  }
  moveChase(dt, p) {
    if (this.halted) return;
    if (this.waitT > 0) {
      this.waitT -= dt;
      if (this.waitT <= 0 && !this.started) {
        this.started = true;
        audio.sfx('thunderclap', { pitch: 0.5, vol: 0.45 });
        this.world.camera?.shake?.(4, 0.5);
        if (p && !p.dead) this.world.fx?.text?.(p.cx, p.y - 24, '공허가 무너져 온다!', { color: '#c8a8ff', size: 20, life: 1.6, vy: -40 });
      }
      return;
    }
    if (this.wallX >= this.stopX) return;
    const far = p && !p.dead && this.wallX < p.x - 900;
    this.wallX = Math.min(this.stopX, this.wallX + this.cfg.speed * (far ? 1.6 : 1) * dt);
    if (p && !p.dead && p.x - this.wallX < 260) {
      this.rumbleT -= dt;
      if (this.rumbleT <= 0) { this.rumbleT = 0.7; this.world.camera?.shake?.(1.5, 0.2); }
    }
  }
  moveArena(dt) {
    const b = this.bounds();
    if (!this.active) { this.wallX = b.x0; this.wallR = b.x1; return; }
    const v = this.moveSpeed * dt;
    this.wallX = approach(this.wallX, this.tgtL, v);
    this.wallR = approach(this.wallR, this.tgtR, v);
    if (this.opening && this.wallX <= b.x0 + 0.5 && this.wallR >= b.x1 - 0.5) { this.active = false; this.opening = false; }
  }
  hurt(p, dir, hooked) {
    const w = this.world;
    if (!p.invuln) p.takeHit(Math.ceil((p.stats?.hp ?? 100) * this.cfg.dmg), { team: 'enemy', dir, kb: [PUSH_V, -380], flat: 1, element: 'dark' }, w, {});
    this.pushDir = dir;
    if (!hooked && !p.dead) p.vx = dir > 0 ? Math.max(p.vx, PUSH_V) : Math.min(p.vx, -PUSH_V);
  }
  contact(p, hooked) {
    const w = this.world;
    if (w.transitioning) return;
    if (this.mode === 'chase') {
      if (p.x < this.wallX) this.hurt(p, 1, hooked);
      if (!p.dead && p.x + p.w < this.wallX - TILE) {
        w.onPlayerFell?.(p);
        this.wallX = Math.max(this.startX, p.x - 400);
      }
      return;
    }
    if (!this.active) return;
    const b = this.bounds();
    const leftOn = this.wallX > b.x0 + 2, rightOn = this.wallR < b.x1 - 2;
    if (leftOn && p.x < this.wallX) this.hurt(p, 1, hooked);
    else if (rightOn && p.x + p.w > this.wallR) this.hurt(p, -1, hooked);
    if (!p.dead && ((leftOn && p.x + p.w < this.wallX - TILE) || (rightOn && p.x > this.wallR + TILE))) {
      w.onPlayerFell?.(p);
      if (!p.dead) {
        const mid = (this.wallX + this.wallR) / 2;
        if (p.x < this.wallX || p.x + p.w > this.wallR) { p.x = mid - p.w / 2; p.vx = 0; }
      }
    }
  }
  /** 공허로 빨려 드는 입자 (quality 비례) */
  emitFx(dt) {
    const w = this.world, cam = w?.camera, fx = w?.fx;
    if (!cam || !fx) return;
    const vw = cam.vw ?? cam.w, vh = cam.vh ?? cam.h;
    const rate = 16 * qualityOf(w) * (settingsOf(w).reduceMotion ? 0.5 : 1);
    const edges = [];
    if (this.mode === 'chase') edges.push([this.wallX, -1]);
    else if (this.active) {
      const b = this.bounds();
      if (this.wallX > b.x0 + 1) edges.push([this.wallX, -1]);
      if (this.wallR < b.x1 - 1) edges.push([this.wallR, 1]);
    }
    for (const [X, side] of edges) {
      if (X < cam.x - 200 || X > cam.x + vw + 200) continue;
      this.fxAcc += rate * dt;
      while (this.fxAcc >= 1) {
        this.fxAcc -= 1;
        const x = X - side * rand(40, 200), y = rand(cam.y, cam.y + vh);
        fx.emit(Math.random() < 0.5 ? 'dark' : 'magic', x, y, { angle: side < 0 ? Math.PI : 0, spread: 0.25, speed: 220, color: Math.random() < 0.5 ? '#8a6aff' : '#5a1a7a', life: rand(0.5, 0.9) });
      }
    }
  }
  onRespawn() { this.reset(); }
  onFell(p) {
    if (this.mode === 'chase' && p && p.x - this.wallX < 240) this.wallX = Math.max(this.startX, p.x - 400);
  }
  /** 가장자리 x 흔들림 (톱니 모양) */
  edge(y) {
    const t = this.t;
    return Math.sin(y * 0.045 + t * 2.3) * 7 + Math.sin(y * 0.11 - t * 4.1) * 4 + Math.sin(y * 0.31 + t * 9) * 2;
  }
  lights(L) {
    const cam = this.world?.camera;
    if (!cam) return;
    const vw = cam.vw ?? cam.w, vh = cam.vh ?? cam.h;
    const put = (X, side) => {
      if (X < cam.x - 120 || X > cam.x + vw + 120) return;
      for (let y = cam.y + 70; y < cam.y + vh; y += 200) L.add(X - side * 14, y, 150, '#8a6aff', 0.42);
    };
    if (this.mode === 'chase') put(this.wallX, -1);
    else if (this.active) { const b = this.bounds(); if (this.wallX > b.x0 + 1) put(this.wallX, -1); if (this.wallR < b.x1 - 1) put(this.wallR, 1); }
  }
  drawWorld(ctx, cam, layer) {
    if (layer !== 'front') return;
    if (this.mode === 'chase') this.drawVoid(ctx, cam, this.wallX, -1);
    else if (this.active) {
      const b = this.bounds();
      if (this.wallX > b.x0 + 1) this.drawVoid(ctx, cam, this.wallX, -1);
      if (this.wallR < b.x1 - 1) this.drawVoid(ctx, cam, this.wallR, 1);
    }
  }
  /** side −1: 공허가 X 왼쪽, +1: 오른쪽 */
  drawVoid(ctx, cam, X, side) {
    const vw = cam.vw ?? cam.w, vh = cam.vh ?? cam.h;
    if (!Number.isFinite(X)) return;
    if (side < 0 ? X < cam.x - 30 : X > cam.x + vw + 30) return;
    const top = cam.y - 24, bot = cam.y + vh + 24, far = side < 0 ? cam.x - 30 : cam.x + vw + 30;
    const pts = this.pts;
    const step = Math.max(14, (bot - top) / (pts.length / 2 - 1));
    let n = 0;
    for (let y = top; n < pts.length - 1; y += step) { pts[n++] = X + this.edge(y); pts[n++] = y; if (y >= bot) break; }
    ctx.save();
    // 공허 (별밭 무늬)
    ctx.beginPath(); ctx.moveTo(far, top);
    for (let i = 0; i < n; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineTo(far, pts[n - 1]); ctx.closePath();
    ctx.fillStyle = starPattern(ctx); ctx.fill();
    // 반짝이는 큰 별 (월드 고정 격자)
    const C = 80, xa = Math.min(far, X), xb = Math.max(far, X);
    ctx.fillStyle = '#ffffff';
    for (let gx = Math.floor(xa / C); gx * C < xb; gx++) {
      for (let gy = Math.floor(top / C); gy * C < bot; gy++) {
        const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
        if (h % 3) continue;
        const sx = gx * C + (h % 61), sy = gy * C + ((h >>> 8) % 67);
        if (side < 0 ? sx > X - 10 : sx < X + 10) continue;
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.t * 2.2 + (h % 97));
        ctx.fillRect(sx, sy, 2, 2);
      }
    }
    // 가장자리 바깥의 보랏빛 번짐
    const band = bandSprite('voidglow', '150,90,255', 0.5);
    if (band) {
      ctx.globalAlpha = 0.75; ctx.globalCompositeOperation = 'lighter';
      if (side < 0) ctx.drawImage(band, X - 6, top, 110, bot - top);
      else { ctx.translate(X + 6, 0); ctx.scale(-1, 1); ctx.drawImage(band, 0, top, 110, bot - top); }
    }
    ctx.restore();
    // 프리즘 가장자리: 세 색 선(±2 px) + 흰 중심선
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
    for (const [dx, col] of [[-2, '#ff3a6a'], [0, '#3aff9a'], [2, '#6a8aff']]) {
      ctx.strokeStyle = col; ctx.beginPath();
      for (let i = 0; i < n; i += 2) { if (i) ctx.lineTo(pts[i] + dx, pts[i + 1]); else ctx.moveTo(pts[i] + dx, pts[i + 1]); }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.92; ctx.lineWidth = 1.4; ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < n; i += 2) { if (i) ctx.lineTo(pts[i], pts[i + 1]); else ctx.moveTo(pts[i], pts[i + 1]); }
    ctx.stroke();
    ctx.restore();
  }
  drawScreen(ctx, vw, vh) {
    const p = this.world?.player;
    if (!p || p.dead) return;
    const band = bandSprite('edge', '6,0,14', 1);
    if (!band) return;
    const put = (d, side) => {
      const k = clamp(1 - d / 300, 0, 1);
      if (k <= 0.01) return;
      ctx.save(); ctx.globalAlpha = 0.72 * k;
      if (side < 0) ctx.drawImage(band, 0, 0, vw * 0.45, vh);
      else { ctx.translate(vw, 0); ctx.scale(-1, 1); ctx.drawImage(band, 0, 0, vw * 0.45, vh); }
      ctx.restore();
    };
    if (this.mode === 'chase') put(p.x - this.wallX, -1);
    else if (this.active) {
      const b = this.bounds();
      if (this.wallX > b.x0 + 1) put(p.x - this.wallX, -1);
      if (this.wallR < b.x1 - 1) put(this.wallR - (p.x + p.w), 1);
    }
  }
}

// ─────────────────────────── SporePod ('y') ───────────────────────────
/** 포자 주머니: 숨 쉬듯 부풀다가 플레이어가 80 px 안에 오거나 맞으면 0.45 초 부풀어 터진다 → 포자 구름 160×120, 5 초.
 *  podRespawn 초 뒤 다시 자란다. 화염 속성(또는 정화의 불꽃)에 맞으면 구름 없이 타 버린다. 적이 아니다 (경험치 없음). */
export class SporePod extends Entity {
  constructor(tx = 0, ty = 0, opts = {}) {
    super(0, 0, 40, 40);
    this.kind = 'prop';
    this.z = 3;
    this.tx = Math.floor(Number(tx) || 0); this.ty = Math.floor(Number(ty) || 0);
    this.gimmick = opts.gimmick ?? null;
    this.respawn = opts.respawn !== false;
    this.drop = !!opts.drop;
    this.marker = opts.marker ?? !opts.drop;
    this.nearR = Number(opts.near) || 80;
    this.hang = false; this.placed = false;
    this.state = 'idle'; this.stateT = 0; this.burned = false;
    this.seed = Math.random() * TWO_PI;
    this.hp = 1;
    this.stats = { def: 0, res: 0, maxHp: 1 };
    this.x = this.tx * TILE + TILE / 2 - this.w / 2;
    this.y = (this.ty + 1) * TILE - this.h;
  }
  /** 매달림/바닥 결정: 위가 막혀 있고 아래가 비었으면 천장에 매달린다, 아니면 바닥에 앉는다 */
  place(map) {
    this.placed = true;
    if (!map?.typeAt) return;
    let { tx, ty } = this;
    for (let k = 0; k < 3 && isSolidT(map.typeAt(tx, ty)); k++) ty--;   // 벽 속에 심으면 위로
    this.hang = isSolidT(map.typeAt(tx, ty - 1)) && !isFloorT(map.typeAt(tx, ty + 1));
    if (!this.hang && this.drop) for (let k = 0; k < 14 && ty + 1 < map.h && !isFloorT(map.typeAt(tx, ty + 1)); k++) ty++;
    this.ty = ty;
    this.x = tx * TILE + TILE / 2 - this.w / 2;
    this.y = this.hang ? ty * TILE : (ty + 1) * TILE - this.h;
  }
  get hittable() { return this.state === 'idle' || this.state === 'swell'; }
  hurtbox() { const r = this.rect(); if (!this.hittable) r.off = true; return r; }
  blight(world) {
    const g = this.gimmick && !this.gimmick.disposed ? this.gimmick : null;
    return g ?? world?.gimmickOf?.('blight') ?? null;
  }
  setState(s) { this.state = s; this.stateT = 0; }
  sprout() { this.setState('grow'); }
  reset() { this.setState('idle'); this.burned = false; }
  takeHit(dmg, attack, world) {
    world = world ?? this.world;
    if (!this.hittable || !world) return false;
    if (attack?.tags?.includes?.('companion')) return false;              // 수호신 공격은 주머니를 건드리지 않는다
    const purge = attack?.purge || attack?.tags?.includes?.('purge') || attack?.id === 'tech_purge' || attack?.tech === 'tech_purge';
    if (attack?.element === 'fire' || purge) { this.burn(world); return false; }
    if (this.state === 'idle') this.swell(world);
    return false;
  }
  near(p) {
    let hb = null;
    try { hb = p.hurtbox?.() ?? null; } catch { hb = null; }
    const r = hb && Number.isFinite(hb.x) ? hb : p;
    const dx = Math.max(r.x - this.cx, 0, this.cx - (r.x + r.w)), dy = Math.max(r.y - this.cy, 0, this.cy - (r.y + r.h));
    return dx * dx + dy * dy <= this.nearR * this.nearR;
  }
  swell(world) {
    this.setState('swell');
    audio.sfx('mist', { pitch: 1.7, vol: 0.3 });
  }
  burst(world) {
    this.setState('gone'); this.burned = false;
    this.blight(world)?.addCloud?.(this.cx - 80, this.cy - 60, 160, 120, 5);
    const fx = world.fx;
    fx?.burst?.('smoke', this.cx, this.cy, 10, { color: '#8ab030', speed: 90, alpha: 0.55 });
    fx?.burst?.('soul', this.cx, this.cy, 14, { color: '#d0ff70', speed: 170 });
    fx?.ring?.(this.cx, this.cy, { color: '#c8ff6a', r0: 10, r1: 90, life: 0.35, width: 5 });
    audio.sfx('explode', { pitch: 1.7, vol: 0.3 });
    audio.sfx('mist', { pitch: 0.6, vol: 0.5 });
  }
  burn(world) {
    this.setState('gone'); this.burned = true;
    const fx = world.fx;
    fx?.burst?.('ember', this.cx, this.cy, 18, { speed: 140 });
    fx?.burst?.('fire', this.cx, this.cy, 8, { speed: 90 });
    fx?.burst?.('smoke', this.cx, this.cy - 10, 6, { speed: 50 });
    audio.sfx('fire', { pitch: 1.25, vol: 0.5 });
  }
  respawnTime() { const v = Number(this.gimmick?.cfg?.podRespawn); return Number.isFinite(v) ? Math.max(0.5, v) : 12; }
  update(dt, world) {
    this.t += dt;
    if (!this.placed) this.place(world?.map);
    if (!world || world.cutscene) return;
    this.stateT += dt;
    switch (this.state) {
      case 'idle': { const p = world.player; if (p && !p.dead && this.near(p)) this.swell(world); break; }
      case 'swell': if (this.stateT >= 0.45) this.burst(world); break;
      case 'gone':
        if (!this.respawn) { if (this.stateT >= 1.5) this.dead = true; }
        else if (this.stateT >= this.respawnTime()) this.setState('grow');
        break;
      case 'grow': if (this.stateT >= 0.8) this.setState('idle'); break;
      default: this.setState('idle');
    }
  }
  lights(L) {
    if (this.state === 'gone') return;
    const k = this.state === 'swell' ? clamp(this.stateT / 0.45, 0, 1) : this.state === 'grow' ? clamp(this.stateT / 0.8, 0, 1) - 1 : 0;
    L.add(this.cx, this.cy, Math.max(20, 62 + 60 * k), '#b8e04a', clamp(0.3 + 0.4 * k, 0.05, 0.8));
  }
  draw(ctx, world) {
    if (!this.placed) this.place(world?.map);
    if (this.state === 'gone') { this.drawRemnant(ctx); return; }
    const t = this.t + this.seed, k = this.stateT;
    let sx = 1, sy = 1, ox = 0, glow = 0;
    if (this.state === 'swell') {
      const q = clamp(k / 0.45, 0, 1);
      sx = sy = 1 + 0.32 * q * q; ox = Math.sin(t * 60) * 2.2 * q; glow = q;
    } else if (this.state === 'grow') {
      const q = clamp(k / 0.8, 0, 1); sx = sy = 0.15 + 0.85 * (1 - Math.pow(1 - q, 3));
    } else {
      const b = Math.sin(t * 2.2); sx = 1 + 0.035 * b; sy = 1 - 0.035 * b;
    }
    const img = assets.get('props/prop_spore_pod') || podFallback();
    const W = 58, H = 58;
    ctx.save();
    ctx.translate(this.cx + ox, this.hang ? this.y - 4 : this.bottom + 3);
    ctx.scale(sx, this.hang ? -sy : sy);
    if (img) ctx.drawImage(img, -W / 2, -H, W, H);
    if (glow > 0) {
      const g = glowSprite();
      if (g) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.65 * glow * (0.7 + 0.3 * Math.sin(t * 40));
        ctx.drawImage(g, -W * 0.7, -H * 1.2, W * 1.4, W * 1.4);
      }
    }
    ctx.restore();
  }
  /** 터지거나 탄 뒤 남은 껍질 */
  drawRemnant(ctx) {
    const x = this.cx, base = this.hang ? this.y : this.bottom, d = this.hang ? 1 : -1;
    const q = this.respawn ? 1 : clamp(1.5 - this.stateT, 0, 1);
    ctx.save();
    ctx.globalAlpha = q;
    ctx.fillStyle = this.burned ? '#1c1612' : '#3a4818';
    ctx.beginPath();
    ctx.moveTo(x - 13, base); ctx.lineTo(x - 10, base + d * 11); ctx.lineTo(x - 4, base + d * 6);
    ctx.lineTo(x, base + d * 13); ctx.lineTo(x + 5, base + d * 7); ctx.lineTo(x + 10, base + d * 10); ctx.lineTo(x + 13, base);
    ctx.closePath(); ctx.fill();
    if (this.burned && this.stateT < 3) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ff8a3a';
      const a = clamp(1 - this.stateT / 3, 0, 1);
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(this.t * 9 + i * 1.7));
        ctx.fillRect(x - 9 + i * 6, base + d * (4 + (i % 2) * 4), 2, 2);
      }
    }
    ctx.restore();
  }
}

// ─────────────────────────── 등록 ───────────────────────────
/** 인자 정리: 순서와 무관하게 world / cfg / room 을 찾는다 */
function sortArgs(args) {
  let world = null, cfg = null, room = null;
  for (const a of args) {
    if (!a || typeof a !== 'object') continue;
    if (!world && Array.isArray(a.entities) && 'player' in a) world = a;
    else if (!room && Array.isArray(a.map)) room = a;
    else if (!cfg) cfg = a;
  }
  return [world, cfg, room ?? world?.room ?? null];
}
function kindFactory(Cls, kind) {
  // 일반 함수: new 로 불러도 반환한 객체가 결과가 된다
  function make(...args) { const [w, c, r] = sortArgs(args); return new Cls(w, c, r); }
  make.Class = Cls; make.kind = kind; make.create = make;
  return make;
}

export const GIMMICKS_B = {
  heartbeat: kindFactory(HeartbeatGimmick, 'heartbeat'),
  blight: kindFactory(BlightGimmick, 'blight'),
  voidwall: kindFactory(VoidWallGimmick, 'voidwall'),
};
