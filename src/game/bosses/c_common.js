// 2부 보스 공용 도구 (owner: BOSS-P2-KIT) — world2 §6.1, MASTER_PLAN §1.13 · §1.14
// 2부 보스(c_narkissa · c_moloch · c_dagon · c_ziz · d_mara · d_behemoth · d_nihil)가 함께 쓰는 논리 도우미.
// b_common.js(BossB) 는 고치지 않고 그 위에 얹는다. 그리기(채색 퍼핏)는 BossB 의 paintedTick/paintedDraw 훅이 그대로 맡는다.
//
// ── 쓰는 법 ───────────────────────────────────────────────────────────────────────────────
//  export class Moloch extends BossC { … }        BossC 는 BossB 를 상속한다 (instanceof BossB 그대로).
//   · 상태 s_<이름>(dt, world, t) 는 BossB 와 같다. 패턴이 끝나면 this.done(rest) → idle (휴식 = restTime(0.9–1.3)).
//   · 기본 s_idle: this.idleMove?.(dt, world, t) 를 부르고, 휴식이 끝나면 P2_PATTERNS[id].weights[phase] 가중치로 다음 패턴.
//     (s_<이름> 이 아직 없는 패턴은 고르지 않는다.) forceNext(name) 로 다음 패턴을 강제한다 (falseDawn · collapse 첫 진입).
//   · 페이즈 전환: onPhase(n) → enterTransition(n) → 전환 상태(P2_PATTERNS.transitions[n].state, 없으면 'phase<n>').
//     전환 상태에 s_ 메서드가 없으면 기본 transitionTick 이 돈다: 무적 dur 초, 중간(applyAt)에 applyPhase(k) · form2 이름 교체,
//     끝에서 페이즈 대사(스토리 모드 1회) 요청 → 대사가 끝나면 endTransition() → idle. 직접 s_<전환> 을 쓰면 그 안에서
//     this.transitionTick(dt, world, t) 를 부르거나, applyPhasesTo(n) · requestScriptsTo(n) · endTransition() 을 직접 부른다.
//   · 형태 복원: 플레이어가 부활하면(보스 체력 가득 + 플레이어 사망→생존) resetFight() 가 한 번 돈다:
//     패턴/전환/대사 대기열 취소 → def(이름·칭호·초상화) 원래대로 → resetArena(기믹·소환수·잔여 공격·어둠·화면 색조·음악)
//     → this.onReset?.(world) (보스 전용 되돌리기) → idle. 페이즈 0 에서 죽어도 돈다 (BossB 는 페이즈 > 0 일 때만).
//   · 디버그 규칙 (갤러리·테스트): debugAct(name) — 공격 패턴은 어느 페이즈에서든 강제 시작, 없는 상태는 경고 후 false,
//     전환 상태 이름이면 debugPhase 규칙으로 안전하게 들어간다 (형태 교체·대사는 한 번뿐). debugPhase(n) — BossB 그대로
//     (체력을 경계 아래로 → onPhase → skipTransition: 형태 즉시 적용, 대사는 대기열로). attackNames() · transitionNames().
//   · this.A (경기장)는 fixArena 로 보정된다: 가운데 열이 받침대인 방(몰록 제단)에서도 x0 < x1 (setup() 보다 먼저).
//  이 클래스를 쓰지 않고 BossB 를 직접 상속해도 아래 함수들은 모두 쓸 수 있다 (첫 인자 = 보스).
//
// ── 패턴 계약 ──  P2_PATTERNS[bossId] {attacks, helpers, transitions, weights, gimmicks, floorRow, room} · patternsOf(id, Cls)
//  · attackNamesOf(id, Cls) · transitionsOf(id, Cls). 클래스의 static PATTERNS 가 있으면 그 키가 이긴다 (얕은 병합).
//
// ── 페이즈 대사 (world2 §1.4 · §6.1, MASTER_PLAN §1.13) ────────────────────────────────────────
//  phaseScript(boss, id, {onEnd}) — 스토리 모드 · 처음 · SCRIPTS 에 있을 때만 대기열에 넣는다 (아니면 onEnd 를 바로 부르고 false).
//  pumpPhaseScripts(boss, world, dt) — 매 프레임 (BossC.update 가 부른다): world.cutscene(필살기·각성 컷인·다른 대사)·
//  freezeEnemies · transitioning · 플레이어 사망 중에는 미루고, 풀리면 dialogue 장면을 올린다 (seenScripts 기록, 대사 동안
//  world.cutscene = true). phaseScriptBusy(boss) — 대기 중이거나 보여 주는 중. cancelPhaseScripts(boss).
//
// ── 기믹 (world2 §3.2; world.gimmickOf 는 없으면 null) ────────────────────────────────────────
//  gimmickOf(world, kind) — null 안전. bossGimmick(boss, kind, {create}) — 방의 진짜 기믹, 없으면 보스 전용 대역(stand-in).
//  대역: 보스 러시 경기장(STAGES.arena)처럼 기믹이 없는 방에서도 패턴이 똑같이 돌게 하는 간이 기믹 (같은 API):
//   magma {level, setLevel(row, speed), atRest, reset} · deep {level, setWaterRow(row, tx0, tx1, time), inWater(e), reset}
//   wind {gusting, warning, dir, gust(dir, force, dur, warn), setAuto(on), reset} · voidwall {wallX, wallR, active, closeIn, open, reset}
//   blight {addCloud(x,y,w,h,life), spawnPod(tx,ty), cleanse, reset} · heartbeat {beat, beatIndex, setBeat(sec), reset}
//   대역은 g.standIn === true. 행(row)은 설계 방의 바닥 행(P2_PATTERNS.floorRow) 기준으로 실제 바닥에 맞춘다.
//  편의 함수 (적용되면 true): setMagma · magmaY · setWater · waterY · windGust · windAuto · windState · setBeat ·
//   sporeCloud · sporePod · wallsClose · wallsOpen · wallsX · mirrorFlip
//
// ── 경기장 되돌리기 (onReset: 벽 열기, 용암·물 원위치, 바람 방 설정대로(지즈 둥지 = 자동 꺼짐), 박동 기본값, 소환수 제거) ──
//  resetArena(world, boss, opts) · ARENA_RESET · spawnMinion(boss, ids, x, y, {max}) · minionsAlive · clearMinions · killTransients
//  darken(boss, add, dur) · screenTint(boss, {color, alpha, edge, dur}) · clearTints · muteMusic(boss, sec) · clearMood
//
// ── 예고(텔레그래프)와 공격 지대 (모두 b_common Zone: 적 정지 중 멈춤, 예고 동안 boss.telegraph 켜짐 = 카운터) ──
//  telegraph(boss, sec, {sfx}) · warnText(boss, text, color) · warnMark(boss, x, y, sec, color)
//  strikeRect · strikeColumn · strikeLine · strikeCircle · strikeFloor · ringWave · groundWave · pullField · nudgePlayer
//  공통 옵션: warn(예고 초) life(판정 초) mv element kb rehit color sfx(null = 무음) shake paint(덮어쓰기) onStart onEnd onHitP tick z
//
// 적 정지 규칙 (FEEL-BOSSHOOKS 요청): 이 파일이 만드는 개체는 update 첫 줄에서 heldByFreeze(world, 보스) 면 멈춘다.
// 순환 import 주의: 모듈 최상위에서는 import 값을 쓰지 않는다 (클래스 extends 는 b_*.js 와 같은 조건).
import { BossB, EL, glow, glowE, warnRect, warnLine, warnFloor, warnCircle, warnBang, trySpawn } from './b_common.js';
import { heldByFreeze } from './boss.js';
import { Entity } from '../entity.js';
import { enemyStrike } from '../combat.js';
import { TILE } from '../../core/game.js';
import { T } from '../../core/physics.js';
import { audio } from '../../core/audio.js';
import { TAU, clamp, rand, rgba, approach } from '../../core/math.js';
import { SCRIPTS } from '../../data/story.js';

const TS = 48;   // 타일 크기 (core/game.js TILE 과 같다 — 모듈 최상위에서는 import 값을 읽지 않는다)
const tile = () => TILE || TS;
const _warned = new Set();
function warnOnce(key, ...msg) { if (_warned.has(key)) return; _warned.add(key); console.warn(...msg); }
/** 기믹·도우미 호출 한 번을 감싼다: 예외는 게임을 멈추지 않고 콘솔 오류로 남긴다 (테스트가 잡는다) */
function safe(tag, fn, dflt = false) {
  try { return fn(); } catch (e) { console.error(`[c_common] ${tag}`, e); return dflt; }
}

// ═════════════════════════════ 패턴 계약 (world2 §6.2–6.8, §4.3 보스 방) ═════════════════════════════
/**
 * P2_PATTERNS[bossId] = {
 *   attacks: [공격 패턴 상태 이름…]  (테스트가 debugAct 로 모두 부른다)
 *   helpers: [보조 상태…]           (stun·kneel 등: 게임 진행으로만 들어가지만 debugAct 로 불러도 안전해야 한다)
 *   transitions: { n: { state, dur, script?, scriptAt?('end'|'start'), form2?, force?, applyAt? } }  페이즈 n 진입 전환
 *   weights: [ {패턴: 가중치} × (페이즈 수) ]   (페이즈 0 = P1)
 *   gimmicks: [방 기믹 종류]         (resetArena · 갤러리 대역)
 *   floorRow, room: {w, h, x0(경기장 첫 열), water?, magma?, beat?, solids: [[tx0, ty0, tx1, ty1], …]}  설계 방 (갤러리 가짜 맵)
 * }
 * 보스 클래스가 static PATTERNS 를 두면 그것을 먼저 쓴다 (같은 모양, 일부만 덮어써도 된다).
 */
export const P2_PATTERNS = {
  b_narkissa: {
    attacks: ['mirrorDive', 'reflectBeam', 'shardRain', 'armCombo', 'twinReflect', 'kaleido', 'thousandEyes', 'mirrorFall'],
    helpers: ['stun'],
    transitions: { 1: { state: 'shatter1', dur: 1.5 }, 2: { state: 'shatter', dur: 2.0, script: 'b_narkissa_shatter', form2: true } },
    weights: [
      { mirrorDive: 3, reflectBeam: 2, shardRain: 2, armCombo: 3 },
      { mirrorDive: 3, reflectBeam: 2, shardRain: 2, armCombo: 3, twinReflect: 3, kaleido: 2 },
      { thousandEyes: 3, mirrorFall: 2, mirrorDive: 2, kaleido: 2 },
    ],
    gimmicks: [],
    floorRow: 14,
    room: { w: 56, h: 16, x0: 17, solids: [[0, 14, 55, 15], [24, 9, 29, 9], [42, 9, 47, 9]] },
  },
  b_moloch: {
    attacks: ['hammer', 'tongs', 'pour', 'chimney', 'tide', 'furnaceBeam', 'souls', 'chains'],
    helpers: [],
    transitions: { 1: { state: 'phase1', dur: 1.4 }, 2: { state: 'hornbreak', dur: 1.8 } },
    weights: [
      { hammer: 3, tongs: 2, pour: 2, chimney: 2 },
      { tide: 2, furnaceBeam: 2, hammer: 2, pour: 2, chimney: 1 },
      { souls: 2, chains: 2, tide: 2, hammer: 2, furnaceBeam: 1 },
    ],
    gimmicks: ['magma'],
    floorRow: 14,
    room: { w: 56, h: 16, x0: 17, magma: 17, solids: [[0, 14, 55, 15], [22, 11, 24, 13], [34, 11, 36, 13], [46, 11, 48, 13], [28, 8, 31, 8], [40, 8, 43, 8]] },
  },
  b_dagon: {
    attacks: ['whirl', 'lure', 'organ', 'tentacle', 'flood', 'charge', 'choir'],
    helpers: ['stagger'],
    transitions: { 1: { state: 'phase1', dur: 1.4 }, 2: { state: 'phase2', dur: 1.6 } },
    weights: [
      { whirl: 2, lure: 2, organ: 3, tentacle: 3 },
      { flood: 2, charge: 3, organ: 2, tentacle: 2 },
      { choir: 2, flood: 1, charge: 2, organ: 2, lure: 2 },
    ],
    gimmicks: ['deep'],
    floorRow: 16,
    room: { w: 56, h: 18, x0: 21, water: 12, solids: [[0, 11, 20, 17], [21, 16, 55, 17], [26, 9, 30, 9], [36, 7, 40, 7], [46, 9, 50, 9], [32, 10, 33, 15], [43, 10, 44, 15]] },
  },
  b_ziz: {
    attacks: ['gust', 'bolts', 'talon', 'feathers', 'eyestorm', 'cyclone', 'crash'],
    helpers: [],
    transitions: { 1: { state: 'phase1', dur: 1.4 }, 2: { state: 'phase2', dur: 1.6 } },
    weights: [
      { gust: 2, bolts: 3, talon: 3, feathers: 2 },
      { eyestorm: 3, cyclone: 2, bolts: 2, talon: 2 },
      { crash: 3, eyestorm: 2, bolts: 2, gust: 2 },
    ],
    gimmicks: ['wind'],
    floorRow: 16,
    room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 27, 17], [32, 16, 43, 17], [48, 16, 59, 17], [22, 11, 26, 11], [34, 11, 39, 11], [50, 11, 54, 11]] },
  },
  b_mara: {
    attacks: ['lullaby', 'threads', 'dolls', 'scissors', 'cradleRush', 'faces', 'falseDawn', 'scream'],
    helpers: ['collapse'],
    transitions: { 1: { state: 'dreamshift', dur: 2.0, script: 'b_mara_dream', form2: true }, 2: { state: 'phase2', dur: 1.5, force: 'falseDawn' } },
    weights: [
      { lullaby: 3, threads: 2, dolls: 2, scissors: 3 },
      { cradleRush: 3, faces: 2, threads: 2, scissors: 2 },
      { scream: 3, cradleRush: 2, faces: 2, lullaby: 1 },
    ],
    gimmicks: ['heartbeat'],
    floorRow: 14,
    room: { w: 56, h: 16, x0: 17, beat: 4.0, solids: [[0, 14, 55, 15], [30, 9, 35, 9], [38, 9, 43, 9]] },
  },
  b_behemoth: {
    attacks: ['charge', 'roots', 'sporeBurst', 'stomp', 'queenThorns', 'husks', 'rotBreath', 'bloom'],
    helpers: ['kneel', 'stun'],
    transitions: { 1: { state: 'phase1', dur: 1.4 }, 2: { state: 'phase2', dur: 1.6 } },
    weights: [
      { charge: 3, roots: 2, sporeBurst: 2, stomp: 2 },
      { charge: 3, queenThorns: 3, husks: 1, roots: 2, stomp: 1 },
      { rotBreath: 3, bloom: 1, charge: 2, queenThorns: 2 },
    ],
    gimmicks: ['blight'],
    floorRow: 16,
    room: { w: 80, h: 18, x0: 17, solids: [[0, 16, 79, 17], [30, 13, 33, 15], [56, 13, 59, 15], [24, 10, 28, 10], [40, 10, 46, 10], [62, 10, 66, 10]] },
  },
  b_nihil: {
    attacks: ['palmEyes', 'erase', 'starfall', 'grasp', 'echoDracula', 'echoChaos', 'echoNarkissa', 'echoZiz', 'collapse', 'maw', 'lastLight'],
    helpers: [],
    transitions: {
      1: { state: 'form2', dur: 2.0, script: 'b_nihil_form2', form2: true },
      2: { state: 'phase2', dur: 1.6, force: 'collapse' },
      3: { state: 'final', dur: 2.2, script: 'b_nihil_final' },
    },
    weights: [
      { palmEyes: 3, erase: 2, starfall: 2, grasp: 2 },
      { echoDracula: 2, echoChaos: 2, echoNarkissa: 2, echoZiz: 2, palmEyes: 1 },
      { maw: 3, erase: 2, echoChaos: 1, starfall: 2 },
      { lastLight: 1 },
    ],
    gimmicks: ['voidwall'],
    floorRow: 16,
    room: { w: 60, h: 18, x0: 17, solids: [[0, 16, 59, 17], [24, 11, 28, 11], [46, 11, 50, 11], [34, 7, 40, 7]] },
  },
};
/** 보스 ID(또는 클래스의 static PATTERNS)의 패턴 계약. 없으면 빈 계약 */
export function patternsOf(id, Cls = null) {
  const base = P2_PATTERNS[id] ?? {};
  const own = Cls?.PATTERNS;
  return own ? { ...base, ...own } : base;
}
/** 공격 패턴 이름들 (전환 상태 제외) */
export function attackNamesOf(id, Cls = null) { return [...(patternsOf(id, Cls).attacks ?? [])]; }
/** 전환 상태 이름들 [{n, state, script?}] */
export function transitionsOf(id, Cls = null) {
  const tr = patternsOf(id, Cls).transitions ?? {};
  return Object.keys(tr).map((n) => ({ n: +n, ...tr[n] })).sort((a, b) => a.n - b.n);
}

// ═════════════════════════════ 페이즈 대사 대기열 ═════════════════════════════
function sq(boss) { return (boss._cScripts ??= { q: [], on: null, stuck: 0 }); }
/** 지금 이 대사를 보여 줄 수 있는가: 스토리 모드 · 아직 안 봄 · 대사가 있음 · 장면을 올릴 수 있음 */
export function canShowScript(world, id) {
  if (!id || !world || world.mode !== 'story' || !SCRIPTS[id]) return false;
  const seen = world.state?.progress?.seenScripts;
  if (Array.isArray(seen) && seen.includes(id)) return false;
  return typeof world.game?.push === 'function';
}
/** 페이즈 대사 요청. 대기열에 넣었으면 true, 보여 줄 수 없으면 onEnd 를 곧바로 부르고 false (아케이드: 대사 없이 진행) */
export function phaseScript(boss, id, { onEnd = null } = {}) {
  if (!boss) return false;
  const S = sq(boss);
  if (S.on?.id === id || S.q.some((j) => j.id === id)) return true;
  if (!canShowScript(boss.world, id)) { onEnd?.(); return false; }
  S.q.push({ id, onEnd });
  return true;
}
/** 대기 중이거나 보여 주는 중인가 */
export function phaseScriptBusy(boss) { const S = boss?._cScripts; return !!(S && (S.on || S.q.length)); }
/** 대기열 비우기 (부활·사망). 보여 주는 중인 대사는 그대로 끝난다 */
export function cancelPhaseScripts(boss) { const S = boss?._cScripts; if (S) S.q.length = 0; }
/** 매 프레임: 막는 것이 없으면 대기열 맨 앞 대사를 올린다. 올렸으면 true */
export function pumpPhaseScripts(boss, world = boss?.world, dt = 0) {
  const S = boss?._cScripts;
  if (!S || !world) return false;
  if (S.on) {
    // 대사가 비정상으로 닫혀 onEnd 가 오지 않았으면 (컷신이 아닌 채로 0.6초) 풀어 준다
    if (!world.cutscene) { S.stuck += dt; if (S.stuck > 0.6) { const j = S.on; S.on = null; S.stuck = 0; j.onEnd?.(); } }
    else S.stuck = 0;
    return false;
  }
  if (!S.q.length) return false;
  if (boss.dead || boss.dying > 0 || world.cleared) { S.q.length = 0; return false; }
  if (world.cutscene || world.transitioning || world.freezeEnemies || world.inputLock) return false;
  const p = world.player;
  if (!p || p.dead) return false;
  const job = S.q.shift();
  if (!canShowScript(world, job.id)) { job.onEnd?.(); return false; }
  const seen = world.state.progress.seenScripts;
  if (!seen.includes(job.id)) seen.push(job.id);
  world.banner = null;   // 대화 중엔 월드가 멈춰 배너가 초상화 위에 남는다 (world.playScript 와 같은 처리)
  S.on = job; S.stuck = 0;
  const ok = safe('phaseScript push', () => { world.game.push('dialogue', { script: job.id, world, onEnd: () => { if (S.on === job) S.on = null; job.onEnd?.(); } }); return true; });
  if (!ok) { S.on = null; job.onEnd?.(); }
  return ok;
}

// ═════════════════════════════ 기믹 (null 안전 + 대역) ═════════════════════════════
/** world.gimmickOf(kind) — 없거나 예외면 null */
export function gimmickOf(world, kind) {
  if (!world) return null;
  return safe('gimmickOf ' + kind, () => (typeof world.gimmickOf === 'function' ? world.gimmickOf(kind) : world.gimmick?.get?.(kind)) ?? null, null);
}
/**
 * 보스가 쓸 기믹: 방의 진짜 기믹 → 없으면 대역(boss.standIns !== false 일 때). create:false 면 새 대역은 만들지 않는다 (읽기용)
 */
export function bossGimmick(boss, kind, { create = true } = {}) {
  if (!boss) return null;
  const real = gimmickOf(boss.world, kind);
  if (real) return real;
  if (boss.standIns === false) return null;
  const S = (boss._cStandIns ??= {});
  const cur = S[kind];
  if (cur && !cur.dead) return cur;
  if (!create) return null;
  const K = STANDINS[kind];
  if (!K || !boss.world?.add) return null;
  return safe('standIn ' + kind, () => (S[kind] = boss.world.add(new K(boss))), null);
}
/** 설계 방의 행(row) → 이 방의 행 (바닥 행 기준으로 맞춤. 설계와 같은 방이면 그대로) */
export function mapRow(boss, row) {
  const fr = boss?.floorRow ?? boss?.p2?.floorRow;
  const A = boss?.A;
  if (!Number.isFinite(fr) || !A) return row;
  return row + (Math.round(A.floor / tile()) - fr);
}
/** 용암 수위: 설계 행 row 로 speed px/s 만큼씩. 적용되면 true */
export function setMagma(boss, row, speed = 120) {
  const g = bossGimmick(boss, 'magma');
  if (!g?.setLevel) return false;
  return safe('setMagma', () => { g.setLevel(g.standIn ? row : mapRow(boss, row), speed); return true; });
}
/** 용암 수면 y(px) 또는 null */
export function magmaY(boss) { const g = bossGimmick(boss, 'magma', { create: false }); return Number.isFinite(g?.level) ? g.level : null; }
/** 물 높이: 설계 행 row 까지 time 초에 걸쳐 (deep.setWaterRow). 적용되면 true */
export function setWater(boss, row, tx0 = 0, tx1 = Infinity, time = 3) {
  const g = bossGimmick(boss, 'deep');
  if (!g?.setWaterRow) return false;
  return safe('setWater', () => { g.setWaterRow(g.standIn ? row : mapRow(boss, row), tx0, tx1, time); return true; });
}
/** 경기장 가운데 열의 물 표면 y(px) 또는 null (진짜 deep 은 맵의 액체 칸, 대역은 level) */
export function waterY(boss) {
  const g = bossGimmick(boss, 'deep', { create: false });
  if (!g) return null;
  if (g.standIn) return g.level < g.A.floor - 1 ? g.level : null;
  const m = boss.world?.map, A = boss.A;
  if (!m?.tiles || !A) return null;
  const tx = clamp(Math.floor(A.cx / tile()), 0, m.w - 1);
  for (let ty = 0; ty < m.h; ty++) if (m.tiles[ty * m.w + tx] === T.LIQUID) return ty * tile();
  return null;
}
/** 돌풍 한 번 (wind.gust). 적용되면 true */
export function windGust(boss, dir, force = 900, dur = 2.5, warn = 0.8) {
  const g = bossGimmick(boss, 'wind');
  if (!g?.gust) return false;
  return safe('windGust', () => { g.gust(Math.sign(dir) || 1, force, dur, warn); return true; });
}
export function windAuto(boss, on) {
  const g = bossGimmick(boss, 'wind', { create: !!on });
  if (!g?.setAuto) return false;
  return safe('windAuto', () => { g.setAuto(!!on); return true; });
}
/** {gusting, warning, dir} 또는 null */
export function windState(boss) { const g = bossGimmick(boss, 'wind', { create: false }); return g ? { gusting: !!g.gusting, warning: !!g.warning, dir: g.dir ?? 1 } : null; }
/** 박동 간격 (heartbeat.setBeat). 적용되면 true */
export function setBeat(boss, sec) {
  const g = bossGimmick(boss, 'heartbeat');
  if (!g?.setBeat) return false;
  return safe('setBeat', () => { g.setBeat(sec); return true; });
}
/** 포자 구름 (blight.addCloud, px). 구름(또는 대역 구름) / null */
export function sporeCloud(boss, x, y, w, h, life = 5) {
  const g = bossGimmick(boss, 'blight');
  if (!g?.addCloud) return null;
  return safe('sporeCloud', () => g.addCloud(x, y, w, h, life), null);
}
/** 포자 주머니 (blight.spawnPod, 타일 좌표). 주머니 / null */
export function sporePod(boss, tx, ty, opts = {}) {
  const g = bossGimmick(boss, 'blight');
  if (!g?.spawnPod) return null;
  return safe('sporePod', () => g.spawnPod(tx, ty, opts), null);
}
/** 공허의 벽 조이기 (voidwall.closeIn, px). 적용되면 true */
export function wallsClose(boss, x0, x1, speed = 80) {
  const g = bossGimmick(boss, 'voidwall');
  if (!g?.closeIn) return false;
  return safe('wallsClose', () => !!g.closeIn(x0, x1, speed) || !!g.standIn);
}
export function wallsOpen(boss, speed = 120) {
  const g = bossGimmick(boss, 'voidwall', { create: false });
  if (!g?.open) return false;
  return safe('wallsOpen', () => { g.open(speed); return true; });
}
/** 지금 벽 안쪽 경계 {x0, x1} 또는 null (벽이 없거나 열려 있으면 null) */
export function wallsX(boss) {
  const g = bossGimmick(boss, 'voidwall', { create: false });
  if (!g || !(g.active ?? true)) return null;
  const x0 = g.wallX, x1 = g.wallR;
  return Number.isFinite(x0) && Number.isFinite(x1) ? { x0, x1 } : null;
}
/** 거울 뒤집기 (mirror.flip). 방에 거울이 없으면 false (대역 없음) */
export function mirrorFlip(boss, force = true) {
  const g = gimmickOf(boss?.world, 'mirror');
  if (!g?.flip) return false;
  return safe('mirrorFlip', () => !!g.flip(force));
}

// ───────────────────────────── 대역(stand-in) 기믹 ─────────────────────────────
// 보스 전용 간이 기믹: 개체(kind 'standin')로 월드에 들어가 스스로 갱신·그리기. BOSS_TRANSIENT 가 아니라 부활 때 지워지지 않는다.
// 적 정지 중 멈춤, 컷신 중 진행 멈춤(연출만), 시간 정지 ×0.25. 보스가 쓰러지면 스스로 원위치로 돌아간 뒤 사라진다.
class StandIn extends Entity {
  constructor(boss, gkind) {
    const A = boss.A;
    super(A.x0 - 240, (A.top ?? 0) - 120, A.w + 480, (A.floor - (A.top ?? 0)) + 120 + tile() * 3);
    this.kind = 'standin'; this.gkind = gkind; this.standIn = true;
    this.host = boss; this.world = boss.world;
    this.z = 6;
    this.hitId = 'cs' + gkind + (++_sid);
  }
  get A() { return this.host.A; }
  /** 설계 방 행 → y(px): 바닥 행(host.floorRow) 기준 */
  rowY(row) {
    const fr = this.host.floorRow ?? this.host.p2?.floorRow ?? Math.round(this.A.floor / tile());
    return this.A.floor + (row - fr) * tile();
  }
  get hostGone() { const h = this.host; return !!(h.dead || h.dying > 0 || h.world !== this.world); }
  update(dt, world) {
    if (this.host.dead && this.quiet) { this.dead = true; return; }
    if (heldByFreeze(world, this.host)) return;
    if (world.timeStop > 0) dt *= 0.25;
    this.t += dt;
    this.step(dt, world, !!world.cutscene);
  }
  step() {}
  /** 모두 멈춘 상태인가 (보스가 죽은 뒤 사라져도 되는가) */
  get quiet() { return true; }
  strike(world, rect, mv, extra = {}) {
    const h = this.host;
    if (!(mv > 0) || h.dying > 0 || h.dead) return false;
    return enemyStrike(world, rect, { owner: h, stats: h.stats, mv, kb: [260, -420], hitId: this.hitId, rehit: 0.7, tags: ['boss', 'standin'], dir: Math.sign((world.player?.cx ?? 0) - h.cx) || 1, ...extra });
  }
  /**
   * 진짜 기믹과 같은 지형 피해: 최대 체력의 frac 만큼 고정 피해 (방어 무시, 무적 시간 동안 한 번).
   * 보스 공격력으로 치면 보스 러시·서바이벌 경기장(대역만 쓰는 곳)에서 스토리보다 훨씬 아파진다 (용암 10% · 공허의 벽 15%)
   */
  hazard(world, frac, kb, element) {
    const p = world.player;
    if (!p || p.dead || p.invuln || world.cleared || this.hostGone) return false;
    p.takeHit(Math.ceil((p.stats?.hp ?? 100) * frac), { team: 'enemy', dir: Math.sign(kb[0]) || -p.facing, kb, flat: 1, element }, world, {});
    return true;
  }
}
let _sid = 0;

/** 용암 대역: manual 모드만 (setLevel). 수면 아래 몸이 잠기면 화염 피해 + 위로 튕김 */
class StandInMagma extends StandIn {
  constructor(boss) {
    super(boss, 'magma');
    this.restRow = boss.p2?.room?.magma ?? (boss.floorRow ?? Math.round(this.A.floor / tile())) + 3;
    this.lvSpeed = 120; this.emitAcc = 0;
    this.reset();
  }
  reset() { this.level = this.target = this.rowY(this.restRow); this.lvSpeed = 120; }
  setLevel(row, speed = 120) { this.target = this.rowY(row); this.lvSpeed = speed; if (!(speed > 0)) this.level = this.target; }
  setMode() { return false; }
  get atRest() { return Math.abs(this.level - this.target) < 1; }
  get quiet() { return this.atRest && this.level >= this.A.floor; }
  step(dt, world, paused) {
    if (this.hostGone) { this.target = this.rowY(this.restRow); this.lvSpeed = Math.max(this.lvSpeed, 120); }
    if (!paused) this.level = approach(this.level, this.target, (this.lvSpeed > 0 ? this.lvSpeed : 1e9) * dt);
    const A = this.A;
    if (this.level >= A.floor - 2) return;
    // 불씨 (품질 배율)
    this.emitAcc += dt * 14 * (world.fx?.quality ?? 1);
    while (this.emitAcc >= 1) { this.emitAcc -= 1; world.fx?.emit?.('ember', rand(A.x0, A.x1), this.level - 2, { speed: 60, angle: -Math.PI / 2, spread: 0.6 }); }
    // 진짜 용암(gimmicks.js magma.postPhysics)과 같은 규칙: 발이 수면 6px 아래로 잠기면 최대 체력 10% · 위로 튕김 (용암을 견디는 탈것은 무사)
    const p = world.player;
    if (!paused && p && !p.dead && p.bottom > this.level + 6 && p.cx > A.x0 - 200 && p.cx < A.x1 + 200 && !(p.mount?.riding && p.mount.hazard?.('lava', p, world))) {
      if (this.hazard(world, 0.10, [0, -760], 'fire')) world.fx?.burst?.('fire', p.cx, this.level, 10, { angle: -Math.PI / 2, spread: 0.8, speed: 160 });
    }
  }
  draw(ctx, world) {
    const A = this.A, y = this.level;
    if (y >= A.floor + 6) return;
    const x0 = A.x0 - 240, x1 = A.x1 + 240, bot = A.floor + tile() * 2, t = this.t;
    ctx.save();
    ctx.fillStyle = 'rgba(120,20,0,0.86)';
    ctx.beginPath();
    ctx.moveTo(x0, bot);
    for (let x = x0; x <= x1; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.02 + t * 2.4) * 4 + Math.sin(x * 0.053 - t * 1.7) * 2);
    ctx.lineTo(x1, bot); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,110,20,0.35)';
    ctx.fillRect(x0, y + 4, x1 - x0, Math.min(40, bot - y));
    ctx.strokeStyle = 'rgba(255,220,120,0.85)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 32) { const yy = y + Math.sin(x * 0.02 + t * 2.4) * 4 + Math.sin(x * 0.053 - t * 1.7) * 2; if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
    for (let i = 0; i < 6; i++) glowE(ctx, A.x0 + (A.w * (i + 0.5)) / 6, y + 6, 140, 26, EL.fire, 0.35);
    ctx.restore();
  }
  lights(L) { const A = this.A; if (this.level < A.floor) for (let i = 0; i < 3; i++) L.add(A.x0 + A.w * (i + 0.5) / 3, this.level, 260, EL.fire, 0.55); }
}

/** 물 대역: setWaterRow 로 수면만 오르내린다 (피해 없음, 수영 물리 없음). 설계 방의 기본 수위(room.water)에서 시작 */
class StandInWater extends StandIn {
  constructor(boss) {
    super(boss, 'deep');
    this.restRow = boss.p2?.room?.water ?? (boss.floorRow ?? Math.round(this.A.floor / tile())) + 3;
    this.air = 100;
    this.reset();
  }
  reset() { this.level = this.target = this.rowY(this.restRow); this.rate = 0; this.air = 100; }
  setWaterRow(row, tx0 = 0, tx1 = Infinity, time = 3) {
    this.target = this.rowY(row);
    this.rate = Math.abs(this.target - this.level) / Math.max(0.25, time || 0);
    return Math.round(Math.abs(this.target - this.level) / tile());
  }
  /** 개체가 물속인가 (발이 수면 아래 8px) */
  inWater(e) { return !!e && e.bottom > this.level + 8 && this.level < this.A.floor; }
  get inWaterPlayer() { return this.inWater(this.world?.player); }
  get quiet() { return Math.abs(this.level - this.target) < 1; }
  step(dt, world, paused) {
    if (this.hostGone) { this.target = this.rowY(this.restRow); this.rate = Math.max(this.rate, 60); }
    if (!paused && this.rate > 0) this.level = approach(this.level, this.target, this.rate * dt);
  }
  draw(ctx) {
    const A = this.A, y = this.level;
    if (y >= A.floor) return;
    const x0 = A.x0 - 240, x1 = A.x1 + 240, bot = A.floor + 2, t = this.t;
    ctx.save();
    ctx.fillStyle = 'rgba(8,38,66,0.62)';
    ctx.beginPath(); ctx.moveTo(x0, bot);
    for (let x = x0; x <= x1; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.025 + t * 1.8) * 3);
    ctx.lineTo(x1, bot); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(111,232,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 32) { const yy = y + Math.sin(x * 0.025 + t * 1.8) * 3; if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
    ctx.restore();
  }
}

/** 바람 대역: gust/setAuto. 불 때 플레이어를 옆으로 민다 (벽은 뚫지 않는다) */
class StandInWind extends StandIn {
  constructor(boss) {
    super(boss, 'wind');
    this.params = { force: 900, on: 2.5, off: 3.5, warn: 1.0, maxPush: 320 };
    this.z = 9;
    this.reset();
  }
  reset() { this.auto = false; this.dir = 1; this.force = this.params.force; this.onDur = this.params.on; this.phase = 'off'; this.pt = 0; this.dur = this.params.off; this.v = 0; }
  get gusting() { return this.phase === 'on'; }
  get warning() { return this.phase === 'warn'; }
  get quiet() { return this.phase === 'off' && !this.auto; }
  enter(phase, dur) {
    this.phase = phase; this.pt = 0; this.dur = Math.max(0, dur);
    if (phase === 'warn') audio.sfx('mist', { pitch: 0.6 });
    else if (phase === 'on') audio.sfx('whip', { pitch: 0.4 });
  }
  gust(dir = this.dir, force = this.params.force, dur = this.params.on, warn = 0.8) {
    this.dir = Math.sign(dir) || 1; this.force = force; this.onDur = dur;
    if (warn > 0) this.enter('warn', warn); else this.enter('on', dur);
    return true;
  }
  setAuto(on) { this.auto = !!on; }
  step(dt, world, paused) {
    if (this.hostGone) { this.auto = false; if (this.phase !== 'off') this.enter('off', 0); }
    if (paused) return;
    this.pt += dt;
    if (this.pt >= this.dur) {
      if (this.phase === 'warn') this.enter('on', this.onDur);
      else if (this.phase === 'on') this.enter('off', this.params.off);
      else if (this.auto) { this.dir = -this.dir; this.enter('warn', this.params.warn); }
      else this.pt = this.dur;
    }
    const want = this.gusting ? this.dir * Math.min(this.params.maxPush, this.force * 0.36) : 0;
    this.v = approach(this.v, want, Math.max(600, this.force) * dt);
    if (Math.abs(this.v) > 1) nudgePlayer(world, this.v * dt, 0);
  }
  draw(ctx, world) {
    if (this.phase === 'off' && Math.abs(this.v) < 5) return;
    const cam = world.camera;
    if (!cam) return;
    const vw = cam.vw ?? cam.w, vh = cam.vh ?? cam.h;
    const q = world.fx?.quality ?? 1;
    const n = Math.round((this.gusting ? 22 : 8) * q);
    const a = this.gusting ? 0.32 : 0.14 + 0.12 * Math.sin(this.t * 20);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(220,240,255,${a.toFixed(3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const sp = this.gusting ? 1400 : 500, span = vw + 400;
    for (let i = 0; i < n; i++) {
      const h1 = hash01(i * 3.1 + 1), h2 = hash01(i * 7.7 + 2);
      let x = ((h1 * span + this.t * sp * (0.7 + h2 * 0.6)) % span) - 200;
      if (this.dir < 0) x = vw - x;
      const y = cam.y + h2 * vh, L = 60 + h1 * 120;
      ctx.moveTo(cam.x + x, y); ctx.lineTo(cam.x + x - this.dir * L, y + Math.sin(this.t * 3 + i) * 6);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** 공허의 벽 대역 (경기장 모드): closeIn/open. 벽 속에 들어가면 피해 + 안으로 밀어낸다 */
class StandInWalls extends StandIn {
  constructor(boss) { super(boss, 'voidwall'); this.mode = 'arena'; this.z = 8; this.reset(); }
  reset() { const A = this.A; this.wallX = A.x0; this.wallR = A.x1; this.tgtL = A.x0; this.tgtR = A.x1; this.moveSpeed = 80; this.active = false; this.opening = false; }
  closeIn(x0, x1, speed = 80) {
    const A = this.A;
    if (!this.active) { this.wallX = A.x0; this.wallR = A.x1; }
    this.tgtL = clamp(Number(x0) || A.x0, A.x0, A.x1);
    this.tgtR = clamp(Number(x1) || A.x1, Math.min(A.x1, this.tgtL + 2 * tile()), A.x1);
    this.moveSpeed = Math.max(1, Number(speed) || 80); this.active = true; this.opening = false;
    audio.sfx('thunderclap', { pitch: 0.45, vol: 0.4 });
    this.world?.camera?.shake?.(4, 0.4);
    return true;
  }
  open(speed = 120) {
    if (!this.active) return false;
    const A = this.A;
    this.tgtL = A.x0; this.tgtR = A.x1; this.moveSpeed = Math.max(1, Number(speed) || 120); this.opening = true;
    return true;
  }
  get quiet() { return !this.active; }
  step(dt, world, paused) {
    if (this.hostGone && this.active && !this.opening) this.open(160);
    if (!this.active || paused) return;
    this.wallX = approach(this.wallX, this.tgtL, this.moveSpeed * dt);
    this.wallR = approach(this.wallR, this.tgtR, this.moveSpeed * dt);
    if (this.opening && this.wallX <= this.A.x0 + 0.5 && this.wallR >= this.A.x1 - 0.5) { this.active = false; this.opening = false; return; }
    const p = world.player;
    if (!p || p.dead) return;
    const hb = p.hurtbox?.() ?? p;
    const inL = hb.x < this.wallX, inR = hb.x + hb.w > this.wallR;
    if (!inL && !inR) return;
    const dir = inL ? 1 : -1;
    this.hazard(world, 0.15, [dir * 520, -380], 'dark');   // 진짜 공허의 벽(gimmicks_b voidwall.hurt)과 같은 15% 고정 피해
    nudgePlayer(world, dir * Math.min(24, Math.abs(inL ? this.wallX - hb.x : hb.x + hb.w - this.wallR) + 2), 0);
  }
  draw(ctx, world) {
    if (!this.active) return;
    const A = this.A, top = (A.top ?? 0) - 200, bot = A.floor + tile() * 3, t = this.t;
    ctx.save();
    for (const side of [-1, 1]) {
      const edge = side < 0 ? this.wallX : this.wallR;
      const far = side < 0 ? A.x0 - 300 : A.x1 + 300;
      const x = Math.min(edge, far), w = Math.abs(edge - far);
      if (w < 1) continue;
      ctx.fillStyle = '#020006';
      ctx.fillRect(x, top, w, bot - top);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 26; i++) {
        const sx = x + hash01(i * 5.3 + side) * w, sy = top + hash01(i * 9.1 - side) * (bot - top);
        const s = 1 + ((i * 7) % 3);
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + i);
        ctx.fillRect(sx, sy, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      const cols = ['#ff60c0', '#60c0ff', '#ffffff'];
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = rgba(cols[k], 0.55 - k * 0.12);
        ctx.lineWidth = 3 - k;
        ctx.beginPath();
        for (let y = top; y <= bot; y += 24) { const xx = edge + Math.sin(y * 0.04 + t * 3 + k) * (4 + k * 2); if (y === top) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); }
        ctx.stroke();
      }
      glowE(ctx, edge, (top + bot) / 2, 40, (bot - top) / 2, '#c0a0ff', 0.4);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
}

/** 부패 대역: 포자 구름(독 지대 mv 0.3)과 포자 주머니(2초 뒤 또는 가까이 가면 터져 구름) */
class StandInBlight extends StandIn {
  constructor(boss) { super(boss, 'blight'); this.meter = 0; this.status = false; this.clouds = []; this.pods = []; this.emitAcc = 0; }
  addCloud(x, y, w, h, life = 5) {
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
    if (this.clouds.length >= 10) this.clouds.shift();
    const c = { x, y, w, h, life: Math.max(0.3, Number(life) || 5), age: 0, seed: Math.random() * 100 };
    this.clouds.push(c);
    return c;
  }
  spawnPod(tx, ty) {
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || this.pods.length >= 8) return null;
    const T_ = tile();
    const pod = { x: tx * T_ + T_ / 2, y: Math.min((ty + 1) * T_, this.A.floor), age: 0, fuse: 2.2, burst: false };
    this.pods.push(pod);
    return pod;
  }
  cleanse() { return false; }
  healMul() { return 1; }
  reset() { this.clouds.length = 0; this.pods.length = 0; this.meter = 0; this.status = false; }
  get quiet() { return !this.clouds.length && !this.pods.length; }
  step(dt, world, paused) {
    if (this.hostGone) { for (const c of this.clouds) c.life = Math.min(c.life, c.age + 1); this.pods.length = 0; }
    if (paused) return;
    const p = world.player, hb = p && !p.dead ? (p.hurtbox?.() ?? p) : null;
    for (const pod of this.pods) {
      pod.age += dt;
      const near = hb && Math.abs(hb.x + hb.w / 2 - pod.x) < 60 && Math.abs(hb.y + hb.h - pod.y) < 80;
      if (pod.age >= pod.fuse || (near && pod.age > 0.6)) {
        pod.burst = true;
        this.addCloud(pod.x - 90, pod.y - 130, 180, 130, 4.5);
        world.fx?.burst?.('soul', pod.x, pod.y - 20, 10, { color: '#b8e04a', speed: 140 });
        audio.sfx('mist', { pitch: 0.8, vol: 0.5 });
      }
    }
    this.pods = this.pods.filter((q) => !q.burst);
    for (const c of this.clouds) c.age += dt;
    this.clouds = this.clouds.filter((c) => c.age < c.life);
    if (!hb || this.hostGone) return;
    for (const c of this.clouds) {
      if (c.age < 0.15 || c.life - c.age < 0.4) continue;
      if (hb.x < c.x + c.w && hb.x + hb.w > c.x && hb.y < c.y + c.h && hb.y + hb.h > c.y) { this.strike(world, hb, 0.3, { kb: [0, 0], rehit: 0.6, hitstop: 0 }); break; }
    }
  }
  draw(ctx) {
    if (!this.clouds.length && !this.pods.length) return;
    ctx.save();
    for (const c of this.clouds) {
      const a = clamp(Math.min(c.age / 0.3, (c.life - c.age) / 1), 0, 1) * 0.6;
      if (a <= 0.01) continue;
      for (let i = 0; i < 5; i++) {
        const u = hash01(c.seed + i * 3.7), v = hash01(c.seed + i * 5.9);
        glowE(ctx, c.x + c.w * (0.15 + u * 0.7) + Math.sin(this.t + i) * 6, c.y + c.h * (0.25 + v * 0.5), c.w * 0.38, c.h * 0.42, '#8ab82e', a);
      }
    }
    for (const pod of this.pods) {
      const k = clamp(pod.age / pod.fuse, 0, 1), r = 10 + 8 * k + Math.sin(pod.age * 18) * 2 * k;
      ctx.fillStyle = '#4a5a20'; ctx.strokeStyle = '#1a1406'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(pod.x, pod.y - r, r * 0.9, r, 0, 0, TAU); ctx.fill(); ctx.stroke();
      glow(ctx, pod.x, pod.y - r, r * 2.4, '#c8f060', 0.3 + 0.5 * k);
    }
    ctx.restore();
  }
  lights(L) { for (const c of this.clouds) L.add(c.x + c.w / 2, c.y + c.h / 2, Math.max(c.w, c.h) * 0.6, '#9ad040', 0.25); }
}

/** 박동 대역: 박자만 센다 (z/Z 칸이 없는 방). beatIndex · setBeat · reset */
class StandInBeat extends StandIn {
  constructor(boss) { super(boss, 'heartbeat'); this.baseBeat = Math.max(0.4, boss.p2?.room?.beat ?? 4); this.warn = 0.8; this.reset(); }
  reset() { this.beat = this.baseBeat; this.timer = 0; this.beatIndex = 0; this.sinceBeat = 9; }
  setBeat(sec) { this.beat = Math.max(0.4, Number(sec) || this.baseBeat); if (this.timer > this.beat) this.timer = this.beat; return this.beat; }
  get warning() { return this.warn > 0 && this.timer >= this.beat - this.warn; }
  get quiet() { return true; }
  step(dt, world, paused) {
    this.sinceBeat += dt;
    if (paused || this.hostGone) return;
    this.timer += dt;
    if (this.timer >= this.beat) { this.timer -= this.beat; this.beatIndex++; this.sinceBeat = 0; audio.sfx('hit_heavy', { pitch: 0.45, vol: 0.35 }); }   // 진짜 heartbeat 기믹과 같은 쿵 ('heartbeat' 효과음은 없다)
  }
  pulse() { return Math.max(0, 1 - this.sinceBeat / 0.3); }
}

const STANDINS = { magma: StandInMagma, deep: StandInWater, wind: StandInWind, voidwall: StandInWalls, blight: StandInBlight, heartbeat: StandInBeat };
export const STANDIN_KINDS = Object.freeze(['magma', 'deep', 'wind', 'voidwall', 'blight', 'heartbeat']);
const hash01 = (n) => { const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };

// ═════════════════════════════ 경기장 되돌리기 · 소환수 · 분위기 ═════════════════════════════
const TRANSIENT = new Set(['projectile', 'hitbox', 'effect', 'hazard', 'zone']);
/** resetArena 기본값: 방에 있는 기믹(과 대역)을 모두 되돌린다. wind: 'off' 면 되돌린 뒤 자동 돌풍도 끈다 */
export const ARENA_RESET = Object.freeze({ walls: true, magma: true, water: true, wind: true, beat: true, blight: true, mirror: true, minions: true, transients: true, mood: true, scripts: true });
const RESET_KINDS = [['walls', 'voidwall'], ['magma', 'magma'], ['water', 'deep'], ['wind', 'wind'], ['beat', 'heartbeat'], ['blight', 'blight'], ['mirror', 'mirror']];
/**
 * 부활·재도전 때 경기장을 페이즈 0 상태로: 벽 열기, 용암·물 원위치, 바람 방 설정대로, 박동 기본값, 포자 구름 제거,
 * 소환수 제거, 보스가 남긴 탄·지대 제거, 어둠·화면 색조·음악 되돌리기, 페이즈 대사 대기열 비우기.
 */
export function resetArena(world, boss, opts = {}) {
  const o = { ...ARENA_RESET, ...(opts || {}) };
  for (const [key, kind] of RESET_KINDS) {
    if (!o[key]) continue;
    for (const m of [gimmickOf(world, kind), boss?._cStandIns?.[kind]]) {
      if (!m || m.dead) continue;
      safe('reset ' + kind, () => m.reset?.());
      if (kind === 'wind' && o.wind === 'off') safe('wind off', () => m.setAuto?.(false));
    }
  }
  if (!boss) return;
  if (o.minions) clearMinions(boss, { fx: false });
  if (o.transients) killTransients(world, boss);
  if (o.mood) clearMood(world, boss);
  if (o.scripts) cancelPhaseScripts(boss);
}
/** 보스가 남긴 탄·판정·지대·효과 제거 (대역 기믹은 남긴다) */
export function killTransients(world, boss) {
  for (const e of world?.entities ?? []) {
    if (e === boss || e.dead || !TRANSIENT.has(e.kind)) continue;
    if (e.owner === boss || e.boss === boss || e.attack?.owner === boss) e.dead = true;
  }
}
/** 소환 (trySpawn 의 첫 정의된 ID). max = 이 보스가 부른 소환수 동시 상한. 소환수 / null */
export function spawnMinion(boss, ids, x, y, { max = Infinity, ...opts } = {}) {
  if (!boss?.world) return null;
  if (minionsAlive(boss) >= max) return null;
  const e = trySpawn(boss.world, Array.isArray(ids) ? ids : [ids], x, y, { elite: false, ...opts });
  if (e) { e.summoner = boss; boss._cMinions.push(e); }
  return e;
}
/** 살아 있는 소환수 수 */
export function minionsAlive(boss) {
  const L = (boss._cMinions ??= []);
  for (let i = L.length - 1; i >= 0; i--) if (L[i].dead || L[i].dying > 0) L.splice(i, 1);
  return L.length;
}
/** 소환수 모두 없애기 (전리품·경험치 없음). fx: 사라지는 연기 */
export function clearMinions(boss, { fx = true } = {}) {
  const w = boss?.world;
  for (const e of w?.entities ?? []) {
    if (e.dead || e === boss || e.kind === 'player') continue;
    if (e.summoner !== boss && !(boss._cMinions ?? []).includes(e)) continue;
    e.dead = true;
    if (fx) { w.fx?.burst?.('smoke', e.cx, e.cy, 8, { speed: 120 }); w.fx?.burst?.('dark', e.cx, e.cy, 6, { speed: 140 }); }
  }
  if (boss) boss._cMinions = [];
}
/** 어둠 더하기: dur 초 동안 lighting.darkness += add (끝나면 되돌린다. 여러 개가 겹쳐도 원래 값으로) */
export function darken(boss, add, dur = 4) {
  const L = boss?.world?.lighting;
  if (!L) return false;
  const D = (boss._cDark ??= { base: null, list: [] });
  if (D.base === null) D.base = L.darkness;
  D.list.push({ add: Number(add) || 0, t: Math.max(0.05, Number(dur) || 0) });
  applyDark(boss);
  return true;
}
function applyDark(boss) {
  const D = boss._cDark, L = boss.world?.lighting;
  if (!D || D.base === null || !L) return;
  let s = 0;
  for (const d of D.list) s += d.add;
  L.darkness = clamp(D.base + s, 0, 0.92);
  if (!D.list.length) D.base = null;
}
function tickDark(boss, dt) {
  const D = boss._cDark;
  if (!D?.list.length) return;
  for (const d of D.list) d.t -= dt;
  const n = D.list.length;
  D.list = D.list.filter((d) => d.t > 0);
  if (D.list.length !== n) applyDark(boss);
}
const TINT_CACHE = new Map();
function edgeSprite(color) {
  let c = TINT_CACHE.get(color);
  if (c) return c;
  c = typeof document !== 'undefined' ? document.createElement('canvas') : (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null);
  if (!c) return null;
  c.width = 256; c.height = 144;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 72, 30, 128, 72, 150);
  gr.addColorStop(0, rgba(color, 0)); gr.addColorStop(0.55, rgba(color, 0.12)); gr.addColorStop(1, rgba(color, 0.75));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 144);
  TINT_CACHE.set(color, c);
  return c;
}
/**
 * 화면 색조 (world.overlays): {color, alpha, edge(가장자리 색, 역비네트), dur(초, 없으면 clearTints 까지), fade}
 * 마라 dreamshift: screenTint(boss, { color: '#3c005a', alpha: 0.25, edge: '#b070ff' })
 */
export function screenTint(boss, { color = '#3c005a', alpha = 0.25, edge = null, dur = null, fade = 0.5 } = {}) {
  const w = boss?.world;
  if (!w?.addOverlay) return null;
  const o = {
    owner: boss, cTint: true, t: 0, end: null,
    life: dur ? dur + fade : undefined,
    draw(ctx, vw, vh) {
      let k = clamp(this.t / Math.max(0.01, fade), 0, 1);
      if (dur) k *= clamp((dur + fade - this.t) / Math.max(0.01, fade), 0, 1);
      if (this.end !== null) k *= clamp(1 - (this.t - this.end) / Math.max(0.01, fade), 0, 1);
      if (k <= 0.003) return;
      ctx.globalAlpha = k * alpha; ctx.fillStyle = color; ctx.fillRect(0, 0, vw, vh);
      if (edge) { const s = edgeSprite(edge); if (s) { ctx.globalAlpha = k; ctx.drawImage(s, 0, 0, vw, vh); } }
      ctx.globalAlpha = 1;
    },
    update() { if (this.end !== null && this.t - this.end > fade) this.dead = true; },
  };
  return w.addOverlay(o);
}
/** 이 보스의 화면 색조 끄기 (soft = 페이드) */
export function clearTints(world, boss, { soft = false } = {}) {
  for (const o of world?.overlays ?? []) {
    if (o.owner !== boss || !o.cTint || o.dead) continue;
    if (soft) { if (o.end === null) o.end = o.t; } else o.dead = true;
  }
}
/** 음악 sec 초 멈춤 (falseDawn). 끝나면 보스 음악으로 */
export function muteMusic(boss, sec = 1) {
  if (!boss) return;
  audio.stopMusic?.(0.1);
  boss._cMute = Math.max(boss._cMute ?? 0, Number(sec) || 1);
}
function tickMute(boss, dt) {
  if (!(boss._cMute > 0)) return;
  boss._cMute -= dt;
  if (boss._cMute <= 0) { boss._cMute = 0; if (!boss.world?.cleared) audio.music?.(boss.def0?.music ?? boss.def?.music ?? 'boss'); }
}
/** 어둠·색조·음악 되돌리기 (부활·사망) */
export function clearMood(world, boss, { soft = false } = {}) {
  const D = boss?._cDark;
  if (D) { D.list.length = 0; applyDark(boss); }
  clearTints(world, boss, { soft });
  if (boss?._cMute > 0) { boss._cMute = 0; if (!soft && !world?.cleared) audio.music?.(boss.def0?.music ?? boss.def?.music ?? 'boss'); }
}

// ═════════════════════════════ 예고 · 공격 지대 ═════════════════════════════
/** 예고(윈드업) sec 초: 카운터 창을 열고 경고음 (sfx: null 이면 무음) */
export function telegraph(boss, sec, { sfx = 'warning', vol = 0.45, pitch = 1 } = {}) {
  if (!boss) return;
  boss.telegraphFor?.(sec);
  if (sfx) audio.sfx(sfx, { vol, pitch });
}
/** 화면 위쪽 가운데 경고 글자 (예: '용암이 차오른다!') */
export function warnText(boss, text, color = '#ffb070') {
  const w = boss?.world, cam = w?.camera;
  if (!w?.fx?.text) return;
  const x = cam ? cam.x + (cam.vw ?? cam.w) / 2 : boss.cx, y = cam ? cam.y + (cam.vh ?? cam.h) * 0.3 : boss.y - 30;
  w.fx.text(x, y, text, { color, size: 28, life: 1.6, vy: -24 });
}
/** (x, y) 에 느낌표 경고 표시 sec 초 (판정 없음) */
export function warnMark(boss, x, y, sec = 0.8, color = '#ff3a40') {
  return boss.zone({ x: x - 20, y: y - 20, w: 40, h: 40, warn: 0, life: sec, harmless: true, z: 9,
    paint: (ctx, z) => warnBang(ctx, x, y - 6 * Math.sin(z.t * 10), 18, clamp((sec - z.t) / 0.2, 0, 1), color) });
}
const bb = (x0, y0, x1, y1, pad) => ({ x: Math.min(x0, x1) - pad, y: Math.min(y0, y1) - pad, w: Math.abs(x1 - x0) + pad * 2, h: Math.abs(y1 - y0) + pad * 2 });
function zoneBase(o, extra) {
  return { warn: o.warn ?? 0.8, life: o.life ?? 0.25, mv: o.mv ?? 1, element: o.element ?? null, kb: o.kb, rehit: o.rehit, z: o.z ?? 6,
    onEnd: o.onEnd, onHitP: o.onHitP, attack: o.attack, data: o.data, ...extra };
}
function startFx(o, world, dflt, extra) {
  if (o.sfx !== null) audio.sfx(o.sfx ?? dflt, { vol: o.vol ?? 0.7, pitch: o.pitch ?? 1 });
  if (o.shake) world.camera?.shake?.(o.shake, 0.25);
  extra?.();
}
/** 사각 지대: 예고(warnRect) → 판정 (섬광 판) */
export function strikeRect(boss, r, o = {}) {
  const col = o.color ?? '#ff3040';
  return boss.zone(zoneBase(o, {
    x: r.x, y: r.y, w: r.w, h: r.h,
    tick: o.tick,
    onStart: (z, w) => { startFx(o, w, 'slash_heavy'); o.onStart?.(z, w); },
    paint: o.paint ?? ((ctx, z, w) => {
      if (!z.started) { warnRect(ctx, z.x, z.y, z.w, z.h, z.k, col, w.time); return; }
      const f = 1 - z.a;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(col, 0.5 * f); ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.fillStyle = rgba('#ffffff', 0.45 * f); ctx.fillRect(z.x + z.w * 0.1, z.y + z.h * 0.35, z.w * 0.8, Math.max(2, z.h * 0.3));
    }),
  }));
}
/** 세로 기둥 (낙뢰·파편 비): x 중심, w 폭, top~bottom (기본: 경기장 천장~바닥) */
export function strikeColumn(boss, x, o = {}) {
  const A = boss.A, w = o.w ?? 60, top = o.top ?? (A.top ?? 0), bottom = o.bottom ?? A.floor;
  const col = o.color ?? (o.element ? EL[o.element] : null) ?? '#bfe0ff';
  return boss.zone(zoneBase(o, {
    x: x - w / 2, y: top, w, h: bottom - top, life: o.life ?? 0.35,
    tick: o.tick,
    onStart: (z, wd) => { startFx(o, wd, o.element === 'thunder' ? 'thunderclap' : 'slash', () => wd.fx?.burst?.(o.element === 'thunder' ? 'thunder' : 'spark', x, bottom - 6, 8, { speed: 240 })); o.onStart?.(z, wd); },
    paint: o.paint ?? ((ctx, z, wd) => {
      if (!z.started) { warnRect(ctx, z.x + z.w * 0.2, z.y, z.w * 0.6, z.h, z.k * 0.8, col, wd.time); warnFloor(ctx, x, bottom, w * 1.4, z.k, col, wd.time); return; }
      const f = 1 - z.a;
      glowE(ctx, x, (top + bottom) / 2, w * 0.9, (bottom - top) / 2, col, 0.8 * f);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#ffffff', 0.85 * f); ctx.fillRect(x - w * 0.12, top, w * 0.24, bottom - top);
    }),
    light: (L, z) => { if (z.on) L.add(x, bottom - 60, 180, col, 0.8 * (1 - z.a)); },
  }));
}
/** 선분 판정 (광선·가위): 예고(warnLine) → 굵기 th 광선. o.track(z, world) 로 예고 중 끝점을 바꿀 수 있다 (z.line 수정) */
export function strikeLine(boss, x0, y0, x1, y1, o = {}) {
  const th = o.th ?? 22, col = o.color ?? '#ff4060';
  const line = { x0, y0, x1, y1, th };
  const box = bb(x0, y0, x1, y1, th);
  return boss.zone(zoneBase(o, {
    ...box, line, life: o.life ?? 0.4,
    tick: (z, w, dt) => {
      if (!z.started && o.track) { o.track(z, w, dt); const b = bb(z.line.x0, z.line.y0, z.line.x1, z.line.y1, th); z.x = b.x; z.y = b.y; z.w = b.w; z.h = b.h; }
      o.tick?.(z, w, dt);
    },
    onStart: (z, w) => { startFx(o, w, o.element === 'thunder' ? 'thunder' : 'magic'); o.onStart?.(z, w); },
    paint: o.paint ?? ((ctx, z, w) => {
      const L = z.line;
      if (!z.started) { warnLine(ctx, L.x0, L.y0, L.x1, L.y1, z.k, col, Math.max(1.5, th * 0.12)); return; }
      const f = 1 - z.a;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(col, 0.55 * f); ctx.lineWidth = th * 1.7;
      ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.9 * f); ctx.lineWidth = Math.max(2, th * 0.35);
      ctx.beginPath(); ctx.moveTo(L.x0, L.y0); ctx.lineTo(L.x1, L.y1); ctx.stroke();
    }),
  }));
}
/** 원형 판정: 예고(warnCircle) → 폭발 */
export function strikeCircle(boss, x, y, r, o = {}) {
  const col = o.color ?? '#ff7a2a';
  return boss.zone(zoneBase(o, {
    x: x - r, y: y - r, w: r * 2, h: r * 2, circle: { x, y, r }, life: o.life ?? 0.3,
    tick: o.tick,
    onStart: (z, w) => { startFx(o, w, 'explode', () => { w.fx?.ring?.(x, y, { color: col, r0: r * 0.3, r1: r * 1.3, life: 0.35, width: 6 }); w.fx?.burst?.(o.burstFx ?? 'ember', x, y, 10, { speed: 260 }); }); o.onStart?.(z, w); },
    paint: o.paint ?? ((ctx, z, w) => {
      if (!z.started) { warnCircle(ctx, x, y, r, z.k, col, w.time); return; }
      const f = 1 - z.a;
      glow(ctx, x, y, r * 1.6, col, 0.9 * f, true);
    }),
    light: (L, z) => { if (z.on) L.add(x, y, r * 2.4, col, 0.9 * (1 - z.a)); },
  }));
}
/** 바닥 분출: x 중심 w 폭 h 높이 (예고 warnFloor → 솟는 기둥) */
export function strikeFloor(boss, x, o = {}) {
  const A = boss.A, w = o.w ?? 80, h = o.h ?? 120, floor = o.floor ?? A.floor;
  const col = o.color ?? '#ff5030';
  return boss.zone(zoneBase(o, {
    x: x - w / 2, y: floor - h, w, h, warn: o.warn ?? 0.7, life: o.life ?? 0.4,
    tick: o.tick,
    onStart: (z, wd) => { startFx(o, wd, 'explode', () => { wd.fx?.burst?.(o.burstFx ?? 'dust', x, floor - 4, 10, { speed: 220, angle: -Math.PI / 2, spread: 0.7 }); }); o.onStart?.(z, wd); },
    paint: o.paint ?? ((ctx, z, wd) => {
      if (!z.started) { warnFloor(ctx, x, floor, w, z.k, col, wd.time); return; }
      const k = z.a < 0.2 ? z.a / 0.2 : 1, f = 1 - Math.max(0, (z.a - 0.5) / 0.5);
      const hh = h * k;
      glowE(ctx, x, floor - hh / 2, w * 0.7, hh / 2 + 10, col, 0.85 * f);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#ffffff', 0.55 * f); ctx.fillRect(x - w * 0.15, floor - hh, w * 0.3, hh);
    }),
  }));
}
/**
 * 퍼지는 고리 (오르간·자장가): 반지름 r0 → r1 을 speed px/s 로, 굵기 th, 틈 gaps(각도 rad 배열) 너비 gapW(rad)
 * 틈 안이나 고리 밖/안의 플레이어는 맞지 않는다. 고리 하나당 한 번 타격
 */
export function ringWave(boss, x, y, o = {}) {
  const r0 = o.r0 ?? 20, r1 = o.r1 ?? 700, speed = o.speed ?? 380, th = o.th ?? 18, gapW = o.gapW ?? (55 * Math.PI / 180);
  const gaps = (o.gaps ?? []).map((g) => ((g % TAU) + TAU) % TAU).sort((a, b) => a - b);
  const col = o.color ?? '#6fd8ff';
  const radius = (z) => r0 + speed * Math.max(0, z.t - z.warn);
  const inGap = (ang) => { for (const g of gaps) { const d = Math.abs(Math.atan2(Math.sin(ang - g), Math.cos(ang - g))); if (d < gapW / 2) return true; } return false; };
  const none = [];
  return boss.zone(zoneBase(o, {
    x: x - r0, y: y - r0, w: r0 * 2, h: r0 * 2, warn: o.warn ?? 0, life: (r1 - r0) / Math.max(1, speed),
    tick: (z, w, dt) => { const r = radius(z) + th; z.x = x - r; z.y = y - r; z.w = z.h = r * 2; o.tick?.(z, w, dt); },
    rects: (z) => {
      const p = z.world.player;
      if (!p || p.dead) return none;
      const hb = p.hurtbox(), r = radius(z);
      const px = clamp(x, hb.x, hb.x + hb.w), py = clamp(y, hb.y, hb.y + hb.h);   // 중심에서 가장 가까운 점
      const fx = x < hb.x + hb.w / 2 ? hb.x + hb.w : hb.x, fy = y < hb.y + hb.h / 2 ? hb.y + hb.h : hb.y;   // 가장 먼 점
      const dn = Math.hypot(px - x, py - y), df = Math.hypot(fx - x, fy - y);
      if (r + th / 2 < dn || r - th / 2 > df) return none;
      if (inGap(Math.atan2(hb.y + hb.h / 2 - y, hb.x + hb.w / 2 - x))) return none;
      return [hb];
    },
    onStart: (z, w) => { startFx(o, w, 'magic'); o.onStart?.(z, w); },
    paint: o.paint ?? ((ctx, z) => {
      const r = radius(z);
      if (!z.started) { warnCircle(ctx, x, y, Math.max(r0, 30), z.k, col, z.t); return; }
      const f = clamp(1.2 - (r - r0) / (r1 - r0), 0, 1);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      const arcs = [];
      if (!gaps.length) arcs.push([0, TAU]);
      else for (let i = 0; i < gaps.length; i++) { const a0 = gaps[i] + gapW / 2, a1 = (i + 1 < gaps.length ? gaps[i + 1] : gaps[0] + TAU) - gapW / 2; if (a1 > a0) arcs.push([a0, a1]); }
      for (const [lw, c, a] of [[th * 1.6, col, 0.5], [Math.max(2, th * 0.35), '#ffffff', 0.9]]) {
        ctx.strokeStyle = rgba(c, a * f); ctx.lineWidth = lw;
        for (const [a0, a1] of arcs) { ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke(); }
      }
    }),
  }));
}
/** 바닥을 달리는 충격파: x 에서 dir(±1) 쪽으로 speed px/s, 높이 h (경기장 끝 또는 o.to 까지) */
export function groundWave(boss, x, dir, o = {}) {
  const A = boss.A, h = o.h ?? 40, w = o.w ?? 40, speed = o.speed ?? 520, floor = o.floor ?? A.floor;
  const to = o.to ?? (dir > 0 ? A.x1 : A.x0);
  const dist = Math.max(0, (to - x) * Math.sign(dir || 1));
  const col = o.color ?? '#ffb060';
  let acc = 0;
  const front = (z) => x + Math.sign(dir || 1) * speed * Math.max(0, z.t - z.warn);
  return boss.zone(zoneBase(o, {
    x: x - w / 2, y: floor - h, w, h, warn: o.warn ?? 0, life: dist / Math.max(1, speed),
    tick: (z, wd, dt) => {
      const fx = front(z);
      z.x = fx - w / 2;
      if (z.started) { acc += dt * 30 * (wd.fx?.quality ?? 1); while (acc >= 1) { acc -= 1; wd.fx?.emit?.('dust', fx, floor - 4, { speed: 120, angle: -Math.PI / 2 - dir * 0.4, spread: 0.5 }); } }
      o.tick?.(z, wd, dt);
    },
    onStart: (z, wd) => { startFx(o, wd, 'hit_heavy'); o.onStart?.(z, wd); },
    paint: o.paint ?? ((ctx, z, wd) => {
      const fx = front(z);
      if (!z.started) { warnFloor(ctx, fx, floor, w * 2, z.k, col, wd.time); return; }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(col, 0.55);
      ctx.beginPath(); ctx.moveTo(fx - dir * w * 1.6, floor); ctx.quadraticCurveTo(fx - dir * w * 0.2, floor - h * 1.25, fx + dir * w * 0.5, floor); ctx.closePath(); ctx.fill();
      glowE(ctx, fx, floor - h * 0.4, w * 1.1, h * 0.7, col, 0.6);
    }),
  }));
}
/**
 * 끌어당기는 장 (소용돌이·흡입·사슬): (x, y) 쪽으로 force px/s² (최대 maxV px/s), 반지름 r 안에서만 (기본 무한).
 * 판정 없음 (harmless). o.vertical: 세로로도 끈다. o.when(world, p) → false 면 이번 프레임은 쉼 (예: 물속에서만)
 */
export function pullField(boss, x, y, o = {}) {
  const r = o.r ?? Infinity, force = o.force ?? 420, maxV = o.maxV ?? 300, col = o.color ?? '#6fd8ff';
  let vx = 0, vy = 0;
  const zone = boss.zone({
    x: Number.isFinite(r) ? x - r : boss.A.x0, y: Number.isFinite(r) ? y - r : (boss.A.top ?? 0), w: Number.isFinite(r) ? r * 2 : boss.A.w, h: Number.isFinite(r) ? r * 2 : boss.A.h,
    warn: o.warn ?? 0, life: o.dur ?? 3, harmless: true, z: o.z ?? 5,
    tick: (z, w, dt) => {
      o.tick?.(z, w, dt);
      if (z.t < z.warn) return;
      const p = w.player;
      if (!p || p.dead || w.cutscene) { vx = vy = 0; return; }
      const dx = x - p.cx, dy = y - p.cy, d = Math.hypot(dx, dy);
      if (d > r || d < 6 || (o.when && !o.when(w, p))) { vx *= 0.8; vy *= 0.8; return; }
      vx = clamp(vx + (dx / d) * force * dt, -maxV, maxV);
      if (o.vertical) vy = clamp(vy + (dy / d) * force * dt, -maxV, maxV);
      nudgePlayer(w, vx * dt, o.vertical ? vy * dt : 0);
    },
    onStart: (z, w) => { if (o.sfx !== null) audio.sfx(o.sfx ?? 'mist', { vol: 0.5, pitch: 0.6 }); o.onStart?.(z, w); },
    onEnd: o.onEnd,
    paint: o.paint ?? ((ctx, z) => {
      if (z.t < z.warn) return;
      const R = Number.isFinite(r) ? r : 220;
      const f = clamp(Math.min(z.t - z.warn, (z.dur + z.warn) - z.t) / 0.3, 0, 1);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(col, 0.35 * f); ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a0 = z.t * 3 + i * (TAU / 4), rr = R * (0.35 + 0.15 * i);
        ctx.beginPath(); ctx.arc(x, y, rr, a0, a0 + 1.6); ctx.stroke();
      }
      glow(ctx, x, y, R * 0.35, col, 0.3 * f);
    }),
  });
  return zone;
}
/**
 * 플레이어를 (dx, dy) 만큼 옮긴다 — 벽 타일은 뚫지 않고 경기장 밖으로 나가지 않는다 (바람·흡입·벽 밀기 공용).
 * 옮겼으면 true
 */
export function nudgePlayer(world, dx, dy = 0) {
  const p = world?.player;
  if (!p || p.dead || (!dx && !dy)) return false;
  const m = world.map;
  const solid = (x, y) => (m?.isSolidPx ? m.isSolidPx(x, y) : false);
  let moved = false;
  if (dx) {
    const ex = dx > 0 ? p.x + p.w + dx : p.x + dx;
    let blocked = false;
    for (const k of [0.15, 0.5, 0.85]) if (solid(ex, p.y + p.h * k)) { blocked = true; break; }
    if (!blocked) { p.x += dx; moved = true; }
  }
  if (dy) {
    const ey = dy > 0 ? p.y + p.h + dy : p.y + dy;
    let blocked = false;
    for (const k of [0.2, 0.8]) if (solid(p.x + p.w * k, ey)) { blocked = true; break; }
    if (!blocked) { p.y += dy; moved = true; }
  }
  const a = world.arena;
  if (a && Number.isFinite(a.x0) && Number.isFinite(a.x1)) p.x = clamp(p.x, a.x0, a.x1 - p.w);
  return moved;
}

// ═════════════════════════════ 경기장 경계 보정 ═════════════════════════════
const solidT = (t) => t === T.SOLID || t === T.BREAK;
/**
 * b_common arenaOf 의 좌우 벽 보정: 경기장 가운데 열이 받침대·기둥 같은 고체면 벽 찾기가 그 자리에서 멈춰
 * x0 > x1 (폭이 음수)이 된다 (몰록 제단: 가운데 36열이 받침대). 여기서는 world.arena 가장자리부터 바닥 위 두 줄이
 * 연달아 고체인 열만 벽으로 본다 (진입 블록·방 끝 벽). 받침대·기둥·둔덕은 경기장 안의 지형으로 남는다.
 */
export function fixArena(world, base) {
  const map = world?.map, a = world?.arena;
  if (!base || !map?.typeAt || !a || !Number.isFinite(a.x0) || !Number.isFinite(a.x1)) return base;
  const T_ = tile(), fy = Math.round(base.floor / T_);
  const solidCol = (tx) => solidT(map.typeAt(tx, fy - 1)) && solidT(map.typeAt(tx, fy - 2));
  const t0 = Math.floor(a.x0 / T_), t1 = Math.ceil(a.x1 / T_) - 1;
  let c = t0; while (c <= t1 && solidCol(c)) c++;
  let d = t1; while (d >= c && solidCol(d)) d--;
  const X0 = Math.max(a.x0, c * T_), X1 = Math.min(a.x1, (d + 1) * T_);
  if (!(X1 - X0 >= 4 * T_)) return base.w >= 4 * T_ ? base : { ...base, x0: a.x0, x1: a.x1, w: a.x1 - a.x0, cx: (a.x0 + a.x1) / 2 };
  return { ...base, x0: X0, x1: X1, w: X1 - X0, cx: (X0 + X1) / 2 };
}

// ═════════════════════════════ 기반 클래스 BossC ═════════════════════════════
/**
 * 2부 보스 기반 (BossB 상속). 클래스 필드는 쓰지 않는다: Boss 생성자가 init() 을 부른 뒤에 초기화되어 덮어쓴다.
 * 보스 파일 훅 (모두 선택): setup() · idleMove(dt, world, t) · applyPhase(n, world) (형태 바꾸기, 한 번씩) ·
 *   afterTransition(n, world) · onCancel(world) (패턴 강제 중단 때 몸 상태 되돌리기) · onReset(world) · idleAnim(dt, world)
 * 필드: p2 (패턴 계약) · floorRow · standIns (false = 대역 기믹 끔) · arenaReset (resetArena 옵션) · idleWait · forced
 */
export class BossC extends BossB {
  init() {
    const P = patternsOf(this.def?.id, this.constructor);
    this.p2 = P;
    this.floorRow = P.floorRow ?? null;
    this.standIns = true;
    this.arenaReset = null;
    this.formPhase = 0; this.scriptedPhase = 0; this.afterPhase = 0;
    this._tr = null; this.forced = [];
    this.idleWait = 1.2;
    this._pDead = false; this._deathDone = false;
    this._cMinions = [];
    super.init();
    // 전환 상태에 전용 s_ 메서드가 없으면 기본 transitionTick 이 돌게 한다 (인스턴스 속성)
    const n = Math.max(this.def?.phases?.length ?? 0, ...Object.keys(P.transitions ?? {}).map(Number), 0);
    for (let k = 1; k <= n; k++) {
      const s = this.transitionOf(k).state;
      if (typeof this['s_' + s] !== 'function') this['s_' + s] = this.transitionTick;
    }
  }

  /** 경기장 (BossB.init 의 arenaOf 결과를 fixArena 로 보정해 둔다 — setup() 보다 먼저) */
  set A(v) { this._arena = fixArena(this.world, v); }
  get A() { return this._arena; }

  // ── 계약 정보 (갤러리·테스트) ──
  attackNames() { return [...(this.p2.attacks ?? [])]; }
  helperNames() { return [...(this.p2.helpers ?? [])]; }
  transitionNames() { const n = this.def?.phases?.length ?? 0; const out = []; for (let k = 1; k <= n; k++) out.push(this.transitionOf(k).state); return out; }
  /** 페이즈 n 진입 전환 정보 {state, dur, script?, scriptAt?, form2?, force?, applyAt?} */
  transitionOf(n) { return { state: 'phase' + n, dur: 1.5, ...(this.p2.transitions?.[n] ?? {}) }; }
  /** 상태 이름이 어느 페이즈의 전환인가 (아니면 0) */
  transitionPhaseOf(state) {
    const n = Math.max(this.def?.phases?.length ?? 0, ...Object.keys(this.p2.transitions ?? {}).map(Number), 0);
    for (let k = 1; k <= n; k++) if (this.transitionOf(k).state === state) return k;
    return 0;
  }
  /** 이번 페이즈의 [이름, 가중치] (s_ 가 있는 패턴만) */
  weights(phase = this.phase) {
    const W = this.p2.weights ?? [];
    const w = W[Math.min(phase, W.length - 1)] ?? {};
    return Object.entries(w).filter(([k, v]) => v > 0 && typeof this['s_' + k] === 'function');
  }

  // ── 기믹 ──
  gim(kind, opts) { return bossGimmick(this, kind, opts); }

  // ── 그리기 ──
  /** hidden (거울 속으로 사라짐 등) 이면 그리지 않는다: 채색 대리 개체(registry)와 같은 규칙을 벡터 대체 그림에도 */
  draw(ctx, world) { if (this.hidden) return; super.draw(ctx, world); }

  // ── 갱신 ──
  update(dt, world) {
    this.watchRespawn(world);
    pumpPhaseScripts(this, world, dt);
    if ((this.dying > 0 || this.dead) && !this._deathDone) { this._deathDone = true; this.cleanupOnDeath(world); }
    super.update(dt, world);
  }
  think(dt, world) {
    if (this.phase > 0 && this.hp >= this.stats.maxHp) this.resetFight(world);   // BossB 의 부활 규칙보다 먼저 (한 번만 돈다)
    tickDark(this, dt); tickMute(this, dt);
    super.think(dt, world);
  }
  /**
   * 플레이어 사망 → 부활을 보면 한 번 resetFight (페이즈 0 에서 죽어도). 월드가 보스 체력을 가득 채운 부활(world.respawn →
   * resetBoss)일 때만 — 보스 러시·서바이벌은 제자리에서 일으켜 세우고 보스 체력을 그대로 두므로 싸움도 이어 간다
   */
  watchRespawn(world) {
    const p = world.player;
    if (!p) return;
    if (p.dead) { this._pDead = true; return; }
    if (!this._pDead) return;
    this._pDead = false;
    if (!(this.dying > 0) && !this.dead && !world.cleared && this.hp >= this.stats.maxHp) this.resetFight(world);
  }
  /** 싸움을 처음 상태로: 페이즈 0, 형태·경기장·대사 대기열 되돌리기, onReset, idle */
  resetFight(world = this.world) {
    this.phase = 0; this.formPhase = 0; this.scriptedPhase = 0; this.afterPhase = 0; this._tr = null;
    this.clearJobs(); this.invuln = false; this.harmless = false; this.telegraph = false; this.alpha = 1; this.hidden = false;
    this.forced.length = 0; this.lastAtk = null;
    if (this.def0) this.def = this.def0;
    resetArena(world, this, this.arenaReset ?? {});
    this.onReset?.(world);
    this.idleWait = this.restTime(1.4);
    this.setState('idle');
  }
  /** 쓰러질 때 한 번: 대사 대기열·소환수·어둠/색조 정리 (대역 기믹은 스스로 원위치 뒤 사라진다) */
  cleanupOnDeath(world) {
    cancelPhaseScripts(this);
    this._tr = null; this.forced.length = 0; this.hidden = false;   // 숨은 채 쓰러져도 사망 연출은 보이게
    clearMinions(this, { fx: true });
    clearMood(world, this, { soft: true });
  }

  // ── 패턴 흐름 ──
  /** 기본 대기: idleMove 훅, 휴식이 끝나면 다음 패턴 */
  s_idle(dt, world, t) {
    if (this.idleMove) this.idleMove(dt, world, t);
    else { this.vx *= Math.pow(0.02, dt); if (this.noGravity) this.vy *= Math.pow(0.02, dt); this.facePlayer(); }
    if (t >= this.idleWait) this.nextPattern();
  }
  /** 강제 대기열 → 가중치 선택. 고를 것이 없으면 1초 뒤 다시 */
  nextPattern() {
    while (this.forced.length) {
      const f = this.forced.shift();
      if (typeof this['s_' + f] === 'function') { this.lastAtk = f; this.atkCount++; this.setState(f); return f; }
    }
    const opts = this.weights();
    if (!opts.length) { this.idleWait = this.st + 1; return null; }
    const s = this.choose(opts);
    this.setState(s);
    return s;
  }
  forceNext(name) { if (name && !this.forced.includes(name)) this.forced.push(name); }
  /** 패턴 끝: 휴식(restTime(base)) 뒤 다음 패턴 */
  done(base = rand(0.9, 1.3)) {
    this.telegraph = false;
    this.idleWait = this.restTime(base);
    this.setState('idle');
  }
  /** 진행 중 패턴 중단 (강제 패턴·전환 전): 지연 작업·예고·무적 해제 + onCancel 훅 */
  cancelPattern() {
    const tr = this._tr;
    if (tr) {
      // 전환 도중에 끊으면 skipTransition 과 같은 규칙: 형태는 바로, 대사는 대기열로, 그 페이즈의 강제 패턴·afterTransition 도 잃지 않게
      this.applyPhasesTo(this.phase, this.world); this.requestScriptsTo(this.phase); this._tr = null;
      this.afterPhasesTo(this.phase, this.world);
    }
    this.clearJobs();
    this.telegraph = false; this.invuln = false; this.harmless = false; this.alpha = 1; this.hidden = false;
    this.onCancel?.(this.world);
  }

  // ── 페이즈 전환 ──
  onPhase(n, world) { this.enterTransition(n, world); }
  enterTransition(n, world = this.world) {
    this.clearJobs(); this.telegraph = false; this.alpha = 1; this.hidden = false;
    this.onCancel?.(world);
    const info = this.transitionOf(n);
    this._tr = { n, ...info, started: false, applied: false, scripted: false };
    this.setState(info.state);
    this.invuln = true; this.harmless = true;
  }
  /** 기본 전환 상태 본문 (전용 s_<전환> 안에서 불러도 된다) */
  transitionTick(dt, world, t) {
    const tr = this._tr ?? (this._tr = { n: this.transitionPhaseOf(this.state) || this.phase, ...this.transitionOf(this.transitionPhaseOf(this.state) || this.phase), started: false, applied: false, scripted: false });
    this.invuln = true; this.harmless = true; this.telegraph = false;
    if (!tr.started) { tr.started = true; this.vx = 0; if (tr.scriptAt === 'start' && !tr.scripted) { tr.scripted = true; this.requestScriptsTo(tr.n); } }
    const dur = tr.dur ?? 1.5;
    if (!tr.applied && t >= dur * (tr.applyAt ?? 0.5)) { tr.applied = true; this.applyPhasesTo(tr.n, world); }
    if (t < dur) return;
    if (!tr.scripted) { tr.scripted = true; this.requestScriptsTo(tr.n); }
    if (!phaseScriptBusy(this)) this.endTransition(world);
  }
  /** 페이즈 1..n 의 형태 바꾸기를 아직 안 한 것만 (form2 이름·칭호·초상화 + applyPhase 훅) */
  applyPhasesTo(n, world = this.world) {
    for (let k = this.formPhase + 1; k <= n; k++) {
      this.formPhase = k;
      if (this.transitionOf(k).form2) this.applyForm2();
      safe('applyPhase', () => this.applyPhase?.(k, world));
    }
  }
  applyForm2() {
    const f2 = this.def0?.form2 ?? this.def?.form2;
    if (!f2) return;
    this.def = { ...this.def, name: f2.name ?? this.def.name, title: f2.title ?? this.def.title, portrait: f2.portrait ?? this.def.portrait };
  }
  /** 페이즈 1..n 의 페이즈 대사를 아직 안 부른 것만 대기열에 */
  requestScriptsTo(n) {
    for (let k = this.scriptedPhase + 1; k <= n; k++) { const s = this.transitionOf(k).script; if (s) phaseScript(this, s); }
    this.scriptedPhase = Math.max(this.scriptedPhase, n);
  }
  /**
   * 페이즈 1..n 의 전환 뒤처리를 아직 안 한 것만 (페이즈마다 싸움당 한 번 — resetFight 가 되돌린다):
   * afterTransition(k) 훅, 그리고 지금 페이즈의 강제 패턴(falseDawn · collapse). 한 방에 페이즈를 둘 넘겨도 중간 페이즈의
   * afterTransition 을 잃지 않고, 지난 전환을 다시 보여 줄 때(debugAct) 나 debugAct(전환) 로 들어갈 때 두 번 불리지 않는다
   */
  afterPhasesTo(n, world = this.world) {
    for (let k = this.afterPhase + 1; k <= n; k++) {
      this.afterPhase = k;
      const f = k === this.phase ? this.transitionOf(k).force : null;
      if (f) this.forceNext(f);
      safe('afterTransition', () => this.afterTransition?.(k, world));
    }
  }
  endTransition(world = this.world) {
    this._tr = null;
    this.applyPhasesTo(this.phase, world);
    this.invuln = false; this.harmless = false;
    this.afterPhasesTo(this.phase, world);
    this.done(0.5);
  }
  /** BossB.debugPhase 가 부른다: 전환 연출 없이 형태를 적용하고, 대사는 대기열로 */
  skipTransition() {
    // 페이즈가 그대로면(이미 그 페이즈) enterTransition 이 불리지 않았다: 진행 중 패턴의 몸 상태를 여기서 되돌린다
    if (!this._tr) { this.clearJobs(); this.alpha = 1; this.hidden = false; this.onCancel?.(this.world); }
    this.applyPhasesTo(this.phase, this.world);
    this.requestScriptsTo(this.phase);
    this._tr = null; this.invuln = false; this.harmless = false; this.telegraph = false;
    this.afterPhasesTo(this.phase, this.world);   // 같은 페이즈로 다시 debugPhase 해도 강제 패턴(falseDawn·collapse)·afterTransition 은 한 번뿐
    this.done(0.4);
  }

  // ── 디버그 규칙 ──
  /**
   * 패턴 강제 시작 (갤러리·테스트). 공격 패턴은 어느 페이즈에서든 돈다. 전환 상태 이름이면 그 페이즈로 안전하게 들어가
   * 전환 연출을 다시 보여 준다 (형태·대사는 한 번뿐). 없는 상태면 경고 후 false
   */
  debugAct(s) {
    if (this.dying > 0 || this.dead || !s) return false;
    const tn = this.transitionPhaseOf(s);
    if (tn > 0) {
      if (this.phase < tn) this.debugPhase(tn);
      this.cancelPattern();
      this.enterTransition(tn, this.world);
      return true;
    }
    if (s === 'idle') { this.cancelPattern(); this.done(0.8); return true; }
    if (typeof this['s_' + s] !== 'function') { warnOnce('act:' + this.def?.id + ':' + s, `[c_common] ${this.def?.id}: 상태 '${s}' 가 없음`); return false; }
    this.cancelPattern();
    this.facePlayer();
    super.debugAct(s);
    return true;
  }
}
