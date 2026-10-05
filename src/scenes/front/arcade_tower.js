// 아케이드 '무한의 탑' 실전 장면 (TowerScene, 장면 이름 'tower') + 축복 고르기 (TowerBlessingScene, 'towerBlessing')
// 규칙·곡선·축복·방 풀·층 계획은 data/tower.js. 바탕은 arcade_run.js ArcadeRunScene (일시정지·결과·온라인 제출이 같다).
//  - 월드 하나로 층을 갈아 끼운다: 층마다 합성 스테이지(id 'tower', 방 하나)를 world.stage 에 넣고 loadRoom — 영웅·런 상태는 이어진다.
//    전투 층 = 실제 스테이지 방의 사본(출구 막음, 기믹 끔), 보스·안식처 층 = 투기장. world.diff = 층 배율을 곱한 난이도 (towerDiff)
//  - 흐름: enter(층 이름 1.2초) → fight(적 = 계획대로 그 방의 자리에) → clear → 축복(보스·안식처) → gate(출구: 영웅 발밑에 열린다,
//    ▲ 또는 그 위에 잠시 서 있기) → 암전 → 다음 층. 남은 적 수가 25초 동안 줄지 않으면 남은 적을 영웅 곁으로 불러낸다 (갇힌 적)
//  - 축복: 능력치는 영웅의 refreshStats 를 이 장면이 감싸 덧씌운다 (applyBlessingStats — 장비 능력치 계산 뒤, 체력은 깎지 않는다).
//    대시 무적·처치 가속·가시 반사·부활은 이 장면이, 보조 무기 탄수는 트리플 샷 버프(영구 9999)로
//  - 목숨 하나 (부활 축복 제외). 쓰러지면 결과 → 돌파한 층이 1 이상이면 온라인 보드 tower:<diff> 에 제출 (서바이벌처럼 늘)
//  - 시드: state.arcade.seed (arcade.js buildArcadeState). 같은 시드 → 같은 층 계획 (window.__game.top.planner.plan(n) 으로 확인)
//  - 시험: debugKillAll() (남은 적을 모두 쓰러뜨림), debugFloor(n) (그 층으로 바로) — tools/test_tower.mjs
import { Scene, TILE } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { bus } from '../../core/events.js';
import { text, wrap, FONT, taps } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, rgba, fmt } from '../../core/math.js';
import { isSolidType, T } from '../../core/physics.js';
import { Entity } from '../../game/entity.js';
import { playerStrike } from '../../game/combat.js';
import { createBoss, loadBoss } from '../../game/bosses/lazy.js';
import { assets } from '../../core/assets.js';
import { hudLayout } from '../../render/hud_layout.js';
import { drawIcon } from '../../render/icons.js';
import { preloadPainted } from '../../render/painted/registry.js';
import { preloadPaintedEnemies, paintedEnemiesOn } from '../../render/enemies.js';
import { PAINTED_ENEMIES } from '../../render/painted/enemies/index.js';
import { releaseRigs } from '../../render/painted/enemy_kit.js';
import { STAGES, STAGE_ORDER, STAGE_ORDER_P1 } from '../../data/stages.js';
import { ENEMIES } from '../../data/enemies.js';
import { BOSSES } from '../../data/bosses.js';
import { BLESSINGS, BLESSING, TowerPlanner, towerRoom, towerDiff, applyBlessingStats, blessingOffer, floorKind } from '../../data/tower.js';
import { ArcadeRunScene, groundY } from './arcade_run.js';
import { arenaBosses, exKnown, sideBosses } from './arcade.js';
import { frame, fmtClock, heading, DIM, GOLD, BONE } from './common.js';

const COLOR = '#b79cff';
const GATE_HOLD = 1.4;     // 출구 위에 가만히 서 있으면 올라가는 시간 (초)
const STUCK_T = 25;        // 이 시간 동안 남은 적 수가 줄지 않으면 남은 적을 불러낸다 (부하를 부르는 적의 졸개만 잡아서는 미뤄지지 않게)

// ── 출구 그림 (한 번만 굽는다 — 프레임마다 그라데이션을 만들지 않는다) ──
let gateSpr = null;
function gateSprite() {
  if (gateSpr || typeof document === 'undefined') return gateSpr;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 176;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 104, 6, 64, 104, 72);
  g.addColorStop(0, 'rgba(240,230,255,0.95)'); g.addColorStop(0.35, 'rgba(183,156,255,0.7)'); g.addColorStop(1, 'rgba(90,60,200,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 176);
  // 아치 문틀
  x.strokeStyle = 'rgba(255,244,220,0.9)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(30, 170); x.lineTo(30, 70); x.arc(64, 70, 34, Math.PI, 0); x.lineTo(98, 170); x.stroke();
  x.strokeStyle = 'rgba(183,156,255,0.9)'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(38, 170); x.lineTo(38, 72); x.arc(64, 72, 26, Math.PI, 0); x.lineTo(90, 170); x.stroke();
  return (gateSpr = c);
}

/** 층 출구: 영웅이 그 위에서 ▲ 를 누르거나 GATE_HOLD 초 동안 가만히 서 있으면 다음 층 */
class TowerGate extends Entity {
  constructor(cx, bottom, run) {
    super(cx - 28, bottom - 104, 56, 104);
    this.kind = 'prop'; this.z = 1; this.run = run;
    this.openK = 0; this.holdT = 0; this.near = false; this.fxT = 0; this.used = false;
  }
  update(dt, world) {
    this.t += dt;
    this.openK = Math.min(1, this.openK + dt / 0.8);
    const p = world.player;
    this.near = !!p && !p.dead && this.openK >= 1 && p.cx > this.x && p.cx < this.x + this.w && Math.abs(p.bottom - this.bottom) < 30;
    const still = this.near && p.onGround && Math.abs(p.vx) < 30 && !input.down('left') && !input.down('right');
    this.holdT = still ? this.holdT + dt : 0;
    if ((this.fxT -= dt) <= 0) { this.fxT = 0.12; world.fx.emit?.('magic', this.cx + (Math.sin(this.t * 7) * 18), this.bottom - 10, 1, { color: COLOR, speed: 60, angle: -Math.PI / 2, spread: 0.5 }); }
    if (this.used || !this.near || world.transitioning || world.cutscene) return;
    if (input.pressed('up') || this.holdT >= GATE_HOLD) { this.used = true; this.run.leaveFloor(); }
  }
  lights(L) { L.add(this.cx, this.bottom - 52, 170 * (0.4 + 0.6 * this.openK), COLOR, 0.85); }
  draw(ctx) {
    const s = gateSprite();
    if (!s) return;
    const k = ease.outBack(this.openK), a = 0.75 + 0.25 * Math.sin(this.t * 4);
    ctx.save();
    ctx.globalAlpha = a * Math.min(1, this.openK * 1.5);
    ctx.globalCompositeOperation = 'lighter';
    const w = 128 * (0.6 + 0.4 * k), h = 176 * k;
    ctx.drawImage(s, this.cx - w / 2, this.bottom - h + 4, w, h);
    if (this.holdT > 0) {   // 서 있으면 차오르는 고리
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff4dc'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.cx, this.bottom - 130, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.holdT) / GATE_HOLD); ctx.stroke();
    }
    ctx.restore();
  }
}

export class TowerScene extends ArcadeRunScene {
  get modeId() { return 'tower'; }
  makeWorld() { return this.makeArenaWorld(this.P.lv); }
  setup() {
    const g = this.game, w = this.world;
    this.seed = (Number.isInteger(g.state?.arcade?.seed) ? g.state.arcade.seed : Number.isInteger(this.cfg.seed) ? this.cfg.seed : 1) >>> 0;
    this.baseDiff = { ...w.diff };
    // 외전(s21 · 아르겐, docs/specs/ex_s21.md): 스테이지 순서에는 넣지 않고(순서 구간 1~40층의 계획은 그대로), 외전을 알면
    // 아르겐을 무작위 구간(41층 이후 → 첫 보스 층 45층)의 보스 후보에만 더한다 (lateBosses)
    const ex = exKnown(g);
    this.order = this.p2 ? STAGE_ORDER.filter((id) => !STAGES[id]?.side) : STAGE_ORDER_P1;
    this.planner = new TowerPlanner(this.seed, { stages: STAGES, order: this.order, enemies: ENEMIES, bosses: arenaBosses(this.p2), lateBosses: this.p2 && ex ? sideBosses() : [], P: this.P.lv, eliteBase: this.baseDiff.elite ?? 0 });
    this.floor = 0; this.cleared = 0; this.bossKills = 0;
    this.taken = {}; this.takenOrder = []; this.picks = 0; this.reviveLeft = 0;
    this.hasteT = 0; this._thornN = 0; this._dashSeen = undefined;
    this.warmed = new Set();
    w.noExtraLives = true;
    w.onBossDefeated = (b) => this.onBossDown(b);
    this.patchPlayer();
    this.offs = [bus.on('enemyKilled', () => this.onKill())];
    gateSprite();
    try { assets.preload?.(BLESSINGS.map((b) => `icons/${b.icon}`)); } catch { /* 아이콘은 그릴 때 받는다 */ }
    this.loadFloor(1);
  }
  exit() { super.exit(); for (const f of this.offs ?? []) f?.(); this.offs = []; }

  /** 영웅 능력치 계산 뒤에 축복을 덧씌운다 (refreshStats 가 깎은 체력·MP 는 되돌린다 — 최대치가 늘었을 수 있다) */
  patchPlayer() {
    const p = this.world.player, self = this;
    if (!p || p._towerStats) return;
    const orig = p.refreshStats;
    p._towerStats = true;
    p.refreshStats = function towerStats() {
      const hp = this.hp, mp = this.mp;
      orig.call(this);
      applyBlessingStats(this.stats, self.taken, self.hasteT > 0);
      if (Number.isFinite(hp)) this.hp = Math.min(hp, this.stats.hp);
      if (Number.isFinite(mp)) this.mp = Math.min(mp, this.stats.mp);
    };
    p.refreshStats();
  }

  // ───────────────────────── 층 ─────────────────────────
  loadFloor(n) {
    const w = this.world, plan = this.planner.plan(n);
    this.floor = n; this.plan = plan; this.kind = plan.kind;
    w.diff = towerDiff(this.baseDiff, n);
    const key = `f${n}`, base = { id: 'tower', name: `제 ${n}층`, start: key, boss: null, intro: null, outro: null, gimmick: null, docs: [], shard: null, heart: null, relic: null, level: plan.level };
    if (plan.kind === 'combat') {
      this.troom = towerRoom(STAGES, plan.sid, plan.rid);
      w.stage = { ...STAGES[plan.sid], ...base, rooms: { [key]: this.troom.room }, music: 'arena', enemies: plan.pool ?? [] };
    } else {
      this.troom = null;
      w.stage = { ...STAGES.arena, ...base, rooms: { [key]: STAGES.arena.rooms.r1 }, music: plan.kind === 'rest' ? 'church' : null, enemies: [] };
      if (plan.kind === 'boss') audio.stopMusic(0.4);
    }
    w.arenaX = undefined; w.cleared = false; w.clearT = 0; w.exitCalled = false; w.boss = null; w.bossActive = false;
    w.cutscene = false; w.transitioning = false;
    w.loadRoom(key);
    if (plan.kind !== 'combat') { const m = w.map; w.arena = { x0: 0, x1: m.pxW, cam: { x: 0, y: 0, w: m.pxW, h: m.pxH } }; }
    w.banner = null;
    this.gate = null; this.stuckT = 0; this.aliveMin = Infinity; this.reward = 0; this.rewardDone = false;
    this.phase = 'enter'; this.phaseT = 0;
    const sub = plan.kind === 'boss' ? `군주의 층 · ${BOSSES[plan.bossId]?.name ?? ''}` : plan.kind === 'rest' ? '안식처 · 숨을 고르고 축복을 받는다' : `${STAGES[plan.sid]?.name ?? ''} · 적 ${plan.enemies.length}마리`;
    this.call = { main: `제 ${n}층`, sub, color: plan.kind === 'boss' ? '#ff4a5a' : plan.kind === 'rest' ? '#9fe8c8' : COLOR, t: 0 };
    audio.sfx(plan.kind === 'boss' ? 'warning' : 'ready');
    if (plan.kind === 'combat') this.warmPool(plan.pool ?? []);
    this.warmBoss(n);
  }
  /** 이번 층 적의 채색 리그를 굽고 풀에서 빠진 리그는 놓는다 (서바이벌 warmPool 과 같은 규칙) */
  warmPool(pool) {
    try {
      if (!paintedEnemiesOn(this.game)) return;
      const keep = new Set();
      for (const id of pool) {
        const d = ENEMIES[id], m = PAINTED_ENEMIES[d?.render ?? id];
        if (m?.spec?.src) keep.add(m.spec.src);
        const sp = d?.aiParams?.spawn, ms = sp && PAINTED_ENEMIES[ENEMIES[sp]?.render ?? sp];
        if (ms?.spec?.src) keep.add(ms.spec.src);
      }
      releaseRigs([...keep]);
      preloadPaintedEnemies(pool);
    } catch { /* 채색 적 모듈 교체 중 → 벡터 그림 */ }
  }
  /** 두 층 안에 보스 층이 있으면 보스 클래스·채색 리그를 미리 받는다 */
  warmBoss(n) {
    for (const f of [n, n + 1, n + 2]) {
      if (floorKind(f) !== 'boss') continue;
      const id = this.planner.plan(f).bossId;
      if (!id || this.warmed.has(id)) continue;
      this.warmed.add(id);
      try { loadBoss(id)?.catch?.(() => null); } catch { /* createBoss 가 받는다 */ }
      try { preloadPainted(id, this.game)?.catch?.(() => {}); } catch { /* 채색 레지스트리 없음 */ }
    }
  }
  spawnFoes() {
    const w = this.world, plan = this.plan, R = this.troom, p = w.player, m = w.map;
    this.phase = 'fight'; this.phaseT = 0; this.stuckT = 0;
    const used = new Map();
    const free = (tx, ty) => { const t = m.typeAt(tx, ty); return !isSolidType(t) && t !== T.SPIKE && t !== T.LIQUID; };
    plan.enemies.forEach((spec) => {
      const def = ENEMIES[spec.id];
      if (!def || !R) return;
      let si = spec.slot, s = R.slots[si];
      // 영웅 바로 곁의 자리는 같은 종류의 다른 자리로 (첫 번째로 충분히 먼 자리)
      const near = (q) => Math.abs((q.tx + 0.5) * TILE - p.cx) < 260 && Math.abs((q.gy + 1) * TILE - p.bottom) < 220;
      if (near(s)) {
        const alt = R.slots.findIndex((q, i) => i !== si && (def.flying || q.ground) && !near(q));
        if (alt >= 0) { si = alt; s = R.slots[si]; }
      }
      const k = used.get(si) ?? 0; used.set(si, k + 1);
      let tx = s.tx;
      const ty = def.flying ? s.ty : s.gy;
      if (k > 0) {   // 같은 자리 두 번째부터: 좌우로 한 칸씩 (설 수 있을 때만)
        const dx = (k % 2 ? 1 : -1) * Math.ceil(k / 2);
        const ok = free(tx + dx, ty) && free(tx + dx, ty - 1) && (def.flying || isSolidType(m.typeAt(tx + dx, ty + 1)) || m.typeAt(tx + dx, ty + 1) === T.ONEWAY);
        if (ok) tx += dx;
      }
      const fx = tx * TILE + TILE / 2, fy = (ty + 1) * TILE;
      w.spawnEnemy(spec.id, fx, fy, { level: plan.level, elite: spec.elite, facing: p.cx < fx ? -1 : 1 });
      w.fx.burst('dark', fx, fy - 30, 10, { speed: 110 });
      w.fx.ring(fx, fy - 30, { color: spec.elite ? '#ffd070' : COLOR, r0: 6, r1: 56, life: 0.4, width: 4 });
    });
    audio.sfx('mist', { vol: 0.5 });
  }
  /** 갇힌 적 (남은 적 수가 오래 줄지 않을 때): 영웅 양옆 바닥으로 불러낸다 — 영웅 높이에서 벽·가시를 만나기 전 칸까지만 (벽 속·벽 너머에 놓지 않게) */
  summonStragglers() {
    const w = this.world, p = w.player, m = w.map;
    const fy = Math.floor((p.bottom - 1) / TILE), ptx = Math.floor(p.cx / TILE);
    const open = (tx) => { for (let ty = fy - 1; ty <= fy; ty++) { const t = m.typeAt(tx, ty); if (isSolidType(t) || t === T.SPIKE) return false; } return true; };
    let i = 0;
    for (const e of w.enemies()) {
      if (e.kind !== 'enemy') continue;
      const side = i++ % 2 ? -1 : 1, want = Math.round((180 + 40 * i) / TILE);
      let tx = ptx;
      for (let k = 1; k <= want && open(ptx + side * k); k++) tx = ptx + side * k;
      // 넓은 적(골렘 등)의 몸이 트인 칸 안에 들어가게 (영웅 칸 ~ tx 사이)
      const lo = Math.min(ptx, tx) * TILE + e.w / 2, hi = (Math.max(ptx, tx) + 1) * TILE - e.w / 2;
      const x = lo <= hi ? clamp(tx * TILE + TILE / 2, lo, hi) : (lo + hi) / 2;
      const gy = m.groundBelow(Math.floor(x / TILE), fy) ?? p.bottom;
      e.x = x - e.w / 2; e.y = (e.def?.flying ? p.y - 60 : gy - e.h); e.vx = 0; e.vy = 0;
      w.fx.burst('dark', e.cx, e.cy, 12, { speed: 120 });
    }
    if (i) { this.game.toast('숨어 있던 마물이 끌려 나왔다', '#d8c8ff', 2); audio.sfx('mist'); }
  }
  spawnBoss() {
    const w = this.world, m = w.map, p = w.player, id = this.plan.bossId;
    this.phase = 'boss'; this.phaseT = 0;
    if (!id || !BOSSES[id]) { this.floorClear({ boss: true }); return; }
    w.stage.level = this.plan.level;
    const bx = p.cx < m.pxW / 2 ? m.pxW * 0.74 : m.pxW * 0.26;
    const boss = createBoss(w, id, bx, groundY(m, Math.floor(bx / TILE)));
    w.boss = boss; w.add(boss); w.bossActive = true;
    w.cutscene = true;
    audio.stopMusic(0.4);
    this.game.push('bossIntro', { bossId: id, world: w, onDone: () => { w.cutscene = false; if (!this.done && this.phase === 'boss') audio.music(boss.def?.music ?? 'boss'); } });
  }
  onBossDown(boss) {
    if (this.phase !== 'boss') return;
    const w = this.world;
    w.bossActive = false;
    w.slowmo = 1.2; this.game.flash('#fff', 0.8, 2); w.camera.shake(12, 0.8);
    audio.stopMusic(0.3); audio.sfx('boss_die');
    w.addScore(boss.def?.score ?? 20000);
    this.bossKills++;
    const st = this.game.state;
    st.stats.bossKills = (st.stats.bossKills ?? 0) + 1;
    // 보스가 남긴 졸개는 함께 흩어진다
    for (const e of w.entities) if (e.kind === 'enemy' && !e.dead) { e.dead = true; w.fx.burst('dark', e.cx, e.cy, 10, { speed: 120 }); }
    this.floorClear({ boss: true, name: boss.def?.name });
  }
  /** 층 돌파: 보너스 점수 → (보스) 축복 → 출구 */
  floorClear({ boss = false, name = null } = {}) {
    const w = this.world, n = this.floor;
    this.cleared = Math.max(this.cleared, n);
    this.phase = 'clear'; this.phaseT = 0;
    const s0 = w.run.score;
    w.addScore(300 * n);
    const gained = w.run.score - s0;
    audio.sfx('win');
    w.banner = boss
      ? { text: 'BOSS DOWN!', sub: `${name ?? ''} 격파 · 축복을 하나 고르세요`, t: 2.6, color: '#ffe070', big: true }
      : { text: '층 돌파!', sub: `제 ${n}층 · 보너스 +${fmt(gained)}`, t: 2.2, color: '#d8c8ff', big: true };
    this.reward = boss ? 2.4 : 0;
    if (boss) this.musicT = 2.6;
  }
  /** 안식처: 체력 30 %·MP 50 %·하트 10 회복 → 축복 고르기 */
  restHere() {
    const w = this.world, p = w.player;
    this.cleared = Math.max(this.cleared, this.floor);
    p.heal(p.stats.hp * 0.3);
    p.mp = Math.min(p.stats.mp, p.mp + p.stats.mp * 0.5);
    w.run.hearts = Math.min(99, w.run.hearts + 10);
    audio.sfx('heal');
    w.fx.burst('holy', p.cx, p.cy, 24, { speed: 180, color: '#9fe8c8' });
    w.fx.ring(p.cx, p.cy, { color: '#9fe8c8', r0: 10, r1: 110, life: 0.6, width: 5 });
    w.banner = { text: '안식처', sub: '상처가 조금 아물었다 · 축복을 하나 고르세요', t: 2.2, color: '#9fe8c8', big: true };
    this.phase = 'clear'; this.phaseT = 0; this.reward = 1.4;
  }
  /** 축복 고르기 장면을 띄운다 (고르면 onBlessingPicked) */
  offerBlessing() {
    this.rewardDone = true;
    const ids = blessingOffer(this.seed, this.floor, this.taken, this.picks);
    if (!ids.length) { this.openGate(); return; }
    this.phase = 'bless'; this.phaseT = 0;
    this.offered = ids;
    this.game.push('towerBlessing', { run: this, ids, floor: this.floor });
  }
  onBlessingPicked(id) {
    this.applyBlessing(id);
    if (this.phase === 'bless') this.openGate();
  }
  applyBlessing(id) {
    const b = BLESSING[id], w = this.world, p = w?.player;
    if (!b || !p) return false;
    if ((this.taken[id] | 0) >= b.max) return false;
    const hp0 = p.stats.hp;
    this.taken[id] = (this.taken[id] | 0) + 1; this.takenOrder.push(id); this.picks++;
    if (id === 'phoenix') this.reviveLeft++;
    if (id === 'volley') p.buffs.triple = 9999;
    p.refreshStats();
    if (p.stats.hp > hp0) p.hp = Math.min(p.stats.hp, p.hp + (p.stats.hp - hp0));
    audio.sfx('powerup');
    w.fx.burst('holy', p.cx, p.cy, 20, { speed: 160, color: b.color });
    w.fx.ring(p.cx, p.cy, { color: b.color, r0: 10, r1: 90, life: 0.5, width: 4 });
    this.game.toast(`축복: ${b.name}`, b.color, 2.2);
    return true;
  }
  /**
   * 출구를 연다: 영웅 발밑. 공중이거나 발밑이 움직이는·무너지는 발판·부서지는 벽이면(문이 허공에 남는다) 영웅이 마지막으로
   * 딛고 선 단단한 땅(p.safeSpot — 영웅 곁이라 닿을 수 있다), 그것도 없으면 이 방의 시작 위치
   */
  openGate() {
    const w = this.world, p = w.player, m = w.map;
    if (this.gate) return;
    let cx = p.cx, bottom = p.bottom;
    const fy = Math.floor((p.bottom + 2) / TILE), firm = (x) => { const t = m.typeAt(Math.floor(x / TILE), fy); return t === T.SOLID || t === T.ONEWAY; };
    if (!p.onGround || p.dead || !(firm(p.x + 2) || firm(p.x + p.w - 2))) {
      const cp = p.safeSpot?.roomId === w.roomId ? p.safeSpot : w.run.checkpoint;
      cx = cp.x + p.w / 2; bottom = cp.y + p.h;
    }
    this.gate = w.add(new TowerGate(cx, bottom, this));
    w.cleared = true; w.exitCalled = true;   // 남은 전리품을 영웅에게 끌어온다 (pickups.js); 스테이지 클리어 흐름(afterClear)은 타지 않는다
    this.phase = 'gate'; this.phaseT = 0;
    audio.sfx('door');
    w.fx.ring(cx, bottom - 50, { color: COLOR, r0: 10, r1: 120, life: 0.6, width: 5 });
  }
  leaveFloor() {
    if (this.phase === 'leave' || this.done) return;
    const w = this.world;
    this.phase = 'leave'; this.phaseT = 0;
    w.cutscene = true; w.transitioning = true;
    audio.sfx('go');
    w.fx.burst('magic', w.player.cx, w.player.cy, 24, { speed: 200, color: COLOR });
    this.game.fadeOut(() => { if (!this.done && this.game.world === w) this.loadFloor(this.floor + 1); }, 0.45);
  }

  // ───────────────────────── 축복 효과 (장면 쪽) ─────────────────────────
  onKill() {
    if (this.game.world !== this.world || !(this.taken.frenzy > 0)) return;
    const was = this.hasteT > 0;
    this.hasteT = 3;
    if (!was) this.world.player?.refreshStats();
  }
  onHurt(dmg) {
    const n = this.taken.thorns | 0, w = this.world, p = w?.player;
    if (!n || !p || p.dead) return;
    const flat = Math.max(8, Math.round((p.stats.atk ?? 10) * 1.2 * n + dmg * 0.5));
    playerStrike(w, { x: p.cx - 150, y: p.cy - 130, w: 300, h: 260 }, {
      owner: p, stats: p.stats, team: 'player', mv: 0.5, flat, dir: p.facing, kb: [220, -260], hitstop: 0, shake: 0,
      hitId: `thorn${++this._thornN}`, breakWalls: false, tags: ['skill'], fx: 'pierce',
    });
    w.fx.ring(p.cx, p.cy, { color: '#9ae070', r0: 20, r1: 150, life: 0.35, width: 5 });
  }
  tickBlessings(dt) {
    const p = this.world.player;
    if (!p) return;
    if (this.hasteT > 0) { this.hasteT -= dt; if (this.hasteT <= 0) p.refreshStats(); }
    const dg = (this.taken.dash | 0) * BLESSING.dash.dashGuard;
    if (dg > 0 && p.lastDashT !== undefined && p.lastDashT !== this._dashSeen) {
      this._dashSeen = p.lastDashT;
      p.iframes = Math.max(p.iframes ?? 0, (p.dashT ?? 0) + dg);
    }
  }
  onDeath() {
    const st = this.game.state;
    st.stats.deaths = (st.stats.deaths ?? 0) + 1;
    if (this.reviveLeft > 0 && !this.done) { this.reviveLeft--; this.revive(); return; }
    this.finish(false);
  }
  /** 부활 축복: 그 자리에서 체력 절반 (구덩이에 떨어졌으면 방 시작 위치) */
  revive() {
    const w = this.world, p = w.player;
    if (!w.entities.includes(p)) w.add(p);
    p.dead = false; p.deathHandled = false; p.deathT = 0;
    p.refreshStats();
    p.hp = Math.max(1, Math.ceil(p.stats.hp * 0.5)); p.mp = p.stats.mp;
    if (this.taken.volley) p.buffs.triple = 9999;
    if (p.y > w.map.pxH - p.h) { const cp = w.run.checkpoint; p.x = cp.x; p.y = cp.y; }
    p.vx = 0; p.vy = 0; p.iframes = 3;
    p.setAnim?.('idle');
    w.combo.n = 0;
    this.game.flash('#ffb040', 0.6, 2);
    audio.sfx('extra_life');
    w.fx.burst('fire', p.cx, p.cy, 30, { speed: 220, color: '#ffb040' });
    w.banner = { text: '부활!', sub: '불사조의 축복이 다시 일으켜 세웠다', t: 2, color: '#ffb040', big: true };
  }

  // ───────────────────────── 진행 ─────────────────────────
  tick(dt) {
    const w = this.world, p = w.player;
    if (this.call) { this.call.t += dt / 2.2; if (this.call.t >= 1) this.call = null; }
    if (!this.done) this.clock += dt;
    if (this.musicT > 0) { this.musicT -= dt; if (this.musicT <= 0 && !this.done && this.kind === 'boss') audio.music('arena'); }
    this.tickBlessings(dt);
    switch (this.phase) {
      case 'enter':
        if (this.kind === 'combat' && this.phaseT > 1.2) this.spawnFoes();
        else if (this.kind === 'boss' && this.phaseT > 1.6) this.spawnBoss();
        else if (this.kind === 'rest' && this.phaseT > 1.0) this.restHere();
        break;
      case 'fight': {
        // 진행 = 남은 적 수가 새로 줄었을 때. 처치 수로 세면 손이 닿지 않는 곳에서 졸개를 계속 부르는 적(인형술사 등)이 있을 때
        // 졸개만 잡는 동안 불러내기가 끝없이 미뤄진다
        const alive = w.enemies().length;
        if (alive < this.aliveMin) { this.aliveMin = alive; this.stuckT = 0; } else this.stuckT += dt;
        if (alive === 0) this.floorClear();
        else if (this.stuckT > STUCK_T) { this.stuckT = 0; this.summonStragglers(); }
        break;
      }
      case 'clear':
        if (this.reward > 0 && !this.rewardDone) { if (this.phaseT > this.reward && !p.dead && this.game.top === this) this.offerBlessing(); }
        else if (this.phaseT > 1.0 && !this.gate && !p.dead && (p.onGround || this.phaseT > 3)) this.openGate();
        break;
      default: break;
    }
  }
  canPause() { return super.canPause() && this.phase !== 'leave'; }

  // ───────────────────────── 시험용 ─────────────────────────
  /** 남은 적을 모두 쓰러뜨린다 (처치 기록·점수 포함) */
  debugKillAll() {
    const w = this.world;
    for (const e of w.enemies()) {
      if (e.pendingBoss) continue;
      if (e.kind === 'boss') { e.invuln = false; e.takeHit?.(Math.max(1, e.hp) + 1, { team: 'player', owner: w.player, flat: 1, dir: 1, kb: [0, 0], hitstop: 0, hitId: 'dbg', tags: [] }, w, {}); continue; }
      e.dead = true; w.onEnemyKilled(e, null);
    }
  }
  /** 그 층으로 바로 (시험) */
  debugFloor(n) { this.cleared = Math.max(this.cleared, n - 1); this.loadFloor(Math.max(1, n | 0)); }

  // ───────────────────────── 결과 ─────────────────────────
  blessingSummary(max = 3) {
    const list = BLESSINGS.filter((b) => this.taken[b.id] > 0).map((b) => `${b.name}${this.taken[b.id] > 1 ? ` ×${this.taken[b.id]}` : ''}`);
    if (!list.length) return '없음';
    return list.length > max ? `${list.slice(0, max).join(' · ')} 외 ${list.length - max}개` : list.join(' · ');
  }
  results() {
    const w = this.world;
    return {
      title: 'GAME OVER', score: w.run.score, time: this.clock,
      rows: [
        ['도달한 층', `제 ${this.floor}층`],
        ['돌파한 층', `${this.cleared}층`],
        ['걸린 시간', fmtClock(this.clock)],
        ['처치 수', `${w.run.kills}`],
        ['쓰러뜨린 군주', `${this.bossKills}`],
        ['받은 축복', this.blessingSummary()],
      ],
      stageId: 'arena', extra: { floor: this.cleared, reached: this.floor, bosses: this.bossKills, blessings: [...this.takenOrder], seed: this.seed },
    };
  }

  // ───────────────────────── 그리기 ─────────────────────────
  overlay(ctx, vw, vh) {
    const w = this.world, top = this.tagTop(vw, vh);
    this.modeTag(ctx, vw, top, `제 ${this.floor}층`, fmtClock(this.clock), COLOR);
    if (this.phase === 'fight') {
      const list = w.enemies();
      text(ctx, `남은 적 ${list.length}`, vw / 2, top + 76, { size: 14, align: 'center', weight: 800, color: '#e8d8c0', ow: 3 });
      this.drawFoeArrow(ctx, w, list, vw, vh);
    }
    this.drawBlessingHud(ctx, w, vw, vh);
    if (this.gate?.near && !this.paused && this.phase === 'gate') this.drawGateHint(ctx, w, vw);
    if (this.call && !this.paused) this.bigCall(ctx, vw, vh, this.call.main, this.call.sub, this.call.color, this.call.t);
  }
  /** 가장 가까운 적이 화면 밖이면 화면 가장자리에 방향 표시 */
  drawFoeArrow(ctx, w, list, vw, vh) {
    const p = w.player, cam = w.camera;
    if (!p || !list.length || this.paused) return;
    let best = null, bd = Infinity;
    for (const e of list) { const d = Math.hypot(e.cx - p.cx, e.cy - p.cy); if (d < bd) { bd = d; best = e; } }
    if (!best || cam.visible(best.x, best.y, best.w, best.h, 0)) return;
    const s = cam.toScreen(best.cx, best.cy), o = cam.toScreen(p.cx, p.cy);
    const ang = Math.atan2(s.y - o.y, s.x - o.x);
    const m = 46, x = clamp(s.x, m, vw - m), y = clamp(s.y, m + 60, vh - m - 40);
    const a = 0.6 + 0.4 * Math.sin(this.game.time * 6);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.globalAlpha = a; ctx.fillStyle = COLOR; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-5, 0); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  /** 받은 축복 아이콘 줄 (HUD 의 동료 카드 줄 자리 — 아케이드에서는 동료가 쉰다) */
  drawBlessingHud(ctx, w, vw, vh) {
    const ids = BLESSINGS.filter((b) => this.taken[b.id] > 0);
    if (!ids.length || w.hudHidden) return;
    let r = { x: 14, y: 176, w: 300, h: 52 };
    try { const L = hudLayout(w, vw, vh); if (L?.callouts) r = L.callouts; } catch { /* 배치 모듈 교체 중 */ }
    const s = 30, gap = 6, per = Math.max(1, Math.floor((r.w + gap) / (s + gap)));
    ids.forEach((b, i) => {
      if (i >= per * 2) return;
      const x = r.x + (i % per) * (s + gap), y = r.y + Math.floor(i / per) * (s + 4);
      const used = b.id === 'phoenix' && this.reviveLeft <= 0, hot = b.id === 'frenzy' && this.hasteT > 0;
      ctx.save();
      ctx.globalAlpha = used ? 0.35 : 1;
      ctx.fillStyle = 'rgba(10,4,14,0.72)'; ctx.fillRect(x, y, s, s);
      ctx.strokeStyle = hot ? '#ffffff' : b.color; ctx.lineWidth = hot ? 2 : 1.5; ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      drawIcon(ctx, b.icon, x + s / 2, y + s / 2, s - 6, null, { glow: false });
      if (this.taken[b.id] > 1) text(ctx, `${this.taken[b.id]}`, x + s - 3, y + s - 3, { size: 11, align: 'right', weight: 900, family: FONT.num, color: '#fff', ow: 3 });
      ctx.restore();
    });
  }
  drawGateHint(ctx, w, vw) {
    const g = this.gate, s = w.camera.toScreen(g.cx, g.y - 24);
    const y = clamp(s.y, 120, this.game.viewH - 140);
    drawHints(ctx, [['up', '다음 층으로', '위로 밀거나 잠시 서 있으면 다음 층']], clamp(s.x, 160, vw - 160), y, { align: 'center', size: 14, color: '#fff4dc' });
  }
  /** 일시정지 화면 오른쪽 칸: 받은 축복 목록 (arcade_run.js ArcadePauseScene 이 부른다) */
  drawPauseSide(ctx, r) {
    if (!(r.w >= 120)) return;
    const ids = BLESSINGS.filter((b) => this.taken[b.id] > 0);
    const h = Math.min(r.h, 34 + Math.max(1, ids.length) * 28);
    frame(ctx, r.x, r.y, r.w, h, { accent: COLOR, corners: false, edge: 0.4, fill0: 'rgba(14,6,20,0.86)' });
    text(ctx, `받은 축복 · 제 ${this.floor}층`, r.x + 12, r.y + 22, { size: 13, weight: 800, color: GOLD, ow: 2, maxWidth: r.w - 20 });
    if (!ids.length) { text(ctx, '아직 받은 축복이 없습니다', r.x + 12, r.y + 48, { size: 12, weight: 700, color: DIM, ow: 2, maxWidth: r.w - 20 }); return; }
    const rows = Math.max(1, Math.floor((h - 34) / 28));
    ids.slice(0, rows).forEach((b, i) => {
      const y = r.y + 34 + i * 28;
      const more = i === rows - 1 && ids.length > rows;
      if (!more) drawIcon(ctx, b.icon, r.x + 24, y + 12, 22, null, { glow: false });
      const used = b.id === 'phoenix' && this.reviveLeft <= 0;
      const label = more ? `외 ${ids.length - rows + 1}개` : `${b.name}${this.taken[b.id] > 1 ? ` ×${this.taken[b.id]}` : ''}${used ? ' (사용함)' : ''}`;
      text(ctx, label, r.x + 42, y + 17, { size: 13, weight: 700, color: used ? DIM : BONE, ow: 2, maxWidth: r.w - 52 });
    });
  }
}

// ───────────────────────────── 축복 고르기 ─────────────────────────────
/** push('towerBlessing', { run, ids, floor }) — 셋 중 하나 (취소 없음). 고르면 run.onBlessingPicked(id) */
export class TowerBlessingScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; }
  enter({ run = null, ids = [], floor = 0 } = {}) {
    if (!run?.world || !ids.length) { this.run = null; this.game.go('arcade', {}, { fade: false }); return; }
    this.run = run; this.ids = ids.filter((id) => BLESSING[id]); this.floor = floor;
    this.index = Math.min(1, this.ids.length - 1); this.picked = null; this.pickT = 0;
    this.selK = this.ids.map((_, i) => (i === this.index ? 1 : 0));
    run.paused = true;
    audio.sfx('bell');
  }
  exit() { if (this.run) this.run.paused = false; }
  choose(i) {
    if (this.picked || !this.ids[i]) return;
    this.index = i; this.picked = this.ids[i]; this.pickT = 0;
    audio.sfx('enhance_success');
  }
  update(dt) {
    if (!this.run) return;
    this.selK = this.selK.map((v, i) => v + ((i === this.index ? 1 : 0) - v) * Math.min(1, dt * 14));
    if (this.picked) {
      this.pickT += dt;
      // run 을 먼저 비우므로 exit() 대신 여기서 일시정지 표시를 푼다 (남으면 층 이름·출구 안내·적 방향 표시가 런 끝까지 숨는다)
      if (this.pickT > 0.45) { const id = this.picked, run = this.run; this.run = null; run.paused = false; this.game.pop(); run.onBlessingPicked(id); }
      return;
    }
    const tap = taps.hit(this);
    if (typeof tap === 'string' && tap.startsWith('bless:')) { this.choose(+tap.slice(6)); return; }
    const n = this.ids.length;
    if (input.pressed('left')) { this.index = (this.index + n - 1) % n; audio.sfx('menu_move'); }
    else if (input.pressed('right')) { this.index = (this.index + 1) % n; audio.sfx('menu_move'); }
    else if (input.pressed('confirm') || input.pressed('attack')) this.choose(this.index);
  }
  /** 배치 (UI px, 최소 720×400) */
  layout() {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH, n = this.ids.length;
    const small = H < 480, gap = small ? 14 : 20;
    const cw = Math.floor(Math.min(240, (W - 80 - gap * (n - 1)) / n));
    const top = small ? 96 : 136, ch = Math.round(clamp(H - top - 64, 190, 260));
    const x0 = Math.round((W - (cw * n + gap * (n - 1))) / 2);
    return { W, H, small, gap, cw, ch, top, x0, headY: small ? 46 : 70 };
  }
  render(ctx) {
    if (!this.run) return;
    const L = this.layout(), { W, H } = L;
    const k = ease.outCubic(clamp(this.t / 0.3, 0, 1));
    ctx.fillStyle = `rgba(4,0,10,${0.78 * k})`; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = k;
    heading(ctx, W / 2, L.headY, 'BLESSING', `제 ${this.floor}층 · 축복을 하나 고르세요`, { size: L.small ? 28 : 34, color: GOLD });
    this.ids.forEach((id, i) => {
      const b = BLESSING[id], s = this.selK[i] ?? 0, cur = i === this.index;
      const r = { x: L.x0 + i * (L.cw + L.gap), y: L.top, w: L.cw, h: L.ch };
      const fade = this.picked && this.picked !== id ? Math.max(0, 1 - this.pickT * 4) : 1;
      const lift = (this.picked === id ? Math.min(1, this.pickT * 4) * 10 : 0) + s * 6;
      ctx.save();
      ctx.globalAlpha *= fade * (0.75 + 0.25 * s);
      ctx.translate(0, -lift);
      frame(ctx, r.x, r.y, r.w, r.h, { accent: b.color, glow: s * 1.1, edge: 0.4 + 0.6 * s, fill0: 'rgba(20,10,30,0.94)' });
      ctx.fillStyle = rgba(b.color, 0.16 + 0.12 * s); ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + 58, 38, 0, Math.PI * 2); ctx.fill();
      drawIcon(ctx, b.icon, r.x + r.w / 2, r.y + 58, 56, null, { glow: false });
      text(ctx, b.name, r.x + r.w / 2, r.y + 124, { size: 17, align: 'center', weight: 900, family: FONT.title, color: cur ? '#fff6e0' : BONE, ow: 3, maxWidth: r.w - 16 });
      wrap(ctx, b.desc, r.w - 28, 13, 600).slice(0, 3).forEach((l, j) => text(ctx, l, r.x + r.w / 2, r.y + 150 + j * 17, { size: 13, align: 'center', weight: 600, color: '#d8ccbc', ow: 2 }));
      const have = this.run?.taken?.[id] | 0;
      text(ctx, have ? `보유 ${have} / ${b.max}` : b.max > 1 ? `최대 ${b.max}번까지 겹친다` : '한 번만 받을 수 있다', r.x + r.w / 2, r.y + r.h - 14, { size: 12, align: 'center', weight: 800, color: have ? '#ffe7a0' : DIM, ow: 2, maxWidth: r.w - 16 });
      ctx.restore();
      if (!this.picked) taps.add(`bless:${i}`, r, { owner: this, kind: 'primary', src: 'tower.blessing' });
    });
    const items = promptMode() === 'touch' ? [[null, '', '카드를 눌러 축복을 받으세요']] : [['dpadH', '선택'], ['confirm', '받기']];
    drawHints(ctx, items, W / 2, H - 14, { align: 'center', size: 13, color: '#b8aa98' });
    ctx.restore();
  }
}

