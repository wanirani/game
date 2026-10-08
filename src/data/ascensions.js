// 초월 · 비전 — 3차 직업(초월 28) + 숨은 직업(비전 7) 표 (docs/specs/classes_t3.md §2.1 · §4 · §5)
// hero.classId 는 그대로 0~2차 CLASSES id 로 남고, hero.asc 가 이 표의 id 를 가리킨다 (§0.1). CLASSES·서버 CLASS_INFO 는 그대로.
// A[id] = {
//   id, charId, kind: 't3' | 'hidden',
//   parent: '<2차 id>' | null,             // t3 만
//   parents: ['<2차 id>', ...],            // t3: [parent] · hidden: 그 영웅의 2차 4개 (불러올 때 CLASSES 에서 채움)
//   name, eng, desc, perk,                 // 한국어 문구 (명세 그대로 — PERKS-A..D 가 N 표에 맞춰 숫자만 손본다)
//   reqLevel: 70 | 75, trial: 'tr_<hero>_1' | 'tr_<hero>_2',
//   mult: {stat: k}, flat: {stat: n},      // §2.8 예산 (tools/test_ascension.mjs)
//   look: { armorColor?, cape? },          // 장비 전 (직업 계보 look 뒤에 덮음)
//   lookTop: { aura?, wings?, halo?, trailColor?, armorTrim?, capeColor2?, scarf?, tint?, wingCol? },   // 장비 뒤 (stats.js applyLookTop)
//   ult: { accent, colors: [c0, c1, c2] },
//   awaken: { label, desc, ...2차 T2 위에 덮는 수치 },   // t3 만 (비전은 T3_BOOST(T2[현재 2차]))
//   skill: 'asc_<hero>_<word>',            // hidden 만 (data/skills_asc.js)
//   arcade: { lv: 80 | 85 },               // 아케이드 직업 고르기 프리셋 레벨 (§10.3)
//   est: { dps, ehp },                     // 설계 추정 (balance.mjs --asc)
// }
// 순수 데이터 + 순수 도우미 — classes.js 만 import 한다 (state.js · stats.js · progression.js · UI 가 함께 쓴다)
import { CLASSES, classChain } from './classes.js';

export const TIER_NAMES = ['기본 직업', '상급 직업', '최상급 직업', '초월'];
export const KIND_LABEL = Object.freeze({ t3: '초월', hidden: '비전' });
export const ASC_REQ = Object.freeze({ t3Level: 70, hiddenLevel: 75, firstSp: 3 });
/** look(장비 전)·lookTop(장비 뒤) 에 쓸 수 있는 키 (stats.js 가 이 키만 옮긴다) */
export const LOOK_KEYS = Object.freeze(['armorColor', 'cape']);
export const TOP_KEYS = Object.freeze(['aura', 'wings', 'halo', 'trailColor', 'armorTrim', 'capeColor2', 'scarf', 'tint', 'wingCol']);

const A = {};
const au = (type, color) => ({ type, color });
function t3(id, parent, o) {
  const P = CLASSES[parent];
  const charId = P.charId;
  A[id] = { id, charId, kind: 't3', parent, parents: [parent], reqLevel: ASC_REQ.t3Level, trial: `tr_${charId}_1`, look: {}, arcade: { lv: 80 }, ...o };
}
function hidden(id, charId, o) {
  A[id] = { id, charId, kind: 'hidden', parent: null, parents: [], reqLevel: ASC_REQ.hiddenLevel, trial: `tr_${charId}_2`, look: {}, arcade: { lv: 85 }, ...o };
}

// ───────────────────────── 카엘 (채찍) ─────────────────────────
t3('kael_grandtemplar', 'kael_templar', { name: '성전 기사단장', eng: 'GRAND TEMPLAR',
  desc: '성전 기사단을 이끄는 방패. 받은 상처를 빛으로 되갚는다.',
  perk: '받는 피해 -5%. 적에게 받은 피해만큼 성광이 쌓인다(최대 HP의 30%까지). 성광이 최대 HP의 5% 이상이면 마무리 공격 때 모두 터뜨려 채찍 끝 반경 150을 타격한다(위력 80~250%, 쌓인 양에 비례, 1.5초에 한 번).',
  mult: { hp: 1.10, def: 1.08 }, flat: { dmgReduce: 5, holy: 15 },
  look: { armorColor: '#eef0f8', cape: { color: '#f4f0e4', color2: '#c8102a', len: 1.25 } },
  lookTop: { aura: au('holy', '#ffe080'), halo: true, armorTrim: '#ffd84a', capeColor2: '#c8102a', trailColor: '#fff0a0' },
  ult: { accent: '#ffe080', colors: ['#ffd84a', '#fff8e0', '#c8102a'] },
  awaken: { label: '성전 기사단의 방패', desc: '방패 인장이 새겨지고 체력을 15% 회복한다.', heal: 0.15 },
  est: { dps: 1.05, ehp: 1.18 } });
t3('kael_highinquisitor', 'kael_inquisitor', { name: '화형 심판장', eng: 'HIGH INQUISITOR',
  desc: '이단의 이름을 불길로 새기는 심판장.',
  perk: '채찍 끝 성화 폭발에 맞은 적에게 낙인(최대 3중첩, 4초). 3중첩이 되면 1.5초 동안 화형 — 0.25초마다 위력 30% 화염 피해 6회. 같은 적은 5초(보스 8초)에 한 번.',
  mult: { atk: 1.10, hp: 1.06 }, flat: { fire: 15, holy: 10 },
  look: { armorColor: '#2a1a1c' },
  lookTop: { aura: au('fire', '#ff5a1a'), halo: true, armorTrim: '#e8a040', capeColor2: '#ff3a10', trailColor: '#ff7a2a' },
  ult: { accent: '#ff5a1a', colors: ['#ff5a1a', '#c01020', '#ffe070'] },
  awaken: { label: '화형대의 심판', desc: '빛의 우리가 불타올라 4초 동안 화염 피해를 준다.', dot: { element: 'fire', t: 4, mv: 0.2 } },
  est: { dps: 1.07, ehp: 1.06 } });
t3('kael_bloodreaver', 'kael_bloodhunter', { name: '피의 처단자', eng: 'BLOOD REAVER',
  desc: '제 피를 값으로 치르고 더 깊이 베는 금기의 사냥꾼.',
  perk: '흡혈 +2%. HP가 최대 HP의 15%보다 많으면 마무리 공격 때 현재 HP의 4%를 바쳐 핏빛 초승달을 날린다(위력 120%, 3관통, 0.8초에 한 번). 초승달이 적을 맞힐 때마다 최대 HP의 1.5%를 회복한다(초승달 하나당 최대 3회).',
  mult: { atk: 1.10, hp: 1.08 }, flat: { critDmg: 20, lifesteal: 2 },
  lookTop: { aura: au('blood', '#ff0a2a'), wings: 'bat', trailColor: '#ff2040', armorTrim: '#8a0a1a' },
  ult: { accent: '#ff0a2a', colors: ['#ff0a2a', '#ffd0d8', '#5a0010'] },
  awaken: { label: '피의 처단', desc: '채찍이 핏빛으로 물들고 입힌 피해의 7%를 흡혈한다.', lifesteal: 0.07 },
  est: { dps: 1.08, ehp: 1.05 } });
t3('kael_blackwing', 'kael_nightraven', { name: '흑익의 사냥꾼', eng: 'BLACKWING',
  desc: '까마귀 날개로 하늘에 머무는 공중전의 사냥꾼.',
  perk: '공중에서 적을 맞히면 낙하가 멈춘다. 한 번 뜬 동안 공중 적중 4회마다 공중 점프 1회를 돌려받는다(최대 2회). 공중 적중 6회 이상 뒤 착지하면 깃털 8개가 쏟아진다(각 위력 40%, 암흑, 2.5초에 한 번).',
  mult: { agi: 1.08, atk: 1.08 }, flat: { critDmg: 25, moveSpd: 5 },
  lookTop: { aura: au('dark', '#9a8aff'), wings: 'crow', scarf: { color: '#2a1a4a', long: true }, trailColor: '#b0b0ff', armorTrim: '#6a6aff' },
  ult: { accent: '#9a8aff', colors: ['#9a8aff', '#0e0c14', '#e0e0ff'] },
  awaken: { label: '흑익의 폭풍', desc: '채찍이 지나간 길을 따라 까마귀 떼가 날아든다.' },
  est: { dps: 1.07, ehp: 1.03 } });

// ───────────────────────── 세라 (지팡이) ─────────────────────────
t3('sera_archsaint', 'sera_saint', { name: '대성녀', eng: 'ARCH SAINT',
  desc: '기적을 땅에 새기는 살아 있는 성인.',
  perk: '액티브 스킬을 쓰면 발밑에 4초 동안 성역(반경 140)이 생긴다(12초에 한 번). 성역 안에서는 0.5초마다 최대 HP의 1.5%를 회복하고, 성역 안의 적은 0.5초마다 위력 20% 신성 피해를 받는다. 성녀의 기적이 HP 50%로 되살리고 성광 폭발(반경 200, 위력 200%)을 일으킨다.',
  mult: { mag: 1.08, hp: 1.08, res: 1.05 }, flat: { holy: 15, hpRegen: 2 },
  lookTop: { wings: 'seraph', halo: true, aura: au('holy', '#ffe9a0'), armorTrim: '#ffd84a', capeColor2: '#ffd84a', trailColor: '#fff2b0' },
  ult: { accent: '#ffe9a0', colors: ['#fff8d0', '#ffd84a', '#ffffff'] },
  awaken: { label: '대성녀의 후광', desc: '후광이 빛나며 체력을 30% 회복한다.', heal: 0.3 },
  est: { dps: 1.04, ehp: 1.30 } });
t3('sera_prophetess', 'sera_oracle', { name: '대예언자', eng: 'PROPHETESS',
  desc: '한 박자 앞의 미래를 읽고 피해 가는 예언자.',
  perk: '10초마다 예지 1회가 준비된다. 예지가 준비되었을 때 적에게 맞으면 피해를 받지 않고, 반경 220 안의 적이 2초 동안 절반 속도가 되며(보스는 25% 감속), 모든 스킬의 재사용 대기가 1.5초 줄어든다.',
  mult: { mag: 1.08, mp: 1.10 }, flat: { cdr: 5, mpRegen: 1 },
  lookTop: { aura: au('ice', '#a8e0ff'), halo: true, scarf: { color: '#e8c872', long: true }, armorTrim: '#e8c872', trailColor: '#c8ecff' },
  ult: { accent: '#a8e0ff', colors: ['#a8e0ff', '#e8c872', '#e8fbff'] },
  awaken: { label: '정지한 시간', desc: '각성이 끝난 뒤 4초 동안 적이 40% 속도로 움직인다.', slow: { mul: 0.4, t: 4 } },
  est: { dps: 1.04, ehp: 1.15 } });
t3('sera_archsage', 'sera_archmage', { name: '대현자', eng: 'ARCHSAGE',
  desc: '세 원소를 하나로 엮어 내는 금서의 현자.',
  perk: '액티브 스킬을 쓸 때마다 원소 인장 1개(최대 3). 인장이 3개면 다음 기본 공격이 삼원 융합탄이 된다 — 맞거나 사라질 때 반경 110 폭발(위력 260%, 화염·냉기·번개 중 그 적이 약한 속성, 없으면 화염)을 일으키고 MP 15를 돌려준다.',
  mult: { mag: 1.10, mp: 1.08 }, flat: { fire: 10, ice: 10, thunder: 10 },
  lookTop: { aura: au('fire', '#ffb05a'), halo: true, armorTrim: '#ffd84a', trailColor: '#ffd0a0' },
  ult: { accent: '#ffb05a', colors: ['#ff7a2a', '#9fe8ff', '#fff2a0'] },
  awaken: { label: '삼원소의 대기둥', desc: '심판의 기둥이 화염·냉기·번개로 번갈아 내리친다.' },
  est: { dps: 1.08, ehp: 1.00 } });
t3('sera_tempest', 'sera_stormcaller', { name: '뇌우의 무녀', eng: 'TEMPEST',
  desc: '적과 적 사이에 번개의 길을 놓는 폭풍의 무녀.',
  perk: '공격에 맞은 적에게 정전기(최대 5중첩, 4초). 정전기가 있는 적이 번개 피해를 받으면 반경 300 안의 정전기 붙은 다른 적 최대 3명에게 번개가 튄다(각 위력 60%, 0.2초 경직, 튄 적의 정전기 1 소모, 0.35초에 한 번).',
  mult: { mag: 1.08, agi: 1.08 }, flat: { thunder: 15, moveSpd: 5 },
  lookTop: { aura: au('thunder', '#e0f0ff'), scarf: { color: '#bfe0ff', long: true }, armorTrim: '#bfe0ff', trailColor: '#e0f4ff' },
  ult: { accent: '#e0f0ff', colors: ['#e0f0ff', '#ffffff', '#6a9aff'] },
  awaken: { label: '뇌우의 기둥', desc: '번개 기둥이 내리치고 번개가 적과 적 사이를 잇는다.' },
  est: { dps: 1.10, ehp: 1.00 } });   // 1.10 무리 · 1.00 단일

// ───────────────────────── 빅터 (총) ─────────────────────────
t3('victor_specter', 'victor_phantom', { name: '망령 저격수', eng: 'SPECTER',
  desc: '총구의 그림자에서 다음 표적을 찾아내는 유령.',
  perk: '대시 후 1.2초 동안 탄환이 적을 맞히면 반경 400 안의 다른 적에게 유령탄이 튄다(맞힌 탄의 위력 50%, 대시 한 번에 최대 6발). 그 1.2초 안에 적을 처치하면 대시 재사용 대기가 즉시 끝난다.',
  mult: { atk: 1.08, agi: 1.08 }, flat: { critDmg: 20, reach: 5 },
  lookTop: { aura: au('ice', '#c0d0ff'), scarf: { color: '#4a4a6a', long: true }, armorTrim: '#9ab0ff', trailColor: '#9ab0ff' },
  ult: { accent: '#c0d0ff', colors: ['#9ab0ff', '#e8f0ff', '#4a5aff'] },
  awaken: { label: '망령탄', desc: '은탄이 모든 것을 꿰뚫으며 푸른 궤적을 남긴다.' },
  est: { dps: 1.08, ehp: 1.02 } });
t3('victor_headsman', 'victor_executioner', { name: '사형 집행자', eng: 'HEADSMAN',
  desc: '선고를 내리고, 집행하는 자.',
  perk: '체력이 40% 미만이 된 적에게 6초 동안 사형 선고. 선고받은 일반 적은 체력이 15% 미만이면 다음 타격에 즉시 처형되고, 처형할 때마다 MP 10과 필살 게이지 4를 얻는다. 보스는 선고 중 다음 한 번의 타격 피해 +25%(6초에 한 번).',
  mult: { atk: 1.10, hp: 1.06 }, flat: { critDmg: 15, lifesteal: 2 },
  lookTop: { aura: au('blood', '#c00010'), armorTrim: '#8a0a0a', trailColor: '#ff2030', capeColor2: '#3a0004' },
  ult: { accent: '#ff2030', colors: ['#ff2030', '#ffe0e0', '#1a0a0a'] },
  awaken: { label: '집행', desc: '표식이 새겨진 일반 적 중 체력이 30% 미만인 적을 즉시 처형한다.', execute: 0.30 },
  est: { dps: 1.06, ehp: 1.04 } });   // 1.06 일반 적 · 1.03 보스
t3('victor_purgatory', 'victor_hellfire', { name: '연옥의 총잡이', eng: 'PURGATORY',
  desc: '총열이 달아오를수록 지옥에 가까워지는 총잡이.',
  perk: '총을 쏠 때마다 열기 +10(한 번에 여러 발이면 한 발 더할 때마다 +4, 0.8초 쉬면 초당 25씩 식는다). 열기 100이면 3초 동안 과열 — 탄환 폭발의 반경 +20%, 위력 +15%. 과열이 끝나면 주변에 화염 고리(반경 140, 위력 80%)를 뿜고 2초 동안 열기가 오르지 않는다.',
  mult: { atk: 1.08, mag: 1.08 }, flat: { fire: 20 },
  lookTop: { aura: au('fire', '#ff4a10'), scarf: { color: '#ff5a1a' }, armorTrim: '#ff5a1a', trailColor: '#ffb040' },
  ult: { accent: '#ff4a10', colors: ['#ff7a2a', '#ffd070', '#ff3010'] },
  awaken: { label: '연옥의 탄환', desc: '표식이 화염과 함께 폭발한다.' },
  est: { dps: 1.08, ehp: 1.02 } });
t3('victor_gunking', 'victor_gunlord', { name: '총왕', eng: 'GUN KING',
  desc: '맞지 않는 한 총성은 멈추지 않는다.',
  perk: '맞지 않고 12번 쏘면 4초 동안 난사 — 쏠 때마다 좌우로 탄환 2발이 더 나간다(각 위력 50%, 10초에 한 번). 맞으면 연속 사격 수가 0이 된다.',
  mult: { atk: 1.08, agi: 1.06, hp: 1.04 }, flat: { critDmg: 15, luck: 10 },
  lookTop: { aura: au('holy', '#ffe070'), capeColor2: '#ffd84a', armorTrim: '#ffd84a', trailColor: '#ffe070' },
  ult: { accent: '#ffe070', colors: ['#ffd84a', '#fff0b0', '#c8a040'] },
  awaken: { label: '총왕의 난사', desc: '두 자루 권총으로 열여섯 발을 쏜다.', shots: 16 },
  est: { dps: 1.06, ehp: 1.04 } });

// ───────────────────────── 브란 (대검) ─────────────────────────
t3('bran_bastion', 'bran_guardian', { name: '성채 기사', eng: 'BASTION',
  desc: '발을 디딘 곳이 곧 성채가 되는 수호 기사.',
  perk: '땅을 디디고 0.6초 동안 제자리(40 이내)에 있으면 방진 — 받는 피해 -20%, 경직·넉백 없음, 나를 근접 공격한 적에게 위력 60% 신성 반격(0.5초에 한 번). 40보다 멀리 움직이거나 뜨면 풀린다.',
  mult: { hp: 1.10, def: 1.08 }, flat: { dmgReduce: 5, hpRegen: 2 },
  lookTop: { aura: au('holy', '#cfe0ff'), halo: true, armorTrim: '#ffd84a', capeColor2: '#ffd84a', trailColor: '#e8f0ff' },
  ult: { accent: '#cfe0ff', colors: ['#fff2b0', '#ffd84a', '#1a3a7a'] },
  awaken: { label: '불락의 성채', desc: '방패 결계가 펼쳐져 각성이 끝난 뒤 4초 동안 무적이 된다.', invuln: 4 },
  est: { dps: 1.03, ehp: 1.15 } });   // 방진 중 ehp 1.35
t3('bran_vanguard', 'bran_crusader', { name: '성전 선봉장', eng: 'HOLY VANGUARD',
  desc: '가장 먼저 적진에 뛰어드는 성전의 창끝.',
  perk: '대시가 방패 돌격이 된다 — 지나간 적에게 위력 80% 신성 피해와 넉백. 마무리 공격의 성광 충격파가 0.12초 간격으로 세 번 나간다(두 번째·세 번째는 위력 30%).',
  mult: { atk: 1.10, hp: 1.06 }, flat: { holy: 15, reach: 5 },
  lookTop: { aura: au('holy', '#ffd870'), armorTrim: '#c01020', capeColor2: '#ffd84a', trailColor: '#fff2b0' },
  ult: { accent: '#ffd870', colors: ['#fff2b0', '#c01020', '#ffd84a'] },
  awaken: { label: '성전의 대파도', desc: '신성한 십자 파동이 적을 휩쓴다.' },
  est: { dps: 1.09, ehp: 1.02 } });
t3('bran_conqueror', 'bran_warlord', { name: '정복왕', eng: 'CONQUEROR',
  desc: '전장을 삼킨 군주. 맞아도 기세가 꺾이지 않는다.',
  perk: '콤보 30 이상일 때 적중마다 10% 확률로 전쟁의 포효 — 반경 160 화염 충격파(위력 60%, 0.4초 경직, 1.2초에 한 번). 최대 HP의 15% 미만인 피격은 콤보를 끊지 않고 25%만 깎는다.',
  mult: { atk: 1.08, hp: 1.08 }, flat: { critDmg: 20 },
  lookTop: { aura: au('fire', '#ff3010'), armorTrim: '#c8a040', capeColor2: '#ff3010', trailColor: '#ff7a3a' },
  ult: { accent: '#ff3010', colors: ['#ff5020', '#5a0a0a', '#ffd0a0'] },
  awaken: { label: '정복의 군기', desc: '불타는 군기가 펄럭이고 콤보 10마다 피해가 3%씩 오른다.', comboDmg: 0.03 },
  est: { dps: 1.08, ehp: 1.03 } });
t3('bran_bloodtyrant', 'bran_bloodrage', { name: '혈귀 폭군', eng: 'BLOOD TYRANT',
  desc: '제 피를 불쏘시개로 삼는 혈귀의 폭군.',
  perk: 'HP가 50%보다 많으면 공격할 때마다 현재 HP의 1%를 태워 피의 분노 1중첩(최대 10, 중첩당 주는 피해 +1%, 2초 동안 공격하지 않으면 0.5초마다 1씩 줄어든다). 스테이지마다 한 번, 치명상을 입으면 HP 1로 버티고 1초 동안 무적이 된다.',
  mult: { atk: 1.08, agi: 1.06, hp: 1.05 }, flat: { lifesteal: 2 },
  lookTop: { aura: au('blood', '#ff0018'), wings: 'demon', armorTrim: '#ff1a2a', trailColor: '#ff1a2a' },
  ult: { accent: '#ff0018', colors: ['#ff1a2a', '#5a0010', '#ffb0b8'] },
  awaken: { label: '폭군의 격노', desc: '피의 분노로 입힌 피해의 15%를 흡혈한다.', lifesteal: 0.15 },
  est: { dps: 1.12, ehp: 1.05 } });   // dps 1.12 = HP 50% 위 (위험 손잡이 perStack)

// ───────────────────────── 리아 (단검) ─────────────────────────
t3('lia_umbra', 'lia_shadowmaster', { name: '그림자 화신', eng: 'UMBRA',
  desc: '어둠 그 자체가 된 인술의 끝.',
  perk: '대시하면 출발 지점에 2.5초 동안 그림자 분신이 남는다(최대 2). 분신은 반경 300 안의 가장 가까운 적 쪽을 보고 내 공격을 따라 휘두른다(위력 25%, 암흑).',
  mult: { agi: 1.06, atk: 1.10 }, flat: { critDmg: 20, dark: 15 },
  lookTop: { aura: au('dark', '#7a3aff'), scarf: { color: '#2a0a4a', long: true }, armorTrim: '#4a2a8a', trailColor: '#b060ff' },
  ult: { accent: '#7a3aff', colors: ['#b060ff', '#4a2a8a', '#e0c8ff'] },
  awaken: { label: '그림자 군세', desc: '그림자 분신이 모든 순간이동을 따라 벤다.' },
  est: { dps: 1.10, ehp: 1.00 } });
t3('lia_mirage', 'lia_kunoichi', { name: '신기루', eng: 'MIRAGE',
  desc: '맞았다고 믿은 순간, 이미 등 뒤에 있다.',
  perk: '환영 회피에 성공하면 0.3초 뒤 그 자리의 잔상이 폭발한다(반경 120, 위력 150%, 화염). 회피 뒤 2초 안의 다음 공격은 반경 300 안의 가장 가까운 적의 등 뒤로 순간이동해서 벤다.',
  mult: { atk: 1.08, agi: 1.06, hp: 1.04 }, flat: { fire: 15, critDmg: 15 },
  lookTop: { aura: au('fire', '#ff9ab0'), scarf: { color: '#ffb0c0', long: true }, armorTrim: '#ff4a6a', trailColor: '#ffb0c0' },
  ult: { accent: '#ff9ab0', colors: ['#ff4a6a', '#ffb0c0', '#8a0a20'] },
  awaken: { label: '신기루 꽃보라', desc: '진홍빛 꽃잎이 폭풍처럼 흩날린다.' },
  est: { dps: 1.05, ehp: 1.05 } });
t3('lia_bladequeen', 'lia_bladedancer', { name: '칼춤의 여왕', eng: 'BLADE QUEEN',
  desc: '쌓이는 칼날로 원무의 무대를 넓혀 가는 여왕.',
  perk: '연속 공격 4타째마다(칼날 회오리와 함께) 몸 주위를 도는 칼날 2자루가 4초 동안 남는다(최대 8자루, 새로 생기면 모두 4초로 갱신, 각 위력 25%, 같은 적은 0.4초마다 다시 벤다). 피격되면 도는 칼날이 모두 바깥으로 날아간다(각 위력 60%).',
  mult: { atk: 1.08, agi: 1.06, hp: 1.05 }, flat: { critDmg: 15 },
  lookTop: { aura: au('holy', '#ffe070'), scarf: { color: '#ffe070', long: true }, halo: true, armorTrim: '#ffd84a', trailColor: '#fff0a0' },
  ult: { accent: '#ffe070', colors: ['#ffd84a', '#fff8e0', '#5a0a2a'] },
  awaken: { label: '여왕의 칼날 소용돌이', desc: '황금 칼날이 소용돌이친다.' },
  est: { dps: 1.10, ehp: 1.03 } });
t3('lia_soulreaper', 'lia_reaper', { name: '영혼 수확자', eng: 'SOUL REAPER',
  desc: '거둔 영혼을 낫에 담아 한 번에 풀어놓는 사신.',
  perk: '적을 처치하면 영혼 1개(정예 3개, 보스는 내가 최대 HP의 10%를 깎을 때마다 1개, 최대 10개). 영혼 하나마다 주는 피해 +1%. 10개가 모이면 다음 마무리 공격이 망자의 낫 — 반경 220을 휩쓴다(위력 300%, 암흑).',
  mult: { atk: 1.08, hp: 1.08 }, flat: { dark: 15, lifesteal: 1 },
  lookTop: { aura: au('dark', '#4affa0'), wings: 'bone', armorTrim: '#3a8a5a', trailColor: '#6affb0' },
  ult: { accent: '#4affa0', colors: ['#6affb0', '#e8fff4', '#0a0a0a'] },
  awaken: { label: '명계의 낫', desc: '마지막에 영혼의 낫이 휩쓸고, 처치할 때마다 체력을 4% 회복한다.', healPerKill: 0.04 },
  est: { dps: 1.08, ehp: 1.00 } });

// ───────────────────────── 아젤 (장검·안개 대시) ─────────────────────────
t3('azel_nightlord', 'azel_nosferatu', { name: '밤의 군주', eng: 'NIGHT LORD',
  desc: '안개가 지나간 자리마다 피를 거두는 밤의 귀족.',
  perk: '안개 대시가 지나간 자리에 2초 동안 피안개(반경 90)가 남는다(최대 3개). 피안개 속 적은 0.4초마다 위력 10% 암흑 피해를 받고, 그때마다 맞은 적 하나당 최대 HP의 0.3%를 회복한다(초당 최대 2%). 공중에서 대시하면 공중 점프 1회를 돌려받는다.',
  mult: { atk: 1.08, mag: 1.08 }, flat: { dark: 15, lifesteal: 1 },
  lookTop: { aura: au('dark', '#c0103a'), wings: 'bat', armorTrim: '#8a0a1e', trailColor: '#ff2a50' },
  ult: { accent: '#c0103a', colors: ['#b0103a', '#ff2a3a', '#12060c'] },
  awaken: { label: '밤의 박쥐 떼', desc: '박쥐 떼가 소용돌이치며 적을 집어삼킨다.' },
  est: { dps: 1.06, ehp: 1.06 } });
t3('azel_bloodemperor', 'azel_bloodking', { name: '혈제', eng: 'BLOOD EMPEROR',
  desc: '흘러넘친 피마저 다스리는 혈족의 황제.',
  perk: '피의 장벽이 최대 HP의 10% 이상이면 마무리 공격이 장벽을 모두 써서 가까운 적 최대 5명(반경 400)의 발밑에서 피의 창을 솟구치게 한다(장벽이 최대 HP의 1%일 때마다 위력 20%, 200~300%, 8초에 한 번).',
  mult: { atk: 1.08, hp: 1.08 }, flat: { critDmg: 25, lifesteal: 1 },
  lookTop: { aura: au('blood', '#ff0a1a'), halo: true, armorTrim: '#ffd84a', capeColor2: '#ff1a2a', trailColor: '#ff1a2a' },
  ult: { accent: '#ff0a1a', colors: ['#ff1a2a', '#ffd84a', '#5a0010'] },
  awaken: { label: '혈제의 관', desc: '피의 왕관이 떠올라 이번 각성의 치명타 피해가 70% 오른다.', critDmg: 70 },
  est: { dps: 1.07, ehp: 1.00 } });
t3('azel_solaris', 'azel_dawnbringer', { name: '태양의 검', eng: 'SOLARIS',
  desc: '한낮의 태양을 칼끝에 묶어 둔 검.',
  perk: '적중할 때마다 태양 게이지 +2, 마무리 공격을 휘두를 때 +6(최대 100). 100이 되면 다음 마무리 공격이 한낮의 일격 — 앞으로 900 길이의 태양 광선이 모든 적을 꿰뚫는다(위력 350%, 신성).',
  mult: { atk: 1.08, mag: 1.08 }, flat: { holy: 15, reach: 5 },
  lookTop: { aura: au('holy', '#ffc040'), halo: true, armorTrim: '#ffb040', capeColor2: '#ffd070', trailColor: '#ffd070' },
  ult: { accent: '#ffc040', colors: ['#ffd070', '#ff2040', '#fff8e8'] },
  awaken: { label: '정오의 해돋이', desc: '일식이 정오의 태양으로 바뀌고 초승달이 신성한 금빛이 된다.' },
  est: { dps: 1.07, ehp: 1.00 } });
t3('azel_nephilim', 'azel_seraph', { name: '네필림', eng: 'NEPHILIM',
  desc: '빛과 어둠이 한 몸에서 맞물린 혼혈의 천사.',
  perk: '공격할 때마다 빛과 어둠의 깃털이 번갈아 1개 날아간다(위력 10%). 같은 적이 1.5초 안에 신성 피해와 암흑 피해를 모두 받으면 일식 — 반경 90 폭발(위력 60%, 그 적이 약한 쪽 속성, 없으면 암흑, 같은 적은 3초에 한 번).',
  mult: { atk: 1.06, mag: 1.08, agi: 1.04 }, flat: { holy: 10, dark: 10 },
  lookTop: { wings: 'seraph', halo: true, aura: au('dark', '#e8d8ff'), armorTrim: '#ffffff', trailColor: '#e8d8ff' },
  ult: { accent: '#e8d8ff', colors: ['#ffffff', '#b060ff', '#1a1a2a'] },
  awaken: { label: '네필림의 날개', desc: '흰 날개와 검은 날개가 겹쳐 펼쳐지고 두 빛깔의 초승달이 교차한다.' },
  est: { dps: 1.09, ehp: 1.00 } });

// ───────────────────────── 이졸데 (창) ─────────────────────────
t3('isolde_skysovereign', 'isolde_stormlord', { name: '천뢰의 기사', eng: 'SKY SOVEREIGN',
  desc: '하늘을 디딜 때마다 천둥을 남기는 폭풍의 기사.',
  perk: '공중 점프할 때마다 발밑에 번개가 터진다(반경 90, 위력 60%). 급강하 착지 낙뢰가 떨어진 높이 120마다 1개씩 늘어나고(3~6개), 충격파 반경은 떨어진 높이 10마다 +1(최대 +60).',
  mult: { atk: 1.08, agi: 1.08 }, flat: { thunder: 15, jumpPow: 5 },
  lookTop: { aura: au('thunder', '#e0f4ff'), scarf: { color: '#bfe8ff', long: true }, armorTrim: '#ffffff', trailColor: '#bfe8ff' },
  ult: { accent: '#e0f4ff', colors: ['#bfe8ff', '#ffffff', '#ffe070'] },
  awaken: { label: '천뢰의 폭풍', desc: '내리꽂을 때마다 번개가 적과 적 사이를 잇는다.' },
  est: { dps: 1.07, ehp: 1.00 } });
t3('isolde_abyssdragoon', 'isolde_wyrmknight', { name: '심연의 용기사', eng: 'ABYSS DRAGOON',
  desc: '균열 너머 검은 용의 불길을 갑주처럼 두른 기사.',
  perk: '화염·암흑 피해를 줄 때마다 용염 +1(최대 20). 용염이 20이면 다음 돌진 찌르기가 흑룡 돌진 — 앞으로 380 거리를 꿰뚫는 검은 불길(위력 250%, 화염)이 지나간 자리에 2초 동안 불바다(0.25초마다 위력 15%)를 남긴다.',
  mult: { atk: 1.08, hp: 1.08 }, flat: { fire: 10, dark: 10, lifesteal: 1 },
  lookTop: { aura: au('dark', '#c070ff'), wings: 'demon', armorTrim: '#c070ff', trailColor: '#c070ff' },
  ult: { accent: '#c070ff', colors: ['#ff6a2a', '#c070ff', '#ffd0a0'] },
  awaken: { label: '심연의 겁화', desc: '용이 검은 불꽃으로 타올라 4초 동안 화염 피해를 남기고, 입힌 피해의 7%를 흡혈한다.', dot: { element: 'fire', t: 4, mv: 0.2 }, lifesteal: 0.07 },
  est: { dps: 1.07, ehp: 1.03 } });
t3('isolde_soulherald', 'isolde_einherjar', { name: '영혼의 전령', eng: 'SOUL HERALD',
  desc: '쓰러진 용사들의 영혼을 다시 전장으로 이끄는 전령.',
  perk: '적을 처치하면 8초 동안 용사의 영혼이 따라온다(최대 3, 4번째는 가장 오래된 영혼을 새로 바꾼다). 빛의 투창을 던질 때 영혼도 함께 던진다(각 위력 40%). 영혼이 3일 때 적에게 맞으면 영혼 하나가 대신 사라지고 피해를 받지 않는다.',
  mult: { hp: 1.08, atk: 1.08 }, flat: { holy: 10, dmgReduce: 3 },
  lookTop: { wings: 'seraph', halo: true, aura: au('holy', '#fff8d0'), armorTrim: '#ffffff', trailColor: '#fff2b0' },
  ult: { accent: '#fff8d0', colors: ['#fff2b0', '#ffd84a', '#ffffff'] },
  awaken: { label: '영혼의 발할라', desc: '전사자의 영혼들이 함께 내리꽂히고, 각성이 끝난 뒤 3초 동안 무적이 된다.', invuln: 3 },
  est: { dps: 1.06, ehp: 1.08 } });
t3('isolde_speargod', 'isolde_spearsaint', { name: '창신', eng: 'SPEAR GOD',
  desc: '한 점을 꿰뚫기 위해 천 번을 찌른 창의 신.',
  perk: '같은 적을 연달아 맞힐 때마다 일점 1중첩(공격 한 번에 1중첩, 최대 20, 2초 동안 못 맞히거나 다른 적을 맞히면 사라진다). 중첩당 그 적에게 주는 피해 +0.5%. 20중첩이면 다음 찌르기가 관통 일섬 — 앞으로 700 길이의 빛줄기(위력 250%, 치명타 확정).',
  mult: { atk: 1.08, agi: 1.06, res: 1.04 }, flat: { critDmg: 20 },
  lookTop: { aura: au('holy', '#ff9aac'), scarf: { color: '#ff2040', long: true }, halo: true, armorTrim: '#ffd070', trailColor: '#ffd0d8' },
  ult: { accent: '#ff9aac', colors: ['#ffd0d8', '#d02040', '#ffffff'] },
  awaken: { label: '창신의 비', desc: '하늘에서 빛의 창이 비처럼 쏟아지고 이번 각성의 치명타 피해가 60% 오른다.', critDmg: 60 },
  est: { dps: 1.10, ehp: 1.00 } });   // 1.10 단일 · 1.03 무리

// ───────────────────────── 비전 7 (숨은 직업; 그 영웅의 2차 넷 어디서든) ─────────────────────────
hidden('kael_sealbearer', 'kael', { name: '발크레인 봉인자', eng: 'SEALBEARER',
  desc: '사백 년 전 발크레인이 종지기와 맺은 첫 봉인을 이어받은 자.',
  perk: '채찍에 맞은 적에게 봉인 1중첩(최대 5, 5초). 5중첩이면 일반 적은 2초 동안 봉인되어 움직이지 못하고(같은 적은 6초에 한 번), 보스는 4초 동안 봉인 균열 — 카엘에게 받는 피해 +15%(같은 보스는 15초에 한 번).',
  mult: { atk: 1.08, hp: 1.08 }, flat: { holy: 15, crit: 5 },
  lookTop: { aura: au('holy', '#ffd84a'), halo: true, armorTrim: '#ffd84a', trailColor: '#ffe9a0' },
  ult: { accent: '#ffd84a', colors: ['#ffd84a', '#fff8e0', '#5a3a10'] },
  skill: 'asc_kael_firstseal', est: { dps: 1.08, ehp: 1.10 } });
hidden('sera_bellsaint', 'sera', { name: '종의 성녀', eng: 'BELL SAINT',
  desc: '에슈빌의 종 — 일곱 번째 닻의 소리를 듣고 울리는 성녀.',
  perk: '적중 8회마다 또는 액티브 스킬을 쓸 때 종이 울린다(2.5초에 한 번): 반경 200 신성 파동(위력 50%, 0.3초 경직)이 퍼지고, 그 안의 적 탄환을 지우며, 최대 HP의 2%를 회복한다. 12초 안에 세 번째로 울리는 종은 만종 — 반경 300, 위력 120%, 회복 4%.',
  mult: { mag: 1.08, hp: 1.08 }, flat: { holy: 15, hpRegen: 1 },
  lookTop: { aura: au('holy', '#e8f0ff'), halo: true, wings: 'angel', armorTrim: '#c8d0e0', trailColor: '#f0f4ff' },
  ult: { accent: '#e8f0ff', colors: ['#e8f0ff', '#ffd84a', '#ffffff'] },
  skill: 'asc_sera_seventhbell', est: { dps: 1.05, ehp: 1.25 } });
hidden('victor_silverwolf', 'victor', { name: '은랑 사냥꾼', eng: 'SILVER WOLF',
  desc: '스승 하겐의 은탄과 달의 저주를 함께 물려받은 사냥꾼.',
  perk: '적중마다 달 게이지 +2, 처치마다 +8(스테이지마다 0에서 시작). 100이 되면 6초 동안 만월 — 탄환이 은탄이 되어 피해 +10%, 관통 +1, 대시하면 늑대 발톱 세 줄이 앞을 할퀸다(각 위력 50%).',
  mult: { atk: 1.10, hp: 1.06 }, flat: { critDmg: 20 },
  lookTop: { aura: au('ice', '#e8f0ff'), scarf: { color: '#c8ccd4', long: true }, armorTrim: '#c8ccd4', trailColor: '#e8f0ff', tint: { h: 0, s: 0.85 } },
  ult: { accent: '#e8f0ff', colors: ['#e8f0ff', '#c8ccd4', '#1a1a2a'] },
  skill: 'asc_victor_silverbullet', est: { dps: 1.08, ehp: 1.03 } });
hidden('bran_oathlord', 'bran', { name: '서약 기사단장', eng: 'OATH LORD',
  desc: '무너진 새벽 서약 기사단을 다시 일으켜 세운 단장.',
  perk: '적중 20회마다 새벽 서약 기사의 영혼이 등 뒤에서 앞으로 돌격한다(위력 80%, 신성, 3초에 한 번). 내 군기 반경 260 안에서는 경직되지 않는다.',
  mult: { atk: 1.06, hp: 1.08, def: 1.06 }, flat: { holy: 15 },
  lookTop: { aura: au('holy', '#ffcf6a'), halo: true, capeColor2: '#ffcf6a', armorTrim: '#ffcf6a', trailColor: '#ffe0a0' },
  ult: { accent: '#ffcf6a', colors: ['#ffcf6a', '#f0e8d0', '#2a4a8a'] },
  skill: 'asc_bran_oathbanner', est: { dps: 1.08, ehp: 1.15 } });
hidden('lia_frostcrow', 'lia', { name: '서리 까마귀', eng: 'FROST CROW',
  desc: '얼음 속에서 집으로 돌아오던 아버지의 날개를 이어받은 까마귀.',
  perk: '공격에 맞은 적에게 냉기 1중첩(최대 5, 4초). 5중첩이면 일반 적은 1.2초 동안 얼어붙고(같은 적은 5초에 한 번), 보스는 2.5초 동안 25% 느려진다(10초에 한 번). 얼어붙은 적에게 주는 피해 +20%. 얼어붙은 적을 처치하면 산산조각 나며 반경 100에 위력 60% 냉기 피해와 냉기 2중첩을 준다.',
  mult: { atk: 1.08, agi: 1.06, hp: 1.05 }, flat: { ice: 20, critDmg: 10 },
  lookTop: { aura: au('ice', '#bff4ff'), wings: 'crow', scarf: { color: '#bfe8ff', long: true }, armorTrim: '#bff4ff', trailColor: '#c8f0ff' },
  ult: { accent: '#bff4ff', colors: ['#bff4ff', '#2a2a4a', '#ffffff'] },
  skill: 'asc_lia_frostwing', est: { dps: 1.08, ehp: 1.10 } });
hidden('azel_dawnblood', 'azel', { name: '여명의 혈족', eng: 'DAWNBLOOD',
  desc: '어머니 아멜리아에게서 성녀의 피를, 아버지에게서 밤의 피를 받은 여명의 혈족.',
  perk: '스테이지마다 한 번, 치명상을 입으면 5초 동안 빌린 시간에 들어간다(HP 1, 처음 0.8초 무적). 그동안 최대 HP의 25%만큼 피해를 주면 HP 35%로 돌아오며 여명의 피가 터진다(반경 200, 위력 150%, 신성). 채우지 못하면 쓰러진다. HP가 50% 이하일 때 신성·암흑 피해 +10%.',
  mult: { atk: 1.08, hp: 1.08 }, flat: { holy: 15, lifesteal: 1 },
  lookTop: { aura: au('holy', '#ffb060'), halo: true, wings: 'bat', wingCol: ['#2a0a10', '#ffb060', '#5a1a10'], armorTrim: '#ffb060', trailColor: '#ff8a5a' },
  ult: { accent: '#ffb060', colors: ['#ffb060', '#ff2040', '#fff2d0'] },
  skill: 'asc_azel_lullaby', est: { dps: 1.06, ehp: 1.20 } });
hidden('isolde_dragonbond', 'isolde', { name: '용의 맹약자', eng: 'DRAGONBOUND',
  desc: '아르겐과 다시 맺은 맹약으로 은빛 뇌룡의 힘을 나눠 받은 기사.',
  perk: '급강하 착지 때 아르겐의 환영이 등 뒤에서 날아와 앞뒤 640을 가로지른다(높이 120 띠, 위력 90%, 번개, 4초에 한 번). 급강하 착지마다 용린 1중첩(최대 3, 6초) — 중첩당 받는 피해 -5%.',
  mult: { atk: 1.08, hp: 1.06, agi: 1.04 }, flat: { thunder: 15 },
  lookTop: { wings: 'demon', wingCol: ['#1a2a3a', '#9fe8ff', '#2a3a4a'], aura: au('thunder', '#9fe8ff'), armorTrim: '#9fe8ff', trailColor: '#9fe8ff' },
  ult: { accent: '#9fe8ff', colors: ['#9fe8ff', '#e8fbff', '#1a2a3a'] },
  skill: 'asc_isolde_breath', est: { dps: 1.07, ehp: 1.08 } });

// ── 비전: parents = 그 영웅의 2차 넷 (CLASSES 순서) ──
const TIER2 = {};
for (const c of Object.values(CLASSES)) if (c.tier === 2) (TIER2[c.charId] ??= []).push(c.id);
for (const x of Object.values(A)) if (x.kind === 'hidden') x.parents = [...(TIER2[x.charId] ?? [])];

/** 영웅별 id: 초월 4 (CLASSES 2차 순서) → 비전 */
const IDS = {}, T3 = {}, HID = {};
for (const charId of Object.keys(TIER2)) IDS[charId] = [];
for (const [charId, list] of Object.entries(TIER2)) {
  for (const cid of list) { const t = Object.values(A).find((x) => x.kind === 't3' && x.parent === cid); if (t) { IDS[charId].push(t.id); T3[cid] = t.id; } }
  const h = Object.values(A).find((x) => x.kind === 'hidden' && x.charId === charId);
  if (h) { IDS[charId].push(h.id); HID[charId] = h.id; }
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}
export const ASCENSIONS = deepFreeze(A);
export const ASC_IDS = deepFreeze(IDS);
export const T3_OF = deepFreeze(T3);
export const HIDDEN_OF = deepFreeze(HID);

// ───────────────────────── 도우미 (순수) ─────────────────────────
const has = (o, k) => !!o && Object.hasOwn(o, k);
/** 지금 유효한 초월/비전 항목 또는 null: 같은 영웅 · 지금 2차가 그 계보 (해금 여부는 state.js migrateAsc · progression 이 지킨다) */
export function ascOf(hero) {
  const id = hero?.asc;
  if (typeof id !== 'string' || !has(ASCENSIONS, id)) return null;
  const x = ASCENSIONS[id];
  return x.charId === hero.charId && x.parents.includes(hero.classId) ? x : null;
}
/** 캐시 키 (perk 메모·필살기 준비·미리보기): 2차 id + 초월 id */
export function heroKey(hero) { return `${hero?.classId}|${hero?.asc ?? ''}`; }
/** 0~3 (초월·비전 = 3) */
export function heroTier(hero) { return ascOf(hero) ? 3 : CLASSES[hero?.classId]?.tier ?? 0; }
/** 능력치·외형 계보: 기본 → 상급 → 최상급 (+ 초월/비전) */
export function heroChain(hero) { return [...classChain(hero?.classId), ascOf(hero)].filter(Boolean); }
export function classNameOf(hero) { return ascOf(hero)?.name ?? CLASSES[hero?.classId]?.name ?? ''; }
export function classEngOf(hero) { return ascOf(hero)?.eng ?? CLASSES[hero?.classId]?.eng ?? ''; }
/** '기본 직업' · '상급 직업' · '최상급 직업' · '초월' · '비전' */
export function tierLabelOf(hero) {
  const x = ascOf(hero);
  return x ? KIND_LABEL[x.kind] : TIER_NAMES[CLASSES[hero?.classId]?.tier ?? 0] ?? '';
}
export function ascName(id) { return typeof id === 'string' && has(ASCENSIONS, id) ? ASCENSIONS[id].name : null; }
/** 이 2차 직업에서 고를 수 있는 길: [초월, 비전] (2차가 아니면 []) */
export function ascListFor(classId) {
  const c = typeof classId === 'string' && has(CLASSES, classId) ? CLASSES[classId] : null;
  if (!c || c.tier !== 2) return [];
  return [T3_OF[classId], HIDDEN_OF[c.charId]].filter(Boolean);
}
/** 그 영웅의 다섯 (초월 4 + 비전) */
export function ascListOf(charId) { return has(ASC_IDS, charId) ? [...ASC_IDS[charId]] : []; }
/** 시련 → 여는 id (Ⅰ: 그 영웅의 초월 넷, Ⅱ: 비전). trials.js 를 import 하지 않도록 id 모양('tr_<hero>_<n>')으로 푼다 */
export function unlocksOf(tid) {
  const m = typeof tid === 'string' ? /^tr_([a-z]+)_([12])$/.exec(tid) : null;
  if (!m || !has(ASC_IDS, m[1])) return [];
  return m[2] === '1' ? ASC_IDS[m[1]].filter((id) => ASCENSIONS[id].kind === 't3') : ASC_IDS[m[1]].filter((id) => ASCENSIONS[id].kind === 'hidden');
}
/** 초월·전환 조건 (느슨): 이번 회차의 2부 결말 플래그 또는 회차 세이브(ng.n > 0 — NG+ 는 플래그를 지운다) */
export function p2Cleared(state) {
  const F = state?.progress?.flags ?? {};
  return !!(F.p2_done || F.ending_p2 || F.ending_p2true) || (!state?.arcade && Number.isInteger(state?.ng?.n) && state.ng.n > 0);
}
/** 이번 회차 또는 지난 회차(ng.past.flags)에 한 번이라도 켜진 플래그 */
export function flagEver(state, f) {
  return !!state?.progress?.flags?.[f] || !!state?.ng?.past?.flags?.[f];
}
