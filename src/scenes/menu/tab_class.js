// 직업 탭: 캐릭터의 직업 계보(기본 → 1차 2갈래 → 2차 4갈래) · 현재 경로 강조 · 요구 조건 · 특성/보정치 · 직업 외형 미리보기
// 전직 자체는 마을 성당에서 한다 → 안내만 표시
// 미리보기는 턴테이블 (hero_view.js): 직업을 바꿔 골라도 돌려 둔 각도가 유지되어 같은 방향에서 직업 외형을 비교할 수 있다.
// 초월·비전 (docs/specs/classes_t3.md §8.2): 2차 카드마다 아래에 띠 한 줄 — 왼쪽 62% 초월 알약, 오른쪽 38% 비전 알약
//   (시련 Ⅰ 전에는 '???' + 자물쇠). 띠 높이 = max(20, 글자 하한 + 8), 탭 영역은 36 UI px 높이로 카드보다 먼저(위에) 등록.
//   ← → 로 2차 카드 → 초월 → 비전, 반대로 돌아온다. 낮은 화면·큰 글자에서 2차 열이 넘치면 계보 판이 세로로 스크롤된다.
//   띠 노드 id: 초월 = ASCENSIONS id, 비전 = '<비전 id>@<2차 id>' (2차 카드마다 하나씩)
import { text, FONT, textFloor } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp, rgba } from '../../core/math.js';
import * as HERO from '../../render/hero.js';
import * as PUP from '../../render/hero_puppet.js';
import * as ProgM from '../../game/progression.js';
import { lookForAsc } from '../../game/stats.js';
import { ASCENSIONS, T3_OF, HIDDEN_OF, KIND_LABEL, p2Cleared } from '../../data/ascensions.js';
import { TRIALS, trialsOf } from '../../data/trials.js';
import { SKILLS } from '../../data/skills.js';
import { Tab } from './base.js';
import { HeroView, HeroStage, PixLayer, PixCache, pedestal, accentOf, turntableHints, pxScale } from './hero_view.js';
import { PAL, frame, heading, divider, brackets, glow, glowOval, pill, para, rr, glyph, ellipsize, measure, leanMem, takeCanvas, giveCanvas, vGrad, fillPathGrad, wrapC, Scroller, clipBegin, clipEnd, scrollbar, moreBelow } from './common.js';
// 카드 그라디언트 색 멈춤 (common.js 캐시 키 — 같은 배열이면 매 프레임 새 그라디언트 0, R1-REQ-341B)
const CARD_ON = [0, 'rgba(70,16,32,0.96)', 1, 'rgba(8,4,10,0.96)'], CARD_OFF = [0, 'rgba(30,18,30,0.94)', 1, 'rgba(8,4,10,0.96)'];
import { fmtStatVal } from './tab_status.js';
import * as D from './access.js';

const TIER_NAME = ['기본 직업', '1차 전직', '2차 전직', '초월'];
/** 띠 알약 빛깔: 초월 금빛 · 비전 보랏빛 */
const KIND_COLOR = { t3: '#ffd870', hidden: '#c8a0ff' };
const own = (o, k) => !!o && typeof k === 'string' && Object.hasOwn(o, k);
/** 띠 노드 id → { A: ASCENSIONS 항목, line: 그 띠가 달린 2차 id } | null */
function nodeOf(id) {
  if (typeof id !== 'string') return null;
  const at = id.indexOf('@');
  if (at > 0) { const k = id.slice(0, at); return own(ASCENSIONS, k) ? { A: ASCENSIONS[k], line: id.slice(at + 1), id } : null; }
  return own(ASCENSIONS, id) ? { A: ASCENSIONS[id], line: ASCENSIONS[id].parent, id } : null;
}
const hiddenNode = (charId, line) => (HIDDEN_OF[charId] ? `${HIDDEN_OF[charId]}@${line}` : null);

export class ClassTab extends Tab {
  constructor(m) {
    super(m);
    this.view = new HeroView({ turntable: true, game: m.game });
    this.stage = new HeroStage();
    this.txt = new PixCache(28);    // 카드·띠·상세 글자 캐시 (외곽선 글자는 매 프레임 그리기에 너무 비싸다 — P-11)
    this.bg = new PixLayer();       // 두 판의 틀 (그라디언트) — 한 장으로 구워 1:1 복사
    this.heroRect = null;
    this.sel = null; this.rects = []; this.thumbs = new Map(); this.looks = new Map(); this.rev = -1;
    this.dsc = new Scroller(); this.detailRect = null; this.dKey = null;   // 상세 글이 칸을 넘칠 때(휴대폰)만 세로 스크롤
    this.tsc = new Scroller(); this.treeRect = null;                       // 계보 판: 2차 열(+띠)이 넘칠 때만 세로 스크롤
  }
  /** 메뉴의 가로 밀기(탭 넘기기)를 무시할 곳: 회전 무대 (platform §5.6) */
  noSwipe(x, y) { return this.view.swipeBlock(x, y); }
  swipeBlock(x, y) { return this.view.swipeBlock(x, y); }
  free() { this.view.release(); this.stage.free(); this.txt.free(); this.bg.free(); this.dropThumbs(); }
  /** 썸네일 캔버스는 메뉴 공용 풀로 (0×0 — 스테이지 도중 직업 탭을 다시 열어도 새 캔버스 0, R1-REQ-339B) */
  dropThumbs() { for (const T of this.thumbs.values()) giveCanvas(T.cv); this.thumbs.clear(); }
  get chain() { return D.classChain(this.hero.classId).map((c) => c.id); }
  tiers() {
    const all = Object.values(D.CLASSES()).filter((c) => c.charId === this.hero.charId);
    const t0 = all.filter((c) => c.tier === 0);
    const t1 = t0.flatMap((c) => (c.next || []).map((id) => D.CLASSES()[id]).filter(Boolean));
    const t2 = t1.flatMap((c) => (c.next || []).map((id) => D.CLASSES()[id]).filter(Boolean));
    return [t0, t1, t2];
  }
  /** 지금 걷는 길의 노드 id (초월·비전이면 그 띠, 아니면 직업) */
  homeId() {
    const h = this.hero, A = h.asc && own(ASCENSIONS, h.asc) ? ASCENSIONS[h.asc] : null;
    if (A && A.parents.includes(h.classId)) return A.kind === 'hidden' ? hiddenNode(h.charId, h.classId) : A.id;
    return h.classId;
  }
  onShow() { if (!this.sel) this.sel = this.homeId(); this.view.wake(); }
  /** 탭을 떠날 때: 끌기·누름·회전을 끝내고 캐시 레이어·썸네일의 픽셀을 돌려준다 (돌아오면 다시 굽는다 — 폰 캔버스 예산 §5.2) */
  onHide() { this.view.sleep(); this.view.release(); this.stage.release(); this.txt.release(); this.bg.release(); this.dropThumbs(); }
  /** 직업(또는 띠 노드)의 외형. 직업은 초월 없이(2차 그대로), 띠는 그 2차 위에 초월/비전 (stats.lookForAsc — 영웅은 건드리지 않는다) */
  lookFor(cid) {
    if (this.rev !== this.m.rev) { this.rev = this.m.rev; this.looks.clear(); this.dropThumbs(); }
    let L = this.looks.get(cid);
    if (!L) {
      const hero = this.hero, N = nodeOf(cid);
      if (N) {
        const known = this.ascKnown(N.A);
        try { L = known ? lookForAsc(this.state, { ...hero, classId: N.line }, N.A.id) : lookForAsc(this.state, { ...hero, classId: N.line }, null); } catch (e) { L = null; }
      } else {
        // 잠깐 바꿔 끼워 계산 (2차 카드는 초월 없이 — 비전은 2차 넷 모두가 부모라 그대로 두면 다른 2차 미리보기에 비전 장식이 붙는다)
        const keep = hero.classId, keepAsc = hero.asc, hadAsc = Object.hasOwn(hero, 'asc');   // 예전 세이브의 영웅에는 asc 칸이 없다 — 없던 칸은 만들지 않는다
        hero.classId = cid; hero.asc = null;
        try { L = D.composeLook(this.state, hero); } catch (e) { L = null; } finally { hero.classId = keep; if (hadAsc) hero.asc = keepAsc; else delete hero.asc; }
      }
      this.looks.set(cid, L);
    }
    return L;
  }
  /**
   * 직업 썸네일 (정지 화면, 직업마다 작은 캔버스 하나). 배율 = 그리는 ctx 의 실제 픽셀 배율 (픽셀 예산 안, P-11).
   * 키에 puppetRev() 를 넣는다: 채색 인형이 늦게 준비되면 벡터로 찍힌 썸네일을 다시 그린다 (PUPPET_PIPELINE §6)
   */
  thumb(cid, w, h, ctx = null) {
    const sc = ctx ? pxScale(ctx) : pxScale(null, this.game.scale);
    let rev = 0;
    try { rev = PUP.puppetRev?.() ?? 0; } catch { rev = 0; }
    const key = w + '|' + h + '|' + sc + '|' + rev;
    let T = this.thumbs.get(cid);
    if (!T) { T = { cv: takeCanvas(), key: null }; this.thumbs.set(cid, T); }
    if (T.key !== key) {
      const c = T.cv;
      const pw = Math.ceil(w * sc), ph = Math.ceil(h * sc);
      if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pw, ph);
      g.setTransform(sc, 0, 0, sc, 0, 0);
      const look = this.lookFor(cid);
      const p = { cx: w / 2, bottom: h - 4, facing: 1, anim: 'idle', animT: 0.4, look, ch: D.CHARACTERS()[this.hero.charId], vx: 0, vy: 0, onGround: true, rig: null, t: 2.2, stats: { reach: 0 } };
      try { HERO.drawHero(g, p, null, { scale: (h - 10) / 96 }); } catch (e) { /* 무시 */ }
      T.key = key;
    }
    return T.cv;
  }
  status(c) {
    const chain = this.chain, hero = this.hero;
    if (c.id === hero.classId) return { key: 'cur', text: '현재 직업', color: PAL.goldHi };
    if (chain.includes(c.id)) return { key: 'done', text: '거쳐 온 직업', color: PAL.gold };
    const f = ProgM.canChangeClass;
    const chk = typeof f === 'function' ? f(hero, c.id) : { ok: false };
    if (chk.ok) return { key: 'ready', text: '전직 가능!', color: PAL.good };
    const curTier = D.CLASSES()[hero.classId]?.tier ?? 0;
    if (c.tier <= curTier) return { key: 'closed', text: '선택하지 않은 길', color: PAL.faint };
    let pid = c.parent;
    while (pid) {
      const pc = D.CLASSES()[pid];
      if (!pc) break;
      if (pc.tier <= curTier) { if (!chain.includes(pid)) return { key: 'closed', text: '선택하지 않은 길', color: PAL.faint }; break; }
      pid = pc.parent;
    }
    return { key: 'locked', text: `Lv ${c.reqLevel} 필요`, color: PAL.dim };
  }
  /** 이 영웅의 시련 Ⅰ을 넘었나 (넘기 전에는 비전의 정체를 감춘다 — 성당 4번 칸과 같다) */
  trial1Done() { const t1 = trialsOf(this.hero.charId).find((x) => x.n === 1); return !!(t1 && this.hero.trials?.[t1.id]?.done); }
  ascKnown(A) { return A.kind !== 'hidden' || this.trial1Done() || (Array.isArray(this.hero.ascUnlocked) && this.hero.ascUnlocked.includes(A.id)); }
  /**
   * 띠 노드의 상태 { key: cur|ready|unlocked|closed|locked, text, color, reason, known } (§8.2).
   * reason = progression.canAscend 의 이유 (비전의 정체를 모르면 '시련 Ⅰ을 먼저 넘어야 한다')
   */
  statusAsc(N) {
    const hero = this.hero, A = N.A, known = this.ascKnown(A);
    const lineSt = this.status(D.CLASSES()[N.line] ?? { id: N.line, tier: 2 });
    if (hero.asc === A.id && hero.classId === N.line) return { key: 'cur', text: '현재 직업', color: PAL.goldHi, reason: '', known };
    if (lineSt.key === 'closed') return { key: 'closed', text: '선택하지 않은 길', color: PAL.faint, reason: '', known };
    const chk = ProgM.canAscend(hero, A.id, this.state);
    if (hero.classId === N.line && chk.ok) return { key: 'ready', text: '초월 가능!', color: PAL.good, reason: '', known };
    const unlocked = Array.isArray(hero.ascUnlocked) && hero.ascUnlocked.includes(A.id);
    const reason = !known ? '시련 Ⅰ을 먼저 넘어야 한다' : chk.reason ?? '';
    if (unlocked) return { key: 'unlocked', text: '해금됨', color: PAL.gold, reason: hero.classId === N.line ? reason : '', known };
    return { key: 'locked', text: chk.code === 'level' ? `Lv ${A.reqLevel} 필요` : '잠김', color: PAL.dim, reason, known };
  }

  update(dt, nav, ges, focused) {
    if (!this.sel) this.sel = this.homeId();
    this.view.control(dt, ges);     // 턴테이블 (포커스와 무관: 끌기·휠·, . /·오른쪽 스틱·R3·무대 탭 = 시연)
    this.view.update(dt);
    if (this.detailRect) this.dsc.update(dt, this.detailRect, ges);   // 끌기·휠·오른쪽 스틱 Y (tab_skills 상세와 같다)
    if (this.treeRect && this.tsc.max > 0) this.tsc.update(dt, this.treeRect, ges);
    // 포인터: 띠(36 UI px 탭 영역)가 카드보다 위 — 등록부가 하나만 고른다. 호버는 띠의 보이는 칸으로 (카드와 겹치는 여유 줄에서 깜빡이지 않게)
    for (const r of this.rects) {
      if (r.thid || this.tsc.dragging) continue;
      const hv = r.vis ?? r;
      if (ges.hoverIn(hv) && this.sel !== r.id && !(r.vis == null && this.rects.some((q) => q.vis && ges.hoverIn(q.vis)))) { this.sel = r.id; }
      if (ges.tap(r)) { this.m.focus = 'content'; if (this.sel !== r.id) audio.sfx('menu_move'); else this.view.showcase(); this.sel = r.id; return; }
    }
    if (!focused) return;
    const go = (id) => { if (id && id !== this.sel) { this.sel = id; audio.sfx('menu_move'); this.tsc.follow(id); } };
    const T = this.tiers();
    const N = nodeOf(this.sel);
    if (N) {
      // 띠: ← 2차 카드 / 비전 → 초월, → 초월 → 비전, ↑↓ 옆 2차 카드의 같은 자리
      const list = T[2] || [], i = list.findIndex((c) => c.id === N.line), hid = N.A.kind === 'hidden';
      const at = (k) => { const c = list[k]; if (!c) return null; return hid ? hiddenNode(this.hero.charId, c.id) : T3_OF[c.id] ?? c.id; };
      if (nav.up) { if (i > 0) go(at(i - 1)); else { this.m.focusTabs(); return; } }
      if (nav.down && i >= 0 && i < list.length - 1) go(at(i + 1));
      if (nav.left) go(hid ? T3_OF[N.line] ?? N.line : N.line);
      if (nav.right && !hid) go(hiddenNode(this.hero.charId, N.line));
      if (nav.confirm) this.view.showcase();
      if (nav.cancel) this.m.close();
      return;
    }
    const cur = D.CLASSES()[this.sel];
    if (!cur) { this.sel = this.homeId(); return; }
    const tier = T[cur.tier] || [];
    const i = tier.findIndex((c) => c.id === this.sel);
    if (nav.up) { if (i > 0) go(tier[i - 1].id); else { this.m.focusTabs(); return; } }
    if (nav.down && i < tier.length - 1) go(tier[i + 1].id);
    if (nav.right) {
      if (cur.tier === 2) go(T3_OF[cur.id]);   // 2차 → 그 아래 띠의 초월
      else {
        const kids = (cur.next || []).filter((id) => D.CLASSES()[id]);
        const pick = kids.find((id) => this.chain.includes(id)) || kids[0];
        go(pick);
      }
    }
    if (nav.left && cur.parent) go(cur.parent);
    if (nav.confirm) this.view.showcase();
    if (nav.cancel) this.m.close();
  }
  /** 포커스와 무관하게 늘 되는 조작 (탭 막대에 포커스가 있을 때 메뉴 하단 막대가 덧붙인다 — 턴테이블) */
  idleHints() { return turntableHints(this.view); }
  hints() { return [['↑↓←→', '직업 선택', '직업 카드를 터치해 자세히 보기'], ['Z', '동작 보기'], ...turntableHints(this.view)]; }

  render(ctx, A) {
    if (!this.sel) this.sel = this.homeId();
    const t = this.t, focused = this.m.focus === 'content';
    const DW = Math.round(clamp(A.w * 0.35, 300, 380));
    const TW = A.w - DW - 12;
    // 두 판의 틀 (정적)
    // 판의 틀: 폰·태블릿 등급은 굽지 않고 매 프레임 (그라디언트 캐시 — 캔버스 예산 R1-REQ-342), 'high' 는 구워 1:1 복사
    this.bg.drawBg(ctx, `${TW}`, A.x - 3, A.y - 3, A.w + 6, A.h + 6, (c) => {
      frame(c, A.x, A.y, TW, A.h);
      frame(c, A.x + TW + 12, A.y, DW, A.h);
    }, leanMem(this.m.game));
    const ch = D.CHARACTERS()[this.hero.charId];
    const T = this.tiers();
    const chain = this.chain;
    // 카드 배치 (§8.2): 2차 카드마다 아래 띠 STRIP (+2). 카드 높이는 띠를 뺀 자리에서 (44..76) — 글자 두 줄(이름·상태)은 늘 들어가게.
    // 2차 열(카드 + 띠)이 판보다 길면(휴대폰 · 큰 글자) 계보 판만 세로로 스크롤한다
    const F = Math.max(11, textFloor());
    const STRIP = Math.max(20, Math.ceil(F + 8));
    const cardW = Math.min(188, (TW - 40 - 2 * 26) / 3);
    const cardH = Math.max(Math.floor(clamp((A.h - 64 - 4 * (STRIP + 2) - 18) / 4, 44, 76)), Math.ceil(2 * F + 16));   // 내림: 반올림하면 넉넉한 화면에서도 2차 열이 1~2 px 넘쳐 스크롤 막대가 생긴다
    const colX = [A.x + 16, A.x + 16 + cardW + 26, A.x + 16 + 2 * (cardW + 26)];
    const top = A.y + 44, ctop = top + 10, H = A.h - 64;
    const unit2 = cardH + STRIP + 2;
    const n2 = T[2]?.length ?? 0;
    const CH = Math.max(H, n2 * unit2 + Math.max(0, n2 - 1) * 6);   // 내용 높이 (넘치면 스크롤)
    const TR = { x: A.x + 2, y: top + 6, w: TW - 4, h: A.y + A.h - 4 - (top + 6) };
    this.treeRect = TR;
    this.tsc.setMax(CH - H);
    const sy = this.tsc.y;
    const pos = new Map();
    T.forEach((list, ti) => {
      const n = list.length, u = ti === 2 ? unit2 : cardH;
      const gap = n > 1 ? Math.min(18, (CH - n * u) / (n - 1)) : 0;
      const total = n * u + (n - 1) * gap;
      list.forEach((c, k) => pos.set(c.id, { x: colX[ti], y: ctop + (CH - total) / 2 + k * (u + gap) - sy }));
    });
    // 선택을 따라 스크롤 (탐색 입력으로 바뀐 때만)
    if (this.tsc.max > 0 && this.tsc.shouldFollow(this.sel)) {
      const N = nodeOf(this.sel), p = pos.get(N ? N.line : this.sel);
      if (p) { const y0 = p.y + sy - ctop, y1 = y0 + (N || D.CLASSES()[this.sel]?.tier === 2 ? unit2 : cardH); this.tsc.ensure(y0, y1, H, 8); }
    }
    // 제목 + 티어 제목 (글자 캐시)
    this.txt.draw(ctx, 'head', `${this.hero.charId}|${cardW}`, A.x + 4, A.y + 4, TW - 8, top + 12 - A.y, (c) => {
      heading(c, '직업 계보', A.x + 16, A.y + 26, TW - 32, { sub: ch?.name?.split(' ')[0] });
      TIER_NAME.slice(0, 3).forEach((nm, ti) => text(c, nm, colX[ti] + cardW / 2, top + 4, { size: 11, align: 'center', weight: 700, color: PAL.faint, ow: 2 }));
    });
    clipBegin(ctx, TR);
    // 연결선
    for (const list of T) for (const c of list) {
      if (!c.parent || !pos.has(c.parent)) continue;
      const a = pos.get(c.parent), b = pos.get(c.id);
      const lit = chain.includes(c.id);
      const x1 = a.x + cardW, y1 = a.y + cardH / 2, x2 = b.x, y2 = b.y + cardH / 2, mx = (x1 + x2) / 2;
      ctx.strokeStyle = lit ? PAL.gold : 'rgba(110,85,60,0.55)'; ctx.lineWidth = lit ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2); ctx.stroke();
      if (lit) {
        const k = (t * 0.6) % 1;
        const px = (1 - k) ** 3 * x1 + 3 * (1 - k) ** 2 * k * mx + 3 * (1 - k) * k * k * mx + k ** 3 * x2;
        const py = (1 - k) ** 3 * y1 + 3 * (1 - k) ** 2 * k * y1 + 3 * (1 - k) * k * k * y2 + k ** 3 * y2;
        glow(ctx, px, py, 12, '#ffd070', 0.8);
      }
    }
    // 카드 (먼저 등록) → 띠 (나중 등록 = 위 = 탭 우선)
    this.rects.length = 0;
    for (const list of T) for (const c of list) {
      const p = pos.get(c.id);
      const r = { x: p.x, y: p.y, w: cardW, h: cardH, id: c.id };
      this.rects.push(r);
      this.m.ges?.zone?.(r, 'list', { clip: TR, src: 'class.card' });
      this.drawCard(ctx, c, r, t, focused, F);
    }
    for (const c of T[2] || []) {
      const p = pos.get(c.id);
      this.drawStrip(ctx, c, { x: p.x, y: p.y + cardH + 2, w: cardW, h: STRIP }, t, focused, TR);
    }
    clipEnd(ctx, TR, this.tsc.max > 0 ? this.tsc : null, 'rgba(12,6,16,0.95)');
    if (this.tsc.max > 0) scrollbar(ctx, A.x + TW - 7, TR.y + 2, TR.h - 4, this.tsc, TR.h);
    // 상세
    const N = nodeOf(this.sel);
    if (N) this.drawDetailAsc(ctx, N, A.x + TW + 12, A.y, DW, A.h);
    else this.drawDetail(ctx, A.x + TW + 12, A.y, DW, A.h);
    this.txt.sweep();
  }

  drawCard(ctx, c, r, t, focused, F = 11) {
    const st = this.status(c);
    const sel = this.sel === c.id;
    const look = this.lookFor(c.id);
    const acc = accentOf(look);
    if (st.key === 'cur') glowOval(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.7, r.h * 0.9, '#ff3050', 0.25 + 0.08 * Math.sin(t * 3));
    if (st.key === 'ready') glowOval(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.7, r.h * 0.9, '#60ff90', 0.18 + 0.1 * Math.sin(t * 5));
    const on = st.key === 'cur' || st.key === 'done';
    rr(ctx, r.x, r.y, r.w, r.h, 6); fillPathGrad(ctx, vGrad(ctx, r.h, on ? CARD_ON : CARD_OFF), 0, r.y); // 캐시 그라디언트
    ctx.strokeStyle = sel ? PAL.goldHi : st.key === 'cur' ? PAL.gold : st.key === 'done' ? PAL.goldMid : st.key === 'ready' ? '#6ad08a' : '#3e3036';
    ctx.lineWidth = sel || st.key === 'cur' ? 2 : 1.2; ctx.stroke();
    // 썸네일
    const tw = 54, th = r.h - 8;
    ctx.save();
    rr(ctx, r.x + 4, r.y + 4, tw, th, 4); ctx.clip();
    ctx.translate(0, r.y); ctx.fillStyle = vGrad(ctx, r.h, [0, rgba(acc, 0.22), 1, 'rgba(0,0,0,0.3)']); // 원점 기준 캐시 (직업 색마다 하나)
    ctx.fillRect(r.x + 4, 4, tw, th); ctx.translate(0, -r.y);
    const img = this.thumb(c.id, tw, th + 8, ctx);
    ctx.globalAlpha *= st.key === 'closed' ? 0.35 : st.key === 'locked' ? 0.7 : 1;
    ctx.imageSmoothingQuality = 'medium';   // 거의 1:1 복사 — 'high' 필터는 비싸기만 하다 (P-11)
    ctx.drawImage(img, 0, 0, img.width, img.height, r.x + 4, r.y, tw, th + 8);
    ctx.restore();
    const tx = r.x + tw + 12, w = r.w - tw - 18;
    // 카드 글자·표식은 캐시 (선택·상태가 바뀔 때만 다시 굽는다). 낮은 카드(글자 하한의 세 줄이 안 들어감)에서는 영문 줄을 뺀다
    const eng = r.h >= Math.max(54, 3 * F + 18);
    this.txt.draw(ctx, 'card:' + c.id, `${sel ? 1 : 0}|${st.key}|${st.text}|${this.m.rev}|${r.h}`, tx - 4, r.y + 1, r.x + r.w - tx + 3, r.h - 2, (g) => {
      const iconW = st.key === 'locked' || st.key === 'closed' || st.key === 'cur' ? 16 : 0;
      const nsz = measure(g, c.name, 14, 800) <= w - iconW ? 14 : 12.5;
      text(g, ellipsize(g, c.name, w - iconW, nsz, 800), tx, r.y + (eng ? Math.round(r.h * 0.32) : Math.round(Math.max(F, nsz) + 4)), { size: nsz, weight: 800, color: st.key === 'closed' ? PAL.faint : sel ? PAL.goldHi : PAL.bone, ow: 3 });
      if (eng) text(g, c.eng ?? '', tx, r.y + Math.round(r.h * 0.53), { size: 10, weight: 700, family: FONT.num, color: PAL.dim, ow: 2, maxWidth: w });
      text(g, st.text, tx, r.y + r.h - (r.h >= 70 ? 12 : 9), { size: 11, weight: 800, color: st.color, ow: 2 });
      if (st.key === 'locked' || st.key === 'closed') glyph(g, 'lock', r.x + r.w - 14, r.y + 14, 10, PAL.faint, 1.3);
      if (st.key === 'cur') glyph(g, 'star', r.x + r.w - 14, r.y + 14, 11, PAL.goldHi, 1);
    });
    if (sel) brackets(ctx, r.x, r.y, r.w, r.h, t, focused ? PAL.goldHi : PAL.goldMid);
  }

  /** 2차 카드 아래 띠: 왼쪽 62% 초월 알약 · 오른쪽 38% 비전 알약 (§8.2). 탭 영역은 36 UI px 높이 (띠 위아래로 늘림) */
  drawStrip(ctx, c, S, t, focused, clip) {
    const hero = this.hero;
    const tid = T3_OF[c.id], hid = hiddenNode(hero.charId, c.id);
    const lw = Math.round(S.w * 0.62) - 2;
    const cells = [];
    if (tid) cells.push({ id: tid, x: S.x, w: lw });
    if (hid) cells.push({ id: hid, x: S.x + lw + 4, w: S.w - lw - 4 });
    const tapH = Math.max(36, S.h);
    for (const cell of cells) {
      const N = nodeOf(cell.id);
      if (!N) continue;
      const st = this.statusAsc(N);
      const sel = this.sel === cell.id;
      const vis = { x: cell.x, y: S.y, w: cell.w, h: S.h };
      const r = { x: cell.x, y: S.y + S.h / 2 - tapH / 2, w: cell.w, h: tapH, id: cell.id, vis };
      this.rects.push(r);
      this.m.ges?.zone?.(r, 'dense', { clip, src: 'class.strip' });
      const kc = KIND_COLOR[N.A.kind];
      const cur = st.key === 'cur', dim = st.key === 'closed' || (st.key === 'locked' && !st.known);
      if (cur) glowOval(ctx, vis.x + vis.w / 2, vis.y + vis.h / 2, vis.w * 0.6, vis.h, kc, 0.3 + 0.08 * Math.sin(t * 3));
      if (st.key === 'ready') glowOval(ctx, vis.x + vis.w / 2, vis.y + vis.h / 2, vis.w * 0.6, vis.h, '#60ff90', 0.16 + 0.1 * Math.sin(t * 5));
      rr(ctx, vis.x, vis.y, vis.w, vis.h, vis.h / 2);
      ctx.fillStyle = cur ? rgba(kc, 0.32) : dim ? 'rgba(14,8,14,0.85)' : 'rgba(26,14,26,0.92)'; ctx.fill();
      ctx.strokeStyle = sel ? PAL.goldHi : cur ? kc : st.key === 'ready' ? '#6ad08a' : st.key === 'unlocked' ? rgba(kc, 0.75) : dim ? '#2e2228' : '#4a3a40';
      ctx.lineWidth = sel || cur ? 1.8 : 1.1; ctx.stroke();
      const lock = st.key === 'locked' || st.key === 'closed';
      const label = !st.known ? '???' : N.A.kind === 'hidden' ? KIND_LABEL.hidden : N.A.name;
      this.txt.draw(ctx, 'strip:' + cell.id, `${sel ? 1 : 0}|${st.key}|${label}|${this.m.rev}|${vis.w}|${vis.h}`, vis.x, vis.y, vis.w, vis.h, (g) => {
        const gw = lock ? 13 : 0, pad = 8;
        const col = cur ? PAL.goldHi : dim ? PAL.faint : lock ? PAL.dim : st.key === 'ready' ? PAL.good : kc;
        const s = ellipsize(g, label, vis.w - pad * 2 - gw, 12, 800);
        const tw = measure(g, s, 12, 800) + gw;
        const x0 = vis.x + vis.w / 2 - tw / 2;
        if (lock) glyph(g, 'lock', x0 + 5, vis.y + vis.h / 2, 9, col, 1.2);
        text(g, s, x0 + gw, vis.y + vis.h / 2 + Math.max(12, textFloor()) * 0.36, { size: 12, weight: 800, color: col, ow: 2 });
      });
      if (sel) brackets(ctx, vis.x, vis.y, vis.w, vis.h, t, focused ? PAL.goldHi : PAL.goldMid);
    }
  }

  drawDetail(ctx, x, y, w, h) {
    const c = D.CLASSES()[this.sel];
    if (!c) return;
    const t = this.t;
    const look = this.lookFor(c.id);
    this.view.set(look, D.CHARACTERS()[this.hero.charId]);
    const sh = Math.round(clamp(h * 0.39, 118, 168));
    const acc = accentOf(look);
    this.stage.draw(ctx, x + 8, y + 8, w - 16, sh, t, pxScale(ctx), acc);
    const scale = clamp((sh - 16 - 26) / 88, 0.95, 1.45);
    this.heroRect = { x: x + 8, y: y + 8, w: w - 16, h: sh };
    this.view.stage(this.heroRect);
    pedestal(ctx, x + w / 2, y + 8 + sh - 16, 0.95 * scale / 1.45, t, acc, this.view.yaw);
    this.view.draw(ctx, x + w / 2, y + 8 + sh - 16, scale);
    this.view.drawDeck(ctx, t);
    ctx.strokeStyle = 'rgba(200,160,90,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 8.5, y + 8.5, w - 17, sh - 1);
    const st = this.status(c);
    const ph = Math.max(17, Math.ceil(textFloor() + 6));
    pill(ctx, TIER_NAME[c.tier] ?? '', x + 16, y + 16, { color: PAL.gold, size: 10, h: ph });
    pill(ctx, st.text, x + w - 16, y + 16, { align: 'right', color: st.color, size: 10, h: ph, bg: st.key === 'ready' ? 'rgba(20,70,40,0.9)' : 'rgba(40,20,30,0.9)' });
    // 이름·설명·특성·해금·보정치 글자는 캐시 (고른 직업·상태·레벨이 바뀔 때만 다시 굽는다). 칸 = 무대 아래 ~ 아래 안내(요구 조건·성당) 위.
    // 안내 두 줄은 칸 아래에 고정. 글이 칸을 넘치면: 보정치 줄 간격을 좁히고 → 설명을 줄이고(2 → 1 → 0줄) →
    // 그래도 넘치면(휴대폰) 원래 간격·설명 그대로 칸만 세로 스크롤 (보정치 줄을 버리지 않는다)
    const top = y + sh + 10, by = y + h - 40, R = { x: x + 4, y: top, w: w - 8, h: by - 10 - top };
    const mods = [];
    for (const k in c.mult || {}) mods.push({ text: `${D.STAT_INFO[k]?.name ?? k} ×${c.mult[k]}`, good: c.mult[k] >= 1 });
    for (const k in c.flat || {}) mods.push({ text: `${D.STAT_INFO[k]?.name ?? k} +${fmtStatVal(k, c.flat[k])}`, good: c.flat[k] >= 0 });
    // 해금되는 스킬 계열
    const unlocks = [];
    for (const br of D.TREE(this.hero.charId)?.branches || []) {
      const gi = (br.gate || []).indexOf(c.id);
      if (gi >= 0) unlocks.push(`「${br.name}」 ${['3·4단', '5단', '6단'][gi] ?? ''}`);
    }
    // 마지막 글줄의 기준선 (아래 그리기와 같은 계산: para 줄 높이 13 × 1.5)
    const dN = wrapC(ctx, c.desc ?? '', w - 36, 13).length, pN = c.perk ? Math.min(2, wrapC(ctx, c.perk, w - 36, 13, 700).length) : 0;
    const rows = Math.ceil(mods.length / 2);
    const lastOf = (dMax, tight) => {
      const dl = Math.min(dN, dMax);
      let cy = top + 58, last = dl ? cy + (dl - 1) * 19.5 : top + 26;
      cy += dl * 19.5 + 2;
      if (c.perk) { last = cy + 22 + (pN - 1) * 19.5; cy += 22 + pN * 19.5 + 2; }
      if (unlocks.length) { last = cy + 6; cy += 20; }
      return rows ? cy + (tight ? 22 : 28) + (rows - 1) * (tight ? 16 : 18) : last;
    };
    const fit = [[2, false], [2, true], [1, true], [0, true]].find(([d, tt]) => lastOf(d, tt) <= by - 12);
    const [dMax, tight] = fit ?? [2, false];
    if (this.dKey !== c.id) { this.dKey = c.id; this.dsc.reset(); }
    this.detailRect = fit ? null : R;
    const LH = fit ? by - 4 - top : Math.ceil(lastOf(2, false) + 8 - top);
    if (!fit) { this.dsc.setMax(LH - R.h); clipBegin(ctx, R); }
    const t0 = top - (fit ? 0 : this.dsc.y);   // 층은 한 번 굽고 스크롤은 붙이는 자리만 옮긴다
    this.txt.draw(ctx, 'detail', `${c.id}|${st.key}|${this.hero.level}|${this.m.rev}|${dMax}|${tight ? 1 : 0}`, x + 4, t0, w - 8, LH, (g) => {
      let cy = t0 + 26;
      text(g, c.name, x + 18, cy, { size: 20, weight: 800, family: FONT.title, color: PAL.bone, ow: 3 });
      text(g, c.eng ?? '', x + w - 18, cy, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.dim });
      cy += 10;
      divider(g, x + 14, cy, w - 28);
      cy += 22;
      cy += para(g, c.desc ?? '', x + 18, cy, w - 36, { size: 13, color: PAL.text, max: dMax }) + 2;
      if (c.perk) {
        text(g, '직업 특성', x + 18, cy + 4, { size: 12, weight: 800, color: PAL.gold });
        cy += 22;
        cy += para(g, c.perk, x + 18, cy, w - 36, { size: 13, color: '#ffe0a8', weight: 700, max: 2 }) + 2;
      }
      if (unlocks.length) {
        text(g, '스킬 해금', x + 18, cy + 6, { size: 12, weight: 800, color: '#9ac8ff' });
        text(g, ellipsize(g, unlocks.join(' · '), w - 110, 12, 700), x + 84, cy + 6, { size: 12, weight: 700, color: PAL.bone });
        cy += 20;
      }
      // 보정치 (두 칸씩; 좁힌 간격 = 머리 아래 22 · 줄 16)
      if (mods.length) {
        text(g, '능력치 보정', x + 18, cy + 4, { size: 12, weight: 800, color: PAL.gold });
        const cw = (w - 36) / 2, F = tight ? 22 : 28, P = tight ? 16 : 18;
        mods.forEach((md, i) => {
          const mx = x + 18 + (i % 2) * cw, my = cy + F + Math.floor(i / 2) * P;
          text(g, ellipsize(g, md.text, cw - 6, 12, 700), mx, my, { size: 12, weight: 700, color: md.good ? PAL.good : PAL.bad, ow: 2 });
        });
      }
    });
    if (!fit) {
      clipEnd(ctx, R, this.dsc, 'rgba(12,6,16,0.95)');
      if (this.dsc.max > 0) scrollbar(ctx, x + w - 8, R.y + 2, R.h - 4, this.dsc, R.h);
      moreBelow(ctx, R.x + R.w / 2, R.y + R.h, this.dsc.y, this.dsc.max);   // 보정치 줄이 접힌 아래에서 시작할 때
    }
    // 안내 (고정) — 2부에는 신부님 대신 엘리제가 성당을 지킨다 (classes_t3 §8.1)
    const p2 = !!this.state?.progress?.flags?.p2_started;
    this.txt.draw(ctx, 'foot', `${c.id}|${st.key}|${this.hero.level}|${this.m.rev}|${p2 ? 1 : 0}`, x + 4, by - 12, w - 8, y + h - 4 - (by - 12), (g) => {
      const parent = D.CLASSES()[c.parent];
      const req = c.tier === 0 ? '처음부터 익힌 직업' : `Lv ${c.reqLevel} · ${parent?.name ?? ''}에서 전직`;
      divider(g, x + 14, by - 8, w - 28, { center: false, a: 0.4 });
      text(g, req, x + 18, by + 8, { size: 12, weight: 700, color: this.hero.level >= (c.reqLevel ?? 1) ? PAL.text : PAL.bad });
      const hint = st.key === 'ready' ? (p2 ? '마을 성당의 엘리제를 찾아가 전직하세요' : '마을 성당의 알베르토 신부를 찾아가 전직하세요')
        : (p2 ? '전직은 마을 성당(엘리제)에서 할 수 있습니다' : '전직은 마을 성당(알베르토 신부)에서 할 수 있습니다');
      text(g, hint, x + 18, by + 26, { size: 11, weight: 600, color: st.key === 'ready' ? PAL.good : PAL.dim, maxWidth: w - 36 });
    });
  }

  /**
   * 초월·비전 상세 (§8.2): 알약 KIND_LABEL · 이름 · 설명 · 특성 · (비전) 비전 기술 · 능력치 보정(그 항목의 mult/flat) ·
   * 막힌 이유(canAscend) · 아래 고정 줄 'Lv N · 시련 이름 통과 · 2부 결말'(조건마다 색) + '초월은 마을 성당에서 할 수 있습니다'.
   * 미리보기 = 그 2차 위의 초월 외형 (stats.lookForAsc). 비전의 정체를 모르면(시련 Ⅰ 전) 이름·설명·외형을 감춘다
   */
  drawDetailAsc(ctx, N, x, y, w, h) {
    const t = this.t, hero = this.hero, A = N.A;
    const st = this.statusAsc(N), known = st.known;
    const look = this.lookFor(N.id);
    this.view.set(look, D.CHARACTERS()[hero.charId]);
    const sh = Math.round(clamp(h * 0.39, 118, 168));
    const kc = KIND_COLOR[A.kind];
    const acc = known ? A.ult?.accent ?? kc : accentOf(look);
    this.stage.draw(ctx, x + 8, y + 8, w - 16, sh, t, pxScale(ctx), acc);
    const scale = clamp((sh - 16 - 26) / 88, 0.95, 1.45);
    this.heroRect = { x: x + 8, y: y + 8, w: w - 16, h: sh };
    this.view.stage(this.heroRect);
    pedestal(ctx, x + w / 2, y + 8 + sh - 16, 0.95 * scale / 1.45, t, acc, this.view.yaw);
    this.view.draw(ctx, x + w / 2, y + 8 + sh - 16, scale);
    this.view.drawDeck(ctx, t);
    ctx.strokeStyle = rgba(kc, 0.4); ctx.lineWidth = 1; ctx.strokeRect(x + 8.5, y + 8.5, w - 17, sh - 1);
    const ph = Math.max(17, Math.ceil(textFloor() + 6));
    pill(ctx, KIND_LABEL[A.kind] ?? TIER_NAME[3], x + 16, y + 16, { color: kc, size: 10, h: ph, bg: A.kind === 'hidden' ? 'rgba(46,20,78,0.92)' : 'rgba(78,52,8,0.92)' });
    pill(ctx, st.text, x + w - 16, y + 16, { align: 'right', color: st.color, size: 10, h: ph, bg: st.key === 'ready' ? 'rgba(20,70,40,0.9)' : 'rgba(40,20,30,0.9)' });
    const top = y + sh + 10, by = y + h - 40, R = { x: x + 4, y: top, w: w - 8, h: by - 10 - top };
    const mods = [];
    if (known) {
      for (const k in A.mult || {}) mods.push({ text: `${D.STAT_INFO[k]?.name ?? k} ×${A.mult[k]}`, good: A.mult[k] >= 1 });
      for (const k in A.flat || {}) mods.push({ text: `${D.STAT_INFO[k]?.name ?? k} +${fmtStatVal(k, A.flat[k])}`, good: A.flat[k] >= 0 });
    }
    const skill = known && A.skill ? SKILLS[A.skill] : null;
    const reason = st.key === 'locked' || st.key === 'unlocked' ? st.reason : '';
    // 글 높이 (para 줄 높이 13 × 1.5 · 특성은 줄 수 제한 없이 — 넘치면 칸이 스크롤)
    const dN = known ? wrapC(ctx, A.desc ?? '', w - 36, 13).length : 0, pN = known ? wrapC(ctx, A.perk ?? '', w - 36, 13, 700).length : 0;
    const rN = reason ? wrapC(ctx, reason, w - 36, 12, 700).length : 0;
    const rows = Math.ceil(mods.length / 2);
    const lastOf = (dMax) => {
      let cy = top + 58 + Math.min(dN, dMax) * 19.5 + 2;
      if (rN) cy += rN * 18 + 4;
      if (pN) cy += 22 + pN * 19.5 + 2;
      if (skill) cy += 20;
      return rows ? cy + 22 + (rows - 1) * 16 : cy - 8;
    };
    const fitD = [2, 1, 0].find((d) => lastOf(d) <= by - 12);
    const dMax = fitD ?? 2;
    if (this.dKey !== N.id) { this.dKey = N.id; this.dsc.reset(); }
    this.detailRect = fitD !== undefined ? null : R;
    const LH = fitD !== undefined ? by - 4 - top : Math.ceil(lastOf(2) + 8 - top);
    if (fitD === undefined) { this.dsc.setMax(LH - R.h); clipBegin(ctx, R); }
    const t0 = top - (fitD !== undefined ? 0 : this.dsc.y);
    this.txt.draw(ctx, 'detail', `${N.id}|${st.key}|${known ? 1 : 0}|${hero.level}|${this.m.rev}|${dMax}`, x + 4, t0, w - 8, LH, (g) => {
      let cy = t0 + 26;
      text(g, known ? A.name : '???', x + 18, cy, { size: 20, weight: 800, family: FONT.title, color: known ? PAL.bone : PAL.dim, ow: 3 });
      if (known) text(g, A.eng ?? '', x + w - 18, cy, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.dim });
      cy += 10;
      divider(g, x + 14, cy, w - 28, { color: kc });
      cy += 22;
      if (known) cy += para(g, A.desc ?? '', x + 18, cy, w - 36, { size: 13, color: PAL.text, max: dMax }) + 2;
      if (reason) { cy += para(g, reason, x + 18, cy, w - 36, { size: 12, color: '#e89090', weight: 700, lh: 1.5 }) + 4; }
      if (known && A.perk) {
        text(g, '직업 특성', x + 18, cy + 4, { size: 12, weight: 800, color: kc });
        cy += 22;
        cy += para(g, A.perk, x + 18, cy, w - 36, { size: 13, color: '#ffe0a8', weight: 700 }) + 2;
      }
      if (skill) {
        const lb = '비전 기술', lw = measure(g, lb, 12, 800) + 10;
        text(g, lb, x + 18, cy + 6, { size: 12, weight: 800, color: KIND_COLOR.hidden });
        text(g, ellipsize(g, skill.name, w - 36 - lw, 12, 700), x + 18 + lw, cy + 6, { size: 12, weight: 700, color: PAL.bone });
        cy += 20;
      }
      if (mods.length) {
        text(g, '능력치 보정', x + 18, cy + 4, { size: 12, weight: 800, color: PAL.gold });
        const cw = (w - 36) / 2;
        mods.forEach((md, i) => {
          const mx = x + 18 + (i % 2) * cw, my = cy + 22 + Math.floor(i / 2) * 16;
          text(g, ellipsize(g, md.text, cw - 6, 12, 700), mx, my, { size: 12, weight: 700, color: md.good ? PAL.good : PAL.bad, ow: 2 });
        });
      }
    });
    if (fitD === undefined) {
      clipEnd(ctx, R, this.dsc, 'rgba(12,6,16,0.95)');
      if (this.dsc.max > 0) scrollbar(ctx, x + w - 8, R.y + 2, R.h - 4, this.dsc, R.h);
      moreBelow(ctx, R.x + R.w / 2, R.y + R.h, this.dsc.y, this.dsc.max);
    }
    // 안내 (고정): 조건 셋 — 레벨 · 시련 · 2부 결말 (갖춘 조건은 보통 색, 아닌 것은 빨강)
    const T = own(TRIALS, A.trial) ? TRIALS[A.trial] : null;
    const tName = known ? T?.name ?? A.trial : `${T?.name?.split(' · ')[0] ?? '시련'} · ???`;
    const okLv = (hero.level ?? 1) >= A.reqLevel, okTr = !!hero.trials?.[A.trial]?.done, okP2 = p2Cleared(this.state);
    this.txt.draw(ctx, 'foot', `${N.id}|${known ? 1 : 0}|${okLv ? 1 : 0}${okTr ? 1 : 0}${okP2 ? 1 : 0}|${st.key}|${this.m.rev}`, x + 4, by - 12, w - 8, y + h - 4 - (by - 12), (g) => {
      divider(g, x + 14, by - 8, w - 28, { center: false, a: 0.4 });
      const parts = [[`Lv ${A.reqLevel}`, okLv], [`${tName} 통과`, okTr], ['2부 결말', okP2]];
      const sep = ' · ', sw = measure(g, sep, 12, 700), full = parts.reduce((s, [p]) => s + measure(g, p, 12, 700), 0) + sw * 2;
      const k = Math.min(1, (w - 36) / Math.max(1, full));   // 좁으면 가로로 눌러 넣는다 (maxWidth 와 같은 효과)
      let px = x + 18;
      parts.forEach(([p, ok], i) => {
        const pw = measure(g, p, 12, 700) * k;
        text(g, p, px, by + 8, { size: 12, weight: 700, color: ok ? PAL.text : PAL.bad, maxWidth: pw + 0.5 });
        px += pw;
        if (i < parts.length - 1) { text(g, sep, px, by + 8, { size: 12, weight: 700, color: PAL.dim, maxWidth: sw * k + 0.5 }); px += sw * k; }
      });
      text(g, '초월은 마을 성당에서 할 수 있습니다', x + 18, by + 26, { size: 11, weight: 600, color: st.key === 'ready' ? PAL.good : PAL.dim, maxWidth: w - 36 });
    });
  }
}
