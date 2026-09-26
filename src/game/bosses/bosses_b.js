// 보스 구현 B (8~13장, 드라큘라, 혼돈의 군주). BOSS_B[id] = class extends Boss
import { Leviathan } from './b_leviathan.js';
import { Colossus } from './b_colossus.js';
import { FrostQueen } from './b_frostqueen.js';
import { Death } from './b_death.js';

export const BOSS_B = {
  b_leviathan: Leviathan,
  b_colossus: Colossus,
  b_frostqueen: FrostQueen,
  b_death: Death,
};
