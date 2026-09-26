// 보스 레지스트리. 보스 담당 에이전트가 각 보스 클래스를 추가: BOSS_CLASSES[id] = class extends Boss
import { BOSSES } from '../../data/bosses.js';
import { GenericBoss } from './boss.js';

export const BOSS_CLASSES = {};

export function createBoss(world, id, x, y) {
  const def = BOSSES[id] || { id, name: id, hp: 800, atk: 20, size: { w: 120, h: 140 } };
  const C = BOSS_CLASSES[id] || GenericBoss;
  return new C(world, def, x, y);
}
