// 보스 데이터 B (8~13장 + 드라큘라 + 혼돈). 스키마: game/bosses/boss.js 상단 주석
// hp/atk/def 는 레벨 1 기준값 — enemyStats() 가 스테이지 레벨로 스케일한다. hpMul: 추가 체력 배율 (드라큘라는 두 형태 합산).
// phases: 체력 비율 경계 (HUD 눈금 표시). light: 기본 광원. contact: 접촉 피해 배율.
export const BOSSES_B = {
  b_leviathan: {
    id: 'b_leviathan', name: '레비아탄', title: '검은 물의 심연룡',
    hp: 1150, atk: 26, def: 10, res: 8, exp: 1500, score: 30000,
    size: { w: 104, h: 72 }, flying: true, material: 'flesh', contact: 0.8,
    weak: ['thunder'], resist: ['ice', 'fire'], phases: [0.6, 0.3],
    music: 'boss2', portrait: 'portraits/b_leviathan', stageId: 's08', drops: ['u_leviathan'],
    light: { r: 200, color: '#5fe8ff', i: 0.6 },
    intro: '검은 물이 끓어오른다… 수로의 주인이 깨어났다.',
  },
  b_colossus: {
    id: 'b_colossus', name: '태엽 거신', title: '멈추지 않는 황동의 파수꾼',
    hp: 1400, atk: 30, def: 18, res: 10, exp: 1700, score: 35000,
    size: { w: 200, h: 360 }, flying: true, material: 'metal', contact: 0,
    weak: ['thunder'], resist: ['fire', 'dark'], phases: [0.65, 0.3],
    music: 'boss2', portrait: 'portraits/b_colossus', stageId: 's09', drops: ['u_colossus'],
    light: { r: 260, color: '#ff9a3a', i: 0.8 },
    intro: '톱니가 맞물리는 굉음. 시계탑 그 자체가 일어섰다.',
  },
  b_frostqueen: {
    id: 'b_frostqueen', name: '서리 여왕 이자벨라', title: '얼어붙은 첨탑의 여왕',
    hp: 1850, atk: 27, def: 9, res: 16, exp: 1800, score: 40000,
    size: { w: 64, h: 136 }, flying: true, material: 'ice', contact: 0.6,
    weak: ['fire'], resist: ['ice'], phases: [0.6, 0.3],
    music: 'boss2', portrait: 'portraits/b_frostqueen', stageId: 's10', drops: ['u_frostqueen'],
    light: { r: 220, color: '#9fe8ff', i: 0.8 },
    intro: '영원한 겨울 속에 잠들어라, 가엾은 사냥꾼.',
  },
  b_death: {
    id: 'b_death', name: '사신 데스', title: '영혼을 거두는 자',
    hp: 2050, atk: 30, def: 12, res: 14, exp: 2000, score: 50000,
    size: { w: 84, h: 150 }, flying: true, material: 'bone', contact: 0.7,
    weak: ['holy'], resist: ['dark', 'ice'], phases: [0.75, 0.5, 0.2],
    music: 'boss2', portrait: 'portraits/b_death', stageId: 's11', drops: ['u_death'],
    light: { r: 220, color: '#7dffb0', i: 0.7 },
    intro: '네 영혼의 무게를 달아 보겠다.',
  },
  b_dracula: {
    id: 'b_dracula', name: '드라큘라 백작', title: '영원한 밤의 군주',
    hp: 1500, hpMul: 1.8, atk: 32, def: 14, res: 16, exp: 3200, score: 100000,
    size: { w: 56, h: 126 }, flying: true, material: 'flesh', contact: 0.7,
    weak: ['holy'], resist: ['dark', 'fire'], phases: [0.75, 0.5, 0.25],
    music: 'dracula', portrait: 'portraits/b_dracula', stageId: 's12', drops: ['u_dracula', 'u_dracula2'],
    light: { r: 200, color: '#ff3048', i: 0.7 },
    // 2페이즈(50%) 변신 후 표시 정보
    form2: { name: '진·드라큘라', title: '피와 불꽃의 마왕', portrait: 'portraits/b_dracula2' },
    intro: '인간이여, 어리석게도 다시 이 성에 발을 들였는가.',
  },
  b_chaos: {
    id: 'b_chaos', name: '혼돈의 군주', title: '심연 너머의 무한한 눈',
    hp: 2000, hpMul: 1.3, atk: 34, def: 16, res: 18, exp: 5000, score: 200000,
    size: { w: 170, h: 190 }, flying: true, material: 'ghost', contact: 0.8,
    weak: ['holy'], resist: ['dark'], phases: [0.7, 0.4, 0.12],
    music: 'chaos', portrait: 'portraits/b_chaos', stageId: 's13', drops: ['u_chaos'],
    light: { r: 280, color: '#b060ff', i: 0.9 },
    intro: '보아라. 모든 밤과 모든 죽음이 태어난 곳을.',
  },
};
