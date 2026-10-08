// 비전 기술 7 — 숨은 직업(비전) 전용 액티브 (docs/specs/classes_t3.md §2.3 · §5)
// data/skills.js 가 끝에서 SKILLS 에 합친다 (branch 'asc', row 0, req []). 어느 스킬 트리에도 들어가지 않는다.
//  · 배우기: 비전 해금(hero.ascUnlocked 에 reqAsc) + 레벨 75/77/79/81/83 (reqLevel + 현재 레벨×2), 레벨당 SP 2, 최대 5
//  · 1레벨은 비전이 열리면 무료 (progression.unlockFromTrial · ascend, state.js migrateAsc 가 다시 채움)
//  · 장착·사용: 그 비전 직업일 때만 (skills.js equipSkill · player.js trySkill)
//  · 동작: game/class_perks_a..d.js 의 ACTIVES_X (castSkill 이 SKILL_IMPL 에 없으면 PERK.ascActive 로 찾는다)
//  · 아이콘 그림 없음 — drawSkillGlyph 기본 모양을 color 로 칠한다
// v: {키: [1레벨 값, 레벨당 증가]} → desc 의 {키} 치환 (skills.js skillDesc). 순수 데이터 (import 없음)
const S = (id, charId, reqAsc, name, o) => ({ id, charId, name, type: 'active', maxLv: 5, reqLevel: 75, spCost: 2, reqAsc, ...o });

export const ASC_SKILLS = Object.freeze([
  S('asc_kael_firstseal', 'kael', 'kael_sealbearer', '제1봉인 — 발크레인 결계', { cost: 24, cd: 14, color: '#ffd84a',
    v: { dmg: [30, 4], r: [220, 10], t: [3, 0] },
    desc: '비질리아를 머리 위로 휘둘러 반경 {r}의 봉인진을 {t}초 동안 편다. 진 안의 적은 0.3초마다 위력 {dmg}% 신성 피해를 받고 절반 속도가 되며(보스는 25% 감속), 펼칠 때 진 안의 모든 적에게 봉인 5중첩을 새긴다.' }),
  S('asc_sera_seventhbell', 'sera', 'sera_bellsaint', '일곱 번째 종', { cost: 28, cd: 16, color: '#e8f0ff',
    v: { dmg: [80, 12], n: [5, 0], r: [260, 10] },
    desc: '머리 위에 환영의 종을 4초 동안 불러낸다. 종은 0.8초마다 {n}번 울려 반경 {r}에 위력 {dmg}% 신성 피해를 주고, 그 안의 적 탄환을 지우며, 울릴 때마다 최대 HP의 2%를 회복한다.' }),
  S('asc_victor_silverbullet', 'victor', 'victor_silverwolf', '은월탄 — 하겐의 마지막 탄환', { cost: 26, cd: 15, color: '#e8f0ff',
    v: { dmg: [480, 60] },
    desc: '0.35초 동안 겨눈 뒤 은탄 한 발을 쏜다. 화면 끝까지 모든 적을 꿰뚫고(위력 {dmg}%), 체력 50% 미만인 적에게는 치명타 확정. 이 탄으로 적을 처치할 때마다 재사용 대기가 25% 줄고(최대 50%), 달 게이지 +30.' }),
  S('asc_bran_oathbanner', 'bran', 'bran_oathlord', '서약의 군기', { cost: 22, cd: 18, color: '#ffcf6a',
    v: { dmg: [80, 12], t: [10, 0], n: [5, 0] },
    desc: '발밑에 새벽 서약의 군기를 {t}초 동안 꽂는다. 군기 반경 260 안에서는 주는 피해 +15%, 받는 피해 -20%, 초당 최대 HP 1% 회복, 경직 없음. 2초마다 군기에서 서약 기사의 영혼이 가장 가까운 적 쪽으로 돌격한다(위력 {dmg}%, {n}회).' }),
  S('asc_lia_frostwing', 'lia', 'lia_frostcrow', '동결의 날개', { cost: 20, cd: 12, color: '#bff4ff',
    v: { dmg: [150, 25], f: [50, 8], n: [6, 0] },
    desc: '앞으로 300을 꿰뚫고 돌진해 지나간 적을 벤다(위력 {dmg}%, 냉기 2중첩). 돌진한 자리에서 얼음 깃털 {n}개가 피어나 반경 500 안의 적을 쫓는다(각 위력 {f}%, 냉기 1중첩).' }),
  S('asc_azel_lullaby', 'azel', 'azel_dawnblood', '아멜리아의 자장가', { cost: 24, cd: 12, color: '#ffb060',
    v: { dmg: [360, 50], d: [20, 3] },
    desc: '현재 HP의 10%를 바쳐 주위 300도를 여명의 초승달로 벤다(반경 180, 위력 {dmg}%, 신성). 맞은 적은 3초 동안 0.5초마다 위력 {d}% 신성 피해. 한 명이라도 맞히면 바친 HP의 150%를 회복한다.' }),
  S('asc_isolde_breath', 'isolde', 'isolde_dragonbond', '아르겐의 숨결', { cost: 26, cd: 14, color: '#9fe8ff',
    v: { dmg: [35, 5], n: [10, 0] },
    desc: '어깨 위에 아르겐의 환영을 불러 1.5초 동안 앞쪽 320에 은빛 번개 숨결을 뿜는다(0.15초마다 위력 {dmg}%, {n}회, 짧은 경직). 숨결 동안 방향은 고정되고 움직일 수 있다.' }),
].map((s) => Object.freeze({ ...s, v: Object.freeze(s.v) })));
