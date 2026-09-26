// 2부 적 데이터 C (s14 거울의 성 · s15 영겁의 용광로 · s16 가라앉은 성소; world2 §5.1, §5.2). 소유: P2-DATA (W1) → ENEMY-P2-C-AI (W2 조정)
// 스키마 = game/enemy.js 상단 주석 (1부와 같음). data/enemies.js 가 { ...ENEMIES_A, ...ENEMIES_B, ...ENEMIES_C, ...ENEMIES_D } 로 합친다.
// hp/atk/def/res 는 레벨 1 기준값 — enemyStats() 가 스테이지 레벨(s14 lv46 · s15 lv50 · s16 lv53)로 스케일한다.
// 등급: S 소형(hp 40~70) / M 중형(75~150) / L 대형(150~230). gold S·M [10,24] / L [16,40], score S 1400 / M 2000~2500 / L 3000~3200.
// AI 종류: game/ai_c.js (AI_C: chandelier forgeimp slag chainhook bellows swimmer tidecaller siren) + 1부 재사용(swordsman wraith shadow knight).
//   AI_C 가 들어오기 전에는 enemy.js 가 AI.walker 로 대체한다. 렌더 ID = 적 id (render/enemies_c.js RENDER_C; 없으면 palette.body 타원 대체).
// noArena: 천장·깊은 물 등 방 기믹이 있어야 제대로 움직이는 적 → 아케이드 서바이벌(arcade_run)이 소환하지 않는다 (MASTER_PLAN §1.14).
// elite:false → 정예로 등장하지 않는다 (world.spawnEnemy).

const heart5 = (p) => ({ id: 'heart', p, qty: 5 });

export const ENEMIES_C = {
  // ───────────────────────── s14 거울의 성 (lv 46) ─────────────────────────
  mirror_knight: {
    id: 'mirror_knight', name: '거울 기사', lv: 46, hp: 150, atk: 18, def: 10, res: 10, exp: 58, gold: [10, 24], score: 2400,
    size: { w: 42, h: 94 }, ai: 'swordsman', aiParams: { sight: 460, combo: 3, windup: 0.5, rate: 1.5, wave: 'ice', guard: true, chaseMul: 1.1, jumps: true },
    render: 'mirror_knight', speed: 52, kbResist: 0.6, material: 'metal', weak: ['thunder', 'holy'], resist: ['ice'],
    palette: { body: '#bfd4e4' },
    drops: [{ id: 'm_mirror', p: 0.25 }, { id: 'm_crystal', p: 0.1 }, heart5(0.3)],
    desc: '은빛 유리로 빚은 갑주 기사. 정면 공격은 몸의 거울면으로 튕겨 낸다. 세 번째 일격은 바닥을 타고 달리는 유리 파편의 물결이다.',
  },
  glass_wraith: {
    id: 'glass_wraith', name: '유리 망령', lv: 46, hp: 60, atk: 17, def: 3, res: 14, exp: 36, gold: [10, 24], score: 1400,
    size: { w: 40, h: 72 }, ai: 'wraith', aiParams: { keep: 240, rate: 2.2, count: 5 }, render: 'glass_wraith', flying: true, phase: true,
    speed: 90, kbResist: 0.3, material: 'ice', weak: ['holy', 'fire'], resist: ['ice', 'dark'], light: { r: 70, color: '#dff4ff', i: 0.5 },
    palette: { body: '#cfe8ff' },
    drops: [{ id: 'm_mirror', p: 0.15 }, { id: 'mp', p: 0.15 }],
    desc: '금 간 거울에 갇힌 영혼. 몸이 깨진 유리 조각으로 되어 있어, 흩어졌다가 전혀 다른 곳에서 다시 맞춰진다.',
  },
  reflection: {
    id: 'reflection', name: '비친 자', lv: 46, hp: 140, atk: 18, def: 7, res: 9, exp: 60, gold: [10, 24], score: 2500,
    size: { w: 30, h: 82 }, ai: 'shadow', aiParams: { delay: 0.35, keep: 110, sight: 640 }, render: 'reflection',
    speed: 220, kbResist: 0.5, material: 'ice', weak: ['holy', 'thunder'], resist: ['ice'], light: { r: 60, color: '#bfe8ff', i: 0.4 },
    palette: { body: '#cfe8ff' },
    drops: [{ id: 'm_mirror', p: 0.3 }, heart5(0.3)],
    desc: '거울이 훔쳐 간 당신의 모습. 당신과 똑같이 움직이지만 반 박자 늦다. 금이 간 얼굴 사이로 텅 빈 속이 보인다.',
  },
  chandelier_fiend: {
    id: 'chandelier_fiend', name: '샹들리에 마귀', lv: 46, hp: 90, atk: 18, def: 6, res: 6, exp: 40, gold: [10, 24], score: 2000,
    size: { w: 64, h: 52 }, ai: 'chandelier', aiParams: { wake: 90, rate: 2.2, spit: 300 }, render: 'chandelier_fiend', elite: false, noArena: true,
    speed: 70, kbResist: 0.5, material: 'metal', weak: ['ice', 'thunder'], resist: ['fire'], light: { r: 110, color: '#ffcf7a', i: 0.7 },
    palette: { body: '#d8c08a' },
    drops: [{ id: 'm_mirror', p: 0.12 }, heart5(0.3), { id: 'food', p: 0.05 }],
    desc: '거꾸로 매달린 수정 샹들리에에 깃든 마귀. 발밑을 지나가면 떨어져 산산조각 나고, 흩어진 촛대 다리로 기어 다니며 촛불을 뱉는다.',
  },

  // ───────────────────────── s15 영겁의 용광로 (lv 50) ─────────────────────────
  forge_imp: {
    id: 'forge_imp', name: '용광로 임프', lv: 50, hp: 40, atk: 17, def: 3, res: 6, exp: 30, gold: [10, 24], score: 1400,
    size: { w: 36, h: 48 }, ai: 'forgeimp', aiParams: { rate: 2.2, keep: 180 }, render: 'forge_imp', flying: true,
    speed: 130, kbResist: 0.2, material: 'fire', weak: ['ice'], resist: ['fire', 'dark'], light: { r: 70, color: '#ff8a3a', i: 0.6 },
    palette: { body: '#2a1a14' },
    drops: [{ id: 'm_ember', p: 0.12 }, { id: 'mp', p: 0.1 }],
    desc: '용광로의 불씨가 모여 태어난 작은 악마. 달군 대갈못을 흩뿌리고, 틈이 보이면 불덩이처럼 곤두박질친다.',
  },
  slag_golem: {
    id: 'slag_golem', name: '쇳물 골렘', lv: 50, hp: 220, atk: 19, def: 12, res: 5, exp: 70, gold: [16, 40], score: 3100,
    size: { w: 68, h: 108 }, ai: 'slag', aiParams: { sight: 460, melee: 120, windup: 0.8, rate: 2.0 }, render: 'slag_golem',
    speed: 36, kbResist: 0.9, material: 'fire', weak: ['ice', 'thunder'], resist: ['fire'], light: { r: 110, color: '#ff6a1a', i: 0.8 },
    palette: { body: '#5a2a18' },
    drops: [{ id: 'm_ember', p: 0.25 }, { id: 'm_iron', p: 0.2 }, heart5(0.4), { id: 'food', p: 0.15 }],
    desc: '식지 않는 쇳물이 거인의 모양으로 굳은 것. 두 팔을 내리찍으면 주위에 쇳물 웅덩이가 번지고, 멀리 있는 적에게는 녹은 쇳덩이를 뱉는다.',
  },
  chain_warden: {
    id: 'chain_warden', name: '사슬 간수', lv: 50, hp: 130, atk: 18, def: 8, res: 7, exp: 56, gold: [10, 24], score: 2300,
    size: { w: 40, h: 92 }, ai: 'chainhook', aiParams: { sight: 520, range: 380, windup: 0.5, rate: 1.9 }, render: 'chain_warden',
    speed: 60, kbResist: 0.6, material: 'flesh', weak: ['holy', 'ice'], resist: ['fire', 'dark'],
    palette: { body: '#5a3a2a' },
    drops: [{ id: 'm_iron', p: 0.25 }, { id: 'm_ember', p: 0.1 }, heart5(0.25)],
    desc: '용광로의 죄수들을 감시하는 뿔 달린 간수. 갈고리 사슬을 던져 먹잇감을 끌어당긴 뒤 올려친다. 사슬이 날아올 선이 보이면 뛰어라.',
  },
  bellows: {
    id: 'bellows', name: '불풀무', lv: 50, hp: 110, atk: 18, def: 10, res: 10, exp: 44, gold: [10, 24], score: 2100,
    size: { w: 56, h: 64 }, ai: 'bellows', aiParams: { range: 300, inhale: 0.9, blow: 1.2, rate: 3.0 }, render: 'bellows',
    speed: 0, kbResist: 1, material: 'metal', weak: ['ice'], resist: ['fire'], light: { r: 90, color: '#ff7a2a', i: 0.6 },
    palette: { body: '#6a4028' },
    drops: [{ id: 'm_ember', p: 0.2 }, { id: 'm_gear', p: 0.1 }, heart5(0.3)],
    desc: '살아 있는 가죽 풀무. 크게 숨을 들이마셔 가까운 것을 끌어당긴 뒤 부채꼴의 불길을 토해 낸다. 등 뒤는 무방비하다.',
  },

  // ───────────────────────── s16 가라앉은 성소 (lv 53) ─────────────────────────
  abyss_angler: {
    id: 'abyss_angler', name: '심해 아귀', lv: 53, hp: 95, atk: 18, def: 5, res: 8, exp: 48, gold: [10, 24], score: 2200,
    size: { w: 64, h: 44 }, ai: 'swimmer', aiParams: { sight: 360, lunge: 520, windup: 0.45, rate: 1.6, leap: 700 }, render: 'abyss_angler', noArena: true,
    speed: 110, kbResist: 0.4, material: 'flesh', weak: ['thunder'], resist: ['ice'], light: { r: 80, color: '#aef8ff', i: 0.7 },
    palette: { body: '#c8c0b0' },
    drops: [{ id: 'm_pearl', p: 0.2 }, { id: 'food', p: 0.12 }, heart5(0.2)],
    desc: '머리 위의 초롱불로 먹잇감을 꾀는 심해어. 불빛이 흔들리면 이미 늦었다 — 턱이 몸통보다 크게 벌어진다. 물 밖으로도 뛰어오른다.',
  },
  sunken_priest: {
    id: 'sunken_priest', name: '수몰 사제', lv: 53, hp: 75, atk: 17, def: 4, res: 14, exp: 44, gold: [10, 24], score: 2100,
    size: { w: 34, h: 86 }, ai: 'tidecaller', aiParams: { keep: 260, windup: 0.7, rate: 2.6, heal: 0.2 }, render: 'sunken_priest', noArena: true,
    speed: 50, kbResist: 0.3, material: 'flesh', weak: ['thunder', 'holy'], resist: ['ice', 'dark'],
    palette: { body: '#5a7a6a' },
    drops: [{ id: 'm_pearl', p: 0.15 }, { id: 'mp', p: 0.2 }, { id: 'm_soul', p: 0.08 }],
    desc: '성소와 함께 가라앉은 사제. 부푼 입으로 조수의 기도를 읊으면 발밑에서 물기둥이 솟는다. 다친 동료를 물의 축복으로 치유한다.',
  },
  coral_crab: {
    id: 'coral_crab', name: '산호 게', lv: 53, hp: 120, atk: 18, def: 14, res: 6, exp: 50, gold: [10, 24], score: 2200,
    size: { w: 70, h: 50 }, ai: 'knight',
    aiParams: { shield: true, atkRange: 100, reach: 110, reachY: 50, reachH: 50, windup: 0.55, atkTime: 1.0, atkMv: 1.6, chaseMul: 1.2, sight: 420, atkSfx: 'clang' },
    render: 'coral_crab', noArena: true,
    speed: 70, kbResist: 0.8, material: 'stone', weak: ['thunder', 'fire'], resist: ['ice'],
    palette: { body: '#c85a4a' },
    drops: [{ id: 'm_pearl', p: 0.15 }, { id: 'm_crystal', p: 0.1 }, { id: 'food', p: 0.15 }],
    desc: '산호가 등껍질을 뒤덮은 거대한 게. 옆걸음으로 다가와 집게를 내리찍는다. 정면의 산호 껍질은 칼날을 튕겨 낸다.',
  },
  siren: {
    id: 'siren', name: '세이렌', lv: 53, hp: 70, atk: 17, def: 4, res: 12, exp: 46, gold: [10, 24], score: 1400,
    size: { w: 40, h: 78 }, ai: 'siren', aiParams: { keep: 240, rate: 2.4, ringSpeed: 260 }, render: 'siren', flying: true, noArena: true,
    speed: 110, kbResist: 0.3, material: 'flesh', weak: ['thunder', 'fire'], resist: ['ice'], light: { r: 60, color: '#9fe8ff', i: 0.4 },
    palette: { body: '#6ab8c0' },
    drops: [{ id: 'm_pearl', p: 0.2 }, { id: 'mp', p: 0.2 }],
    desc: '물과 공기 사이를 헤엄치는 노래하는 마물. 노래는 둥근 파문이 되어 퍼지는데, 파문에는 반드시 한 군데 틈이 있다.',
  },
};
