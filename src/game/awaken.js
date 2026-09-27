// 각성기(초필살기) 규칙 · 필살 버튼 길게 누르기 · 시전 · 보스 피해 상한 · 각성 감독 실행 — owner: AWAKEN-CORE
// feel.md §6.1–6.3, §7; MASTER_PLAN §1.4 (V 키·길게 누르기), §1.7 #1·#9·#21, §1.13, §1.14, R16
//
// 공개 API
//  handleUltInput(p, world) → true 면 입력을 소비함 (player.handleAttackInput 첫 줄). 필살 버튼 판정 전부:
//     각성 불가(0차 전직·게이지 부족): 누르는 즉시 일반 필살기 (지연 없음)
//     각성 가능(두 게이지 가득): 0.20초 미만 톡 → 뗄 때 일반 필살기 / 0.20–0.45초에 떼면 취소 / 0.45초 누르면 각성
//     'awaken' 액션(V): 각성 가능하면 즉시 각성, 아니면 필살기 누름과 같다
//     판정은 input.down(수준) + pressTime/releasedAt(시각) 으로 한다 → 히트스톱에 끼어도 안전 (R16).
//     직전 플레이어 갱신에서 이 함수가 불리지 않았거나(피격·연출·입력 잠금·사망) 장면이 쌓이면(input.flush) 길게 누르기를 취소한다.
//  canAwaken(p, world) → bool          castAwakening(p, world, {force}) → bool (게이지 소모·무적·적 정지·컷인 → 감독)
//  registerDirector(charId, fn)         영웅별 각성 감독 등록 (AWAKEN-DIR-A/B 가 import 시 등록해도 되고, AWAKEN_DIRECTOR(_B) 표로 줘도 된다)
//  bossCapFn(world)                     각성 한 번의 보스 피해 상한 함수 (attack.capFn; impact.modDamage 가 적용)
//  prepareAwakening(p, world)           컷인 그림 미리 받기·디코드 (handleUltInput 이 스테이지마다 처음 한 번 부른다)
//  AWAKEN_DEBUG                         시험용 기록 {casts, last, holds, fallback}
//
// 상태
//  world.awakenState = {ready, holdK}   (터치 필살 버튼 고리·HUD 가 읽는다)   p.awakenHoldK 0..1   p.superArmor (길게 누르는 동안 1)
//  world.run.awakenN                    이번 스테이지 각성 횟수 (2번째부터 짧은 컷인)
//
// 감독 계약 (AWAKEN_DIRECTOR[charId] = (p, world, v) => 엔티티 | null):
//  감독은 컷인이 끝난 뒤(t = 0) 시작한다. world.cutscene·freezeEnemies·hudHidden 은 이 모듈의 '진행자' 엔티티가 매 프레임 유지하고,
//  감독이 돌려준 엔티티가 dead 가 되거나 v.finish() 를 부르면 (또는 v.dur 초가 지나면, 최대 AWAKEN_RULES.maxDirector 초) 모두 되돌린다.
//  v = { charId, classId, tier, data(AWAKEN[charId]), t2(T2[classId] | null), color, accent, dark, scale,
//        mv(w) → 가중치 w 의 실제 MV (feel §6.1 정규화: 합 = 필살기 총 MV × 2.2, 2차 전직 × 1.15)
//        atk(w, o) → 공격 객체 (tags ['awaken'], capFn = 보스 30% 상한, breakWalls false)
//        hit(rect, w, o) → playerStrike 적중 수     final(rect, w, o) → 마무리 일격 (final: true → class A, 띄우기)
//        view(pad) → 화면 사각형 (월드 좌표)      foes(rect?) → 화면 안 적 목록      cap → capFn
//        heal(frac) · finish() · dur(초, 선택) · started(world.rt) }
//  FXKIT(skills.js)이 비어 있으면(FX-ULTS 전) 감독은 '준비되지 않은' 것으로 보고 이 파일의 대체 연출을 쓴다.
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { assets } from '../core/assets.js';
import { clamp, rand, TAU, ease, rgba, overlap } from '../core/math.js';
import { CLASSES } from '../data/classes.js';
import { AWAKEN, AWAKEN_RULES, T2 } from '../data/awaken.js';
import { castUltimate, FXKIT, SkillFx } from './skills.js';
import { playerStrike } from './combat.js';
import { AWAKEN_DIRECTOR } from './awaken_directors.js';
import { AWAKEN_DIRECTOR_B } from './awaken_directors_b.js';
import { ULTFX } from '../render/ultfx.js';
import { drawHero } from '../render/hero.js';
import * as CUTIN from '../scenes/awaken_cutin.js';

const R = AWAKEN_RULES;
const STEP = 1 / 60;
const MISS_GAP = STEP * 1.5;       // 직전 갱신과의 p.t 간격이 이보다 크면 한 프레임 이상 건너뛴 것 (피격·연출 등으로 불리지 않음)
const BUF = 0.15;                  // 누름 버퍼 (초) + 히트스톱 보정
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const AWAKEN_DEBUG = { casts: 0, last: null, holds: [], fallback: 0, cancels: 0, taps: 0 };

// ───────────────────────── 감독 등록부 ─────────────────────────
// 순환 import 대비: 감독 모듈이 이 모듈보다 먼저 평가되며 registerDirector 를 불러도 되도록 함수 선언(호이스팅)에 붙여 둔다.
function dirStore() { return dirStore.m || (dirStore.m = Object.create(null)); }
export function registerDirector(charId, fn) {
  if (!charId) return;
  if (typeof fn === 'function') dirStore()[charId] = fn;
  else if (fn == null) delete dirStore()[charId];   // null → 등록 해제 (표 AWAKEN_DIRECTOR(_B) 또는 대체 연출로 돌아간다)
}
/** 감독이 쓰는 FXKIT 이 채워졌는가 (FX-ULTS). 비어 있으면 감독은 준비되지 않은 것으로 본다 */
function kitReady() { try { return !!FXKIT && Object.keys(FXKIT).length > 0; } catch { return false; } }
function directorOf(charId) {
  if (!kitReady()) return null;
  return dirStore()[charId] ?? AWAKEN_DIRECTOR?.[charId] ?? AWAKEN_DIRECTOR_B?.[charId] ?? null;
}

// ───────────────────────── 규칙 ─────────────────────────
const tierOf = (p) => CLASSES[p?.hero?.classId]?.tier ?? 0;

/** 각성을 막는 상황 (feel §6.1 blocked when, MASTER_PLAN §1.13) → 이유 문자열 | '' */
function blockedWhy(p, world) {
  if (!p || !world) return 'none';
  if (p.dead) return 'dead';
  if (world.cutscene) return 'cutscene';
  if (world.cleared) return 'cleared';
  if (world.transitioning) return 'transition';
  if (world.inputLock) return 'inputLock';
  if (p.hurtT > 0) return 'hitstun';
  if (world.mode === 'town') return 'town';
  const g = world.game, top = g?.top;
  if (g?.fade?.dir > 0) return 'fade';   // 장면 전환 페이드 중
  if (top && top.world !== world) return 'scene';   // 월드를 가진 장면(스테이지·허브·아케이드)이 맨 위가 아님 (보스 등장·대화·컷인 등)
  return '';
}
/** 두 게이지가 가득 찼고(1차 전직 이상) 지금 쓸 수 있는가 */
export function canAwaken(p, world) {
  if (!p || !world || !AWAKEN[p.hero?.charId]) return false;
  if (tierOf(p) < R.minTier) return false;
  const run = world.run;
  if (!((run?.sp ?? 0) >= R.spNeed - 1e-6) || !((run?.aw ?? 0) >= R.gaugeMax - 1e-6)) return false;
  return !blockedWhy(p, world);
}

// ───────────────────────── 필살 버튼 ─────────────────────────
/**
 * 'ult' 와 'awaken' 이 지금 기기(input.mode)에서 같은 입력에 묶였는가 (data/controls.js TOUCH_BINDINGS: awaken ['ult'],
 * 또는 키·패드를 같은 버튼으로 다시 배치한 경우). 배치 정보가 없으면 예전처럼 같은 버튼으로 본다.
 */
function sharedUltButton() {
  const b = input.bindings;
  if (!b || typeof b !== 'object') return true;
  const share = (m) => { const u = m?.ult, a = m?.awaken; return Array.isArray(u) && Array.isArray(a) && a.some((x) => u.includes(x)); };
  const dev = input.mode === 'kb' ? 'key' : input.mode;
  if (dev && b[dev]) return share(b[dev]);
  return share(b.key) || share(b.pad) || share(b.touch);
}
const holdOf = (p) => (p._awHold ??= { on: false, t0: 0, lastT: 0, flushN: 0, beat2: false, ring: null, veil: null, obsS: 0, obsW: 0 });
const bufWin = (world) => BUF + Math.min(0.3, world.frozenRecent ?? 0);
const flushN = () => input.flushN ?? 0;

/**
 * HUD·터치 버튼이 읽는 world.awakenState.ready 를 '지금 게이지 상태' 로 계산되는 속성으로 바꾼다.
 * (handleUltInput 은 피격·연출·사망 중에는 불리지 않으므로 값을 적어 두면 낡는다: 필살기를 쓴 뒤에도 '각성' 이 남는 등)
 * 표시용이라 경직(hurtT)·장면 순서처럼 깜빡이는 조건은 넣지 않는다 — 실제 시전 판정은 canAwaken.
 */
const LIVE = new WeakSet();
function awState(world) {
  const st = (world.awakenState ??= { ready: false, holdK: 0 });
  if (!LIVE.has(st)) {
    LIVE.add(st);
    try {
      Object.defineProperty(st, 'ready', { get: () => displayReady(world), set() { /* 계산 값 */ }, enumerable: true, configurable: true });
    } catch { /* 고정된 객체 → 적어 두는 방식 그대로 */ }
  }
  return st;
}
function displayReady(world) {
  const p = world.player;
  if (!p || p.dead || world.cutscene || world.cleared || world.mode === 'town') return false;
  if (!AWAKEN[p.hero?.charId] || tierOf(p) < R.minTier) return false;
  const run = world.run;
  return (run?.sp ?? 0) >= R.spNeed - 1e-6 && (run?.aw ?? 0) >= R.gaugeMax - 1e-6;
}

/** 필살기·각성기 입력. true = 입력 소비 (나머지 공격 입력을 건너뛴다) */
export function handleUltInput(p, world) {
  prepareAwakening(p, world);
  const st = awState(world);
  const H = holdOf(p);
  // 길게 누르는 중 한 프레임 이상 건너뛰었거나(피격 경직·연출·입력 잠금·사망) 장면이 쌓였으면 취소 (R16)
  if (H.on && (p.t - H.lastT > MISS_GAP || H.flushN !== flushN())) endHold(p, world, 'interrupt');
  const ready = canAwaken(p, world);
  if (!LIVE.has(st)) st.ready = ready;
  const run = world.run, win = bufWin(world);

  // ── 'awaken' 액션 (V · 지정한 패드 버튼) ──
  if (input.buffered('awaken', win)) {
    input.consume('awaken');
    // 한 버튼에 둘 다 묶인 경우(같은 스텝에 함께 눌림 + 지금 기기의 배치가 실제로 겹침 — 터치 필살 버튼은 기본이 둘 다):
    // 필살 버튼 규칙으로 (톡 = 필살기, 길게 = 각성). 서로 다른 두 키(F·V)를 한 스텝에 함께 누른 것은 각성 키가 이긴다.
    // 누른 채인지(down)는 보지 않는다 — 히트스톱 동안 눌렀다 뗀 톡이 즉시 각성으로 바뀌지 않게 (R16)
    const sameButton = input.pressTime?.ult === input.pressTime?.awaken && input.buffered('ult', win) && sharedUltButton();
    if (!sameButton) {
      if (H.on) endHold(p, world, 'silent');
      if (ready) return castAwakening(p, world) || true;
      if ((run.sp ?? 0) >= 100) { castUltimate(p, world); return true; }
      return false;
    }
  }

  if (!H.on) {
    st.holdK = 0; p.awakenHoldK = 0;
    if (!input.buffered('ult', win)) return false;
    input.consume('ult');
    if (!ready) {
      // 각성 불가: 누르는 즉시 필살기 (지연 없음). SP 가 모자라면 아무 일도 없다 (늦게 발동하지 않게 누름은 소비)
      if ((run.sp ?? 0) >= 100) { castUltimate(p, world); return true; }
      return false;
    }
    startHold(p, world, H);
    if (!input.down('ult')) return resolveRelease(p, world, H);   // 히트스톱·피격 동안 눌렀다 뗀 톡
    return true;
  }

  // ── 길게 누르는 중 ──
  H.lastT = p.t;
  if (!ready) { endHold(p, world, 'cancel'); return true; }
  // 누른 채 방을 옮겼다 (페이드 동안 장면이 멈춰 있어 놓친 프레임은 없다): 지워진 고리·어둠막을 새 방에 다시 붙인다
  if ((H.ring && !world.entities.includes(H.ring)) || (H.veil && !world.overlays?.includes(H.veil))) attachHoldFx(p, world, H);
  if (input.down('ult')) {
    const held = heldFor(H);
    const k = clamp(held / R.holdFull, 0, 1);
    st.holdK = k; p.awakenHoldK = k;
    if (!H.beat2 && held >= 0.22) { H.beat2 = true; sfx('heartbeat', { pitch: 1.12 }); }
    if (held >= R.holdFull) { endHold(p, world, 'silent'); castAwakening(p, world); }
    return true;
  }
  return resolveRelease(p, world, H);
}

/**
 * 스텝 시각 → 실제 시각 배율 (1..3). input.time 은 히트스톱 중에도 스텝마다 흐르므로 보통 1 이다.
 * 기기가 느려 게임 루프가 스텝을 버리면(한 프레임 최대 5스텝) 게임 시간이 실제보다 느리게 흐른다 →
 * 길게 누르기가 끝나기까지 시작 뒤 지난 실제 시간 / 스텝 시간 비율만큼 늘려 센다 (실제로 0.45초 누르면 각성).
 */
function stepScale(H) {
  const dS = input.time - H.obsS, dW = (nowMs() - H.obsW) / 1000;
  if (!(dS >= 0.05) || !(dW > 0)) return 1;
  return clamp(dW / dS, 1, 3);
}
/** 누르고 있던 시간 (초, 실제 시간 기준 어림) */
function heldFor(H) { return Math.max(0, input.time - H.t0) * stepScale(H); }
/**
 * 누름·뗌은 각각 최대 한 프레임 늦게 보인다(키·터치 이벤트는 다음 rAF 의 스텝에서야 읽힌다) →
 * 뗀 순간의 판정은 프레임 간격(game.fps 기준)의 절반만큼 양쪽 문턱을 너그럽게 한다.
 * 60fps 에서는 약 8ms 로 차이가 없고, 아주 느린 기기(5fps 등)에서 0.6초 누른 것이 0.42초로 재져 취소되는 일을 막는다.
 * 히트스톱과는 무관하다 (스텝은 히트스톱 중에도 흐르고 fps 도 그대로).
 */
function frameSlack(world) {
  const fps = Number(world?.game?.fps);
  return fps > 0 && Number.isFinite(fps) ? clamp(1 / fps, 0, 0.25) * 0.5 : 0;
}

/** 손을 뗐다: 톡(< 0.20초) → 일반 필살기, 0.20–0.45초 → 취소, 그 이상(얼어 있는 사이 완성) → 각성 */
function resolveRelease(p, world, H) {
  const rel = input.releasedAt ? input.releasedAt('ult') : (input.releaseTime?.ult ?? input.time);
  const k = stepScale(H), slack = frameSlack(world);
  const dur = Math.max(0, (rel >= H.t0 ? rel : input.time) - H.t0) * k;   // 스텝 시각 기준 (히트스톱에도 정확)
  AWAKEN_DEBUG.holds.push({ dur: +dur.toFixed(3), k: +k.toFixed(2), slack: +slack.toFixed(3), t: +input.time.toFixed(3) });
  if (AWAKEN_DEBUG.holds.length > 16) AWAKEN_DEBUG.holds.shift();
  if (dur + slack >= R.holdFull) {
    endHold(p, world, 'silent');
    castAwakening(p, world);
  } else if (dur - slack < R.tapMax) {
    endHold(p, world, 'silent');
    AWAKEN_DEBUG.taps++;
    castUltimate(p, world);
  } else {
    endHold(p, world, 'cancel');
  }
  return true;
}

function startHold(p, world, H) {
  H.on = true; H.t0 = input.pressTime?.ult ?? input.time; H.lastT = p.t; H.flushN = flushN(); H.beat2 = false;
  if (!(H.t0 <= input.time) || input.time - H.t0 > 2) H.t0 = input.time;   // 기록이 이상하면 지금부터
  H.obsS = input.time; H.obsW = nowMs();
  p.superArmor = 1;   // 길게 누르는 동안: 피해는 받되 경직·넉백 없음 (player.takeHit, MASTER_PLAN §1.7 #21)
  sfx('heartbeat');
  sfx('awaken_hold');
  attachHoldFx(p, world, H);
}

/** 길게 누르기 고리(월드)·가장자리 어둠막(오버레이). 누르는 채 방을 옮기면 loadRoom 이 둘 다 지우므로 다시 붙인다 */
function attachHoldFx(p, world, H) {
  const a = AWAKEN[p.hero.charId];
  if (H.ring) H.ring.dead = true;
  if (H.veil) H.veil.dead = true;
  H.ring = world.add(new SkillFx({
    x: p.cx - 70, y: p.cy - 70, w: 140, h: 140, life: 30, z: 11,
    follow(e) { e.x = p.cx - 70; e.y = p.cy - 70; },
    tick(e, w) {
      // 진행자가 사라진 채 남지 않게: 길게 누르기가 끝났거나 갱신이 끊겼으면 스스로 정리
      if (!H.on || e !== H.ring) { e.dead = true; return; }
      if (p.t - H.lastT > 0.25 || p.dead) { endHold(p, w, 'interrupt'); e.dead = true; }
    },
    draw(ctx) { drawHoldRing(ctx, p, a); },
  }));
  H.veil = world.addOverlay?.({
    draw(ctx, vw, vh) { const k = p.awakenHoldK || 0; if (k > 0.02) drawEdgeDark(ctx, vw, vh, R.edgeDark * ease.outCubic(k)); },
    update() { if (!H.on) this.dead = true; },
  }) ?? null;
}

function endHold(p, world, why) {
  const H = holdOf(p);
  if (!H.on) return;
  H.on = false;
  p.superArmor = 0;
  p.awakenHoldK = 0;
  const st = awState(world); st.holdK = 0;
  if (H.ring) { H.ring.dead = true; H.ring = null; }
  if (H.veil) { H.veil.dead = true; H.veil = null; }
  audio.stopSfx?.('awaken_hold');
  if (why === 'cancel') { AWAKEN_DEBUG.cancels++; sfx('menu_cancel', { vol: 0.8 }); }
}

// ───────────────────────── 시전 ─────────────────────────
/** 각성 시전: 두 게이지 소모 → 무적·적 정지·HUD 숨김 → 컷인 → (컷인이 끝나면) 감독 */
export function castAwakening(p, world, { force = false } = {}) {
  if (!force && !canAwaken(p, world)) return false;
  const charId = p.hero?.charId, a = AWAKEN[charId];
  if (!a || !world?.game) return false;
  const classId = p.hero.classId, tier = tierOf(p);
  endHold(p, world, 'silent');
  const run = world.run;
  run.sp = 0; run.aw = 0;
  run.awakenN = (run.awakenN ?? 0) + 1;
  p.endMove?.();
  p.mount?.beforeCast?.(world, p, 'ult');   // 탈것에서 내린 뒤 시전 (MASTER_PLAN §1.14)
  p.vx = 0; p.dashT = 0; p.charging = 0; p.holdT = 0;
  castPose(p, world, 1.6);
  world.cutscene = true; world.freezeEnemies = true; world.hudHidden = true;
  awState(world).ready = false; awState(world).holdK = 0;
  const short = (world.game.settings?.cutinMode === 'short') || run.awakenN > 1;
  const cast = { id: ++CAST_SEQ, world, p, charId, classId, tier, short, t: world.rt ?? 0, started: false, ended: false };
  SESSION = cast;
  hookBus();
  AWAKEN_DEBUG.casts++; AWAKEN_DEBUG.last = { charId, classId, tier, short, director: null, done: false };
  bus.emit('awakenCast', { charId, tier, classId });
  try { input.rumble?.(0.35, 0.5, 160); } catch { /* 진동 없음 */ }
  try { audio.duck?.(0.6, (short ? R.cutin.short : R.cutin.full) + 0.15); } catch { /* 음악 없음 */ }   // 컷인 동안 음악을 낮춘다 (MASTER_PLAN §1.9)
  let pushed = false;
  try {
    if (world.game.registry?.awakenCutin) {
      world.game.push('awakenCutin', { world, p, charId, classId, tier, short, onDone: (aborted) => startAwakening(cast, !!aborted) });
      pushed = true;
    }
  } catch (e) { console.error('[awaken] 컷인', e); }
  if (!pushed) startAwakening(cast, false);
  return true;
}

let CAST_SEQ = 0;
let SESSION = null;
let BUS_HOOKED = false;
/**
 * 방이 바뀌면 진행자 엔티티가 사라진다 → 연출 상태가 남지 않게 되돌린다.
 * 연출 도중 스테이지를 떠났으면(보스 격파 → 결과 화면 등) 진행자가 다시 돌지 않으므로, 다른 월드가 방을 열 때 옛 세션을 닫아
 * 옛 월드를 붙잡고 있지 않게 한다 (SESSION 이 유일한 강한 참조).
 */
function hookBus() {
  if (BUS_HOOKED) return;
  BUS_HOOKED = true;
  bus.on('roomEntered', () => {
    const s = SESSION;
    if (!s || s.ended) return;
    if (s.world?.game?.world !== s.world) { finishSession(s, 'left'); return; }
    if (s.started && s.mgr && !s.world.entities.includes(s.mgr)) finishSession(s, 'room');
  });
}

/** 컷인이 끝난 뒤 (aborted = 장면이 통째로 닫힘) */
function startAwakening(cast, aborted) {
  if (cast.started || cast.ended) return;
  cast.started = true;
  const { world, p } = cast;
  if (aborted || world.game?.world !== world || p.dead) { finishSession(cast, 'aborted'); return; }
  const v = makeContext(cast);
  cast.v = v;
  // 진행자: 감독이 끝날 때까지 연출 상태를 붙잡고, 끝나면 되돌린다
  cast.mgr = world.add(new SkillFx({
    life: R.maxDirector + 1, z: -3, w: 1, h: 1,
    follow(e) { e.x = p.cx; e.y = p.cy; },
    tick(e, w) {
      w.cutscene = true; w.freezeEnemies = true; w.hudHidden = true;
      w.run.sp = 0; w.run.aw = 0;   // 각성 타격으로는 게이지가 다시 차지 않는다
      w.letterbox = Math.min(40, (w.letterbox || 0) + 4);
      const lt = e.lt;
      const ent = cast.ent;
      const done = v.finished || (ent && (ent.dead || !w.entities.includes(ent))) || (!ent && lt >= (v.dur ?? 2.6)) || lt >= R.maxDirector;
      if (done) { finishSession(cast, 'done'); e.dead = true; }
    },
    end() { finishSession(cast, 'timeout'); },
  }));
  let fn = directorOf(cast.charId), ent = null;
  AWAKEN_DEBUG.last.director = fn ? 'hero' : 'fallback';
  if (fn) {
    try { ent = fn(p, world, v) ?? null; } catch (e) { console.error('[awaken] 감독 오류 → 대체 연출', e); fn = null; ent = null; }
  }
  if (!fn) {
    AWAKEN_DEBUG.fallback++; AWAKEN_DEBUG.last.director = 'fallback';
    try { ent = fallbackDirector(p, world, v); } catch (e) { console.error('[awaken] 대체 연출', e); ent = null; }   // 진행자가 v.dur 뒤에 정리한다
  }
  cast.ent = ent && typeof ent === 'object' && 'dead' in ent ? ent : null;
}

/** 연출 상태 되돌리기 (한 번만) */
function finishSession(cast, why) {
  if (cast.ended) return;
  cast.ended = true;
  const { world, p, v } = cast;
  if (cast.mgr) cast.mgr.dead = true;
  if (SESSION === cast) SESSION = null;
  if (world) {
    world.cutscene = false; world.freezeEnemies = false; world.hudHidden = false;
    if (world.run) { world.run.sp = 0; world.run.aw = 0; }   // 마지막 프레임의 각성 타격이 채운 SP 도 비운다
    const lb = world.letterbox || 0;
    world.letterbox = 0;
    if (lb > 0.5 && why !== 'room' && why !== 'left') world.addOverlay?.({ life: 0.3, draw(ctx, vw, vh) { const h = lb * (1 - ease.outCubic(clamp(this.t / 0.3, 0, 1))); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, h); ctx.fillRect(0, vh - h, vw, h); } });
    try { ULTFX.end?.(world, p, {}); } catch (e) { console.error(e); }
  }
  if (p) {
    p.hidden = false; p.superArmor = 0; p.awakenHoldK = 0;
    const t2 = v?.t2;
    if (t2?.invuln && !p.dead) p.iframes = Math.max(p.iframes ?? 0, t2.invuln);
  }
  if (AWAKEN_DEBUG.last) { AWAKEN_DEBUG.last.done = true; AWAKEN_DEBUG.last.why = why; }
}

/** 시전 자세 (가짜 동작으로 렌더러의 자세를 붙잡는다; skills.js pose 와 같은 방식). 판정·휘두르는 소리 없음 */
function castPose(p, world, dur, anim = 'cast_up', id = 'aw_cast') {
  try {
    p.startMove?.(world, { id, anim, dur, hit: [dur, dur], box: null, skill: true, sfx: 'magic', cancel: dur, mv: 0, awaken: true });
    p.moveHitDone = true;
  } catch (e) { console.error(e); }
}
/** 무기별 휘두르기 자세 (대체 연출의 박자마다 번갈아) */
const BEAT_ANIMS = {
  whip: ['lash', 'spin'], sword: ['slash_wide', 'uppercut'], greatsword: ['heavy_spin', 'heavy_down'],
  dagger: ['spin_blade', 'stab'], gun: ['shoot', 'shoot_double'], staff: ['staff_swing', 'cast'],
};

// ───────────────────────── 감독 문맥 v ─────────────────────────
let _hid = 0;
const bestType = (p) => ((p.stats?.mag ?? 0) > (p.stats?.atk ?? 0) ? 'mag' : 'phys');
function viewRect(world, pad = 0) { const c = world.camera; return { x: c.x - pad, y: c.y - pad, w: c.vw + pad * 2, h: c.vh + pad * 2 }; }
function foesIn(world, rect) {
  return world.enemies().filter((e) => !e.invuln && overlap(rect, e.hurtbox ? e.hurtbox() : e));
}

function makeContext(cast) {
  const { world, p, charId, classId, tier } = cast;
  const a = AWAKEN[charId];
  const t2 = tier >= 2 ? (T2[classId] ?? null) : null;
  const sum = a.mvWeights.reduce((s, w) => s + w, 0) || 1;
  const target = a.ultMv * R.mvMul * (tier >= 2 ? R.t2Mul : 1);
  const scale = target / sum;
  const cap = bossCapFn(world);
  const stats = t2?.critDmg ? { ...p.stats, critDmg: (p.stats?.critDmg ?? 0) + t2.critDmg } : null;
  const v = {
    charId, classId, tier, data: a, t2, cast: cast.id,
    color: t2?.color ?? a.color, accent: t2?.accent ?? a.accent, dark: a.dark,
    scale, cap, finished: false, dur: undefined, started: world.rt ?? 0,
    mv: (w) => (Number(w) || 0) * scale,
    atk(w, o = {}) {
      return {
        owner: p, team: 'player', stats: stats ?? p.stats, mv: v.mv(w), type: bestType(p), element: t2?.element ?? null,
        dir: p.facing, kb: [60, -200], hitstop: 0.03, shake: 3, hitId: 'aw' + (++_hid), mult: p.dmgMul ?? 1,
        tags: ['awaken'], crit: 0, breakWalls: false, capFn: cap, ...o,
      };
    },
    hit(rect, w, o = {}) { return playerStrike(world, rect ?? viewRect(world, 30), v.atk(w, o)); },
    final(rect, w, o = {}) {
      return playerStrike(world, rect ?? viewRect(world, 40), v.atk(w, { final: true, launch: true, hitstop: 0.3, shake: 16, kb: [420, -620], ...o }));
    },
    view: (pad = 0) => viewRect(world, pad),
    foes: (rect) => foesIn(world, rect ?? viewRect(world, 20)),
    heal(frac) { if (frac > 0 && !p.dead) p.heal?.(p.stats.hp * frac); },
    finish() { v.finished = true; },
  };
  return v;
}

// ───────────────────────── 보스 피해 상한 ─────────────────────────
const maxHpOf = (e) => e?.stats?.maxHp ?? e?.maxHp ?? e?.stats?.hp ?? 0;
function bossRoot(t, world) {
  if (!t) return null;
  if (t.kind === 'boss' || t.isBoss || t === world?.boss) return t;
  if (t.bossPart && t.parent?.kind === 'boss') return t.parent;
  return null;
}
/**
 * 각성 한 번에 보스 한 마리가 받을 수 있는 피해: 최대 HP 의 30% (feel §6.1, MASTER_PLAN §1.14).
 * 넘친 타격은 1 ('저항') — 그 1 들까지 합쳐도 30% 를 넘지 않도록 최대 HP 2%(최대 80) 를 남겨 두고, 그것도 다 쓰면 0.
 */
export function bossCapFn(world) {
  const used = new Map();
  const dbg = AWAKEN_DEBUG.cap = { calls: 0, capped: 0, dealt: 0 };
  return (target, dmg) => {
    const b = bossRoot(target, world);
    if (!b) return dmg;
    dbg.calls++;
    const max = maxHpOf(b);
    if (!(max > 0)) return dmg;
    const cap = Math.floor(max * R.bossCap), spare = Math.min(max * R.bossCapSpare, 80);
    const u = used.get(b) ?? 0;
    const room = cap - spare - u;
    let d;
    if (dmg <= room) d = dmg;
    else if (room >= 2) d = Math.floor(room);
    else d = u + 1 <= cap ? 1 : 0;
    used.set(b, u + d);
    dbg.dealt += d; if (d < dmg) dbg.capped++;
    return d;
  };
}

// ───────────────────────── 미리 받기 ─────────────────────────
const PREP = new WeakMap();   // world → {charId, touchT}
/** 컷인 그림을 받아 디코드해 둔다 (게이지가 차기 한참 전, 스테이지마다 처음 한 번). 각성할 수 없는 0차 전직은 건너뛴다 */
export function prepareAwakening(p, world) {
  const charId = p?.hero?.charId;
  if (!charId || !world) return;
  let s = PREP.get(world);
  const now = world.rt ?? 0;
  if (s && s.charId === charId && s.classId === p.hero.classId) {
    if (s.ok && now - s.touchT > 2) { s.touchT = now; assets.touch?.(AWAKEN[charId].cutin); }   // 디코딩 메모리 정리에서 내려가지 않게
    return;
  }
  s = { charId, classId: p.hero.classId, touchT: now, ok: false };
  PREP.set(world, s);
  const a = AWAKEN[charId];
  if (!a || tierOf(p) < R.minTier || world.mode === 'town') return;   // 각성할 수 없는 곳에서는 받지 않는다 (디코딩 메모리 약 4 MB)
  s.ok = true;
  try { edgeCanvas(); } catch { /* 캔버스 없음 */ }   // 길게 누르기 가장자리 어둠도 미리 굽는다 (스테이지 중 캔버스 생성 0개, feel §8)
  const decode = (img) => { try { img?.decode?.().catch(() => {}); } catch { /* 디코드 미지원 */ } };
  try { assets.load(a.cutin)?.then?.(decode); assets.load(a.portrait)?.then?.(decode); } catch (e) { console.error(e); }
  try { CUTIN.prepareCutin?.(charId, tierOf(p)); } catch (e) { console.error('[awaken] 컷인 준비', e); }
}

// ───────────────────────── 그리기 도우미 ─────────────────────────
function sfx(name, o) { try { audio.sfx(name, o); } catch { /* 효과음 실패 무시 */ } }

/** 길게 누르기 고리 (월드 좌표, 영웅 중심, 반지름 52, 두께 4, 시계 방향) */
function drawHoldRing(ctx, p, a) {
  const k = clamp(p.awakenHoldK || 0, 0, 1);
  const x = p.cx, y = p.cy, r = R.ring.r;
  const col = a?.color ?? '#fff2b0', acc = a?.accent ?? '#b0102a';
  const t = p.t ?? 0;
  ctx.globalAlpha = 0.35 + 0.35 * k;
  ctx.lineWidth = R.ring.w + 4;
  ctx.strokeStyle = 'rgba(10,0,4,0.7)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  const a0 = -Math.PI / 2, a1 = a0 + TAU * k;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(acc, 0.55); ctx.lineWidth = R.ring.w + 6;
  ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = R.ring.w;
  ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
  // 선두 불꽃
  const hx = x + Math.cos(a1) * r, hy = y + Math.sin(a1) * r;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(hx, hy, 3 + 2 * Math.sin(t * 40), 0, TAU); ctx.fill();
  // 다 차 가면 안쪽으로 모여드는 빛줄기
  if (k > 0.3) {
    ctx.strokeStyle = rgba(col, 0.5 * k); ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const ang = i * TAU / 8 + t * 3, r0 = r + 26 - ((t * 90 + i * 11) % 24), r1 = r0 - 12;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0); ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

let EDGE = null;   // 화면 가장자리 어둠 (한 번 굽는다)
function edgeCanvas() {
  if (EDGE || typeof document === 'undefined') return EDGE;
  const c = document.createElement('canvas'); c.width = 160; c.height = 90;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(80, 45, 18, 80, 45, 92);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 160, 90);
  EDGE = c;
  return c;
}
function drawEdgeDark(ctx, vw, vh, a) {
  const c = edgeCanvas();
  if (!c) return;
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.drawImage(c, 0, 0, vw, vh);
  ctx.globalAlpha = 1;
}

// ───────────────────────── 대체 연출 (감독 준비 전) ─────────────────────────
// AWAKEN-DIR-A/B 의 영웅별 감독(FXKIT 위에 만든다)이 들어오기 전까지 쓰는 공통 연출.
// 영웅 모양(style)별로: lash 빛 채찍 · pillar 심판의 기둥 · shot 은탄 조준 · cleave 거대 내려베기 · blink 순간이동 베기 · crescent 피의 초승달.
// 가중치(mvWeights)의 앞쪽은 박자마다 화면 안 모든 적에게, 마지막은 마무리 일격(class A)으로 들어간다.
function fallbackDirector(p, world, v) {
  const a = v.data, W = a.mvWeights, n = Math.max(1, W.length - 1);
  const cam = world.camera;
  const T_BEAT0 = 0.25, T_BEATS = 1.15, T_FINAL = 1.7, DUR = 2.45;
  const col = v.color, acc = v.accent, style = a.style;
  const marks = [];   // {t, kind, x0, y0, x1, y1, s, c}
  let finalAt = null;
  const q = world.fx.quality ?? 1;
  try { ULTFX.begin?.(world, p, { color: col, accent: acc, tier: v.tier, dimCol: a.dark }); } catch (e) { console.error(e); }
  if (a.cue?.name) sfx(a.cue.name, { pitch: a.cue.pitch ?? 1 });
  sfx('awaken_charge', { vol: 0.5, pitch: 1.3 });
  castPose(p, world, 0.3);
  const anims = BEAT_ANIMS[p.stats?.weaponType] ?? BEAT_ANIMS.sword;
  world.fx.burst('holy', p.cx, p.cy - 10, 26, { speed: 380, color: col });
  world.fx.ring(p.cx, p.cy, { color: col, r0: 20, r1: 180, life: 0.45, width: 10 });
  const steps = [];
  const targets = () => v.foes();
  for (let i = 0; i < n; i++) {
    const t = T_BEAT0 + (n > 1 ? i * T_BEATS / (n - 1) : 0);
    steps.push([t, () => beat(i)]);
  }
  steps.push([T_FINAL - 0.25, () => { sfx('charge_ready', { pitch: 0.7 }); world.fx.ring(focus().x, focus().y, { color: col, r0: 260, r1: 10, life: 0.25, width: 6 }); }]);
  steps.push([T_FINAL, () => final()]);

  function focus() {
    const list = targets();
    if (!list.length) return { x: clamp(p.cx + p.facing * 160, cam.x + 160, cam.x + cam.vw - 160), y: clamp(p.cy - 30, cam.y + 120, cam.y + cam.vh - 100) };
    // 가장 적이 몰린 곳 (단순: 평균)
    let sx = 0, sy = 0;
    for (const e of list) { sx += e.cx; sy += e.cy; }
    return { x: sx / list.length, y: sy / list.length };
  }
  function beat(i) {
    const w = W[i];
    const list = targets();
    castPose(p, world, 0.24, anims[i % 2], 'aw_beat');
    const vr = v.view(0);
    let rect = null;
    if (style === 'blink' || style === 'shot') {
      const e = list.length ? list[i % list.length] : null;
      const x = e ? e.cx : rand(vr.x + 120, vr.x + vr.w - 120), y = e ? e.cy : rand(vr.y + 140, vr.y + vr.h - 120);
      if (style === 'blink') {
        marks.push({ t: world.rt, kind: 'x', x0: x, y0: y, s: rand(0.8, 1.2), r: rand(-0.4, 0.4) });
        afterimageAt(world, p, x - p.facing * 50, y + p.h / 2, col);
        sfx('slash', { pitch: rand(1.1, 1.3), vol: 0.7 });
      } else {
        marks.push({ t: world.rt, kind: 'shot', x0: p.cx + p.facing * 44, y0: p.bottom - 60, x1: x, y1: y });
        world.fx.flash(p.cx + p.facing * 44, p.bottom - 60, { color: '#fff0b0', size: 70 });
        sfx('gun', { pitch: rand(0.85, 1) });
      }
      // 한 대상 집중 타격 + 화면 전체에 약한 여파 (가중치 합은 그대로)
      rect = e ? { x: e.cx - 70, y: e.cy - 80, w: 140, h: 160 } : { x: x - 70, y: y - 80, w: 140, h: 160 };
      const hitE = v.hit(rect, w * 0.6, { hitstop: 0.02, kb: [40, -120] });
      v.hit(null, w * 0.4 + (hitE ? 0 : w * 0.6), { hitstop: 0, kb: [20, -60], shake: 0 });
    } else {
      if (style === 'lash') {
        const dir = i % 2 ? 1 : -1;
        const y0 = vr.y + vr.h * rand(0.15, 0.4), y1 = vr.y + vr.h * rand(0.6, 0.9);
        marks.push({ t: world.rt, kind: 'lash', x0: vr.x - 80, y0: dir > 0 ? y0 : y1, x1: vr.x + vr.w + 80, y1: dir > 0 ? y1 : y0, bend: rand(-120, 120) });
        sfx('whip_crack', { pitch: 0.8 + i * 0.04, vol: 0.8 });
      } else if (style === 'pillar') {
        const x = vr.x + vr.w * (0.1 + 0.8 * (n > 1 ? i / (n - 1) : 0.5));
        marks.push({ t: world.rt, kind: 'pillar', x0: x, y0: vr.y, y1: vr.y + vr.h });
        rect = { x: x - 70, y: vr.y, w: 140, h: vr.h };
        sfx('holy', { pitch: 1 + i * 0.05, vol: 0.7 });
      } else if (style === 'cleave') {
        if (i === 0) {
          const x = focus().x;
          marks.push({ t: world.rt, kind: 'cleave', x0: x, y0: vr.y, y1: vr.y + vr.h });
          sfx('slash_heavy', { pitch: 0.6 }); cam.addTrauma?.(0.5);
          world.fx.burst('shard', x, vr.y + vr.h * 0.8, 20, { speed: 420 });
        } else {
          marks.push({ t: world.rt, kind: 'wave', x0: vr.x + vr.w * (i - 1) / Math.max(1, n - 1), y0: p.bottom });
          sfx('dash', { pitch: 0.8, vol: 0.6 });
        }
      } else {
        // crescent
        const cx = vr.x + vr.w * rand(0.25, 0.75), cy = vr.y + vr.h * rand(0.3, 0.7);
        marks.push({ t: world.rt, kind: 'crescent', x0: cx, y0: cy, r: rand(-0.8, 0.8), s: rand(0.9, 1.3) });
        sfx('slash', { pitch: rand(0.7, 0.9), vol: 0.8 });
      }
      if (rect) {
        const hit = v.hit(rect, w * 0.7, { hitstop: 0.02 });
        v.hit(null, w * 0.3 + (hit ? 0 : w * 0.7), { hitstop: 0, shake: 0, kb: [20, -60] });
      } else v.hit(null, w, { hitstop: 0.025 });
    }
    cam.kick?.(rand(-3, 3), rand(-3, 3));
    try { ULTFX.beat?.(world, p.cx, p.cy, { power: 0.4, color: col, ground: false }); } catch (e) { console.error(e); }
    if (marks.length > 24) marks.shift();
  }
  function final() {
    const f = focus();
    if (Math.abs(f.x - p.cx) > 20) p.facing = f.x > p.cx ? 1 : -1;
    castPose(p, world, 0.7, 'cast_up', 'aw_final');
    finalAt = { t: world.rt, x: f.x, y: f.y };
    v.final(null, W[W.length - 1], { element: v.t2?.element ?? null, crit: style === 'blink' ? 100 : 0 });
    sfx('awaken_boom');
    world.game.flash(style === 'blink' || style === 'crescent' ? '#ff2040' : '#ffffff', 0.6, 3);
    cam.punchZoom?.(1.12, 0.3); cam.addTrauma?.(0.8);
    world.fx.ring(f.x, f.y, { color: col, r0: 30, r1: cam.vw * 0.55, life: 0.6, width: 18 });
    world.fx.ring(f.x, f.y, { color: acc, r0: 20, r1: cam.vw * 0.35, life: 0.5, width: 10 });
    world.fx.burst(style === 'blink' || style === 'crescent' ? 'blood' : 'holy', f.x, f.y, 50, { speed: 560 });
    const vr = v.view(0);
    for (let i = 0; i < Math.round(30 * q); i++) world.fx.emit('ember', vr.x + rand(0, vr.w), vr.y + rand(-20, 60), { vy: rand(60, 180), grav: 120, color: col, life: rand(0.8, 1.6) });
    try { ULTFX.final?.(world, f.x, f.y, { color: col, accent: acc, tier: v.tier, ground: false }); } catch (e) { console.error(e); }
    const heal = (a.heal ?? 0) + (v.t2?.heal ?? 0);
    if (heal > 0) v.heal(heal);
  }

  steps.sort((x, y) => x[0] - y[0]);
  // 어둠막 (배경만 어둡게: 캐릭터 뒤)
  world.add(new SkillFx({
    life: DUR, z: -1,
    follow(e) { e.x = cam.x - 60; e.y = cam.y - 60; e.w = cam.vw + 120; e.h = cam.vh + 120; },
    draw(ctx, e) {
      const k = Math.min(1, e.lt / 0.2) * clamp((e.life - e.lt) / 0.35, 0, 1);
      ctx.fillStyle = rgba(a.dark ?? '#05020a', 0.62 * k); ctx.fillRect(e.x, e.y, e.w, e.h);
    },
  }));
  const ent = world.add(new SkillFx({
    life: DUR, z: 12, d: { i: 0 },
    follow(e) { e.x = cam.x - 60; e.y = cam.y - 60; e.w = cam.vw + 120; e.h = cam.vh + 120; },
    tick(e) {
      while (e.d.i < steps.length && steps[e.d.i][0] <= e.lt) { try { steps[e.d.i][1](); } catch (err) { console.error('[awaken] 대체 연출', err); } e.d.i++; }
      if (e.lt < T_FINAL - 0.1 && Math.random() < 0.5 * q) world.fx.emit('ember', p.cx + rand(-30, 30), p.bottom - rand(0, 60), { vy: -rand(80, 200), color: col, life: 0.6 });
    },
    draw(ctx, e) { drawMarks(ctx, world, marks, finalAt, style, col, acc, e); },
  }));
  return ent;
}

function afterimageAt(world, p, x, bottom, tint) {
  try {
    const s = p.snapshot();
    s.x = x - p.w / 2; s.y = bottom - p.h; s.cx = x; s.bottom = bottom; s.anim = 'dash'; s.move = null;
    world.fx.ghost((ctx, al) => drawHero(ctx, s, world, { alpha: al * 0.8, tint }), 0.3, 'front');
  } catch (e) { console.error(e); }
}

/** 대체 연출의 누적 표식 그리기 (월드 좌표) */
function drawMarks(ctx, world, marks, fin, style, col, acc, e) {
  const now = world.rt ?? 0;
  const cam = world.camera;
  const endFade = clamp((e.life - e.lt) / 0.4, 0, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const flashAll = fin ? clamp(1 - (now - fin.t) / 0.5, 0, 1) : 0;
  for (const m of marks) {
    const age = now - m.t;
    const a0 = (age < 0.12 ? 1 : Math.max(0.28, 1 - (age - 0.12) / 0.5)) * endFade;
    const a = Math.min(1, a0 + flashAll * 0.8);
    const c = flashAll > 0.05 && (style === 'blink' || style === 'crescent') ? '#ff3050' : col;
    switch (m.kind) {
      case 'lash': {
        const grow = clamp(age / 0.1, 0, 1);
        const x1 = m.x0 + (m.x1 - m.x0) * grow, y1 = m.y0 + (m.y1 - m.y0) * grow;
        const mx = (m.x0 + x1) / 2, my = (m.y0 + y1) / 2 + m.bend * grow;
        glowPath(ctx, (g) => { g.moveTo(m.x0, m.y0); g.quadraticCurveTo(mx, my, x1, y1); }, 12, c, a);
        break;
      }
      case 'pillar': {
        const wd = 70 * (age < 0.1 ? age / 0.1 : 1) * (0.6 + 0.4 * a);
        ctx.fillStyle = rgba(c, 0.35 * a); ctx.fillRect(m.x0 - wd, m.y0, wd * 2, m.y1 - m.y0);
        ctx.fillStyle = rgba('#ffffff', 0.7 * a); ctx.fillRect(m.x0 - wd * 0.25, m.y0, wd * 0.5, m.y1 - m.y0);
        break;
      }
      case 'shot': {
        if (age < 0.25) glowPath(ctx, (g) => { g.moveTo(m.x0, m.y0); g.lineTo(m.x1, m.y1); }, 4, '#fff0b0', 1 - age / 0.25);
        crosshair(ctx, m.x1, m.y1, 34 - Math.min(1, age / 0.12) * 10, c, a);
        break;
      }
      case 'cleave': {
        const wd = 110 * clamp(age / 0.08, 0, 1);
        ctx.fillStyle = rgba(acc, 0.45 * a); ctx.fillRect(m.x0 - wd, m.y0, wd * 2, m.y1 - m.y0);
        ctx.fillStyle = rgba(c, 0.8 * a); ctx.fillRect(m.x0 - wd * 0.35, m.y0, wd * 0.7, m.y1 - m.y0);
        ctx.fillStyle = rgba('#ffffff', a); ctx.fillRect(m.x0 - 6, m.y0, 12, m.y1 - m.y0);
        break;
      }
      case 'wave': {
        const x = m.x0 + age * 900;
        const h = 170;
        ctx.fillStyle = rgba('#9ab0ff', 0.35 * a * clamp(1 - age / 0.6, 0, 1));
        ctx.beginPath(); ctx.moveTo(x, m.y0); ctx.lineTo(x - 60, m.y0 - h); ctx.lineTo(x - 180, m.y0 - h * 0.8); ctx.lineTo(x - 140, m.y0); ctx.closePath(); ctx.fill();
        break;
      }
      case 'crescent': {
        ctx.save(); ctx.translate(m.x0, m.y0); ctx.rotate(m.r); ctx.scale(m.s, m.s);
        const sw = clamp(age / 0.1, 0, 1);
        glowPath(ctx, (g) => { g.arc(0, 0, 130, -1.2, -1.2 + 2.4 * sw); }, 10, c, a);
        ctx.restore();
        break;
      }
      case 'x': {
        const L = 70 * m.s * clamp(age / 0.08, 0, 1);
        ctx.save(); ctx.translate(m.x0, m.y0); ctx.rotate(m.r);
        glowPath(ctx, (g) => { g.moveTo(-L, -L); g.lineTo(L, L); g.moveTo(L, -L); g.lineTo(-L, L); }, 5, c, a);
        ctx.restore();
        break;
      }
      default: break;
    }
  }
  if (fin) {
    const age = now - fin.t, k = clamp(1 - age / 0.75, 0, 1) * endFade;
    if (k > 0) {
      const vy0 = cam.y - 40, vy1 = cam.y + cam.vh + 40, vx0 = cam.x - 40, vx1 = cam.x + cam.vw + 40;
      const grow = ease.outCubic(clamp(age / 0.18, 0, 1));
      if (style === 'lash' || style === 'pillar' || style === 'cleave') {
        const wv = (style === 'cleave' ? 110 : 70) * grow;
        ctx.fillStyle = rgba(acc, 0.5 * k); ctx.fillRect(fin.x - wv, vy0, wv * 2, vy1 - vy0);
        ctx.fillStyle = rgba(col, 0.85 * k); ctx.fillRect(fin.x - wv * 0.45, vy0, wv * 0.9, vy1 - vy0);
        ctx.fillStyle = rgba('#ffffff', k); ctx.fillRect(fin.x - wv * 0.15, vy0, wv * 0.3, vy1 - vy0);
        if (style !== 'cleave') {
          const hh = 44 * grow;
          ctx.fillStyle = rgba(col, 0.8 * k); ctx.fillRect(vx0, fin.y - hh, vx1 - vx0, hh * 2);
          ctx.fillStyle = rgba('#ffffff', k); ctx.fillRect(vx0, fin.y - hh * 0.3, vx1 - vx0, hh * 0.6);
        }
      } else {
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = rgba(i === 1 ? acc : col, k * (0.9 - i * 0.2)); ctx.lineWidth = 14 - i * 3;
          ctx.beginPath(); ctx.arc(fin.x, fin.y, (80 + i * 90) * grow + age * 300, 0, TAU); ctx.stroke();
        }
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
function glowPath(ctx, build, w, col, a) {
  if (!(a > 0.01)) return;
  ctx.beginPath(); build(ctx);
  ctx.strokeStyle = col;
  ctx.globalAlpha = a * 0.3; ctx.lineWidth = w * 3; ctx.stroke();
  ctx.globalAlpha = a * 0.85; ctx.lineWidth = w; ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = a; ctx.lineWidth = Math.max(1.5, w * 0.35); ctx.stroke();
  ctx.globalAlpha = 1;
}
function crosshair(ctx, x, y, r, col, a) {
  ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r - 10, y); ctx.lineTo(x - r * 0.4, y); ctx.moveTo(x + r * 0.4, y); ctx.lineTo(x + r + 10, y);
  ctx.moveTo(x, y - r - 10); ctx.lineTo(x, y - r * 0.4); ctx.moveTo(x, y + r * 0.4); ctx.lineTo(x, y + r + 10);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
