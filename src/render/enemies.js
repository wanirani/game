// 적 렌더 디스패처.
// ENEMY_RENDER[renderId] = (ctx, e, world, pal) => void  — 원점: 발 중앙(e.cx, e.bottom), facing 반영은 여기서 처리
// e: {cx, bottom, w, h, facing, anim, animT, t, flashT, state, def, elite, scale}
// 채색 퍼핏(painted/enemies/*): 등록된 렌더러가 있고 리그(아틀라스)가 로드되면 그것을 그리고, 아니면 벡터 렌더러를 그린다.
// 로드 중에 이미 벡터로 보인 개체는 0.3초 크로스페이드로 전환한다. 스테이지 진입 시 해당 스테이지 적 목록을 미리 굽는다.
// (끄기: 공용 ?painted=0 · window.__paintedOff · settings.painted=false, 적만: window.__paintedEnemies = false — A/B 비교·저사양 대비)
import { TAU, clamp } from '../core/math.js';
import { RENDER_A } from './enemies_a.js';
import { RENDER_B } from './enemies_b.js';
import { PAINTED_ENEMIES } from './painted/enemies/index.js';
import { requestRig } from './painted/enemy_kit.js';
import { ENEMIES } from '../data/enemies.js';
import { STAGES } from '../data/stages.js';
import { bus } from '../core/events.js';
import { paintedEnabled } from './painted/registry.js';

export const ENEMY_RENDER = { ...RENDER_A, ...RENDER_B };

/** 채색 적 사용 여부: 공용 스위치(?painted=0 · window.__paintedOff · settings.painted=false) + 적 전용 window.__paintedEnemies=false */
export const paintedEnemiesOn = (game) => globalThis.__paintedEnemies !== false && paintedEnabled(game);

/** 이 적 ID 목록의 채색 리그를 미리 로드·베이크 (방 전환 페이드 동안) */
export function preloadPaintedEnemies(ids) {
  for (const id of ids) {
    const d = ENEMIES[id];
    const m = PAINTED_ENEMIES[d?.render ?? id];
    if (m) requestRig(m.spec);
    const sp = d?.aiParams?.spawn;           // 스포너가 만들어 내는 적도 함께
    if (sp && PAINTED_ENEMIES[ENEMIES[sp]?.render ?? sp]) requestRig(PAINTED_ENEMIES[ENEMIES[sp]?.render ?? sp].spec);
  }
}
// 방 진입(로딩 페이드 뒤)에 스테이지 적 목록의 리그를 굽기 시작 → 첫 적이 보이기 전에 끝난다
bus.on('roomEntered', ({ stageId } = {}) => { if (paintedEnemiesOn()) preloadPaintedEnemies(STAGES[stageId]?.enemies ?? []); });
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
    pm.draw(ctx, e, world, { flash, cam }, rig);
    ctx.restore();
    ctx.imageSmoothingQuality = q0;
  } else {
    if (pm && !rig?.failed) e._vecSeen = true;
    drawVector(ctx, e, world, flash);
  }
  ctx.restore();
}
