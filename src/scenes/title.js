// [임시] 타이틀 — UI 담당이 전면 교체 (슬롯/난이도/캐릭터 선택 흐름)
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, drawCover, FONT, vignette } from '../core/ui.js';
import { newGameState } from '../game/state.js';

export class TitleScene extends Scene {
  enter() { audio.music('title'); }
  update() {
    if (input.anyPressed() && this.t > 0.4) {
      audio.sfx('menu_ok');
      this.game.state = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
      this.game.go('stage', { stageId: 's01' });
    }
  }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH;
    drawCover(ctx, assets.get('bg/title'), vw, vh);
    vignette(ctx, vw, vh, 0.8);
    text(ctx, 'BLOOD NOCTURNE', vw / 2, vh * 0.32, { size: 64, align: 'center', weight: 900, family: FONT.logo, color: '#e8c872', ow: 6 });
    text(ctx, '블러드 녹턴 : 악마성 연대기', vw / 2, vh * 0.32 + 44, { size: 24, align: 'center', weight: 800, family: FONT.title, color: '#f0e0d0' });
    if (Math.floor(this.t * 2) % 2 === 0) text(ctx, 'PRESS START', vw / 2, vh * 0.78, { size: 24, align: 'center', weight: 800, family: FONT.logo, color: '#fff' });
  }
}
