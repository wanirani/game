// 적 데이터 집계 (A: 1~6장+공용, B: 7~13장). 스키마는 game/enemy.js 상단 주석 참고
import { ENEMIES_A } from './enemies_a.js';
import { ENEMIES_B } from './enemies_b.js';
export const ENEMIES = { ...ENEMIES_A, ...ENEMIES_B };
