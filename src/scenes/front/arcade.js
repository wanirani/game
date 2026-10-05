// 아케이드 모드 선택: 보스 러시 / 서바이벌 / 스테이지 연습 / 오늘의 도전 / 무한의 탑 + 난이도·레벨 프리셋·코스/스테이지 → 캐릭터 선택 → 임시 세이브로 시작
//  - 무한의 탑 (front/arcade_tower.js, data/tower.js): 난이도·헌터 등급만 고른다. 런 시드는 startArcade 가 새로 뽑아 state.arcade.seed 에
//    둔다 (cfg.seed 가 정수면 그것 — 시험·?seed=). 메뉴는 시드를 기억하지 않는다 (arcadeCfg 에서 뺀다)
// owner: PLAT-FRONT-B (world2 §11, MASTER_PLAN §1.14·§1.16, platform §6.2–6.3)
//  - 2부 (world2 §11): BOSS_ORDER 에 2부 보스 7명, COURSES '이계편'·'전 보스 연속(20연전)', LEVEL_PRESETS '이계의 순례자'.
//    p2Known(game) 이 거짓이면 p2 코스·프리셋을 숨기고, 저장된 arcadeCfg 가 숨긴 항목을 가리키면 0번으로 돌아간다.
//    2부 보스는 늦게 받기 입구(game/bosses/lazy.js)가 아는 것만 코스에 넣는다 (지금은 20명 모두). 보스 클래스 모듈은 정적으로
//    싣지 않는다 (R1-REQ-229: 첫 화면 바이트에서 보스 로직을 뺀다) — 실전 장면(arcade_run.js)이 라운드 전에 미리 받는다.
//    아는 2부 보스가 하나도 없는 코스는 숨긴다.
//  - 외전 (docs/specs/ex_s21.md): BOSS_ORDER 끝(STORY_BOSSES 뒤)에 외전 보스 b_argen, COURSES '이계편 · 외전'·'전 보스 연속(21연전)' (ex: true).
//    exKnown(game) — 어느 슬롯이든 외전 스테이지(s21) 해금 · 2부 엔딩을 본 적 있음 · 코나미 — 이 거짓이면 외전 코스를 숨기고,
//    서바이벌 보스 웨이브·무한의 탑(무작위 구간, 41층 이후)에도 외전 보스를 넣지 않는다. 연습 목록의 s21 은 슬롯 해금을 따른다 (2부 엔딩 뒤 세계 지도가 연다)
//  - 무기·방어구: baseIdFor(slot, min(7, wtier)) (티어 7 = 2부 장비)
//  - 연습 스테이지 목록은 모든 슬롯의 해금 합집합 (STAGE_ORDER 전체 → s14~s20 도 자동으로)
//  - uiScale 장면: game.uiW × game.uiH (최소 720×400) 로 배치. 탭 대상은 ui.taps (모드 카드·옵션 줄·시작·뒤로 ≥ 44/36 CSS px),
//    아래 안내 줄은 지금 기기의 글리프 (prompts.drawHints)
//  - 온라인 (docs/specs/online.md §4): '오늘의 도전' 카드 — GET /api/daily (한국 시간 날짜마다 한 번) 의 스테이지·헌터·직업·등급·
//    난이도·규칙으로 헌터 선택 없이 연습 장면을 연다 (startDaily). 카드 옆에 내 최고·오늘의 TOP 3 (로그인 안 했으면 안내 문구).
//    연습·일일 도전은 '고스트: 끔 / 1위 / 내 최고' 줄 (cfg.ghost). 옵션 판이 아래 안내 줄에 닿으면 줄 높이(≥ 36 CSS px)·카드 높이를 줄인다
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, wrap, FONT, taps } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, rgba, fmt } from '../../core/math.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES, classChain } from '../../data/classes.js';
import { DIFFICULTIES, getDiff } from '../../data/difficulty.js';
import { STAGES, STAGE_ORDER, SIDE_STAGES } from '../../data/stages.js';
import { BOSSES } from '../../data/bosses.js';
import { baseIdFor, ITEMS, makeItem } from '../../data/items.js';
import { SKILLS } from '../../data/skills.js';
import { SCRIPTS } from '../../data/story.js';
import * as QD from '../../data/quests.js';
import * as BOSS_LAZY from '../../game/bosses/lazy.js';   // 보스 클래스 모듈을 정적으로 싣지 않는 입구 (R1-REQ-229)
import { newGameState } from '../../game/state.js';
import { addItem, addByBase } from '../../game/inventory.js';
import {
  Ambience, kenBurns, shade, frame, heading, portraitIn, gbutton,
  follow, fmtClock, bossRushBests, towerBests, GOLD, BONE, DIM as DIMC, endArcade,
} from './common.js';
import * as FRONT from './common.js'; // scoreList (PLAT-FRONT-A 의 새 내보내기: 없어도 멈추지 않게 이름공간으로 부른다, R6)
import * as ONLINE from '../../core/online.js';   // 리더보드·일일 도전 (docs/specs/online.md)
import { cloud } from '../../core/cloud.js';
import { bus } from '../../core/events.js';

export const ARCADE_MODES = {
  bossrush: { id: 'bossrush', name: '보스 러시', eng: 'BOSS RUSH', color: '#ff4a5a', art: 'portraits/b_dracula', tag: '군주들과의 연속 결투', desc: '악마성의 군주들과 쉬지 않고 연속으로 맞붙는다. 라운드 사이에 체력이 조금 회복된다. 가장 빠른 격파 시간에 도전하라!' },
  survival: { id: 'survival', name: '서바이벌', eng: 'SURVIVAL', color: '#ffa640', art: 'bg/s_arena', tag: '끝없는 마물의 물결', desc: '피의 투기장에 끝없이 몰려오는 마물의 물결. 웨이브를 넘길수록 적은 강해지고 점수 배율은 올라간다. 목숨은 단 하나!' },
  practice: { id: 'practice', name: '스테이지 연습', eng: 'STAGE PRACTICE', color: '#5aa8ff', art: 'bg/s06_library', tag: '해금한 스테이지 재도전', desc: '해금한 스테이지를 이야기 없이 다시 도전한다. 클리어 시간과 점수, 랭크를 갈고닦아 명예의 전당에 이름을 올려라.' },
  daily: { id: 'daily', name: '오늘의 도전', eng: 'DAILY', color: '#7ee0c0', art: 'bg/s11_chapel', tag: '매일 바뀌는 스테이지와 규칙', desc: '오늘 정해진 스테이지·헌터·규칙으로 겨룬다. 몇 번이든 도전할 수 있고 가장 빠른 기록만 남는다.' },
  tower: { id: 'tower', name: '무한의 탑', eng: 'ENDLESS TOWER', color: '#b79cff', art: 'bg/s10_spire', tag: '층마다 강해지는 끝없는 탑', desc: '층을 오를수록 마물은 강해진다. 5층마다 군주가, 10층마다 안식처가 기다린다. 축복을 모아 얼마나 높이 오를 수 있을까? 목숨은 단 하나!' },
};
export const MODE_ORDER = ['bossrush', 'survival', 'practice', 'daily', 'tower'];
/** 고스트 선택 (연습·일일 도전) */
export const GHOST_CHOICES = [{ id: 'off', name: '끔' }, { id: 'top', name: '1위' }, { id: 'mine', name: '내 최고' }];
/** 헌터 등급 (p2: 2부를 아는 플레이어에게만 보인다) */
export const LEVEL_PRESETS = [
  { name: '견습 사냥꾼', lv: 10, tier: 0, wtier: 2, rarity: 1, enh: 3, docs: 4, potions: 3 },
  { name: '숙련 사냥꾼', lv: 25, tier: 1, wtier: 3, rarity: 2, enh: 6, docs: 10, potions: 4 },
  { name: '베테랑', lv: 40, tier: 2, wtier: 4, rarity: 3, enh: 9, docs: 16, potions: 5 },
  { name: '전설의 헌터', lv: 60, tier: 2, wtier: 6, rarity: 4, enh: 12, docs: 99, potions: 6 },
  { name: '이계의 순례자', lv: 68, tier: 2, wtier: 7, rarity: 4, enh: 13, docs: 99, potions: 7, p2: true },
];
export const BOSS_ORDER = [
  'b_nightwing', 'b_banshee', 'b_dullahan', 'b_crimson', 'b_bonedragon', 'b_grimoire', 'b_chimera', 'b_leviathan', 'b_colossus', 'b_frostqueen', 'b_death', 'b_dracula', 'b_chaos',
  'b_narkissa', 'b_moloch', 'b_dagon', 'b_ziz', 'b_mara', 'b_behemoth', 'b_nihil',
  'b_argen',   // 외전 (s21) — 외전을 아는 플레이어에게만 (exKnown)
];
/** BOSS_ORDER 에서 1부 보스 수 (이 뒤는 2부) */
export const P1_BOSSES = 13;
/** BOSS_ORDER 에서 이야기(1·2부) 보스 수 (이 뒤는 외전 보스) */
export const STORY_BOSSES = 20;
/** 보스 러시 코스 (번호는 기록 키: 0~2 는 예전 그대로). short = 기록·명예의 전당용 짧은 이름 (같은 이름의 두 코스를 구분) */
export const COURSES = [
  { name: '전반전', sub: '1~6장 보스', from: 0, to: 6, short: '전반전' },
  { name: '후반전', sub: '7~13장 보스', from: 6, to: 13, short: '후반전' },
  { name: '전 보스 연속', sub: '13연전', from: 0, to: 13, short: '전 보스 13연전' },
  { name: '이계편', sub: '14~20장 보스', from: 13, to: 20, p2: true, short: '이계편' },
  { name: '전 보스 연속', sub: '20연전', from: 0, to: 20, p2: true, short: '전 보스 20연전' },
  { name: '이계편 · 외전', sub: '14장~외전 보스', from: 13, to: 21, p2: true, ex: true, short: '이계편+외전' },
  { name: '전 보스 연속', sub: '21연전', from: 0, to: 21, p2: true, ex: true, short: '전 보스 21연전' },
];
const P2_COLOR = '#c8b8ff';
const EX_COLOR = '#c8e4ff';   // 외전 (s21 · 아르겐)

/**
 * 이 보스를 아케이드에 낼 수 있는가: 늦게 받기 입구(lazy.js)가 클래스 모듈을 아는 보스 (20명 모두 진짜 클래스가 있다;
 * 받는 동안은 대역, 받지 못하면 범용 보스로 대신한다 — lazy.createBoss)
 */
export function bossReady(id) {
  try { return !!BOSS_LAZY.knownBoss?.(id); } catch { return false; }
}
/** 이 보스를 아케이드에 낼 수 있는가: 데이터가 있고, 2부 보스면 클래스까지 준비됨 */
function bossUsable(id) {
  const i = BOSS_ORDER.indexOf(id);
  return !!BOSSES[id] && (i < P1_BOSSES || bossReady(id));
}
/** 모든 세이브 슬롯에서 해금된 스테이지 (합집합) */
function slotUnlocks() {
  const set = new Set();
  let list = [];
  try { list = saves.list() ?? []; } catch { list = []; }
  for (const s of list) {
    if (!s || s.empty) continue;
    let st = null;
    try { st = saves.read(s.slot); } catch { st = null; }
    const u = st?.progress?.unlocked;
    if (Array.isArray(u)) for (const id of u) if (typeof id === 'string') set.add(id);
  }
  return set;
}
/**
 * 2부를 아는 플레이어인가 (world2 §11): 어느 슬롯이든 s14 해금, 또는 2부 엔딩을 본 적 있음, 또는 코나미 커맨드.
 * unlocks 를 주면 슬롯을 다시 읽지 않는다.
 */
export function p2Known(game, unlocks = null) {
  const m = game?.meta;
  if (m?.konami) return true;
  if (Array.isArray(m?.endingsSeen) && m.endingsSeen.some((k) => typeof k === 'string' && k.startsWith('p2'))) return true;
  if ((unlocks ?? slotUnlocks()).has('s14')) return true;
  // 아직 저장하지 않은 지금 회차 (아케이드 임시 세이브가 아닌 것)
  const st = game?.state?.arcade ? game?._arcadePrev : game?.state;
  return !!(Array.isArray(st?.progress?.unlocked) && st.progress.unlocked.includes('s14'));
}
/**
 * 외전(docs/specs/ex_s21.md)을 아는 플레이어인가: 어느 슬롯이든 외전 스테이지 해금, 또는 2부 엔딩을 본 적 있음(외전이 열리는 조건), 또는 코나미 커맨드.
 * unlocks 를 주면 슬롯을 다시 읽지 않는다.
 */
export function exKnown(game, unlocks = null) {
  const m = game?.meta;
  if (m?.konami) return true;
  if (Array.isArray(m?.endingsSeen) && m.endingsSeen.some((k) => typeof k === 'string' && k.startsWith('p2'))) return true;
  const u = unlocks ?? slotUnlocks();
  if (SIDE_STAGES.some((id) => u.has(id))) return true;
  const st = game?.state?.arcade ? game?._arcadePrev : game?.state;
  return !!(Array.isArray(st?.progress?.unlocked) && SIDE_STAGES.some((id) => st.progress.unlocked.includes(id)));
}
/** 이 헌터 등급을 고를 수 있는가 */
export function presetAvailable(i, p2) {
  const P = LEVEL_PRESETS[i];
  return !!P && (!P.p2 || !!p2);
}
/** 이 코스를 고를 수 있는가: 2부 코스는 p2Known + 준비된 2부 보스가 하나 이상, 외전 코스(ex)는 exKnown 도 */
export function courseAvailable(ci, p2, ex = false) {
  const c = COURSES[ci];
  if (!c) return false;
  if (!c.p2) return true;
  if (!p2 || (c.ex && !ex)) return false;
  return BOSS_ORDER.slice(Math.max(c.from, P1_BOSSES), c.to).some((id) => bossUsable(id));
}
export const visiblePresets = (p2) => LEVEL_PRESETS.map((_, i) => i).filter((i) => presetAvailable(i, p2));
export const visibleCourses = (p2, ex = false) => COURSES.map((_, i) => i).filter((i) => courseAvailable(i, p2, ex));

/** 코스의 보스 목록 (2부 보스는 준비된 것만; 비면 첫 코스) */
export function courseBosses(ci) {
  const c = COURSES[ci] ?? COURSES[0];
  const ids = BOSS_ORDER.slice(c.from, c.to);
  const have = ids.filter((id) => bossUsable(id));
  if (have.length) return have;
  const p1 = ids.filter((id) => BOSS_ORDER.indexOf(id) < P1_BOSSES);
  if (p1.length) return p1; // 1부 보스는 데이터가 없어도 범용 보스로 진행 (예전 동작)
  return ci === 0 ? BOSS_ORDER.slice(0, 6) : courseBosses(0);
}
/** 코스 표시 글 (2부 보스 일부가 아직 준비되지 않아 보스 수가 줄면 'n연전') */
export function courseLabel(ci) {
  const c = COURSES[ci] ?? COURSES[0];
  const n = courseBosses(ci).length;
  return n === c.to - c.from ? `${c.name} · ${c.sub}` : `${c.name} · ${n}연전`;
}
/** 서바이벌 보스 웨이브에 나오는 보스 (1부, 2부를 알면 준비된 2부 보스까지, 외전을 알면(ex) 외전 보스까지) */
export function arenaBosses(p2, ex = false) {
  return BOSS_ORDER.filter((id, i) => BOSSES[id] && (i < P1_BOSSES || (p2 && bossReady(id) && (i < STORY_BOSSES || ex))));
}
/** 외전 보스 중 준비된 것 (무한의 탑: 스테이지 순서를 다 지난 무작위 구간에만 섞는다 — data/tower.js lateBosses) */
export function sideBosses() {
  return BOSS_ORDER.slice(STORY_BOSSES).filter((id) => bossUsable(id));
}
/** 아케이드 설정 정리: 모르는 모드·난이도, 숨긴(또는 없는) 헌터 등급·코스는 기본값/0번으로 (ex = exKnown: 외전 코스) */
export function sanitizeCfg(cfg, p2, stages = null, ex = false) {
  const c = { kind: 'bossrush', diff: 'normal', preset: 1, course: 0, stageId: 's01', ...(cfg && typeof cfg === 'object' && !Array.isArray(cfg) ? cfg : {}) };
  if (!MODE_ORDER.includes(c.kind)) c.kind = 'bossrush';
  if (!GHOST_CHOICES.some((g) => g.id === c.ghost)) c.ghost = 'off';
  if (!DIFFICULTIES.some((d) => d.id === c.diff)) c.diff = 'normal';
  c.preset = Number(c.preset); c.course = Number(c.course);
  if (!Number.isInteger(c.preset) || !presetAvailable(c.preset, p2)) c.preset = 0;
  if (!Number.isInteger(c.course) || !courseAvailable(c.course, p2, ex)) c.course = 0;
  if (stages && !stages.includes(c.stageId)) c.stageId = stages[0] ?? 's01';
  if (!STAGES[c.stageId] || !STAGE_ORDER.includes(c.stageId)) c.stageId = 's01';
  return c;
}
/** 모든 슬롯에서 해금된 스테이지 합집합 (연습 모드용) */
export function practiceStages(game, unlocks = null) {
  const set = new Set(['s01', ...(unlocks ?? slotUnlocks())]);
  if (game?.meta?.konami) STAGE_ORDER.forEach((id) => set.add(id));
  return STAGE_ORDER.filter((id) => set.has(id) && STAGES[id]);
}

/** 아케이드 전용 임시 세이브 (슬롯 0, 영구 저장 안 함) */
export function buildArcadeState(cfg, charId) {
  const P = LEVEL_PRESETS[cfg.preset ?? 1] ?? LEVEL_PRESETS[1];
  const st = newGameState({ slot: 0, difficulty: cfg.diff ?? 'normal', charId });
  st.slot = 0;
  st.arcade = { ...cfg };
  st.gold = 0;
  st.score = 0;
  const hero = st.heroes[charId];
  const ch = CHARACTERS[charId];
  hero.level = P.lv; hero.exp = 0; hero.sp = 0;
  // 직업: 첫 번째 계보로 전직
  let cls = hero.classId;
  for (let k = 0; k < P.tier; k++) { const nx = CLASSES[cls]?.next?.[k === 0 ? (charId.length % 2) : 0]; if (nx && CLASSES[nx]) cls = nx; }
  if (cfg.cls && CLASSES[cfg.cls]?.charId === charId) cls = cfg.cls;   // 일일 도전: 정해진 직업
  hero.classId = cls;
  // 무기·방어구: 티어(1~7, 7 = 2부 장비)에 맞는 베이스 (baseIdFor)
  const wt = Math.min(7, P.wtier);
  {
    const id = baseIdFor('weapon', wt, { wtype: ch.weaponType, variant: 2 }) || baseIdFor('weapon', wt, { wtype: ch.weaponType });
    if (id && ITEMS[id]) { const it = makeItem(id, { rarity: P.rarity, level: P.enh }); if (it) { addItem(st, it); hero.equip.weapon = it.uid; } }
  }
  for (const slot of ['body', 'head', 'cloak']) {
    const id = baseIdFor(slot, wt);
    if (id && ITEMS[id]) { const it = makeItem(id, { rarity: Math.max(0, P.rarity - 1), level: Math.floor(P.enh / 2) }); if (it) { addItem(st, it); hero.equip[slot] = it.uid; } }
  }
  // 비전서 (스테이지 순서대로 P.docs 개)
  const docIds = [];
  for (const sid of STAGE_ORDER) for (const d of STAGES[sid]?.docs ?? []) docIds.push(d);
  st.progress.docs = docIds.slice(0, P.docs);
  // 스킬: 이 캐릭터의 액티브 스킬을 레벨에 맞게 습득·장착
  try {
    const chain = new Set(classChain(hero.classId).map((c) => c.id));
    const mine = Object.values(SKILLS).filter((s) => s && s.charId === charId && (s.reqLevel ?? 1) <= P.lv && (!s.reqClass || chain.has(s.reqClass)));
    const lvOf = (s) => Math.max(1, Math.min(s.maxLv ?? 5, 1 + Math.floor(P.lv / 12)));
    for (const s of mine) hero.skills[s.id] = lvOf(s);
    const actives = mine.filter((s) => (s.type ?? 'active') === 'active');
    const slots = [...(hero.slots ?? [null, null, null, null])];
    for (const s of actives) { if (slots.includes(s.id)) continue; const i = slots.indexOf(null); if (i < 0) break; slots[i] = s.id; }
    hero.slots = slots;
  } catch { /* 스킬 데이터 교체 중 */ }
  // 일일 도전 규칙 (docs/specs/online.md §2.5): 난이도 배율·월드 규칙·시드 → World 가 만들 때 읽는다 (game/world.js)
  const dl = cfg.daily && typeof cfg.daily === 'object' ? cfg.daily : null;
  if (dl) {
    const { diffOver, rules } = ONLINE.applyMods(getDiff(cfg.diff), dl.mods);
    st.arcade.diffOver = diffOver; st.arcade.rules = rules;
    if (Number.isInteger(dl.seed)) st.arcade.seed = dl.seed >>> 0;
  }
  // 소모품 (물약 금지 규칙이면 넣지 않는다)
  if (!st.arcade.rules?.noPotion) { try { addByBase(st, 'c_potion', P.potions); } catch { /* 무시 */ } }
  // 스토리 대사·퀘스트 알림은 건너뜀
  st.progress.seenScripts = Object.keys(SCRIPTS);
  st.quests = { active: {}, done: Object.keys(QD.QUESTS ?? {}) };
  st.progress.unlocked = [...STAGE_ORDER];
  // 무한의 탑: 런 시드 (층 계획·정예·촛불 보상 — World 가 state.arcade.seed 로 world.rng 를 만든다)
  if (cfg.kind === 'tower') st.arcade.seed = (Number.isInteger(cfg.seed) ? cfg.seed : Math.floor(Math.random() * 4294967296)) >>> 0;
  const d = getDiff(cfg.diff);
  st.lives = cfg.kind === 'survival' || cfg.kind === 'tower' ? 1 : d.lives;
  return st;
}
/** 캐릭터 선택 후 호출: 임시 세이브를 만들고 모드 장면으로 */
export function startArcade(game, cfg, charId) {
  const unlocks = slotUnlocks();
  cfg = sanitizeCfg(cfg, p2Known(game, unlocks), practiceStages(game, unlocks), exKnown(game, unlocks));
  if (!CHARACTERS[charId]) charId = 'kael';
  if (!game.state?.arcade) game._arcadePrev = game.state ?? null;
  game.state = buildArcadeState(cfg, charId);
  const scene = cfg.kind === 'practice' ? 'practice' : cfg.kind;
  const seed = game.state.arcade?.seed;
  game.go(scene, { cfg: { ...cfg, charId, ...(Number.isInteger(seed) ? { seed } : {}) } }, { fadeTime: 0.6 });
}
/**
 * 일일 도전 응답이 이 게임 데이터로 돌릴 수 있는가 → 연습 설정 { kind:'practice', diff, preset, stageId, charId, cls, daily } 또는 null
 * (스테이지·헌터·난이도가 없으면 null; 직업이 그 헌터의 것이 아니면 등급 기본 직업, 등급이 없으면 1번)
 */
export function dailyCfg(d, ghost = 'off') {
  if (!d || !STAGES[d.stageId] || !STAGE_ORDER.includes(d.stageId) || !CHARACTERS[d.hero]) return null;
  const diff = DIFFICULTIES.some((x) => x.id === d.diff) ? d.diff : null;
  if (!diff) return null;
  const preset = Number.isInteger(d.preset) && LEVEL_PRESETS[d.preset] ? d.preset : 1;
  const cls = CLASSES[d.cls]?.charId === d.hero ? d.cls : null;
  const mods = (d.mods ?? []).filter((m) => ONLINE.DAILY_MODS[m]);
  return { kind: 'practice', diff, preset, course: 0, stageId: d.stageId, charId: d.hero, cls, ghost, daily: { date: d.date, seed: d.seed, board: d.board, mods } };
}
/** 일일 도전 시작: 헌터 선택 없이 연습 장면으로 (2부 스테이지·등급도 그대로 — 서버가 정한 도전) */
export function startDaily(game, d, ghost = 'off') {
  const cfg = dailyCfg(d, ghost);
  if (!cfg) return false;
  if (!game.state?.arcade) game._arcadePrev = game.state ?? null;
  game.state = buildArcadeState(cfg, cfg.charId);
  game.go('practice', { cfg }, { fadeTime: 0.6 });
  return true;
}
/** 아케이드 종료 시 이전 세이브 복원 */
export { endArcade };   // 몸체는 front/common.js (타이틀이 이 파일을 싣지 않게, R1-REQ-229)

export class ArcadeScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter({ cfg = null } = {}) {
    endArcade(this.game);
    audio.music('title');
    const m = this.game.meta ?? {};
    const unlocks = slotUnlocks();
    this.p2 = p2Known(this.game, unlocks);
    this.ex = exKnown(this.game, unlocks);   // 외전 코스 (docs/specs/ex_s21.md)
    this.stages = practiceStages(this.game, unlocks);
    const saved = m.arcadeCfg && typeof m.arcadeCfg === 'object' && !Array.isArray(m.arcadeCfg) ? m.arcadeCfg : {}; // 망가진 옛 설정은 버린다
    this.cfg = sanitizeCfg({ ...saved, ...(cfg ?? {}) }, this.p2, this.stages, this.ex);
    delete this.cfg.seed;   // 무한의 탑 시드는 판마다 새로 (메뉴·arcadeCfg 에 남기지 않는다)
    this.modeIndex = Math.max(0, MODE_ORDER.indexOf(this.cfg.kind));
    this.row = 0; // 0: 모드 카드, 1..: 옵션 줄
    this.amb = new Ambience({ embers: 50, motes: 20, bats: 6, lightning: true });
    this.amb.nextBolt = 3;
    this.selK = MODE_ORDER.map(() => 0);
    this.optK = 0; // 옵션 줄 강조 애니메이션
    this._grad = new Map();
    this._L = null;
    // 오늘의 도전 (카드를 고를 때 받는다 — 게스트도 볼 수 있다, §4)
    this.daily = { state: 'idle', d: null, cfg: null, msg: null, board: null, boardState: 'idle' };
    this.alive = true;
    this.offs = [];
    try {
      this.offs.push(bus.on('online:flushed', (o) => {
        if (!this.alive || !o?.sent?.length) return;
        const r = o.sent[o.sent.length - 1];
        this.game.toast(`기다리던 기록 ${o.sent.length}개를 순위에 올렸어요${r.rank ? ` (${r.rank}위)` : ''}`, '#9fe8c8', 3);
      }));
    } catch { /* 버스 없음 */ }
    try { ONLINE.flushQueue(); } catch { /* 온라인 모듈 교체 중 */ }
    if (this.kind === 'daily') this.loadDaily();
    taps.clear();
  }
  exit() { this.alive = false; for (const f of this.offs ?? []) f?.(); this.offs = []; }
  get kind() { return MODE_ORDER[this.modeIndex] ?? 'bossrush'; }
  /** 오늘의 도전 받기 (그날 것은 기기에 남아 있으면 요청 없음) → 순위 TOP 3 */
  loadDaily(force = false) {
    const D = this.daily;
    if (D.state === 'loading' || (D.state === 'ready' && !force)) return;
    D.state = 'loading'; D.msg = null;
    ONLINE.getDaily({ force }).then((r) => {
      if (!this.alive) return;
      const c = r.ok ? dailyCfg(r.daily, this.cfg.ghost) : null;
      if (!r.ok || !c) { D.state = 'error'; D.msg = r.ok ? '이 버전에서 열 수 없는 도전이에요. 게임을 새로 고쳐 주세요' : (r.error === 'unavailable' ? '여기서는 온라인 기능을 쓸 수 없어요' : r.error === 'offline' ? '인터넷에 연결되어 있지 않아요' : '오늘의 도전을 불러오지 못했어요'); return; }
      D.state = 'ready'; D.d = r.daily; D.cfg = c;
      this._L = null;
      this.loadDailyBoard();
    }).catch(() => { if (this.alive) { D.state = 'error'; D.msg = '오늘의 도전을 불러오지 못했어요'; } });
  }
  loadDailyBoard() {
    const D = this.daily;
    if (!D.d || D.boardState === 'loading') return;
    D.boardState = 'loading';
    ONLINE.getBoard(D.d.board, { limit: 50 }).then((b) => {
      if (!this.alive) return;
      D.board = b.ok ? b : null; D.boardState = b.ok ? 'ready' : 'error';
    }).catch(() => { if (this.alive) D.boardState = 'error'; });
  }
  /** 옵션 줄 (지금 모드). 각 줄: { id, label, value, color, n, i, set(i), info } — n/i 는 보이는 항목 기준, info = 바꿀 수 없는 안내 줄 */
  options() {
    const c = this.cfg, k = this.kind;
    const gi = Math.max(0, GHOST_CHOICES.findIndex((x) => x.id === c.ghost));
    const ghostRow = { id: 'ghost', label: '고스트', value: GHOST_CHOICES[gi].name, color: gi ? '#9fd8ff' : null, n: GHOST_CHOICES.length, i: gi, set: (i) => { c.ghost = GHOST_CHOICES[i].id; } };
    if (k === 'daily') {
      const D = this.daily, dc = D.cfg;
      if (D.state !== 'ready' || !dc) {
        const v = D.state === 'error' ? `${D.msg ?? '불러오지 못했어요'} — 눌러서 다시` : '불러오는 중…';
        return [{ id: 'dstate', label: '오늘의 도전', value: v, color: D.state === 'error' ? '#ff9a8a' : '#c8b8a8', n: 1, i: 0, info: D.state !== 'error', retry: D.state === 'error', set() {} }, ghostRow];
      }
      const st = STAGES[dc.stageId], ch = CHARACTERS[dc.charId], P = LEVEL_PRESETS[dc.preset] ?? LEVEL_PRESETS[1];
      const clsName = dc.cls ? CLASSES[dc.cls]?.name : null;
      const mods = dc.daily.mods.map((m) => ONLINE.modName(m));
      return [
        { id: 'dstage', label: '스테이지', value: `${st.side ? '외전' : `제${st.chapter}장`} ${st.name} · ${getDiff(dc.diff).name}`, color: st.part === 2 ? P2_COLOR : null, n: 1, i: 0, info: true, set() {} },
        { id: 'dhero', label: '헌터', value: `${ch?.name ?? dc.charId}${clsName ? ` · ${clsName}` : ''} (Lv.${P.lv})`, n: 1, i: 0, info: true, set() {} },
        { id: 'drules', label: '규칙', value: mods.length ? mods.join(' · ') : '특별 규칙 없음', color: mods.length ? '#ffb070' : null, n: 1, i: 0, info: true, set() {} },
        ghostRow,
      ];
    }
    const pres = visiblePresets(this.p2);
    const pi = Math.max(0, pres.indexOf(c.preset));
    const P = LEVEL_PRESETS[pres[pi]];
    const rows = [
      { id: 'diff', label: '난이도', value: getDiff(c.diff).name, color: getDiff(c.diff).color, n: DIFFICULTIES.length, i: Math.max(0, DIFFICULTIES.findIndex((d) => d.id === c.diff)), set: (i) => { c.diff = DIFFICULTIES[i].id; } },
      { id: 'preset', label: '헌터 등급', value: `${P.name} (Lv.${P.lv})`, color: P.p2 ? P2_COLOR : null, n: pres.length, i: pi, set: (i) => { c.preset = pres[i]; } },
    ];
    if (k === 'bossrush') {
      const cs = visibleCourses(this.p2, this.ex);
      const ci = Math.max(0, cs.indexOf(c.course));
      rows.push({ id: 'course', label: '코스', value: courseLabel(cs[ci]), color: COURSES[cs[ci]]?.ex ? EX_COLOR : COURSES[cs[ci]]?.p2 ? P2_COLOR : null, n: cs.length, i: ci, set: (i) => { c.course = cs[i]; } });
    }
    if (k === 'practice') {
      const si = Math.max(0, this.stages.indexOf(c.stageId));
      const st = STAGES[this.stages[si]];
      rows.push({ id: 'stage', label: '스테이지', value: st.side ? `외전 ${st.name}` : `제${st.chapter}장 ${st.name}`, color: st.side ? EX_COLOR : st.part === 2 ? P2_COLOR : null, n: this.stages.length, i: si, set: (i) => { c.stageId = this.stages[i]; } });
      rows.push(ghostRow);
    }
    return rows;
  }
  change(row, d) {
    const r = this.options()[row];
    if (r?.retry) { audio.sfx('menu_ok'); this.loadDaily(true); return; }
    if (!r || r.n <= 1) return;
    const i = (r.i + d + r.n) % r.n;
    if (i === r.i) return;
    r.set(i); audio.sfx('menu_move');
  }
  setMode(i, sfx = 'menu_move') {
    i = clamp(i, 0, MODE_ORDER.length - 1);
    if (i !== this.modeIndex) { this.modeIndex = i; audio.sfx(sfx); this._L = null; }
    this.cfg.kind = this.kind;
    if (this.kind === 'daily') this.loadDaily();
  }
  /** 위·아래로 갈 수 있는 옵션 줄 번호(1부터): 안내 줄(info)은 건너뛴다 */
  stepRow(d) {
    const opts = this.options(), n = opts.length;
    let r = this.row;
    for (let k = 0; k <= n; k++) {
      r += d;
      if (r <= 0) return 0;
      if (r > n) return this.row;
      if (!opts[r - 1].info) return r;
    }
    return this.row;
  }
  update(dt) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    this.amb.update(dt, W, H);
    this.selK = this.selK.map((v, i) => follow(v, i === this.modeIndex ? 1 : 0, dt, 12));
    this.optK = follow(this.optK, this.row, dt, 16);
    const tap = taps.hit(this);
    if (tap === 'back') { this.leave(); return; }
    if (tap === 'start') { this.go(); return; }
    if (typeof tap === 'string' && tap.startsWith('mode:')) { this.row = 0; this.setMode(+tap.slice(5), 'menu_ok'); return; }
    if (typeof tap === 'string' && tap.startsWith('opt:')) {
      const [, row, d] = tap.split(':');
      this.row = +row + 1; this.change(+row, +d); return;
    }
    const n = this.options().length;
    if (this.row === 0) {
      if (input.pressed('left')) this.setMode((this.modeIndex + MODE_ORDER.length - 1) % MODE_ORDER.length);
      else if (input.pressed('right')) this.setMode((this.modeIndex + 1) % MODE_ORDER.length);
      else if (input.pressed('down')) { const r = this.stepRow(1); if (r !== this.row) { this.row = r; audio.sfx('menu_move'); } }
      else if (input.pressed('confirm')) this.go();
      else if (input.pressed('cancel')) this.leave();
      return;
    }
    // 옵션 줄
    if (input.pressed('up')) { this.row = this.stepRow(-1); audio.sfx('menu_move'); }
    else if (input.pressed('down')) { const r = this.stepRow(1); if (r !== this.row) { this.row = r; audio.sfx('menu_move'); } }
    else if (input.pressed('left')) this.change(this.row - 1, -1);
    else if (input.pressed('right')) this.change(this.row - 1, 1);
    else if (input.pressed('confirm')) this.go();
    else if (input.pressed('cancel')) { this.row = 0; audio.sfx('menu_cancel'); }
    this.row = clamp(this.row, 0, n);
  }
  go() {
    const g = this.game;
    this.cfg.kind = this.kind;
    g.meta.arcadeCfg = { ...this.cfg }; saves.saveMeta(g.meta);
    if (this.kind === 'daily') {
      const D = this.daily;
      if (D.state !== 'ready' || !D.d) { audio.sfx('menu_cancel'); if (D.state === 'error') this.loadDaily(true); return; }
      audio.sfx('menu_ok'); audio.sfx('coin_insert');
      g.flash(ARCADE_MODES.daily.color, 0.3, 3);
      if (!startDaily(g, D.d, this.cfg.ghost)) { this.daily.state = 'error'; this.daily.msg = '이 버전에서 열 수 없는 도전이에요'; }
      return;
    }
    audio.sfx('menu_ok'); audio.sfx('coin_insert');
    g.flash(ARCADE_MODES[this.kind].color, 0.3, 3);
    g.go('charselect', { mode: 'arcade', arcade: { ...this.cfg }, difficulty: this.cfg.diff });
  }
  leave() { audio.sfx('menu_cancel'); this.game.go('title', { menu: true, index: 2 }); }

  /** 배치 (UI px). 720×400 까지 겹치지 않는다 (옵션 판이 아래 안내 줄에 닿으면 줄 높이 → 카드 높이 순으로 줄인다) */
  layout(nOpt) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const L0 = this._L;
    if (L0 && L0.W === W && L0.H === H && L0.nOpt === nOpt) return L0;
    const small = H < 480;
    // 최소 UI 높이 근처(400~420, platform §6.2)에서는 제목·카드를 조금 줄여 옵션 판과 시작 버튼이 아래 안내 줄과 겹치지 않게 한다
    const tight = H < 420;
    const nC = MODE_ORDER.length;
    const gap = small ? 10 : 14;
    const cw = Math.floor(Math.min(nC > 3 ? 236 : 270, (W - 48 - gap * (nC - 1)) / nC));
    const CW = cw * nC + gap * (nC - 1), x0 = Math.round((W - CW) / 2);
    const cardY = tight ? 72 : small ? 76 : 100;
    let ch = tight ? 108 : small ? 118 : 172, artH = tight ? 52 : small ? 60 : 104;
    const descLH = small ? 15 : 17, descSize = small ? 12 : 13;
    let descY, oy;
    const calc = () => { descY = cardY + ch + (tight ? 16 : small ? 20 : 26); oy = descY + descLH + (tight ? 10 : small ? 12 : 18); };
    calc();
    // 목록 줄 ≥ 36 CSS px (platform §6.3): UI px 1 = cssScale × uiK CSS px
    const per = Math.max(0.2, (g.cssScale || 1) * (g.uiK || 1));
    const minRow = Math.max(36, Math.ceil(38 / per));
    let rowH = small ? 46 : 44;
    const foot = H - 36;
    const need = () => oy - 6 + nOpt * rowH + 12;
    if (need() > foot) rowH = Math.max(minRow, Math.floor((foot - (oy - 6) - 12) / nOpt));
    if (need() > foot) { const cut = Math.min(need() - foot, ch - 84); ch -= cut; artH = Math.max(34, artH - cut); calc(); }
    const RW = small ? 250 : 270, PW = CW - RW - 16, rx = x0 + PW + 16;
    const panelH = nOpt * rowH + 12;
    return (this._L = {
      W, H, small, nOpt, top: tight ? 26 : small ? 30 : 44, hs: small ? 24 : 30,
      gap, cw, CW, x0, cardY, ch, artH, descY, descLH, descSize,
      oy, rowH, PW, RW, rx, panelH, labelW: small ? 104 : 124,
      start: { x: rx, y: oy - 6 + panelH - 56, w: RW, h: 56 },
      back: { x: 12, y: 10, w: 104, h: 54 },
    });
  }
  /** 모드 색 후광 (크기·색이 같으면 다시 만들지 않는다) */
  glow(ctx, W, H, color) {
    const key = `${W}|${H}|${color}`;
    let gg = this._grad.get(key);
    if (!gg) {
      gg = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.45, W * 0.6);
      gg.addColorStop(0, rgba(color, 0.14)); gg.addColorStop(1, rgba(color, 0));
      if (this._grad.size > 8) this._grad.clear();
      this._grad.set(key, gg);
    }
    return gg;
  }

  render(ctx) {
    const g = this.game, t = g.time;
    const opts = this.options();
    const L = this.layout(opts.length), { W, H } = L;
    const M = ARCADE_MODES[this.kind];
    kenBurns(ctx, assets.get('bg/s_arena'), W, H, t, { z0: 1.04, z1: 1.1, period: 58 });
    ctx.fillStyle = 'rgba(6,2,10,0.6)'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.glow(ctx, W, H, M.color); ctx.fillRect(0, 0, W, H); ctx.restore();
    this.amb.draw(ctx, W, H, 'back', t);
    shade(ctx, W, H, { top: 0.6, bottom: 0.75, vig: 0.8 });
    this.amb.draw(ctx, W, H, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, W / 2, L.top, 'ARCADE MODE', '도전할 모드를 선택하세요', { size: L.hs, alpha: ap });
    const own = { owner: this };
    // 모드 카드
    MODE_ORDER.forEach((id, i) => {
      const k = ease.outCubic(clamp((this.t - i * 0.07) / 0.45, 0, 1));
      const r = { x: L.x0 + i * (L.cw + L.gap), y: L.cardY + (1 - k) * 40, w: L.cw, h: L.ch };
      this.drawCard(ctx, r, ARCADE_MODES[id], this.selK[i] ?? 0, k, i === this.modeIndex, L);
      taps.add(`mode:${i}`, { x: L.x0 + i * (L.cw + L.gap), y: L.cardY, w: L.cw, h: L.ch }, { ...own, kind: 'primary', src: 'arcade.mode' });
    });
    // 지금 모드 설명 (최대 두 줄)
    wrap(ctx, M.desc, L.CW - 20, L.descSize, 500).slice(0, 2).forEach((l, i) => text(ctx, l, W / 2, L.descY + i * L.descLH, { size: L.descSize, align: 'center', color: '#d8ccbc', ow: 3 }));
    // 옵션
    const { x0: ox, oy, PW: ow, rowH: oh } = L;
    frame(ctx, ox, oy - 6, ow, L.panelH, { accent: '#8a6a3a', corners: false, edge: 0.4, fill0: 'rgba(14,6,16,0.84)' });
    if (this.row > 0) {
      const y = oy + clamp(this.optK - 1, 0, opts.length - 1) * oh;
      const lg = this.rowGrad ??= (() => { const q = ctx.createLinearGradient(0, 0, 1, 0); q.addColorStop(0, 'rgba(179,18,46,0)'); q.addColorStop(0.5, 'rgba(179,18,46,0.55)'); q.addColorStop(1, 'rgba(179,18,46,0)'); return q; })();
      ctx.save(); ctx.translate(ox, 0); ctx.scale(ow, 1); ctx.fillStyle = lg; ctx.fillRect(0, y, 1, oh); ctx.restore();
    }
    const lw = L.labelW, vx = ox + lw + (ow - lw) / 2;
    opts.forEach((o, i) => {
      const y = oy + i * oh, sel = this.row === i + 1, by = y + oh / 2 + 6;
      const vs = o.info && String(o.value).length > 22 ? 13 : 15;
      text(ctx, o.label, ox + 16, by, { size: 15, weight: 800, color: sel ? '#fff4dc' : '#c8b8a8', ow: 2, maxWidth: lw - 20 });
      text(ctx, o.value, vx, by - (vs < 15 ? 1 : 0), { size: vs, align: 'center', weight: 800, color: o.color ?? (sel ? GOLD : BONE), ow: 2, maxWidth: ow - lw - (o.n > 1 ? 70 : 24) });
      const on = o.n > 1, ac = sel ? GOLD : 'rgba(232,200,114,0.5)';
      if (on) {
        text(ctx, '◀', ox + lw + 14, by, { size: 16, align: 'center', color: ac, ow: 2 });
        text(ctx, '▶', ox + ow - 18, by, { size: 16, align: 'center', color: ac, ow: 2 });
      }
      if (i > 0) { ctx.fillStyle = 'rgba(232,200,114,0.08)'; ctx.fillRect(ox + 10, y, ow - 20, 1); }
      // 탭: 이름 칸 = 다음 값, 값의 왼쪽 반 = 이전, 오른쪽 반 = 다음 (목록 줄 높이 ≥ 36 CSS px). 안내 줄은 탭 없음
      if (o.info) return;
      const zk = { ...own, kind: 'list', src: 'arcade.option', disabled: !on && !o.retry };
      taps.add(`opt:${i}:1`, { x: ox, y, w: lw, h: oh }, zk);
      taps.add(`opt:${i}:-1`, { x: ox + lw, y, w: vx - ox - lw, h: oh }, zk);
      taps.add(`opt:${i}:1`, { x: vx, y, w: ox + ow - vx, h: oh }, zk);
    });
    // 기록 + 시작
    if (this.kind === 'daily') this.drawDailySide(ctx, L, t);
    else {
      const best = this.bestText();
      if (best) wrap(ctx, best, L.RW, 12, 700).slice(0, 2).forEach((l, i) => text(ctx, l, L.rx + L.RW / 2, oy + 12 + i * 16, { size: 12, align: 'center', weight: 700, color: '#d8c0a0', ow: 2 }));
    }
    const ready = this.kind !== 'daily' || this.daily.state === 'ready';
    gbutton(ctx, L.start, this.kind === 'daily' ? '도전 시작' : '헌터 선택으로', { selected: ready, disabled: !ready && this.daily.state === 'loading', accent: M.color, size: 16, icon: '▶' });
    taps.add('start', L.start, { ...own, kind: 'primary', src: 'arcade.start' });
    gbutton(ctx, L.back, '뒤로', { size: 15, icon: '◀' });
    taps.add('back', L.back, { ...own, kind: 'primary', src: 'arcade.back' });
    this.drawFooter(ctx, W, H);
  }
  /** 오늘의 도전: 오른쪽 칸 — 내 최고 · TOP 3 (로그인 안 했으면 안내 문구) */
  drawDailySide(ctx, L, t) {
    const D = this.daily, x = L.rx + 8, w = L.RW - 16, y0 = L.oy + 10, lh = 17;
    const maxY = L.start.y - 6;
    let y = y0;
    const line = (s, o = {}) => { if (y + 4 > maxY) return; text(ctx, s, o.align === 'center' ? x + w / 2 : x, y, { size: 13, weight: 700, color: '#d8c0a0', ow: 2, maxWidth: w, ...o }); y += lh; };
    if (D.state !== 'ready') { if (D.state === 'loading') line('오늘의 도전을 불러오는 중…', { align: 'center', color: DIMC }); return; }
    const B = D.board, me = B?.me;
    if (!cloud.loggedIn) line('로그인하면 순위에 오를 수 있어요', { color: '#9fd8ff', align: 'center' });
    else if (me) line(`내 최고  ${ONLINE.fmtMs(me.time)}${me.rank ? ` · ${me.rank}위` : ''}`, { color: '#ffe7a0', align: 'center' });
    else if (D.boardState === 'ready') line('오늘은 아직 기록이 없어요', { align: 'center' });
    y += 3;
    if (D.boardState === 'loading') { line('순위를 불러오는 중…', { align: 'center', color: DIMC }); return; }
    if (D.boardState === 'error' || !B) { line('순위를 불러오지 못했어요', { align: 'center', color: DIMC }); return; }
    const top = B.entries.slice(0, 3);
    if (!top.length) { line('첫 기록의 주인공이 되어 보세요!', { align: 'center' }); return; }
    line(`오늘의 TOP 3 · 전체 ${B.total}명`, { size: 12, color: GOLD, align: 'center' });
    top.forEach((e, i) => {
      if (y + 4 > maxY) return;
      text(ctx, `${e.rank}`, x + 6, y, { size: 13, weight: 900, family: FONT.num, color: ['#ffe070', '#d8dce8', '#e0a060'][i] ?? BONE, ow: 2 });
      text(ctx, e.nick, x + 26, y, { size: 13, weight: 800, color: BONE, ow: 2, maxWidth: w - 110 });
      text(ctx, ONLINE.fmtMs(e.time), x + w, y, { size: 13, align: 'right', weight: 800, family: FONT.num, color: '#fff', ow: 2 });
      y += lh;
    });
  }
  /** 아래 안내 줄 (키보드·패드 글리프 / 터치 문구) */
  drawFooter(ctx, W, H) {
    ctx.save();
    const fg = this.footGrad?.H === H ? this.footGrad.g : null;
    const g = fg ?? ctx.createLinearGradient(0, H - 34, 0, H);
    if (!fg) { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)'); this.footGrad = { H, g }; }
    ctx.fillStyle = g; ctx.fillRect(0, H - 34, W, 34);
    ctx.restore();
    let items;
    if (promptMode() === 'touch') items = [[null, '', '카드를 눌러 모드를 고르고, 옵션 줄의 ◀ ▶ 를 눌러 바꾸세요']];
    else if (this.row === 0) items = [['dpadH', '모드'], ['down', '옵션'], ['confirm', '결정'], ['cancel', '뒤로']];
    else items = [['dpadV', '항목'], ['dpadH', '변경'], ['confirm', '결정'], ['cancel', '모드 선택']];
    drawHints(ctx, items, W / 2, H - 12, { align: 'center', size: 13, color: '#b8aa98' });
  }
  bestText() {
    const m = this.game.meta ?? {};
    // 망가진 기록(배열이 아니거나 null 항목)도 매 프레임 멈추지 않게: front/common scoreList 로 고쳐 읽는다 (없으면 걸러 읽기)
    const list = FRONT.scoreList?.(m) ?? (Array.isArray(m.highScores) ? m.highScores : []);
    const hs = list.filter((h) => h && typeof h === 'object' && h.mode === this.kind);
    const top = hs[0];
    if (this.kind === 'bossrush') {
      const ci = this.cfg.course ?? 0, b = bossRushBests(m)[ci];
      if (b) return `${COURSES[ci]?.short ?? COURSES[ci]?.name ?? ''} 최단 기록  ${fmtClock(b.time ?? 0)} · ${fmt(b.score ?? 0)}점 · ${CHARACTERS[b.charId]?.name ?? ''}`;
    }
    if (this.kind === 'survival' && (m.survivalBest ?? 0) > 0) return `최고 기록  웨이브 ${m.survivalBest}${top ? ` · ${fmt(top.score)}점` : ''}`;
    if (this.kind === 'tower') {
      const b = towerBests(m)[this.cfg.diff];
      return b?.floor ? `${getDiff(this.cfg.diff).name} 최고 기록  ${b.floor}층 돌파 · ${fmtClock(b.time ?? 0)} · ${CHARACTERS[b.charId]?.name ?? ''}` : `${getDiff(this.cfg.diff).name} 기록이 아직 없습니다`;
    }
    if (top) return `최고 점수  ${fmt(top.score)}점 · ${top.name || CHARACTERS[top.charId]?.name || ''}`;
    return '아직 기록이 없습니다';
  }
  /** 카드 그림: 오늘의 도전은 그날 스테이지 배경 */
  artOf(M) {
    if (M.id === 'daily') { const st = STAGES[this.daily.cfg?.stageId]; if (st?.bg) return st.bg; }
    return M.art;
  }
  tagOf(M) {
    if (M.id !== 'daily') return M.tag;
    const D = this.daily;
    if (D.state === 'ready' && D.d) { const s = D.d.date; return `${+s.slice(4, 6)}월 ${+s.slice(6, 8)}일 · 규칙 ${D.cfg.daily.mods.length}개`; }
    return D.state === 'error' ? '불러오지 못했어요' : D.state === 'loading' ? '불러오는 중…' : M.tag;
  }
  drawCard(ctx, r, M, s, k, cur, L) {
    const sc = 1 + 0.04 * s;
    ctx.save();
    ctx.globalAlpha = k * (0.7 + 0.3 * s);
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(sc, sc); ctx.translate(-r.w / 2, -r.h / 2);
    frame(ctx, 0, 0, r.w, r.h, { accent: M.color, glow: s * (cur && this.row === 0 ? 1.2 : 0.5), edge: 0.4 + 0.6 * s });
    const ah = L.artH;
    const ar = { x: 6, y: 6, w: r.w - 12, h: ah };
    const art = this.artOf(M);
    const img = assets.get(art);
    portraitIn(ctx, img, ar, { fy: art.startsWith('portraits') ? 0.18 : 0.5, zoom: 1 + 0.03 * s, fadeBottom: 0.55 });
    if (M.id === 'bossrush') {
      // 보스 초상화 몽타주 (2부를 알면 마지막 칸은 공허의 니힐)
      const ids = this.p2 ? ['b_death', 'b_chaos', 'b_nihil'] : ['b_nightwing', 'b_death', 'b_chaos'];
      ids.forEach((id, j) => {
        const pr = { x: 6 + j * (ar.w / 3), y: 6, w: ar.w / 3, h: ah };
        portraitIn(ctx, assets.get(`portraits/${id}`), pr, { fy: 0.15, zoom: 1.2, fadeBottom: 0.6, alpha: 0.95 });
      });
    }
    ctx.fillStyle = rgba(M.color, 0.55); ctx.fillRect(r.w * 0.15, ah + 5, r.w * 0.7, 2);
    text(ctx, M.eng, r.w / 2, ah + 2, { size: 13, align: 'center', weight: 900, family: FONT.logo, color: M.color, ow: 4, maxWidth: r.w - 12 });
    text(ctx, M.name, r.w / 2, ah + (L.small ? 32 : 38), { size: L.small ? 20 : 22, align: 'center', weight: 800, family: FONT.title, color: '#fff4e0', ow: 4, maxWidth: r.w - 12 });
    text(ctx, this.tagOf(M), r.w / 2, ah + (L.small ? 50 : 60), { size: L.small ? 12 : 13, align: 'center', weight: 600, color: '#d0c4b4', ow: 2, maxWidth: r.w - 12 });
    ctx.restore();
  }
}
