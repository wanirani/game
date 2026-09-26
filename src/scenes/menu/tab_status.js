// 상태 탭: 영웅 미리보기(애니메이션) · 이름/칭호/직업 계보 · 레벨·경험치 · 전체 능력치(기본/공격/방어/특수/속성) · 설명
import { text, font, FONT } from '../../core/ui.js';
import { clamp } from '../../core/math.js';
import { Tab } from './base.js';
import { HeroView, HeroStage, pedestal, accentOf } from './hero_view.js';
import { PAL, EL, EL_ORDER, frame, heading, divider, diamond, gauge, pill, selBar, Layer, glow, num, para, measure } from './common.js';
import * as D from './access.js';
import { SUBWEAPONS } from '../../data/subweapons.js';

export const STAT_DESC = {
  hp: '0이 되면 쓰러진다. 레벨과 방어구로 늘어난다.',
  mp: '스킬과 비전서 기술에 소모되는 마력.',
  atk: '채찍·검·총 등 물리 공격의 위력.',
  mag: '마법과 스킬의 위력. 신성·원소 기술에 주로 적용된다.',
  def: '받는 물리 피해를 줄인다.',
  res: '받는 마법 피해를 줄인다.',
  agi: '몸놀림. 민첩 1당 공격 속도가 0.15% 오른다.',
  luck: '행운 10당 치명타 확률 +1%. 드롭에도 영향을 준다.',
  crit: '공격이 치명타가 될 확률 (최대 75%).',
  critDmg: '치명타가 터질 때 추가로 입히는 피해.',
  lifesteal: '입힌 피해의 일부만큼 HP를 흡수한다.',
  hpRegen: '1초마다 저절로 회복되는 HP.',
  mpRegen: '1초마다 저절로 회복되는 MP.',
  moveSpd: '달리기 속도 보정.',
  jumpPow: '점프 높이 보정.',
  airJumps: '공중에서 한 번 더 도약할 수 있는 횟수.',
  atkSpd: '공격 동작이 빨라진다 (최대 80%).',
  expBonus: '적을 쓰러뜨렸을 때 얻는 경험치 증가.',
  goldBonus: '얻는 골드 증가.',
  dropBonus: '적과 촛대에서 아이템이 떨어질 확률 증가.',
  subDmg: '단검·도끼·성수 등 보조무기의 피해 증가.',
  skillDmg: '스킬 공격의 피해 증가.',
  cdr: '스킬 재사용 대기 시간 감소.',
  ultGain: '필살 게이지가 차오르는 속도 증가.',
  heartBonus: '하트를 주울 때 더 많이 얻는다.',
  dmgReduce: '받는 모든 피해를 비율로 줄인다.',
  reach: '무기 공격의 판정 범위가 넓어진다.',
  magnet: '떨어진 아이템을 끌어당기는 거리.',
};
const GROUPS = [
  [{ name: '기본', keys: ['hp', 'mp', 'atk', 'mag', 'def', 'res', 'agi', 'luck'] }, { name: '방어', keys: ['dmgReduce', 'hpRegen', 'mpRegen'] }],
  [{ name: '공격', keys: ['crit', 'critDmg', 'atkSpd', 'skillDmg', 'subDmg', 'lifesteal', 'reach', 'cdr', 'ultGain'] }],
  [{ name: '특수', keys: ['moveSpd', 'jumpPow', 'airJumps', 'expBonus', 'goldBonus', 'dropBonus', 'heartBonus', 'magnet'] }],
];
const CORE = new Set(['hp', 'mp', 'atk', 'mag', 'def', 'res', 'agi', 'luck']);
const ROW = 20, HEAD = 24;

export function fmtStatVal(k, v) {
  const info = D.STAT_INFO[k];
  if (k === 'airJumps') return `${Math.round(v)}회`;
  if (info?.pct) return `${num(v)}%`;
  return num(v);
}

export class StatusTab extends Tab {
  constructor(m) {
    super(m);
    this.view = new HeroView();
    this.stage = new HeroStage();
    this.layer = new Layer();
    this.rev = -1;
    this.col = 0; this.row = 0; // 커서 (col 3 = 속성표)
    this.cells = [];            // 능력치 칸 위치 [{col,row,key,x,y,w}]
  }
  refresh() {
    const m = this.m;
    if (this.rev === m.rev && this.stats) return;
    this.rev = m.rev;
    this.stats = D.computeStats(this.state, this.hero);
    this.look = D.composeLook(this.state, this.hero);
    this.view.set(this.look, D.CHARACTERS()[this.hero.charId]);
  }
  onShow() { this.refresh(); this.view.cool = 0.8; }
  free() { this.layer.free(); this.stage.free(); }
  colLen(c) { return c === 3 ? 5 : GROUPS[c].reduce((a, g) => a + g.keys.length, 0); }
  update(dt, nav, ges, focused) {
    this.refresh();
    this.view.update(dt);
    // 마우스 호버 / 터치로 능력치 설명
    for (const c of this.cells) {
      if (ges.hoverIn(c) || ges.tap(c)) { this.col = c.col; this.row = c.row; if (ges.tapOK) this.m.focus = 'content'; }
    }
    if (ges.tap(this.heroRect)) this.view.showcase();
    if (!focused) return;
    if (nav.up) { if (this.row === 0) { this.m.focusTabs(); return; } this.row--; }
    if (nav.down) {
      if (this.row < this.colLen(this.col) - 1) this.row++;
      else if (this.col < 3) { this.col = 3; this.row = 0; }
    }
    if (this.col === 3) {
      if (nav.up && this.row === 0) { this.col = 0; this.row = this.colLen(0) - 1; }
      if (nav.left) this.row = Math.max(0, this.row - 1);
      if (nav.right) this.row = Math.min(4, this.row + 1);
    } else {
      if (nav.left && this.col > 0) { this.col--; this.row = Math.min(this.row, this.colLen(this.col) - 1); }
      if (nav.right && this.col < 2) { this.col++; this.row = Math.min(this.row, this.colLen(this.col) - 1); }
    }
    if (nav.confirm) this.view.showcase();
    if (nav.cancel) this.m.focusTabs();
  }
  hints() { return [['↑↓←→', '능력치 설명', '능력치를 터치하면 설명이 나옵니다'], ['Z', '동작 보기', '영웅을 터치하면 공격 동작을 봅니다']]; }

  render(ctx, A) {
    this.refresh();
    const t = this.t, hero = this.hero, ch = D.CHARACTERS()[hero.charId] || {};
    const LW = Math.min(330, Math.round(A.w * 0.34));
    // ── 왼쪽: 영웅 카드 ──
    frame(ctx, A.x, A.y, LW, A.h);
    const sx = A.x + 8, sy = A.y + 8, sw = LW - 16, sh = 226;
    const accent = accentOf(this.look);
    this.stage.draw(ctx, sx, sy, sw, sh, t, this.game.scale, accent);
    const scale = clamp((sh - 50) / 95, 1.6, 2.3);
    pedestal(ctx, sx + sw / 2, sy + sh - 26, scale * 0.62, t, accent);
    this.view.draw(ctx, sx + sw / 2, sy + sh - 26, scale);
    ctx.strokeStyle = 'rgba(200,160,90,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    this.heroRect = { x: sx, y: sy, w: sw, h: sh };
    // 이름 · 칭호
    let y = sy + sh + 30;
    text(ctx, ch.name ?? hero.charId, A.x + LW / 2, y, { size: 22, align: 'center', weight: 800, family: FONT.title, color: PAL.bone, ow: 4 });
    y += 18;
    text(ctx, `${ch.eng ?? ''}  ·  ${ch.title ?? ''}`, A.x + LW / 2, y, { size: 11, align: 'center', weight: 700, family: FONT.num, color: PAL.dim, ow: 2 });
    // 직업 계보
    y += 12;
    const chain = D.classChain(hero.classId);
    ctx.font = font(12, 800, FONT.body);
    const widths = chain.map((c) => ctx.measureText(c.name).width + 14);
    const total = widths.reduce((a, b) => a + b, 0) + (chain.length - 1) * 14;
    let cx = A.x + LW / 2 - total / 2;
    chain.forEach((c, i) => {
      const last = i === chain.length - 1;
      pill(ctx, c.name, cx, y, { color: last ? PAL.goldHi : PAL.dim, bg: last ? 'rgba(110,14,34,0.9)' : 'rgba(30,18,28,0.9)', size: 12, h: 20 });
      cx += widths[i];
      if (!last) { text(ctx, '›', cx + 7, y + 15, { size: 15, align: 'center', color: PAL.goldDim, weight: 800, ow: 0 }); cx += 14; }
    });
    // 레벨 · 경험치
    y += 34;
    const lx = A.x + 18;
    text(ctx, 'Lv', lx, y + 22, { size: 14, weight: 800, family: FONT.num, color: PAL.goldMid });
    text(ctx, String(hero.level), lx + 22, y + 24, { size: 32, weight: 900, family: FONT.num, color: PAL.goldHi, ow: 4 });
    const need = D.expToNext(hero.level), maxed = hero.level >= D.MAX_LEVEL();
    const ex = lx + 86, ew = LW - (ex - A.x) - 18;
    text(ctx, 'EXP', ex, y + 6, { size: 11, weight: 800, family: FONT.num, color: PAL.dim });
    text(ctx, maxed ? 'MAX' : `${num(hero.exp)} / ${num(need)}`, ex + ew, y + 6, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.bone });
    gauge(ctx, ex, y + 11, ew, 9, maxed ? 1 : hero.exp / need, '#e8c872');
    text(ctx, maxed ? '최고 레벨에 도달했습니다' : `다음 레벨까지 ${num(Math.max(0, need - hero.exp))}`, ex, y + 36, { size: 11, weight: 600, color: PAL.dim });
    // HP/MP (스테이지 안이면 현재치)
    y += 50;
    const p = this.world?.player;
    const hp = p ? p.hp : this.stats.hp, mp = p ? p.mp : this.stats.mp;
    const bw = (LW - 36 - 10) / 2;
    text(ctx, 'HP', lx, y + 4, { size: 11, weight: 800, family: FONT.num, color: '#ff8a9a' });
    text(ctx, `${Math.ceil(hp)} / ${this.stats.hp}`, lx + bw, y + 4, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.bone });
    gauge(ctx, lx, y + 9, bw, 7, hp / this.stats.hp, '#e8283c', { glowEnd: false });
    const mx = lx + bw + 10;
    text(ctx, 'MP', mx, y + 4, { size: 11, weight: 800, family: FONT.num, color: '#8ac8ff' });
    text(ctx, `${Math.floor(mp)} / ${this.stats.mp}`, mx + bw, y + 4, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.bone });
    gauge(ctx, mx, y + 9, bw, 7, mp / this.stats.mp, '#3a7aff', { glowEnd: false });
    // 스킬 포인트
    if ((hero.sp ?? 0) > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      glow(ctx, A.x + LW - 30, A.y + 30, 22, '#ffd070', 0.3 + 0.2 * pulse);
      pill(ctx, `SP ${hero.sp}`, A.x + LW - 16, A.y + 18, { align: 'right', color: PAL.goldHi, bg: 'rgba(120,20,40,0.95)', size: 12, h: 20 });
    }

    // ── 오른쪽: 능력치 ──
    const R = { x: A.x + LW + 12, y: A.y, w: A.w - LW - 12, h: A.h };
    frame(ctx, R.x, R.y, R.w, R.h);
    this.layer.draw(ctx, 'st' + this.rev + '|' + hero.charId, R.x, R.y, R.w, R.h, this.game.scale, (c) => this.drawStats(c, R));
    // 커서 + 설명
    const cell = this.cells.find((c) => c.col === this.col && c.row === this.row);
    const focused = this.m.focus === 'content';
    if (cell && (focused || this.col !== 0 || this.row !== 0)) {
      if (cell.col === 3) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = PAL.goldHi; ctx.lineWidth = 1.5; ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);
        ctx.restore();
        glow(ctx, cell.x + cell.w / 2, cell.y + cell.h / 2, cell.w * 0.6, EL[cell.key].color, 0.18);
      } else {
        selBar(ctx, cell.x - 4, cell.y, cell.w + 8, cell.h, t, { dim: !focused });
        this.drawRow(ctx, cell.key, cell.x, cell.y, cell.w, true);
      }
    }
    const dy = R.y + R.h - 44;
    divider(ctx, R.x + 16, dy, R.w - 32, { center: false, a: 0.5 });
    let desc = '능력치를 고르면 설명이 표시됩니다.', title = '';
    if (cell) {
      if (cell.col === 3) { const e = EL[cell.key]; title = `${e.name} 속성`; desc = `${e.name} 피해: ${e.name} 속성 공격의 위력 증가  ·  ${e.name} 저항: ${e.name} 속성으로 받는 피해 감소`; }
      else { title = D.STAT_INFO[cell.key]?.name ?? cell.key; desc = STAT_DESC[cell.key] ?? ''; }
    }
    if (title) text(ctx, title, R.x + 18, dy + 26, { size: 14, weight: 800, color: PAL.gold, family: FONT.title });
    const tw = title ? measure(ctx, title, 14, 800, FONT.title) + 30 : 18;
    para(ctx, desc, R.x + tw, dy + 26, R.w - tw - 16, { size: 13, color: PAL.text, max: 1 });
  }

  drawRow(ctx, k, x, y, w, hot = false) {
    const v = this.stats[k] ?? 0;
    const zero = Math.abs(v) < 0.001 && !CORE.has(k);
    const name = D.STAT_INFO[k]?.name ?? k;
    text(ctx, name, x + 10, y + 14.5, { size: 13, weight: hot ? 800 : 600, color: hot ? PAL.goldHi : zero ? PAL.faint : CORE.has(k) ? PAL.bone : PAL.text, ow: 2 });
    text(ctx, fmtStatVal(k, v), x + w - 6, y + 15, { size: CORE.has(k) ? 15 : 14, align: 'right', weight: 800, family: FONT.num, color: hot ? '#fff' : zero ? PAL.faint : CORE.has(k) ? PAL.goldHi : PAL.bone, ow: 3 });
  }

  drawStats(c, R) {
    this.cells.length = 0;
    const pad = 16, gap = 18;
    const cw = (R.w - pad * 2 - gap * 2) / 3;
    GROUPS.forEach((col, ci) => {
      const x = R.x + pad + ci * (cw + gap);
      let y = R.y + 26, row = 0;
      for (const g of col) {
        heading(c, g.name, x, y, cw, { size: 15 });
        y += 12;
        for (const k of g.keys) {
          if (row % 2 === 0) { c.fillStyle = 'rgba(255,230,200,0.025)'; c.fillRect(x, y, cw, ROW); }
          this.drawRow(c, k, x, y, cw);
          this.cells.push({ col: ci, row, key: k, x, y, w: cw, h: ROW });
          y += ROW; row++;
        }
        y += HEAD;
      }
      if (ci === 2) {
        // 기타 정보
        heading(c, '장비 정보', x, y, cw, { size: 15 });
        y += 12;
        const s = this.stats;
        const sub = SUBWEAPONS[this.world?.run?.sub ?? this.hero.sub];
        const rows = [
          ['무기 계열', D.WTYPE_NAME[s.weaponType] ?? s.weaponType ?? '-'],
          ['무기 속성', s.element ? EL[s.element]?.name ?? s.element : '없음', s.element ? EL[s.element]?.color : null],
          ['보조무기', sub?.name ?? '-'],
        ];
        for (const [a, b, col2] of rows) {
          text(c, a, x + 10, y + 14.5, { size: 13, weight: 600, color: PAL.text, ow: 2 });
          text(c, String(b), x + cw - 6, y + 14.5, { size: 13, align: 'right', weight: 800, color: col2 || PAL.bone, ow: 2 });
          y += ROW;
        }
      }
    });
    // 속성 표 (한 줄 5칸: 이름 / 피해 / 저항)
    const ty = R.y + R.h - 44 - 76;
    const x0 = R.x + pad, tw = R.w - pad * 2;
    heading(c, '속성', x0, ty, tw, { size: 15, sub: '피해 증가 · 받는 피해 저항' });
    const cellW = tw / 5;
    const y0 = ty + 12;
    EL_ORDER.forEach((el, i) => {
      const e = EL[el];
      const x = x0 + i * cellW;
      c.fillStyle = 'rgba(255,230,200,0.035)'; c.fillRect(x + 2, y0, cellW - 4, 56);
      c.fillStyle = e.color; c.globalAlpha = 0.6; c.fillRect(x + 2, y0, cellW - 4, 1.5); c.globalAlpha = 1;
      diamond(c, x + 14, y0 + 14, 4.5, e.color);
      glow(c, x + 14, y0 + 14, 11, e.color, 0.45);
      text(c, e.name, x + 25, y0 + 19, { size: 13, weight: 800, color: e.color, ow: 3 });
      const dmg = this.stats[el] ?? 0, res = this.stats['res' + el[0].toUpperCase() + el.slice(1)] ?? 0;
      text(c, '피해', x + 10, y0 + 36, { size: 11, weight: 700, color: PAL.dim, ow: 2 });
      text(c, `${dmg > 0 ? '+' : ''}${num(dmg)}%`, x + cellW - 10, y0 + 36, { size: 13, align: 'right', weight: 800, family: FONT.num, color: dmg ? PAL.bone : PAL.faint, ow: 2 });
      text(c, '저항', x + 10, y0 + 51, { size: 11, weight: 700, color: PAL.dim, ow: 2 });
      text(c, `${res > 0 ? '+' : ''}${num(res)}%`, x + cellW - 10, y0 + 51, { size: 13, align: 'right', weight: 800, family: FONT.num, color: res ? PAL.bone : PAL.faint, ow: 2 });
      this.cells.push({ col: 3, row: i, key: el, x: x + 2, y: y0, w: cellW - 4, h: 56 });
    });
  }
}
