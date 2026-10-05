// 보스 구현 E (외전: s21 「하늘 정원의 용」). BOSS_E[id] = class extends BossC — bosses_c.js / bosses_d.js 와 같은 형식.
// 클래스 파일이 아직 스텁(null)이면 그 항목을 건너뛴다 → bosses/index.js 가 GenericBoss 로 대체한다.
import { Argen } from './e_argen.js';

const onlyReady = (o) => Object.fromEntries(Object.entries(o).filter(([, C]) => typeof C === 'function'));

export const BOSS_E = onlyReady({
  b_argen: Argen,
});
