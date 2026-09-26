// 세이브 데이터(진행 상태) 생성/보정
import { CHARACTERS } from '../data/characters.js';
import { getDiff } from '../data/difficulty.js';
import { makeItem } from '../data/items.js';
import { newHero } from './progression.js';
import { addItem } from './inventory.js';

export const SAVE_VERSION = 1;

export function newGameState({ slot = 1, difficulty = 'normal', charId = 'kael' } = {}) {
  const diff = getDiff(difficulty);
  const state = {
    version: SAVE_VERSION, slot, created: Date.now(), savedAt: 0,
    difficulty, charId,
    heroes: {},
    gold: 300,
    inventory: [],
    progress: {
      chapter: 0,            // 클리어한 마지막 챕터 번호
      cleared: {},           // stageId -> {rank, time, score}
      unlocked: ['s01'],     // 입장 가능한 스테이지
      flags: {},             // 스토리 플래그
      docs: [],              // 발견한 비전서 id
      lore: [],              // 발견한 기록물 id
      secrets: [],           // 발견한 비밀 key
      bosses: [],            // 처치한 보스 id
      relics: [],            // 드라큘라의 유물
      seenScripts: [],       // 이미 본 대사 id
    },
    quests: { active: {}, done: [] },
    stats: { playTime: 0, kills: 0, deaths: 0, maxCombo: 0, goldEarned: 0, enhanceOk: 0, enhanceFail: 0, minigameWins: 0, bossKills: 0, docs: 0 },
    lives: diff.lives,
    score: 0,
    bestiary: {},
    lastStage: null,
  };
  ensureHero(state, charId);
  // 시작 소모품
  addItem(state, Object.assign(makeItem('c_potion'), { qty: 3 }));
  return state;
}

/** 해당 캐릭터의 영웅 상태가 없으면 생성하고 시작 장비 지급 */
export function ensureHero(state, charId) {
  if (state.heroes[charId]) return state.heroes[charId];
  const others = Object.values(state.heroes);
  const lvl = others.length ? Math.max(1, Math.max(...others.map((h) => h.level)) - 3) : 1;
  const hero = newHero(charId, lvl);
  const ch = CHARACTERS[charId];
  const w = makeItem(ch.startWeapon);
  if (w) { addItem(state, w); hero.equip.weapon = w.uid; }
  for (const a of ch.startArmor || []) {
    const it = makeItem(a);
    if (it) { addItem(state, it); hero.equip[it.slot === 'acc' ? 'acc1' : it.slot] = it.uid; }
  }
  state.heroes[charId] = hero;
  return hero;
}

export function currentHero(state) { return state.heroes[state.charId]; }

/** 구버전 세이브 보정 */
export function migrateState(s) {
  s.progress ??= {};
  for (const k of ['cleared', 'flags']) s.progress[k] ??= {};
  for (const k of ['unlocked', 'docs', 'lore', 'secrets', 'bosses', 'relics', 'seenScripts']) s.progress[k] ??= [];
  if (!s.progress.unlocked.includes('s01')) s.progress.unlocked.push('s01');
  s.quests ??= { active: {}, done: [] };
  s.stats ??= {};
  s.bestiary ??= {};
  for (const h of Object.values(s.heroes || {})) { h.slots ??= [null, null, null, null]; h.skills ??= {}; }
  return s;
}
