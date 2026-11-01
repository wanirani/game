// 「사냥 일지」 런타임 (Stage 6 HUNT). 공개 API (s = game.state 세이브 객체):
//  initHunt(game)                  : 이벤트 버스 구독 (game/quests.js initQuests 가 부트 때 한 번 부른다). game.hunt = { sync, list, claim, summary } 바인딩
//  huntDay(date?) / huntWeek(day)  : 기기 현지 날짜 → 날 번호(1970-01-01 = 0) · 주 번호(월요일 시작)
//  ensureHunt(s)                   : state.hunt 정리 (없거나 깨진 필드 → 빈 일지). 아케이드 임시 세이브(s.arcade)에는 만들지 않는다 → null
//  syncHunt(s, date?)              : 날·주가 바뀌었으면 계약을 새로 뽑는다 (같은 날·같은 진행이면 늘 같은 계약 — 씨앗 = 날짜, 서버 없음)
//  rollDaily(s, day) / rollWeekly(s, week) : 뽑기만 (저장하지 않음 — 테스트용)
//  huntEligible(s)                 : { stages: 깬 이야기 스테이지 id[], heroes: 가진 영웅 id[], nm: 도전할 수 있는 악몽 행 id[] }
//  huntList(s)                     : [{ c, cur, need, done, claimed }] (주간 먼저, 지난 날의 받지 않은 계약은 끝에)
//  huntProgressOf(s, c)            : { cur, need, done }
//  claimHunt(s, id)                : 보상 → { gold, exp, items:[{id,qty,name}], pts, levelUps, rank, rankUp, queued? } | null (한 번만)
//  huntSummary(s)                  : { rank, rankName, pts, next, ready, open, total }
// 세이브: state.hunt = { day, week, picks: [계약], prog: { [계약 id]: n }, claimed: [계약 id], pts } — 없으면 빈 일지 (옛 세이브 그대로 열린다)
//  계약 = { id: 'd<날>_<i>' | 'w<주>', slot: 'd'|'w', kind, stage, lv, enemy?, n?, t?, hero?, nm? }
//  날이 바뀌면: 달성했지만 받지 않은 계약은 남기고(old), 나머지는 버린다. prog·claimed 도 남은 계약 것만.
// 진행: 이야기 스테이지(world.mode 'story' · 시련·아케이드·일일 도전·악몽 아님)와 악몽 토벌(nightmareCleared)만 센다.
//  AUTO(world.run.assisted) 판은 처치·촛대는 세고, 솜씨 계약(질주·불굴·지명)은 세지 않는다 (업적과 같은 규칙).
import { bus } from '../core/events.js';
import { audio } from '../core/audio.js';
import { RNG, hashStr } from '../core/math.js';
import { STAGES } from '../data/stages.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { CHARACTERS } from '../data/characters.js';
import { ITEMS } from '../data/items.js';
import { NM } from '../data/nightmare.js';
import { HUNT_DAILY, HUNT_DAILY_KINDS, HUNT_RANKS, HUNT_COLOR, huntReward, huntNeed, huntTitle, huntGoal, huntRankOf, huntRankNext } from '../data/hunt_journal.js';
import { grantItem } from './inventory.js';
import { addExpShared } from './progression.js';

export { HUNT_RANKS, HUNT_COLOR, huntReward, huntTitle, huntRankOf, huntRankNext };
let G = null;
/** 지금 스테이지 판의 쓰러짐 수 (stageEntered 에서 0) */
let runDeaths = 0;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const KINDS = new Set(['kill', 'swift', 'boss', 'hero', 'candle', 'nm', 'sweep']);

/** 기기 현지 날짜의 날 번호 (1970-01-01 = 0) */
export function huntDay(date = new Date()) {
  const d = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
/** 날 번호 → 주 번호 (월요일 시작: 1970-01-05 월요일 = 1주) */
export const huntWeek = (day) => Math.floor((Math.floor(day) + 3) / 7);
/** 다음 날·다음 주까지 남은 초 (현지 자정 기준) */
export function huntTimeLeft(date = new Date()) {
  const d = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const day = Math.max(0, (mid - d.getTime()) / 1000);
  const dow = (d.getDay() + 6) % 7;   // 월 = 0
  return { day, week: day + (6 - dow) * 86400 };
}

/** 계약 한 장이 온전한가 */
function validContract(c) {
  if (!isObj(c) || typeof c.id !== 'string' || !KINDS.has(c.kind) || (c.slot !== 'd' && c.slot !== 'w')) return false;
  if (c.kind !== 'sweep' && !Object.hasOwn(STAGES, c.stage)) return false;
  if (c.kind === 'kill' && !Object.hasOwn(ENEMIES, c.enemy)) return false;
  if (c.kind === 'hero' && !Object.hasOwn(CHARACTERS, c.hero)) return false;
  if (c.kind === 'nm' && !Object.hasOwn(NM, c.nm)) return false;
  return true;
}

/** state.hunt 정리 (멱등). 아케이드 임시 세이브 → null (만들지 않는다) */
export function ensureHunt(s) {
  if (!isObj(s) || s.arcade) return null;
  if (!isObj(s.hunt)) s.hunt = { day: null, week: null, picks: [], prog: {}, claimed: [], pts: 0 };
  const h = s.hunt;
  if (!fin(h.day)) h.day = null;
  if (!fin(h.week)) h.week = null;
  h.picks = (Array.isArray(h.picks) ? h.picks : []).filter(validContract);
  const seen = new Set();
  h.picks = h.picks.filter((c) => !seen.has(c.id) && seen.add(c.id));
  if (!isObj(h.prog)) h.prog = {};
  for (const k of Object.keys(h.prog)) if (!fin(h.prog[k]) || h.prog[k] < 0) delete h.prog[k];
  h.claimed = [...new Set((Array.isArray(h.claimed) ? h.claimed : []).filter((x) => typeof x === 'string'))];
  h.pts = fin(h.pts) && h.pts > 0 ? Math.floor(h.pts) : 0;
  return h;
}

/** 깬 이야기 스테이지 · 가진 영웅 · 도전할 수 있는 악몽 행 (정렬 — 뽑기가 순서에 흔들리지 않게) */
export function huntEligible(s) {
  const p = isObj(s?.progress) ? s.progress : {};
  const cleared = isObj(p.cleared) ? p.cleared : {};
  const stages = Object.keys(cleared).filter((id) => p.cleared[id] && Object.hasOwn(STAGES, id) && (STAGES[id].chapter ?? 0) > 0 && STAGES[id].rooms).sort();
  const heroes = Object.keys(isObj(s?.heroes) ? s.heroes : {}).filter((id) => Object.hasOwn(CHARACTERS, id)).sort();
  const bosses = Array.isArray(p.bosses) ? p.bosses : [];
  const nm = Object.values(NM).filter((e) => STAGES[e.stage]?.rooms?.boss && (bosses.includes(e.boss) || !!cleared[e.stage] || !!p.flags?.['boss_' + e.boss])).map((e) => e.id).sort();
  return { stages, heroes, nm };
}

function weighted(rng, list) {
  const tot = list.reduce((a, [, w]) => a + w, 0);
  let r = rng.next() * tot;
  for (const [k, w] of list) { r -= w; if (r < 0) return k; }
  return list[list.length - 1][0];
}
const killable = (sid) => (Array.isArray(STAGES[sid]?.enemies) ? STAGES[sid].enemies : []).filter((id) => id !== 'mimic' && Object.hasOwn(ENEMIES, id) && !ENEMIES[id].boss);
const hasBoss = (sid) => !!STAGES[sid]?.rooms?.boss && !!STAGES[sid]?.boss;

/** 그날의 일일 계약 3장 (같은 날 · 같은 깬 스테이지 · 같은 영웅 → 같은 계약). 깬 스테이지가 없으면 [] */
export function rollDaily(s, day) {
  const el = huntEligible(s);
  if (!el.stages.length) return [];
  const rng = new RNG(hashStr(`hunt:d:${day}`));
  const out = [], used = new Set();
  for (let tries = 0; out.length < HUNT_DAILY && tries < 40; tries++) {
    let kind = weighted(rng, HUNT_DAILY_KINDS);
    const sid = el.stages[Math.floor(rng.next() * el.stages.length)];
    if ((kind === 'boss' || kind === 'hero') && !hasBoss(sid)) kind = 'kill';
    if (kind === 'hero' && el.heroes.length < 2) kind = 'boss';
    if (kind === 'kill' && !killable(sid).length) kind = 'candle';
    const key = `${kind}:${sid}`;
    if (used.has(key) || out.some((c) => c.stage === sid && out.length < el.stages.length)) continue;
    used.add(key);
    const st = STAGES[sid];
    const c = { id: `d${day}_${out.length}`, slot: 'd', kind, stage: sid, lv: st.level ?? 1 };
    if (kind === 'kill') { const ks = killable(sid); c.enemy = ks[Math.floor(rng.next() * ks.length)]; c.n = 8 + Math.floor(rng.next() * 7); }
    else if (kind === 'swift') c.t = Math.max(120, Math.round((st.parTime ?? 300) / 10) * 10);
    else if (kind === 'hero') c.hero = el.heroes[Math.floor(rng.next() * el.heroes.length)];
    else if (kind === 'candle') c.n = 6 + Math.floor(rng.next() * 5);
    out.push(c);
  }
  return out;
}
/** 그 주의 주간 계약 1장: 도전할 수 있는 악몽 토벌 한 줄 → 없으면 이야기 스테이지 5곳 클리어. 깬 스테이지가 없으면 null */
export function rollWeekly(s, week) {
  const el = huntEligible(s);
  if (!el.stages.length) return null;
  const rng = new RNG(hashStr(`hunt:w:${week}`));
  const top = el.stages.reduce((m, id) => Math.max(m, STAGES[id].level ?? 1), 1);
  if (el.nm.length) {
    const id = el.nm[Math.floor(rng.next() * el.nm.length)], e = NM[id];
    return { id: `w${week}`, slot: 'w', kind: 'nm', nm: id, stage: e.stage, lv: Math.max(STAGES[e.stage]?.level ?? 1, top) };
  }
  return { id: `w${week}`, slot: 'w', kind: 'sweep', n: 5, lv: top };
}

/** 날·주가 바뀌었으면 계약을 다시 뽑는다. 달성했지만 받지 않은 지난 계약은 남는다 → 일지 */
export function syncHunt(s, date = new Date()) {
  const h = ensureHunt(s);
  if (!h) return null;
  const day = huntDay(date), week = huntWeek(day);
  const keepOld = (c) => !h.claimed.includes(c.id) && huntProgressOf(s, c).done;
  const hasDay = h.picks.some((c) => c.slot === 'd' && c.id.startsWith(`d${day}_`));
  const hasWeek = h.picks.some((c) => c.id === `w${week}`);
  let changed = false;
  if (h.day !== day || !hasDay) {
    const fresh = hasDay ? [] : rollDaily(s, day);
    if (h.day !== day || fresh.length) {
      h.picks = h.picks.filter((c) => c.slot !== 'd' || c.id.startsWith(`d${day}_`) || keepOld(c)).concat(fresh);
      h.day = day; changed = true;
    }
  }
  if (h.week !== week || !hasWeek) {
    const w = hasWeek ? null : rollWeekly(s, week);
    if (h.week !== week || w) {
      h.picks = h.picks.filter((c) => c.slot !== 'w' || c.id === `w${week}` || keepOld(c)).concat(w ? [w] : []);
      h.week = week; changed = true;
    }
  }
  if (changed) {
    const ids = new Set(h.picks.map((c) => c.id));
    for (const k of Object.keys(h.prog)) if (!ids.has(k)) delete h.prog[k];
    h.claimed = h.claimed.filter((id) => ids.has(id));
  }
  return h;
}

export function huntProgressOf(s, c) {
  const need = huntNeed(c);
  const n = fin(s?.hunt?.prog?.[c?.id]) ? s.hunt.prog[c.id] : 0;
  return { cur: Math.min(n, need), need, done: n >= need };
}
/** 화면용 목록 (지금 날·주 계약 먼저: 주간 → 일일 → 지난 계약) */
export function huntList(s, date = new Date()) {
  const h = syncHunt(s, date);
  if (!h) return [];
  const day = huntDay(date), week = huntWeek(day);
  const cur = (c) => (c.slot === 'w' ? c.id === `w${week}` : c.id.startsWith(`d${day}_`));
  const order = (c) => (!cur(c) ? 2 : c.slot === 'w' ? 0 : 1);
  return h.picks.map((c) => ({ c, ...huntProgressOf(s, c), claimed: h.claimed.includes(c.id), old: !cur(c) }))
    .sort((a, b) => order(a.c) - order(b.c));
}

/** 이름 찾기 (계약 글) */
export const HUNT_NAMES = Object.freeze({
  stage: (id) => STAGES[id]?.name ?? id,
  enemy: (id) => ENEMIES[id]?.name ?? id,
  boss: (id) => BOSSES[id]?.name ?? id,
  hero: (id) => CHARACTERS[id]?.name ?? id,
});
export const huntGoalText = (c) => huntGoal(c, HUNT_NAMES);
export function huntRewardText(c) {
  const r = huntReward(c);
  const parts = [`${r.gold.toLocaleString('ko-KR')} G`, `EXP ${r.exp.toLocaleString('ko-KR')}`];
  for (const i of r.items) parts.push(`${ITEMS[i.id]?.name ?? i.id} ×${i.qty}`);
  parts.push(`일지 +${r.pts}`);
  return parts.join(' · ');
}

/** 보상 받기 (달성 · 아직 받지 않음 · 일지에 있는 계약만) */
export function claimHunt(s, id) {
  const h = ensureHunt(s);
  if (!h) return null;
  const c = h.picks.find((x) => x.id === id);
  if (!c || h.claimed.includes(id) || !huntProgressOf(s, c).done) return null;
  h.claimed.push(id);
  const r = huntReward(c);
  const rank0 = huntRankOf(h.pts);
  h.pts += r.pts;
  const out = { gold: r.gold, exp: r.exp, items: [], pts: r.pts, levelUps: 0, rank: huntRankOf(h.pts) };
  out.rankUp = out.rank > rank0;
  s.gold = (fin(s.gold) ? s.gold : 0) + r.gold;
  const hero = s.heroes?.[s.charId];
  if (hero && r.exp) { const x = addExpShared(s, r.exp, hero, { source: 'quest' }); out.levelUps = x.ups; out.benchExp = x.benchExp; }
  for (const i of r.items) {
    if (!ITEMS[i.id]) continue;
    const { queued } = grantItem(s, i.id, i.qty);
    if (queued) out.queued = (out.queued ?? 0) + queued;
    out.items.push({ id: i.id, qty: i.qty, name: ITEMS[i.id].name });
  }
  if (out.levelUps && G?.world?.player?.hero === hero) G.world.player.refreshStats?.();
  try { bus.emit('huntClaimed', { id, rank: out.rank, rankUp: out.rankUp }); } catch { /* 구독자 오류 무시 */ }
  return out;
}

export function huntSummary(s, date = new Date()) {
  const list = huntList(s, date);
  const pts = s?.hunt?.pts ?? 0, rank = huntRankOf(pts);
  return {
    rank, rankName: HUNT_RANKS[rank].name, pts, next: huntRankNext(pts),
    ready: list.filter((e) => e.done && !e.claimed).length,
    open: list.filter((e) => !e.done && !e.claimed).length,
    total: list.length,
  };
}

// ═════════════ 진행 (이벤트) ═════════════
/** 지금 이야기 스테이지 판인가 (시련·악몽·아케이드·일일 도전·마을 아님) */
function storyWorld(s) {
  const w = G?.world;
  return !!w && w.mode === 'story' && !w.trial && !w.arcade && !s?.arcade && !w.opts?.nightmare && !!w.stage?.id;
}
const assisted = () => !!G?.world?.run?.assisted;

/** 맞는 계약의 진행을 올리고, 처음 달성하면 토스트. pred(c) → 더할 값 (0 = 해당 없음) · set = 바로 달성 */
export function bumpHunt(s, pred) {
  const h = ensureHunt(s);
  if (!h) return [];
  const done = [];
  for (const c of h.picks) {
    if (h.claimed.includes(c.id)) continue;
    const add = pred(c);
    if (!(add > 0)) continue;
    const before = huntProgressOf(s, c).done;
    h.prog[c.id] = Math.min(huntNeed(c), (fin(h.prog[c.id]) ? h.prog[c.id] : 0) + add);
    if (!before && huntProgressOf(s, c).done) done.push(c);
  }
  for (const c of done) {
    try { G?.toast?.(`사냥 일지 달성! 「${huntTitle(c)}」 — 게시판에서 보상을 받으세요`, HUNT_COLOR, 3); audio.sfx('secret'); } catch { /* 토스트 없음 (node) */ }
    try { bus.emit('huntDone', { id: c.id }); } catch { /* 무시 */ }
  }
  return done;
}

/** 이벤트 → 진행 (node 테스트가 G 없이 부를 수 있게 따로) — ev: 이벤트 이름, d: 내용, story: 이야기 판 여부, auto: AUTO 판 */
export function huntEvent(s, ev, d = {}, { story = false, auto = false } = {}) {
  if (!isObj(s) || s.arcade) return [];
  const h = ensureHunt(s);
  if (!h || !h.picks.length) return [];
  switch (ev) {
    case 'stageEntered': runDeaths = 0; return [];
    case 'playerDied': runDeaths++; return [];
    case 'enemyKilled': {
      if (!story || d.byPlayer === false) return [];
      const id = d.def?.id ?? d.enemy?.def?.id, sid = d.stageId;
      return bumpHunt(s, (c) => (c.kind === 'kill' && c.stage === sid && c.enemy === id ? 1 : 0));
    }
    case 'candleBroken':
      if (!story) return [];
      return bumpHunt(s, (c) => (c.kind === 'candle' && c.stage === d.stageId ? 1 : 0));
    case 'bossKilled':
      if (!story || auto || d.assisted || d.mode !== 'story') return [];
      return bumpHunt(s, (c) => ((c.kind === 'boss' && c.stage === d.stageId && runDeaths === 0) || (c.kind === 'hero' && c.stage === d.stageId && c.hero === d.charId) ? 1 : 0));
    case 'stageCleared':
      if (auto || d.assisted) return [];
      return bumpHunt(s, (c) => ((c.kind === 'swift' && c.stage === d.stageId && fin(d.time) && d.time <= c.t) || c.kind === 'sweep' ? 1 : 0));
    case 'nightmareCleared':
      return bumpHunt(s, (c) => (c.kind === 'nm' && c.nm === d.id ? 1 : 0));
  }
  return [];
}

export function initHunt(game) {
  G = game;
  game.hunt = {
    sync: () => syncHunt(game.state),
    list: () => huntList(game.state),
    claim: (id) => claimHunt(game.state, id),
    summary: () => huntSummary(game.state),
  };
  const on = (ev, story) => bus.on(ev, (d) => {
    const s = game.state;
    if (!isObj(s?.progress)) return;
    try {
      const x = { ...(d || {}) };
      if (ev === 'enemyKilled' || ev === 'candleBroken') x.stageId ??= game.world?.stage?.id;
      huntEvent(s, ev, x, { story: story ? storyWorld(s) : !s.arcade, auto: assisted() });
    } catch (err) { console.warn('[hunt]', err); }
  });
  on('stageEntered', false); on('playerDied', false);
  on('enemyKilled', true); on('candleBroken', true); on('bossKilled', true);
  on('stageCleared', false); on('nightmareCleared', false);
}
