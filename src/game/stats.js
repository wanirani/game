// 최종 능력치 계산: 캐릭터 기본치 + 레벨 성장 + 직업(클래스) 보정 + 장비(강화 포함) + 패시브 스킬 + 비전서
import { CHARACTERS } from '../data/characters.js';
import { CLASSES, classChain } from '../data/classes.js';
import { itemStats, ITEMS } from '../data/items.js';
import { SKILLS } from '../data/skills.js';
import { DOCS } from '../data/lore.js';
import { findItem } from './inventory.js';
import { companionAuraStats } from './companion_state.js';   // [hook:cmp]
import { ascOf, heroChain, TOP_KEYS } from '../data/ascensions.js';   // 초월·비전 (classes_t3 §2.6)

export const EQUIP_SLOTS = ['weapon', 'head', 'body', 'cloak', 'acc1', 'acc2'];
export const SLOT_NAMES = { weapon: '무기', head: '머리', body: '몸', cloak: '망토', acc1: '장신구1', acc2: '장신구2' };

// 모든 능력치 키와 한글 이름 (UI 표시용). pct=true 는 % 표기
export const STAT_INFO = {
  hp: { name: '최대 HP' }, mp: { name: '최대 MP' }, atk: { name: '공격력' }, mag: { name: '마력' },
  def: { name: '방어력' }, res: { name: '마법 저항' }, agi: { name: '민첩' }, luck: { name: '행운' },
  crit: { name: '치명타 확률', pct: true }, critDmg: { name: '치명타 피해', pct: true },
  lifesteal: { name: '흡혈', pct: true }, hpRegen: { name: 'HP 재생/초' }, mpRegen: { name: 'MP 재생/초' },
  moveSpd: { name: '이동 속도', pct: true }, jumpPow: { name: '점프력', pct: true }, airJumps: { name: '추가 공중 점프' },
  atkSpd: { name: '공격 속도', pct: true }, expBonus: { name: '경험치 획득', pct: true }, goldBonus: { name: '골드 획득', pct: true },
  dropBonus: { name: '아이템 드롭', pct: true }, subDmg: { name: '보조무기 피해', pct: true }, skillDmg: { name: '스킬 피해', pct: true },
  cdr: { name: '재사용 대기 감소', pct: true }, ultGain: { name: '필살 게이지 충전', pct: true }, heartBonus: { name: '하트 획득', pct: true },
  fire: { name: '화염 피해', pct: true }, ice: { name: '냉기 피해', pct: true }, holy: { name: '신성 피해', pct: true },
  dark: { name: '암흑 피해', pct: true }, thunder: { name: '번개 피해', pct: true },
  resFire: { name: '화염 저항', pct: true }, resIce: { name: '냉기 저항', pct: true }, resHoly: { name: '신성 저항', pct: true },
  resDark: { name: '암흑 저항', pct: true }, resThunder: { name: '번개 저항', pct: true },
  dmgReduce: { name: '받는 피해 감소', pct: true }, reach: { name: '공격 범위', pct: true }, magnet: { name: '아이템 자석' },
};
export const STAT_KEYS = Object.keys(STAT_INFO);

export function zeroStats() {
  const s = {};
  for (const k of STAT_KEYS) s[k] = 0;
  return s;
}

export function addStats(dst, src, mul = 1) {
  if (!src) return dst;
  for (const k in src) {
    if (typeof src[k] === 'number') dst[k] = (dst[k] ?? 0) + src[k] * mul;
  }
  return dst;
}

/** 경험치 요구량 */
export function expToNext(level) {
  return Math.floor(30 * Math.pow(level, 1.65) + 20 * level);
}
export const MAX_LEVEL = 99;

/** 영웅(hero) 상태 → 최종 스탯 */
export function computeStats(state, hero) {
  const ch = CHARACTERS[hero.charId];
  const lv = hero.level ?? 1;
  const s = zeroStats();
  for (const k in ch.base) s[k] = ch.base[k] + (ch.growth?.[k] ?? 0) * (lv - 1);
  s.mpRegen += 1.2;
  const mult = {};
  // 직업 계보 (기본 → 상급 → 최상급 → 초월/비전)
  for (const cls of heroChain(hero)) {
    addStats(s, cls.flat);
    for (const k in cls.mult || {}) mult[k] = (mult[k] ?? 1) * cls.mult[k];
  }
  // 장비
  let weapon = null;
  for (const slot of EQUIP_SLOTS) {
    const uid = hero.equip?.[slot];
    if (!uid) continue;
    const inst = findItem(state, uid);
    if (!inst) continue;
    if (slot === 'weapon') weapon = inst;
    addStats(s, itemStats(inst));
  }
  // 패시브 스킬
  for (const sid in hero.skills || {}) {
    const sk = SKILLS[sid];
    const L = hero.skills[sid];
    if (!sk || !L || !sk.stats) continue;
    for (const k in sk.stats) {
      const v = sk.stats[k];
      s[k] = (s[k] ?? 0) + (Array.isArray(v) ? v[Math.min(L, v.length) - 1] : v * L);
    }
  }
  // 비전서 (계정 공유 지식)
  for (const d of state.progress?.docs || []) addStats(s, DOCS[d]?.stats);
  // 수호신 오라 (장착한 수호신만; 아케이드 모드에서는 동료가 쉰다)
  if (!state.arcade) addStats(s, companionAuraStats(state, hero));   // [hook:cmp]
  // 배율 적용
  for (const k in mult) s[k] = (s[k] ?? 0) * mult[k];
  // 정리
  s.hp = Math.round(s.hp); s.mp = Math.round(s.mp);
  for (const k of ['atk', 'mag', 'def', 'res', 'agi', 'luck']) s[k] = Math.round(s[k]);
  const rc = s.crit + s.luck * 0.1, ra = s.atkSpd + s.agi * 0.15;   // 상한 전 값
  s.crit = Math.min(75, rc);
  s.atkSpd = Math.min(80, ra);
  // 「초월 보정」 (§2.6): 초월·비전이면 상한을 넘친 치명타 확률·공격 속도가 치명타 피해(최대 +20)·이동 속도(최대 +8)로 흘러간다
  if (ascOf(hero)) {
    s.critDmg += Math.min(20, Math.max(0, rc - 75) * 1.5);
    s.moveSpd += Math.min(8, Math.max(0, ra - 80) * 0.5);
  }
  s.airJumps = Math.round(s.airJumps);
  const wbase = weapon ? ITEMS[weapon.baseId] : null;
  s.weaponType = wbase?.wtype ?? ch.weaponType;
  s.weaponStyle = wbase?.visual?.style ?? 1;
  s.element = wbase?.element ?? null;
  s.weaponLevel = weapon?.level ?? 0;
  s.weaponRarity = weapon?.rarity ?? 0;
  return s;
}

/** 캐릭터 외형 합성: 캐릭터 기본 look ← 직업 look ← 장비 visual */
export function composeLook(state, hero) {
  const ch = CHARACTERS[hero.charId];
  const look = structuredClone(ch.look);
  for (const cls of heroChain(hero)) Object.assign(look, cls.look || {});   // 초월/비전 look(갑옷색·망토)은 계보 끝에
  look.classId = hero.classId;               // 채색 퍼펫이 고를 원화: 2차 id (초월은 2차 원화 + 아래 lookTop 덧칠)
  look.asc = ascOf(hero)?.id ?? null;
  look.equip = {};
  for (const slot of EQUIP_SLOTS) {
    const inst = findItem(state, hero.equip?.[slot]);
    if (!inst) continue;
    const base = ITEMS[inst.baseId];
    const v = base?.visual || {};
    look.equip[slot] = { ...v, rarity: inst.rarity, level: inst.level, baseId: inst.baseId, wtype: base?.wtype };
    if (slot === 'head' && v.headgear) { look.headgear = v.headgear; look.headColor = v.color; }
    if (slot === 'body' && v.armor) {
      // 시작 갑옷은 직업 색을 덮지 않는다 (직업 원화·팔레트 유지; 벡터 기본색은 갑옷 종류에서 나와 시작 갑옷 색과 같다). 다른 갑옷은 그 색으로
      if (ch.startArmor?.includes(inst.baseId)) look.armor ??= v.armor;
      else { look.armor = v.armor; look.armorColor = v.color; look.armorTrim = v.trim; }
    }
    if (slot === 'cloak' && v.cape) { look.cape = { color: v.color, color2: v.color2 ?? v.color, len: v.len ?? 1, style: v.cape }; }
    if (slot === 'acc1' || slot === 'acc2') { if (v.aura) look.accAura = v.aura; }
  }
  applyLookTop(look, ascOf(hero)?.lookTop);   // 초월 정체성은 장비(갑옷·망토)가 덮지 못하게 장비 뒤에
  const w = look.equip.weapon;
  look.weapon = { type: w?.wtype ?? ch.weaponType, style: w?.style ?? 1, color: w?.color, glow: w?.glow, level: w?.level ?? 0, rarity: w?.rarity ?? 0, element: w ? ITEMS[w.baseId]?.element : null };
  return look;
}

/**
 * 초월/비전 lookTop 을 장비까지 합친 look 위에 덮는다 (TOP_KEYS 만). 표(ASCENSIONS)는 얼려 있으니 객체 값은 복사해서 넣는다.
 * capeColor2 는 망토가 있을 때만 그 안감 색을 바꾸고(망토를 새로 만들지 않음), armorTrim 은 장비 장식색을 덮는다
 */
function applyLookTop(look, top) {
  if (!top) return;
  for (const k of TOP_KEYS) {
    if (!Object.hasOwn(top, k)) continue;
    const v = top[k];
    if (k === 'capeColor2') { if (look.cape) look.cape = { ...look.cape, color2: v }; }
    else if (Array.isArray(v)) look[k] = [...v];
    else if (v && typeof v === 'object') look[k] = { ...v };
    else look[k] = v;
  }
}

/** 미리보기용 외형: 이 영웅이 id 초월/비전이었다면 (영웅은 바꾸지 않는다; id null = 기본 최상급) */
export function lookForAsc(state, hero, id) { return composeLook(state, { ...hero, asc: id }); }
