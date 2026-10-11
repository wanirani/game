// 장비 점수 가중치 (docs/specs/qol_equip.md §1) — owner: QOL (gear_score.js 가 읽는다)
//  점수 = stats.js 최종 능력치로 낸 세 가지 힘의 변화율(%)을 가중합한 값:
//    off  공격 — 초당 피해 어림 (공격력·마력 × 콤보 속도 × 공격 속도 × 치명 × 속성 %, 스킬·보조무기 피해 몫)
//    def  생존 — 유효 체력 (HP × 방어·마법 저항 × 받는 피해 감소, 흡혈·재생 몫)
//    util 편의 — 이동 속도·재사용 대기·MP·획득 보너스 등 (작은 몫)
//  역할(role)은 직업(classes.js id)이 먼저, 없으면 영웅(charId) 기본 역할. 옵션 「장비 › 점수 기준」(settings.gear.weights)
//  'atk' 공격 우선 · 'bal' 균형 · 'def' 생존 우선 이 역할 가중치를 기울인다.
//
//  ROLE_WEIGHTS[role] = { off, def, util } (합 1) · MODE_TILT[mode] = { off, def, util } 곱 (다시 합 1 로 맞춘다)
//  UTIL_COEF[stat] = 그 능력치 1 이 편의 점수 몇 % 인가 (pct 능력치는 1%p 기준)

export const ROLE_WEIGHTS = Object.freeze({
  striker: Object.freeze({ off: 0.66, def: 0.28, util: 0.06 }),   // 근접 딜러 (기본)
  shooter: Object.freeze({ off: 0.68, def: 0.24, util: 0.08 }),   // 원거리 (빅터)
  caster: Object.freeze({ off: 0.62, def: 0.26, util: 0.12 }),    // 마법 (세라) — MP·재사용 대기 몫이 크다
  tank: Object.freeze({ off: 0.42, def: 0.52, util: 0.06 }),      // 방어형 (브란 기사·성기사 계열)
  support: Object.freeze({ off: 0.5, def: 0.36, util: 0.14 }),    // 회복·신탁 계열
});

/** 영웅 기본 역할 (직업 표에 없을 때) */
export const ROLE_OF_CHAR = Object.freeze({
  kael: 'striker', sera: 'caster', victor: 'shooter', bran: 'tank', lia: 'striker', azel: 'striker', isolde: 'striker',
});

/** 직업별 역할 (기본 역할과 다를 때만) */
export const ROLE_OF_CLASS = Object.freeze({
  kael_templar: 'tank',
  sera_priestess: 'support', sera_saint: 'support', sera_oracle: 'support',
  bran_berserker: 'striker', bran_warlord: 'striker', bran_bloodrage: 'striker', bran_crusader: 'striker',
  isolde_einherjar: 'tank',
});

export const MODE_TILT = Object.freeze({
  atk: Object.freeze({ off: 1.5, def: 0.6, util: 0.8 }),
  bal: Object.freeze({ off: 1, def: 1, util: 1 }),
  def: Object.freeze({ off: 0.6, def: 1.6, util: 0.9 }),
});
export const MODE_NAMES = Object.freeze({ atk: '공격 우선', bal: '균형', def: '생존 우선' });

/** 편의 능력치: 값 1(또는 1%p)이 편의 점수 몇 % 인가 */
export const UTIL_COEF = Object.freeze({
  moveSpd: 0.8, jumpPow: 0.3, airJumps: 6, cdr: 0.9, mp: 0.04, mpRegen: 2.5, ultGain: 0.5, reach: 0.4,
  expBonus: 0.3, goldBonus: 0.2, dropBonus: 0.3, heartBonus: 0.15, luck: 0.12, magnet: 2,
  resFire: 0.05, resIce: 0.05, resHoly: 0.05, resDark: 0.05, resThunder: 0.05,
});

/** 역할 → 정규화한 가중치 (mode 기울기 반영) */
export function roleWeights(role, mode = 'bal') {
  const base = ROLE_WEIGHTS[role] ?? ROLE_WEIGHTS.striker;
  const t = MODE_TILT[mode] ?? MODE_TILT.bal;
  const off = base.off * t.off, def = base.def * t.def, util = base.util * t.util;
  const s = off + def + util || 1;
  return { off: off / s, def: def / s, util: util / s };
}
/** 영웅(직업) 역할 */
export function roleOf(hero) {
  return ROLE_OF_CLASS[hero?.classId] ?? ROLE_OF_CHAR[hero?.charId] ?? 'striker';
}
