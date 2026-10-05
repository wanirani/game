// 메뉴 ↔ 게임 데이터 안전 접근층
// 다른 담당이 확장 중인 모듈(아이템/인벤토리/스킬/퀘스트/기록물)은 네임스페이스로 가져와
// 함수 안에서만 존재 여부를 확인하고 호출한다 (없으면 메뉴 자체 대체 구현).
import * as ItemsM from '../../data/items.js';
import * as InvM from '../../game/inventory.js';
import * as SkillD from '../../data/skills.js';
import * as SkillG from '../../game/skills.js';
import * as QuestD from '../../data/quests.js';
import * as QuestG from '../../game/quests.js';
import * as LoreM from '../../data/lore.js';
import * as EnemyM from '../../data/enemies.js';
import * as EnemyC from '../../data/enemies_c.js';
import * as EnemyDd from '../../data/enemies_d.js';
import * as BossM from '../../data/bosses.js';
import * as BossC from '../../data/bosses_c.js';
import * as BossDd from '../../data/bosses_d.js';
import * as StageM from '../../data/stages.js';
import * as ClassM from '../../data/classes.js';
import * as CharM from '../../data/characters.js';
import * as StatsM from '../../game/stats.js';
import * as NpcM from '../../data/npcs.js';
import { STAT_INFO } from '../../game/stats.js';

const fn = (...cands) => cands.find((f) => typeof f === 'function') || null;
const safe = (f, dflt) => { try { const v = f(); return v === undefined ? dflt : v; } catch (e) { console.warn('[menu]', e); return dflt; } };

// ───────────────────────── 아이템 ─────────────────────────
export const ITEMS = () => ItemsM.ITEMS || {};
export const baseOf = (inst) => (inst ? ITEMS()[inst.baseId] : null) || null;
export function nameOf(inst) {
  if (!inst) return '';
  const f = fn(ItemsM.itemName);
  return f ? safe(() => f(inst), baseOf(inst)?.name ?? '???') : (inst.level ? `+${inst.level} ` : '') + (baseOf(inst)?.name ?? '???');
}
export function statsOf(inst) {
  const f = fn(ItemsM.itemStats);
  return f ? safe(() => f(inst) || {}, {}) : { ...(baseOf(inst)?.stats || {}) };
}
export function rarityName(r) { return ItemsM.RARITIES?.[r]?.name ?? ['일반', '고급', '희귀', '영웅', '전설', '신화'][r] ?? ''; }
export function sellOf(inst) { const f = fn(ItemsM.sellPrice); return f ? safe(() => f(inst), 0) : Math.floor((baseOf(inst)?.price ?? 10) * 0.3); }
export const SLOT_KIND = { weapon: '무기', head: '머리 방어구', body: '갑옷', cloak: '망토', acc: '장신구', consumable: '소모품', material: '재료', key: '중요 물품' };
export const WTYPE_NAME = { whip: '채찍', sword: '장검', greatsword: '대검', dagger: '단검', gun: '총', staff: '지팡이', spear: '창' };

/** 아이템 설명 줄: [{text, color?}] (items.js 의 itemDesc 가 있으면 사용) */
export function descLines(inst) {
  const f = fn(ItemsM.itemDesc, ItemsM.itemLines, ItemsM.describeItem);
  if (f) {
    const r = safe(() => f(inst), null);
    if (Array.isArray(r)) return r.map((l) => (typeof l === 'string' ? { text: l } : { text: l.text ?? l.t ?? '', color: l.color ?? l.c }));
    if (typeof r === 'string') return r.split('\n').map((t) => ({ text: t }));
  }
  const b = baseOf(inst);
  return b?.desc ? [{ text: b.desc }] : [];
}

// ───────────────────────── 인벤토리 ─────────────────────────
export const INV_LIMIT = () => InvM.INV_LIMIT ?? 300;
/** 가방 한도에 드는 칸 수 (중요 물품은 한도 밖 — inventory.usedSlots) */
export const usedSlots = (state) => (fn(InvM.usedSlots) ? safe(() => InvM.usedSlots(state), state?.inventory?.length ?? 0) : state?.inventory?.length ?? 0);
export const findItem = (state, uid) => InvM.findItem(state, uid);
export function canEquipOf(state, hero, inst) {
  const f = fn(InvM.canEquip);
  return f ? safe(() => f(state, hero, inst), { ok: false, reason: '오류' }) : { ok: !!baseOf(inst) };
}
/** 장착. 장신구는 선택한 칸(acc1/acc2)에 끼운다. 반환: 실제 칸 */
export function equipTo(state, hero, uid, slot) {
  const prev = { ...hero.equip };
  const got = InvM.equipItem(state, hero, uid, slot ?? null);
  if (got && slot && got !== slot && (slot === 'acc1' || slot === 'acc2') && (got === 'acc1' || got === 'acc2')) {
    hero.equip[got] = prev[got] === uid ? null : prev[got];
    hero.equip[slot] = uid;
    return slot;
  }
  return got;
}
export function unequipOf(state, hero, slot) { InvM.unequip(state, hero, slot); }
export function equippedBy(state, uid) { const f = fn(InvM.isEquipped); return f ? f(state, uid) : null; }
export function hasSort() { return !!fn(InvM.sortInventory); }
export function toggleLockOf(state, inst) {
  const f = fn(InvM.toggleLock);
  if (f) { const r = safe(() => f(state, inst.uid), null); if (typeof r === 'boolean') return r; }
  inst.locked = !inst.locked;
  return inst.locked;
}
/** 색이 있는 설명 줄 [{text,color,flavor}] (items.js itemDescRich) — 없으면 null */
export function richDesc(inst) {
  const f = fn(ItemsM.itemDescRich);
  if (!f) return null;
  const r = safe(() => f(inst), null);
  return Array.isArray(r) ? r : null;
}
export function sortInv(state, mode) {
  const f = fn(InvM.sortInventory);
  if (f) return safe(() => { f(state, mode); return true; }, false);
  // 대체 정렬: 분류 → 희귀도 → 등급 → 강화
  const ORD = { weapon: 0, head: 1, body: 2, cloak: 3, acc: 4, consumable: 5, material: 6, key: 7 };
  state.inventory.sort((a, b) => {
    const A = baseOf(a), B = baseOf(b);
    return (ORD[A?.slot] ?? 9) - (ORD[B?.slot] ?? 9) || (b.rarity ?? 0) - (a.rarity ?? 0) || (B?.tier ?? 0) - (A?.tier ?? 0) || (b.level ?? 0) - (a.level ?? 0) || String(a.baseId).localeCompare(String(b.baseId));
  });
  return true;
}
/** 소모품 사용. ctx = {world, player}. 반환 {ok, msg} */
export function useOf(state, hero, inst, world) {
  const f = fn(InvM.useItem);
  const player = world?.player ?? null;
  if (f) {
    const r = safe(() => f(state, hero, inst.uid, player), null);
    if (r && typeof r === 'object') return { ok: r.ok !== false, msg: r.msg ?? r.message ?? r.reason ?? '' };
    return { ok: !!r, msg: r ? '' : '지금은 사용할 수 없습니다.' };
  }
  // 대체 구현: use {heal, mp, full}
  const use = baseOf(inst)?.use;
  if (!use || !player) return { ok: false, msg: '지금은 사용할 수 없습니다.' };
  const st = player.stats;
  if (use.heal) player.hp = Math.min(st.hp, player.hp + st.hp * use.heal);
  if (use.mp) player.mp = Math.min(st.mp, player.mp + st.mp * use.mp);
  if (use.full) { player.hp = st.hp; player.mp = st.mp; }
  InvM.removeItem(state, inst.uid, 1);
  return { ok: true, msg: '' };
}

// ───────────────────────── 스킬 ─────────────────────────
export const SKILLS = () => SkillD.SKILLS || {};
export const TREE = (charId) => SkillD.SKILL_TREES?.[charId] ?? null;
export function skillDescOf(id, lv) {
  const f = fn(SkillD.skillDesc, SkillG.skillDesc);
  if (f) { const r = safe(() => f(id, lv), null); if (r) return Array.isArray(r) ? r.join('\n') : String(r); }
  return SKILLS()[id]?.desc ?? '';
}
function chainIds(classId) { return safe(() => ClassM.classChain(classId).map((c) => c.id), []); }
/** 습득/강화 가능 여부 {ok, reason} */
export function canLearnOf(hero, id) {
  const f = fn(SkillG.canLearn, SkillG.canLearnSkill, SkillD.canLearn, SkillD.canLearnSkill);
  if (f) {
    const r = safe(() => f(hero, id), null);
    if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason ?? '' };
    if (typeof r === 'boolean') return { ok: r, reason: r ? '' : '조건 미충족' };
  }
  const sk = SKILLS()[id];
  if (!sk) return { ok: false, reason: '알 수 없는 스킬' };
  const lv = hero.skills?.[id] ?? 0;
  if (lv >= (sk.maxLv ?? 5)) return { ok: false, reason: '최대 레벨' };
  const req = reqsOf(hero, sk);
  const miss = req.find((r) => !r.ok);
  if (miss) return { ok: false, reason: miss.short ?? miss.text };
  if ((hero.sp ?? 0) < (sk.spCost ?? 1)) return { ok: false, reason: '스킬 포인트 부족' };
  return { ok: true };
}
/** 요구 조건 목록 [{text, ok, short}] */
export function reqsOf(hero, sk) {
  const out = [];
  const lv = hero.skills?.[sk.id] ?? 0;
  const needLv = (sk.reqLevel ?? 1) + (sk.lvStep ? lv * sk.lvStep : 0);
  if (needLv > 1) out.push({ text: `캐릭터 레벨 ${needLv}`, ok: hero.level >= needLv, short: `레벨 ${needLv} 필요` });
  for (const r of sk.req || []) {
    const [rid, rlv] = Array.isArray(r) ? r : [r, 1];
    const rs = SKILLS()[rid];
    out.push({ text: `${rs?.name ?? rid} Lv${rlv}`, ok: (hero.skills?.[rid] ?? 0) >= rlv, short: `선행: ${rs?.name ?? rid}` });
  }
  if (sk.reqClass) {
    const list = Array.isArray(sk.reqClass) ? sk.reqClass : [sk.reqClass];
    const chain = chainIds(hero.classId);
    const ok = list.some((c) => chain.includes(c));
    const names = list.map((c) => ClassM.CLASSES?.[c]?.name ?? c).join(' 또는 ');
    out.push({ text: `직업: ${names}`, ok, short: `${names} 전직 필요` });
  }
  return out;
}
/** 습득/강화 실행. 반환 {ok, reason} */
export function learnOf(state, hero, id) {
  const f = fn(SkillG.learnSkill, SkillD.learnSkill);
  if (f) {
    const before = hero.skills?.[id] ?? 0;
    const r = safe(() => f(hero, id, state), null);
    const after = hero.skills?.[id] ?? 0;
    if (r && typeof r === 'object') return { ok: r.ok !== false && after > before, reason: r.reason ?? '' };
    return { ok: after > before, reason: after > before ? '' : '습득할 수 없습니다' };
  }
  const chk = canLearnOf(hero, id);
  if (!chk.ok) return chk;
  hero.skills ??= {};
  hero.skills[id] = (hero.skills[id] ?? 0) + 1;
  hero.sp = (hero.sp ?? 0) - (SKILLS()[id]?.spCost ?? 1);
  return { ok: true };
}
export function isActive(sk) { return sk && (sk.type === 'active' || sk.type === 'ult'); }

// ───────────────────────── 퀘스트 ─────────────────────────
export const QUESTS = () => QuestD.QUESTS || {};
export function questText(state, qid) { const f = fn(QuestG.questProgressText); return f ? safe(() => f(state, qid), '') : ''; }
export function questClaimable(state, qid) { const f = fn(QuestG.canClaim); return f ? safe(() => !!f(state, qid), false) : false; }
export function activeQuestIds(state) {
  const f = fn(QuestG.activeQuests);
  if (f) { const r = safe(() => f(state), null); if (Array.isArray(r)) return r.map((q) => (typeof q === 'string' ? q : q?.id)).filter(Boolean); }
  const a = state.quests?.active;
  return Array.isArray(a) ? a.map((q) => (typeof q === 'string' ? q : q?.id)).filter(Boolean) : Object.keys(a || {});
}
export function doneQuestIds(state) {
  const f = fn(QuestG.completedQuests);
  if (f) { const r = safe(() => f(state), null); if (Array.isArray(r)) return r.map((q) => (typeof q === 'string' ? q : q?.id)).filter(Boolean); }
  const d = state.quests?.done;
  return Array.isArray(d) ? d.map((q) => (typeof q === 'string' ? q : q?.id)).filter(Boolean) : Object.keys(d || {});
}

export function questProg(state, qid) {
  const f = fn(QuestG.questProgress);
  return f ? safe(() => f(state, qid), { cur: 0, need: 1, done: false }) : { cur: 0, need: 1, done: false };
}
export function questStatusOf(state, qid) { const f = fn(QuestG.questStatus); return f ? safe(() => f(state, qid), 'active') : 'active'; }
export function questReward(qid) { const f = fn(QuestG.rewardText); return f ? safe(() => f(qid), '') : ''; }
export function availQuestIds(state) {
  const f = fn(QuestG.availableQuests);
  if (!f) return [];
  const r = safe(() => f(state), []);
  return Array.isArray(r) ? r.map((q) => (typeof q === 'string' ? q : q?.id)).filter(Boolean) : [];
}
export function npcName(id) { if (!id) return ''; if (id === 'board') return '의뢰 게시판'; return NpcM.NPCS?.[id]?.name ?? id; }

// ───────────────────────── 기록물 / 도감 / 기타 ─────────────────────────
export const DOCS = () => LoreM.DOCS || {};
export const LORE = () => LoreM.LORE || {};
export const ENEMIES = () => EnemyM.ENEMIES || {};
export const BOSSES = () => BossM.BOSSES || {};
export const STAGES = () => StageM.STAGES || {};
export const STAGE_ORDER = () => StageM.STAGE_ORDER || [];
/** 1부 스테이지 순서 (s01~s13) */
export const STAGE_ORDER_P1 = () => StageM.STAGE_ORDER_P1 || (StageM.STAGE_ORDER || []).filter((sid) => !isP2Stage(sid));
/** 2부 스테이지 순서 (STAGES 에 있는 것만) */
export const STAGE_ORDER_P2 = () => StageM.STAGE_ORDER_P2 || (StageM.STAGE_ORDER || []).filter((sid) => isP2Stage(sid));
/** 2부 스테이지 자리 (맵이 아직 없어도; world2 §4.2) */
export const P2_STAGE_IDS = ['s14', 's15', 's16', 's17', 's18', 's19', 's20'];

// ───────────────────────── 2부 (MASTER_PLAN §1.14: 전체를 보되 2부는 따로 묶는다) ─────────────────────────
const stageNo = (sid) => { const m = /^s(\d+)$/.exec(String(sid ?? '')); return m ? Number(m[1]) : 0; };
/** 2부 스테이지인가 (STAGES 에 part:2 이거나, 맵이 없어도 s14 이후) */
export function isP2Stage(sid) {
  const s = StageM.STAGES?.[sid];
  if (s) return (s.part ?? 1) >= 2;
  return stageNo(sid) >= 14;
}
let P2E = null, P2B = null;
/** 2부 적 id 집합 (enemies_c · enemies_d) */
export function p2EnemyIds() { return P2E ??= new Set([...Object.keys(EnemyC.ENEMIES_C || {}), ...Object.keys(EnemyDd.ENEMIES_D || {})]); }
/** 2부 보스 id 집합 (bosses_c · bosses_d) */
export function p2BossIds() { return P2B ??= new Set([...Object.keys(BossC.BOSSES_C || {}), ...Object.keys(BossDd.BOSSES_D || {})]); }
export function isP2Enemy(id) { return p2EnemyIds().has(id); }
export function isP2Boss(id) { return p2BossIds().has(id) || isP2Stage(BossM.BOSSES?.[id]?.stageId); }
/**
 * 플레이어가 2부를 알고 있나: 2부 시작 깃발 · s14 해금 · 14장 이상 · 2부 비전서/기록/보스/적을 이미 만났다.
 * 모르면 도감·비전서·기록 화면은 2부 항목을 숨기고 총수도 1부만 센다 (스포일러 방지).
 */
export function p2Known(state) {
  const P = state?.progress;
  if (!P) return false;
  const F = P.flags || {};
  if (F.p2_started || F.p2_done || F.rook_revealed) return true;
  if ((P.unlocked || []).some((sid) => isP2Stage(sid))) return true;
  if ((P.chapter ?? 0) >= 14) return true;
  if ((P.shards?.length ?? 0) > 0 || (P.hearts?.length ?? 0) > 0) return true;
  if ((P.docs || []).some((id) => isP2Stage(LoreM.DOCS?.[id]?.stage))) return true;
  if ((P.lore || []).some((id) => isP2Stage(LoreM.LORE?.[id]?.stage))) return true;
  if ((P.bosses || []).some((id) => isP2Boss(id))) return true;
  const B = state.bestiary || {};
  for (const id in B) if (isP2Enemy(id) && B[id]) return true;
  return false;
}
export const CLASSES = () => ClassM.CLASSES || {};
export const classChain = (id) => safe(() => ClassM.classChain(id), []);
export const CHARACTERS = () => CharM.CHARACTERS || {};
export { STAT_INFO };
export const computeStats = (state, hero) => StatsM.computeStats(state, hero);
export const composeLook = (state, hero) => StatsM.composeLook(state, hero);
export const expToNext = (lv) => StatsM.expToNext(lv);
export const EQUIP_SLOTS = () => StatsM.EQUIP_SLOTS;
export const SLOT_NAMES = () => StatsM.SLOT_NAMES;
export const MAX_LEVEL = () => StatsM.MAX_LEVEL ?? 99;

/**
 * 스테이지 표시 이름 "1장 불타는 마을". 2부는 "제2부 · 14장 거울의 성" 처럼 앞에 붙이지 않고 장 번호로 충분하다.
 * 아직 맵이 없는 2부 스테이지(STAGES 에 없음)는 "20장 · 이계" — 날것의 id("s20")는 보여 주지 않는다.
 */
export function stageLabel(sid) {
  const s = STAGES()[sid];
  if (!s) {
    const n = stageNo(sid);
    if (n >= 14) return `${n}장 · 이계`;
    return n ? `${n}장` : '';
  }
  if (s.side) return `외전 ${s.name}`;   // 외전 (s21, docs/specs/ex_s21.md)
  return s.chapter ? `${s.chapter}장 ${s.name}` : s.name;
}
/** 스테이지 장 번호 (맵이 없어도 id 에서) */
export function stageChapter(sid) { return STAGES()[sid]?.chapter ?? (stageNo(sid) || null); }
/** 스테이지 적 레벨 (맵이 없으면 null) */
export function stageLevel(sid) { return STAGES()[sid]?.level ?? null; }
/** 드롭 ID → 표시 이름 */
export function dropName(id) {
  const SPECIAL = { heart: '하트', food: '고기', mp: '마력 결정', gold: '골드', powerup: '파워업' };
  if (SPECIAL[id]) return SPECIAL[id];
  return ITEMS()[id]?.name ?? id;
}
