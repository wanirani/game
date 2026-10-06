// 명예의 전당(모드별 상위 20) + 아케이드식 이니셜 입력(3글자, ↑↓로 글자 순환)
//  - '기기 / 온라인' 탭 (docs/specs/online.md §4; 위 오른쪽 탭 · Q/E·LB/RB): 온라인은 왼쪽 보드 선택(종류 → 코스/스테이지 · 난이도,
//    오늘의 도전)과 내 순위(로그인 안 했으면 안내 + 로그인 버튼), 오른쪽 상위 50명(순위·별명·기록·헌터/직업; 끌기·휠·오른쪽 스틱·↑↓로 넘김).
//    불러오는 중·오류(다시 시도)·오프라인·이 환경에서 못 씀 상태를 보여 준다. go('highscore', {src:'online', board}) 로 그 보드를 바로 연다
//  - 무한의 탑: 기기 탭 '무한의 탑' 부문(점수 상위 20) + 난이도별 최고 층 줄 (meta.towerBest), 온라인 보드 tower:<diff> (층 · 시간)
// 플랫폼 (platform §6.2 · §6.3 · §4.5, MASTER_PLAN §1.16) — owner: PLAT-FRONT-A
//  - 두 장면 모두 uiScale (game.uiW × game.uiH, 최소 720×400). 줄 높이는 화면 높이에 맞춘다
//  - 부문 탭은 목록 줄(≥ 36 CSS px), 뒤로·▲▼·등록 버튼은 ui.taps (owner = 장면), 안내 줄은 지금 기기의 글리프
//  - 'NEW RECORD!' 는 ui.bloodText (금박 피 글씨)
//  - 이명 (docs/specs/achievements.md §8.3, ACH-UI): 온라인 목록 줄의 별명 뒤에 작은 금색 「이름」 — 고정 목록(core/ach_meta.js ACH_TITLES)
//    id 만 이름으로 옮기고 모르는 id 는 그리지 않는다. 별명 칸 폭 안에서 이명을 먼저 줄이고(…), 그래도 모자라면 이명을 뺀다
//    (별명은 줄이지 않는다). 왼쪽 '공개 별명' 줄 끝에 내 이명
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, font, FONT, ListMenu, taps, bloodText, prewarmText } from '../../core/ui.js';
import * as ACHM from '../../core/ach_meta.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, fmt, TAU } from '../../core/math.js';
import { hudSafe } from '../../render/hud_layout.js';
import { CHARACTERS } from '../../data/characters.js';
import { STAGES } from '../../data/stages.js';
import { getDiff } from '../../data/difficulty.js';
import {
  Ambience, kenBurns, shade, frame, heading, ornament, gbutton, backButton, footer, MODES, modeName,
  recordHighScore, scoreList, fmtClock, follow, bossRushBests, towerBests, linGrad, radGrad, GOLD, BONE, DIM,
} from './common.js';
import { COURSES, visibleCourses, p2Known, exKnown } from './arcade.js';
import * as ENDING from './ending.js';
import { bus } from '../../core/events.js';
import { cloud } from '../../core/cloud.js';
import * as ONLINE from '../../core/online.js';
import { Gesture, Scroller, scrollbar, clipBegin, clipEnd } from '../menu/common.js';
import { spinner } from './cloud_ui.js';
import { CLASSES } from '../../data/classes.js';
import { DIFFICULTIES } from '../../data/difficulty.js';
import { STAGE_ORDER, STAGE_ORDER_P1 } from '../../data/stages.js';

const MEDAL = ['#ffe070', '#d8dce8', '#e0a060'];
const ORD = (i) => `${i + 1}${i === 0 ? 'ST' : i === 1 ? 'ND' : i === 2 ? 'RD' : 'TH'}`;
const own = (o, k) => typeof k === 'string' && !!o && Object.hasOwn(o, k);
/** 이명 id → 이름 (고정 목록 밖이면 null) */
const titleNameOf = (id) => (own(ACHM.ACH_TITLES, id) ? ACHM.ACH_TITLES[id].name : null);
const EPI = new Map();
/** 이명 「이름」 을 room 폭(12 px 굵게)에 맞춘 글 — 줄여도(…, 두 글자 이상) 안 들어가면 null */
function fitEpithet(ctx, name, room) {
  const k = name + '|' + Math.round(room);
  if (EPI.has(k)) return EPI.get(k);
  ctx.font = font(12, 700, FONT.body);
  let out = null;
  if (ctx.measureText(`「${name}」`).width <= room) out = `「${name}」`;
  else {
    for (let n = name.length - 1; n >= 2; n--) {
      const head = name.slice(0, n).replace(/\s+$/, '');   // 낱말 사이 빈칸에서 자르면 빈칸은 뺀다
      if (head.length < 2 || head.length < n) continue;
      const s = `「${head}…」`;
      if (ctx.measureText(s).width <= room) { out = s; break; }
    }
  }
  if (EPI.size > 300) EPI.clear();
  EPI.set(k, out);
  return out;
}

function detail(h) {
  const d = getDiff(h.diff);
  const stg = own(STAGES, h.stageId) ? STAGES[h.stageId] : null;
  switch (h.mode) {
    case 'bossrush': return `${h.bosses ?? '?'}체 격파${h.time ? ' · ' + fmtClock(h.time) : ''}`;
    case 'survival': return `WAVE ${h.wave ?? '?'}`;
    case 'tower': return `${h.floor ?? 0}층 돌파${d ? ' · ' + d.name : ''}`;
    case 'practice': return stg ? `${stg.side ? '외전' : `${stg.chapter}장`} ${stg.name}` : '연습';
    default: return h.stageId === 'ending' ? '엔딩 도달' : stg ? (stg.side ? '외전 클리어' : `${stg.chapter}장 클리어`) : (d?.name ?? '');
  }
}
/** 본 엔딩 수 / 전체 엔딩 수 (ending.js ENDINGS: bad·normal·true + 2부 p2·p2true) */
function endingCount(seen) {
  const E = ENDING.ENDINGS && typeof ENDING.ENDINGS === 'object' ? ENDING.ENDINGS : null;
  const list = Array.isArray(seen) ? [...new Set(seen)] : [];
  if (!E) return { n: list.length, of: Math.max(3, list.length) };
  return { n: list.filter((k) => own(E, k)).length, of: Object.keys(E).length };
}

// ── 온라인 탭 (docs/specs/online.md §4) ──
const OKINDS = [
  { id: 'bossrush', name: '보스 러시' }, { id: 'survival', name: '서바이벌' },
  { id: 'practice', name: '스테이지 연습' }, { id: 'daily', name: '오늘의 도전' },
  { id: 'tower', name: '무한의 탑' },
];
let lastSrc = 'device';   // 이번 실행에서 마지막으로 본 탭
let lastSel = null;       // 온라인 보드 선택 {kind, course, diff, stageId}
/** 보드 id → 선택 (모르면 null) */
function selOf(board) {
  const [k, a, b] = String(board ?? '').split(':');
  if (k === 'bossrush') return { kind: k, course: +a || 0, diff: b };
  if (k === 'survival' || k === 'tower') return { kind: k, diff: a };
  if (k === 'practice') return { kind: k, stageId: a, diff: b };
  if (k === 'daily') return { kind: k };
  return null;
}

export class HighscoreScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter({ mode = 'all', highlight = null, back = 'title', src = null, board = null } = {}) {
    this.back = back; this.highlight = highlight;
    this.tabs = new ListMenu(MODES.length, { cols: MODES.length, index: Math.max(0, MODES.findIndex((m) => m.id === mode)) });
    const q = this.game.tier === 'low' ? 0.5 : 1;
    this.amb = new Ambience({ embers: Math.round(60 * q), motes: Math.round(20 * q), bats: 5, lightning: false, emberColor: '#ffd070' });
    this.tabK = 0;
    this.page = 0;
    if (!this.game.registry.arcade && back === 'arcade') this.back = 'title';
    audio.music(this.game.state && !this.game.state.arcade ? 'hub' : 'title');
    // 온라인 탭
    this.p2 = p2Known(this.game);
    this.ex = exKnown(this.game);   // 외전 코스·외전 스테이지 순위표 (docs/specs/ex_s21.md)
    const cfg = this.game.meta?.arcadeCfg ?? {};
    this.sel = { kind: 'bossrush', course: 0, diff: 'normal', stageId: 's01', ...(lastSel ?? {}), ...(lastSel ? {} : { kind: OKINDS.some((k) => k.id === cfg.kind) ? cfg.kind : 'bossrush', course: cfg.course ?? 0, diff: cfg.diff ?? 'normal', stageId: cfg.stageId ?? 's01' }), ...(selOf(board) ?? {}) };
    this.fixSel();
    this.ofocus = 0; this.ob = { state: 'idle' }; this.oseq = 0;
    this.ges = new Gesture(); this.scroll = new Scroller();
    this.alive = true;
    this.src = src === 'online' || src === 'device' ? src : board ? 'online' : lastSrc;
    this.offs = [bus.on('cloud:login', () => this.alive && this.src === 'online' && this.load(true)), bus.on('cloud:logout', () => this.alive && this.src === 'online' && this.load(true))];
    if (this.src === 'online') this.load();
    try { ONLINE.flushQueue(); } catch { /* 온라인 모듈 교체 중 */ }
  }
  exit() { this.alive = false; for (const f of this.offs ?? []) f?.(); lastSel = { ...this.sel }; }
  onResume() { if (this.src === 'online') this.load(true); }
  list() {
    const id = MODES[this.tabs.index].id;
    const all = [...scoreList(this.game.meta)].sort((a, b) => b.score - a.score); // 손상된 기록은 scoreList 가 걸러 낸다
    return (id === 'all' ? all : all.filter((h) => (h.mode || 'story') === id)).slice(0, 20);
  }
  setSrc(src) {
    if (src === this.src) return;
    this.src = lastSrc = src; this.changedT = this.t;
    audio.sfx('menu_move');
    if (src === 'online') this.load();
  }
  update(dt) {
    const g = this.game;
    this.amb.update(dt, g.uiW || g.viewW, g.uiH || g.viewH);
    this.tabK = follow(this.tabK, this.tabs.index, dt, 14);
    this.ges.update();
    const tap = taps.hit(this);
    if (tap === 'back') { this.leave(); return; }
    if (tap === 'src:device' || tap === 'src:online') { this.setSrc(tap.slice(4)); return; }
    if (input.pressed('prevTab') || input.pressed('nextTab')) { this.setSrc(this.src === 'online' ? 'device' : 'online'); return; }
    if (this.src === 'online') { this.updateOnline(dt, tap); return; }
    const r = this.tabs.update(dt);
    if (this.tabs.moved) { audio.sfx('menu_move'); this.changedT = this.t; }
    if (r === 'cancel' || (r === 'confirm' && !input.pointer.tapped)) this.leave();
  }
  leave() {
    audio.sfx('menu_cancel');
    const g = this.game;
    if (this.back === 'arcade') g.go('arcade', {});
    else if (this.back === 'hub' && g.registry.hub && g.state) g.go('hub', {});
    else g.go('title', { menu: true, index: 3 });
  }

  // ───────────────────────── 온라인 ─────────────────────────
  /** 지금 보드에서 고를 수 있는 값이 아니면 고친다 */
  fixSel() {
    const S = this.sel;
    if (!OKINDS.some((k) => k.id === S.kind)) S.kind = 'bossrush';
    if (!DIFFICULTIES.some((d) => d.id === S.diff)) S.diff = 'normal';
    const cs = visibleCourses(this.p2, this.ex);
    if (!cs.includes(S.course)) S.course = cs[0] ?? 0;
    const st = this.stageList();
    if (!st.includes(S.stageId)) S.stageId = st[0];
  }
  stageList() { return (this.p2 ? STAGE_ORDER : STAGE_ORDER_P1).filter((id) => STAGES[id] && (!STAGES[id].side || this.ex)); }
  board() {
    const S = this.sel;
    if (S.kind === 'daily') return `daily:${ONLINE.kstDay()}`;
    return ONLINE.boardOf({ kind: S.kind, course: S.course, diff: S.diff, stageId: S.stageId });
  }
  /** 왼쪽 선택 줄: { label, value, n, i, set } */
  orows() {
    const S = this.sel, rows = [];
    const ki = Math.max(0, OKINDS.findIndex((k) => k.id === S.kind));
    rows.push({ id: 'kind', label: '종류', value: OKINDS[ki].name, n: OKINDS.length, i: ki, set: (i) => { S.kind = OKINDS[i].id; } });
    if (S.kind === 'bossrush') {
      const cs = visibleCourses(this.p2, this.ex), ci = Math.max(0, cs.indexOf(S.course));
      rows.push({ id: 'course', label: '코스', value: COURSES[cs[ci]]?.short ?? COURSES[cs[ci]]?.name ?? '', n: cs.length, i: ci, set: (i) => { S.course = cs[i]; } });
    }
    if (S.kind === 'practice') {
      const st = this.stageList(), si = Math.max(0, st.indexOf(S.stageId)), sd = STAGES[st[si]];
      rows.push({ id: 'stage', label: '스테이지', value: `${sd.side ? '외전' : `${sd.chapter}장`} ${sd.name}`, n: st.length, i: si, set: (i) => { S.stageId = st[i]; } });
    }
    if (S.kind === 'daily') {
      const d = ONLINE.dailyNow(), sd = d ? STAGES[d.stageId] : null, day = ONLINE.kstDay();
      rows.push({ id: 'date', label: '날짜', value: `오늘 · ${+day.slice(4, 6)}월 ${+day.slice(6, 8)}일`, n: 1, i: 0, info: true, set() {} });
      if (sd) rows.push({ id: 'dstage', label: '스테이지', value: `${sd.side ? '외전' : `${sd.chapter}장`} ${sd.name}`, n: 1, i: 0, info: true, set() {} });
    } else {
      const di = Math.max(0, DIFFICULTIES.findIndex((d) => d.id === S.diff));
      rows.push({ id: 'diff', label: '난이도', value: DIFFICULTIES[di].name, color: DIFFICULTIES[di].color, n: DIFFICULTIES.length, i: di, set: (i) => { S.diff = DIFFICULTIES[i].id; } });
    }
    return rows;
  }
  /** 순위표 받기 (같은 보드는 30초 동안 기억한 것 — online.js) */
  load(force = false) {
    const board = this.board(), seq = ++this.oseq;
    this.ob = { state: 'loading', board };
    this.scroll.reset();
    if (this.sel.kind === 'daily') ONLINE.getDaily().catch(() => null);   // 오늘의 스테이지 이름 (기기에 있으면 요청 없음)
    ONLINE.getBoard(board, { limit: 50, force }).then((r) => {
      if (!this.alive || seq !== this.oseq) return;
      if (r.ok) this.ob = { state: 'ready', board, data: r };
      else this.ob = { state: r.error === 'unavailable' ? 'unavailable' : r.error === 'offline' ? 'offline' : 'error', board, msg: r.message };
    }).catch(() => { if (this.alive && seq === this.oseq) this.ob = { state: 'error', board }; });
  }
  ochange(row, d) {
    const r = this.orows()[row];
    if (!r || r.n <= 1) return;
    r.set((r.i + d + r.n) % r.n);
    this.fixSel();
    audio.sfx('menu_move');
    this.load();
  }
  updateOnline(dt, tap) {
    const rows = this.orows(), n = rows.length;
    const L = this._OL;
    if (L) this.scroll.update(dt, L.list, this.ges);
    if (typeof tap === 'string' && tap.startsWith('hopt:')) { const [, i, d] = tap.split(':'); this.ofocus = +i; this.ochange(+i, +d); return; }
    if (tap === 'retry') { audio.sfx('menu_ok'); this.load(true); return; }
    if (tap === 'login') { audio.sfx('menu_ok'); this.game.push('account', { overlay: true, screen: 'login' }); return; }
    if (input.pressed('cancel')) { this.leave(); return; }
    const rowH = L?.rowH ?? 30;
    if (this.ofocus >= n) {
      // 목록: ↑↓ 한 줄씩 (맨 위에서 ↑ = 선택 줄로)
      if (input.pressed('up')) { if (this.scroll.target <= 0.5) { this.ofocus = this.lastRow(rows); audio.sfx('menu_move'); } else this.scroll.target = Math.max(0, this.scroll.target - rowH); }
      else if (input.pressed('down')) this.scroll.target = Math.min(this.scroll.max, this.scroll.target + rowH);
      else if (input.pressed('confirm') && this.ob.state !== 'ready') this.load(true);
      return;
    }
    if (input.pressed('up')) { const r = this.stepO(rows, -1); if (r !== this.ofocus) { this.ofocus = r; audio.sfx('menu_move'); } }
    else if (input.pressed('down')) { const r = this.stepO(rows, 1); if (r !== this.ofocus) { this.ofocus = r; audio.sfx('menu_move'); } }
    else if (input.pressed('left')) this.ochange(this.ofocus, -1);
    else if (input.pressed('right')) this.ochange(this.ofocus, 1);
    else if (input.pressed('confirm')) { if (this.ob.state !== 'ready' && this.ob.state !== 'loading') this.load(true); else this.ochange(this.ofocus, 1); }
  }
  /** 바꿀 수 있는 줄만 (안내 줄 건너뜀). n = 목록 */
  stepO(rows, d) {
    let i = this.ofocus;
    for (let k = 0; k <= rows.length; k++) {
      i += d;
      if (i < 0) return this.ofocus;
      if (i >= rows.length) return rows.length;
      if (!rows[i].info) return i;
    }
    return this.ofocus;
  }
  lastRow(rows) { for (let i = rows.length - 1; i >= 0; i--) if (!rows[i].info) return i; return 0; }

  /** 배치 (UI 좌표): 제목 · 탭 · 순위 두 열 · 부가 기록 · 안내 줄 */
  layout() {
    const g = this.game, k = g.uiK || 1, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const per = Math.max(0.2, (g.cssScale || 1) * k);
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const compact = H < 500;
    const headY = st + (compact ? 38 : 44), headSize = compact ? 28 : 32;
    const tabH = clamp(Math.ceil(38 / per), 44, 48);
    const ty = compact ? headY + headSize * 0.72 + 30 : st + 96;
    const y0 = ty + tabH + (compact ? 10 : 16);
    // 순위 10줄 + 부가 기록 한 줄(20) + 안내 줄 띠(34)가 화면 높이에 들어가게 (높이 400 UI px 에서도 안내 줄과 겹치지 않는다)
    const rowH = clamp(Math.floor((H - sb - 34 - 20 - y0) / 10), 20, 31);
    const minRow = Math.max(36, Math.ceil(38 / per));
    // 위 오른쪽 '기기 / 온라인' 탭
    const sw = 96, sh = 44, sx = W - sr - 14 - sw * 2 - 4;
    return { W, H, sl, sr, st, sb, per, compact, headY, headSize, tabH, ty, y0, rowH, minRow, extraY: y0 + 10 * rowH + 12, src: { x: sx, y: 12 + st, w: sw, h: sh } };
  }
  render(ctx) {
    const g = this.game, t = g.time;
    const L = this.layout(), W = L.W, H = L.H;
    kenBurns(ctx, assets.get('bg/s11_chapel'), W, H, t, { z0: 1.05, z1: 1.12, period: 60 });
    ctx.fillStyle = 'rgba(8,2,8,0.72)'; ctx.fillRect(0, 0, W, H);
    shade(ctx, W, H, { top: 0.5, bottom: 0.7, vig: 0.85 });
    this.amb.draw(ctx, W, H, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, W / 2, L.headY, 'HALL OF FAME', '명예의 전당', { size: L.headSize, alpha: ap });
    // 기기 / 온라인
    [['device', '기기'], ['online', '온라인']].forEach(([id, name], i) => {
      const r = { x: L.src.x + i * (L.src.w + 4), y: L.src.y, w: L.src.w, h: L.src.h };
      const cur = this.src === id;
      ctx.fillStyle = cur ? 'rgba(140,20,40,0.88)' : 'rgba(20,8,20,0.75)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = cur ? GOLD : 'rgba(200,160,90,0.35)'; ctx.lineWidth = cur ? 2 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      text(ctx, name, r.x + r.w / 2, r.y + r.h / 2 + 6, { size: 16, align: 'center', weight: 800, color: cur ? '#fff4dc' : '#b8a898', ow: 2 });
      taps.add(`src:${id}`, r, { owner: this, kind: 'primary', src: 'highscore.src' });
    });
    if (this.src === 'online') this.renderOnline(ctx, L, t);
    else this.renderDevice(ctx, L, t);
    backButton(ctx, 14 + L.sl, 12 + L.st, '뒤로', this);
    const tabHint = [['prevTab', '기기·온라인']];
    if (this.src === 'online') footer(ctx, W, H, this.ofocus >= this.orows().length ? [['dpadV', '목록 넘기기'], ...tabHint, ['cancel', '돌아가기']] : [['dpadV', '항목'], ['dpadH', '바꾸기'], ...tabHint, ['cancel', '돌아가기']], '위 탭·◀ ▶ 를 누르고, 목록은 끌어서 넘기세요');
    else footer(ctx, W, H, [['dpadH', '부문 전환'], ...tabHint, ['cancel', '돌아가기']], '부문 탭을 터치하세요');
  }
  renderDevice(ctx, L, t) {
    const g = this.game, W = L.W;
    // 탭
    const n = MODES.length, tw = Math.min(150, (W - L.sl - L.sr - 80) / n), tx0 = W / 2 - (tw * n) / 2, ty = L.ty;
    this.tabs.clearHits();
    MODES.forEach((m, i) => {
      const r = { x: tx0 + i * tw, y: ty, w: tw - 6, h: L.tabH };
      this.tabs.hit(i, r);
      const cur = i === this.tabs.index;
      ctx.fillStyle = cur ? 'rgba(140,20,40,0.85)' : 'rgba(20,8,20,0.7)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = cur ? GOLD : 'rgba(200,160,90,0.35)'; ctx.lineWidth = cur ? 2 : 1; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      text(ctx, m.name, r.x + r.w / 2, r.y + r.h / 2 - 1, { size: 15, align: 'center', weight: 800, color: cur ? '#fff4dc' : '#b8a898', ow: 2, maxWidth: r.w - 8 });
      text(ctx, m.eng, r.x + r.w / 2, r.y + r.h / 2 + 14, { size: 11, align: 'center', weight: 800, family: FONT.num, color: cur ? GOLD : '#6a5e58', ow: 2, maxWidth: r.w - 8 });
    });
    // 목록
    const list = this.list();
    const colW = Math.min(440, (W - L.sl - L.sr - 60) / 2), cx0 = W / 2 - colW - 6, rowH = L.rowH, y0 = L.y0;
    const ck = ease.outCubic(clamp((this.t - (this.changedT ?? 0)) / 0.35, 0, 1));
    if (!list.length) {
      // 기록이 없으면 빈 순위 칸을 그리지 않고 안내 패널만 (글자가 순위 칸 위에 겹치지 않게)
      const pw = Math.min(460, W - 80), ph = 112, px = W / 2 - pw / 2, py = y0 + 5 * rowH - ph / 2 - 8;
      ctx.save(); ctx.globalAlpha = ck;
      frame(ctx, px, py, pw, ph, { glow: 0.4, fill0: 'rgba(22,8,20,0.9)' });
      text(ctx, '아직 이 부문의 기록이 없습니다', W / 2, py + 48, { size: 18, align: 'center', weight: 800, family: FONT.title, color: BONE, ow: 3 });
      text(ctx, '첫 번째 전설의 주인공이 되어 보세요!', W / 2, py + 78, { size: 14, align: 'center', color: DIM, ow: 2 });
      ctx.restore();
    }
    const tb = (rowH - 4) / 2 + 5; // 줄 안 글자 기준선
    const CW = Math.max(1, Math.round(colW));
    for (let i = 0; i < (list.length ? 20 : 0); i++) {
      const col = i < 10 ? 0 : 1, row = i % 10;
      const x = cx0 + col * (colW + 12), y = y0 + row * rowH;
      const h = list[i];
      const k = clamp(ck * 2.2 - i * 0.05, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * k; ctx.translate((1 - k) * 30, 0);
      const hl = h && this.highlight && h.date === this.highlight;
      // 줄 바탕: 폭마다 한 번 만든 그라데이션 3종 (강조 줄은 금빛을 한 겹 더 맥동)
      ctx.save();
      ctx.translate(x, 0);
      const kind = i < 3 && h ? 'top' : 'row';
      ctx.fillStyle = linGrad(ctx, `hsRow|${kind}|${CW}`, 0, 0, CW, 0, [[0, kind === 'top' ? 'rgba(120,20,40,0.55)' : 'rgba(16,6,16,0.6)'], [1, 'rgba(16,6,16,0.15)']]);
      ctx.fillRect(0, y, colW, rowH - 4);
      if (hl) {
        ctx.globalAlpha *= 0.55 + 0.35 * Math.sin(t * 6);
        ctx.fillStyle = linGrad(ctx, `hsRow|hl|${CW}`, 0, 0, CW, 0, [[0, 'rgba(220,170,50,0.75)'], [1, 'rgba(220,170,50,0)']]);
        ctx.fillRect(0, y, colW, rowH - 4);
      }
      ctx.restore();
      if (i < 3 && h) { ctx.fillStyle = MEDAL[i]; ctx.fillRect(x, y, 3, rowH - 4); }
      text(ctx, ORD(i), x + 12, y + tb, { size: 13, weight: 900, family: FONT.num, color: i < 3 && h ? MEDAL[i] : '#8a7a70', ow: 2 });
      if (h) {
        const ch = own(CHARACTERS, h.charId) ? CHARACTERS[h.charId] : null;
        const img = ch?.portrait ? assets.get(ch.portrait) : null;
        const pr = Math.min(11, (rowH - 6) / 2);
        const px = x + 62, py = y + (rowH - 4) / 2;
        ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.clip();
        if (img) { const s = 34 / img.width; ctx.drawImage(img, px - 17, py - 10, 34, img.height * s); } else { ctx.fillStyle = '#3a2a2a'; ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = 'rgba(232,200,114,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, pr + 0.5, 0, TAU); ctx.stroke();
        const name = h.name || ch?.name?.split(' ')[0] || '???';
        text(ctx, name, x + 80, y + tb, { size: h.name ? 15 : 13, weight: 900, family: h.name ? FONT.num : FONT.body, color: hl ? '#fff' : '#f0e4d0', ow: 2, maxWidth: 66 });
        const mn = this.tabs.index === 0 ? modeName(h.mode) : '';
        text(ctx, `${mn ? mn + ' · ' : ''}${detail(h)}`, x + 150, y + tb - 1, { size: 12, weight: 600, color: DIM, ow: 2, maxWidth: colW - 270 });
        text(ctx, fmt(h.score), x + colW - 10, y + tb, { size: 16, align: 'right', weight: 900, family: FONT.num, color: i === 0 ? '#ffe070' : '#fff', ow: 2 });
      } else text(ctx, '- - -', x + 80, y + tb, { size: 13, weight: 700, family: FONT.num, color: '#4a4040', ow: 0 });
      ctx.restore();
    }
    // 부가 기록
    const m = g.meta ?? {};
    const extra = [];
    const brb = bossRushBests(m), brc = COURSES.map((c, i) => (brb[i] ? `${c.short ?? c.name} ${fmtClock(brb[i].time ?? 0)}` : null)).filter(Boolean);
    if (brc.length) extra.push(`보스 러시 최단  ${brc.join(' · ')}`);
    if (m.survivalBest) extra.push(`서바이벌 최고 WAVE ${m.survivalBest}`);
    // 무한의 탑: 난이도별 최고 층 (탑 부문이면 모든 난이도, 아니면 가장 높은 것 하나)
    const twb = towerBests(m), tl = DIFFICULTIES.filter((d) => twb[d.id]?.floor > 0).map((d) => ({ d, b: twb[d.id] }));
    if (tl.length) {
      if (MODES[this.tabs.index]?.id === 'tower') extra.unshift(`무한의 탑 최고  ${tl.map(({ d, b }) => `${d.name} ${b.floor}층 ${fmtClock(b.time ?? 0)}`).join(' · ')}`);
      else { const top = tl.reduce((a, x) => (x.b.floor > a.b.floor ? x : a)); extra.push(`무한의 탑 최고 ${top.b.floor}층 (${top.d.name})`); }
    }
    const ec = endingCount(m.endingsSeen);
    if (ec.n) extra.push(`엔딩 ${ec.n}/${ec.of}`);
    if (extra.length) text(ctx, extra.join('   ·   '), W / 2, L.extraY, { size: 13, align: 'center', weight: 700, color: '#d8c0a0', ow: 2, maxWidth: W - 40 });
  }
  renderOnline(ctx, L, t) {
    const W = L.W, H = L.H, rows = this.orows();
    const x0 = L.sl + 16, LW = Math.round(clamp(W * 0.29, 236, 290));
    const rh = Math.max(L.minRow, 42);
    const lx = x0 + LW + 14, lw = W - L.sr - 16 - lx;
    const top = L.ty, bot = H - L.sb - 40;
    const list = { x: lx, y: top + 26, w: lw, h: bot - top - 26 };
    const rowH = clamp(Math.floor(list.h / 10), 26, 32);
    this._OL = { list, rowH };
    // 왼쪽: 선택 줄
    frame(ctx, x0, top - 4, LW, rows.length * rh + 8, { accent: '#8a6a3a', corners: false, edge: 0.4, fill0: 'rgba(14,6,16,0.84)' });
    const lab = 76;
    rows.forEach((o, i) => {
      const y = top + i * rh, sel = this.ofocus === i, by = y + rh / 2 + 5;
      if (sel) { ctx.fillStyle = 'rgba(179,18,46,0.45)'; ctx.fillRect(x0 + 2, y, LW - 4, rh); }
      if (i > 0) { ctx.fillStyle = 'rgba(232,200,114,0.08)'; ctx.fillRect(x0 + 8, y, LW - 16, 1); }
      text(ctx, o.label, x0 + 12, by, { size: 14, weight: 800, color: sel ? '#fff4dc' : '#c8b8a8', ow: 2, maxWidth: lab - 14 });
      const vx = x0 + lab + (LW - lab) / 2;
      text(ctx, o.value, vx, by, { size: 14, align: 'center', weight: 800, color: o.color ?? (sel ? GOLD : BONE), ow: 2, maxWidth: LW - lab - (o.n > 1 ? 50 : 12) });
      if (o.n > 1) {
        const ac = sel ? GOLD : 'rgba(232,200,114,0.5)';
        text(ctx, '◀', x0 + lab + 10, by, { size: 15, align: 'center', color: ac, ow: 2 });
        text(ctx, '▶', x0 + LW - 14, by, { size: 15, align: 'center', color: ac, ow: 2 });
        const zk = { owner: this, kind: 'list', src: 'highscore.opt' };
        taps.add(`hopt:${i}:1`, { x: x0, y, w: lab, h: rh }, zk);
        taps.add(`hopt:${i}:-1`, { x: x0 + lab, y, w: vx - x0 - lab, h: rh }, zk);
        taps.add(`hopt:${i}:1`, { x: vx, y, w: x0 + LW - vx, h: rh }, zk);
      }
    });
    // 왼쪽 아래: 내 순위 / 로그인 안내
    let y = top + rows.length * rh + 16;
    const D = this.ob.data, me = D?.me;
    const nick = ONLINE.nickNow();
    if (!cloud.loggedIn) {
      text(ctx, '로그인하면 순위에 오를 수 있어요', x0 + LW / 2, y + 14, { size: 13, align: 'center', weight: 800, color: '#9fd8ff', ow: 2, maxWidth: LW });
      if (cloud.eligible() && y + 26 + 44 <= bot) { const br = { x: x0 + 24, y: y + 26, w: LW - 48, h: 44 }; gbutton(ctx, br, '로그인', { size: 15, owner: this, id: 'login', src: 'highscore.login' }); }
    } else if (this.ob.state === 'ready') {
      text(ctx, '내 순위', x0 + 12, y + 14, { size: 13, weight: 700, color: DIM, ow: 2 });
      if (me) {
        text(ctx, me.rank ? `${me.rank}위` : '순위 밖', x0 + LW - 12, y + 16, { size: me.rank ? 20 : 15, align: 'right', weight: 900, family: me.rank ? FONT.num : FONT.body, color: '#ffe070', ow: 3 });
        text(ctx, this.recText(me), x0 + 12, y + 40, { size: 15, weight: 800, family: FONT.num, color: '#fff', ow: 2, maxWidth: LW - 24 });
      } else text(ctx, '아직 이 순위표에 기록이 없어요', x0 + 12, y + 40, { size: 13, weight: 700, color: BONE, ow: 2, maxWidth: LW - 24 });
      const myTitle = titleNameOf((() => { try { return this.game.ach?.title?.() ?? null; } catch { return null; } })());   // [hook:ach]
      if (nick && y + 62 <= bot) text(ctx, `공개 별명: ${nick}${myTitle ? ` · 이명 「${myTitle}」` : ''}`, x0 + 12, y + 62, { size: 12, weight: 700, color: DIM, ow: 2, maxWidth: LW - 24 });
    }
    // 오른쪽: 목록
    frame(ctx, lx, top - 4, lw, bot - top + 8, { accent: '#8a6a3a', corners: false, edge: 0.4, fill0: 'rgba(14,6,16,0.8)' });
    const C = { rank: lx + 12, nick: lx + 58, rec: lx + Math.round(lw * 0.52), hero: lx + Math.round(lw * 0.56) + 18 };
    const time = ONLINE.timeBoard(this.ob.board ?? this.board());
    text(ctx, '순위', C.rank, top + 14, { size: 12, weight: 800, color: DIM, ow: 2 });
    text(ctx, '별명', C.nick, top + 14, { size: 12, weight: 800, color: DIM, ow: 2 });
    text(ctx, time ? '기록' : ONLINE.floorBoard?.(this.ob.board ?? this.board()) ? '층 · 시간' : '웨이브 · 점수', C.rec, top + 14, { size: 12, align: 'right', weight: 800, color: DIM, ow: 2 });
    text(ctx, '헌터 · 직업', C.hero, top + 14, { size: 12, weight: 800, color: DIM, ow: 2 });
    ctx.fillStyle = 'rgba(232,200,114,0.2)'; ctx.fillRect(lx + 8, top + 21, lw - 16, 1);
    const st = this.ob.state, cx = lx + lw / 2, cy = list.y + Math.min(list.h / 2, 110);
    if (st !== 'ready') {
      if (st === 'loading' || st === 'idle') { spinner(ctx, cx, cy - 18, 13, t); text(ctx, '순위를 불러오는 중…', cx, cy + 16, { size: 15, align: 'center', weight: 800, color: BONE, ow: 2 }); return; }
      const m = st === 'offline' ? '인터넷에 연결되어 있지 않아요' : st === 'unavailable' ? '여기서는 온라인 순위를 볼 수 없어요' : this.ob.msg ?? '순위를 불러오지 못했어요';
      text(ctx, m, cx, cy - 6, { size: 15, align: 'center', weight: 800, color: '#ffb0a0', ow: 2, maxWidth: lw - 30 });
      if (st === 'unavailable') text(ctx, '공식 사이트와 안드로이드 앱에서 볼 수 있어요', cx, cy + 18, { size: 13, align: 'center', color: DIM, ow: 2, maxWidth: lw - 30 });
      else { const br = { x: cx - 80, y: cy + 14, w: 160, h: 44 }; gbutton(ctx, br, '다시 시도', { size: 15, owner: this, id: 'retry', src: 'highscore.retry' }); }
      return;
    }
    const E = D.entries;
    if (!E.length) {
      text(ctx, '아직 기록이 없어요', cx, cy - 4, { size: 17, align: 'center', weight: 800, family: FONT.title, color: BONE, ow: 3 });
      text(ctx, '첫 기록의 주인공이 되어 보세요!', cx, cy + 22, { size: 13, align: 'center', color: DIM, ow: 2 });
      return;
    }
    this.scroll.setMax(E.length * rowH - list.h);
    clipBegin(ctx, list);
    const sy = this.scroll.y, i0 = Math.max(0, Math.floor(sy / rowH)), i1 = Math.min(E.length, Math.ceil((sy + list.h) / rowH));
    const CW = Math.max(1, Math.round(lw - 16));
    for (let i = i0; i < i1; i++) {
      const e = E[i], yy = list.y + i * rowH - sy, tb = yy + rowH / 2 + 5;
      const mine = !!me?.rank && e.rank === me.rank;
      ctx.save(); ctx.translate(lx + 8, 0);
      ctx.fillStyle = linGrad(ctx, `hsRow|${mine ? 'me' : e.rank <= 3 ? 'top' : 'row'}|${CW}`, 0, 0, CW, 0, [[0, mine ? 'rgba(220,170,50,0.5)' : e.rank <= 3 ? 'rgba(120,20,40,0.55)' : 'rgba(16,6,16,0.6)'], [1, 'rgba(16,6,16,0.15)']]);
      ctx.fillRect(0, yy + 1, CW, rowH - 3);
      ctx.restore();
      if (e.rank <= 3) { ctx.fillStyle = MEDAL[e.rank - 1]; ctx.fillRect(lx + 8, yy + 1, 3, rowH - 3); }
      text(ctx, `${e.rank}`, C.rank + 6, tb, { size: 14, weight: 900, family: FONT.num, color: e.rank <= 3 ? MEDAL[e.rank - 1] : '#a89a90', ow: 2 });
      this.drawNick(ctx, e, C.nick, tb, C.rec - C.nick - 70, mine);
      text(ctx, this.recText(e), C.rec, tb, { size: 14, align: 'right', weight: 900, family: FONT.num, color: i === 0 ? '#ffe070' : '#fff', ow: 2 });
      const ch = own(CHARACTERS, e.hero) ? CHARACTERS[e.hero] : null, cl = own(CLASSES, e.cls) ? CLASSES[e.cls] : null;
      const img = ch?.portrait ? assets.get(ch.portrait) : null, pr = Math.min(10, (rowH - 8) / 2), px = C.hero - 6 - pr, py = yy + rowH / 2;
      if (img) { ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.clip(); const s2 = (pr * 3) / img.width; ctx.drawImage(img, px - pr * 1.5, py - pr, pr * 3, img.height * s2); ctx.restore(); }
      text(ctx, `${ch?.name?.split(' ')[0] ?? e.hero}${cl ? ` · ${cl.name}` : ''}`, C.hero + 4, tb, { size: 12, weight: 700, color: DIM, ow: 2, maxWidth: lx + lw - C.hero - 14 });
    }
    clipEnd(ctx, list, this.scroll);
    scrollbar(ctx, lx + lw - 6, list.y, list.h, this.scroll, list.h);
    if (this.ofocus >= rows.length) { ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.strokeRect(lx + 1.5, top - 2.5, lw - 3, bot - top + 5); }
    text(ctx, `전체 ${D.total}명`, lx + lw - 12, bot - 2 + 14 > H - L.sb - 34 ? top + 14 : bot + 14, { size: 11, align: 'right', weight: 700, color: DIM, ow: 2 });
  }
  /** 순위 줄의 별명 + 이명 (§8.3): 별명은 그대로, 이명을 남는 폭에 맞춰 줄이고 안 되면 뺀다 */
  drawNick(ctx, e, x, y, w, mine) {
    const col = mine ? '#fff' : '#f0e4d0', tn = titleNameOf(e.title);
    if (tn) {
      ctx.font = font(14, 800, FONT.body);
      const nw = ctx.measureText(e.nick).width;
      const ep = nw + 6 < w ? fitEpithet(ctx, tn, w - nw - 5) : null;
      if (ep) {
        text(ctx, e.nick, x, y, { size: 14, weight: 800, color: col, ow: 2 });
        text(ctx, ep, x + nw + 5, y - 0.5, { size: 12, weight: 700, color: '#e8c872', ow: 2 });
        return;
      }
    }
    text(ctx, e.nick, x, y, { size: 14, weight: 800, color: col, ow: 2, maxWidth: w });
  }
  /** 기록 표시: 시간 보드 = 1:23.45, 서바이벌 = WAVE n · 점수, 무한의 탑 = n층 · 1:23.45 */
  recText(e) {
    const b = this.ob.board ?? this.board();
    if (ONLINE.floorBoard?.(b)) return `${e.floor ?? '?'}층 · ${ONLINE.fmtMs(e.time)}`;
    return ONLINE.timeBoard(b) ? ONLINE.fmtMs(e.time) : `WAVE ${e.wave ?? '?'} · ${fmt(e.score ?? 0)}`;
  }
}

// ───────────────────────────── 이니셜 입력 ─────────────────────────────
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-!?* ';
const NEW_RECORD = 'NEW RECORD!';
const NR_OPTS = { size: 46, style: 'gold', drips: 0 };

/** push('initials', { score, mode, entry, onDone(rank, name) }) */
export class InitialsScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }
  enter({ score = 0, mode = 'story', entry = {}, onDone = null } = {}) {
    this.score = score; this.mode = mode; this.entry = entry; this.onDone = onDone;
    const last = String(this.game.meta?.lastInitials || 'AAA').toUpperCase().padEnd(3, 'A').slice(0, 3);
    this.letters = [...last].map((c) => Math.max(0, CHARS.indexOf(c)));
    this.cur = 0; this.bump = [0, 0, 0, 0];
    this.typedKey = null;
    input.textCapture = (k) => this.onType(k);
    // 예상 순위
    const list = scoreList(this.game.meta).filter((h) => (h.mode || 'story') === mode);
    this.rank = list.filter((h) => h.score >= score).length;
    audio.sfx('extra_life');
    // 피 글씨는 처음 그릴 때 굽는다 → 미리 (지금 화면 배율로)
    try {
      const ctx = this.game.ctx, k = (this.game.scale || 1) * (this.game.uiK || 1);
      if (ctx) { ctx.save(); ctx.setTransform(k, 0, 0, k, 0, 0); prewarmText(ctx, NEW_RECORD, NR_OPTS); ctx.restore(); }
    } catch { /* 그릴 때 굽는다 */ }
  }
  exit() { input.textCapture = null; }
  /**
   * 키보드 문자 입력. Z·X·Space 처럼 결정/취소에 묶인 키는 글자가 아니라 조작(다음/이전)으로 처리한다.
   * textCapture 는 keydown 처리 도중(키 상태 반영 전)에 불리므로, 키 상태가 반영된 뒤(마이크로태스크)에 판별한다.
   * 실제 반영은 update 에서 (같은 키의 다른 액션 입력은 flush 로 무시)
   */
  onType(k) {
    const i = CHARS.indexOf(String(k).toUpperCase());
    if (i < 0) return;
    queueMicrotask(() => {
      const key = input.sources?.key ?? {};
      if (key.confirm || key.cancel) return;
      if (this.cur <= 2 && !this.done) this.typedKey = i;
    });
  }
  applyTyped() {
    const i = this.typedKey;
    this.typedKey = null;
    if (i === null || this.cur > 2) return false;
    this.letters[this.cur] = i; this.bump[this.cur] = 1;
    this.cur = Math.min(3, this.cur + 1);
    audio.sfx('type');
    return true;
  }
  cycle(d) {
    if (this.cur > 2) return;
    this.letters[this.cur] = (this.letters[this.cur] + d + CHARS.length) % CHARS.length;
    this.bump[this.cur] = 1;
    audio.sfx('menu_move');
  }
  finish() {
    if (this.done) return;
    this.done = true;
    const name = this.letters.map((i) => CHARS[i]).join('').trim() || '???';
    const g = this.game;
    g.meta.lastInitials = name;
    const rank = recordHighScore(g, { ...this.entry, score: this.score, mode: this.mode, name });
    audio.sfx('enhance_success');
    g.flash('#ffe070', 0.5, 3);
    g.toast(`명예의 전당 ${rank + 1}위에 「${name}」 등록!`, '#ffe070', 3);
    input.textCapture = null;
    g.pop();
    this.onDone?.(rank, name);
  }
  update(dt) {
    for (let i = 0; i < 4; i++) this.bump[i] = Math.max(0, this.bump[i] - dt * 5);
    if (this.applyTyped()) { input.flush(); return; }
    // 터치 (▲▼·글자 칸·등록: ui.taps, 여유 영역으로 44 CSS px)
    const tap = taps.hit(this);
    if (tap) {
      const [act, i] = String(tap).split(':');
      const n = Number(i) || 0;
      if (act === 'up') { this.cur = n; this.cycle(1); }
      else if (act === 'down') { this.cur = n; this.cycle(-1); }
      else if (act === 'sel') { this.cur = n; audio.sfx('menu_move'); }
      else if (act === 'ok') this.finish();
      return;
    }
    if (input.pressed('up')) this.cycle(1);
    else if (input.pressed('down')) this.cycle(-1);
    else if (input.pressed('right')) { this.cur = Math.min(3, this.cur + 1); audio.sfx('menu_move'); }
    else if (input.pressed('left')) { this.cur = Math.max(0, this.cur - 1); audio.sfx('menu_move'); }
    else if (input.pressed('confirm') || input.pressed('menu')) {
      if (this.cur >= 3 || input.pressed('menu')) this.finish();
      else { this.cur++; audio.sfx('menu_ok'); }
    } else if (input.pressed('cancel')) { if (this.cur > 0) { this.cur--; audio.sfx('menu_cancel'); } }
    // 자동 반복 (길게 누르기)
    for (const [a, d] of [['up', 1], ['down', -1]]) {
      if (input.down(a)) { this.hold = (this.hold ?? 0) + dt; if (this.hold > 0.35) { this.hold = 0.28; this.cycle(d); } }
    }
    if (!input.down('up') && !input.down('down')) this.hold = 0;
  }
  render(ctx) {
    const g = this.game, t = g.time, uk = g.uiK || 1;
    const W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const S = hudSafe(g), sb = (S.b || 0) / uk, st = (S.t || 0) / uk;
    const k = ease.outCubic(clamp(this.t / 0.3, 0, 1));
    ctx.fillStyle = `rgba(4,0,6,${0.93 * k})`; ctx.fillRect(0, 0, W, H);
    // 방사형 광선
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.07 * k;
    ctx.translate(W / 2, H * 0.45);
    for (let i = 0; i < 16; i++) { ctx.rotate(TAU / 16); ctx.fillStyle = i % 2 ? '#ffd070' : '#b3122e'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -60); ctx.lineTo(W, 60); ctx.fill(); }
    ctx.restore();
    // 세로 배치: 높이가 모자라면 위쪽 줄 간격을 줄인다 (휴대폰 432~470 UI px)
    const c = H < 500;
    const Y = c
      ? { title: st + 58, rank: st + 88, score: st + 124, orn: st + 140, box: st + 196 }
      : { title: st + 76, rank: st + 108, score: st + 150, orn: st + 168, box: st + 238 };
    ctx.save(); ctx.globalAlpha = k;
    // NEW RECORD — 금박 피 글씨 (뒤쪽 금빛 후광이 맥동)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * (0.25 + 0.15 * Math.sin(t * 6));
    ctx.translate(W / 2, Y.title - 16); ctx.scale(2.6, 0.7);
    ctx.fillStyle = radGrad(ctx, 'nrGlow', 0, 0, 2, 100, [[0, 'rgba(255,190,80,0.9)'], [1, 'rgba(255,120,40,0)']]);
    ctx.fillRect(-100, -100, 200, 200);
    ctx.restore();
    bloodText(ctx, NEW_RECORD, W / 2, Y.title, { ...NR_OPTS, t: this.t, maxWidth: W - 60 });
    text(ctx, `${modeName(this.mode)} 부문 ${this.rank + 1}위 — 명예의 전당에 이름을 새기세요`, W / 2, Y.rank, { size: 16, align: 'center', weight: 800, color: '#f0e0c8', ow: 3, maxWidth: W - 40 });
    text(ctx, fmt(this.score), W / 2, Y.score, { size: 34, align: 'center', weight: 900, family: FONT.num, color: '#fff', ow: 4 });
    ornament(ctx, W / 2, Y.orn, 360);
    // 글자 칸
    const bw = 84, bh = c ? 96 : 104, gap = 22, x0 = W / 2 - (bw * 3 + gap * 2 + 110 + gap) / 2, y = Y.box;
    for (let i = 0; i < 3; i++) {
      const x = x0 + i * (bw + gap), cur = this.cur === i;
      const s = 1 + this.bump[i] * 0.15;
      frame(ctx, x, y, bw, bh, { accent: cur ? GOLD : '#6a5030', glow: cur ? 0.9 : 0, corners: cur });
      ctx.save(); ctx.translate(x + bw / 2, y + bh / 2 + 24); ctx.scale(s, s);
      text(ctx, CHARS[this.letters[i]] === ' ' ? '_' : CHARS[this.letters[i]], 0, 0, { size: 64, align: 'center', weight: 900, family: FONT.num, color: cur ? '#fff6dc' : '#c8b8a8', ow: 5 });
      ctx.restore();
      const up = { x, y: y - 54, w: bw, h: 50 }, dn = { x, y: y + bh + 4, w: bw, h: 50 };
      text(ctx, '▲', x + bw / 2, up.y + 34, { size: 22, align: 'center', color: cur ? GOLD : 'rgba(232,200,114,0.35)', ow: 2 });
      text(ctx, '▼', x + bw / 2, dn.y + 32, { size: 22, align: 'center', color: cur ? GOLD : 'rgba(232,200,114,0.35)', ow: 2 });
      taps.add(`up:${i}`, up, { owner: this, kind: 'icon', src: 'initials.up' });
      taps.add(`down:${i}`, dn, { owner: this, kind: 'icon', src: 'initials.down' });
      taps.add(`sel:${i}`, { x, y, w: bw, h: bh }, { owner: this, kind: 'primary', src: 'initials.box', slop: 0 });
    }
    const er = { x: x0 + 3 * (bw + gap), y: y + (bh - 48) / 2, w: 110, h: 48 };
    gbutton(ctx, er, '등록', { selected: this.cur === 3, size: 18, icon: '✔', owner: this, id: 'ok', src: 'initials.ok' });
    const hy = Math.min(H - 16 - sb, y + bh + 76);
    if (promptMode() === 'touch') text(ctx, '▲▼ 로 글자를 바꾸고 「등록」을 누르세요', W / 2, hy, { size: 13, align: 'center', color: '#b8aa98', ow: 2 });
    else {
      const items = [['dpadV', '글자 변경'], ['dpadH', '칸 이동'], ['confirm', '다음·등록'], ['cancel', '이전']];
      drawHints(ctx, promptMode() === 'kb' ? [...items, [null, '(키보드로 직접 입력 가능)']] : items, W / 2, hy, { align: 'center', size: 13, color: '#b8aa98' });
    }
    ctx.restore();
  }
}
