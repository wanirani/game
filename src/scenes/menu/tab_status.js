// 상태 탭: 영웅 턴테이블(끌어서·휠·, . 키·오른쪽 스틱으로 돌려 보기, 탭 = 공격 시연) · 이름/칭호/직업 계보 · 레벨·경험치
//          · 전체 능력치(기본/공격/방어/특수/속성) · 설명
// 화면이 낮으면(uiScale 로 UI 높이가 줄어든 폰 등) 무대 높이를 줄이고, 능력치는 글자를 줄이는 대신 두 쪽으로 나눈다 (benchmark #7:
// 예전 4열 배치는 11/12 px 로 줄여 phone2 에서 9.2 CSS px). 1쪽 '기본·공격·특수' · 2쪽 '방어·속성·장비' — 쪽마다 넓은 화면과 같은
// 13/15 px 글자. 판 위의 쪽 단추(터치) · ←→ 로 옆 쪽 열로 넘어감 · A(패드 Y) 로 쪽 넘김. 720×400 UI 까지.
// 능력치 칸은 작아서 터치에선 칸마다 탭 영역을 두지 않고 능력치 판 전체가 하나의 영역: 누른 채 문지르면 손가락 밑 칸이 골라진다.
import { text, font, FONT } from '../../core/ui.js';
import { clamp } from '../../core/math.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { Tab } from './base.js';
import { HeroView, HeroStage, PixLayer, PixCache, pedestal, accentOf, turntableHints, pxScale } from './hero_view.js';
import { PAL, EL, EL_ORDER, frame, heading, divider, diamond, gauge, pill, selBar, glow, num, para, measure, ellipsize, inRect, leanMem, gbutton } from './common.js';
import * as D from './access.js';
import { SUBWEAPONS } from '../../data/subweapons.js';

export const STAT_DESC = {
  hp: '체력의 최대치. 체력이 0이 되면 쓰러진다. 레벨과 방어구로 늘어난다.',
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
const G_BASE = { name: '기본', keys: ['hp', 'mp', 'atk', 'mag', 'def', 'res', 'agi', 'luck'] };
const G_DEF = { name: '방어', keys: ['dmgReduce', 'hpRegen', 'mpRegen'] };
const G_ATK = { name: '공격', keys: ['crit', 'critDmg', 'atkSpd', 'skillDmg', 'subDmg', 'lifesteal', 'reach', 'cdr', 'ultGain'] };
const G_SPC = { name: '특수', keys: ['moveSpd', 'jumpPow', 'airJumps', 'expBonus', 'goldBonus', 'dropBonus', 'heartBonus', 'magnet'] };
// 넓은 화면: 3열 한 쪽 (장비 정보는 셋째 열 아래) · 낮은 화면: 두 쪽 (열 번호는 쪽을 건너 이어진다 — ←→ 가 쪽을 넘는다)
const COLS3 = [[G_BASE, G_DEF], [G_ATK], [G_SPC]];
const COLS_P = [[G_BASE], [G_ATK], [G_SPC], [G_DEF]];
/** 낮은 화면의 쪽: vis = 그릴 열 (능력치 열 번호 또는 'info' = 장비 정보), el = 속성 표를 이 쪽에 */
const PAGES = [
  { name: '기본·공격·특수', vis: [0, 1, 2], el: false },
  { name: '방어·속성·장비', vis: [3, 'info'], el: true },
];
const SEG_Y = 8, SEG_H = 34, SEG_GAP = 20; // 쪽 단추: 판 위 8 px, 높이 34 UI px (+ 터치 여유 → 44 CSS px), 아래 칸과 20 px 띄움 (여유가 겹치지 않게)
const CORE = new Set(['hp', 'mp', 'atk', 'mag', 'def', 'res', 'agi', 'luck']);
const INFO_ROWS = 3;         // 장비 정보 줄 수
const DESC_H = 44;           // 아래 설명 줄

export function fmtStatVal(k, v) {
  const info = D.STAT_INFO[k];
  if (k === 'airJumps') return `${Math.round(v)}회`;
  if (info?.pct) return `${num(v)}%`;
  return num(v);
}

/** 능력치 판 배치 (판 크기에 맞춤). pages 가 있으면 낮은 화면의 두 쪽 배치 */
function statLayout(R) {
  if (R.h >= 400 && R.w >= 520) return { cols: COLS3, info: 2, pages: null, row: 20, head: 24, top: 26, gh: 12, elH: 76, elHead: true, size: 13, vsize: 15, vsize2: 14 };
  // 쪽 단추 아래에서 시작. 1쪽 공격 9줄이 설명 줄 위에 들어가는 줄 높이 (phone2 20 · phone1 22)
  const top = SEG_Y + SEG_H + SEG_GAP + 14;
  const row = clamp(Math.floor((R.h - DESC_H - 8 - top - 10) / 9), 16, 22);
  return { cols: COLS_P, info: 'info', pages: PAGES, row, head: 18, top, gh: 10, elH: 76, elHead: true, size: 13, vsize: 15, vsize2: 14 };
}

export class StatusTab extends Tab {
  constructor(m) {
    super(m);
    this.view = new HeroView({ turntable: true, game: m.game });
    this.stage = new HeroStage();
    this.layer = new PixLayer();   // 능력치 판 (화소 정렬 1:1 복사 — P-11)
    this.txt = new PixCache(8);    // 왼쪽 정보·아래 설명 글자
    this.bg = new PixLayer();      // 왼쪽 판의 틀 (그라디언트) — 구워서 1:1 복사 (오른쪽 틀은 능력치 판 레이어에)
    this.rev = -1;
    this.col = 0; this.row = 0; // 커서 (col = 열 수 → 속성표)
    this.cells = [];            // 능력치 칸 위치 [{col,row,key,x,y,w,h}]
    this.lay = statLayout({ w: 999, h: 999 });
    this.statRect = null; this.heroRect = null;
    this.segRects = [];         // 쪽 단추 (낮은 화면)
  }
  /** 쪽 수 (넓은 화면 1, 낮은 화면 2) · 지금 쪽 = 커서 열이 있는 쪽 */
  pageCount() { return this.lay.pages ? this.lay.pages.length : 1; }
  get page() { return this.pageOf(this.col); }
  pageOf(col) {
    const P = this.lay.pages;
    if (!P) return 0;
    if (col >= this.lay.cols.length) return Math.max(0, P.findIndex((p) => p.el));
    return Math.max(0, P.findIndex((p) => p.vis.includes(col)));
  }
  /** 쪽 넘기기: 그 쪽의 첫 열 맨 위로 (커서 열이 곧 쪽) */
  setPage(i) {
    const P = this.lay.pages;
    if (!P) return;
    i = ((i % P.length) + P.length) % P.length;
    if (i === this.page) return;
    const c = P[i].vis.find((v) => v !== 'info');
    this.col = c ?? this.elCol; this.row = 0;
  }
  refresh() {
    const m = this.m;
    if (this.rev === m.rev && this.stats) return;
    this.rev = m.rev;
    this.stats = D.computeStats(this.state, this.hero);
    this.look = D.composeLook(this.state, this.hero);
    this.view.set(this.look, D.CHARACTERS()[this.hero.charId]);
  }
  onShow() { this.refresh(); this.view.intro(0.8); this.view.wake(); }
  /**
   * 탭을 떠날 때: 끌기·누름·회전을 끝내고(돌아왔을 때 옛 끌기가 관성으로 튀지 않게) 캐시 레이어의 픽셀을 돌려준다
   * (메뉴는 들른 탭을 모두 살려 두므로 안 그러면 세 탭의 화면 크기 레이어가 쌓인다 — 폰 캔버스 예산 §5.2). 돌아오면 다시 굽는다
   */
  onHide() { this.view.sleep(); this.view.release(); this.layer.release(); this.stage.release(); this.txt.release(); this.bg.release(); }
  free() { this.view.release(); this.layer.free(); this.stage.free(); this.txt.free(); this.bg.free(); }
  /** 메뉴의 가로 밀기(탭 넘기기)를 무시할 곳: 회전 무대 (platform §5.6) */
  noSwipe(x, y) { return this.view.swipeBlock(x, y); }
  swipeBlock(x, y) { return this.view.swipeBlock(x, y); }
  get elCol() { return this.lay.cols.length; }
  colLen(c) { return c === this.elCol ? 5 : this.lay.cols[c].reduce((a, g) => a + g.keys.length, 0); }
  /** (x, y) 에 있는(가까운) 능력치 칸 */
  cellAt(x, y) {
    let best = null, bd = 14;
    for (const c of this.cells) {
      const dx = x < c.x ? c.x - x : x > c.x + c.w ? x - c.x - c.w : 0;
      const dy = y < c.y ? c.y - y : y > c.y + c.h ? y - c.y - c.h : 0;
      const d = Math.hypot(dx, dy);
      if (d === 0) return c;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  update(dt, nav, ges, focused) {
    this.refresh();
    this.view.control(dt, ges);     // 턴테이블 (포커스와 무관: 끌기·휠·, . /·오른쪽 스틱·R3·무대 탭)
    this.view.update(dt);
    // 쪽 단추 (낮은 화면): 누르면 그 쪽으로 — 같은 탭이 능력치 판에 닿아도 칸을 고르지 않는다
    const p = input.pointer;
    let segHit = false;
    if (this.lay.pages) {
      this.segRects.forEach((r, i) => { if (ges.tap(r)) { segHit = true; if (i !== this.page) { this.setPage(i); audio.sfx('menu_move'); } } });
    }
    // 능력치 설명: 마우스 호버 / 탭 / 터치로 누른 채 문지르기
    for (const c of this.cells) if (ges.hoverIn(c)) { this.col = c.col; this.row = c.row; }
    if (!segHit && this.statRect && (ges.tap(this.statRect) || (input.touchMode && p.down && !ges.swipe && inRect(p.x, p.y, this.statRect)))) {
      const c = this.cellAt(p.x, p.y);
      if (c) { this.col = c.col; this.row = c.row; if (ges.tapOK || p.down) this.m.focus = 'content'; }
    }
    // 열 수가 바뀌었으면(화면 크기) 커서를 범위 안으로
    if (this.col > this.elCol) { this.col = this.elCol; this.row = 0; }
    this.row = clamp(this.row, 0, this.colLen(this.col) - 1);
    if (!focused) return;
    const E = this.elCol;
    if (nav.alt && this.lay.pages) { this.setPage(this.page + 1); audio.sfx('menu_move'); return; }
    if (nav.up) { if (this.row === 0 && this.col !== E) { this.m.focusTabs(); return; } if (this.row > 0 && this.col !== E) this.row--; }
    if (nav.down) {
      if (this.col !== E && this.row < this.colLen(this.col) - 1) this.row++;
      // 열 끝에서 아래 = 속성 표. 두 쪽 배치면 속성 표가 같은 쪽에 있을 때만 (1쪽 열 끝에서 ↓ 가 쪽을 넘기고 ↑ 로 돌아오지 못하던 것)
      else if (this.col < E && this.pageOf(this.col) === this.pageOf(E)) { this.col = E; this.row = 0; }
    }
    if (this.col === E) {
      // 속성 표에서 위: 같은 쪽의 능력치 열 (두 쪽 배치면 방어 열)
      if (nav.up) { const c0 = this.lay.pages ? this.lay.pages[this.pageOf(E)].vis.find((v) => v !== 'info') ?? 0 : 0; this.col = c0; this.row = this.colLen(c0) - 1; }
      if (nav.left) this.row = Math.max(0, this.row - 1);
      if (nav.right) this.row = Math.min(4, this.row + 1);
    } else {
      if (nav.left && this.col > 0) { this.col--; this.row = Math.min(this.row, this.colLen(this.col) - 1); }
      if (nav.right && this.col < E - 1) { this.col++; this.row = Math.min(this.row, this.colLen(this.col) - 1); }
    }
    if (nav.confirm) this.view.showcase();
    if (nav.cancel) this.m.close();
  }
  /** 포커스와 무관하게 늘 되는 조작 (탭 막대에 포커스가 있을 때 메뉴 하단 막대가 덧붙인다 — 턴테이블) */
  idleHints() { return turntableHints(this.view); }
  hints() {
    // 터치 문구는 두지 않는다: 쪽 단추가 스스로 설명되고, 문구를 더하면 터치 안내 줄이 넘쳐 maxWidth 로 눌린다 (아주 크게 0.73배)
    const pg = this.lay.pages ? [['A', '쪽 넘기기']] : [];
    return [['↑↓←→', '능력치 설명', '능력치를 누르면 설명이 나옵니다'], ...pg, ['Z', '동작 보기', '영웅을 터치하면 공격 동작을 봅니다'], ...turntableHints(this.view)];
  }

  render(ctx, A) {
    this.refresh();
    const t = this.t, hero = this.hero, ch = D.CHARACTERS()[hero.charId] || {};
    const LW = Math.min(330, Math.round(A.w * 0.34));
    // 오른쪽 능력치 판 배치를 먼저 (낮은 화면 = 두 쪽 배치면 왼쪽 정보 칸의 작은 글자도 11 → 12)
    const R = { x: A.x + LW + 12, y: A.y, w: A.w - LW - 12, h: A.h };
    this.lay = statLayout(R);
    const sm = this.lay.pages ? 12 : 11;
    // ── 왼쪽: 영웅 카드 (무대 높이는 아래 정보 칸(≈170 px)을 뺀 만큼) ──
    const sh = Math.round(clamp(A.h - 178, 108, 226));
    const sx = A.x + 8, sy = A.y + 8, sw = LW - 16;
    // 왼쪽 판의 틀 (정적)
    // 판의 틀: 폰·태블릿 등급은 굽지 않고 매 프레임 (그라디언트 캐시 — 캔버스 예산 R1-REQ-342), 'high' 는 구워 1:1 복사
    this.bg.drawBg(ctx, `${LW}`, A.x - 3, A.y - 3, LW + 6, A.h + 6, (c) => frame(c, A.x, A.y, LW, A.h), leanMem(this.m.game));
    const accent = accentOf(this.look);
    this.stage.draw(ctx, sx, sy, sw, sh, t, pxScale(ctx), accent);
    const foot = Math.round(clamp(sh * 0.115, 14, 26));
    const scale = clamp((sh - foot - 24) / 96, 0.9, 2.3);
    this.heroRect = { x: sx, y: sy, w: sw, h: sh };
    this.view.stage(this.heroRect);
    pedestal(ctx, sx + sw / 2, sy + sh - foot, scale * 0.62, t, accent, this.view.yaw);
    this.view.draw(ctx, sx + sw / 2, sy + sh - foot, scale);
    this.view.drawDeck(ctx, t);
    ctx.strokeStyle = 'rgba(200,160,90,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    // 이름·칭호·직업 계보·레벨·경험치·HP/MP 는 글자 캐시 (값이 바뀔 때만 다시 굽는다 — 외곽선 글자는 매 프레임 그리기에 비싸다, P-11)
    const pl = this.world?.player;
    const hpNow = Math.ceil(pl ? pl.hp : this.stats.hp), mpNow = Math.floor(pl ? pl.mp : this.stats.mp);
    const iy0 = sy + sh + 4;
    this.txt.draw(ctx, 'info', `${this.rev}|${hero.charId}|${hero.classId}|${hero.level}|${hero.exp}|${hpNow}|${mpNow}|${this.stats.hp}|${this.stats.mp}|${sm}`, A.x + 2, iy0, LW - 4, A.y + A.h - 2 - iy0, (g) => {
      // 이름 · 칭호
      let y = sy + sh + 30;
      text(g, ch.name ?? hero.charId, A.x + LW / 2, y, { size: 22, align: 'center', weight: 800, family: FONT.title, color: PAL.bone, ow: 4, maxWidth: LW - 24 });
      y += 18;
      text(g, `${ch.eng ?? ''}  ·  ${ch.title ?? ''}`, A.x + LW / 2, y, { size: sm, align: 'center', weight: 700, family: FONT.num, color: PAL.dim, ow: 2, maxWidth: LW - 20 });
      // 직업 계보
      y += 12;
      const chain = D.classChain(hero.classId);
      g.font = font(12, 800, FONT.body);
      const widths = chain.map((c) => g.measureText(c.name).width + 14);
      const total = widths.reduce((a, b) => a + b, 0) + (chain.length - 1) * 14;
      const shrink = total > LW - 16 ? (LW - 16) / total : 1;
      let cx = A.x + LW / 2 - (total * shrink) / 2;
      chain.forEach((c, i) => {
        const last = i === chain.length - 1;
        const nm = shrink < 1 ? ellipsize(g, c.name, widths[i] * shrink - 14, 12, 800) : c.name;
        pill(g, nm, cx, y, { color: last ? PAL.goldHi : PAL.dim, bg: last ? 'rgba(110,14,34,0.9)' : 'rgba(30,18,28,0.9)', size: 12, h: 20 });
        cx += widths[i] * shrink;
        if (!last) { text(g, '›', cx + 7, y + 15, { size: 15, align: 'center', color: PAL.goldDim, weight: 800, ow: 0 }); cx += 14 * shrink; }
      });
      // 레벨 · 경험치
      y += 34;
      const lx = A.x + 18;
      text(g, 'Lv', lx, y + 22, { size: 14, weight: 800, family: FONT.num, color: PAL.goldMid });
      text(g, String(hero.level), lx + 22, y + 24, { size: 32, weight: 900, family: FONT.num, color: PAL.goldHi, ow: 4 });
      const need = D.expToNext(hero.level), maxed = hero.level >= D.MAX_LEVEL();
      const ex = lx + 86, ew = LW - (ex - A.x) - 18;
      text(g, 'EXP', ex, y + 6, { size: sm, weight: 800, family: FONT.num, color: PAL.dim });
      text(g, maxed ? 'MAX' : `${num(hero.exp)} / ${num(need)}`, ex + ew, y + 6, { size: sm, align: 'right', weight: 700, family: FONT.num, color: PAL.bone });
      gauge(g, ex, y + 11, ew, 9, maxed ? 1 : hero.exp / need, '#e8c872');
      text(g, maxed ? '최고 레벨에 도달했습니다' : `다음 레벨까지 ${num(Math.max(0, need - hero.exp))}`, ex, y + 36, { size: sm, weight: 600, color: PAL.dim, maxWidth: ew });
      // HP/MP (스테이지 안이면 현재치)
      y += 50;
      const p = this.world?.player;
      const hp = p ? p.hp : this.stats.hp, mp = p ? p.mp : this.stats.mp;
      const bw = (LW - 36 - 10) / 2;
      text(g, 'HP', lx, y + 4, { size: sm, weight: 800, family: FONT.num, color: '#ff8a9a' });
      text(g, `${Math.ceil(hp)} / ${this.stats.hp}`, lx + bw, y + 4, { size: sm, align: 'right', weight: 700, family: FONT.num, color: PAL.bone });
      gauge(g, lx, y + 9, bw, 7, hp / this.stats.hp, '#e8283c', { glowEnd: false });
      const mx = lx + bw + 10;
      text(g, 'MP', mx, y + 4, { size: sm, weight: 800, family: FONT.num, color: '#8ac8ff' });
      text(g, `${Math.floor(mp)} / ${this.stats.mp}`, mx + bw, y + 4, { size: sm, align: 'right', weight: 700, family: FONT.num, color: PAL.bone });
      gauge(g, mx, y + 9, bw, 7, mp / this.stats.mp, '#3a7aff', { glowEnd: false });
    });
    // 스킬 포인트
    if ((hero.sp ?? 0) > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      glow(ctx, A.x + LW - 30, A.y + 30, 22, '#ffd070', 0.3 + 0.2 * pulse);
      pill(ctx, `SP ${hero.sp}`, A.x + LW - 16, A.y + 18, { align: 'right', color: PAL.goldHi, bg: 'rgba(120,20,40,0.95)', size: 12, h: 20 });
    }

    // ── 오른쪽: 능력치 (배치 R·this.lay 는 위에서) ──
    const paged = !!this.lay.pages, pgI = this.page;
    // 능력치 판: 틀까지 한 장으로 (복사 한 번). 쪽이 바뀌면 다시 굽는다
    this.layer.draw(ctx, 'st' + this.rev + '|' + hero.charId + '|' + this.lay.cols.length + '|' + this.lay.row + '|' + (paged ? pgI : '-'), R.x - 3, R.y - 3, R.w + 6, R.h + 6, (c) => { frame(c, R.x, R.y, R.w, R.h); this.drawStats(c, R); });
    // 칸 고르기 영역: 두 쪽 배치면 쪽 단추 아래부터 (단추의 터치 여유와 겹치지 않게)
    const sTop = paged ? SEG_Y + SEG_H + SEG_GAP : 4;
    this.statRect = { x: R.x + 4, y: R.y + sTop, w: R.w - 8, h: R.h - DESC_H - 4 - sTop };
    this.segRects.length = 0;
    if (paged) {
      // 쪽 단추 두 개 (매 프레임: 고른 쪽의 맥동 — 그라디언트는 common 캐시)
      const sx = R.x + 16, sw = (R.w - 32 - 8) / 2;
      this.lay.pages.forEach((pg, i) => {
        const r = { x: sx + i * (sw + 8), y: R.y + SEG_Y, w: sw, h: SEG_H };
        this.segRects.push(this.m.ges.zone(r, 'primary', { src: 'status.page' }));
        gbutton(ctx, r, `${i + 1} · ${pg.name}`, { hot: i === pgI, size: 13, t });
      });
    }
    // 커서 + 설명
    const E = this.elCol;
    const cell = this.cells.find((c) => c.col === this.col && c.row === this.row);
    const focused = this.m.focus === 'content';
    if (cell && (focused || this.col !== 0 || this.row !== 0)) {
      if (cell.col === E) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = PAL.goldHi; ctx.lineWidth = 1.5; ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);
        ctx.restore();
        glow(ctx, cell.x + cell.w / 2, cell.y + cell.h / 2, cell.w * 0.6, EL[cell.key].color, 0.18);
      } else {
        selBar(ctx, cell.x - 4, cell.y, cell.w + 8, cell.h, t, { dim: !focused });
        this.drawRow(ctx, cell.key, cell.x, cell.y, cell.w, true);
      }
    }
    const dy = R.y + R.h - DESC_H;
    // 설명 줄 (글자 캐시: 고른 칸이 바뀔 때만 다시 굽는다)
    this.txt.draw(ctx, 'desc', `${cell ? cell.col === E ? 'el:' + cell.key : cell.key : '-'}`, R.x + 4, dy - 4, R.w - 8, DESC_H, (g) => {
      divider(g, R.x + 16, dy, R.w - 32, { center: false, a: 0.5 });
      let desc = '능력치를 고르면 설명이 표시됩니다.', title = '';
      if (cell) {
        if (cell.col === E) { const e = EL[cell.key]; title = `${e.name} 속성`; desc = `${e.name} 피해: ${e.name} 속성 공격의 위력 증가  ·  ${e.name} 저항: ${e.name} 속성으로 받는 피해 감소`; }
        else { title = D.STAT_INFO[cell.key]?.name ?? cell.key; desc = STAT_DESC[cell.key] ?? ''; }
      }
      if (title) text(g, title, R.x + 18, dy + 26, { size: 14, weight: 800, color: PAL.gold, family: FONT.title });
      const tw = title ? measure(g, title, 14, 800, FONT.title) + 30 : 18;
      para(g, desc, R.x + tw, dy + 26, R.w - tw - 16, { size: 13, color: PAL.text, max: 1 });
    });
    this.txt.sweep();
  }

  drawRow(ctx, k, x, y, w, hot = false) {
    const L = this.lay;
    const v = this.stats[k] ?? 0;
    const zero = Math.abs(v) < 0.001 && !CORE.has(k);
    const name = D.STAT_INFO[k]?.name ?? k;
    const vs = CORE.has(k) ? L.vsize : L.vsize2;
    const val = fmtStatVal(k, v);
    const by = y + Math.round(L.row * 0.5 + L.size * 0.36);
    const vw = measure(ctx, val, vs, 800, FONT.num);
    text(ctx, ellipsize(ctx, name, w - vw - 20, L.size, hot ? 800 : 600), x + 10, by, { size: L.size, weight: hot ? 800 : 600, color: hot ? PAL.goldHi : zero ? PAL.faint : CORE.has(k) ? PAL.bone : PAL.text, ow: 2 });
    text(ctx, val, x + w - 6, by + 0.5, { size: vs, align: 'right', weight: 800, family: FONT.num, color: hot ? '#fff' : zero ? PAL.faint : CORE.has(k) ? PAL.goldHi : PAL.bone, ow: 3 });
  }

  drawStats(c, R) {
    const L = this.lay;
    this.cells.length = 0;
    // 그릴 열: 넓은 화면은 모든 열, 두 쪽 배치는 지금 쪽의 열 (능력치 열 번호 또는 'info' = 장비 정보 칸)
    const pg = L.pages ? L.pages[this.page] : null;
    const vis = pg ? pg.vis : L.cols.map((_, ci) => ci);
    const pad = 16, gap = 18;
    const nc = vis.length;
    const cw = (R.w - pad * 2 - gap * (nc - 1)) / nc;
    const hs = L.row >= 17 ? 15 : 13;
    vis.forEach((ci, vi) => {
      const x = R.x + pad + vi * (cw + gap);
      let y = R.y + L.top, row = 0;
      for (const g of ci === 'info' ? [] : L.cols[ci]) {
        heading(c, g.name, x, y, cw, { size: hs });
        y += L.gh;
        for (const k of g.keys) {
          if (row % 2 === 0) { c.fillStyle = 'rgba(255,230,200,0.025)'; c.fillRect(x, y, cw, L.row); }
          this.drawRow(c, k, x, y, cw);
          this.cells.push({ col: ci, row, key: k, x, y, w: cw, h: L.row });
          y += L.row; row++;
        }
        y += L.head;
      }
      if (ci === L.info) {
        // 기타 정보
        heading(c, '장비 정보', x, y, cw, { size: hs });
        y += L.gh;
        const s = this.stats;
        const sub = SUBWEAPONS[this.world?.run?.sub ?? this.hero.sub];
        const rows = [
          ['무기 계열', D.WTYPE_NAME[s.weaponType] ?? s.weaponType ?? '-'],
          ['무기 속성', s.element ? EL[s.element]?.name ?? s.element : '없음', s.element ? EL[s.element]?.color : null],
          ['보조무기', sub?.name ?? '-'],
        ];
        for (const [a, b, col2] of rows.slice(0, INFO_ROWS)) {
          const by = y + Math.round(L.row * 0.5 + L.size * 0.36);
          const bw = measure(c, String(b), L.size, 800);
          text(c, ellipsize(c, a, cw - bw - 20, L.size, 600), x + 10, by, { size: L.size, weight: 600, color: PAL.text, ow: 2 });
          text(c, String(b), x + cw - 6, by, { size: L.size, align: 'right', weight: 800, color: col2 || PAL.bone, ow: 2 });
          y += L.row;
        }
      }
    });
    if (pg && !pg.el) return; // 속성 표는 그 쪽에만
    // 속성 표 (한 줄 5칸: 이름 / 피해 / 저항)
    const x0 = R.x + pad, tw = R.w - pad * 2;
    const cellW = tw / 5;
    let y0;
    if (L.elHead) {
      const ty = R.y + R.h - DESC_H - L.elH;
      heading(c, '속성', x0, ty, tw, { size: 15, sub: '피해 증가 · 받는 피해 저항' });
      y0 = ty + 12;
    } else y0 = R.y + R.h - DESC_H - L.elH;
    const ch = L.elHead ? 56 : L.elH - 6;
    EL_ORDER.forEach((el, i) => {
      const e = EL[el];
      const x = x0 + i * cellW;
      c.fillStyle = 'rgba(255,230,200,0.035)'; c.fillRect(x + 2, y0, cellW - 4, ch);
      c.fillStyle = e.color; c.globalAlpha = 0.6; c.fillRect(x + 2, y0, cellW - 4, 1.5); c.globalAlpha = 1;
      const dmg = this.stats[el] ?? 0, res = this.stats['res' + el[0].toUpperCase() + el.slice(1)] ?? 0;
      const ly = L.elHead ? [19, 36, 51] : [14, 28, 41];
      diamond(c, x + 14, y0 + ly[0] - 5, 4.5, e.color);
      glow(c, x + 14, y0 + ly[0] - 5, 11, e.color, 0.45);
      text(c, e.name, x + 25, y0 + ly[0], { size: L.elHead ? 13 : 12, weight: 800, color: e.color, ow: 3 });
      const fs = L.elHead ? 13 : 12;
      const ls = L.pages ? 12 : 11;
      text(c, '피해', x + 10, y0 + ly[1], { size: ls, weight: 700, color: PAL.dim, ow: 2 });
      text(c, `${dmg > 0 ? '+' : ''}${num(dmg)}%`, x + cellW - 10, y0 + ly[1], { size: fs, align: 'right', weight: 800, family: FONT.num, color: dmg ? PAL.bone : PAL.faint, ow: 2 });
      text(c, '저항', x + 10, y0 + ly[2], { size: ls, weight: 700, color: PAL.dim, ow: 2 });
      text(c, `${res > 0 ? '+' : ''}${num(res)}%`, x + cellW - 10, y0 + ly[2], { size: fs, align: 'right', weight: 800, family: FONT.num, color: res ? PAL.bone : PAL.faint, ow: 2 });
      this.cells.push({ col: L.cols.length, row: i, key: el, x: x + 2, y: y0, w: cellW - 4, h: ch });
    });
  }
}
