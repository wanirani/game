// 동료 합류 연출 'companionJoin' — owner: CMP-UI (companions §7.4; MASTER_PLAN §1.13)
//   game.push('companionJoin', { id, source, onDone })   마을(companionHubEnter)·영혼의 마구간(구입·부화·의뢰 보상)에서만 쌓는다
//   장면 플래그: opaque (들어올 때 찍어 둔 화면을 어둡게 깔고 아래 장면은 그리지 않는다) · uiScale · deferToasts (가상 패드는 자동으로 숨김)
//   연출 (3.5초, 1.2초 뒤부터 넘길 수 있음; 대사가 길면 읽을 시간만큼 늘어난다, 최대 7초):
//     배경 어둡게(0.8) + 진홍 방사 폭발 + 불씨 → 오른쪽에서 초상화(3:4)가 미끄러져 들어오며 천천히 당겨진다 (초상화가 없으면
//     게임 속 그림을 빛 원판 위에 3배로) → 왼쪽: '새로운 동료'(FONT.logo 16, 금색) · 이름(FONT.title 44, 동료 색, 외곽선 6) · 칭호(18) ·
//     종류 알약(탈것/수호신) · 합류 대사(대화 상자; joinNarr 면 서술) · 능력 칩 3개 → 아래: 기기별 조작 안내
//     효과음 companion_join + 울음소리, audio.duck(0.5, 1.0)
//   입력: 1.2초 전의 결정·취소·탭은 연출을 끝 장면으로 당기고, 그 뒤에는 닫는다. 닫힐 때 먼저 pop 하고 onDone 을 부른다
//   (onDone 이 다음 합류 연출을 쌓아도 안전). 모르는 id 면 바로 닫는다. 스택에 혼자면(디버그 주소) 타이틀로.
//
//  CompanionFigure (메뉴 「동료」 탭도 쓴다): 탈것·수호신의 게임 속 그림 (월드 밖)
//    new CompanionFigure(id) · update(dt, anim) · draw(ctx, x, bottom, scale, { layer: 'all'|'back'|'front', facing, alpha })
//    탈것 = mount.js mountView/updateMountView/drawMountView (채색 탈것이 오면 자동으로 그것), fig.ride = 기수용 p.ride
//    수호신 = render/guardians.js drawGuardian 이 true 를 돌려주면 그것, 아니면 guardian.js drawPlaceholder
//    height = 크기 맞춤용 대략 높이 (발 기준 위쪽 px, 배율 1)
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, font, wrap, FONT } from '../core/ui.js';
import { drawGlyph, glyphWidth, promptMode } from '../core/prompts.js';
import { TAU, clamp, ease, rgba, shade, lerp } from '../core/math.js';
import { companionDef } from '../data/companions.js';
import { playCry } from '../core/audio_companions.js';
import { mountView, updateMountView, drawMountView } from '../game/mount.js';
import { drawPlaceholder } from '../game/guardian.js';
import * as GDRAW from '../render/guardians.js';

const MIN_SKIP = 1.2;     // 이보다 먼저는 넘기지 못한다 (companions §7.4)
const BASE_DUR = 3.5;
const MAX_DUR = 7;
const OUT_T = 0.3;
const SAFE0 = Object.freeze({ l: 0, r: 0, t: 0, b: 0 });

// ───────────────────────── 게임 속 그림 (월드 밖) ─────────────────────────
const GUARD_ANIMS = new Set(['idle', 'attack', 'skill', 'assist', 'hurt', 'appear', 'guard', 'howl', 'pounce', 'blink']);
export class CompanionFigure {
  constructor(id) {
    this.id = id;
    this.def = companionDef(id);
    this.kind = this.def?.kind ?? null;
    this.mv = null; this.g = null;
    this.t = 0; this.err = false;
    if (this.kind === 'mount') {
      try { this.mv = mountView(this.def.id, { anim: 'idle', facing: 1 }); } catch (e) { this.mv = null; this.warn(e); }
      this.height = Math.max(96, (this.def.body?.h ?? 90) + 26);
    } else if (this.kind === 'guardian') {
      const d = this.def, self = this;
      this.g = {
        id: d.id, def: d, kind: 'companion', anim: 'idle', animT: 0, t: 0, facing: 1, alpha: 1, seed: 1.3,
        cx: 0, bottom: 0, x: 0, y: 0, w: d.size?.w ?? 24, h: d.size?.h ?? 24, vx: 0, vy: 0,
        perched: false, hopT: 0, fly: d.move !== 'ground', slot: 0, target: null, act: null,
        d: { awakened: false, rank: 0 }, mem: {},
        hopY() { return 0; },
        get cy() { return self.g.bottom - self.g.h / 2; },
      };
      this.height = Math.max(24, d.size?.h ?? 24);
    } else this.height = 60;
  }
  warn(e) { if (!this.err) { this.err = true; try { console.warn('[companionFigure]', this.id, e); } catch { /* 무시 */ } } }
  /** p.ride 계약 (탈것만; drawHero 에 그대로) */
  get ride() { return this.mv?.ride ?? null; }
  update(dt, anim = null) {
    this.t += dt;
    if (this.mv) { try { updateMountView(this.mv, dt, anim); } catch (e) { this.warn(e); } return; }
    const g = this.g;
    if (!g) return;
    g.t += dt; g.animT += dt;
    const a = anim && GUARD_ANIMS.has(anim) ? anim : anim ? 'idle' : null;
    if (a && a !== g.anim) { g.anim = a; g.animT = 0; }
  }
  /** 발 중앙 (x, bottom) 에 배율 scale 로. layer: 탈것의 뒤('back')·앞('front') 층 (기수를 사이에 그릴 때), 'all' = 둘 다 */
  draw(ctx, x, bottom, scale = 1, { layer = 'all', facing = 1, alpha = 1, awakened = false } = {}) {
    ctx.save();
    try {
      if (alpha < 1) ctx.globalAlpha *= clamp(alpha, 0, 1);
      ctx.translate(x, bottom);
      ctx.scale(scale, scale);
      if (this.mv) {
        this.mv.facing = facing < 0 ? -1 : 1;
        if (layer === 'all' || layer === 'back') drawMountView(ctx, this.mv, 'back');
        if (layer === 'all' || layer === 'front') drawMountView(ctx, this.mv, 'front');
      } else if (this.g && layer !== 'front') {
        const g = this.g;
        g.facing = facing < 0 ? -1 : 1; g.cx = 0; g.bottom = 0; g.x = -g.w / 2; g.y = -g.h; g.d.awakened = !!awakened;
        let done = false;
        ctx.save();
        try { done = GDRAW.drawGuardian?.(ctx, g, null, { alpha: 1, hop: 0, awakened: !!awakened }) === true; } catch { done = false; }
        ctx.restore();
        if (!done) { ctx.save(); try { drawPlaceholder(ctx, g, null); } finally { ctx.restore(); } }
      }
    } catch (e) { this.warn(e); }
    ctx.restore();
  }
}

// ───────────────────────── 장면 ─────────────────────────
export class CompanionJoinScene extends Scene {
  constructor(game) {
    super(game);
    this.opaque = true;
    this.uiScale = true;
    this.deferToasts = true;
    this.hidePad = true;
  }
  enter(params = {}) {
    const g = this.game;
    this.params = params;
    this.onDone = typeof params.onDone === 'function' ? params.onDone : null;
    this.def = companionDef(params.id);
    this.closing = 0; this.finished = false; this.skipT = 0;
    if (!this.def) { this.finish(); return; }
    this.id = this.def.id;
    this.isMount = this.def.kind === 'mount';
    this.col = this.def.color?.startsWith('#') ? this.def.color : '#e8c872';
    const line = String(this.def.join ?? '');
    this.dur = clamp(Math.max(BASE_DUR, 1.6 + line.length * 0.05), BASE_DUR, MAX_DUR);
    this.introEnd = Math.max(1.45, 0.95 + line.length * 0.022);   // 글자가 다 찍히는 때 (넘기기 전 입력은 여기로 당긴다)
    this.ff = false;
    this.snap = this.snapshot();
    this.fig = null;
    this.imgAt = -1;
    this.rm = !!g.settings?.reduceMotion;
    const q = g.quality ?? g.tier ?? 'high';
    this.embers = [];
    const n = this.rm ? 8 : q === 'low' ? 14 : q === 'medium' ? 24 : 36;
    for (let i = 0; i < n; i++) this.embers.push(this.newEmber(true));
    try { assets.load?.(this.def.portrait); } catch { /* 초상화는 get() 이 다시 받는다 */ }
    audio.sfx('companion_join');
    try { playCry(this.def, { vol: 0.85, delay: 0.45 }); } catch { /* 울음소리 없음 */ }
    audio.duck(0.5, 1.0);
    this.cache = {};
  }
  /** 들어올 때의 화면 (흐리게 축소) — opaque 라 아래 장면을 그리지 않으므로 배경으로 깐다 */
  snapshot() {
    try {
      const src = this.game.canvas;
      if (!src || !src.width) return null;
      const sw = Math.max(64, Math.round(this.game.viewW / 4)), sh = Math.max(36, Math.round(this.game.viewH / 4));
      const c = document.createElement('canvas'); c.width = sw; c.height = sh;
      const cg = c.getContext('2d');
      cg.imageSmoothingEnabled = true; cg.imageSmoothingQuality = 'high';
      cg.drawImage(src, 0, 0, src.width, src.height, 0, 0, sw, sh);
      return c;
    } catch { return null; }
  }
  newEmber(initial = false) {
    return {
      x: Math.random(), y: initial ? Math.random() : 1.05 + Math.random() * 0.1,
      vy: 0.06 + Math.random() * 0.12, vx: (Math.random() - 0.5) * 0.03, s: 1 + Math.random() * 2.2,
      a: 0.4 + Math.random() * 0.6, ph: Math.random() * TAU, hot: Math.random() < 0.35,
    };
  }
  exit() {
    if (this.snap) { this.snap.width = this.snap.height = 1; this.snap = null; }
  }
  /** 닫기: 먼저 pop 하고 onDone (onDone 이 다른 장면을 쌓아도 안전). 한 번만 */
  finish() {
    if (this.finished) return;
    this.finished = true;
    const g = this.game;
    if (g.top === this) {
      if (g.scenes.length <= 1) g.go('title', {}, { fade: false });
      else g.pop();
    }
    try { this.onDone?.(); } catch (e) { console.error(e); }
  }
  get W() { return this.game.uiW ?? this.game.viewW; }
  get H() { return this.game.uiH ?? this.game.viewH; }
  /** 안전 영역 여백 (UI px): safeArea 'full' 일 때만 (fit 이면 캔버스가 이미 안쪽에 있다) */
  safeUi() {
    const g = this.game, s = g.safe;
    if (g.settings?.safeArea !== 'full' || !s) return SAFE0;
    const k = g.uiK || 1;
    return { l: (s.l || 0) / k, r: (s.r || 0) / k, t: (s.t || 0) / k, b: (s.b || 0) / k };
  }

  update(dt) {
    if (this.finished) return;
    for (const e of this.embers) {
      e.y -= e.vy * dt; e.x += e.vx * dt + Math.sin(this.t * 1.3 + e.ph) * 0.0006;
      if (e.y < -0.05) Object.assign(e, this.newEmber(false));
    }
    if (this.fig) this.fig.update(dt, null);
    if (this.closing > 0) {
      this.closing += dt;
      if (this.closing >= OUT_T) this.finish();
      return;
    }
    const p = input.pointer;
    const hit = input.pressed('confirm') || input.pressed('cancel') || input.pressed('menu') || input.pressed('attack') || input.pressed('jump') || !!p?.tapped;
    if (hit) {
      if (this.t < MIN_SKIP) { if (!this.ff) { this.ff = true; this.t = Math.max(this.t, MIN_SKIP - 0.02); audio.sfx('menu_move', { vol: 0.5 }); } }
      else { this.closing = 0.001; audio.sfx('menu_ok', { vol: 0.6 }); }
      if (p) p.tapped = false;
      return;
    }
    if (this.t >= this.dur) this.closing = 0.001;
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    if (!this.def || this.finished) return;
    const W = this.W, H = this.H, t = this.t;
    const at = this.ff ? Math.max(t, this.introEnd) : t;   // 연출 시간 (넘기기 전 입력이면 끝 장면으로)
    const out = this.closing > 0 ? clamp(this.closing / OUT_T, 0, 1) : 0;
    ctx.save();
    try {
      this.drawBackdrop(ctx, W, H, at);
      ctx.globalAlpha = 1 - out;
      this.drawPortrait(ctx, W, H, at);
      this.drawInfo(ctx, W, H, at);
      this.drawFooter(ctx, W, H, t);
    } catch (e) { if (!this._err) { this._err = true; console.error(e); } }
    ctx.restore();
    if (out > 0) { ctx.fillStyle = `rgba(0,0,0,${0.55 * out})`; ctx.fillRect(0, 0, W, H); }
  }
  drawBackdrop(ctx, W, H, t) {
    const k = ease.outCubic(clamp(t / 0.35, 0, 1));
    ctx.fillStyle = '#050207'; ctx.fillRect(0, 0, W, H);
    if (this.snap) { ctx.globalAlpha = 1; ctx.drawImage(this.snap, 0, 0, W, H); }
    ctx.fillStyle = `rgba(4,1,6,${0.8 * k})`; ctx.fillRect(0, 0, W, H);
    // 진홍 방사 폭발 (오른쪽 초상화 쪽이 중심)
    const cx = W * 0.66, cy = H * 0.48;
    const burst = this.rm ? 1 : ease.outExpo(clamp(t / 0.9, 0, 1));
    const R = Math.max(W, H) * (0.25 + 0.55 * burst);
    const bg = this.cache.burst ??= (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,90,90,0.55)'); r.addColorStop(0.25, 'rgba(200,20,44,0.42)'); r.addColorStop(0.6, 'rgba(110,6,26,0.18)'); r.addColorStop(1, 'rgba(60,0,12,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      return c;
    })();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k * (0.75 + 0.15 * Math.sin(t * 2.2));
    ctx.drawImage(bg, cx - R, cy - R, R * 2, R * 2);
    // 빛살 (천천히 도는 부채꼴)
    if (!this.rm) {
      ctx.globalAlpha = 0.14 * k;
      ctx.fillStyle = this.col;
      const n = 14, rot = t * 0.12;
      for (let i = 0; i < n; i++) {
        const a0 = rot + (i / n) * TAU, a1 = a0 + 0.07 + 0.04 * Math.sin(i * 1.7);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R * 1.1, a0, a1); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
    // 불씨
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      const a = e.a * k * clamp((1 - e.y) * 3, 0, 1) * (0.6 + 0.4 * Math.sin(t * 5 + e.ph));
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = e.hot ? '#ffd27a' : '#ff4a3a';
      ctx.beginPath(); ctx.arc(e.x * W, e.y * H, e.s, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 가장자리 비네트
    const v = this.cache.vig ??= (() => {
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      const g = c.getContext('2d'), r = g.createRadialGradient(80, 45, 20, 80, 45, 92);
      r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,0.78)');
      g.fillStyle = r; g.fillRect(0, 0, 160, 90);
      return c;
    })();
    ctx.globalAlpha = k;
    ctx.drawImage(v, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  /** 초상화 카드 (3:4): 오른쪽에서 미끄러져 들어오고 천천히 당겨진다 */
  portraitRect(W, H) {
    const S = this.safeUi();
    const h = Math.min((H - S.t - S.b) * 0.82, 470), w = h * 0.75;
    return { x: W - S.r - w - Math.max(24, W * 0.06), y: S.t + (H - S.t - S.b - h) / 2 - 8, w, h };
  }
  get x0() { return this.safeUi().l + Math.max(28, this.W * 0.07); }
  drawPortrait(ctx, W, H, t) {
    const r = this.portraitRect(W, H);
    const u = this.rm ? clamp((t - 0.1) / 0.3, 0, 1) : ease.outCubic(clamp((t - 0.1) / 0.6, 0, 1));
    if (u <= 0) return;
    const dx = this.rm ? 0 : (1 - u) * W * 0.35;
    const x = r.x + dx, y = r.y, w = r.w, h = r.h;
    const img = assets.get(this.def.portrait);
    const ok = !!img && img.width > 8;
    if (ok && this.imgAt < 0) this.imgAt = t;
    ctx.save();
    ctx.globalAlpha *= u;
    // 뒤쪽 빛 + 그림자
    glowRect(ctx, x + w / 2, y + h / 2, w * 0.9, h * 0.72, this.col, 0.35 + 0.08 * Math.sin(t * 2), this.cache);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 8, y + 10, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#0a0508'; ctx.fillRect(x, y, w, h);
    if (ok) {
      // 켄 번스: 1.1 → 1.0 으로 당기며 살짝 위로
      const kb = this.rm ? 1 : lerp(1.1, 1.0, ease.outCubic(clamp(t / this.dur, 0, 1)));
      const s = Math.max(w / img.width, h / img.height) * kb;
      const iw = img.width * s, ih = img.height * s;
      const fa = clamp((t - this.imgAt) / 0.25, 0, 1);
      ctx.globalAlpha *= fa;
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) * (this.rm ? 0.5 : lerp(0.62, 0.45, clamp(t / this.dur, 0, 1))), iw, ih);
      ctx.globalAlpha /= fa || 1;
    }
    if (!ok || t - this.imgAt < 0.25) {
      // 초상화가 아직 없다: 게임 속 그림을 빛 원판 위에 (최대 3배)
      if (!this.fig) this.fig = new CompanionFigure(this.id);
      const fk = ok ? 1 - clamp((t - this.imgAt) / 0.25, 0, 1) : 1;
      ctx.globalAlpha *= fk;
      const disc = Math.min(w, h) * 0.42;
      glowRect(ctx, x + w / 2, y + h * 0.55, disc * 1.2, disc * 1.2, this.col, 0.6, this.cache);
      ctx.fillStyle = rgba(shade(this.col, -0.7), 0.85);
      ctx.beginPath(); ctx.arc(x + w / 2, y + h * 0.55, disc, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(this.col, 0.7); ctx.lineWidth = 2; ctx.stroke();
      const sc = Math.min(3, (disc * 1.5) / Math.max(40, this.fig.height));
      const bottom = y + h * 0.55 + this.fig.height * sc * 0.5;
      this.fig.draw(ctx, x + w / 2, bottom, sc, { facing: -1 });
      ctx.globalAlpha /= fk || 1;
    }
    // 아래쪽 어둡게 + 테두리
    const fg = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = fg; ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 4; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = rgba(this.col, 0.55); ctx.lineWidth = 1; ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
    corners(ctx, x, y, w, h, '#e8c872');
    ctx.restore();
  }
  /** 왼쪽 글 줄: 새로운 동료 → 이름 → 칭호 → 종류 → 합류 대사 → 능력 칩 */
  drawInfo(ctx, W, H, t) {
    const pr = this.portraitRect(W, H);
    const x0 = this.x0, colW = Math.max(220, pr.x - x0 - Math.max(24, W * 0.04));
    const d = this.def, col = this.col;
    const fade = (t0, len = 0.3) => (this.rm ? clamp((t - t0) / 0.2, 0, 1) : ease.outCubic(clamp((t - t0) / len, 0, 1)));
    let y = this.safeUi().t + Math.max(64, H * 0.19);
    // '새로운 동료'
    let a = fade(0.25);
    if (a > 0) {
      ctx.save(); ctx.globalAlpha *= a;
      text(ctx, '새로운 동료', x0 + (1 - a) * -14, y, { size: 16, weight: 700, family: FONT.logo, color: '#e8c872', ow: 3 });
      const lg = ctx.createLinearGradient(x0, 0, x0 + colW * 0.6, 0);
      lg.addColorStop(0, 'rgba(232,200,114,0.85)'); lg.addColorStop(1, 'rgba(232,200,114,0)');
      ctx.fillStyle = lg; ctx.fillRect(x0, y + 8, colW * 0.6 * a, 1);
      ctx.restore();
    }
    // 이름 (튀어나오듯)
    y += 56;
    a = fade(0.4, 0.35);
    if (a > 0) {
      const pop = this.rm ? 1 : 1 + 0.25 * (1 - ease.outBack(clamp((t - 0.4) / 0.35, 0, 1)));
      ctx.save(); ctx.globalAlpha *= a;
      glowRect(ctx, x0 + 80, y - 16, 170, 46, col, 0.35 * a, this.cache);
      ctx.translate(x0, y - 14); ctx.scale(pop, pop); ctx.translate(-x0, -(y - 14));
      text(ctx, d.name, x0, y, { size: 44, weight: 900, family: FONT.title, color: col, outline: 'rgba(10,2,6,0.95)', ow: 6, maxWidth: colW });
      ctx.restore();
    }
    // 칭호 + 종류 알약
    y += 34;
    a = fade(0.6);
    if (a > 0) {
      ctx.save(); ctx.globalAlpha *= a;
      ctx.font = font(18, 700, FONT.title);
      const tw = Math.min(colW - 80, ctx.measureText(d.title).width);
      text(ctx, d.title, x0, y, { size: 18, weight: 700, family: FONT.title, color: '#efe4cf', ow: 3, maxWidth: colW - 80 });
      pillAt(ctx, this.isMount ? '탈것' : '수호신', x0 + tw + 12, y - 15, this.isMount ? '#ffb070' : '#9fd0ff');
      ctx.restore();
    }
    // 합류 대사 (대화 상자)
    y += 20;
    a = fade(0.8);
    const line = String(d.join ?? '');
    const size = H < 460 ? 15 : 16;
    const lines = this.cache.lines ??= wrap(ctx, d.joinNarr ? line : `“${line}”`, colW - 36, size, 500, FONT.body).slice(0, 4);
    const boxH = 22 + lines.length * size * 1.55 + (d.joinNarr ? 0 : 6);
    if (a > 0) {
      ctx.save(); ctx.globalAlpha *= a;
      const bx = x0, by = y + (1 - a) * 8;
      const bgr = ctx.createLinearGradient(0, by, 0, by + boxH);
      bgr.addColorStop(0, 'rgba(26,10,20,0.92)'); bgr.addColorStop(1, 'rgba(10,4,10,0.94)');
      ctx.fillStyle = bgr; roundRect(ctx, bx, by, colW, boxH, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 1.2; roundRect(ctx, bx + 0.5, by + 0.5, colW - 1, boxH - 1, 6); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(bx + 1, by + 8, 3, boxH - 16);
      // 한 글자씩 (0.02초/글자) — 넘기면 다 보인다
      const shown = this.rm ? Infinity : Math.floor((t - 0.9) / 0.022);
      let left = shown;
      for (let i = 0; i < lines.length; i++) {
        const s = left >= lines[i].length ? lines[i] : lines[i].slice(0, Math.max(0, left));
        left -= lines[i].length;
        if (!s) break;
        text(ctx, s, bx + 18, by + 14 + size + i * size * 1.55, { size, weight: d.joinNarr ? 500 : 600, color: d.joinNarr ? '#c8baa6' : '#f3e6cc', ow: 2 });
      }
      ctx.restore();
    }
    // 능력 칩 3개
    y += boxH + 16;
    const chips = Array.isArray(d.chips) ? d.chips.slice(0, 3) : [];
    let cx = x0, cy = y;
    for (let i = 0; i < chips.length; i++) {
      const ca = fade(1.0 + i * 0.1, 0.25);
      ctx.font = font(14, 700, FONT.body);
      const w = ctx.measureText(chips[i]).width + 26;
      if (cx + w > x0 + colW && cx > x0) { cx = x0; cy += 34; }
      if (ca > 0) {
        ctx.save(); ctx.globalAlpha *= ca;
        const oy = (1 - ca) * 10;
        ctx.fillStyle = 'rgba(30,12,22,0.92)'; roundRect(ctx, cx, cy + oy, w, 26, 13); ctx.fill();
        ctx.strokeStyle = rgba(col, 0.75); ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx + 11, cy + oy + 13, 3, 0, TAU); ctx.fill();
        text(ctx, chips[i], cx + 18, cy + oy + 18, { size: 14, weight: 700, color: '#efe4cf', ow: 2 });
        ctx.restore();
      }
      cx += w + 8;
    }
  }
  /** 아래: 기기별 조작 안내 + 넘기기 안내 + 자동 진행 막대 */
  drawFooter(ctx, W, H, t) {
    const a = this.rm ? clamp((t - 1.1) / 0.2, 0, 1) : ease.outCubic(clamp((t - 1.1) / 0.3, 0, 1));
    if (a <= 0) return;
    const mode = promptMode();
    const S = this.safeUi();
    const x0 = this.x0, y = H - S.b - 16;
    ctx.save(); ctx.globalAlpha *= a;
    const act = this.isMount ? 'mount' : 'guard';
    const rest = this.isMount ? '로 소환 · 메뉴 › 동료 탭에서 관리' : '로 스킬 · 자동 스킬은 메뉴에서 설정';
    const size = 14;
    if (mode === 'touch') {
      text(ctx, this.isMount ? '탑승 버튼으로 소환' : '수호 버튼으로 스킬', x0, y, { size, weight: 700, color: '#d8c8a8', ow: 3 });
    } else {
      const gw = glyphWidth(act, 20);
      if (gw > 0) { drawGlyph(ctx, act, x0, y - 15, 20); text(ctx, ' ' + rest, x0 + gw + 2, y, { size, weight: 700, color: '#d8c8a8', ow: 3 }); }
      else text(ctx, (this.isMount ? '[R] ' : '[G] ') + rest, x0, y, { size, weight: 700, color: '#d8c8a8', ow: 3 });
    }
    // 넘기기 (1.2초 뒤)
    if (t >= MIN_SKIP) {
      const k = clamp((t - MIN_SKIP) / 0.25, 0, 1);
      ctx.globalAlpha *= k;
      const rx = W - S.r - Math.max(24, W * 0.06);
      if (mode === 'touch') text(ctx, '화면을 터치해 계속', rx, y, { size: 13, weight: 700, color: '#a89880', align: 'right', ow: 3 });
      else {
        ctx.font = font(13, 700, FONT.body);
        const lw = ctx.measureText('계속').width;
        text(ctx, '계속', rx, y, { size: 13, weight: 700, color: '#a89880', align: 'right', ow: 3 });
        const gw = glyphWidth('confirm', 18);
        if (gw > 0) drawGlyph(ctx, 'confirm', rx - lw - gw - 6, y - 14, 18);
      }
      // 자동 진행 막대
      const pr = this.portraitRect(W, H);
      const f = clamp((t - MIN_SKIP) / Math.max(0.1, this.dur - MIN_SKIP), 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(pr.x, pr.y + pr.h + 7, pr.w, 2);
      ctx.fillStyle = rgba(this.col, 0.8); ctx.fillRect(pr.x, pr.y + pr.h + 7, pr.w * f, 2);
    }
    ctx.restore();
  }
}

// ───────────────────────── 그림 도우미 ─────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
function pillAt(ctx, str, x, y, color) {
  ctx.font = font(12, 800, FONT.body);
  const w = ctx.measureText(str).width + 16, h = 20;
  ctx.fillStyle = 'rgba(30,14,22,0.92)'; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = rgba(color, 0.8); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(str, x + w / 2, y + h / 2 + 0.5);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  return w;
}
function corners(ctx, x, y, w, h, c) {
  const L = 16;
  ctx.strokeStyle = c; ctx.lineWidth = 2;
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx + sx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * L); ctx.stroke();
  }
}
/** 둥근 빛 (색마다 한 장 구워 두고 늘려 그린다) */
function glowRect(ctx, cx, cy, rw, rh, color, a, cache) {
  if (!(a > 0.01)) return;
  const key = 'glow' + color;
  let c = cache[key];
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, rgba(color, 0.8)); r.addColorStop(0.4, rgba(color, 0.3)); r.addColorStop(1, rgba(color, 0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    cache[key] = c;
  }
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * clamp(a, 0, 1);
  ctx.drawImage(c, cx - rw, cy - rh, rw * 2, rh * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
