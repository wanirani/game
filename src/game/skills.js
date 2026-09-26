// 스킬 런타임: 액티브 스킬 48종 · 캐릭터별 필살기 6종 · 비전서 커맨드 기술 11종 · 직업 휘두르기 특성
// 공개 API
//  SKILL_IMPL[skillId] = (player, world, level) => boolean(시전 성공, false 면 MP/쿨타임 소모 안 함)
//  castSkill(player, world, skillId, level), castUltimate(player, world), castTechnique(player, world, tech)
//  SKILL_IMPL.__onSwing(player, world, move) : 일반 공격 판정 시작 시 직업 특성 연출/효과
// 원칙: 레벨이 오를수록 위력뿐 아니라 크기·개수·지속 시간이 눈에 띄게 커진다("스킬 확대").
import { audio } from '../core/audio.js';
import { TAU, rand, clamp, lerp, ease, rgba, overlap } from '../core/math.js';
import { T, isSolidType } from '../core/physics.js';
import { TILE } from '../core/game.js';
import { bus } from '../core/events.js';
import { Entity } from './entity.js';
import { playerStrike, hitTarget } from './combat.js';
import { SKILLS, skillVal } from '../data/skills.js';
import { CHARACTERS } from '../data/characters.js';
import { drawHero } from '../render/hero.js';

export const SKILL_IMPL = {};
const ULTS = {};

// ═══════════════════════════ 공개 API ═══════════════════════════
export function castSkill(p, world, id, lv) {
  const fn = SKILL_IMPL[id];
  if (!fn) return false;
  return fn(p, world, Math.max(1, lv || 1)) !== false;
}

/** 필살기: run.sp ≥ 100 일 때 player 가 호출 */
export function castUltimate(p, world) {
  if ((p.run.sp ?? 0) < 100 || world.cutscene) return false;
  p.run.sp = 0;
  p.endMove?.();
  world.startUltimate?.(p);
  audio.sfx('ult');
  world.game.flash('#ffffff', 0.7, 3);
  const fn = ULTS[p.hero.charId] || ULTS.kael;
  fn(p, world);
  return true;
}

/** 비전서 커맨드 기술 */
export function castTechnique(p, world, tech) {
  const fn = SKILL_IMPL[tech?.id];
  if (!fn) return false;
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

/** 스킬 공격 객체 */
function atk(p, o = {}) {
  return {
    owner: p, team: 'player', stats: p.stats, mv: 1, type: p.hero.charId === 'sera' ? 'mag' : 'phys', element: null,
    dir: p.facing, kb: [220, -220], hitstop: 0.06, shake: 3, hitId: nid(), mult: p.dmgMul, tags: ['skill'], crit: 0, ...o,
  };
}
const circ = (x, y, r) => ({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
function shake(w, m, t = 0.25) { w.camera.shake(m * (w.game.settings?.screenShake ?? 1), t); }
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
function glow(ctx, x, y, r, col, a = 1) {
  if (r <= 1 || a <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.35, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
/** 세로 빛기둥 */
function beamV(ctx, x, y0, y1, w, col, a = 1, core = '#ffffff') {
  if (a <= 0.01 || w <= 0.5) return;
  const g = ctx.createLinearGradient(x - w, 0, x + w, 0);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.22, rgba(col, 0.22 * a)); g.addColorStop(0.4, rgba(col, 0.75 * a));
  g.addColorStop(0.5, rgba(core, a)); g.addColorStop(0.6, rgba(col, 0.75 * a)); g.addColorStop(0.78, rgba(col, 0.22 * a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - w, y0, w * 2, y1 - y0);
}
/** 가로 빛줄기 */
function beamH(ctx, x0, x1, y, h, col, a = 1, core = '#ffffff') {
  if (a <= 0.01 || h <= 0.5) return;
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
/** 깃털 날개 (원점=어깨, +x 방향으로 펼침). spread 0~1 */
function wing(ctx, s, spread, col, col2, a = 1, dark = false) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = dark ? 'source-over' : ADD;
  const n = 7;
  for (let i = n - 1; i >= 0; i--) {
    const t = i / (n - 1);
    const ang = lerp(-0.25, -1.35, t) * spread + lerp(0.9, 0.6, t) * (1 - spread) - 0.1;
    const len = s * lerp(1.0, 0.55, t) * (0.6 + 0.4 * spread);
    ctx.save(); ctx.rotate(ang);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, rgba(col2, 0.95 * a)); g.addColorStop(0.7, rgba(col, 0.85 * a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(len * 0.5, 0, len * 0.52, s * 0.085 * (1.2 - t * 0.4), 0, 0, TAU); ctx.fill();
    if (dark) { ctx.strokeStyle = rgba(col2, 0.6 * a); ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
  }
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
    delay, life: 0.62, z: 9, x: x - wd * 2, y: base - h - 20, w: wd * 4, h: h + 30, atk: a, win: [0, 0.3],
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
      if (style.glow) { ctx.globalCompositeOperation = ADD; glow(ctx, x, base - h * 0.4 * up, h * 0.8, style.glow, 0.45 * fade); }
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

function pillarFx(w, p, x, base, W, mv, delay, life, col) {
  const top = w.camera.y - 60;
  return fx(w, {
    delay, life, z: 11, x: x - W * 2, y: top, w: W * 4, h: base - top + 20,
    atk: atk(p, { mv, element: 'holy', rehit: 0.12, kb: [60, -280], hitstop: 0.04, shake: 2 }), win: [0.22, 0.85],
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

function strikeBolt(w, p, x, cy, mv, s, col = '#bfe0ff') {
  const base = groundAt(w, x, cy + 40, 12 * TILE) ?? p.bottom;
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
      drawBolt(ctx, e.d.pts, col, 5 * s, a);
      glow(ctx, x, base, 80 * s, col, a * 0.8);
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
        strikeBolt(ww, p, x, e.d.cy + 20, mv, s);
      }
    },
    draw(ctx, e) {
      const a = Math.min(1, e.lt * 4) * Math.min(1, (e.life - e.lt) * 3), cx = e.d.cx, cy = e.d.cy;
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 9; i++) {
        const ox = Math.sin(i * 2.3) * 150 * s + Math.sin(e.lt * 1.5 + i) * 8, oy = Math.cos(i * 1.7) * 18, rr = (58 + (i % 3) * 18) * s;
        const g = ctx.createRadialGradient(cx + ox, cy + oy - rr * 0.3, rr * 0.1, cx + ox, cy + oy, rr);
        g.addColorStop(0, rgba('#4a4a6e', 0.92 * a)); g.addColorStop(0.7, rgba('#1a1828', 0.85 * a)); g.addColorStop(1, rgba('#0a0a14', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx + ox, cy + oy, rr, rr * 0.55, 0, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = ADD;
      glow(ctx, cx, cy + 24, 230 * s, '#8ab0ff', (0.12 + e.d.flash * 0.6) * a);
    },
    light(L, e) { L.add(e.d.cx, e.d.cy + 30, 260 * s, '#8ab0ff', 0.4 + e.d.flash); },
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
