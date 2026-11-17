// 본 게임 장면 v2g — 자리만 잡아 둔 파일이다. ENGINE 구역이 이 파일을 진짜 장면으로 바꾼다 (docs/v2/P1_CONTRACT.md §2).
// (등록부 src/scenes/reg_v2.js 가 이 파일을 동적으로 불러오므로, 파일이 없으면 배포 빌드가 멈춘다.)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';

export default class V2Game extends Scene {
  constructor(game) { super(game); this.hidePad = true; this.hideToasts = true; }
  update(dt) {
    this.t += dt;
    if (input.pressed('cancel') || input.pressed('confirm') || input.pointer.tapped) this.game.go(this.game.registry.v2pick ? 'v2pick' : 'title', {}, { fade: false });
  }
  render(ctx) {
    const W = this.game.viewW, H = 540;
    ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e8d8c0'; ctx.font = '600 22px sans-serif';
    ctx.fillText('본 게임은 만드는 중입니다', W / 2, H / 2);
  }
}
