// 난이도 선택: 5단계 카드 (색·영문명·설명·보정치 요약), 선택 카드 확대·발광
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, wrap, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, rgba, lerp, TAU } from '../../core/math.js';
import { DIFFICULTIES } from '../../data/difficulty.js';
import { Ambience, kenBurns, shade, frame, heading, gbutton, backButton, footer, setPad, skull, ornament, follow, glowSprite, TapZones, GOLD, BONE, DIM } from './common.js';

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

export class DifficultyScene extends Scene {
  enter({ slot = 1, index = 1, mode = 'story', then = 'charselect', thenParams = {} } = {}) {
    setPad(false);
    this.slot = slot; this.mode = mode; this.then = then; this.thenParams = thenParams;
    this.menu = new ListMenu(DIFFICULTIES.length, { cols: DIFFICULTIES.length, index });
    this.amb = new Ambience({ embers: 60, motes: 16, bats: 4, lightning: false });
    this.sel = DIFFICULTIES.map((_, i) => (i === index ? 1 : 0));
    this.pick = -1; this.pickT = 0;
    this.taps = new TapZones();
  }
  exit() { setPad(true); }
  onResume() { setPad(false); }
  update(dt) {
    const g = this.game;
    const d = DIFFICULTIES[this.menu.index];
    this.amb.emberColor = d.id === 'easy' ? '#8aff9a' : d.id === 'normal' ? '#ffb060' : d.id === 'hard' ? '#ff8a3a' : d.id === 'nightmare' ? '#ff3a4a' : '#c07cff';
    this.amb.update(dt, g.viewW, g.viewH);
    this.sel = this.sel.map((v, i) => follow(v, i === this.menu.index ? 1 : 0, dt, 14));
    if (this.pick >= 0) { this.pickT += dt; if (this.pickT > 0.55 && !this.went) { this.went = true; this.proceed(); } return; }
    const tap = this.taps.hit();
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
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    const cur = DIFFICULTIES[this.menu.index];
    kenBurns(ctx, assets.get('bg/s12_throne'), vw, vh, t, { z0: 1.06, z1: 1.14, period: 55 });
    ctx.fillStyle = 'rgba(6,2,10,0.66)'; ctx.fillRect(0, 0, vw, vh);
    // 선택 난이도 색 광원
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(vw / 2, vh * 0.62, 20, vw / 2, vh * 0.62, vw * 0.55);
    gg.addColorStop(0, rgba(cur.color, 0.16 + 0.04 * Math.sin(t * 2))); gg.addColorStop(1, rgba(cur.color, 0));
    ctx.fillStyle = gg; ctx.fillRect(0, 0, vw, vh); ctx.restore();
    shade(ctx, vw, vh, { top: 0.6, bottom: 0.7, vig: 0.85 });
    this.amb.draw(ctx, vw, vh, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, vw / 2, 48, 'DIFFICULTY', '사냥의 난이도를 선택하세요', { size: 30, alpha: ap });

    const n = DIFFICULTIES.length, gap = 10;
    const cw = Math.min(176, (vw - 60 - gap * (n - 1)) / n), ch = 332;
    const x0 = vw / 2 - (n * cw + (n - 1) * gap) / 2, y0 = 106;
    this.menu.clearHits(); this.taps.clear();
    // 선택되지 않은 카드 먼저, 선택 카드는 맨 위에
    const order = DIFFICULTIES.map((_, i) => i).sort((a, b) => this.sel[a] - this.sel[b]);
    for (const i of order) {
      const d = DIFFICULTIES[i];
      const k = ease.outCubic(clamp((this.t - 0.06 * i) / 0.45, 0, 1));
      const s = this.sel[i];
      const base = { x: x0 + i * (cw + gap), y: y0 + (1 - k) * 60, w: cw, h: ch };
      this.menu.hit(i, base);
      this.drawCard(ctx, base, d, i, s, k);
    }
    // 시작 버튼
    const br = { x: vw / 2 - 130, y: y0 + ch + 14, w: 260, h: 46 };
    gbutton(ctx, br, `「${cur.name}」 난이도로 시작`, { selected: true, accent: cur.color, size: 16, zones: this.taps, id: 'start' });
    backButton(ctx, 14, 12, '뒤로', this.taps);
    footer(ctx, vw, vh, '←→ 선택   Z 결정   X 뒤로', '카드를 터치해 고르고 시작 버튼을 누르세요');
    if (this.pick >= 0) {
      const k = clamp(this.pickT / 0.55, 0, 1);
      ctx.fillStyle = `rgba(0,0,0,${k * 0.5})`; ctx.fillRect(0, 0, vw, vh);
    }
  }
  drawCard(ctx, base, d, i, s, k) {
    const t = this.game.time;
    const picked = this.pick === i ? ease.outCubic(clamp(this.pickT / 0.3, 0, 1)) : 0;
    const sc = 1 + 0.07 * s + 0.05 * picked;
    const cx = base.x + base.w / 2, cy = base.y + base.h / 2 - 8 * s;
    ctx.save();
    ctx.globalAlpha = k * (this.pick >= 0 && this.pick !== i ? 0.35 : lerp(0.72, 1, s));
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-base.w / 2, -base.h / 2);
    const w = base.w, h = base.h;
    frame(ctx, 0, 0, w, h, { accent: d.color, glow: s * 1.2 + picked, fill0: `rgba(${20 + 20 * s},8,${20 + 6 * s},0.93)`, edge: 0.4 + 0.6 * s });
    // 색 띠
    const band = ctx.createLinearGradient(0, 0, 0, 92);
    band.addColorStop(0, rgba(d.color, 0.35 + 0.15 * s)); band.addColorStop(1, rgba(d.color, 0));
    ctx.fillStyle = band; ctx.fillRect(2, 2, w - 4, 90);
    // 해골 (등급)
    const nsk = i + 1, sw = 20;
    for (let j = 0; j < nsk; j++) {
      const sx = w / 2 + (j - (nsk - 1) / 2) * sw;
      if (s > 0.5) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.5 * s; ctx.drawImage(glowSprite(d.color), sx - 14, 18, 28, 28); ctx.restore(); }
      skull(ctx, sx, 32, 17, j < nsk ? (s > 0.5 ? '#fff2e0' : '#c8b8a8') : '#333');
    }
    text(ctx, d.eng, w / 2, 70, { size: w < 160 ? 13 : 15, align: 'center', weight: 900, family: FONT.logo, color: d.color, ow: 3 });
    text(ctx, d.name, w / 2, 100, { size: 24, align: 'center', weight: 800, family: FONT.title, color: '#fff4e0', ow: 4 });
    ornament(ctx, w / 2, 116, w - 30, { color: d.color, alpha: 0.8 });
    const lines = wrap(ctx, d.desc, w - 20, 12, 500).slice(0, 4);
    lines.forEach((l, j) => text(ctx, l, w / 2, 138 + j * 16, { size: 12, align: 'center', color: '#d8ccbc', ow: 2 }));
    // 보정치
    const rows = diffRows(d);
    const ry = h - rows.length * 17 - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(8, ry - 15, w - 16, rows.length * 17 + 8);
    rows.forEach(([k2, v, c], j) => {
      text(ctx, k2, 16, ry + j * 17, { size: 11, weight: 600, color: DIM, ow: 2 });
      text(ctx, v, w - 16, ry + j * 17, { size: 12, align: 'right', weight: 800, family: FONT.num, color: c, ow: 2 });
    });
    if (d.id === 'inferno' && s > 0.3) {
      // 지옥: 가장자리 불꽃 맥동
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.25 * s * (0.7 + 0.3 * Math.sin(t * 9));
      const fg = ctx.createLinearGradient(0, h, 0, h - 120);
      fg.addColorStop(0, '#c07cff'); fg.addColorStop(1, 'rgba(192,124,255,0)');
      ctx.fillStyle = fg; ctx.fillRect(0, h - 120, w, 120); ctx.restore();
    }
    ctx.restore();
  }
}
