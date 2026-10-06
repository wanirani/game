// 대화 장면 (오버레이): 초상화 + 타자기 효과 + 선택지 + 명령 — owner: PLAT-DIALOG
// push('dialogue', { script: id } | { npc: npcId } | { lines: [...] }, onEnd?)
// 스크립트 형식은 data/story.js 상단 주석 참고. 줄의 name/portrait 는 화자 이름·초상화를 덮어쓴다.
//  - uiScale 장면 (platform §6.2): 대화창·선택지를 game.uiW × game.uiH 로 배치 (최소 720×400)
//  - 선택지·건너뛰기 버튼은 ≥ 44 CSS px (platform §6.3), 탭 영역은 ui.taps 에 등록
//  - 키보드·패드: 대화창 위에 지금 기기의 글리프 안내 (prompts.drawHints) / 터치: '건너뛰기' 버튼
//  - 명령 {cmd:'recruit', id} (world2 §2.4): flags['recruit_'+id] = true + game.companions?.recruit?.(id). 건너뛰기도 실행한다
//  - 초상화: 가장자리·위아래를 부드럽게 지운 비트맵(이미지별 캐시) + 화자가 바뀔 때 옆에서 스며드는 등장
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, wrap, panel, font, FONT, COLORS, ListMenu, button, taps, fontEpoch } from '../core/ui.js';
import { drawHints } from '../core/prompts.js';
import { SCRIPTS, resolveNpcScript } from '../data/story.js';
import { CHARACTERS } from '../data/characters.js';
import { NPCS } from '../data/npcs.js';
import { BOSSES } from '../data/bosses.js';
import * as CMP from '../data/companions.js';
import { grantItem, ownsItem } from '../game/inventory.js';
import { bus } from '../core/events.js';
import { saves } from '../core/save.js';
import { clamp, ease } from '../core/math.js';

/** 건너뛰기(skipAll) 때 실행하지 않는 연출 전용 명령 */
const QUIET_CMDS = new Set(['sfx', 'shake', 'flash']);
const TYPE_SPEED = 42;       // 초당 글자 수
const BOX_H = 150, BOX_LINES = 4, LINE_H = 29;

// 초상화 가장자리를 부드럽게 (배경/CG·대화창 위에서 사각 경계가 보이지 않도록) — 이미지별 캐시
//  좌우 12% · 위 7% · 아래 28% 를 투명으로 지운다 (아래쪽은 대화창 뒤로 스며들게)
//  초상화 한 장 ≈ 3 MB 캔버스라 최근 SOFT_MAX 장만 남긴다 (한 판 내내 쌓이면 휴대폰 캔버스 예산 20 MB 를 넘는다)
const SOFT_MAX = 4;
const _soft = new Map();
function softPortrait(img) {
  let c = _soft.get(img);
  if (c) { _soft.delete(img); _soft.set(img, c); return c; } // 최근 사용 순서 유지 (LRU)
  while (_soft.size >= SOFT_MAX) {
    const [k, old] = _soft.entries().next().value;
    _soft.delete(k); old.width = old.height = 0; // 캔버스 메모리를 바로 돌려준다
  }
  c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const hx = g.createLinearGradient(0, 0, c.width, 0);
  hx.addColorStop(0, 'rgba(0,0,0,0)'); hx.addColorStop(0.12, 'rgba(0,0,0,1)'); hx.addColorStop(0.88, 'rgba(0,0,0,1)'); hx.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hx; g.fillRect(0, 0, c.width, c.height);
  const hy = g.createLinearGradient(0, 0, 0, c.height);
  hy.addColorStop(0, 'rgba(0,0,0,0)'); hy.addColorStop(0.07, 'rgba(0,0,0,1)'); hy.addColorStop(0.72, 'rgba(0,0,0,1)'); hy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hy; g.fillRect(0, 0, c.width, c.height);
  _soft.set(img, c);
  return c;
}

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
    this.cg = null; this.cgT = 0;
    this.sp = null; this.pKey = null; this.pT = 0; this.lay = null; this._pReady = null;
    this.labels = {};
    // { label } 만 있는 줄이 이동 목표. { if, cmd:'goto', label } (ifFlag/ifChar) 은 조건부 이동 명령이다
    this.lines.forEach((l, k) => { if (l && l.label && !l.cmd) this.labels[l.label] = k; });
    this.preloadArt();
    this.next();
  }
  exit() { if (this.world) this.world.cutscene = false; }
  get state() { return this.game.state; }
  // 토스트(획득·합류·컨트롤러 알림)는 대화창 요소(선택지 · 건너뛰기 버튼/안내 줄 · 이름패) 바로 위에서 위로 쌓는다 (UI 좌표).
  // uiScale 장면은 game.js 의 기본 자리(가운데 y 92)를 쓰는데, 낮은 화면에서는 그 자리가 첫 선택지를 가린다
  get toastX() { return this.layout().W / 2; }
  get toastUp() { return true; }
  get toastY() {
    const Lo = this.layout();
    let top = Lo.by - 22; // 이름패 위
    if (this.menu && this.cur?.choice && this.shown >= this.full.length) {
      top = Math.min(top, Lo.by - (input.touchMode ? 16 : 38) - this.cur.choice.length * (Lo.choiceH + 8));
    } else if (!this.menu) top = Math.min(top, input.touchMode ? Lo.by - 10 - Lo.btnH : Lo.by - 34);
    return Math.max(30, top - 14); // 토스트 상자는 기준선 -20 … +8
  }
  /** 대사에 나오는 초상화·CG 를 미리 받아 둔다 (첫 등장 때 비어 보이지 않게) */
  preloadArt() {
    const keys = new Set();
    for (const l of this.lines) {
      if (!l) continue;
      if (l.cmd === 'cg' && l.id) keys.add('cg/' + String(l.id).replace(/^cg\//, ''));
      if (l.cmd) continue;
      const p = l.portrait ?? speakerInfo(l.who, this.state).portrait;
      if (p) keys.add(p);
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
    this.shown = 0;
    this.lay = null;
    this.menu = l.choice ? new ListMenu(l.choice.length) : null;
    const sp = { ...speakerInfo(l.who, this.state) };
    if (l.name) sp.name = this.fill(l.name);
    if (l.portrait) sp.portrait = l.portrait;
    sp.side = l.side ?? (sp.hero ? 'left' : 'right');
    this.sp = sp;
    const key = sp.portrait ? `${sp.portrait}|${sp.side}` : null;
    if (key !== this.pKey) { this.pKey = key; this.pT = 0; }
  }
  check(cond) {
    const f = this.state?.progress?.flags ?? {};
    if (typeof cond === 'string') return cond.startsWith('!') ? !f[cond.slice(1)] : !!f[cond];
    if (cond?.char) return this.state?.charId === cond.char;
    return true;
  }
  runCmd(l) {
    const st = this.state;
    switch (l.cmd) {
      case 'give': if (st && !(l.once && ownsItem(st, l.item))) { const r = grantItem(st, l.item, l.qty ?? 1); if (!l.silent) { this.game.toast(`획득: ${l.name ?? l.item} ×${l.qty ?? 1}${r.queued ? ' (가방이 가득 차 보관함에 맡겼다)' : ''}`, '#e8c872'); audio.sfx('item'); } } break;   // once: 이미 들고 있으면 건너뜀 · silent: 토스트·소리 없이 (대본이 알린다 — ex_s23.md §3)
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
    // 건너뛰기: 터치 버튼(대화창 오른쪽 위) · Esc/패드 START (Enter 는 menu+confirm → 넘기기만). 선택지에서는 안 된다
    const hit = taps.hit(this);
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
        if (c?.set && this.state?.progress) Object.assign((this.state.progress.flags ??= {}), c.set);
        if (c?.goto) this.i = (this.labels[c.goto] ?? this.lines.length) - 1;
        this.next();
      }
      return;
    }
    if (input.pressed('confirm') || input.pressed('attack') || input.pointer.tapped || input.pressed('jump')) { audio.sfx('menu_move', { vol: 0.4 }); this.next(); }
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

  /** 배치 (UI px) */
  layout() {
    const g = this.game;
    const W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const bx = W < 820 ? 40 : 60, bw = W - bx * 2, bh = BOX_H, by = H - bh - 18;
    return { W, H, bx, bw, bh, by, btnH: tapH(this, 40), choiceH: tapH(this, 44) };
  }
  /** 대사 줄바꿈 (전체 문장 기준으로 한 번 → 타자 효과 중에 단어가 줄을 넘나들지 않는다). 4줄에 안 들어가면 글자를 줄인다 */
  layText(ctx, maxW) {
    const key = `${this.full}|${Math.round(maxW)}|${fontEpoch}`;
    if (this.lay?.key === key) return this.lay;
    let size = 19, lines = wrap(ctx, this.full, maxW, size, 500);
    while (lines.length > BOX_LINES && size > 15) { size -= 1; lines = wrap(ctx, this.full, maxW, size, 500); }
    lines = lines.slice(0, BOX_LINES);
    // 각 줄이 원문 몇 번째 글자에서 시작하는지 (줄바꿈에서 지운 공백·\n 을 건너뛰어 타자 효과가 정확히 이어진다)
    const starts = [];
    let pos = 0;
    for (const s of lines) { const at = s ? this.full.indexOf(s, pos) : -1; const st = at >= 0 ? at : pos; starts.push(st); pos = st + s.length; }
    this.lay = { key, size, lines, starts, lh: size >= 19 ? LINE_H : Math.round(size * 1.5) };
    return this.lay;
  }
  render(ctx) {
    if (!this.cur) return;
    const Lo = this.layout(), { W, H, bx, bw, bh, by } = Lo;
    const l = this.cur, sp = this.sp ?? speakerInfo(l.who, this.state);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, H);
    // 이벤트 CG (스크립트 {cmd:'cg', id:'cg_xxx'} 로 표시, id:null 로 해제)
    const cgImg = this.cg ? assets.get(this.cg) : null;
    if (cgImg) {
      const a = Math.min(1, this.cgT * 2.5);
      const s = Math.max(W / cgImg.width, H / cgImg.height) * (1.04 + Math.min(this.cgT, 30) * 0.004);
      ctx.save(); ctx.globalAlpha = a;
      ctx.drawImage(cgImg, (W - cgImg.width * s) / 2, (H - cgImg.height * s) / 2, cgImg.width * s, cgImg.height * s);
      const gr = ctx.createLinearGradient(0, H * 0.45, 0, H);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // 초상화 (이벤트 CG 가 떠 있으면 CG 속 인물과 겹치지 않도록 생략). 화자가 바뀌면 옆에서 스며든다
    const img = sp.portrait && !cgImg ? assets.get(sp.portrait) : null;
    if (img && img.width > 0) {
      // 초상화가 늦게 도착했으면(느린 망) 그때부터 스며들게 — 이미 다 들어온 모습으로 갑자기 튀어나오지 않도록
      if (this._pReady !== this.pKey) { this._pReady = this.pKey; if (this.pT > 0.1) this.pT = 0; }
      const side = sp.side ?? (sp.hero ? 'left' : 'right');
      const h = H * 0.78, w = h * (img.width / img.height);
      const a = ease.outCubic(clamp(this.pT / 0.22, 0, 1));
      const x = (side === 'left' ? 30 : W - w - 30) + (1 - a) * 26 * (side === 'left' ? -1 : 1);
      ctx.save();
      ctx.globalAlpha = 0.97 * a;
      ctx.drawImage(softPortrait(img), x, H - h - 40, w, h);
      ctx.restore();
    }
    // 대화창
    panel(ctx, bx, by, bw, bh, { glow: 'rgba(180,20,40,0.4)', fill: 'rgba(24,8,16,0.97)' });
    if (!this.menu) taps.add('box', { x: bx, y: by, w: bw, h: bh }, { owner: this, kind: 'primary', src: 'dialogue.box' }); // 대화창(과 화면 어디든) 탭 = 다음
    if (sp.name) {
      ctx.font = font(18, 800, FONT.title);
      const nw = Math.max(140, Math.ceil(ctx.measureText(sp.name).width) + 44);
      panel(ctx, bx + 24, by - 22, Math.min(nw, bw * 0.6), 36, { corner: false });
      text(ctx, sp.name, bx + 44, by + 3, { size: 18, weight: 800, family: FONT.title, color: '#f3d690', maxWidth: bw * 0.6 - 40 });
    }
    const lay = this.layText(ctx, bw - 70);
    const shown = Math.floor(this.shown);
    const col = l.who === 'narrator' ? '#c8c0e0' : COLORS.text;
    for (let k = 0; k < lay.lines.length; k++) {
      const s = lay.lines[k], n = shown - lay.starts[k];
      if (n <= 0) break;
      text(ctx, n >= s.length ? s : s.slice(0, n), bx + 34, by + 46 + k * lay.lh, { size: lay.size, color: col, ow: 2 });
    }
    const done = this.shown >= this.full.length;
    if (done && !this.menu && Math.floor(this.t * 3) % 2 === 0) text(ctx, '▼', bx + bw - 34, by + bh - 16, { size: 14, color: COLORS.gold });
    // 건너뛰기 (터치: 대화창 오른쪽 위 버튼 — 가상 패드의 Ⅱ 는 대화 중 숨겨진다) / 키보드·패드: 글리프 안내
    if (!this.menu) {
      if (input.touchMode) {
        const r = { x: bx + bw - 156, y: by - 10 - Lo.btnH, w: 146, h: Lo.btnH };
        ctx.fillStyle = '#0c0610'; ctx.fillRect(r.x, r.y, r.w, r.h);
        button(ctx, r, '건너뛰기 ▶▶', { size: 15 });
        taps.add('skip', r, { owner: this, kind: 'primary', src: 'dialogue.skip' });
      } else {
        this.hintBand(ctx, bx + bw, by);
        drawHints(ctx, [['confirm', '다음'], ['menu', '건너뛰기']], bx + bw - 10, by - 12, { align: 'right', size: 13, color: '#c8b8a0' });
      }
    }
    if (this.menu && done) {
      const ch = this.cur.choice;
      const w = Math.min(440, W - 120), h = Lo.choiceH;
      ch.forEach((c, k) => {
        const r = { x: W / 2 - w / 2, y: by - (input.touchMode ? 16 : 38) - (ch.length - k) * (h + 8), w, h }; // 키보드·패드: 아래 안내 줄 자리를 비운다
        this.menu.hit(k, r);
        taps.add('c' + k, r, { owner: this, kind: 'primary', src: 'dialogue.choice' });
        button(ctx, r, this.resolveText(c.text), { selected: this.menu.index === k, size: 16 });
      });
      if (!input.touchMode) {
        this.hintBand(ctx, bx + bw, by);
        drawHints(ctx, [['dpadV', '선택'], ['confirm', '결정']], bx + bw - 10, by - 12, { align: 'right', size: 13, color: '#c8b8a0' });
      }
    }
  }
  /** 안내 글리프 뒤의 옅은 어둠 띠 (초상화 위에서도 읽히게). 그라데이션은 위치별로 한 번만 만든다 */
  hintBand(ctx, right, by) {
    const x0 = right - 340, key = `${x0}|${by}`;
    if (this._bandKey !== key) {
      const g = ctx.createLinearGradient(x0, 0, right, 0);
      g.addColorStop(0, 'rgba(6,2,8,0)'); g.addColorStop(0.35, 'rgba(6,2,8,0.5)'); g.addColorStop(1, 'rgba(6,2,8,0.62)');
      this._band = g; this._bandKey = key;
    }
    ctx.fillStyle = this._band;
    ctx.fillRect(x0, by - 34, 340, 30);
  }
}
