// 성장: 경험치/레벨업/스킬 포인트/전직 조건
import { expToNext, MAX_LEVEL } from './stats.js';
import { CLASSES } from '../data/classes.js';
import { CHARACTERS } from '../data/characters.js';
import { bus } from '../core/events.js';
import { STARTER_SKILLS } from '../data/skills.js';

/** 경험치 획득. 반환: 오른 레벨 수 */
export function addExp(hero, amount) {
  if (hero.level >= MAX_LEVEL) return 0;
  hero.exp += Math.max(0, Math.round(amount));
  let ups = 0;
  while (hero.level < MAX_LEVEL && hero.exp >= expToNext(hero.level)) {
    hero.exp -= expToNext(hero.level);
    hero.level++;
    ups++;
    hero.sp = (hero.sp ?? 0) + (hero.level % 5 === 0 ? 2 : 1);
    bus.emit('levelUp', { charId: hero.charId, level: hero.level });
  }
  return ups;
}

/** 전직 가능한 다음 클래스 목록 */
export function availableClasses(hero) {
  const cur = CLASSES[hero.classId];
  return (cur?.next || []).map((id) => CLASSES[id]).filter(Boolean);
}
export function canChangeClass(hero, classId) {
  const c = CLASSES[classId];
  const cur = CLASSES[hero.classId];
  if (!c || !cur?.next?.includes(classId)) return { ok: false, reason: '전직 경로가 아님' };
  if (hero.level < c.reqLevel) return { ok: false, reason: `레벨 ${c.reqLevel} 필요` };
  return { ok: true };
}
export function changeClass(hero, classId) {
  const chk = canChangeClass(hero, classId);
  if (!chk.ok) return chk;
  hero.classId = classId;
  hero.sp = (hero.sp ?? 0) + 3; // 전직 보너스 스킬 포인트
  bus.emit('classChanged', { charId: hero.charId, classId });
  return { ok: true };
}

/** 1레벨부터 level 까지 자연스럽게 성장했을 때의 스킬 포인트 (시작 1 + 레벨업마다 1, 5의 배수 레벨은 2) — addExp 와 동일 규칙 */
export function spForLevel(level = 1) {
  const L = Math.max(1, Math.floor(level));
  return 1 + (L - 1) + Math.floor(L / 5);
}

/** 새 영웅 상태 */
export function newHero(charId, level = 1) {
  const ch = CHARACTERS[charId];
  // 시작 스킬(액티브 1레벨)을 무료로 지급하고 1번 슬롯(S)에 장착 → 새 게임부터 바로 스킬 사용 가능
  const starter = STARTER_SKILLS[charId];
  return {
    charId, level, exp: 0, classId: ch.rootClass, sp: spForLevel(level),
    skills: starter ? { [starter]: 1 } : {}, equip: { weapon: null, head: null, body: null, cloak: null, acc1: null, acc2: null },
    slots: [starter ?? null, null, null, null], sub: ch.startSub,
  };
}
