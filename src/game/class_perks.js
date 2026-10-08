// 직업 특성 등록부 (docs/specs/classes_t3.md §3) — 핵심부 (HOOKS). 내용은 class_perks_a/b/c/d.js (PERKS-A..D) 가 채운다.
//
// 항목 키 = CLASSES id · ASCENSIONS id · 'char:<영웅>' (0차·영웅 공통). 항목 = { only?, N?, <훅 함수>… } (§3.2)
//  - 기본: 0·1차 항목은 그 자손(2차)과 그 초월·비전에도 붙는다. only: true 면 id 가 지금 classId 이거나 지금 asc 일 때만.
//  - 훅 이름은 HOOK_NAMES. 훅 자리(player.js · world.js · combat.js)는 목록이 있을 때만 한 줄로 부른다 (특성 없는 영웅은 비용 0).
// 공개 API (§3.3)
//  K                        도구 모음 (skills.js 끝의 bindPerkKit(FXKIT) 가 채운다). 훅 본문 안에서만 읽는다
//  perksOf(hero)            heroKey 로 메모한 고정 객체 { key, ids, active, any, <훅>:[fn…] } (있는 훅만 배열)
//  firePerks / perkMul / perkAny / perkHurt / perkAttack / perkPound   목록 실행·접기 (함수마다 try/catch, 한 번 던지면 그 뒤로 건너뜀)
//  ascActive(id)            비전 액티브 (ACTIVES_A..D, 늦게 합침) — skills.js castSkill 의 대체 경로
//  PERK_STATS               { calls, ms, layerMs, errors } (QA perf_budget 이 읽는다; timing=false 면 시간 재기 생략)
//  도우미: procAtk · procStrike · mark/markOf/unmark · icd · slowEnemy · shieldAdd/shieldAbsorb/shieldOf · perkState
//  PerkLayer: 표식(MARKS_*)·영웅 게이지(drawMeter)를 그리는 월드당 SkillFx 하나 (z 9). 방에 들어올 때(roomEntered) 붙인다
// 버스 구독(ascChanged/classChanged → 메모 비우기, ultimateCast → onUlt, awakenCast → onAwaken, roomEntered/stageEntered →
// onEnter + prewarm + PerkLayer)은 첫 perksOf 때 ensureBus 가 한다 (모듈 최상단에서 bus·game 을 건드리지 않는다).
// import 순환 (§3.5): skills.js → class_perks.js → class_perks_x.js → class_perks.js, combat.js ↔ class_perks.js.
// 그래서 이 파일은 최상단에서 가져온 바인딩을 읽지 않는다 (등록부·액티브·표식 표는 처음 쓸 때 합친다).
import { CLASSES, classChain } from '../data/classes.js';
import { ascOf, heroKey } from '../data/ascensions.js';
import { bus } from '../core/events.js';
import { playerStrike } from './combat.js';
import { PERKS_A, ACTIVES_A, MARKS_A } from './class_perks_a.js';
import { PERKS_B, ACTIVES_B, MARKS_B } from './class_perks_b.js';
import { PERKS_C, ACTIVES_C, MARKS_C } from './class_perks_c.js';
import { PERKS_D, ACTIVES_D, MARKS_D } from './class_perks_d.js';

/** 항목이 가질 수 있는 훅 이름 (§3.2). 그 밖의 키는 only · N 뿐 */
export const HOOK_NAMES = Object.freeze([
  'dmgMul', 'speedMul', 'atkSpdMul', 'healMul', 'dashMul',
  'tick', 'onEnter', 'prewarm', 'onSwing', 'onAttack', 'onHit', 'onKill', 'onHurt', 'onDodge', 'afterHurt', 'onLethal', 'onOverheal',
  'keepCombo', 'onDash', 'onDashEnd', 'onJump', 'onLand', 'onPound', 'onSkill', 'onUlt', 'onAwaken', 'drawMeter',
]);
export const ENTRY_KEYS = Object.freeze([...HOOK_NAMES, 'only', 'N']);
/** 한 화면에 그리는 표식 수 상한 (§3.7) */
export const MARK_CAP = 24;

// ─────────────────────────── 도구 모음 ───────────────────────────
export const K = {};
// var: 순환 import 로 skills.js 가 이 모듈보다 먼저 끝나면 bindPerkKit 이 K 의 TDZ 에서 불린다 → 맡겨 두었다가 모듈 끝에서 채운다
var PENDING_KIT;   // eslint-disable-line no-var
/** skills.js 끝에서 한 번: Object.assign(K, FXKIT) */
export function bindPerkKit(kit) {
  if (!kit || typeof kit !== 'object') return;
  try { Object.assign(K, kit); } catch { PENDING_KIT = kit; }
}

// ─────────────────────────── 통계·오류 ───────────────────────────
export const PERK_STATS = { calls: 0, ms: 0, layerMs: 0, errors: 0, timing: true, last: null };
const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : () => Date.now();
const DEAD = new WeakSet();   // 한 번 던진 훅 (그 뒤로 건너뜀)
const LABEL = new WeakMap();  // 훅 → 'kael_templar.afterHurt' (오류 기록용)
let DEAD_N = 0;
function fail(fn, err) {
  if (DEAD.has(fn)) return;
  DEAD.add(fn); DEAD_N++;
  PERK_STATS.errors++;
  PERK_STATS.last = LABEL.get(fn) ?? fn?.name ?? '?';
  try { console.error(`[perks] ${PERK_STATS.last} 오류 — 이 훅은 이제 건너뛴다`, err); } catch { /* 콘솔 없음 */ }
}
const t0 = () => (PERK_STATS.timing ? now() : 0);
const t1 = (t) => { if (t) PERK_STATS.ms += now() - t; };

// ─────────────────────────── 등록부·메모 ───────────────────────────
let REG = null, ACT = null, MARKS = null, OVERRIDE = null;
/** 합친 등록부 (읽기 전용으로 쓴다; QA·테스트 조회용) */
export function perkRegistry() { return OVERRIDE ?? (REG ??= { ...PERKS_A, ...PERKS_B, ...PERKS_C, ...PERKS_D }); }
function marksTable() { return MARKS ??= { ...MARKS_A, ...MARKS_B, ...MARKS_C, ...MARKS_D }; }
/** 비전 액티브 (asc_<hero>_<word>) → (p, w, lv) => true|false, 없으면 null */
export function ascActive(id) {
  ACT ??= { ...ACTIVES_A, ...ACTIVES_B, ...ACTIVES_C, ...ACTIVES_D };
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(ACT, id) && typeof ACT[id] === 'function' ? ACT[id] : null;
}
/** 시험 전용: 등록부를 바꿔 끼운다 (null = 원래대로). 메모를 비운다 */
export function setPerkRegistry(reg = null, marks = null) {
  OVERRIDE = reg && typeof reg === 'object' ? reg : null;
  MARKS = marks && typeof marks === 'object' ? marks : null;
  MEMO.clear();
}

const MEMO = new Map();
const NONE = Object.freeze({ key: '', ids: Object.freeze([]), active: Object.freeze([]), any: false });
/** 메모 비우기 (ascChanged · classChanged) */
export function clearPerkMemo() { MEMO.clear(); }

/** 계보 id: 'char:<영웅>' → 0차 → 1차 → 2차 → 초월/비전 */
export function perkChain(hero) {
  const cls = classChain(hero?.classId);
  const ids = [];
  const charId = hero?.charId ?? cls[0]?.charId ?? CLASSES[hero?.classId]?.charId;
  if (charId) ids.push('char:' + charId);
  for (const c of cls) ids.push(c.id);
  const A = ascOf(hero);
  if (A) ids.push(A.id);
  return ids;
}

/**
 * 영웅의 특성 목록 (heroKey 로 메모; 반환 객체·배열은 고정). 특성이 하나도 없으면 any: false 이고 훅 배열이 없다.
 * 훅 함수는 항목을 this 로 묶는다 (항목의 N 표를 this.N 으로도 읽을 수 있게).
 */
export function perksOf(hero) {
  if (!hero || typeof hero !== 'object') return NONE;
  ensureBus();
  const key = heroKey(hero);
  let r = MEMO.get(key);
  if (r) return r;
  r = buildPerks(hero, key);
  MEMO.set(key, r);
  if (MEMO.size > 64) MEMO.delete(MEMO.keys().next().value);
  return r;
}
function buildPerks(hero, key) {
  const reg = perkRegistry();
  const ids = perkChain(hero);
  const ascId = ascOf(hero)?.id ?? null;
  const active = [], lists = {};
  for (const id of ids) {
    const E = Object.prototype.hasOwnProperty.call(reg, id) ? reg[id] : null;
    if (!E || typeof E !== 'object') continue;
    if (E.only && id !== hero.classId && id !== ascId) continue;
    let used = false;
    for (const h of HOOK_NAMES) {
      const fn = E[h];
      if (typeof fn !== 'function') continue;
      const b = fn.bind(E);
      LABEL.set(b, `${id}.${h}`);
      (lists[h] ??= []).push(b);
      used = true;
    }
    if (used) active.push(id);
  }
  const out = { key, ids: Object.freeze(ids), active: Object.freeze(active), any: active.length > 0 };
  for (const h in lists) out[h] = Object.freeze(lists[h]);
  return Object.freeze(out);
}

// ─────────────────────────── 실행·접기 ───────────────────────────
// 인자는 고정 개수 (나머지 인자 배열을 만들지 않게). 훅 자리는 목록이 있을 때만 부른다.
/** 모두 부른다 (반환값 무시) */
export function firePerks(list, a, b, c, d, e) {
  if (!list) return;
  const t = t0();
  for (let i = 0; i < list.length; i++) {
    const fn = list[i];
    if (DEAD_N && DEAD.has(fn)) continue;
    PERK_STATS.calls++;
    try { fn(a, b, c, d, e); } catch (err) { fail(fn, err); }
  }
  t1(t);
}
/** 유한한 양수 반환값의 곱 (목록 없음 → 1) */
export function perkMul(list, a, b, c, d) {
  if (!list) return 1;
  const t = t0();
  let m = 1;
  for (let i = 0; i < list.length; i++) {
    const fn = list[i];
    if (DEAD_N && DEAD.has(fn)) continue;
    PERK_STATS.calls++;
    let v;
    try { v = fn(a, b, c, d); } catch (err) { fail(fn, err); continue; }
    if (typeof v === 'number' && v > 0 && v < Infinity) m *= v;
  }
  t1(t);
  return m;
}
/** 하나라도 true 를 돌려주면 true (처음 true 에서 멈춘다 — onLethal 은 한 항목만 살린다) */
export function perkAny(list, a, b, c, d) {
  if (!list) return false;
  const t = t0();
  let hit = false;
  for (let i = 0; i < list.length && !hit; i++) {
    const fn = list[i];
    if (DEAD_N && DEAD.has(fn)) continue;
    PERK_STATS.calls++;
    try { hit = fn(a, b, c, d) === true; } catch (err) { fail(fn, err); }
  }
  t1(t);
  return hit;
}
const HURT = { dmg: 0, armor: false };   // perkHurt 반환 (다시 쓰는 객체: 호출부가 곧바로 읽는다)
/**
 * 피격 전 접기: false → 피해 무효(곧바로 false), 숫자 → 피해를 바꿈, {dmg?, armor?} → 합침 (armor 는 하나라도 true 면 true).
 * 다음 항목은 바뀐 피해를 받는다. → {dmg, armor} | false | null(아무것도 바꾸지 않음)
 */
export function perkHurt(list, p, dmg, atk, w) {
  if (!list) return null;
  const t = t0();
  let d = dmg, armor = false, changed = false;
  for (let i = 0; i < list.length; i++) {
    const fn = list[i];
    if (DEAD_N && DEAD.has(fn)) continue;
    PERK_STATS.calls++;
    let r;
    try { r = fn(p, d, atk, w); } catch (err) { fail(fn, err); continue; }
    if (r === false) { t1(t); return false; }
    if (typeof r === 'number') { if (r >= 0 && r < Infinity) { d = r; changed = true; } }
    else if (r && typeof r === 'object') {
      if (typeof r.dmg === 'number' && r.dmg >= 0 && r.dmg < Infinity) { d = r.dmg; changed = true; }
      if (r.armor) { armor = true; changed = true; }
    }
  }
  t1(t);
  if (!changed) return null;
  HURT.dmg = d; HURT.armor = armor;
  return HURT;
}
/**
 * 공격 접기 (플레이어 자신의 proc 아닌 공격만, combat.hitTarget): mult 곱 · crit 합 · flat 최댓값(처형) · element 마지막 · executed 하나라도.
 * 각 항목은 원래 공격을 본다. 바뀐 것이 없으면 같은 객체, 있으면 새 객체
 */
export function perkAttack(list, p, atk, tgt, w) {
  if (!list) return atk;
  const t = t0();
  let mult = 1, crit = 0, flat = 0, element, hasEl = false, executed = false, changed = false;
  for (let i = 0; i < list.length; i++) {
    const fn = list[i];
    if (DEAD_N && DEAD.has(fn)) continue;
    PERK_STATS.calls++;
    let r;
    try { r = fn(p, atk, tgt, w); } catch (err) { fail(fn, err); continue; }
    if (!r || typeof r !== 'object') continue;
    if (typeof r.mult === 'number' && r.mult > 0 && r.mult < Infinity && r.mult !== 1) { mult *= r.mult; changed = true; }
    if (typeof r.crit === 'number' && r.crit && Number.isFinite(r.crit)) { crit += r.crit; changed = true; }
    if (typeof r.flat === 'number' && r.flat > flat && r.flat < Infinity) { flat = r.flat; changed = true; }
    if (r.element !== undefined) { element = r.element; hasEl = true; changed = true; }
    if (r.executed) { executed = true; changed = true; }
  }
  t1(t);
  if (!changed) return atk;
  const o = { ...atk };
  if (mult !== 1) o.mult = (atk.mult ?? 1) * mult;
  if (crit) o.crit = (atk.crit ?? 0) + crit;
  if (flat > 0) o.flat = Math.max(atk.flat ?? 0, flat);
  if (hasEl) o.element = element;
  if (executed) o.executed = true;
  return o;
}
/**
 * 급강하 충격파 접기 (player.groundPound): 옛 __onPound 결과 pk 위에 각 항목의 null 아닌 값을 덮는다 → { ...pk, ...결과 } 또는 pk.
 * 다음 항목은 바뀐 반경을 받는다
 */
export function perkPound(list, p, w, r, fall, pk) {
  if (!list) return pk;
  const t = t0();
  let out = pk, rr = r, copied = false;
  for (let i = 0; i < list.length; i++) {
    const fn = list[i];
    if (DEAD_N && DEAD.has(fn)) continue;
    PERK_STATS.calls++;
    let v;
    try { v = fn(p, w, rr, fall, out); } catch (err) { fail(fn, err); continue; }
    if (!v || typeof v !== 'object') continue;
    if (!copied) { out = { ...(out && typeof out === 'object' ? out : {}) }; copied = true; }
    for (const k in v) if (v[k] != null) out[k] = v[k];
    if (out.r > 0) rr = out.r;
  }
  t1(t);
  return out;
}

// ─────────────────────────── 내용 모듈용 도우미 ───────────────────────────
let PK_N = 0;
/**
 * 특성이 만드는 부가 공격 (proc: onAttack·onHit 훅을 다시 부르지 않는다; 경직 0 — 해방기만 hitstop ≤ 0.08).
 * o: { mv, type, element, kb, hitstop, shake, hitId, tags, crit, stun, dir, launch, rehit }
 */
export function procAtk(p, o = {}) {
  const a = {
    owner: p, team: 'player', stats: p.stats, mv: o.mv ?? 1, type: o.type ?? 'phys', element: o.element ?? null, dir: o.dir ?? p.facing,
    kb: o.kb ?? [80, -60], hitstop: Math.min(0.08, Math.max(0, o.hitstop ?? 0)), shake: o.shake ?? 0, hitId: o.hitId ?? 'pk' + (++PK_N),
    tags: o.tags ?? ['melee'], proc: true, crit: o.crit ?? 0, mult: 1, breakWalls: false, stun: o.stun,
  };
  if (o.launch) a.launch = true;
  if (o.rehit) a.rehit = o.rehit;
  return a;
}
/** playerStrike(w, rect, procAtk(p, o)) → 맞힌 수 */
export function procStrike(w, p, rect, o) { return w && rect ? playerStrike(w, rect, procAtk(p, o)) : 0; }

// 표식: e._ck[key] = { n, until, dur } (월드 시간). 표식이 붙은 적은 MARKED 에 들어가 PerkLayer 가 그린다
const MARKED = new Set();
const CUR = { w: null };   // 지금 월드 (roomEntered 뒤 / 마지막 perkEnter)
const timeOf = (o) => o?.world?.time ?? CUR.w?.time ?? 0;
/** 표식 add 중첩 (최대 max), t 초 동안 (다시 붙이면 시간 갱신). 만료된 표식은 0 부터. → 지금 중첩 수 */
export function mark(e, key, t, add = 1, max = 99) {
  if (!e || e.dead || !key) return 0;
  const tn = timeOf(e);
  const ck = (e._ck ??= {});
  const m = (ck[key] ??= { n: 0, until: 0, dur: t });
  const live = m.n > 0 && m.until > tn;
  m.n = Math.max(0, Math.min(max, (live ? m.n : 0) + add));
  m.until = tn + t; m.dur = t > 0 ? t : 1;
  if (m.n > 0) {
    MARKED.add(e);
    const w = e.world;
    if (w && w._perkLayerTok !== roomTok(w)) attachLayer(w);
  }
  return m.n;
}
/** 지금 중첩 수 (만료·없음 → 0) */
export function markOf(e, key) {
  const m = e?._ck?.[key];
  return m && m.n > 0 && m.until > timeOf(e) ? m.n : 0;
}
/** 중첩 n 개 지우기 (기본 전부) → 남은 수 */
export function unmark(e, key, n = Infinity) {
  const m = e?._ck?.[key];
  if (!m) return 0;
  m.n = Math.max(0, (m.until > timeOf(e) ? m.n : 0) - n);
  if (!m.n) m.until = 0;
  return m.n;
}
/** 내부 재사용 대기 (월드 시간): 준비됐으면 true 를 돌려주고 sec 초 대기를 시작한다 */
export function icd(obj, key, sec, w) {
  if (!obj || typeof obj !== 'object') return false;
  const tn = (w ?? obj.world ?? CUR.w)?.time ?? 0;
  const c = (obj._icd ??= {});
  const next = c[key];
  if (next !== undefined && tn < next) return false;
  c[key] = tn + sec;
  return true;
}
/**
 * 적 감속 (갱신만 하는 update 감싸기 — awaken_directors.js slowFoes 와 같은 방식). mul 0.1..1, t 초.
 * 이미 감속 중이면 시간을 늘리고 더 느린 배율을 쓴다. 각성 감속(__awSlow) 중인 적은 건드리지 않는다. 만료·사망 때 원래 update 로 되돌린다
 */
export function slowEnemy(e, mul, t, w) {
  if (!e || e.dead || !(t > 0)) return false;
  const tn = (w ?? e.world ?? CUR.w)?.time ?? 0;
  const k = Math.max(0.1, Math.min(1, Number.isFinite(mul) ? mul : 1));
  const s = e.__pkSlow;
  if (s) { s.until = Math.max(s.until, tn + t); if (k < s.k) s.k = k; return true; }
  if (e.__awSlow || typeof e.update !== 'function') return false;
  const own = Object.prototype.hasOwnProperty.call(e, 'update') ? e.update : null;
  const base = e.update;
  const rec = { k, until: tn + t, fn: null };
  rec.fn = function (dt, world) {
    if (this.dead || !((world?.time ?? 0) < rec.until)) { unslow(this, rec, own); return base.call(this, dt, world); }
    return base.call(this, dt * rec.k, world);
  };
  e.update = rec.fn; e.__pkSlow = rec;
  return true;
}
function unslow(e, rec, own) {
  if (e.update === rec.fn) { if (own) e.update = own; else delete e.update; }
  if (e.__pkSlow === rec) delete e.__pkSlow;
}
/** 결계(피해를 먼저 막는 보호막) p._shield: 더하기 (cap 까지) → 지금 양 */
export function shieldAdd(p, amt, cap = Infinity) {
  if (!p) return 0;
  const cur = p._shield ?? 0;
  if (amt > 0) { p._shield = Math.max(0, Math.min(cap > 0 ? cap : Infinity, cur + amt)); p._shieldAt = timeOf(p); }
  return p._shield ?? 0;
}
/** 결계가 먼저 받는다 → 남은 피해 */
export function shieldAbsorb(p, dmg) {
  const s = p?._shield ?? 0;
  if (!(s > 0) || !(dmg > 0)) return dmg;
  const a = Math.min(s, dmg);
  p._shield = s - a;
  return dmg - a;
}
export function shieldOf(p) { return p?._shield ?? 0; }
/** 영웅별 특성 상태 (Player 는 스테이지마다 새로 만들어진다) */
export function perkState(p) { return (p._pk ??= {}); }

// ─────────────────────────── 버스 · 방 입장 · PerkLayer ───────────────────────────
let BUS = false;
function ensureBus() {
  if (BUS) return;
  BUS = true;
  try {
    bus.on('ascChanged', clearPerkMemo);
    bus.on('classChanged', clearPerkMemo);
    bus.on('ultimateCast', (d) => fireCurrent('onUlt', d));
    bus.on('awakenCast', (d) => fireCurrent('onAwaken', d));
    bus.on('roomEntered', enterSoon);
    bus.on('stageEntered', enterSoon);
  } catch (err) { BUS = false; console.error('[perks] bus', err); }
}
/** 지금 월드: window.__game.world (main.js) → 마지막 perkEnter 월드 */
function curWorld() {
  const g = typeof window !== 'undefined' ? window.__game : globalThis.__game;
  return g?.world ?? CUR.w ?? null;
}
function fireCurrent(h, d) {
  const w = curWorld(), p = w?.player;
  if (!p || p.dead || (d?.charId && p.hero?.charId !== d.charId)) return;
  const L = p.perks?.[h];
  if (L) firePerks(L, p, w);
}
// 첫 방은 World 생성 도중(game.world 지정 전)에 roomEntered 가 오므로 한 박자(마이크로태스크) 늦춰 지금 월드를 찾는다
let ENTER_Q = false;
function enterSoon() {
  if (ENTER_Q) return;
  ENTER_Q = true;
  Promise.resolve().then(() => { ENTER_Q = false; try { perkEnter(curWorld()); } catch (err) { console.error('[perks] enter', err); } });
}
const ENTERED = new WeakSet();   // 방 한 번 불러오기 = world.map 하나 (loadRoom 이 새로 만든다; entities 배열은 죽은 개체를 거를 때마다 바뀐다)
/** 방 불러오기 표 (같은 방에서는 같다): world.map (없으면 entities 배열 — 시험용 가짜 월드) */
const roomTok = (w) => w.map ?? w.entities;
/**
 * 방 입장 처리 (roomEntered 가 부른다; 시험·도구가 직접 불러도 된다): 표식 비우기 · prewarm(월드·특성마다 한 번) · onEnter · PerkLayer.
 * 같은 방 불러오기에 두 번 불러도 한 번만 한다. 특성 없는 영웅은 아무것도 붙이지 않는다
 */
export function perkEnter(w) {
  if (!w?.player || !Array.isArray(w.entities)) return false;
  CUR.w = w;
  const tok = roomTok(w);
  if (!tok || typeof tok !== 'object' || ENTERED.has(tok)) return false;
  ENTERED.add(tok);
  MARKED.clear();
  const p = w.player, P = p.perks;
  if (!P?.any) return false;
  if (P.prewarm && w._perkWarm !== P.key) { w._perkWarm = P.key; firePerks(P.prewarm, w, p); }
  if (P.onEnter) firePerks(P.onEnter, p, w);
  attachLayer(w);
  return true;
}
/** PerkLayer 붙이기 (방 불러오기마다 하나). K.SkillFx 가 없으면(도구 모음이 아직 없음) 붙이지 않는다 → 레이어 | null */
export function attachLayer(w) {
  if (!w?.add || typeof K.SkillFx !== 'function' || w._perkLayerTok === roomTok(w)) return null;
  w._perkLayerTok = roomTok(w);
  const L = new K.SkillFx({ life: Infinity, z: 9, follow: layerFollow, draw: drawPerkLayer });
  L.perkLayer = true;
  w.add(L);
  return L;
}
// 화면 전체를 덮는 상자 (world.render 의 화면 밖 거르기를 지나게)
function layerFollow(e, w) {
  const c = w.camera;
  if (!c) return;
  e.x = c.x; e.y = c.y; e.w = c.vw || 1; e.h = c.vh || 1;
}
/**
 * PerkLayer 그리기: 표식 붙은 적(MARKED)을 돌며 죽은·만료된 것은 빼고, MARKS_*[key](ctx, e, n, k, t) 를 최대 MARK_CAP 개
 * (k = 남은 시간 비율), 그다음 지금 영웅의 drawMeter(ctx, p, w). 새 그라디언트·캔버스·파티클·난수 없음 (그리는 쪽 규칙 §3.6)
 */
export function drawPerkLayer(ctx, e, w) {
  const t = PERK_STATS.timing ? now() : 0;
  const tn = w?.time ?? 0;
  if (MARKED.size) {
    const M = marksTable();
    let n = 0;
    for (const en of MARKED) {
      if (en.dead || !en._ck || (en.world && en.world !== w)) { MARKED.delete(en); continue; }
      let live = false;
      for (const key in en._ck) {
        const m = en._ck[key];
        if (!(m.n > 0) || !(m.until > tn)) continue;
        live = true;
        const fn = M[key];
        if (!fn || n >= MARK_CAP || en.hidden) continue;
        n++;
        try { fn(ctx, en, m.n, (m.until - tn) / m.dur, tn); } catch (err) { markFail(key, err); }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      if (!live) MARKED.delete(en);
    }
  }
  const p = w?.player, D = p?.perks?.drawMeter;
  if (D && !p.dead) { firePerks(D, ctx, p, w); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  if (t) PERK_STATS.layerMs += now() - t;
}
const MARK_ERR = new Set();
function markFail(key, err) {
  if (MARK_ERR.has(key)) return;
  MARK_ERR.add(key); PERK_STATS.errors++; PERK_STATS.last = 'mark:' + key;
  // 던지는 표식은 이후 그리지 않는다 (표 항목을 빈 함수로)
  const M = marksTable();
  M[key] = () => {};
  try { console.error(`[perks] 표식 ${key} 오류`, err); } catch { /* 콘솔 없음 */ }
}
/** QA·시험용: 표식 붙은 적 수 */
export function markedCount() { return MARKED.size; }

// 순환 import 로 늦게 온 도구 모음 채우기 (bindPerkKit 참고)
if (PENDING_KIT) { Object.assign(K, PENDING_KIT); PENDING_KIT = undefined; }
