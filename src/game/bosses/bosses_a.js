// 보스 구현 A (1~7장): BOSS_A[id] = class extends Boss (공용 툴킷: a_common.js)
import { Nightwing } from './a_nightwing.js';
import { Banshee } from './a_banshee.js';

export const BOSS_A = {
  b_nightwing: Nightwing,
  b_banshee: Banshee,
};
