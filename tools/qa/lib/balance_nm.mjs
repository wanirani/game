// 「악몽의 군주」 밸런스 (tools/balance.mjs --nm) — owner: Stage 5 P3b (docs/specs/nightmare.md §3 · §4 · /tmp/claude-0/s5/plan.md §5 P3 acceptance 2)
//  ① 싸움 길이·피해: 25 악몽을 권장 레벨(이야기 레벨 + 10)의 영웅으로 —
//     타수 비 = 악몽 보스 타수 ÷ 이야기 보스 타수(balance.mjs 기준 실행의 그 장 진입 레벨) · 목표 1.3–1.9
//     보스 1타(모션 1.2, 기준 표의 bossTaken 과 같은 단위) ≤ 최대 체력 25% · 비틀기 위험 1타(가장 센 mv)도 함께 본다
//     보스 체력 = boss.js 와 같은 식: enemyStats(악몽 레벨) × def.hpMul × early(이야기 레벨) × late(이야기 레벨) × 악몽 hpMul, 공격 × atkMul
//     영웅 = balance.mjs 의 heroAt(레벨, 장비 줄): 장비는 이야기 기준 실행에서 그 레벨에 처음 닿은 장의 장비 (없으면 마지막 장)
//     참고 열 'min*' = 그 장을 막 깬 영웅 (이야기 실행에서 다음 장 진입 레벨) — 악몽은 레벨 조건이 없다 (1장 플레이어도 악몽 나이트윙)
//  ② 비틀기 감독 시뮬레이션: 진짜 NmDirector (src/game/nm_hazards.js) 를 Node 가짜 월드에서 120초 돌린다 (그 보스방 맵의 경기장 폭).
//     보스의 바닥 공격도 흉내 낸다 (3.2초 ÷ spMul 마다 폭 240 지대, 60% 는 영웅 자리) — 감독은 그것까지 빈 길에 셈한다.
//     laneMax = 매 순간 「폭 safeWidth 의 가장 좋은 길」 아래 판정 중인 지대 수의 최댓값 (목표 ≤ 1) · warnMin = 해로운 위험의 가장 짧은 예고 (≥ 0.6초)
//     bot/분 = 피하는 봇(예고를 보면 가장 가까운 빈 길로 330 px/s, 충격파는 뛴다)이 맞은 비틀기 위험 수 (참고)
//  --check: 타수 비 밖 · 보스 1타 > 25% · laneMax > 1 · warnMin < 0.6 → 종료 코드 1
import { STAGES } from '../../../src/data/stages.js';
import { BOSSES } from '../../../src/data/bosses.js';
import { CHARACTERS } from '../../../src/data/characters.js';
import { enemyStats } from '../../../src/game/enemy.js';
import { NM, NM_IDS, NM_TWISTS, nmLevel, nmRecLevel } from '../../../src/data/nightmare.js';

export const NM_TARGET = { ratio: [1.3, 1.9], bossHit: 25, laneMax: 1, warnMin: 0.6 };
const TILE = 48;
/** 비틀기 위험의 피해 배율 (nm_hazards.js 의 mv — 하수인은 그 적 자체라 없다) */
const TWIST_MV = { blood_rain: 0.55, cursed_floor: 0.35, doom_clock: 0.6, brand: 0.75 };

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

/** 보스 체력·공격 (boss.js 와 같은 식) at 레벨 lv, 모양 레벨 shape, 배율 e(없으면 이야기) */
export function bossAt(b, lv, shape, D, e = null) {
  const bs = enemyStats({ ...b, lv }, lv, { ...D, enemyHp: D.bossHp ?? D.enemyHp }, false);
  const early = 1 + Math.max(0, 10 - (shape - 1)) * 0.1, late = 1 / (1 + Math.max(0, shape - 24) * 0.035);
  bs.maxHp = Math.round(bs.maxHp * (b.hpMul ?? 1) * early * late * (e?.hpMul ?? 1));
  if (e) bs.atk = Math.round(bs.atk * (e.atkMul ?? 1));
  return bs;
}

// ═════════ ② 비틀기 감독 시뮬레이션 (진짜 NmDirector · 가짜 월드) ═════════
/** 보스방 맵 → 경기장 { x0, x1, floor } (world.startBoss: x0 = 'X' 칸, x1 = 맵 폭 · 보스 바닥 = (높이 − 2) 칸) */
export function arenaOfStage(sid) {
  const m = STAGES[sid]?.rooms?.boss?.map;
  if (!Array.isArray(m)) return null;
  const row = m.findIndex((r) => r.includes('X'));
  const x0 = row >= 0 ? m[row].indexOf('X') * TILE : TILE * 4;
  return { x0, x1: m[0].length * TILE, floor: (m.length - 2) * TILE };
}
/** 구간 [a, b] 와 겹치는가 */
const hitsIv = (iv, a, b) => iv[0] < b && iv[1] > a;
/** 폭 sw 의 길을 어디에 두든 겹치는 지대 수의 최솟값 (8 px 걸음) */
function bestLane(ivs, x0, x1, sw) {
  if (!ivs.length) return 0;
  let best = Infinity;
  for (let s = x0; s <= x1 - sw + 0.01; s += 8) {
    let n = 0;
    for (const iv of ivs) if (hitsIv(iv, s, s + sw)) n++;
    if (n < best) best = n;
    if (best === 0) break;
  }
  return Number.isFinite(best) ? best : ivs.length;
}
/** 빈 틈 목록 [[a, b], …] (합친 구간 밖) */
function gaps(ivs, x0, x1) {
  const iv = ivs.map(([a, b]) => [Math.max(x0, a), Math.min(x1, b)]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = x0;
  for (const [a, b] of iv) { if (a > cur) out.push([cur, a]); cur = Math.max(cur, b); }
  if (x1 > cur) out.push([cur, x1]);
  return out;
}
/** 지대 → 바닥 구간 (nm_hazards.js claims() 와 같은 규칙) */
const ivOf = (z) => (z.line ? [Math.min(z.line.x0, z.line.x1) - (z.line.th ?? 0), Math.max(z.line.x0, z.line.x1) + (z.line.th ?? 0)] : [z.x, z.x + z.w]);

/** 가짜 보스 바닥 공격 (감독의 claims() 가 e.boss === w.boss 로 센다) */
class FakeBossZone {
  constructor(w, x, wd) { this.kind = 'hazard'; this.boss = w.boss; this.world = w; this.x = x; this.w = wd; this.h = 100; this.y = w._floor - 100; this.t = 0; this.warn = 0.7; this.dur = 0.45; this.dead = false; this.harmless = false; this.started = false; this.fakeBoss = true; }
  get cx() { return this.x + this.w / 2; } get cy() { return this.y + this.h / 2; }
  update(dt) { this.t += dt; if (this.t >= this.warn) this.started = true; if (this.t >= this.warn + this.dur) this.dead = true; }
}

/** 한 악몽의 감독을 secs 초 돌린다 → 통계 */
export async function simDirector(id, { secs = 120, dt = 1 / 30, seed = 7, bossAttacks = true } = {}) {
  const HZ = await import('../../../src/game/nm_hazards.js');
  const e = NM[id], A0 = arenaOfStage(e.stage);
  const realRandom = Math.random;
  Math.random = mulberry32(seed * 7919 + Number(e.stage.slice(1)) * 101);
  try {
    const floor = A0.floor;
    const w = {
      _floor: floor, entities: [], time: 0, rt: 0, timeStop: 0, bossActive: true, cleared: false, cutscene: false, transitioning: false, freezeEnemies: false, trialEnded: false,
      stage: { id: e.stage, level: (STAGES[e.stage]?.level ?? 1) + 8 }, lighting: { darkness: 0.3 }, camera: null, fx: null, game: { viewW: 960, viewH: 540 },
      add(z) { this.entities.push(z); if (!z.world) z.world = this; return z; },
      arenaFloorY() { return floor; },
      spawnEnemy(eid, x, y) { const en = { kind: 'enemy', id: eid, x: x - 20, y: y - 60, w: 40, h: 60, dead: false, t: 0, update(d) { this.t += d; if (this.t > 14) this.dead = true; }, get cx() { return this.x + 20; }, get cy() { return this.y + 30; } }; this.entities.push(en); return en; },
    };
    const px0 = A0.x0 + 96;
    const p = w.player = { x: px0, y: floor - 90, w: 40, h: 90, dead: false, vx: 0, vy: 0, get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; }, hurtbox() { return { x: -1e6, y: -1e6, w: 1, h: 1 }; } };
    const A = { x0: A0.x0, x1: A0.x1, floor, top: floor - 640 };
    const b = w.boss = { kind: 'boss', A, phase: 0, dead: false, dying: 0, invuln: false, pendingBoss: false, w: 140, h: 160, stats: { atk: 100, maxHp: 1 }, get cx() { return (A.x0 + A.x1) / 2 + 160; }, get cy() { return floor - 80; }, get bottom() { return floor; } };
    const d = HZ.startDirector(w, e);
    const SW = HZ.safeWidth(w);
    const st = { laneMax: 0, laneZeroT: 0, claimLaneMax: 0, hits: 0, waves: 0, jumped: 0, t: 0, maxActive: 0 };
    const hitSeen = new Map();
    let bossNext = 3, wanderT = 0, goal = p.cx, jumpT = 0;
    const steps = Math.round(secs / dt);
    for (let i = 0; i < steps; i++) {
      w.time += dt; w.rt += dt;
      const T = i * dt;
      b.phase = T < secs / 3 ? 0 : T < (2 * secs) / 3 ? 1 : 2;
      // 보스의 바닥 공격 (흉내)
      if (bossAttacks) {
        bossNext -= dt;
        if (bossNext <= 0) {
          bossNext = 3.2 / (e.spMul ?? 1);
          const wd = 240, near = Math.random() < 0.6;
          const x = Math.max(A.x0, Math.min(A.x1 - wd, near ? p.cx - wd / 2 + (Math.random() - 0.5) * 120 : A.x0 + Math.random() * (A.x1 - A.x0 - wd)));
          w.add(new FakeBossZone(w, x, wd));
        }
      }
      for (const z of w.entities) if (!z.dead) z.update?.(dt, w);
      w.entities = w.entities.filter((z) => !z.dead);
      // 지대 분류: 감독(주인 대리) 해로운 지대 · 보스 흉내 지대 · 충격파(뛰어 피함)
      const harm = w.entities.filter((z) => z.kind === 'hazard' && !z.harmless && (z.boss === d.own || z.fakeBoss));
      const isWave = (z) => d.twist === 'doom_clock' && z.boss === d.own && z.w === 44 && z.h === 44;
      const active = harm.filter((z) => (z.fakeBoss ? z.started : z.t >= z.warn));
      st.maxActive = Math.max(st.maxActive, active.filter((z) => !z.fakeBoss).length);
      const lane = bestLane(active.filter((z) => !isWave(z)).map(ivOf), A.x0, A.x1, SW);
      if (lane > st.laneMax) st.laneMax = lane;
      if (lane === 0) st.laneZeroT += dt;
      const claimLane = bestLane(harm.filter((z) => !isWave(z)).map(ivOf), A.x0, A.x1, SW);
      if (claimLane > st.claimLaneMax) st.claimLaneMax = claimLane;
      // 피하는 봇: 위협(예고·판정 중, 충격파 제외)이 영웅 자리에 있으면 가장 가까운 빈 틈 가운데로
      const threats = harm.filter((z) => !isWave(z)).map(ivOf);
      const me = [p.x, p.x + p.w];
      if (threats.some((iv) => hitsIv(iv, me[0], me[1]))) {
        const g = gaps(threats, A.x0 + 8, A.x1 - 8).filter(([a, bb]) => bb - a >= p.w + 8);
        if (g.length) {
          let bestX = goal, bd = Infinity;
          for (const [a, bb] of g) { const c = Math.max(a + p.w / 2 + 4, Math.min(bb - p.w / 2 - 4, p.cx)); const dd = Math.abs(c - p.cx); if (dd < bd) { bd = dd; bestX = c; } }
          goal = bestX;
        }
      } else if ((wanderT -= dt) <= 0) { wanderT = 2; goal = A.x0 + 80 + Math.random() * (A.x1 - A.x0 - 160); }
      const step = Math.max(-330 * dt, Math.min(330 * dt, goal - p.cx));
      p.x = Math.max(A.x0 + 4, Math.min(A.x1 - p.w - 4, p.x + step));
      // 충격파: 앞머리가 영웅 80 px 안으로 다가오면 뛴다 (0.55초 공중)
      jumpT = Math.max(0, jumpT - dt);
      for (const z of active) if (isWave(z) && Math.abs(z.x + z.w / 2 - p.cx) < 80 && jumpT <= 0) { jumpT = 0.55; st.jumped++; }
      // 맞음 (감독 지대만 · 판정 중 · 영웅 자리와 겹침 · 지대마다 rehit 간격)
      for (const z of active) {
        if (z.fakeBoss) continue;
        if (isWave(z) && jumpT > 0) continue;
        const iv = ivOf(z);
        if (!hitsIv(iv, me[0], me[1])) continue;
        const last = hitSeen.get(z), gap = z.attack?.rehit ?? Infinity;
        if (last == null || (Number.isFinite(gap) && w.time - last >= gap)) { hitSeen.set(z, w.time); st.hits++; if (isWave(z)) st.waves++; }
      }
    }
    const S = d.stats;
    return { id, twist: e.twist, arena: Math.round(A.x1 - A.x0), sw: SW, spawned: S.spawned, tolls: S.tolls, summoned: S.summoned, skipped: S.skipped, rejects: S.rejects,
      warnMin: Number.isFinite(S.minWarn) ? r2(S.minWarn) : null, maxActive: st.maxActive, laneMax: st.laneMax, claimLaneMax: st.claimLaneMax,
      laneZeroPct: Math.round((st.laneZeroT / secs) * 100), botHitsPerMin: r1(st.hits / (secs / 60)), jumped: st.jumped, hazard: !!NM_TWISTS[e.twist]?.hazard };
  } finally { Math.random = realRandom; }
}

// ═════════ ① 싸움 길이 · 피해 ═════════
/** 영웅 레벨 상한 (balance.mjs 기준 실행과 같은 99) */
const LV_MAX = 99;
/** 넘친 레벨 열: 권장 + 20 · 권장 + 40 · Lv 99 (모두 99 이하) */
export const NM_OVER_COLS = [['r20', 20], ['r40', 40], ['r99', null]];
/**
 * base = balance.mjs simulate(cid) 결과 ({ rows, combo, heroAt }) · dmg = balance.mjs dmg(src, tgt, mv, mag)
 * → 악몽 25 줄 { id, boss, twist, sLv, sHits, sTaken, rec, nmLv, hits, ratio, taken, vsStory, hazHit, sec, r20, r40, r99, t99, minLv, minRatio, minTaken }
 *   vsStory = 보스 1타 ÷ 같은 보스의 이야기 1타 (같은 난이도) · r20/r40/r99 = 권장 + 20 · + 40 · Lv 99 영웅의 타수 비 (넘친 레벨, 장비 = 그 레벨에 처음 닿은 장)
 */
export function nmFights({ base, dmg, D, cid }) {
  const mag = CHARACTERS[cid].weaponType === 'staff';
  const rows = base.rows, idxOf = (sid) => rows.findIndex((r) => r.stage === sid);
  const gearIdx = (lv) => { const k = rows.findIndex((r) => r.plv >= lv); return k >= 0 ? k : rows.length - 1; };
  const fight = (P, bs) => {
    const d1 = dmg(P, bs, 1.0, mag);
    const hits = Math.ceil(bs.maxHp / d1);
    const taken = dmg(bs, { def: P.def, dmgReduce: P.dmgReduce }, 1.2) / P.hp * 100;
    return { d1, hits, taken };
  };
  const out = [];
  for (const id of NM_IDS) {
    const e = NM[id], S = STAGES[e.stage], b = BOSSES[S?.boss];
    const i = idxOf(e.stage), story = rows[i];
    if (!S || !b || !story) { out.push({ id, err: 'missing' }); continue; }
    // 권장 레벨
    const rec = nmRecLevel(e), nmLv = nmLevel(e, rec);
    const P = base.heroAt(rec, gearIdx(rec), []).s;
    const bs = bossAt(b, nmLv, S.level, D, e);
    const f = fight(P, bs);
    const hazMv = TWIST_MV[e.twist] ?? 0;
    const hazHit = hazMv ? dmg(bs, { def: P.def, dmgReduce: P.dmgReduce }, hazMv) / P.hp * 100 : 0;
    const sHits = Math.max(1, story.bossHits);
    // 넘친 레벨 (MAJOR-2): 영웅이 권장보다 높으면 악몽 레벨도 따라 오른다 (영웅 − 2)
    const over = {};
    let t99 = 0;
    for (const [k, add] of NM_OVER_COLS) {
      const hl = add == null ? LV_MAX : Math.min(LV_MAX, rec + add), nl = nmLevel(e, hl);
      const Po = base.heroAt(hl, gearIdx(hl), []).s;
      const fo = fight(Po, bossAt(b, nl, S.level, D, e));
      over[k] = r2(fo.hits / sHits);
      if (add == null) t99 = r1(fo.taken);
    }
    // 막 깬 영웅 (다음 장 진입 레벨 = 이 장의 이야기 실행 끝)
    const minHeroLv = rows[i + 1]?.plv ?? base.sideEndLevel ?? story.plv;
    const minNmLv = nmLevel(e, minHeroLv);
    const Pm = base.heroAt(minHeroLv, i, []).s;
    const fm = fight(Pm, bossAt(b, minNmLv, S.level, D, e));
    out.push({
      id, boss: b.id ?? S.boss, twist: e.twist, sLv: story.plv, sHits: story.bossHits, sTaken: story.bossTaken,
      rec, nmLv, hits: f.hits, ratio: r2(f.hits / sHits), taken: r1(f.taken), vsStory: story.bossTaken > 0 ? r2(f.taken / story.bossTaken) : null, hazHit: r1(hazHit),
      sec: Math.round(bs.maxHp / (f.d1 * (base.combo?.perSec ?? 3))),
      ...over, t99,
      minLv: minHeroLv, minNmLv, minRatio: r2(fm.hits / sHits), minTaken: r1(fm.taken),
    });
  }
  return out;
}

const ANCHOR = ['s11', 's12', 's13'];   // balance.mjs 의 「1부 기준 보정」 과 같은 장
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };

/**
 * --nm 본체 → 종료 코드 (0 통과 · 1 목표 밖)
 *  판정 (balance.mjs --check 의 관례 그대로 — 목표는 기준 영웅 카엘, 다른 영웅은 「1부 기준 보정 ±30%」):
 *   타수 비: 카엘 1.3–1.9 · 여러 영웅이면 일곱 가운데값도 1.3–1.9, 영웅 하나하나는 ±30% (0.91–2.47)
 *   보스 1타 (NM-TUNE, MAJOR-1 결정): 카엘 ≤ nmHitCap(난이도) — 쉬움 12.5% · 보통 25% (글자 그대로) · 어려움 28% —
 *            그리고 ≤ 1.25 × 같은 보스의 이야기 1타 (같은 난이도, 모든 난이도). 다른 영웅은 상한 × (영웅 ÷ 카엘, 이야기 s11–s13
 *            보스 1타 평균 비율) × 1.3 · 이야기 대비 1.25 × 1.3. 비틀기 위험 1타도 같은 절대 상한
 *   넘친 레벨 (NM-TUNE, MAJOR-2 결정): 권장 + 20 영웅의 타수 비 ≥ 0.9 (모든 줄) · Lv 99 영웅의 타수 비 가운데값(25 줄) ≤ 2.5 —
 *            다른 영웅은 ±30% (≥ 0.63 · ≤ 3.25)
 */
export async function runNm({ simulate, dmg, D, diffId, heroes, check, json, secs = 120 }) {
  const sims = [];
  for (const id of NM_IDS) sims.push(await simDirector(id, { secs }));
  const simOf = Object.fromEntries(sims.map((s) => [s.id, s]));
  const fails = [];
  const byHero = {};
  const cap0 = nmHitCap(diffId, D);
  const kaelRows = nmFights({ base: simulate('kael'), dmg, D, cid: 'kael' });
  const [lo, hi] = NM_TARGET.ratio;
  const T = NM_TARGET.over, VS = NM_TARGET.hitVsStory;
  const summary = {};
  for (const cid of heroes) {
    const rows = cid === 'kael' ? kaelRows : nmFights({ base: simulate(cid), dmg, D, cid });
    byHero[cid] = rows;
    const kael = cid === 'kael';
    // 영웅 ÷ 카엘 (이야기 보스 1타, s11–s13 평균) — 다른 영웅의 상한 보정
    const rs = ANCHOR.map((s) => { const a = rows.find((r) => r.id === 'nm_' + s)?.sTaken, b = kaelRows.find((r) => r.id === 'nm_' + s)?.sTaken; return a > 0 && b > 0 ? a / b : null; }).filter((x) => x != null);
    const k = kael ? 1 : (rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 1) * 1.3;
    const cap = r1(cap0 * k), rlo = kael ? lo : r2(lo * 0.7), rhi = kael ? hi : r2(hi * 1.3);
    const vsCap = kael ? VS : r2(VS * 1.3), r20lo = kael ? T.rec20Min : r2(T.rec20Min * 0.7), r99hi = kael ? T.lv99Med : r2(T.lv99Med * 1.3);
    for (const r of rows) {
      if (r.err) { fails.push({ hero: cid, id: r.id, key: 'data', value: r.err }); continue; }
      r.cap = cap;
      if (!(r.ratio >= rlo && r.ratio <= rhi)) fails.push({ hero: cid, id: r.id, key: 'ratio', value: r.ratio, want: `${rlo}–${rhi}` });
      if (!(r.taken <= cap)) fails.push({ hero: cid, id: r.id, key: 'bossHit%', value: r.taken, want: `≤ ${cap}` });
      if (!(r.vsStory != null && r.vsStory <= vsCap)) fails.push({ hero: cid, id: r.id, key: 'hitVsStory', value: r.vsStory, want: `≤ ${vsCap}` });
      if (!(r.hazHit <= cap)) fails.push({ hero: cid, id: r.id, key: 'hazardHit%', value: r.hazHit, want: `≤ ${cap}` });
      if (!(r.r20 >= r20lo)) fails.push({ hero: cid, id: r.id, key: 'ratio@rec+20', value: r.r20, want: `≥ ${r20lo}` });
    }
    const ok = rows.filter((r) => !r.err);
    const m99 = r2(med(ok.map((r) => r.r99)));
    if (!(m99 <= r99hi)) fails.push({ hero: cid, id: 'median', key: 'ratio@Lv99', value: m99, want: `≤ ${r99hi}` });
    const span = (key) => { const v = ok.map((r) => r[key]).filter(Number.isFinite); return v.length ? [Math.min(...v), Math.max(...v)] : [null, null]; };
    summary[cid] = { cap, vsCap, ratio: span('ratio'), taken: span('taken'), vsStory: span('vsStory'), r20: span('r20'), r40: span('r40'), r99: span('r99'), med99: m99, med40: r2(med(ok.map((r) => r.r40))), med20: r2(med(ok.map((r) => r.r20))) };
  }
  if (heroes.length > 1) {
    for (const id of NM_IDS) {
      const m = r2(med(heroes.map((h) => byHero[h].find((r) => r.id === id)?.ratio).filter(Number.isFinite)));
      if (!(m >= lo && m <= hi)) fails.push({ hero: 'median', id, key: 'ratio', value: m, want: `${lo}–${hi}` });
    }
  }
  for (const s of sims) {
    if (s.laneMax > NM_TARGET.laneMax) fails.push({ hero: '-', id: s.id, key: 'laneMax', value: s.laneMax, want: `≤ ${NM_TARGET.laneMax}` });
    if (s.hazard && s.warnMin != null && s.warnMin < NM_TARGET.warnMin) fails.push({ hero: '-', id: s.id, key: 'warnMin', value: s.warnMin, want: `≥ ${NM_TARGET.warnMin}` });
    if (s.hazard && !(s.spawned > 0 || s.tolls > 0 || s.summoned > 0)) fails.push({ hero: '-', id: s.id, key: 'noHazard', value: 0, want: '> 0' });
  }
  if (json) {
    console.log(JSON.stringify({ diff: diffId, heroes, target: NM_TARGET, hitCap: cap0, secs, summary, fights: byHero, sims, fails }, null, 1));
  } else {
    for (const cid of heroes) {
      console.log(`${diffId} · ${cid} — 악몽 25 (권장 레벨 = 이야기 레벨 + 10 · 이야기 = balance 기준 실행의 진입 레벨)  목표: 타수 비 ${NM_TARGET.ratio.join('–')} · 보스 1타 ≤ ${byHero[cid][0]?.cap ?? cap0}% · 이야기 대비 ≤ ${summary[cid].vsCap}× · 권장+20 타수 비 ≥ ${cid === 'kael' ? T.rec20Min : r2(T.rec20Min * 0.7)} · Lv99 가운데값 ≤ ${cid === 'kael' ? T.lv99Med : r2(T.lv99Med * 1.3)}`);
      console.table(byHero[cid].map((r) => ({ ...r, ...(simOf[r.id] ? {} : {}) })));
      const S = summary[cid];
      console.log(`  ${cid}: 타수 비 ${S.ratio.join('–')} · 1타 ${S.taken.join('–')}% · 이야기 대비 ${S.vsStory.join('–')}× · 권장+20 ${S.r20.join('–')} (가운데 ${S.med20}) · 권장+40 ${S.r40.join('–')} (가운데 ${S.med40}) · Lv99 ${S.r99.join('–')} (가운데 ${S.med99})`);
    }
    console.log(`비틀기 감독 시뮬레이션 (진짜 NmDirector · ${secs}초 · 보스 바닥 공격 흉내 포함)  목표: laneMax ≤ ${NM_TARGET.laneMax} · warnMin ≥ ${NM_TARGET.warnMin}초`);
    console.table(sims.map((s) => ({ id: s.id, twist: s.twist, arena: s.arena, sw: s.sw, spawned: s.spawned, tolls: s.tolls, summoned: s.summoned, skipped: s.skipped, rejects: s.rejects, warnMin: s.warnMin, maxActive: s.maxActive, laneMax: s.laneMax, claimLane: s.claimLaneMax, lane0Pct: s.laneZeroPct, 'bot/분': s.botHitsPerMin })));
    if (check) {
      if (!fails.length) console.log(`✓ 악몽 밸런스 목표 안 (${diffId} · ${heroes.join(',')})`);
      else { console.log(`✗ 악몽 밸런스 목표 밖 ${fails.length}칸:`); for (const f of fails) console.log(`   ${f.hero} ${f.id} ${f.key} = ${f.value}  (목표 ${f.want})`); }
    }
  }
  return check && fails.length ? 1 : 0;
}
