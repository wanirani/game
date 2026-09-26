// 게임 본체: 캔버스/해상도, 고정 타임스텝 루프, 장면(Scene) 스택, 페이드 전환
import { input } from './input.js';
import { clamp } from './math.js';

export const VIEW_H = 540;       // 논리 해상도 높이 (고정)
export const MIN_VIEW_W = 960;   // 16:9
export const MAX_VIEW_W = 1280;  // 초광폭 휴대폰 대응
export const TILE = 48;          // 타일 한 칸 (논리 px)
export const STEP = 1 / 60;

/**
 * Scene 기본 클래스. 모든 장면은 이를 상속한다.
 *  enter(params)  : 장면 시작
 *  exit()         : 장면 종료
 *  update(dt)     : 스택 최상단 장면만 호출 (overlay가 아니면)
 *  render(ctx)    : 스택 아래→위 순서로 모두 호출 (단, 아래 장면이 opaque면 그 아래는 생략)
 *  opaque         : true면 아래 장면을 그리지 않음
 *  updateBelow    : true면 이 장면이 떠 있어도 아래 장면 update 계속 (예: 토스트)
 */
export class Scene {
  constructor(game) { this.game = game; this.opaque = true; this.updateBelow = false; this.t = 0; }
  enter(params) {}
  exit() {}
  update(dt) {}
  render(ctx) {}
  resize() {}
}

class Game {
  constructor() {
    this.canvas = null; this.ctx = null;
    this.viewW = MIN_VIEW_W; this.viewH = VIEW_H;
    this.scale = 1; this.dpr = 1;
    this.scenes = [];
    this.registry = {};
    this.time = 0; this.frame = 0; this.realTime = 0;
    this.acc = 0; this.last = 0;
    this.fade = { a: 0, dir: 0, speed: 3, color: '#000', pending: null };
    this.flashFx = { a: 0, color: '#fff', decay: 4 };
    this.input = input;
    this.audio = null; this.assets = null; this.saves = null;
    this.state = null;      // 현재 세이브 데이터 (진행 상황)
    this.settings = null;   // 설정 (볼륨, 품질, 진동 등)
    this.meta = null;       // 슬롯과 무관한 전역 해금/기록
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.paused = false;
    this.toasts = [];
    this.debug = false;
  }

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    input.init(this);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.audio?.suspend(); } else { this.audio?.resume(); this.last = performance.now(); }
    });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    this.viewW = Math.round(clamp(VIEW_H * aspect, MIN_VIEW_W, MAX_VIEW_W));
    this.viewH = VIEW_H;
    const s = Math.min(w / this.viewW, h / this.viewH);
    const quality = this.settings?.quality ?? 'high';
    const dprCap = quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2;
    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const cssW = Math.floor(this.viewW * s), cssH = Math.floor(this.viewH * s);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = Math.floor(cssW * this.dpr);
    this.canvas.height = Math.floor(cssH * this.dpr);
    this.scale = (cssW * this.dpr) / this.viewW;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    for (const sc of this.scenes) sc.resize?.();
    document.body.classList.toggle('portrait', h > w);
  }

  register(name, SceneClass) { this.registry[name] = SceneClass; }

  make(name) {
    const C = this.registry[name];
    if (!C) throw new Error('Unknown scene: ' + name);
    return new C(this);
  }

  get top() { return this.scenes[this.scenes.length - 1]; }

  /** 스택을 비우고 새 장면으로 (페이드 포함) */
  go(name, params = {}, { fade = true, fadeTime = 0.35, color = '#000' } = {}) {
    const doIt = () => {
      while (this.scenes.length) this.scenes.pop().exit();
      const sc = this.make(name);
      sc.name = name;
      this.scenes.push(sc);
      sc.enter(params);
      input.flush();
    };
    if (!fade) { doIt(); return; }
    this.fadeOut(doIt, fadeTime, color);
  }
  /** 위에 장면을 쌓는다 (일시정지 메뉴, 대화창 등) */
  push(name, params = {}) {
    const sc = this.make(name);
    sc.name = name;
    this.scenes.push(sc);
    sc.enter(params);
    input.flush();
    return sc;
  }
  pop(result) {
    const sc = this.scenes.pop();
    sc?.exit();
    input.flush();
    const under = this.top;
    under?.onResume?.(result, sc);
    return sc;
  }

  fadeOut(cb, time = 0.35, color = '#000') {
    this.fade.dir = 1; this.fade.speed = 1 / Math.max(0.01, time); this.fade.color = color; this.fade.pending = cb;
  }
  flash(color = '#fff', strength = 0.8, decay = 4) {
    this.flashFx.color = color; this.flashFx.a = Math.max(this.flashFx.a, strength); this.flashFx.decay = decay;
  }
  toast(text, color = '#f3e2b8', time = 2.4) {
    this.toasts.push({ text, color, t: time, max: time });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  start() {
    this.last = performance.now();
    const loop = (ts) => {
      requestAnimationFrame(loop);
      let dt = (ts - this.last) / 1000;
      this.last = ts;
      if (dt > 0.25) dt = 0.25;
      this.realTime += dt;
      this._fpsAcc += dt; this._fpsN++;
      if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.tick(STEP);
        this.acc -= STEP; steps++;
      }
      if (steps === 5) this.acc = 0;
      this.render();
    };
    requestAnimationFrame(loop);
  }

  tick(dt) {
    input.update(dt);
    this.time += dt; this.frame++;
    // 페이드
    const f = this.fade;
    if (f.dir !== 0) {
      f.a += f.dir * f.speed * dt;
      if (f.dir > 0 && f.a >= 1) {
        f.a = 1; f.dir = -1;
        const cb = f.pending; f.pending = null;
        cb?.();
      } else if (f.dir < 0 && f.a <= 0) { f.a = 0; f.dir = 0; }
    }
    this.flashFx.a = Math.max(0, this.flashFx.a - this.flashFx.decay * dt);
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    // 장면 업데이트: 최상단 + updateBelow 체인
    const n = this.scenes.length;
    if (!n) return;
    if (f.dir > 0) return; // 페이드아웃 중에는 입력 정지
    let i = n - 1;
    const toUpdate = [this.scenes[i]];
    while (i > 0 && this.scenes[i].updateBelow) { i--; toUpdate.unshift(this.scenes[i]); }
    for (const sc of toUpdate) { sc.t += dt; sc.update(dt); }
    this.audio?.update?.(dt);
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    // 가장 아래 opaque 장면부터 그림
    let start = this.scenes.length - 1;
    while (start > 0 && !this.scenes[start].opaque) start--;
    for (let i = Math.max(0, start); i < this.scenes.length; i++) {
      ctx.save();
      try { this.scenes[i].render(ctx); } catch (e) { console.error(e); }
      ctx.restore();
    }
    // 토스트
    if (this.toasts.length && !this.top?.hideToasts && this.top?.name !== 'menu') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 17px "Noto Sans KR", sans-serif';
      this.toasts.forEach((t, k) => {
        const a = Math.min(1, t.t * 3, (t.max - t.t) * 6);
        ctx.globalAlpha = a;
        const y = 92 + k * 30;
        const w = ctx.measureText(t.text).width + 36;
        ctx.fillStyle = 'rgba(10,4,12,0.78)';
        ctx.fillRect(this.viewW / 2 - w / 2, y - 20, w, 28);
        ctx.strokeStyle = 'rgba(200,160,90,0.6)';
        ctx.strokeRect(this.viewW / 2 - w / 2 + 0.5, y - 19.5, w - 1, 27);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, this.viewW / 2, y);
      });
      ctx.restore();
    }
    // 플래시 / 페이드
    if (this.flashFx.a > 0) {
      ctx.globalAlpha = Math.min(1, this.flashFx.a);
      ctx.fillStyle = this.flashFx.color;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.globalAlpha = 1;
    }
    if (this.fade.a > 0) {
      ctx.globalAlpha = Math.min(1, this.fade.a);
      ctx.fillStyle = this.fade.color;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.globalAlpha = 1;
    }
    if (this.debug) {
      ctx.fillStyle = '#0f0'; ctx.font = '12px monospace'; ctx.textAlign = 'left';
      ctx.fillText(`FPS ${this.fps.toFixed(0)}  scenes:${this.scenes.map((s) => s.name).join('>')}`, 6, this.viewH - 6);
    }
  }
}

export const game = new Game();
