// 마을 장면 등록: 허브 · 월드맵 · 상점 · 대장간 · 성당 · 의뢰 게시판 · 동료
import { HubScene } from './town/hub.js';

export function register(game) {
  game.register('hub', HubScene);
}
