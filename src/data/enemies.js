// 적 데이터 집계 (A: 1~6장+공용, B: 7~13장, C: 2부 14~16장, D: 2부 17~20장). 스키마는 game/enemy.js 상단 주석 참고
import { ENEMIES_A } from './enemies_a.js';
import { ENEMIES_B } from './enemies_b.js';
import { ENEMIES_C } from './enemies_c.js';   // [hook:p2]
import { ENEMIES_D } from './enemies_d.js';   // [hook:p2]
export const ENEMIES = { ...ENEMIES_A, ...ENEMIES_B, ...ENEMIES_C, ...ENEMIES_D };   // [hook:p2]
