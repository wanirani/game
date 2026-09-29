// 하드윈의 대장간: 강화(주문서 선택 · 확률/비용 · 다음 단계 미리보기 → 모루 위 단조 연출 → 성공/실패/파괴) · 무기·방어구 구매
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { text, button, bar, panel, FONT, COLORS, font } from '../../core/ui.js';
import { fmt, rand, clamp, TAU, ease, lerp, rgba } from '../../core/math.js';
import * as Shop from '../../data/shop.js';
import * as Items from '../../data/items.js';
import * as Enh from '../../game/enhance.js';
import { countItem } from '../../game/inventory.js';
import { drawIcon, drawSlot } from '../../render/icons.js';
import { CHARACTERS } from '../../data/characters.js';
import { SHOP_LINES } from '../../data/town.js';
import { ServiceScene, ScrollList, Modal, itemRow, drawItemDetail, baseOf, nameOf, makeInst, statsOf, statName, fmtStat, isEquippedAny, SLOT_LABEL, WTYPE_LABEL, EQUIP_KINDS, hitRect, openBuy, mergeLines, rarityColor, uiPanel, uiButton, uiHints, josa } from './common.js';
import { glow } from './facades.js';

const FAIL_TEXT = { keep: ['실패 시 단계 유지', '#b8b0a0'], down: ['실패 시 1단계 하락', '#ffa640'], destroy: ['실패 시 하락 · 파괴 위험', '#ff5a5a'] };
/**
 * 강화 패널 치수 (UI px). y0 = 머리글 아래 시작, chipY = 패널 아래 50 (주문서 칩 38),
 * 비용 칸 = chipY − costGap − costH, 글자 덩어리의 마지막 기준선 ≤ 비용 칸 − 8.
 * lvB: 단계 글자 기준선 (y0 기준), rateH: 확률 줄 시작 → 다음 글자 기준선, barY/barH: 확률 막대
 */
const ENH_M = {
  normal: { s: 60, pad: 14, hdrGap: 18, lvH: 34, lvB: 14, lvS: [30, 34], rowH: 18, gap: 8, rateS: 26, rateH: 46, barY: 22, barH: 9, partsH: 20, costH: 38, costGap: 8 },
  compact: { s: 48, pad: 12, hdrGap: 14, lvH: 26, lvB: 11, lvS: [24, 26], rowH: 16, gap: 6, rateS: 22, rateH: 40, barY: 18, barH: 8, partsH: 16, costH: 28, costGap: 4 },
};

/** 강화 미리보기 '전 → 후'. 반올림하면 같아 보이는 작은 오름(예: 18% → 18% ▲0.3%)은 소수 한 자리로 보여 준다 */
function statPair(k, a, b) {
  let x = fmtStat(k, a).replace('+', ''), y = fmtStat(k, b).replace('+', '');
  if (x === y && Math.abs((b ?? 0) - (a ?? 0)) > 0.05) {
    const u = x.endsWith('%') ? '%' : '';
    x = (Math.round((a ?? 0) * 10) / 10).toFixed(1) + u; y = (Math.round((b ?? 0) * 10) / 10).toFixed(1) + u;
  }
  return `${x} → ${y}`;
}

export class SmithScene extends ServiceScene {
  setup() {
    this.bgKey = 'bg/smith'; this.title = '하드윈의 대장간'; this.eng = 'HADWIN FORGE'; this.npcId = 'npc_hadwin';
    this.lines = mergeLines(SHOP_LINES.hadwin, Shop.SHOPKEEPERS?.npc_hadwin, { enhanceOk: 'ok', enhanceFail: 'fail', enhanceBreak: 'destroy', enhanceMax: 'max' });
    this.music = 'smith'; this.portraitGlow = '#ff7a2a'; this.emberColor = '#ff8a3a';
    this.tabs = [{ id: 'enh', label: '강화' }, { id: 'buy', label: '무기·방어구' }];
    this.list = this.addList(58);
    this.opt = { protect: false, bless: false };
    this.refresh();
    this.talk('hello');
  }
  onTab() { this.list.index = 0; this.list.scroll = this.list.target = 0; this.refresh(); }
  extraHints() { return this.tab === 0 ? [['alt', '보호'], ['alt2', '축복']] : []; }

  refresh(keepUid = null) {
    const st = this.state;
    if (this.tab === 0) {
      const hero = this.hero;
      const mine = new Set(Object.values(hero.equip || {}).filter(Boolean));
      this.entries = st.inventory.filter((it) => EQUIP_KINDS.has(baseOf(it)?.slot))
        .sort((a, b) => (mine.has(b.uid) - mine.has(a.uid)) || ((b.level ?? 0) - (a.level ?? 0)) || ((b.rarity ?? 0) - (a.rarity ?? 0)))
        .map((inst) => ({ inst, mine: mine.has(inst.uid), owner: isEquippedAny(st, inst.uid) }));
      if (keepUid) { const i = this.entries.findIndex((e) => e.inst.uid === keepUid); if (i >= 0) this.list.index = i; }
    } else {
      let stock = [];
      try { stock = Shop.smithStock(st.progress?.chapter ?? 0) || []; } catch (e) { console.error(e); }
      this.entries = stock.filter((s) => baseOf(s)).map((s) => {
        const inst = makeInst(s.baseId, { rarity: s.rarity ?? 0, affixes: [] });
        return inst ? { inst, price: s.price ?? 100, tag: s.tag, note: s.note } : null;
      }).filter(Boolean);
    }
    this.list.setCount(this.entries.length);
  }
  get cur() { return this.entries[this.list.index] ?? null; }
  info(inst) {
    try { return Enh.enhanceInfo(this.state, inst, this.opt); } catch (e) { console.error(e); return { maxed: true, reason: '강화 정보를 불러올 수 없다.' }; }
  }

  updateBody(dt) {
    const r = this.list.update(dt);
    if (this.list.moved) audio.sfx('menu_move', { vol: 0.6 });
    const id = this.tapId;
    if (this.tab === 0) {
      // 메뉴 의미 입력: 보조(A · 패드 Y) = 보호, 보조 2(C · 패드 LT) = 축복 — 패드 B(대시·취소)와 겹치지 않게
      if (input.pressed('alt')) this.toggle('protect');
      if (input.pressed('alt2')) this.toggle('bless');
      if (id === 'chip:protect') { this.toggle('protect'); return 'handled'; }
      if (id === 'chip:bless') { this.toggle('bless'); return 'handled'; }
    }
    if (id === 'act' && this.cur) { this.act(); return 'handled'; }
    if (r === 'confirm' && this.cur) this.act();
    return r;
  }
  toggle(k) {
    const id = k === 'protect' ? 'm_scroll_protect' : 'm_scroll_bless';
    if (!this.opt[k] && countItem(this.state, id) <= 0) { audio.sfx('menu_cancel'); this.game.toast(`${josa(Items.ITEMS[id]?.name ?? '주문서', '이', '가')} 없다.`, '#ff8a7a'); return; }
    this.opt[k] = !this.opt[k];
    audio.sfx(this.opt[k] ? 'menu_ok' : 'menu_cancel');
  }

  act() {
    const e = this.cur;
    if (!e) return;
    if (this.tab === 1) { openBuy(this, e); return; }
    const inf = this.info(e.inst);
    if (inf.maxed) { audio.sfx('menu_cancel'); this.talk(inf.invalid ? 'poor' : 'max'); this.game.toast(inf.reason ?? '더 이상 강화할 수 없다.', '#ffb040'); return; }
    if (inf.canAfford === false) { audio.sfx('menu_cancel'); this.talk('poor'); this.portraitShake = 6; this.game.toast(inf.reason ?? '재료가 부족하다.', '#ff8a7a'); return; }
    audio.sfx('menu_ok');
    const lines = [`${nameOf(e.inst)}`, `+${inf.level} → +${inf.next}   ·   성공 확률 ${Math.round(inf.rate)}%`];
    if (inf.onFail === 'destroy') lines.push(`※ 실패하면 ${inf.destroyChance}% 확률로 장비가 파괴됩니다!`);
    else if (inf.onFail === 'down') lines.push('※ 실패하면 강화 단계가 1 하락합니다.');
    if (inf.equippedBy) lines.push('※ 현재 장착 중인 장비입니다.');
    this.modal = new Modal({
      title: '강화하시겠습니까?', lines, width: 480,
      buttons: [{ label: '망치를 들어라!', value: 'ok', primary: inf.onFail !== 'destroy' }, { label: '그만두기', value: 'cancel', primary: inf.onFail === 'destroy' }],
      onResult: (res) => { if (res.value === 'ok') this.startForge(e.inst, inf); },
    });
  }

  // ───────────────────────── 단조 연출 ─────────────────────────
  startForge(inst, inf) {
    const snap = { ...inst, affixes: inst.affixes };
    let res;
    try { res = Enh.doEnhance(this.state, inst.uid, this.opt); } catch (err) { console.error(err); res = { ok: false, msg: '강화 중 문제가 생겼다.' }; }
    if (!res?.ok) { this.game.toast(res?.msg ?? '강화할 수 없다.', '#ff8a7a'); audio.sfx('menu_cancel'); return; }
    if (this.opt.protect && countItem(this.state, 'm_scroll_protect') <= 0) this.opt.protect = false;
    if (this.opt.bless && countItem(this.state, 'm_scroll_bless') <= 0) this.opt.bless = false;
    this.busy = { t: 0, inst: snap, res, rate: inf.rate, strikes: 0, revealed: false, shake: 0, flash: 0, shards: [], uid: inst.uid };
    this.lockTabs = true;
    audio.duck?.(0.5, 3);
    audio.sfx('charge_ready', { vol: 0.5 });
  }
  updateBusy(dt) {
    const B = this.busy, vw = this.vw, vh = this.vh;
    B.t += dt;
    B.shake = Math.max(0, B.shake - dt * 30); B.flash = Math.max(0, B.flash - dt * 3);
    // 흔들림 오프셋·확률 글자 깜박임은 여기서 뽑는다 (renderOver 에서 Math.random 을 쓰지 않는다 — R1-REQ-336, #218)
    B.sx = (Math.random() - 0.5) * B.shake; B.sy = (Math.random() - 0.5) * B.shake;
    B.flick = Math.random();
    const cx = vw / 2, ay = vh * 0.6;
    const hits = [0.62, 1.2, 1.72, 2.12];
    const REVEAL = 2.34;
    // 입력으로 빨리 감기 (첫 타격 이후)
    if (!B.revealed && B.strikes >= 1 && (input.pressed('confirm') || input.pointer.tapped)) { B.t = Math.max(B.t, REVEAL - 0.02); B.strikes = hits.length; }
    while (B.strikes < hits.length && B.t >= hits[B.strikes]) {
      const k = B.strikes;
      B.strikes++;
      audio.sfx('enhance_hit', { pitch: 0.85 + k * 0.12, vol: 0.8 + k * 0.1 });
      this.fx.burst('spark', cx - 20, ay - 64, 22 + k * 10, { speed: 380 + k * 80, color: k === 3 ? '#fff6d0' : '#ffc070' });
      this.fx.burst('ember', cx - 20, ay - 64, 10, { speed: 160 });
      this.fx.flash(cx - 20, ay - 70, { color: '#ffd080', size: 90 + k * 30, life: 0.12 });
      this.fx.ring(cx - 20, ay - 70, { color: '#ffb060', r0: 10, r1: 80 + k * 30, life: 0.25, width: 5 });
      B.shake = 6 + k * 3; B.flash = 0.25 + k * 0.08;
    }
    if (!B.revealed && B.t >= REVEAL) this.reveal();
    if (B.revealed && B.t > B.revealT + 0.9 && (input.pressed('confirm') || input.pressed('cancel') || input.pointer.tapped)) {
      audio.sfx('menu_ok');
      this.busy = null; this.lockTabs = false;
      this.refresh(B.res.destroyed ? null : B.uid);
      input.flush();
    }
  }
  reveal() {
    const B = this.busy, r = B.res, vw = this.vw, vh = this.vh;
    B.revealed = true; B.revealT = B.t;
    const cx = vw / 2, cy = vh * 0.6 - 80;
    if (r.success) {
      audio.sfx('enhance_success'); if ((r.after ?? 0) >= 10) audio.sfx('levelup', { vol: 0.7 });
      this.fx.burst('gold', cx, cy, 70, { speed: 420 });
      this.fx.burst('holy', cx, cy, 40, { speed: 320 });
      this.fx.ring(cx, cy, { color: '#ffe070', r0: 20, r1: 320, life: 0.8, width: 10 });
      this.fx.ring(cx, cy, { color: '#ffffff', r0: 10, r1: 180, life: 0.45, width: 6 });
      this.game.flash('#fff2b0', 0.55, 3);
      this.talk((r.after ?? 0) >= 15 ? 'max' : 'ok');
    } else if (r.destroyed) {
      audio.sfx('enhance_destroy'); audio.sfx('break_wall', { vol: 0.7 });
      if (r.replaced && r.msg) this.game.toast(r.msg, '#ffb040');
      this.game.flash('#ff1a30', 0.7, 2.2);
      this.fx.burst('shard', cx, cy, 40, { speed: 460, color: '#b8bcc8' });
      this.fx.burst('fire', cx, cy, 30, { speed: 240 });
      this.fx.burst('smoke', cx, cy, 16, { speed: 90 });
      for (let i = 0; i < 9; i++) B.shards.push({ x: 0, y: 0, vx: rand(-420, 420), vy: rand(-620, -180), r: rand(0, TAU), vr: rand(-12, 12), s: rand(0.5, 1), k: i });
      B.shake = 18;
      this.talk('destroy');
    } else {
      audio.sfx('enhance_fail');
      this.fx.burst('smoke', cx, cy, 22, { speed: 120 });
      this.fx.burst('dust', cx, cy, 16, { speed: 140 });
      B.shake = 10;
      this.talk('fail');
    }
  }

  // ───────────────────────── 그리기 ─────────────────────────
  renderBody(ctx, body) {
    const st = this.state;
    const lw = Math.round(body.w * 0.46);
    const lr = { x: body.x + 10, y: body.y, w: lw - 10, h: body.h };
    ctx.fillStyle = 'rgba(6,3,8,0.45)'; ctx.fillRect(body.x, body.y - 4, lw + 2, body.h + 8);
    this.list.draw(ctx, lr, (c, i, r, sel) => {
      const e = this.entries[i], b = baseOf(e.inst);
      const kind = [SLOT_LABEL[b.slot], b.wtype ? WTYPE_LABEL[b.wtype] : ''].filter(Boolean).join(' · ');
      if (this.tab === 0) {
        const lv = e.inst.level ?? 0;
        const own = e.owner && !e.mine ? `${CHARACTERS[e.owner]?.name?.split(' ')[0] ?? ''} 장착` : e.mine ? '장착 중' : '';
        itemRow(c, r, sel, e.inst, { right: lv >= 15 ? 'MAX' : `+${lv}`, rightColor: lv >= 10 ? '#ffb040' : lv > 0 ? '#ffe7a0' : '#8a7a64', sub: kind + (own ? `  ·  ${own}` : ''), badge: '' });
      } else itemRow(c, r, sel, e.inst, { right: fmt(e.price), rightColor: st.gold >= e.price ? '#ffd84a' : COLORS.bad, sub: kind + (b.lvReq ? `  ·  Lv.${b.lvReq}` : ''), badge: e.tag ?? '' });
    }, this.tab === 0 ? '강화할 장비가 없다.' : '진열된 물건이 없다.');
    const dr = { x: body.x + lw + 10, y: body.y, w: body.w - lw - 10, h: body.h - 60 };
    this.detailRect = dr;
    const e = this.cur;
    this.actRect = this.tz('act', { x: dr.x, y: dr.y + dr.h + 10, w: dr.w, h: 50 });
    if (this.tab === 1) {
      drawItemDetail(ctx, dr, e?.inst ?? null, { state: st, price: e ? e.price : null, priceLabel: '구매 가격', priceOk: e && st.gold >= e.price, note: e?.note, tag: e?.tag });
      const can = e && st.gold >= e.price;
      uiButton(ctx, this.actRect, e ? (can ? '구매하기' : '골드 부족') : '—', { selected: !!can, disabled: !e, size: 18 });
      return;
    }
    this.drawEnhanceDetail(ctx, dr, e?.inst ?? null);
  }

  /**
   * 강화 상세 패널. 위(머리글·단계·능력치 미리보기·확률·실패 규칙)와 아래(비용·주문서) 두 덩어리로 나누고,
   * 위 덩어리의 마지막 줄이 비용 칸 위에서 끝나도록 맞춘다 (ITEMS-P2 검수 #116: +11~+14 의 3능력치 장비에서 겹침):
   * 보통 크기로 능력치 줄(최대 3)이 다 들어가면 보통 크기, 아니면 촘촘한 크기, 그래도 모자라면 능력치 줄을 줄인다.
   * 기본 확률 내역 줄은 자리가 남을 때만.
   */
  drawEnhanceDetail(ctx, r, inst) {
    uiPanel(ctx, r.x, r.y, r.w, r.h, { corner: false });
    this.chipRects = {};
    if (!inst) { text(ctx, '강화할 장비를 고르세요', r.x + r.w / 2, r.y + r.h / 2, { size: 15, align: 'center', color: COLORS.dim }); uiButton(ctx, this.actRect, '—', { disabled: true }); return; }
    const st = this.state, inf = this.info(inst);
    const rc = rarityColor(inst.rarity);
    const L = inst.level ?? 0;
    // 능력치 미리보기
    let prev = [];
    if (!inf.maxed) {
      try {
        if (Enh.enhancePreview) prev = Enh.enhancePreview(inst, Items.itemStats) || [];
        else { const a = statsOf(inst), n = statsOf({ ...inst, level: L + 1 }); prev = Object.keys(n).map((k) => ({ stat: k, name: statName(k), from: a[k] ?? 0, to: n[k], diff: (n[k] ?? 0) - (a[k] ?? 0) })).filter((p) => Math.abs(p.diff) > 0.05); }
      } catch { prev = []; }
    }
    // 크기 고르기
    const want = Math.min(3, prev.length);
    const fit = (M, n, parts) => M.y0 + M.lvH + n * M.rowH + M.gap + M.rateH + (parts ? M.partsH : 0) <= M.limit;
    let M = null, nStats = want;
    for (const m of [ENH_M.normal, ENH_M.compact]) {
      const q = { ...m, y0: r.y + m.pad + m.s + m.hdrGap, chipY: r.y + r.h - 50 };
      q.cy = q.chipY - m.costGap - m.costH; q.limit = q.cy - 8;
      if (!M) M = q;
      if (fit(q, want, false)) { M = q; break; }
      M = q; // 촘촘한 크기로도 안 되면 아래에서 줄 수를 줄인다
    }
    while (nStats > 0 && !fit(M, nStats, false)) nStats--;
    const showParts = fit(M, nStats, true);
    // 머리글: 아이콘 · 이름 · 종류 (+ 오른쪽 끝에 +10/+15 보너스 표시)
    const s = M.s;
    drawSlot(ctx, r.x + 16, r.y + M.pad, s, inst);
    text(ctx, nameOf(inst), r.x + s + 30, r.y + M.pad + (s < 56 ? 20 : 24), { size: s < 56 ? 17 : 18, weight: 800, family: FONT.title, color: rc, maxWidth: r.w - s - 50 });
    const b = baseOf(inst);
    const ky = r.y + M.pad + (s < 56 ? 40 : 46);
    text(ctx, [SLOT_LABEL[b.slot], b.wtype ? WTYPE_LABEL[b.wtype] : ''].filter(Boolean).join(' · '), r.x + s + 30, ky, { size: 12, color: '#a89880' });
    let y = M.y0;
    if (inf.maxed) {
      text(ctx, inf.invalid ? '강화 불가' : '★ 최고 단계 +15 ★', r.x + r.w / 2, y + 12, { size: 22, weight: 900, family: FONT.num, color: '#ffb040', align: 'center' });
      text(ctx, inf.reason ?? '', r.x + r.w / 2, y + 40, { size: 13, align: 'center', color: '#b8a890', maxWidth: r.w - 30 });
      uiButton(ctx, this.actRect, '강화 불가', { disabled: true, size: 18 });
      return;
    }
    if (inf.next === 10 || inf.next === 15) text(ctx, inf.next === 15 ? '★ 극한 강화 보너스' : '★ +10 달성 보너스', r.x + r.w - 16, ky, { size: 11, weight: 800, color: '#ffb040', align: 'right' });
    // 단계 변화
    const mid = r.x + r.w / 2, lb = y + M.lvB;
    text(ctx, `+${L}`, mid - 54, lb, { size: M.lvS[0], weight: 900, family: FONT.num, color: L >= 10 ? '#ffb040' : '#efe4cf', align: 'center' });
    const ax = Math.sin(this.t * 4) * 3;
    text(ctx, '▶', mid + ax, lb - 4, { size: 18, color: COLORS.gold, align: 'center' });
    text(ctx, `+${inf.next}`, mid + 58, lb, { size: M.lvS[1], weight: 900, family: FONT.num, color: inf.next >= 10 ? '#ffd070' : '#fff4d8', align: 'center' });
    y += M.lvH;
    for (const p of prev.slice(0, nStats)) {
      text(ctx, statName(p.stat), r.x + 22, y + 4, { size: 13, color: '#d8ccb8', maxWidth: r.w * 0.36 });
      text(ctx, statPair(p.stat, p.from, p.to), r.x + r.w - 80, y + 4, { size: 13, weight: 800, family: FONT.num, color: '#fff', align: 'right' });
      text(ctx, `▲${fmtStat(p.stat, p.diff).replace('+', '')}`, r.x + r.w - 20, y + 4, { size: 12, weight: 800, color: COLORS.good, align: 'right' });
      y += M.rowH;
    }
    y += M.gap;
    // 성공 확률
    const rate = Math.round(inf.rate ?? 0);
    const rcol = rate >= 70 ? '#7ee07e' : rate >= 40 ? '#ffe070' : rate >= 20 ? '#ffa640' : '#ff5a5a';
    text(ctx, '성공 확률', r.x + 22, y + 10, { size: 14, weight: 700, color: '#c8b8a0' });
    text(ctx, `${rate}%`, r.x + r.w - 20, y + 14, { size: M.rateS, weight: 900, family: FONT.num, color: rcol, align: 'right' });
    bar(ctx, r.x + 22, y + M.barY, r.w - 44, M.barH, rate / 100, { color: rcol });
    y += M.rateH;
    if (showParts) {
      const parts = [`기본 ${inf.baseRate ?? rate}%`];
      if (inf.diffBonus) parts.push(`난이도 ${inf.diffBonus > 0 ? '+' : ''}${inf.diffBonus}%`);
      if (inf.pity) parts.push(`실패 보정 +${inf.pity}%`);
      if (inf.bless) parts.push(`축복 +${inf.bless}%`);
      text(ctx, parts.join(' · '), r.x + 22, y, { size: 11, color: '#9d8f80', maxWidth: r.w - 44 });
      y += M.partsH;
    }
    const [ft, fc] = FAIL_TEXT[inf.onFail] ?? FAIL_TEXT.keep;
    text(ctx, inf.protect ? '보호 주문서: 하락·파괴 방지' : inf.onFail === 'destroy' ? `${ft} (${inf.destroyChance}%)` : ft, r.x + 22, y, { size: 13, weight: 700, color: inf.protect ? '#8ac8ff' : fc, maxWidth: r.w - 44 });
    // 비용 (한 줄 칸: 금화 · 강화석 보유/필요)
    const cy = M.cy, ch = M.costH;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(r.x + 12, cy, r.w - 24, ch);
    drawIcon(ctx, 'coin', r.x + 32, cy + ch / 2, ch < 34 ? 18 : 20);
    const gOk = (st.gold ?? 0) >= (inf.gold ?? 0);
    text(ctx, fmt(inf.gold ?? 0), r.x + 48, cy + ch / 2 + 6, { size: ch < 34 ? 15 : 16, weight: 900, family: FONT.num, color: gOk ? '#ffd84a' : COLORS.bad });
    if (inf.stones) {
      const sb = Items.ITEMS[inf.stones.baseId];
      const sx = r.x + r.w * 0.48;
      const have = inf.stones.have ?? countItem(st, inf.stones.baseId);
      const sOk = have >= inf.stones.qty;
      const nm = `${inf.stones.name ?? sb?.name ?? '강화석'}`;
      drawIcon(ctx, sb?.icon ?? 'stone_1', sx, cy + ch / 2, ch < 34 ? 22 : 26);
      if (ch < 34) {
        const cnt = `${have} / ${inf.stones.qty}`;
        ctx.font = font(13, 900, FONT.num);
        const cw = ctx.measureText(cnt).width;
        text(ctx, cnt, r.x + r.w - 20, cy + ch / 2 + 5, { size: 13, weight: 900, family: FONT.num, color: sOk ? '#efe4cf' : COLORS.bad, align: 'right' });
        text(ctx, nm, sx + 16, cy + ch / 2 + 5, { size: 11, color: '#c8b8a0', maxWidth: Math.max(10, r.x + r.w - 26 - cw - sx - 16) });
      } else {
        text(ctx, nm, sx + 18, cy + 17, { size: 11, color: '#c8b8a0', maxWidth: r.x + r.w - sx - 30 });
        text(ctx, `${have} / ${inf.stones.qty}`, sx + 18, cy + 32, { size: 13, weight: 900, family: FONT.num, color: sOk ? '#efe4cf' : COLORS.bad });
      }
    }
    // 주문서 토글
    const chipY = M.chipY, cw = (r.w - 34) / 2;
    const chip = (key, x, id, label, applicable) => {
      const have = countItem(st, id);
      const on = this.opt[key] && have > 0;
      const rr = this.tz('chip:' + key, { x, y: chipY, w: cw, h: 38 });
      const g = ctx.createLinearGradient(0, rr.y, 0, rr.y + rr.h);
      g.addColorStop(0, on ? (key === 'protect' ? 'rgba(40,80,150,0.95)' : 'rgba(150,110,20,0.95)') : 'rgba(24,14,22,0.9)'); g.addColorStop(1, 'rgba(8,4,10,0.95)');
      ctx.fillStyle = g; ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
      ctx.strokeStyle = on ? '#ffe7a0' : have ? 'rgba(160,130,80,0.8)' : 'rgba(80,60,50,0.6)'; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(rr.x + 0.5, rr.y + 0.5, rr.w - 1, rr.h - 1);
      drawIcon(ctx, key === 'protect' ? 'scroll_protect' : 'scroll_bless', rr.x + 18, rr.y + 19, 24);
      ctx.globalAlpha = have ? 1 : 0.45;
      text(ctx, label, rr.x + 34, rr.y + 17, { size: 12, weight: 800, color: on ? '#fff' : '#d8ccb8', maxWidth: rr.w - 40 });
      text(ctx, `${on ? '사용' : '미사용'} · ${have}장${!applicable ? ' (불필요)' : ''}`, rr.x + 34, rr.y + 32, { size: 11, color: on ? '#ffe7a0' : '#9d8f80', maxWidth: rr.w - 40 });
      ctx.globalAlpha = 1;
      this.chipRects[key] = rr;
    };
    chip('protect', r.x + 12, 'm_scroll_protect', '보호 주문서', (inf.baseFail ?? inf.onFail) !== 'keep');
    chip('bless', r.x + 22 + cw, 'm_scroll_bless', '축복 주문서', true);
    const can = inf.canAfford !== false;
    uiButton(ctx, this.actRect, can ? `강화하기  (+${inf.next})` : '재료 부족', { selected: can, size: 18, sub: can ? undefined : (inf.reason ?? '') });
  }

  renderOver(ctx, L) {
    const B = this.busy;
    if (!B) return;
    const { vw, vh } = L;
    const t = B.t, r = B.res;
    const sx = B.sx || 0, sy = B.sy || 0;
    ctx.save();
    // 암전 + 화덕 빛
    ctx.fillStyle = `rgba(3,1,4,${Math.min(0.93, t * 3)})`; ctx.fillRect(0, 0, vw, vh);
    ctx.translate(sx, sy);
    const cx = vw / 2, ay = vh * 0.6;
    const heat = B.revealed ? Math.max(0, 1 - (t - B.revealT) * 1.5) : clamp(t / 2.3, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, cx, ay - 20, 260 + heat * 120, '#ff5a1a', 0.25 + heat * 0.35);
    // 긴장감: 회전하는 룬 고리
    if (!B.revealed) {
      ctx.save(); ctx.translate(cx, ay - 40); ctx.rotate(t * (1 + t * 2));
      ctx.strokeStyle = `rgba(255,170,80,${0.25 + heat * 0.4})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 150 - heat * 30, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.fillStyle = `rgba(255,200,120,${0.35 + heat * 0.4})`; ctx.fillRect(-2, -150 + heat * 30 - 6, 4, 12); }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    // 모루
    drawAnvil(ctx, cx, ay, heat);
    // 달궈진 장비 (또는 결과)
    const iy = ay - 80;
    if (!B.revealed || !r.destroyed) {
      const pulse = 1 + (B.revealed && r.success ? ease.outBack(Math.min(1, (t - B.revealT) * 3)) * 0.25 : 0);
      const size = 88 * pulse;
      if (B.revealed && r.success) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.translate(cx, iy); ctx.rotate(t * 0.5);
        const rg = ctx.createRadialGradient(0, 0, 10, 0, 0, 340);
        rg.addColorStop(0, 'rgba(255,230,140,0.5)'); rg.addColorStop(0.4, 'rgba(255,200,90,0.14)'); rg.addColorStop(1, 'rgba(255,180,60,0)');
        ctx.fillStyle = rg;
        for (let i = 0; i < 14; i++) { ctx.rotate(TAU / 14); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18 - (i % 2) * 14, -340); ctx.lineTo(18 + (i % 2) * 14, -340); ctx.fill(); }
        ctx.restore();
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, iy, 150, '#ffe070', 0.6); ctx.globalCompositeOperation = 'source-over';
      }
      const shownInst = B.revealed ? { ...B.inst, level: Math.max(0, r.after ?? B.inst.level) } : B.inst;
      drawIcon(ctx, shownInst.icon, cx, iy, size, shownInst);
      if (!B.revealed || r.success) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, cx, iy, size * 0.8, '#ff7a2a', heat * 0.7);
        glow(ctx, cx, iy, size * 0.4, '#ffe0a0', heat * 0.5);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (B.revealed && !r.success) {
        // 균열
        ctx.strokeStyle = 'rgba(20,6,6,0.9)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx - 30, iy - 26); ctx.lineTo(cx - 6, iy - 4); ctx.lineTo(cx - 14, iy + 12); ctx.lineTo(cx + 10, iy + 34); ctx.moveTo(cx - 6, iy - 4); ctx.lineTo(cx + 24, iy - 14); ctx.stroke();
        ctx.fillStyle = 'rgba(40,40,50,0.35)'; ctx.fillRect(cx - size / 2, iy - size / 2, size, size);
      }
    } else {
      // 파괴: 파편
      const dt = t - B.revealT;
      for (const s of B.shards) {
        const x = cx + s.vx * dt, y = iy + s.vy * dt + 900 * dt * dt;
        ctx.save(); ctx.translate(x, y); ctx.rotate(s.r + s.vr * dt); ctx.globalAlpha = clamp(1.6 - dt, 0, 1);
        ctx.fillStyle = s.k % 2 ? '#c8ccd8' : '#6a6e7a';
        ctx.beginPath(); ctx.moveTo(-10 * s.s, -14 * s.s); ctx.lineTo(12 * s.s, -4 * s.s); ctx.lineTo(4 * s.s, 14 * s.s); ctx.lineTo(-8 * s.s, 6 * s.s); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#1a0a0a'; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    // 망치
    if (!B.revealed) drawHammer(ctx, cx, ay, t, [0.62, 1.2, 1.72, 2.12]);
    // 확률 / 결과 텍스트
    if (!B.revealed) {
      text(ctx, nameOf(B.inst), cx, vh * 0.14, { size: 20, weight: 800, family: FONT.title, color: rarityColor(B.inst.rarity), align: 'center', ow: 4 });
      text(ctx, `+${B.inst.level ?? 0}  ▶  +${(B.inst.level ?? 0) + 1}`, cx, vh * 0.14 + 34, { size: 22, weight: 900, family: FONT.num, color: '#fff4d8', align: 'center', ow: 4 });
      const fl = 0.6 + (B.flick ?? 0.5) * 0.4 * heat;
      ctx.globalAlpha = fl;
      text(ctx, `성공 확률 ${Math.round(B.rate)}%`, cx, vh * 0.14 + 62, { size: 15, weight: 800, color: '#ffc070', align: 'center', ow: 3 });
      ctx.globalAlpha = 1;
      if (B.strikes >= 1) uiHints(ctx, [['confirm', '빨리 감기']], cx, vh - 12);
    } else {
      const k = ease.outBack(Math.min(1, (t - B.revealT) * 3.5));
      ctx.save(); ctx.translate(cx, vh * 0.2); ctx.scale(k, k);
      if (r.success) {
        text(ctx, `+${r.after}`, 0, 12, { size: 64, weight: 900, family: FONT.logo, color: (r.after ?? 0) >= 10 ? '#ffb040' : '#ffe070', align: 'center', ow: 7, outline: '#3a1800' });
        text(ctx, (r.after ?? 0) >= 15 ? '극한 강화 달성!' : (r.after ?? 0) === 10 ? '+10 돌파!' : '강화 성공!', 0, 52, { size: 26, weight: 900, family: FONT.title, color: '#fff4d8', align: 'center', ow: 5 });
      } else if (r.destroyed) {
        text(ctx, '파괴', 0, 10, { size: 60, weight: 900, family: FONT.title, color: '#ff3a4a', align: 'center', ow: 7, outline: '#200000' });
        text(ctx, '장비가 산산조각 났다…', 0, 48, { size: 20, weight: 800, color: '#ffb0b0', align: 'center', ow: 4 });
      } else {
        text(ctx, '강화 실패', 0, 10, { size: 50, weight: 900, family: FONT.title, color: '#c8c0c8', align: 'center', ow: 6 });
        const dn = (r.after ?? 0) < (r.before ?? 0);
        text(ctx, dn ? `+${r.before} → +${r.after}  단계 하락` : r.protected ? '보호 주문서가 장비를 지켰다' : '단계는 유지되었다', 0, 46, { size: 18, weight: 800, color: dn ? '#ff8a6a' : '#8ac8ff', align: 'center', ow: 4 });
      }
      ctx.restore();
      if (t - B.revealT > 0.9 && Math.floor(t * 2.5) % 2 === 0) {
        if (input.touchMode) text(ctx, '화면을 눌러 계속', cx, vh - 18, { size: 13, align: 'center', color: '#c8b8a0' });
        else uiHints(ctx, [['confirm', '계속']], cx, vh - 18);
      }
    }
    if (B.flash > 0) { ctx.fillStyle = `rgba(255,230,180,${B.flash})`; ctx.fillRect(-20, -20, vw + 40, vh + 40); }
    ctx.restore();
  }
}

// ───────────────────────── 모루 · 망치 (절차적) ─────────────────────────
function drawAnvil(ctx, cx, y, heat) {
  ctx.save();
  // 받침 나무 그루터기
  const g0 = ctx.createLinearGradient(cx - 70, 0, cx + 70, 0);
  g0.addColorStop(0, '#2a1a10'); g0.addColorStop(0.5, '#4a3020'); g0.addColorStop(1, '#1a0e08');
  ctx.fillStyle = g0; ctx.fillRect(cx - 70, y + 40, 140, 120);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(cx - 60 + i * 24, y + 44); ctx.lineTo(cx - 64 + i * 24, y + 160); ctx.stroke(); }
  // 모루 몸체
  ctx.beginPath();
  ctx.moveTo(cx - 190, y - 30); ctx.quadraticCurveTo(cx - 120, y - 32, cx - 100, y - 36);
  ctx.lineTo(cx + 120, y - 36); ctx.lineTo(cx + 130, y - 8); ctx.lineTo(cx + 70, y + 2);
  ctx.quadraticCurveTo(cx + 50, y + 16, cx + 60, y + 42); ctx.lineTo(cx + 90, y + 50); ctx.lineTo(cx - 90, y + 50); ctx.lineTo(cx - 60, y + 42);
  ctx.quadraticCurveTo(cx - 50, y + 16, cx - 70, y + 2); ctx.quadraticCurveTo(cx - 140, y - 4, cx - 190, y - 30);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, y - 40, 0, y + 50);
  g.addColorStop(0, '#6a6878'); g.addColorStop(0.15, '#3a3844'); g.addColorStop(1, '#141218');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#050305'; ctx.lineWidth = 3; ctx.stroke();
  // 윗면 반사 (열기)
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,${140 + heat * 60},60,${0.18 + heat * 0.4})`; ctx.fillRect(cx - 100, y - 36, 220, 4);
  ctx.fillStyle = 'rgba(169,194,255,0.35)'; ctx.fillRect(cx + 118, y - 34, 2, 26);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
function drawHammer(ctx, cx, ay, t, hits) {
  // 다음 타격까지의 진행: 들어올림(ease) → 내려침(가속)
  let prev = 0, next = hits[0];
  for (let i = 0; i < hits.length; i++) { if (t < hits[i]) { next = hits[i]; prev = i ? hits[i - 1] : 0; break; } prev = hits[i]; next = hits[i] + 0.6; }
  const u = clamp((t - prev) / (next - prev), 0, 1);
  const up = u < 0.7 ? ease.outCubic(u / 0.7) : 1 - ease.inCubic((u - 0.7) / 0.3);
  const recoil = t - prev < 0.08 && prev > 0 ? (1 - (t - prev) / 0.08) * 0.12 : 0;
  const ang = lerp(0.03, 1.15, up) + recoil;
  const px = cx + 250, py = ay - 92;
  ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
  // 자루
  const hg = ctx.createLinearGradient(0, -8, 0, 8); hg.addColorStop(0, '#8a5a34'); hg.addColorStop(1, '#3a2012');
  ctx.fillStyle = hg; ctx.fillRect(-250, -7, 250, 14);
  ctx.strokeStyle = '#140a04'; ctx.lineWidth = 2; ctx.strokeRect(-250, -7, 250, 14);
  // 머리
  const mg = ctx.createLinearGradient(0, -36, 0, 36); mg.addColorStop(0, '#8a8898'); mg.addColorStop(0.5, '#4a4856'); mg.addColorStop(1, '#1a1820');
  ctx.fillStyle = mg; ctx.fillRect(-300, -34, 70, 68);
  ctx.strokeStyle = '#050305'; ctx.lineWidth = 3; ctx.strokeRect(-300, -34, 70, 68);
  ctx.fillStyle = 'rgba(169,194,255,0.4)'; ctx.fillRect(-298, -32, 66, 3);
  ctx.fillStyle = 'rgba(255,150,60,0.35)'; ctx.fillRect(-300, 28, 70, 6);
  ctx.restore();
}
