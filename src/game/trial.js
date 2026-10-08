// 시련 「메아리」 엔진 — 지금은 ASC-CORE 스텁 (docs/specs/classes_t3.md §9.3). TRIALS-ENGINE 이 같은 export 이름으로 본문을 채운다.
//  startTrial(game, tid)          성당 → (저장) → pre 대본 → 스테이지 (mode 'trial')
//  prepareTrial(game, tid)        → { T, stage, opts }  (World 생성 인자: rules·diffOver·levelOverride)
//  attachTrial(scene, world, T)   월드 인스턴스 덮어쓰기 (EXP·전리품 없음, 문 봉인, 통과·실패 처리) + 배너
//  retryTrial(game, tid) · leaveTrial(game, tid, why)
//  TRIAL_STATS                    디버그·QA 카운터
// 스텁 동작: startTrial 은 시작 조건(progression.canStartTrial)을 확인해 막히면 그 이유를, 통과하면 '준비 중인 시련입니다' 를 토스트로 띄운다.
import { TRIALS } from '../data/trials.js';
import { canStartTrial } from './progression.js';

export const TRIAL_STATS = { started: 0, cleared: 0, failed: 0, left: 0 };

const heroOf = (game) => game?.state?.heroes?.[game?.state?.charId] ?? null;
const toast = (game, text) => { try { game?.toast?.(text, '#c8a0ff', 1.6); } catch (e) { console.warn('[trial]', e); } };

/** 시련 시작 (스텁: 조건 확인 + 안내 토스트만). 반환: canStartTrial 결과 */
export function startTrial(game, tid) {
  const chk = canStartTrial(heroOf(game), tid, game?.state);
  toast(game, chk.ok ? '준비 중인 시련입니다' : chk.reason);
  return chk;
}
/** 시련 월드 준비물 (스텁: 시련 표만) */
export function prepareTrial(game, tid) {
  const T = Object.hasOwn(TRIALS, tid) ? TRIALS[tid] : null;
  return T ? { T, stage: null, opts: null } : null;
}
/** 월드 덮어쓰기 (스텁: 아무것도 하지 않음) */
export function attachTrial(scene, world, T) { void scene; void world; void T; }
/** 다시 도전 (스텁: startTrial 과 같음) */
export function retryTrial(game, tid) { return startTrial(game, tid); }
/** 성당으로 (스텁: 아무것도 하지 않음) */
export function leaveTrial(game, tid, why) { void game; void tid; void why; }
