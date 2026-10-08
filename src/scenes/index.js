// 장면 등록부. 코어 장면은 여기서, 나머지는 담당별 reg_*.js 에서 등록한다.
import { TitleScene } from './title.js';
import { StageScene } from './stage.js';
import { DialogueScene } from './dialogue.js';
import { BossIntroScene, UltCutinScene, DocumentScene, GameOverScene } from './overlays.js';
import { ResultsScene } from './results.js';
import { PauseScene } from './pause.js';
import { AwakenCutinScene } from './awaken_cutin.js';       // [hook:awaken] 각성기 컷인
import { CompanionJoinScene } from './companion_join.js';   // [hook:cmp] 동료 합류 연출
import { TrialEndScene } from './trial_end.js';             // 시련 실패 화면 (classes_t3 §9.4)
import { register as regFront } from './reg_front.js';   // 타이틀/슬롯/난이도/캐릭터선택/컷신/설정/엔딩/아케이드/랭킹
import { register as regTown } from './reg_town.js';     // 마을 허브/월드맵/상점/대장간/성당/퀘스트 게시판
import { register as regMenu } from './reg_menu.js';     // 인게임 메뉴(상태/장비/인벤토리/스킬/직업/퀘스트/비전서/도감)
import { register as regGames } from './reg_games.js';   // 여관 미니게임

export function registerScenes(game) {
  game.register('title', TitleScene);
  game.register('stage', StageScene);
  game.register('dialogue', DialogueScene);
  game.register('bossIntro', BossIntroScene);
  game.register('ultCutin', UltCutinScene);
  game.register('document', DocumentScene);
  game.register('gameover', GameOverScene);
  game.register('trialEnd', TrialEndScene);   // 시련 실패: 다시 도전 / 성당으로
  game.register('results', ResultsScene);
  game.register('pause', PauseScene);
  game.register('awakenCutin', AwakenCutinScene);       // [hook:awaken]
  game.register('companionJoin', CompanionJoinScene);   // [hook:cmp]
  regFront(game);
  regTown(game);
  regMenu(game);
  regGames(game);
}
