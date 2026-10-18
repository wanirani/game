// 스테이지 런타임: 방 로딩, 엔티티 관리, 충돌/드롭/점수/콤보, 보스전, 방 이동, 렌더링
import { TILE } from '../core/game.js';
import { Camera } from '../core/camera.js';
import { Particles } from '../core/particles.js';
import { Lighting } from '../core/lighting.js';
import { T, Debris, isSolidType } from '../core/physics.js';
import { input } from '../core/input.js';
import { rand, randi, chance, clamp, overlap, TAU, pick, RNG, ease } from '../core/math.js';
import { audio, SFX } from '../core/audio.js';
import { bus } from '../core/events.js';
import { saves } from '../core/save.js';
import { getDiff, diffAllows, diffRank } from '../data/difficulty.js';
import { STAGES } from '../data/stages.js';
import { BOSSES } from '../data/bosses.js';
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
import { addItem, canAdd, queueLoot, deliverLoot } from './inventory.js';
import { currentHero } from './state.js';
import { createBackground } from '../render/background.js';
import { TileRenderer } from '../render/tiles.js';
import { drawHero } from '../render/hero.js';
import { createBoss, loadBoss } from './bosses/lazy.js';   // R1-REQ-229 (요청 #380): 보스 클래스를 정적으로 싣지 않는 입구 — bosses/index.js 가 불러와져 있으면 곧바로 진짜 보스, 아니면 대역(PendingBoss)이 받는 동안 자리를 지킨다
import { GenericBoss } from './bosses/boss.js';   // bossReady: 보스 모듈을 끝내 받지 못하면 대역을 대체 보스로 (lazy.js 도 이미 정적으로 싣는 기반 모듈)
import { SCRIPTS } from '../data/story.js';
import { CLASSES } from '../data/classes.js';
import { Style } from './style.js';   // [hook:feel]
import { AW_GAIN } from '../data/feel_hit.js';   // [hook:awaken]
import { createGimmick } from './gimmicks.js';   // [hook:gimmick]
import { CompanionSystem } from './companions.js';   // [hook:cmp]
import { touchpad } from '../core/touchpad.js';   // [hook:plat]
import * as HFX from '../render/hitfx.js';   // [hook:feel] 첫 타격 스프라이트 미리 굽기 (prewarmHitFx)
import * as HL from '../render/hud_layout.js';   // 데미지 숫자·판정 문구가 HUD 윗줄 뒤에 숨지 않게 (R1-REQ-331, syncHudBand)
import * as NG from './ngplus.js';   // [hook:ng] 회차 「피의 윤회」 세기 (docs/specs/ngplus.md §3)
import { firePerks, perkAny } from './class_perks.js';   // 직업 특성 훅 onHit·onKill·keepCombo (classes_t3 §3.4)
import * as BI from '../data/boss_intro.js';   // [s5:p4a] 보스 등장·격파 연출 표 (순수 데이터)
import { ULTFX } from '../render/ultfx.js';   // [s5:p4a] 격파 임팩트 프레임 — 내보낸 ULTFX.final 만 부른다 (ultfx.js 는 고치지 않는다)
import * as UI from '../core/ui.js';   // [s5:p4a] 붓글씨(FONT.brush) — 격파 낙관

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
/** 시련(mode 'trial') 에서 생기는 줍기 종류 (classes_t3 §9.2) — 골드·아이템·문서·1UP 은 생기지 않는다 */
const TRIAL_PICKUPS = new Set(['heart', 'food', 'sub', 'powerup']);
/** 각성 중 생긴 엔티티의 특성 부가 공격(attack/atk 에 proc: true, 상한 없음)에 그 각성의 보스 상한을 싣는다 (공유 객체를 고치지 않게 복사) */
function capProcAttack(e, cf) {
  try {
    const a = e.attack, b = e.atk;
    if (a && typeof a === 'object' && a.proc && !a.capFn && a.team === 'player') e.attack = { ...a, capFn: cf };
    if (b && typeof b === 'object' && b.proc && !b.capFn && b.team === 'player') e.atk = { ...b, capFn: cf };
  } catch { /* 읽기 전용 속성: 그대로 둔다 */ }
}
export function styleRank(n) { let r = STYLE_RANKS[0]; for (const s of STYLE_RANKS) if (n >= s.n) r = s; return r; }

// [playb] P06 레벨이 오르면 한 번: 「SP +1 — 메뉴 › 스킬」 (같은 처리 안에서 여러 레벨이 오르면 한 줄로 합친다).
//  아케이드·시련은 스킬 포인트를 쓰는 화면이 없으니 알리지 않는다. 스테이지·마을(의뢰 보상) 모두 bus 'levelUp' 으로 받는다
// [matrix] loud: 보스 처치처럼 LEVEL UP 배너가 STAGE CLEAR 에 가려지는 때 — 따로 띄우던 「LEVEL UP!」 토스트와 합쳐 한 줄로
//   「LEVEL UP! Lv.4 · SP +2 — 메뉴 › 스킬」 (replay: 두 토스트가 전리품 토스트와 함께 쌓였다)
const LV_SP = { sp: 0, queued: false, lv: 0, loud: false };
bus.on('levelUp', ({ level } = {}) => {
  LV_SP.sp += Number.isInteger(level) && level % 5 === 0 ? 2 : 1;   // progression.addExp 와 같은 규칙
  if (Number.isInteger(level)) LV_SP.lv = Math.max(LV_SP.lv, level);
  if (LV_SP.queued) return;
  LV_SP.queued = true;
  const run = () => {
    const n = LV_SP.sp, lv = LV_SP.lv, loud = LV_SP.loud, g = input.game;
    LV_SP.sp = 0; LV_SP.queued = false; LV_SP.lv = 0; LV_SP.loud = false;
    if (!g || !(n > 0) || g.state?.arcade || g.world?.arcade || g.world?.trial) return;
    g.toast(loud && lv ? `LEVEL UP! Lv.${lv} · SP +${n} — 메뉴 › 스킬` : `SP +${n} — 메뉴 › 스킬`, '#ffe070', 3.2);
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(run); else Promise.resolve().then(run);
});

// ═══════════ [s5:p4a] 「보스는 사건이다」 (plan §5 P4a) — 등장 연출 BossReveal · 격파 연출 BossFinale ═══════════
// 등장 (이야기 모드이고 보스방 입구 재도전이 아닐 때): world.startBoss 가 만들고(_pre 대사 동안에도 보스는 숨어 있다) bossIntro 장면이
//   begin()·finish() 로 이끈다. 장면은 updateBelow 라 월드가 살아 움직이고, 이 객체는 world.update 맨 앞에서 실제 시간으로 흐른다:
//   레터박스 → camera.cine(보스, ≤1.15, 0.6) → 보스 그리기 변형(BI.introOf: drop·rise·descend·emerge·assemble·fade) → 착지: 먼지 고리·속성 섬광·
//   빛·포효·흔들림(진동) → 장면이 이름판(첫 대면이면 초상화 카드)을 살아 있는 장면 위에 그린다. 전체 ≤ REVEAL.total, 0.8초부터 건너뛰기.
//   K3: 보스는 world.cutscene 으로만 붙잡는다 (보스 파일은 고치지 않는다). 그동안 다른 적·적 탄·적 판정은 갱신하지 않고(hold), 끝날 때
//   보스의 상태 시계(stateT)를 0 으로 돌려 예전처럼 월드가 멈춰 있던 것과 같은 첫 박자로 싸움이 시작된다.
//   보스 모듈을 받는 중(PendingBoss)이면 진짜 보스를 최대 REVEAL.readyWait 초 기다리고, 그래도 없으면 변형 없이 곧장 이름판으로 간다.
//   그리기 변형은 보스와 그 대리 개체(채색 PaintedBody·컬링 ArtCull: e.host === 보스)에만, world.render 가 drawEntity 로 입힌다.
/** 채색 키트 품질표 (kit.QUALITY) — 등장 연출 동안 발판 덧그리기를 잠시 끄는 데만 쓴다. 키트는 채색 보스가 이미 불러 두었으므로
 *  동적 import 는 캐시에서 바로 온다 (정적 import 로 월드의 의존을 늘리지 않는다) */
const PAINT_Q = { q: null, asked: false };
const LEDGE_OFF = [];
/** 연출 동안 조명 어둠 층 해상도를 0.25 배로 (필살기 감독 skills.js ultLightLow·ultLightRestore 와 같은 값·같은 규칙 — Stage 4 perf:
 *  어둠 층 래스터가 큰 빛·카메라 당김 프레임의 가장 큰 비용). 이미 그 이하면 그대로, 되돌릴 때 그사이 품질이 바뀌었으면 그 값을 둔다 */
const FX_LRES = 0.25;
function fxLightLow(w) {
  const L = w?.lighting;
  if (!L || !(Number(L.res) > FX_LRES + 0.005)) return null;
  const r = L.res;
  L.res = FX_LRES;
  return r;
}
function fxLightRestore(w, r) {
  const L = w?.lighting;
  if (L && r != null && L.res === FX_LRES) L.res = r;
}
function warmPaintQ() {
  if (PAINT_Q.asked) return;
  PAINT_Q.asked = true;
  import('../render/painted/kit.js').then((m) => { PAINT_Q.q = m?.QUALITY ?? null; }).catch(() => { /* 채색 키트가 없으면 덧그리기도 없다 */ });
}
class BossReveal {
  constructor(w, id) {
    this.w = w; this.id = id;
    const def = BOSSES[id];
    this.row = BI.introOf(id, def); this.el = BI.elementOf(id, def);
    this.t = 0; this.started = false; this.done = false; this.hold = true;
    this.tReady = null; this.tStart = null; this.tLand = null; this.plateAt = null; this.timedOut = false;
    this.dur = this.row.dur; this.flash = 0; this.lb = 0; this.lbOut = 0; this.sfxRoar = false;
    this.xf = { on: true, dy: 0, sx: 1, sy: 1, a: 0, clipY: null, px: 0, py: 0 };
    warmPaintQ();
    this.calc();
  }
  /** bossIntro 장면이 열릴 때: 시계 시작 · 레터박스 · 카메라 · HUD 숨김 · 진짜 보스 재촉 */
  begin() {
    if (this.started || this.done) return;
    const w = this.w, R = BI.REVEAL;
    this.started = true; this.t = 0;
    w.hudHidden = true;
    this.lres = fxLightLow(w);   // finish 에서 되돌린다
    const b = w.boss, cam = w.camera;
    if (b && cam) {
      const ab = typeof b.artBounds === 'function' ? b.artBounds({ x: 0, y: 0, w: 0, h: 0 }) : null;
      const h = Math.max(80, ab?.h > 0 ? ab.h : (b.h || 120) * 1.4);
      const fit = (w.game.viewH * 0.78) / h;   // 큰 보스는 전신이 담기도록 덜 당긴다
      const z = clamp(Math.min(R.camZoom, fit), Math.min(cam.zoomTarget || 1, 0.74), R.camZoom);
      this.camZ = z;
      try { cam.cine(b.x + b.w / 2, b.y + b.h - Math.min(h, w.game.viewH / z * 0.8) * 0.5, z, R.camIn); } catch (e) { console.warn('[reveal] cine', e); }
    }
    try { w.bossReady?.().then((rb) => { if (rb && this.tReady == null && this.started && !this.done) this.tReady = this.t; }, () => {}); } catch { /* update 가 대역 교체를 지켜본다 */ }
  }
  update(dt) {
    const w = this.w, R = BI.REVEAL;
    if (this.done) {   // 퇴장: 레터박스만 걷어 낸다 (싸움은 이미 시작)
      this.lbOut = Math.max(0, this.lbOut - dt / 0.3);
      if ((w.letterbox || 0) > 0) w.letterbox = this.lb * this.lbOut;
      if (this.lbOut <= 0) { w.letterbox = 0; if (w.reveal === this) w.reveal = null; }
      return;
    }
    if (!this.started) return;
    this.t += dt;
    const t = this.t, b = w.boss;
    this.lb = Math.round(w.game.viewH * R.letterbox);
    w.letterbox = this.lb * ease.outCubic(clamp(t / R.letterIn, 0, 1));
    if (this.tReady == null && b && !b.pendingBoss) this.tReady = t;
    if (this.tStart == null) {
      if (this.tReady != null && t >= R.start) {
        this.tStart = Math.max(R.start, this.tReady);
        this.dur = clamp(this.row.dur, 0.25, R.total - R.card - R.hold - this.tStart);
        this.onStart();
      } else if (t >= R.readyWait) { this.timedOut = true; this.tStart = t; this.dur = 0; }   // 모듈이 늦다: 변형 없이 곧장 이름판
    }
    if (this.tStart != null && this.tLand == null && t >= this.tStart + this.dur) this.land();
    if (this.tLand != null && this.plateAt == null) this.plateAt = this.tLand + (this.timedOut ? 0 : R.hold);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.calc();
  }
  /** 변형이 시작될 때 방식별 입자 (그리기 경로 밖) */
  onStart() {
    const w = this.w, b = w.boss, fx = w.fx, el = this.el;
    if (!b || !fx) return;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, fy = b.y + b.h;
    switch (this.row.style) {
      case 'emerge': fx.burst('smoke', cx, cy, 16, { jitter: b.w * 0.45, speed: 60, color: '#1a1020' }); fx.burst('dark', cx, cy, 10, { jitter: b.w * 0.4 }); break;
      case 'assemble':
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2, r = 180 + (i % 3) * 40;
          fx.emit(el.burst2 === 'shard' || el.burst === 'shard' ? 'shard' : 'magic', cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7,
            { vx: -Math.cos(a) * r / Math.max(0.3, this.dur * 0.8), vy: -Math.sin(a) * r * 0.7 / Math.max(0.3, this.dur * 0.8), speed: 0, grav: 0, drag: 1, life: Math.max(0.3, this.dur * 0.85), collide: false, ...(el.shardColor ? { color: el.shardColor } : {}) });
        }
        break;
      case 'rise': fx.burst('gravel', cx, fy - 4, 14, { jitter: b.w * 0.4, angle: -Math.PI / 2, spread: 0.7, speed: 320 }); fx.burst(el.burst2, cx, fy - 8, 10, { jitter: b.w * 0.4 }); break;
      case 'descend': fx.burst(el.mote, cx, b.y, 18, { jitter: b.w * 0.6, ...(el.moteColor ? { color: el.moteColor } : {}) }); break;
      case 'fade': fx.burst(el.mote, cx, cy, 20, { jitter: b.w * 0.5, ...(el.moteColor ? { color: el.moteColor } : {}) }); break;
      default: break;   // drop: 착지 때만
    }
  }
  /** 착지: 먼지 고리 · 속성 섬광 · 빛 · 포효 · 흔들림(bus 'shake' → 진동) */
  land(quiet = false) {
    if (this.tLand != null) return;
    this.tLand = this.t;
    const w = this.w, b = w.boss, fx = w.fx, el = this.el;
    if (!b || this.timedOut && b.pendingBoss) { if (!quiet) { audio.sfx('boss_roar'); w.camera?.shake?.(10, 0.6); } return; }
    const cx = b.x + b.w / 2, fy = b.y + b.h;
    if (fx) {
      fx.ering?.(cx, fy, { color: '#d8c8b0', r0: 20, r1: Math.max(220, b.w * 1.6), ry: 0.22, life: 0.55, width: 8 });
      fx.ring(cx, b.y + b.h * 0.45, { color: el.color, r0: 16, r1: Math.max(200, b.w * 1.3), life: 0.5, width: 6 });
      fx.burst('dust', cx, fy - 6, 18, { jitter: b.w * 0.55, speed: 140 });
      fx.burst(el.burst, cx, b.y + b.h * 0.45, 12, { jitter: b.w * 0.3, speed: 260, ...(el.shardColor ? { color: el.shardColor } : {}) });
    }
    this.flash = 1;
    if (!quiet) { audio.sfx('boss_roar'); w.camera?.shake?.(10, 0.6); }
  }
  /** 그리기 변형 (update 가 계산, render 가 drawEntity 로 입힌다 — 그리기 경로에서는 난수·입자 없음) */
  calc() {
    const X = this.xf, b = this.w.boss;
    if (!b || this.done) { X.on = false; return; }
    if (this.timedOut && this.tLand != null) { X.on = false; return; }
    X.px = b.x + b.w / 2; X.py = b.y + b.h;
    X.dy = 0; X.sx = 1; X.sy = 1; X.a = 1; X.clipY = null;
    const k0 = this.tStart == null ? 0 : this.dur > 0 ? clamp((this.t - this.tStart) / this.dur, 0, 1) : 1;
    const H = Math.max(80, b.h), V = this.w.game.viewH / (this.w.camera?.zoom || 1);
    const sinceLand = this.tLand == null ? -1 : this.t - this.tLand;
    switch (this.row.style) {
      case 'drop': {
        X.dy = -(V * 0.9 + H) * (1 - ease.inQuad(k0)); X.a = k0 > 0 ? 1 : 0;
        if (sinceLand >= 0 && sinceLand < 0.24) { const s = Math.sin((sinceLand / 0.24) * Math.PI); X.sy = 1 - 0.13 * s; X.sx = 1 + 0.1 * s; }
        break;
      }
      case 'rise': X.dy = H * 1.08 * (1 - ease.outCubic(k0)); X.clipY = X.py + 2; break;
      case 'descend': X.dy = -H * 1.1 * (1 - ease.outCubic(k0)); X.a = k0 > 0 ? 0.2 + 0.8 * k0 : 0; break;
      case 'emerge': { const k = ease.outCubic(k0); X.a = k; X.sx = X.sy = 0.86 + 0.14 * k; break; }
      case 'assemble': X.a = clamp(k0 * 2.5, 0, 1); X.sx = X.sy = 0.4 + 0.6 * ease.outBack(k0); break;
      case 'fade': { const f = 0.62 + 0.38 * Math.sin(this.t * 37) * Math.sin(this.t * 13 + 1); X.a = k0 >= 1 ? 1 : k0 * f; break; }
      default: break;
    }
    // 착지하고 잠깐 뒤에는 변형을 끈다 (그리기 비용 0)
    X.on = !(sinceLand > 0.3);
  }
  /** 이 개체를 변형해 그리나: 보스 자신과 그 대리 개체 */
  owns(e) { const b = this.w.boss; return !!b && (e === b || e.host === b); }
  drawEntity(ctx, e) {
    const X = this.xf;
    if (!(X.a > 0.01)) return;
    const moved = !!(X.dy || X.sx !== 1 || X.sy !== 1);
    // 채색 보스의 '발판 덧그리기'(kit.ledgesOver)는 타일을 몸 위에 다시 찍는다 — 몸을 옮겨 그리는 동안에는 타일이 엉뚱한 자리에
    // 찍히므로(유령 발판) 그 동안만 끈다. 진짜 타일은 이미 타일 층에 있다
    const Q = moved ? PAINT_Q.q : null, off = Q ? LEDGE_OFF : null;
    if (off) { off.length = 0; for (const k in Q) { const q = Q[k]; if (q && q.ledges !== false) { off.push(q); q.ledges = false; } } }
    ctx.save();
    try {
      if (X.clipY != null) { ctx.beginPath(); ctx.rect(X.px - 4000, X.clipY - 8000, 8000, 8000); ctx.clip(); }
      if (moved) { ctx.translate(X.px, X.py + X.dy); ctx.scale(X.sx, X.sy); ctx.translate(-X.px, -X.py); }
      if (X.a < 1) ctx.globalAlpha *= X.a;
      e.draw(ctx, this.w);
    } finally {
      ctx.restore();
      if (off) { for (const q of off) q.ledges = true; off.length = 0; }
    }
  }
  lights(L) {
    if (!this.started || this.done || !L) return;
    const b = this.w.boss;
    if (!b) return;
    const k0 = this.tStart == null ? 0 : this.dur > 0 ? clamp((this.t - this.tStart) / this.dur, 0, 1) : 1;
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.5;
    if (k0 > 0) L.add(cx, cy, 160 + 120 * k0, this.el.color, 0.35 + 0.35 * k0);
    if (this.flash > 0) L.add(cx, b.y + b.h, 260 + 340 * this.flash, this.el.glow, 0.6 + 0.9 * this.flash);
  }
  /** 끝 (장면이 닫힐 때 · 건너뛰기 · 방 이동): 변형·붙잡기를 풀고 카메라·HUD 를 돌려준다. 레터박스는 0.3초에 걸쳐 걷힌다 */
  finish(now = false) {
    if (this.done) return;
    this.done = true; this.hold = false; this.xf.on = false;
    const w = this.w;
    fxLightRestore(w, this.lres); this.lres = null;
    if (this.started) {
      try { w.camera?.cineEnd?.(0.45); } catch { /* 카메라 없음 */ }
      w.hudHidden = false;
      this.lbOut = now ? 0 : 1;
      if (now) { w.letterbox = 0; if (w.reveal === this) w.reveal = null; }
    } else if (w.reveal === this) w.reveal = null;
    const b = w.boss;
    if (b && !b.pendingBoss && Number.isFinite(b.stateT)) b.stateT = 0;   // 월드가 멈춰 있던 예전과 같은 첫 박자
  }
}

/** 격파 연출 (world.onBossDefeated): 속성 폭발 · 임팩트 프레임(ULTFX.final) · 카메라 밀어 넣기 · 「격파」 먹 낙관 · 금빛 알갱이 · 빛기둥 → (STAGE CLEAR 배너) */
const FIN = Object.freeze({ bursts: 20, per: 5, gap: 0.06, seal: 0.35, sealLife: 2.5, motes: [0.5, 2.6], pillar: [0.25, 2.6], camOut: 1.3, end: 3.2 });
class BossFinale {
  constructor(w, boss) {
    this.w = w; this.id = boss?.def?.id ?? null;
    this.el = BI.elementOf(this.id, boss?.def);
    this.cx = boss.cx; this.cy = boss.cy; this.fy = boss.y + boss.h; this.bw = Math.max(80, boss.w);
    this.t = 0; this.n = 0; this.moteAcc = 0; this.sealOn = false; this.camOn = false; this.camDone = false;
    this.lres = fxLightLow(w);   // 끝(FIN.end)·방 이동(stop)에서 되돌린다
    const fx = w.fx, el = this.el;
    // 0초: 속성 폭발 두 겹 + 속성 고리 (예전 'fire' 8개 ×20 = 160 자리 — 여기 22 + 연달아 5개 ×20 + 알갱이 ≈ 17: 예전보다 적게.
    //  큰 연기 입자(burst2)는 여기 한 번만 — 슬로모션 동안 오래 남아 그리기 비용이 크다)
    fx.burst(el.burst, this.cx, this.cy, 14, { speed: 380, jitter: this.bw * 0.25, ...(el.shardColor ? { color: el.shardColor } : {}) });
    fx.burst(el.burst2, this.cx, this.cy, 8, { speed: 240, jitter: this.bw * 0.3 });
    fx.ring(this.cx, this.cy, { color: el.color, r0: 20, r1: 340, life: 0.6, width: 10 });
    // 임팩트 프레임: 필살기 마무리와 같은 내보낸 함수 (번쩍임은 onBossDefeated 가 이미 했다 · 소리는 boss_die 하나로)
    try { ULTFX.final(w, this.cx, this.cy, { color: el.color, accent: el.glow, tier: 2, impact: true, flourish: false, silent: true, noFlash: true, shake: false }); } catch (e) { console.warn('[finale] ultfx', e); }
    // 카메라 밀어 넣기 (다른 연출이 구도를 잡고 있지 않을 때만)
    const cam = w.camera;
    if (cam && !cam.cineActive) { try { cam.cine(this.cx, this.cy, clamp((cam.zoom || 1) * 1.12, 0.6, 1.5), 0.35); this.camOn = true; } catch { /* 카메라 없음 */ } }
  }
  update(dt) {
    const w = this.w, fx = w.fx, el = this.el;
    this.t += dt;
    const t = this.t;
    while (this.n < FIN.bursts && t >= this.n * FIN.gap) {
      this.n++;
      fx.burst(el.burst, this.cx + rand(-80, 80), this.cy + rand(-80, 80), FIN.per, { speed: 200, ...(el.shardColor ? { color: el.shardColor } : {}) });
    }
    if (!this.sealOn && t >= FIN.seal) { this.sealOn = true; w.addOverlay(makeSealOverlay(this)); w.addOverlay(makePillarOverlay(this)); }
    if (t >= FIN.motes[0] && t < FIN.motes[1]) {
      this.moteAcc += dt * 8 * (fx.quality ?? 1);
      while (this.moteAcc >= 1) {
        this.moteAcc -= 1;
        const gold = Math.random() < 0.55;
        fx.emit(gold ? 'gold' : el.mote, this.cx + rand(-this.bw * 0.6, this.bw * 0.6), this.fy - rand(0, 40),
          { angle: -Math.PI / 2, spread: 0.35, speed: rand(60, 150), grav: -30, life: rand(1.0, 1.8), ...(!gold && el.moteColor ? { color: el.moteColor } : {}) });
      }
    }
    if (this.camOn && !this.camDone && t >= FIN.camOut) { this.camDone = true; try { w.camera?.cineEnd?.(0.6); } catch { /* */ } }
    if (t >= FIN.end && w.finale === this) { this.stop(); w.finale = null; }
  }
  /** 끝·방 이동: 낮춰 둔 조명 해상도를 되돌린다 (두 번 불러도 된다) */
  stop() { fxLightRestore(this.w, this.lres); this.lres = null; }
  lights(L) {
    if (!L) return;
    const t = this.t, k = clamp(1 - t / 1.2, 0, 1);
    if (k > 0) L.add(this.cx, this.cy, 140 + 260 * k, this.el.color, 0.3 + 1.0 * k);
    const p = pillarK(t);
    if (p > 0) for (let i = 0; i < 3; i++) L.add(this.cx, this.fy - 140 - i * 180, 150, this.el.glow, 0.7 * p);
  }
}
/** 빛기둥 세기 0..1 (오르고 → 머물고 → 사라짐) */
function pillarK(t) {
  const [a, b] = FIN.pillar;
  if (t < a || t > b) return 0;
  return Math.min(1, (t - a) / 0.25, (b - t) / 0.6);
}
/** 화면 층: 보스 자리에 세로 빛기둥 (3겹 사각형, 'lighter' — 그라디언트 없음) */
function makePillarOverlay(F) {
  return {
    kind: 'bossPillar', life: FIN.pillar[1] - FIN.seal + 0.05,
    draw(ctx, vw, vh, w) {
      const k = pillarK(F.t);
      if (!(k > 0.01)) return;
      const cam = w.camera, z = cam?.zoom || 1;
      const sx = (F.cx - (cam?.x ?? 0) - (cam?.shakeX ?? 0)) * z, sy = (F.fy - (cam?.y ?? 0) - (cam?.shakeY ?? 0)) * z;
      if (sx < -200 || sx > vw + 200) return;
      const base = Math.max(46, F.bw * 0.55 * z);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = F.el.glow;
      for (const [wk, a] of [[1.0, 0.07], [0.55, 0.12], [0.22, 0.3]]) {
        const ww = base * wk * (0.75 + 0.25 * k);
        ctx.globalAlpha = a * k;
        ctx.fillRect(sx - ww / 2, 0, ww, Math.max(0, sy));
      }
      ctx.globalAlpha = 0.5 * k; ctx.fillStyle = F.el.color;
      ctx.fillRect(sx - base * 0.9, sy - 5, base * 1.8, 6);
    },
  };
}
/** 낙관 테두리 흔들림 (보스 id 로 정해지는 값: 그리기 경로 난수 없음) */
function sealJitter(id) {
  let h = 2166136261;
  for (const c of String(id ?? 'boss')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const out = [];
  for (let i = 0; i < 16; i++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; out.push(((h >>> 0) % 1000) / 1000); }
  return out;
}
/** 화면 층: 「격파」 먹 낙관 (붉은 인주 네모 + 붓글씨 두 글자, 위에서 찍히듯 1.7 → 1배). 배너 부제가 다른 말이면(정화·결착 …) 그 말 */
function makeSealOverlay(F) {
  const J = sealJitter(F.id);
  const o = {
    kind: 'bossSeal', t: 0, life: FIN.sealLife, word: null,
    update() {
      if (o.word) return;
      const sub = String(F.w.banner?.sub ?? '');
      const m = /(\S+)!\s*$/.exec(sub);
      o.word = m && m[1].length === 2 ? m[1] : '격파';
    },
    draw(ctx, vw, vh, w) {
      const t = o.t, life = o.life;
      const kIn = clamp(t / 0.16, 0, 1), out = clamp((life - t) / 0.45, 0, 1);
      if (!(out > 0)) return;
      const cam = w.camera, z = cam?.zoom || 1;
      let x = clamp((F.cx - (cam?.x ?? 0)) * z + 70, vw * 0.22, vw * 0.78);
      let y = clamp((F.cy - (cam?.y ?? 0)) * z - 30, vh * 0.36, vh * 0.68);
      // 알림 칸(STAGE CLEAR · 전리품 배너)과 겹치지 않게: 칸 위로, 자리가 없으면 칸 옆으로 비킨다
      let B = null;
      try { B = w.hudHidden ? null : HL.hudLayout?.(w, vw, vh)?.transient ?? null; } catch { B = null; }
      if (B && B.w > 0) {
        const hs = 64;   // 도장 반 크기 + 여백 (찍힌 뒤 기준)
        if (y + hs > B.y && y - hs < B.y + B.h && x + hs > B.x && x - hs < B.x + B.w) {
          const up = B.y - hs - 6;
          if (up >= vh * 0.16) y = up;
          else if (B.x + B.w + hs + 8 <= vw - 8) x = B.x + B.w + hs + 4;
          else x = Math.max(hs + 8, B.x - hs - 4);
        }
      }
      const s = 1.7 - 0.7 * ease.outCubic(kIn), S = 108;
      ctx.translate(x, y); ctx.rotate(-0.13); ctx.scale(s, s);
      ctx.globalAlpha = (kIn < 1 ? 0.35 + 0.65 * kIn : 1) * out;
      // 먹 그림자 → 인주 네모 (흔들린 테두리)
      const edge = (dx, dy) => {
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const side = i >> 2, f = (i & 3) / 4, j = (J[i] - 0.5) * 7;
          const px = side === 0 ? -S / 2 + f * S : side === 1 ? S / 2 + j : side === 2 ? S / 2 - f * S : -S / 2 + j;
          const py = side === 0 ? -S / 2 + j : side === 1 ? -S / 2 + f * S : side === 2 ? S / 2 + j : S / 2 - f * S;
          if (i === 0) ctx.moveTo(px + dx, py + dy); else ctx.lineTo(px + dx, py + dy);
        }
        ctx.closePath();
      };
      edge(4, 5); ctx.fillStyle = F.el.ink; ctx.fill();
      edge(0, 0); ctx.fillStyle = '#b0102a'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,236,214,0.85)';
      ctx.strokeRect(-S / 2 + 9, -S / 2 + 9, S - 18, S - 18);
      // 두 글자 (세로)
      const word = o.word || '격파';
      const brush = !!UI.faceReady?.('BN Brush');
      ctx.font = brush ? `400 46px ${UI.FONT.brush}` : `900 38px ${UI.FONT.title}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff1dc';
      ctx.fillText(word[0] ?? '', 0, -S * 0.2);
      ctx.fillText(word[1] ?? '', 0, S * 0.22);
    },
  };
  return o;
}

export class World {
  constructor(game, stageId, opts = {}) {
    const { roomId = null, mode = 'story', onExit = null, rules = null, diffOver = null, levelOverride = null, trial = null } = opts ?? {};
    this.opts = opts ?? {};   // [s5:p4a] 만든 쪽이 준 옵션 그대로 (K2: opts.nightmare 가 있으면 보스 이름판이 진홍 「악몽」판)
    this.game = game;
    this.state = game.state;
    this.stage = typeof stageId === 'object' ? stageId : STAGES[stageId];
    if (!this.stage) throw new Error('Unknown stage ' + stageId);
    stageId = this.stage.id;
    this.mode = mode; // 'story' | 'bossrush' | 'survival' | 'practice' | 'tower' | 'town' | 'trial' (시련: trial = TRIALS 행, classes_t3 §9.2)
    this.diff = getDiff(this.state.difficulty);
    // 일일 도전 (docs/specs/online.md §2.5, front/arcade.js buildArcadeState): 난이도 배율 · 월드 규칙 · 시드 난수 (첫 방 소환 전에)
    const ar = this.state.arcade;   // [hook:plat]
    if (ar?.diffOver && typeof ar.diffOver === 'object') this.diff = { ...this.diff, ...ar.diffOver };   // [hook:plat]
    if (diffOver) this.diff = { ...this.diff, ...diffOver };   // 시련 등 호출부가 준 난이도 덮어쓰기 (classes_t3 §9.2)
    if (levelOverride) this.stage = { ...this.stage, level: levelOverride };   // 적 레벨 덮어쓰기 (스테이지 복사본, 진짜 id 유지)
    this.ng = mode === 'story' && !ar ? NG.ngOf?.(this.state) ?? 0 : 0;   // [hook:ng] 지난 회차 수 (스토리만 — 마을·아케이드·보스 러시는 0; pause.js 가 읽는다)
    if (this.ng) { const r = NG.ngWorld?.(this.stage, this.diff, this.ng); if (r) { this.stage = r.stage; this.diff = r.diff; this.ngBoss = r.bossPatterns; } }   // [hook:ng] 적 레벨·배율 (스테이지 복사본, 첫 방 소환 전에)
    this.rules = rules ?? (ar?.rules && typeof ar.rules === 'object' ? ar.rules : null);   // [hook:plat] {noPotion, noSub, dark, taken, dealt, label?}
    this.trial = trial; if (trial?.bossPatterns) this.ngBoss = true;   // 시련: 보스 회차 패턴 (boss.js inferno 가 world.ngBoss 를 읽는다)
    this.rng = Number.isInteger(ar?.seed) ? new RNG(ar.seed) : null;   // [hook:plat] 정예 출현·촛불 보상 (그 밖의 모드는 Math.random)
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
    this.backingLayer = true;   // 영웅 받침은 render 가 적·탄·이펙트보다 먼저 그린다 (Player.draw 는 건너뜀; requests_f hero-vis)
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
    if (this.ng) this.banner.sub = `${NG.ngLabel?.(this.ng) ?? ''} · ${this.banner.sub}`;   // [hook:ng] '{N}회차 · CHAPTER {c} · {sub}'
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
  /** 아케이드 계열 모드 (보스 러시·서바이벌·스테이지 연습·무한의 탑): 세이브 기록 없음 */
  get arcade() { return this.mode === 'bossrush' || this.mode === 'survival' || this.mode === 'practice' || this.mode === 'tower'; }   // [hook:plat] 무한의 탑 (front/arcade_tower.js)
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
    if (this.reveal || this.finale) { this.reveal?.finish?.(true); this.finale?.stop?.(); this.reveal = null; this.finale = null; }   // [s5:p4a] 방이 바뀌면 보스 등장·격파 연출도 끝 (보스방 입구 재도전의 방 다시 불러오기 포함)
    this.stashRoomLoot();   // 가방이 가득 차 못 주운 상자·보스 전리품은 방을 떠나도 보관함으로
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
    // [retryart] 보스방 입구 기록 (처음 들어설 때의 자리·HP·MP): 이야기 모드 게임오버 「이어하기」가 여기서 보스전을 다시 시작한다 (retryAtBossDoor).
    //  재도전으로 방을 다시 불러올 때(_doorRetry)는 처음 들어온 기록을 그대로 둔다. 보스방이 아닌 방에 들어서면 지운다
    if (!this._doorRetry) this.bossDoor = room.boss ? { roomId, x: p.x, y: p.y, hp: p.hp, mp: p.mp } : null;
    if (!room.boss) this._retryIntro = false;

    const ms = this.map.markers;
    const counters = {};
    for (const m of ms) {
      if (this.trial && (m.ch === '$' || m.ch === '@' || m.ch === '!' || m.ch === 'S')) continue;   // 시련: 상자·배치 아이템·이야기 트리거·세이브 지점 없음
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
            const did = this.diff?.id ?? this.state?.difficulty;
            if (spec && diffAllows(spec, did)) {   // [playb] 범례 minDiff/maxDiff (예: s01 r1 의 하드 이상 전용 구울·빙의 주민)
              const id = typeof spec === 'string' ? spec : spec.id;
              // paramsMaxDiff: 순한 params 는 그 난이도까지만 (더 어려우면 같은 자리에 보통 적, 예: s01 r1 의 첫 구울 '7')
              const params = typeof spec === 'object' && (!spec.paramsMaxDiff || diffAllows({ maxDiff: spec.paramsMaxDiff }, did)) ? spec.params : undefined;
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
    // 보스방이 바로 옆이면 보스 음악을 미리 받는다 (녹음 음원 — 보스 등장 연출 동안 풀린다)
    const rooms = this.stage.rooms;
    for (const k of ['exitLeft', 'exitRight', 'exitUp', 'exitDown']) {
      const nb = room[k] && rooms?.[room[k]];
      if (nb?.boss) { audio.prefetch?.(BOSSES[nb.bossId ?? this.stage.boss]?.music ?? 'boss'); break; }
    }
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
  add(e) {
    e.world = this; this.entities.push(e);
    const cf = this.procCapFn ?? this.awProcCap;   // 각성 중 생긴 proc 탄·이펙트: 나중에 맞아도 그 각성의 보스 상한을 쓴다 (awaken.js)
    if (cf) capProcAttack(e, cf);
    return e;
  }
  spawnProjectile(o) { return this.add(new Projectile(o)); }
  spawnEnemy(id, fx, fy, opts = {}) {
    const roll = this.rng ? this.rng.next() : Math.random();   // [hook:plat] 일일 도전 시드
    const elite = opts.elite ?? (roll < (this.diff.elite ?? 0) && id !== 'medusa_head' && ENEMIES[id]?.elite !== false);
    const e = new Enemy(id, fx, fy, { level: opts.level ?? this.stage.level, elite, diff: this.diff, facing: opts.facing ?? -1, params: opts.params });
    this.roomFoes++;   // [hook:feel]
    this.guardSpawn(e);   // [playb] P12
    return this.add(e);
  }
  /**
   * [playb] P12 부활 보호 (respawn 의 spawnGuard, 2.5초): 적이 부활 자리 3칸 안이면 같은 쪽 3칸 밖(막혔으면 반대쪽)으로 옮긴다.
   * 벽에 막혀 옮길 곳이 없으면 그대로 둔다 (무적 시간이 있다)
   */
  guardSpawn(e) {
    const g = this.spawnGuard;
    if (!g || !(g.t > 0) || !e || e.kind !== 'enemy') return;
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    if (Math.abs(cx - g.x) >= g.r || Math.abs(cy - g.y) >= 2.5 * TILE) return;
    const side = Math.sign(cx - g.x) || 1;
    for (const s of [side, -side]) {
      const nx = g.x + s * (g.r + e.w / 2 + 4);
      if (nx - e.w / 2 < 0 || nx + e.w / 2 > (this.map?.pxW ?? Infinity)) continue;
      if (this.map?.isSolidPx?.(nx, cy) || this.map?.isSolidPx?.(nx, e.y + e.h - 4)) continue;
      e.x = nx - e.w / 2;
      if (e.homeX !== undefined) e.homeX = e.x;
      return;
    }
  }
  spawnPickup(type, x, y, data = {}) {
    if (this.trial && !TRIAL_PICKUPS.has(type)) return null;   // 시련: 하트·고기·보조무기·파워업만 (호출부는 null 을 견딘다 — spawnPlaced 확인)
    return this.add(new Pickup(type, x, y, data));
  }
  hittables() {
    return this.entities.filter((e) => (e.kind === 'enemy' || e.kind === 'boss' || (e.kind === 'prop' && e.takeHit)) && !e.dead && !e.hidden && !e.pendingBoss && !this.inUnrevealedFake(e));
  }
  /** 살아 있는 적·보스. 보스 대역(PendingBoss)도 든다 (남은 적 수를 세는 쪽: 아케이드 웨이브). 대역은 invuln·harmless 라 조준하는 쪽은 invuln 을 거른다 */
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
    if (this.reveal) this.reveal.update(dt);   // [s5:p4a] 보스 등장 연출 (실제 시간: 히트스톱·슬로모션과 무관)
    if (this.finale) this.finale.update(dt);   // [s5:p4a] 보스 격파 연출
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
    if ((this._stashT = (this._stashT ?? 0) - dt) <= 0) { this._stashT = 1; if (this.state?.progress?.lootQueue?.length) this.deliverStash(); }   // 보관함 → 가방 (자리가 났으면)
    if (this.timeStop > 0) this.timeStop -= dt;
    if (this.spawnGuard && (this.spawnGuard.t -= dt) <= 0) this.spawnGuard = null;   // [playb] P12 부활 보호 끝
    this.bg.update?.(sdt, this);

    const holdFoeShots = this.timeStop > 0 || this.freezeEnemies;   // [hook:feel] 각성 중엔 적 탄도 멈춘다 (timeStop 과 같은 규칙, 회색 화면 없음)
    const holdFoes = !!this.reveal?.hold;   // [s5:p4a] K3 보스 등장 연출 동안: 보스 말고 다른 적·적 탄·적 판정은 갱신하지 않는다 (보스는 world.cutscene 이 붙잡는다)
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i];
      if (e.dead && e !== this.player) continue; // 죽은 플레이어는 사망 연출(updateDeath)을 위해 계속 갱신
      if (holdFoeShots && e.kind === 'projectile' && e.team === 'enemy') continue;   // [hook:feel]
      if (holdFoes && e !== this.boss && (e.kind === 'enemy' || e.team === 'enemy')) continue;   // [s5:p4a]
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
    this.reveal?.lights(this.lighting); this.finale?.lights(this.lighting);   // [s5:p4a] 등장 섬광 · 격파 빛기둥
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
    const RV = this.reveal?.xf.on ? this.reveal : null;   // [s5:p4a] 등장 연출 중인 보스(와 채색·컬링 대리 개체)는 변형(y·크기·알파·바닥 자르기)을 입혀 그린다
    for (const e of list) if (e.z < 0) { if (RV?.owns(e)) RV.drawEntity(ctx, e); else e.draw(ctx, this); }
    for (const d of this.debrisList) this.drawDebris(ctx, d);
    const P = this.player; if (P && list.includes(P)) P.drawBacking?.(ctx, this);   // 영웅 받침 (hero-vis): 타일·장식 위, 적·탄·이펙트 아래
    for (const e of list) if (e.z >= 0) { if (RV?.owns(e)) RV.drawEntity(ctx, e); else e.draw(ctx, this); }
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
    if (!guardian && !p.dead && p.stats.lifesteal > 0 && info.dmg > 0) p.heal(info.dmg * p.stats.lifesteal / 100, false);   // [hook:cmp] 쓰러진 뒤 남은 탄·불길의 흡혈로 HP 가 차오르지 않게
    // [hook:feel] '{n} HIT!' 는 feel_hud 콤보 기둥 하나만 그린다 (머리 위 글자 중복 제거). 이정표 소리는 style.js 의 combo_milestone — 없을 때만 옛 'combo'
    if (this.combo.n % 25 === 0) { if (!SFX.combo_milestone) audio.sfx('combo'); bus.emit('combo', { count: this.combo.n }); }
    if (COMBO_MILESTONES.has(this.combo.n)) bus.emit('comboMilestone', { n: this.combo.n });   // [hook:feel]
    // 각성 타격이 부른 특성 부가 타격은 그 각성의 보스 상한(capFn)을 함께 쓴다 (combat.hitTarget 이 procCapFn 을 읽는다; firePerks 는 예외를 삼킨다)
    const pcf = !guardian && typeof attack?.capFn === 'function' && attack.tags?.includes('awaken') ? attack.capFn : null, prevPcf = this.procCapFn;
    if (pcf) this.procCapFn = pcf;
    this.style?.onHit?.(info, attack, target);   // [hook:feel]
    if (!guardian && attack?.owner === p && !attack.proc && p.perks?.onHit) firePerks(p.perks.onHit, p, target, info, attack, this);
    if (pcf) this.procCapFn = prevPcf;
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
    if (!this.trial) {   // 시련: 경험치·동료 경험치·전리품 없음 (classes_t3 §9.2)
      this.gainExp(expGain);
      this.companions?.onKill(e, expGain);   // [hook:cmp] 동료 경험치 분배
    }
    this.addScore((e.def.score ?? 100) * (1 + this.combo.n / 20) * (e.elite ? 3 : 1));
    if (!this.trial) for (const d of rollEnemyLoot(this, e)) this.spawnPickup(d.type, e.cx, e.cy, d.data);
    if (this.hero.classId === 'lia_reaper') p.heal(p.stats.hp * 0.03, false);
    if (p.perks?.onKill && attack?.owner === p) firePerks(p.perks.onKill, p, e, attack, this);
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
    if (this.combo.n > 0 && !(this.player?.perks?.keepCombo && perkAny(this.player.perks.keepCombo, this.player, dmg))) this.endCombo();
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
    // keep: 상자는 다시 열 수 없으므로, 가방이 가득 차 못 주운 채 방을 떠나도 보관함으로 간다 (stashRoomLoot)
    for (const d of rollChestLoot(this, chest.contents)) this.spawnPickup(d.type, chest.cx, chest.y, { ...extra, ...d.data, keep: true });
  }
  /** 줍기 → 실제로 챙겼으면 true. 가방이 가득 차 받을 수 없는 아이템은 바닥에 그대로 남긴다 (배치 아이템의 secrets 도 기록하지 않음 → 다시 들어오면 또 있다) */
  collect(pk) {
    if (pk.dead) return false;
    const p = this.player, d = pk.data, st = this.state;
    if (pk.type === 'item' && d.item && !canAdd(st, d.item)) { this.refuseFull(pk); return false; }
    pk.dead = true;
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
        else { queueLoot(st, it); this.game.toast('가방이 가득 찼다! 보관함에 맡겨 두었다', '#ff6060'); }   // canAdd 를 통과했으니 오지 않는 길 — 와도 버리지 않는다
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
    return true;
  }
  /** 가방이 가득 차 못 주운 아이템: 끌려오던 것을 멈춰 제자리에 떨구고, 경고는 몇 초에 한 번만 */
  refuseFull(pk) {
    pk.bagFull = true; pk.magnet = false; pk.vx = 0; pk.vy = Math.min(0, pk.vy ?? 0);
    if (this.time - (this._fullToastAt ?? -99) < 3) return;
    this._fullToastAt = this.time;
    this.game.toast('가방이 가득 찼다! 가방을 비우면 주울 수 있다', '#ff6060');
    audio.sfx('menu_cancel');
  }
  /** Pickup.update 가 묻는다: 가방이 가득 차 멈춰 둔 아이템을 이제 받을 수 있는가 */
  canTake(pk) { return pk.type !== 'item' || !pk.data?.item || canAdd(this.state, pk.data.item); }
  /**
   * 방을 떠날 때: 가방이 가득 차 못 주운 채 남은 되찾을 수 없는 전리품(상자 내용물·보스 드롭 = data.keep)을 보관함으로.
   * 배치 아이템(secretKey)은 기록하지 않았으니 다시 들어오면 또 놓인다. 일반 적 드롭은 예전처럼 두고 간 것으로 친다.
   */
  stashRoomLoot() {
    if (this.arcade || this.trial || !this.entities?.length) return 0;
    let n = 0;
    for (const e of this.entities) {
      if (e.kind !== 'pickup' || e.dead || e.type !== 'item' || !e.data?.item || e.secretKey || !e.data.keep) continue;
      if (!e.bagFull && canAdd(this.state, e.data.item)) continue;
      e.dead = true; queueLoot(this.state, e.data.item); n++;
    }
    if (n > 0) this.game.toast(`가방이 가득 차 전리품 ${n}개를 보관함에 맡겼다 — 자리가 나면 자동으로 챙긴다`, '#ffb060', 3.2);
    return n;
  }
  /** 보관함(가방이 가득 차 맡겨 둔 전리품) → 가방. world.update 가 1초마다 부른다 */
  deliverStash() {
    if (this.arcade || this.trial) return 0;
    // [playb] P11 보관함에서 꺼낸 장비는 「▼」 비교 토스트를 띄우지 않는다 (pickup_compare 가 game._stashUids 를 본다 — ▲ 만)
    const q = this.state?.progress?.lootQueue, g = this.game;
    const uids = Array.isArray(q) && q.length ? new Set(q.map((it) => it?.uid).filter(Boolean)) : null;
    if (uids) { g._stashUids = uids; setTimeout(() => { if (g._stashUids === uids) g._stashUids = null; }, 0); }
    const n = deliverLoot(this.state);
    if (n > 0) { audio.sfx('item'); if (!this.onStashDelivered?.(n)) this.game.toast(`보관함에 맡겨 둔 전리품 ${n}개를 챙겼다`, '#ffe070'); }   // 마을 이어하기 직후면 요약 한 줄로 (hub.js)
    return n;
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
    if (this.bossDoor?.roomId === this.roomId && !this.bossActive) { this.bossDoor.hp = p.hp; this.bossDoor.mp = p.mp; }   // [retryart] 보스방 안 세이브 지점: 입구 기록도 가득 찬 상태로
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
    if (p.hp <= 0) { p.hp = 0; p.y = this.map.pxH + 40; p.die(this, 'fall'); p.vy = 0; return; }   // [hook:plat] 사망 원인 'fall'
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
  /** full: 목숨을 난이도 시작값으로 (게임오버 이어하기). reload: 체크포인트 방을 처음 상태로 다시 불러 그 방의 시작 자리에서 (보스방 입구 재도전) */
  respawn(full = false, { reload = false } = {}) {
    const p = this.player;
    let cp = this.run.checkpoint;
    // [playb] P12 다시 일어선 자리 둘레 3칸에는 적을 두지 않는다 (무적 2.5초 동안): 방을 다시 불러 생기는 적·그동안 생기는 적은 3칸 밖으로,
    //  같은 방에 남아 있던 적은 지금 밀어낸다 (spawnEnemy · guardSpawn)
    this.spawnGuard = { x: cp.x + (p?.w ?? 40) / 2, y: cp.y + (p?.h ?? 80) / 2, r: 3 * TILE, t: 2.5 };
    if (reload) { this.loadRoom(cp.roomId); cp = this.run.checkpoint; }   // [retryart] 보스·경기장·적·기믹이 처음 상태로, 자리는 그 방의 시작 자리
    else if (cp.roomId !== this.roomId) this.loadRoom(cp.roomId);
    else for (const e of this.entities) if (e.kind === 'enemy' && !e.dead) this.guardSpawn(e);
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
  /**
   * [retryart] 보스방 입구 재도전 (PLAY P12): 이야기 모드에서 보스방(보스 등장 연출 포함)에서 쓰러져 게임오버가 됐는가.
   * 아케이드 계열(보스 러시·서바이벌·연습·일일 도전·탑)·시련·순위 기록 모드는 예전 규칙 그대로 (false)
   */
  canRetryAtBossDoor() {
    const d = this.bossDoor;
    return !!d && this.mode === 'story' && !this.trial && !this.arcade && !this.state?.arcade && !this.cleared && d.roomId === this.roomId && !!this.room?.boss;
  }
  /**
   * [retryart] 게임오버 「이어하기」(자동 카운트다운 포함) → 보스방 입구에서 보스전을 처음부터: 방을 다시 불러 보스는 사라지고(다시 들어서면 체력 가득)
   * 경기장이 열린다. 영웅은 방의 시작 자리, HP·MP 는 견습·숙련 헌터 가득 / 베테랑 이상은 보스방에 들어설 때의 값 (그 뒤 최대치가 줄었으면 최대치).
   * 쓴 물약·소모품은 돌려주지 않고 (가방은 건드리지 않는다), 문 앞까지의 진행·주운 것은 그대로. 다음 보스 등장 연출은 짧게 (startBoss) → 했으면 true
   */
  retryAtBossDoor() {
    if (!this.canRetryAtBossDoor()) return false;
    const d = this.bossDoor;
    this.cutscene = false; this.inputLock = false;   // 보스 등장 연출 도중 쓰러졌을 때
    this.run.checkpoint = { roomId: d.roomId, x: d.x, y: d.y };
    this._doorRetry = true;
    try { this.respawn(true, { reload: true }); } finally { this._doorRetry = false; }
    const p = this.player;
    if (p && diffRank(this.diff?.id ?? this.state?.difficulty) > diffRank('normal')) {
      p.hp = clamp(Number.isFinite(d.hp) ? d.hp : p.stats.hp, 1, p.stats.hp);
      p.mp = clamp(Number.isFinite(d.mp) ? d.mp : p.stats.mp, 0, p.stats.mp);
    }
    this.bossDoorRetries = (this.bossDoorRetries ?? 0) + 1;
    this._retryIntro = true;
    this.banner = { text: 'READY?', sub: `보스방 입구에서 재도전 · 남은 목숨 ${this.run.lives}`, t: 2.2, color: '#ffe7a0' };
    return true;
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
    const bx = this.bossSpawnX(x0, x1, this.game.viewW / (this.camera.zoomTarget || 1));   // R1-RUN-BOSSFRAME: 첫 구도에 보스가 담기는 거리
    const by = (m.h - 2) * TILE;
    this.bossSpawn = { id, x: bx, y: by };
    this.boss = createBoss(this, id, bx, by);
    this.add(this.boss);
    this.companions?.onBossStart(this.boss);   // [hook:cmp] (noMount 보스면 하차)
    bus.emit('bossStarted', { bossId: id, stageId: this.stage.id, time: this.run.time });   // [hook:plat] 보스전 시간 (core/telemetry.js)
    this.camera.floorY = this.arenaFloorY(x0, x1) ?? by;   // [hook:plat] 높은 경기장에서도 바닥이 화면 아래쪽에 보이게
    audio.stopMusic(0.5);
    this.cutscene = true;
    const short = !!this._retryIntro && this.bossDoor?.roomId === this.roomId;   // [retryart] 보스방 입구 재도전: 경고 없이 이름 카드만 짧게
    this._retryIntro = false;
    // [s5:p4a] 이야기 모드(재도전 아님)는 월드 쪽 등장 연출(BossReveal, _pre 대사 동안에도 보스를 숨긴다) + 이름판/첫 대면 카드.
    //  아케이드·시련·악몽·연습·재도전은 bossIntro 가 이름판만 (≤ 1.2초)
    this.reveal?.finish?.(true);
    this.reveal = !short && this.revealable() ? new BossReveal(this, id) : null;
    if (this.reveal) { try { UI.loadBrush?.(); } catch { /* 글꼴 없음: 제목 글꼴 */ } }
    const intro = () => {
      this.cutscene = true;
      if (!short) audio.sfx('warning');
      this.game.push('bossIntro', { bossId: id, world: this, short, warned: !short, reveal: this.reveal, onDone: () => { this.reveal?.finish(); this.cutscene = false; if (this.player) this.player.iframes = Math.max(this.player.iframes ?? 0, 0.8); this.addAw('bossIntro'); audio.music(this.boss?.def?.music ?? 'boss'); } });   // [hook:awaken] 보스 등장 +25 · [playb] P25 연출이 닫힌 뒤 0.8초 무적 (깜박임)
    };
    const preId = `${id}_pre`;
    if (!short && SCRIPTS[preId] && !this.state.progress.seenScripts.includes(preId) && this.mode === 'story') {
      this.state.progress.seenScripts.push(preId);
      this.game.push('dialogue', { script: preId, world: this, onEnd: intro });
    } else intro();
  }
  /** [s5:p4a] 월드 쪽 보스 등장 연출을 하는가: 이야기 모드만 (시련·악몽(K2 opts.nightmare)·아케이드 계열·일일 도전·순위는 이름판만) */
  revealable() {
    return this.mode === 'story' && !this.trial && !this.arcade && !this.state?.arcade && !this.opts?.nightmare;
  }
  /**
   * 보스 등장 x (R1-RUN-BOSSFRAME 리드 결정). 기본은 경기장 0.72 지점이지만 들어온 영웅에서 화면 너비(vw, 경기장 줌 기준 월드 px)의
   * 0.75 배보다 멀면 그 거리로 당긴다 — 카메라의 영웅 0.6 : 보스 0.4 구도가 첫 화면부터 보스를 담는다 (s19 베헤모스는 입구에서 2000 px 였다).
   * 영웅과는 0.45 vw 이상 띄운다. 영웅이 경기장 가운데보다 오른쪽에서 들어왔으면 좌우를 뒤집는다. 경기장 양 끝 두 칸 안쪽으로 자른다
   */
  bossSpawnX(x0, x1, vw) {
    const p = this.player, hx = p ? p.x + p.w / 2 : x0;
    const dir = hx <= (x0 + x1) / 2 ? 1 : -1;
    const base = dir > 0 ? x0 + (x1 - x0) * 0.72 : x1 - (x1 - x0) * 0.72;
    if (!(vw > 0) || !Number.isFinite(hx)) return base;
    let bx = dir > 0 ? Math.min(base, hx + vw * 0.75) : Math.max(base, hx - vw * 0.75);
    bx = dir > 0 ? Math.max(bx, hx + vw * 0.45) : Math.min(bx, hx - vw * 0.45);
    const mg = Math.min(TILE * 2, (x1 - x0) / 4);
    return clamp(bx, x0 + mg, x1 - mg);
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
  /**
   * 진짜 보스가 준비될 때까지 → Promise<Boss|null> (R1-REQ-229 요청 #451).
   * world.boss 는 보스 클래스 모듈을 받는 동안 대역(PendingBoss: pendingBoss=true, 무적·무해·그리지 않음, state 'intro')일 수 있다.
   * 대역은 보통 다음 update 에서 스스로 바뀌지만, 이 약속은 게임 루프가 멈춰 있어도(시험 도구의 단계 실행) 모듈이 도착하는 즉시
   * 여기서 바꿔 넣고 진짜 보스를 돌려준다. 받기에 끝내 실패하면(세 번) 대역과 같은 규칙으로 GenericBoss. 보스가 없으면 null
   */
  bossReady() {
    const b = this.boss;
    if (!b?.pendingBoss) return Promise.resolve(b ?? null);
    const id = b.id ?? b.def?.id;
    const step = (tries) => loadBoss(id).then((C) => {
      const cur = this.boss;
      if (cur !== b) return cur?.pendingBoss ? this.bossReady() : (cur ?? null);   // 그 사이 update 가 바꿨거나 방을 떠났다
      if (b.dead) return null;
      if (typeof C === 'function') return b.become(C, this);
      return tries > 1 ? step(tries - 1) : b.become(GenericBoss, this);
    });
    return step(3);
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
    // [matrix] 이야기 모드는 bus 'levelUp' 토스트가 「LEVEL UP! Lv.N · SP +n — 메뉴 › 스킬」 한 줄로 알린다 (LV_SP.loud). 아케이드·시련은 예전 그대로
    if (lvUp > 0) { if (LV_SP.queued && !(this.game.state?.arcade || this.arcade || this.trial)) LV_SP.loud = true; else this.game.toast(`LEVEL UP! Lv.${this.hero.level} — 스킬 포인트 획득`, '#ffe070', 3.2); }
    this.addScore((boss.def.score ?? 20000));
    for (const d of rollBossLoot(this, boss)) this.spawnPickup(d.type, boss.cx + rand(-40, 40), boss.cy, { ...d.data, keep: true });   // keep: 첫 처치 확정 고유 장비 등 — 가방이 가득 차도 보관함으로 (stashRoomLoot · collectLeftovers)
    // [s5:p4a] 격파 연출: 보스 속성(data/boss_intro.js) 폭발 20회(0.06초 간격, 게임 시간) · 임팩트 프레임 · 카메라 밀어 넣기 · 「격파」 낙관 · 금빛 알갱이 · 빛기둥
    this.reveal?.finish?.(true);
    try { this.finale = new BossFinale(this, boss); } catch (e) { this.finale = null; console.error('[world] finale', e); }
    bus.emit('bossKilled', { bossId: boss.def.id, stageId: this.stage.id, time: this.run.time, mode: this.mode, charId: this.hero?.charId, assisted: !!this.run?.assisted });   // [hook:ach] mode·charId: 업적 (sc_lia·sc_isolde 스토리, cb_nodmg 스토리·연습)
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
    let n = 0, kept = 0;
    for (const e of this.entities) {
      if (e.kind !== 'pickup' || e.dead || !['gold', 'item', 'oneup', 'doc'].includes(e.type)) continue;
      if (e.type === 'doc') {
        // 문서 장면은 띄우지 않고 기록만
        e.dead = true;
        const d = e.data, st = this.state;
        if (e.secretKey) st.progress.secrets.push(e.secretKey);
        if (d.docId && !st.progress.docs.includes(d.docId)) { st.progress.docs.push(d.docId); st.stats.docs = (st.stats.docs ?? 0) + 1; this.run.docsFound.push(d.docId); bus.emit('docFound', { docId: d.docId }); }
        if (d.loreId && !st.progress.lore.includes(d.loreId)) st.progress.lore.push(d.loreId);
      } else if (!this.collect(e)) {
        // 가방이 가득 참: 스테이지를 떠나면 사라지므로 보관함에 맡긴다 (배치 아이템은 이제 챙긴 것으로 기록)
        e.dead = true;
        if (e.secretKey) this.state.progress.secrets.push(e.secretKey);
        queueLoot(this.state, e.data.item); kept++;
        continue;
      }
      n++;
    }
    if (n > 0) { this.player.refreshStats(); this.game.toast(`남은 전리품 ${n}개를 자동으로 챙겼다`, '#ffe070'); }
    if (kept > 0) this.game.toast(`가방이 가득 차 전리품 ${kept}개를 보관함에 맡겼다 — 자리가 나면 자동으로 챙긴다`, '#ffb060', 3.2);
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
