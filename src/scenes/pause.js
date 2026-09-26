// [임시] 일시정지 — UI 담당이 메뉴(장비/인벤토리/스킬/직업/퀘스트/비전서/설정)와 연결해 확장
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { text, panel, button, ListMenu, FONT, COLORS } from '../core/ui.js';

export class PauseScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ world }) {
    this.world = world;
    this.items = [
      ['계속하기', () => this.game.pop()],
      ['메뉴 (장비·스킬·인벤토리)', () => this.game.registry.menu && this.game.push('menu', { world })],
      ['설정', () => this.game.registry.options && this.game.push('options', {})],
      ['마을로 귀환', () => { world.syncToState(); this.game.go(this.game.registry.hub ? 'hub' : 'title', {}); }],
      ['타이틀로', () => { world.syncToState(); this.game.go('title', {}); }],
    ];
    this.menu = new ListMenu(this.items.length);
  }
  update(dt) {
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') { audio.sfx('menu_ok'); this.items[this.menu.index][1](); }
    else if (r === 'cancel' || input.pressed('menu')) { audio.sfx('menu_cancel'); this.game.pop(); }
  }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, vw, vh);
    text(ctx, 'PAUSE', vw / 2, 110, { size: 48, align: 'center', weight: 900, family: FONT.logo, color: COLORS.gold });
    const w = 340, h = 46;
    this.items.forEach(([l], i) => {
      const r = { x: vw / 2 - w / 2, y: 150 + i * (h + 10), w, h };
      this.menu.hit(i, r);
      button(ctx, r, l, { selected: this.menu.index === i });
    });
  }
}
