// 프런트엔드 장면 스모크 테스트 도우미 (smoke.mjs 의 eval 단계에서 import 해서 사용)
//   eval=import('./tools/front_test.js?story')     컷신 테스트(가짜 대사)
//   eval=import('./tools/front_test.js?ending_true') 엔딩(트루) 테스트용 세이브 생성 후 엔딩
//   eval=import('./tools/front_test.js?slots')      세이브 3개 생성 후 슬롯 화면
const g = window.__game;
const which = new URL(import.meta.url).search.slice(1);
const { newGameState } = await import('../src/game/state.js');
const { saves } = await import('../src/core/save.js');

function fakeSave(slot, charId, diff, chapter, extra = {}) {
  const st = newGameState({ slot, difficulty: diff, charId });
  const order = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10', 's11', 's12', 's13'];
  st.progress.chapter = chapter;
  st.progress.unlocked = order.slice(0, chapter + 1);
  st.heroes[charId].level = 5 + chapter * 3;
  st.stats.playTime = 1800 + chapter * 2400;
  st.stats.kills = 120 * chapter; st.stats.maxCombo = 40 + chapter * 5; st.stats.deaths = 3;
  st.progress.relics = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'].slice(0, Math.floor(chapter / 2.5));
  st.progress.docs = ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07'].slice(0, chapter);
  st.gold = 1234 * chapter;
  st.score = 150000 * chapter;
  Object.assign(st, extra);
  saves.write(slot, st);
  return st;
}

if (which === 'story') {
  g.state = null;
  g.go('story', {
    lines: [
      { who: 'narrator', text: '1797년, 백 년에 한 번 핏빛 달이 떠오르는 밤. 에슈빌 마을에 불길이 치솟았다.' },
      { cmd: 'cg', id: 'cg_prologue_attack' },
      { who: 'kael', text: '이 냄새… 피와 재. 놈들이 돌아왔군. 비질리아, 오늘 밤은 길어질 거다.' },
      { who: 'npc_alberto', text: '카엘! 성당의 성물을 가져가게. 저 성에 들어가려면 반드시 필요할 걸세.' },
      { who: 'npc_carmilla', text: '후후… 사냥꾼님, 제 손을 잡으시겠어요?', choice: [{ text: '손을 잡는다', set: { carmilla_trust: true } }, { text: '검을 겨눈다' }] },
      { who: 'narrator', text: '끝.' },
    ],
    then: 'title', bg: 'cg/cg_prologue_moon', title: { eng: 'PROLOGUE', kor: '프롤로그 — 핏빛 달이 뜨는 밤' },
  });
} else if (which.startsWith('ending')) {
  const kind = which.split('_')[1] || 'true';
  const st = fakeSave(1, 'azel', 'hard', 13);
  if (kind === 'true') st.progress.cleared.s13 = { rank: 'A' };
  if (kind === 'normal') st.progress.flags.carmilla_trust = true;
  g.state = st;
  g.go('ending', {});
} else if (which === 'credits') {
  const st = fakeSave(1, 'sera', 'normal', 12);
  g.state = st;
  g.go('credits', { kind: 'normal', fromEnding: true });
} else if (which === 'slots') {
  fakeSave(1, 'kael', 'normal', 3);
  fakeSave(3, 'lia', 'nightmare', 9);
  g.go('slots', { mode: 'load' });
}
