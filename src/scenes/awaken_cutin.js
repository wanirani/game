// STUB (W0 SKEL) — owner: AWAKEN-CORE
// 각성기 컷인 장면 'awakenCutin' (feel.md §6.2, §6.3; MASTER_PLAN §1.13).
//  push('awakenCutin', { world, p, charId, short, onDone })  opaque=false, hidePad, deferToasts, world.hudHidden
// 스텁: 아무것도 그리지 않고 바로 빠진 뒤 onDone 을 부른다 (onDone 이 다른 장면을 쌓아도 안전하도록 먼저 pop).
import { Scene } from '../core/game.js';

export class AwakenCutinScene extends Scene {
  constructor(game) {
    super(game);
    this.opaque = false;
    this.hidePad = true;
    this.deferToasts = true;
  }
  enter(params = {}) {
    if (this.game.top === this) this.game.pop();
    params.onDone?.();
  }
}
