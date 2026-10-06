// 외전 보스 데이터 E: b_argen (s21, 외전 「하늘 정원의 용」) — docs/specs/ex_s21.md §2. 소유: EX-BOSS
//                   b_nemain (s22, 외전 「까마귀의 이름」) — docs/specs/ex_s22.md §2. 소유: EX2-BOSS (아래 b_nemain 머리말)
//                   b_hagen (s23, 외전 「빈칸의 현상금」) — docs/specs/ex_s23.md §2. 소유: EX3-BOSS (아래 b_hagen 머리말)
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
// ── b_nemain (s22) — 둥지어미 / 네메인. 클래스 game/bosses/e_nemain.js (BossC 상속) ──
// 체급: 아르겐(s21)과 니힐(s20) 사이. s22 레벨 72. 2페이즈 (50% 전환 'unmask' 에서 가면이 깨지고 form2 '네메인').
// 밸런스 (EX2-BOSS, tools/balance.mjs 와 같은 식 — 보통 난이도, s21 클리어 레벨 · 그다음 칸 장비 기준):
//   목표 ≈160–180타 · 받는 피해 16–20% (docs/specs/ex_s22.md §2 체급).
//   결과 (hp 2800 · hpMul 1.3 · def 21 · res 21, s21 클리어 레벨 70): kael 176타 · 받는 피해 18.8% — 아르겐 170타 · 18.4%, 니힐 213타 · 18.5%.
//   다른 영웅도 아르겐과 같은 순서: 브란 146 · 리아 138 · 이졸데 124 = 아젤 124 · 세라 122 · 빅터 85 (아르겐 142 · 133 · 120 = 120 · 116 · 81).
//   명세 시작값(hpMul 1.2 · res 24)은 kael 162타로 아르겐보다 가볍고 세라(지팡이·마법)가 이졸데·아젤 위로 올라가 → hpMul 1.3 · res 21.
//   위 수치는 기본 방어(부위 배율 1.0) 기준 — 판정 부위 배율(가면 0.85 · 몸통 1.0 · 다리 1.15 · 펼친 망토 1.3)은 e_nemain.js.
// 경험치 3500 (명세 값 그대로, 외전이라 니힐 5250 보다 낮게). 드롭 u_nemain(흑우 단검, data/items.js) 하나.
// 결말: 체력 0 → 보스 처치 처리(경험치·드롭·플래그 boss_b_nemain)는 같고 연출만 '굴복' (까마귀 떼가 흩어지고 무릎을 꿇는다, 파편 폭발 없음).
// ── b_hagen (s23) — 하겐 / 은빛 늑대. 클래스 game/bosses/e_hagen.js (BossC 상속) ──
// 체급: 네메인(s22)과 니힐(s20) 사이. s23 레벨 74. 2페이즈 (50% 전환 'moonrise' 에서 늑대가 되고 form2 '은빛 늑대'). 15% 이하 한 번 'offer'.
// 밸런스 (EX3-BOSS, tools/balance.mjs 와 같은 식 — 보통 난이도, s22 클리어 레벨 · 그다음 칸 장비 기준, docs/specs/ex_s23.md §2.3 확인 1):
//   목표 카엘 185–200타 · 받는 피해 19–21% · 다른 영웅은 아르겐·네메인과 같은 순서, 네메인 값보다 4–14% 많게.
//   결과 (hp 2900 · hpMul 1.35 · atk 46 · def 22 · res 20, s22 클리어 레벨 73): kael 196타 · 받는 피해 20.7% — 네메인 176타 · 18.8%, 아르겐 170 · 18.4%, 니힐 213 · 18.5%.
//   다른 영웅도 같은 순서 (네메인 대비 +4.9…+12.3%): 브란 164 · 리아 152 · 이졸데 138 = 아젤 138 · 세라 128 · 빅터 94 (네메인 146 · 138 · 124 = 124 · 122 · 85).
//   명세 시작값(hp 2950 · atk 47)은 kael 199타 · 21.1% 로 두 띠의 끝에 걸려 → hp 2900 · atk 46.
//   위 수치는 기본 방어(부위 배율 1.0) 기준 — 판정 부위 배율(1페이즈 모자 0.9 · 몸통 1.0 · 다리 1.15 / 2페이즈 주둥이 1.2 · 몸통 1.0 · 등판 0.85 · 다리 1.1)은 e_hagen.js.
// 경험치 3600 (명세 값 그대로). 드롭 없음 (drops: [] — 보상은 아웃트로의 신화 무기 일곱 자루, §3 · §9-4). 2부 보스 공통 신화 1.5% 는 loot.js 그대로.
// 결말: 체력 0 → 보스 처치 처리(경험치·플래그 boss_b_hagen)는 같고 연출만 '쓰러짐' (늑대가 쓰러지고 새벽빛에 사람으로 돌아와 눕는다, 파편 폭발 없음).
// 도감(desc)에는 반전을 쓰지 않는다.
export const BOSSES_E = {
  b_argen: {
    id: 'b_argen', name: '아르겐', title: '공허에 물든 은룡', hp: 2900, hpMul: 1.2, atk: 45, def: 22, res: 22, exp: 3360, score: 420000,
    size: { w: 230, h: 120 }, flying: true, contact: 0.8, material: 'flesh', weak: ['holy'], resist: ['thunder', 'dark'], phases: [0.65, 0.3],
    music: 'boss4', portrait: 'portraits/b_argen', stageId: 's21', drops: ['u_argen', 'u_argen2'], light: { r: 300, color: '#d8e4ff', i: 0.8 },
    form2: { name: '아르겐', title: '은빛을 되찾는 용', portrait: 'portraits/b_argen' },
    intro: '(은빛 비늘 사이로 검보라 결정이 맥동한다. 용의 눈에는 주인을 알아보는 빛이 없다.)',
    desc: '하늘 기사단의 성소를 지키던 은룡이자 이졸데의 오랜 짝. 니힐이 스러진 뒤 흩어진 공허의 결정이 그 가슴에 박혀, 하늘 정원의 둥지가 검보라 결정으로 뒤덮였다.',
  },
  b_nemain: {
    id: 'b_nemain', name: '둥지어미', title: '이름을 거두는 까마귀', hp: 2800, hpMul: 1.3, atk: 46, def: 21, res: 21, exp: 3500, score: 430000,
    size: { w: 64, h: 150 }, flying: false, contact: 0.5, material: 'flesh', weak: ['holy'], resist: ['dark'], phases: [0.5],
    music: 'boss3', portrait: 'portraits/b_nemain', stageId: 's22', drops: ['u_nemain'], light: { r: 220, color: '#ff4a6a', i: 0.6 },
    form2: { name: '네메인', title: '가면을 벗은 어미', portrait: 'portraits/b_nemain2' },
    intro: '(부리 가면 너머로 붉은 눈이 가늘어진다. 깃털 망토 자락마다 까마귀의 눈이 깜빡인다.)',
    desc: '까마귀 결사의 둥지를 서른 해 동안 지켜 온 여인. 이름 없는 아이들을 칼로 길러 냈고, 결사가 문을 닫던 날 모든 칼에게 이름을 반납하라는 소집령을 내렸다.',
  },
  b_hagen: {
    id: 'b_hagen', name: '하겐', title: '늑대를 잡던 사냥꾼', hp: 2900, hpMul: 1.35, atk: 46, def: 22, res: 20, exp: 3600, score: 440000,
    size: { w: 60, h: 146 }, flying: false, contact: 0.6, material: 'flesh', weak: ['holy'], resist: ['ice'], phases: [0.5],
    music: 'boss2', portrait: 'portraits/b_hagen', stageId: 's23', drops: [], light: { r: 200, color: '#ffcf6a', i: 0.55 },
    form2: { name: '은빛 늑대', title: '사냥꾼이었던 짐승', portrait: 'portraits/b_hagen2' },
    intro: '(챙 넓은 모자 아래에서 노란 눈이 달빛을 받아 빛난다. 장총을 쥔 손등에 은빛 털이 돋아 있다.)',
    desc: '북쪽 설원에서 사십 년 동안 늑대를 사냥한 늙은 사냥꾼. 현상금 공고의 액수 칸을 늘 비워 두었고, 사냥꾼들 사이에서는 "은빛 늑대"라는 소문과 함께 이름이 오르내렸다.',
  },
};
