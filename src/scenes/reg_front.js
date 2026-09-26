// 프런트엔드 장면 등록: 타이틀/슬롯/난이도/캐릭터 선택/컷신/설정/엔딩/크레딧/아케이드(보스 러시·서바이벌·연습)/명예의 전당
// 보조 장면: frontConfirm(예/아니요), saveCode(세이브 코드), initials(이니셜 입력), arcadePause, arcadeResults, practice
// 계정: account(로그인·가입·비밀번호·복구·탈퇴·동기화), cloudConflict(클라우드 기록 받기/올리기 선택)
import { TitleScene } from './title.js';
import { SlotsScene } from './front/slots.js';
import { DifficultyScene } from './front/difficulty.js';
import { CharSelectScene } from './front/charselect.js';
import { StoryScene } from './front/story.js';
import { OptionsScene } from './front/options.js';
import { EndingScene, CreditsScene } from './front/ending.js';
import { ArcadeScene } from './front/arcade.js';
import { BossRushScene, SurvivalScene, PracticeScene, ArcadePauseScene, ArcadeResultsScene } from './front/arcade_run.js';
import { HighscoreScene, InitialsScene } from './front/highscore.js';
import { ConfirmScene, SaveCodeScene } from './front/dialogs.js';
import { AccountScene } from './front/account.js';
import { CloudConflictScene } from './front/cloud_ui.js';

export function register(game) {
  game.register('title', TitleScene);
  game.register('slots', SlotsScene);
  game.register('difficulty', DifficultyScene);
  game.register('charselect', CharSelectScene);
  game.register('story', StoryScene);
  game.register('options', OptionsScene);
  game.register('ending', EndingScene);
  game.register('credits', CreditsScene);
  game.register('arcade', ArcadeScene);
  game.register('bossrush', BossRushScene);
  game.register('survival', SurvivalScene);
  game.register('practice', PracticeScene);
  game.register('arcadePause', ArcadePauseScene);
  game.register('arcadeResults', ArcadeResultsScene);
  game.register('highscore', HighscoreScene);
  game.register('initials', InitialsScene);
  game.register('frontConfirm', ConfirmScene);
  game.register('saveCode', SaveCodeScene);
  game.register('account', AccountScene);
  game.register('cloudConflict', CloudConflictScene);
}
