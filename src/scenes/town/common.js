// 마을 서비스 장면 공용 UI: 배경 · 헤더 · NPC 초상화+대사창 · 탭 · 스크롤 목록 · 모달(확인/수량) · 아이템 상세 · 보상 팝업
// 모두 키보드/패드 + 터치(큰 버튼, 드래그 스크롤) 겸용. — owner: PLAT-TOWN (platform §6.2/§6.3, WP-7)
//
// ServiceScene 계약 (상점·대장간·성당·게시판, 그리고 이를 상속하는 장면 — 예: 영혼의 마구간):
//  - uiScale 장면: game.uiW × game.uiH (UI px) 로 배치한다 (휴대폰 740×360 → 888×432, 844×390 → 1013×468, 최소 720×400).
//    this.vw / this.vh · this.layout() (L.vw, L.vh, L.compact = UI 높이 < 500, L.body) · renderBody(ctx, body, L) 의 body 만 쓴다.
//    game.viewW/viewH 를 직접 쓰지 않는다. 포인터도 UI 좌표 (game.syncPointer).
//  - 가상 패드는 scene 플래그 hidePad 로 숨긴다 (padHidden() 은 이제 아무것도 하지 않는 옛 이름).
//  - 탭 영역: render 에서 this.tz(id, rect, kind) (ui.taps, owner = 장면; 모달·팝업·연출 중에는 판정 안 함),
//    update 에서 this.tapId (이번 틱에 탭된 id | null). kind: 'primary' 44 · 'list' 36 · 'icon' 44×44 CSS px (§6.3).
//    ScrollList 는 owner 를 주면 (this.addList(rowH)) 보이는 줄을 'list' 영역으로 등록한다. 줄 높이는 50 이상.
//  - 메뉴 의미 입력: 결정 confirm · 취소 cancel · 탭 prevTab/nextTab (Q·S·LB / E·D·RB) · 보조 alt (A·패드 Y) / alt2 (C·패드 LT).
//    게임 액션(sub·dash·skill1…)은 읽지 않는다 (패드 B 는 게임에선 대시, 메뉴에선 취소).
//  - 안내 줄: uiHints(ctx, [[액션|액션[]|'dpadV'…, '라벨'], …]) → 지금 기기의 글리프 (터치 모드에선 숨김). 예전 키 글자도 된다.
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, wrap, panel, button, drawCover, vignette, FONT, COLORS, RARITY_NAMES, font, taps } from '../../core/ui.js';
import { drawHints } from '../../core/prompts.js';
import { clamp, TAU, fmt, rand, ease, rgba } from '../../core/math.js';
import { Particles } from '../../core/particles.js';
import { drawIcon, drawSlot } from '../../render/icons.js';
import * as Items from '../../data/items.js';
import { STAT_INFO } from '../../game/stats.js';
import { findItem, canEquip, addItem } from '../../game/inventory.js';
import { currentHero, newGameState } from '../../game/state.js';
import { NPCS } from '../../data/npcs.js';
import { TOWN_NPCS } from '../../data/town.js';
import { glow } from './facades.js';
import * as MenuUI from '../menu/common.js';

/** 메뉴 담당의 고딕 UI 키트(frame/gbutton/hintRow/selBar)를 공유해 화면 간 이질감을 없앤다. 없으면 코어 ui 로 대체 */
export function uiPanel(ctx, x, y, w, h, o = {}) {
  if (MenuUI.frame) MenuUI.frame(ctx, x, y, w, h, { glowC: o.glow ?? null, corners: o.corner !== false, alpha: o.alpha ?? 1 });
  else panel(ctx, x, y, w, h, o);
}
export function uiButton(ctx, r, label, { selected = false, disabled = false, size = 16, sub, color } = {}) {
  if (!MenuUI.gbutton) return button(ctx, r, label, { selected, disabled, size, sub, color });
  const hot = !disabled && (selected || hovered(r));
  MenuUI.gbutton(ctx, r, label, { hot, disabled, size, sub, color, t: performance.now() / 1000 });
  return !disabled && tappedR(r);
}
/**
 * 키 안내 줄 — 지금 기기의 글리프 (키캡 / 패드 버튼). 터치 모드에서는 그리지 않는다 (화면의 버튼을 직접 누른다).
 * items = [[액션 | 액션[] | 'dpad'|'dpadH'|'dpadV' | 예전 키 글자('Z','↑'…), '라벨'], …]. y = 라벨 글자 기준선
 */
export function uiHints(ctx, items, x, y, align = 'center') {
  if (input.touchMode) return;
  try { drawHints(ctx, items, x, y, { align, size: 12, color: '#b8a890' }); return; } catch (e) { /* 아래 대체 */ }
  if (MenuUI.hintRow) MenuUI.hintRow(ctx, items, x, y, { align, size: 11 });
  else text(ctx, items.map(([k, d]) => `${Array.isArray(k) ? k.join('/') : k} ${d}`).join('   '), x, y, { size: 11, align, color: COLORS.dim });
}
function tappedR(r) { const p = input.pointer; return p.tapped && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
function hovered(r) { const p = input.pointer; return p.active && !input.touchMode && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

/** 테스트로 장면을 바로 열었을 때(?scene=shop 등) 세이브가 없으면 임시 상태를 만든다 */
export function ensureState(game) {
  if (!game.state) game.state = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
  return game.state;
}
/**
 * 예전 가상 패드 숨김 (DOM #touch). 캔버스 패드가 들어온 뒤로는 game.syncPad 가 유일한 주인이고 장면은
 * this.hidePad / this.padHideButtons 플래그로 알린다 → 이 함수는 아무것도 하지 않는다 (옛 호출부 호환용).
 */
export function padHidden(on) { /* no-op: scene.hidePad (platform §5.1) */ }

/** 탭 영역을 사각형 안쪽으로 자른다 (스크롤 목록의 반쯤 가려진 줄). 너무 얇으면 null */
function clipRect(r, c, minH) {
  const y0 = Math.max(r.y, c.y), y1 = Math.min(r.y + r.h, c.y + c.h);
  if (y1 - y0 < Math.min(r.h, minH)) return null;
  return { x: r.x, y: y0, w: r.w, h: y1 - y0 };
}
let LIST_SEQ = 0;

export const SLOT_LABEL = { weapon: '무기', head: '투구', body: '갑옷', cloak: '망토', acc: '장신구', consumable: '소모품', material: '재료', key: '귀중품' };
export const WTYPE_LABEL = { whip: '채찍', sword: '장검', greatsword: '대검', dagger: '단검', gun: '총', staff: '지팡이' };
export const EQUIP_KINDS = new Set(['weapon', 'head', 'body', 'cloak', 'acc']);
export const rarityColor = (r) => COLORS.rarity[clamp(r ?? 0, 0, 5)];

export const baseOf = (inst) => Items.ITEMS[inst?.baseId] ?? null;
export function nameOf(inst) { try { return Items.itemName ? Items.itemName(inst) : baseOf(inst)?.name ?? '???'; } catch { return baseOf(inst)?.name ?? '???'; } }
export function statsOf(inst) { try { return Items.itemStats ? Items.itemStats(inst) : {}; } catch { return {}; } }
export function sellPriceOf(inst) { try { return Items.sellPrice ? Items.sellPrice(inst) : Math.floor((baseOf(inst)?.price ?? 10) * 0.3); } catch { return 1; } }
export function makeInst(baseId, opts) { try { return Items.makeItem(baseId, opts); } catch { return null; } }
/** 설명 줄 배열 (아이템 담당의 itemDesc 가 있으면 우선) */
export function descLines(inst) {
  const b = baseOf(inst);
  try {
    if (Items.itemDesc) {
      const d = Items.itemDesc(inst);
      if (Array.isArray(d)) return d.map((x) => (typeof x === 'string' ? x : x?.text ?? '')).filter(Boolean);
      if (typeof d === 'string' && d) return [d];
    }
  } catch { /* 무시 */ }
  return b?.desc ? [b.desc] : [];
}
/** 상세 설명 줄 [{text,color}] — 이름/등급/기본 능력치 줄은 제외 (카드 위쪽에서 따로 보여 주므로) */
export function richLines(inst, note = null) {
  const b = baseOf(inst);
  const out = [];
  if (note) out.push({ text: note, color: '#8ac8ff' });
  try {
    if (Items.itemDescRich) {
      const L = Items.itemDescRich(inst) || [];
      const eq = b && EQUIP_KINDS.has(b.slot);
      L.forEach((l, i) => {
        if (i === 0) return;                       // 등급·종류
        if (eq && i === 1) return;                 // 단계·요구 레벨
        if (eq && l.color === '#efe4cf') return;   // 기본 능력치 (위 비교표에 있음)
        out.push({ text: l.text, color: l.flavor ? '#a8987e' : l.color });
      });
      return out;
    }
  } catch { /* 무시 */ }
  for (const d of descLines(inst)) out.push({ text: d, color: '#b8a890' });
  return out;
}
export function fmtStat(k, v) {
  const info = STAT_INFO[k];
  const n = Math.abs(v) < 10 && Math.round(v) !== v ? (Math.round(v * 10) / 10) : Math.round(v);
  return (v >= 0 ? '+' : '') + n + (info?.pct ? '%' : '');
}
export function statName(k) { return STAT_INFO[k]?.name ?? k; }
/** 현재 영웅이 같은 부위에 장착한 아이템 */
export function equippedFor(state, hero, inst) {
  const b = baseOf(inst);
  if (!b || !hero) return null;
  const slot = b.slot === 'acc' ? 'acc1' : b.slot;
  const uid = hero.equip?.[slot];
  return uid && uid !== inst.uid ? findItem(state, uid) : null;
}
export function isEquippedAny(state, uid) {
  for (const h of Object.values(state.heroes || {})) for (const s in h.equip || {}) if (h.equip[s] === uid) return h.charId;
  return null;
}
export function npcInfo(id) {
  const d = NPCS[id] || {}, t = TOWN_NPCS[id] || {};
  return { name: d.name ?? t.name ?? '', title: d.title ?? t.title ?? '', portrait: d.portrait ?? t.portrait ?? `portraits/${id}` };
}
export function pickLine(arr) { return arr?.length ? arr[Math.floor(Math.random() * arr.length)] : ''; }

/**
 * 받침에 맞는 조사를 붙인다: josa('세라피나', '과', '와') → '세라피나와', josa('「성기사」', '으로', '로') → '「성기사」로'.
 * 뒤쪽의 괄호·기호는 건너뛰고 마지막 한글(또는 숫자)로 판별. '으로/로' 는 ㄹ 받침이면 '로'.
 */
const DIGIT_JONG = [1, 2, 0, 1, 0, 0, 1, 2, 2, 0]; // 영 일 이 삼 사 오 육 칠 팔 구 (0 없음 · 1 있음 · 2 ㄹ)
export function josa(word, withJong, withoutJong) {
  const s = String(word ?? '');
  const pick = (jong) => s + (withJong === '으로' ? (jong === 0 || jong === 2 ? withoutJong : withJong) : jong ? withJong : withoutJong);
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s.charCodeAt(i);
    if (c >= 0xac00 && c <= 0xd7a3) { const j = (c - 0xac00) % 28; return pick(j === 0 ? 0 : j === 8 ? 2 : 1); }
    if (c >= 48 && c <= 57) return pick(DIGIT_JONG[c - 48]);
    if (/[A-Za-z]/.test(s[i])) return pick(0);
  }
  return pick(0);
}

// ───────────────────────── 스크롤 목록 ─────────────────────────
/**
 * 세로 스크롤 목록: 방향키 반복 · 드래그 스크롤 · 탭 선택(선택된 줄을 다시 탭하면 결정).
 * owner(보통 장면)를 주면 보이는 줄을 ui.taps 'list' 영역으로 등록하고 그 영역으로 판정한다 (터치 여유 · QA 감사).
 * owner.blocked 가 참이면(모달 등) 줄은 그리기만 하고 판정하지 않는다.
 */
export class ScrollList {
  constructor(rowH = 56, owner = null) {
    this.rowH = rowH; this.index = 0; this.count = 0; this.scroll = 0; this.target = 0; this.rect = null; this.drag = null; this.repeat = 0; this.moved = false;
    this.owner = owner; this.idp = `list${++LIST_SEQ}:`;
  }
  /** 이번 틱에 탭된 줄 번호 (등록부 판정; owner 가 없으면 좌표로) | -1 */
  tappedRow(inside) {
    const p = input.pointer;
    if (this.owner) {
      const id = taps.hit(this.owner);
      return typeof id === 'string' && id.startsWith(this.idp) ? Number(id.slice(this.idp.length)) : -1;
    }
    return inside && this.rect ? Math.floor((p.y - this.rect.y + this.scroll) / this.rowH) : -1;
  }
  setCount(n) { this.count = n; this.index = clamp(this.index, 0, Math.max(0, n - 1)); }
  maxScroll() { return Math.max(0, this.count * this.rowH - (this.rect?.h ?? 0)); }
  step(d) { if (!this.count) return; const i = clamp(this.index + d, 0, this.count - 1); if (i !== this.index) { this.index = i; this.moved = true; } }
  /** 반환: 'select'(포인터로 다른 줄 선택) | 'confirm' | 'cancel' | null */
  update(dt, { keys = true } = {}) {
    this.moved = false;
    let res = null;
    if (keys && this.count > 0) {
      for (const [a, d] of [['up', -1], ['down', 1]]) {
        if (input.pressed(a)) { this.step(d); this.repeat = 0.3; }
        else if (input.down(a)) { this.repeat -= dt; if (this.repeat <= 0) { this.step(d); this.repeat = 0.07; } }
      }
    }
    const r = this.rect, p = input.pointer;
    if (r) {
      const inside = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      // 마우스 휠 (데스크톱): 목록 위에서 굴리면 스크롤만 (선택은 그대로). owner(장면)가 이번 틱의 휠 양을 넘겨준다
      const wh = this.owner?.wheel ?? 0;
      if (wh && inside && !this.drag) this.target = clamp(this.target + wh, 0, this.maxScroll());
      if (p.justDown && inside) this.drag = { y: p.y, s: this.target, moved: false };
      if (this.drag && p.down) {
        const dy = p.y - this.drag.y;
        if (Math.abs(dy) > 8) this.drag.moved = true;
        if (this.drag.moved) { this.target = clamp(this.drag.s - dy, 0, this.maxScroll()); this.scroll = this.target; }
      }
      if (p.tapped) {
        const wasDrag = this.drag?.moved; this.drag = null;
        if (!wasDrag) {
          const i = this.tappedRow(inside);
          if (i >= 0 && i < this.count) {
            if (i === this.index) res = 'confirm';
            else { this.index = i; this.moved = true; res = 'select'; }
          }
        }
      }
    }
    if (keys && input.pressed('confirm')) res = 'confirm';
    else if (keys && input.pressed('cancel')) res = 'cancel';
    if (this.moved && r) {
      const top = this.index * this.rowH;
      if (top < this.target) this.target = top;
      if (top + this.rowH > this.target + r.h) this.target = top + this.rowH - r.h;
    }
    this.target = clamp(this.target, 0, this.maxScroll());
    this.scroll += (this.target - this.scroll) * Math.min(1, dt * 16);
    return res;
  }
  draw(ctx, rect, rowFn, emptyText = '비어 있다') {
    this.rect = rect;
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x - 4, rect.y, rect.w + 8, rect.h); ctx.clip();
    if (!this.count) text(ctx, emptyText, rect.x + rect.w / 2, rect.y + 60, { size: 15, align: 'center', color: COLORS.dim });
    const i0 = Math.max(0, Math.floor(this.scroll / this.rowH)), i1 = Math.min(this.count - 1, Math.ceil((this.scroll + rect.h) / this.rowH));
    const sw = this.maxScroll() > 0 ? 10 : 0;
    const own = this.owner, off = !!own?.blocked;
    for (let i = i0; i <= i1; i++) {
      const rr = { x: rect.x, y: rect.y + i * this.rowH - this.scroll, w: rect.w - sw, h: this.rowH - 5 };
      rowFn(ctx, i, rr, i === this.index);
      // 보이는 부분만 등록 (목록 밖으로 삐져나온 부분은 누를 수 없다). 44 px 보다 얇게 보이는 줄은 스크롤해서 누른다
      const cr = own ? clipRect(rr, rect, 44) : null;
      if (cr) taps.add(this.idp + i, cr, { owner: own, kind: 'list', disabled: off, src: 'town.list' });
    }
    ctx.restore();
    if (sw) {
      const ms = this.maxScroll(), th = Math.max(30, rect.h * rect.h / (this.count * this.rowH));
      const ty = rect.y + (rect.h - th) * (this.scroll / ms);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(rect.x + rect.w - 5, rect.y, 4, rect.h);
      ctx.fillStyle = 'rgba(232,200,114,0.7)'; ctx.fillRect(rect.x + rect.w - 6, ty, 6, th);
      if (this.scroll > 4) text(ctx, '▲', rect.x + rect.w / 2, rect.y + 12, { size: 11, align: 'center', color: 'rgba(232,200,114,0.8)' });
      if (this.scroll < ms - 4) text(ctx, '▼', rect.x + rect.w / 2, rect.y + rect.h - 3, { size: 11, align: 'center', color: 'rgba(232,200,114,0.8)' });
    }
  }
}

/** 목록 한 줄 배경 */
export function rowBg(ctx, r, sel, { tint = null, dim = false } = {}) {
  const g = ctx.createLinearGradient(r.x, 0, r.x + r.w, 0);
  if (sel) { g.addColorStop(0, 'rgba(140,22,40,0.92)'); g.addColorStop(1, 'rgba(50,8,18,0.75)'); }
  else { g.addColorStop(0, dim ? 'rgba(16,10,16,0.7)' : 'rgba(28,16,26,0.88)'); g.addColorStop(1, 'rgba(10,6,12,0.7)'); }
  ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
  if (tint) { ctx.fillStyle = tint; ctx.fillRect(r.x, r.y, 4, r.h); }
  ctx.strokeStyle = sel ? COLORS.gold : 'rgba(110,85,48,0.55)'; ctx.lineWidth = sel ? 2 : 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (sel) {
    if (MenuUI.selBar) MenuUI.selBar(ctx, r.x, r.y, r.w, r.h, performance.now() / 1000);
    else { ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.moveTo(r.x - 7, r.y + r.h / 2 - 6); ctx.lineTo(r.x - 1, r.y + r.h / 2); ctx.lineTo(r.x - 7, r.y + r.h / 2 + 6); ctx.fill(); }
  }
}

/** 아이템 한 줄 (아이콘 + 이름 + 부제 + 오른쪽 값) */
export function itemRow(ctx, r, sel, inst, { right = '', rightColor = '#ffd84a', sub = '', dim = false, badge = '' } = {}) {
  rowBg(ctx, r, sel, { tint: rarityColor(inst.rarity), dim });
  const s = r.h - 8;
  drawSlot(ctx, r.x + 8, r.y + 4, s, inst);
  const nx = r.x + s + 18;
  ctx.globalAlpha = dim ? 0.55 : 1;
  text(ctx, nameOf(inst), nx, r.y + r.h / 2 - (sub ? 3 : -6), { size: 15, weight: 700, color: rarityColor(inst.rarity), maxWidth: r.w - s - 120 });
  if (sub) text(ctx, sub, nx, r.y + r.h / 2 + 14, { size: 11, color: '#a89880', maxWidth: r.w - s - 120 });
  if (right) text(ctx, right, r.x + r.w - 12, r.y + r.h / 2 + 6, { size: 15, weight: 800, family: FONT.num, color: rightColor, align: 'right' });
  if (badge) text(ctx, badge, r.x + r.w - 12, r.y + 14, { size: 10, weight: 800, color: '#e8c872', align: 'right' });
  ctx.globalAlpha = 1;
}

// ───────────────────────── 모달 ─────────────────────────
/**
 * new Modal({ title, lines:[str], buttons:[{label, value, disabled, primary}], qty:{min,max,value,unit}, width, drawBody(ctx, rect, modal), bodyH })
 * update(dt) → { value, qty } | null.  취소(cancel)는 value:'cancel'
 */
export class Modal {
  constructor(o) {
    Object.assign(this, { title: '', lines: [], buttons: [{ label: '확인', value: 'ok', primary: true }], qty: null, width: 440, bodyH: 0, t: 0, sel: 0 }, o);
    this.sel = Math.max(0, this.buttons.findIndex((b) => b.primary && !b.disabled));
    this.rects = []; this.qRects = null; this.repeat = 0;
  }
  update(dt) {
    this.t += dt;
    const q = this.qty;
    if (q) {
      const ch = (d) => { const v = clamp(q.value + d, q.min, q.max); if (v !== q.value) { q.value = v; audio.sfx('menu_move', { vol: 0.5 }); } };
      for (const [a, d] of [['left', -1], ['right', 1], ['down', -10], ['up', 10]]) {
        if (input.pressed(a)) { ch(d); this.repeat = 0.3; }
        else if (input.down(a)) { this.repeat -= dt / 2; if (this.repeat <= 0) { ch(d); this.repeat = 0.06; } }
      }
      const qid = input.pointer.tapped ? taps.hit(this) : null;
      if (typeof qid === 'string' && qid.startsWith('q:') && this.qRects) {
        const d = this.qRects[Number(qid.slice(2))]?.[1];
        if (d !== undefined) { ch(d === 'max' ? q.max - q.value : d === 'min' ? q.min - q.value : d); return null; }
      }
    } else {
      if (input.pressed('left')) this.move(-1);
      if (input.pressed('right')) this.move(1);
    }
    if (this.t < 0.12) return null;
    if (input.pointer.tapped) {
      const id = taps.hit(this);
      const i = typeof id === 'string' && id.startsWith('b:') ? Number(id.slice(2)) : -1;
      if (i >= 0 && this.buttons[i] && !this.buttons[i].disabled) { this.sel = i; return this.result(i); }
    }
    if (input.pressed('confirm')) {
      const i = q ? this.buttons.findIndex((b) => b.primary) : this.sel;
      if (i >= 0 && !this.buttons[i].disabled) return this.result(i);
      audio.sfx('menu_cancel');
    }
    if (input.pressed('cancel') || input.pressed('menu')) return { value: 'cancel', qty: q?.value };
    return null;
  }
  move(d) {
    const n = this.buttons.length;
    for (let k = 1; k <= n; k++) { const i = (this.sel + d * k + n * 4) % n; if (!this.buttons[i].disabled) { if (i !== this.sel) audio.sfx('menu_move'); this.sel = i; return; } }
  }
  result(i) { return { value: this.buttons[i].value, qty: this.qty?.value }; }
  render(ctx, vw, vh) {
    const a = ease.outCubic(Math.min(1, this.t * 6));
    ctx.save();
    ctx.fillStyle = `rgba(2,0,6,${0.62 * a})`; ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = a;
    const w = Math.min(this.width, vw - 40);
    ctx.font = font(16, 500);
    const lines = this.lines.flatMap((l) => wrap(ctx, l, w - 56, 16));
    const qh = this.qty ? 92 : 0;
    const h = 70 + lines.length * 25 + this.bodyH + qh + 76;
    const x = vw / 2 - w / 2, y = Math.max(8, vh / 2 - h / 2 - (vh < 500 ? 10 : 0)) + (1 - a) * 20;
    uiPanel(ctx, x, y, w, h, { glow: 'rgba(180,20,40,0.5)' });
    text(ctx, this.title, vw / 2, y + 40, { size: 21, weight: 800, family: FONT.title, color: '#f3d690', align: 'center' });
    let yy = y + 72;
    for (const l of lines) { text(ctx, l, vw / 2, yy, { size: 16, align: 'center', color: COLORS.text, ow: 2 }); yy += 25; }
    if (this.bodyH && this.drawBody) { this.drawBody(ctx, { x: x + 24, y: yy - 8, w: w - 48, h: this.bodyH }, this); yy += this.bodyH; }
    if (this.qty) {
      const q = this.qty, cy = yy + 30;
      const bw = 50, bh = 46;
      const rMin = { x: vw / 2 - 190, y: cy - bh / 2, w: 58, h: bh }, rM10 = { x: vw / 2 - 126, y: cy - bh / 2, w: bw, h: bh }, rM1 = { x: vw / 2 - 70, y: cy - bh / 2, w: bw, h: bh };
      const rP1 = { x: vw / 2 + 20, y: cy - bh / 2, w: bw, h: bh }, rP10 = { x: vw / 2 + 76, y: cy - bh / 2, w: bw, h: bh }, rMax = { x: vw / 2 + 132, y: cy - bh / 2, w: 58, h: bh };
      uiButton(ctx, rMin, '최소', { size: 13 }); uiButton(ctx, rM10, '-10', { size: 15 }); uiButton(ctx, rM1, '−', { size: 20 });
      uiButton(ctx, rP1, '+', { size: 20 }); uiButton(ctx, rP10, '+10', { size: 15 }); uiButton(ctx, rMax, '최대', { size: 13 });
      this.qRects = [[rMin, 'min'], [rM10, -10], [rM1, -1], [rP1, 1], [rP10, 10], [rMax, 'max']];
      this.qRects.forEach(([r], k) => taps.add('q:' + k, r, { owner: this, kind: 'primary', src: 'town.modal' }));
      text(ctx, String(q.value), vw / 2 - 25 + 25, cy + 10, { size: 28, weight: 900, family: FONT.num, color: '#fff', align: 'center' });
      if (q.info) text(ctx, q.info(q.value), vw / 2, cy + 44, { size: 15, weight: 800, align: 'center', color: q.infoColor?.(q.value) ?? '#ffd84a' });
      yy += qh;
    }
    const n = this.buttons.length, bw = Math.min(170, (w - 60 - (n - 1) * 14) / n), bh = 48;
    const bx0 = vw / 2 - (n * bw + (n - 1) * 14) / 2;
    this.rects = this.buttons.map((b, i) => {
      const r = { x: bx0 + i * (bw + 14), y: y + h - bh - 22, w: bw, h: bh };
      uiButton(ctx, r, b.label, { selected: i === this.sel && !this.qty ? true : (this.qty && b.primary), disabled: b.disabled, size: 16 });
      taps.add('b:' + i, r, { owner: this, kind: 'primary', disabled: !!b.disabled, src: 'town.modal' });
      return r;
    });
    uiHints(ctx, this.qty ? [['dpadH', '±1'], ['dpadV', '±10'], ['confirm', '확인'], ['cancel', '취소']] : [['dpadH', '선택'], ['confirm', '확인'], ['cancel', '취소']], vw / 2, Math.min(vh - 8, y + h + 24));
    ctx.restore();
  }
}
function hit(r) { const p = input.pointer; return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
export { hit as hitRect };

// ───────────────────────── 보상 팝업 ─────────────────────────
/** new RewardPopup({ title, sub, gold, exp, items:[inst], color }) — 확인/탭으로 닫힘. update() → true(닫힘) */
export class RewardPopup {
  constructor(o) {
    Object.assign(this, { title: '보상 획득!', sub: '', gold: 0, exp: 0, items: [], color: '#ffd84a', t: 0 }, o);
    this.fx = new Particles(260);
    this.burstDone = false;
  }
  update(dt) {
    this.t += dt;
    this.fx.update(dt, null);
    if (this.t > 0.45 && (input.pressed('confirm') || input.pressed('cancel') || input.pointer.tapped)) { audio.sfx('menu_ok'); return true; }
    return false;
  }
  render(ctx, vw, vh) {
    if (!this.burstDone) {
      this.burstDone = true;
      this.fx.burst('gold', vw / 2, vh / 2 - 30, 60, { speed: 360 });
      this.fx.burst('holy', vw / 2, vh / 2 - 30, 30, { speed: 260 });
      this.fx.ring(vw / 2, vh / 2 - 30, { color: this.color, r0: 20, r1: 260, life: 0.7, width: 8 });
    }
    const k = ease.outBack(Math.min(1, this.t * 3.2));
    ctx.save();
    ctx.fillStyle = `rgba(2,0,6,${Math.min(0.7, this.t * 3)})`; ctx.fillRect(0, 0, vw, vh);
    ctx.globalCompositeOperation = 'lighter';
    ctx.save(); ctx.translate(vw / 2, vh / 2 - 30); ctx.rotate(this.t * 0.4);
    for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.fillStyle = rgba(this.color, 0.06); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -420); ctx.lineTo(40, -420); ctx.fill(); }
    ctx.restore();
    glow(ctx, vw / 2, vh / 2 - 30, 220, this.color, 0.35);
    ctx.globalCompositeOperation = 'source-over';
    const w = Math.min(460, vw - 40), rows = (this.gold ? 1 : 0) + (this.exp ? 1 : 0) + Math.min(4, this.items.length);
    // 줄 간격: 화면이 낮으면(휴대폰 UI 높이 432) 줄을 좁혀 패널이 화면 안에 들어오게
    const rh = clamp(Math.floor((vh - 40 - 130 - (this.sub ? 24 : 0)) / Math.max(1, rows)), 34, 44);
    const h = 130 + rows * rh + (this.sub ? 24 : 0);
    ctx.translate(vw / 2, vh / 2); ctx.scale(k, k); ctx.translate(-vw / 2, -vh / 2);
    const x = vw / 2 - w / 2, y = vh / 2 - h / 2;
    uiPanel(ctx, x, y, w, h, { glow: rgba(this.color, 0.6) });
    text(ctx, this.title, vw / 2, y + 44, { size: 26, weight: 900, family: FONT.title, color: this.color, align: 'center', ow: 4 });
    let yy = y + 70;
    if (this.sub) { text(ctx, this.sub, vw / 2, yy + 4, { size: 14, align: 'center', color: '#d8c8b0' }); yy += 24; }
    const line = (icon, label, val, col, inst) => {
      const bh = rh - 6, cyy = yy + bh / 2;
      ctx.fillStyle = 'rgba(20,10,18,0.8)'; ctx.fillRect(x + 30, yy, w - 60, bh);
      if (inst) drawSlot(ctx, x + 36, cyy - (bh - 6) / 2, bh - 6, inst); else drawIcon(ctx, icon, x + 52, cyy, bh - 10);
      text(ctx, label, x + 80, cyy + 6, { size: 15, weight: 700, color: col, maxWidth: w - 190 });
      if (val) text(ctx, val, x + w - 44, cyy + 6, { size: 17, weight: 900, family: FONT.num, color: '#fff', align: 'right' });
      yy += rh;
    };
    if (this.gold) line('coin', '골드', `+${fmt(this.gold)} G`, '#ffd84a');
    if (this.exp) line('gem_crystal', '경험치', `+${fmt(this.exp)}`, '#8ae0ff');
    for (const it of this.items.slice(0, 4)) line(it.icon, nameOf(it), (it.qty ?? 1) > 1 ? `×${it.qty}` : '', rarityColor(it.rarity), it);
    if (this.t > 0.45 && Math.floor(this.t * 2.5) % 2 === 0) {
      if (input.touchMode) text(ctx, '화면을 눌러 계속', vw / 2, y + h - 18, { size: 13, align: 'center', color: COLORS.dim });
      else uiHints(ctx, [['confirm', '계속']], vw / 2, y + h - 18);
    }
    ctx.restore();
    this.fx.draw(ctx, 'front');
  }
}

// ───────────────────────── 아이템 상세 카드 ─────────────────────────
/** 아이템 상세: 아이콘·이름·등급·부위·능력치(장착 비교)·설명·가격 */
export function drawItemDetail(ctx, r, inst, { state, price = null, priceLabel = '가격', priceOk = true, footer = null, compare = true, note = null, tag = null } = {}) {
  uiPanel(ctx, r.x, r.y, r.w, r.h, { corner: false });
  if (!inst) { text(ctx, '아이템을 선택하세요', r.x + r.w / 2, r.y + r.h / 2, { size: 15, align: 'center', color: COLORS.dim }); return; }
  const b = baseOf(inst) || {};
  const hero = state ? currentHero(state) : null;
  const rc = rarityColor(inst.rarity);
  // 아이콘 (희귀도 광채) — 낮은 패널(휴대폰)에서는 작게
  const s = r.h < 300 ? 60 : 76, ix = r.x + 18, iy = r.y + (r.h < 300 ? 14 : 18);
  if ((inst.rarity ?? 0) >= 2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, ix + s / 2, iy + s / 2, 70, rc, 0.35 + Math.sin(performance.now() / 300) * 0.08); ctx.restore(); }
  drawSlot(ctx, ix, iy, s, inst);
  const tx = ix + s + 16, tw = r.w - s - 50;
  text(ctx, nameOf(inst), tx, iy + 24, { size: 20, weight: 800, family: FONT.title, color: rc, maxWidth: tw });
  if (tag) { ctx.font = font(11, 800); const w2 = ctx.measureText(tag).width + 14; ctx.fillStyle = '#8a1426'; ctx.fillRect(r.x + r.w - w2 - 12, r.y + 12, w2, 20); text(ctx, tag, r.x + r.w - 12 - w2 / 2, r.y + 26, { size: 11, weight: 800, align: 'center', color: '#ffe7a0', ow: 0 }); }
  const kind = [RARITY_NAMES[inst.rarity ?? 0], SLOT_LABEL[b.slot] ?? '', b.wtype ? WTYPE_LABEL[b.wtype] : ''].filter(Boolean).join(' · ');
  const sm = s < 70; // 낮은 패널: 머리글 줄 간격을 좁힌다
  text(ctx, kind, tx, iy + (sm ? 42 : 46), { size: 13, color: '#c8b8a0', weight: 600 });
  const lvReq = b.lvReq ?? 1;
  const ly = iy + (sm ? 60 : 68);
  if (EQUIP_KINDS.has(b.slot)) {
    const ok = !hero || (hero.level >= lvReq);
    text(ctx, `요구 레벨 ${lvReq}`, tx, ly, { size: 12, color: ok ? '#9d8f80' : COLORS.bad, weight: 700 });
    if ((inst.level ?? 0) > 0) text(ctx, `강화 +${inst.level}`, tx + 110, ly, { size: 12, color: '#ffb040', weight: 800 });
  } else if ((inst.qty ?? 1) > 1) text(ctx, `보유 ${inst.qty}개`, tx, ly, { size: 12, color: '#9d8f80', weight: 700 });
  let yy = iy + s + 22;
  // 능력치 + 비교 (패널에 들어가는 줄 수만: 아래 가격 칸·설명과 겹치지 않게)
  const st = statsOf(inst);
  const eq = compare && state && EQUIP_KINDS.has(b.slot) ? equippedFor(state, hero, inst) : null;
  const est = eq ? statsOf(eq) : {};
  const keys = [...new Set([...Object.keys(st), ...Object.keys(est)])].filter((k) => STAT_INFO[k] && (Math.abs(st[k] ?? 0) > 0.05 || Math.abs(est[k] ?? 0) > 0.05));
  const floorY = r.y + r.h - (price !== null || footer ? 58 : 16);
  const maxRows = clamp(Math.floor((floorY - yy - 8 - (eq ? 20 : 0)) / 21), 1, 7);
  if (keys.length) {
    const nRows = Math.min(keys.length, maxRows);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(r.x + 14, yy - 16, r.w - 28, nRows * 21 + 12 + (eq ? 20 : 0));
    // 비교 대상(장착 중) 은 헤더의 '강화 +N' 과 겹치지 않도록 능력치 표 첫 줄에
    if (eq) { text(ctx, `비교 · 장착 중: ${nameOf(eq)}`, r.x + r.w - 24, yy + 1, { size: 11, color: '#9d8f80', align: 'right', maxWidth: r.w - 52 }); yy += 20; }
    for (const k of keys.slice(0, nRows)) {
      const v = st[k] ?? 0;
      text(ctx, statName(k), r.x + 26, yy + 4, { size: 14, color: '#d8ccb8' });
      text(ctx, fmtStat(k, v), r.x + r.w * 0.62, yy + 4, { size: 14, weight: 800, family: FONT.num, color: '#fff', align: 'right' });
      if (eq || (compare && state && EQUIP_KINDS.has(b.slot))) {
        const d = v - (est[k] ?? 0);
        if (Math.abs(d) > 0.05) text(ctx, `${d > 0 ? '▲' : '▼'} ${fmtStat(k, Math.abs(d)).replace('+', '')}`, r.x + r.w - 24, yy + 4, { size: 13, weight: 800, color: d > 0 ? COLORS.good : COLORS.bad, align: 'right' });
      }
      yy += 21;
    }
    yy += 14;
  }
  // 장착 가능 여부
  if (hero && EQUIP_KINDS.has(b.slot)) {
    let chk = { ok: true };
    try { chk = canEquip(state, hero, inst); } catch { /* 무시 */ }
    if (!chk.ok) { text(ctx, `※ ${chk.reason}`, r.x + 22, yy + 4, { size: 13, color: '#ff8a7a', weight: 700 }); yy += 22; }
  }
  // 설명 (아이템 담당의 itemDescRich 가 있으면 색 있는 줄 — 위에서 이미 보여 준 이름/등급/기본 능력치 줄은 생략)
  const bottom = r.y + r.h - (price !== null || footer ? 58 : 16);
  ctx.save(); ctx.beginPath(); ctx.rect(r.x, yy - 14, r.w, Math.max(0, bottom - yy + 14)); ctx.clip();
  for (const d of richLines(inst, note)) {
    for (const l of wrap(ctx, d.text, r.w - 44, 13)) { if (yy > bottom) break; text(ctx, l, r.x + 22, yy + 4, { size: 13, color: d.color ?? '#b8a890', ow: 2 }); yy += 19; }
    yy += 3;
  }
  ctx.restore();
  if (price !== null) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(r.x + 14, r.y + r.h - 50, r.w - 28, 36);
    text(ctx, priceLabel, r.x + 26, r.y + r.h - 26, { size: 14, color: '#c8b8a0', weight: 700 });
    drawIcon(ctx, 'coin', r.x + r.w - 40, r.y + r.h - 32, 20);
    text(ctx, fmt(price), r.x + r.w - 56, r.y + r.h - 25, { size: 19, weight: 900, family: FONT.num, color: priceOk ? '#ffd84a' : COLORS.bad, align: 'right' });
  }
  footer?.(ctx, r);
}

// ───────────────────────── 서비스 장면 기반 ─────────────────────────
/**
 * 상점/대장간/성당/게시판 공통 틀. 하위 클래스는 setup() 에서 아래를 채운다:
 *  this.bgKey, this.title, this.eng, this.npcId, this.lines(SHOP_LINES 항목), this.tabs:[{id,label}], this.accent
 *  updateBody(dt), renderBody(ctx, body, L) 구현. 배치는 UI px (파일 머리 주석의 계약 참고).
 */
export class ServiceScene extends Scene {
  constructor(g) { super(g); this.opaque = true; this.uiScale = true; this.hidePad = true; }
  enter(params = {}) {
    ensureState(this.game);
    this.params = params;
    this.world = params.world ?? null;
    this.tab = 0; this.tabs = []; this.modal = null; this.popup = null;
    this.tapId = null;
    this.say = { text: '', shown: 0, t: 0 };
    this.fx = new Particles(500);
    this.accent = '#e8c872';
    this.embers = [];
    this.setup?.(params);
    for (let i = 0; i < 26; i++) this.embers.push({ x: rand(0, 1), y: rand(0, 1), v: rand(0.3, 1), p: rand(0, TAU), s: rand(0.6, 1.6) });
    if (this.music) audio.music(this.music);
    audio.sfx('door');
    // 마우스 휠 → 스크롤 목록 (맨 위일 때만 모은다; update 에서 this.wheel 로 한 틱에 넘긴다)
    this._wheel = 0; this.wheel = 0;
    this._onWheel ??= (e) => { if (this.game.top === this) this._wheel += e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1); };
    try { window.addEventListener('wheel', this._onWheel, { passive: true }); } catch { /* 창 없음 */ }
  }
  exit() {
    try { window.removeEventListener('wheel', this._onWheel); } catch { /* 창 없음 */ }
    if (this.music) audio.music('hub');
  }
  /** 배치 폭·높이 (UI px: uiScale 이면 game.uiW × game.uiH) */
  get vw() { const g = this.game; return this.uiScale ? (g.uiW || g.viewW) : g.viewW; }
  get vh() { const g = this.game; return this.uiScale ? (g.uiH || g.viewH) : g.viewH; }
  /** 모달·팝업·연출 중이거나 위에 다른 장면이 있으면 아래 버튼은 누를 수 없다 */
  get blocked() { return !!(this.modal || this.popup || this.busy || this.cere || this.closing || this.game.top !== this); }
  /** 탭 영역 등록 (render 에서; update 에서 this.tapId 로 읽는다). kind: 'primary' | 'list' | 'icon' */
  tz(id, r, kind = 'primary') {
    if (r && r.w > 0 && r.h > 0) taps.add(id, r, { owner: this, kind, disabled: this.blocked, src: 'town.' + (this.name ?? 'svc') });
    return r;
  }
  /** 이 장면에 탭 영역을 등록하는 스크롤 목록 */
  addList(rowH = 58) { return new ScrollList(rowH, this); }
  // 토스트 줄: 화면 위 가운데(기본값)는 탭 줄을 가리므로, 왼쪽 초상화 칸의 대사창 바로 위에서 위로 쌓는다
  // (상점·대장간·의뢰 게시판·성당 공통 — 초상화 칸은 장식 영역이라 조작 요소를 가리지 않는다). UI 좌표
  get toastX() { return this.layout().pw / 2; }
  get toastY() { return this.vh - 214; }
  get toastUp() { return true; }
  get state() { return this.game.state; }
  get hero() { return currentHero(this.game.state); }
  talk(kindOrText) {
    const t = this.lines?.[kindOrText] ? pickLine(this.lines[kindOrText]) : kindOrText;
    if (!t) return;
    this.say = { text: t, shown: 0, t: 0 };
  }
  close() {
    if (this.modal || this.popup) return;
    if (this.closing) return;
    this.closing = true;
    audio.sfx('menu_cancel');
    this.onClose?.();
    this.game.fadeOut(() => this.game.pop(), 0.14);
  }
  setTab(i) {
    if (i === this.tab || i < 0 || i >= this.tabs.length) return;
    this.tab = i; audio.sfx('menu_move');
    this.onTab?.(i);
  }
  update(dt) {
    this.fx.update(dt, null);
    const s = this.say;
    s.t += dt; if (s.shown < s.text.length) s.shown = Math.min(s.text.length, s.shown + dt * 38);
    this.tapId = null;
    this.wheel = this.blocked ? 0 : (this._wheel || 0); this._wheel = 0;
    if (this.popup) { if (this.popup.update(dt)) { const cb = this.popup.onClose; this.popup = null; cb?.(); } return; }
    if (this.modal) {
      const r = this.modal.update(dt);
      if (r) { const m = this.modal; this.modal = null; m.onResult?.(r); input.flush(); }
      return;
    }
    if (this.busy) { this.updateBusy?.(dt); return; }
    if (this.closing) return;
    this.tapId = input.pointer.tapped ? taps.hit(this) : null;
    const id = this.tapId;
    // 닫기 / 탭
    if (id === 'close') { this.close(); return; }
    if (typeof id === 'string' && id.startsWith('tab:')) { this.setTab(Number(id.slice(4))); return; }
    if (this.tabs.length > 1 && !this.lockTabs) {
      const n = this.tabs.length;
      if (input.pressed('nextTab')) { this.setTab((this.tab + 1) % n); return; }
      if (input.pressed('prevTab')) { this.setTab((this.tab + n - 1) % n); return; }
      if (!this.useLeftRight) {
        if (input.pressed('left')) { this.setTab(Math.max(0, this.tab - 1)); return; }
        if (input.pressed('right')) { this.setTab(Math.min(n - 1, this.tab + 1)); return; }
      }
    }
    const res = this.updateBody?.(dt);
    if (res === 'cancel' || (res == null && input.pressed('menu') && !input.pressed('confirm'))) this.close();
  }

  // ── 그리기 ──
  /** 초상화 칸 폭 (UI px). 낮은 화면(휴대폰)은 좁게 */
  portraitW(vw, compact) { return Math.round(compact ? clamp(vw * 0.27, 230, 290) : clamp(vw * 0.3, 300, 360)); }
  /**
   * 배치 (UI px): { vw, vh, compact, pw, cx, cy, cw, ch, hdr, tabsIn, body }
   * compact(UI 높이 < 500 — 휴대폰): 탭을 머리글 줄에 둔다. 아래 24 px 는 키 안내 줄 자리.
   */
  layout() {
    const vw = this.vw, vh = this.vh, compact = vh < 500;
    const pw = this.portraitW(vw, compact);
    const cx = pw + 6, cw = vw - pw - 22, hdr = 56, hint = 24;
    const nt = this.tabs?.length ?? 0;
    const tabsIn = compact && nt > 1;
    const by = nt > 1 && !tabsIn ? hdr + 8 + 44 + 10 : hdr + 8;
    return { vw, vh, compact, pw, cx, cy: hdr + 8, cw, ch: vh - hdr - 8 - hint, hdr, tabsIn, body: { x: cx, y: by, w: cw, h: vh - by - hint } };
  }
  render(ctx) {
    const L = this.layout(), { vw, vh } = L;
    // 배경
    drawCover(ctx, this.bgKey ? assets.get(this.bgKey) : null, vw, vh, { fallback: ['#1a0e14', '#060308'] });
    const g = ctx.createLinearGradient(0, 0, vw, 0);
    g.addColorStop(0, 'rgba(4,2,6,0.25)'); g.addColorStop(0.35, 'rgba(4,2,6,0.55)'); g.addColorStop(1, 'rgba(4,2,6,0.8)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    this.renderAmbient?.(ctx, L);
    // 불씨
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      const x = ((e.x * vw + Math.sin(this.t * 0.7 + e.p) * 30) % vw + vw) % vw, y = ((e.y * vh - this.t * 22 * e.v) % vh + vh) % vh;
      ctx.fillStyle = rgba(this.emberColor ?? '#ff9a3a', 0.35 + 0.35 * Math.sin(this.t * 3 + e.p));
      ctx.fillRect(x, y, 2 * e.s, 2 * e.s);
    }
    ctx.restore();
    vignette(ctx, vw, vh, 0.7);
    this.renderPortrait(ctx, L);
    this.renderHeader(ctx, L);
    this.renderBody?.(ctx, L.body, L);
    this.fx.draw(ctx, 'back'); this.fx.draw(ctx, 'front'); this.fx.draw(ctx, 'top');
    this.renderOver?.(ctx, L);
    if (!this.modal && !this.popup && !this.busy && !this.lockTabs) {
      const items = [];
      if (this.tabs.length > 1) items.push([['prevTab', 'nextTab'], '탭']);
      // 선택 방향 글리프: 하위 장면이 selectHint() 로 정할 수 있다 (null = 고를 것이 없는 탭)
      const selA = this.selectHint ? this.selectHint() : (this.useLeftRight && this.tabs[this.tab]?.id === 'class' ? 'dpadH' : 'dpadV');
      if (selA) items.push([selA, '선택']);
      items.push(['confirm', '결정'], ['cancel', '닫기']);
      if (this.extraHints) items.push(...this.extraHints());
      uiHints(ctx, items, L.cx + L.cw / 2, vh - 8);
    }
    if (this.modal) this.modal.render(ctx, vw, vh);
    if (this.popup) this.popup.render(ctx, vw, vh);
  }
  /** 머리글: 제목 · (compact 면 탭) · 골드 · 닫기 */
  renderHeader(ctx, L) {
    const { vw } = L;
    const hg = ctx.createLinearGradient(0, 0, 0, L.hdr + 2);
    hg.addColorStop(0, 'rgba(6,2,8,0.95)'); hg.addColorStop(1, 'rgba(6,2,8,0.55)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, vw, L.hdr);
    if (MenuUI.divider) MenuUI.divider(ctx, 0, L.hdr - 1, vw, { center: false }); else { ctx.fillStyle = 'rgba(232,200,114,0.5)'; ctx.fillRect(0, L.hdr - 1, vw, 1.5); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, 90, 30, 90, this.accentGlow ?? '#c8601a', 0.18); ctx.restore();
    const ts = L.tabsIn ? 22 : 26;
    text(ctx, this.title, 22, 37, { size: ts, weight: 800, family: FONT.title, color: '#f3d690', ow: 4 });
    ctx.font = font(ts, 800, FONT.title);
    const tw = ctx.measureText(this.title).width;
    // 골드 · 닫기
    const gw = L.compact ? 140 : 170, gx = vw - 72 - gw - 10;
    if (!L.tabsIn) text(ctx, this.eng ?? '', 22 + tw + 14, 36, { size: 12, weight: 800, family: FONT.num, color: '#8a7a64', maxWidth: Math.max(0, gx - tw - 50) });
    uiPanel(ctx, gx, 9, gw, 38, { corner: false });
    drawIcon(ctx, 'coin', gx + 22, 28, 22);
    text(ctx, fmt(this.state.gold ?? 0), gx + gw - 12, 35, { size: 18, weight: 900, family: FONT.num, color: '#ffd84a', align: 'right' });
    this.closeRect = this.tz('close', { x: vw - 64, y: 8, w: 52, h: 40 }, 'icon');
    uiButton(ctx, this.closeRect, '✕', { size: 20 });
    // 탭 (compact: 머리글 줄의 제목과 골드 사이 / 아니면 머리글 아래 줄)
    this.tabRects = null;
    const n = this.tabs.length;
    if (n <= 1) return;
    this.tabRects = [];
    const x0 = L.tabsIn ? Math.max(L.cx, 22 + tw + 16) : L.cx;
    const x1 = L.tabsIn ? gx - 12 : L.cx + L.cw;
    const tw2 = Math.min(150, (x1 - x0 - (n - 1) * 6) / n), th = 44;
    const ty = L.tabsIn ? 6 : L.cy;
    const lsz = tw2 < 96 ? 13 : 15;
    for (let i = 0; i < n; i++) {
      const r = this.tz('tab:' + i, { x: x0 + i * (tw2 + 6), y: ty, w: tw2, h: th });
      this.tabRects.push(r);
      const sel = i === this.tab;
      if (MenuUI.gbutton) {
        MenuUI.gbutton(ctx, r, this.tabs[i].label, { hot: sel, size: lsz, t: this.t, color: sel ? '#fff4d8' : '#b8a890' });
        if (sel) { ctx.fillStyle = COLORS.gold; ctx.fillRect(r.x + 10, r.y + r.h - 3, r.w - 20, 2); }
      } else {
        const tg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        tg.addColorStop(0, sel ? 'rgba(150,24,44,0.95)' : 'rgba(26,14,24,0.9)'); tg.addColorStop(1, sel ? 'rgba(70,8,20,0.95)' : 'rgba(10,5,10,0.9)');
        ctx.fillStyle = tg; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = sel ? COLORS.gold : 'rgba(110,85,48,0.7)'; ctx.lineWidth = sel ? 2 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        text(ctx, this.tabs[i].label, r.x + r.w / 2, r.y + 28, { size: lsz, weight: 800, align: 'center', color: sel ? '#fff4d8' : '#b8a890' });
      }
      if (this.tabs[i].badge) { ctx.fillStyle = '#e02a3a'; ctx.beginPath(); ctx.arc(r.x + r.w - 10, r.y + 9, 8, 0, TAU); ctx.fill(); text(ctx, this.tabs[i].badge, r.x + r.w - 10, r.y + 13, { size: 11, weight: 900, align: 'center', color: '#fff', ow: 0 }); }
    }
  }
  renderPortrait(ctx, L) {
    const info = npcInfo(this.npcId);
    const img = assets.get(info.portrait);
    const vh = L.vh;
    const breathe = Math.sin(this.t * 1.6) * 2;
    const h = vh * 0.86, w = img ? h * (img.width / img.height) : 0;
    const x = Math.min(0, L.pw - w) + (this.portraitShake ?? 0), y = vh - h + 6 + breathe;
    if (img) {
      ctx.save();
      // 역광 (차가운 테두리) + 따뜻한 주광
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x + w * 0.55, y + h * 0.35, h * 0.55, this.portraitGlow ?? '#ff8a3a', 0.22);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(img, x, y, w, h);
      const fade = ctx.createLinearGradient(0, vh - 190, 0, vh);
      fade.addColorStop(0, 'rgba(4,2,6,0)'); fade.addColorStop(1, 'rgba(4,2,6,0.95)');
      ctx.fillStyle = fade; ctx.fillRect(x, vh - 190, w, 190);
      const sfade = ctx.createLinearGradient(L.pw - 70, 0, L.pw + 6, 0);
      sfade.addColorStop(0, 'rgba(4,2,6,0)'); sfade.addColorStop(1, 'rgba(4,2,6,0.85)');
      ctx.fillStyle = sfade; ctx.fillRect(L.pw - 70, 56, 76, vh);
      ctx.restore();
    }
    // 대사창: 대사 전체의 줄 수에 맞춰 위로 늘어난다 (3~5줄) — 긴 기도 힌트 등이 잘리지 않도록
    const bx = 14, bw = L.pw - 24;
    const nl = clamp(wrap(ctx, this.say.text, bw - 34, 15, 500).length, 3, 5);
    const bh = 108 + (nl - 3) * 23, by = vh - bh - 14;
    uiPanel(ctx, bx, by, bw, bh, { glow: 'rgba(180,20,40,0.35)' });
    ctx.font = font(15, 800, FONT.title);
    const nw = Math.max(110, ctx.measureText(info.name).width + 36);
    uiPanel(ctx, bx + 14, by - 18, nw, 30, { corner: false });
    text(ctx, info.name, bx + 14 + nw / 2, by + 3, { size: 15, weight: 800, family: FONT.title, color: '#f3d690', align: 'center' });
    const lines = wrap(ctx, this.say.text.slice(0, Math.floor(this.say.shown)), bw - 34, 15, 500);
    lines.slice(0, nl).forEach((l, i) => text(ctx, l, bx + 18, by + 40 + i * 23, { size: 15, color: COLORS.text, ow: 2 }));
  }
}

// ───────────────────────── 구매 흐름 (상점·대장간 공용) ─────────────────────────
/** e = { inst, price, tag?, note? }. scene.talk('buy'|'poor'|'full') 로 반응 */
export function openBuy(scene, e) {
  const st = scene.state, b = baseOf(e.inst);
  if (!b) return;
  if ((st.gold ?? 0) < e.price) { audio.sfx('menu_cancel'); scene.talk('poor'); scene.portraitShake = 6; return; }
  audio.sfx('menu_ok');
  if (b.stack) {
    const own = st.inventory.filter((i) => i.baseId === b.id).reduce((a, i) => a + (i.qty ?? 1), 0);
    const room = Math.max(0, (b.stack ?? 99) - own);
    if (room <= 0) { scene.talk('full'); scene.game.toast('더 이상 가질 수 없다.', '#ff8a7a'); return; }
    const max = Math.max(1, Math.min(room, Math.floor(st.gold / e.price), 99));
    scene.modal = new Modal({
      title: nameOf(e.inst), lines: ['몇 개 구매하시겠습니까?'],
      qty: { min: 1, max, value: 1, info: (n) => `합계 ${fmt(n * e.price)} G`, infoColor: (n) => (n * e.price <= st.gold ? '#ffd84a' : COLORS.bad) },
      buttons: [{ label: '구매', value: 'ok', primary: true }, { label: '취소', value: 'cancel' }],
      onResult: (res) => { if (res.value === 'ok') doBuy(scene, e, res.qty); },
    });
  } else {
    scene.modal = new Modal({
      title: '구매 확인', lines: [nameOf(e.inst), `${fmt(e.price)} G에 구매하시겠습니까?`, ...(e.note ? [e.note] : [])],
      buttons: [{ label: '구매', value: 'ok', primary: true }, { label: '취소', value: 'cancel' }],
      onResult: (res) => { if (res.value === 'ok') doBuy(scene, e, 1); },
    });
  }
}
export function doBuy(scene, e, qty) {
  const st = scene.state, b = baseOf(e.inst);
  const cost = e.price * qty;
  if (st.gold < cost) { scene.talk('poor'); audio.sfx('menu_cancel'); return null; }
  let got = null;
  if (b.stack) { const it = makeInst(b.id, { rarity: e.inst.rarity ?? 0 }); if (it) { it.qty = qty; got = addItem(st, it); } }
  else for (let i = 0; i < qty; i++) got = addItem(st, makeInst(b.id, { rarity: e.inst.rarity ?? 0 })) || got;
  if (!got) { scene.talk('full'); scene.game.toast('가방이 가득 찼다!', '#ff6060'); audio.sfx('menu_cancel'); return null; }
  st.gold -= cost;
  audio.sfx('coin'); audio.sfx('item', { vol: 0.7 });
  scene.talk('buy');
  const d = scene.detailRect;
  const x = d ? d.x + 56 : (scene.vw ?? scene.game.viewW) / 2, y = d ? d.y + 56 : 200;
  scene.fx.burst('gold', x, y, 26, { speed: 220 });
  scene.fx.ring(x, y, { color: '#ffd84a', r0: 6, r1: 70, life: 0.45, width: 4 });
  scene.game.toast(`구매: ${nameOf(got)}${qty > 1 ? ' ×' + qty : ''}`, rarityColor(got.rarity));
  return got;
}
/** 대사 묶음 병합: 아이템 담당 SHOPKEEPERS 우선, 없으면 마을 기본 대사 */
export function mergeLines(mine = {}, theirs = {}, alias = {}) {
  const out = { ...mine };
  for (const k in theirs) { const key = alias[k] ?? k; if (Array.isArray(theirs[k]) && theirs[k].length) out[key] = theirs[k]; }
  return out;
}

// ───────────────────────── 정지 스냅샷 (비선택 캐릭터 미리보기 캐시) ─────────────────────────
/** 무거운 그림(예: drawHero 확대)을 오프스크린에 한 번 그려 두고 key 가 바뀔 때만 다시 그린다 */
export class Snap {
  constructor() { this.cv = null; this.key = null; }
  draw(ctx, key, x, y, w, h, paint) {
    const m = ctx.getTransform();
    const rs = clamp(Math.round(Math.hypot(m.a, m.b) * 4) / 4, 1, 2);
    const W = Math.max(1, Math.ceil(w * rs)), H = Math.max(1, Math.ceil(h * rs));
    const k = `${key}|${Math.round(x)}|${Math.round(y)}|${rs}`;
    if (!this.cv) this.cv = document.createElement('canvas');
    if (this.key !== k || this.cv.width !== W || this.cv.height !== H) {
      this.cv.width = W; this.cv.height = H;
      const oc = this.cv.getContext('2d');
      oc.setTransform(rs, 0, 0, rs, -x * rs, -y * rs);
      try { paint(oc); } catch (e) { console.error(e); }
      this.key = k;
    }
    ctx.drawImage(this.cv, 0, 0, W, H, x, y, w, h);
  }
}
