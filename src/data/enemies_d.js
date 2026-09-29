// 2부 적 데이터 D (s17 폭풍의 공중정원 · s18 악몽의 미궁 · s19 썩어가는 숲 · s20 태초의 공허; world2 §5.1, §5.2). 소유: P2-DATA (W1) → ENEMY-P2-D-AI (W2 조정 완료)
// 스키마 = game/enemy.js 상단 주석. data/enemies.js 가 합친다.
// hp/atk/def/res 는 레벨 1 기준값 — enemyStats() 가 스테이지 레벨(s17 lv56 · s18 lv60 · s19 lv64 · s20 lv68)로 스케일한다.
// 등급: S 소형(hp 40~70) / M 중형(75~150) / L 대형(150~230). gold S·M [10,24] / L [16,40], score S 1400 / M 2000~2500 / L 3000~3200.
// AI 종류: game/ai_d.js (AI_D: galeknight roc jelly puppeteer stalker treant moth husk herald) + 1부 재사용(harpy voider chaos).
//   aiParams 의 뜻·기본값과 자세(anim) 이름 계약은 game/ai_d.js 머리 주석. 렌더 ID = 적 id (render/enemies_d.js RENDER_D; 없으면 palette.body 타원 대체).
// noArena: 바람(돌풍) 등 방 기믹이 있어야 제대로 움직이는 적 → 아케이드 서바이벌이 소환하지 않는다 (MASTER_PLAN §1.14).
//   cloud_jelly 는 돌풍에 떠밀려 다니는 것이 본령이라(바람이 없으면 느릿느릿 다가올 뿐) 서바이벌에서 뺀다.
//   gale_knight 는 돌풍을 읽지만(맞바람이면 돌진 안 함) 바람 없이도 온전히 싸우므로 서바이벌에 나와도 된다.
//   treant/moth/husk 의 포자는 blight 기믹이 없으면 독 Zone 으로 대체되므로(world2 §5.3) 서바이벌에 나와도 된다.
//   puppeteer 가 부른 저주 인형(puppet_maiden)은 경험치 30%·재료 드롭 없음 (무한 사냥 방지, ai_d.js).
// 밸런스 (W4 FIX-DATA, 요청 #234 · #325 · 리드 결정 #346, world2 §15 · node tools/balance.mjs normal <영웅> --check):
//   exp 전원 ×0.8. atk: s17 네 종 18/19/20/17 → 23/25/26/22, 나머지 8종 ×1.2 (7단계 장비가 풀리는 s17 부터 받는 피해 %).
//   hp: s17 네 종 ×1.25 (storm_harpy 88 · gale_knight 163 · thunder_roc 250 · cloud_jelly 63), plague_moth 55→72 · fungal_husk 110→143.

const heart5 = (p) => ({ id: 'heart', p, qty: 5 });

export const ENEMIES_D = {
  // ───────────────────────── s17 폭풍의 공중정원 (lv 56) ─────────────────────────
  storm_harpy: {
    id: 'storm_harpy', name: '폭풍 하피', lv: 56, hp: 88, atk: 23, def: 5, res: 8, exp: 35, gold: [10, 24], score: 1400,
    size: { w: 50, h: 54 }, ai: 'harpy', aiParams: { rate: 2.0, count: 7 }, render: 'storm_harpy', flying: true,
    speed: 160, kbResist: 0.3, material: 'flesh', weak: ['ice', 'dark'], resist: ['thunder'], light: { r: 60, color: '#bfe0ff', i: 0.4 },
    palette: { body: '#7a8aa0' },
    drops: [{ id: 'm_gale', p: 0.2 }, { id: 'heart', p: 0.2 }],
    desc: '번개를 머금은 깃털의 하피. 날개를 활짝 펴면 전기가 흐르는 깃털이 부채꼴로 쏟아진다.',
  },
  gale_knight: {
    id: 'gale_knight', name: '질풍 창기사', lv: 56, hp: 163, atk: 25, def: 8, res: 8, exp: 46, gold: [10, 24], score: 2400,
    size: { w: 46, h: 86 }, ai: 'galeknight', aiParams: { hover: 150, dash: 820, windup: 0.6, rate: 2.0 }, render: 'gale_knight', flying: true,
    speed: 120, kbResist: 0.5, material: 'metal', weak: ['ice', 'dark'], resist: ['thunder'],
    palette: { body: '#e8e0c8' },
    drops: [{ id: 'm_gale', p: 0.25 }, { id: 'm_iron', p: 0.15 }, heart5(0.3)],
    desc: '바람을 타는 날개 달린 창기사. 긴 창을 수평으로 겨누면 곧 번개처럼 돌진한다. 멀리서는 바람의 초승달을 날린다.',
  },
  thunder_roc: {
    id: 'thunder_roc', name: '뇌조', lv: 56, hp: 250, atk: 26, def: 8, res: 10, exp: 64, gold: [16, 40], score: 3200,
    size: { w: 110, h: 70 }, ai: 'roc', aiParams: { rate: 2.6, bolts: 3, swoop: 0.6 }, render: 'thunder_roc', flying: true, phase: true,
    speed: 150, kbResist: 0.8, material: 'flesh', weak: ['ice', 'dark'], resist: ['thunder', 'fire'], light: { r: 120, color: '#bfe0ff', i: 0.7 },
    palette: { body: '#2a2a3a' },
    drops: [{ id: 'm_gale', p: 0.35 }, { id: 'm_crystal', p: 0.15 }, heart5(0.4)],
    desc: '폭풍 구름 속에 둥지를 튼 거대한 새. 날개 끝으로 땅의 세 곳을 가리키면 곧 그 자리에 벼락이 꽂힌다.',
  },
  cloud_jelly: {
    id: 'cloud_jelly', name: '뇌운 해파리', lv: 56, hp: 63, atk: 22, def: 2, res: 12, exp: 27, gold: [10, 24], score: 1400,
    size: { w: 44, h: 56 }, ai: 'jelly', aiParams: { range: 110, charge: 0.6, rate: 2.2 }, render: 'cloud_jelly', flying: true, phase: true, noArena: true,
    speed: 45, kbResist: 0.1, material: 'slime', weak: ['ice'], resist: ['thunder'], light: { r: 70, color: '#bfe0ff', i: 0.6 },
    palette: { body: '#9aa8b8' },
    drops: [{ id: 'mp', p: 0.2 }, { id: 'm_gale', p: 0.1 }],
    desc: '작은 뇌운이 해파리 모양으로 뭉친 것. 바람에 떠밀려 다니다가 가까이 오는 것에게 방전한다. 번쩍이기 시작하면 물러서라.',
  },

  // ───────────────────────── s18 악몽의 미궁 (lv 60) ─────────────────────────
  puppeteer: {
    id: 'puppeteer', name: '악몽 인형사', lv: 60, hp: 120, atk: 22, def: 6, res: 14, exp: 50, gold: [10, 24], score: 2500,
    size: { w: 44, h: 90 }, ai: 'puppeteer', aiParams: { keep: 220, maxPuppets: 2, summon: 5, rate: 2.4 }, render: 'puppeteer', flying: true,
    speed: 60, kbResist: 0.4, material: 'paper', weak: ['fire', 'holy'], resist: ['dark'], light: { r: 60, color: '#c060ff', i: 0.4 },
    palette: { body: '#3a2a3a' },
    drops: [{ id: 'm_dream', p: 0.25 }, { id: 'm_cloth', p: 0.2 }, heart5(0.3)],
    desc: '손가락마다 실을 매단 키 큰 인형사. 저주 인형을 불러내 실로 조종하고 바늘을 부채꼴로 던진다. 인형사를 쓰러뜨리면 인형들도 무너진다.',
  },
  faceless: {
    id: 'faceless', name: '얼굴 없는 자', lv: 60, hp: 180, atk: 24, def: 10, res: 10, exp: 56, gold: [16, 40], score: 3000,
    size: { w: 36, h: 104 }, ai: 'stalker', aiParams: { sight: 700, creep: 170, blink: 7, grab: 0.35 }, render: 'faceless',
    speed: 170, kbResist: 0.7, material: 'flesh', weak: ['holy'], resist: ['dark', 'ice'],
    palette: { body: '#141218' },
    drops: [{ id: 'm_dream', p: 0.3 }, { id: 'm_soul', p: 0.15 }, heart5(0.35)],
    desc: '얼굴이 있어야 할 자리가 매끈한 키 큰 형체. 당신이 바라보는 동안에는 움직이지 않는다. 등을 돌리는 순간 — 이미 등 뒤에 있다.',
  },
  dream_eater: {
    id: 'dream_eater', name: '꿈 삼키는 자', lv: 60, hp: 150, atk: 23, def: 8, res: 14, exp: 48, gold: [10, 24], score: 2400,
    size: { w: 64, h: 80 }, ai: 'voider', aiParams: { keep: 260, rate: 2.3 }, render: 'dream_eater', flying: true, phase: true,
    speed: 70, kbResist: 0.7, material: 'ghost', weak: ['holy', 'fire'], resist: ['dark'], light: { r: 80, color: '#c060ff', i: 0.6 },
    palette: { body: '#5a2a7a' },
    drops: [{ id: 'm_dream', p: 0.3 }, { id: 'm_dark', p: 0.15 }, heart5(0.3)],
    desc: '맥(貘)의 모습을 흉내 낸 악몽. 좋은 꿈을 먹던 짐승이 공허에 물들어 이제는 잠든 자의 숨결을 빨아들인다. 긴 코로 공간을 찢는다.',
  },

  // ───────────────────────── s19 썩어가는 숲 (lv 64) ─────────────────────────
  rot_treant: {
    id: 'rot_treant', name: '썩은 나무거인', lv: 64, hp: 230, atk: 24, def: 12, res: 8, exp: 64, gold: [16, 40], score: 3200,
    size: { w: 72, h: 120 }, ai: 'treant', aiParams: { sight: 480, windup: 0.8, rate: 2.2, sporeHits: 4 }, render: 'rot_treant',
    speed: 32, kbResist: 0.95, material: 'paper', weak: ['fire', 'holy'], resist: ['ice', 'dark'],
    palette: { body: '#4a3a24' },
    drops: [{ id: 'm_spore', p: 0.3 }, { id: 'food', p: 0.2 }, heart5(0.4)],
    desc: '균사에 먹혀 걸어 다니게 된 고목. 두 팔을 땅에 꽂으면 뿌리 가시가 줄지어 솟는다. 여러 번 베이면 몸속의 포자를 뿜는다.',
  },
  plague_moth: {
    id: 'plague_moth', name: '역병 나방', lv: 64, hp: 72, atk: 22, def: 3, res: 8, exp: 32, gold: [10, 24], score: 1400,
    size: { w: 56, h: 40 }, ai: 'moth', aiParams: { dust: 3.0, hover: 180 }, render: 'plague_moth', flying: true,
    speed: 120, kbResist: 0.1, material: 'paper', weak: ['fire'], resist: ['dark'], light: { r: 50, color: '#c8ff6a', i: 0.4 },
    palette: { body: '#8a7a4a' },
    drops: [{ id: 'm_spore', p: 0.2 }, { id: 'mp', p: 0.15 }],
    desc: '날개 가루가 곧 포자인 커다란 나방. 머리 위를 맴돌며 부패의 가루를 뿌린다. 불에 약하다.',
  },
  fungal_husk: {
    id: 'fungal_husk', name: '균사 망자', lv: 64, hp: 143, atk: 22, def: 5, res: 5, exp: 37, gold: [10, 24], score: 2100,
    size: { w: 34, h: 84 }, ai: 'husk', aiParams: { riseTime: 0.9, chaseMul: 1.2, sight: 440 }, render: 'fungal_husk',
    speed: 44, kbResist: 0.3, material: 'flesh', weak: ['fire', 'holy'], resist: ['dark'],
    palette: { body: '#6a6a4a' },
    drops: [{ id: 'm_spore', p: 0.2 }, { id: 'food', p: 0.08 }],
    desc: '버섯이 머리를 뚫고 자란 망자. 느릿느릿 쫓아오다 쓰러질 때 포자 구름을 터뜨린다. 쓰러뜨린 자리에서 물러나라.',
  },

  // ───────────────────────── s20 태초의 공허 (lv 68) ─────────────────────────
  void_herald: {
    id: 'void_herald', name: '공허의 전령', lv: 68, hp: 170, atk: 24, def: 9, res: 16, exp: 59, gold: [16, 40], score: 3100,
    size: { w: 44, h: 100 }, ai: 'herald', aiParams: { keep: 280, aim: 0.9, rate: 2.4, blink: 0.4 }, render: 'void_herald', flying: true, phase: true,
    speed: 80, kbResist: 0.6, material: 'ghost', weak: ['holy'], resist: ['dark', 'ice', 'fire'], light: { r: 90, color: '#ffffff', i: 0.6 },
    palette: { body: '#0a0814' },
    drops: [{ id: 'm_void', p: 0.3 }, { id: 'm_soul', p: 0.2 }, heart5(0.35)],
    desc: '별이 없는 밤을 두른 사제. 무지갯빛 광선으로 조준선을 긋고 하늘에서 죽어 가는 별을 떨어뜨린다. 공격 뒤에는 반대편으로 건너뛴다.',
  },
  nihil_spawn: {
    id: 'nihil_spawn', name: '무의 파편', lv: 68, hp: 80, atk: 23, def: 5, res: 12, exp: 35, gold: [10, 24], score: 1400,
    size: { w: 48, h: 48 }, ai: 'chaos', aiParams: { sight: 520, rate: 1.8 }, render: 'nihil_spawn',
    speed: 80, kbResist: 0.4, material: 'ghost', weak: ['holy'], resist: ['dark'], light: { r: 60, color: '#ffffff', i: 0.4 },
    palette: { body: '#12101a' },
    drops: [{ id: 'm_void', p: 0.2 }, { id: 'mp', p: 0.15 }],
    desc: '공허가 흘린 검은 결정 조각. 부풀어 오르면 사방으로 조각을 흩뿌리고 먹잇감을 향해 몸을 던진다.',
  },
};
