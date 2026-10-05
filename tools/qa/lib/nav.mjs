// 플레이스루 봇 길찾기 (tools/qa/playthrough.mjs).
//
//   const grid = new Grid(snap)                       페이지 world.map 스냅숏(타일 배열) → typeAt (TileMap 과 같은 규칙)
//   const hero = heroModel(info)                      실제 영웅 수치 (p.w/h, moveProfile().speed, jumpVel(), maxAirJumps())
//   const nav = new RoomNav(grid, hero, goal, opts)   설 수 있는 칸 그래프 + 매크로(점프·낙하) 결과 + 목표까지 남은 비용
//   nav.nodeAt(state) · nav.best(node) · nav.simulate(state, macro, plats)
//
// 영웅 이동은 core/physics.js moveBody 를 그대로 쓰고, player.update 의 순서(접지 → 가속 → 점프 버퍼·이단점프·가변 점프 → 물리 →
// 얕은 물 감속)를 따라 한 스텝씩 굴린다. 깊은 물(수영)·상승 기류는 gimmicks.js 의 수치로 흉내 낸다. 바람·적 넉백은 모델에 없다
// (실행기가 닫힌 고리로 다시 계획한다).
import { moveBody, T, isSolidType, touchesType } from '../../../src/core/physics.js';

export const TILE = 48;
export const DT = 1 / 60;
const WATER_GRAV = 0.24, UPDRAFT_GRAV = 0.3;   // gimmicks.js 와 같게
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

export class Grid {
  constructor(s) {
    this.w = s.w; this.h = s.h; this.tiles = Uint8Array.from(s.tiles);
    this.openLeft = !!s.openL; this.openRight = !!s.openR;
    this.updraft = new Set(s.updraft || []);
    this.deep = !!s.deep;
    this.liquid = s.liquid || 'water';
  }
  get pxW() { return this.w * TILE; }
  get pxH() { return this.h * TILE; }
  typeAt(tx, ty) {
    if (ty < 0) return tx < 0 || tx >= this.w ? T.EMPTY : T.EMPTY;
    if (ty >= this.h) return T.EMPTY;
    if (tx < 0) return this.openLeft ? T.EMPTY : T.SOLID;
    if (tx >= this.w) return this.openRight ? T.EMPTY : T.SOLID;
    return this.tiles[ty * this.w + tx];
  }
  typeAtPx(x, y) { return this.typeAt(Math.floor(x / TILE), Math.floor(y / TILE)); }
  solid(tx, ty) { return isSolidType(this.typeAt(tx, ty)); }
  floor(tx, ty) { const t = this.typeAt(tx, ty); return isSolidType(t) || t === T.ONEWAY; }
  hash() { let h = 2166136261; for (let i = 0; i < this.tiles.length; i++) { h ^= this.tiles[i]; h = Math.imul(h, 16777619); } return h >>> 0; }
}

export function heroModel(i) {
  return { w: i.w, h: i.h, speed: i.speed, jump: i.jump, airJumps: i.airJumps, wallJump: !!i.wallJump };
}

// ── 매크로: 프레임별 키 일정 ({f, keys:{left,right,jump,down}}: 그 프레임부터 그 상태) ─────────────────
// d = 방향(±1|0), H = 점프 키를 누르는 프레임 수, j2 = 이단점프를 누르는 프레임(없으면 null), S/R = 방향 키를 누르기 시작/떼는 프레임
function jumpMacro(d, H, j2, S, R, tag) {
  const ev = new Map();
  const at = (f) => { if (!ev.has(f)) ev.set(f, {}); return ev.get(f); };
  at(0).jump = true;
  at(H).jump = false;
  if (j2 != null) { at(j2).jump = true; at(j2 + 40).jump = false; }
  const dk = d > 0 ? 'right' : 'left';
  if (d) { at(S)[dk] = true; if (R != null) at(R)[dk] = false; }
  return { id: tag, d, events: [...ev.entries()].sort((a, b) => a[0] - b[0]).map(([f, k]) => ({ f, k })) };
}
function buildMacros() {
  const M = [];
  const J = [[3, null], [8, null], [40, null], [14, 16], [22, 24], [32, 34]];
  for (const d of [-1, 1]) {
    for (const [H, j2] of J) for (const S of [0, 12]) for (const R of [null, 8, 16, 26]) {
      if (R != null && R <= S) continue;
      M.push(jumpMacro(d, H, j2, S, R, `j${d > 0 ? 'R' : 'L'}${H}${j2 ? '+' + j2 : ''}s${S}r${R ?? '-'}`));
    }
    // 걸어서 떨어지기: 방향을 R 프레임 누름
    for (const R of [10, 20, null]) {
      const dk = d > 0 ? 'right' : 'left';
      const events = [{ f: 0, k: { [dk]: true } }];
      if (R != null) events.push({ f: R, k: { [dk]: false } });
      M.push({ id: `w${d > 0 ? 'R' : 'L'}${R ?? '-'}`, d, walk: true, events });
    }
  }
  for (const [H, j2] of J) M.push(jumpMacro(0, H, j2, 0, null, `jU${H}${j2 ? '+' + j2 : ''}`));
  // 발판 아래로 내려가기 (↓+점프)
  M.push({ id: 'drop', d: 0, drop: true, events: [{ f: 0, k: { down: true, jump: true } }, { f: 4, k: { jump: false } }, { f: 8, k: { down: false } }] });
  for (const d of [-1, 1]) {
    const dk = d > 0 ? 'right' : 'left';
    M.push({ id: `drop${d > 0 ? 'R' : 'L'}`, d, drop: true, events: [{ f: 0, k: { down: true, jump: true } }, { f: 4, k: { jump: false } }, { f: 6, k: { down: false, [dk]: true } }, { f: 22, k: { [dk]: false } }] });
  }
  return M;
}
export const MACROS = buildMacros();
export const macroById = (id) => MACROS.find((m) => m.id === id);

// ── 이동 발판 예측 (props.js MovingPlatform.update / CrumblePlatform 과 같은 규칙) ─────────────────────
export function platObjects(raw) {
  return (raw || []).map((p) => ({ ...p, dead: false, solidOnly: p.kind === 'F' && p.state !== 'idle' && p.state !== 'shake' }));
}
export function advancePlats(pl) {
  for (const p of pl) {
    if (p.kind === 'F') {
      p.vx = 0; p.vy = 0; p.st += DT;
      if (p.state === 'shake' && p.st > 0.45) { p.state = 'fall'; p.st = 0; p.fallV = 0; p.solidOnly = true; }
      else if (p.state === 'fall') { p.fallV = (p.fallV ?? 0) + 1800 * DT; p.y += p.fallV * DT; if (p.st > 1.2) { p.state = 'gone'; p.st = 0; p.y = -9999; } }
      else if (p.state === 'gone' && p.st > 2.5) { p.state = 'idle'; p.solidOnly = false; p.x = p.ox; p.y = p.oy; }
      continue;
    }
    const px = p.x, py = p.y;
    if (p.vertical) {
      p.y += p.dir * p.speed * DT;
      if (p.y > p.oy + p.range || p.y < p.oy) p.dir *= -1;
      p.y = Math.max(p.oy, Math.min(p.oy + p.range, p.y));
    } else {
      p.x += p.dir * p.speed * DT;
      if (p.x > p.ox + p.range || p.x < p.ox) p.dir *= -1;
      p.x = Math.max(p.ox, Math.min(p.ox + p.range, p.x));
    }
    p.vx = (p.x - px) / DT; p.vy = (p.y - py) / DT;
  }
}
const clonePlats = (pl) => pl.map((p) => ({ ...p, onStand: p.kind === 'F' ? function () { if (this.state === 'idle') { this.state = 'shake'; this.st = 0; } } : undefined }));

// ── 영웅 한 스텝 (player.update 순서) ───────────────────────────────────────────────────────────
export function newSimState(o) {
  return { x: o.x, y: o.y, w: o.w, h: o.h, vx: o.vx ?? 0, vy: o.vy ?? 0, onGround: !!o.onGround, coyote: o.onGround ? 0.1 : 0,
    air: o.air ?? 0, jumpCut: o.jumpCut ?? true, jt: 99, jc: true, keys: {}, swimCd: 0, gravity: 1, maxFall: undefined, dropThrough: false, platform: null };
}
function inWater(s, grid) { return touchesType(s, grid, T.LIQUID, 10); }
function simStep(s, hero, grid, plats, kin) {
  const deep = grid.deep;
  const wet = deep && inWater(s, grid);
  if (s.onGround) { s.coyote = 0.1; s.air = hero.airJumps; } else s.coyote -= DT;
  if (s.swimCd > 0) s.swimCd -= DT;
  const ax = (kin.right ? 1 : 0) - (kin.left ? 1 : 0);
  const maxSp = hero.speed * (wet ? 0.72 : 1);
  if (ax) s.vx = approach(s.vx, ax * maxSp, (s.onGround ? 3200 : 2200) * DT);
  else s.vx = approach(s.vx, 0, (s.onGround ? 3600 : 900) * DT);
  // 점프 (버퍼 0.13초)
  if (kin.jump && !s.keys.jump) { s.jt = 0; s.jc = false; }
  const buffered = !s.jc && s.jt <= 0.13 + 1e-6;
  if (wet) {
    if (buffered) {
      // 수면 근처면 도약, 아니면 헤엄 (DeepGimmick.onJumpInput)
      const tx = Math.floor((s.x + s.w / 2) / TILE);
      let ty = Math.floor((s.y + 10) / TILE), above = false, blocked = false, sy = s.y;
      if (grid.typeAt(tx, ty) !== T.LIQUID) above = true;
      else { while (ty > 0 && grid.typeAt(tx, ty - 1) === T.LIQUID) ty--; sy = ty * TILE; blocked = grid.solid(tx, ty - 1); }
      if ((above || s.y - sy <= 40) && !blocked) { s.vy = -hero.jump * 0.95; s.jumpCut = false; s.coyote = 0; s.onGround = false; s.jc = true; s.swimCd = 0.16; }
      else if (s.swimCd <= 0) { s.vy = -340; s.jumpCut = true; s.onGround = false; s.swimCd = 0.16; s.jc = true; }
    }
  } else if (buffered) {
    if (s.onGround && kin.down && onOneWay(s, grid)) { s.dropThrough = true; s.y += 2; s.jc = true; }
    else if (s.onGround || s.coyote > 0) { s.vy = -hero.jump; s.coyote = 0; s.jumpCut = false; s.onGround = false; s.jc = true; }
    else if (s.air > 0) { s.air--; s.vy = -hero.jump * 0.9; s.jumpCut = false; s.jc = true; }
  }
  if (!wet && !kin.jump && s.vy < 0 && !s.jumpCut) { s.vy *= 0.5; s.jumpCut = true; }
  s.jt += DT;
  s.keys = { ...kin };
  s.gravity = 1;
  // 기믹 prePhysics: 깊은 물 · 상승 기류
  if (wet) { s.gravity = WATER_GRAV; s.maxFall = kin.down ? 260 : 150; s.air = hero.airJumps; if (kin.down) s.vy += 600 * DT; }
  else s.maxFall = undefined;
  if (grid.updraft.size && overlapsSet(s, grid)) { s.vy = approach(s.vy, -420, 2600 * DT); if (s.gravity > UPDRAFT_GRAV) s.gravity = UPDRAFT_GRAV; }
  moveBody(s, DT, grid, plats);
  s.dropThrough = false;
  if (!deep && touchesType(s, grid, T.LIQUID, 10) && grid.liquid === 'water') { s.vx *= 0.9; if (s.vy > 180) s.vy = 180; }
}
function overlapsSet(s, grid) {
  const x0 = Math.floor(s.x / TILE), x1 = Math.floor((s.x + s.w - 0.01) / TILE), y0 = Math.floor(s.y / TILE), y1 = Math.floor((s.y + s.h - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (tx >= 0 && ty >= 0 && tx < grid.w && grid.updraft.has(ty * grid.w + tx)) return true;
  return false;
}
function onOneWay(s, grid) {
  const ty = Math.floor((s.y + s.h + 2) / TILE), l = Math.floor(s.x / TILE), r = Math.floor((s.x + s.w - 1) / TILE);
  for (let tx = l; tx <= r; tx++) { const t = grid.typeAt(tx, ty); if (t !== T.ONEWAY && t !== T.EMPTY) return false; }
  return true;
}

/**
 * 매크로 하나를 굴린다. → { frames, end: 'land'|'exit'|'fell'|'swim'|'timeout', x, y, plat, exit, hazard, airborne }
 * exits: {R,L,U,D} 이 방에 있는 출구. plats: platObjects (복제해서 씀, 시간에 따라 움직임). 깊은 물이면 물에 들어간 순간 'swim'.
 */
export function simulate(grid, hero, st0, macro, { plats = [], exits = {}, maxF = 150, liquidHurts = false } = {}) {
  const s = newSimState(st0);
  const pl = clonePlats(plats);
  let kin = { ...(st0.keys || {}) };
  let ei = 0, air = !s.onGround, hazard = 0, f = 0;
  const startWet = grid.deep && inWater(s, grid);
  for (f = 0; f < maxF; f++) {
    while (ei < macro.events.length && macro.events[ei].f === f) { kin = { ...kin, ...macro.events[ei].k }; ei++; }
    advancePlats(pl);
    simStep(s, hero, grid, pl, kin);
    if (touchesType(s, grid, T.SPIKE, 6)) hazard += 1;
    if (liquidHurts && touchesType(s, grid, T.LIQUID, 10)) hazard += 1;
    if (exits.R && s.x > grid.pxW - s.w * 0.5) return { frames: f + 1, end: 'exit', exit: 'R', x: s.x, y: s.y, hazard };
    if (exits.L && s.x < -s.w * 0.5) return { frames: f + 1, end: 'exit', exit: 'L', x: s.x, y: s.y, hazard };
    if (exits.U && s.y < -s.h * 0.5) return { frames: f + 1, end: 'exit', exit: 'U', x: s.x, y: s.y, hazard };
    if (exits.D && s.y > grid.pxH) return { frames: f + 1, end: 'exit', exit: 'D', x: s.x, y: s.y, hazard };
    if (s.y > grid.pxH + 60) return { frames: f + 1, end: 'fell', x: s.x, y: s.y, hazard };
    if (!s.onGround) air = true;
    if (grid.deep && !startWet && f > 0 && inWater(s, grid)) return { frames: f + 1, end: 'swim', x: s.x, y: s.y, vx: s.vx, vy: s.vy, hazard };
    if (s.onGround && air) return { frames: f + 1, end: 'land', x: s.x, y: s.y, plat: s.platform ? pl.indexOf(s.platform) : -1, platRef: s.platform ? { ox: s.platform.ox, oy: s.platform.oy, x: s.platform.x, y: s.platform.y } : null, hazard };
    if (startWet && f > 20 && ei >= macro.events.length && !inWater(s, grid) && s.onGround) return { frames: f + 1, end: 'land', x: s.x, y: s.y, plat: -1, hazard };
    if (macro.walk && !air && f > (macro.events[macro.events.length - 1].f || 30) + 6) return { frames: f + 1, end: 'noair', x: s.x, y: s.y, hazard };
  }
  return { frames: f, end: s.onGround ? 'land' : (grid.deep && inWater(s, grid) ? 'swim' : 'timeout'), x: s.x, y: s.y, plat: s.platform ? pl.indexOf(s.platform) : -1, hazard, airborne: air };
}

/**
 * 방 길찾기. 노드 = 발 아래 칸 (tx, fy) (fy = 발이 닿는 타일 행) · 이동 발판 표본 'P<i>:<k>' · 깊은 물 칸 'W<idx>'.
 * goal: { exits:{R,L,U,D}, door:{tx,ty}|null, arenaTx:number|null }
 */
export class RoomNav {
  constructor(grid, hero, goal, { plats = [], god = false, hazardCost = 3, budgetMs = 20000 } = {}) {
    this.grid = grid; this.hero = hero; this.goal = goal; this.god = god;
    this.plats = plats.filter((p) => p.kind !== 'F');       // 이동 발판 (표본 노드)
    this.crumbles = plats.filter((p) => p.kind === 'F');    // 붕괴 발판 (제자리 발판으로 취급)
    this.hazardCost = god ? 0.5 : hazardCost;
    this.edges = new Map();      // node → [{to, cost, macro|null, walk?, frames}]
    this.penalty = new Map();    // `${from}|${macroId}` → 추가 비용 (실패한 매크로)
    this.budgetMs = budgetMs;
    this.h = new Map();
  }
  get W() { return this.grid.w; }
  /** 서 있을 수 있는 정적 노드인가: (tx, fy) 바닥 + 몸 두 칸 비어 있음 */
  standable(tx, fy) {
    const g = this.grid;
    if (tx < 0 || tx >= g.w || fy < 1 || fy > g.h) return false;
    if (!(g.floor(tx, fy) || this.crumbleAt(tx, fy))) return false;
    return !g.solid(tx, fy - 1) && !g.solid(tx, fy - 2);
  }
  crumbleAt(tx, fy) { return this.crumbles.some((c) => Math.floor(c.ox / TILE) === tx && Math.round(c.oy / TILE) === fy); }
  key(tx, fy) { return fy * this.W + tx; }
  decode(n) { if (typeof n === 'string') return null; return { tx: n % this.W, fy: Math.floor(n / this.W) }; }
  /** 노드에 섰을 때 영웅 x (칸 가운데) */
  anchor(n) {
    if (typeof n === 'string') {
      if (n[0] === 'P') { const [i, k] = n.slice(1).split(':').map(Number); const p = this.plats[i]; const s = this.sampleXY(p, k); return { x: s.x + p.w / 2 - this.hero.w / 2, y: s.y - this.hero.h }; }
      if (n[0] === 'W') { const i = +n.slice(1); const tx = i % this.W, ty = Math.floor(i / this.W); return { x: tx * TILE + TILE / 2 - this.hero.w / 2, y: (ty + 1) * TILE - this.hero.h }; }
    }
    const { tx, fy } = this.decode(n);
    return { x: tx * TILE + TILE / 2 - this.hero.w / 2, y: fy * TILE - this.hero.h };
  }
  samples(p) { return Math.max(1, Math.round(p.range / 24) + 1); }
  sampleXY(p, k) { const off = Math.min(p.range, k * 24); return p.vertical ? { x: p.ox, y: p.oy + off } : { x: p.ox + off, y: p.oy }; }
  /** 실제 상태 → 노드 */
  nodeOf(o, platIdx = -1) {
    const g = this.grid;
    if (platIdx >= 0 && o.platRef) {
      const i = this.plats.findIndex((p) => p.ox === o.platRef.ox && p.oy === o.platRef.oy);
      if (i >= 0) { const p = this.plats[i]; const off = p.vertical ? o.platRef.y - p.oy : o.platRef.x - p.ox; return `P${i}:${Math.max(0, Math.min(this.samples(p) - 1, Math.round(off / 24)))}`; }
    }
    const cx = o.x + o.w / 2;
    if (g.deep && touchesType(o, g, T.LIQUID, 10) && !o.onGround) {
      const tx = Math.floor(cx / TILE), ty = Math.floor((o.y + o.h - 1) / TILE);
      return `W${ty * this.W + tx}`;
    }
    const fy = Math.round((o.y + o.h) / TILE);
    const l = Math.floor(o.x / TILE), r = Math.floor((o.x + o.w - 0.01) / TILE);
    let best = null, bd = 1e9;
    for (let tx = l; tx <= r; tx++) if (this.standable(tx, fy)) { const d = Math.abs(tx * TILE + TILE / 2 - cx); if (d < bd) { bd = d; best = tx; } }
    if (best == null) for (const tx of [l - 1, r + 1]) if (this.standable(tx, fy)) { const d = Math.abs(tx * TILE + TILE / 2 - cx); if (d < bd) { bd = d; best = tx; } }
    return best == null ? null : this.key(best, fy);
  }
  /** 목표 노드인가 → 남은 비용(초) 0 이면 도착 */
  isGoal(n) {
    const G = this.goal;
    if (typeof n === 'string') return false;
    const { tx, fy } = this.decode(n);
    if (G.door && tx === G.door.tx && fy === G.door.ty + 1) return true;
    if (G.arenaTx != null && tx >= G.arenaTx + 2) return true;
    return false;
  }
  /** 노드에서 나가는 간선 (게으르게 계산·캐시) */
  out(n) {
    let E = this.edges.get(n);
    if (E) return E;
    E = [];
    const g = this.grid, hero = this.hero, exits = this.goal.exits || {};
    const isW = typeof n === 'string' && n[0] === 'W', isP = typeof n === 'string' && n[0] === 'P';
    const spd = hero.speed;
    if (!isW && !isP) {
      const { tx, fy } = this.decode(n);
      for (const d of [-1, 1]) if (this.standable(tx + d, fy)) E.push({ to: this.key(tx + d, fy), cost: TILE / spd, walk: d, frames: Math.ceil(TILE / spd * 60) });
      // 걸어서 나가는 출구
      if (exits.R && tx === g.w - 1) E.push({ to: 'EXIT', cost: TILE / spd, walk: 1, exit: 'R', frames: 12 });
      if (exits.L && tx === 0) E.push({ to: 'EXIT', cost: TILE / spd, walk: -1, exit: 'L', frames: 12 });
    }
    if (isP) {
      const [i, k] = n.slice(1).split(':').map(Number);
      const p = this.plats[i], N = this.samples(p);
      for (const kk of [k - 1, k + 1]) if (kk >= 0 && kk < N) E.push({ to: `P${i}:${kk}`, cost: 24 / p.speed + 0.05, ride: true, frames: 0 });
    }
    if (isW) {
      const i = +n.slice(1), tx = i % this.W, ty = Math.floor(i / this.W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]]) {
        const nx = tx + dx, ny = ty + dy;
        if (!this.swimCell(nx, ny)) continue;
        if (dx && dy && (!this.swimCell(tx + dx, ty) || !this.swimCell(tx, ty + dy))) continue;
        E.push({ to: `W${ny * this.W + nx}`, cost: Math.hypot(dx, dy) * TILE / (spd * 0.6), swim: [dx, dy], frames: 0 });
      }
      // 물 바닥에 서기
      if (this.standable(tx, ty + 1)) E.push({ to: this.key(tx, ty + 1), cost: 0.3, swim: [0, 1], frames: 0 });
    }
    if (!isW && !isP && g.deep) {
      const { tx, fy } = this.decode(n);
      if (this.swimCell(tx, fy - 1)) E.push({ to: `W${(fy - 1) * this.W + tx}`, cost: 0.3, swim: [0, -1], frames: 0 });
    }
    // 매크로 (점프·낙하·헤엄 도약)
    const a = this.anchor(n);
    const st = { x: a.x, y: a.y, w: hero.w, h: hero.h, vx: 0, vy: 0, onGround: !isW, air: hero.airJumps };
    const plats = isP ? [this.platAt(n)] : this.crumbles.map((c) => ({ ...c, state: 'idle', st: 0, x: c.ox, y: c.oy }));
    if (isP) { const pp = plats[0]; st.y = pp.y - hero.h; }
    const seen = new Map();
    for (const m of MACROS) {
      if (isW && (m.walk || m.drop)) continue;
      if (m.drop && !isP && !onOneWay(st, g)) continue;
      const r = simulate(g, hero, st, m, { plats: plats.map((p) => ({ ...p })), exits, liquidHurts: !this.god && this.liquidHurts });
      let to = null;
      if (r.end === 'exit') to = 'EXIT';
      else if (r.end === 'land') {
        to = r.plat >= 0 && isP ? null : this.nodeOf({ x: r.x, y: r.y, w: hero.w, h: hero.h, onGround: true });
        if (to == null && r.plat >= 0 && !isP) to = this.nodeOf({ x: r.x, y: r.y, w: hero.w, h: hero.h, onGround: true });
      } else if (r.end === 'swim' && g.deep) to = this.nodeOf({ x: r.x, y: r.y, w: hero.w, h: hero.h, onGround: false });
      if (to == null || to === n) continue;
      const cost = r.frames / 60 + 0.25 + r.hazard * this.hazardCost / 10;
      const prev = seen.get(to);
      if (!prev || prev.cost > cost) seen.set(to, { to, cost, macro: m.id, frames: r.frames, exit: r.exit, hazard: r.hazard });
    }
    // 이동 발판 표본으로 뛰어오르기: 표본 위치에 멈춘 발판 하나만 두고 굴린다
    if (!isP) {
      const near = [];
      this.plats.forEach((p, i) => { for (let k = 0; k < this.samples(p); k++) { const s = this.sampleXY(p, k); if (Math.abs(s.x + p.w / 2 - (a.x + hero.w / 2)) < 7 * TILE && Math.abs(s.y - a.y) < 9 * TILE) near.push([i, k, s]); } });
      for (const [i, k, s] of near) {
        const p = { ...this.plats[i], x: s.x, y: s.y, speed: 0, kind: 'M' };
        for (const m of MACROS) {
          if (m.walk && !st.onGround) continue;
          const r = simulate(g, hero, st, m, { plats: [p], exits });
          if (r.end !== 'land' || r.plat !== 0) continue;
          const to = `P${i}:${k}`;
          const cost = r.frames / 60 + 0.25 + this.plats[i].range / this.plats[i].speed / 2;
          const prev = seen.get(to);
          if (!prev || prev.cost > cost) seen.set(to, { to, cost, macro: m.id, frames: r.frames, plat: i });
          break;   // 표본 하나에 매크로 하나면 충분
        }
      }
    }
    for (const e of seen.values()) E.push(e);
    this.edges.set(n, E);
    return E;
  }
  platAt(n) { const [i, k] = n.slice(1).split(':').map(Number); const p = this.plats[i]; const s = this.sampleXY(p, k); return { ...p, x: s.x, y: s.y, speed: 0, kind: 'M' }; }
  swimCell(tx, ty) {
    const g = this.grid;
    if (tx < 0 || tx >= g.w || ty < 0 || ty >= g.h) return false;
    return g.typeAt(tx, ty) === T.LIQUID && !g.solid(tx, ty - 1);
  }
  edgeCost(from, e) { return e.cost + (this.penalty.get(`${from}|${e.macro ?? e.walk ?? e.to}`) ?? 0); }
  penalize(from, e, c = 3) { const k = `${from}|${e.macro ?? e.walk ?? e.to}`; this.penalty.set(k, (this.penalty.get(k) ?? 0) + c); }
  /**
   * 시작 노드에서 앞으로 퍼져 나가며 간선을 만들고(시간 예산 안), 목표에서 거꾸로 Dijkstra → this.h (남은 비용).
   * → 시작 노드의 남은 비용 (Infinity = 길 없음)
   */
  plan(start) {
    const t0 = Date.now();
    // 1) 앞으로 탐색 (닿는 노드만 간선 계산)
    const seen = new Set([start]), q = [start], rev = new Map();
    let goalHit = false;
    while (q.length) {
      const n = q.shift();
      if (this.isGoal(n)) goalHit = true;
      for (const e of this.out(n)) {
        if (!rev.has(e.to)) rev.set(e.to, []);
        rev.get(e.to).push([n, e]);
        if (e.to === 'EXIT') { goalHit = true; continue; }
        if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
      }
      if (Date.now() - t0 > this.budgetMs) break;
    }
    this.reached = seen;
    // 2) 목표에서 거꾸로
    const h = new Map();
    const pq = [];
    const push = (n, c) => { if (h.has(n) && h.get(n) <= c) return; h.set(n, c); pq.push([c, n]); };
    push('EXIT', 0);
    for (const n of seen) if (this.isGoal(n)) push(n, 0);
    while (pq.length) {
      let bi = 0; for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i;
      const [c, n] = pq.splice(bi, 1)[0];
      if (c > (h.get(n) ?? Infinity)) continue;
      for (const [from, e] of rev.get(n) || []) push(from, c + this.edgeCost(from, e));
    }
    this.h = h;
    this.planMs = Date.now() - t0;
    this.goalHit = goalHit;
    return h.get(start) ?? Infinity;
  }
  hOf(n) { return n == null ? Infinity : (this.isGoal(n) ? 0 : (this.h.get(n) ?? Infinity)); }
  /** 노드에서 가장 좋은 간선 */
  best(n) {
    let be = null, bc = Infinity;
    for (const e of this.out(n)) { const c = this.edgeCost(n, e) + (e.to === 'EXIT' ? 0 : this.hOf(e.to)); if (c < bc) { bc = c; be = e; } }
    return be ? { e: be, c: bc } : null;
  }
}
