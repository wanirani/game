// 이동 손맛 로직 (owner: FEEL-MOVE) — feel.md §3 (전부), §9 WP1 · MASTER_PLAN §1.4, §1.7, §1.9 · companions §15 · world2 §3.3
// player.js 가 훅으로 부른다 (탑승 중에는 걸음·발소리를 건너뛰고 탈것이 맡는다):
//  initFeel(p)                           생성자 끝에서 1회: p.feel {sq, sqV, accLean, …}, p.gait, p.gaitPh, p.moveFx, p.sprinting
//  updateGait(p, world, dt, inp) → gait|null
//        질주 감지(두 번 톡·대시 연계·터치 바깥 고리·자동 달리기), 걷기/달리기/질주 목표 속도, 미끄러짐·방향 전환·달리기 시작,
//        발 접지 위상 p.gaitPh 와 발소리(지면별), 질주·대시 카메라. 반환 {mul, accel?, decel?, airAccel?, airDecel?, holdFace}
//        → player.moveProfile(gait) 가 읽는다 (speed = B × mul × 기믹 speedMul). 탑승 중·스텁일 때 null.
//  onJump(p, world, air)                 air: false(지상) | true(공중) | 'wall'(벽차기) → 늘어남·고리·영웅별 장식
//  onLand(p, world, vyBefore, fallPx)    보통/무거운 착지 (탑승 중에는 불리지 않는다)
//  dashFx(p, world, phase)               'start' | 'step' | 'end' → 잔상(0.035초, 품질별 상한)·속도선·영웅별 연출
//  squashSpring(p, dt)                   찌그러짐 스프링(ω 30, ζ 0.35) + 가속 기울기
//  chaseJump(p, world) → bool            띄우기 적중 0.35초 안의 점프 = 추격 점프 '추격!' (feel §4.3; impact.js 의 p.lastLaunch)
//  takeChaseStall(p) → 0|0.5             추격 점프 뒤 첫 공중 공격의 체공 (player.startMove)
//  pivotCommit(p)                        방향 전환 도중 공격을 시작하면 새 방향으로 바로 돈다 (player.startMove)
//  resetMoveFeel(p, world)               피격·사망·탑승: 질주·동작 연출 해제, 카메라 보정 반납
//  surfaceOf(p, world) · cadenceOf(r)    지면 이름 · 걸음 박자(걸음/초)
// 플레이어 필드: p.gait 'idle'|'walk'|'run'|'sprint' · p.gaitPh 걸음 위상(라디안, 한 걸음 = π) · p.moveFx null|'run_start'|'skid'|'pivot'|'land_heavy'
//   p.moveFxT 경과 초 · p.sprinting · p.feel {sq, sqV, accLean, leanKick, stepK, steps, lastStep} · p.fm (내부 상태)
// 발소리 이벤트: 접지 위상 GAIT.contactPh + kπ 를 지날 때 (render/hero.js poseRun 의 발 접지와 같은 순간) —
//   audio 'step_<지면>' + 먼지. 기록: p.feel.steps (누적), p.feel.lastStep {t, ph, surface, gait}.
// 기본 달리기 속도·점프 높이·대시 거리는 바꾸지 않는다 (feel M1): 달리기 = B, 대시 뒤 방향을 놓으면 예전 감속 그대로.
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { TILE } from '../core/game.js';
import { T, isSolidType } from '../core/physics.js';
import { clamp, rand, mix } from '../core/math.js';
import { GAIT, CADENCE, PERSONALITY, SURFACE, SURFACES, STEP, SPRINT, SKID, LAND, SQUASH, DASH_FX, CHASE } from '../data/feel_move.js';
import * as FH from '../data/feel_hit.js';
import * as HFX from '../render/hitfx.js';
import * as IMP from './impact.js';

const PI = Math.PI;
const DIRS = [['left', -1], ['right', 1]];
const GROUND_FX = new Set(['run_start', 'skid', 'pivot', 'land_heavy']);

// ───────────────────────── 도우미 ─────────────────────────
export const persOf = (p) => PERSONALITY[p?.ch?.id ?? p?.hero?.charId] ?? PERSONALITY._default;
/** 품질 등급 (particles.quality 0.4~1) */
const qKey = (world) => { const q = world?.fx?.quality ?? 1; return q >= 0.95 ? 'high' : q >= 0.7 ? 'medium' : 'low'; };
const reduced = (world) => !!world?.game?.settings?.reduceMotion;
/** 기본 속도 B (기믹 speedMul 포함 — moveProfile 의 목표 속도와 같은 기준) */
function baseSpeed(p, world) {
  const B = (p.ch?.move?.speed ?? 275) * (p.speedMul ?? 1) * (world?.gimmick?.speedMul ?? 1);
  return B > 1 ? B : 1;
}
/** 걸음 박자 (걸음/초): r = |vx| / B 에 대한 구간 선형 */
export function cadenceOf(r) {
  const R = CADENCE.r, S = CADENCE.steps;
  if (!(r > R[0])) return S[0];
  for (let i = 1; i < R.length; i++) {
    if (r <= R[i]) return S[i - 1] + (S[i] - S[i - 1]) * (r - R[i - 1]) / (R[i] - R[i - 1]);
  }
  return S[S.length - 1];
}
/** input.history 에서 시각 t 이전의 마지막 방향 입력 중 그 쪽(l|r)을 포함한 것의 시각 (없으면 -99) */
function prevPressFromHistory(ch, t) {
  const H = input.history;
  if (!Array.isArray(H)) return -99;
  for (let i = H.length - 1; i >= 0; i--) {
    const h = H[i];
    if (!(h.t < t - 1e-6)) continue;
    if (typeof h.dir === 'string' && !h.dir.startsWith('btn:') && h.dir.includes(ch)) return h.t;
  }
  return -99;
}
const arenaBlocks = (world) => !!world?.arena && (world.arena.x1 - world.arena.x0) < SPRINT.arenaMinTiles * TILE;

/** 지면 이름: room.surface > stage.surface > SURFACE[stageId] > 'stone'. {liquid, dry} 는 액체 속·액체가 있는 방이면 liquid */
export function surfaceOf(p, world) {
  const st = world?.stage;
  let s = world?.room?.surface ?? st?.surface ?? SURFACE[st?.id] ?? SURFACE._default;
  if (s && typeof s === 'object') s = (p?.inLiquid || roomHasLiquid(world, p?.fm)) ? s.liquid : s.dry;
  return SURFACES.includes(s) ? s : 'stone';
}
function roomHasLiquid(world, fm) {
  const m = world?.map;
  if (!m) return false;
  if (world.room?.liquid) return true;
  if (fm && fm.liqMap === m) return fm.liqHas;
  const has = !!m.tiles?.includes?.(T.LIQUID);
  if (fm) { fm.liqMap = m; fm.liqHas = has; }
  return has;
}

function setSq(f, v) { f.sq = v; f.sqV = 0; f.sqHold = 1; }
function startFx(p, kind, dur, phys = true) { p.moveFx = kind; p.moveFxT = 0; p.fm.fxDur = dur; p.fm.fxPhys = phys; p.fm.puffT = 0; }
function endFx(p) { p.moveFx = null; p.moveFxT = 0; }

// ───────────────────────── 상태 ─────────────────────────
export function initFeel(p) {
  if (!p) return null;
  p.feel = { sq: 1, sqV: 0, sqHold: 0, accLean: 0, leanKick: 0, stepK: 0, steps: 0, lastStep: null };
  p.gait = 'idle'; p.gaitPh = GAIT.contactPh; p.moveFx = null; p.moveFxT = 0; p.sprinting = false; p.moveStall = 0;
  const pt = input.pressTime ?? {};
  p.fm = {
    prevAx: 0, holdT: 0, prevHold: 0, prevGait: 'idle',
    seenPress: { left: pt.left ?? -99, right: pt.right ?? -99 }, lastPress: { left: -99, right: -99 },
    tapAt: -99, tapDir: 0,
    sprintDir: 0, sprintAt: -9, sprintT: 0, runHeldT: 0, chainSeen: -9,
    fxDur: 0, fxPhys: true, puffT: 0, pivotDir: 0,
    chaseT: 0, chaseNext: false, chaseUsed: -99, momT: 0, airMom: false,
    dash: null, ghostEnd: [],
    lookOwn: 0, zoomOwn: false, edgeOv: null,
    stepN: 0, prevVx: 0, liqMap: null, liqHas: false,
    out: { mul: 1, accel: undefined, decel: undefined, airAccel: undefined, airDecel: undefined, holdFace: false },
  };
  return p.feel;
}

/** 피격·사망·탑승: 질주와 동작 연출을 끄고 카메라 보정을 돌려준다 */
export function resetMoveFeel(p, world) {
  const fm = p?.fm;
  if (!fm) return;
  p.sprinting = false; fm.sprintT = 0; fm.runHeldT = 0;
  if (p.moveFx && p.moveFx !== 'land_heavy') endFx(p);
  fm.chaseT = 0; fm.chaseNext = false; fm.airMom = false;
  releaseCamera(world ?? p.world, fm);
}
function setLook(cam, fm, v) {
  if (!cam) return;
  if (!v) { if (fm.lookOwn && cam.lookBoost === fm.lookOwn) cam.lookBoost = 0; fm.lookOwn = 0; return; }
  if (cam.lookBoost !== v) cam.lookBoost = v;
  fm.lookOwn = v;
}
function releaseCamera(world, fm) {
  const cam = world?.camera;
  setLook(cam, fm, 0);
  if (fm.zoomOwn) { if (cam && !world.arena && cam.zoomTarget === SPRINT.zoom) cam.zoomTarget = 1; fm.zoomOwn = false; }
}

// ───────────────────────── 걸음 · 질주 (매 스텝, 이동 처리 직전) ─────────────────────────
export function updateGait(p, world, dt, inp) {
  if (!p) return null;
  if (!p.fm) initFeel(p);
  const fm = p.fm, f = p.feel;
  if (p.mount?.riding) {   // 탑승: 탈것이 걸음·발소리를 맡는다
    resetMoveFeel(p, world); if (p.moveFx) endFx(p);
    p.gait = 'idle'; fm.prevAx = 0; fm.dash = null;
    return null;
  }
  const ax = inp ? (input.axisX | 0) : 0;
  const an = inp ? (Number.isFinite(input.analogX) ? input.analogX : ax) : 0;
  const pers = persOf(p);
  const B = baseSpeed(p, world);
  const k = pers.sprintK;
  const onGround = !!p.onGround;
  const dashing = p.dashT > 0;
  const busy = !!p.move && !p.move.canMove;
  const avx = Math.abs(p.vx), vdir = Math.sign(p.vx);
  const walkTilt = ax !== 0 && Math.abs(an) > 0 && Math.abs(an) < GAIT.walkMax;

  // ── 타이머 ──
  if (p.moveFx) { p.moveFxT += dt; if (p.moveFxT >= fm.fxDur) endFx(p); }
  if (fm.chaseT > 0) fm.chaseT -= dt;
  if (fm.momT > 0) fm.momT -= dt;
  if (f.stepK > 0) f.stepK = Math.max(0, f.stepK - dt * 8);
  if (fm.dash && !dashing) fm.dash = null;   // 대시가 공격·피격으로 끊겼다
  if (ax !== 0 && ax === fm.prevAx) fm.holdT += dt; else fm.holdT = 0;

  // ── 두 번 톡 감지 (input.pressTime / releasedAt / history: 히트스톱 중 입력도 놓치지 않는다, R16) ──
  if (inp && input.pressTime) {
    for (const [d, dir] of DIRS) {
      const pt = input.pressTime[d] ?? -99;
      if (pt === fm.seenPress[d]) continue;
      fm.seenPress[d] = pt;
      // 앞선 누름: 이 스텝들에서 본 것, 또는 (히트스톱처럼 걸음 처리가 멈춘 동안이면) 방향 이력의 같은 쪽 마지막 입력
      const prev = Math.max(fm.lastPress[d], prevPressFromHistory(d === 'left' ? 'l' : 'r', pt));
      fm.lastPress[d] = pt;
      const rel = input.releasedAt ? input.releasedAt(d) : -99;
      const other = input.pressTime[dir < 0 ? 'right' : 'left'] ?? -99;
      if (prev > -90 && rel >= prev && rel <= pt && pt - rel <= SPRINT.tapWindow && rel - prev <= SPRINT.tapMax && !(other > prev && other <= pt)) {
        fm.tapAt = pt; fm.tapDir = dir;
      }
    }
  }

  // ── 질주 유지 / 종료 ──
  const wasSprint = p.sprinting;
  let sprintEnded = null;
  if (p.sprinting) {
    if (!inp || p.inLiquid || p.crouch || dashing || arenaBlocks(world)) sprintEnded = 'stop';
    else if (ax === 0) sprintEnded = 'release';
    else if (ax !== fm.sprintDir) sprintEnded = 'reverse';
    else if (walkTilt) sprintEnded = 'walk';
    if (sprintEnded) { p.sprinting = false; fm.sprintT = 0; }
    else fm.sprintT += dt;
  }
  // ── 질주 시작 ──
  let sprintStart = null;
  const canSprint = !!inp && !p.inLiquid && !p.crouch && !dashing && !walkTilt && !arenaBlocks(world);
  if (!p.sprinting && canSprint && ax !== 0 && (onGround || p.coyote > 0)) {
    const tapFresh = fm.tapDir === ax && input.time - fm.tapAt <= SPRINT.landGrace + Math.min(0.5, world?.frozenRecent ?? 0);   // 히트스톱으로 멈춘 만큼 연장
    const chain = p.lastDashEnd > fm.chainSeen && p.t - p.lastDashEnd <= SPRINT.chainWindow && !p.dashAir && ax === p.facing;
    if (tapFresh) sprintStart = 'tap';
    else if (chain) sprintStart = 'dash';
    else if (SPRINT.touchHint && input.sprintHint) sprintStart = 'touch';
    else if (world?.game?.settings?.autoSprint && fm.runHeldT >= SPRINT.autoAfter) sprintStart = 'auto';
    if (sprintStart) {
      p.sprinting = true; fm.sprintDir = ax; fm.sprintAt = input.time; fm.sprintT = 0; fm.tapAt = -99;
      if (sprintStart === 'dash') fm.chainSeen = p.lastDashEnd;
      if (p.moveFx === 'skid' || p.moveFx === 'pivot') endFx(p);
    }
  }
  if (p.lastDashEnd > fm.chainSeen && p.t - p.lastDashEnd > SPRINT.chainWindow) fm.chainSeen = p.lastDashEnd;

  // ── 지상 동작 연출: 미끄러짐 · 방향 전환 · 달리기 시작 ──
  if (p.moveFx && GROUND_FX.has(p.moveFx) && (!onGround || busy || dashing)) endFx(p);
  if (p.moveFx === 'skid' && ax !== 0) endFx(p);                       // 다시 누르면 미끄러짐 취소 (반대쪽이면 아래에서 방향 전환)
  if (p.moveFx === 'run_start' && ax === 0) endFx(p);
  if (p.moveFx === 'land_heavy' && ax !== 0 && avx > LAND.heavyInPlace * B) endFx(p);   // 착지 직후 달려 나가면 버티는 자세로 미끄러지지 않게
  if (onGround && !busy && !dashing && !p.crouch) {
    if (ax === 0 && fm.prevAx !== 0 && vdir === fm.prevAx && fm.prevGait !== 'walk' && !p.moveFx
      && (wasSprint || (avx >= SKID.runMin * B && fm.prevHold >= SKID.minHold))) {
      startFx(p, 'skid', wasSprint ? SKID.sprintT : SKID.runT, true);
      skidStartFx(p, world, wasSprint);
    } else if (ax !== 0 && vdir === -ax && avx >= SKID.pivotMin * B && p.moveFx !== 'pivot' && !walkTilt) {
      startFx(p, 'pivot', SKID.pivotT, true);
      fm.pivotDir = ax;
      pivotFx(p, world);
    } else if (ax !== 0 && fm.prevAx === 0 && avx < 0.3 * B && !walkTilt && !p.moveFx) {
      startFx(p, 'run_start', SKID.runStartT, false);
      runStartFx(p, world, pers, !!sprintStart);
      p.gaitPh = GAIT.contactPh + PI * 0.45;   // 첫 발소리는 약 반 걸음 뒤
    }
  }

  // ── 걸음새 ──
  let gait;
  if (ax !== 0) gait = p.sprinting ? 'sprint' : walkTilt ? 'walk' : 'run';
  else gait = avx > GAIT.moveMin ? (p.gait === 'walk' ? 'walk' : 'run') : 'idle';
  const prevGait = p.gait;
  p.gait = gait;

  // ── 이동 수치 (player.moveProfile 이 읽는다) ──
  const o = fm.out;
  o.mul = 1; o.accel = undefined; o.decel = undefined; o.airAccel = undefined; o.airDecel = undefined; o.holdFace = false;
  if (gait === 'walk' && ax !== 0) { o.mul = GAIT.walk.mul; o.accel = GAIT.walk.accel; }
  else if (p.sprinting) { o.mul = k; o.accel = avx < B ? GAIT.run.accel : SPRINT.rampAccel; }
  if (ax === 0 && prevGait === 'walk') o.decel = GAIT.walk.decel;
  if (p.moveFx === 'skid' && fm.fxPhys) o.decel = pers.skidDecel ?? SKID.decel;
  if (p.moveFx === 'pivot') { o.accel = SKID.pivotAccel; o.holdFace = p.moveFxT < fm.fxDur * 0.5; }
  // 공중: 질주(또는 추격 점프)로 얻은 속도는 k·B 까지 유지 (앞으로 누르고 있으면 B 로 깎이지 않는다).
  // 질주가 아닌 빠른 공중 속도(벽차기 420, 공중 대시 끝, 넉백)는 예전처럼 B 로 줄어든다 (feel M1: 발판 거리 그대로)
  if (onGround) fm.airMom = false; else if (p.sprinting || fm.chaseT > 0) fm.airMom = true;
  if (!onGround && fm.airMom && ax !== 0 && vdir === ax && avx > B * o.mul) o.mul = Math.min(k, avx / B);
  // 공중에서 질주를 놓았다가 다시 누른 채 착지: 0.35초에 걸쳐 B 로
  if (onGround && fm.momT > 0 && ax !== 0 && vdir === ax && avx > B * o.mul + 1 && !p.sprinting) o.accel = (k - 1) * B / SPRINT.decayT;
  // 추격 점프 상승 중: 방향을 놓아도 조준한 가로 속도 유지
  if (fm.chaseT > 0 && !onGround && ax === 0) o.airDecel = 0;
  // 가장자리 보호 (미끄러짐·방향 전환 앞 절반): 앞쪽 6px 아래가 비면 멈춘다
  if (onGround && vdir && !p.platform && (p.moveFx === 'skid' || (p.moveFx === 'pivot' && o.holdFace))) edgeGuard(p, world, vdir);
  if (p.moveFx === 'skid') skidTick(p, world, dt);

  // ── 자동 달리기 시간 ──
  fm.runHeldT = onGround && ax !== 0 && !walkTilt && !busy ? fm.runHeldT + dt : (ax !== 0 ? fm.runHeldT : 0);

  // ── 발 접지 위상 · 발소리 ──
  const loco = onGround && !busy && !dashing && !p.crouch && avx > GAIT.moveMin && p.moveFx !== 'skid' && p.moveFx !== 'pivot' && p.moveFx !== 'land_heavy';
  if (loco) {
    const ph0 = p.gaitPh, dph = dt * PI * cadenceOf(avx / B) * (pers.cad ?? 1);
    p.gaitPh += dph;
    // 접지 순간에 가장 가까운 스텝에서 울린다 (오차 ≤ 반 스텝의 위상: 달리기 0.11 rad, 질주 0.14 rad)
    const c = GAIT.contactPh - dph * 0.5;
    if (Math.floor((p.gaitPh - c) / PI) !== Math.floor((ph0 - c) / PI)) footstep(p, world, pers, gait === 'idle' ? 'run' : gait);
    if (p.gaitPh > 2000 * PI) p.gaitPh -= 1000 * 2 * PI;
  }

  // ── 카메라 (feel §3.7): 질주·대시 룩어헤드, 질주 줌 ──
  const cam = world?.camera;
  if (cam) {
    let look = p.sprinting ? SPRINT.lookBoost : 0;
    if (fm.dash) look = DASH_FX[fm.dash.type]?.lookBoost ?? look;
    setLook(cam, fm, look);
    const vw = world.game?.viewW ?? 960;
    const wantZoom = p.sprinting && fm.sprintT >= SPRINT.zoomAfter && !world.arena && !reduced(world) && !((cam.bounds?.w ?? 1e9) < vw / SPRINT.zoom);
    if (wantZoom) { if (cam.zoomTarget === 1) cam.zoomTarget = SPRINT.zoom; fm.zoomOwn = cam.zoomTarget === SPRINT.zoom; }
    else if (fm.zoomOwn) { if (!world.arena && cam.zoomTarget === SPRINT.zoom) cam.zoomTarget = 1; fm.zoomOwn = false; }
  }
  // 화면 가장자리 속도선
  if (p.sprinting && fm.sprintT >= SPRINT.edgeAfter && qKey(world) !== 'low' && !reduced(world)) ensureEdgeLines(p, world, fm);

  fm.prevHold = fm.holdT;
  fm.prevAx = ax; fm.prevGait = gait;
  return o;
}

/** 미끄러짐 중 앞쪽 6px 아래에 발판(단단한 칸·발판)이 없으면 그 자리에서 멈춘다 */
function edgeGuard(p, world, dir) {
  const m = world?.map;
  if (!m) return;
  const fx = dir > 0 ? p.x + p.w + SKID.edgeProbe : p.x - SKID.edgeProbe;
  const t = m.typeAt(Math.floor(fx / TILE), Math.floor((p.y + p.h + 2) / TILE));
  if (!(isSolidType(t) || t === T.ONEWAY)) p.vx = 0;
}

// ───────────────────────── 연출 조각 ─────────────────────────
function runStartFx(p, world, pers, sprint) {
  const fx = world.fx, back = p.facing > 0 ? PI : 0;
  const n = Math.max(1, Math.round((sprint ? SKID.runStartDust + 2 : SKID.runStartDust) * (pers.dust ?? 1)));
  fx.burst('dust', p.cx - p.facing * 10, p.bottom - 2, n, { angle: back - p.facing * 0.35, spread: 0.45, speed: sprint ? 90 : 60 });
  audio.sfx('step_push', { vol: SKID.runStartVol * (pers.vol ?? 1) * (sprint ? 1.5 : 1), pitch: rand(0.95, 1.05) });
  if (sprint) audio.sfx('dash_burst', { vol: 0.25, pitch: 1.15 });
}
function skidStartFx(p, world, sprint) {
  audio.sfx('skid', { vol: sprint ? 0.55 : 0.4, pitch: rand(0.95, 1.05) });
}
/** 미끄러지는 동안 앞발 먼지 (0.03초마다 1개), 돌·금속 바닥이면 뒤꿈치 불꽃 */
function skidTick(p, world, dt) {
  const fm = p.fm;
  if (!fm.fxPhys && p.moveFxT > 0.06) return;
  fm.puffT -= dt;
  if (fm.puffT > 0) return;
  fm.puffT += SKID.puffEvery;
  if (Math.abs(p.vx) < 20 && p.moveFxT > 0.05) return;
  const dir = Math.sign(p.vx) || p.facing;
  const x = p.cx + dir * 12, y = p.bottom - 1;
  world.fx.emit('dust', x, y, { angle: -PI / 2 - dir * 0.9, spread: 0.5, speed: 50, size: 6 });
  if (SKID.sparkSurfaces.includes(surfaceOf(p, world)) && Math.random() < 0.45) {
    world.fx.emit('spark', x, y, { angle: dir > 0 ? -PI * 0.85 : -PI * 0.15, spread: 0.35, speed: 220, life: 0.18 });
  }
}
function pivotFx(p, world) {
  const back = p.facing > 0 ? PI : 0;   // 아직 옛 방향을 보고 있다: 그 뒤쪽이 새 진행 방향의 반대
  world.fx.burst('dust', p.cx + p.facing * 8, p.bottom - 2, SKID.pivotDust, { angle: -PI / 2 + (back === PI ? 0.6 : -0.6), spread: 0.9, speed: 80 });
  audio.sfx('pivot', { vol: 0.45, pitch: rand(0.95, 1.05) });
}

/** 발소리 이벤트 (접지 순간) */
function footstep(p, world, pers, gait) {
  const fm = p.fm, f = p.feel, fx = world.fx;
  const st = STEP[gait] ?? STEP.run;
  const surf = surfaceOf(p, world);
  audio.sfx('step_' + surf, { vol: st.vol * (pers.vol ?? 1), pitch: 1 + rand(-st.pitch, st.pitch) });
  fm.stepN++;
  const x = p.cx - p.facing * 4, y = p.bottom - 1;
  const dk = pers.dust ?? 1;
  if (st.dust && Math.random() < Math.min(1, st.dustP * dk)) {
    fx.burst('dust', x, y, Math.max(1, Math.round(st.dust * dk)), { angle: -PI / 2 - p.facing * 0.5, spread: 0.6, speed: STEP.dustOpts.speed, size: STEP.dustOpts.size });
  }
  if (gait === 'sprint') {
    if (st.pebble) fx.emit('shard', x, y - 2, { angle: -PI / 2 - p.facing * 0.7, spread: 0.4, speed: 160, size: STEP.pebble.size, color: STEP.pebble.color });
    if (surf === 'water') fx.burst('water', x, y - 2, st.water, { angle: -PI / 2, spread: 0.9, speed: 180 });
    if (pers.sprintKick) world.camera?.kick?.(0, pers.sprintKick);
    if (pers.sprintGravel) fx.burst('gravel', x, y - 2, pers.sprintGravel, { angle: -PI / 2 - p.facing * 0.6, spread: 0.5, speed: 200 });
    if (pers.sprintMist && fm.stepN % 2 === 0) fx.burst('dark', p.cx - p.facing * 10, p.bottom - 14, 2, { color: '#8a0a1e', speed: 40 });
  } else if (surf === 'water' && gait === 'run' && Math.random() < 0.5) {
    fx.emit('water', x, y - 2, { angle: -PI / 2, spread: 0.8, speed: 140 });
  }
  f.stepK = 1; f.steps++;
  f.lastStep = { t: p.t, ph: p.gaitPh, surface: surf, gait };
}

/** 질주 0.4초 뒤: 화면 위·아래 가장자리를 스치는 속도선 (화면 좌표 오버레이 1개) */
function ensureEdgeLines(p, world, fm) {
  const o = fm.edgeOv;
  if (o && !o.dead && world.overlays?.includes?.(o)) return;
  if (typeof world.addOverlay !== 'function') return;
  const ov = {
    t: 0, lines: [], acc: 0,
    update(dt) {
      const on = p.sprinting && p.fm?.sprintT >= SPRINT.edgeAfter && !p.dead;
      if (on) {
        this.acc += dt;
        while (this.acc >= SPRINT.edgeEvery) {
          this.acc -= SPRINT.edgeEvery;
          for (let i = 0; i < SPRINT.edgeN; i++) {
            const top = Math.random() < 0.5;
            this.lines.push({ y: top ? rand(0.015, 0.13) : rand(0.87, 0.985), x: rand(0.1, 1.05), len: rand(120, 260), life: 0.28, t: 0, dir: -(p.facing || 1) });
          }
        }
      }
      const L = this.lines;
      for (let i = L.length - 1; i >= 0; i--) { L[i].t += dt; if (L[i].t >= L[i].life) L.splice(i, 1); }
      if (!on && !L.length) this.dead = true;
    },
    draw(ctx, vw, vh) {
      if (!this.lines.length) return;
      ctx.fillStyle = '#ffffff';
      for (const l of this.lines) {
        const u = l.t / l.life, a = SPRINT.edgeAlpha * Math.sin(u * PI);
        if (a <= 0.01) continue;
        const x = l.x * vw + l.dir * u * vw * 0.55, y = l.y * vh;
        ctx.globalAlpha = a;
        ctx.fillRect(l.dir > 0 ? x - l.len : x, y - 1, l.len, 2);
      }
      ctx.globalAlpha = 1;
    },
  };
  fm.edgeOv = world.addOverlay(ov);
}

/** 작은 박쥐 실루엣 (아젤: 안개 대시·공중 점프) — 잔상 입자 한 장 */
function spawnBat(fx, x, y, vx, vy, life = 0.45, color = '#1c0810') {
  fx.ghost((ctx, a) => {
    const u = clamp(1 - a / 0.5, 0, 1), t = u * life;
    const bx = x + vx * t, by = y + vy * t - 40 * t * t, fl = Math.sin(t * 46);
    ctx.save();
    ctx.globalAlpha = clamp(a * 2.2, 0, 1); ctx.fillStyle = color;
    ctx.translate(bx, by); ctx.scale(vx < 0 ? -1 : 1, 1);
    const wy = -3 - fl * 4;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-4, wy - 2); ctx.lineTo(-9, wy + 1); ctx.lineTo(-7, 1); ctx.lineTo(-4, 0);
    ctx.lineTo(4, 0); ctx.lineTo(7, 1); ctx.lineTo(9, wy + 1); ctx.lineTo(4, wy - 2); ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0.5, 2.2, 3, 0, 0, PI * 2); ctx.fill();
    ctx.restore();
  }, life, 'front');
}

// ───────────────────────── 점프 · 착지 ─────────────────────────
export function onJump(p, world, air) {
  if (!p) return;
  if (!p.feel) initFeel(p);
  const f = p.feel, fx = world?.fx;
  if (p.moveFx && GROUND_FX.has(p.moveFx)) endFx(p);
  if (air === 'wall') { setSq(f, SQUASH.wall); f.leanKick = SQUASH.wallLean; return; }
  if (!fx) return;
  if (air) {
    setSq(f, SQUASH.airJump);
    const kind = persOf(p).airFx, x = p.cx, y = p.bottom;
    if (kind === 'holy') fx.burst('holy', x, y - 4, 5, { speed: 110 });
    else if (kind === 'feather_w') fx.burst('feather', x, y - 6, 3, { color: '#f4efe4', speed: 90 });
    else if (kind === 'feather') fx.burst('feather', x, y - 6, 3, { speed: 90 });
    else if (kind === 'smoke') fx.burst('smoke', x, y - 4, 3, { speed: 40, size: 9 });
    else if (kind === 'bats') { spawnBat(fx, x - 6, y - 10, -140, 40); spawnBat(fx, x + 6, y - 14, 150, 20); }
  } else {
    setSq(f, SQUASH.takeoff);
    const R = LAND.takeoffRing;
    fx.ering?.(p.cx, p.bottom - 1, { r0: R.r0, r1: R.r1, ry: 0.22, color: R.color, width: 2, life: 0.22, add: false, layer: 'back' });
  }
}

export function onLand(p, world, vyBefore, fallPx) {
  if (!p) return;
  if (!p.feel) initFeel(p);
  const f = p.feel, fm = p.fm, fx = world?.fx;
  fm.chaseT = 0; fm.chaseNext = false;
  const B = baseSpeed(p, world);
  if (!p.sprinting && fm.airMom && Math.abs(p.vx) > B * 1.02) fm.momT = LAND.momentum;   // 질주 점프의 남은 속도만 천천히 줄인다
  const heavy = !p.landSlam && ((vyBefore ?? 0) >= LAND.heavyVy || (fallPx ?? 0) > LAND.heavyFall);
  if (!heavy) { setSq(f, SQUASH.land); return; }
  setSq(f, SQUASH.heavy);
  // 달리며 방향을 누른 채 떨어지면 다리는 계속 달리고 충격만 (제자리 착지 자세로 미끄러지지 않게)
  const held = !world?.cutscene && !world?.inputLock && input.axisX !== 0;
  if (!(held && Math.abs(p.vx) > LAND.heavyInPlace * B)) startFx(p, 'land_heavy', LAND.heavyT, false);
  if (fx) {
    const R = LAND.ring;
    fx.ering?.(p.cx, p.bottom - 1, { r0: 10, r1: R.w / 2, ry: R.h / R.w, color: R.color, width: 3, life: 0.32, add: false });
    fx.burst('gravel', p.cx, p.bottom - 3, LAND.gravel, { angle: -PI / 2, spread: 1.25, speed: 240 });
    fx.burst('dust', p.cx, p.bottom - 2, 4, { angle: -PI / 2, spread: 1.5, speed: 110 });
  }
  audio.sfx('land_heavy', { vol: 0.7, pitch: rand(0.95, 1.05) });
  world?.camera?.kick?.(0, LAND.kick);
  input.rumble?.(LAND.rumble[0], LAND.rumble[1], LAND.rumble[2]);
}

// ───────────────────────── 추격 점프 (feel §4.3) ─────────────────────────
/** 띄우기 적중 0.35초 안에 지상에서 점프 → 띄운 적 앞 40px 로 날아오르는 점프. 했으면 true (player.handleJump 가 입력을 소비) */
export function chaseJump(p, world) {
  const L = p?.lastLaunch, fm = p?.fm;
  if (!L || !fm || p.mount?.riding || !world) return false;
  const J = FH.JUGGLE ?? {};
  if (!(world.time - L.t <= (J.chaseWindow ?? CHASE.window)) || L.t === fm.chaseUsed) return false;
  const tg = L.target;
  if (!tg || tg.dead || tg.onGround || !(tg.cx > -1e6)) return false;
  fm.chaseUsed = L.t;
  if (p.move) p.endMove();
  p.doJump(world, false);
  const vy0 = p.jumpVel() * (J.chaseVyK ?? CHASE.vyK);
  p.vy = -vy0; p.jumpCut = true;   // 가변 점프(버튼을 떼면 반감)로 깎이지 않게
  const tA = vy0 / 2200;
  const side = Math.sign(tg.cx - p.cx) || p.facing || 1;
  const gx = tg.cx + (tg.vx || 0) * tA * 0.5 - side * (J.chaseLead ?? CHASE.lead);
  const vmax = baseSpeed(p, world) * CHASE.maxVxK;
  p.vx = clamp((gx - p.cx) / tA, -vmax, vmax);
  p.facing = side;
  fm.chaseT = tA; fm.chaseNext = true;
  p.sprinting = false;
  audio.sfx('launch', { pitch: 1.2, vol: 0.6 });
  world.style?.onEvent?.('chase', { target: tg });
  IMP.callout?.(world, p.cx, p.y - 18, J.chaseCallout ?? CHASE.callout, { color: CHASE.color });
  const fx = world.fx;
  fx?.burst('dust', p.cx, p.bottom - 2, 6, { angle: -PI / 2, spread: 1.1, speed: 120 });
  for (let i = 0; i < 3; i++) streak(fx, p.cx + rand(-16, 16), p.bottom - rand(10, 60), PI / 2, rand(50, 90), '#fff4d0', 0.14, 300);
  return true;
}
/** 추격 점프 뒤 첫 공중 공격의 체공 비율 (없으면 0) */
export function takeChaseStall(p) {
  const fm = p?.fm;
  if (!fm?.chaseNext || p.onGround) return 0;
  fm.chaseNext = false;
  return FH.JUGGLE?.chaseAirStall ?? CHASE.airStall;
}
/** 방향 전환 도중 공격 시작: 새 방향으로 바로 돌아서 친다 */
export function pivotCommit(p) {
  if (p?.moveFx !== 'pivot' || !p.fm?.pivotDir) return;
  p.facing = p.fm.pivotDir;
  endFx(p);
}

// ───────────────────────── 대시 연출 (feel §3.5) ─────────────────────────
function streak(fx, x, y, ang, len, color, life, speed, alpha = DASH_FX.lineAlpha) {
  if (!fx?.speedLine) return;
  fx.speedLine(x, y, ang, { len, width: DASH_FX.lineW, color, life, speed });
  const s = fx.list?.[fx.list.length - 1];
  if (s && s.shape === 'streak') s.alpha = alpha;
}
function ghostCap(world) { return DASH_FX.ghostCap[qKey(world)] ?? 4; }
function spawnGhost(p, world, tint) {
  const fm = p.fm, now = p.t;
  const G = fm.ghostEnd;
  for (let i = G.length - 1; i >= 0; i--) if (G[i] <= now) G.splice(i, 1);
  if (G.length >= ghostCap(world)) return false;
  G.push(now + DASH_FX.ghostLife);
  p.ghostTrail?.(world, tint, DASH_FX.ghostLife);
  return true;
}

export function dashFx(p, world, phase) {
  if (!p || !world?.fx) return;
  if (!p.fm) initFeel(p);
  const fm = p.fm, fx = world.fx;
  const type = p.ch?.move?.dash || 'dash';
  const D = DASH_FX[type] ?? DASH_FX.dash;
  const face = p.facing || 1, back = face > 0 ? PI : 0;
  if (phase === 'start') {
    p.sprinting = false; fm.sprintT = 0;
    if (p.moveFx && GROUND_FX.has(p.moveFx)) endFx(p);
    fm.dash = { type, t0: p.t, nextG: 0, nextL: 0, nextTrail: 0, ng: 0 };
    if (D.ring) fx.ering?.(p.cx - face * (type === 'roll' ? 0 : 16), type === 'roll' ? p.bottom - 2 : p.cy, { ...D.ring, width: 3, add: type !== 'roll' });
    if (D.dust) fx.burst('dust', p.cx, p.bottom, D.dust, { angle: back, spread: 0.6, speed: 160 });
    if (type === 'dash') {
      world.camera?.kick?.(-face * D.kick, 0);
      audio.sfx('dash_burst', { vol: 0.45, pitch: rand(0.95, 1.08) });
    } else if (type === 'blink') {
      const img = HFX.glow?.('#fff2b0');
      if (img) fx.sprite?.(img, p.cx, p.cy, { size: D.flash, life: 0.16, s0: 0.4, s1: 1.2 });
      spawnGhost(p, world, '#fff2b0');
    } else if (type === 'mist') {
      for (let i = 0; i < D.bats; i++) spawnBat(fx, p.cx + rand(-8, 8), p.cy - 10 + i * 8, -face * rand(120, 190), rand(-80, -20), 0.5, '#2a0612');
    }
    return;
  }
  const d = fm.dash;
  if (!d) return;
  const e = p.t - d.t0;
  if (phase === 'step') {
    // 간격은 누산 (0.035초 간격이면 60Hz 에서 2·2·3 프레임 … 평균 0.035초)
    if (D.ghosts === 'trail' && e >= d.nextG - 1e-6) {
      d.nextG = Math.max(d.nextG + (D.ghostEvery ?? DASH_FX.ghostEvery), e - 0.02);
      const col = D.ghostTint ?? mix(p.ch?.ult?.color ?? '#8ac8ff', '#ffffff', clamp(d.ng / 5, 0, 1));
      if (spawnGhost(p, world, col)) d.ng++;
    }
    if (D.lines && D.lineEvery && e >= d.nextL - 1e-6) {
      d.nextL = Math.max(d.nextL + D.lineEvery, e - 0.02);
      const n = Math.max(1, Math.round(D.lines * (fx.quality ?? 1)));
      for (let i = 0; i < n; i++) {
        streak(fx, p.cx + rand(-26, 30) * face, p.cy + rand(-DASH_FX.lineY, DASH_FX.lineY), back, rand(DASH_FX.lineLen[0], DASH_FX.lineLen[1]), D.lineColor, DASH_FX.lineLife, DASH_FX.lineSpeed);
      }
    }
    if (D.trailEvery && e >= d.nextTrail - 1e-6) {
      d.nextTrail = Math.max(d.nextTrail + D.trailEvery, e - 0.02);
      fx.emit('dust', p.cx - face * 8, p.bottom - 2, { angle: -PI / 2 - face * 0.8, spread: 0.5, speed: 50, size: 7 });
    }
    return;
  }
  if (phase === 'end') {
    if (type === 'dash') fx.burst('dust', p.cx, p.bottom - 2, D.endDust, { angle: -PI / 2, spread: 1.2, speed: 70 });
    else if (type === 'blink') { spawnGhost(p, world, '#ffffff'); fx.burst('holy', p.cx, p.cy, D.endSparkle, { speed: 110 }); }
    else if (type === 'mist') fx.burst('dark', p.cx, p.cy, D.endMist, { color: '#8a0a1e', speed: 60 });
    else if (type === 'roll' && D.endSkid && p.onGround && !(input.axisX === face && !world.cutscene && !world.inputLock)) {
      startFx(p, 'skid', SKID.rollSkidT, false);   // 모습만 (대시 거리는 예전 감속 그대로)
      fm.puffT = 0;
    }
    fm.dash = null;
  }
}

// ───────────────────────── 찌그러짐 스프링 · 가속 기울기 (physics 끝) ─────────────────────────
export function squashSpring(p, dt) {
  const f = p?.feel;
  if (!f || !(dt > 0)) return;
  const fm = p.fm;
  // 가속 기울기: 지상에서 속도가 바뀌는 만큼 앞(가속)/뒤(감속)로 기운다 (공격·대시·탑승 중엔 0)
  let tgt = 0;
  if (fm && p.onGround && !p.move && !(p.dashT > 0) && !p.mount?.riding) {
    const a = ((p.vx - fm.prevVx) / dt) * (p.facing || 1);
    tgt = clamp(a / SQUASH.accLeanDiv, SQUASH.accLeanMin, SQUASH.accLeanMax);
  }
  if (fm) fm.prevVx = p.vx;
  f.accLean += (tgt - f.accLean) * (1 - Math.exp(-dt / SQUASH.accLeanTau));
  if (f.leanKick > 0) { f.leanKick *= Math.exp(-dt * SQUASH.leanDecay); if (f.leanKick < 0.004) f.leanKick = 0; }
  if (f.sqHold > 0) { f.sqHold--; return; }   // 충격값을 넣은 스텝은 그 값 그대로 한 번 보인다
  const target = p.onGround ? 1 : 1 + clamp(Math.abs(p.vy || 0) / SQUASH.fallRef, 0, 1) * SQUASH.fallStretch;
  const w = SQUASH.omega, z = SQUASH.zeta;
  f.sqV += (-w * w * (f.sq - target) - 2 * z * w * f.sqV) * dt;
  f.sq = clamp(f.sq + f.sqV * dt, 0.6, 1.3);
  if (Math.abs(f.sq - target) < 1e-4 && Math.abs(f.sqV) < 1e-3) { f.sq = target; f.sqV = 0; }
}
