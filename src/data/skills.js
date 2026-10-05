// 스킬 트리 데이터: 7캐릭터 × 3계열 × 6스킬 = 126개 (액티브 56 / 패시브 70)
// SKILLS[id] = { id, charId, name, desc, type:'active'|'passive', branch, row, maxLv, reqLevel, req:[선행스킬id], reqClass?,
//                cost(MP), cd(초), color, v:{키:[기본값, 레벨당 증가]}(액티브 수치 → desc 의 {키} 치환, game/skills.js 가 사용),
//                stats(패시브: {stat:[lv1..lvN]}), spCost(레벨당 필요 SP), icon? }
// SKILL_TREES[charId] = { branches: [{ id, name, desc, color, kind:'core'|'class', gate?:[1차, 2차A, 2차B], skills:[id,...] }] }
// 계열 규칙
//  · 'core'(공용) 계열: 레벨 1/3/8/14/22/32, 앞 단계 선행
//  · 'class'(전직) 계열: 레벨 2/5/10/15/25/28, 3단(row2)부터 1차 전직 필요, 5단/6단은 각각 다른 2차 전직 전용(둘 다 4단 선행)
//  → 직업 선택에 따라 배울 수 있는 스킬이 갈라지며, 스킬 성장이 여러 방향으로 뻗어 나간다.
import { CLASSES, classChain } from './classes.js';

export const SKILLS = {};
export const SKILL_TREES = {};

// ── 패시브 수치 표 (lv1~5). mul 로 가중, 3레벨 스킬은 1·3·5 단계 값을 사용 ──
const R = {
  hp: [15, 30, 45, 65, 85], mp: [8, 16, 24, 32, 42], atk: [2, 4, 6, 9, 12], mag: [2, 4, 6, 9, 12],
  def: [2, 4, 6, 8, 11], res: [2, 4, 6, 8, 11], agi: [1, 2, 3, 5, 7], luck: [1, 2, 3, 5, 7],
  crit: [1, 2, 3, 4, 6], critDmg: [5, 10, 15, 20, 30], lifesteal: [0.5, 1, 1.5, 2, 3],
  hpRegen: [0.3, 0.6, 0.9, 1.2, 1.6], mpRegen: [0.3, 0.6, 0.9, 1.2, 1.6], moveSpd: [2, 4, 6, 8, 10],
  jumpPow: [2, 4, 6, 8, 10], atkSpd: [2, 4, 6, 8, 11], expBonus: [4, 8, 12, 16, 22], goldBonus: [5, 10, 15, 20, 28],
  dropBonus: [3, 6, 9, 12, 16], subDmg: [5, 10, 15, 20, 28], skillDmg: [4, 8, 12, 16, 22], cdr: [2, 4, 6, 8, 10],
  ultGain: [5, 10, 15, 20, 30], heartBonus: [5, 10, 15, 20, 30],
  fire: [4, 8, 12, 16, 22], ice: [4, 8, 12, 16, 22], holy: [4, 8, 12, 16, 22], dark: [4, 8, 12, 16, 22], thunder: [4, 8, 12, 16, 22],
  resFire: [5, 10, 15, 20, 25], resIce: [5, 10, 15, 20, 25], resHoly: [5, 10, 15, 20, 25], resDark: [5, 10, 15, 20, 25], resThunder: [5, 10, 15, 20, 25],
  dmgReduce: [1, 2, 3, 4, 6], reach: [3, 6, 9, 12, 16], magnet: [20, 40, 60, 80, 100],
};
const FRAC = new Set(['hpRegen', 'mpRegen', 'lifesteal']);
/** 스탯 수치 배열: st({atk:1.5, crit:1}) */
function st(o, n = 5) {
  const out = {};
  for (const k in o) {
    let a = R[k].map((v) => v * o[k]);
    a = a.map((v) => (FRAC.has(k) ? Math.round(v * 10) / 10 : Math.round(v)));
    out[k] = n === 3 ? [a[0], a[2], a[4]] : a;
  }
  return out;
}

// 스탯 한글 표기 (game/stats.js STAT_INFO 와 동일 — 데이터 모듈 간 순환 import 를 피하려 별도 보관)
const STAT_LABEL = {
  hp: ['최대 HP'], mp: ['최대 MP'], atk: ['공격력'], mag: ['마력'], def: ['방어력'], res: ['마법 저항'], agi: ['민첩'], luck: ['행운'],
  crit: ['치명타 확률', 1], critDmg: ['치명타 피해', 1], lifesteal: ['흡혈', 1], hpRegen: ['HP 재생/초'], mpRegen: ['MP 재생/초'],
  moveSpd: ['이동 속도', 1], jumpPow: ['점프력', 1], airJumps: ['공중 점프'], atkSpd: ['공격 속도', 1], expBonus: ['경험치', 1],
  goldBonus: ['골드 획득', 1], dropBonus: ['드롭률', 1], subDmg: ['보조무기 피해', 1], skillDmg: ['스킬 피해', 1], cdr: ['재사용 대기 감소', 1],
  ultGain: ['필살 게이지 충전', 1], heartBonus: ['하트 획득', 1], fire: ['화염 피해', 1], ice: ['냉기 피해', 1], holy: ['신성 피해', 1],
  dark: ['암흑 피해', 1], thunder: ['번개 피해', 1], resFire: ['화염 저항', 1], resIce: ['냉기 저항', 1], resHoly: ['신성 저항', 1],
  resDark: ['암흑 저항', 1], resThunder: ['번개 저항', 1], dmgReduce: ['받는 피해 감소', 1], reach: ['공격 범위', 1], magnet: ['아이템 자석'],
};

const LV_CORE = [1, 3, 8, 14, 22, 32];
const LV_CLASS = [2, 5, 10, 15, 25, 28];

const A = (id, name, o) => ({ id, name, type: 'active', maxLv: 5, ...o });
const P = (id, name, stats, desc, o = {}) => ({ id, name, type: 'passive', maxLv: o.maxLv ?? 5, stats, desc, ...o });

function tree(charId, branches) {
  SKILL_TREES[charId] = { branches: [] };
  for (const b of branches) {
    const ids = [];
    b.skills.forEach((s, row) => {
      const core = b.kind === 'core';
      const sk = {
        charId, branch: b.id, row, req: [], spCost: 1, color: b.color,
        reqLevel: (core ? LV_CORE : LV_CLASS)[row], ...s,
      };
      if (row > 0) {
        const prevRow = !core && row === 5 ? 3 : row - 1;
        sk.req = [b.skills[prevRow].id];
      }
      if (!core && b.gate) {
        if (row === 2 || row === 3) sk.reqClass ??= b.gate[0];
        if (row === 4) sk.reqClass ??= b.gate[1];
        if (row === 5) sk.reqClass ??= b.gate[2];
        if (row >= 4) sk.spCost = 2;
      }
      if (core && row >= 4) sk.spCost = 2;
      SKILLS[sk.id] = sk;
      ids.push(sk.id);
    });
    const { skills, ...rest } = b;
    SKILL_TREES[charId].branches.push({ ...rest, skills: ids });
  }
}

// ═════════════════════════ 카엘 ═════════════════════════
tree('kael', [
  { id: 'kael_whip', kind: 'core', name: '채찍술', color: '#e8dcc0', desc: '발크레인 가문에 대대로 전해진 채찍 기술.', skills: [
    A('kael_vigilia', '비질리아 일섬', { cost: 8, cd: 3.5, color: '#fff2b0', v: { dmg: [260, 45], r: [300, 40] },
      desc: '성스러운 채찍 비질리아를 한껏 뻗어 사거리 {r}까지 꿰뚫는다. 위력 {dmg}%, 맞은 적은 공중으로 튀어 오른다.' }),
    P('kael_whip_mastery', '채찍 숙련', st({ atk: 1, reach: 1 }), '손목의 스냅이 매서워져 채찍이 더 멀리, 더 세게 닿는다.'),
    P('kael_chain_lash', '연쇄 채찍', st({ atkSpd: 1, crit: 1 }), '끊김 없이 이어지는 연격으로 적에게 숨 돌릴 틈을 주지 않는다.'),
    A('kael_tempest', '채찍 폭풍', { cost: 16, cd: 8, color: '#ffe7a0', v: { dmg: [70, 12], r: [150, 18], t: [1.2, 0.15] },
      desc: '채찍을 머리 위로 휘돌려 반경 {r}의 폭풍을 {t}초간 일으킨다. 타격당 {dmg}% 피해.' }),
    P('kael_long_arm', '사냥꾼의 팔', st({ reach: 1.2, critDmg: 1 }), '채찍 끝의 궤적이 칼날처럼 날카로워진다.'),
    P('kael_vampire_killer', '뱀파이어 킬러', st({ atk: 1.5, holy: 1, critDmg: 1 }), '흡혈귀를 멸하기 위해 태어난 혈통이 마침내 깨어난다.'),
  ] },
  { id: 'kael_holy', kind: 'class', gate: ['kael_crusader', 'kael_templar', 'kael_inquisitor'], name: '성광', color: '#fff2b0',
    desc: '신의 빛을 채찍과 몸에 두르는 기술. 성광의 사냥꾼 계열에서 꽃핀다.', skills: [
    P('kael_faith', '신앙심', st({ holy: 1, res: 1 }), '기도로 다진 신앙이 빛의 힘을 키운다.'),
    A('kael_holy_cross', '성광 십자가', { cost: 12, cd: 5, v: { dmg: [150, 25], n: [1, 0.5] },
      desc: '거대한 성광 십자가 {n}개를 던진다. 부메랑처럼 되돌아오며 적을 관통하고, 위력은 {dmg}%.' }),
    P('kael_holy_imbue', '성광 부여', st({ holy: 1.5, ultGain: 1 }), '채찍에 깃든 빛이 필살 게이지를 빠르게 채운다.'),
    P('kael_blessed_body', '축복받은 육체', st({ hp: 1, hpRegen: 1, resDark: 1 }), '성스러운 빛이 상처를 천천히 아물게 하고 어둠을 막아 준다.'),
    A('kael_sanctuary', '성역의 방벽', { cost: 20, cd: 14, color: '#ffe07a', v: { dmg: [90, 15], r: [160, 20], heal: [3, 0.5], n: [4, 0.5] },
      desc: '황금빛 성역을 펼쳐 파동을 {n}번 일으킨다. 파동마다 반경 {r} 안의 적에게 {dmg}% 신성 피해를 주고, 최대 HP의 {heal}%를 회복한다.' }),
    A('kael_autodafe', '심판의 화형', { cost: 22, cd: 12, color: '#ff9a3a', v: { dmg: [180, 30], n: [5, 1] },
      desc: '전방으로 성화의 불기둥 {n}개를 연달아 솟구치게 한다. 기둥마다 {dmg}% 신성·화염 피해.' }),
  ] },
  { id: 'kael_hunt', kind: 'class', gate: ['kael_stalker', 'kael_bloodhunter', 'kael_nightraven'], name: '사냥꾼의 기술', color: '#9ab8d0',
    desc: '괴물을 쫓고 급소를 노리는 사냥꾼의 잔기술. 그림자 추적자 계열에서 꽃핀다.', skills: [
    P('kael_hunter_sense', '사냥꾼의 감각', st({ crit: 1, luck: 1 }), '사냥감의 약점이 한눈에 들어온다.'),
    A('kael_silver_fan', '은빛 단검 부채', { cost: 10, cd: 4, color: '#dfe8ff', v: { dmg: [85, 15], n: [5, 1] },
      desc: '은 단검 {n}자루를 부채꼴로 흩뿌린다. 단검은 적 둘을 꿰뚫으며 자루당 {dmg}% 피해.' }),
    P('kael_stalker_step', '추적자의 발놀림', st({ moveSpd: 1, jumpPow: 1, agi: 1 }), '소리 없이, 누구보다 빠르게 사냥감의 뒤를 잡는다.'),
    P('kael_weakpoint', '급소 사냥', st({ critDmg: 1.5, crit: 1 }), '치명타 한 번으로 사냥을 끝낸다.'),
    A('kael_blood_hunt', '블러드 헌트', { cost: 18, cd: 9, color: '#ff2a44', v: { dmg: [320, 50], r: [300, 30] },
      desc: '핏빛 섬광이 되어 {r}만큼 돌진한다. 잠시 뒤 지나간 궤적이 터지며 {dmg}% 피해를 주고 체력을 흡수한다. 돌진 중 무적.' }),
    A('kael_raven_storm', '까마귀 폭풍', { cost: 18, cd: 10, color: '#8a6aff', v: { dmg: [70, 12], n: [6, 1.5] },
      desc: '밤의 까마귀 {n}마리를 풀어 적을 끈질기게 쫓게 한다. 까마귀는 {dmg}% 암흑 피해로 여러 번 쪼아댄다.' }),
  ] },
]);

// ═════════════════════════ 세라 ═════════════════════════
tree('sera', [
  { id: 'sera_sacred', kind: 'core', name: '신성 마법', color: '#fff8d0', desc: '성 루미나 수도원에서 익힌 퇴마의 기도문.', skills: [
    A('sera_holy_bolt', '성광탄', { cost: 6, cd: 1.6, v: { dmg: [95, 16], n: [2, 0.5] },
      desc: '적을 쫓아가는 성광탄 {n}발을 쏜다. 발당 {dmg}% 신성 피해.' }),
    P('sera_prayer', '기도', st({ mag: 1, mp: 1 }), '매일의 기도가 마력의 샘을 넓힌다.'),
    P('sera_scripture', '성서 암송', st({ mpRegen: 1, cdr: 1 }), '외워 둔 성구가 주문을 더 빠르게 잇게 한다.'),
    A('sera_light_pillar', '빛의 기둥', { cost: 16, cd: 7, color: '#fff2b0', v: { dmg: [60, 10], w: [90, 14], n: [1, 0.5] },
      desc: '가장 가까운 적의 머리 위로 폭 {w}의 빛기둥을 내리꽂고, 작은 기둥 {n}개가 뒤따른다. 타격당 {dmg}% 신성 피해.' }),
    P('sera_exorcism', '퇴마의 권능', st({ holy: 1.2, skillDmg: 1 }), '악을 쫓는 말씀에 권능이 실린다.'),
    P('sera_saintly', '성녀의 자질', st({ mag: 1.5, res: 1, ultGain: 1 }), '하늘이 선택한 자에게만 허락된 은총.'),
  ] },
  { id: 'sera_elem', kind: 'class', gate: ['sera_elementalist', 'sera_archmage', 'sera_stormcaller'], name: '원소 마법', color: '#ff8a3a',
    desc: '금서에서 배운 화염·냉기·번개의 전투 마법. 원소술사 계열에서 꽃핀다.', skills: [
    P('sera_elem_affinity', '원소 친화', st({ fire: 0.8, ice: 0.8, thunder: 0.8 }), '불과 얼음과 번개가 손끝에서 춤춘다.'),
    A('sera_fireball', '화염구', { cost: 12, cd: 4, color: '#ff7a2a', v: { dmg: [220, 35], r: [70, 10], n: [1, 0.5] },
      desc: '화염구 {n}발을 날려 반경 {r}에 폭발을 일으킨다. 발당 {dmg}% 화염 피해.' }),
    P('sera_amplify', '원소 증폭', st({ skillDmg: 1.2, mag: 1 }), '주문에 실리는 마력이 한층 증폭된다.'),
    P('sera_mana_flow', '마력 순환', st({ mp: 1.5, mpRegen: 1 }), '몸속을 도는 마력이 끊기지 않는다.'),
    A('sera_meteor', '메테오 스웜', { cost: 30, cd: 16, color: '#ff5a1a', v: { dmg: [200, 35], n: [4, 1] },
      desc: '하늘을 찢고 운석 {n}개를 떨어뜨린다. 운석마다 {dmg}% 화염 폭발.' }),
    A('sera_thunderstorm', '뇌운 강림', { cost: 26, cd: 13, color: '#bfe0ff', v: { dmg: [150, 25], n: [6, 1.5] },
      desc: '머리 위에 뇌운을 불러 적에게 낙뢰 {n}번을 내리꽂는다. 낙뢰마다 {dmg}% 번개 피해.' }),
  ] },
  { id: 'sera_bless', kind: 'class', gate: ['sera_priestess', 'sera_saint', 'sera_oracle'], name: '축복', color: '#ffe7a0',
    desc: '상처를 치유하고 몸을 지키는 축복의 권능. 대사제 계열에서 꽃핀다.', skills: [
    P('sera_mercy', '자애', st({ hp: 1, hpRegen: 1 }), '타인을 향한 자비가 스스로를 지키는 힘이 된다.'),
    A('sera_heal', '치유의 기도', { cost: 18, cd: 10, color: '#aef0a0', v: { heal: [25, 5], dmg: [80, 15], r: [140, 15] },
      desc: '빛의 날개를 펼쳐 최대 HP의 {heal}%를 회복하고, 반경 {r} 안의 적에게 {dmg}% 신성 피해를 준다.' }),
    P('sera_blessing', '축복의 손길', st({ dmgReduce: 1, res: 1.2 }), '보이지 않는 손길이 날아드는 공격을 누그러뜨린다.'),
    P('sera_guardian_angel', '수호 천사', st({ hp: 1.2, def: 1, resDark: 1 }), '곁을 지키는 천사가 어둠을 막아선다.'),
    A('sera_archangel', '대천사 강림', { cost: 30, cd: 18, color: '#fff8d0', v: { dmg: [110, 18], n: [8, 2] },
      desc: '등 뒤에 대천사를 불러 빛의 창 {n}자루를 적에게 내리꽂는다. 창마다 {dmg}% 신성 피해.' }),
    A('sera_chrono', '시간의 신탁', { cost: 28, cd: 22, color: '#8ac8ff', v: { t: [2, 0.4], dmg: [140, 25] },
      desc: '시간의 흐름을 멈춰 {t}초 동안 모든 적과 탄환을 정지시킨다. 시곗바늘이 휩쓸며 {dmg}% 피해를 두 번 준다.' }),
  ] },
]);

// ═════════════════════════ 빅터 ═════════════════════════
tree('victor', [
  { id: 'victor_marks', kind: 'class', gate: ['victor_deadeye', 'victor_phantom', 'victor_executioner'], name: '사격술', color: '#dfe6f0',
    desc: '한 발로 끝내는 정밀 사격. 데드아이 계열에서 꽃핀다.', skills: [
    P('victor_marksman', '사격 훈련', st({ atk: 1, crit: 1 }), '수천 발의 연습이 손끝에 새겨졌다.'),
    A('victor_pierce_shot', '관통 저격', { cost: 10, cd: 4, color: '#fff0b0', v: { dmg: [300, 50], w: [16, 4] },
      desc: '은탄 한 발에 모든 것을 걸어 화면 끝까지 꿰뚫는 저격을 날린다. 위력 {dmg}%.' }),
    P('victor_deadeye_focus', '데드아이', st({ critDmg: 1.5, crit: 1 }), '시간이 느려지고, 조준선 너머로 급소만 보인다.'),
    P('victor_steady', '호흡 조절', st({ crit: 1, skillDmg: 1 }), '숨을 멈추는 찰나, 총구는 흔들리지 않는다.'),
    A('victor_phantom_bullet', '팬텀 불릿', { cost: 22, cd: 10, color: '#9ab0ff', v: { dmg: [140, 25], n: [2, 0.5] },
      desc: '유령 분신 {n}명을 불러내 일제히 관통탄을 쏜다. 탄환당 {dmg}% 피해.' }),
    A('victor_execution', '처형 선고', { cost: 24, cd: 12, color: '#ff3040', v: { dmg: [260, 45], n: [3, 1] },
      desc: '적 최대 {n}명에게 조준선을 새긴 뒤 헤드샷을 날린다. {dmg}% 피해, 체력이 낮은 적일수록 더 치명적이다.' }),
  ] },
  { id: 'victor_boom', kind: 'class', gate: ['victor_desperado', 'victor_hellfire', 'victor_gunlord'], name: '폭발물', color: '#ff9a3a',
    desc: '화약과 다이너마이트로 모든 것을 날려 버리는 기술. 데스페라도 계열에서 꽃핀다.', skills: [
    P('victor_powder', '화약 취급', st({ fire: 1, subDmg: 1 }), '화약 냄새가 몸에 밴 사내의 요령.'),
    A('victor_dynamite', '다이너마이트', { cost: 12, cd: 5, color: '#ff6a2a', v: { dmg: [200, 35], n: [1, 0.5], r: [80, 10] },
      desc: '불붙은 다이너마이트 {n}개를 던져 반경 {r}을 날려 버린다. 개당 {dmg}% 화염 피해.' }),
    P('victor_extra_charge', '화약 증량', st({ skillDmg: 1.2, fire: 1 }), '규정 따위는 무시한 두 배의 장약.'),
    P('victor_demolition', '폭파 전문가', st({ subDmg: 1.2, resFire: 1, hp: 0.8 }), '폭발 한가운데서도 눈 하나 깜짝하지 않는다.'),
    A('victor_hellfire_burst', '헬파이어 버스트', { cost: 22, cd: 9, color: '#ff5a1a', v: { dmg: [60, 10], n: [10, 2] },
      desc: '지옥불 산탄 {n}발을 부채꼴로 쏟아붓고 바닥을 불바다로 만든다. 탄환당 {dmg}% 화염 피해.' }),
    A('victor_gatling', '건로드 개틀링', { cost: 26, cd: 12, color: '#ffd84a', v: { dmg: [38, 6], t: [1.4, 0.2] },
      desc: '{t}초 동안 탄환을 폭우처럼 난사한다. 탄환당 {dmg}% 피해.' }),
  ] },
  { id: 'victor_outlaw', kind: 'core', name: '무법자', color: '#ffd070', desc: '황야에서 살아남은 총잡이의 잔재주.', skills: [
    A('victor_fanning', '패닝 샷', { cost: 6, cd: 2.5, v: { dmg: [55, 9], n: [5, 1] },
      desc: '해머를 손바닥으로 긁어 순식간에 {n}연발을 쏜다. 가까운 적을 자동으로 조준하며 발당 {dmg}% 피해.' }),
    P('victor_gambler', '도박꾼의 운', st({ luck: 1, goldBonus: 1, dropBonus: 1 }), '운도 실력이다. 적어도 이 사내에게는.'),
    P('victor_quickdraw', '속사', st({ atkSpd: 1.2, moveSpd: 1 }), '누구보다 먼저 뽑고, 누구보다 먼저 쏜다.'),
    A('victor_bullet_dance', '탄환 무도', { cost: 16, cd: 7, color: '#ffe0a0', v: { dmg: [60, 10], n: [12, 2] },
      desc: '몸을 팽이처럼 돌리며 사방으로 탄환 {n}발을 흩뿌린다. 발당 {dmg}% 피해.' }),
    P('victor_guts', '무법자의 배짱', st({ critDmg: 1.2, hp: 1 }), '총구를 마주하고도 웃을 수 있는 배짱.'),
    P('victor_bounty', '현상금 사냥꾼', st({ goldBonus: 1, expBonus: 1, atk: 1.2 }), '괴물의 목에 걸린 현상금은 전부 내 것.'),
  ] },
]);

// ═════════════════════════ 브란 ═════════════════════════
tree('bran', [
  { id: 'bran_great', kind: 'core', name: '대검술', color: '#d8dce8', desc: '은빛 기사단에서 단련한 대검의 정석.', skills: [
    A('bran_ground_split', '대지 가르기', { cost: 8, cd: 4, color: '#ffc080', v: { dmg: [150, 25], n: [4, 1] },
      desc: '대검을 내리찍어 땅을 따라 달리는 파동을 일으킨다. 바위 {n}개가 연달아 솟구치며 {dmg}% 피해.' }),
    P('bran_gs_mastery', '대검 숙련', st({ atk: 1.2, reach: 1 }), '쇳덩이 같은 대검이 손의 일부가 된다.'),
    P('bran_steel_body', '강철 체력', st({ hp: 1.2, def: 1 }), '끝없는 수련이 몸을 강철로 바꾸었다.'),
    A('bran_whirlwind', '회전 참격', { cost: 16, cd: 8, color: '#e8ecf8', v: { dmg: [80, 13], r: [130, 15], t: [1.0, 0.15] },
      desc: '대검을 휘돌리며 전진하는 칼바람이 된다. {t}초 동안 반경 {r} 안을 연속으로 베어 타격당 {dmg}% 피해.' }),
    P('bran_decisive', '일격필살', st({ critDmg: 1.5, atk: 1 }), '단 한 번의 참격에 모든 것을 싣는다.'),
    P('bran_ironheart', '철심', st({ hp: 1.5, def: 1.2, dmgReduce: 1 }), '꺾이지 않는 강철의 심장. 기사단의 마지막 긍지.'),
  ] },
  { id: 'bran_guard', kind: 'class', gate: ['bran_paladin', 'bran_guardian', 'bran_crusader'], name: '수호', color: '#9ab8ff',
    desc: '동료를 지키는 성기사의 방패술. 성기사 계열에서 꽃핀다.', skills: [
    P('bran_pride', '기사의 긍지', st({ def: 1.2, res: 1 }), '물러서지 않는 것이 기사의 도리.'),
    A('bran_shield_charge', '방패 돌진', { cost: 10, cd: 5, color: '#bcd4ff', v: { dmg: [180, 30], r: [260, 30] },
      desc: '성광의 방패를 앞세우고 {r}만큼 돌진해 적을 들이받는다. 위력 {dmg}%, 돌진 중 무적.' }),
    P('bran_divine_ward', '신의 가호', st({ dmgReduce: 1.2, holy: 1, resDark: 1 }), '신의 가호가 치명적인 일격을 비껴가게 한다.'),
    P('bran_oath', '수호의 맹세', st({ hp: 1.2, hpRegen: 1.2 }), '지켜야 할 것이 있는 한 쓰러지지 않는다.'),
    A('bran_aegis', '성역 방벽', { cost: 22, cd: 14, color: '#9ad0ff', v: { t: [3, 0.5], dmg: [70, 12] },
      desc: '전방에 빛의 방벽을 {t}초 동안 세운다. 적의 탄환을 소멸시키고 닿는 적에게 {dmg}% 피해를 준다.' }),
    A('bran_crusade_sword', '성전의 검', { cost: 24, cd: 12, color: '#fff2b0', v: { dmg: [380, 60], r: [150, 20] },
      desc: '하늘에서 거대한 성검을 떨어뜨려 반경 {r}을 강타한다. 위력 {dmg}% 신성 피해.' }),
  ] },
  { id: 'bran_fury', kind: 'class', gate: ['bran_berserker', 'bran_warlord', 'bran_bloodrage'], name: '광전', color: '#ff5a3a',
    desc: '분노를 힘으로 바꾸는 광전사의 비기. 광전사 계열에서 꽃핀다.', skills: [
    P('bran_anger', '분노', st({ atk: 1, crit: 1 }), '끓어오르는 분노가 칼끝에 실린다.'),
    A('bran_warcry', '전투 함성', { cost: 14, cd: 16, color: '#ff4030', v: { t: [3, 0.75], dmg: [60, 10], r: [180, 20] },
      desc: '포효로 반경 {r}의 적을 경직시키고 {dmg}% 피해를 준다. {t}초 동안 광폭화하여 공격력이 두 배가 된다.' }),
    P('bran_bloodthirst', '피의 갈증', st({ lifesteal: 1, atkSpd: 1 }), '베면 벨수록 힘이 차오른다.'),
    P('bran_madness', '광기', st({ moveSpd: 1, atkSpd: 1, critDmg: 1 }), '고통도 두려움도 잊은 광기.'),
    A('bran_warlord_leap', '군주의 진격', { cost: 22, cd: 10, color: '#ffb060', v: { dmg: [320, 50], r: [170, 20] },
      desc: '높이 도약해 전장 한복판에 내리꽂힌다. 반경 {r}의 충격파로 {dmg}% 피해. 도약 중 무적.' }),
    A('bran_blood_frenzy', '피의 광란', { cost: 20, cd: 9, color: '#ff1a2a', v: { dmg: [65, 10], n: [6, 1] },
      desc: '피에 굶주린 대검으로 {n}번 난도질한다. 타격당 {dmg}% 피해, 적중할 때마다 체력을 흡수한다.' }),
  ] },
]);

// ═════════════════════════ 리아 ═════════════════════════
tree('lia', [
  { id: 'lia_assassin_art', kind: 'core', name: '암살술', color: '#ff4a6a', desc: '까마귀 결사가 가르친 침묵의 살법.', skills: [
    A('lia_shadow_step', '그림자 베기', { cost: 7, cd: 3, color: '#ff4a6a', v: { dmg: [200, 35], r: [260, 30] },
      desc: '거리 {r} 안에 있는 적의 등 뒤로 순간이동해 급소를 벤다. 위력 {dmg}%, 반드시 치명타.' }),
    P('lia_vitals', '급소 찌르기', st({ crit: 1.2, critDmg: 1 }), '심장, 목, 힘줄. 칼끝은 언제나 급소를 향한다.'),
    P('lia_lightfoot', '경공', st({ moveSpd: 1, jumpPow: 1, agi: 1 }), '깃털처럼 가볍게, 그림자처럼 빠르게.'),
    A('lia_cross_cut', '십자 비연참', { cost: 12, cd: 5, color: '#ff8aa0', v: { dmg: [140, 24], n: [1, 0.5] },
      desc: '십자로 교차하는 칼바람 {n}쌍을 날린다. 적을 관통하며 {dmg}% 피해.' }),
    P('lia_focus', '암살자의 집중', st({ crit: 1, atkSpd: 1.2 }), '숨소리조차 멎는 완벽한 집중.'),
    P('lia_death_touch', '사신의 손길', st({ critDmg: 1.5, luck: 1, lifesteal: 1 }), '스치기만 해도 목숨이 꺼진다.'),
  ] },
  { id: 'lia_ninjutsu', kind: 'class', gate: ['lia_ninja', 'lia_shadowmaster', 'lia_kunoichi'], name: '인술', color: '#b060ff',
    desc: '동방에서 건너온 비밀스러운 인술. 닌자 계열에서 꽃핀다.', skills: [
    P('lia_ninjutsu_training', '인술 수련', st({ mp: 1, mpRegen: 1 }), '호흡과 인(印)을 다스려 기를 모은다.'),
    A('lia_shuriken', '표창 난무', { cost: 8, cd: 3, color: '#d0d8ff', v: { dmg: [70, 12], n: [3, 1] },
      desc: '회전하는 표창 {n}개를 부채꼴로 던진다. 표창은 적을 꿰뚫고 날아가며 개당 {dmg}% 피해.' }),
    P('lia_ninja_art', '인술 극의', st({ cdr: 1.2, moveSpd: 1 }), '인을 맺는 손이 눈에 보이지 않을 만큼 빨라진다.'),
    P('lia_phantom_step', '환영 보법', st({ agi: 1.2, dmgReduce: 1 }), '맞았다고 생각한 순간, 그곳엔 잔상뿐.'),
    A('lia_shadow_clones', '그림자 분신술', { cost: 22, cd: 11, color: '#b060ff', v: { dmg: [120, 20], n: [3, 0.75] },
      desc: '그림자 분신 {n}명을 불러 적진을 가로지르며 베게 한다. 분신마다 {dmg}% 암흑 피해.' }),
    A('lia_kagerou', '화둔 · 아지랑이', { cost: 20, cd: 9, color: '#ff7a9a', v: { dmg: [90, 15], n: [5, 1] },
      desc: '아지랑이처럼 일렁이는 불꽃 {n}송이를 흩날린다. 불꽃은 적에게 닿으면 터지며 {dmg}% 화염 피해.' }),
  ] },
  { id: 'lia_dance', kind: 'class', gate: ['lia_dancer', 'lia_bladedancer', 'lia_reaper'], name: '칼날 춤', color: '#ffd84a',
    desc: '춤추듯 이어지는 쌍검의 연무. 칼날 무희 계열에서 꽃핀다.', skills: [
    P('lia_rhythm', '무희의 리듬', st({ atkSpd: 1, agi: 1 }), '발끝에서 시작된 리듬이 칼끝으로 흐른다.'),
    A('lia_blade_waltz', '칼날 원무', { cost: 12, cd: 8, color: '#ffd84a', v: { dmg: [45, 8], n: [3, 0.75], t: [3, 0.5] },
      desc: '칼날 {n}자루를 몸 주위에 {t}초 동안 회전시킨다. 닿는 적에게 {dmg}% 피해를 계속 준다.' }),
    P('lia_sword_dance', '연무', st({ critDmg: 1.2, atkSpd: 1 }), '한 번 시작된 춤은 적이 쓰러질 때까지 멈추지 않는다.'),
    P('lia_grace', '우아한 발놀림', st({ moveSpd: 1, dmgReduce: 1.2 }), '적의 칼날 사이를 춤추듯 빠져나간다.'),
    A('lia_thousand_blades', '천검무', { cost: 24, cd: 11, color: '#ffe070', v: { dmg: [55, 9], n: [12, 3] },
      desc: '하늘에서 황금 칼날 {n}자루를 비처럼 쏟아낸다. 칼날마다 {dmg}% 피해.' }),
    A('lia_reaper_scythe', '사신의 낫', { cost: 22, cd: 10, color: '#6affb0', v: { dmg: [300, 50], r: [180, 20] },
      desc: '거대한 영혼의 낫으로 반경 {r}을 휩쓸어 {dmg}% 암흑 피해를 준다. 빈사 상태의 적은 즉시 목숨을 거둔다.' }),
  ] },
]);

// ═════════════════════════ 아젤 ═════════════════════════
tree('azel', [
  { id: 'azel_sword', kind: 'core', name: '검술', color: '#e8e4f0', desc: '귀족의 검술과 인외의 힘이 섞인 아젤만의 검.', skills: [
    A('azel_moon_slash', '월광참', { cost: 7, cd: 2.2, color: '#ffb0c0', v: { dmg: [170, 28], s: [100, 12] },
      desc: '초승달 모양의 검기를 날려 적을 관통한다. 위력 {dmg}%, 검기 크기 {s}%.' }),
    P('azel_swordplay', '검술 숙련', st({ atk: 1, crit: 1 }), '우아하고, 정확하고, 치명적인 검.'),
    P('azel_noble', '귀족의 품격', st({ agi: 1, res: 1, mp: 1 }), '핏줄이 물려준 기품은 싸움에서도 흐트러지지 않는다.'),
    A('azel_phantom_blades', '환영검 난무', { cost: 16, cd: 7, color: '#c8b0ff', v: { dmg: [80, 13], n: [4, 1] },
      desc: '환영의 검 {n}자루를 소환해 적에게 차례로 쏘아 보낸다. 검마다 {dmg}% 피해.' }),
    P('azel_sword_saint', '검성', st({ critDmg: 1.5, atkSpd: 1 }), '검과 하나가 된 자만이 닿는 경지.'),
    P('azel_awakening', '혼혈의 각성', st({ atk: 1.2, mag: 1.2, hp: 1 }), '인간과 흡혈귀, 두 피가 하나로 타오른다.'),
  ] },
  { id: 'azel_blood', kind: 'class', gate: ['azel_vampire', 'azel_nosferatu', 'azel_bloodking'], name: '흡혈', color: '#ff2a4a',
    desc: '아버지에게서 물려받은 피의 힘. 진조의 후예 계열에서 꽃핀다.', skills: [
    P('azel_hunger', '피의 굶주림', st({ lifesteal: 1, hp: 1 }), '피는 곧 생명. 베는 만큼 살아난다.'),
    A('azel_blood_lance', '블러드 스피어', { cost: 12, cd: 5, color: '#ff2040', v: { dmg: [110, 18], n: [4, 1] },
      desc: '땅에서 피의 가시 {n}개를 차례로 솟구치게 한다. 가시마다 {dmg}% 암흑 피해를 주고 체력을 흡수한다.' }),
    P('azel_true_blood', '진조의 피', st({ dark: 1.2, lifesteal: 1 }), '잠들어 있던 진조의 피가 끓어오른다.'),
    P('azel_night_noble', '밤의 귀족', st({ mag: 1, dark: 1, resDark: 1 }), '밤은 언제나 그의 편이다.'),
    A('azel_bat_storm', '박쥐 폭풍', { cost: 20, cd: 10, color: '#c0103a', v: { dmg: [60, 10], n: [8, 2] },
      desc: '박쥐 {n}마리를 풀어 적을 쫓게 한다. 박쥐마다 {dmg}% 암흑 피해를 주고 체력을 흡수한다.' }),
    A('azel_crimson_feast', '혈왕의 연회', { cost: 26, cd: 16, color: '#ff1a2a', v: { dmg: [50, 8], r: [200, 20], t: [2.5, 0.3] },
      desc: '핏빛 달 아래 {t}초 동안 반경 {r} 안의 적에게서 피를 빨아들인다. 타격당 {dmg}% 암흑 피해를 주고, 빨아들인 피로 체력을 회복한다.' }),
  ] },
  { id: 'azel_holysword', kind: 'class', gate: ['azel_holyblade', 'azel_dawnbringer', 'azel_seraph'], name: '성검', color: '#ffe070',
    desc: '어둠의 피를 빛으로 다스리는 성검의 길. 성검사 계열에서 꽃핀다.', skills: [
    P('azel_oath_light', '빛의 서약', st({ holy: 1, res: 1 }), '피에 새긴 서약이 검을 빛으로 물들인다.'),
    A('azel_dawn_rush', '여명 돌격', { cost: 12, cd: 5, color: '#ffe070', v: { dmg: [150, 25], r: [280, 30] },
      desc: '빛이 되어 {r}만큼 돌진한다. 지나간 자리마다 빛의 참격이 연달아 터지며 {dmg}% 신성 피해. 돌진 중 무적.' }),
    P('azel_balance', '빛과 어둠의 균형', st({ holy: 1, dark: 1, mag: 1 }), '두 힘이 맞서지 않고 서로를 떠받친다.'),
    P('azel_blade_ward', '성검의 가호', st({ dmgReduce: 1.2, hpRegen: 1 }), '검에 깃든 빛이 몸을 감싼다.'),
    A('azel_dawnbreaker', '새벽을 여는 검', { cost: 24, cd: 12, color: '#ffd070', v: { dmg: [420, 65], s: [100, 15] },
      desc: '태양처럼 빛나는 거대한 검기로 화면을 가른다. 위력 {dmg}% 신성 피해, 검기 크기 {s}%.' }),
    A('azel_fallen_wings', '타천의 날개', { cost: 22, cd: 10, color: '#d0b0ff', v: { dmg: [70, 12], n: [10, 2] },
      desc: '빛과 어둠의 날개를 펼쳐 깃털 {n}개를 흩날린다. 깃털마다 {dmg}% 신성·암흑 피해.' }),
  ] },
]);

// ═════════════════════════ 이졸데 ═════════════════════════
tree('isolde', [
  { id: 'isolde_lance', kind: 'core', name: '창술', color: '#8ae8ff', desc: '하늘 기사단에 대대로 전해진 창술. 멀리서 꿰뚫고, 하늘에서 내리꽂는다.', skills: [
    A('isolde_piercing_gale', '질풍 찌르기', { cost: 7, cd: 2.4, color: '#8ae8ff', v: { dmg: [160, 26], r: [240, 30] },
      desc: '창끝에서 바람의 창을 쏘아 앞으로 {r}만큼 꿰뚫는다. 지나가는 길의 적 모두에게 {dmg}% 피해.' }),
    P('isolde_spearmanship', '창술 숙련', st({ atk: 1, reach: 1 }), '창은 팔보다 길다. 그 한 뼘이 곧 목숨값이다.'),
    P('isolde_skyborn', '하늘의 아이', st({ jumpPow: 1, agi: 1, moveSpd: 1 }), '하늘 기사단의 아이는 걷는 법보다 뛰어오르는 법을 먼저 배운다.'),
    A('isolde_dragon_dive', '용추락', { cost: 14, cd: 6, color: '#bfe8ff', v: { dmg: [260, 42], r: [130, 15] },
      desc: '높이 뛰어올랐다가 창끝으로 곧장 내리꽂힌다. 착지한 자리에서 반경 {r}의 충격파로 {dmg}% 피해. 하강 중 무적.' }),
    P('isolde_wyvern_heart', '비룡의 심장', st({ critDmg: 1.2, atkSpd: 1 }), '날개를 잃은 용기사의 심장도 여전히 용처럼 뛴다.'),
    P('isolde_last_knight', '마지막 기사', st({ atk: 1.2, hp: 1, def: 1 }), '무너진 기사단의 이름은 이제 그녀 혼자 짊어진다.'),
  ] },
  { id: 'isolde_dragon', kind: 'class', gate: ['isolde_dragoon', 'isolde_stormlord', 'isolde_wyrmknight'], name: '용기사', color: '#9ae0ff',
    desc: '용과 함께 하늘을 날던 기사들의 길. 용기사 계열에서 꽃핀다.', skills: [
    P('isolde_storm_blood', '뇌운의 피', st({ thunder: 1, jumpPow: 1 }), '천둥 치는 밤이면 핏속에서 용의 울음이 들린다.'),
    A('isolde_thunder_lance', '뇌창', { cost: 12, cd: 5, color: '#bfe0ff', v: { dmg: [120, 20], n: [3, 0.5] },
      desc: '번개를 두른 창을 내질러 앞쪽의 적 {n}명에게 차례로 낙뢰를 떨어뜨린다. 낙뢰마다 {dmg}% 번개 피해.' }),
    P('isolde_dragon_scale', '용린 갑주', st({ def: 1, resThunder: 1, resFire: 1 }), '용의 비늘을 덧댄 갑주. 번개도 불꽃도 미끄러져 나간다.'),
    P('isolde_high_jump', '도약 비기', st({ jumpPow: 1.2, critDmg: 1 }), '높이 오를수록 내리꽂는 창은 무거워진다.'),
    A('isolde_storm_dragon', '뇌룡 승천', { cost: 22, cd: 11, color: '#e0f4ff', v: { dmg: [80, 13], n: [6, 1.25] },
      desc: '창을 하늘로 치켜들어 번개의 용을 부른다. 용은 화면을 휘감으며 적 사이를 {n}번 꿰뚫고, 꿰뚫을 때마다 {dmg}% 번개 피해.' }),
    A('isolde_wyrm_breath', '흑룡의 숨결', { cost: 22, cd: 10, color: '#ff7a2a', v: { dmg: [55, 9], t: [1.6, 0.2], r: [260, 20] },
      desc: '창끝에서 흑룡의 불길을 {t}초 동안 뿜어 앞쪽 {r} 안을 태운다. 타격당 {dmg}% 화염·암흑 피해를 주고 체력을 조금 흡수한다.' }),
  ] },
  { id: 'isolde_valkyrie_path', kind: 'class', gate: ['isolde_valkyrie', 'isolde_einherjar', 'isolde_spearsaint'], name: '발키리', color: '#ffd870',
    desc: '전사자의 영혼을 이끄는 빛의 창. 발키리 계열에서 꽃핀다.', skills: [
    P('isolde_valkyrie_oath', '발키리의 맹세', st({ holy: 1, res: 1 }), '쓰러진 이들의 이름을 하나도 잊지 않겠다는 맹세.'),
    A('isolde_javelin', '빛의 투창', { cost: 10, cd: 4, color: '#ffe8a0', v: { dmg: [180, 30], n: [1, 0.5] },
      desc: '빛으로 빚은 투창 {n}자루를 던진다. 투창은 적을 꿰뚫고 날아가 벽이나 바닥에 꽂히며 터진다. 위력 {dmg}% 신성 피해.' }),
    P('isolde_wings_of_valor', '용맹의 날개', st({ moveSpd: 1, dmgReduce: 1 }), '날개는 달아나기 위해서가 아니라 먼저 닿기 위해 있다.'),
    P('isolde_hunt_eye', '창끝의 눈', st({ crit: 1.2, luck: 1 }), '창끝이 겨누는 곳을 눈도 함께 본다.'),
    A('isolde_valhalla', '영웅의 전당', { cost: 24, cd: 14, color: '#fff2b0', v: { dmg: [70, 12], n: [3, 0.5], t: [5, 0.5] },
      desc: '전사자의 영혼 {n}명을 불러 {t}초 동안 함께 싸운다. 영혼은 가까운 적에게 빛의 창을 던져 {dmg}% 신성 피해를 준다.' }),
    A('isolde_thousand_thrusts', '천 번 찌르기', { cost: 20, cd: 9, color: '#ffd0d8', v: { dmg: [32, 5], n: [16, 4] },
      desc: '눈으로 좇을 수 없는 속도로 앞을 {n}번 찌른다. 찌를 때마다 {dmg}% 피해, 마지막 일격은 반드시 치명타.' }),
  ] },
]);

// ─────────────────────────── 시작 스킬 ───────────────────────────
export const STARTER_SKILLS = {
  kael: 'kael_vigilia', sera: 'sera_holy_bolt', victor: 'victor_fanning',
  bran: 'bran_ground_split', lia: 'lia_shadow_step', azel: 'azel_moon_slash',
  isolde: 'isolde_piercing_gale',
};

// ─────────────────────────── 도우미 ───────────────────────────
/** 액티브 수치: v[key] = [기본, 레벨당] → lv 값 */
export function skillVal(id, key, lv) {
  const a = SKILLS[id]?.v?.[key];
  if (!a) return 0;
  return a[0] + a[1] * (Math.max(1, lv) - 1);
}
const INT_KEYS = new Set(['n']);
function fmtVal(key, v) {
  if (INT_KEYS.has(key)) return String(Math.floor(v));
  if (Math.abs(v - Math.round(v)) < 0.05) return String(Math.round(v));
  return v.toFixed(1);
}
function statLine(k, v) {
  const L = STAT_LABEL[k] || [k];
  const num = Math.abs(v - Math.round(v)) < 0.01 ? Math.round(v) : v.toFixed(1);
  return `${L[0]} +${num}${L[1] ? '%' : ''}`;
}

/** 스킬 설명 (lv 반영 수치 포함). lv 0 이면 1레벨 기준 */
export function skillDesc(id, lv = 1) {
  const sk = SKILLS[id];
  if (!sk) return '';
  const L = Math.max(1, Math.min(sk.maxLv, lv || 1));
  let s = (sk.desc || '').replace(/\{(\w+)\}/g, (_, k) => (sk.v?.[k] ? fmtVal(k, skillVal(id, k, L)) : `{${k}}`));
  if (sk.type === 'passive' && sk.stats) {
    const parts = [];
    for (const k in sk.stats) { const a = sk.stats[k]; parts.push(statLine(k, Array.isArray(a) ? a[Math.min(L, a.length) - 1] : a * L)); }
    if (parts.length) s += ` (${parts.join(' · ')})`;
  }
  return s;
}
/** UI용 정보 줄 목록 */
export function skillInfoLines(id, lv) {
  const sk = SKILLS[id];
  if (!sk) return [];
  const out = [skillDesc(id, lv || 1)];
  if (sk.type === 'active') out.push(`MP ${sk.cost} · 재사용 ${sk.cd}초`);
  if (lv > 0 && lv < sk.maxLv) out.push(`다음 레벨: ${skillDesc(id, lv + 1)}`);
  return out;
}

export function skillsOf(charId) { return Object.values(SKILLS).filter((s) => s.charId === charId); }
export function isStarter(hero, id) { return STARTER_SKILLS[hero?.charId] === id; }

/** 이 영웅의 직업 계보에 reqClass 가 포함되는가 */
function hasClass(hero, reqClass) {
  if (!reqClass) return true;
  const list = Array.isArray(reqClass) ? reqClass : [reqClass];
  const chain = classChain(hero.classId);
  return chain.some((c) => list.includes(c.id));
}

/** 배울 수 있는지 판정 → {ok, reason} */
export function canLearn(hero, id) {
  const sk = SKILLS[id];
  if (!sk || !hero) return { ok: false, reason: '알 수 없는 스킬' };
  if (sk.charId !== hero.charId) return { ok: false, reason: '다른 캐릭터의 스킬' };
  const cur = hero.skills?.[id] ?? 0;
  if (cur >= sk.maxLv) return { ok: false, reason: '최고 레벨 달성' };
  if (!hasClass(hero, sk.reqClass)) {
    const list = Array.isArray(sk.reqClass) ? sk.reqClass : [sk.reqClass];
    return { ok: false, reason: `전직 필요: ${list.map((c) => CLASSES[c]?.name ?? c).join('/')}` };
  }
  const needLv = sk.reqLevel + cur * 2; // 레벨을 올릴수록 요구 레벨도 조금씩 상승
  if ((hero.level ?? 1) < needLv) return { ok: false, reason: `레벨 ${needLv} 필요` };
  for (const r of sk.req || []) {
    if (!(hero.skills?.[r] > 0)) return { ok: false, reason: `선행 스킬: ${SKILLS[r]?.name ?? r}` };
  }
  const cost = sk.spCost ?? 1;
  if ((hero.sp ?? 0) < cost) return { ok: false, reason: `스킬 포인트 ${cost} 필요` };
  return { ok: true, cost };
}

/** 스킬 습득/레벨업. 새 액티브는 빈 슬롯에 자동 장착. 반환 {ok, reason, level} */
export function learnSkill(hero, id) {
  const chk = canLearn(hero, id);
  if (!chk.ok) return chk;
  const sk = SKILLS[id];
  hero.skills ??= {};
  hero.slots ??= [null, null, null, null];
  hero.sp -= chk.cost;
  const lv = (hero.skills[id] ?? 0) + 1;
  hero.skills[id] = lv;
  if (lv === 1 && sk.type === 'active' && !hero.slots.includes(id)) {
    const i = hero.slots.indexOf(null);
    if (i >= 0) hero.slots[i] = id;
  }
  return { ok: true, level: lv };
}

/** 스킬 슬롯 장착 (slot 0~3). 같은 스킬이 다른 슬롯에 있으면 자리를 바꾼다 */
export function equipSkill(hero, slot, id) {
  hero.slots ??= [null, null, null, null];
  if (id && (!SKILLS[id] || SKILLS[id].type !== 'active' || !(hero.skills?.[id] > 0))) return false;
  const j = id ? hero.slots.indexOf(id) : -1;
  if (j >= 0) hero.slots[j] = hero.slots[slot] ?? null;
  hero.slots[slot] = id ?? null;
  return true;
}

/** 초기화: 사용한 SP 환급(시작 스킬 1레벨은 무료라 유지). 반환: 환급 SP */
export function resetSkills(hero) {
  let refund = 0;
  const starter = STARTER_SKILLS[hero.charId];
  for (const id in hero.skills || {}) {
    const sk = SKILLS[id];
    const lv = hero.skills[id] ?? 0;
    const free = id === starter ? 1 : 0;
    refund += Math.max(0, lv - free) * (sk?.spCost ?? 1);
  }
  hero.skills = {};
  hero.slots = [null, null, null, null];
  if (starter) { hero.skills[starter] = 1; hero.slots[0] = starter; }
  hero.sp = (hero.sp ?? 0) + refund;
  return refund;
}
