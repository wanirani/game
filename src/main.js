// 부트스트랩: 설정/메타 로드 → 게임 초기화 → 장면 등록 → 폰트 대기 → 타이틀
import { game } from './core/game.js';
import { audio } from './core/audio.js';
import { assets } from './core/assets.js';
import { saves } from './core/save.js';
import { cloud } from './core/cloud.js';
import { registerScenes } from './scenes/index.js';
import { initQuests } from './game/quests.js';

async function boot() {
  const canvas = document.getElementById('screen');
  game.settings = saves.loadSettings();
  game.meta = saves.loadMeta();
  game.audio = audio; game.assets = assets; game.saves = saves;
  game.onSettingsAuto = (st) => saves.saveSettings(st); // 자동 품질 조정 결과를 다음 실행에도 유지
  audio.setVolumes(game.settings.musicVol, game.settings.sfxVol);
  game.init(canvas);
  registerScenes(game);
  initQuests(game);
  cloud.init(game); // 계정·클라우드 저장 (로그인한 적이 없으면 네트워크 요청 없음)
  game.recordScore = (score, stageId, mode = 'story') => {
    const m = game.meta, st = game.state;
    const run = st?.created ? `${st.slot ?? 1}:${st.created}` : null;
    const e = { score, stageId, charId: st?.charId, diff: st?.difficulty, date: Date.now(), mode, name: st?.name ?? '', run };
    // 같은 스토리 진행(세이브)의 기록은 하나만 남긴다 (스테이지마다 누적 점수로 중복 등록되지 않도록)
    if (run && mode === 'story') {
      const old = m.highScores.filter((h) => h.run === run && (h.mode || 'story') === mode);
      for (const h of old) { e.score = Math.max(e.score, h.score); e.name ||= h.name; }
      m.highScores = m.highScores.filter((h) => !old.includes(h));
    }
    m.highScores.push(e);
    m.highScores.sort((a, b) => b.score - a.score);
    m.highScores = m.highScores.slice(0, 20);
    saves.saveMeta(m);
  };
  const params = new URLSearchParams(location.search);
  game.debug = params.has('debug');
  // 폰트 로딩 (최대 2.5초 대기)
  try {
    await Promise.race([
      Promise.all(['700 20px "Noto Sans KR"', '800 20px "Nanum Myeongjo"', '700 20px "Cinzel Decorative"', '700 20px "Cinzel"'].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* 폰트 실패 무시 */ }
  assets.preload(['bg/title', 'portraits/kael', 'portraits/sera', 'portraits/victor', 'portraits/bran', 'portraits/lia', 'portraits/azel']);
  document.getElementById('boot')?.remove();
  game.start();
  const start = params.get('scene');
  if (start && game.registry[start]) {
    if (start === 'stage') {
      const { newGameState } = await import('./game/state.js');
      game.state = newGameState({ slot: 1, difficulty: params.get('diff') || 'normal', charId: params.get('char') || 'kael' });
      game.go('stage', { stageId: params.get('stage') || 's01', roomId: params.get('room') || null }, { fade: false });
    } else game.go(start, {}, { fade: false });
  } else game.go('title', {}, { fade: false });
  window.__game = game;
}
boot();
