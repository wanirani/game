// 직업 탭: 캐릭터의 직업 계보(기본 → 1차 2갈래 → 2차 4갈래) · 현재 경로 강조 · 요구 조건 · 특성/보정치 · 직업 외형 미리보기
// 전직 자체는 마을 성당(알베르토 신부)에서 한다 → 안내만 표시
// 미리보기는 턴테이블 (hero_view.js): 직업을 바꿔 골라도 돌려 둔 각도가 유지되어 같은 방향에서 직업 외형을 비교할 수 있다.
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp, rgba } from '../../core/math.js';
import * as HERO from '../../render/hero.js';
import * as PUP from '../../render/hero_puppet.js';
import * as ProgM from '../../game/progression.js';
import { Tab } from './base.js';
import { HeroView, HeroStage, PixLayer, PixCache, pedestal, accentOf, turntableHints, pxScale } from './hero_view.js';
import { PAL, frame, heading, divider, brackets, glow, glowOval, pill, para, rr, glyph, ellipsize, measure } from './common.js';
import { fmtStatVal } from './tab_status.js';
import * as D from './access.js';

const TIER_NAME = ['기본 직업', '1차 전직', '2차 전직'];

export class ClassTab extends Tab {
  constructor(m) {
    super(m);
    this.view = new HeroView({ turntable: true, game: m.game });
    this.stage = new HeroStage();
    this.txt = new PixCache(24);    // 카드·상세 글자 캐시 (외곽선 글자는 매 프레임 그리기에 너무 비싸다 — P-11)
    this.bg = new PixLayer();       // 두 판의 틀 (그라디언트) — 한 장으로 구워 1:1 복사
    this.heroRect = null;
    this.sel = null; this.rects = []; this.thumbs = new Map(); this.looks = new Map(); this.rev = -1;
  }
  /** 메뉴의 가로 밀기(탭 넘기기)를 무시할 곳: 회전 무대 (platform §5.6) */
  noSwipe(x, y) { return this.view.swipeBlock(x, y); }
  swipeBlock(x, y) { return this.view.swipeBlock(x, y); }
  free() { this.stage.free(); this.txt.free(); this.bg.free(); this.dropThumbs(); }
  dropThumbs() { for (const T of this.thumbs.values()) { T.cv.width = T.cv.height = 1; } this.thumbs.clear(); }
  get chain() { return D.classChain(this.hero.classId).map((c) => c.id); }
  tiers() {
    const all = Object.values(D.CLASSES()).filter((c) => c.charId === this.hero.charId);
    const t0 = all.filter((c) => c.tier === 0);
    const t1 = t0.flatMap((c) => (c.next || []).map((id) => D.CLASSES()[id]).filter(Boolean));
    const t2 = t1.flatMap((c) => (c.next || []).map((id) => D.CLASSES()[id]).filter(Boolean));
    return [t0, t1, t2];
  }
  onShow() { if (!this.sel) this.sel = this.hero.classId; this.view.wake(); }
  /** 탭을 떠날 때: 끌기·누름·회전을 끝낸다 (돌아왔을 때 옛 끌기가 관성으로 튀지 않게) */
  onHide() { this.view.sleep(); }
  lookFor(cid) {
    if (this.rev !== this.m.rev) { this.rev = this.m.rev; this.looks.clear(); this.dropThumbs(); }
    let L = this.looks.get(cid);
    if (!L) {
      const hero = this.hero, keep = hero.classId;
      hero.classId = cid;
      try { L = D.composeLook(this.state, hero); } catch (e) { L = null; } finally { hero.classId = keep; }
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
    if (!T) { T = { cv: document.createElement('canvas'), key: null }; this.thumbs.set(cid, T); }
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

  update(dt, nav, ges, focused) {
    if (!this.sel) this.sel = this.hero.classId;
    this.view.control(dt, ges);     // 턴테이블 (포커스와 무관: 끌기·휠·, . /·오른쪽 스틱·R3·무대 탭 = 시연)
    this.view.update(dt);
    for (const r of this.rects) {
      if (ges.hoverIn(r) && this.sel !== r.id) { this.sel = r.id; }
      if (ges.tap(r)) { this.m.focus = 'content'; if (this.sel !== r.id) audio.sfx('menu_move'); else this.view.showcase(); this.sel = r.id; return; }
    }
    if (!focused) return;
    const T = this.tiers();
    const cur = D.CLASSES()[this.sel];
    if (!cur) { this.sel = this.hero.classId; return; }
    const tier = T[cur.tier] || [];
    const i = tier.findIndex((c) => c.id === this.sel);
    const go = (id) => { if (id && id !== this.sel) { this.sel = id; audio.sfx('menu_move'); } };
    if (nav.up) { if (i > 0) go(tier[i - 1].id); else { this.m.focusTabs(); return; } }
    if (nav.down && i < tier.length - 1) go(tier[i + 1].id);
    if (nav.right) {
      const kids = (cur.next || []).filter((id) => D.CLASSES()[id]);
      const pick = kids.find((id) => this.chain.includes(id)) || kids[0];
      go(pick);
    }
    if (nav.left && cur.parent) go(cur.parent);
    if (nav.confirm) this.view.showcase();
    if (nav.cancel) this.m.close();
  }
  hints() { return [['↑↓←→', '직업 선택', '직업 카드를 터치해 자세히 보기'], ['Z', '동작 보기'], ...turntableHints(this.view)]; }

  render(ctx, A) {
    if (!this.sel) this.sel = this.hero.classId;
    const t = this.t, focused = this.m.focus === 'content';
    const DW = Math.round(clamp(A.w * 0.35, 300, 380));
    const TW = A.w - DW - 12;
    // 두 판의 틀 (정적)
    this.bg.draw(ctx, `${TW}`, A.x - 3, A.y - 3, A.w + 6, A.h + 6, (c) => {
      frame(c, A.x, A.y, TW, A.h);
      frame(c, A.x + TW + 12, A.y, DW, A.h);
    });
    const ch = D.CHARACTERS()[this.hero.charId];
    const T = this.tiers();
    const chain = this.chain;
    // 카드 배치
    // 카드 높이: 2차 전직 4장이 겹치지 않게 (낮은 화면에서는 줄인다)
    const cardW = Math.min(188, (TW - 40 - 2 * 26) / 3), cardH = Math.round(clamp((A.h - 64 - 3 * 6) / 4, 50, 76));
    const colX = [A.x + 16, A.x + 16 + cardW + 26, A.x + 16 + 2 * (cardW + 26)];
    const top = A.y + 44, ctop = top + 10, H = A.h - 64;
    const pos = new Map();
    T.forEach((list, ti) => {
      const n = list.length;
      const gap = n > 1 ? Math.min(18, (H - n * cardH) / (n - 1)) : 0;
      const total = n * cardH + (n - 1) * gap;
      list.forEach((c, k) => pos.set(c.id, { x: colX[ti], y: ctop + (H - total) / 2 + k * (cardH + gap) }));
    });
    // 제목 + 티어 제목 (글자 캐시)
    this.txt.draw(ctx, 'head', `${this.hero.charId}|${cardW}`, A.x + 4, A.y + 4, TW - 8, top + 12 - A.y, (c) => {
      heading(c, '직업 계보', A.x + 16, A.y + 26, TW - 32, { sub: ch?.name?.split(' ')[0] });
      TIER_NAME.forEach((nm, ti) => text(c, nm, colX[ti] + cardW / 2, top + 4, { size: 11, align: 'center', weight: 700, color: PAL.faint, ow: 2 }));
    });
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
    // 카드
    this.rects.length = 0;
    for (const list of T) for (const c of list) {
      const p = pos.get(c.id);
      const r = { x: p.x, y: p.y, w: cardW, h: cardH, id: c.id };
      this.rects.push(r);
      this.m.ges?.zone?.(r, 'list', { src: 'class.card' });
      this.drawCard(ctx, c, r, t, focused);
    }
    // 상세
    this.drawDetail(ctx, A.x + TW + 12, A.y, DW, A.h);
    this.txt.sweep();
  }

  drawCard(ctx, c, r, t, focused) {
    const st = this.status(c);
    const sel = this.sel === c.id;
    const look = this.lookFor(c.id);
    const acc = accentOf(look);
    if (st.key === 'cur') glowOval(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.7, r.h * 0.9, '#ff3050', 0.25 + 0.08 * Math.sin(t * 3));
    if (st.key === 'ready') glowOval(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.7, r.h * 0.9, '#60ff90', 0.18 + 0.1 * Math.sin(t * 5));
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    const on = st.key === 'cur' || st.key === 'done';
    g.addColorStop(0, on ? 'rgba(70,16,32,0.96)' : 'rgba(30,18,30,0.94)'); g.addColorStop(1, 'rgba(8,4,10,0.96)');
    rr(ctx, r.x, r.y, r.w, r.h, 6); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = sel ? PAL.goldHi : st.key === 'cur' ? PAL.gold : st.key === 'done' ? PAL.goldMid : st.key === 'ready' ? '#6ad08a' : '#3e3036';
    ctx.lineWidth = sel || st.key === 'cur' ? 2 : 1.2; ctx.stroke();
    // 썸네일
    const tw = 54, th = r.h - 8;
    ctx.save();
    rr(ctx, r.x + 4, r.y + 4, tw, th, 4); ctx.clip();
    const bg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    bg.addColorStop(0, rgba(acc, 0.22)); bg.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = bg; ctx.fillRect(r.x + 4, r.y + 4, tw, th);
    const img = this.thumb(c.id, tw, th + 8, ctx);
    ctx.globalAlpha *= st.key === 'closed' ? 0.35 : st.key === 'locked' ? 0.7 : 1;
    ctx.imageSmoothingQuality = 'medium';   // 거의 1:1 복사 — 'high' 필터는 비싸기만 하다 (P-11)
    ctx.drawImage(img, 0, 0, img.width, img.height, r.x + 4, r.y, tw, th + 8);
    ctx.restore();
    const tx = r.x + tw + 12, w = r.w - tw - 18;
    // 카드 글자·표식은 캐시 (선택·상태가 바뀔 때만 다시 굽는다)
    this.txt.draw(ctx, 'card:' + c.id, `${sel ? 1 : 0}|${st.key}|${st.text}|${this.m.rev}`, tx - 4, r.y + 1, r.x + r.w - tx + 3, r.h - 2, (g) => {
      const iconW = st.key === 'locked' || st.key === 'closed' || st.key === 'cur' ? 16 : 0;
      const nsz = measure(g, c.name, 14, 800) <= w - iconW ? 14 : 12.5;
      text(g, ellipsize(g, c.name, w - iconW, nsz, 800), tx, r.y + Math.round(r.h * 0.32), { size: nsz, weight: 800, color: st.key === 'closed' ? PAL.faint : sel ? PAL.goldHi : PAL.bone, ow: 3 });
      text(g, c.eng ?? '', tx, r.y + Math.round(r.h * 0.53), { size: 10, weight: 700, family: FONT.num, color: PAL.dim, ow: 2, maxWidth: w });
      text(g, st.text, tx, r.y + r.h - (r.h >= 70 ? 12 : 9), { size: 11, weight: 800, color: st.color, ow: 2 });
      if (st.key === 'locked' || st.key === 'closed') glyph(g, 'lock', r.x + r.w - 14, r.y + 14, 10, PAL.faint, 1.3);
      if (st.key === 'cur') glyph(g, 'star', r.x + r.w - 14, r.y + 14, 11, PAL.goldHi, 1);
    });
    if (sel) brackets(ctx, r.x, r.y, r.w, r.h, t, focused ? PAL.goldHi : PAL.goldMid);
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
    pill(ctx, TIER_NAME[c.tier] ?? '', x + 16, y + 16, { color: PAL.gold, size: 10, h: 17 });
    pill(ctx, st.text, x + w - 16, y + 16, { align: 'right', color: st.color, size: 10, h: 17, bg: st.key === 'ready' ? 'rgba(20,70,40,0.9)' : 'rgba(40,20,30,0.9)' });
    // 이름·설명·특성·보정치·안내 글자는 캐시 (고른 직업·상태·레벨이 바뀔 때만 다시 굽는다)
    this.txt.draw(ctx, 'detail', `${c.id}|${st.key}|${this.hero.level}|${this.m.rev}`, x + 4, y + sh + 10, w - 8, h - sh - 14, (g) => {
      let cy = y + sh + 36;
      text(g, c.name, x + 18, cy, { size: 20, weight: 800, family: FONT.title, color: PAL.bone, ow: 3 });
      text(g, c.eng ?? '', x + w - 18, cy, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.dim });
      cy += 10;
      divider(g, x + 14, cy, w - 28);
      cy += 22;
      cy += para(g, c.desc ?? '', x + 18, cy, w - 36, { size: 13, color: PAL.text, max: 2 }) + 2;
      if (c.perk) {
        text(g, '직업 특성', x + 18, cy + 4, { size: 12, weight: 800, color: PAL.gold });
        cy += 22;
        cy += para(g, c.perk, x + 18, cy, w - 36, { size: 13, color: '#ffe0a8', weight: 700, max: 2 }) + 2;
      }
      // 해금되는 스킬 계열
      const unlocks = [];
      for (const br of D.TREE(this.hero.charId)?.branches || []) {
        const gi = (br.gate || []).indexOf(c.id);
        if (gi >= 0) unlocks.push(`「${br.name}」 ${['3·4단', '5단', '6단'][gi] ?? ''}`);
      }
      if (unlocks.length) {
        text(g, '스킬 해금', x + 18, cy + 6, { size: 12, weight: 800, color: '#9ac8ff' });
        text(g, ellipsize(g, unlocks.join(' · '), w - 110, 12, 700), x + 84, cy + 6, { size: 12, weight: 700, color: PAL.bone });
        cy += 20;
      }
      // 보정치
      const mods = [];
      for (const k in c.mult || {}) mods.push({ text: `${D.STAT_INFO[k]?.name ?? k} ×${c.mult[k]}`, good: c.mult[k] >= 1 });
      for (const k in c.flat || {}) mods.push({ text: `${D.STAT_INFO[k]?.name ?? k} +${fmtStatVal(k, c.flat[k])}`, good: c.flat[k] >= 0 });
      if (mods.length) {
        text(g, '능력치 보정', x + 18, cy + 4, { size: 12, weight: 800, color: PAL.gold });
        cy += 10;
        const cw = (w - 36) / 2;
        mods.slice(0, 8).forEach((md, i) => {
          const mx = x + 18 + (i % 2) * cw, my = cy + 18 + Math.floor(i / 2) * 18;
          if (my > y + h - 52) return;
          text(g, ellipsize(g, md.text, cw - 6, 12, 700), mx, my, { size: 12, weight: 700, color: md.good ? PAL.good : PAL.bad, ow: 2 });
        });
        cy += 18 + Math.ceil(Math.min(8, mods.length) / 2) * 18;
      }
      // 안내
      const parent = D.CLASSES()[c.parent];
      const req = c.tier === 0 ? '처음부터 익힌 직업' : `Lv ${c.reqLevel} · ${parent?.name ?? ''}에서 전직`;
      const by = y + h - 40;
      divider(g, x + 14, by - 8, w - 28, { center: false, a: 0.4 });
      text(g, req, x + 18, by + 8, { size: 12, weight: 700, color: this.hero.level >= (c.reqLevel ?? 1) ? PAL.text : PAL.bad });
      text(g, st.key === 'ready' ? '마을 성당의 알베르토 신부를 찾아가 전직하세요' : '전직은 마을 성당(알베르토 신부)에서 할 수 있습니다', x + 18, by + 26, { size: 11, weight: 600, color: st.key === 'ready' ? PAL.good : PAL.dim, maxWidth: w - 36 });
    });
  }
}
