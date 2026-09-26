// 퀘스트 런타임. 공개 API (state = game.state 세이브 객체):
//  initQuests(game)                 : 이벤트 버스 구독 (부트 시 1회). game.quests = { accept, claim, available, active, completed, text, canClaim, status } 바인딩 제공
//  availableQuests(state, giver?)   : 지금 수락 가능한 퀘스트 정의 배열 (giver: npcId|'board' 로 거르기)
//  acceptQuest(state, qid)          : 수락 → true/false (토스트 표시)
//  questProgressText(state, qid)    : '구울 처치 7/12' 같은 진행 문자열
//  questProgress(state, qid)        : { cur, need, done }
//  canClaim(state, qid)             : 목표 달성 & 보상 미수령 여부
//  claimQuest(state, qid)           : 보상 지급(재료 전달 퀘스트는 재료 소모) → { gold, exp, items:[{id,qty,name}], levelUps } | null
//  activeQuests(state) / completedQuests(state) : 퀘스트 정의 배열 (메인 먼저)
//  questStatus(state, qid)          : 'locked'|'available'|'active'|'ready'|'done'
//  rewardText(qid)                  : '1,200 G · EXP 800 · 강화석 ×2'
// 세이브: state.quests = { active: { [qid]: { n, t, ready } }, done: [qid...] }
// 메인 퀘스트는 챕터 조건이 맞으면 자동 수락, 달성 즉시 자동 보상.
// 부가 효과: 유물 5개를 모으면 스토리 플래그 relics_all 을 켠다 (story.js 의 s12_outro 분기용).
import { bus } from '../core/events.js';
import { audio } from '../core/audio.js';
import { QUESTS, QUEST_ORDER } from '../data/quests.js';
import { ITEMS } from '../data/items.js';
import { ENEMIES } from '../data/enemies.js';
import { BOSSES } from '../data/bosses.js';
import { STAGES } from '../data/stages.js';
import { NPCS } from '../data/npcs.js';
import { addByBase, countItem, consumeByBase } from './inventory.js';
import { addExp } from './progression.js';

let G = null;
let claiming = 0; // 보상 지급 중 발생하는 itemPicked/levelUp 등의 중첩 처리 방지
const RANKS = 'SABCD';
const MINIGAME_NAMES = { dice: '주사위', blackjack: '블랙잭', slot: '슬롯머신', duel: '결투', memory: '기억력 카드' };

function ensure(s) {
  s.quests ??= { active: {}, done: [] };
  s.quests.active ??= {};
  s.quests.done ??= [];
  return s.quests;
}
const fmtN = (n) => Math.floor(n).toLocaleString('ko-KR');
const gameKey = (g) => String(g ?? '').replace(/^minigame_/, '');
const rankOk = (have, want) => !!have && (!want || RANKS.indexOf(have) <= RANKS.indexOf(want));
const enemyMatch = (want, id) => Array.isArray(want) ? want.includes(id) : want === id;

function reqOk(s, q) {
  const r = q.req || {};
  const p = s.progress || {};
  if ((p.chapter ?? 0) < (r.chapter ?? 0)) return false;
  if (r.flag && !p.flags?.[r.flag]) return false;
  if (r.relics && (p.relics?.length ?? 0) < r.relics) return false;
  if (r.quest && !ensure(s).done.includes(r.quest)) return false;
  return true;
}

function maxEnhance(s) {
  let m = 0;
  for (const i of s.inventory || []) if ((i.level ?? 0) > m) m = i.level;
  return m;
}

/** 진행도 { cur, need, done } */
export function questProgress(s, qid) {
  const q = QUESTS[qid];
  if (!q || !s) return { cur: 0, need: 1, done: false };
  const g = q.goal, e = ensure(s).active[qid] || { n: 0 };
  const p = s.progress || {};
  let cur = 0, need = 1;
  switch (g.type) {
    case 'kill': case 'killAny': cur = e.n; need = g.count; break;
    case 'boss': cur = g.again ? e.n : (p.bosses?.includes(g.boss) ? 1 : 0); break;
    case 'clear': { const c = p.cleared?.[g.stage]; cur = c && (!g.rank || rankOk(c.rank, g.rank)) ? 1 : 0; break; }
    case 'collect': cur = countItem(s, g.item); need = g.count; break;
    case 'docs': cur = p.docs?.length ?? 0; need = g.count; break;
    case 'relics': cur = p.relics?.length ?? 0; need = g.count; break;
    case 'enhance': cur = Math.max(e.n, maxEnhance(s)); need = g.level; break;
    case 'minigame': cur = e.n; need = g.wins; break;
    case 'combo': cur = e.n; need = g.count; break;
    case 'gold': cur = e.n; need = g.amount; break;
    case 'talk': cur = e.n; break;
  }
  return { cur: Math.min(cur, need), need, done: cur >= need };
}

function goalLabel(g) {
  switch (g.type) {
    case 'kill': {
      const ids = Array.isArray(g.enemy) ? g.enemy : [g.enemy];
      return `${ENEMIES[ids[0]]?.name ?? ids[0]}${ids.length > 1 ? ' 등' : ''} 처치`;
    }
    case 'killAny': return '마물 처치';
    case 'boss': return `${BOSSES[g.boss]?.name ?? g.boss} 처치`;
    case 'clear': return `「${STAGES[g.stage]?.name ?? g.stage}」 클리어${g.rank ? ` (${g.rank} 랭크 이상)` : ''}`;
    case 'collect': return `${ITEMS[g.item]?.name ?? g.item} 전달`;
    case 'docs': return '비전서 발견';
    case 'relics': return '드라큘라의 유물';
    case 'enhance': return `장비 +${g.level} 강화`;
    case 'minigame': return `${g.game ? MINIGAME_NAMES[gameKey(g.game)] ?? g.game : '여관 미니게임'} 승리`;
    case 'combo': return `${g.count} HIT 콤보`;
    case 'gold': return '금화 줍기';
    case 'talk': return `${NPCS[g.npc]?.name ?? g.npc}와 대화`;
  }
  return '목표';
}

export function questProgressText(s, qid) {
  const q = QUESTS[qid];
  if (!q) return '';
  const { cur, need } = questProgress(s, qid);
  const g = q.goal;
  if (g.type === 'gold') return `${goalLabel(g)} ${fmtN(cur)} / ${fmtN(need)} G`;
  if (g.type === 'enhance') return `${goalLabel(g)} (현재 최고 +${cur})`;
  if (g.type === 'combo') return `${goalLabel(g)} (최고 ${cur} HIT)`;
  return `${goalLabel(g)} ${cur}/${need}`;
}

export function rewardText(qid) {
  const r = QUESTS[qid]?.reward;
  if (!r) return '';
  const parts = [];
  if (r.gold) parts.push(`${fmtN(r.gold)} G`);
  if (r.exp) parts.push(`EXP ${fmtN(r.exp)}`);
  for (const i of r.items || []) parts.push(`${ITEMS[i.id]?.name ?? i.id} ×${i.qty ?? 1}`);
  return parts.join(' · ');
}

export function questStatus(s, qid) {
  const qs = ensure(s);
  if (qs.done.includes(qid)) return 'done';
  if (qs.active[qid]) return questProgress(s, qid).done ? 'ready' : 'active';
  return QUESTS[qid] && reqOk(s, QUESTS[qid]) ? 'available' : 'locked';
}

const sortMainFirst = (a, b) => (a.kind === b.kind ? 0 : a.kind === 'main' ? -1 : 1);

export function availableQuests(s, giver) {
  if (!s) return [];
  sync(s);
  const qs = ensure(s);
  return QUEST_ORDER.map((id) => QUESTS[id]).filter((q) => q.kind !== 'main' && !qs.done.includes(q.id) && !qs.active[q.id] && reqOk(s, q) && (!giver || q.giver === giver));
}
export function activeQuests(s) {
  if (!s) return [];
  sync(s);
  return Object.keys(ensure(s).active).map((id) => QUESTS[id]).filter(Boolean).sort(sortMainFirst);
}
export function completedQuests(s) {
  if (!s) return [];
  return ensure(s).done.map((id) => QUESTS[id]).filter(Boolean).sort(sortMainFirst);
}

export function acceptQuest(s, qid, { silent = false } = {}) {
  const q = QUESTS[qid];
  if (!s || !q) return false;
  const qs = ensure(s);
  if (qs.done.includes(qid) || qs.active[qid] || !reqOk(s, q)) return false;
  qs.active[qid] = { n: 0, t: Date.now() };
  if (!silent) {
    G?.toast?.(`${q.kind === 'main' ? '메인 퀘스트' : '퀘스트 수락'}: 「${q.name}」`, q.kind === 'main' ? '#ffd070' : '#e8c872');
    audio.sfx('menu_ok');
  }
  check(s);
  return true;
}

export function canClaim(s, qid) {
  if (!s || !ensure(s).active[qid]) return false;
  return questProgress(s, qid).done;
}

export function claimQuest(s, qid) {
  if (!canClaim(s, qid)) return null;
  const q = QUESTS[qid];
  const qs = ensure(s);
  const g = q.goal;
  if (g.type === 'collect' && !consumeByBase(s, g.item, g.count)) return null;
  delete qs.active[qid];
  if (!qs.done.includes(qid)) qs.done.push(qid);
  const r = q.reward || {};
  const out = { gold: r.gold ?? 0, exp: r.exp ?? 0, items: [], levelUps: 0 };
  s.gold = (s.gold ?? 0) + out.gold;
  const hero = s.heroes?.[s.charId];
  claiming++;
  try {
    if (hero && out.exp) out.levelUps = addExp(hero, out.exp);
    for (const i of r.items || []) {
      if (!ITEMS[i.id]) continue;
      if (addByBase(s, i.id, i.qty ?? 1)) out.items.push({ id: i.id, qty: i.qty ?? 1, name: ITEMS[i.id].name });
    }
  } finally { claiming--; }
  if (out.levelUps && G?.world?.player?.hero === hero) G.world.player.refreshStats?.();
  bus.emit('questClaimed', { questId: qid, reward: out });
  return out;
}

/** 메인 퀘스트 자동 수락 + 플래그 동기화 */
function sync(s) {
  const qs = ensure(s);
  const p = s.progress;
  if (p && (p.relics?.length ?? 0) >= 5 && p.flags && !p.flags.relics_all) p.flags.relics_all = true;
  for (const id of QUEST_ORDER) {
    const q = QUESTS[id];
    if (q.kind === 'main' && !qs.done.includes(id) && !qs.active[id] && reqOk(s, q)) acceptQuest(s, id);
  }
}

/** 달성 판정 → 알림 (메인은 자동 보상) */
function check(s) {
  const qs = ensure(s);
  for (const id of Object.keys(qs.active)) {
    const e = qs.active[id], q = QUESTS[id];
    if (!e) continue; // 자동 보상으로 목록이 바뀐 경우
    if (!q) { delete qs.active[id]; continue; }
    const done = questProgress(s, id).done;
    if (done && !e.ready) {
      e.ready = true;
      bus.emit('questDone', { questId: id });
      if (q.auto) {
        const r = claimQuest(s, id);
        G?.toast?.(`메인 퀘스트 완료! 「${q.name}」`, '#ffe070', 3);
        if (r) G?.toast?.(`보상: ${rewardText(id)}`, '#f3e2b8', 3);
      } else {
        G?.toast?.(`퀘스트 달성! 「${q.name}」 — 보상을 받으세요`, '#ffe070', 3);
      }
      audio.sfx('secret');
    } else if (!done && e.ready && q.goal.type === 'collect') e.ready = false; // 재료를 써 버린 경우
  }
}

function bump(s, pred, amount = 1) {
  const qs = ensure(s);
  for (const id in qs.active) {
    const q = QUESTS[id];
    if (q && pred(q.goal)) qs.active[id].n = (qs.active[id].n ?? 0) + amount;
  }
}
function setMax(s, type, v) {
  const qs = ensure(s);
  for (const id in qs.active) {
    const q = QUESTS[id];
    if (q?.goal.type === type) qs.active[id].n = Math.max(qs.active[id].n ?? 0, v ?? 0);
  }
}

export function initQuests(game) {
  G = game;
  game.quests = {
    accept: (id) => acceptQuest(game.state, id),
    claim: (id) => claimQuest(game.state, id),
    available: (giver) => availableQuests(game.state, giver),
    active: () => activeQuests(game.state),
    completed: () => completedQuests(game.state),
    text: (id) => questProgressText(game.state, id),
    progress: (id) => questProgress(game.state, id),
    canClaim: (id) => canClaim(game.state, id),
    status: (id) => questStatus(game.state, id),
    rewardText,
  };
  const on = (evt, fn) => bus.on(evt, (d) => {
    const s = game.state;
    if (!s?.progress || claiming) return;
    fn?.(s, d || {});
    check(s);
    sync(s); // 달성 알림 뒤에 다음 메인 퀘스트 수락
  });
  on('enemyKilled', (s, d) => {
    const id = d.def?.id ?? d.enemy?.def?.id;
    bump(s, (g) => g.type === 'killAny' || (g.type === 'kill' && enemyMatch(g.enemy, id)));
  });
  on('bossKilled', (s, d) => bump(s, (g) => g.type === 'boss' && g.again && g.boss === d.bossId));
  on('minigame', (s, d) => { if (d.win) bump(s, (g) => g.type === 'minigame' && (!g.game || gameKey(g.game) === gameKey(d.game))); });
  on('combo', (s, d) => setMax(s, 'combo', d.count));
  on('enhance', (s, d) => { if (d.success !== false && !d.destroyed) setMax(s, 'enhance', d.level ?? d.item?.level ?? 0); });
  on('goldPicked', (s, d) => bump(s, (g) => g.type === 'gold', d.amount ?? 0));
  on('npcTalk', (s, d) => bump(s, (g) => g.type === 'talk' && g.npc === d.npcId));
  for (const evt of ['stageCleared', 'stageEntered', 'itemPicked', 'docFound', 'relicFound']) on(evt, null);
}
