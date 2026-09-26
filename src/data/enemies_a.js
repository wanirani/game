// 적 데이터 A (스테이지 1~6 + 공용). 스키마: game/enemy.js 상단 주석
// hp/atk/def 는 레벨 1 기준값 — enemyStats() 가 스테이지 레벨(s01 lv1 … s06 lv14)로 스케일한다.
// 상대적 강도: 박쥐 10 / 해골 ~32 / 갑옷 ~85 / 대형 120~200
// material: 타격 이펙트 재질 ('flesh','bone','metal','ghost','stone','slime','paper','ice','fire')
// drops: 'heart' 'food' 'mp' + 재료 m_bone m_fang m_ectoplasm m_iron m_feather m_cloth m_crystal m_blood m_soul m_dark (+ 강화석 m_stone_N)

const UNDEAD = ['holy'];

export const ENEMIES_A = {
  // ───────────────────────── 공용 ─────────────────────────
  mimic: {
    id: 'mimic', name: '미믹', lv: 8, hp: 70, atk: 14, def: 6, res: 4, exp: 30, gold: [30, 80], score: 1500,
    size: { w: 48, h: 44 }, ai: 'mimic', aiParams: { sight: 460, maxVx: 330, jumpV: 640, rate: 0.55 }, render: 'mimic',
    speed: 80, kbResist: 0.55, material: 'metal', weak: ['fire', 'thunder'], resist: ['dark'],
    drops: [{ id: 'm_stone_1', p: 0.35 }, { id: 'm_stone_2', p: 0.12 }, { id: 'm_crystal', p: 0.3 }, { id: 'heart', p: 0.4, qty: 5 }],
    sfxDie: 'chest', desc: '보물상자로 위장한 탐욕의 괴물. 뚜껑 틈새로 새어 나오는 숨결을 눈치채지 못한 모험가는 통째로 삼켜진다. 쓰러뜨리면 삼킨 보물을 토해 낸다.',
  },
  golden_bat: {
    id: 'golden_bat', name: '황금 박쥐', lv: 1, hp: 14, atk: 0, def: 0, exp: 40, gold: [40, 90], score: 5000,
    size: { w: 30, h: 24 }, ai: 'fleer', aiParams: { life: 7.5, wake: 420 }, render: 'golden_bat', flying: true, speed: 175,
    contact: 0, material: 'flesh', weak: [], elite: false, light: { r: 80, color: '#ffd84a', i: 0.8 },
    drops: [{ id: 'm_crystal', p: 0.4 }, { id: 'heart', p: 0.6, qty: 5 }, { id: 'm_stone_2', p: 0.15 }],
    sfxDie: 'coin', desc: '온몸이 금빛으로 빛나는 희귀한 박쥐. 사람을 해치지는 않지만 눈 깜짝할 새 달아난다. 붙잡으면 금화가 비처럼 쏟아진다는 소문이 있다.',
  },

  // ───────────────────────── s01 불타는 마을 ─────────────────────────
  bat: {
    id: 'bat', name: '흡혈 박쥐', lv: 1, hp: 10, atk: 7, def: 0, exp: 3, gold: [1, 3], score: 100,
    size: { w: 34, h: 26 }, ai: 'vbat', aiParams: { wake: 260, amp: 150, freq: 5 }, render: 'bat', flying: true, speed: 110,
    material: 'flesh', weak: ['holy', 'fire'], drops: [{ id: 'heart', p: 0.2 }, { id: 'm_fang', p: 0.04 }],
    sfxDie: 'bat', desc: '악마성의 그늘에서 번식하는 흡혈 박쥐. 처마 밑에 거꾸로 매달려 있다가 사람의 체온을 느끼면 급강하한다.',
  },
  zombie: {
    id: 'zombie', name: '구울', lv: 1, hp: 26, atk: 8, def: 1, exp: 5, gold: [1, 4], score: 150,
    size: { w: 32, h: 78 }, ai: 'zombie', aiParams: { attack: false, riseTime: 0.9, chaseMul: 1.15, sight: 420 }, render: 'zombie', speed: 42,
    material: 'flesh', weak: ['fire', 'holy'], drops: [{ id: 'food', p: 0.05 }, { id: 'm_cloth', p: 0.05 }],
    desc: '저주받은 땅에서 기어 나온 시체. 느리지만 두려움을 모르고, 썩은 손으로 산 자의 온기를 끝없이 더듬어 찾는다.',
  },
  skeleton: {
    id: 'skeleton', name: '해골 병사', lv: 1, hp: 32, atk: 9, def: 2, exp: 6, gold: [2, 6], score: 200,
    size: { w: 30, h: 80 }, ai: 'walker',
    aiParams: { atkRange: 74, reachX: 4, reach: 64, reachY: 74, reachH: 56, windup: 0.42, atkTime: 0.82, atkMv: 1.2, chaseMul: 1.35, sight: 380 },
    render: 'skeleton', speed: 60, material: 'bone', weak: UNDEAD, resist: ['dark'], drops: [{ id: 'm_bone', p: 0.08 }],
    desc: '드라큘라의 마력으로 되살아난 옛 병사의 유골. 녹슨 검을 쥔 손은 생전의 검술을 아직 기억하고 있다.',
  },
  crow: {
    id: 'crow', name: '시체 까마귀', lv: 1, hp: 12, atk: 8, def: 0, exp: 4, gold: [1, 3], score: 150,
    size: { w: 38, h: 30 }, ai: 'diver', aiParams: { wake: 330, alert: 0.45, diveSpeed: 500 }, render: 'crow', flying: true, speed: 140,
    material: 'flesh', weak: ['fire', 'thunder'], drops: [{ id: 'm_feather', p: 0.12 }],
    desc: '전장의 시체를 파먹으며 붉은 눈을 얻은 까마귀. 날카롭게 한 번 울고 나면 반드시 먹잇감을 향해 곤두박질친다.',
  },
  wolf: {
    id: 'wolf', name: '굶주린 늑대', lv: 1, hp: 30, atk: 10, def: 1, exp: 7, gold: [1, 5], score: 250,
    size: { w: 62, h: 40 }, ai: 'charger',
    aiParams: { attack: false, windup: 0.5, chargeMul: 3.6, chargeTime: 0.7, rest: 0.7, rate: 1.3, sight: 420, chaseMul: 1.1, sfx: 'dash' },
    render: 'wolf', speed: 90, kbResist: 0.2, material: 'flesh', weak: ['fire'],
    drops: [{ id: 'm_fang', p: 0.12 }, { id: 'food', p: 0.05 }],
    desc: '마을을 덮친 재앙 속에서 광기에 물든 늑대. 몸을 낮추고 으르렁거린 직후, 번개처럼 돌진해 온다.',
  },
  possessed: {
    id: 'possessed', name: '빙의된 주민', lv: 1, hp: 36, atk: 10, def: 2, exp: 7, gold: [2, 8], score: 250,
    size: { w: 30, h: 80 }, ai: 'walker',
    aiParams: { atkRange: 104, reachX: 0, reach: 100, reachY: 58, reachH: 22, windup: 0.55, atkTime: 0.95, atkMv: 1.3, chaseMul: 1.4, sight: 360, atkSfx: 'slash' },
    render: 'possessed', speed: 55, material: 'flesh', weak: ['holy'], resist: ['dark'],
    drops: [{ id: 'm_cloth', p: 0.1 }, { id: 'food', p: 0.05 }],
    desc: '악령에게 몸을 빼앗긴 에슈빌의 농부. 쇠스랑을 뒤로 당기는 순간을 잘 보라. 안타깝지만 이제 구할 방법은 없다.',
  },

  // ───────────────────────── s02 안개의 묘지 ─────────────────────────
  ghost: {
    id: 'ghost', name: '원혼', lv: 3, hp: 22, atk: 9, def: 0, res: 4, exp: 8, gold: [1, 4], score: 300,
    size: { w: 36, h: 56 }, ai: 'floater', aiParams: { sight: 520 }, render: 'ghost', flying: true, phase: true, speed: 70,
    kbResist: 0.3, material: 'ghost', weak: ['holy'], resist: ['dark', 'ice'],
    drops: [{ id: 'm_ectoplasm', p: 0.12 }, { id: 'm_soul', p: 0.03 }],
    desc: '한을 품고 죽은 자의 넋. 벽도 무덤도 가리지 않고 스르르 통과해 산 자에게 들러붙는다.',
  },
  wisp: {
    id: 'wisp', name: '도깨비불', lv: 3, hp: 14, atk: 8, def: 0, res: 6, exp: 6, gold: [1, 3], score: 250,
    size: { w: 24, h: 24 }, ai: 'wisp', aiParams: { keep: 190, rate: 2.6, count: 3 }, render: 'wisp', flying: true, phase: true, speed: 95,
    kbResist: 0.4, material: 'fire', weak: ['ice', 'holy'], resist: ['fire', 'dark'],
    light: { r: 90, color: '#6affd8', i: 0.9 },
    drops: [{ id: 'mp', p: 0.15 }, { id: 'm_soul', p: 0.05 }],
    desc: '묘지 위를 떠도는 푸른 혼불. 몸을 크게 부풀린 뒤 세 갈래의 불씨를 흩뿌린다.',
  },
  bone_thrower: {
    id: 'bone_thrower', name: '뼈 던지는 해골', lv: 3, hp: 28, atk: 9, def: 1, exp: 7, gold: [2, 6], score: 250,
    size: { w: 30, h: 80 }, ai: 'thrower',
    aiParams: { range: 500, keep: 240, windup: 0.42, recover: 0.8, rate: 2.2, vy: 640, aim: 1.2, proj: 'bone', projMv: 1.0, throwSfx: 'dagger' },
    render: 'bone_thrower', speed: 55, material: 'bone', weak: UNDEAD, resist: ['dark'], drops: [{ id: 'm_bone', p: 0.12 }],
    desc: '자기 갈비뼈를 뽑아 던지는 해골. 뼈가 떨어질 일은 없다 — 던진 만큼 무덤에서 다시 주워 오니까.',
  },
  gravedigger: {
    id: 'gravedigger', name: '저주받은 무덤지기', lv: 3, hp: 150, atk: 14, def: 5, res: 3, exp: 30, gold: [10, 25], score: 1200,
    size: { w: 52, h: 96 }, ai: 'digger', aiParams: { sight: 460, melee: 118, rate: 1.6 }, render: 'gravedigger', speed: 48,
    kbResist: 0.8, material: 'flesh', weak: ['holy', 'fire'], resist: ['dark'], light: { r: 90, color: '#ffb050', i: 0.75 },
    drops: [{ id: 'm_cloth', p: 0.2 }, { id: 'm_iron', p: 0.12 }, { id: 'food', p: 0.2 }, { id: 'heart', p: 0.3, qty: 5 }],
    desc: '백 년 동안 무덤을 파 온 거한. 죽어서도 삽을 놓지 못한다. 삽을 머리 위로 치켜들면 땅이 갈라진다.',
  },
  mud_man: {
    id: 'mud_man', name: '진흙 인간', lv: 3, hp: 40, atk: 10, def: 3, exp: 9, gold: [2, 6], score: 300,
    size: { w: 40, h: 76 }, ai: 'mud', aiParams: { sight: 440 }, render: 'mud_man', speed: 45,
    kbResist: 0.4, material: 'stone', weak: ['fire', 'ice'], resist: ['thunder'],
    drops: [{ id: 'm_crystal', p: 0.03 }, { id: 'heart', p: 0.1 }],
    desc: '무덤가 진창에 스민 원념이 사람 모양으로 뭉친 것. 땅속으로 가라앉았다가 발밑에서 불쑥 솟아오른다. 거품이 끓는 곳을 조심하라.',
  },

  // ───────────────────────── s03 악마성 정문 ─────────────────────────
  armor_knight: {
    id: 'armor_knight', name: '방패 갑옷', lv: 5, hp: 85, atk: 13, def: 9, res: 4, exp: 18, gold: [5, 15], score: 700,
    size: { w: 40, h: 88 }, ai: 'knight',
    aiParams: { shield: true, atkRange: 96, reachX: 0, reach: 96, reachY: 90, reachH: 70, windup: 0.62, atkTime: 1.05, atkMv: 1.6, chaseMul: 1.0, sight: 420, atkSfx: 'slash_heavy' },
    render: 'armor_knight', speed: 45, kbResist: 0.7, material: 'metal', weak: ['thunder'], resist: ['ice'],
    drops: [{ id: 'm_iron', p: 0.2 }, { id: 'heart', p: 0.15 }],
    desc: '성문을 지키는 텅 빈 갑주. 투구 틈새의 붉은 빛만이 안에 무언가 깃들어 있음을 알려 준다. 정면의 탑 방패는 웬만한 공격을 튕겨 낸다.',
  },
  axe_armor: {
    id: 'axe_armor', name: '도끼 갑옷', lv: 5, hp: 95, atk: 13, def: 9, res: 4, exp: 22, gold: [6, 16], score: 800,
    size: { w: 44, h: 92 }, ai: 'axeKnight', aiParams: { range: 540, keep: 270, rate: 2.2 }, render: 'axe_armor', speed: 42,
    kbResist: 0.75, material: 'metal', weak: ['thunder'], resist: ['ice'],
    drops: [{ id: 'm_iron', p: 0.22 }, { id: 'heart', p: 0.15, qty: 5 }],
    desc: '양날 도끼를 부메랑처럼 던지는 중갑 기사. 도끼를 높이 들면 머리를, 낮게 끌면 발을 노린다.',
  },
  gargoyle: {
    id: 'gargoyle', name: '가고일', lv: 5, hp: 70, atk: 12, def: 7, res: 6, exp: 20, gold: [4, 12], score: 700,
    size: { w: 56, h: 52 }, ai: 'gargoyle', aiParams: { wake: 240, rate: 2.6 }, render: 'gargoyle', flying: true, speed: 120,
    kbResist: 0.5, material: 'stone', weak: ['holy', 'thunder'], resist: ['fire', 'dark'],
    drops: [{ id: 'm_crystal', p: 0.06 }, { id: 'm_dark', p: 0.05 }],
    desc: '성벽 위의 석상인 척 웅크린 마물. 가까이 다가가면 돌 껍질을 깨고 날아올라 불길을 토한다.',
  },
  medusa_head: {
    id: 'medusa_head', name: '메두사 머리', lv: 5, hp: 8, atk: 8, def: 0, exp: 3, gold: [1, 2], score: 150,
    size: { w: 32, h: 32 }, ai: 'wave', aiParams: { freq: 3.2, amp: 80 }, render: 'medusa_head', flying: true, phase: true, speed: 130,
    kbResist: 0.5, material: 'flesh', weak: ['holy'], elite: false, drops: [{ id: 'heart', p: 0.15 }],
    desc: '끝없이 날아드는 메두사의 잘린 머리. 물결치듯 오르내리며 벽조차 무시한다. 모든 헌터의 원수.',
  },
  medusa_spawner: {
    id: 'medusa_spawner', name: '메두사의 둥지', lv: 5, hp: 1, atk: 0, def: 0, exp: 0, gold: [0, 0], score: 0,
    size: { w: 20, h: 20 }, ai: 'spawner', aiParams: { spawn: 'medusa_head', rate: 3, max: 3, from: 'edges', delay: 1.2 }, render: 'none',
    flying: true, contact: 0, kbResist: 1, material: 'ghost', elite: false, drops: [],
    desc: '보이지 않는 저주의 샘. 이 근처에서는 메두사 머리가 끊임없이 날아든다.',
  },
  skeleton_archer: {
    id: 'skeleton_archer', name: '해골 궁수', lv: 5, hp: 30, atk: 10, def: 2, exp: 10, gold: [3, 8], score: 400,
    size: { w: 30, h: 80 }, ai: 'archer', aiParams: { range: 580, keep: 300, draw: 0.75, rate: 2.3, arrowSpeed: 560 }, render: 'skeleton_archer', speed: 60,
    material: 'bone', weak: UNDEAD, resist: ['dark'], drops: [{ id: 'm_bone', p: 0.1 }, { id: 'm_feather', p: 0.06 }],
    desc: '성벽 총안에서 활을 겨누던 궁병의 유골. 시위를 당긴 화살촉이 빛나면 곧 날아온다. 가끔은 하늘 높이 화살비를 쏘아 올린다.',
  },

  // ───────────────────────── s04 대회랑 ─────────────────────────
  blood_skeleton: {
    id: 'blood_skeleton', name: '피의 해골', lv: 8, hp: 38, atk: 12, def: 3, exp: 14, gold: [3, 9], score: 500,
    size: { w: 30, h: 80 }, ai: 'reviver',
    aiParams: { atkRange: 74, reachX: 4, reach: 66, reachY: 74, reachH: 56, windup: 0.38, atkTime: 0.76, atkMv: 1.3, chaseMul: 1.55, sight: 400, revive: 3.2 },
    render: 'blood_skeleton', speed: 70, material: 'bone', weak: UNDEAD, resist: ['dark'],
    drops: [{ id: 'm_blood', p: 0.12 }, { id: 'm_bone', p: 0.08 }],
    desc: '피에 절어 붉게 물든 해골. 쓰러뜨려도 뼈 무더기에서 다시 일어선다. 무너진 뼈를 한 번 더 부수거나 신성한 힘으로 정화해야 한다.',
  },
  phantom_sword: {
    id: 'phantom_sword', name: '유령 검', lv: 8, hp: 40, atk: 14, def: 6, res: 4, exp: 16, gold: [3, 10], score: 600,
    size: { w: 34, h: 60 }, ai: 'phantom', aiParams: { rate: 2.2, dashSpeed: 640 }, render: 'phantom_sword', flying: true, phase: true, speed: 95,
    kbResist: 0.6, material: 'metal', weak: ['holy'], resist: ['dark'], light: { r: 60, color: '#b060ff', i: 0.6 },
    drops: [{ id: 'm_iron', p: 0.12 }, { id: 'm_soul', p: 0.06 }],
    desc: '주인을 잃은 명검에 원령이 깃든 것. 칼끝을 겨누고 부르르 떨면, 다음 순간 일직선으로 꿰뚫어 온다.',
  },
  lesser_demon: {
    id: 'lesser_demon', name: '하급 악마', lv: 8, hp: 55, atk: 13, def: 4, res: 6, exp: 20, gold: [5, 14], score: 700,
    size: { w: 40, h: 64 }, ai: 'imp', aiParams: { rate: 2.4 }, render: 'lesser_demon', flying: true, speed: 125,
    kbResist: 0.3, material: 'flesh', weak: ['holy'], resist: ['dark', 'fire'],
    drops: [{ id: 'm_dark', p: 0.1 }, { id: 'm_blood', p: 0.08 }],
    desc: '드라큘라가 마계에서 불러낸 졸개. 손바닥에 검은 불꽃을 모아 던지고, 틈만 나면 발톱으로 덮친다.',
  },
  spear_guard: {
    id: 'spear_guard', name: '창병 갑옷', lv: 8, hp: 80, atk: 14, def: 8, res: 4, exp: 20, gold: [5, 14], score: 700,
    size: { w: 38, h: 90 }, ai: 'lancer', aiParams: { rate: 1.5, sight: 420 }, render: 'spear_guard', speed: 55,
    kbResist: 0.6, material: 'metal', weak: ['thunder'], resist: ['ice'],
    drops: [{ id: 'm_iron', p: 0.18 }],
    desc: '대회랑의 근위 창병. 창을 높이 겨누면 몸을 숙이고, 낮게 겨누면 뛰어넘어라.',
  },
  puppet_maiden: {
    id: 'puppet_maiden', name: '저주 인형', lv: 8, hp: 34, atk: 11, def: 2, res: 6, exp: 14, gold: [3, 10], score: 600,
    size: { w: 30, h: 62 }, ai: 'puppet', aiParams: { sight: 480 }, render: 'puppet_maiden', speed: 80, gravity: 0.75,
    kbResist: 0.2, material: 'stone', weak: ['fire', 'holy'], resist: ['dark'],
    drops: [{ id: 'm_cloth', p: 0.15 }, { id: 'm_soul', p: 0.05 }],
    desc: '보이지 않는 실에 매달려 춤추는 도자기 인형. 깔깔 웃으며 뛰어오르고, 세 번째 착지마다 바늘을 흩뿌린다.',
  },

  // ───────────────────────── s05 지하 묘지 ─────────────────────────
  bone_pillar: {
    id: 'bone_pillar', name: '해골 기둥', lv: 11, hp: 90, atk: 12, def: 6, res: 6, exp: 18, gold: [4, 12], score: 600,
    size: { w: 36, h: 96 }, ai: 'pillar', aiParams: { rate: 2.5, range: 580 }, render: 'bone_pillar', speed: 0,
    kbResist: 1, material: 'bone', weak: UNDEAD, resist: ['fire', 'dark'], light: { r: 70, color: '#ff7a2a', i: 0.5 },
    drops: [{ id: 'm_bone', p: 0.2 }, { id: 'heart', p: 0.2, qty: 5 }],
    desc: '용의 두개골을 쌓아 올린 저주의 기둥. 아가리가 달아오르면 곧 불덩이를 뱉는다. 움직이지는 못한다.',
  },
  mummy: {
    id: 'mummy', name: '미라', lv: 11, hp: 70, atk: 13, def: 4, res: 4, exp: 18, gold: [4, 12], score: 600,
    size: { w: 34, h: 84 }, ai: 'walker',
    aiParams: { atkRange: 124, reachX: 4, reach: 120, reachY: 66, reachH: 28, windup: 0.62, atkTime: 1.05, atkMv: 1.3, chaseMul: 1.15, sight: 380, atkSfx: 'whip' },
    render: 'mummy', speed: 38, kbResist: 0.5, material: 'paper', weak: ['fire', 'holy'], resist: ['dark'],
    drops: [{ id: 'm_cloth', p: 0.25 }],
    desc: '카타콤에 봉인된 고대의 사제. 풀린 붕대를 채찍처럼 휘둘러 먼 곳의 적까지 휘감는다.',
  },
  skeleton_knight: {
    id: 'skeleton_knight', name: '해골 기사', lv: 11, hp: 90, atk: 15, def: 8, res: 4, exp: 24, gold: [6, 16], score: 900,
    size: { w: 36, h: 88 }, ai: 'knight',
    aiParams: { shield: true, atkRange: 98, reachX: 0, reach: 98, reachY: 90, reachH: 70, windup: 0.5, atkTime: 0.92, atkMv: 1.6, chaseMul: 1.35, sight: 420, jumps: true, atkSfx: 'slash_heavy' },
    render: 'skeleton_knight', speed: 62, kbResist: 0.6, material: 'bone', weak: UNDEAD, resist: ['dark'],
    drops: [{ id: 'm_iron', p: 0.12 }, { id: 'm_bone', p: 0.12 }, { id: 'm_dark', p: 0.04 }],
    desc: '백 년 전 성을 지키다 쓰러진 기사단장의 유해. 죽어서도 방패를 들고 충성을 맹세한 주인을 지킨다.',
  },
  corpse_worm: {
    id: 'corpse_worm', name: '시체 벌레', lv: 11, hp: 26, atk: 10, def: 1, exp: 8, gold: [1, 5], score: 250,
    size: { w: 56, h: 22 }, ai: 'walker',
    aiParams: { atkRange: 76, reachX: 6, reach: 52, reachY: 36, reachH: 36, windup: 0.45, atkTime: 0.8, atkMv: 1.1, chaseMul: 1.7, sight: 300, atkSfx: 'hit' },
    render: 'corpse_worm', speed: 35, material: 'flesh', weak: ['fire'], resist: [],
    drops: [{ id: 'm_blood', p: 0.08 }, { id: 'food', p: 0.03 }],
    desc: '썩은 시체를 먹고 사람 팔뚝만큼 자란 구더기. 몸을 치켜세우면 갈고리 이빨로 달려든다.',
  },
  bone_scimitar: {
    id: 'bone_scimitar', name: '곡도 해골', lv: 11, hp: 50, atk: 13, def: 4, exp: 16, gold: [4, 11], score: 600,
    size: { w: 32, h: 80 }, ai: 'scimitar', aiParams: { sight: 420 }, render: 'bone_scimitar', speed: 88,
    material: 'bone', weak: UNDEAD, resist: ['dark'],
    drops: [{ id: 'm_bone', p: 0.1 }, { id: 'm_iron', p: 0.08 }],
    desc: '사막 너머에서 온 용병의 유골. 두 자루의 곡도로 연속 베기를 펼치고, 공격을 눈치채면 재빨리 뒤로 물러난다.',
  },

  // ───────────────────────── s06 대도서관 ─────────────────────────
  book_fiend: {
    id: 'book_fiend', name: '마도서 악령', lv: 14, hp: 30, atk: 12, def: 2, res: 8, exp: 16, gold: [3, 9], score: 500,
    size: { w: 40, h: 34 }, ai: 'bookfiend', aiParams: { rate: 2.3 }, render: 'book_fiend', flying: true, speed: 105,
    kbResist: 0.3, material: 'paper', weak: ['fire'], resist: ['dark'],
    drops: [{ id: 'mp', p: 0.2 }, { id: 'm_soul', p: 0.05 }],
    desc: '금서에 깃든 악령. 책장을 날개처럼 퍼덕이며 날카로운 종이 칼날을 날린다. 표지 속 눈동자와 눈을 마주치지 말 것.',
  },
  flea_man: {
    id: 'flea_man', name: '벼룩 사내', lv: 14, hp: 22, atk: 11, def: 2, exp: 12, gold: [2, 7], score: 450,
    size: { w: 24, h: 38 }, ai: 'flea', aiParams: { sight: 520, maxVx: 430 }, render: 'flea_man', speed: 90,
    material: 'flesh', weak: ['fire', 'holy'], drops: [{ id: 'm_fang', p: 0.06 }],
    desc: '금서를 훔쳐 읽다 몸이 쪼그라든 사서 견습생. 키키킥 웃으며 쉴 새 없이 튀어 오른다. 몸을 웅크리는 순간이 도약 신호다.',
  },
  skeleton_mage: {
    id: 'skeleton_mage', name: '해골 마법사', lv: 14, hp: 40, atk: 13, def: 2, res: 10, exp: 20, gold: [4, 12], score: 700,
    size: { w: 32, h: 84 }, ai: 'caster', aiParams: { range: 540, keep: 260, cast: 0.8, rate: 2.8 }, render: 'skeleton_mage', speed: 45,
    material: 'bone', weak: UNDEAD, resist: ['fire', 'ice'], light: { r: 60, color: '#b98cff', i: 0.5 },
    drops: [{ id: 'mp', p: 0.2 }, { id: 'm_crystal', p: 0.05 }, { id: 'm_bone', p: 0.08 }],
    desc: '금단의 주문을 연구하다 뼈만 남은 마도사. 발밑에 붉은 마법진이 떠오르면 즉시 피하라 — 곧 불기둥이 치솟는다.',
  },
  scholar_ghost: {
    id: 'scholar_ghost', name: '학자 유령', lv: 14, hp: 50, atk: 13, def: 2, res: 10, exp: 24, gold: [5, 14], score: 900,
    size: { w: 40, h: 70 }, ai: 'teleporter', aiParams: { rate: 1 }, render: 'scholar_ghost', flying: true, phase: true, speed: 60,
    kbResist: 0.5, material: 'ghost', weak: ['holy'], resist: ['dark', 'ice'], light: { r: 70, color: '#9fb8ff', i: 0.5 },
    drops: [{ id: 'm_soul', p: 0.12 }, { id: 'm_ectoplasm', p: 0.1 }, { id: 'mp', p: 0.15 }],
    desc: '대도서관을 떠나지 못하는 노학자의 망령. 연기처럼 사라졌다가 등 뒤에 나타나 저주의 문자를 흩뿌린다.',
  },
  ectoplasm: {
    id: 'ectoplasm', name: '엑토플라즘', lv: 14, hp: 36, atk: 11, def: 0, res: 6, exp: 14, gold: [2, 7], score: 450,
    size: { w: 40, h: 40 }, ai: 'ecto', aiParams: {}, render: 'ectoplasm', flying: true, phase: true, speed: 55,
    kbResist: 0.4, material: 'ghost', weak: ['holy', 'fire'], resist: ['dark', 'ice'], light: { r: 60, color: '#7affb0', i: 0.5 },
    drops: [{ id: 'm_ectoplasm', p: 0.2 }],
    desc: '수많은 원혼이 뒤엉켜 생긴 영질 덩어리. 베면 둘로 갈라진다. 속에 떠오르는 얼굴들은 모두 이 도서관에서 사라진 이들이다.',
  },
};
