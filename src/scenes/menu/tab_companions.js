// 메뉴 탭 「동료」 — owner: CMP-UI (companions §7.2; MASTER_PLAN §1.13 — MENU_TABS 'companions' 줄은 PLAT-MENU, glyph 'paw')
//
// 배치 (본문 A 안; 메뉴는 uiScale 장면 → A 는 UI px. 휴대폰 740×360 이면 A ≈ 860×320):
//   위 띠 (h 54)   편성: 탈것 · 수호신 1 · 수호신 2 (8장 전엔 자물쇠 '8장 클리어 시 개방') · 자동 스킬 켬/끔/기기 기본
//   왼쪽 목록      '탈것 | 수호신' 나눔 단추 + 줄 52 px (아이콘 40 · 이름·칭호 · Lv · 유대 하트 5 · 장착/NEW/부화 대기 배지).
//                  잠긴 동료 = 검은 아이콘 · '???' · 합류 방법(obtain.hint). Scroller (끌기·휠·오른쪽 스틱, 선택 따라가기 P-01)
//   가운데 미리보기 HeroStage 무대. 탈것 = 지금 영웅을 태운 모습(p.ride; mount.js mountView) 을 idle 2초 → walk 2초 → run 2초 → special 1초
//                  순환 (탭·C 로 다음 동작). 수호신 = 영웅 대기 + 기준점의 수호신, 가끔 공격·스킬 자세. 레벨·유대가 오르면 반짝임.
//   오른쪽 상세    이름(FONT.title 22) · 칭호 · Lv/EXP 게이지 · 유대 하트 + 단계 이름 + 다음 단계 · 능력치 · 능력 목록(데이터 desc) ·
//                  단추: 장착/해제 (탈것) · 수호신 1에 장착 / 수호신 2에 장착 / 해제 (수호신). 내용이 넘치면 끌어서 스크롤.
//   빈 상태        '아직 동료가 없습니다' + '1장을 클리어하면 …'
// 조작: ↑↓ 목록 · ←→ 목록 ↔ 단추 · Z 장착/해제 · X 뒤로 · A(패드 Y) 자동 스킬 · C(패드 LT) 동작 보기 · 목록 맨 위에서 ↑ = 나눔 단추 → 편성 띠 → 탭
//       터치: 줄·단추·편성 칸·나눔 단추 터치, 목록·상세 끌기, 미리보기 터치 = 다음 동작
// 장착을 바꾸면 equipMount/equipGuardian → this.m.changed() → world.companions.sync() → this.m.notify('그림메인을 장착했다')
// 합류 연출을 보지 않은(pending) 동료를 0.8초 넘게 보고 있으면 본 것으로 (markSeen → NEW 사라짐)
import { text, font, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { input } from '../../core/input.js';
import { assets } from '../../core/assets.js';
import { TAU, clamp } from '../../core/math.js';
import * as HERO from '../../render/hero.js';
import { Tab } from './base.js';
import * as HV from './hero_view.js';
import {
  PAL, frame, heading, divider, brackets, glow, glowOval, pill, gauge, glyph, ellipsize, wrapC, selBar, gbutton,
  Scroller, scrollbar, clipBegin, clipEnd, rr,
} from './common.js';
import * as D from './access.js';
import { STAT_INFO } from '../../game/stats.js';
import {
  MOUNT_IDS, GUARDIAN_IDS, BOND_NAMES, BOND_PERKS, CMP_TEXT, companionDef, bondRank,
} from '../../data/companions.js';
import * as CS from '../../game/companion_state.js';
import { drawCompanionIcon } from '../../render/companion_hud.js';
import { playCry } from '../../core/audio_companions.js';
import { CompanionFigure } from '../companion_join.js';

const STRIP_H = 54, SEG_H = 40, SEG_H_TOUCH = 46, ROW_H = 52, BTN_H = 44, GAP = 10;
const MOUNT_CYCLE = [['idle', 2], ['walk', 2], ['run', 2], ['special', 1]];
const GUARD_CYCLE = [['idle', 2.4], ['attack', 0.9], ['idle', 2.2], ['skill', 1.3]];
const SEEN_DELAY = 0.8;
/** 이번 실행에서 마지막으로 본 레벨·유대 (메뉴를 다시 열었을 때 올랐으면 반짝임) */
const LAST_SEEN = new Map();
const ELNAME = { fire: '화염', ice: '냉기', holy: '신성', dark: '암흑', thunder: '번개' };

function fmtNum(v) {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 100) / 100;
  return Math.abs(r - Math.round(r)) < 0.005 ? Math.round(r).toLocaleString('ko-KR') : String(r);
}
/** 오라 수치 문장: 'HP 재생/초 +0.8 · 신성 저항 +10%' */
function auraText(def, lv, rank) {
  const a = def.aura ?? {}, mul = rank >= 2 ? 1.5 : 1, out = [];
  for (const k of new Set([...Object.keys(a.base || {}), ...Object.keys(a.perLv || {})])) {
    const v = ((a.base?.[k] ?? 0) + (a.perLv?.[k] ?? 0) * (lv - 1)) * mul;
    if (!v) continue;
    const info = STAT_INFO[k];
    out.push(`${info?.name ?? k} +${fmtNum(v)}${info?.pct ? '%' : ''}`);
  }
  return out.join(' · ') || '없음';
}

export class CompanionsTab extends Tab {
  constructor(m) {
    super(m);
    this.kind = 'mount';
    this.sel = { mount: 0, guardian: 0 };
    this.area = 'list';        // 'loadout' | 'seg' | 'list' | 'btns'
    this.loI = 0; this.btnI = 0;
    this.sc = new Scroller(); this.dsc = new Scroller();
    this.stage = null;
    this.rig = {};             // 미리보기 영웅 리그 (drawHero 자세 상태)
    this.hp = null;            // 미리보기 영웅 (가짜 엔티티)
    this.fig = null;
    this.cyc = 0; this.cycT = 0;
    this.lookRev = -1; this.look = null;
    this.viewT = 0; this.viewId = null;
    this.spark = { id: null, t: 0, text: '' };
    this.listRect = null; this.detailRect = null; this.previewRect = null;
    this.rowRects = []; this.segRects = []; this.loRects = []; this.btnRects = []; this.btns = [];
    this.inited = false;
  }
  get owned() { return CS.ownedIds(this.state); }
  get wantsFocus() { return true; }
  ids(kind = this.kind) { return kind === 'mount' ? MOUNT_IDS : GUARDIAN_IDS; }
  get curId() { const L = this.ids(); return L[clamp(this.sel[this.kind], 0, L.length - 1)] ?? null; }
  isOwned(id) { return CS.isOwned(this.state, id); }
  onShow() {
    if (!this.inited) {
      this.inited = true;
      // 처음 열 때: 장착한 탈것(없으면 첫 보유 동료)에 커서
      const L = CS.heroLoadout(this.state, this.hero);
      const first = L.mount || L.guards?.[0] || this.owned[0] || null;
      if (first) this.select(first, false);
    }
    this.sc.follow(this.kind + this.sel[this.kind]);
    // 보유한 동료의 초상화를 미리 받는다 (목록 아이콘·편성 칸; 한 장 ≈ 70 KB, 이미 받은 것은 캐시)
    try { assets.preload?.(this.owned.map((id) => companionDef(id)?.portrait).filter(Boolean)); } catch { /* 아이콘은 get() 이 다시 받는다 */ }
  }
  free() {
    this.stage?.free?.(); this.fig = null;
    if (this.silo?.cv) { this.silo.cv.width = this.silo.cv.height = 1; }
    this.silo = null;
    if (this.silIcons) { for (const c of this.silIcons.values()) c.width = c.height = 1; this.silIcons.clear(); }
  }
  /** 메뉴 가로 밀기(탭 넘기기)를 막을 곳: 없음 (미리보기는 탭만 받는다) */
  noSwipe() { return false; }

  // ───────────────────────── 상태 ─────────────────────────
  loadout() { return CS.heroLoadout(this.state, this.hero); }
  slots() { return CS.guardianSlots(this.state); }
  /** 이 동료가 장착된 칸: 탈것 0, 수호신 0|1, 없으면 -1 */
  slotOf(id) {
    const L = this.loadout();
    if (!id) return -1;
    if (L.mount === id) return 0;
    const n = this.slots();
    for (let i = 0; i < n; i++) if (L.guards?.[i] === id) return i;
    return -1;
  }
  select(id, sound = true) {
    const def = companionDef(id);
    if (!def) return;
    const kind = def.kind === 'mount' ? 'mount' : 'guardian';
    const i = this.ids(kind).indexOf(def.id);
    if (i < 0) return;
    if (this.kind !== kind) { this.kind = kind; this.sc.reset(); }
    if (this.sel[kind] !== i && sound) audio.sfx('menu_move');
    this.sel[kind] = i;
    this.dsc.reset();
    this.sc.follow(kind + i);
  }
  setKind(kind) {
    if (this.kind === kind) return;
    this.kind = kind; this.sc.reset(); this.dsc.reset();
    this.sc.follow(kind + this.sel[kind]);
    audio.sfx('menu_move');
  }
  /** 상세 단추 목록 [{label, run, hot}] */
  buttonsFor(id) {
    const def = companionDef(id);
    if (!def || !this.isOwned(id)) return [];
    const at = this.slotOf(id);
    if (def.kind === 'mount') return at >= 0 ? [{ label: '해제', run: () => this.equip(id, null) }] : [{ label: '장착', run: () => this.equip(id, 0) }];
    const n = this.slots(), out = [];
    for (let s = 0; s < n; s++) if (at !== s) out.push({ label: `수호신 ${s + 1}에 장착`, run: () => this.equip(id, s) });
    if (at >= 0) out.push({ label: '해제', run: () => this.equip(id, null, at) });
    return out;
  }
  /** Z 로 바로 하는 행동: 장착했으면 해제, 아니면 빈 칸(없으면 1번 칸)에 장착 */
  primary(id) {
    const def = companionDef(id);
    if (!def) return;
    if (!this.isOwned(id)) {
      audio.sfx('menu_cancel');
      const egg = this.eggOf(id);
      this.m.notify(egg ? (egg.ready ? '영혼의 마구간에서 부화시킬 수 있다' : egg.text) : (def.obtain?.hint ?? CMP_TEXT.notOwned), PAL.dim);
      return;
    }
    const at = this.slotOf(id);
    if (def.kind === 'mount') { this.equip(id, at >= 0 ? null : 0); return; }
    if (at >= 0) { this.equip(id, null, at); return; }
    const L = this.loadout(), n = this.slots();
    let s = 0;
    for (let i = 0; i < n; i++) if (!L.guards?.[i]) { s = i; break; }
    this.equip(id, s);
  }
  /** 장착·해제 (slot = null 이면 해제; 수호신 해제는 from 칸) */
  equip(id, slot, from = 0) {
    const st = this.state, hero = this.hero, def = companionDef(id);
    let r = null;
    try {
      if (def?.kind === 'mount') r = CS.equipMount(st, hero, slot === null ? null : id);
      else r = slot === null ? CS.equipGuardian(st, hero, from, null) : CS.equipGuardian(st, hero, slot, id);
    } catch (e) { console.warn('[companions tab] equip', e); r = null; }
    if (!r?.ok) { audio.sfx('menu_cancel'); if (r?.msg) this.m.notify(r.msg, PAL.bad); return false; }
    if (slot === null) audio.sfx('menu_cancel');
    else { audio.sfx('menu_ok'); try { playCry(def, { vol: 0.55, delay: 0.08 }); } catch { /* 울음소리 없음 */ } }
    this.m.changed();
    try { this.world?.companions?.sync?.(); } catch (e) { console.warn('[companions tab] sync', e); }
    if (r.msg) this.m.notify(r.msg, slot === null ? PAL.bone : PAL.goldHi);
    if (slot !== null) this.spark = { id, t: 1.2, text: '' };
    this.btnI = 0;
    return true;
  }
  cycleAuto() {
    const c = this.state?.companions;
    if (!c) return;
    c.autoSkill = c.autoSkill === null || c.autoSkill === undefined ? true : c.autoSkill === true ? false : null;
    audio.sfx('menu_move');
    const v = c.autoSkill;
    this.m.notify(v === true ? '자동 스킬: 켬' : v === false ? '자동 스킬: 끔' : '자동 스킬: 기기 기본 (터치 화면에서만 켬)', PAL.goldHi);
    this.m.changed();
  }
  autoLabel() {
    const v = this.state?.companions?.autoSkill;
    if (v === true) return { s: '켬', c: PAL.good };
    if (v === false) return { s: '끔', c: PAL.bad };
    return { s: `기기 기본 (${input.touchMode ? '켬' : '끔'})`, c: PAL.bone };
  }
  eggOf(id) {
    try { return CS.eggStatus(this.state).find((e) => e.id === id) ?? null; } catch { return null; }
  }
  nextAnim() {
    const C = this.kind === 'mount' ? MOUNT_CYCLE : GUARD_CYCLE;
    this.cyc = (this.cyc + 1) % C.length; this.cycT = 0;
    if (this.kind !== 'mount' && C[this.cyc][0] === 'idle') this.cyc = (this.cyc + 1) % C.length;
    audio.sfx('menu_move', { vol: 0.5 });
  }

  // ───────────────────────── 입력 ─────────────────────────
  update(dt, nav, ges, focused) {
    const id = this.curId;
    // 미리보기
    this.tickPreview(dt, id);
    // 본 것으로 표시 (pending / NEW)
    if (id !== this.viewId) { this.viewId = id; this.viewT = 0; }
    else this.viewT += dt;
    if (id && this.viewT >= SEEN_DELAY && this.isOwned(id)) {
      const e = CS.ownedEntry(this.state, id);
      if (e && (!e.seen || CS.pendingIds(this.state).includes(id))) CS.markSeen(this.state, id);
    }
    if (this.spark.t > 0) this.spark.t = Math.max(0, this.spark.t - dt);
    // 스크롤
    if (this.listRect) this.sc.update(dt, this.listRect, ges);
    if (this.detailRect) this.dsc.update(dt, this.detailRect, ges);
    // 포인터 (포커스와 무관)
    if (this.touchInput(ges)) return;
    if (!focused) return;
    if (!this.owned.length) { if (nav.cancel) this.m.close(); return; }
    if (nav.alt) { this.cycleAuto(); return; }
    if (nav.alt2) { this.nextAnim(); return; }
    const L = this.ids(), n = L.length;
    switch (this.area) {
      case 'loadout': {
        if (nav.left) { this.loI = Math.max(0, this.loI - 1); audio.sfx('menu_move'); }
        if (nav.right) { this.loI = Math.min(3, this.loI + 1); audio.sfx('menu_move'); }
        if (nav.up) { this.m.focusTabs(); return; }
        if (nav.down) { this.area = 'seg'; audio.sfx('menu_move'); }
        if (nav.confirm) this.activateSlot(this.loI);
        if (nav.cancel) { this.area = 'list'; audio.sfx('menu_cancel'); }
        break;
      }
      case 'seg': {
        if (nav.left) this.setKind('mount');
        if (nav.right) this.setKind('guardian');
        if (nav.up) { this.area = 'loadout'; audio.sfx('menu_move'); }
        if (nav.down || nav.confirm) { this.area = 'list'; audio.sfx('menu_move'); this.sc.follow(this.kind + this.sel[this.kind]); }
        if (nav.cancel) { this.area = 'list'; audio.sfx('menu_cancel'); }
        break;
      }
      case 'btns': {
        const B = this.btns;
        if (!B.length) { this.area = 'list'; break; }
        if (nav.left) { if (this.btnI > 0) { this.btnI--; audio.sfx('menu_move'); } else { this.area = 'list'; audio.sfx('menu_move'); } }
        if (nav.right && this.btnI < B.length - 1) { this.btnI++; audio.sfx('menu_move'); }
        if (nav.up) this.dsc.target = clamp(this.dsc.target - 48, 0, this.dsc.max);
        if (nav.down) this.dsc.target = clamp(this.dsc.target + 48, 0, this.dsc.max);
        if (nav.confirm) { B[clamp(this.btnI, 0, B.length - 1)]?.run(); }
        if (nav.cancel) { this.area = 'list'; audio.sfx('menu_cancel'); }
        break;
      }
      default: {
        const i = this.sel[this.kind];
        if (nav.up) { if (i > 0) { this.sel[this.kind] = i - 1; this.dsc.reset(); audio.sfx('menu_move'); } else { this.area = 'seg'; audio.sfx('menu_move'); } }
        if (nav.down && i < n - 1) { this.sel[this.kind] = i + 1; this.dsc.reset(); audio.sfx('menu_move'); }
        if (nav.right && this.btns.length) { this.area = 'btns'; this.btnI = 0; audio.sfx('menu_move'); }
        if (nav.confirm) this.primary(this.curId);
        if (nav.cancel) this.m.close();
      }
    }
  }
  /** 터치·마우스. 무언가를 눌렀으면 true */
  touchInput(ges) {
    // 편성 띠
    for (let i = 0; i < this.loRects.length; i++) {
      if (ges.tap(this.loRects[i])) { this.m.focus = 'content'; this.loI = i; this.activateSlot(i); return true; }
    }
    // 나눔 단추
    for (let i = 0; i < this.segRects.length; i++) {
      if (ges.tap(this.segRects[i])) { this.m.focus = 'content'; this.area = 'list'; this.setKind(i === 0 ? 'mount' : 'guardian'); return true; }
    }
    // 상세 단추
    for (let i = 0; i < this.btnRects.length; i++) {
      if (ges.tap(this.btnRects[i])) { this.m.focus = 'content'; this.area = 'btns'; this.btnI = i; this.btns[i]?.run(); return true; }
    }
    // 목록 줄
    for (const r of this.rowRects) {
      if (r.thid) continue;
      if (ges.tap(r)) {
        this.m.focus = 'content'; this.area = 'list';
        if (this.sel[this.kind] !== r.i) { this.sel[this.kind] = r.i; this.dsc.reset(); audio.sfx('menu_move'); }
        return true;
      }
    }
    // 미리보기 = 다음 동작
    if (this.previewRect && ges.tap(this.previewRect)) { this.nextAnim(); return true; }
    return false;
  }
  activateSlot(i) {
    if (i === 3) { this.cycleAuto(); return; }
    const L = this.loadout();
    if (i === 0) {
      if (L.mount) this.select(L.mount); else this.setKind('mount');
      this.area = 'list';
      return;
    }
    const s = i - 1;
    if (s >= this.slots()) { audio.sfx('menu_cancel'); this.m.notify(CMP_TEXT.slot2Locked, PAL.dim); return; }
    const g = L.guards?.[s];
    if (g) this.select(g); else this.setKind('guardian');
    this.area = 'list';
  }
  hints(focused) {
    if (!this.owned.length) return [['X', '닫기', '1장을 클리어하면 영혼의 마구간이 열립니다']];
    return [
      ['↑↓', '선택', '항목을 터치해 선택 · 버튼으로 장착'],
      ['Z', '장착/해제'],
      ['←→', '항목'],
      ['A', '자동 스킬'],
      ['C', '동작 보기'],
      ['X', '뒤로'],
    ];
  }

  // ───────────────────────── 미리보기 ─────────────────────────
  tickPreview(dt, id) {
    if (!id) return;
    if (!this.fig || this.fig.id !== id) { this.fig = new CompanionFigure(id); this.cyc = 0; this.cycT = 0; }
    const C = this.fig.kind === 'mount' ? MOUNT_CYCLE : GUARD_CYCLE;
    this.cycT += dt;
    if (this.cycT >= C[this.cyc % C.length][1]) { this.cycT = 0; this.cyc = (this.cyc + 1) % C.length; }
    const anim = C[this.cyc % C.length][0];
    this.fig.update(dt, anim);
    const p = this.heroP();
    if (p) { p.t = (p.t ?? 0) + dt; p.animT = (p.animT ?? 0) + dt; }
  }
  heroP() {
    if (this.lookRev !== this.m.rev || !this.look) {
      this.lookRev = this.m.rev;
      try { this.look = D.composeLook(this.state, this.hero); } catch { this.look = null; }
    }
    if (!this.look) return null;
    const ch = D.CHARACTERS()[this.hero?.charId] ?? null;
    if (!this.hp) {
      this.hp = { cx: 0, bottom: 0, facing: 1, anim: 'idle', animT: 0, move: null, moveT: 0, atkSpeedMul: 1, look: null, ch: null,
        vx: 0, vy: 0, onGround: true, rig: this.rig, t: 1 + Math.random() * 2, stats: { reach: 0 }, charging: 0, muzzleT: 0, dashT: 0, ride: null };
    }
    const p = this.hp;
    if (p.look !== this.look) { p.look = this.look; this.rig = {}; p.rig = this.rig; }
    p.ch = ch;
    return p;
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx, A) {
    const t = this.t;
    this.rowRects.length = 0; this.segRects.length = 0; this.loRects.length = 0; this.btnRects.length = 0;
    this.listRect = this.detailRect = this.previewRect = null;
    const ges = this.m.ges;
    if (!this.owned.length) { this.drawEmpty(ctx, A, t); return; }
    const focused = this.m.focus === 'content';
    // 위 띠
    this.drawStrip(ctx, { x: A.x, y: A.y, w: A.w, h: STRIP_H }, t, focused, ges);
    // 본문 3단
    const by = A.y + STRIP_H + 8, bh = A.h - STRIP_H - 8;
    const listW = Math.round(clamp(A.w * 0.3, 214, 270));
    const detW = Math.round(clamp(A.w * 0.33, 240, 300));
    const prevW = A.w - listW - detW - GAP * 2;
    const L = { x: A.x, y: by, w: listW, h: bh };
    const P = { x: A.x + listW + GAP, y: by, w: prevW, h: bh };
    const R = { x: P.x + prevW + GAP, y: by, w: detW, h: bh };
    this.drawList(ctx, L, t, focused, ges);
    this.drawPreview(ctx, P, t, ges);
    this.drawDetail(ctx, R, t, focused, ges);
  }

  drawEmpty(ctx, A, t) {
    frame(ctx, A.x, A.y, A.w, A.h);
    const cx = A.x + A.w / 2, cy = A.y + A.h / 2;
    glow(ctx, cx, cy - 34, 60, '#c8a050', 0.25 + 0.06 * Math.sin(t * 2));
    glyph(ctx, 'paw', cx, cy - 34, 40, PAL.goldMid, 2);
    text(ctx, CMP_TEXT.empty, cx, cy + 18, { size: 22, align: 'center', weight: 800, family: FONT.title, color: PAL.gold, ow: 3 });
    text(ctx, CMP_TEXT.emptySub, cx, cy + 46, { size: 14, align: 'center', weight: 600, color: PAL.dim, ow: 2, maxWidth: A.w - 40 });
  }

  /** 위 띠: 편성 3칸 + 자동 스킬 */
  drawStrip(ctx, S, t, focused, ges) {
    frame(ctx, S.x, S.y, S.w, S.h, { corners: false });
    const L = this.loadout(), slots = this.slots();
    const autoW = Math.round(clamp(S.w * 0.22, 150, 210));
    const cellW = (S.w - autoW - 16) / 3;
    const items = [
      { label: '탈것', id: L.mount, locked: false },
      { label: '수호신 1', id: L.guards?.[0] ?? null, locked: false },
      { label: '수호신 2', id: L.guards?.[1] ?? null, locked: slots < 2 },
    ];
    for (let i = 0; i < 3; i++) {
      const it = items[i];
      const r = { x: S.x + 8 + i * cellW, y: S.y + 4, w: cellW - GAP, h: S.h - 8 };   // 칸 사이 10 px (터치 판정 여유, platform §6.3)
      this.loRects.push(ges.zone(r, 'primary', { src: 'companions.slot' }));
      const hot = focused && this.area === 'loadout' && this.loI === i;
      const cur = !!it.id && it.id === this.curId;
      if (cur || hot) { ctx.fillStyle = hot ? 'rgba(150,22,44,0.35)' : 'rgba(120,20,40,0.2)'; rr(ctx, r.x, r.y, r.w, r.h, 4); ctx.fill(); }
      if (ges.over(r)) { ctx.fillStyle = 'rgba(255,220,160,0.05)'; rr(ctx, r.x, r.y, r.w, r.h, 4); ctx.fill(); }
      const ix = r.x + 24, iy = r.y + r.h / 2;
      if (it.locked) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(ix, iy, 18, 0, TAU); ctx.fill();
        ctx.strokeStyle = PAL.goldDim; ctx.lineWidth = 1.2; ctx.stroke();
        glyph(ctx, 'lock', ix, iy, 16, PAL.faint, 1.6);
      } else if (it.id) drawCompanionIcon(ctx, it.id, ix, iy, 18);
      else {
        ctx.strokeStyle = 'rgba(200,160,90,0.45)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(ix, iy, 17, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        text(ctx, '+', ix, iy + 6, { size: 18, align: 'center', weight: 700, color: PAL.goldDim, ow: 0 });
      }
      const tx = r.x + 50, tw = r.w - 56;
      text(ctx, it.label, tx, r.y + 18, { size: 12, weight: 700, color: PAL.dim, ow: 2 });
      if (it.locked) text(ctx, ellipsize(ctx, CMP_TEXT.slot2Locked, tw, 12, 600), tx, r.y + 37, { size: 12, weight: 600, color: PAL.faint, ow: 2 });
      else if (it.id) {
        const d = companionDef(it.id);
        text(ctx, ellipsize(ctx, d.name, tw, 15, 800), tx, r.y + 37, { size: 15, weight: 800, color: d.color, ow: 3 });
      } else text(ctx, '비어 있음', tx, r.y + 37, { size: 13, weight: 600, color: PAL.faint, ow: 2 });
      if (hot) brackets(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, t, PAL.goldHi);
    }
    // 자동 스킬
    const ar = { x: S.x + S.w - autoW - 8, y: S.y + 4, w: autoW, h: S.h - 8 };
    this.loRects.push(ges.zone(ar, 'primary', { src: 'companions.auto' }));
    const hot = focused && this.area === 'loadout' && this.loI === 3;
    ctx.fillStyle = hot ? 'rgba(150,22,44,0.35)' : 'rgba(30,14,24,0.7)'; rr(ctx, ar.x, ar.y, ar.w, ar.h, 4); ctx.fill();
    ctx.strokeStyle = PAL.goldDim; ctx.lineWidth = 1; ctx.stroke();
    const al = this.autoLabel();
    glyph(ctx, 'gear', ar.x + 18, ar.y + ar.h / 2, 16, PAL.goldMid, 1.5);
    text(ctx, '자동 스킬', ar.x + 34, ar.y + 18, { size: 12, weight: 700, color: PAL.dim, ow: 2 });
    text(ctx, ellipsize(ctx, al.s, ar.w - 42, 14, 800), ar.x + 34, ar.y + 37, { size: 14, weight: 800, color: al.c, ow: 3 });
    if (hot) brackets(ctx, ar.x + 2, ar.y + 2, ar.w - 4, ar.h - 4, t, PAL.goldHi);
  }

  /** 왼쪽 목록 */
  drawList(ctx, R, t, focused, ges) {
    frame(ctx, R.x, R.y, R.w, R.h);
    // 나눔 단추 (터치면 46 px — 손가락 판정 44 px 이상)
    const sx = R.x + 8, sw = (R.w - 16) / 2, sy = R.y + 8;
    const segH = input.touchMode ? SEG_H_TOUCH : SEG_H;
    const segHot = focused && this.area === 'seg';
    for (let i = 0; i < 2; i++) {
      const kind = i === 0 ? 'mount' : 'guardian';
      const r = { x: sx + i * sw, y: sy, w: sw, h: segH };
      this.segRects.push(ges.zone(r, 'primary', { src: 'companions.seg' }));
      const on = this.kind === kind;
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (on) { g.addColorStop(0, 'rgba(160,24,48,0.95)'); g.addColorStop(1, 'rgba(70,6,22,0.95)'); }
      else { g.addColorStop(0, 'rgba(40,22,34,0.9)'); g.addColorStop(1, 'rgba(14,8,14,0.92)'); }
      ctx.fillStyle = g;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, i === 0 ? [6, 0, 0, 6] : [0, 6, 6, 0]); else ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
      ctx.strokeStyle = on ? PAL.gold : PAL.goldDim; ctx.lineWidth = 1; ctx.stroke();
      const nOwn = this.ids(kind).filter((id) => this.isOwned(id)).length;
      const label = `${kind === 'mount' ? '탈것' : '수호신'} ${nOwn}/${this.ids(kind).length}`;
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 5, { size: 14, align: 'center', weight: 800, color: on ? PAL.goldHi : PAL.dim, ow: 3 });
    }
    if (segHot) brackets(ctx, sx + (this.kind === 'mount' ? 0 : sw) + 2, sy + 2, sw - 4, segH - 4, t, PAL.goldHi);
    // 줄
    const LR = { x: R.x + 4, y: sy + segH + GAP, w: R.w - 8, h: R.h - segH - 24 };
    this.listRect = LR;
    const ids = this.ids(), n = ids.length, sel = clamp(this.sel[this.kind], 0, n - 1);
    this.sc.setMax(n * ROW_H - LR.h);
    if (this.sc.shouldFollow(this.kind + sel)) this.sc.ensure(sel * ROW_H, sel * ROW_H + ROW_H, LR.h);
    const L = this.loadout(), slots = this.slots();
    const eggs = (() => { try { return CS.eggStatus(this.state); } catch { return []; } })();
    const pend = CS.pendingIds(this.state);
    clipBegin(ctx, LR);
    const y0 = LR.y - this.sc.y;
    for (let i = 0; i < n; i++) {
      const ry = y0 + i * ROW_H;
      if (ry + ROW_H < LR.y - 2 || ry > LR.y + LR.h + 2) continue;
      const id = ids[i], d = companionDef(id), own = this.isOwned(id);
      const r = { x: LR.x, y: ry, w: LR.w - 6, h: ROW_H - 2, i };
      this.rowRects.push(ges.zone(r, 'list', { clip: LR, src: 'companions.row' }));
      const isSel = i === sel;
      if (isSel) selBar(ctx, r.x, r.y, r.w, r.h, t, { dim: !(focused && this.area === 'list') });
      else if (ges.over(r) && !r.thid) { ctx.fillStyle = 'rgba(255,220,160,0.05)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      const ix = r.x + 30, iy = r.y + r.h / 2;
      if (own) drawCompanionIcon(ctx, id, ix, iy, 20, { ring: d.color });
      else this.drawLockedIcon(ctx, id, ix, iy, 20);
      const tx = r.x + 58, right = r.x + r.w - 8;
      if (own) {
        const e = CS.ownedEntry(this.state, id);
        const lvS = `Lv ${e?.lv ?? 1}`;
        ctx.font = font(12, 800, FONT.num);
        const lvW = ctx.measureText(lvS).width;
        text(ctx, lvS, right, r.y + 20, { size: 12, align: 'right', weight: 800, family: FONT.num, color: PAL.goldMid, ow: 2 });
        const nameW = Math.max(30, right - lvW - 8 - tx);
        const nm = ellipsize(ctx, d.name, nameW, 15, 800);
        text(ctx, nm, tx, r.y + 21, { size: 15, weight: 800, color: isSel ? PAL.goldHi : PAL.bone, ow: 3 });
        // 배지 (이름 오른쪽이 좁으면 둘째 줄 오른쪽)
        const badges = [];
        const at = this.slotOf(id);
        if (at >= 0) badges.push({ s: d.kind === 'mount' || slots < 2 ? '장착' : `장착 ${at + 1}`, c: '#ffd870', bg: 'rgba(90,60,10,0.92)' });
        if (!e?.seen || pend.includes(id)) badges.push({ s: 'NEW', c: '#ffe0e0', bg: 'rgba(170,20,40,0.95)' });
        // 둘째 줄: 칭호 + 유대 하트
        const hw = 5 * 10;
        hearts(ctx, right - hw, r.y + 33, bondRank(e?.bond ?? 0));
        let bx = right - hw - 6;
        for (let k = badges.length - 1; k >= 0; k--) {
          const b = badges[k];
          ctx.font = font(10, 800, FONT.body);
          const w = ctx.measureText(b.s).width + 10;
          bx -= w;
          if (bx < tx + 30) break;
          pill(ctx, b.s, bx, r.y + 30, { color: b.c, bg: b.bg, size: 10, h: 15 });
          bx -= 4;
        }
        text(ctx, ellipsize(ctx, d.title, Math.max(20, bx - tx - 4), 12, 600), tx, r.y + 42, { size: 12, weight: 600, color: PAL.dim, ow: 2 });
      } else {
        const egg = eggs.find((x) => x.id === id);
        text(ctx, '???', tx, r.y + 21, { size: 15, weight: 800, color: PAL.faint, ow: 3 });
        if (egg) {
          pill(ctx, egg.ready ? '부화 가능' : '부화 대기', right, r.y + 8, { color: egg.ready ? '#ffe070' : '#d8c8a8', bg: egg.ready ? 'rgba(110,70,10,0.92)' : 'rgba(40,26,20,0.92)', size: 10, h: 15, align: 'right' });
        }
        const hint = egg ? `「${d.obtain?.egg ?? '알'}」 — ${egg.ready ? '영혼의 마구간에서 부화' : egg.text}` : (d.obtain?.hint ?? '');
        text(ctx, ellipsize(ctx, hint, right - tx, 11, 600), tx, r.y + 41, { size: 11, weight: 600, color: PAL.faint, ow: 2 });
      }
    }
    clipEnd(ctx, LR, this.sc, 'rgba(12,6,16,0.95)');
    scrollbar(ctx, R.x + R.w - 6, LR.y, LR.h, this.sc, LR.h);
  }

  /** 가운데 미리보기 */
  drawPreview(ctx, R, t, ges) {
    frame(ctx, R.x, R.y, R.w, R.h, { corners: false });
    const id = this.curId, d = companionDef(id);
    const x = R.x + 6, y = R.y + 6, w = R.w - 12, h = R.h - 12;
    if (!this.stage && HV.HeroStage) this.stage = new HV.HeroStage();
    const own = id && this.isOwned(id);
    const acc = own ? (d?.color ?? PAL.gold) : '#5a4a60';
    const pxs = HV.pxScale ? HV.pxScale(ctx) : null;
    try { this.stage?.draw(ctx, x, y, w, h, t, pxs, acc); } catch { ctx.fillStyle = '#0d0816'; ctx.fillRect(x, y, w, h); }
    this.previewRect = ges.zone({ x, y, w, h }, 'list', { src: 'companions.preview' });
    if (!d) return;
    if (!this.fig || this.fig.id !== d.id) this.tickPreview(0, d.id);
    const foot = Math.round(clamp(h * 0.1, 14, 28));
    const fx = x + w / 2, fy = y + h - foot;
    const p = this.heroP();
    const HS = HERO.HERO_DRAW_SCALE ?? 1.14;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (!own) {
      // 잠긴 동료: 검은 실루엣만 (정체는 합류할 때까지 비밀)
      const s = clamp(Math.min((h - foot - 30) / (d.kind === 'mount' ? 130 : Math.max(40, this.fig.height + 20)), (w - 30) / 150), 0.6, d.kind === 'mount' ? 1.8 : 2.4);
      HV.pedestal?.(ctx, fx, fy, s * 0.62, t, '#5a4a60');
      this.drawSilhouette(ctx, d, x, y, w, h, fx, d.kind === 'mount' ? fy : fy - 40 * s, s);
      text(ctx, '???', fx, y + 34, { size: 22, align: 'center', weight: 900, family: FONT.title, color: PAL.faint, ow: 3 });
    } else if (d.kind === 'mount') {
      // 탈것 + 지금 영웅 (p.ride)
      const s = clamp(Math.min((h - foot - 18) / 178, (w - 20) / 150), 0.7, 1.8);
      HV.pedestal?.(ctx, fx, fy, s * 0.75, t, acc);
      const special = MOUNT_CYCLE[this.cyc % MOUNT_CYCLE.length][0] === 'special';
      this.fig.draw(ctx, fx, fy, s, { layer: 'back', facing: 1 });
      if (p && this.fig.ride) {
        p.ride = this.fig.ride; p.cx = 0; p.bottom = 0; p.facing = 1; p.move = null;
        const want = special ? 'ride_rear' : 'ride';
        if (p.anim !== want) { p.anim = want; p.animT = 0; }
        ctx.save();
        ctx.translate(fx, fy); ctx.scale(s, s);
        try { HERO.drawHero(ctx, p, null, { scale: HS }); } catch (e) { if (!this._herr) { this._herr = true; console.warn('[companions tab] rider', e); } }
        ctx.restore();
      }
      this.fig.draw(ctx, fx, fy, s, { layer: 'front', facing: 1 });
    } else {
      // 수호신: 영웅 대기 + 기준점의 수호신
      const s = clamp(Math.min((h - foot - 16) / 170, (w - 20) / 170), 0.7, 1.6);
      HV.pedestal?.(ctx, fx, fy, s * 0.62, t, acc);
      const a = d.anchor ?? { dx: 40, dy: -100 };
      const heroX = fx + a.dx * s * 0.5;
      if (p) {
        p.ride = null; p.cx = heroX; p.bottom = fy; p.facing = 1; p.move = null;
        if (p.anim !== 'idle') { p.anim = 'idle'; p.animT = 0; }
        try { HERO.drawHero(ctx, p, null, { scale: s * HS }); } catch (e) { if (!this._herr) { this._herr = true; console.warn('[companions tab] hero', e); } }
      }
      // 기준점 (guardian.js anchor): 영웅 뒤 dx, 비행형은 발밑 기준 dy 위
      const fly = d.move !== 'ground';
      const gs = s * 1.25, gx = heroX - a.dx * s, gy = fly ? fy + (a.dy ?? -100) * s : fy;
      glowOval(ctx, gx, gy - (d.size?.h ?? 24) * gs * 0.5, 38 * gs, 28 * gs, d.color, 0.2);
      this.fig.draw(ctx, gx, gy, gs, { facing: 1 });
    }
    // 반짝임 (장착 · 레벨·유대 상승)
    this.checkGrowth(id);
    if (this.spark.t > 0 && this.spark.id === id) {
      const k = this.spark.t / 1.2;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + t * 1.5, rad = (1 - k) * 90 + 20;
        glow(ctx, fx + Math.cos(a) * rad, fy - h * 0.35 + Math.sin(a) * rad * 0.6, 10, i % 2 ? '#ffe7a0' : d.color, k);
      }
      if (this.spark.text) text(ctx, this.spark.text, fx, y + 40 - (1 - k) * 12, { size: 18, align: 'center', weight: 900, family: FONT.title, color: '#ffe070', ow: 4 });
    }
    ctx.restore();
    // 동작 이름 (아래)
    if (own) {
      const C = d.kind === 'mount' ? MOUNT_CYCLE : GUARD_CYCLE;
      const an = C[this.cyc % C.length][0];
      const NAMES = { idle: '대기', walk: '걷기', run: '질주', special: d.special?.name ?? '특수기', attack: d.attack?.name ?? '공격', skill: d.skill?.name ?? '스킬' };
      text(ctx, NAMES[an] ?? an, x + 10, y + h - 8, { size: 12, weight: 700, color: PAL.dim, ow: 2, maxWidth: w - 20 });
    }
    ctx.strokeStyle = 'rgba(200,160,90,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  /** 잠긴 동료 아이콘: 흐린 보랏빛 원판 위의 검은 실루엣 (크기별로 한 번만 굽는다) */
  drawLockedIcon(ctx, id, x, y, r) {
    const k = Math.max(1, Math.min(3, HV.pxScale ? HV.pxScale(ctx) : 1));
    const px = Math.max(8, Math.ceil(r * 2 * k));
    const key = id + '|' + px;
    this.silIcons ??= new Map();
    let c = this.silIcons.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = c.height = px;
      const g = c.getContext('2d');
      const bg = g.createRadialGradient(px / 2, px * 0.4, 1, px / 2, px / 2, px / 2);
      bg.addColorStop(0, '#5a4668'); bg.addColorStop(1, '#1a1020');
      g.fillStyle = bg; g.beginPath(); g.arc(px / 2, px / 2, px / 2, 0, TAU); g.fill();
      // 실루엣: 게임 속 그림을 따로 그려 'source-in' 으로 검게 칠한 뒤 원판 위에
      const s = document.createElement('canvas'); s.width = s.height = px;
      const sg = s.getContext('2d');
      const fig = new CompanionFigure(id);
      fig.update(0.3, 'idle');
      const mount = fig.kind === 'mount';
      const fw = mount ? 150 : Math.max(fig.def?.size?.w ?? 24, fig.height) * 1.5, fh = mount ? fig.height + 10 : fig.height * 1.3;
      const sc = Math.min((px * 0.78) / fh, (px * 0.86) / fw);
      fig.draw(sg, px / 2, mount ? px * 0.86 : px / 2 + (fig.height * sc) / 2, sc, { facing: 1 });
      sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#07040a'; sg.fillRect(0, 0, px, px);
      g.save(); g.beginPath(); g.arc(px / 2, px / 2, px / 2 - 1, 0, TAU); g.clip(); g.drawImage(s, 0, 0); g.restore();
      s.width = s.height = 1;
      if (this.silIcons.size > 40) { for (const v of this.silIcons.values()) v.width = v.height = 1; this.silIcons.clear(); }
      this.silIcons.set(key, c);
    }
    ctx.drawImage(c, 0, 0, c.width, c.height, x - r, y - r, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(110,85,48,0.75)'; ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }
  /** 잠긴 동료의 검은 실루엣 (게임 속 그림을 오프스크린에 한 번 그려 'source-in' 으로 칠한다 — ctx.filter 없이 모든 브라우저) */
  drawSilhouette(ctx, d, x, y, w, h, fx, fy, s) {
    const k = Math.max(1, Math.min(3, HV.pxScale ? HV.pxScale(ctx) : 1));
    const key = `${d.id}|${Math.round(w)}|${Math.round(h)}|${s.toFixed(3)}|${k.toFixed(2)}`;
    let c = this.silo?.key === key ? this.silo.cv : null;
    if (!c) {
      c = this.silo?.cv ?? document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
      const g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, -x * k, -y * k);
      const fig = new CompanionFigure(d.id);
      fig.update(0.4, 'idle');
      fig.draw(g, fx, fy, s, { facing: 1 });
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#050308'; g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'source-over';
      this.silo = { key, cv: c };
    }
    ctx.save();
    glowOval(ctx, fx, fy - 50 * s, 70 * s, 50 * s, '#6a4a80', 0.25);
    ctx.drawImage(c, 0, 0, c.width, c.height, x, y, w, h);
    ctx.restore();
  }
  /** 이번 실행에서 마지막으로 본 값보다 레벨·유대가 올랐으면 반짝임 */
  checkGrowth(id) {
    if (!id || !this.isOwned(id)) return;
    const e = CS.ownedEntry(this.state, id);
    if (!e) return;
    const rank = bondRank(e.bond);
    const prev = LAST_SEEN.get(id);
    if (prev && (e.lv > prev.lv || rank > prev.rank) && this.spark.t <= 0) {
      this.spark = { id, t: 1.2, text: e.lv > prev.lv ? `Lv ${e.lv}!` : `유대 — ${BOND_NAMES[rank]}` };
      audio.sfx('bond_up', { vol: 0.6 });
    }
    if (!prev || prev.lv !== e.lv || prev.rank !== rank) LAST_SEEN.set(id, { lv: e.lv, rank });
  }

  /** 오른쪽 상세 */
  drawDetail(ctx, R, t, focused, ges) {
    frame(ctx, R.x, R.y, R.w, R.h);
    const id = this.curId, d = companionDef(id);
    this.btns = d ? this.buttonsFor(id) : [];
    if (!d) return;
    const own = this.isOwned(id);
    const pad = 14;
    // 단추 (아래 고정)
    const nb = this.btns.length;
    const btnY = R.y + R.h - BTN_H - 10;
    const CR = { x: R.x + 4, y: R.y + 6, w: R.w - 8, h: (nb ? btnY - 8 : R.y + R.h - 6) - (R.y + 6) };
    this.detailRect = CR;
    // 내용 (스크롤)
    clipBegin(ctx, CR);
    const x = R.x + pad, w = R.w - pad * 2;
    let y = CR.y + 26 - this.dsc.y;
    const y00 = y;
    if (!own) y = this.drawLocked(ctx, d, x, y, w);
    else y = this.drawOwned(ctx, d, x, y, w, t);
    clipEnd(ctx, CR, this.dsc, 'rgba(12,6,16,0.95)');
    this.dsc.setMax(y - y00 + 30 - CR.h);
    scrollbar(ctx, R.x + R.w - 6, CR.y, CR.h, this.dsc, CR.h);
    // 단추
    if (nb) {
      const bw = (R.w - 20 - (nb - 1) * GAP) / nb;
      for (let i = 0; i < nb; i++) {
        const r = { x: R.x + 10 + i * (bw + GAP), y: btnY, w: bw, h: BTN_H };
        this.btnRects.push(ges.zone(r, 'primary', { src: 'companions.btn' }));
        const hot = (focused && this.area === 'btns' && this.btnI === i) || ges.over(r);
        const label = this.btns[i].label;
        gbutton(ctx, r, ellipsize(ctx, label, bw - 12, 14, 800), { hot, size: 14, t, accent: label === '해제' ? '#6a3040' : PAL.crimson });
        if (focused && this.area === 'btns' && this.btnI === i) brackets(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, t, PAL.goldHi);
      }
    }
  }
  drawLocked(ctx, d, x, y, w) {
    text(ctx, '???', x, y, { size: 22, weight: 900, family: FONT.title, color: PAL.faint, ow: 3 });
    pill(ctx, d.kind === 'mount' ? '탈것' : '수호신', x + w, y - 16, { color: PAL.dim, size: 11, h: 18, align: 'right' });
    y += 22;
    text(ctx, '아직 만나지 못한 동료', x, y, { size: 13, weight: 600, color: PAL.dim, ow: 2 });
    y += 16;
    divider(ctx, x, y, w, { center: false });
    y += 22;
    heading(ctx, '합류 방법', x, y, w, { size: 14 });
    y += 22;
    const egg = this.eggOf(d.id);
    const hint = d.obtain?.hint ?? '';
    for (const ln of wrapC(ctx, hint, w, 13, 600)) { text(ctx, ln, x, y, { size: 13, weight: 600, color: PAL.text, ow: 2 }); y += 20; }
    if (egg) {
      y += 6;
      pill(ctx, egg.ready ? '부화 가능' : '부화 대기', x, y - 13, { color: egg.ready ? '#ffe070' : '#d8c8a8', bg: 'rgba(60,36,14,0.92)', size: 11, h: 18 });
      y += 14;
      const s = egg.ready ? `「${d.obtain?.egg ?? '알'}」에 금이 가기 시작했다. 영혼의 마구간에서 부화시키자.` : `「${d.obtain?.egg ?? '알'}」 — ${egg.text}`;
      for (const ln of wrapC(ctx, s, w, 12, 600)) { text(ctx, ln, x, y + 6, { size: 12, weight: 600, color: PAL.dim, ow: 2 }); y += 18; }
    }
    return y;
  }
  drawOwned(ctx, d, x, y, w, t) {
    const st = this.state, id = d.id;
    const ex = CS.expInfo(st, id), bi = CS.bondInfo(st, id);
    // 이름 + 종류
    const kindS = d.kind === 'mount' ? '탈것' : '수호신';
    ctx.font = font(11, 800, FONT.body);
    const pw = ctx.measureText(kindS).width + 14;
    text(ctx, ellipsize(ctx, d.name, w - pw - 8, 22, 800, FONT.title), x, y, { size: 22, weight: 800, family: FONT.title, color: d.color, ow: 4 });
    pill(ctx, kindS, x + w, y - 16, { color: d.kind === 'mount' ? '#ffb070' : '#9fd0ff', size: 11, h: 18, align: 'right' });
    y += 20;
    text(ctx, ellipsize(ctx, d.title, w, 13, 700), x, y, { size: 13, weight: 700, color: PAL.bone, ow: 2 });
    y += 17;
    for (const ln of wrapC(ctx, d.role ?? '', w, 12, 600).slice(0, 2)) { text(ctx, ln, x, y, { size: 12, weight: 600, color: PAL.dim, ow: 2 }); y += 16; }
    y += 6;
    // Lv · EXP
    text(ctx, `Lv ${ex.lv}`, x, y + 4, { size: 16, weight: 900, family: FONT.num, color: PAL.goldHi, ow: 3 });
    text(ctx, ex.max ? 'MAX' : `EXP ${fmtNum(ex.exp)} / ${fmtNum(ex.need)}`, x + w, y + 4, { size: 11, align: 'right', weight: 700, family: FONT.num, color: PAL.bone, ow: 2 });
    y += 10;
    gauge(ctx, x, y, w, 7, ex.max ? 1 : ex.need > 0 ? ex.exp / ex.need : 0, '#e8c872');
    y += 24;
    // 유대
    hearts(ctx, x, y - 10, bi.rank, 12);
    text(ctx, `유대 · ${bi.name}`, x + 70, y, { size: 13, weight: 800, color: '#ff9aa8', ow: 2 });
    y += 17;
    const perk = bi.rank > 0 ? BOND_PERKS?.[bi.rank] ?? null : null;
    text(ctx, bi.next == null ? '최고 단계에 이르렀다' : `다음 단계까지 ${bi.next - bi.points}`, x, y, { size: 11, weight: 600, color: PAL.dim, ow: 2 });
    y += 4;
    if (perk) { y += 14; for (const ln of wrapC(ctx, perk, w, 11, 600).slice(0, 2)) { text(ctx, ln, x, y, { size: 11, weight: 600, color: '#d8a0a8', ow: 2 }); y += 15; } y -= 15; }
    y += 14;
    divider(ctx, x, y, w, { center: false });
    y += 22;
    // 능력치
    heading(ctx, '능력치', x, y, w, { size: 14 });
    y += 20;
    for (const ln of wrapC(ctx, this.statLine(d), w, 12, 600)) { text(ctx, ln, x, y, { size: 12, weight: 600, color: PAL.text, ow: 2 }); y += 17; }
    y += 8;
    heading(ctx, '능력', x, y, w, { size: 14 });
    y += 8;
    for (const ab of this.abilities(d)) {
      y += 17;
      ctx.font = font(12, 800, FONT.body);
      const lw = ctx.measureText(ab.k).width;
      pill(ctx, ab.k, x, y - 12, { color: PAL.goldMid, bg: 'rgba(40,20,30,0.9)', size: 11, h: 16 });
      text(ctx, ellipsize(ctx, ab.name, w - lw - 24, 13, 800), x + lw + 20, y, { size: 13, weight: 800, color: PAL.goldHi, ow: 2 });
      y += 3;
      for (const ln of wrapC(ctx, ab.desc, w, 12, 500)) { y += 16; text(ctx, ln, x, y, { size: 12, weight: 500, color: PAL.dim, ow: 2 }); }
      y += 4;
    }
    y += 8;
    return y;
  }
  statLine(d) {
    const ps = this.world?.player?.stats ?? (() => { try { return D.computeStats(this.state, this.hero); } catch { return {}; } })();
    if (d.kind === 'mount') {
      const m = CS.mountDerived(this.state, d.id, ps);
      if (!m) return '';
      return `체력 ${fmtNum(m.maxHp)} · 이동 속도 ${fmtNum(Math.round((d.move?.speed ?? 0) * m.speedMul))} · 점프 ${fmtNum(d.move?.jump ?? 0)} · 돌진 위력 ${Math.round(m.trampleRatio * 100)}%`;
    }
    const g = CS.guardianDerived(this.state, d.id, ps);
    if (!g) return '';
    const pct = Math.round(g.share * (1 + 0.04 * g.rank) * 100);
    return `공격력 ${fmtNum(Math.round(g.power))} (영웅 공격력의 ${pct}%) · 공격 간격 ${fmtNum(g.interval)}초 · 스킬 재사용 ${fmtNum(Math.round(g.skillCd))}초`;
  }
  abilities(d) {
    const e = CS.ownedEntry(this.state, d.id), lv = e?.lv ?? 1, rank = bondRank(e?.bond ?? 0);
    const el = (s) => (s?.element && ELNAME[s.element] ? ` (${ELNAME[s.element]})` : '');
    if (d.kind === 'mount') {
      return [
        { k: '돌진', name: (d.charge?.name ?? '') + el(d.charge), desc: d.charge?.desc ?? '' },
        { k: '특수기', name: (d.special?.name ?? '') + el(d.special), desc: `${d.special?.desc ?? ''} (↓ + 공격)` },
        { k: '탑승 효과', name: d.rideDesc ?? '', desc: rank >= 2 ? '유대 「교감」 이상: 효과 ×1.5 적용 중' : '유대 「교감」부터 효과가 1.5배가 된다' },
        { k: '패시브', name: d.passive?.name ?? '없음', desc: d.passive?.desc ?? '' },
      ];
    }
    return [
      { k: '기본 공격', name: (d.attack?.name ?? '') + el(d.attack), desc: d.attack?.desc ?? '' },
      { k: '스킬', name: d.skill?.name ?? '', desc: d.skill?.desc ?? '' },
      { k: '협공', name: (d.assist?.name ?? '') + el(d.assist), desc: d.assist?.desc ?? '' },
      { k: '오라', name: auraText(d, lv, rank), desc: rank >= 2 ? '유대 「교감」 이상: 오라 ×1.5 적용 중' : '장착해 두면 늘 적용된다' },
      { k: '고유 능력', name: d.passive?.name ?? '없음', desc: d.passive?.desc ?? '' },
    ];
  }
}

/** 유대 하트 5개 (rank 개 채움). (x, y) = 왼쪽 위 */
function hearts(ctx, x, y, rank, s = 8) {
  for (let i = 0; i < 5; i++) {
    const cx = x + i * (s + 2) + s / 2, cy = y + s / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.42);
    ctx.bezierCurveTo(cx - s * 0.6, cy - s * 0.02, cx - s * 0.32, cy - s * 0.58, cx, cy - s * 0.18);
    ctx.bezierCurveTo(cx + s * 0.32, cy - s * 0.58, cx + s * 0.6, cy - s * 0.02, cx, cy + s * 0.42);
    ctx.closePath();
    if (i < rank) { ctx.fillStyle = '#ff4a64'; ctx.fill(); ctx.strokeStyle = '#ffb0bc'; ctx.lineWidth = 0.8; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(60,20,30,0.8)'; ctx.fill(); ctx.strokeStyle = 'rgba(160,90,100,0.6)'; ctx.lineWidth = 0.8; ctx.stroke(); }
  }
}
