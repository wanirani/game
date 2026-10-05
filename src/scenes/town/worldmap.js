// 월드맵 (world2 §10 · platform WP-7) — owner: WORLDMAP-P2
//   두 장의 지도
//     0 악마성 Ⅰ : 양피지 지도 위 1부 13개 스테이지(STAGE_ORDER_P1) + 투기장. 에슈빌에서 출발, 드라큘라의 유물 5
//                  + 외전 s22 (side, page 0, docs/specs/ex_s22.md): 2부 엔딩(p2_done) 뒤에만 2장 안개의 묘지에서 갈라지는 '외전' 노드 (1부 장 사슬에는 들지 않는다)
//     1 이계 Ⅱ   : 2부 s14~s20 (에슈빌 균열문 → 나선을 그리며 한가운데 태초의 공허로). 세계의 심장 6 · 별의 조각 6
//                  + 외전 s21 (side, docs/specs/ex_s21.md): 2부 엔딩(p2_done) 뒤에만 17장 위쪽에 '외전' 노드로 나타난다 (17장에서 갈라지는 은빛 길)
//     2부 지도는 flags.p2_started 이거나 s14 가 열렸을 때만 있다 — 없으면 탭 없이 예전 그대로.
//     아직 맵이 없는 2부 스테이지(STAGES 에 없음)는 잠긴 노드로만 보인다.
//   enter({ page }) : 페이지 지정이 우선. 없으면 가장 최근에 열린 미클리어 스테이지나 lastStage 가 2부면 1, 아니면 0
//   해금 연출 (차례로): s13 (유물 5 + s12 클리어) · s14 (2부 시작 → flags.s14_revealed) · s20 (처음 열렸을 때 → flags.s20_revealed)
//                       · 외전 s21 · s22 (2부 엔딩 p2_done 뒤 처음 지도를 열 때 해금 → flags.<id>_revealed; 연출은 그 외전의 쪽(STAGES[id].page)에서,
//                         두 외전이 한꺼번에 열리면 s21(이계 Ⅱ) → s22(악마성 Ⅰ) 차례로 — startReveal 이 쪽을 넘긴다)
//   옛 세이브 (2부가 생기기 전에 s13 을 깼다): 들어오자마자 2부 프롤로그 → 마을 (world2 §2.2 — 지도는 마을 위에 쌓이는 장면이라 바로 가지 않는다)
//   입력: 방향 = 노드 · 결정 = 출발 · 취소/메뉴 = 닫기 · 지도 전환 = Q/E·S/D·Tab (패드 LB/RB·LT·SELECT) · 터치 = 노드/탭/버튼
//   uiScale 장면 (game.uiW × game.uiH 로 배치), 안내 줄은 기기별 글리프 (prompts.drawHints), 탭 영역은 ui.taps (터치 여유 포함)
//   스택에 이 장면만 있으면(?scene=worldmap) 닫기 = 마을로 (P-26)
//   음악: 0 = worldmap, 1 = worldmap2 (전환하면 교차 페이드)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, wrap, drawCover, FONT, font, taps, fontEpoch } from '../../core/ui.js';
import { drawHints } from '../../core/prompts.js';
import { TAU, clamp, lerp, ease, fmt, fmtTime, rgba, rand, shade, mix } from '../../core/math.js';
import { Particles } from '../../core/particles.js';
import { STAGES, STAGE_ORDER_P1, RELICS, HEARTS, SHARDS, SIDE_STAGES } from '../../data/stages.js';
import { SCRIPTS } from '../../data/story.js';
import { ITEMS } from '../../data/items.js';
import { CHARACTERS } from '../../data/characters.js';
import { currentHero } from '../../game/state.js';
import { preloadStageBosses } from '../../game/bosses/lazy.js';
import { drawIcon } from '../../render/icons.js';
import { ensureState, uiPanel, uiButton } from './common.js';
import { glow } from './facades.js';

const RANK_COL = { SSS: '#ffe070', SS: '#ff5a4a', S: '#ffa640', A: '#c07cff', B: '#5aa8ff', C: '#7ee07e', D: '#a0a0a0' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
const INK = '#2a1608';
const XFADE = 0.35;             // 지도 전환 교차 페이드 (초)
const TAB_W = 112, TAB_GAP = 6; // 상단 탭 (world2 §10: {x:250, y:12, w:112, h:34})
const PAGE_KEYS = ['prevTab', 'nextTab', 'swap', 'skill1', 'skill2', 'map'];

// 2부 스테이지 순서 (STAGE_ORDER_P2 는 있는 것만 담으므로 지도는 이 목록으로 자리를 잡는다)
const P2_IDS = ['s14', 's15', 's16', 's17', 's18', 's19', 's20'];
// 외전 (STAGES[id].side): 열렸을 때만 노드가 생기고, from 노드에서 갈라지는 길로 잇는다 (1부 장 사슬·2부 나선 사슬에는 들지 않는다).
//   어느 지도에 놓일지는 STAGES[id].page (없으면 1 = 이계 지도): s21 → 이계 Ⅱ 17장 위, s22 → 악마성 Ⅰ 2장 안개의 묘지 위쪽 숲 언덕
const SIDE_FROM = { s21: 's17', s22: 's02' };
const sidePage = (id) => STAGES[id]?.page ?? 1;
// 외전 정보판의 동료 칸 (합류 플래그 · 합류 전/뒤 문구)
const SIDE_INFO = {
  s21: { flag: 'recruit_mt_argen', got: '은빛 용 아르겐 합류', wait: '구름 위에서 누군가 기다린다', col: '#c8e4ff', gotCol: '#e8f6ff' },
  s22: { flag: 'recruit_gd_munin', got: '늙은 까마귀 무닌 합류', wait: '까마귀가 이름을 부른다', col: '#ff8a9e', gotCol: '#ffd0d8' },
};
// STAGES 에 아직 없는 2부 스테이지의 자리 (잠긴 노드로만 보인다; 값은 world2 §4.2)
const P2_STUB = {
  s14: { name: '거울의 성', color: '#cfe8ff', mapPos: { x: 0.16, y: 0.74 } },
  s15: { name: '영겁의 용광로', color: '#ff7a2a', mapPos: { x: 0.1, y: 0.4 } },
  s16: { name: '가라앉은 성소', color: '#3ad0c8', mapPos: { x: 0.28, y: 0.12 } },
  s17: { name: '폭풍의 공중정원', color: '#9fc8ff', mapPos: { x: 0.58, y: 0.06 } },
  s18: { name: '악몽의 미궁', color: '#c060ff', mapPos: { x: 0.86, y: 0.2 } },
  s19: { name: '썩어가는 숲', color: '#9ad040', mapPos: { x: 0.88, y: 0.62 } },
  s20: { name: '태초의 공허', color: '#ffffff', mapPos: { x: 0.52, y: 0.46 }, docs: ['d27'], req: '여섯 세계의 심장을 모두 되찾으면 공허로 가는 길이 열린다' },
};
const stubStage = (id) => ({ id, chapter: Number(id.slice(1)), part: 2, page: 1, level: 0, docs: [], ...P2_STUB[id] });
const MISSING_REQ = '이 세계로 가는 길은 아직 짙은 어둠에 가려 있다…';

const PAGES = [
  {
    title: '월드맵', sub: 'THE ROAD TO THE CASTLE', tab: '악마성 Ⅰ', bg: 'bg/worldmap', fallback: ['#c8b48a', '#8a7450'], music: 'worldmap',
    start: { x: 0.05, y: 0.9 }, startName: '에슈빌', path: '#8a1426', label: INK, labelSel: '#5a0a10', outline: 'rgba(245,232,200,0.92)',
  },
  {
    title: '이계 지도', sub: 'BEYOND THE RIFT', tab: '이계 Ⅱ', bg: 'bg/worldmap2', fallback: ['#0a0612', '#1a0a2a'], music: 'worldmap2',
    start: { x: 0.5, y: 0.93 }, startName: '에슈빌 균열문', path: '#b060ff', label: '#e8dcff', labelSel: '#fff0c4', outline: 'rgba(10,4,20,0.92)',
  },
];
// 이계 지도의 나선 중심 (경로가 바깥으로 부풀어 공허로 감겨 든다)
const P2_CENTER = { x: 0.52, y: 0.46 };

const REVEALS = {
  s13: { title: '심연의 역성', sub: '다섯 유물이 공명하며 거꾸로 선 성이 모습을 드러냈다', color: '#b060ff', tcol: '#e0b0ff', fx: 'dark', pcol: '#d080ff' },
  s14: { title: '균열이 열렸다', sub: '에슈빌 하늘 너머로 이계의 길이 드러났다', color: '#b060ff', tcol: '#e0b0ff', fx: 'magic' },
  s20: { title: '태초의 공허', sub: '여섯 세계의 심장이 공허로 가는 길을 비춘다', color: '#ffffff', tcol: '#ffffff', fx: 'holy' },
  s21: { title: '외전 · 하늘 정원의 둥지', sub: '구름 위 하늘 정원에서 용의 울음이 들려온다', color: '#c8e4ff', tcol: '#e8f6ff', crack: '#e8f6ff', fx: 'magic' },
  s22: { title: '외전 · 이름 없는 언덕', sub: '안개의 묘지 너머에서 까마귀들이 이름 없는 칼을 부른다', color: '#ff4a6a', tcol: '#ffd0d8', crack: '#ffd0d8', fx: 'dark' },
};

/** 글자 폭을 재는 캔버스 (update 에서도 이름표 배치를 계산할 수 있게) */
let MCTX = null;
function measureCtx() {
  if (!MCTX && typeof document !== 'undefined') MCTX = document.createElement('canvas').getContext('2d');
  return MCTX;
}
/** 상자와 원 중심 사이의 거리 (상자 안이면 0) */
function boxDist(b, cx, cy) {
  const dx = cx < b.x ? b.x - cx : cx > b.x + b.w ? cx - (b.x + b.w) : 0;
  const dy = cy < b.y ? b.y - cy : cy > b.y + b.h ? cy - (b.y + b.h) : 0;
  return Math.hypot(dx, dy);
}
/** 그라데이션 캐시 (컨텍스트마다; 원점 기준으로 만들어 translate 해서 쓴다) — 매 프레임 새로 만들지 않는다 (R12) */
const GRADS = new WeakMap();
function cachedGrad(ctx, key, make) {
  let m = GRADS.get(ctx);
  if (!m) { m = new Map(); GRADS.set(ctx, m); }
  let g = m.get(key);
  if (!g) { if (m.size > 96) m.clear(); g = make(); m.set(key, g); }
  return g;
}
function boxOverlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export class WorldMapScene extends Scene {
  enter(params = {}) {
    const g = this.game, st = ensureState(g);
    this.uiScale = true;   // platform §6.2: 휴대폰에서 글자·버튼을 키운다 (배치는 game.uiW × game.uiH)
    this.hidePad = true;
    this.world = params.world ?? null;
    this.fx = new Particles(500);
    this.fx.quality = g.tier === 'low' ? 0.5 : g.tier === 'medium' ? 0.75 : 1;
    this.reveal = null; this.reveals = []; this.depart = null; this.xfade = null;
    this.closing = false; this.redirect = false;
    this.tok = null;
    this._L = null; this._lab = [null, null]; this._tk = [null, null]; this._snap = null;
    const P = st.progress;
    if (!P.flags || typeof P.flags !== 'object') P.flags = {};
    if (!Array.isArray(P.unlocked)) P.unlocked = ['s01'];
    if (!Array.isArray(P.seenScripts)) P.seenScripts = [];   // 서막·인트로 기록 (launch · 옛 세이브 프롤로그가 여기에 쓴다)
    const F = P.flags;
    // ① 2부가 생기기 전에 s13 을 깬 세이브 → 2부 프롤로그 → 마을 (world2 §2.2 legacy)
    if (this.legacyPrologue(st)) return;
    // ② 해금 연출
    const queue = [];
    if ((P.relics?.length ?? 0) >= 5 && P.cleared?.s12 && !P.unlocked.includes('s13')) {
      P.unlocked.push('s13');
      queue.push(this.mkReveal('s13', 0));
    }
    if (F.p2_started && STAGES.s14 && !P.unlocked.includes('s14')) {
      P.unlocked.push('s14'); F.s14_revealed = true;
      queue.push(this.mkReveal('s14', 1));
    }
    if (STAGES.s20 && P.unlocked.includes('s20') && !F.s20_revealed) {
      F.s20_revealed = true;
      queue.push(this.mkReveal('s20', 1));
    }
    // 외전 (docs/specs/ex_s21.md · ex_s22.md): 2부 엔딩(두 엔딩 모두 p2_done) 뒤 처음 지도를 열 때 열고 한 번 알린다. 이야기 진행(엔딩)과는 무관
    //   p2_done 은 엔딩 대본 끝에서야 켜지므로, 엔딩 장면이 먼저 저장한 ending_p2·ending_p2true 도 본다 (엔딩 도중 앱을 닫은 세이브 — hub.js 와 같은 규칙)
    //   연출은 그 외전이 놓인 지도에서 (s21 이계 Ⅱ · s22 악마성 Ⅰ — 처음 여는 2부 완주 세이브는 둘이 차례로, startReveal 이 쪽을 넘긴다)
    const p2Ended = !!(F.p2_done || F.ending_p2 || F.ending_p2true);
    for (const id of SIDE_STAGES) {
      if (!p2Ended || F[`${id}_revealed`] || !REVEALS[id]) continue;
      if (!P.unlocked.includes(id)) P.unlocked.push(id);
      F[`${id}_revealed`] = true;
      queue.push(this.mkReveal(id, sidePage(id)));
    }
    // ③ 지도 두 장
    this.hasP2 = !!(F.p2_started || P.unlocked.includes('s14'));
    this.pages = [this.buildPage(0), this.hasP2 ? this.buildPage(1) : null];
    let page = 0;
    if (params.page === 0 || params.page === 1) page = params.page === 1 && this.hasP2 ? 1 : 0;
    else if (this.hasP2 && this.prefersP2(st)) page = 1;
    this.page = page;
    this.index = this.defaultIndex(page);
    assets.preload(this.hasP2 ? ['bg/worldmap', 'bg/worldmap2'] : ['bg/worldmap']);
    audio.sfx('card', { vol: 0.5 });
    if (queue.length) {
      this.reveals = queue;
      this.startReveal(this.reveals.shift());
      this.saveNow();
    } else audio.music(PAGES[page].music);
  }
  get state() { return this.game.state; }
  /** 토스트는 정보 패널 바로 위에서 위로 쌓는다 (탭·지도 위쪽 노드를 가리지 않고 '출발/잠김' 버튼 곁에 뜬다) */
  get toastY() { return this._L ? this._L.panelY - 16 : undefined; }
  get toastUp() { return !!this._L; }
  get nodes() { return this.pages?.[this.page]?.nodes ?? []; }
  cur() { return this.nodes[this.index] ?? null; }
  isOpen(n) { return n.arena ? true : n.missing ? false : this.state.progress.unlocked.includes(n.id); }

  /** 옛 세이브: s13 을 깼는데 2부가 시작되지 않았다 → 프롤로그로 (마을로 돌아온 뒤 다시 성문으로 오면 s14 해금 연출) */
  legacyPrologue(st) {
    const g = this.game, P = st.progress, F = P.flags;
    const done13 = !!P.cleared?.s13 || (Array.isArray(P.bosses) && P.bosses.includes('b_chaos'));
    if (!done13 || F.p2_started || st.arcade || !g.registry.story || !SCRIPTS.p2_prologue) return false;
    this.redirect = true;
    if (Array.isArray(P.seenScripts) && !P.seenScripts.includes('p2_prologue')) P.seenScripts.push('p2_prologue');
    audio.stopMusic?.(0.6);
    g.go('story', { script: 'p2_prologue', then: 'hub', thenParams: { from: 'p2' }, bg: 'cg/cg_rift_sky' });
    return true;
  }

  /** 페이지의 노드와 경로 */
  buildPage(page) {
    const P = this.state.progress, nodes = [], links = [];
    if (page === 0) {
      for (const id of STAGE_ORDER_P1) {
        if (!STAGES[id]) continue;
        if (id === 's13' && !P.unlocked.includes('s13')) continue;
        nodes.push({ id, stage: STAGES[id] });
      }
      this.sideNodes(0, nodes, links);   // 외전 (s22) — 투기장 노드 앞
      if (STAGES.arena) nodes.push({ id: 'arena', stage: STAGES.arena, arena: true });
      // 1부 장 사슬: 투기장·역성(s13)·외전은 빼고 (외전을 넣으면 s12 → s22 길이 생긴다)
      const chain = nodes.filter((n) => !n.arena && !n.side && n.id !== 's13');
      if (chain.length) links.push({ a: null, b: chain[0], seed: 0, always: true });
      for (let i = 0; i < chain.length - 1; i++) links.push({ a: chain[i], b: chain[i + 1], seed: i + 1 });
      const s13 = nodes.find((n) => n.id === 's13'), s12 = nodes.find((n) => n.id === 's12');
      if (s13 && s12) links.push({ a: s12, b: s13, seed: 20, wide: 1.6, col: '#7a20c0', always: true });
    } else {
      for (const id of P2_IDS) {
        const s = STAGES[id];
        nodes.push(s ? { id, stage: s } : { id, stage: stubStage(id), missing: true });
      }
      links.push({ a: null, b: nodes[0], seed: 0 });
      for (let i = 0; i < nodes.length - 1; i++) links.push({ a: nodes[i], b: nodes[i + 1], seed: i + 1, wide: nodes[i + 1].id === 's20' ? 1.6 : 1 });
      this.sideNodes(1, nodes, links);   // 외전 (s21)
    }
    return { page, nodes, links };
  }
  /**
   * 외전 노드: 열렸을 때만 (2부 엔딩 뒤), 이 쪽(STAGES[id].page)에 놓이는 것만. 장 사슬 끝이 아니라 SIDE_FROM 노드에서 갈라지는 길로 잇는다
   * (이계 Ⅱ 는 그 외전의 색, 악마성 Ⅰ 양피지는 1부 길과 같은 붉은 잉크)
   */
  sideNodes(page, nodes, links) {
    const P = this.state.progress;
    for (const id of SIDE_STAGES) {
      if (sidePage(id) !== page || !P.unlocked.includes(id)) continue;
      const n = { id, stage: STAGES[id], side: true };
      nodes.push(n);
      const from = nodes.find((m) => m.id === SIDE_FROM[id]);
      if (from) links.push({ a: from, b: n, seed: 21, col: page === 1 ? STAGES[id].color : PAGES[0].path, side: true, always: true });
    }
  }
  /** 기본 선택: 가장 늦게 열린 미클리어 노드, 없으면 마지막으로 열린 노드 */
  defaultIndex(page) {
    const nodes = this.pages[page]?.nodes ?? [], P = this.state.progress;
    let idx = 0, fresh = -1;
    nodes.forEach((n, i) => {
      if (n.arena || !this.isOpen(n)) return;
      idx = i;
      if (!P.cleared?.[n.id]) fresh = i;
    });
    return fresh >= 0 ? fresh : idx;
  }
  /** 가장 최근에 열린 미클리어 스테이지나 마지막으로 간 스테이지가 2부인가 */
  prefersP2(st) {
    const P = st.progress;
    let recent = null;
    for (let i = P.unlocked.length - 1; i >= 0 && !recent; i--) {
      const id = P.unlocked[i];
      if ((STAGES[id] || P2_IDS.includes(id)) && id !== 'arena' && !P.cleared?.[id]) recent = id;   // 아직 맵이 없는 2부 스테이지도 센다
    }
    const p2 = (id) => P2_IDS.includes(id) || (SIDE_STAGES.includes(id) && sidePage(id) === 1);   // 외전은 놓인 쪽을 따른다 (s21 이계 · s22 악마성)
    return p2(recent) || p2(st.lastStage?.stageId);
  }

  mkReveal(id, page) {
    const R = REVEALS[id];
    return { id, page, ...R, pcol: R.pcol ?? STAGES[id]?.color ?? R.color, t: 0, boom: false };
  }
  startReveal(R) {
    if (R.page !== this.page && this.pages[R.page]) this.setPage(R.page, { quiet: true });
    const i = this.nodes.findIndex((n) => n.id === R.id);
    if (i >= 0) this.index = i;
    this.tok = null;
    R.t = 0; R.boom = false;
    this.reveal = R;
    audio.stopMusic?.(0.4);
    audio.sfx('boss_roar', { vol: R.id === 's20' ? 0.6 : 0.8 });
  }
  endReveal() {
    const next = this.reveals.shift();
    if (next) this.startReveal(next);
    else { this.reveal = null; audio.music(PAGES[this.page].music); }
    input.flush();
  }

  /** 지도 전환 (교차 페이드, 효과음, 음악 교차 페이드) */
  setPage(p, { quiet = false } = {}) {
    if (p === this.page || !this.pages[p]) return;
    if (!quiet) this.xfade = { from: this.page, fromIndex: this.index, t: 0, snap: null };
    this.page = p;
    this.index = this.defaultIndex(p);
    this.tok = null;
    if (quiet) return;
    audio.sfx('card');
    if (!this.reveal) audio.music(PAGES[p].music, { fade: 0.6 });
  }

  saveNow() {
    const g = this.game, st = this.state;
    if (!g.settings?.autoSave || !(st.slot >= 1) || st.arcade) return;
    try { saves.write(st.slot, st); } catch { /* 무시 */ }
  }

  // ───────────────────────── 배치 ─────────────────────────
  /**
   * UI 좌표 배치: 상단 바(0~58) + 맨 위 노드의 이름표 자리 / 아래: 정보 패널 + (터치가 아니면) 안내 줄.
   * 세로가 좁으면(휴대폰 UI 배율) 정보 패널을 줄이고, 터치 모드는 안내 줄 자리를 지도에 준다.
   */
  layout() {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH, touch = !!input.touchMode;
    const L = this._L;
    if (L && L.W === W && L.H === H && L.touch === touch) return L;
    const IH = H < 480 ? 116 : 132;
    const panelY = H - IH - (touch ? 12 : 26);
    const TB = 58, my = TB + 26;
    return (this._L = { W, H, touch, TB, IH, panelY, mx: 56, my, mw: W - 112, mh: Math.max(120, panelY - 16 - my) });
  }
  pos(mp, L = this.layout()) { return { x: L.mx + mp.x * L.mw, y: L.my + mp.y * L.mh }; }

  /**
   * 이름표 자리 (아래 · 위 · 오른쪽 · 왼쪽): 노드·랭크 인장·출발 표식·앞서 놓인 이름표·상단 바·정보 패널·화면 끝과 가장 덜 겹치는 곳.
   * 열린 노드부터 놓는다. 화면 크기·열린 노드·랭크·글꼴 세대가 바뀔 때만 다시 계산한다.
   * 어느 자리에 놓아도 다른 노드·이름표·지도 가장자리에 걸리는 이름표(좁은 UI 배율 화면)는 hidden — 그 노드를 골랐을 때만 맨 위에 그린다.
   */
  labels(L, page) {
    const pg = this.pages[page], P = this.state.progress;
    let key = `${L.W}|${L.H}|${L.my}|${L.mh}|${L.panelY}|${fontEpoch}|`;
    for (const n of pg.nodes) key += (this.isOpen(n) ? 'o' : '-') + (P.cleared?.[n.id]?.rank ? 'r' : '');
    const c = this._lab[page];
    if (c && c.key === key) return c;
    const m = measureCtx();
    if (m) m.font = font(14, 800, FONT.title);
    const wOf = (s) => (m ? Math.ceil(m.measureText(s).width) : s.length * 14) + 8;
    // [x, y, 점수 반지름, 겹침 한계(이보다 가까우면 그린 원 위에 글자가 얹힌다), 노드]
    const circles = [], xy = [];
    for (const n of pg.nodes) {
      const q = this.pos(n.stage.mapPos, L);
      xy.push(q); circles.push([q.x, q.y, 23, 19, n]);
      if (P.cleared?.[n.id]?.rank) circles.push([q.x + 17, q.y - 17, 11, 10, null]);
    }
    const sp = this.pos(PAGES[page].start, L);
    circles.push([sp.x, sp.y - 6, 26, 18, null]);
    const sw = wOf(PAGES[page].startName);
    const boxes = [{ x: sp.x - sw / 2, y: sp.y + 10, w: sw, h: 17 }];
    const map = new Map();
    // 열린 노드 먼저, 그중에서도 이웃이 많은(자리가 빡빡한) 노드부터
    const crowd = xy.map((q) => xy.reduce((a, o) => a + (Math.hypot(o.x - q.x, o.y - q.y) < 90 ? 1 : 0), -1));
    const order = pg.nodes.map((_, i) => i).sort((a, b) => (Number(this.isOpen(pg.nodes[b])) - Number(this.isOpen(pg.nodes[a]))) || crowd[b] - crowd[a]);
    for (const i of order) {
      const n = pg.nodes[i], q = xy[i], open = this.isOpen(n), R = 21, h = 17;
      const w = wOf(open ? n.stage.name ?? '' : '???');
      const up = P.cleared?.[n.id]?.rank ? 16 : 9, yUp = q.y - R - up - h + 4, yDn = q.y + R + 2;
      const cands = [
        { side: 'down', x: q.x - w / 2, y: yDn, pref: 0 },
        { side: 'up', x: q.x - w / 2, y: yUp, pref: 0.35 },
        { side: 'downR', x: q.x - 10, y: yDn, pref: 0.5 },
        { side: 'downL', x: q.x + 10 - w, y: yDn, pref: 0.55 },
        { side: 'right', x: q.x + R + 8, y: q.y - 9, pref: 0.7 },
        { side: 'upR', x: q.x - 10, y: yUp, pref: 0.75 },
        { side: 'left', x: q.x - R - 8 - w, y: q.y - 9, pref: 0.8 },
        { side: 'upL', x: q.x + 10 - w, y: yUp, pref: 0.85 },
      ];
      let best = cands[0], bs = Infinity;
      for (const cd of cands) {
        const b = { x: cd.x, y: cd.y, w, h };
        let s = cd.pref;
        for (const [cx, cy, r] of circles) { const d = boxDist(b, cx, cy); if (d < r) s += 1.5 + 2 * (1 - d / r); }
        for (const o of boxes) { const ov = boxOverlap(b, o); if (ov > 0) s += 2 + ov / 120; }
        if (b.y < L.TB + 4) s += 5;
        if (b.y + h > L.panelY - 2) s += 5;
        if (b.x < 4 || b.x + w > L.W - 4) s += 5;
        if (s < bs) { bs = s; best = cd; }
      }
      const box = { x: best.x, y: best.y, w, h, side: best.side, hidden: false };
      let clean = !(box.y < L.TB + 2 || box.y + h > L.panelY - 2 || box.x < 2 || box.x + w > L.W - 2);
      for (const [cx, cy, , hard, cn] of circles) if (clean && cn !== n && boxDist(box, cx, cy) < hard) clean = false;
      for (const o of boxes) if (clean && boxOverlap(box, o) > 4) clean = false;
      box.hidden = !clean;
      map.set(n.id, box);
      if (open && clean) boxes.push(box);
    }
    return (this._lab[page] = { key, map, boxes });
  }

  /**
   * 말(현재 캐릭터 초상화 표식)의 자리. 반환값은 this.tok 좌표계(표식 원 중심 + 42).
   * 노드 위 → 왼쪽 → 오른쪽 → 대각선 후보 중 다른 노드·랭크 인장·이름표·상단 바·정보 패널과 가장 덜 겹치는 곳.
   */
  tokenSpot(n, L, page) {
    const lab = this.labels(L, page);
    let cache = this._tk[page];
    if (!cache || cache.key !== lab.key) cache = this._tk[page] = { key: lab.key, m: new Map() };
    if (!cache.m.has(n.id)) {
      const P = this.state.progress, q = this.pos(n.stage.mapPos, L), TR = 19;
      const obst = [];
      for (const o of this.pages[page].nodes) {
        const qo = this.pos(o.stage.mapPos, L);
        if (o !== n) obst.push([qo.x, qo.y, 22]);
        if (P.cleared?.[o.id]?.rank) obst.push([qo.x + 17, qo.y - 17, 11]);
      }
      const sp = this.pos(PAGES[page].start, L); obst.push([sp.x, sp.y - 4, 28]);
      const cands = [[0, -44, 0], [-50, -8, 0.3], [50, -8, 0.4], [-40, -34, 0.6], [42, -38, 0.7], [-62, -24, 0.9], [62, -24, 1], [0, -58, 1.1]];
      // 좁은 화면에서 위 자리가 모두 막히면: 노드 둘레(위쪽 우선)에서 빈 곳을 찾는다
      for (let k = 0; k < 16; k++) {
        const a = -Math.PI / 2 + (k * TAU) / 16;
        for (const r of [46, 62]) cands.push([Math.cos(a) * r, Math.sin(a) * r, 1.2 + 0.8 * ((1 + Math.sin(a)) / 2) + (r > 50 ? 0.3 : 0)]);
      }
      const own = lab.map.get(n.id);
      let best = null, bestS = Infinity;
      for (const [dx, dy, pref] of cands) {
        const cx = q.x + dx, cy = q.y + dy;
        let sc = pref;
        for (const [ox, oy, r] of obst) { const d = Math.hypot(cx - ox, cy - oy); if (d < TR + r) sc += 4 * (1 - d / (TR + r)) + 1; }
        // 이름표를 가리지 않게 (자기 이름표는 특히)
        for (const b of lab.boxes) if (cx + TR > b.x && cx - TR < b.x + b.w && cy + TR > b.y && cy - TR < b.y + b.h) sc += b === own ? 6 : 3;
        if (own && !lab.boxes.includes(own) && cx + TR > own.x && cx - TR < own.x + own.w && cy + TR > own.y && cy - TR < own.y + own.h) sc += 6;
        if (cy - TR < L.TB + 4 || cx - TR < 4 || cx + TR > L.W - 4 || cy + TR > L.panelY - 2) sc += 6;
        if (sc < bestS) { bestS = sc; best = { x: cx, y: cy + 42 }; }
      }
      cache.m.set(n.id, best);
    }
    return cache.m.get(n.id);
  }

  // ───────────────────────── 갱신 ─────────────────────────
  update(dt) {
    if (this.redirect) return;
    const L = this.layout();
    this.fx.update(dt, null);
    if (this.xfade && (this.xfade.t += dt) >= XFADE) this.xfade = null;
    if (this.reveal) { this.updateReveal(dt, L); return; }
    if (this.depart) { this.depart.t += dt; if (this.depart.t > 0.55 && !this.depart.gone) { this.depart.gone = true; this.launch(this.depart.id); } return; }
    if (this.closing) return;
    // 고른 스테이지의 배경 음악을 미리 받는다 (녹음 음원, 장면을 막지 않음 — core/audio_rec.js)
    const pf = this.cur();
    if (pf && pf !== this._pfNode) { this._pfNode = pf; if (this.isOpen(pf)) audio.prefetch?.(pf.arena ? 'arena' : pf.stage?.music); }
    // 지도 전환 (두 장뿐이라 어느 쪽 키든 맞은편 지도로)
    if (this.pages[1] && PAGE_KEYS.some((a) => input.pressed(a))) { this.setPage(1 - this.page); return; }
    const nodes = this.nodes, n = nodes.length;
    const mv = (d) => { if (!n) return; this.index = (this.index + d + n) % n; audio.sfx('menu_move'); };
    if (input.pressed('left') || input.pressed('up')) mv(-1);
    if (input.pressed('right') || input.pressed('down')) mv(1);
    const hit = taps.hit(this);
    if (hit != null) {
      if (hit === 'close') { this.close(); return; }
      if (hit === 'go') { this.start(); return; }
      if (hit === 'tab0' || hit === 'tab1') { this.setPage(hit === 'tab1' ? 1 : 0); return; }
      if (typeof hit === 'string' && hit.startsWith('node:')) {
        const i = this.nearestNode(Number(hit.slice(5)), L);
        if (i === this.index) this.start();
        else if (nodes[i]) { this.index = i; audio.sfx('menu_move'); }
        return;
      }
    }
    if (input.pressed('confirm')) { this.start(); return; }
    if (input.pressed('cancel') || (input.pressed('menu') && !input.pressed('confirm'))) { this.close(); return; }
    // 말 이동 (다른 노드·랭크 인장·이름표를 덜 가리는 자리에 선다)
    const cn = this.cur();
    if (cn) {
      const tp = this.tokenSpot(cn, L, this.page);
      if (!this.tok) this.tok = { x: tp.x, y: tp.y };
      const k = 1 - Math.pow(0.0005, dt);
      this.tok.x = lerp(this.tok.x, tp.x, k); this.tok.y = lerp(this.tok.y, tp.y, k);
    }
  }
  /** 이웃 노드의 탭 영역이 겹칠 때(좁은 UI 배율 화면): 맨 위에 등록된 영역 대신 포인터에 가장 가까운 노드 */
  nearestNode(i, L) {
    const p = input.pointer;
    let best = i, bd = Infinity;
    this.nodes.forEach((n, j) => { const q = this.pos(n.stage.mapPos, L), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = j; } });
    return bd <= 40 ? best : i;
  }
  updateReveal(dt, L) {
    const R = this.reveal; R.t += dt;
    const n = this.cur();
    if (n) {
      const p = this.pos(n.stage.mapPos, L);
      if (R.t < 2 && Math.random() < 0.7) this.fx.emit(R.fx, p.x + rand(-30, 30), p.y + rand(-20, 20), { speed: 80, ...(R.fx === 'dark' ? {} : { color: R.pcol }) });
      if (!R.boom && R.t > 1.3) {
        R.boom = true;
        audio.sfx('thunderclap');
        this.game.flash(R.color, 0.8, 2);
        this.fx.burst('magic', p.x, p.y, 60, { color: R.pcol, speed: 300 });
        this.fx.ring(p.x, p.y, { color: R.color, r0: 10, r1: 220, life: 0.8, width: 8 });
      }
    }
    if (R.t > 3.2 || (R.t > 0.8 && (input.pressed('confirm') || input.pointer.tapped))) this.endReveal();
  }
  /** 닫기: 보통은 마을 위에 쌓여 있으니 pop. 이 장면만 있으면(주소로 바로 연 경우) 마을로 (P-26) */
  close() {
    if (this.closing) return;
    this.closing = true;
    audio.sfx('menu_cancel');
    const g = this.game;
    const alone = g.scenes.length <= 1 || g.scenes[0] === this;
    if (alone && g.registry.hub) g.go('hub', { from: 'worldmap' });
    else g.pop();
  }
  reqText(n) {
    if (n.missing && this.state.progress.unlocked.includes(n.id)) return MISSING_REQ;
    return n.stage.req ?? '이전 스테이지를 클리어하면 열린다.';
  }

  start() {
    const n = this.cur(), g = this.game;
    if (!n) return;
    if (!this.isOpen(n)) { audio.sfx('menu_cancel'); this.toastOnce(this.reqText(n), '#ff8a7a'); return; }
    if (n.arena && !g.registry.arcade) { audio.sfx('menu_cancel'); this.toastOnce('투기장의 문은 아직 굳게 닫혀 있다…', '#c8b8a0'); return; }
    audio.sfx('go'); audio.sfx('menu_ok');
    const p = this.pos(n.stage.mapPos);
    if (this.page === 1) {
      const c = n.stage.color ?? '#b060ff';
      this.fx.burst('magic', p.x, p.y, 24, { speed: 160, color: c });
      this.fx.ring(p.x, p.y, { color: c, r0: 10, r1: 120, life: 0.5, width: 6 });
    } else {
      this.fx.burst('fire', p.x, p.y, 24, { speed: 160 });
      this.fx.ring(p.x, p.y, { color: '#ff4a5a', r0: 10, r1: 120, life: 0.5, width: 6 });
    }
    this.depart = { t: 0, id: n.id };
    // 출발 연출·도입 이야기 동안 그 스테이지 보스 조각을 미리 받는다 (R1-REQ-229 / 요청 #381 (3); 스테이지 입장 때도 다시 부르지만 멱등)
    if (!n.arena) { try { preloadStageBosses(n.id)?.catch?.(() => null); } catch (e) { console.warn(e); } }
    this.saveNow();
  }
  /**
   * 같은 알림이 아직 떠 있으면 새로 쌓지 않고 그 알림을 다시 온전히 보이게 늘린다
   * (잠긴 노드에서 결정·더블탭을 연타하면 같은 문장이 다섯 줄로 쌓여 지도를 가렸다)
   */
  toastOnce(msg, color) {
    const g = this.game, t = g.toasts?.find((q) => q.text === msg && q.t > 0.3);
    if (t) { t.t = Math.max(t.t, t.max - 1 / 6); return; }
    g.toast(msg, color);
  }
  launch(id) {
    const g = this.game, st = this.state;
    if (id === 'arena') { g.go('arcade', { from: 'worldmap' }); return; }
    const stage = STAGES[id];
    if (!stage) return;
    st.lastStage = { stageId: id, roomId: null };
    const intro = stage.intro;
    const seen = st.progress.seenScripts?.includes(intro);
    if (g.registry.story && intro && SCRIPTS[intro] && !seen) {
      st.progress.seenScripts.push(intro);
      g.go('story', { script: intro, then: 'stage', thenParams: { stageId: id }, bg: stage.bg });
    } else g.go('stage', { stageId: id });
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    const L = this.layout(), { W, H } = L;
    if (this.redirect) { ctx.fillStyle = '#05020a'; ctx.fillRect(0, 0, W, H); return; }
    let zoom = 1;
    if (this.depart) zoom = 1 + ease.inCubic(Math.min(1, this.depart.t / 0.55)) * 0.35;
    ctx.save();
    const cn = this.cur();
    if (zoom > 1 && cn) { const p = this.pos(cn.stage.mapPos, L); ctx.translate(p.x, p.y); ctx.scale(zoom, zoom); ctx.translate(-p.x, -p.y); }
    this.drawMap(ctx, L, this.page, this.index, true);
    if (this.xfade) this.drawXfade(ctx, L);
    this.fx.draw(ctx, 'back'); this.fx.draw(ctx, 'front');
    ctx.restore();
    this.topBar(ctx, L);
    this.info(ctx, L);
    if (!L.touch) this.hints(ctx, L);
    if (this.reveal) this.drawReveal(ctx, L);
    if (this.depart) {
      ctx.fillStyle = this.page === 1 ? `rgba(50,0,90,${Math.min(0.5, this.depart.t)})` : `rgba(120,0,20,${Math.min(0.5, this.depart.t)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** 지도 한 장 (배경 · 경로 · 출발 표식 · 노드 · 이름표 · 말). live = 지금 보이는 지도 (탭 영역 등록, 말) */
  drawMap(ctx, L, page, sel, live) {
    const PG = PAGES[page], pg = this.pages[page], t = this.t, { W, H } = L;
    drawCover(ctx, assets.get(PG.bg), W, H, { fallback: PG.fallback });
    ctx.fillStyle = page === 0 ? 'rgba(40,20,10,0.18)' : 'rgba(10,4,20,0.25)'; ctx.fillRect(0, 0, W, H);
    // 가장자리 그을림 (1부) · 보랏빛 비네트 (2부) — core/ui vignette 와 같은 모양, 크기마다 한 번만 만든다
    const [va, vc] = page === 0 ? [0.75, '20,8,4'] : [0.8, '46,10,80'];
    ctx.fillStyle = cachedGrad(ctx, `vig|${page}|${W}|${H}`, () => {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      g.addColorStop(0, `rgba(${vc},0)`); g.addColorStop(1, `rgba(${vc},${va})`);
      return g;
    });
    ctx.fillRect(0, 0, W, H);
    const sp = this.pos(PG.start, L);
    for (const k of pg.links) {
      const a = k.a ? this.pos(k.a.stage.mapPos, L) : sp, b = this.pos(k.b.stage.mapPos, L);
      this.path(ctx, L, page, a, b, k.always || this.isOpen(k.b), t, k.col ?? PG.path, k.seed, k.wide ?? 1, !!k.side);
    }
    if (page === 0) this.village(ctx, sp.x, sp.y); else this.gate(ctx, sp.x, sp.y, t);
    const lab = this.labels(L, page);
    // 말이 설 자리 (좁은 화면에서 빈 곳이 없으면 그 밑에 깔린 다른 이름표는 반쯤 가려 읽을 수 없으므로 그리지 않는다)
    const tsn = live && !this.reveal ? pg.nodes[sel] : null, ts = tsn ? this.tokenSpot(tsn, L, page) : null;
    // 노드 탭 영역: 52 px, 휴대폰에서는 CSS 46 px 이상 (이웃 노드와 겹치면 여유가 붙지 않으므로 영역 자체가 §6.3 최소를 넘어야 한다;
    //   겹친 곳을 누르면 nearestNode 가 가장 가까운 노드를 고른다)
    const nh = live ? Math.max(26, Math.ceil(46 / Math.max(0.2, (this.game.cssScale || 1) * (this.game.uiK || 1)) / 2)) : 26;
    for (let i = 0; i < pg.nodes.length; i++) {
      const n = pg.nodes[i], box = lab.map.get(n.id);
      const under = ts && i !== sel && box && boxDist(box, ts.x, ts.y - 42) < 14;
      this.node(ctx, L, page, n, i === sel, under ? null : box);
      if (live) {
        const p = this.pos(n.stage.mapPos, L);
        taps.add('node:' + i, { x: p.x - nh, y: p.y - nh, w: nh * 2, h: nh * 2 }, { kind: 'icon', owner: this, src: 'worldmap' });
      }
    }
    // 고른 노드의 이름표는 맨 위에 (좁은 화면에서 평소엔 숨기는 이름표도 이때는 보인다)
    const sn = pg.nodes[sel], sb = sn && lab.map.get(sn.id);
    if (sb) this.nodeLabel(ctx, PG, this.isOpen(sn) ? sn.stage.name ?? '' : '???', sb, true);
    if (live && this.tok && !this.reveal) this.token(ctx, this.tok.x, this.tok.y - 42 - Math.abs(Math.sin(t * 3)) * 5);
  }
  /** 지도 전환: 이전 지도를 한 번 오프스크린에 그려 두고 0.35초 동안 흐려지게 겹친다 */
  drawXfade(ctx, L) {
    const X = this.xfade;
    if (X.snap === null) X.snap = this.snapshot(ctx, L, X.from, X.fromIndex) || false;
    const a = 1 - clamp(X.t / XFADE, 0, 1);
    if (!X.snap || a <= 0) return;
    ctx.save(); ctx.globalAlpha = a; ctx.drawImage(X.snap, 0, 0, L.W, L.H); ctx.restore();
  }
  snapshot(ctx, L, page, sel) {
    if (!this.pages[page] || typeof document === 'undefined') return null;
    try {
      const k = clamp((ctx.getTransform?.().a ?? 1) * 0.6, 0.5, 1);
      const w = Math.max(1, Math.ceil(L.W * k)), h = Math.max(1, Math.ceil(L.H * k));
      const c = this._snap || (this._snap = document.createElement('canvas'));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const o = c.getContext('2d');
      o.setTransform(k, 0, 0, k, 0, 0);
      o.clearRect(0, 0, L.W, L.H);
      this.drawMap(o, L, page, sel, false);
      return c;
    } catch (e) { console.warn('[worldmap] snapshot', e); return null; }
  }

  path(ctx, L, page, a, b, open, t, col, seed, wide = 1, side = false) {
    let mx = (a.x + b.x) / 2 + Math.sin(seed * 2.3) * 22, my = (a.y + b.y) / 2 + Math.cos(seed * 1.7) * 18;
    if (side) {
      // 외전 갈림길: 나선 대신 위로 살짝 휘어 오른다 (아래를 지나는 나선 길과 겹치지 않게)
      mx = (a.x + b.x) / 2; my = Math.min(a.y, b.y) - 14;
    } else if (page === 1) {
      // 나선: 조절점을 중심에서 바깥쪽으로 밀어 길이 공허를 감싸 돌게 한다
      const c = this.pos(P2_CENTER, L), ax = (a.x + b.x) / 2 - c.x, ay = (a.y + b.y) / 2 - c.y, d = Math.hypot(ax, ay) || 1;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      mx = (a.x + b.x) / 2 + (ax / d) * len * 0.2; my = (a.y + b.y) / 2 + (ay / d) * len * 0.2;
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
    if (open) {
      ctx.strokeStyle = page === 1 ? 'rgba(200,170,255,0.22)' : 'rgba(240,225,190,0.55)'; ctx.lineWidth = 7 * wide; ctx.setLineDash([]); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3.2 * wide; ctx.setLineDash([2, 9]); ctx.lineDashOffset = -t * 22; ctx.stroke();
      if (wide > 1) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba('#b060ff', 0.25 + Math.sin(t * 3) * 0.1); ctx.lineWidth = 10; ctx.setLineDash([]); ctx.stroke(); }
    } else {
      ctx.strokeStyle = page === 1 ? 'rgba(190,170,230,0.25)' : 'rgba(60,40,20,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([1, 8]); ctx.stroke();
    }
    ctx.restore();
  }

  village(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(240,225,190,0.7)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 26, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK;
    for (const [dx, s] of [[-12, 0.8], [0, 1], [12, 0.85]]) {
      ctx.fillRect(x + dx - 6 * s, y - 8 * s, 12 * s, 10 * s);
      ctx.beginPath(); ctx.moveTo(x + dx - 8 * s, y - 8 * s); ctx.lineTo(x + dx, y - 16 * s); ctx.lineTo(x + dx + 8 * s, y - 8 * s); ctx.fill();
    }
    ctx.fillStyle = '#ffb45a'; ctx.fillRect(x - 2, y - 5, 3, 3);
    text(ctx, PAGES[0].startName, x, y + 22, { size: 12, weight: 800, family: FONT.title, align: 'center', color: INK, outline: 'rgba(240,225,190,0.9)', ow: 3 });
    ctx.restore();
  }
  /** 에슈빌 균열문: 돌 아치 안에서 보랏빛 틈이 일렁인다 */
  gate(ctx, x, y, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y - 12, 50, '#b060ff', 0.35 + Math.sin(t * 2) * 0.08);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(x, y + 7, 26, 7, 0, 0, TAU); ctx.fill();
    const arch = (r) => { ctx.beginPath(); ctx.moveTo(x - r, y + 6); ctx.lineTo(x - r, y - 12); ctx.arc(x, y - 12, r, Math.PI, 0); ctx.lineTo(x + r, y + 6); ctx.closePath(); };
    arch(17); ctx.fillStyle = '#2a2236'; ctx.fill(); ctx.strokeStyle = '#a898c8'; ctx.lineWidth = 1.5; ctx.stroke();
    const g = cachedGrad(ctx, 'gate', () => {
      const lg = ctx.createLinearGradient(0, -26, 0, 6);
      lg.addColorStop(0, '#f0d8ff'); lg.addColorStop(0.5, '#b060ff'); lg.addColorStop(1, '#3a0a6a');
      return lg;
    });
    ctx.save(); ctx.fillStyle = g; ctx.translate(x, y); ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(-10, -12); ctx.arc(0, -12, 10, Math.PI, 0); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.strokeStyle = `rgba(255,245,255,${0.7 + Math.sin(t * 5) * 0.25})`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x + 1, y - 21); ctx.lineTo(x - 3, y - 12); ctx.lineTo(x + 3, y - 6); ctx.lineTo(x - 1, y + 4); ctx.stroke();
    text(ctx, PAGES[1].startName, x, y + 24, { size: 12, weight: 800, family: FONT.title, align: 'center', color: PAGES[1].label, outline: PAGES[1].outline, ow: 3 });
    ctx.restore();
  }

  node(ctx, L, page, n, sel, box) {
    const P = this.state.progress, t = this.t, PG = PAGES[page];
    const p = this.pos(n.stage.mapPos, L);
    const open = this.isOpen(n), rec = P.cleared?.[n.id];
    const R = sel ? 21 : 17;
    const col = page === 1 ? n.stage.color ?? '#b060ff' : null;
    ctx.save();
    if (n.side) {
      // 외전: 천천히 도는 점선 고리 (이계 Ⅱ 는 그 외전의 색, 악마성 Ⅰ 양피지는 1부 길 잉크)
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 0.5);
      ctx.strokeStyle = rgba(col ?? PG.path, page === 1 ? 0.75 : 0.85); ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(0, 0, R + 5, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (page === 1 && n.id === 's20') {
      // 태초의 공허: 하얗게 맥동
      const k = 0.5 + 0.5 * Math.sin(t * 2.4);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, p.x, p.y, 44 + k * 16, '#ffffff', open ? 0.3 + k * 0.35 : 0.1 + k * 0.12);
      ctx.restore();
    }
    if (sel) {
      const gc = page === 1 ? col : n.id === 's13' ? '#b060ff' : '#ffb040';
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, p.x, p.y, 62, gc, 0.45 + Math.sin(t * 4) * 0.1); ctx.restore();
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 0.8);
      ctx.strokeStyle = page === 1 ? '#e8dcff' : '#e8c872'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.beginPath(); ctx.arc(0, 0, R + 9, 0.15, TAU / 4 - 0.15); ctx.stroke(); }
      ctx.restore();
    }
    // 그림자
    ctx.fillStyle = page === 1 ? 'rgba(0,0,0,0.5)' : 'rgba(40,20,10,0.35)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + R * 0.7, R * 0.9, R * 0.35, 0, 0, TAU); ctx.fill();
    // 인장 몸체
    const kind = n.arena ? 'arena' : !open ? `lock${page}` : rec ? 'gold' : page === 1 ? `c${col}` : n.id === 's13' ? 's13' : 'red';
    const g = cachedGrad(ctx, `seal|${kind}|${R}`, () => {
      const rg = ctx.createRadialGradient(-R * 0.35, -R * 0.4, 2, 0, 0, R);
      const stops = kind === 'arena' ? [[0, '#8a8a9a'], [1, '#2a2a36']]
        : kind === 'lock1' ? [[0, '#6e6880'], [1, '#221e2c']]
          : kind === 'lock0' ? [[0, '#8a8278'], [1, '#3a342e']]
            : kind === 'gold' ? [[0, '#ffe7a0'], [0.6, '#c8a040'], [1, '#6a4a10']]
              : kind === 's13' ? [[0, '#e0a0ff'], [0.6, '#7a20c0'], [1, '#2a0840']]
                : kind === 'red' ? [[0, '#ff6a7a'], [0.6, '#a01020'], [1, '#3a0408']]
                  : [[0, shade(col, 0.55)], [0.6, shade(col, -0.35)], [1, shade(col, -0.82)]];
      for (const [o, c] of stops) rg.addColorStop(o, c);
      return rg;
    });
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = page === 1 ? (open ? 'rgba(10,4,20,0.95)' : 'rgba(10,4,20,0.6)') : open ? '#1a0a04' : 'rgba(30,20,10,0.6)';
    ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgba('#ffffff', open ? 0.35 : 0.15); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, R - 3, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
    // 문양
    if (n.arena) {
      ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(p.x - 8, p.y + 8); ctx.lineTo(p.x + 8, p.y - 8); ctx.moveTo(p.x + 8, p.y + 8); ctx.lineTo(p.x - 8, p.y - 8); ctx.stroke();
    } else if (!open) {
      const lc = page === 1 ? 'rgba(10,6,20,0.85)' : 'rgba(30,20,14,0.8)';
      ctx.fillStyle = lc; ctx.fillRect(p.x - 6, p.y - 2, 12, 9);
      ctx.strokeStyle = lc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 3, 4.5, Math.PI, 0); ctx.stroke();
    } else {
      const numCol = rec ? '#3a2006' : page === 1 ? '#ffffff' : '#ffe7a0';
      const size = page === 1 ? (sel ? 13 : 11) : sel ? 14 : 12;
      // 외전 노드는 장 번호 대신 '외전'
      if (n.side) text(ctx, '외전', p.x, p.y + 4, { size: sel ? 12 : 10, weight: 900, family: FONT.title, align: 'center', color: numCol, outline: rec ? 'rgba(255,240,200,0.6)' : 'rgba(0,0,0,0.7)', ow: 2, maxWidth: R * 1.7 });
      else text(ctx, ROMAN[n.stage.chapter] ?? '', p.x, p.y + 5, { size, weight: 900, family: FONT.num, align: 'center', color: numCol, outline: rec ? 'rgba(255,240,200,0.6)' : 'rgba(0,0,0,0.7)', ow: 2, maxWidth: R * 1.7 });
    }
    // 랭크 인장
    if (rec?.rank) {
      const bx = p.x + R * 0.8, by = p.y - R * 0.8;
      ctx.fillStyle = '#1a0a08'; ctx.beginPath(); ctx.arc(bx, by, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = RANK_COL[rec.rank] ?? '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      text(ctx, rec.rank, bx, by + 4, { size: rec.rank.length > 1 ? 8 : 11, weight: 900, family: FONT.num, align: 'center', color: RANK_COL[rec.rank] ?? '#fff', ow: 0 });
    }
    // 유물 표식 (1부) · 별의 조각 / 세계의 심장 표식 (2부)
    if (page === 0 && n.stage.relic && open) {
      const has = P.relics?.includes(n.stage.relic);
      ctx.fillStyle = has ? '#ff3050' : 'rgba(90,10,20,0.6)'; ctx.beginPath(); ctx.moveTo(p.x - R * 0.9, p.y + R * 0.4); ctx.lineTo(p.x - R * 0.9 - 5, p.y + R * 0.4 + 7); ctx.lineTo(p.x - R * 0.9 + 5, p.y + R * 0.4 + 7); ctx.closePath(); ctx.fill();
    }
    if (page === 1 && open && !n.missing) {
      if (n.stage.shard) this.star(ctx, p.x - R * 0.85, p.y + R * 0.6, 4.5, P.shards?.includes(n.stage.shard) ? '#ffe070' : 'rgba(150,130,190,0.65)');
      if (n.stage.heart) {
        const has = P.hearts?.includes(n.stage.heart);
        ctx.fillStyle = has ? col : 'rgba(40,30,60,0.8)'; ctx.strokeStyle = has ? '#ffffff' : 'rgba(150,130,190,0.65)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x + R * 0.85, p.y + R * 0.6, 3.6, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }
    // 이름 (고른 노드는 drawMap 이 모든 노드 뒤에 그린다)
    if (open && !sel && box && !box.hidden) this.nodeLabel(ctx, PG, n.stage.name ?? '', box, false);
    ctx.restore();
  }
  nodeLabel(ctx, PG, label, box, sel) {
    const o = { size: sel ? 14 : 12, weight: 800, family: FONT.title, color: sel ? PG.labelSel : PG.label, outline: PG.outline, ow: 4 };
    const by = box.y + 13;
    if (box.side === 'right') text(ctx, label, box.x + 4, by, { ...o, align: 'left' });
    else if (box.side === 'left') text(ctx, label, box.x + box.w - 4, by, { ...o, align: 'right' });
    else text(ctx, label, box.x + box.w / 2, by, { ...o, align: 'center' });
  }
  star(ctx, x, y, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i * TAU) / 8, rr = i % 2 ? r * 0.42 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  token(ctx, x, y) {
    const hero = currentHero(this.state), ch = CHARACTERS[hero?.charId];
    const img = ch ? assets.get(ch.portrait) : null;
    ctx.save();
    ctx.fillStyle = '#1a0a0c'; ctx.beginPath(); ctx.moveTo(x - 7, y + 14); ctx.lineTo(x, y + 26); ctx.lineTo(x + 7, y + 14); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fillStyle = '#12060c'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.clip();
    if (img) ctx.drawImage(img, x - 24, y - 14, 48, 48 * (img.height / img.width));
    ctx.restore();
    ctx.strokeStyle = this.page === 1 ? '#d8c0ff' : '#e8c872'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // ───────────────────────── 상단 바 ─────────────────────────
  topBar(ctx, L) {
    const { W } = L, PG = PAGES[this.page], two = !!this.pages[1];
    ctx.fillStyle = cachedGrad(ctx, `bar|${this.page}`, () => {
      const hg = ctx.createLinearGradient(0, 0, 0, 60);
      if (this.page === 1) { hg.addColorStop(0, 'rgba(8,3,16,0.94)'); hg.addColorStop(1, 'rgba(8,3,16,0.62)'); }
      else { hg.addColorStop(0, 'rgba(8,3,6,0.92)'); hg.addColorStop(1, 'rgba(8,3,6,0.6)'); }
      return hg;
    });
    ctx.fillRect(0, 0, W, 58);
    ctx.fillStyle = this.page === 1 ? 'rgba(190,150,255,0.5)' : 'rgba(232,200,114,0.5)'; ctx.fillRect(0, 57, W, 1.5);
    const tcol = this.page === 1 ? '#e0ccff' : '#f3d690';
    let x0, x1;
    if (!two) {
      // 2부가 없으면 예전 배치 그대로
      text(ctx, PG.title, 22, 38, { size: 26, weight: 800, family: FONT.title, color: tcol, ow: 4 });
      text(ctx, PG.sub, 118, 37, { size: 12, weight: 800, family: FONT.num, color: '#8a7a64' });
      x0 = 300; x1 = W - 150;
    } else {
      text(ctx, PG.title, 22, 31, { size: 24, weight: 800, family: FONT.title, color: tcol, ow: 4 });
      text(ctx, PG.sub, 23, 50, { size: 11, weight: 800, family: FONT.num, color: this.page === 1 ? '#8a7aa4' : '#8a7a64' });
      const tx = this.tabX(L);
      this.tabRects = [];
      for (let p = 0; p < 2; p++) {
        const r = { x: tx + p * (TAB_W + TAB_GAP), y: 12, w: TAB_W, h: 34 };
        this.tabRects.push(r);
        uiButton(ctx, r, PAGES[p].tab, { selected: p === this.page, size: 14, color: p === this.page ? undefined : '#9d8f80' });
        taps.add('tab' + p, r, { kind: 'primary', owner: this, src: 'worldmap' });
      }
      x0 = tx + 2 * TAB_W + TAB_GAP + 12; x1 = W - 74;
    }
    if (this.page === 0) this.relicBar(ctx, x0, x1); else this.heartBar(ctx, x0, x1);
    this.closeRect = { x: W - 64, y: 9, w: 52, h: 40 };
    uiButton(ctx, this.closeRect, '✕', { size: 20 });
    taps.add('close', this.closeRect, { kind: 'icon', owner: this, src: 'worldmap' });
  }
  /** 탭 x: 넓으면 명세 자리(250), 좁으면 제목 바로 옆 */
  tabX(L) {
    if (L.W >= 900) return 250;
    if (this._tabX?.e === fontEpoch) return this._tabX.x;   // 글자 폭은 글꼴이 도착할 때만 다시 잰다
    const m = measureCtx();
    let tw = 110;
    if (m) {
      m.font = font(24, 800, FONT.title); tw = Math.max(m.measureText(PAGES[0].title).width, m.measureText(PAGES[1].title).width);
      m.font = font(11, 800, FONT.num); tw = Math.max(tw, m.measureText(PAGES[0].sub).width, m.measureText(PAGES[1].sub).width);
    }
    const x = Math.round(Math.max(150, 22 + tw + 16));
    this._tabX = { e: fontEpoch, x };
    return x;
  }
  /** 드라큘라의 유물 5칸 (오른쪽 끝 = x1 에 맞춘다; 자리가 모자라면 간격을 줄이고 이름을 뺀다) */
  relicBar(ctx, x0, x1) {
    const P = this.state.progress, t = this.t, N = RELICS.length;
    const countX = x1 - 26, n = P.relics?.length ?? 0;
    const labelW = 104;
    let pitch = 34;
    const need = (pp, lab) => 32 + (N - 1) * pp + 14 + (lab ? labelW : 0);
    let showLabel = countX - need(34, true) >= x0;
    if (!showLabel) pitch = clamp((countX - 32 - 14 - x0) / (N - 1), 26, 34);
    const last = countX - 32, first = last - (N - 1) * pitch, r = pitch >= 32 ? 14 : 12;
    if (showLabel) text(ctx, '드라큘라의 유물', first - 20, 36, { size: 12, weight: 700, color: '#c8b8a0', align: 'right' });
    RELICS.forEach((id, i) => {
      const has = P.relics?.includes(id);
      const cx = first + i * pitch, cy = 30;
      ctx.fillStyle = has ? 'rgba(120,10,24,0.85)' : 'rgba(10,4,10,0.7)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = has ? '#ff6a7a' : '#4a3a30'; ctx.lineWidth = 1.5; ctx.stroke();
      if (has) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, cy, r + 8, '#ff3050', 0.4 + Math.sin(t * 3 + i) * 0.1); ctx.restore(); drawIcon(ctx, ITEMS[id]?.icon ?? `relic_${i + 1}`, cx, cy, r * 1.7); }
      else text(ctx, '?', cx, cy + 5, { size: 13, weight: 800, align: 'center', color: '#5a4a40', ow: 0 });
    });
    text(ctx, `${n}/${N}`, countX, 36, { size: 15, weight: 900, family: FONT.num, color: n >= N ? '#ff6a7a' : '#efe4cf' });
  }
  /** 세계의 심장 6칸 (얻은 것은 그 세계의 색) + 개수, 아래에 별의 조각 개수 */
  heartBar(ctx, x0, x1) {
    const P = this.state.progress, t = this.t, N = HEARTS.length;
    const countX = x1 - 26, n = HEARTS.filter((id) => P.hearts?.includes(id)).length;
    const shards = SHARDS.filter((id) => P.shards?.includes(id)).length;
    const labelW = 86;
    const pitch = clamp((countX - 30 - 12 - x0 - labelW) / (N - 1), 24, 30);
    const showLabel = countX - 30 - (N - 1) * pitch - 12 - labelW >= x0;
    const pitch2 = showLabel ? pitch : clamp((countX - 30 - 12 - x0) / (N - 1), 22, 30);
    const last = countX - 30, first = last - (N - 1) * pitch2, r = Math.min(13, pitch2 / 2 - 1), cy = 25;
    if (showLabel) text(ctx, '세계의 심장', first - r - 8, 30, { size: 12, weight: 700, color: '#c8b8e0', align: 'right' });
    HEARTS.forEach((id, i) => {
      const has = P.hearts?.includes(id);
      const c = STAGES[`s${14 + i}`]?.color ?? ITEMS[id]?.color ?? '#b060ff';
      const cx = first + i * pitch2;
      ctx.fillStyle = has ? rgba(c, 0.38) : 'rgba(10,4,16,0.72)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = has ? c : '#4a3a5a'; ctx.lineWidth = 1.5; ctx.stroke();
      if (has) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, cy, r + 8, c, 0.35 + Math.sin(t * 3 + i) * 0.1); ctx.restore(); drawIcon(ctx, ITEMS[id]?.icon ?? `wheart_${i + 1}`, cx, cy, r * 1.75); }
      else text(ctx, '?', cx, cy + 5, { size: 12, weight: 800, align: 'center', color: '#6a5a80', ow: 0 });
    });
    text(ctx, `${n}/${N}`, countX, 30, { size: 15, weight: 900, family: FONT.num, color: n >= N ? '#ffffff' : '#efe4ff' });
    text(ctx, `별의 조각 ${shards}/${SHARDS.length}`, (first + last) / 2, 52, { size: 11, weight: 700, align: 'center', color: shards >= SHARDS.length ? '#ffe070' : '#b8a8d8', ow: 2 });
  }

  // ───────────────────────── 정보 패널 ─────────────────────────
  info(ctx, L) {
    const { W } = L, st = this.state, P = st.progress, page = this.page;
    const n = this.cur();
    if (!n) return;
    const s = n.stage, open = this.isOpen(n), rec = P.cleared?.[n.id];
    const x = 14, y = L.panelY, w = W - 28, h = L.IH, cmp = h < 132;
    const glowC = page === 1 ? rgba(mix(s.color ?? '#b060ff', '#7a30ff', 0.5), 0.45) : n.id === 's13' ? 'rgba(160,60,255,0.5)' : 'rgba(180,20,40,0.35)';
    uiPanel(ctx, x, y, w, h, { glow: glowC });
    const Y = cmp ? [22, 50, 72, 97] : [26, 58, 84, 112];
    // 좁은 UI(UI 배율 1.3·1.5 의 16:9 화면 등, 패널 폭 < 860): 버튼·기록 칸을 줄이고 그만큼 수집 칸에 준다 (글자가 뭉개지지 않게)
    const narrow = w < 860;
    const bw = narrow ? 124 : Math.round(clamp(w * 0.19, 140, 190)), bh = cmp ? 60 : 64;
    const bx = x + w - bw - 16;
    const lw = narrow ? w * 0.31 - 44 : w * 0.36 - 24;
    // 제목
    const chapTxt = n.arena ? 'ARENA' : n.side ? 'SIDE STORY · 외전' : `CHAPTER ${ROMAN[s.chapter] ?? s.chapter}`;
    text(ctx, chapTxt, x + 24, y + Y[0], { size: 12, weight: 800, family: FONT.num, color: page === 1 ? '#c8b0ff' : n.id === 's13' ? '#d8a0ff' : '#c8a060' });
    text(ctx, open ? s.name : '??? — 봉인된 땅', x + 24, y + Y[1], { size: cmp ? 23 : 26, weight: 800, family: FONT.title, color: open ? (page === 1 ? '#efe4ff' : '#f3d690') : '#8a7a70', maxWidth: lw });
    const subSize = narrow ? 12 : 13;
    if (!open && !n.arena) {
      // 잠긴 노드: 적 레벨 줄이 비므로 해금 조건을 두 줄까지
      this.wrapLines(ctx, this.reqText(n), lw, subSize).forEach((ln, i) => text(ctx, ln, x + 24, y + Y[2 + i], { size: subSize, color: '#c8b8a0', maxWidth: lw }));
    } else text(ctx, s.sub ?? '', x + 24, y + Y[2], { size: subSize, color: '#c8b8a0', maxWidth: lw });
    const hero = currentHero(st);
    if (open && !n.arena) {
      const danger = (hero?.level ?? 1) < s.level - 2;
      text(ctx, `적 레벨 ${s.level}`, x + 24, y + Y[3], { size: 13, weight: 800, color: danger ? '#ff6a5a' : '#9d8f80' });
      if (danger) text(ctx, lw - 86 >= 150 ? '⚠ 위험 — 레벨을 더 올리자' : '⚠ 레벨을 더 올리자', x + 110, y + Y[3], { size: 12, weight: 700, color: '#ff8a6a', maxWidth: Math.max(60, lw - 86) });
    } else if (n.arena) text(ctx, '끝없이 몰려오는 적과 역대 보스에 도전한다', x + 24, y + Y[3], { size: 12, color: '#9d8f80', maxWidth: lw });
    // 기록 · 수집 (투기장은 없음)
    const rx = x + w * (narrow ? 0.31 : 0.38), rw = narrow ? 146 : Math.round(clamp(w * 0.17, 118, 160));
    const kx = rx + rw + 12, kw = bx - 14 - kx;
    const rkx = rx + (narrow ? 22 : 26), rtx = rx + (narrow ? 48 : 62);   // 랭크 글자 중심 · 시간/점수 x
    const line = page === 1 ? 'rgba(200,170,255,0.25)' : 'rgba(232,200,114,0.25)';
    ctx.fillStyle = line; ctx.fillRect(rx - 16, y + 16, 1.5, h - 32);
    if (!n.arena) {
      ctx.fillRect(kx - 10, y + 16, 1.5, h - 32);
      text(ctx, '최고 기록', rx, y + Y[0] + 2, { size: 12, weight: 700, color: '#9d8f80' });
      if (rec) {
        const rc = RANK_COL[rec.rank] ?? '#fff';
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, rkx, y + h * 0.58, 38, rc, 0.3); ctx.restore();
        text(ctx, rec.rank ?? '-', rkx, y + h * 0.72, { size: narrow ? 34 : cmp ? 38 : 44, weight: 900, family: FONT.logo, align: 'center', color: rc, ow: 5, maxWidth: narrow ? 46 : 58 });
        text(ctx, `시간  ${fmtTime(rec.time ?? 0)}`, rtx, y + h * 0.46, { size: 14, weight: 700, family: FONT.num, color: '#efe4cf', maxWidth: rx + rw - rtx });
        text(ctx, `점수  ${fmt(rec.score ?? 0)}`, rtx, y + h * 0.46 + 24, { size: 14, weight: 700, family: FONT.num, color: '#ffd84a', maxWidth: rx + rw - rtx });
      } else text(ctx, open ? '아직 클리어하지 않았다' : '—', rx, y + h * 0.5, { size: 13, color: '#8a7a70', maxWidth: rw });
      this.collect(ctx, n, kx, kw, cmp ? [y + 32, y + 62, y + 92] : [y + 36, y + 70, y + 104], narrow);
    }
    // 출발 버튼
    this.goRect = { x: bx, y: y + h / 2 - bh / 2, w: bw, h: bh };
    const can = open && (!n.arena || this.game.registry.arcade);
    ctx.save();
    if (can) { ctx.shadowColor = page === 1 ? `rgba(180,110,255,${0.4 + Math.sin(this.t * 4) * 0.2})` : `rgba(255,80,90,${0.4 + Math.sin(this.t * 4) * 0.2})`; ctx.shadowBlur = 18; }
    const again = can && !n.arena && !!rec;
    uiButton(ctx, this.goRect, can ? (n.arena ? '입장' : '출발!') : '잠김', { selected: can, disabled: !can, size: cmp && again ? 20 : 22, sub: again ? '다시 도전' : undefined });
    ctx.restore();
    taps.add('go', this.goRect, { kind: 'primary', owner: this, src: 'worldmap' });
  }
  /** 수집 칸: 비전서 + (1부) 유물 / (2부) 별의 조각 · 세계의 심장 — 공허(s20)는 여섯 세계의 합계 */
  collect(ctx, n, kx, kw, rows, narrow = false) {
    const P = this.state.progress, s = n.stage, page = this.page;
    const LW = narrow ? 62 : 74, vx = kx + LW, dim = '#9d8f80';
    const label = (str, by) => text(ctx, str, kx, by, { size: narrow ? 11 : 12, color: dim, maxWidth: LW - 6 });
    const value = (str, by, color, x = vx + 16) => text(ctx, str, x, by, { size: 12, weight: 700, color, maxWidth: Math.max(30, kx + kw - x) });
    // 비전서
    const docs = s.docs || [];
    const found = docs.filter((d) => P.docs?.includes(d)).length;
    label('비전서', rows[0]);
    docs.forEach((d, i) => { const has = P.docs?.includes(d); ctx.globalAlpha = has ? 1 : 0.3; drawIcon(ctx, 'doc', vx + 8 + i * 24, rows[0] - 5, 20); ctx.globalAlpha = 1; });
    if (!docs.length) value('없음', rows[0], '#6a5a50', vx);
    else value(`${found}/${docs.length}`, rows[0], found === docs.length ? '#8ae0a0' : '#c8b8a0', vx + 2 + docs.length * 24);
    if (n.side) {
      // 외전: 유물·세계의 심장·별의 조각 대신 이야기 안내와 동료 (합류했으면 이름) — s21 아르겐 · s22 무닌
      const si = SIDE_INFO[n.id] ?? {}, got = !!(si.flag && P.flags?.[si.flag]);
      label('외전', rows[1]);
      value('2부 엔딩 그 뒤의 이야기', rows[1], si.col ?? '#c8e4ff', vx);
      label('동료', rows[2]);
      value(got ? si.got ?? '' : si.wait ?? '', rows[2], got ? si.gotCol ?? '#ffffff' : page === 1 ? '#8a7aa0' : '#a08a7a', vx);
      return;
    }
    if (page === 0) {
      if (!s.relic) return;
      const has = P.relics?.includes(s.relic);
      label('유물', rows[1]);
      ctx.globalAlpha = has ? 1 : 0.35; drawIcon(ctx, ITEMS[s.relic]?.icon ?? 'relic_1', vx + 8, rows[1] - 5, 22); ctx.globalAlpha = 1;
      value(has ? ITEMS[s.relic]?.name ?? '' : '어딘가에 잠들어 있다', rows[1], has ? '#ff8a9a' : '#8a6a6a');
      return;
    }
    if (n.id === 's20' || (!s.shard && !s.heart)) {
      const sh = SHARDS.filter((id) => P.shards?.includes(id)).length, he = HEARTS.filter((id) => P.hearts?.includes(id)).length;
      label('별의 조각', rows[1]);
      ctx.globalAlpha = sh ? 1 : 0.35; drawIcon(ctx, 'star_shard', vx + 8, rows[1] - 5, 22); ctx.globalAlpha = 1;
      value(`${sh}/${SHARDS.length}`, rows[1], sh >= SHARDS.length ? '#ffe070' : '#c8b8e0');
      label('세계의 심장', rows[2]);
      ctx.globalAlpha = he ? 1 : 0.35; drawIcon(ctx, 'wheart_1', vx + 8, rows[2] - 5, 22); ctx.globalAlpha = 1;
      value(`${he}/${HEARTS.length}`, rows[2], he >= HEARTS.length ? '#ffffff' : '#c8b8e0');
      return;
    }
    if (s.shard) {
      const has = P.shards?.includes(s.shard);
      label('별의 조각', rows[1]);
      ctx.globalAlpha = has ? 1 : 0.35; drawIcon(ctx, ITEMS[s.shard]?.icon ?? 'star_shard', vx + 8, rows[1] - 5, 22); ctx.globalAlpha = 1;
      // 이름표가 이미 '별의 조각' 이므로 아이템 이름의 '별의 조각: ' 머리는 뺀다 (별의 조각: 거울 → 거울)
      const nm = String(ITEMS[s.shard]?.name ?? '').replace(/^별의 조각\s*[:：]\s*/, '');
      value(has ? nm : '어딘가에 숨어 있다', rows[1], has ? '#ffe070' : '#8a7aa0');
    }
    if (s.heart) {
      const has = P.hearts?.includes(s.heart), num = ITEMS[s.heart]?.worldHeart ?? (HEARTS.indexOf(s.heart) + 1);
      label('세계의 심장', rows[2]);
      ctx.globalAlpha = has ? 1 : 0.35; drawIcon(ctx, ITEMS[s.heart]?.icon ?? `wheart_${num}`, vx + 8, rows[2] - 5, 22); ctx.globalAlpha = 1;
      value(has ? '되찾았다' : '보스가 지니고 있다', rows[2], has ? s.color ?? '#ffffff' : '#8a7aa0');
    }
  }

  /** 두 줄까지 줄바꿈 (넘치면 둘째 줄에 몰아 maxWidth 로 줄인다). 글·폭·글꼴 세대가 같으면 캐시 — 매 프레임 재지 않는다 */
  wrapLines(ctx, str, maxW, size) {
    const key = `${str}|${Math.round(maxW)}|${size}|${fontEpoch}`;
    if (this._wrap?.key === key) return this._wrap.lines;
    let lines = wrap(ctx, str, maxW, size);
    if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')];
    this._wrap = { key, lines };
    return lines;
  }

  hints(ctx, L) {
    const items = [['dpadH', '스테이지'], ['confirm', '출발'], ['cancel', '마을로']];
    if (this.pages[1]) items.push([['prevTab', 'nextTab'], '지도 전환']);
    drawHints(ctx, items, L.W / 2, L.H - 8, { align: 'center', size: 11 });
  }

  drawReveal(ctx, L) {
    const { W, H } = L, R = this.reveal, t = R.t;
    const n = this.cur();
    if (!n) return;
    const p = this.pos(n.stage.mapPos, L);
    ctx.save();
    ctx.fillStyle = `rgba(10,0,20,${Math.min(0.55, t * 0.6)})`; ctx.fillRect(0, 0, W, H);
    // 균열
    const k = clamp(t / 1.3, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, p.x, p.y, 40 + k * 160, R.color, 0.3 + k * 0.5);
    ctx.strokeStyle = rgba(R.crack ?? (R.id === 's20' ? '#ffffff' : '#dca0ff'), k); ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3; let x = p.x, y = p.y; ctx.moveTo(x, y);
      for (let j = 1; j <= 4; j++) { x += Math.cos(a + Math.sin(i * 3 + j) * 0.6) * 22 * k; y += Math.sin(a + Math.cos(i * 2 + j) * 0.6) * 22 * k; ctx.lineTo(x, y); }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    if (t > 1.3) {
      const e = ease.outBack(Math.min(1, (t - 1.3) * 2.5));
      ctx.translate(W / 2, H * 0.36); ctx.scale(e, e);
      text(ctx, R.title, 0, 0, { size: 44, weight: 900, family: FONT.title, align: 'center', color: R.tcol, ow: 6, outline: '#1a0030', maxWidth: W - 40 });
      text(ctx, R.sub, 0, 36, { size: 16, weight: 700, align: 'center', color: '#f0e0ff', ow: 4, maxWidth: W - 40 });
    }
    ctx.restore();
  }
}
