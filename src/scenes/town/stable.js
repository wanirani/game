// STUB (W0 SKEL) — owner: CMP-TOWN
// 영혼의 마구간 장면 'stable' (companions §2.2, §7.3; 허브 문 'scene:stable' 이 push 한다).
// 스텁: 들어오자마자 빠진다.
import { Scene } from '../../core/game.js';

export class StableScene extends Scene {
  constructor(game) {
    super(game);
    this.opaque = false;
  }
  enter(params = {}) {
    if (this.game.top === this) this.game.pop();
  }
}
