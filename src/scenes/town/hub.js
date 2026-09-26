// 마을 허브 장면: 걸어 다닐 수 있는 밤의 마을 「에슈빌」.
// World 엔진(mode:'town')을 그대로 쓰고, 건물 파사드·NPC 배회·문 안내·허브 HUD·허브 메뉴를 얹는다. 전투 없음.
import { Scene, TILE } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { Entity } from '../../game/entity.js';
import { text, panel, button, bar, ListMenu, FONT, COLORS, vignette } from '../../core/ui.js';
import { TAU, clamp, rand, fmt, ease } from '../../core/math.js';
import { World } from '../../game/world.js';
import { newGameState, currentHero } from '../../game/state.js';
import { expToNext } from '../../game/stats.js';
import { drawHero } from '../../render/hero.js';
import { drawIcon } from '../../render/icons.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES } from '../../data/classes.js';
import { NPCS } from '../../data/npcs.js';
import { SCRIPTS, resolveNpcScript } from '../../data/story.js';
import * as QuestRt from '../../game/quests.js';
import { TOWN_STAGE, BUILDINGS, TOWN_NPCS, TOWN_PROPS, TOWN_TALK, eliseInTown } from '../../data/town.js';
import { FLOOR, drawFacades, facadeLights, prebakeFacades, setFacadeScale, anvilPos, glow } from './facades.js';

const RELIC_IDS = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'];

/** 광원만 등록하는 보이지 않는 엔티티 */
class TownAmbience extends Entity {
  constructor() { super(0, 0, 1, 1); this.kind = 'decor'; this.z = -9; }
  lights(L) { const w = this.world; if (w) facadeLights(L, w.camera, w.time); }
}

export class HubScene extends Scene {
  enter(params = {}) {
    const g = this.game;
    if (!g.state) g.state = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
    this.from = params.from ?? null;
    this.menuOpen = false; this.menu = null;
    this.hint = null; this.anvilT = 1.2;
    this.boardInfo = { boardNew: false, boardClaim: false };
    setFacadeScale(Math.max(1, g.scale || 1));
    prebakeFacades();
    this.buildWorld(this.from ? 'gate' : null);
    this.banner = { t: 0, text: '에슈빌', sub: this.from ? '무사히 돌아왔다 — 잠시 숨을 고르자' : '어둠 속에 등불이 남은 마지막 마을' };
    audio.music('hub');
    assets.preload(['bg/worldmap', 'bg/shop', 'bg/smith', 'portraits/npc_rook', 'portraits/npc_hadwin', 'portraits/npc_alberto']);
    this.refreshBoard();
    if (g.settings?.autoSave) { try { saves.write(g.state.slot ?? 1, g.state); } catch (e) { /* 저장 실패 무시 */ } }
  }

  /** World 생성 + 마을 전용 패치. spawn: 'gate' 면 동쪽 성문 앞, 숫자면 해당 x */
  buildWorld(spawn = null, facing = null) {
    const g = this.game;
    const w = new World(g, TOWN_STAGE, { mode: 'town' });
    this.world = w; g.world = w;
    w.banner = null;
    w.run.lives = g.state.lives ?? w.run.lives;
    // 중경 레이어에 건물 파사드
    const midOrig = w.bg.drawMid;
    w.bg.drawMid = (ctx, cam, t) => { midOrig(ctx, cam, t); drawFacades(ctx, cam, t, this.boardInfo); };
    // 소품 배치 (무작위 대신 설계된 위치)
    w.tiles.props = TOWN_PROPS.map((p) => ({ d: { id: p.id, w: p.w, h: p.h }, x: p.fx - p.w / 2, y: FLOOR - p.h + (p.dy ?? 0) + 4 }));
    w.add(new TownAmbience());
    // 문: 건물과 맞물리도록 폭 조정 + 그리기 교체 + 장면 진입 가드
    for (const e of w.entities) {
      if (e.kind === 'prop' && e.target !== undefined && e.constructor.name === 'Door') this.setupDoor(e);
      if (e.kind === 'npc') this.setupNpc(e);
    }
    if (!eliseInTown(g.state)) for (const e of w.entities) if (e.npcId === 'npc_elise') e.dead = true;
    w.entities = w.entities.filter((e) => !e.dead);
    w.enterDoor = (target) => this.enterTarget(target);
    w.drawNPC = (ctx, npc) => this.drawNpc(ctx, npc, w);
    // 시작 위치
    const p = w.player;
    if (spawn === 'gate') { const gb = BUILDINGS.find((b) => b.kind === 'gate'); p.x = gb.door * TILE - 60; p.facing = -1; }
    else if (typeof spawn === 'number') { p.x = spawn; if (facing) p.facing = facing; }
    p.y = FLOOR - p.h;
    w.camera.follow(p, 1 / 60, true);
  }

  setupDoor(d) {
    const b = BUILDINGS.find((k) => k.door !== undefined && d.x === k.door * TILE);
    d.building = b;
    const cx = d.cx;
    const wid = b?.kind === 'gate' ? 150 : b?.kind === 'church' ? 80 : b?.kind === 'board' ? 180 : 56;
    d.x = cx - wid / 2; d.w = wid;
    d.z = 20;
    d.draw = (ctx, world) => {
      if (!d.near) return;
      const t = world.time;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, d.cx, FLOOR - 40, 70, '#ffb45a', 0.35 + Math.sin(t * 5) * 0.08);
      ctx.globalCompositeOperation = 'source-over';
      const ly = FLOOR - (b?.kind === 'board' ? 222 : b?.kind === 'church' ? 214 : b?.kind === 'gate' ? 226 : 138) - Math.abs(Math.sin(t * 3)) * 4;
      const name = b?.name ?? '';
      ctx.font = `800 15px ${FONT.title}`;
      const tw = Math.max(ctx.measureText(name).width, 80) + 36;
      panel(ctx, d.cx - tw / 2, ly - 40, tw, 46, { corner: false, glow: 'rgba(232,200,114,0.35)' });
      text(ctx, name, d.cx, ly - 18, { size: 15, weight: 800, family: FONT.title, color: '#f3d690', align: 'center' });
      text(ctx, input.touchMode ? '▲ 들어가기' : '▲ 들어가기', d.cx, ly, { size: 12, weight: 700, color: '#ffe7a0', align: 'center' });
      ctx.restore();
    };
  }

  setupNpc(n) {
    const spec = TOWN_NPCS[n.npcId] || {};
    n.home = n.x; n.range = spec.range ?? 0; n.speed = spec.speed ?? 0; n.idleR = spec.idle ?? [2, 4];
    n.wait = rand(0.5, 2); n.moving = false; n.tx = n.x; n.vx = 0; n.z = 5;
    n.facing = n.npcId === 'npc_hadwin' ? -1 : (Math.random() < 0.5 ? -1 : 1);
    n.update = (dt, w) => {
      n.t += dt;
      const p = w.player;
      n.near = !!p && Math.abs(p.cx - n.cx) < 62 && Math.abs(p.bottom - n.bottom) < 40;
      if (n.near || w.cutscene) {
        n.vx = 0; n.moving = false;
        if (p && n.near) n.facing = Math.sign(p.cx - n.cx) || n.facing;
      } else if (n.range > 0) {
        if (n.moving) {
          const dx = n.tx - n.x;
          if (Math.abs(dx) < 2) { n.moving = false; n.vx = 0; n.wait = rand(n.idleR[0], n.idleR[1]); }
          else { n.vx = Math.sign(dx) * n.speed; n.x += n.vx * dt; n.facing = Math.sign(dx); }
        } else if ((n.wait -= dt) <= 0) {
          n.tx = clamp(n.home + rand(-n.range, n.range), n.home - n.range, n.home + n.range);
          n.moving = Math.abs(n.tx - n.x) > 8;
          if (!n.moving) n.wait = rand(1, 2);
        }
      } else if (n.npcId === 'npc_hadwin') n.facing = -1;
      if (n.near && !w.cutscene && !this.menuOpen && input.pressed('up')) this.talk(n);
    };
    n.draw = (ctx, world) => {
      world.drawNPC(ctx, n);
      if (n.near) {
        const nm = NPCS[n.npcId]?.name ?? spec.name ?? '';
        const y = n.y - 30 - Math.abs(Math.sin(world.time * 3)) * 3;
        text(ctx, nm, n.cx, y - 14, { size: 14, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 3 });
        text(ctx, '▲ 대화', n.cx, y + 2, { size: 12, weight: 700, color: '#ffe7a0', align: 'center', ow: 3 });
      }
    };
    n.lights = (L) => L.add(n.cx, n.cy, 110, '#ffd9a0', 0.55);
  }

  drawNpc(ctx, npc, world) {
    const spec = TOWN_NPCS[npc.npcId] || {};
    const look = NPCS[npc.npcId]?.look ?? spec.look;
    const moving = npc.moving && Math.abs(npc.vx) > 1;
    const pseudo = npc._pseudo ??= { rig: {}, ch: { move: { speed: 275 } }, stats: {}, npc: true, onGround: true, vy: 0 };
    pseudo.x = npc.x; pseudo.y = npc.y; pseudo.w = npc.w; pseudo.h = npc.h;
    pseudo.cx = npc.cx; pseudo.bottom = npc.bottom; pseudo.facing = npc.facing;
    pseudo.anim = moving ? 'run' : 'idle'; pseudo.animT = npc.t; pseudo.t = npc.t + npc.home * 0.01;
    pseudo.vx = moving ? npc.vx * 1.6 : 0; pseudo.look = look;
    // 발밑 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(npc.cx, npc.bottom - 1, 18, 4, 0, 0, TAU); ctx.fill();
    drawHero(ctx, pseudo, world, {});
  }

  talk(n) {
    const g = this.game;
    audio.sfx('menu_ok');
    const sid = resolveNpcScript(n.npcId, g.state);
    if (SCRIPTS[sid]) this.world.talkTo(n);
    else g.push('dialogue', { lines: TOWN_TALK[n.npcId] ?? [{ who: n.npcId, text: '……' }], world: this.world });
  }

  enterTarget(target) {
    const g = this.game, w = this.world;
    if (typeof target !== 'string') return;
    if (!target.startsWith('scene:')) { w.gotoRoom(target); return; }
    const name = target.slice(6);
    if (!g.registry[name]) {
      audio.sfx('menu_cancel');
      g.toast(name === 'inn' ? '흑묘 여관은 아직 문을 열 준비 중이다…' : '지금은 들어갈 수 없다.', '#c8b8a0');
      return;
    }
    w.syncRun?.();
    g.push(name, { world: w, from: 'hub' });
  }

  onResume() {
    const g = this.game, w = this.world;
    g.world = w;
    this.refreshBoard();
    // 동료 교체 → 월드 재구성
    if (w.hero !== currentHero(g.state)) {
      const px = w.player.x, f = w.player.facing;
      this.buildWorld(px, f);
      audio.sfx('powerup');
      this.world.fx.burst('magic', this.world.player.cx, this.world.player.cy, 30, { color: '#e8c872', speed: 200 });
      this.world.fx.ring(this.world.player.cx, this.world.player.cy, { color: '#e8c872', r0: 10, r1: 90, life: 0.5, width: 5 });
      return;
    }
    w.player?.refreshStats();
    if (w.player) { w.player.hp = w.player.stats.hp; w.player.mp = w.player.stats.mp; }
  }

  refreshBoard() {
    const st = this.game.state;
    try {
      const av = QuestRt.availableQuests(st) || [];
      const act = Object.keys(st.quests?.active || {});
      this.boardInfo.boardNew = av.length > 0;
      this.boardInfo.boardClaim = act.some((q) => QuestRt.canClaim(st, q));
    } catch (e) { this.boardInfo.boardNew = false; this.boardInfo.boardClaim = false; }
  }

  exit() { if (this.game.world === this.world) this.game.world = null; }
  resize() { this.world?.camera.setView(this.game.viewW, this.game.viewH); }

  // ───────────────────────── 업데이트 ─────────────────────────
  update(dt) {
    const g = this.game, w = this.world;
    this.banner.t += dt;
    g.state.stats.playTime = (g.state.stats.playTime ?? 0) + dt;
    if (this.menuOpen) { this.updateMenu(dt); return; }
    if (input.pressed('menu') && !w.cutscene) { this.openMenu(); return; }
    if (this.tapHud()) return;
    w.update(dt);
    const p = w.player;
    if (p) { p.hp = p.stats.hp; if (p.y > FLOOR + 200) { p.x = 29 * TILE; p.y = FLOOR - p.h; p.vy = 0; } }
    // 상호작용 대상
    this.hint = null;
    for (const e of w.entities) {
      if (e.near && (e.kind === 'npc' || e.building)) { this.hint = e; break; }
    }
    // 대장간 망치질 불꽃 (분위기)
    this.anvilT -= dt;
    if (this.anvilT <= 0) {
      this.anvilT = rand(1.3, 2.1);
      const a = anvilPos();
      const had = w.entities.find((e) => e.npcId === 'npc_hadwin');
      if (a && had && !had.near && Math.abs(p.cx - a.x) < w.camera.vw) {
        w.fx.burst('spark', a.x + 6, a.y, 12, { speed: 240, color: '#ffc870' });
        w.fx.flash(a.x + 6, a.y, { color: '#ffb060', size: 40, life: 0.08 });
        const d = Math.abs(p.cx - a.x);
        if (d < 520) audio.sfx('enhance_hit', { vol: 0.25 * (1 - d / 520), pitch: rand(0.9, 1.1) });
      }
    }
  }

  tapHud() {
    if (!input.pointer.tapped) return false;
    const r = this.hudRects;
    if (!r) return false;
    const inR = (q) => q && input.pointer.x >= q.x && input.pointer.x <= q.x + q.w && input.pointer.y >= q.y && input.pointer.y <= q.y + q.h;
    if (inR(r.menu)) { this.openMenu(); return true; }
    if (inR(r.party)) { this.openParty(); return true; }
    if (inR(r.act) && this.hint) {
      const h = this.hint;
      if (h.kind === 'npc') this.talk(h);
      else { audio.sfx('door'); this.enterTarget(h.target); }
      return true;
    }
    return false;
  }

  openParty() {
    const g = this.game;
    if (!g.registry.party) return;
    audio.sfx('menu_ok');
    g.push('party', { world: this.world, from: 'hub' });
  }
  openMenu() {
    audio.sfx('menu_ok');
    const g = this.game;
    const items = [
      ['계속하기', '', () => this.closeMenu()],
      ['메뉴', '장비 · 스킬 · 가방', () => { this.closeMenu(); if (g.registry.menu) g.push('menu', { world: this.world, from: 'hub' }); else g.toast('메뉴를 준비 중입니다.', '#c8b8a0'); }],
      ['동료', '함께할 헌터 교체', () => { this.closeMenu(); this.openParty(); }],
      ['저장', `슬롯 ${g.state.slot ?? 1}에 기록`, () => this.doSave()],
    ];
    if (g.registry.options) items.push(['설정', '소리 · 화질 · 조작', () => { this.closeMenu(); g.push('options', {}); }]);
    items.push(['타이틀로', '저장하지 않은 진행은 사라진다', () => { this.closeMenu(); g.go('title', {}); }]);
    this.menuItems = items;
    this.menu = new ListMenu(items.length);
    this.menuOpen = true; this.menuT = 0;
  }
  closeMenu() { this.menuOpen = false; input.flush(); }
  doSave() {
    const g = this.game;
    const ok = saves.write(g.state.slot ?? 1, g.state);
    audio.sfx('save');
    g.flash('#ff2040', 0.25, 3);
    g.toast(ok !== false ? '여정을 기록했다.' : '저장 공간에 접근할 수 없어 임시로 보관했다.', '#ffb0b0');
    this.closeMenu();
  }
  updateMenu(dt) {
    this.menuT += dt;
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') { audio.sfx('menu_ok'); this.menuItems[this.menu.index][2](); }
    else if (r === 'cancel' || input.pressed('menu')) { audio.sfx('menu_cancel'); this.closeMenu(); }
  }

  // ───────────────────────── 렌더 ─────────────────────────
  render(ctx) {
    const w = this.world, vw = this.game.viewW, vh = this.game.viewH;
    w.render(ctx);
    this.drawHUD(ctx, vw, vh);
    this.drawBanner(ctx, vw, vh);
    if (this.menuOpen) this.drawMenu(ctx, vw, vh);
  }

  drawHUD(ctx, vw, vh) {
    const g = this.game, st = g.state, hero = currentHero(st), ch = CHARACTERS[hero.charId];
    this.hudRects = {};
    // ── 좌상단: 초상화 + 이름/직업/레벨/경험치 ──
    const px = 14, py = 12;
    ctx.save();
    ctx.beginPath(); ctx.arc(px + 32, py + 32, 30, 0, TAU); ctx.closePath();
    ctx.fillStyle = '#12060c'; ctx.fill(); ctx.clip();
    const img = assets.get(ch.portrait);
    if (img) ctx.drawImage(img, px + 32 - 44, py + 2, 88, 88 * (img.height / img.width));
    ctx.restore();
    ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px + 32, py + 32, 31, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#5a0a18'; ctx.beginPath(); ctx.arc(px + 56, py + 56, 12, 0, TAU); ctx.fill();
    ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 1.5; ctx.stroke();
    text(ctx, hero.level, px + 56, py + 61, { size: 12, align: 'center', weight: 800, family: FONT.num, color: '#fff' });
    const bx = px + 76, bw = 210;
    ctx.fillStyle = 'rgba(8,4,10,0.55)'; ctx.fillRect(bx - 6, py + 2, bw + 12, 52);
    text(ctx, ch.name, bx, py + 18, { size: 15, weight: 800, family: FONT.title, color: '#f3e2b8' });
    text(ctx, CLASSES[hero.classId]?.name ?? ch.title, bx + bw, py + 18, { size: 12, align: 'right', color: '#c8b8a0', weight: 700 });
    const need = expToNext(hero.level);
    bar(ctx, bx, py + 28, bw, 7, hero.exp / need, { color: '#e8c872' });
    text(ctx, `EXP ${fmt(hero.exp)} / ${fmt(need)}`, bx, py + 49, { size: 11, color: '#bca88a', weight: 700 });
    if ((hero.sp ?? 0) > 0) text(ctx, `SP ${hero.sp}`, bx + bw, py + 49, { size: 11, align: 'right', color: '#8ae0ff', weight: 800, family: FONT.num });

    // ── 우상단: 골드 · 유물 · 버튼 ──
    const gw = 190, gx = vw - gw - 14, gy = 12;
    panel(ctx, gx, gy, gw, 40, { corner: false });
    drawIcon(ctx, 'coin', gx + 22, gy + 20, 24);
    text(ctx, fmt(st.gold ?? 0), gx + gw - 14, gy + 27, { size: 19, weight: 900, family: FONT.num, color: '#ffd84a', align: 'right' });
    text(ctx, 'G', gx + 40, gy + 26, { size: 12, weight: 800, family: FONT.num, color: '#b89a50' });
    // 유물 5칸
    const rel = st.progress?.relics ?? [];
    for (let i = 0; i < 5; i++) {
      const rx = gx + 24 + i * 34, ry = gy + 58;
      const has = rel.includes(RELIC_IDS[i]);
      ctx.fillStyle = has ? 'rgba(120,10,24,0.8)' : 'rgba(10,4,10,0.6)';
      ctx.beginPath(); ctx.arc(rx, ry, 12, 0, TAU); ctx.fill();
      ctx.strokeStyle = has ? '#ff6a7a' : '#4a3a30'; ctx.lineWidth = 1.5; ctx.stroke();
      if (has) drawIcon(ctx, 'relic_' + (i + 1), rx, ry, 22);
      else text(ctx, '?', rx, ry + 5, { size: 12, weight: 800, color: '#4a3a30', align: 'center', ow: 0 });
    }
    const bwd = 88, bh = 40, by = gy + 80;
    const rParty = { x: vw - 14 - bwd * 2 - 8, y: by, w: bwd, h: bh }, rMenu = { x: vw - 14 - bwd, y: by, w: bwd, h: bh };
    if (g.registry.party) { button(ctx, rParty, '동료', { size: 15 }); this.hudRects.party = rParty; }
    button(ctx, rMenu, '메뉴', { size: 15 }); this.hudRects.menu = rMenu;

    // ── 하단: 상호작용 안내 ──
    const h = this.hint;
    if (h && !this.world.cutscene) {
      const label = h.kind === 'npc' ? `대화 · ${NPCS[h.npcId]?.name ?? TOWN_NPCS[h.npcId]?.name ?? ''}` : `들어가기 · ${h.building?.name ?? ''}`;
      const sub = h.kind === 'npc' ? (NPCS[h.npcId]?.title ?? TOWN_NPCS[h.npcId]?.title ?? '') : (h.building?.desc ?? '');
      const aw = 300, ah = 54, ax = vw / 2 - aw / 2, ay = vh - ah - (input.touchMode ? 24 : 34);
      const rA = { x: ax, y: ay, w: aw, h: ah };
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      ctx.save();
      ctx.shadowColor = `rgba(232,200,114,${0.3 + pulse * 0.3})`; ctx.shadowBlur = 16;
      button(ctx, rA, '▲  ' + label, { size: 16, sub, selected: true });
      ctx.restore();
      this.hudRects.act = rA;
    }
    if (!input.touchMode) text(ctx, '←→ 이동   Z 점프   C 대시   ▲ 들어가기·대화   Esc 메뉴', vw / 2, vh - 10, { size: 12, align: 'center', color: 'rgba(200,184,160,0.8)', ow: 2 });
  }

  drawBanner(ctx, vw, vh) {
    const b = this.banner;
    if (!b || b.t > 3.6) return;
    const a = Math.min(1, b.t * 2.5, (3.6 - b.t) * 2);
    const k = ease.outCubic(Math.min(1, b.t * 1.6));
    ctx.save();
    ctx.globalAlpha = a;
    const y = vh * 0.3;
    const g = ctx.createLinearGradient(0, y - 60, 0, y + 40);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(6,2,10,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 60, vw, 100);
    ctx.strokeStyle = 'rgba(232,200,114,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(vw / 2 - 220 * k, y + 14); ctx.lineTo(vw / 2 + 220 * k, y + 14); ctx.stroke();
    text(ctx, b.text, vw / 2, y, { size: 44, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 5 });
    text(ctx, b.sub, vw / 2, y + 38, { size: 15, weight: 600, color: '#d8c8b0', align: 'center', ow: 3 });
    ctx.restore();
  }

  drawMenu(ctx, vw, vh) {
    const a = Math.min(1, this.menuT * 6);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(4,2,8,0.72)'; ctx.fillRect(0, 0, vw, vh);
    vignette(ctx, vw, vh, 0.6);
    const n = this.menuItems.length, bw = 360, bh = 50, gap = 10;
    const tot = n * bh + (n - 1) * gap;
    const y0 = Math.max(96, vh / 2 - tot / 2 + 24);
    text(ctx, '에슈빌', vw / 2, y0 - 44, { size: 34, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 4 });
    text(ctx, 'VILLAGE MENU', vw / 2, y0 - 20, { size: 12, weight: 800, family: FONT.num, color: '#9d8f80', align: 'center' });
    this.menuItems.forEach(([label, sub], i) => {
      const r = { x: vw / 2 - bw / 2, y: y0 + i * (bh + gap), w: bw, h: bh };
      this.menu.hit(i, r);
      button(ctx, r, label, { selected: this.menu.index === i, sub: sub || undefined, size: 17 });
    });
    ctx.restore();
  }
}
