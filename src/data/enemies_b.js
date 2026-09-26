// 적 데이터 B (스테이지 7~13). 스키마: game/enemy.js 상단 주석
// hp/atk/def 는 레벨 1 기준값 — enemyStats() 가 스테이지 레벨(s07 lv17 … s13 lv45)로 스케일한다.
// 상대적 강도: 소형 15~40 / 중형 50~90 / 대형 120~220. 후반 적은 수치보다 행동 패턴으로 위협한다.
// material: 타격 이펙트 재질 ('flesh','bone','metal','ghost','stone','slime','paper','ice','fire')
// drops: 'heart' 'food' 'mp' + 재료 m_gear m_scale m_ice m_blood m_soul m_dark m_crystal m_iron
// AI 이름은 game/ai_b.js (AI_B), 렌더 ID 는 render/enemies_b.js (RENDER_B) 참고

const UNDEAD = ['holy'];
const DEMON = ['holy'];

export const ENEMIES_B = {
  // ───────────────────────── s07 연금술 연구소 ─────────────────────────
  slime: {
    id: 'slime', name: '연금 슬라임', lv: 17, hp: 26, atk: 11, def: 1, res: 4, exp: 10, gold: [2, 7], score: 400,
    size: { w: 40, h: 30 }, ai: 'slime', aiParams: { sight: 460, hop: 0.36, rate: 0.9, split: 2 }, render: 'slime', speed: 60,
    kbResist: 0.2, material: 'slime', weak: ['fire', 'thunder'], resist: ['ice', 'dark'], light: { r: 60, color: '#7aff5a', i: 0.45 },
    drops: [{ id: 'm_crystal', p: 0.05 }, { id: 'mp', p: 0.1 }],
    desc: '실패한 연금 반응물이 스스로 꿈틀대기 시작한 것. 몸을 납작하게 웅크리면 곧 튀어 오른다. 크게 자란 것은 베면 둘로 갈라진다.',
  },
  homunculus: {
    id: 'homunculus', name: '호문쿨루스', lv: 17, hp: 30, atk: 12, def: 2, res: 4, exp: 12, gold: [3, 8], score: 500,
    size: { w: 28, h: 50 }, ai: 'pouncer', aiParams: { sight: 480, crouch: 0.38, maxVx: 460, jumpV: 620, rate: 1.1 }, render: 'homunculus', speed: 120,
    kbResist: 0.1, material: 'flesh', weak: ['fire', 'holy'], resist: [],
    drops: [{ id: 'm_blood', p: 0.1 }, { id: 'food', p: 0.04 }],
    desc: '플라스크 속에서 태어난 인조 인간. 탯줄 같은 관을 끌며 벽과 바닥을 기어 다닌다. 몸을 바짝 낮추는 순간 목덜미를 노리고 덮친다.',
  },
  flesh_golem: {
    id: 'flesh_golem', name: '육체 골렘', lv: 17, hp: 190, atk: 16, def: 6, res: 3, exp: 42, gold: [12, 30], score: 1800,
    size: { w: 60, h: 100 }, ai: 'brute',
    aiParams: { sight: 440, melee: 110, windup: 0.75, rate: 1.7, wave: 'flesh', chaseMul: 1.1 }, render: 'flesh_golem', speed: 40,
    kbResist: 0.88, material: 'flesh', weak: ['fire', 'thunder'], resist: ['ice'], light: { r: 70, color: '#8aff6a', i: 0.45 },
    drops: [{ id: 'm_blood', p: 0.25 }, { id: 'm_iron', p: 0.12 }, { id: 'food', p: 0.25 }, { id: 'heart', p: 0.35, qty: 5 }],
    desc: '수십 구의 시체를 꿰매 붙이고 번개로 숨을 불어넣은 거인. 두 팔을 머리 위로 치켜들면 땅을 내리쳐 충격파를 일으킨다.',
  },
  plague_doctor: {
    id: 'plague_doctor', name: '역병 의사', lv: 17, hp: 58, atk: 13, def: 3, res: 8, exp: 22, gold: [5, 14], score: 900,
    size: { w: 34, h: 84 }, ai: 'plague', aiParams: { range: 520, keep: 250, windup: 0.5, rate: 2.2 }, render: 'plague_doctor', speed: 55,
    kbResist: 0.3, material: 'flesh', weak: ['fire', 'holy'], resist: ['dark'],
    drops: [{ id: 'mp', p: 0.18 }, { id: 'm_crystal', p: 0.08 }, { id: 'm_blood', p: 0.06 }],
    desc: '역병을 고친다며 성에 들어온 의사들의 말로. 새부리 가면 속에서 약초 대신 독을 태운다. 허리에 찬 플라스크를 던지면 바닥에 독 웅덩이가 번진다.',
  },
  acid_turret: {
    id: 'acid_turret', name: '산성 증류기', lv: 17, hp: 80, atk: 13, def: 8, res: 6, exp: 20, gold: [4, 12], score: 800,
    size: { w: 44, h: 70 }, ai: 'distiller', aiParams: { range: 600, charge: 0.8, rate: 2.6, count: 3 }, render: 'acid_turret', speed: 0,
    kbResist: 1, material: 'metal', weak: ['thunder', 'ice'], resist: ['fire', 'dark'], light: { r: 80, color: '#9aff4a', i: 0.6 },
    drops: [{ id: 'm_iron', p: 0.18 }, { id: 'm_gear', p: 0.08 }, { id: 'heart', p: 0.2, qty: 5 }],
    desc: '제멋대로 끓어오르는 거대한 증류 장치. 유리 관이 부글부글 끓어 넘치면 산성 방울을 사방에 흩뿌린다. 움직이지는 못한다.',
  },

  // ───────────────────────── s08 지하 수로 ─────────────────────────
  merman: {
    id: 'merman', name: '어인', lv: 20, hp: 52, atk: 14, def: 3, res: 3, exp: 20, gold: [4, 12], score: 700,
    size: { w: 34, h: 80 }, ai: 'merman', aiParams: { sight: 420, rate: 2.2, spit: 0.5 }, render: 'merman', speed: 70,
    kbResist: 0.3, material: 'flesh', weak: ['thunder', 'fire'], resist: ['ice'],
    drops: [{ id: 'm_scale', p: 0.2 }, { id: 'food', p: 0.05 }],
    desc: '검은 물 밑에 숨어 사는 반어반인. 수면에 거품이 이는 곳을 조심하라. 물을 박차고 뛰어올라 뺨을 부풀린 뒤 불덩이를 뱉는다.',
  },
  killer_fish: {
    id: 'killer_fish', name: '살인 물고기', lv: 20, hp: 16, atk: 12, def: 1, exp: 8, gold: [1, 5], score: 300,
    size: { w: 38, h: 26 }, ai: 'fishleap', aiParams: { jumpV: 820, wait: 0.9 }, render: 'killer_fish', flying: true, phase: true, speed: 160,
    kbResist: 0.2, material: 'flesh', weak: ['thunder'], resist: ['ice'], elite: false,
    drops: [{ id: 'm_scale', p: 0.1 }, { id: 'food', p: 0.06 }],
    desc: '수로의 시체를 뜯어 먹고 자란 이빨투성이 물고기. 수면 아래에서 먹잇감을 노리다 활처럼 휘며 뛰어오른다.',
  },
  frog_demon: {
    id: 'frog_demon', name: '마계 개구리', lv: 20, hp: 72, atk: 14, def: 4, res: 5, exp: 24, gold: [5, 14], score: 900,
    size: { w: 54, h: 44 }, ai: 'frog', aiParams: { sight: 480, tongue: 170, rate: 1.4 }, render: 'frog_demon', speed: 60, gravity: 0.9,
    kbResist: 0.5, material: 'flesh', weak: ['ice', 'holy'], resist: ['dark'],
    drops: [{ id: 'm_dark', p: 0.08 }, { id: 'm_scale', p: 0.1 }, { id: 'food', p: 0.08 }],
    desc: '마계의 늪에서 흘러든 거대한 두꺼비. 목주머니를 부풀리면 곧 끈적한 혀가 번개처럼 뻗어 나온다. 무거운 몸으로 뛰어올라 짓누르기도 한다.',
  },
  drowned: {
    id: 'drowned', name: '익사체', lv: 20, hp: 56, atk: 13, def: 3, res: 3, exp: 18, gold: [3, 10], score: 600,
    size: { w: 34, h: 80 }, ai: 'drowned', aiParams: { sight: 420, spew: 150, rate: 2.0, riseTime: 1.0 }, render: 'drowned', speed: 40,
    kbResist: 0.45, material: 'flesh', weak: ['fire', 'holy'], resist: ['ice', 'dark'],
    drops: [{ id: 'm_soul', p: 0.06 }, { id: 'm_scale', p: 0.05 }, { id: 'heart', p: 0.15 }],
    desc: '수로에 몸을 던진 자들이 물을 잔뜩 머금은 채 일어선 것. 부풀어 오른 배를 움켜쥐면, 썩은 물을 한꺼번에 토해 낸다.',
  },
  water_spirit: {
    id: 'water_spirit', name: '물의 정령', lv: 20, hp: 44, atk: 13, def: 1, res: 12, exp: 22, gold: [4, 12], score: 800,
    size: { w: 40, h: 66 }, ai: 'spirit', aiParams: { keep: 230, rate: 2.4 }, render: 'water_spirit', flying: true, phase: true, speed: 80,
    kbResist: 0.5, material: 'ghost', weak: ['thunder'], resist: ['fire', 'ice', 'dark'], light: { r: 90, color: '#6ad8ff', i: 0.7 },
    drops: [{ id: 'mp', p: 0.25 }, { id: 'm_crystal', p: 0.08 }],
    desc: '수로를 흐르는 물에 깃든 슬픈 여인의 혼. 노래하듯 손을 모으면 물방울이 춤추며 날아오고, 발밑의 물결이 원을 그리면 물기둥이 치솟는다.',
  },

  // ───────────────────────── s09 시계탑 ─────────────────────────
  gear_golem: {
    id: 'gear_golem', name: '톱니 골렘', lv: 24, hp: 210, atk: 17, def: 12, res: 5, exp: 50, gold: [14, 34], score: 2000,
    size: { w: 64, h: 100 }, ai: 'geargolem', aiParams: { sight: 480, melee: 118, windup: 0.7, rate: 1.9 }, render: 'gear_golem', speed: 38,
    kbResist: 0.92, material: 'metal', weak: ['thunder'], resist: ['fire', 'ice', 'dark'], light: { r: 90, color: '#ff9a3a', i: 0.7 },
    drops: [{ id: 'm_gear', p: 0.35 }, { id: 'm_iron', p: 0.25 }, { id: 'heart', p: 0.35, qty: 5 }],
    desc: '시계탑의 태엽 장치를 지키는 황동 거인. 가슴의 화로가 달아오르면 피스톤 주먹이 날아오고, 등의 톱니를 뽑아 굴려 보내기도 한다.',
  },
  harpy: {
    id: 'harpy', name: '하피', lv: 24, hp: 38, atk: 14, def: 2, res: 4, exp: 18, gold: [3, 10], score: 700,
    size: { w: 48, h: 52 }, ai: 'harpy', aiParams: { rate: 2.2, count: 5 }, render: 'harpy', flying: true, speed: 150,
    kbResist: 0.35, material: 'flesh', weak: ['thunder', 'ice'], resist: [],
    drops: [{ id: 'm_scale', p: 0.06 }, { id: 'heart', p: 0.12 }],
    desc: '시계탑 꼭대기에 둥지를 튼 새 여인. 날개를 활짝 펴면 칼날 같은 깃털이 부채꼴로 쏟아지고, 날개를 접으면 발톱으로 내리꽂힌다.',
  },
  clockwork_soldier: {
    id: 'clockwork_soldier', name: '태엽 병사', lv: 24, hp: 56, atk: 15, def: 7, res: 3, exp: 22, gold: [5, 14], score: 850,
    size: { w: 30, h: 80 }, ai: 'rifleman', aiParams: { range: 620, keep: 300, aim: 0.7, rate: 1.2, clip: 3, rewind: 1.8 }, render: 'clockwork_soldier', speed: 60,
    kbResist: 0.5, material: 'metal', weak: ['thunder'], resist: ['ice', 'dark'],
    drops: [{ id: 'm_gear', p: 0.2 }, { id: 'm_iron', p: 0.1 }],
    desc: '태엽으로 움직이는 인형 병정. 붉은 조준선이 몸에 닿으면 곧 탄환이 날아온다. 세 발을 쏘고 나면 등의 태엽이 풀려 잠시 멈춘다 — 그때가 기회다.',
  },
  cog_wheel: {
    id: 'cog_wheel', name: '굴러오는 톱니', lv: 24, hp: 40, atk: 15, def: 10, res: 6, exp: 14, gold: [2, 8], score: 500,
    size: { w: 44, h: 44 }, ai: 'roller', aiParams: { sight: 600, maxSpeed: 360, accel: 420, windup: 0.45 }, render: 'cog_wheel', speed: 120,
    kbResist: 0.85, material: 'metal', weak: ['thunder'], resist: ['fire', 'ice', 'dark'], light: { r: 50, color: '#ffb040', i: 0.5 },
    drops: [{ id: 'm_gear', p: 0.22 }],
    desc: '태엽 장치에서 튕겨 나와 스스로 굴러다니는 톱니바퀴. 벽에 부딪히면 불꽃을 튀기며 튕겨 나오고, 점점 빨라진다. 뛰어넘는 수밖에 없다.',
  },

  // ───────────────────────── s10 얼어붙은 첨탑 ─────────────────────────
  ice_golem: {
    id: 'ice_golem', name: '얼음 골렘', lv: 28, hp: 215, atk: 17, def: 10, res: 8, exp: 54, gold: [14, 34], score: 2000,
    size: { w: 64, h: 104 }, ai: 'brute', aiParams: { sight: 460, melee: 116, windup: 0.8, rate: 1.9, wave: 'spikes', chaseMul: 1.0 }, render: 'ice_golem', speed: 36,
    kbResist: 0.92, material: 'ice', weak: ['fire'], resist: ['ice', 'dark'], immune: [], light: { r: 90, color: '#9fe8ff', i: 0.6 },
    drops: [{ id: 'm_ice', p: 0.35 }, { id: 'm_crystal', p: 0.15 }, { id: 'heart', p: 0.35, qty: 5 }],
    desc: '만년설 속 수정이 모여 이룬 거인. 주먹으로 얼음 바닥을 내리치면 땅을 따라 얼음 가시가 연달아 솟는다. 불에 몹시 약하다.',
  },
  frost_wraith: {
    id: 'frost_wraith', name: '서리 망령', lv: 28, hp: 46, atk: 15, def: 2, res: 12, exp: 24, gold: [4, 12], score: 900,
    size: { w: 40, h: 72 }, ai: 'wraith', aiParams: { keep: 240, rate: 2.3, count: 5 }, render: 'frost_wraith', flying: true, phase: true, speed: 90,
    kbResist: 0.5, material: 'ghost', weak: ['fire', 'holy'], resist: ['ice', 'dark'], light: { r: 80, color: '#9fe8ff', i: 0.7 },
    drops: [{ id: 'm_ice', p: 0.14 }, { id: 'm_soul', p: 0.1 }, { id: 'mp', p: 0.15 }],
    desc: '눈보라 속에서 얼어 죽은 순례자들의 원령. 서리 왕관이 빛나면 얼음 파편이 부채꼴로 날아든다. 눈안개처럼 흩어졌다 등 뒤에 나타난다.',
  },
  snow_wolf: {
    id: 'snow_wolf', name: '설원 늑대', lv: 28, hp: 52, atk: 15, def: 3, res: 4, exp: 20, gold: [3, 10], score: 700,
    size: { w: 64, h: 42 }, ai: 'snowwolf',
    aiParams: { attack: false, windup: 0.45, chargeMul: 4, chargeTime: 0.65, rest: 0.55, rate: 1.0, sight: 480, chaseMul: 1.2, sfx: 'dash' },
    render: 'snow_wolf', speed: 100, kbResist: 0.25, material: 'flesh', weak: ['fire'], resist: ['ice'],
    drops: [{ id: 'm_ice', p: 0.08 }, { id: 'food', p: 0.08 }],
    desc: '첨탑의 설원을 달리는 은빛 늑대. 몸을 낮춘 뒤 눈보라처럼 돌진하고, 위에 있는 먹잇감에게는 크게 뛰어올라 물어뜯는다.',
  },
  frozen_knight: {
    id: 'frozen_knight', name: '얼어붙은 기사', lv: 28, hp: 125, atk: 17, def: 11, res: 6, exp: 36, gold: [8, 22], score: 1300,
    size: { w: 42, h: 92 }, ai: 'swordsman', aiParams: { sight: 440, combo: 2, windup: 0.6, rate: 1.6, wave: 'ice', guard: true, chaseMul: 1.0 }, render: 'frozen_knight', speed: 45,
    kbResist: 0.75, material: 'ice', weak: ['fire', 'thunder'], resist: ['ice', 'dark'],
    drops: [{ id: 'm_ice', p: 0.2 }, { id: 'm_iron', p: 0.15 }, { id: 'heart', p: 0.2, qty: 5 }],
    desc: '첨탑을 오르다 얼어붙은 옛 원정대의 기사. 얼음이 갑옷을 대신한다. 대검을 크게 내리치면 바닥을 따라 서리의 칼날이 달려 나간다.',
  },
  ice_bat: {
    id: 'ice_bat', name: '얼음 박쥐', lv: 28, hp: 18, atk: 13, def: 2, exp: 8, gold: [1, 5], score: 350,
    size: { w: 32, h: 24 }, ai: 'icebat', aiParams: { wake: 300, amp: 120, freq: 5, rate: 1.8 }, render: 'ice_bat', flying: true, speed: 115,
    material: 'ice', weak: ['fire'], resist: ['ice'], light: { r: 50, color: '#9fe8ff', i: 0.5 },
    drops: [{ id: 'heart', p: 0.18 }, { id: 'm_ice', p: 0.05 }],
    desc: '날개가 얼음 결정으로 굳어 버린 박쥐. 머리 위에서 부르르 떨면 고드름을 떨어뜨린다.',
  },

  // ───────────────────────── s11 피의 예배당 ─────────────────────────
  succubus: {
    id: 'succubus', name: '서큐버스', lv: 32, hp: 62, atk: 15, def: 3, res: 10, exp: 30, gold: [6, 16], score: 1100,
    size: { w: 36, h: 80 }, ai: 'succubus', aiParams: { keep: 210, rate: 2.2 }, render: 'succubus', flying: true, speed: 130,
    kbResist: 0.4, material: 'flesh', weak: DEMON, resist: ['dark', 'fire'], light: { r: 70, color: '#ff4a8a', i: 0.55 },
    drops: [{ id: 'm_blood', p: 0.14 }, { id: 'm_dark', p: 0.1 }, { id: 'mp', p: 0.15 }],
    desc: '달콤한 속삭임으로 사냥꾼을 유혹하는 몽마. 입맞춤을 날리면 붉은 하트가 뒤쫓아 오고, 박쥐 날개를 접는 순간 발톱으로 덮친다.',
  },
  blood_priest: {
    id: 'blood_priest', name: '피의 사제', lv: 32, hp: 70, atk: 15, def: 4, res: 12, exp: 32, gold: [7, 18], score: 1200,
    size: { w: 36, h: 88 }, ai: 'priest', aiParams: { range: 560, keep: 260, cast: 0.8, rate: 2.6 }, render: 'blood_priest', speed: 45,
    kbResist: 0.35, material: 'flesh', weak: ['holy', 'fire'], resist: ['dark'], light: { r: 70, color: '#ff2a44', i: 0.55 },
    drops: [{ id: 'm_blood', p: 0.25 }, { id: 'mp', p: 0.2 }, { id: 'm_soul', p: 0.06 }],
    desc: '성배에 피를 채워 드라큘라에게 바치는 타락한 사제. 성배를 치켜들면 바닥의 피 웅덩이에서 핏빛 창이 솟는다. 주위 권속의 상처를 피로 메우기도 한다.',
  },
  bone_angel: {
    id: 'bone_angel', name: '뼈 천사', lv: 32, hp: 68, atk: 15, def: 6, res: 8, exp: 32, gold: [6, 16], score: 1200,
    size: { w: 56, h: 80 }, ai: 'angel', aiParams: { rate: 2.4 }, render: 'bone_angel', flying: true, speed: 110,
    kbResist: 0.5, material: 'bone', weak: UNDEAD, resist: ['dark', 'ice'], light: { r: 70, color: '#fff2b0', i: 0.4 },
    drops: [{ id: 'm_soul', p: 0.12 }, { id: 'm_crystal', p: 0.06 }],
    desc: '타락한 성소가 낳은 해골 천사. 부러진 후광 아래에서 뼈 깃털을 비처럼 쏟고, 창을 겨눈 채 곧장 내리꽂힌다.',
  },
  death_knight: {
    id: 'death_knight', name: '죽음의 기사', lv: 32, hp: 170, atk: 18, def: 12, res: 8, exp: 48, gold: [12, 30], score: 1800,
    size: { w: 46, h: 96 }, ai: 'swordsman', aiParams: { sight: 460, combo: 3, windup: 0.5, rate: 1.4, wave: 'soul', guard: true, chaseMul: 1.25, jumps: true }, render: 'death_knight', speed: 55,
    kbResist: 0.82, material: 'metal', weak: ['holy'], resist: ['dark', 'ice', 'fire'], light: { r: 80, color: '#6aff9a', i: 0.6 },
    drops: [{ id: 'm_soul', p: 0.25 }, { id: 'm_dark', p: 0.2 }, { id: 'm_iron', p: 0.2 }, { id: 'heart', p: 0.3, qty: 5 }],
    desc: '사신에게 영혼을 판 흑기사. 투구 틈새로 푸른 혼불이 넘실댄다. 세 번 이어지는 베기의 마지막 일격은 영혼의 불꽃이 되어 바닥을 가른다.',
  },
  cursed_nun: {
    id: 'cursed_nun', name: '저주받은 수녀', lv: 32, hp: 54, atk: 14, def: 3, res: 12, exp: 28, gold: [5, 14], score: 1000,
    size: { w: 32, h: 80 }, ai: 'nun', aiParams: { keep: 240, pray: 0.9, rate: 2.8, count: 6 }, render: 'cursed_nun', flying: true, speed: 60,
    kbResist: 0.4, material: 'flesh', weak: ['holy', 'fire'], resist: ['dark'], light: { r: 60, color: '#b060ff', i: 0.5 },
    drops: [{ id: 'm_soul', p: 0.12 }, { id: 'mp', p: 0.2 }, { id: 'heart', p: 0.15 }],
    desc: '눈을 가린 채 거꾸로 된 기도를 올리는 수녀. 기도가 끝나면 뒤집힌 십자가들이 그녀 곁을 맴돌다 한꺼번에 날아든다.',
  },

  // ───────────────────────── s12 드라큘라의 왕좌 ─────────────────────────
  vampire_bride: {
    id: 'vampire_bride', name: '흡혈 신부', lv: 36, hp: 78, atk: 16, def: 4, res: 12, exp: 36, gold: [8, 20], score: 1400,
    size: { w: 34, h: 84 }, ai: 'bride', aiParams: { keep: 200, rate: 2.0 }, render: 'vampire_bride', flying: true, phase: true, speed: 110,
    kbResist: 0.45, material: 'flesh', weak: ['holy', 'fire'], resist: ['dark', 'ice'], light: { r: 70, color: '#ff3a5a', i: 0.5 },
    drops: [{ id: 'm_blood', p: 0.25 }, { id: 'm_dark', p: 0.1 }, { id: 'heart', p: 0.2, qty: 5 }],
    desc: '드라큘라의 곁에서 영원한 밤을 맹세한 신부. 찢긴 면사포를 끌며 떠다니다, 비명과 함께 박쥐를 흩뿌리고 붉은 안개가 되어 스쳐 지나간다.',
  },
  demon_lord: {
    id: 'demon_lord', name: '마족 영주', lv: 36, hp: 220, atk: 19, def: 11, res: 10, exp: 60, gold: [16, 40], score: 2400,
    size: { w: 62, h: 108 }, ai: 'demonlord', aiParams: { sight: 520, melee: 124, windup: 0.6, rate: 1.7 }, render: 'demon_lord', speed: 46,
    kbResist: 0.9, material: 'flesh', weak: DEMON, resist: ['fire', 'dark'], light: { r: 100, color: '#ff6a2a', i: 0.7 },
    drops: [{ id: 'm_dark', p: 0.3 }, { id: 'm_blood', p: 0.2 }, { id: 'm_crystal', p: 0.12 }, { id: 'heart', p: 0.4, qty: 5 }],
    desc: '마계의 한 지방을 다스리던 대악마. 드라큘라와의 계약으로 왕좌를 지킨다. 불타는 대검을 휘두르고, 손을 치켜들면 발밑에서 지옥불이 솟구친다.',
  },
  bat_swarm: {
    id: 'bat_swarm', name: '박쥐 떼', lv: 36, hp: 44, atk: 15, def: 1, res: 4, exp: 22, gold: [4, 12], score: 900,
    size: { w: 72, h: 52 }, ai: 'swarm', aiParams: { rate: 2.0, count: 14 }, render: 'bat_swarm', flying: true, phase: true, speed: 140,
    kbResist: 0.6, material: 'flesh', weak: ['holy', 'fire'], resist: ['dark'],
    drops: [{ id: 'heart', p: 0.35 }, { id: 'm_blood', p: 0.1 }],
    desc: '왕좌의 천장을 뒤덮은 박쥐들이 한 몸처럼 움직이는 것. 빙빙 돌며 틈을 노리다 검은 물결이 되어 휩쓸고 지나간다. 상처를 입을수록 수가 줄어든다.',
  },
  royal_guard: {
    id: 'royal_guard', name: '근위 갑옷', lv: 36, hp: 160, atk: 18, def: 14, res: 6, exp: 46, gold: [12, 30], score: 1700,
    size: { w: 44, h: 98 }, ai: 'halberdier', aiParams: { sight: 460, rate: 1.4, shield: true }, render: 'royal_guard', speed: 48,
    kbResist: 0.85, material: 'metal', weak: ['thunder', 'holy'], resist: ['ice', 'dark'],
    drops: [{ id: 'm_iron', p: 0.3 }, { id: 'm_crystal', p: 0.08 }, { id: 'heart', p: 0.25, qty: 5 }],
    desc: '왕좌의 방을 지키는 진홍과 황금의 근위 갑주. 미늘창을 뒤로 젖히면 크게 휩쓸고, 앞으로 겨누면 멀리까지 찌른다. 정면 공격은 방패로 튕겨 낸다.',
  },

  // ───────────────────────── s13 심연의 역성 ─────────────────────────
  chaos_spawn: {
    id: 'chaos_spawn', name: '혼돈의 권속', lv: 45, hp: 66, atk: 16, def: 4, res: 10, exp: 34, gold: [6, 16], score: 1300,
    size: { w: 50, h: 48 }, ai: 'chaos', aiParams: { sight: 520, rate: 1.8 }, render: 'chaos_spawn', speed: 70,
    kbResist: 0.4, material: 'slime', weak: ['holy'], resist: ['dark', 'fire'], light: { r: 60, color: '#d040ff', i: 0.5 },
    drops: [{ id: 'm_dark', p: 0.2 }, { id: 'm_soul', p: 0.1 }],
    desc: '혼돈의 군주가 흘린 살점이 제멋대로 자라난 것. 눈과 입이 끝없이 생겨났다 사라진다. 몸을 부풀리면 사방으로 혼돈의 알을 흩뿌린다.',
  },
  hellhound: {
    id: 'hellhound', name: '지옥견', lv: 45, hp: 78, atk: 17, def: 5, res: 6, exp: 34, gold: [6, 16], score: 1300,
    size: { w: 70, h: 46 }, ai: 'hound',
    aiParams: { attack: false, windup: 0.42, chargeMul: 4.2, chargeTime: 0.7, rest: 0.5, rate: 1.0, sight: 520, chaseMul: 1.3, breath: 0.5, sfx: 'dash' },
    render: 'hellhound', speed: 110, kbResist: 0.4, material: 'fire', weak: ['ice', 'holy'], resist: ['fire', 'dark'], light: { r: 80, color: '#ff6a1a', i: 0.7 },
    drops: [{ id: 'm_dark', p: 0.12 }, { id: 'm_blood', p: 0.1 }, { id: 'food', p: 0.06 }],
    desc: '용암 속에서 태어난 지옥의 사냥개. 갈기가 불꽃이고 침이 쇳물이다. 불길을 토한 뒤 불타는 발자국을 남기며 돌진한다.',
  },
  abyss_eye: {
    id: 'abyss_eye', name: '심연의 눈', lv: 45, hp: 130, atk: 18, def: 6, res: 12, exp: 44, gold: [10, 26], score: 1800,
    size: { w: 70, h: 70 }, ai: 'eyebeam', aiParams: { range: 720, aim: 1.1, fire: 0.9, rate: 2.4, sweep: 0.55 }, render: 'abyss_eye', flying: true, phase: true, speed: 30,
    kbResist: 1, material: 'flesh', weak: ['holy'], resist: ['dark', 'fire'], light: { r: 110, color: '#ff3a4a', i: 0.8 },
    drops: [{ id: 'm_dark', p: 0.25 }, { id: 'm_crystal', p: 0.15 }, { id: 'm_soul', p: 0.12 }, { id: 'heart', p: 0.3, qty: 5 }],
    desc: '심연의 밑바닥에서 이 세계를 엿보는 거대한 눈. 조준선이 몸을 따라오기 시작하면 멈추지 말고 달려라 — 곧 모든 것을 태우는 광선이 쓸고 지나간다.',
  },
  shadow_hunter: {
    id: 'shadow_hunter', name: '그림자 헌터', lv: 45, hp: 150, atk: 18, def: 8, res: 10, exp: 60, gold: [14, 34], score: 2500,
    size: { w: 30, h: 82 }, ai: 'shadow', aiParams: { delay: 0.28, keep: 120, sight: 700 }, render: 'shadow_hunter', speed: 230,
    kbResist: 0.5, material: 'ghost', weak: ['holy'], resist: ['dark'], light: { r: 70, color: '#b060ff', i: 0.5 },
    drops: [{ id: 'm_dark', p: 0.3 }, { id: 'm_soul', p: 0.2 }, { id: 'heart', p: 0.35, qty: 5 }],
    desc: '역성의 거울이 비춘 당신의 그림자. 당신이 휘두르면 똑같이 휘두르고, 당신이 뛰면 똑같이 뛴다. 한 박자 늦는 그 틈을 파고들어라.',
  },
  void_demon: {
    id: 'void_demon', name: '공허의 악마', lv: 45, hp: 165, atk: 18, def: 8, res: 14, exp: 56, gold: [12, 30], score: 2200,
    size: { w: 60, h: 96 }, ai: 'voider', aiParams: { keep: 260, rate: 2.3 }, render: 'void_demon', flying: true, phase: true, speed: 70,
    kbResist: 0.8, material: 'ghost', weak: ['holy'], resist: ['dark', 'ice', 'fire'], light: { r: 90, color: '#b060ff', i: 0.7 },
    drops: [{ id: 'm_dark', p: 0.3 }, { id: 'm_soul', p: 0.2 }, { id: 'm_crystal', p: 0.12 }, { id: 'heart', p: 0.3, qty: 5 }],
    desc: '별이 없는 밤하늘을 몸에 담은 악마. 공간을 찢어 등 뒤로 넘어오고, 손바닥의 공허는 빛마저 빨아들인다. 검은 균열이 열리면 끌려가지 않도록 버텨라.',
  },
};
