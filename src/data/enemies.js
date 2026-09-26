// [임시 최소 구현] 적 담당이 전면 확장 (스키마는 game/enemy.js 상단 주석 참고)
export const ENEMIES = {
  bat: { id: 'bat', name: '흡혈 박쥐', lv: 1, hp: 10, atk: 7, def: 0, exp: 3, gold: [1, 3], score: 100, size: { w: 30, h: 22 }, ai: 'bat', render: 'bat', flying: true, speed: 110, material: 'flesh', weak: ['holy', 'fire'], drops: [{ id: 'heart', p: 0.2 }] },
  skeleton: { id: 'skeleton', name: '해골 병사', lv: 1, hp: 32, atk: 9, def: 2, exp: 6, gold: [2, 6], score: 200, size: { w: 30, h: 80 }, ai: 'walker', aiParams: { atkRange: 70, reach: 60 }, render: 'skeleton', speed: 60, material: 'bone', weak: ['holy'], drops: [] },
  zombie: { id: 'zombie', name: '구울', lv: 1, hp: 26, atk: 8, def: 1, exp: 5, gold: [1, 4], score: 150, size: { w: 32, h: 78 }, ai: 'zombie', aiParams: { attack: false }, render: 'zombie', speed: 45, material: 'flesh', weak: ['fire', 'holy'], drops: [{ id: 'food', p: 0.05 }] },
};
