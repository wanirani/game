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
//  - 시즌 2 (data/tower.js '시즌 2' 절, Stage 5 P1a): 층 시작의 변이 카드 + 변이 효과(분열·시체 폭발은 bus 'enemyKilled' 를 듣는다 — enemy.js 는
//    고치지 않는다, 분열은 층마다 count(f) 마리까지) · 보스 층 뒤 갈림길(안전한 길 = 발밑 출구, 피의 길 = 붉은 문) · 안식처의 피의 계약 ·
//    15·35·55…층 상인(로크, NPC 퍼펫) · 이정표 잔상 알림 · 층 점수 상한(capScore) · 결과의 v: 2.
//    고르기 화면 셋(축복·계약·상인)은 모두 TowerBlessingScene('towerBlessing', mode: 'bless'|'pact'|'shop') 하나가 그린다
import { Scene, TILE } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { bus } from '../../core/events.js';
import { text, wrap, FONT, taps } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, rgba, fmt } from '../../core/math.js';
import { isSolidType, T, touchesType } from '../../core/physics.js';
import { Entity } from '../../game/entity.js';
import { playerStrike } from '../../game/combat.js';
import { createBoss, loadBoss } from '../../game/bosses/lazy.js';
import { levelOf } from '../../game/autoplay.js';   // [play-fix #3] 갈림길: 자동 전투가 켜져 있으면 안내 한 줄
import { touchpad } from '../../core/touchpad.js';   // [play-fix #3] 갈림길 두 문을 터치 조작 묶음 사이(화면에서 비어 있는 가운데)로
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
import {
  BLESSINGS, BLESSING, TowerPlanner, towerRoom, towerDiff, applyBlessingStats, blessingOffer, floorKind,
  TOWER_RULES, TOWER_PHASE, TOWER_VERSION, TOWER_SEASON, TOWER_CURVE, MUTATOR, PACT, BLOOD_PATH, MERCHANT,
  pactOffer, applyPactStats, merchantPrice, rngOf,
} from '../../data/tower.js';
import { TOWER_MILESTONES, TRAILS } from '../../data/cosmetics.js';
import { NPCS } from '../../data/npcs.js';
import { drawHero } from '../../render/hero.js';
import { ArcadeRunScene, groundY } from './arcade_run.js';
import { arenaBosses, exKnown, sideBosses } from './arcade.js';
import { frame, fmtClock, heading, gbutton, portraitIn, DIM, GOLD, BONE } from './common.js';

const COLOR = '#b79cff';
const GATE_HOLD = 1.4;     // 출구 위에 가만히 서 있으면 올라가는 시간 (초)
// [play-fix #3] 보스 층 뒤 갈림길: 두 문을 영웅 양쪽 FORK_COLS 칸에 (폴드 펼침 · 휴대폰 모두 한 화면 — 보기 폭 960 논리 px) 놓고
//  (터치 스틱 · 버튼 묶음 사이가 좁은 휴대폰은 FORK_COLS_MIN 칸 — 문 아랫부분이 버튼 밑에 숨지 않게),
//  문이 열린 뒤 사람이 직접 움직였을 때만(input.humanMoveT — 자동 전투 입력 제외) 서 있기로 고른다. ▲ 도 사람 입력만.
//  자동 전투는 길을 고르지 않는다 (가운데에서 기다린다 — 안내 한 줄). 예전: 영웅 발밑 = 안전한 길이라 가만히 1.4초면 저절로 안전한 길
const FORK_COLS = 4, FORK_COLS_MIN = 3;
// [play-fix #18] 탑 전용 가시 규칙: 가시에 닿으면 피해(최대 체력 12 %, player.js 그대로)를 한 번 받고 마지막으로 딛고 선 안전한 땅으로
//  돌아간다 (낙사와 같은 자리 — p.safeSpot) · 짧은 무적. 이야기 스테이지는 그대로 (이 장면이 영웅의 takeHit 을 감쌀 때만)
const SPIKE_IFRAMES = 1.2;
const STUCK_T = 25;        // 이 시간 동안 남은 적 수가 줄지 않으면 남은 적을 불러낸다 (부하를 부르는 적의 졸개만 잡아서는 미뤄지지 않게)

// ── 출구 그림 (한 번만 굽는다 — 프레임마다 그라데이션을 만들지 않는다). 'safe' = 보라(시즌 1 출구·안전한 길), 'blood' = 피의 길 ──
const GATE_LOOK = {
  safe: { c0: 'rgba(240,230,255,0.95)', c1: 'rgba(183,156,255,0.7)', c2: 'rgba(90,60,200,0)', rim: 'rgba(183,156,255,0.9)', light: COLOR, label: '#d8c8ff' },
  blood: { c0: 'rgba(255,228,220,0.95)', c1: 'rgba(230,52,64,0.72)', c2: 'rgba(110,0,16,0)', rim: 'rgba(255,96,96,0.9)', light: '#ff4a5a', label: '#ff9a9a' },
};
const gateSpr = {};
function gateSprite(kind = 'safe') {
  if (gateSpr[kind] || typeof document === 'undefined') return gateSpr[kind] ?? null;
  const L = GATE_LOOK[kind] ?? GATE_LOOK.safe;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 176;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 104, 6, 64, 104, 72);
  g.addColorStop(0, L.c0); g.addColorStop(0.35, L.c1); g.addColorStop(1, L.c2);
  x.fillStyle = g; x.fillRect(0, 0, 128, 176);
  // 아치 문틀
  x.strokeStyle = 'rgba(255,244,220,0.9)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(30, 170); x.lineTo(30, 70); x.arc(64, 70, 34, Math.PI, 0); x.lineTo(98, 170); x.stroke();
  x.strokeStyle = L.rim; x.lineWidth = 2;
  x.beginPath(); x.moveTo(38, 170); x.lineTo(38, 72); x.arc(64, 72, 26, Math.PI, 0); x.lineTo(90, 170); x.stroke();
  return (gateSpr[kind] = c);
}
/** 갈림길 이름 (보스 층 뒤 출구 둘) */
const ROUTE_NAME = { safe: '안전한 길', blood: '피의 길' };
/** 기기 기록(meta.towerBest)의 가장 높은 층 — 난이도 중 최대 (이정표 알림 기준, data/cosmetics.js cosContext 와 같은 규칙) */
function towerBestFloor(meta) {
  const tb = meta?.towerBest && typeof meta.towerBest === 'object' && !Array.isArray(meta.towerBest) ? meta.towerBest : {};
  let f = 0;
  for (const k of Object.keys(tb)) { const v = tb[k]?.floor; if (typeof v === 'number' && Number.isFinite(v) && v > f) f = v; }
  return f;
}

/**
 * 층 출구: 영웅이 그 위에서 ▲ 를 누르거나 GATE_HOLD 초 동안 가만히 서 있으면 다음 층.
 * route: null(보통 출구) | 'safe' | 'blood' (보스 층 뒤 갈림길 — 문 위에 이름)
 */
class TowerGate extends Entity {
  constructor(cx, bottom, run, route = null) {
    super(cx - 28, bottom - 104, 56, 104);
    this.kind = 'prop'; this.z = 1; this.run = run; this.route = route;
    this.look = GATE_LOOK[route === 'blood' ? 'blood' : 'safe'];
    this.openK = 0; this.holdT = 0; this.near = false; this.fxT = 0; this.used = false;
  }
  update(dt, world) {
    this.t += dt;
    this.openK = Math.min(1, this.openK + dt / TOWER_PHASE.gateOpen);
    const p = world.player;
    this.near = !!p && !p.dead && this.openK >= 1 && this.run.canLeave() && p.cx > this.x && p.cx < this.x + this.w && Math.abs(p.bottom - this.bottom) < 30;
    const still = this.near && p.onGround && Math.abs(p.vx) < 30 && !input.down('left') && !input.down('right');
    // [play-fix #3] 갈림길 문은 사람이 문이 열린 뒤 움직였을 때만 서 있기를 센다 (그냥 서 있기 · 자동 전투로는 고르지 않는다)
    const armed = !this.route || this.run.forkArmed();
    this.holdT = still && armed ? this.holdT + dt : 0;
    if ((this.fxT -= dt) <= 0) { this.fxT = 0.12; world.fx.emit?.('magic', this.cx + (Math.sin(this.t * 7) * 18), this.bottom - 10, 1, { color: this.look.light, speed: 60, angle: -Math.PI / 2, spread: 0.5 }); }
    if (this.used || !this.near || world.transitioning || world.cutscene || !this.run.canLeave()) return;
    const up = input.pressed('up') && (!this.route || input.human('up'));   // 갈림길: 자동 전투의 ▲ 는 세지 않는다
    if (up || this.holdT >= GATE_HOLD) { this.used = true; this.run.leaveFloor(this.route); }
  }
  lights(L) { L.add(this.cx, this.bottom - 52, 170 * (0.4 + 0.6 * this.openK), this.look.light, 0.85); }
  draw(ctx) {
    const s = gateSprite(this.route === 'blood' ? 'blood' : 'safe');
    if (!s) return;
    const k = ease.outBack(this.openK), a = 0.75 + 0.25 * Math.sin(this.t * 4);
    ctx.save();
    ctx.globalAlpha = a * Math.min(1, this.openK * 1.5);
    ctx.globalCompositeOperation = 'lighter';
    const w = 128 * (0.6 + 0.4 * k), h = 176 * k;
    ctx.drawImage(s, this.cx - w / 2, this.bottom - h + 4, w, h);
    ctx.globalCompositeOperation = 'source-over';
    if (this.route && this.openK > 0.5) {   // 갈림길 이름
      ctx.globalAlpha = Math.min(1, (this.openK - 0.5) * 2);
      text(ctx, ROUTE_NAME[this.route], this.cx, this.bottom - 186, { size: 18, align: 'center', weight: 900, family: FONT.title, color: this.look.label, ow: 4 });
      text(ctx, this.route === 'blood' ? '센 변이 · 보상 2배' : '변이 · 보상 그대로', this.cx, this.bottom - 166, { size: 13, align: 'center', weight: 800, color: this.route === 'blood' ? '#ffd0c8' : '#e8e0ff', ow: 3 });   // [play-fix #3] 두 문 모두 한 줄 설명
    }
    if (this.holdT > 0) {   // 서 있으면 차오르는 고리
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#fff4dc'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.cx, this.bottom - 130, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.holdT) / GATE_HOLD); ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * 변이의 바닥 위험 (낙뢰 · 시체 폭발): warn 초 동안 표식(늘 0.6초 이상) → 한 번 친다 → 잠깐 빛이 남는다.
 * 영웅이 맞으면 최대 체력의 frac (방어 무시, 무적 시간이면 없음 — c_common hazard 와 같은 규칙). 낙뢰는 기둥 안의 적도 친다
 */
class TowerHazard extends Entity {
  constructor(run, kind, x, bottom, o) {
    const r = kind === 'bolt' ? o.half : o.radius;
    super(x - r, kind === 'bolt' ? 0 : bottom - 2 * r, 2 * r, kind === 'bolt' ? bottom : 2 * r);
    this.kind = 'prop'; this.z = 2; this.run = run; this.hz = kind; this.o = o; this.fx0 = x; this.foot = bottom;
    this.warn = Math.max(0.6, o.warn ?? 0.9); this.hit = false; this.after = 0;
  }
  update(dt, world) {
    this.t += dt;
    if (this.hit) { if ((this.after += dt) > 0.35) this.dead = true; return; }
    if (this.t < this.warn) return;
    this.hit = true;
    const p = world.player, o = this.o;
    const inside = !!p && !p.dead && (this.hz === 'bolt'
      ? Math.abs(p.cx - this.fx0) < o.half + p.w / 2
      : Math.hypot(p.cx - this.fx0, p.cy - (this.foot - o.radius * 0.6)) < o.radius + 12);
    if (inside && !p.invuln && !world.cleared) p.takeHit(Math.ceil((p.stats?.hp ?? 100) * o.frac), { team: 'enemy', dir: Math.sign(p.cx - this.fx0) || 1, kb: [240, -400], flat: 1 }, world, {});
    if (this.hz === 'bolt') {
      if (p && !p.dead) playerStrike(world, { x: this.fx0 - o.half, y: this.foot - 640, w: 2 * o.half, h: 640 }, {
        owner: p, stats: p.stats, team: 'player', mv: 1.2, dir: 1, kb: [0, -220], hitstop: 0, shake: 0, hitId: `bolt${this.run.floor}_${this.t.toFixed(3)}_${this.fx0 | 0}`, breakWalls: false, tags: ['skill'], fx: 'pierce',
      });
      world.camera.shake(7, 0.22);
      audio.sfx('thunderclap', { vol: 0.7 });
      world.fx.burst('magic', this.fx0, this.foot - 8, 16, { speed: 220, color: '#f4f8a0' });
    } else {
      world.camera.shake(9, 0.25);
      audio.sfx('explode', { vol: 0.7 });
      world.fx.burst('fire', this.fx0, this.foot - o.radius * 0.6, 22, { speed: 260 });
      world.fx.ring(this.fx0, this.foot - o.radius * 0.6, { color: '#ff7a3a', r0: 10, r1: o.radius + 20, life: 0.35, width: 6 });
    }
  }
  lights(L) {
    if (this.hit) L.add(this.fx0, this.foot - 60, 220 * (1 - this.after / 0.35), this.hz === 'bolt' ? '#f4f8a0' : '#ff8a3a', 0.9);
    else if (this.hz === 'bolt') L.add(this.fx0, this.foot - 20, 60, '#e8f070', 0.35);
  }
  draw(ctx) {
    const o = this.o, k = Math.min(1, this.t / this.warn), blink = 0.55 + 0.45 * Math.sin(this.t * (10 + 14 * k));
    ctx.save();
    if (this.hz === 'bolt') {
      if (!this.hit) {   // 예고: 바닥 표식 + 가는 기둥
        ctx.globalAlpha = 0.25 + 0.35 * k;
        ctx.fillStyle = '#e8f070'; ctx.fillRect(this.fx0 - o.half, this.foot - 520, 2 * o.half, 520);
        ctx.globalAlpha = blink;
        ctx.strokeStyle = '#fbffd0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.fx0, this.foot - 2, o.half + 6, 7, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#fbffd0'; ctx.fillRect(this.fx0 - o.half * k, this.foot - 4, 2 * o.half * k, 4);
      } else {   // 벼락
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - this.after / 0.35;
        ctx.fillStyle = '#fbffe0'; ctx.fillRect(this.fx0 - o.half * 0.45, this.foot - 640, o.half * 0.9, 640);
        ctx.fillStyle = '#e8f070'; ctx.fillRect(this.fx0 - o.half, this.foot - 640, 2 * o.half, 640);
      }
    } else {
      const cy = this.foot - o.radius * 0.6;
      if (!this.hit) {   // 예고: 붉은 원 + 줄어드는 안쪽 원
        ctx.globalAlpha = blink;
        ctx.strokeStyle = '#ff5a3a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(this.fx0, cy, o.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.25 + 0.3 * k;
        ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(this.fx0, cy, o.radius * (1 - 0.85 * k) + 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

/** 떠돌이 상인 로크 (data/npcs.js npc_rook 의 퍼펫 — 마을 NPC 와 같은 drawHero 경로) */
class TowerMerchantNpc extends Entity {
  constructor(cx, bottom, facing) {
    super(cx - 18, bottom - 92, 36, 92);
    this.kind = 'prop'; this.z = 1; this.facing = facing;
    this.pseudo = { rig: {}, ch: { move: { speed: 275 } }, stats: {}, npc: true, npcId: MERCHANT.npc, onGround: true, vx: 0, vy: 0, anim: 'idle', look: NPCS[MERCHANT.npc]?.look ?? null };
    this.alpha = 0; this.leaving = false;
  }
  update(dt) {
    this.t += dt;
    this.alpha = this.leaving ? Math.max(0, this.alpha - dt * 3) : Math.min(1, this.alpha + dt * 3);
    if (this.leaving && this.alpha <= 0) this.dead = true;
  }
  draw(ctx, world) {
    if (!this.pseudo.look || this.alpha <= 0) return;
    const P = this.pseudo;
    P.x = this.x; P.y = this.y; P.w = this.w; P.h = this.h; P.cx = this.cx; P.bottom = this.bottom; P.facing = this.facing; P.animT = this.t; P.t = this.t;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(this.cx, this.bottom - 1, 18, 4, 0, 0, Math.PI * 2); ctx.fill();
    try { drawHero(ctx, P, world, {}); } catch { /* 퍼펫 교체 중 */ }
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
    // 시즌 2: 계약 · 갈림길 · 변이 · 상인 · 이정표 (data/tower.js '시즌 2')
    this.pacts = {}; this.pactOrder = []; this.blood = 0; this.bloodBless = 0; this.bossHpMul = 1; this.bloodRuns = 0;
    this.bloodFloor = false; this.mut = null; this.mutCard = null; this.blessLeft = 0; this.gates = []; this.npc = null;
    this.baseRules = w.rules ?? null; this.splitN = 0; this.fightT = 0; this.rushOk = false; this.scoreCapped = 0;
    this.milestones = []; this.bestBefore = towerBestFloor(g.meta);
    w.noExtraLives = true;
    w.onBossDefeated = (b) => this.onBossDown(b);
    this.patchPlayer();
    this.capScore();
    this.offs = [bus.on('enemyKilled', (d) => this.onKill(d))];
    gateSprite(); gateSprite('blood');
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
      applyPactStats(this.stats, self.pacts);   // 시즌 2: 피의 계약 (축복 뒤)
      const ha = self.mut?.heroAtk;   // 시즌 2: 광기의 층 (영웅도 주는 피해 ×)
      if (ha) { this.stats.atk = Math.round(this.stats.atk * ha); this.stats.mag = Math.round(this.stats.mag * ha); }
      if (Number.isFinite(hp)) this.hp = Math.min(hp, this.stats.hp);
      if (Number.isFinite(mp)) this.mp = Math.min(mp, this.stats.mp);
    };
    p.refreshStats();
    // [play-fix #18] 탑 전용 가시 규칙: player.js 의 가시 피해(방어 무시 flat · 최대 체력 12 %, 주인 없음)를 받은 뒤 안전한 땅으로 돌려보낸다
    const hit = p.takeHit;
    p.takeHit = function towerHit(dmg, attack, world, info) {
      const spike = !!(attack?.flat && !attack.owner && !attack.element && world?.map && dmg === Math.ceil((this.stats?.hp ?? 0) * 0.12) && touchesType(this, world.map, T.SPIKE, 6));
      const hp0 = this.hp;
      const r = hit.call(this, dmg, attack, world, info);
      if (spike && !this.dead && this.hp < hp0) self.spikeReset(this, world);
      return r;
    };
  }
  /** [play-fix #18] 가시 → 마지막으로 딛고 선 안전한 땅 (낙사 복귀와 같은 자리: world.onPlayerFell) + 짧은 무적 */
  spikeReset(p, w) {
    if (w !== this.world || this.done) return;
    const cp = p.safeSpot?.roomId === w.roomId ? p.safeSpot : w.run.checkpoint;
    if (!cp) return;
    w.fx.burst('dark', p.cx, p.cy, 10, { speed: 140 });
    p.x = cp.x; p.y = cp.y; p.vx = 0; p.vy = 0;
    p.iframes = Math.max(p.iframes ?? 0, SPIKE_IFRAMES);
    this.game.flash('#000', 0.4, 3);
    this.spikeResets = (this.spikeResets ?? 0) + 1;
  }
  /**
   * 층 점수 상한 (시즌 2): 한 층에서 오르는 점수는 TOWER_RULES.maxScorePerFloor 를 넘지 않는다 — 어떤 판이든 서버 검사
   * '점수 ≤ (돌파한 층 + 1) × maxScorePerFloor' (netlify/lib/online.mts) 안에 든다. 층이 바뀔 때 floorScore0 을 다시 잡는다 (loadFloor)
   */
  capScore() {
    const w = this.world, self = this, orig = w.addScore;
    this.floorScore0 = w.run.score;
    w.addScore = function towerScore(n) {
      const before = this.run.score;
      orig.call(this, n);
      const room = Math.max(0, self.floorScore0 + TOWER_RULES.maxScorePerFloor - before);
      if (this.run.score - before > room) { this.run.score = before + room; self.scoreCapped++; }
    };
  }

  // ───────────────────────── 층 ─────────────────────────
  loadFloor(n) {
    const w = this.world, plan = this.planner.plan(n);
    this.floor = n; this.plan = plan; this.kind = plan.kind;
    w.diff = towerDiff(this.baseDiff, n);
    this.season2Floor(plan);
    // [play-fix #16] sideLabel: HUD 이름판 · 일시정지가 쓰는 장 표시(chapterLabel)를 층마다 바뀌는 「n장」(방을 빌려 온 스테이지의 장) 대신 「무한의 탑」으로 →
    //  어느 층이든 「무한의 탑 · 제 n층」 (보스 · 안식처 층도 같다)
    const key = `f${n}`, base = { id: 'tower', name: `제 ${n}층`, sideLabel: '무한의 탑', start: key, boss: null, intro: null, outro: null, gimmick: null, docs: [], shard: null, heart: null, relic: null, level: plan.level };
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
    this.phase = 'enter'; this.phaseT = 0; this.floorT = 0;
    const sub = plan.kind === 'boss' ? `군주의 층 · ${BOSSES[plan.bossId]?.name ?? ''}` : plan.kind === 'rest' ? '안식처 · 숨을 고르고 축복을 받는다' : `${STAGES[plan.sid]?.name ?? ''} · 적 ${plan.enemies.length}마리`;
    this.call = { main: `제 ${n}층`, sub, color: plan.kind === 'boss' ? '#ff4a5a' : plan.kind === 'rest' ? '#9fe8c8' : COLOR, t: 0 };
    audio.sfx(plan.kind === 'boss' ? 'warning' : 'ready');
    if (plan.kind === 'combat') this.warmPool(plan.pool ?? []);
    this.warmBoss(n);
    this.mutCard = this.mut ? { m: this.mut, blood: this.bloodFloor, t: 0 } : null;
  }
  /**
   * 시즌 2 층 준비 (loadFloor 가 world.diff 를 만든 직후): 변이(피의 길이면 센 변이) · 피의 길 배율 · 맹세의 계약(다음 군주 체력) ·
   * 월드 규칙(안개 dark · 광기의 계약 noPotion) · 층 점수 상한 기준 · 위험물·분열 수 초기화
   */
  season2Floor(plan) {
    const w = this.world, d = w.diff;
    const blood = plan.kind === 'combat' && this.blood > 0;
    if (blood) this.blood--;
    this.bloodFloor = blood;
    this.mut = plan.kind === 'combat' ? (MUTATOR[blood ? plan.mutBlood : plan.mut] ?? null) : null;
    if (this.forceMut !== undefined && plan.kind === 'combat') this.mut = MUTATOR[this.forceMut] ?? null;   // 시험 (debugFloor)
    const M = this.mut;
    if (M?.atk) d.enemyAtk = (d.enemyAtk ?? 1) * M.atk;
    if (M?.gold) d.gold = (d.gold ?? 1) * M.gold;
    if (blood) { d.gold = (d.gold ?? 1) * BLOOD_PATH.goldMul; d.elite = Math.min(0.9, (d.elite ?? 0) + BLOOD_PATH.eliteAdd); }
    this.oathHp = null;
    if (plan.kind === 'boss' && this.bossHpMul !== 1) { d.bossHp = (d.bossHp ?? 1) * this.bossHpMul; this.oathHp = this.bossHpMul; this.bossHpMul = 1; }
    w.rules = this.floorRules();
    this.floorScore0 = w.run.score;
    this.splitN = 0; this.fightT = 0; this.rushOk = false; this.boltT = M?.every ?? 0;
    this.blessLeft = 0; this.pactDone = false; this.shopDone = false; this.gates = []; this.npc = null;
    this.boltR = M?.every ? rngOf(this.seed, 'bolt', plan.f) : null;
    w.player?.refreshStats();   // 광기의 층 영웅 배율을 넣고 뺀다
  }
  /** 이 층의 월드 규칙 = 처음 규칙 + 변이 규칙(피의 안개 dark) + 맺은 계약 규칙(광기의 계약 noPotion — 막을 때 글에 계약 이름) */
  floorRules() {
    const r = { ...(this.baseRules ?? {}) };
    if (this.mut?.rules) Object.assign(r, this.mut.rules);
    for (const id of this.pactOrder) { const P = PACT[id]; if (P?.rules) { Object.assign(r, P.rules); r.label = P.name; } }
    return Object.keys(r).length ? r : null;
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
    const free = (tx, ty) => { const t = m.typeAt(tx, ty); return !isSolidType(t) && t !== T.SPIKE && t !== T.LIQUID && t !== T.FAKE; };
    // 시즌 2: 거인·정예 무리 = 계획의 앞쪽 일부만 (최소 3), 질주의 계약 = 계획의 추가 적 셋, 피의 길 = 정예 확률 더 (층마다 따로 뽑는 결정적 난수)
    const M = this.mut;
    let list = plan.enemies;
    if (M?.count) list = list.slice(0, Math.max(3, Math.ceil(list.length * M.count)));
    if (this.pacts.swift && plan.extra) list = [...list, ...plan.extra];
    const br = this.bloodFloor ? rngOf(this.seed, 'bloodElite', plan.f) : null;
    list.forEach((spec) => {
      const def = ENEMIES[spec.id];
      if (!def || !R) return;
      let si = spec.slot, s = R.slots[si];
      // 영웅 바로 곁의 자리는 같은 종류의 다른 자리로 (첫 번째로 충분히 먼 자리)
      const near = (q) => Math.abs((q.tx + 0.5) * TILE - p.cx) < 260 && Math.abs((q.gy + 1) * TILE - p.bottom) < 220;
      // 비밀 방(가짜 벽 너머 — s02 r3·s06 r3) 속 자리도: 거기 나온 적은 보이지도 맞지도 않고 남은 적 수에도 들지 않는다 (world.inUnrevealedFake)
      const secret = (q) => m.typeAt(q.tx, Math.floor(((def.flying ? q.ty : q.gy) + 1 - (def.size?.h ?? TILE) / 2 / TILE))) === T.FAKE;
      if (near(s) || secret(s)) {
        const alt = R.slots.findIndex((q, i) => i !== si && (def.flying || q.ground) && !near(q) && !secret(q));
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
      let elite = spec.elite;
      if (M?.allElite && def.elite !== false) elite = true;
      else if (br && !elite && def.elite !== false && br.next() < BLOOD_PATH.eliteAdd) elite = true;
      const e = w.spawnEnemy(spec.id, fx, fy, { level: plan.level, elite, facing: p.cx < fx ? -1 : 1 });
      if (M?.scale) this.resize(e, M.scale, M.hp, M.foeAtk);
      w.fx.burst('dark', fx, fy - 30, 10, { speed: 110 });
      w.fx.ring(fx, fy - 30, { color: elite ? '#ffd070' : COLOR, r0: 6, r1: 56, life: 0.4, width: 4 });
    });
    audio.sfx('mist', { vol: 0.5 });
  }
  /**
   * 적 크기·체력·공격 바꾸기 (거인의 층 k > 1, 분열 조각 k < 1): 발밑 가운데를 둔 채. 키울 때 머리 위·옆이 막혀 있으면 들어가는 만큼만 키운다
   * (체력·공격 배율은 그대로). enemy.js 는 고치지 않는다 — 렌더러는 e.scale 을 읽는다 (render/enemies.js)
   */
  resize(e, k, hpMul = 1, atkMul = 1) {
    if (!e || e.kind !== 'enemy') return;
    const m = this.world.map, cx = e.cx, b = e.bottom;
    if (k > 1) {
      const tx0 = Math.floor((cx - (e.w * k) / 2) / TILE), tx1 = Math.floor((cx + (e.w * k) / 2 - 1) / TILE);
      const yTop = e.def?.flying ? e.cy - (e.h * k) / 2 : b - e.h * k;
      for (let ty = Math.floor((b - 1) / TILE); ty >= Math.floor(yTop / TILE); ty--) {
        let solid = false;
        for (let tx = tx0; tx <= tx1 && !solid; tx++) solid = isSolidType(m.typeAt(tx, ty));
        if (solid) { k = Math.max(1, Math.min(k, (b - (ty + 1) * TILE) / e.h)); break; }
      }
    }
    if (k !== 1) {
      e.w *= k; e.h *= k; e.scale = (e.scale || 1) * k;
      e.x = cx - e.w / 2; e.y = b - e.h;
      e.spawnX = e.x; e.spawnY = e.y;
      if (e.homeX !== undefined) e.homeX = e.x;
    }
    if (hpMul !== 1) { const hp = Math.max(1, Math.round(e.stats.maxHp * hpMul)); e.stats.maxHp = hp; e.stats.hp = hp; e.hp = hp; }
    if (atkMul && atkMul !== 1) e.stats.atk = Math.max(1, Math.round(e.stats.atk * atkMul));
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
    w.addScore(300 * n * (this.bloodFloor ? BLOOD_PATH.bonusMul : 1));   // 피의 길: 층 돌파 보너스 ×2
    const gained = w.run.score - s0;
    audio.sfx('win');
    // 속공 변이: 싸움 시작부터 rushSec 초 안에 돌파하면 축복 하나
    this.rushOk = !boss && !!this.mut?.rushSec && this.fightT <= this.mut.rushSec;
    const tail = this.rushOk ? ' · 속공 성공! 축복을 하나 고르세요' : this.bloodFloor ? ' · 피의 길 ×2' : '';
    w.banner = boss
      ? { text: 'BOSS DOWN!', sub: `${name ?? ''} 격파 · 축복을 하나 고르세요`, t: 2.6, color: '#ffe070', big: true }
      : { text: '층 돌파!', sub: `제 ${n}층 · 보너스 +${fmt(gained)}${tail}`, t: 2.2, color: this.rushOk ? '#7ae0ff' : '#d8c8ff', big: true };
    this.reward = boss ? 2.4 : this.rushOk ? 1.4 : 0;
    if (boss) this.musicT = 2.6;
    this.checkMilestone(n);
  }
  /** 이정표 (data/cosmetics.js TOWER_MILESTONES): 이 기기에서 처음 넘는 10·20·30·40·50층 → 잔상 알림 (기록은 결과 화면이 meta.towerBest 에 남긴다) */
  checkMilestone(n) {
    for (const ms of TOWER_MILESTONES) {
      if (ms.floor !== n || n <= this.bestBefore || this.milestones.includes(ms.trail)) continue;
      this.milestones.push(ms.trail);
      this.game.toast(`이정표 ${n}층 · 잔상 「${TRAILS[ms.trail]?.name ?? ''}」 해금`, '#ffe7a0', 3.2);
      audio.sfx('levelup');
    }
  }
  /** 안식처: 체력 30 %·MP 50 %·하트 10 회복 → 축복 고르기 (피의 길 뒤면 하나 더) → 피의 계약. 탐욕의 계약을 맺었으면 회복 없음 */
  restHere() {
    const w = this.world, p = w.player;
    this.cleared = Math.max(this.cleared, this.floor);
    const greed = Object.keys(this.pacts).some((id) => PACT[id]?.noRestHeal);
    if (!greed) {
      p.heal(p.stats.hp * 0.3);
      p.mp = Math.min(p.stats.mp, p.mp + p.stats.mp * 0.5);
    }
    w.run.hearts = Math.min(99, w.run.hearts + 10);
    audio.sfx(greed ? 'mist' : 'heal');
    w.fx.burst('holy', p.cx, p.cy, 24, { speed: 180, color: greed ? '#ffd84a' : '#9fe8c8' });
    w.fx.ring(p.cx, p.cy, { color: '#9fe8c8', r0: 10, r1: 110, life: 0.6, width: 5 });
    this.blessLeft = this.bloodBless; this.bloodBless = 0;
    const sub = greed ? '탐욕의 계약 — 상처가 아물지 않는다 · 축복을 하나 고르세요' : this.blessLeft ? '피의 길을 지나왔다 · 축복을 둘 고르세요' : '상처가 조금 아물었다 · 축복을 하나 고르세요';
    w.banner = { text: '안식처', sub, t: 2.2, color: '#9fe8c8', big: true };
    this.phase = 'clear'; this.phaseT = 0; this.reward = 1.4;
    this.checkMilestone(this.floor);   // 이정표 층(10·20·30·40·50)은 모두 안식처 — 여기서 돌파한다
  }
  /** 축복 고르기 장면을 띄운다 (고르면 onBlessingPicked). 후보가 없으면 다음 단계로 */
  offerBlessing() {
    this.rewardDone = true;
    const ids = blessingOffer(this.seed, this.floor, this.taken, this.picks);
    if (!ids.length) { this.afterBlessing(); return; }
    this.phase = 'bless'; this.phaseT = 0;
    this.offered = ids;
    this.world.banner = null;   // [play-fix #17] 'BOSS DOWN!' · '안식처' 큰 글자가 카드 뒤로 비치지 않게
    this.game.push('towerBlessing', { run: this, ids, floor: this.floor });
  }
  onBlessingPicked(id) {
    this.applyBlessing(id);
    if (this.phase === 'bless') this.afterBlessing();
  }
  /** 축복 다음 (시즌 2): 남은 축복(피의 길·맹세의 계약) → 안식처의 피의 계약 → 상인 층의 로크 → 출구 (보스 층 = 갈림길) */
  afterBlessing() {
    if (this.done) return;
    if (this.blessLeft > 0) { this.blessLeft--; this.offerBlessing(); return; }
    if (this.kind === 'rest' && !this.pactDone) { this.pactDone = true; if (this.offerPact()) return; }
    if (this.kind === 'boss' && this.plan?.merchant && !this.shopDone) { this.shopDone = true; this.openShop(); return; }
    this.openGate();
  }

  // ───────────────────────── 피의 계약 · 상인 (시즌 2) ─────────────────────────
  /** 안식처: 맺지 않은 계약 둘 + 거절 (없으면 false) */
  offerPact() {
    const ids = pactOffer(this.seed, this.floor, this.pacts);
    if (!ids.length) return false;
    this.phase = 'pact'; this.phaseT = 0;
    this.world.banner = null;   // [play-fix #17]
    this.game.push('towerBlessing', { run: this, ids, floor: this.floor, mode: 'pact' });
    return true;
  }
  /** 계약 고르기 결과 (id = null 이면 거절) */
  onPactPicked(id) {
    if (id && PACT[id] && !this.pacts[id]) this.takePact(id);
    if (this.phase === 'pact') this.afterBlessing();
  }
  takePact(id) {
    const P = PACT[id], w = this.world, p = w.player;
    this.pacts[id] = true; this.pactOrder.push(id);
    if (P.bossHp) this.bossHpMul *= P.bossHp;
    if (P.bless) this.blessLeft += P.bless;
    w.rules = this.floorRules();
    const hp0 = p.stats.hp;
    p.refreshStats();
    if (p.stats.hp > hp0) p.hp = Math.min(p.stats.hp, p.hp + (p.stats.hp - hp0));
    audio.sfx('boss_roar', { vol: 0.5 });
    this.game.flash('#8a0010', 0.35, 1);
    w.fx.burst('fire', p.cx, p.cy, 26, { speed: 200, color: P.color });
    w.fx.ring(p.cx, p.cy, { color: '#ff3a4a', r0: 10, r1: 120, life: 0.6, width: 5 });
    this.game.toast(`피의 계약: ${P.name} — ${P.up} · ${P.down}`, '#ff8a8a', 3);
  }
  /** 상인 층: 로크가 영웅 곁에 나타나 런 골드로 거래 (치료 · 축복 카드 · 다시 뽑기) — 떠나면 onShopDone */
  openShop() {
    const w = this.world, p = w.player, m = w.map;
    this.phase = 'shop'; this.phaseT = 0;
    const side = p.cx < m.pxW / 2 ? 1 : -1, x = this.safeX(p.cx + side * 130);
    this.npc = w.add(new TowerMerchantNpc(x, groundY(m, Math.floor(x / TILE)), -side));
    w.fx.burst('dark', x, this.npc.cy, 18, { speed: 140 });
    audio.sfx('mist');
    this.shop = { salt: 0, bought: null, ids: blessingOffer(this.seed, this.floor, this.taken, 50) };
    w.banner = null;   // [play-fix #17]
    this.game.push('towerBlessing', { run: this, ids: this.shop.ids, floor: this.floor, mode: 'shop' });
  }
  shopPrice(kind) { return merchantPrice(MERCHANT[kind] ?? 0, this.plan?.level ?? 1); }
  get gold() { return this.game.state?.gold ?? 0; }
  /** 상인 거래 → { ok, msg, ids? } (골드가 모자라거나 살 수 없으면 ok: false — 골드는 그대로) */
  shopBuy(kind, id = null) {
    const st = this.game.state, p = this.world.player, S = this.shop;
    if (!st || !p || !S || this.phase !== 'shop') return { ok: false, msg: '지금은 거래할 수 없습니다' };
    const price = this.shopPrice(kind);
    if (kind === 'bless') {
      if (S.bought) return { ok: false, msg: '이 카드 중에서는 한 장만 살 수 있습니다' };
      if (!S.ids.includes(id) || (this.taken[id] | 0) >= (BLESSING[id]?.max ?? 0)) return { ok: false, msg: '살 수 없는 축복입니다' };
    } else if (kind === 'heal') {
      if (p.hp >= p.stats.hp && p.mp >= p.stats.mp) return { ok: false, msg: '치료할 상처가 없습니다' };
    } else if (kind !== 'reroll') return { ok: false, msg: '' };
    // 다시 뽑기: 새로 펼칠 축복이 하나도 없으면(모두 최대로 받음) 골드를 받지 않는다
    const next = kind === 'reroll' ? blessingOffer(this.seed, this.floor, this.taken, 51 + S.salt) : null;
    if (next && !next.length) return { ok: false, msg: '더 펼칠 축복이 없습니다' };
    if ((st.gold ?? 0) < price) return { ok: false, msg: `골드가 모자랍니다 (${fmt(price)}G 필요)` };
    st.gold -= price;
    if (kind === 'bless') { S.bought = id; this.applyBlessing(id); return { ok: true, msg: `축복 「${BLESSING[id].name}」` }; }
    if (kind === 'heal') {
      p.heal(p.stats.hp * MERCHANT.healFrac); p.mp = p.stats.mp;
      audio.sfx('heal'); this.world.fx.burst('holy', p.cx, p.cy, 20, { speed: 160, color: '#9fe8c8' });
      return { ok: true, msg: '상처가 아물었다' };
    }
    S.salt++; S.bought = null; S.ids = next;
    audio.sfx('card');
    return { ok: true, msg: '새 카드를 펼쳤다', ids: S.ids };
  }
  onShopDone() {
    if (this.phase !== 'shop') return;
    if (this.npc) { this.npc.leaving = true; this.world.fx.burst('dark', this.npc.cx, this.npc.cy, 14, { speed: 120 }); }
    this.afterBlessing();
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
   * 출구를 연다: 영웅 발밑. 공중 · 물속이거나 발밑이 움직이는·무너지는 발판·부서지는 벽이면(문이 허공에 남는다) [play-fix #19] 영웅 곁에서
   * 걸어서 · 뛰어서 닿는 가장 가까운 단단한 마른 땅 (reachableSpot — 벽 너머 · 높은 기둥 뒤는 고르지 않는다), 그것도 없으면 예전처럼
   * 마지막으로 딛고 선 땅(p.safeSpot) · 이 방의 시작 위치. 보스 층 뒤 갈림길은 openFork
   */
  openGate() {
    const w = this.world, p = w.player, m = w.map;
    if (this.gate) return;
    if (this.kind === 'boss' && this.plan?.route && this.openFork()) return;
    let cx = p.cx, bottom = p.bottom;
    const fy = Math.floor((p.bottom + 2) / TILE), firm = (x) => { const t = m.typeAt(Math.floor(x / TILE), fy); return t === T.SOLID || t === T.ONEWAY; };
    if (!p.onGround || p.dead || p.inLiquid || p.platform || !(firm(p.x + 2) || firm(p.x + p.w - 2))) {
      const r = this.reachableSpot(p);
      if (r) { cx = r.cx; bottom = r.bottom; } else {
        const cp = p.safeSpot?.roomId === w.roomId ? p.safeSpot : w.run.checkpoint;
        cx = cp.x + p.w / 2; bottom = cp.y + p.h;
      }
    }
    this.gate = w.add(new TowerGate(cx, bottom, this, null));
    this.gates = [this.gate];
    this.gateOpened(cx, bottom);
  }
  /** 문이 열린 뒤 공통: 남은 전리품을 영웅에게 끌어온다 (pickups.js); 스테이지 클리어 흐름(afterClear)은 타지 않는다 */
  gateOpened(cx, bottom) {
    const w = this.world;
    w.cleared = true; w.exitCalled = true;
    this.phase = 'gate'; this.phaseT = 0;
    audio.sfx('door');
    w.fx.ring(cx, bottom - 50, { color: COLOR, r0: 10, r1: 120, life: 0.6, width: 5 });
  }
  /**
   * [play-fix #3] 보스 층 뒤 갈림길: 영웅 왼쪽 FORK_COLS 칸 = 안전한 길, 오른쪽 FORK_COLS 칸 = 피의 길 (가시 없는 바닥 기둥 safeCols 안 —
   * 벽에 붙어 있으면 가운데를 영웅 곁에서 옮겨 둘 다 들어가게, 영웅은 어느 문 위에도 서 있지 않게). 고르기는 TowerGate (사람이 움직인 뒤).
   * 자리가 없으면 false (예전 배치: 발밑 = 안전한 길, 몇 칸 옆 = 피의 길 — 그래도 서 있기만으로는 고르지 않는다)
   */
  openFork() {
    const w = this.world, p = w.player, m = w.map, cols = this.safeCols;
    const c0 = Math.floor(p.cx / TILE), view = this.forkView();
    // 두 문 사이 칸 수: 화면의 빈 폭(터치 조작 사이)에 문 둘이 다 들어가면 FORK_COLS, 좁으면(휴대폰) FORK_COLS_MIN
    const fc = view.free >= 2 * FORK_COLS * TILE + 56 ? FORK_COLS : FORK_COLS_MIN;
    const ok = (cc) => cols.includes(cc - fc) && cols.includes(cc + fc) && Math.abs(c0 - (cc - fc)) >= 2 && Math.abs(c0 - (cc + fc)) >= 2;
    let c = null;
    if (cols?.length) {
      // 먼저: 영웅이 두 문 사이에 남는 만큼(±(fc-2)칸)만 옮겨 두 문의 가운데가 화면의 빈 가운데(터치 스틱 · 버튼 묶음 사이)에 가깝게 —
      //   터치 화면은 오른쪽을 보면 영웅이 왼쪽 1/4 에 서서, 영웅 기준이면 왼쪽 문 아랫부분이 스틱에 가렸다
      const span = fc - 2, want = clamp(Math.floor(view.mid / TILE), c0 - span, c0 + span);
      for (let d = 0; d <= 2 * span && c === null; d++) for (const k of d ? [d, -d] : [0]) { const cc = want + k; if (Math.abs(cc - c0) <= span && ok(cc)) { c = cc; break; } }
      // 벽 가까이라 안 되면: 예전처럼 영웅 곁에서 넓게 찾는다
      for (let d = 0; d <= 12 && c === null; d++) for (const k of d ? [d, -d] : [0]) {
        const cc = c0 + k;
        if (ok(cc)) { c = cc; break; }
      }
    }
    let sx, bx;
    if (c !== null) { sx = (c - fc + 0.5) * TILE; bx = (c + fc + 0.5) * TILE; }
    else {
      sx = p.cx; const b = this.bloodGateX(sx);
      if (b === null) return false;
      bx = b;
    }
    const sy = c !== null ? groundY(m, c - fc) : p.bottom;
    this.gate = w.add(new TowerGate(sx, sy, this, 'safe'));
    this.gates = [this.gate, w.add(new TowerGate(bx, groundY(m, Math.floor(bx / TILE)), this, 'blood'))];
    this.forkT0 = input.time;   // 이때 뒤의 사람 방향 입력만 문 고르기를 켠다
    this.gateOpened(p.cx, p.bottom);
    this.game.toast('갈림길 — 안전한 길과 피의 길 중 하나를 고르세요', '#ff9a9a', 2.6);
    return true;
  }
  /**
   * [play-fix #3] 지금 화면에서 비어 있는 곳 { mid: 가운데 월드 x, free: 폭(월드 px) }: 터치 조작이 게임 화면 위에 있으면 아래쪽 스틱(왼쪽) ·
   * 버튼 묶음(오른쪽) 사이, 아니면(키보드 · 패드 · 아래 띠) 화면 전체. 카메라 넘겨 보기(camera.touchSides)와 같은 규칙으로 잰다
   */
  forkView() {
    const cam = this.world.camera, W0 = cam?.w || 960, zk = (cam?.vw || W0) / W0;
    let L = 0, R = 0;
    if (input.touchMode) {
      try {
        const low = (cam?.h || 540) * 0.55;
        const take = (b) => { if (!b || !(b.y + b.h > low)) return; if (b.x + b.w / 2 > W0 / 2) R = Math.max(R, W0 - b.x); else L = Math.max(L, b.x + b.w); };
        for (const b of touchpad.occupiedRects?.() ?? []) take(b);
        take(touchpad.stickZone?.());
      } catch { L = 0; R = 0; }
      if (L + R > W0 * 0.8) { L = 0; R = 0; }   // 잴 수 없는 배치(편집기 등) — 화면 가운데
    }
    return { mid: (cam?.x ?? this.world.player.cx - W0 / 2) + (L + (W0 - R)) / 2 * zk, free: (W0 - L - R) * zk };
  }
  /** 갈림길 문을 서 있기로 고를 수 있나: 문이 열린 뒤 사람이 방향을 넣었다 (키 · 패드 · 터치 — 자동 전투 입력은 아니다) */
  forkArmed() { return (input.humanMoveT ?? -99) > (this.forkT0 ?? Infinity); }
  /**
   * [play-fix #19] 영웅 곁에서 닿을 수 있는 가장 가까운 마른 땅 { cx, bottom } (없으면 null). 타일 격자 너비 우선 탐색:
   * 몸(영웅 키만큼의 칸)이 들어가는 칸만, 디딘 땅(또는 물속)에서 위로 JUMP 칸까지 · 공중에서 옆으로 · 아래로 떨어지기.
   * 목표 = 아래가 단단한 땅(단방향 발판 포함, 부서지는 벽 위는 아니다)이고 몸이 액체에 잠기지 않으며 양옆 한 칸에 가시가 없는 칸 — 처음 닿는(가장 가까운) 것
   */
  reachableSpot(p) {
    const m = this.world.map, W = m.w, H = m.h, JUMP = 3, bh = Math.max(1, Math.ceil((p.h - 4) / TILE));
    const tt = (x, y) => (x < 0 || x >= W || y < 0 || y >= H ? T.SOLID : m.typeAt(x, y));
    const free = (x, y) => { for (let k = 0; k < bh; k++) { const t = tt(x, y - k); if (isSolidType(t) || t === T.SPIKE || t === T.FAKE) return false; } return true; };
    const wet = (x, y) => { for (let k = 0; k < bh; k++) if (tt(x, y - k) === T.LIQUID) return true; return false; };
    const support = (x, y) => { const t = tt(x, y + 1); return isSolidType(t) || t === T.ONEWAY; };   // 디딜 수 있다 (뛰어오르기)
    const firmAt = (x, y) => { const t = tt(x, y + 1); return t === T.SOLID || t === T.ONEWAY; };   // 문을 세울 땅 (부서지는 벽 위는 아니다)
    const spiky = (x, y) => { for (let dx = -1; dx <= 1; dx++) for (let k = -1; k < bh; k++) if (tt(x + dx, y - k) === T.SPIKE) return true; return false; };
    let x0 = Math.floor(p.cx / TILE), y0 = Math.floor((p.bottom - 1) / TILE);
    if (!free(x0, y0)) { if (free(x0, y0 - 1)) y0--; else return null; }
    const seen = new Uint8Array(W * H * (JUMP + 1));
    const q = [[x0, y0, support(x0, y0) || wet(x0, y0) ? JUMP : 0]];
    seen[(y0 * W + x0) * (JUMP + 1) + q[0][2]] = 1;
    for (let i = 0; i < q.length && i < 20000; i++) {
      const [x, y, j] = q[i];
      if (firmAt(x, y) && !wet(x, y) && !spiky(x, y)) return { cx: (x + 0.5) * TILE, bottom: (y + 1) * TILE };
      const grounded = support(x, y) || wet(x, y), jj = grounded ? JUMP : j;
      const push = (nx, ny, nj) => { if (!free(nx, ny)) return; const k = (ny * W + nx) * (JUMP + 1) + nj; if (seen[k]) return; seen[k] = 1; q.push([nx, ny, nj]); };
      push(x - 1, y, jj); push(x + 1, y, jj);
      if (jj > 0) push(x, y - 1, jj - 1);
      if (!support(x, y)) push(x, y + 1, wet(x, y) ? JUMP : 0);
    }
    return null;
  }
  /** 피의 길 문 자리: 안전한 문에서 5~9칸 떨어진 안전한 바닥 기둥 (경기장 가운데 쪽 먼저) — 없으면 null */
  bloodGateX(cx) {
    const cols = this.safeCols, m = this.world.map;
    if (!cols?.length) return null;
    const c0 = Math.floor(cx / TILE), dir = cx < m.pxW / 2 ? 1 : -1;
    for (const d of [dir, -dir]) for (let k = 6; k <= 9; k++) {
      const c = c0 + d * k;
      if (cols.includes(c)) return c * TILE + TILE / 2;
    }
    for (let k = 5; k < m.w; k++) for (const d of [dir, -dir]) if (cols.includes(c0 + d * k)) return (c0 + d * k) * TILE + TILE / 2;
    return null;
  }
  /**
   * 이 층을 떠날 수 있나: 층에 들어온 지 minFloorSec + 0.1초 (서버 기록 검사 '걸린 시간 ≥ 돌파한 층 × minFloorSec' 를 연출 시간의
   * 소수점 합에 맡기지 않는다 — 변이·속공·계약이 연출을 줄여도 한 층이 이보다 빨리 끝나지 않는다). 보통 판에서는 이미 지나 있다
   */
  canLeave() { return (this.floorT ?? 0) >= TOWER_RULES.minFloorSec + 0.1; }
  /** 층을 떠난다. route = 'blood' 이면 다음 전투 층 넷이 피의 길 (센 변이 · 보상 2배 · 그다음 안식처 축복 하나 더) */
  leaveFloor(route = null) {
    if (this.phase === 'leave' || this.done) return;
    const w = this.world;
    this.phase = 'leave'; this.phaseT = 0;
    if (route === 'blood') {
      this.blood = BLOOD_PATH.floors; this.bloodBless = BLOOD_PATH.extraBless; this.bloodRuns++;
      this.game.toast('피의 길 — 변이가 거세지고 보상이 두 배가 된다', '#ff6a6a', 2.4);
    } else if (route === 'safe') { this.blood = 0; this.bloodBless = 0; }
    this.route = route;
    w.cutscene = true; w.transitioning = true;
    audio.sfx('go');
    w.fx.burst('magic', w.player.cx, w.player.cy, 24, { speed: 200, color: route === 'blood' ? '#ff4a5a' : COLOR });
    this.game.fadeOut(() => { if (!this.done && this.game.world === w) this.loadFloor(this.floor + 1); }, 0.45);
  }

  // ───────────────────────── 축복·변이 효과 (장면 쪽) ─────────────────────────
  /** bus 'enemyKilled' {enemy, x, y}: 처치 가속 축복 · 분열 · 시체 폭발 · 흡혈의 밤 (enemy.js 를 고치지 않는다) */
  onKill(d) {
    if (this.game.world !== this.world) return;
    const w = this.world, p = w.player, e = d?.enemy, M = this.mut;
    if (this.taken.frenzy > 0) {
      const was = this.hasteT > 0;
      this.hasteT = 3;
      if (!was) p?.refreshStats();
    }
    if (!M || !e || e.kind !== 'enemy' || this.phase !== 'fight' || e._towerKilled) return;
    e._towerKilled = true;   // 같은 적의 처치 알림이 두 번 와도 분열·폭발은 한 번
    if (M.split && !e._towerSplit) this.splitFoe(e, M);
    if (M.id === 'bomb') w.add(new TowerHazard(this, 'bomb', e.cx, e.bottom, M));
    if (M.killHeal && p && !p.dead) p.heal(p.stats.hp * M.killHeal, false);
  }
  /** 분열: 쓰러진 적이 작은 둘로 (같은 레벨·정예 아님·다시 갈라지지 않음). 층마다 count(f) 마리까지 */
  splitFoe(e, M) {
    const w = this.world, m = w.map, cap = TOWER_CURVE.count(this.floor), n = Math.min(M.split, cap - this.splitN);
    if (n <= 0 || !ENEMIES[e.def?.id]) return;
    const open = (x) => { const tx = Math.floor(x / TILE), ty = Math.floor((e.bottom - 4) / TILE); const t = m.typeAt(tx, ty); return !isSolidType(t) && t !== T.SPIKE; };
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      const x = open(e.cx + s * 16) ? e.cx + s * 16 : e.cx;
      const c = w.spawnEnemy(e.def.id, x, e.bottom, { level: this.plan.level, elite: false, facing: s });
      if (!c) continue;
      c._towerSplit = true;
      this.resize(c, M.splitScale ?? 0.7, M.splitHp ?? 0.35);
      c.vx = s * 140; if (!c.def?.flying) c.vy = -260;
      w.fx.burst('dark', c.cx, c.cy, 6, { speed: 90 });
    }
    this.splitN += n;
  }
  /** 낙뢰: every 초마다 영웅 곁(±90px)에 벼락 하나 (경기장 안 — 결정적 난수, 싸움 중에만) · 흡혈의 밤: 체력이 서서히 마른다 (bleedFloor 아래로는 아니다) */
  tickMutator(dt) {
    const M = this.mut, w = this.world, p = w.player;
    if (!M || this.phase !== 'fight' || !p || p.dead || w.cutscene) return;
    this.fightT += dt;
    if (M.every && (this.boltT -= dt) <= 0) {
      this.boltT = M.every;
      const r = this.boltR ?? rngOf(this.seed, 'bolt', this.floor);
      const x = clamp(p.cx + (r.next() * 2 - 1) * 90, TILE * 2, w.map.pxW - TILE * 2);
      const gy = w.map.groundBelow?.(Math.floor(x / TILE), Math.floor((p.bottom - 1) / TILE)) ?? p.bottom;
      w.add(new TowerHazard(this, 'bolt', x, gy, M));
      audio.sfx('thunder', { vol: 0.35 });
    }
    if (M.bleed) {
      const floor = p.stats.hp * M.bleedFloor;
      if (p.hp > floor) p.hp = Math.max(floor, p.hp - p.stats.hp * M.bleed * dt);
    }
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
    if (this.mutCard) { this.mutCard.t += dt / 3.4; if (this.mutCard.t >= 1) this.mutCard = null; }
    if (!this.done) { this.clock += dt; this.floorT = (this.floorT ?? 0) + dt; }
    if (this.musicT > 0) { this.musicT -= dt; if (this.musicT <= 0 && !this.done && this.kind === 'boss') audio.music('arena'); }
    this.tickBlessings(dt);
    this.tickMutator(dt);
    switch (this.phase) {
      case 'enter':
        if (this.kind === 'combat' && this.phaseT > TOWER_PHASE.enter) this.spawnFoes();
        else if (this.kind === 'boss' && this.phaseT > TOWER_PHASE.bossEnter) this.spawnBoss();
        else if (this.kind === 'rest' && this.phaseT > TOWER_PHASE.restEnter) this.restHere();
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
        else if (this.phaseT > TOWER_PHASE.clear && !this.gate && !p.dead && (p.onGround || this.phaseT > 3)) this.openGate();
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
  /**
   * 그 층으로 바로 (시험). o.mut = 변이 id 로 덮기 (null = 변이 없음, undefined = 계획대로), o.blood = 피의 길로 들어가기
   */
  debugFloor(n, o = {}) {
    this.cleared = Math.max(this.cleared, n - 1);
    if (o.blood) { this.blood = Math.max(this.blood, 1); this.bloodBless = BLOOD_PATH.extraBless; }
    this.forceMut = o.mut;
    try { this.loadFloor(Math.max(1, n | 0)); } finally { this.forceMut = undefined; }
  }

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
        ...(this.seasonSummary() ? [[TOWER_SEASON, this.seasonSummary()]] : []),   // [play-fix #22] 피의 길 · 계약 · 새 잔상이 하나도 없으면 줄을 뺀다
      ],
      stageId: 'arena',
      extra: {
        floor: this.cleared, reached: this.floor, bosses: this.bossKills, blessings: [...this.takenOrder], seed: this.seed,
        v: TOWER_VERSION, pacts: [...this.pactOrder], blood: this.bloodRuns, milestones: [...this.milestones],
      },
    };
  }
  /**
   * 결과의 '시즌 2' 줄 — [play-fix #22] 있었던 것만, 본 말 그대로: 「피의 길 n번 · 맺은 계약 n개 · 새 잔상 「…」」 (0 인 것은 빼고, 모두 없으면 null → 줄을 뺀다).
   * 예전: 「계약 0 · 피의 길 0번」 — 계약도 피의 길도 본 적 없는 플레이어에게 뜻 모를 말이었다
   */
  seasonSummary() {
    const out = [];
    if (this.bloodRuns > 0) out.push(`피의 길 ${this.bloodRuns}번`);
    if (this.pactOrder.length) out.push(`맺은 계약 ${this.pactOrder.length}개`);
    if (this.milestones.length) out.push(`새 잔상 ${this.milestones.map((id) => `「${TRAILS[id]?.name ?? id}」`).join('')}`);
    return out.length ? out.join(' · ') : null;
  }

  // ───────────────────────── 그리기 ─────────────────────────
  overlay(ctx, vw, vh) {
    const w = this.world, top = this.tagTop(vw, vh);
    // [play-fix #17] 축복 · 계약 · 상인 카드가 떠 있으면 위 가운데 층 이름 · 시계(카드 제목과 겹친다)와 층 안내 글자를 그리지 않는다
    if (this.game.top?.name === 'towerBlessing') { this.drawBlessingHud(ctx, w, vw, vh); return; }
    this.modeTag(ctx, vw, top, `제 ${this.floor}층`, fmtClock(this.clock), COLOR);
    if (this.phase === 'fight') {
      const list = w.enemies();
      text(ctx, `남은 적 ${list.length}`, vw / 2, top + 76, { size: 14, align: 'center', weight: 800, color: '#e8d8c0', ow: 3 });
      this.drawFoeArrow(ctx, w, list, vw, vh);
    }
    // 시즌 2: 이 층의 변이 · 피의 길 표시 (층 이름 아래 한 줄) · 속공 남은 시간
    const M = this.mut;
    if (M && (this.phase === 'fight' || this.phase === 'enter')) {
      const rush = M.rushSec && this.phase === 'fight' ? ` ${Math.max(0, M.rushSec - this.fightT).toFixed(1)}초` : '';
      text(ctx, `${this.bloodFloor ? '피의 길 · ' : ''}${M.name}${rush}`, vw / 2, top + 96, { size: 13, align: 'center', weight: 800, color: M.rushSec && this.fightT > M.rushSec ? DIM : M.color, ow: 3 });
    }
    this.drawBlessingHud(ctx, w, vw, vh);
    const gate = this.gates.find((g) => g.near) ?? (this.gate?.near ? this.gate : null);
    if (gate && !this.paused && this.phase === 'gate') this.drawGateHint(ctx, w, vw, gate);
    else if (!this.paused && this.phase === 'gate' && this.gates.length > 1) this.drawForkHint(ctx, w, vw);
    if (this.call && !this.paused) this.bigCall(ctx, vw, vh, this.call.main, this.call.sub, this.call.color, this.call.t);
    if (this.mutCard && !this.paused) this.drawMutCard(ctx, vw, vh, this.mutCard);
  }
  /** 층 시작의 변이 알림 카드 (층 이름 아래로 미끄러져 들어왔다 사라진다) */
  drawMutCard(ctx, vw, vh, C) {
    const M = C.m, k = C.t;
    const a = clamp(Math.min(k * 8, (1 - k) * 6), 0, 1);
    if (a <= 0) return;
    const w = Math.round(Math.min(440, vw - 40)), h = 74, x = Math.round((vw - w) / 2 + (1 - ease.outCubic(clamp(k * 7, 0, 1))) * 80), y = Math.round(vh * 0.4 + 54);
    ctx.save();
    ctx.globalAlpha = a;
    frame(ctx, x, y, w, h, { accent: C.blood ? '#ff4a5a' : M.color, glow: 0.8, corners: false, edge: 0.7, fill0: 'rgba(18,6,14,0.92)' });
    ctx.fillStyle = rgba(M.color, 0.2); ctx.beginPath(); ctx.arc(x + 40, y + h / 2, 26, 0, Math.PI * 2); ctx.fill();
    drawIcon(ctx, M.icon, x + 40, y + h / 2, 40, null, { glow: false });
    text(ctx, `${C.blood ? '피의 길 · ' : ''}변이 — ${M.name}`, x + 76, y + 30, { size: 19, weight: 900, family: FONT.title, color: '#fff2e0', ow: 3, maxWidth: w - 90 });
    text(ctx, M.desc, x + 76, y + 54, { size: 14, weight: 700, color: M.color, ow: 2, maxWidth: w - 90 });
    ctx.restore();
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
  drawGateHint(ctx, w, vw, g = this.gate) {
    const s = w.camera.toScreen(g.cx, g.y - 24);
    const y = clamp(s.y, 120, this.game.viewH - 140);
    const item = g.route === 'blood' ? ['up', '피의 길로', '위로 밀거나 잠시 서 있으면 피의 길 — 센 변이 · 보상 2배']
      : g.route === 'safe' ? ['up', '안전한 길로', '위로 밀거나 잠시 서 있으면 안전한 길']
        : ['up', '다음 층으로', '위로 밀거나 잠시 서 있으면 다음 층'];
    drawHints(ctx, [item], clamp(s.x, 160, vw - 160), y, { align: 'center', size: 14, color: g.route === 'blood' ? '#ffc8c0' : '#fff4dc' });
  }
  /**
   * [play-fix #3] 갈림길에서 어느 문 위에도 서 있지 않을 때: 영웅 머리 위에 「◀ 안전한 길   피의 길 ▶」 (문이 있는 쪽 방향) +
   * 자동 전투가 켜져 있으면 「자동 전투는 길을 고르지 않습니다」
   */
  drawForkHint(ctx, w, vw) {
    const p = w.player;
    if (!p || p.dead) return;
    const s = w.camera.toScreen(p.cx, p.y - 40), y = clamp(s.y, 150, this.game.viewH - 150);
    // 방향은 글자 화살표로 (터치 모드의 이동 단추 그림은 왼쪽 · 오른쪽이 같은 모양이라 어느 문인지 알 수 없다)
    const label = this.gates.slice().sort((a, b) => a.cx - b.cx).map((g) => (g.cx < p.cx ? `◀ ${ROUTE_NAME[g.route] ?? ''}` : `${ROUTE_NAME[g.route] ?? ''} ▶`)).join('   ');
    text(ctx, label, clamp(s.x, 160, vw - 160), y, { size: 15, align: 'center', weight: 900, color: '#fff4dc', ow: 3 });
    if (levelOf(this.game) !== 'off') text(ctx, '자동 전투는 길을 고르지 않습니다', clamp(s.x, 160, vw - 160), y - 24, { size: 13, align: 'center', weight: 800, color: '#ffd890', ow: 3 });   // 머리 위 줄의 위 (영웅을 가리지 않게)
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
/**
 * push('towerBlessing', { run, ids, floor, mode }) — 카드 고르기 화면 하나로 셋을 그린다:
 *  - mode 'bless' (기본): 축복 셋 중 하나 (취소 없음) → run.onBlessingPicked(id)
 *  - mode 'pact': 피의 계약 둘 + 「거절한다」 (ids 뒤에 null 카드) → run.onPactPicked(id | null)
 *  - mode 'shop': 떠돌이 상인 — 값이 붙은 축복 카드 셋 + 아래 단추 셋(치료 · 다시 뽑기 · 떠나기). 사고 나서도 떠나기 전까지 열려 있다 →
 *    run.shopBuy(kind, id) · 떠나기(취소 키도) → run.onShopDone(). 골드가 모자라면 아무것도 바뀌지 않고 한 줄 안내
 */
export class TowerBlessingScene extends Scene {
  // deferToasts: 고른 축복·계약 알림이 다음 카드 창(피의 길 뒤 두 번째 축복 · 계약 · 상인)의 제목을 가리지 않게 — 창을 닫은 뒤 표시
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; this.deferToasts = true; }
  enter({ run = null, ids = [], floor = 0, mode = 'bless' } = {}) {
    if (!run?.world || (!ids.length && mode !== 'shop')) { this.run = null; this.game.go('arcade', {}, { fade: false }); return; }
    this.run = run; this.floor = floor; this.mode = mode;
    this.ids = mode === 'pact' ? [...ids.filter((id) => PACT[id]), null] : ids.filter((id) => BLESSING[id]);
    this.index = mode === 'pact' ? 0 : Math.min(1, Math.max(0, this.ids.length - 1)); this.picked = undefined; this.pickT = 0;
    this.msg = null;
    this.selK = this.items().map((_, i) => (i === this.index ? 1 : 0));
    run.paused = true;
    audio.sfx(mode === 'pact' ? 'boss_roar' : mode === 'shop' ? 'coin' : 'bell', mode === 'pact' ? { vol: 0.4 } : undefined);
  }
  exit() { if (this.run) this.run.paused = false; }
  /** 고를 수 있는 칸: 카드들 (+ 상인: 치료 · 다시 뽑기 · 떠나기) */
  items() { return this.mode === 'shop' ? [...this.ids.map((id) => ({ kind: 'bless', id })), { kind: 'heal' }, { kind: 'reroll' }, { kind: 'leave' }] : this.ids.map((id) => ({ kind: 'card', id })); }
  choose(i) {
    const it = this.items()[i];
    if (this.picked !== undefined || !it) return;
    this.index = i;
    if (this.mode === 'shop') { this.shop(it); return; }
    this.picked = it.id; this.pickT = 0;
    audio.sfx(this.mode === 'pact' && it.id ? 'boss_die' : this.mode === 'pact' ? 'menu_cancel' : 'enhance_success', this.mode === 'pact' && it.id ? { vol: 0.5 } : undefined);
  }
  /** 상인 칸 하나 */
  shop(it) {
    const run = this.run;
    if (it.kind === 'leave') { this.close(() => run.onShopDone()); audio.sfx('menu_ok'); return; }
    const r = run.shopBuy(it.kind, it.id);
    this.msg = { text: r.msg, color: r.ok ? '#9fe8c8' : '#ff9a8a', t: 0 };
    if (!r.ok) { audio.sfx('menu_cancel'); return; }
    if (it.kind === 'bless') audio.sfx('enhance_success');
    if (r.ids) { this.ids = r.ids.filter((id) => BLESSING[id]); this.selK = this.items().map((_, i) => (i === this.index ? 1 : 0)); }
  }
  /** 닫기: run 을 먼저 비우므로 exit() 대신 여기서 일시정지 표시를 푼다 (남으면 층 이름·출구 안내·적 방향 표시가 런 끝까지 숨는다) */
  close(after) { const run = this.run; this.run = null; run.paused = false; this.game.pop(); after?.(); }
  update(dt) {
    if (!this.run) return;
    const items = this.items(), n = items.length;
    if (this.selK.length !== n) this.selK = items.map((_, i) => (i === this.index ? 1 : 0));
    this.selK = this.selK.map((v, i) => v + ((i === this.index ? 1 : 0) - v) * Math.min(1, dt * 14));
    if (this.msg) { this.msg.t += dt; if (this.msg.t > 2.4) this.msg = null; }
    if (this.picked !== undefined) {
      this.pickT += dt;
      if (this.pickT > 0.45) {
        const id = this.picked, run = this.run;
        this.close(() => (this.mode === 'pact' ? run.onPactPicked(id) : run.onBlessingPicked(id)));
      }
      return;
    }
    const tap = taps.hit(this);
    if (typeof tap === 'string' && tap.startsWith('bless:')) { this.choose(+tap.slice(6)); return; }
    const nc = this.ids.length;
    if (input.pressed('left')) { this.index = this.mode === 'shop' && this.index >= nc ? nc + ((this.index - nc + 2) % 3) : (this.index + Math.max(1, nc) - 1) % Math.max(1, nc); audio.sfx('menu_move'); }
    else if (input.pressed('right')) { this.index = this.mode === 'shop' && this.index >= nc ? nc + ((this.index - nc + 1) % 3) : (this.index + 1) % Math.max(1, nc); audio.sfx('menu_move'); }
    else if (this.mode === 'shop' && input.pressed('down') && this.index < nc) { this.index = nc + Math.min(2, this.index); audio.sfx('menu_move'); }
    else if (this.mode === 'shop' && input.pressed('up') && this.index >= nc && nc) { this.index = Math.min(nc - 1, this.index - nc); audio.sfx('menu_move'); }
    else if (this.mode === 'shop' && input.pressed('cancel')) this.choose(n - 1);
    // 피의 계약은 되돌릴 수 없다: 창이 뜬 직후(0.35초)의 확인·공격 연타(앞 축복 창에서 이어진 것)로는 맺지 않는다 — 탭·방향 이동은 그대로
    else if ((input.pressed('confirm') || input.pressed('attack')) && !(this.mode === 'pact' && this.t < 0.35)) this.choose(this.index);
  }
  /** 배치 (UI px, 최소 720×400). 상인: 카드 줄을 낮추고 아래에 단추 줄 (btnY), 왼쪽 위에 상인 초상 */
  layout() {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH, n = Math.max(1, this.ids.length), shop = this.mode === 'shop';
    const small = H < 480, gap = small ? 14 : 20;
    const cw = Math.floor(Math.min(240, (W - 80 - gap * (n - 1)) / n));
    const top = small ? 96 : 136, btnH = shop ? 48 : 0, btnGap = shop ? 12 : 0;
    const ch = Math.round(clamp(H - top - 64 - btnH - btnGap, shop ? 170 : 190, 260));
    const x0 = Math.round((W - (cw * n + gap * (n - 1))) / 2);
    const btnY = top + ch + btnGap, bw = Math.floor(Math.min(200, (W - 80 - 2 * gap) / 3)), bx0 = Math.round((W - (bw * 3 + gap * 2)) / 2);
    return { W, H, small, gap, cw, ch, top, x0, headY: small ? 46 : 70, btnY, btnH, bw, bx0 };
  }
  /** 카드 한 장의 내용 (모드마다): { icon, name, color, lines: [{ text, color }], foot: { text, color } } */
  cardOf(id) {
    const run = this.run;
    if (this.mode === 'pact') {
      if (!id) return { icon: 'scroll_protect', name: '거절한다', color: '#a8a0b8', lines: [{ text: '계약을 맺지 않고 지나간다', color: '#d8ccbc' }], foot: { text: '이득도 손해도 없다', color: DIM } };
      const P = PACT[id];
      return { icon: P.icon, name: P.name, color: P.color, lines: [{ text: `▲ ${P.up}`, color: '#9ae070' }, { text: `▼ ${P.down}`, color: '#ff8a7a' }], foot: { text: '한 판에 한 번 · 되돌릴 수 없다', color: '#ffb0a0' } };
    }
    const b = BLESSING[id], have = run?.taken?.[id] | 0;
    const card = { icon: b.icon, name: b.name, color: b.color, lines: [{ text: b.desc, color: '#d8ccbc' }] };
    if (this.mode === 'shop') {
      const price = run.shopPrice('bless'), sold = run.shop?.bought === id, other = !!run.shop?.bought && !sold;
      card.foot = sold ? { text: '샀다', color: '#9fe8c8' } : other ? { text: '한 장만 살 수 있다', color: DIM } : { text: `${fmt(price)}G${have ? ` · 보유 ${have}/${b.max}` : ''}`, color: run.gold >= price ? GOLD : '#ff8a7a' };
      card.dim = sold || other;
    } else card.foot = { text: have ? `보유 ${have} / ${b.max}` : b.max > 1 ? `최대 ${b.max}번까지 겹친다` : '한 번만 받을 수 있다', color: have ? '#ffe7a0' : DIM };
    return card;
  }
  render(ctx) {
    if (!this.run) return;
    const L = this.layout(), { W, H } = L;
    const k = ease.outCubic(clamp(this.t / 0.3, 0, 1));
    ctx.fillStyle = `rgba(4,0,10,${0.78 * k})`; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = k;
    const run = this.run, shop = this.mode === 'shop', pact = this.mode === 'pact', idle = this.picked === undefined;
    if (pact) heading(ctx, W / 2, L.headY, 'BLOOD PACT', `제 ${this.floor}층 · 피의 계약 — 맺거나 거절하세요`, { size: L.small ? 28 : 34, color: '#ff5a5a' });
    else if (shop) {
      heading(ctx, W / 2, L.headY, 'MERCHANT', `떠돌이 상인 로크 · 런 골드로 거래하세요`, { size: L.small ? 28 : 34, color: GOLD });
      const pr = { x: 20, y: 12, w: L.small ? 64 : 88, h: L.small ? 76 : 104 };
      frame(ctx, pr.x - 2, pr.y - 2, pr.w + 4, pr.h + 4, { accent: '#b89a60', corners: false, edge: 0.5 });
      portraitIn(ctx, assets.get(NPCS[MERCHANT.npc]?.portrait ?? 'portraits/npc_rook'), pr, { fy: 0.2, fadeBottom: 0.3 });
      text(ctx, `보유 ${fmt(run.gold)}G`, W - 24, L.small ? 32 : 40, { size: 18, align: 'right', weight: 900, family: FONT.num, color: GOLD, ow: 3 });
    } else heading(ctx, W / 2, L.headY, 'BLESSING', `제 ${this.floor}층 · 축복을 하나 고르세요`, { size: L.small ? 28 : 34, color: GOLD });
    this.ids.forEach((id, i) => {
      const c = this.cardOf(id), s = this.selK[i] ?? 0, cur = i === this.index;
      const r = { x: L.x0 + i * (L.cw + L.gap), y: L.top, w: L.cw, h: L.ch };
      const fade = !idle && this.picked !== id ? Math.max(0, 1 - this.pickT * 4) : 1;
      const lift = (!idle && this.picked === id ? Math.min(1, this.pickT * 4) * 10 : 0) + s * 6;
      const iy = r.y + Math.min(58, r.h * 0.24);
      ctx.save();
      ctx.globalAlpha *= fade * (0.75 + 0.25 * s) * (c.dim ? 0.55 : 1);
      ctx.translate(0, -lift);
      frame(ctx, r.x, r.y, r.w, r.h, { accent: c.color, glow: s * 1.1, edge: 0.4 + 0.6 * s, fill0: pact && id ? 'rgba(34,6,12,0.95)' : 'rgba(20,10,30,0.94)' });
      ctx.fillStyle = rgba(c.color, 0.16 + 0.12 * s); ctx.beginPath(); ctx.arc(r.x + r.w / 2, iy, 38, 0, Math.PI * 2); ctx.fill();
      drawIcon(ctx, c.icon, r.x + r.w / 2, iy, 56, null, { glow: false });
      const ny = iy + 66;
      text(ctx, c.name, r.x + r.w / 2, ny, { size: 17, align: 'center', weight: 900, family: FONT.title, color: cur ? '#fff6e0' : BONE, ow: 3, maxWidth: r.w - 16 });
      let ly = ny + 26;
      for (const ln of c.lines) {
        for (const l of wrap(ctx, ln.text, r.w - 28, 13, 600).slice(0, 2)) { if (ly < r.y + r.h - 30) text(ctx, l, r.x + r.w / 2, ly, { size: 13, align: 'center', weight: 700, color: ln.color, ow: 2 }); ly += 17; }
        ly += 3;
      }
      text(ctx, c.foot.text, r.x + r.w / 2, r.y + r.h - 14, { size: 12, align: 'center', weight: 800, color: c.foot.color, ow: 2, maxWidth: r.w - 16 });
      ctx.restore();
      if (idle) taps.add(`bless:${i}`, r, { owner: this, kind: 'primary', src: pact ? 'tower.pact' : shop ? 'tower.shop' : 'tower.blessing' });
    });
    if (shop) {
      const nc = this.ids.length;
      if (!nc) text(ctx, '살 수 있는 축복이 없다', W / 2, L.top + L.ch / 2, { size: 15, align: 'center', weight: 800, color: DIM, ow: 2 });
      const btn = [
        ['heal', '상처 치료', `${fmt(run.shopPrice('heal'))}G · 체력 ${Math.round(MERCHANT.healFrac * 100)}% · MP 가득`],
        ['reroll', '다시 뽑기', `${fmt(run.shopPrice('reroll'))}G · 새 카드 셋`],
        ['leave', '떠나기', '다음 길로'],
      ];
      btn.forEach(([kind, label, sub], j) => {
        const r = { x: L.bx0 + j * (L.bw + L.gap), y: L.btnY, w: L.bw, h: L.btnH };
        gbutton(ctx, r, label, { selected: this.index === nc + j, sub, size: 15, accent: kind === 'leave' ? '#b8aa98' : GOLD, id: `bless:${nc + j}`, owner: this, src: 'tower.shop' });
      });
    }
    if (this.msg) text(ctx, this.msg.text, W / 2, H - 36, { size: 14, align: 'center', weight: 800, color: this.msg.color, ow: 3, maxWidth: W - 40 });
    const items = promptMode() === 'touch'
      ? [[null, '', pact ? '카드를 눌러 계약을 맺거나 거절하세요' : shop ? '카드를 눌러 사고, 떠나기를 눌러 다음 길로' : '카드를 눌러 축복을 받으세요']]
      : shop ? [['dpad', '선택'], ['confirm', '사기'], ['cancel', '떠나기']] : [['dpadH', '선택'], ['confirm', pact ? '정하기' : '받기']];
    drawHints(ctx, items, W / 2, H - 14, { align: 'center', size: 13, color: '#b8aa98' });
    ctx.restore();
  }
}

