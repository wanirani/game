// 프런트엔드 장면 등록: 타이틀/슬롯/난이도/캐릭터 선택/컷신/설정/엔딩/크레딧/아케이드/보스 러시/서바이벌/연습/명예의 전당
// (타이틀은 scenes/index.js 에서 등록되지만 여기서도 같은 클래스로 덮어써도 무방)
import { TitleScene } from './title.js';

export function register(game) {
  game.register('title', TitleScene);
}
