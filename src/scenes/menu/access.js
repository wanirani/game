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
import * as BossM from '../../data/bosses.js';
import * as StageM from '../../data/stages.js';
import * as ClassM from '../../data/classes.js';
import * as CharM from '../../data/characters.js';
import * as StatsM from '../../game/stats.js';
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
export const SLOT_KIND = { weapon: '무기', head: '머리 방어구', body: '갑옷', cloak: '망토', acc: '장신구', consumable: '소모품', material: '재료', key: '열쇠·귀중품' };
export const WTYPE_NAME = { whip: '채찍', sword: '장검', greatsword: '대검', dagger: '단검', gun: '총', staff: '지팡이' };

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
export const findItem = (state, uid) => InvM.findItem(state, uid);
export function canEquipOf(state, hero, inst) {
  const f = fn(InvM.canEquip);
  return f ? safe(() => f(state, hero, inst), { ok: false, reason: '오류' }) : { ok: !!baseOf(inst) };
}
/** 장착. 장신구는 선택한 칸(acc1/acc2)에 끼운다. 반환: 실제 칸 */
export function equipTo(state, hero, uid, slot) {
  const prev = { ...hero.equip };
  const got = InvM.equipItem(state, hero, uid);
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
    const r = safe(() => f(state, hero, inst.uid, { world, player, game: world?.game }), null);
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

// ───────────────────────── 기록물 / 도감 / 기타 ─────────────────────────
export const DOCS = () => LoreM.DOCS || {};
export const LORE = () => LoreM.LORE || {};
export const ENEMIES = () => EnemyM.ENEMIES || {};
export const BOSSES = () => BossM.BOSSES || {};
export const STAGES = () => StageM.STAGES || {};
export const STAGE_ORDER = () => StageM.STAGE_ORDER || [];
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

/** 스테이지 표시 이름 "1장 불타는 마을" */
export function stageLabel(sid) {
  const s = STAGES()[sid];
  if (!s) return sid ?? '';
  return s.chapter ? `${s.chapter}장 ${s.name}` : s.name;
}
/** 드롭 ID → 표시 이름 */
export function dropName(id) {
  const SPECIAL = { heart: '하트', food: '고기', mp: '마력 결정', gold: '금화', powerup: '파워업' };
  if (SPECIAL[id]) return SPECIAL[id];
  return ITEMS()[id]?.name ?? id;
}
