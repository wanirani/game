// 장면 등록부. 새 장면을 추가하면 여기에 등록한다.
import { TitleScene } from './title.js';
import { StageScene } from './stage.js';
import { DialogueScene } from './dialogue.js';
import { BossIntroScene, UltCutinScene, DocumentScene, GameOverScene } from './overlays.js';
import { ResultsScene } from './results.js';
import { PauseScene } from './pause.js';

export function registerScenes(game) {
  game.register('title', TitleScene);
  game.register('stage', StageScene);
  game.register('dialogue', DialogueScene);
  game.register('bossIntro', BossIntroScene);
  game.register('ultCutin', UltCutinScene);
  game.register('document', DocumentScene);
  game.register('gameover', GameOverScene);
  game.register('results', ResultsScene);
  game.register('pause', PauseScene);
}
