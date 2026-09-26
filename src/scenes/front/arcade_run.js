// 아케이드 실전 장면: 보스 러시 / 서바이벌 / 스테이지 연습 + 아케이드 일시정지 + 결과 정산
// World 를 직접 만들고 인스턴스 메서드(onBossDefeated/onPlayerDeath/addScore/finishStage)를 덮어써서 모드 규칙을 적용한다.
import { Scene, TILE } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, rgba, fmt, rand, randi, pick, chance, TAU, lerp } from '../../core/math.js';
import { isSolidType, T } from '../../core/physics.js';
import { World } from '../../game/world.js';
import { createBoss } from '../../game/bosses/index.js';
import { drawHUD } from '../../render/hud.js';
import { STAGES, STAGE_ORDER } from '../../data/stages.js';
import { BOSSES } from '../../data/bosses.js';
import { ENEMIES } from '../../data/enemies.js';
import { POWERUPS } from '../../data/powerups.js';
import { CHARACTERS } from '../../data/characters.js';
import { getDiff } from '../../data/difficulty.js';
import { ARCADE_MODES, LEVEL_PRESETS, COURSES, courseBosses, BOSS_ORDER, endArcade } from './arcade.js';
import { frame, ornament, gbutton, menuItem, setPad, fmtClock, portraitIn, qualifies, heading, kenBurns, shade, GOLD, BONE, DIM, CRIMSON } from './common.js';

const NO_SPAWN = new Set(['medusa_spawner', 'mimic', 'golden_bat']);

/** 기둥 tx 에서 위→아래로 첫 바닥 윗면 y (없으면 맵 아래 - 2칸) */
function groundY(map, tx) {
  tx = clamp(tx, 0, map.w - 1);
  for (let ty = 1; ty < map.h; ty++) {
    const t = map.typeAt(tx, ty), above = map.typeAt(tx, ty - 1);
    if ((isSolidType(t) || t === T.ONEWAY) && !isSolidType(above) && ty > map.h * 0.45) return ty * TILE;
  }
  return (map.h - 2) * TILE;
}

class ArcadeRunScene extends Scene {
  enter({ cfg }) {
    setPad(true);
    this.cfg = cfg;
    this.P = LEVEL_PRESETS[cfg.preset ?? 1] ?? LEVEL_PRESETS[1];
    this.diff = getDiff(cfg.diff);
    this.phase = 'ready'; this.phaseT = 0;
    this.clock = 0; this.done = false;
    this.world = this.makeWorld();
    this.game.world = this.world;
    this.patch();
    this.setup?.();
  }
  exit() { if (this.game.world === this.world) this.game.world = null; }
  resize() { this.world?.camera.setView(this.game.viewW, this.game.viewH); }
  onResume() { setPad(true); this.world?.player?.refreshStats(); }
  makeArenaWorld(level) {
    const stage = { ...STAGES.arena, level, intro: null, outro: null, boss: null };
    const w = new World(this.game, stage, { mode: this.cfg.kind });
    const m = w.map;
    // 투기장 전체를 경기장으로 고정 (방 출구·보스 트리거 무시)
    w.arena = { x0: 0, x1: m.pxW, cam: { x: 0, y: 0, w: m.pxW, h: m.pxH } };
    w.arenaX = undefined;
    w.banner = null;
    return w;
  }
  patch() {
    const w = this.world, self = this;
    w.onPlayerDeath = () => self.onDeath();
    const origHurt = w.onPlayerHurt.bind(w);
    w.onPlayerHurt = (dmg) => { origHurt(dmg); self.onHurt?.(dmg); };
  }
  onDeath() {
    const w = this.world, st = this.game.state;
    w.run.lives--;
    st.stats.deaths = (st.stats.deaths ?? 0) + 1;
    if (w.run.lives > 0) this.game.fadeOut(() => this.respawnHere(), 0.4);
    else this.finish(false);
  }
  respawnHere() {
    const w = this.world, p = w.player;
    if (!w.entities.includes(p)) w.add(p);
    p.dead = false; p.deathHandled = false; p.deathT = 0;
    p.buffs = {}; p.refreshStats();
    p.hp = p.stats.hp; p.mp = p.stats.mp;
    const cx = clamp(p.cx, TILE * 2, w.map.pxW - TILE * 2);
    p.x = cx - p.w / 2; p.y = groundY(w.map, Math.floor(cx / TILE)) - p.h - 120; p.vx = 0; p.vy = 0;
    p.iframes = 3;
    w.combo.n = 0;
    w.banner = { text: 'READY?', sub: `남은 목숨 ${w.run.lives}`, t: 1.6, color: '#ffe7a0' };
  }
  canPause() { const w = this.world; return !this.done && !w.player.dead && !w.cutscene && !w.transitioning; }
  update(dt) {
    const w = this.world;
    this.game.state.stats.playTime = (this.game.state.stats.playTime ?? 0) + dt;
    if (input.pressed('menu') && this.canPause()) { audio.sfx('menu_ok'); this.game.push('arcadePause', { run: this }); return; }
    this.phaseT += dt;
    this.tick?.(dt);
    w.update(dt);
    // 안전장치: 월드가 죽은 플레이어를 목록에서 빼 버리는 경우에도 사망 연출·처리를 이어간다
    const p = w.player;
    if (p?.dead && !p.deathHandled && !w.entities.includes(p)) p.updateDeath?.(dt, w);
  }
  render(ctx) {
    const w = this.world, vw = this.game.viewW, vh = this.game.viewH;
    w.render(ctx);
    drawHUD(ctx, w, vw, vh);
    this.overlay?.(ctx, vw, vh);
  }
  /** 모드 종료 → 결과 정산 */
  finish(cleared, reason = null) {
    if (this.done) return;
    this.done = true;
    const w = this.world;
    if (w.combo.n > 0) w.endCombo();
    w.syncRun();
    const res = this.results(cleared, reason);
    audio.stopMusic(0.5);
    this.game.go('arcadeResults', { ...res, kind: this.cfg.kind, cfg: this.cfg, charId: this.cfg.charId, cleared, reason }, { fadeTime: cleared ? 0.9 : 0.6 });
  }
  /** 모드 이름 오버레이 (상단 중앙) */
  modeTag(ctx, vw, main, sub, color) {
    const x = vw / 2, y = 22;
    ctx.save();
    const g = ctx.createLinearGradient(x - 170, 0, x + 170, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(8,2,10,0.72)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 170, 4, 340, 56);
    text(ctx, main, x, y + 6, { size: 17, align: 'center', weight: 900, family: FONT.logo, color, ow: 4 });
    if (sub) text(ctx, sub, x, y + 28, { size: 16, align: 'center', weight: 800, family: FONT.num, color: '#fff', ow: 3 });
    ctx.restore();
  }
  /** 큰 중앙 문구 (라운드/웨이브) */
  bigCall(ctx, vw, vh, main, sub, color, k) {
    if (k <= 0) return;
    const a = clamp(Math.min(k * 4, (1 - k) * 4), 0, 1);
    const s = 1 + (1 - ease.outBack(clamp(k * 3, 0, 1))) * 0.6;
    ctx.save();
    ctx.globalAlpha = a;
    const y = vh * 0.4;
    const g = ctx.createLinearGradient(0, 0, vw, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 58, vw, 100);
    ctx.fillStyle = rgba(color, 0.8); ctx.fillRect(vw * 0.2, y - 58, vw * 0.6, 1.5); ctx.fillRect(vw * 0.2, y + 41, vw * 0.6, 1.5);
    ctx.translate(vw / 2, y); ctx.scale(s, s);
    ctx.shadowColor = color; ctx.shadowBlur = 20;
    text(ctx, main, 0, 8, { size: 50, align: 'center', weight: 900, family: FONT.logo, color: '#fff6e0', ow: 6 });
    ctx.shadowBlur = 0;
    if (sub) text(ctx, sub, 0, 34, { size: 16, align: 'center', weight: 800, color, ow: 3 });
    ctx.restore();
  }
}

// ───────────────────────────── 보스 러시 ─────────────────────────────
export class BossRushScene extends ArcadeRunScene {
  makeWorld() { return this.makeArenaWorld(this.P.lv); }
  setup() {
    this.queue = courseBosses(this.cfg.course ?? 0);
    this.round = 0; this.roundT = 0; this.roundDmg = 0; this.log = [];
    audio.music('arena');
    this.call = { main: 'BOSS RUSH', sub: `${COURSES[this.cfg.course ?? 0].name} · ${this.queue.length}연전`, color: '#ff4a5a', t: 0 };
  }
  onHurt(d) { this.roundDmg += d; }
  tick(dt) {
    const w = this.world;
    if (this.call) { this.call.t += dt / 2.2; if (this.call.t >= 1) this.call = null; }
    if (this.phase === 'fight') { this.clock += dt; this.roundT += dt; }
    if (this.phase === 'ready' && this.phaseT > 2.3) this.spawnBoss();
    if (this.phase === 'clear' && this.phaseT > 3.4 && (!w.boss || w.boss.dead)) {
      this.round++;
      if (this.round >= this.queue.length) { this.phase = 'complete'; this.phaseT = 0; audio.music('victory'); w.banner = { text: 'ALL CLEAR!', sub: '모든 군주를 쓰러뜨렸다!', t: 3, color: '#ffe070', big: true }; }
      else { this.nextRound(); }
    }
    if (this.phase === 'complete' && this.phaseT > 3.2) this.finish(true);
  }
  nextRound() {
    const w = this.world, p = w.player;
    w.boss = null; w.bossActive = false;
    // 라운드 사이 회복
    const got = p.heal(p.stats.hp * 0.35);
    p.mp = Math.min(p.stats.mp, p.mp + p.stats.mp * 0.5);
    w.run.hearts = Math.min(99, w.run.hearts + 10);
    audio.sfx('heal');
    w.fx.burst('holy', p.cx, p.cy, 24, { speed: 180, color: '#8aff9a' });
    w.fx.ring(p.cx, p.cy, { color: '#8aff9a', r0: 10, r1: 90, life: 0.5, width: 5 });
    this.phase = 'ready'; this.phaseT = 0;
    const id = this.queue[this.round];
    this.call = { main: `ROUND ${this.round + 1}`, sub: BOSSES[id]?.name ?? '???', color: '#ff4a5a', t: 0 };
    audio.sfx('ready');
  }
  spawnBoss() {
    const w = this.world, m = w.map, g = this.game;
    const id = this.queue[this.round];
    const def = BOSSES[id];
    const sl = STAGES[def?.stageId]?.level ?? (10 + this.round * 3);
    w.stage.level = Math.round(clamp(sl, this.P.lv - 8, this.P.lv + 2));
    const p = w.player;
    const bx = p.cx < m.pxW / 2 ? m.pxW * 0.74 : m.pxW * 0.26;
    const by = groundY(m, Math.floor(bx / TILE));
    const boss = createBoss(w, id, bx, by);
    w.boss = boss; w.add(boss); w.bossActive = true;
    this.phase = 'intro'; this.phaseT = 0; this.roundT = 0; this.roundDmg = 0;
    w.cutscene = true;
    audio.stopMusic(0.4);
    g.push('bossIntro', { bossId: id, world: w, onDone: () => { w.cutscene = false; this.phase = 'fight'; this.phaseT = 0; audio.music(boss.def?.music ?? 'boss'); } });
    // 보스 격파 처리 (라운드 진행)
    w.onBossDefeated = (b) => this.onBossDown(b);
  }
  onBossDown(boss) {
    if (this.phase !== 'fight' && this.phase !== 'intro') return;
    const w = this.world, g = this.game;
    this.phase = 'clear'; this.phaseT = 0;
    w.bossActive = false;
    w.slowmo = 1.3;
    g.flash('#ffffff', 0.9, 1.6);
    w.camera.shake(14, 1.0);
    audio.stopMusic(0.3); audio.sfx('boss_die');
    const rt = this.roundT;
    const base = boss.def?.score ?? 20000;
    const timeBonus = Math.max(0, Math.round((150 - rt) * 200));
    const perfect = this.roundDmg <= 0 ? 30000 : 0;
    w.addScore(base + timeBonus + perfect);
    this.log.push({ id: boss.def?.id, name: boss.def?.name ?? '', time: rt, perfect: !!perfect });
    const st = this.game.state;
    st.stats.bossKills = (st.stats.bossKills ?? 0) + 1;
    for (let i = 0; i < 16; i++) setTimeout(() => w.fx?.burst('fire', boss.cx + rand(-80, 80), boss.cy + rand(-80, 80), 8, { speed: 200 }), i * 70);
    w.banner = { text: perfect ? 'PERFECT!' : 'ROUND CLEAR', sub: `${boss.def?.name ?? ''} 격파 · ${fmtClock(rt)}  +${fmt((base + timeBonus + perfect) * (w.diff.scoreMult ?? 1))}`, t: 3, color: perfect ? '#ffe070' : '#ffd0a0', big: true };
  }
  results(cleared) {
    const w = this.world;
    return {
      title: cleared ? 'BOSS RUSH COMPLETE' : 'GAME OVER',
      score: w.run.score, time: this.clock,
      rows: [
        ['격파한 보스', `${this.log.length} / ${this.queue.length}`],
        ['총 전투 시간', fmtClock(this.clock)],
        ['무피해 격파', `${this.log.filter((l) => l.perfect).length}회`],
        ['최대 콤보', `${Math.max(w.combo.best, w.combo.max)} HITS`],
      ],
      log: this.log, stageId: 'arena', extra: { bosses: this.log.length, total: this.queue.length },
    };
  }
  overlay(ctx, vw, vh) {
    const g = this.game;
    this.modeTag(ctx, vw, `ROUND ${Math.min(this.round + 1, this.queue.length)} / ${this.queue.length}`, fmtClock(this.clock), '#ff6a7a');
    if (this.call) this.bigCall(ctx, vw, vh, this.call.main, this.call.sub, this.call.color, this.call.t);
    // 다음 보스 미리보기 (대기 중)
    if (this.phase === 'ready' && this.round < this.queue.length) {
      const id = this.queue[this.round], img = assets.get(BOSSES[id]?.portrait ?? `portraits/${id}`);
      const k = ease.outCubic(clamp(this.phaseT / 0.5, 0, 1)) * clamp((2.3 - this.phaseT) / 0.3, 0, 1);
      if (img && k > 0) {
        const r = { x: vw - 170 * k, y: vh * 0.5 - 110, w: 150, h: 200 };
        ctx.save(); ctx.globalAlpha = k;
        portraitIn(ctx, img, r, { fy: 0.15, fadeBottom: 0.4 });
        ctx.strokeStyle = '#ff4a5a'; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        text(ctx, 'NEXT', r.x + 8, r.y + 20, { size: 13, weight: 900, family: FONT.logo, color: '#ff8a9a', ow: 3 });
        ctx.restore();
      }
    }
  }
}

// ───────────────────────────── 서바이벌 ─────────────────────────────
export class SurvivalScene extends ArcadeRunScene {
  makeWorld() { return this.makeArenaWorld(Math.max(1, Math.round(this.P.lv * 0.6))); }
  setup() {
    const w = this.world;
    this.wave = 0; this.mult = 1; this.queue = []; this.spawnT = 0; this.bossesUsed = 0;
    this.kills0 = 0;
    const orig = w.addScore.bind(w);
    w.addScore = (n) => orig(n * this.mult);
    audio.music('arena');
    this.call = { main: 'SURVIVAL', sub: '끝없는 마물의 물결에서 살아남아라', color: '#ffa640', t: 0 };
    this.phase = 'intro0'; this.phaseT = 0;
    w.onBossDefeated = (b) => this.onBossDown(b);
  }
  onHurt() {
    if (this.mult > 1) { this.mult = Math.max(1, +(this.mult - 0.25).toFixed(2)); this.multFlash = 0.6; }
  }
  pool() {
    const tier = clamp(Math.floor((this.wave - 1) / 2), 0, STAGE_ORDER.length - 1);
    const ids = new Set();
    for (let i = Math.max(0, tier - 1); i <= tier; i++) for (const id of STAGES[STAGE_ORDER[i]]?.enemies ?? []) if (ENEMIES[id] && !NO_SPAWN.has(id)) ids.add(id);
    let list = [...ids];
    if (!list.length) list = Object.keys(ENEMIES).filter((id) => !NO_SPAWN.has(id));
    return list;
  }
  startWave() {
    const w = this.world;
    this.wave++;
    const n = Math.min(40, 4 + this.wave * 2);
    const pool = this.pool();
    const eliteP = Math.min(0.5, (this.diff.elite ?? 0) + this.wave * 0.015);
    this.queue = [];
    for (let i = 0; i < n; i++) this.queue.push({ id: pick(pool), elite: chance(eliteP) });
    this.bossWave = this.wave % 5 === 0;
    if (this.bossWave) {
      const ids = BOSS_ORDER.filter((id) => BOSSES[id]);
      this.bossId = ids.length ? ids[this.bossesUsed % ids.length] : null;
      this.bossesUsed++;
    }
    this.spawnT = 0.6;
    this.phase = 'wave'; this.phaseT = 0;
    this.call = { main: this.bossWave ? `BOSS WAVE ${this.wave}` : `WAVE ${this.wave}`, sub: this.bossWave ? '거대한 기운이 다가온다…' : `적 ${n}마리 · 점수 배율 ×${this.mult.toFixed(2)}`, color: this.bossWave ? '#ff4a5a' : '#ffa640', t: 0 };
    audio.sfx(this.bossWave ? 'warning' : 'ready');
    if (this.bossWave && this.bossId) setTimeout(() => this.spawnWaveBoss(), 1600);
  }
  level() { return Math.max(1, Math.round(this.P.lv * 0.6 + this.wave * 1.4)); }
  spawnOne(spec) {
    const w = this.world, m = w.map, p = w.player;
    const def = ENEMIES[spec.id];
    const side = p.cx < m.pxW / 2 ? (chance(0.7) ? 1 : -1) : (chance(0.7) ? -1 : 1);
    const tx = side > 0 ? m.w - 3 - randi(0, 3) : 2 + randi(0, 3);
    const fx = tx * TILE + TILE / 2;
    let fy = groundY(m, tx);
    if (def?.flying) fy -= rand(140, 260);
    const e = w.spawnEnemy(spec.id, fx, fy, { level: this.level(), elite: spec.elite, facing: -side });
    w.fx.burst('dark', fx, fy - 30, 14, { speed: 120 });
    w.fx.ring(fx, fy - 30, { color: spec.elite ? '#ffd070' : '#b060ff', r0: 6, r1: 60, life: 0.4, width: 4 });
    audio.sfx('mist', { vol: 0.4 });
    return e;
  }
  spawnWaveBoss() {
    if (this.done || this.phase !== 'wave' || !this.bossId) return;
    const w = this.world, m = w.map, p = w.player;
    w.stage.level = this.level();
    const bx = p.cx < m.pxW / 2 ? m.pxW * 0.75 : m.pxW * 0.25;
    const boss = createBoss(w, this.bossId, bx, groundY(m, Math.floor(bx / TILE)));
    w.boss = boss; w.add(boss); w.bossActive = true;
    w.cutscene = true;
    this.game.push('bossIntro', { bossId: this.bossId, world: w, onDone: () => { w.cutscene = false; audio.music(boss.def?.music ?? 'boss'); } });
  }
  onBossDown(boss) {
    const w = this.world;
    w.bossActive = false;
    w.slowmo = 1.1; this.game.flash('#fff', 0.8, 2); w.camera.shake(12, 0.8);
    audio.sfx('boss_die');
    w.addScore((boss.def?.score ?? 20000));
    w.banner = { text: 'BOSS DOWN!', sub: `${boss.def?.name ?? ''} 격파`, t: 2.4, color: '#ffe070', big: true };
    setTimeout(() => { if (!this.done) audio.music('arena'); }, 2500);
  }
  tick(dt) {
    const w = this.world;
    if (this.call) { this.call.t += dt / 2.2; if (this.call.t >= 1) this.call = null; }
    if (this.multFlash > 0) this.multFlash -= dt;
    if (this.phase !== 'intro0') this.clock += dt;
    if (this.phase === 'intro0' && this.phaseT > 2.4) this.startWave();
    if (this.phase === 'wave') {
      const alive = w.enemies().length;
      const cap = Math.min(14, 7 + Math.floor(this.wave / 3));
      this.spawnT -= dt;
      if (this.queue.length && this.spawnT <= 0 && alive < cap && !w.cutscene) {
        this.spawnOne(this.queue.shift());
        this.spawnT = Math.max(0.25, 0.9 - this.wave * 0.03);
      }
      const bossPending = this.bossWave && this.bossId && this.phaseT < 2;
      if (!this.queue.length && alive === 0 && !bossPending && this.phaseT > 1.5) this.waveClear();
    }
    if (this.phase === 'clear' && this.phaseT > 3.2) this.startWave();
  }
  waveClear() {
    const w = this.world, p = w.player, m = w.map;
    this.phase = 'clear'; this.phaseT = 0;
    const bonus = this.wave * 1000;
    w.addScore(bonus);
    this.mult = +(this.mult + 0.25).toFixed(2);
    audio.sfx('win');
    w.banner = { text: 'WAVE CLEAR', sub: `보너스 +${fmt(bonus * this.mult * (w.diff.scoreMult ?? 1))} · 배율 ×${this.mult.toFixed(2)}`, t: 2.6, color: '#ffd070', big: true };
    p.heal(p.stats.hp * 0.15);
    w.run.hearts = Math.min(99, w.run.hearts + 5);
    // 보상 드롭
    const cx = clamp(p.cx + (p.cx < m.pxW / 2 ? 160 : -160), TILE * 3, m.pxW - TILE * 3);
    const ids = Object.keys(POWERUPS).filter((id) => id !== 'rosary');
    w.spawnPickup('powerup', cx, groundY(m, Math.floor(cx / TILE)) - 160, { id: pick(ids), vx: 0, vy: -200 });
    if (this.wave % 3 === 0) w.spawnPickup('food', cx - 60, groundY(m, Math.floor((cx - 60) / TILE)) - 160, { heal: 0.4, icon: 'meat', vx: 0, vy: -200 });
    if (this.wave % 10 === 0) w.spawnPickup('oneup', cx + 60, groundY(m, Math.floor((cx + 60) / TILE)) - 160, { vx: 0, vy: -200 });
  }
  results(cleared) {
    const w = this.world;
    const m = this.game.meta;
    return {
      title: 'GAME OVER', score: w.run.score, time: this.clock,
      rows: [
        ['도달 웨이브', `WAVE ${this.wave}`],
        ['생존 시간', fmtClock(this.clock)],
        ['처치 수', `${w.run.kills}`],
        ['최종 배율', `×${this.mult.toFixed(2)}`],
        ['최대 콤보', `${Math.max(w.combo.best, w.combo.max)} HITS`],
      ],
      stageId: 'arena', extra: { wave: this.wave },
    };
  }
  overlay(ctx, vw, vh) {
    const k = this.multFlash > 0 ? this.multFlash / 0.6 : 0;
    this.modeTag(ctx, vw, this.wave ? `WAVE ${this.wave}` : 'SURVIVAL', fmtClock(this.clock), '#ffb060');
    // 배율
    const x = vw / 2 + 120, y = 34;
    text(ctx, `×${this.mult.toFixed(2)}`, x, y + 6, { size: 20, align: 'left', weight: 900, family: FONT.num, color: k > 0 ? '#ff6060' : this.mult >= 3 ? '#ffe070' : '#ffd0a0', ow: 4 });
    text(ctx, 'MULTI', x, y - 12, { size: 9, weight: 800, family: FONT.num, color: DIM, ow: 2 });
    if (this.phase === 'wave') {
      const left = this.queue.length + this.world.enemies().length;
      text(ctx, `남은 적 ${left}`, vw / 2, 78, { size: 13, align: 'center', weight: 800, color: '#e8d8c0', ow: 3 });
    }
    if (this.call) this.bigCall(ctx, vw, vh, this.call.main, this.call.sub, this.call.color, this.call.t);
  }
}

// ───────────────────────────── 스테이지 연습 ─────────────────────────────
export class PracticeScene extends ArcadeRunScene {
  makeWorld() {
    const w = new World(this.game, this.cfg.stageId ?? 's01', { mode: 'practice' });
    return w;
  }
  setup() {
    const w = this.world;
    w.finishStage = () => this.finish(true);
    w.banner = null;
    this.call = { main: 'STAGE PRACTICE', sub: `제${w.stage.chapter}장 ${w.stage.name}`, color: '#5aa8ff', t: 0 };
    this.phase = 'play';
  }
  tick(dt) { if (this.call) { this.call.t += dt / 2.4; if (this.call.t >= 1) this.call = null; } }
  results(cleared) {
    const w = this.world, run = w.run, stage = w.stage;
    let bonus = 0, rank = 'D';
    if (cleared) {
      const par = stage.parTime ?? 300;
      const timeBonus = Math.max(0, Math.round((par * 1.5 - run.time) * 100));
      const noDmg = run.damageTaken === 0 ? 50000 : 0;
      bonus = Math.round((timeBonus + w.combo.best * 200 + run.kills * 50 + run.secrets * 3000 + run.lives * 5000 + noDmg) * (w.diff.scoreMult ?? 1));
      let pts = 40 + clamp((par - run.time) / par, -0.5, 0.6) * 40 + clamp(w.combo.best / 60, 0, 1) * 20;
      pts += run.damageTaken === 0 ? 20 : clamp(1 - run.damageTaken / (w.player.stats.hp * 3), 0, 1) * 12;
      rank = pts >= 90 ? 'S' : pts >= 75 ? 'A' : pts >= 55 ? 'B' : pts >= 35 ? 'C' : 'D';
    }
    return {
      title: cleared ? 'STAGE CLEAR' : 'GAME OVER', score: run.score + bonus, time: run.time, rank: cleared ? rank : null,
      rows: [
        ['스테이지', `제${stage.chapter}장 ${stage.name}`],
        ['클리어 시간', cleared ? fmtClock(run.time) : '-'],
        ['처치 수', `${run.kills}`],
        ['최대 콤보', `${Math.max(w.combo.best, w.combo.max)} HITS`],
        ['비밀 발견', `${run.secrets}`],
        ['클리어 보너스', cleared ? `+${fmt(bonus)}` : '-'],
      ],
      stageId: stage.id,
    };
  }
  overlay(ctx, vw, vh) {
    text(ctx, 'PRACTICE', vw / 2, 22, { size: 13, align: 'center', weight: 900, family: FONT.logo, color: '#8ac8ff', ow: 3 });
    if (this.call) this.bigCall(ctx, vw, vh, this.call.main, this.call.sub, this.call.color, this.call.t);
  }
}

// ───────────────────────────── 일시정지 ─────────────────────────────
export class ArcadePauseScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ run }) {
    this.run = run;
    this.items = [
      ['계속하기', 'RESUME', () => this.game.pop()],
      ['설정', 'OPTIONS', () => this.game.push('options', {})],
      ['리타이어 (결과 보기)', 'RETIRE', () => this.game.push('frontConfirm', { title: '리타이어', message: '도전을 포기하고 지금까지의 기록으로 정산할까요?', yes: '리타이어', danger: true, onYes: () => { this.game.pop(); run.finish(false, 'retire'); } })],
      ['아케이드 메뉴로', 'EXIT', () => this.game.push('frontConfirm', { title: '나가기', message: '기록을 남기지 않고 아케이드 메뉴로 돌아갈까요?', yes: '나가기', danger: true, onYes: () => { run.done = true; endArcade(this.game); this.game.go('arcade', {}); } })],
    ];
    this.menu = new ListMenu(this.items.length);
    audio.duck?.(0.4, 0.3);
  }
  onResume() { setPad(true); }
  update(dt) {
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') { audio.sfx('menu_ok'); this.items[this.menu.index][2](); }
    else if (r === 'cancel' || input.pressed('menu')) { audio.sfx('menu_cancel'); this.game.pop(); }
  }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH;
    const k = ease.outCubic(clamp(this.t / 0.2, 0, 1));
    ctx.fillStyle = `rgba(4,0,8,${0.62 * k})`; ctx.fillRect(0, 0, vw, vh);
    const M = ARCADE_MODES[this.run.cfg.kind];
    ctx.save(); ctx.globalAlpha = k;
    heading(ctx, vw / 2, 118, 'PAUSE', M?.name, { size: 42 });
    const w = 320, h = 50;
    this.items.forEach(([l, s], i) => {
      const r = { x: vw / 2 - w / 2, y: 190 + i * (h + 8), w, h };
      this.menu.hit(i, r);
      menuItem(ctx, r, l, { selected: this.menu.index === i, sub: s, size: 19 });
    });
    const w2 = this.run.world;
    text(ctx, `SCORE ${fmt(w2.run.score)}   ·   ${fmtClock(this.run.clock || w2.run.time)}`, vw / 2, 190 + this.items.length * 58 + 24, { size: 14, align: 'center', weight: 800, family: FONT.num, color: '#d8c8b0', ow: 3 });
    ctx.restore();
  }
}

// ───────────────────────────── 결과 정산 ─────────────────────────────
export class ArcadeResultsScene extends Scene {
  enter(p) {
    setPad(false);
    Object.assign(this, { res: p });
    const g = this.game, m = g.meta;
    this.shown = 0; this.rowT = 0; this.scoreShown = 0;
    this.final = Math.max(0, Math.floor(p.score ?? 0));
    this.date = Date.now();
    // 최고 기록 갱신
    let best = false;
    if (p.kind === 'bossrush' && p.cleared) {
      const b = m.bossRushBest;
      if (!b || p.time < (b.time ?? 1e9) || (p.cfg.course ?? 0) > (b.course ?? 0)) { m.bossRushBest = { time: p.time, score: this.final, charId: p.charId, course: p.cfg.course ?? 0, date: this.date }; best = true; }
    }
    if (p.kind === 'survival' && (p.extra?.wave ?? 0) > (m.survivalBest ?? 0)) { m.survivalBest = p.extra.wave; best = true; }
    this.newBest = best;
    saves.saveMeta(m);
    this.qual = qualifies(g, p.kind, this.final);
    audio.music(p.cleared ? 'victory' : 'gameover');
    endArcade(g);
  }
  exit() { setPad(true); }
  update(dt) {
    this.rowT += dt;
    const rows = this.res.rows ?? [];
    if (this.shown < rows.length && this.rowT > 0.3) { this.rowT = 0; this.shown++; audio.sfx('coin'); }
    if (this.shown >= rows.length) {
      this.scoreShown = Math.min(this.final, this.scoreShown + Math.max(1, this.final * dt * 1.2));
      if (!this.doneT && this.scoreShown >= this.final) { this.doneT = this.t; audio.sfx(this.qual ? 'levelup' : 'menu_ok'); }
    }
    const skip = input.pressed('confirm') || input.pressed('attack') || input.pointer.tapped;
    if (!skip) return;
    if (!this.doneT) { this.shown = rows.length; this.scoreShown = this.final; this.doneT = this.t; return; }
    if (this.t - this.doneT < 0.4 || this.left) return;
    this.left = true;
    const g = this.game, r = this.res;
    const entry = { score: this.final, mode: r.kind, charId: r.charId, diff: r.cfg?.diff, stageId: r.stageId, date: this.date, wave: r.extra?.wave, bosses: r.extra?.bosses, time: r.time };
    if (this.qual) g.push('initials', { score: this.final, mode: r.kind, entry, onDone: () => g.go('highscore', { mode: r.kind, highlight: this.date, back: 'arcade' }) });
    else g.go('arcade', { cfg: r.cfg });
  }
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time, r = this.res;
    const M = ARCADE_MODES[r.kind] ?? ARCADE_MODES.bossrush;
    kenBurns(ctx, assets.get(r.kind === 'practice' ? (STAGES[r.stageId]?.bg ?? 'bg/s_arena') : 'bg/s_arena'), vw, vh, t, { z0: 1.05, z1: 1.1 });
    ctx.fillStyle = 'rgba(6,2,10,0.74)'; ctx.fillRect(0, 0, vw, vh);
    shade(ctx, vw, vh, { top: 0.5, bottom: 0.6, vig: 0.8 });
    const k = ease.outBack(clamp(this.t / 0.5, 0, 1));
    ctx.save();
    ctx.translate(vw / 2, 64); ctx.scale(k, k);
    ctx.shadowColor = r.cleared ? '#ffe070' : '#ff2040'; ctx.shadowBlur = 24;
    text(ctx, r.title ?? 'RESULT', 0, 0, { size: 42, align: 'center', weight: 900, family: FONT.logo, color: r.cleared ? '#ffe070' : '#ff4a5a', ow: 6 });
    ctx.restore();
    text(ctx, `${M.name} · ${CHARACTERS[r.charId]?.name ?? ''} · ${getDiff(r.cfg?.diff).name}`, vw / 2, 96, { size: 15, align: 'center', weight: 700, color: '#e8d8c0', ow: 3 });
    const w = Math.min(560, vw - 120), x = vw / 2 - w / 2, y = 120, rows = r.rows ?? [];
    frame(ctx, x, y, w, 70 + rows.length * 36 + 60, { accent: M.color, glow: 0.6 });
    rows.slice(0, this.shown).forEach(([a, b], i) => {
      const yy = y + 44 + i * 36;
      text(ctx, a, x + 30, yy, { size: 17, color: '#e8dcc8', ow: 2 });
      text(ctx, b, x + w - 30, yy, { size: 17, align: 'right', weight: 800, family: FONT.num, color: '#fff', ow: 2 });
      ctx.fillStyle = 'rgba(232,200,114,0.12)'; ctx.fillRect(x + 24, yy + 12, w - 48, 1);
    });
    const sy = y + 44 + rows.length * 36 + 22;
    text(ctx, 'SCORE', x + 30, sy, { size: 18, weight: 900, family: FONT.num, color: DIM, ow: 2 });
    text(ctx, fmt(this.scoreShown), x + w - 30, sy + 4, { size: 34, align: 'right', weight: 900, family: FONT.num, color: '#fff', ow: 4 });
    if (r.rank && this.doneT) {
      const kk = ease.outBack(clamp((this.t - this.doneT) / 0.4, 0, 1));
      ctx.save(); ctx.translate(x + w + 70, y + 120); ctx.scale(kk, kk); ctx.rotate(-0.15);
      text(ctx, 'RANK', 0, -60, { size: 16, align: 'center', weight: 800, family: FONT.num, color: '#e8d8c0' });
      text(ctx, r.rank, 0, 30, { size: 110, align: 'center', weight: 900, family: FONT.logo, color: { S: '#ffe070', A: '#ffa640', B: '#5aa8ff', C: '#7ee07e' }[r.rank] ?? '#aaa', ow: 8 });
      ctx.restore();
    }
    if (this.doneT) {
      const a = 0.6 + 0.4 * Math.sin(t * 5);
      if (this.newBest) text(ctx, '★ 최고 기록 갱신! ★', vw / 2, sy + 44, { size: 18, align: 'center', weight: 900, color: `rgba(255,224,112,${a})`, ow: 3 });
      else if (this.qual) text(ctx, '명예의 전당 순위권 진입!', vw / 2, sy + 44, { size: 17, align: 'center', weight: 900, color: `rgba(255,224,112,${a})`, ow: 3 });
      text(ctx, input.touchMode ? '화면을 터치하세요' : 'Z / Enter 로 계속', vw / 2, vh - 22, { size: 14, align: 'center', color: DIM, ow: 2 });
    }
  }
}
