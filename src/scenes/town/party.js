// 헌터 교체: 합류한 헌터 중 한 명을 골라 함께 싸운다 (영웅 상태는 캐릭터별로 따로 성장) — owner: PLAT-TOWN
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, wrap, panel, button, bar, drawCover, vignette, FONT, COLORS, font, taps } from '../../core/ui.js';
import { TAU, clamp, ease, rgba, rand, fmt } from '../../core/math.js';
import { Particles } from '../../core/particles.js';
import { drawHero } from '../../render/hero.js';
import { CHARACTERS, CHAR_ORDER } from '../../data/characters.js';
import { classNameOf } from '../../data/ascensions.js';   // 직업 이름: 초월·비전이면 그 이름 (classes_t3 §8.3)
import { ensureHero, storyJoinedChars } from '../../game/state.js';
import { composeLook, expToNext } from '../../game/stats.js';
import { findItem } from '../../game/inventory.js';
import { ITEMS } from '../../data/items.js';
import { hitRect, nameOf, Snap, padHidden, ensureState, uiPanel, uiButton, uiHints, josa } from './common.js';
import { vGrad, fillGradRect } from '../menu/common.js';
import { isBust, bustCrop } from '../../render/portrait.js';
// 카드 그라디언트 색 멈춤 (menu/common 캐시 — 매 프레임 새 그라디언트 0, R1-REQ-341B)
const CARD_SEL = [0, 'rgba(70,20,34,0.95)', 1, 'rgba(6,3,8,0.96)'], CARD_OFF = [0, 'rgba(22,12,20,0.92)', 1, 'rgba(6,3,8,0.96)'];
const CARD_FADE = [0, 'rgba(6,3,8,0)', 1, 'rgba(6,3,8,1)'], LOCK = [0, '#c8a060', 1, '#6a4a20'];
import { glow } from './facades.js';

const STAR_KEYS = ['공격', '방어', '속도', '마법', '사거리'];

export class PartyScene extends Scene {
  // uiScale (platform §6.2): UI px 로 배치 (휴대폰 888×432 이상). 가상 패드는 숨긴다
  constructor(g) { super(g); this.opaque = true; this.uiScale = true; this.hidePad = true; }
  get vw() { return this.game.uiW || this.game.viewW; }
  get vh() { return this.game.uiH || this.game.viewH; }
  enter(params = {}) {
    this.world = params.world ?? null;
    const st = ensureState(this.game);
    const unlocked = new Set(this.game.meta?.unlockedChars ?? ['kael']);
    for (const id in st.heroes || {}) unlocked.add(id);
    for (const id of storyJoinedChars(st)) unlocked.add(id);   // 합류 플래그가 있는 세이브 (메타가 아직 모르는 경우)
    this.list = CHAR_ORDER.map((id) => ({ id, ch: CHARACTERS[id], open: unlocked.has(id), rig: {}, snap: new Snap() }));
    this.index = Math.max(0, this.list.findIndex((e) => e.id === st.charId));
    this.fx = new Particles(300);
    this.leaving = null;
    audio.sfx('menu_ok');
  }
  get state() { return this.game.state; }

  update(dt) {
    this.fx.update(dt, null);
    if (this.leaving) { this.leaving.t += dt; if (this.leaving.t > 0.7) { this.game.pop(); } return; }
    const n = this.list.length;
    if (input.pressed('left')) { this.index = (this.index + n - 1) % n; audio.sfx('menu_move'); }
    if (input.pressed('right')) { this.index = (this.index + 1) % n; audio.sfx('menu_move'); }
    const id = input.pointer.tapped ? taps.hit(this) : null;
    if (id === 'close') { audio.sfx('menu_cancel'); this.game.pop(); return; }
    if (id === 'act') { this.choose(); return; }
    if (typeof id === 'string' && id.startsWith('card:')) {
      const i = Number(id.slice(5));
      if (i >= 0 && i < this.list.length) { if (i === this.index) this.choose(); else { this.index = i; audio.sfx('menu_move'); } return; }
    }
    if (input.pressed('confirm')) { this.choose(); return; }
    if (input.pressed('cancel') || (input.pressed('menu') && !input.pressed('confirm'))) { audio.sfx('menu_cancel'); this.game.pop(); }
  }
  choose() {
    const e = this.list[this.index], st = this.state;
    if (!e.open) { audio.sfx('menu_cancel'); this.game.toast(e.ch.unlock?.text ?? '아직 합류하지 않은 헌터다.', '#ff8a7a'); return; }
    if (e.id === st.charId) { audio.sfx('menu_cancel'); this.game.pop(); return; }
    const fresh = !st.heroes[e.id];
    ensureHero(st, e.id);
    st.charId = e.id;
    audio.sfx('powerup'); audio.sfx('menu_ok');
    const r = this.cardRects?.[this.index];
    if (r) {
      this.fx.burst('gold', r.x + r.w / 2, r.y + r.h * 0.6, 40, { speed: 280 });
      this.fx.ring(r.x + r.w / 2, r.y + r.h * 0.6, { color: '#e8c872', r0: 10, r1: 140, life: 0.5, width: 6 });
    }
    this.game.toast(fresh ? `${e.ch.name} 합류! 함께 싸운다.` : `${josa(e.ch.name, '으로', '로')} 교체했다.`, '#ffe7a0');
    this.leaving = { t: 0 };
  }

  render(ctx) {
    const vw = this.vw, vh = this.vh, st = this.state;
    const off = !!this.leaving || this.game.top !== this;
    const tz = (id, r, kind = 'primary') => taps.add(id, r, { owner: this, kind, disabled: off, src: 'town.party' });
    drawCover(ctx, assets.get('bg/title') ?? assets.get('bg/hub'), vw, vh, { fallback: ['#140814', '#05020a'] });
    ctx.fillStyle = 'rgba(4,2,8,0.72)'; ctx.fillRect(0, 0, vw, vh);
    vignette(ctx, vw, vh, 0.75);
    // 헤더
    // '동료' 는 탈것·수호신(메뉴 › 동료)을 가리키므로 이 화면은 '헌터 교체' 라고 부른다
    text(ctx, '헌터 교체', 24, 40, { size: 28, weight: 800, family: FONT.title, color: '#f3d690', ow: 4 });
    ctx.font = font(28, 800, FONT.title);
    text(ctx, 'PARTY  ·  함께 싸울 헌터를 고르세요', 24 + ctx.measureText('헌터 교체').width + 14, 38, { size: 12, weight: 800, family: FONT.num, color: '#8a7a64' });
    this.closeRect = tz('close', { x: vw - 64, y: 10, w: 52, h: 40 }, 'icon');
    uiButton(ctx, this.closeRect, '✕', { size: 20 });
    ctx.fillStyle = 'rgba(232,200,114,0.45)'; ctx.fillRect(0, 58, vw, 1.5);
    // 카드 · 상세 높이: 화면 높이에 맞춘다 (UI 높이 540 → 카드 237, 432 → 166)
    const n = this.list.length, gap = 10, m = 18;
    const avail = vh - 72 - 90;
    const dh = clamp(Math.round(avail * 0.34), 84, 150);
    const cw = (vw - m * 2 - gap * (n - 1)) / n, ch = Math.min(254, avail - dh - 12), cy = 72;
    this.cardRects = [];
    this.list.forEach((e, i) => {
      const r = tz('card:' + i, { x: m + i * (cw + gap), y: cy, w: cw, h: ch });
      this.cardRects.push(r);
      this.drawCard(ctx, r, e, i === this.index);
    });
    // 상세
    const e = this.list[this.index];
    const dy = cy + ch + 12, low = dh < 110;
    uiPanel(ctx, m, dy, vw - m * 2, dh, { corner: false });
    const c = e.ch;
    text(ctx, e.open ? c.name : '???', m + 20, dy + (low ? 28 : 32), { size: 20, weight: 800, family: FONT.title, color: e.open ? '#f3d690' : '#6a5a50' });
    ctx.font = font(20, 800, FONT.title);
    const nmw = ctx.measureText(e.open ? c.name : '???').width;
    if (low) text(ctx, `${c.eng} · ${c.title}`, m + 32 + nmw, dy + 27, { size: 11, weight: 800, family: FONT.num, color: '#8a7a64' });
    else text(ctx, `${c.eng} · ${c.title}`, m + 20, dy + 52, { size: 11, weight: 800, family: FONT.num, color: '#8a7a64' });
    ctx.font = font(13, 500);
    const dw = (vw - m * 2) * 0.58;
    const d0 = dy + (low ? 52 : 76), dl = clamp(Math.floor((dy + dh - d0 + 6) / 19), 1, 3);
    wrap(ctx, e.open ? c.desc : (c.unlock?.text ?? '아직 합류하지 않았다.'), dw - 30, 13).slice(0, dl).forEach((l, k) => text(ctx, l, m + 20, d0 + k * 19, { size: 13, color: '#c8b8a0' }));
    // 능력 별점
    const sx = m + dw + 10, sp = low ? 15 : 17;
    STAR_KEYS.forEach((k, j) => {
      const y = dy + (low ? 22 : 26) + j * sp;
      text(ctx, k, sx, y, { size: 12, color: '#9d8f80' });
      const v = c.stars?.[k] ?? 0;
      for (let s = 0; s < 5; s++) text(ctx, '★', sx + 52 + s * 15, y + 1, { size: 13, color: s < v ? '#ffd84a' : 'rgba(120,100,80,0.4)', ow: 2 });
    });
    const hero = st.heroes[e.id];
    if (hero) {
      const wx = sx + 150;
      text(ctx, `Lv.${hero.level}`, wx, dy + 30, { size: 18, weight: 900, family: FONT.num, color: '#fff' });
      text(ctx, classNameOf(hero), wx, dy + 50, { size: 13, weight: 700, color: '#e8c872' });
      const w = findItem(st, hero.equip?.weapon);
      if (w) text(ctx, nameOf(w), wx, dy + 70, { size: 12, color: COLORS.rarity[w.rarity ?? 0], maxWidth: vw - m - wx - 16 });
      bar(ctx, wx, dy + 80, Math.min(160, vw - m - wx - 20), 5, hero.exp / expToNext(hero.level), { color: '#e8c872', shine: false });
    } else if (e.open) text(ctx, '새 헌터 — 선택하면 합류한다', sx + 150, dy + 40, { size: 13, weight: 700, color: '#8ae0a0' });
    // 버튼
    // 버튼·키 안내는 화면 아래 끝에 잘리지 않도록 (안내 기준선 vh-8, 허브와 같음)
    this.actRect = tz('act', { x: vw / 2 - 170, y: vh - 76, w: 340, h: 46 });
    const label = !e.open ? '잠겨 있음' : e.id === st.charId ? '현재 동행 중' : `${josa(c.name.split(' ')[0], '과', '와')} 함께 간다`;
    uiButton(ctx, this.actRect, label, { selected: e.open && e.id !== st.charId, disabled: !e.open, size: 17 });
    uiHints(ctx, [['dpadH', '선택'], ['confirm', '결정'], ['cancel', '닫기']], vw / 2, vh - 8);
    this.fx.draw(ctx, 'front');
    if (this.leaving) { ctx.fillStyle = `rgba(255,240,200,${Math.max(0, 0.5 - this.leaving.t)})`; ctx.fillRect(0, 0, vw, vh); }
  }

  drawCard(ctx, r, e, sel) {
    const st = this.state, c = e.ch, cur = e.id === st.charId;
    const t = this.t;
    ctx.save();
    const lift = sel ? -6 - Math.sin(t * 3) * 2 : 0;
    ctx.translate(0, lift);
    fillGradRect(ctx, vGrad(ctx, r.h, sel ? CARD_SEL : CARD_OFF), r.x, r.y, r.w, r.h); // 캐시 그라디언트
    // 초상화 (위쪽 은은하게)
    const img = assets.get(c.portrait);
    if (img) {
      ctx.save(); ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h * 0.62); ctx.clip();
      ctx.globalAlpha = e.open ? (sel ? 0.55 : 0.32) : 0.12;
      // 애니메 흉상: 얼굴(portrait_meta)을 가운데·위 40 % 에 두는 커버 자르기. 예전 그림은 그대로
      const cr = isBust(c.portrait, img) ? bustCrop(img, c.portrait, { x: r.x, y: r.y, w: r.w, h: r.h * 0.62 }, { faceY: 0.4 }) : null;
      if (cr) ctx.drawImage(img, cr.dx, cr.dy, cr.dw, cr.dh);
      else {
        const s = r.w / img.width * 1.15, iw = img.width * s, ih = img.height * s;
        ctx.drawImage(img, r.x + r.w / 2 - iw / 2, r.y - ih * 0.05, iw, ih);
      }
      ctx.globalAlpha = 1;
      ctx.translate(0, r.y + r.h * 0.2); ctx.fillStyle = vGrad(ctx, r.h * 0.42, CARD_FADE); // 캐시 (0.2h → 0.62h)
      ctx.fillRect(r.x, 0, r.w, r.h * 0.43); ctx.translate(0, -(r.y + r.h * 0.2));
      ctx.restore();
    }
    // 캐릭터 (절차적, 현재 외형)
    const hero = st.heroes[e.id];
    const look = hero ? composeLook(st, hero) : structuredClone(c.look);
    if (!hero) look.weapon = { type: c.weaponType, style: 1 };
    const scale = clamp(Math.min(r.w / 70, (r.h - 60) / 95), 1.05, 1.9);
    const bottom = r.y + r.h - 60;
    if (e.open) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, r.x + r.w / 2, bottom - 60, 80, look.aura?.color ?? (sel ? '#e8c872' : '#6a5a8a'), sel ? 0.35 : 0.12); ctx.restore(); }
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, bottom, 28, 6, 0, 0, TAU); ctx.fill();
    const p = { cx: r.x + r.w / 2, bottom, facing: 1, anim: sel && e.open ? 'run' : 'idle', animT: t, look, ch: c, rig: e.rig, t: t + r.x * 0.01, stats: { reach: 0 }, onGround: true, vx: sel && e.open ? 150 : 0, vy: 0 };
    if (sel && e.open) drawHero(ctx, p, null, { scale });
    else {
      // 선택되지 않은 카드는 정지 스냅샷 (성능)
      p.t = 1.3 + r.x * 0.01; p.rig = {};
      e.snap.draw(ctx, `${e.id}:${hero?.classId ?? ''}:${hero?.equip?.weapon ?? ''}:${e.open}`, r.x, r.y, r.w, r.h - 40, (oc) => drawHero(oc, p, null, e.open ? { scale } : { scale, tint: '#07040a' }));
    }
    // 이름 · 레벨
    text(ctx, e.open ? c.name.split(' ')[0] : '???', r.x + r.w / 2, r.y + r.h - 36, { size: 16, weight: 800, family: FONT.title, align: 'center', color: e.open ? (sel ? '#fff4d8' : '#f3d690') : '#5a4a40' });
    text(ctx, e.open ? (hero ? `Lv.${hero.level} · ${classNameOf(hero)}` : c.title) : '미합류', r.x + r.w / 2, r.y + r.h - 16, { size: 11, weight: 700, align: 'center', color: e.open ? '#b8a890' : '#5a4a40', maxWidth: r.w - 8 });
    ctx.strokeStyle = sel ? COLORS.gold : cur ? 'rgba(232,200,114,0.7)' : 'rgba(110,85,48,0.55)'; ctx.lineWidth = sel ? 2.5 : 1.2;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (sel) { ctx.shadowColor = 'rgba(232,200,114,0.6)'; ctx.shadowBlur = 16; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.shadowBlur = 0; }
    if (cur) { ctx.fillStyle = '#8a1426'; ctx.fillRect(r.x + 6, r.y + 6, 46, 20); text(ctx, '동행 중', r.x + 29, r.y + 20, { size: 11, weight: 800, align: 'center', color: '#ffe7a0', ow: 0 }); }
    if (!e.open) {
      // 자물쇠
      const lx = r.x + r.w / 2, ly = r.y + r.h * 0.4;
      ctx.strokeStyle = '#8a7a64'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(lx, ly - 6, 8, Math.PI, 0); ctx.stroke();
      fillGradRect(ctx, vGrad(ctx, 18, LOCK), lx - 11, ly - 6, 22, 18); // 캐시 그라디언트
      ctx.strokeStyle = '#1a0a04'; ctx.lineWidth = 1.5; ctx.strokeRect(lx - 11, ly - 6, 22, 18);
      ctx.fillStyle = '#1a0a04'; ctx.beginPath(); ctx.arc(lx, ly + 1, 2.5, 0, TAU); ctx.fill(); ctx.fillRect(lx - 1, ly + 2, 2, 5);
    }
    ctx.restore();
  }
}
