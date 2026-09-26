// 보스 데이터 A (1~7장). 스키마: game/bosses/boss.js 상단 주석
export const BOSSES_A = {
  b_nightwing: { id: 'b_nightwing', name: '나이트윙', title: '밤하늘의 흡혈 박쥐왕', hp: 900, atk: 22, def: 4, exp: 400, score: 20000, size: { w: 150, h: 110 }, flying: true, material: 'flesh', weak: ['holy', 'fire'], phases: [0.6, 0.3], music: 'boss', portrait: 'portraits/b_nightwing', stageId: 's01', drops: [] },
};
