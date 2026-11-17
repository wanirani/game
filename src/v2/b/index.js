// 리빌드 시범판 B — WebGL 원근 카메라 세계 + 2D 채색 퍼펫 빌보드. docs/v2/SLICE0.md · docs/v2/proto_b.md
//   world.js       상자 세계 (저작 데이터 → 충돌 상자 + 빛을 구운 메시 + 검증)
//   stage_slice0.js 시범 구간 데이터
//   glr.js         작은 WebGL 렌더러 (셰이더 1개)
//   chars.js       v1 퍼펫(카엘·해골 병사·해골 마법사) → 아틀라스 캔버스 → 텍스처
//   sim.js         영웅·적·탄·판정 (x·z·y)
// 이 파일 = 장면: 자원 준비, 입력, 카메라, 그리기 순서, HUD, window.__v2.
// 겹치는 법: 게임 캔버스(#screen)는 불투명 2D 라 그 아래에 GL 캔버스를 깔 수 없다 → GL 캔버스는 화면에 붙이지 않고
//   (소유·크기는 이 장면이 맡는다) 매 프레임 ctx.drawImage 로 게임 캔버스에 옮긴다. 그래서 HUD·토스트·페이드·일시정지·가상 패드가
//   v1 그대로 그 위에 온다. (proto_b.md §3 에 대안과 비용)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { assets } from '../../core/assets.js';
import { text, FONT } from '../../core/ui.js';
import STAGE from './stage_slice0.js';
import { compileStage, lightAt, groundAt, sectionAt, MATS } from './world.js';
import { GLR, SpriteBatch } from './glr.js';
import { CharAtlas, HERO_CELL, ENEMY_CELL, SWORD, makeHeroPuppet, makeEnemyPuppet, preloadChars } from './chars.js';
import { Sim, TUNE } from './sim.js';

const FOCAL = 880;            // 초점 거리 (논리 px): 카메라에서 이만큼 떨어진 곳이 1단위 = 1px
const NEAR = 60, FAR = 24000;
const TEX_SRC = {
  flag: { src: 'tex/tex_mossy_stone', desat: 0.35 }, block: { src: 'tex/tex_castle_stone' }, brick: { src: 'tex/tex_wet_stone', desat: 0.8 },
  wood: { src: 'tex/tex_wood' }, dirt: { src: 'tex/tex_dirt' },
};
const HIDE_BTNS = ['sub', 'skill1', 'skill2', 'ult', 'swap', 'mount', 'guard', 'lock'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export default class V2ProtoB extends Scene {
  constructor(game) {
    super(game);
    this.showPad = true; this.padHideButtons = HIDE_BTNS;
    this.ready = false; this.glError = null; this.glr = null;
  }
  // ───────────────────────── 들어오기 · 나가기 ─────────────────────────
  enter() {
    this.W = compileStage(STAGE);
    this.fx = []; this.nums = []; this.shake = 0; this.shakeX = 0; this.shakeY = 0; this.doneT = 0; this.banner = 0;
    this.sim = new Sim(this.W, this._hooks());
    this.heroPup = makeHeroPuppet();
    this.pups = new Map();
    this.cam = { yaw: 0, pitch: 0.35, dist: 800, lookY: 60, leadX: 0, leadZ: 0, face: 1, tx: 0, ty: 0, tz: 0, px: 0, py: 300, pz: -700, snap: true, fx: 0, fy: -0.3, fz: 0.95 };
    this.vp = new Float32Array(16);
    this.perf = { samples: [], upd: 0, last: 0, ema: 16.7, slow: 0, fast: 0, atlasMs: 0, glMs: 0, blitMs: 0, finish: false };
    this.resK = 1;
    this.list = [];
    preloadChars();
    try { this.glr = new GLR(); } catch (e) { this.glError = String(e?.message ?? e); console.warn('[v2b]', this.glError); }
    if (this.glr) this._load().catch((e) => { this.glError = '그림을 준비하지 못했습니다: ' + String(e?.message ?? e); console.error('[v2b]', e); });
    this._api();
  }
  exit() {
    if (this.glr) { this.glr.destroy(); this.glr = null; }
    if (this.atlas) { this.atlas.canvas.width = 1; this.atlas.canvas.height = 1; this.atlas = null; }
    for (const c of this._canvases ?? []) { c.width = 1; c.height = 1; }
    this._canvases = null; this.ready = false;
    if (globalThis.__v2?.id === 'b') delete globalThis.__v2;
  }
  _hooks() {
    const sfx = (n, o) => { try { this.game.audio?.sfx?.(n, o); } catch { /* 소리 없음 */ } };
    return {
      sfx: (n) => sfx({ swing: 'slash', cast: 'magic', parry: 'clang', die: 'death' }[n] ?? n, { vol: 0.6 }),
      shake: (px) => { this.shake = Math.max(this.shake, px); },
      spark: (x, y, z, kind) => this._burst(x, y, z, kind),
      number: (x, y, z, str, color) => this.nums.push({ x, y, z, str, color, t: 0 }),
      hit: (e, dmg, mv, x, y, z) => {
        this.shake = Math.max(this.shake, (mv.shake ?? 2) * 1.6);
        this._burst(x, y, z, 'hit'); if (mv.finisher || mv.id === 'sw3') this._burst(x, y, z, 'hit');
        this.nums.push({ x: e.x, y: e.y + e.h + 14, z: e.z, str: String(dmg), color: mv.id === 'sw3' ? '#ffd870' : '#ffffff', t: 0 });
        sfx(mv.id === 'sw3' ? 'hit_heavy' : 'hit_bone', { vol: 0.7 });
        try { input.rumble?.(0.3, 0.5, 40); } catch { /* 진동 없음 */ }
      },
      kill: (e) => { this._burst(e.x, e.y + 40, e.z, 'bone'); sfx('enemy_die', { vol: 0.6 }); },
      heroHurt: (dmg, pit) => { this.shake = Math.max(this.shake, 9); this.game.vignette?.('#ff0020', 0.5, 2.5); sfx('hurt', { vol: 0.7 }); if (!pit) this._burst(this.sim.hero.x, this.sim.hero.y + 50, this.sim.hero.z, 'hit'); },
      done: () => { this.doneT = 0; sfx('win', { vol: 0.6 }); },
    };
  }
  async _load() {
    const W = this.W, glr = this.glr, cvs = (this._canvases = []);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; cvs.push(c); return c; };
    const propKeys = [...new Set(W.sprites.filter((s) => s.kind === 'prop').map((s) => s.img))];
    const keys = [...Object.values(TEX_SRC).map((t) => t.src), ...propKeys.map((k) => 'props/' + k), W.sky.img];
    const imgs = {};
    await Promise.all(keys.map((k) => assets.load(k).then((im) => { imgs[k] = im && im.width > 1 ? im : null; }, () => { imgs[k] = null; })));
    if (!this.glr) return;   // 받는 동안 장면을 나갔다
    // 세계 텍스처 (512², 반복 + 밉맵)
    this.tex = {};
    for (const [name, T] of Object.entries(TEX_SRC)) {
      const c = mk(512, 512), x = c.getContext('2d'), im = imgs[T.src];
      if (im) x.drawImage(im, 0, 0, 512, 512); else { x.fillStyle = '#6a6a72'; x.fillRect(0, 0, 512, 512); x.strokeStyle = '#3a3a44'; x.lineWidth = 4; for (let i = 0; i <= 512; i += 128) { x.strokeRect(i, 0, 128, 512); x.strokeRect(0, i, 512, 128); } }
      if (T.desat) { x.globalCompositeOperation = 'saturation'; x.globalAlpha = T.desat; x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
      this.tex[name] = glr.texture(() => c, { repeat: true, mip: true });
    }
    // 하늘: 배경 그림의 위쪽만
    {
      const c = mk(2048, 512), x = c.getContext('2d'), im = imgs[W.sky.img];
      if (im) x.drawImage(im, 0, 0, im.width, im.height * W.sky.crop, 0, 0, 2048, 512);
      else { const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#0a1018'); g.addColorStop(1, '#2a1a26'); x.fillStyle = g; x.fillRect(0, 0, 2048, 512); }
      const g = x.createLinearGradient(0, 380, 0, 512); g.addColorStop(0, 'rgba(18,24,34,0)'); g.addColorStop(1, 'rgba(18,24,34,1)');   // 아래쪽은 안개 색으로 녹인다
      x.fillStyle = g; x.fillRect(0, 380, 2048, 132);
      this.skyTex = glr.texture(() => c, {});
    }
    // 소품·효과 아틀라스 (1024²)
    {
      const c = mk(1024, 1024), x = c.getContext('2d'); const R = (this.spr = {});
      let px = 2, py = 2, rh = 0;
      const put = (name, w, h, draw) => {
        if (px + w + 2 > 1024) { px = 2; py += rh + 4; rh = 0; }
        x.save(); x.translate(px, py); draw(x); x.restore();
        R[name] = { u0: px / 1024, v0: py / 1024, u1: (px + w) / 1024, v1: (py + h) / 1024, w, h }; px += w + 4; rh = Math.max(rh, h);
      };
      const radial = (stops) => (q) => { const g = q.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [o, col] of stops) g.addColorStop(o, col); q.fillStyle = g; q.fillRect(0, 0, 128, 128); };
      put('glow', 128, 128, radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]));
      put('blob', 128, 128, radial([[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]));
      put('puff', 128, 128, radial([[0, 'rgba(255,255,255,0.75)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]));
      put('spark', 64, 16, (q) => { const g = q.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); q.fillStyle = g; q.beginPath(); q.ellipse(32, 8, 32, 5, 0, 0, 7); q.fill(); });
      put('white', 8, 8, (q) => { q.fillStyle = '#fff'; q.fillRect(0, 0, 8, 8); });
      put('window', 64, 96, (q) => {
        q.fillStyle = '#1a1210'; q.beginPath(); q.moveTo(2, 96); q.lineTo(2, 30); q.quadraticCurveTo(32, -14, 62, 30); q.lineTo(62, 96); q.closePath(); q.fill();
        const g = q.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, '#ffd27a'); g.addColorStop(1, '#e8802a'); q.fillStyle = g;
        q.beginPath(); q.moveTo(8, 90); q.lineTo(8, 32); q.quadraticCurveTo(32, -2, 56, 32); q.lineTo(56, 90); q.closePath(); q.fill();
        q.strokeStyle = '#1a1210'; q.lineWidth = 4; q.beginPath(); q.moveTo(32, 6); q.lineTo(32, 90); q.moveTo(8, 50); q.lineTo(56, 50); q.stroke();
      });
      for (const k of propKeys) { const im = imgs['props/' + k]; if (im) put('p:' + k, im.width, im.height, (q) => q.drawImage(im, 0, 0)); }
      this.propTex = glr.texture(() => c, {});
    }
    // 세계 메시
    this.meshes = [];
    for (const [tk, m] of Object.entries(W.mesh)) this.meshes.push({ mesh: glr.mesh(m.data, m.count), tex: this.tex[tk] });
    // 캐릭터 아틀라스 (동적)
    this.atlas = new CharAtlas(this.game.scale);
    this.charTex = glr.texture(null, { w: this.atlas.canvas.width, h: this.atlas.canvas.height, dynamic: true });
    this.batch = new SpriteBatch(glr);
    this.ready = true;
  }
  // ───────────────────────── 갱신 ─────────────────────────
  update(dt) {
    const t0 = performance.now();
    if (input.pressed('menu') && this.game.registry.title) { this.game.go('title', {}, { fade: true }); return; }
    if (!this.ready) return;
    const sim = this.sim;
    let mx = input.analogX || input.axisX, mz = -(input.analogY || input.axisY);
    const inp = { mx, mz, jump: input.buffered('jump', 0.12), jumpHeld: input.down('jump'), attack: input.pressed('attack'), dash: input.pressed('dash'), jumpUsed: false };
    if (sim.done) {
      this.doneT += dt;
      if (this.doneT > 1.2 && (inp.attack || input.pressed('confirm') || input.pointer.tapped)) { sim.reset(); this.cam.snap = true; this.fx.length = 0; this.nums.length = 0; this.game.flash?.('#000', 0.6, 3); return; }
    }
    const deaths = sim.deaths;
    sim.update(dt, inp);
    if (inp.jumpUsed) input.consume('jump');
    if (sim.deaths !== deaths) { this.cam.snap = true; this.game.flash?.('#000', 0.7, 2.5); }
    // 효과
    for (const p of this.fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= (p.g ?? 0) * dt; if (p.drag) { const k = 1 - Math.min(1, p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; } }
    if (this.fx.length) this.fx = this.fx.filter((p) => p.t < p.life);
    for (const n of this.nums) n.t += dt;
    if (this.nums.length) this.nums = this.nums.filter((n) => n.t < 0.8);
    this.shake = Math.max(0, this.shake - dt * 40 - this.shake * dt * 6);
    this.shakeX = (Math.random() * 2 - 1) * this.shake; this.shakeY = (Math.random() * 2 - 1) * this.shake;
    this._camera(dt);
    this.perf.upd += performance.now() - t0;
  }
  _burst(x, y, z, kind) {
    const F = this.fx, R = Math.random;
    if (F.length > 260) return;
    if (kind === 'hit') {
      F.push({ s: 'glow', x, y, z: z - 4, vx: 0, vy: 0, vz: 0, t: 0, life: 0.14, size: 110, c: [1, 0.92, 0.7], add: true, grow: 1.6 });
      for (let i = 0; i < 9; i++) { const a = R() * 6.283, sp = 220 + R() * 380; F.push({ s: 'spark', x, y, z: z - 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 + 80, vz: (R() - 0.5) * 160, t: 0, life: 0.16 + R() * 0.16, size: 30 + R() * 26, c: [1, 0.85, 0.5], add: true, drag: 5, g: 500, dir: true }); }
    } else if (kind === 'dust') {
      for (let i = 0; i < 5; i++) F.push({ s: 'puff', x: x + (R() - 0.5) * 20, y: y + 4, z: z + (R() - 0.5) * 16, vx: (R() - 0.5) * 90, vy: 30 + R() * 50, vz: (R() - 0.5) * 60, t: 0, life: 0.3 + R() * 0.2, size: 22 + R() * 18, c: [0.6, 0.6, 0.68], a: 0.42, drag: 4, grow: 1.2 });
    } else if (kind === 'bone') {
      F.push({ s: 'puff', x, y, z, vx: 0, vy: 30, vz: 0, t: 0, life: 0.5, size: 90, c: [0.8, 0.78, 0.9], a: 0.45, grow: 1.5 });
      for (let i = 0; i < 12; i++) { const a = R() * 6.283, sp = 120 + R() * 260; F.push({ s: 'white', x, y: y + R() * 30, z, vx: Math.cos(a) * sp, vy: 180 + R() * 260, vz: Math.sin(a) * sp * 0.5, t: 0, life: 0.5 + R() * 0.3, size: 5 + R() * 6, c: [0.86, 0.84, 0.78], g: 1500, floor: true }); }
    } else if (kind === 'shot') {
      F.push({ s: 'glow', x, y, z, vx: 0, vy: 0, vz: 0, t: 0, life: 0.2, size: 90, c: [0.8, 0.4, 1], add: true, grow: 1.5 });
      for (let i = 0; i < 6; i++) { const a = R() * 6.283, sp = 100 + R() * 200; F.push({ s: 'spark', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (R() - 0.5) * 100, t: 0, life: 0.2 + R() * 0.15, size: 22, c: [0.85, 0.5, 1], add: true, drag: 4, dir: true }); }
    }
  }
  // ───────────────────────── 카메라 ─────────────────────────
  _camera(dt) {
    const c = this.cam, h = this.sim.hero, W = this.W;
    const sec = sectionAt(W, h.x, h.z) ?? this._sec ?? W.sections[0]; this._sec = sec;
    const R = sec.cam, snap = c.snap;
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.3), kt = snap ? 1 : 1 - Math.exp(-dt * 5.5), kf = snap ? 1 : 1 - Math.exp(-dt * 1.5);
    c.face += (h.facing - c.face) * kf;
    c.yaw += (R.yaw + (R.yawLead ?? 0.03) * c.face - c.yaw) * k;
    c.pitch += (R.pitch - c.pitch) * k; c.dist += (R.dist - c.dist) * k; c.lookY += (R.lookY - c.lookY) * k;
    c.leadX += ((R.leadX ?? 0) * c.face - c.leadX) * k; c.leadZ += ((R.leadZ ?? 0) - c.leadZ) * k;
    c.zf = (c.zf ?? R.zFollow) + (R.zFollow - (c.zf ?? R.zFollow)) * k;
    // 따라갈 점: 영웅 (점프 중에는 높이를 따라가지 않는다)
    let tx = h.x + c.leadX, tz = 130 + (h.z - 130) * c.zf + c.leadZ;
    c.ck = (c.ck ?? 0) + ((R.center?.k ?? 0) - (c.ck ?? 0)) * k;
    if (c.ck > 0.001) { const C = R.center ?? c.lastCenter; if (C) { c.lastCenter = C; tx += (C.x - tx) * c.ck; tz += (C.z - tz) * c.ck; } }
    const gy = h.onGround ? h.y : Math.min(h.y, c.ty + 40 > h.y ? c.ty : h.y - 40);
    c.tx += (tx - c.tx) * kt; c.tz += (tz - c.tz) * kt; c.ty += (gy - c.ty) * (snap ? 1 : 1 - Math.exp(-dt * 4));
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const lx = c.tx, ly = c.ty + c.lookY, lz = c.tz;
    let px = lx - Math.sin(c.yaw) * cp * c.dist, py = ly + sp * c.dist, pz = lz - Math.cos(c.yaw) * cp * c.dist;
    c.minX = (c.minX ?? -1e5) + ((R.minX ?? -1e5) - (c.minX ?? -1e5)) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    c.maxX = (c.maxX ?? 1e5) + ((R.maxX ?? 1e5) - (c.maxX ?? 1e5)) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    px = clamp(px, c.minX, c.maxX);
    const kp = snap ? 1 : 1 - Math.exp(-dt * 14);
    c.px += (px - c.px) * kp; c.py += (py - c.py) * kp; c.pz += (pz - c.pz) * kp;
    let fx = lx - c.px, fy = ly - c.py, fz = lz - c.pz; const fl = Math.hypot(fx, fy, fz) || 1;
    c.fx = fx / fl; c.fy = fy / fl; c.fz = fz / fl;
    c.snap = false;
  }
  _matrix(Wv, Hv) {
    const c = this.cam, m = this.vp;
    const fx = c.fx, fy = c.fy, fz = c.fz;
    const rl = Math.hypot(fz, fx) || 1, rx = fz / rl, rz = -fx / rl;          // r = up × f
    const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;                  // u = f × r
    const px = c.px + rx * this.shakeX, py = c.py + this.shakeY, pz = c.pz + rz * this.shakeX;
    const sx = FOCAL / (Wv / 2), sy = FOCAL / (Hv / 2), A = (FAR + NEAR) / (FAR - NEAR), B = -2 * FAR * NEAR / (FAR - NEAR);
    const rd = -(rx * px + rz * pz), ud = -(ux * px + uy * py + uz * pz), fd = -(fx * px + fy * py + fz * pz);
    m[0] = sx * rx; m[4] = 0; m[8] = sx * rz; m[12] = sx * rd;
    m[1] = sy * ux; m[5] = sy * uy; m[9] = sy * uz; m[13] = sy * ud;
    m[2] = A * fx; m[6] = A * fy; m[10] = A * fz; m[14] = A * fd + B;
    m[3] = fx; m[7] = fy; m[11] = fz; m[15] = fd;
    this.A = A; this.camR = [rx, 0, rz]; this.camU = [ux, uy, uz]; this.eye = [px, py, pz];
    return m;
  }
  /** 세계 점 → 논리 화면 좌표 {x,y,w(깊이)} */
  project(x, y, z, out = {}) {
    const m = this.vp, W = this.game.viewW, H = this.game.viewH;
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    out.w = cw; if (cw <= 1) { out.x = -9999; out.y = -9999; return out; }
    out.x = W / 2 + (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw * W / 2;
    out.y = H / 2 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw * H / 2;
    return out;
  }
  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    const g = this.game, Wv = g.viewW, Hv = g.viewH, P = this.perf;
    const t0 = performance.now();
    if (this.glError || !this.glr) { this._message(ctx, 'WebGL 을 쓸 수 없어 시범판 B 를 열 수 없습니다', this.glError || '', '기기나 브라우저가 WebGL 을 지원하지 않습니다 · 뒤로 = 타이틀'); return; }
    if (!this.ready) { this._message(ctx, '불러오는 중…', '', ''); return; }
    const glr = this.glr;
    if (glr.lost) { this._message(ctx, '화면을 되살리는 중…', '', ''); return; }
    // 품질: GL 내부 해상도만 줄인다 (2D HUD 는 그대로 선명)
    const now = performance.now();
    if (P.last && !g._pageHidden) {
      const d = Math.min(100, now - P.last); P.ema += (d - P.ema) * 0.08;
      if (P.ema > 22) { P.slow += d; P.fast = 0; if (P.slow > 3000 && this.resK > 0.6) { this.resK = Math.max(0.6, this.resK - 0.14); P.slow = 0; } }
      else if (P.ema < 13.5) { P.fast += d; P.slow = 0; if (P.fast > 15000 && this.resK < 1) { this.resK = Math.min(1, this.resK + 0.14); P.fast = 0; } } else { P.slow = 0; }
    }
    P.last = now;
    glr.resize(Math.max(2, Math.round(g.canvas.width * this.resK)), Math.max(2, Math.round(g.canvas.height * this.resK)));
    const vp = this._matrix(Wv, Hv);
    // 1) 캐릭터 → 아틀라스 → 텍스처
    const ta = performance.now();
    this._chars();
    glr.update(this.charTex, this.atlas.canvas, this.atlas.used);
    P.atlasMs = performance.now() - ta;
    // 2) 스프라이트 정점 (하늘 · 그림자/창 · 깊이 정렬 빌보드)
    const tg = performance.now();
    const b = this.batch; b.reset();
    this._sky(b); const nSky = b.n;
    this._decals(b); const nDecal = b.n - nSky;
    const runs = this._billboards(b);
    // 3) GL
    const fog = this.W.fog;
    glr.begin(vp, fog, this.W.sky.top, this.A);
    glr.uploadDyn(b.n);
    glr.drawDyn(this.skyTex, 0, nSky, false);
    for (const m of this.meshes) glr.drawMesh(m.mesh, m.tex);
    glr.gl.bindBuffer(glr.gl.ARRAY_BUFFER, glr.dyn.buf); glr._attribs();
    glr.drawDyn(this.propTex, nSky, nDecal, true);
    for (const r of runs) glr.drawDyn(r.t ? this.charTex : this.propTex, r.first, r.count, true);
    if (P.finish) glr.finish();
    P.glMs = performance.now() - tg;
    // 4) 게임 캔버스로 옮기고 2D 덧그림
    const tb = performance.now();
    ctx.drawImage(glr.canvas, 0, 0, Wv, Hv);
    P.blitMs = performance.now() - tb;
    this._numbers(ctx);
    this._hud(ctx, Wv, Hv);
    const ms = performance.now() - t0 + P.upd; P.upd = 0;
    P.samples.push(ms); if (P.samples.length > 300) P.samples.shift();
  }
  _message(ctx, a, b, c) {
    const W = this.game.viewW, H = this.game.viewH;
    ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, W, H);
    text(ctx, a, W / 2, H / 2 - 10, { size: 22, weight: 700, align: 'center', color: '#e8d8c0' });
    if (b) text(ctx, b, W / 2, H / 2 + 22, { size: 14, align: 'center', color: '#b8a890' });
    if (c) text(ctx, c, W / 2, H / 2 + 48, { size: 14, align: 'center', color: '#b8a890' });
  }
  /** 보이는 캐릭터를 아틀라스에 그린다 → 각자 uv */
  _chars() {
    const A = this.atlas, sim = this.sim, h = sim.hero, p = this.heroPup, pr = this._p ?? (this._p = {});
    A.begin();
    // 영웅
    p.facing = h.facing; p.t = h.t; p.onGround = h.onGround; p.vy = -h.vy; p.dashT = h.dashT;
    p.vx = h.anim === 'run' ? Math.hypot(h.vx, h.vz) * h.facing : h.vx;
    p.move = h.move; p.moveT = h.moveT; p.anim = h.anim === 'attack' ? 'idle' : h.anim; p.animT = h.animT;
    this.heroUV = A.hero(p);
    // 적: 화면 안 + 안개 끝 앞
    const Wv = this.game.viewW, Hv = this.game.viewH;
    for (const e of sim.enemies) {
      e.uv = null; if (e.dead) continue;
      this.project(e.x, e.y + 40, e.z, pr);
      if (pr.w < 80 || pr.w > 3200 || pr.x < -140 || pr.x > Wv + 140 || pr.y < -160 || pr.y > Hv + 200) continue;
      let q = this.pups.get(e.id); if (!q) { q = makeEnemyPuppet(e.kind); this.pups.set(e.id, q); }
      q.facing = e.facing; q.t = e.t; q.anim = e.anim; q.animT = e.kind === 'melee' && e.anim === 'attack' ? e.stateT : e.kind === 'ranged' && e.anim === 'cast' ? e.stateT : e.animT;
      q.flashT = e.flashT; q.stun = e.stun; q.state = e.state; q.vx = e.kx; q.dying = e.state === 'dead' ? Math.max(0.01, e.dying * 0.6) : 0;
      e.uv = A.enemy(q);
    }
  }
  _sky(b) {
    const S = this.W.sky, e = this.eye, R = 9000, hw = R * Math.tan(S.span / 2), yb = e[1] + R * Math.tan(S.bottom), hh = hw * 2 * (940 * S.crop) / 2520;
    for (let i = -1; i <= 1; i++) {
      const x0 = e[0] + (i * 2 - 1) * hw, x1 = x0 + 2 * hw, z = e[2] + R;
      b.quad([x0, yb, z, x1, yb, z, x1, yb + hh, z, x0, yb + hh, z], i ? 1 : 0, 0.002, i ? 0 : 1, 0.998, 1, 1, 1, 1, 1, 0, 0, 0);
    }
  }
  /** 땅에 붙는 것: 그림자 · 창문 */
  _decals(b) {
    const W = this.W, sim = this.sim, S = this.spr, bl = S.blob, t = sim.time;
    const shadow = (x, z, y, rx, a) => {
      const gy = groundAt(W, x, z, y + 20); if (!Number.isFinite(gy)) return;
      const k = clamp(1 - (y - gy) / 260, 0.35, 1), r = rx * (0.7 + 0.3 * k), rz = r * 0.62;
      b.quad([x - r, gy + 0.5, z - rz, x + r, gy + 0.5, z - rz, x + r, gy + 0.5, z + rz, x - r, gy + 0.5, z + rz], bl.u0, bl.v0, bl.u1, bl.v1, 0, 0, 0, a * k, 1, 0, 4, 1);
    };
    for (const s of W.sprites) {
      if (s.kind === 'window') {
        const w = S.window, hw = s.w / 2;
        const p = s.side === 'x-' || s.side === 'x+' ? [s.x, s.y, s.z + hw, s.x, s.y, s.z - hw, s.x, s.y + s.h, s.z - hw, s.x, s.y + s.h, s.z + hw] : [s.x - hw, s.y, s.z, s.x + hw, s.y, s.z, s.x + hw, s.y + s.h, s.z, s.x - hw, s.y + s.h, s.z];
        b.quad(p, w.u0, w.v0, w.u1, w.v1, 1.5, 1.4, 1.25, 1, 1, 0, 3, 0.75);
      } else if (s.shadow) { const im = S['p:' + s.img]; if (im) shadow(s.x, s.z, s.y, s.h * im.w / im.h * 0.42, s.shadow); }
    }
    const h = sim.hero; shadow(h.x, h.z, h.y, 30, 0.95);
    for (const e of sim.enemies) if (!e.dead && e.uv) shadow(e.x, e.z, e.y, 26, 0.9 * (e.state === 'dead' ? e.dying / 0.55 : 1));
    for (const s of sim.shots) if (!s.dead) shadow(s.x, s.z, s.y, 15, 0.7);
    // 영웅 발밑 고리 (깊이를 읽기 쉽게) — 아주 옅게
    void t;
  }
  /** 깊이 정렬 빌보드 → 텍스처별 구간 목록 */
  _billboards(b) {
    const W = this.W, sim = this.sim, S = this.spr, L = this.list, c = this.cam, t = sim.time;
    L.length = 0;
    const fx = c.fx, fy = c.fy, fz = c.fz, ex = this.eye[0], ey = this.eye[1], ez = this.eye[2];
    const depth = (x, y, z) => (x - ex) * fx + (y - ey) * fy + (z - ez) * fz;
    const hk = 1 / Math.max(0.8, Math.cos(c.pitch));    // 세운 그림이 내려다보는 각도 때문에 납작해 보이는 만큼 키운다
    const card = (tex, uv, x, y, z, left, right, down, up, col, a, mode, flash, bias, fog, dOff = 0) => {
      const d = depth(x, y, z) + dOff; if (d < NEAR * 0.5) return;
      L.push({ d, tex, uv, p: [x - left, y - down, z, x + right, y - down, z, x + right, y + up, z, x - left, y + up, z], col, a, mode, flash, bias, fog });
    };
    const tint = (x, y, z, lit = 1) => { const l = lightAt(W, x, y, z); return [clamp(0.36 + 0.74 * l[0], 0, 1.5) * lit, clamp(0.36 + 0.74 * l[1], 0, 1.5) * lit, clamp(0.36 + 0.74 * l[2], 0, 1.5) * lit]; };
    // 소품
    for (const s of W.sprites) {
      if (s.kind !== 'prop') continue;
      const im = S['p:' + s.img]; if (!im) continue;
      if (!s._c) s._c = tint(s.x, s.y + s.h * 0.4, s.z - 8, s.lit);
      const w = s.h * im.w / im.h, uv = s.flip ? { u0: im.u1, v0: im.v0, u1: im.u0, v1: im.v1 } : im;
      card(0, uv, s.x, s.y, s.z, w / 2, w / 2, 0, s.h * hk, s._c, 1, 1, 0, 2, 1);
      if (s.glow) {
        const G = s.glow, r = G.r * (G.flicker ? 0.9 + 0.12 * Math.sin(t * 13 + s.x) + 0.06 * Math.sin(t * 31 + s.z) : 1), gy = s.y + s.h * hk * G.y;
        card(0, S.glow, s.x, gy, s.z - 3, r, r, r, r, G.c, 0.85, 0, 0, 12, 0.6, -6);
        card(0, S.glow, s.x, gy, s.z - 3, r * 2.6, r * 2.6, r * 2.6, r * 2.6, G.c, 0.22, 0, 0, 12, 0.6, -6);
      }
    }
    // 영웅
    const h = sim.hero;
    if (this.heroUV && !(h.ifr > 0 && !h.dead && h.hurtT <= 0 && Math.floor(h.t * 22) % 2 === 0 && h.dashT <= 0)) {
      const C = HERO_CELL, col = tint(h.x, h.y + 50, h.z);
      card(1, this.heroUV, h.x, h.y, h.z, C.ox, C.w - C.ox, (C.h - C.oy) * hk, C.oy * hk, col, 1, 1, h.flash > 0 ? h.flash * 0.6 : 0, 6, 1);
    }
    for (const e of sim.enemies) {
      if (e.dead || !e.uv) continue;
      const C = ENEMY_CELL, col = tint(e.x, e.y + 50, e.z), a = e.state === 'dead' ? clamp(e.dying / 0.4, 0, 1) : 1;
      card(1, e.uv, e.x, e.y, e.z, C.ox, C.w - C.ox, (C.h - C.oy) * hk, C.oy * hk, col, a, 1, 0, 6, 1);
    }
    // 탄
    for (const s of sim.shots) {
      if (s.dead) continue;
      const r = 15 + Math.sin(s.t * 30) * 2;
      card(0, S.glow, s.x, s.y, s.z, r * 2.6, r * 2.6, r * 2.6, r * 2.6, [0.75, 0.3, 1.1], 0.7, 0, 0, 10, 0.5);
      card(0, S.glow, s.x, s.y, s.z, r, r, r, r, [1.6, 1.2, 1.9], 1, 0, 0, 10, 0.5, -1);
    }
    // 효과
    for (const p of this.fx) {
      const im = S[p.s], k = p.t / p.life, sz = p.size * (p.grow ? 1 + (p.grow - 1) * k : 1), a = (p.a ?? 1) * (1 - k * k);
      let y = p.y; if (p.floor) { const gy = groundAt(W, p.x, p.z, p.y + 30); if (Number.isFinite(gy) && y < gy + 3) { y = p.y = gy + 3; p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.6; p.vz *= 0.6; } }
      if (p.dir) {   // 속도 방향으로 늘인 불티
        const vx = p.vx, vy = p.vy, vl = Math.hypot(vx, vy) || 1, dx = vx / vl * sz * 0.5, dy = vy / vl * sz * 0.5, nx = -dy / sz * 7, ny = dx / sz * 7;
        const d = depth(p.x, y, p.z); if (d < NEAR) continue;
        L.push({ d: d - 8, tex: 0, uv: im, p: [p.x - dx - nx, y - dy - ny, p.z, p.x + dx - nx, y + dy - ny, p.z, p.x + dx + nx, y + dy + ny, p.z, p.x - dx + nx, y - dy + ny, p.z], col: p.c, a, mode: 0, flash: 0, bias: 12, fog: 0.6 });
      } else card(0, im, p.x, y, p.z, sz / 2, sz / 2, sz / 2, sz / 2, p.c, a, p.add ? 0 : 1, 0, 10, 0.8, -8);
    }
    L.sort((p, q) => q.d - p.d);
    const runs = []; let cur = null;
    for (const s of L) {
      const first = b.n;
      b.quad(s.p, s.uv.u0, s.uv.v0, s.uv.u1, s.uv.v1, s.col[0], s.col[1], s.col[2], s.a, s.mode, s.flash, s.bias, s.fog);
      if (cur && cur.t === s.tex) cur.count += 6; else { cur = { t: s.tex, first, count: 6 }; runs.push(cur); }
    }
    return runs;
  }
  _numbers(ctx) {
    const pr = this._p2 ?? (this._p2 = {});
    for (const n of this.nums) {
      this.project(n.x, n.y + n.t * 70, n.z, pr); if (pr.w <= 1) continue;
      const k = clamp(FOCAL / pr.w, 0.6, 1.5), pop = n.t < 0.1 ? 1 + (0.1 - n.t) * 5 : 1;
      ctx.globalAlpha = clamp((0.8 - n.t) / 0.25, 0, 1);
      text(ctx, n.str, pr.x, pr.y, { size: Math.round(24 * k * pop), weight: 900, align: 'center', color: n.color, family: FONT.num, ow: 4 });
    }
    ctx.globalAlpha = 1;
  }
  _hud(ctx, Wv, Hv) {
    const g = this.game, sim = this.sim, h = sim.hero, s = g.safe ?? { l: 0, t: 0, r: 0, b: 0 };
    const x = 18 + s.l, y = 16 + s.t, bw = 230, bh = 16, k = clamp(h.hp / TUNE.heroHp, 0, 1);
    ctx.fillStyle = 'rgba(8,4,10,0.72)'; ctx.fillRect(x - 3, y - 3, bw + 6, bh + 6);
    ctx.fillStyle = '#3a0c14'; ctx.fillRect(x, y, bw, bh);
    const gr = ctx.createLinearGradient(x, 0, x + bw, 0); gr.addColorStop(0, '#c0142a'); gr.addColorStop(1, '#ff5a4a');
    ctx.fillStyle = gr; ctx.fillRect(x, y, bw * k, bh);
    ctx.strokeStyle = 'rgba(232,200,114,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 2.5, y - 2.5, bw + 5, bh + 5);
    text(ctx, '카엘', x + 4, y + bh + 22, { size: 15, weight: 700, color: '#e8d8c0' });
    const sec = this.W.sections.find((q) => q.id === (sim.section === 'done' ? 'yard' : sim.section));
    const yardLeft = sim.enemies.filter((e) => e.yard && !e.dead).length, left = sim.enemies.filter((e) => !e.dead).length;
    text(ctx, (sec?.label ?? '') + (sim.section === 'yard' ? ' · 남은 적 ' + yardLeft : ''), x + 52, y + bh + 22, { size: 15, weight: 600, color: '#e8c872' });
    // 시범판 정보 (비교용): 방식 · 프레임 시간
    const st = this.stats();
    text(ctx, `B · ${this.glr.webgl2 ? 'WebGL2' : 'WebGL1'} · ${g.fps | 0}fps · ${st.frameMs.p50.toFixed(1)}ms · ${st.gl.draws}dc ${st.gl.tris}tri · 적 ${left}`, Wv / 2, Hv - 8 - s.b, { size: 11, weight: 500, align: 'center', color: 'rgba(220,210,200,0.6)', ow: 2 });
    if (sim.done) {
      const a = clamp(this.doneT / 0.5, 0, 1);
      ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#05020a'; ctx.fillRect(0, Hv * 0.34, Wv, 124); ctx.globalAlpha = a;
      text(ctx, '시범 구간 끝', Wv / 2, Hv * 0.34 + 62, { size: 44, weight: 900, align: 'center', color: '#e8c872', family: FONT.title, ow: 5 });
      if (this.doneT > 1.2) text(ctx, '공격 버튼을 누르면 처음부터 다시 시작합니다', Wv / 2, Hv * 0.34 + 100, { size: 17, weight: 600, align: 'center', color: '#efe4cf' });
      ctx.globalAlpha = 1;
    } else if (h.dead) {
      text(ctx, '쓰러졌습니다…', Wv / 2, Hv * 0.42, { size: 34, weight: 900, align: 'center', color: '#ff8a80', family: FONT.title, ow: 5 });
    }
  }
  // ───────────────────────── 검사용 API (SLICE0 §6) ─────────────────────────
  stats() {
    const a = [...this.perf.samples].sort((p, q) => p - q), pc = (k) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * k))] : 0);
    const G = this.glr, A = this.atlas;
    return {
      frameMs: { p50: pc(0.5), p95: pc(0.95), n: a.length },
      parts: { atlasMs: this.perf.atlasMs, glMs: this.perf.glMs, blitMs: this.perf.blitMs },
      gl: G ? { ...G.info(), draws: G.stats.draws, tris: Math.round(G.stats.tris), texBytes: G.stats.texBytes, bufBytes: G.stats.bufBytes, uploadPx: G.stats.uploadPx, canvas: [G.canvas.width, G.canvas.height], lost: G.lost, restored: G.restored, resK: this.resK } : null,
      atlas: A ? { size: [A.canvas.width, A.canvas.height], scale: A.S, cells: A.cells, usedH: A.used } : null,
      world: this.W.stats, sprites: this.list.length, canvases: (this._canvases?.length ?? 0) + (A ? 1 : 0) + (G ? 1 : 0),
    };
  }
  _api() {
    const sc = this;
    globalThis.__v2 = {
      id: 'b', scene: sc,
      get ready() { return sc.ready; }, get error() { return sc.glError; },
      get hero() { const h = sc.sim.hero; return { x: h.x, y: h.y, z: h.z, hp: h.hp, facing: h.facing, onGround: h.onGround, anim: h.anim, dead: h.dead }; },
      get enemies() { return sc.sim.enemies.filter((e) => !e.dead).map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z, hp: e.hp, yard: e.yard, state: e.state, active: e.active })); },
      get cam() { const c = sc.cam; return { x: c.px, y: c.py, z: c.pz, yaw: Math.atan2(c.fx, c.fz), pitch: -Math.asin(c.fy), dist: c.dist }; },
      get section() { return sc.sim.section; },
      get stats() { return sc.stats(); },
      get shots() { return sc.sim.shots.filter((s) => !s.dead).map((s) => ({ x: s.x, y: s.y, z: s.z })); },
      teleport(sec) { const ok = sc.sim.teleport(sec); sc.cam.snap = true; return ok; },
      project(x, y, z) { return sc.project(x, y, z, {}); },
      perfFinish(on) { sc.perf.finish = !!on; sc.perf.samples.length = 0; },
      loseContext() { const e = sc.glr?.gl.getExtension('WEBGL_lose_context'); if (!e) return false; e.loseContext(); setTimeout(() => e.restoreContext(), 300); return true; },
    };
  }
}
void MATS; void SWORD;
