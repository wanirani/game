// 보스 구현 C (2부 14~17장). BOSS_C[id] = class extends BossB — W0 SKEL 이 만든 최종 레지스트리 (스텁 아님).
// 클래스 파일이 아직 스텁(null)이면 그 항목을 건너뛴다 → bosses/index.js 가 GenericBoss 로 대체한다.
// 이 파일은 고치지 않는다: 각 BOSS-P2 패키지는 자기 클래스 파일만 교체한다.
import { Narkissa } from './c_narkissa.js';
import { Moloch } from './c_moloch.js';
import { Dagon } from './c_dagon.js';
import { Ziz } from './c_ziz.js';

const onlyReady = (o) => Object.fromEntries(Object.entries(o).filter(([, C]) => typeof C === 'function'));

export const BOSS_C = onlyReady({
  b_narkissa: Narkissa,
  b_moloch: Moloch,
  b_dagon: Dagon,
  b_ziz: Ziz,
});
