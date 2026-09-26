// 적 렌더 디스패처.
// ENEMY_RENDER[renderId] = (ctx, e, world, { flash }) => void  — 원점: 발 중앙(e.cx, e.bottom), facing 반영은 여기서 처리
// = { ...RENDER_A, ...RENDER_B, ...RENDER_C, ...RENDER_D } (2부 C/D: world2 §5.1, 렌더 ID = 적 id)
// e: {cx, bottom, w, h, facing, anim, animT, t, flashT, state, def, elite, scale}
// 채색 퍼핏(painted/enemies/*): 등록된 렌더러가 있고 리그(아틀라스)가 로드되면 그것을 그리고, 아니면 벡터 렌더러를 그린다.
// 로드 중에 이미 벡터로 보인 개체는 0.3초 크로스페이드로 전환한다. 스테이지 진입 시 해당 스테이지 적 목록을 미리 굽는다.
// (끄기: 공용 ?painted=0 · window.__paintedOff · settings.painted=false, 적만: window.__paintedEnemies = false — A/B 비교·저사양 대비)
import { TAU, clamp } from '../core/math.js';
import { RENDER_A } from './enemies_a.js';
import { RENDER_B } from './enemies_b.js';
import { RENDER_C } from './enemies_c.js';   // [hook:p2]
import { RENDER_D } from './enemies_d.js';   // [hook:p2]
import { PAINTED_ENEMIES } from './painted/enemies/index.js';
import { requestRig, refreshRig, releaseRigs } from './painted/enemy_kit.js';
import { game } from '../core/game.js';
import { ENEMIES } from '../data/enemies.js';
import { STAGES } from '../data/stages.js';
import { bus } from '../core/events.js';
import { paintedEnabled } from './painted/registry.js';

export const ENEMY_RENDER = { ...RENDER_A, ...RENDER_B };
// 2부(C/D) 병합. 2부 렌더 파일이 순환 import 로 이 모듈보다 늦게 초기화되는 경우(도우미를 보스/적 모듈에서 가져올 때)
// 최상위에서 읽으면 초기화 전 참조 오류로 게임 전체가 멈추므로, 그때는 첫 그리기에서 다시 합친다.
let p2Merged = false;
function mergeP2() {   // [hook:p2]
  try { Object.assign(ENEMY_RENDER, RENDER_C, RENDER_D); p2Merged = true; } catch { /* 초기화 전 → drawVector 에서 다시 */ }
}
mergeP2();

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
  if (!p2Merged) mergeP2();   // [hook:p2]
  const fn = ENEMY_RENDER[e.def.render];
  if (fn) fn(ctx, e, world, { flash });
  else {
    ctx.fillStyle = flash ? '#fff' : (e.def.palette?.body ?? '#8a7a6a');
    ctx.beginPath(); ctx.ellipse(0, -e.h / 2 / (e.scale || 1), e.w / 2 / (e.scale || 1), e.h / 2 / (e.scale || 1), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff3040'; ctx.beginPath(); ctx.arc(e.w * 0.2, -e.h * 0.7, 3, 0, TAU); ctx.fill();
  }
}

export function drawEnemy(ctx, e, world) {
  const pm = PAINTED_ENEMIES[e.def.render] && paintedEnemiesOn(world?.game) ? PAINTED_ENEMIES[e.def.render] : null;
  if (pm && world && world !== _preWorld) preloadWorld(world);
  const rig = pm ? requestRig(pm.spec) : null;
  ctx.save();
  const cam = rig?.ready ? ctx.getTransform() : null;   // 카메라 공간 (채색 렌더러의 월드 좌표 파티클용)
  ctx.translate(e.cx, e.bottom);
  ctx.scale(e.facing < 0 ? -1 : 1, 1);
  if (e.scale && e.scale !== 1) ctx.scale(e.scale, e.scale);
  const flash = e.flashT > 0;
  if (rig?.ready) {
    let k = 1;
    if (e._vecSeen) { const now = performance.now(); if (e._pT === undefined) e._pT = now; k = clamp((now - e._pT) / 300, 0, 1); if (k >= 1) e._vecSeen = false; }
    if (k < 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (1 - k); drawVector(ctx, e, world, flash); ctx.globalAlpha = ga; }
    const q0 = ctx.imageSmoothingQuality;
    ctx.save();
    if (k < 1) ctx.globalAlpha *= k;
    if (rig.scale !== 1) ctx.scale(rig.scale, rig.scale);     // spec.scale: painted figure sized to the logic rect
    pm.draw(ctx, e, world, { flash, cam }, rig);
    ctx.restore();
    ctx.imageSmoothingQuality = q0;
  } else {
    if (pm && !rig?.failed) e._vecSeen = true;
    drawVector(ctx, e, world, flash);
  }
  ctx.restore();
}
