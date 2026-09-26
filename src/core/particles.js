// 파티클 시스템: 타격 불꽃, 피, 먼지, 불씨, 연기, 마법 입자, 충격파 링, 데미지 숫자 등 (owner: FEEL-REACT)
// fx.burst('spark', x, y, 12, {color:'#ffd', speed:300})
// fx.text(x, y, '1234', {color:'#fff', size:22, crit:true})
// fx.ring(x, y, {color:'#f44', r0:10, r1:80, life:0.3})
// fx.slash(x, y, angle, {len, color}) 휘두르기 궤적
// fx.ghost(draw(ctx, alpha), life, layer) 잔상·타격 스프라이트 (impact.js 가 캐시 스프라이트를 이걸로 그린다)
// ── 손맛 확장 (feel.md §4.7, §4.8, §9 WP2) ──
// 프리셋: ecto(엑토플라즘) paper(종이 조각) gravel(자갈) goo(점액) bloodmist(피 안개) feather(깃털)
// 모양:   sprite(캐시 캔버스, 커졌다 사라짐) decal(바닥·벽 자국, 'back' 층) streak(속도선) ering(타원 고리)
//         dmg(아틀라스 숫자) callout(판정 문구 스프라이트) flake(팔랑이는 조각)
// fx.sprite(img, x, y, {size, angle, life, s0, s1, alpha, add, layer})
// fx.ering(x, y, {r0, r1, ry, angle, color, width, life})      fx.speedLine(x, y, angle, {len, width, color, life, speed})
// fx.dmg(target, value, styleKey, {x, y, color, style})        DNF 숫자 기둥 · 3타 이상 '합계' · 품질별 살아 있는 숫자 상한
// fx.callout(x, y, text, {color, size, life, vy, outline, skew}) 캐시 스프라이트 문구
// fx.addDecal(d, cap) / fx.clearDecals()                       자국 (hitfx.stampDecal 이 자리를 잡는다; 방 로딩 때 비움)
// update(dt, map) 는 그대로 (히트스톱 중에는 world 가 0.3배 dt 로 부른다)
import { rand, TAU, clamp } from './math.js';
import { TILE } from './game.js';
import { isSolidType } from './physics.js';
import * as HFX from '../render/hitfx.js';
import * as FH from '../data/feel_hit.js';

const PRESETS = {
  spark:  () => ({ shape: 'spark', life: rand(0.15, 0.35), speed: rand(180, 520), size: rand(2, 3.5), color: '#fff3c0', grav: 600, drag: 0.9, add: true }),
  hit:    () => ({ shape: 'spark', life: rand(0.1, 0.22), speed: rand(300, 700), size: rand(2.5, 4), color: '#ffffff', grav: 0, drag: 0.85, add: true }),
  blood:  () => ({ shape: 'circle', life: rand(0.4, 0.9), speed: rand(80, 320), size: rand(2, 4.5), color: '#9a0d1c', grav: 1300, drag: 0.98, collide: true }),
  dust:   () => ({ shape: 'smoke', life: rand(0.35, 0.7), speed: rand(20, 90), size: rand(6, 12), color: '#8a8074', grav: -40, drag: 0.92, alpha: 0.45 }),
  smoke:  () => ({ shape: 'smoke', life: rand(0.6, 1.3), speed: rand(10, 60), size: rand(10, 22), color: '#3a3440', grav: -60, drag: 0.95, alpha: 0.5 }),
  ember:  () => ({ shape: 'circle', life: rand(0.6, 1.4), speed: rand(30, 120), size: rand(1.2, 2.6), color: '#ff9a3a', grav: -120, drag: 0.97, add: true, flicker: true }),
  fire:   () => ({ shape: 'smoke', life: rand(0.25, 0.55), speed: rand(40, 140), size: rand(8, 16), color: '#ff7a1a', color2: '#ffd070', grav: -260, drag: 0.9, add: true }),
  magic:  () => ({ shape: 'star', life: rand(0.4, 0.8), speed: rand(40, 200), size: rand(2, 4), color: '#b98cff', grav: -40, drag: 0.93, add: true }),
  holy:   () => ({ shape: 'star', life: rand(0.4, 0.9), speed: rand(40, 220), size: rand(2, 4.5), color: '#fff2b0', grav: -80, drag: 0.93, add: true }),
  ice:    () => ({ shape: 'square', life: rand(0.4, 0.8), speed: rand(80, 260), size: rand(2, 4), color: '#bff4ff', grav: 700, drag: 0.96, add: true }),
  dark:   () => ({ shape: 'smoke', life: rand(0.4, 0.9), speed: rand(30, 120), size: rand(6, 14), color: '#5a1a7a', grav: -30, drag: 0.93, add: false, alpha: 0.7 }),
  thunder:() => ({ shape: 'spark', life: rand(0.1, 0.25), speed: rand(300, 800), size: rand(2, 3), color: '#bfe8ff', grav: 0, drag: 0.8, add: true }),
  shard:  () => ({ shape: 'square', life: rand(0.5, 1.1), speed: rand(120, 380), size: rand(3, 6), color: '#7a7470', grav: 1500, drag: 0.99, collide: true, bounce: 0.3 }),
  soul:   () => ({ shape: 'circle', life: rand(0.8, 1.5), speed: rand(20, 70), size: rand(2, 4), color: '#8affc8', grav: -90, drag: 0.96, add: true }),
  gold:   () => ({ shape: 'star', life: rand(0.3, 0.6), speed: rand(60, 160), size: rand(2, 3), color: '#ffd84a', grav: -30, drag: 0.9, add: true }),
  water:  () => ({ shape: 'circle', life: rand(0.4, 0.8), speed: rand(100, 300), size: rand(2, 3.5), color: '#7ec8ff', grav: 1400, drag: 0.99, collide: true, alpha: 0.8 }),
  // ── 손맛 재질 프리셋 (feel §4.7) ──
  ecto:   () => ({ shape: 'circle', life: rand(0.6, 1.1), speed: rand(40, 140), size: rand(3, 6), color: '#8affc8', grav: -60, drag: 0.94, add: true, wob: rand(24, 50), wf: rand(7, 12), wp: rand(0, TAU) }),
  paper:  () => ({ shape: 'flake', life: rand(0.8, 1.5), speed: rand(120, 300), size: rand(4, 7), color: '#e8e0c8', grav: 200, drag: 0.93, wob: rand(20, 40), wf: rand(4, 7), wp: rand(0, TAU) }),
  gravel: () => ({ shape: 'square', life: rand(0.5, 1.0), speed: rand(140, 360), size: rand(2.5, 5), color: '#8a8480', grav: 1500, drag: 0.99, collide: true, bounce: 0.35 }),
  goo:    () => ({ shape: 'circle', life: rand(0.5, 1.0), speed: rand(100, 300), size: rand(2.5, 5), color: '#6adf4a', grav: 1100, drag: 0.98, collide: true, alpha: 0.95 }),
  bloodmist: () => ({ shape: 'smoke', life: rand(0.5, 0.9), speed: rand(10, 50), size: rand(10, 18), color: '#5a0610', grav: -20, drag: 0.93, alpha: 0.4 }),
  feather: () => ({ shape: 'flake', feather: true, life: rand(1.0, 1.8), speed: rand(60, 180), size: rand(5, 8), color: '#2a2230', grav: 120, drag: 0.92, wob: rand(30, 60), wf: rand(3, 6), wp: rand(0, TAU) }),
};
export const PARTICLE_PRESETS = Object.keys(PRESETS);

const COL_DEF = { gap: 0.5, step: 16, height: 8, totalAfter: 3, totalDelay: 0.35 };
const COL_NUDGE = [0, 26, -26, 52, -52];   // 겹친 숫자 기둥 비키기 (px, 22px 안에서 0.5초 안에 시작한 기둥이 있으면)
const qKey = (q) => (q >= 0.95 ? 'high' : q >= 0.7 ? 'medium' : 'low');
const DMG_CAP = { high: 24, medium: 16, low: 10 };

export class Particles {
  constructor(max = 1400) {
    this.max = max;
    this.list = [];
    this.quality = 1; // 0.4~1: 저사양에서 수 감소
    this.decals = [];     // 자국 (방마다 상한, FIFO)
    this.clock = 0;       // 파티클 시계 (데미지 숫자 기둥 · 합계 타이밍)
    this.dmgLive = 0;     // 살아 있는 데미지 숫자 수
    this._cols = [];      // 합계를 기다리는 숫자 기둥
  }
  clear() { this.list.length = 0; this.decals.length = 0; this._cols.length = 0; this.dmgLive = 0; if (this._colStarts) this._colStarts.length = 0; }
  /** 자국만 비운다 (world.loadRoom) */
  clearDecals() { this.decals.length = 0; }

  emit(type, x, y, opts = {}) {
    if (this.list.length >= this.max) this.list.shift();
    const base = PRESETS[type] ? PRESETS[type]() : PRESETS.spark();
    const p = Object.assign(base, opts);
    const ang = opts.angle !== undefined ? opts.angle + rand(-(opts.spread ?? 0.5), opts.spread ?? 0.5) : rand(0, TAU);
    const sp = opts.speed !== undefined ? opts.speed * rand(0.6, 1.1) : base.speed;
    p.x = x; p.y = y;
    p.vx = (opts.vx ?? 0) + Math.cos(ang) * sp;
    p.vy = (opts.vy ?? 0) + Math.sin(ang) * sp;
    p.max = p.life;
    p.rot = rand(0, TAU); p.vr = opts.vr ?? rand(-8, 8);
    p.layer = opts.layer ?? 'front';
    this.list.push(p);
    return p;
  }
  burst(type, x, y, n, opts = {}) {
    const k = Math.max(1, Math.round(n * this.quality));
    for (let i = 0; i < k; i++) this.emit(type, x + rand(-(opts.jitter ?? 0), opts.jitter ?? 0), y + rand(-(opts.jitter ?? 0), opts.jitter ?? 0), opts);
  }
  ring(x, y, { color = '#fff', r0 = 8, r1 = 70, life = 0.3, width = 4, add = true, layer = 'front' } = {}) {
    this.list.push({ shape: 'ring', x, y, vx: 0, vy: 0, r0, r1, life, max: life, color, width, add, layer, grav: 0, drag: 1 });
  }
  /** 타원 고리 (벽 바운드: 세로 타원 angle π/2, 바닥 바운드: ry 0.3) */
  ering(x, y, { color = '#fff', r0 = 8, r1 = 70, ry = 0.35, angle = 0, life = 0.3, width = 4, add = true, layer = 'front' } = {}) {
    this.list.push({ shape: 'ering', x, y, vx: 0, vy: 0, r0, r1, ry, angle, life, max: life, color, width, add, layer, grav: 0, drag: 1 });
  }
  flash(x, y, { color = '#fff', size = 60, life = 0.12 } = {}) {
    this.list.push({ shape: 'flash', x, y, vx: 0, vy: 0, size, life, max: life, color, add: true, layer: 'front', grav: 0, drag: 1 });
  }
  slash(x, y, angle, { len = 90, width = 14, color = '#fff', life = 0.14, arc = 1.4, dir = 1, radius } = {}) {
    this.list.push({ shape: 'slash', x, y, vx: 0, vy: 0, angle, len, width, color, life, max: life, arc, dir, radius: radius ?? len, add: true, layer: 'front', grav: 0, drag: 1 });
  }
  /** 잔상: draw(ctx, alpha) 콜백을 수명 동안 호출 */
  ghost(draw, life = 0.25, layer = 'back') {
    this.list.push({ shape: 'ghost', x: 0, y: 0, vx: 0, vy: 0, draw, life, max: life, layer, grav: 0, drag: 1 });
  }
  text(x, y, str, { color = '#fff', size = 20, crit = false, life = 0.9, vy = -90, outline = '#200008', font } = {}) {
    this.list.push({ shape: 'text', x: x + rand(-8, 8), y, vx: rand(-20, 20), vy, str: String(str), color, size, crit, life, max: life, outline, font, layer: 'top', grav: 160, drag: 0.96 });
  }
  /** 캐시 캔버스 한 장: s0 → s1 배로 2프레임 안에 커졌다가 35% 지점부터 사라진다 (size = 긴 변 px) */
  sprite(img, x, y, { size = 60, angle = 0, life = 0.12, s0 = 0, s1 = 1.2, alpha = 1, add = true, layer = 'front', vx = 0, vy = 0, vr = 0 } = {}) {
    if (!img) return null;
    if (this.list.length >= this.max) this.list.shift();
    const p = { shape: 'sprite', img, x, y, vx, vy, rot: angle, vr, size, s0, s1, alpha, life, max: life, add, layer, grav: 0, drag: 1 };
    this.list.push(p);
    return p;
  }
  /** 속도선 (앞이 굵고 꼬리가 뾰족한 선, 속도 방향) */
  speedLine(x, y, angle, { len = 60, width = 3, color = '#ffffff', life = 0.18, speed = 600, add = true, layer = 'front' } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ shape: 'streak', x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, len, size: width, color, life, max: life, add, layer, grav: 0, drag: 0.9 });
  }
  /** 자국 추가 (hitfx.stampDecal). cap 을 넘으면 가장 오래된 것부터 지운다 */
  addDecal(d, cap = 40) {
    if (!d?.img || !(cap > 0)) return null;
    d.max ??= d.life ?? 18; d.life ??= d.max; d.fade ??= 3;
    const D = this.decals;
    D.push(d);
    while (D.length > cap) D.shift();
    return d;
  }

  // ───────────────────────── 데미지 숫자 (feel §4.8) ─────────────────────────
  dmgCap() { return FH.BUDGET?.[qKey(this.quality)]?.dmgNums ?? DMG_CAP[qKey(this.quality)]; }
  recountDmg() { let n = 0; for (const p of this.list) if (p.shape === 'dmg') n++; this.dmgLive = n; return n; }
  /**
   * 데미지 숫자. styleKey = DMG_STYLE 키 (normal crit weak resist counter ult total hurt heal).
   * o = { x, y, color(숫자 색 덮어쓰기, null = 스타일 색), style(DMG_STYLE 항목) }.
   * 같은 대상에 0.5초 안에 이어진 숫자는 16px 씩 위로 쌓고(8칸 뒤 다시 아래), 3타 이상이면 마지막 타격 0.35초 뒤 '합계'.
   * 살아 있는 숫자가 품질 상한(24/16/10)이면 새 숫자는 그리지 않고 기둥 합계에만 더한다 (플레이어 피격 숫자는 항상 그림).
   */
  dmg(target, value, key = 'normal', o = {}) {
    const st = o.style ?? HFX.dmgStyle?.(key) ?? {};
    const C = FH.DMG_STYLE?.column ?? COL_DEF;
    const x = o.x ?? target?.cx ?? 0, y = o.y ?? target?.y ?? 0;
    let px = x, py = y, col = null;
    if (target && typeof target === 'object' && key !== 'hurt' && key !== 'heal' && key !== 'total') {
      const now = this.clock;
      col = target._dmgCol;
      if (!col || col.done || now - col.t > (C.gap ?? 0.5)) col = target._dmgCol = { n: 0, t: now, t0: now, total: 0, hits: 0, x: this.colX(x, y, now), y, done: false, queued: false };
      else col.n = (col.n + 1) % (C.height ?? 8);
      col.t = now; col.total += Number(value) || 0; col.hits++;
      px = col.x; py = col.y - col.n * (C.step ?? 16);
      if (col.hits >= (C.totalAfter ?? 3) && !col.queued) { col.queued = true; this._cols.push(col); }
    }
    if (key !== 'hurt' && key !== 'total' && this.dmgLive >= this.dmgCap() && this.recountDmg() >= this.dmgCap()) return null;
    const p = this.spawnDmg(px, py, value, key, st, o.color ?? null);
    if (p && col) p.col = col;   // 기둥 숫자는 기둥과 함께 떠오른다 (간격 16px 유지)
    return p;
  }
  /**
   * 새 숫자 기둥의 x: 0.5초 안에 22px 이내에서 시작한 다른 기둥이 있으면 ±26px(다음은 ±52px) 비켜 선다
   * (한 번 휘둘러 겹쳐 선 두 적을 맞히면 '43' '42' 가 '4342' 로 붙어 보이지 않게)
   */
  colX(x, y, now) {
    const S = (this._colStarts ??= []);
    while (S.length && now - S[0][2] > 0.5) S.shift();
    let nx = x;
    for (const off of COL_NUDGE) {
      const cx = x + off;
      if (!S.some((s) => Math.abs(s[0] - cx) < 22 && Math.abs(s[1] - y) < 48)) { nx = cx; break; }
    }
    S.push([nx, y, now]);
    if (S.length > 32) S.shift();
    return nx;
  }
  /** 숫자 기둥이 지금까지 떠오른 높이 (첫 타격부터 0.6초에 걸쳐 rise px) */
  colRise(col, rise) { const u = Math.min(1, Math.max(0, (this.clock - col.t0) / 0.6)); return rise * (1 - (1 - u) * (1 - u) * (1 - u)); }
  spawnDmg(x, y, value, key, st, color) {
    const A = HFX.digitAtlas?.(key, color && color !== st.color ? color : null);
    let str = HFX.fmtDmg ? HFX.fmtDmg(value) : String(Math.round(value));
    if (key === 'crit') str += '!';
    if (st.prefix === '+') str = '+' + str;
    if (!A) {
      this.text(x, y, str, { color: color ?? st.color ?? '#fff', size: st.size ?? 20, crit: key === 'crit', outline: st.outline ?? '#200008', vy: st.fall ? 60 : -90 });
      return null;
    }
    const L = HFX.dmgLayout(A, str);
    const hold = st.hold ?? 0.6, life = hold + 0.28;
    const p = {
      shape: 'dmg', x, y, vx: 0, vy: 0, grav: 0, drag: 1, life, max: life, layer: 'top', add: false,
      A, q: L.q, w: L.w, key, pop: st.pop ?? 1.35, popT: key === 'crit' || key === 'total' ? 0.1 : 0.07, rise: st.rise ?? 40,
      fall: !!st.fall, jit: st.jitter ?? 0, jitT: st.jitterT ?? (st.fall ? 0.3 : 0.1), hold,
      star: st.star ? HFX.star?.('#ffe080') : null, tagAbove: !!st.tag, jx: 0, jy: 0,
    };
    this.list.push(p);
    this.dmgLive++;
    return p;
  }
  /** 판정 문구 ('COUNTER' '가드!' '벽 바운드!' …): 캐시 스프라이트가 튀어나와 떠오르다 사라진다 */
  callout(x, y, text, o = {}) {
    const life = o.life ?? FH.CALLOUT?.life ?? 0.6;
    const spr = HFX.textSprite?.(text, o);
    if (!spr) { this.text(x, y, text, { color: o.color ?? '#ffe8c0', size: o.size ?? 15, life, vy: o.vy ?? -70, outline: o.outline ?? '#1a0610' }); return null; }
    const p = { shape: 'callout', spr, x, y, vx: 0, vy: o.vy ?? FH.CALLOUT?.vy ?? -70, grav: 0, drag: 0.95, life, max: life, layer: 'top', add: false };
    this.list.push(p);
    return p;
  }

  update(dt, map) {
    this.clock += dt;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { if (p.shape === 'dmg' && this.dmgLive > 0) this.dmgLive--; L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy += (p.grav || 0) * dt;
      const d = Math.pow(p.drag ?? 1, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.wob) p.x += Math.sin((p.max - p.life) * (p.wf ?? 8) + (p.wp ?? 0)) * p.wob * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.collide && map) {
        const tt = map.typeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
        if (isSolidType(tt)) {
          p.y -= p.vy * dt;
          if (p.bounce && (p.nb = (p.nb ?? 0) + 1) <= 2 && p.vy > 0) { p.vy *= -p.bounce; p.vx *= 0.6; p.vr = (p.vr ?? 0) * 0.5; }
          else { p.vy *= -0.2; p.vx *= 0.5; p.grav = 0; p.drag = 0.8; p.collide = false; }
        }
      }
    }
    // 자국 수명 (FIFO 순서를 지키도록 앞에서부터)
    const D = this.decals;
    if (D.length) {
      let w = 0;
      for (let i = 0; i < D.length; i++) { const d = D[i]; d.life -= dt; if (d.life > 0) D[w++] = d; }
      D.length = w;
    }
    // 숫자 기둥 합계
    const Cq = this._cols;
    if (Cq.length) {
      const delay = FH.DMG_STYLE?.column?.totalDelay ?? COL_DEF.totalDelay;
      for (let i = Cq.length - 1; i >= 0; i--) {
        const c = Cq[i];
        if (this.clock - c.t < delay) continue;
        Cq.splice(i, 1);
        if (c.done) continue;
        c.done = true;
        const st = HFX.dmgStyle?.('total') ?? {};
        const step = FH.DMG_STYLE?.column?.step ?? COL_DEF.step;
        const top = c.y - (c.n + 1) * step - 8 - this.colRise(c, HFX.dmgStyle?.('normal')?.rise ?? 40);
        this.spawnDmg(c.x, top, c.total, 'total', st, null);
      }
    }
  }

  drawDecals(ctx) {
    const D = this.decals;
    if (!D.length) return;
    ctx.globalCompositeOperation = 'source-over';
    for (const d of D) {
      const a = (d.alpha ?? 0.92) * (d.life < d.fade ? d.life / d.fade : 1);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      if (d.rot || d.flip) {
        ctx.save(); ctx.translate(d.x, d.y);
        if (d.rot) ctx.rotate(d.rot);
        if (d.flip) ctx.scale(-1, 1);
        ctx.drawImage(d.img, -d.w / 2, -d.h / 2, d.w, d.h);
        ctx.restore();
      } else ctx.drawImage(d.img, d.x - d.w / 2, d.y - d.h / 2, d.w, d.h);
    }
  }

  draw(ctx, layer = 'front') {
    if (layer === 'back') this.drawDecals(ctx);
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      const t = 1 - p.life / p.max; // 0→1
      const a = clamp((p.alpha ?? 1) * (p.life / p.max) * 1.4, 0, 1) * (p.flicker ? 0.6 + Math.random() * 0.4 : 1);
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      switch (p.shape) {
        case 'circle': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, TAU); ctx.fill();
          break;
        }
        case 'square': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
          break;
        }
        case 'flake': {
          // 종이·깃털: 뒤집히며 팔랑인다 (폭이 cos 로 줄었다 늘었다)
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          const fl = Math.cos(p.rot * 1.6) || 0.05, s = p.size;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot * 0.35); ctx.scale(fl, 1);
          if (p.feather) { ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.28, 0, 0, TAU); ctx.fill(); }
          else ctx.fillRect(-s / 2, -s * 0.36, s, s * 0.72);
          ctx.restore();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = a; ctx.strokeStyle = p.color; ctx.lineWidth = p.size; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
          break;
        }
        case 'streak': {
          // 머리가 굵고 꼬리가 뾰족한 속도선 (회전 없이 꼭짓점 계산)
          const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
          const len = (p.len ?? sp * 0.05) * (1 - t * 0.4), hw = p.size / 2;
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(p.x - uy * hw, p.y + ux * hw);
          ctx.lineTo(p.x + ux * hw, p.y + uy * hw);
          ctx.lineTo(p.x + uy * hw, p.y - ux * hw);
          ctx.lineTo(p.x - ux * len, p.y - uy * len);
          ctx.closePath(); ctx.fill();
          break;
        }
        case 'star': {
          ctx.globalAlpha = a; ctx.fillStyle = p.color;
          const s = p.size * (1.2 - t * 0.6);
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(0, -s * 2); ctx.lineTo(s * 0.5, -s * 0.5); ctx.lineTo(s * 2, 0); ctx.lineTo(s * 0.5, s * 0.5);
          ctx.lineTo(0, s * 2); ctx.lineTo(-s * 0.5, s * 0.5); ctx.lineTo(-s * 2, 0); ctx.lineTo(-s * 0.5, -s * 0.5);
          ctx.closePath(); ctx.fill(); ctx.restore();
          break;
        }
        case 'smoke': {
          const r = p.size * (0.6 + t * 1.2);
          ctx.globalAlpha = a * 0.8;
          const col = p.color2 && t < 0.4 ? p.color2 : p.color;
          const img = HFX.soft?.(col);
          if (img) ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
          else {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
          }
          break;
        }
        case 'ring': {
          const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(t);
          ctx.globalAlpha = (1 - t);
          ctx.strokeStyle = p.color; ctx.lineWidth = p.width * (1 - t) + 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
          break;
        }
        case 'ering': {
          const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(t);
          ctx.globalAlpha = (1 - t);
          ctx.strokeStyle = p.color; ctx.lineWidth = p.width * (1 - t) + 1;
          ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.5, r), Math.max(0.5, r * p.ry), p.angle ?? 0, 0, TAU); ctx.stroke();
          break;
        }
        case 'flash': {
          ctx.globalAlpha = 1 - t;
          const img = HFX.soft?.(p.color);
          if (img) ctx.drawImage(img, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          else {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          }
          break;
        }
        case 'sprite': {
          const img = p.img, age = p.max - p.life, popT = 2 / 60;
          const k = age < popT ? p.s0 + (p.s1 - p.s0) * (age / popT) : p.s1 - (p.s1 - 1) * 0.4 * Math.min(1, (age - popT) / Math.max(0.01, p.max - popT));
          const al = p.alpha * (t < 0.35 ? 1 : Math.max(0, 1 - (t - 0.35) / 0.65));
          if (al <= 0.01 || k <= 0.001) break;
          const iw = img.width || 1, ih = img.height || 1, s = (p.size / Math.max(iw, ih)) * k;
          ctx.globalAlpha = al;
          ctx.save(); ctx.translate(p.x, p.y); if (p.rot) ctx.rotate(p.rot);
          ctx.drawImage(img, -iw * s / 2, -ih * s / 2, iw * s, ih * s);
          ctx.restore();
          break;
        }
        case 'slash': {
          // 초승달 모양 궤적
          const k = 1 - t;
          ctx.globalAlpha = k;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
          const R = p.radius, half = p.arc / 2;
          const g = ctx.createLinearGradient(-R, 0, R, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, p.color); g.addColorStop(1, '#ffffff');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, R, -half, half, false);
          ctx.arc(p.width * k * 0.8, 0, R - p.width * k, half, -half, true);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case 'ghost': {
          ctx.globalCompositeOperation = 'source-over';
          p.draw(ctx, (p.life / p.max) * 0.5);
          break;
        }
        case 'dmg': this.drawDmg(ctx, p); break;
        case 'callout': {
          const spr = p.spr, age = p.max - p.life;
          const k = age < 0.08 ? 1.45 - 0.45 * (age / 0.08) : 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = t < 0.65 ? 1 : clamp(1 - (t - 0.65) / 0.35, 0, 1);
          const w = spr.w * k, h = spr.h * k;
          ctx.drawImage(spr.canvas, p.x - w / 2, p.y - h / 2, w, h);
          break;
        }
        case 'text': {
          const pop = t < 0.12 ? 1 + (0.12 - t) * (p.crit ? 9 : 5) : 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = clamp(p.life / p.max * 2.5, 0, 1);
          const size = p.size * pop;
          ctx.font = p.font || `900 ${size}px "Cinzel", "Noto Sans KR", serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 5; ctx.strokeStyle = p.outline; ctx.strokeText(p.str, p.x, p.y);
          ctx.fillStyle = p.color; ctx.fillText(p.str, p.x, p.y);
          if (p.crit) { ctx.globalAlpha *= 0.5; ctx.fillStyle = '#fff'; ctx.fillText(p.str, p.x, p.y - 1); }
          ctx.textBaseline = 'alphabetic';
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** 아틀라스 숫자 한 개: 튀어나옴(pop) → 떠오름(rise) 또는 떨어짐(fall) → hold 뒤 사라짐 */
  drawDmg(ctx, p) {
    const A = p.A, cv = A?.canvas;
    if (!cv) return;
    const age = p.max - p.life;
    const sc = age < p.popT ? p.pop + (1 - p.pop) * (age / p.popT) : 1;
    let X = p.x, Y;
    if (p.fall) Y = p.y + 10 * age + 70 * age * age;
    else if (p.col) Y = p.y - this.colRise(p.col, p.rise);
    else { const u = Math.min(1, age / Math.max(0.2, p.max)); Y = p.y - p.rise * (1 - (1 - u) * (1 - u) * (1 - u)); }
    if (p.jit && age < p.jitT) {
      // 떨림: 게임 프레임마다 한 번만 새 값 (고주사율 화면에서도 같은 떨림)
      if (p._jf !== this.clock) { p._jf = this.clock; p.jx = rand(-p.jit, p.jit); p.jy = rand(-p.jit, p.jit); }
      X += p.jx; Y += p.jy;
    }
    const al = age < p.hold ? 1 : clamp(1 - (age - p.hold) / Math.max(0.05, p.max - p.hold), 0, 1);
    if (al <= 0.01) return;
    const k = A.k, gh = (A.h / k) * sc;
    if (p.star) {
      const s = 48 * sc;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * 0.75;
      ctx.drawImage(p.star, X - s / 2, Y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    for (const q of p.q) ctx.drawImage(cv, q[0], q[1], q[2], q[3], X + q[4] * sc, Y - gh / 2, (q[2] / k) * sc, gh);
    const T = A.tag;
    if (T) {
      const tw = (T[2] / k) * sc, th = (T[3] / k) * sc;
      if (p.tagAbove) ctx.drawImage(cv, T[0], T[1], T[2], T[3], X - tw / 2, Y - gh / 2 - th * 0.72, tw, th);
      else ctx.drawImage(cv, T[0], T[1], T[2], T[3], X - (p.w / 2) * sc - tw + 2, Y - th / 2, tw, th);
    }
  }
}
