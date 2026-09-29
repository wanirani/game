// 적 렌더 디스패처.
// ENEMY_RENDER[renderId] = (ctx, e, world, { flash }) => void  — 원점: 발 중앙(e.cx, e.bottom), facing 반영은 여기서 처리
// = { ...RENDER_A, ...RENDER_B, ...RENDER_C, ...RENDER_D } (2부 C/D: world2 §5.1, 렌더 ID = 적 id)
// e: {cx, bottom, w, h, facing, anim, animT, t, flashT, state, def, elite, scale}
// 채색 퍼핏(painted/enemies/*): 등록된 렌더러가 있고 리그(아틀라스)가 로드되면 그것을 그리고, 아니면 벡터 렌더러를 그린다.
// 로드 중에 이미 벡터로 보인 개체는 0.3초 크로스페이드로 전환한다. 스테이지 진입 시 해당 스테이지 적 목록을 미리 굽는다.
// (끄기: 공용 ?painted=0 · window.__paintedOff · settings.painted=false, 적만: window.__paintedEnemies = false — A/B 비교·저사양 대비)
import { TAU, clamp } from '../core/math.js';
import { PAINTED_ENEMIES } from './painted/enemies/index.js';
import { requestRig, refreshRig, releaseRigs } from './painted/enemy_kit.js';
import { game } from '../core/game.js';
import { ENEMIES } from '../data/enemies.js';
import { STAGES } from '../data/stages.js';
import { bus } from '../core/events.js';
import { paintedEnabled, unwindMark, unwindDone, unwindTo } from './painted/registry.js';

// 벡터 렌더러 (enemies_a/b + 2부 enemies_c/d) 는 늦게 받는다 (R1-REQ-229): 이 파일이 정적으로 싣지 않으므로 번들러가 따로
// 떼어 내 첫 화면 바이트에서 빠질 수 있다 (AI 모듈 ai_*.js 가 PROJ/ZONE 도우미를 정적으로 가져오는 동안은 이미 실린 모듈이라
// 곧바로 채워진다). 받기 전·실패 시에는 동기 대체 그림(팔레트 타원, drawVector)을 그린다. 합치는 순서는 예전 그대로 A → B → C → D.
// (동적 import 는 모듈 평가가 끝난 뒤에 풀리므로 예전의 순환 import 초기화 순서 문제(p2Merged)도 없다)
export const ENEMY_RENDER = {};
/** 받은 벡터 렌더러 모듈 네임스페이스 (받기 전 null). AI 모듈의 투사체·장판 그리기(PROJ_*·ZONE_* 등)가 정적 import 대신
 *  ENEMY_VEC.a?.PROJ_A 처럼 쓰는 입구 — 그래야 벡터 렌더러 묶음이 첫 화면 번들에서 빠진다 */
export const ENEMY_VEC = { a: null, b: null, c: null, d: null };   // [hook:p2] c/d = 2부 렌더러
let _vecP = null, vecReady = false;
/** 벡터 적 렌더러 받기 (여러 번 불러도 한 번). → Promise<boolean> (실패하면 다음 방 진입 때 다시 시도) */
export function loadEnemyRenderers() {
  _vecP ??= Promise.all([
    import('./enemies_a.js'), import('./enemies_b.js'),
    import('./enemies_c.js'),   // [hook:p2] 2부 C
    import('./enemies_d.js'),   // [hook:p2] 2부 D
  ]).then(
    ([a, b, c, d]) => { Object.assign(ENEMY_VEC, { a, b, c, d }); Object.assign(ENEMY_RENDER, a.RENDER_A, b.RENDER_B, c.RENDER_C, d.RENDER_D); vecReady = true; return true; },   // [hook:p2]
    (err) => { _vecP = null; console.warn('[enemies] 벡터 렌더러를 불러오지 못함 → 대체 그림:', err?.message ?? err); return false; });
  return _vecP;
}
/** 벡터 렌더러가 준비됐는가 (갤러리·도구가 기다릴 때: await loadEnemyRenderers()) */
export const enemyRenderersReady = () => vecReady;
loadEnemyRenderers();

/** 채색 적 사용 여부: 공용 스위치(?painted=0 · window.__paintedOff · settings.painted=false) + 적 전용 window.__paintedEnemies=false */
export const paintedEnemiesOn = (game) => globalThis.__paintedEnemies !== false && paintedEnabled(game);

/** 이 적 ID 목록이 쓰는 채색 모듈 (스포너가 만들어 내는 적 포함) */
function paintedModsFor(ids) {
  const out = new Set();
  for (const id of ids) {
    const d = ENEMIES[id];
    const m = PAINTED_ENEMIES[d?.render ?? id];
    if (m) out.add(m);
    const sp = d?.aiParams?.spawn;           // 스포너가 만들어 내는 적도 함께
    const ms = sp && PAINTED_ENEMIES[ENEMIES[sp]?.render ?? sp];
    if (ms) out.add(ms);
  }
  return out;
}
/** 이 적 ID 목록의 채색 리그를 미리 로드·베이크 (방 전환 페이드 동안). 화면 배율이 크게 바뀌었으면 다시 굽는다 */
export function preloadPaintedEnemies(ids) {
  for (const m of paintedModsFor(ids)) refreshRig(m.spec);
}
// 방 진입(로딩 페이드 뒤)에 스테이지 적 목록의 리그를 굽기 시작 → 첫 적이 보이기 전에 끝난다.
// 다른 스테이지로 넘어가면 새 스테이지가 쓰지 않는 적 리그를 놓아 메모리가 스테이지 하나 분량을 넘지 않게 한다.
let _stageId = null;
bus.on('roomEntered', ({ stageId } = {}) => {
  if (!vecReady) loadEnemyRenderers();   // 이전 받기가 실패했으면 다시 (오프라인 → 복구)
  if (!paintedEnemiesOn(game)) return;
  const ids = STAGES[stageId]?.enemies ?? [];
  if (stageId !== _stageId) { _stageId = stageId; releaseRigs([...paintedModsFor(ids)].map((m) => m.spec.src)); }
  preloadPaintedEnemies(ids);
});
let _preWorld = null;
function preloadWorld(world) {
  _preWorld = world;
  const ids = new Set(world.stage?.enemies ?? []);
  for (const e of world.entities ?? []) if (e.kind === 'enemy' && e.def) ids.add(e.def.id);
  preloadPaintedEnemies(ids);
}

function drawVector(ctx, e, world, flash) {
  const fn = ENEMY_RENDER[e.def.render];
  if (fn) fn(ctx, e, world, { flash });
  else {
    ctx.fillStyle = flash ? '#fff' : (e.def.palette?.body ?? '#8a7a6a');
    ctx.beginPath(); ctx.ellipse(0, -e.h / 2 / (e.scale || 1), e.w / 2 / (e.scale || 1), e.h / 2 / (e.scale || 1), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff3040'; ctx.beginPath(); ctx.arc(e.w * 0.2, -e.h * 0.7, 3, 0, TAU); ctx.fill();
  }
}

/** 그리다 예외를 낸 채색 적 모듈 (render 키) — 이번 실행 동안 벡터로 그린다 (보스 PaintedBody 의 'failed' 와 같은 규칙) */
const DRAW_FAILED = new Set();
export function drawEnemy(ctx, e, world) {
  const pm = PAINTED_ENEMIES[e.def.render] && paintedEnemiesOn(world?.game) && !DRAW_FAILED.has(e.def.render) ? PAINTED_ENEMIES[e.def.render] : null;
  if (pm && world && world !== _preWorld) preloadWorld(world);
  const rig = pm ? requestRig(pm.spec) : null;
  ctx.save();
  // 카메라 공간 (채색 렌더러의 월드 좌표 파티클용). Enemy.draw 가 맞음 반응 변환(흔들림·눕기·기울기) 직전에 잡아 둔 e.camXf 를 먼저 쓴다 (R1-REQ-71)
  const cam = rig?.ready ? (e.camXf ?? ctx.getTransform()) : null;
  ctx.translate(e.cx, e.bottom);
  ctx.scale(e.facing < 0 ? -1 : 1, 1);
  if (e.scale && e.scale !== 1) ctx.scale(e.scale, e.scale);
  const flash = e.flashT > 0;
  if (rig?.ready) {
    let k = 1;
    if (e._vecSeen) { const now = performance.now(); if (e._pT === undefined) e._pT = now; k = clamp((now - e._pT) / 300, 0, 1); if (k >= 1) e._vecSeen = false; }
    if (k < 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (1 - k); drawVector(ctx, e, world, flash); ctx.globalAlpha = ga; }
    const q0 = ctx.imageSmoothingQuality;
    const m = unwindMark(ctx);   // = ctx.save() + 되감기 표식: 모듈이 그리다 던지면 모듈이 연 save 까지 되돌린다
    try {
      if (k < 1) ctx.globalAlpha *= k;
      if (rig.scale !== 1) ctx.scale(rig.scale, rig.scale);     // spec.scale: painted figure sized to the logic rect
      pm.draw(ctx, e, world, { flash, cam }, rig);
      unwindDone(ctx, m);
    } catch (err) {
      // 그리기 오류 → 이 적 종류는 벡터로 (월드 그리기는 계속). 이번 프레임도 벡터로 그린다
      unwindTo(ctx, m);
      DRAW_FAILED.add(e.def.render);
      console.error('[painted enemy] 그리기 오류 → 벡터로 전환:', e.def.render, err);
      drawVector(ctx, e, world, flash);
    }
    ctx.imageSmoothingQuality = q0;
  } else {
    if (pm && !rig?.failed) e._vecSeen = true;
    drawVector(ctx, e, world, flash);
  }
  ctx.restore();
}
