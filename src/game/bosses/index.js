// 보스 레지스트리: BOSS_CLASSES[id] = class extends Boss (bosses_a/b.js + 2부 bosses_c/d.js 에서 병합)
// = { ...BOSS_A, ...BOSS_B, ...BOSS_C, ...BOSS_D } (world2 §6). 아직 클래스가 없는(스텁) 2부 보스는 GenericBoss 로 대체된다.
import { BOSSES } from '../../data/bosses.js';
import { GenericBoss } from './boss.js';
import { BOSS_A } from './bosses_a.js';
import { BOSS_B } from './bosses_b.js';
import { BOSS_C } from './bosses_c.js';   // [hook:p2]
import { BOSS_D } from './bosses_d.js';   // [hook:p2]

export const BOSS_CLASSES = { ...BOSS_A, ...BOSS_B };
// 2부(C/D) 병합. 2부 보스 파일이 순환 import 로 이 모듈보다 늦게 초기화되는 경우(예: 갤러리가 bosses_c.js 를 먼저 부름)
// 최상위에서 읽으면 초기화 전 참조 오류로 게임 전체가 멈추므로, 그때는 첫 createBoss 에서 다시 합친다.
let p2Merged = false;
function mergeP2() {   // [hook:p2]
  try { Object.assign(BOSS_CLASSES, BOSS_C, BOSS_D); p2Merged = true; } catch { /* 초기화 전 → createBoss 에서 다시 */ }
}
mergeP2();

export function createBoss(world, id, x, y) {
  if (!p2Merged) mergeP2();   // [hook:p2]
  const def = BOSSES[id] || { id, name: id, hp: 800, atk: 20, size: { w: 120, h: 140 } };
  const C = BOSS_CLASSES[id] || GenericBoss;
  return new C(world, def, x, y);
}
