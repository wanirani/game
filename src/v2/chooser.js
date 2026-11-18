// 리빌드(v2) 시범판 고르기 — 타이틀의 '리빌드 시범' 줄이 여는 작은 화면 (docs/v2/P0_COMPARE.md)
// 타이틀이 고를 때에만 동적 import 로 받는다 (첫 화면 묶음에 들어가지 않는다). 장면 이름 'v2pick'.
// 터치(줄을 누름) · 키보드/패드(위·아래 + 확인 · 취소) 모두 TapMenu 한 곳에서 읽는다.
// 줄: 본 게임(v2g, 만드는 중) · 시범판 B(고른 방식) · 꾸민 배경(v2c) · 성능 진단(v2bench) · 시범판 A · 돌아가기.
//   줄 높이는 화면 높이에 맞춰 줄인다 — UI 최소 높이(400)에서도 여섯 줄이 모두 들어간다 (tools/v2/p0_entry_check.mjs 가 잰다).
//   시범 장면에서 돌아오면 방금 고른 줄이 골라져 있다 (장면이 넘기는 index 는 옛 줄 번호라 쓰지 않고, 고른 id 를 여기서 기억한다).
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, FONT } from '../core/ui.js';
import { drawHints } from '../core/prompts.js';
import { hudSafe } from '../render/hud_layout.js';
import { TapMenu, frame, ornament, GOLD, BONE, DIM } from '../scenes/front/common.js';
import { APP_3D } from '../core/build_target.js';

export const ROWS = [
  { id: 'v2g', label: '본 게임', tag: '만드는 중', desc: '에슈빌 오늘 밤에서 시작 · 새 단추 · 아직 만드는 중' },   // opens area eshville_now (the old test route: index.html?scene=v2g&area=slice0)
  { id: 'v2b', label: '시범판 B', tag: '고른 방식', desc: '길·건물·영웅을 입체로 세운 화면 (카메라가 돈다)' },
  { id: 'v2c', label: '꾸민 배경', tag: '새 배경', desc: '시범판 B 에 창·문·지붕·소품까지 입체로 지은 화면' },
  { id: 'v2bench', label: '성능 진단', tag: '약 1분', desc: '이 기기에서 왜 끊기는지 재서 표로 보여 줍니다' },
  { id: 'v2a', label: '시범판 A', tag: null, desc: '그림을 깊이에 맞춰 겹쳐 그린 화면 (카메라 고정)' },
  { id: 'back', label: '돌아가기', tag: null, desc: null },
];
export const HEAD_NOTE = '같은 구간을 여러 방식으로 만든 시범입니다. 골라서 해 보세요.';
const CARDS = ROWS.filter((r) => r.desc).length;
// 3D 앱(build_target '3d'): 이 화면이 앱의 첫 화면이라 「돌아가기」 줄이 없다 (갈 2D 타이틀이 없다). 안드로이드 뒤로 버튼은
// 2D 앱의 타이틀처럼 종료 확인 (exitOnBack → MainActivity BACK_PROBE_JS), 키보드 Esc · 패드 B 는 아무것도 하지 않는다
const SHOWN = APP_3D ? ROWS.filter((r) => r.id !== 'back') : ROWS;
const HAS_BACK = SHOWN.some((r) => r.id === 'back');
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

let lastBack = null;   // 타이틀에서 열 때 받은 줄 번호 — 시범판에서 돌아올 때는 안 넘어오므로 기억해 둔다
let lastPick = null;   // 마지막으로 고른 줄 id — 시범판에서 돌아오면 그 줄에 선다

export default class V2Chooser extends Scene {
  constructor(game) { super(game); this.uiScale = true; this.hidePad = true; this.menu = new TapMenu(SHOWN.length, { index: 0 }); this.backIndex = null; this.exitOnBack = APP_3D; }
  enter(params) {
    const fromTitle = params?.backIndex != null;
    if (fromTitle) { lastBack = params.backIndex; lastPick = null; }
    this.backIndex = lastBack;
    const i = lastPick ? SHOWN.findIndex((r) => r.id === lastPick) : 0;
    this.menu = new TapMenu(SHOWN.length, { index: i >= 0 ? i : 0 });
  }
  update(dt) {
    this.t += dt;
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'cancel') { if (HAS_BACK) this.pick(ROWS[ROWS.length - 1]); }
    else if (r === 'confirm') this.pick(SHOWN[this.menu.index]);
  }
  pick(row) {
    const g = this.game;
    if (row.id === 'back') { audio.sfx('menu_cancel'); lastPick = null; g.go('title', { menu: true, index: this.backIndex }); return; }
    audio.sfx('menu_ok');
    lastPick = row.id;
    g.go(row.id, {});
  }
  render(ctx) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH, k = g.uiK || 1;
    const S = hudSafe(g), sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, W, H);
    const bg = assets.get?.('bg/title');
    if (bg && bg.width) { const s = Math.max(W / bg.width, H / bg.height); ctx.globalAlpha = 0.28; ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s); ctx.globalAlpha = 1; }
    // 높이 나누기: 넉넉하면 머리말(제목 + 꾸밈 + 안내 글)을 다 쓰고, 좁으면 제목 한 줄만 두고 줄 높이를 줄인다
    const availH = H - st - sb, tight = availH < 520, hintH = input.mode === 'touch' ? 0 : 30;
    const w = Math.min(640, W - sl - sr - 48), x = sl + (W - sl - sr - w) / 2;
    const headH = tight ? 36 : 96, backH = HAS_BACK ? (tight ? 44 : 52) : 0, gap = tight ? 5 : 10, gaps = HAS_BACK ? CARDS : CARDS - 1;
    const cardH = clamp(Math.floor((availH - hintH - headH - backH - gap * gaps - 8) / CARDS), 46, 88);
    const total = headH + cardH * CARDS + backH + gap * gaps;
    let y = st + Math.max(6, (availH - hintH - total) / 2);
    this.layout = { tight, cardH, backH, headH, total, top: y, availH };
    text(ctx, APP_3D ? '블러드 녹턴 3D' : '리빌드 시범', W / 2, y + (tight ? 26 : 36), { size: tight ? 24 : 32, align: 'center', weight: 800, family: FONT.title, color: GOLD, ow: 5, maxWidth: w });
    if (!tight) {
      ornament(ctx, W / 2, y + 50, Math.min(300, w * 0.6));
      text(ctx, APP_3D ? '「본 게임」은 만드는 중입니다. 시범판과 성능 진단도 들어 있습니다.' : HEAD_NOTE, W / 2, y + headH - 18, { size: 15, align: 'center', color: BONE, ow: 3, maxWidth: w });
    }
    y += headH;
    this.menu.clearHits();
    SHOWN.forEach((row, i) => {
      const h = row.desc ? cardH : backH, sel = this.menu.index === i;
      const r = { x, y, w, h };
      this.menu.hit(i, r);
      frame(ctx, r.x, r.y, r.w, r.h, { accent: sel ? GOLD : '#5a4650', glow: sel ? 0.6 : 0, corners: sel });
      if (row.desc) {
        const big = h >= 80, small = h < 54, ly = r.y + Math.round(h * 0.43), dy = r.y + h - Math.round(h * (small ? 0.13 : 0.17));
        text(ctx, row.label, r.x + 22, ly, { size: big ? 24 : small ? 19 : 21, weight: 800, family: FONT.title, color: sel ? '#fff0d0' : BONE, ow: 4 });
        if (row.tag) text(ctx, row.tag, r.x + r.w - 22, ly - 2, { size: 13, weight: 700, align: 'right', color: sel ? GOLD : '#9a8468', ow: 3 });
        text(ctx, row.desc, r.x + 22, dy, { size: 15, color: sel ? BONE : DIM, ow: 3, maxWidth: w - 44 });
      } else text(ctx, row.label, r.x + r.w / 2, r.y + h / 2 + 7, { size: 19, weight: 700, align: 'center', color: sel ? '#fff0d0' : DIM, ow: 3 });
      y += h + gap;
    });
    if (hintH) drawHints(ctx, HAS_BACK ? [[['confirm'], '고르기'], [['cancel'], '돌아가기']] : [[['confirm'], '고르기']], W / 2, H - sb - 12, { align: 'center', size: 14, color: '#c8b8a0' });
  }
}
