// 부트스트랩: 설정/메타 로드 → 게임 초기화 → 장면 등록 → 폰트 대기 → 타이틀
import { game } from './core/game.js';
import { audio } from './core/audio.js';
import { assets } from './core/assets.js';
import { saves } from './core/save.js';
import { registerScenes } from './scenes/index.js';
import { initQuests } from './game/quests.js';

async function boot() {
  const canvas = document.getElementById('screen');
  game.settings = saves.loadSettings();
  game.meta = saves.loadMeta();
  game.audio = audio; game.assets = assets; game.saves = saves;
  audio.setVolumes(game.settings.musicVol, game.settings.sfxVol);
  game.init(canvas);
  registerScenes(game);
  initQuests(game);
  game.recordScore = (score, stageId, mode = 'story') => {
    const m = game.meta;
    m.highScores.push({ score, stageId, charId: game.state?.charId, diff: game.state?.difficulty, date: Date.now(), mode, name: game.state?.name ?? '' });
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
