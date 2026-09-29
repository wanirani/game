// 스테이지 런타임: 방 로딩, 엔티티 관리, 충돌/드롭/점수/콤보, 보스전, 방 이동, 렌더링
import { TILE } from '../core/game.js';
import { Camera } from '../core/camera.js';
import { Particles } from '../core/particles.js';
import { Lighting } from '../core/lighting.js';
import { T, Debris, isSolidType } from '../core/physics.js';
import { input } from '../core/input.js';
import { rand, randi, chance, clamp, overlap, TAU, pick } from '../core/math.js';
import { audio, SFX } from '../core/audio.js';
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
import { ENEMIES } from '../data/enemies.js';
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
import { createBoss } from './bosses/lazy.js';   // R1-REQ-229 (요청 #380): 보스 클래스를 정적으로 싣지 않는 입구 — bosses/index.js 가 불러와져 있으면 곧바로 진짜 보스, 아니면 대역(PendingBoss)이 받는 동안 자리를 지킨다
import { SCRIPTS } from '../data/story.js';
import { CLASSES } from '../data/classes.js';
import { Style } from './style.js';   // [hook:feel]
import { AW_GAIN } from '../data/feel_hit.js';   // [hook:awaken]
import { createGimmick } from './gimmicks.js';   // [hook:gimmick]
import { CompanionSystem } from './companions.js';   // [hook:cmp]
import { touchpad } from '../core/touchpad.js';   // [hook:plat]
import * as HFX from '../render/hitfx.js';   // [hook:feel] 첫 타격 스프라이트 미리 굽기 (prewarmHitFx)
import * as HL from '../render/hud_layout.js';   // 데미지 숫자·판정 문구가 HUD 윗줄 뒤에 숨지 않게 (R1-REQ-331, syncHudBand)

// ── 손맛·각성 상수 (feel.md §4.9, §6.1). AW_GAIN(data/feel_hit.js)에 값이 없으면 이 기본값을 쓴다 ──
const SLOWMO_BASE = 0.35;                      // 기본 슬로모션 배율 (보스 격파 등 옛 호출부)
const KILL_SLOW_GAP = 1.5;                     // 처치 슬로모션 최소 간격 (실제 초)
const MULTI_KILL_WIN = 0.5;                    // 다중 처치 판정 창 (실제 초)
const COMBO_MILESTONES = new Set([10, 25, 50, 100, 150, 200, 300]);
const AW_DEFAULT = { hit: 0.5, crit: 1, kill: 2, elite: 8, launch: 3, bounce: 3, counter: 3, rankUp: 1, bossIntro: 25, phase: 15, rage: 6, rageFrac: 0.1, minTier: 1, max: 100, ultGainDiv: 200 };
const AW_NONE = ['ult', 'awaken', 'companion'];  // 필살기·각성기·동료 타격은 각성 게이지를 채우지 않는다
const awGain = (k) => AW_GAIN?.[k] ?? AW_DEFAULT[k] ?? 0;
const awBlocked = (attack) => { const z = AW_GAIN?.zeroTags ?? AW_NONE; return !!attack?.tags?.some((t) => z.includes(t)); };

export const STYLE_RANKS = [
  { n: 0, r: '', c: '#fff' }, { n: 5, r: 'D', c: '#a0a0a0' }, { n: 10, r: 'C', c: '#7ee07e' }, { n: 20, r: 'B', c: '#5aa8ff' },
  { n: 35, r: 'A', c: '#c07cff' }, { n: 50, r: 'S', c: '#ffa640' }, { n: 80, r: 'SS', c: '#ff5a4a' }, { n: 120, r: 'SSS', c: '#ffe070' },
];
// 보스가 남기는 일시적인 개체 종류 (부활 시 정리 대상). 'hazard' = B계열 보스의 Zone(장판·광선 등)
const BOSS_TRANSIENT = new Set(['projectile', 'hitbox', 'effect', 'hazard', 'zone']);
const SPAWN_SHIFT_MAX = 12;                     // 터치 스틱(왼손잡이: 버튼 묶음)에 가린 시작 위치를 오른쪽으로 옮기는 최대 칸 수
const TOP_EDGE_R = { x: 0, y: -2000, w: 0, h: 2004 };
/** HUD 비키기(syncHudBand)용 화면 위끝 띠 (논리 px; 재사용 객체) */
const TOP_EDGE = (vw) => { TOP_EDGE_R.w = vw; return TOP_EDGE_R; };
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
    this.fx = new Particles(1400);
    this.lighting = new Lighting();
    this.applyQuality();
    this.entities = []; this.platforms = []; this.debrisList = []; this.debugRects = [];
    this.time = 0; this.hitstop = 0; this.slowmo = 0; this.timeStop = 0;
    this.cutscene = false; this.inputLock = false; this.transitioning = false;
    this.boss = null; this.bossActive = false; this.arena = null; this.cleared = false; this.clearT = 0;
    this.combo = { n: 0, t: 0, max: 0, best: 0, dmg: 0 };   // [hook:feel] dmg = 이번 콤보 총 피해 (feel_hud '총 피해')
    this.banner = null; // {text, sub, t, color}
    this.nextExtraLife = Math.ceil(((this.state.score ?? 0) + 1) / 30000) * 30000;
    this.run = {
      hp: null, mp: null, hearts: 10, lives: this.state.lives ?? this.diff.lives, score: this.state.score ?? 0,
      sp: 0, sub: this.hero.sub ?? 'dagger', time: 0, kills: 0, secrets: 0, damageTaken: 0, hits: 0,
      continues: this.diff.continues, docsFound: [], saintUsed: false, checkpoint: null,
    };
    this.onExit = onExit;
    this.player = null;
    // ── 손맛·각성·기믹·동료 (MASTER_PLAN §1.7 world.js #2; loadRoom 보다 먼저) ──
    this.rt = 0;   // [hook:feel] 실제 경과 시간 (히트스톱·슬로모션 무관)
    this.slowmoScale = SLOWMO_BASE; this.slowScaleT = 0; this.killSlowT = 0; this.killChain = { n: 0, t: -9 };   // [hook:feel]
    this.freezeEnemies = false; this.freezeLog = []; this.frozenRecent = 0;   // [hook:feel]
    this.overlays = []; this.hudHidden = false; this.letterbox = 0;   // [hook:feel]
    this.roomFoes = 0;   // [hook:feel] 이 방에 나온 적 수 (마지막 적 처치 슬로모션)
    this.killPend = [];   // [hook:feel] 이번 프레임의 처치 (슬로모션 판정은 프레임 끝: 죽으며 갈라지는 적의 새끼가 생긴 뒤)
    this.style = this.makePart('style', () => new Style(this));   // [hook:feel]
    this.run.aw = 0; this.awakenState = { ready: false, holdK: 0 };   // [hook:awaken]
    this.bossPhaseSeen = null; this.bossPhaseOf = null;   // [hook:awaken]
    this.gimmick = null;   // [hook:gimmick]
    this.companions = this.makePart('companions', () => new CompanionSystem(this));   // [hook:cmp]
    this.loadRoom(roomId || this.stage.start || Object.keys(this.stage.rooms)[0]);
    this.prewarmHitFx();   // [hook:feel]
    bus.emit('stageEntered', { stageId });
    this.banner = { text: this.stage.name, sub: `CHAPTER ${this.stage.chapter ?? ''} · ${this.stage.sub ?? ''}`, t: 3.2, color: '#e8c872', big: true };
  }

  /**
   * 첫 타격·첫 피격이 쓰는 공용 스프라이트(숫자 아틀라스, 흰 테 타격 스프라이트, 피격 섬광)를 스테이지 시작 때 굽는다
   * (보스 방으로 바로 들어가 부팅 뒤 한가할 때의 미리 굽기보다 먼저 싸워도 스테이지 도중 새 캔버스 0 — MASTER_PLAN §5.2).
   * 이미 구웠으면 캐시 조회뿐이다. 나머지 색·문구·자국은 hitfx.prewarm 이 부팅 뒤 (글꼴을 기다려) 한가할 때 굽는다.
   * 숫자 아틀라스는 글꼴이 늦게 오면 같은 캔버스에 다시 굽는다 (hitfx.digitAtlas).
   */
  prewarmHitFx() {
    try {
      for (const s of ['normal', 'crit', 'hurt', 'total']) HFX.digitAtlas?.(s);
      for (const f of [HFX.cut, HFX.glow, HFX.star, HFX.streak, HFX.ring]) f?.('#ffffff');
      HFX.star?.('#ffe080'); HFX.soft?.('#ff2040');
    } catch (e) { console.warn('[world] prewarmHitFx', e); }
  }
  /** 그래픽 품질 설정 → 파티클 수·조명 해상도 (스테이지 도중 설정을 바꿔도 즉시 반영) */
  applyQuality() {
    const q = this.qualityNow();
    this.qualityApplied = q;
    this.fx.max = q === 'low' ? 500 : q === 'medium' ? 900 : 1400;   // [hook:plat] MASTER_PLAN §5.2 파티클 예산
    this.fx.quality = q === 'low' ? 0.5 : q === 'medium' ? 0.75 : 1;
    this.lighting.res = q === 'low' ? 0.33 : 0.5;
    if (this.fx.list.length > this.fx.max) this.fx.list.splice(0, this.fx.list.length - this.fx.max);
  }
  /** 실제 적용 품질 'low'|'medium'|'high' ('auto' 는 품질 조절기가 정한 game.quality, 없으면 high) */
  qualityNow() {
    const q = this.game.quality ?? this.game.settings?.quality ?? 'high';   // [hook:plat]
    return q === 'low' || q === 'medium' ? q : 'high';
  }
  /** 아케이드 계열 모드 (보스 러시·서바이벌·스테이지 연습): 세이브 기록 없음 */
  get arcade() { return this.mode === 'bossrush' || this.mode === 'survival' || this.mode === 'practice'; }
  /** 이 방의 액체 종류 (방 설정 우선: world2 §3.1) */
  get liquid() { return this.room?.liquid ?? this.stage.liquid ?? 'water'; }   // [hook:gimmick]
  /** 방 기믹 중 kind 하나 (없으면 null — 호출부는 반드시 null 확인) */
  gimmickOf(kind) { return this.gimmick?.get?.(kind) ?? null; }   // [hook:gimmick]
  /** 다른 패키지의 런타임 부품 생성: 실패해도 스테이지는 뜨게 (오류는 콘솔에 남긴다) */
  makePart(name, make) {
    try { return make(); } catch (e) { console.error(`[world] ${name} 초기화 실패`, e); return null; }
  }

  // ─────────────────────────── 방 로딩 ───────────────────────────
  loadRoom(roomId, { keepPlayer = true } = {}) {
    const room = this.stage.rooms[roomId];
    if (!room) { console.error('room not found', roomId); return; }
    this.gimmick?.dispose?.(); this.gimmick = null;   // [hook:gimmick]
    this.fx.clearDecals?.(); this.overlays.length = 0; this.roomFoes = 0; this.killPend.length = 0;   // [hook:feel]
    this.room = room; this.roomId = roomId;
    this.map = new TileMap(room);
    this.entities = []; this.platforms = []; this.debrisList = [];
    this.fx.clear();
    this.boss = null; this.bossActive = false; this.arena = null;
    this.tiles = new TileRenderer(this.stage, this.map);
    this.bg = createBackground({ ...this.stage, ...(room.theme ? { theme: room.theme } : {}), ...(room.bg !== undefined ? { bg: room.bg } : {}) }, this.map);
    // 가독성: 스테이지 어둠 값을 완화 (촛불·횃불 광원 대비는 유지)
    this.lighting.darkness = Math.min(0.6, (room.darkness ?? this.stage.darkness ?? 0.4) * 0.62);
    this.lighting.color = this.stage.darkColor ?? '#06020c';
    this.camera.setView(this.game.viewW, this.game.viewH);
    this.camera.setBounds(0, 0, this.map.pxW, this.map.pxH);
    this.camera.reset();   // [hook:feel] 줌·연출 구도·흔들림·경기장 바닥 힌트 초기화

    // 플레이어
    const start = this.map.markersOf('P')[0] || { tx: 2, ty: this.map.h - 3 };
    if (!this.player) this.player = new Player(this, this.state, this.hero);
    const p = this.player;
    p.world = this;
    const place = (tx) => { p.x = tx * TILE + TILE / 2 - p.w / 2; p.y = (start.ty + 1) * TILE - p.h; };
    place(start.tx);
    p.vx = 0; p.vy = 0; p.onGround = false;
    p.facing = room.facing ?? 1;
    this._spawnPass = null;   // 터치 시작 위치 옮기기가 지나친 가로 구간 (그 안의 이야기 트리거는 그래도 발동: armSpawnTrigger)
    if (input.touchMode) this.clearStickAtSpawn(start, place);
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
        case 'D': { const door = new Door(m.tx, m.ty, (room.doors?.[n]) ?? room.next); door.mark = room.doorMarks?.[n] ?? null; this.add(door); break; }   // [hook:gimmick] 문 표식 (world2 §3.8)
        case 'M': case 'V': {
          // 발판별 덮어쓰기 (R1-SEED-PLAT): room.platforms[i] = {range, speed} — i 는 M·V 표식을 지도 순서대로 함께 센 번호.
          // 없으면 방 기본값 (room.platRange / room.platSpeed)
          const vert = m.ch === 'V', o = room.platforms?.[(counters.plat = (counters.plat ?? -1) + 1)] ?? null;
          const pl = new MovingPlatform(m.tx, m.ty, vert, o?.range ?? room.platRange ?? 4, o?.speed ?? room.platSpeed ?? (vert ? 70 : 80));
          this.add(pl); this.platforms.push(pl); break;
        }
        case 'F': { const pl = new CrumblePlatform(m.tx, m.ty); this.add(pl); this.platforms.push(pl); break; }
        case 'L': break;
        case '!': {
          const sid = room.triggers?.[n];
          const key = `${this.stage.id}:${roomId}:trig${n}`;
          if (sid && !this.state.progress.seenScripts.includes(sid)) this.armSpawnTrigger(this.add(new StoryTrigger(m.tx, m.ty, sid, key)));
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
    this.gimmick = createGimmick(this, room);   // [hook:gimmick]
    this.companions?.onRoomLoaded(roomId);   // [hook:cmp] 수호신 배치·탈것 다시 태우기 (기믹이 생긴 뒤)
    if (input.touchMode && p.mount?.riding) this.clearStickAtSpawn(start, place);   // [hook:plat] [hook:cmp] 탈것 몸이 넓어 스틱에 다시 가려질 수 있다
    // 가짜 벽은 드러나기 전 벽처럼 그림
    this.camera.follow(p, 1 / 60, true);
    const music = room.music ?? this.stage.music;
    if (music && !room.boss) audio.music(music);
    bus.emit('roomEntered', { stageId: this.stage.id, roomId });
  }

  /** 가상 스틱의 화면 영역 → 논리 좌표 {x0,x1,y0,y1}. 캔버스 패드(touchpad.stickZone, 논리 px)를 먼저 쓰고, 없으면 DOM #stick, 그것도 없으면 대략값 */
  stickRect() {
    const vw = this.game.viewW, vh = this.game.viewH;
    const z = touchpad.stickZone?.();   // [hook:plat]
    if (z && z.w > 0 && z.h > 0) {
      if (z.x + z.w / 2 <= vw / 2) return { x0: z.x, x1: z.x + z.w, y0: z.y, y1: z.y + z.h };   // [hook:plat]
      // [hook:plat] 왼손 모드: 스틱은 오른쪽, 버튼 무리가 왼쪽 아래 — 그 무리(일시정지·가방·전체 화면 제외)를 피한다
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const r of touchpad.occupiedRects?.() ?? []) {
        if (r.id === 'pause' || r.id === 'bag' || r.id === 'fullscreen' || !(r.y + r.h > vh * 0.3)) continue;
        x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y + r.h);
      }
      if (x1 > x0 && (x0 + x1) / 2 < vw / 2) return { x0, x1, y0, y1 };
    }
    try {
      const st = document.getElementById('stick'), cv = this.game.canvas;
      const r = st?.getBoundingClientRect(), c = cv?.getBoundingClientRect();
      if (r && c && r.width > 0 && c.width > 0) {
        const k = vw / c.width; // CSS px → 논리 px
        return { x0: (r.left - c.left) * k, x1: (r.right - c.left) * k, y0: (r.top - c.top) * k, y1: (r.bottom - c.top) * k };
      }
    } catch { /* DOM 없음 */ }
    return { x0: 0, x1: 240, y0: vh - 240, y1: vh }; // 스틱이 아직 배치되지 않았을 때의 대략값
  }
  /**
   * 터치 모드: 시작 위치가 가상 스틱(왼손 모드: 버튼 묶음)에 가려지면, 바닥이 이어지는 한 (벽·가시·액체에서 멈춤) 최대 SPAWN_SHIFT_MAX(12)칸 오른쪽으로 옮겨
   * 플레이어 왼쪽 끝이 스틱 오른쪽 끝보다 반 칸 이상 떨어지게 한다. 카메라는 후보 위치마다 스냅해서 실제 화면 위치로 판정
   */
  clearStickAtSpawn(start, place) {
    const m = this.map, p = this.player, cam = this.camera;
    const free = (x, y) => { const t = m.typeAt(x, y); return !isSolidType(t) && t !== T.SPIKE && t !== T.LIQUID; };
    const floor = (x, y) => { const t = m.typeAt(x, y); return isSolidType(t) || t === T.ONEWAY; };
    const R = this.stickRect();
    R.x1 = Math.min(R.x1, this.game.viewW * 0.4);   // [hook:plat] 떠 있는 스틱 영역이 넓게 와도 화면 왼쪽 40% 까지만 피한다
    // 착지해 선 자세로 카메라를 맞춰 판정 (공중 자세보다 시야가 20px 낮다). 세로는 한 칸 여유를 두어 경계에 걸친 경우도 옮긴다
    const covered = () => {
      p.onGround = true;
      cam.follow(p, 1 / 60, true);
      const z = cam.zoom, sx0 = (p.x - cam.x) * z, sy0 = (p.y - cam.y) * z, sy1 = (p.y + p.h - cam.y) * z;
      return sy1 + TILE * z > R.y0 && sy0 < R.y1 && sx0 < R.x1 + (TILE / 2) * z;
    };
    // 후보 칸에 몸 전체(탈것에 탄 넓은 몸 포함)가 들어가는가
    const fits = (x) => {
      const cx = x * TILE + TILE / 2, l = Math.floor((cx - p.w / 2 + 1) / TILE), r = Math.floor((cx + p.w / 2 - 1) / TILE);
      const top = start.ty + 1 - Math.ceil(p.h / TILE);   // [hook:cmp]
      for (let tx = l; tx <= r; tx++) for (let ty = Math.min(top, start.ty - 1); ty <= start.ty; ty++) if (!free(tx, ty)) return false;
      return floor(x, start.ty + 1);
    };
    // 최대 12칸 (R1-REQ-323 리드 결정: 왼손잡이 버튼 묶음은 6칸으로 다 비키지 못한다). 가려지지 않는 첫 바닥 칸에서 멈추고, 12칸으로도 안 되면 그대로 둔다.
    // 보스 경기장 표식(X)은 넘지 않고(들어서자마자 보스전이 시작되지 않게), 같은 층 적 배치 칸에는 3칸 앞에서 멈춘다 (스폰하자마자 접촉 피해 방지)
    let maxTx = start.tx + SPAWN_SHIFT_MAX;
    for (const mk of m.markers ?? []) {
      if (!(mk.tx > start.tx)) continue;
      if (mk.ch === 'X') maxTx = Math.min(maxTx, mk.tx - 1);
      else if (mk.ch >= '1' && mk.ch <= '9' && mk.ty >= start.ty - 4 && mk.ty <= start.ty + 1) maxTx = Math.min(maxTx, mk.tx - 3);
    }
    const cx0 = p.x + p.w / 2;
    for (let k = 1; start.tx + k <= maxTx && covered(); k++) {
      const x = start.tx + k;
      if (!fits(x)) break;
      place(x);
    }
    p.onGround = false;
    // 옮기며 지나친 이야기 트리거('!')는 첫 프레임에 발동하게 넓힌다 (예: s01 r1 왼손 모드에서 첫 이야기 장면을 건너뛰던 문제)
    const cx1 = p.x + p.w / 2;
    if (cx1 > cx0 + 1) {
      const pass = this._spawnPass = { x0: Math.min(cx0, this._spawnPass?.x0 ?? cx0), x1: cx1 };
      for (const e of this.entities) if (e.kind === 'trigger') this.armSpawnTrigger(e, pass);
    }
  }
  /** 시작 위치 옮기기(clearStickAtSpawn)가 건너뛴 이야기 트리거를 영웅 위치까지 넓혀, 다음 갱신에서 발동하게 한다 → e */
  armSpawnTrigger(e, pass = this._spawnPass) {
    if (!e || !pass || e.dead) return e;
    const x1 = e.x + e.w;
    if (x1 <= pass.x1 && x1 > pass.x0) e.w = Math.ceil(pass.x1 - e.x) + 2;   // 원래 자리보다 앞에 있었고 지금은 영웅 뒤에 있는 트리거
    return e;
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
    const elite = opts.elite ?? (chance(this.diff.elite ?? 0) && id !== 'medusa_head' && ENEMIES[id]?.elite !== false);
    const e = new Enemy(id, fx, fy, { level: opts.level ?? this.stage.level, elite, diff: this.diff, facing: opts.facing ?? -1, params: opts.params });
    this.roomFoes++;   // [hook:feel]
    return this.add(e);
  }
  spawnPickup(type, x, y, data = {}) { return this.add(new Pickup(type, x, y, data)); }
  hittables() {
    return this.entities.filter((e) => (e.kind === 'enemy' || e.kind === 'boss' || (e.kind === 'prop' && e.takeHit)) && !e.dead && !e.hidden && !this.inUnrevealedFake(e));
  }
  enemies() { return this.entities.filter((e) => (e.kind === 'enemy' || e.kind === 'boss') && !e.dead && !e.hidden && !(e.dying > 0) && !this.inUnrevealedFake(e)); }
  /** 아직 드러나지 않은 가짜 벽 속에 있는가 (비밀 방 안의 개체는 그리지도, 때리지도 않는다) */
  inUnrevealedFake(e) {
    if (e === this.player) return false;
    const m = this.map, tx = Math.floor(e.cx / TILE), ty = Math.floor(e.cy / TILE);
    const t = m.typeAt(tx, ty);
    if (t === T.FAKE) return !m.revealed.has(m.idx(tx, ty));
    // [hook:gimmick] 드러나지 않은 비밀 공간 속 액체·가시·발판도 벽으로 그려진다 (render/tiles.js hiddenAt) — 그 속 적·아이템도 숨긴다
    return (t === T.LIQUID || t === T.SPIKE || t === T.ONEWAY) && !!this.tiles?.hiddenAt?.(tx, ty);
  }
  nearestEnemy(x, y, maxD = 9999) {
    let best = null, bd = maxD;
    for (const e of this.enemies()) { if (e.invuln) continue; const d = Math.hypot(e.cx - x, e.cy - y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ─────────────────────────── 업데이트 ───────────────────────────
  update(dt) {
    this.debugRects.length = 0;
    if (this.qualityNow() !== this.qualityApplied) this.applyQuality();
    this.rt += dt;   // [hook:feel]
    if (this.killSlowT > 0) this.killSlowT -= dt;   // [hook:feel]
    // 히트스톱: 월드 정지. 파티클은 0.3배속으로 피어나고, 흔들림·반동 스프링·화면 오버레이는 실제 시간으로 움직인다 (feel §4.1)
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.frozenRecent += dt;   // [hook:feel] 입력 버퍼 보정 (player.js bufWin)
      this.fx.update(dt * 0.3, this.map);   // [hook:feel]
      this.tickOverlays(dt);   // [hook:feel]
      this.camera.follow(this.player, dt * 0.3, false, dt);   // [hook:feel]
      return;
    }
    let sdt = dt;
    if (this.slowmo > 0) { this.slowmo -= dt; sdt = dt * this.slowmoScale; if (this.slowmo <= 0 || (this.slowScaleT > 0 && (this.slowScaleT -= dt) <= 0)) { this.slowmoScale = SLOWMO_BASE; this.slowScaleT = 0; } }   // [hook:feel] 처치 슬로모션 배율은 제 시간만큼만 (남은 타이머가 다음 슬로모션 배율을 끊지 않게 0 으로)
    else if (this.slowmoScale !== SLOWMO_BASE) this.slowmoScale = SLOWMO_BASE;   // [hook:feel] 누가 slowmo 를 0 으로 끊어도 다음 슬로모션은 기본 배율
    this.time += sdt;
    if (!this.cutscene && !this.cleared) this.run.time += dt;
    if (this.timeStop > 0) this.timeStop -= dt;
    this.bg.update?.(sdt, this);

    const holdFoeShots = this.timeStop > 0 || this.freezeEnemies;   // [hook:feel] 각성 중엔 적 탄도 멈춘다 (timeStop 과 같은 규칙, 회색 화면 없음)
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.dead && e !== this.player) continue; // 죽은 플레이어는 사망 연출(updateDeath)을 위해 계속 갱신
      if (holdFoeShots && e.kind === 'projectile' && e.team === 'enemy') continue;   // [hook:feel]
      e.update(sdt, this);
    }
    for (const d of this.debrisList) d.update(sdt, this.map);
    this.debrisList = this.debrisList.filter((d) => d.life > 0);
    const removed = this.entities.filter((e) => e.dead && e !== this.player);
    if (removed.length) {
      for (const e of removed) e.onRemove?.(this);
      this.entities = this.entities.filter((e) => !e.dead || e === this.player);
      this.platforms = this.platforms.filter((e) => !e.dead);
    }
    this.fx.update(sdt, this.map);
    this.gimmick?.update?.(sdt);   // [hook:gimmick] (world.cutscene 중에는 기믹이 스스로 진행을 멈춘다)
    this.style?.update?.(dt);   // [hook:feel]
    this.tickOverlays(dt);   // [hook:feel]
    this.pollBossPhase();   // [hook:awaken] 보스 페이즈 변화마다 각성 게이지 +15
    if (this.killPend.length) this.resolveKillSlow();   // [hook:feel] 처치 슬로모션 (마지막 적 > 정예 > 오버킬)
    if (this.frozenRecent > 0) this.frozenRecent = Math.max(0, this.frozenRecent - dt);   // [hook:feel] 초당 1초씩 감소
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
    this.camera.boss = this.arena && this.bossActive && this.boss && !this.boss.dead ? this.boss : null;   // 보스 경기장 구도 (R1-RUN-BOSSFRAME)
    this.camera.follow(p, dt);
    // 방 가장자리 출구
    if (!this.transitioning && !p.dead && !this.arena) {
      const r = this.room;
      if (r.exitRight && p.x > this.map.pxW - p.w * 0.5) this.gotoRoom(r.exitRight);
      else if (r.exitLeft && p.x < -p.w * 0.5) this.gotoRoom(r.exitLeft);
      else if (r.exitUp && p.y < -p.h * 0.5) this.gotoRoom(r.exitUp);
      else if (r.exitDown && p.y > this.map.pxH) this.gotoRoom(r.exitDown);
    }
    // 가짜 벽(비밀 통로): 플레이어가 들어서면 연결된 가짜 벽 전체가 드러남
    if (!p.dead) this.revealFake(p);
    // 보스 트리거
    if (this.arenaX !== undefined && !this.bossActive && !this.cleared && p.x > this.arenaX + TILE && this.room.boss) this.startBoss();
    // 스테이지 클리어 연출
    if (this.cleared) {
      this.clearT += dt;
      const b = this.boss, bossGone = !b || b.dead || !(b.dying > 0);
      if (((this.clearT > 4.2 && bossGone) || this.clearT > 7) && !this.exitCalled) { this.exitCalled = true; this.afterClear(); }
    }
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    // 조명 수집
    this.lighting.begin();
    for (const e of this.entities) if (!e.dead && !this.inUnrevealedFake(e)) e.lights?.(this.lighting);
    this.gimmick?.lights?.(this.lighting);   // [hook:gimmick]
  }

  // ─────────────────────────── 화면 오버레이 (필살기·각성 레이어) ───────────────────────────
  /**
   * world.overlays: 화면 좌표 레이어 {draw(ctx, vw, vh, world), update?(dt, world), life?, t, dead?}.
   * lighting·bg.drawFront·기믹 drawScreen 다음, 'top' 파티클 전에 배열 순서대로 그린다.
   * t 는 실제 시간으로 흐른다 (히트스톱 중에도). life 가 있으면 t ≥ life 에서, dead 가 true 면 곧바로 사라진다
   */
  addOverlay(o) { if (o) { o.t ??= 0; this.overlays.push(o); } return o; }   // [hook:feel]
  tickOverlays(dt) {
    const L = this.overlays;
    if (!L.length) return;
    for (const o of L) {
      o.t = (o.t ?? 0) + dt;
      try { o.update?.(dt, this); } catch (e) { o.dead = true; console.error('[world] overlay update', e); }
    }
    for (let i = L.length - 1; i >= 0; i--) { const o = L[i]; if (o.dead || (o.life != null && o.t >= o.life)) L.splice(i, 1); }
  }
  drawOverlays(ctx, vw, vh) {
    // 레터박스가 먼저 (MASTER_PLAN §1.7 #13: letterbox → grade → radial lines → impact frame) — 오버레이 글자는 띠 위에도 그릴 수 있다
    const lb = Math.min(vh * 0.2, this.letterbox || 0);
    if (lb > 0.5) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, lb); ctx.fillRect(0, vh - lb, vw, lb); }
    for (const o of this.overlays) {
      if (o.dead) continue;
      ctx.save();
      try { o.draw?.(ctx, vw, vh, this); } catch (e) { o.dead = true; console.error('[world] overlay draw', e); }
      ctx.restore();
    }
  }

  // ─────────────────────────── 렌더 ───────────────────────────
  render(ctx) {
    const cam = this.camera, vw = this.game.viewW, vh = this.game.viewH;
    // 배경·타일처럼 화면을 크게 덮는 층은 저품질 보간으로 그린다 (고품질 보간은 전체 화면 확대 시 매우 느림).
    // 아이콘·초상 등 크게 축소되는 이미지가 있는 개체 층은 원래 품질로 되돌린다.
    const q0 = ctx.imageSmoothingQuality;
    ctx.imageSmoothingQuality = 'low';
    const gm = this.gimmick;   // [hook:gimmick]
    if (gm?.bgFlip) { ctx.save(); ctx.translate(vw, 0); ctx.scale(-1, 1); this.bg.drawFar(ctx, cam, vw, vh, this.time); ctx.restore(); }   // [hook:gimmick] 거울 허상 페이즈
    else this.bg.drawFar(ctx, cam, vw, vh, this.time);
    ctx.save();
    cam.apply(ctx);
    this.bg.drawMid(ctx, cam, this.time);
    gm?.drawWorld?.(ctx, cam, 'under');   // [hook:gimmick] 타일 뒤 (용암 몸통)
    this.tiles.drawDecor(ctx, cam, this.time);
    this.tiles.draw(ctx, cam);
    gm?.drawWorld?.(ctx, cam, 'back');   // [hook:gimmick] 위상 칸·핏줄·상승 기류·포자 구름
    ctx.imageSmoothingQuality = q0;
    // 엔티티 (z 정렬)
    const list = this.entities.filter((e) => (!e.dead || e === this.player) && !e.hidden && !this.inUnrevealedFake(e) && (e.kind === 'player' || cam.visible(e.x, e.y, e.w, e.h, 200)));
    list.sort((a, b) => a.z - b.z);
    this.fx.draw(ctx, 'back');
    for (const e of list) if (e.z < 0) e.draw(ctx, this);
    for (const d of this.debrisList) this.drawDebris(ctx, d);
    for (const e of list) if (e.z >= 0) e.draw(ctx, this);
    ctx.imageSmoothingQuality = 'low';
    this.tiles.drawLiquid(ctx, cam, this.time, this.liquid);   // [hook:gimmick] 방별 액체
    gm?.drawWorld?.(ctx, cam, 'front');   // [hook:gimmick] 용암 수면·공허의 벽·기포 기둥
    this.fx.draw(ctx, 'front');
    if (this.game.debug) { ctx.strokeStyle = '#f00'; for (const r of this.debugRects) ctx.strokeRect(r.x, r.y, r.w, r.h); }
    ctx.restore();
    this.lighting.render(ctx, cam, vw, vh);
    this.bg.drawFront(ctx, cam, vw, vh, this.time);
    gm?.drawScreen?.(ctx, vw, vh);   // [hook:gimmick] 화면 색조·게이지 (world.hudHidden 이면 게이지는 기믹이 숨긴다)
    if (this.overlays.length || this.letterbox > 0) this.drawOverlays(ctx, vw, vh);   // [hook:feel] 레터박스·색보정·집중선·임팩트 프레임
    this.syncHudBand(cam, vw, vh);
    ctx.save(); cam.apply(ctx); this.fx.draw(ctx, 'top'); ctx.restore();
    if (this.timeStop > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, vw, vh); ctx.restore();
      ctx.fillStyle = 'rgba(80,100,200,0.12)'; ctx.fillRect(0, 0, vw, vh);
    }
    ctx.imageSmoothingQuality = q0;
  }
  /**
   * HUD 윗줄(초상·체력·하트·점수, 보일 때의 콤보 열과 위쪽 보스 바)을 월드 좌표로 fx 에 넘긴다: 데미지 숫자 기둥·판정 문구는
   * 그 아래로 비켜 그린다 (띄운 적의 큰 치명타가 이름·체력 바 뒤에 숨던 문제, R1-REQ-331). HUD 가 숨으면 끈다.
   */
  syncHudBand(cam, vw, vh) {
    const fx = this.fx;
    if (typeof fx?.setHudBand !== 'function') return;
    let L = null;
    if (!this.hudHidden) { try { L = HL.hudLayout?.(this, vw, vh) ?? null; } catch { L = null; } }
    const z = cam.zoom || 1, ox = cam.x + (cam.shakeX || 0), oy = cam.y + (cam.shakeY || 0);
    if (!L) { fx.setHudBand(null, 0, ox + vw / z / 2, vw / z / 2); return; }   // HUD 가 숨어도 화면 범위는 준다 (숫자 기둥 자리 찾기)
    const B = (this._hudBand ??= []);
    let n = 0;
    const put = (r) => {
      if (!r || !(r.w > 0) || !(r.h > 0)) return;
      const d = (B[n++] ??= { x0: 0, x1: 0, y0: 0, y1: 0 });
      d.x0 = ox + r.x / z; d.x1 = ox + (r.x + r.w) / z; d.y0 = oy + r.y / z; d.y1 = oy + (r.y + r.h) / z;
    };
    put(L.portrait); put(L.vitals); put(L.hearts); put(L.skills); put(L.ult); put(L.awGauge); put(L.score);
    if (this.awakenState?.ready) put(L.ready);
    if (this.companions?.hudRects?.length) put(L.companions);
    if ((this.combo?.n ?? 0) >= 2 || (this.style?.rank ?? 0) > 0) put(L.combo);
    if (L.bossShown && L.bossSlot === 'top') put(L.bossBar);
    if (Array.isArray(L.pad)) for (const r of L.pad) if (r && r.y + r.h < vh * 0.35) put(r);   // 터치: 위쪽 버튼 (일시정지·전체 화면)
    put(TOP_EDGE(vw));   // 화면 위끝: 높이 띄운 적의 숫자가 화면 밖으로 나가지 않게
    fx.setHudBand(B, n, ox + vw / z / 2, vw / z / 2);
  }
  drawDebris(ctx, d) {
    ctx.save(); ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.rotate(d.rot);
    ctx.globalAlpha = Math.min(1, d.life / 0.5);
    if (d.draw) d.draw(ctx, d); else { ctx.fillStyle = d.color; ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); }
    ctx.restore();
  }
  drawPlatform(ctx, p, crumble = false) {
    // 세로 그라데이션은 (종류, 높이)마다 원점 기준 하나를 만들어 두고 옮겨 칠한다 (매 프레임 새로 만들지 않게, R1-REQ-341E)
    const PG = (World._platGrad ??= new Map()), key = (crumble ? 'c' : 'm') + p.h;
    let g = PG.get(key);
    if (!g) {
      g = ctx.createLinearGradient(0, 0, 0, p.h);
      g.addColorStop(0, crumble ? '#7a6a58' : '#8a7a6a'); g.addColorStop(1, crumble ? '#3a2e24' : '#3a3440');
      if (PG.size > 16) PG.clear();
      PG.set(key, g);
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = g; ctx.fillRect(0, 0, p.w, p.h); ctx.restore();
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
    const guardian = !!attack?.tags?.includes('guardian');   // [hook:cmp] 수호신 공격: 콤보 시간 연장 없음·SP ×0.4·흡혈 없음 (companions §5)
    const n0 = this.combo.n;
    this.combo.n++;
    this.combo.dmg = (n0 === 0 ? 0 : (this.combo.dmg || 0)) + (info.dmg > 0 && Number.isFinite(info.dmg) ? info.dmg : 0);   // [hook:feel] 콤보 총 피해 (feel_hud 가 읽는다)
    if (!guardian) this.combo.t = this.combo.window = 2.6 + (this.hero.classId?.startsWith('lia_dancer') || this.hero.classId === 'lia_bladedancer' || this.hero.classId === 'lia_reaper' ? 1 : 0);
    else if (n0 === 0) this.combo.t = this.combo.window = 1.0;   // [hook:cmp]
    if (this.combo.n > this.combo.max) this.combo.max = this.combo.n;
    this.run.hits++;
    this.addScore(10 * (1 + Math.floor(this.combo.n / 10)));
    this.run.sp = Math.min(100, this.run.sp + (info.crit ? 2.4 : 1.4) * (1 + (p.stats.ultGain ?? 0) / 100) * (guardian ? 0.4 : 1));   // [hook:cmp]
    if (!guardian && p.stats.lifesteal > 0 && info.dmg > 0) p.heal(info.dmg * p.stats.lifesteal / 100, false);   // [hook:cmp]
    // [hook:feel] '{n} HIT!' 는 feel_hud 콤보 기둥 하나만 그린다 (머리 위 글자 중복 제거). 이정표 소리는 style.js 의 combo_milestone — 없을 때만 옛 'combo'
    if (this.combo.n % 25 === 0) { if (!SFX.combo_milestone) audio.sfx('combo'); bus.emit('combo', { count: this.combo.n }); }
    if (COMBO_MILESTONES.has(this.combo.n)) bus.emit('comboMilestone', { n: this.combo.n });   // [hook:feel]
    this.style?.onHit?.(info, attack, target);   // [hook:feel]
    this.awOnHit(target, info, attack);   // [hook:awaken]
    if (info.killed) this.overkillSlowmo(target, info, attack);   // [hook:feel]
    this.companions?.onHit(target, info, attack);   // [hook:cmp]
  }
  endCombo() {
    const n = this.combo.n;
    if (n >= 10) {
      const bonus = n * n * 5;
      this.addScore(bonus);
      this.fx.text(this.player.cx, this.player.y - 50, `COMBO BONUS +${bonus}`, { color: '#ffe070', size: 18, life: 1.4, vy: -50 });
    }
    const ri = n >= 10 ? (this.style?.rank ?? 0) : 0;   // [hook:feel] 스타일 보너스 rankIndex² × 500 — COMBO BONUS 와 함께 (10히트 이상). 1히트 콤보를 끊어 치며 높은 랭크로 점수·1UP 을 버는 것 방지
    if (ri > 0) { const sb = ri * ri * 500; this.addScore(sb); this.fx.text(this.player.cx, this.player.y - 72, `STYLE BONUS +${sb}`, { color: '#ffa640', size: 16, life: 1.4, vy: -50 }); }   // [hook:feel]
    if (n > (this.state.stats.maxCombo ?? 0)) this.state.stats.maxCombo = n;
    this.combo.best = Math.max(this.combo.best, n);
    this.combo.n = 0;
    this.combo.dmg = 0;   // [hook:feel]
  }
  addScore(n) {
    const s = Math.round(n * (this.diff.scoreMult ?? 1));
    this.run.score += s;
    // 점수 1UP 은 스토리 모드 전용 (아케이드는 모드별 목숨 규칙 유지, noExtraLives 로 끌 수 있음)
    if (this.mode !== 'story' || this.noExtraLives) return;
    let ups = 0;
    while (this.run.score >= this.nextExtraLife) { this.nextExtraLife += 30000; ups++; }
    if (ups > 0) {
      this.run.lives += ups;
      audio.sfx('extra_life');
      this.game.toast(ups > 1 ? `★ ${ups}UP! 목숨이 늘었다 ★` : '★ 1UP! 목숨이 늘었다 ★', '#ffe070');
    }
  }
  onEnemyKilled(e, attack) {
    this.run.kills++;
    this.state.stats.kills = (this.state.stats.kills ?? 0) + 1;
    this.state.bestiary[e.def.id] = (this.state.bestiary[e.def.id] ?? 0) + 1;
    const p = this.player;
    const expGain = Math.round(e.stats.exp * (1 + (p.stats.expBonus ?? 0) / 100));
    this.gainExp(expGain);
    this.companions?.onKill(e, expGain);   // [hook:cmp] 동료 경험치 분배
    this.addScore((e.def.score ?? 100) * (1 + this.combo.n / 20) * (e.elite ? 3 : 1));
    for (const d of rollEnemyLoot(this, e)) this.spawnPickup(d.type, e.cx, e.cy, d.data);
    if (this.hero.classId === 'lia_reaper') p.heal(p.stats.hp * 0.03, false);
    bus.emit('enemyKilled', { enemy: e, def: e.def, x: e.cx, y: e.cy, byPlayer: true });
    this.killFeel(e, attack);   // [hook:feel] [hook:awaken]
  }

  // ─────────────────────────── 처치 손맛·각성 게이지 (feel §4.9, §6.1) ───────────────────────────
  /** 다중 처치, 스타일, 각성 게이지, 처치 슬로모션 (마지막 적·정예) */
  killFeel(e, attack) {
    const kc = this.killChain;
    kc.n = this.rt - kc.t <= MULTI_KILL_WIN ? kc.n + 1 : 1; kc.t = this.rt;
    if (kc.n >= 2) this.style?.onEvent?.('multikill', { n: kc.n, pts: 60, enemy: e });   // [hook:feel] 두 번째부터 1마리당 +60
    this.style?.onKill?.(e, attack);   // [hook:feel]
    if (!awBlocked(attack)) this.addAw(e.elite ? 'elite' : 'kill');   // [hook:awaken]
    // 슬로모션은 이 프레임 끝(resolveKillSlow)에서 정한다: onDie 로 갈라지는 적(슬라임·엑토플라즘)의 새끼가 생긴 뒤에 '마지막 적'을 판정
    if (e.kind === 'enemy' && this.killSlowOK()) this.killPend.push({ e, over: false });   // [hook:feel]
  }
  /** F 등급·치명타 처치에서 초과 피해가 최대 체력의 50% 이상이면 표시만 해 둔다 (0.12초 0.4배속 + '오버킬!' 은 resolveKillSlow) */
  overkillSlowmo(target, info, attack) {
    if (target.kind !== 'enemy' || !(info.cls === 'F' || info.crit)) return;
    const k = this.killPend.find((q) => q.e === target);
    if (!k) return;
    const max = target.stats?.maxHp ?? target.stats?.hp ?? 0;
    const over = info.overkill ?? (info.hpBefore != null && max > 0 ? (info.dmg - info.hpBefore) / max : null);
    if (over >= 0.5) k.over = true;
  }
  /**
   * 이번 프레임 처치들의 슬로모션 (1.5초에 한 번, 우선순위 마지막 적 > 정예 > 오버킬).
   * 마지막 적: 이 방에 적이 3마리 이상 나왔고 남은 적이 없다. 숨은 소환 둥지(메두사 둥지 등)가 남아 있으면 방이 비지 않은 것으로 본다
   */
  resolveKillSlow() {   // [hook:feel]
    const pend = this.killPend;
    this.killPend = [];
    if (!pend.length || !this.killSlowOK()) return;
    const gone = new Set(pend.map((q) => q.e));
    const e = pend[pend.length - 1].e;
    const last = this.roomFoes >= 3 && !this.entities.some((o) => o.kind === 'enemy' && !gone.has(o) && !o.dead && !(o.dying > 0) && !this.inUnrevealedFake(o));
    if (last) {
      this.killSlowmo(e, 0.3, 0.25, 1.08, 1);
      this.style?.onEvent?.('lastkill', { pts: 50, enemy: e });   // [hook:feel]
      const mat = e.def?.material;   // 피·먼지 ×1.5 (fx.burst 가 품질 배율을 곱한다: 15 / 11 / 8)
      this.fx.burst(mat === 'flesh' || mat === 'slime' || !mat ? 'blood' : 'dust', e.cx, e.cy, 15, { speed: 300, ...(mat === 'slime' ? { color: '#6adf4a' } : {}) });
      return;
    }
    const el = pend.find((q) => q.e.elite);
    if (el) { this.killSlowmo(el.e, 0.2, 0.3, 1.05, 0.6); return; }
    const ov = pend.find((q) => q.over);
    if (!ov) return;
    this.killSlowmo(ov.e, 0.12, 0.4, 0, 0);
    if (this.game.settings?.showDamage !== false) this.fx.text(ov.e.cx, ov.e.y - 34, '오버킬!', { color: '#ff5a4a', size: 18, life: 0.6, vy: -70 });
  }
  /** 처치 슬로모션 허용: 컷신(필살기·각성 포함)·보스전·클리어·적 정지 중이 아니고 1.5초 간격 */
  killSlowOK() {
    return this.killSlowT <= 0 && !this.cutscene && !this.bossActive && !this.cleared && !this.freezeEnemies && this.mode !== 'town' && !this.player?.dead;
  }
  killSlowmo(e, dur, scale, zoom, vol) {
    this.killSlowT = KILL_SLOW_GAP;
    this.slowmo = Math.max(this.slowmo, dur); this.slowmoScale = scale; this.slowScaleT = dur;
    if (zoom > 1) {
      this.camera.zoomPulse(zoom, 0.08, 0.15, 0.2);
      this.camera.focus = { x: e.cx, y: e.cy, t: 0.45, w: 0.3 };
    }
    if (vol > 0) audio.sfx(audio.has?.('kill_slowmo') ? 'kill_slowmo' : 'hit_heavy', { vol, pitch: audio.has?.('kill_slowmo') ? 1 : 0.6 });
  }
  /** 각성 게이지 증가 (0..100). v = AW_GAIN 이름 또는 수치. 1차 전직(tier ≥ 1) 전에는 쌓이지 않는다. ultGain 배율 1 + ultGain/200 */
  addAw(v) {   // [hook:awaken]
    const n = typeof v === 'number' ? v : awGain(v);
    if (!(n > 0) || !this.awEnabled()) return 0;
    const before = this.run.aw ?? 0;
    this.run.aw = Math.min(awGain('max'), before + n * (1 + (this.player?.stats?.ultGain ?? 0) / awGain('ultGainDiv')));
    return this.run.aw - before;
  }
  awEnabled() { return (CLASSES[this.hero?.classId]?.tier ?? 0) >= awGain('minTier') && this.mode !== 'town'; }   // [hook:awaken]
  /** 적중당 각성 게이지: 일반 +0.5, 치명타 +1, 반격·띄우기 +3 (필살기·각성기·동료 타격은 0) */
  awOnHit(target, info, attack) {   // [hook:awaken]
    if (awBlocked(attack)) return;
    let g = info.crit ? awGain('crit') : awGain('hit');
    if (info.counter) g += awGain('counter');
    // 띄우기: impact.js 가 있으면 실제로 뜬 경우만 (info.launched — 무거운·고정·비행 적, 처치 타격 제외). 없으면 옛 판정
    else if (info.cls ? info.launched : attack?.launch && target.kind === 'enemy') g += awGain('launch');
    this.addAw(g);
  }
  /** 보스 페이즈가 올라갈 때마다 각성 게이지 +15 (보스 파일을 고치지 않고 폴링) */
  pollBossPhase() {   // [hook:awaken]
    const b = this.boss;
    if (!b || !this.bossActive || b.dead || this.cleared) { this.bossPhaseOf = null; return; }
    const ph = b.phase ?? 0;
    if (this.bossPhaseOf !== b) { this.bossPhaseOf = b; this.bossPhaseSeen = ph; return; }
    if (ph > this.bossPhaseSeen) this.addAw('phase');
    this.bossPhaseSeen = ph;
  }
  gainExp(n) {
    if (n <= 0) return;
    const ups = addExp(this.hero, n);
    if (ups > 0) {
      const p = this.player;
      p.refreshStats();
      if (!p.dead) { p.hp = p.stats.hp; p.mp = p.stats.mp; }
      audio.sfx('levelup');
      this.fx.ring(p.cx, p.cy, { color: '#ffe070', r0: 10, r1: 120, life: 0.6, width: 6 });
      this.fx.burst('holy', p.cx, p.cy, 40, { speed: 260 });
      this.banner = { text: 'LEVEL UP!', sub: `Lv.${this.hero.level} — 스킬 포인트 획득`, t: 2.2, color: '#ffe070' };
    }
    return ups;
  }
  onPlayerHurt(dmg) {
    this.run.damageTaken += dmg;
    if (this.combo.n > 0) this.endCombo();
    this.style?.onHurt?.(dmg);   // [hook:feel] 스타일 한 랭크 하락
    this.game.vignette?.('#ff0020', 0.45, 3);   // [hook:feel] 가장자리 붉은 비네트
    if (dmg >= (this.player?.stats?.hp ?? Infinity) * awGain('rageFrac')) this.addAw('rage');   // [hook:awaken] 분노: 최대 HP 10% 이상 피격
  }
  healPlayer(frac, mpToo = false) {
    const p = this.player;
    p.heal(p.stats.hp * frac);
    if (mpToo) p.mp = p.stats.mp;
    p.mount?.healFrac?.(frac ?? 1);   // [hook:cmp]
  }

  // ─────────────────────────── 드롭/수집 ───────────────────────────
  dropFromCandle(x, y, big) {
    for (const d of rollCandleLoot(this, big)) this.spawnPickup(d.type, x, y, d.data);
  }
  openChest(chest) {
    if (chest.key) this.state.progress.secrets.push(chest.key);
    // 숨겨진 상자(벽 틈)는 내용물을 플레이어 쪽으로 튀기고, 가까이 가면 날아오게 함
    const side = Math.sign(this.player.cx - chest.cx) || 1;
    const extra = chest.hiddenNiche ? { vx: side * rand(60, 160), pull: 140 } : {};
    for (const d of rollChestLoot(this, chest.contents)) this.spawnPickup(d.type, chest.cx, chest.y, { ...extra, ...d.data });
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
        this.gimmick?.cleanse?.(30);   // [hook:gimmick] 부패 게이지 정화 (회복 감소가 풀린 뒤 회복)
        const got = p.heal(p.stats.hp * (d.heal ?? 0.25));
        p.mount?.healFrac?.(d.heal ?? 0.25);   // [hook:cmp]
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
        if (base?.starShard || base?.worldHeart) this.collectP2Key(base, it.baseId);   // [hook:p2] 별의 조각·세계의 심장 (world2 §3.9)
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
  /** 2부 핵심 아이템 기록 + 배너 + 버스 이벤트 (예전 세이브는 배열이 없을 수 있다) */
  collectP2Key(base, id) {   // [hook:p2]
    const st = this.state, pr = st.progress;
    pr.flags ??= {};
    if (base.starShard) {
      pr.shards ??= [];
      if (!pr.shards.includes(id)) {
        pr.shards.push(id); const n = pr.shards.length;
        audio.sfx('secret'); this.game.flash('#fff2b0', 0.6, 2);
        this.banner = { text: '별의 조각', sub: `${base.name} (${n}/6)`, t: 3.5, color: '#fff2b0', big: true };
        if (n >= 6) pr.flags.stars_all = true;
        bus.emit('shardFound', { id });
      }
    }
    if (base.worldHeart) {
      pr.hearts ??= [];
      if (!pr.hearts.includes(id)) {
        pr.hearts.push(id); const n = pr.hearts.length;
        audio.sfx('powerup');
        this.banner = { text: '세계의 심장', sub: `${base.name} (${n}/6)`, t: 3.5, color: base.color ?? '#ff8a9a', big: true };
        if (n >= 6) pr.flags.hearts_all = true;
        bus.emit('heartFound', { id });
      }
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
      // 부순 벽 뒤가 가짜 벽으로 메운 비밀 공간이면 함께 드러낸다 (예: s07 r4)
      for (const [nx, ny] of [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]]) {
        if (m.typeAt(nx, ny) === T.FAKE && !m.revealed.has(m.idx(nx, ny))) this.revealFakeAt(nx, ny, tx * TILE + TILE / 2, ty * TILE + TILE / 2);
      }
      const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
      audio.sfx('break_wall');
      this.camera.shake(4, 0.15);
      for (let i = 0; i < 6; i++) this.debrisList.push(new Debris(x + rand(-12, 12), y + rand(-12, 12), rand(-240, 240), rand(-420, -120), { size: randi(6, 12), color: '#5a5460', life: 2.2 }));
      this.fx.burst('dust', x, y, 10, { speed: 120 });
      // 드롭은 트인 쪽(양쪽 다 트였으면 플레이어 쪽)으로 튀어나오게 — 1칸 벽 틈에 갇혀 못 줍는 문제 방지
      const openL = !isSolidType(m.typeAt(tx - 1, ty)), openR = !isSolidType(m.typeAt(tx + 1, ty));
      const pside = Math.sign(this.player.cx - x) || 1;
      const side = openL && openR ? pside : openR ? 1 : openL ? -1 : pside;
      const niche = isSolidType(m.typeAt(tx, ty - 1)) && isSolidType(m.typeAt(tx, ty + 1));
      const out = { vx: side * 150, ...(niche ? { pull: 140 } : {}) };
      const hOrder = kind === 'H' ? m.markers.filter((mk) => mk.ch === 'H').findIndex((mk) => mk.tx === tx && mk.ty === ty) : -1;
      if (this.state.progress.secrets.includes(key)) {
        // 예전에 벽을 부쉈지만 비전서를 줍지 못한 세이브 복구: 이 벽에 지정된 비전서가 아직 없으면 다시 떨어뜨림
        const lost = kind === 'H' ? this.room.docs?.[hOrder] : null;
        if (lost && !this.state.progress.docs.includes(lost) && !this.entities.some((e) => e.kind === 'pickup' && !e.dead && e.data?.docId === lost)) this.spawnPickup('doc', x, y, { docId: lost, vy: -300, ...out, pull: 140 });
        continue;
      }
      this.state.progress.secrets.push(key);
      this.run.secrets++;
      if (kind === 'H') {
        const docs = this.stage.docs || [];
        const docId = this.room.docs?.[hOrder] ?? docs.find((dd) => !this.state.progress.docs.includes(dd));
        if (docId) { this.spawnPickup('doc', x, y, { docId, vy: -300, ...out, pull: 140 }); audio.sfx('secret'); this.game.toast('숨겨진 공간을 발견했다!', '#ffe7a0'); }
        else this.spawnPickup('food', x, y, { heal: 0.5, icon: 'meat', vy: -200, ...out });
        bus.emit('secretFound', { stageId: this.stage.id, key });
      } else if (kind === 'K') {
        const c = new Chest(tx, ty, this.room.hiddenChest ?? null);
        c.y = (ty + 1) * TILE - c.h;
        c.hiddenNiche = true;
        this.add(c); audio.sfx('secret');
        this.game.toast('숨겨진 보물을 발견했다!', '#ffe7a0');
        bus.emit('secretFound', { stageId: this.stage.id, key });
      } else {
        // 'B': 벽 고기(클래식) 또는 골드
        if (chance(0.55)) this.spawnPickup('food', x, y, { heal: 0.4, icon: 'meat', vy: -250, ...out });
        else this.spawnPickup('gold', x, y, { amount: randi(30, 80) * (this.stage.level ?? 1), vy: -250, ...out });
        this.addScore(500);
      }
    }
    // 가짜 벽: 닿으면 드러남
  }
  revealFake(p) {
    const m = this.map;
    const l = Math.floor((p.x + 4) / TILE), r = Math.floor((p.x + p.w - 4) / TILE);
    const t = Math.floor((p.y + 4) / TILE), b = Math.floor((p.y + p.h - 2) / TILE);
    for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) {
      if (m.typeAt(tx, ty) !== T.FAKE || m.revealed.has(m.idx(tx, ty))) continue;
      this.revealFakeAt(tx, ty, p.cx, p.cy);
      return;
    }
  }
  /** (tx,ty)에서 이어진 가짜 벽 덩어리를 드러낸다 (비밀 발견 처리 포함) */
  revealFakeAt(tx, ty, fxX, fxY) {
    const m = this.map;
    {
      // 연결된 가짜 벽 flood fill
      const stack = [[tx, ty]];
      let n = 0;
      while (stack.length && n < 400) {
        const [x, y] = stack.pop();
        const i = m.idx(x, y);
        if (x < 0 || y < 0 || x >= m.w || y >= m.h || m.revealed.has(i) || m.tiles[i] !== T.FAKE) continue;
        m.revealed.add(i); n++;
        this.tiles.invalidate(x, y);
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
      const key = `${this.stage.id}:${this.roomId}:fake${tx},${ty}`;
      audio.sfx('secret');
      this.fx.burst('dust', fxX, fxY, 14, { speed: 120 });
      if (!this.state.progress.secrets.includes(key)) { this.state.progress.secrets.push(key); this.run.secrets++; this.addScore(1000); this.game.toast('비밀 통로를 발견했다!', '#ffe7a0'); bus.emit('secretFound', { stageId: this.stage.id, key }); }
    }
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
    p.mount?.healFrac?.(1);   // [hook:cmp]
    this.run.checkpoint = { roomId: this.roomId, x: sp.x, y: sp.bottom - p.h };
    if (this.arcade) {
      // 아케이드(연습 등)는 임시 상태라 세이브 슬롯에 기록하지 않음 — 회복·체크포인트만
      audio.sfx('heal');
      this.fx.burst('blood', sp.cx, sp.cy, 10, { speed: 60, color: '#ff3050' });
      this.game.toast('체력과 마력이 회복되었다 (연습 중에는 저장되지 않는다)', '#ffb0b0');
      return;
    }
    this.syncToState();
    this.state.lastStage = { stageId: this.stage.id, roomId: this.roomId };
    saves.write(this.state.slot, this.state);
    audio.sfx('save');
    this.game.flash('#ff2040', 0.4, 3);
    this.fx.burst('blood', sp.cx, sp.cy, 10, { speed: 60, color: '#ff3050' });
    this.game.toast('저장 완료 — 체력과 마력이 회복되었다', '#ffb0b0');
  }
  talkTo(npc) {
    this.banner = null; // 대화 중엔 월드가 멈춰 배너가 초상화 위에 계속 남으므로 치움
    bus.emit('npcTalk', { npcId: npc.npcId });
    this.game.push('dialogue', { npc: npc.npcId, world: this });
  }
  playScript(id, flagKey) {
    if (!id) return;
    if (!this.state.progress.seenScripts.includes(id)) this.state.progress.seenScripts.push(id);
    this.banner = null; // 대화 중엔 월드가 멈춰 배너가 초상화 위에 계속 남으므로 치움
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
    if (p.mount?.riding) p.mount.dismount?.(this, p, 'fall');   // [hook:cmp]
    const dmg = Math.ceil(p.stats.hp * 0.25);
    p.hp -= dmg;
    this.run.damageTaken += dmg;
    audio.sfx('hurt');
    if (p.hp <= 0) { p.hp = 0; p.y = this.map.pxH + 40; p.die(this); p.vy = 0; return; }
    // 가까운 안전 지점으로 복귀: 마지막으로 딛고 선 단단한 땅 (없으면 체크포인트)
    const cp = p.safeSpot?.roomId === this.roomId ? p.safeSpot : this.run.checkpoint;
    p.x = cp.x; p.y = cp.y; p.vx = 0; p.vy = 0; p.iframes = 1.5;
    this.game.flash('#000', 0.6, 3);
    this.gimmick?.onFell?.(p);   // [hook:gimmick] (용암 수위 낮추기 등, 안전 지점으로 옮긴 뒤)
  }
  onPlayerDeath() {
    // 보스를 쓰러뜨린 뒤(또는 쓰러지는 도중 남은 보조무기로 보스를 끝낸 경우) 이미 클리어한 스테이지:
    // 목숨을 쓰거나 게임오버를 띄우지 않고 그 자리에서 일으켜 세운다 → afterClear 가 결과 화면까지 이어 간다
    if (this.cleared) { this.reviveAfterClear(); return; }
    this.run.lives--;
    this.state.stats.deaths = (this.state.stats.deaths ?? 0) + 1;
    if (this.run.lives > 0) {
      this.game.fadeOut(() => this.respawn(), 0.5);
    } else {
      this.syncToState();
      this.game.push('gameover', { world: this });
    }
  }
  /** 클리어 뒤 쓰러진 플레이어를 제자리에서 부활 (구덩이 아래로 떨어졌다면 체크포인트로) */
  reviveAfterClear() {
    const p = this.player;
    if (!p) return;
    if (!this.entities.includes(p)) this.add(p);
    p.dead = false; p.deathHandled = false; p.deathT = 0;
    p.hp = Math.max(1, Math.ceil(p.stats.hp * 0.5));
    p.vx = 0; p.vy = 0; p.iframes = Math.max(p.iframes ?? 0, 3);
    if (p.y > this.map.pxH - p.h) { const cp = this.run.checkpoint; p.x = cp.x; p.y = cp.y; }
    p.setAnim?.('idle');
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
    this.resetBoss();
    this.combo.n = 0; this.combo.dmg = 0;   // [hook:feel]
    this.banner = { text: 'READY?', sub: `남은 목숨 ${this.run.lives}`, t: 1.6, color: '#ffe7a0' };
    this.freezeEnemies = false; this.hudHidden = false; this.letterbox = 0;   // [hook:feel] 연출 도중 쓰러졌을 때 남지 않게
    this.gimmick?.onRespawn?.();   // [hook:gimmick]
    this.companions?.onRespawn();   // [hook:cmp]
  }

  // ─────────────────────────── 보스 ───────────────────────────
  startBoss() {
    this.bossActive = true;
    const m = this.map;
    const x0 = this.arenaX, x1 = m.pxW;
    // 카메라는 경기장 왼쪽 경계보다 한 칸 더 보여 줌 (경계에 붙은 캐릭터·글자가 화면 끝에서 잘리지 않게)
    const camX0 = Math.max(0, x0 - TILE);
    this.arena = { x0, x1, cam: { x: camX0, y: 0, w: x1 - camX0, h: m.pxH } };
    // 보스전 중 사망 시 경기장 안쪽(왼쪽 경계에서 두 칸)에서 부활
    const p = this.player, rtx = Math.floor((x0 + TILE * 2) / TILE);
    const gy = m.groundBelow(rtx, Math.max(0, Math.floor(Math.min(p.y, this.run.checkpoint.y) / TILE))) ?? (p.y + p.h);
    this.run.checkpoint = { roomId: this.roomId, x: rtx * TILE + TILE / 2 - p.w / 2, y: gy - p.h };
    // 3인칭 카메라: 경기장 높이가 화면보다 크면 살짝 줌아웃해 보스 전신이 보이게
    this.camera.zoomTarget = clamp(this.game.viewH / (m.pxH - TILE), 0.74, 1);
    const id = this.room.bossId ?? this.stage.boss;
    const bx = x0 + (x1 - x0) * 0.72;
    const by = (m.h - 2) * TILE;
    this.bossSpawn = { id, x: bx, y: by };
    this.boss = createBoss(this, id, bx, by);
    this.add(this.boss);
    this.companions?.onBossStart(this.boss);   // [hook:cmp] (noMount 보스면 하차)
    this.camera.floorY = this.arenaFloorY(x0, x1) ?? by;   // [hook:plat] 높은 경기장에서도 바닥이 화면 아래쪽에 보이게
    audio.stopMusic(0.5);
    this.cutscene = true;
    const intro = () => {
      this.cutscene = true;
      audio.sfx('warning');
      this.game.push('bossIntro', { bossId: id, world: this, onDone: () => { this.cutscene = false; this.addAw('bossIntro'); audio.music(this.boss?.def?.music ?? 'boss'); } });   // [hook:awaken] 보스 등장 +25
    };
    const preId = `${id}_pre`;
    if (SCRIPTS[preId] && !this.state.progress.seenScripts.includes(preId) && this.mode === 'story') {
      this.state.progress.seenScripts.push(preId);
      this.game.push('dialogue', { script: preId, world: this, onEnd: intro });
    } else intro();
  }
  /** 경기장 바닥 높이(px): 경기장 칸들에서 맨 아래 단단한 땅 윗면의 중앙값 (구덩이·발판에 흔들리지 않게) */
  arenaFloorY(x0, x1) {   // [hook:plat]
    const m = this.map, ys = [];
    for (let tx = Math.max(0, Math.floor(x0 / TILE)); tx < Math.min(m.w, Math.ceil(x1 / TILE)); tx++) {
      for (let ty = m.h - 1; ty > 0; ty--) if (isSolidType(m.typeAt(tx, ty)) && !isSolidType(m.typeAt(tx, ty - 1))) { ys.push(ty * TILE); break; }
    }
    if (!ys.length) return null;
    ys.sort((a, b) => a - b);
    return ys[ys.length >> 1];
  }
  /** 플레이어 부활 시 보스전 초기화: 체력 회복 + 페이즈 되돌리기 */
  resetBoss() {
    const b = this.boss;
    if (!b || b.dead || b.dying > 0) return;
    if (b.phase > 0 && b.rebuildOnRetry && this.bossSpawn) {
      // A계열 보스는 페이즈 변형(하마·분리·쌍두 등)을 되돌리는 훅이 없어 새로 만든다 (B계열은 think()에서 onReset)
      for (const e of this.entities) if (e !== b && e !== this.player && (e.owner === b || e.summoner === b)) e.dead = true;
      b.dead = true;
      const nb = createBoss(this, this.bossSpawn.id, this.bossSpawn.x, this.bossSpawn.y);
      nb.rest?.(1.2);
      this.boss = this.add(nb);
      return;
    }
    if (b.phase > 0) {
      // 새로 만들지 않는 보스(B계열): 마지막 페이즈의 탄·판정·장판이 부활 직후까지 남지 않게 치운다
      // (ABoss.onDeath 와 같은 규칙. 눈·분신처럼 형태에 딸린 부위는 보스의 onReset 이 되돌린다)
      for (const e of this.entities) {
        if (e === b || e === this.player || e.dead) continue;
        if ((e.owner === b || e.boss === b) && BOSS_TRANSIENT.has(e.kind)) e.dead = true;
      }
    }
    b.hp = b.stats.maxHp;
  }
  onBossDefeated(boss) {
    if (this.cleared) return;
    this.cleared = true; this.clearT = 0;
    this.slowmo = 1.6; this.slowmoScale = SLOWMO_BASE;   // [hook:feel] 보스 격파 슬로모션은 기존 배율 그대로
    this.game.flash('#ffffff', 1, 1.2);
    this.camera.shake(16, 1.2);
    audio.stopMusic(0.3);
    audio.sfx('boss_die');
    const st = this.state;
    if (!st.progress.bosses.includes(boss.def.id)) st.progress.bosses.push(boss.def.id);
    st.progress.flags['boss_' + boss.def.id] = true;
    st.stats.bossKills = (st.stats.bossKills ?? 0) + 1;
    const lvUp = this.gainExp(Math.round((boss.stats.exp ?? 500) * (1 + (this.player.stats.expBonus ?? 0) / 100)));
    this.companions?.onBossDefeated(boss);   // [hook:cmp] 유대 +10, 보스 경험치 분배
    // STAGE CLEAR 배너가 LEVEL UP 배너를 덮으므로 레벨업은 토스트로 따로 알림
    if (lvUp > 0) this.game.toast(`LEVEL UP! Lv.${this.hero.level} — 스킬 포인트 획득`, '#ffe070', 3.2);
    this.addScore((boss.def.score ?? 20000));
    for (const d of rollBossLoot(this, boss)) this.spawnPickup(d.type, boss.cx + rand(-40, 40), boss.cy, d.data);
    for (let i = 0; i < 20; i++) setTimeout(() => this.fx.burst('fire', boss.cx + rand(-80, 80), boss.cy + rand(-80, 80), 8, { speed: 200 }), i * 60);
    bus.emit('bossKilled', { bossId: boss.def.id, stageId: this.stage.id, time: this.run.time });
    this.banner = { text: 'STAGE CLEAR', sub: boss.def.name + ' 격파!', t: 4, color: '#ffe070', big: true };
  }
  /** 클리어 연출이 끝난 뒤: (스토리) 보스의 마지막 대사 `<bossId>_post` 를 한 번 보여 주고 결과 화면으로 */
  afterClear() {
    if (this.player?.dead) this.reviveAfterClear(); // 사망 연출 도중 클리어 연출이 끝난 경우
    const id = this.boss?.def?.id;
    const postId = id ? `${id}_post` : null;
    const seen = this.state.progress.seenScripts;
    if (this.mode === 'story' && postId && SCRIPTS[postId] && !seen.includes(postId)) {
      seen.push(postId);
      this.banner = null;
      this.game.push('dialogue', { script: postId, world: this, onEnd: () => this.finishStage() });
      return;
    }
    this.finishStage();
  }
  /** 스테이지 종료 시 바닥에 남은 전리품(보스 드롭 등)을 자동 획득 */
  collectLeftovers() {
    let n = 0;
    for (const e of this.entities) {
      if (e.kind !== 'pickup' || e.dead || !['gold', 'item', 'oneup', 'doc'].includes(e.type)) continue;
      if (e.type === 'doc') {
        // 문서 장면은 띄우지 않고 기록만
        e.dead = true;
        const d = e.data, st = this.state;
        if (e.secretKey) st.progress.secrets.push(e.secretKey);
        if (d.docId && !st.progress.docs.includes(d.docId)) { st.progress.docs.push(d.docId); st.stats.docs = (st.stats.docs ?? 0) + 1; this.run.docsFound.push(d.docId); bus.emit('docFound', { docId: d.docId }); }
        if (d.loreId && !st.progress.lore.includes(d.loreId)) st.progress.lore.push(d.loreId);
      } else this.collect(e);
      n++;
    }
    if (n > 0) { this.player.refreshStats(); this.game.toast(`남은 전리품 ${n}개를 자동으로 챙겼다`, '#ffe070'); }
  }
  finishStage() {
    this.collectLeftovers();
    this.syncRun(); this.syncToState();
    audio.music('victory');
    this.game.go('results', { world: this });
  }
  startUltimate(p) {
    this.game.push('ultCutin', { charId: p.hero.charId, world: this });
  }
}
