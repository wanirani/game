// 스킬 런타임: 액티브 스킬 48종 · 캐릭터별 필살기 6종 · 비전서 커맨드 기술 11종 · 직업 휘두르기 특성
// 공개 API
//  SKILL_IMPL[skillId] = (player, world, level) => boolean(시전 성공, false 면 MP/쿨타임 소모 안 함)
//  castSkill(player, world, skillId, level), castUltimate(player, world), castTechnique(player, world, tech)
//  SKILL_IMPL.__onSwing(player, world, move) : 일반 공격 판정 시작 시 직업 특성 연출/효과
//  FXKIT : 필살기·각성기 연출 도우미 모음 (이 파일에 이미 있는 도구들; 각성 감독 AWAKEN-DIR-A/B 가 쓴다. 목록은 파일 끝)
// 필살기 (feel.md §5.2·§5.3, FX-ULTS): castUltimate 가 전직 단계·강조색을 읽어 ULTS[charId](p, w, v) 에 넘긴다.
//  v = { charId, classId, tier(0~2), color(필살기 색), accent(직업 강조색), q(품질 배율), low, name, title }
//  화면 레이어(줌·레터박스·집중선·색보정·충격파·임팩트 프레임·직업 문양)는 ULTFX(render/ultfx.js) 가,
//  영웅별 연출(월드 레이어)은 이 파일이 그린다. 피해량은 전직 단계와 무관하다 (연출만 달라진다).
// 원칙: 레벨이 오를수록 위력뿐 아니라 크기·개수·지속 시간이 눈에 띄게 커진다("스킬 확대").
// 그리기 도구 glow/beamV/beamH 는 색마다 한 번 구운 캐시 캔버스를 늘여 그린다 (매 프레임 그라디언트를 만들지 않는다, feel §8).
import { audio } from '../core/audio.js';
import { TAU, rand, clamp, lerp, ease, rgba, overlap, hexToRgb } from '../core/math.js';
import { T, isSolidType } from '../core/physics.js';
import { TILE, game } from '../core/game.js';
import { bus } from '../core/events.js';
import { Entity } from './entity.js';
import { playerStrike, hitTarget } from './combat.js';
import { SKILLS, skillVal } from '../data/skills.js';
import { CHARACTERS } from '../data/characters.js';
import { CLASSES } from '../data/classes.js';   // [hook:feel] ultimateCast 의 tier
import { drawHero } from '../render/hero.js';
import * as UFX from '../render/ultfx.js';   // [hook:feel] 필살기 화면 레이어 키트 ULTFX (FX-ULTKIT; 모듈 이름공간으로만 읽는다)
import * as HFX from '../render/hitfx.js';   // 타격 캐시 스프라이트 (별·자국)
import { SKILL_IMPL_P2, TECH_NAMES_P2 } from './skills_p2.js';   // [hook:p2] 2부 비전서 기술 (skills_p2.js 는 이 파일을 import 하지 않는다)

export const SKILL_IMPL = {};
Object.assign(SKILL_IMPL, SKILL_IMPL_P2);   // [hook:p2]
const ULTS = {};
/** 필살기·각성기 연출 도우미 모음 (FX-ULTS 가 채운다; AWAKEN-CORE/DIR 가 import). W0 SKEL 자리 표시 */
export const FXKIT = {};   // [hook:awaken]

// ═══════════════════════════ 공개 API ═══════════════════════════
export function castSkill(p, world, id, lv) {
  const fn = SKILL_IMPL[id];
  if (!fn) return false;
  p.mount?.beforeCast?.(world, p, id);   // [hook:cmp] DISMOUNT_SKILLS 는 탈것에서 내린 뒤 시전
  return fn(p, world, Math.max(1, lv || 1)) !== false;
}

/**
 * 필살기: run.sp ≥ 100 일 때 player(awaken.handleUltInput) 가 호출.
 * 연출·경직 중이거나 스테이지가 끝나 가는 중이면 거절한다 (MASTER_PLAN §1.13; SP 는 그대로 남는다).
 * 전직 단계·강조색·직업 id 를 읽어 영웅별 필살기에 넘긴다 (feel §5.2). 번쩍임은 game.flash 정책(설정 배율·상한·1초 제한)을 거친다.
 */
export function castUltimate(p, world) {
  if ((p.run.sp ?? 0) < 100 || world.cutscene) return false;
  if (p.dead || world.cleared || world.transitioning || world.inputLock || p.hurtT > 0) return false;
  p.run.sp = 0;
  p.endMove?.();
  p.mount?.beforeCast?.(world, p, 'ult');   // [hook:cmp] 필살기는 탈것에서 내린 뒤 시전 (MASTER_PLAN §1.14)
  const v = ultCtx(p, world);
  bus.emit('ultimateCast', { charId: p.hero.charId, tier: CLASSES[p.hero.classId]?.tier ?? 0, classId: p.hero.classId });   // [hook:feel] [hook:cmp]
  world.startUltimate?.(p);
  audio.sfx('ult');
  world.game.flash('#ffffff', 0.5, 3);
  prewarmUlt(v);   // 컷인이 월드를 멈춘 동안 캐시 스프라이트를 굽는다 (연출 도중 캔버스 생성 없음)
  const fn = ULTS[p.hero.charId] || ULTS.kael;
  fn(p, world, v);
  return true;
}

/** 비전서 커맨드 기술 */
export function castTechnique(p, world, tech) {
  const fn = SKILL_IMPL[tech?.id];
  if (!fn) return false;
  p.mount?.beforeCast?.(world, p, tech.id);   // [hook:cmp]
  const ok = fn(p, world, 1) !== false;
  if (ok) {
    const name = tech.name?.replace(/^비전서:\s*/, '') || TECH_NAMES[tech.id] || '';
    if (name) world.fx.text(p.cx, p.y - 26, name, { color: charCol(p), size: 22, life: 1.1, vy: -60, outline: '#1a0610' });
  }
  return ok;
}

// ═══════════════════════════ 공용 도구 ═══════════════════════════
let _sid = 0;
const nid = (s = 'sk') => s + (++_sid);
const V = (id, k, lv) => skillVal(id, k, lv);
const MV = (id, lv) => skillVal(id, 'dmg', lv) / 100;
const N = (id, lv) => Math.max(1, Math.floor(skillVal(id, 'n', lv)));
const SZ = (lv) => 1 + 0.12 * (lv - 1);
const charCol = (p) => CHARACTERS[p.hero?.charId]?.ult?.color ?? '#fff2b0';
const bestType = (p) => ((p.stats.mag ?? 0) > (p.stats.atk ?? 0) ? 'mag' : 'phys');
const TECH_NAMES = {
  tech_hadou: '파동참', tech_shoryu: '승천격', tech_tatsu: '선풍각', tech_palm: '백보신권', tech_hellslash: '지옥참',
  tech_thunder: '천뢰', tech_bomb: '연금 폭쇄', tech_hydro: '수룡참', tech_clone: '환영 분신', tech_freeze: '절대영도', tech_grandcross: '그랜드 크로스',
};
Object.assign(TECH_NAMES, TECH_NAMES_P2);   // [hook:p2]

/** 스킬 공격 객체 */
function atk(p, o = {}) {
  return {
    owner: p, team: 'player', stats: p.stats, mv: 1, type: p.hero.charId === 'sera' ? 'mag' : 'phys', element: null,
    dir: p.facing, kb: [220, -220], hitstop: 0.06, shake: 3, hitId: nid(), mult: p.dmgMul, tags: ['skill'], crit: 0, ...o,
  };
}
const circ = (x, y, r) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
function shake(w, m, t = 0.25) { w.camera.shake(m, t); }
function viewRect(w, pad = 0) { const c = w.camera; return { x: c.x - pad, y: c.y - pad, w: c.vw + pad * 2, h: c.vh + pad * 2 }; }
function enemiesIn(w, rect) { return w.enemies().filter((e) => !e.invuln && overlap(rect, e.hurtbox ? e.hurtbox() : e)); }
function frontEnemies(w, p, range = 600) {
  return w.enemies().filter((e) => !e.invuln && (e.cx - p.cx) * p.facing > -30 && Math.abs(e.cx - p.cx) < range && Math.abs(e.cy - p.cy) < 260)
    .sort((a, b) => Math.abs(a.cx - p.cx) - Math.abs(b.cx - p.cx));
}
const maxHpOf = (e) => e.stats?.maxHp ?? e.maxHp ?? e.stats?.hp ?? e.hp ?? 1;

/** x 열에서 y 아래로 가장 가까운 지면(px). 없으면 null */
function groundAt(w, x, y, maxDrop = 7 * TILE) {
  const m = w.map, tx = Math.floor(x / TILE);
  let ty = Math.floor(y / TILE), g = 0;
  while (ty > 0 && isSolidType(m.typeAt(tx, ty)) && g++ < 6) ty--;
  const gy = m.groundBelow(tx, Math.max(0, ty));
  if (gy === null || gy - y > maxDrop) return null;
  return gy;
}
function solidAt(w, x, y) { return isSolidType(w.map.typeAtPx(x, y)); }
function freeSpot(w, p, cx, bottom) {
  const l = cx - p.w / 2 + 2, r = cx + p.w / 2 - 2;
  return !solidAt(w, l, bottom - 6) && !solidAt(w, r, bottom - 6) && !solidAt(w, l, bottom - p.h + 6) && !solidAt(w, r, bottom - p.h + 6) && !solidAt(w, cx, bottom - p.h / 2);
}

/** 스킬 시전 자세: 공격 모션 데이터를 흉내 낸 가짜 move 로 렌더러 포즈를 구동 */
function pose(p, w, anim, dur = 0.36, o = {}) {
  const h0 = o.h0 ?? dur * 0.28;
  p.startMove(w, { id: 'sk_' + anim, anim, dur, hit: [h0, h0 + (o.hw ?? 0.08)], box: null, skill: true, sfx: o.sfx ?? 'magic', cancel: o.cancel ?? dur * 0.8, mv: 0, ...(o.mv || {}) });
}
const WANIM = {
  whip: { slash: 'lash', up: 'launch', wide: 'spin', thrust: 'lash', down: 'lash_down', cast: 'cast' },
  sword: { slash: 'slash_down', up: 'uppercut', wide: 'slash_wide', thrust: 'thrust', down: 'slash_down', cast: 'cast' },
  greatsword: { slash: 'heavy_down', up: 'heavy_up', wide: 'heavy_spin', thrust: 'heavy_low', down: 'heavy_down', cast: 'cast' },
  dagger: { slash: 'stab', up: 'uppercut', wide: 'spin_blade', thrust: 'thrust', down: 'stab_alt', cast: 'cast' },
  gun: { slash: 'shoot_double', up: 'shoot_up', wide: 'spin_blade', thrust: 'shoot', down: 'shoot_down', cast: 'shoot_double' },
  staff: { slash: 'staff_swing', up: 'staff_swing_up', wide: 'spin_blade', thrust: 'staff_swing', down: 'staff_swing', cast: 'cast' },
};
const wa = (p, k) => (WANIM[p.stats.weaponType] || WANIM.sword)[k];

/** 무적 유지 (깜빡임 없는 값으로 iframes 를 매 프레임 유지) */
function holdInvuln(p) { p.iframes = 0.075; }

/** 분신/잔상용 영웅 스냅샷 */
function ghostOf(p, cx, bottom, over = {}) {
  const s = p.snapshot();
  s.x = cx - p.w / 2; s.y = bottom - p.h; s.cx = cx; s.bottom = bottom;
  return Object.assign(s, over);
}
function afterimage(w, p, tint, life = 0.24) {
  const s = p.snapshot();
  w.fx.ghost((ctx, a) => drawHero(ctx, s, w, { alpha: a, tint }), life);
}

// ═══════════════════════════ 연출 엔티티 ═══════════════════════════
/**
 * 스킬 이펙트/판정 엔티티.
 * o: { x,y,w,h(컬링·판정 영역), life, delay, z, atk(공격 객체), win:[시작,끝](수명 비율 판정 구간), rect(e)→판정 사각형,
 *      start(e,w), follow(e,w), tick(e,w,dt), end(e,w), onHit(e,w,n), draw(ctx,e,w), light(L,e), d(사용자 데이터) }
 * e.lt = 활성 후 경과 시간, e.k = 진행도 0→1
 */
export class SkillFx extends Entity {
  constructor(o) {
    super(o.x ?? 0, o.y ?? 0, o.w ?? 8, o.h ?? 8);
    this.kind = 'effect';
    this.z = o.z ?? 8;
    this.life = o.life ?? 0.5;
    this.delay = o.delay ?? 0;
    this.o = o; this.d = o.d || {};
    this.k = 0; this.lt = 0; this.started = false;
    this.atk = o.atk || null; this.win = o.win || [0, 1];
  }
  update(dt, world) {
    this.t += dt;
    if (this.t < this.delay) return;
    this.lt = this.t - this.delay;
    const o = this.o;
    if (!this.started) { this.started = true; o.start?.(this, world); if (this.dead) return; }
    this.k = clamp(this.lt / this.life, 0, 1);
    o.follow?.(this, world);
    o.tick?.(this, world, dt);
    if (this.dead) return;
    if (this.atk && this.k >= this.win[0] && this.k <= this.win[1]) {
      const r = o.rect ? o.rect(this, world) : this.rect();
      if (r) {
        const n = playerStrike(world, r, this.atk);
        if (n) o.onHit?.(this, world, n);
        if (world.game.debug) world.debugRects.push(r);
      }
    }
    if (this.lt >= this.life) { this.dead = true; o.end?.(this, world); }
  }
  lights(L) { if (this.started && !this.dead && this.o.light) this.o.light(L, this); }
  draw(ctx, world) {
    if (!this.started || !this.o.draw) return;
    ctx.save();
    this.o.draw(ctx, this, world);
    ctx.restore();
  }
}
function fx(w, o) { return w.add(new SkillFx(o)); }

/** 시간표 실행기: steps = [[초, (w, e) => {}], ...] */
function seq(w, steps, o = {}) {
  steps.sort((a, b) => a[0] - b[0]);
  const life = (steps.length ? steps[steps.length - 1][0] : 0) + 0.02;
  const tick0 = o.tick;
  return fx(w, {
    life, ...o, d: { i: 0, ...(o.d || {}) },
    tick(e, ww, dt) {
      while (e.d.i < steps.length && steps[e.d.i][0] <= e.lt) steps[e.d.i++][1](ww, e);
      tick0?.(e, ww, dt);
    },
  });
}

/** 투사체 발사 (스킬 공격 포함) */
function shoot(w, p, o) {
  return w.spawnProjectile({ owner: p, team: 'player', pierce: 1, life: 1, ...o });
}

// ═══════════════════════════ 그리기 도구 ═══════════════════════════
const ADD = 'lighter';
// ── 캐시 스프라이트: 색마다 한 번 구운 작은 캔버스 (LRU 상한). 알파는 선형이라 globalAlpha 로 곱해도 예전 그라디언트와 같은 모양 ──
const SPR = new Map();
const SPR_MAX = 72;
function spr(key, w, h, bake) {
  let c = SPR.get(key);
  if (c) return c;
  if (typeof document === 'undefined' || !document.createElement) return null;
  if (SPR.size >= SPR_MAX) { const k0 = SPR.keys().next().value; c = SPR.get(k0); SPR.delete(k0); }
  else c = document.createElement('canvas');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const x = c.getContext('2d');
  if (!x) return null;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h);
  try { bake(x, w, h); } catch (e) { console.warn('[skills] sprite', key, e); }
  SPR.set(key, c);
  return c;
}
/** 둥근 빛 (예전 glow 와 같은 3단 그라디언트) */
function glowSprite(col) {
  return spr('g' + col, 96, 96, (x, w) => {
    const R = w / 2, g = x.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.35, rgba(col, 0.45)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
}
/** 빛기둥 단면 (가로 단면 vert=false 는 beamV, 세로 단면 vert=true 는 beamH 용) */
function beamSprite(col, core, vert) {
  return spr((vert ? 'bh' : 'bv') + col + core, vert ? 2 : 64, vert ? 64 : 2, (x, w, h) => {
    const g = vert ? x.createLinearGradient(0, 0, 0, h) : x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.22, rgba(col, 0.22)); g.addColorStop(0.4, rgba(col, 0.75));
    g.addColorStop(0.5, rgba(core, 1)); g.addColorStop(0.6, rgba(col, 0.75)); g.addColorStop(0.78, rgba(col, 0.22)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
}
/** 캐시 캔버스를 알파 a 로 그린다 (지금 globalAlpha 에 곱함) */
function blit(ctx, img, x, y, w, h, a) {
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(img, x, y, w, h);
  ctx.globalAlpha = ga;
}
function glow(ctx, x, y, r, col, a = 1) {
  if (r <= 1 || a <= 0.01) return;
  const s = glowSprite(col);
  if (s) { blit(ctx, s, x - r, y - r, r * 2, r * 2, a); return; }
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.35, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
/** 세로 빛기둥 */
function beamV(ctx, x, y0, y1, w, col, a = 1, core = '#ffffff') {
  if (a <= 0.01 || w <= 0.5 || y1 === y0) return;
  const s = beamSprite(col, core, false);
  if (s) { blit(ctx, s, x - w, Math.min(y0, y1), w * 2, Math.abs(y1 - y0), a); return; }
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.22, rgba(col, 0.22 * a)); g.addColorStop(0.4, rgba(col, 0.75 * a));
  g.addColorStop(0.5, rgba(core, a)); g.addColorStop(0.6, rgba(col, 0.75 * a)); g.addColorStop(0.78, rgba(col, 0.22 * a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - w, y0, w * 2, y1 - y0);
}
/** 가로 빛줄기 */
function beamH(ctx, x0, x1, y, h, col, a = 1, core = '#ffffff') {
  if (a <= 0.01 || h <= 0.5 || x1 === x0) return;
  const s = beamSprite(col, core, true);
  if (s) { blit(ctx, s, Math.min(x0, x1), y - h, Math.abs(x1 - x0), h * 2, a); return; }
  const g = ctx.createLinearGradient(0, y - h, 0, y + h);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.22, rgba(col, 0.22 * a)); g.addColorStop(0.4, rgba(col, 0.75 * a));
  g.addColorStop(0.5, rgba(core, a)); g.addColorStop(0.6, rgba(col, 0.75 * a)); g.addColorStop(0.78, rgba(col, 0.22 * a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), y - h, Math.abs(x1 - x0), h * 2);
}
/** 번개 경로 (평평한 배열 [x,y,x,y...]) */
function boltPts(x0, y0, x1, y1, n = 10, jag = 26) {
  const pts = [x0, y0];
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  for (let i = 1; i < n; i++) {
    const t = i / n, off = rand(-jag, jag) * Math.sin(t * Math.PI);
    pts.push(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
  }
  pts.push(x1, y1);
  return pts;
}
function strokePts(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); }
function drawBolt(ctx, pts, col, wd, a = 1) {
  ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(col, 0.22 * a); ctx.lineWidth = wd * 4.5; strokePts(ctx, pts);
  ctx.strokeStyle = rgba(col, 0.75 * a); ctx.lineWidth = wd * 1.7; strokePts(ctx, pts);
  ctx.strokeStyle = rgba('#ffffff', a); ctx.lineWidth = wd * 0.6; strokePts(ctx, pts);
}
/** 초승달(검기). 원점 기준 +x 방향이 두꺼운 쪽. R=반지름, d=두께 */
function crescent(ctx, R, d, col, a = 1, edge = '#ffffff') {
  if (a <= 0.01) return;
  d = clamp(d, 2, R * 1.6);
  const yI = Math.sqrt(Math.max(1, R * R - d * d / 4));
  const a0 = Math.atan2(yI, -d / 2), b0 = Math.atan2(yI, d / 2);
  ctx.globalCompositeOperation = ADD;
  glow(ctx, R * 0.25, 0, R * 1.25, col, 0.35 * a);
  const g = ctx.createLinearGradient(-R * 0.4, 0, R, 0);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.55, rgba(col, 0.8 * a)); g.addColorStop(0.92, rgba(edge, a)); g.addColorStop(1, rgba(edge, a));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, R, -a0, a0, false); ctx.arc(-d, 0, R, b0, -b0, true); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba(edge, 0.9 * a); ctx.lineWidth = Math.max(1.5, d * 0.12);
  ctx.beginPath(); ctx.arc(0, 0, R - 1, -a0 * 0.8, a0 * 0.8); ctx.stroke();
}
/** 빛의 칼선 (가운데가 두꺼운 마름모 선) */
function cutLine(ctx, x0, y0, x1, y1, wd, col, a = 1) {
  if (a <= 0.01) return;
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.globalCompositeOperation = ADD;
  ctx.fillStyle = rgba(col, 0.45 * a);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx + nx * wd * 2.4, my + ny * wd * 2.4); ctx.lineTo(x1, y1); ctx.lineTo(mx - nx * wd * 2.4, my - ny * wd * 2.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba('#ffffff', a);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(mx + nx * wd * 0.55, my + ny * wd * 0.55); ctx.lineTo(x1, y1); ctx.lineTo(mx - nx * wd * 0.55, my - ny * wd * 0.55); ctx.closePath(); ctx.fill();
}
/** 마법진 (sy<1 이면 바닥에 눕힌 원근) */
function runeCircle(ctx, x, y, r, col, rot, a = 1, sy = 0.3, sides = 6) {
  if (a <= 0.01 || r < 2) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, sy); ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, 0, r * 1.1, col, 0.35 * a);
  ctx.strokeStyle = rgba(col, 0.95 * a); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.8 * a);
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const t = rot + (i * 2 % sides) / sides * TAU + (sides % 2 ? 0 : (i % 2) * Math.PI / sides);
    const px = Math.cos(t) * r * 0.82, py = Math.sin(t) * r * 0.82;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke();
  ctx.strokeStyle = rgba(col, 0.8 * a); ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const t = -rot * 0.6 + i / 16 * TAU, c = Math.cos(t), s = Math.sin(t);
    ctx.beginPath(); ctx.moveTo(c * r * 0.88, s * r * 0.88); ctx.lineTo(c * r * (i % 2 ? 0.95 : 0.99), s * r * (i % 2 ? 0.95 : 0.99)); ctx.stroke();
  }
  ctx.restore();
}
/** 솟구치는 가시(바위·피·얼음). base=지면 y, h=높이 */
function spike(ctx, x, base, h, wd, c1, c2, rim, seed = 0.5) {
  if (h < 2) return;
  const s1 = (seed - 0.5) * wd * 0.5;
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createLinearGradient(x - wd, 0, x + wd, 0);
  g.addColorStop(0, c2); g.addColorStop(0.42, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - wd, base); ctx.lineTo(x - wd * 0.62, base - h * 0.42); ctx.lineTo(x - wd * 0.3 + s1, base - h * 0.72);
  ctx.lineTo(x + s1 * 0.6, base - h); ctx.lineTo(x + wd * 0.38, base - h * 0.6); ctx.lineTo(x + wd * 0.58, base - h * 0.3); ctx.lineTo(x + wd, base);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(8,4,10,0.75)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalCompositeOperation = ADD;
  ctx.strokeStyle = rim; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - wd * 0.9, base - 2); ctx.lineTo(x - wd * 0.6, base - h * 0.42); ctx.lineTo(x - wd * 0.28 + s1, base - h * 0.72); ctx.lineTo(x + s1 * 0.6, base - h + 2); ctx.stroke();
}
/** 불기둥 */
function flameCol(ctx, x, base, wd, h, t, c1 = '#ff7a2a', c2 = '#ffd070', a = 1) {
  if (a <= 0.01 || h < 2) return;
  ctx.globalCompositeOperation = ADD;
  for (let i = 0; i < 4; i++) {
    const hh = h * (1 - i * 0.17) * (0.9 + 0.1 * Math.sin(t * 31 + i * 2.1));
    const ww = wd * (1 - i * 0.2);
    const cx = x + Math.sin(t * 17 + i * 1.7) * wd * 0.14;
    const cy = base - hh * 0.42;
    const g = ctx.createRadialGradient(cx, base - hh * 0.25, 0, cx, cy, hh * 0.62);
    g.addColorStop(0, i === 3 ? rgba('#ffffff', a) : rgba(c2, 0.9 * a)); g.addColorStop(0.5, rgba(c1, 0.6 * a)); g.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, ww, hh * 0.55, 0, 0, TAU); ctx.fill();
  }
}
/** 혀처럼 솟구치는 불꽃 기둥 (c1=바깥, c2=속불). 불꽃 혀가 아래에서 위로 흘러 올라간다 */
function fireColumn(ctx, x, base, wd, h, t, a = 1, c1 = '#ff5a14', c2 = '#ffc860', core = '#fff4d0') {
  if (a <= 0.01 || h < 4) return;
  ctx.globalCompositeOperation = ADD;
  const bg = ctx.createRadialGradient(x, base, 0, x, base, wd * 2.4);
  bg.addColorStop(0, rgba(c2, 0.55 * a)); bg.addColorStop(1, rgba(c1, 0));
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(x, base, wd * 2.4, wd * 0.7, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 8; i++) {
    const ph = (t * 2.4 + i / 8) % 1;
    const y = base - ph * h, sz = wd * (1.05 - ph * 0.75), al = a * (ph < 0.12 ? ph / 0.12 : 1 - (ph - 0.12) / 0.88);
    const xo = x + Math.sin(t * 9 + i * 2.3) * wd * 0.28 * ph;
    const g = ctx.createRadialGradient(xo, y + sz * 0.5, 0, xo, y, sz * 1.5);
    g.addColorStop(0, rgba(c2, 0.75 * al)); g.addColorStop(0.45, rgba(c1, 0.45 * al)); g.addColorStop(1, rgba(c1, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(xo, y, sz * 0.8, sz * 1.5, 0, 0, TAU); ctx.fill();
  }
  const cg = ctx.createLinearGradient(x - wd * 0.35, 0, x + wd * 0.35, 0);
  cg.addColorStop(0, rgba(c2, 0)); cg.addColorStop(0.5, rgba(core, 0.75 * a)); cg.addColorStop(1, rgba(c2, 0));
  ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(x - wd * 0.35, base); ctx.quadraticCurveTo(x - wd * 0.2, base - h * 0.5, x, base - h * 0.9); ctx.quadraticCurveTo(x + wd * 0.2, base - h * 0.5, x + wd * 0.35, base); ctx.closePath(); ctx.fill();
}
/** 깃털 날개 (원점=어깨, +x 방향으로 뻗고 위로 들림). spread 0~1. 깃털이 팔 뼈대를 따라 매달려 실루엣이 선다 */
function wing(ctx, s, spread, col, col2, a = 1, dark = false) {
  if (a <= 0.01) return;
  ctx.save();
  const ex = s * 0.42, ey = -s * (0.12 + 0.38 * spread), wx = s * (0.7 + 0.25 * spread), wy = -s * (0.05 + 0.55 * spread);
  const q = (p0, p1, p2, t) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
  const rows = [[11, 1.0, 0.075], [8, 0.62, 0.085], [6, 0.36, 0.09]]; // 칼깃 → 덮깃
  for (let r = 0; r < rows.length; r++) {
    const [n, lk, wk] = rows[r];
    for (let i = n - 1; i >= 0; i--) {
      const t = 0.08 + 0.92 * i / (n - 1);
      const bx = q(0, ex, wx, t), by = q(0, ey, wy, t);
      const len = s * lk * lerp(0.42, 0.95, t) * (0.75 + 0.25 * spread);
      const ang = lerp(1.75, 0.35, t) - 0.25 * (1 - spread) + r * 0.08;
      const cx = bx + Math.cos(ang) * len * 0.5, cy = by + Math.sin(ang) * len * 0.5;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      const g = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
      if (dark) { g.addColorStop(0, rgba(col2, a)); g.addColorStop(1, rgba(col, a)); }
      else { g.addColorStop(0, rgba(col2, 0.9 * a)); g.addColorStop(0.75, rgba(col, 0.75 * a)); g.addColorStop(1, rgba(col, 0.1 * a)); }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.quadraticCurveTo(0, -s * wk, len / 2, 0); ctx.quadraticCurveTo(0, s * wk * 0.6, -len / 2, 0); ctx.fill();
      if (dark || r === 0) { ctx.strokeStyle = dark ? rgba('#000000', 0.55 * a) : rgba(col2, 0.35 * a); ctx.lineWidth = 1; ctx.stroke(); }
      ctx.restore();
    }
  }
  ctx.globalCompositeOperation = ADD;
  ctx.strokeStyle = rgba(dark ? '#b060ff' : '#ffffff', 0.7 * a); ctx.lineWidth = Math.max(1.5, s * 0.03); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(ex, ey, wx, wy); ctx.stroke();
  ctx.restore();
}
/** 대검/장검 실루엣 (원점=손잡이 끝, +y 방향이 칼끝) */
function bigSword(ctx, len, wd, col, a = 1, glowCol = '#fff2b0') {
  if (a <= 0.01) return;
  const hilt = len * 0.2;
  ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, len * 0.55, len * 0.6, glowCol, 0.35 * a);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a;
  // 손잡이 + 폼멜
  ctx.fillStyle = '#3a2418'; ctx.fillRect(-wd * 0.14, 0, wd * 0.28, hilt);
  ctx.fillStyle = '#e8c872'; ctx.beginPath(); ctx.arc(0, -wd * 0.08, wd * 0.22, 0, TAU); ctx.fill();
  // 가드
  const gg = ctx.createLinearGradient(-wd, 0, wd, 0);
  gg.addColorStop(0, '#8a6a2a'); gg.addColorStop(0.5, '#ffe7a0'); gg.addColorStop(1, '#8a6a2a');
  ctx.fillStyle = gg; ctx.fillRect(-wd * 1.1, hilt - wd * 0.14, wd * 2.2, wd * 0.28);
  // 칼날
  const bg = ctx.createLinearGradient(-wd / 2, 0, wd / 2, 0);
  bg.addColorStop(0, '#6a7080'); bg.addColorStop(0.45, col); bg.addColorStop(0.55, '#ffffff'); bg.addColorStop(1, '#8a90a0');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.moveTo(-wd / 2, hilt + wd * 0.14); ctx.lineTo(wd / 2, hilt + wd * 0.14); ctx.lineTo(wd * 0.42, len * 0.9); ctx.lineTo(0, len); ctx.lineTo(-wd * 0.42, len * 0.9); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(10,6,14,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalCompositeOperation = ADD;
  ctx.strokeStyle = rgba(glowCol, 0.8 * a); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, hilt + wd * 0.3); ctx.lineTo(0, len * 0.95); ctx.stroke();
  ctx.globalAlpha = 1;
}
/** 박쥐 (s=크기, flap=-1~1) */
function batShape(ctx, s, flap, body = '#12060c', eye = '#ff2a3a', rim = '#ff4a6a') {
  const wy = flap * s * 0.7;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.15);
  ctx.quadraticCurveTo(s * 0.6, -s * 0.2 + wy, s * 1.25, -s * 0.1 + wy * 1.2);
  ctx.lineTo(s * 0.95, s * 0.12 + wy * 0.6); ctx.lineTo(s * 0.7, s * 0.02 + wy * 0.5); ctx.lineTo(s * 0.45, s * 0.2 + wy * 0.3);
  ctx.lineTo(0, s * 0.25);
  ctx.lineTo(-s * 0.45, s * 0.2 + wy * 0.3); ctx.lineTo(-s * 0.7, s * 0.02 + wy * 0.5); ctx.lineTo(-s * 0.95, s * 0.12 + wy * 0.6);
  ctx.lineTo(-s * 1.25, -s * 0.1 + wy * 1.2);
  ctx.quadraticCurveTo(-s * 0.6, -s * 0.2 + wy, 0, -s * 0.15);
  ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.2, s * 0.3, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * 0.16, -s * 0.2); ctx.lineTo(-s * 0.08, -s * 0.42); ctx.lineTo(0, -s * 0.22); ctx.lineTo(s * 0.08, -s * 0.42); ctx.lineTo(s * 0.16, -s * 0.2); ctx.fill();
  ctx.globalCompositeOperation = ADD;
  ctx.strokeStyle = rgba(rim, 0.55); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-s * 1.25, -s * 0.1 + wy * 1.2); ctx.quadraticCurveTo(-s * 0.6, -s * 0.2 + wy, 0, -s * 0.15); ctx.quadraticCurveTo(s * 0.6, -s * 0.2 + wy, s * 1.25, -s * 0.1 + wy * 1.2); ctx.stroke();
  ctx.fillStyle = eye; ctx.fillRect(-s * 0.11, -s * 0.08, s * 0.08, s * 0.06); ctx.fillRect(s * 0.03, -s * 0.08, s * 0.08, s * 0.06);
  ctx.globalCompositeOperation = 'source-over';
}
/** 까마귀 (원점 중심, +x 방향 비행) */
function ravenShape(ctx, s, flap) {
  const wy = flap * s * 0.8;
  ctx.fillStyle = '#0c0a12';
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.62, s * 0.24, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.12); ctx.lineTo(s * 0.95, s * 0.02); ctx.lineTo(s * 0.5, s * 0.1); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.lineTo(-s * 1.0, -s * 0.18); ctx.lineTo(-s * 0.95, s * 0.12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.1); ctx.quadraticCurveTo(-s * 0.1, -s * 0.6 + wy, -s * 0.55, -s * 0.9 + wy * 1.3); ctx.lineTo(-s * 0.35, -s * 0.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8c872'; ctx.beginPath(); ctx.moveTo(s * 0.92, -s * 0.02); ctx.lineTo(s * 1.18, s * 0.04); ctx.lineTo(s * 0.9, s * 0.08); ctx.fill();
  ctx.globalCompositeOperation = ADD;
  ctx.fillStyle = '#ff3040'; ctx.beginPath(); ctx.arc(s * 0.72, -s * 0.06, s * 0.06, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(160,120,255,0.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.1); ctx.quadraticCurveTo(-s * 0.1, -s * 0.6 + wy, -s * 0.55, -s * 0.9 + wy * 1.3); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
/** 깃털 (원점 중심, +x 방향) */
function featherShape(ctx, s, col, col2) {
  ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, 0, s * 1.1, col, 0.35);
  const g = ctx.createLinearGradient(-s, 0, s, 0);
  g.addColorStop(0, rgba(col2, 0.1)); g.addColorStop(0.5, rgba(col2, 0.9)); g.addColorStop(1, rgba('#ffffff', 1));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.quadraticCurveTo(0, -s * 0.34, -s, -s * 0.08); ctx.lineTo(-s * 0.8, 0); ctx.lineTo(-s, s * 0.08); ctx.quadraticCurveTo(0, s * 0.34, s, 0); ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 1.1, 0); ctx.lineTo(s, 0); ctx.stroke();
}
/** 트럼프 카드 */
function cardShape(ctx, wd, ht, rank, suit, a = 1) {
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-wd / 2 + 3, -ht / 2 + 3, wd, ht);
  const g = ctx.createLinearGradient(0, -ht / 2, 0, ht / 2);
  g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#e8dcc4');
  ctx.fillStyle = g; ctx.fillRect(-wd / 2, -ht / 2, wd, ht);
  ctx.strokeStyle = '#c8a040'; ctx.lineWidth = 2; ctx.strokeRect(-wd / 2 + 2, -ht / 2 + 2, wd - 4, ht - 4);
  const red = suit === '♥' || suit === '♦';
  ctx.fillStyle = red ? '#c0142a' : '#141018';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(ht * 0.2)}px "Cinzel", serif`;
  ctx.fillText(rank, -wd * 0.28, -ht * 0.32);
  ctx.font = `900 ${Math.round(ht * 0.46)}px serif`;
  ctx.fillText(suit, 0, ht * 0.06);
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}
/** 4갈래 반짝임 */
function flare(ctx, x, y, s, col, a = 1, rot = 0) {
  if (a <= 0.01 || s < 1) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalCompositeOperation = ADD;
  ctx.fillStyle = rgba(col, 0.9 * a);
  for (let i = 0; i < 2; i++) {
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(0, -s * 0.09); ctx.lineTo(s, 0); ctx.lineTo(0, s * 0.09); ctx.closePath(); ctx.fill();
    ctx.rotate(Math.PI / 2);
  }
  ctx.fillStyle = rgba('#ffffff', a); ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, TAU); ctx.fill();
  ctx.restore();
}
/** 폭발 (판정 + 연출) */
function boom(w, p, x, y, r, o = {}) {
  const c1 = o.c1 ?? '#ff7a2a', c2 = o.c2 ?? '#ffd070';
  const a = atk(p, { mv: o.mv ?? 1.5, element: o.element === undefined ? 'fire' : o.element, kb: o.kb ?? [320, -380], hitstop: o.hitstop ?? 0.08, shake: o.shake ?? 6, ...(o.type ? { type: o.type } : {}), ...(o.atk || {}) });
  a.dir = Math.sign(x - p.cx) || p.facing;
  const n = playerStrike(w, circ(x, y, r), a);
  if (n && o.onHit) o.onHit(n);
  fx(w, {
    x: x - r * 1.6, y: y - r * 1.6, w: r * 3.2, h: r * 3.2, life: 0.45, z: 12,
    draw(ctx, e) {
      const k = e.k, kk = ease.outCubic(Math.min(1, k * 3));
      ctx.globalCompositeOperation = ADD;
      glow(ctx, x, y, r * (0.7 + kk * 0.9), c1, (1 - k) * 0.85);
      glow(ctx, x, y, r * 0.6 * (1 - k * 0.6), c2, 1 - k);
      if (k < 0.3) glow(ctx, x, y, r * 0.35, '#ffffff', 1 - k / 0.3);
      ctx.strokeStyle = rgba(c2, (1 - k) * 0.85); ctx.lineWidth = 7 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(x, y, r * (0.3 + kk * 1.05), 0, TAU); ctx.stroke();
    },
    light(L, e) { L.add(x, y, r * 3, c1, 1.3 * (1 - e.k)); },
  });
  w.fx.burst('fire', x, y, Math.round(8 + r / 10), { speed: r * 3, color: c1, color2: c2 });
  w.fx.burst('ember', x, y, 8, { speed: r * 2.6, color: c2 });
  w.fx.burst('smoke', x, y, 5, { speed: 80 });
  shake(w, o.shake ?? 7, 0.3);
  audio.sfx(o.sfx ?? 'explode', { pitch: rand(0.9, 1.1) });
}
/** 지면에서 솟는 가시 연쇄 (대지 가르기 / 블러드 스피어 / 지옥참 공용) */
function spikeFx(w, p, x, base, h, wd, delay, a, style) {
  const seed = Math.random();
  fx(w, {
    delay, life: 0.62, z: 9, x: x - wd * 2, y: base - h - 20, w: wd * 4, h: h + 30, atk: a, win: [0, 0.3], onHit: style.onHit,
    rect(e) { const up = ease.outBack(clamp(e.lt / 0.1, 0, 1)); return { x: x - wd * 0.8, y: base - h * up, w: wd * 1.6, h: h * up }; },
    start(e, ww) {
      ww.fx.burst(style.dust ?? 'dust', x, base - 4, 7, { angle: -Math.PI / 2, spread: 1.2, speed: 160, color: style.dustCol });
      ww.fx.burst(style.bits ?? 'shard', x, base - 10, 6, { angle: -Math.PI / 2, spread: 0.9, speed: 360, color: style.bitCol });
      audio.sfx(style.sfx ?? 'break_wall', { vol: 0.5, pitch: rand(0.9, 1.2) });
      shake(ww, 2.5, 0.1);
    },
    draw(ctx, e) {
      const up = ease.outBack(clamp(e.lt / 0.1, 0, 1)), fade = 1 - clamp((e.k - 0.6) / 0.4, 0, 1);
      const sink = e.k > 0.6 ? (e.k - 0.6) / 0.4 * h * 0.5 : 0;
      ctx.globalAlpha = fade;
      ctx.save(); ctx.beginPath(); ctx.rect(x - wd * 3, base - h * 2, wd * 6, h * 2); ctx.clip();
      spike(ctx, x - wd * 0.9, base + sink, h * 0.55 * up, wd * 0.6, style.c1, style.c2, style.rim, 1 - seed);
      spike(ctx, x + wd * 0.8, base + sink, h * 0.42 * up, wd * 0.5, style.c1, style.c2, style.rim, seed * 0.5);
      spike(ctx, x, base + sink, h * up, wd, style.c1, style.c2, style.rim, seed);
      ctx.restore();
      ctx.globalAlpha = 1;
      if (style.glow) { ctx.globalCompositeOperation = ADD; glow(ctx, x, base - h * 0.15 * up, h * 0.7, style.glow, 0.3 * fade); }
    },
    light(L, e) { if (style.glow) L.add(x, base - h * 0.5, h * 1.6, style.glow, 0.7 * (1 - e.k)); },
  });
}

// ═══════════════════════════ 투사체 그림 ═══════════════════════════
function crossRender(ctx, pr) {
  const S = pr.w * 0.5;
  ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, 0, S * 2.3, '#ffe7a0', 0.5);
  ctx.rotate(pr.rot);
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createLinearGradient(-S, -S, S, S);
  g.addColorStop(0, '#fff6c8'); g.addColorStop(0.5, '#e8b440'); g.addColorStop(1, '#8a5a18');
  ctx.fillStyle = g; ctx.strokeStyle = '#2a1606'; ctx.lineWidth = 2;
  const a = S * 0.26, L = S;
  ctx.beginPath();
  ctx.moveTo(-a, -L); ctx.lineTo(a, -L); ctx.lineTo(a, -a); ctx.lineTo(L, -a); ctx.lineTo(L, a); ctx.lineTo(a, a);
  ctx.lineTo(a, L); ctx.lineTo(-a, L); ctx.lineTo(-a, a); ctx.lineTo(-L, a); ctx.lineTo(-L, -a); ctx.lineTo(-a, -a); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.globalCompositeOperation = ADD;
  ctx.fillStyle = 'rgba(255,255,235,0.85)';
  ctx.fillRect(-a * 0.3, -L * 0.85, a * 0.6, L * 1.7); ctx.fillRect(-L * 0.85, -a * 0.3, L * 1.7, a * 0.6);
  glow(ctx, 0, 0, S * 0.8, '#ffffff', 0.8);
}
function knifeRender(ctx, pr) {
  const s = pr.scale;
  ctx.rotate(Math.atan2(pr.vy, pr.vx));
  ctx.globalCompositeOperation = ADD;
  const g = ctx.createLinearGradient(-64 * s, 0, 0, 0);
  g.addColorStop(0, 'rgba(150,190,255,0)'); g.addColorStop(1, 'rgba(210,230,255,0.65)');
  ctx.fillStyle = g; ctx.fillRect(-64 * s, -2 * s, 64 * s, 4 * s);
  ctx.globalCompositeOperation = 'source-over';
  const bg = ctx.createLinearGradient(0, -5 * s, 0, 5 * s);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#c8d4ec'); bg.addColorStop(1, '#6a7490');
  ctx.fillStyle = bg; ctx.strokeStyle = '#141018'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(22 * s, 0); ctx.lineTo(0, -5 * s); ctx.lineTo(-2 * s, 0); ctx.lineTo(0, 5 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c8a040'; ctx.fillRect(-4 * s, -6 * s, 3 * s, 12 * s);
  ctx.fillStyle = '#3a2418'; ctx.fillRect(-15 * s, -2.5 * s, 11 * s, 5 * s);
  ctx.globalCompositeOperation = ADD; glow(ctx, 18 * s, 0, 9 * s, '#ffffff', 0.8);
}
function ravenRender(ctx, pr) {
  const a = Math.atan2(pr.vy, pr.vx);
  ctx.rotate(a); if (Math.cos(a) < 0) ctx.scale(1, -1);
  ctx.globalCompositeOperation = ADD; glow(ctx, 0, 0, 28 * pr.scale, pr.color || '#7a4aff', 0.35);
  ctx.globalCompositeOperation = 'source-over';
  ravenShape(ctx, 18 * pr.scale, Math.sin(pr.t * 26 + pr.ox));
}
function batRender(ctx, pr) {
  const a = Math.atan2(pr.vy, pr.vx);
  ctx.rotate(Math.cos(a) < 0 ? a - Math.PI : a);
  ctx.globalCompositeOperation = ADD; glow(ctx, 0, 0, 26 * pr.scale, '#ff2040', 0.35);
  ctx.globalCompositeOperation = 'source-over';
  batShape(ctx, 17 * pr.scale, Math.sin(pr.t * 30 + pr.ox));
}
function holyOrbRender(ctx, pr) {
  const s = pr.scale, c = pr.color || '#fff2b0';
  ctx.globalCompositeOperation = ADD;
  ctx.save(); ctx.rotate(Math.atan2(pr.vy, pr.vx));
  const g = ctx.createLinearGradient(-56 * s, 0, 0, 0);
  g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, rgba(c, 0.65));
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-24 * s, 0, 28 * s, 5 * s, 0, 0, TAU); ctx.fill();
  ctx.restore();
  glow(ctx, 0, 0, 26 * s, c, 0.7); glow(ctx, 0, 0, 9 * s, '#ffffff', 1);
  flare(ctx, 0, 0, 22 * s, c, 0.9, pr.t * 5);
}
function fireballRender(ctx, pr) {
  const s = pr.scale;
  ctx.rotate(Math.atan2(pr.vy, pr.vx));
  ctx.globalCompositeOperation = ADD;
  for (let i = 4; i >= 0; i--) {
    const tt = pr.t * 24 + i * 1.7;
    glow(ctx, -15 * s * i + Math.sin(tt) * 2, Math.cos(tt * 1.3) * 3 * s, (22 - i * 3) * s, i < 2 ? '#ff9a3a' : '#ff4a1a', 0.75 - i * 0.12);
  }
  glow(ctx, 0, 0, 32 * s, '#ff7a2a', 0.8); glow(ctx, 2 * s, 0, 15 * s, '#ffe7a0', 1); glow(ctx, 4 * s, 0, 7 * s, '#ffffff', 1);
}
function crescentRender(ctx, pr) {
  const d = Math.sign(pr.vx) || 1;
  ctx.scale(d, 1);
  const k = pr.fadeIn ? Math.min(1, pr.t * 12) : 1;
  const R = pr.h * 0.5;
  crescent(ctx, R * (0.85 + 0.15 * k), R * 0.42, pr.color, 1, pr.edge || '#ffffff');
  if (pr.color2) { ctx.globalCompositeOperation = ADD; glow(ctx, R * 0.3, 0, R * 0.9, pr.color2, 0.3); }
}
function lanceRender(ctx, pr) {
  const s = pr.scale, c = pr.color || '#fff2b0';
  ctx.rotate(Math.atan2(pr.vy, pr.vx));
  ctx.globalCompositeOperation = ADD;
  const g = ctx.createLinearGradient(-90 * s, 0, 20 * s, 0);
  g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.7, rgba(c, 0.8)); g.addColorStop(1, rgba('#ffffff', 1));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(24 * s, 0); ctx.lineTo(4 * s, -6 * s); ctx.lineTo(-90 * s, -2 * s); ctx.lineTo(-90 * s, 2 * s); ctx.lineTo(4 * s, 6 * s); ctx.closePath(); ctx.fill();
  glow(ctx, 10 * s, 0, 22 * s, c, 0.7);
}

// ═══════════════════════════ 카엘 ═══════════════════════════
SKILL_IMPL.kael_vigilia = (p, w, lv) => {
  const id = 'kael_vigilia', f = p.facing, R = V(id, 'r', lv), th = 34 + lv * 4, s = SZ(lv);
  pose(p, w, 'lash', 0.44, { h0: 0.1, hw: 0.1, sfx: 'whip_crack' });
  const a = atk(p, { mv: MV(id, lv), element: 'holy', kb: [140, -660], launch: true, hitstop: 0.09, shake: 6, stun: 0.5 });
  fx(w, {
    delay: 0.09 / p.atkSpeedMul, life: 0.34, z: 11, atk: a, win: [0, 0.4],
    follow(e) { e.d.x0 = p.cx + f * 20; e.d.y0 = p.bottom - 64; e.x = f > 0 ? e.d.x0 : e.d.x0 - R; e.y = e.d.y0 - th / 2; e.w = R; e.h = th; },
    start(e, ww) { audio.sfx('holy', { vol: 0.6, pitch: 1.2 }); shake(ww, 3, 0.1); },
    tick(e, ww) {
      if (e.lt < 0.14) for (let i = 0; i < 2; i++) ww.fx.emit('holy', e.d.x0 + f * R * Math.random() * Math.min(1, e.lt / 0.075), e.d.y0 + rand(-8, 8), { speed: 90 });
    },
    draw(ctx, e) {
      const ext = ease.outCubic(clamp(e.lt / 0.075, 0, 1)), fade = 1 - clamp((e.k - 0.35) / 0.65, 0, 1);
      const x0 = e.d.x0, y0 = e.d.y0, L = R * ext, pts = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16;
        pts.push(x0 + f * L * u, y0 + Math.sin(u * 10 - e.lt * 70) * 8 * (1 - u) * (1.2 - ext * 0.6) - Math.sin(u * Math.PI) * 5);
      }
      ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba('#fff2b0', 0.2 * fade); ctx.lineWidth = th * 0.8; strokePts(ctx, pts);
      ctx.strokeStyle = rgba('#ffc850', 0.8 * fade); ctx.lineWidth = 6 * s; strokePts(ctx, pts);
      ctx.strokeStyle = rgba('#ffffff', fade); ctx.lineWidth = 2.4; strokePts(ctx, pts);
      const tx = pts[pts.length - 2], ty = pts[pts.length - 1];
      glow(ctx, tx, ty, 64 * s * (1.2 - e.k), '#fff2b0', fade);
      flare(ctx, tx, ty, 42 * s * (1 - e.k * 0.4), '#fff2b0', fade, e.lt * 4);
    },
    light(L, e) { L.add(e.d.x0 + f * R * Math.min(1, e.lt / 0.075), e.d.y0, 160 * s, '#fff2b0', 1.1 * (1 - e.k)); },
  });
};

SKILL_IMPL.kael_tempest = (p, w, lv) => {
  const id = 'kael_tempest', r = V(id, 'r', lv), T = V(id, 't', lv);
  pose(p, w, 'spin', 0.56, { h0: 0.1, hw: 0.3, sfx: 'whip_crack', mv: { canMove: true } });
  fx(w, {
    life: T, z: 11, d: { a: 0, snd: 0 },
    atk: atk(p, { mv: MV(id, lv), element: 'holy', kb: [260, -240], rehit: 0.14, hitstop: 0.03, shake: 2 }), win: [0.04, 1],
    follow(e) { e.d.cx = p.cx; e.d.cy = p.bottom - 50; e.x = p.cx - r; e.y = e.d.cy - r; e.w = r * 2; e.h = r * 2; },
    rect(e) { return { x: e.d.cx - r, y: e.d.cy - r * 0.72, w: r * 2, h: r * 1.3 }; },
    tick(e, ww, dt) {
      e.d.a += dt * 15;
      e.d.snd -= dt; if (e.d.snd <= 0) { e.d.snd = 0.28; audio.sfx('whip', { vol: 0.5, pitch: rand(0.9, 1.2) }); }
      if (Math.random() < 0.6) { const t = rand(0, TAU); ww.fx.emit('holy', e.d.cx + Math.cos(t) * r * 0.9, e.d.cy + Math.sin(t) * r * 0.45, { speed: 60, vx: -Math.sin(t) * 200, vy: Math.cos(t) * 100 }); }
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 8) * Math.min(1, (e.life - e.lt) * 5), cx = e.d.cx, cy = e.d.cy;
      ctx.globalCompositeOperation = ADD;
      glow(ctx, cx, cy, r * 1.2, '#ffd870', 0.3 * a);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.55); ctx.lineCap = 'round';
      for (let j = 0; j < 3; j++) {
        const rot = e.d.a + j * TAU / 3, rr = r * (0.95 - j * 0.1), segs = 9;
        for (let k = 0; k < segs; k++) {
          const u = (k + 1) / segs, a0 = rot - 2.1 + (k / segs) * 2.1, a1 = a0 + 2.1 / segs + 0.03;
          ctx.strokeStyle = rgba('#ffc040', a * u * 0.5); ctx.lineWidth = 4 + u * 18;
          ctx.beginPath(); ctx.arc(0, 0, rr, a0, a1); ctx.stroke();
          ctx.strokeStyle = rgba('#ffffff', a * u * 0.95); ctx.lineWidth = 1 + u * 4;
          ctx.beginPath(); ctx.arc(0, 0, rr, a0, a1); ctx.stroke();
        }
        glow(ctx, Math.cos(rot) * rr, Math.sin(rot) * rr, 34, '#fff2b0', a);
      }
      ctx.strokeStyle = rgba('#ffe7a0', 0.25 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
      ctx.restore();
    },
    light(L, e) { L.add(e.d.cx, e.d.cy, r * 1.6, '#fff2b0', 0.9); },
  });
};

SKILL_IMPL.kael_holy_cross = (p, w, lv) => {
  const id = 'kael_holy_cross', n = N(id, lv), s = SZ(lv) * 1.15, f = p.facing;
  p.throwT = 0.24;
  audio.sfx('cross'); audio.sfx('holy', { vol: 0.5 });
  const offs = n === 1 ? [0] : n === 2 ? [-0.12, 0.12] : [-0.22, 0, 0.22];
  offs.forEach((da, i) => {
    const ang = (f > 0 ? 0 : Math.PI) - da * f, sp = 860 - i * 30;
    shoot(w, p, {
      x: p.cx + f * 24, y: p.bottom - 62, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 44 * s, h: 44 * s, scale: s,
      behavior: 'boomerang', returnTo: p, turnTime: 0.42, spin: 16 * f, life: 2.2, pierce: 99, collideWalls: false,
      render: crossRender, trail: 'holy', trailRate: 0.035, light: { r: 130 * s, color: '#fff2b0', i: 0.9 },
      attack: atk(p, { mv: MV(id, lv), element: 'holy', rehit: 0.3, kb: [200, -180], hitstop: 0.05, shake: 3 }),
    });
  });
};

SKILL_IMPL.kael_sanctuary = (p, w, lv) => {
  const id = 'kael_sanctuary', r = V(id, 'r', lv), n = N(id, lv), heal = V(id, 'heal', lv), mv = MV(id, lv), gap = 0.42;
  pose(p, w, 'cast_up', 0.5, { h0: 0.12, sfx: 'holy' });
  audio.sfx('bell', { vol: 0.7 });
  fx(w, {
    life: n * gap + 0.35, z: 9, d: { next: 0.12, cnt: 0, pk: 9 },
    follow(e) { e.x = p.cx - r * 1.2; e.y = p.bottom - r * 1.2; e.w = r * 2.4; e.h = r * 1.4; },
    tick(e, ww, dt) {
      e.d.pk += dt;
      if (e.d.cnt < n && e.lt >= e.d.next) {
        e.d.next += gap; e.d.cnt++; e.d.pk = 0;
        const a = atk(p, { mv, element: 'holy', kb: [300, -300], hitstop: 0.05, shake: 3 });
        playerStrike(ww, { x: p.cx - r, y: p.bottom - r * 0.95, w: r * 2, h: r }, a);
        p.heal(p.stats.hp * heal / 100);
        ww.fx.ring(p.cx, p.bottom - r * 0.35, { color: '#fff2b0', r0: r * 0.3, r1: r * 1.05, life: 0.35, width: 8 });
        ww.fx.burst('holy', p.cx, p.bottom - 40, 14, { speed: 260 });
        audio.sfx('holy', { vol: 0.6, pitch: 1 + e.d.cnt * 0.08 });
      }
    },
    draw(ctx, e) {
      const cx = p.cx, by = p.bottom, open = ease.outBack(clamp(e.lt / 0.25, 0, 1)), a = clamp((e.life - e.lt) / 0.3, 0, 1);
      const R = r * open;
      runeCircle(ctx, cx, by - 2, R, '#ffe07a', e.lt * 1.4, a, 0.22, 8);
      ctx.globalCompositeOperation = ADD;
      const g = ctx.createRadialGradient(cx, by, R * 0.15, cx, by, R);
      g.addColorStop(0, rgba('#fff2b0', 0.03 * a)); g.addColorStop(0.82, rgba('#ffd870', 0.16 * a)); g.addColorStop(1, rgba('#ffffff', 0.4 * a));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, by, R, R * 0.92, 0, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = rgba('#ffe7a0', 0.4 * a); ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const t = e.lt * 0.8 + i / 5 * Math.PI;
        ctx.beginPath(); ctx.ellipse(cx, by, Math.max(1, R * Math.abs(Math.cos(t))), R * 0.92, 0, Math.PI, TAU); ctx.stroke();
      }
      ctx.strokeStyle = rgba('#ffffff', 0.7 * a); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(cx, by, R, R * 0.92, 0, Math.PI, TAU); ctx.stroke();
      if (e.d.pk < 0.3) { const u = e.d.pk / 0.3; glow(ctx, cx, by - R * 0.4, R * (0.6 + u * 0.6), '#ffffff', 0.5 * (1 - u)); }
    },
    light(L, e) { L.add(p.cx, p.bottom - r * 0.4, r * 2, '#fff2b0', 1); },
  });
};

SKILL_IMPL.kael_autodafe = (p, w, lv) => {
  const id = 'kael_autodafe', n = N(id, lv), mv = MV(id, lv), s = SZ(lv), f = p.facing, x0 = p.cx, y0 = p.bottom;
  pose(p, w, 'launch', 0.5, { h0: 0.1, sfx: 'whip_crack' });
  audio.sfx('fire', { vol: 0.8 });
  for (let i = 0; i < n; i++) {
    const x = x0 + f * (80 + i * 66 * s);
    const base = groundAt(w, x, y0 - 30) ?? y0;
    const H = (190 + i * 10) * s, pw = 22 * s, el = i % 2 ? 'fire' : 'holy';
    fx(w, {
      delay: 0.12 + i * 0.075, life: 0.6, z: 11, x: x - pw * 2, y: base - H, w: pw * 4, h: H,
      atk: atk(p, { mv, element: el, kb: [80, -560], launch: true, hitstop: 0.05, shake: 3 }), win: [0.03, 0.55],
      rect(e) { const up = ease.outCubic(clamp(e.lt / 0.12, 0, 1)); return { x: x - pw * 0.8, y: base - H * up, w: pw * 1.6, h: H * up }; },
      start(e, ww) { audio.sfx('fire', { vol: 0.6, pitch: rand(0.9, 1.2) }); ww.fx.burst('fire', x, base - 8, 10, { angle: -Math.PI / 2, spread: 0.5, speed: 320 }); ww.fx.burst('ember', x, base - 20, 8, { angle: -Math.PI / 2, spread: 0.7, speed: 260 }); shake(ww, 3, 0.12); },
      draw(ctx, e) {
        const up = ease.outCubic(clamp(e.lt / 0.12, 0, 1)), a = 1 - clamp((e.k - 0.5) / 0.5, 0, 1);
        runeCircle(ctx, x, base - 1, pw * 2, el === 'holy' ? '#fff2b0' : '#ff9a3a', e.lt * 3, a, 0.25, 4);
        fireColumn(ctx, x, base, pw, H * up, e.lt + i * 0.37, a, el === 'holy' ? '#ff8a2a' : '#ff4a10', el === 'holy' ? '#ffe7a0' : '#ffb040');
        if (el === 'holy') beamV(ctx, x, base - H * up * 0.95, base, pw * 0.35, '#fff2b0', a * 0.6);
      },
      light(L, e) { L.add(x, base - 70, 190 * s, '#ff9a3a', 1.1 * (1 - e.k)); },
    });
  }
};

SKILL_IMPL.kael_silver_fan = (p, w, lv) => {
  const id = 'kael_silver_fan', n = N(id, lv), f = p.facing, spread = Math.min(1.0, 0.13 * (n - 1));
  p.throwT = 0.22;
  audio.sfx('dagger'); audio.sfx('slash', { vol: 0.5, pitch: 1.4 });
  for (let i = 0; i < n; i++) {
    const da = n > 1 ? -spread / 2 + spread * i / (n - 1) : 0;
    const ang = f > 0 ? da : Math.PI - da;
    shoot(w, p, {
      x: p.cx + f * 26, y: p.bottom - 58, vx: Math.cos(ang) * 1150, vy: Math.sin(ang) * 1150, w: 20, h: 10, scale: 1.25,
      render: knifeRender, life: 0.62, pierce: 2, attack: atk(p, { mv: MV(id, lv), kb: [160, -80], hitstop: 0.04, shake: 2, crit: 5 }),
    });
  }
  w.fx.burst('spark', p.cx + f * 30, p.bottom - 58, 8, { angle: f > 0 ? 0 : Math.PI, spread: 0.6, color: '#dfe8ff' });
};

SKILL_IMPL.kael_blood_hunt = (p, w, lv) => {
  const id = 'kael_blood_hunt', D = V(id, 'r', lv), mv = MV(id, lv), f = p.facing, dur = 0.18, sp = D / dur, y = p.cy;
  const x0 = p.cx;
  pose(p, w, 'lash', 0.36, { h0: 0.05, sfx: 'dash' });
  audio.sfx('slash_heavy', { pitch: 1.3 });
  fx(w, {
    life: dur, z: 12, d: { g: 0 },
    tick(e, ww) {
      p.vx = f * sp; if (!p.onGround) p.vy = 0; holdInvuln(p);
      if ((e.d.g++ & 1) === 0) afterimage(ww, p, '#ff2040', 0.3);
      ww.fx.emit('blood', p.cx - f * 10, p.cy + rand(-20, 20), { speed: 60, vx: -f * 120 });
    },
    end(e, ww) {
      p.vx = f * 160; p.iframes = 0;
      const x1 = p.cx, lx = Math.min(x0, x1), rx = Math.max(x0, x1);
      fx(ww, {
        life: 0.55, z: 12, x: lx - 40, y: y - 80, w: rx - lx + 80, h: 160, d: { hit: false },
        tick(e2, w2) {
          if (!e2.d.hit && e2.lt >= 0.2) {
            e2.d.hit = true;
            const n = playerStrike(w2, { x: lx - 30, y: y - 60, w: rx - lx + 60, h: 120 }, atk(p, { mv, element: 'dark', kb: [f * 0 + 260, -420], hitstop: 0.12, shake: 10, crit: 10 }));
            if (n) p.heal(p.stats.hp * 0.03 * n);
            for (let i = 0; i < 8; i++) w2.fx.burst('blood', lerp(lx, rx, i / 7), y + rand(-10, 10), 4, { speed: 300 });
            w2.game.flash('#ff1030', 0.25, 6); audio.sfx('slash_heavy'); audio.sfx('crit', { vol: 0.7 });
          }
        },
        draw(ctx, e2) {
          if (e2.lt < 0.2) { const u = e2.lt / 0.2; cutLine(ctx, lx, y, rx, y, 1.5 + u * 2, '#ff2040', 0.4 + u * 0.4); return; }
          const u = (e2.lt - 0.2) / 0.35, a = 1 - u;
          cutLine(ctx, lx - 30, y + 6, rx + 30, y - 6, 14 * (1 - u * 0.6), '#ff1a3a', a);
          cutLine(ctx, lx + 20, y + 26, rx - 10, y - 30, 7 * a, '#ff6a7a', a * 0.8);
          ctx.globalCompositeOperation = ADD; glow(ctx, (lx + rx) / 2, y, (rx - lx) * 0.6 + 40, '#ff2040', 0.35 * a);
        },
        light(L, e2) { if (e2.lt > 0.2) L.add((lx + rx) / 2, y, (rx - lx) * 0.8 + 80, '#ff2040', 1.2 * (1 - e2.k)); },
      });
    },
  });
};

SKILL_IMPL.kael_raven_storm = (p, w, lv) => {
  const id = 'kael_raven_storm', n = N(id, lv), mv = MV(id, lv), f = p.facing;
  audio.sfx('bat', { vol: 0.8, pitch: 0.7 }); audio.sfx('dark', { vol: 0.6 });
  w.fx.burst('dark', p.cx, p.cy - 20, 14, { speed: 140, color: '#2a1a4a' });
  const steps = [];
  for (let i = 0; i < n; i++) steps.push([i * 0.045, (ww) => {
    const ang = -Math.PI / 2 + f * rand(0.2, 1.3);
    shoot(ww, p, {
      x: p.cx + rand(-14, 14), y: p.cy - 26 + rand(-10, 10), vx: Math.cos(ang) * 440, vy: Math.sin(ang) * 440, w: 26, h: 20, scale: rand(0.85, 1.1),
      render: ravenRender, color: '#7a4aff', behavior: 'homing', speed: 520, homingTurn: 6.5, homingDelay: 0.22, life: 2.8, pierce: 3, collideWalls: false,
      trail: 'dark', trailRate: 0.09, trailOpts: { color: '#2a1a40', size: 6 },
      attack: atk(p, { mv, element: 'dark', rehit: 0.35, kb: [80, -120], hitstop: 0.03, shake: 1 }),
    });
    if (i % 3 === 0) audio.sfx('bat', { vol: 0.4, pitch: rand(0.8, 1.2) });
  }]);
  seq(w, steps);
};

// ═══════════════════════════ 세라 ═══════════════════════════
const handOf = (p) => ({ x: p.cx + p.facing * 30, y: p.bottom - 62 });

SKILL_IMPL.sera_holy_bolt = (p, w, lv) => {
  const id = 'sera_holy_bolt', n = N(id, lv), f = p.facing, h = handOf(p), spread = Math.min(0.9, 0.22 * (n - 1));
  audio.sfx('holy', { pitch: 1.2 });
  w.fx.ring(h.x, h.y, { color: '#fff2b0', r0: 4, r1: 34, life: 0.2, width: 3 });
  for (let i = 0; i < n; i++) {
    const da = n > 1 ? -spread / 2 + spread * i / (n - 1) : 0, ang = f > 0 ? da : Math.PI - da;
    shoot(w, p, {
      x: h.x, y: h.y, vx: Math.cos(ang) * 760, vy: Math.sin(ang) * 760, w: 18, h: 18, scale: 0.9 + lv * 0.08,
      render: holyOrbRender, color: '#fff2b0', behavior: 'homing', speed: 760, homingTurn: 9, homingDelay: 0.1, life: 1.3,
      pierce: lv >= 3 ? 2 : 1, trail: 'holy', trailRate: 0.04, light: { r: 80, color: '#fff2b0', i: 0.8 },
      attack: atk(p, { mv: MV(id, lv), element: 'holy', kb: [140, -120], hitstop: 0.04, shake: 2 }),
      onExpire: (pr, ww) => { ww.fx.burst('holy', pr.cx, pr.cy, 8, { speed: 160 }); ww.fx.flash(pr.cx, pr.cy, { color: '#fff2b0', size: 40, life: 0.1 }); },
    });
  }
};

function pillarFx(w, p, x, base, W, mv, delay, life, col, extra = {}) {
  const top = w.camera.y - 60;
  return fx(w, {
    delay, life, z: 11, x: x - W * 2, y: top, w: W * 4, h: base - top + 20,
    atk: atk(p, { mv, element: 'holy', rehit: 0.12, kb: [60, -280], hitstop: 0.04, shake: 2, ...extra }), win: [0.22, 0.85],
    rect() { return { x: x - W * 0.8, y: top, w: W * 1.6, h: base - top }; },
    tick(e, ww) {
      if (!e.d.on && e.k >= 0.22) {
        e.d.on = true; audio.sfx('holy', { pitch: rand(0.9, 1.1) }); shake(ww, 4, 0.15);
        ww.fx.burst('holy', x, base - 10, 16, { angle: -Math.PI / 2, spread: 1.3, speed: 320 });
        ww.fx.ring(x, base - 4, { color: col, r0: W * 0.4, r1: W * 2.2, life: 0.35, width: 6 });
      }
      if (e.d.on && Math.random() < 0.5) ww.fx.emit('holy', x + rand(-W, W), base - rand(0, 200), { angle: -Math.PI / 2, spread: 0.2, speed: 200 });
    },
    draw(ctx, e) {
      const k = e.k;
      if (k < 0.22) {
        const u = k / 0.22;
        ctx.globalCompositeOperation = ADD;
        beamV(ctx, x, top, base, W * 0.14 * (0.5 + u), col, 0.6 * u);
        runeCircle(ctx, x, base - 1, W * 1.4 * u, col, e.lt * 4, u, 0.25, 6);
        return;
      }
      const u = (k - 0.22) / 0.78, a = u < 0.1 ? 1 : 1 - (u - 0.1) / 0.9;
      const ww = W * (u < 0.08 ? lerp(1.7, 1, u / 0.08) : 1) * (1 - 0.35 * u);
      runeCircle(ctx, x, base - 1, W * 1.5, col, e.lt * 4, a, 0.25, 6);
      ctx.globalCompositeOperation = ADD;
      beamV(ctx, x, top, base, ww * 1.5, col, a * 0.55);
      beamV(ctx, x, top, base, ww * 0.6, '#ffffff', a, '#ffffff');
      glow(ctx, x, base, W * 2.4, col, a * 0.75);
    },
    light(L, e) { if (e.k > 0.2) L.add(x, base - 90, W * 5, col, 1.3 * (1 - e.k)); },
  });
}
SKILL_IMPL.sera_light_pillar = (p, w, lv) => {
  const id = 'sera_light_pillar', W = V(id, 'w', lv) / 2, n = N(id, lv), mv = MV(id, lv), f = p.facing;
  const tg = frontEnemies(w, p, 560)[0] || w.nearestEnemy(p.cx, p.cy, 420);
  const tx = tg ? tg.cx : p.cx + f * 220;
  const base = groundAt(w, tx, tg ? tg.cy : p.bottom - 30) ?? (tg ? tg.bottom : p.bottom);
  pose(p, w, 'cast_up', 0.45, { h0: 0.1, sfx: 'magic' });
  pillarFx(w, p, tx, base, W, mv, 0, 1.0, '#fff2b0');
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? -1 : 1, off = (W * 1.7 + Math.floor(i / 2) * W * 1.5) * side * f;
    const x2 = tx + off, b2 = groundAt(w, x2, base - 40) ?? base;
    pillarFx(w, p, x2, b2, W * 0.62, mv * 0.8, 0.2 + i * 0.1, 0.8, '#ffe7a0');
  }
};

SKILL_IMPL.sera_fireball = (p, w, lv) => {
  const id = 'sera_fireball', n = N(id, lv), r = V(id, 'r', lv), mv = MV(id, lv), f = p.facing, h = handOf(p), s = 0.95 + lv * 0.1;
  audio.sfx('fire'); audio.sfx('magic', { vol: 0.5, pitch: 0.8 });
  const offs = n === 1 ? [0] : n === 2 ? [-16, 16] : [-28, 0, 28];
  offs.forEach((dy, i) => {
    shoot(w, p, {
      x: h.x, y: h.y + dy, vx: f * (700 - i * 40), vy: dy * 1.2, w: 26 * s, h: 26 * s, scale: s,
      render: fireballRender, life: 1.1, pierce: 1, trail: 'fire', trailRate: 0.03, light: { r: 120 * s, color: '#ff8a3a', i: 1 },
      attack: atk(p, { mv: mv * 0.35, element: 'fire', kb: [120, -100], hitstop: 0.03 }),
      onWall: (pr, ww) => pr.expire(ww),
      onExpire: (pr, ww) => boom(ww, p, pr.cx, pr.cy, r, { mv: mv * 0.8, element: 'fire', type: 'mag', shake: 6 }),
    });
  });
  w.fx.flash(h.x, h.y, { color: '#ff9a3a', size: 70, life: 0.12 });
};

SKILL_IMPL.sera_meteor = (p, w, lv) => {
  const id = 'sera_meteor', n = N(id, lv), mv = MV(id, lv), s = SZ(lv), f = p.facing, r = 85 * s;
  pose(p, w, 'cast_up', 0.6, { h0: 0.12, sfx: 'magic' });
  audio.sfx('fire', { vol: 0.8, pitch: 0.7 });
  w.game.flash('#ff6a2a', 0.2, 3);
  const tgs = frontEnemies(w, p, 700);
  for (let i = 0; i < n; i++) {
    const tg = tgs[i % Math.max(1, tgs.length)];
    const tx = tg && i < tgs.length * 2 ? tg.cx + rand(-30, 30) : p.cx + f * (110 + i * 75 + rand(-25, 25));
    const gy = groundAt(w, tx, (tg ? tg.cy : p.bottom - 30)) ?? p.bottom;
    const sx = tx - f * 320, sy = w.camera.y - 90;
    const T = 0.42;
    fx(w, {
      delay: 0.15 + i * 0.13, life: T, z: 11, d: { x: sx, y: sy, rot: rand(0, TAU) },
      follow(e) { const u = ease.inQuad(e.k); e.d.x = lerp(sx, tx, u); e.d.y = lerp(sy, gy, u); e.x = e.d.x - 70 * s; e.y = e.d.y - 70 * s; e.w = e.h = 140 * s; },
      start() { audio.sfx('fire', { vol: 0.4, pitch: 0.6 }); },
      tick(e, ww, dt) {
        e.d.rot += dt * 6;
        ww.fx.emit('fire', e.d.x + rand(-10, 10) * s, e.d.y + rand(-10, 10) * s, { speed: 60, size: 16 * s });
        if (Math.random() < 0.4) ww.fx.emit('smoke', e.d.x, e.d.y, { speed: 30 });
        if (e.k > 0.3 && enemiesIn(ww, circ(e.d.x, e.d.y, 26 * s)).length) {
          e.dead = true; boom(ww, p, e.d.x, e.d.y, r, { mv, element: 'fire', type: 'mag', shake: 10, kb: [300, -520] });
        }
      },
      draw(ctx, e) {
        const x = e.d.x, y = e.d.y, ang = Math.atan2(gy - sy, tx - sx), R = 22 * s;
        ctx.globalCompositeOperation = ADD;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        const g = ctx.createLinearGradient(-200 * s, 0, 0, 0);
        g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(0.7, 'rgba(255,140,40,0.55)'); g.addColorStop(1, 'rgba(255,230,160,0.9)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -R * 1.3); ctx.lineTo(-200 * s, 0); ctx.lineTo(0, R * 1.3); ctx.closePath(); ctx.fill();
        ctx.restore();
        glow(ctx, x, y, R * 3.2, '#ff6a1a', 0.7);
        ctx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(x, y); ctx.rotate(e.d.rot);
        const rg = ctx.createRadialGradient(-R * 0.3, -R * 0.3, 2, 0, 0, R);
        rg.addColorStop(0, '#7a5040'); rg.addColorStop(0.7, '#3a2018'); rg.addColorStop(1, '#1a0c08');
        ctx.fillStyle = rg; ctx.beginPath();
        for (let k = 0; k < 9; k++) { const t = k / 9 * TAU, rr = R * (0.82 + ((k * 37) % 5) * 0.05); k ? ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr) : ctx.moveTo(Math.cos(t) * rr, Math.sin(t) * rr); }
        ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = ADD; ctx.strokeStyle = 'rgba(255,170,60,0.9)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-R * 0.5, -R * 0.2); ctx.lineTo(0, R * 0.1); ctx.lineTo(R * 0.4, -R * 0.35); ctx.moveTo(0, R * 0.1); ctx.lineTo(-R * 0.1, R * 0.6); ctx.stroke();
        ctx.restore();
      },
      light(L, e) { L.add(e.d.x, e.d.y, 180 * s, '#ff7a2a', 1); },
      end(e, ww) { boom(ww, p, tx, gy - 12, r, { mv, element: 'fire', type: 'mag', shake: 10, kb: [300, -520] }); ww.fx.burst('shard', tx, gy - 6, 8, { angle: -Math.PI / 2, spread: 1, speed: 380, color: '#5a3a2a' }); },
    });
  }
};

function strikeBolt(w, p, x, cy, mv, s, col = '#bfe0ff', yHint = null) {
  const base = groundAt(w, x, yHint ?? cy + 40, 12 * TILE) ?? (yHint !== null ? yHint + 40 : p.bottom);
  fx(w, {
    life: 0.28, z: 12, x: x - 80, y: cy, w: 160, h: base - cy, d: { pts: boltPts(x + rand(-50, 50), cy, x, base, 12, 30) },
    atk: atk(p, { mv, element: 'thunder', kb: [60, -220], hitstop: 0.06, shake: 5, stun: 0.5 }), win: [0, 0.3],
    rect() { return { x: x - 30 * s, y: cy, w: 60 * s, h: base - cy }; },
    start(e, ww) {
      audio.sfx('thunder', { pitch: rand(0.9, 1.1) }); shake(ww, 5, 0.15);
      ww.fx.burst('thunder', x, base - 6, 12, { speed: 420 });
      ww.fx.ring(x, base - 4, { color: col, r0: 8, r1: 70 * s, life: 0.25, width: 5 });
      ww.game.flash('#dfeaff', 0.14, 8);
    },
    tick(e) { if (Math.random() < 0.45) e.d.pts = boltPts(x + rand(-50, 50), cy, x, base, 12, 30); },
    draw(ctx, e) {
      const a = 1 - e.k;
      drawBolt(ctx, e.d.pts, col, 6.5 * s, a);
      glow(ctx, x, base, 90 * s, col, a * 0.9);
      glow(ctx, x, (cy + base) / 2, 120 * s, col, a * 0.25);
    },
    light(L, e) { L.add(x, base - 100, 320, col, 1.4 * (1 - e.k)); },
  });
}
SKILL_IMPL.sera_thunderstorm = (p, w, lv) => {
  const id = 'sera_thunderstorm', n = N(id, lv), mv = MV(id, lv), f = p.facing, s = SZ(lv), gap = 0.22;
  pose(p, w, 'cast_up', 0.55, { h0: 0.12, sfx: 'magic' });
  audio.sfx('thunderclap', { vol: 0.8 });
  fx(w, {
    life: 0.45 + n * gap + 0.35, z: 12, d: { next: 0.4, i: 0, flash: 0, last: null },
    follow(e) { e.d.cx = p.cx + f * 70; e.d.cy = Math.max(w.camera.y + 46, p.y - 220); e.x = e.d.cx - 340; e.y = e.d.cy - 90; e.w = 680; e.h = 180; },
    tick(e, ww, dt) {
      e.d.flash = Math.max(0, e.d.flash - dt * 5);
      if (e.d.i < n && e.lt >= e.d.next) {
        e.d.next += gap; e.d.i++; e.d.flash = 1;
        const pool = ww.enemies().filter((en) => !en.invuln && Math.abs(en.cx - p.cx) < 560 && Math.abs(en.cy - p.cy) < 320);
        let tg = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        if (tg === e.d.last && pool.length > 1) tg = pool[(pool.indexOf(tg) + 1) % pool.length];
        e.d.last = tg;
        const x = tg ? tg.cx + rand(-10, 10) : p.cx + f * rand(60, 380);
        strikeBolt(ww, p, x, e.d.cy + 20, mv, s, '#bfe0ff', tg ? tg.cy : p.cy);
      }
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 4) * Math.min(1, (e.life - e.lt) * 3), cx = e.d.cx, cy = e.d.cy;
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 12; i++) {
        const ox = Math.sin(i * 2.3) * 170 * s + Math.sin(e.lt * 1.3 + i) * 10, oy = Math.cos(i * 1.7) * 16 - (i % 3) * 6, rr = (46 + (i % 4) * 14) * s;
        const x = cx + ox, y = cy + oy;
        const g = ctx.createRadialGradient(x - rr * 0.2, y - rr * 0.45, rr * 0.1, x, y, rr);
        g.addColorStop(0, rgba('#6a6a90', 0.95 * a)); g.addColorStop(0.55, rgba('#2a2840', 0.92 * a)); g.addColorStop(1, rgba('#0a0a14', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = ADD;
      glow(ctx, cx, cy + 30, 200 * s, '#8ab0ff', (0.04 + e.d.flash * 0.28) * a);
      for (let i = 0; i < 3; i++) { const fx0 = cx + Math.sin(e.lt * 7 + i * 2.1) * 140 * s; glow(ctx, fx0, cy + Math.cos(i) * 12, 44 * s, '#bfe0ff', 0.2 * Math.max(0, Math.sin(e.lt * 13 + i * 3)) * a); }
    },
    light(L, e) { L.add(e.d.cx, e.d.cy + 30, 240 * s, '#8ab0ff', 0.2 + e.d.flash * 0.6); },
  });
};

SKILL_IMPL.sera_heal = (p, w, lv) => {
  const id = 'sera_heal', heal = V(id, 'heal', lv), r = V(id, 'r', lv), mv = MV(id, lv), s = SZ(lv);
  p.heal(p.stats.hp * heal / 100);
  audio.sfx('heal'); audio.sfx('holy', { vol: 0.6, pitch: 1.3 });
  playerStrike(w, circ(p.cx, p.cy, r), atk(p, { mv, element: 'holy', kb: [300, -260], hitstop: 0.06 }));
  w.fx.ring(p.cx, p.cy, { color: '#fff2b0', r0: 10, r1: r, life: 0.45, width: 8 });
  w.fx.burst('holy', p.cx, p.cy, 16, { speed: 220, color: '#c8ffb0' });
  const top = w.camera.y - 40;
  fx(w, {
    life: 1.2, z: 9,
    follow(e) { e.x = p.cx - 160; e.y = top; e.w = 320; e.h = p.bottom - top + 10; },
    tick(e, ww) { if (Math.random() < 0.35) ww.fx.emit('holy', p.cx + rand(-90, 90), p.y - rand(20, 120), { angle: Math.PI / 2, spread: 0.3, speed: 50, grav: 40, color: Math.random() < 0.5 ? '#ffffff' : '#c8ffb0' }); },
    draw(ctx, e) {
      const open = ease.outCubic(clamp(e.lt / 0.3, 0, 1)), a = clamp((e.life - e.lt) / 0.4, 0, 1), f = p.facing;
      ctx.globalCompositeOperation = ADD;
      beamV(ctx, p.cx, top, p.bottom, 50 * s * (1.2 - open * 0.4), '#c8ffb0', 0.45 * a);
      const sx = p.cx - f * 4, sy = p.bottom - 64;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(-f, 1); wing(ctx, 78 * s, open, '#ffffff', '#fff2b0', 0.8 * a); ctx.restore();
      ctx.save(); ctx.translate(sx + f * 6, sy - 4); ctx.scale(f, 1); ctx.rotate(-0.2); wing(ctx, 58 * s, open * 0.9, '#ffffff', '#fff2b0', 0.55 * a); ctx.restore();
      glow(ctx, p.cx, p.cy, 90 * s, '#c8ffb0', 0.3 * a);
    },
    light(L) { L.add(p.cx, p.cy - 20, 220, '#e8ffd0', 1); },
  });
};

function drawAngel(ctx, x, y, s, a, t, spread) {
  ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, -10 * s, 170 * s, '#fff2b0', 0.3 * a);
  for (const sd of [-1, 1]) { ctx.save(); ctx.translate(sd * 8 * s, -34 * s); ctx.scale(sd, 1); ctx.rotate(-0.15); wing(ctx, 140 * s, spread, '#ffffff', '#ffe7a0', 0.7 * a); ctx.restore(); }
  const g = ctx.createLinearGradient(0, -52 * s, 0, 90 * s);
  g.addColorStop(0, rgba('#ffffff', 0.8 * a)); g.addColorStop(0.5, rgba('#fff2b0', 0.4 * a)); g.addColorStop(1, rgba('#fff2b0', 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-12 * s, -46 * s); ctx.lineTo(12 * s, -46 * s); ctx.quadraticCurveTo(26 * s, 20 * s, 38 * s + Math.sin(t * 3) * 3 * s, 92 * s); ctx.lineTo(-38 * s + Math.sin(t * 3 + 1) * 3 * s, 92 * s); ctx.quadraticCurveTo(-26 * s, 20 * s, -12 * s, -46 * s); ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.7 * a); ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-10 * s, -38 * s); ctx.lineTo(-30 * s, -78 * s); ctx.moveTo(10 * s, -38 * s); ctx.lineTo(30 * s, -78 * s); ctx.stroke();
  glow(ctx, 0, -62 * s, 18 * s, '#ffffff', 0.95 * a);
  ctx.strokeStyle = rgba('#ffe070', 0.95 * a); ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.ellipse(0, -86 * s, 17 * s, 5 * s, 0, 0, TAU); ctx.stroke();
  flare(ctx, 0, -86 * s, 40 * s, '#fff2b0', 0.6 * a, t);
  ctx.restore();
}
SKILL_IMPL.sera_archangel = (p, w, lv) => {
  const id = 'sera_archangel', n = N(id, lv), mv = MV(id, lv), s = 0.9 + lv * 0.06, f = p.facing, dur = 0.5 + n * 0.08 + 0.6;
  pose(p, w, 'cast_up', 0.7, { h0: 0.15, sfx: 'holy' });
  audio.sfx('bell'); w.game.flash('#fff8e0', 0.3, 3);
  const e0 = fx(w, {
    life: dur, z: 9, d: { i: 0, next: 0.45 },
    follow(e) { e.d.x = p.cx - f * 34; e.d.y = p.bottom - 150; e.x = e.d.x - 180 * s; e.y = e.d.y - 140 * s; e.w = 360 * s; e.h = 260 * s; },
    tick(e, ww) {
      if (e.d.i < n && e.lt >= e.d.next) {
        e.d.next += 0.08; const i = e.d.i++;
        const pool = frontEnemies(ww, p, 700);
        const tg = pool.length ? pool[i % pool.length] : null;
        const sx = e.d.x + rand(-60, 60) * s, sy = e.d.y - 70 * s + rand(-20, 20);
        const tx = tg ? tg.cx + rand(-12, 12) : p.cx + f * rand(80, 420), ty = tg ? tg.cy : (groundAt(ww, tx, p.bottom - 30) ?? p.bottom);
        const ang = Math.atan2(ty - sy, tx - sx);
        shoot(ww, p, {
          x: sx, y: sy, vx: Math.cos(ang) * 1500, vy: Math.sin(ang) * 1500, w: 18, h: 18, scale: 1.1 * s, render: lanceRender, color: '#fff2b0',
          life: 0.7, pierce: 2, light: { r: 90, color: '#fff2b0', i: 0.8 },
          attack: atk(p, { mv, element: 'holy', kb: [120, -200], hitstop: 0.04, shake: 2 }),
          onExpire: (pr, w2) => { w2.fx.burst('holy', pr.cx, pr.cy, 8, { speed: 200 }); w2.fx.ring(pr.cx, pr.cy, { color: '#fff2b0', r0: 4, r1: 40, life: 0.2, width: 3 }); },
        });
        if (i % 2 === 0) audio.sfx('holy', { vol: 0.4, pitch: 1.4 });
      }
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 4) * clamp((e.life - e.lt) / 0.35, 0, 1), spread = ease.outBack(clamp(e.lt / 0.4, 0, 1));
      drawAngel(ctx, e.d.x, e.d.y + Math.sin(e.lt * 3) * 4, s, a, e.lt, spread);
    },
    light(L, e) { L.add(e.d.x, e.d.y - 20, 260 * s, '#fff2b0', 1); },
  });
  return !!e0;
};

function drawClock(ctx, x, y, R, a, hm, hh) {
  ctx.save(); ctx.translate(x, y); ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, 0, R * 1.25, '#8ac8ff', 0.28 * a);
  ctx.strokeStyle = rgba('#bfe0ff', 0.9 * a); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.9, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, TAU); ctx.stroke();
  const RN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.font = `800 ${Math.round(R * 0.12)}px "Cinzel", serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba('#e0f0ff', 0.9 * a);
  for (let i = 0; i < 12; i++) {
    const t = i / 12 * TAU - Math.PI / 2, c = Math.cos(t), s = Math.sin(t);
    ctx.beginPath(); ctx.moveTo(c * R * 0.9, s * R * 0.9); ctx.lineTo(c * R, s * R); ctx.stroke();
    ctx.fillText(RN[i], c * R * 0.76, s * R * 0.76);
  }
  ctx.fillStyle = rgba('#8ac8ff', 0.22 * a);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 0.88, hm - 0.9, hm); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', a); ctx.lineCap = 'round';
  ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hm) * R * 0.84, Math.sin(hm) * R * 0.84); ctx.stroke();
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hh) * R * 0.52, Math.sin(hh) * R * 0.52); ctx.stroke();
  glow(ctx, 0, 0, 12, '#ffffff', a);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
SKILL_IMPL.sera_chrono = (p, w, lv) => {
  const id = 'sera_chrono', T = V(id, 't', lv), mv = MV(id, lv), R = 180;
  pose(p, w, 'cast', 0.5, { h0: 0.1, sfx: 'stopwatch' });
  audio.sfx('clock_tick'); audio.sfx('bell', { vol: 0.6, pitch: 0.7 });
  w.timeStop = Math.max(w.timeStop, T);
  w.game.flash('#bfe0ff', 0.45, 4);
  const hit = (ww) => {
    playerStrike(ww, circ(p.cx, p.cy, R * 1.45), atk(p, { mv, element: null, kb: [120, -160], hitstop: 0.06, shake: 5, stun: 0.3 }));
    ww.fx.ring(p.cx, p.cy, { color: '#bfe0ff', r0: 20, r1: R * 1.4, life: 0.4, width: 8 });
    audio.sfx('clock_tick', { pitch: 1.4 });
  };
  fx(w, {
    life: T, z: 12, d: { hm: -Math.PI / 2, hh: 0, h1: false, h2: false },
    follow(e) { e.x = p.cx - R * 1.3; e.y = p.cy - R * 1.3; e.w = e.h = R * 2.6; },
    tick(e, ww, dt) {
      const spin = e.lt < 0.35 ? 22 * (1 - e.lt / 0.35) + 1 : e.lt > T - 0.4 ? 14 : 0.6;
      e.d.hm += spin * dt; e.d.hh += spin * dt / 12;
      if (!e.d.h1 && e.lt > 0.15) { e.d.h1 = true; hit(ww); }
      if (!e.d.h2 && e.lt > T - 0.25) { e.d.h2 = true; hit(ww); }
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 5) * clamp((e.life - e.lt) / 0.25, 0, 1), sc = ease.outBack(clamp(e.lt / 0.3, 0, 1));
      drawClock(ctx, p.cx, p.cy - 10, R * sc, a, e.d.hm, e.d.hh);
    },
    light(L) { L.add(p.cx, p.cy, R * 1.6, '#8ac8ff', 0.9); },
  });
};

// ═══════════════════════════ 빅터 ═══════════════════════════
const gunOf = (p, alt = false) => ({ x: p.cx + p.facing * 44, y: p.bottom - (alt ? 56 : 60) });
function muzzle(w, p, x, y, ang, col = '#ffd070', big = 1) {
  w.fx.flash(x, y, { color: col, size: 46 * big, life: 0.08 });
  w.fx.burst('spark', x, y, Math.round(3 * big), { angle: ang, spread: 0.4, color: '#ffe0a0' });
  w.fx.emit('smoke', x, y, { speed: 30 });
  p.muzzleT = 0.06;
}
function aimAng(p, w, x, y, range = 720, cone = 0.55) {
  const base = p.facing > 0 ? 0 : Math.PI;
  const e = frontEnemies(w, p, range)[0];
  if (!e) return base + rand(-0.03, 0.03);
  const a = Math.atan2(e.cy - y, e.cx - x);
  const d = Math.atan2(Math.sin(a - base), Math.cos(a - base));
  return base + clamp(d, -cone, cone);
}
function bullet(w, p, x, y, ang, o = {}) {
  const sp = o.speed ?? 1800;
  return shoot(w, p, {
    x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 18, h: 8, render: o.render ?? 'bullet', color: o.color ?? '#ffe7a0',
    life: o.life ?? 0.5, pierce: o.pierce ?? 1, scale: o.scale ?? 1, trail: o.trail ?? null, trailRate: 0.03, collideWalls: o.walls ?? true,
    light: o.light ?? null, onExpire: o.onExpire, attack: atk(p, { mv: o.mv ?? 0.6, kb: o.kb ?? [120, -40], hitstop: o.hitstop ?? 0.03, shake: o.shake ?? 1, element: o.element ?? null, crit: o.crit ?? 0 }),
  });
}

SKILL_IMPL.victor_fanning = (p, w, lv) => {
  const id = 'victor_fanning', n = N(id, lv), mv = MV(id, lv), steps = [];
  for (let i = 0; i < n; i++) steps.push([i * 0.065, (ww) => {
    pose(p, ww, i % 2 ? 'shoot_alt' : 'shoot', 0.14, { h0: 0.01, hw: 0.02, sfx: 'gun' });
    const g = gunOf(p, i % 2 === 1), ang = aimAng(p, ww, g.x, g.y);
    bullet(ww, p, g.x, g.y, ang, { mv, scale: 1.1 });
    muzzle(ww, p, g.x, g.y, ang);
    shake(ww, 1.5, 0.05);
  }]);
  seq(w, steps);
};

SKILL_IMPL.victor_bullet_dance = (p, w, lv) => {
  const id = 'victor_bullet_dance', n = N(id, lv), mv = MV(id, lv), steps = [];
  pose(p, w, 'spin_blade', 0.55, { h0: 0.04, hw: 0.44, sfx: 'dash' });
  const rot0 = rand(0, TAU);
  for (let i = 0; i < n; i++) steps.push([0.04 + i * (0.42 / n), (ww) => {
    const ang = rot0 + i / n * TAU * 1.25 * p.facing, x = p.cx + Math.cos(ang) * 30, y = p.cy - 8 + Math.sin(ang) * 16;
    bullet(ww, p, x, y, ang, { mv, speed: 1400, kb: [180, -120], scale: 1.1 });
    muzzle(ww, p, x, y, ang, '#ffd070', 0.7);
    if (i % 2 === 0) audio.sfx('gun', { vol: 0.6, pitch: rand(0.95, 1.15) });
  }]);
  seq(w, steps);
  w.fx.ring(p.cx, p.cy, { color: '#ffd070', r0: 20, r1: 110, life: 0.4, width: 4 });
};

SKILL_IMPL.victor_pierce_shot = (p, w, lv) => {
  const id = 'victor_pierce_shot', mv = MV(id, lv), W = V(id, 'w', lv), f = p.facing, cam = w.camera;
  pose(p, w, 'shoot_double', 0.5, { h0: 0.2, hw: 0.04, sfx: 'charge_ready' });
  // 조준 섬광
  fx(w, {
    life: 0.2, z: 12,
    follow(e) { const g = gunOf(p); e.d.x = g.x; e.d.y = g.y; e.x = g.x - 60; e.y = g.y - 60; e.w = e.h = 120; },
    draw(ctx, e) { const u = e.k; ctx.globalCompositeOperation = ADD; glow(ctx, e.d.x, e.d.y, 40 + u * 30, '#fff0b0', 0.5 + u * 0.5); flare(ctx, e.d.x, e.d.y, 30 + u * 50, '#fff0b0', 1, u * 2); },
    end(e, ww) {
      const x0 = e.d.x, y = e.d.y, x1 = f > 0 ? cam.x + cam.vw + 60 : cam.x - 60;
      const lx = Math.min(x0, x1), len = Math.abs(x1 - x0);
      audio.sfx('shotgun'); audio.sfx('gun', { pitch: 0.7 });
      shake(ww, 9, 0.25); ww.camera.punchZoom(1.04, 0.12);
      p.vx = -f * 320;
      ww.fx.flash(x0, y, { color: '#fff0b0', size: 120, life: 0.12 });
      fx(ww, {
        life: 0.42, z: 12, x: lx, y: y - W * 3, w: len, h: W * 6,
        atk: atk(p, { mv, kb: [420, -160], hitstop: 0.1, shake: 6, crit: 15 }), win: [0, 0.3],
        rect() { return { x: lx, y: y - W * 0.9, w: len, h: W * 1.8 }; },
        draw(ctx, e2) {
          const a = 1 - e2.k, th = W * (1 - e2.k * 0.7);
          ctx.globalCompositeOperation = ADD;
          beamH(ctx, x0, x1, y, th * 2.2, '#ffd070', a * 0.7);
          beamH(ctx, x0, x1, y, th * 0.7, '#ffffff', a, '#ffffff');
          ctx.strokeStyle = rgba('#fff0b0', 0.6 * a); ctx.lineWidth = 2;
          for (let d = 90; d < len; d += 130) {
            const rx = x0 + f * d, rr = W * (1.2 + e2.k * 3) * (1 - d / len * 0.5);
            ctx.beginPath(); ctx.ellipse(rx, y, rr * 0.35, rr * 1.6, 0, 0, TAU); ctx.stroke();
          }
        },
        light(L, e2) { for (let d = 0; d < len; d += 240) L.add(x0 + f * d, y, 160, '#ffe7a0', 1.2 * (1 - e2.k)); },
      });
    },
  });
};

SKILL_IMPL.victor_phantom_bullet = (p, w, lv) => {
  const id = 'victor_phantom_bullet', n = N(id, lv), mv = MV(id, lv), f = p.facing, cx0 = p.cx, b0 = p.bottom;
  pose(p, w, 'shoot_double', 0.5, { h0: 0.3, hw: 0.04, sfx: 'gun' });
  audio.sfx('ghost', { vol: 0.8 }); audio.sfx('mist', { vol: 0.6 });
  const spots = [[-58, -78], [-60, 0], [-118, -40], [-120, -118], [-170, 0], [-176, -80]];
  for (let i = 0; i < n; i++) {
    const [dx, dy] = spots[i % spots.length];
    const gx = cx0 + f * dx, gb = b0 + dy;
    const snap = ghostOf(p, gx, gb, { anim: 'shoot_double', move: { id: 'ph', anim: 'shoot_double', dur: 0.8, hit: [0.3 + i * 0.06, 0.34 + i * 0.06] }, moveT: 0, onGround: dy === 0, facing: f });
    fx(w, {
      life: 0.85, z: 9, x: gx - 50, y: gb - 110, w: 100, h: 120, d: { fired: false },
      tick(e, ww, dt) {
        snap.moveT = e.lt; snap.t = p.t;
        if (!e.d.fired && e.lt >= 0.3 + i * 0.06) {
          e.d.fired = true;
          const x = gx + f * 44, y = gb - 60;
          bullet(ww, p, x, y, f > 0 ? 0 : Math.PI, { mv, speed: 2000, pierce: 99, walls: false, life: 0.6, render: lanceRender, color: '#9ab0ff', scale: 1.1, kb: [260, -120], hitstop: 0.05, shake: 3, light: { r: 90, color: '#9ab0ff', i: 0.9 } });
          muzzle(ww, p, x, y, f > 0 ? 0 : Math.PI, '#9ab0ff', 1.3);
          audio.sfx('gun', { pitch: 0.8 + i * 0.05 });
        }
      },
      draw(ctx, e, ww) {
        const a = Math.min(1, e.lt * 6) * clamp((e.life - e.lt) / 0.25, 0, 1);
        drawHero(ctx, snap, ww, { alpha: 0.75 * a, tint: '#8aa8ff' });
        ctx.globalCompositeOperation = ADD; glow(ctx, gx, gb - 44, 60, '#9ab0ff', 0.3 * a);
      },
      light(L) { L.add(gx, gb - 44, 90, '#9ab0ff', 0.6); },
    });
  }
};

SKILL_IMPL.victor_execution = (p, w, lv) => {
  const id = 'victor_execution', n = N(id, lv), mv = MV(id, lv);
  const tgs = enemiesIn(w, viewRect(w)).sort((a, b) => Math.abs(a.cx - p.cx) - Math.abs(b.cx - p.cx)).slice(0, n);
  if (!tgs.length) { w.game.toast('조준할 적이 없다', '#ff8a8a', 1); return false; }
  audio.sfx('charge_ready'); audio.sfx('clock_tick', { vol: 0.6 });
  pose(p, w, 'shoot', 0.4, { h0: 0.3, sfx: 'menu_move' });
  tgs.forEach((tg, i) => {
    const T = 0.5 + i * 0.13;
    fx(w, {
      life: T, z: 12, d: { x: tg.cx, y: tg.cy },
      follow(e) { if (!tg.dead) { e.d.x = tg.cx; e.d.y = tg.cy; } e.x = e.d.x - 70; e.y = e.d.y - 70; e.w = e.h = 140; },
      draw(ctx, e) {
        const u = ease.outCubic(e.k), R = lerp(70, 22, u), a = Math.min(1, e.lt * 8);
        ctx.save(); ctx.translate(e.d.x, e.d.y); ctx.rotate((1 - u) * 2.5);
        ctx.globalCompositeOperation = ADD; ctx.strokeStyle = rgba('#ff3040', 0.95 * a); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R * 0.55, 0, TAU); ctx.stroke();
        for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(R * 0.35, 0); ctx.lineTo(R * 1.35, 0); ctx.stroke(); }
        ctx.fillStyle = rgba('#ff3040', a); ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
        ctx.restore();
      },
      end(e, ww) {
        const g = gunOf(p), x = e.d.x, y = e.d.y;
        p.facing = Math.sign(x - p.cx) || p.facing;
        pose(p, ww, i % 2 ? 'shoot_alt' : 'shoot', 0.16, { h0: 0.01, sfx: 'gun' });
        const ratio = tg.dead ? 1 : clamp(tg.hp / maxHpOf(tg), 0, 1);
        playerStrike(ww, circ(x, y, 26), atk(p, { mv, mult: p.dmgMul * (1 + (1 - ratio) * 1.5), crit: 30, kb: [300, -260], hitstop: 0.1, shake: 6, dir: Math.sign(x - p.cx) || 1 }));
        fx(ww, {
          life: 0.14, z: 12, x: Math.min(g.x, x) - 10, y: Math.min(g.y, y) - 10, w: Math.abs(x - g.x) + 20, h: Math.abs(y - g.y) + 20,
          draw(ctx, e2) { cutLine(ctx, g.x, g.y, x, y, 3, '#ffd070', 1 - e2.k); },
        });
        muzzle(ww, p, g.x, g.y, Math.atan2(y - g.y, x - g.x), '#ffd070', 1.4);
        ww.fx.burst('blood', x, y, 10, { speed: 260 }); ww.fx.flash(x, y, { color: '#ff3040', size: 90, life: 0.12 });
        audio.sfx('crit');
      },
    });
  });
};

function dynamiteRender(ctx, pr) {
  ctx.rotate(pr.rot);
  ctx.fillStyle = '#b01a14'; ctx.fillRect(-12, -5, 24, 10);
  ctx.fillStyle = '#e8d8b0'; ctx.fillRect(-12, -5, 3, 10); ctx.fillRect(9, -5, 3, 10);
  ctx.fillStyle = '#1a0c08'; ctx.fillRect(-4, -5, 2, 10); ctx.fillRect(3, -5, 2, 10);
  ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1.2; ctx.strokeRect(-12, -5, 24, 10);
  ctx.strokeStyle = '#6a5a4a'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.quadraticCurveTo(18, -6, 20, -10); ctx.stroke();
  ctx.globalCompositeOperation = ADD; glow(ctx, 20, -10, 12 + Math.random() * 6, '#ffd070', 1); flare(ctx, 20, -10, 10, '#fff0b0', 1, pr.t * 20);
}
SKILL_IMPL.victor_dynamite = (p, w, lv) => {
  const id = 'victor_dynamite', n = N(id, lv), r = V(id, 'r', lv), mv = MV(id, lv), f = p.facing;
  p.throwT = 0.25; audio.sfx('axe', { pitch: 1.2 });
  for (let i = 0; i < n; i++) {
    shoot(w, p, {
      x: p.cx + f * 20, y: p.bottom - 70, vx: f * (380 + i * 110), vy: -560 - i * 50, w: 16, h: 16, behavior: 'arc', gravity: 1, collideWalls: 'land',
      spin: 12 * f, life: 1.6, pierce: 1, render: dynamiteRender, light: { r: 60, color: '#ffc060', i: 0.7 },
      attack: atk(p, { mv: 0.2, element: 'fire', kb: [60, -60], hitstop: 0.02 }),
      onLand: (pr, ww) => pr.expire(ww),
      onExpire: (pr, ww) => boom(ww, p, pr.cx, pr.cy - 10, r, { mv, element: 'fire', shake: 9, kb: [340, -520], atk: { launch: true } }),
    });
  }
};

SKILL_IMPL.victor_hellfire_burst = (p, w, lv) => {
  const id = 'victor_hellfire_burst', n = N(id, lv), mv = MV(id, lv), f = p.facing, g = gunOf(p);
  pose(p, w, 'shoot_double', 0.45, { h0: 0.05, sfx: 'shotgun' });
  p.vx = -f * 260;
  audio.sfx('fire'); shake(w, 8, 0.25); w.camera.punchZoom(1.03, 0.1);
  const base = f > 0 ? 0 : Math.PI;
  for (let i = 0; i < n; i++) {
    const ang = base + rand(-0.34, 0.34);
    bullet(w, p, g.x, g.y, ang, { mv, speed: rand(1200, 1700), life: rand(0.3, 0.45), render: fireballRender, scale: 0.45, element: 'fire', trail: i % 3 === 0 ? 'fire' : null, kb: [220, -140], light: i % 4 === 0 ? { r: 70, color: '#ff7a2a', i: 0.7 } : null });
  }
  // 총구 화염 원뿔
  fx(w, {
    life: 0.25, z: 12, x: g.x - 200, y: g.y - 120, w: 400, h: 240,
    draw(ctx, e) {
      const a = 1 - e.k, L = 190 * (0.6 + e.k * 0.6);
      ctx.save(); ctx.translate(g.x, g.y); ctx.scale(f, 1); ctx.globalCompositeOperation = ADD;
      const gr = ctx.createLinearGradient(0, 0, L, 0);
      gr.addColorStop(0, rgba('#fff0c0', a)); gr.addColorStop(0.4, rgba('#ff8a2a', 0.8 * a)); gr.addColorStop(1, rgba('#ff3a0a', 0));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(0, -6); ctx.quadraticCurveTo(L * 0.6, -L * 0.42, L, -L * 0.3); ctx.lineTo(L, L * 0.3); ctx.quadraticCurveTo(L * 0.6, L * 0.42, 0, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
    light(L) { L.add(g.x + f * 80, g.y, 260, '#ff7a2a', 1.2); },
  });
  // 불바다
  for (let i = 0; i < 3; i++) {
    const x = p.cx + f * (100 + i * 85), base0 = groundAt(w, x, p.bottom - 30) ?? p.bottom;
    fx(w, {
      delay: 0.08 + i * 0.05, life: 1.7, z: 9, x: x - 50, y: base0 - 90, w: 100, h: 94,
      atk: atk(p, { mv: mv * 0.6, element: 'fire', rehit: 0.35, kb: [60, -260], hitstop: 0.02, shake: 1 }), win: [0, 0.9],
      rect() { return { x: x - 40, y: base0 - 60, w: 80, h: 60 }; },
      draw(ctx, e) { const a = Math.min(1, e.lt * 6) * clamp((e.life - e.lt) / 0.4, 0, 1); fireColumn(ctx, x, base0, 20, 70, e.lt + i, a); fireColumn(ctx, x - 26, base0, 12, 40, e.lt * 1.3 + i + 0.5, a); fireColumn(ctx, x + 24, base0, 13, 46, e.lt * 1.1 + i + 0.2, a); },
      light(L, e) { L.add(x, base0 - 30, 130, '#ff7a2a', 0.8 * (1 - e.k)); },
    });
  }
};

SKILL_IMPL.victor_gatling = (p, w, lv) => {
  const id = 'victor_gatling', T = V(id, 't', lv), mv = MV(id, lv);
  audio.sfx('charge_ready');
  fx(w, {
    life: T, z: 12, d: { cd: 0, n: 0 },
    follow(e) { e.x = p.cx - 100; e.y = p.cy - 100; e.w = e.h = 200; },
    tick(e, ww, dt) {
      p.vx *= 0.6;
      if (!p.move || p.move.id !== 'sk_shoot_double') pose(p, ww, 'shoot_double', 0.3, { h0: 0.01, hw: 0.25, sfx: 'gun' });
      e.d.cd -= dt;
      while (e.d.cd <= 0) {
        e.d.cd += 0.045; e.d.n++;
        const alt = e.d.n % 2 === 1, g = gunOf(p, alt), ang = (p.facing > 0 ? 0 : Math.PI) + rand(-0.075, 0.075);
        bullet(ww, p, g.x, g.y + rand(-3, 3), ang, { mv, speed: 1900, scale: 1.2, kb: [90, -30], hitstop: 0.015, shake: 0.5 });
        muzzle(ww, p, g.x, g.y, ang, '#ffd070', 1.1);
        ww.fx.emit('spark', p.cx - p.facing * 6, p.bottom - 62, { color: '#e8c060', angle: -Math.PI / 2 - p.facing * 0.6, spread: 0.4, speed: 220, grav: 1200, life: 0.5, size: 2.5 });
        if (e.d.n % 2 === 0) audio.sfx('gun', { vol: 0.55, pitch: rand(1.0, 1.2) });
        shake(ww, 1.8, 0.06);
      }
    },
    end() { p.endMove(); },
    light(L) { L.add(p.cx + p.facing * 60, p.bottom - 60, 180, '#ffd070', 0.9); },
  });
};

// ═══════════════════════════ 브란 ═══════════════════════════
const ROCK = { c1: '#5e4e44', c2: '#16100c', rim: 'rgba(255,170,90,0.95)', glow: '#ff7a2a', dustCol: '#8a7a6a', bitCol: '#6a5a4a' };
SKILL_IMPL.bran_ground_split = (p, w, lv) => {
  const id = 'bran_ground_split', n = N(id, lv), mv = MV(id, lv), s = SZ(lv), f = p.facing, x0 = p.cx;
  pose(p, w, 'heavy_down', 0.52, { h0: 0.17, hw: 0.1, sfx: 'slash_heavy', mv: { slash: { r: 110, arc: 2.4, angle: 0.3, width: 30, color: '#ffc080' } } });
  const hitT = 0.17 / p.atkSpeedMul;
  seq(w, [[hitT, (ww) => {
    shake(ww, 7, 0.2); audio.sfx('explode', { vol: 0.7, pitch: 0.8 });
    const gx = x0 + f * 60, gy = groundAt(ww, gx, p.bottom - 20) ?? p.bottom;
    ww.fx.ring(gx, gy, { color: '#ffc080', r0: 10, r1: 90, life: 0.3, width: 6 });
    ww.fx.burst('dust', gx, gy, 12, { speed: 200 });
    for (let i = 0; i < n; i++) {
      const x = x0 + f * (80 + i * 62 * s), base = groundAt(ww, x, gy - 30) ?? gy;
      spikeFx(ww, p, x, base, (72 + i * 7) * s, 20 * s, i * 0.065, atk(p, { mv, kb: [180, -560], launch: true, hitstop: 0.05, shake: 3 }), ROCK);
    }
  }]]);
};

SKILL_IMPL.bran_whirlwind = (p, w, lv) => {
  const id = 'bran_whirlwind', r = V(id, 'r', lv), T = V(id, 't', lv), mv = MV(id, lv);
  audio.sfx('slash_heavy');
  fx(w, {
    life: T, z: 11, d: { a: 0, snd: 0 },
    atk: atk(p, { mv, kb: [320, -260], rehit: 0.12, hitstop: 0.035, shake: 2 }), win: [0, 1],
    follow(e) { e.d.cx = p.cx; e.d.cy = p.bottom - 50; e.x = p.cx - r * 1.2; e.y = e.d.cy - r * 1.2; e.w = e.h = r * 2.4; },
    rect(e) { return { x: e.d.cx - r, y: e.d.cy - r * 0.8, w: r * 2, h: r * 1.35 }; },
    tick(e, ww, dt) {
      e.d.a += dt * 17 * p.facing;
      if (!p.move || p.move.id !== 'sk_heavy_spin') pose(p, ww, 'heavy_spin', 0.44, { h0: 0.02, hw: 0.4, sfx: 'slash', mv: { canMove: true } });
      e.d.snd -= dt; if (e.d.snd <= 0) { e.d.snd = 0.2; audio.sfx('slash', { vol: 0.5, pitch: rand(0.8, 1) }); }
      if (Math.random() < 0.5) ww.fx.emit('dust', e.d.cx + rand(-r, r), p.bottom - 4, { speed: 80, angle: -Math.PI / 2 });
      if (Math.random() < 0.4) ww.fx.emit('spark', e.d.cx + rand(-r, r) * 0.8, e.d.cy + rand(-30, 30), { color: '#e8ecf8', speed: 300 });
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 8) * clamp((e.life - e.lt) / 0.2, 0, 1), cx = e.d.cx, cy = e.d.cy;
      ctx.globalCompositeOperation = ADD;
      glow(ctx, cx, cy, r * 1.1, '#c8d4ff', 0.2 * a);
      for (let j = 0; j < 4; j++) {
        const yy = cy + 34 - j * 26, rr = r * (0.85 + j * 0.08), rot = e.d.a * (1 + j * 0.1) + j;
        ctx.save(); ctx.translate(cx, yy); ctx.scale(1, 0.28); ctx.lineCap = 'round';
        for (let k = 0; k < 6; k++) {
          const u = (k + 1) / 6, a0 = rot - 2.4 + k * 0.4;
          ctx.strokeStyle = rgba(j % 2 ? '#e8ecff' : '#9ab0d0', a * u * 0.7); ctx.lineWidth = 3 + u * 12;
          ctx.beginPath(); ctx.arc(0, 0, rr, a0, a0 + 0.42); ctx.stroke();
        }
        ctx.restore();
      }
    },
    end() { p.endMove(); },
    light(L, e) { L.add(e.d.cx, e.d.cy, r * 1.5, '#c8d4ff', 0.6); },
  });
};

function shieldShape(ctx, s, a) {
  ctx.globalCompositeOperation = ADD; glow(ctx, 0, 0, 70 * s, '#9ad0ff', 0.45 * a);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
  const g = ctx.createLinearGradient(-24 * s, -40 * s, 24 * s, 40 * s);
  g.addColorStop(0, '#e8f0ff'); g.addColorStop(0.5, '#6a8ad0'); g.addColorStop(1, '#1a2a5a');
  ctx.fillStyle = g; ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.moveTo(-24 * s, -38 * s); ctx.quadraticCurveTo(0, -46 * s, 24 * s, -38 * s); ctx.lineTo(22 * s, 6 * s); ctx.quadraticCurveTo(14 * s, 30 * s, 0, 42 * s); ctx.quadraticCurveTo(-14 * s, 30 * s, -22 * s, 6 * s); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.globalCompositeOperation = ADD; ctx.fillStyle = rgba('#fff2b0', 0.95 * a);
  ctx.fillRect(-3 * s, -28 * s, 6 * s, 50 * s); ctx.fillRect(-14 * s, -14 * s, 28 * s, 6 * s);
  ctx.globalAlpha = 1;
}
SKILL_IMPL.bran_shield_charge = (p, w, lv) => {
  const id = 'bran_shield_charge', D = V(id, 'r', lv), mv = MV(id, lv), f = p.facing, dur = 0.28, sp = D / dur, s = 0.95 + lv * 0.05;
  pose(p, w, 'heavy_low', 0.4, { h0: 0.03, hw: 0.3, sfx: 'dash' });
  audio.sfx('clang', { pitch: 0.8 });
  fx(w, {
    life: dur, z: 12, d: { g: 0 },
    atk: atk(p, { mv, element: 'holy', kb: [640, -360], hitstop: 0.09, shake: 7, stun: 0.6 }), win: [0, 1],
    follow(e) { e.x = p.cx - 60; e.y = p.y - 20; e.w = 120; e.h = p.h + 30; },
    rect() { return { x: f > 0 ? p.cx : p.cx - 76, y: p.y - 6, w: 76, h: p.h + 6 }; },
    tick(e, ww) {
      p.vx = f * sp; holdInvuln(p);
      if ((e.d.g++ & 1) === 0) afterimage(ww, p, '#9ad0ff', 0.2);
      ww.fx.emit('dust', p.cx - f * 10, p.bottom - 2, { speed: 90, angle: f > 0 ? Math.PI : 0, spread: 0.4 });
    },
    onHit(e, ww) { audio.sfx('clang'); },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 12);
      ctx.save(); ctx.translate(p.cx + f * 40, p.cy - 4); ctx.scale(f, 1); shieldShape(ctx, s, a); ctx.restore();
      ctx.globalCompositeOperation = ADD;
      for (let i = 0; i < 5; i++) { const y = p.y + 10 + i * 16; cutLine(ctx, p.cx - f * (30 + i * 9), y, p.cx - f * (120 + i * 22), y, 1.5, '#9ad0ff', 0.6 * a); }
    },
    end(e, ww) {
      p.iframes = 0; p.vx = f * 120;
      ww.fx.ring(p.cx + f * 40, p.cy, { color: '#bcd4ff', r0: 10, r1: 90, life: 0.3, width: 6 });
      ww.fx.burst('holy', p.cx + f * 40, p.cy, 12, { speed: 260 });
      shake(ww, 5, 0.15);
    },
    light(L) { L.add(p.cx + f * 40, p.cy, 150, '#9ad0ff', 1); },
  });
};

SKILL_IMPL.bran_aegis = (p, w, lv) => {
  const id = 'bran_aegis', T = V(id, 't', lv), mv = MV(id, lv), f = p.facing, x = p.cx + f * 80;
  const base = groundAt(w, x, p.bottom - 30) ?? p.bottom, H = 210, Wd = 16;
  pose(p, w, 'heavy_up', 0.45, { h0: 0.12, sfx: 'holy' });
  audio.sfx('clang', { pitch: 0.6 }); audio.sfx('holy');
  fx(w, {
    life: T, z: 11, x: x - 60, y: base - H - 20, w: 120, h: H + 30, d: { snd: 0 },
    atk: atk(p, { mv, element: 'holy', kb: [420, -220], rehit: 0.3, hitstop: 0.04, shake: 2, dir: f }), win: [0.03, 1],
    rect() { return { x: x - Wd * 1.6, y: base - H, w: Wd * 3.2, h: H }; },
    start(e, ww) { ww.fx.burst('holy', x, base - 20, 18, { angle: -Math.PI / 2, spread: 0.5, speed: 380 }); shake(ww, 5, 0.2); },
    tick(e, ww, dt) {
      e.d.snd -= dt;
      const r = { x: x - Wd * 2, y: base - H, w: Wd * 4, h: H };
      for (const pr of ww.entities) {
        if (pr.kind !== 'projectile' || pr.team !== 'enemy' || pr.dead) continue;
        if (overlap(r, pr.rect())) {
          pr.dead = true;
          ww.fx.burst('spark', pr.cx, pr.cy, 8, { color: '#bcd4ff', speed: 260 });
          ww.fx.flash(pr.cx, pr.cy, { color: '#bcd4ff', size: 50, life: 0.1 });
          if (e.d.snd <= 0) { e.d.snd = 0.12; audio.sfx('clang', { vol: 0.6, pitch: rand(1, 1.3) }); }
        }
      }
    },
    draw(ctx, e) {
      const up = ease.outBack(clamp(e.lt / 0.18, 0, 1)), a = clamp((e.life - e.lt) / 0.25, 0, 1), h = H * up, top = base - h;
      ctx.globalCompositeOperation = ADD;
      const g = ctx.createLinearGradient(x - Wd * 2, 0, x + Wd * 2, 0);
      g.addColorStop(0, rgba('#6a9aff', 0)); g.addColorStop(0.5, rgba('#9ad0ff', 0.35 * a)); g.addColorStop(1, rgba('#6a9aff', 0));
      ctx.fillStyle = g; ctx.fillRect(x - Wd * 2, top, Wd * 4, h);
      ctx.strokeStyle = rgba('#bcdcff', 0.55 * a); ctx.lineWidth = 1.5;
      const hs = 13;
      for (let row = 0; row * hs * 1.5 < h; row++) {
        const yy = base - row * hs * 1.5 - hs, ox = row % 2 ? hs * 0.86 : 0, pulse = 0.5 + 0.5 * Math.sin(e.lt * 6 + row * 0.7);
        ctx.strokeStyle = rgba('#bcdcff', (0.25 + pulse * 0.45) * a);
        for (let c = -1; c <= 0; c++) {
          const cx = x + c * hs * 1.72 + ox + hs * 0.86;
          ctx.beginPath();
          for (let k = 0; k <= 6; k++) { const t = k / 6 * TAU + Math.PI / 6; k ? ctx.lineTo(cx + Math.cos(t) * hs, yy + Math.sin(t) * hs) : ctx.moveTo(cx + Math.cos(t) * hs, yy + Math.sin(t) * hs); }
          ctx.stroke();
        }
      }
      beamV(ctx, x - Wd * 1.9, top, base, 2.5, '#fff2b0', 0.9 * a);
      beamV(ctx, x + Wd * 1.9, top, base, 2.5, '#fff2b0', 0.9 * a);
      glow(ctx, x, top, 40, '#fff2b0', 0.6 * a);
      glow(ctx, x, base, 50, '#9ad0ff', 0.6 * a);
    },
    light(L, e) { L.add(x, base - H / 2, 200, '#9ad0ff', 0.9 * (1 - e.k * 0.5)); },
  });
};

SKILL_IMPL.bran_crusade_sword = (p, w, lv) => {
  const id = 'bran_crusade_sword', r = V(id, 'r', lv), mv = MV(id, lv), s = SZ(lv), f = p.facing;
  const tg = frontEnemies(w, p, 420)[0];
  const tx = tg ? tg.cx : p.cx + f * 170, base = groundAt(w, tx, (tg ? tg.cy : p.bottom - 30)) ?? p.bottom;
  const L = 280 * s, Wd = 40 * s, top = w.camera.y - L - 40, fall = 0.3;
  pose(p, w, 'heavy_up', 0.5, { h0: 0.12, sfx: 'holy' });
  audio.sfx('bell', { pitch: 0.7 });
  fx(w, {
    life: 1.25, z: 11, x: tx - L * 0.6, y: top, w: L * 1.2, h: base - top + 60, d: { hit: false },
    tick(e, ww) {
      if (!e.d.hit && e.lt >= fall) {
        e.d.hit = true;
        const n = playerStrike(ww, { x: tx - r, y: base - r * 1.3, w: r * 2, h: r * 1.3 + 10 }, atk(p, { mv, element: 'holy', kb: [360, -640], launch: true, hitstop: 0.16, shake: 12, dir: f }));
        shake(ww, 14, 0.4); ww.camera.punchZoom(1.06, 0.2); ww.game.flash('#fff8e0', 0.5, 4);
        audio.sfx('explode'); audio.sfx('holy', { pitch: 0.8 });
        ww.fx.ring(tx, base - 6, { color: '#fff2b0', r0: 20, r1: r * 1.4, life: 0.45, width: 12 });
        ww.fx.burst('holy', tx, base - 20, 30, { speed: 420 });
        ww.fx.burst('shard', tx, base - 6, 14, { angle: -Math.PI / 2, spread: 1.2, speed: 460, color: '#7a6a5a' });
        ww.fx.burst('dust', tx, base, 16, { speed: 260 });
        if (n) audio.sfx('hit_heavy');
      }
    },
    draw(ctx, e) {
      const u = clamp(e.lt / fall, 0, 1), tipY = lerp(top + L, base + L * 0.28, ease.inCubic(u)), a = clamp((e.life - e.lt) / 0.35, 0, 1);
      ctx.globalCompositeOperation = ADD;
      if (u < 1) beamV(ctx, tx, top, tipY - L * 0.3, Wd * 0.5, '#fff2b0', 0.5 * u);
      if (e.d.hit) {
        const k = (e.lt - fall) / 0.4;
        if (k < 1) { beamV(ctx, tx, w.camera.y - 20, base, Wd * 2.2 * (1 - k), '#fff2b0', 1 - k); glow(ctx, tx, base, r * 1.4, '#fff2b0', 1 - k); }
        runeCircle(ctx, tx, base - 1, r, '#fff2b0', e.lt * 2, a * 0.8, 0.22, 8);
      }
      ctx.save(); ctx.translate(tx, tipY - L); bigSword(ctx, L, Wd, '#f4f6ff', a, '#fff2b0'); ctx.restore();
    },
    light(L2, e) { L2.add(tx, base - 100, e.d.hit ? r * 2.6 : 160, '#fff2b0', e.d.hit ? 1.4 * (1 - e.k) : 0.7); },
  });
};

SKILL_IMPL.bran_warcry = (p, w, lv) => {
  const id = 'bran_warcry', T = V(id, 't', lv), r = V(id, 'r', lv), mv = MV(id, lv);
  p.buffs.rage = Math.max(p.buffs.rage ?? 0, T);
  pose(p, w, 'heavy_up', 0.5, { h0: 0.1, sfx: 'boss_roar' });
  audio.sfx('boss_roar', { pitch: 1.3 });
  w.game.flash('#ff3020', 0.3, 4); shake(w, 10, 0.4);
  playerStrike(w, circ(p.cx, p.cy, r), atk(p, { mv, kb: [380, -300], hitstop: 0.06, shake: 4, stun: 1.2 }));
  for (let i = 0; i < 3; i++) setTimeoutFx(w, i * 0.09, (ww) => ww.fx.ring(p.cx, p.cy - 10, { color: i === 1 ? '#ffd070' : '#ff4030', r0: 20, r1: r * (1.1 + i * 0.25), life: 0.4, width: 10 - i * 2 }));
  w.fx.burst('dust', p.cx, p.bottom, 16, { speed: 320 });
  fx(w, {
    life: 0.5, z: 12, x: p.cx - r * 1.5, y: p.cy - r * 1.5, w: r * 3, h: r * 3, d: { cx: p.cx, cy: p.cy - 10 },
    draw(ctx, e) {
      const a = 1 - e.k, cx = e.d.cx, cy = e.d.cy;
      ctx.globalCompositeOperation = ADD;
      glow(ctx, cx, cy, r * (0.6 + e.k), '#ff4030', 0.4 * a);
      for (let i = 0; i < 18; i++) {
        const t = i / 18 * TAU + 0.2, r0 = 40 + e.k * r * 0.8, r1 = r0 + 50 + (i % 3) * 20;
        cutLine(ctx, cx + Math.cos(t) * r0, cy + Math.sin(t) * r0 * 0.7, cx + Math.cos(t) * r1, cy + Math.sin(t) * r1 * 0.7, 2.5, '#ff7a3a', a);
      }
    },
  });
};
function setTimeoutFx(w, delay, fn) { fx(w, { delay, life: 0.01, start: (e, ww) => fn(ww) }); }

SKILL_IMPL.bran_warlord_leap = (p, w, lv) => {
  const id = 'bran_warlord_leap', r = V(id, 'r', lv), mv = MV(id, lv), f = p.facing;
  p.vy = -1050; p.vx = f * 300; p.onGround = false; p.jumpCut = true;
  pose(p, w, 'heavy_up', 0.34, { h0: 0.05, sfx: 'jump' });
  w.fx.burst('dust', p.cx, p.bottom, 14, { speed: 240 });
  audio.sfx('jump', { pitch: 0.7 });
  fx(w, {
    life: 1.6, z: 12, d: { dive: false, done: false },
    tick(e, ww) {
      holdInvuln(p);
      if (!e.d.dive && p.vy > -120) { e.d.dive = true; pose(p, ww, 'plunge', 1.2, { h0: 0.02, hw: 1.1, sfx: 'dash' }); p.vy = 1300; p.vx = f * 180; }
      if (e.d.dive) { p.vy = Math.max(p.vy, 1300); afterimage(ww, p, '#ff9a3a', 0.15); }
      if (e.d.dive && p.onGround && !e.d.done) {
        e.d.done = true;
        const x = p.cx, y = p.bottom;
        playerStrike(ww, { x: x - r, y: y - r * 0.9, w: r * 2, h: r * 0.9 + 12 }, atk(p, { mv, kb: [420, -700], launch: true, hitstop: 0.14, shake: 12 }));
        boomRing(ww, x, y, r, '#ffb060');
        shake(ww, 16, 0.45); ww.camera.punchZoom(1.07, 0.2); ww.game.flash('#ffb060', 0.35, 4);
        audio.sfx('explode', { pitch: 0.7 });
        p.endMove(); p.iframes = 0;
        e.dead = true;
      }
    },
    end() { p.iframes = 0; },
  });
};
/** 지면 충격파 연출 (균열 + 파편) */
function boomRing(w, x, y, r, col) {
  w.fx.ring(x, y - 4, { color: col, r0: 20, r1: r * 1.5, life: 0.45, width: 12 });
  w.fx.burst('shard', x, y - 6, 18, { angle: -Math.PI / 2, spread: 1.3, speed: 520, color: '#6a5a4a' });
  w.fx.burst('dust', x, y, 20, { speed: 300 });
  w.fx.burst('fire', x, y - 10, 12, { speed: 260, color: col });
  const cracks = [];
  for (let i = 0; i < 7; i++) {
    const dir = i % 2 ? 1 : -1, len = r * rand(0.6, 1.3), pts = [x, y];
    let cx = x, cy = y;
    for (let k = 0; k < 5; k++) { cx += dir * len / 5; cy = y - rand(0, 5) + (k === 4 ? 0 : 0); pts.push(cx, cy + rand(-3, 3)); }
    cracks.push(pts);
  }
  fx(w, {
    life: 0.9, z: -1, x: x - r * 1.4, y: y - 40, w: r * 2.8, h: 60,
    draw(ctx, e) {
      const a = 1 - e.k;
      ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const pts of cracks) {
        ctx.strokeStyle = rgba(col, 0.35 * a); ctx.lineWidth = 7; strokePts(ctx, pts);
        ctx.strokeStyle = rgba('#fff0c0', 0.9 * a); ctx.lineWidth = 2; strokePts(ctx, pts);
      }
      glow(ctx, x, y, r * 1.1, col, 0.5 * a);
    },
    light(L, e) { L.add(x, y - 30, r * 2.4, col, 1.2 * (1 - e.k)); },
  });
}

SKILL_IMPL.bran_blood_frenzy = (p, w, lv) => {
  const id = 'bran_blood_frenzy', n = N(id, lv), mv = MV(id, lv), steps = [];
  audio.sfx('slash_heavy', { pitch: 0.8 });
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    steps.push([i * 0.1, (ww) => {
      const f = p.facing;
      pose(p, ww, i % 2 ? 'heavy_up' : 'heavy_down', last ? 0.36 : 0.16, { h0: 0.03, hw: 0.06, sfx: 'slash_heavy' });
      p.vx = f * 90;
      const ang = (f > 0 ? 0 : Math.PI) + (i % 2 ? -0.5 : 0.5) * f + rand(-0.3, 0.3);
      ww.fx.slash(p.cx + f * 30, p.bottom - 62, ang, { radius: (last ? 150 : 115) * SZ(lv), arc: 2.6, width: last ? 38 : 26, color: '#ff2a3a', life: 0.16 });
      const nHit = playerStrike(ww, p.relRect(-16, -140, last ? 200 : 170, 140), atk(p, { mv: last ? mv * 2 : mv, kb: last ? [480, -380] : [120, -120], hitstop: last ? 0.12 : 0.04, shake: last ? 9 : 3 }));
      if (nHit) { p.heal(p.stats.hp * 0.012 * nHit, false); ww.fx.burst('blood', p.cx + f * 70, p.cy - 10, 8 * nHit, { speed: 260 }); }
    }]);
  }
  seq(w, steps);
};

// ═══════════════════════════ 리아 ═══════════════════════════
/** X자 칼선 연출 */
function xSlash(w, x, y, size, col, life = 0.26, rot = 0) {
  fx(w, {
    life, z: 12, x: x - size, y: y - size, w: size * 2, h: size * 2,
    draw(ctx, e) {
      const u = ease.outCubic(Math.min(1, e.lt / 0.06)), a = 1 - clamp((e.k - 0.3) / 0.7, 0, 1), L = size * u;
      for (const s of [-1, 1]) {
        const t = rot + s * 0.78;
        cutLine(ctx, x - Math.cos(t) * L, y - Math.sin(t) * L, x + Math.cos(t) * L, y + Math.sin(t) * L, 5 * (1 - e.k * 0.5), col, a);
      }
      ctx.globalCompositeOperation = ADD; glow(ctx, x, y, size * 0.8, col, 0.5 * a);
    },
  });
}
SKILL_IMPL.lia_shadow_step = (p, w, lv) => {
  const id = 'lia_shadow_step', R = V(id, 'r', lv), mv = MV(id, lv);
  const tg = w.nearestEnemy(p.cx, p.cy, R);
  const x0 = p.cx, y0 = p.cy;
  afterimage(w, p, '#b060ff', 0.35);
  w.fx.burst('dark', p.cx, p.cy, 12, { speed: 120, color: '#3a1a5a' });
  audio.sfx('mist');
  let tx, tb;
  if (tg) {
    const side = -(tg.facing || 1), cands = [tg.cx + side * (tg.w / 2 + p.w / 2 + 14), tg.cx - side * (tg.w / 2 + p.w / 2 + 14)];
    const bottoms = [tg.bottom, p.bottom];
    outer: for (const cx of cands) for (const b of bottoms) if (freeSpot(w, p, cx, b)) { tx = cx; tb = b; break outer; }
  } else {
    for (let d = 180; d >= 40; d -= 20) { const cx = p.cx + p.facing * d; if (freeSpot(w, p, cx, p.bottom)) { tx = cx; tb = p.bottom; break; } }
  }
  if (tx !== undefined) { p.x = tx - p.w / 2; p.y = tb - p.h; p.vx = 0; p.vy = Math.min(p.vy, 0); }
  if (tg) p.facing = Math.sign(tg.cx - p.cx) || p.facing;
  holdInvuln(p);
  pose(p, w, 'stab_alt', 0.26, { h0: 0.02, hw: 0.06, sfx: 'slash_heavy' });
  const hx = tg ? tg.cx : p.cx + p.facing * 60, hy = tg ? tg.cy : p.cy;
  fx(w, {
    life: 0.2, z: 12, x: Math.min(x0, p.cx) - 20, y: Math.min(y0, p.cy) - 30, w: Math.abs(p.cx - x0) + 40, h: 60,
    draw(ctx, e) { cutLine(ctx, x0, y0, p.cx, p.cy, 2, '#b060ff', 0.8 * (1 - e.k)); },
  });
  playerStrike(w, circ(hx, hy, tg ? Math.max(tg.w, tg.h) * 0.6 : 50), atk(p, { mv, crit: 100, element: 'dark', kb: [260, -320], hitstop: 0.12, shake: 6 }));
  xSlash(w, hx, hy, 60 + lv * 6, '#ff4a6a', 0.3, rand(-0.3, 0.3));
  w.fx.flash(hx, hy, { color: '#ff4a6a', size: 90, life: 0.12 });
  w.fx.burst('dark', p.cx, p.cy, 10, { speed: 100, color: '#3a1a5a' });
};

function xCrescentRender(ctx, pr) {
  const d = Math.sign(pr.vx) || 1, R = pr.h * 0.5;
  ctx.scale(d, 1);
  for (const s of [-1, 1]) { ctx.save(); ctx.rotate(s * 0.62); ctx.scale(0.8, 1); crescent(ctx, R, R * 0.24, pr.color, 0.95, '#ffd0da'); ctx.restore(); }
  ctx.globalCompositeOperation = ADD; glow(ctx, R * 0.3, 0, R * 0.7, '#ffffff', 0.4);
}
SKILL_IMPL.lia_cross_cut = (p, w, lv) => {
  const id = 'lia_cross_cut', n = N(id, lv), mv = MV(id, lv), s = SZ(lv), steps = [];
  for (let i = 0; i < n; i++) steps.push([i * 0.11, (ww) => {
    const f = p.facing;
    pose(p, ww, i % 2 ? 'stab' : 'spin_blade', 0.28, { h0: 0.03, hw: 0.1, sfx: 'slash_heavy' });
    shoot(ww, p, {
      x: p.cx + f * 34, y: p.bottom - 52 + (i % 2 ? -14 : 8), vx: f * 940, vy: 0, w: 60 * s, h: 96 * s, render: xCrescentRender, color: '#ff4a6a',
      life: 0.55, pierce: 99, collideWalls: false, fadeOut: true, light: { r: 110 * s, color: '#ff4a6a', i: 0.8 },
      attack: atk(p, { mv, kb: [240, -200], hitstop: 0.06, shake: 3 }),
    });
  }]);
  seq(w, steps);
};

function shurikenRender(ctx, pr) {
  const s = pr.scale;
  ctx.globalCompositeOperation = ADD; glow(ctx, 0, 0, 22 * s, '#b0c0ff', 0.35);
  ctx.strokeStyle = 'rgba(200,210,255,0.3)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 13 * s, 0, TAU); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(pr.rot);
  const g = ctx.createLinearGradient(-12 * s, -12 * s, 12 * s, 12 * s);
  g.addColorStop(0, '#f4f6ff'); g.addColorStop(0.5, '#8a90a8'); g.addColorStop(1, '#3a3e50');
  ctx.fillStyle = g; ctx.strokeStyle = '#0c0a12'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const t = i / 4 * TAU;
    ctx.lineTo(Math.cos(t) * 13 * s, Math.sin(t) * 13 * s);
    ctx.lineTo(Math.cos(t + Math.PI / 4) * 3.5 * s, Math.sin(t + Math.PI / 4) * 3.5 * s);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c0142a'; ctx.beginPath(); ctx.arc(0, 0, 2.5 * s, 0, TAU); ctx.fill();
}
SKILL_IMPL.lia_shuriken = (p, w, lv) => {
  const id = 'lia_shuriken', n = N(id, lv), mv = MV(id, lv), f = p.facing, spread = Math.min(0.8, 0.13 * (n - 1));
  p.throwT = 0.2; audio.sfx('dagger', { pitch: 1.3 });
  for (let i = 0; i < n; i++) {
    const da = n > 1 ? -spread / 2 + spread * i / (n - 1) : 0, ang = f > 0 ? da : Math.PI - da;
    shoot(w, p, {
      x: p.cx + f * 22, y: p.bottom - 56, vx: Math.cos(ang) * 1050, vy: Math.sin(ang) * 1050, w: 22, h: 22, scale: 1.2, spin: 30,
      render: shurikenRender, life: 0.7, pierce: 3, attack: atk(p, { mv, kb: [120, -60], hitstop: 0.03, shake: 1, crit: 5 }),
    });
  }
};

SKILL_IMPL.lia_shadow_clones = (p, w, lv) => {
  const id = 'lia_shadow_clones', n = N(id, lv), mv = MV(id, lv), f = p.facing;
  const tgs = enemiesIn(w, viewRect(w)).sort((a, b) => Math.abs(a.cx - p.cx) - Math.abs(b.cx - p.cx));
  audio.sfx('mist'); audio.sfx('dark', { vol: 0.6 });
  pose(p, w, 'cast', 0.4, { h0: 0.1, sfx: 'dark' });
  for (let i = 0; i < n; i++) {
    const tg = tgs.length ? tgs[i % tgs.length] : null;
    const sx = p.cx - f * (20 + i * 14), sb = p.bottom;
    const dir = tg ? (Math.sign(tg.cx - sx) || f) : f;
    const ex = tg ? tg.cx + dir * (tg.w / 2 + 90) : sx + f * (260 + i * 40), eb = tg ? (groundAt(w, ex, tg.cy) ?? tg.bottom) : sb;
    const tyC = tg ? tg.cy : sb - 44;
    const snap = ghostOf(p, sx, sb, { anim: 'dash', move: null, facing: dir, onGround: true });
    const D = 0.17;
    fx(w, {
      delay: 0.06 + i * 0.09, life: 0.5, z: 11, d: { x: sx, b: sb },
      atk: atk(p, { mv, element: 'dark', kb: [260, -300], hitstop: 0.06, shake: 3, dir, crit: 10 }), win: [0.15, 0.4],
      follow(e) {
        const u = ease.inOutQuad(clamp(e.lt / D, 0, 1));
        e.d.x = lerp(sx, ex, u); e.d.b = lerp(sb, eb, u);
        e.x = Math.min(sx, ex) - 40; e.y = Math.min(sb, eb) - 110; e.w = Math.abs(ex - sx) + 80; e.h = Math.abs(eb - sb) + 120;
      },
      rect() { return { x: Math.min(sx, ex), y: tyC - 40, w: Math.abs(ex - sx), h: 80 }; },
      start(e, ww) { ww.fx.burst('dark', sx, sb - 40, 8, { speed: 100, color: '#3a1a5a' }); audio.sfx('dash', { vol: 0.5, pitch: 1.3 }); },
      tick(e, ww) {
        snap.cx = e.d.x; snap.x = e.d.x - p.w / 2; snap.bottom = e.d.b; snap.y = e.d.b - p.h; snap.t = p.t; snap.animT = e.lt;
        if (e.lt > D && !e.d.cut) { e.d.cut = true; snap.anim = 'land'; if (tg) xSlash(ww, tg.cx, tyC, 56, '#b060ff', 0.3, rand(-0.4, 0.4)); audio.sfx('slash', { pitch: 1.2 }); }
      },
      draw(ctx, e, ww) {
        const a = Math.min(1, e.lt * 10) * clamp((e.life - e.lt) / 0.2, 0, 1);
        if (e.lt < D + 0.05) cutLine(ctx, sx, sb - 44, e.d.x, e.d.b - 44, 3, '#b060ff', 0.7 * a);
        drawHero(ctx, snap, ww, { alpha: 0.8 * a, tint: '#6a3aaa' });
      },
      end(e, ww) { ww.fx.burst('dark', e.d.x, e.d.b - 40, 10, { speed: 90, color: '#2a1040' }); },
      light(L, e) { L.add(e.d.x, e.d.b - 44, 90, '#b060ff', 0.6); },
    });
  }
};

function petalRender(ctx, pr) {
  const s = pr.scale, fl = 0.85 + Math.sin(pr.t * 40 + pr.ox) * 0.15;
  ctx.rotate(Math.atan2(pr.vy, pr.vx));
  ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, 0, 30 * s, '#ff5a7a', 0.45);
  const g = ctx.createRadialGradient(4 * s, 0, 0, 0, 0, 20 * s);
  g.addColorStop(0, '#fff0e0'); g.addColorStop(0.4, '#ffb070'); g.addColorStop(1, 'rgba(255,60,100,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(16 * s * fl, 0); ctx.quadraticCurveTo(0, -12 * s, -22 * s * fl, 0); ctx.quadraticCurveTo(0, 12 * s, 16 * s * fl, 0); ctx.fill();
  for (const sd of [-1, 1]) { ctx.save(); ctx.rotate(sd * 0.9); ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(-4 * s, 0, 12 * s, 4 * s, 0, 0, TAU); ctx.fill(); ctx.restore(); }
}
SKILL_IMPL.lia_kagerou = (p, w, lv) => {
  const id = 'lia_kagerou', n = N(id, lv), mv = MV(id, lv), f = p.facing, spread = Math.min(1.1, 0.16 * (n - 1));
  pose(p, w, 'cast', 0.4, { h0: 0.08, sfx: 'fire' });
  audio.sfx('fire', { pitch: 1.3 });
  w.fx.ring(p.cx, p.cy, { color: '#ff7a9a', r0: 20, r1: 90, life: 0.35, width: 3 });
  for (let i = 0; i < n; i++) {
    const da = n > 1 ? -spread / 2 + spread * i / (n - 1) : 0, ang = f > 0 ? da : Math.PI - da, sp = rand(420, 540);
    shoot(w, p, {
      x: p.cx + f * 24, y: p.bottom - 58, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 26, h: 26, scale: 1.1,
      render: petalRender, behavior: 'wave', waveAmp: rand(90, 170) * (i % 2 ? 1 : -1), waveFreq: rand(8, 11), life: 1.1, pierce: 1, collideWalls: true,
      trail: 'fire', trailRate: 0.05, trailOpts: { color: '#ff5a7a', color2: '#ffc0a0', size: 8 }, light: { r: 80, color: '#ff7a9a', i: 0.8 },
      attack: atk(p, { mv: mv * 0.4, element: 'fire', kb: [100, -100], hitstop: 0.02 }),
      onWall: (pr, ww) => pr.expire(ww),
      onExpire: (pr, ww) => boom(ww, p, pr.cx, pr.cy, 52, { mv, element: 'fire', c1: '#ff4a7a', c2: '#ffc0a0', shake: 3, sfx: 'fire' }),
    });
  }
};

function daggerRender(ctx, pr) {
  const s = pr.scale, a = (pr.orbitA ?? 0) + Math.PI / 2;
  ctx.rotate(a);
  ctx.globalCompositeOperation = ADD;
  const g = ctx.createLinearGradient(-40 * s, 0, 0, 0);
  g.addColorStop(0, 'rgba(255,216,74,0)'); g.addColorStop(1, 'rgba(255,230,140,0.6)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-18 * s, 0, 24 * s, 6 * s, 0, 0, TAU); ctx.fill();
  glow(ctx, 6 * s, 0, 16 * s, '#ffd84a', 0.5);
  ctx.globalCompositeOperation = 'source-over';
  const bg = ctx.createLinearGradient(0, -4 * s, 0, 4 * s);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, '#ffe7a0'); bg.addColorStop(1, '#b08a2a');
  ctx.fillStyle = bg; ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(18 * s, 0); ctx.lineTo(0, -4 * s); ctx.lineTo(-4 * s, 0); ctx.lineTo(0, 4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3a1420'; ctx.fillRect(-12 * s, -2 * s, 8 * s, 4 * s);
}
SKILL_IMPL.lia_blade_waltz = (p, w, lv) => {
  const id = 'lia_blade_waltz', n = N(id, lv), T = V(id, 't', lv), mv = MV(id, lv), s = SZ(lv);
  pose(p, w, 'spin_blade', 0.4, { h0: 0.03, hw: 0.3, sfx: 'slash' });
  audio.sfx('slash_heavy', { pitch: 1.4 });
  for (let i = 0; i < n; i++) {
    shoot(w, p, {
      x: p.cx, y: p.cy, w: 26, h: 26, scale: 1.2, behavior: 'orbit', orbitA: i / n * TAU, orbitR: 70 * s, orbitSpeed: 7.5 * p.facing, life: T,
      pierce: 9999, collideWalls: false, render: daggerRender, light: i === 0 ? { r: 120 * s, color: '#ffd84a', i: 0.6 } : null,
      attack: atk(p, { mv, rehit: 0.22, kb: [160, -120], hitstop: 0.02, shake: 1 }),
    });
  }
  fx(w, {
    life: T, z: 9,
    follow(e) { e.x = p.cx - 100 * s; e.y = p.cy - 100 * s; e.w = e.h = 200 * s; },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 5) * clamp((e.life - e.lt) / 0.3, 0, 1);
      ctx.globalCompositeOperation = ADD; ctx.strokeStyle = rgba('#ffd84a', 0.28 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.cx, p.cy, 70 * s, 0, TAU); ctx.stroke();
      glow(ctx, p.cx, p.cy, 80 * s, '#ffd84a', 0.12 * a);
    },
  });
};

SKILL_IMPL.lia_thousand_blades = (p, w, lv) => {
  const id = 'lia_thousand_blades', n = N(id, lv), mv = MV(id, lv), s = SZ(lv), f = p.facing, x0 = p.cx, steps = [];
  pose(p, w, 'cast_up', 0.5, { h0: 0.1, sfx: 'holy' });
  audio.sfx('slash_heavy', { pitch: 1.5 });
  const tgs = frontEnemies(w, p, 460 * s);
  for (let i = 0; i < n; i++) steps.push([0.1 + i * (0.75 / n), (ww) => {
    const tg = tgs.length && Math.random() < 0.5 ? tgs[Math.floor(Math.random() * tgs.length)] : null;
    const x = tg ? tg.cx + rand(-24, 24) : x0 + f * rand(30, 400 * s);
    const gy = groundAt(ww, x, p.bottom - 60, 10 * TILE) ?? p.bottom, sy = ww.camera.y - 60, T = Math.max(0.12, (gy - sy) / 1700);
    fx(ww, {
      life: T + 0.35, z: 11, d: { y: sy, hit: false },
      atk: atk(p, { mv, kb: [60, -160], hitstop: 0.03, shake: 1.5, dir: f }), win: [0, T / (T + 0.35)],
      follow(e) { e.d.y = lerp(sy, gy, clamp(e.lt / T, 0, 1)); e.x = x - 20; e.y = e.d.y - 90; e.w = 40; e.h = 100; },
      rect(e) { return { x: x - 12, y: e.d.y - 40, w: 24, h: 44 }; },
      tick(e, ww2) { if (!e.d.hit && e.lt >= T) { e.d.hit = true; ww2.fx.burst('spark', x, gy - 4, 6, { color: '#ffe070', angle: -Math.PI / 2, spread: 1.2, speed: 260 }); if (Math.random() < 0.4) audio.sfx('clang', { vol: 0.3, pitch: rand(1.3, 1.7) }); } },
      draw(ctx, e) {
        const y = e.d.y, a = e.lt < T ? 1 : 1 - (e.lt - T) / 0.35;
        ctx.globalCompositeOperation = ADD;
        if (e.lt < T) beamV(ctx, x, y - 120, y - 30, 4, '#ffd84a', 0.55);
        ctx.save(); ctx.translate(x, y - (e.lt >= T ? 10 : 0)); ctx.rotate(Math.PI / 2); ctx.scale(1.5 * s, 1.5 * s);
        daggerRender(ctx, { scale: 1, orbitA: -Math.PI / 2 });
        ctx.restore();
        ctx.globalAlpha = 1;
        if (e.lt >= T) { ctx.globalCompositeOperation = ADD; glow(ctx, x, gy - 6, 30, '#ffd84a', a * 0.8); }
      },
      light(L, e) { if (i % 3 === 0) L.add(x, e.d.y - 20, 80, '#ffd84a', 0.8); },
    });
  }]);
  seq(w, steps);
};

function scytheShape(ctx, L, a) {
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#1a1014'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
  ctx.strokeStyle = 'rgba(106,255,176,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(4, -2); ctx.lineTo(L, -2); ctx.stroke();
  const g = ctx.createLinearGradient(L, 0, L - L * 0.2, L * 0.9);
  g.addColorStop(0, '#e8fff4'); g.addColorStop(0.4, '#6affb0'); g.addColorStop(1, 'rgba(20,80,50,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(L, -6); ctx.quadraticCurveTo(L + L * 0.35, L * 0.25, L - L * 0.15, L * 0.95); ctx.quadraticCurveTo(L + L * 0.08, L * 0.3, L - 10, 8); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = ADD; ctx.strokeStyle = 'rgba(220,255,240,0.9)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(L, -6); ctx.quadraticCurveTo(L + L * 0.35, L * 0.25, L - L * 0.15, L * 0.95); ctx.stroke();
  ctx.globalAlpha = 1;
}
SKILL_IMPL.lia_reaper_scythe = (p, w, lv) => {
  const id = 'lia_reaper_scythe', r = V(id, 'r', lv), mv = MV(id, lv), f = p.facing, s = SZ(lv);
  pose(p, w, 'spin_blade', 0.45, { h0: 0.04, hw: 0.3, sfx: 'slash_heavy' });
  audio.sfx('ghost'); audio.sfx('dark');
  const cx = p.cx, cy = p.cy - 10;
  const rect = { x: f > 0 ? cx - 40 : cx - r, y: cy - r, w: r + 40, h: r * 1.6 };
  fx(w, {
    life: 0.6, z: 12, x: cx - r * 1.3, y: cy - r * 1.3, w: r * 2.6, h: r * 2.6, d: { done: false },
    atk: atk(p, { mv, element: 'dark', kb: [320, -380], hitstop: 0.12, shake: 9, crit: 10 }), win: [0.1, 0.45],
    rect() { return rect; },
    tick(e, ww) {
      if (Math.random() < 0.7) { const t = lerp(-2.4, 0.9, ease.outCubic(clamp(e.lt / 0.26, 0, 1))); ww.fx.emit('soul', cx + f * Math.cos(t) * r * 0.9, cy + Math.sin(t) * r * 0.9, { speed: 60 }); }
      if (!e.d.done && e.k > 0.45) {
        e.d.done = true;
        for (const en of enemiesIn(ww, rect)) {
          if (en.kind !== 'enemy' || en.dying > 0) continue;
          if (en.hp / maxHpOf(en) < 0.2) {
            hitTarget(ww, atk(p, { flat: en.hp + 1, element: 'dark', hitId: nid('exe'), hitstop: 0.1, shake: 6 }), en, en.cx, en.cy);
            ww.fx.text(en.cx, en.y - 20, '처형!', { color: '#6affb0', size: 24 });
            ww.fx.burst('soul', en.cx, en.cy, 20, { speed: 200 });
          }
        }
      }
    },
    draw(ctx, e) {
      const u = ease.outCubic(clamp(e.lt / 0.26, 0, 1)), t = lerp(-2.4, 0.9, u), a = 1 - clamp((e.k - 0.55) / 0.45, 0, 1);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(f, 1);
      ctx.globalCompositeOperation = ADD;
      ctx.lineCap = 'butt';
      for (let k = 0; k < 10; k++) {
        const t0 = lerp(-2.4, t, k / 10), t1 = lerp(-2.4, t, (k + 1) / 10) + 0.01;
        ctx.strokeStyle = rgba('#6affb0', a * (k + 1) / 10 * 0.5); ctx.lineWidth = 8 + k * 4;
        ctx.beginPath(); ctx.arc(0, 0, r * 0.82, t0, t1); ctx.stroke();
      }
      ctx.strokeStyle = rgba('#e8fff4', a * 0.9); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.95, Math.max(-2.4, t - 0.8), t); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.rotate(t - 0.3); scytheShape(ctx, r * 0.75, a);
      ctx.restore();
    },
    light(L, e) { L.add(cx + f * r * 0.4, cy, r * 1.8, '#6affb0', 1 - e.k); },
  });
};

// ═══════════════════════════ 아젤 ═══════════════════════════
SKILL_IMPL.azel_moon_slash = (p, w, lv) => {
  const id = 'azel_moon_slash', mv = MV(id, lv), s = V(id, 's', lv) / 100;
  pose(p, w, 'slash_wide', 0.34, { h0: 0.06, hw: 0.08, sfx: 'slash_heavy', mv: { slash: { r: 90, arc: 3, angle: 0, width: 24, color: '#ffb0c0' } } });
  setTimeoutFx(w, 0.06 / p.atkSpeedMul, (ww) => {
    const f = p.facing;
    shoot(ww, p, {
      x: p.cx + f * 40, y: p.bottom - 52, vx: f * 980, vy: 0, w: 60 * s, h: 128 * s, render: crescentRender, color: '#ff3a5a', color2: '#ffffff', edge: '#fff4f8',
      life: 0.55, pierce: 99, collideWalls: false, fadeOut: true, fadeIn: true, light: { r: 130 * s, color: '#ff3a5a', i: 0.9 },
      attack: atk(p, { mv, kb: [260, -160], hitstop: 0.06, shake: 3 }),
    });
    audio.sfx('slash', { pitch: 0.8 });
  });
};

function spectralSword(ctx, L, a) {
  ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, L * 0.5, L * 0.55, '#b090ff', 0.4 * a);
  const g = ctx.createLinearGradient(-5, 0, 5, 0);
  g.addColorStop(0, rgba('#8a6aff', 0.5 * a)); g.addColorStop(0.5, rgba('#ffffff', a)); g.addColorStop(1, rgba('#8a6aff', 0.5 * a));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-5, L * 0.22); ctx.lineTo(5, L * 0.22); ctx.lineTo(3, L * 0.92); ctx.lineTo(0, L); ctx.lineTo(-3, L * 0.92); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgba('#ffd870', 0.9 * a); ctx.fillRect(-14, L * 0.2, 28, 4);
  ctx.fillStyle = rgba('#c8b0ff', 0.8 * a); ctx.fillRect(-2, 0, 4, L * 0.2);
  glow(ctx, 0, 0, 6, '#ffd870', a);
}
function swordProjRender(ctx, pr) {
  ctx.rotate(Math.atan2(pr.vy, pr.vx) - Math.PI / 2);
  ctx.translate(0, -30 * pr.scale);
  ctx.scale(pr.scale, pr.scale);
  spectralSword(ctx, 60, 1);
  const g = ctx.createLinearGradient(0, -40, 0, 0);
  g.addColorStop(0, 'rgba(160,120,255,0)'); g.addColorStop(1, 'rgba(200,180,255,0.4)');
  ctx.fillStyle = g; ctx.fillRect(-4, -50, 8, 50);
}
SKILL_IMPL.azel_phantom_blades = (p, w, lv) => {
  const id = 'azel_phantom_blades', n = N(id, lv), mv = MV(id, lv), f = p.facing, form = 0.32;
  pose(p, w, 'cast', 0.45, { h0: 0.1, sfx: 'magic' });
  audio.sfx('ghost', { pitch: 1.4 });
  const slots = [];
  for (let i = 0; i < n; i++) { const t = -Math.PI / 2 - f * (n > 1 ? lerp(-1.1, 1.3, i / (n - 1)) : 0); slots.push(t); }
  fx(w, {
    life: form + n * 0.07 + 0.05, z: 11, d: { fired: 0 },
    follow(e) { e.x = p.cx - 160; e.y = p.cy - 180; e.w = 320; e.h = 260; },
    tick(e, ww) {
      while (e.d.fired < n && e.lt >= form + e.d.fired * 0.07) {
        const i = e.d.fired++, t = slots[i], sx = p.cx + Math.cos(t) * 80, sy = p.cy - 20 + Math.sin(t) * 60;
        const tg = ww.nearestEnemy(sx, sy, 700), ang = tg ? Math.atan2(tg.cy - sy, tg.cx - sx) : (f > 0 ? 0 : Math.PI);
        shoot(ww, p, {
          x: sx, y: sy, vx: Math.cos(ang) * 1150, vy: Math.sin(ang) * 1150, w: 22, h: 22, scale: 1.1, render: swordProjRender, behavior: 'homing', speed: 1150, homingTurn: 12,
          life: 0.8, pierce: 2, collideWalls: false, light: { r: 80, color: '#b090ff', i: 0.7 },
          attack: atk(p, { mv, kb: [180, -120], hitstop: 0.04, shake: 2 }),
          onExpire: (pr, w2) => w2.fx.burst('magic', pr.cx, pr.cy, 8, { color: '#c8b0ff', speed: 160 }),
        });
        audio.sfx('slash', { vol: 0.5, pitch: 1.3 + i * 0.05 });
      }
    },
    draw(ctx, e, ww) {
      for (let i = e.d.fired; i < n; i++) {
        const t = slots[i], sx = p.cx + Math.cos(t) * 80, sy = p.cy - 20 + Math.sin(t) * 60 + Math.sin(e.lt * 6 + i) * 3;
        const a = clamp((e.lt - i * 0.04) / 0.15, 0, 1);
        const tg = ww.nearestEnemy(sx, sy, 700), ang = tg ? Math.atan2(tg.cy - sy, tg.cx - sx) : (f > 0 ? 0 : Math.PI);
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang - Math.PI / 2); ctx.translate(0, -30); ctx.scale(1.1, 1.1); spectralSword(ctx, 60, a); ctx.restore();
      }
    },
    light(L) { L.add(p.cx, p.cy - 60, 160, '#b090ff', 0.6); },
  });
};

const BLOOD = { c1: '#d01a34', c2: '#3a0610', rim: 'rgba(255,140,160,0.95)', glow: '#ff2040', dust: 'blood', dustCol: '#9a0d1c', bits: 'blood', bitCol: '#c0142a', sfx: 'holywater_burn' };
SKILL_IMPL.azel_blood_lance = (p, w, lv) => {
  const id = 'azel_blood_lance', n = N(id, lv), mv = MV(id, lv), s = SZ(lv), f = p.facing, x0 = p.cx;
  pose(p, w, 'slash_up', 0.4, { h0: 0.08, sfx: 'dark' });
  audio.sfx('dark');
  for (let i = 0; i < n; i++) {
    const x = x0 + f * (70 + i * 56 * s), base = groundAt(w, x, p.bottom - 30) ?? p.bottom;
    const a = atk(p, { mv, type: 'mag', element: 'dark', kb: [120, -520], launch: true, hitstop: 0.05, shake: 3 });
    spikeFx(w, p, x, base, (78 + i * 8) * s, 16 * s, 0.08 + i * 0.07, a, { ...BLOOD, onHit: (e, ww, nh) => { p.heal(p.stats.hp * 0.015 * nh); ww.fx.burst('blood', p.cx, p.cy, 6, { speed: 60, color: '#ff2040' }); } });
  }
};

SKILL_IMPL.azel_bat_storm = (p, w, lv) => {
  const id = 'azel_bat_storm', n = N(id, lv), mv = MV(id, lv), steps = [];
  pose(p, w, 'cast', 0.45, { h0: 0.1, sfx: 'bat' });
  audio.sfx('bat'); w.fx.burst('dark', p.cx, p.cy - 10, 12, { speed: 140, color: '#4a0a1a' });
  for (let i = 0; i < n; i++) steps.push([i * 0.035, (ww) => {
    const ang = rand(0, TAU), sp = rand(300, 420);
    shoot(ww, p, {
      x: p.cx + rand(-10, 10), y: p.cy - 16, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120, w: 24, h: 18, scale: rand(0.8, 1.1),
      render: batRender, behavior: 'homing', speed: 560, homingTurn: 7, homingDelay: 0.2, life: 2.4, pierce: 2, collideWalls: false,
      attack: atk(p, { mv, type: 'mag', element: 'dark', rehit: 0.3, kb: [80, -100], hitstop: 0.03, shake: 1 }),
      onHit: () => p.heal(p.stats.hp * 0.006, false),
    });
    if (i % 4 === 0) audio.sfx('bat', { vol: 0.4, pitch: rand(0.9, 1.3) });
  }]);
  seq(w, steps);
};

function bloodMoon(ctx, x, y, R, a, t) {
  ctx.globalCompositeOperation = ADD;
  glow(ctx, x, y, R * 2.6, '#ff1a2a', 0.45 * a);
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
  g.addColorStop(0, rgba('#ff6a5a', a)); g.addColorStop(0.6, rgba('#c0102a', a)); g.addColorStop(1, rgba('#5a0010', a));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba('#5a0010', 0.35 * a);
  for (const [cx, cy, cr] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.24], [-0.05, 0.38, 0.12], [0.35, -0.35, 0.1]]) { ctx.beginPath(); ctx.arc(x + cx * R, y + cy * R, cr * R, 0, TAU); ctx.fill(); }
  ctx.globalCompositeOperation = ADD; ctx.strokeStyle = rgba('#ffb0b0', 0.5 * a); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, R, -2.4 + Math.sin(t) * 0.1, -0.6); ctx.stroke();
}
SKILL_IMPL.azel_crimson_feast = (p, w, lv) => {
  const id = 'azel_crimson_feast', r = V(id, 'r', lv), T = V(id, 't', lv), mv = MV(id, lv);
  pose(p, w, 'cast_up', 0.5, { h0: 0.12, sfx: 'dark' });
  audio.sfx('bell', { pitch: 0.5 }); audio.sfx('dark');
  w.game.flash('#ff1030', 0.25, 3);
  fx(w, {
    life: T, z: 9,
    atk: atk(p, { mv, type: 'mag', element: 'dark', rehit: 0.25, kb: [30, -60], hitstop: 0.02, shake: 1, stun: 0.3 }), win: [0.05, 1],
    follow(e) { e.x = p.cx - r * 1.1; e.y = p.y - 200; e.w = r * 2.2; e.h = p.h + 220; },
    rect() { return { x: p.cx - r, y: p.bottom - r * 0.9, w: r * 2, h: r * 0.95 }; },
    onHit(e, ww, n) { p.heal(p.stats.hp * 0.008 * n, false); },
    tick(e, ww) {
      if (Math.random() < 0.5) {
        const en = enemiesIn(ww, { x: p.cx - r, y: p.bottom - r, w: r * 2, h: r })[0];
        if (en) { const dx = p.cx - en.cx, dy = p.cy - en.cy, L = Math.hypot(dx, dy) || 1; ww.fx.emit('magic', en.cx, en.cy, { color: '#ff2040', speed: 0, vx: dx / L * 420, vy: dy / L * 420, grav: 0, life: L / 420 }); }
      }
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 4) * clamp((e.life - e.lt) / 0.4, 0, 1), rise = ease.outCubic(clamp(e.lt / 0.5, 0, 1));
      runeCircle(ctx, p.cx, p.bottom - 1, r, '#ff2040', -e.lt * 1.2, a, 0.24, 5);
      ctx.globalCompositeOperation = ADD;
      const g = ctx.createRadialGradient(p.cx, p.bottom, 10, p.cx, p.bottom, r);
      g.addColorStop(0, rgba('#ff1a2a', 0.02 * a)); g.addColorStop(1, rgba('#ff1a2a', 0.22 * a));
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.cx, p.bottom, r, r * 0.8, 0, Math.PI, TAU); ctx.fill();
      bloodMoon(ctx, p.cx, p.y - 60 - rise * 60, 36 + lv * 3, a, e.lt);
    },
    light(L) { L.add(p.cx, p.y - 100, r * 1.6, '#ff2040', 1); },
  });
};

SKILL_IMPL.azel_dawn_rush = (p, w, lv) => {
  const id = 'azel_dawn_rush', D = V(id, 'r', lv), mv = MV(id, lv), f = p.facing, dur = 0.18, sp = D / dur, x0 = p.cx, y = p.cy;
  pose(p, w, 'thrust', 0.32, { h0: 0.03, hw: 0.2, sfx: 'dash' });
  audio.sfx('holy', { pitch: 1.3 });
  fx(w, {
    life: dur, z: 12, d: { g: 0 },
    tick(e, ww) {
      p.vx = f * sp; if (!p.onGround) p.vy = 0; holdInvuln(p);
      if ((e.d.g++ & 1) === 0) afterimage(ww, p, '#ffe070', 0.3);
      ww.fx.emit('holy', p.cx - f * 10, p.cy + rand(-24, 24), { speed: 60 });
    },
    end(e, ww) {
      p.iframes = 0; p.vx = f * 160;
      const x1 = p.cx, cnt = 5;
      for (let i = 0; i < cnt; i++) {
        const x = lerp(x0, x1, (i + 0.5) / cnt);
        setTimeoutFx(ww, 0.05 + i * 0.05, (w2) => {
          w2.fx.slash(x, y + rand(-10, 10), rand(-1.2, 1.2) + (f > 0 ? 0 : Math.PI), { radius: 70, arc: 2.4, width: 20, color: '#ffe070', life: 0.18 });
          w2.fx.flash(x, y, { color: '#fff2b0', size: 70, life: 0.1 });
          playerStrike(w2, { x: x - 45, y: y - 55, w: 90, h: 110 }, atk(p, { mv, element: 'holy', kb: [200, -200], hitstop: 0.05, shake: 3 }));
          audio.sfx('slash', { vol: 0.6, pitch: 1.2 + i * 0.06 });
        });
      }
      fx(ww, { life: 0.4, z: 11, x: Math.min(x0, x1) - 20, y: y - 20, w: Math.abs(x1 - x0) + 40, h: 40, draw(ctx, e2) { cutLine(ctx, x0, y, x1, y, 6 * (1 - e2.k), '#ffe070', 1 - e2.k); } });
    },
    light(L) { L.add(p.cx, p.cy, 160, '#ffe070', 1); },
  });
};

SKILL_IMPL.azel_dawnbreaker = (p, w, lv) => {
  const id = 'azel_dawnbreaker', mv = MV(id, lv), s = V(id, 's', lv) / 100;
  pose(p, w, 'slash_wide', 0.5, { h0: 0.12, hw: 0.08, sfx: 'slash_heavy', mv: { slash: { r: 130, arc: 3.2, angle: 0, width: 36, color: '#ffe070' } } });
  audio.sfx('holy', { pitch: 0.8 });
  setTimeoutFx(w, 0.12 / p.atkSpeedMul, (ww) => {
    const f = p.facing;
    ww.game.flash('#fff2b0', 0.35, 4); shake(ww, 10, 0.3); ww.camera.punchZoom(1.06, 0.15);
    audio.sfx('slash_heavy', { pitch: 0.7 }); audio.sfx('explode', { vol: 0.5, pitch: 1.4 });
    shoot(ww, p, {
      x: p.cx + f * 50, y: p.bottom - 60, vx: f * 1150, vy: 0, w: 120 * s, h: 300 * s, render: dawnRender, color: '#ffc040', edge: '#ffffff',
      life: 0.75, pierce: 999, collideWalls: false, fadeOut: true, fadeIn: true, light: { r: 260 * s, color: '#ffd070', i: 1.2 },
      attack: atk(p, { mv, element: 'holy', kb: [380, -300], hitstop: 0.1, shake: 6 }),
    });
  });
};
function dawnRender(ctx, pr) {
  const d = Math.sign(pr.vx) || 1, R = pr.h * 0.5;
  ctx.scale(d, 1);
  ctx.globalCompositeOperation = ADD;
  for (let i = 0; i < 9; i++) {
    const t = -1.2 + i * 0.3, L = R * (1.3 + (i % 2) * 0.35);
    ctx.strokeStyle = rgba('#fff2b0', 0.18); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(Math.cos(t) * R * 0.6, Math.sin(t) * R * 0.6); ctx.lineTo(Math.cos(t) * L, Math.sin(t) * L); ctx.stroke();
  }
  crescent(ctx, R, R * 0.45, pr.color, 1, '#ffffff');
  glow(ctx, R * 0.4, 0, R * 0.5, '#ffffff', 0.5);
}

SKILL_IMPL.azel_fallen_wings = (p, w, lv) => {
  const id = 'azel_fallen_wings', n = N(id, lv), mv = MV(id, lv), f = p.facing, s = SZ(lv);
  pose(p, w, 'cast_up', 0.5, { h0: 0.12, sfx: 'holy' });
  audio.sfx('holy'); audio.sfx('dark', { vol: 0.6 });
  fx(w, {
    life: 1.0, z: 9, d: { fired: false },
    follow(e) { e.x = p.cx - 170 * s; e.y = p.y - 120; e.w = 340 * s; e.h = 240; },
    tick(e, ww) {
      if (!e.d.fired && e.lt > 0.18) {
        e.d.fired = true;
        for (let i = 0; i < n; i++) {
          const holy = i % 2 === 0, ang = -Math.PI / 2 + f * lerp(-0.6, 1.5, n > 1 ? i / (n - 1) : 0.5) + rand(-0.05, 0.05), sp = rand(650, 850);
          shoot(ww, p, {
            x: p.cx - f * 8, y: p.bottom - 64, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, w: 18, h: 18, scale: 1.1,
            render: holy ? featherRenderL : featherRenderD, behavior: 'homing', speed: sp, homingTurn: 5, homingDelay: 0.22, life: 1.2, pierce: 1, collideWalls: false,
            attack: atk(p, { mv, type: 'mag', element: holy ? 'holy' : 'dark', kb: [100, -100], hitstop: 0.03, shake: 1 }),
            onExpire: (pr, w2) => w2.fx.burst(holy ? 'holy' : 'dark', pr.cx, pr.cy, 5, { speed: 120 }),
          });
        }
        audio.sfx('bat', { pitch: 1.6, vol: 0.6 });
      }
    },
    draw(ctx, e) {
      const open = ease.outBack(clamp(e.lt / 0.25, 0, 1)), a = clamp((e.life - e.lt) / 0.3, 0, 1), sx = p.cx - f * 6, sy = p.bottom - 64;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(-f, 1); ctx.rotate(-0.1); wing(ctx, 110 * s, open, '#ffffff', '#fff2b0', 0.85 * a); ctx.restore();
      ctx.save(); ctx.translate(sx + f * 4, sy - 4); ctx.scale(-f, 1); ctx.rotate(0.35); wing(ctx, 96 * s, open, '#5a2a8a', '#140818', 0.9 * a, true); ctx.restore();
    },
    light(L) { L.add(p.cx - f * 30, p.bottom - 90, 200, '#d0b0ff', 0.8); },
  });
};
function featherRenderL(ctx, pr) { ctx.rotate(Math.atan2(pr.vy, pr.vx)); featherShape(ctx, 16 * pr.scale, '#fff2b0', '#fff8e0'); }
function featherRenderD(ctx, pr) { ctx.rotate(Math.atan2(pr.vy, pr.vx)); featherShape(ctx, 16 * pr.scale, '#b060ff', '#3a1a5a'); }

// ═══════════════════════════ 필살기 ═══════════════════════════
// feel §5.2·§5.3 (FX-ULTS). ULTS[charId](p, w, v) — v = ultCtx(p, w).
// 층 나눔: ULTFX(render/ultfx.js, FX-ULTKIT) = 화면 레이어(줌인·레터박스·집중선·색보정·충격파 고리·임팩트 프레임·2차 전직 문양),
//          이 파일 = 영웅별 월드 연출(암전·빛기둥·카드·균열·참격·핏빛 달 …).
// 키트가 아직 스텁이면(ULT_TIERS 가 빔) 최소 대체(줌·기술명·고리)만 그린다. 키트 호출은 전부 try/catch.
// 순서: castUltimate → (컷인 장면이 월드를 멈춤) → 연출 감독 첫 틱에 ULTFX.begin → 시간표 → ultFinal 에서 ULTFX.final → 끝에 ULTFX.end.
// 피해(MV)·타격 수는 전직 단계와 무관하다 (data/awaken.js ultMv 가 이 값들을 기준으로 한다).

/** 키트(ULTFX)가 실제로 들어왔는가 (스텁은 ULT_TIERS = {}) */
function kitLive() { try { const T = UFX.ULT_TIERS; return !!T && Object.keys(T).length > 0; } catch { return false; } }
function kitCall(name, ...a) {
  try { return UFX.ULTFX?.[name]?.(...a); } catch (e) { console.error(`[ultfx] ${name}`, e); return undefined; }
}
const lumOf = (hex) => { try { const [r, g, b] = hexToRgb(hex); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; } catch { return 1; } };
const TIER_ZOOM = [1.12, 1.16, 1.2];
const TIER_NAME = [22, 28, 34];

/**
 * 필살기 연출 문맥 (feel §5.2): 전직 단계, 필살기 색, 직업 강조색 (look.aura.color → look.secondary → ult.color).
 * 거의 검은 강조색(victor_deadeye #1a1a20 등)은 가산 합성에서 보이지 않으므로 필살기 색으로 바꾼다.
 */
function ultCtx(p, w) {
  const charId = p?.hero?.charId, classId = p?.hero?.classId, C = CLASSES[classId], ch = CHARACTERS[charId];
  const color = ch?.ult?.color ?? '#fff2b0';
  let accent = C?.look?.aura?.color ?? C?.look?.secondary ?? color;
  if (typeof accent !== 'string' || accent[0] !== '#' || lumOf(accent) < 0.22) accent = color;
  const q = clamp(Number(w?.fx?.quality) || 1, 0.3, 1);
  return { charId, classId, tier: clamp(C?.tier ?? 0, 0, 2), color, accent, q, low: q < 0.7, name: ch?.ult?.name ?? '', title: C?.name ?? '' };
}
/** 품질 배율을 곱한 개수 (최소 lo) */
const qn = (v, n, lo = 1) => Math.max(lo, Math.round(n * (v?.q ?? 1)));

/** 필살기 판정·배치용 화면 사각형: 연출 줌(펄스·펀치·구도)과 무관한 기본 줌 기준 (줌인 중에도 화면 끝 적까지 맞는다) */
function ultView(w, pad = 0) {
  const c = w.camera, z = c.baseZoom || 1, W = c.w / z, H = c.h / z;
  let x = c.x + c.vw / 2 - W / 2, y = c.y + c.vh / 2 - H / 2;
  const b = c.bounds;
  if (b) {
    x = b.w <= W ? b.x + (b.w - W) / 2 : clamp(x, b.x, b.x + b.w - W);
    y = b.h <= H ? b.y + b.h - H : clamp(y, b.y, b.y + b.h - H);
  }
  return { x: x - pad, y: y - pad, w: W + pad * 2, h: H + pad * 2 };
}
/** 화면 전체를 덮는 연출 엔티티의 컬링 사각형 (카메라를 따라감) */
function viewBound(e, w, pad = 80) { const c = w.camera; e.x = c.x - pad; e.y = c.y - pad; e.w = c.vw + pad * 2; e.h = c.vh + pad * 2; }

/** 연출 도중 캔버스를 만들지 않도록 이 영웅의 필살기 색 스프라이트를 미리 굽는다 (컷인이 월드를 멈춘 사이) */
const ULT_COLS = {
  kael: ['#fff2b0', '#ffd870', '#ffffff', '#fff8e0'], sera: ['#fff2b0', '#ffe7a0', '#ffffff', '#fff4c8'],
  victor: ['#ffd070', '#ffe0a0', '#fff0b0'], bran: ['#ffb060', '#ff9a3a', '#ff7a2a', '#ffd8a0'],
  lia: ['#ff2040', '#ff2a4a', '#30e0ff'], azel: ['#ff1a2a', '#ff2040', '#ff1030', '#ff6070'],
};
function prewarmUlt(v) {
  try {
    for (const c of [...(ULT_COLS[v.charId] ?? []), v.color, v.accent]) { glowSprite(c); beamSprite(c, '#ffffff', false); beamSprite(c, '#ffffff', true); }
    if (v.charId === 'sera') glassSprite();
    HFX.star?.(v.color); HFX.star?.(v.accent);
  } catch (e) { console.warn('[skills] prewarm', e); }
}

/** 키트가 없을 때의 최소 시작 연출: 전직 단계별 줌인 + 기술명 (feel §5.2 표의 cast zoom · skill name) */
function beginLocal(w, p, v) {
  w.camera.zoomPulse(TIER_ZOOM[v.tier], 0.2, 0.2, 0.35);
  const V = ultView(w), tx = clamp(p.cx, V.x + 150, V.x + V.w - 150);
  if (v.name) w.fx.text(tx, p.y - 34, v.tier >= 2 && v.title ? `${v.title} · ${v.name}` : v.name, { color: v.color, size: TIER_NAME[v.tier], life: 1.3, vy: -40, outline: '#1a0610' });
}
/** 박자: 키트의 충격파(고리·지면 타원·불꽃·반동). 키트가 없으면 고리 하나와 작은 반동 */
function ultBeat(w, v, x, y, power = 0.5, ground = false, col = v.color) {
  kitCall('beat', w, x, y, { power, color: col, accent: v.accent, ground, tier: v.tier });
  if (kitLive()) return;
  w.fx.ring(x, y, { color: col, r0: 10, r1: 60 + 120 * power, life: 0.3, width: 3 + 5 * power });
  if (ground) w.fx.ering(x, y, { color: col, r0: 12, r1: 90 + 150 * power, ry: 0.22, life: 0.35, width: 4 });
  w.camera.kick?.(0, 2 + 4 * power);
}
/** 키트가 없을 때의 마무리 고리 (전직 단계마다 한 겹 더) */
function finalLocal(w, v, x, y, col) {
  w.fx.ring(x, y, { color: col, r0: 20, r1: 280, life: 0.45, width: 14 });
  if (v.tier >= 1) w.fx.ring(x, y, { color: v.accent, r0: 30, r1: 400, life: 0.55, width: 8 });
  if (v.tier >= 2) w.fx.ring(x, y, { color: '#ffffff', r0: 40, r1: 520, life: 0.65, width: 5 });
  const st = HFX.star?.(col);
  if (st) w.fx.sprite(st, x, y, { size: 260 + 60 * v.tier, life: 0.28, s0: 0.2, s1: 1.4 });
}

/** 잔상: 1차 전직 이상이고 키트가 있으면 키트의 캐시 잔상, 아니면 품질별 간격으로 제한한 영웅 잔상 */
let _afterT = -9;
function ultAfter(w, p, v, tint, life = 0.2) {
  const gap = v.q >= 0.95 ? 0.045 : v.q >= 0.7 ? 0.07 : 0.11;
  const now = w.time ?? 0;
  if (now - _afterT < gap && now >= _afterT) return;
  _afterT = now;
  if (kitLive() && v.tier >= 1) { kitCall('afterimage', w, p, tint); return; }
  const s = p.snapshot();
  w.fx.ghost((ctx, a) => drawHero(ctx, s, w, { alpha: a * 0.65, tint }), life, 'front');
}

/** 화면 위에서 떨어지는 불씨 비 (dur 초, 초당 rate × 품질) */
function emberRain(w, v, dur, col, rate = 60, col2 = '#ffffff') {
  return fx(w, {
    life: dur, z: 12, d: { acc: 0 }, follow: (e, ww) => viewBound(e, ww, 40),
    tick(e, ww, dt) {
      e.d.acc += dt * rate * v.q * (0.35 + 0.65 * (1 - e.k));
      const V = ultView(ww);
      while (e.d.acc >= 1) {
        e.d.acc--;
        ww.fx.emit('ember', V.x + rand(0, V.w), V.y - 8, { angle: Math.PI / 2, spread: 0.35, speed: rand(60, 170), grav: rand(90, 220), drag: 0.99, life: rand(0.9, 1.6), color: Math.random() < 0.3 ? col2 : col, size: rand(1.5, 3.2) });
      }
    },
  });
}
/** 화면 색조 한 겹 (a → 0 으로 life 초에 걸쳐). world.overlays (실제 시간으로 흐른다) */
function grade(w, col, a, life, comp = 'source-over') {
  return w.addOverlay?.({
    life,
    draw(ctx, vw, vh) { const k = 1 - clamp(this.t / life, 0, 1); if (k <= 0) return; ctx.globalCompositeOperation = comp; ctx.globalAlpha = a * k; ctx.fillStyle = col; ctx.fillRect(0, 0, vw, vh); },
  }) ?? null;
}
/** 감독 엔티티가 살아 있는 동안 유지되는 화면 레이어 (draw(ctx, vw, vh) 안에서 this.e 로 감독을 읽는다) */
function holdOverlay(w, e, draw) {
  return w.addOverlay?.({ e, update() { if (e.dead) this.dead = true; }, draw(ctx, vw, vh, ww) { if (e.dead) { this.dead = true; return; } draw.call(this, ctx, vw, vh, ww); } }) ?? null;
}
/** 모여드는 나선 빛 알갱이 (u 0→1: 바깥 R0 에서 중심으로 소용돌이치며 빨려 든다) */
function spiralMotes(ctx, x, y, u, n, R0, col, rot) {
  const img = glowSprite(col);
  if (!img) return;
  ctx.globalCompositeOperation = ADD;
  for (let i = 0; i < n; i++) {
    const ph = i / n, uu = clamp(u * 1.5 - ph * 0.5, 0, 1);
    if (uu <= 0 || uu >= 1) continue;
    const r = R0 * (1 - ease.inCubic(uu)) * (0.8 + 0.4 * ((i * 7) % 5) / 5), th = rot + ph * TAU + uu * 4.2;
    const s = 7 + 9 * (1 - uu);
    blit(ctx, img, x + Math.cos(th) * r - s, y + Math.sin(th) * r * 0.8 - s, s * 2, s * 2, 0.5 + 0.5 * Math.sin(uu * Math.PI));
  }
}
/** 스테인드글라스 장미창 (세라 천상의 마법진; 한 번 굽는다) */
function glassSprite() {
  return spr('glass', 256, 256, (x, S) => {
    const R = S / 2, cols = ['#ff3a4a', '#3a7aff', '#ffd040', '#3adf7a', '#b060ff', '#ff8a3a'];
    x.translate(R, R);
    const seg = (r0, r1, a0, a1, col) => {
      x.fillStyle = rgba(col, 0.6);
      x.beginPath(); x.arc(0, 0, r1, a0, a1); x.arc(0, 0, r0, a1, a0, true); x.closePath(); x.fill();
    };
    for (let i = 0; i < 16; i++) seg(R * 0.62, R * 0.96, (i + 0.06) / 16 * TAU, (i + 0.94) / 16 * TAU, cols[i % cols.length]);
    for (let i = 0; i < 8; i++) seg(R * 0.3, R * 0.58, (i + 0.08) / 8 * TAU + 0.2, (i + 0.92) / 8 * TAU + 0.2, cols[(i * 2 + 1) % cols.length]);
    x.fillStyle = rgba('#ffe7a0', 0.85); x.beginPath(); x.arc(0, 0, R * 0.26, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(255,240,190,0.9)'; x.lineWidth = 3;
    for (const r of [0.28, 0.6, 0.98]) { x.beginPath(); x.arc(0, 0, R * r, 0, TAU); x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 8; i++) { const t = i / 8 * TAU; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(t - 0.05) * R * 0.25, Math.sin(t - 0.05) * R * 0.25); x.lineTo(Math.cos(t) * R * 0.34, Math.sin(t) * R * 0.34); x.lineTo(Math.cos(t + 0.05) * R * 0.25, Math.sin(t + 0.05) * R * 0.25); x.fill(); }
  });
}
function glassRose(ctx, x, y, R, rot, a, sy = 0.22) {
  const img = glassSprite();
  if (!img || a <= 0.01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, sy); ctx.rotate(rot); ctx.globalCompositeOperation = ADD;
  blit(ctx, img, -R, -R, R * 2, R * 2, a);
  ctx.restore();
}

/** 필살기 공통 감독: 화면 잠금(입력 차단·무적) + 배경 암전 + 시간표 + 키트 begin/end */
function ultDirector(w, p, o) {
  const cam = w.camera, v = o.v ?? ultCtx(p, w), steps = (o.steps || []).sort((a, b) => a[0] - b[0]);
  const bound = (e) => { e.x = cam.x - 80; e.y = cam.y - 80; e.w = cam.vw + 160; e.h = cam.vh + 160; };
  fx(w, {
    life: o.dur, z: -1, follow: bound,
    draw(ctx, e, ww) {
      const a = (o.dim ?? 0.55) * Math.min(1, e.lt / 0.2) * clamp((e.life - e.lt) / 0.35, 0, 1);
      ctx.fillStyle = rgba(o.dimCol ?? '#05020a', a); ctx.fillRect(e.x, e.y, e.w, e.h);
      o.bg?.(ctx, e, ww, a / (o.dim ?? 0.55));
    },
  });
  return fx(w, {
    life: o.dur, z: 12, d: { i: 0, ...(o.d || {}) }, follow: bound,
    start(e, ww) {
      ww.cutscene = true; p.vx = 0;
      e.d.kit = kitLive();
      kitCall('begin', ww, p, { color: v.color, accent: v.accent, tier: v.tier, classId: v.classId, charId: v.charId, dimCol: o.dimCol ?? '#05020a', kind: 'ult' });
      if (!e.d.kit) beginLocal(ww, p, v);
      o.start?.(e, ww);
    },
    tick(e, ww, dt) {
      ww.cutscene = true;
      while (e.d.i < steps.length && steps[e.d.i][0] <= e.lt) steps[e.d.i++][1](ww, e);
      o.tick?.(e, ww, dt);
      ww.run.sp = 0; // 필살기 타격으로는 게이지가 다시 차지 않는다
    },
    end(e, ww) { ww.cutscene = false; ww.run.sp = 0; p.hidden = false; kitCall('end', ww, p, {}); o.end?.(e, ww); },
    draw: o.draw, light: o.light,
  });
}
/** 필살기 타격 (기본: 기본 줌 기준 화면 전체). 연타는 hitstop: 0 을 명시해 멈추지 않게 한다 (U 등급) */
function uHit(w, p, mv, o = {}) {
  const { rect, ...rest } = o;
  return playerStrike(w, rect ?? ultView(w, 30), atk(p, { mv, type: bestType(p), tags: ['ult'], breakWalls: false, hitId: nid('ult'), kb: [60, -200], hitstop: 0.04, shake: 4, ...rest }));
}
/**
 * 마무리 일격: final: true → 강도 등급 S (impact.js). 번쩍임은 정책 값 0.6 (설정·상한·1초 제한이 적용된다).
 * at = { v, x, y, ground } — 키트의 마무리(임팩트 프레임·삼중 고리·기울기·균열·불씨·직업 문양) 위치
 */
function ultFinal(w, p, mv, col, o = {}, at = null) {
  const v = at?.v ?? ultCtx(p, w), x = at?.x ?? p.cx, y = at?.y ?? p.cy;
  const targets = enemiesIn(w, ultView(w, 30));
  uHit(w, p, mv, { hitstop: 0.3, shake: 18, kb: [420, -620], launch: true, final: true, ...o });
  w.game.flash(col, 0.6, 3);
  shake(w, 18, 0.6); w.camera.punchZoom(1.14, 0.3);
  audio.sfx('explode'); audio.sfx('crit', { pitch: 0.7 });
  kitCall('final', w, x, y, { color: col, accent: v.accent, tier: v.tier, classId: v.classId, charId: v.charId, ground: !!at?.ground, targets });
  if (!kitLive()) finalLocal(w, v, x, y, col);
}

// 카엘 — 그랜드 크로스: 나선으로 모이는 성광 → 화면을 가르는 십자와 성스러운 문양 → 여섯 성광 기둥 → 대폭발과 황금 불씨 비
ULTS.kael = (p, w, v = ultCtx(p, w)) => {
  const V0 = ultView(w), GOLD = '#fff2b0';
  const cx = clamp(p.cx, V0.x + 220, V0.x + V0.w - 220), cy = clamp(p.cy - 40, V0.y + 150, V0.y + V0.h - 130);
  pose(p, w, 'cast_up', 1.6, { h0: 0.2, hw: 1.2, sfx: 'holy' });
  const order = [2, 3, 1, 4, 0, 5], steps = [
    [0, () => { audio.sfx('bell'); audio.sfx('choir_gate', { vol: 0.7 }); }],
    [0.3, (ww) => {
      audio.sfx('holy', { pitch: 0.7 }); ww.game.flash('#fff8e0', 0.4, 4); shake(ww, 6, 0.3);
      ww.camera.zoomPulse(0.94, 0.25, 0.7, 0.45);   // 십자가 퍼지며 화면 전체를 담는다
      ultBeat(ww, v, cx, cy, 0.7, false, GOLD);
      ww.fx.ring(cx, cy, { color: v.accent, r0: 20, r1: 260, life: 0.4, width: 10 });
    }],
  ];
  order.forEach((k, i) => steps.push([0.45 + i * 0.1, (ww) => {
    const x = V0.x + V0.w * (k + 0.5) / 6, base = groundAt(ww, x, V0.y + V0.h * 0.5, 14 * TILE) ?? V0.y + V0.h - 40;
    pillarFx(ww, p, x, base, 46, 0.55, 0, 0.75, GOLD, { tags: ['ult'], breakWalls: false, type: bestType(p), hitstop: 0.03 + i * 0.008 });
    setTimeoutFx(ww, 0.17, (w2) => {   // 기둥이 솟는 순간
      ultBeat(w2, v, x, base, 0.45, true, GOLD);
      const st = HFX.star?.(GOLD);
      if (st) w2.fx.sprite(st, x, base - 10, { size: 170, life: 0.22, s0: 0.3, s1: 1.2 });
      for (let j = 0; j < qn(v, 5); j++) w2.fx.speedLine(x + rand(-34, 34), base - rand(0, 80), -Math.PI / 2, { len: rand(70, 140), width: 3, color: GOLD, life: 0.3, speed: rand(700, 1200) });
    });
  }]));
  steps.push([1.25, (ww) => {
    ultFinal(ww, p, 5, '#fff8e0', { element: 'holy' }, { v, x: cx, y: cy });
    ww.fx.burst('holy', cx, cy, 60, { speed: 520 });
    ww.fx.ring(cx, cy, { color: GOLD, r0: 30, r1: V0.w * 0.6, life: 0.6, width: 16 });
    ww.fx.ring(cx, cy, { color: v.accent, r0: 60, r1: V0.w * 0.8, life: 0.8, width: 6 });
    emberRain(ww, v, 1.2, '#ffd870', 70, '#fff8e0');   // 황금 불씨 비 1.2초
  }]);
  ultDirector(w, p, {
    v, dur: 2.0, dim: 0.62, steps,
    tick(e, ww) {
      if (v.tier >= 1 && e.lt < 1.2) ultAfter(ww, p, v, GOLD);   // 채찍 잔상 (1차 전직 이상)
      if (e.lt > 0.35 && e.lt < 1.3 && Math.random() < 0.7 * v.q) {   // 십자 팔을 타고 흐르는 성광 입자
        const t = rand(-1, 1), horiz = Math.random() < 0.55;
        ww.fx.emit('holy', horiz ? cx + t * V0.w * 0.5 : cx + rand(-12, 12), horiz ? cy + rand(-12, 12) : cy + t * V0.h * 0.5, { speed: 70, grav: -40, life: 0.6 });
      }
    },
    draw(ctx, e) {
      const lt = e.lt;
      ctx.globalCompositeOperation = ADD;
      if (lt < 0.42) {   // 모여드는 나선 + 발밑 마법진
        const u = clamp(lt / 0.35, 0, 1);
        spiralMotes(ctx, p.cx, p.cy - 10, u, qn(v, 26, 10), 280, GOLD, lt * 2.4);
        glow(ctx, p.cx, p.cy - 10, 60 + lt * 300, GOLD, u * 0.6);
        runeCircle(ctx, p.cx, p.bottom - 2, 60 + 90 * ease.outCubic(u), GOLD, lt * 3, u * (1 - clamp((lt - 0.3) / 0.12, 0, 1)), 0.25, 6);
        if (lt < 0.3) return;
      }
      ctx.globalCompositeOperation = ADD;
      const g = ease.outCubic(clamp((lt - 0.3) / 0.22, 0, 1)), fin = lt > 1.25 ? clamp((lt - 1.25) / 0.12, 0, 1) : 0;
      const fade = clamp((e.life - lt) / 0.5, 0, 1), th = (34 + Math.sin(lt * 30) * 4) * (1 + fin * 2) * fade;
      const H = V0.h * 1.1, W = V0.w * 1.1;
      // 십자 중심 뒤의 세운 성문양 (두 겹이 반대로 돈다)
      runeCircle(ctx, cx, cy, 200 * g * (1 + fin * 0.5), GOLD, lt * 0.9, 0.85 * fade, 1, 8);
      runeCircle(ctx, cx, cy, 125 * g * (1 + fin * 0.3), '#ffffff', -lt * 1.6, 0.7 * fade, 1, 6);
      beamV(ctx, cx, cy - H * g, cy + H * g, th * 1.6, '#ffd870', 0.55 * fade);
      beamV(ctx, cx, cy - H * g, cy + H * g, th * 0.55, '#ffffff', fade, '#ffffff');
      beamH(ctx, cx - W * g, cx + W * g, cy, th * 1.6, '#ffd870', 0.55 * fade);
      beamH(ctx, cx - W * g, cx + W * g, cy, th * 0.55, '#ffffff', fade, '#ffffff');
      glow(ctx, cx, cy, 170 * (1 + fin), GOLD, 0.8 * fade);
      flare(ctx, cx, cy, 160 * g * (1 + fin * 0.8), GOLD, fade, Math.PI / 4 + lt * 0.3);
      if (v.tier >= 1) flare(ctx, cx, cy, 100 * g * (1 + fin), v.accent, 0.75 * fade, -lt * 0.5);
    },
    light(L, e) { L.add(cx, cy, 700, GOLD, e.lt > 0.3 ? 1.5 : 0.6); L.add(p.cx, p.cy, 200, GOLD, 1); },
  });
};

// 세라 — 천상의 심판: 떠오른 세라 위로 스테인드글라스 마법진, 쏟아지는 빛의 비와 깃털, 내려꽂히는 심판의 검과 빛기둥
ULTS.sera = (p, w, v = ultCtx(p, w)) => {
  const V0 = ultView(w), cx = V0.x + V0.w / 2, cy = V0.y + 70;
  const gy0 = groundAt(w, cx, V0.y + V0.h * 0.4, 16 * TILE) ?? V0.y + V0.h - 30;
  pose(p, w, 'cast_up', 1.9, { h0: 0.2, hw: 1.5, sfx: 'holy' });
  const steps = [[0, () => { audio.sfx('bell'); audio.sfx('holy', { pitch: 0.6 }); audio.sfx('choir_gate', { vol: 0.55, pitch: 1.1 }); }]];
  for (let i = 0; i < 7; i++) steps.push([0.4 + i * 0.15, (ww) => { uHit(ww, p, 0.5, { element: 'holy', hitstop: 0.03, kb: [20, -120] }); if (i % 2 === 0) audio.sfx('holy', { vol: 0.5, pitch: 1.2 + i * 0.05 }); }]);
  steps.push([1.3, () => { audio.sfx('slash_heavy', { pitch: 0.5 }); audio.sfx('bell', { pitch: 1.4, vol: 0.6 }); }]);   // 심판의 검이 내려온다
  steps.push([1.55, (ww) => {
    ultFinal(ww, p, 5, '#ffffff', { element: 'holy' }, { v, x: cx, y: gy0 - 60, ground: true });
    grade(ww, '#fff4c8', v.low ? 0.16 : 0.28, 0.7);   // 흰 금빛 색조
    ww.fx.ering(cx, gy0 - 2, { color: '#fff2b0', r0: 20, r1: V0.w * 0.45, ry: 0.18, life: 0.5, width: 10 });
    ww.fx.burst('holy', cx, gy0 - 20, 40, { speed: 600 });
    ww.fx.burst('shard', cx, gy0 - 6, 14, { angle: -Math.PI / 2, spread: 1.2, speed: 420, color: '#d8d0c0' });
  }]);
  ultDirector(w, p, {
    v, dur: 2.2, dim: 0.5, dimCol: '#0a0818', steps, d: { rain: [], rt: 0, nb: 0, fe: 0, y0: null },
    start(e) { e.d.y0 = p.y; },
    tick(e, ww, dt) {
      // 30px 떠오른다 (천장이 있으면 그만큼만), 끝날 무렵 내려온다
      if (e.d.y0 != null) {
        const lift = 30 * ease.outCubic(clamp(e.lt / 0.45, 0, 1)) * (1 - clamp((e.lt - 1.85) / 0.3, 0, 1));
        const ny = e.d.y0 - lift;
        if (!solidAt(ww, p.x + 4, ny + 2) && !solidAt(ww, p.x + p.w - 4, ny + 2)) { p.y = ny; p.vy = 0; }
        if (e.lt < 1.9 && Math.random() < 0.5 * v.q) ww.fx.emit('holy', p.cx + rand(-16, 16), p.bottom + rand(-4, 6), { angle: Math.PI / 2, spread: 0.6, speed: 60, life: 0.4 });
      }
      const R = e.d.rain;
      for (let i = R.length - 1; i >= 0; i--) { R[i].t += dt; if (R[i].t > 0.28) { R[i] = R[R.length - 1]; R.pop(); } }
      if (e.lt > 0.3 && e.lt < 1.5) {
        e.d.rt += dt * 70;
        while (e.d.rt >= 1) {
          e.d.rt--;
          const x = V0.x + rand(0, V0.w), gy = groundAt(ww, x, V0.y + V0.h * 0.3, 16 * TILE) ?? V0.y + V0.h;
          R.push({ x, gy, t: 0, wd: rand(7, 18) });
          if (Math.random() < 0.25) ww.fx.burst('holy', x, gy - 4, 3, { angle: -Math.PI / 2, spread: 1, speed: 180 });
          if (++e.d.nb % 5 === 0) ww.fx.ering(x, gy - 2, { color: '#fff2b0', r0: 6, r1: 72, ry: 0.28, life: 0.32, width: 4 });   // 다섯 번째 빛줄기마다 튀는 고리
        }
      }
      // 흩날리는 깃털
      if (e.lt < 1.95) {
        e.d.fe += dt * 14 * v.q;
        while (e.d.fe >= 1) { e.d.fe--; ww.fx.emit('feather', V0.x + rand(0, V0.w), V0.y - 10, { color: Math.random() < 0.5 ? '#fff8e0' : '#ffe7a0', angle: Math.PI / 2, spread: 0.4, speed: rand(40, 90), grav: 40, life: rand(1.6, 2.4), alpha: 0.85 }); }
      }
    },
    draw(ctx, e) {
      const lt = e.lt, a = Math.min(1, lt / 0.3) * clamp((e.life - lt) / 0.4, 0, 1);
      glassRose(ctx, cx, cy, V0.w * 0.34, lt * 0.8, a * 0.5);
      runeCircle(ctx, cx, cy, V0.w * 0.36, '#fff2b0', lt * 0.8, a, 0.22, 8);
      runeCircle(ctx, cx, cy, V0.w * 0.22, '#ffffff', -lt * 1.3, a, 0.22, 5);
      ctx.globalCompositeOperation = ADD;
      for (const r of e.d.rain) {
        const u = r.t / 0.28, y1 = lerp(cy, r.gy, Math.min(1, u * 3));
        beamV(ctx, r.x, cy, y1, r.wd, '#ffe7a0', 1 - u);
        beamV(ctx, r.x, y1 - 140, y1, r.wd * 0.5, '#ffffff', 1 - u, '#ffffff');
        if (u > 0.3) glow(ctx, r.x, r.gy - 4, 50, '#fff2b0', (1 - u) * 0.8);
      }
      // 심판의 검: 1.3초부터 하늘에서 내려와 1.55초에 땅에 꽂힌다
      if (lt > 1.28) {
        const k = ease.inCubic(clamp((lt - 1.3) / 0.25, 0, 1)), L = V0.h * 0.72, fs = clamp((e.life - lt) / 0.5, 0, 1);
        const tipY = lerp(V0.y - 30, gy0 + 12, k);
        ctx.save(); ctx.translate(cx, tipY - L); bigSword(ctx, L, 66, '#e8f0ff', fs, '#fff2b0'); ctx.restore();
        ctx.globalCompositeOperation = ADD;
        if (k < 1) beamV(ctx, cx, V0.y - 40, tipY - L * 0.3, 18, '#fff2b0', 0.6 * k);
      }
      if (lt > 1.45) {
        const k = clamp((lt - 1.45) / 0.15, 0, 1), f2 = clamp((e.life - lt) / 0.5, 0, 1), W = V0.w * 0.2 * k;
        ctx.globalCompositeOperation = ADD;
        beamV(ctx, cx, V0.y - 60, V0.y + V0.h + 60, W, '#fff2b0', 0.8 * f2);
        beamV(ctx, cx, V0.y - 60, V0.y + V0.h + 60, W * 0.45, '#ffffff', f2, '#ffffff');
        if (v.tier >= 1) beamV(ctx, cx, V0.y - 60, V0.y + V0.h + 60, W * 1.6, v.accent, 0.3 * f2);
      }
    },
    light(L, e) { L.add(cx, V0.y + V0.h * 0.4, V0.w * 0.7, '#fff2b0', e.lt > 0.3 ? 1.3 : 0.5); },
  });
};

// 빅터 — 데드맨즈 핸드: 세피아 슬로모션 속 흩날리는 카드와 총알 폭풍, 펼쳐지는 네 장의 패, 그리고 큰 총구 섬광의 산탄
const casing = (w, p, g) => w.fx.emit('shard', g.x - p.facing * 8, g.y - 4, { color: '#e8c060', angle: -Math.PI / 2 - p.facing * 0.5, spread: 0.35, speed: rand(200, 320), size: 2.6, life: 0.7 });
function bigMuzzle(w, x, y, f, v) {
  const st = HFX.star?.('#fff0b0'), sk = HFX.streak?.('#ffd070');
  if (st) w.fx.sprite(st, x + f * 30, y, { size: 340, life: 0.2, s0: 0.4, s1: 1.25 });
  if (sk) for (let i = 0; i < qn(v, 6, 3); i++) w.fx.sprite(sk, x + f * 60, y + rand(-10, 10), { size: rand(220, 360), angle: (f > 0 ? 0 : Math.PI) + rand(-0.35, 0.35), life: 0.16, s0: 0.5, s1: 1.1 });
  w.fx.flash(x + f * 40, y, { color: '#fff0b0', size: 200, life: 0.14 });
  w.fx.burst('fire', x + f * 50, y, 14, { angle: f > 0 ? 0 : Math.PI, spread: 0.45, speed: 620, color: '#ff9a3a', color2: '#ffe0a0' });
}
ULTS.victor = (p, w, v = ultCtx(p, w)) => {
  const V0 = ultView(w);
  w.slowmo = Math.max(w.slowmo, 0.55);
  pose(p, w, 'shoot_up', 0.4, { h0: 0.1, sfx: 'card' });
  audio.sfx('card'); audio.sfx('clock_tick', { pitch: 0.6 }); audio.sfx('cylinder_spin', { vol: 0.8 });
  const cards = [];
  const RANKS = ['A', '8', 'A', '8'], SUITS = ['♠', '♣', '♣', '♠'];
  for (let i = 0; i < 10; i++) {
    const t = -Math.PI / 2 + rand(-1.3, 1.3), sp = rand(500, 900);
    cards.push({ x: p.cx, y: p.cy - 20, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp, rot: rand(0, TAU), vr: rand(-9, 9), rank: RANKS[i % 4], suit: SUITS[i % 4], s: rand(0.8, 1.1) });
  }
  const steps = [];
  let n = 0;
  for (let t = 0.3; t < 1.25; t += 0.028) {
    const k = n++;
    steps.push([t, (ww, e) => {
      const alt = k % 2 === 1, g = gunOf(p, alt), pool = enemiesIn(ww, ultView(ww));
      let x, y, tg = null;
      if (pool.length && Math.random() < 0.8) { tg = pool[k % pool.length]; x = tg.cx + rand(-14, 14); y = tg.cy + rand(-20, 20); }
      else { x = V0.x + rand(40, V0.w - 40); y = V0.y + rand(60, V0.h - 60); }
      if (Math.abs(x - p.cx) > 20) p.facing = Math.sign(x - p.cx);
      if (k % 3 === 0) pose(p, ww, alt ? 'shoot_alt' : 'shoot', 0.1, { h0: 0.01, sfx: 'gun' });
      e.d.tr.push({ x0: g.x, y0: g.y, x1: x, y1: y, t: 0 });
      muzzle(ww, p, g.x, g.y, Math.atan2(y - g.y, x - g.x), '#ffd070', 0.8);
      ww.fx.burst('spark', x, y, 3, { color: '#ffe0a0', speed: 260 });
      if (tg) {
        // 연타는 멈추지 않는다 (hitstop 0 명시 → 경직 없음). 맞은 곳에 작은 별 + 2px 반동
        playerStrike(ww, circ(x, y, 18), atk(p, { mv: 0.3, type: bestType(p), tags: ['ult'], breakWalls: false, kb: [40, -60], hitstop: 0, shake: 1 }));
        const st = HFX.star?.('#ffe0a0');
        if (st) ww.fx.sprite(st, x, y, { size: 44, life: 0.1, angle: rand(0, TAU) });
        ww.camera.kick?.(Math.sign(x - g.x) * 2, 0);
      }
      if (k % 2 === 0) { audio.sfx('gun', { vol: 0.5, pitch: rand(0.9, 1.2) }); casing(ww, p, g); }
    }]);
  }
  steps.push([1.2, (ww, e) => { e.d.handT = e.lt; audio.sfx('card', { pitch: 0.8 }); }]);   // 데드맨즈 핸드가 펼쳐진다
  steps.push([1.3, (ww) => { pose(p, ww, 'shoot_double', 0.5, { h0: 0.02, sfx: 'shotgun' }); }]);
  steps.push([1.36, (ww, e) => {
    const g = gunOf(p), f = p.facing;
    muzzle(ww, p, g.x, g.y, f > 0 ? 0 : Math.PI, '#fff0b0', 3);
    bigMuzzle(ww, g.x, g.y, f, v);
    ww.camera.kick?.(-f * 10, 0);   // 반동
    ultFinal(ww, p, 4.8, '#ffd070', {}, { v, x: g.x + f * 180, y: g.y });
    audio.sfx('shotgun');
    e.d.shotT = e.lt;
  }]);
  ultDirector(w, p, {
    v, dur: 1.95, dim: 0.5, dimCol: '#0a0604', steps, d: { tr: [], handT: 0, shotT: 0 },
    start(e, ww) {
      if (v.low) return;
      // 세피아 색조 (슬로모션과 난사 동안, 산탄에서 걷힌다)
      holdOverlay(ww, e, function (ctx, vw, vh) {
        const d = e.d, a = 0.2 * Math.min(1, e.lt / 0.25) * (d.shotT ? 1 - clamp((e.lt - d.shotT) / 0.2, 0, 1) : 1);
        if (a <= 0.005) return;
        ctx.globalAlpha = a; ctx.fillStyle = '#6a4216'; ctx.fillRect(0, 0, vw, vh);
      });
    },
    tick(e, ww, dt) {
      for (const c of cards) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 500 * dt; c.vx *= 0.99; c.rot += c.vr * dt; }
      const T = e.d.tr;
      for (let i = T.length - 1; i >= 0; i--) { T[i].t += dt; if (T[i].t > 0.08) { T[i] = T[T.length - 1]; T.pop(); } }
    },
    draw(ctx, e) {
      const a = clamp((e.life - e.lt) / 0.4, 0, 1);
      for (const c of cards) {   // 속도 방향으로 늘여 그린다 (모션 블러)
        const sp = Math.hypot(c.vx, c.vy), va = Math.atan2(c.vy, c.vx), st = 1 + Math.min(0.9, sp / 1400);
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(va); ctx.scale(st, 1 / Math.sqrt(st)); ctx.rotate(c.rot - va);
        ctx.scale(c.s * Math.cos(c.rot * 0.7), c.s); cardShape(ctx, 38, 54, c.rank, c.suit, a); ctx.restore();
      }
      for (const t of e.d.tr) cutLine(ctx, t.x0, t.y0, t.x1, t.y1, 2.2, '#ffd070', 1 - t.t / 0.08);
      // 데드맨즈 핸드: A♠ A♣ 8♣ 8♠ 가 빅터 머리 위에 부채꼴로 펼쳐졌다가 산탄과 함께 흩어진다
      if (e.d.handT) {
        const u = ease.outBack(clamp((e.lt - e.d.handT) / 0.12, 0, 1)), out = e.d.shotT ? clamp((e.lt - e.d.shotT) / 0.3, 0, 1) : 0;
        const hx = clamp(p.cx + p.facing * 30, V0.x + 130, V0.x + V0.w - 130), hy = Math.max(V0.y + 90, p.y - 92);
        ctx.globalCompositeOperation = ADD; glow(ctx, hx, hy, 170 * u, '#ffd070', 0.55 * (1 - out));
        ctx.globalCompositeOperation = 'source-over';
        [['A', '♠'], ['A', '♣'], ['8', '♣'], ['8', '♠']].forEach(([r, s], i) => {
          const ang = (i - 1.5) * 0.3;
          ctx.save(); ctx.translate(hx + Math.sin(ang) * (44 + out * 300), hy - Math.cos(ang) * (10 + out * 220) + out * out * 180);
          ctx.rotate(ang + out * (i - 1.5) * 3); ctx.scale(2.1 * u, 2.1 * u); cardShape(ctx, 38, 54, r, s, 1 - out); ctx.restore();
        });
      }
      if (e.lt > 1.34 && e.lt < 1.6) { ctx.globalCompositeOperation = ADD; const g = gunOf(p); glow(ctx, g.x, g.y, 220, '#ffd070', 1 - (e.lt - 1.34) / 0.26); }
    },
    light(L, e) { L.add(p.cx, p.cy, 260, '#ffd070', 1); },
  });
};

// 브란 — 대지 분쇄: 속도선을 끌며 솟구쳤다 내리꽂는 일격, 바닥이 갈라지고 암석 기둥이 연달아 솟은 뒤 흙먼지 벽이 양쪽으로 밀려난다
ULTS.bran = (p, w, v = ultCtx(p, w)) => {
  const V0 = ultView(w), ORANGE = '#ffb060';
  pose(p, w, 'heavy_up', 0.4, { h0: 0.1, sfx: 'jump' });
  p.vy = -1150; p.vx = 0; p.onGround = false; p.jumpCut = true;
  audio.sfx('boss_roar', { pitch: 1.2 }); audio.sfx('war_horn', { vol: 0.7 });
  const slam = (ww, e) => {
    e.d.slam = e.lt;
    const x = p.cx, y = p.bottom;
    e.d.sx = x; e.d.sy = y;
    p.endMove(); pose(p, ww, 'heavy_down', 0.5, { h0: 0.01, sfx: 'slash_heavy' });
    uHit(ww, p, 1.2, { kb: [80, -760], launch: true, hitstop: 0.12, shake: 12 });
    boomRing(ww, x, y, 260, ORANGE);
    ultBeat(ww, v, x, y, 1, true, ORANGE);
    shake(ww, 22, 1.3); ww.game.flash(ORANGE, 0.5, 3);
    audio.sfx('explode', { pitch: 0.6 }); audio.sfx('break_wall'); audio.sfx('impact_crack');
    // 바닥 균열 자국 + 파편 30 + 지면 충격파 + 큰 섬광
    for (const dx of [0, -110, 110]) HFX.stampDecal?.(ww, x + dx, y - 6, dx < 0 ? -1 : 1, 'crack', { floor: true, scale: dx ? 1.4 : 2.2 });
    ww.fx.burst('gravel', x, y - 8, 30, { angle: -Math.PI / 2, spread: 1.4, speed: 640 });
    ww.fx.ering(x, y - 2, { color: '#ffd8a0', r0: 30, r1: V0.w * 0.55, ry: 0.14, life: 0.5, width: 14 });
    const st = HFX.star?.(ORANGE);
    if (st) ww.fx.sprite(st, x, y - 30, { size: 320, life: 0.25, s0: 0.3, s1: 1.3 });
    const xs = [];
    for (let i = 1; i <= 5; i++) { xs.push(x + i * 150); xs.push(x - i * 150); }
    xs.forEach((px, i) => {
      if (px < V0.x - 40 || px > V0.x + V0.w + 40) return;
      const base = groundAt(ww, px, y - 60, 10 * TILE) ?? y, dl = 0.12 + Math.floor(i / 2) * 0.09;
      spikeFx(ww, p, px, base, rand(150, 230), 34, dl,
        atk(p, { mv: 0.9, type: bestType(p), tags: ['ult'], breakWalls: false, kb: [60, -760], launch: true, hitstop: 0.05, shake: 6 }), ROCK);
      setTimeoutFx(ww, dl, (w2) => ultBeat(w2, v, px, base, 0.3, true, ORANGE));   // 암석 기둥마다 박자
    });
  };
  ultDirector(w, p, {
    v, dur: 2.5, dim: 0.5, dimCol: '#0a0402', d: { dive: false, slam: 0, fin: false, sx: 0, sy: 0, dust: -1 },
    start(e, ww) { ww.camera.zoomPulse(0.9, 0.25, 0.35, 0.4); },   // 도약을 따라 화면이 물러난다
    tick(e, ww, dt) {
      if (!e.d.slam) {
        if (!e.d.dive) for (let i = 0; i < qn(v, 2); i++) ww.fx.speedLine(p.cx + rand(-120, 120), p.cy + rand(-90, 50), Math.PI / 2, { len: rand(70, 150), width: 2.5, color: '#ffe0b0', life: 0.2, speed: 900 });
        if (!e.d.dive && (p.vy > -150 || e.lt > 0.55)) { e.d.dive = true; pose(p, ww, 'plunge', 1.2, { h0: 0.02, hw: 1.1, sfx: 'dash' }); p.vy = 1500; audio.sfx('dash_burst', { pitch: 0.7 }); }
        if (e.d.dive) {
          p.vy = Math.max(p.vy, 1500);
          ultAfter(ww, p, v, ORANGE, 0.18);
          for (let i = 0; i < qn(v, 2); i++) ww.fx.speedLine(p.cx + rand(-60, 60), p.y + rand(-50, 10), -Math.PI / 2, { len: rand(80, 160), width: 3, color: ORANGE, life: 0.18, speed: 1000 });
          if (Math.random() < 0.8 * v.q) ww.fx.emit('fire', p.cx + rand(-14, 14), p.y + rand(0, 30), { speed: 40, color: '#ff7a2a' });
        }
        if ((e.d.dive && p.onGround) || e.lt > 1.1) slam(ww, e);
      } else if (!e.d.fin && e.lt > e.d.slam + 0.9) {
        e.d.fin = true;
        ultFinal(ww, p, 4.6, ORANGE, { element: null }, { v, x: e.d.sx, y: e.d.sy - 20, ground: true });
        ww.fx.ring(e.d.sx, e.d.sy - 10, { color: '#ffd8a0', r0: 30, r1: V0.w * 0.7, life: 0.6, width: 18 });
        e.d.dust = 0; audio.sfx('land_heavy', { pitch: 0.6 });
      }
      // 흙먼지 벽: 마무리에서 양쪽으로 땅을 따라 굴러간다
      if (e.d.dust >= 0 && e.d.dust < 0.75) {
        e.d.dust += dt;
        for (const d of [-1, 1]) {
          const fxX = e.d.sx + d * (40 + e.d.dust * 950);
          for (let i = 0; i < qn(v, 2); i++) ww.fx.emit('smoke', fxX + rand(-24, 24), e.d.sy - rand(6, 40), { color: '#8a7460', speed: 50, angle: -Math.PI / 2 - d * 0.5, spread: 0.4, size: rand(18, 32), life: rand(0.5, 0.9), alpha: 0.55, grav: -30 });
          if (Math.random() < 0.6 * v.q) ww.fx.emit('dust', fxX, e.d.sy - 4, { speed: 120, angle: d > 0 ? -0.3 : Math.PI + 0.3, spread: 0.3 });
        }
      }
    },
    draw(ctx, e) {
      if (!e.d.slam) return;
      const k = clamp((e.lt - e.d.slam) / 0.35, 0, 1), a = clamp((e.life - e.lt) / 0.5, 0, 1), x = e.d.sx, y = e.d.sy;
      ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round';
      for (const d of [-1, 1]) {
        const pts = [x, y];
        for (let i = 1; i <= 12; i++) pts.push(x + d * V0.w * k * i / 12, y - 2 + Math.sin(i * 2.7 + d) * 6);
        ctx.strokeStyle = rgba('#ff7a2a', 0.45 * a); ctx.lineWidth = 12; strokePts(ctx, pts);
        ctx.strokeStyle = rgba('#fff0c0', 0.95 * a); ctx.lineWidth = 3; strokePts(ctx, pts);
      }
      glow(ctx, x, y, 220 * (0.6 + k), '#ff9a3a', 0.6 * a);
      // 갈라진 틈에서 솟는 열기 (가로 빛줄기)
      beamH(ctx, x - V0.w * k, x + V0.w * k, y - 3, 10 * a, '#ff7a2a', 0.5 * a, '#fff0c0');
    },
    light(L, e) { if (e.d.slam) L.add(e.d.sx, e.d.sy - 40, 600, '#ff9a3a', 1.3); },
  });
};

// 리아 — 천망회회: 붉은 비네트 속 색수차 참격 백 개, 그물이 빛나며 닫히면 검붉은 임팩트 프레임과 피보라, 그리고 납도
/** 리아의 검붉은 임팩트 프레임: 2프레임 (검정 바탕 + 붉은 그물선 → 붉은 섬광). 저품질은 생략 (ultFinal 의 번쩍임만) */
function liaImpactFrame(w, net) {
  const cam = w.camera, lines = net.slice(0, 110);
  return w.addOverlay?.({
    life: 3 / 60,
    draw(ctx, vw, vh) {
      if (this.t < 1.5 / 60) {
        ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0, 0, vw, vh);
        ctx.save(); cam.apply(ctx);
        ctx.strokeStyle = '#ff2040'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); for (const n of lines) { ctx.moveTo(n.x0, n.y0); ctx.lineTo(n.x1, n.y1); } ctx.stroke();
        ctx.restore();
      } else { ctx.globalAlpha = 0.55; ctx.fillStyle = '#c0102a'; ctx.fillRect(0, 0, vw, vh); }
    },
  }) ?? null;
}
ULTS.lia = (p, w, v = ultCtx(p, w)) => {
  const V0 = ultView(w), px = p.cx, pb = p.bottom;
  afterimage(w, p, '#ff4a6a', 0.4);
  w.fx.burst('dark', p.cx, p.cy, 20, { speed: 160, color: '#2a0a1a' });
  audio.sfx('mist'); audio.sfx('slash_heavy', { pitch: 1.4 });
  p.hidden = true;
  const snapBase = p.snapshot();
  ultDirector(w, p, {
    v, dur: 2.1, dim: 0.85, dimCol: '#08000a', d: { cuts: [], net: [], ct: 0, n: 0, fin: false, vg: 0 },
    start(e, ww) { ww.game.vignette?.('#ff0020', 0.5, 1.2); },
    tick(e, ww, dt) {
      if (e.lt < 1.5 && (e.d.vg -= dt) <= 0) { e.d.vg = 0.3; ww.game.vignette?.('#ff0020', 0.42, 1.2); }   // 붉은 비네트 유지
      const C = e.d.cuts;
      for (let i = C.length - 1; i >= 0; i--) { C[i].t += dt; if (C[i].t > 0.14) { if (e.d.net.length < 110) e.d.net.push(C[i]); C[i] = C[C.length - 1]; C.pop(); } }
      if (e.lt > 0.15 && e.lt < 1.35) {
        e.d.ct += dt * 85;
        const pool = enemiesIn(ww, ultView(ww));
        while (e.d.ct >= 1) {
          e.d.ct--; const k = e.d.n++;
          let x, y, tg = null;
          if (pool.length && Math.random() < 0.65) { tg = pool[k % pool.length]; x = tg.cx + rand(-10, 10); y = tg.cy + rand(-16, 16); }
          else { x = V0.x + rand(30, V0.w - 30); y = V0.y + rand(50, V0.h - 40); }
          const t = rand(0, TAU), L = rand(110, 210);
          C.push({ x0: x - Math.cos(t) * L, y0: y - Math.sin(t) * L, x1: x + Math.cos(t) * L, y1: y + Math.sin(t) * L, t: 0 });
          if (tg) playerStrike(ww, circ(x, y, 22), atk(p, { mv: 0.1, type: bestType(p), element: 'dark', tags: ['ult'], breakWalls: false, kb: [20, -40], hitstop: 0, shake: 0.5, crit: 10 }));
          if (k % 4 === 0) audio.sfx('slash', { vol: 0.45, pitch: rand(1.1, 1.6) });
          if (k % 12 === 0) {
            const s2 = { ...snapBase, x: x - p.w / 2, cx: x, y: y + 40 - p.h, bottom: y + 40, facing: Math.cos(t) > 0 ? 1 : -1, anim: 'dash', move: null };
            ww.fx.ghost((ctx, a) => drawHero(ctx, s2, ww, { alpha: a, tint: '#ff4a6a' }), 0.2, 'front');
            ww.camera.kick?.(rand(-4, 4), rand(-3, 3));   // 열두 번째 참격마다 작은 반동
          }
        }
      }
      if (!e.d.fin && e.lt > 1.5) {
        e.d.fin = true;
        p.hidden = false; p.x = px - p.w / 2; p.y = pb - p.h;
        pose(p, ww, 'stab_alt', 0.5, { h0: 0.02, sfx: 'slash_heavy' });
        const foes = enemiesIn(ww, ultView(ww, 30));
        ultFinal(ww, p, 4.2, '#ff2040', { element: 'dark' }, { v, x: px, y: pb - 50 });
        if (!v.low && (v.tier < 2 || !kitLive())) liaImpactFrame(ww, e.d.net);   // 2차 전직은 키트의 임팩트 프레임
        for (const n of e.d.net) ww.fx.burst('spark', (n.x0 + n.x1) / 2, (n.y0 + n.y1) / 2, 1, { color: '#ff4a6a', speed: 200 });
        for (const en of foes) { ww.fx.burst('blood', en.cx, en.cy, 16, { speed: 380 }); ww.fx.burst('bloodmist', en.cx, en.cy, 3, { speed: 40 }); }
        xSlash(ww, px, pb - 60, 190, '#ff2a4a', 0.42, 0.2);
        setTimeoutFx(ww, 0.35, () => audio.sfx('sheath'));   // 납도
      }
    },
    draw(ctx, e) {
      const lt = e.lt, glowNet = lt > 1.35 && lt < 1.5 ? 1 : 0, netA = lt < 1.5 ? 0.13 + glowNet * 0.8 : Math.max(0, 0.9 - (lt - 1.5) * 3);
      ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round';
      if (netA > 0.01) {
        if (glowNet && !v.low) {   // 닫히는 그물: 색수차로 번지며 밝아진다
          ctx.strokeStyle = rgba('#30e0ff', 0.35); ctx.lineWidth = 2;
          ctx.beginPath(); for (const n of e.d.net) { ctx.moveTo(n.x0 + 3, n.y0 + 2); ctx.lineTo(n.x1 + 3, n.y1 + 2); } ctx.stroke();
        }
        ctx.strokeStyle = rgba('#ff2a4a', netA); ctx.lineWidth = 1.5 + glowNet * 1.5;
        ctx.beginPath(); for (const n of e.d.net) { ctx.moveTo(n.x0, n.y0); ctx.lineTo(n.x1, n.y1); } ctx.stroke();
      }
      for (const c of e.d.cuts) {   // 색수차 이중선 (청록이 살짝 어긋나 따라온다)
        const a = 1 - c.t / 0.14;
        if (!v.low) cutLine(ctx, c.x0 + 2.5, c.y0 + 1.5, c.x1 + 2.5, c.y1 + 1.5, 2.4, '#30e0ff', 0.45 * a);
        cutLine(ctx, c.x0, c.y0, c.x1, c.y1, 3.2, '#ff2a4a', a);
      }
      if (lt > 1.35 && lt < 1.7) glow(ctx, px, pb - 44, 260, '#ff2040', 1 - (lt - 1.35) / 0.35);
    },
    light(L, e) { L.add(V0.x + V0.w / 2, V0.y + V0.h / 2, V0.w * 0.5, '#ff2a4a', 0.6); },
    end() { p.hidden = false; },
  });
};

// 아젤 — 블러드 녹턴: 떠오르는 핏빛 달과 박쥐 떼, 피를 흩뿌리는 초승달 참격, 마지막에 적들의 피가 흐름이 되어 아젤에게 흘러든다
/** 적마다 아젤에게 휘어 들어가는 피의 흐름 (곡선을 따라가는 방울들; 캐시 스프라이트) */
function bloodStreams(w, p, v, dur = 0.8) {
  const foes = enemiesIn(w, ultView(w, 30)).slice(0, v.low ? 4 : 8);
  if (!foes.length) return null;
  const S = foes.map((en) => ({ x: en.cx, y: en.cy, bx: (en.cx + p.cx) / 2 + rand(-90, 90), by: Math.min(en.cy, p.cy) - rand(90, 190), d: rand(0, 0.12) }));
  const nd = v.low ? 6 : 11;
  return fx(w, {
    life: dur, z: 12, follow: (e, ww) => viewBound(e, ww),
    draw(ctx, e) {
      const img = glowSprite('#ff1a2a');
      const tx = p.cx, ty = p.cy - 10;
      for (const s of S) {
        for (let i = 0; i < nd; i++) {
          const u = clamp((e.lt - s.d - i * 0.03) / 0.42, 0, 1);
          if (u <= 0 || u >= 1) continue;
          const iu = 1 - u, x = iu * iu * s.x + 2 * iu * u * s.bx + u * u * tx, y = iu * iu * s.y + 2 * iu * u * s.by + u * u * ty;
          const r = 6.5 * (1 - u * 0.45);
          ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#7a0012';
          ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.fill();
          if (img) { ctx.globalCompositeOperation = ADD; blit(ctx, img, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4, 0.8); }
        }
      }
      ctx.globalCompositeOperation = ADD;
      glow(ctx, tx, ty, 90 + 60 * Math.sin(e.k * Math.PI), '#ff2040', 0.6 * Math.sin(e.k * Math.PI));
    },
  });
}
ULTS.azel = (p, w, v = ultCtx(p, w)) => {
  const V0 = ultView(w);
  const bats = [];
  for (let i = 0; i < 22; i++) bats.push({ x: V0.x + rand(-200, V0.w), y: V0.y + rand(30, V0.h * 0.6), vx: rand(380, 620) * (Math.random() < 0.5 ? 1 : -1), ph: rand(0, TAU), s: rand(0.6, 1.2) });
  pose(p, w, 'cast_up', 0.55, { h0: 0.1, sfx: 'dark' });
  audio.sfx('bell', { pitch: 0.5 }); audio.sfx('bat'); audio.sfx('heartbeat', { vol: 0.8 });
  const sweep = (ww, dir, mv) => { uHit(ww, p, mv, { element: 'dark', hitstop: 0.06, kb: [dir * 200, -260] }); audio.sfx('slash_heavy', { pitch: 0.7 }); shake(ww, 8, 0.2); };
  const R = V0.h * 0.78, SW = [[0.58, 0.32, -1.3, 1.1, 1], [1.28, 0.2, -1.1, 0.9, -1]];   // [시작, 길이, 시작각, 끝각, 위아래]
  const steps = [
    [0.5, (ww) => pose(p, ww, 'slash_wide', 0.55, { h0: 0.1, sfx: 'slash_heavy' })],
    [0.62, (ww) => sweep(ww, 1, 0.9)], [0.74, (ww) => sweep(ww, 1, 0.9)], [0.86, (ww) => sweep(ww, 1, 0.9)],
    [1.2, (ww) => pose(p, ww, 'slash_up', 0.5, { h0: 0.08, sfx: 'slash_heavy' })],
    [1.42, (ww) => {
      const foes = enemiesIn(ww, ultView(ww, 30));
      ultFinal(ww, p, 4.6, '#ff1030', { element: 'dark' }, { v, x: p.cx, y: p.cy - 10 });
      p.heal(p.stats.hp * 0.15);
      for (const en of foes) ww.fx.burst('blood', en.cx, en.cy, 14, { speed: 320 });
      grade(ww, '#7a0010', v.low ? 0.18 : 0.3, 0.8);   // 붉은 색조
      bloodStreams(ww, p, v);                            // 피의 흐름이 아젤에게로
      audio.sfx('heartbeat', { pitch: 0.8 });
    }],
  ];
  ultDirector(w, p, {
    v, dur: 2.15, dim: 0.6, dimCol: '#0c0004', steps,
    bg(ctx, e, ww, a) {
      const rise = ease.outCubic(clamp(e.lt / 0.6, 0, 1)), MR = V0.h * 0.26;
      const g = ctx.createLinearGradient(0, V0.y, 0, V0.y + V0.h);
      g.addColorStop(0, rgba('#5a0010', 0.45 * a)); g.addColorStop(1, rgba('#1a0004', 0));
      ctx.fillStyle = g; ctx.fillRect(V0.x - 60, V0.y - 60, V0.w + 120, V0.h + 120);
      const pulse = e.lt > 1.42 ? Math.max(0, 1 - (e.lt - 1.42) / 0.4) : 0;
      bloodMoon(ctx, V0.x + V0.w * 0.5, V0.y + V0.h * 0.3 + (1 - rise) * 120, MR * (1 + pulse * 0.08), a * (0.4 + rise * 0.6), e.lt);
    },
    tick(e, ww, dt) {
      for (const b of bats) { b.x += b.vx * dt; b.ph += dt * 24; if (b.x > V0.x + V0.w + 80) b.x = V0.x - 80; if (b.x < V0.x - 80) b.x = V0.x + V0.w + 80; }
      // 초승달 가장자리에서 흩날리는 핏방울
      const cx = p.cx, cy = p.cy - 10;
      for (const [t0, dur, a0, a1, dy] of SW) {
        if (e.lt < t0 || e.lt > t0 + dur) continue;
        const u = ease.outCubic(clamp((e.lt - t0) / dur, 0, 1)), ang = lerp(a0, a1, u), dirA = Math.sign(a1 - a0);
        for (let j = 0; j < qn(v, 3); j++) {
          const aa = ang + rand(-0.35, 0.1) * dirA, rr = R * rand(0.86, 1.0);
          const x = cx + p.facing * Math.cos(aa) * rr, y = cy + dy * Math.sin(aa) * rr;
          const tx = -Math.sin(aa) * p.facing * dirA, ty = Math.cos(aa) * dy * dirA;
          ww.fx.emit('blood', x, y, { vx: tx * rand(260, 480), vy: ty * rand(260, 480) - 60, speed: 60, size: rand(2, 4) });
        }
      }
    },
    draw(ctx, e) {
      const lt = e.lt, a = clamp((e.life - lt) / 0.4, 0, 1);
      for (const b of bats) { ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.vx > 0 ? 1 : -1, 1); ctx.globalAlpha = a; batShape(ctx, 16 * b.s, Math.sin(b.ph)); ctx.restore(); }
      ctx.globalAlpha = 1;
      // 시전: 아젤을 감싸는 핏빛 기둥
      if (lt < 0.7) { ctx.globalCompositeOperation = ADD; const k = Math.sin(clamp(lt / 0.7, 0, 1) * Math.PI); beamV(ctx, p.cx, p.bottom - 300, p.bottom, 46 * k, '#ff1a2a', 0.7 * k, '#ff9aa8'); glow(ctx, p.cx, p.bottom - 40, 120 * k, '#ff2040', 0.6 * k); }
      const cx = p.cx, cy = p.cy - 10;
      for (const [t0, dur, a0, a1, dy] of SW) {
        if (lt < t0 || lt > t0 + dur + 0.25) continue;
        const u = ease.outCubic(clamp((lt - t0) / dur, 0, 1)), fade = 1 - clamp((lt - t0 - dur) / 0.25, 0, 1);
        for (let k = 3; k >= 0; k--) {
          ctx.save(); ctx.translate(cx, cy); ctx.scale(p.facing, dy); ctx.rotate(lerp(a0, a1, Math.max(0, u - k * 0.06)));
          crescent(ctx, R, R * 0.24, k === 0 ? '#ff1a3a' : (v.tier >= 1 && k === 2 ? v.accent : '#ff1a3a'), fade * (1 - k * 0.22), '#ffe0e4'); ctx.restore();
        }
      }
    },
    light(L, e) { L.add(V0.x + V0.w * 0.5, V0.y + V0.h * 0.3, V0.w * 0.5, '#ff2040', 1); L.add(p.cx, p.cy, 220, '#ff2040', 1); },
  });
};

// ═══════════════════════════ 비전서 커맨드 기술 ═══════════════════════════
// 모든 캐릭터가 사용 가능. 캐릭터 고유색으로 물든다. MP 는 함수 안에서 확인·소모한다.
function spendMp(p, w, cost) {
  if (p.mp < cost) { w.game.toast('MP가 부족하다', '#5aa8ff', 1); audio.sfx('menu_cancel', { vol: 0.3 }); return false; }
  p.mp -= cost;
  return true;
}
const tatk = (p, o) => atk(p, { type: bestType(p), tags: ['skill', 'tech'], ...o });

SKILL_IMPL.tech_hadou = (p, w) => {
  if (!spendMp(p, w, 8)) return false;
  const c = charCol(p);
  pose(p, w, wa(p, 'slash'), 0.36, { h0: 0.07, sfx: 'slash_heavy' });
  setTimeoutFx(w, 0.07, (ww) => {
    const f = p.facing;
    shoot(ww, p, {
      x: p.cx + f * 40, y: p.bottom - 50, vx: f * 900, vy: 0, w: 50, h: 104, render: crescentRender, color: c, color2: '#ffffff',
      life: 0.7, pierce: 99, collideWalls: false, fadeOut: true, fadeIn: true, trail: 'magic', trailRate: 0.03, trailOpts: { color: c },
      light: { r: 120, color: c, i: 0.9 }, attack: tatk(p, { mv: 2.2, kb: [320, -200], hitstop: 0.07, shake: 4 }),
    });
    audio.sfx('magic', { pitch: 0.8 });
  });
};

SKILL_IMPL.tech_shoryu = (p, w) => {
  if (!spendMp(p, w, 10)) return false;
  const c = charCol(p), f = p.facing;
  pose(p, w, wa(p, 'up'), 0.5, { h0: 0.03, hw: 0.3, sfx: 'slash_heavy', mv: { vy: -980 } });
  p.onGround = false; p.jumpCut = true;
  audio.sfx('fire', { pitch: 1.3 });
  fx(w, {
    life: 0.42, z: 11, d: { g: 0 },
    atk: tatk(p, { mv: 0.9, rehit: 0.08, kb: [60, -760], launch: true, hitstop: 0.05, shake: 3 }), win: [0, 0.9],
    follow(e) { e.x = p.cx - 70; e.y = p.y - 70; e.w = 140; e.h = p.h + 80; },
    rect() { return { x: p.cx - 26 + f * 18, y: p.y - 50, w: 52, h: p.h + 50 }; },
    tick(e, ww) { holdInvuln(p); p.vx = f * 120; if ((e.d.g++ & 1) === 0) afterimage(ww, p, c, 0.2); ww.fx.emit('fire', p.cx + rand(-20, 20), p.cy + rand(-30, 30), { color: c, color2: '#ffffff', speed: 60 }); },
    draw(ctx, e) {
      const a = 1 - e.k;
      ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round';
      for (let s = 0; s < 2; s++) {
        const pts = [];
        for (let i = 0; i <= 14; i++) { const u = i / 14, t = u * 9 + e.lt * 26 + s * Math.PI; pts.push(p.cx + Math.cos(t) * 30 * (0.6 + u * 0.5), p.bottom - u * (p.h + 60) + Math.sin(t) * 6); }
        ctx.strokeStyle = rgba(c, 0.45 * a); ctx.lineWidth = 10; strokePts(ctx, pts);
        ctx.strokeStyle = rgba('#ffffff', 0.9 * a); ctx.lineWidth = 2.5; strokePts(ctx, pts);
      }
      glow(ctx, p.cx, p.cy - 20, 90, c, 0.4 * a);
    },
    end() { p.iframes = 0; },
    light(L, e) { L.add(p.cx, p.cy, 160, c, 1 - e.k); },
  });
};

SKILL_IMPL.tech_tatsu = (p, w) => {
  if (!spendMp(p, w, 12)) return false;
  const c = charCol(p), f = p.facing, anim = wa(p, 'wide');
  audio.sfx('dash'); audio.sfx('slash_heavy', { pitch: 1.2 });
  fx(w, {
    life: 0.62, z: 11, d: { a: 0 },
    atk: tatk(p, { mv: 0.8, rehit: 0.09, kb: [300, -220], hitstop: 0.04, shake: 3 }), win: [0, 1],
    follow(e) { e.x = p.cx - 100; e.y = p.cy - 90; e.w = 200; e.h = 180; },
    rect() { return { x: p.cx - 74, y: p.cy - 60, w: 148, h: 110 }; },
    tick(e, ww, dt) {
      if (!p.move || p.move.id !== 'sk_' + anim) pose(p, ww, anim, 0.32, { h0: 0.02, hw: 0.28, sfx: 'slash' });
      p.vx = f * 470; if (!p.onGround && p.vy > 40) p.vy = 40;
      e.d.a += dt * 20 * f;
      if (Math.random() < 0.5) ww.fx.emit('dust', p.cx - f * 20, p.bottom - 2, { speed: 60 });
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 8) * clamp((e.life - e.lt) / 0.15, 0, 1);
      ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round';
      for (let j = 0; j < 3; j++) {
        ctx.save(); ctx.translate(p.cx, p.cy - 30 + j * 26); ctx.scale(1, 0.32);
        for (let k = 0; k < 6; k++) { const u = (k + 1) / 6, a0 = e.d.a + j * 2 - 2.2 + k * 0.37; ctx.strokeStyle = rgba(k > 3 ? '#ffffff' : c, a * u * 0.8); ctx.lineWidth = 3 + u * 9; ctx.beginPath(); ctx.arc(0, 0, 70, a0, a0 + 0.4); ctx.stroke(); }
        ctx.restore();
      }
    },
    end() { p.endMove(); },
    light(L) { L.add(p.cx, p.cy, 150, c, 0.8); },
  });
};

function palmRender(ctx, pr) {
  const d = Math.sign(pr.vx) || 1, s = pr.scale, c = pr.color, k = Math.min(1, pr.t * 8);
  ctx.scale(d * s * (0.7 + 0.3 * k), s * (0.7 + 0.3 * k));
  ctx.globalCompositeOperation = ADD;
  glow(ctx, 0, 0, 70, c, 0.3);
  const g = ctx.createLinearGradient(-60, 0, 30, 0);
  g.addColorStop(0, rgba(c, 0)); g.addColorStop(0.6, rgba(c, 0.4)); g.addColorStop(1, rgba(c, 0.75));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 4, 26, 30, 0, 0, TAU); ctx.fill();
  const fing = [[-20, -26, 0.25], [-7, -34, 0.08], [7, -33, -0.06], [19, -26, -0.2]];
  for (const [fx0, fy, rot] of fing) { ctx.save(); ctx.translate(fx0 * 0.9 + 6, fy + 6); ctx.rotate(rot - Math.PI / 2 + Math.PI / 2); ctx.beginPath(); ctx.ellipse(0, -10, 6.5, 16, rot, 0, TAU); ctx.fill(); ctx.restore(); }
  ctx.save(); ctx.translate(-22, 12); ctx.rotate(-0.9); ctx.beginPath(); ctx.ellipse(0, 0, 7, 16, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 4, 26, 30, 0, -1.2, 1.2); ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.strokeStyle = rgba(c, 0.4); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-40 - i * 16, -20 + i * 13); ctx.lineTo(-90 - i * 20, -20 + i * 13); ctx.stroke(); }
}
SKILL_IMPL.tech_palm = (p, w) => {
  if (!spendMp(p, w, 10)) return false;
  const c = charCol(p);
  pose(p, w, wa(p, 'thrust'), 0.4, { h0: 0.08, sfx: 'slash_heavy' });
  setTimeoutFx(w, 0.08, (ww) => {
    const f = p.facing;
    shoot(ww, p, {
      x: p.cx + f * 50, y: p.bottom - 56, vx: f * 760, vy: 0, w: 70, h: 90, scale: 1.15, render: palmRender, color: c,
      life: 0.9, pierce: 99, collideWalls: false, fadeOut: true, light: { r: 140, color: c, i: 1 },
      attack: tatk(p, { mv: 2.4, kb: [560, -220], hitstop: 0.09, shake: 6 }),
    });
    ww.fx.ring(p.cx + f * 50, p.bottom - 56, { color: c, r0: 10, r1: 70, life: 0.25, width: 5 });
    shake(ww, 5, 0.15); audio.sfx('hit_heavy');
  });
};

SKILL_IMPL.tech_hellslash = (p, w) => {
  if (!spendMp(p, w, 14)) return false;
  const c = charCol(p), x0 = p.cx;
  pose(p, w, wa(p, 'down'), 0.45, { h0: 0.1, sfx: 'slash_heavy' });
  audio.sfx('dark'); audio.sfx('fire', { pitch: 0.7 }); shake(w, 5, 0.2);
  for (let i = 0; i < 6; i++) {
    const d = i % 2 ? -1 : 1, x = x0 + d * (60 + Math.floor(i / 2) * 60), base = groundAt(w, x, p.bottom - 30) ?? p.bottom;
    fx(w, {
      delay: 0.1 + Math.floor(i / 2) * 0.08, life: 0.55, z: 11, x: x - 40, y: base - 200, w: 80, h: 204,
      atk: tatk(p, { mv: 1.1, element: 'dark', kb: [d * 0 + 120, -620], launch: true, hitstop: 0.05, shake: 3, dir: d }), win: [0.02, 0.5],
      rect(e) { return { x: x - 26, y: base - 170 * ease.outCubic(clamp(e.lt / 0.1, 0, 1)), w: 52, h: 170 }; },
      start(e, ww) { ww.fx.burst('dark', x, base - 10, 8, { angle: -Math.PI / 2, spread: 0.5, speed: 200, color: '#3a0a2a' }); },
      draw(ctx, e) { const up = ease.outCubic(clamp(e.lt / 0.1, 0, 1)), a = 1 - clamp((e.k - 0.5) / 0.5, 0, 1); fireColumn(ctx, x, base, 24, 170 * up, e.lt + i * 0.3, a, '#8a1aff', c, '#ffe0ff'); },
      light(L, e) { L.add(x, base - 70, 150, c, 1 - e.k); },
    });
  }
};

SKILL_IMPL.tech_thunder = (p, w) => {
  if (!spendMp(p, w, 16)) return false;
  const c = charCol(p), f = p.facing;
  pose(p, w, wa(p, 'up'), 0.45, { h0: 0.1, sfx: 'thunderclap' });
  const cy = Math.max(w.camera.y + 10, p.y - 280);
  for (let i = 0; i < 5; i++) {
    const tg = frontEnemies(w, p, 460)[i];
    const x = tg ? tg.cx : p.cx + f * (80 + i * 72);
    setTimeoutFx(w, 0.08 + i * 0.07, (ww) => strikeBolt(ww, p, x, cy, 1.3, 1.1, i % 2 ? c : '#bfe0ff', tg ? tg.cy : p.cy));
  }
};

function flaskRender(ctx, pr) {
  ctx.rotate(pr.rot);
  ctx.globalCompositeOperation = ADD; glow(ctx, 0, 2, 22, '#6aff9a', 0.5);
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(-2, 0, 1, 0, 3, 9);
  g.addColorStop(0, '#e8ffe0'); g.addColorStop(0.5, '#4ae07a'); g.addColorStop(1, '#1a6a3a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 3, 9, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#0a2014'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#c8d0c0'; ctx.fillRect(-3, -9, 6, 7); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(-3.5, -11, 7, 3);
}
SKILL_IMPL.tech_bomb = (p, w) => {
  if (!spendMp(p, w, 12)) return false;
  const c = charCol(p), f = p.facing;
  p.throwT = 0.25; audio.sfx('holywater');
  shoot(w, p, {
    x: p.cx + f * 20, y: p.bottom - 72, vx: f * 520, vy: -640, w: 18, h: 18, behavior: 'arc', gravity: 1, collideWalls: 'land', spin: 10 * f,
    life: 1.6, pierce: 1, render: flaskRender, light: { r: 70, color: '#6aff9a', i: 0.7 }, trail: 'magic', trailRate: 0.05, trailOpts: { color: '#6aff9a' },
    attack: tatk(p, { mv: 0.3, kb: [80, -80], hitstop: 0.02 }),
    onLand: (pr, ww) => pr.expire(ww),
    onExpire: (pr, ww) => {
      boom(ww, p, pr.cx, pr.cy - 16, 120, { mv: 3, element: null, c1: '#4ae07a', c2: c, shake: 10, kb: [380, -560], type: bestType(p), atk: { tags: ['skill', 'tech'], launch: true } });
      ww.fx.burst('magic', pr.cx, pr.cy - 16, 24, { color: '#b060ff', speed: 340 });
      ww.fx.burst('smoke', pr.cx, pr.cy - 16, 10, { speed: 120, color: '#2a4a2a' });
    },
  });
};

SKILL_IMPL.tech_hydro = (p, w) => {
  if (!spendMp(p, w, 16)) return false;
  const c = charCol(p), f = p.facing, D = 380, dur = 0.3, x0 = p.cx, y = p.cy;
  pose(p, w, wa(p, 'thrust'), 0.42, { h0: 0.03, hw: 0.3, sfx: 'splash' });
  audio.sfx('splash'); audio.sfx('dash');
  fx(w, {
    life: dur + 0.35, z: 11, d: { x1: x0 },
    atk: tatk(p, { mv: 0.85, rehit: 0.08, kb: [360, -300], hitstop: 0.04, shake: 3 }), win: [0, dur / (dur + 0.35)],
    follow(e) { if (e.lt < dur) e.d.x1 = p.cx; e.x = Math.min(x0, e.d.x1) - 80; e.y = y - 90; e.w = Math.abs(e.d.x1 - x0) + 160; e.h = 180; },
    rect(e) { return { x: Math.min(x0, e.d.x1) - 30, y: y - 60, w: Math.abs(e.d.x1 - x0) + 60, h: 120 }; },
    tick(e, ww) {
      if (e.lt < dur) { p.vx = f * D / dur; if (!p.onGround) p.vy = 0; holdInvuln(p); ww.fx.emit('water', p.cx, p.cy + rand(-20, 20), { speed: 200, angle: -Math.PI / 2, spread: 1.2 }); }
      else if (!e.d.end) { e.d.end = true; p.iframes = 0; p.vx = f * 150; ww.fx.burst('water', p.cx + f * 30, p.cy, 24, { speed: 380 }); ww.fx.ring(p.cx + f * 30, p.cy, { color: '#7ec8ff', r0: 10, r1: 110, life: 0.35, width: 6 }); audio.sfx('splash'); shake(ww, 6, 0.2); }
    },
    draw(ctx, e) {
      const x1 = e.d.x1, a = e.lt < dur ? 1 : 1 - (e.lt - dur) / 0.35, len = x1 - x0;
      if (Math.abs(len) < 4) return;
      ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const pts = [];
      for (let i = 0; i <= 18; i++) { const u = i / 18; pts.push(x0 + len * u, y + Math.sin(u * 10 - e.lt * 18) * 22 * Math.sin(u * Math.PI)); }
      ctx.strokeStyle = rgba('#2a7aff', 0.45 * a); ctx.lineWidth = 46; strokePts(ctx, pts);
      ctx.strokeStyle = rgba('#7ec8ff', 0.7 * a); ctx.lineWidth = 24; strokePts(ctx, pts);
      ctx.strokeStyle = rgba('#ffffff', 0.85 * a); ctx.lineWidth = 6; strokePts(ctx, pts);
      ctx.strokeStyle = rgba(c, 0.5 * a); ctx.lineWidth = 2; strokePts(ctx, pts);
      // 용의 머리
      const hx = pts[pts.length - 2], hy = pts[pts.length - 1];
      ctx.save(); ctx.translate(hx, hy); ctx.scale(Math.sign(len), 1);
      glow(ctx, 10, 0, 60, '#7ec8ff', 0.7 * a);
      ctx.fillStyle = rgba('#bfe8ff', 0.85 * a);
      ctx.beginPath(); ctx.moveTo(-10, -22); ctx.quadraticCurveTo(30, -26, 46, -4); ctx.lineTo(24, 2); ctx.lineTo(44, 10); ctx.quadraticCurveTo(20, 22, -10, 20); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', a); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -20); ctx.quadraticCurveTo(-26, -40, -44, -34); ctx.moveTo(4, -22); ctx.quadraticCurveTo(-8, -46, -24, -48); ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', a); ctx.beginPath(); ctx.arc(22, -10, 3, 0, TAU); ctx.fill();
      ctx.restore();
    },
    light(L, e) { L.add(e.d.x1, y, 180, '#7ec8ff', 1 - e.k); },
  });
};

SKILL_IMPL.tech_clone = (p, w) => {
  if (!spendMp(p, w, 20)) return false;
  const c = charCol(p), f = p.facing, ms = p.moveSet, fin = ms?.ground?.[ms.ground.length - 1] || ms?.charge;
  if (!fin) return false;
  audio.sfx('mist'); audio.sfx('ghost', { pitch: 1.2 });
  pose(p, w, fin.anim, fin.dur, { h0: fin.hit?.[0] ?? 0.1, hw: 0.1, sfx: fin.sfx ?? 'slash_heavy', mv: fin.slash ? { slash: { ...fin.slash, color: c } } : {} });
  const spots = [[-f * 70, 0, -f], [f * 150, 0, -f], [f * 40, -110, f]];
  spots.forEach(([dx, dy, fc], i) => {
    const gx = p.cx + dx, gb = p.bottom + dy;
    const snap = ghostOf(p, gx, gb, { facing: fc, move: fin, moveT: 0, onGround: dy === 0, anim: fin.anim });
    const box = fin.box || { x: 0, y: -100, w: 120, h: 100 };
    fx(w, {
      delay: i * 0.08, life: fin.dur + 0.2, z: 9, d: { hit: false },
      follow(e) { e.x = gx - 140; e.y = gb - 170; e.w = 280; e.h = 180; },
      start(e, ww) { ww.fx.burst('magic', gx, gb - 40, 12, { color: c, speed: 140 }); },
      tick(e, ww) {
        snap.moveT = Math.min(e.lt, fin.dur); snap.t = p.t;
        if (!e.d.hit && e.lt >= (fin.hit?.[0] ?? 0.1)) {
          e.d.hit = true;
          const rx = fc > 0 ? gx + box.x : gx - box.x - box.w;
          playerStrike(ww, { x: rx, y: gb + box.y, w: Math.max(box.w, 110), h: box.h }, tatk(p, { mv: 1.4, kb: [300, -260], hitstop: 0.06, shake: 4, dir: fc }));
          if (fin.slash) ww.fx.slash(gx + fc * 10, gb - 58, fc > 0 ? fin.slash.angle ?? 0 : Math.PI - (fin.slash.angle ?? 0), { radius: fin.slash.r * 1.1, arc: fin.slash.arc, width: fin.slash.width, color: c, life: 0.2 });
          else xSlash(ww, gx + fc * 70, gb - 60, 50, c, 0.25);
          if (fin.proj) { const pa = fc > 0 ? 0 : Math.PI; for (let k = -1; k <= 1; k++) bullet(ww, p, gx + fc * 44, gb - 60, pa + k * 0.12, { mv: 0.8, color: c }); }
          audio.sfx(fin.sfx ?? 'slash_heavy', { vol: 0.6, pitch: 1.1 });
        }
      },
      draw(ctx, e, ww) {
        const a = Math.min(1, e.lt * 8) * clamp((e.life - e.lt) / 0.2, 0, 1);
        drawHero(ctx, snap, ww, { alpha: 0.75 * a, tint: c });
      },
      light(L) { L.add(gx, gb - 44, 90, c, 0.6); },
    });
  });
};

/** 얼어붙은 적 위에 얼음 결정 */
function freezeOverlay(w, en, T) {
  fx(w, {
    life: T, z: 11,
    follow(e) { const hb = en.hurtbox ? en.hurtbox() : en; e.x = hb.x - 10; e.y = hb.y - 10; e.w = hb.w + 20; e.h = hb.h + 20; e.d.hb = hb; if (en.dead || en.dying > 0) e.dead = true; },
    draw(ctx, e) {
      const hb = e.d.hb, a = Math.min(1, e.lt * 6) * clamp((e.life - e.lt) / 0.3, 0, 1);
      if (!hb) return;
      ctx.globalCompositeOperation = ADD;
      const g = ctx.createLinearGradient(hb.x, hb.y, hb.x + hb.w, hb.y + hb.h);
      g.addColorStop(0, rgba('#e8fcff', 0.5 * a)); g.addColorStop(0.5, rgba('#9fe8ff', 0.25 * a)); g.addColorStop(1, rgba('#4aa8ff', 0.4 * a));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(hb.x - 4, hb.y + hb.h); ctx.lineTo(hb.x - 8, hb.y + hb.h * 0.35); ctx.lineTo(hb.x + hb.w * 0.3, hb.y - 8); ctx.lineTo(hb.x + hb.w * 0.75, hb.y - 2); ctx.lineTo(hb.x + hb.w + 8, hb.y + hb.h * 0.4); ctx.lineTo(hb.x + hb.w + 4, hb.y + hb.h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.8 * a); ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hb.x + hb.w * 0.3, hb.y - 8); ctx.lineTo(hb.x + hb.w * 0.45, hb.y + hb.h * 0.6); ctx.lineTo(hb.x + hb.w * 0.75, hb.y - 2); ctx.stroke();
    },
  });
}
SKILL_IMPL.tech_freeze = (p, w) => {
  if (!spendMp(p, w, 18)) return false;
  const c = charCol(p), R = 210, T = 2.0;
  pose(p, w, 'cast_up', 0.45, { h0: 0.1, sfx: 'ice' });
  audio.sfx('ice'); audio.sfx('ice', { pitch: 0.6 });
  w.game.flash('#bff4ff', 0.4, 4); shake(w, 7, 0.25);
  const targets = enemiesIn(w, circ(p.cx, p.cy, R));
  playerStrike(w, circ(p.cx, p.cy, R), tatk(p, { mv: 1.6, element: 'ice', kb: [0, 0], stun: T, hitstop: 0.1, shake: 5 }));
  for (const en of targets) if (en.kind === 'enemy') freezeOverlay(w, en, T);
  w.fx.burst('ice', p.cx, p.cy, 40, { speed: 420 });
  fx(w, {
    life: 0.7, z: 12, x: p.cx - R * 1.3, y: p.cy - R * 1.3, w: R * 2.6, h: R * 2.6, d: { cx: p.cx, cy: p.cy },
    draw(ctx, e) {
      const k = ease.outCubic(Math.min(1, e.lt / 0.25)), a = 1 - e.k, cx = e.d.cx, cy = e.d.cy;
      ctx.globalCompositeOperation = ADD;
      glow(ctx, cx, cy, R * (0.4 + k * 0.8), '#9fe8ff', 0.5 * a);
      ctx.strokeStyle = rgba('#e8fcff', 0.9 * a); ctx.lineWidth = 4 * a + 1;
      ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const t = i / 12 * TAU, r0 = R * k * 0.3, r1 = R * k * (0.85 + (i % 2) * 0.2);
        cutLine(ctx, cx + Math.cos(t) * r0, cy + Math.sin(t) * r0, cx + Math.cos(t) * r1, cy + Math.sin(t) * r1, 6, i % 3 === 0 ? c : '#bff4ff', a);
      }
    },
    light(L, e) { L.add(e.d.cx, e.d.cy, R * 1.6, '#9fe8ff', 1.3 * (1 - e.k)); },
  });
};

SKILL_IMPL.tech_grandcross = (p, w) => {
  if (!spendMp(p, w, 50)) return false;
  const c = charCol(p), cam = w.camera;
  const cx = clamp(p.cx, cam.x + 160, cam.x + cam.vw - 160), cy = clamp(p.cy - 30, cam.y + 120, cam.y + cam.vh - 100);
  pose(p, w, 'cast_up', 0.9, { h0: 0.15, hw: 0.6, sfx: 'holy' });
  audio.sfx('bell'); audio.sfx('holy', { pitch: 0.7 });
  w.game.flash('#fff8e0', 0.5, 3);
  const hitRect = () => [{ x: cam.x - 20, y: cy - 70, w: cam.vw + 40, h: 140 }, { x: cx - 70, y: cam.y - 20, w: 140, h: cam.vh + 40 }];
  fx(w, {
    life: 1.3, z: 12, d: { n: 0 },
    follow(e) { e.x = cam.x; e.y = cam.y; e.w = cam.vw; e.h = cam.vh; },
    tick(e, ww) {
      const want = Math.min(6, Math.floor(e.lt / 0.14));
      while (e.d.n < want) {
        const k = e.d.n++, last = k === 5;
        const a = tatk(p, { mv: last ? 2.6 : 0.8, element: 'holy', breakWalls: false, hitId: nid('gc'), kb: last ? [300, -500] : [40, -160], hitstop: last ? 0.2 : 0.04, shake: last ? 14 : 3 });
        for (const r of hitRect()) playerStrike(ww, r, a);
        if (last) { ww.game.flash('#ffffff', 0.8, 2.5); ww.camera.punchZoom(1.1, 0.25); audio.sfx('explode'); ww.fx.burst('holy', cx, cy, 50, { speed: 520 }); }
        else audio.sfx('holy', { vol: 0.5, pitch: 1 + k * 0.1 });
      }
    },
    draw(ctx, e) {
      const g = ease.outCubic(clamp(e.lt / 0.18, 0, 1)), fade = clamp((e.life - e.lt) / 0.4, 0, 1), fl = e.lt > 0.7 && e.lt < 0.9 ? 1.8 : 1;
      const th = 30 * fl * fade;
      ctx.globalCompositeOperation = ADD;
      beamV(ctx, cx, cy - cam.vh * g, cy + cam.vh * g, th * 1.8, c, 0.6 * fade);
      beamV(ctx, cx, cy - cam.vh * g, cy + cam.vh * g, th * 0.6, '#ffffff', fade, '#ffffff');
      beamH(ctx, cx - cam.vw * g, cx + cam.vw * g, cy, th * 1.8, c, 0.6 * fade);
      beamH(ctx, cx - cam.vw * g, cx + cam.vw * g, cy, th * 0.6, '#ffffff', fade, '#ffffff');
      flare(ctx, cx, cy, 200 * g * fl, c, fade, e.lt);
      glow(ctx, cx, cy, 140, '#ffffff', 0.7 * fade);
    },
    light(L) { L.add(cx, cy, 600, c, 1.4); },
  });
};

// ═══════════════════════════ 직업 휘두르기 특성 ═══════════════════════════
let _busHooked = false;
function hookBus() {
  if (_busHooked) return;
  _busHooked = true;
  // 성전 기사: 피격 시 20% 확률로 성광 폭발
  bus.on('playerHurt', () => {
    const w = game.world, p = w?.player;
    if (!p || p.dead || p.hero?.classId !== 'kael_templar' || Math.random() >= 0.2) return;
    boom(w, p, p.cx, p.cy, 130, { mv: 1.6, element: 'holy', c1: '#ffd870', c2: '#fff8e0', shake: 6, sfx: 'holy', atk: { tags: ['skill'] } });
    w.fx.text(p.cx, p.y - 30, '성광 반격!', { color: '#fff2b0', size: 18 });
  });
}
/** 방금 발사된(아직 한 프레임도 안 지난) 플레이어 탄환 목록 */
function freshShots(w, p) {
  const out = [];
  for (let i = w.entities.length - 1; i >= 0 && out.length < 12; i--) {
    const e = w.entities[i];
    if (e.kind === 'projectile' && e.owner === p && e.t === 0 && !e.dead) out.push(e);
  }
  return out;
}
function tipOf(p, mv) {
  const b = mv.box, reach = 1 + (p.stats.reach ?? 0) / 100;
  if (!b) return { x: p.cx + p.facing * 60, y: p.bottom - 60 };
  const far = b.x >= 0 ? b.x + b.w * reach : b.x + b.w;
  return { x: p.cx + p.facing * far * 0.95, y: p.bottom + b.y + b.h / 2 };
}
SKILL_IMPL.__onSwing = (p, w, mv) => {
  if (!mv || mv.skill) return;
  hookBus();
  const c = p.hero?.classId;
  if (!c) return;
  const fin = !!mv.finisher, f = p.facing;
  switch (c) {
    case 'kael_crusader': case 'kael_templar': case 'kael_inquisitor': {
      if (!mv.box) break;
      const tp = tipOf(p, mv);
      w.fx.burst('holy', tp.x, tp.y, 4, { speed: 120 });
      playerStrike(w, p.relRect(mv.box.x, mv.box.y, mv.box.w * (1 + (p.stats.reach ?? 0) / 100), mv.box.h), atk(p, { mv: (mv.mv ?? 1) * 0.3, element: 'holy', hitId: p.curHitId + 'h', kb: [60, -40], hitstop: 0, shake: 0, tags: ['melee'] }));
      if (c === 'kael_inquisitor') {
        setTimeoutFx(w, 0.03, (ww) => boom(ww, p, tp.x, tp.y, fin ? 90 : 55, { mv: (mv.mv ?? 1) * (fin ? 1.2 : 0.6), element: 'fire', c1: '#ff6a1a', c2: '#fff2b0', shake: fin ? 6 : 2, sfx: 'fire', atk: { tags: ['melee'], hitId: p.curHitId + 'f' } }));
      }
      break;
    }
    case 'kael_nightraven': {
      if (p.onGround || !mv.box) break;
      for (const s of [-1, 1]) {
        const ang = (f > 0 ? 0 : Math.PI) + s * 0.18;
        shoot(w, p, { x: p.cx + f * 20, y: p.cy - 10, vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, w: 16, h: 8, scale: 0.9, render: featherRenderD, life: 0.4, pierce: 1, attack: atk(p, { mv: 0.35, element: 'dark', kb: [60, -40], hitstop: 0.02, shake: 0 }) });
      }
      break;
    }
    case 'kael_bloodhunter': {
      if (p.hp < p.stats.hp * 0.5) { const tp = tipOf(p, mv); w.fx.burst('blood', tp.x, tp.y, 6, { speed: 160, color: '#ff2040' }); }
      break;
    }
    case 'sera_archmage': {
      for (const s of freshShots(w, p)) s.pierce = 99;
      break;
    }
    case 'sera_stormcaller': {
      if (Math.random() < 0.15) {
        const en = w.nearestEnemy(p.cx, p.cy, 420);
        if (en) strikeBolt(w, p, en.cx, Math.max(w.camera.y + 10, en.cy - 300), 1.2, 0.9, '#bfe0ff', en.cy);
      }
      break;
    }
    case 'victor_phantom': {
      for (const s of freshShots(w, p)) { s.pierce = 99; s.color = '#9ab0ff'; }
      break;
    }
    case 'victor_desperado': case 'victor_hellfire': case 'victor_gunlord': {
      const shots = freshShots(w, p);
      if (fin && mv.proj) {
        const g = gunOf(p);
        for (let k = 0; k < 4; k++) bullet(w, p, g.x, g.y, (f > 0 ? 0 : Math.PI) + rand(-0.3, 0.3), { mv: 0.5, speed: rand(1300, 1700), life: 0.3, kb: [200, -100] });
      }
      if (c === 'victor_gunlord' && mv.proj && shots.length) {
        const s = shots[0], ang = Math.atan2(s.vy, s.vx) + rand(-0.08, 0.08);
        bullet(w, p, s.cx, s.cy + rand(-4, 4), ang, { mv: (mv.proj.mv ?? mv.mv ?? 0.6) * 0.7, color: '#ffd84a' });
      }
      if (c === 'victor_hellfire') {
        for (const s of freshShots(w, p)) {
          s.color = '#ff8a3a'; s.trail = 'fire'; s.trailRate = 0.04; s.trailOpts = { size: 6 };
          const big = fin;
          const prev = s.onExpire;
          s.onExpire = (pr, ww, byHit) => { prev?.(pr, ww, byHit); if (byHit || big) boom(ww, p, pr.cx, pr.cy, big ? 80 : 34, { mv: big ? 1.4 : 0.35, element: 'fire', shake: big ? 6 : 1, sfx: big ? 'explode' : 'fire', atk: { tags: ['projectile'] } }); };
        }
      }
      break;
    }
    case 'bran_warlord': {
      const tier = Math.min(10, Math.floor((w.combo?.n ?? 0) / 10));
      if (tier > 0) {
        w.fx.burst('fire', p.cx + f * 40, p.cy - 10, 2 + tier, { color: '#ff5020', speed: 160 + tier * 20 });
        if (fin) { w.fx.ring(p.cx, p.cy, { color: '#ff7a3a', r0: 20, r1: 80 + tier * 12, life: 0.3, width: 4 + tier * 0.5 }); w.fx.text(p.cx, p.y - 24, `전의 +${tier * 5}%`, { color: '#ff9a4a', size: 15, life: 0.7 }); }
      }
      break;
    }
    case 'lia_ninja': case 'lia_shadowmaster': case 'lia_kunoichi': {
      if (mv.id === 'dgDash' || mv.anim === 'thrust' && mv.lunge > 400) {
        for (let k = -1; k <= 1; k++) {
          const ang = (f > 0 ? 0 : Math.PI) + k * 0.15;
          shoot(w, p, { x: p.cx + f * 20, y: p.bottom - 56, vx: Math.cos(ang) * 1000, vy: Math.sin(ang) * 1000, w: 18, h: 18, scale: 0.9, spin: 30, render: shurikenRender, life: 0.5, pierce: 2, attack: atk(p, { mv: 0.4, kb: [80, -40], hitstop: 0.02, shake: 0, tags: ['melee'] }) });
        }
      }
      if (c === 'lia_shadowmaster' && mv.box) {
        const snap = p.snapshot(), m2 = mv, hid = p.curHitId + 's';
        const gx = p.cx - f * 34;
        snap.x -= f * 34; snap.cx = gx; snap.moveT = 0;
        fx(w, {
          delay: 0.07, life: (mv.dur ?? 0.3) + 0.08, z: 9,
          follow(e) { e.x = gx - 120; e.y = p.y - 60; e.w = 240; e.h = p.h + 80; },
          tick(e, ww) {
            snap.moveT = e.lt;
            if (!e.d.hit && e.lt >= (m2.hit?.[0] ?? 0.05)) {
              e.d.hit = true;
              const b = m2.box, rx = f > 0 ? gx + b.x : gx - b.x - b.w * 1.2;
              playerStrike(ww, { x: rx, y: snap.bottom + b.y, w: b.w * 1.2, h: b.h }, atk(p, { mv: (m2.mv ?? 1) * 0.45, element: 'dark', hitId: hid, kb: [100, -60], hitstop: 0.02, shake: 1, tags: ['melee'] }));
              if (m2.slash) ww.fx.slash(gx + f * 10, snap.bottom - 58, f > 0 ? m2.slash.angle ?? 0 : Math.PI - (m2.slash.angle ?? 0), { radius: m2.slash.r, arc: m2.slash.arc, width: m2.slash.width, color: '#b060ff', life: 0.13 });
            }
          },
          draw(ctx, e, ww) { drawHero(ctx, snap, ww, { alpha: 0.55 * clamp((e.life - e.lt) / 0.15, 0, 1), tint: '#6a2aaa' }); },
        });
      }
      break;
    }
    case 'lia_bladedancer': {
      p._bdN = (p._bdN ?? 0) + 1;
      if (p._bdN % 4 === 0) {
        audio.sfx('slash_heavy', { pitch: 1.5 });
        for (let i = 0; i < 4; i++) {
          shoot(w, p, {
            x: p.cx, y: p.cy, w: 22, h: 22, scale: 1, behavior: 'orbit', orbitA: i / 4 * TAU, orbitR: 64, orbitSpeed: 12 * f, life: 0.6,
            pierce: 999, collideWalls: false, render: daggerRender, attack: atk(p, { mv: 0.4, rehit: 0.15, kb: [160, -120], hitstop: 0.02, shake: 1, tags: ['melee'] }),
          });
        }
        w.fx.ring(p.cx, p.cy, { color: '#ffd84a', r0: 20, r1: 80, life: 0.3, width: 3 });
      }
      break;
    }
    case 'azel_nosferatu': {
      p._nosN = (p._nosN ?? 0) + 1;
      if (fin || p._nosN % 3 === 0) {
        for (let i = 0; i < (fin ? 3 : 1); i++) {
          const ang = -Math.PI / 2 + f * rand(0.3, 1.2);
          shoot(w, p, {
            x: p.cx - f * 10, y: p.cy - 20, vx: Math.cos(ang) * 380, vy: Math.sin(ang) * 380, w: 22, h: 16, scale: 0.8, render: batRender,
            behavior: 'homing', speed: 540, homingTurn: 7, homingDelay: 0.15, life: 1.6, pierce: 1, collideWalls: false,
            attack: atk(p, { mv: 0.5, type: 'mag', element: 'dark', kb: [60, -80], hitstop: 0.02, shake: 0, tags: ['melee'] }),
            onHit: () => p.heal(p.stats.hp * 0.004, false),
          });
        }
        if (fin) audio.sfx('bat', { vol: 0.5 });
      }
      break;
    }
    case 'azel_seraph': {
      if (fin) {
        for (let i = 0; i < 4; i++) {
          const holy = i % 2 === 0, ang = (f > 0 ? 0 : Math.PI) + (i - 1.5) * 0.18;
          shoot(w, p, { x: p.cx, y: p.cy - 16, vx: Math.cos(ang) * 800, vy: Math.sin(ang) * 800, w: 16, h: 16, render: holy ? featherRenderL : featherRenderD, life: 0.5, pierce: 1, attack: atk(p, { mv: 0.5, element: holy ? 'holy' : 'dark', kb: [60, -40], hitstop: 0.02, shake: 0, tags: ['melee'] }) });
        }
      }
      break;
    }
  }
};

// ═══════════════════════════ FXKIT (필살기·각성기 연출 도우미) ═══════════════════════════
// feel §9 WP4: 이 파일에 이미 있는 도구만 모은다 (새 동작 없음). 각성 감독(AWAKEN-DIR-A/B)·awaken.js 가 import 해서 쓴다.
// FXKIT 이 비어 있지 않으면 awaken.js 는 등록된 영웅 감독을 쓰고, 감독이 없는 영웅은 자체 대체 연출을 그대로 쓴다.
// const 들이 모두 정의된 뒤 채우도록 파일 끝에 둔다 (위의 자리 표시 export 를 그대로 채운다).
Object.assign(FXKIT, {
  // feel §9 WP4 목록
  fx, seq, glow, beamV, beamH, crescent, cutLine, runeCircle, flare, boomRing, pillarFx, spikeFx, afterimage, ghostOf,
  uHit, atk, viewRect, enemiesIn, groundAt, pose, holdInvuln, charCol, bestType, ADD, batShape, wing, bloodMoon, cardShape, gunOf, muzzle,
  // 그 밖의 기존 도구 (연출 엔티티·판정·도형)
  SkillFx, shoot, shake, circ, nid, frontEnemies, maxHpOf, solidAt, freeSpot, boom, spike, flameCol, fireColumn,
  boltPts, strokePts, drawBolt, strikeBolt, xSlash, bigSword, ravenShape, featherShape, drawAngel, drawClock,
  shieldShape, scytheShape, spectralSword, setTimeoutFx, handOf, aimAng, bullet, ROCK, BLOOD,
  // 필살기 공용 도구 (FX-ULTS): 문맥·기본 줌 화면·키트 박자·불씨 비·색조·잔상·캐시 스프라이트
  ultCtx, ultView, ultBeat, ultFinal, ultDirector, ultAfter, emberRain, grade, holdOverlay, spiralMotes, glassRose,
  glowSprite, beamSprite, blit, kitLive, qn,
});
