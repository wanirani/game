// 2부 보스 데이터 C: b_narkissa(s14), b_moloch(s15), b_dagon(s16), b_ziz(s17) — world2 §6.1–6.5. 소유: P2-DATA (W1) → BOSS-P2-1 (W2 조정)
// 스키마: game/bosses/boss.js 상단 주석. hp/atk/def 는 레벨 1 기준값 — enemyStats() 가 스테이지 레벨·난이도 bossHp 로 스케일한다.
// hpMul: 추가 체력 배율 · phases: 체력 비율 경계 · contact: 접촉 피해 배율 · size = 몸통 판정 크기 (그림은 훨씬 크다).
// form2: 형태 변화 뒤 HUD/보스 소개 이름·칭호·초상화 · drops: 고유 아이템 + 세계의 심장(k_heart_n, 중복 드롭 없음 — game/loot.js).
// music: boss3 = 나르키사·다곤·마라, boss4 = 몰록·지즈·베헤모스 (MASTER_PLAN §1.19). 클래스는 game/bosses/c_*.js (BossC ← BossB 상속).
// 조정 (BOSS-P2-1, world2 §15 목표 '보스 타수 110–170 · 받는 피해 12–22%', tools/balance.mjs normal kael):
//   몰록 hpMul 1.3 → 1.15 — 방어 26 에 몸통 부위 방어 ×1.5 까지 겹쳐 kael 189타(목표 초과)였다 → 167타. 화로 창살이 열릴 때(×0.5)가 공략 창.
//   나르키사는 131타 · 16.0% 로 목표 안이라 명세 값 그대로.
export const BOSSES_C = {
  b_narkissa: {
    id: 'b_narkissa', name: '나르키사', title: '만경(萬鏡)의 여제', hp: 2300, hpMul: 1.3, atk: 36, def: 18, res: 20, exp: 2100, score: 250000,
    size: { w: 110, h: 250 }, flying: true, contact: 0.7, material: 'ice', weak: ['holy', 'thunder'], resist: ['ice', 'dark'], phases: [0.66, 0.33],
    music: 'boss3', portrait: 'portraits/b_narkissa', stageId: 's14', drops: ['u_narkissa', 'k_heart_1'], light: { r: 260, color: '#dff4ff', i: 0.8 },
    form2: { name: '깨진 여제 나르키사', title: '천 개의 눈을 가진 거울', portrait: 'portraits/b_narkissa2' },
    intro: '아름답지? 네 모든 얼굴이 내 드레스에 걸려 있단다.',
    desc: '거울 세계의 수호자. 영혼에게 참된 얼굴을 보여 주던 여제는 공허의 속삭임 끝에 아름다운 것만 보려고 제 얼굴을 깨뜨렸다.',
  },
  b_moloch: {
    id: 'b_moloch', name: '몰록', title: '용광로의 우상', hp: 2500, hpMul: 1.15, atk: 38, def: 26, res: 12, exp: 2310, score: 270000,
    size: { w: 200, h: 300 }, flying: false, contact: 0.9, material: 'metal', weak: ['ice', 'thunder'], resist: ['fire', 'dark'], phases: [0.6, 0.3],
    music: 'boss4', portrait: 'portraits/b_moloch', stageId: 's15', drops: ['u_moloch', 'k_heart_2'], light: { r: 320, color: '#ff7a2a', i: 0.9 },
    intro: '더 많은 쇠. 더 많은 불. 더 많은 사슬을!',
    desc: '세계를 붙드는 닻의 사슬을 벼리던 대장장이 신. 공허에 물든 뒤로는 세계를 끌어내리는 사슬을 벼린다. 배 속 화로에는 녹지 못한 영혼들이 갇혀 있다.',
  },
  b_dagon: {
    id: 'b_dagon', name: '다곤', title: '가라앉은 성소의 사제왕', hp: 2600, hpMul: 1.3, atk: 39, def: 20, res: 22, exp: 2520, score: 290000,
    size: { w: 180, h: 240 }, flying: true, contact: 0.8, material: 'flesh', weak: ['thunder'], resist: ['ice', 'fire', 'dark'], phases: [0.6, 0.3],
    music: 'boss3', portrait: 'portraits/b_dagon', stageId: 's16', drops: ['u_dagon', 'k_heart_3'], light: { r: 280, color: '#3ad0c8', i: 0.75 },
    intro: '빛… 수면 위의 빛을… 본 지가 언제였던가.',
    desc: '조수의 수호자였던 사제왕. 공허를 피해 도시를 바다 밑으로 가라앉혔지만, 빛이 닿지 않는 곳에서 빛을 잊었다.',
  },
  b_ziz: {
    id: 'b_ziz', name: '지즈', title: '폭풍을 부르는 거신조', hp: 2700, hpMul: 1.35, atk: 40, def: 18, res: 18, exp: 2730, score: 310000,
    size: { w: 260, h: 200 }, flying: true, contact: 0.9, material: 'flesh', weak: ['ice', 'dark'], resist: ['thunder', 'fire'], phases: [0.65, 0.3],
    music: 'boss4', portrait: 'portraits/b_ziz', stageId: 's17', drops: ['u_ziz', 'u_ziz2', 'k_heart_4'], light: { r: 300, color: '#bfe0ff', i: 0.85 },
    intro: '(하늘 전체가 날개가 되어 태양을 가린다.)',
    desc: '하늘 왕국의 신이자 폭풍 그 자체. 날개를 펴면 해가 가려지고, 깃털 하나하나가 번개다. 까마귀 백성은 그를 어머니라 불렀다.',
  },
};
