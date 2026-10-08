// 성장: 경험치/레벨업/스킬 포인트/전직 조건
import { expToNext, MAX_LEVEL } from './stats.js';
import { CLASSES } from '../data/classes.js';
import { CHARACTERS } from '../data/characters.js';
import { bus } from '../core/events.js';
import { STARTER_SKILLS } from '../data/skills.js';
import { ASCENSIONS, ASC_REQ, ascListFor, unlocksOf, p2Cleared, flagEver } from '../data/ascensions.js';   // 초월·비전 (classes_t3 §2.4)
import { TRIALS, trialsOf } from '../data/trials.js';

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
  if (hero.asc) leaveAsc(hero);   // 방어: 초월은 2차에서만 (2차는 다음 전직이 없다)
  hero.asc = null;
  hero.classId = classId;
  hero.sp = (hero.sp ?? 0) + 3; // 전직 보너스 스킬 포인트
  bus.emit('classChanged', { charId: hero.charId, classId, asc: null });
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
    asc: null, ascUnlocked: [], trials: {}, ascSp: false, ascSlot: null,   // 초월·비전·시련 (classes_t3 §1.1)
  };
}

// ───────────────────────── 초월 · 비전 · 시련 (classes_t3 §2.4) ─────────────────────────
// 판정 함수는 { ok, code, reason } 을 돌려준다 — code 는 명세 순서대로 처음 걸린 조건 (UI 가 색·문구를 고른다), reason 은 한국어 한 줄.
const R = (code, reason, x) => ({ ok: false, code, reason, ...x });
const OK = { ok: true, code: 'ok', reason: '' };
const isTier2 = (hero) => CLASSES[hero?.classId]?.tier === 2;
const ascEntry = (id) => (typeof id === 'string' && Object.hasOwn(ASCENSIONS, id) ? ASCENSIONS[id] : null);
const trialEntry = (tid) => (typeof tid === 'string' && Object.hasOwn(TRIALS, tid) ? TRIALS[tid] : null);
const trialDone = (hero, tid) => !!hero?.trials?.[tid]?.done;
/** 받침 있으면 a, 없으면 b (「…」을/를) — 마지막 한글 글자 기준, 한글이 아니면 a */
function josa(word, a, b) {
  const s = String(word ?? '');
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s.charCodeAt(i);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? a : b;
    if (/[0-9A-Za-z]/.test(s[i])) return a;
  }
  return a;
}

/**
 * 시련을 시작할 수 있는가 → { ok, reason, code }. 순서 (§2.4 · §9.1):
 *  'unknown' | 'hero'(지금 영웅의 시련이 아님) | 'tier' | 'p2'(이번 회차 flags.p2_done) | 'story'(reqFlag, 첫 통과 전만)
 *  | 'prev'(Ⅱ 는 Ⅰ 통과 뒤) | 'level'. 통과한 시련은 같은 조건('story' 제외)으로 다시 도전할 수 있다
 */
export function canStartTrial(hero, tid, state) {
  const T = trialEntry(tid);
  if (!T || !hero) return R('unknown', '알 수 없는 시련이다');
  if (T.charId !== hero.charId || (state?.charId && state.charId !== hero.charId)) return R('hero', '다른 헌터의 시련이다');
  if (!isTier2(hero)) return R('tier', '최상급 직업에서만 도전할 수 있다');
  if (!state?.progress?.flags?.p2_done) return R('p2', '2부의 결말을 본 뒤에 열린다');
  const done = trialDone(hero, tid);
  if (!done && T.reqFlag && !flagEver(state, T.reqFlag)) return R('story', T.reqText ?? '');
  if (T.n === 2) { const t1 = trialsOf(T.charId).find((x) => x.n === 1); if (t1 && !trialDone(hero, t1.id)) return R('prev', '시련 Ⅰ을 먼저 넘어야 한다'); }
  if ((hero.level ?? 1) < T.reqLevel) return R('level', `레벨 ${T.reqLevel} 필요`);
  return OK;
}
/** 성당 카드용 상태 → { state: 'locked'|'ready'|'done', reason, code } (done 이면 code/reason 은 다시 도전 가능 여부) */
export function trialStatus(hero, tid, state) {
  const chk = canStartTrial(hero, tid, state);
  if (trialDone(hero, tid)) return { state: 'done', reason: chk.ok ? '' : chk.reason, code: chk.code };
  return { state: chk.ok ? 'ready' : 'locked', reason: chk.reason, code: chk.code };
}

/**
 * 초월/비전(또는 전환)할 수 있는가 → { ok, reason, code, trial? }. 순서:
 *  'unknown' | 'hero' | 'tier' | 'line'(이 2차의 길이 아님) | 'current'(이미 그 길) | 'p2'(p2Cleared, NG+ 회차도 참)
 *  | 'trial'(그 시련을 아직 못 넘음 → trial: tid) | 'level'
 */
export function canAscend(hero, id, state) {
  const A = ascEntry(id);
  if (!A || !hero) return R('unknown', '알 수 없는 길이다');
  if (A.charId !== hero.charId) return R('hero', '다른 헌터의 길이다');
  if (!isTier2(hero)) return R('tier', '최상급 직업에서만 초월할 수 있다');
  if (!A.parents.includes(hero.classId)) return R('line', '이 계보의 길이 아니다');
  if (hero.asc === id) return R('current', '이미 이 길을 걷고 있다');
  if (!p2Cleared(state)) return R('p2', '2부의 결말을 본 뒤에 열린다');
  if (!(Array.isArray(hero.ascUnlocked) && hero.ascUnlocked.includes(id))) {
    const T = trialEntry(A.trial);
    const nm = T?.name ?? A.trial;
    return R('trial', `「${nm}」${josa(nm, '을', '를')} 넘어야 한다`, { trial: A.trial });
  }
  if ((hero.level ?? 1) < A.reqLevel) return R('level', `레벨 ${A.reqLevel} 필요`);
  return OK;
}
/** 지금 2차에서 고를 수 있는 길 [{ asc, chk }] (초월, 비전 순 — 2차가 아니면 []) */
export function availableAscensions(hero, state) {
  return ascListFor(hero?.classId).map((id) => ({ asc: ASCENSIONS[id], chk: canAscend(hero, id, state) }));
}
/** 시련 통과 → 그 시련이 여는 id 를 ascUnlocked 에 넣는다 → 새로 열린 id 들. 비전이 열리면 비전 기술 1레벨을 준다 (무료) */
export function unlockFromTrial(hero, tid) {
  if (!hero) return [];
  if (!Array.isArray(hero.ascUnlocked)) hero.ascUnlocked = [];
  const added = [];
  for (const id of unlocksOf(tid)) {
    if (ASCENSIONS[id].charId !== hero.charId || hero.ascUnlocked.includes(id)) continue;
    hero.ascUnlocked.push(id); added.push(id);
    const sk = ASCENSIONS[id].skill;
    if (sk) { if (!hero.skills || typeof hero.skills !== 'object') hero.skills = {}; if (!(hero.skills[sk] > 0)) hero.skills[sk] = 1; }
  }
  return added;
}
/** 비전을 떠날 때: 비전 기술을 슬롯에서 빼고, 그 기술에 밀려났던 스킬을 제자리로 */
function leaveAsc(hero) {
  const P = ascEntry(hero.asc);
  if (P?.kind !== 'hidden' || !Array.isArray(hero.slots)) { if (hero.ascSlot) hero.ascSlot = null; return; }
  const k = hero.slots.indexOf(P.skill);
  if (k >= 0) hero.slots[k] = null;
  const sl = hero.ascSlot;
  if (sl && typeof sl.prev === 'string' && hero.slots[sl.i] == null && hero.skills?.[sl.prev] > 0 && !hero.slots.includes(sl.prev)) hero.slots[sl.i] = sl.prev;
  hero.ascSlot = null;
}
/** 비전에 들어설 때: 비전 기술 1레벨(무료) + 빈 슬롯에 장착, 빈칸이 없으면 4번 슬롯을 빌리고 원래 스킬을 ascSlot 에 기억 */
function enterAsc(hero, A) {
  if (A.kind !== 'hidden' || !A.skill) return;
  if (!hero.skills || typeof hero.skills !== 'object') hero.skills = {};
  if (!(hero.skills[A.skill] > 0)) hero.skills[A.skill] = 1;
  if (!Array.isArray(hero.slots)) hero.slots = [null, null, null, null];
  while (hero.slots.length < 4) hero.slots.push(null);
  if (hero.slots.includes(A.skill)) return;
  const i = hero.slots.indexOf(null);
  if (i >= 0 && i < 4) { hero.slots[i] = A.skill; hero.ascSlot = null; return; }
  hero.ascSlot = { i: 3, prev: hero.slots[3] ?? null };
  hero.slots[3] = A.skill;
}
function setAsc(hero, id) {
  const prev = hero.asc ?? null;
  const first = id != null && !hero.ascSp;
  leaveAsc(hero);
  hero.asc = id;
  if (first) { hero.sp = (hero.sp ?? 0) + ASC_REQ.firstSp; hero.ascSp = true; }
  if (id != null) enterAsc(hero, ASCENSIONS[id]);
  bus.emit('ascChanged', { charId: hero.charId, classId: hero.classId, asc: id, prev, first });
  bus.emit('classChanged', { charId: hero.charId, classId: hero.classId, asc: id });
  return { ok: true, code: 'ok', reason: '', first, sp: first ? ASC_REQ.firstSp : 0 };
}
/** 초월/비전 (처음이면 SP +3 한 번, hero.ascSp) 또는 해금된 다른 길로 전환 (무료) → { ok, first, sp } | 실패 판정 */
export function ascend(hero, id, state) {
  const chk = canAscend(hero, id, state);
  if (!chk.ok) return chk;
  return setAsc(hero, id);
}
/** 전환: id = 해금된 초월/비전 (ascend 와 같다), null = 기본 최상급으로 (무료) */
export function switchAsc(hero, id, state) {
  if (id != null) return ascend(hero, id, state);
  if (!hero) return R('unknown', '알 수 없는 길이다');
  if (hero.asc == null) return R('current', '이미 이 길을 걷고 있다');
  return setAsc(hero, null);
}
