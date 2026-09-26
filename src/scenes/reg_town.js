// 마을 장면 등록: 허브 · 월드맵 · 상점 · 대장간 · 성당 · 의뢰 게시판 · 동료(영웅 교체) · 영혼의 마구간
import { HubScene } from './town/hub.js';
import { WorldMapScene } from './town/worldmap.js';
import { ShopScene } from './town/shop.js';
import { SmithScene } from './town/smith.js';
import { ChurchScene } from './town/church.js';
import { QuestBoardScene } from './town/questboard.js';
import { PartyScene } from './town/party.js';
import { StableScene } from './town/stable.js';   // [hook:cmp]

export function register(game) {
  game.register('hub', HubScene);
  game.register('worldmap', WorldMapScene);
  game.register('shop', ShopScene);
  game.register('smith', SmithScene);
  game.register('church', ChurchScene);
  game.register('questboard', QuestBoardScene);
  game.register('party', PartyScene);
  game.register('stable', StableScene);   // [hook:cmp]
}
