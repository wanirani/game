// 세이브 데이터(진행 상태) 생성/보정
import { CHARACTERS } from '../data/characters.js';
import { CLASSES } from '../data/classes.js';
import { getDiff, DIFF } from '../data/difficulty.js';
import { makeItem } from '../data/items.js';
import { newHero } from './progression.js';
import { addItem, ensureWeapon } from './inventory.js';
import { MAX_LEVEL } from './stats.js';
import { ensureCompanionState, migrateCompanions } from './companion_state.js';   // [hook:cmp]

// 세이브 스키마 버전 (MASTER_PLAN §1.6). 2 = 제2부: progress.shards/hearts + state.companions (동료) + hero.companions (편성)
// migrateState 는 버전과 상관없이 매번 돌며 멱등이다 (두 번 돌려도 결과가 같다). 모르는 필드는 절대 지우지 않는다.
export const SAVE_VERSION = 2;

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
      shards: [],            // 별의 조각 k_star_1…6 (제2부, world.collect 가 기록)   [hook:p2]
      hearts: [],            // 세계의 심장 k_heart_1…6 (제2부)   [hook:p2]
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
  ensureCompanionState(state);   // [hook:cmp] 동료 상태 (아케이드 임시 세이브에도 생기지만 아케이드에선 쉰다)
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

/**
 * 이 세이브의 스토리 플래그로 합류가 확정된 영웅 id (CHARACTERS[id].unlock = { type:'story', flag }).
 * 헌터 해금은 메타(meta.unlockedChars)에 남지만 합류 장면 이전 세이브·다른 기기의 메타에는 없을 수 있다 →
 * 마을(town/hub.js)이 들어올 때 메타에 보태고, 헌터 교체(town/party.js)는 이 목록도 열어 준다. 아케이드 임시 세이브는 []
 */
export function storyJoinedChars(state) {
  const f = state?.progress?.flags;
  if (!isObj(f) || state.arcade) return [];
  return Object.values(CHARACTERS).filter((c) => c.unlock?.type === 'story' && c.unlock.flag && f[c.unlock.flag] === true).map((c) => c.id);
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const EQUIP_SLOTS = ['weapon', 'head', 'body', 'cloak', 'acc1', 'acc2'];

/** 구버전·손상된 세이브 보정 (누락 필드 채움, 잘못된 값 교정 — 불러온 직후 게임이 멈추지 않도록) */
export function migrateState(s) {
  if (typeof s.difficulty !== 'string' || !Object.hasOwn(DIFF, s.difficulty)) s.difficulty = 'normal';
  if (!isObj(s.progress)) s.progress = {};
  for (const k of ['cleared', 'flags']) if (!isObj(s.progress[k])) s.progress[k] = {};
  for (const k of ['unlocked', 'docs', 'lore', 'secrets', 'bosses', 'relics', 'seenScripts', 'shards', 'hearts']) if (!Array.isArray(s.progress[k])) s.progress[k] = [];
  // 별의 조각·세계의 심장: 문자열 id 만, 중복 없이 (개수로 진엔딩을 가르므로)   [hook:p2]
  for (const k of ['shards', 'hearts']) s.progress[k] = [...new Set(s.progress[k].filter((id) => typeof id === 'string'))];
  if (!s.progress.unlocked.includes('s01')) s.progress.unlocked.push('s01');
  // 7번째 영웅 이졸데(hero7)는 14장 아웃트로에서 합류한다(isolde_joined). 합류 장면이 생기기 전에 14장을 깬 세이브도 합류한 것으로 (아케이드 임시 세이브 제외)
  if (!s.arcade && s.progress.cleared.s14) s.progress.flags.isolde_joined = true;
  s.progress.chapter = Number.isFinite(s.progress.chapter) ? s.progress.chapter : 0;
  if (!isObj(s.quests)) s.quests = { active: {}, done: [] };
  if (!isObj(s.quests.active)) s.quests.active = {};
  if (!Array.isArray(s.quests.done)) s.quests.done = [];
  if (!isObj(s.stats)) s.stats = {};
  s.stats.playTime = Number.isFinite(s.stats.playTime) ? s.stats.playTime : 0;
  if (!isObj(s.bestiary)) s.bestiary = {};
  for (const k of ['gold', 'score']) if (!Number.isFinite(s[k])) s[k] = 0;
  if (!Number.isFinite(s.lives)) s.lives = getDiff(s.difficulty).lives;
  s.inventory = (Array.isArray(s.inventory) ? s.inventory : []).filter((it) => isObj(it) && typeof it.baseId === 'string' && it.uid);
  // 영웅: 존재하지 않는 캐릭터는 버리고, 현재 캐릭터가 없으면 새로 만든다
  if (!isObj(s.heroes)) s.heroes = {};
  for (const id of Object.keys(s.heroes)) if (!Object.hasOwn(CHARACTERS, id) || !isObj(s.heroes[id])) delete s.heroes[id];
  if (!Object.hasOwn(CHARACTERS, s.charId)) s.charId = Object.keys(s.heroes)[0] ?? 'kael';
  const uids = new Set(s.inventory.map((it) => it.uid));
  for (const [id, h] of Object.entries(s.heroes)) {
    const ch = CHARACTERS[id];
    h.charId = id;
    h.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number.isFinite(h.level) ? h.level : 1)));
    if (!Number.isFinite(h.exp)) h.exp = 0;
    if (!Number.isFinite(h.sp)) h.sp = 0;
    if (!CLASSES[h.classId] || CLASSES[h.classId].charId !== id) h.classId = ch.rootClass;
    if (!isObj(h.skills)) h.skills = {};
    if (!Array.isArray(h.slots)) h.slots = [null, null, null, null];
    while (h.slots.length < 4) h.slots.push(null);
    h.sub ??= ch.startSub;
    if (!isObj(h.equip)) h.equip = {};
    for (const k of EQUIP_SLOTS) if (!h.equip[k] || !uids.has(h.equip[k])) h.equip[k] = null;
    ensureWeapon(s, h); // 무기 칸은 비어 있으면 안 된다 (강화 파괴 등으로 비었던 세이브 복구)
  }
  if (!s.heroes[s.charId]) ensureHero(s, s.charId);
  // 동료 (companions §8): 누락 구조 생성·잘못된 id 정리·이전 세이브 소급 해금. 실패해도 불러오기는 계속된다   [hook:cmp]
  try { migrateCompanions(s); } catch (e) {
    console.warn('[state] 동료 데이터가 손상되어 초기화합니다', e);
    delete s.companions;
    for (const h of Object.values(s.heroes)) delete h.companions;
    try { ensureCompanionState(s); } catch (e2) { console.warn('[state] 동료 상태 생성 실패', e2); }
  }
  // 버전은 마지막에 (MASTER_PLAN §1.6). 더 새 클라이언트의 세이브도 이 클라이언트 스키마로 보정했으니 이 번호로 적는다:
  // 모르는 필드는 남아 있고, 새 클라이언트가 다시 불러오면 자기 마이그레이션을 한 번 더 돌린다 (멱등)
  s.version = SAVE_VERSION;
  return s;
}
