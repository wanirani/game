// 난이도 5단계
// enemyHp/enemyAtk: 적 체력·공격력 배율, enemySpeed: 적 이동/공격 속도, aggro: AI 공격 빈도 배율
// exp/gold/drop: 보상 배율, enhanceBonus: 강화 성공률 가산(%p), lives: 시작 목숨, continues: 스테이지당 컨티뉴
// healDrop: 회복 아이템 드롭 배율, elite: 정예 몬스터 출현 확률, scoreMult: 점수 배율
export const DIFFICULTIES = [
  {
    id: 'easy', name: '견습 헌터', eng: 'APPRENTICE', color: '#7ee07e',
    desc: '처음 악마성에 발을 들이는 이를 위한 난이도. 적이 약하고 회복 아이템이 넉넉합니다.',
    enemyHp: 0.6, enemyAtk: 0.5, enemySpeed: 0.85, aggro: 0.7,
    exp: 1.0, gold: 1.0, drop: 1.1, enhanceBonus: 10, lives: 5, continues: 99,
    healDrop: 1.6, elite: 0.0, scoreMult: 0.5, bossHp: 0.65,
  },
  {
    id: 'normal', name: '숙련 헌터', eng: 'HUNTER', color: '#e8c872', // 카엘의 기본 직업 '헌터'와 구분
    desc: '표준 난이도. 악마성 본연의 긴장감을 즐길 수 있습니다.',
    enemyHp: 1.0, enemyAtk: 1.0, enemySpeed: 1.0, aggro: 1.0,
    exp: 1.0, gold: 1.0, drop: 1.0, enhanceBonus: 0, lives: 3, continues: 9,
    healDrop: 1.0, elite: 0.04, scoreMult: 1.0, bossHp: 1.0,
  },
  {
    id: 'hard', name: '베테랑', eng: 'VETERAN', color: '#ffa640',
    desc: '적이 더 단단하고 공격적입니다. 정예 몬스터가 자주 나타납니다.',
    enemyHp: 1.45, enemyAtk: 1.4, enemySpeed: 1.1, aggro: 1.25,
    exp: 1.25, gold: 1.2, drop: 1.15, enhanceBonus: 0, lives: 3, continues: 5,
    healDrop: 0.8, elite: 0.1, scoreMult: 1.5, bossHp: 1.4,
  },
  {
    id: 'nightmare', name: '악몽', eng: 'NIGHTMARE', color: '#ff4a5a',
    desc: '악몽 같은 밤. 적의 공격 패턴이 강화되고 실수 하나가 치명적입니다.',
    enemyHp: 2.1, enemyAtk: 2.0, enemySpeed: 1.2, aggro: 1.5,
    exp: 1.6, gold: 1.5, drop: 1.35, enhanceBonus: -3, lives: 2, continues: 3,
    healDrop: 0.6, elite: 0.18, scoreMult: 2.5, bossHp: 2.0,
  },
  {
    id: 'inferno', name: '지옥', eng: 'INFERNO', color: '#c07cff',
    desc: '진정한 악마성. 모든 적이 광폭화하고 보스는 새 패턴을 사용합니다. 전설의 헌터만 도전하십시오.',
    enemyHp: 3.0, enemyAtk: 3.0, enemySpeed: 1.3, aggro: 1.8,
    exp: 2.2, gold: 2.0, drop: 1.6, enhanceBonus: -5, lives: 1, continues: 1,
    healDrop: 0.4, elite: 0.3, scoreMult: 4.0, bossHp: 2.8,
  },
];
export const DIFF = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));
export function getDiff(id) { return DIFF[id] || DIFF.normal; }
