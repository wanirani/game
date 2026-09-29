// 채색 렌더러 레지스트리: 보스 ID / 적 ID → 채색(컷아웃 퍼핏) 렌더러 모듈.
//  - 등록된 렌더러가 있고 에셋이 구워졌으면 벡터 그리기 대신 채색 그림을 그린다. 아니면 기존 벡터 코드가 그대로 그린다 (대체).
//  - 렌더러 모듈은 필요할 때만 동적 import (다른 스테이지는 비용 0).
//  - 미리 굽기: 보스 방 진입(roomEntered) 때와 보스 생성 때 시작 → 대사/등장 연출 뒤에서 끝난다.
//
// 렌더러 모듈 계약 (export default):
//   { id, kind:'boss'|'enemy',
//     async load(env)            → rig (kit.loadRig 사용). env = { game, td, budgetMB, quality }
//     init(ent, rig)             → 개체별 그리기 상태 (선택)
//     draw(ctx, ent, world, rig, st)  월드 변환이 걸린 ctx 에 그린다 (ent 는 읽기 전용)
//     bounds(ent, rig, st, out)  → {x,y,w,h} 그림 전체를 덮는 컬링 영역 (보스: 논리 판정보다 훨씬 큼)
//     lights?(L, ent, rig, st)   추가 광원
//     ownsDeathFade?: true       사망 중 Boss.draw 의 전체 투명도 감쇠를 쓰지 않음 (붕괴 연출을 보이게)
//   }
// 보스 훅 (a_common.js / b_common.js):  update 끝에 paintedTick(this, world),  draw 첫 줄에
//   const pd = paintedDraw(this, ctx, world); if (pd === true) return;  (pd 가 0<k<1 숫자면 벡터→채색 교차 페이드 중: 벡터를 알파 1−k 로)
// 적 훅 (render/enemies.js 등):          if (drawPaintedDirect(e, ctx, world)) return;   (판정≈그림 크기인 개체용, 대리 개체 없음)
//
// 끄기: URL ?painted=0 · window.__paintedOff = true · settings.painted === false  → 모든 개체가 벡터로 그려진다 (비교/문제 해결용)
import { Entity } from '../../game/entity.js';
import { bus } from '../../core/events.js';
import { quality, textureDensity, memoryBudgetMB } from './kit.js';
import { STAGES } from '../../data/stages.js';
import { REG_PACKAGES } from './reg/index.js';
import { releaseRigs } from './enemy_kit.js';

/** id → { kind, importer, mod, rig, state:'idle'|'loading'|'ready'|'failed', promise, err } */
const REG = new Map();
let GAME = null;

/** 기본 등록 (모듈 경로는 이 파일 기준). 새 채색 보스/적을 만들면 여기에 한 줄 추가한다 */
registerPainted('b_bonedragon', { kind: 'boss', importer: () => import('./bosses/b_bonedragon.js') });
// 패키지별 등록 모듈(reg/*.js)을 모은다 — 제작 패키지는 이 파일이 아니라 자기 reg 파일만 고친다 (R15)
for (const pkg of REG_PACKAGES) {
  for (const [id, importer] of Object.entries(pkg.bosses ?? {})) registerPainted(id, { kind: 'boss', importer });
  for (const [id, importer] of Object.entries(pkg.companions ?? {})) registerPainted(id, { kind: 'companion', importer });
  for (const [id, importer] of Object.entries(pkg.npcs ?? {})) registerPainted(id, { kind: 'npc', importer });
}

export function registerPainted(id, { kind = 'boss', importer = null, module = null } = {}) {
  const prev = REG.get(id);
  REG.set(id, { kind, importer, mod: module, rig: null, state: 'idle', promise: null, err: null, ...(prev?.state === 'ready' && !importer && !module ? prev : {}) });
}
export function hasPainted(id) { return REG.has(id); }
export function paintedIds(kind = null) { return [...REG.entries()].filter(([, e]) => !kind || e.kind === kind).map(([id]) => id); }
export function paintedState(id) { return REG.get(id)?.state ?? 'none'; }
export function paintedRig(id) { const e = REG.get(id); return e?.state === 'ready' ? e.rig : null; }

export function paintedEnabled(game = GAME) {
  try {
    if (typeof window !== 'undefined') {
      if (window.__paintedOff) return false;
      if (/[?&]painted=0\b/.test(window.location?.search ?? '')) return false;
    }
  } catch { /* 무시 */ }
  return game?.settings?.painted !== false;
}

/** 카메라 줌 추정: 보스 경기장 줌(world.startBoss 와 같은 식)을 미리 계산 */
function arenaZoom(game) {
  const w = game?.world, m = w?.map;
  if (w?.camera?.zoomTarget) return w.camera.zoomTarget;
  if (m?.pxH && game?.viewH) return Math.min(1, Math.max(0.74, game.viewH / (m.pxH - 48)));
  return 0.85;
}

const envOf = (game, zoom) => ({ game, quality: quality(game), td: textureDensity(game, zoom ?? arenaZoom(game)), budgetMB: memoryBudgetMB(game) });
function report(id, e, env) {
  if (typeof window !== 'undefined') (window.__painted ??= {})[id] = { ms: Math.round(e.loadMs ?? 0), memMB: +(e.rig?.memMB ?? 0).toFixed(2), td: +(e.rig?.td ?? 0).toFixed(3), bakeMs: Math.round(e.rig?.bakeMs ?? 0), estMB: +(e.rig?.estMB ?? 0).toFixed(2), budgetMB: env.budgetMB, timing: e.rig?.timing, rebakes: e.rebakes ?? 0 };
}
/** 미리 굽기 시작 (여러 번 불러도 한 번만). zoom = 경기장 줌 추정(없으면 현재 카메라). → Promise<boolean> */
export function preloadPainted(id, game = GAME, zoom = null) {
  const e = REG.get(id);
  if (!e) return Promise.resolve(false);
  if (e.promise) return e.promise;
  if (!paintedEnabled(game)) return Promise.resolve(false);
  if (game) GAME = game;
  // 보스 리그는 하나만 상주: 다른 보스의 리그가 2초 넘게 그려지지 않았으면 놓는다
  // (보스 러시처럼 스테이지 전환(stageEntered) 없이 보스가 바뀌는 모드에서도 메모리가 쌓이지 않게)
  if (e.kind === 'boss') {
    const now = performance.now();
    for (const [oid, o] of REG) if (oid !== id && o.kind === 'boss' && o.state === 'ready' && now - (o.lastDraw ?? 0) > 2000) releasePainted(oid);
  }
  e.state = 'loading';
  const t0 = performance.now();
  e.promise = (async () => {
    try {
      await null;   // 첫 방은 Game 생성 도중(window.__game 지정 전)에 들어오므로 한 박자 늦춰 game 을 찾는다
      game ??= GAME ?? (typeof window !== 'undefined' ? window.__game : null);
      if (game) GAME = game;
      if (!e.mod) e.mod = (await e.importer()).default;
      const env = envOf(game, zoom);
      e.bakeScale = game?.scale ?? 1;
      e.rig = await e.mod.load(env);
      e.state = 'ready';
      e.loadMs = performance.now() - t0;
      report(id, e, env);
      return true;
    } catch (err) {
      e.state = 'failed'; e.err = err;
      console.warn('[painted] 불러오기 실패 → 벡터 그림 사용:', id, err?.message ?? err);
      return false;
    }
  })();
  return e.promise;
}
/**
 * 구운 밀도가 지금 화면에 맞는지 확인하고, 25% 넘게 어긋나면 뒤에서 다시 구워 준비되면 바꿔 끼운다
 * (창 → 전체 화면, 폰 회전, 자동 품질 저하로 캔버스 배율·메모리 예산이 바뀐 경우). 예산이 막는 만큼은 다시 굽지 않는다.
 * 바꿔 끼우는 동안에도 이전 리그로 계속 그린다 (팝 없음, 선명도만 바뀜). 방 진입 때 부른다.
 */
export function refreshPainted(id, game = GAME, zoom = null) {
  const e = REG.get(id);
  if (!e || e.state !== 'ready' || !e.rig || e.rebaking || !e.mod?.load || !paintedEnabled(game)) return false;
  const env = envOf(game, zoom), r = e.rig;
  const want = Math.min(env.td, env.budgetMB === r.budgetMB ? (r.tdMax ?? env.td) : env.td);
  const overBudget = (r.memMB ?? 0) > env.budgetMB * 1.05;
  if (!overBudget && Math.abs(want / r.td - 1) < 0.25) return false;
  e.rebaking = true; e.bakeScale = game?.scale ?? 1;
  const t0 = performance.now();
  e.mod.load(env).then((rig) => {
    e.rebaking = false;
    if (REG.get(id) !== e || e.state !== 'ready') return;
    e.rig = rig; e.rebakes = (e.rebakes ?? 0) + 1; e.loadMs = performance.now() - t0;
    report(id, e, env);
  }, (err) => { e.rebaking = false; console.warn('[painted] 다시 굽기 실패 (이전 리그 유지):', id, err?.message ?? err); });
  return true;
}
/** 구운 텍스처 해제 (다른 스테이지로 떠날 때 등) */
export function releasePainted(id) {
  const e = REG.get(id);
  if (!e || e.state === 'loading') return;
  e.rig = null; e.promise = null; e.state = 'idle';
}

function ready(id, game) {
  const e = REG.get(id);
  if (!e) return null;
  if (e.state === 'ready') return paintedEnabled(game) ? e : null;
  if (e.state === 'idle') preloadPainted(id, game);
  return null;
}
/** 벡터 → 채색 교차 페이드 길이 (ms). 굽기가 보스 등장보다 늦게 끝난 경우(느린 폰)에만 쓰인다 */
const FADE_MS = 320;

// ───────────────────────── 보스: 컬링 대리 개체 ─────────────────────────
// world.render 는 개체 사각형(x,y,w,h)으로 컬링한다. 보스 논리 사각형은 머리 판정뿐이라 채색 몸통(날개·흉곽)이
// 화면에 있어도 보스 전체가 컬링될 수 있다. 대리 개체가 그림 전체 영역을 사각형으로 가지고 대신 그린다.
// (보스의 x/y/w/h·판정은 건드리지 않는다: 게임플레이 불변)
class PaintedBody extends Entity {
  constructor(boss, entry) {
    super(boss.x, boss.y, boss.w, boss.h);
    this.kind = 'painted';
    this.boss = null;       // BOSS_TRANSIENT 정리 규칙(e.boss === b)에 걸리지 않도록 다른 이름을 쓴다
    this.host = boss; this.entry = entry; this.z = boss.z;
    this.st = boss._painted?.st ?? entry.mod.init?.(boss, entry.rig) ?? {};
    this.fail = 0;
    this.fadeT0 = null;     // 벡터로 보이던 보스에 붙었으면 교차 페이드 시작 시각 (performance.now)
    this.syncBounds();
  }
  /** 교차 페이드 진행 0..1 (1 = 채색만) */
  fadeK() {
    if (this.fadeT0 == null) return 1;
    const k = (performance.now() - this.fadeT0) / FADE_MS;
    if (k >= 1) { this.fadeT0 = null; return 1; }
    return Math.max(0, k);
  }
  syncBounds() {
    const b = this.host, r = this.entry.mod.bounds?.(b, this.entry.rig, this.st, this._r ??= { x: 0, y: 0, w: 0, h: 0 });
    if (r && Number.isFinite(r.x + r.y + r.w + r.h)) { this.x = r.x; this.y = r.y; this.w = r.w; this.h = r.h; }
    else { this.x = b.x - 200; this.y = b.y - 200; this.w = b.w + 400; this.h = b.h + 400; }
  }
  alive(world) { const b = this.host; return !b.dead && b.world === world && this.entry.state === 'ready' && paintedEnabled(world?.game); }
  update(dt, world) {
    this.t += dt;
    if (!this.alive(world)) { this.dead = true; if (this.host._painted?.proxy === this) this.host._painted.proxy = null; return; }
    this.z = this.host.z;
    this.syncBounds();
  }
  draw(ctx, world) {
    const b = this.host;
    if (!this.alive(world) || b.hidden) return;
    const mod = this.entry.mod;
    const k = this.fadeK();
    this.entry.lastDraw = performance.now();
    if (k <= 0.001) return;
    ctx.save();
    if (b.dying > 0 && !mod.ownsDeathFade) ctx.globalAlpha = Math.min(1, Math.max(0, b.dying / 2.4));
    if (k < 1) ctx.globalAlpha *= k;
    try {
      mod.draw(ctx, b, world, this.entry.rig, this.st);
    } catch (err) {
      // 그리기 오류 → 이 보스는 벡터로 되돌린다 (게임은 계속). 렌더러가 연 save/clip 을 되돌려 ctx 상태 스택을 맞춘다
      this.st?.D?.unwind?.(ctx);
      console.error('[painted] 그리기 오류 → 벡터로 전환:', b.def?.id, err);
      this.entry.state = 'failed'; this.dead = true;
      if (b._painted) b._painted.proxy = null;
    }
    ctx.restore();
    if (world.game?.debug) {
      ctx.save();
      ctx.strokeStyle = '#0ff'; for (const hb of b.hurtboxes()) ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      ctx.strokeStyle = 'rgba(255,0,255,0.6)'; ctx.setLineDash([6, 6]); ctx.strokeRect(this.x, this.y, this.w, this.h);
      ctx.restore();
    }
  }
  lights(L) { if (!this.dead && this.entry.state === 'ready') this.entry.mod.lights?.(L, this.host, this.entry.rig, this.st); }
}

function attach(boss, world, e) {
  if (!world || !Array.isArray(world.entities) || typeof world.add !== 'function') return null;
  const pb = new PaintedBody(boss, e);
  boss._painted = { proxy: pb, st: pb.st };
  // 이미 벡터로 그려진 적이 있는 보스(굽기가 등장보다 늦게 끝남) → 뚝 바뀌지 않게 교차 페이드
  if (boss._pvSeen) { pb.fadeT0 = performance.now(); boss._pvSeen = false; }
  world.add(pb);
  return pb;
}

/** 보스 update 끝에서 호출: 미리 굽기 시작 / 준비되면 대리 개체 부착 */
export function paintedTick(boss, world) {
  const id = boss.def?.id;
  if (!id || !REG.has(id)) return;
  if (world?.game) GAME = world.game;
  const e = ready(id, world?.game);
  if (!e || boss.dead) return;
  // 싸우는 도중 창이 크게 커졌으면(창 → 전체 화면) 뒤에서 더 선명하게 다시 굽는다. 줄어든 경우(자동 품질 저하)는
  // 느린 기기에서 전투 중 굽기 부담을 주지 않도록 다음 방 진입 때 처리한다.
  const sc = world?.game?.scale;
  if (sc && e.bakeScale && sc > e.bakeScale * 1.4 && !e.rebaking && !refreshPainted(id, world.game)) e.bakeScale = sc;   // 예산이 막아 다시 구울 필요 없음
  const p = boss._painted?.proxy;
  if (!p || p.dead || p.world !== world) attach(boss, world, e);
}
/**
 * 보스 draw 첫 줄에서 호출. → true: 채색 대리 개체가 그리므로 벡터 그리기를 건너뛴다 / false: 벡터로 그린다 /
 * 0<k<1 숫자: 교차 페이드 중 — 호출 측이 벡터를 알파 (1−k) 로 그린다 (채색은 대리 개체가 알파 k 로 그 위에).
 * 준비가 막 끝난 프레임에는 여기서 부착하고 바로 한 번 그린다 (벡터 → 채색 한 프레임 깜빡임 방지).
 */
export function paintedDraw(boss, ctx, world) {
  const id = boss.def?.id;
  if (!id || !REG.has(id)) return false;
  const e = ready(id, world?.game);
  if (!e) {
    const st = REG.get(id).state;
    if ((st === 'loading' || st === 'idle') && paintedEnabled(world?.game)) boss._pvSeen = true;   // 채색 준비 전에 벡터로 보였다
    return false;
  }
  let p = boss._painted?.proxy;
  if (!(p && !p.dead && p.world === world)) {
    p = attach(boss, world, e);
    if (!p) return false;
    p.draw(ctx, world);
  }
  const k = p.fadeK();
  return k >= 1 ? true : k;
}

/** 사망 파편(ABoss.spawnDebris → world.debrisList)용 채색 조각. 준비 안 됐으면 null → 보스의 벡터 조각 사용 */
export function paintedDebris(boss, i) {
  const id = boss.def?.id;
  const e = id && REG.get(id);
  if (!e || e.state !== 'ready' || !paintedEnabled(boss.world?.game) || !e.mod.debris) return null;
  try { return e.mod.debris(i, e.rig); } catch { return null; }
}

// ───────────────────────── 적/NPC: 직접 그리기 ─────────────────────────
/** 판정 사각형이 그림과 비슷한 개체용: 준비됐으면 그리고 true (컬링은 호출 측 개체 사각형 기준) */
export function drawPaintedDirect(ent, ctx, world, id = ent.def?.id ?? ent.id) {
  if (!id || !REG.has(id)) return false;
  const e = ready(id, world?.game);
  if (!e) return false;
  const st = ent._paintedSt ??= (e.mod.init?.(ent, e.rig) ?? {});
  try { e.mod.draw(ctx, ent, world, e.rig, st); return true; } catch (err) {
    console.error('[painted] 그리기 오류 → 벡터로 전환:', id, err); e.state = 'failed'; return false;
  }
}

// ───────────────────────── 방 진입 시 미리 굽기 ─────────────────────────
// 보스 방에 들어서는 순간(로딩 페이드 뒤) 굽기를 시작한다 → 경기장 트리거·대사·등장 연출 동안 끝난다.
// roomEntered 는 World 생성자 안에서 불리므로 game.world 는 아직 이전 세계일 수 있다 → 스테이지 데이터에서 방을 찾는다.
// 보스방 바로 앞 방(출구·문이 보스방으로 이어지는 방)에 들어설 때도 시작한다: 앞 방을 지나는 동안 굽기가 끝나
// 느린 폰에서도 보스가 벡터로 먼저 보였다가 바뀌는 일이 거의 없다 (그래도 늦으면 교차 페이드).
const EXIT_KEYS = ['exitRight', 'exitLeft', 'exitUp', 'exitDown', 'next'];
function bossRoomsNear(stage, roomId) {
  const out = [], room = stage?.rooms?.[roomId];
  if (!room) return out;
  if (room.boss) out.push(room);
  const ids = [...EXIT_KEYS.map((k) => room[k]), ...Object.values(room.doors ?? {})];
  for (const v of ids) { const r = stage.rooms[typeof v === 'string' ? v : v?.room]; if (r?.boss && !out.includes(r)) out.push(r); }
  return out;
}
bus.on('roomEntered', ({ stageId, roomId } = {}) => {
  const g = GAME ?? (typeof window !== 'undefined' ? window.__game : null);
  if (g) GAME = g;
  const stage = STAGES[stageId];
  for (const room of bossRoomsNear(stage, roomId)) {
    const id = room.bossId ?? stage?.boss;
    if (!id || !REG.has(id)) continue;
    // 경기장 줌 추정 (world.startBoss 와 같은 식): 방 높이로 계산
    const rows = room.map?.length ?? 0;
    const zoom = rows ? Math.min(1, Math.max(0.74, (g?.viewH ?? 540) / (rows * 48 - 48))) : null;
    if (REG.get(id).state === 'ready') refreshPainted(id, g, zoom);
    else preloadPainted(id, g, zoom);
  }
});

// 다른 스테이지로 가면 이전 보스의 구운 텍스처를 놓아 준다 (폰 메모리). 같은 보스 스테이지 재도전이면 유지.
bus.on('stageEntered', ({ stageId } = {}) => {
  const keep = STAGES[stageId]?.boss;
  for (const [id, e] of REG) if (e.kind === 'boss' && id !== keep && e.state === 'ready') releasePainted(id);
});

// 전투가 없는 장면(마을·타이틀·월드맵·상점·이야기 …)이 맨 아래에 깔리면 화면에 없는 보스·적의 구운 텍스처를 놓는다
// (R1-RUN-TEX-TOUCH: 터치 기기 채색 예산 안에 마을 퍼펫·동료가 들어가게). 메뉴·일시정지처럼 스테이지 위에 쌓인 장면은
// 바닥이 여전히 전투 장면이므로 놓지 않는다 (돌아가면 곧바로 이어 그림). 스테이지로 돌아가면 방 진입 때 다시 굽는다.
// 동료(탈것·수호수)·NPC 채색은 마을에도 보이므로 유지. 1.5초마다 바닥 장면만 확인 (비용 무시할 만함)
const FIGHT_SCENES = new Set(['stage', 'bossrush', 'survival', 'practice']);
let _offBase = null;
function releaseOffStage() {
  const g = GAME ?? (typeof window !== 'undefined' ? window.__game : null);
  const base = g?.scenes?.[0];
  if (!base) return;
  if (FIGHT_SCENES.has(base.name)) { _offBase = null; return; }
  if (base === _offBase) return;
  const now = performance.now();
  let pending = false;
  for (const [id, e] of REG) {
    if (e.kind !== 'boss' || e.state !== 'ready') continue;
    if (now - (e.lastDraw ?? 0) > 1000) releasePainted(id); else pending = true;
  }
  releaseRigs([]);          // 적 리그 (쓰러지는 중인 시체는 자기 리그를 붙잡고 있어 안전)
  if (!pending) _offBase = base;   // 이 바닥 장면은 처리 끝 (다음 장면 전환까지 다시 보지 않음)
}
if (typeof window !== 'undefined' && typeof setInterval === 'function') setInterval(releaseOffStage, 1500);
