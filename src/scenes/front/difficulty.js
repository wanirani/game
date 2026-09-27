// 난이도 선택: 5단계 카드 (색·영문명·설명·보정치 요약), 선택 카드 확대·발광
// 플랫폼 (platform §6.2 · §6.3 · §4.5) — owner: PLAT-FRONT-A
//  - uiScale 장면 (game.uiW × game.uiH, 최소 720×400). 좁은 화면(높이 < 480 UI px)에서는 카드 안 배치를 줄이고
//    시작 버튼을 오른쪽 아래로 옮겨 카드 높이를 확보한다
//  - 시작·뒤로 버튼은 ui.taps (owner = 장면), 안내 줄은 지금 기기의 글리프
import { Scene } from '../../core/game.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, wrap, FONT, ListMenu, taps } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, rgba, lerp } from '../../core/math.js';
import { hudSafe } from '../../render/hud_layout.js';
import { DIFFICULTIES } from '../../data/difficulty.js';
import { Ambience, kenBurns, shade, frame, heading, gbutton, backButton, footer, skull, ornament, follow, glowSprite, linGrad, radGrad, parseHints, clampLines, GOLD, BONE, DIM } from './common.js';

const pct = (v) => `×${Number(v).toFixed(2).replace(/0$/, '')}`;

/** 보정치 요약 줄 */
export function diffRows(d) {
  return [
    ['적 체력', pct(d.enemyHp), d.enemyHp > 1 ? '#ff8a7a' : d.enemyHp < 1 ? '#8ae08a' : BONE],
    ['적 공격력', pct(d.enemyAtk), d.enemyAtk > 1 ? '#ff8a7a' : d.enemyAtk < 1 ? '#8ae08a' : BONE],
    ['시작 목숨', `${d.lives}`, d.lives >= 3 ? BONE : '#ff8a7a'],
    ['컨티뉴', d.continues >= 99 ? '무제한' : `${d.continues}회`, d.continues >= 9 ? BONE : '#ff8a7a'],
    ['정예 출현', `${Math.round((d.elite ?? 0) * 100)}%`, (d.elite ?? 0) > 0.05 ? '#ffb070' : BONE],
    ['점수 배율', pct(d.scoreMult), d.scoreMult >= 1 ? '#ffe070' : DIM],
  ];
}
// 카드 안 배치: 넉넉한 화면 / 좁은 화면
const CARD_FULL = { skullY: 32, skullS: 17, engY: 70, nameY: 100, nameSize: 24, ornY: 116, descY: 138, descLH: 16, rowH: 17 };
const CARD_COMPACT = { skullY: 24, skullS: 15, engY: 50, nameY: 77, nameSize: 22, ornY: 91, descY: 111, descLH: 15, rowH: 15 };
const HINTS = '←→ 선택   Z 결정   X 뒤로', TOUCH_HINT = '카드를 터치해 고르고 시작 버튼을 누르세요';

export class DifficultyScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter({ slot = 1, index = 1, mode = 'story', then = 'charselect', thenParams = {} } = {}) {
    this.slot = slot; this.mode = mode; this.then = then; this.thenParams = thenParams;
    index = clamp(Number(index) || 0, 0, DIFFICULTIES.length - 1);
    this.menu = new ListMenu(DIFFICULTIES.length, { cols: DIFFICULTIES.length, index });
    const q = this.game.tier === 'low' ? 0.5 : 1;
    this.amb = new Ambience({ embers: Math.round(60 * q), motes: Math.round(16 * q), bats: 4, lightning: false });
    this.sel = DIFFICULTIES.map((_, i) => (i === index ? 1 : 0));
    this.pick = -1; this.pickT = 0;
  }
  update(dt) {
    const g = this.game;
    const d = DIFFICULTIES[this.menu.index];
    this.amb.emberColor = d.id === 'easy' ? '#8aff9a' : d.id === 'normal' ? '#ffb060' : d.id === 'hard' ? '#ff8a3a' : d.id === 'nightmare' ? '#ff3a4a' : '#c07cff';
    this.amb.update(dt, g.uiW || g.viewW, g.uiH || g.viewH);
    for (let i = 0; i < this.sel.length; i++) this.sel[i] = follow(this.sel[i], i === this.menu.index ? 1 : 0, dt, 14);
    if (this.pick >= 0) { this.pickT += dt; if (this.pickT > 0.55 && !this.went) { this.went = true; this.proceed(); } return; }
    const tap = taps.hit(this);
    if (tap === 'back') { this.leave(); return; }
    if (tap === 'start') { this.choose(); return; }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') this.choose();
    else if (r === 'cancel') this.leave();
  }
  choose() {
    const d = DIFFICULTIES[this.menu.index];
    this.pick = this.menu.index; this.pickT = 0;
    audio.sfx('menu_ok');
    audio.sfx(d.id === 'inferno' || d.id === 'nightmare' ? 'boss_roar' : 'whip_crack', { vol: 0.6 });
    this.game.flash(d.color, 0.35, 3);
  }
  proceed() {
    const d = DIFFICULTIES[this.pick];
    this.game.go(this.then, { ...this.thenParams, slot: this.slot, difficulty: d.id, mode: this.mode });
  }
  leave() {
    audio.sfx('menu_cancel');
    if (this.mode === 'story') this.game.go('slots', { mode: 'new', index: this.slot - 1 });
    else this.game.go('arcade', {});
  }
  /** 배치 (UI 좌표) */
  layout() {
    const g = this.game, k = g.uiK || 1, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const compact = H < 480;
    const n = DIFFICULTIES.length, gap = 10;
    const headY = st + (compact ? 36 : 48), headSize = compact ? 26 : 30;
    const y0 = compact ? headY + headSize * 0.72 + 32 : 106 + st;
    const cw = Math.min(176, (W - sl - sr - 60 - gap * (n - 1)) / n);
    // 좁은 화면: 시작 버튼은 오른쪽 아래(안내 줄과 같은 높이), 카드는 그 위까지
    const ch = compact ? Math.min(332, H - sb - 64 - y0) : 332;
    const x0 = sl + (W - sl - sr) / 2 - (n * cw + (n - 1) * gap) / 2;
    const br = compact ? { x: W - sr - 16 - 270, y: H - sb - 54, w: 270, h: 46 } : { x: W / 2 - 130, y: y0 + ch + 14, w: 260, h: 46 };
    return { W, H, sl, sr, st, sb, compact, n, gap, headY, headSize, y0, cw, ch, x0, br, C: ch >= 320 ? CARD_FULL : CARD_COMPACT };
  }
  render(ctx) {
    const g = this.game, t = g.time;
    const L = this.layout(), W = L.W, H = L.H;
    const cur = DIFFICULTIES[this.menu.index];
    kenBurns(ctx, assets.get('bg/s12_throne'), W, H, t, { z0: 1.06, z1: 1.14, period: 55 });
    ctx.fillStyle = 'rgba(6,2,10,0.66)'; ctx.fillRect(0, 0, W, H);
    // 선택 난이도 색 광원 (색마다 한 번 만든 원점 그라데이션 + 맥동 알파)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + 0.04 * Math.sin(t * 2);
    const gr = W * 0.55;
    ctx.translate(W / 2, H * 0.62); ctx.scale(gr / 100, gr / 100);
    ctx.fillStyle = radGrad(ctx, `dGlow|${cur.color}`, 0, 0, 4, 100, [[0, rgba(cur.color, 1)], [1, rgba(cur.color, 0)]]);
    ctx.fillRect(-100, -100, 200, 200); ctx.restore();
    shade(ctx, W, H, { top: 0.6, bottom: 0.7, vig: 0.85 });
    this.amb.draw(ctx, W, H, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, W / 2, L.headY, 'DIFFICULTY', '사냥의 난이도를 선택하세요', { size: L.headSize, alpha: ap });

    this.menu.clearHits();
    // 선택되지 않은 카드 먼저, 선택 카드는 맨 위에
    const order = DIFFICULTIES.map((_, i) => i).sort((a, b) => this.sel[a] - this.sel[b]);
    for (const i of order) {
      const d = DIFFICULTIES[i];
      const k = ease.outCubic(clamp((this.t - 0.06 * i) / 0.45, 0, 1));
      const s = this.sel[i];
      const base = { x: L.x0 + i * (L.cw + L.gap), y: L.y0 + (1 - k) * 60, w: L.cw, h: L.ch };
      this.menu.hit(i, { x: base.x, y: L.y0, w: L.cw, h: L.ch });
      this.drawCard(ctx, base, d, i, s, k, L.C);
    }
    // 시작 버튼
    gbutton(ctx, L.br, `「${cur.name}」 난이도로 시작`, { selected: true, accent: cur.color, size: 16, owner: this, id: 'start', src: 'difficulty.start' });
    backButton(ctx, 14 + L.sl, 12 + L.st, '뒤로', this);
    if (!L.compact) footer(ctx, W, H, HINTS, TOUCH_HINT);
    else if (promptMode() === 'touch') text(ctx, '카드를 골라 시작하세요', 16 + L.sl, H - 11 - L.sb, { size: 13, color: '#b8aa98', ow: 2 });
    else drawHints(ctx, parseHints(HINTS), 16 + L.sl, H - 11 - L.sb, { size: 13, color: '#b8aa98' });
    if (this.pick >= 0) {
      const k = clamp(this.pickT / 0.55, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${k * 0.5})`; ctx.fillRect(0, 0, W, H);
    }
  }
  drawCard(ctx, base, d, i, s, k, C) {
    const t = this.game.time;
    const picked = this.pick === i ? ease.outCubic(clamp(this.pickT / 0.3, 0, 1)) : 0;
    const sc = 1 + 0.07 * s + 0.05 * picked;
    const cx = base.x + base.w / 2, cy = base.y + base.h / 2 - 8 * s;
    ctx.save();
    ctx.globalAlpha = k * (this.pick >= 0 && this.pick !== i ? 0.35 : lerp(0.72, 1, s));
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-base.w / 2, -base.h / 2);
    const w = base.w, h = base.h;
    frame(ctx, 0, 0, w, h, { accent: d.color, glow: s * 1.2 + picked, fill0: 'rgba(28,8,24,0.93)', edge: 0.4 + 0.6 * s });
    // 색 띠 (색마다 한 번 만든 그라데이션, 선택될수록 진하게)
    ctx.save();
    ctx.globalAlpha *= 0.35 + 0.15 * s;
    ctx.fillStyle = linGrad(ctx, `dBand|${d.color}`, 0, 0, 0, 92, [[0, rgba(d.color, 1)], [1, rgba(d.color, 0)]]);
    ctx.fillRect(2, 2, w - 4, 90);
    ctx.restore();
    // 해골 (등급)
    const nsk = i + 1, sw = C.skullS + 3;
    for (let j = 0; j < nsk; j++) {
      const sx = w / 2 + (j - (nsk - 1) / 2) * sw;
      if (s > 0.5) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.5 * s; ctx.drawImage(glowSprite(d.color), sx - 14, C.skullY - 14, 28, 28); ctx.restore(); }
      skull(ctx, sx, C.skullY, C.skullS, s > 0.5 ? '#fff2e0' : '#c8b8a8');
    }
    text(ctx, d.eng, w / 2, C.engY, { size: w < 160 ? 13 : 15, align: 'center', weight: 900, family: FONT.logo, color: d.color, ow: 3 });
    text(ctx, d.name, w / 2, C.nameY, { size: C.nameSize, align: 'center', weight: 800, family: FONT.title, color: '#fff4e0', ow: 4 });
    ornament(ctx, w / 2, C.ornY, w - 30, { color: d.color, alpha: 0.8 });
    // 보정치 (아래에서부터) → 그 위 남는 자리에 설명
    const rows = diffRows(d);
    const ry = h - rows.length * C.rowH - 8;
    const maxLines = clamp(Math.floor((ry - 15 - 4 - C.descY + C.descLH * 0.75) / C.descLH), 0, 4);
    const lines = clampLines(ctx, wrap(ctx, d.desc, w - 18, 13, 500), maxLines, w - 18); // 잘리면 '…'
    lines.forEach((l, j) => text(ctx, l, w / 2, C.descY + j * C.descLH, { size: 13, align: 'center', color: '#d8ccbc', ow: 2 }));
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(8, ry - 15, w - 16, rows.length * C.rowH + 8);
    rows.forEach(([k2, v, c], j) => {
      text(ctx, k2, 14, ry + j * C.rowH, { size: 12, weight: 600, color: DIM, ow: 2 });
      text(ctx, v, w - 14, ry + j * C.rowH, { size: 13, align: 'right', weight: 800, family: FONT.num, color: c, ow: 2 });
    });
    if (d.id === 'inferno' && s > 0.3) {
      // 지옥: 가장자리 불꽃 맥동
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.25 * s * (0.7 + 0.3 * Math.sin(t * 9));
      ctx.translate(0, h - 120);
      ctx.fillStyle = linGrad(ctx, 'dInferno', 0, 120, 0, 0, [[0, '#c07cff'], [1, 'rgba(192,124,255,0)']]);
      ctx.fillRect(0, 0, w, 120); ctx.restore();
    }
    ctx.restore();
  }
}
