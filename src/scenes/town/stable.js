// STUB (W0 SKEL) — owner: CMP-TOWN
// 영혼의 마구간 장면 'stable' (companions §2.2, §7.3; 허브 문 'scene:stable' 이 push 한다).
// 스텁: 들어오자마자 빠진다. 스택에 혼자 남는 경우(?scene=stable 디버그 주소 등)에는 허브로 간다 (빈 화면 방지).
import { Scene } from '../../core/game.js';

export class StableScene extends Scene {
  constructor(game) {
    super(game);
    this.opaque = false;
  }
  enter(params = {}) {
    const g = this.game;
    if (g.top !== this) return;
    if (g.scenes.length <= 1) g.go('hub', {}, { fade: false });
    else g.pop();
  }
}
