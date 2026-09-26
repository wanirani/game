// 스테이지 런타임: 방 로딩, 엔티티 관리, 충돌/드롭/점수/콤보, 보스전, 방 이동, 렌더링
import { TILE } from '../core/game.js';
import { Camera } from '../core/camera.js';
import { Particles } from '../core/particles.js';
import { Lighting } from '../core/lighting.js';
import { T, Debris } from '../core/physics.js';
import { rand, randi, chance, clamp, overlap, TAU, pick } from '../core/math.js';
import { audio } from '../core/audio.js';
import { bus } from '../core/events.js';
import { saves } from '../core/save.js';
import { getDiff } from '../data/difficulty.js';
import { STAGES } from '../data/stages.js';
import { NPCS } from '../data/npcs.js';
import { POWERUPS } from '../data/powerups.js';
import { SUBWEAPONS } from '../data/subweapons.js';
import { DOCS, LORE } from '../data/lore.js';
import { ITEMS, makeItem, itemName } from '../data/items.js';
import { TileMap } from './tilemap.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Projectile, Hitbox } from './projectiles.js';
import { Pickup } from './pickups.js';
import { Candle, Chest, SavePoint, Statue, Door, MovingPlatform, CrumblePlatform, Lamp, StoryTrigger, NPC } from './props.js';
import { rollCandleLoot, rollEnemyLoot, rollChestLoot, rollBossLoot } from './loot.js';
import { addExp } from './progression.js';
import { addItem } from './inventory.js';
import { currentHero } from './state.js';
import { createBackground } from '../render/background.js';
import { TileRenderer } from '../render/tiles.js';
import { drawHero } from '../render/hero.js';
import { createBoss } from './bosses/index.js';
import { SCRIPTS } from '../data/story.js';

export const STYLE_RANKS = [
  { n: 0, r: '', c: '#fff' }, { n: 5, r: 'D', c: '#a0a0a0' }, { n: 10, r: 'C', c: '#7ee07e' }, { n: 20, r: 'B', c: '#5aa8ff' },
  { n: 35, r: 'A', c: '#c07cff' }, { n: 50, r: 'S', c: '#ffa640' }, { n: 80, r: 'SS', c: '#ff5a4a' }, { n: 120, r: 'SSS', c: '#ffe070' },
];
export function styleRank(n) { let r = STYLE_RANKS[0]; for (const s of STYLE_RANKS) if (n >= s.n) r = s; return r; }

export class World {
  constructor(game, stageId, { roomId = null, mode = 'story', onExit = null } = {}) {
    this.game = game;
    this.state = game.state;
    this.stage = typeof stageId === 'object' ? stageId : STAGES[stageId];
    if (!this.stage) throw new Error('Unknown stage ' + stageId);
    stageId = this.stage.id;
    this.mode = mode; // 'story' | 'bossrush' | 'survival'
    this.diff = getDiff(this.state.difficulty);
    this.hero = currentHero(this.state);
    this.camera = new Camera(game.viewW, game.viewH);
    this.fx = new Particles(game.settings?.quality === 'low' ? 600 : 1400);
    this.fx.quality = game.settings?.quality === 'low' ? 0.5 : game.settings?.quality === 'medium' ? 0.75 : 1;
    this.lighting = new Lighting();
    this.lighting.res = game.settings?.quality === 'low' ? 0.33 : 0.5;
    this.entities = []; this.platforms = []; this.debrisList = []; this.debugRects = [];
    this.time = 0; this.hitstop = 0; this.slowmo = 0; this.timeStop = 0;
    this.cutscene = false; this.inputLock = false; this.transitioning = false;
    this.boss = null; this.bossActive = false; this.arena = null; this.cleared = false; this.clearT = 0;
    this.combo = { n: 0, t: 0, max: 0, best: 0 };
    this.banner = null; // {text, sub, t, color}
    this.nextExtraLife = Math.ceil(((this.state.score ?? 0) + 1) / 30000) * 30000;
    this.run = {
      hp: null, mp: null, hearts: 10, lives: this.state.lives ?? this.diff.lives, score: this.state.score ?? 0,
      sp: 0, sub: this.hero.sub ?? 'dagger', time: 0, kills: 0, secrets: 0, damageTaken: 0, hits: 0,
      continues: this.diff.continues, docsFound: [], saintUsed: false, checkpoint: null,
    };
    this.onExit = onExit;
    this.player = null;
    this.loadRoom(roomId || this.stage.start || Object.keys(this.stage.rooms)[0]);
    bus.emit('stageEntered', { stageId });
    this.banner = { text: this.stage.name, sub: `CHAPTER ${this.stage.chapter ?? ''} · ${this.stage.sub ?? ''}`, t: 3.2, color: '#e8c872', big: true };
  }

  // ─────────────────────────── 방 로딩 ───────────────────────────
  loadRoom(roomId, { keepPlayer = true } = {}) {
    const room = this.stage.rooms[roomId];
    if (!room) { console.error('room not found', roomId); return; }
    this.room = room; this.roomId = roomId;
    this.map = new TileMap(room);
    this.entities = []; this.platforms = []; this.debrisList = [];
    this.fx.clear();
    this.boss = null; this.bossActive = false; this.arena = null;
    this.tiles = new TileRenderer(this.stage, this.map);
    this.bg = createBackground({ ...this.stage, ...(room.theme ? { theme: room.theme } : {}) }, this.map);
    this.lighting.darkness = room.darkness ?? this.stage.darkness ?? 0.4;
    this.lighting.color = this.stage.darkColor ?? '#06020c';
    this.camera.setView(this.game.viewW, this.game.viewH);
    this.camera.setBounds(0, 0, this.map.pxW, this.map.pxH);
    this.camera.zoom = 1; this.camera.zoomTarget = 1;

    // 플레이어
    const start = this.map.markersOf('P')[0] || { tx: 2, ty: this.map.h - 3 };
    if (!this.player) this.player = new Player(this, this.state, this.hero);
    const p = this.player;
    p.world = this;
    p.x = start.tx * TILE + TILE / 2 - p.w / 2;
    p.y = (start.ty + 1) * TILE - p.h;
    p.vx = 0; p.vy = 0; p.onGround = false;
    p.facing = room.facing ?? 1;
    this.add(p);
    this.run.checkpoint = { roomId, x: p.x, y: p.y };

    const ms = this.map.markers;
    const counters = {};
    for (const m of ms) {
      const n = (counters[m.ch] = (counters[m.ch] ?? -1) + 1);
      const fx = m.tx * TILE + TILE / 2, fy = (m.ty + 1) * TILE;
      switch (m.ch) {
        case 'C': this.add(new Candle(m.tx, m.ty, false, this.stage)); break;
        case 'T': this.add(new Candle(m.tx, m.ty, true, this.stage)); break;
        case 'S': this.add(new SavePoint(m.tx, m.ty)); break;
        case 'G': this.add(new Statue(m.tx, m.ty)); break;
        case '$': {
          const key = `${this.stage.id}:${roomId}:chest${n}`;
          const c = new Chest(m.tx, m.ty, room.chests?.[n] ?? null);
          c.key = key;
          if (this.state.progress.secrets.includes(key)) c.open = true;
          this.add(c); break;
        }
        case 'D': this.add(new Door(m.tx, m.ty, (room.doors?.[n]) ?? room.next)); break;
        case 'M': { const pl = new MovingPlatform(m.tx, m.ty, false, room.platRange ?? 4, room.platSpeed ?? 80); this.add(pl); this.platforms.push(pl); break; }
        case 'V': { const pl = new MovingPlatform(m.tx, m.ty, true, room.platRange ?? 4, room.platSpeed ?? 70); this.add(pl); this.platforms.push(pl); break; }
        case 'F': { const pl = new CrumblePlatform(m.tx, m.ty); this.add(pl); this.platforms.push(pl); break; }
        case 'L': break;
        case '!': {
          const sid = room.triggers?.[n];
          const key = `${this.stage.id}:${roomId}:trig${n}`;
          if (sid && !this.state.progress.seenScripts.includes(sid)) this.add(new StoryTrigger(m.tx, m.ty, sid, key));
          break;
        }
        case 'N': { const id = room.npcs?.[n]; if (id) this.add(new NPC(m.tx, m.ty, id, NPCS[id])); break; }
        case '@': {
          const it = room.items?.[n];
          if (it) this.spawnPlaced(it, fx, fy - 20, `${this.stage.id}:${roomId}:item${n}`);
          break;
        }
        case 'p': this.spawnPickup('powerup', fx, fy - 20, { id: pick(Object.keys(POWERUPS)), vx: 0, vy: 0 }); break;
        case 'm': this.spawnPickup('food', fx, fy - 20, { heal: 0.3, icon: 'meat', vx: 0, vy: 0 }); break;
        case 'X': this.arenaX = m.tx * TILE; break;
        default:
          if (m.ch >= '1' && m.ch <= '9') {
            const spec = room.enemies?.[m.ch];
            if (spec) {
              const id = typeof spec === 'string' ? spec : spec.id;
              const params = typeof spec === 'object' ? spec.params : undefined;
              this.spawnEnemy(id, fx, fy, { params, facing: p.cx < fx ? -1 : 1 });
            }
          }
      }
    }
    // 장식 광원
    for (const d of this.map.decor) if (d.ch === 'L') this.add(new Lamp(d.tx, d.ty));
    // 가짜 벽은 드러나기 전 벽처럼 그림
    this.camera.follow(p, 1 / 60, true);
    const music = room.music ?? this.stage.music;
    if (music && !room.boss) audio.music(music);
    bus.emit('roomEntered', { stageId: this.stage.id, roomId });
  }

  spawnPlaced(spec, x, y, key) {
    if (this.state.progress.secrets.includes(key)) return;
    let p;
    if (typeof spec === 'string') {
      if (spec.startsWith('sub:')) p = this.spawnPickup('sub', x, y, { id: spec.slice(4), vx: 0, vy: 0 });
      else if (spec.startsWith('doc:')) p = this.spawnPickup('doc', x, y, { docId: spec.slice(4), vx: 0, vy: 0 });
      else if (spec.startsWith('lore:')) p = this.spawnPickup('doc', x, y, { loreId: spec.slice(5), vx: 0, vy: 0 });
      else if (spec === 'oneup') p = this.spawnPickup('oneup', x, y, { vx: 0, vy: 0 });
      else if (ITEMS[spec]) p = this.spawnPickup('item', x, y, { item: this.makeItem(spec), vx: 0, vy: 0 });
    }
    if (p) p.secretKey = key;
  }
  makeItem(id, opts) { return makeItem(id, opts); }

  // ─────────────────────────── 엔티티 ───────────────────────────
  add(e) { e.world = this; this.entities.push(e); return e; }
  spawnProjectile(o) { return this.add(new Projectile(o)); }
  spawnEnemy(id, fx, fy, opts = {}) {
    const elite = opts.elite ?? (chance(this.diff.elite ?? 0) && id !== 'medusa_head');
    const e = new Enemy(id, fx, fy, { level: opts.level ?? this.stage.level, elite, diff: this.diff, facing: opts.facing ?? -1, params: opts.params });
    return this.add(e);
  }
  spawnPickup(type, x, y, data = {}) { return this.add(new Pickup(type, x, y, data)); }
  hittables() {
    return this.entities.filter((e) => (e.kind === 'enemy' || e.kind === 'boss' || (e.kind === 'prop' && e.takeHit)) && !e.dead && !e.hidden);
  }
  enemies() { return this.entities.filter((e) => (e.kind === 'enemy' || e.kind === 'boss') && !e.dead && !e.hidden && !(e.dying > 0)); }
  nearestEnemy(x, y, maxD = 9999) {
    let best = null, bd = maxD;
    for (const e of this.enemies()) { if (e.invuln) continue; const d = Math.hypot(e.cx - x, e.cy - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ─────────────────────────── 업데이트 ───────────────────────────
  update(dt) {
    this.debugRects.length = 0;
    // 히트스톱: 월드 정지 (파티클/카메라는 조금 움직임)
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.camera.follow(this.player, dt * 0.3);
      return;
    }
    let sdt = dt;
    if (this.slowmo > 0) { this.slowmo -= dt; sdt = dt * 0.35; }
    this.time += sdt;
    if (!this.cutscene && !this.cleared) this.run.time += dt;
    if (this.timeStop > 0) this.timeStop -= dt;
    this.bg.update?.(sdt, this);

    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.dead) continue;
      if (this.timeStop > 0 && e.kind === 'projectile' && e.team === 'enemy') continue;
      e.update(sdt, this);
    }
    for (const d of this.debrisList) d.update(sdt, this.map);
    this.debrisList = this.debrisList.filter((d) => d.life > 0);
    const removed = this.entities.filter((e) => e.dead);
    if (removed.length) {
      for (const e of removed) e.onRemove?.(this);
      this.entities = this.entities.filter((e) => !e.dead);
      this.platforms = this.platforms.filter((e) => !e.dead);
    }
    this.fx.update(sdt, this.map);
    // 콤보 타이머
    if (this.combo.n > 0) {
      this.combo.t -= dt;
      if (this.combo.t <= 0) this.endCombo();
    }
    // 카메라
    const p = this.player;
    if (this.arena) {
      this.camera.bounds = this.arena.cam;
      if (p.x < this.arena.x0) { p.x = this.arena.x0; p.vx = Math.max(0, p.vx); }
      if (p.x + p.w > this.arena.x1) { p.x = this.arena.x1 - p.w; p.vx = Math.min(0, p.vx); }
    }
    this.camera.follow(p, dt);
    // 방 가장자리 출구
    if (!this.transitioning && !p.dead && !this.arena) {
      const r = this.room;
      if (r.exitRight && p.x > this.map.pxW - p.w * 0.5) this.gotoRoom(r.exitRight);
      else if (r.exitLeft && p.x < -p.w * 0.5) this.gotoRoom(r.exitLeft);
      else if (r.exitUp && p.y < -p.h * 0.5) this.gotoRoom(r.exitUp);
      else if (r.exitDown && p.y > this.map.pxH) this.gotoRoom(r.exitDown);
    }
    // 보스 트리거
    if (this.arenaX !== undefined && !this.bossActive && !this.cleared && p.x > this.arenaX + TILE && this.room.boss) this.startBoss();
    // 스테이지 클리어 연출
    if (this.cleared) {
      this.clearT += dt;
      if (this.clearT > 4.2 && !this.exitCalled) { this.exitCalled = true; this.finishStage(); }
    }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    // 조명 수집
    this.lighting.begin();
    for (const e of this.entities) if (!e.dead) e.lights?.(this.lighting);
  }

  // ─────────────────────────── 렌더 ───────────────────────────
  render(ctx) {
    const cam = this.camera, vw = this.game.viewW, vh = this.game.viewH;
    this.bg.drawFar(ctx, cam, vw, vh, this.time);
    ctx.save();
    cam.apply(ctx);
    this.bg.drawMid(ctx, cam, this.time);
    this.tiles.drawDecor(ctx, cam, this.time);
    this.tiles.draw(ctx, cam);
    // 엔티티 (z 정렬)
    const list = this.entities.filter((e) => !e.dead && !e.hidden && (e.kind === 'player' || cam.visible(e.x, e.y, e.w, e.h, 200)));
    list.sort((a, b) => a.z - b.z);
    this.fx.draw(ctx, 'back');
    for (const e of list) if (e.z < 0) e.draw(ctx, this);
    for (const d of this.debrisList) this.drawDebris(ctx, d);
    for (const e of list) if (e.z >= 0) e.draw(ctx, this);
    this.tiles.drawLiquid(ctx, cam, this.time, this.stage.liquid);
    this.fx.draw(ctx, 'front');
    if (this.game.debug) { ctx.strokeStyle = '#f00'; for (const r of this.debugRects) ctx.strokeRect(r.x, r.y, r.w, r.h); }
    ctx.restore();
    this.lighting.render(ctx, cam, vw, vh);
    this.bg.drawFront(ctx, cam, vw, vh, this.time);
    ctx.save(); cam.apply(ctx); this.fx.draw(ctx, 'top'); ctx.restore();
    if (this.timeStop > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, vw, vh); ctx.restore();
      ctx.fillStyle = 'rgba(80,100,200,0.12)'; ctx.fillRect(0, 0, vw, vh);
    }
  }
  drawDebris(ctx, d) {
    ctx.save(); ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.rotate(d.rot);
    ctx.globalAlpha = Math.min(1, d.life / 0.5);
    if (d.draw) d.draw(ctx, d); else { ctx.fillStyle = d.color; ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); }
    ctx.restore();
  }
  drawPlatform(ctx, p, crumble = false) {
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, crumble ? '#7a6a58' : '#8a7a6a'); g.addColorStop(1, crumble ? '#3a2e24' : '#3a3440');
    ctx.fillStyle = g; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(p.x, p.y, p.w, 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1);
    if (crumble) { ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.moveTo(p.x + 14, p.y); ctx.lineTo(p.x + 20, p.y + p.h); ctx.moveTo(p.x + 34, p.y); ctx.lineTo(p.x + 28, p.y + p.h); ctx.stroke(); }
    else { ctx.fillStyle = '#c8a040'; ctx.fillRect(p.x + 4, p.y + 5, 4, 4); ctx.fillRect(p.x + p.w - 8, p.y + 5, 4, 4); }
  }
  drawNPC(ctx, npc) {
    const d = npc.def || {};
    const pseudo = { x: npc.x, y: npc.y, w: npc.w, h: npc.h, cx: npc.cx, bottom: npc.bottom, facing: npc.facing, anim: 'idle', animT: npc.t, look: d.look || { build: 'normal', skin: '#e8c2a0', hair: '#5a3a2a', hairStyle: 'short', outfit: 'villager', coat: 'short', primary: '#5a4a3a', secondary: '#3a2a1a', trim: '#8a7a5a', pants: '#3a3028', boots: '#2a1a10' }, ch: { move: {} }, vx: 0, vy: 0, onGround: true, t: npc.t, rig: (npc.rig ??= {}), stats: {}, npc: true };
    drawHero(ctx, pseudo, this, {});
  }

  // ─────────────────────────── 전투 이벤트 ───────────────────────────
  onPlayerHit(target, info, attack) {
    const p = this.player;
    if (target.kind === 'prop') return;
    this.combo.n++; this.combo.t = 2.6 + (this.hero.classId?.startsWith('lia_dancer') || this.hero.classId === 'lia_bladedancer' || this.hero.classId === 'lia_reaper' ? 1 : 0);
    if (this.combo.n > this.combo.max) this.combo.max = this.combo.n;
    this.run.hits++;
    const rank = styleRank(this.combo.n);
    this.addScore(10 * (1 + Math.floor(this.combo.n / 10)));
    this.run.sp = Math.min(100, this.run.sp + (info.crit ? 2.4 : 1.4) * (1 + (p.stats.ultGain ?? 0) / 100));
    if (p.stats.lifesteal > 0 && info.dmg > 0) p.heal(info.dmg * p.stats.lifesteal / 100, false);
    if (this.combo.n % 25 === 0) { audio.sfx('combo'); this.fx.text(p.cx, p.y - 40, `${this.combo.n} HIT!`, { color: rank.c, size: 26 }); bus.emit('combo', { count: this.combo.n }); }
  }
  endCombo() {
    const n = this.combo.n;
    if (n >= 10) {
      const bonus = n * n * 5;
      this.addScore(bonus);
      this.fx.text(this.player.cx, this.player.y - 50, `COMBO BONUS +${bonus}`, { color: '#ffe070', size: 18, life: 1.4, vy: -50 });
    }
    if (n > (this.state.stats.maxCombo ?? 0)) this.state.stats.maxCombo = n;
    this.combo.best = Math.max(this.combo.best, n);
    this.combo.n = 0;
  }
  addScore(n) {
    const s = Math.round(n * (this.diff.scoreMult ?? 1));
    this.run.score += s;
    if (this.run.score >= this.nextExtraLife) {
      this.nextExtraLife += 30000;
      this.run.lives++;
      audio.sfx('extra_life');
      this.game.toast('★ 1UP! 목숨이 늘었다 ★', '#ffe070');
    }
  }
  onEnemyKilled(e, attack) {
    this.run.kills++;
    this.state.stats.kills = (this.state.stats.kills ?? 0) + 1;
    this.state.bestiary[e.def.id] = (this.state.bestiary[e.def.id] ?? 0) + 1;
    const p = this.player;
    const expGain = Math.round(e.stats.exp * (1 + (p.stats.expBonus ?? 0) / 100));
    this.gainExp(expGain);
    this.addScore((e.def.score ?? 100) * (1 + this.combo.n / 20) * (e.elite ? 3 : 1));
    for (const d of rollEnemyLoot(this, e)) this.spawnPickup(d.type, e.cx, e.cy, d.data);
    if (this.hero.classId === 'lia_reaper') p.heal(p.stats.hp * 0.03, false);
    bus.emit('enemyKilled', { enemy: e, def: e.def, x: e.cx, y: e.cy, byPlayer: true });
  }
  gainExp(n) {
    if (n <= 0) return;
    const ups = addExp(this.hero, n);
    if (ups > 0) {
      const p = this.player;
      p.refreshStats();
      p.hp = p.stats.hp; p.mp = p.stats.mp;
      audio.sfx('levelup');
      this.fx.ring(p.cx, p.cy, { color: '#ffe070', r0: 10, r1: 120, life: 0.6, width: 6 });
      this.fx.burst('holy', p.cx, p.cy, 40, { speed: 260 });
      this.banner = { text: 'LEVEL UP!', sub: `Lv.${this.hero.level} — 스킬 포인트 획득`, t: 2.2, color: '#ffe070' };
    }
  }
  onPlayerHurt(dmg) {
    this.run.damageTaken += dmg;
    if (this.combo.n > 0) this.endCombo();
  }
  healPlayer(frac, mpToo = false) {
    const p = this.player;
    p.heal(p.stats.hp * frac);
    if (mpToo) p.mp = p.stats.mp;
  }

  // ─────────────────────────── 드롭/수집 ───────────────────────────
  dropFromCandle(x, y, big) {
    for (const d of rollCandleLoot(this, big)) this.spawnPickup(d.type, x, y, d.data);
  }
  openChest(chest) {
    if (chest.key) this.state.progress.secrets.push(chest.key);
    for (const d of rollChestLoot(this, chest.contents)) this.spawnPickup(d.type, chest.cx, chest.y, d.data);
  }
  collect(pk) {
    if (pk.dead) return;
    pk.dead = true;
    const p = this.player, d = pk.data, st = this.state;
    if (pk.secretKey) st.progress.secrets.push(pk.secretKey);
    switch (pk.type) {
      case 'heart': {
        const v = Math.round((d.value ?? 1) * (1 + (p.stats.heartBonus ?? 0) / 100));
        this.run.hearts = Math.min(99, this.run.hearts + v);
        audio.sfx('heart'); this.addScore(10 * v);
        break;
      }
      case 'gold': {
        const a = Math.round((d.amount ?? 1) * (1 + (p.stats.goldBonus ?? 0) / 100));
        st.gold += a; st.stats.goldEarned = (st.stats.goldEarned ?? 0) + a;
        audio.sfx('coin'); this.fx.text(pk.cx, pk.y, `+${a}G`, { color: '#ffd84a', size: 15, life: 0.7 });
        bus.emit('goldPicked', { amount: a });
        break;
      }
      case 'mp': p.mp = Math.min(p.stats.mp, p.mp + (d.amount ?? 15)); audio.sfx('heart', { pitch: 1.4 }); break;
      case 'food': {
        const got = p.heal(p.stats.hp * (d.heal ?? 0.25));
        audio.sfx('heal'); this.fx.burst('holy', p.cx, p.cy, 10, { color: '#7ee07e' });
        break;
      }
      case 'item': {
        const it = d.item;
        if (!it) break;
        const res = addItem(st, it);
        const name = itemName(it);
        if (res) { audio.sfx('item'); this.game.toast(`획득: ${name}${(it.qty ?? 1) > 1 ? ' ×' + it.qty : ''}`, ['#efe4cf', '#6fe07a', '#5aa8ff', '#c07cff', '#ffa640', '#ff4a5a'][it.rarity ?? 0]); }
        else this.game.toast('가방이 가득 찼다!', '#ff6060');
        const base = ITEMS[it.baseId];
        if (base?.relic && !st.progress.relics.includes(it.baseId)) {
          st.progress.relics.push(it.baseId);
          audio.sfx('secret');
          this.game.flash('#ff2040', 0.6, 2);
          this.banner = { text: '드라큘라의 유물', sub: `${base.name} (${st.progress.relics.length}/5)`, t: 3.5, color: '#ff4a5a', big: true };
          bus.emit('relicFound', { id: it.baseId });
        }
        break;
      }
      case 'doc': {
        if (d.docId) {
          if (!st.progress.docs.includes(d.docId)) { st.progress.docs.push(d.docId); st.stats.docs = (st.stats.docs ?? 0) + 1; }
          this.run.docsFound.push(d.docId);
          audio.sfx('secret');
          const doc = DOCS[d.docId];
          p.refreshStats();
          this.banner = { text: '비전서 발견!', sub: doc?.name ?? d.docId, t: 3, color: '#ffe7a0' };
          bus.emit('docFound', { docId: d.docId });
          this.game.push('document', { docId: d.docId });
        } else if (d.loreId) {
          if (!st.progress.lore.includes(d.loreId)) st.progress.lore.push(d.loreId);
          audio.sfx('item');
          this.game.push('document', { loreId: d.loreId });
        }
        break;
      }
      case 'sub': {
        const old = this.run.sub;
        this.run.sub = d.id; this.hero.sub = d.id;
        audio.sfx('item');
        this.game.toast(`보조무기: ${SUBWEAPONS[d.id]?.name ?? d.id}`, '#8ac8ff');
        if (old && old !== d.id && Math.random() < 0) this.spawnPickup('sub', pk.cx, pk.y - 20, { id: old });
        break;
      }
      case 'powerup': this.applyPowerup(d.id); break;
      case 'oneup': this.run.lives++; audio.sfx('extra_life'); this.game.toast('★ 1UP ★', '#ffe070'); break;
    }
  }
  applyPowerup(id) {
    const pu = POWERUPS[id];
    if (!pu) return;
    const p = this.player;
    audio.sfx('powerup');
    this.game.flash(pu.color, 0.35, 5);
    this.fx.ring(p.cx, p.cy, { color: pu.color, r0: 10, r1: 110, life: 0.5, width: 6 });
    this.fx.burst('magic', p.cx, p.cy, 24, { color: pu.color, speed: 200 });
    this.banner = { text: pu.name, sub: pu.desc, t: 2, color: pu.color };
    if (id === 'rosary') {
      this.game.flash('#ffffff', 1, 1.5);
      for (const e of this.enemies()) if (e.kind === 'enemy') { e.takeHit(99999, { dir: 1, kb: [0, -300] }, this, {}); }
      return;
    }
    if (id === 'heartrain') { for (let i = 0; i < 12; i++) this.spawnPickup('heart', p.cx + rand(-200, 200), p.y - 200 - rand(0, 100), { value: i % 4 === 0 ? 5 : 1, vy: 0, vx: 0 }); return; }
    if (id === 'goldrush') { for (let i = 0; i < 16; i++) this.spawnPickup('gold', p.cx + rand(-220, 220), p.y - 220 - rand(0, 100), { amount: randi(5, 20) * (this.stage.level ?? 1), vy: 0 }); return; }
    if (id === 'triple') delete p.buffs.double;
    p.buffs[id] = pu.time;
    p.refreshStats();
  }

  // ─────────────────────────── 지형 ───────────────────────────
  breakTilesIn(rect, attack) {
    const m = this.map;
    const l = Math.floor(rect.x / TILE), r = Math.floor((rect.x + rect.w) / TILE);
    const t = Math.floor(rect.y / TILE), b = Math.floor((rect.y + rect.h) / TILE);
    for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) {
      if (m.typeAt(tx, ty) !== T.BREAK) continue;
      const idx = m.idx(tx, ty);
      const kind = m.breakKind[idx];
      const key = `${this.stage.id}:${this.roomId}:${tx},${ty}`;
      m.set(tx, ty, T.EMPTY);
      this.tiles.invalidate(tx, ty);
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      audio.sfx('break_wall');
      this.camera.shake(4, 0.15);
      for (let i = 0; i < 6; i++) this.debrisList.push(new Debris(x + rand(-12, 12), y + rand(-12, 12), rand(-240, 240), rand(-420, -120), { size: randi(6, 12), color: '#5a5460', life: 2.2 }));
      this.fx.burst('dust', x, y, 10, { speed: 120 });
      if (this.state.progress.secrets.includes(key)) continue;
      this.state.progress.secrets.push(key);
      this.run.secrets++;
      if (kind === 'H') {
        const docs = this.stage.docs || [];
        const hs = m.markers.filter((mk) => mk.ch === 'H');
        const order = hs.findIndex((mk) => mk.tx === tx && mk.ty === ty);
        const docId = this.room.docs?.[order] ?? docs.find((dd) => !this.state.progress.docs.includes(dd));
        if (docId) { this.spawnPickup('doc', x, y, { docId, vy: -300, vx: 0 }); audio.sfx('secret'); this.game.toast('숨겨진 공간을 발견했다!', '#ffe7a0'); }
        else this.spawnPickup('food', x, y, { heal: 0.5, icon: 'meat', vy: -200 });
        bus.emit('secretFound', { stageId: this.stage.id, key });
      } else if (kind === 'K') {
        const c = new Chest(tx, ty, this.room.hiddenChest ?? null);
        c.y = (ty + 1) * TILE - c.h;
        this.add(c); audio.sfx('secret');
        this.game.toast('숨겨진 보물을 발견했다!', '#ffe7a0');
        bus.emit('secretFound', { stageId: this.stage.id, key });
      } else {
        // 'B': 벽 고기(클래식) 또는 골드
        if (chance(0.55)) this.spawnPickup('food', x, y, { heal: 0.4, icon: 'meat', vy: -250 });
        else this.spawnPickup('gold', x, y, { amount: randi(30, 80) * (this.stage.level ?? 1), vy: -250 });
        this.addScore(500);
      }
    }
    // 가짜 벽: 닿으면 드러남
  }
  spawnBones(e) {
    const bone = (ctx) => { ctx.fillStyle = '#e8dcc0'; ctx.fillRect(-7, -1.5, 14, 3); ctx.beginPath(); ctx.arc(-7, 0, 2.5, 0, TAU); ctx.arc(7, 0, 2.5, 0, TAU); ctx.fill(); };
    const skull = (ctx) => { ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a140a'; ctx.fillRect(-4, -2, 3, 3); ctx.fillRect(1, -2, 3, 3); };
    for (let i = 0; i < 7; i++) this.debrisList.push(new Debris(e.cx + rand(-10, 10), e.cy + rand(-20, 20), rand(-260, 260), rand(-560, -200), { size: 10, draw: i === 0 ? skull : bone, life: 2.5 }));
  }
  spawnDebris(e, color, n = 6) {
    for (let i = 0; i < n; i++) this.debrisList.push(new Debris(e.cx + rand(-10, 10), e.cy + rand(-20, 20), rand(-260, 260), rand(-560, -200), { size: randi(6, 12), color, life: 2.2 }));
  }

  // ─────────────────────────── 상호작용 ───────────────────────────
  useSavePoint(sp) {
    const p = this.player;
    p.hp = p.stats.hp; p.mp = p.stats.mp;
    this.run.checkpoint = { roomId: this.roomId, x: sp.x, y: sp.bottom - p.h };
    this.syncToState();
    this.state.lastStage = { stageId: this.stage.id, roomId: this.roomId };
    saves.write(this.state.slot, this.state);
    audio.sfx('save');
    this.game.flash('#ff2040', 0.4, 3);
    this.fx.burst('blood', sp.cx, sp.cy, 10, { speed: 60, color: '#ff3050' });
    this.game.toast('저장 완료 — 체력과 마력이 회복되었다', '#ffb0b0');
  }
  talkTo(npc) {
    bus.emit('npcTalk', { npcId: npc.npcId });
    this.game.push('dialogue', { npc: npc.npcId, world: this });
  }
  playScript(id, flagKey) {
    if (!id) return;
    if (!this.state.progress.seenScripts.includes(id)) this.state.progress.seenScripts.push(id);
    this.game.push('dialogue', { script: id, world: this });
  }

  /** 문 진입: 'scene:이름' 이면 장면을 띄우고, 아니면 방 이동 (마을 허브 등에서 사용) */
  enterDoor(target) {
    if (typeof target === 'string' && target.startsWith('scene:')) { this.game.push(target.slice(6), { world: this }); return; }
    this.gotoRoom(target);
  }
  gotoRoom(roomId) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.syncRun();
    this.game.fadeOut(() => {
      this.loadRoom(roomId);
      this.transitioning = false;
    }, 0.22);
  }
  syncRun() { this.run.hp = this.player.hp; this.run.mp = this.player.mp; }
  /** 런 상태를 세이브에 반영 (점수/목숨/보조무기) */
  syncToState() {
    this.state.score = this.run.score;
    this.state.lives = this.run.lives;
    this.hero.sub = this.run.sub;
  }

  // ─────────────────────────── 사망/재시작 ───────────────────────────
  onPlayerFell(p) {
    if (p.dead || this.transitioning) return;
    const dmg = Math.ceil(p.stats.hp * 0.25);
    p.hp -= dmg;
    this.run.damageTaken += dmg;
    audio.sfx('hurt');
    if (p.hp <= 0) { p.hp = 0; p.y = this.map.pxH + 40; p.die(this); p.vy = 0; return; }
    // 가까운 안전 지점으로 복귀
    const cp = this.run.checkpoint;
    p.x = cp.x; p.y = cp.y; p.vx = 0; p.vy = 0; p.iframes = 1.5;
    this.game.flash('#000', 0.6, 3);
  }
  onPlayerDeath() {
    this.run.lives--;
    this.state.stats.deaths = (this.state.stats.deaths ?? 0) + 1;
    if (this.run.lives > 0) {
      this.game.fadeOut(() => this.respawn(), 0.5);
    } else {
      this.syncToState();
      this.game.push('gameover', { world: this });
    }
  }
  respawn(full = false) {
    const p = this.player;
    const cp = this.run.checkpoint;
    if (cp.roomId !== this.roomId) this.loadRoom(cp.roomId);
    p.dead = false; p.deathHandled = false; p.hp = p.stats.hp; p.mp = p.stats.mp;
    p.x = cp.x; p.y = cp.y; p.vx = 0; p.vy = 0; p.iframes = 2.5;
    p.buffs = {}; p.refreshStats();
    this.run.hearts = Math.max(this.run.hearts, 10);
    if (full) this.run.lives = this.diff.lives;
    if (this.boss && !this.boss.dead) { this.boss.hp = this.boss.stats.maxHp; }
    this.combo.n = 0;
    this.banner = { text: 'READY?', sub: `남은 목숨 ${this.run.lives}`, t: 1.6, color: '#ffe7a0' };
  }

  // ─────────────────────────── 보스 ───────────────────────────
  startBoss() {
    this.bossActive = true;
    const m = this.map;
    const x0 = this.arenaX, x1 = m.pxW;
    this.arena = { x0, x1, cam: { x: x0, y: 0, w: x1 - x0, h: m.pxH } };
    const id = this.room.bossId ?? this.stage.boss;
    const bx = x0 + (x1 - x0) * 0.72;
    const by = (m.h - 2) * TILE;
    this.boss = createBoss(this, id, bx, by);
    this.add(this.boss);
    audio.stopMusic(0.5);
    this.cutscene = true;
    const intro = () => {
      this.cutscene = true;
      audio.sfx('warning');
      this.game.push('bossIntro', { bossId: id, world: this, onDone: () => { this.cutscene = false; audio.music(this.boss?.def?.music ?? 'boss'); } });
    };
    const preId = `${id}_pre`;
    if (SCRIPTS[preId] && !this.state.progress.seenScripts.includes(preId) && this.mode === 'story') {
      this.state.progress.seenScripts.push(preId);
      this.game.push('dialogue', { script: preId, world: this, onEnd: intro });
    } else intro();
  }
  onBossDefeated(boss) {
    if (this.cleared) return;
    this.cleared = true; this.clearT = 0;
    this.slowmo = 1.6;
    this.game.flash('#ffffff', 1, 1.2);
    this.camera.shake(16, 1.2);
    audio.stopMusic(0.3);
    audio.sfx('boss_die');
    const st = this.state;
    if (!st.progress.bosses.includes(boss.def.id)) st.progress.bosses.push(boss.def.id);
    st.progress.flags['boss_' + boss.def.id] = true;
    st.stats.bossKills = (st.stats.bossKills ?? 0) + 1;
    this.gainExp(Math.round((boss.stats.exp ?? 500) * (1 + (this.player.stats.expBonus ?? 0) / 100)));
    this.addScore((boss.def.score ?? 20000));
    for (const d of rollBossLoot(this, boss)) this.spawnPickup(d.type, boss.cx + rand(-40, 40), boss.cy, d.data);
    for (let i = 0; i < 20; i++) setTimeout(() => this.fx.burst('fire', boss.cx + rand(-80, 80), boss.cy + rand(-80, 80), 8, { speed: 200 }), i * 60);
    bus.emit('bossKilled', { bossId: boss.def.id, stageId: this.stage.id, time: this.run.time });
    this.banner = { text: 'STAGE CLEAR', sub: boss.def.name + ' 격파!', t: 4, color: '#ffe070', big: true };
  }
  finishStage() {
    this.syncRun(); this.syncToState();
    audio.music('victory');
    this.game.go('results', { world: this });
  }
  startUltimate(p) {
    this.game.push('ultCutin', { charId: p.hero.charId, world: this });
  }
}
