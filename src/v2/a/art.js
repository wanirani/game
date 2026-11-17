// 시범판 A — v1 그림 재사용 어댑터 (docs/v2/proto_a.md §7)
// 영웅: render/hero.js 의 drawHero(ctx, p, world=null, opts) — 채색 퍼펫(render/hero_puppet.js)을 그대로 쓴다.
//   p 는 v1 Player 가 아니라 여기서 만드는 '대역 객체'다: 발 중앙 (cx, bottom) = (0, 0) 에 놓고, 캔버스 변환으로 화면 자리·배율을 준다.
// 적:   render/enemies.js 의 drawEnemy(ctx, e, world=null) — 채색 레지스트리(render/painted/enemies)를 그대로 쓴다.
//   world 를 주지 않으므로 v1 의 시체 조각·분해 연출(world.fx)은 돌지 않는다 → 쓰러짐은 여기서 기울여 흐리게 한다.
import { drawHero, preloadPuppet } from '../../render/hero.js';
import { drawEnemy, preloadPaintedEnemies } from '../../render/enemies.js';
import { CHARACTERS } from '../../data/characters.js';
import { classChain } from '../../data/classes.js';
import { ENEMIES } from '../../data/enemies.js';

export function heroLook(charId = 'kael') {
  const ch = CHARACTERS[charId];
  const look = structuredClone(ch.look);
  for (const c of classChain(ch.rootClass)) Object.assign(look, structuredClone(c.look || {}));
  look.weapon = { type: ch.weaponType, style: 1, level: 0, rarity: 0, element: null };
  return look;
}

/** drawHero 가 읽는 필드만 가진 대역 */
export function makeHeroProxy(charId = 'kael') {
  const ch = CHARACTERS[charId];
  preloadPuppet(charId, ch.rootClass);
  return {
    cx: 0, bottom: 0, w: ch.size.w, h: ch.size.h, facing: 1, anim: 'idle', animT: 0, move: null, moveT: 0,
    vx: 0, vy: 0, onGround: true, rig: {}, t: 0, look: heroLook(charId), ch, stats: { reach: 0 }, charging: 0, muzzleT: 0,
  };
}

/**
 * 영웅 그리기. h = { facing, anim, animT, mv, mvT, speed(수평 속력), vy(위 +), onGround, t, blink }
 * (X, Y) = 발의 화면 자리, s = 깊이 배율
 */
export function drawHeroAt(ctx, p, h, X, Y, s) {
  p.facing = h.facing; p.anim = h.anim; p.animT = h.animT; p.move = h.mv || null; p.moveT = h.mvT || 0;
  p.vx = h.anim === 'hurt' ? h.kbx : h.speed * h.facing;      // 달리기 걸음은 수평 속력(깊이 방향 포함)으로 돈다
  p.vy = -h.vy; p.onGround = h.onGround; p.t = h.t;
  ctx.save();
  ctx.translate(X, Y); ctx.scale(s, s);
  if (h.blink) ctx.globalAlpha = 0.55;
  try { drawHero(ctx, p, null, { main: true }); } catch (err) { if (!drawHeroAt.warned) { drawHeroAt.warned = true; console.error('[v2a] drawHero', err); } fallbackBody(ctx, 30, 82, '#c8a070'); }
  ctx.restore();
}

export function enemyDef(kind) { return ENEMIES[kind]; }
export function preloadEnemies(kinds) { try { preloadPaintedEnemies(kinds); } catch { /* 벡터 대체 그림으로 */ } }

/** 적 그리기. e 는 actors.js 의 Enemy (drawEnemy 가 읽는 필드를 직접 가진다: anim, animT, t, flashT, stun, state, def, params …) */
export function drawEnemyAt(ctx, e, X, Y, s) {
  const cx = e.cx, bottom = e.bottom;
  e.cx = 0; e.bottom = 0;
  ctx.save();
  ctx.translate(X, Y); ctx.scale(s, s);
  if (e.dieK > 0) { ctx.globalAlpha = Math.max(0, 1 - e.dieK * e.dieK); ctx.rotate(e.dieK * 0.9 * (e.kbDir || 1)); ctx.translate(0, e.dieK * 10); }
  try { drawEnemy(ctx, e, null); } catch (err) { if (!drawEnemyAt.warned) { drawEnemyAt.warned = true; console.error('[v2a] drawEnemy', err); } fallbackBody(ctx, e.w, e.h, '#8a8478'); }
  ctx.restore();
  e.cx = cx; e.bottom = bottom;
}

function fallbackBody(ctx, w, h, col) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
}
