// 2부 보스 데이터 D: b_mara(s18), b_behemoth(s19), b_nihil(s20, 최종) — world2 §6.1, §6.6–6.8. 소유: P2-DATA (W1) → BOSS-P2-3 (W2 조정)
// 스키마: game/bosses/boss.js 상단 주석 (bosses_c.js 머리말 참고). 클래스는 game/bosses/d_*.js (BossB 상속).
// b_nihil: 4페이즈(phases 3개), drops 에 세계의 심장 없음 · 신화 무기(MYTHIC_WEAPONS_P2)는 game/loot.js 가 첫 처치 때 준다.
// 밸런스 (BOSS-P2-3, world2 §15 · node tools/balance.mjs normal kael): 마라 hpMul 1.35→1.25 (s18 보스 타수 ≈150–170),
//   베헤모스 hp 3000→2300 · hpMul 1.4→1.15 (방어 28 이 커서 명세 값이면 s19 타수 ≈250–280 → ≈155–180). 공격력 · 방어는 명세 그대로.
// 경험치 (W4 FIX-DATA, 요청 #233 · 리드 결정 #346): exp ×0.35 (마라 8400→2940, 베헤모스 9000→3150, 니힐 15000→5250) — bosses_c.js 머리말 참고.
export const BOSSES_D = {
  b_mara: {
    id: 'b_mara', name: '마라', title: '악몽을 낳는 자', hp: 2700, hpMul: 1.25, atk: 41, def: 17, res: 24, exp: 2940, score: 330000,
    size: { w: 140, h: 220 }, flying: true, contact: 0.7, material: 'flesh', weak: ['holy', 'fire'], resist: ['dark', 'ice'], phases: [0.6, 0.3],
    music: 'boss3', portrait: 'portraits/b_mara', stageId: 's18', drops: ['u_mara', 'k_heart_5'], light: { r: 240, color: '#c060ff', i: 0.7 },
    form2: { name: '요람의 마라', title: '꿈을 삼키는 요람', portrait: 'portraits/b_mara' },
    intro: '쉬— 쉬— 착하지. 이제 눈을 감으렴. 영원히.',
    desc: '잠든 자의 가슴에 올라앉는 악몽의 정령. 본래는 나쁜 꿈을 대신 먹어 주던 꿈의 산파였으나, 공허가 배를 채워 주지 않자 꿈을 낳기 시작했다.',
  },
  b_behemoth: {
    id: 'b_behemoth', name: '베헤모스', title: '부패한 대지의 짐승', hp: 2300, hpMul: 1.15, atk: 42, def: 28, res: 16, exp: 3150, score: 350000,
    size: { w: 340, h: 230 }, flying: false, contact: 1.0, material: 'flesh', weak: ['fire', 'holy'], resist: ['ice', 'dark'], phases: [0.6, 0.3],
    music: 'boss4', portrait: 'portraits/b_behemoth', stageId: 's19', drops: ['u_behemoth', 'k_heart_6'], light: { r: 300, color: '#9ad040', i: 0.6 },
    intro: '(대지가 신음한다. 숲 하나가 통째로 일어섰다.)',
    desc: '숲을 등에 지고 다니던 온순한 대지의 짐승. 공허의 굶주림이 포자가 되어 내려앉자, 균사의 여왕이 그 척수를 붙들고 춤추게 했다.',
  },
  b_nihil: {
    // 밸런스 (BOSS-P2-4, world2 §15 s20 보스 타수 180–260 · 받은 피해 14–24%): hpMul 1.6→1.32 (명세 값이면 kael 타수 ≈272–281 → ≈215–241)
    // phases 첫 경계 0.75 → 0.7: BAL-TUNE (bal_audit.md 권고 5) — 1페이즈가 HP 25 → 30% (신성 무기 카엘은 1페이즈 패턴 2–3개 · 7–12초였다). 총 HP 그대로, 피날레 보호(15%)는 마지막 경계라 그대로
    id: 'b_nihil', name: '니힐', title: '태초의 공허', hp: 3200, hpMul: 1.32, atk: 44, def: 22, res: 22, exp: 5250, score: 600000,
    size: { w: 220, h: 280 }, flying: true, contact: 0.8, material: 'ghost', weak: ['holy'], resist: ['dark', 'ice', 'fire', 'thunder'], phases: [0.7, 0.45, 0.15],
    music: 'nihil', portrait: 'portraits/b_nihil', stageId: 's20', drops: ['u_nihil', 'u_nihil2'], light: { r: 340, color: '#ffffff', i: 0.6 },
    form2: { name: '니힐', title: '만유(萬有)를 흉내 내는 무', portrait: 'portraits/b_nihil2' },
    intro: '……',
    desc: '빛도 어둠도 태어나기 전의 무(無). 혼돈의 군주는 그가 꾼 꿈 하나에 불과했다. 소리를, 빛을, 심장 소리를 삼켜 다시 고요로 돌아가려 한다.',
  },
};
