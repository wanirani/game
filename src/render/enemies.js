// [임시 렌더러] 적 렌더 담당이 전면 교체.
// ENEMY_RENDER[renderId] = (ctx, e, world, pal) => void  — 원점: 발 중앙(e.cx, e.bottom), facing 반영은 여기서 처리
// e: {cx, bottom, w, h, facing, anim, animT, t, flashT, state, def, elite, scale}
import { TAU } from '../core/math.js';
import { RENDER_A } from './enemies_a.js';
import { RENDER_B } from './enemies_b.js';

export const ENEMY_RENDER = { ...RENDER_A, ...RENDER_B };

export function drawEnemy(ctx, e, world) {
  const fn = ENEMY_RENDER[e.def.render];
  ctx.save();
  ctx.translate(e.cx, e.bottom);
  ctx.scale(e.facing < 0 ? -1 : 1, 1);
  if (e.scale && e.scale !== 1) ctx.scale(e.scale, e.scale);
  const flash = e.flashT > 0;
  if (fn) fn(ctx, e, world, { flash });
  else {
    ctx.fillStyle = flash ? '#fff' : (e.def.palette?.body ?? '#8a7a6a');
    ctx.beginPath(); ctx.ellipse(0, -e.h / 2 / (e.scale || 1), e.w / 2 / (e.scale || 1), e.h / 2 / (e.scale || 1), 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff3040'; ctx.beginPath(); ctx.arc(e.w * 0.2, -e.h * 0.7, 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
