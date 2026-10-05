// 외전 보스 데이터 E: b_argen (s21, 외전 「하늘 정원의 용」) — docs/specs/ex_s21.md §2. 소유: EX-BOSS
// 스키마: game/bosses/boss.js 상단 주석 (bosses_c.js 머리말 참고). 클래스는 game/bosses/e_argen.js (BossC 상속).
// 체급: 지즈(b_ziz, s17)보다 한 단계 위 · 니힐(b_nihil, s20 최종)보다 아래. s21 레벨 70 (s20 은 68).
// 밸런스 (EX-BOSS, tools/balance.mjs 와 같은 식 — 보통 난이도 kael, s20 클리어 레벨 67 · s20 장비 기준):
//   목표 보스 타수 ≈165–185 (지즈 144 · 니힐 213 사이, world2 §15 s19 띠 130–190 안) · 받는 피해 16–20% (지즈 13.8 · 니힐 18.5).
//   결과 (hp 2900 · hpMul 1.2, s20 클리어 레벨 67): kael 170타 · 25초 · 받는 피해 18.4% (지즈 144타·21초 / 니힐 213타·31초).
//   다른 영웅도 같은 자리 (s17 < s21 < s20): 이졸데 120타 · 세라 116 · 빅터 81 · 브란 142 · 리아 133 · 아젤 120.
//   위 수치는 기본 방어(부위 배율 1.0) 기준 — 몸통 1.15 · 머리 1.0 · 공허 핵 0.75/0.45(2페이즈+) 는 e_argen.js (핵을 노리면 더 빨라진다).
// 경험치: 2부 보스 규칙 그대로 ×0.35 (명세 값 9600 → 3360). 외전이라 레벨 곡선을 끌어올리지 않게 니힐(5250)보다 낮게.
// drops: 고유 장비 둘(u_argen 은룡창 · u_argen2 비늘 망토, data/items.js) — 세계의 심장 없음. 신화 무기는 2부 규칙(1.5%)대로 loot.js.
// 결말: 체력 0 → 보스 처치 처리(경험치·드롭·플래그 boss_b_argen)는 같고, 연출만 '정화' (공허의 핵이 부서지고 은빛이 돌아와 날아오른다).
// form2: 3페이즈(awaken) 전환에서 이름·칭호가 바뀐다 (은빛이 돌아오는 중).
export const BOSSES_E = {
  b_argen: {
    id: 'b_argen', name: '아르겐', title: '공허에 물든 은룡', hp: 2900, hpMul: 1.2, atk: 45, def: 22, res: 22, exp: 3360, score: 420000,
    size: { w: 230, h: 120 }, flying: true, contact: 0.8, material: 'flesh', weak: ['holy'], resist: ['thunder', 'dark'], phases: [0.65, 0.3],
    music: 'boss4', portrait: 'portraits/b_argen', stageId: 's21', drops: ['u_argen', 'u_argen2'], light: { r: 300, color: '#d8e4ff', i: 0.8 },
    form2: { name: '아르겐', title: '은빛을 되찾는 용', portrait: 'portraits/b_argen' },
    intro: '(은빛 비늘 사이로 검보라 결정이 맥동한다. 용의 눈에는 주인을 알아보는 빛이 없다.)',
    desc: '하늘 기사단의 성소를 지키던 은룡이자 이졸데의 오랜 짝. 니힐이 스러진 뒤 흩어진 공허의 결정이 그 가슴에 박혀, 하늘 정원의 둥지가 검보라 결정으로 뒤덮였다.',
  },
};
