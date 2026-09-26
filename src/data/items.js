// 아이템 데이터 + 순수 아이템 로직 (DOM·게임 상태 접근 없음 — node 에서도 import 가능)
//
// ── 베이스 스키마 ──
//  ITEMS[id] = { id, name, slot:'weapon'|'head'|'body'|'cloak'|'acc'|'consumable'|'material'|'key',
//    wtype?, tier(1~6), icon, lvReq, stats:{}, visual:{}, element?, price, stack?, use?, desc,
//    relic?, unique?, rarity?(고유 아이템 고정 희귀도), effect?(고유 효과 문구), boss?(드롭 보스 id), quest? }
//  visual — 무기 {style(1~6), color, glow} / 머리 {headgear, color} / 몸 {armor, color, trim}
//           망토 {cape:'plain'|'royal'|'tattered', color, color2, len} / 장신구 {aura:{color,type}}  (game/stats.js composeLook 가 해석)
//  use — { heal(최대 HP 비율), mp(최대 MP 비율), cure, buff:{id(POWERUPS 키), time}, warp }
// ── 인스턴스 ──
//  { uid, baseId, slot, icon, rarity(0~5), level(강화 0~15), affixes:[{id, stat, value}], qty, locked?, t?(획득 순서) }
// ── 공개 API ──
//  RARITIES, ITEMS, AFFIXES, AFFIX_MAP, UNIQUES, BOSS_UNIQUES, MYTHIC_WEAPONS, WTYPES, WTYPE_NAMES, SLOT_LABELS, STAT_LABELS
//  makeItem(baseId, {rarity, level, affixes, qty}) → inst     (희귀도>0 인데 affixes 미지정이면 자동 추첨)
//  rollItem(level, {luck, diff, slot, wtype, minRarity, maxRarity, tier}) → 무작위 장비 인스턴스
//  rollRarity(level, opts), rollAffixes(base, rarity), tierForLevel(lv)
//  itemStats(inst, {noAffix}) / itemName(inst, {full}) / itemDesc(inst) → string[] / itemDescRich(inst) → [{text,color}]
//  itemColor(inst), buyPrice(baseId, rarity), sellPrice(inst), isEquipment(inst|base), isStackable(inst|base), fmtStat(stat, v)
//  baseIdFor(slot, tier, {wtype, variant}) → 해당 단계 베이스 id (무기·방어구 id 번호는 1~12, 단계 = ceil(번호/2))
//  josa(word, '이/가'|'을/를'|'은/는'|'과/와'|'으로/로'|'이다/다'…) → 받침에 맞는 조사를 붙인 문자열
import { uid } from '../core/math.js';

// ───────────────────────────── 희귀도 ─────────────────────────────
// mult: 기본 능력치 배율, affixes: 추가 옵션 수, price: 가격 배율, fx: 옵션 수치 보정
export const RARITIES = [
  { id: 0, name: '일반', eng: 'COMMON', color: '#d8d0c0', mult: 1.0, affixes: 0, price: 1, fx: 1 },
  { id: 1, name: '고급', eng: 'UNCOMMON', color: '#6fe07a', mult: 1.1, affixes: 1, price: 1.6, fx: 1 },
  { id: 2, name: '희귀', eng: 'RARE', color: '#5aa8ff', mult: 1.22, affixes: 2, price: 2.6, fx: 1.05 },
  { id: 3, name: '영웅', eng: 'EPIC', color: '#c07cff', mult: 1.38, affixes: 3, price: 4.2, fx: 1.1 },
  { id: 4, name: '전설', eng: 'LEGENDARY', color: '#ffa640', mult: 1.58, affixes: 4, price: 7, fx: 1.2 },
  { id: 5, name: '신화', eng: 'MYTHIC', color: '#ff4a5a', mult: 1.85, affixes: 5, price: 12, fx: 1.35 },
];
const RAR_W = [620, 260, 90, 26, 5, 0.6];

export const WTYPES = ['whip', 'sword', 'greatsword', 'dagger', 'gun', 'staff'];
export const WTYPE_NAMES = { whip: '채찍', sword: '장검', greatsword: '대검', dagger: '단검', gun: '총', staff: '지팡이' };
export const EQUIP_BASE_SLOTS = ['weapon', 'head', 'body', 'cloak', 'acc'];
export const SLOT_LABELS = { weapon: '무기', head: '머리 방어구', body: '갑옷', cloak: '망토', acc: '장신구', consumable: '소모품', material: '재료', key: '중요 물품' };
export const ELEMENT_LABELS = { fire: '화염', ice: '냉기', holy: '신성', dark: '암흑', thunder: '번개' };
const EL_COLOR = { fire: '#ff7a2a', ice: '#9fe8ff', holy: '#fff2b0', dark: '#b060ff', thunder: '#bfe0ff' };
export const TIER_LV = [1, 6, 13, 21, 30, 40];
const TIER_ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ'];

// 능력치 표시 이름 (game/stats.js STAT_INFO 와 동일 — 데이터 모듈을 게임 모듈에 묶지 않기 위해 복제)
export const STAT_LABELS = {
  hp: ['최대 HP'], mp: ['최대 MP'], atk: ['공격력'], mag: ['마력'], def: ['방어력'], res: ['마법 저항'], agi: ['민첩'], luck: ['행운'],
  crit: ['치명타 확률', 1], critDmg: ['치명타 피해', 1], lifesteal: ['흡혈', 1], hpRegen: ['HP 재생', 0, '/초'], mpRegen: ['MP 재생', 0, '/초'],
  moveSpd: ['이동 속도', 1], jumpPow: ['점프력', 1], airJumps: ['공중 점프', 0, '회'], atkSpd: ['공격 속도', 1], expBonus: ['경험치 획득', 1],
  goldBonus: ['골드 획득', 1], dropBonus: ['아이템 드롭', 1], subDmg: ['보조무기 피해', 1], skillDmg: ['스킬 피해', 1], cdr: ['재사용 대기 감소', 1],
  ultGain: ['필살 게이지 충전', 1], heartBonus: ['하트 획득', 1], fire: ['화염 피해', 1], ice: ['냉기 피해', 1], holy: ['신성 피해', 1],
  dark: ['암흑 피해', 1], thunder: ['번개 피해', 1], resFire: ['화염 저항', 1], resIce: ['냉기 저항', 1], resHoly: ['신성 저항', 1],
  resDark: ['암흑 저항', 1], resThunder: ['번개 저항', 1], dmgReduce: ['받는 피해 감소', 1], reach: ['공격 범위', 1], magnet: ['아이템 자석', 0, ''],
};
const STAT_ORDER = Object.keys(STAT_LABELS);
const INT_STATS = new Set(['hp', 'mp', 'atk', 'mag', 'def', 'res', 'agi', 'luck', 'airJumps', 'magnet']);

export function fmtStat(stat, v) {
  const L = STAT_LABELS[stat];
  if (!L) return `${stat} ${v >= 0 ? '+' : ''}${v}`;
  if (stat === 'magnet') return `${L[0]} 효과`;
  const n = INT_STATS.has(stat) ? Math.round(v) : Math.round(v * 10) / 10;
  return `${L[0]} ${n >= 0 ? '+' : ''}${n}${L[1] ? '%' : L[2] ?? ''}`;
}

// ───────────────────────────── 베이스 생성 도우미 ─────────────────────────────
export const ITEMS = {};
function def(b) {
  b.stats ??= {}; b.visual ??= {};
  ITEMS[b.id] = b;
  return b;
}
const r0 = (v) => Math.max(1, Math.round(v));
function mergeStats(a, b) { for (const k in b || {}) a[k] = (a[k] ?? 0) + b[k]; return a; }

// ── 무기: 6계열 × 12종 (단계당 2종: a=표준, b=상위 변형) ──
const T_ATK = [8, 17, 29, 44, 62, 84];
const T_WPRICE = [120, 480, 1300, 3000, 6400, 13000];
const W_MUL = {
  whip: { atk: 1.0 },
  sword: { atk: 1.1, mag: 0.3 },
  greatsword: { atk: 1.38 },
  dagger: { atk: 0.76, crit: [3, 4, 5, 6, 7, 8] },
  gun: { atk: 0.88, crit: [2, 3, 3, 4, 4, 5] },
  staff: { atk: 0.5, mag: 1.05 },
};
// [이름, 속성, 추가 능력치, 색(외형), 설명]
const WEAPON_TABLE = {
  whip: [
    ['가죽 채찍', null, {}, '#6a4424', '질긴 소가죽을 꼬아 만든 헌터의 기본 채찍. 손에 익으면 이만한 것이 없다.'],
    ['사냥꾼의 채찍', null, { agi: 2 }, '#5a3418', '발크레인 가문의 수련생들이 쓰던 채찍. 손잡이에 가문의 문장이 새겨져 있다.'],
    ['사슬 채찍', null, { critDmg: 6 }, null, '쇠사슬을 엮어 만든 채찍. 묵직한 타격이 해골을 산산이 부순다.'],
    ['갈고리 사슬', null, { crit: 3 }, null, '끝에 갈고리가 달린 사슬. 살점을 파고드는 일격이 치명상을 남긴다.'],
    ['가시덩굴 채찍', null, { lifesteal: 1 }, '#4a6a30', '마녀의 정원에서 자란 가시덩굴. 적의 피를 빨아들일수록 굵어진다.'],
    ['화염 채찍', 'fire', {}, '#b0502a', '용암에 담금질한 채찍. 휘두를 때마다 불똥이 흩날린다.'],
    ['모닝스타', null, { critDmg: 12 }, null, '쇠구슬이 달린 전투용 사슬. 방패째로 적을 으깨 버린다.'],
    ['뇌명의 사슬', 'thunder', {}, '#9aa8c8', '폭풍우 치는 밤 벼락을 맞은 사슬. 푸른 전류가 끊임없이 흐른다.'],
    ['성수 채찍', 'holy', { resDark: 8 }, null, '성수에 백 일 동안 담가 축성한 채찍. 언데드에게는 그 자체로 재앙이다.'],
    ['서리 사슬', 'ice', {}, '#a8d8f0', '얼어붙은 첨탑의 만년빙으로 벼린 사슬. 스치기만 해도 피가 얼어붙는다.'],
    ['핏빛 로사리오', 'dark', { lifesteal: 2 }, null, '피로 물든 묵주를 엮은 채찍. 신앙과 저주가 한데 뒤엉켜 있다.'],
    ['심판의 채찍', 'holy', { reach: 10, crit: 4 }, '#f0dca0', '교황청 비밀 기사단의 성유물. 휘두른 궤적에 성광의 잔상이 남는다.'],
  ],
  sword: [
    ['철 장검', null, {}, null, '대장간에서 흔히 볼 수 있는 철검. 튼튼하고 정직하다.'],
    ['기사의 장검', null, { def: 2 }, null, '에슈빌 수비대에 지급되던 장검. 칼집은 녹슬었어도 칼날은 살아 있다.'],
    ['은빛 레이피어', null, { crit: 3, agi: 2 }, '#e8ecf8', '은을 입힌 가느다란 찌르기 검. 흡혈귀가 가장 싫어하는 빛을 띤다.'],
    ['강철 브로드소드', null, { hp: 15 }, null, '넓은 칼날의 강철 검. 베기와 막기 모두에 능하다.'],
    ['결투자의 세검', null, { crit: 4, atkSpd: 4 }, null, '귀족들의 결투에서 수많은 피를 본 세검. 바구니 모양 손잡이가 손을 감싼다.'],
    ['화염의 사브르', 'fire', {}, '#f0a070', '대장장이의 숨결을 머금은 곡도. 칼날이 늘 달아올라 있다.'],
    ['푸른 서리검', 'ice', {}, '#8ab8e8', '냉기를 품은 푸른 강철검. 벤 자리에 서리꽃이 핀다.'],
    ['기사단장의 검', null, { def: 5, hp: 30 }, null, '몰락한 성기사단 단장의 애검. 주인을 지키겠다는 맹세가 새겨져 있다.'],
    ['성은의 검', 'holy', {}, null, '대성당 제단에 백 년간 봉헌되었던 검. 칼끝에 은총이 맺혀 있다.'],
    ['뇌광검', 'thunder', { atkSpd: 5 }, '#d8e8ff', '번개를 벼려 만들었다는 전설의 검. 뽑는 순간 공기가 찢어진다.'],
    ['마검 아비스', 'dark', { lifesteal: 2 }, null, '심연에서 건져 올린 마검. 베어 낸 영혼을 삼키며 속삭인다.'],
    ['월광검', null, { crit: 6, mag: 12 }, '#dfe8ff', '달빛을 벼려 낸 검. 밤이 깊을수록 칼날이 푸르게 빛난다.'],
  ],
  greatsword: [
    ['철 대검', null, {}, null, '어지간한 사람은 들지도 못할 무쇠 덩어리. 무게가 곧 위력이다.'],
    ['용병의 대검', null, { hp: 10 }, null, '전장을 떠돌던 용병이 남긴 대검. 이 빠진 날에 무수한 사연이 서려 있다.'],
    ['양손 대검', null, { critDmg: 6 }, null, '양손으로 휘두르는 기다란 대검. 한 번의 횡베기로 적의 대열을 가른다.'],
    ['처형인의 검', null, { critDmg: 12 }, null, '끝이 뭉툭한 처형용 대검. 죄인의 목만 수백을 베었다.'],
    ['거인의 전투도끼', null, { critDmg: 14, hp: 20 }, null, '거인족이 쓰던 양날 도끼. 벽과 갑옷을 가리지 않고 쪼갠다.'],
    ['서리 도끼', 'ice', {}, '#a8d8f0', '날에 얼음이 서린 전투도끼. 찍힌 자는 비명조차 얼어붙는다.'],
    ['화염 대검', 'fire', {}, null, '물결치는 칼날에 지옥불을 가둔 대검. 휘두를 때마다 열풍이 인다.'],
    ['파쇄의 대검', null, { def: 6, critDmg: 10 }, null, '성문을 부수기 위해 만든 공성용 대검. 막는 것 자체가 무의미하다.'],
    ['성기사의 대검', 'holy', { def: 4 }, null, '성기사단의 상징. 녹색 성석이 악을 감지하면 은은히 빛난다.'],
    ['천둥의 대검', 'thunder', { critDmg: 10 }, '#c8d8f0', '폭풍신의 제단에서 발견된 대검. 내려칠 때마다 천둥이 울린다.'],
    ['혈마의 대검', 'dark', { lifesteal: 2 }, null, '핏빛 수정으로 이루어진 대검. 피를 마실수록 더욱 붉게 달아오른다.'],
    ['용살자의 대검', null, { critDmg: 22, hp: 40 }, null, '고룡의 목을 벤 영웅의 대검. 그 무게는 전설의 무게다.'],
  ],
  dagger: [
    ['사냥 단검', null, {}, null, '짐승 가죽을 벗길 때 쓰던 단검. 가볍고 손에 잘 붙는다.'],
    ['도둑의 단도', null, { luck: 3, goldBonus: 5 }, null, '뒷골목 소매치기들이 애용하는 단도. 주머니를 여는 데도 쓰인다.'],
    ['스틸레토', null, { crit: 3 }, null, '갑옷 틈새를 찌르기 위한 송곳 같은 단검.'],
    ['독사의 이빨', null, { critDmg: 8 }, null, '독사의 송곳니를 본떠 만든 단검. 날 끝에 늘 초록빛 독이 맺혀 있다.'],
    ['물결 크리스', null, { critDmg: 12 }, null, '파도처럼 굽이치는 칼날. 벤 상처가 좀처럼 아물지 않는다.'],
    ['화염 크리스', 'fire', {}, '#f0a070', '용암 정령의 비늘로 벼린 크리스. 칼집이 늘 따뜻하다.'],
    ['그림자 소태도', null, { atkSpd: 6 }, null, '동방 암살자의 짧은 칼. 그림자처럼 소리 없이 벤다.'],
    ['뇌전 쿠나이', 'thunder', {}, '#d8e8ff', '번개를 머금은 투척 칼. 스치면 온몸이 저려 온다.'],
    ['월영의 단검', 'dark', {}, null, '달그림자를 벼린 단검. 어둠 속에서는 칼날이 보이지 않는다.'],
    ['서리송곳', 'ice', { crit: 3 }, '#bfe8ff', '만년빙을 깎아 만든 송곳. 결코 녹지 않는다.'],
    ['핏빛 초승달', null, { lifesteal: 3, critDmg: 10 }, null, '초승달처럼 휜 붉은 칼. 흡혈귀 사냥꾼들 사이에서 금기시된 무기.'],
    ['성흔의 단검', 'holy', { crit: 5 }, null, '성인의 성흔에서 흘러내린 빛으로 벼렸다는 단검.'],
  ],
  gun: [
    ['부싯돌 권총', null, {}, null, '부싯돌로 점화하는 구식 권총. 재장전이 느리지만 믿음직하다.'],
    ['결투용 권총', null, { crit: 2 }, null, '귀족들이 결투에 쓰던 정교한 권총. 총열이 곧고 길다.'],
    ['6연발 리볼버', null, { atkSpd: 4 }, null, '회전식 탄창을 단 신식 권총. 연사에 강하다.'],
    ['은탄 권총', 'holy', {}, null, '축성된 은탄을 쓰는 권총. 흡혈귀 사냥꾼의 필수품.'],
    ['기병 카빈', null, { critDmg: 10 }, null, '기병대가 쓰던 짧은 소총. 반동이 적어 다루기 쉽다.'],
    ['화룡 나팔총', 'fire', {}, null, '총구가 나팔처럼 벌어진 산탄총. 화약 대신 용의 기름을 쓴다.'],
    ['정밀 사냥총', null, { crit: 5 }, null, '명장이 깎아 만든 사냥총. 백 보 밖의 박쥐 눈알도 맞힌다.'],
    ['전격 리볼버', 'thunder', { atkSpd: 4 }, null, '연금술사가 개조한 리볼버. 탄환에 전류가 실린다.'],
    ['황금 매그넘', null, { critDmg: 15, goldBonus: 10 }, null, '황금으로 장식한 대구경 권총. 한 발 한 발이 사치다.'],
    ['서리탄 장총', 'ice', { crit: 3 }, null, '냉기 결정을 탄환으로 쓰는 장총. 맞은 자리가 순식간에 언다.'],
    ['마탄총', 'dark', { crit: 4 }, null, '악마와 계약해 얻은 마탄을 쏘는 총. 일곱 번째 탄환은 악마의 것이다.'],
    ['연옥의 권총', 'fire', { critDmg: 18 }, null, '연옥의 불꽃으로 달군 권총. 총성은 망자의 비명과 닮았다.'],
  ],
  staff: [
    ['떡갈나무 지팡이', null, {}, null, '늙은 떡갈나무 가지로 만든 지팡이. 순례자의 길을 지켜 주었다.'],
    ['순례자의 지팡이', null, { mp: 10, res: 2 }, null, '수많은 성지를 돌아본 순례자의 지팡이. 발걸음마다 기도가 스며 있다.'],
    ['성녀의 로사리오', 'holy', {}, null, '성녀가 평생 기도하며 굴린 묵주. 알알이 빛이 깃들어 있다.'],
    ['흑단 로사리오', 'dark', {}, null, '흑단으로 만든 묵주. 어둠을 다스리는 기도에 쓰인다.'],
    ['수도원의 기도서', null, { skillDmg: 6, mp: 15 }, null, '성 루미나 수도원의 기도서. 펼치면 글자가 스스로 빛난다.'],
    ['화염 마도서', 'fire', {}, null, '불꽃의 주문이 가득한 마도서. 책장이 결코 타지 않는다.'],
    ['서리 수정 완드', 'ice', {}, null, '끝에 푸른 수정을 박은 완드. 주변 공기가 늘 차갑다.'],
    ['뇌운의 완드', 'thunder', { mpRegen: 0.5 }, null, '뇌운을 부르는 마법사의 완드. 휘두르면 머리카락이 곤두선다.'],
    ['대주교의 홀', 'holy', { res: 6 }, null, '대주교만이 들 수 있던 황금 홀. 악은 그 빛을 마주하지 못한다.'],
    ['태양의 홀', 'fire', { skillDmg: 8 }, null, '태양신을 섬기던 고대 신전의 홀. 한낮의 열기를 품고 있다.'],
    ['금단의 마도서', 'dark', { skillDmg: 10 }, null, '대도서관 가장 깊은 곳에 봉인되어 있던 마도서. 읽는 자의 영혼을 갉아먹는다.'],
    ['천상의 성전', null, { mpRegen: 1, skillDmg: 12, res: 8 }, null, '천사의 깃펜으로 쓰였다는 성전. 책장을 넘기면 찬송이 들려온다.'],
  ],
};
for (const type of WTYPES) {
  const mul = W_MUL[type];
  WEAPON_TABLE[type].forEach(([name, el, extra, color, desc], i) => {
    const t = (i >> 1) + 1, b = i & 1, k = b ? 1.1 : 1;
    const st = { atk: r0(T_ATK[t - 1] * mul.atk * k) };
    if (mul.mag) st.mag = r0(T_ATK[t - 1] * mul.mag * k);
    if (mul.crit) st.crit = mul.crit[t - 1];
    if (el) st[el] = 6 + t * 4;
    mergeStats(st, extra);
    const visual = { style: t };
    if (color) visual.color = color;
    if (el) visual.glow = EL_COLOR[el];
    def({
      id: `w_${type}_${i + 1}`, name, slot: 'weapon', wtype: type, tier: t, icon: `${type}_${t}`,
      lvReq: TIER_LV[t - 1] + (b ? 3 : 0), stats: st, visual, element: el || undefined,
      price: Math.round(T_WPRICE[t - 1] * (b ? 1.2 : 1)), desc,
    });
  });
}

// ── 방어구: 머리 / 갑옷 / 망토 각 12종 ──
const T_APRICE = [80, 320, 900, 2100, 4500, 9000];
const A_BASE = {
  head: { def: [2, 5, 9, 14, 20, 27], res: [1, 3, 5, 8, 11, 15] },
  body: { def: [3, 8, 14, 21, 30, 40], res: [1, 2, 4, 7, 10, 14], hp: [0, 10, 25, 45, 70, 100] },
  cloak: { def: [1, 3, 5, 8, 11, 15], res: [2, 4, 7, 11, 16, 22] },
};
const FOCUS = { def: { def: 1.25, res: 0.6, hp: 1 }, res: { def: 0.65, res: 1.4, hp: 0.7 }, bal: { def: 1, res: 1, hp: 1 } };
// [이름, 아이콘, 초점(def|res|bal), 외형, 추가 능력치, 설명, (고정 능력치)]
const ARMOR_TABLE = {
  head: [
    ['사냥꾼의 두건', 'head_1', 'bal', { headgear: 'hood', color: '#3a2e26' }, { agi: 1 }, '밤이슬을 막아 주는 두꺼운 두건. 얼굴을 가려 적의 눈을 피한다.'],
    ['여행자의 챙모자', 'head_2', 'def', { headgear: 'wide_hat', color: '#241c1c' }, { luck: 2 }, '챙이 넓은 가죽 모자. 비바람과 수상한 시선을 함께 가려 준다.'],
    ['마법사의 고깔', 'head_2', 'res', { headgear: 'hat', color: '#2a2248' }, { mag: 3, mp: 10 }, '별 무늬가 수놓인 뾰족 모자. 머리가 맑아지는 느낌이 든다.'],
    ['철 투구', 'head_3', 'def', { headgear: 'helm', color: '#8a8e9a' }, { hp: 10 }, '수비대의 표준 투구. 좁은 시야와 맞바꾼 든든함.'],
    ['은 서클릿', 'head_4', 'res', { headgear: 'circlet', color: '#c8ccd8' }, { mag: 5, resDark: 5 }, '달빛 보석을 박은 은관. 사악한 속삭임을 막아 준다.'],
    ['수녀의 베일', 'head_1', 'res', { headgear: 'veil', color: '#e8e2d6' }, { resHoly: 8, mpRegen: 0.3 }, '축성된 흰 베일. 쓰는 이의 마음을 평온하게 한다.'],
    ['기사의 투구', 'head_3', 'def', { headgear: 'helm', color: '#a8b0bc' }, { hp: 25 }, '면갑이 달린 기사의 투구. 수많은 전투의 흔적이 남아 있다.'],
    ['그림자 가면', 'head_3', 'bal', { headgear: 'mask', color: '#16121a' }, { crit: 4, agi: 3 }, '암살자 길드의 가면. 쓰는 순간 기척이 옅어진다.'],
    ['성녀의 티아라', 'head_4', 'res', { headgear: 'tiara', color: '#e8c872' }, { holy: 8, mp: 25 }, '성녀 루미나가 썼다는 황금 티아라. 은은한 성광을 두른다.'],
    ['악마의 뿔투구', 'head_6', 'def', { headgear: 'horns', color: '#d8ccb4' }, { atk: 6, critDmg: 8 }, '하급 악마의 뿔을 붙인 투구. 보는 것만으로도 기가 꺾인다.'],
    ['몰락한 왕의 관', 'head_5', 'bal', { headgear: 'crown', color: '#e8c872' }, { luck: 8, goldBonus: 10, hp: 40 }, '멸망한 왕국의 왕관. 루비는 아직도 피처럼 붉다.'],
    ['마왕의 뿔관', 'head_6', 'bal', { headgear: 'horns', color: '#3a1a2a' }, { atk: 8, mag: 8, resDark: 12 }, '마계 군주의 뿔로 만든 관. 어둠이 쓰는 이에게 고개를 숙인다.'],
  ],
  body: [
    ['여행자 튜닉', 'body_1', 'bal', {}, {}, '두꺼운 천으로 지은 튜닉. 갑옷이라 부르기엔 민망하지만 움직이기 편하다.', { def: 3, res: 1 }],
    ['가죽 갑옷', 'body_2', 'def', { armor: 'leather', color: '#5a3a24' }, {}, '무두질한 소가죽 갑옷. 가볍고 질기다.', { def: 5 }],
    ['사슬 갑옷', 'body_3', 'def', { armor: 'chain', color: '#8a8e9a' }, {}, '촘촘히 엮은 사슬 갑옷. 해골 병사의 녹슨 검쯤은 튕겨 낸다.', { def: 8, hp: 10 }],
    ['사제의 법의', 'body_1', 'res', {}, { mp: 15, mpRegen: 0.3 }, '축복받은 실로 지은 법의. 마법으로부터 몸을 지킨다.'],
    ['흑철 사슬갑옷', 'body_3', 'def', { armor: 'chain', color: '#4a4a58', trim: '#b01830' }, { hp: 10 }, '검게 그을린 쇠사슬 갑옷. 악마성 수비대에게서 빼앗은 것이다.'],
    ['사냥꾼의 강화 가죽', 'body_2', 'bal', { armor: 'leather', color: '#3a2418', trim: '#c8a040' }, { agi: 3, moveSpd: 3 }, '금속판을 덧댄 가죽 갑옷. 날렵함과 튼튼함을 모두 잡았다.'],
    ['강철 판금 갑옷', 'body_4', 'def', { armor: 'plate', color: '#a8b0bc' }, { hp: 20 }, '온몸을 감싸는 강철 판금. 무겁지만 그만큼 든든하다.'],
    ['밤까마귀 흉갑', 'body_3', 'bal', { armor: 'dark', color: '#2a2830', trim: '#6a5acd' }, { crit: 3, resDark: 8 }, '까마귀 깃털 문양을 새긴 흑철 흉갑. 밤에 녹아드는 사냥꾼의 갑옷.'],
    ['성기사의 갑옷', 'body_5', 'res', { armor: 'holy', color: '#dfe3ee', trim: '#e8c872' }, { resDark: 12, holy: 6 }, '성기사단의 순백 갑옷. 어둠의 저주를 튕겨 낸다.'],
    ['미스릴 판금', 'body_4', 'def', { armor: 'plate', color: '#cfe0f4', trim: '#8ab8ff' }, { agi: 4, hp: 20 }, '전설의 금속 미스릴로 만든 갑옷. 깃털처럼 가볍고 강철보다 단단하다.'],
    ['마왕의 갑주', 'body_6', 'def', { armor: 'dark', color: '#3a0a14', trim: '#ff3a4a' }, { atk: 10, resDark: 15 }, '마왕군 장군의 갑주. 틈새로 붉은 마력이 스며 나온다.'],
    ['천상의 성갑', 'body_5', 'res', { armor: 'holy', color: '#fff8ec', trim: '#ffd84a' }, { hpRegen: 1, resDark: 18, resHoly: 10 }, '천사가 벗어 두고 간 갑옷이라 전해진다. 입은 자는 결코 절망하지 않는다.'],
  ],
  cloak: [
    ['낡은 여행 망토', 'cloak_1', 'bal', { cape: 'plain', color: '#6a4a2a', color2: '#3a2818', len: 0.9 }, {}, '먼지투성이 여행용 망토. 밤바람 정도는 막아 준다.'],
    ['헌터의 망토', 'cloak_1', 'def', { cape: 'tattered', color: '#3a2a24', color2: '#1a1214', len: 1 }, { agi: 1 }, '수많은 사냥으로 해진 망토. 너덜너덜한 끝자락이 오히려 위협적이다.'],
    ['청색 모직 망토', 'cloak_2', 'res', { cape: 'plain', color: '#2a3a6a', color2: '#141c38', len: 1 }, { mp: 10 }, '두툼한 모직 망토. 마법사들이 즐겨 입는다.'],
    ['진홍 망토', 'cloak_3', 'bal', { cape: 'plain', color: '#8a1426', color2: '#3a0a12', len: 1.05 }, { atk: 2 }, '핏빛으로 물들인 망토. 흡혈귀 사냥꾼의 상징과도 같다.'],
    ['밤안개 망토', 'cloak_2', 'res', { cape: 'tattered', color: '#262a44', color2: '#101224', len: 1.05 }, { moveSpd: 4 }, '밤안개를 짜서 만들었다는 망토. 움직일 때 윤곽이 흐려진다.'],
    ['화염 도마뱀 망토', 'cloak_3', 'def', { cape: 'plain', color: '#a8401a', color2: '#3a1008', len: 1 }, { resFire: 15 }, '불도마뱀 가죽으로 만든 망토. 불길 속에서도 타지 않는다.'],
    ['귀족의 망토', 'cloak_4', 'bal', { cape: 'royal', color: '#1a1016', color2: '#8a1426', len: 1.15 }, { luck: 4, goldBonus: 6 }, '높은 깃이 달린 귀족의 망토. 안감의 진홍색이 우아하다.'],
    ['서리 여우 망토', 'cloak_5', 'res', { cape: 'plain', color: '#dfe8f0', color2: '#8ab8d8', len: 1.05 }, { resIce: 18 }, '설원 여우의 털로 만든 망토. 첨탑의 혹한도 견딜 수 있다.'],
    ['성기사의 망토', 'cloak_5', 'res', { cape: 'royal', color: '#efe6d0', color2: '#b8962a', len: 1.15 }, { resDark: 12, hpRegen: 0.5 }, '금실로 성호를 수놓은 흰 망토. 휘날릴 때마다 성가가 들리는 듯하다.'],
    ['흡혈 백작의 망토', 'cloak_4', 'bal', { cape: 'royal', color: '#120a10', color2: '#a0101e', len: 1.2 }, { lifesteal: 1.5, moveSpd: 4 }, '어느 흡혈 백작이 두르던 망토. 박쥐의 날개처럼 펼쳐진다.'],
    ['마왕의 날개 망토', 'cloak_6', 'def', { cape: 'tattered', color: '#2a0a14', color2: '#6a0a1a', len: 1.25 }, { atk: 8, resFire: 15 }, '찢긴 악마의 날개를 이어 붙인 망토. 끝자락에서 불티가 떨어진다.'],
    ['천사의 망토', 'cloak_5', 'res', { cape: 'royal', color: '#fff8ec', color2: '#e8c872', len: 1.25 }, { moveSpd: 6, jumpPow: 8, resHoly: 10 }, '천사의 깃털로 짠 망토. 몸이 새털처럼 가벼워진다.'],
  ],
};
for (const slot of ['head', 'body', 'cloak']) {
  const B = A_BASE[slot];
  ARMOR_TABLE[slot].forEach(([name, icon, focus, visual, extra, desc, fixed], i) => {
    const t = (i >> 1) + 1, b = i & 1, k = b ? 1.1 : 1, F = FOCUS[focus];
    let st;
    if (fixed) st = { ...fixed };
    else {
      st = { def: r0(B.def[t - 1] * F.def * k), res: r0(B.res[t - 1] * F.res * k) };
      if (B.hp && B.hp[t - 1]) st.hp = Math.round(B.hp[t - 1] * F.hp * k);
      mergeStats(st, extra);
    }
    const id = slot === 'body' ? `a_body_${i + 1}` : `a_${slot}_${i + 1}`;
    def({ id, name, slot, tier: t, icon, lvReq: TIER_LV[t - 1] + (b ? 3 : 0), stats: st, visual, price: Math.round(T_APRICE[t - 1] * (b ? 1.2 : 1)), desc });
  });
}

// ── 장신구: 반지 12 + 목걸이/부적 12 ──
const T_CPRICE = [150, 500, 1300, 3000, 6500, 13000];
// [id, 이름, 아이콘, 단계, 능력치, 오라, 설명]
const ACC_TABLE = [
  ['a_ring_1', '철 반지', 'ring_1', 1, { atk: 2, def: 1 }, null, '투박한 쇠 반지. 주먹을 쥘 때 조금 든든하다.'],
  ['a_ring_2', '루비 반지', 'ring_2', 1, { atk: 2, fire: 6 }, null, '작은 루비가 박힌 반지. 손끝이 따뜻해진다.'],
  ['a_ring_3', '사파이어 반지', 'ring_3', 2, { mag: 5, ice: 8, mp: 10 }, null, '푸른 사파이어가 박힌 반지. 차가운 마력이 흐른다.'],
  ['a_ring_4', '에메랄드 반지', 'ring_4', 2, { luck: 5, hpRegen: 0.4 }, null, '초록빛 에메랄드 반지. 행운과 생명력을 불러온다고 한다.'],
  ['a_ring_5', '해골 반지', 'ring_5', 3, { atk: 6, dark: 10 }, null, '해골이 조각된 금반지. 죽음을 두려워하지 않게 된다.'],
  ['a_ring_6', '핏방울 반지', 'ring_6', 3, { atk: 4, lifesteal: 1.5 }, null, '붉은 구슬 속에서 피가 소용돌이치는 반지.'],
  ['a_ring_7', '전사의 인장', 'ring_1', 4, { atk: 12, crit: 3 }, null, '역전의 용사들에게 수여되던 흑철 인장 반지.'],
  ['a_ring_8', '불꽃의 반지', 'ring_2', 4, { atk: 8, fire: 15, resFire: 10 }, { color: '#ff7a2a', type: 'fire' }, '작은 불꽃 정령이 깃든 반지. 손가락 주위에 불티가 맴돈다.'],
  ['a_ring_9', '현자의 반지', 'ring_3', 5, { mag: 16, cdr: 6, mp: 20 }, null, '대현자가 끼던 반지. 주문이 저절로 떠오른다.'],
  ['a_ring_10', '네잎클로버 반지', 'ring_4', 5, { luck: 15, dropBonus: 12, goldBonus: 12 }, null, '네잎클로버를 영원히 가둔 에메랄드 반지. 행운이 끊이지 않는다.'],
  ['a_ring_11', '죽음의 반지', 'ring_5', 6, { atk: 18, crit: 6, critDmg: 20, dark: 15 }, { color: '#b060ff', type: 'dark' }, '사신의 손가락에서 빠졌다는 반지. 끼는 순간 체온이 사라진다.'],
  ['a_ring_12', '진혈의 반지', 'ring_6', 6, { atk: 16, lifesteal: 3, hp: 60 }, { color: '#ff3040', type: 'blood' }, '고대 흡혈귀의 피를 응축한 반지. 맥박처럼 고동친다.'],
  ['a_amulet_1', '나무 십자가', 'amulet_1', 1, { res: 3, resDark: 5 }, null, '가죽끈에 꿴 나무 십자가. 마을 신부님이 손수 깎아 주셨다.'],
  ['a_amulet_2', '초승달 펜던트', 'amulet_2', 1, { mp: 10, mpRegen: 0.3 }, null, '은빛 초승달 펜던트. 밤이면 희미하게 빛난다.'],
  ['a_amulet_3', '늑대 이빨 목걸이', 'amulet_3', 2, { atk: 4, agi: 3 }, null, '굶주린 늑대의 송곳니를 엮은 목걸이. 사냥 본능이 깨어난다.'],
  ['a_amulet_4', '붉은 심장 로켓', 'amulet_4', 2, { hp: 30, hpRegen: 0.3 }, null, '하트 모양의 루비 로켓. 소중한 사람의 초상이 들어 있다.'],
  ['a_amulet_5', '은십자 목걸이', 'amulet_1', 3, { holy: 10, resDark: 10, res: 5 }, null, '순은으로 만든 십자가. 흡혈귀를 쫓는 가장 오래된 방법.'],
  ['a_amulet_6', '달빛 펜던트', 'amulet_2', 3, { mag: 8, mp: 20 }, null, '보름달 아래서만 세공할 수 있다는 펜던트.'],
  ['a_amulet_7', '사냥꾼의 부적', 'amulet_3', 4, { crit: 6, critDmg: 15 }, null, '처치한 마물의 이빨을 엮은 부적. 급소가 눈에 들어온다.'],
  ['a_amulet_8', '생명의 로켓', 'amulet_4', 4, { hp: 80, hpRegen: 1 }, null, '생명의 나무 수액을 담은 로켓. 상처가 저절로 아문다.'],
  ['a_amulet_9', '태양의 부적', 'amulet_5', 5, { holy: 15, fire: 15, res: 8 }, { color: '#fff2b0', type: 'holy' }, '태양신의 눈을 새긴 황금 부적. 밤에도 햇살이 비친다.'],
  ['a_amulet_10', '별빛 부적', 'amulet_6', 5, { mag: 16, skillDmg: 12 }, { color: '#c07cff', type: 'dark' }, '별의 파편을 담은 부적. 마력이 은하처럼 소용돌이친다.'],
  ['a_amulet_11', '성인의 유골함', 'amulet_1', 6, { res: 25, dmgReduce: 6, resDark: 20 }, { color: '#fff2b0', type: 'holy' }, '성인의 유골 한 조각을 모신 목걸이. 어떤 저주도 닿지 못한다.'],
  ['a_amulet_12', '심연의 별', 'amulet_6', 6, { mag: 20, skillDmg: 20, cdr: 8 }, { color: '#b060ff', type: 'dark' }, '심연 밑바닥에서 빛나던 별. 들여다보면 끝없이 빨려 든다.'],
];
for (const [id, name, icon, t, stats, aura, desc] of ACC_TABLE) {
  const n = +id.split('_').pop();
  def({ id, name, slot: 'acc', tier: t, icon, lvReq: TIER_LV[t - 1] + ((n - 1) % 2 ? 3 : 0), stats, visual: aura ? { aura } : {}, price: T_CPRICE[t - 1], desc });
}

// ───────────────────────────── 고유 아이템 (보스 · 신화 무기) ─────────────────────────────
// 고유 아이템은 능력치가 고정(희귀도 배율 미적용, 무작위 옵션 없음)이며 effect 문구로 특수 효과를 설명한다.
const UNIQUE_LIST = [
  { id: 'u_nightwing', name: '나이트윙의 박쥐날개', slot: 'cloak', tier: 1, icon: 'cloak_6', lvReq: 3, rarity: 4, boss: 'b_nightwing',
    stats: { def: 3, res: 5, agi: 3, moveSpd: 6, airJumps: 1 }, visual: { cape: 'tattered', color: '#240a14', color2: '#7a0a1e', len: 1.2 },
    effect: '박쥐의 날개 — 공중 점프 횟수 +1', desc: '밤하늘의 박쥐왕 나이트윙의 날개막으로 지은 망토. 두르면 몸이 허공을 박찬다.' },
  { id: 'u_banshee', name: '밴시의 눈물', slot: 'acc', tier: 2, icon: 'amulet_2', lvReq: 5, rarity: 4, boss: 'b_banshee',
    stats: { mag: 6, res: 6, mp: 25, mpRegen: 0.8, resDark: 15 }, visual: { aura: { color: '#9fd8ff', type: 'ice' } },
    effect: '통곡의 메아리 — MP 재생 +0.8/초, 암흑 저항 +15%', desc: '밴시 여왕이 흘린 마지막 눈물이 굳은 보석. 귀를 대면 먼 곳의 울음이 들린다.' },
  { id: 'u_dullahan', name: '둘라한의 무두 투구', slot: 'head', tier: 2, icon: 'head_3', lvReq: 7, rarity: 4, boss: 'b_dullahan',
    stats: { def: 10, res: 4, hp: 30, dmgReduce: 4, resDark: 10 }, visual: { headgear: 'helm', color: '#2a2a34' },
    effect: '목 없는 기사 — 받는 피해 -4%', desc: '머리 없는 기사가 옆구리에 끼고 다니던 투구. 안에서 이따금 웃음소리가 새어 나온다.' },
  { id: 'u_crimson', name: '진홍의 갑주', slot: 'body', tier: 3, icon: 'body_6', lvReq: 10, rarity: 4, boss: 'b_crimson',
    stats: { def: 20, res: 6, hp: 50, atk: 6, lifesteal: 2 }, visual: { armor: 'dark', color: '#7a0a18', trim: '#e8c872' },
    effect: '피의 맹약 — 흡혈 +2%', desc: '진홍의 갑주군주가 피로 맹세하며 입었던 갑옷. 입은 자의 상처를 적의 피로 메운다.' },
  { id: 'u_bonedragon', name: '용골대검 드라코', slot: 'weapon', wtype: 'greatsword', tier: 3, icon: 'greatsword_4', lvReq: 13, rarity: 4, boss: 'b_bonedragon',
    stats: { atk: 46, fire: 22, critDmg: 20 }, element: 'fire', visual: { style: 4, color: '#e8dcc0', glow: '#ff7a2a' },
    effect: '용의 숨결 — 화염 피해 +22%, 치명타 피해 +20%', desc: '본 드래곤의 척추뼈를 통째로 깎아 만든 대검. 칼날 속에서 아직도 용의 불씨가 타오른다.' },
  { id: 'u_bonedragon2', name: '용골 반지', slot: 'acc', tier: 3, icon: 'ring_5', lvReq: 11, rarity: 4, boss: 'b_bonedragon',
    stats: { atk: 6, def: 6, hp: 40, resFire: 20 }, visual: {},
    effect: '용린의 가호 — 화염 저항 +20%', desc: '용의 손가락뼈를 깎아 만든 반지. 불꽃이 끼는 이를 피해 간다.' },
  { id: 'u_grimoire', name: '그리모어 원전', slot: 'weapon', wtype: 'staff', tier: 3, icon: 'staff_6', lvReq: 16, rarity: 4, boss: 'b_grimoire',
    stats: { atk: 16, mag: 40, skillDmg: 15, cdr: 8, dark: 15 }, element: 'dark', visual: { style: 6, glow: '#b060ff' },
    effect: '금서의 지식 — 스킬 피해 +15%, 재사용 대기 -8%', desc: '살아 있는 마도서 그리모어의 원본. 책장이 스스로 넘어가며 주문을 읊조린다.' },
  { id: 'u_chimera', name: '키메라의 독아', slot: 'weapon', wtype: 'dagger', tier: 4, icon: 'dagger_3', lvReq: 19, rarity: 4, boss: 'b_chimera',
    stats: { atk: 38, crit: 12, critDmg: 25, atkSpd: 8 }, visual: { style: 3, color: '#b8f08a', glow: '#8aff6a' },
    effect: '합성 맹독 — 치명타 확률 +12%, 공격 속도 +8%', desc: '키메라 호문쿨루스의 독니를 벼린 단검. 초록빛 독이 칼날을 타고 흐른다.' },
  { id: 'u_leviathan', name: '레비아탄의 비늘 갑옷', slot: 'body', tier: 4, icon: 'body_4', lvReq: 22, rarity: 4, boss: 'b_leviathan',
    stats: { def: 32, res: 14, hp: 80, resIce: 20, resThunder: 20 }, visual: { armor: 'plate', color: '#2a5a7a', trim: '#9fe8ff' },
    effect: '심해의 비늘 — 냉기·번개 저항 +20%', desc: '심연의 괴어 레비아탄의 비늘을 엮은 갑옷. 물기 어린 광택이 결코 마르지 않는다.' },
  { id: 'u_colossus', name: '거신의 심장포', slot: 'weapon', wtype: 'gun', tier: 4, icon: 'gun_4', lvReq: 26, rarity: 4, boss: 'b_colossus',
    stats: { atk: 52, crit: 8, thunder: 25, atkSpd: 6 }, element: 'thunder', visual: { style: 4, glow: '#bfe0ff' },
    effect: '태엽 심장 — 번개 피해 +25%, 공격 속도 +6%', desc: '태엽 거신의 동력로를 총열에 박아 넣은 총. 방아쇠를 당기면 톱니가 비명을 지른다.' },
  { id: 'u_frostqueen', name: '서리 여왕의 왕관', slot: 'head', tier: 5, icon: 'head_4', lvReq: 30, rarity: 4, boss: 'b_frostqueen',
    stats: { def: 16, res: 22, mag: 18, ice: 25, resIce: 30 }, visual: { headgear: 'tiara', color: '#bfeaff' },
    effect: '영원한 겨울 — 냉기 피해 +25%, 냉기 저항 +30%', desc: '서리 여왕 이자벨라의 얼음 왕관. 녹지 않는 눈물이 보석처럼 박혀 있다.' },
  { id: 'u_death', name: '사신의 낫검', slot: 'weapon', wtype: 'sword', tier: 5, icon: 'sword_6', lvReq: 34, rarity: 5, boss: 'b_death',
    stats: { atk: 72, mag: 20, dark: 30, lifesteal: 3, critDmg: 25 }, element: 'dark', visual: { style: 6, glow: '#b060ff' },
    effect: '영혼 수확 — 암흑 피해 +30%, 흡혈 +3%', desc: '사신 데스의 낫을 벼려 만든 검. 베인 자의 영혼이 칼날에 붙들려 운다.' },
  { id: 'u_dracula', name: '드라큘라의 망토', slot: 'cloak', tier: 6, icon: 'cloak_4', lvReq: 38, rarity: 5, boss: 'b_dracula',
    stats: { def: 16, res: 28, hp: 80, lifesteal: 3, moveSpd: 8, resDark: 25 }, visual: { cape: 'royal', color: '#0a0608', color2: '#b0101e', len: 1.3 },
    effect: '밤의 군주 — 흡혈 +3%, 이동 속도 +8%', desc: '드라큘라 백작이 사백 년 동안 두른 망토. 펄럭일 때마다 박쥐 떼의 날갯짓 소리가 난다.' },
  { id: 'u_dracula2', name: '진조의 인장', slot: 'acc', tier: 6, icon: 'ring_6', lvReq: 38, rarity: 5, boss: 'b_dracula',
    stats: { atk: 22, mag: 22, lifesteal: 3, crit: 6, hp: 50 }, visual: { aura: { color: '#ff3040', type: 'blood' } },
    effect: '진조의 피 — 흡혈 +3%, 치명타 확률 +6%', desc: '모든 흡혈귀의 시조가 끼던 인장 반지. 핏빛 구슬 속에서 심장이 뛴다.' },
  { id: 'u_chaos', name: '혼돈의 핵', slot: 'acc', tier: 6, icon: 'amulet_6', lvReq: 45, rarity: 5, boss: 'b_chaos',
    stats: { atk: 25, mag: 25, skillDmg: 20, ultGain: 25, cdr: 10, fire: 10, ice: 10, holy: 10, dark: 10, thunder: 10 }, visual: { aura: { color: '#b060ff', type: 'dark' } },
    effect: '혼돈의 근원 — 모든 속성 피해 +10%, 필살 게이지 충전 +25%', desc: '혼돈의 군주의 심장부에서 꺼낸 핵. 세상의 모든 색이 뒤섞여 소용돌이친다.' },
  { id: 'u_goldbat', name: '황금 박쥐의 반지', slot: 'acc', tier: 2, icon: 'ring_2', lvReq: 5, rarity: 4,
    stats: { luck: 8, goldBonus: 25, magnet: 1 }, visual: { aura: { color: '#ffd84a', type: 'holy' } },
    effect: '황금 자석 — 떨어진 금화와 아이템을 끌어당긴다', desc: '황금 박쥐가 둥지에 모아 둔 반지. 반짝이는 것은 무엇이든 끌어당긴다.' },
  // ── 신화 무기 (심연의 역성·혼돈의 군주, 극히 드물게 모든 보스) ──
  { id: 'u_vigilia', name: '성채찍 비질리아', slot: 'weapon', wtype: 'whip', tier: 6, icon: 'whip_5', lvReq: 42, rarity: 5, mythic: true,
    stats: { atk: 100, holy: 35, reach: 15, crit: 6 }, element: 'holy', visual: { style: 5, color: '#f4e4b0', glow: '#fff2b0' },
    effect: '각성한 성채찍 — 신성 피해 +35%, 공격 범위 +15%', desc: '발크레인 가문에 대대로 전해진 전설의 성채찍. 진정한 주인의 손에서 마침내 깨어났다.' },
  { id: 'u_astraea', name: '성검 아스트레아', slot: 'weapon', wtype: 'sword', tier: 6, icon: 'sword_5', lvReq: 42, rarity: 5, mythic: true,
    stats: { atk: 104, mag: 32, holy: 30, crit: 8 }, element: 'holy', visual: { style: 5, glow: '#fff2b0' },
    effect: '별의 정의 — 신성 피해 +30%, 치명타 확률 +8%', desc: '정의의 여신의 이름을 딴 성검. 칼날에 새긴 별자리가 적의 죄를 비춘다.' },
  { id: 'u_ragnarok', name: '멸세대검 라그나로크', slot: 'weapon', wtype: 'greatsword', tier: 6, icon: 'greatsword_6', lvReq: 42, rarity: 5, mythic: true,
    stats: { atk: 132, critDmg: 40, dmgReduce: 5, hp: 60 }, visual: { style: 6 },
    effect: '종말의 무게 — 치명타 피해 +40%, 받는 피해 -5%', desc: '세상의 끝에 휘둘러질 것이라 예언된 대검. 핏빛 수정 속에 멸망한 별들이 잠들어 있다.' },
  { id: 'u_nyx', name: '월식의 단검 닉스', slot: 'weapon', wtype: 'dagger', tier: 6, icon: 'dagger_5', lvReq: 42, rarity: 5, mythic: true,
    stats: { atk: 76, crit: 18, critDmg: 35, dark: 25, atkSpd: 10 }, element: 'dark', visual: { style: 5, glow: '#b060ff' },
    effect: '밤의 여신 — 치명타 확률 +18%, 공격 속도 +10%', desc: '밤의 여신 닉스가 달을 가릴 때 흘린 그림자. 빛조차 베어 버린다.' },
  { id: 'u_judgement', name: '천벌총 저지먼트', slot: 'weapon', wtype: 'gun', tier: 6, icon: 'gun_5', lvReq: 42, rarity: 5, mythic: true,
    stats: { atk: 88, crit: 12, holy: 30, subDmg: 20 }, element: 'holy', visual: { style: 5, glow: '#fff2b0' },
    effect: '최후의 심판 — 신성 피해 +30%, 보조무기 피해 +20%', desc: '천사의 나팔을 녹여 만든 총. 총성은 곧 최후의 심판을 알리는 소리다.' },
  { id: 'u_seraphim', name: '대천사의 홀 세라핌', slot: 'weapon', wtype: 'staff', tier: 6, icon: 'staff_5', lvReq: 42, rarity: 5, mythic: true,
    stats: { atk: 40, mag: 116, holy: 35, skillDmg: 20, mpRegen: 1.5 }, element: 'holy', visual: { style: 5, glow: '#fff2b0' },
    effect: '여섯 날개의 축복 — 스킬 피해 +20%, MP 재생 +1.5/초', desc: '최상급 천사 세라핌의 깃털이 감긴 홀. 들어 올리면 여섯 날개의 환영이 펼쳐진다.' },
];
const U_PRICE = [2000, 5000, 12000, 25000, 50000, 90000];
for (const u of UNIQUE_LIST) def({ ...u, unique: true, price: U_PRICE[u.tier - 1] * (u.rarity >= 5 ? 1.5 : 1) });
export const UNIQUES = UNIQUE_LIST.map((u) => u.id);
/** 보스 id → 고유 드롭 목록 */
export const BOSS_UNIQUES = {};
for (const u of UNIQUE_LIST) if (u.boss) (BOSS_UNIQUES[u.boss] ??= []).push(u.id);
/** 무기 계열 → 신화 무기 id */
export const MYTHIC_WEAPONS = Object.fromEntries(UNIQUE_LIST.filter((u) => u.mythic).map((u) => [u.wtype, u.id]));

// ───────────────────────────── 소모품 ─────────────────────────────
const CONSUMABLES = [
  ['c_potion', '회복 물약', 'potion_hp', 60, { heal: 0.35 }, '붉은 약초를 달인 물약. 쓴맛이 강하지만 상처가 금세 아문다.'],
  ['c_hipotion', '고급 회복 물약', 'potion_full', 180, { heal: 0.7 }, '연금술사 길드의 인장이 찍힌 진한 회복약. 뼈에 금이 가도 버틸 수 있다.'],
  ['c_ether', '마나 에테르', 'potion_mp', 90, { mp: 0.5 }, '푸른 마력이 녹아 있는 에테르. 마시면 머릿속이 맑아진다.'],
  ['c_hiether', '고급 에테르', 'potion_mp', 240, { mp: 1 }, '정제를 거듭한 순수 에테르. 한 병이면 마력이 가득 찬다.'],
  ['c_elixir', '엘릭서', 'elixir', 1200, { heal: 1, mp: 1, cure: true }, '연금술의 정점. 한 방울로 HP와 MP를 모두 되살리는 기적의 영약.'],
  ['c_antidote', '해독제', 'antidote', 40, { cure: true, heal: 0.1 }, '온갖 독과 저주를 씻어 내는 약. 약간의 체력도 되찾아 준다.'],
  ['c_meat', '통구이 고기', 'meat', 45, { heal: 0.25 }, '흑묘 여관 마르타의 특제 고기 구이. 성벽 속 고기와는 차원이 다르다.'],
  ['c_bread', '호밀빵', 'bread', 20, { heal: 0.12 }, '딱딱하지만 든든한 호밀빵. 헌터의 비상식량.'],
  ['c_holywater', '축성된 성수', 'sub_holywater', 400, { buff: { id: 'holyaura', time: 20 } }, '알베르토 신부가 축성한 성수. 몸에 뿌리면 20초간 성광의 오라가 주변 적을 태운다.'],
  ['c_rage_tonic', '광전사의 비약', 'powerup', 500, { buff: { id: 'rage', time: 12 } }, '마시는 순간 피가 끓어오르는 비약. 12초간 공격력이 두 배가 된다.'],
  ['c_warp', '귀환 주문서', 'doc', 150, { warp: true }, '찢는 순간 에슈빌 마을로 돌아가는 주문서. 보스의 결계 안에서는 쓸 수 없다.'],
];
for (const [id, name, icon, price, use, desc] of CONSUMABLES) def({ id, name, slot: 'consumable', tier: 1, icon, lvReq: 1, price, stack: 99, use, desc });

// ───────────────────────────── 재료 ─────────────────────────────
const STONE_NAMES = ['하급 강화석', '중급 강화석', '상급 강화석', '최상급 강화석', '영웅의 강화석', '전설의 강화석'];
const STONE_PRICE = [30, 90, 260, 700, 1800, 5000];
const STONE_DESC = [
  '흔한 광석에서 추출한 강화석. +1~+3 강화에 쓰인다.',
  '초록빛 마력이 감도는 강화석. +4~+6 강화에 쓰인다.',
  '푸른 결정이 맺힌 강화석. +7~+9 강화에 쓰인다.',
  '보랏빛 마력이 응축된 강화석. +10~+12 강화에 쓰인다.',
  '황금빛으로 타오르는 강화석. +13~+14 강화에 쓰인다.',
  '핏빛으로 고동치는 전설의 강화석. 마지막 +15 강화에 쓰인다.',
];
for (let i = 1; i <= 6; i++) def({ id: `m_stone_${i}`, name: STONE_NAMES[i - 1], slot: 'material', tier: i, icon: `stone_${i}`, lvReq: 1, price: STONE_PRICE[i - 1], stack: 999, stone: i, desc: STONE_DESC[i - 1] });
def({ id: 'm_scroll_protect', name: '보호 주문서', slot: 'material', tier: 4, icon: 'scroll_protect', lvReq: 1, price: 3000, stack: 999, desc: '강화에 실패해도 단계가 내려가거나 장비가 파괴되지 않도록 지켜 준다. 강화 1회에 1장 소모.' });
def({ id: 'm_scroll_bless', name: '축복 주문서', slot: 'material', tier: 3, icon: 'scroll_bless', lvReq: 1, price: 1500, stack: 999, desc: '강화 성공률을 10%p 높여 준다. 강화 1회에 1장 소모.' });
const MATERIALS = [
  ['m_bone', '해골 파편', 'relic_5', 1, 8, '해골 병사에게서 떨어져 나온 뼛조각. 대장장이가 골분 연마제로 쓴다.'],
  ['m_fang', '맹수의 송곳니', 'relic_1', 1, 12, '굶주린 짐승의 날카로운 송곳니. 부적 재료로 인기가 많다.'],
  ['m_cloth', '해진 천 조각', 'cloak_1', 1, 6, '망자의 옷에서 찢겨 나온 천. 빨면 아직 쓸 만하다.'],
  ['m_feather', '검은 깃털', 'sub_dagger', 1, 10, '시체 까마귀의 칼날 같은 깃털. 화살깃이나 펜으로 쓰인다.'],
  ['m_ectoplasm', '엑토플라즘', 'potion_mp', 2, 20, '원혼이 흩어지며 남긴 반투명한 점액. 병에 담아도 스멀스멀 움직인다.'],
  ['m_iron', '녹슨 철편', 'sub_axe', 2, 15, '저주받은 갑옷에서 떨어진 쇳조각. 녹여서 다시 벼릴 수 있다.'],
  ['m_crystal', '마력 결정', 'gem_crystal', 3, 40, '마력이 굳어 생긴 투명한 결정. 마법 도구의 핵심 재료.'],
  ['m_blood', '응고된 피', 'potion_hp', 3, 35, '흡혈귀의 권속에게서 얻은 검붉은 피. 맥동하듯 떨린다.'],
  ['m_soul', '떠도는 영혼', 'amulet_6', 3, 60, '성불하지 못한 영혼의 불씨. 따뜻하면서도 서늘하다.'],
  ['m_dark', '암흑 정수', 'relic_4', 4, 80, '마족의 몸에서 흘러나온 어둠의 정수. 맨손으로 만지면 안 된다.'],
  ['m_gear', '태엽 톱니', 'sub_stopwatch', 4, 70, '시계탑의 기계 병사에게서 떼어 낸 정밀한 톱니. 아직도 째깍거린다.'],
  ['m_scale', '심해의 비늘', 'amulet_2', 4, 75, '지하 수로의 어인과 괴어에게서 얻은 비늘. 칼날도 미끄러진다.'],
  ['m_ice', '만년빙 결정', 'gem_crystal', 5, 110, '얼어붙은 첨탑에서만 나는 결정. 한여름에도 녹지 않는다.'],
  ['m_herb', '월하초', 'antidote', 2, 18, '달빛 아래서만 피는 약초. 물약과 해독제의 원료가 된다.'],
];
for (const [id, name, icon, tier, price, desc] of MATERIALS) def({ id, name, slot: 'material', tier, icon, lvReq: 1, price, stack: 999, desc });

// ───────────────────────────── 중요 물품 (유물 · 퀘스트) ─────────────────────────────
const KEYS = [
  ['k_relic_1', '흡혈귀의 송곳니', 'relic_1', true, '드라큘라의 유물. 백작이 처음으로 피를 마신 밤에 부러진 송곳니라 전해진다.'],
  ['k_relic_2', '드라큘라의 늑골', 'relic_5', true, '드라큘라의 유물. 영원히 썩지 않는 늑골이 붉은 심지를 품고 있다.'],
  ['k_relic_3', '검은 심장', 'relic_4', true, '드라큘라의 유물. 멈춘 지 수백 년이 지났건만 가끔 한 번씩 고동친다.'],
  ['k_relic_4', '불멸의 눈', 'relic_3', true, '드라큘라의 유물. 감기지 않는 눈동자가 가진 자를 끝없이 지켜본다.'],
  ['k_relic_5', '피의 반지', 'relic_2', true, '드라큘라의 유물. 백작의 피로 맺은 계약의 증표인 반지.'],
  ['k_castle_key', '악마성의 열쇠', 'key', false, '악마성 깊은 곳의 문을 여는 녹슨 열쇠. 손잡이에 박쥐 문장이 새겨져 있다.'],
  ['k_letter', '알베르토 신부의 서신', 'doc', false, '교황청에 보내는 밀봉된 서신. 봉랍에 성 루미나 수도회의 문장이 찍혀 있다.'],
  ['k_locket', '엘리제의 로켓', 'amulet_4', false, '엘리제가 잃어버린 로켓. 안에는 돌아가신 어머니의 초상이 들어 있다.'],
  ['k_seal', '봉인의 인장', 'coin', false, '심연의 역성으로 가는 문을 봉인한 성 금화. 다섯 유물에 반응해 떨린다.'],
];
for (const [id, name, icon, relic, desc] of KEYS) def({ id, name, slot: 'key', tier: 1, icon, lvReq: 1, price: 0, relic: relic || undefined, quest: !relic || undefined, desc });

// ───────────────────────────── 추가 옵션 (접두 · 접미) ─────────────────────────────
// sl: 붙을 수 있는 부위 W무기 H머리 B갑옷 C망토 A장신구 / sc: 단계 보정 f(고정치) p(%) t(미세) / mt: 최소 단계 / w: 가중치
const AFFIX_TABLE = [
  // 접두 — 이름 앞에 붙는다
  ['p_atk', '맹렬한', 'pre', 'atk', 2, 4, 'f', 'WHA', 12],
  ['p_atk2', '잔혹한', 'pre', 'atk', 4, 7, 'f', 'W', 6, 3],
  ['p_mag', '신비로운', 'pre', 'mag', 2, 4, 'f', 'WHA', 10],
  ['p_mag2', '대마법사의', 'pre', 'mag', 4, 7, 'f', 'WA', 5, 3],
  ['p_crit', '날카로운', 'pre', 'crit', 2, 4, 'p', 'WA', 10],
  ['p_critdmg', '치명적인', 'pre', 'critDmg', 6, 12, 'p', 'WA', 8],
  ['p_ls', '흡혈귀의', 'pre', 'lifesteal', 0.5, 1, 't', 'WBA', 5, 2],
  ['p_fire', '불타는', 'pre', 'fire', 5, 10, 'p', 'WA', 6],
  ['p_ice', '얼어붙은', 'pre', 'ice', 5, 10, 'p', 'WA', 6],
  ['p_holy', '신성한', 'pre', 'holy', 5, 10, 'p', 'WA', 6],
  ['p_dark', '저주받은', 'pre', 'dark', 5, 10, 'p', 'WA', 6],
  ['p_thunder', '뇌명의', 'pre', 'thunder', 5, 10, 'p', 'WA', 6],
  ['p_aspd', '재빠른', 'pre', 'atkSpd', 3, 6, 'p', 'WCA', 8],
  ['p_def', '견고한', 'pre', 'def', 2, 4, 'f', 'HBC', 12],
  ['p_res', '축성된', 'pre', 'res', 2, 4, 'f', 'HBCA', 10],
  ['p_hp', '강건한', 'pre', 'hp', 10, 20, 'f', 'HBCA', 12],
  ['p_mp', '명상하는', 'pre', 'mp', 8, 15, 'f', 'HCA', 8],
  ['p_reach', '기다란', 'pre', 'reach', 4, 8, 'p', 'W', 6],
  ['p_skill', '주술사의', 'pre', 'skillDmg', 4, 8, 'p', 'WHA', 7],
  ['p_sub', '투척가의', 'pre', 'subDmg', 6, 12, 'p', 'WCA', 7],
  ['p_agi', '날렵한', 'pre', 'agi', 2, 4, 'f', 'WHBCA', 9],
  ['p_luck', '행운의', 'pre', 'luck', 2, 5, 'f', 'HCA', 7],
  // 접미 — 이름 뒤 칭호로 붙는다
  ['s_guard', '수호의 가호', 'suf', 'def', 2, 4, 'f', 'HBCA', 10],
  ['s_saint', '성자의 가호', 'suf', 'resDark', 6, 12, 'p', 'HBCA', 8],
  ['s_fire', '화염의 가호', 'suf', 'resFire', 6, 12, 'p', 'HBCA', 7],
  ['s_ice', '서리의 가호', 'suf', 'resIce', 6, 12, 'p', 'HBCA', 7],
  ['s_holy', '빛의 가호', 'suf', 'resHoly', 6, 12, 'p', 'HBCA', 6],
  ['s_thunder', '폭풍의 가호', 'suf', 'resThunder', 6, 12, 'p', 'HBCA', 7],
  ['s_res', '마녀의 가호', 'suf', 'res', 2, 4, 'f', 'HBCA', 8],
  ['s_hp', '거인의 기운', 'suf', 'hp', 12, 24, 'f', 'HBCA', 10],
  ['s_regen', '트롤의 재생력', 'suf', 'hpRegen', 0.3, 0.6, 't', 'HBCA', 7],
  ['s_mpregen', '현자의 명상', 'suf', 'mpRegen', 0.3, 0.6, 't', 'WHCA', 7],
  ['s_speed', '바람의 발걸음', 'suf', 'moveSpd', 3, 6, 'p', 'CA', 7],
  ['s_jump', '도약의 날개', 'suf', 'jumpPow', 4, 8, 'p', 'CA', 5],
  ['s_gold', '탐욕의 손길', 'suf', 'goldBonus', 5, 12, 'p', 'HA', 7],
  ['s_drop', '보물 사냥꾼의 눈', 'suf', 'dropBonus', 5, 10, 'p', 'HA', 5],
  ['s_exp', '학자의 지혜', 'suf', 'expBonus', 4, 8, 'p', 'HA', 6],
  ['s_cdr', '시간의 흐름', 'suf', 'cdr', 2, 5, 'p', 'WHA', 5],
  ['s_ult', '분노의 불씨', 'suf', 'ultGain', 5, 10, 'p', 'WA', 6],
  ['s_heart', '순례자의 신심', 'suf', 'heartBonus', 10, 20, 'p', 'BCA', 6],
  ['s_reduce', '불굴의 의지', 'suf', 'dmgReduce', 1, 2, 't', 'BC', 5, 2],
  ['s_crit', '매의 눈', 'suf', 'crit', 2, 4, 'p', 'HA', 7],
  ['s_agi', '늑대의 민첩', 'suf', 'agi', 2, 4, 'f', 'HBCA', 7],
  ['s_luck', '까마귀의 행운', 'suf', 'luck', 2, 5, 'f', 'HCA', 6],
  ['s_ls', '밤의 갈증', 'suf', 'lifesteal', 0.5, 1, 't', 'WA', 4, 3],
  ['s_critdmg', '처형인의 일격', 'suf', 'critDmg', 6, 12, 'p', 'W', 6, 2],
];
export const AFFIXES = AFFIX_TABLE.map(([id, name, pos, stat, min, max, sc, sl, w, mt]) => ({ id, name, pos, stat, min, max, sc, sl, w, mt: mt ?? 1 }));
export const AFFIX_MAP = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));
const SLOT_CODE = { weapon: 'W', head: 'H', body: 'B', cloak: 'C', acc: 'A' };
const SCALE = { f: 0.7, p: 0.3, t: 0.2 };

// ───────────────────────────── 조회 도우미 ─────────────────────────────
const baseOf = (x) => (typeof x === 'string' ? ITEMS[x] : x?.baseId ? ITEMS[x.baseId] : x?.id && ITEMS[x.id] === x ? x : null);
export function isEquipment(x) { const b = baseOf(x); return !!b && EQUIP_BASE_SLOTS.includes(b.slot); }
export function isStackable(x) { return !!baseOf(x)?.stack; }
export function itemColor(inst) { return RARITIES[clampR(inst?.rarity)]?.color ?? RARITIES[0].color; }
export function tierForLevel(lv = 1) { let t = 1; for (let i = 0; i < 6; i++) if (lv >= TIER_LV[i]) t = i + 1; return t; }
/** 단계(1~6)에 해당하는 일반 베이스 id. 무기·방어구는 단계당 2종(variant 0=표준, 1=상위형) — 번호 = 단계×2-1+variant */
export function baseIdFor(slot, tier, { wtype = null, variant = 1 } = {}) {
  const t = Math.max(1, Math.min(6, tier | 0)), n = t * 2 - 1 + (variant ? 1 : 0);
  if (slot === 'weapon') return `w_${wtype || 'whip'}_${n}`;
  if (slot === 'body') return `a_body_${n}`;
  if (slot === 'head' || slot === 'cloak') return `a_${slot}_${n}`;
  if (slot === 'acc') return `a_${variant ? 'amulet' : 'ring'}_${n}`;
  return null;
}
function clampR(r) { r = r | 0; return r < 0 ? 0 : r > 5 ? 5 : r; }

// 슬롯별 일반 베이스 풀 (고유 제외)
const POOL = {};
for (const b of Object.values(ITEMS)) {
  if (!EQUIP_BASE_SLOTS.includes(b.slot) || b.unique) continue;
  (POOL[b.slot] ??= []).push(b);
}

// ───────────────────────────── 생성 ─────────────────────────────
let _order = 0;
export function makeItem(baseId, { rarity, level = 0, affixes, qty = 1 } = {}) {
  const b = ITEMS[baseId];
  if (!b) return null;
  const eq = EQUIP_BASE_SLOTS.includes(b.slot);
  let r = eq ? clampR(rarity ?? b.rarity ?? 0) : 0;
  if (b.unique) r = Math.max(r, b.rarity ?? 4);
  const inst = { uid: uid('i'), baseId, slot: b.slot, icon: b.icon, rarity: r, level: eq ? Math.max(0, Math.min(15, level | 0)) : 0, affixes: [], qty: 1 };
  if (eq && !b.unique) inst.affixes = affixes ? affixes.map((a) => ({ ...a })) : rollAffixes(b, r);
  if (b.stack) inst.qty = Math.max(1, Math.min(b.stack, qty | 0 || 1));
  inst.t = Date.now() * 1000 + (++_order % 1000);
  return inst;
}

/** 옵션 추첨: 희귀도별 개수, 스탯 중복 없음, 접두·접미 각 최대 3개 */
export function rollAffixes(base, rarity = 0, rnd = Math.random) {
  const n = RARITIES[clampR(rarity)].affixes;
  if (!n || !base || !EQUIP_BASE_SLOTS.includes(base.slot)) return [];
  const code = SLOT_CODE[base.slot], tier = base.tier ?? 1;
  const out = [], usedStat = new Set(), cnt = { pre: 0, suf: 0 };
  if (base.element) usedStat.add(base.element); // 기본 속성과 같은 속성 접두는 피한다
  for (let k = 0; k < n; k++) {
    let total = 0;
    const cand = [];
    for (const a of AFFIXES) {
      if (!a.sl.includes(code) || tier < a.mt || usedStat.has(a.stat) || cnt[a.pos] >= 3) continue;
      cand.push(a); total += a.w;
    }
    if (!cand.length) break;
    let x = rnd() * total, pickA = cand[cand.length - 1];
    for (const a of cand) { x -= a.w; if (x <= 0) { pickA = a; break; } }
    usedStat.add(pickA.stat); cnt[pickA.pos]++;
    out.push({ id: pickA.id, stat: pickA.stat, value: affixValue(pickA, tier, rarity, rnd()) });
  }
  // 접두를 앞에 (이름 표기용)
  out.sort((a, b) => (AFFIX_MAP[a.id].pos === 'pre' ? 0 : 1) - (AFFIX_MAP[b.id].pos === 'pre' ? 0 : 1));
  return out;
}
export function affixValue(a, tier, rarity, q = Math.random()) {
  const v = (a.min + (a.max - a.min) * q) * (1 + (tier - 1) * SCALE[a.sc]) * RARITIES[clampR(rarity)].fx;
  return a.sc === 't' ? Math.max(0.1, Math.round(v * 10) / 10) : Math.max(1, Math.round(v));
}

/** 희귀도 추첨: 행운·난이도(drop)·레벨이 높을수록 상위 희귀도 확률 상승 */
export function rollRarity(level = 1, { luck = 0, diff = null, minRarity = 0, maxRarity = 5, boost = 0 } = {}) {
  const f = (1 + Math.max(0, luck) / 120 + boost) * (diff?.drop ?? 1) * (1 + Math.min(level, 60) / 80);
  let total = 0;
  const w = [];
  for (let r = 0; r <= 5; r++) {
    const v = r < minRarity || r > maxRarity ? 0 : RAR_W[r] * (r ? Math.pow(f, r * 0.8) : 1);
    w.push(v); total += v;
  }
  if (total <= 0) return clampR(minRarity);
  let x = Math.random() * total;
  for (let r = 0; r <= 5; r++) { x -= w[r]; if (x <= 0 && w[r] > 0) return r; }
  return clampR(Math.min(maxRarity, 5));
}

const SLOT_W = [['weapon', 30], ['head', 16], ['body', 16], ['cloak', 14], ['acc', 24]];
/** 무작위 장비 생성 (레벨 ≈ 단계) */
export function rollItem(level = 1, { luck = 0, diff = null, slot = null, wtype = null, minRarity = 0, maxRarity = 5, tier = null, rarity = null, boost = 0 } = {}) {
  if (!slot) {
    if (wtype) slot = 'weapon';
    else { let x = Math.random() * 100; for (const [s, w] of SLOT_W) { x -= w; if (x <= 0) { slot = s; break; } } slot ??= 'acc'; }
  }
  let t = tier ?? tierForLevel(level);
  if (tier == null) { const q = Math.random(); if (q < 0.2) t--; else if (q > 0.86) t++; }
  t = Math.max(1, Math.min(6, t));
  let pool = (POOL[slot] || []).filter((b) => !wtype || b.wtype === wtype);
  if (!pool.length) pool = POOL.weapon;
  let cand = [];
  for (let d = 0; d < 6 && !cand.length; d++) cand = pool.filter((b) => Math.abs(b.tier - t) === d);
  const base = cand[Math.floor(Math.random() * cand.length)];
  const r = rarity ?? rollRarity(level, { luck, diff, minRarity, maxRarity, boost });
  return makeItem(base.id, { rarity: r });
}

// ───────────────────────────── 능력치 ─────────────────────────────
const W_PRIM = new Set(['atk', 'mag']);
const A_PRIM = new Set(['def', 'res']);
/** 강화 배율 정보 (UI 미리보기용) */
export function enhanceScale(slot, L) {
  const kind = slot === 'weapon' ? 'w' : slot === 'acc' ? 'c' : 'a';
  const rate = kind === 'w' ? 0.07 : kind === 'a' ? 0.06 : 0.05;
  let prim = 1 + rate * L;
  if (L >= 10) prim *= 1.08;
  if (L >= 15) prim *= 1.12;
  return { kind, prim, sec: 1 + rate * 0.5 * L };
}
/** 장신구 강화 고정 보너스를 받을 대표 능력치: 정수 능력치 중 가장 큰 것 (HP/MP 는 1/5 로 환산해 비교) */
function accMainStat(stats) {
  let main = null, best = -Infinity;
  for (const k in stats) {
    if (!INT_STATS.has(k) || k === 'airJumps' || k === 'magnet') continue;
    const v = stats[k] / (k === 'hp' || k === 'mp' ? 5 : 1);
    if (v > best) { best = v; main = k; }
  }
  return main;
}
function roundStat(k, v) { return INT_STATS.has(k) ? Math.round(v) : Math.round(v * 10) / 10; }

/**
 * 인스턴스 최종 능력치 = 기본 × 희귀도 × 강화(무기 공/마 +7%/단계, 방어구 방/저 +6%/단계, 그 외 절반)
 *  + 강화 고정 보너스 + +10/+15 달성 보너스 + 추가 옵션
 */
export function itemStats(inst, { noAffix = false } = {}) {
  const out = {};
  const b = inst && ITEMS[inst.baseId];
  if (!b?.stats || !EQUIP_BASE_SLOTS.includes(b.slot)) return out;
  const L = Math.max(0, Math.min(15, inst.level | 0));
  const rm = b.unique ? 1 : RARITIES[clampR(inst.rarity)].mult;
  const { kind, prim, sec } = enhanceScale(b.slot, L);
  const P = kind === 'w' ? W_PRIM : kind === 'a' ? A_PRIM : INT_STATS;
  for (const k in b.stats) {
    const isP = P.has(k);
    // 확률형 보조 능력치(치명타 등)는 희귀도 배율을 절반만 받는다
    const r = isP || INT_STATS.has(k) ? rm : 1 + (rm - 1) * 0.5;
    out[k] = b.stats[k] * r * (isP ? prim : sec);
  }
  if (L > 0) {
    const t = b.tier ?? 1;
    if (kind === 'w') {
      const main = (b.stats.mag ?? 0) > (b.stats.atk ?? 0) ? 'mag' : 'atk';
      out[main] = (out[main] ?? 0) + L * (0.6 + 0.5 * t);
      if (L >= 10) out.crit = (out.crit ?? 0) + 3;
      if (L >= 15) out.critDmg = (out.critDmg ?? 0) + 20;
    } else if (kind === 'a') {
      if (b.stats.def) out.def += L * (0.3 + 0.3 * t);
      if (b.stats.res) out.res += L * (0.25 + 0.25 * t);
      if (L >= 10) out.hp = (out.hp ?? 0) + 10 * t;
      if (L >= 15) out.dmgReduce = (out.dmgReduce ?? 0) + 3;
    } else {
      // 장신구: 대표 정수 능력치에 단계마다 고정치 (단계마다 눈에 보이는 변화가 있도록 최소 +1, HP/MP 는 5배)
      const main = accMainStat(b.stats);
      if (main) out[main] += L * Math.max(1, 0.4 * t) * (main === 'hp' || main === 'mp' ? 5 : 1);
      if (L >= 10) out.luck = (out.luck ?? 0) + 5;
      if (L >= 15) { out.crit = (out.crit ?? 0) + 3; out.critDmg = (out.critDmg ?? 0) + 10; }
    }
  }
  for (const k in out) out[k] = roundStat(k, out[k]);
  if (!noAffix) for (const a of inst.affixes || []) if (a && a.stat) out[a.stat] = roundStat(a.stat, (out[a.stat] ?? 0) + a.value);
  return out;
}

// ───────────────────────────── 이름 / 설명 ─────────────────────────────
// ───────────────────────────── 조사 ─────────────────────────────
// 숫자 끝소리: 영 일 이 삼 사 오 육 칠 팔 구 (받침 유무 / ㄹ받침)
const DIGIT_JONG = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0];
/** 마지막 글자의 종성 인덱스 (0 = 받침 없음, 8 = ㄹ, -1 = 판단 불가) */
function finalJong(word) {
  const s = String(word ?? '').replace(/[\s)\]}」』>"'.,!?…·~]+$/u, '');
  const c = s.charCodeAt(s.length - 1);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
  if (c >= 48 && c <= 57) return DIGIT_JONG[c - 48];
  if (/[lmnr]$/i.test(s)) return /[lr]$/i.test(s) ? 8 : 4;
  return s ? 0 : -1;
}
/**
 * 받침에 맞는 조사를 붙인다. pair 는 '받침 있을 때/없을 때' 순서: '이/가' '을/를' '은/는' '과/와' '으로/로' '이다/다'
 *  josa('하급 강화석', '이/가') → '하급 강화석이' / josa('성기사', '으로/로') → '성기사로' ('으로'는 ㄹ받침도 '로')
 */
export function josa(word, pair) {
  const [a, b] = String(pair).split('/');
  const j = finalJong(word);
  if (j < 0) return `${word}${a}(${b})`;
  const useB = j === 0 || (a === '으로' && j === 8);
  return `${word}${useB ? b : a}`;
}

export function itemName(inst, { full = false, noLevel = false } = {}) {
  const b = inst && ITEMS[inst.baseId];
  if (!b) return '???';
  let n = b.name;
  if (!b.unique && inst.affixes?.length) {
    const pre = inst.affixes.find((a) => AFFIX_MAP[a.id]?.pos === 'pre');
    if (pre) n = `${AFFIX_MAP[pre.id].name} ${n}`;
    if (full) { const suf = inst.affixes.find((a) => AFFIX_MAP[a.id]?.pos === 'suf'); if (suf) n += ` · ${AFFIX_MAP[suf.id].name}`; }
  }
  if (inst.level > 0 && !noLevel) n = `+${inst.level} ${n}`;
  return n;
}

function useText(u) {
  const p = [];
  if (u.heal >= 1 && u.mp >= 1) p.push('HP·MP 완전 회복');
  else {
    if (u.heal) p.push(u.heal >= 1 ? 'HP 완전 회복' : `HP ${Math.round(u.heal * 100)}% 회복`);
    if (u.mp) p.push(u.mp >= 1 ? 'MP 완전 회복' : `MP ${Math.round(u.mp * 100)}% 회복`);
  }
  if (u.cure) p.push('독·저주 해제');
  if (u.buff) p.push(`${{ holyaura: '성광의 오라', rage: '광폭화 (공격력 2배)', haste: '신속', invincible: '무적' }[u.buff.id] ?? u.buff.id} ${u.buff.time}초`);
  if (u.warp) p.push('마을로 귀환');
  return p.join(' · ');
}

/** 설명 줄 [{text, color}] — 상점/인벤토리 툴팁용 */
export function itemDescRich(inst) {
  const b = inst && ITEMS[inst.baseId];
  if (!b) return [{ text: '알 수 없는 아이템', color: '#9d8f80' }];
  const R = RARITIES[clampR(inst.rarity)];
  const L = [];
  const GRAY = '#9d8f80', GOLD = '#e8c872', WHITE = '#efe4cf', BLUE = '#8ac8ff', FLAV = '#b8a88a';
  if (isEquipment(b)) {
    const kind = b.slot === 'weapon' ? `무기 · ${WTYPE_NAMES[b.wtype] ?? ''}` : SLOT_LABELS[b.slot];
    L.push({ text: `${R.name}${b.unique ? ' 고유' : ''} ${kind}`, color: R.color });
    let line = `${TIER_ROMAN[b.tier] ?? b.tier}단계 · 요구 레벨 ${b.lvReq ?? 1}`;
    if (b.element) line += ` · ${ELEMENT_LABELS[b.element]} 속성`;
    L.push({ text: line, color: GRAY });
    const st = itemStats(inst, { noAffix: true });
    for (const k of STAT_ORDER) if (st[k]) L.push({ text: fmtStat(k, st[k]), color: WHITE });
    if (inst.level >= 10) L.push({ text: inst.level >= 15 ? '★ 극한 강화 +15 — 달성 보너스 적용' : '★ +10 강화 달성 보너스 적용', color: '#ffb040' });
    for (const a of inst.affixes || []) {
      const A = AFFIX_MAP[a.id];
      L.push({ text: `◆ ${A ? A.name + ' — ' : ''}${fmtStat(a.stat, a.value)}`, color: BLUE });
    }
    if (b.effect) L.push({ text: `고유 효과: ${b.effect}`, color: '#ffb040' });
  } else {
    L.push({ text: SLOT_LABELS[b.slot] ?? '', color: b.relic ? '#ff4a5a' : GOLD });
    if (b.use) L.push({ text: `사용 효과: ${useText(b.use)}`, color: '#7ee07e' });
    if (b.stone) L.push({ text: '강화 재료 — 대장장이 하드윈에게 가져가자', color: GRAY });
    else if (b.slot === 'material' && !b.id.startsWith('m_scroll')) L.push({ text: '의뢰·교환 재료 — 상점에 팔 수도 있다', color: GRAY });
    if (b.relic) L.push({ text: '드라큘라의 유물 — 다섯 개를 모두 모으면…', color: '#ff8a9a' });
    else if (b.slot === 'key') L.push({ text: '버리거나 팔 수 없다', color: GRAY });
  }
  if (b.desc) L.push({ text: b.desc, color: FLAV, flavor: true });
  return L;
}
/** 설명 줄 (문자열 배열) */
export function itemDesc(inst) { return itemDescRich(inst).map((l) => l.text); }

// ───────────────────────────── 가격 ─────────────────────────────
export function buyPrice(baseId, rarity = 0) {
  const b = ITEMS[baseId];
  if (!b) return 0;
  if (!EQUIP_BASE_SLOTS.includes(b.slot) || b.unique) return b.price ?? 0;
  return Math.round((b.price ?? 10) * RARITIES[clampR(rarity)].price / 5) * 5;
}
/** 1개당 판매가 */
export function sellPrice(inst) {
  const b = inst && ITEMS[inst.baseId];
  if (!b || b.slot === 'key') return 0;
  if (!EQUIP_BASE_SLOTS.includes(b.slot)) return Math.max(1, Math.floor((b.price ?? 10) * (b.slot === 'material' ? 0.5 : 0.35)));
  const L = inst.level | 0;
  return Math.max(1, Math.floor(buyPrice(b.id, inst.rarity) * (b.unique ? 0.2 : 0.25) * (1 + L * 0.2 + (L >= 10 ? 1 : 0))));
}
