// 장면 등록: 인게임 메뉴 (상태/장비/인벤토리/스킬/직업/퀘스트/비전서/도감/기록)
import { MenuScene } from './menu/menu.js';

export function register(game) {
  game.register('menu', MenuScene);
}
