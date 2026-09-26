// 보스 레지스트리: BOSS_CLASSES[id] = class extends Boss (bosses_a.js / bosses_b.js 에서 병합)
import { BOSSES } from '../../data/bosses.js';
import { GenericBoss } from './boss.js';
import { BOSS_A } from './bosses_a.js';
import { BOSS_B } from './bosses_b.js';

export const BOSS_CLASSES = { ...BOSS_A, ...BOSS_B };

export function createBoss(world, id, x, y) {
  const def = BOSSES[id] || { id, name: id, hp: 800, atk: 20, size: { w: 120, h: 140 } };
  const C = BOSS_CLASSES[id] || GenericBoss;
  return new C(world, def, x, y);
}
