// 대화 장면 (오버레이): 초상화 + 타자기 효과 + 선택지 + 명령 — owner: PLAT-DIALOG · 애니메 흉상 배치(REF A)·표정·다시 보기/자동 진행: DIALOGUE-UI
// push('dialogue', { script: id } | { npc: npcId } | { lines: [...] }, onEnd?)
// 스크립트 형식은 data/story.js 상단 주석 참고. 줄의 name/portrait 는 화자 이름·초상화를 덮어쓴다.
//  - uiScale 장면 (platform §6.2): 대화창·선택지를 game.uiW × game.uiH 로 배치 (최소 720×400)
//  - 선택지·오른쪽 위 버튼(다시 보기 · 자동 진행 · 넘기기)은 ≥ 44 CSS px (platform §6.3), 탭 영역은 ui.taps 에 등록
//  - 키보드·패드: 대화창 위에 지금 기기의 글리프 안내 (prompts.drawHints) + 버튼마다 글리프 딱지 (다시 보기 = 보조 기능 A/Y,
//    자동 진행 = 보조 기능 2 C/LT, 넘기기 = 일시정지 Esc/START — Enter 는 menu+confirm 이라 넘기기가 아니라 다음)
//  - 명령 {cmd:'recruit', id} (world2 §2.4): flags['recruit_'+id] = true + game.companions?.recruit?.(id). 건너뛰기도 실행한다
//  - 초상화 (data/portrait_meta.js · render/portrait.js):
//      · 투명 애니메 흉상: 대화창 앞에, 창의 왼쪽 위(side:'right' 화자는 오른쪽 위)에 걸쳐 크게 (높이 0.62·화면, 아래는 창 바닥에서 잘림).
//        가장자리를 지우지 않는다 (머리카락을 먹지 않게)
//      · 예전 불투명 그림: 같은 자리에 얼굴 중심으로 자른 액자 카드 (고딕 테두리)
//      · 이름은 글 위(초상화 옆 글 칸 왼쪽)에 가는 금색 밑줄과 함께, 글 칸은 초상화를 비켜 선다. 이벤트 CG 가 떠 있으면 초상화 생략
//      · 화자가 바뀌면 옆에서 스며드는 등장 (표정만 바뀌면 다시 들어오지 않는다)
//  - 표정: 줄의 face:'angry'|'shock' ('neutral' 은 자동 규칙도 끔) · portrait:'<키>__angry' · 자동 규칙은 '?!' → shock, '!!' → angry 뿐
//    (그 표정 파일이 portrait_meta 표에 있을 때만, 없으면 기본 표정)
//  - 글자 크기: 설정 textSize(normal 19 · large 21 · xlarge 23 UI px), 예전 전체 폭 창에서 쓰던 크기 아래로 줄이지 않는다 —
//    초상화 옆 좁은 칸에 4줄이 넘으면 창이 위로 최대 2줄 늘어난다
//  - 다시 보기: 최근 30줄(선택한 선택지 포함, 이번 실행 동안 대화 장면끼리 공유)을 스크롤 창으로. ↑↓/스틱·끌기, 취소·닫기로 닫음
//  - 자동 진행: 글이 다 나오면 길이에 비례한 시간(1.6–6초) 뒤 다음 줄 (선택지에서는 멈춤). settings.dialogueAuto 에 기억
//    (save.js 는 모르는 설정 키를 그대로 보존한다 — 스키마 변경 없음)
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, wrap, panel, FONT, COLORS, ListMenu, button, taps, fontEpoch } from '../core/ui.js';
import { drawHints, drawGlyph, glyphWidth } from '../core/prompts.js';
import { SCRIPTS, resolveNpcScript } from '../data/story.js';
import { CHARACTERS } from '../data/characters.js';
import { NPCS } from '../data/npcs.js';
import { BOSSES } from '../data/bosses.js';
import * as CMP from '../data/companions.js';
import { grantItem, ownsItem } from '../game/inventory.js';
import { bus } from '../core/events.js';
import { saves } from '../core/save.js';
import { clamp, ease } from '../core/math.js';
import { linePortrait, preloadKeys, baseKeyOf, legacyCrop, cachedGrad } from '../render/portrait.js';

/** 건너뛰기(skipAll) 때 실행하지 않는 연출 전용 명령 */
const QUIET_CMDS = new Set(['sfx', 'shake', 'flash']);
const TYPE_SPEED = 42;       // 초당 글자 수
const BOX_H = 150, BOX_LINES = 4;   // 예전 창 높이(하한) · 기본 줄 수 (줄 간격 = 기본 글자 × 1.52 → 19 px 에서 29)
const MAX_GROW = 2;          // 초상화 옆 좁은 칸에서 창이 늘어날 수 있는 줄 수
/** 설정 글자 크기 → 대사 기본 크기 (UI px). 줄일 때 하한은 기본 − 4 (보통 15) */
const TEXT_BASE = { normal: 19, large: 21, xlarge: 23 };
const AUTO_KEY = 'dialogueAuto';
const GOLD = '#e8c872';

// ── 다시 보기 기록 (이번 실행 동안 대화 장면끼리 공유, 최근 LOG_MAX 줄) ──
const LOG_MAX = 30;
const LOG = [];
function logPush(e) { LOG.push(e); if (LOG.length > LOG_MAX) LOG.splice(0, LOG.length - LOG_MAX); }
/** 다시 보기 기록 사본 (QA) — [{ name, text, narr } | { choice: true, text }] */
export function dialogueLog() { return LOG.map((e) => ({ ...e })); }
/** 자동 진행: 글이 다 나온 뒤 다음 줄까지 기다리는 시간 (초) */
export function autoDelay(n) { return clamp(1.1 + (n || 0) * 0.055, 1.6, 6); }

/** 화자 id → {name, portrait, hero?}. 'hero' = 지금 영웅, 모르는 id 는 그 글자를 이름으로 쓴다 */
export function speakerInfo(who, state) {
  if (!who || who === 'narrator') return { name: '', portrait: null };
  if (who === 'hero') who = state?.charId ?? 'kael';
  if (CHARACTERS[who]) return { name: CHARACTERS[who].name, portrait: CHARACTERS[who].portrait, hero: true };
  if (NPCS[who]) return { name: NPCS[who].name, portrait: NPCS[who].portrait };
  if (BOSSES[who]) return { name: BOSSES[who].name, portrait: BOSSES[who].portrait };
  const cd = CMP.companionDef?.(who); // 2부 동료 (mt_ / gd_)
  if (cd) return { name: cd.name ?? who, portrait: cd.portrait ?? null };
  return { name: who, portrait: null };
}

/** 이 장면 좌표 1 px 이 몇 CSS px 인가 (uiScale 이면 uiK 포함) */
function cssPer(sc) {
  const g = sc.game;
  return Math.max(0.2, (g.cssScale || 1) * (sc.uiScale ? g.uiK || 1 : 1));
}
/** 탭 대상 최소 높이 (44 CSS px + 여유 2) → 이 장면 좌표 */
function tapH(sc, base = 44) {
  return Math.max(base, Math.ceil(46 / cssPer(sc)));
}

export class DialogueScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }
  enter({ script, npc, lines, onEnd, world } = {}) {
    this.world = world ?? this.game.world;
    if (this.world) this.world.cutscene = true;
    this.onEnd = onEnd;
    let L = lines;
    if (!L && npc) L = SCRIPTS[resolveNpcScript(npc, this.game.state, this.world?.stage?.id)] ?? [{ who: npc, text: '……' }];
    if (!L && script) L = SCRIPTS[script] ?? [{ who: 'narrator', text: `(대사 ${script} 없음)` }];
    this.lines = Array.isArray(L) ? L : [];
    this.i = -1; this.shown = 0; this.menu = null; this.cur = null; this.full = '';
    this.gave = false;   // 이번 재생에서 give 가 실제로 건넸는가 — 조건 { if: { gave: true } } (front/story.js 와 같다)
    this.cg = null; this.cgT = 0;
    this.sp = null; this.pKey = null; this.pT = 0; this.lay = null; this._pReady = null;
    this.auto = !!this.game.settings?.[AUTO_KEY]; this.autoT = 0;
    this.log = null;     // 다시 보기 창 { scroll, drag, wasDrag, lay }
    this.labels = {};
    // { label } 만 있는 줄이 이동 목표. { if, cmd:'goto', label } (ifFlag/ifChar) 은 조건부 이동 명령이다
    this.lines.forEach((l, k) => { if (l && l.label && !l.cmd) this.labels[l.label] = k; });
    this.preloadArt();
    this.next();
  }
  exit() { if (this.world) this.world.cutscene = false; }
  get state() { return this.game.state; }
  // 토스트(획득·합류·컨트롤러 알림)는 대화창 요소(선택지 · 안내 줄 · 이름) 바로 위에서 위로 쌓는다 (UI 좌표).
  // uiScale 장면은 game.js 의 기본 자리(가운데 y 92)를 쓰는데, 낮은 화면에서는 그 자리가 첫 선택지를 가린다
  get toastX() { return this.layout().W / 2; }
  get toastUp() { return true; }
  get toastY() {
    const Lo = this.layout();
    let top = Lo.by - 22; // 창 위 안내 줄 위
    if (this.menu && this.cur?.choice && this.shown >= this.full.length) {
      top = Math.min(top, Lo.by - (input.touchMode ? 16 : 38) - this.cur.choice.length * (Lo.choiceH + 8));
    } else if (!this.menu) top = Math.min(top, Lo.by - 34);
    return Math.max(30, top - 14); // 토스트 상자는 기준선 -20 … +8
  }
  /** 대사에 나오는 초상화(+ 그 줄이 고르는 표정)·CG 를 미리 받아 둔다 (첫 등장 때 비어 보이지 않게) */
  preloadArt() {
    const keys = new Set();
    for (const l of this.lines) {
      if (!l) continue;
      if (l.cmd === 'cg' && l.id) keys.add('cg/' + String(l.id).replace(/^cg\//, ''));
      if (l.cmd) continue;
      const p = l.portrait ?? speakerInfo(l.who, this.state).portrait;
      if (p) for (const k of preloadKeys(l, this.resolveText(l.text ?? ''), p)) keys.add(k);
    }
    if (keys.size) { try { assets.preload?.([...keys]); } catch (e) { /* 받기 실패는 그릴 때 절차적 대체 */ } }
  }
  resolveText(t) {
    if (typeof t === 'string') return this.fill(t);
    if (t && typeof t === 'object') return this.fill(t[this.state?.charId] ?? t.default ?? Object.values(t)[0]);
    return '';
  }
  fill(s) { return String(s ?? '').replaceAll('{hero}', CHARACTERS[this.state?.charId]?.name ?? '헌터'); }
  next() {
    while (true) {
      this.i++;
      if (this.i >= this.lines.length) { this.finish(); return; }
      const l = this.lines[this.i];
      if (!l) continue;
      if (l.label && !l.cmd) continue;
      if (l.if && !this.check(l.if)) continue;
      if (l.cmd) { this.runCmd(l); continue; }
      if (l.goto && !l.text) { this.i = (this.labels[l.goto] ?? this.lines.length) - 1; continue; }
      this.show(l);
      return;
    }
  }
  /** 대사 한 줄을 화면에 올린다 (화자·초상화·줄바꿈 준비) */
  show(l) {
    this.cur = l;
    this.full = this.resolveText(l.text ?? '');
    this.shown = 0; this.autoT = 0;
    this.lay = null;
    this.menu = l.choice ? new ListMenu(l.choice.length) : null;
    const sp = { ...speakerInfo(l.who, this.state) };
    if (l.name) sp.name = this.fill(l.name);
    if (l.portrait) sp.portrait = l.portrait;
    sp.side = l.side ?? (sp.hero ? 'left' : 'right');
    sp.base = sp.portrait ? baseKeyOf(sp.portrait) : null;   // 표정 파일('__angry')도 같은 화자 → 다시 스며들지 않게
    this.sp = sp;
    const key = sp.base ? `${sp.base}|${sp.side}` : null;
    if (key !== this.pKey) { this.pKey = key; this.pT = 0; }
    logPush({ name: sp.name || '', text: this.full, narr: l.who === 'narrator' || !sp.name });
  }
  check(cond) {
    const f = this.state?.progress?.flags ?? {};
    if (typeof cond === 'string') return cond.startsWith('!') ? !f[cond.slice(1)] : !!f[cond];
    if (cond?.char) return this.state?.charId === cond.char;
    if (cond?.gave) return this.gave;   // 앞의 give 가 하나라도 건넸을 때만
    return true;
  }
  runCmd(l) {
    const st = this.state;
    switch (l.cmd) {
      case 'give': if (st && !(l.once && ownsItem(st, l.item))) { this.gave = true; const r = grantItem(st, l.item, l.qty ?? 1); if (!l.silent) { this.game.toast(`획득: ${l.name ?? l.item} ×${l.qty ?? 1}${r.queued ? ' (가방이 가득 차 보관함에 맡겼다)' : ''}`, '#e8c872'); audio.sfx('item'); } } break;   // once: 이미 들고 있으면 건너뜀 · silent: 토스트·소리 없이 (대본이 알린다 — ex_s23.md §3)
      case 'gold': if (st) { st.gold = (st.gold ?? 0) + (l.amount ?? 0); this.game.toast(`${l.amount} G 획득`, '#ffd84a'); audio.sfx('coin'); } break;
      case 'flag': if (st?.progress) (st.progress.flags ??= {})[l.key] = l.value ?? true; break;
      case 'quest': bus.emit('questOffer', { questId: l.id }); this.game.quests?.accept?.(l.id); break;
      case 'unlockChar': {
        const m = this.game.meta;
        if (m && !m.unlockedChars.includes(l.id)) { m.unlockedChars.push(l.id); saves.saveMeta(m); this.game.toast(`${CHARACTERS[l.id]?.name ?? l.id} 합류! (캐릭터 해금)`, '#ffe070'); audio.sfx('levelup'); }
        break;
      }
      case 'recruit': // world2 §2.4 — 플래그가 합류의 원본. 동료 시스템(game.companions)이 없으면 플래그만 남고, 불러올 때 합류한다
        if (st?.progress && l.id) {
          (st.progress.flags ??= {})['recruit_' + l.id] = true;
          try { this.game.companions?.recruit?.(l.id); } catch (e) { console.warn('[dialogue] recruit', l.id, e); }
        }
        break;
      case 'shake': this.world?.camera?.shake?.(l.power ?? 8, l.time ?? 0.4); this.game.flash(l.color ?? '#fff', 0.4); break;
      case 'flash': this.game.flash(l.color ?? '#fff', l.a ?? 0.7, l.decay ?? 3); break;
      case 'music': audio.music(l.id); break;
      case 'sfx': audio.sfx(l.id); break;
      case 'goto': this.i = (this.labels[l.label] ?? this.lines.length) - 1; break;
      case 'relic': if (st?.progress && l.id) { const r = Array.isArray(st.progress.relics) ? st.progress.relics : (st.progress.relics = []); if (!r.includes(l.id)) r.push(l.id); } break;
      case 'cg': this.cg = l.id ? 'cg/' + String(l.id).replace(/^cg\//, '') : null; this.cgT = 0; break;
      // 'bg' · 'wait' · 'title' 은 스토리 장면(front/story.js) 전용 연출 — 대화 오버레이에서는 무시
    }
  }
  finish() {
    this.game.pop();
    this.onEnd?.();
  }
  update(dt) {
    this.world?.camera?.tickShake?.(dt); // 월드가 멈춘 동안에도 {cmd:'shake'} 흔들림을 바로 재생
    if (this.cg) this.cgT += dt;
    this.pT += dt;
    if (!this.cur) return;
    if (this.log) { this.updateLog(dt); return; }
    const hit = taps.hit(this);
    // 오른쪽 위 버튼: 다시 보기 (보조 기능 A / 패드 Y) · 자동 진행 (보조 기능 2 C / 패드 LT)
    if (hit === 'log' || input.pressed('alt')) { this.openLog(); return; }
    if (hit === 'auto' || input.pressed('alt2')) { this.toggleAuto(); return; }
    // 건너뛰기: 터치 버튼(오른쪽 위 '넘기기') · Esc/패드 START (Enter 는 menu+confirm → 넘기기만). 선택지에서는 안 된다
    if (!this.menu && (hit === 'skip' || (input.pressed('menu') && !input.pressed('confirm')))) { audio.sfx('menu_cancel'); this.skipAll(); return; }
    if (this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + TYPE_SPEED * dt);
      if (Math.floor(this.shown) !== before && Math.floor(this.shown) % 3 === 0) audio.sfx('type', { vol: 0.15 });
      if (input.pressed('confirm') || input.pressed('attack') || input.pressed('jump') || input.pointer.tapped) this.shown = this.full.length;
      return;
    }
    if (this.menu) {
      const r = this.menu.update(dt);
      if (this.menu.moved) audio.sfx('menu_move');
      if (r === 'confirm') {
        const c = this.cur.choice[this.menu.index];
        audio.sfx('menu_ok');
        if (c) logPush({ choice: true, text: this.resolveText(c.text) });
        if (c?.set && this.state?.progress) Object.assign((this.state.progress.flags ??= {}), c.set);
        if (c?.goto) this.i = (this.labels[c.goto] ?? this.lines.length) - 1;
        this.next();
      }
      return;
    }
    if (input.pressed('confirm') || input.pressed('attack') || input.pointer.tapped || input.pressed('jump')) { audio.sfx('menu_move', { vol: 0.4 }); this.next(); return; }
    // 자동 진행: 글이 다 나오고 길이에 비례한 시간이 지나면 다음 줄
    if (this.auto) {
      this.autoT += dt;
      if (this.autoT >= autoDelay(this.full.length)) { this.autoT = 0; this.next(); }
    }
  }
  /** 대사 건너뛰기: 남은 명령(합류·플래그·지급·CG)은 실행하고, 선택지에서는 멈춘다 */
  skipAll() {
    while (++this.i < this.lines.length) {
      const l = this.lines[this.i];
      if (!l) continue;
      if ((l.label && !l.cmd) || (l.if && !this.check(l.if))) continue;
      if (l.cmd) { if (!QUIET_CMDS.has(l.cmd)) this.runCmd(l); continue; }
      if (l.goto && !l.text) { this.i = (this.labels[l.goto] ?? this.lines.length) - 1; continue; }
      if (l.choice) { this.i--; this.next(); return; }
    }
    this.finish();
  }
  toggleAuto() {
    this.auto = !this.auto; this.autoT = 0;
    audio.sfx(this.auto ? 'menu_ok' : 'menu_cancel');
    const s = this.game.settings;
    if (s && typeof s === 'object') { s[AUTO_KEY] = this.auto; try { saves.saveSettings(s); } catch { /* 저장 실패해도 이번 실행 동안은 켜진 채 */ } }
  }

  // ───────────────────────── 배치 ─────────────────────────
  /** 글과 무관한 배치 (UI px): 화면 · 창 가로 · 초상화 자리 · 글 칸 */
  geom() {
    const g = this.game;
    const W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const base = TEXT_BASE[g.settings?.textSize] ?? TEXT_BASE.normal;
    const lh = Math.round(base * 1.52);   // 19 → 29 (예전 LINE_H)
    const bx = W < 820 ? 40 : 60, bw = W - bx * 2;
    const sp = this.sp;
    // 초상화 자리: 화자에게 초상화가 있고, 받기에 실패하지 않았고, 이벤트 CG 가 떠 있지 않을 때 (받는 중에도 자리는 잡아 글이 뛰지 않게)
    const slot = !!sp?.base && !assets.failed(sp.base) && !(this.cg && assets.has(this.cg));
    const side = sp?.side === 'right' ? 'right' : 'left';
    const bustH = Math.round(clamp(H * 0.62, 220, 380)), slotW = Math.round(bustH * 0.75);
    const slotX = side === 'left' ? bx - 18 : bx + bw + 18 - slotW;
    const textL = slot && side === 'left' ? bx + slotW - 10 : bx + 34;
    const textR = slot && side === 'right' ? bx + bw - slotW + 10 : bx + bw - 34;
    return { W, H, bx, bw, base, lh, slot, side, bustH, slotW, slotX, textL, textR };
  }
  /** 배치 (UI px) — 창 높이는 이 줄의 줄 수(긴 줄은 최대 2줄 더)에 맞춘다 */
  layout() {
    const G = this.geom();
    const grow = this.lay?.grow ?? 0;
    const bh = Math.max(BOX_H, 82 + (G.base - 19) + (BOX_LINES - 1 + grow) * G.lh);
    const by = G.H - bh - 18;
    return { ...G, bh, by, btnH: tapH(this, 40), choiceH: tapH(this, 44) };
  }
  /**
   * 대사 줄바꿈 (전체 문장 기준으로 한 번 → 타자 효과 중에 단어가 줄을 넘나들지 않는다).
   * 글자 크기 = 예전 전체 폭 창(legacyW)에서 4줄에 들어가던 크기 (그 아래로 줄이지 않는다) → 실제 칸(maxW)에서 4줄이 넘으면
   * 창을 최대 MAX_GROW 줄 늘리고, 그래도 넘칠 때만 하한(기본 − 4)까지 줄인다
   */
  layText(ctx, maxW, legacyW, base) {
    const F = this.game.textFloor || 0;
    const key = `${this.full}|${Math.round(maxW)}|${Math.round(legacyW)}|${base}|${F}|${fontEpoch}`;
    if (this.lay?.key === key) return this.lay;
    const minS = Math.max(15, base - 4);
    let size = base, lines = wrap(ctx, this.full, legacyW, size, 500);
    while (lines.length > BOX_LINES && size > minS) { size -= 1; lines = wrap(ctx, this.full, legacyW, size, 500); }
    if (Math.round(maxW) !== Math.round(legacyW)) lines = wrap(ctx, this.full, maxW, size, 500);
    while (lines.length > BOX_LINES + MAX_GROW && size > minS) { size -= 1; lines = wrap(ctx, this.full, maxW, size, 500); }
    lines = lines.slice(0, BOX_LINES + MAX_GROW);
    // 각 줄이 원문 몇 번째 글자에서 시작하는지 (줄바꿈에서 지운 공백·\n 을 건너뛰어 타자 효과가 정확히 이어진다)
    const starts = [];
    let pos = 0;
    for (const s of lines) { const at = s ? this.full.indexOf(s, pos) : -1; const st = at >= 0 ? at : pos; starts.push(st); pos = st + s.length; }
    const eff = Math.max(size, F);
    this.lay = { key, size, lines, starts, grow: Math.max(0, lines.length - BOX_LINES), lh: eff >= base ? Math.round(base * 1.52) : Math.round(eff * 1.5) };
    return this.lay;
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    if (!this.cur) return;
    const l = this.cur, sp = this.sp ?? speakerInfo(l.who, this.state);
    const G0 = this.geom();
    const lay = this.layText(ctx, G0.textR - G0.textL, G0.bw - 70, G0.base);
    const Lo = this.layout(), { W, H, bx, bw, bh, by } = Lo;
    const live = !this.log;   // 다시 보기 창이 열려 있으면 아래 요소는 그리기만 (탭 영역 없음)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
    // 이벤트 CG (스크립트 {cmd:'cg', id:'cg_xxx'} 로 표시, id:null 로 해제)
    const cgImg = this.cg ? assets.get(this.cg) : null;
    if (cgImg) {
      const a = Math.min(1, this.cgT * 2.5);
      const s = Math.max(W / cgImg.width, H / cgImg.height) * (1.04 + Math.min(this.cgT, 30) * 0.004);
      ctx.save(); ctx.globalAlpha = a;
      ctx.drawImage(cgImg, (W - cgImg.width * s) / 2, (H - cgImg.height * s) / 2, cgImg.width * s, cgImg.height * s);
      ctx.fillStyle = cachedGrad(ctx, `dlgCg|${H}`, (c) => { const g = c.createLinearGradient(0, H * 0.45, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)'); return g; });
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // 대화창 (어두운 판 · 진홍 테두리 · 붉은 광)
    panel(ctx, bx, by, bw, bh, { glow: 'rgba(180,20,40,0.45)', fill: 'rgba(24,8,16,0.97)', edge: '#7a1a2a' });
    if (live && !this.menu) taps.add('box', { x: bx, y: by, w: bw, h: bh }, { owner: this, kind: 'primary', src: 'dialogue.box' }); // 대화창(과 화면 어디든) 탭 = 다음
    // 초상화 (창 앞): 흉상은 창 왼쪽/오른쪽 위에 걸쳐, 예전 그림은 액자 카드. 화자가 바뀌면 옆에서 스며든다
    if (Lo.slot) this.drawPortrait(ctx, Lo, l);
    // 이름 + 금색 밑줄 (글 칸 위)
    const named = !!sp.name;
    if (named) {
      const ns = Math.max(18, Lo.base - 1), uw = Lo.textR - Lo.textL;
      text(ctx, sp.name, Lo.textL, by + 32, { size: ns, weight: 700, family: FONT.title, color: '#f3d690', maxWidth: uw });
      ctx.fillStyle = cachedGrad(ctx, `dlgUL|${Lo.textL}|${uw}`, (c) => {
        const g = c.createLinearGradient(Lo.textL, 0, Lo.textL + uw, 0);
        g.addColorStop(0, 'rgba(232,200,114,0.85)'); g.addColorStop(0.55, 'rgba(232,200,114,0.35)'); g.addColorStop(1, 'rgba(232,200,114,0)');
        return g;
      });
      ctx.fillRect(Lo.textL, by + 41, uw, 1.5);
    }
    const shown = Math.floor(this.shown);
    const col = l.who === 'narrator' ? '#c8c0e0' : COLORS.text;
    const y0 = by + (named ? 66 + (Lo.base - 19) : 46);
    for (let k = 0; k < lay.lines.length; k++) {
      const s = lay.lines[k], n = shown - lay.starts[k];
      if (n <= 0) break;
      text(ctx, n >= s.length ? s : s.slice(0, n), Lo.textL, y0 + k * lay.lh, { size: lay.size, color: col, ow: 2 });
    }
    const done = this.shown >= this.full.length;
    if (done && !this.menu && Math.floor(this.t * 3) % 2 === 0) text(ctx, '▼', Lo.textR - 4, by + bh - 16, { size: 14, color: COLORS.gold, align: 'right' });
    // 키보드·패드 안내 (초상화가 없는 쪽 창 위)
    if (!input.touchMode) {
      const items = !this.menu ? [['confirm', '다음']] : done ? [['dpadV', '선택'], ['confirm', '결정']] : null;
      if (items) {
        const right = !(Lo.slot && Lo.side === 'right');
        this.hintBand(ctx, right ? bx + bw : bx, by, right);
        drawHints(ctx, items, right ? bx + bw - 10 : bx + 10, by - 12, { align: right ? 'right' : 'left', size: 13, color: '#c8b8a0' });
      }
    }
    // 오른쪽 위: 다시 보기 · 자동 진행 · 넘기기
    this.drawControls(ctx, Lo, live, done);
    if (this.menu && done) {
      const ch = this.cur.choice;
      const w = Math.min(440, W - 120), h = Lo.choiceH;
      ch.forEach((c, k) => {
        const r = { x: W / 2 - w / 2, y: by - (input.touchMode ? 16 : 38) - (ch.length - k) * (h + 8), w, h }; // 키보드·패드: 아래 안내 줄 자리를 비운다
        if (live) {
          this.menu.hit(k, r);
          taps.add('c' + k, r, { owner: this, kind: 'primary', src: 'dialogue.choice' });
        }
        button(ctx, r, this.resolveText(c.text), { selected: this.menu.index === k, size: 16 });
      });
    }
    if (this.log) this.renderLog(ctx, Lo);
  }
  /** 화자 초상화: 투명 흉상(창 앞, 창 바닥에서 잘림) 또는 예전 그림 액자 카드 */
  drawPortrait(ctx, Lo, l) {
    const P = linePortrait(l, this.full, this.sp.base);
    const img = P.img;
    if (!img || !(img.naturalWidth || img.width)) return;
    // 초상화가 늦게 도착했으면(느린 망) 그때부터 스며들게 — 이미 다 들어온 모습으로 갑자기 튀어나오지 않도록
    if (this._pReady !== this.pKey) { this._pReady = this.pKey; if (this.pT > 0.1) this.pT = 0; }
    const left = Lo.side === 'left';
    const a = ease.outCubic(clamp(this.pT / 0.22, 0, 1));
    const off = (1 - a) * 26 * (left ? -1 : 1);
    const { bx, bw, by, bh } = Lo;
    ctx.save();
    ctx.globalAlpha = a;
    if (P.bust) {
      const h = Lo.bustH, w = h * (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
      const bottom = by + bh - 2;
      const x = (left ? Lo.slotX : Lo.slotX + Lo.slotW - w) + off;
      ctx.beginPath(); ctx.rect(0, 0, Lo.W, bottom); ctx.clip();   // 창 바닥 테두리 안에서 잘린다 (REF A)
      ctx.drawImage(img, x, bottom - h, w, h);
    } else {
      const cw = Lo.slotW - 40, ch = Math.round(cw * 1.22);
      const r = { x: (left ? bx + 16 : bx + bw - 16 - cw) + off, y: by + bh - 14 - ch, w: cw, h: ch };
      const c = legacyCrop(img, P.base, cw / ch);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(r.x + 5, r.y + 7, r.w, r.h);   // 그림자
      if (c) ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, r.x, r.y, r.w, r.h);
      // 아래쪽을 창 색으로 살짝 가라앉힌다 (카드 아래 끝이 창 안에 놓인다)
      ctx.fillStyle = cachedGrad(ctx, `dlgCard|${Math.round(r.y)}|${ch}`, (cx) => { const g = cx.createLinearGradient(0, r.y + ch * 0.62, 0, r.y + ch); g.addColorStop(0, 'rgba(14,4,10,0)'); g.addColorStop(1, 'rgba(14,4,10,0.55)'); return g; });
      ctx.fillRect(r.x, r.y + ch * 0.62, r.w, ch * 0.38 + 1);
      ctx.strokeStyle = '#7a1a2a'; ctx.lineWidth = 3; ctx.strokeRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3);
      ctx.strokeStyle = 'rgba(232,200,114,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(r.x + 5.5, r.y + 5.5, r.w - 11, r.h - 11);
      ctx.fillStyle = GOLD;
      for (const [px, py] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore();
      }
    }
    ctx.restore();
  }
  /** 오른쪽 위 버튼 줄 (REF A): 다시 보기 · 자동 진행 · 넘기기 — 동그란 아이콘 + 이름, 키보드·패드는 글리프 딱지 */
  drawControls(ctx, Lo, live, done) {
    const touch = input.touchMode;
    const th = tapH(this, 44), lab = touch ? 18 : 15, d = touch ? 40 : 34;
    const cw = touch ? 94 : 82, gap = 4, ch = Math.max(th, d + lab + 14);
    const items = [
      { id: 'log', label: '다시 보기', act: 'alt' },
      { id: 'auto', label: '자동 진행', act: 'alt2', on: this.auto },
      { id: 'skip', label: '넘기기', act: 'menu', off: !!this.menu },
    ];
    const over = live && !touch ? taps.over(this) : null;
    let x = Lo.W - 10 - items.length * cw - (items.length - 1) * gap;
    const y = 6;
    // 버튼 줄 뒤 옅은 어둠 (아래 장면의 HUD 글자와 겹쳐도 읽히게)
    const gw = items.length * cw + (items.length - 1) * gap + 12;
    ctx.fillStyle = cachedGrad(ctx, `dlgCtl|${x}|${gw}`, (c) => { const g = c.createLinearGradient(x - 6, 0, x - 6 + gw, 0); g.addColorStop(0, 'rgba(6,2,8,0)'); g.addColorStop(0.12, 'rgba(6,2,8,0.62)'); g.addColorStop(1, 'rgba(6,2,8,0.7)'); return g; });
    ctx.fillRect(x - 6, 0, gw + 6, y + ch + 4);
    for (const it of items) {
      const r = { x, y, w: cw, h: ch };
      const cx = x + cw / 2, cy = y + 3 + d / 2;
      ctx.save();
      if (it.off) ctx.globalAlpha *= 0.35;
      const hot = over === it.id;
      ctx.fillStyle = it.on ? 'rgba(70,14,26,0.92)' : 'rgba(12,4,14,0.82)';
      ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = it.on || hot ? 2 : 1.5;
      ctx.strokeStyle = it.on || hot ? GOLD : 'rgba(200,160,90,0.55)';
      ctx.stroke();
      const ic = it.on ? '#ffe7a0' : '#efe4cf';
      this.drawIcon(ctx, it.id, cx, cy, d * 0.26, ic);
      // 자동 진행 남은 시간 (테두리를 따라 도는 금색 호)
      if (it.id === 'auto' && it.on && done && !this.menu && !this.log) {
        const k = clamp(this.autoT / autoDelay(this.full.length), 0, 1);
        ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, d / 2 + 2.5, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
      }
      text(ctx, it.label, cx, y + 3 + d + lab + 1, { size: lab, weight: 700, align: 'center', color: it.on ? '#ffe7a0' : '#e6dccb', ow: 3 });
      if (!touch) {
        const gh = 16, gw = glyphWidth(it.act, gh);
        if (gw > 0) drawGlyph(ctx, it.act, Math.min(x + cw - gw, cx + d / 2 - 6), y, gh);
      }
      ctx.restore();
      if (live && !it.off) taps.add(it.id, r, { owner: this, kind: 'primary', src: 'dialogue.' + it.id });
      x += cw + gap;
    }
  }
  /** 버튼 아이콘 (선 그림): 다시 보기 = 말풍선, 자동 진행 = 원 화살표 + 재생, 넘기기 = ▶▶ */
  drawIcon(ctx, id, cx, cy, s, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1.5, s * 0.22); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (id === 'log') {
      const w = s * 2.3, h = s * 1.6, x0 = cx - w / 2, y0 = cy - h / 2 - s * 0.2;
      ctx.beginPath();
      ctx.moveTo(x0 + s * 0.3, y0); ctx.lineTo(x0 + w - s * 0.3, y0); ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + s * 0.3);
      ctx.lineTo(x0 + w, y0 + h - s * 0.3); ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - s * 0.3, y0 + h);
      ctx.lineTo(x0 + s * 0.9, y0 + h); ctx.lineTo(x0 + s * 0.35, y0 + h + s * 0.6); ctx.lineTo(x0 + s * 0.45, y0 + h);
      ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h - s * 0.3); ctx.lineTo(x0, y0 + s * 0.3); ctx.quadraticCurveTo(x0, y0, x0 + s * 0.3, y0);
      ctx.stroke();
      for (let i = 0; i < 2; i++) { const yy = y0 + h * (0.36 + i * 0.32); ctx.beginPath(); ctx.moveTo(x0 + s * 0.45, yy); ctx.lineTo(x0 + w - s * (i ? 0.9 : 0.45), yy); ctx.stroke(); }
    } else if (id === 'auto') {
      ctx.beginPath(); ctx.arc(cx, cy, s * 1.15, -Math.PI * 0.3, Math.PI * 1.45); ctx.stroke();
      const ax = cx + Math.cos(-Math.PI * 0.3) * s * 1.15, ay = cy + Math.sin(-Math.PI * 0.3) * s * 1.15;
      ctx.beginPath(); ctx.moveTo(ax + s * 0.45, ay - s * 0.05); ctx.lineTo(ax - s * 0.12, ay - s * 0.5); ctx.lineTo(ax - s * 0.2, ay + s * 0.25); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - s * 0.32, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy); ctx.lineTo(cx - s * 0.32, cy + s * 0.5); ctx.closePath(); ctx.fill();
    } else {
      for (const ox of [-s * 0.75, s * 0.15]) { ctx.beginPath(); ctx.moveTo(cx + ox, cy - s * 0.7); ctx.lineTo(cx + ox + s * 0.8, cy); ctx.lineTo(cx + ox, cy + s * 0.7); ctx.closePath(); ctx.fill(); }
      ctx.fillRect(cx + s * 0.95, cy - s * 0.7, s * 0.22, s * 1.4);
    }
  }
  /** 안내 글리프 뒤의 옅은 어둠 띠 (초상화 위에서도 읽히게). right=false 면 창 왼쪽 끝에서 안쪽으로. 그라데이션은 위치별로 한 번만 만든다 */
  hintBand(ctx, edge, by, right = true) {
    const x0 = right ? edge - 340 : edge, key = `${x0}|${by}|${right}`;
    if (this._bandKey !== key) {
      const g = ctx.createLinearGradient(x0, 0, x0 + 340, 0);
      const s = right ? [[0, 0], [0.35, 0.5], [1, 0.62]] : [[0, 0.62], [0.65, 0.5], [1, 0]];
      for (const [o, a] of s) g.addColorStop(o, `rgba(6,2,8,${a})`);
      this._band = g; this._bandKey = key;
    }
    ctx.fillStyle = this._band;
    ctx.fillRect(x0, by - 34, 340, 30);
  }

  // ───────────────────────── 다시 보기 ─────────────────────────
  openLog() {
    audio.sfx('menu_ok');
    this.log = { scroll: Infinity, drag: null, wasDrag: false, lay: null, max: 0 };
  }
  closeLog() { audio.sfx('menu_cancel'); this.log = null; }
  updateLog(dt) {
    const L = this.log, p = input.pointer;
    // 끌기 (터치·마우스): 6 px 넘게 움직이면 스크롤, 놓을 때의 탭은 무시
    L.wasDrag = false;
    if (p.down) {
      if (!L.drag) L.drag = { y0: p.y, s0: Number.isFinite(L.scroll) ? L.scroll : L.max, moved: false };
      else {
        const dy = p.y - L.drag.y0;
        if (Math.abs(dy) > 6) L.drag.moved = true;
        if (L.drag.moved) L.scroll = L.drag.s0 - dy;
      }
    } else if (L.drag) { L.wasDrag = L.drag.moved; L.drag = null; }
    const hit = L.wasDrag ? null : taps.hit(this);
    if (hit === 'logClose' || hit === 'logShade' || input.pressed('cancel') || input.pressed('alt') || input.pressed('menu') || (input.pressed('confirm') && !p.tapped)) { this.closeLog(); return; }
    const v = (input.down('down') ? 1 : 0) - (input.down('up') ? 1 : 0);
    if (v) { if (!Number.isFinite(L.scroll)) L.scroll = L.max; L.scroll += v * 520 * dt; }
    if (input.pressed('nextTab')) L.scroll = (Number.isFinite(L.scroll) ? L.scroll : L.max) + 240;
    if (input.pressed('prevTab')) L.scroll = (Number.isFinite(L.scroll) ? L.scroll : L.max) - 240;
  }
  renderLog(ctx, Lo) {
    const L = this.log, { W, H } = Lo;
    ctx.fillStyle = 'rgba(4,1,6,0.86)'; ctx.fillRect(0, 0, W, H);
    taps.add('logShade', { x: 0, y: 0, w: W, h: H }, { owner: this, kind: 'primary', src: 'dialogue.logShade' });   // 창 밖 탭 = 닫기
    const btnH = tapH(this, 44);
    const pw = Math.min(800, W - 48), px = Math.round((W - pw) / 2), py = 14 + btnH + 8, ph = H - py - 14;
    panel(ctx, px, py, pw, ph, { glow: 'rgba(180,20,40,0.4)', fill: 'rgba(20,6,14,0.98)', edge: '#7a1a2a' });
    taps.add('logPanel', { x: px, y: py, w: pw, h: ph }, { owner: this, kind: 'primary', src: 'dialogue.logPanel' });
    text(ctx, '다시 보기', px + 8, 14 + btnH / 2 + 8, { size: 22, weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    const cr = { x: px + pw - 124, y: 14, w: 124, h: btnH };
    button(ctx, cr, '닫기 ✕', { size: 17 });
    taps.add('logClose', cr, { owner: this, kind: 'primary', src: 'dialogue.logClose' });
    if (!input.touchMode) drawHints(ctx, [['dpadV', '넘겨 보기'], ['cancel', '닫기']], cr.x - 14, cr.y + cr.h / 2 + 5, { align: 'right', size: 13, color: '#c8b8a0' });
    // 내용 배치 (기록·폭·글꼴이 같으면 다시 재지 않는다)
    const base = Lo.base - 1, ns = Math.max(16, base - 2), lh = Math.round(base * 1.5);
    const iw = pw - 56, ix = px + 28;
    const key = `${LOG.length}|${LOG[LOG.length - 1]?.text ?? ''}|${iw}|${base}|${this.game.textFloor || 0}|${fontEpoch}`;
    if (L.lay?.key !== key) {
      const rows = [];
      let yy = 0;
      for (const e of LOG) {
        if (e.choice) { const ls = wrap(ctx, '▶ ' + e.text, iw - 16, base, 600); rows.push({ kind: 'choice', y: yy, lines: ls }); yy += ls.length * lh + 14; continue; }
        if (e.name) { rows.push({ kind: 'name', y: yy, s: e.name }); yy += ns + 8; }
        const ls = wrap(ctx, e.text, iw, base, 500);
        rows.push({ kind: 'text', y: yy, lines: ls, narr: e.narr }); yy += ls.length * lh + 16;
      }
      L.lay = { key, rows, h: yy };
    }
    const viewH = ph - 36;
    L.max = Math.max(0, L.lay.h - viewH);
    L.scroll = clamp(Number.isFinite(L.scroll) ? L.scroll : L.max, 0, L.max);
    ctx.save();
    ctx.beginPath(); ctx.rect(px + 8, py + 10, pw - 16, ph - 20); ctx.clip();
    const top = py + 18 - L.scroll;
    if (!LOG.length) text(ctx, '아직 지나간 대사가 없습니다.', px + pw / 2, py + ph / 2, { size: base, align: 'center', color: COLORS.dim });
    for (const r of L.lay.rows) {
      const ry = top + r.y;
      if (ry > py + ph || ry + 200 < py) continue;
      if (r.kind === 'name') text(ctx, r.s, ix, ry + ns, { size: ns, weight: 700, family: FONT.title, color: '#f3d690', ow: 2 });
      else r.lines.forEach((s, i) => {
        const yb = ry + base + i * lh;
        if (yb < py - lh || yb > py + ph + lh) return;
        text(ctx, s, r.kind === 'choice' ? ix + 16 : ix, yb, { size: base, weight: r.kind === 'choice' ? 600 : 500, color: r.kind === 'choice' ? '#e8c872' : r.narr ? '#c8c0e0' : COLORS.text, ow: 2 });
      });
    }
    ctx.restore();
    // 스크롤 막대
    if (L.max > 0) {
      const tr = { x: px + pw - 12, y: py + 14, h: ph - 28 };
      const kh = Math.max(28, tr.h * viewH / L.lay.h), ky = tr.y + (tr.h - kh) * (L.scroll / L.max);
      ctx.fillStyle = 'rgba(232,200,114,0.14)'; ctx.fillRect(tr.x, tr.y, 4, tr.h);
      ctx.fillStyle = 'rgba(232,200,114,0.7)'; ctx.fillRect(tr.x, ky, 4, kh);
    }
  }
}
