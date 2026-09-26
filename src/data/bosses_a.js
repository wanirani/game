// 보스 데이터 A (1~7장). 스키마: game/bosses/boss.js 상단 주석
// hp/atk 는 레벨 1 기준값 (스테이지 레벨·난이도 bossHp 로 배율). size = 몸통 판정 크기 (그림은 더 큼)
// deathColor/deathFx: 사망 연쇄 폭발 색·파티클 (game/bosses/a_common.js)
export const BOSSES_A = {
  b_nightwing: {
    id: 'b_nightwing', name: '나이트윙', title: '밤하늘의 흡혈 박쥐왕', hp: 900, atk: 20, def: 4, res: 4, exp: 400, score: 20000,
    size: { w: 96, h: 112 }, flying: true, contact: 0.7, material: 'flesh', weak: ['holy', 'fire'], resist: ['dark'],
    phases: [0.6, 0.3], music: 'boss', portrait: 'portraits/b_nightwing', stageId: 's01', drops: ['u_nightwing'],
    light: { r: 230, color: '#ff3050', i: 0.7 }, deathColor: '#ff4060', deathFx: 'blood',
    intro: '…피 냄새가 진동하는구나. 오늘 밤의 만찬은 네 녀석이다.',
    desc: '불타는 마을 하늘을 뒤덮은 거대 흡혈 박쥐의 군주. 음파로 먹잇감의 방향 감각을 빼앗고 무리를 부른다.',
  },
  b_banshee: {
    id: 'b_banshee', name: '밴시 여왕', title: '통곡하는 묘지의 여왕', hp: 950, atk: 21, def: 2, res: 10, exp: 480, score: 24000,
    size: { w: 86, h: 178 }, flying: true, contact: 0.7, material: 'ghost', weak: ['holy', 'fire'], resist: ['dark', 'ice'],
    phases: [0.6, 0.3], music: 'boss', portrait: 'portraits/b_banshee', stageId: 's02', drops: ['u_banshee'],
    light: { r: 260, color: '#5affd0', i: 0.75 }, deathColor: '#8affe0', deathFx: 'soul',
    intro: '아아… 또 한 사람이 이 언덕에 묻히러 왔구나.',
    desc: '안개의 묘지를 떠도는 원혼들의 여왕. 그 통곡을 들은 자는 사흘 안에 무덤에 눕는다고 한다.',
  },
  b_dullahan: {
    id: 'b_dullahan', name: '둘라한', title: '목 없는 흑기사', hp: 1100, atk: 23, def: 10, res: 6, exp: 560, score: 28000,
    size: { w: 150, h: 158 }, contact: 0.8, material: 'metal', weak: ['holy', 'thunder'], resist: ['dark'],
    phases: [0.6, 0.3], music: 'boss2', portrait: 'portraits/b_dullahan', stageId: 's03', drops: ['u_dullahan'],
    light: { r: 210, color: '#8ab8ff', i: 0.7 }, deathColor: '#9ac8ff', deathFx: 'soul',
    intro: '(목 없는 기사가 불타는 제 머리를 높이 치켜든다.)',
    desc: '성문을 지키는 목 없는 기사. 유령마를 타고 돌진하며, 불타는 제 머리를 던져 침입자를 쫓는다.',
  },
  b_crimson: {
    id: 'b_crimson', name: '진홍의 갑주군주', title: '피로 달궈진 살아있는 갑옷', hp: 1250, atk: 25, def: 16, res: 8, exp: 640, score: 32000,
    size: { w: 116, h: 196 }, contact: 0.8, material: 'metal', weak: ['thunder', 'ice'], resist: ['fire', 'dark'],
    phases: [0.6, 0.3], music: 'boss', portrait: 'portraits/b_crimson', stageId: 's04', drops: ['u_crimson'],
    light: { r: 220, color: '#ff5a2a', i: 0.8 }, deathColor: '#ff7a3a', deathFx: 'ember',
    intro: '(텅 빈 투구 속에서 검붉은 불꽃이 타오른다.)',
    desc: '대회랑을 지키는 진홍빛 거대 갑옷. 안에는 사람 대신 피로 달궈진 암흑의 불꽃이 들어차 있다.',
  },
  b_bonedragon: {
    id: 'b_bonedragon', name: '본 드래곤', title: '카타콤을 휘감은 해골룡', hp: 1300, atk: 26, def: 12, res: 10, exp: 720, score: 36000,
    size: { w: 92, h: 78 }, flying: true, contact: 0.8, material: 'bone', weak: ['holy'], resist: ['dark', 'ice'],
    phases: [0.6, 0.3], music: 'boss2', portrait: 'portraits/b_bonedragon', stageId: 's05', drops: ['u_bonedragon', 'u_bonedragon2'],
    light: { r: 200, color: '#6aff8a', i: 0.7 }, deathColor: '#8affa0', deathFx: 'soul',
    intro: '(무수한 뼈가 맞물리는 소리와 함께 카타콤 바닥이 들썩인다.)',
    desc: '수천 구의 유골이 엉겨 붙어 태어난 용. 눈구멍에는 녹색 영혼의 불이 타오르고, 벽과 바닥을 뚫고 목을 뻗는다.',
  },
  b_grimoire: {
    id: 'b_grimoire', name: '그리모어', title: '금단의 살아있는 마도서', hp: 1200, atk: 26, def: 6, res: 18, exp: 800, score: 40000,
    size: { w: 128, h: 146 }, flying: true, contact: 0.7, material: 'paper', weak: ['fire'], resist: ['dark', 'thunder'],
    phases: [0.6, 0.3], music: 'boss', portrait: 'portraits/b_grimoire', stageId: 's06', drops: ['u_grimoire'],
    light: { r: 250, color: '#b060ff', i: 0.8 }, deathColor: '#c080ff', deathFx: 'magic',
    intro: '(거대한 표지의 눈이 번쩍 뜨이고, 책장이 이빨처럼 갈린다.)',
    desc: '대도서관 깊은 곳에 봉인된 금서. 스스로 주문을 읊고 책장을 칼날처럼 흩뿌리며, 읽으려는 자를 삼킨다.',
  },
  b_chimera: {
    id: 'b_chimera', name: '키메라 호문쿨루스', title: '연금술이 낳은 세 머리 괴수', hp: 1400, atk: 28, def: 10, res: 10, exp: 900, score: 45000,
    size: { w: 196, h: 146 }, contact: 0.8, material: 'flesh', weak: ['ice', 'holy'], resist: ['fire'],
    phases: [0.6, 0.3], music: 'boss2', portrait: 'portraits/b_chimera', stageId: 's07', drops: ['u_chimera'],
    light: { r: 220, color: '#7cff5a', i: 0.6 }, deathColor: '#9aff6a', deathFx: 'ember',
    intro: '(사자, 산양, 뱀의 울음이 한데 뒤엉켜 실험실을 뒤흔든다.)',
    desc: '연금술사들이 사자·산양·뱀을 꿰매 붙이고 녹색 영약을 흘려 넣어 만든 괴수. 등에 박힌 유리관이 터지면 광폭해진다.',
  },
};
