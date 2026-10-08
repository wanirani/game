// 시련 「메아리」 엔진 — owner: TRIALS-ENGINE (docs/specs/classes_t3.md §9.3 · story_ext.md §2–§4)
//  startTrial(game, tid)          성당 → (저장) → pre 대본(대화 오버레이) → 스테이지 'stage' { mode: 'trial', roomId: 'boss', trial: tid }
//  prepareTrial(game, tid)        → { T, stage, opts } — scenes/stage.js 가 new World(game, stage, opts) 로 쓴다
//                                   stage = 본래 스테이지 복사본 (intro/outro/next/unlocks 없음), opts = { roomId, mode, trial: T, rules, diffOver, levelOverride }
//                                   diffOver: 규칙(DAILY_MODS)의 난이도 값 + T.diffOver 를 그 난이도 값에 곱한 것 (bossHp 는 boss.js 에서 절댓값)
//  attachTrial(scene, world, T)   월드 인스턴스 덮어쓰기 (arcade_run PracticeScene 기법):
//                                   경험치 없음 · 점수/목숨 저장 없음 · 방 이동/문 → 「시련의 결계」 · 보스 격파 = 연출만 (진행·전리품·업적 없음)
//                                   → finishStage 가 completeTrial, 사망 → failTrial (목숨·사망 수 그대로) + 시작 배너 '시련'
//  retryTrial(game, tid)          실패 화면 「다시 도전」: 새 월드로 바로 보스방 (대본 없이)
//  leaveTrial(game, tid, why)     실패 화면 「성당으로」 · 일시정지 「시련 포기」: 마을 성당 앞에서 성당(전직 탭)을 연다
//  TRIAL_STATS                    { started, cleared, failed, left, retried, last } (QA)
// 통과: hero.trials[tid] = { done, at, best(보스전 초), tries } · unlockFromTrial · 저장 → win 대본(컷신) → 마을 → 성당 (새로 열린 칸 축하)
// 시련 중에도 적 처치는 enemyKilled 를 낸다 (도감·처치 수·처치 퀘스트, §9.2 그대로). stageCleared · bossKilled 는 내지 않는다.
// 옛 세이브의 영웅에는 trials 필드가 없을 수 있다 → 기록 전에 만든다 (requests_f ASC-CORE).
import { TRIALS } from '../data/trials.js';
import { STAGES } from '../data/stages.js';
import { getDiff } from '../data/difficulty.js';
import { applyMods, modName } from '../core/online.js';
import { saves } from '../core/save.js';
import { audio } from '../core/audio.js';
import { canStartTrial, unlockFromTrial } from './progression.js';
import { preloadStageBosses } from './bosses/lazy.js';

export const TRIAL_STATS = { started: 0, cleared: 0, failed: 0, left: 0, retried: 0, last: null };
/** 시련 색 (배너·토스트·결계) */
export const TRIAL_COLOR = '#c8a0ff';
const SLOWMO_BOSS = 0.35;   // world.js SLOWMO_BASE 와 같은 값 (보스 격파 슬로모션 배율)
const BLOCK_GAP = 1.5;      // 「시련의 결계」 토스트 최소 간격 (초)

const trialOf = (tid) => (typeof tid === 'string' && Object.hasOwn(TRIALS, tid) ? TRIALS[tid] : null);
const heroOf = (game) => game?.state?.heroes?.[game?.state?.charId] ?? null;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
function toast(game, text, sec = 1.8) { try { game?.toast?.(text, TRIAL_COLOR, sec); } catch (e) { console.warn('[trial]', e); } }
function save(game) {
  const st = game?.state;
  if (!st || st.arcade) return;
  try { saves.write(st.slot ?? 1, st); } catch (e) { console.warn('[trial] save', e); }
}
/** hero.trials[tid] (없으면 만든다 — 옛 세이브의 영웅에는 trials 필드가 없다) → { done, at, best, tries } */
export function trialRecord(hero, tid) {
  if (!hero) return null;
  if (!isObj(hero.trials)) hero.trials = {};
  let r = hero.trials[tid];
  if (!isObj(r)) r = hero.trials[tid] = {};
  r.done = !!r.done;
  r.at = Number.isFinite(r.at) ? r.at : 0;
  r.best = Number.isFinite(r.best) && r.best > 0 ? r.best : null;
  r.tries = Number.isInteger(r.tries) && r.tries >= 0 ? r.tries : 0;
  return r;
}
/** 규칙 이름 목록 (성당 확인 창과 같은 표기) */
export function trialRuleNames(T) {
  if (!T) return [];
  return [...(T.mods ?? []).map((m) => modName(m)), ...(T.diffOver?.bossHp ? [`보스 체력 ${T.diffOver.bossHp}배`] : [])];
}

/** 성당 「도전한다」: 조건 확인 → 저장 → pre 대본(다시 하면 preAgain) → 시련 스테이지. 반환: canStartTrial 결과 */
export function startTrial(game, tid) {
  const T = trialOf(tid), st = game?.state;
  const chk = canStartTrial(heroOf(game), tid, st);
  if (!chk.ok || !T) { toast(game, chk.reason || '시련을 시작할 수 없다'); return chk; }
  const done = !!heroOf(game)?.trials?.[tid]?.done;
  save(game);   // 성당에서 출발하는 지금을 남긴다 (시련 중에는 세이브 지점이 없다)
  try { preloadStageBosses(T.stage)?.catch?.(() => null); } catch (e) { console.warn('[trial] preload', e); }
  TRIAL_STATS.started++; TRIAL_STATS.last = 'start';
  const go = () => goTrialStage(game, T);
  const script = done ? T.preAgain : T.pre;
  if (script && game?.registry?.dialogue) game.push('dialogue', { script, world: game.world, onEnd: go });
  else go();
  return chk;
}
function goTrialStage(game, T) {
  game.go('stage', { stageId: T.stage, roomId: T.room ?? 'boss', mode: 'trial', trial: T.id });
}

/** 시련 월드 준비물 → { T, stage, opts } | null (모르는 시련·스테이지) */
export function prepareTrial(game, tid) {
  const T = trialOf(tid);
  const base = T ? STAGES[T.stage] : null;
  if (!T || !base) return null;
  const stage = { ...base, intro: null, outro: null, next: null, unlocks: [] };
  const D = getDiff(game?.state?.difficulty);
  const { diffOver, rules } = applyMods(D, T.mods);
  // T.diffOver 는 배율: 이 난이도 값(규칙이 이미 바꿨으면 그 값)에 곱한다. bossHp 는 boss.js 에서 절댓값이라 그대로 넘기면 난이도를 덮는다
  const over = { ...diffOver };
  if (isObj(T.diffOver)) {
    for (const [k, v] of Object.entries(T.diffOver)) {
      if (!Number.isFinite(v)) continue;
      const cur = over[k] ?? D?.[k] ?? (k === 'bossHp' ? D?.enemyHp : null) ?? 1;
      over[k] = cur * v;
    }
  }
  const opts = { roomId: T.room ?? 'boss', mode: 'trial', trial: T, rules: { ...rules, label: '시련의 규칙' }, diffOver: over, levelOverride: T.level };
  return { T, stage, opts };
}

/** 월드 인스턴스 덮어쓰기 + 시작 배너 (scenes/stage.js 가 World 를 만든 직후) */
export function attachTrial(scene, w, T) {
  if (!w || !T) return;
  const game = w.game;
  w.gainExp = () => 0;
  w.syncToState = () => { w.hero.sub = w.run.sub; };   // 점수·목숨은 세이브에 쓰지 않는다 (보조 무기만)
  let blockT = -99;
  const block = () => {
    const p = w.player;
    if (!p || p.dead) return;
    const m = w.map, W = m?.pxW ?? 0, H = m?.pxH ?? 0;
    // 방 가장자리 출구(월드가 gotoRoom 을 부른 자리) → 안쪽으로 되밀기, 문 → 반 걸음 뒤로
    if (p.x > W - p.w) { p.x = W - p.w - 10; p.vx = Math.min(0, p.vx) - 120; }
    else if (p.x < 0) { p.x = 10; p.vx = Math.max(0, p.vx) + 120; }
    else p.x -= (p.facing || 1) * 14;
    if (p.y < 0) { p.y = 0; p.vy = Math.max(0, p.vy); }
    if (p.y > H - p.h) { const cp = w.run?.checkpoint; if (cp) { p.x = cp.x; p.y = cp.y; } p.vy = 0; }
    p.vx = Math.sign(p.vx) * Math.min(Math.abs(p.vx), 160);
    if (w.rt - blockT < BLOCK_GAP) return;
    blockT = w.rt;
    toast(game, '시련의 결계가 길을 막는다', 1.6);
    audio.sfx('menu_cancel', { vol: 0.6 });
    w.fx?.ring?.(p.cx, p.cy, { color: TRIAL_COLOR, r0: 8, r1: 70, life: 0.4, width: 4 });
  };
  w.gotoRoom = block;
  w.enterDoor = block;
  const startBoss = w.startBoss.bind(w);
  w.startBoss = () => { w.trialFightT0 = w.run.time; startBoss(); };   // 기록 = 보스전 시간 (방에 들어와 걸은 시간 제외)
  w.onBossDefeated = (b) => trialBossDown(w, b, T);
  w.finishStage = () => completeTrial(game, w, T);
  w.onPlayerDeath = () => failTrial(game, w, T);
  w.banner = { text: '시련', sub: T.name, t: 2.4, color: TRIAL_COLOR, big: true };
  const rn = trialRuleNames(T);
  if (rn.length) setTimeout(() => { if (game.world === w && !w.cleared) toast(game, `시련의 규칙: ${rn.join(' · ')}`, 3); }, 900);
  void scene;
}

/** 보스 격파: 연출만 (진행·보스 기록·플래그·전리품·동료 유대·bossKilled 없음) */
function trialBossDown(w, boss, T) {
  if (w.cleared) return;
  w.cleared = true; w.clearT = 0;
  w.trialTime = Math.max(0, w.run.time - (w.trialFightT0 ?? 0));
  w.slowmo = 1.6; w.slowmoScale = SLOWMO_BOSS;
  w.game.flash('#ffffff', 1, 1.2);
  w.camera.shake(16, 1.2);
  audio.stopMusic(0.3);
  audio.sfx('boss_die');
  audio.sfx('bell', { vol: 0.5 });
  // 메아리가 흩어진다: 보라 고리 둘 + 불티 (한 번)
  const fx = w.fx, q = fx?.quality ?? 1;
  fx?.ring?.(boss.cx, boss.cy, { color: TRIAL_COLOR, r0: 20, r1: 260, life: 0.9, width: 8 });
  fx?.ring?.(boss.cx, boss.cy, { color: '#fff2d0', r0: 10, r1: 160, life: 0.6, width: 4 });
  fx?.burst?.('magic', boss.cx, boss.cy, Math.round(28 * q), { speed: 240, color: TRIAL_COLOR });
  w.banner = { text: '시련 통과', sub: T.name, t: 4, color: TRIAL_COLOR, big: true };
}

/** 통과 → 기록·해금·저장 → win 대본(컷신) → 마을 성당 앞 → 성당 전직 탭 (새로 열린 칸) */
function completeTrial(game, w, T) {
  if (w.trialEnded) return;
  w.trialEnded = 'clear';
  const hero = w.hero ?? heroOf(game);
  const rec = trialRecord(hero, T.id);
  const wasDone = rec.done;
  const t = Math.round((w.trialTime ?? w.run.time ?? 0) * 10) / 10;
  rec.done = true; rec.at = Date.now(); rec.tries++;
  if (t > 0) rec.best = rec.best > 0 ? Math.min(rec.best, t) : t;
  const added = unlockFromTrial(hero, T.id);
  try { w.syncToState(); } catch (e) { console.warn('[trial] sync', e); }
  save(game);
  TRIAL_STATS.cleared++; TRIAL_STATS.last = 'clear';
  game.go('story', {
    script: wasDone ? T.winAgain : T.win, then: 'hub',
    thenParams: { from: 'church', open: 'church', trial: T.id, unlocked: added },
    bg: T.bg, music: T.music,
  });
}

/** 쓰러짐 → 도전 횟수 +1 (다음 저장 때 남는다) → 실패 화면. 목숨·사망 수는 그대로 */
function failTrial(game, w, T) {
  if (w.cleared) { w.reviveAfterClear?.(); return; }   // 보스를 쓰러뜨린 뒤 쓰러짐: 제자리에서 일으킨다 (world.js 와 같다)
  if (w.trialEnded) return;
  w.trialEnded = 'fail';
  const rec = trialRecord(w.hero ?? heroOf(game), T.id);
  if (rec) rec.tries++;
  TRIAL_STATS.failed++; TRIAL_STATS.last = 'fail';
  if (game.registry?.trialEnd) game.push('trialEnd', { world: w, tid: T.id });
  else leaveTrial(game, T.id, 'fail');
}

/** 「다시 도전」: 새 월드로 보스방 (조건이 깨졌으면 성당으로) */
export function retryTrial(game, tid) {
  const T = trialOf(tid);
  const chk = canStartTrial(heroOf(game), tid, game?.state);
  if (!T || !chk.ok) { toast(game, chk.reason || '시련을 시작할 수 없다'); leaveTrial(game, tid, 'blocked'); return chk; }
  TRIAL_STATS.retried++; TRIAL_STATS.last = 'retry';
  try { preloadStageBosses(T.stage)?.catch?.(() => null); } catch { /* 스테이지 입장 때 다시 받는다 */ }
  audio.sfx('bell', { vol: 0.4 });
  goTrialStage(game, T);
  return chk;
}

/** 「성당으로」·「시련 포기」: 마을 성당 앞 → 성당 전직 탭. why: 'leave' | 'quit' | 'fail' | 'blocked' */
export function leaveTrial(game, tid, why = 'leave') {
  if (!game) return;
  const w = game.world;
  if (w?.trial && w.trial.id === tid) {
    // 보스전 도중 포기한 것은 한 번의 도전으로 센다 (실패 화면에서 떠날 때는 failTrial 이 이미 셌다)
    if (why === 'quit' && w.bossActive && !w.trialEnded) { const r = trialRecord(w.hero, tid); if (r) r.tries++; }
    w.trialEnded ||= why;
    try { w.syncToState(); } catch { /* 무시 */ }
  }
  save(game);
  TRIAL_STATS.left++; TRIAL_STATS.last = why;
  if (game.registry?.hub) game.go('hub', { from: 'church', open: 'church' });
  else game.go('title', {});
}
