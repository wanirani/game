// 성 루미나 성당 (알베르토 신부 · 2부는 엘리제): 전직(새 외형 미리보기 · 특성 · 능력치 배율) · 축복(기도 힌트/성수/주문서) · 스킬 초기화 · 여정 기록(저장)
// 「여정 기록」 탭의 아래 단추 둘 (docs/specs/gallery.md §5.7, GAL-UI): [여정을 기록한다] [회랑에서 돌아본다] — ←→ 로 고르고 confirm,
// alt = 회랑 바로가기 → push('gallery', {}) (극장 꺼짐, 닫으면 성당으로)
// 「초월의 길」 (docs/specs/classes_t3.md §8.1): 2차(최상급) 영웅의 전직 탭 — 왼쪽 32% 지금 직업(미리보기), 오른쪽 68% 2×2 칸
//   [시련 Ⅰ][초월] / [시련 Ⅱ][비전]. 첫 탭 = 고르기, 둘째 탭 = 실행 (card: 규칙). ←→↑↓ 로 칸, ↓ 아래 = 「기본 최상급으로」.
//   시련 → 확인 창 → TRIAL.startTrial (시련 엔진) · 초월(2차 그대로일 때) → 확인 창 → 초월 의식 · 해금된 다른 길로 바꾸기 → 짧은 의식 (1.2초).
//   칸의 줄 높이는 글자 하한(ui.textFloor)에서 잡는다 (글자 크기 '아주 크게'에서도 겹치지 않게). 고른 칸의 본문이 넘치면 그 칸만 스크롤.
//   enter(params): tab 'class' · trial(시련에서 돌아옴 → trialDone 대사) · unlocked(새로 열린 초월/비전 id → 칸 축하 연출)
// 2부(flags.p2_started): 성당지기는 엘리제 (SHOP_LINES.elise, 2부 힌트도 엘리제 말투 — story_ext §5.4). 신부님은 안쪽 방에 누워 계시다 →
//   축복 탭의 「안쪽 방 — 신부님」 줄 = npcTalk + 알베르토 대화 (el_letter · ab_dawnflower · npc_alberto_ex22 가 그대로 이어진다)
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { bus } from '../../core/events.js';
import { text, panel, button, bar, FONT, COLORS, font, textFloor } from '../../core/ui.js';
import { fmt, fmtTime, rand, clamp, TAU, ease, rgba } from '../../core/math.js';
import { drawHero } from '../../render/hero.js';
import { drawIcon } from '../../render/icons.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES, classChain } from '../../data/classes.js';
import * as SkillData from '../../data/skills.js';
import { STAGES, STAGE_ORDER } from '../../data/stages.js';
import { DOCS } from '../../data/lore.js';
import { ITEMS } from '../../data/items.js';
import { BOSSES } from '../../data/bosses.js';
import { ASCENSIONS, TIER_NAMES, KIND_LABEL, ascListFor, heroKey, classNameOf, classEngOf, tierLabelOf } from '../../data/ascensions.js';
import { trialsOf } from '../../data/trials.js';
import { modName } from '../../core/online.js';
import { availableClasses, canChangeClass, changeClass, trialStatus, canAscend, ascend, switchAsc } from '../../game/progression.js';
import * as TRIAL from '../../game/trial.js';
import { composeLook, lookForAsc, STAT_INFO } from '../../game/stats.js';
import { addByBase } from '../../game/inventory.js';
import { SHOP_LINES } from '../../data/town.js';
import { ServiceScene, Modal, RewardPopup, makeInst, hitRect, rowBg, Snap, uiPanel, uiButton, uiHints, josa } from './common.js';
import { vGrad, rGrad, fillGradRect, wrapC, Gesture, Scroller, clipBegin, clipEnd, scrollbar, moreBelow, pill, glyph } from '../menu/common.js';
// 직업 카드 그라디언트 색 멈춤 (menu/common 캐시 — 매 프레임 새 그라디언트 0, R1-REQ-341B)
const CARD_SEL = [0, 'rgba(60,30,50,0.92)', 1, 'rgba(6,3,8,0.95)'], CARD_OFF = [0, 'rgba(20,12,22,0.88)', 1, 'rgba(6,3,8,0.95)'];
// 스크롤 칸 위·아래 가림 (그 높이의 카드 색: 위 = 선택/보통 카드 그라디언트의 30% 지점, 아래 = 카드 아래쪽 색)
const CARD_FADE = [0, 'rgba(6,3,8,0)', 1, 'rgba(6,3,8,0.92)'], FADE_SEL = [0, 'rgba(43,21,36,0.95)', 1, 'rgba(43,21,36,0)'], FADE_OFF = [0, 'rgba(16,9,18,0.95)', 1, 'rgba(16,9,18,0)'];
import { glow } from './facades.js';

const TIER_NAME = TIER_NAMES;   // ['기본 직업', '상급 직업', '최상급 직업', '초월'] (data/ascensions.js)
/** 초월의 길 빛깔: 시련 · 초월 · 비전 */
const PATH_COL = { trial: '#c8a0ff', t3: '#ffd870', hidden: '#c8a0ff' };
const own = (o, k) => !!o && typeof k === 'string' && Object.hasOwn(o, k);
/** 초월(t3)은 시련 Ⅰ, 비전은 시련 Ⅱ 가 연다 (칸의 짧은 잠김 줄) */
const TRIALS_N = { t3: '시련 Ⅰ을', hidden: '시련 Ⅱ를' };   // Ⅰ(일)+을 · Ⅱ(이)+를

export class ChurchScene extends ServiceScene {
  setup(params = {}) {
    // 2부에는 엘리제가 성당을 지킨다 (배경은 그대로 — classes_t3 §8.1 · story_ext §5.4)
    this.p2 = !!this.state?.progress?.flags?.p2_started;
    this.bgKey = 'cg/cg_alberto_church'; this.title = '성 루미나 성당'; this.eng = 'ST. LUMINA CATHEDRAL';
    this.npcId = this.p2 ? 'npc_elise' : 'npc_alberto';
    this.lines = this.p2 ? SHOP_LINES.elise : SHOP_LINES.alberto; this.music = 'church'; this.portraitGlow = '#fff2b0'; this.emberColor = '#fff2b0';
    if (this.p2) { try { assets.preload(['portraits/npc_elise']); } catch { /* 없음 */ } }
    this.tabs = [{ id: 'class', label: '전직' }, { id: 'bless', label: '축복' }, { id: 'reset', label: '스킬 초기화' }, { id: 'save', label: '여정 기록' }];
    this.sel = 0; this.cardSel = 0; this.rigs = {}; this.cere = null;
    // 전직 카드의 설명·특성·보정치 칸이 카드보다 길 때(휴대폰)만 세로 스크롤: 두 카드가 같은 자리로 (끌기·휠·↑↓·오른쪽 스틱 Y)
    this.ges = new Gesture(); this.csc = new Scroller(); this.cscRect = null; this.cscKey = null;
    this.autoS = { t: 0, dir: 1 };   // 초월의 길: 고른 칸 본문 자동 넘김 (패드·키보드 — ↑↓ 는 칸 이동이라)
    this.prayed = false;
    // 시련에서 돌아옴 (hub → push('church', { tab: 'class', trial, unlocked }))
    const ti = this.tabs.findIndex((t) => t.id === params.tab);
    if (ti >= 0) this.tab = ti;
    const fresh = Array.isArray(params.unlocked) ? params.unlocked.filter((id) => own(ASCENSIONS, id)) : [];
    this.fresh = fresh.length ? { ids: new Set(fresh), t: 0, burst: false } : null;
    if (fresh.length) {
      const hero = this.hero, list = ascListFor(hero?.classId);
      const k = list.findIndex((id) => fresh.includes(id));
      if (k >= 0) { this.sel = this.cardSel = k === 0 ? 1 : 3; }
    }
    if (params.trial || fresh.length) {
      this.talk(this.lines.trialDone ? 'trialDone' : 'hello');
      if (fresh.length) { audio.sfx('levelup', { vol: 0.7 }); audio.sfx('bell', { vol: 0.5 }); }
    } else this.talk('hello');
  }
  /** 성당지기 말투로 고른 한 줄 (1부 알베르토 · 2부 엘리제) */
  say2(alberto, elise) { return this.p2 ? elise : alberto; }
  get useLeftRight() { return this.tab === 0 || this.tab === 1 || this.tabs[this.tab]?.id === 'save'; }   // [hook:gal] 기록 탭: ←→ = 두 단추
  /** 안내 줄의 선택 방향: 전직 카드·기록 탭의 두 단추는 ←→ (초월의 길은 2×2 라 네 방향), 축복 목록은 ↑↓, 초기화 탭은 고를 것이 없다 */
  selectHint() { const id = this.tabs[this.tab]?.id; return id === 'class' ? (this.ascMode ? 'dpad' : 'dpadH') : id === 'save' ? 'dpadH' : id === 'bless' ? 'dpadV' : null; }   // [hook:gal] 기록 탭 ←→
  extraHints() { return this.tabs[this.tab]?.id === 'save' ? [['alt', '회랑']] : []; }   // [hook:gal] 회랑 바로가기
  onTab() { this.sel = 0; this.cardSel = 0; this.csc.reset(); }
  /** 2차(최상급) 영웅이면 전직 탭은 「초월의 길」 */
  get ascMode() { return CLASSES[this.hero?.classId]?.tier === 2; }

  get options() {
    const hero = this.hero;
    try { return availableClasses(hero) || []; } catch { return []; }
  }
  blessOptions() {
    const o = [{ id: 'pray', icon: 'doc', title: '기도하기', desc: this.p2 ? (this.prayed ? '엘리제의 이야기를 다시 듣는다.' : '촛불을 밝히고 엘리제의 이야기를 듣는다.') : (this.prayed ? '신부님의 조언을 다시 듣는다.' : '촛불을 밝히고 신부님의 조언을 구한다.'), price: 0 }];
    // 2부: 안쪽 방에 누워 계신 신부님과 대화 (classes_t3 §8.1 — 마을에서는 보이지 않는다, npcs.js hideFlag)
    if (this.p2) o.push({ id: 'alberto', icon: 'key', title: '안쪽 방 — 신부님', desc: '안쪽 방에서 쉬고 계신 신부님을 찾아뵙는다.', price: 0, talk: true });
    if (ITEMS.c_holywater) o.push({ id: 'holywater', icon: ITEMS.c_holywater.icon ?? 'sub_holywater', title: `${ITEMS.c_holywater.name} 봉헌`, desc: '성수 한 병을 축성받는다. 20초간 성광의 오라.', price: ITEMS.c_holywater.price ?? 400, item: 'c_holywater' });
    if (ITEMS.m_scroll_bless) o.push({ id: 'blessScroll', icon: 'scroll_bless', title: '축복 의식', desc: '축복 주문서 한 장을 받는다. 강화 성공률 +10%p.', price: Math.round((ITEMS.m_scroll_bless.price ?? 1500) * 1.2 / 50) * 50, item: 'm_scroll_bless' });
    return o;
  }
  resetCost() { return 100 + (this.hero.level ?? 1) * 60; }
  /** 초기화로 돌려받을 스킬 포인트 (무료로 받은 시작 기술 1레벨은 제외 — skills.resetSkills 와 같은 계산) */
  refundable() {
    const hero = this.hero, starter = SkillData.STARTER_SKILLS?.[hero.charId];
    // 해금된 비전 기술의 1레벨도 무료 (skills.resetSkills 가 다시 1레벨로 돌려놓는다 — classes_t3 §2.3)
    const free = new Set([starter, ...(Array.isArray(hero.ascUnlocked) ? hero.ascUnlocked.map((id) => ASCENSIONS[id]?.skill).filter(Boolean) : [])]);
    let n = 0;
    for (const [id, lv] of Object.entries(hero.skills || {})) n += Math.max(0, (lv ?? 0) - (free.has(id) ? 1 : 0)) * (SkillData.SKILLS?.[id]?.spCost ?? 1);
    return n;
  }

  updateBody(dt) {
    this.ges.addWheel(this.wheel); this.ges.update();
    if (this.fresh) {
      this.fresh.t += dt;
      if (!this.fresh.burst && this.fresh.at) {   // 새로 열린 칸: 한 번 터뜨린다 (자리는 drawAscPath 가 적었다)
        this.fresh.burst = true;
        for (const q of this.fresh.at) { this.fx.burst('holy', q.x, q.y, 36, { speed: 240 }); this.fx.ring(q.x, q.y, { color: q.color, r0: 10, r1: 160, life: 0.7, width: 5 }); }
      }
    }
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
    if (tab === 'class' && this.ascMode) {
      const r = this.updateAscPath(dt, id, pick);
      if (r) return r;
    } else if (tab === 'class') {
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
    if (!chk.ok) { audio.sfx('menu_cancel'); this.game.toast(chk.reason ?? '아직 때가 아니다.', '#ff8a7a'); this.talk(this.say2(`아직 이르네. ${chk.reason ?? ''}. 조금 더 수련하고 오게.`, `아직 일러요. ${chk.reason ?? ''}. 조금만 더 수련하고 오세요!`)); return; }
    audio.sfx('menu_ok');
    this.modal = new Modal({
      title: '전직하시겠습니까?', width: 480,
      lines: [`「${classNameOf(hero)}」 → 「${c.name}」`, '전직은 되돌릴 수 없습니다.', '보너스 스킬 포인트 +3'],
      buttons: [{ label: '서약한다', value: 'ok', primary: true }, { label: '다시 생각한다', value: 'cancel' }],
      onResult: (r) => { if (r.value === 'ok') this.startCeremony(c); },
    });
  }
  startCeremony(c) {
    const hero = this.hero;
    const res = changeClass(hero, c.id);
    if (!res?.ok) { this.game.toast(res?.reason ?? '전직에 실패했다.', '#ff8a7a'); return; }
    this.cere = { kind: 'class', t: 0, cls: c, rig: {}, boomAt: 1.5, doneAt: 2.4, color: '#fff2b0' };
    audio.duck?.(0.4, 3);
    audio.sfx('holy'); audio.sfx('charge_ready', { vol: 0.6 });
    this.lockTabs = true;
  }

  // ── 초월의 길 (classes_t3 §8.1) ──
  /**
   * 2×2 칸: [0] 시련 Ⅰ · [1] 초월 · [2] 시련 Ⅱ · [3] 비전. 칸 = { kind: 'trial'|'asc', T|A, st, known, ... }
   * 시련 Ⅱ 와 비전은 시련 Ⅰ을 넘기 전에는 '???' (비전이 이미 해금돼 있으면 보인다)
   */
  pathCards() {
    const hero = this.hero, st = this.state;
    const [T1, T2] = trialsOf(hero.charId);
    const [tId, hId] = ascListFor(hero.classId);
    const t1Done = !!(T1 && hero.trials?.[T1.id]?.done);
    const unlocked = (aid) => Array.isArray(hero.ascUnlocked) && hero.ascUnlocked.includes(aid);
    const trialCard = (T, known) => (T ? { kind: 'trial', T, known, ts: trialStatus(hero, T.id, st), rec: hero.trials?.[T.id] ?? null } : null);
    const ascCard = (aid, known) => (aid && own(ASCENSIONS, aid) ? { kind: 'asc', A: ASCENSIONS[aid], known, chk: canAscend(hero, aid, st) } : null);
    return [trialCard(T1, true), ascCard(tId, true), trialCard(T2, t1Done), ascCard(hId, t1Done || unlocked(hId))];
  }
  /** 칸 상태 줄과 실행 단추 → { state: 'locked'|'ready'|'done'|'cur', line, color, act, ok } */
  cardInfo(c) {
    const hero = this.hero;
    if (!c) return { state: 'locked', line: '', color: COLORS.dim, act: '—', ok: false };
    if (c.kind === 'trial') {
      const s = c.ts, T = c.T;
      if (!c.known) return { state: 'locked', line: '잠김 · 시련 Ⅰ을 먼저 넘어야 한다', color: COLORS.dim, act: '시련에 도전', ok: false };
      const act = s.code === 'level' && s.state !== 'done' ? `레벨 ${T.reqLevel} 필요` : '시련에 도전';
      if (s.state === 'done') {
        const best = Number.isFinite(c.rec?.best) && c.rec.best > 0 ? ` ${fmtTime(c.rec.best)}` : '';
        const tries = Number.isInteger(c.rec?.tries) && c.rec.tries > 0 ? ` · ${c.rec.tries}회` : '';
        return { state: 'done', line: `통과 ✓${best}${tries}`, color: '#9fe8a0', act, ok: s.code === 'ok' };
      }
      if (s.state === 'ready') return { state: 'ready', line: '도전 가능', color: COLORS.good, act, ok: true };
      return { state: 'locked', line: `잠김 · ${s.reason}`, color: '#e89090', act, ok: false };
    }
    const A = c.A, chk = c.chk;
    if (!c.known) return { state: 'locked', line: '잠김 · 시련 Ⅰ을 먼저 넘어야 한다', color: COLORS.dim, act: '???', ok: false };
    const nm = josa(`「${A.name}」`, '으로', '로');
    if (chk.code === 'current') return { state: 'cur', line: '현재', color: '#ffe070', act: '현재 직업', ok: false };
    const act = chk.code === 'level' ? `레벨 ${A.reqLevel} 필요` : hero.asc ? `${nm} 바꾼다` : `${nm} 초월`;
    if (chk.ok) return { state: 'ready', line: '초월 가능', color: COLORS.good, act, ok: true };
    // 시련이 막고 있으면 칸에는 짧게 (옆 칸이 그 시련이다 — 긴 이유는 눌렀을 때 토스트로)
    const why = chk.code === 'trial' ? `${TRIALS_N[A.kind] ?? '시련을'} 넘어야 한다` : chk.reason;
    return { state: 'locked', line: `잠김 · ${why}`, color: '#e89090', act, ok: false };
  }
  updateAscPath(dt, id, pick) {
    const cards = this.pathCards(), hero = this.hero;
    const hasBase = !!hero.asc;
    if (this.sel > 3 && !hasBase) this.sel = this.cardSel;
    // 고른 칸의 본문 스크롤: 끌기·휠·오른쪽 스틱 Y + (손대지 않으면) 천천히 자동 넘김
    if (this.cscRect) this.csc.update(dt, this.cscRect, this.ges);
    if (this.csc.max > 0 && !this.csc.userScrolled && !this.csc.dragging) {
      // 한 줄씩 넘긴다 (줄 사이에 멈춰 읽을 틈 · 끝에서 잠시 뒤 처음으로) — 글자 크기가 커서 한두 줄만 보이는 칸도 반 줄에 걸치지 않게
      const S = this.autoS; S.t += dt;
      if (S.t > 2.2) {
        S.t = 0;
        const L = this.cscLH || 18, cur = this.csc.target;
        this.csc.target = cur >= this.csc.max - 1 ? 0 : clamp((Math.round(cur / L) + 1) * L, 0, this.csc.max);
      }
    }
    const dragged = this.csc.max > 0 && this.ges.moved;
    const moveTo = (i) => { if (i !== this.sel) { this.sel = i; if (i <= 3) this.cardSel = i; this.csc.reset(); this.autoS = { t: 0, dir: 1 }; audio.sfx('menu_move'); } };
    // 키·패드: 2×2 칸 (↓ 아래 줄에서 = 「기본 최상급으로」)
    const s = this.sel;
    if (input.pressed('left')) { if (s <= 3) moveTo(s % 2 ? s - 1 : s + 1); }
    if (input.pressed('right')) { if (s <= 3) moveTo(s % 2 ? s - 1 : s + 1); }
    if (input.pressed('up')) { if (s === 4) moveTo(this.cardSel >= 2 ? this.cardSel : 2); else if (s >= 2) moveTo(s - 2); }
    if (input.pressed('down')) { if (s <= 1) moveTo(s + 2); else if (s <= 3 && hasBase) moveTo(4); }
    // 포인터
    const i = dragged ? -1 : pick('card:');
    if (i >= 0 && cards[i]) { if (this.sel === i) this.pathAct(cards[i]); else moveTo(i); return 'handled'; }
    if (id === 'base' && hasBase) { this.sel = 4; this.toBase(); return 'handled'; }
    if (id === 'act' && !dragged) { this.pathAct(cards[this.cardSel]); return 'handled'; }
    if (input.pressed('confirm')) { if (this.sel === 4) this.toBase(); else this.pathAct(cards[this.sel]); return 'handled'; }
    return null;
  }
  /** 칸 실행: 시련 → 확인 창 → 시련 엔진 / 초월 → (처음 들어설 때) 확인 창 → 의식 · (다른 길로) 바로 짧은 의식 */
  pathAct(c) {
    if (!c) return;
    const hero = this.hero, st = this.state, info = this.cardInfo(c);
    if (!info.ok) {
      audio.sfx('menu_cancel');
      const why = c.kind === 'trial' ? (c.known ? c.ts.reason : '시련 Ⅰ을 먼저 넘어야 한다') : (c.known ? c.chk.reason : '시련 Ⅰ을 먼저 넘어야 한다');
      if (why) this.game.toast(why, '#ff8a7a');
      return;
    }
    audio.sfx('menu_ok');
    if (c.kind === 'trial') {
      const T = c.T;
      const rules = [...(T.mods ?? []).map((m) => modName(m)), ...(T.diffOver?.bossHp ? [`보스 체력 ${T.diffOver.bossHp}배`] : [])];
      this.modal = new Modal({
        title: '시련에 도전하시겠습니까?', width: 500,
        lines: [`보스: ${BOSSES[T.boss]?.name ?? STAGES[T.stage]?.name ?? '???'} · 권장 Lv ${T.recLv}`, '시련 중에는 전리품·경험치가 없고 목숨이 줄지 않습니다.', ...(rules.length ? [`규칙: ${rules.join(' · ')}`] : [])],
        buttons: [{ label: '도전한다', value: 'ok', primary: true }, { label: '다시 생각한다', value: 'cancel' }],
        onResult: (r) => {
          if (r.value !== 'ok') return;
          this.talk('trial');
          try { TRIAL.startTrial(this.game, T.id); } catch (e) { console.error(e); this.game.toast('시련을 시작하지 못했다.', '#ff8a7a'); }
        },
      });
      return;
    }
    const A = c.A;
    if (hero.asc) { this.doAscend(A, true); return; }   // 해금된 다른 길로: 확인 창 없이 짧은 의식
    const first = !hero.ascSp;
    this.modal = new Modal({
      title: '초월하시겠습니까?', width: 500,
      lines: [`「${CLASSES[hero.classId]?.name ?? ''}」 → 「${A.name}」`, '초월한 길은 성당에서 언제든 바꿀 수 있습니다.', ...(first ? ['첫 초월 보너스 스킬 포인트 +3'] : [])],
      buttons: [{ label: '서약한다', value: 'ok', primary: true }, { label: '다시 생각한다', value: 'cancel' }],
      onResult: (r) => { if (r.value === 'ok') this.doAscend(A, false); },
    });
  }
  doAscend(A, short) {
    const hero = this.hero, prev = hero.asc ?? null;
    const res = ascend(hero, A.id, this.state);
    if (!res?.ok) { audio.sfx('menu_cancel'); this.game.toast(res?.reason ?? '초월하지 못했다.', '#ff8a7a'); return; }
    this.afterAsc();
    this.startAscCeremony(A, prev, !!res.first, short);
  }
  /** 「기본 최상급으로」: 초월·비전을 내려놓고 2차 그대로 (무료, 짧은 의식) */
  toBase() {
    const hero = this.hero, prev = hero.asc ?? null;
    if (!prev) return;
    const res = switchAsc(hero, null, this.state);
    if (!res?.ok) { audio.sfx('menu_cancel'); this.game.toast(res?.reason ?? '길을 바꾸지 못했다.', '#ff8a7a'); return; }
    audio.sfx('menu_ok');
    this.afterAsc();
    this.startAscCeremony(null, prev, false, true);
  }
  /** 초월이 바뀐 뒤: 월드의 플레이어 능력치·외형 다시 계산 · 미리보기 캐시 비우기 */
  afterAsc() {
    try { this.world?.player?.refreshStats?.(); } catch (e) { console.error(e); }
    this.rigs = {}; this.snaps = null;
  }
  startAscCeremony(A, prevId, first, short) {
    const color = A ? A.ult?.accent ?? PATH_COL[A.kind] : '#fff2b0';
    this.cere = { kind: 'asc', t: 0, A, prevId, first, short, color, boomAt: short ? 0.45 : 1.5, doneAt: short ? 0.6 : 2.4, autoEnd: short ? 1.2 : 0 };
    if (!short) audio.duck?.(0.4, 3);
    audio.sfx('holy', { pitch: A?.kind === 'hidden' ? 0.8 : 1 }); if (!short) audio.sfx('charge_ready', { vol: 0.6 });
    this.lockTabs = true;
  }
  updateCeremony(dt) {
    const C = this.cere, vw = this.vw, vh = this.vh;
    C.t += dt;
    const cx = vw / 2, cy = vh * 0.76;
    const emit = C.short ? 0.35 : 0.6;
    if (C.t < C.boomAt + 0.1 && Math.random() < emit) this.fx.emit('holy', cx + rand(-60, 60), cy + rand(-10, 20), { speed: 120, angle: -Math.PI / 2, spread: 0.6 });
    if (!C.boom && C.t > C.boomAt) {
      C.boom = true;
      audio.sfx(C.short ? 'item' : 'levelup'); audio.sfx('holy', { pitch: 1.3 });
      this.game.flash(C.color === '#fff2b0' ? '#fff8e0' : C.color, C.short ? 0.5 : 0.85, 2);
      this.fx.burst('holy', cx, cy - 70, C.short ? 30 : 60, { speed: 380 });
      this.fx.burst('gold', cx, cy - 70, C.short ? 20 : 40, { speed: 300 });
      this.fx.ring(cx, cy - 70, { color: C.color, r0: 20, r1: C.short ? 200 : 300, life: 0.8, width: 9 });
      this.talk(C.kind === 'asc' ? (C.A && this.lines.asc ? 'asc' : 'cls') : 'cls');
    }
    const done = C.autoEnd > 0 && C.t > C.autoEnd;
    if (done || (C.t > C.doneAt && (input.pressed('confirm') || input.pressed('cancel') || input.pointer.tapped))) {
      if (!done) audio.sfx('menu_ok');
      const asc = C.kind === 'asc';
      this.cere = null; this.lockTabs = false; this.rigs = {};
      if (!asc) this.sel = 0;
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
    if (o.id === 'alberto') {
      // 안쪽 방 — 신부님 (2부): 마을의 NPC 대화와 같은 길 (퀘스트 'talk' 목표 · 신부님 대본 순환)
      audio.sfx('door', { vol: 0.5 });
      bus.emit('npcTalk', { npcId: 'npc_alberto' });
      this.game.push('dialogue', { npc: 'npc_alberto', world: this.world });
      return;
    }
    if ((st.gold ?? 0) < o.price) { audio.sfx('menu_cancel'); this.talk(this.say2('헌금은 마음이면 충분하다만… 이번엔 금화가 조금 모자라는구먼.', '헌금이 조금 모자라요… 마음만으로도 고맙지만요!')); return; }
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
        this.popup = new RewardPopup({ title: '축복을 받았다', sub: this.say2('알베르토 신부가 조용히 기도를 올렸다.', '엘리제가 두 손 모아 기도를 올렸다.'), items: [makeInst(o.item) ? Object.assign(makeInst(o.item), { qty: 1 }) : got], color: '#fff2b0' });
      },
    });
  }
  /**
   * 기도 힌트. 스테이지는 1부(s01~s13)와 2부(s14~)를 나눠 모으고 (MASTER_PLAN §1.14: 전체를 보되 2부는 따로 묶는다),
   * 2부가 시작됐으면 2부 힌트를 먼저 준다. 1부는 유물·비전서, 2부는 별의 조각·세계의 심장·비전서.
   * 2부의 성당지기는 엘리제 — 같은 조건, 엘리제 말투 (story_ext §5.4 표) + 시련 안내 (2부 결말 뒤 Lv 70 이상인데 시련 Ⅰ 전)
   */
  hint() {
    const st = this.state, P = st.progress ?? {}, F = P.flags ?? {}, E = this.p2;
    const has = (arr, id) => Array.isArray(arr) && arr.includes(id);
    const p1 = [], p2 = [];
    for (const id of STAGE_ORDER) {
      const s = STAGES[id];
      if (!s || !has(P.unlocked, id)) continue;
      const out = (s.part ?? 1) >= 2 ? p2 : p1;
      if (s.relic && !has(P.relics, s.relic)) out.push(E ? `「${s.name}」 깊은 곳에 백작의 유물이 잠들어 있대요. 금 간 벽이랑 안 닿는 길을 잘 살펴보세요!` : `「${s.name}」 깊은 곳에 백작의 유물이 잠들어 있다네. 금이 간 벽과 닿지 않는 길을 살피게.`);
      if (s.shard && !has(P.shards, s.shard)) out.push(E ? `「${s.name}」 어딘가에 별의 조각이 숨어 있대요. 그 세계가 숨겨 둔 길을 끝까지 따라가 보세요.` : `「${s.name}」 어딘가에 별의 조각이 숨어 있다네. 그 세계가 감춰 둔 길을 끝까지 따라가 보게.`);
      const miss = (s.docs || []).filter((d) => !has(P.docs, d)).length;
      if (miss) out.push(E ? `「${s.name}」에는 아직 못 찾은 비전서가 ${miss}권 남았대요. 수상한 벽은 무기로 두드려 보세요!` : `「${s.name}」에는 아직 찾지 못한 비전서가 ${miss}권 남아 있네. 수상한 벽은 무기로 두드려 보게.`);
    }
    if ((P.relics?.length ?? 0) >= 5 && !P.cleared?.s12) p1.push('유물 다섯이 모두 그대 손에 있군… 이제 왕좌의 방으로 가게. 그 너머에 진실이 기다린다네.');
    if (F.p2_started && !F.p2_done) {
      const n = P.hearts?.length ?? 0;
      p2.push(n >= 6 ? (E ? '세계의 심장이 여섯 개 다 모였대요! 등불 들고 공허로 가세요. 저는 여기서 종 칠게요.' : '여섯 세계의 심장이 모두 모였군… 등불을 들고 공허로 가게. 이 늙은이는 여기서 기도하겠네.')
        : (E ? `되찾은 세계의 심장은 ${n}개래요. 여섯 개 다 모아야 공허로 가는 길이 열린대요.` : `되찾은 세계의 심장은 ${n}개일세. 여섯을 모두 되찾아야 공허로 가는 길이 열린다네.`));
    }
    if (F.p2_done && !F.stars_all && (P.shards?.length ?? 0) < 6) p2.push(E ? '별의 조각을 여섯 개 다 모으면 공허가 환해질지도 모른대요. 레이븐 아저씨가 그랬어요.' : '여섯 세계에 숨겨진 별의 조각을 모두 모으면, 공허를 빛으로 채울 수 있을지도 모르네.');
    if (F.p2_done && has(P.unlocked, 's21') && !P.cleared?.s21) p2.push(E ? '구름 위에서 용이 운대요. 이졸데 언니가 밤마다 하늘만 봐요. 성문 밖 지도를 펼쳐 보세요!' : '요즘 구름 위에서 용이 우는 소리가 들린다지. 이졸데가 밤마다 하늘만 올려다본다더군. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s21.md)
    if (F.p2_done && has(P.unlocked, 's22') && !P.cleared?.s22) p2.push(E ? '안개 묘지 너머 언덕에서 까마귀들이 울어요. 성문 밖 지도를 펼쳐 보세요.' : '안개의 묘지 너머 언덕에서 밤마다 까마귀 떼가 운다더군. 까마귀 결사의 둥지가 거기 있다지…. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s22.md)
    if (F.p2_done && has(P.unlocked, 's23') && !P.cleared?.s23) p2.push(E ? '북쪽 고개에 액수 칸이 빈 공고가 붙었대요. 성문 밖 지도를 펼쳐 보세요.' : '북쪽 고개의 사냥꾼들이 요즘 은빛 늑대 이야기만 한다더군. 액수 칸이 빈 공고와 함께 말이야. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s23.md)
    if (F.p2_done && has(P.unlocked, 's24') && !P.cleared?.s24) p2.push(E ? '남쪽 수녀원에 간 언니들이 안 돌아와요. 장미 냄새 나는 밤엔 창문 꼭 닫으래요.' : '남쪽 기슭의 옛 수녀원에서 견습 수녀들이 돌아오지 않는다더군. 장미 향이 짙은 밤에는 창을 꼭 닫게. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s24.md)
    if (F.p2_done && has(P.unlocked, 's25') && !P.cleared?.s25) p2.push(E ? '그레타 아줌마가 밤마다 등불 들고 불탄 목장에 가요. 성문 밖 지도를 펼쳐 보세요.' : '에슈빌 외곽 불탄 목장에서 밤마다 말 울음이 들린다더군. 그레타가 요즘 등불을 들고 혼자 나간다던데. 성문 밖 지도를 펼쳐 보게.');   // 외전 (docs/specs/ex_s25.md)
    // 시련 안내 (classes_t3 §8.1 · story_ext §5.4): 2부 결말 뒤, 지금 영웅이 Lv 70 이상인데 시련 Ⅰ을 아직 넘지 않았다
    const hero = this.hero, T1 = trialsOf(hero?.charId)[0];
    if (E && F.p2_done && (hero?.level ?? 0) >= 70 && T1 && !hero.trials?.[T1.id]?.done) p2.push('종 칠 때 메아리가 들려요. 「전직」에서 시련을 확인해 보세요!');
    const gen = E ? ['콤보를 길게 이을수록 점수가 쑥쑥 오른대요. 쉬지 말고 몰아치세요!', '가끔 금빛 박쥐가 나온대요. 금화를 잔뜩 떨군대요!', '무기를 강화하려면 하드윈 아저씨한테 가 보세요. 망치질은 틀린 적이 없대요.', '물러설 줄 아는 것도 용기래요. 성수는 넉넉히 챙기세요!']
      : ['콤보가 길게 이어질수록 점수가 불어난다네. 쉬지 말고 몰아치게.', '가끔은 금빛 박쥐가 나타난다지. 놓치지 말게, 금화를 잔뜩 떨군다네.', '무기를 강화하려거든 하드윈을 찾게. 그 친구의 망치는 틀린 적이 없어.', '물러설 줄 아는 것도 용기라네. 성수는 넉넉히 챙기게.'];
    const pool = F.p2_started && p2.length ? p2 : p1.length ? p1 : p2;
    const list = pool.length && Math.random() < 0.8 ? pool : gen;
    return list[Math.floor(Math.random() * list.length)] ?? gen[0];
  }

  // ── 스킬 초기화 ──
  tryReset() {
    const st = this.state, hero = this.hero, cost = this.resetCost();
    // 시작 기술(1레벨)만 있으면 돌려받을 포인트가 없으므로 비용을 받지 않는다
    if (this.refundable() <= 0) { audio.sfx('menu_cancel'); this.talk(this.say2('아직 비울 것이 없구먼. 먼저 기술을 익히고 오게.', '아직 비울 게 없어요. 기술부터 익히고 오세요!')); return; }
    if ((st.gold ?? 0) < cost) { audio.sfx('menu_cancel'); this.talk(this.say2(`의식에는 ${fmt(cost)} G가 필요하다네.`, `의식에는 ${fmt(cost)} G가 필요해요.`)); return; }
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
    this.cardRects = null; this.optRects = null; this.actRect = null; this.cscRect = null; this.baseRect = null;
    if (tab === 'class') { if (this.ascMode) this.drawAscPath(ctx, body); else this.drawClass(ctx, body); }
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
    snap.draw(ctx, `${key}:${heroKey(this.hero)}:${scale}`, cx - w / 2, bottom - h + 12 * scale, w, h, (oc) => drawHero(oc, p, null, { scale }));
  }

  drawClass(ctx, body) {
    const hero = this.hero, st = this.state;
    const cur = CLASSES[hero.classId];
    // 현재 직업
    uiPanel(ctx, body.x, body.y, body.w, 64, { corner: false });
    text(ctx, '현재 직업', body.x + 18, body.y + 24, { size: 12, color: '#9d8f80', weight: 700 });
    const cname = classNameOf(hero) || '-';
    text(ctx, cname, body.x + 18, body.y + 50, { size: 20, weight: 800, family: FONT.title, color: '#f3d690' });
    ctx.font = font(20, 800, FONT.title);
    const nw = ctx.measureText(cname).width;
    text(ctx, `${classEngOf(hero)} · ${tierLabelOf(hero)}`, body.x + 30 + nw, body.y + 49, { size: 11, weight: 800, family: FONT.num, color: '#8a7a64' });
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
    // 줄 높이는 글자 하한에서 (글자 크기 '아주 크게'에서 카드 글이 겹치지 않게 — 감사 요청)
    const LF = Math.max(17, Math.ceil(Math.max(12, textFloor()) * 1.4));
    opts.forEach((c, i) => {
      const r = this.tz('card:' + i, { x: body.x + i * (cw + gap), y: y0, w: cw, h });
      this.cardRects.push(r);
      const sel = i === this.sel;
      const chk = canChangeClass(hero, c.id);
      fillGradRect(ctx, vGrad(ctx, r.h, sel ? CARD_SEL : CARD_OFF), r.x, r.y, r.w, r.h); // 캐시 그라디언트
      ctx.strokeStyle = sel ? COLORS.gold : 'rgba(110,85,48,0.6)'; ctx.lineWidth = sel ? 2.5 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      if (sel) { ctx.save(); ctx.shadowColor = 'rgba(232,200,114,0.5)'; ctx.shadowBlur = 18; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore(); }
      // 미리보기 (좌측)
      const look = composeLook(st, { ...hero, classId: c.id, asc: null });
      const pw = Math.min(150, r.w * 0.42);
      ctx.save(); ctx.beginPath(); ctx.rect(r.x + 2, r.y + 2, pw, r.h - 4); ctx.clip();
      const lx = r.x + pw / 2, ly = r.y + r.h * 0.55; // 원점 기준 캐시 (직업 빛깔마다 하나)
      ctx.translate(lx, ly); ctx.fillStyle = rGrad(ctx, 0, 0, 10, r.h * 0.6, [0, rgba(look.aura?.color ?? '#e8c872', 0.2), 1, 'rgba(0,0,0,0)']);
      ctx.fillRect(r.x - lx, r.y - ly, pw, r.h); ctx.translate(-lx, -ly);
      this.preview(ctx, c.id, look, r.x + pw / 2 + 4, r.y + r.h - 22, clamp(r.h / 150, 1.3, 2.1), look.aura?.color, !sel);
      ctx.restore();
      // 정보 (우측): 이름·영문·요구 레벨은 고정. 그 아래(설명·특성·보정치)는 카드에 맞춘다 — 넘치면 설명을 줄이고(2 → 1 → 0줄),
      // 그래도 넘치면(주로 휴대폰) 원래 설명 그대로 그 칸만 세로 스크롤 (보정치 줄을 버리지 않는다)
      const tx = r.x + pw + 12, tw0 = r.w - pw - 22;
      const yN = r.y + 30, yE = yN + Math.max(18, Math.ceil(textFloor() * 1.3)), yR = yE + Math.max(20, LF + 2);
      text(ctx, c.name, tx, yN, { size: 19, weight: 800, family: FONT.title, color: sel ? '#fff4d8' : '#f3d690', maxWidth: tw0 });
      text(ctx, `${c.eng ?? ''} · ${TIER_NAME[c.tier ?? 1]}`, tx, yE, { size: 10, weight: 800, family: FONT.num, color: '#8a7a64', maxWidth: tw0 });
      text(ctx, `요구 레벨 ${c.reqLevel}`, tx, yR, { size: 12, weight: 800, color: chk.ok ? COLORS.good : COLORS.bad });
      const mods = [];
      for (const k in c.mult || {}) { const p = Math.round((c.mult[k] - 1) * 100); if (p) mods.push([STAT_INFO[k]?.name ?? k, `${p > 0 ? '+' : ''}${p}%`, p > 0]); }
      for (const k in c.flat || {}) { const v = c.flat[k]; mods.push([STAT_INFO[k]?.name ?? k, `${v > 0 ? '+' : ''}${v}${STAT_INFO[k]?.pct ? '%' : ''}`, v > 0]); }
      const linesOf = (tw) => ({ tw, d: wrapC(ctx, c.desc ?? '', tw, 12).slice(0, 2), p: wrapC(ctx, c.perk ?? '', tw, 12).slice(0, 3) });   // 줄바꿈 캐시 (매 프레임 measureText 0)
      const y1 = yR + LF + 5;   // 설명 첫 줄
      const lastOf = (L, dMax) => { const yy = y1 + Math.min(L.d.length, dMax) * LF + LF + 9 + L.p.length * LF; return mods.length ? yy + (mods.length - 1) * LF : yy - LF - 6; };
      let L = linesOf(tw0), dMax = [2, 1, 0].find((d) => lastOf(L, d) <= r.y + r.h - 16);
      const CR = { x: tx - 2, y: yR + 6, w: r.x + r.w - tx, h: r.y + r.h - 4 - (yR + 6) };
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
      let yy = y1 - off;
      for (const l of L.d.slice(0, dMax)) { text(ctx, l, tx, yy, { size: 12, color: '#b8a890' }); yy += LF; }
      yy += 4;
      text(ctx, '특성', tx, yy, { size: 11, weight: 800, color: '#ffe7a0' }); yy += LF - 1;
      for (const l of L.p) { text(ctx, l, tx, yy, { size: 12, color: '#efe4cf' }); yy += LF; }
      yy += 6;
      for (const [nm, v, up] of mods) {
        text(ctx, nm, tx, yy, { size: 12, color: '#c8b8a0' });
        text(ctx, v, tx + tw, yy, { size: 12, weight: 800, family: FONT.num, color: up ? COLORS.good : COLORS.bad, align: 'right' });
        yy += LF;
      }
      if (scroll) {
        clipEnd(ctx, CR, null);
        if (off > 1) fillGradRect(ctx, vGrad(ctx, 14, sel ? FADE_SEL : FADE_OFF), CR.x, CR.y, CR.w, 14);
        if (off < mx - 1) fillGradRect(ctx, vGrad(ctx, 18, CARD_FADE), CR.x, CR.y + CR.h - 18, CR.w, 18);
        scrollbar(ctx, r.x + r.w - 7, CR.y + 2, CR.h - 4, { y: off, max: mx }, CR.h);
        moreBelow(ctx, CR.x + CR.w / 2, CR.y + CR.h, off, mx);
      }
    });
    this.csc.setMax(cscMax);
    const c = opts[this.sel];
    this.actRect = this.tz('act', { x: body.x + body.w / 2 - 170, y: body.y + body.h - 50, w: 340, h: 48 });
    const ok = c && canChangeClass(hero, c.id).ok;
    uiButton(ctx, this.actRect, c ? (ok ? `${josa(`「${c.name}」`, '으로', '로')} 전직` : `레벨 ${c.reqLevel} 필요`) : '—', { selected: ok, size: 17 });
  }

  /**
   * 「초월의 길」 (classes_t3 §8.1): 왼쪽 32% 지금 직업 (이름 · 영문 · 단계 · Lv + 미리보기), 오른쪽 68% 2×2 칸
   * (cw = (W − 12) / 2, ch = (h − 12) / 2), 아래 줄: [기본 최상급으로](초월 중일 때) + 실행 단추.
   * 휴대폰·큰 글자에서도 칸이 버티도록 위의 '현재 직업' 판은 왼쪽 열로 접었다 (그만큼 칸이 높다)
   */
  drawAscPath(ctx, body) {
    const hero = this.hero, st = this.state;
    const F = Math.max(11, textFloor());
    const BH = 48, gh = body.h - BH - 10;
    const LW = Math.round(body.w * 0.32), RX = body.x + LW + 12, RW = body.w - LW - 12;
    // ── 왼쪽: 지금 직업 ──
    uiPanel(ctx, body.x, body.y, LW, gh, { corner: false });
    const lh = Math.max(18, Math.ceil(F * 1.35));
    let ly = body.y + 10 + lh * 0.8;
    text(ctx, '현재 직업', body.x + 14, ly, { size: 12, color: '#9d8f80', weight: 700 });
    text(ctx, `Lv.${hero.level}`, body.x + LW - 12, ly + 2, { size: 18, weight: 900, family: FONT.num, color: '#fff', align: 'right' });
    ly += Math.max(26, Math.ceil(Math.max(20, F) * 1.3));
    const asc = ASCENSIONS[hero.asc] && ASCENSIONS[hero.asc].parents.includes(hero.classId) ? ASCENSIONS[hero.asc] : null;
    text(ctx, classNameOf(hero), body.x + 14, ly, { size: 20, weight: 800, family: FONT.title, color: asc ? PATH_COL[asc.kind] : '#f3d690', maxWidth: LW - 26 });
    ly += lh;
    text(ctx, `${classEngOf(hero)} · ${tierLabelOf(hero)}`, body.x + 14, ly, { size: 11, weight: 800, family: FONT.num, color: '#8a7a64', maxWidth: LW - 26 });
    const look = composeLook(st, hero);
    const pTop = ly + 8, pBot = body.y + gh - 14;
    const sc = clamp((pBot - pTop) / 110, 1.1, 2.2);
    ctx.save(); ctx.beginPath(); ctx.rect(body.x + 2, pTop, LW - 4, pBot - pTop + 10); ctx.clip();
    this.preview(ctx, 'cur:' + heroKey(hero), look, body.x + LW / 2, pBot, sc, asc?.ult?.accent ?? look.aura?.color);
    ctx.restore();
    // ── 오른쪽: 2×2 칸 ──
    const cards = this.pathCards();
    const cw = (RW - 12) / 2, ch = (gh - 12) / 2;
    const key = cards.map((c) => (c ? c.kind + (c.T?.id ?? c.A?.id) : '-')).join() + '|' + this.cardSel;
    if (key !== this.cscKey) { this.cscKey = key; this.csc.reset(); this.autoS = { t: 0, dir: 1 }; }
    this.cardRects = [];
    let cscMax = 0;
    cards.forEach((c, i) => {
      const r = this.tz('card:' + i, { x: RX + (i % 2) * (cw + 12), y: body.y + Math.floor(i / 2) * (ch + 12), w: cw, h: ch });
      this.cardRects.push(r);
      const mx = this.drawPathCard(ctx, c, r, i, F);
      if (i === this.cardSel) cscMax = mx;
    });
    this.csc.setMax(cscMax);
    if (this.fresh && !this.fresh.burst && !this.fresh.at) {   // 새로 열린 칸의 자리만 적어 둔다 (터뜨리기는 updateBody — 그리기 중 FX 금지)
      this.fresh.at = [];
      cards.forEach((c, i) => { const r = this.cardRects[i]; if (c?.kind === 'asc' && this.fresh.ids.has(c.A.id) && r) this.fresh.at.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, color: PATH_COL[c.A.kind] }); });
    }
    // ── 아래 줄: [기본 최상급으로] · 실행 단추 ──
    const by = body.y + body.h - BH - 2;
    const sc0 = cards[this.cardSel], info = this.cardInfo(sc0);
    let ax = RX, aw = RW;
    if (hero.asc) {
      const bw = Math.min(200, Math.round(RW * 0.4));
      this.baseRect = this.tz('base', { x: RX, y: by, w: bw, h: BH });
      uiButton(ctx, this.baseRect, '기본 최상급으로', { selected: this.sel === 4, size: 14 });
      ax = RX + bw + 10; aw = RW - bw - 10;
    }
    this.actRect = this.tz('act', { x: ax + Math.max(0, (aw - 340) / 2), y: by, w: Math.min(340, aw), h: BH });
    uiButton(ctx, this.actRect, info.act, { selected: info.ok && this.sel !== 4, disabled: !info.ok, size: 17 });
  }
  /** 「초월의 길」 칸 하나. 반환: 고른 칸이면 본문 스크롤 최대값 */
  drawPathCard(ctx, c, r, i, F) {
    const sel = i === this.sel, picked = i === this.cardSel;
    const info = this.cardInfo(c);
    const kind = c?.kind === 'trial' ? 'trial' : c?.A?.kind ?? 't3';
    const col = PATH_COL[kind];
    const fresh = this.fresh && c?.kind === 'asc' && this.fresh.ids.has(c.A.id) && this.fresh.t < 4;
    // 바탕 + 테두리 (지금 길 = 빛깔 테두리, 도전/초월 가능 = 초록, 고른 칸 = 금)
    fillGradRect(ctx, vGrad(ctx, r.h, sel ? CARD_SEL : CARD_OFF), r.x, r.y, r.w, r.h);
    if (info.state === 'ready') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.45, '#60ff90', 0.08 + 0.05 * Math.sin(this.t * 4)); ctx.restore(); }
    if (info.state === 'cur' || fresh) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.5, col, fresh ? 0.25 + 0.15 * Math.sin(this.t * 6) : 0.12); ctx.restore(); }
    ctx.strokeStyle = sel ? COLORS.gold : info.state === 'cur' ? col : info.state === 'ready' ? '#6ad08a' : picked ? 'rgba(232,200,114,0.55)' : 'rgba(110,85,48,0.6)';
    ctx.lineWidth = sel ? 2.5 : info.state === 'cur' || info.state === 'ready' ? 1.6 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (sel) { ctx.save(); ctx.shadowColor = 'rgba(232,200,114,0.5)'; ctx.shadowBlur = 14; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore(); }
    if (!c) return 0;
    // 줄 높이 (글자 하한에서): 머리(알약) · 제목 · 본문 줄 · 상태 줄
    const pad = 9, headH = Math.max(18, Math.ceil(F + 7)), titleS = Math.max(16, F), titleH = Math.ceil(titleS * 1.3) + 4;
    const bodyS = Math.max(12, F), LH = Math.ceil(bodyS * 1.45), footH = Math.max(16, Math.ceil(F * 1.35));
    const x0 = r.x + pad, w0 = r.w - pad * 2;
    // 머리: 시련 Ⅰ/Ⅱ 또는 초월·비전 알약 + 오른쪽 상태 표식
    const head = c.kind === 'trial' ? (c.T.n === 1 ? '시련 Ⅰ' : '시련 Ⅱ') : KIND_LABEL[c.A.kind];
    pill(ctx, head, x0, r.y + pad - 1, { color: col, size: 11, h: headH, bg: kind === 't3' ? 'rgba(78,52,8,0.92)' : 'rgba(46,20,78,0.92)' });
    const mark = info.state === 'done' ? '✓' : info.state === 'cur' ? '★' : '';
    if (mark) text(ctx, mark, r.x + r.w - pad, r.y + pad + headH * 0.78, { size: 15, weight: 900, color: info.state === 'cur' ? col : '#9fe8a0', align: 'right' });
    else if (info.state === 'locked') glyph(ctx, 'lock', r.x + r.w - pad - 6, r.y + pad + headH / 2, 11, '#8a7a6a', 1.3);
    // 제목
    const title = c.kind === 'trial' ? (c.known ? c.T.name.split(' · ').slice(1).join(' · ') || c.T.name : '???') : (c.known ? c.A.name : '???');
    const ty = r.y + pad + headH + titleH - 6;
    text(ctx, title, x0, ty, { size: titleS, weight: 800, family: FONT.title, color: c.known ? (sel ? '#fff4d8' : '#f3d690') : '#8a7a70', maxWidth: w0 });
    // 본문: 시련 = 설명 + 보스·권장 레벨, 초월 = 특성 (고른 칸만 스크롤 · 나머지는 들어가는 만큼 + '…')
    let lines = [];
    if (c.known) {
      if (c.kind === 'trial') {
        // 보스 줄도 줄바꿈 (좁은 칸·큰 글자에서 '권장 Lv N' 이 칸 밖으로 잘리지 않게) · 폭은 스크롤 막대 자리를 뺀다 (초월 칸과 같다)
        lines = [...wrapC(ctx, c.T.desc ?? '', w0 - 8, 12).map((s) => [s, '#b8a890']), ...wrapC(ctx, `보스: ${BOSSES[c.T.boss]?.name ?? '???'} · 권장 Lv ${c.T.recLv}`, w0 - 8, 12).map((s) => [s, '#8a7a64'])];
      } else lines = wrapC(ctx, c.A.perk ?? '', w0 - 8, 12, 600).map((s) => [s, '#efe4cf']);
    }
    const B = { x: r.x + 3, y: ty + 6, w: r.w - 6, h: r.y + r.h - pad - footH - 2 - (ty + 6) };
    let mx = 0;
    if (B.h > 4 && lines.length) {
      const need = lines.length * LH + 4;
      const scroll = picked && need > B.h;
      if (scroll) B.h = Math.max(LH + 2, Math.floor((B.h - 2) / LH) * LH + 2);   // 온전한 줄만 보이게 (스크롤하면 반 줄씩 걸친다)
      mx = scroll ? Math.ceil(need - B.h) : 0;
      const off = scroll ? Math.min(this.csc.y, mx) : 0;
      if (scroll) { this.cscRect = B; this.cscLH = LH; }
      clipBegin(ctx, B);
      const fitN = scroll ? lines.length : Math.max(0, Math.floor((B.h - 2) / LH));
      for (let k = 0; k < Math.min(lines.length, fitN); k++) {
        let s = lines[k][0];
        if (!scroll && k === fitN - 1 && lines.length > fitN) s = s.replace(/.{0,1}$/, '…');
        text(ctx, s, x0, B.y + (k + 1) * LH - Math.round(LH * 0.28) - off, { size: 12, weight: c.kind === 'asc' ? 600 : 500, color: lines[k][1] });
      }
      clipEnd(ctx, B, null);
      if (scroll) {
        const fh = Math.min(12, Math.round(B.h * 0.2));   // 한두 줄짜리 칸에서는 흐림 띠가 글자를 덮지 않게 얇게
        if (off > 1) fillGradRect(ctx, vGrad(ctx, fh, sel ? FADE_SEL : FADE_OFF), B.x, B.y, B.w, fh);
        if (off < mx - 1) fillGradRect(ctx, vGrad(ctx, fh, CARD_FADE), B.x, B.y + B.h - fh, B.w, fh);
        scrollbar(ctx, r.x + r.w - 6, B.y + 1, B.h - 2, { y: off, max: mx }, B.h);
      }
    }
    // 상태 줄 (잠김 이유 · 도전 가능 · 통과 ✓ 기록 · 초월 가능 · 현재)
    text(ctx, info.line, x0, r.y + r.h - pad - 1, { size: 12, weight: 700, color: info.color, maxWidth: w0 });
    return mx;
  }

  drawBless(ctx, body) {
    const o = this.blessOptions();
    this.optRects = [];
    const lw = Math.min(body.w, 470);
    // 줄 간격: 4줄(2부 「안쪽 방」)이 본문에 들어가게 (낮은 화면에서는 76 → 줄인다)
    const rowH = Math.max(56, Math.min(76, Math.floor((body.h - 8) / o.length) - 8)), step = rowH + 8;
    o.forEach((b, i) => {
      const r = this.tz('opt:' + i, { x: body.x, y: body.y + i * step, w: lw, h: rowH });
      this.optRects.push(r);
      const sel = i === this.sel;
      rowBg(ctx, r, sel);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, r.x + 40, r.y + r.h / 2, 40, '#fff2b0', sel ? 0.4 : 0.15); ctx.restore();
      if (b.id === 'pray') drawCandle(ctx, r.x + 40, r.y + r.h / 2 + 22 * rowH / 76, this.t, 1.3 * Math.min(1, rowH / 76));
      else drawIcon(ctx, b.icon, r.x + 40, r.y + r.h / 2, Math.min(46, rowH - 22));
      const ty = r.y + r.h / 2 - 6, dy = r.y + r.h / 2 + Math.max(18, Math.ceil(textFloor() * 1.35));
      text(ctx, b.title, r.x + 78, ty, { size: 17, weight: 800, family: FONT.title, color: sel ? '#fff4d8' : '#f3d690' });
      text(ctx, b.desc, r.x + 78, dy, { size: 12, color: '#b8a890', maxWidth: lw - 170 });
      if (b.price) { drawIcon(ctx, 'coin', r.x + r.w - 20, r.y + r.h / 2, 18); text(ctx, fmt(b.price), r.x + r.w - 34, r.y + r.h / 2 + 6, { size: 17, weight: 900, family: FONT.num, color: this.state.gold >= b.price ? '#ffd84a' : COLORS.bad, align: 'right' }); }
      else if (!b.talk) text(ctx, '무료', r.x + r.w - 16, r.y + r.h / 2 + 6, { size: 15, weight: 800, color: '#8ae0a0', align: 'right' });
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
      ['직업', `${classNameOf(hero)}  ·  Lv.${hero.level}`],
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
    const B = C.boomAt, col = C.color;
    ctx.save();
    ctx.fillStyle = `rgba(4,3,10,${Math.min(0.95, t * (C.short ? 4 : 2))})`; ctx.fillRect(0, 0, vw, vh);
    // 빛기둥
    const k = clamp(t / B, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    const pw = 60 + k * 80 + (t > B ? Math.max(0, 1 - (t - B)) * 200 : 0);
    const pg = ctx.createLinearGradient(cx - pw, 0, cx + pw, 0);
    pg.addColorStop(0, rgba(col, 0)); pg.addColorStop(0.5, rgba(col, 0.25 + k * 0.35)); pg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = pg; ctx.fillRect(cx - pw, 0, pw * 2, by + 20);
    glow(ctx, cx, by - 70, 160 + k * 60, col, 0.3 + k * 0.4);
    // 마법진
    ctx.save(); ctx.translate(cx, by); ctx.scale(1, 0.28); ctx.rotate(t * 0.8);
    ctx.strokeStyle = rgba(col, 0.4 + k * 0.5); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 130, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 130, Math.sin(a) * 130); ctx.lineTo(Math.cos(a + 2.1) * 130, Math.sin(a + 2.1) * 130); ctx.stroke(); }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    // 영웅 (전 → 후): 전직은 부모 직업, 초월은 바꾸기 전의 길 (stats.lookForAsc)
    const hero = this.hero;
    const look = composeLook(this.state, hero);
    const oldLook = C.kind === 'asc' ? lookForAsc(this.state, hero, C.prevId ?? null) : composeLook(this.state, { ...hero, classId: C.cls.parent ?? hero.classId });
    const useNew = t > B;
    const A = C.kind === 'asc' ? C.A : null;
    this.preview(ctx, useNew ? 'cere_new' : 'cere_old', useNew ? look : oldLook, cx, by, vh < 500 ? 1.8 : 2.2, useNew ? A?.ult?.accent ?? look.aura?.color : null);
    if (!useNew) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, by - 90, 110, col === '#fff2b0' ? '#fff8e0' : col, k * 0.8); ctx.restore(); }
    if (useNew) {
      const e = ease.outBack(Math.min(1, (t - B) * (C.short ? 6 : 3)));
      const title = C.kind === 'class' ? '전직 완료' : A ? (A.kind === 'hidden' ? '비전 각성' : '초월 완료') : TIER_NAME[2];
      const name = C.kind === 'class' ? C.cls.name : A ? A.name : CLASSES[hero.classId]?.name ?? '';
      const eng = C.kind === 'class' ? C.cls.eng : A ? A.eng : CLASSES[hero.classId]?.eng;
      ctx.save(); ctx.translate(cx, vh * 0.17); ctx.scale(e, e);
      text(ctx, title, 0, 0, { size: 22, weight: 800, family: FONT.title, color: '#fff4d8', align: 'center', ow: 4 });
      text(ctx, name, 0, 44, { size: 42, weight: 900, family: FONT.title, color: A ? A.ult?.accent ?? '#ffe070' : '#ffe070', align: 'center', ow: 6, outline: '#3a2400' });
      text(ctx, `${eng ?? ''}`, 0, 68, { size: 13, weight: 800, family: FONT.num, color: '#c8b890', align: 'center' });
      ctx.restore();
      const perk = C.kind === 'class' ? C.cls.perk : A?.perk;
      const F = Math.max(13, textFloor()), LH = Math.ceil(F * 1.4);
      const extra = [];
      if (C.kind === 'class') extra.push(['스킬 포인트 +3', '#8ae0ff']);
      else {
        if (C.first) extra.push(['스킬 포인트 +3', '#8ae0ff']);
        const sk = A?.skill ? SkillData.SKILLS?.[A.skill] : null;
        if (sk) extra.push([`비전 기술: ${sk.name}`, PATH_COL.hidden]);
      }
      // 특성은 길다(초월) → 두세 줄로 접어 아래에서 위로 쌓는다
      const pl = perk ? wrapC(ctx, `특성 · ${perk}`, Math.min(vw - 80, 760), C.kind === 'class' ? 15 : 13, 700).slice(0, 3) : [];
      let yy = vh - 36 - (extra.length - 1) * LH;
      const yTop = yy - 8 - pl.length * LH;
      pl.forEach((l, i) => text(ctx, l, cx, yTop + (i + 1) * LH - 4, { size: C.kind === 'class' ? 15 : 13, weight: 700, color: '#ffe7a0', align: 'center', ow: 3 }));
      for (const [s, c] of extra) { text(ctx, s, cx, yy, { size: 13, weight: 800, color: c, align: 'center', ow: 3 }); yy += LH; }
      if (!C.autoEnd && t > C.doneAt && Math.floor(t * 2.5) % 2 === 0) {
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
