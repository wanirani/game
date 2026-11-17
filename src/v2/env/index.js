// 리빌드 시범 — 자리 표시 장면 (담당 작업이 이 파일을 실제 장면으로 바꾼다). docs/v2/README.md
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';

export default class V2Stub_env extends Scene {
  constructor(game) { super(game); this.hidePad = true; }
  update(dt) { this.t += dt; if ((input.pressed('cancel') || input.pointer.tapped) && this.game.registry.title) this.game.go('title', {}, { fade: false }); }
  render(ctx) {
    const W = this.game.viewW, H = 540;
    ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e8d8c0'; ctx.font = '600 22px sans-serif';
    ctx.fillText('v2 env — placeholder', W / 2, H / 2);
  }
}
