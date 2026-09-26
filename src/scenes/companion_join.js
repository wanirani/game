// STUB (W0 SKEL) — owner: CMP-UI
// 동료 합류 연출 장면 'companionJoin' (companions §7.4; MASTER_PLAN §1.13: 마을·마구간에서만 푸시, 스테이지 위에는 금지).
//  push('companionJoin', { id, source, onDone })
// 스텁: 아무것도 그리지 않고 바로 빠진 뒤 onDone 을 부른다 (onDone 이 다른 장면을 쌓아도 안전하도록 먼저 pop).
// 스택에 혼자 남는 경우(?scene=companionJoin 디버그 주소 등)에는 타이틀로 간다 (빈 화면 방지).
import { Scene } from '../core/game.js';

export class CompanionJoinScene extends Scene {
  constructor(game) {
    super(game);
    this.opaque = false;
    this.deferToasts = true;
  }
  enter(params = {}) {
    const g = this.game;
    if (g.top === this) {
      if (g.scenes.length <= 1) g.go('title', {}, { fade: false });
      else g.pop();
    }
    params.onDone?.();
  }
}
