// 자동 전투 · 대상 고정 — owner: AUTO-QOL (설계: /tmp/claude-0/s3/auto/auto_design.md)
//
// 「자동 스킬」: 이동은 플레이어. 무기 사거리 안(앞)의 적이면 기본 공격, 대기 끝난 스킬은 사거리 안에 대상이 있을 때 시전(MP 확인).
// 「자동 전투」: 위 + 같은 바닥 구간의 가장 가까운 적에게 다가가 마주 보기, 큰 예고 공격에서 물러서기, HP 물약, 근처 전리품, 수호신 스킬.
// 절대 하지 않는 것: 점프·내려가기, 문·방 출구·이야기 트리거·보스방 문턱 넘기, ↑(문·대화·상자 — 위 공격 예외 규칙 밖), 메뉴 키.
// 사람이 방향을 넣으면 그 즉시 사람 쪽 (input.js 가상 입력원 규칙).
//
// 구조
//   input.setAutoSource(step) — step(dt, input) 이 매 스텝 input.update 첫머리에서 {action: bool} 를 낸다 (이 모듈을 불러오면 설치)
//   순수 함수 (tools/test_autoplay.mjs 가 노드에서 부른다):
//     segmentAt(map, cx, foot, o) → {x0, x1, why0, why1} | null    영웅 중심이 걸어갈 수 있는 x 범위 (같은 높이 바닥)
//     weaponReach(moveSet, stats, riding) → {bx, bw, y0, y1, ranged, up}   기본 공격 판정 (발 중앙 기준, 앞쪽 +)
//     skillRange(sk, lv) → {fx, back, up, dn}
//     decide(snap, mem) → {act:{…}, why}                          한 스텝 판단
//     pickLock(cands, p, cur, flick) → 다음 고정 대상 | null
//   월드 어댑터: snapshot(world, lv, cfg) · step() · lock 상태 기계
// 공개 상태 (그리기·패드가 읽는다; 이 모듈을 import 하지 않아도 되게 게임·월드 객체에 둔다)
//   game.autoHud = { level, on, why }      on = 지금 자동 입력을 내는 중
//   world.lockTarget = 엔티티 | null        대상 고정 (player.js 가 돌아서기·조준에, hud.js 가 표적 고리에)
//   world.autoTarget = 엔티티 | null        자동 전투가 고른 대상 (작은 점선 고리)
// 설정: settings.auto = {level, ult:'boss'|'always'|'never', potion 0–0.9, pickup, dodge} (save.js) · 세이브 슬롯 state.auto.level 이 우선
import { input } from '../core/input.js';
import { T } from '../core/physics.js';
import { MOVESETS } from '../data/movesets.js';
import { SKILLS } from '../data/skills.js';
import { ITEMS } from '../data/items.js';
import { COUNTER } from '../data/feel_hit.js';

const TILE = 48;
const isSolid = (t) => t === T.SOLID || t === T.BREAK;
const standable = (t) => t === T.SOLID || t === T.BREAK || t === T.ONEWAY;
const hazard = (t) => t === T.SPIKE || t === T.LIQUID;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export const LEVELS = Object.freeze(['off', 'skill', 'battle']);
export const LEVEL_NAMES = Object.freeze({ off: '끔', skill: '자동 스킬', battle: '자동 전투' });
export const ULT_POLICIES = Object.freeze(['boss', 'always', 'never']);
export const DEFAULTS = Object.freeze({ level: 'off', ult: 'boss', potion: 0.35, pickup: true, dodge: true, lockBtn: 'auto' });   // lockBtn: 「고정」 터치 버튼 auto(휴대폰 숨김)|on|off — settings.auto 에 없으면 auto
/** 자동으로 움직이는 장면 (마을·메뉴·대화·컷인은 아님) */
export const PLAY_SCENES = new Set(['stage', 'bossrush', 'survival', 'practice', 'tower']);
// [playb] 연출 장면 (막힘 안내만 보인다 — 메뉴 장면은 빠진다)
const CUT_TOPS = new Set(['bossIntro', 'dialogue', 'story', 'awakenCutin', 'ultCutin', 'companionJoin']);

// 판단 수치 (설계 문서 표)
export const K = Object.freeze({
  EDGE: 18,            // 구간 끝 여백 (몸 반폭 위에 더함; 돌진 lunge 가 끝을 넘지 않게)
  EXIT: TILE,          // 방 가장자리(출구)에서 더 떨어지기
  FOOT_TOL: 1.3 * TILE, // 같은 바닥으로 보는 발 높이 차
  FLY_UP: 210,         // 날아다니는 적: 발 위 이만큼까지면 다가간다 (공격 높이 안)
  ATK_EVERY: 2,        // 공격 탭 간격 (스텝): 누름 → 뗌 → 누름 (길게 눌러 모아베기 안 함)
  SKILL_GAP: 0.35, SWAP_GAP: 1.5, ULT_GAP: 2, GUARD_GAP: 2, POTION_GAP: 4,
  TELE_NEAR: 230, TELE_NEAR_BOSS: 300, TELE_STATE_T: 0.6, DODGE_DASH: 130, BACK_ROOM: 90, DASH_ROOM: 170, RETREAT_T: 0.6,
  ULT_RANGE: 520, ULT_CROWD: 3, ULT_CROWD_R: 360,
  PICK_R: 300, SAFE_R: 400, SAFE_T: 0.8,
  GUARD_R: 300,
  TURN_GAP: 0.25,
  STAND_K: 0.55, STAND_BOSS_K: 0.72,
  LOW_HP: 0.35, ENGAGE_T: 0.7, LOW_BACK_T: 0.9,   // 보스전 · 체력 낮음: 붙어 치는 시간 ≤ 0.7초 → 0.9초 물러선다 (치고 빠지기)
  LOCK_FRONT: 850, LOCK_ANY: 600, LOCK_CYCLE: 900, LOCK_DROP: 1300, LOCK_HOLD: 0.45, LOCK_DOUBLE: 0.3,
  AUTO_HOLD_OFF: 0.45,
  // [autofix] 이야기 트리거 여유 · 닿지 않는 적에게 맞음 · 막힘 감시 · 헛 시전
  STORY_PAD: 64, UNREACH_WIN: 8, FLEE_T: 1.6, UNREACH_SHOW: 4, STALL_T: 2.5, PUSH_T: 0.7, CAST_CHECK: 1.2, CAST_MUTE: 4,
  SEG_TTL: 0.5,
  // [matrix] 보조 무기: 근접으로 못 치는 보스·날짐승·닿지 않는 적에게 던지는 간격 (초)
  SUB_GAP: 0.55,
});

// ───────────────────────── 설정 ─────────────────────────
/** settings.auto → 정규화한 복사본 (모르는 값은 기본값) */
export function autoSettings(st) {
  const a = st?.auto, o = { ...DEFAULTS };
  if (a && typeof a === 'object') {
    if (LEVELS.includes(a.level)) o.level = a.level;
    if (ULT_POLICIES.includes(a.ult)) o.ult = a.ult;
    if (typeof a.potion === 'number' && Number.isFinite(a.potion)) o.potion = clamp(a.potion, 0, 0.9);
    if (typeof a.pickup === 'boolean') o.pickup = a.pickup;
    if (typeof a.dodge === 'boolean') o.dodge = a.dodge;
    if (['auto', 'on', 'off'].includes(a.lockBtn)) o.lockBtn = a.lockBtn;
  }
  return o;
}
/** 지금 단계: 세이브 슬롯(state.auto.level) → 설정 기본값 */
export function levelOf(g) {
  const s = g?.state?.auto?.level;
  return LEVELS.includes(s) ? s : autoSettings(g?.settings).level;
}
/** 단계 짧은 이름 (알약 · 토스트) */
export const LEVEL_SHORT = Object.freeze({ off: '끔', skill: '스킬', battle: '전투' });
/** [autofix] 마지막으로 켠 단계 (탭 = 끔 ↔ 이 단계): 슬롯 state.auto.last → 설정 기본 단계(끔이 아니면) → 「자동 전투」 */
export function lastLevel(g) {
  const l = g?.state?.auto?.last;
  if (l === 'skill' || l === 'battle') return l;
  const d = autoSettings(g?.settings).level;
  return d !== 'off' ? d : 'battle';
}
/** 단계 바꾸기 (세이브 슬롯에 기억 — 켠 단계는 last 로도). toast: 알림 「AUTO: 전투」/「AUTO: 스킬」/「AUTO 끔」 (hint: 뒤에 붙일 안내) */
export function setLevel(g, lv, { toast = true, hint = '' } = {}) {
  if (!g || !LEVELS.includes(lv)) return false;
  const st = g.state;
  if (st && typeof st === 'object') st.auto = { ...(st.auto && typeof st.auto === 'object' ? st.auto : {}), level: lv, ...(lv !== 'off' ? { last: lv } : {}) };
  else { g.settings ??= {}; g.settings.auto = { ...autoSettings(g.settings), level: lv }; }
  if (toast && typeof g.toast === 'function') {
    try { g.toast((lv === 'off' ? 'AUTO 끔' : `AUTO: ${LEVEL_SHORT[lv]}`) + (hint ? ` · ${hint}` : ''), lv === 'off' ? '#c8b8a0' : '#ffd890', hint ? 2.2 : 1.6); } catch { /* 토스트 없음 */ }
  }
  if (g.autoHud) g.autoHud.level = lv;
  if (g) g.dirty = true;
  return true;
}
/** [autofix] AUTO 단추 탭: 끔 ↔ 마지막 단계 (켠 상태에서 한 번 누르면 언제나 끔) */
export function toggleLevel(g, opts = {}) {
  const on = levelOf(g) === 'off';
  if (on && !g?.state?.auto?.tipped) { if (g?.state && typeof g.state === 'object') g.state.auto = { ...(g.state.auto ?? {}), tipped: true }; return setLevel(g, lastLevel(g), { hint: '길게 누르면 단계 변경', ...opts }); }
  return setLevel(g, on ? lastLevel(g) : 'off', opts);
}
/** [autofix] AUTO 단추 길게: 단계 바꾸기 (자동 스킬 ↔ 자동 전투; 꺼져 있으면 마지막 단계의 반대로 켠다) */
export function switchLevel(g, opts) {
  const cur = levelOf(g);
  const nx = cur === 'skill' ? 'battle' : cur === 'battle' ? 'skill' : lastLevel(g) === 'battle' ? 'skill' : 'battle';
  return setLevel(g, nx, opts);
}
/** 다음 단계 (끔 → 자동 스킬 → 자동 전투 → 끔) — 옵션 화면 · 예전 시험용 */
export function cycleLevel(g, opts) {
  const i = LEVELS.indexOf(levelOf(g));
  return setLevel(g, LEVELS[(i + 1) % LEVELS.length], opts);
}
/**
 * [autofix 공정성] AUTO 를 쓸 수 없는 월드: 이야기 모드(mode 'story')가 아닌 모든 기록 모드 — 연습·일일 도전(practice), 보스 러시, 서바이벌,
 * 탑, 시련(trial). 순위표·고스트·기록이 사람 플레이만 담게 한다 → 이유 문자열 | null
 */
export function autoBlockedIn(w) {
  if (!w) return null;
  if (w.trial || w.mode === 'trial') return 'trial';
  if (w.arcade || (w.mode && w.mode !== 'story')) return 'ranked';
  return null;
}

// ───────────────────────── 순수: 바닥 구간 ─────────────────────────
/**
 * 영웅이 걸어서(작은 턱은 짧게 뛰어서) 갈 수 있는 바닥 구간 — 영웅 중심 x 의 [x0, x1] 과 칸마다의 바닥 줄.
 * map: {w, h, typeAt(tx, ty)} · cx: 중심 x · foot: 발 y(bottom) · o: {halfW, bodyTiles(2), edge(K.EDGE), blocks:[{x0,x1,why}], steps(true)}
 * 이어지는 것: 같은 높이 바닥 · 1–2칸 오르는 턱(머리 위가 비었을 때 — 자동 전투가 짧게 뛴다) · 1–2칸 내려가는 턱(그냥 걸어 내려간다).
 *   턱 너머에 안전한 바닥이 3칸 이상 있어야 잇는다 (뛰어오르거나 떨어진 기세로 구덩이에 빠지지 않게).
 * 멈추는 것: 구덩이·낭떠러지(3칸 넘게 떨어짐 'pit'), 가시('spike'), 액체('liquid'), 높은 벽('wall'), 방 끝('edge'),
 *   blocks (중심이 들어가면 안 되는 x 구간: 이야기 트리거·보스방 문턱·경기장 벽). 발밑이 서 있을 수 없으면 null (공중)
 * → { x0, x1, why0, why1, ty, c0, rows:[칸 c0 부터 바닥 줄], links:[{x(경계 px), rowL, rowR}] }
 */
export function segmentAt(map, cx, foot, o = {}) {
  if (!map || typeof map.typeAt !== 'function' || !Number.isFinite(cx) || !Number.isFinite(foot)) return null;
  const halfW = o.halfW ?? 16, body = Math.max(1, o.bodyTiles ?? 2), edge = o.edge ?? K.EDGE, steps = o.steps !== false;
  const ty = Math.floor((foot + 2) / TILE);
  // 디딘 칸: 중심 칸, 아니면 몸 폭 안에서 중심에 가까운 서 있을 수 있는 칸 (턱 끝에 몇 px 걸쳐 선 경우)
  let t0 = Math.floor(cx / TILE);
  if (!standable(map.typeAt(t0, ty))) {
    const a = Math.floor((cx - halfW) / TILE), b = Math.floor((cx + halfW - 1) / TILE);
    let best = null;
    for (let tx = a; tx <= b; tx++) if (standable(map.typeAt(tx, ty)) && (best == null || Math.abs(tx * TILE + TILE / 2 - cx) < Math.abs(best * TILE + TILE / 2 - cx))) best = tx;
    if (best == null) return null;
    t0 = best;
  }
  const W = map.w ?? 1e4;
  /** (tx, r) 가 설 수 있는 바닥인가 → null(좋음) | 이유 */
  const floorBad = (tx, r) => {
    const f = map.typeAt(tx, r);
    if (f === T.SPIKE) return 'spike';
    if (!standable(f)) return 'pit';
    for (let k = 1; k <= body; k++) {
      const b = map.typeAt(tx, r - k);
      if (b === T.SPIKE) return 'spike';
      if (b === T.LIQUID) return 'liquid';
      if (isSolid(b) || b === T.FAKE) return 'wall';
    }
    return null;
  };
  const free = (tx, r0, r1) => { for (let r = r0; r <= r1; r++) { const b = map.typeAt(tx, r); if (isSolid(b) || b === T.FAKE || b === T.SPIKE || b === T.LIQUID) return false; } return true; };
  /** dir 쪽으로 훑기 → {cols:[{tx,row}], why} */
  const scan = (dir) => {
    const cols = [];
    let row = ty, why = 'edge', lastLink = -99;
    for (let tx = t0 + dir, n = 0; n < 400; tx += dir, n++) {
      if (tx < 0 || tx >= W) { why = 'edge'; break; }
      const same = floorBad(tx, row);
      if (!same) { cols.push({ tx, row }); continue; }
      let next = null, w2 = same;
      if (steps) {
        // 오르는 턱 (1–2칸): 그 칸의 바닥이 row-h · 지금 칸 머리 위가 비어 있다
        let up = null, down = null;
        for (const h of [1, 2]) {
          if (floorBad(tx, row - h) === null && free(tx - dir, row - body - h, row - 1)) { up = row - h; break; }
        }
        // 내려가는 턱 (1–2칸): 그 칸이 몸 높이로 비어 있고 아래에 바닥
        const here = map.typeAt(tx, row);
        if (!standable(here) && here !== T.SPIKE && here !== T.LIQUID && free(tx, row - body, row)) {
          for (const h of [1, 2]) {
            const r = row + h, fb = floorBad(tx, r);
            if (fb === null) { down = r; break; }
            if (fb === 'spike' || fb === 'liquid') { w2 = fb; break; }
            const tt = map.typeAt(tx, r);
            if (!(tt === T.EMPTY || tt === T.FAKE)) break;
          }
        }
        // 둘 다 되면 처음 바닥 줄(ty)에 가까운 쪽 (같으면 내려가기): 땅 위 영웅은 위층 발판보다 땅을 따라간다
        if (up != null && down != null) next = Math.abs(down - ty) <= Math.abs(up - ty) ? down : up;
        else next = up ?? down;
      }
      if (next == null) { why = w2; break; }
      lastLink = cols.length;
      row = next; cols.push({ tx, row, link: true });
    }
    // 턱 너머 안전한 바닥이 3칸 안 되면 턱 앞에서 끊는다
    for (let i = cols.length - 1; i >= 0; i--) {
      if (!cols[i].link) continue;
      if (cols.length - i < 3) { cols.length = i; why = 'step'; }
      break;
    }
    void lastLink;
    return { cols, why };
  };
  const L = scan(-1), R = scan(1);
  const leftCols = L.cols.reverse(), all = [...leftCols, { tx: t0, row: ty }, ...R.cols];
  const c0 = all[0].tx, c1 = all[all.length - 1].tx;
  const rows = all.map((c) => c.row);
  const links = [];
  for (let i = 1; i < all.length; i++) if (all[i].row !== all[i - 1].row) links.push({ x: all[i].tx * TILE, rowL: all[i - 1].row, rowR: all[i].row });
  let x0 = c0 * TILE + halfW + edge, x1 = (c1 + 1) * TILE - halfW - edge;
  let why0 = L.why, why1 = R.why;
  if (why0 === 'edge') x0 += K.EXIT;
  if (why1 === 'edge') x1 -= K.EXIT;
  for (const b of o.blocks ?? []) {
    if (!b) continue;
    // pad: 기둥 둘레 여유 (이야기 트리거 — 넉백에 밀려 들어가지 않게)
    const pad = b.pad ?? 0, bx0 = b.x0 - pad, bx1 = b.x1 + pad, w = b.why ?? 'block';
    if (bx1 <= cx && bx1 + halfW > x0) { x0 = bx1 + halfW; why0 = w; }
    else if (bx0 >= cx && bx0 - halfW < x1) { x1 = bx0 - halfW; why1 = w; }
    else if (bx0 < cx && bx1 > cx) {
      // [autofix] 이미 안에 있다 (넉백으로 경기장 벽 여백·트리거 여유 안): 그 자리에 얼어붙지 않고 열린 쪽으로만 다닌다
      if (b.x0 <= -1e8) { x0 = Math.max(x0, bx1 + halfW); why0 = w; }
      else if (b.x1 >= 1e8) { x1 = Math.min(x1, bx0 - halfW); why1 = w; }
      else if (cx - bx0 <= bx1 - cx) { x1 = Math.min(x1, bx0 - halfW); why1 = w; }
      else { x0 = Math.max(x0, bx1 + halfW); why0 = w; }
    }
  }
  if (x1 < x0) { const m = clamp(cx, Math.min(x0, x1), Math.max(x0, x1)); x0 = x1 = m; }
  return { x0, x1, why0, why1, ty, c0, rows, links };
}
/** 구간에서 x 의 바닥 y(px) (구간 밖이면 가장 가까운 끝 칸) */
export function floorAt(seg, x) {
  if (!seg?.rows?.length) return seg ? (seg.ty ?? 0) * TILE : 0;
  const i = clamp(Math.floor(x / TILE) - seg.c0, 0, seg.rows.length - 1);
  return seg.rows[i] * TILE;
}
/** dir 쪽으로 몸 앞 끝에서 ahead px 안에 있는 오르는 턱 → 높이(칸) | 0 */
export function stepAhead(seg, cx, halfW, dir, ahead = 30) {
  if (!seg?.links?.length || !dir) return 0;
  const front = cx + dir * halfW;
  for (const l of seg.links) {
    const d = (l.x - front) * dir;
    if (d < -4 || d > ahead) continue;
    const h = dir > 0 ? l.rowL - l.rowR : l.rowR - l.rowL;   // + = 오른다
    if (h > 0) return h;
  }
  return 0;
}

// ───────────────────────── 순수: 사거리 ─────────────────────────
/**
 * 기본 공격 판정 (발 중앙 기준; bx..bx+bw 가 앞쪽, y0..y1 은 발 위로 음수). 탄 무기는 탄 사거리.
 * [autofix] 첫 타(ground[0])만이 아니라 땅 콤보 전부(combo) · 앉아 공격(low: ↓+공격) · 위 공격(up) 상자를 함께 낸다 —
 *   늑대·슬라임·시체벌레처럼 낮은 적은 채찍 첫 타(-66..-40)에 닿지 않고, 말 탄 보스처럼 높은 적은 위 공격·2타에만 닿는다.
 *   yMin..yMax = 땅에서 닿는 높이 전체 (닿을 수 있는 적인지 가릴 때)
 */
export function weaponReach(ms, stats = {}, riding = false) {
  const m0 = ms?.ground?.[0];
  const reach = 1 + (stats.reach ?? 0) / 100;
  const boxOf = (b) => ({ bx: b.x, bw: b.w * (b.x >= 0 ? reach : 1) * (riding ? 1.15 : 1), y0: b.y, y1: b.y + b.h });
  const projOf = (P, w0 = 120) => { const oy = P.offY ?? -60; return { bx: P.offX ?? 30, bw: Math.max(w0, (P.speed ?? 900) * (P.life ?? 0.6) * 0.8), y0: oy - 60, y1: oy + 50 }; };
  let out;
  if (m0?.box) out = { ...boxOf(m0.box), ranged: false };
  else if (m0?.proj) out = { ...projOf(m0.proj), ranged: true };
  else out = { bx: 0, bw: 90, y0: -100, y1: -10, ranged: false };
  // 땅 콤보 2타 이후 (누르고 있으면 콤보가 이어져 그 상자까지 닿는다)
  out.combo = [];
  for (const m of ms?.ground ?? []) { if (m && m !== m0 && m.box) out.combo.push(boxOf(m.box)); }
  // 앉아 공격 (탈것 위에서는 없음)
  const c = ms?.crouch;
  out.low = riding || !c ? null : c.box ? boxOf(c.box) : c.proj ? (() => { const P = c.proj, oy = P.offY ?? -34; return { bx: P.offX ?? 30, bw: Math.max(120, (P.speed ?? 900) * (P.life ?? 0.6) * 0.8), y0: oy - 30, y1: Math.min(-2, oy + 30) }; })() : null;
  const u = ms?.up;
  out.up = u?.box ? { bx: u.box.x, bw: u.box.w, y0: u.box.y, y1: u.box.y + u.box.h, vy: u.vy ?? 0 } : null;
  if (!out.up && u?.proj) {   // 위로 쏘는 탄 (총 ↑ — 비스듬한 줄을 상자로 어림)
    const P = u.proj, a = P.angle ?? -Math.PI / 2, L = (P.speed ?? 900) * (P.life ?? 0.5) * 0.6, oy = P.offY ?? -80, ox = P.offX ?? 0;
    out.up = { bx: ox - 10, bw: Math.max(40, L * Math.abs(Math.cos(a))) + 20, y0: oy + L * Math.sin(a), y1: oy + 20, vy: 0 };
  }
  let yMin = out.y0, yMax = out.y1, xMax = out.bx + out.bw;
  for (const b of [...out.combo, out.low, out.up]) { if (!b) continue; yMin = Math.min(yMin, b.y0); yMax = Math.max(yMax, b.y1); xMax = Math.max(xMax, b.bx + b.bw); }
  out.yMin = yMin; out.yMax = yMax; out.xMax = xMax;
  return out;
}
/** 상자 box 의 높이 범위가 바닥 fy 에 선 영웅 기준으로 f 의 피격 높이와 겹치는 길이 (px, 겹치지 않으면 ≤ 0) */
export function vOverlap(box, fy, f) { return box ? Math.min(fy + box.y1, f.y1) - Math.max(fy + box.y0, f.y0) : -1; }
/**
 * f 를 바닥 fy 에서 칠 상자: 첫 타가 높이로 닿으면 첫 타, 아니면 앉아 공격 · 콤보 · 위 공격 중 가장 많이 겹치는 것 → {box, kind} | null
 * oneWay: 한쪽 발판 위 (앉아 공격은 쓰지 않는다 — ↓ 를 누른 채 점프가 섞이면 내려가 버린다)
 */
export function attackBoxFor(W, f, fy, { oneWay = false, upOk = true } = {}) {
  if (!W) return null;
  if (vOverlap(W, fy, f) >= 6) return { box: W, kind: 'main' };
  let best = null, bo = 7;
  const cand = (box, kind) => { const o = vOverlap(box, fy, f); if (o > bo) { bo = o; best = { box, kind }; } };
  if (W.low && !oneWay && vOverlap(W.low, fy, f) >= 10) return { box: W.low, kind: 'low' };
  for (const b of W.combo ?? []) cand(b, 'combo');
  if (W.up && upOk) cand(W.up, 'up');
  return best;
}
/**
 * 스킬 사거리 어림: v.r(레벨 반영)이 있으면 반경, 없으면 앞 300 · 위 160.
 * [autofix] dn = 발 아래로 허용하는 깊이. 예전 60(+40) 은 두 칸 아래(96 px) 적에게도 쏘아 MP 를 다 썼다 — 스킬 판정은 몸 높이에서 나오므로
 *   적의 몸이 발보다 위로 조금이라도(dn 8 px 여유) 올라와 있어야 한다 (skillHits)
 */
export function skillRange(sk, lv = 1) {
  const v = sk?.v ?? {};
  const val = (k) => (Array.isArray(v[k]) ? v[k][0] + (v[k][1] ?? 0) * Math.max(0, lv - 1) : null);
  const r = val('r') ?? val('range') ?? val('len');
  if (r && r > 0) return { fx: Math.min(700, r), back: Math.min(260, r * 0.6), up: Math.min(260, Math.max(120, r * 0.7)), dn: 8 };
  return { fx: 300, back: 40, up: 160, dn: 8 };
}
/** 스킬이 f 에 닿을 만한가: 앞뒤 범위 + 몸이 발 높이 띠(발 아래 dn ~ 발 위 up) 안에 걸친다 */
export function skillHits(p, f, R) {
  const dx = (f.cx - p.cx) * p.facing;
  if (!(dx > -R.back && dx < R.fx)) return false;
  return f.y0 < p.bottom - 4 + (R.dn ?? 8) && f.y1 > p.bottom - (R.up ?? 160) - 20;
}

/**
 * [matrix] 보조 무기가 f 에 닿을 만한가 (보는 쪽 기준, subweapons.js 의 탄 모양 어림). p: {cx, top, bottom, facing}
 *  단검·권총·십자가 = 가슴 높이 직선 · 도끼 = 앞 위 포물선 · 성수·화염병 = 앞 땅 · 성서 = 몸 둘레. 시계 등은 쓰지 않는다
 */
export function subHits(p, f, id) {
  const dx = (f.cx - p.cx) * p.facing, top = p.top ?? p.bottom - 90;
  switch (id) {
    case 'dagger': case 'pistol': case 'cross': { const y = top + 34; return dx > 24 && dx < 740 && f.y0 < y + 16 && f.y1 > y - 16; }
    case 'axe': return dx > 30 && dx < 430 && f.y1 > p.bottom - 520 && f.y0 < p.bottom - 30;
    case 'holywater': case 'bomb': return dx > 24 && dx < 320 && Math.abs(f.bottom - p.bottom) < 64;
    case 'bible': return Math.abs(f.cx - p.cx) < 110 && f.y1 > p.bottom - 170 && f.y0 < p.bottom;
    default: return false;
  }
}

/** [matrix] 보조 무기 하트 값 (data/subweapons.js cost — 그 파일은 탄·소리를 불러 노드 시험에서 못 읽는다) · 빅터 권총은 공짜 */
const SUB_COST = Object.freeze({ dagger: 1, axe: 1, holywater: 1, cross: 1, stopwatch: 5, pistol: 1, bible: 2, bomb: 2 });
const subCost = (id) => SUB_COST[id] ?? 1;
const subFree = (p, id) => id === 'pistol' && p.hero?.charId === 'victor';

/** 사각형 겹침 (x0,x1,y0,y1) */
const overlap = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
/** 적 f 가 영웅 p 의 판정 상자(rx: 앞쪽 bx..bx+bw · 높이 y0..y1, facing dir)와 겹치나 */
export function inBox(p, f, box, dir) {
  if (!box) return false;
  const x0 = dir > 0 ? p.cx + box.bx : p.cx - box.bx - box.bw, x1 = x0 + box.bw;
  return overlap(x0, x1, f.x0, f.x1) && overlap(p.bottom + box.y0, p.bottom + box.y1, f.y0, f.y1);
}

// ───────────────────────── 순수: 판단 ─────────────────────────
/** 기억 (월드마다 하나) */
export function newMem() {
  return {
    n: 0, atkPh: 0, skillT: -9, swapT: -9, ultT: -9, guardT: -9, potionT: -9, turnT: -9, retreatT: -9, retreatDir: 0, engageT: 0, safeT: 0, lastDanger: -9, why: '', jumpHold: 0, airDir: 0, airT: -9, airUntil: -9,
    // [autofix] 막힘 감시 · 헛 시전 · 닿지 않는 적에게 맞음
    lastAtkT: -9, tgt: null, tgtT: -9, pushUntil: -9, pushDir: 0, cast: null, skillMuteT: -9, wasHurt: false, unreach: [], unreachShowT: -9,
    subT: -9, lastSeg: null,   // [matrix] 보조 무기 간격 · 마지막으로 디딘 구간 (넉백으로 떠 있을 때 「닿지 않는 적」 판정에 쓴다)
  };
}
const MODE_RANK = { main: 0, low: 1, combo: 2, up: 3 };
/**
 * snap (snapshot 결과 · 시험은 손으로 만든다):
 *  { t, level, cfg:{ult,potion,pickup,dodge},
 *    p:{cx, bottom, halfW, facing, onGround, oneWay, hpFrac, mp, sp, awReady, dashReady, moving, dead, hurt, riding, noMove, inBoss},
 *    w: weaponReach, skills:[{key:'skill1'|'skill2', page, id, cost, ready, range}], page,
 *    seg: segmentAt | null, foes:[{id, e?, hp?, cx, bottom, x0, x1, y0, y1, boss, heavy, flying, tele, windup, invuln, locked}],
 *    propsNear, pickups:[{cx, bottom}], potion: uid|null, guardReady, humanDir }
 * → { act: {left,right,up,down,attack,dash,skill1,skill2,swap,awaken,guard}, potion: uid|null, target: foe|null, why,
 *     hold: null | 'forward' (이야기 트리거·보스 문턱 앞 — 사람이 앞으로) | 'unreach' (적은 있는데 닿지 않음·닿지 않는 적에게 맞음) | 'idle' (적 없음) }
 */
export function decide(s, mem) {
  const act = {}, out = { act, potion: null, target: null, why: '', hold: null };
  if (!s || s.level === 'off') { out.why = 'off'; return out; }
  const p = s.p, t = s.t, battle = s.level === 'battle', cfg = s.cfg ?? DEFAULTS;
  mem.n++;
  if (p.dead) { out.why = 'dead'; return out; }
  // 물약 (자동 전투): 문턱 아래 · 간격 · 회복 물약 있음 (보스전 문턱 +0.1)
  const thr = (cfg.potion ?? 0) + (p.inBoss ? 0.1 : 0);
  if (battle && s.potion && cfg.potion > 0 && p.hpFrac < thr && t - mem.potionT >= K.POTION_GAP) { out.potion = s.potion; mem.potionT = t; }
  const foes = (s.foes ?? []).filter((f) => !f.invuln);
  const seg = s.seg, W = s.w, oneWay = !!p.oneWay;
  const upOk = !!W.up && !s.propsNear && !p.riding;
  const fyAt = (f) => (seg ? floorAt(seg, clamp(f.cx, seg.x0, seg.x1)) : p.bottom);
  /**
   * 닿는 적: 구간(+공격 사거리) 안에 있고 ① 그 자리 바닥에 서 있거나 ② 땅에서 어느 공격 상자(첫 타·앉아·콤보·위)든 높이로 닿거나
   * ③ 낮게 나는 적 ④ (자동 전투) 나는 보스 — 밑에서 기다렸다가 내려올 때 친다
   */
  const reachable = (f, sg = seg) => {
    const seg = sg;
    if (!seg) return false;
    const rx = W.xMax ?? W.bx + W.bw;
    if (!(f.x1 > seg.x0 - rx && f.x0 < seg.x1 + rx)) return false;
    const fy = floorAt(seg, clamp(f.cx, seg.x0, seg.x1));
    if (!f.flying && Math.abs(f.bottom - fy) <= K.FOOT_TOL) return true;
    if (attackBoxFor(W, f, fy, { oneWay, upOk })) return true;
    if (f.flying) return (f.y1 > fy - K.FLY_UP && f.y0 < fy + 10) || (f.boss && battle);
    return false;
  };
  // 닿지 않는 적에게 맞고 있으면 (8초 안 두 번) 물러서고 HUD 에 「도달 불가」 (사람이 받아 가게)
  // [matrix] 넉백으로 떠 있는 동안(seg 없음)은 마지막으로 디딘 구간으로 판단한다 — 예전에는 공중에서 맞을 때마다 「닿지 않는 적」으로 세어
  //   나이트윙(나는 보스)과 싸우다가 「AUTO 불가」로 물러서 서 있기만 했다 (replay f41)
  if (seg) mem.lastSeg = seg;
  if (p.hurt && !mem.wasHurt) {
    if (!foes.some((f) => Math.abs(f.cx - p.cx) < 520 && reachable(f, seg ?? mem.lastSeg))) {
      mem.unreach.push(t);
      while (mem.unreach.length && t - mem.unreach[0] > K.UNREACH_WIN) mem.unreach.shift();
      if (mem.unreach.length >= 2) {
        let nf = null, nd = Infinity;
        for (const f of foes) { const d = Math.abs(f.cx - p.cx) + Math.abs(f.y1 - p.bottom) * 0.5; if (d < nd) { nd = d; nf = f; } }
        mem.retreatDir = nf ? sgn(p.cx - nf.cx) || -p.facing : -p.facing;
        mem.retreatT = t + K.FLEE_T; mem.unreachShowT = t + K.UNREACH_SHOW; mem.unreach.length = 0;
      }
    }
  }
  mem.wasHurt = !!p.hurt;
  if (p.hurt) { out.why = 'hurt'; if (t < mem.unreachShowT) out.hold = 'unreach'; return out; }
  // 위험 (큰 예고): 보스 예고 또는 무거운·정예 적의 윈드업
  let threat = null, td = Infinity;
  for (const f of foes) {
    if (!(f.tele || f.windup)) continue;
    const d = Math.abs(f.cx - p.cx), lim = f.boss ? K.TELE_NEAR_BOSS : K.TELE_NEAR;
    if (d < lim && Math.abs(f.bottom - p.bottom) < 260 && d < td) { threat = f; td = d; }
  }
  const near = foes.some((f) => Math.abs(f.cx - p.cx) < K.SAFE_R && Math.abs(f.bottom - p.bottom) < 300);
  if (near || threat) mem.lastDanger = t;
  // 대상: 고정 대상(닿을 수 있으면) → 가장 가까운 닿는 적 → (자동 스킬) 가장 가까운 적
  const dist = (f) => Math.abs(f.cx - p.cx) + Math.abs(f.bottom - p.bottom) * 0.5;
  let target = null;
  const locked = foes.find((f) => f.locked) ?? null;
  if (locked && (!battle || reachable(locked))) target = locked;
  if (!target) {
    let bd = Infinity;
    for (const f of foes) { if (battle && !reachable(f)) continue; const d = dist(f); if (d < bd) { bd = d; target = f; } }
  }
  out.target = target;
  const tk = target ? target.e ?? target.id ?? target : null;
  if (tk !== mem.tgt) { mem.tgt = tk; mem.tgtT = t; }
  let retreating = t < mem.retreatT;
  // 지금 서 있는 자리에서 f 를 어떤 공격으로 치나 (dir 쪽을 볼 때): 첫 타 → 높이로 가장 많이 겹치는 앉아·콤보·위 공격
  const upHere = upOk && p.onGround && (!(W.up?.vy < 0) || (seg && p.cx - seg.x0 > 60 && seg.x1 - p.cx > 60));
  const modeAt = (f, dir) => {
    const mainHit = inBox(p, f, W, dir);
    if (mainHit && vOverlap(W, p.bottom, f) >= 6) return 'main';
    let best = null, bo = 0;
    // 콤보 막타(채찍 회전 등)는 뒤까지 닿지만, 뒤의 적은 돌아서서 친다 — 그래서 앉아·콤보·위 공격은 적의 중심이 보는 쪽(조금 뒤 허용)일 때만
    if ((f.cx - p.cx) * dir < -20) return null;
    const c = (box, kind) => { if (!box || !inBox(p, f, box, dir)) return; const o = vOverlap(box, p.bottom, f); if (o > bo) { bo = o; best = kind; } };
    // 앉아 공격이 10 px 넘게 겹치면 먼저 (콤보 막타가 더 넓어도 첫 타부터 헛친다)
    if (!oneWay && W.low && inBox(p, f, W.low, dir) && vOverlap(W.low, p.bottom, f) >= 10) return 'low';
    for (const b of W.combo ?? []) c(b, 'combo');
    if (upHere) c(W.up, 'up');
    return best ?? (mainHit ? 'main' : null);   // 첫 타가 몇 px 만 걸치면 더 많이 겹치는 공격을 먼저
  };
  // ── 공격 ──
  let hitF = null, hitMode = null, behind = null;
  for (const f of foes) {
    const m = modeAt(f, p.facing);
    if (m) { if (!hitF || (f.locked && !hitF.locked) || (!hitF.locked && MODE_RANK[m] < MODE_RANK[hitMode])) { hitF = f; hitMode = m; } } else if (!behind && modeAt(f, -p.facing)) behind = f;
  }
  // 보스전에서 체력이 낮으면 치고 빠진다 (물약이 없거나 아직 못 쓸 때 오래 붙어 있지 않는다)
  if (battle && p.inBoss && p.hpFrac < K.LOW_HP && hitF?.boss && !retreating) {
    if (!mem.engageT) mem.engageT = t;
    else if (t - mem.engageT > K.ENGAGE_T) { mem.retreatT = t + K.LOW_BACK_T; mem.retreatDir = sgn(p.cx - hitF.cx) || -p.facing; mem.engageT = 0; retreating = true; out.why = 'hit-run'; }
  } else if (!hitF) mem.engageT = 0;
  if (!retreating && hitF) {
    if ((mem.atkPh = (mem.atkPh + 1) % K.ATK_EVERY) === 0) { act.attack = true; mem.lastAtkT = t; }
    if (hitMode === 'low') act.down = true;   // ↓+공격 = 앉아 공격 (점프는 같이 누르지 않는다 — 발판에서 내려가지 않게)
    else if (hitMode === 'up') act.up = true;
    out.why = hitMode === 'up' ? 'up-attack' : hitMode === 'low' ? 'low-attack' : 'attack';
  }
  // ── 스킬 (0.35초 간격, 한 번에 하나) ──
  // 헛 시전 막기: 시전 뒤 그때 노린 적들의 HP 합이 줄면 확인 끝 (다음 시전 허용). 1.2초가 지나도 그대로면 4초 동안 쉰다.
  // 확인이 끝나기 전에는 다음 시전을 하지 않는다 (예전: 닿지 않는 적에게 0.35초마다 MP 40→2)
  if (mem.cast) {
    let hp = 0;
    for (const k of mem.cast.keys) { const f = (s.foes ?? []).find((x) => (x.e ?? x.id) === k); hp += f && Number.isFinite(f.hp) ? f.hp : 0; }
    if (hp < mem.cast.hp - 0.01) mem.cast = null;
    else if (t - mem.cast.t >= K.CAST_CHECK) { mem.skillMuteT = t + K.CAST_MUTE; mem.cast = null; }
  }
  if (!retreating && !mem.cast && t - mem.skillT >= K.SKILL_GAP && t >= mem.skillMuteT && !act.up && !act.down) {
    for (const sk of s.skills ?? []) {
      if (!sk.ready || (sk.page !== s.page && !battle)) continue;
      const R = sk.range ?? skillRange(null);
      // 몸이 발 높이 띠에 걸친 적만 (두 칸 아래 · 물속 · 높이 뜬 적에게 MP 를 버리지 않는다)
      const tg = foes.filter((f) => skillHits(p, f, R) && (!battle || reachable(f)));
      if (!tg.length) continue;
      if (sk.page === s.page) {
        act[sk.key] = true; mem.skillT = t; out.why = 'skill';
        if (tg.every((f) => Number.isFinite(f.hp))) mem.cast = { t, keys: tg.map((f) => f.e ?? f.id), hp: tg.reduce((a, f) => a + f.hp, 0) };
        break;
      }
      if (t - mem.swapT >= K.SWAP_GAP) { act.swap = true; mem.swapT = t; mem.skillT = t - K.SKILL_GAP + 0.1; out.why = 'swap'; break; }
    }
  }
  // ── 필살기 · 각성기 ──
  if ((p.sp >= 100 || p.awReady) && cfg.ult !== 'never' && t - mem.ultT >= K.ULT_GAP && !retreating) {
    let ok = false;
    const ahead = (f) => { const dx = (f.cx - p.cx) * p.facing; return dx > -40 && dx < K.ULT_RANGE && Math.abs(f.bottom - p.bottom) < 320; };
    if (cfg.ult === 'boss' || cfg.ult === 'always') ok = foes.some((f) => f.boss && !f.tele && ahead(f));
    if (!ok && cfg.ult === 'always') ok = foes.some((f) => (f.boss || f.elite) && ahead(f)) || foes.filter((f) => Math.abs(f.cx - p.cx) < K.ULT_CROWD_R).length >= K.ULT_CROWD;
    if (ok) { act.awaken = true; mem.ultT = t; out.why = 'ult'; }
  }
  // ── 수호신 (자동 전투) ──
  if (battle && s.guardReady && t - mem.guardT >= K.GUARD_GAP && foes.some((f) => Math.abs(f.cx - p.cx) < K.GUARD_R && Math.abs(f.bottom - p.bottom) < 200)) { act.guard = true; mem.guardT = t; }
  // ── [matrix] 보조 무기 (자동 전투): 지금 근접으로 못 치는 보스·날짐승·닿지 않는 적이 탄 길에 있으면 던진다 (하트가 있을 때만) ──
  let subBehind = 0;
  const sw = s.sub;
  if (battle && sw?.id && sw.ready && !hitF && !act.awaken && t - mem.subT >= K.SUB_GAP && !p.riding) {
    const want = (f) => f.boss || f.flying || !reachable(f);
    const pf = { cx: p.cx, top: p.top, bottom: p.bottom, facing: p.facing };
    if (foes.some((f) => want(f) && subHits(pf, f, sw.id))) { act.sub = true; mem.subT = t; out.why ||= 'sub'; }
    else if (foes.some((f) => want(f) && subHits({ ...pf, facing: -pf.facing }, f, sw.id))) subBehind = -p.facing;
  }
  // ── 이동 ──
  let move = 0, holdFace = 0;
  // 자동으로 뛴 턱 넘기: 공중에서는 뛴 쪽으로 계속 (땅에 닿으면 끝)
  if (p.onGround) { if (mem.airDir && t > mem.airT + 0.05) mem.airDir = 0; }
  else if (battle && mem.airDir && t < mem.airUntil && !p.noMove) move = mem.airDir;
  const halfW = p.halfW ?? 16;
  /** x 에서 dir 쪽으로 바닥 높이가 fy 인 첫 칸을 찾아, 몸이 그 칸 위에 다 들어가는 중심 x (턱에서 내려서기) | null */
  const pastEdge = (x, dir, fy) => {
    if (Math.abs(floorAt(seg, x) - fy) <= K.FOOT_TOL && Math.abs(floorAt(seg, x - dir * halfW) - fy) <= K.FOOT_TOL) return null;   // 이미 그 바닥 위
    for (let i = 0; i < 100; i++, x += dir * 12) {
      if (Math.abs(floorAt(seg, x) - fy) > K.FOOT_TOL) continue;
      const col = Math.floor(x / TILE), edgeX = dir > 0 ? col * TILE : (col + 1) * TILE;
      return edgeX + dir * (halfW + 6);
    }
    return null;
  };
  if (battle && seg && !p.noMove && p.onGround) {
    const roomL = p.cx - seg.x0, roomR = seg.x1 - p.cx;
    if (threat && cfg.dodge !== false) {
      let dir = sgn(p.cx - threat.cx) || -p.facing;
      if ((dir > 0 ? roomR : roomL) < K.BACK_ROOM) dir = 0;   // 뒤가 막혔다: 제자리 (낭떠러지로 물러서지 않는다)
      if (dir) {
        move = dir; mem.retreatT = t + K.RETREAT_T; mem.retreatDir = dir; out.why = 'retreat';
        if (td < K.DODGE_DASH && p.dashReady && p.onGround && (dir > 0 ? roomR : roomL) >= K.DASH_ROOM) { act.dash = true; out.why = 'dodge'; }
      }
    } else if (retreating && mem.retreatDir) {
      if ((mem.retreatDir > 0 ? roomR : roomL) >= K.BACK_ROOM * 0.5) move = mem.retreatDir;
      out.why ||= 'retreat';
    } else if (target && reachable(target) && t < mem.pushUntil && mem.pushDir && !hitF) {
      move = mem.pushDir; out.why = 'push';   // 막힘 감시로 밀고 들어가는 중 (다가가기 규칙이 다시 물러서게 하지 않는다)
    } else if (target && reachable(target)) {
      const dir = sgn(target.cx - p.cx) || p.facing;
      const fy = fyAt(target);
      const onFloor = !target.flying && Math.abs(target.bottom - fy) <= K.FOOT_TOL;
      const ab = attackBoxFor(W, target, onFloor ? target.bottom : fy, { oneWay: false, upOk });
      const box = ab?.box ?? (target.flying && upOk ? W.up : W);
      let want;
      if (W.ranged && box === W) want = target.cx - dir * Math.min(W.bw * 0.5, 360);
      else if (box === W.up) want = target.cx - dir * (box.bx + box.bw * 0.5);   // 머리 위 (나는 적·높은 보스): 밑으로
      else { const nearEdge = dir > 0 ? target.x0 : target.x1; want = nearEdge - dir * (box.bx + box.bw * (target.boss ? K.STAND_BOSS_K : K.STAND_K)); }
      const raw = want;
      if (onFloor) {
        // 선 자리가 대상과 다른 높이 바닥이면 (상자 위 등) 대상 쪽으로 같은 높이 바닥에 몸이 다 올라서는 곳까지
        if (Math.abs(floorAt(seg, clamp(want, seg.x0, seg.x1)) - target.bottom) > K.FOOT_TOL) { const e = pastEdge(want, dir, target.bottom); want = e ?? target.cx; }
        // 영웅이 아직 다른 높이 바닥에 서 있으면 (턱 끝에 걸쳐 섰을 때도) 턱 너머까지 걸어 내려선다 — 도착은 같은 바닥에서만
        if (Math.abs(p.bottom - target.bottom) > K.FOOT_TOL) { const e = pastEdge(p.cx, dir, target.bottom); if (e != null && (e - want) * dir > 0) want = e; }
      }
      want = clamp(want, seg.x0, seg.x1);
      const clamped = Math.abs(want - raw) > 1;
      if (hitF !== target) {
        if (modeAt(target, dir) && dir !== p.facing) holdFace = dir;   // 돌아서기만 하면 닿는다: 걷지 않고 돌아서서 친다
        else {
          const d = want - p.cx, away = d * dir < 0;
          // 히스테리시스: 간격을 벌리려고(뒤로) 조금 움직이는 것은 안 한다 — 구간 끝에 눌렸거나 방금 돌아섰으면 그대로 서서 대상 쪽을 본다
          if (Math.abs(d) > 10 && !(away && (Math.abs(d) < 28 || clamped || t - mem.turnT < 0.5))) { move = sgn(d); out.why ||= 'approach'; } else if (away || Math.abs(d) <= 10) holdFace = dir;
        }
      }
      // 막힘 감시: 닿는 대상이 STALL_T 초 동안 한 번도 공격을 못 받았으면 대상 쪽으로 밀고 들어간다
      if (!hitF && t - Math.max(mem.lastAtkT, mem.tgtT) > K.STALL_T && t >= mem.pushUntil && Math.abs(want - p.cx) <= 30) { mem.pushUntil = t + K.PUSH_T; mem.pushDir = dir; mem.lastAtkT = t; move = dir; out.why = 'push'; }
    } else if (cfg.pickup !== false && !near && t - mem.lastDanger >= K.SAFE_T) {
      let best = null, bd = K.PICK_R;
      for (const k of s.pickups ?? []) {
        if (Math.abs(k.bottom - p.bottom) > K.FOOT_TOL || k.cx < seg.x0 - 8 || k.cx > seg.x1 + 8) continue;
        const d = Math.abs(k.cx - p.cx);
        if (d < bd) { bd = d; best = k; }
      }
      if (best && bd > 6) { move = sgn(clamp(best.cx, seg.x0, seg.x1) - p.cx); out.why = 'pickup'; }
    }
    // 구간 끝을 넘는 이동은 내지 않는다
    if (move > 0 && roomR <= 2) move = 0;
    if (move < 0 && roomL <= 2) move = 0;
    // 오르는 턱 앞: 짧게 뛴다 (1칸 = 9스텝 누름, 2칸 = 끝까지) — 공중에서도 뛴 쪽으로 계속 간다
    if (move && !act.dash && !act.down && !(mem.jumpHold > 0)) {
      const h = stepAhead(seg, p.cx, halfW, move, 26);
      if (h > 0) { mem.jumpHold = h >= 2 ? 30 : 9; mem.airDir = move; mem.airT = t; mem.airUntil = t + 1.0; out.why = 'step'; }
    }
  }
  if (mem.jumpHold > 0) { act.jump = true; mem.jumpHold--; }
  if (act.jump) delete act.down;   // ↓+점프 = 발판 아래로 내려가기 — 절대 같이 내지 않는다
  if (act.down) move = 0;
  // 돌아서기: 이동하지 않고 공격 중이 아닐 때 대상이 뒤에 있으면 한 스텝 방향 탭 (사람 입력이 없을 때만 input 이 통과시킨다)
  if (!move && !act.dash && !act.down && !p.moving && t - mem.turnT >= K.TURN_GAP) {
    let want = holdFace;
    if (!want) {
      const tf = hitF ?? target ?? behind;
      want = tf ? sgn(tf.cx - p.cx) : 0;
      if (!(want && (behind || Math.abs(tf.cx - p.cx) > 24) && (battle || behind || tf.locked))) want = 0;
    }
    if (!want && subBehind) want = subBehind;   // [matrix] 뒤의 닿지 않는 적에게 보조 무기를 던지려면 돌아선다
    if (want && want !== p.facing) { move = want; mem.turnT = t; out.why ||= 'turn'; }
  }
  if (move > 0) act.right = true; else if (move < 0) act.left = true;
  if (act.dash && !move) delete act.dash;
  if (!out.why) out.why = target ? 'wait' : 'idle';
  // HUD 에 보일 기다림 이유 (버튼 고리를 멈추고 흐리게 + 알약 글자)
  if (t < mem.unreachShowT) out.hold = 'unreach';
  else if (battle && !target && !move && !hitF) {
    let nf = null, nd = Infinity;
    for (const f of foes) { const d = Math.abs(f.cx - p.cx); if (d < 900 && d < nd) { nd = d; nf = f; } }
    const side = (x) => (seg ? (x > p.cx ? seg.why1 : seg.why0) : null);
    const blocked = (w) => w === 'story' || w === 'boss';
    // 적이 구간 끝(트리거·보스 문턱·구덩이·가시·벽) 너머에 있으면 「앞으로 이동」(사람이 넘어가 줘야 한다), 구간 위·아래면 「도달 불가」
    const beyond = nf && seg && (nf.cx > seg.x1 + 24 || nf.cx < seg.x0 - 24) && side(nf.cx) !== 'edge';
    if (nf) out.hold = beyond ? 'forward' : 'unreach';
    else out.hold = seg && (blocked(seg.why0) || blocked(seg.why1)) ? 'forward' : 'idle';
    // [matrix] 기다리는 까닭 (알림 글): 이야기 지점 · 보스 방 문턱
    if (out.hold === 'forward' && seg) out.holdWhy = seg.why0 === 'story' || seg.why1 === 'story' ? 'story' : seg.why0 === 'boss' || seg.why1 === 'boss' ? 'boss' : null;
  }
  return out;
}

// ───────────────────────── 순수: 대상 고정 ─────────────────────────
/**
 * 다음 고정 대상. cands: [{e, cx, cy, d}] (d = 거리), p: {cx, cy, facing}, cur: 지금 대상(e) | null, flick: -1|0|1 (패드 스틱 쪽)
 * 없을 때: 앞쪽 LOCK_FRONT 안 가장 가까운 것 → 양쪽 LOCK_ANY 안. 있을 때: 거리 순으로 다음 (flick 이 있으면 그쪽에서)
 */
export function pickLock(cands, p, cur = null, flick = 0) {
  const list = (cands ?? []).filter((c) => c && Number.isFinite(c.d));
  if (!list.length) return null;
  if (!cur) {
    let best = null;
    for (const c of list) {
      const dx = c.cx - p.cx;
      if (c.d <= K.LOCK_FRONT && (sgn(dx) === p.facing || Math.abs(dx) < 30) && (!best || c.d < best.d)) best = c;
    }
    if (!best) for (const c of list) if (c.d <= K.LOCK_ANY && (!best || c.d < best.d)) best = c;
    return best?.e ?? null;
  }
  const pool = list.filter((c) => c.d <= K.LOCK_CYCLE);
  if (flick) {
    const side = pool.filter((c) => c.e !== cur && sgn(c.cx - p.cx) === flick).sort((a, b) => a.d - b.d);
    if (side.length) return side[0].e;
  }
  const sorted = pool.sort((a, b) => a.d - b.d);
  const i = sorted.findIndex((c) => c.e === cur);
  if (sorted.length <= 1) return sorted[0]?.e ?? cur;
  return sorted[(i + 1) % sorted.length].e;
}

// ───────────────────────── 월드 어댑터 ─────────────────────────
const MEM = new WeakMap();
const lazy = { dismount: null, inv: null, asked: false };
function loadLazy() {
  if (lazy.asked) return;
  lazy.asked = true;
  import('./mount.js').then((m) => { lazy.dismount = new Set(m.DISMOUNT_SKILLS ?? []); }).catch(() => { lazy.dismount = new Set(); });
  import('./inventory.js').then((m) => { lazy.inv = m; }).catch(() => null);
}

/** 적이 살아서 조준할 수 있는가 */
function aimable(world, e) {
  return !!e && !e.dead && !(e.dying > 0) && !e.hidden && !e.pendingBoss && e.harmless !== true && (e.kind === 'enemy' || e.kind === 'boss') && world.entities.includes(e);
}
/** [playb] 살아 있는 피격 상자 (combat.js liveBoxes 와 같은 규칙 — 이 파일은 combat.js 를 import 하지 않는다) */
function liveBoxes(T) {
  let L = null;
  try { L = T.hitParts ? T.hitParts() : T.hurtboxes ? T.hurtboxes() : null; } catch { L = null; }
  if ((!L || !L.length) && T.hurtbox && !T.hitParts) { try { const h = T.hurtbox(); L = h ? [h] : null; } catch { L = null; } }
  const out = [];
  for (const b of L ?? []) if (b && !b.off && b.w > 0 && b.h > 0 && Number.isFinite(b.x) && Number.isFinite(b.y)) out.push(b);
  return out;
}
/** 엔티티 피격 상자 묶음 → {x0,x1,y0,y1} */
function rectOf(e) {
  // [playb] 공격 판정과 같은 상자 (combat.liveBoxes: hitParts → hurtboxes → hurtbox, 꺼진 부위 제외) — 거상처럼 hurtboxes() 가 빈 여러 부위 보스도
  let hb = liveBoxes(e);
  if (!hb.length) hb = [{ x: e.x, y: e.y, w: e.w, h: e.h }];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of hb) { if (!r || !(r.w > 0)) continue; x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h); }
  if (!(x1 > x0)) { x0 = e.x; x1 = e.x + e.w; y0 = e.y; y1 = e.y + e.h; }
  return { x0, x1, y0, y1 };
}
const HEAVY = new Set(['HEAVY', 'FIXED']);

/** 발밑이 한쪽 발판인가 (앉아 공격을 쓰지 않는다) */
function oneWayUnder(world, p) {
  if (!p.onGround) return false;
  try { if (typeof p.onOneWay === 'function') return !!p.onOneWay(world); } catch { /* 모양이 다르면 지도에서 */ }
  const t = world.map?.typeAt?.(Math.floor(p.cx / TILE), Math.floor((p.bottom + 2) / TILE));
  return t === T.ONEWAY;
}
/**
 * [autofix 성능] 바닥 구간은 영웅이 선 칸 · 기둥(트리거·경기장) · 몸 폭이 같으면 SEG_TTL 초 동안 다시 훑지 않는다
 * (구간 훑기가 한 스텝 AI 비용의 대부분 — 칸마다 typeAt 여러 번). 기둥 안에 들어가 있으면(넉백) 매번 새로 (중심 x 에 따라 달라진다)
 */
const SEGC = new WeakMap();
function segCached(world, p, halfW, blocks) {
  const tx = Math.floor(p.cx / TILE), ty = Math.floor((p.bottom + 2) / TILE), t = world.time ?? 0;
  let key = tx * 4096 + ty + halfW * 1e7, inside = false;
  for (const b of blocks) {
    key = (key * 31 + Math.round(b.x0) * 7 + Math.round(b.x1)) % 2147483647;
    const pad = b.pad ?? 0;
    if (p.cx > b.x0 - pad - halfW - 2 && p.cx < b.x1 + pad + halfW + 2) inside = true;
  }
  const c = SEGC.get(world);
  // 칸 안에서 중심이 서 있을 수 없는 칸 위(턱 끝)면 매번 (디딘 칸 고르기가 중심 x 에 따라 달라진다)
  const edgeStand = !standable(world.map?.typeAt?.(tx, ty));
  if (!inside && !edgeStand && c && c.key === key && c.map === world.map && t - c.t < K.SEG_TTL && t >= c.t) return c.seg;
  const seg = segmentAt(world.map, p.cx, p.bottom, { halfW, bodyTiles: Math.max(1, Math.ceil(p.h / TILE)), blocks });
  SEGC.set(world, { key, map: world.map, t, seg });
  return seg;
}
/** 월드 → snap (decide 입력) */
const WR = { ms: null, reach: NaN, riding: null, w: null };
export function snapshot(world, level, cfg) {
  const p = world.player, g = world.game;
  const st = p.stats ?? {}, run = world.run ?? {};
  const riding = !!p.mount?.riding;
  const mnt = p.mount;
  const mountFly = riding && !!(mnt.flying || mnt.gliding || mnt.diving || mnt.inWater);
  const swim = !!(world.gimmick?.swimming?.(p) ?? p.swimming) || (p.inLiquid && world.liquid === 'deep');
  const halfW = riding ? Math.max(p.w / 2, (mnt.hurtbox?.(p)?.w ?? p.w) / 2) : p.w / 2;
  // 막는 기둥: 이야기 트리거(아직 안 본 것) · 보스방 문턱 · 경기장 벽
  const blocks = [];
  for (const e of world.entities) {
    if (e.kind === 'trigger' && !e.dead) blocks.push({ x0: e.x, x1: e.x + e.w, why: 'story', pad: K.STORY_PAD });   // [autofix] 여유: 넉백에 밀려 들어가지 않게
  }
  if (world.arenaX !== undefined && world.room?.boss && !world.bossActive && !world.cleared) blocks.push({ x0: world.arenaX + TILE + p.w / 2 - 6, x1: 1e9, why: 'boss' });
  if (world.arena) { blocks.push({ x0: -1e9, x1: world.arena.x0 + p.w / 2 + 4, why: 'arena' }); blocks.push({ x0: world.arena.x1 - p.w / 2 - 4, x1: 1e9, why: 'arena' }); }
  let seg = null;
  if (p.onGround) {
    if (p.platform && p.platform.w > 0) {
      const pl = p.platform;
      seg = { x0: pl.x + halfW + 6, x1: pl.x + pl.w - halfW - 6, why0: 'platform', why1: 'platform' };
      if (seg.x1 < seg.x0) seg.x0 = seg.x1 = p.cx;
    } else seg = segCached(world, p, halfW, blocks);
  }
  // 적
  const lockT = world.lockTarget ?? null;
  const boss = world.boss;
  const bossIntro = !!(boss && !boss.dead && boss.state === 'intro');
  const foes = [];
  for (const e of world.entities) {
    if ((e.kind !== 'enemy' && e.kind !== 'boss') || e.dead || e.hidden || e.pendingBoss || e.harmless === true || e.dying > 0) continue;
    if (world.inUnrevealedFake?.(e)) continue;
    const r = rectOf(e);
    if (Math.abs((r.x0 + r.x1) / 2 - p.cx) > 1400 || Math.abs(r.y1 - p.bottom) > 700) continue;
    const isBoss = e.kind === 'boss';
    const windup = !isBoss && (e.elite || HEAVY.has(e.wclass)) && COUNTER.states.includes(e.state) && (e.stateT ?? 9) < K.TELE_STATE_T;
    foes.push({
      e, id: e.id, cx: (r.x0 + r.x1) / 2, bottom: r.y1, x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, boss: isBoss, elite: !!e.elite, heavy: HEAVY.has(e.wclass),
      flying: !!e.noGravity, tele: isBoss && !!e.telegraph, windup, invuln: !!e.invuln || (isBoss && bossIntro), locked: e === lockT, hp: Number.isFinite(e.hp) ? e.hp : undefined,
    });
  }
  // 스킬 (지금 쪽 · 다른 쪽)
  const skills = [];
  const slots = p.hero?.slots ?? [];
  const dis = lazy.dismount;
  for (let page = 0; page < 2; page++) {
    for (let k = 0; k < 2; k++) {
      const id = slots[page * 2 + k];
      if (!id) continue;
      const sk = SKILLS[id], lv = p.hero?.skills?.[id] ?? 0;
      if (!sk || !lv || sk.type === 'passive') continue;
      if (sk.reqAsc && p.hero?.asc !== sk.reqAsc) continue;
      if (riding && (!dis || dis.has(id))) continue;
      const ready = !((p.skillCd?.[id] ?? 0) > 0) && (p.mp ?? 0) >= (sk.cost ?? 10);
      skills.push({ key: k === 0 ? 'skill1' : 'skill2', page, id, cost: sk.cost ?? 10, ready, range: skillRange(sk, lv) });
    }
  }
  // 상호작용 (↑ 금지): 문·상자·세이브·NPC 가 가까움
  let propsNear = false;
  for (const e of world.entities) {
    if (e.near && (e.kind === 'prop' || e.kind === 'npc')) { propsNear = true; break; }
    if ((e.kind === 'prop' || e.kind === 'npc') && Math.abs(e.cx - p.cx) < 90 && Math.abs(e.bottom - p.bottom) < 60) { propsNear = true; break; }
  }
  // 줍기
  const pickups = [];
  if (level === 'battle' && cfg.pickup !== false) {
    for (const e of world.entities) {
      if (e.kind !== 'pickup' || e.dead || e.type === 'sub' || world.inUnrevealedFake?.(e)) continue;
      if (Math.abs(e.cx - p.cx) > K.PICK_R + 40) continue;
      pickups.push({ cx: e.cx, bottom: e.bottom });
    }
  }
  // 회복 물약 (규칙 noPotion · 시련 외)
  let potion = null;
  if (level === 'battle' && !world.rules?.noPotion) {
    let best = null;
    for (const it of world.state?.inventory ?? []) {
      const b = ITEMS[it.baseId], u = b?.use;
      if (!u?.heal || u.warp || u.buff) continue;
      if (!best || u.heal < best.h) best = { uid: it.uid, h: u.heal };
    }
    potion = best?.uid ?? null;
  }
  // 수호신
  let guardReady = false;
  try { const hi = world.companions?.hudInfo?.(); guardReady = !!hi?.guards?.some?.((gd) => !((gd?.cd ?? 0) > 0)); } catch { guardReady = false; }
  // [autofix] 무기 닿는 범위는 무기·사거리 능력치·탈것이 바뀔 때만 다시 계산 (매 프레임 상자 객체 ~10개를 만들지 않는다)
  if (WR.ms !== p.moveSet || WR.reach !== (st.reach ?? 0) || WR.riding !== riding || !WR.w) { WR.w = weaponReach(p.moveSet, st, riding); WR.ms = p.moveSet; WR.reach = st.reach ?? 0; WR.riding = riding; }
  const w = WR.w;
  return {
    t: world.time ?? 0, level, cfg,
    p: {
      cx: p.cx, top: p.y, bottom: p.bottom, halfW, facing: p.facing || 1, onGround: !!p.onGround, oneWay: oneWayUnder(world, p), hpFrac: (p.hp ?? 0) / Math.max(1, st.hp ?? 1),
      mp: p.mp ?? 0, sp: run.sp ?? 0, awReady: !!world.awakenState?.ready, dashReady: !(p.dashCool > 0) && !(p.dashT > 0) && !riding,
      moving: !!(p.move && !p.move.canMove), dead: !!p.dead, hurt: p.hurtT > 0, riding, noMove: mountFly || swim || !!p.wallSlide, inBoss: !!(world.bossActive && boss && !boss.dead),
    },
    w, skills, page: p.skillPage ?? 0, seg, foes, propsNear, pickups, potion, guardReady,
    // [matrix] 보조 무기: id · 쓸 수 있나 (재사용 대기 끝 · 하트 ≥ 값 — 빅터 권총은 공짜) · 규칙 noSub 이면 없음
    sub: run.sub && !world.rules?.noSub ? { id: run.sub, ready: !(p.subCool > 0) && (subFree(p, run.sub) || (run.hearts ?? 0) >= subCost(run.sub)) } : null,
  };
}

/** 지금 자동으로 움직여도 되는 장면인가 → world | null */
function playWorld(g) {
  const w = g?.world, top = g?.top;
  if (!w || !top || !w.player || w.mode === 'town') return null;
  if (!PLAY_SCENES.has(top.name) || (top.world && top.world !== w)) return null;
  if (w.cutscene || w.inputLock || w.transitioning || w.cleared || w.hudHidden) return null;
  return w;
}

// ── 대상 고정 상태 (월드마다) ──
function lockCands(w) {
  const p = w.player, out = [];
  for (const e of w.entities) {
    if (!aimable(w, e)) continue;
    if (w.inUnrevealedFake?.(e)) continue;
    const r = rectOf(e), cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    out.push({ e, cx, cy, d: Math.hypot(cx - p.cx, cy - p.cy) });
  }
  return out;
}
/** 고정 대상 정리: 죽음·숨음·방 이동·멀어짐 → 풀기 */
function lockValidate(w) {
  const e = w.lockTarget;
  if (!e) return;
  const p = w.player;
  if (!aimable(w, e) || !p || Math.hypot(e.cx - p.cx, e.cy - p.cy) > K.LOCK_DROP) w.lockTarget = null;
}
export function setLock(w, e) {
  if (!w) return;
  w.lockTarget = e ?? null;
  installAim(w);
}
/**
 * 고정 대상이 있으면 「가장 가까운 적」을 찾는 쪽(유도탄 · 스킬)이 그 대상을 먼저 고르게 한다. world.js 를 고치지 않고
 * 월드 인스턴스에 그림자 함수를 둔다 (고정이 없거나 maxD 밖이면 원래 함수 그대로)
 */
function installAim(w) {
  if (!w || w._autoAim) return;
  const orig = w.nearestEnemy;
  if (typeof orig !== 'function') return;
  w._autoAim = true;
  w.nearestEnemy = function nearestEnemyLocked(x, y, maxD = 9999) {
    const e = this.lockTarget;
    if (e && aimable(this, e) && !e.invuln && Math.hypot(e.cx - x, e.cy - y) < maxD) return e;
    return orig.call(this, x, y, maxD);
  };
}

/** 버튼 상태 기계: 누름 → (짧게 뗌 | 길게 누름). o: {held, t} → 'tap' | 'hold' | null */
function btnEdge(m, key, held, t, holdS) {
  const s = (m[key] ??= { on: false, t0: 0, fired: false });
  let ev = null;
  if (held && !s.on) { s.on = true; s.t0 = t; s.fired = false; ev = 'down'; }
  else if (held && s.on && !s.fired && t - s.t0 >= holdS) { s.fired = true; ev = 'hold'; }
  else if (!held && s.on) { s.on = false; ev = s.fired ? 'up-hold' : 'tap'; }
  return ev;
}

const OUT = {};
const BTN = {};   // 단추 상태 (자동·고정): 장면을 가리지 않고 사람 입력의 변화를 따라간다
/** 매 스텝 (input.update 첫머리) — 사람 입력은 inp.human(a) 로 읽는다 (이번 스텝 값) */
export function step(dt, inp) {
  const g = inp?.game;
  for (const k in OUT) delete OUT[k];
  if (!g) return null;
  const w = playWorld(g);
  const t = inp.time ?? 0;
  if (!g.autoHud) g.autoHud = { level: 'off', on: false, why: '', hold: null, blocked: null };
  // [autofix] 기록 모드(연습·일일·보스 러시·서바이벌·탑·시련)에서는 AUTO 를 쓰지 않는다 (순위표·고스트·기록 공정성)
  // [playb] 메뉴(일시정지·인벤토리·설정 등)가 위에 있으면 막힘 안내도 하지 않는다 — 패드 SELECT 길게(몸짓 auto)가 메뉴 안에서 아무 일도 하지 않게
  const pw = w ?? (g.world?.player && g.world.mode !== 'town' && (PLAY_SCENES.has(g.top?.name) || CUT_TOPS.has(g.top?.name)) ? g.world : null);   // 연출(보스 등장 등) 중이라 지금 움직일 수 없어도 막힘 이유는 보인다
  const blocked = autoBlockedIn(pw);
  // ── 자동 단추: 짧게 = 끔 ↔ 마지막 단계, 길게(0.45초) = 단계 바꾸기 (자동 스킬 ↔ 자동 전투) ──
  const ae = btnEdge(BTN, 'auto', inp.human('auto'), t, K.AUTO_HOLD_OFF);
  if (pw && (ae === 'tap' || ae === 'hold') && blocked) { try { g.toast?.(blocked === 'trial' ? '시련에서는 AUTO 를 쓸 수 없다' : '기록 모드에서는 AUTO 를 쓸 수 없다', '#c8b8a0', 1.6); } catch { /* */ } }
  else if (w && ae === 'tap') toggleLevel(g);
  else if (w && ae === 'hold') switchLevel(g);
  // ── 고정 단추: 누름 = 고정/다음, 0.3초 안 두 번 = 풀기, 길게 = 풀기 ──
  const le = btnEdge(BTN, 'lock', inp.human('lock'), t, K.LOCK_HOLD);
  if (w) {
    installAim(w);
    lockValidate(w);
    if (le === 'down') {
      const L = (BTN.lockTap ??= { t: -9 });
      if (w.lockTarget && t - L.t < K.LOCK_DOUBLE) { setLock(w, null); toastLock(g, null); L.t = -9; }
      else {
        const had = !!w.lockTarget;
        const nx = pickLock(lockCands(w), w.player, w.lockTarget, inp.lockFlick ?? 0);
        if (nx && nx !== w.lockTarget) { setLock(w, nx); if (!had) toastLock(g, nx); }
        else if (!nx && !w.lockTarget) { try { g.toast?.('고정할 대상이 없다', '#c8b8a0', 1); } catch { /* */ } }
        L.t = t;
      }
    } else if (le === 'hold' && w.lockTarget) { setLock(w, null); toastLock(g, null); }
  }
  const lv = blocked ? 'off' : levelOf(g);
  g.autoHud.level = lv; g.autoHud.blocked = blocked;
  if (!w || lv === 'off') { g.autoHud.on = false; g.autoHud.hold = null; g.autoHud.why = blocked ? 'blocked' : w ? 'off' : 'scene'; if (w) w.autoTarget = null; return null; }
  loadLazy();
  let mem = MEM.get(w);
  if (!mem) { mem = newMem(); MEM.set(w, mem); }
  const cfg = autoSettings(g.settings);
  let snap;
  try { snap = snapshot(w, lv, cfg); } catch (e) { console.error('[autoplay] snapshot', e); return null; }
  const r = decide(snap, mem);
  w.autoTarget = r.target?.e ?? null;
  g.autoHud.on = true; g.autoHud.why = r.why; g.autoHud.hold = r.hold;
  // [autofix] 닿지 않는 적에게 맞아 물러설 때 한 번 알림 (20초에 한 번)
  // [matrix] 방(보스전)마다 한 번만 — 같은 알림이 되풀이되지 않게
  const uroom = w.roomId ?? w.room?.id ?? '';
  if (r.hold === 'unreach' && snap.t < mem.unreachShowT && mem.unreachToastRoom !== uroom) {
    mem.unreachToastT = snap.t; mem.unreachToastRoom = uroom;
    try { g.toast?.('AUTO: 닿지 않는 적 — 직접 움직이세요', '#ffb070', 2.2); } catch { /* */ }
  }
  // [autofix] 이야기 문턱·보스 문 앞(forward) / 적 없음(idle) 으로 2초 넘게 기다리면 방마다 한 번 알림 (흐린 AUTO 「대기」와 같은 뜻)
  if (r.hold === 'forward' || r.hold === 'idle') {
    if (mem.holdSince == null || mem.holdKind !== r.hold) { mem.holdSince = snap.t; mem.holdKind = r.hold; }
    const room = w.roomId ?? w.room?.id ?? '';
    // [matrix] 이야기 지점·보스 문턱 앞은 까닭이 분명하다 → 0.6초 만에, 까닭을 적어 알린다 (s02 시작: 켜자마자 「대기」만 보여 고장처럼 보였다)
    const why = r.hold === 'forward' ? r.holdWhy : null;
    if (snap.t - mem.holdSince >= (why ? 0.6 : 2) && mem.holdToastRoom !== room) {
      mem.holdToastRoom = room;
      const msg = why === 'story' ? 'AUTO 대기 — 앞에 이야기 지점 · 직접 들어가세요' : why === 'boss' ? 'AUTO 대기 — 보스 방 앞 · 직접 들어가세요'
        : r.hold === 'forward' ? 'AUTO 대기 — 앞으로는 직접 이동하세요' : 'AUTO 대기 — 주변에 적 없음 · 직접 이동하세요';
      try { g.toast?.(msg, '#c8b8a0', 2.4); } catch { /* */ }
    }
  } else { mem.holdSince = null; mem.holdKind = null; }
  if (r.potion && lazy.inv?.useItem) {
    try {
      const res = lazy.inv.useItem(w.state, w.hero, r.potion, w.player);
      if (res?.ok === false && res.msg) mem.potionT = snap.t + 2;   // 가득 참 등: 조금 뒤에 다시
    } catch (e) { console.error('[autoplay] potion', e); }
  }
  Object.assign(OUT, r.act);
  // [autofix 공정성] AUTO 가 한 번이라도 입력을 냈으면 이번 판(world.run)에 표시 — 결과·업적·기록 쪽이 읽는다 (auto.md 「공정성」)
  if (w.run && !w.run.assisted) { for (const k in OUT) { if (OUT[k]) { w.run.assisted = true; w.run.assistLevel = lv; break; } } }
  else if (w.run && lv === 'battle') w.run.assistLevel = 'battle';
  return OUT;
}
function toastLock(g, e) {
  try {
    if (!e) { g.toast?.('대상 고정 해제', '#c8b8a0', 1); return; }
    const nm = e.def?.name ?? e.name ?? '';
    g.toast?.(nm ? `대상 고정: ${nm}` : '대상 고정', '#ffd890', 1.2);
  } catch { /* 토스트 없음 */ }
}

/** 시험용: 기억·단추 상태 비우기 */
export function _reset(w) { if (w) MEM.delete(w); for (const k in BTN) delete BTN[k]; }
export const _test = { MEM, BTN, playWorld, rectOf, lockCands, installAim };

input.setAutoSource?.(step);
