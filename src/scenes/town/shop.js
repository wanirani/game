// 로크의 잡화점: 구매(챕터별 재고) / 판매(가방) — 수량 선택, 상세 정보(장착 비교), 골드 연출
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { text, button, FONT, COLORS } from '../../core/ui.js';
import { fmt, rand } from '../../core/math.js';
import * as Shop from '../../data/shop.js';
import { addItem, removeItem, countItem } from '../../game/inventory.js';
import { SHOP_LINES } from '../../data/town.js';
import {
  ServiceScene, ScrollList, Modal, itemRow, drawItemDetail, baseOf, nameOf, makeInst, sellPriceOf,
  isEquippedAny, SLOT_LABEL, WTYPE_LABEL, EQUIP_KINDS, hitRect,
} from './common.js';

export class ShopScene extends ServiceScene {
  setup() {
    this.bgKey = 'bg/shop'; this.title = '로크의 잡화점'; this.eng = "ROOK'S CURIOS"; this.npcId = 'npc_rook';
    this.lines = SHOP_LINES.rook; this.music = 'shop'; this.portraitGlow = '#ffb45a';
    this.tabs = [{ id: 'buy', label: '구매' }, { id: 'sell', label: '판매' }];
    this.list = new ScrollList(58);
    this.refresh();
    this.talk('hello');
  }
  onClose() { this.talk('bye'); }
  onTab() { this.list.index = 0; this.list.scroll = this.list.target = 0; this.refresh(); }

  refresh() {
    const st = this.state;
    if (this.tab === 0) {
      let stock = [];
      try { stock = Shop.shopStock(st.progress?.chapter ?? 0) || []; } catch (e) { console.error(e); }
      this.entries = stock.filter((s) => baseOf(s)).map((s) => {
        const inst = makeInst(s.baseId, { rarity: s.rarity ?? 0 });
        return inst ? { inst, price: s.price ?? baseOf(s).price ?? 10 } : null;
      }).filter(Boolean);
    } else {
      this.entries = st.inventory
        .filter((it) => { const b = baseOf(it); return b && b.slot !== 'key' && !b.relic && !b.unique && !it.locked && !isEquippedAny(st, it.uid); })
        .sort((a, b) => (EQUIP_KINDS.has(baseOf(b).slot) - EQUIP_KINDS.has(baseOf(a).slot)) || ((b.rarity ?? 0) - (a.rarity ?? 0)) || ((b.level ?? 0) - (a.level ?? 0)))
        .map((inst) => ({ inst, price: sellPriceOf(inst) }));
    }
    this.list.setCount(this.entries.length);
  }

  get cur() { return this.entries[this.list.index] ?? null; }

  updateBody(dt) {
    const r = this.list.update(dt);
    if (this.list.moved) audio.sfx('menu_move', { vol: 0.6 });
    if (input.pointer.tapped && this.actRect && hitRect(this.actRect) && this.cur) { this.act(); return 'handled'; }
    if (r === 'confirm' && this.cur) this.act();
    return r;
  }

  act() {
    const e = this.cur, st = this.state;
    if (!e) return;
    const b = baseOf(e.inst);
    if (this.tab === 0) {
      if ((st.gold ?? 0) < e.price) { audio.sfx('menu_cancel'); this.talk('poor'); this.portraitShake = 6; return; }
      audio.sfx('menu_ok');
      if (b.stack) {
        const room = Math.max(0, (b.stack ?? 99) - countItem(st, b.id));
        const max = Math.max(1, Math.min(room, Math.floor(st.gold / e.price), 99));
        if (room <= 0) { this.game.toast('더 이상 가질 수 없다.', '#ff8a7a'); return; }
        this.modal = new Modal({
          title: nameOf(e.inst), lines: ['몇 개 구매하시겠습니까?'],
          qty: { min: 1, max, value: 1, info: (n) => `합계 ${fmt(n * e.price)} G`, infoColor: (n) => (n * e.price <= st.gold ? '#ffd84a' : COLORS.bad) },
          buttons: [{ label: '구매', value: 'ok', primary: true }, { label: '취소', value: 'cancel' }],
          onResult: (res) => { if (res.value === 'ok') this.buy(e, res.qty); },
        });
      } else {
        this.modal = new Modal({
          title: '구매 확인', lines: [`${nameOf(e.inst)}`, `${fmt(e.price)} G에 구매하시겠습니까?`],
          buttons: [{ label: '구매', value: 'ok', primary: true }, { label: '취소', value: 'cancel' }],
          onResult: (res) => { if (res.value === 'ok') this.buy(e, 1); },
        });
      }
    } else {
      audio.sfx('menu_ok');
      const q = e.inst.qty ?? 1;
      if (q > 1) {
        this.modal = new Modal({
          title: nameOf(e.inst), lines: ['몇 개 판매하시겠습니까?'],
          qty: { min: 1, max: q, value: 1, info: (n) => `받을 금액 ${fmt(n * e.price)} G` },
          buttons: [{ label: '판매', value: 'ok', primary: true }, { label: '취소', value: 'cancel' }],
          onResult: (res) => { if (res.value === 'ok') this.sell(e, res.qty); },
        });
      } else {
        const warn = (e.inst.rarity ?? 0) >= 3 || (e.inst.level ?? 0) >= 5;
        this.modal = new Modal({
          title: '판매 확인', lines: [nameOf(e.inst), `${fmt(e.price)} G에 판매하시겠습니까?`, ...(warn ? ['※ 귀한 물건입니다. 되살 수 없습니다.'] : [])],
          buttons: [{ label: '판매', value: 'ok', primary: !warn }, { label: '취소', value: 'cancel', primary: warn }],
          onResult: (res) => { if (res.value === 'ok') this.sell(e, 1); },
        });
      }
    }
  }

  buy(e, qty) {
    const st = this.state, b = baseOf(e.inst);
    const cost = e.price * qty;
    if (st.gold < cost) { this.talk('poor'); audio.sfx('menu_cancel'); return; }
    let got = null;
    if (b.stack) { const it = makeInst(b.id, { rarity: e.inst.rarity ?? 0 }); it.qty = qty; got = addItem(st, it); }
    else { for (let i = 0; i < qty; i++) got = addItem(st, makeInst(b.id, { rarity: e.inst.rarity ?? 0 })) || got; }
    if (!got) { this.game.toast('가방이 가득 찼다!', '#ff6060'); audio.sfx('menu_cancel'); return; }
    st.gold -= cost;
    audio.sfx('coin'); audio.sfx('item', { vol: 0.7 });
    this.talk('buy');
    this.coinFx(false);
    this.game.toast(`구매: ${nameOf(e.inst)}${qty > 1 ? ' ×' + qty : ''}`, '#ffe7a0');
  }
  sell(e, qty) {
    const st = this.state;
    if (!removeItem(st, e.inst.uid, qty)) return;
    const gain = e.price * qty;
    st.gold += gain;
    audio.sfx('coin');
    this.talk('sell');
    this.coinFx(true);
    this.game.toast(`판매: ${nameOf(e.inst)}${qty > 1 ? ' ×' + qty : ''}  +${fmt(gain)} G`, '#ffd84a');
    this.refresh();
  }
  coinFx(up) {
    const vw = this.game.viewW;
    const x = up ? vw - 160 : this.detailRect ? this.detailRect.x + 56 : vw / 2, y = up ? 28 : this.detailRect ? this.detailRect.y + 56 : 200;
    this.fx.burst('gold', x, y, 26, { speed: 220 });
    this.fx.ring(x, y, { color: '#ffd84a', r0: 6, r1: 60, life: 0.4, width: 4 });
    this.fx.text(x, y - 10, up ? '+G' : '-G', { color: '#ffd84a', size: 18, life: 0.7 });
  }

  renderBody(ctx, body) {
    const st = this.state;
    const lw = Math.round(body.w * 0.5);
    const lr = { x: body.x + 8, y: body.y, w: lw - 8, h: body.h };
    this.list.draw(ctx, lr, (c, i, r, sel) => {
      const e = this.entries[i], b = baseOf(e.inst);
      const kind = [SLOT_LABEL[b.slot], b.wtype ? WTYPE_LABEL[b.wtype] : ''].filter(Boolean).join(' · ');
      if (this.tab === 0) {
        const own = b.stack ? countItem(st, b.id) : 0;
        itemRow(c, r, sel, e.inst, { right: fmt(e.price), rightColor: st.gold >= e.price ? '#ffd84a' : COLORS.bad, sub: kind + (own ? `  ·  보유 ${own}` : '') });
      } else itemRow(c, r, sel, e.inst, { right: '+' + fmt(e.price), rightColor: '#ffd84a', sub: kind });
    }, this.tab === 0 ? '오늘은 팔 물건이 없다네.' : '팔 수 있는 물건이 없다.');
    const dr = { x: body.x + lw + 10, y: body.y, w: body.w - lw - 10, h: body.h - 60 };
    this.detailRect = dr;
    const e = this.cur;
    drawItemDetail(ctx, dr, e?.inst ?? null, { state: st, price: e ? e.price * (this.tab === 1 && (e.inst.qty ?? 1) > 1 ? 1 : 1) : null, priceLabel: this.tab === 0 ? '구매 가격' : '판매 가격 (개당)', priceOk: this.tab === 1 || (e && st.gold >= e.price) });
    this.actRect = { x: dr.x, y: dr.y + dr.h + 10, w: dr.w, h: 50 };
    const can = e && (this.tab === 1 || st.gold >= e.price);
    button(ctx, this.actRect, e ? (this.tab === 0 ? (can ? '구매하기' : '골드 부족') : '판매하기') : '—', { selected: !!can, disabled: !e, size: 18 });
  }
}
