// 「악몽」 비틀기 감독 — owner: Stage 5 P3 (docs/specs/nightmare.md §2.1 · §4)
//  game/nightmare.js 가 늦게 받는다 (import()) — c_common·b_common 은 보스 조각과 함께 받아지는 모듈이라 첫 화면 번들에 끌려오지 않는다.
//  startDirector(w, entry) → NmDirector (월드 개체, kind 'nmDirector', w.nmDirector). 보스 클래스와 무관하게 돈다:
//   비틀기 지대는 '주인 대리'(owner proxy)가 주인이다 — { world, stats(지금 보스), A(경기장), zone(), telegraphFor: 빈 함수, dying/dead }
//   → c_common 의 strikeColumn · strikeRect · strikeCircle · groundWave 를 그대로 쓰고, 보스의 카운터 창은 열지 않는다.
//  규칙: 한 번에 비틀기 하나 · 모든 위험 예고 ≥ 0.6초 (MIN_WARN) · 바닥에 폭 ≥ SAFE 의 빈 길이 남을 때만 새 위험을 놓는다 ·
//   보스 등장 연출(world.cutscene)·적 정지·클리어·영웅 사망·보스 무적 전환·대역 보스 동안 멈춤 · 시작 뒤 GRACE 초 유예.
//  그리기 경로(paint·draw)에는 난수·fx 생성이 없다 (hook_tags) — 입자는 update/tick/onStart 에서만.
//  QA: w.nmDirector.stats = { spawned, minWarn, maxActive, skipped, rejects, tolls, summoned } · claims() → [[x0, x1], …] 지금 덮인 바닥
import { Entity } from './entity.js';
import { Zone, arenaOf, warnRect, warnCircle, warnFloor, glow, glowE } from './bosses/b_common.js';
import { strikeColumn, strikeRect, strikeCircle, groundWave } from './bosses/c_common.js';
import { NM_TWISTS, NM_COLOR } from '../data/nightmare.js';
import { STAGES } from '../data/stages.js';
import { ENEMIES } from '../data/enemies.js';
import { audio } from '../core/audio.js';
import { clamp, rand, rgba, TAU } from '../core/math.js';

export const MIN_WARN = 0.6;    // 모든 위험의 최소 예고 (초)
export const GRACE = 2.5;       // 보스전 시작 뒤 유예 (초)
const FLOOR_BAND = 60;          // 바닥에 닿는 지대로 보는 높이 (안전한 길 계산)
const CURSE_COL = '#a8123c', RAIN_COL = '#d0142c', CLOCK_COL = '#ffcf9a';
/**
 * [NM-TUNE] 붉은 배경(용광로 s15)에서는 붉은 예고가 묻힌다 (p3_verify MINOR-8: 16 위험 스테이지 가운데 대비가 가장 낮았다).
 * 그 테마에서는 피의 비 예고를 옅은 장밋빛 빗금 + 어두운 테두리로 그린다 (판정·피해·시간은 같고 그림만 다르다)
 */
export const HOT_THEMES = new Set(['forge']);
const RAIN_HOT = '#ffe6ea', EDGE_DARK = 'rgba(14,2,6,0.78)';

/** 경기장 바닥의 빈 길 최소 폭 (영웅 폭의 3배, 160 이상) */
export function safeWidth(w) { return Math.max(160, (w?.player?.w ?? 40) * 3); }
/** 구간들을 합쳐 [x0, x1] 안의 가장 넓은 빈 틈 */
export function widestGap(intervals, x0, x1) {
  const iv = intervals.map(([a, b]) => [Math.max(x0, Math.min(a, b)), Math.min(x1, Math.max(a, b))]).filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let best = 0, cur = x0;
  for (const [a, b] of iv) { if (a > cur) best = Math.max(best, a - cur); cur = Math.max(cur, b); }
  return Math.max(best, x1 - cur);
}

/** 보스전 시작(attachNightmare 의 startBoss) → 감독 하나 (이미 있으면 그것) */
export function startDirector(w, entry) {
  if (!w || !entry) return null;
  if (w.nmDirector && !w.nmDirector.dead) return w.nmDirector;
  const d = new NmDirector(w, entry);
  w.nmDirector = d;
  w.add(d);
  return d;
}

export class NmDirector extends Entity {
  constructor(w, entry) {
    super(0, 0, 10, 10);
    this.kind = 'nmDirector'; this.z = 9;
    this.world = w; this.e = entry; this.tw = NM_TWISTS[entry.twist] ?? null; this.twist = entry.twist;
    this.A = null; this.floor = 0; this.own = null;
    this.fightT = 0; this.next = 0.6; this.clockT = 0; this.tolled = false;
    this.mine = []; this.minions = []; this.stopped = false; this.dark0 = null; this.darkK = 0;
    this.hot = HOT_THEMES.has(STAGES[entry.stage]?.theme);   // [NM-TUNE] 붉은 배경 → 밝은 예고 (MINOR-8)
    this.stats = { spawned: 0, minWarn: Infinity, maxActive: 0, skipped: 0, rejects: 0, tolls: 0, summoned: 0 };
    this._lt = [];
  }
  /** 비틀기 정리 (격파·떠남): 하수인 사라짐 · 어둠 되돌림 · 새 위험 없음 */
  stop(w = this.world) {
    if (this.stopped) return;
    this.stopped = true;
    for (const m of this.minions) if (!m.dead) { m.dead = true; try { w?.fx?.burst?.('smoke', m.cx, m.cy, 10, { speed: 120 }); } catch { /* 없음 */ } }
    this.minions.length = 0;
    if (this.dark0 != null && w?.lighting) w.lighting.darkness = this.dark0;
  }
  /** 경기장 · 주인 대리 (진짜 보스가 준비된 첫 프레임) */
  setup(w) {
    const b = w.boss;
    const A = b.A && Number.isFinite(b.A.x0) ? b.A : arenaOf(w, b);
    const fl = w.arenaFloorY?.(A.x0, A.x1);
    this.floor = Number.isFinite(fl) ? fl : A.floor;
    this.A = { ...A, floor: this.floor, top: Math.min(A.top ?? 0, this.floor - 240), cx: (A.x0 + A.x1) / 2, w: A.x1 - A.x0 };
    const self = this;
    const own = this.own = {
      kind: 'nmHazard', nmHazard: true, id: 'nm_hazard', world: w, A: this.A, facing: 1,
      get stats() { return (w.boss ?? b)?.stats; },
      get dying() { return (w.boss ?? b)?.dying ?? 0; },
      get dead() { return !!(w.cleared || self.stopped || (w.boss ?? b)?.dead); },
      get cx() { return (w.boss ?? b)?.cx ?? self.A.cx; },
      get cy() { return (w.boss ?? b)?.cy ?? self.floor - 100; },
      telegraphFor() {},
      zone(o) { const z = w.add(new Zone(own, o)); self.track(z, o); return z; },
    };
    this.dark0 = w.lighting?.darkness ?? null;
  }
  /** 감독 지대 기록 (예고 길이 · 동시 개수) */
  track(z, o) {
    this.mine.push(z);
    const warn = o.warn ?? 0;
    if (!o.harmless && warn < this.stats.minWarn) this.stats.minWarn = warn;
    this.stats.spawned++;
  }
  paused(w) {
    const b = w.boss, p = w.player;
    return this.stopped || !!w.trialEnded || w.cleared || w.cutscene || w.transitioning || w.freezeEnemies || !w.bossActive
      || !b || b.pendingBoss || b.dead || b.dying > 0 || b.invuln || !p || p.dead;
  }
  phase() { return this.world?.boss?.phase ?? 0; }
  /** 이 비틀기의 간격 (페이즈마다 10% 짧게, 최소 75%) */
  gap(base) { return base * Math.max(0.75, 1 - 0.1 * this.phase()); }

  update(dt, w) {
    this.t += dt;
    if (w.cleared && !this.stopped) this.stop(w);
    if (!this.A) { if (w.boss && !w.boss.pendingBoss && w.bossActive) this.setup(w); else return; }
    // 개체 사각형 = 경기장 (컬링에 잘리지 않게: 시계·어둠 광원)
    const A = this.A; this.x = A.x0; this.y = A.top; this.w = A.w; this.h = this.floor - A.top + 20;
    this.mine = this.mine.filter((z) => !z.dead);
    this.minions = this.minions.filter((m) => !m.dead);
    const act = this.mine.filter((z) => !z.harmless).length;
    if (act > this.stats.maxActive) this.stats.maxActive = act;
    if (this.tw?.dark) this.darkTick(dt, w);
    if (this.paused(w)) return;
    this.fightT += dt;
    if (this.fightT < GRACE) return;
    if (this.twist === 'doom_clock') { this.clockTick(dt, w); return; }
    if (!this.tw?.hazard) return;
    this.next -= dt;
    if (this.next > 0) return;
    switch (this.twist) {
      case 'blood_rain': this.bloodRain(w); this.next = this.gap(2.4); break;
      case 'cursed_floor': this.cursedFloor(w); this.next = this.gap(6.5); break;
      case 'brand': this.brand(w); this.next = this.gap(8); break;
      case 'minions': this.summon(w); this.next = this.gap(9); break;
      default: this.next = 5;
    }
  }

  // ───────── 안전한 길 ─────────
  /** 지금 바닥을 덮은 구간: 감독 지대 + 보스의 위험 지대(바닥 띠에 닿는 것) */
  claims() {
    const w = this.world, out = [];
    const band = this.floor - FLOOR_BAND;
    for (const e of w?.entities ?? []) {
      if (e.dead || e.kind !== 'hazard' || e.harmless) continue;
      if (e.boss !== this.own && e.boss !== w.boss) continue;
      const y0 = e.line ? Math.min(e.line.y0, e.line.y1) : e.y, y1 = e.line ? Math.max(e.line.y0, e.line.y1) : e.y + e.h;
      if (y1 < band || y0 > this.floor + 8) continue;
      out.push(e.line ? [Math.min(e.line.x0, e.line.x1) - (e.line.th ?? 0), Math.max(e.line.x0, e.line.x1) + (e.line.th ?? 0)] : [e.x, e.x + e.w]);
    }
    return out;
  }
  /** 새 바닥 구간들(adds)을 놓아도 빈 길이 남는가 */
  roomFor(adds) {
    const A = this.A, ok = widestGap([...this.claims(), ...adds], A.x0, A.x1) >= safeWidth(this.world);
    if (!ok) this.stats.rejects++;
    return ok;
  }
  clampX(x, half) { return clamp(x, this.A.x0 + half + 8, this.A.x1 - half - 8); }

  // ───────── 피의 비 ─────────
  bloodRain(w) {
    const n = 2 + (this.phase() >= 1 ? 1 : 0), W = 58, half = W / 2, chosen = [];
    const p = w.player, cands = [p.cx + rand(-70, 70)];
    for (let i = 0; i < 10; i++) cands.push(rand(this.A.x0, this.A.x1));
    for (const c of cands) {
      if (chosen.length >= n) break;
      const x = this.clampX(c, half);
      if (chosen.some((q) => Math.abs(q - x) < 130)) continue;
      if (!this.roomFor([...chosen.map((q) => [q - half, q + half]), [x - half, x + half]])) continue;
      chosen.push(x);
    }
    if (!chosen.length) { this.stats.skipped++; return; }
    const fl = this.floor, top = this.A.top, hot = this.hot;
    chosen.forEach((x, i) => strikeColumn(this.own, x, {
      w: W, top, bottom: fl, warn: 0.9 + i * 0.12, life: 0.35, mv: 0.55, color: RAIN_COL, sfx: 'splash', vol: 0.5,
      onStart: (z, wd) => { try { wd.fx?.burst?.('blood', x, fl - 6, 12, { speed: 260 }); } catch { /* 없음 */ } },
      ...(hot ? { paint: (ctx, z, wd) => paintRainHot(ctx, z, wd, x, W, top, fl) } : {}),
    }));
  }

  // ───────── 저주받은 바닥 ─────────
  cursedFloor(w) {
    const A = this.A, sw = safeWidth(w), segW = clamp(A.w * 0.3, 200, Math.max(120, A.w - sw - 60));
    const p = w.player, cands = [];
    if (Math.random() < 0.6) cands.push(p.cx - segW / 2 + rand(-40, 40));
    for (let i = 0; i < 6; i++) cands.push(rand(A.x0, A.x1 - segW));
    for (const c of cands) {
      const x0 = clamp(c, A.x0 + 4, A.x1 - segW - 4);
      if (!this.roomFor([[x0, x0 + segW]])) continue;
      const H = 44, y = this.floor - H;
      strikeRect(this.own, { x: x0, y, w: segW, h: H }, {
        warn: 1.1, life: 2.6, rehit: 0.55, mv: 0.35, color: CURSE_COL, sfx: 'dark', vol: 0.5,
        tick: (z, wd, dt) => { if (z.started && Math.random() < dt * 14) try { wd.fx?.burst?.('smoke', z.x + Math.random() * z.w, z.y + z.h - 4, 1, { speed: 40, color: '#5a0820' }); } catch { /* 없음 */ } },
        paint: (ctx, z, wd) => paintCurse(ctx, z, wd),
      });
      return;
    }
    this.stats.skipped++;
  }

  // ───────── 핏빛 낙인 ─────────
  brand(w) {
    const p = w.player, R0 = 74, fl = this.floor, self = this;
    const x0 = this.clampX(p.cx, R0);
    if (!this.roomFor([[x0 - R0, x0 + R0]])) { this.stats.skipped++; return; }
    audio.sfx('dark', { vol: 0.5, pitch: 1.3 });
    const mark = { x: x0 };
    // 1.0초 따라다니는 낙인 (무해) → 굳은 자리에 0.9초 예고 뒤 폭발
    this.own.zone({
      x: x0 - R0, y: fl - R0 * 2, w: R0 * 2, h: R0 * 2, warn: 0, life: 1.0, harmless: true, z: 7, data: mark,
      tick: (z, wd, dt) => { const q = wd.player; if (q && !q.dead) mark.x = self.clampX(mark.x + clamp(q.cx - mark.x, -520 * dt, 520 * dt), R0); z.x = mark.x - R0; },
      paint: (ctx, z, wd) => paintBrand(ctx, mark.x, fl, R0, z.t, 1, wd),
      onEnd: () => {
        if (self.stopped || self.world?.cleared) return;
        const x = mark.x;
        strikeCircle(self.own, x, fl - R0 * 0.62, R0, {
          warn: 0.9, life: 0.3, mv: 0.75, color: NM_COLOR, sfx: 'explode', vol: 0.6,
          paint: (ctx, z, wd) => { if (!z.started) { paintBrand(ctx, x, fl, R0, 1 + z.t, 2, wd); warnCircle(ctx, x, fl - R0 * 0.62, R0, z.k, NM_COLOR, wd.time); return; } glow(ctx, x, fl - R0 * 0.62, R0 * 1.7, NM_COLOR, 0.95 * (1 - z.a), true); },
        });
      },
    });
  }

  // ───────── 하수인 ─────────
  summon(w) {
    const cap = this.phase() >= 1 ? 3 : 2;
    const room = cap - this.minions.length;
    if (room <= 0) { this.stats.skipped++; return; }
    const ids = this.minionIds(w);
    if (!ids.length) { this.stats.skipped++; return; }
    const k = Math.min(room, this.phase() >= 1 ? 2 : 1), p = w.player, fl = this.floor, self = this;
    for (let i = 0; i < k; i++) {
      let x = null;
      for (let t = 0; t < 8 && x == null; t++) { const c = rand(this.A.x0 + 60, this.A.x1 - 60); if (Math.abs(c - p.cx) >= 220) x = c; }
      if (x == null) { this.stats.skipped++; continue; }
      const id = ids[Math.floor(Math.random() * ids.length)];
      audio.sfx('magic', { vol: 0.45, pitch: 0.7 });
      this.own.zone({
        x: x - 50, y: fl - 100, w: 100, h: 100, warn: 0, life: 0.9, harmless: true, z: 5,
        paint: (ctx, z, wd) => { warnCircle(ctx, x, fl - 6, 46, clamp(z.t / 0.9, 0, 1), NM_COLOR, wd.time); glow(ctx, x, fl - 30, 60, NM_COLOR, 0.5 * clamp(z.t / 0.9, 0, 1)); },
        onEnd: (z, wd) => {
          if (self.stopped || wd.cleared || self.minions.length >= cap) return;
          const en = wd.spawnEnemy(id, x, fl, { level: wd.stage.level, elite: false });
          if (!en) return;
          en.nmMinion = true; en.summoner = wd.boss;
          self.minions.push(en); self.stats.summoned++;
          try { wd.fx?.burst?.('blood', x, fl - 20, 14, { speed: 220 }); wd.fx?.ring?.(x, fl - 20, { color: NM_COLOR, r0: 10, r1: 90, life: 0.4, width: 4 }); } catch { /* 없음 */ }
        },
      });
    }
  }
  minionIds(w) {
    const list = Array.isArray(this.e.minions) && this.e.minions.length ? this.e.minions : (STAGES[this.e.stage]?.enemies ?? []).slice(0, 4);
    return list.filter((id) => Object.hasOwn(ENEMIES, id));
  }

  // ───────── 종말의 시계 ─────────
  clockPeriod() { return Math.max(9, 13 - 1.5 * this.phase()); }
  clockTick(dt, w) {
    const P = this.clockPeriod(), WARN = 1.2;
    const prev = this.clockT;
    this.clockT += dt;
    if (Math.floor(prev) !== Math.floor(this.clockT) && this.clockT < P - WARN) audio.sfx('clock_tick', { vol: 0.25 });
    if (!this.tolled && this.clockT >= P - WARN) {
      this.tolled = true; this.stats.tolls++;
      audio.sfx('bell', { vol: 0.7, pitch: 0.55 });
      const A = this.A, fl = this.floor;
      // 양쪽 벽에서 바닥 충격파 (뛰어서 피한다) — 예고 = 시계가 붉게 떠는 1.2초 + 양 끝 바닥 표식
      groundWave(this.own, A.x0 + 24, 1, { warn: WARN, h: 44, w: 44, speed: 470, to: A.x1 - 8, mv: 0.6, color: NM_COLOR, sfx: 'hit_heavy' });
      groundWave(this.own, A.x1 - 24, -1, { warn: WARN, h: 44, w: 44, speed: 470, to: A.x0 + 8, mv: 0.6, color: NM_COLOR, sfx: null });
      try { w.camera?.shake?.(4, 0.3); } catch { /* 없음 */ }
    }
    if (this.clockT >= P) { this.clockT = 0; this.tolled = false; try { w.camera?.shake?.(10, 0.4); } catch { /* 없음 */ } }
  }

  // ───────── 어둠 ─────────
  darkTick(dt, w) {
    const on = w.bossActive && !w.cleared && !this.stopped;
    this.darkK = clamp(this.darkK + (on ? dt : -dt * 2) * 0.8, 0, 1);
    if (this.dark0 == null || !w.lighting) return;
    w.lighting.darkness = this.dark0 + (this.tw.dark - this.dark0) * this.darkK;
  }
  lights(L) {
    const w = this.world;
    if (!w || !this.A) return;
    if (this.twist === 'doom_clock' && !this.stopped) { const c = this.clockPos(); L.add(c.x, c.y, 90, this.tolled ? NM_COLOR : CLOCK_COL, 0.7); }
    if (!this.tw?.dark || this.darkK <= 0.01) return;
    // 어둠: 보스 · 예고 · 지대 · 적의 탄은 스스로 빛난다 (보이지 않는 공격은 없다)
    const b = w.boss;
    if (b && !b.dead) L.add(b.cx, b.cy, Math.max(160, Math.max(b.w, b.h) * 1.3), '#ff8090', 0.6);
    for (const e of w.entities) {
      if (L.lights.length >= 60) break;
      if (e.dead) continue;
      if (e.kind === 'hazard' && !e.harmless) L.add(e.cx, e.cy, clamp(Math.max(e.w, e.h) * 0.6, 60, 240), e.started ? '#ffd0a0' : NM_COLOR, 0.95);
      else if (e.kind === 'projectile' && e.team === 'enemy') L.add(e.cx, e.cy, 70, '#ffd0a0', 0.85);
      else if (e.kind === 'enemy' && e.nmMinion) L.add(e.cx, e.cy, 70, NM_COLOR, 0.5);
    }
  }

  // ───────── 그리기 (시계) ─────────
  clockPos() {
    const w = this.world, cam = w.camera, z = cam?.zoom || 1, vw = (w.game?.viewW ?? 960) / z, vh = (w.game?.viewH ?? 540) / z;
    const x = cam ? clamp(this.A.cx, cam.x + 80, cam.x + vw - 80) : this.A.cx;
    const y = cam ? cam.y + vh * 0.27 : this.floor - 300;
    return { x, y };
  }
  draw(ctx, w) {
    if (this.twist !== 'doom_clock' || !this.A || this.stopped) return;
    const P = this.clockPeriod(), k = clamp(this.clockT / P, 0, 1), c = this.clockPos(), r = 30;
    const red = this.tolled ? 1 : 0, shake = red ? Math.sin(w.time * 60) * 2 : 0;
    ctx.save();
    ctx.translate(c.x + shake, c.y);
    ctx.globalAlpha = 0.92;
    glow(ctx, 0, 0, r * 2.2, red ? NM_COLOR : '#6a1020', 0.55 + 0.3 * red);
    ctx.fillStyle = 'rgba(14,4,8,0.85)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = red ? NM_COLOR : CLOCK_COL; ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = rgba(NM_COLOR, 0.85);
    ctx.beginPath(); ctx.arc(0, 0, r - 7, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();   // 남은 시간 고리
    ctx.strokeStyle = CLOCK_COL; ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3)); ctx.lineTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8)); ctx.stroke(); }
    const a = -Math.PI / 2 + k * TAU;
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff2e0'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (r - 6), Math.sin(a) * (r - 6)); ctx.stroke();
    ctx.restore();
  }
}

/**
 * 피의 비 (붉은 배경 테마): 예고 = 어두운 테두리 + 옅은 장밋빛 빗금 · 바닥 표식, 판정 = c_common strikeColumn 과 같은 기둥 빛 (결정적 — 난수 없음)
 *  기본 그림은 'lighter' 붉은색이라 용광로의 주황·빨강 위에서 더해도 거의 달라지지 않았다 — 어두운 테두리가 먼저 경계를 끊고, 옅은 빗금이 밝기를 더한다
 */
function paintRainHot(ctx, z, wd, x, w, top, bottom) {
  if (!z.started) {
    const x0 = z.x + z.w * 0.2, ww = z.w * 0.6, h = bottom - top;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = EDGE_DARK; ctx.lineWidth = 4;
    ctx.strokeRect(x0 - 2, top, ww + 4, h);
    ctx.restore();
    warnRect(ctx, x0, top, ww, h, Math.min(1, z.k * 0.8 + 0.25), RAIN_HOT, wd.time);
    warnFloor(ctx, x, bottom, w * 1.4, z.k, RAIN_HOT, wd.time);
    return;
  }
  const f = 1 - z.a;
  glowE(ctx, x, (top + bottom) / 2, w * 0.9, (bottom - top) / 2, RAIN_COL, 0.8 * f);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba('#ffffff', 0.85 * f); ctx.fillRect(x - w * 0.12, top, w * 0.24, bottom - top);
}

/** 저주 띠: 예고 = 사선 경고, 판정 = 맥동하는 검붉은 늪 (결정적 — 난수 없음) */
function paintCurse(ctx, z, wd) {
  if (!z.started) { warnRect(ctx, z.x, z.y, z.w, z.h, z.k, CURSE_COL, wd.time); return; }
  const fade = clamp(Math.min(z.a * 8, (1 - z.a) * 6), 0, 1), pul = 0.5 + 0.5 * Math.sin(wd.time * 7);
  ctx.globalAlpha *= fade;
  ctx.fillStyle = rgba('#3a0414', 0.55); ctx.fillRect(z.x, z.y + z.h * 0.35, z.w, z.h * 0.65);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(CURSE_COL, 0.22 + 0.18 * pul); ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.strokeStyle = rgba('#ff6080', 0.5 + 0.35 * pul); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(z.x, z.y + z.h - 2); ctx.lineTo(z.x + z.w, z.y + z.h - 2); ctx.stroke();
  const n = Math.max(3, Math.floor(z.w / 46));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, ph = wd.time * 2.3 + i * 1.7, h = (Math.sin(ph) * 0.5 + 0.5);
    glow(ctx, z.x + u * z.w, z.y + z.h - 4 - h * z.h * 0.6, 12 + 8 * h, '#ff3050', 0.35 + 0.3 * (1 - h));
  }
}
/** 핏빛 낙인: 바닥의 고리 + 회전하는 가시 (stage 1 = 따라다님, 2 = 굳음) */
function paintBrand(ctx, x, fl, R0, t, stage, wd) {
  const y = fl - 4, rr = R0 * (stage === 1 ? 0.75 + 0.25 * clamp(t, 0, 1) : 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(x, y); ctx.scale(1, 0.32);
  ctx.strokeStyle = rgba(NM_COLOR, stage === 2 ? 0.95 : 0.7); ctx.lineWidth = stage === 2 ? 5 : 3;
  ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, rr * 0.62, 0, TAU); ctx.stroke();
  const spin = wd.time * (stage === 2 ? 4 : 1.6);
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const a = spin + (i / 6) * TAU;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62); ctx.lineTo(Math.cos(a + 0.5) * rr, Math.sin(a + 0.5) * rr); ctx.stroke();
  }
  ctx.restore();
  glow(ctx, x, y - 6, rr * 0.9, NM_COLOR, stage === 2 ? 0.5 : 0.28);
}
