// 메뉴용 영웅 미리보기: 가짜 엔티티로 drawHero 를 구동 (대기 호흡 + 주기적 공격 시연)
// + 고딕 무대(아치 창문 역광·빛줄기·마법진 받침대) 배경
import { drawHero } from '../../render/hero.js';
import { MOVESETS } from '../../data/movesets.js';
import { TAU, rgba } from '../../core/math.js';
import { glow, glowOval, Layer, PAL } from './common.js';

export class HeroView {
  constructor({ auto = true } = {}) {
    this.p = {
      cx: 0, bottom: 0, facing: 1, anim: 'idle', animT: 0, move: null, moveT: 0, atkSpeedMul: 1,
      look: null, ch: null, vx: 0, vy: 0, onGround: true, rig: {}, t: 0, stats: { reach: 0 },
      charging: 0, muzzleT: 0, dashT: 0,
    };
    this.clock = 1 + Math.random() * 3;
    this.seq = null; this.si = 0; this.st = 0;
    this.auto = auto; this.cool = 2.2;
    this.key = null;
  }
  /** look 객체가 바뀌면(장비 미리보기 등) 체인 상태를 새로 만든다 */
  set(look, ch, key = null) {
    const p = this.p;
    if (p.look !== look) {
      const capeChanged = !p.look || !!p.look.cape !== !!look?.cape || p.look.hairStyle !== look?.hairStyle || p.ch !== ch;
      p.look = look;
      if (capeChanged) p.rig = {};
    }
    p.ch = ch;
    if (key !== null && key !== this.key) { this.key = key; }
  }
  /** 무기 콤보 시연 (기본 지상 콤보) */
  showcase(n = 99) {
    const type = this.p.look?.weapon?.type || this.p.ch?.weaponType;
    const ms = MOVESETS[type];
    if (!ms?.ground?.length) return;
    this.seq = ms.ground.slice(0, n); this.si = 0; this.st = 0;
  }
  /** 특정 동작 한 번 (cast/charge/throw 등) */
  pose(anim, dur = 0.8) { this.seq = [{ anim, dur, _pose: true }]; this.si = 0; this.st = 0; }
  update(dt) {
    const p = this.p;
    this.clock += dt; p.t = this.clock;
    if (this.seq) {
      const mv = this.seq[this.si];
      this.st += dt;
      if (mv._pose) { p.move = null; p.anim = mv.anim; p.animT = this.st; if (mv.anim === 'charge') p.charging = Math.min(0.6, this.st); }
      else { p.move = mv; p.moveT = this.st; p.anim = mv.anim; p.muzzleT = this.st > (mv.hit?.[0] ?? 0) && this.st < (mv.hit?.[0] ?? 0) + 0.07 ? 0.05 : 0; }
      if (this.st >= (mv.dur ?? 0.4) + (mv._pose ? 0 : 0.03)) {
        this.si++; this.st = 0;
        if (this.si >= this.seq.length) { this.seq = null; p.move = null; p.anim = 'idle'; p.animT = 0; p.charging = 0; p.muzzleT = 0; this.cool = 5 + Math.random() * 3; }
      }
    } else {
      p.anim = 'idle'; p.animT += dt;
      if (this.auto) { this.cool -= dt; if (this.cool <= 0) this.showcase(); }
    }
  }
  draw(ctx, cx, bottom, scale, { facing = 1, noFx = false } = {}) {
    const p = this.p;
    if (!p.look) return;
    p.cx = cx; p.bottom = bottom; p.facing = facing;
    try { drawHero(ctx, p, null, { scale, noFx }); } catch (e) { if (!this._err) { console.error(e); this._err = true; } }
  }
}

/** 마법진 받침대 (발밑) */
export function pedestal(ctx, x, y, s, t, color = PAL.gold) {
  ctx.save();
  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath(); ctx.ellipse(x, y + 1, 40 * s, 7 * s, 0, 0, TAU); ctx.fill();
  glowOval(ctx, x, y, 78 * s, 18 * s, color, 0.28);
  // 이중 원
  ctx.strokeStyle = rgba(color, 0.55); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(x, y, 62 * s, 12 * s, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.3); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(x, y, 50 * s, 9.6 * s, 0, 0, TAU); ctx.stroke();
  // 회전하는 룬 눈금 (앞쪽이 밝게)
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * TAU + t * 0.35;
    const sa = Math.sin(a);
    const x1 = x + Math.cos(a) * 52 * s, y1 = y + sa * 10 * s;
    const x2 = x + Math.cos(a) * 60 * s, y2 = y + sa * 11.6 * s;
    ctx.strokeStyle = rgba(color, 0.15 + 0.45 * (0.5 + 0.5 * sa));
    ctx.lineWidth = i % 4 === 0 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}

/**
 * 고딕 무대 배경 (정적 부분은 레이어 캐시)
 * accent: 영웅 기운 색
 */
export class HeroStage {
  constructor() { this.layer = new Layer(); }
  draw(ctx, x, y, w, h, t, scale, accent = '#e8c872') {
    this.layer.draw(ctx, 'stage', x, y, w, h, scale, (c) => {
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#171028'); g.addColorStop(0.6, '#0d0816'); g.addColorStop(1, '#050308');
      c.fillStyle = g; c.fillRect(x, y, w, h);
      // 고딕 아치 창문 (차가운 달빛 역광)
      const ax = x + w / 2, aw = Math.min(w * 0.46, 150), top = y + 14, base = y + h * 0.7;
      c.save();
      c.beginPath();
      c.moveTo(ax - aw / 2, base); c.lineTo(ax - aw / 2, top + aw * 0.55);
      c.quadraticCurveTo(ax - aw / 2, top + aw * 0.08, ax, top); c.quadraticCurveTo(ax + aw / 2, top + aw * 0.08, ax + aw / 2, top + aw * 0.55);
      c.lineTo(ax + aw / 2, base); c.closePath();
      const wg = c.createLinearGradient(0, top, 0, base);
      wg.addColorStop(0, 'rgba(120,140,220,0.22)'); wg.addColorStop(0.6, 'rgba(70,60,140,0.12)'); wg.addColorStop(1, 'rgba(40,20,60,0.02)');
      c.fillStyle = wg; c.fill();
      c.clip();
      // 창살
      c.strokeStyle = 'rgba(10,6,16,0.85)'; c.lineWidth = 3;
      for (let i = 1; i < 4; i++) { const lx = ax - aw / 2 + (aw / 4) * i; c.beginPath(); c.moveTo(lx, top); c.lineTo(lx, base); c.stroke(); }
      for (let j = 1; j < 5; j++) { const ly = top + aw * 0.35 + j * (base - top - aw * 0.35) / 5; c.beginPath(); c.moveTo(ax - aw / 2, ly); c.lineTo(ax + aw / 2, ly); c.stroke(); }
      // 붉은 달
      const mg = c.createRadialGradient(ax + aw * 0.14, top + aw * 0.42, 2, ax + aw * 0.14, top + aw * 0.42, aw * 0.22);
      mg.addColorStop(0, 'rgba(255,120,120,0.55)'); mg.addColorStop(0.7, 'rgba(180,30,50,0.25)'); mg.addColorStop(1, 'rgba(120,10,30,0)');
      c.fillStyle = mg; c.fillRect(x, y, w, h);
      c.restore();
      c.strokeStyle = 'rgba(200,160,90,0.28)'; c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(ax - aw / 2 - 5, base); c.lineTo(ax - aw / 2 - 5, top + aw * 0.55);
      c.quadraticCurveTo(ax - aw / 2 - 5, top + aw * 0.03, ax, top - 6); c.quadraticCurveTo(ax + aw / 2 + 5, top + aw * 0.03, ax + aw / 2 + 5, top + aw * 0.55);
      c.lineTo(ax + aw / 2 + 5, base); c.stroke();
      // 빛줄기
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const sx = ax - aw * 0.3 + i * aw * 0.3;
        const lg = c.createLinearGradient(0, top, 0, y + h);
        lg.addColorStop(0, 'rgba(140,160,255,0.07)'); lg.addColorStop(1, 'rgba(140,160,255,0)');
        c.fillStyle = lg;
        c.beginPath(); c.moveTo(sx - 8, top + 20); c.lineTo(sx + 8, top + 20); c.lineTo(sx + 40 + i * 10, y + h); c.lineTo(sx - 10 + i * 10, y + h); c.closePath(); c.fill();
      }
      c.restore();
      // 바닥
      const fy = y + h * 0.78;
      const fg = c.createLinearGradient(0, fy, 0, y + h);
      fg.addColorStop(0, 'rgba(40,24,40,0.9)'); fg.addColorStop(1, 'rgba(6,3,8,1)');
      c.fillStyle = fg; c.fillRect(x, fy, w, y + h - fy);
      c.fillStyle = 'rgba(200,160,110,0.18)'; c.fillRect(x, fy, w, 1);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
      for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(ax + i * 22, fy); c.lineTo(ax + i * 60, y + h); c.stroke(); }
      // 가장자리 어둡게
      const vg = c.createRadialGradient(ax, y + h * 0.55, h * 0.2, ax, y + h * 0.55, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)');
      c.fillStyle = vg; c.fillRect(x, y, w, h);
    });
    // 동적: 영웅 뒤 기운 + 떠다니는 먼지
    const cx = x + w / 2;
    glow(ctx, cx, y + h * 0.5, h * 0.42, accent, 0.16 + 0.04 * Math.sin(t * 1.7));
    for (let i = 0; i < 7; i++) {
      const k = (t * 0.05 + i * 0.137) % 1;
      const mx = x + w * (0.15 + ((i * 0.31) % 0.7)) + Math.sin(t * 0.8 + i) * 6;
      const my = y + h * (0.85 - k * 0.8);
      glow(ctx, mx, my, 5, i % 2 ? '#ffd9a0' : '#a8b8ff', 0.35 * Math.sin(k * Math.PI));
    }
  }
  free() { this.layer.free(); }
}

/** 영웅의 대표 기운 색 (직업 aura → 무기 속성 → 트림) */
export function accentOf(look) {
  if (!look) return PAL.gold;
  const c = look.aura?.color || look.accAura?.color;
  if (c && c.startsWith('#')) return c;
  const el = look.weapon?.element;
  const EC = { holy: '#fff2b0', fire: '#ff7a2a', ice: '#9fe8ff', dark: '#b060ff', thunder: '#bfe0ff' };
  if (el && EC[el]) return EC[el];
  return look.trim && look.trim.startsWith('#') ? look.trim : PAL.gold;
}
