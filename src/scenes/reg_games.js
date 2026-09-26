// 장면 등록: 흑묘 여관(미니게임 홀) + 미니게임 5종
import { InnScene } from './games/inn.js';
import { DiceScene } from './games/dice.js';
import { BlackjackScene } from './games/blackjack.js';
import { SlotScene } from './games/slot.js';
import { DuelScene } from './games/duel.js';
import { MemoryScene } from './games/memory.js';

export function register(game) {
  game.register('inn', InnScene);
  game.register('minigame_dice', DiceScene);
  game.register('minigame_blackjack', BlackjackScene);
  game.register('minigame_slot', SlotScene);
  game.register('minigame_duel', DuelScene);
  game.register('minigame_memory', MemoryScene);
}
