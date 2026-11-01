// 「피의 유물」 세트 밸런스 검사 (Stage 6 — owner: RELIC). tools/balance.mjs --check (기본 표) 가 함께 부른다.
//  세트 한 벌(희귀 2, 추가 옵션 없음, 강화 0) + 최대 단계 보너스를, 같은 단계 상위 변형(b) 일반 장비 한 벌(머리·몸·망토·반지·목걸이, 희귀 2)과 견준다.
//   방어 점수 D = 방어력 + 마법 저항 + 최대 HP/5 · 공격 점수 O = max(공격력, 마력)
//   ① D(세트) ≤ D(같은 단계) × 1.35      — 사이드그레이드~업그레이드
//   ② D(세트) ≤ D(한 단계 위) × 1.1      — 다음 띠 일반 장비가 따라잡는다 ('영원한 최강' 아님; 2부 세트는 위 단계가 없어 생략)
//   ③ O(세트) − O(같은 단계) ≤ 그 단계 무기 기본 공격력 × 0.3
//   ④ O(세트) ≤ O(한 단계 위) × 1.1 (위 단계가 있을 때)
//  공개: checkSets() → { rows:[{set, tier, D, Dband, Dup, O, Oband, Oup}], fails:[문자열] }
import { ITEMS, makeItem, itemStats } from '../../../src/data/items.js';
import { RELIC_SETS, RELIC_SET_IDS, SET_PIECES, setBonusStats } from '../../../src/data/relic_sets.js';

const T_ATK = [8, 17, 29, 44, 62, 84, 110];
const sumOf = (ids) => {
  const o = {};
  for (const id of ids) { if (!ITEMS[id]) continue; const s = itemStats(makeItem(id, { rarity: 2, affixes: [] })); for (const k in s) o[k] = (o[k] ?? 0) + s[k]; }
  return o;
};
const band = (t) => [`a_head_${2 * t}`, `a_body_${2 * t}`, `a_cloak_${2 * t}`, `a_ring_${2 * t}`, `a_amulet_${2 * t}`];
const D = (o) => (o.def ?? 0) + (o.res ?? 0) + (o.hp ?? 0) / 5;
const O = (o) => Math.max(o.atk ?? 0, o.mag ?? 0);
const r1 = (v) => Math.round(v * 10) / 10;

export function checkSets() {
  const rows = [], fails = [];
  for (const k of RELIC_SET_IDS) {
    const S = RELIC_SETS[k];
    const set = sumOf(SET_PIECES[k]);
    const b = setBonusStats({ [k]: S.pieces.length });
    for (const s in b) set[s] = (set[s] ?? 0) + b[s];
    const base = sumOf(band(S.tier)), up = S.tier < 7 ? sumOf(band(S.tier + 1)) : null;
    const row = { set: k, tier: S.tier, D: r1(D(set)), Dband: r1(D(base)), Dup: up ? r1(D(up)) : null, O: r1(O(set)), Oband: r1(O(base)), Oup: up ? r1(O(up)) : null };
    rows.push(row);
    if (row.D > row.Dband * 1.35) fails.push(`${k}: 방어 점수 ${row.D} > 같은 단계 ${row.Dband} × 1.35`);
    if (up && row.D > row.Dup * 1.1) fails.push(`${k}: 방어 점수 ${row.D} > 한 단계 위 ${row.Dup} × 1.1`);
    if (row.O - row.Oband > T_ATK[S.tier - 1] * 0.3) fails.push(`${k}: 공격 점수 차 ${r1(row.O - row.Oband)} > 단계 무기 공격력 ${T_ATK[S.tier - 1]} × 0.3`);
    if (up && row.O > row.Oup * 1.1) fails.push(`${k}: 공격 점수 ${row.O} > 한 단계 위 ${row.Oup} × 1.1`);
  }
  return { rows, fails };
}
