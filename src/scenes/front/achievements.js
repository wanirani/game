// 업적 화면 'achievements' (docs/specs/achievements.md §7.1–7.4) — owner: ACH-UI
//  - 여는 곳: 타이틀 메뉴 '업적' → go('achievements', {back:'title'}) · 인게임 메뉴 '기록' 탭의 [설정 | 업적] → push('achievements', {})
//    선택 인자 cat(분류 id) · id(그 줄에 초점). 닫기: back:'title' 이면 타이틀 메뉴의 '업적' 줄로, 아니면 pop()
//  - 데이터: 엔진 game.ach (§3.2 list·summary·titles·decos·canClaim·claimAll·markSeen)만 쓴다. 엔진이 없으면(받지 못함)
//    data/achievements.js 를 직접 읽어 모두 미달성으로 그리고 '업적 정보를 불러오지 못했습니다' 한 줄 — 던지지 않는다.
//    목록은 열 때·달성 이벤트·동기화·받기·이명/장식을 고른 뒤에만 다시 읽는다 (매 프레임 엔진을 부르지 않는다)
//  - 배치: 넓은 화면(uiW ≥ 960 · uiH ≥ 500) = 머리(70) · 왼쪽 분류 칸(9줄 + '이명 · 장식'·'보상 받기') · 오른쪽 카드 목록(66) · 바닥 안내.
//    좁은 화면(휴대폰) = 머리 · 분류 칩 띠(가로로 끌기, 고른 칩이 보이게 자동 이동) · 줄 목록(54) · 바닥 단추 줄.
//    단추·칩은 'primary'(44 CSS px, 이웃과 9 UI px 이상 띄워 여유 영역을 받는다), 줄은 'list'(36 CSS px) — src 'ach.*'
//  - 조작 (메뉴 의미 액션만 — 새 바인딩 없음): prevTab/nextTab 분류(돌아감) · ↑↓ 줄 (넓은 배치 ←→ = 분류 칸 ↔ 목록, 좁은 배치 ←→ = 분류) ·
//    confirm 자세히 · alt 이명·장식 · alt2 보상 받기 · cancel 팝업 → 장면 닫기. 터치: 칩·분류·줄·단추, 목록 끌기, 목록 가로 밀기 = 분류.
//    마우스: 올리면 고르기, 휠 = 목록
//  - 배경: 타이틀 키 아트(켄번스 한 장면) + 어둡게 + 고른 장식의 안개 색을 레이어 한 장에 굽고(휴대폰 등급은 반 해상도),
//    그 위에 장식의 Ambience(불씨 수는 타이틀의 절반, 안개·번개 없음) — 장식 미리 보기 구실. 프레임마다 새 캔버스·그라디언트 0
//  - 나가면 game.ach.markSeen() (NEW 표시를 지운다)
//  - '이명 · 장식' 창의 두 번째 쪽 '외형' (2026-10 벤치마크 5): 대시 잔상 색 6종 (data/cosmetics.js). 잠긴 칸은 조건 글, 고르면
//    meta.ach.cos.trail 을 적고 saves.saveMeta (엔진 API 밖 — 잔상은 업적 엔진이 모르는 꾸미기 칸). 능력치와 무관
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { bus } from '../../core/events.js';
import { cloud } from '../../core/cloud.js';
import { saves } from '../../core/save.js';
import { text, FONT, taps, fontEpoch, textFloor } from '../../core/ui.js';
import { drawGlyph, glyphWidth, promptMode } from '../../core/prompts.js';
import { clamp, ease, fmt, TAU, mix } from '../../core/math.js';
import { hudSafe } from '../../render/hud_layout.js';
import { ITEMS } from '../../data/items.js';
import * as AD from '../../data/achievements.js';
import * as AM from '../../core/ach_meta.js';
import * as COS from '../../data/cosmetics.js';
import { CHARACTERS } from '../../data/characters.js';
import { Ambience, kenBurns, shade, heading as bigHeading, backButton, footer, GOLD, BONE, DIM } from './common.js';
import {
  PAL, Nav, Gesture, Scroller, scrollbar, clipBegin, clipEnd, zone, glyph, glowOval, pill, gauge, selBar, frame, gbutton,
  ellipsize, measure, wrapC, Layer, leanMem, ctxScale, hintRow, hGrad, fillGradRect, inRect, divider, brackets,
} from '../menu/common.js';
import { drawMedal, ptsColor, CAT_COL, CAT_GLYPH } from './ach_medal.js';
import { decoOf, decoAmbience, drawDecoMoon } from '../title.js';

const CAT_ALL = { id: 'all', name: '전체', glyph: 'rune' };
const ERR_LINE = '업적 정보를 불러오지 못했습니다';
const REASON = {
  not_town: '마을에서 받을 수 있습니다',
  no_slot: '이어하기로 슬롯을 불러온 뒤 받을 수 있습니다',
  arcade: '아케이드 중에는 받을 수 없습니다',
  none: '받을 보상이 없습니다',
};
const TITLE_INDEX = 4;   // 타이틀 메뉴에서 '업적' 줄 (title.js buildMenu: 새 게임 · 이어하기 · 아케이드 · 명예의 전당 · 업적 …)
const HINT_TOUCH = '줄을 누르면 자세히 볼 수 있어요';
const CARD = [0, 'rgba(22,10,22,0.86)', 1, 'rgba(10,4,12,0.55)'];
const CARD_GOT = [0, 'rgba(44,18,30,0.9)', 1, 'rgba(14,6,14,0.6)'];
const own = (o, k) => typeof k === 'string' && !!o && Object.hasOwn(o, k);
const safe = (fn, d = undefined) => { try { return fn(); } catch (e) { console.warn('[ach-ui]', e); return d; } };

/** 'YYYY.MM.DD' (잘못된 시각이면 '') */
function fmtDay(ts) {
  const d = new Date(Number(ts));
  if (!(Number(ts) > 0) || Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}
const itemName = (id) => (own(ITEMS, id) ? ITEMS[id].name : id);
const titleName = (id) => (own(AM.ACH_TITLES, id) ? AM.ACH_TITLES[id].name : null);
const decoName = (id) => (own(AM.ACH_DECOS, id) ? AM.ACH_DECOS[id].name : null);

/** 보상 글: short = 카드의 칩, long = 자세히 창. kind: 'title'|'deco'|'gold' (gold = 받기로 주는 골드·소모품) */
function rewardOf(def) {
  const r = def?.reward;
  if (r && (r.title || r.deco)) {
    const t = r.title ? `이명 「${titleName(r.title) ?? r.title}」` : '', d = r.deco ? `장식 「${decoName(r.deco) ?? r.deco}」` : '';
    return { kind: r.title ? 'title' : 'deco', short: t && d ? '이명 · 장식' : t || d, long: [t, d].filter(Boolean).join(' · ') };
  }
  const parts = [];
  if (r && Number(r.gold) > 0) parts.push(`${fmt(r.gold)} G`);
  for (const it of Array.isArray(r?.items) ? r.items : []) parts.push(`${itemName(it.id)} ×${it.qty ?? 1}`);
  if (!parts.length) parts.push(`${fmt((Number(def?.pts) || 0) * 25)} G`);
  const s = parts.join(' · ');
  return { kind: 'gold', short: s, long: s };
}

// 잘라 쓴 글 캐시 (매 프레임 measureText 반복을 피한다; 글꼴 세대·글자 하한도 키에)
const FIT = new Map();
/**
 * 스크롤·잘린 영역 안의 탭 영역: 보이는 부분만 등록한다. 보이는 크기가 kind 의 최소(min, UI px — CSS 기준을 배율로 바꾼 값)보다
 * 작으면 등록하지 않는다 (가려진 표시만: tap() 이 거짓). 반쯤 보이는 줄의 온전한 사각형이 아래 단추와 겹치지 않게 (§6.3 겹침 0)
 */
function clipZone(r, clip, kind, owner, src, min) {
  const x0 = Math.max(r.x, clip.x), y0 = Math.max(r.y, clip.y), x1 = Math.min(r.x + r.w, clip.x + clip.w), y1 = Math.min(r.y + r.h, clip.y + clip.h);
  const v = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  // 잘린 쪽만 잰다 (온전히 보이는 영역은 그대로 — 44 UI px 단추는 터치 여유로 44 CSS px 를 채운다)
  const cutW = v.w < r.w - 0.01, cutH = v.h < r.h - 0.01;
  const small = (cutH && v.h < min - 0.01) || (kind !== 'list' && cutW && v.w < min - 0.01);
  if (!owner || v.w <= 0 || v.h <= 0 || small) { v.tzo = owner; v.thid = true; return v; }
  return zone(v, kind, owner, { src });
}
/** 모달이 열려 있을 때의 바탕 영역: 등록하지 않고 가려진 것으로만 표시 */
function hiddenZone(r, owner) { r.tzo = owner; r.thid = true; return r; }

function fit(ctx, str, w, size, weight = 500, family = FONT.body) {
  const k = size + '|' + weight + '|' + Math.round(w) + '|' + family.length + '|' + fontEpoch + '|' + textFloor() + '|' + str;
  let v = FIT.get(k);
  if (v === undefined) {
    if (FIT.size > 600) FIT.clear();
    v = w > 8 ? ellipsize(ctx, str, w, size, weight, family) : '';
    FIT.set(k, v);
  }
  return v;
}

export class AchievementsScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; this.opaque = true; }

  enter(params = {}) {
    this.back = params.back === 'title' ? 'title' : null;
    this.nav = new Nav(); this.ges = new Gesture(); this.sc = new Scroller();
    this.bgLayer = new Layer();
    this.modal = null; this.msg = null; this.flash = new Map();
    this.ci = 0; this.i = 0; this.focus = 'list';
    this.chipX = 0; this.chipMax = 0; this.chipDrag = null; this.chipFollow = true;
    this.zCats = []; this.zRows = []; this.zTitles = null; this.zClaim = null;
    this.alive = true; this.pollT = 0; this._L = null;
    this.refresh();
    if (typeof params.cat === 'string') { const k = this.cats.findIndex((c) => c.id === params.cat); if (k >= 0) this.ci = k; }
    if (typeof params.id === 'string') {
      let k = this.list().findIndex((r) => r.def.id === params.id);
      if (k < 0 && this.ci) { this.ci = 0; k = this.list().findIndex((r) => r.def.id === params.id); }
      if (k >= 0) { this.i = k; this.sc.follow(k); }
    }
    this.makeAmb();
    this.offs = [
      bus.on('achievementUnlocked', (e) => this.onUnlock(e)),
      bus.on('cloud:sync', (e) => { if (this.alive && e?.phase === 'done') this.refresh(); }),
    ];
    // 휠은 이 장면이 맨 위일 때만 (menu.js 와 같은 방식)
    this._onWheel = (e) => { if (this.game.top === this && !this.modal) this.ges.addWheel(e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1) * 0.9); };
    try { window.addEventListener('wheel', this._onWheel, { passive: true }); } catch { /* 창 없음 */ }
  }
  exit() {
    this.alive = false;
    for (const off of this.offs ?? []) { try { off(); } catch { /* 무시 */ } }
    this.offs = [];
    try { window.removeEventListener('wheel', this._onWheel); } catch { /* 무시 */ }
    this.bgLayer?.free();
    safe(() => this.game.ach?.markSeen?.());   // NEW 표시를 지운다 (§7.1)
  }

  // ───────────────────────── 데이터 ─────────────────────────
  /** 엔진(없으면 데이터 파일)에서 목록·요약을 다시 읽는다 */
  refresh() {
    const A = this.game.ach && typeof this.game.ach.list === 'function' ? this.game.ach : null;
    const defs = Array.isArray(A?.defs) ? A.defs : Array.isArray(AD.ACHIEVEMENTS) ? AD.ACHIEVEMENTS : [];
    const cats = [CAT_ALL, ...(Array.isArray(AD.ACH_CATS) ? AD.ACH_CATS : [])];
    this.cats = cats;
    this.defById = new Map(defs.map((d) => [d.id, d]));
    const plain = () => defs.map((def) => ({ def, got: null, cur: 0, need: def.cond?.n ?? 1, bar: false, isNew: false, claimable: false, hiddenLocked: !!def.hidden }));
    let rows = null;
    this.err = !A; this.noEngine = !A;
    if (A) rows = safe(() => A.list('all'), null);
    if (!Array.isArray(rows)) { rows = plain(); this.err = true; }
    const ci = new Map(cats.map((c, i) => [c.id, i]));
    rows = rows.filter((r) => r && r.def && typeof r.def.id === 'string').map((r, k) => ({ ...r, k }))
      .sort((a, b) => (ci.get(a.def.cat) ?? 99) - (ci.get(b.def.cat) ?? 99) || a.k - b.k);
    for (const r of rows) this.decorate(r);
    this.rowsAll = rows;
    this.byCat = cats.map((c) => (c.id === 'all' ? rows : rows.filter((r) => r.def.cat === c.id)));
    this.catInfo = this.byCat.map((L) => ({ got: L.filter((r) => r.got).length, total: L.length, isNew: L.some((r) => r.isNew) }));
    const s = A ? safe(() => A.summary(), null) : null;
    const ptsMax = defs.reduce((a, d) => a + (Number(d.pts) || 0), 0);
    this.sum = {
      got: Number(s?.got) || rows.filter((r) => r.got).length, total: Number(s?.total) || defs.length,
      pts: Number(s?.pts) || 0, ptsMax: Number(s?.ptsMax) || ptsMax, claimable: Number(s?.claimable) || 0, unseen: Number(s?.unseen) || 0,
    };
    this.sum.txtWide = `달성 ${this.sum.got} / ${this.sum.total} · 업적 점수 ${fmt(this.sum.pts)} / ${fmt(this.sum.ptsMax)}`;
    this.sum.txtNarrow = `${this.sum.got}/${this.sum.total} · ${fmt(this.sum.pts)}점`;
    this.claimInfo = A ? safe(() => A.canClaim(), { ok: false, reason: 'none' }) ?? { ok: false, reason: 'none' } : { ok: false, reason: 'none' };
    this.titleId = A ? safe(() => A.title(), null) : null;
    this.titleName = titleName(this.titleId);
    this.i = clamp(this.i ?? 0, 0, Math.max(0, this.list().length - 1));
    this.rev = A ? safe(() => A.rev, null) : null;
    this.game.dirty = true;
  }
  /** 그릴 때 쓰는 글 (숨김·보상·날짜·진행) */
  decorate(r) {
    const d = r.def, hid = !!r.hiddenLocked && !r.got;
    r.hid = hid;
    r.name = hid ? AD.ACH_HIDDEN?.name ?? '숨겨진 업적' : d.name;
    r.desc = hid ? AD.ACH_HIDDEN?.desc ?? '아직 알 수 없는 업적입니다' : d.desc;
    r.ptsTxt = `${Number(d.pts) || 0}점`;
    r.date = r.got ? fmtDay(r.got) : '';
    const cur = Math.max(0, Number(r.cur) || 0), need = Math.max(1, Number(r.need) || 1);
    r.ratio = clamp(cur / need, 0, 1);
    r.progWide = r.bar && !r.got ? `${fmt(cur)} / ${fmt(need)}` : '';
    r.progNarrow = r.bar && !r.got ? `${Math.floor(cur)}/${need}` : '';
    r.rw = rewardOf(d);
    r.claimed = !!r.got && r.rw.kind === 'gold' && (typeof r.claimed === 'boolean' ? r.claimed : !r.claimable);
    r.glyph = (Array.isArray(AD.ACH_CATS) ? AD.ACH_CATS.find((c) => c.id === d.cat)?.glyph : null) ?? CAT_GLYPH[d.cat] ?? 'star';
  }
  list() { return this.byCat?.[this.ci] ?? []; }
  catName(id) { return this.cats.find((c) => c.id === id)?.name ?? ''; }
  onUnlock(e) {
    if (!this.alive) return;
    this.refresh();
    const ids = Array.isArray(e?.ids) ? e.ids : [];
    for (const id of ids) this.flash.set(id, this.t);
    if (ids.length && e?.src === 'live') audio.sfx('secret', { pitch: 1.2 });
  }
  makeAmb() {
    const g = this.game, q = g.tier === 'low' ? 0.5 : g.tier === 'medium' ? 0.75 : 1;
    const deco = decoOf(g.meta);
    this.decoKey = g.meta?.ach?.deco ?? 'none';
    this.amb = new Ambience(decoAmbience({ embers: Math.round(35 * q), motes: Math.round(12 * q), bats: Math.round(6 * q), fog: false, lightning: false }, deco));
    // 안개(장식 색)는 배경 레이어에 한 번 굽는다 (큰 스프라이트 여섯 장을 매 프레임 그리지 않는다)
    this.fogAmb = new Ambience({ embers: 0, motes: 0, bats: 0, fog: true, lightning: false, fogTint: deco?.amb?.fogTint ?? '#5a4a6a' });
    this.moon = !!deco?.amb?.moon;
    this.bgLayer?.invalidate();
  }
  note(textStr, color = PAL.goldHi, time = 2.6) { this.msg = { text: textStr, color, t: time }; }
  setTitle(id) {
    const ok = !!safe(() => this.game.ach?.setTitle?.(id), false);
    this.refresh();
    return ok;
  }
  setDeco(id) {
    const ok = !!safe(() => this.game.ach?.setDeco?.(id), false);
    this.makeAmb();
    this.refresh();
    return ok;
  }
  /** 대시 잔상 (외형 쪽): meta.ach.cos.trail 에 적고 메타 저장 (로그인 중이면 클라우드가 따라 올린다). 고를 수 있는지는 창이 확인한다 */
  setTrail(id) {
    const g = this.game;
    if (!g.meta) return false;
    const ok = !!safe(() => COS.setTrail(AM.ensureAch(g.meta), id), false);
    if (ok) safe(() => saves.saveMeta(g.meta));
    return ok;
  }
  get claimOK() { return !!this.claimInfo?.ok && this.sum.claimable > 0; }
  claimReason() {
    if (this.err) return ERR_LINE;
    if (!this.claimInfo?.ok) return REASON[this.claimInfo?.reason] ?? REASON.none;
    return this.sum.claimable > 0 ? '' : REASON.none;
  }
  /** '보상 받기' (§5.3): 받을 수 있는 것 전부를 지금 슬롯에 */
  claim() {
    const A = this.game.ach;
    if (!this.claimOK || !A) { audio.sfx('menu_cancel'); this.note(this.claimReason() || REASON.none, PAL.warn); return; }
    const r = safe(() => A.claimAll(), null);
    if (!r) { audio.sfx('menu_cancel'); this.note('보상을 받지 못했습니다', PAL.bad); this.refresh(); return; }
    audio.sfx('coin'); audio.sfx('menu_ok');
    const parts = [];
    if (Number(r.gold) > 0) parts.push(`${fmt(r.gold)} G`);
    for (const it of Array.isArray(r.items) ? r.items : []) parts.push(`${it.name ?? itemName(it.id)} ×${it.qty ?? 1}`);
    const q = Array.isArray(r.queued) ? r.queued.length : Number(r.queued) || 0;
    this.note(`보상을 받았습니다 — ${parts.join(' · ') || '없음'}${q ? ' (가방이 가득 차 일부는 보관함으로)' : ''}`, PAL.good, 4.2);
    this.refresh();
  }
  setCat(k) {
    const n = this.cats.length;
    if (!n) return;
    const ni = ((k % n) + n) % n;
    if (ni === this.ci) return;
    this.ci = ni; this.i = 0; this.sc.reset(); this.chipFollow = true; this.catT = this.t;
    audio.sfx('menu_move');
  }
  openDetail(i) { if (!this.list()[i]) return; this.i = i; audio.sfx('menu_ok'); this.modal = new DetailModal(this, i); }
  openPick() { audio.sfx('menu_ok'); this.modal = new PickModal(this); }
  leave() {
    audio.sfx('menu_cancel');
    const g = this.game;
    if (this.back === 'title') g.go('title', { menu: true, index: TITLE_INDEX });
    else g.pop();
  }

  // ───────────────────────── 입력 ─────────────────────────
  update(dt) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    this.amb.update(dt, W, H);
    const nav = this.nav.poll(dt), ges = this.ges;
    ges.update();
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) this.msg = null; }
    for (const [id, t0] of this.flash) if (this.t - t0 > 2.6) this.flash.delete(id);
    // 기록이 바뀌었으면(엔진 rev — 동기화·다른 화면의 달성) 또는 엔진이 늦게 왔으면 다시 읽는다
    this.pollT -= dt;
    if (this.pollT <= 0) { this.pollT = 0.5; if ((this.noEngine && g.ach) || (g.ach && !this.noEngine && g.ach.rev !== this.rev)) this.refresh(); }
    if ((g.meta?.ach?.deco ?? 'none') !== this.decoKey) this.makeAmb();
    const L = this._L;
    if (this.modal) {
      const m = this.modal;
      const open = m.update(dt, nav, ges);
      if (this.modal === m && (!open || !m.open)) this.modal = null;
      return;
    }
    if (L) this.sc.update(dt, L.list, ges);
    // 좁은 배치: 분류 칩 띠를 가로로 끌기
    if (L && !L.wide) {
      const p = input.pointer;
      if (ges.justDown && ges.g && inRect(ges.g.x, ges.g.y, L.chips)) this.chipDrag = { x0: ges.g.x, s0: this.chipX, g: ges.g };
      if (this.chipDrag) {
        if (this.chipDrag.g !== ges.g) this.chipDrag = null;
        else {
          if (ges.moved) this.chipX = clamp(this.chipDrag.s0 - (p.x - this.chipDrag.x0), 0, this.chipMax);
          if (!p.down) this.chipDrag = null;
        }
      }
    }
    if (taps.hit(this) === 'back') { this.leave(); return; }
    if (ges.tap(this.zTitles)) { this.openPick(); return; }
    if (ges.tap(this.zClaim)) { this.claim(); return; }
    for (let k = 0; k < this.zCats.length; k++) {
      const z = this.zCats[k];
      if (!z || z.thid) continue;   // 가려진(잘린) 칩은 판정하지 않는다
      if (ges.tap(z)) { this.setCat(k); return; }
    }
    if (!this.sc.dragging) {
      for (const z of this.zRows) {
        if (z.r.thid) continue;
        if (ges.hoverIn(z.r) && this.i !== z.k) this.i = z.k;
        if (ges.tap(z.r)) { this.openDetail(z.k); return; }
      }
    }
    if (L && ges.swipe && inRect(ges.swipe.x, ges.swipe.y, L.list)) { this.setCat(this.ci + ges.swipe.dir); return; }
    // 키보드·패드
    if (nav.prevTab || nav.nextTab) { this.setCat(this.ci + (nav.prevTab ? -1 : 1)); return; }
    if (nav.alt) { this.openPick(); return; }
    if (nav.alt2) { this.claim(); return; }
    if (nav.cancel || nav.menu) { this.leave(); return; }
    const n = this.list().length;
    if (L?.wide) {
      if (this.focus === 'cats') {
        if (nav.up && this.ci > 0) this.setCat(this.ci - 1);
        else if (nav.down && this.ci < this.cats.length - 1) this.setCat(this.ci + 1);
        else if (nav.right || nav.confirm) { this.focus = 'list'; audio.sfx('menu_move'); this.sc.follow(this.i); }
        return;
      }
      if (nav.left) { this.focus = 'cats'; audio.sfx('menu_move'); return; }
    } else if (nav.left || nav.right) { this.setCat(this.ci + (nav.left ? -1 : 1)); return; }
    if (nav.up && this.i > 0) { this.i--; audio.sfx('menu_move'); }
    else if (nav.down && this.i < n - 1) { this.i++; audio.sfx('menu_move'); }
    else if (nav.confirm && n) this.openDetail(this.i);
  }

  // ───────────────────────── 배치 ─────────────────────────
  layout() {
    const g = this.game, k = g.uiK || 1, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const per = Math.max(0.2, (g.cssScale || 1) * k);
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const wide = W >= 960 && H >= 500;
    const btnH = 44;   // 44 UI px + 터치 여유(이웃과 9 UI px 이상) ≥ 44 CSS px
    const minRow = 36 / per, minBtn = 44 / per;   // 잘린 줄·칩을 등록할 최소 크기 (UI px)
    if (wide) {
      const top = st + 78, bot = H - sb - 34 - 6;
      const cw = Math.round(clamp(W * 0.22, 200, 250));
      const rowH = clamp(Math.floor((bot - top - btnH - 10 - 22) / 9), Math.max(32, Math.ceil(36 / per)), 42);
      const cats = { x: sl + 16, y: top, w: cw, h: rowH * 9, rowH };
      const by = top + rowH * 9 + 10, bw = Math.floor((cw - 8) / 2);
      const lx = cats.x + cw + 16;
      return {
        W, H, sl, sr, st, sb, per, wide, cats, minRow, minBtn,
        back: { x: 14 + sl, y: 12 + st, w: 92, h: 44 },
        btnTitles: { x: cats.x, y: by, w: bw, h: btnH }, btnClaim: { x: cats.x + cw - bw, y: by, w: bw, h: btnH }, reasonY: by + btnH + 16,
        list: { x: lx, y: top, w: W - sr - 16 - lx, h: bot - top }, cardH: 66, stride: 72,
      };
    }
    const chipsY = st + 58, bottomY = H - sb - 6 - btnH;
    const listY = chipsY + btnH + 9, listH = bottomY - 9 - listY;
    const bw = Math.round(clamp(W * 0.19, 150, 190));
    return {
      W, H, sl, sr, st, sb, per, wide, minRow, minBtn,
      back: { x: 12 + sl, y: 4 + st, w: 92, h: 44 },
      chips: { x: sl + 12, y: chipsY, w: W - sl - sr - 24, h: btnH },
      list: { x: sl + 12, y: listY, w: W - sl - sr - 24, h: listH }, cardH: 54, stride: 54,
      btnTitles: { x: sl + 12, y: bottomY, w: bw, h: btnH }, btnClaim: { x: sl + 12 + bw + 10, y: bottomY, w: bw, h: btnH },
      hintX: sl + 12 + bw * 2 + 10 + 16, bottomY,
    };
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    const g = this.game, t = g.time;
    const L = this._L = this.layout();
    this.toastY = L.wide ? L.st + 96 : L.st + 112;
    this.drawBg(ctx, L, t);
    this.zCats.length = 0; this.zRows.length = 0;
    if (L.wide) this.renderWide(ctx, L, t); else this.renderNarrow(ctx, L, t);
    this.drawMsg(ctx, L);
    if (this.modal) this.modal.render(ctx, L, t);
    this.ges.flush();
  }
  drawBg(ctx, L, t) {
    const W = L.W, H = L.H, img = assets.get('bg/title');
    const lean = leanMem(this.game);
    const bgScale = lean ? Math.min(ctxScale(ctx) * 0.5, Math.sqrt(2e5 / Math.max(1, W * H))) : null;
    this.bgLayer.draw(ctx, `achbg|${img ? 1 : 0}|${this.decoKey}`, 0, 0, W, H, bgScale, (c) => {
      kenBurns(c, img, W, H, 0, { z0: 1.06, z1: 1.06, oy: 0.4 });
      this.fogAmb.draw(c, W, H, 'front', 0);
      c.fillStyle = 'rgba(8,3,10,0.6)'; c.fillRect(0, 0, W, H);
      shade(c, W, H, { top: 0.55, bottom: 0.7, vig: 0.8 });
    }, lean ? 'low' : 'medium');
    if (this.moon) drawDecoMoon(ctx, W * 0.82, L.st + H * 0.16, H * 0.06, t);
    this.amb.draw(ctx, W, H, 'back', t);
    this.amb.draw(ctx, W, H, 'front', t);
  }

  renderWide(ctx, L, t) {
    const W = L.W, S = this.sum, xr = W - L.sr - 18;
    const ap = ease.outCubic(clamp(this.t / 0.4, 0, 1));
    bigHeading(ctx, W / 2, L.st + 27, 'ACHIEVEMENTS', '업적', { size: 22, alpha: ap });
    text(ctx, S.txtWide, xr, L.st + 28, { size: 14, align: 'right', weight: 800, color: BONE, ow: 2 });
    gauge(ctx, xr - 230, L.st + 37, 230, 6, S.ptsMax ? S.pts / S.ptsMax : 0, GOLD, { glowEnd: false });
    if (this.titleName) text(ctx, `이명 「${this.titleName}」`, xr, L.st + 62, { size: 12, align: 'right', weight: 700, color: GOLD, ow: 2 });
    this.renderCats(ctx, L, t);
    this.renderButtons(ctx, L, t);
    this.renderList(ctx, L, t);
    backButton(ctx, L.back.x, L.back.y, '뒤로', this.modal ? null : this);
    footer(ctx, W, L.H, [[['prevTab', 'nextTab'], '분류'], ['dpadV', '고르기'], ['confirm', '자세히'], ['alt', '이명·장식'], ['alt2', '보상 받기'], ['cancel', '돌아가기']], HINT_TOUCH);
  }
  renderNarrow(ctx, L, t) {
    const W = L.W, S = this.sum, xr = W - L.sr - 16;
    text(ctx, '업적', L.back.x + L.back.w + 14, L.st + 34, { size: 22, weight: 900, family: FONT.title, color: GOLD, ow: 3 });
    text(ctx, S.txtNarrow, xr, L.st + (this.titleName ? 24 : 32), { size: 15, align: 'right', weight: 800, color: BONE, ow: 2 });
    if (this.titleName) text(ctx, `이명 「${this.titleName}」`, xr, L.st + 43, { size: 11, align: 'right', weight: 700, color: GOLD, ow: 2 });
    this.renderChips(ctx, L, t);
    this.renderList(ctx, L, t);
    this.renderButtons(ctx, L, t);
    backButton(ctx, L.back.x, L.back.y, '뒤로', this.modal ? null : this);
    // 바닥 줄 오른쪽: 받을 수 없는 이유 + 안내
    const hx = L.hintX, y = L.bottomY, m = promptMode();
    const reason = this.claimReason();
    if (reason) text(ctx, fit(ctx, reason, xr - hx, 11, 600), hx, y + 17, { size: 11, weight: 600, color: '#d8b080', ow: 2 });
    if (m === 'touch') text(ctx, fit(ctx, HINT_TOUCH, xr - hx, 12, 600), hx, y + (reason ? 36 : 27), { size: 12, weight: 600, color: DIM, ow: 2 });
    else hintRow(ctx, [[['prevTab', 'nextTab'], '분류'], ['confirm', '자세히'], ['cancel', '돌아가기']], hx, y + (reason ? 37 : 28), { size: 12 });
  }

  /** 넓은 배치: 왼쪽 분류 칸 */
  renderCats(ctx, L, t) {
    const C = L.cats, rh = C.rowH, focused = this.focus === 'cats';
    frame(ctx, C.x - 6, C.y - 6, C.w + 12, C.h + 12, { corners: false, key: false, top: 'rgba(20,8,20,0.82)', bot: 'rgba(8,3,10,0.86)' });
    this.cats.forEach((c, k) => {
      const r = { x: C.x, y: C.y + k * rh, w: C.w, h: rh - 2 };
      this.zCats[k] = this.modal ? hiddenZone(r, this.ges) : this.ges.zone(r, 'list', { src: 'ach.cat' });
      const sel = k === this.ci, info = this.catInfo[k] ?? { got: 0, total: 0 };
      if (sel) selBar(ctx, r.x, r.y, r.w, r.h, t, { dim: !focused });
      else if (this.ges.over(r)) { ctx.fillStyle = 'rgba(255,220,160,0.06)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      const col = c.id === 'all' ? GOLD : CAT_COL[c.id] ?? GOLD, cy = r.y + r.h / 2;
      glyph(ctx, c.glyph, r.x + 22, cy, 17, sel ? PAL.goldHi : col, 1.6);
      if (info.isNew) { ctx.fillStyle = '#ff3050'; ctx.beginPath(); ctx.arc(r.x + 31, cy - 8, 3.2, 0, TAU); ctx.fill(); }
      text(ctx, c.name, r.x + 40, cy + 5, { size: 15, weight: 800, color: sel ? '#fff4dc' : BONE, ow: 2 });
      const cnt = `${info.got} / ${info.total}`;
      text(ctx, cnt, r.x + r.w - 10, cy + 2, { size: 12, align: 'right', weight: 800, family: FONT.num, color: info.got >= info.total && info.total ? GOLD : '#c8b8a8', ow: 2 });
      const bw = 46, bx = r.x + r.w - 10 - bw, by = cy + 7;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, by, bw, 3);
      if (info.total) { ctx.fillStyle = col; ctx.fillRect(bx, by, bw * (info.got / info.total), 3); }
    });
    if (focused) brackets(ctx, C.x, C.y + this.ci * rh, C.w, rh - 2, t);
  }

  /** 좁은 배치: 분류 칩 띠 (가로로 끌어 넘김, 고른 칩이 보이게) */
  renderChips(ctx, L, t) {
    const R = L.chips, gap = 9;
    const ws = this.cats.map((c) => Math.max(Math.ceil(44 / L.per), Math.round(14 + 18 + 6 + measure(ctx, c.name, 14, 800) + 14)));
    const total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
    this.chipMax = Math.max(0, total - R.w);
    if (this.chipFollow) {
      this.chipFollow = false;
      let x0 = 0;
      for (let k = 0; k < this.ci; k++) x0 += ws[k] + gap;
      const x1 = x0 + (ws[this.ci] ?? 0);
      if (x0 - 24 < this.chipX) this.chipX = x0 - 24; else if (x1 + 24 > this.chipX + R.w) this.chipX = x1 + 24 - R.w;
    }
    this.chipX = clamp(this.chipX, 0, this.chipMax);
    clipBegin(ctx, { x: R.x - 2, y: R.y - 4, w: R.w + 4, h: R.h + 8 });
    let x = R.x - this.chipX;
    this.cats.forEach((c, k) => {
      const r = { x, y: R.y, w: ws[k], h: R.h };
      x += ws[k] + gap;
      this.zCats[k] = clipZone(r, R, 'primary', this.modal ? null : this.ges, 'ach.chip', L.minBtn);
      if (r.x > R.x + R.w || r.x + r.w < R.x) return;
      const sel = k === this.ci, info = this.catInfo[k] ?? {};
      const col = c.id === 'all' ? GOLD : CAT_COL[c.id] ?? GOLD;
      ctx.fillStyle = sel ? 'rgba(150,20,42,0.92)' : 'rgba(18,8,18,0.82)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = sel ? GOLD : 'rgba(200,160,90,0.35)'; ctx.lineWidth = sel ? 2 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      glyph(ctx, c.glyph, r.x + 14 + 9, r.y + r.h / 2, 16, sel ? PAL.goldHi : col, 1.6);
      text(ctx, c.name, r.x + 14 + 18 + 6, r.y + r.h / 2 + 5, { size: 14, weight: 800, color: sel ? '#fff4dc' : '#c8b8a8', ow: 2 });
      if (info.isNew) { ctx.fillStyle = '#ff3050'; ctx.beginPath(); ctx.arc(r.x + r.w - 7, r.y + 8, 3.2, 0, TAU); ctx.fill(); }
    });
    clipEnd(ctx, R, null);
    // 넘치는 쪽 표시
    if (this.chipX > 1) glyph(ctx, 'chevronL', R.x + 2, R.y + R.h / 2, 12, 'rgba(232,200,114,0.7)', 2);
    if (this.chipX < this.chipMax - 1) glyph(ctx, 'chevronR', R.x + R.w - 2, R.y + R.h / 2, 12, 'rgba(232,200,114,0.7)', 2);
  }

  /** '이명 · 장식' · '보상 받기 (k)' 단추 */
  renderButtons(ctx, L, t) {
    const ges = this.ges, rt = L.btnTitles, rc = L.btnClaim;
    const ok = this.claimOK, touch = promptMode() === 'touch';
    this.zTitles = this.modal ? hiddenZone({ ...rt }, ges) : ges.zone({ ...rt }, 'primary', { src: 'ach.titles' });
    this.zClaim = this.modal ? hiddenZone({ ...rc }, ges) : ges.zone({ ...rc }, 'primary', { src: 'ach.claim' });   // 꺼져 있어도 누르면 이유를 보여 준다
    gbutton(ctx, rt, '이명 · 장식', { hot: ges.over(rt), size: 14, t });
    gbutton(ctx, rc, `보상 받기 (${this.sum.claimable})`, { hot: ok && ges.over(rc), disabled: !ok, size: 14, t, accent: '#b07a20' });
    if (ok) glowOval(ctx, rc.x + rc.w / 2, rc.y + rc.h / 2, rc.w * 0.55, rc.h * 0.8, '#ffb040', 0.12 + 0.08 * Math.sin(t * 4));
    if (!L.wide && !touch) {   // 좁은 배치 · 키보드·패드: 단추 안 오른쪽에 글리프
      for (const [r, a] of [[rt, 'alt'], [rc, 'alt2']]) { const gw = glyphWidth(a, 18); if (gw > 0 && r.w > gw + 110) drawGlyph(ctx, a, r.x + r.w - gw - 6, r.y + (r.h - 18) / 2, 18); }
    }
    if (L.wide) {
      const reason = this.claimReason();
      if (reason) text(ctx, fit(ctx, reason, L.cats.w, 11, 600), L.cats.x + L.cats.w / 2, L.reasonY, { size: 11, align: 'center', weight: 600, color: '#d8b080', ow: 2 });
    }
  }

  /** 오른쪽(넓은)·가운데(좁은) 목록 */
  renderList(ctx, L, t) {
    const LR = L.list, rows = this.list(), n = rows.length, st = L.stride, ch = L.cardH;
    ctx.fillStyle = 'rgba(6,2,8,0.42)'; ctx.fillRect(LR.x - 4, LR.y - 4, LR.w + 8, LR.h + 8);
    this.sc.setMax(n * st - (st - ch) - LR.h + (this.err ? 26 : 0));
    if (n && this.sc.shouldFollow(this.ci * 1000 + this.i)) this.sc.ensure(this.i * st, this.i * st + ch, LR.h, 4);
    const ck = ease.outCubic(clamp((this.t - (this.catT ?? -1)) / 0.3, 0, 1));
    clipBegin(ctx, LR);
    const sy = this.sc.y, i0 = Math.max(0, Math.floor(sy / st)), i1 = Math.min(n, Math.ceil((sy + LR.h) / st) + 1);
    let y0 = LR.y;
    if (this.err) { // 엔진 없음: 목록 위 한 줄
      text(ctx, ERR_LINE, LR.x + LR.w / 2, LR.y + 18, { size: 13, align: 'center', weight: 800, color: '#ffb0a0', ow: 2 });
      y0 += 26;
    }
    for (let k = i0; k < i1; k++) {
      const r = { x: LR.x, y: y0 + k * st - sy, w: LR.w - 10, h: ch };
      this.zRows.push({ k, r: clipZone(r, LR, 'list', this.modal ? null : this.ges, 'ach.row', L.minRow) });
      ctx.save();
      if (ck < 1) { ctx.globalAlpha = 0.3 + 0.7 * ck; ctx.translate((1 - ck) * 24, 0); }
      if (L.wide) this.drawCard(ctx, rows[k], r, k === this.i, t);
      else this.drawRow(ctx, rows[k], r, k === this.i, t);
      ctx.restore();
    }
    if (!n) text(ctx, '이 분류에는 업적이 없습니다', LR.x + LR.w / 2, LR.y + 60, { size: 14, align: 'center', color: DIM, ow: 2 });
    clipEnd(ctx, LR, this.sc, 'rgba(8,4,12,0.9)');
    scrollbar(ctx, LR.x + LR.w - 5, LR.y, LR.h, this.sc, LR.h);
  }
  /** 카드 바탕 (선택·달성·반짝임) */
  cardBg(ctx, row, r, sel, t) {
    const hot = sel && (this.focus === 'list' || !this._L?.wide);
    if (sel) selBar(ctx, r.x, r.y, r.w, r.h, t, { dim: !hot });
    else fillGradRect(ctx, hGrad(ctx, Math.round(r.w), row.got ? CARD_GOT : CARD), r.x, r.y, r.w, r.h);
    ctx.strokeStyle = sel ? 'rgba(232,200,114,0.55)' : 'rgba(232,200,114,0.1)'; ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (row.got) { ctx.fillStyle = ptsColor(row.def.pts); ctx.fillRect(r.x, r.y, 3, r.h); }
    const f = this.flash.get(row.def.id);
    if (f !== undefined) {
      const a = clamp(1 - (this.t - f) / 2.5, 0, 1);
      if (a > 0) glowOval(ctx, r.x + r.w * 0.4, r.y + r.h / 2, r.w * 0.5, r.h * 0.9, '#ffd070', a * (0.35 + 0.25 * Math.sin(t * 12)));
    }
  }
  /** 넓은 배치 카드 (높이 66) */
  drawCard(ctx, row, r, sel, t) {
    const d = row.def, got = !!row.got, mr = 24;
    this.cardBg(ctx, row, r, sel, t);
    drawMedal(ctx, r.x + 14 + mr, r.y + r.h / 2 - 3, mr, { cat: d.cat, pts: d.pts, got, hidden: row.hid, isNew: row.isNew, t, glyphName: row.glyph });
    const tx = r.x + 14 + mr * 2 + 16, xr = r.x + r.w - 12;
    // 오른쪽 위: 점수 알약 + 보상 칩
    const pw = pill(ctx, row.ptsTxt, xr, r.y + 9, { align: 'right', color: got ? ptsColor(d.pts) : '#a89a90', size: 11, h: 18 });
    let cw = 0;
    if (!row.hid) {
      const chip = row.claimed ? `${row.rw.short} · 받음` : row.rw.short;
      cw = pill(ctx, fit(ctx, chip, 210, 11, 800), xr - pw - 6, r.y + 9, { align: 'right', size: 11, h: 18, color: row.claimed ? '#9d8f80' : row.rw.kind === 'gold' ? '#f0d090' : '#ffd8a0', bg: row.claimable ? 'rgba(90,50,10,0.92)' : 'rgba(40,20,30,0.9)' }) + 6;
    }
    // 오른쪽 아래: 달성 날짜 또는 진행 막대
    let bw = 0;
    if (got && row.date) { text(ctx, `${row.date} 달성`, xr, r.y + r.h - 11, { size: 12, align: 'right', weight: 700, color: '#c8b080', ow: 0 }); bw = 110; }
    else if (row.progWide) {
      const tw = measure(ctx, row.progWide, 12, 800, FONT.num);
      text(ctx, row.progWide, xr, r.y + r.h - 11, { size: 12, align: 'right', weight: 800, family: FONT.num, color: BONE, ow: 0 });
      const gw = 110;
      gauge(ctx, xr - tw - 10 - gw, r.y + r.h - 19, gw, 6, row.ratio, CAT_COL[d.cat] ?? GOLD, { glowEnd: false });
      bw = tw + 10 + gw;
    }
    // 이름 · 설명 · NEW
    const nw = Math.max(40, xr - pw - cw - 12 - tx);
    const name = fit(ctx, row.name, nw - (row.isNew ? 44 : 0), 16, 800);
    text(ctx, name, tx, r.y + 27, { size: 16, weight: 800, color: got ? '#fff4dc' : row.hid ? '#8a7e80' : '#d8c8b8', ow: 2 });
    if (row.isNew) pill(ctx, 'NEW', tx + measure(ctx, name, 16, 800) + 8, r.y + 14, { color: '#ffe0e6', bg: 'rgba(170,16,40,0.95)', size: 11, h: 16 });
    text(ctx, fit(ctx, row.desc, Math.max(40, xr - bw - 14 - tx), 13, 500), tx, r.y + 50, { size: 13, weight: 500, color: got ? '#c8b8a8' : '#a09080', ow: 0 });
  }
  /** 좁은 배치 줄 (높이 54) */
  drawRow(ctx, row, r, sel, t) {
    const d = row.def, got = !!row.got, mr = 19;
    this.cardBg(ctx, row, r, sel, t);
    drawMedal(ctx, r.x + 10 + mr, r.y + r.h / 2 - 2, mr, { cat: d.cat, pts: d.pts, got, hidden: row.hid, isNew: row.isNew, t, glyphName: row.glyph });
    const tx = r.x + 10 + mr * 2 + 12, xr = r.x + r.w - 12, RW = 92;
    // 오른쪽: ✓ 또는 640/1000 · 점수
    if (got) glyph(ctx, 'check', xr - 10, r.y + 20, 16, PAL.good, 2.2);
    else if (row.progNarrow) text(ctx, row.progNarrow, xr, r.y + 24, { size: 13, align: 'right', weight: 800, family: FONT.num, color: BONE, ow: 0 });
    text(ctx, row.ptsTxt, xr, r.y + 43, { size: 11, align: 'right', weight: 700, color: got ? ptsColor(d.pts) : '#9d8f80', ow: 0 });
    const nw = xr - RW - tx;
    const name = fit(ctx, row.name, nw - (row.isNew ? 44 : 0), 15, 800);
    text(ctx, name, tx, r.y + 23, { size: 15, weight: 800, color: got ? '#fff4dc' : row.hid ? '#8a7e80' : '#d8c8b8', ow: 2 });
    if (row.isNew) pill(ctx, 'NEW', tx + measure(ctx, name, 15, 800) + 8, r.y + 10, { color: '#ffe0e6', bg: 'rgba(170,16,40,0.95)', size: 11, h: 16 });
    text(ctx, fit(ctx, row.desc, nw, 12, 500), tx, r.y + 43, { size: 12, weight: 500, color: got ? '#c8b8a8' : '#a09080', ow: 0 });
  }
  /** 아래쪽 알림 줄 (받기 결과·이유) */
  drawMsg(ctx, L) {
    const m = this.msg;
    if (!m || this.modal) return;
    const a = clamp(m.t / 0.3, 0, 1);
    const w = Math.min(L.W - 40, measure(ctx, m.text, 14, 700) + 40), x = L.W / 2 - w / 2;
    const y = L.wide ? L.H - L.sb - 34 - 46 : L.bottomY - 46;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,4,12,0.92)'; ctx.fillRect(x, y, w, 34);
    ctx.strokeStyle = 'rgba(232,200,114,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 33);
    text(ctx, m.text, L.W / 2, y + 22, { size: 14, align: 'center', weight: 700, color: m.color, ow: 2, maxWidth: w - 20 });
    ctx.restore();
  }
}

// ───────────────────────── 팝업: 자세히 (§7.3) ─────────────────────────
class DetailModal {
  constructor(sc, i) { this.kind = 'detail'; this.sc = sc; this.i = i; this.t = 0; this.open = true; this.btns = []; this.bi = 0; this.box = null; }
  get row() { return this.sc.list()[this.i]; }
  actions(row) {
    const out = [], ti = row?.def?.reward?.title;
    if (ti && row.got && this.sc.game.ach) {
      const using = this.sc.titleId === ti;
      out.push({ id: 'useTitle', label: using ? '쓰는 중인 이명' : '이 이명 쓰기', disabled: using });
    }
    out.push({ id: 'close', label: '닫기' });
    return out;
  }
  close() { this.open = false; }
  update(dt, nav, ges) {
    this.t += dt;
    const row = this.row;
    if (!row) { this.close(); return false; }
    const acts = this.actions(row);
    this.bi = clamp(this.bi, 0, acts.length - 1);
    for (let k = 0; k < this.btns.length; k++) {
      if (ges.hoverIn(this.btns[k])) this.bi = k;
      if (ges.tap(this.btns[k])) { this.run(acts[k], row); return this.open; }
    }
    if (ges.tapOK && this.box && !inRect(input.pointer.x, input.pointer.y, this.box)) { audio.sfx('menu_cancel'); this.close(); return false; }
    const n = this.sc.list().length;
    if (nav.left && this.bi > 0) { this.bi--; audio.sfx('menu_move'); }
    else if (nav.right && this.bi < acts.length - 1) { this.bi++; audio.sfx('menu_move'); }
    else if (nav.up && this.i > 0) { this.i--; this.sc.i = this.i; this.bi = 0; audio.sfx('menu_move'); }
    else if (nav.down && this.i < n - 1) { this.i++; this.sc.i = this.i; this.bi = 0; audio.sfx('menu_move'); }
    else if (nav.confirm) { this.run(acts[this.bi], row); return this.open; }
    else if (nav.alt) { this.close(); this.sc.openPick(); return false; }
    else if (nav.cancel || nav.menu) { audio.sfx('menu_cancel'); this.close(); return false; }
    return true;
  }
  run(a, row) {
    if (!a) return;
    if (a.disabled) { audio.sfx('menu_cancel'); return; }
    if (a.id === 'close') { audio.sfx('menu_cancel'); this.close(); return; }
    if (a.id === 'useTitle') {
      if (this.sc.setTitle(row.def.reward.title)) { audio.sfx('menu_ok'); this.sc.note(cloud.loggedIn ? '이명을 정했습니다 — 순위표의 별명 옆에 보입니다' : '로그인하면 순위표의 별명 옆에 보입니다', PAL.goldHi, 3.2); this.close(); }
      else audio.sfx('menu_cancel');
    }
  }
  render(ctx, L, t) {
    const row = this.row;
    if (!row) return;
    const W = L.W, H = L.H, d = row.def, got = !!row.got;
    const w = Math.min(580, W - 40), pad = 24;
    const lines = wrapC(ctx, row.desc, w - pad * 2, 15, 500, FONT.body);
    const showBar = !!row.bar && !got && !row.hid;
    const src = got ? safe(() => this.sc.game.achNotify?.srcOf?.(d.id), null) : null;
    const extra = row.hid ? 1 : 0;
    const h = Math.min(H - 16, 118 + lines.length * 22 + 14 + (showBar ? 30 : 0) + (row.hid ? 0 : 26) + (got ? 24 : 0) + extra * 22 + 12 + 44 + 18);
    const x = Math.round((W - w) / 2), y = Math.round(clamp((H - h) / 2, L.st + 8, H - L.sb - h - 8));
    this.box = { x, y, w, h };
    const k = ease.outBack(clamp(this.t / 0.16, 0, 1));
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.55 * clamp(this.t / 0.12, 0, 1)})`; ctx.fillRect(0, 0, W, H);
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.88 + 0.12 * k, 0.88 + 0.12 * k); ctx.translate(-(x + w / 2), -(y + h / 2));
    glowOval(ctx, x + w / 2, y + h / 2, w * 0.75, h * 0.75, got ? '#6a3a10' : '#4a0a20', 0.35);
    frame(ctx, x, y, w, h, { top: 'rgba(34,16,36,0.98)', bot: 'rgba(10,4,12,0.98)', edge: PAL.goldMid });
    const mr = 36;
    drawMedal(ctx, x + pad + mr, y + 22 + mr, mr, { cat: d.cat, pts: d.pts, got, hidden: row.hid, isNew: row.isNew, t, glyphName: row.glyph });
    const tx = x + pad + mr * 2 + 18;
    text(ctx, fit(ctx, row.name, x + w - pad - tx, 21, 800, FONT.title), tx, y + 52, { size: 21, weight: 800, family: FONT.title, color: got ? '#fff4dc' : BONE, ow: 3 });
    text(ctx, `${this.sc.catName(d.cat)} · ${row.ptsTxt}`, tx, y + 78, { size: 13, weight: 700, color: got ? ptsColor(d.pts) : DIM, ow: 2 });
    divider(ctx, x + pad, y + 108, w - pad * 2);
    let yy = y + 136;
    lines.forEach((ln, i) => text(ctx, ln, x + pad, yy + i * 22, { size: 15, weight: 500, color: PAL.text, ow: 2 }));
    yy += lines.length * 22 + 6;
    if (row.hid) { text(ctx, '조건을 채우면 공개됩니다', x + pad, yy + 4, { size: 13, weight: 600, color: DIM, ow: 2 }); yy += 22; }
    if (showBar) {
      const pt = `${fmt(Math.max(0, Number(row.cur) || 0))} / ${fmt(Math.max(1, Number(row.need) || 1))}`;
      const tw = measure(ctx, pt, 14, 800, FONT.num);
      gauge(ctx, x + pad, yy + 2, w - pad * 2 - tw - 14, 8, row.ratio, CAT_COL[d.cat] ?? GOLD);
      text(ctx, pt, x + w - pad, yy + 11, { size: 14, align: 'right', weight: 800, family: FONT.num, color: BONE, ow: 2 });
      yy += 30;
    }
    if (!row.hid) {
      text(ctx, '보상', x + pad, yy + 6, { size: 13, weight: 700, color: DIM, ow: 2 });
      const rw = row.rw.long + (row.claimed ? ' · 받음' : '');
      text(ctx, fit(ctx, rw, w - pad * 2 - 44, 14, 800), x + pad + 40, yy + 6, { size: 14, weight: 800, color: row.claimed ? DIM : '#ffd8a0', ow: 2 });
      yy += 26;
    }
    if (got) {
      const ds = `${row.date} 달성${src === 'retro' || src === 'cloud' ? ' · 지난 기록으로 달성' : ''}`;
      text(ctx, ds, x + pad, yy + 6, { size: 13, weight: 700, color: '#c8b080', ow: 2 });
      yy += 24;
    }
    // 단추
    const acts = this.actions(row), bw = 168, bh = 44, gap = 14;
    const bx0 = x + w / 2 - (acts.length * bw + (acts.length - 1) * gap) / 2, by = y + h - bh - 16;
    this.btns.length = 0;
    acts.forEach((a, i) => {
      const r = { x: bx0 + i * (bw + gap), y: by, w: bw, h: bh };
      this.btns.push(zone(r, 'primary', this, { src: 'ach.detail' }));
      gbutton(ctx, r, a.label, { hot: i === this.bi, disabled: a.disabled, size: 15, t: this.t, icon: a.id === 'useTitle' ? 'crown' : null });
    });
    ctx.restore();
  }
}

// ───────────────────────── 팝업: 이명 · 장식 · 외형 (§7.3 + 벤치마크 5) ─────────────────────────
// 두 쪽 (머리의 탭 둘): 0 = 이명 · 장식 (목록 0 이명 · 1 장식), 1 = 외형 (목록 2 대시 잔상 색, data/cosmetics.js — 오른쪽(넓은)·아래(좁은)에 미리 보기).
// prevTab/nextTab 은 목록 0 → 1 → 2 → 0 으로 돈다 (쪽은 목록을 따른다). 잠긴 잔상은 칸에 조건(짧게) · 고르면 조건 한 줄
const PICK_TABS = ['이명 · 장식', '외형'];
const PAGE_OF = [0, 0, 1];
const PAGE_LISTS = [[0, 1], [2]];
const PICK_SRC = ['ach.pick.title', 'ach.pick.deco', 'ach.pick.trail'];
const PICK_HEADS = ['이명', '타이틀 장식', '대시 잔상'];
const PICK_NOTE = ['이명은 명예의 전당 온라인 순위표에, 장식은 타이틀 화면에 보입니다', '대시할 때 남는 잔상의 색만 바뀝니다 — 능력치와는 무관합니다'];
const LOCK_COL = '#4a3e44';

/** 대시하는 사냥꾼 실루엣 (미리 보기 잔상 한 장, 발끝 = (x, y), 오른쪽으로 달린다) — 경로만, 그라디언트·캔버스 없음 */
function dashFigure(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x + 4 * s, y - 31 * s, 4.6 * s, 0, TAU);
  ctx.moveTo(x - 4 * s, y - 26 * s); ctx.lineTo(x + 8 * s, y - 25 * s); ctx.lineTo(x + 5 * s, y - 12 * s);
  ctx.lineTo(x + 14 * s, y - 2 * s); ctx.lineTo(x + 10 * s, y); ctx.lineTo(x + 1 * s, y - 9 * s);
  ctx.lineTo(x - 10 * s, y - 2 * s); ctx.lineTo(x - 13 * s, y - 5 * s); ctx.lineTo(x - 4 * s, y - 13 * s); ctx.closePath();
  ctx.moveTo(x - 3 * s, y - 26 * s); ctx.quadraticCurveTo(x - 17 * s, y - 23 * s, x - 24 * s, y - 12 * s); ctx.lineTo(x - 7 * s, y - 15 * s); ctx.closePath();
  ctx.moveTo(x + 7 * s, y - 23 * s); ctx.lineTo(x + 24 * s, y - 27 * s); ctx.lineTo(x + 24 * s, y - 25.4 * s); ctx.lineTo(x + 7 * s, y - 20.6 * s); ctx.closePath();
  ctx.fill();
}

class PickModal {
  constructor(sc) {
    this.kind = 'pick'; this.sc = sc; this.t = 0; this.open = true; this.box = null; this.msg = null;
    this.L = 0; this.L0 = 0; this.k = [0, 0, 0]; this.zones = [[], [], []]; this.closeR = null; this.tabR = [null, null];
    this.scs = [new Scroller(), new Scroller(), new Scroller()];
    this.cos = this.readCos();
    this.load();
    for (let i = 0; i < 3; i++) this.k[i] = Math.max(0, this.lists[i].findIndex((it) => it.id === this.cur[i]));
    this.scs[0].follow(this.k[0]);
  }
  get page() { return PAGE_OF[this.L] ?? 0; }
  /** 잔상 해금 문맥 (열 때 한 번): 업적·탑 최고 층·지난 회차 — 회차는 슬롯 1–3 과 지금 슬롯을 읽는다 */
  readCos() {
    const g = this.sc.game, states = [g.state];
    for (const s of [1, 2, 3]) states.push(safe(() => saves.read(s), null));
    return safe(() => COS.cosContext(g.meta, states), null) ?? { got: {}, tower: 0, ng: 0 };
  }
  /** 이명 17 · 장식 5 · 잔상 6 (+ '이명 없음' · '기본 불씨' · '직업 기본'). 숨긴 업적이 주는 것은 그 업적을 달성하기 전까지 출처를 '???' 로 */
  load() {
    const A = this.sc.game.ach, g = this.sc.game;
    const from = (achId) => {
      const def = this.sc.defById.get(achId);
      if (!def) return '';
      const st = this.sc.rowsAll.find((r) => r.def.id === achId);
      return def.hidden && !st?.got ? '???' : def.name;
    };
    const fixList = (arr, table) => (Array.isArray(arr) ? arr : Object.keys(table ?? {}).map((id) => ({ id, name: table[id].name, got: false, from: null })))
      .map((it) => ({ id: it.id, name: it.name ?? table?.[it.id]?.name ?? it.id, got: !!it.got, from: from(it.from) }));
    const titles = fixList(A ? safe(() => A.titles(), null) : null, AM.ACH_TITLES);
    const decos = fixList(A ? safe(() => A.decos(), null) : null, AM.ACH_DECOS);
    // 잔상: 고른 것은 (조건 기록이 사라졌어도) 쓸 수 있는 칸으로 — 고를 때만 확인한다 (data/cosmetics.js)
    const curTrail = COS.trailId(g.meta);
    const ult = CHARACTERS[g.state?.charId]?.ult?.color ?? CHARACTERS[g.world?.player?.ch?.id]?.ult?.color ?? '#8ac8ff';
    if (this.ultC !== ult) { this.ultC = ult; this.baseRamp = [0, 1, 2, 3, 4, 5].map((i) => mix(ult, '#ffffff', i / 5)); }
    const trails = [{ id: null, name: COS.TRAIL_DEFAULT.name, desc: COS.TRAIL_DEFAULT.desc, got: true, from: '', long: '', ramp: this.baseRamp }];
    for (const id of COS.TRAIL_IDS) {
      const d = COS.TRAILS[id], nt = COS.needText(d.need, from);
      trails.push({ id, name: d.name, desc: d.desc, got: id === curTrail || COS.ownsTrail(id, this.cos), from: nt.short, long: nt.long, ramp: d.ramp });
    }
    this.lists = [[{ id: null, name: '이명 없음', got: true, from: '' }, ...titles], [{ id: null, name: '기본 불씨', got: true, from: '' }, ...decos], trails];
    this.cur = [A ? safe(() => A.title(), null) : null, A ? safe(() => A.deco(), null) : null, curTrail];
  }
  close() { this.open = false; }
  cols(L) { return this.lay?.cols?.[L] ?? 1; }
  /** 쪽 바꾸기 (탭): 외형 = 목록 2, 이명 · 장식 = 마지막으로 보던 목록 0/1 */
  setPage(pg) {
    if (pg === this.page) return;
    if (this.L < 2) this.L0 = this.L;
    this.L = pg === 1 ? 2 : this.L0;
    this.scs[this.L].follow(this.k[this.L]);
    audio.sfx('menu_move');
  }
  move(dk) {
    const L = this.L, n = this.lists[L].length, c = this.cols(L);
    let k = this.k[L] + dk;
    if (k < 0 || k >= n) {
      if (this.lay?.wide) return false;
      // 좁은 배치(위아래): 목록 끝에서 다른 목록으로 (이명 · 장식 쪽 안에서만)
      if (dk > 0 && L === 0) { this.L = 1; this.k[1] = Math.min(this.lists[1].length - 1, this.k[0] % c); this.scs[1].follow(this.k[1]); return true; }
      if (dk < 0 && L === 1) { this.L = 0; const c0 = this.cols(0), n0 = this.lists[0].length; const col = Math.min(this.k[1] % c, c0 - 1); this.k[0] = Math.min(n0 - 1, Math.floor((n0 - 1) / c0) * c0 + col); this.scs[0].follow(this.k[0]); return true; }
      return false;
    }
    if (Math.abs(dk) === 1 && c > 1 && Math.floor(k / c) !== Math.floor(this.k[L] / c)) return false;
    this.k[L] = k; this.scs[L].follow(k);
    return true;
  }
  choose(L, k) {
    const it = this.lists[L][k];
    if (!it) return;
    if (!it.got) {
      audio.sfx('menu_cancel');
      const why = L === 2 ? it.long || '아직 얻지 못했습니다' : it.from && it.from !== '???' ? `「${it.from}」 업적을 달성하면 쓸 수 있습니다` : '아직 얻지 못했습니다';
      this.msg = { text: why, color: PAL.warn, t: 2.6 };
      return;
    }
    if (it.id === this.cur[L]) { audio.sfx('menu_move'); return; }
    const ok = L === 0 ? this.sc.setTitle(it.id) : L === 1 ? this.sc.setDeco(it.id) : this.sc.setTrail(it.id);
    if (!ok) { audio.sfx('menu_cancel'); this.msg = { text: '바꾸지 못했습니다', color: PAL.bad, t: 2.4 }; return; }
    audio.sfx('menu_ok');
    this.load();
    if (L === 0) this.msg = { text: !it.id ? '이명 없음' : cloud.loggedIn ? '이명을 정했습니다 — 순위표의 별명 옆에 보입니다' : '로그인하면 순위표의 별명 옆에 보입니다', color: PAL.goldHi, t: 3 };
    else if (L === 1) this.msg = { text: `타이틀 장식 「${it.name}」`, color: PAL.goldHi, t: 3 };
    else this.msg = { text: it.id ? `대시 잔상 「${it.name}」 — 모든 영웅의 대시에 남습니다` : '직업 기본 잔상으로 돌아갑니다', color: PAL.goldHi, t: 3 };
  }
  update(dt, nav, ges) {
    this.t += dt;
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) this.msg = null; }
    const shown = PAGE_LISTS[this.page];
    if (this.lay) for (const L of shown) this.scs[L].update(dt, this.lay.areas[L], ges);
    if (ges.tap(this.closeR)) { audio.sfx('menu_cancel'); this.close(); return false; }
    for (let pg = 0; pg < 2; pg++) if (this.tabR[pg] && ges.tap(this.tabR[pg])) { this.setPage(pg); return true; }
    for (const L of shown) {
      if (this.scs[L].dragging) continue;
      for (const z of this.zones[L]) {
        if (z.r.thid) continue;
        if (ges.hoverIn(z.r) && (this.L !== L || this.k[L] !== z.k)) { this.L = L; this.k[L] = z.k; }
        if (ges.tap(z.r)) { this.L = L; this.k[L] = z.k; this.choose(L, z.k); return true; }
      }
    }
    if (ges.tapOK && this.box && !inRect(input.pointer.x, input.pointer.y, this.box)) { audio.sfx('menu_cancel'); this.close(); return false; }
    if (nav.cancel || nav.menu || nav.alt) { audio.sfx('menu_cancel'); this.close(); return false; }
    if (nav.prevTab || nav.nextTab) {
      this.L = (this.L + (nav.prevTab ? 2 : 1)) % 3;
      if (this.L < 2) this.L0 = this.L;
      this.scs[this.L].follow(this.k[this.L]); audio.sfx('menu_move');
      return true;
    }
    const c = this.cols(this.L);
    let moved = false;
    if (nav.up) moved = this.move(-c);
    else if (nav.down) moved = this.move(c);
    else if (nav.left) { moved = this.move(-1); if (!moved && this.lay?.wide && this.L === 1) { this.L = 0; moved = true; } }
    else if (nav.right) { moved = this.move(1); if (!moved && this.lay?.wide && this.L === 0) { this.L = 1; moved = true; } }
    else if (nav.confirm) this.choose(this.L, this.k[this.L]);
    if (moved) { if (this.L < 2) this.L0 = this.L; audio.sfx('menu_move'); }
    return true;
  }
  layout(L0) {
    const W = L0.W, H = L0.H;
    if (L0.wide) {
      const w = Math.min(820, W - 48), h = Math.min(H - 40 - L0.st - L0.sb, 452), x = Math.round((W - w) / 2), y = Math.round(L0.st + (H - L0.st - L0.sb - h) / 2);
      const lw = Math.round((w - 60) * 0.56), rx = x + 24 + lw + 12, ah = h - 90 - 48;
      return {
        wide: true, x, y, w, h, cols: [1, 1, 1], rowH: [36, 40, 40], gap: [0, 4, 4],
        close: { x: x + w - 54, y: y + 8, w: 44, h: 44 },
        tabs: [{ x: x + 20, y: y + 8, w: 142, h: 44 }, { x: x + 170, y: y + 8, w: 92, h: 44 }],
        heads: [{ x: x + 24, y: y + 78 }, { x: rx, y: y + 78 }, { x: x + 24, y: y + 78 }],
        areas: [{ x: x + 24, y: y + 90, w: lw, h: ah }, { x: rx, y: y + 90, w: x + w - 24 - rx, h: ah }, { x: x + 24, y: y + 90, w: lw, h: ah }],
        prev: { x: rx, y: y + 66, w: x + w - 24 - rx, h: ah + 24 },
        noteY: y + h - 20,
      };
    }
    const x = L0.sl + 8, y = L0.st + 6, w = W - L0.sl - L0.sr - 16, h = H - L0.st - L0.sb - 12;
    const decoH = 44 * 2 + 9, top = y + 78, noteH = 26;
    const tH = h - (top - y) - 26 - decoH - noteH - 6;
    // 외형 쪽: 잔상 2열 × 4줄(44) 목록 + 아래 미리 보기 띠 (모자라면 목록이 줄고 스크롤)
    const avail = h - (top - y) - noteH - 6, trH = Math.max(44, Math.min(44 * 4, avail - 96)), pv = top + trH + 10;
    return {
      wide: false, x, y, w, h, cols: [2, 3, 2], rowH: [44, 44, 44], gap: [0, 9, 0],
      close: { x: x + w - 54, y: y + 6, w: 44, h: 44 },
      tabs: [{ x: x + 14, y: y + 6, w: 134, h: 44 }, { x: x + 156, y: y + 6, w: 84, h: 44 }],
      heads: [{ x: x + 18, y: top - 7 }, { x: x + 18, y: top + tH + 19 }, { x: x + 18, y: top - 7 }],
      areas: [{ x: x + 14, y: top, w: w - 28, h: tH }, { x: x + 14, y: top + tH + 26, w: w - 28, h: decoH }, { x: x + 14, y: top, w: w - 28, h: trH }],
      prev: { x: x + 14, y: pv, w: w - 28, h: Math.max(40, top + avail - pv) },
      noteY: y + h - 10,
    };
  }
  render(ctx, L0, t) {
    const P = this.lay = this.layout(L0);
    const W = L0.W, H = L0.H, pg = this.page;
    this.box = { x: P.x, y: P.y, w: P.w, h: P.h };
    const kk = ease.outBack(clamp(this.t / 0.16, 0, 1));
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.55 * clamp(this.t / 0.12, 0, 1)})`; ctx.fillRect(0, 0, W, H);
    ctx.translate(P.x + P.w / 2, P.y + P.h / 2); ctx.scale(0.9 + 0.1 * kk, 0.9 + 0.1 * kk); ctx.translate(-(P.x + P.w / 2), -(P.y + P.h / 2));
    frame(ctx, P.x, P.y, P.w, P.h, { top: 'rgba(34,16,36,0.98)', bot: 'rgba(10,4,12,0.98)', edge: PAL.goldMid });
    // 머리: 쪽 탭 둘 · 쪽 안내 한 줄 · 닫기
    for (let i = 0; i < 2; i++) {
      const r = P.tabs[i];
      this.tabR[i] = zone(r, 'primary', this, { src: 'ach.pick.tab' });
      gbutton(ctx, r, PICK_TABS[i], { hot: pg === i, size: 14, t: this.t, color: pg === i ? null : this.sc.ges.over(r) ? PAL.goldHi : null });
    }
    const nx = P.tabs[1].x + P.tabs[1].w + 14;
    text(ctx, fit(ctx, PICK_NOTE[pg], P.close.x - 10 - nx, 12, 600), nx, P.y + 35, { size: 12, weight: 600, color: DIM, ow: 2 });
    this.closeR = zone(P.close, 'icon', this, { src: 'ach.pick.close' });
    gbutton(ctx, P.close, '', { hot: this.sc.ges.over(P.close), size: 15, t: this.t });
    glyph(ctx, 'cross', P.close.x + 22, P.close.y + 22, 16, PAL.bone, 2.2);
    divider(ctx, P.x + 20, P.y + 54, P.w - 40, { center: false, a: 0.5 });
    for (let Li = 0; Li < 3; Li++) if (PAGE_OF[Li] !== pg) this.zones[Li].length = 0;
    for (const Li of PAGE_LISTS[pg]) {
      const A = P.areas[Li], items = this.lists[Li], c = P.cols[Li], rh = P.rowH[Li], gp = P.gap[Li];
      const focus = this.L === Li;
      text(ctx, PICK_HEADS[Li], P.heads[Li].x, P.heads[Li].y, { size: 14, weight: 800, color: focus ? GOLD : '#c8b8a8', ow: 2 });
      const rows = Math.ceil(items.length / c), stride = rh + gp;
      const sc = this.scs[Li];
      sc.setMax(rows * stride - gp - A.h);
      const kr = Math.floor(this.k[Li] / c);
      if (sc.shouldFollow(this.k[Li])) sc.ensure(kr * stride, kr * stride + rh, A.h, 2);
      clipBegin(ctx, A);
      this.zones[Li].length = 0;
      const cw = (A.w - 8 - (c - 1) * 9) / c;
      items.forEach((it, k) => {
        const r = { x: A.x + (k % c) * (cw + 9), y: A.y + Math.floor(k / c) * stride - sc.y, w: cw, h: rh };
        if (r.y + r.h < A.y - 2 || r.y > A.y + A.h + 2) return;
        const kind = Li === 1 && !P.wide ? 'primary' : 'list';
        this.zones[Li].push({ k, r: clipZone(r, A, kind, this, PICK_SRC[Li], kind === 'list' ? L0.minRow : L0.minBtn) });
        this.drawItem(ctx, Li, it, r, focus && this.k[Li] === k, it.id === this.cur[Li], t);
      });
      clipEnd(ctx, A, sc, 'rgba(14,6,16,0.95)');
      scrollbar(ctx, A.x + A.w - 4, A.y, A.h, sc, A.h);
    }
    if (pg === 1) this.drawPreview(ctx, P, t);
    // 아래: 고른 뒤 한 줄 또는 안내
    if (this.msg) text(ctx, fit(ctx, this.msg.text, P.w - 40, 13, 700), P.x + P.w / 2, P.noteY, { size: 13, align: 'center', weight: 700, color: this.msg.color, ow: 2 });
    else if (promptMode() === 'touch') text(ctx, '누르면 바로 바뀝니다', P.x + P.w / 2, P.noteY, { size: 12, align: 'center', weight: 600, color: DIM, ow: 2 });
    else hintRow(ctx, [['dpad', '고르기'], ['confirm', '정하기'], [['prevTab', 'nextTab'], '이명 · 장식 · 외형'], ['cancel', '닫기']], P.x + P.w / 2, P.noteY, { align: 'center', size: 12 });
    ctx.restore();
  }
  /** 외형 쪽 미리 보기: 고른(초점) 잔상의 이름·설명 + 잔상 다섯 장(오래된 것 = 진한 색, 앞 = 밝은 색) + 상태 한 줄 */
  drawPreview(ctx, P, t) {
    const R = P.prev, it = this.lists[2][this.k[2]];
    if (!it || R.h < 30) return;
    ctx.fillStyle = 'rgba(255,230,200,0.035)'; ctx.fillRect(R.x, R.y, R.w, R.h);
    ctx.strokeStyle = 'rgba(232,200,114,0.28)'; ctx.lineWidth = 1; ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    const ramp = it.ramp ?? this.baseRamp, got = !!it.got, cur = it.id === this.cur[2];
    const tall = R.h >= 150;
    // 글: 넓은 배치는 위에 두 줄, 좁은 띠는 왼쪽 칸에
    const tx = R.x + 14, tw = tall ? R.w - 28 : Math.min(R.w * 0.42, 300);
    text(ctx, fit(ctx, it.name, tw, 17, 800, FONT.title), tx, R.y + 26, { size: 17, weight: 800, family: FONT.title, color: got ? ramp[2] : '#8a7e80', ow: 3 });
    text(ctx, fit(ctx, it.desc ?? '', tw, 12, 600), tx, R.y + 46, { size: 12, weight: 600, color: got ? '#c8b8a8' : '#8a7e80', ow: 2 });
    const st = cur ? '쓰는 중' : got ? '쓸 수 있음' : it.long;
    const sy = tall ? R.y + R.h - 14 : R.y + 66;
    if (!got) glyph(ctx, 'lock', tx + 5, sy - 4, 11, '#a08a70', 1.4);
    text(ctx, fit(ctx, st, tw - (got ? 0 : 16), 12, 700), tx + (got ? 0 : 16), sy, { size: 12, weight: 700, color: cur ? PAL.good : got ? GOLD : '#d8b080', ow: 2 });
    // 잔상 그림: 발끝 기준선 · 크기는 칸 높이에 맞춘다
    const gx0 = tall ? R.x + 30 : R.x + tw + 40, gx1 = R.x + R.w - 34;
    const gy = tall ? R.y + 62 + (R.h - 62 - 30) * 0.5 + 24 : R.y + R.h - 12;
    const s = clamp((tall ? (R.h - 110) : (R.h - 18)) / 40, 0.7, 1.9);
    const run = Math.sin(t * 2.2) * 6 * s, step = Math.max(14 * s, Math.min(30 * s, (gx1 - gx0 - 30 * s) / 5));
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(gx0 - 10, gy, gx1 - gx0 + 20, 2);
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = (got ? 0.2 + 0.13 * i : 0.12 + 0.05 * i);
      ctx.fillStyle = got ? ramp[i] : LOCK_COL;
      dashFigure(ctx, gx1 - 30 * s - (5 - i) * step + run, gy, s);
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#16080e';
    dashFigure(ctx, gx1 - 30 * s + run, gy, s);
    ctx.strokeStyle = got ? ramp[5] : '#5a4e54'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  drawItem(ctx, Li, it, r, sel, cur, t) {
    if (sel) selBar(ctx, r.x, r.y, r.w, r.h - 2, t);
    else { ctx.fillStyle = cur ? 'rgba(90,40,20,0.55)' : 'rgba(255,230,200,0.035)'; ctx.fillRect(r.x, r.y, r.w, r.h - 2); }
    if (cur) { ctx.strokeStyle = GOLD; ctx.lineWidth = 1.2; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 3); }
    const cy = r.y + (r.h - 2) / 2;
    let x = r.x + 14;
    if (cur) glyph(ctx, 'check', x + 6, cy, 14, PAL.good, 2.2);
    else if (!it.got) glyph(ctx, 'lock', x + 6, cy, 12, '#7a6a70', 1.4);
    x += 22;
    if (Li === 1) {
      const col = it.id ? AM.ACH_DECOS?.[it.id]?.amb?.emberColor ?? '#ff8a3a' : '#ff8a3a';
      ctx.fillStyle = it.got ? col : LOCK_COL; ctx.beginPath(); ctx.arc(x + 6, cy, 6, 0, TAU); ctx.fill();
      if (it.got) glowOval(ctx, x + 6, cy, 14, 14, col, 0.5);
      x += 20;
    } else if (Li === 2) {
      // 잔상 색 견본: 비스듬한 띠 셋 (진한 색 → 밝은 색)
      const ramp = it.ramp ?? this.baseRamp;
      for (let i = 0; i < 3; i++) {
        const bx = x + i * 7;
        ctx.fillStyle = it.got ? ramp[i * 2] : LOCK_COL;
        ctx.beginPath(); ctx.moveTo(bx + 3, cy - 8); ctx.lineTo(bx + 8, cy - 8); ctx.lineTo(bx + 5, cy + 8); ctx.lineTo(bx, cy + 8); ctx.closePath(); ctx.fill();
      }
      x += 30;
    }
    const label = Li === 0 && it.id ? `「${it.name}」` : it.name;
    const fw = it.from ? Math.min(r.w * 0.42, measure(ctx, it.from, 11, 600) + 4) : 0;
    text(ctx, fit(ctx, label, r.x + r.w - 12 - fw - 8 - x, 14, 800), x, cy + 5, { size: 14, weight: 800, color: !it.got ? '#7a6e70' : sel ? '#fff4dc' : cur ? GOLD : BONE, ow: 2 });
    if (it.from) text(ctx, fit(ctx, it.from, fw, 11, 600), r.x + r.w - 12, cy + 4, { size: 11, align: 'right', weight: 600, color: it.got ? '#a89a80' : '#6a5e60', ow: 0 });
  }
}
