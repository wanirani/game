// 장비 점수 · 최적 장착 (docs/specs/qol_equip.md §1–§2) — owner: QOL
//  점수 = 그 영웅의 '진짜 최종 능력치'(stats.js computeStats — 직업·패시브·비전서·수호신 오라·세트·강화·추가 옵션 모두 반영)를
//  '후보를 끼웠을 때'와 '지금'으로 두 번 계산해, 그 차이를 세 가지 힘으로 바꿔 가중합한 값 (data/gear_weights.js):
//    공격 = 초당 피해 어림(dpsOf) · 생존 = 유효 체력(ehpOf) · 편의 = 이동 속도·재사용 대기 등(utilOf)
//    score = 100 × (w.off·ln(공격 비) + w.def·ln(생존 비)) + w.util·Δ편의   → 대략 '종합 전투력 몇 % 오르나'
//  공개 API:
//    gearSettings(settings?) → 정규화한 settings.gear (없으면 기본값)
//    comparable(state, hero, inst) → {ok, reason}  (직업이 못 쓰는 무기 계열·전용 장비 = 비교 대상 아님)
//    gearDelta(state, hero, inst, opts) → { comparable, reason, slot, vs, here, by, lvOk, score, mark, rows:[{k,from,to,d}], dps:{from,to,pct}, ehp, effect, loseEffect }
//    gearScore(state, hero, inst, opts) → 숫자 (비교 대상 아니면 null)
//    bestLoadout(state, heroId, opts) → plan { heroId, before, after, changes:[{slot,from,to,score}], fixed:[{slot,why}], total, rows, dps, setKept }
//    applyLoadout(state, plan|plans) → undo token · undoLoadout(state, token) → 되돌린 칸 수
//    planAll(state, opts) → { plans, total } (지금 영웅 먼저, 공유 가방 경합은 앞 영웅 우선)
//    bagMarks(state, heroId, {budgetMs}) → Map(uid → {mark:'up'|'down'|'eq'|null, other:charId|null, score}) — 시간 나눠 계산 (가방 칸 ▲ / 다른 영웅 얼굴)
//    isSpecial(inst) — 고유·신화·세트 (숫자로 다 잡히지 않는 효과 → '+효과', 최적 장착 기본 고정)
import { computeStats, EQUIP_SLOTS, STAT_INFO } from './stats.js';
import { ITEMS, isEquipment } from '../data/items.js';
import { findItem, canEquip, isEquipped } from './inventory.js';
import { CHARACTERS } from '../data/characters.js';
import { roleOf, roleWeights, UTIL_COEF } from '../data/gear_weights.js';
import { saves } from '../core/save.js';

export const DEFAULT_GEAR = Object.freeze({
  autoDispose: 'off', maxRarity: 0, weights: 'bal', fixSpecial: true,
  keep: Object.freeze({ enhanced: true, better: true, other: true, special: true }),
});
const MODES = ['atk', 'bal', 'def'];
const EPS = 0.05;   // 이보다 작은 점수 차는 '같음'

/** settings.gear 정규화 (settings 를 주지 않으면 마지막으로 불러온 설정) */
export function gearSettings(settings = saves?.settings) {
  const g = settings?.gear && typeof settings.gear === 'object' ? settings.gear : {};
  const k = g.keep && typeof g.keep === 'object' ? g.keep : {};
  const b = (v, d) => (typeof v === 'boolean' ? v : d);
  return {
    autoDispose: ['off', 'sell', 'salvage'].includes(g.autoDispose) ? g.autoDispose : 'off',
    maxRarity: [0, 1, 2].includes(g.maxRarity) ? g.maxRarity : 0,
    weights: MODES.includes(g.weights) ? g.weights : 'bal',
    fixSpecial: b(g.fixSpecial, true),
    keep: { enhanced: b(k.enhanced, true), better: b(k.better, true), other: b(k.other, true), special: b(k.special, true) },
  };
}

const baseOf = (inst) => (inst ? ITEMS[inst.baseId] ?? null : null);
/** 고유·신화·세트 장비 (고유 효과 문구가 있거나 신화·한 벌) */
export function isSpecial(inst) { const b = baseOf(inst); return !!(b && (b.unique || b.mythic || b.set || b.effect)); }
/** 숫자 밖 효과가 있는가 ('+효과' 표시) */
export function hasEffect(inst) { const b = baseOf(inst); return !!(b && (b.effect || b.mythic || b.set)); }
const slotKind = (slot) => (slot === 'acc1' || slot === 'acc2' ? 'acc' : slot);

// ───────────────────────── 힘 (공격 · 생존 · 편의) ─────────────────────────
/** 주 공격 능력치가 마력인가 (지팡이·마법 계열) */
function magicUser(hero, s) {
  if ((s?.weaponType ?? CHARACTERS[hero?.charId]?.weaponType) === 'staff') return true;
  return roleOf(hero) === 'caster';
}
/**
 * 초당 피해 어림 (tools/balance.mjs dmg() 와 같은 순서: 공격력 × 치명 기대값, 공격 속도·속성 % 를 곱한다).
 * 적 방어는 0 으로 둔다 (같은 적에게는 비율만 바뀐다). 기본 타수 2.4/초
 */
export function dpsOf(s, hero) {
  if (!s) return 1;
  const mag = magicUser(hero, s);
  const P = Math.max(1, (mag ? s.mag : s.atk) + 0.15 * (mag ? s.atk : s.mag));
  const crit = Math.min(75, Math.max(0, s.crit ?? 0)) / 100;
  let el = 1;
  if (s.element) el = 1 + Math.max(-90, s[s.element] ?? 0) / 100;
  else { let m = 0; for (const k of ['fire', 'ice', 'holy', 'dark', 'thunder']) m = Math.max(m, s[k] ?? 0); el = 1 + m / 100 * 0.2; }
  return P * 2.4 * (1 + Math.max(-50, s.atkSpd ?? 0) / 100) * (1 + crit * (0.5 + (s.critDmg ?? 0) / 100)) * el
    * (1 + (s.skillDmg ?? 0) / 100 * 0.3) * (1 + (s.subDmg ?? 0) / 100 * 0.1) * (1 + (s.reach ?? 0) / 100 * 0.15);
}
/** 유효 체력: HP ÷ (물리 0.65 · 마법 0.35 로 섞은 받는 피해 비율) × 피해 감소 · 흡혈·재생 몫 */
export function ehpOf(s) {
  if (!s) return 1;
  const pd = 100 / (100 + Math.max(0, s.def ?? 0) * 1.2), md = 100 / (100 + Math.max(0, s.res ?? 0) * 1.2);
  const taken = (0.65 * pd + 0.35 * md) * (1 - Math.min(75, Math.max(0, s.dmgReduce ?? 0)) / 100);
  return Math.max(1, s.hp ?? 1) / Math.max(0.05, taken) * (1 + Math.max(0, s.lifesteal ?? 0) * 0.02) + Math.max(0, s.hpRegen ?? 0) * 20;
}
/** 편의 점수 (UTIL_COEF 가중합) */
export function utilOf(s) {
  let u = 0;
  if (!s) return 0;
  for (const k in UTIL_COEF) u += (s[k] ?? 0) * UTIL_COEF[k];
  return u;
}
export function powerOf(s, hero) { return { off: dpsOf(s, hero), def: ehpOf(s), util: utilOf(s) }; }
/** 영웅·설정의 가중치 */
export function weightsFor(hero, mode = gearSettings().weights) { return roleWeights(roleOf(hero), mode); }
/** 두 능력치(a = 지금, b = 바꾼 뒤) 사이의 점수 */
export function scoreBetween(a, b, hero, w = weightsFor(hero)) {
  const pa = a.off != null ? a : powerOf(a, hero), pb = b.off != null ? b : powerOf(b, hero);
  const v = 100 * (w.off * Math.log(pb.off / pa.off) + w.def * Math.log(pb.def / pa.def)) + w.util * (pb.util - pa.util);
  return Number.isFinite(v) ? v : 0;
}
export const markOf = (score) => (score == null ? null : score > EPS ? 'up' : score < -EPS ? 'down' : 'eq');

// ───────────────────────── 능력치 계산 (장비 바꿔 끼우기) ─────────────────────────
/** hero.equip 을 잠깐 equip 으로 바꿔 최종 능력치를 낸다 (영웅 객체는 원래대로 돌려 둔다) */
export function statsWith(state, hero, equip) {
  const eq = hero.equip;
  hero.equip = equip;
  try { return computeStats(state, hero); } finally { hero.equip = eq; }
}
/** 비교 대상인가: 직업이 쓸 수 없는 무기 계열·다른 영웅 전용이면 아니다 (레벨 미달은 비교는 하되 lvOk=false) */
export function comparable(state, hero, inst) {
  const b = baseOf(inst);
  if (!b || !isEquipment(b)) return { ok: false, reason: '장비가 아닙니다' };
  if (b.slot === 'weapon') {
    const ch = CHARACTERS[hero?.charId];
    const types = ch?.weaponTypes ?? [ch?.weaponType];
    if (!types.includes(b.wtype)) return { ok: false, reason: '이 영웅이 다룰 수 없는 무기' };
  }
  if (b.chars && !b.chars.includes(hero?.charId)) return { ok: false, reason: '이 영웅은 장착할 수 없습니다' };
  return { ok: true };
}
/** 후보를 끼울 칸: 장신구는 비어 있는 칸 → 바꿨을 때 점수가 더 높은 칸 */
function targetSlot(state, hero, inst, base0, w) {
  const b = baseOf(inst);
  if (b.slot !== 'acc') return b.slot;
  const eq = hero.equip || {};
  if (eq.acc1 === inst.uid) return 'acc1';
  if (eq.acc2 === inst.uid) return 'acc2';
  if (!eq.acc1) return 'acc1';
  if (!eq.acc2) return 'acc2';
  const s1 = scoreBetween(base0, powerOf(statsWith(state, hero, { ...eq, acc1: inst.uid }), hero), hero, w);
  const s2 = scoreBetween(base0, powerOf(statsWith(state, hero, { ...eq, acc2: inst.uid }), hero), hero, w);
  return s2 > s1 ? 'acc2' : 'acc1';
}
let ROW_KEYS = null;   // (모듈 순환 대비: 처음 부를 때 만든다)
/** 능력치 줄 (변화가 있는 것만) */
export function statRows(a, b) {
  const rows = [];
  for (const k of (ROW_KEYS ??= Object.keys(STAT_INFO))) {
    const from = a?.[k] ?? 0, to = b?.[k] ?? 0;
    if (Math.abs(to - from) >= 0.05) rows.push({ k, from, to, d: to - from });
  }
  return rows;
}

/**
 * 후보 inst 를 지금 영웅(hero)이 끼웠을 때의 변화.
 * opts: { mode: 'atk'|'bal'|'def', slot: 'acc1'|'acc2'(장신구 칸 지정), base: 미리 계산한 지금 능력치 }
 */
export function gearDelta(state, hero, inst, opts = {}) {
  const out = { comparable: false, reason: '', slot: null, vs: null, here: false, by: null, lvOk: true, score: null, mark: null, rows: [], dps: null, ehp: null, effect: hasEffect(inst), loseEffect: false };
  if (!state || !hero || !inst) return out;
  const c = comparable(state, hero, inst);
  if (!c.ok) { out.reason = c.reason; return out; }
  out.comparable = true;
  const b = baseOf(inst);
  out.lvOk = (b.lvReq ?? 1) <= (hero.level ?? 1);
  const who = isEquipped(state, inst.uid);
  out.by = who && who !== hero.charId ? who : null;
  const w = weightsFor(hero, opts.mode);
  const s0 = opts.base ?? computeStats(state, hero);
  const p0 = powerOf(s0, hero);
  const eq = hero.equip || {};
  const mineSlot = EQUIP_SLOTS.find((s) => eq[s] === inst.uid) ?? null;
  const slot = mineSlot ?? (opts.slot && slotKind(opts.slot) === b.slot ? opts.slot : targetSlot(state, hero, inst, p0, w));
  out.slot = slot;
  out.vs = findItem(state, eq[slot]) ?? null;
  out.loseEffect = !!out.vs && out.vs.uid !== inst.uid && hasEffect(out.vs);
  if (mineSlot) {
    out.here = true; out.score = 0; out.mark = 'eq';
    const d = dpsOf(s0, hero), e = ehpOf(s0);
    out.dps = { from: d, to: d, pct: 0 }; out.ehp = { from: e, to: e, pct: 0 };
    return out;
  }
  const next = { ...eq };
  for (const s in next) if (next[s] === inst.uid) next[s] = null;   // (다른 영웅 칸은 상관없다 — 이 영웅 기준)
  next[slot] = inst.uid;
  const s1 = statsWith(state, hero, next);
  const p1 = powerOf(s1, hero);
  out.score = scoreBetween(p0, p1, hero, w);
  out.mark = markOf(out.score);
  out.rows = statRows(s0, s1);
  out.dps = { from: p0.off, to: p1.off, pct: (p1.off / p0.off - 1) * 100 };
  out.ehp = { from: p0.def, to: p1.def, pct: (p1.def / p0.def - 1) * 100 };
  return out;
}
/** 점수 하나 (비교 대상이 아니면 null) */
export function gearScore(state, hero, inst, opts = {}) {
  const d = gearDelta(state, hero, inst, opts);
  return d.comparable ? d.score : null;
}

// ───────────────────────── 최적 장착 ─────────────────────────
const ORDER = ['weapon', 'body', 'head', 'cloak', 'acc1', 'acc2'];
/**
 * 영웅 하나의 최적 장착 계획 (적용하지 않는다).
 * opts: { mode, fixSpecial(기본: 설정 fixSpecial), exclude: Set(uid) (다른 계획이 이미 쓴 것) }
 * 규칙: 잠긴 장비가 끼워진 칸 고정 · 고유/신화/세트가 끼워진 칸은 fixSpecial 이면 고정 · 다른 영웅이 끼운 장비 제외 ·
 *       레벨 제한 미달 제외 · 장신구 두 칸은 같은 장비 중복 없음 · 칸별 탐욕 선택을 바뀌지 않을 때까지(최대 3바퀴) ·
 *       끼워 둔 한 벌(set)이 깨지면 '한 벌 유지' 안과 점수를 견줘 높은 쪽
 */
export function bestLoadout(state, heroId, opts = {}) {
  const hero = state?.heroes?.[heroId];
  if (!hero) return null;
  const gs = gearSettings(opts.settings);
  const mode = opts.mode ?? gs.weights;
  const fixSpecial = opts.fixSpecial ?? gs.fixSpecial;
  const w = weightsFor(hero, mode);
  const before = { weapon: null, head: null, body: null, cloak: null, acc1: null, acc2: null, ...(hero.equip || {}) };
  const s0 = statsWith(state, hero, before);
  const p0 = powerOf(s0, hero);
  const fixed = [];
  for (const slot of EQUIP_SLOTS) {
    const it = findItem(state, before[slot]);
    if (!it) continue;
    if (it.locked) fixed.push({ slot, why: 'locked' });
    else if (fixSpecial && isSpecial(it)) fixed.push({ slot, why: 'special' });
  }
  const fixedSet = new Set(fixed.map((f) => f.slot));
  const exclude = opts.exclude ?? new Set();
  // 후보: 이 영웅이 지금 끼울 수 있는 장비 (다른 영웅 것·고정 칸의 것·다른 계획이 쓴 것 제외)
  const fixedUids = new Set(fixed.map((f) => before[f.slot]));
  const pool = { weapon: [], head: [], body: [], cloak: [], acc: [] };
  for (const it of state.inventory || []) {
    const b = baseOf(it);
    if (!b || !isEquipment(b) || fixedUids.has(it.uid) || exclude.has(it.uid)) continue;
    const who = isEquipped(state, it.uid);
    if (who && who !== heroId) continue;
    if (!canEquip(state, hero, it).ok) continue;
    pool[b.slot]?.push(it);
  }
  const run = (lock) => {
    const cur = { ...before };
    let curP = p0, curScore = 0;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const slot of ORDER) {
        if (fixedSet.has(slot) || lock.has(slot)) continue;
        let best = cur[slot], bestP = curP, bestScore = curScore;
        for (const it of pool[slotKind(slot)]) {
          if (it.uid === cur[slot]) continue;
          if (EQUIP_SLOTS.some((s) => s !== slot && cur[s] === it.uid)) continue;   // 장신구 중복 없음 (다른 칸이 쓰는 중)
          const p = powerOf(statsWith(state, hero, { ...cur, [slot]: it.uid }), hero);
          const sc = scoreBetween(p0, p, hero, w);
          if (sc > bestScore + EPS) { best = it.uid; bestP = p; bestScore = sc; }
        }
        if (best !== cur[slot]) { cur[slot] = best; curP = bestP; curScore = bestScore; moved = true; }
      }
      if (!moved) break;
    }
    // 장신구 두 개가 칸만 바뀌었으면 예전 칸 순서로 (괜히 바뀐 것처럼 보이지 않게)
    if (cur.acc1 === before.acc2 && cur.acc2 === before.acc1) { cur.acc1 = before.acc1; cur.acc2 = before.acc2; }
    else if (cur.acc2 === before.acc1 && cur.acc1 !== before.acc1 && before.acc1) { const t = cur.acc1; cur.acc1 = cur.acc2; cur.acc2 = t; }
    else if (cur.acc1 === before.acc2 && cur.acc2 !== before.acc2 && before.acc2) { const t = cur.acc2; cur.acc2 = cur.acc1; cur.acc1 = t; }
    return { cur, score: curScore };
  };
  let res = run(new Set());
  let setKept = null;
  // 한 벌(set) 확인: 지금 2개 이상 끼운 한 벌이 탐욕 선택으로 깨지면 '유지' 안을 계산해 견준다
  const sets = {};
  for (const slot of EQUIP_SLOTS) { const b = baseOf(findItem(state, before[slot])); if (b?.set) (sets[b.set] ??= []).push(slot); }
  for (const slots of Object.values(sets)) {
    if (slots.length < 2 || !slots.some((s) => res.cur[s] !== before[s])) continue;
    const alt = run(new Set(slots));
    const altScore = scoreBetween(p0, powerOf(statsWith(state, hero, alt.cur), hero), hero, w);
    const grScore = scoreBetween(p0, powerOf(statsWith(state, hero, res.cur), hero), hero, w);
    if (altScore >= grScore - EPS) { res = alt; setKept = true; } else setKept = false;
  }
  const after = res.cur;
  const s1 = statsWith(state, hero, after);
  const p1 = powerOf(s1, hero);
  const changes = [];
  for (const slot of EQUIP_SLOTS) {
    if (after[slot] === before[slot]) continue;
    // 칸별 기여: 지금 장비에서 이 칸만 바꿨을 때
    const only = scoreBetween(p0, powerOf(statsWith(state, hero, { ...before, [slot]: after[slot], ...(slot === 'acc1' && after.acc1 === before.acc2 ? { acc2: null } : {}), ...(slot === 'acc2' && after.acc2 === before.acc1 ? { acc1: null } : {}) }), hero), hero, w);
    changes.push({ slot, from: before[slot] ?? null, to: after[slot] ?? null, score: only });
  }
  return {
    heroId, mode, before, after, changes, fixed, setKept,
    total: scoreBetween(p0, p1, hero, w), rows: statRows(s0, s1),
    dps: { from: p0.off, to: p1.off, pct: (p1.off / p0.off - 1) * 100 },
    ehp: { from: p0.def, to: p1.def, pct: (p1.def / p0.def - 1) * 100 },
  };
}
/** 파티 전체 (지금 영웅 먼저, 그다음 영웅 순서). 계획만 낸다 — 계산 동안 영웅 장비를 잠깐 바꿨다가 모두 되돌린다 */
export function planAll(state, opts = {}) {
  const ids = Object.keys(state?.heroes || {});
  const order = [state.charId, ...ids.filter((id) => id !== state.charId)].filter((id) => state.heroes[id]);
  const saved = Object.fromEntries(ids.map((id) => [id, { ...(state.heroes[id].equip || {}) }]));
  const plans = [];
  let total = 0;
  try {
    for (const id of order) {
      const p = bestLoadout(state, id, opts);
      if (!p) continue;
      plans.push(p);
      total += p.total;
      state.heroes[id].equip = { ...p.after };   // 다음 영웅은 이 결과를 본다 (앞 영웅이 고른 장비는 '다른 영웅 것')
    }
  } finally {
    for (const id of ids) state.heroes[id].equip = saved[id];
  }
  return { plans, total };
}
/** 계획 적용 → 되돌리기 표 { t, heroes: {id: 예전 equip} }. 사라진 장비를 가리키는 칸은 건너뛴다 */
export function applyLoadout(state, planOrPlans) {
  const plans = Array.isArray(planOrPlans) ? planOrPlans : planOrPlans?.plans ?? [planOrPlans];
  const token = { t: Date.now(), heroes: {} };
  for (const p of plans) {
    const hero = state?.heroes?.[p?.heroId];
    if (!hero) continue;
    token.heroes[p.heroId] ??= { ...(hero.equip || {}) };
    const next = { ...(hero.equip || {}) };
    for (const c of p.changes) {
      if (c.to && !findItem(state, c.to)) continue;
      // 다른 영웅이 그새 끼운 장비면 건너뛴다 (계획 뒤 상태가 바뀐 경우)
      const who = c.to ? isEquipped(state, c.to) : null;
      if (who && who !== p.heroId) continue;
      next[c.slot] = c.to;
    }
    // 한 영웅 안에서 같은 장비가 두 칸에 남지 않게
    const seen = new Set();
    for (const s of EQUIP_SLOTS) { if (next[s] && seen.has(next[s])) next[s] = null; else if (next[s]) seen.add(next[s]); }
    if (!next.weapon) next.weapon = hero.equip?.weapon ?? null;   // 무기는 비우지 않는다
    hero.equip = next;
  }
  return token;
}
/** 되돌리기. 반환: 되돌린 칸 수 */
export function undoLoadout(state, token) {
  let n = 0;
  for (const [id, eq] of Object.entries(token?.heroes || {})) {
    const hero = state?.heroes?.[id];
    if (!hero) continue;
    const next = { ...(hero.equip || {}) };
    for (const s of EQUIP_SLOTS) {
      const want = eq[s] ?? null;
      if (want && !findItem(state, want)) continue;   // 그새 팔거나 분해한 장비
      if (next[s] !== want) { next[s] = want; n++; }
    }
    hero.equip = next;
  }
  // 다른 영웅과 겹치면 되돌린 쪽 우선 (같은 장비가 두 영웅에게 끼워지지 않게)
  const owner = new Map();
  for (const id of Object.keys(token?.heroes || {})) for (const s of EQUIP_SLOTS) { const u = state.heroes[id]?.equip?.[s]; if (u) owner.set(u, id); }
  for (const [id, h] of Object.entries(state?.heroes || {})) {
    if (token?.heroes?.[id]) continue;
    for (const s of EQUIP_SLOTS) if (h.equip?.[s] && owner.has(h.equip[s])) h.equip[s] = s === 'weapon' ? h.equip[s] : null;
  }
  return n;
}

// ───────────────────────── 가방 표시 (▲ · 다른 영웅 얼굴) ─────────────────────────
const MARKS = new WeakMap();   // state → { sig, hero, mode, map, queue }
function heroSig(state, mode) {
  let s = `${mode}|${state.charId}|${(state.progress?.docs || []).length}|`;
  for (const [id, h] of Object.entries(state.heroes || {})) {
    s += `${id}:${h.level}:${h.classId}:${h.asc ?? ''}:`;
    for (const k of EQUIP_SLOTS) { const it = findItem(state, h.equip?.[k]); s += (it ? it.uid + '+' + (it.level | 0) : '-') + ','; }
    s += Object.keys(h.skills || {}).length + ';';
  }
  return s;
}
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/**
 * 가방 칸 표시: uid → { mark, other, score } (계산 전이면 없음). 바뀐 것이 있으면 다시 계산하되 한 번에 budgetMs 까지만
 * (휴대폰에서 300칸 × 7명을 한 프레임에 계산하지 않게 — 나머지는 다음 프레임)
 */
export function bagMarks(state, heroId = state?.charId, { budgetMs = 4, mode = gearSettings().weights } = {}) {
  if (!state?.heroes?.[heroId]) return new Map();
  const sig = heroSig(state, mode);
  let c = MARKS.get(state);
  if (!c || c.sig !== sig || c.hero !== heroId) { c = { sig, hero: heroId, map: new Map(), base: new Map(), keys: new Map() }; MARKS.set(state, c); }
  const t0 = nowMs();
  const hero = state.heroes[heroId];
  for (const it of state.inventory || []) {
    const b = baseOf(it);
    if (!b || !isEquipment(b)) continue;
    const key = `${it.uid}|${it.level | 0}|${it.rarity | 0}`;
    if (c.keys.get(it.uid) === key) continue;
    if (nowMs() - t0 > budgetMs) break;
    c.keys.set(it.uid, key);
    if (isEquipped(state, it.uid)) { c.map.set(it.uid, { mark: null, other: null, score: null }); continue; }
    const base = (id) => { if (!c.base.has(id)) c.base.set(id, computeStats(state, state.heroes[id])); return c.base.get(id); };
    let mark = null, score = null;
    if (canEquip(state, hero, it).ok) {
      const d = gearDelta(state, hero, it, { mode, base: base(heroId) });
      mark = d.mark; score = d.score;
    }
    let other = null;
    if (mark !== 'up') {
      let best = 0.5;
      for (const [id, h] of Object.entries(state.heroes)) {
        if (id === heroId || !canEquip(state, h, it).ok) continue;
        const d = gearDelta(state, h, it, { mode, base: base(id) });
        if (d.score > best) { best = d.score; other = id; }
      }
    }
    c.map.set(it.uid, { mark, other, score });
  }
  return c.map;
}
/** 가방 표시를 다시 계산하게 (장비를 바꿨을 때 — 서명이 바뀌면 저절로 되지만, 테스트용) */
export function resetMarks(state) { MARKS.delete(state); }

// ───────────────────────── 처분 기준 (inventory.disposeCandidates 에 넘길 판정) ─────────────────────────
/**
 * better(inst) → 'self'(지금 영웅에게 더 좋음 ▲) | 'other'(다른 영웅에게 더 좋음) | null.
 * 영웅마다 지금 능력치는 한 번만 계산한다. 다른 영웅은 종합 +0.5 이상일 때만 (사소한 차이로 가방을 채우지 않게)
 */
export function betterFn(state, mode = gearSettings().weights) {
  const base = new Map();
  const stats = (id) => { if (!base.has(id)) base.set(id, computeStats(state, state.heroes[id])); return base.get(id); };
  return (it) => {
    const me = state.heroes?.[state.charId];
    if (me && canEquip(state, me, it).ok && (gearDelta(state, me, it, { mode, base: stats(state.charId) }).score ?? 0) > EPS) return 'self';
    for (const [id, h] of Object.entries(state.heroes || {})) {
      if (id === state.charId || !canEquip(state, h, it).ok) continue;
      if ((gearDelta(state, h, it, { mode, base: stats(id) }).score ?? 0) > 0.5) return 'other';
    }
    return null;
  };
}
/** 설정(settings.gear)으로 만든 처분 기준. over 로 기준 희귀도·예외를 덮을 수 있다 (가방 「일괄 처분」) */
export function disposeCriteria(state, settings, over = {}) {
  const g = gearSettings(settings);
  return { maxRarity: over.maxRarity ?? g.maxRarity, keep: { ...g.keep, ...(over.keep || {}) }, better: betterFn(state, g.weights) };
}
