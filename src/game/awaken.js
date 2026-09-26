// STUB (W0 SKEL) — owner: AWAKEN-CORE
// 각성기(초필살기) 규칙과 필살 버튼 처리. 계약 (feel.md §6, §9 WP5; MASTER_PLAN §1.4, §1.7 #9, §1.13, §1.14):
//  handleUltInput(p, world) → true 면 입력을 소비함 (player.handleAttackInput 첫 줄에서 호출, 길게 누르기 판정 포함)
//  canAwaken(p, world) → bool
//  castAwakening(p, world) → bool (게이지 소모, 무적, freezeEnemies, awakenCutin 푸시 → 연출 감독 시작)
//  registerDirector(charId, fn)  영웅별 각성 연출 감독 등록 (AWAKEN-DIR-A/B)
// 스텁은 오늘의 필살기 동작을 그대로 유지한다:
//  player.js 의 `if (input.pressed('ult') && this.run.sp >= 100) { castUltimate(this, world); return; }` 와 동일.
import { input } from '../core/input.js';
import { castUltimate } from './skills.js';

const DIRECTORS = {};

export function handleUltInput(p, world) {
  if (input.pressed('ult') && (p.run?.sp ?? 0) >= 100) { castUltimate(p, world); return true; }
  return false;
}
export function canAwaken(p, world) { return false; }
export function castAwakening(p, world) { return false; }
export function registerDirector(charId, fn) { if (charId && typeof fn === 'function') DIRECTORS[charId] = fn; }
