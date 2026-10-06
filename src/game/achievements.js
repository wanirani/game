// 업적 엔진 「사냥의 기록」 (계약: docs/specs/achievements.md §3). main.js loadRest 가 import() 로 싣는다 (정적 import 금지 — 실패해도 게임은 그대로).
//  initAchievements(game) → game.ach (§3.2 공개 API — 화면·알림(ACH-UI)은 이것만 쓴다)
//  - 기록은 계정(메타) 단위: game.meta.ach (core/ach_meta.js). 엔진은 그 객체를 붙잡아 두지 않는다 — cloud.applyMeta 가 통째로 바꿔 끼운다
//  - 판정: 조건 { m, arg?, n } 은 metric(m, arg, ctx) ≥ n. ctx = { meta, ach, slots(슬롯 1–3 요약 — 지금 game.state 가 그 슬롯이면 실시간 요약), beast }
//    아케이드·연습·일일 임시 세이브(state.arcade)는 요약하지 않는다 (연습에서 쓰러뜨린 보스가 스토리 업적이 되지 않게)
//  - 달성: got[id] = 지금 → 같은 처리의 달성을 모아 버스 'achievementUnlocked' {ids, src} 한 번 → saveMeta 한 번 (src: 'live' | 'retro' | 'cloud')
//    거두지 않는다 (조건이 다시 거짓이 되어도 got 은 남는다). ch_all 은 다른 업적이 달성될 때마다 마지막에 본다
//  - prog(누적값)는 메모리에서 늘리고 드물게 저장: 달성 · stageCleared · arcadeFinished · 스토리 bossKilled · 화면 숨김 · 받기·이명·장식·markSeen
//  - 소급: 부팅 뒤 한가할 때 rescan('retro') · 클라우드 동기화 뒤 rescan('cloud') · 슬롯 쓰기(saves.onWrite) 뒤 그 슬롯만 다시 요약
//  - 성능: enemyKilled 는 상수 시간(카운터·캐시 집합). 세이브 요약은 드문 이벤트 뒤 setTimeout(0) 로 한 번
// 순수 export (node 시험 tools/test_achievements.mjs): digestState · metric · evaluate · scanDefs · rewardOf · ACH_EVENTS · PROG_KEYS · BAR_METRICS
import { bus } from '../core/events.js';
import { saves as SAVES } from '../core/save.js';
import { ensureAch, ACH_TITLES, ACH_DECOS } from '../core/ach_meta.js';
import { ACHIEVEMENTS, ACH_CATS, ACH_HIDDEN } from '../data/achievements.js';
import { CLASSES } from '../data/classes.js';
import { CHARACTERS, CHAR_ORDER } from '../data/characters.js';
import { MOUNTS, GUARDIANS, bondRank } from '../data/companions.js';
import { DOCS } from '../data/lore.js';
import { ENEMIES } from '../data/enemies.js';
import { STAGES } from '../data/stages.js';
import { ITEMS } from '../data/items.js';
import { grantItem } from './inventory.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const PROG_MAX = 1e9;
const SLOTS = [1, 2, 3];

/** prog 키 (§3.3, 25개). 새 키를 쓰면 여기와 명세 §3.3·시험 C1 에 적는다 */
export const PROG_KEYS = Object.freeze([
  'kills', 'combo', 'style', 'nodmg', 'nd_b_dracula',
  'aw_kael', 'aw_sera', 'aw_victor', 'aw_bran', 'aw_lia', 'aw_azel', 'aw_isolde', 'aw2',
  'ride', 'egg', 'enh', 'daily_n', 'daily_last', 'rush_perfect', 'mg_win', 'jackpot', 'nodmg_stage',
  'hb_lia_nemain', 'hb_isolde_argen', 'deaths',
]);
/** 지표 이름 (§3.3 표) */
export const METRICS = Object.freeze([
  'cleared', 'boss', 'ending', 'kills', 'combo', 'style', 'nodmg', 'tier', 'tier2all', 'heroes', 'level', 'awaken', 'awaken2',
  'cmpAny', 'mounts', 'guards', 'ride', 'egg', 'bond', 'cmpLv', 'relics', 'otherworld', 'docs', 'bestiary', 'secrets', 'enhance',
  'quests', 'rush', 'survival', 'tower', 'daily', 'rushPerfect', 'mgWins', 'jackpot', 'duel', 'rankS', 'nodmgStage', 'speed',
  'diffEnding', 'heroBoss', 'konami', 'deaths', 'cat', 'all',
]);
/** 진행 막대를 보이는 지표 (n > 1 일 때만) */
export const BAR_METRICS = new Set(['kills', 'combo', 'tier2all', 'heroes', 'awaken', 'mounts', 'guards', 'bond', 'cmpLv', 'otherworld', 'docs',
  'bestiary', 'secrets', 'enhance', 'quests', 'survival', 'tower', 'daily', 'mgWins', 'duel', 'rankS', 'nodmg', 'deaths', 'all']);
/** 실시간 계기: 이벤트 → 다시 보는 지표 (§3.3 오른쪽 열) */
export const ACH_EVENTS = Object.freeze({
  stageCleared: ['cleared', 'rankS', 'speed', 'nodmgStage'],
  bossKilled: ['boss', 'nodmg', 'heroBoss'],
  enemyKilled: ['kills', 'bestiary'],
  comboMilestone: ['combo'],
  styleRankUp: ['style'],
  playerDied: ['deaths'],
  awakenCast: ['awaken', 'awaken2'],
  classChanged: ['tier', 'tier2all'],
  levelUp: ['level'],
  companionUnlocked: ['cmpAny', 'mounts', 'guards'],
  mounted: ['ride'],
  eggHatched: ['egg'],
  bondUp: ['bond'],
  companionLevelUp: ['cmpLv'],
  relicFound: ['relics'],
  heartFound: ['otherworld'],
  shardFound: ['otherworld'],
  docFound: ['docs'],
  secretFound: ['secrets'],
  enhance: ['enhance'],
  questClaimed: ['quests'],
  minigame: ['mgWins', 'jackpot'],
  arcadeFinished: ['daily', 'rushPerfect'],
});
/** 메타 쓰기(saves.onWrite type 'meta') 뒤에 다시 보는 지표 */
export const META_METRICS = Object.freeze(['ending', 'rush', 'survival', 'tower', 'konami', 'heroes']);

const DEF = new Map(ACHIEVEMENTS.map((d) => [d.id, d]));
const ORDER = new Map(ACHIEVEMENTS.map((d, i) => [d.id, i]));
const ALL_DEF = ACHIEVEMENTS.find((d) => d.cond.m === 'all') ?? null;
const BY_METRIC = new Map();
for (const d of ACHIEVEMENTS) { if (!BY_METRIC.has(d.cond.m)) BY_METRIC.set(d.cond.m, []); BY_METRIC.get(d.cond.m).push(d); }
const TITLE_FROM = {}, DECO_FROM = {};
for (const d of ACHIEVEMENTS) { if (d.reward?.title) TITLE_FROM[d.reward.title] = d.id; if (d.reward?.deco) DECO_FROM[d.reward.deco] = d.id; }
/** 무피해 보스 키 nd_<bossId> 를 쓰는 보스 · 영웅-보스 키 hb_<char>_<boss> 를 쓰는 짝 (데이터에 있는 것만 — prog 키를 늘리지 않는다) */
const NODMG_BOSSES = new Set(ACHIEVEMENTS.filter((d) => d.cond.m === 'nodmg' && typeof d.cond.arg === 'string').map((d) => d.cond.arg));
const HERO_BOSS = ACHIEVEMENTS.filter((d) => d.cond.m === 'heroBoss' && isObj(d.cond.arg)).map((d) => d.cond.arg);
const hbKey = (char, boss) => `hb_${char}_${String(boss).replace(/^b_/, '')}`;
/** 시작 영웅 (해금 조건 없음) · 이야기 합류 깃발 (state.js storyJoinedChars 와 같은 규칙) */
const START_HEROES = CHAR_ORDER.filter((id) => !CHARACTERS[id]?.unlock);
const JOIN_FLAGS = Object.values(CHARACTERS).filter((c) => c.unlock?.type === 'story' && c.unlock.flag).map((c) => [c.id, c.unlock.flag]);
const RELIC_IDS = new Set(['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5']);
const ENDING_FLAGS = ['ending_bad', 'ending_normal', 'ending_true', 'ending_p2', 'ending_p2true', 'relics_all'];

// ───────────────────────── 세이브 요약 ─────────────────────────
const strSet = (a) => new Set(Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);

/**
 * 세이브 → 업적에 필요한 것만 담은 요약 (순수, 원본을 바꾸지 않는다, 손상 세이브에도 던지지 않는다).
 * 객체가 아니거나 아케이드 임시 세이브(state.arcade)면 null
 */
export function digestState(state) {
  try {
    if (!isObj(state) || state.arcade) return null;
    const p = isObj(state.progress) ? state.progress : {};
    const f = isObj(p.flags) ? p.flags : {};
    const cleared = {};
    if (isObj(p.cleared)) {
      for (const sid of Object.keys(p.cleared)) {
        if (!Object.hasOwn(STAGES, sid)) continue;
        const v = p.cleared[sid];
        if (!v) continue;
        cleared[sid] = { rank: isObj(v) && typeof v.rank === 'string' ? v.rank : null, time: isObj(v) && Number.isFinite(v.time) ? v.time : null };
      }
    }
    const flags = {};
    for (const k of ENDING_FLAGS) if (f[k] === true) flags[k] = true;
    const heroes = {};
    if (isObj(state.heroes)) {
      for (const id of Object.keys(state.heroes)) {
        const h = state.heroes[id];
        if (!Object.hasOwn(CHARACTERS, id) || !isObj(h)) continue;
        const c = typeof h.classId === 'string' && Object.hasOwn(CLASSES, h.classId) ? CLASSES[h.classId] : null;
        heroes[id] = { level: Math.max(0, fin(h.level)), tier: c && (!c.charId || c.charId === id) ? fin(c.tier) : 0 };
      }
    }
    const joined = JOIN_FLAGS.filter(([, flag]) => f[flag] === true).map(([id]) => id);
    if (cleared.s14 && !joined.includes('isolde') && Object.hasOwn(CHARACTERS, 'isolde')) joined.push('isolde');   // migrateState 와 같은 보정 (합류 장면 이전 세이브)
    const owned = {};
    const ow = isObj(state.companions) && isObj(state.companions.owned) ? state.companions.owned : {};
    for (const id of Object.keys(ow)) {
      if (!Object.hasOwn(MOUNTS, id) && !Object.hasOwn(GUARDIANS, id)) continue;
      const e = isObj(ow[id]) ? ow[id] : {};
      owned[id] = { lv: fin(e.lv), bond: fin(e.bond), src: typeof e.src === 'string' ? e.src : null };
    }
    const docs = [...strSet(p.docs)].filter((id) => Object.hasOwn(DOCS, id));
    let relics = [...strSet(p.relics)].filter((id) => RELIC_IDS.has(id)).length;
    if (f.relics_all === true) relics = 5;
    const secrets = Array.isArray(p.secrets) ? new Set(p.secrets.filter((x) => typeof x === 'string' || typeof x === 'number')).size : 0;
    const bestiary = isObj(state.bestiary) ? Object.keys(state.bestiary).filter((id) => Object.hasOwn(ENEMIES, id)) : [];
    const q = isObj(state.quests) ? state.quests : {};
    const questsDone = [...strSet(q.done)];
    const s = isObj(state.stats) ? state.stats : {};
    const stats = { kills: Math.max(0, fin(s.kills)), deaths: Math.max(0, fin(s.deaths)), maxCombo: Math.max(0, fin(s.maxCombo)), minigameWins: Math.max(0, fin(s.minigameWins)) };
    const ig = isObj(state.innGames) ? state.innGames : {};
    const inn = { jackpots: Math.max(0, fin(ig.jackpots)), duelRank: Math.max(0, fin(ig.duelRank)), catGift: ig.catGift === true };
    let enhance = 0;
    if (Array.isArray(state.inventory)) for (const it of state.inventory) if (isObj(it) && Number.isFinite(it.level) && it.level > enhance) enhance = it.level;
    return {
      cleared, bosses: [...strSet(p.bosses)], flags, difficulty: typeof state.difficulty === 'string' ? state.difficulty : 'normal',
      heroes, joined, owned, docs, relics, hearts: strSet(p.hearts).size, shards: strSet(p.shards).size, secrets, bestiary, questsDone,
      stats, inn, enhance,
    };
  } catch { return null; }
}

// ───────────────────────── 지표 ─────────────────────────
const slotsOf = (ctx) => (Array.isArray(ctx?.slots) ? ctx.slots.filter(isObj) : []);
const progOf = (ctx, k) => fin(ctx?.ach?.prog?.[k]);
const maxOf = (ctx, fn) => { let m = 0; for (const d of slotsOf(ctx)) { const v = fin(fn(d)); if (v > m) m = v; } return m; };
const sumOf = (ctx, fn) => { let m = 0; for (const d of slotsOf(ctx)) m += fin(fn(d)); return m; };
const anyOf = (ctx, fn) => slotsOf(ctx).some((d) => { try { return !!fn(d); } catch { return false; } });
const unionOf = (ctx, fn) => { const s = new Set(); for (const d of slotsOf(ctx)) for (const x of fn(d) ?? []) s.add(x); return s; };
const arr = (a) => (Array.isArray(a) ? a : a == null ? [] : [a]);
const RANK_ORDER = 'SABCD';

/** 보스 러시 코스별 기록 (scenes/front/common.js bossRushBests 와 같은 규칙, 메타를 바꾸지 않는다) */
function rushBests(meta) {
  if (isObj(meta?.bossRushBests)) return meta.bossRushBests;
  const b = meta?.bossRushBest;
  return isObj(b) && fin(b.time) > 0 ? { [b.course ?? 0]: b } : {};
}

/** 지표 값 (§3.3). 던지지 않는다 — 모르는 지표는 0 */
export function metric(m, arg, ctx) {
  try {
    const meta = isObj(ctx?.meta) ? ctx.meta : {};
    switch (m) {
      case 'cleared': return arr(arg).filter((sid) => anyOf(ctx, (d) => d.cleared[sid])).length;
      case 'boss': return anyOf(ctx, (d) => d.bosses.includes(arg)) ? 1 : 0;
      case 'ending': { const seen = Array.isArray(meta.endingsSeen) ? meta.endingsSeen : []; return arr(arg).filter((k) => seen.includes(k)).length; }
      case 'kills': return Math.max(progOf(ctx, 'kills'), sumOf(ctx, (d) => d.stats.kills));
      case 'combo': return Math.max(progOf(ctx, 'combo'), maxOf(ctx, (d) => d.stats.maxCombo));
      case 'style': return progOf(ctx, 'style');
      case 'nodmg': return typeof arg === 'string' && arg ? progOf(ctx, 'nd_' + arg) : progOf(ctx, 'nodmg');
      case 'tier': return maxOf(ctx, (d) => Math.max(0, ...Object.values(d.heroes).map((h) => h.tier)));
      case 'tier2all': return CHAR_ORDER.filter((id) => anyOf(ctx, (d) => (d.heroes[id]?.tier ?? 0) >= 2)).length;
      case 'heroes': {
        const set = new Set(meta.konami ? START_HEROES : (Array.isArray(meta.unlockedChars) ? meta.unlockedChars : []));
        for (const id of unionOf(ctx, (d) => d.joined)) set.add(id);
        return CHAR_ORDER.filter((id) => set.has(id)).length;
      }
      case 'level': return maxOf(ctx, (d) => Math.max(0, ...Object.values(d.heroes).map((h) => h.level)));
      case 'awaken': return CHAR_ORDER.filter((id) => progOf(ctx, 'aw_' + id) >= 1).length;
      case 'awaken2': return progOf(ctx, 'aw2');
      case 'cmpAny': return unionOf(ctx, (d) => Object.keys(d.owned)).size;
      case 'mounts': return [...unionOf(ctx, (d) => Object.keys(d.owned))].filter((id) => Object.hasOwn(MOUNTS, id)).length;
      case 'guards': return [...unionOf(ctx, (d) => Object.keys(d.owned))].filter((id) => Object.hasOwn(GUARDIANS, id)).length;
      case 'ride': return progOf(ctx, 'ride');
      case 'egg': return Math.max(progOf(ctx, 'egg') > 0 ? 1 : 0, anyOf(ctx, (d) => Object.values(d.owned).some((e) => e.src === 'egg')) ? 1 : 0);
      case 'bond': return maxOf(ctx, (d) => Math.max(0, ...Object.values(d.owned).map((e) => bondRank(e.bond))));
      case 'cmpLv': return maxOf(ctx, (d) => Math.max(0, ...Object.values(d.owned).map((e) => e.lv)));
      case 'relics': return maxOf(ctx, (d) => d.relics);
      case 'otherworld': return maxOf(ctx, (d) => Math.min(d.hearts, d.shards));
      case 'docs': return unionOf(ctx, (d) => d.docs).size;
      case 'bestiary': return ctx?.beast instanceof Set ? ctx.beast.size : unionOf(ctx, (d) => d.bestiary).size;
      case 'secrets': return maxOf(ctx, (d) => d.secrets);
      case 'enhance': return Math.max(progOf(ctx, 'enh'), maxOf(ctx, (d) => d.enhance));
      case 'quests': return unionOf(ctx, (d) => d.questsDone).size;
      case 'rush': {
        const b = rushBests(meta);
        const ok = (c) => isObj(b[c]) && fin(b[c].time) > 0;
        return arg === 'any' ? Object.keys(b).filter(ok).length : arr(arg).filter((c) => ok(String(c))).length;
      }
      case 'survival': return Math.max(0, fin(meta.survivalBest));
      case 'tower': { const t = isObj(meta.towerBest) ? meta.towerBest : {}; let mx = 0; for (const k of Object.keys(t)) mx = Math.max(mx, fin(t[k]?.floor)); return mx; }
      case 'daily': return progOf(ctx, 'daily_n');
      case 'rushPerfect': return progOf(ctx, 'rush_perfect');
      case 'mgWins': return Math.max(progOf(ctx, 'mg_win'), maxOf(ctx, (d) => d.stats.minigameWins));
      case 'jackpot': return Math.max(progOf(ctx, 'jackpot'), maxOf(ctx, (d) => d.inn.jackpots));
      case 'duel': return maxOf(ctx, (d) => d.inn.duelRank);
      case 'rankS': return arr(arg).filter((sid) => {
        let best = null;
        for (const d of slotsOf(ctx)) { const r = d.cleared[sid]?.rank; if (r && RANK_ORDER.includes(r) && r.length === 1 && (best === null || RANK_ORDER.indexOf(r) < RANK_ORDER.indexOf(best))) best = r; }
        return best === 'S';
      }).length;
      case 'nodmgStage': return progOf(ctx, 'nodmg_stage');
      case 'speed': return anyOf(ctx, (d) => Object.keys(d.cleared).some((sid) => {
        const t = d.cleared[sid].time, par = STAGES[sid]?.parTime;
        return Number.isFinite(t) && t > 0 && Number.isFinite(par) && t <= par * 0.5;
      })) ? 1 : 0;
      case 'diffEnding': {
        const diffs = arr(arg?.diffs), part = arg?.part;
        return anyOf(ctx, (d) => diffs.includes(d.difficulty) && (part === 2
          ? (d.flags.ending_p2 || d.flags.ending_p2true || d.cleared.s20)
          : (d.flags.ending_normal || d.flags.ending_true || d.cleared.s13))) ? 1 : 0;
      }
      case 'heroBoss': return isObj(arg) ? progOf(ctx, hbKey(arg.char, arg.boss)) : 0;
      case 'konami': return meta.konami ? 1 : 0;
      case 'deaths': return Math.max(progOf(ctx, 'deaths'), maxOf(ctx, (d) => d.stats.deaths));
      case 'cat': return anyOf(ctx, (d) => d.inn.catGift) ? 1 : 0;
      case 'all': { const got = isObj(ctx?.ach?.got) ? ctx.ach.got : {}; return ACHIEVEMENTS.filter((d) => d.cond.m !== 'all' && Object.hasOwn(got, d.id)).length; }
      default: return 0;
    }
  } catch { return 0; }
}

/** 조건이 성립하는가 */
export function evaluate(def, ctx) {
  const c = def?.cond;
  return !!c && metric(c.m, c.arg, ctx) >= c.n;
}

/** 아직 얻지 않았고 지금 성립하는 업적 id (데이터 순서, ch_all 은 이번에 얻을 것까지 세어 마지막에) — 순수 */
export function scanDefs(ctx, metrics = null) {
  const got = isObj(ctx?.ach?.got) ? ctx.ach.got : {};
  const out = [];
  const list = metrics ? [...metrics].flatMap((m) => BY_METRIC.get(m) ?? []) : ACHIEVEMENTS;   // 처치마다 부르므로 지표 색인으로
  for (const d of list) {
    if (d.cond.m === 'all' || Object.hasOwn(got, d.id) || out.includes(d.id)) continue;
    if (evaluate(d, ctx)) out.push(d.id);
  }
  if (metrics) out.sort((a, b) => ORDER.get(a) - ORDER.get(b));
  if (ALL_DEF && !Object.hasOwn(got, ALL_DEF.id) && (out.length || !metrics)) {
    const n = ACHIEVEMENTS.filter((d) => d !== ALL_DEF && (Object.hasOwn(got, d.id) || out.includes(d.id))).length;
    if (n >= ALL_DEF.cond.n) out.push(ALL_DEF.id);
  }
  return out;
}

/** 보상 (§5): 정한 것이 없으면 기본 골드 pts × 25. 이명·장식 업적은 골드 없음 */
export function rewardOf(def) {
  const r = def?.reward;
  if (!r) return { gold: fin(def?.pts) * 25, items: [], title: null, deco: null };
  return { gold: fin(r.gold), items: Array.isArray(r.items) ? r.items.map((x) => ({ id: x.id, qty: x.qty ?? 1 })) : [], title: r.title ?? null, deco: r.deco ?? null };
}
/** 골드·소모품을 받는 업적인가 (이명·장식만 주는 업적은 받을 것이 없다) */
const hasClaim = (def) => { const r = rewardOf(def); return r.gold > 0 || r.items.length > 0; };

// ───────────────────────── 엔진 ─────────────────────────
class AchEngine {
  constructor(game, opts) {
    this.game = game;
    this.saves = game.saves ?? SAVES;
    this.digests = { 1: null, 2: null, 3: null };   // 저장된 슬롯 요약 (부팅·쓰기·동기화 뒤)
    this.live = null; this.liveState = null; this.liveDirty = true;   // 지금 game.state 요약
    this.beast = new Set();   // 도감 합집합 캐시 (처치마다 더한다)
    this.writing = false;     // 자기 saveMeta 로 생긴 onWrite('meta') 무시
    this.syncing = false;     // cloud:sync start ~ done
    this.progDirty = false;
    this.boss = null;         // 무피해 보스 추적 { id, dmg, ok }
    this.pend = { metrics: new Set(), slots: new Set(), meta: null, timer: null };
    this.rev = 0;             // 기록이 바뀔 때마다 +1 (화면 캐시용)
    this.offs = [];
    this.subscribe();
    if (opts.boot !== false) this.idle(() => this.rescan('retro'));
  }

  // ── 기반 ──
  get meta() { return this.game.meta; }
  ach() { return ensureAch(this.game.meta); }
  idle(fn, ms = 1200) {
    const run = () => { try { fn(); } catch (e) { console.warn('[ach]', e); } };
    this.bootTimer = setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 4000 }) : run()), ms);
  }
  saveMeta() {
    if (!this.game.meta) return false;
    this.writing = true;
    try { this.progDirty = false; return this.saves.saveMeta?.(this.game.meta); } catch (e) { console.warn('[ach] save', e); return false; } finally { this.writing = false; }
  }
  /** prog 가 바뀌었으면 저장 (드문 저장 지점) */
  flushProg() { if (this.progDirty) this.saveMeta(); }
  setProg(k, v) {
    const p = this.ach().prog;
    const nv = Math.max(0, Math.min(PROG_MAX, Math.floor(v)));
    if (p[k] === nv) return;
    p[k] = nv; this.progDirty = true;
  }
  addProg(k, n = 1) { this.setProg(k, fin(this.ach().prog[k]) + n); }
  maxProg(k, v) { if (fin(v) > fin(this.ach().prog[k])) this.setProg(k, v); }
  /** 지금 게임 중인 스토리 슬롯 (아케이드 임시 세이브 제외) */
  liveSlotState() {
    const st = this.game.state;
    return isObj(st) && !st.arcade && st.slot >= 1 && st.slot <= 3 ? st : null;
  }
  /** 판정 문맥. fresh: 지금 game.state 요약을 새로 만든다 (드문 이벤트 뒤) */
  ctx(fresh = false) {
    const st = this.liveSlotState();
    if (st && (!this.live || this.liveState !== st || (fresh && this.liveDirty))) {
      this.live = digestState(st); this.liveState = st; this.liveDirty = false;
      if (this.live) for (const id of this.live.bestiary) this.beast.add(id);
    }
    const slots = [];
    for (const s of SLOTS) {
      const d = st && st.slot === s ? this.live : this.digests[s];
      if (d) slots.push(d);
    }
    return { meta: this.game.meta ?? {}, ach: this.ach(), slots, beast: this.beast };
  }
  rebuildBeast() {
    this.beast = new Set();
    for (const d of this.ctx().slots) for (const id of d.bestiary) this.beast.add(id);
  }
  /** 저장된 슬롯 하나 다시 요약 (지금 게임 중인 슬롯이면 그 상태로) */
  redigest(slot) {
    const st = this.liveSlotState();
    if (st && st.slot === slot) { this.live = digestState(st); this.liveState = st; this.liveDirty = false; this.digests[slot] = this.live; return; }
    let raw = null;
    try { raw = this.saves.read?.(slot) ?? null; } catch { raw = null; }
    this.digests[slot] = digestState(raw);
  }

  // ── 달성 ──
  /** 조건 판정 → 달성 (metrics 가 있으면 그 지표를 쓰는 업적만) → 새로 얻은 id */
  scan(metrics, src = 'live', fresh = false) {
    const ctx = this.ctx(fresh);
    return this.grant(scanDefs(ctx, metrics), src);
  }
  grant(ids, src) {
    if (!ids.length) return [];
    const ach = this.ach(), now = Date.now();
    const out = [];
    for (const id of ids) if (DEF.has(id) && !Object.hasOwn(ach.got, id)) { ach.got[id] = now; out.push(id); }
    if (ALL_DEF && !Object.hasOwn(ach.got, ALL_DEF.id) && evaluate(ALL_DEF, { ach })) { ach.got[ALL_DEF.id] = now; out.push(ALL_DEF.id); }
    if (!out.length) return [];
    this.rev++;
    bus.emit('achievementUnlocked', { ids: out, src });
    this.saveMeta();
    return out;
  }

  // ── 미뤄 한 번 (세이브 요약이 필요한 사건) ──
  soon({ metrics = null, slot = null, meta = null } = {}) {
    const P = this.pend;
    if (metrics) for (const m of metrics) P.metrics.add(m);
    if (slot !== null) P.slots.add(slot);
    if (meta) P.meta = P.meta === 'cloud' || meta === 'cloud' ? 'cloud' : 'live';
    this.liveDirty = true;
    if (!P.timer) P.timer = setTimeout(() => this.flushPending(), 0);
  }
  flushPending() {
    const P = this.pend;
    P.timer = null;
    const metrics = P.metrics, slots = P.slots, meta = P.meta;
    P.metrics = new Set(); P.slots = new Set(); P.meta = null;
    try {
      for (const s of slots) this.redigest(s);
      if (slots.size) { this.liveDirty = true; this.ctx(true); this.rebuildBeast(); }
      // 슬롯 쓰기는 모든 지표 · 나머지는 그 사건의 지표만
      if (slots.size) this.scan(null, meta === 'cloud' ? 'cloud' : 'live', true);
      else if (metrics.size) this.scan(metrics, 'live', true);
      if (meta && !slots.size) this.scan(new Set(META_METRICS), meta, true);
    } catch (e) { console.warn('[ach]', e); }
  }

  // ── 구독 ──
  on(evt, fn) {
    this.offs.push(bus.on(evt, (d) => { try { fn(d ?? {}); } catch (e) { console.warn('[ach]', evt, e); } }));
  }
  subscribe() {
    const now = (metrics) => this.scan(new Set(metrics), 'live');   // 누적값만 쓰는 지표: 곧바로 (세이브 요약 없이)
    this.on('enemyKilled', (d) => {
      if (!d.byPlayer) return;
      this.addProg('kills');
      const id = d.def?.id;
      if (id && Object.hasOwn(ENEMIES, id) && this.liveSlotState()) this.beast.add(id);
      now(ACH_EVENTS.enemyKilled);
    });
    this.on('comboMilestone', (d) => { this.maxProg('combo', d.n); now(ACH_EVENTS.comboMilestone); });
    this.on('styleRankUp', (d) => { this.maxProg('style', d.rank); now(ACH_EVENTS.styleRankUp); });
    this.on('bossStarted', (d) => { this.boss = { id: d.bossId, dmg: fin(this.game.world?.run?.damageTaken), ok: true }; });
    this.on('playerHurt', () => { if (this.boss) this.boss.ok = false; });
    this.on('playerDied', () => { if (this.boss) this.boss.ok = false; this.addProg('deaths'); now(ACH_EVENTS.playerDied); });
    this.on('bossKilled', (d) => {
      const b = this.boss;
      this.boss = null;
      if (d.mode === 'story' || d.mode === 'practice') {
        if (b && b.ok && b.id === d.bossId && fin(this.game.world?.run?.damageTaken) === b.dmg) {
          this.addProg('nodmg');
          if (NODMG_BOSSES.has(d.bossId)) this.setProg('nd_' + d.bossId, 1);
        }
      }
      if (d.mode === 'story') {
        for (const hb of HERO_BOSS) if (hb.boss === d.bossId && hb.char === d.charId) this.setProg(hbKey(hb.char, hb.boss), 1);
        now(['nodmg', 'heroBoss']);
        this.soon({ metrics: ['boss'] });
        this.flushProg();
      } else now(['nodmg']);
    });
    this.on('stageCleared', (d) => {
      if (d.noDamage === true && this.liveSlotState()) this.addProg('nodmg_stage');
      now(['nodmgStage']);
      this.soon({ metrics: ACH_EVENTS.stageCleared });
      this.flushProg();
    });
    this.on('awakenCast', (d) => {
      if (CHAR_ORDER.includes(d.charId)) this.setProg('aw_' + d.charId, 1);
      if (fin(d.tier) >= 2) this.addProg('aw2');
      now(ACH_EVENTS.awakenCast);
    });
    this.on('mounted', () => { this.maxProg('ride', 1); now(ACH_EVENTS.mounted); });
    this.on('eggHatched', () => { this.setProg('egg', 1); now(ACH_EVENTS.eggHatched); });
    this.on('enhance', (d) => { if (d.success) this.maxProg('enh', d.level); this.soon({ metrics: ACH_EVENTS.enhance }); });
    this.on('minigame', (d) => {
      if (d.win) this.addProg('mg_win');
      if (d.reward?.tier === 'jackpot') this.addProg('jackpot');
      now(ACH_EVENTS.minigame);
    });
    this.on('arcadeFinished', (d) => {
      if (d.kind === 'practice' && d.cleared && d.daily) {
        const day = Number(d.daily);
        if (Number.isInteger(day) && day > 0 && day > fin(this.ach().prog.daily_last)) { this.addProg('daily_n'); this.setProg('daily_last', day); }
      }
      if (d.kind === 'bossrush' && d.cleared && isObj(d.extra) && fin(d.extra.total) > 0 && fin(d.extra.perfect) === fin(d.extra.total)) this.addProg('rush_perfect');
      now(ACH_EVENTS.arcadeFinished);
      this.flushProg();
    });
    // 세이브 상태가 바뀌는 사건 → 미뤄 한 번 요약
    for (const evt of ['levelUp', 'classChanged', 'companionUnlocked', 'bondUp', 'companionLevelUp', 'relicFound', 'heartFound', 'shardFound', 'docFound', 'secretFound', 'questClaimed']) {
      this.on(evt, () => this.soon({ metrics: ACH_EVENTS[evt] }));
    }
    this.on('cloud:sync', (d) => {
      if (d.phase === 'start') this.syncing = true;
      else if (d.phase === 'done') {
        this.syncing = false;
        if (d.ok) setTimeout(() => { try { this.rescan('cloud'); } catch (e) { console.warn('[ach]', e); } }, 0);
      }
    });
    const offW = this.saves.onWrite?.((ev) => {
      if (!ev) return;
      if (ev.type === 'meta') { if (!this.writing) this.soon({ meta: this.syncing ? 'cloud' : 'live' }); return; }
      if (!SLOTS.includes(ev.slot)) return;
      if (ev.type === 'remove') { this.digests[ev.slot] = null; if (this.liveSlotState()?.slot !== ev.slot) this.rebuildBeast(); return; }
      if (ev.type === 'write') this.soon({ slot: ev.slot });
    });
    if (typeof offW === 'function') this.offs.push(offW);
    if (typeof document !== 'undefined' && document.addEventListener) {
      const vis = () => { if (document.visibilityState === 'hidden') this.flushProg(); };
      document.addEventListener('visibilitychange', vis);
      this.offs.push(() => document.removeEventListener('visibilitychange', vis));
    }
  }
  dispose() {
    for (const off of this.offs) { try { off(); } catch { /* 무시 */ } }
    this.offs = [];
    clearTimeout(this.pend.timer); clearTimeout(this.bootTimer);
  }

  // ── 소급 ──
  /** 메타 + 저장된 슬롯 셋을 다시 읽어 모든 업적을 본다 → 새로 얻은 id */
  rescan(src = 'retro') {
    for (const s of SLOTS) this.redigest(s);
    this.liveDirty = true;
    const ctx = this.ctx(true);
    this.rebuildBeast();
    // 누적값의 바닥을 슬롯 통계로 맞춘다 (이후 처치·죽음이 실시간으로 문턱을 넘게)
    this.maxProg('kills', metric('kills', null, ctx));
    this.maxProg('deaths', metric('deaths', null, ctx));
    return this.scan(null, src);
  }

  // ── 공개 API 몸체 ──
  status(id, ctx = null) {
    const def = DEF.get(id);
    if (!def) return null;
    const ach = this.ach();
    const got = Object.hasOwn(ach.got, id) ? ach.got[id] : null;
    const c = ctx ?? this.ctx(true);
    const need = def.cond.n;
    const cur = got !== null ? need : Math.min(need, metric(def.cond.m, def.cond.arg, c));
    const claimed = ach.claimed.includes(id);
    return {
      got, cur, need, bar: BAR_METRICS.has(def.cond.m) && need > 1, isNew: got !== null && got > ach.seenAt,
      claimable: got !== null && !claimed && hasClaim(def), claimed, hiddenLocked: !!def.hidden && got === null,
    };
  }
  list(cat = 'all') {
    const ctx = this.ctx(true);
    return ACHIEVEMENTS.filter((d) => cat === 'all' || d.cat === cat).map((def) => ({ def, ...this.status(def.id, ctx) }));
  }
  summary() {
    const ach = this.ach();
    const byCat = {};
    for (const c of ACH_CATS) byCat[c.id] = { got: 0, total: 0 };
    let got = 0, pts = 0, ptsMax = 0, unseen = 0, claimable = 0;
    for (const d of ACHIEVEMENTS) {
      const bc = byCat[d.cat] ?? (byCat[d.cat] = { got: 0, total: 0 });
      bc.total++; ptsMax += d.pts;
      if (!Object.hasOwn(ach.got, d.id)) continue;
      got++; bc.got++; pts += d.pts;
      if (ach.got[d.id] > ach.seenAt) unseen++;
      if (hasClaim(d) && !ach.claimed.includes(d.id)) claimable++;
    }
    return { got, total: ACHIEVEMENTS.length, pts, ptsMax, byCat, unseen, claimable };
  }
  reward(id) {
    const def = DEF.get(id);
    if (!def) return null;
    const r = rewardOf(def), ach = this.ach();
    return {
      gold: r.gold, items: r.items.map((x) => ({ ...x, name: ITEMS[x.id]?.name ?? x.id })),
      title: r.title ? { id: r.title, name: ACH_TITLES[r.title]?.name ?? r.title } : null,
      deco: r.deco ? { id: r.deco, name: ACH_DECOS[r.deco]?.name ?? r.deco } : null,
      claimable: hasClaim(def), claimed: ach.claimed.includes(id),
    };
  }
  titles() {
    const got = this.ach().got;
    return Object.keys(ACH_TITLES).map((id) => ({ id, name: ACH_TITLES[id].name, got: !!TITLE_FROM[id] && Object.hasOwn(got, TITLE_FROM[id]), from: TITLE_FROM[id] ?? null }));
  }
  decos() {
    const got = this.ach().got;
    return Object.keys(ACH_DECOS).map((id) => ({ id, name: ACH_DECOS[id].name, got: !!DECO_FROM[id] && Object.hasOwn(got, DECO_FROM[id]), from: DECO_FROM[id] ?? null }));
  }
  ownsTitle(id) { const f = TITLE_FROM[id]; return !!f && Object.hasOwn(ACH_TITLES, id) && Object.hasOwn(this.ach().got, f); }
  ownsDeco(id) { const f = DECO_FROM[id]; return !!f && Object.hasOwn(ACH_DECOS, id) && Object.hasOwn(this.ach().got, f); }
  title() { const t = this.ach().title; return t && this.ownsTitle(t) ? t : null; }
  deco() { const t = this.ach().deco; return t && this.ownsDeco(t) ? t : null; }
  setTitle(id) {
    if (id !== null && !this.ownsTitle(id)) return false;
    const ach = this.ach();
    if (ach.title !== id) { ach.title = id; this.rev++; }
    this.saveMeta();
    return true;
  }
  setDeco(id) {
    if (id !== null && !this.ownsDeco(id)) return false;
    const ach = this.ach();
    if (ach.deco !== id) { ach.deco = id; this.rev++; }
    this.saveMeta();
    return true;
  }
  claimableIds() {
    const ach = this.ach();
    return ACHIEVEMENTS.filter((d) => Object.hasOwn(ach.got, d.id) && !ach.claimed.includes(d.id) && hasClaim(d)).map((d) => d.id);
  }
  canClaim(state = this.game.state) {
    if (isObj(state) && state.arcade) return { ok: false, reason: 'arcade' };
    if (!isObj(state) || !(state.slot >= 1 && state.slot <= 3)) return { ok: false, reason: 'no_slot' };
    if (this.game.world?.mode !== 'town') return { ok: false, reason: 'not_town' };
    if (!this.claimableIds().length) return { ok: false, reason: 'none' };
    return { ok: true, reason: null };
  }
  claimAll(state = this.game.state) {
    if (!this.canClaim(state).ok) return null;
    const ids = this.claimableIds();
    let gold = 0, queued = 0;
    const qty = new Map();
    for (const id of ids) {
      const r = rewardOf(DEF.get(id));
      gold += r.gold;
      for (const it of r.items) if (Object.hasOwn(ITEMS, it.id)) qty.set(it.id, (qty.get(it.id) ?? 0) + it.qty);
    }
    state.gold = fin(state.gold) + gold;
    const items = [];
    for (const [id, n] of qty) {
      let q = 0;
      try { q = grantItem(state, id, n).queued ?? 0; } catch (e) { console.warn('[ach] item', id, e); }
      queued += q;
      items.push({ id, qty: n, name: ITEMS[id]?.name ?? id });
    }
    try { this.saves.write?.(state.slot, state); } catch (e) { console.warn('[ach] write', e); }
    const ach = this.ach();
    ach.claimed = [...new Set([...ach.claimed, ...ids])].sort();
    this.rev++;
    this.saveMeta();
    return { gold, items, queued, ids };
  }
  markSeen() {
    const ach = this.ach();
    ach.seenAt = Date.now();
    this.rev++;
    this.saveMeta();
  }
  _grant(id, src = 'live') {
    if (!DEF.has(id)) return [];
    return this.grant([id], src);
  }
}

/**
 * 엔진 시작 (한 번만) → game.ach. opts.boot === false 면 부팅 소급 훑기를 하지 않는다 (시험)
 */
export function initAchievements(game, opts = {}) {
  if (game.ach?._engine) return game.ach;
  const E = new AchEngine(game, opts);
  game.ach = {
    _engine: E,
    defs: ACHIEVEMENTS,
    cats: ACH_CATS,
    hiddenText: ACH_HIDDEN,
    get rev() { return E.rev; },
    status: (id) => E.status(id),
    list: (cat = 'all') => E.list(cat),
    summary: () => E.summary(),
    reward: (id) => E.reward(id),
    titles: () => E.titles(),
    title: () => E.title(),
    setTitle: (id) => E.setTitle(id ?? null),
    decos: () => E.decos(),
    deco: () => E.deco(),
    setDeco: (id) => E.setDeco(id ?? null),
    canClaim: (state = game.state) => E.canClaim(state),
    claimAll: (state = game.state) => E.claimAll(state),
    markSeen: () => E.markSeen(),
    rescan: (src = 'retro') => E.rescan(src),
    _grant: (id, src = 'live') => E._grant(id, src),
    _dispose: () => { E.dispose(); if (game.ach?._engine === E) delete game.ach; },
  };
  return game.ach;
}
