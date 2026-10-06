// 회랑 「GALLERY」 엔진 (계약: docs/specs/gallery.md §3). main.js loadRest 가 import() 로 싣는다 (정적 import 금지 — 실패해도 게임은 그대로).
//  initGallery(game) → game.gal (§3.2 공개 API — 화면 scenes/front/gallery.js 는 이것만 쓴다)
//  - 기록은 계정(메타) 단위: game.meta.gal (core/gal_meta.js). 엔진은 그 객체를 붙잡아 두지 않는다 — cloud.applyMeta 가 메타 필드를 통째로 바꿔 끼운다
//  - 열림 = 데이터(data/gallery.js)의 need 토큰 중 하나라도 참 (§3.3). 증거 = 슬롯 1–3 + 지금 game.state 요약의 합집합 (회차 슬롯은 ng.past 포함) + 메타
//    아케이드 임시 세이브(state.arcade — 대본을 전부 본 것으로 표시)는 요약하지 않는다. 대사·컷신 코드에 기록 줄을 넣지 않는다 (옛 세이브도 같은 규칙으로 소급)
//  - 새로 열린 것이 있을 때만 cg/mus[id] = 지금 → saveMeta 한 번. 거두지 않는다 (슬롯을 지우거나 회차를 넘겨도 남는다). 알림·이벤트 없음
//  - 극장(th)은 저장하지 않는다 — 열 때마다 같은 증거 또는 그 줄의 CG(bg)가 걸렸는가로 판정 (슬롯을 지워도 잠기지 않는다). 'always' 항목도 저장하지 않는다 (has 가 늘 참)
//  - 계기 (§3.4): 부팅 뒤 한가할 때 rescan('retro') · 슬롯 쓰기(그 슬롯만 다시 요약, 0.5초 모아서) · 남의 메타 쓰기(캐시로 다시 판정) ·
//    cloud:sync done → rescan('cloud') · awakenCast → cutin_<영웅> 곧바로 (아케이드 포함) · 회랑 장면 enter → rescan('open') (캐시 + 지금 game.state)
//  - 2부 숨김 (§3.5): p2() 가 거짓이면 p2 항목을 목록·수·NEW 에서 뺀다
// 순수 export (node 시험 tools/test_gallery.mjs, DOM 없음): digestGal · gatherGal · evalNeed · scanGal · GAL_KINDS
import { bus } from '../core/events.js';
import { saves as SAVES } from '../core/save.js';
import { ensureGal } from '../core/gal_meta.js';
import { GAL_CG, GAL_MUSIC, GAL_THEATER } from '../data/gallery.js';
import { STAGES } from '../data/stages.js';
import { CLASSES } from '../data/classes.js';
import * as NG from './ngplus.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const SLOTS = [1, 2, 3];
const BATCH_MS = 500;   // 슬롯 쓰기 알림을 모으는 시간

/** 종류 → 데이터 (화면의 방 이름 'music'·'theater' 도 받는다) */
export const GAL_KINDS = Object.freeze({ cg: GAL_CG, mus: GAL_MUSIC, th: GAL_THEATER });
const KIND_ALIAS = { cg: 'cg', mus: 'mus', music: 'mus', th: 'th', theater: 'th' };
const kindOf = (k) => KIND_ALIAS[k] ?? null;
const DEF = { cg: new Map(GAL_CG.map((d) => [d.id, d])), mus: new Map(GAL_MUSIC.map((d) => [d.id, d])), th: new Map(GAL_THEATER.map((d) => [d.id, d])) };
const isAlways = (d) => Array.isArray(d?.need) && d.need.includes('always');
/** 2부 항목 id (cg·mus — 하나라도 열렸으면 2부를 안다) */
const P2_IDS = { cg: GAL_CG.filter((d) => d.p2).map((d) => d.id), mus: GAL_MUSIC.filter((d) => d.p2).map((d) => d.id) };
const P2_FLAGS = ['p2_started', 'p2_done', 'rook_revealed'];
/** 보스 → 그 보스가 나오는 장 (boss: 토큰 — 장을 깼으면 보스전을 봤다) */
const BOSS_STAGES = new Map();
for (const [sid, st] of Object.entries(STAGES)) if (typeof st?.boss === 'string') { if (!BOSS_STAGES.has(st.boss)) BOSS_STAGES.set(st.boss, []); BOSS_STAGES.get(st.boss).push(sid); }

// ───────────────────────── 요약 ─────────────────────────
const strSet = (a, into = new Set()) => { if (Array.isArray(a)) for (const x of a) if (typeof x === 'string') into.add(x); return into; };
/** 클리어한 장 (STAGES 에 있는 것, 투기장 제외) → into */
function addCleared(c, into) {
  if (isObj(c)) for (const sid of Object.keys(c)) if (c[sid] && sid !== 'arena' && Object.hasOwn(STAGES, sid)) into.add(sid);
  return into;
}
function addFlags(f, into) {
  if (isObj(f)) for (const k of Object.keys(f)) if (f[k] === true) into.add(k);
  return into;
}

/**
 * 세이브 → 회랑 증거 요약 (순수, 원본을 바꾸지 않는다, 손상 세이브에도 던지지 않는다).
 * 객체가 아니거나 아케이드 임시 세이브(state.arcade)면 null.
 * → { seen:Set(seenScripts), cleared:Set, bosses:Set, flags:Set(값이 true 인 깃발), tier:{charId: 직업 단계}, deaths }
 * 회차 슬롯이면 NG.pastState 의 cleared·bosses·flags 를 더한다 (past 에는 seenScripts 가 없다 — 모든 규칙에 장·보스·깃발 대안이 있다)
 */
export function digestGal(state) {
  try {
    if (!isObj(state) || state.arcade) return null;
    const p = isObj(state.progress) ? state.progress : {};
    const d = { seen: strSet(p.seenScripts), cleared: addCleared(p.cleared, new Set()), bosses: strSet(p.bosses), flags: addFlags(p.flags, new Set()), tier: {}, deaths: 0 };
    if (isObj(state.heroes)) {
      for (const id of Object.keys(state.heroes)) {
        const h = state.heroes[id];
        const c = isObj(h) && typeof h.classId === 'string' && Object.hasOwn(CLASSES, h.classId) ? CLASSES[h.classId] : null;
        if (c && (!c.charId || c.charId === id)) d.tier[id] = Math.max(0, fin(c.tier));
      }
    }
    d.deaths = Math.max(0, fin(isObj(state.stats) ? state.stats.deaths : 0));
    if (state.ng) {
      let past = null;
      try { past = NG.pastState?.(state) ?? null; } catch { past = null; }
      const pp = isObj(past?.progress) ? past.progress : null;
      if (pp) { addCleared(pp.cleared, d.cleared); strSet(pp.bosses, d.bosses); addFlags(pp.flags, d.flags); }
    }
    return d;
  } catch { return null; }
}
const emptyDigest = () => ({ seen: new Set(), cleared: new Set(), bosses: new Set(), flags: new Set(), tier: {}, deaths: 0 });
const isDigest = (x) => isObj(x) && x.seen instanceof Set && x.cleared instanceof Set;
/** 요약 여러 개의 합집합 (tier·deaths 는 큰 값) */
function unionDigests(list) {
  const u = emptyDigest();
  for (const d of list) {
    if (!isDigest(d)) continue;
    for (const k of ['seen', 'cleared', 'bosses', 'flags']) for (const x of d[k]) u[k].add(x);
    for (const [id, t] of Object.entries(d.tier)) if (t > (u.tier[id] ?? 0)) u.tier[id] = t;
    if (d.deaths > u.deaths) u.deaths = d.deaths;
  }
  return u;
}

/**
 * 판정 문맥 (순수): states = 세이브(또는 digestGal 요약) 목록 → { d: 합집합 요약, meta }.
 * 엔진은 슬롯 1–3(saves.read) + 지금 game.state(슬롯 1–3·아케이드 아님)를 넘긴다
 */
export function gatherGal(meta, states = []) {
  const list = [];
  for (const s of Array.isArray(states) ? states : [states]) { const d = isDigest(s) ? s : digestGal(s); if (d) list.push(d); }
  return { d: unionDigests(list), meta: isObj(meta) ? meta : {} };
}

// ───────────────────────── 규칙 ─────────────────────────
function tokenTrue(t, ctx) {
  if (typeof t !== 'string') return false;
  const d = ctx.d, meta = ctx.meta;
  if (t === 'always') return true;
  if (t === 'start') return d.seen.has('prologue') || d.cleared.size > 0;
  if (t === 'die') return d.deaths >= 1 || fin(meta.ach?.prog?.deaths) >= 1;
  if (t === 'arena') {
    if (fin(meta.survivalBest) > 0) return true;
    const tb = isObj(meta.towerBest) ? meta.towerBest : {};
    return Object.keys(tb).some((k) => fin(tb[k]?.floor) > 0);
  }
  const i = t.indexOf(':');
  if (i < 1) return false;
  const op = t.slice(0, i), a = t.slice(i + 1);
  switch (op) {
    case 's': return d.seen.has(a);
    case 'c': return a === '*' ? d.cleared.size > 0 : d.cleared.has(a);
    case 'b': return d.bosses.has(a);
    case 'boss': return d.seen.has(a + '_pre') || d.bosses.has(a) || (BOSS_STAGES.get(a) ?? []).some((sid) => d.cleared.has(sid));
    case 'e': return (Array.isArray(meta.endingsSeen) && meta.endingsSeen.includes(a)) || d.flags.has('ending_' + a);
    case 'f': return d.flags.has(a);
    case 'aw': return fin(meta.ach?.prog?.['aw_' + a]) >= 1 || (d.tier[a] ?? 0) >= 1;
    default: return false;
  }
}
/** need(토큰 배열) 중 하나라도 참인가 (순수, 던지지 않는다). ctx = gatherGal 결과 */
export function evalNeed(need, ctx) {
  try {
    if (!Array.isArray(need) || !ctx) return false;
    const c = { d: isDigest(ctx.d) ? ctx.d : emptyDigest(), meta: isObj(ctx.meta) ? ctx.meta : {} };
    return need.some((t) => tokenTrue(t, c));
  } catch { return false; }
}
/** 지금 열려야 하는 그림·곡 id (저장하는 것만 — 'always' 제외, 데이터 순서). 순수 */
export function scanGal(ctx) {
  const out = { cg: [], mus: [] };
  for (const k of ['cg', 'mus']) for (const d of GAL_KINDS[k]) if (!isAlways(d) && evalNeed(d.need, ctx)) out[k].push(d.id);
  return out;
}

// ───────────────────────── 엔진 ─────────────────────────
class GalEngine {
  constructor(game, opts) {
    this.game = game;
    this.saves = game.saves ?? SAVES;
    this.digests = { 1: null, 2: null, 3: null };   // 저장된 슬롯 요약 (부팅·쓰기·동기화 뒤)
    this.loaded = false;                             // 슬롯 셋을 한 번이라도 읽었나
    this.live = null; this.liveState = null;          // 지금 game.state 요약 (훑을 때마다 새로)
    this.union = null; this.unionLive = null;         // 합집합 캐시 (요약이 바뀌면 null) · 그때의 game.state
    this.writing = false;                             // 자기 saveMeta 로 생긴 onWrite('meta') 무시
    this.pend = { slots: new Set(), meta: false, timer: null };
    this.rev = 0;                                     // 열림이 바뀔 때마다 +1 (화면 캐시용)
    this.thSig = '';                                  // 극장 열림 표시 (바뀌면 rev +1)
    this.galSig = '';                                 // meta.gal 수·seenAt 표시 (밖에서 바뀌면 rev +1)
    this.offs = [];
    this.subscribe();
    if (opts.boot !== false) this.idle(() => this.rescan('retro'));
  }

  // ── 기반 ──
  gal() { return ensureGal(this.game.meta); }
  idle(fn, ms = 1500) {   // 업적 소급(1.2초)보다 늦게
    const run = () => { try { fn(); } catch (e) { console.warn('[gal]', e); } };
    this.bootTimer = setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 4000 }) : run()), ms);
  }
  saveMeta() {
    if (!this.game.meta) return false;
    this.writing = true;
    try { return this.saves.saveMeta?.(this.game.meta); } catch (e) { console.warn('[gal] save', e); return false; } finally { this.writing = false; }
  }
  /** 지금 게임 중인 스토리 슬롯 (아케이드 임시 세이브 제외) */
  liveSlotState() {
    const st = this.game.state;
    return isObj(st) && !st.arcade && st.slot >= 1 && st.slot <= 3 ? st : null;
  }
  /** 저장된 슬롯 하나 다시 요약 (지금 게임 중인 슬롯이면 파싱 없이 그 상태로 — store: 그래도 저장소를 읽는다, 클라우드가 알림 없이 받은 슬롯) */
  redigest(slot, store = false) {
    const st = this.liveSlotState();
    if (st && st.slot === slot && !store) { this.live = digestGal(st); this.liveState = st; this.digests[slot] = this.live; }
    else {
      let raw = null;
      try { raw = this.saves.read?.(slot) ?? null; } catch { raw = null; }
      this.digests[slot] = digestGal(raw);
    }
    this.union = null;
  }
  loadAll(store = false) { for (const s of SLOTS) this.redigest(s, store); this.loaded = true; }
  /** 지금 game.state 를 다시 요약 (저장 전 진행 포함) */
  refreshLive() {
    const st = this.liveSlotState();
    this.live = st ? digestGal(st) : null; this.liveState = st;
    this.union = null;
  }
  /** 판정 문맥: 슬롯 요약 합집합(캐시) + 지금 메타 */
  ctx() {
    const cur = this.liveSlotState();
    const st = this.liveState && this.liveState === cur ? cur : null;   // game.state 가 바뀌었으면 지난 요약은 빼고 저장된 슬롯으로
    if (!this.union || this.unionLive !== st) {
      const list = SLOTS.map((s) => this.digests[s]);
      if (st) list.push(this.live);   // 지금 game.state 는 그 슬롯의 저장된 요약에 더한다 (회랑이 열린 채 클라우드가 같은 슬롯을 받아도 받은 기록이 빠지지 않게)
      this.union = unionDigests(list); this.unionLive = st;
    }
    return { d: this.union, meta: isObj(this.game.meta) ? this.game.meta : {} };
  }

  // ── 열기 ──
  /** 증거로 훑어 새로 열린 것을 적는다 → ['cg:id' | 'mus:id', …] (있으면 saveMeta 한 번) */
  scan() {
    const ctx = this.ctx();
    const hit = scanGal(ctx);
    const out = this.add(Object.entries(hit).flatMap(([k, ids]) => ids.map((id) => [k, id])));
    this.touchTheater(ctx);
    this.touchGal();
    return out;
  }
  /** 메타가 밖에서 바뀌었으면(클라우드 병합 — 다른 기기에서 연 것·seenAt, 메타 바꿔 끼우기) rev +1 → 열린 회랑이 다시 읽는다 */
  touchGal() {
    const g = this.game.meta?.gal;
    const sig = isObj(g) ? `${isObj(g.cg) ? Object.keys(g.cg).length : 0}|${isObj(g.mus) ? Object.keys(g.mus).length : 0}|${g.seenAt}` : '';
    if (sig !== this.galSig) { this.galSig = sig; this.rev++; }
  }
  /** [kind, id] 목록 중 아직 없는 것을 지금 시각으로 적는다 → 새로 연 'kind:id' */
  add(pairs) {
    if (!pairs.length) return [];
    const g = this.gal(), now = Date.now(), out = [];
    for (const [k, id] of pairs) if (!Object.hasOwn(g[k], id)) { g[k][id] = now; out.push(`${k}:${id}`); }
    if (!out.length) return [];
    this.rev++;
    this.saveMeta();
    return out;
  }
  /** 극장 줄: 증거(need) 또는 그 줄의 CG(bg 'cg/…')가 이미 걸렸으면 열림 — '서막은 그 CG' (§2.1). 슬롯을 지워도 다시 잠기지 않는다 */
  thOpen(d, ctx) {
    if (evalNeed(d.need, ctx)) return true;
    const id = typeof d.bg === 'string' && d.bg.startsWith('cg/') ? d.bg.slice(3) : null;
    return !!id && DEF.cg.has(id) && isObj(this.game.meta?.gal) && Object.hasOwn(this.gal().cg, id);   // 읽기만 — 없는 gal 을 만들지 않는다
  }
  touchTheater(ctx) {
    const sig = GAL_THEATER.map((d) => (this.thOpen(d, ctx) ? 1 : 0)).join('');
    if (sig !== this.thSig) { this.thSig = sig; this.rev++; }
  }

  // ── 미뤄 한 번 ──
  soon({ slot = null, meta = false } = {}) {
    const P = this.pend;
    if (slot !== null) P.slots.add(slot);
    if (meta) P.meta = true;
    if (!P.timer) P.timer = setTimeout(() => this.flushPending(), BATCH_MS);
  }
  flushPending() {
    const P = this.pend;
    P.timer = null;
    const slots = P.slots;
    P.slots = new Set(); P.meta = false;
    try {
      for (const s of slots) this.redigest(s);   // 지금 게임 중인 슬롯이면 그 상태로 (저장 직후라 같다)
      this.scan();   // 메타 쓰기만이면 캐시 그대로 — 메타 규칙(e:·aw:·die·arena)이 새로 참이 된다
    } catch (e) { console.warn('[gal]', e); }
  }

  // ── 구독 ──
  on(evt, fn) {
    this.offs.push(bus.on(evt, (d) => { try { fn(d ?? {}); } catch (e) { console.warn('[gal]', evt, e); } }));
  }
  subscribe() {
    // 각성 컷인: 곧바로 (아케이드 포함 — 이미 연 영웅의 그림)
    this.on('awakenCast', (d) => { const id = 'cutin_' + d.charId; if (DEF.cg.has(id)) this.add([['cg', id]]); });
    this.on('cloud:sync', (d) => {
      if (d.phase === 'done' && d.ok) setTimeout(() => { try { this.rescan('cloud'); } catch (e) { console.warn('[gal]', e); } }, 0);
    });
    const offW = this.saves.onWrite?.((ev) => {
      if (!ev) return;
      if (ev.type === 'meta') { if (!this.writing) this.soon({ meta: true }); return; }   // 남의 메타 쓰기: 엔딩·업적 누적값·아케이드 기록 (캐시로 다시 판정)
      if (!SLOTS.includes(ev.slot)) return;
      if (ev.type === 'remove') { this.digests[ev.slot] = null; this.union = null; return; }   // 거두지 않는다 — 요약만 비운다
      if (ev.type === 'write') this.soon({ slot: ev.slot });
    });
    if (typeof offW === 'function') this.offs.push(offW);
  }
  dispose() {
    for (const off of this.offs) { try { off(); } catch { /* 무시 */ } }
    this.offs = [];
    clearTimeout(this.pend.timer); clearTimeout(this.bootTimer);
  }

  // ── 소급 ──
  /** 'open': 슬롯 캐시 + 지금 game.state (처음이면 슬롯을 읽는다) · 그 밖('retro'·'cloud'): 슬롯 셋을 다시 읽는다 → 새로 연 'kind:id' */
  rescan(src = 'retro') {
    if (src !== 'open' || !this.loaded) this.loadAll(src === 'cloud');
    this.refreshLive();
    return this.scan();
  }

  // ── 공개 API 몸체 ──
  has(kind, id) {
    const k = kindOf(kind), d = k && DEF[k].get(id);
    if (!d) return false;
    if (isAlways(d)) return true;
    if (k === 'th') return this.thOpen(d, this.ctx());
    const m = this.gal()[k];
    return Object.hasOwn(m, id);
  }
  isNew(kind, id) {
    const k = kindOf(kind);
    if ((k !== 'cg' && k !== 'mus') || !DEF[k].has(id)) return false;
    const g = this.gal(), t = g[k][id];
    return typeof t === 'number' && t > g.seenAt;
  }
  p2() {
    const g = this.gal();
    for (const k of ['cg', 'mus']) for (const id of P2_IDS[k]) if (Object.hasOwn(g[k], id)) return true;
    const seen = this.game.meta?.endingsSeen;
    if (Array.isArray(seen) && (seen.includes('p2') || seen.includes('p2true'))) return true;
    const f = this.ctx().d.flags;
    return P2_FLAGS.some((x) => f.has(x));
  }
  list(kind) {
    const k = kindOf(kind);
    if (!k) return [];
    const p2 = this.p2(), ctx = k === 'th' ? this.ctx() : null, g = this.gal();
    return GAL_KINDS[k].map((def) => {
      const open = isAlways(def) || (k === 'th' ? this.thOpen(def, ctx) : Object.hasOwn(g[k], def.id));
      const t = k !== 'th' ? g[k][def.id] : null;
      return { def, open, isNew: typeof t === 'number' && t > g.seenAt, hidden: !!def.p2 && !p2 };
    });
  }
  summary() {
    const p2 = this.p2(), out = { p2, unseen: 0 };
    for (const k of ['cg', 'mus', 'th']) {
      let got = 0, total = 0;
      for (const r of this.list(k)) {
        if (r.hidden) continue;
        total++;
        if (r.open) got++;
        if (r.isNew) out.unseen++;
      }
      out[k] = { got, total };
    }
    return out;
  }
  /** 회랑을 닫을 때: 새로 연 것이 있었을 때만 seenAt = 지금 → saveMeta */
  markSeen() {
    const g = this.gal();
    const fresh = ['cg', 'mus'].some((k) => Object.values(g[k]).some((t) => t > g.seenAt));
    if (!fresh) return false;
    g.seenAt = Date.now();
    this.rev++;
    this.saveMeta();
    return true;
  }
  _open(kind, id) {
    const k = kindOf(kind);
    if ((k !== 'cg' && k !== 'mus') || !DEF[k].has(id) || isAlways(DEF[k].get(id))) return [];
    return this.add([[k, id]]);
  }
}

/**
 * 엔진 시작 (한 번만) → game.gal. opts.boot === false 면 부팅 소급 훑기를 하지 않는다 (시험)
 */
export function initGallery(game, opts = {}) {
  if (game.gal?._engine) return game.gal;
  const E = new GalEngine(game, opts);
  game.gal = {
    _engine: E,
    defs: { cg: GAL_CG, mus: GAL_MUSIC, th: GAL_THEATER },
    get rev() { return E.rev; },
    has: (kind, id) => E.has(kind, id),
    isNew: (kind, id) => E.isNew(kind, id),
    p2: () => E.p2(),
    list: (kind) => E.list(kind),
    summary: () => E.summary(),
    rescan: (src = 'retro') => E.rescan(src),
    markSeen: () => E.markSeen(),
    _open: (kind, id) => E._open(kind, id),
    _dispose: () => { E.dispose(); if (game.gal?._engine === E) delete game.gal; },
  };
  return game.gal;
}
