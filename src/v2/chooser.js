// 리빌드(v2) 시범판 고르기 — 타이틀의 '리빌드 시범' 줄이 여는 작은 화면 (docs/v2/P0_COMPARE.md)
// 타이틀이 고를 때에만 동적 import 로 받는다 (첫 화면 묶음에 들어가지 않는다). 장면 이름 'v2pick'.
// 터치(줄을 누름) · 키보드/패드(위·아래 + 확인 · 취소) 모두 TapMenu 한 곳에서 읽는다.
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, FONT } from '../core/ui.js';
import { drawHints } from '../core/prompts.js';
import { hudSafe } from '../render/hud_layout.js';
import { TapMenu, frame, ornament, GOLD, BONE, DIM } from '../scenes/front/common.js';

const ROWS = [
  { id: 'v2a', label: '시범판 A', desc: '그림을 깊이에 맞춰 겹쳐 그린 화면 (카메라 고정)' },
  { id: 'v2b', label: '시범판 B', desc: '길과 건물을 입체로 세운 화면 (카메라가 돈다)' },
  { id: 'back', label: '돌아가기', desc: null },
];

export default class V2Chooser extends Scene {
  constructor(game) { super(game); this.uiScale = true; this.hidePad = true; this.menu = new TapMenu(ROWS.length, { index: 0 }); this.backIndex = null; }
  enter(params) {
    this.backIndex = params?.backIndex ?? null;
    this.menu = new TapMenu(ROWS.length, { index: Math.min(ROWS.length - 1, Math.max(0, params?.index ?? 0)) });
  }
  update(dt) {
    this.t += dt;
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'cancel') this.pick(ROWS[ROWS.length - 1]);
    else if (r === 'confirm') this.pick(ROWS[this.menu.index]);
    void input;
  }
  pick(row) {
    const g = this.game;
    if (row.id === 'back') { audio.sfx('menu_cancel'); g.go('title', { menu: true, index: this.backIndex }); return; }
    audio.sfx('menu_ok');
    g.go(row.id, {});
  }
  render(ctx) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH, k = g.uiK || 1;
    const S = hudSafe(g), sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, W, H);
    const bg = assets.get?.('bg/title');
    if (bg && bg.width) { const s = Math.max(W / bg.width, H / bg.height); ctx.globalAlpha = 0.28; ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s); ctx.globalAlpha = 1; }
    const availH = H - st - sb, tight = availH < 470;
    const w = Math.min(640, W - sl - sr - 48), x = sl + (W - sl - sr - w) / 2;
    const headH = tight ? 74 : 104, cardH = tight ? 76 : 92, backH = tight ? 48 : 54, gap = tight ? 8 : 12, hintH = 30;
    const total = headH + cardH * 2 + backH + gap * 2;
    let y = st + Math.max(8, (availH - hintH - total) / 2);
    text(ctx, '리빌드 시범', W / 2, y + (tight ? 30 : 38), { size: tight ? 28 : 34, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 5, maxWidth: w });
    if (!tight) ornament(ctx, W / 2, y + 52, Math.min(300, w * 0.6));
    text(ctx, '같은 구간을 두 가지 화면으로 만들었습니다. 둘 다 해 보고 골라 주세요.', W / 2, y + headH - (tight ? 16 : 20), { size: 15, align: 'center', color: BONE, ow: 3, maxWidth: w });
    y += headH;
    this.menu.clearHits();
    ROWS.forEach((row, i) => {
      const h = row.desc ? cardH : backH, sel = this.menu.index === i;
      const r = { x, y, w, h };
      this.menu.hit(i, r);
      frame(ctx, r.x, r.y, r.w, r.h, { accent: sel ? GOLD : '#5a4650', glow: sel ? 0.6 : 0, corners: sel });
      if (row.desc) {
        text(ctx, row.label, r.x + 24, r.y + (tight ? 31 : 38), { size: tight ? 22 : 24, weight: 800, family: FONT.title, color: sel ? '#fff0d0' : BONE, ow: 4 });
        text(ctx, row.desc, r.x + 24, r.y + h - (tight ? 13 : 17), { size: 15, color: sel ? BONE : DIM, ow: 3, maxWidth: w - 48 });
      } else text(ctx, row.label, r.x + r.w / 2, r.y + h / 2 + 7, { size: 20, weight: 700, align: 'center', color: sel ? '#fff0d0' : DIM, ow: 3 });
      y += h + gap;
    });
    if (input.mode !== 'touch') drawHints(ctx, [[['confirm'], '고르기'], [['cancel'], '돌아가기']], W / 2, H - sb - 12, { align: 'center', size: 14, color: '#c8b8a0' });
  }
}
