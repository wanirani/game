// 아케이드 모드 선택: 보스 러시 / 서바이벌 / 스테이지 연습 + 난이도·레벨 프리셋·코스/스테이지 → 캐릭터 선택 → 임시 세이브로 시작
// owner: PLAT-FRONT-B (world2 §11, MASTER_PLAN §1.14·§1.16, platform §6.2–6.3)
//  - 2부 (world2 §11): BOSS_ORDER 에 2부 보스 7명, COURSES '이계편'·'전 보스 연속(20연전)', LEVEL_PRESETS '이계의 순례자'.
//    p2Known(game) 이 거짓이면 p2 코스·프리셋을 숨기고, 저장된 arcadeCfg 가 숨긴 항목을 가리키면 0번으로 돌아간다.
//    2부 보스는 클래스가 준비된 것(bosses_c/d 레지스트리에 있는 것)만 코스에 넣는다. 아직 스텁인 보스(예: 작업 중인 b_nihil)는
//    범용 보스로 대신하지 않고 건너뛴다. 준비된 2부 보스가 하나도 없는 코스는 숨긴다.
//  - 무기·방어구: baseIdFor(slot, min(7, wtier)) (티어 7 = 2부 장비)
//  - 연습 스테이지 목록은 모든 슬롯의 해금 합집합 (STAGE_ORDER 전체 → s14~s20 도 자동으로)
//  - uiScale 장면: game.uiW × game.uiH (최소 720×400) 로 배치. 탭 대상은 ui.taps (모드 카드·옵션 줄·시작·뒤로 ≥ 44/36 CSS px),
//    아래 안내 줄은 지금 기기의 글리프 (prompts.drawHints)
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
import { STAGES, STAGE_ORDER } from '../../data/stages.js';
import { BOSSES } from '../../data/bosses.js';
import { baseIdFor, ITEMS, makeItem } from '../../data/items.js';
import { SKILLS } from '../../data/skills.js';
import { SCRIPTS } from '../../data/story.js';
import * as QD from '../../data/quests.js';
import * as BOSS_REG from '../../game/bosses/index.js';
import * as BOSS_REG_C from '../../game/bosses/bosses_c.js';
import * as BOSS_REG_D from '../../game/bosses/bosses_d.js';
import { newGameState } from '../../game/state.js';
import { addItem, addByBase } from '../../game/inventory.js';
import {
  Ambience, kenBurns, shade, frame, heading, portraitIn, gbutton,
  follow, fmtClock, bossRushBests, GOLD, BONE,
} from './common.js';

export const ARCADE_MODES = {
  bossrush: { id: 'bossrush', name: '보스 러시', eng: 'BOSS RUSH', color: '#ff4a5a', art: 'portraits/b_dracula', tag: '군주들과의 연속 결투', desc: '악마성의 군주들과 쉬지 않고 연속으로 맞붙는다. 라운드 사이에 체력이 조금 회복된다. 가장 빠른 격파 시간에 도전하라!' },
  survival: { id: 'survival', name: '서바이벌', eng: 'SURVIVAL', color: '#ffa640', art: 'bg/s_arena', tag: '끝없는 마물의 물결', desc: '피의 투기장에 끝없이 몰려오는 마물의 물결. 웨이브를 넘길수록 적은 강해지고 점수 배율은 올라간다. 목숨은 단 하나!' },
  practice: { id: 'practice', name: '스테이지 연습', eng: 'STAGE PRACTICE', color: '#5aa8ff', art: 'bg/s06_library', tag: '해금한 스테이지 재도전', desc: '해금한 스테이지를 이야기 없이 다시 도전한다. 클리어 시간과 점수, 랭크를 갈고닦아 명예의 전당에 이름을 올려라.' },
};
export const MODE_ORDER = ['bossrush', 'survival', 'practice'];
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
];
/** BOSS_ORDER 에서 1부 보스 수 (이 뒤는 2부) */
export const P1_BOSSES = 13;
/** 보스 러시 코스 (번호는 기록 키: 0~2 는 예전 그대로). short = 기록·명예의 전당용 짧은 이름 (같은 이름의 두 코스를 구분) */
export const COURSES = [
  { name: '전반전', sub: '1~6장 보스', from: 0, to: 6, short: '전반전' },
  { name: '후반전', sub: '7~13장 보스', from: 6, to: 13, short: '후반전' },
  { name: '전 보스 연속', sub: '13연전', from: 0, to: 13, short: '전 보스 13연전' },
  { name: '이계편', sub: '14~20장 보스', from: 13, to: 20, p2: true, short: '이계편' },
  { name: '전 보스 연속', sub: '20연전', from: 0, to: 20, p2: true, short: '전 보스 20연전' },
];
const P2_COLOR = '#c8b8ff';

/** 2부 보스 클래스가 준비되었는가 (아직 스텁이면 bosses_c/d 레지스트리에서 빠져 있다 → 범용 보스 대신 건너뛴다) */
export function bossReady(id) {
  try {
    const C = BOSS_REG.BOSS_CLASSES?.[id] ?? BOSS_REG_C.BOSS_C?.[id] ?? BOSS_REG_D.BOSS_D?.[id];
    return typeof C === 'function';
  } catch { return false; }
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
/** 이 헌터 등급을 고를 수 있는가 */
export function presetAvailable(i, p2) {
  const P = LEVEL_PRESETS[i];
  return !!P && (!P.p2 || !!p2);
}
/** 이 코스를 고를 수 있는가: 2부 코스는 p2Known + 준비된 2부 보스가 하나 이상 */
export function courseAvailable(ci, p2) {
  const c = COURSES[ci];
  if (!c) return false;
  if (!c.p2) return true;
  if (!p2) return false;
  return BOSS_ORDER.slice(Math.max(c.from, P1_BOSSES), c.to).some((id) => bossUsable(id));
}
export const visiblePresets = (p2) => LEVEL_PRESETS.map((_, i) => i).filter((i) => presetAvailable(i, p2));
export const visibleCourses = (p2) => COURSES.map((_, i) => i).filter((i) => courseAvailable(i, p2));

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
/** 서바이벌 보스 웨이브에 나오는 보스 (1부, 2부를 알면 준비된 2부 보스까지) */
export function arenaBosses(p2) {
  return BOSS_ORDER.filter((id, i) => BOSSES[id] && (i < P1_BOSSES || (p2 && bossReady(id))));
}
/** 아케이드 설정 정리: 모르는 모드·난이도, 숨긴(또는 없는) 헌터 등급·코스는 기본값/0번으로 */
export function sanitizeCfg(cfg, p2, stages = null) {
  const c = { kind: 'bossrush', diff: 'normal', preset: 1, course: 0, stageId: 's01', ...(cfg ?? {}) };
  if (!MODE_ORDER.includes(c.kind)) c.kind = 'bossrush';
  if (!DIFFICULTIES.some((d) => d.id === c.diff)) c.diff = 'normal';
  c.preset = Number(c.preset); c.course = Number(c.course);
  if (!Number.isInteger(c.preset) || !presetAvailable(c.preset, p2)) c.preset = 0;
  if (!Number.isInteger(c.course) || !courseAvailable(c.course, p2)) c.course = 0;
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
  // 소모품
  try { addByBase(st, 'c_potion', P.potions); } catch { /* 무시 */ }
  // 스토리 대사·퀘스트 알림은 건너뜀
  st.progress.seenScripts = Object.keys(SCRIPTS);
  st.quests = { active: {}, done: Object.keys(QD.QUESTS ?? {}) };
  st.progress.unlocked = [...STAGE_ORDER];
  const d = getDiff(cfg.diff);
  st.lives = cfg.kind === 'survival' ? 1 : d.lives;
  return st;
}
/** 캐릭터 선택 후 호출: 임시 세이브를 만들고 모드 장면으로 */
export function startArcade(game, cfg, charId) {
  const unlocks = slotUnlocks();
  cfg = sanitizeCfg(cfg, p2Known(game, unlocks), practiceStages(game, unlocks));
  if (!CHARACTERS[charId]) charId = 'kael';
  if (!game.state?.arcade) game._arcadePrev = game.state ?? null;
  game.state = buildArcadeState(cfg, charId);
  const scene = cfg.kind === 'practice' ? 'practice' : cfg.kind;
  game.go(scene, { cfg: { ...cfg, charId } }, { fadeTime: 0.6 });
}
/** 아케이드 종료 시 이전 세이브 복원 */
export function endArcade(game) {
  if (game.state?.arcade) game.state = game._arcadePrev ?? null;
  game._arcadePrev = null;
}

export class ArcadeScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter({ cfg = null } = {}) {
    endArcade(this.game);
    audio.music('title');
    const m = this.game.meta ?? {};
    const unlocks = slotUnlocks();
    this.p2 = p2Known(this.game, unlocks);
    this.stages = practiceStages(this.game, unlocks);
    this.cfg = sanitizeCfg({ ...(m.arcadeCfg ?? {}), ...(cfg ?? {}) }, this.p2, this.stages);
    this.modeIndex = Math.max(0, MODE_ORDER.indexOf(this.cfg.kind));
    this.row = 0; // 0: 모드 카드, 1..: 옵션 줄
    this.amb = new Ambience({ embers: 50, motes: 20, bats: 6, lightning: true });
    this.amb.nextBolt = 3;
    this.selK = [0, 0, 0];
    this.optK = 0; // 옵션 줄 강조 애니메이션
    this._grad = new Map();
    taps.clear();
  }
  get kind() { return MODE_ORDER[this.modeIndex] ?? 'bossrush'; }
  /** 옵션 줄 (지금 모드). 각 줄: { id, label, value, color, n, i, set(i) } — n/i 는 보이는 항목 기준 */
  options() {
    const c = this.cfg, k = this.kind;
    const pres = visiblePresets(this.p2);
    const pi = Math.max(0, pres.indexOf(c.preset));
    const P = LEVEL_PRESETS[pres[pi]];
    const rows = [
      { id: 'diff', label: '난이도', value: getDiff(c.diff).name, color: getDiff(c.diff).color, n: DIFFICULTIES.length, i: Math.max(0, DIFFICULTIES.findIndex((d) => d.id === c.diff)), set: (i) => { c.diff = DIFFICULTIES[i].id; } },
      { id: 'preset', label: '헌터 등급', value: `${P.name} (Lv.${P.lv})`, color: P.p2 ? P2_COLOR : null, n: pres.length, i: pi, set: (i) => { c.preset = pres[i]; } },
    ];
    if (k === 'bossrush') {
      const cs = visibleCourses(this.p2);
      const ci = Math.max(0, cs.indexOf(c.course));
      rows.push({ id: 'course', label: '코스', value: courseLabel(cs[ci]), color: COURSES[cs[ci]]?.p2 ? P2_COLOR : null, n: cs.length, i: ci, set: (i) => { c.course = cs[i]; } });
    }
    if (k === 'practice') {
      const si = Math.max(0, this.stages.indexOf(c.stageId));
      const st = STAGES[this.stages[si]];
      rows.push({ id: 'stage', label: '스테이지', value: `제${st.chapter}장 ${st.name}`, color: st.part === 2 ? P2_COLOR : null, n: this.stages.length, i: si, set: (i) => { c.stageId = this.stages[i]; } });
    }
    return rows;
  }
  change(row, d) {
    const r = this.options()[row];
    if (!r || r.n <= 1) return;
    const i = (r.i + d + r.n) % r.n;
    if (i === r.i) return;
    r.set(i); audio.sfx('menu_move');
  }
  setMode(i, sfx = 'menu_move') {
    i = clamp(i, 0, MODE_ORDER.length - 1);
    if (i !== this.modeIndex) { this.modeIndex = i; audio.sfx(sfx); }
    this.cfg.kind = this.kind;
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
      else if (input.pressed('down')) { this.row = 1; audio.sfx('menu_move'); }
      else if (input.pressed('confirm')) this.go();
      else if (input.pressed('cancel')) this.leave();
      return;
    }
    // 옵션 줄
    if (input.pressed('up')) { this.row--; audio.sfx('menu_move'); }
    else if (input.pressed('down')) { if (this.row < n) { this.row++; audio.sfx('menu_move'); } }
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
    audio.sfx('menu_ok'); audio.sfx('coin_insert');
    g.flash(ARCADE_MODES[this.kind].color, 0.3, 3);
    g.go('charselect', { mode: 'arcade', arcade: { ...this.cfg }, difficulty: this.cfg.diff });
  }
  leave() { audio.sfx('menu_cancel'); this.game.go('title', { menu: true, index: 2 }); }

  /** 배치 (UI px). 720×400 까지 겹치지 않는다 */
  layout(nOpt) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const L0 = this._L;
    if (L0 && L0.W === W && L0.H === H && L0.nOpt === nOpt) return L0;
    const small = H < 480;
    const gap = small ? 12 : 16;
    const cw = Math.floor(Math.min(270, (W - 48 - gap * 2) / 3));
    const CW = cw * 3 + gap * 2, x0 = Math.round((W - CW) / 2);
    const cardY = small ? 76 : 100, ch = small ? 118 : 172;
    const descY = cardY + ch + (small ? 20 : 26), descLH = small ? 15 : 17, descSize = small ? 12 : 13;
    const oy = descY + descLH + (small ? 12 : 18);
    const rowH = small ? 46 : 44;
    const RW = small ? 250 : 270, PW = CW - RW - 16, rx = x0 + PW + 16;
    const panelH = nOpt * rowH + 12;
    return (this._L = {
      W, H, small, nOpt, top: small ? 30 : 44, hs: small ? 24 : 30,
      gap, cw, CW, x0, cardY, ch, artH: small ? 60 : 104, descY, descLH, descSize,
      oy, rowH, PW, RW, rx, panelH, labelW: small ? 112 : 124,
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
      this.drawCard(ctx, r, ARCADE_MODES[id], this.selK[i], k, i === this.modeIndex, L);
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
      text(ctx, o.label, ox + 16, by, { size: 15, weight: 800, color: sel ? '#fff4dc' : '#c8b8a8', ow: 2 });
      text(ctx, o.value, vx, by, { size: 15, align: 'center', weight: 800, color: o.color ?? (sel ? GOLD : BONE), ow: 2, maxWidth: ow - lw - 70 });
      const on = o.n > 1, ac = sel ? GOLD : 'rgba(232,200,114,0.5)';
      if (on) {
        text(ctx, '◀', ox + lw + 14, by, { size: 16, align: 'center', color: ac, ow: 2 });
        text(ctx, '▶', ox + ow - 18, by, { size: 16, align: 'center', color: ac, ow: 2 });
      }
      if (i > 0) { ctx.fillStyle = 'rgba(232,200,114,0.08)'; ctx.fillRect(ox + 10, y, ow - 20, 1); }
      // 탭: 이름 칸 = 다음 값, 값의 왼쪽 반 = 이전, 오른쪽 반 = 다음 (목록 줄 높이 ≥ 36 CSS px)
      const zk = { ...own, kind: 'list', src: 'arcade.option', disabled: !on };
      taps.add(`opt:${i}:1`, { x: ox, y, w: lw, h: oh }, zk);
      taps.add(`opt:${i}:-1`, { x: ox + lw, y, w: vx - ox - lw, h: oh }, zk);
      taps.add(`opt:${i}:1`, { x: vx, y, w: ox + ow - vx, h: oh }, zk);
    });
    // 기록 + 시작
    const best = this.bestText();
    if (best) wrap(ctx, best, L.RW, 12, 700).slice(0, 2).forEach((l, i) => text(ctx, l, L.rx + L.RW / 2, oy + 12 + i * 16, { size: 12, align: 'center', weight: 700, color: '#d8c0a0', ow: 2 }));
    gbutton(ctx, L.start, '헌터 선택으로', { selected: true, accent: M.color, size: 16, icon: '▶' });
    taps.add('start', L.start, { ...own, kind: 'primary', src: 'arcade.start' });
    gbutton(ctx, L.back, '뒤로', { size: 15, icon: '◀' });
    taps.add('back', L.back, { ...own, kind: 'primary', src: 'arcade.back' });
    this.drawFooter(ctx, W, H);
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
    const hs = (m.highScores ?? []).filter((h) => h.mode === this.kind);
    const top = hs[0];
    if (this.kind === 'bossrush') {
      const ci = this.cfg.course ?? 0, b = bossRushBests(m)[ci];
      if (b) return `${COURSES[ci]?.short ?? COURSES[ci]?.name ?? ''} 최단 기록  ${fmtClock(b.time ?? 0)} · ${fmt(b.score ?? 0)}점 · ${CHARACTERS[b.charId]?.name ?? ''}`;
    }
    if (this.kind === 'survival' && (m.survivalBest ?? 0) > 0) return `최고 기록  웨이브 ${m.survivalBest}${top ? ` · ${fmt(top.score)}점` : ''}`;
    if (top) return `최고 점수  ${fmt(top.score)}점 · ${top.name || CHARACTERS[top.charId]?.name || ''}`;
    return '아직 기록이 없습니다';
  }
  drawCard(ctx, r, M, s, k, cur, L) {
    const sc = 1 + 0.04 * s;
    ctx.save();
    ctx.globalAlpha = k * (0.7 + 0.3 * s);
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(sc, sc); ctx.translate(-r.w / 2, -r.h / 2);
    frame(ctx, 0, 0, r.w, r.h, { accent: M.color, glow: s * (cur && this.row === 0 ? 1.2 : 0.5), edge: 0.4 + 0.6 * s });
    const ah = L.artH;
    const ar = { x: 6, y: 6, w: r.w - 12, h: ah };
    const img = assets.get(M.art);
    portraitIn(ctx, img, ar, { fy: M.art.startsWith('portraits') ? 0.18 : 0.5, zoom: 1 + 0.03 * s, fadeBottom: 0.55 });
    if (M.id === 'bossrush') {
      // 보스 초상화 몽타주 (2부를 알면 마지막 칸은 공허의 니힐)
      const ids = this.p2 ? ['b_death', 'b_chaos', 'b_nihil'] : ['b_nightwing', 'b_death', 'b_chaos'];
      ids.forEach((id, j) => {
        const pr = { x: 6 + j * (ar.w / 3), y: 6, w: ar.w / 3, h: ah };
        portraitIn(ctx, assets.get(`portraits/${id}`), pr, { fy: 0.15, zoom: 1.2, fadeBottom: 0.6, alpha: 0.95 });
      });
    }
    ctx.fillStyle = rgba(M.color, 0.55); ctx.fillRect(r.w * 0.15, ah + 5, r.w * 0.7, 2);
    text(ctx, M.eng, r.w / 2, ah + 2, { size: 13, align: 'center', weight: 900, family: FONT.logo, color: M.color, ow: 4 });
    text(ctx, M.name, r.w / 2, ah + (L.small ? 32 : 38), { size: L.small ? 20 : 22, align: 'center', weight: 800, family: FONT.title, color: '#fff4e0', ow: 4 });
    text(ctx, M.tag, r.w / 2, ah + (L.small ? 50 : 60), { size: L.small ? 12 : 13, align: 'center', weight: 600, color: '#d0c4b4', ow: 2 });
    ctx.restore();
  }
}
