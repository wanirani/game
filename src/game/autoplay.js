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
export const DEFAULTS = Object.freeze({ level: 'off', ult: 'boss', potion: 0.35, pickup: true, dodge: true });
/** 자동으로 움직이는 장면 (마을·메뉴·대화·컷인은 아님) */
export const PLAY_SCENES = new Set(['stage', 'bossrush', 'survival', 'practice', 'tower']);

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
  LOCK_FRONT: 850, LOCK_ANY: 600, LOCK_CYCLE: 900, LOCK_DROP: 1300, LOCK_HOLD: 0.45, LOCK_DOUBLE: 0.3,
  AUTO_HOLD_OFF: 0.45,
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
  }
  return o;
}
/** 지금 단계: 세이브 슬롯(state.auto.level) → 설정 기본값 */
export function levelOf(g) {
  const s = g?.state?.auto?.level;
  return LEVELS.includes(s) ? s : autoSettings(g?.settings).level;
}
/** 단계 바꾸기 (세이브 슬롯에 기억). toast: 알림 */
export function setLevel(g, lv, { toast = true } = {}) {
  if (!g || !LEVELS.includes(lv)) return false;
  const st = g.state;
  if (st && typeof st === 'object') st.auto = { ...(st.auto && typeof st.auto === 'object' ? st.auto : {}), level: lv };
  else { g.settings ??= {}; g.settings.auto = { ...autoSettings(g.settings), level: lv }; }
  if (toast && typeof g.toast === 'function') {
    try { g.toast(`자동 전투: ${LEVEL_NAMES[lv]}`, lv === 'off' ? '#c8b8a0' : '#ffd890', 1.6); } catch { /* 토스트 없음 */ }
  }
  if (g.autoHud) g.autoHud.level = lv;
  if (g) g.dirty = true;
  return true;
}
/** 다음 단계 (끔 → 자동 스킬 → 자동 전투 → 끔) */
export function cycleLevel(g, opts) {
  const i = LEVELS.indexOf(levelOf(g));
  return setLevel(g, LEVELS[(i + 1) % LEVELS.length], opts);
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
  const ty = Math.floor((foot + 2) / TILE), t0 = Math.floor(cx / TILE);
  if (!standable(map.typeAt(t0, ty)) && !standable(map.typeAt(Math.floor((cx - halfW + 2) / TILE), ty)) && !standable(map.typeAt(Math.floor((cx + halfW - 2) / TILE), ty))) return null;
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
    if (b.x1 <= cx && b.x1 + halfW > x0) { x0 = b.x1 + halfW; why0 = b.why ?? 'block'; }
    else if (b.x0 >= cx && b.x0 - halfW < x1) { x1 = b.x0 - halfW; why1 = b.why ?? 'block'; }
    else if (b.x0 < cx && b.x1 > cx) { x0 = x1 = cx; why0 = why1 = b.why ?? 'block'; }   // 이미 안에 있다: 움직이지 않는다
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
/** 기본 공격 판정 (발 중앙 기준; bx..bx+bw 가 앞쪽, y0..y1 은 발 위로 음수). 탄 무기는 탄 사거리 */
export function weaponReach(ms, stats = {}, riding = false) {
  const m0 = ms?.ground?.[0];
  const reach = 1 + (stats.reach ?? 0) / 100;
  let out;
  if (m0?.box) {
    const b = m0.box, w = b.w * (b.x >= 0 ? reach : 1) * (riding ? 1.15 : 1);
    out = { bx: b.x, bw: w, y0: b.y, y1: b.y + b.h, ranged: false };
  } else if (m0?.proj) {
    const P = m0.proj, oy = P.offY ?? -60;
    out = { bx: P.offX ?? 30, bw: Math.max(120, (P.speed ?? 900) * (P.life ?? 0.6) * 0.8), y0: oy - 60, y1: oy + 50, ranged: true };
  } else out = { bx: 0, bw: 90, y0: -100, y1: -10, ranged: false };
  const u = ms?.up;
  out.up = u?.box ? { bx: u.box.x, bw: u.box.w, y0: u.box.y, y1: u.box.y + u.box.h, vy: u.vy ?? 0 } : null;
  return out;
}
/** 스킬 사거리 어림: v.r(레벨 반영)이 있으면 반경, 없으면 앞 300 · 위아래 160 */
export function skillRange(sk, lv = 1) {
  const v = sk?.v ?? {};
  const val = (k) => (Array.isArray(v[k]) ? v[k][0] + (v[k][1] ?? 0) * Math.max(0, lv - 1) : null);
  const r = val('r') ?? val('range') ?? val('len');
  if (r && r > 0) return { fx: Math.min(700, r), back: Math.min(260, r * 0.6), up: Math.min(260, Math.max(120, r * 0.7)), dn: 80 };
  return { fx: 300, back: 40, up: 160, dn: 60 };
}

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
  return { n: 0, atkPh: 0, skillT: -9, swapT: -9, ultT: -9, guardT: -9, potionT: -9, turnT: -9, retreatT: -9, retreatDir: 0, safeT: 0, lastDanger: -9, why: '', jumpHold: 0, airDir: 0, airT: -9, airUntil: -9 };
}
/**
 * snap (snapshot 결과 · 시험은 손으로 만든다):
 *  { t, level, cfg:{ult,potion,pickup,dodge},
 *    p:{cx, bottom, halfW, facing, onGround, hpFrac, mp, sp, awReady, dashReady, moving, dead, hurt, riding, noMove, inBoss},
 *    w: weaponReach, skills:[{key:'skill1'|'skill2', page, id, cost, ready, range}], page,
 *    seg: segmentAt | null, foes:[{id, cx, bottom, x0, x1, y0, y1, boss, heavy, flying, tele, windup, invuln, locked}],
 *    propsNear, pickups:[{cx, bottom}], potion: uid|null, guardReady, humanDir }
 * → { act: {left,right,up,attack,dash,skill1,skill2,swap,awaken,guard}, potion: uid|null, target: foe|null, why }
 */
export function decide(s, mem) {
  const act = {}, out = { act, potion: null, target: null, why: '' };
  if (!s || s.level === 'off') { out.why = 'off'; return out; }
  const p = s.p, t = s.t, battle = s.level === 'battle', cfg = s.cfg ?? DEFAULTS;
  mem.n++;
  if (p.dead) { out.why = 'dead'; return out; }
  // 물약 (자동 전투): 문턱 아래 · 간격 · 회복 물약 있음 (보스전 문턱 +0.1)
  const thr = (cfg.potion ?? 0) + (p.inBoss ? 0.1 : 0);
  if (battle && s.potion && cfg.potion > 0 && p.hpFrac < thr && t - mem.potionT >= K.POTION_GAP) { out.potion = s.potion; mem.potionT = t; }
  if (p.hurt) { out.why = 'hurt'; return out; }
  const foes = (s.foes ?? []).filter((f) => !f.invuln);
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
  const seg = s.seg;
  const reachable = (f) => {
    if (!seg) return false;
    const inX = f.x1 > seg.x0 - s.w.bw - s.w.bx && f.x0 < seg.x1 + s.w.bw + s.w.bx;
    if (!inX) return false;
    const fy = floorAt(seg, clamp(f.cx, seg.x0, seg.x1));   // 그 자리의 바닥 (턱을 넘은 구간이면 높이가 다르다)
    if (Math.abs(f.bottom - fy) <= K.FOOT_TOL) return true;
    return f.flying && f.y1 > fy - K.FLY_UP && f.y0 < fy + 10;
  };
  const dist = (f) => Math.abs(f.cx - p.cx) + Math.abs(f.bottom - p.bottom) * 0.5;
  let target = null;
  const locked = foes.find((f) => f.locked) ?? null;
  if (locked && (!battle || reachable(locked))) target = locked;
  if (!target) {
    let bd = Infinity;
    for (const f of foes) { if (battle && !reachable(f)) continue; const d = dist(f); if (d < bd) { bd = d; target = f; } }
  }
  out.target = target;
  const retreating = t < mem.retreatT;
  const front = (f) => inBox(p, f, s.w, p.facing);
  const back = (f) => inBox(p, f, s.w, -p.facing);
  // ── 공격 ──
  let hitF = null, behind = null;
  for (const f of foes) { if (front(f)) { if (!hitF || f.locked) hitF = f; } else if (!behind && back(f)) behind = f; }
  if (!retreating) {
    if (hitF) {
      if ((mem.atkPh = (mem.atkPh + 1) % K.ATK_EVERY) === 0) act.attack = true;
      out.why = 'attack';
    } else if (s.w.up && !s.propsNear && p.onGround && !p.riding && seg && p.cx - seg.x0 > 60 && seg.x1 - p.cx > 60) {
      const up = foes.find((f) => f.flying && inBox(p, f, s.w.up, p.facing));
      if (up) { act.up = true; if ((mem.atkPh = (mem.atkPh + 1) % K.ATK_EVERY) === 0) act.attack = true; out.why = 'up-attack'; }
    }
  }
  // ── 스킬 (0.35초 간격, 한 번에 하나) ──
  if (!retreating && t - mem.skillT >= K.SKILL_GAP && !act.up) {
    for (const sk of s.skills ?? []) {
      if (!sk.ready || (sk.page !== s.page && !battle)) continue;
      const R = sk.range ?? skillRange(null);
      const ok = foes.some((f) => {
        const dx = (f.cx - p.cx) * p.facing, dy = f.bottom - p.bottom;
        return dx > -R.back && dx < R.fx && dy > -R.up - 40 && dy < R.dn + 40;
      });
      if (!ok) continue;
      if (sk.page === s.page) { act[sk.key] = true; mem.skillT = t; out.why = 'skill'; break; }
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
  // ── 이동 ──
  let move = 0;
  // 자동으로 뛴 턱 넘기: 공중에서는 뛴 쪽으로 계속 (땅에 닿으면 끝)
  if (p.onGround) { if (mem.airDir && t > mem.airT + 0.05) mem.airDir = 0; }
  else if (battle && mem.airDir && t < mem.airUntil && !p.noMove) move = mem.airDir;
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
    } else if (target && reachable(target)) {
      const dir = sgn(target.cx - p.cx) || p.facing;
      const nearEdge = dir > 0 ? target.x0 : target.x1;
      const stand = s.w.bx + s.w.bw * (target.boss ? K.STAND_BOSS_K : K.STAND_K);
      let want = nearEdge - dir * stand;
      if (s.w.ranged) want = target.cx - dir * Math.min(s.w.bw * 0.5, 360);
      want = clamp(want, seg.x0, seg.x1);
      if (!hitF || hitF !== target) {
        if (Math.abs(want - p.cx) > 10) { move = sgn(want - p.cx); out.why ||= 'approach'; }
      }
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
    if (move && !act.dash && !(mem.jumpHold > 0)) {
      const h = stepAhead(seg, p.cx, p.halfW ?? 16, move, 26);
      if (h > 0) { mem.jumpHold = h >= 2 ? 30 : 9; mem.airDir = move; mem.airT = t; mem.airUntil = t + 1.0; out.why = 'step'; }
    }
  }
  if (mem.jumpHold > 0) { act.jump = true; mem.jumpHold--; }
  // 돌아서기: 이동하지 않고 공격 중이 아닐 때 대상이 뒤에 있으면 한 스텝 방향 탭 (사람 입력이 없을 때만 input 이 통과시킨다)
  if (!move && !act.dash && !p.moving && t - mem.turnT >= K.TURN_GAP) {
    const tf = hitF ?? target ?? behind;
    const want = tf ? sgn(tf.cx - p.cx) : 0;
    if (want && want !== p.facing && (behind || Math.abs(tf.cx - p.cx) > 24) && (battle || behind || tf.locked)) { move = want; mem.turnT = t; out.why ||= 'turn'; }
  }
  if (move > 0) act.right = true; else if (move < 0) act.left = true;
  if (act.dash && !move) delete act.dash;
  if (!out.why) out.why = target ? 'wait' : 'idle';
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
/** 엔티티 피격 상자 묶음 → {x0,x1,y0,y1} */
function rectOf(e) {
  let hb = null;
  try { hb = e.hurtboxes?.() ?? null; } catch { hb = null; }
  if (!hb || !hb.length) { let h = null; try { h = e.hurtbox?.() ?? null; } catch { h = null; } hb = h ? [h] : [{ x: e.x, y: e.y, w: e.w, h: e.h }]; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of hb) { if (!r || !(r.w > 0)) continue; x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h); }
  if (!(x1 > x0)) { x0 = e.x; x1 = e.x + e.w; y0 = e.y; y1 = e.y + e.h; }
  return { x0, x1, y0, y1 };
}
const HEAVY = new Set(['HEAVY', 'FIXED']);

/** 월드 → snap (decide 입력) */
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
    if (e.kind === 'trigger' && !e.dead) blocks.push({ x0: e.x, x1: e.x + e.w, why: 'story' });
  }
  if (world.arenaX !== undefined && world.room?.boss && !world.bossActive && !world.cleared) blocks.push({ x0: world.arenaX + TILE + p.w / 2 - 6, x1: 1e9, why: 'boss' });
  if (world.arena) { blocks.push({ x0: -1e9, x1: world.arena.x0 + p.w / 2 + 4, why: 'arena' }); blocks.push({ x0: world.arena.x1 - p.w / 2 - 4, x1: 1e9, why: 'arena' }); }
  let seg = null;
  if (p.onGround) {
    if (p.platform && p.platform.w > 0) {
      const pl = p.platform;
      seg = { x0: pl.x + halfW + 6, x1: pl.x + pl.w - halfW - 6, why0: 'platform', why1: 'platform' };
      if (seg.x1 < seg.x0) seg.x0 = seg.x1 = p.cx;
    } else seg = segmentAt(world.map, p.cx, p.bottom, { halfW, bodyTiles: Math.max(1, Math.ceil(p.h / TILE)), blocks });
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
      flying: !!e.noGravity, tele: isBoss && !!e.telegraph, windup, invuln: !!e.invuln || (isBoss && bossIntro), locked: e === lockT,
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
  const w = weaponReach(p.moveSet, st, riding);
  return {
    t: world.time ?? 0, level, cfg,
    p: {
      cx: p.cx, bottom: p.bottom, halfW, facing: p.facing || 1, onGround: !!p.onGround, hpFrac: (p.hp ?? 0) / Math.max(1, st.hp ?? 1),
      mp: p.mp ?? 0, sp: run.sp ?? 0, awReady: !!world.awakenState?.ready, dashReady: !(p.dashCool > 0) && !(p.dashT > 0) && !riding,
      moving: !!(p.move && !p.move.canMove), dead: !!p.dead, hurt: p.hurtT > 0, riding, noMove: mountFly || swim || !!p.wallSlide, inBoss: !!(world.bossActive && boss && !boss.dead),
    },
    w, skills, page: p.skillPage ?? 0, seg, foes, propsNear, pickups, potion, guardReady,
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
  if (!g.autoHud) g.autoHud = { level: 'off', on: false, why: '' };
  // ── 자동 단추: 짧게 = 다음 단계, 길게(0.45초) = 끔 ──
  const ae = btnEdge(BTN, 'auto', inp.human('auto'), t, K.AUTO_HOLD_OFF);
  if (w && ae === 'tap') cycleLevel(g);
  else if (w && ae === 'hold' && levelOf(g) !== 'off') setLevel(g, 'off');
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
  const lv = levelOf(g);
  g.autoHud.level = lv;
  if (!w || lv === 'off') { g.autoHud.on = false; g.autoHud.why = w ? 'off' : 'scene'; if (w) w.autoTarget = null; return null; }
  loadLazy();
  let mem = MEM.get(w);
  if (!mem) { mem = newMem(); MEM.set(w, mem); }
  const cfg = autoSettings(g.settings);
  let snap;
  try { snap = snapshot(w, lv, cfg); } catch (e) { console.error('[autoplay] snapshot', e); return null; }
  const r = decide(snap, mem);
  w.autoTarget = r.target?.e ?? null;
  g.autoHud.on = true; g.autoHud.why = r.why;
  if (r.potion && lazy.inv?.useItem) {
    try {
      const res = lazy.inv.useItem(w.state, w.hero, r.potion, w.player);
      if (res?.ok === false && res.msg) mem.potionT = snap.t + 2;   // 가득 참 등: 조금 뒤에 다시
    } catch (e) { console.error('[autoplay] potion', e); }
  }
  Object.assign(OUT, r.act);
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
