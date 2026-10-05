// 보스 데이터 집계 (A: 1~7장, B: 8~13장, C: 2부 14~17장, D: 2부 18~20장, E: 외전 21장)
import { BOSSES_A } from './bosses_a.js';
import { BOSSES_B } from './bosses_b.js';
import { BOSSES_C } from './bosses_c.js';   // [hook:p2]
import { BOSSES_D } from './bosses_d.js';   // [hook:p2]
import { BOSSES_E } from './bosses_e.js';   // [hook:p2] 외전 (s21 아르겐)
export const BOSSES = { ...BOSSES_A, ...BOSSES_B, ...BOSSES_C, ...BOSSES_D, ...BOSSES_E };   // [hook:p2]
