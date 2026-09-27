// 마을 허브 장면: 걸어 다닐 수 있는 밤의 마을 「에슈빌」.
// World 엔진(mode:'town')을 그대로 쓰고, 건물 파사드·NPC 배회·문 안내·허브 HUD·허브 메뉴를 얹는다. 전투 없음.
// owner: PLAT-TOWN (platform §5.1/§6.2/§6.3 WP-7, companions §12.3, world2 §10)
//  - 가상 패드: scene 플래그만 쓴다 (game.syncPad 가 유일한 주인). padHideButtons = 전투 버튼(수호 포함), 마을 메뉴가 열리면 hidePad.
//  - 빠른 메뉴: 'map' (Tab·M·I / 패드 SELECT / 터치 가방) → 메뉴의 인벤토리 탭.
//  - 동료: enter()/onResume() 끝에서 companionHubEnter (마구간 개장·합류 연출), refreshBoard 에서 boardInfo.stableNote.
//  - HUD·마을 메뉴는 휴대폰에서 game.uiK 배로 키워 그리고, 버튼은 ui.taps 에 논리 px 로 등록한다 (터치 여유 · 스틱 통과).
//  - 2부(p2_started) 동안 하늘에 은빛 균열 (world2 §10, 선택): 2부를 마치면 옅은 흉터, 진엔딩 뒤에는 없음.
import { Scene, TILE } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { Entity } from '../../game/entity.js';
import { text, font, bar, ListMenu, FONT, COLORS, vignette, taps } from '../../core/ui.js';
import { drawGlyph, glyphWidth } from '../../core/prompts.js';
import { TAU, clamp, rand, fmt, ease, RNG, hashStr } from '../../core/math.js';
import { World } from '../../game/world.js';
import { newGameState, currentHero } from '../../game/state.js';
import { expToNext, MAX_LEVEL } from '../../game/stats.js';
import { drawHero } from '../../render/hero.js';
import { drawIcon } from '../../render/icons.js';
import { hudLayout } from '../../render/hud_layout.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES } from '../../data/classes.js';
import { ITEMS } from '../../data/items.js';
import * as NpcData from '../../data/npcs.js';
import { SCRIPTS, resolveNpcScript } from '../../data/story.js';
import * as QuestRt from '../../game/quests.js';
import * as CMP from '../../game/companions.js';   // [hook:cmp] companionHubEnter · companionHubNote (CMP-SYS)
import { TOWN_STAGE, BUILDINGS, TOWN_NPCS, TOWN_PROPS, TOWN_TALK, eliseInTown } from '../../data/town.js';
import { FLOOR, drawFacades, facadeLights, prebakeFacades, setFacadeScale, anvilPos, glow } from './facades.js';
import { uiPanel, uiButton, uiHints } from './common.js';

const RELIC_IDS = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'];
const HEART_IDS = ['k_heart_1', 'k_heart_2', 'k_heart_3', 'k_heart_4', 'k_heart_5', 'k_heart_6'];
// 처음 도착(프롤로그 직후) · 이어하기 · 2부 서막 직후 — '돌아왔다' 가 아니라 환영 문구, 마을 한가운데에서 시작
const ARRIVE_FROM = new Set(['prologue', 'load', 'title', 'new', 'p2']);
// 마을은 전투 없음: 이 입력들은 World 에 넘기지 않는다 (하트·MP 소모 방지). 수호신 스킬(guard)·각성기(awaken)도 마을에서는 쓰지 않는다
const NO_COMBAT = ['attack', 'sub', 'skill1', 'skill2', 'ult', 'swap', 'guard', 'awaken'];   // [hook:cmp] guard
// 가상 패드에서 숨길 버튼 (scene 플래그 padHideButtons — 스틱·점프·대시·탑승·일시정지·가방만 남긴다). 같은 배열을 계속 넘긴다
const PAD_HIDE = Object.freeze(NO_COMBAT.filter((a) => a !== 'awaken'));

/** 광원만 등록하는 보이지 않는 엔티티 */
class TownAmbience extends Entity {
  constructor() { super(0, 0, 1, 1); this.kind = 'decor'; this.z = -9; }
  lights(L) { const w = this.world; if (w) facadeLights(L, w.camera, w.time); }
}

export class HubScene extends Scene {
  constructor(g) { super(g); this.padHideButtons = PAD_HIDE; this.hidePad = false; }
  /** 도착 배너(에슈빌)가 떠 있는 동안에는 밀린 알림을 잠시 보류한다 */
  get deferToasts() { return !!this.banner && this.banner.t < 3.6; }
  enter(params = {}) {
    const g = this.game;
    if (!g.state) g.state = newGameState({ slot: 1, difficulty: 'normal', charId: 'kael' });
    this.from = params.from ?? null;
    this.menuOpen = false; this.menu = null; this.hidePad = false;
    this.hint = null; this.anvilT = 1.2;
    this.boardInfo = { boardNew: false, boardClaim: false, stableNote: null };
    // 파사드 굽기 배율: 실제 품질 등급(설정 'auto' 면 품질 조절기가 정한 game.tier)이 낮음이면 1배
    const tier = g.tier ?? g.quality ?? g.settings?.quality;
    setFacadeScale(tier === 'low' ? 1 : Math.max(1, g.scale || 1));
    prebakeFacades();
    // 스테이지·엔딩에서 돌아옴 → 동쪽 성문 앞 / 여관에서 나옴 → 여관 앞 / 첫 도착·이어하기·2부 서막 → 마을 한가운데
    const back = !!this.from && !ARRIVE_FROM.has(this.from) && this.from !== 'inn';
    this.buildWorld(back ? 'gate' : this.from === 'inn' ? 'inn' : null);
    const sub = this.from === 'p2' ? '갈라진 하늘 아래, 여섯 세계로 가는 문이 열렸다'
      : back ? '무사히 돌아왔다 — 잠시 숨을 고르자' : '어둠 속에 등불이 남은 마지막 마을';
    this.banner = { t: 0, text: '에슈빌', sub };
    audio.music('hub');
    assets.preload(['bg/worldmap', 'bg/shop', 'bg/smith', 'portraits/npc_rook', 'portraits/npc_hadwin', 'portraits/npc_alberto']);
    this.refreshBoard();
    if (g.settings?.autoSave) { try { saves.write(g.state.slot ?? 1, g.state); } catch (e) { /* 저장 실패 무시 */ } }
    CMP.companionHubEnter?.(g, this);   // [hook:cmp] 마구간 개장 · 2번 칸 안내 · 합류 연출 (다른 장면이 위에 있으면 다음 onResume 에)
  }

  /** World 생성 + 마을 전용 패치. spawn: 'gate' 면 동쪽 성문 앞, 'inn' 이면 여관 문 앞, 숫자면 해당 x */
  buildWorld(spawn = null, facing = null) {
    const g = this.game;
    const w = new World(g, TOWN_STAGE, { mode: 'town' });
    this.world = w; g.world = w;
    w.banner = null;
    w.run.lives = g.state.lives ?? w.run.lives;
    // 원경 위에 하늘 균열 (2부), 중경 레이어에 건물 파사드
    const farOrig = w.bg.drawFar;
    w.bg.drawFar = (ctx, cam, vw, vh, t) => { farOrig(ctx, cam, vw, vh, t); this.drawSkyCrack(ctx, cam, vw, vh, t); };   // [hook:p2]
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
    for (const e of w.entities) {
      if (e.kind !== 'npc') continue;
      let vis = true;
      try { vis = NpcData.npcVisible ? NpcData.npcVisible(e.npcId, g.state) : (e.npcId !== 'npc_elise' || eliseInTown(g.state)); } catch { vis = true; }
      if (!vis) e.dead = true;
    }
    w.entities = w.entities.filter((e) => !e.dead);
    w.enterDoor = (target) => this.enterTarget(target);
    w.drawNPC = (ctx, npc) => this.drawNpc(ctx, npc, w);
    // 시작 위치
    const p = w.player;
    if (spawn === 'gate') { const gb = BUILDINGS.find((b) => b.kind === 'gate'); p.x = gb.door * TILE - 120; p.facing = -1; }
    else if (spawn === 'inn') { const ib = BUILDINGS.find((b) => b.kind === 'inn'); p.x = ib.door * TILE + 70; p.facing = 1; }
    else if (typeof spawn === 'number') { p.x = spawn; if (facing) p.facing = facing; }
    p.y = FLOOR - p.h;
    w.camera.follow(p, 1 / 60, true);
  }

  setupDoor(d) {
    const b = BUILDINGS.find((k) => k.door !== undefined && d.x === k.door * TILE);
    d.building = b;
    const cx = d.cx;
    const wid = b?.kind === 'gate' ? 150 : b?.kind === 'church' ? 80 : b?.kind === 'board' ? 180 : b?.kind === 'stable' ? 90 : 56;
    d.x = cx - wid / 2; d.w = wid;
    d.z = 20;
    d.draw = (ctx, world) => {
      if (!d.near || this.hint !== d || this.game.top !== this) return; // 대화·메뉴가 위에 떠 있거나 다른 대상이 안내 중이면 숨김
      const t = world.time;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, d.cx, FLOOR - 40, 70, '#ffb45a', 0.35 + Math.sin(t * 5) * 0.08);
      ctx.globalCompositeOperation = 'source-over';
      const ly = FLOOR - (b?.kind === 'board' ? 214 : b?.kind === 'church' ? 150 : b?.kind === 'gate' ? 160 : b?.kind === 'stable' ? 140 : 116) - Math.abs(Math.sin(t * 4)) * 6;
      text(ctx, '▲', d.cx, ly, { size: 20, weight: 900, color: '#ffe7a0', align: 'center', ow: 4 });
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
      // ↑ 는 HubScene.update 가 안내 중인 대상(this.hint) 하나에만 전달한다 (문과 NPC 가 겹칠 때 둘 다 반응하지 않게)
    };
    n.draw = (ctx, world) => {
      world.drawNPC(ctx, n);
      if (n.near && this.hint === n && this.game.top === this) { // 대화창이 떠 있거나 다른 대상(문)이 안내 중이면 이름표·'▲ 대화' 를 숨긴다
        const nm = NpcData.NPCS?.[n.npcId]?.name ?? spec.name ?? '';
        const y = n.y - 30 - Math.abs(Math.sin(world.time * 3)) * 3;
        text(ctx, nm, n.cx, y - 14, { size: 14, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 3 });
        text(ctx, '▲ 대화', n.cx, y + 2, { size: 12, weight: 700, color: '#ffe7a0', align: 'center', ow: 3 });
      }
    };
    n.lights = (L) => L.add(n.cx, n.cy, 110, '#ffd9a0', 0.55);
  }

  drawNpc(ctx, npc, world) {
    const spec = TOWN_NPCS[npc.npcId] || {};
    const look = NpcData.NPCS?.[npc.npcId]?.look ?? spec.look;
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
    const name = target.slice(6); // 'scene:shop' · 'scene:stable' (영혼의 마구간, CMP-TOWN) …
    if (!g.registry[name]) {
      audio.sfx('menu_cancel');
      g.toast(name === 'inn' ? '흑묘 여관은 아직 문을 열 준비 중이다…' : '지금은 들어갈 수 없다.', '#c8b8a0');
      return;
    }
    w.syncRun?.();
    if (this.entering) return;
    this.entering = true;
    // 문이 열리며 짧게 암전 → 장면 진입
    g.fadeOut(() => { this.entering = false; g.push(name, { world: w, from: 'hub' }); }, 0.16);
  }

  onResume() {
    const g = this.game, w = this.world;
    g.world = w;
    audio.music('hub');
    this.refreshBoard();
    // 동료 교체 → 월드 재구성
    if (w.hero !== currentHero(g.state)) {
      const px = w.player.x, f = w.player.facing;
      this.buildWorld(px, f);
      audio.sfx('powerup');
      this.world.fx.burst('magic', this.world.player.cx, this.world.player.cy, 30, { color: '#e8c872', speed: 200 });
      this.world.fx.ring(this.world.player.cx, this.world.player.cy, { color: '#e8c872', r0: 10, r1: 90, life: 0.5, width: 5 });
      CMP.companionHubEnter?.(g, this);   // [hook:cmp]
      return;
    }
    w.player?.refreshStats();
    if (w.player) { w.player.hp = w.player.stats.hp; w.player.mp = w.player.stats.mp; }
    CMP.companionHubEnter?.(g, this);   // [hook:cmp] 위 장면(대화·합류 연출·메뉴…)이 닫힐 때마다 남은 연출을 이어 간다
  }

  refreshBoard() {
    const st = this.game.state;
    try {
      const av = QuestRt.availableQuests(st) || [];
      const act = Object.keys(st.quests?.active || {});
      this.boardInfo.boardNew = av.length > 0;
      this.boardInfo.boardClaim = act.some((q) => QuestRt.canClaim(st, q));
    } catch (e) { this.boardInfo.boardNew = false; this.boardInfo.boardClaim = false; }
    // 마구간 문 '!' (알 부화 · 합류 대기 · 그레타 의뢰 보상) — facades 의 마구간 LIVE 가 읽는다
    try { this.boardInfo.stableNote = CMP.companionHubNote?.(st) ?? null; } catch { this.boardInfo.stableNote = null; }   // [hook:cmp]
  }

  exit() { this.menuOpen = false; this.hidePad = false; if (this.game.world === this.world) this.game.world = null; }
  resize() { this.world?.camera.setView(this.game.viewW, this.game.viewH); this.crack = null; }

  // ───────────────────────── 업데이트 ─────────────────────────
  update(dt) {
    const g = this.game, w = this.world;
    this.banner.t += dt;
    g.state.stats.playTime = (g.state.stats.playTime ?? 0) + dt;
    if (this.menuOpen) { this.updateMenu(dt); return; }
    if (input.pressed('menu') && !w.cutscene) { this.openMenu(); return; }
    // 빠른 메뉴 (Tab·M·I / 패드 SELECT / 터치 가방) → 메뉴의 인벤토리 탭 (platform §3)
    if (input.pressed('map') && !w.cutscene && !w.transitioning) { this.openQuickMenu(); return; }   // [hook:plat]
    if (this.tapHud()) return;
    // 전투 입력은 이번 스텝 동안만 뗀 것으로 보이게 한 뒤 World 갱신 (보조무기·스킬이 하트·MP 를 쓰지 않도록)
    const held = NO_COMBAT.map((a) => input.state[a]);
    for (const a of NO_COMBAT) { input.state[a] = false; input.consume(a); }
    // ↑ 누름도 World 안의 문(Door.update)·NPC 에는 보이지 않게 하고, 아래에서 안내 대상 하나에만 전달한다
    const upPressed = input.pressed('up'), upPrev = input.prev.up;
    input.prev.up = input.state.up;
    try { w.update(dt); } finally { NO_COMBAT.forEach((a, i) => { input.state[a] = held[i]; }); input.prev.up = upPrev; }
    const p = w.player;
    if (p) { p.hp = p.stats.hp; if (p.y > FLOOR + 200) { p.x = 29 * TILE; p.y = FLOOR - p.h; p.vy = 0; } }
    // 상호작용 대상: 가까운 문·NPC 중 하나 (가운데 아래 안내와 ↑ 입력이 같은 대상을 가리킨다)
    this.hint = this.pickHint(w, p);
    if (upPressed && this.hint && !w.cutscene && !w.transitioning && this.game.top === this) { this.act(this.hint); return; }
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

  /** 상호작용 대상 고르기: 가까이 있는 NPC·문 가운데 플레이어와 가장 가까운 것 (같으면 NPC 우선) */
  pickHint(w, p) {
    let best = null, bd = Infinity;
    for (const e of w.entities) {
      if (!e.near || e.dead || !(e.kind === 'npc' || e.building)) continue;
      const d = Math.abs((p?.cx ?? 0) - e.cx) - (e.kind === 'npc' ? 12 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  /** 안내 대상 실행: NPC 면 대화, 문이면 입장 */
  act(h) {
    if (h.kind === 'npc') this.talk(h);
    else { audio.sfx('door'); this.enterTarget(h.target); }
  }

  /** HUD 버튼 탭 (ui.taps — 논리 px 로 등록, 터치 여유 포함) */
  tapHud() {
    if (!input.pointer.tapped) return false;
    const id = taps.hit(this);
    if (id === 'menu') { this.openMenu(); return true; }
    if (id === 'party') { this.openParty(); return true; }
    if (id === 'act' && this.hint) { this.act(this.hint); return true; }
    return false;
  }

  openParty() {
    const g = this.game;
    if (!g.registry.party) return;
    audio.sfx('menu_ok');
    g.push('party', { world: this.world, from: 'hub' });
  }
  openQuickMenu() {
    const g = this.game;
    if (!g.registry.menu) return;
    audio.sfx('menu_ok');
    g.push('menu', { world: this.world, from: 'hub', tab: 'inventory' });
  }
  openMenu() {
    audio.sfx('menu_ok');
    const g = this.game;
    const items = [
      ['계속하기', '', () => this.closeMenu()],
      ['메뉴', '장비 · 스킬 · 가방 · 동료', () => { this.closeMenu(); if (g.registry.menu) g.push('menu', { world: this.world, from: 'hub' }); else g.toast('메뉴를 준비 중입니다.', '#c8b8a0'); }],
    ];
    // '동료' 는 이제 탈것·수호신(메뉴 › 동료)을 뜻하므로, 함께 싸울 헌터를 바꾸는 항목은 '헌터 교체' 라고 부른다
    if (g.registry.party) items.push(['헌터 교체', '함께 싸울 헌터를 고른다', () => { this.closeMenu(); this.openParty(); }]);
    items.push(['저장', `슬롯 ${g.state.slot ?? 1}에 기록`, () => this.doSave()]);
    if (g.registry.options) items.push(['설정', '소리 · 화면 · 조작', () => { this.closeMenu(); g.push('options', {}); }]);
    items.push(['타이틀로', '저장하지 않은 진행은 사라진다', () => { this.closeMenu(); g.go('title', {}); }]);
    this.menuItems = items;
    this.menu = new ListMenu(items.length);
    this.menuOpen = true; this.menuT = 0;
    this.hidePad = true; // 메뉴가 떠 있는 동안 가상 패드(점프 = 결정, 스틱 자리)가 줄을 가리지 않게 (PLAT-TOUCH #124)
    this._mp = null;
  }
  closeMenu() { this.menuOpen = false; this.hidePad = false; input.flush(); }
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
    const p = input.pointer, rowOf = (id) => (typeof id === 'string' && id.startsWith('m:') ? Number(id.slice(2)) : -1);
    // 마우스: 움직였을 때만 가리킨 줄을 고른다 (키보드로 옮긴 선택을 가만히 있는 커서가 되돌리지 않게)
    if (!input.touchMode && p.active && (!this._mp || this._mp.x !== p.x || this._mp.y !== p.y)) {
      if (this._mp) { const i = rowOf(taps.over(this)); if (i >= 0 && i !== this.menu.index) { this.menu.index = i; audio.sfx('menu_move'); } }
      this._mp = { x: p.x, y: p.y };
    }
    const ti = p.tapped ? rowOf(taps.hit(this)) : -1;
    if (ti >= 0 && this.menuItems[ti]) { this.menu.index = ti; audio.sfx('menu_ok'); this.menuItems[ti][2](); return; }
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
    if (this.game.top === this) this.drawBanner(ctx, vw, vh); // 대화 중에는 (시간이 멈춘) 배너를 숨긴다
    if (this.menuOpen) this.drawMenu(ctx, vw, vh);
  }

  /** HUD·마을 메뉴 배율: 휴대폰(작은 CSS 화면)에서 game.uiK 배 (데스크톱 1) */
  uiK() { return Math.max(1, this.game.uiK || 1); }
  /** UI 좌표 사각형을 논리 px 로 바꿔 탭 영역으로 등록 (허브는 uiScale 장면이 아니므로 포인터도 논리 px) */
  zone(id, r, k, off, src = 'hub.hud') {
    const L = { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
    taps.add(id, L, { owner: this, kind: 'primary', disabled: off, src });
    return L;
  }

  drawHUD(ctx, vw, vh) {
    const g = this.game, st = g.state, hero = currentHero(st), ch = CHARACTERS[hero.charId];
    const k = this.uiK(), W = vw / k, H = vh / k;
    const off = this.menuOpen || g.top !== this || !!this.world.cutscene;
    const rects = {};
    ctx.save();
    if (k !== 1) ctx.scale(k, k);
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
    const maxed = hero.level >= MAX_LEVEL, need = expToNext(hero.level);
    bar(ctx, bx, py + 28, bw, 7, maxed ? 1 : hero.exp / need, { color: '#e8c872' });
    text(ctx, maxed ? 'EXP MAX' : `EXP ${fmt(hero.exp)} / ${fmt(need)}`, bx, py + 49, { size: 11, color: maxed ? '#ffd84a' : '#bca88a', weight: 700 });
    if ((hero.sp ?? 0) > 0) text(ctx, `SP ${hero.sp}`, bx + bw, py + 49, { size: 11, align: 'right', color: '#8ae0ff', weight: 800, family: FONT.num });

    // ── 우상단: 골드 · 유물(2부: 세계의 심장) · 버튼 ──
    const gw = 190, gx = W - gw - 14, gy = 12;
    uiPanel(ctx, gx, gy, gw, 40, { corner: false });
    drawIcon(ctx, 'coin', gx + 22, gy + 20, 24);
    text(ctx, fmt(st.gold ?? 0), gx + gw - 14, gy + 27, { size: 19, weight: 900, family: FONT.num, color: '#ffd84a', align: 'right' });
    text(ctx, 'G', gx + 40, gy + 26, { size: 12, weight: 800, family: FONT.num, color: '#b89a50' });
    const p2 = !!st.progress?.flags?.p2_started;
    const ids = p2 ? HEART_IDS : RELIC_IDS, got = (p2 ? st.progress?.hearts : st.progress?.relics) ?? [];
    const sp = p2 ? 29 : 34;
    for (let i = 0; i < ids.length; i++) {
      const rx = gx + 24 + i * sp, ry = gy + 58;
      const has = got.includes(ids[i]);
      ctx.fillStyle = has ? 'rgba(120,10,24,0.8)' : 'rgba(10,4,10,0.6)';
      ctx.beginPath(); ctx.arc(rx, ry, 12, 0, TAU); ctx.fill();
      ctx.strokeStyle = has ? '#ff6a7a' : '#4a3a30'; ctx.lineWidth = 1.5; ctx.stroke();
      if (has) drawIcon(ctx, ITEMS[ids[i]]?.icon ?? (p2 ? 'wheart_' : 'relic_') + (i + 1), rx, ry, 22);
      else text(ctx, '?', rx, ry + 5, { size: 12, weight: 800, color: '#4a3a30', align: 'center', ow: 0 });
    }
    const bwd = 88, bh = 40, by = gy + 80;
    const rParty = { x: W - 14 - bwd * 2 - 8, y: by, w: bwd, h: bh }, rMenu = { x: W - 14 - bwd, y: by, w: bwd, h: bh };
    if (g.registry.party) { uiButton(ctx, rParty, '헌터', { size: 15 }); rects.party = this.zone('party', rParty, k, off); }
    uiButton(ctx, rMenu, '메뉴', { size: 15 }); rects.menu = this.zone('menu', rMenu, k, off);

    // ── 하단: 상호작용 안내 ──
    const h = this.hint;
    const touch = !!input.touchMode;
    if (h && !this.world.cutscene) {
      // 발밑 흙길 띠(바닥 아래 48px)에 한 줄로: 캐릭터 다리를 가리지 않고, 제목·설명이 서로 닿지 않게.
      // 키보드·패드는 ▲ 대신 지금 기기의 '위' 글리프, 터치는 이 띠를 누른다
      const label = (touch ? '▲  ' : '') + (h.kind === 'npc' ? `대화 · ${NpcData.NPCS?.[h.npcId]?.name ?? TOWN_NPCS[h.npcId]?.name ?? ''}` : `들어가기 · ${h.building?.name ?? ''}`);
      const sub = h.kind === 'npc' ? (NpcData.NPCS?.[h.npcId]?.title ?? TOWN_NPCS[h.npcId]?.title ?? '') : (h.building?.desc ?? '');
      const gh = 20, gwid = touch ? 0 : Math.round(glyphWidth('up', gh)) + 8;
      ctx.font = font(16, 800, FONT.body); const lw = ctx.measureText(label).width + gwid;
      ctx.font = font(12, 600, FONT.body); const sw = sub ? ctx.measureText(sub).width : 0;
      // 터치: 오른쪽 아래 패드 묶음(점프·대시·탑승)과 겹치지 않게 그 왼쪽에 둔다
      let right = W - 20;
      if (touch) { try { const PL = hudLayout(this.world, vw, vh)?.padLeft; if (Number.isFinite(PL)) right = Math.min(right, PL / k - 12); } catch { /* 패드 정보 없음 */ } }
      const aw = Math.min(right - 20, Math.max(240, lw + (sub ? sw + 26 : 0) + 56)), ah = 38;
      const cxA = Math.min(W / 2, right - aw / 2);
      const rA = { x: Math.round(cxA - aw / 2), y: H - ah - 6, w: aw, h: ah };
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      ctx.save();
      ctx.shadowColor = `rgba(232,200,114,${0.3 + pulse * 0.3})`; ctx.shadowBlur = 16;
      uiButton(ctx, rA, '', { size: 16, selected: true });
      ctx.restore();
      const showSub = sub && lw + sw + 26 + 40 <= aw;
      const x0 = rA.x + rA.w / 2 - (lw + (showSub ? sw + 26 : 0)) / 2, tby = rA.y + rA.h / 2 + 6;
      if (gwid) drawGlyph(ctx, 'up', x0, rA.y + (rA.h - gh) / 2, gh);
      text(ctx, label, x0 + gwid, tby, { size: 16, weight: 800, color: '#fff4d8', ow: 3, maxWidth: aw - 30 - gwid });
      if (showSub) {
        ctx.fillStyle = 'rgba(232,200,114,0.5)'; ctx.fillRect(x0 + lw + 12, rA.y + 11, 1.5, rA.h - 22);
        text(ctx, sub, x0 + lw + 26, tby - 1, { size: 12, weight: 600, color: '#d8c8b0', ow: 2 });
      }
      rects.act = this.zone('act', rA, k, off);
    }
    if (!h) uiHints(ctx, [['dpadH', '이동'], ['jump', '점프'], ['dash', '대시'], ['up', '들어가기·대화'], ['map', '가방'], ['menu', '메뉴']], W / 2, H - 8);
    ctx.restore();
    // 터치 패드는 맨 위 장면의 hudRects(논리 px) 위에서는 스틱을 만들지 않고 탭을 캔버스로 넘긴다
    this.hudRects = off ? {} : rects;
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
    const k = this.uiK(), W = vw / k, H = vh / k, low = H < 500;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(4,2,8,0.72)'; ctx.fillRect(0, 0, vw, vh);
    vignette(ctx, vw, vh, 0.6);
    if (k !== 1) ctx.scale(k, k);
    const n = this.menuItems.length, bw = Math.min(360, W - 60), bh = low ? 46 : 50, gap = low ? 8 : 10;
    const tot = n * bh + (n - 1) * gap;
    const y0 = Math.max(low ? 84 : 96, H / 2 - tot / 2 + (low ? 12 : 24));
    text(ctx, '에슈빌', W / 2, y0 - (low ? 40 : 44), { size: low ? 30 : 34, weight: 800, family: FONT.title, color: '#f3d690', align: 'center', ow: 4 });
    text(ctx, 'VILLAGE MENU', W / 2, y0 - (low ? 18 : 20), { size: 12, weight: 800, family: FONT.num, color: '#9d8f80', align: 'center' });
    this.menuItems.forEach(([label, sub], i) => {
      const r = { x: W / 2 - bw / 2, y: y0 + i * (bh + gap), w: bw, h: bh };
      this.zone('m:' + i, r, k, this.game.top !== this, 'hub.menu');
      uiButton(ctx, r, label, { selected: this.menu.index === i, sub: sub || undefined, size: 17 });
    });
    uiHints(ctx, [['dpadV', '선택'], ['confirm', '결정'], [['cancel', 'menu'], '닫기']], W / 2, Math.min(H - 8, y0 + tot + 26));
    ctx.restore();
  }

  // ───────────────────────── 2부: 하늘 균열 (world2 §10, 선택) ─────────────────────────
  /** 0 = 없음 · 1 = 옅은 흉터 (2부를 마쳤고 진엔딩 전) · 2 = 열린 균열 (2부 진행 중) */
  skyCrackMode() {
    const F = this.game.state?.progress?.flags;
    if (!F?.p2_started || F.ending_p2true) return 0;
    return F.p2_done || F.ending_p2 ? 1 : 2;
  }
  /** 원경 위(파사드·NPC 뒤) 화면 좌표로: 은빛 균열 한 줄기 + 잔가지. 굽힌 캔버스를 쓰고 매 프레임 두 번 그린다 */
  drawSkyCrack(ctx, cam, vw, vh, t) {
    const mode = this.skyCrackMode();
    if (!mode) return;
    const spr = this.crackSprite(vw);
    if (!spr) return;
    const calm = !!this.game.settings?.reduceMotion;
    const x = -Math.min(120, Math.max(0, cam.x * 0.03)), y = 18;
    ctx.save();
    if (mode === 1) { ctx.globalAlpha = 0.2; ctx.drawImage(spr.cv, x, y, spr.w, spr.h); ctx.restore(); return; }
    ctx.globalAlpha = 0.6 * (calm ? 1 : 0.88 + 0.12 * Math.sin(t * 0.9));
    ctx.drawImage(spr.cv, x, y, spr.w, spr.h);
    // 느린 빛 번짐 (가산)
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = calm ? 0.12 : 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.55 + 1.3));
    ctx.drawImage(spr.cv, x, y, spr.w, spr.h);
    ctx.restore();
  }
  crackSprite(vw) {
    const s = clamp(this.game.scale || 1, 1, 2);
    const w = Math.ceil(vw + 140), h = 190;
    if (this.crack && this.crack.w === w && this.crack.s === s) return this.crack;
    let cv;
    try { cv = document.createElement('canvas'); } catch { return null; }
    cv.width = Math.ceil(w * s); cv.height = Math.ceil(h * s);
    const c = cv.getContext('2d');
    if (!c) return null;
    c.scale(s, s);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const rng = new RNG(hashStr('eshville-sky-crack'));
    // 줄기: 왼쪽 위에서 오른쪽으로 비스듬히 내려가는 톱니 선
    const main = [];
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      main.push([w * (0.06 + 0.9 * u) + rng.range(-10, 10), 26 + u * 92 + Math.sin(u * 7.3) * 16 + rng.range(-9, 9)]);
    }
    const branches = [];
    for (let b = 0; b < 7; b++) {
      const i0 = 2 + Math.floor(rng.range(0, n - 4));
      let [bx, by] = main[i0];
      const dir = rng.range(0, 1) < 0.5 ? -1 : 1, len = rng.range(3, 6);
      const pts = [[bx, by]];
      for (let j = 0; j < len; j++) { bx += rng.range(10, 26); by += dir * rng.range(6, 16); pts.push([bx, by]); }
      branches.push(pts);
    }
    const stroke = (pts, lw, col) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.stroke(); };
    for (const [lw, col] of [[9, 'rgba(170,200,255,0.10)'], [5, 'rgba(200,220,255,0.22)'], [2.4, 'rgba(225,235,255,0.62)'], [1, 'rgba(255,255,255,0.95)']]) {
      stroke(main, lw, col);
      for (const bp of branches) stroke(bp, lw * 0.6, col);
    }
    // 틈에서 새는 별빛 몇 점
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 14; i++) { const p = main[1 + Math.floor(rng.range(0, n - 1))]; c.fillRect(p[0] + rng.range(-18, 18), p[1] + rng.range(-14, 14), 1.4, 1.4); }
    this.crack = { cv, w, h, s };
    return this.crack;
  }
}
