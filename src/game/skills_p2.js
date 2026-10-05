// 2부 비전서 커맨드 기술 (world2 §8, owner: ITEMS-P2)
//  SKILL_IMPL_P2[techId] = (player, world, level) => boolean   → skills.js 가 SKILL_IMPL 에 합친다
//  TECH_NAMES_P2[techId] = '이름'                              → skills.js 가 TECH_NAMES 에 합친다
//   · tech_mirror 경영참 (d21, ↓↗+공격, MP 20): 0.25초 무적, 등 뒤에 은빛 거울 분신이 나타나 앞뒤를 동시에 벤다
//   · tech_whirl  와류참 (d23, ↑↑+공격, MP 25): 140px 앞에 0.9초 소용돌이 — 220px 안의 일반 적을 끌어모아 6연타
//   · tech_purge  정화의 불꽃 (d26, ↑→+공격, MP 30): 120px 앞에 신성한 불기둥 5연타 — 포자 주머니를 태우고 부패 게이지 −50
// 규칙: skills.js 를 import 하지 않는다 (순환 금지 — skills.js 가 이 파일을 import 한다). 필요한 작은 도구는 여기서 다시 만든다.
//       모듈 최상위에서 import 한 값을 읽지 않는다 (ARCHITECTURE.md 순환 import 규칙).
import { audio } from '../core/audio.js';
import { TAU, rand, clamp, ease, rgba } from '../core/math.js';
import { isSolidType } from '../core/physics.js';
import { TILE } from '../core/game.js';
import { Entity } from './entity.js';
import { playerStrike } from './combat.js';
import { CHARACTERS } from '../data/characters.js';
import { drawHero } from '../render/hero.js';
import * as HFX from '../render/hitfx.js';   // 색별 캐시 스프라이트 (soft) — 매 프레임 그라디언트를 만들지 않는다 (MASTER_PLAN R12)

export const TECH_NAMES_P2 = { tech_mirror: '경영참', tech_whirl: '와류참', tech_purge: '정화의 불꽃' };

// ═══════════════════════════ 작은 도구 (skills.js 의 같은 이름 도구와 동작이 같다) ═══════════════════════════
const ADD = 'lighter';
let _sid = 0;
const nid = (s = 'p2t') => s + (++_sid);
const charCol = (p) => CHARACTERS[p.hero?.charId]?.ult?.color ?? '#fff2b0';
const bestType = (p) => ((p.stats?.mag ?? 0) > (p.stats?.atk ?? 0) ? 'mag' : 'phys');
const q = (w) => clamp(w.fx?.quality ?? 1, 0.3, 1);

/** 비전서 기술 공격 객체 (skills.js tatk 와 같은 모양) */
function tatk(p, o = {}) {
  return {
    owner: p, team: 'player', stats: p.stats, mv: 1, type: bestType(p), element: null,
    dir: p.facing, kb: [220, -220], hitstop: 0.06, shake: 3, hitId: nid(), mult: p.dmgMul, tags: ['skill', 'tech'], crit: 0, ...o,
  };
}
function spendMp(p, w, cost) {
  if ((p.mp ?? 0) < cost) { w.game?.toast?.('MP가 부족하다', '#5aa8ff', 1); audio.sfx('menu_cancel', { vol: 0.3 }); return false; }
  p.mp -= cost;
  return true;
}
const WANIM = {
  whip: { slash: 'lash', up: 'launch', wide: 'spin' },
  sword: { slash: 'slash_down', up: 'uppercut', wide: 'slash_wide' },
  greatsword: { slash: 'heavy_down', up: 'heavy_up', wide: 'heavy_spin' },
  dagger: { slash: 'stab', up: 'uppercut', wide: 'spin_blade' },
  gun: { slash: 'shoot_double', up: 'shoot_up', wide: 'spin_blade' },
  staff: { slash: 'staff_swing', up: 'staff_swing_up', wide: 'spin_blade' },
  spear: { slash: 'slash_wide', up: 'launch', wide: 'slash_wide' },
};
const wa = (p, k) => (WANIM[p.stats?.weaponType] || WANIM.sword)[k];
/** 스킬 시전 자세: 판정 없는 가짜 move 로 렌더러 포즈만 구동 */
function pose(p, w, anim, dur = 0.36, o = {}) {
  const h0 = o.h0 ?? dur * 0.28;
  const mv = { id: 'sk_' + anim, anim, dur, hit: [h0, h0 + (o.hw ?? 0.08)], box: null, skill: true, sfx: o.sfx ?? 'magic', cancel: o.cancel ?? dur * 0.8, mv: 0 };
  p.startMove?.(w, mv);
  return mv;
}
/** x 열에서 y 아래로 가장 가까운 지면(px). 없으면 null */
function groundAt(w, x, y, maxDrop = 7 * TILE) {
  const m = w.map;
  if (!m?.groundBelow) return null;
  const tx = Math.floor(x / TILE);
  let ty = Math.floor(y / TILE), g = 0;
  while (ty > 0 && isSolidType(m.typeAt(tx, ty)) && g++ < 6) ty--;
  const gy = m.groundBelow(tx, Math.max(0, ty));
  if (gy === null || gy === undefined || gy - y > maxDrop) return null;
  return gy;
}
/** 부드러운 원형 빛: 캐시 스프라이트(hitfx soft)를 늘여 그린다. rx/ry 를 따로 주면 타원 */
function glow(ctx, x, y, r, col, a = 1, ry = r) {
  if (r <= 1 || a <= 0.01) return;
  const spr = HFX.soft?.(col);
  if (spr) {
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * Math.min(1, a * 0.8);
    ctx.drawImage(spr, x - r, y - ry, r * 2, ry * 2);
    ctx.globalAlpha = ga;
    return;
  }
  if (ry !== r) return;   // 스프라이트를 못 구운 프레임(굽기 상한)에는 타원 빛을 생략한다
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.35, rgba(col, a * 0.45)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
/** 빛의 칼선 (가운데가 두꺼운 마름모) */
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

/**
 * 연출·판정 엔티티 (skills.js SkillFx 와 같은 계약).
 * o: { x,y,w,h, life, delay, z, atk, win:[시작,끝](수명 비율), rect(e)→판정 사각형, start, follow, tick, end, onHit, draw, light, d }
 */
class TechFx extends Entity {
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
        if (world.game?.debug) world.debugRects?.push(r);
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
const fx = (w, o) => w.add(new TechFx(o));

// ═══════════════════════════ 경영참 (tech_mirror) ═══════════════════════════
const MIRROR = '#dff4ff', MIRROR2 = '#8fe6ff';
/** 은빛 거울 칼선: 원점 기준 dir 방향으로 휘어지는 초승달 궤적 */
function mirrorArc(ctx, x, y, dir, u, a) {
  if (a <= 0.01) return;
  const R = 92, a0 = -1.25, a1 = 0.95, cur = a0 + (a1 - a0) * ease.outCubic(clamp(u, 0, 1));
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.globalCompositeOperation = ADD; ctx.lineCap = 'round';
  for (let k = 3; k >= 0; k--) {
    const t = cur - k * 0.16;
    if (t < a0) continue;
    ctx.strokeStyle = rgba(k ? MIRROR2 : '#ffffff', a * (1 - k * 0.22));
    ctx.lineWidth = (k ? 16 : 5) * (1 - k * 0.15);
    ctx.beginPath(); ctx.arc(0, 0, R - k * 4, Math.max(a0, t - 0.7), t); ctx.stroke();
  }
  ctx.restore();
}

function techMirror(p, w) {
  if (!spendMp(p, w, 20)) return false;
  const f = p.facing, c = charCol(p), anim = wa(p, 'slash');
  const mv = pose(p, w, anim, 0.42, { h0: 0.09, hw: 0.12, sfx: 'slash_heavy' });
  audio.sfx('slash_heavy'); audio.sfx('mist', { pitch: 1.6 });
  // 등 뒤의 거울 분신 (반대편을 본다, α 0.6, lighter)
  const snap0 = p.snapshot?.() ?? null;
  const snap = snap0 ? Object.assign(snap0, { facing: -f, move: mv, moveT: 0, anim, onGround: p.onGround }) : null;
  const HIT = 0.09, LIFE = 0.55, IFR = 0.25;
  p.iframes = Math.max(p.iframes ?? 0, 0.075);   // 시전 프레임부터 무적 (아래 tick 이 0.25초 동안 유지)
  fx(w, {
    life: LIFE, z: 9, d: { hit: false, gx: p.cx - f * 34, gb: p.bottom },
    follow(e) { e.d.gx = p.cx - f * 34; e.d.gb = p.bottom; e.x = p.cx - 200; e.y = p.bottom - 180; e.w = 400; e.h = 200; },
    start(e, ww) {
      ww.fx.burst('ice', e.d.gx, p.bottom - 50, 10, { color: MIRROR, speed: 160 });
      ww.fx.ring(e.d.gx, p.bottom - 50, { color: MIRROR, r0: 6, r1: 60, life: 0.22, width: 3 });
    },
    tick(e, ww) {
      if (e.lt < IFR) p.iframes = Math.max(p.iframes ?? 0, 0.075);   // 0.25초 무적 (깜빡임 없는 값으로 유지)
      if (snap) {
        snap.moveT = Math.min(e.lt, mv.dur); snap.t = p.t;
        const s = snap;
        s.x = e.d.gx - p.w / 2; s.y = e.d.gb - p.h; s.cx = e.d.gx; s.bottom = e.d.gb;
      }
      if (!e.d.hit && e.lt >= HIT) {
        e.d.hit = true;
        // 앞뒤 동시 베기: 170×90 판정 두 개 (발 기준)
        const bottom = p.bottom, cx = p.cx;
        const front = { x: f > 0 ? cx - 10 : cx + 10 - 170, y: bottom - 95, w: 170, h: 90 };
        const back = { x: f > 0 ? cx + 10 - 170 : cx - 10, y: bottom - 95, w: 170, h: 90 };
        // hitId 공유: 두 판정에 모두 걸친 큰 적(보스 등)은 한 번만 맞는다 (앞 판정 우선 — 2.2 배가 두 번 들어가지 않게)
        const base = { mv: 2.2, hitstop: 0.08, shake: 5, kb: [340, -240], element: null, hitId: nid('mr') };
        const n1 = playerStrike(ww, front, tatk(p, { ...base, dir: f }));
        const n2 = playerStrike(ww, back, tatk(p, { ...base, dir: -f }));
        if (ww.game?.debug) ww.debugRects?.push(front, back);
        // 거울 파편
        const k = Math.round(12 * q(ww));
        ww.fx.burst('ice', cx + f * 90, bottom - 50, k, { color: MIRROR, speed: 320, add: true });
        ww.fx.burst('ice', cx - f * 110, bottom - 50, k, { color: MIRROR2, speed: 320, add: true });
        if (n1 + n2 > 0) { ww.camera?.shake?.(6, 0.18); audio.sfx('impact_crack', { vol: 0.6, pitch: 1.5 }); }
      }
    },
    draw(ctx, e, ww) {
      const a = Math.min(1, e.lt * 10) * clamp((e.life - e.lt) / 0.18, 0, 1);
      if (snap) {
        ctx.save(); ctx.globalCompositeOperation = ADD;
        drawHero(ctx, snap, ww, { alpha: 0.6 * a, tint: MIRROR });
        ctx.restore();
      }
      // 거울면 (분신과 영웅 사이의 얇은 은빛 판)
      const mx = p.cx - f * 16, top = p.bottom - p.h - 18;
      ctx.globalCompositeOperation = ADD;
      if (!e.d.pg) {   // 원점 기준 그라디언트를 한 번만 만들고 translate 로 옮겨 그린다
        e.d.pg = ctx.createLinearGradient(-6, 0, 6, 0);
        e.d.pg.addColorStop(0, rgba(MIRROR2, 0)); e.d.pg.addColorStop(0.5, rgba('#ffffff', 0.55)); e.d.pg.addColorStop(1, rgba(MIRROR2, 0));
      }
      ctx.save(); ctx.translate(mx, 0); ctx.globalAlpha *= clamp(a, 0, 1);
      ctx.fillStyle = e.d.pg; ctx.fillRect(-6, top, 12, p.h + 22);
      ctx.restore();
      if (e.lt >= HIT - 0.03) {
        const u = (e.lt - (HIT - 0.03)) / 0.14, fa = a * clamp(2 - u, 0, 1);
        if (u < 1.2) {   // 베는 순간의 은빛 섬광 (앞뒤)
          const fl = a * (1 - u / 1.2);
          glow(ctx, p.cx + f * 80, p.bottom - 52, 90, MIRROR, 0.5 * fl);
          glow(ctx, e.d.gx - f * 80, p.bottom - 52, 90, MIRROR2, 0.5 * fl);
        }
        mirrorArc(ctx, p.cx + f * 20, p.bottom - 52, f, u, fa);
        mirrorArc(ctx, e.d.gx - f * 20, p.bottom - 52, -f, u, fa);
        if (u < 1.5) cutLine(ctx, p.cx - f * 170, p.bottom - 50, p.cx + f * 170, p.bottom - 54, 5, c, fa * (1 - u / 1.5));
      }
    },
    end() { if ((p.iframes ?? 0) <= 0.075) p.iframes = 0; },
    light(L, e) { L.add(p.cx, p.bottom - 50, 150, MIRROR, 0.9 * (1 - e.k)); },
  });
  return true;
}

// ═══════════════════════════ 와류참 (tech_whirl) ═══════════════════════════
const TEAL = '#3ad0c8', TEAL2 = '#9ff4ee';
function techWhirl(p, w) {
  if (!spendMp(p, w, 25)) return false;
  const f = p.facing, c = charCol(p);
  pose(p, w, wa(p, 'wide'), 0.42, { h0: 0.08, hw: 0.2, sfx: 'splash' });
  audio.sfx('splash'); audio.sfx('mist', { pitch: 0.7, vol: 0.8 });
  const cx = p.cx + f * 140, cy = p.bottom - 56;
  const DUR = 0.9, HITS = 6, STEP = 0.12, H0 = 0.16, R_HIT = 110, R_PULL = 220, ACC = 900;
  fx(w, {
    life: DUR, z: 10, x: cx - R_PULL, y: cy - R_PULL, w: R_PULL * 2, h: R_PULL * 2, d: { n: 0, rot: 0 },
    start(e, ww) {
      ww.fx.burst('water', cx, cy, Math.round(16 * q(ww)), { speed: 260, color: TEAL2 });
      ww.fx.ring(cx, cy, { color: TEAL2, r0: R_PULL, r1: 30, life: 0.3, width: 5 });
    },
    tick(e, ww, dt) {
      e.d.rot += dt * 14 * f;
      // 끌어당김: 보스가 아닌 적만, kbResist 만큼 덜 끌린다 (고정형 제외)
      for (const en of ww.enemies()) {
        if (en.kind !== 'enemy' || en.def?.fixed) continue;
        const res = en.def?.kbResist ?? 0;
        if (res >= 1) continue;
        const dx = cx - en.cx, dy = cy - en.cy, dist = Math.hypot(dx, dy);
        if (dist > R_PULL || dist < 12) continue;
        const k = ACC * (1 - res) * dt, ux = dx / dist, uy = dy / dist;
        const cap = 380 * (1 - res);
        en.vx = clamp((Math.sign(en.vx) === Math.sign(ux) ? en.vx : en.vx * 0.3) + ux * k * 4, -cap, cap);
        if (en.noGravity) { en.vy = clamp((en.vy ?? 0) * 0.6 + uy * k * 4, -cap, cap); en.kbT = Math.max(en.kbT ?? 0, 0.1); }
        en.stun = Math.max(en.stun ?? 0, 0.12);   // 끌려가는 동안 AI 가 속도를 덮어쓰지 않게
      }
      // 6연타 (0.12초 간격)
      const want = Math.min(HITS, Math.max(0, Math.floor((e.lt - H0) / STEP) + 1));
      while (e.d.n < want) {
        const i = e.d.n++, last = i === HITS - 1;
        const r = { x: cx - R_HIT, y: cy - R_HIT, w: R_HIT * 2, h: R_HIT * 2 };
        const n = playerStrike(ww, r, tatk(p, {
          mv: 0.5, element: null, hitId: nid('wh'), fx: 'magic', dir: f,
          kb: last ? [320, -420] : [20, -120], launch: last, hitstop: last ? 0.06 : 0.02, shake: last ? 6 : 2,
        }));
        if (ww.game?.debug) ww.debugRects?.push(r);
        if (n) ww.fx.burst('water', cx + rand(-40, 40), cy + rand(-40, 40), Math.round(6 * q(ww)), { speed: 220, color: TEAL2 });
        audio.sfx(last ? 'splash' : 'slash', { vol: last ? 0.8 : 0.45, pitch: 1.1 + i * 0.06 });
        if (last) { ww.fx.ring(cx, cy, { color: TEAL2, r0: 20, r1: 150, life: 0.3, width: 6 }); ww.camera?.shake?.(6, 0.2); }
      }
      if (Math.random() < 0.6 * q(ww)) {
        const t = rand(0, TAU), rr = rand(60, R_PULL);
        ww.fx.emit('water', cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.6, { angle: t + Math.PI * 0.6 * f, spread: 0.2, speed: 220, color: TEAL2, grav: 0 });
      }
    },
    draw(ctx, e) {
      const grow = ease.outCubic(clamp(e.lt / 0.18, 0, 1)), a = grow * clamp((e.life - e.lt) / 0.22, 0, 1);
      if (a <= 0.01) return;
      ctx.globalCompositeOperation = ADD;
      glow(ctx, cx, cy, R_HIT * 1.5 * grow, TEAL, 0.45 * a);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.62); ctx.lineCap = 'round';
      // 소용돌이 팔 (나선) — 안쪽일수록 밝다
      for (let arm = 0; arm < 4; arm++) {
        const base = e.d.rot + arm * (TAU / 4);
        for (let s = 0; s < 5; s++) {
          const r0 = R_HIT * grow * (1.35 - s * 0.24), t0 = base + s * 0.55 * f;
          ctx.strokeStyle = rgba(s > 2 ? '#ffffff' : s > 0 ? TEAL2 : TEAL, a * (0.35 + s * 0.13));
          ctx.lineWidth = 12 - s * 2;
          ctx.beginPath(); ctx.arc(0, 0, Math.max(4, r0), t0, t0 + 0.9 * f, f < 0); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.strokeStyle = rgba(c, 0.5 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, R_HIT * grow, R_HIT * 0.62 * grow, 0, 0, TAU); ctx.stroke();
      glow(ctx, cx, cy, 34, '#ffffff', 0.55 * a);
    },
    light(L, e) { L.add(cx, cy, 200, TEAL, 1.1 * (1 - e.k * 0.6)); },
  });
  return true;
}

// ═══════════════════════════ 정화의 불꽃 (tech_purge) ═══════════════════════════
const DAWN = '#ffd070', DAWN2 = '#fff2b0';
/** 새벽빛 불기둥 (아래에서 위로 흘러 올라가는 불꽃 혀). d: 효과별 캐시 (가운데 기둥 그라디언트를 한 번만 만든다) */
function holyPillar(ctx, x, base, wd, h, t, a, d = {}) {
  if (a <= 0.01 || h < 4) return;
  ctx.globalCompositeOperation = ADD;
  glow(ctx, x, base, wd * 2.2, DAWN2, 0.6 * a, wd * 0.55);   // 발밑의 납작한 빛
  if (!d.cg || d.cgW !== wd) {
    const cg = ctx.createLinearGradient(-wd, 0, wd, 0);
    cg.addColorStop(0, rgba(DAWN, 0)); cg.addColorStop(0.3, rgba(DAWN, 0.35)); cg.addColorStop(0.5, rgba('#ffffff', 0.85));
    cg.addColorStop(0.7, rgba(DAWN, 0.35)); cg.addColorStop(1, rgba(DAWN, 0));
    d.cg = cg; d.cgW = wd;
  }
  ctx.save(); ctx.translate(x, 0); ctx.globalAlpha *= clamp(a, 0, 1);
  ctx.fillStyle = d.cg; ctx.fillRect(-wd, base - h, wd * 2, h);
  ctx.restore();
  for (let i = 0; i < 8; i++) {
    const ph = (t * 2.2 + i / 8) % 1;
    const y = base - ph * h, sz = wd * (0.95 - ph * 0.55), al = a * (ph < 0.1 ? ph / 0.1 : 1 - (ph - 0.1) / 0.9);
    const xo = x + Math.sin(t * 8 + i * 2.3) * wd * 0.3 * ph;
    glow(ctx, xo, y, sz * 0.95, '#ff9a3a', 0.55 * al, sz * 1.5);          // 주황 겉불
    glow(ctx, xo, y + sz * 0.25, sz * 0.5, DAWN2, al, sz * 0.85);          // 흰 속불
  }
  // 꼭대기 성광 (십자 반짝임)
  const ty = base - h;
  ctx.strokeStyle = rgba('#ffffff', 0.8 * a); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - wd * 0.9, ty); ctx.lineTo(x + wd * 0.9, ty); ctx.moveTo(x, ty - wd * 0.9); ctx.lineTo(x, ty + wd * 0.9); ctx.stroke();
  glow(ctx, x, ty, wd * 1.2, DAWN2, 0.6 * a);
}

function techPurge(p, w) {
  if (!spendMp(p, w, 30)) return false;
  const f = p.facing, c = charCol(p);
  pose(p, w, wa(p, 'up'), 0.5, { h0: 0.1, sfx: 'holy' });
  audio.sfx('holy'); audio.sfx('fire', { pitch: 1.2 });
  const x = p.cx + f * 120, base = groundAt(w, x, p.bottom - 30) ?? p.bottom;
  const PW = 90, PH = 260, HITS = 5, H0 = 0.06, STEP = 0.12, LIFE = 0.8;
  // 부패 정화 (blight 기믹이 있는 방에서만)
  const cleansed = !!w.gimmickOf?.('blight')?.cleanse?.(50);
  if (cleansed) w.fx.text(p.cx, p.y - 50, '부패 정화', { color: DAWN2, size: 18, life: 1, vy: -50 });
  w.game?.flash?.('#fff2b0', 0.25, 4);
  fx(w, {
    life: LIFE, z: 11, x: x - PW, y: base - PH - 30, w: PW * 2, h: PH + 40, d: { n: 0 },
    start(e, ww) {
      ww.fx.burst('holy', x, base - 8, Math.round(18 * q(ww)), { angle: -Math.PI / 2, spread: 0.6, speed: 320 });
      ww.fx.ring(x, base - 6, { color: DAWN2, r0: 10, r1: 90, life: 0.28, width: 5 });
      ww.camera?.shake?.(5, 0.2);
    },
    tick(e, ww) {
      const want = Math.min(HITS, Math.max(0, Math.floor((e.lt - H0) / STEP) + 1));
      while (e.d.n < want) {
        const i = e.d.n++, last = i === HITS - 1;
        const r = { x: x - PW / 2, y: base - PH, w: PW, h: PH };
        playerStrike(ww, r, tatk(p, {
          mv: 0.7, element: 'holy', fx: 'holy', hitId: nid('pg'), dir: f,
          purge: true, tech: 'tech_purge', tags: ['skill', 'tech', 'purge'],
          kb: last ? [160, -560] : [30, -200], launch: last, hitstop: last ? 0.07 : 0.03, shake: last ? 6 : 2,
        }));
        if (ww.game?.debug) ww.debugRects?.push(r);
        audio.sfx('holy', { vol: 0.4, pitch: 1 + i * 0.08 });
      }
      if (Math.random() < 0.7 * q(ww)) ww.fx.emit('ember', x + rand(-PW / 2, PW / 2), base - rand(0, PH * 0.8), { color: DAWN, speed: 80, angle: -Math.PI / 2, spread: 0.4 });
    },
    draw(ctx, e) {
      const up = ease.outCubic(clamp(e.lt / 0.12, 0, 1)), a = clamp((e.life - e.lt) / 0.25, 0, 1);
      holyPillar(ctx, x, base, PW * 0.5, PH * up, e.lt, a, e.d);
      ctx.globalCompositeOperation = ADD;
      ctx.strokeStyle = rgba(c, 0.5 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, base, PW * 0.7 * up, PW * 0.18 * up, 0, 0, TAU); ctx.stroke();
    },
    light(L, e) { L.add(x, base - PH * 0.5, 240, DAWN, 1.3 * (1 - e.k * 0.7)); },
  });
  return true;
}

export const SKILL_IMPL_P2 = {
  tech_mirror: techMirror,
  tech_whirl: techWhirl,
  tech_purge: techPurge,
};
