// 동료 세이브 상태 도우미 — owner: CMP-DATA (companions §2, §8, §12.2; MASTER_PLAN §1.2, §1.6)
// 순수 상태 함수: node 에서 import 가능, DOM 없음. data 모듈과 core/events.js(bus)만 import 한다.
//
// 세이브 모양 (companions §8, id 는 MASTER_PLAN §1.2):
//  state.companions = { v:1, owned:{ [id]:{ lv, exp, bond, got, src, gift, seen } }, eggs:{ [id]:{ at, got } }, pending:[id],
//                       clears, autoSkill:null|true|false, slot2Seen, last:{ mount, guards:[g0, g1] } }
//  state.heroes[charId].companions = { mount: id|null, guards: [id|null, id|null] }
//  (런타임 전용, 저장 안 됨) state.companions._debug = { ride } — applyCompanionDebug 가 JSON 에 안 나가는 속성으로 둔다
//
// 규칙
//  · 모든 함수는 잘못된 입력(null, 손상된 세이브)에도 던지지 않는다. migrateCompanions 는 두 번 돌려도 결과가 같다(멱등).
//  · 버스 이벤트: companionUnlocked {id, source} · companionLevelUp {id, level, gained} · bondUp {id, rank} · eggObtained {id} · eggHatched {id}
//    (silent 옵션이면 companionUnlocked·eggObtained 를 보내지 않는다 — 불러오기 중 소급 해금)
//  · 토스트는 여기서 띄우지 않는다 (companion_events.js 가 버스를 듣고 띄운다). 돌려주는 msg 는 장면이 그대로 보여 줄 한국어 문장.
import { bus } from '../core/events.js';
import { josa } from '../data/items.js';
import {
  MOUNTS, GUARDIANS, COMPANION_ORDER, UNLOCK_ORDER, CMP_MAX_LV, BOND_MAX, BOND_NAMES, BOND_RANKS, BOND_GAIN,
  STABLE_SHOP, TRIBUTE, CMP_TEXT, companionDef, normCompanionId, cexpToNext, guardianShare, trampleRatio, cdMul,
  mountHpMul, mountSpeedMul, bondRank, bondNext, cmpText, GUARD_RULES, EGG_TEXT,
} from '../data/companions.js';
import { serviceChapter } from './ngplus.js';   // [hook:ng] 회차의 마을 = 20장 (docs/specs/ngplus.md §4.3)

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => isObj(o) && typeof k === 'string' && Object.hasOwn(o, k);
const SRC = new Set(['story', 'boss', 'egg', 'quest', 'shop', 'relics', 'migrate', 'debug']);
const SRC_OF = { flag: 'story', boss: 'boss', egg: 'egg', quest: 'quest', shop: 'shop', relics: 'relics' };
const ELEMS = ['fire', 'ice', 'holy', 'dark', 'thunder'];
const r2 = (v) => Math.round(v * 100) / 100;
const intIn = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);
const nowMs = () => Date.now();
const isMount = (id) => typeof id === 'string' && Object.hasOwn(MOUNTS, id);
const isGuard = (id) => typeof id === 'string' && Object.hasOwn(GUARDIANS, id);

function emptyCompanions() {
  return { v: 1, owned: {}, eggs: {}, pending: [], clears: 0, autoSkill: null, slot2Seen: false, last: { mount: null, guards: [null, null] } };
}
const emptyLoadout = () => ({ mount: null, guards: [null, null] });
const copyLoadout = (L) => ({ mount: L?.mount ?? null, guards: [L?.guards?.[0] ?? null, L?.guards?.[1] ?? null] });

/** 구조가 멀쩡하면 그대로, 아니면 보정해서 state.companions 를 돌려준다 (내부용 빠른 경로) */
function cs(state) {
  if (!isObj(state)) return null;
  const c = state.companions;
  if (isObj(c) && c.v === 1 && isObj(c.owned) && isObj(c.eggs) && Array.isArray(c.pending) && isObj(c.last)) return c;
  return ensureCompanionState(state);
}
/** hero 인자: 영웅 객체 | charId 문자열 | null(현재 영웅) */
function heroOf(state, hero) {
  if (isObj(hero)) return hero;
  if (!isObj(state) || !isObj(state.heroes)) return null;
  const id = typeof hero === 'string' ? hero : state.charId;
  return typeof id === 'string' && Object.hasOwn(state.heroes, id) && isObj(state.heroes[id]) ? state.heroes[id] : null;
}
const isCurrentHero = (state, h) => !!h && isObj(state?.heroes) && state.heroes[state.charId] === h;
const chapterOf = (state) => (Number.isFinite(state?.progress?.chapter) ? state.progress.chapter : 0);

// ── 보정 · 마이그레이션 (§8) ────────────────────────────────────────────────────────────
function normEntry(e) {
  const o = isObj(e) ? e : {};
  o.lv = intIn(o.lv, 1, CMP_MAX_LV, 1);
  const exp = Number.isFinite(o.exp) && o.exp > 0 ? Math.floor(o.exp) : 0;
  o.exp = o.lv >= CMP_MAX_LV ? 0 : Math.min(exp, cexpToNext(o.lv) - 1);
  o.bond = intIn(o.bond, 0, BOND_MAX, 0);
  o.got = Number.isFinite(o.got) ? o.got : 0;
  o.src = SRC.has(o.src) ? o.src : 'migrate';
  o.gift = Number.isFinite(o.gift) ? Math.floor(o.gift) : -1;
  o.seen = o.seen === true;
  return o;
}
/** 목록(객체)의 키를 새 id 로 옮기고 모르는 키는 지운다 (제자리 수정 — 이미 잡힌 참조를 깨지 않도록) */
function normKeys(obj, keep) {
  for (const k of Object.keys(obj)) {
    const id = normCompanionId(k);
    if (!id || !keep(id)) { delete obj[k]; continue; }
    if (id !== k) { if (!Object.hasOwn(obj, id)) obj[id] = obj[k]; delete obj[k]; }
  }
}
function normLoadout(L, c, slots) {
  const o = isObj(L) ? L : {};
  const m = normCompanionId(o.mount);
  o.mount = isMount(m) && Object.hasOwn(c.owned, m) ? m : null;
  const src = Array.isArray(o.guards) ? o.guards : [];
  const g = (v) => { const id = normCompanionId(v); return isGuard(id) && Object.hasOwn(c.owned, id) ? id : null; };
  let g0 = g(src[0]), g1 = g(src[1]);
  if (g1 && g1 === g0) g1 = null;                      // 같은 수호신 두 칸 → 뒤 칸 비움
  if (slots < 2 && g1) { if (!g0) g0 = g1; g1 = null; } // 2번 칸이 잠겼으면 1번 칸으로 옮기거나 비움
  o.guards = [g0, g1];
  return o;
}
function normalize(state) {
  let c = state.companions;
  if (!isObj(c)) c = state.companions = emptyCompanions();
  c.v = 1;
  if (!isObj(c.owned)) c.owned = {};
  normKeys(c.owned, () => true);
  for (const id of Object.keys(c.owned)) c.owned[id] = normEntry(c.owned[id]);
  c.clears = intIn(c.clears, 0, 1e9, 0);
  if (!isObj(c.eggs)) c.eggs = {};
  normKeys(c.eggs, (id) => companionDef(id)?.obtain?.type === 'egg' && !Object.hasOwn(c.owned, id));
  for (const id of Object.keys(c.eggs)) {
    const e = isObj(c.eggs[id]) ? c.eggs[id] : {};
    // 알을 얻은 시점은 지금(clears)보다 뒤일 수 없다 — 손상된 미래 값이면 영영 부화하지 못하므로 지금으로 당긴다
    e.at = Number.isFinite(e.at) ? Math.min(Math.floor(e.at), c.clears) : -99;
    e.got = Number.isFinite(e.got) ? e.got : 0;
    c.eggs[id] = e;
  }
  const pend = [];
  for (const v of Array.isArray(c.pending) ? c.pending : []) {
    const id = normCompanionId(v);
    if (id && Object.hasOwn(c.owned, id) && !pend.includes(id)) pend.push(id);
  }
  c.pending = pend;
  if (c.autoSkill !== true && c.autoSkill !== false) c.autoSkill = null;
  c.slot2Seen = c.slot2Seen === true;
  const slots = guardianSlots(state);
  c.last = normLoadout(c.last, c, slots);
  if (isObj(state.heroes)) {
    for (const h of Object.values(state.heroes)) {
      if (!isObj(h)) continue;
      h.companions = normLoadout(isObj(h.companions) ? h.companions : copyLoadout(c.last), c, slots);
    }
  }
}

/** state.companions 를 보장한다 (없거나 모양이 틀리면 migrateCompanions). 새 게임(newGameState)에서 부른다. state 가 아니면 null */
export function ensureCompanionState(state) {
  if (!isObj(state)) return null;
  const c = state.companions;
  if (isObj(c) && c.v === 1 && isObj(c.owned) && isObj(c.eggs) && Array.isArray(c.pending) && isObj(c.last)) return c;
  migrateCompanions(state);
  return isObj(state.companions) ? state.companions : null;
}

/**
 * 세이브 보정 + 소급 해금 (migrateState 의 끝에서 호출; 멱등; 절대 던지지 않는다).
 *  1) 구조 생성, 모르는 id 제거(옛 m_/g_ id 는 새 id 로), lv 1–30 · exp ≥ 0 · bond 0–200, pending 은 보유한 id 만 한 번씩
 *  2) 영웅마다 hero.companions 보장(없으면 last 복사), 보유하지 않은 id 제거, 중복 수호신은 뒤 칸 비움, 슬롯 1개면 2번 칸 정리
 *  3) 소급 해금(아케이드 임시 세이브 제외): 보스 처치 기록 → 보스형(pending 에 들어감), 알형 → 바로 부화 가능한 알,
 *     완료한 의뢰 → 의뢰형, 유물 5개 → 녹티스, recruit_<id> 플래그 → 2부 동료. (stable_open 이 없으면 그림메인은 아직)
 *  손상되어 예외가 나면 state.companions 를 빈 상태로 되돌리고 console.warn.
 */
export function migrateCompanions(state) {
  if (!isObj(state)) return;
  try {
    // 편성이 아직 없던 영웅(동료 기능 이전 세이브)은 소급 해금이 끝난 뒤의 last 를 받는다 — 현재 영웅만 동료를 두르고
    // 나머지 영웅은 빈손이 되지 않도록. 두 번째 실행에서는 모두 편성이 있으므로 멱등.
    const bare = isObj(state.heroes) ? Object.values(state.heroes).filter((h) => isObj(h) && !isObj(h.companions)) : [];
    normalize(state);
    if (!state.arcade) evaluateUnlocks(state, { source: 'migrate', silent: true });
    const c = state.companions;
    if (bare.length && isObj(c)) {
      const slots = guardianSlots(state);
      for (const h of bare) if (!isCurrentHero(state, h)) h.companions = normLoadout(copyLoadout(c.last), c, slots);
    }
  } catch (e) {
    try { console.warn('[companions] 동료 데이터가 손상되어 초기화합니다', e); } catch { /* 무시 */ }
    try {
      state.companions = emptyCompanions();
      if (isObj(state.heroes)) for (const h of Object.values(state.heroes)) if (isObj(h)) h.companions = emptyLoadout();
      if (!state.arcade) evaluateUnlocks(state, { source: 'migrate', silent: true });
    } catch { /* 두 번째 실패는 빈 상태로 둔다 */ }
  }
}

// ── 조회 ──────────────────────────────────────────────────────────────────────────────────
/** 영웅의 편성 { mount, guards:[g0,g1] } (없으면 last 를 복사해 만든다). hero = 영웅 객체 | charId | null(현재 영웅) */
export function heroLoadout(state, hero) {
  const h = heroOf(state, hero);
  const c = cs(state);
  if (!h || !c) return emptyLoadout();
  const L = h.companions;
  if (!isObj(L) || !Array.isArray(L.guards) || L.guards.length !== 2) h.companions = normLoadout(isObj(L) ? L : copyLoadout(c.last), c, guardianSlots(state));
  return h.companions;
}
export function isOwned(state, id) { const c = cs(state); const n = normCompanionId(id); return !!(c && n && Object.hasOwn(c.owned, n)); }
/** 보유한 동료 id (COMPANION_ORDER 순). kind = 'mount' | 'guardian' | 생략(전부) */
export function ownedIds(state, kind) {
  const c = cs(state);
  if (!c) return [];
  return COMPANION_ORDER.filter((id) => Object.hasOwn(c.owned, id) && (!kind || companionDef(id).kind === kind));
}
export function ownedEntry(state, id) { const c = cs(state); const n = normCompanionId(id); return c && n && Object.hasOwn(c.owned, n) ? c.owned[n] : null; }
/** 합류 연출을 아직 보지 않은 동료 (순서대로) */
export function pendingIds(state) { const c = cs(state); return c ? c.pending.filter((id) => Object.hasOwn(c.owned, id)) : []; }
/** 합류 연출을 봤거나 메뉴에서 확인함 → NEW 표시 해제, pending 에서 제거 */
export function markSeen(state, id) {
  const c = cs(state), n = normCompanionId(id);
  if (!c || !n || !Object.hasOwn(c.owned, n)) return false;
  c.owned[n].seen = true;
  const i = c.pending.indexOf(n);
  if (i >= 0) c.pending.splice(i, 1);
  return true;
}
/** 수호신 칸 수: 8장 클리어부터 2칸 (§2.5) */
export function guardianSlots(state) { return serviceChapter(state) >= 8 ? 2 : 1; }   // [hook:ng] 회차면 20장처럼 (2번 칸이 닫혀 두 번째 수호신이 편성에서 빠지지 않게)
/** 합류 시작 레벨: clamp(round(영웅 최고 레벨 × 0.7), 1, 25) (§2.3) */
export function startLevelFor(state) {
  let max = 1;
  if (isObj(state?.heroes)) for (const h of Object.values(state.heroes)) if (isObj(h) && Number.isFinite(h.level)) max = Math.max(max, h.level);
  return Math.max(1, Math.min(25, Math.round(max * 0.7)));
}
export function bondRankOf(state, id) { const e = ownedEntry(state, id); return e ? bondRank(e.bond) : 0; }
/** { points, rank, name, next(다음 단계 포인트|null) } */
export function bondInfo(state, id) {
  const e = ownedEntry(state, id);
  const points = e?.bond ?? 0, rank = bondRank(points);
  return { points, rank, name: BOND_NAMES[rank], next: bondNext(points) };
}
/** { lv, exp, need(다음 레벨까지 총량, 최대 레벨이면 0), max } */
export function expInfo(state, id) {
  const e = ownedEntry(state, id);
  const lv = e?.lv ?? 1, max = lv >= CMP_MAX_LV;
  return { lv, exp: max ? 0 : (e?.exp ?? 0), need: max ? 0 : cexpToNext(lv), max };
}
/** 장착 중인 동료 id (탈것 먼저, 수호신은 열린 칸만, 보유한 것만) */
export function equippedIds(state, hero) {
  const c = cs(state);
  const h = heroOf(state, hero);
  if (!c || !h) return [];
  const L = heroLoadout(state, h), out = [];
  if (L.mount && Object.hasOwn(c.owned, L.mount)) out.push(L.mount);
  const n = guardianSlots(state);
  for (let i = 0; i < n; i++) { const g = L.guards[i]; if (g && Object.hasOwn(c.owned, g) && !out.includes(g)) out.push(g); }
  return out;
}
/** 편성 비교용 짧은 키 (런타임이 매 프레임 비교해도 싸다) */
export function loadoutKey(state, hero) {
  const L = heroLoadout(state, hero);
  return `${L.mount ?? '-'}|${L.guards[0] ?? '-'}|${guardianSlots(state) > 1 ? (L.guards[1] ?? '-') : '-'}`;
}

// ── 해금 · 성장 ───────────────────────────────────────────────────────────────────────────
function syncLast(state, h) { const c = cs(state); if (c && isObj(h?.companions)) c.last = copyLoadout(h.companions); }
function autoEquip(state, id) {
  const h = heroOf(state, null);
  if (!h) return;
  const L = heroLoadout(state, h);
  let changed = false;
  if (isMount(id)) { if (!L.mount) { L.mount = id; changed = true; } }
  else if (isGuard(id) && !L.guards.includes(id)) {
    const n = guardianSlots(state);
    for (let i = 0; i < n; i++) if (!L.guards[i]) { L.guards[i] = id; changed = true; break; }
  }
  if (changed) syncLast(state, h);
}

/**
 * 동료 합류 (멱등: 이미 있으면 그 항목을 그대로 돌려준다). 시작 레벨은 따라잡기 공식, 합류 연출 대기열(pending)에 넣고
 * 현재 영웅의 빈 칸에 자동 장착, 'companionUnlocked' 를 보낸다. 모르는 id 나 state 면 null.
 *  opts: source('story'|'boss'|'egg'|'quest'|'shop'|'relics'|'migrate'|'debug'), silent(버스 이벤트 없음),
 *        reveal(false 면 합류 연출 없이 이미 본 것으로), equip(false 면 자동 장착 안 함)
 */
export function unlockCompanion(state, id, opts) {
  const { source = 'story', silent = false, reveal = true, equip = true } = isObj(opts) ? opts : {};
  const c = cs(state), n = normCompanionId(id);
  if (!c || !n) return null;
  if (Object.hasOwn(c.owned, n)) return c.owned[n];
  const entry = { lv: startLevelFor(state), exp: 0, bond: 0, got: nowMs(), src: SRC.has(source) ? source : 'story', gift: -1, seen: !reveal };
  c.owned[n] = entry;
  if (Object.hasOwn(c.eggs, n)) delete c.eggs[n];
  if (reveal && !c.pending.includes(n)) c.pending.push(n);
  if (equip) autoEquip(state, n);
  if (!silent) bus.emit('companionUnlocked', { id: n, source: entry.src });
  return entry;
}

/**
 * 조건을 만족했는데 아직 없는 동료를 합류시킨다 (멱등). 새로 합류한 id 목록을 돌려준다.
 *  flag(recruit_<id>, stable_open) · boss(progress.bosses) · quest(quests.done) · relics(유물 수) · egg(보스 처치 → 알, 바로 부화 가능)
 *  opts.source 를 주면 모든 해금의 출처를 그것으로 (마이그레이션은 'migrate'), opts.silent 면 버스 이벤트 없음. 아케이드 세이브는 무시.
 */
export function evaluateUnlocks(state, opts) {
  if (!isObj(opts)) opts = {};
  const out = [];
  const c = cs(state);
  if (!c || state.arcade) return out;
  const P = isObj(state.progress) ? state.progress : {};
  const flags = isObj(P.flags) ? P.flags : {};
  const bosses = Array.isArray(P.bosses) ? P.bosses : [];
  const relics = new Set((Array.isArray(P.relics) ? P.relics : []).filter((r) => typeof r === 'string'));
  const done = Array.isArray(state.quests?.done) ? state.quests.done : [];
  const silent = !!opts.silent;
  for (const id of UNLOCK_ORDER) {
    if (Object.hasOwn(c.owned, id)) continue;
    const o = companionDef(id).obtain;
    let ok = false;
    switch (o.type) {
      case 'flag': ok = !!(o.flag && flags[o.flag]); break;
      case 'boss': ok = bosses.includes(o.boss); break;
      case 'quest': ok = done.includes(o.quest); break;
      case 'relics': ok = relics.size >= (o.count ?? 5); break;
      case 'egg': if (bosses.includes(o.boss) && !Object.hasOwn(c.eggs, id)) obtainEgg(state, id, { at: -99, silent }); break;
      default: break;
    }
    if (ok && unlockCompanion(state, id, { source: opts.source ?? SRC_OF[o.type], silent })) out.push(id);
  }
  return out;
}

/** 스토리 모드 보스 첫 처치: 보스형 합류 + 알형 알 획득. { unlocked:[id], eggs:[id] } (companion_events 가 토스트) */
export function bossKillUpdate(state, bossId) {
  const res = { unlocked: [], eggs: [] };
  const c = cs(state);
  if (!c || state.arcade || typeof bossId !== 'string') return res;
  for (const id of UNLOCK_ORDER) {
    const o = companionDef(id).obtain;
    if (o.boss !== bossId || Object.hasOwn(c.owned, id)) continue;
    if (o.type === 'boss') { if (unlockCompanion(state, id, { source: 'boss' })) res.unlocked.push(id); }
    else if (o.type === 'egg' && obtainEgg(state, id)) res.eggs.push(id);
  }
  return res;
}
/** 의뢰 보상 수령 → 의뢰형 합류 id 목록 */
export function questClaimUpdate(state, questId) {
  const out = [];
  const c = cs(state);
  if (!c || state.arcade || typeof questId !== 'string') return out;
  for (const id of UNLOCK_ORDER) {
    const o = companionDef(id).obtain;
    if (o.type === 'quest' && o.quest === questId && !Object.hasOwn(c.owned, id) && unlockCompanion(state, id, { source: 'quest' })) out.push(id);
  }
  return out;
}
/** 유물 획득 → 유물형 합류 id 목록 */
export function relicUpdate(state) {
  const out = [];
  const c = cs(state);
  if (!c || state.arcade) return out;
  const n = new Set((Array.isArray(state.progress?.relics) ? state.progress.relics : []).filter((r) => typeof r === 'string')).size;
  for (const id of UNLOCK_ORDER) {
    const o = companionDef(id).obtain;
    if (o.type === 'relics' && n >= (o.count ?? 5) && !Object.hasOwn(c.owned, id) && unlockCompanion(state, id, { source: 'relics' })) out.push(id);
  }
  return out;
}
/**
 * 스테이지 클리어(스토리): clears +1 (알·공물 주기), 장착 중인 동료 유대 +6.
 * { clears, bond:{ [id]: 오른 단계 수 }, eggsReady:[이번에 부화 가능해진 알 id] }
 */
export function stageClearUpdate(state) {
  const res = { clears: 0, bond: {}, eggsReady: [] };
  const c = cs(state);
  if (!c || state.arcade) return res;
  const before = new Set(eggStatus(state).filter((e) => e.ready).map((e) => e.id));
  c.clears += 1;
  res.clears = c.clears;
  for (const id of equippedIds(state, null)) res.bond[id] = addBond(state, id, BOND_GAIN.stage);
  res.eggsReady = eggStatus(state).filter((e) => e.ready && !before.has(e.id)).map((e) => e.id);
  return res;
}

/** 경험치 추가 → 오른 레벨 수. 레벨이 오르면 'companionLevelUp' {id, level, gained} */
export function addCompanionExp(state, id, n) {
  const e = ownedEntry(state, id);
  if (!e || !Number.isFinite(n) || n <= 0) return 0;
  if (e.lv >= CMP_MAX_LV) { e.exp = 0; return 0; }
  e.exp = (Number.isFinite(e.exp) ? e.exp : 0) + Math.max(1, Math.round(n));
  let gained = 0;
  while (e.lv < CMP_MAX_LV && e.exp >= cexpToNext(e.lv)) { e.exp -= cexpToNext(e.lv); e.lv++; gained++; }
  if (e.lv >= CMP_MAX_LV) e.exp = 0;
  if (gained) bus.emit('companionLevelUp', { id: normCompanionId(id), level: e.lv, gained });
  return gained;
}
/** 유대 포인트 추가(0–200) → 오른 단계 수. 단계가 오르면 'bondUp' {id, rank} */
export function addBond(state, id, pts) {
  const e = ownedEntry(state, id);
  if (!e || !Number.isFinite(pts) || pts === 0) return 0;
  const before = bondRank(e.bond);
  e.bond = Math.max(0, Math.min(BOND_MAX, Math.round((Number.isFinite(e.bond) ? e.bond : 0) + pts)));
  const after = bondRank(e.bond);
  if (after > before) bus.emit('bondUp', { id: normCompanionId(id), rank: after });
  return Math.max(0, after - before);
}

// ── 장착 ──────────────────────────────────────────────────────────────────────────────────
/** 탈것 장착/해제 (id = null 이면 해제). { ok, msg } */
export function equipMount(state, hero, id) {
  const c = cs(state), h = heroOf(state, hero);
  if (!c || !h) return { ok: false, msg: '영웅 정보를 찾을 수 없다' };
  const L = heroLoadout(state, h);
  if (id == null) {
    const prev = L.mount;
    L.mount = null;
    syncLast(state, h);
    return { ok: true, msg: prev ? cmpText('unequipped', { name: companionDef(prev).name }) : '' };
  }
  const n = normCompanionId(id);
  if (!isMount(n)) return { ok: false, msg: '탈것이 아니다' };
  if (!Object.hasOwn(c.owned, n)) return { ok: false, msg: CMP_TEXT.notOwned };
  L.mount = n;
  syncLast(state, h);
  return { ok: true, msg: cmpText('equipped', { name: MOUNTS[n].name }) };
}
/** 수호신 장착/해제. slot 0|1 (1번은 8장 클리어 후). 다른 칸에 있던 같은 수호신은 이 칸으로 옮기고, 이 칸에 있던 수호신은 그 칸으로 간다. { ok, msg } */
export function equipGuardian(state, hero, slot, id) {
  const c = cs(state), h = heroOf(state, hero);
  if (!c || !h) return { ok: false, msg: '영웅 정보를 찾을 수 없다' };
  if (slot !== 0 && slot !== 1) return { ok: false, msg: '잘못된 칸이다' };
  const slots = guardianSlots(state);
  if (slot >= slots) return { ok: false, msg: CMP_TEXT.slot2Locked };
  const L = heroLoadout(state, h);
  if (id == null) {
    const prev = L.guards[slot];
    L.guards[slot] = null;
    syncLast(state, h);
    return { ok: true, msg: prev ? cmpText('unequipped', { name: companionDef(prev).name }) : '' };
  }
  const n = normCompanionId(id);
  if (!isGuard(n)) return { ok: false, msg: '수호신이 아니다' };
  if (!Object.hasOwn(c.owned, n)) return { ok: false, msg: CMP_TEXT.notOwned };
  const other = 1 - slot;
  if (L.guards[other] === n) L.guards[other] = other < slots ? L.guards[slot] : null;
  L.guards[slot] = n;
  syncLast(state, h);
  return { ok: true, msg: cmpText('equipped', { name: GUARDIANS[n].name }) };
}

// ── 능력치 ────────────────────────────────────────────────────────────────────────────────
/** 장착한 수호신 오라 합계 (computeStats 훅). 값 = base + perLv·(lv-1), 유대 2단계부터 ×1.5. 동료가 없으면 {} */
export function companionAuraStats(state, hero) {
  const out = {};
  try {
    const c = state?.companions;
    if (!isObj(c) || !isObj(c.owned)) return out;
    const h = heroOf(state, hero);
    if (!h) return out;
    const L = heroLoadout(state, h);
    const n = guardianSlots(state);
    for (let i = 0; i < n; i++) {
      const id = L.guards?.[i];
      if (!isGuard(id) || !Object.hasOwn(c.owned, id) || (i > 0 && id === L.guards[0])) continue; // 같은 수호신이 두 칸이면 한 번만
      const e = c.owned[id], a = GUARDIANS[id].aura;
      const mul = bondRank(e.bond) >= 2 ? 1.5 : 1, lv = intIn(e.lv, 1, CMP_MAX_LV, 1);
      for (const k of new Set([...Object.keys(a.base || {}), ...Object.keys(a.perLv || {})])) {
        out[k] = (out[k] ?? 0) + ((a.base?.[k] ?? 0) + (a.perLv?.[k] ?? 0) * (lv - 1)) * mul;
      }
    }
    for (const k in out) out[k] = r2(out[k]);
  } catch { /* 능력치 계산은 절대 막지 않는다 */ }
  return out;
}
/** 탈것 탑승 보너스 (유대 2단계부터 ×1.5). 보유하지 않았으면 기본값 */
export function mountRideStats(state, id) {
  const n = normCompanionId(id);
  if (!isMount(n)) return {};
  const e = ownedEntry(state, n);
  const mul = e && bondRank(e.bond) >= 2 ? 1.5 : 1;
  const out = {};
  for (const [k, v] of Object.entries(MOUNTS[n].ride || {})) out[k] = r2(v * mul);
  return out;
}
/**
 * 탈것 파생 수치. playerStats = 영웅 최종 능력치(없으면 기본값).
 * { id, lv, rank, maxHp, speedMul, trampleRatio, power, atkStats, recall, cdMul, chargeCd, specialCd, specialMul, rideMul, ride,
 *   resonance(3+), awakened(4+), lastStand(5) }
 */
export function mountDerived(state, id, playerStats) {
  const n = normCompanionId(id);
  if (!isMount(n)) return null;
  const def = MOUNTS[n], e = ownedEntry(state, n), ps = isObj(playerStats) ? playerStats : {};
  const lv = intIn(e?.lv, 1, CMP_MAX_LV, 1), rank = e ? bondRank(e.bond) : 0;
  const num = (k, d = 0) => (Number.isFinite(ps[k]) ? ps[k] : d);
  const tr = trampleRatio(lv), power = Math.max(num('atk', 10), num('mag', 10)) * tr;
  const atkStats = { atk: power, mag: power, crit: num('crit'), critDmg: num('critDmg'), skillDmg: 0, subDmg: 0 };
  for (const el of ELEMS) atkStats[el] = num(el);
  return {
    id: n, lv, rank,
    maxHp: Math.max(1, Math.round(num('hp', 100) * def.hp * mountHpMul(lv) * (1 + 0.05 * rank))),
    speedMul: Math.round(mountSpeedMul(lv) * (1 + 0.5 * num('moveSpd') / 100) * 1e4) / 1e4,
    trampleRatio: tr, power, atkStats,
    recall: r2(def.recall * cdMul(lv)), cdMul: cdMul(lv),
    chargeCd: r2(def.charge.cd * (rank >= 4 ? 0.7 : 1)),
    specialCd: r2(def.special.cd * cdMul(lv)),
    specialMul: rank >= 4 ? 1.5 : rank >= 1 ? 1.25 : 1,
    rideMul: rank >= 2 ? 1.5 : 1, ride: mountRideStats(state, n),
    resonance: rank >= 3, awakened: rank >= 4, lastStand: rank >= 5,
  };
}
/**
 * 수호신 파생 수치 (§4.4, §4.5, §9). playerStats = 영웅 최종 능력치.
 * { id, lv, rank, share, power, stats(공격 판정용), interval, skillCd, skillMul, auraMul, assistCd, engage, resonance, awakened }
 */
export function guardianDerived(state, id, playerStats) {
  const n = normCompanionId(id);
  if (!isGuard(n)) return null;
  const def = GUARDIANS[n], e = ownedEntry(state, n), ps = isObj(playerStats) ? playerStats : {};
  const lv = intIn(e?.lv, 1, CMP_MAX_LV, 1), rank = e ? bondRank(e.bond) : 0;
  const num = (k, d = 0) => (Number.isFinite(ps[k]) ? ps[k] : d);
  const share = guardianShare(lv);
  const power = Math.max(num('atk', 10), num('mag', 10)) * share * (1 + 0.04 * rank);
  const stats = { atk: power, mag: power, crit: r2(5 + 0.3 * lv + num('crit') * 0.3), critDmg: r2(num('critDmg') * 0.5), skillDmg: 0, subDmg: 0 };
  for (const el of ELEMS) stats[el] = r2(num(el) * 0.5);
  return {
    id: n, lv, rank, share, power, stats,
    interval: r2(def.attack.interval * (rank >= 4 ? 0.85 : 1)),
    skillCd: r2(def.skill.cd * cdMul(lv) * (rank >= 5 ? 0.8 : 1)),
    skillMul: rank >= 4 ? 1.5 : rank >= 1 ? 1.25 : 1,
    auraMul: rank >= 2 ? 1.5 : 1,
    assistCd: rank >= 3 ? GUARD_RULES.assistCdRes : GUARD_RULES.assistCd,
    engage: (def.engage ?? 320) + 4 * lv,
    resonance: rank >= 3, awakened: rank >= 4,
  };
}

// ── 알 · 공물 · 구입 (§2.1, §7.3) ──────────────────────────────────────────────────────────
/** 알 획득 (알형 동료만; 이미 있거나 합류했으면 false). opts.at = 시작 clears (기본 지금), opts.silent */
export function obtainEgg(state, id, opts) {
  if (!isObj(opts)) opts = {};
  const c = cs(state), n = normCompanionId(id);
  if (!c || !n || companionDef(n).obtain.type !== 'egg') return false;
  if (Object.hasOwn(c.owned, n) || Object.hasOwn(c.eggs, n)) return false;
  c.eggs[n] = { at: Number.isFinite(opts.at) ? Math.floor(opts.at) : c.clears, got: nowMs() };
  if (!opts.silent) bus.emit('eggObtained', { id: n });
  return true;
}
/** [{ id, egg(알 이름), ready, left(남은 스테이지 수), text }] (COMPANION_ORDER 순) */
export function eggStatus(state) {
  const c = cs(state);
  if (!c) return [];
  const out = [];
  for (const id of COMPANION_ORDER) {
    if (!Object.hasOwn(c.eggs, id)) continue;
    const o = companionDef(id).obtain;
    const at = Number.isFinite(c.eggs[id]?.at) ? c.eggs[id].at : -99;
    const need = o.hatchAfter ?? 2;
    const left = Math.max(0, Math.min(need, need - (c.clears - at)));
    out.push({ id, egg: o.egg ?? '알', ready: left === 0, left,
      text: left === 0 ? EGG_TEXT.ready : left === 1 ? EGG_TEXT.waiting : EGG_TEXT.waitingN.replace('{n}', String(left)) });
  }
  return out;
}
/** 부화 (준비된 알만) → 합류 항목 | null. 'eggHatched' {id} */
export function hatchEgg(state, id) {
  const c = cs(state), n = normCompanionId(id);
  if (!c || !n || !Object.hasOwn(c.eggs, n)) return null;
  const st = eggStatus(state).find((e) => e.id === n);
  if (!st?.ready) return null;
  delete c.eggs[n];
  const entry = unlockCompanion(state, n, { source: 'egg' });
  if (entry) bus.emit('eggHatched', { id: n });
  return entry;
}
/** 공물 가격: 100 + 30·lv G */
export function tributeCost(state, id) {
  const e = ownedEntry(state, id);
  return TRIBUTE.base + TRIBUTE.perLv * (e?.lv ?? 1);
}
/** 공물 바치기 여부 미리보기: { cost, exp, bond(유대가 오르면 8, 이번 주기에 이미 줬으면 0) } */
export function tributePreview(state, id) {
  const c = cs(state), e = ownedEntry(state, id);
  if (!c || !e) return { cost: 0, exp: 0, bond: 0, useful: false };
  const exp = e.lv >= CMP_MAX_LV ? 0 : Math.floor(cexpToNext(e.lv) * TRIBUTE.expFrac);
  const bond = e.gift !== c.clears && e.bond < BOND_MAX ? TRIBUTE.bond : 0;
  return { cost: tributeCost(state, id), exp, bond, useful: exp > 0 || bond > 0 };
}
/**
 * 공물: 금화를 내고 경험치 floor(cexpToNext(lv)·0.3), 스테이지 클리어 주기마다 한 번 유대 +8.
 * { ok, msg, exp, bond, cost, levels }
 */
export function giveTribute(state, id) {
  const c = cs(state), e = ownedEntry(state, id);
  const fail = (msg) => ({ ok: false, msg, exp: 0, bond: 0, cost: 0, levels: 0 });
  if (!c || !e) return fail(CMP_TEXT.notOwned);
  const cost = tributeCost(state, id);
  const name = companionDef(id).name;
  const exp = e.lv >= CMP_MAX_LV ? 0 : Math.floor(cexpToNext(e.lv) * TRIBUTE.expFrac);
  const cycle = e.gift !== c.clears;
  // 최대 레벨이라 경험치가 없고 유대도 오르지 않으면 금화만 사라지므로 받지 않는다
  if (!exp && !(cycle && e.bond < BOND_MAX)) return { ...fail(e.bond >= BOND_MAX ? cmpText('tributeDone', { name }) : TRIBUTE.noBondNote), cost };
  if (!(Number.isFinite(state.gold) && state.gold >= cost)) return { ...fail(CMP_TEXT.poor), cost };
  state.gold -= cost;
  const lv0 = e.lv;
  addCompanionExp(state, id, exp);
  let bond = 0;
  if (cycle) {
    e.gift = c.clears;
    const b0 = e.bond;
    addBond(state, id, TRIBUTE.bond);
    bond = e.bond - b0;
  }
  const parts = [];
  if (exp) parts.push(`경험치 +${exp.toLocaleString('ko-KR')}`);
  if (bond) parts.push(`유대 +${bond}`);
  const msg = cycle
    ? `${josa(name, '이/가')} 공물을 반겼다!${parts.length ? ` (${parts.join(' · ')})` : ''}`
    : `${josa(name, '이/가')} 공물을 받았다${exp ? ` (경험치 +${exp.toLocaleString('ko-KR')})` : ''} — ${TRIBUTE.noBondNote}`;
  return { ok: true, msg, exp, bond, cost, levels: e.lv - lv0 };
}
/** 마구간 구입 (STABLE_SHOP) → { ok, msg } */
export function buyCompanion(state, id) {
  const c = cs(state), n = normCompanionId(id);
  const row = STABLE_SHOP.find((r) => r.id === n);
  if (!c || !row) return { ok: false, msg: '마구간에서 파는 동료가 아니다' };
  if (Object.hasOwn(c.owned, n)) return { ok: false, msg: CMP_TEXT.owned };
  if (serviceChapter(state) < row.chapter) return { ok: false, msg: row.lockNote };   // [hook:ng] 회차면 20장처럼
  if (!(Number.isFinite(state.gold) && state.gold >= row.price)) return { ok: false, msg: CMP_TEXT.poor };
  state.gold -= row.price;
  unlockCompanion(state, n, { source: 'shop' });
  return { ok: true, msg: `${josa(companionDef(n).name, '이/가')} 동료가 되었다!` };
}

// ── 디버그 (§8; main.js 가 ?scene=stage / ?scene=hub 에서만 호출) ──────────────────────────
function paramsOf(p) {
  if (!p) return new Map();
  if (typeof p === 'string') return new URLSearchParams(p);
  if (typeof p.get === 'function' && typeof p.has === 'function') return p;
  const m = new Map();
  if (isObj(p)) for (const k of Object.keys(p)) m.set(k, p[k] == null ? '' : String(p[k]));
  return m;
}
const idList = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
/**
 * 디버그 URL 파라미터: cmp=all|id,id (지급, 합류 연출 없음) · cmplv=N · bond=N(0–5 = 단계, 그 이상 = 포인트) · mount=id · guards=id,id
 *  (두 칸이면 8장으로 올림) · egg=id,id (바로 부화 가능한 알) · ride=1 (스테이지 시작 시 탑승) · ch=N (progress.chapter).
 * 그림메인을 지급하면 stable_open, 8장 이상이면 slot2Seen 도 켠다 (허브 테스트에 소개 대사가 끼지 않도록).
 * 돌려주는 값 { granted:[id], ride }; ride 는 state.companions._debug.ride 에도 둔다 (JSON 에 저장되지 않는 속성).
 */
export function applyCompanionDebug(state, params) {
  const res = { granted: [], ride: false };
  try {
    const P = paramsOf(params);
    const keys = ['cmp', 'cmplv', 'bond', 'mount', 'guards', 'egg', 'ride', 'ch'];
    if (!keys.some((k) => P.has(k))) return res;
    const c = cs(state);
    if (!c) return res;
    if (!isObj(state.progress)) state.progress = {};
    if (!isObj(state.progress.flags)) state.progress.flags = {};
    if (P.has('ch')) { const n = parseInt(P.get('ch'), 10); if (Number.isFinite(n)) state.progress.chapter = Math.max(0, Math.min(20, n)); }
    const grant = (id) => {
      const n = normCompanionId(id);
      if (!n) return null;
      if (!Object.hasOwn(c.owned, n)) { unlockCompanion(state, n, { source: 'debug', silent: true, reveal: false }); res.granted.push(n); }
      return n;
    };
    const cmp = P.get('cmp');
    if (cmp) for (const id of (cmp === 'all' ? COMPANION_ORDER : idList(cmp))) grant(id);
    const guards = P.has('guards') ? [...new Set(idList(P.get('guards')).map(normCompanionId).filter(isGuard))].map(grant).slice(0, 2) : null;
    if (guards && guards.length > 1 && guardianSlots(state) < 2) state.progress.chapter = Math.max(chapterOf(state), 8);
    if (P.has('mount')) { const m = normCompanionId(P.get('mount')); if (isMount(m)) equipMount(state, null, grant(m)); else if (!P.get('mount') || P.get('mount') === 'none') equipMount(state, null, null); }
    if (guards) {
      const L = heroLoadout(state, null);
      L.guards = [null, null];
      guards.forEach((g, i) => equipGuardian(state, null, i, g));
    }
    for (const id of idList(P.get('egg'))) { const n = normCompanionId(id); if (n && !Object.hasOwn(c.owned, n)) obtainEgg(state, n, { at: -99, silent: true }); }
    if (P.has('cmplv')) {
      const lv = intIn(parseInt(P.get('cmplv'), 10), 1, CMP_MAX_LV, null);
      if (lv) for (const e of Object.values(c.owned)) { e.lv = lv; e.exp = 0; }
    }
    if (P.has('bond')) {
      const b = parseInt(P.get('bond'), 10);
      if (Number.isFinite(b)) { const pts = b <= 5 ? BOND_RANKS[Math.max(0, b)] : Math.min(BOND_MAX, b); for (const e of Object.values(c.owned)) e.bond = pts; }
    }
    if (Object.hasOwn(c.owned, 'mt_warhorse')) state.progress.flags.stable_open = true;
    if (Object.keys(c.owned).length && guardianSlots(state) >= 2) c.slot2Seen = true;
    res.ride = ['1', 'true', 'yes'].includes(String(P.get('ride') ?? '').toLowerCase());
    Object.defineProperty(c, '_debug', { value: { ride: res.ride }, enumerable: false, configurable: true, writable: true });
  } catch (e) {
    try { console.warn('[companions] 디버그 파라미터 적용 실패', e); } catch { /* 무시 */ }
  }
  return res;
}
