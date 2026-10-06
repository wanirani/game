// 회차 플레이 「피의 윤회」 (NEW GAME+) — 규칙·세이브·세기 (docs/specs/ngplus.md, owner: NG-CORE)
// 순수 모듈: DOM 없음, node 에서 import 가능. data 모듈(items·difficulty)만 import 한다 (state.js·companion_state.js 가 이것을 import).
//
// 세이브 모양 (§5.1): state.ng = { v:1, n, at, hist:[{ n, end, diff, t, at }], past:{ diff, cleared, unlocked, bosses, relics, shards, hearts, secrets, flags, quests } }
//  · n = 지난 회차 수 (0..9) — 표기 `${n + 1}회차`. 없거나 0 이면 1회차. 아케이드 임시 세이브(state.arcade)의 ng 는 무시한다
//  · past = 지난 회차들을 합친 진행 기록 (업적 요약 pastState · 아케이드 연습 목록이 읽는다). 비전서·기록물은 이어지므로 넣지 않는다
// 세기 (§3): 스토리 스테이지 월드만 — world.js 가 ngWorld 로 stage.level·diff 를 바꾸고(복사본) boss.js 가 world.ngBoss 로 강화 패턴을 켠다.
// 이 파일의 함수는 잘못된 입력(null, 손상된 세이브)에도 던지지 않는다. normalizeNg 는 멱등이고 ng 가 없는 세이브에 ng 를 만들지 않는다.
import { ITEMS } from '../data/items.js';
import { DIFF, getDiff } from '../data/difficulty.js';

// §3.2 세기 표 — 규칙 숫자의 원본은 이것 하나 (tools/balance.mjs --ng 도 ngWorld 로 읽는다)
export const NG_RULES = {
  cap: 3,                                         // 세기는 4회차(n = 3)에서 멈춘다 (5회차 이상 = 4회차)
  comp: { hp: 2.5, atk: 1.0, ref: 46 },           // 1부 초반 보정 comp(L, A) = 1 + A × max(0, ref − L) / (ref − 1) — s01 ×3.5/×2.0 → s14 이후 ×1
  limits: { enemyHp: 4.0, enemyAtk: 3.0, bossHp: 3.6, aggro: 1.8, elite: 0.35, level: 99 },   // 상한은 회차 몫에만 (난이도 값보다 낮추지 않는다)
  cycles: {
    1: { base: 70, k: 0.32, hp: 1.10, atk: 1.10, bossHp: 1.10, aggro: 1.0, elite: 0.03, drop: 1.1 },
    2: { base: 78, k: 0.30, hp: 1.35, atk: 1.35, bossHp: 1.30, aggro: 1.1, elite: 0.06, drop: 1.2 },
    3: { base: 82, k: 0.26, hp: 1.60, atk: 1.65, bossHp: 1.50, aggro: 1.2, elite: 0.09, drop: 1.3 },
  },
};

// §5.1 저장 상한: 회차 수 · 끝낸 회차 줄 · past JSON 바이트 (넘으면 secrets → quests 순서로 뒤에서 자른다)
export const NG_LIMITS = { nMax: 9, histMax: 10, pastBytes: 24 * 1024 };

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const RANKS = 'SABCD';
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);   // JSON.parse 가 만든 자기 속성 '__proto__' 를 그대로 옮기면 프로토타입이 바뀐다
const PAST_LISTS = ['unlocked', 'bosses', 'relics', 'shards', 'hearts', 'secrets', 'quests'];
const PAST_KNOWN = new Set(['diff', 'cleared', 'flags', ...PAST_LISTS]);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(v)));
const validDiff = (d) => typeof d === 'string' && Object.hasOwn(DIFF, d);
const isKeyItem = (it) => isObj(it) && typeof it.baseId === 'string' && Object.hasOwn(ITEMS, it.baseId) && ITEMS[it.baseId].slot === 'key';
let enc = null;
const bytes = (o) => { const s = JSON.stringify(o) ?? ''; try { return (enc ??= new TextEncoder()).encode(s).length; } catch { return s.length * 3; } };

// ───────────────────────── 회차 읽기 · 표기 · 여는 조건 ─────────────────────────

/** 지난 회차 수 (0..9). 아케이드·없음·손상 → 0 (첫 조각 파일의 인라인 읽기와 같은 규칙: 정수 n ≥ 1 만) */
export function ngOf(state) {
  if (!isObj(state) || state.arcade || !isObj(state.ng)) return 0;
  const n = state.ng.n;
  return Number.isInteger(n) && n > 0 ? Math.min(NG_LIMITS.nMax, n) : 0;
}

/** 회차 표기 — n ≥ 1 이면 `${n + 1}회차` ('2회차' … '10회차'), 아니면 '' */
export function ngLabel(n) { return Number.isInteger(n) && n >= 1 ? `${Math.min(NG_LIMITS.nMax, n) + 1}회차` : ''; }

/** §1 여는 조건: 그 슬롯이 2부 엔딩을 봤다 (worldmap.js 외전 해금과 같은 규칙) · 아케이드 아님 · n < 9 */
export function canStartNg(state) {
  if (!isObj(state) || state.arcade || !isObj(state.progress)) return false;
  const F = isObj(state.progress.flags) ? state.progress.flags : {};
  return !!(F.p2_done || F.ending_p2 || F.ending_p2true) && ngOf(state) < NG_LIMITS.nMax;
}

// ───────────────────────── 회차 넘기기 (§2.2) ─────────────────────────

/**
 * 새 회차 세이브를 돌려준다 (원본은 바꾸지 않는다 — JSON 깊은 사본). 정확히 §2.2 표만 한다:
 *  그대로 — heroes · gold · stats · bestiary · innGames · companions · charId · difficulty · created · name · 모르는 최상위 필드 · progress.docs/lore
 *  중요 물품만 뺌 — inventory · progress.lootQueue (ITEMS[baseId].slot === 'key': 유물·열쇠·서신·등불·세계의 심장·별의 조각·새벽꽃)
 *  새로 — progress 나머지 (flags 는 startChar · stable_open 만) · quests · score 0 · lives · lastStage null · slot = 대상 슬롯
 *  ng — n + 1 (≤ 9), at = now, hist 에 끝낸 회차 한 줄, past 에 지난 진행 합치기
 */
export function startNgPlus(state, { slot, now = Date.now() } = {}) {
  const s = JSON.parse(JSON.stringify(isObj(state) ? state : {}));
  const P = isObj(s.progress) ? s.progress : {};
  const F = isObj(P.flags) ? P.flags : {};
  const ng0 = isObj(s.ng) ? s.ng : null;
  const n0 = ngOf(s);
  if (!validDiff(s.difficulty)) s.difficulty = 'normal';
  // 끝낸 회차 한 줄 + 지난 진행 합치기 (이번 회차의 진행을 지우기 전에)
  const end = F.ending_p2true === true ? 'p2true' : (F.ending_p2 === true || F.p2_done === true) ? 'p2' : null;
  const playT = Number.isFinite(s.stats?.playTime) ? Math.max(0, Math.round(s.stats.playTime)) : 0;
  const hist = [...(Array.isArray(ng0?.hist) ? ng0.hist : []), { n: n0, end, diff: s.difficulty, t: playT, at: now }];
  const past = mergePast(isObj(ng0?.past) ? ng0.past : {}, P, s.quests, s.difficulty);
  s.ng = { ...(ng0 ?? {}), v: 1, n: Math.min(NG_LIMITS.nMax, n0 + 1), at: now, hist, past };
  // 소지품: 중요 물품만 뺀다 (남기면 loot.heartOwned 가 가방의 심장을 보고 다시 떨어뜨리지 않아 2부 진엔딩이 막힌다)
  s.inventory = (Array.isArray(s.inventory) ? s.inventory : []).filter((it) => !isKeyItem(it));
  const flags = { startChar: s.charId };
  if (F.stable_open === true) flags.stable_open = true;   // 마구간 개장 대사를 다시 틀지 않는다
  const progress = {
    chapter: 0, cleared: {}, unlocked: ['s01'], flags,
    docs: Array.isArray(P.docs) ? P.docs : [], lore: Array.isArray(P.lore) ? P.lore : [],   // 비전서(영구 능력치)·기록물은 이어진다
    secrets: [], bosses: [], relics: [], seenScripts: [], shards: [], hearts: [],
  };
  if (Array.isArray(P.lootQueue)) progress.lootQueue = P.lootQueue.filter((it) => !isKeyItem(it));
  s.progress = progress;
  s.quests = { active: {}, done: [] };
  s.score = 0;
  s.lives = getDiff(s.difficulty).lives;
  s.lastStage = null;
  if (slot != null) s.slot = slot;
  normalizeNg(s);   // hist 10줄 · past 24 KB 상한
  return s;
}

/** past(지난 회차 합) + 이번 회차 progress/quests → 새 past. cleared 는 더 좋은 랭크·짧은 시간, 목록은 합집합, flags 는 true 의 합집합 */
function mergePast(prev, P, quests, diff) {
  const out = normPast(prev, diff);
  const cur = isObj(P.cleared) ? P.cleared : {};
  for (const sid of Object.keys(cur)) {
    if (BAD_KEYS.has(sid) || !cur[sid]) continue;
    const a = out.cleared[sid], b = clearRec(cur[sid]);
    if (!a) { out.cleared[sid] = b; continue; }
    const ra = a.rank ? RANKS.indexOf(a.rank) : 9, rb = b.rank ? RANKS.indexOf(b.rank) : 9;
    out.cleared[sid] = {
      rank: rb < ra ? b.rank : a.rank,
      time: a.time == null ? b.time : b.time == null ? a.time : Math.min(a.time, b.time),
    };
  }
  const add = (k, list) => { out[k] = strList([...out[k], ...(Array.isArray(list) ? list : [])]); };
  for (const k of PAST_LISTS) if (k !== 'quests') add(k, P[k]);
  add('quests', isObj(quests) ? quests.done : null);
  const f = isObj(P.flags) ? P.flags : {};
  for (const k of Object.keys(f)) if (f[k] === true && !BAD_KEYS.has(k)) out.flags[k] = true;
  out.diff = validDiff(diff) ? diff : out.diff;
  capPast(out);
  return out;
}

// ───────────────────────── 이관 (§5.2) ─────────────────────────

/**
 * migrateState 끝 (s.version 적기 직전). ng 가 없으면 아무것도 하지 않는다 (옛 세이브·1회차 세이브는 바이트 그대로).
 * 객체가 아니면 지운다 · n 0..9 정수 · hist 객체만·필드 정리·마지막 10줄 · past 정리·크기 상한. 모르는 필드는 남긴다. 멱등, 던지지 않는다
 */
export function normalizeNg(s) {
  if (!isObj(s) || !Object.hasOwn(s, 'ng')) return;
  if (!isObj(s.ng)) { delete s.ng; return; }
  const ng = s.ng;
  try {
    if (!(Number.isInteger(ng.v) && ng.v >= 1)) ng.v = 1;
    ng.n = Number.isFinite(ng.n) ? clampInt(ng.n, 0, NG_LIMITS.nMax) : 0;
    if (!Number.isFinite(ng.at)) ng.at = 0;
    ng.hist = (Array.isArray(ng.hist) ? ng.hist : []).filter(isObj).slice(-NG_LIMITS.histMax).map(histRow);
  } catch { ng.hist = []; }
  try {
    if (Object.hasOwn(ng, 'past')) {
      if (!isObj(ng.past)) delete ng.past;
      else ng.past = normPast(ng.past, s.difficulty);
    }
  } catch { delete ng.past; }
}

function histRow(r) {
  return {
    n: Number.isFinite(r.n) ? clampInt(r.n, 0, NG_LIMITS.nMax) : 0,
    end: typeof r.end === 'string' ? r.end.slice(0, 16) : null,
    diff: validDiff(r.diff) ? r.diff : null,
    t: Number.isFinite(r.t) ? Math.max(0, r.t) : 0,
    at: Number.isFinite(r.at) ? r.at : 0,
  };
}
const strList = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string'))] : []);
const clearRec = (v) => ({
  rank: isObj(v) && typeof v.rank === 'string' && v.rank.length === 1 && RANKS.includes(v.rank) ? v.rank : null,
  time: isObj(v) && Number.isFinite(v.time) ? v.time : null,
});
function normCleared(c) {
  const out = {};
  if (isObj(c)) for (const k of Object.keys(c)) if (!BAD_KEYS.has(k) && c[k]) out[k] = clearRec(c[k]);
  return out;
}
function trueFlags(f) {
  const out = {};
  if (isObj(f)) for (const k of Object.keys(f)) if (f[k] === true && !BAD_KEYS.has(k)) out[k] = true;
  return out;
}
/** past 정리 (새 객체): 모르는 필드는 남기고, 아는 필드는 모양을 맞춘 뒤 크기 상한 */
function normPast(p, slotDiff) {
  const out = {};
  for (const k of Object.keys(p)) if (!BAD_KEYS.has(k) && !PAST_KNOWN.has(k)) out[k] = p[k];
  out.diff = validDiff(p.diff) ? p.diff : validDiff(slotDiff) ? slotDiff : 'normal';
  out.cleared = normCleared(p.cleared);
  for (const k of PAST_LISTS) out[k] = strList(p[k]);
  out.flags = trueFlags(p.flags);
  capPast(out);
  return out;
}
/** past JSON ≤ NG_LIMITS.pastBytes: secrets → quests 를 뒤에서 자른다. 그래도 넘으면(손상·다른 클라이언트) 모르는 필드 → 나머지 목록 → flags → cleared */
function capPast(out) {
  const LIM = NG_LIMITS.pastBytes;
  let size = bytes(out);
  if (size <= LIM) return;
  const trimList = (k) => {
    while (size > LIM && out[k].length) {
      let over = size - LIM, i = out[k].length;
      while (i > 0 && over > 0) { i--; over -= bytes(out[k][i]) + 1; }
      out[k] = out[k].slice(0, i);
      size = bytes(out);
    }
  };
  const trimObj = (k) => {
    while (size > LIM && Object.keys(out[k]).length) {
      const keys = Object.keys(out[k]);
      let over = size - LIM, i = keys.length;
      while (i > 0 && over > 0) { i--; over -= bytes(keys[i]) + bytes(out[k][keys[i]]) + 2; delete out[k][keys[i]]; }
      size = bytes(out);
    }
  };
  for (const k of ['secrets', 'quests']) { trimList(k); if (size <= LIM) return; }
  for (const k of Object.keys(out)) if (!PAST_KNOWN.has(k)) delete out[k];
  size = bytes(out);
  for (const k of PAST_LISTS) { if (size <= LIM) return; trimList(k); }
  if (size > LIM) trimObj('flags');
  if (size > LIM) trimObj('cleared');
}

// ───────────────────────── 세기 (§3) ─────────────────────────

/** 1부 초반 보정 comp(L, A) = 1 + A × max(0, ref − L) / (ref − 1)  (L ≥ ref → 1) */
export function ngComp(L, A) {
  const ref = NG_RULES.comp.ref;
  return 1 + (Number.isFinite(A) ? A : 0) * Math.max(0, ref - (Number.isFinite(L) ? L : 1)) / (ref - 1);
}
/** 회차 n 의 규칙 줄 (n < 1 → null, n ≥ cap → cap 줄) */
function cycleOf(n) {
  const k = Number.isFinite(n) ? Math.floor(n) : 0;
  return k >= 1 ? NG_RULES.cycles[Math.min(k, NG_RULES.cap)] ?? null : null;
}
const levelFor = (L, R) => Math.min(NG_RULES.limits.level, Math.max(L, Math.round(R.base + R.k * L)));

/** §3.1 회차 적 레벨 E = min(99, max(L, round(base + k × L))) — n = 0 이면 stage.level */
export function ngStageLevel(stage, n) {
  const L = Number.isFinite(stage?.level) ? stage.level : 1;
  const R = cycleOf(n);
  return R ? levelFor(L, R) : L;
}

/**
 * §3.1 스토리 스테이지 월드 세기 → { stage, diff, bossPatterns } | null (n = 0 이면 null).
 * stage 는 복사본 { ...stage, level: E, ngFrom: L } (STAGES 는 그대로), diff 는 난이도 값(base) 위에 회차 몫 (상한은 회차 몫에만):
 *  enemyHp = min(max(base, 4.0), base × hp) × comp(L, 2.5) · enemyAtk = min(max(base, 3.0), base × atk) × comp(L, 1.0)
 *  bossHp = min(max(base, 3.6), base × bossHp) × comp(L, 2.5) · aggro = min(max(base, 1.8), base × aggro)
 *  elite = min(max(base, 0.35), base + elite) · drop = base × drop — 그 밖(exp gold healDrop lives continues scoreMult enemySpeed)은 그대로
 */
export function ngWorld(stage, diff, n) {
  const R = cycleOf(n);
  if (!R || !isObj(stage)) return null;
  const L = Number.isFinite(stage.level) ? stage.level : 1;
  const d = isObj(diff) ? diff : getDiff('normal');
  const lim = NG_RULES.limits, A = NG_RULES.comp;
  const num = (v, def) => (Number.isFinite(v) ? v : def);
  const capped = (base, limit, v) => Math.min(Math.max(base, limit), v);
  const hp = num(d.enemyHp, 1), atk = num(d.enemyAtk, 1), boss = num(d.bossHp, hp), aggro = num(d.aggro, 1), elite = num(d.elite, 0), drop = num(d.drop, 1);
  return {
    stage: { ...stage, level: levelFor(L, R), ngFrom: L },
    diff: {
      ...d,
      enemyHp: capped(hp, lim.enemyHp, hp * R.hp) * ngComp(L, A.hp),
      enemyAtk: capped(atk, lim.enemyAtk, atk * R.atk) * ngComp(L, A.atk),
      bossHp: capped(boss, lim.bossHp, boss * R.bossHp) * ngComp(L, A.hp),
      aggro: capped(aggro, lim.aggro, aggro * R.aggro),
      elite: capped(elite, lim.elite, elite + R.elite),
      drop: drop * R.drop,
    },
    bossPatterns: true,   // Boss 생성자의 this.inferno (악몽·지옥이 이미 쓰는 강화 패턴 묶음)
  };
}

// ───────────────────────── 마을 · 지난 회차 · 디버그 ─────────────────────────

/** §4.3 회차의 마을: 회차가 있으면 max(chapter, 20) — 가게·대장간·마구간·수호신 2번 칸이 읽는다 */
export function serviceChapter(state) {
  const c = Number.isFinite(state?.progress?.chapter) ? state.progress.chapter : 0;
  return ngOf(state) >= 1 ? Math.max(c, 20) : c;
}

/**
 * §6 지난 회차 가상 세이브: { progress: past 의 부분 모양, quests: { done }, difficulty: past.diff } (영웅·통계·동료·가방은 비어 있다).
 * 반환값에는 ng 가 없다 (재귀 없음). 회차 기록(past)이 없으면 null. 새 객체라 고쳐도 슬롯은 그대로
 */
export function pastState(state) {
  if (!isObj(state) || state.arcade || !isObj(state.ng) || !isObj(state.ng.past)) return null;
  const p = state.ng.past;
  return {
    slot: state.slot, created: state.created,
    difficulty: validDiff(p.diff) ? p.diff : validDiff(state.difficulty) ? state.difficulty : 'normal',
    heroes: {}, inventory: [],
    progress: {
      cleared: normCleared(p.cleared), unlocked: strList(p.unlocked), flags: trueFlags(p.flags),
      secrets: strList(p.secrets), bosses: strList(p.bosses), relics: strList(p.relics), shards: strList(p.shards), hearts: strList(p.hearts),
      docs: [], lore: [],
    },
    quests: { active: {}, done: strList(p.quests) },
  };
}

/** ?ng=N (1..9) 디버그·시험: state.ng = { v:1, n:N, at, hist:[], past:{} } (params: URLSearchParams | { ng }). ?ng=0 → 회차 지움 */
export function applyNgDebug(state, params) {
  if (!isObj(state)) return;
  const raw = typeof params?.get === 'function' ? params.get('ng') : params?.ng;
  if (raw == null) return;
  const n = raw === '' ? 1 : parseInt(raw, 10);
  if (!Number.isFinite(n)) return;
  const k = clampInt(n, 0, NG_LIMITS.nMax);
  if (k < 1) { delete state.ng; return; }
  state.ng = { v: 1, n: k, at: Date.now(), hist: [], past: {} };
}
