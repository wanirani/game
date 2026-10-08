// 각성기(초필살기) 데이터 — owner: AWAKEN-CORE (feel.md §6.1, §6.4, §6.5; MASTER_PLAN §1.4, §1.13, §1.14)
// 순수 데이터 모듈: import 없음. 읽는 쪽: game/awaken.js(규칙·감독), scenes/awaken_cutin.js(컷인), 각성 감독(AWAKEN-DIR-A/B),
// render/feel_hud.js(게이지 문구), 메뉴(직업 탭의 진 각성 설명).
//
// AWAKEN[charId] = {
//   name       각성기 이름 (컷인이 끝날 때 '각성 — {name}' 제목으로 찍힌다)
//   line       시그니처 대사 (전체 문장; 컷인이 실제로 찍는 글자는 lines.join(' ') 과 같다)
//   lines      컷인 줄바꿈: 앞줄들은 작게(도입), 마지막 줄은 크게(결정타) — feel §6.3 '대시·쉼표에서 줄바꿈'
//   seal       붉은 낙관의 한자 (BN Seal 글꼴에 있는 글자만: 狩 聖 銃 鐵 鴉 血 龍)
//   cutin      컷인 일러스트 (assets/cg/cutin_<id>.webp, 1600×637)   portrait  일러스트가 없을 때 쓰는 초상 (2:3)
//   face, eye  일러스트 안의 얼굴 중심·눈 위치 (0..1, tools/kling/cutin_anchors.json 에서 옮김)
//   portraitFace  초상으로 대신할 때의 얼굴 중심 (0..1)
//   color      영웅 색 (띠의 윗줄무늬·집중선·글자 광채)   dark  띠 오른쪽 바탕색   accent  보조 색 (아래 금줄 옆·낙관 테두리·섬광)
//   cue        감독이 시작할 때 울리는 효과음 {name, pitch}
//   style      감독이 준비되기 전 대체 연출의 모양 ('lash'|'pillar'|'shot'|'cleave'|'blink'|'crescent')
//   ultMv      지금 필살기의 총 모션 배율 (skills.js ULTS 기준 추정치) → 각성 총량 = ultMv × RULES.mvMul (2차 전직 × RULES.t2Mul)
//   mvWeights  타격별 상대 가중치 (feel §6.4 표의 MV 열 순서). awaken.js 가 합이 목표 총량이 되도록 정규화한다
//   final      마지막 일격 가중치의 위치 설명 (mvWeights 의 마지막 값이 마무리 일격: class A, final: true)
//   t2         2차 전직(진 각성) 변형: 클래스 id → T2[클래스] 참고
// }
// 컷인 한글은 붓글씨(BN Brush)로 그린다 → 새 글자를 넣으면 tools/fonts/build_fonts.py --check 로 글꼴에 있는지 확인한다.

/** 각성 규칙 수치 (feel §6.1–6.3, §7; MASTER_PLAN §1.4, §1.14) */
export const AWAKEN_RULES = Object.freeze({
  minTier: 1,          // 1차 전직(Lv10)부터
  gaugeMax: 100,       // world.run.aw 가득
  spNeed: 100,         // world.run.sp 도 가득 있어야 한다 (둘 다 소모)
  tapMax: 0.20,        // 이보다 짧게 누르고 떼면 일반 필살기 (뗄 때 발동)
  holdFull: 0.45,      // 이만큼 누르고 있으면 각성 (0.20~0.45 사이에 떼면 취소)
  ring: { r: 52, w: 4 },           // 길게 누르기 고리 (월드 좌표, 영웅 중심)
  edgeDark: 0.3,                   // 누르는 동안 화면 가장자리 어두움 최대
  mvMul: 2.2,          // 각성 총 MV = 필살기 총 MV × 2.2
  t2Mul: 1.15,         // 2차 전직(진 각성) 추가 배율
  t3Mul: 1.25,         // 초월·비전(초월 각성·비전 각성) 배율 — 2차 배율 대신 (classes_t3 §7.2)
  bossCap: 0.30,       // 각성 한 번으로 보스에게 줄 수 있는 최대 피해 (최대 HP 비율)
  bossCapSpare: 0.02,  // 상한을 넘긴 타격(각 1 피해, '저항')이 30% 를 넘지 않도록 남겨 두는 몫 (최대 HP 비율, 최대 80)
  cutin: { full: 1.45, short: 0.75, skipAfter: 0.5 },
  maxDirector: 7,      // 감독 연출 안전 상한(초): 이보다 길면 강제로 끝낸다 (소프트락 방지)
});

/** 영웅별 각성기 (feel §6.4) */
export const AWAKEN = {
  kael: {
    name: '비질리아 — 여명의 처형식',
    line: '발크레인의 이름으로 명한다 — 밤이여, 끝나라!',
    lines: ['발크레인의 이름으로 명한다 —', '밤이여, 끝나라!'],
    seal: '狩',
    cutin: 'cg/cutin_kael', portrait: 'portraits/kael',
    face: [0.62, 0.4], eye: [0.645, 0.291], portraitFace: [0.5, 0.3],
    color: '#fff2b0', dark: '#2a0a0e', accent: '#8a1426',
    cue: { name: 'whip_crack', pitch: 0.8 },
    style: 'lash',
    ultMv: 8.3,
    mvWeights: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 6.0],   // 채찍 8연격 + 여명의 대폭발
    final: '거대한 빛의 십자가 폭발 (띄우기)',
    t2: ['kael_templar', 'kael_inquisitor', 'kael_bloodhunter', 'kael_nightraven'],
  },
  sera: {
    name: '천상의 문 — 세라핌 레퀴엠',
    line: '주여, 이 손에 심판의 권능을 허락하소서.',
    lines: ['주여, 이 손에 심판의 권능을', '허락하소서.'],
    seal: '聖',
    cutin: 'cg/cutin_sera', portrait: 'portraits/sera',
    face: [0.62, 0.4], eye: [0.649, 0.332], portraitFace: [0.5, 0.3],
    color: '#fff8d0', dark: '#1c2440', accent: '#c8a24a',
    cue: { name: 'choir_gate', pitch: 1 },
    style: 'pillar',
    ultMv: 8.5,
    mvWeights: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 5.5],   // 심판의 기둥 7개 (각 3연타 0.2) + 심판의 십자광
    final: '천상의 문에서 내리꽂히는 심판의 십자광 (띄우기)',
    t2: ['sera_saint', 'sera_oracle', 'sera_archmage', 'sera_stormcaller'],
  },
  victor: {
    name: '실버 레퀴엠 — 여섯 발의 장송곡',
    line: '여섯 발이면 충분해. 지옥에서 세어 봐라.',
    lines: ['여섯 발이면 충분해.', '지옥에서 세어 봐라.'],
    seal: '銃',
    cutin: 'cg/cutin_victor', portrait: 'portraits/victor',
    face: [0.62, 0.4], eye: [0.644, 0.299], portraitFace: [0.5, 0.3],
    color: '#ffd070', dark: '#2a0c08', accent: '#7a1a1a',
    cue: { name: 'cylinder_spin', pitch: 1 },
    style: 'shot',
    ultMv: 8.4,
    mvWeights: [1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1.5],   // 은탄 6발 (각 도탄 3회 0.35) + 표식 동시 폭발
    final: '모든 표식이 한꺼번에 터진다',
    t2: ['victor_phantom', 'victor_executioner', 'victor_hellfire', 'victor_gunlord'],
  },
  bran: {
    name: '철심 해방 — 기사단의 진혼가',
    line: '쓰러진 형제들이여, 이 검에 깃들어라!',
    lines: ['쓰러진 형제들이여,', '이 검에 깃들어라!'],
    seal: '鐵',
    cutin: 'cg/cutin_bran', portrait: 'portraits/bran',
    face: [0.62, 0.4], eye: [0.641, 0.32], portraitFace: [0.5, 0.3],
    color: '#ffb060', dark: '#141c38', accent: '#2a3a6a',
    cue: { name: 'war_horn', pitch: 1 },
    style: 'cleave',
    ultMv: 9.4,
    mvWeights: [4.0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 4.0],   // 거대 내려베기 + 망령 기사 돌격 6회 + 빛의 대검
    final: '갈라진 대지에 떨어지는 거대한 빛의 검 (띄우기)',
    t2: ['bran_guardian', 'bran_crusader', 'bran_warlord', 'bran_bloodrage'],
  },
  lia: {
    name: '흑우 — 까마귀의 장례',
    line: '까마귀가 울면, 누군가는 눈을 감는다.',
    lines: ['까마귀가 울면,', '누군가는 눈을 감는다.'],
    seal: '鴉',
    cutin: 'cg/cutin_lia', portrait: 'portraits/lia',
    face: [0.66, 0.46], eye: [0.682, 0.365], portraitFace: [0.5, 0.3],
    color: '#ff4a6a', dark: '#141018', accent: '#b0102a',
    cue: { name: 'crow_caw', pitch: 1 },
    style: 'blink',
    ultMv: 9.0,
    mvWeights: [0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 0.36, 4.5],   // 순간이동 12회 (각 3연타 0.12) + 지연 피해 (확정 치명)
    final: '쌓인 모든 베기 자국이 한꺼번에 터진다 (확정 치명타)',
    t2: ['lia_shadowmaster', 'lia_kunoichi', 'lia_bladedancer', 'lia_reaper'],
  },
  azel: {
    name: '크림슨 이클립스 — 진조 해방',
    line: '이 저주받은 피로 — 당신의 밤을 끝내겠다, 아버지.',
    lines: ['이 저주받은 피로 —', '당신의 밤을 끝내겠다,', '아버지.'],
    seal: '血',
    cutin: 'cg/cutin_azel', portrait: 'portraits/azel',
    face: [0.581, 0.411], eye: [0.575, 0.355], portraitFace: [0.5, 0.3],
    color: '#ff2a4a', dark: '#141018', accent: '#6a0014',
    cue: { name: 'bell', pitch: 0.5 },
    style: 'crescent',
    ultMv: 8.6,
    mvWeights: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 5.0],   // 피의 초승달 9개 + 손가락 튕기기 뒤 일제 폭발
    final: '모든 초승달이 피의 비로 터지고 체력을 20% 회복한다',
    heal: 0.2,
    t2: ['azel_nosferatu', 'azel_bloodking', 'azel_dawnbringer', 'azel_seraph'],
  },
  isolde: {
    name: '천룡 귀환 — 하늘 기사단의 마지막 비행',
    line: '빼앗긴 하늘이여 — 이 창끝에서 다시 포효하라!',
    lines: ['빼앗긴 하늘이여 —', '이 창끝에서', '다시 포효하라!'],
    seal: '龍',
    cutin: 'cg/cutin_isolde', portrait: 'portraits/isolde',
    face: [0.62, 0.4], eye: [0.641, 0.355], portraitFace: [0.5, 0.3],
    color: '#8ae8ff', dark: '#0c1428', accent: '#2a4a8a',
    cue: { name: 'thunderclap', pitch: 0.9 },
    style: 'pillar',
    ultMv: 8.8,
    mvWeights: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 5.0],   // 번개의 용과 번갈아 내리꽂는 급강하 찌르기 7회 + 천룡의 일격
    final: '용과 하나가 되어 수직으로 내리꽂히는 천룡의 일격 (띄우기)',
    t2: ['isolde_stormlord', 'isolde_wyrmknight', 'isolde_einherjar', 'isolde_spearsaint'],
  },
};

/** 각성 영웅 순서 (갤러리·테스트용) */
export const AWAKEN_IDS = Object.keys(AWAKEN);

/**
 * 2차 전직 '진 각성' 변형 (feel §6.4 T2 variants, 색은 §5.2 직업 강조색).
 * label/desc 는 메뉴·툴팁에 보여 줄 한국어, 나머지는 감독이 읽는 효과 값:
 *   heal(최대 HP 비율) lifesteal(피해 비율) dot{element,t,mv} slow{mul,t} elements[] element chain pierce execute(체력 비율)
 *   shots invuln(초) comboDmg(콤보 10마다 피해 비율) healPerKill critDmg(%) + 연출 깃발(sigil crows clones petals vortex scythe bats sunrise dualWing)
 */
export const T2 = {
  // 카엘
  kael_templar: { label: '성전의 방패', desc: '방패 인장이 새겨지고 체력을 10% 회복한다.', color: '#fff2b0', accent: '#e8c872', heal: 0.1, sigil: 'shield' },
  kael_inquisitor: { label: '심판의 화형', desc: '빛의 우리가 불타올라 3초 동안 화염 피해를 준다.', color: '#ffb060', accent: '#ff7a2a', dot: { element: 'fire', t: 3, mv: 0.15 } },
  kael_bloodhunter: { label: '핏빛 채찍', desc: '채찍이 핏빛으로 물들고 입힌 피해의 5%를 흡혈한다.', color: '#ff5a6a', accent: '#c0142a', lifesteal: 0.05 },
  kael_nightraven: { label: '까마귀 떼', desc: '채찍이 지나간 길을 따라 까마귀 떼가 날아든다.', color: '#c8c8ff', accent: '#6a6aff', crows: true },
  // 세라
  sera_saint: { label: '성녀의 후광', desc: '후광이 빛나며 체력을 20% 회복한다.', color: '#fff8d0', accent: '#ffe7a0', heal: 0.2, halo: true },
  sera_oracle: { label: '멈춰 선 시간', desc: '각성이 끝난 뒤 3초 동안 적이 절반 속도로 움직인다.', color: '#d8f0ff', accent: '#8ac8ff', slow: { mul: 0.5, t: 3 } },
  sera_archmage: { label: '삼원소의 기둥', desc: '심판의 기둥이 화염·냉기·번개로 번갈아 내리친다.', color: '#ffd0a0', accent: '#ff7a2a', elements: ['fire', 'ice', 'thunder'] },
  sera_stormcaller: { label: '뇌정의 기둥', desc: '번개 기둥이 내리치고 번개가 적과 적 사이를 잇는다.', color: '#e0f0ff', accent: '#bfe0ff', element: 'thunder', chain: true },
  // 빅터
  victor_phantom: { label: '유령탄', desc: '은탄이 모든 것을 꿰뚫으며 푸른 궤적을 남긴다.', color: '#c8d4ff', accent: '#9ab0ff', pierce: true },
  victor_executioner: { label: '처형', desc: '표식이 새겨진 일반 적 중 체력이 25% 미만인 적을 즉시 처형한다.', color: '#ff8a90', accent: '#ff2030', execute: 0.25 },
  victor_hellfire: { label: '지옥불 탄환', desc: '표식이 화염과 함께 폭발한다.', color: '#ffb060', accent: '#ff7a2a', element: 'fire' },
  victor_gunlord: { label: '쌍권총 난사', desc: '두 자루 권총으로 열두 발을 쏜다.', color: '#fff0a0', accent: '#ffd84a', shots: 12 },
  // 브란
  bran_guardian: { label: '수호의 방벽', desc: '방패 결계가 펼쳐져 각성이 끝난 뒤 3초 동안 무적이 된다.', color: '#fff2b0', accent: '#5a8aff', invuln: 3 },
  bran_crusader: { label: '성전의 파도', desc: '신성한 십자 파동이 적을 휩쓴다.', color: '#fff2b0', accent: '#e8c872', element: 'holy' },
  bran_warlord: { label: '불꽃 군기', desc: '불타는 군기가 펄럭이고 콤보 10마다 피해가 2%씩 오른다.', color: '#ffa060', accent: '#ff5020', comboDmg: 0.02 },
  bran_bloodrage: { label: '피의 격노', desc: '피의 분노로 입힌 피해의 10%를 흡혈한다.', color: '#ff6a6a', accent: '#ff1a2a', lifesteal: 0.1 },
  // 리아
  lia_shadowmaster: { label: '그림자 분신', desc: '그림자 분신이 모든 순간이동을 따라 벤다.', color: '#d8b0ff', accent: '#b060ff', clones: true },
  lia_kunoichi: { label: '진홍 꽃보라', desc: '진홍빛 꽃잎이 폭풍처럼 흩날린다.', color: '#ffb0c0', accent: '#ff7a9a', petals: true },
  lia_bladedancer: { label: '황금 칼날 소용돌이', desc: '황금 칼날이 소용돌이친다.', color: '#fff0a0', accent: '#ffd84a', vortex: true },
  lia_reaper: { label: '사신의 낫', desc: '마지막에 영혼의 낫이 휩쓸고, 처치할 때마다 체력을 3% 회복한다.', color: '#b0ffd8', accent: '#6affb0', scythe: true, healPerKill: 0.03 },
  // 아젤
  azel_nosferatu: { label: '박쥐 떼', desc: '박쥐 떼가 소용돌이치며 적을 집어삼킨다.', color: '#ff6a8a', accent: '#b0103a', bats: true },
  azel_bloodking: { label: '피의 왕관', desc: '피의 왕관이 떠올라 이번 각성의 치명타 피해가 50% 오른다.', color: '#ff6a6a', accent: '#ff1a2a', critDmg: 50, crown: true },
  azel_dawnbringer: { label: '여명', desc: '일식이 황금빛 해돋이로 바뀌고 초승달이 신성한 금빛이 된다.', color: '#fff0b0', accent: '#ffd070', element: 'holy', sunrise: true },
  azel_seraph: { label: '빛과 어둠의 날개', desc: '흰 날개와 검은 날개가 펼쳐지고 두 빛깔의 초승달이 교차한다.', color: '#e8d8ff', accent: '#b98cff', dualWing: true },
  // 이졸데
  isolde_stormlord: { label: '뇌룡의 폭풍', desc: '내리꽂을 때마다 번개가 적과 적 사이를 잇는다.', color: '#e0f4ff', accent: '#bfe0ff', element: 'thunder', chain: true },
  isolde_wyrmknight: { label: '흑룡의 겁화', desc: '용이 검은 불꽃으로 타올라 3초 동안 화염 피해를 남기고, 입힌 피해의 5%를 흡혈한다.', color: '#ffb070', accent: '#ff6a2a', dot: { element: 'fire', t: 3, mv: 0.15 }, lifesteal: 0.05, wyrm: true },
  isolde_einherjar: { label: '발할라의 날개', desc: '전사자의 영혼들이 함께 내리꽂히고, 각성이 끝난 뒤 2초 동안 무적이 된다.', color: '#fff2b0', accent: '#ffd84a', element: 'holy', invuln: 2, spirits: true },
  isolde_spearsaint: { label: '천 개의 창', desc: '하늘에서 빛의 창이 비처럼 쏟아지고 이번 각성의 치명타 피해가 40% 오른다.', color: '#ffd0d8', accent: '#d02040', critDmg: 40, spears: true },
};

/** 진 각성 이름 앞에 붙는 말 (2차 전직) */
export const T2_PREFIX = '진 각성';
/** 초월(3차) · 비전(숨은 직업) 각성 제목 앞말 (classes_t3 §7.2) */
export const T3_PREFIX = '초월 각성';
export const HIDDEN_PREFIX = '비전 각성';
/** 일반(1차 전직) 각성 제목 앞말 */
export const TITLE_PREFIX = '각성';

/** charId → 각성 데이터 (없으면 null) */
export function awakenOf(charId) { return AWAKEN[charId] ?? null; }
/** classId → 진 각성 변형 (1차 전직이거나 없으면 null) */
export function t2Of(classId) { return T2[classId] ?? null; }
/** 단계별 제목 앞말: 1 '각성' · 2 '진 각성' · 3 '초월 각성' (kind 'hidden' 이면 '비전 각성') */
export function awakenPrefix(tier = 1, kind = null) {
  return tier >= 3 ? (kind === 'hidden' ? HIDDEN_PREFIX : T3_PREFIX) : tier >= 2 ? T2_PREFIX : TITLE_PREFIX;
}
/** 컷인 끝 제목: '각성 — {name}' (2차 '진 각성', 초월 '초월 각성', 비전 '비전 각성') */
export function awakenTitle(charId, tier = 1, kind = null) {
  const a = AWAKEN[charId];
  return a ? `${awakenPrefix(tier, kind)} — ${a.name}` : '';
}

const r4 = (x) => Math.round(x * 1e4) / 1e4;
/**
 * 초월 각성 상한 규칙 (classes_t3 §7.2): 2차 진 각성 변형 → 새 객체 (원본은 건드리지 않는다; 순수 함수).
 * heal ×1.5 · lifesteal ×1.5 · dot.t +1, dot.mv ×1.33 · slow.mul −0.1, slow.t +1 · invuln +1 · critDmg +20 · comboDmg +0.01 ·
 * shots +4 · execute +0.05 · healPerKill +0.01. 연출 깃발·이름·색은 그대로. 비전 각성은 이 결과를 그대로 쓰고,
 * 초월 28 의 표 값(ascensions.js awaken)은 이 상한 안에 있다 (tools/test_ascension.mjs)
 */
export function T3_BOOST(base) {
  if (!base || typeof base !== 'object') return null;
  const o = { ...base };
  if (Array.isArray(base.elements)) o.elements = [...base.elements];
  if (Number.isFinite(base.heal)) o.heal = r4(base.heal * 1.5);
  if (Number.isFinite(base.lifesteal)) o.lifesteal = r4(base.lifesteal * 1.5);
  if (base.dot) o.dot = { ...base.dot, t: r4((base.dot.t ?? 0) + 1), mv: r4((base.dot.mv ?? 0) * 1.33) };
  if (base.slow) o.slow = { ...base.slow, mul: r4((base.slow.mul ?? 1) - 0.1), t: r4((base.slow.t ?? 0) + 1) };
  if (Number.isFinite(base.invuln)) o.invuln = r4(base.invuln + 1);
  if (Number.isFinite(base.critDmg)) o.critDmg = r4(base.critDmg + 20);
  if (Number.isFinite(base.comboDmg)) o.comboDmg = r4(base.comboDmg + 0.01);
  if (Number.isFinite(base.shots)) o.shots = Math.round(base.shots + 4);
  if (Number.isFinite(base.execute)) o.execute = r4(base.execute + 0.05);
  if (Number.isFinite(base.healPerKill)) o.healPerKill = r4(base.healPerKill + 0.01);
  return o;
}

/**
 * 초월·비전 각성 변형 (game/awaken.js makeContext 가 쓴다; 순수). classId = 지금 2차 id, asc = ascensions.js 항목 또는 null.
 *  · asc 없음 → T2[classId] 그대로 · 초월(t3) → T2 위에 asc.awaken 수치 (색·강조색 키는 무시: 감독의 미리 굽기 색이 그대로 맞다)
 *  · 비전(hidden) 또는 awaken 표가 없는 항목 → T3_BOOST(T2[classId]) (label·desc 는 2차 그대로)
 */
export function ascAwakenOf(classId, asc = null) {
  const base = T2[classId] ?? null;
  if (!base || !asc) return base;
  if (asc.kind !== 't3' || !asc.awaken) return T3_BOOST(base);
  const ov = { ...asc.awaken };
  delete ov.color; delete ov.accent;
  if (ov.dot) ov.dot = { ...ov.dot };
  if (ov.slow) ov.slow = { ...ov.slow };
  return { ...base, ...ov };
}
