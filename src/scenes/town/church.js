// 성 루미나 성당 (알베르토 신부): 전직(새 외형 미리보기 · 특성 · 능력치 배율) · 축복(기도 힌트/성수/주문서) · 스킬 초기화 · 여정 기록(저장)
// 「여정 기록」 탭의 아래 단추 둘 (docs/specs/gallery.md §5.7, GAL-UI): [여정을 기록한다] [회랑에서 돌아본다] — ←→ 로 고르고 confirm,
// alt = 회랑 바로가기 → push('gallery', {}) (극장 꺼짐, 닫으면 성당으로)
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { saves } from '../../core/save.js';
import { text, wrap, panel, button, bar, FONT, COLORS, font } from '../../core/ui.js';
import { fmt, fmtTime, rand, clamp, TAU, ease, rgba } from '../../core/math.js';
import { drawHero } from '../../render/hero.js';
import { drawIcon } from '../../render/icons.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES, classChain } from '../../data/classes.js';
import * as SkillData from '../../data/skills.js';
import { STAGES, STAGE_ORDER } from '../../data/stages.js';
import { DOCS } from '../../data/lore.js';
import { ITEMS } from '../../data/items.js';
import { availableClasses, canChangeClass, changeClass } from '../../game/progression.js';
import { composeLook, STAT_INFO } from '../../game/stats.js';
import { addByBase } from '../../game/inventory.js';
import { SHOP_LINES } from '../../data/town.js';
import { ServiceScene, Modal, RewardPopup, makeInst, hitRect, rowBg, Snap, uiPanel, uiButton, uiHints, josa } from './common.js';
import { vGrad, rGrad, fillGradRect, Gesture, Scroller, clipBegin, clipEnd, scrollbar } from '../menu/common.js';
// 직업 카드 그라디언트 색 멈춤 (menu/common 캐시 — 매 프레임 새 그라디언트 0, R1-REQ-341B)
const CARD_SEL = [0, 'rgba(60,30,50,0.92)', 1, 'rgba(6,3,8,0.95)'], CARD_OFF = [0, 'rgba(20,12,22,0.88)', 1, 'rgba(6,3,8,0.95)'];
// 스크롤 칸 위·아래 가림 (그 높이의 카드 색: 위 = 선택/보통 카드 그라디언트의 30% 지점, 아래 = 카드 아래쪽 색)
const CARD_FADE = [0, 'rgba(6,3,8,0)', 1, 'rgba(6,3,8,0.92)'], FADE_SEL = [0, 'rgba(43,21,36,0.95)', 1, 'rgba(43,21,36,0)'], FADE_OFF = [0, 'rgba(16,9,18,0.95)', 1, 'rgba(16,9,18,0)'];
import { glow } from './facades.js';

const TIER_NAME = ['기본 직업', '상급 직업', '최상급 직업'];

export class ChurchScene extends ServiceScene {
  setup() {
    this.bgKey = 'cg/cg_alberto_church'; this.title = '성 루미나 성당'; this.eng = 'ST. LUMINA CATHEDRAL'; this.npcId = 'npc_alberto';
    this.lines = SHOP_LINES.alberto; this.music = 'church'; this.portraitGlow = '#fff2b0'; this.emberColor = '#fff2b0';
    this.tabs = [{ id: 'class', label: '전직' }, { id: 'bless', label: '축복' }, { id: 'reset', label: '스킬 초기화' }, { id: 'save', label: '여정 기록' }];
    this.sel = 0; this.rigs = {}; this.cere = null;
    // 전직 카드의 설명·특성·보정치 칸이 카드보다 길 때(휴대폰)만 세로 스크롤: 두 카드가 같은 자리로 (끌기·휠·↑↓·오른쪽 스틱 Y)
    this.ges = new Gesture(); this.csc = new Scroller(); this.cscRect = null; this.cscKey = null;
    this.prayed = false;
    this.talk('hello');
  }
  get useLeftRight() { return this.tab === 0 || this.tab === 1 || this.tabs[this.tab]?.id === 'save'; }   // [hook:gal] 기록 탭: ←→ = 두 단추
  /** 안내 줄의 선택 방향: 전직 카드·기록 탭의 두 단추는 ←→, 축복 목록은 ↑↓, 초기화 탭은 고를 것이 없다 */
  selectHint() { const id = this.tabs[this.tab]?.id; return id === 'class' || id === 'save' ? 'dpadH' : id === 'bless' ? 'dpadV' : null; }   // [hook:gal] 기록 탭 ←→
  extraHints() { return this.tabs[this.tab]?.id === 'save' ? [['alt', '회랑']] : []; }   // [hook:gal] 회랑 바로가기
  onTab() { this.sel = 0; this.csc.reset(); }

  get options() {
    const hero = this.hero;
    try { return availableClasses(hero) || []; } catch { return []; }
  }
  blessOptions() {
    const o = [{ id: 'pray', icon: 'doc', title: '기도하기', desc: this.prayed ? '신부님의 조언을 다시 듣는다.' : '촛불을 밝히고 신부님의 조언을 구한다.', price: 0 }];
    if (ITEMS.c_holywater) o.push({ id: 'holywater', icon: ITEMS.c_holywater.icon ?? 'sub_holywater', title: `${ITEMS.c_holywater.name} 봉헌`, desc: '성수 한 병을 축성받는다. 20초간 성광의 오라.', price: ITEMS.c_holywater.price ?? 400, item: 'c_holywater' });
    if (ITEMS.m_scroll_bless) o.push({ id: 'blessScroll', icon: 'scroll_bless', title: '축복 의식', desc: '축복 주문서 한 장을 받는다. 강화 성공률 +10%p.', price: Math.round((ITEMS.m_scroll_bless.price ?? 1500) * 1.2 / 50) * 50, item: 'm_scroll_bless' });
    return o;
  }
  resetCost() { return 100 + (this.hero.level ?? 1) * 60; }
  /** 초기화로 돌려받을 스킬 포인트 (무료로 받은 시작 기술 1레벨은 제외 — skills.resetSkills 와 같은 계산) */
  refundable() {
    const hero = this.hero, starter = SkillData.STARTER_SKILLS?.[hero.charId];
    let n = 0;
    for (const [id, lv] of Object.entries(hero.skills || {})) n += Math.max(0, (lv ?? 0) - (id === starter ? 1 : 0)) * (SkillData.SKILLS?.[id]?.spCost ?? 1);
    return n;
  }

  updateBody(dt) {
    this.ges.addWheel(this.wheel); this.ges.update();
    if (this.cere) { this.updateCeremony(dt); return 'handled'; }
    const tab = this.tabs[this.tab].id;
    const nav = (n, horiz) => {
      if (n <= 0) return;
      const a = horiz ? ['left', 'right'] : ['up', 'down'];
      if (input.pressed(a[0])) { this.sel = (this.sel + n - 1) % n; audio.sfx('menu_move'); }
      if (input.pressed(a[1])) { this.sel = (this.sel + 1) % n; audio.sfx('menu_move'); }
    };
    const id = this.tapId;
    const pick = (pre) => (typeof id === 'string' && id.startsWith(pre) ? Number(id.slice(pre.length)) : -1);
    if (tab === 'class') {
      const opts = this.options;
      nav(opts.length, true);
      if (this.cscRect) this.csc.update(dt, this.cscRect, this.ges);
      const scroll = this.csc.max > 0;
      if (scroll && input.pressed('up')) this.csc.target = clamp(this.csc.target - 48, 0, this.csc.max);
      if (scroll && input.pressed('down')) this.csc.target = clamp(this.csc.target + 48, 0, this.csc.max);
      const dragged = scroll && this.ges.moved;   // 카드를 끌어 스크롤한 손가락을 뗀 것은 카드·전직 단추 탭이 아니다
      const i = dragged ? -1 : pick('card:');
      if (i >= 0 && opts[i]) { if (this.sel === i) this.tryClass(opts[i]); else { this.sel = i; audio.sfx('menu_move'); } return 'handled'; }
      if (id === 'act' && !dragged && opts[this.sel]) { this.tryClass(opts[this.sel]); return 'handled'; }
      if (input.pressed('confirm') && opts[this.sel]) { this.tryClass(opts[this.sel]); return 'handled'; }
    } else if (tab === 'bless') {
      const o = this.blessOptions();
      nav(o.length, false);
      const i = pick('opt:');
      if (i >= 0 && o[i]) { if (this.sel === i) this.doBless(o[i]); else { this.sel = i; audio.sfx('menu_move'); } return 'handled'; }
      if (input.pressed('confirm')) { this.doBless(o[this.sel]); return 'handled'; }
    } else if (tab === 'reset') {
      if (id === 'act' || input.pressed('confirm')) { this.tryReset(); return 'handled'; }
    } else if (tab === 'save') {
      nav(2, true);   // [hook:gal] ←→ [여정을 기록한다] · [회랑에서 돌아본다]
      if (id === 'gal' || input.pressed('alt') || (input.pressed('confirm') && this.sel === 1)) { this.openGallery(); return 'handled'; }   // [hook:gal]
      if (id === 'act' || input.pressed('confirm')) { this.doSave(); return 'handled'; }
    }
    if (input.pressed('cancel')) return 'cancel';
    return null;
  }

  // ── 전직 ──
  tryClass(c) {
    const hero = this.hero;
    const chk = canChangeClass(hero, c.id);
    if (!chk.ok) { audio.sfx('menu_cancel'); this.game.toast(chk.reason ?? '아직 때가 아니다.', '#ff8a7a'); this.talk(`아직 이르네. ${chk.reason ?? ''}. 조금 더 수련하고 오게.`); return; }
    audio.sfx('menu_ok');
    this.modal = new Modal({
      title: '전직하시겠습니까?', width: 480,
      lines: [`「${CLASSES[hero.classId]?.name}」 → 「${c.name}」`, '전직은 되돌릴 수 없습니다.', '보너스 스킬 포인트 +3'],
      buttons: [{ label: '서약한다', value: 'ok', primary: true }, { label: '다시 생각한다', value: 'cancel' }],
      onResult: (r) => { if (r.value === 'ok') this.startCeremony(c); },
    });
  }
  startCeremony(c) {
    const hero = this.hero;
    const res = changeClass(hero, c.id);
    if (!res?.ok) { this.game.toast(res?.reason ?? '전직에 실패했다.', '#ff8a7a'); return; }
    this.cere = { t: 0, cls: c, rig: {} };
    audio.duck?.(0.4, 3);
    audio.sfx('holy'); audio.sfx('charge_ready', { vol: 0.6 });
    this.lockTabs = true;
  }
  updateCeremony(dt) {
    const C = this.cere, vw = this.vw, vh = this.vh;
    C.t += dt;
    const cx = vw / 2, cy = vh * 0.76;
    if (C.t < 1.6 && Math.random() < 0.6) this.fx.emit('holy', cx + rand(-60, 60), cy + rand(-10, 20), { speed: 120, angle: -Math.PI / 2, spread: 0.6 });
    if (!C.boom && C.t > 1.5) {
      C.boom = true;
      audio.sfx('levelup'); audio.sfx('holy', { pitch: 1.3 });
      this.game.flash('#fff8e0', 0.85, 2);
      this.fx.burst('holy', cx, cy - 70, 60, { speed: 380 });
      this.fx.burst('gold', cx, cy - 70, 40, { speed: 300 });
      this.fx.ring(cx, cy - 70, { color: '#fff2b0', r0: 20, r1: 300, life: 0.8, width: 9 });
      this.talk('cls');
    }
    if (C.t > 2.4 && (input.pressed('confirm') || input.pressed('cancel') || input.pointer.tapped)) {
      audio.sfx('menu_ok');
      this.cere = null; this.lockTabs = false; this.sel = 0; this.rigs = {};
      input.flush();
    }
  }

  // ── 축복 ──
  doBless(o) {
    if (!o) return;
    const st = this.state;
    if (o.id === 'pray') {
      audio.sfx('holy', { vol: 0.7 }); audio.sfx('bell', { vol: 0.4 });
      this.prayed = true;
      this.talk(this.hint());
      const r = this.optRects?.[0];
      if (r) { this.fx.burst('holy', r.x + 40, r.y + r.h / 2, 24, { speed: 160 }); this.fx.ring(r.x + 40, r.y + r.h / 2, { color: '#fff2b0', r0: 8, r1: 70, life: 0.5 }); }
      return;
    }
    if ((st.gold ?? 0) < o.price) { audio.sfx('menu_cancel'); this.talk('헌금은 마음이면 충분하다만… 이번엔 금화가 조금 모자라는구먼.'); return; }
    this.modal = new Modal({
      title: o.title, lines: [`${fmt(o.price)} G를 봉헌하시겠습니까?`, o.desc],
      buttons: [{ label: '봉헌한다', value: 'ok', primary: true }, { label: '취소', value: 'cancel' }],
      onResult: (r) => {
        if (r.value !== 'ok') return;
        st.gold -= o.price;
        const got = addByBase(st, o.item, 1);
        if (!got) { st.gold += o.price; this.game.toast('가방이 가득 찼다!', '#ff6060'); return; }
        audio.sfx('holy'); audio.sfx('coin', { vol: 0.6 });
        this.talk('bless');
        this.popup = new RewardPopup({ title: '축복을 받았다', sub: '알베르토 신부가 조용히 기도를 올렸다.', items: [makeInst(o.item) ? Object.assign(makeInst(o.item), { qty: 1 }) : got], color: '#fff2b0' });
      },
    });
  }
  /**
   * 기도 힌트. 스테이지는 1부(s01~s13)와 2부(s14~)를 나눠 모으고 (MASTER_PLAN §1.14: 전체를 보되 2부는 따로 묶는다),
   * 2부가 시작됐으면 2부 힌트를 먼저 준다. 1부는 유물·비전서, 2부는 별의 조각·세계의 심장·비전서.
   */
  hint() {
    const st = this.state, P = st.progress ?? {}, F = P.flags ?? {};
    const has = (arr, id) => Array.isArray(arr) && arr.includes(id);
    const p1 = [], p2 = [];
    for (const id of STAGE_ORDER) {
      const s = STAGES[id];
      if (!s || !has(P.unlocked, id)) continue;
      const out = (s.part ?? 1) >= 2 ? p2 : p1;
      if (s.relic && !has(P.relics, s.relic)) out.push(`「${s.name}」 깊은 곳에 백작의 유물이 잠들어 있다네. 금이 간 벽과 닿지 않는 길을 살피게.`);
      if (s.shard && !has(P.shards, s.shard)) out.push(`「${s.name}」 어딘가에 별의 조각이 숨어 있다네. 그 세계가 감춰 둔 길을 끝까지 따라가 보게.`);
      const miss = (s.docs || []).filter((d) => !has(P.docs, d)).length;
      if (miss) out.push(`「${s.name}」에는 아직 찾지 못한 비전서가 ${miss}권 남아 있네. 수상한 벽은 무기로 두드려 보게.`);
    }
    if ((P.relics?.length ?? 0) >= 5 && !P.cleared?.s12) p1.push('유물 다섯이 모두 그대 손에 있군… 이제 왕좌의 방으로 가게. 그 너머에 진실이 기다린다네.');
    if (F.p2_started && !F.p2_done) {
      const n = P.hearts?.length ?? 0;
      p2.push(n >= 6 ? '여섯 세계의 심장이 모두 모였군… 등불을 들고 공허로 가게. 이 늙은이는 여기서 기도하겠네.'
        : `되찾은 세계의 심장은 ${n}개일세. 여섯을 모두 되찾아야 공허로 가는 길이 열린다네.`);
    }
    if (F.p2_done && !F.stars_all && (P.shards?.length ?? 0) < 6) p2.push('여섯 세계에 숨겨진 별의 조각을 모두 모으면, 공허를 빛으로 채울 수 있을지도 모르네.');
    if (F.p2_done && has(P.unlocked, 's21') && !P.cleared?.s21) p2.push('요즘 구름 위에서 용이 우는 소리가 들린다지. 이졸데가 밤마다 하늘만 올려다본다더군. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s21.md)
    if (F.p2_done && has(P.unlocked, 's22') && !P.cleared?.s22) p2.push('안개의 묘지 너머 언덕에서 밤마다 까마귀 떼가 운다더군. 까마귀 결사의 둥지가 거기 있다지…. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s22.md)
    if (F.p2_done && has(P.unlocked, 's23') && !P.cleared?.s23) p2.push('북쪽 고개의 사냥꾼들이 요즘 은빛 늑대 이야기만 한다더군. 액수 칸이 빈 공고와 함께 말이야. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s23.md)
    if (F.p2_done && has(P.unlocked, 's24') && !P.cleared?.s24) p2.push('남쪽 기슭의 옛 수녀원에서 견습 수녀들이 돌아오지 않는다더군. 장미 향이 짙은 밤에는 창을 꼭 닫게. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s24.md)
    if (F.p2_done && has(P.unlocked, 's25') && !P.cleared?.s25) p2.push('에슈빌 외곽 불탄 목장에서 밤마다 말 울음이 들린다더군. 그레타가 요즘 등불을 들고 혼자 나간다던데. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s25.md)
    const gen = ['콤보가 길게 이어질수록 점수가 불어난다네. 쉬지 말고 몰아치게.', '가끔은 금빛 박쥐가 나타난다지. 놓치지 말게, 금화를 잔뜩 떨군다네.', '무기를 강화하려거든 하드윈을 찾게. 그 친구의 망치는 틀린 적이 없어.', '물러설 줄 아는 것도 용기라네. 성수는 넉넉히 챙기게.'];
    const pool = F.p2_started && p2.length ? p2 : p1.length ? p1 : p2;
    const list = pool.length && Math.random() < 0.8 ? pool : gen;
    return list[Math.floor(Math.random() * list.length)] ?? gen[0];
  }

  // ── 스킬 초기화 ──
  tryReset() {
    const st = this.state, hero = this.hero, cost = this.resetCost();
    // 시작 기술(1레벨)만 있으면 돌려받을 포인트가 없으므로 비용을 받지 않는다
    if (this.refundable() <= 0) { audio.sfx('menu_cancel'); this.talk('아직 비울 것이 없구먼. 먼저 기술을 익히고 오게.'); return; }
    if ((st.gold ?? 0) < cost) { audio.sfx('menu_cancel'); this.talk(`의식에는 ${fmt(cost)} G가 필요하다네.`); return; }
    audio.sfx('menu_ok');
    this.modal = new Modal({
      title: '스킬 초기화', lines: [`${fmt(cost)} G를 들여 익힌 기술을 모두 잊겠습니까?`, '사용한 스킬 포인트를 돌려받습니다.'],
      buttons: [{ label: '초기화', value: 'ok', primary: true }, { label: '취소', value: 'cancel' }],
      onResult: (r) => {
        if (r.value !== 'ok') return;
        let refund = 0;
        try {
          if (SkillData.resetSkills) refund = SkillData.resetSkills(hero) ?? 0;
          else { for (const id in hero.skills) refund += hero.skills[id]; hero.skills = {}; hero.slots = [null, null, null, null]; hero.sp = (hero.sp ?? 0) + refund; }
        } catch (e) { console.error(e); return; }
        st.gold -= cost;
        audio.sfx('holy'); audio.sfx('mist', { vol: 0.6 });
        this.talk('reset');
        this.game.flash('#e0e8ff', 0.4, 3);
        this.fx.burst('magic', this.vw * 0.66, this.vh * 0.45, 40, { color: '#b8c8ff', speed: 240 });
        this.game.toast(`스킬 포인트 ${refund} 환급 (보유 SP ${hero.sp ?? 0})`, '#8ae0ff');
      },
    });
  }

  // ── 저장 ──
  doSave() {
    const st = this.state;
    const ok = saves.write(st.slot ?? 1, st);
    audio.sfx('save'); audio.sfx('bell', { vol: 0.5 });
    this.game.flash('#fff2b0', 0.3, 3);
    this.talk('save');
    const r = this.actRect;
    if (r) this.fx.burst('holy', r.x + r.w / 2, r.y + r.h / 2, 30, { speed: 200 });
    this.game.toast(ok !== false ? `슬롯 ${st.slot ?? 1}에 여정을 기록했다.` : '저장 공간에 접근할 수 없어 임시로 보관했다.', '#fff2b0');
  }

  /** 회랑 (docs/specs/gallery.md §5.7): 마을 장면·월드는 아래에 그대로 — 회랑은 불투명이라 그리지 않는다 */
  openGallery() { audio.sfx('menu_ok'); this.game.push('gallery', {}); }   // [hook:gal]

  // ───────────────────────── 그리기 ─────────────────────────
  renderBody(ctx, body) {
    const tab = this.tabs[this.tab].id;
    this.cardRects = null; this.optRects = null; this.actRect = null; this.cscRect = null;
    if (tab === 'class') this.drawClass(ctx, body);
    else if (tab === 'bless') this.drawBless(ctx, body);
    else if (tab === 'reset') this.drawReset(ctx, body);
    else this.drawSave(ctx, body);
  }

  preview(ctx, key, look, cx, bottom, scale, aura, still = false) {
    const rig = (this.rigs[key] ??= {});
    const ch = CHARACTERS[this.hero.charId];
    if (aura) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, bottom - 70 * scale / 1.6, 90 * scale / 1.6, aura, 0.35 + Math.sin(this.t * 2) * 0.06); ctx.restore(); }
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(cx, bottom, 34 * scale / 1.6, 7, 0, 0, TAU); ctx.fill();
    const p = { cx, bottom, facing: 1, anim: 'idle', animT: this.t, look, ch, rig, t: this.t, stats: { reach: 0 }, onGround: true, vx: 0, vy: 0 };
    if (!still) { drawHero(ctx, p, null, { scale }); return; }
    p.t = 1.2; p.rig = {};
    const snap = (this.snaps ??= {})[key] ??= new Snap();
    const w = 150 * scale, h = 170 * scale;
    snap.draw(ctx, `${key}:${this.hero.classId}:${scale}`, cx - w / 2, bottom - h + 12 * scale, w, h, (oc) => drawHero(oc, p, null, { scale }));
  }

  drawClass(ctx, body) {
    const hero = this.hero, st = this.state;
    const cur = CLASSES[hero.classId];
    // 현재 직업
    uiPanel(ctx, body.x, body.y, body.w, 64, { corner: false });
    text(ctx, '현재 직업', body.x + 18, body.y + 24, { size: 12, color: '#9d8f80', weight: 700 });
    text(ctx, `${cur?.name ?? '-'}`, body.x + 18, body.y + 50, { size: 20, weight: 800, family: FONT.title, color: '#f3d690' });
    ctx.font = font(20, 800, FONT.title);
    const nw = ctx.measureText(cur?.name ?? '').width;
    text(ctx, `${cur?.eng ?? ''} · ${TIER_NAME[cur?.tier ?? 0]}`, body.x + 30 + nw, body.y + 49, { size: 11, weight: 800, family: FONT.num, color: '#8a7a64' });
    text(ctx, `Lv.${hero.level}`, body.x + body.w - 18, body.y + 48, { size: 20, weight: 900, family: FONT.num, color: '#fff', align: 'right' });
    const opts = this.options;
    const y0 = body.y + 76, h = body.h - 76 - 58;
    if (!opts.length) {
      uiPanel(ctx, body.x, y0, body.w, h + 50, { corner: false });
      const look = composeLook(st, hero);
      this.preview(ctx, 'cur', look, body.x + body.w * 0.3, y0 + h - 10, 2.2, look.aura?.color);
      text(ctx, '최상급 직업에 도달했다', body.x + body.w * 0.62, y0 + 90, { size: 20, weight: 800, family: FONT.title, color: '#f3d690', align: 'center' });
      text(ctx, '더 이상 나아갈 길은 없지만,', body.x + body.w * 0.62, y0 + 130, { size: 14, color: '#c8b8a0', align: 'center' });
      text(ctx, '그대의 칼끝이 곧 길이 될 걸세.', body.x + body.w * 0.62, y0 + 154, { size: 14, color: '#c8b8a0', align: 'center' });
      if (cur?.perk) text(ctx, `특성: ${cur.perk}`, body.x + body.w * 0.62, y0 + 200, { size: 13, color: '#ffe7a0', align: 'center', maxWidth: body.w * 0.36 });
      return;
    }
    this.cardRects = [];
    const n = opts.length, gap = 12, cw = (body.w - gap * (n - 1)) / n;
    const key = opts.map((c) => c.id).join();
    if (key !== this.cscKey) { this.cscKey = key; this.csc.reset(); }
    let cscMax = 0;
    opts.forEach((c, i) => {
      const r = this.tz('card:' + i, { x: body.x + i * (cw + gap), y: y0, w: cw, h });
      this.cardRects.push(r);
      const sel = i === this.sel;
      const chk = canChangeClass(hero, c.id);
      fillGradRect(ctx, vGrad(ctx, r.h, sel ? CARD_SEL : CARD_OFF), r.x, r.y, r.w, r.h); // 캐시 그라디언트
      ctx.strokeStyle = sel ? COLORS.gold : 'rgba(110,85,48,0.6)'; ctx.lineWidth = sel ? 2.5 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (sel) { ctx.save(); ctx.shadowColor = 'rgba(232,200,114,0.5)'; ctx.shadowBlur = 18; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore(); }
      // 미리보기 (좌측)
      const look = composeLook(st, { ...hero, classId: c.id });
      const pw = Math.min(150, r.w * 0.42);
      ctx.save(); ctx.beginPath(); ctx.rect(r.x + 2, r.y + 2, pw, r.h - 4); ctx.clip();
      const lx = r.x + pw / 2, ly = r.y + r.h * 0.55; // 원점 기준 캐시 (직업 빛깔마다 하나)
      ctx.translate(lx, ly); ctx.fillStyle = rGrad(ctx, 0, 0, 10, r.h * 0.6, [0, rgba(look.aura?.color ?? '#e8c872', 0.2), 1, 'rgba(0,0,0,0)']);
      ctx.fillRect(r.x - lx, r.y - ly, pw, r.h); ctx.translate(-lx, -ly);
      this.preview(ctx, c.id, look, r.x + pw / 2 + 4, r.y + r.h - 22, clamp(r.h / 150, 1.3, 2.1), look.aura?.color, !sel);
      ctx.restore();
      // 정보 (우측): 이름·영문·요구 레벨은 고정. 그 아래(설명·특성·보정치)는 카드에 맞춘다 — 넘치면 설명을 줄이고(2 → 1 → 0줄),
      // 그래도 넘치면(휴대폰) 원래 설명 그대로 그 칸만 세로 스크롤 (보정치 줄을 버리지 않는다)
      const tx = r.x + pw + 12, tw0 = r.w - pw - 22;
      text(ctx, c.name, tx, r.y + 30, { size: 19, weight: 800, family: FONT.title, color: sel ? '#fff4d8' : '#f3d690', maxWidth: tw0 });
      text(ctx, `${c.eng ?? ''} · ${TIER_NAME[c.tier ?? 1]}`, tx, r.y + 48, { size: 10, weight: 800, family: FONT.num, color: '#8a7a64', maxWidth: tw0 });
      text(ctx, `요구 레벨 ${c.reqLevel}`, tx, r.y + 68, { size: 12, weight: 800, color: chk.ok ? COLORS.good : COLORS.bad });
      const mods = [];
      for (const k in c.mult || {}) { const p = Math.round((c.mult[k] - 1) * 100); if (p) mods.push([STAT_INFO[k]?.name ?? k, `${p > 0 ? '+' : ''}${p}%`, p > 0]); }
      for (const k in c.flat || {}) { const v = c.flat[k]; mods.push([STAT_INFO[k]?.name ?? k, `${v > 0 ? '+' : ''}${v}${STAT_INFO[k]?.pct ? '%' : ''}`, v > 0]); }
      const linesOf = (tw) => ({ tw, d: wrap(ctx, c.desc ?? '', tw, 12).slice(0, 2), p: wrap(ctx, c.perk ?? '', tw, 12).slice(0, 3) });
      const lastOf = (L, dMax) => { const yy = r.y + 90 + Math.min(L.d.length, dMax) * 17 + 26 + L.p.length * 17; return mods.length ? yy + (mods.length - 1) * 17 : yy - 23; };
      let L = linesOf(tw0), dMax = [2, 1, 0].find((d) => lastOf(L, d) <= r.y + r.h - 16);
      const CR = { x: tx - 2, y: r.y + 74, w: r.x + r.w - tx, h: r.h - 78 };
      const scroll = dMax === undefined;
      let off = 0, mx = 0;
      if (scroll) {
        L = linesOf(tw0 - 8); dMax = 2;   // 스크롤 막대 자리
        mx = Math.max(0, Math.ceil(lastOf(L, dMax) + 6 - (CR.y + CR.h)));
        off = Math.min(this.csc.y, mx);
        this.cscRect = this.cscRect ? { x: body.x, y: CR.y, w: body.w, h: CR.h } : CR;
        cscMax = Math.max(cscMax, mx);
        clipBegin(ctx, CR);
      }
      const tw = L.tw;
      let yy = r.y + 90 - off;
      for (const l of L.d.slice(0, dMax)) { text(ctx, l, tx, yy, { size: 12, color: '#b8a890' }); yy += 17; }
      yy += 4;
      text(ctx, '특성', tx, yy, { size: 11, weight: 800, color: '#ffe7a0' }); yy += 16;
      for (const l of L.p) { text(ctx, l, tx, yy, { size: 12, color: '#efe4cf' }); yy += 17; }
      yy += 6;
      for (const [nm, v, up] of mods) {
        text(ctx, nm, tx, yy, { size: 12, color: '#c8b8a0' });
        text(ctx, v, tx + tw, yy, { size: 12, weight: 800, family: FONT.num, color: up ? COLORS.good : COLORS.bad, align: 'right' });
        yy += 17;
      }
      if (scroll) {
        clipEnd(ctx, CR, null);
        if (off > 1) fillGradRect(ctx, vGrad(ctx, 14, sel ? FADE_SEL : FADE_OFF), CR.x, CR.y, CR.w, 14);
        if (off < mx - 1) fillGradRect(ctx, vGrad(ctx, 18, CARD_FADE), CR.x, CR.y + CR.h - 18, CR.w, 18);
        scrollbar(ctx, r.x + r.w - 7, CR.y + 2, CR.h - 4, { y: off, max: mx }, CR.h);
      }
    });
    this.csc.setMax(cscMax);
    const c = opts[this.sel];
    this.actRect = this.tz('act', { x: body.x + body.w / 2 - 170, y: body.y + body.h - 50, w: 340, h: 48 });
    const ok = c && canChangeClass(hero, c.id).ok;
    uiButton(ctx, this.actRect, c ? (ok ? `${josa(`「${c.name}」`, '으로', '로')} 전직` : `레벨 ${c.reqLevel} 필요`) : '—', { selected: ok, size: 17 });
  }

  drawBless(ctx, body) {
    const o = this.blessOptions();
    this.optRects = [];
    const lw = Math.min(body.w, 470);
    o.forEach((b, i) => {
      const r = this.tz('opt:' + i, { x: body.x, y: body.y + i * 84, w: lw, h: 76 });
      this.optRects.push(r);
      const sel = i === this.sel;
      rowBg(ctx, r, sel);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, r.x + 40, r.y + r.h / 2, 40, '#fff2b0', sel ? 0.4 : 0.15); ctx.restore();
      if (b.id === 'pray') drawCandle(ctx, r.x + 40, r.y + r.h / 2 + 22, this.t, 1.3);
      else drawIcon(ctx, b.icon, r.x + 40, r.y + r.h / 2, 46);
      text(ctx, b.title, r.x + 78, r.y + 32, { size: 17, weight: 800, family: FONT.title, color: sel ? '#fff4d8' : '#f3d690' });
      text(ctx, b.desc, r.x + 78, r.y + 56, { size: 12, color: '#b8a890', maxWidth: lw - 170 });
      if (b.price) { drawIcon(ctx, 'coin', r.x + r.w - 20, r.y + 38, 18); text(ctx, fmt(b.price), r.x + r.w - 34, r.y + 44, { size: 17, weight: 900, family: FONT.num, color: this.state.gold >= b.price ? '#ffd84a' : COLORS.bad, align: 'right' }); }
      else text(ctx, '무료', r.x + r.w - 16, r.y + 44, { size: 15, weight: 800, color: '#8ae0a0', align: 'right' });
    });
    // 오른쪽: 촛불 제단 (분위기)
    if (body.w - lw > 120) {
      const ax = body.x + lw + (body.w - lw) / 2, ay = body.y + body.h - 30;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, ax, ay - 80, 120, '#ffb45a', 0.35);
      ctx.restore();
      for (let i = 0; i < 7; i++) {
        const cx = ax - 72 + i * 24, h = 26 + ((i * 37) % 5) * 9, cy = ay - (i % 2) * 8;
        ctx.fillStyle = '#e8dcc0'; ctx.fillRect(cx - 4, cy - h, 8, h);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx + 1, cy - h, 3, h);
        const f = 1 + Math.sin(this.t * 17 + i * 2) * 0.12;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glow(ctx, cx, cy - h - 8, 18, '#ffb45a', 0.7);
        ctx.fillStyle = '#ffcf70'; ctx.beginPath(); ctx.ellipse(cx, cy - h - 7 * f, 3, 7 * f, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#2a1a14'; ctx.fillRect(ax - 96, ay, 192, 10);
    }
  }

  drawReset(ctx, body) {
    const hero = this.hero;
    const cost = this.resetCost();
    uiPanel(ctx, body.x, body.y, body.w, body.h - 60, { corner: false });
    text(ctx, '배운 기술을 모두 잊고 스킬 포인트를 돌려받습니다.', body.x + 20, body.y + 32, { size: 15, color: '#efe4cf' });
    text(ctx, '시작 기술은 1레벨로 남습니다.', body.x + 20, body.y + 56, { size: 12, color: '#9d8f80' });
    const learned = Object.entries(hero.skills || {}).filter(([, l]) => l > 0);
    let y = body.y + 92;
    const refund = this.refundable();
    text(ctx, `보유 SP  ${hero.sp ?? 0}`, body.x + body.w - 20, body.y + 32, { size: 16, weight: 900, family: FONT.num, color: '#8ae0ff', align: 'right' });
    text(ctx, refund > 0 ? `돌려받을 SP  ${refund}` : '돌려받을 SP 없음', body.x + body.w - 20, body.y + 56, { size: 12, weight: 800, color: refund > 0 ? '#8ae0ff' : '#9d8f80', align: 'right' });
    if (!learned.length) text(ctx, '익힌 기술이 없습니다.', body.x + body.w / 2, y + 40, { size: 14, color: COLORS.dim, align: 'center' });
    const colW = (body.w - 40) / 2;
    learned.slice(0, 12).forEach(([id, lv], i) => {
      const x = body.x + 20 + (i % 2) * colW, yy = y + Math.floor(i / 2) * 30;
      const sk = SkillData.SKILLS?.[id];
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, yy - 18, colW - 10, 26);
      text(ctx, sk?.name ?? id, x + 10, yy, { size: 13, color: '#efe4cf', maxWidth: colW - 70 });
      text(ctx, `Lv.${lv}`, x + colW - 20, yy, { size: 13, weight: 800, family: FONT.num, color: '#ffe7a0', align: 'right' });
    });
    this.actRect = this.tz('act', { x: body.x + body.w / 2 - 170, y: body.y + body.h - 50, w: 340, h: 48 });
    const ok = refund > 0 && this.state.gold >= cost;
    uiButton(ctx, this.actRect, refund > 0 ? `초기화  ·  ${fmt(cost)} G` : '초기화할 기술 없음', { selected: !!ok, size: 17 });
  }

  drawSave(ctx, body) {
    const st = this.state, hero = this.hero, ch = CHARACTERS[hero.charId];
    uiPanel(ctx, body.x, body.y, body.w, body.h - 60, { corner: false });
    const cx = body.x + 110;
    const look = composeLook(st, hero);
    this.preview(ctx, 'save', look, cx, body.y + body.h - 90, 1.9, look.aura?.color);
    const tx = body.x + 220;
    text(ctx, `슬롯 ${st.slot ?? 1}`, tx, body.y + 40, { size: 13, weight: 800, family: FONT.num, color: '#9d8f80' });
    text(ctx, ch.name, tx, body.y + 72, { size: 24, weight: 800, family: FONT.title, color: '#f3d690' });
    // 진행 기록: 1부(유물)와 2부(세계의 심장 · 별의 조각)를 나눠 보여 준다. 비전서는 전체 수
    const P = st.progress ?? {}, F = P.flags ?? {}, chap = P.chapter ?? 0;
    const p2 = !!F.p2_started || chap >= 14;
    const p1Docs = STAGE_ORDER.reduce((n, id) => n + ((STAGES[id]?.part ?? 1) < 2 ? (STAGES[id]?.docs?.length ?? 0) : 0), 0) || 20;
    const rows = [
      ['직업', `${CLASSES[hero.classId]?.name ?? ''}  ·  Lv.${hero.level}`],
      ['진행', chap > 0 ? `${chap >= 14 ? '제2부 · ' : ''}제${chap}장까지 클리어` : '아직 클리어한 장 없음'],
      ['드라큘라의 유물', `${P.relics?.length ?? 0} / 5`],
      ...(p2 ? [['세계의 심장', `${P.hearts?.length ?? 0} / 6`], ['별의 조각', `${P.shards?.length ?? 0} / 6`]] : []),
      ['비전서', `${P.docs?.length ?? 0} / ${p2 ? Object.keys(DOCS).length : p1Docs}`],
      ['플레이 시간', fmtTime(st.stats?.playTime ?? 0)],
      ['마지막 기록', st.savedAt ? new Date(st.savedAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '없음'],
    ];
    const sp = Math.min(30, Math.floor((body.h - 60 - 118) / Math.max(1, rows.length - 1)));
    rows.forEach(([k, v], i) => {
      const y = body.y + 108 + i * sp;
      text(ctx, k, tx, y, { size: 13, color: '#9d8f80' });
      text(ctx, v, body.x + body.w - 24, y, { size: 14, weight: 700, color: '#efe4cf', align: 'right' });
    });
    // [hook:gal] 단추 둘: 기록 · 회랑 (각 폭 min(240, (body.w − 48) / 2), 높이 48 → ≥ 44 CSS px, 사이 16)
    const bw = Math.min(240, (body.w - 48) / 2), bx = body.x + body.w / 2 - bw - 8, by = body.y + body.h - 50;
    this.actRect = this.tz('act', { x: bx, y: by, w: bw, h: 48 });
    this.galRect = this.tz('gal', { x: bx + bw + 16, y: by, w: bw, h: 48 });   // [hook:gal]
    uiButton(ctx, this.actRect, '여정을 기록한다', { selected: this.sel !== 1, size: 17 });
    uiButton(ctx, this.galRect, '회랑에서 돌아본다', { selected: this.sel === 1, size: 17 });   // [hook:gal]
  }

  renderOver(ctx, L) {
    const C = this.cere;
    if (!C) return;
    const { vw, vh } = L;
    const t = C.t, cx = vw / 2, by = vh * 0.76;
    ctx.save();
    ctx.fillStyle = `rgba(4,3,10,${Math.min(0.95, t * 2)})`; ctx.fillRect(0, 0, vw, vh);
    // 빛기둥
    const k = clamp(t / 1.5, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    const pw = 60 + k * 80 + (t > 1.5 ? Math.max(0, 1 - (t - 1.5)) * 200 : 0);
    const pg = ctx.createLinearGradient(cx - pw, 0, cx + pw, 0);
    pg.addColorStop(0, 'rgba(255,240,180,0)'); pg.addColorStop(0.5, `rgba(255,245,210,${0.25 + k * 0.35})`); pg.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = pg; ctx.fillRect(cx - pw, 0, pw * 2, by + 20);
    glow(ctx, cx, by - 70, 160 + k * 60, '#fff2b0', 0.3 + k * 0.4);
    // 마법진
    ctx.save(); ctx.translate(cx, by); ctx.scale(1, 0.28); ctx.rotate(t * 0.8);
    ctx.strokeStyle = `rgba(255,230,150,${0.4 + k * 0.5})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 130, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 130, Math.sin(a) * 130); ctx.lineTo(Math.cos(a + 2.1) * 130, Math.sin(a + 2.1) * 130); ctx.stroke(); }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    // 영웅 (전직 전 → 후)
    const hero = this.hero;
    const look = composeLook(this.state, hero);
    const oldLook = composeLook(this.state, { ...hero, classId: C.cls.parent ?? hero.classId });
    const useNew = t > 1.5;
    this.preview(ctx, useNew ? 'cere_new' : 'cere_old', useNew ? look : oldLook, cx, by, vh < 500 ? 1.8 : 2.2, useNew ? look.aura?.color : null);
    if (!useNew) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, by - 90, 110, '#fff8e0', k * 0.8); ctx.restore(); }
    if (useNew) {
      const e = ease.outBack(Math.min(1, (t - 1.5) * 3));
      ctx.save(); ctx.translate(cx, vh * 0.17); ctx.scale(e, e);
      text(ctx, '전직 완료', 0, 0, { size: 22, weight: 800, family: FONT.title, color: '#fff4d8', align: 'center', ow: 4 });
      text(ctx, C.cls.name, 0, 44, { size: 42, weight: 900, family: FONT.title, color: '#ffe070', align: 'center', ow: 6, outline: '#3a2400' });
      text(ctx, `${C.cls.eng ?? ''}`, 0, 68, { size: 13, weight: 800, family: FONT.num, color: '#c8b890', align: 'center' });
      ctx.restore();
      if (C.cls.perk) text(ctx, `특성 · ${C.cls.perk}`, cx, vh - 64, { size: 15, weight: 700, color: '#ffe7a0', align: 'center', ow: 3 });
      text(ctx, '스킬 포인트 +3', cx, vh - 36, { size: 13, weight: 800, color: '#8ae0ff', align: 'center', ow: 3 });
      if (t > 2.4 && Math.floor(t * 2.5) % 2 === 0) {
        if (input.touchMode) text(ctx, '화면을 눌러 계속', cx, vh - 12, { size: 12, align: 'center', color: '#c8b8a0' });
        else uiHints(ctx, [['confirm', '계속']], cx, vh - 12);
      }
    } else text(ctx, '빛이 그대를 감싼다…', cx, vh * 0.2, { size: 20, weight: 700, family: FONT.title, color: `rgba(255,240,200,${k})`, align: 'center', ow: 3 });
    ctx.restore();
  }
}

function drawCandle(ctx, x, y, t, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#2a1a10'; ctx.fillRect(-12, -3, 24, 4);
  const g = ctx.createLinearGradient(-6, 0, 6, 0); g.addColorStop(0, '#f4ead4'); g.addColorStop(1, '#b8a888');
  ctx.fillStyle = g; ctx.fillRect(-6, -30, 12, 27);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, -38, 22, '#ffb45a', 0.8);
  const f = 1 + Math.sin(t * 17) * 0.1;
  ctx.fillStyle = '#ffcf70'; ctx.beginPath(); ctx.ellipse(0, -37 * 1, 3.2, 8 * f, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.ellipse(0, -35, 1.6, 4 * f, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
