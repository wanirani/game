// 스테이지 기믹 엔진 (world2 §3.1–3.6 · §14, MASTER_PLAN §1.2 · §1.14) — owner: GIMMICK-ENGINE
// world.js·player.js·장면을 import 하지 않는다 (world 인스턴스를 받는다).
//
//  createGimmick(world, room) → GimmickSet | null        world.gimmick (loadRoom 의 마커·램프 뒤에서 호출)
//  resolveGimmickConfig(stage, room) → [{kind, …}]       room.gimmick: undefined → stage.gimmick, null → 없음, 객체/배열 → 그대로
//  GIMMICK_KINDS = ['mirror','magma','deep','wind','heartbeat','blight','voidwall']
//  class GimmickSet                                       합성 기믹 (world2 §3.2 공개 API)
//  class MirrorSwitch extends Entity                      맵 문자 'Q' (mirror 멤버가 만든다)
//  SporePod (gimmicks_b.js 에서 다시 export)               맵 문자 'y' (blight 멤버가 만든다)
//
// ── 멤버(종류별 기믹) 계약 — gimmicks_b.js 의 GIMMICKS_B 도 이 모양을 따른다 ────────────────────────────────
//  등록: 이 파일의 KINDS(mirror·magma·deep·wind) → 없으면 GIMMICKS_B[kind]. 모르는 종류는 console.warn 한 번 뒤 무시.
//  생성: 값이 class 면 new K(world, params, set), 그냥 함수면 K(world, params, set), {create} 객체면 K.create(world, params, set).
//        params = 맵의 기믹 객체 그대로 ({kind, …}; 기본값은 멤버가 채운다). 생성 시점엔 world.map · world.tiles · world.player
//        가 준비돼 있다. 자기 마커 소품(Q 거울 스위치, y 포자 주머니)은 멤버가 world.add 로 만든다. 생성 중 예외는 잡아서
//        그 멤버만 뺀다 (방 로딩은 멈추지 않는다).
//  필드: kind (없으면 설정의 kind 로 채움). 아래 메서드·게터는 모두 선택 (없으면 건너뜀):
//   update(dt, paused)        월드 시간 한 스텝 (히트스톱 중엔 불리지 않음). paused = world.cutscene → 진행은 멈추고 연출만
//   beforePlayer(p, dt)       매 스텝 플레이어 update 직전 (GimmickDirector — 엔티티 목록 맨 앞의 보이지 않는 개체)
//   prePhysics(p, dt) · postPhysics(p, dt)    Player.physics() 첫 줄 / 액체 처리 뒤
//   onJumpInput(p) → bool     true = 이번 스텝 점프 처리를 기믹이 가져감 (수영)
//   healMul() → n · noRegen · speedMul · bgFlip         합성: 곱 · OR · 곱 · OR
//   lights(L) · drawWorld(ctx, cam, 'under'|'back'|'front') · drawScreen(ctx, vw, vh, hud)
//        hud.meter() → 다음 게이지 줄 {x,y,w,h} (hudLayout().meter(i), 최대 3줄, world.hudHidden 이면 null)
//   onFell(p) · onRespawn() · cleanse(n) · reset() · dispose()
//  몸 판정: 플레이어는 AABB(x,y,w,h) 그대로 — 탈것을 타면 그 몸이 탈것 몸으로 바뀌어 있다 (companions §3). 수호신은 판정에서 뺀다.
//  공용 도우미 (function 선언이라 순환 import 에서도 안전 — 모듈 최상위가 아니라 메서드 안에서 부를 것):
//   solidAt · rectFree · rectHitsTile · bodyRect · setTile · gimmickBodies · liftOut · drawMeter · cachedCanvas · edgeVignette · warnOnce
// 주의 (순환 import): gimmicks_b.js 는 이 파일보다 먼저 평가된다 → gimmicks_b.js 에서 이 파일의 class 를 모듈 최상위에서
// extends 하면 TDZ 오류로 게임 전체가 멈춘다. 이 파일의 function 도우미는 메서드 안에서 얼마든지 써도 된다.
import { Entity } from './entity.js';
import { T, touchesType } from '../core/physics.js';
import { TILE } from '../core/game.js';
import { audio } from '../core/audio.js';
import { input } from '../core/input.js';
import { assets } from '../core/assets.js';
import { bus } from '../core/events.js';
import { text } from '../core/ui.js';
import { clamp, approach, rand, TAU, ease } from '../core/math.js';
import { hudLayout } from '../render/hud_layout.js';
import { GIMMICKS_B } from './gimmicks_b.js';
export { SporePod } from './gimmicks_b.js';

export const GIMMICK_KINDS = ['mirror', 'magma', 'deep', 'wind', 'heartbeat', 'blight', 'voidwall'];

// ───────────────────────────── 공용 도우미 ─────────────────────────────
const _warned = new Set();
/** 같은 key 의 경고는 한 번만 */
export function warnOnce(key, ...msg) { if (_warned.has(key)) return; _warned.add(key); console.warn(...msg); }
/** 입력 버퍼 창 + 최근 히트스톱 보정 (MASTER_PLAN R16 — 멈춘 동안 누른 입력도 놓치지 않게) */
export function bufWindow(world, base) { return base + Math.min(0.3, world?.frozenRecent ?? 0); }
/** 설정 '동작 줄이기' */
export function reducedMotion(world) { return !!world?.game?.settings?.reduceMotion; }
/** (tx,ty) 가 벽(SOLID/BREAK)인가 (맵 밖 규칙은 TileMap.typeAt) */
export function solidAt(map, tx, ty) { const t = map.typeAt(tx, ty); return t === T.SOLID || t === T.BREAK; }
/** 사각형(월드 px)이 벽 타일과 겹치지 않는가 */
export function rectFree(map, r) {
  const x0 = Math.floor(r.x / TILE), x1 = Math.floor((r.x + r.w - 0.01) / TILE);
  const y0 = Math.floor(r.y / TILE), y1 = Math.floor((r.y + r.h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(map, tx, ty)) return false;
  return true;
}
/** 사각형(또는 x,y,w,h 를 가진 개체)이 타일 (tx,ty) 와 겹치는가 (inflate px 만큼 부풀려서) */
export function rectHitsTile(r, tx, ty, inflate = 0) {
  const x = tx * TILE, y = ty * TILE;
  return r.x - inflate < x + TILE && r.x + r.w + inflate > x && r.y - inflate < y + TILE && r.y + r.h + inflate > y;
}
/** 개체의 몸 AABB (탈것을 탄 플레이어는 탈것 몸) */
export function bodyRect(e, inflate = 0) { return { x: e.x - inflate, y: e.y - inflate, w: e.w + inflate * 2, h: e.h + inflate * 2 }; }
/** 타일 종류 바꾸기 + 렌더 캐시 무효화. 바뀌었으면 true */
export function setTile(world, tx, ty, type) {
  const m = world.map;
  if (!m || tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return false;
  if (m.tiles[ty * m.w + tx] === type) return false;
  m.set(tx, ty, type);
  world.tiles?.invalidate?.(tx, ty);
  return true;
}
/** 기믹 겹침 판정에 드는 몸: 플레이어 + 적 (+ 보스). 수호신·탈것 유령·투사체·소품은 빠진다 */
export function gimmickBodies(world, { player = true, bosses = true } = {}) {
  const out = [];
  const p = world.player;
  if (player && p && !p.dead) out.push(p);
  for (const e of world.entities) {
    if (e.dead || (e.dying > 0)) continue;
    if (e.kind === 'enemy' || (bosses && e.kind === 'boss')) out.push(e);
  }
  return out;
}
/**
 * 벽에 낀 개체를 위쪽 첫 빈자리로 올린다 (성공 true). 발밑을 타일 윗면에 맞춰 올리므로 걷는 적은 새 바닥 위에 선다.
 * 후보: 발이 든 칸의 윗면, 그보다 1칸·2칸… 위 (합쳐서 최대 maxTiles 칸 이내로만 올린다)
 */
export function liftOut(world, e, maxTiles = 3) {
  const b0 = Math.floor((e.y + e.h - 0.01) / TILE) * TILE;
  for (let k = 0; k <= maxTiles; k++) {
    const bottom = b0 - k * TILE;
    if (e.y + e.h - bottom > maxTiles * TILE + 0.5) break;
    const r = { x: e.x, y: bottom - e.h, w: e.w, h: e.h };
    if (rectFree(world.map, r)) { e.y = r.y; if (e.vy > 0) e.vy = 0; return true; }
  }
  return false;
}
const _canvases = new Map();
/** 한 번만 그려 두는 캔버스 (그라데이션·스프라이트 캐시) */
export function cachedCanvas(key, w, h, paint) {
  let c = _canvases.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    _canvases.set(key, c);
  }
  return c;
}
/** 화면 가장자리 비네트 스프라이트 (색별 캐시) — ctx.drawImage(v, 0, 0, vw, vh) 로 늘여 그린다 */
export function edgeVignette(color) {
  return cachedCanvas('vig:' + color, 192, 108, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, h * 0.32, w / 2, h / 2, w * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, color);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
/**
 * 상단 가운데 기믹 게이지 한 줄 (hud.meter() 가 준 칸 r 안에만 그린다).
 * opts: { blink, time, sub(오른쪽 작은 글), labelColor }
 */
export function drawMeter(ctx, r, label, ratio, color, { blink = false, time = 0, sub = null, labelColor = '#ffffff' } = {}) {
  if (!r) return;
  const on = !blink || Math.sin(time * 16) > -0.3;
  ctx.save();
  ctx.globalAlpha = on ? 1 : 0.45;
  ctx.fillStyle = 'rgba(8,4,12,0.72)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const bh = Math.max(4, Math.min(12, r.h - 4)), by = r.y + (r.h - bh) / 2, bw = r.w - 4;
  const fw = bw * clamp(ratio, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(r.x + 2, by, bw, bh);
  ctx.fillStyle = color; ctx.fillRect(r.x + 2, by, fw, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(r.x + 2, by, fw, Math.min(2, bh));
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  const ty = r.y + r.h / 2 + 1;
  text(ctx, label, r.x + 8, ty, { size: 12, weight: 800, color: labelColor, baseline: 'middle', ow: 3 });
  if (sub) text(ctx, sub, r.x + r.w - 8, ty, { size: 12, weight: 700, color: labelColor, align: 'right', baseline: 'middle', ow: 3 });
  ctx.restore();
}
/** 거품 스프라이트 (캐시) */
function bubbleSprite() {
  return cachedCanvas('bubble', 16, 16, (g) => {
    const gr = g.createRadialGradient(6, 6, 1, 8, 8, 7.5);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(190,240,255,0.18)'); gr.addColorStop(0.85, 'rgba(160,230,255,0.35)'); gr.addColorStop(1, 'rgba(160,230,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(8, 8, 7.5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(220,250,255,0.75)'; g.lineWidth = 1; g.beginPath(); g.arc(8, 8, 6.5, 0, TAU); g.stroke();
  });
}
function emitBubbles(world, x, y, n) {
  const fx = world.fx, k = Math.max(1, Math.round(n * (fx.quality ?? 1)));
  for (let i = 0; i < k; i++) fx.emit('soul', x + rand(-6, 6), y + rand(-4, 4), { color: '#cfefff', grav: -260, speed: rand(20, 60), angle: -Math.PI / 2, spread: 0.7, size: rand(1.6, 3.4), life: rand(0.5, 1.0), add: false, alpha: 0.8 });
}
/** 타일 문자 마커들을 세로로 이어진 기둥 [{tx, ty0, ty1}] 로 묶는다 */
function columnsOf(markers) {
  const byX = new Map();
  for (const m of markers) { if (!byX.has(m.tx)) byX.set(m.tx, []); byX.get(m.tx).push(m.ty); }
  const out = [];
  for (const [tx, ys] of byX) {
    ys.sort((a, b) => a - b);
    let s = ys[0], prev = ys[0];
    for (let i = 1; i <= ys.length; i++) {
      if (i < ys.length && ys[i] === prev + 1) { prev = ys[i]; continue; }
      out.push({ tx, ty0: s, ty1: prev });
      if (i < ys.length) { s = prev = ys[i]; }
    }
  }
  return out;
}

// ───────────────────────────── 생성 · 합성 ─────────────────────────────
/** 방의 실제 기믹 설정 목록 (world2 §3.1) */
export function resolveGimmickConfig(stage, room) {
  const raw = room && room.gimmick !== undefined ? room.gimmick : stage?.gimmick;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).filter((g) => g && typeof g === 'object' && typeof g.kind === 'string');
}

function instantiate(K, world, params, set) {
  if (typeof K === 'function') {
    const src = Function.prototype.toString.call(K);
    const isCtor = /^class[\s{]/.test(src) || (K.prototype && Object.getOwnPropertyNames(K.prototype).length > 1);
    return isCtor ? new K(world, params, set) : K(world, params, set);
  }
  if (K && typeof K.create === 'function') return K.create(world, params, set);
  return null;
}

export function createGimmick(world, room) {
  if (!world?.map) return null;
  const cfg = resolveGimmickConfig(world.stage, room);
  if (!cfg.length) return null;
  const set = new GimmickSet(world, room);
  for (const params of cfg) {
    const kind = params.kind;
    if (set.get(kind)) { warnOnce('gdup:' + kind, `[gimmick] 같은 종류 '${kind}' 가 두 번 설정됨 — 두 번째는 무시`); continue; }
    const K = KINDS[kind] ?? GIMMICKS_B?.[kind];
    if (!K) { warnOnce('gkind:' + kind, `[gimmick] 알 수 없는 기믹 종류 '${kind}' — 무시`); continue; }
    let m = null;
    try { m = instantiate(K, world, params, set); } catch (e) { console.error(`[gimmick] '${kind}' 생성 실패`, e); }
    if (!m) continue;
    if (!m.kind) m.kind = kind;
    set.members.push(m);
  }
  if (!set.members.length) return null;
  if (set.members.some((m) => typeof m.beforePlayer === 'function')) set.attachDirector();
  return set;
}

/** 매 스텝 플레이어보다 먼저 update 되는 보이지 않는 개체 (엔티티 목록 맨 앞) — 멤버의 beforePlayer 를 부른다 */
class GimmickDirector extends Entity {
  constructor(set) {
    super(-9999, -9999, 1, 1);
    this.kind = 'gimmick'; this.z = -99; this.hidden = true; this.set = set;
  }
  update(dt, world) {
    this.t += dt;
    if (world.gimmick !== this.set) { this.dead = true; return; }
    this.set.beforePlayer(dt);
  }
}

export class GimmickSet {
  constructor(world, room) {
    this.world = world; this.room = room;
    this.members = [];
    this.t = 0;
    this.director = null;
    this._hudI = 0; this._hudLay = null; this._hudVW = 0; this._hudVH = 0;
    this.hud = { meter: () => this._meter() };
  }
  get kinds() { return this.members.map((m) => m.kind); }
  get(kind) { for (const m of this.members) if (m.kind === kind) return m; return null; }
  has(kind) { return !!this.get(kind); }
  attachDirector() {
    const w = this.world;
    if (this.director && !this.director.dead) return;
    this.director = new GimmickDirector(this);
    this.director.world = w;
    w.entities.unshift(this.director);
  }
  update(dt) {
    this.t += dt;
    const paused = !!this.world.cutscene;
    for (const m of this.members) m.update?.(dt, paused);
  }
  beforePlayer(dt) {
    const p = this.world.player;
    if (!p) return;
    for (const m of this.members) m.beforePlayer?.(p, dt);
  }
  prePhysics(p, dt) { for (const m of this.members) m.prePhysics?.(p, dt); }
  postPhysics(p, dt) { for (const m of this.members) m.postPhysics?.(p, dt); }
  onJumpInput(p) { for (const m of this.members) if (m.onJumpInput?.(p)) return true; return false; }
  healMul() {
    let k = 1;
    for (const m of this.members) { const v = typeof m.healMul === 'function' ? m.healMul() : m.healMul; if (typeof v === 'number' && Number.isFinite(v)) k *= v; }
    return k;
  }
  get noRegen() { for (const m of this.members) if (m.noRegen) return true; return false; }
  get speedMul() {
    let k = 1;
    for (const m of this.members) { const v = m.speedMul; if (typeof v === 'number' && Number.isFinite(v)) k *= v; }
    return k;
  }
  get bgFlip() { for (const m of this.members) if (m.bgFlip) return true; return false; }
  lights(L) { for (const m of this.members) m.lights?.(L); }
  drawWorld(ctx, cam, layer) { for (const m of this.members) m.drawWorld?.(ctx, cam, layer); }
  drawScreen(ctx, vw, vh) {
    this._hudI = 0; this._hudLay = null; this._hudVW = vw; this._hudVH = vh;
    for (const m of this.members) m.drawScreen?.(ctx, vw, vh, this.hud);
  }
  _meter() {
    const w = this.world;
    if (w.hudHidden || this._hudI >= 3) return null;
    this._hudLay ??= hudLayout(w, this._hudVW, this._hudVH);
    return this._hudLay?.meter?.(this._hudI++) ?? null;
  }
  onFell(p) { for (const m of this.members) m.onFell?.(p); }
  onRespawn() { for (const m of this.members) m.onRespawn?.(); }
  cleanse(n) { for (const m of this.members) m.cleanse?.(n); }
  reset() { for (const m of this.members) m.reset?.(); }
  dispose() {
    for (const m of this.members) m.dispose?.();
    if (this.director) this.director.dead = true;
    this.director = null;
  }
}

// ───────────────────────────── mirror: 거울 (실상 A / 허상 B) ─────────────────────────────
const MIRROR_TINT = { A: '#e8e0d0', B: '#9fe8ff' };

class MirrorGimmick {
  constructor(world, params, set) {
    this.kind = 'mirror'; this.world = world; this.set = set;
    this.params = { start: 'A', cooldown: 0.8, auto: 0, ...params };
    this.start = this.params.start === 'B' ? 'B' : 'A';
    this.tiles = (world.map.phaseTiles ?? []).filter((pt) => pt.key === 'A' || pt.key === 'B');
    this.phase = 'A';   // TileMap 은 A상(a 벽 · b 빈칸)으로 지어 둔다
    this.cooldown = 0; this.t = 0; this.flashT = 0;
    this.auto = Math.max(0, +this.params.auto || 0); this.autoT = this.auto;
    this.switches = [];
    for (const mk of world.map.markersOf('Q')) this.switches.push(world.add(new MirrorSwitch(mk.tx, mk.ty, this)));
    if (this.start === 'B') this.apply('B');
  }
  get bgFlip() { return this.phase === 'B'; }
  /** 자동 뒤집기 1초 전 경고 중 */
  get warning() { return this.auto > 0 && this.autoT <= 1.0; }
  apply(next) {
    const w = this.world;
    for (const pt of this.tiles) setTile(w, pt.tx, pt.ty, pt.key === next ? T.SOLID : T.EMPTY);
    this.phase = next;
  }
  /** 위상 뒤집기. force = 쿨다운·플레이어 겹침 무시. src = 뒤집은 스위치 (거절 시 그 스위치만 흔들림) */
  flip(force = false, src = null) {
    const w = this.world;
    if (this.cooldown > 0 && !force) return false;
    const next = this.phase === 'A' ? 'B' : 'A';
    const solidNext = this.tiles.filter((pt) => pt.key === next);
    const p = w.player;
    if (!force && p && !p.dead) {
      const r = bodyRect(p, 2);
      if (solidNext.some((pt) => rectHitsTile(r, pt.tx, pt.ty))) {
        audio.sfx('clang', { pitch: 1.4 });
        for (const s of src ? [src] : this.switches) s.shakeT = 0.25;
        const s0 = src ?? p;
        w.fx.burst('ice', s0.cx, s0.y + 30, 5, { speed: 90 });
        return false;
      }
    }
    this.apply(next);
    const hits = (e) => { for (const pt of solidNext) if (rectHitsTile(e, pt.tx, pt.ty)) return true; return false; };
    // 새로 생긴 벽에 낀 적은 1~3칸 위로, 자리가 없으면 조용히 사라진다 (전리품·처치 기록 없음). 줍는 물건도 위로 (없으면 그대로)
    for (const e of w.entities) {
      if (e.dead) continue;
      if (e.kind === 'enemy') { if (hits(e) && !liftOut(w, e, 3)) e.dead = true; }
      else if (e.kind === 'pickup') { if (hits(e)) liftOut(w, e, 3); }
    }
    if (p && !p.dead) {
      if (hits(p)) liftOut(w, p, 3);   // 강제로 뒤집었을 때만 생긴다
      p.iframes = Math.max(p.iframes ?? 0, 0.3);
    }
    w.game?.flash?.('#dff4ff', 0.35, 4);
    audio.sfx('mist', { pitch: 1.6 });
    const s0 = src ?? p;
    if (s0) w.fx.burst('shard', s0.cx, s0.y + (src ? 40 : s0.h / 2), 18, { color: '#dff4ff' });
    for (const s of this.switches) s.glowT = 0.5;
    this.cooldown = +this.params.cooldown || 0;
    this.flashT = 0.35;
    return true;
  }
  setAuto(sec) { this.auto = Math.max(0, +sec || 0); this.autoT = this.auto; }
  update(dt, paused) {
    this.t += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (paused) return;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.auto > 0) {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        this.cooldown = 0;
        this.autoT = this.flip(false) ? this.auto : 0.3;   // 플레이어가 겹쳐 거절되면 0.3초 뒤 다시 (경고 유지)
      }
    }
  }
  reset() {
    if (this.phase !== this.start) this.apply(this.start);
    this.cooldown = 0; this.flashT = 0;
    this.auto = Math.max(0, +this.params.auto || 0); this.autoT = this.auto;
  }
  onRespawn() { this.reset(); }
  drawWorld(ctx, cam, layer) {
    if (layer !== 'back' || !this.tiles.length) return;
    const x0 = cam.x - TILE, x1 = cam.x + cam.vw, y0 = cam.y - TILE, y1 = cam.y + cam.vh;
    const vis = (pt) => { const x = pt.tx * TILE, y = pt.ty * TILE; return x >= x0 && x <= x1 && y >= y0 && y <= y1; };
    const blink = this.warning ? 0.5 + 0.5 * Math.sin(this.t * 18) : 0;
    ctx.save();
    // 비활성 위상 타일: 유령 윤곽
    ctx.beginPath();
    let n = 0;
    for (const pt of this.tiles) if (pt.key !== this.phase && vis(pt)) { ctx.rect(pt.tx * TILE + 1, pt.ty * TILE + 1, TILE - 2, TILE - 2); n++; }
    if (n) {
      ctx.fillStyle = `rgba(200,230,255,${(0.07 + 0.16 * blink).toFixed(3)})`;
      ctx.fill();
      ctx.setLineDash([6, 6]); ctx.lineDashOffset = reducedMotion(this.world) ? 0 : -this.t * 10;
      ctx.strokeStyle = `rgba(200,230,255,${(0.35 + 0.4 * blink).toFixed(3)})`; ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 활성 위상 타일: 안쪽 은빛 테두리 (+ 뒤집힌 직후 번쩍임)
    ctx.beginPath();
    n = 0;
    for (const pt of this.tiles) if (pt.key === this.phase && vis(pt)) { ctx.rect(pt.tx * TILE + 2, pt.ty * TILE + 2, TILE - 4, TILE - 4); n++; }
    if (n) {
      if (this.flashT > 0) { ctx.fillStyle = `rgba(230,248,255,${(0.5 * this.flashT / 0.35).toFixed(3)})`; ctx.fill(); }
      ctx.strokeStyle = this.phase === 'B' ? 'rgba(190,240,255,0.5)' : 'rgba(223,232,240,0.5)';
      ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }
  drawScreen(ctx, vw, vh) {
    if (this.phase !== 'B') return;
    ctx.save();
    ctx.fillStyle = 'rgba(150,200,255,0.06)'; ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = 0.12; ctx.drawImage(edgeVignette('rgb(90,220,255)'), 0, 0, vw, vh);
    ctx.restore();
  }
}

/** 거울 스위치 'Q' (1×2칸, 아래끝 = 마커 칸 아래끝). 때리거나 ▲ 로 위상을 뒤집는다 */
export class MirrorSwitch extends Entity {
  constructor(tx = 0, ty = 0, mirror = null) {
    super(tx * TILE, (ty + 1) * TILE - 96, 48, 96);
    this.kind = 'prop'; this.z = 2; this.mirror = mirror;
    this.stats = { def: 0, res: 0 };
    this.def = { id: 'mirror_switch', material: 'ice' };
    this.shakeT = 0; this.glowT = 0; this.near = false;
    this.noGuardianHit = true;   // 수호신 공격은 스위치를 건드리지 않는다 (MASTER_PLAN §1.2)
  }
  hurtbox() { return this.rect(); }
  takeHit(dmg, attack, world) {
    if (attack?.tags?.includes('companion')) return false;
    this.mirror?.flip(false, this);
    return false;
  }
  update(dt, world) {
    this.t += dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.glowT > 0) this.glowT -= dt;
    const p = world.player;
    this.near = !!p && !p.dead && Math.abs(p.cx - this.cx) < 40 && Math.abs(p.bottom - this.bottom) < 30;
    if (this.near && !world.cutscene && !world.inputLock && input.buffered('up', bufWindow(world, 0.1))) {
      input.consume('up');
      this.mirror?.flip(false, this);
    }
  }
  lights(L) { L.add(this.cx, this.y + 36, 90, '#dff4ff', 0.5); }
  /** 받침 그림을 위상 색으로 물들인 사본 (이미지별·위상별 캐시) */
  tinted(img, phase) {
    const cache = (MirrorSwitch._tint ??= new Map());
    let c = cache.get(phase);
    if (c && c.src === img) return c.canvas;
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = phase === 'B' ? 'rgba(120,220,255,0.38)' : 'rgba(255,236,200,0.22)';
    g.fillRect(0, 0, cv.width, cv.height);
    cache.set(phase, { src: img, canvas: cv });
    return cv;
  }
  draw(ctx, world) {
    const ph = this.mirror?.phase ?? 'A', tint = MIRROR_TINT[ph];
    const sx = this.shakeT > 0 ? Math.sin(this.t * 90) * 3 * (this.shakeT / 0.25) : 0;
    const cool = (this.mirror?.cooldown ?? 0) > 0;
    const x = this.x + sx, y = this.y, cx = this.cx + sx, b = this.bottom;
    const img = assets.get('props/prop_mirror_switch');
    ctx.save();
    if (img) ctx.drawImage(this.tinted(img, ph), x, y, this.w, this.h);
    else {
      // 은빛 아치 틀
      ctx.fillStyle = '#2a2c34'; ctx.fillRect(x + 4, b - 8, 40, 8);
      ctx.fillStyle = '#b8bcc8';
      ctx.beginPath(); ctx.moveTo(x + 6, b - 8); ctx.lineTo(x + 6, y + 26); ctx.quadraticCurveTo(cx, y - 6, x + 42, y + 26); ctx.lineTo(x + 42, b - 8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5a5e6a'; ctx.lineWidth = 2; ctx.stroke();
      const g = ctx.createLinearGradient(x, y, x + 48, b);
      g.addColorStop(0, tint); g.addColorStop(1, ph === 'B' ? '#3a7a9a' : '#8a8478');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x + 11, b - 12); ctx.lineTo(x + 11, y + 28); ctx.quadraticCurveTo(cx, y + 4, x + 37, y + 28); ctx.lineTo(x + 37, b - 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#dfe2ea'; ctx.beginPath(); ctx.arc(cx, y + 4, 3, 0, TAU); ctx.fill();
    }
    // 유리 면: 금, 느린 윤슬, 위상 색 광택
    ctx.beginPath(); ctx.moveTo(x + 12, b - 13); ctx.lineTo(x + 12, y + 30); ctx.quadraticCurveTo(cx, y + 7, x + 36, y + 30); ctx.lineTo(x + 36, b - 13); ctx.closePath();
    ctx.save(); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const band = ((this.t * 0.35) % 1.6) - 0.3;
    const gy = y + 10 + band * 90;
    const sh = ctx.createLinearGradient(x, gy - 20, x + 48, gy + 20);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, `rgba(255,255,255,${cool ? 0.08 : 0.22})`); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(x, y, 48, 96);
    if (this.glowT > 0) { ctx.fillStyle = `rgba(200,240,255,${(0.6 * this.glowT / 0.5).toFixed(3)})`; ctx.fillRect(x, y, 48, 96); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 30, y + 30); ctx.lineTo(x + 24, y + 44); ctx.lineTo(x + 28, y + 52); ctx.moveTo(x + 24, y + 44); ctx.lineTo(x + 16, y + 50); ctx.moveTo(x + 18, b - 30); ctx.lineTo(x + 26, b - 22); ctx.stroke();
    ctx.restore();
    // 발밑 위상 빛
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = ph === 'B' ? 'rgba(90,220,255,0.18)' : 'rgba(255,230,190,0.14)';
    ctx.beginPath(); ctx.ellipse(cx, b, 30, 6, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (this.near && !world.cutscene) text(ctx, cool ? '…' : '▲', this.cx, this.y - 8, { size: 16, align: 'center', color: '#dff4ff' });
  }
}

// ───────────────────────────── magma: 용암 수위 ─────────────────────────────
const MAGMA_GRAD_H = 240;
function magmaBodySprite() {
  return cachedCanvas('magma:body', 2, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#ffb040'); gr.addColorStop(0.35, '#ff5a1a'); gr.addColorStop(1, '#7a1004');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function magmaBandSprite() {
  return cachedCanvas('magma:band', 2, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,190,90,0)'); gr.addColorStop(0.2, 'rgba(255,170,70,0.55)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
/** 용암 표면의 굳은 껍질·갈라진 빛 (가로로 이어지는 256px 타일, 캐시) */
function magmaCrustSprite() {
  return cachedCanvas('magma:crust', 256, 64, (g, w, h) => {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w, y = 6 + rnd() * (h - 12), rx = 10 + rnd() * 26, ry = 3 + rnd() * 6;
      for (const ox of [x - w, x, x + w]) {   // 가로로 이음매 없이
        g.fillStyle = `rgba(90,12,2,${(0.25 + rnd() * 0.3).toFixed(2)})`;
        g.beginPath(); g.ellipse(ox, y, rx, ry, (rnd() - 0.5) * 0.4, 0, TAU); g.fill();
      }
    }
    g.strokeStyle = 'rgba(255,225,140,0.45)'; g.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      let x = rnd() * w, y = 8 + rnd() * (h - 16);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += 6 + rnd() * 12; y += (rnd() - 0.5) * 8; g.lineTo(x, y); }
      g.stroke();
    }
  });
}
function heatSprite() {
  return cachedCanvas('magma:heat', 2, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,90,20,0)'); gr.addColorStop(1, 'rgba(255,90,20,1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

class MagmaGimmick {
  constructor(world, params, set) {
    this.kind = 'magma'; this.world = world; this.set = set;
    const mode = params.mode ?? (params.low !== undefined ? 'tide' : params.y0 !== undefined ? 'rise' : 'manual');
    this.params = { period: 9, hold: 2.5, warn: 1.5, speed: 40, ...params, mode };
    this.t = 0; this.emitAcc = 0; this.fellCd = 0; this.fellFlag = false;
    this.reset();
  }
  /** 방 로딩 때의 상태로 (부활 · 보스 onReset) */
  reset() {
    const P = this.params, H = this.world.map.h;
    this.mode = P.mode;
    this.lowPx = (P.low ?? H) * TILE;
    this.highPx = (P.high ?? (P.low ?? H) - 2) * TILE;
    this.y0px = (P.y0 ?? H) * TILE;
    this.y1px = (P.y1 ?? 0) * TILE;
    this.rising = false;
    this.state = 'rest'; this.st = 0; this.warnSfx = false;
    this.lvSpeed = 120;
    if (this.mode === 'tide') this.level = this.lowPx;
    else if (this.mode === 'rise') this.level = this.y0px;
    else this.level = (P.level ?? H + 1) * TILE;
    this.target = this.level;
  }
  get restTime() { const P = this.params; return Math.max(0.5, P.period - P.warn - 1.2 - P.hold - 1.5); }
  /** 멈춰 있는가 (보스 패턴 'tide' 판단용) */
  get atRest() {
    if (this.mode === 'tide') return this.state === 'rest';
    if (this.mode === 'rise') return !this.rising || this.level <= this.y1px;
    return Math.abs(this.level - this.target) < 1;
  }
  /** 수위를 row(타일 단위, 소수 허용)로 speed px/s 만큼씩 옮긴다 (manual 로 바뀐다). speed ≤ 0 이면 즉시 */
  setLevel(row, speed = 120) {
    this.mode = 'manual';
    this.target = row * TILE;
    this.lvSpeed = speed;
    if (!(speed > 0)) this.level = this.target;
  }
  /** 모드 바꾸기. opts 로 그 모드의 수치(low/high/period… y0/y1/speed/trigger)를 덮어쓴다 */
  setMode(mode, opts = null) {
    if (opts) Object.assign(this.params, opts);
    const P = this.params;
    this.mode = mode;
    if (mode === 'tide') {
      if (opts?.low !== undefined) this.lowPx = opts.low * TILE;
      if (opts?.high !== undefined) this.highPx = opts.high * TILE;
      this.state = 'rest'; this.st = 0;
    } else if (mode === 'rise') {
      if (opts?.y0 !== undefined) this.y0px = P.y0 * TILE;
      if (opts?.y1 !== undefined) this.y1px = P.y1 * TILE;
      this.rising = true;
    } else this.target = this.level;
  }
  update(dt, paused) {
    this.t += dt;
    if (this.fellCd > 0) this.fellCd -= dt;
    if (!paused) this.step(dt);
    this.emit(dt);
  }
  step(dt) {
    const P = this.params, w = this.world;
    if (this.mode === 'tide') {
      this.st += dt;
      const next = (s, dur) => { if (this.st >= dur) { this.st -= dur; this.state = s; return true; } return false; };
      switch (this.state) {
        case 'rest': this.level = this.lowPx; if (next('warn', this.restTime)) { audio.sfx('fire', { pitch: 0.6 }); } break;
        case 'warn': this.level = this.lowPx; next('rise', P.warn); break;
        case 'rise': this.level = this.lowPx + (this.highPx - this.lowPx) * ease.inOutQuad(Math.min(1, this.st / 1.2)); if (next('hold', 1.2)) this.level = this.highPx; break;
        case 'hold': this.level = this.highPx; next('fall', P.hold); break;
        case 'fall': this.level = this.highPx + (this.lowPx - this.highPx) * ease.inOutQuad(Math.min(1, this.st / 1.5)); if (next('rest', 1.5)) this.level = this.lowPx; break;
        default: this.state = 'rest'; this.st = 0;
      }
    } else if (this.mode === 'rise') {
      const p = w.player;
      if (!this.rising && p && !p.dead) {
        const feetRow = Math.floor((p.bottom - 1) / TILE);
        if (feetRow < (P.trigger ?? (P.y0 ?? w.map.h) - 6)) this.rising = true;
      }
      if (this.rising && this.level > this.y1px) this.level = Math.max(this.y1px, this.level - (P.speed ?? 40) * dt);
    } else {
      this.level = approach(this.level, this.target, (this.lvSpeed > 0 ? this.lvSpeed : 1e9) * dt);
    }
  }
  /** 화면 안 수면을 따라 불씨 (품질 배율) */
  emit(dt) {
    const w = this.world, cam = w.camera;
    if (!cam || this.level < cam.y - 40 || this.level > cam.y + cam.vh + 40) return;
    const warn = this.mode === 'tide' && this.state === 'warn';
    this.emitAcc += dt * (warn ? 34 : 12) * (cam.vw / 960) * (w.fx.quality ?? 1);
    let guard = 6;
    while (this.emitAcc >= 1 && guard-- > 0) {
      this.emitAcc -= 1;
      const x = cam.x + Math.random() * cam.vw;
      if (solidAt(w.map, Math.floor(x / TILE), Math.floor((this.level + 2) / TILE))) continue;
      w.fx.emit('ember', x, this.level + rand(0, 6), { angle: -Math.PI / 2, spread: 0.6, speed: warn ? 110 : 60 });
      if (warn && Math.random() < 0.3) w.fx.emit('fire', x, this.level + 4, { angle: -Math.PI / 2, spread: 0.4, speed: 50, size: rand(6, 10) });
    }
    if (this.emitAcc > 3) this.emitAcc = 0;
  }
  postPhysics(p, dt) {
    const w = this.world;
    if (p.dead || w.cleared) return;
    if (p.bottom <= this.level + 6) return;
    if (!p.invuln && !(p.mount?.riding && p.mount.hazard?.('lava', p, w))) {
      p.takeHit(Math.ceil(p.stats.hp * 0.10), { team: 'enemy', dir: -p.facing, kb: [0, -760], flat: 1, element: 'fire' }, w, {});
      w.fx.burst('fire', p.cx, this.level, 10, { angle: -Math.PI / 2, spread: 0.8, speed: 160 });
    }
    // 완전히 잠김 → 낙사 처리 (체력 25%, 안전 지점으로)
    if (p.y > this.level + 12 && this.fellCd <= 0 && !p.dead) {
      this.fellCd = 1.0; this.fellFlag = false;
      w.onPlayerFell?.(p);
      if (!this.fellFlag && !p.dead) this.onFell(p);   // world 의 onFell 훅이 아직 없을 때
    }
  }
  onFell(p) {
    this.fellFlag = true;
    if (p.dead) return;
    if (this.mode === 'rise') {
      this.level = Math.min(this.y0px, Math.max(this.level, p.bottom + 5 * TILE));
      return;
    }
    if (p.bottom > this.level - 2) this.rescue(p);
  }
  /** 수위 위의 가장 가까운 설 자리로 옮긴다 (안전 지점이 용암에 잠긴 경우) */
  rescue(p) {
    const w = this.world, m = w.map;
    const ptx = Math.floor(p.cx / TILE), topRow = Math.floor((this.level - 4) / TILE) - 1;
    for (let d = 0; d <= m.w; d++) {
      for (const tx of d ? [ptx - d, ptx + d] : [ptx]) {
        if (tx < 0 || tx >= m.w) continue;
        for (let ty = topRow; ty >= 1; ty--) {
          const fl = m.typeAt(tx, ty + 1);
          if (!(fl === T.SOLID || fl === T.BREAK || fl === T.ONEWAY)) continue;
          const r = { x: tx * TILE + TILE / 2 - p.w / 2, y: (ty + 1) * TILE - p.h, w: p.w, h: p.h };
          if ((ty + 1) * TILE > this.level - 4 || !rectFree(m, r)) continue;
          p.x = r.x; p.y = r.y; p.vx = 0; p.vy = 0;
          return true;
        }
      }
    }
    const cp = w.run?.checkpoint;
    if (cp && cp.roomId === w.roomId) { p.x = cp.x; p.y = cp.y; p.vx = 0; p.vy = 0; }
    return false;
  }
  onRespawn() { this.reset(); }
  /** 수면 칸이 벽이 아닌 열 구간 [x0,x1] 목록 (화면 안) */
  openRuns(y, cam) {
    const m = this.world.map, ty = Math.floor(y / TILE);
    const tx0 = Math.floor(cam.x / TILE) - 1, tx1 = Math.floor((cam.x + cam.vw) / TILE) + 1;
    const out = (this._runs ??= []);
    out.length = 0;
    let s = null;
    for (let tx = tx0; tx <= tx1 + 1; tx++) {
      const open = tx <= tx1 && !solidAt(m, tx, ty);
      if (open && s === null) s = tx;
      else if (!open && s !== null) { out.push(s * TILE, tx * TILE); s = null; }
    }
    return out;
  }
  drawWorld(ctx, cam, layer) {
    const w = this.world, lv = this.level, mH = w.map.pxH;
    if (lv >= mH + 20 || lv > cam.y + cam.vh + 40) return;
    const x0 = cam.x - 8, vw = cam.vw + 16;
    if (layer === 'under') {
      if (lv + MAGMA_GRAD_H > cam.y - 8) ctx.drawImage(magmaBodySprite(), 0, 0, 2, 128, x0, lv - 4, vw, MAGMA_GRAD_H + 4);
      const dTop = Math.max(lv + MAGMA_GRAD_H, cam.y - 8), dBot = Math.min(mH + 400, cam.y + cam.vh + 8);
      if (dBot > dTop) { ctx.fillStyle = '#7a1004'; ctx.fillRect(x0, dTop, vw, dBot - dTop); }
      // 굳은 껍질 두 겹 (느리게 흘러간다)
      if (lv + 70 > cam.y) {
        const cr = magmaCrustSprite();
        for (let k = 0; k < 2; k++) {
          const off = ((this.t * (k ? -6 : 11)) % 256 + 256) % 256, yy = lv + 4 + k * 40;
          ctx.globalAlpha = k ? 0.45 : 0.85;
          for (let x = Math.floor((x0 - off) / 256) * 256 + off; x < x0 + vw; x += 256) ctx.drawImage(cr, x, yy, 256, 48);
        }
        ctx.globalAlpha = 1;
      }
      // 빛나는 결 (느리게 흐르는 밝은 선)
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,190,90,0.18)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 2; k++) {
        const yy = lv + 26 + k * 34;
        if (yy > cam.y + cam.vh || yy < cam.y) continue;
        for (let x = Math.floor(x0 / 24) * 24; x <= x0 + vw; x += 24) { const yv = yy + Math.sin(x * 0.02 + this.t * (1.1 + k * 0.4) + k * 2) * 5; if (x === Math.floor(x0 / 24) * 24) ctx.moveTo(x, yv); else ctx.lineTo(x, yv); }
      }
      ctx.stroke(); ctx.restore();
      return;
    }
    if (layer !== 'front' || lv < cam.y - 40) return;
    const runs = this.openRuns(lv + 2, cam);
    if (!runs.length) return;
    const band = magmaBandSprite();
    ctx.save();
    // 차오르기 경고: 목표 수위까지 띠가 맥동
    if (this.mode === 'tide' && this.state === 'warn') {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 9), a = 0.35 * pulse;
      const hr = this.openRuns(this.highPx + 2, cam);
      ctx.fillStyle = `rgba(255,120,40,${(0.06 + 0.1 * pulse).toFixed(3)})`;   // 잠길 구역
      for (let i = 0; i < hr.length; i += 2) ctx.fillRect(hr[i], this.highPx, hr[i + 1] - hr[i], clamp(lv - this.highPx, 0, TILE));
      ctx.fillStyle = `rgba(255,120,40,${a.toFixed(3)})`;   // 목표 수위 띠
      for (let i = 0; i < hr.length; i += 2) ctx.fillRect(hr[i], this.highPx - 5, hr[i + 1] - hr[i], 10);
      ctx.strokeStyle = `rgba(255,190,90,${(0.35 + 0.5 * pulse).toFixed(3)})`; ctx.lineWidth = 2; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -this.t * 40;
      ctx.beginPath(); for (let i = 0; i < hr.length; i += 2) { ctx.moveTo(hr[i], this.highPx); ctx.lineTo(hr[i + 1], this.highPx); } ctx.stroke(); ctx.setLineDash([]);
      this.openRuns(lv + 2, cam);   // _runs 재사용 → 다시 수면 구간
    }
    // 수면 아래 빛 띠 (잠긴 몸이 잠겨 보이게)
    for (let i = 0; i < runs.length; i += 2) ctx.drawImage(band, 0, 0, 2, 64, runs[i], lv - 6, runs[i + 1] - runs[i], 34);
    // 출렁이는 수면 (진폭 4px, 3칸에 2파장)
    const k = TAU / 72, ph = this.t * 2.4;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#ffd070'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < runs.length; i += 2) {
      const a = runs[i], b = runs[i + 1];
      ctx.moveTo(a, lv + Math.sin(a * k + ph) * 4);
      for (let x = a + 8; x <= b; x += 8) ctx.lineTo(x, lv + Math.sin(x * k + ph) * 4);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,245,200,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  lights(L) {
    const cam = this.world.camera, lv = this.level;
    if (!cam || lv > cam.y + cam.vh + 150 || lv < cam.y - 150) return;
    const m = this.world.map, ty = Math.floor((lv + 2) / TILE);
    for (let x = Math.floor(cam.x / 192) * 192 + 96; x < cam.x + cam.vw + 192; x += 192) {
      if (!solidAt(m, Math.floor(x / TILE), ty)) L.add(x, lv, 150, '#ff6a1a', 0.5);
    }
  }
  drawScreen(ctx, vw, vh) {
    // 발밑 가까이 차오르면 화면 아래가 달아오른다
    const p = this.world.player;
    if (!p || p.dead) return;
    const d = this.level - p.bottom;
    if (d > 150 || d < -40) return;
    const k = clamp(1 - d / 150, 0, 1) * 0.28;
    ctx.save(); ctx.globalAlpha = k;
    ctx.drawImage(heatSprite(), 0, 0, 2, 64, 0, vh * 0.72, vw, vh * 0.28);
    ctx.restore();
  }
}

// ───────────────────────────── deep: 깊은 물 · 산소 ─────────────────────────────
class DeepGimmick {
  constructor(world, params, set) {
    this.kind = 'deep'; this.world = world; this.set = set;
    this.params = { air: 100, drain: 8, refill: 50, bubble: 60, choke: 0.06, stroke: 340, ...params };
    this.air = clamp(+this.params.air || 100, 0, 100);
    this.inWater = false; this.headUnder = false; this.inBubble = false;
    this.strokeCd = 0; this.chokeT = 1.0; this.warned = false; this.t = 0; this.breathT = 0.6;
    this.ownMaxFall = false;
    this.added = new Set();   // setWaterRow 가 채운 칸 idx
    this.job = null;
    const m = world.map;
    // 공기 방울 기둥: 'u' 칸에서 위로 액체가 끝나는 곳까지 (최대 5칸)
    this.columns = world.map.markersOf('u').map((mk) => {
      let top = mk.ty;
      while (top - 1 >= 0 && mk.ty - (top - 1) < 5 && m.typeAt(mk.tx, top - 1) === T.LIQUID) top--;
      return { tx: mk.tx, x: mk.tx * TILE, y: top * TILE, w: TILE, h: (mk.ty - top + 1) * TILE, seed: mk.tx * 7.3 + mk.ty };
    });
    const liq = world.liquid ?? world.room?.liquid ?? world.stage?.liquid;
    if (liq !== 'deep') warnOnce('deepliq:' + world.stage?.id + ':' + world.roomId, `[gimmick] deep: ${world.stage?.id}/${world.roomId} 의 액체가 'deep' 이 아님 (${liq})`);
  }
  get speedMul() { return this.inWater ? 0.72 : 1; }
  /** 물 밖으로 뛰어오를 수 있는 수면: 머리 칸에서 위로 액체가 끝나는 줄 */
  surfaceAbove(p) {
    const m = this.world.map, tx = Math.floor(p.cx / TILE);
    let ty = Math.floor((p.y + 10) / TILE);
    if (m.typeAt(tx, ty) !== T.LIQUID) return { y: p.y, blocked: false, above: true };
    while (ty > 0 && m.typeAt(tx, ty - 1) === T.LIQUID) ty--;
    return { y: ty * TILE, blocked: solidAt(m, tx, ty - 1), above: false };
  }
  prePhysics(p, dt) {
    const w = this.world, m = w.map;
    if (p.dead) return;
    this.inWater = touchesType(p, m, T.LIQUID, 10);
    this.headUnder = m.typeAtPx(p.cx, p.y + 10) === T.LIQUID;
    if (this.inWater) {
      if (p.gravity !== 0) p.gravity = 0.24;
      p.maxFall = 150; this.ownMaxFall = true;
      p.airJumpsLeft = p.maxAirJumps?.() ?? p.airJumpsLeft;
      if (!w.cutscene && !w.inputLock && input.down('down')) p.vy += 600 * dt;
    } else if (this.ownMaxFall) { p.maxFall = undefined; this.ownMaxFall = false; }
  }
  postPhysics(p, dt) {
    // 탈것은 깊은 물에서 내린다 (탈것 쪽 hazard('deep') 가 처리하지 않았을 때의 안전망)
    if (this.inWater && p.mount?.riding) p.mount.dismount?.(this.world, p, 'deep');
  }
  onJumpInput(p) {
    if (!this.inWater || p.dead) return false;
    const w = this.world;
    if (!input.buffered('jump', bufWindow(w, 0.13))) return true;   // 물속에선 일반 점프 규칙(점프 끊기 포함)을 건너뛴다
    const s = this.surfaceAbove(p);
    if ((s.above || p.y - s.y <= 40) && !s.blocked) {
      // 수면 가까이: 물 밖으로 도약
      p.vy = -(p.jumpVel?.() ?? 780) * 0.95;
      p.jumpCut = false; p.coyote = 0; p.onGround = false;
      w.fx.burst('water', p.cx, Math.min(s.y, p.bottom), 14, { angle: -Math.PI / 2, spread: 1.0, speed: 220 });
      audio.sfx('splash');
      input.consume('jump');
      this.strokeCd = 0.16;
      return true;
    }
    if (this.strokeCd > 0) return true;   // 입력은 남겨 두어 쿨다운이 끝나면 바로 헤엄친다
    p.vy = -this.params.stroke; p.jumpCut = true; p.onGround = false;
    this.strokeCd = 0.16;
    audio.sfx('splash', { vol: 0.25, pitch: 1.6 });
    emitBubbles(w, p.cx, p.y + 14, 3);
    input.consume('jump');
    return true;
  }
  update(dt, paused) {
    this.t += dt;
    if (this.strokeCd > 0) this.strokeCd -= dt;
    if (paused) return;
    this.runJob(dt);
    const w = this.world, p = w.player;
    if (!p || p.dead || w.cleared) return;
    const P = this.params;
    this.inBubble = false;
    for (const c of this.columns) if (p.x < c.x + c.w && p.x + p.w > c.x && p.y < c.y + c.h && p.y + p.h > c.y) { this.inBubble = true; break; }
    const drainMul = w.companions?.airDrainMul ?? 1;
    if (this.headUnder) this.air -= P.drain * drainMul * dt; else this.air += P.refill * dt;
    if (this.inBubble) this.air += P.bubble * dt;
    this.air = clamp(this.air, 0, 100);
    if (this.air < 25) { if (!this.warned) { this.warned = true; audio.sfx('warning', { vol: 0.3 }); } }
    else this.warned = false;
    if (this.air <= 0) {
      this.chokeT -= dt;
      if (this.chokeT <= 0) { this.chokeT = 1.0; this.choke(p); }
    } else this.chokeT = 1.0;
    if (this.headUnder) {
      this.breathT -= dt;
      if (this.breathT <= 0) { this.breathT = rand(0.5, 0.9); emitBubbles(w, p.cx + p.facing * 6, p.y + 12, 1); }
    }
  }
  /** 숨막힘: 넉백·무적 없이 직접 체력 감소 */
  choke(p) {
    const w = this.world;
    const dmg = Math.ceil(p.stats.hp * this.params.choke);
    p.hp -= dmg;
    w.onPlayerHurt?.(dmg);
    bus.emit('playerHurt', { amount: dmg, source: 'choke' });
    audio.sfx('hurt', { vol: 0.5, pitch: 0.8 });
    w.game?.flash?.('#ff2030', 0.25, 5);
    if (w.game?.settings?.showDamage !== false) w.fx.text(p.cx, p.y - 12, dmg, { color: '#ff6a7a', size: 18 });
    emitBubbles(w, p.cx, p.y + 10, 6);
    if (p.hp <= 0) { p.hp = 0; p.die(w); }
  }
  /**
   * 수위 바꾸기 (보스 다곤 등): time 초에 걸쳐 [tx0,tx1] 안의 빈칸을 지금 수면부터 row 까지 채우거나,
   * row 보다 위에 이 기믹이 채운 물을 뺀다. 한 줄씩 (최소 0.25초 간격). 반환: 바뀔 줄 수
   */
  setWaterRow(row, tx0 = 0, tx1 = Infinity, time = 3) {
    const m = this.world.map;
    row = clamp(Math.round(row), 0, m.h);
    const a = clamp(Math.floor(Math.min(tx0, tx1)), 0, m.w - 1), b = clamp(Math.floor(Math.max(tx0, tx1)), 0, m.w - 1);
    let cur = m.h;
    for (let ty = 0; ty < m.h && cur === m.h; ty++) for (let tx = a; tx <= b; tx++) if (m.tiles[ty * m.w + tx] === T.LIQUID) { cur = ty; break; }
    const rows = [];
    if (row < cur) for (let ty = cur - 1; ty >= row; ty--) rows.push(ty);
    else if (row > cur) for (let ty = cur; ty < row; ty++) rows.push(ty);
    if (!rows.length) { this.job = null; return 0; }
    this.job = { rows, i: 0, acc: 0, interval: Math.max(0.25, (time > 0 ? time : 0) / rows.length), raise: row < cur, a, b };
    return rows.length;
  }
  runJob(dt) {
    const j = this.job;
    if (!j) return;
    j.acc += dt;
    while (j.acc >= j.interval && j.i < j.rows.length) { j.acc -= j.interval; this.applyRow(j.rows[j.i++], j.raise, j.a, j.b); }
    if (j.i >= j.rows.length) this.job = null;
  }
  applyRow(ty, raise, a, b) {
    const w = this.world, m = w.map;
    for (let tx = a; tx <= b; tx++) {
      const i = ty * m.w + tx, t = m.tiles[i];
      if (raise && t === T.EMPTY) { setTile(w, tx, ty, T.LIQUID); this.added.add(i); }
      else if (!raise && t === T.LIQUID && this.added.has(i)) { setTile(w, tx, ty, T.EMPTY); this.added.delete(i); }
    }
  }
  /** 채운 물을 모두 빼고 산소를 채운다 (보스 onReset) */
  reset() {
    const w = this.world, m = w.map;
    for (const i of this.added) { const tx = i % m.w, ty = (i - tx) / m.w; if (m.tiles[i] === T.LIQUID) setTile(w, tx, ty, T.EMPTY); }
    this.added.clear(); this.job = null;
    this.onRespawn();
  }
  onRespawn() { this.air = 100; this.chokeT = 1.0; this.warned = false; }
  dispose() { const p = this.world.player; if (p && this.ownMaxFall) p.maxFall = undefined; this.ownMaxFall = false; }
  drawWorld(ctx, cam, layer) {
    if (layer !== 'front' || !this.columns.length) return;
    const spr = bubbleSprite(), q = this.world.fx.quality ?? 1, n = Math.max(3, Math.round(7 * q));
    for (const c of this.columns) {
      if (c.x + c.w < cam.x || c.x > cam.x + cam.vw || c.y + c.h < cam.y || c.y > cam.y + cam.vh) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(120,220,255,0.06)'; ctx.fillRect(c.x + 10, c.y, c.w - 20, c.h);
      ctx.restore();
      for (let i = 0; i < n; i++) {
        const sp = 70 + ((i * 37) % 50);
        const fy = ((this.t * sp + i * (c.h / n) + c.seed * 13) % c.h);
        const y = c.y + c.h - fy;
        const x = c.x + c.w / 2 + Math.sin(this.t * 3 + i * 1.7 + c.seed) * 8;
        const s = 6 + ((i * 5) % 7) * (0.6 + 0.4 * fy / c.h);
        ctx.globalAlpha = Math.min(1, fy / 30, (c.h - fy) / 20 + 0.2);
        ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }
  }
  drawScreen(ctx, vw, vh, hud) {
    const w = this.world, p = w.player;
    if (!p || p.dead) return;
    if (this.headUnder) { ctx.fillStyle = 'rgba(10,50,90,0.18)'; ctx.fillRect(0, 0, vw, vh); }
    if (this.headUnder || this.air < 100) {
      const r = hud?.meter?.();
      const low = this.air < 30;
      drawMeter(ctx, r, '산소', this.air / 100, low ? '#ff4a5a' : '#6fe8ff', { blink: this.air < 20, time: this.t, sub: `${Math.ceil(this.air)}` });
    }
  }
}

// ───────────────────────────── wind: 돌풍 · 상승 기류 ─────────────────────────────
function updraftSprite() {
  return cachedCanvas('wind:updraft', 48, 2, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(220,235,255,0)'); gr.addColorStop(0.5, 'rgba(220,235,255,0.12)'); gr.addColorStop(1, 'rgba(220,235,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

class WindGimmick {
  constructor(world, params, set) {
    this.kind = 'wind'; this.world = world; this.set = set;
    this.params = { dir: 1, force: 900, on: 2.5, off: 3.5, warn: 1.0, maxPush: 320, updraft: 420, auto: true, ...params };
    const m = world.map;
    this.updraft = new Set();
    const ups = m.markersOf('U');
    for (const mk of ups) this.updraft.add(mk.ty * m.w + mk.tx);
    this.upCols = columnsOf(ups);
    this.t = 0;
    this.W = 0; this.applied = 0; this.vxAfter = null;
    this.reset();
  }
  reset() {
    const P = this.params;
    this.auto = P.auto !== false;
    this.alt = P.dir === 'alt';
    this.dir = this.alt ? 1 : (Math.sign(+P.dir) || 1);
    this.force = +P.force || 0; this.onDur = +P.on || 0;
    this.single = false;
    this.phase = 'off'; this.pt = 0; this.dur = +P.off || 0;
    this.W = 0;
  }
  get gusting() { return this.phase === 'on'; }
  get warning() { return this.phase === 'warn'; }
  /** 0..1 — 경고/돌풍 단계 진행도 */
  get phaseK() { return this.dur > 0 ? clamp(this.pt / this.dur, 0, 1) : 1; }
  enter(phase, dur) {
    this.phase = phase; this.pt = 0; this.dur = Math.max(0, dur);
    if (phase === 'warn') audio.sfx('mist', { pitch: 0.6 });
    else if (phase === 'on') audio.sfx('whip', { pitch: 0.4 });
  }
  /** 한 번의 돌풍 (auto:false 와 함께 보스가 쓴다) */
  gust(dir = this.dir, force = this.params.force, dur = this.params.on, warn = 0.8) {
    this.dir = Math.sign(dir) || 1;
    this.force = force; this.onDur = dur; this.single = true;
    if (warn > 0) this.enter('warn', warn); else this.enter('on', dur);
    return true;
  }
  setAuto(on) {
    this.auto = !!on;
    if (!this.auto && !this.single && this.phase !== 'off') this.enter('off', this.params.off);
  }
  update(dt, paused) {
    this.t += dt;
    if (paused) return;
    this.pt += dt;
    if (this.pt < this.dur) return;
    const P = this.params;
    if (this.phase === 'warn') this.enter('on', this.onDur);
    else if (this.phase === 'on') {
      this.single = false;
      if (this.alt) this.dir = -this.dir;
      this.enter('off', P.off);
    } else if (this.auto) {
      this.force = +P.force || 0; this.onDur = +P.on || 0;
      this.enter('warn', +P.warn || 0);
    } else this.pt = this.dur;
  }
  /** 바람 몫(W)은 이동 제어가 브레이크로 깎지 않도록 제어 직전에 빼고, 물리 직전에 다시 더한다 */
  beforePlayer(p, dt) {
    if (this.applied !== 0) {
      if (this.vxAfter !== null && p.vx === this.vxAfter) p.vx -= this.applied;
      this.applied = 0;
    }
    if (p.dead) this.W = 0;
  }
  prePhysics(p, dt) {
    const w = this.world;
    if (p.dead) { this.W = 0; this.applied = 0; return; }
    const dashing = p.dashT > 0 || p.mount?.chargeT > 0;
    const k = p.onGround ? 0.5 : 1;
    const underwater = !!this.set?.get?.('deep')?.inWater;
    if (this.phase === 'on' && !dashing && !w.cutscene && !underwater) {
      const mul = p.mount?.riding ? (p.mount.def?.windMul ?? 1) : 1;
      const cap = this.params.maxPush * k * mul;
      this.W = approach(this.W, this.dir * cap, this.force * k * mul * dt);
      // 바람 방향 총속도 ≤ 최고 속도 + maxPush
      const maxSp = (p.ch?.move?.speed ?? 280) * (p.speedMul ?? 1);
      const lim = Math.max(0, maxSp + this.params.maxPush - p.vx * this.dir);
      if (this.W * this.dir > lim) this.W = lim * this.dir;
    } else {
      this.W = approach(this.W, 0, (dashing ? 4000 : p.onGround ? 1400 : 700) * dt);
    }
    if (!dashing && this.W !== 0) { p.vx += this.W; this.applied = this.W; }
    // 상승 기류
    if (this.updraft.size && this.overlapsUpdraft(p)) {
      p.vy = approach(p.vy, -this.params.updraft, 2600 * dt);
      if (p.gravity > 0.3) p.gravity = 0.3;
      if (Math.random() < 0.25 * (w.fx.quality ?? 1)) w.fx.emit('dust', p.cx + rand(-14, 14), p.bottom, { angle: -Math.PI / 2, spread: 0.3, speed: 120, color: '#dfe8ff', alpha: 0.3, size: rand(4, 7) });
    }
  }
  postPhysics(p, dt) {
    if (this.applied !== 0 && p.hitWall && Math.sign(p.hitWall) === Math.sign(this.applied)) { this.applied = 0; this.W = 0; }
    this.vxAfter = p.vx;
  }
  overlapsUpdraft(p) {
    const m = this.world.map;
    const x0 = Math.floor((p.x + 4) / TILE), x1 = Math.floor((p.x + p.w - 4) / TILE);
    const y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tx >= 0 && ty >= 0 && tx < m.w && this.updraft.has(ty * m.w + tx)) return true;
    return false;
  }
  onRespawn() { this.reset(); this.applied = 0; this.vxAfter = null; }
  dispose() { this.W = 0; this.applied = 0; }
  drawWorld(ctx, cam, layer) {
    if (layer === 'back' && this.upCols.length) {
      const spr = updraftSprite();
      ctx.save();
      ctx.strokeStyle = 'rgba(230,240,255,0.22)'; ctx.lineWidth = 1.5;
      for (const c of this.upCols) {
        const x = c.tx * TILE, y = c.ty0 * TILE, h = (c.ty1 - c.ty0 + 1) * TILE;
        if (x + TILE < cam.x || x > cam.x + cam.vw || y + h < cam.y || y > cam.y + cam.vh) continue;
        ctx.drawImage(spr, x, y, TILE, h);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const off = (this.t * 260 + i * 97 + c.tx * 31) % h;
          const sx = x + 8 + ((i * 11) % 32);
          ctx.moveTo(sx, y + h - off); ctx.lineTo(sx, y + h - off - 18);
        }
        ctx.stroke();
        // 위로 흐르는 갈매기 표시 (밝은 배경에서도 보이게 어두운 테두리 먼저)
        const nch = Math.max(2, Math.round(h / 72));
        ctx.beginPath();
        for (let i = 0; i < nch; i++) {
          const cy = y + h - ((this.t * 120 + i * (h / nch)) % h), cx = x + TILE / 2;
          if (cy < y + 14) continue;
          for (const d of [0, 7]) { ctx.moveTo(cx - 10, cy + 7 + d); ctx.lineTo(cx, cy - 2 + d); ctx.lineTo(cx + 10, cy + 7 + d); }
        }
        ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(10,20,40,0.25)'; ctx.stroke();
        ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(235,245,255,0.62)'; ctx.stroke();
        // 기둥 양옆 옅은 경계선
        ctx.setLineDash([10, 12]); ctx.lineDashOffset = reducedMotion(this.world) ? 0 : this.t * 60;
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(230,240,255,0.28)';
        ctx.beginPath(); ctx.moveTo(x + 3, y); ctx.lineTo(x + 3, y + h); ctx.moveTo(x + TILE - 3, y); ctx.lineTo(x + TILE - 3, y + h); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(230,240,255,0.22)';
      }
      ctx.restore();
      return;
    }
    if (layer !== 'front' || this.phase === 'off') return;
    const warn = this.phase === 'warn';
    const q = this.world.fx.quality ?? 1;
    const n = Math.round((warn ? 10 : 24) * q * (reducedMotion(this.world) ? 0.4 : 1));
    const a = warn ? 0.18 + 0.12 * this.phaseK : 0.5;
    const span = cam.vw + 240, sp = warn ? 420 : 900 + this.force * 0.3;
    ctx.save();
    ctx.strokeStyle = `rgba(232,240,255,${a.toFixed(3)})`; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const len = 40 + ((i * 29) % 50);
      const base = (i * 173.3 + this.t * sp * (0.7 + ((i * 13) % 7) / 10)) % span;
      const x = this.dir > 0 ? cam.x - 120 + base : cam.x + cam.vw + 120 - base;
      const y = cam.y + 20 + ((i * 97.7) % Math.max(40, cam.vh - 40)) + Math.sin(this.t * 3 + i) * 6;
      ctx.moveTo(x, y); ctx.lineTo(x - this.dir * len, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  drawScreen(ctx, vw, vh, hud) {
    if (this.phase === 'off') return;
    const r = hud?.meter?.();
    if (!r) return;
    const warn = this.phase === 'warn';
    const arrows = this.dir > 0 ? '≫' : '≪';
    ctx.save();
    ctx.fillStyle = warn ? 'rgba(8,4,12,0.6)' : 'rgba(20,30,50,0.7)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    const pulse = warn ? 0.65 + 0.35 * Math.sin(this.t * 12) : 1;
    ctx.globalAlpha = pulse;
    const cy = r.y + r.h / 2 + 1;
    text(ctx, `${arrows} 돌풍! ${arrows}`, r.x + r.w / 2 + (warn ? 8 : 0), cy, { size: 13, weight: 800, color: warn ? '#dfe8ff' : '#ffffff', align: 'center', baseline: 'middle', ow: 3 });
    if (warn) {
      // 경고 카운트다운 고리
      const rr = Math.max(4, r.h / 2 - 2), rx = r.x + 4 + rr, ry = r.y + r.h / 2;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#dfe8ff';
      ctx.beginPath(); ctx.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - this.phaseK)); ctx.stroke();
    }
    ctx.restore();
  }
}

/** 이 파일이 구현하는 종류 (heartbeat · blight · voidwall 은 gimmicks_b.js 의 GIMMICKS_B) */
const KINDS = { mirror: MirrorGimmick, magma: MagmaGimmick, deep: DeepGimmick, wind: WindGimmick };
