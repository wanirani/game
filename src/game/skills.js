// [임시 최소 구현] 스킬 담당 에이전트가 전면 확장. 공개 API 유지:
//  SKILL_IMPL[skillId] = (player, world, level) => boolean(시전 성공)
//  castSkill(player, world, skillId, level), castUltimate(player, world), castTechnique(player, world, tech)
import { audio } from '../core/audio.js';
import { playerStrike } from './combat.js';

export const SKILL_IMPL = {};

export function castSkill(p, world, id, lv) {
  const fn = SKILL_IMPL[id];
  if (!fn) return false;
  return fn(p, world, lv) !== false;
}

export function castUltimate(p, world) {
  p.run.sp = 0;
  world.startUltimate?.(p);
  audio.sfx('ult');
  world.game.flash('#fff', 0.9, 2);
  world.camera.shake(14, 0.6);
  const cam = world.camera;
  playerStrike(world, { x: cam.x, y: cam.y, w: cam.vw, h: cam.vh }, { owner: p, team: 'player', stats: p.stats, mv: 6, type: 'mag', element: 'holy', hitId: 'ult' + world.time, kb: [400, -500], hitstop: 0.15, shake: 12, tags: ['ult'] });
  return true;
}

export function castTechnique(p, world, tech) {
  const fn = SKILL_IMPL[tech.id];
  if (!fn) return false;
  return fn(p, world, 1) !== false;
}
