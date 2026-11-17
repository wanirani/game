// v2bench — 그리는 틀: 시범판 B 의 세계(SLICE0)·렌더러·캐릭터 경로를 그대로 빌려 와서, 정해진 길을 달리는 한 장면을 그린다.
// 시범판 B 의 부품(world.js · glr.js · chars.js · stage_slice0.js)과 char3d 는 읽기만 한다. 그리는 순서·빌보드·그림자·빛 번짐은
// src/v2/b/index.js 의 render() 를 따랐다 (할당 방식까지 같게 — 가비지 수거 영향도 같이 재려고). docs/v2/PERF_NOTES.md §3
import { assets } from '../../core/assets.js';
import STAGE from '../b/stage_slice0.js';
import { compileStage, lightAt, groundAt } from '../b/world.js';
import { GLR, SpriteBatch } from '../b/glr.js';
import { CharAtlas, HERO_CELL, ENEMY_CELL, makeHeroPuppet, makeEnemyPuppet, preloadChars } from '../b/chars.js';

const FOCAL = 880, NEAR = 60, FAR = 24000;
const TEX_SRC = {   // src/v2/b/index.js 와 같은 표 (그 파일은 고치지 않는다)
  flag: { src: 'tex/tex_mossy_stone', desat: 0.35 }, block: { src: 'tex/tex_castle_stone' }, brick: { src: 'tex/tex_wet_stone', desat: 0.8 },
  wood: { src: 'tex/tex_wood' }, dirt: { src: 'tex/tex_dirt' },
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now();
/** 들러리 12명의 자리 (영웅 기준 x·z) · 종류 · 보는 쪽 — 늘 화면 안에 13명이 있다 */
const CROWD = [
  [-250, 40, 'melee', 1], [-170, -60, 'ranged', 1], [-110, 80, 'melee', 1], [-60, -30, 'melee', 1], [70, 60, 'ranged', -1], [120, -50, 'melee', -1],
  [180, 20, 'melee', -1], [240, 90, 'ranged', -1], [300, -40, 'melee', -1], [-200, 100, 'melee', 1], [20, 105, 'melee', -1], [350, 50, 'ranged', -1],
];
/** 한 시험이 달리는 길: 거리 구간을 초당 300 으로 (영웅 달리기와 비슷한 속도), 깊이는 천천히 물결친다 */
export const PATH = { x0: 300, v: 300, z0: 132, zAmp: 46, zHz: 0.31 };

export class Rig {
  constructor(game) {
    this.game = game; this.W = null; this.glr = null; this.ready = false; this.error = null;
    this.present = 'blit'; this.resK = 1; this.chars = 'none';
    this.vp = new Float32Array(16); this.eye = [0, 0, 0]; this.A = 1; this.pitch = 0.35;
    this.list = []; this.has3d = false; this.err3d = '';
    this.layer = { on: false, hud: null, hctx: null, key: '' };
    this.cost = { upMs: 0, blitMs: 0, n: 0 };
    this.warm = { world: 0, card: 0, c3d: 0 };
    this.loadMs = 0; this._animT = -1;
  }
  async load() {
    const t0 = now();
    this.W = compileStage(STAGE);
    preloadChars();
    this.glr = new GLR({});   // WebGL 이 없으면 예외 → 장면이 안내를 띄운다
    const W = this.W, glr = this.glr, cvs = (this._canvases = []);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; cvs.push(c); return c; };
    const propKeys = [...new Set(W.sprites.filter((s) => s.kind === 'prop').map((s) => s.img))];
    const keys = [...Object.values(TEX_SRC).map((t) => t.src), ...propKeys.map((k) => 'props/' + k), W.sky.img];
    const imgs = {};
    await Promise.all(keys.map((k) => assets.load(k).then((im) => { imgs[k] = im && im.width > 1 ? im : null; }, () => { imgs[k] = null; })));
    if (!this.glr) return;
    this.tex = {};
    for (const [name, T] of Object.entries(TEX_SRC)) {
      const c = mk(512, 512), x = c.getContext('2d'), im = imgs[T.src];
      if (im) x.drawImage(im, 0, 0, 512, 512); else { x.fillStyle = '#6a6a72'; x.fillRect(0, 0, 512, 512); }
      if (T.desat) { x.globalCompositeOperation = 'saturation'; x.globalAlpha = T.desat; x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
      this.tex[name] = glr.texture(() => c, { repeat: true, mip: true });
    }
    {
      const c = mk(2048, 512), x = c.getContext('2d'), im = imgs[W.sky.img];
      if (im) x.drawImage(im, 0, 0, im.width, im.height * W.sky.crop, 0, 0, 2048, 512);
      else { const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#0a1018'); g.addColorStop(1, '#2a1a26'); x.fillStyle = g; x.fillRect(0, 0, 2048, 512); }
      const g = x.createLinearGradient(0, 380, 0, 512); g.addColorStop(0, 'rgba(18,24,34,0)'); g.addColorStop(1, 'rgba(18,24,34,1)');
      x.fillStyle = g; x.fillRect(0, 380, 2048, 132);
      this.skyTex = glr.texture(() => c, {});
    }
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
      put('window', 64, 96, (q) => {
        q.fillStyle = '#1a1210'; q.fillRect(2, 8, 60, 88);
        const g = q.createLinearGradient(0, 0, 0, 96); g.addColorStop(0, '#ffd27a'); g.addColorStop(1, '#e8802a'); q.fillStyle = g; q.fillRect(8, 14, 48, 76);
        q.strokeStyle = '#1a1210'; q.lineWidth = 4; q.beginPath(); q.moveTo(32, 14); q.lineTo(32, 90); q.moveTo(8, 50); q.lineTo(56, 50); q.stroke();
      });
      for (const k of propKeys) { const im = imgs['props/' + k]; if (im) put('p:' + k, im.width, im.height, (q) => q.drawImage(im, 0, 0)); }
      this.propTex = glr.texture(() => c, {});
    }
    this.meshes = [];
    for (const [tk, m] of Object.entries(W.mesh)) this.meshes.push({ mesh: glr.mesh(m.data, m.count), tex: this.tex[tk] ?? this.tex.block });
    this.atlas = new CharAtlas(this.game.scale);
    this.charTex = glr.texture(null, { w: this.atlas.canvas.width, h: this.atlas.canvas.height, dynamic: true });
    this.batch = new SpriteBatch(glr);
    this.heroPup = makeHeroPuppet();
    this.crowd = CROWD.map(([ox, oz, kind, face], i) => ({ ox, oz, kind, face, pup: makeEnemyPuppet(kind), x: 0, y: 0, z: 0, uv: null, c3: null, ph: i * 0.37 }));
    this.hero = { x: 0, y: 0, z: 0, uv: null, c3: null };
    // 입체 캐릭터 (char3d) — 못 쓰면 조용히 건너뛴다
    try {
      const [R, H] = await Promise.all([import('../char3d/render.js'), import('../char3d/hero3d.js')]);
      const asset = await H.loadCharAsset(H.HERO_URL);
      if (!this.glr) return;
      this.cr = new R.CharRenderer(glr.gl, { maxJoints: Math.max(32, asset.model.stats?.joints ?? 32) });
      const h3 = new H.Char3D(asset, this.cr, { maxTex: 2048 });
      this.hero.c3 = h3; h3.anim.play('run', { fade: 0 });
      this.crowd.forEach((c, i) => { c.c3 = new H.Char3D(asset, this.cr, { gpu: h3.gpu, weaponGpu: h3.weapon }); c.c3.anim.play(i % 3 ? 'run' : 'idle', { fade: 0 }); c.c3.anim.t = i * 0.07; });
      this.c3restored = glr.restored; this.has3d = true;
    } catch (e) { this.has3d = false; this.err3d = String(e?.message ?? e).slice(0, 80); console.info('[v2bench] 입체 캐릭터를 쓸 수 없어 그 시험은 건너뜁니다:', this.err3d); if (this.cr) { try { this.cr.destroy(); } catch { /* 무시 */ } this.cr = null; } }
    if (!this.glr) return;
    this.loadMs = Math.round(now() - t0);
    this.ready = true;
  }
  /** 셰이더·텍스처 첫 사용 비용을 미리 치른다 (한 번씩 그리고 gl.finish). 걸린 시간 = 미리 데우지 않으면 놀이 중에 멈출 시간 */
  warmUp() {
    const glr = this.glr, keep = [this.present, this.resK, this.chars];
    const run = (chars) => { this.setMode('blit', 1, chars); const a = now(); this.frame(null, 0.3, null); glr.finish(); this.frame(null, 0.33, null); glr.finish(); return Math.round((now() - a) * 10) / 10; };
    this.warm.world = run('none'); this.warm.card = run('card'); this.warm.c3d = this.has3d ? run('3d') : 0;
    this.setMode(...keep);
  }
  /** 겹치는 법 · 해상도 배율 · 캐릭터 경로 */
  setMode(present, resK, chars) {
    this.present = present; this.resK = resK; this.chars = chars === '3d' && !this.has3d ? 'none' : chars;
    this._setLayer(present === 'layer');
    this.cost.upMs = 0; this.cost.blitMs = 0; this.cost.n = 0;
  }
  /** layer: GL 캔버스와 투명 HUD 캔버스를 #screen 위에 얹는다 (시범판 B 의 _setLayer 와 같은 구성) */
  _setLayer(on) {
    const L = this.layer; if (!this.glr || on === L.on) return;
    const app = this.game.canvas?.parentNode; if (!app) return;
    const gc = this.glr.canvas;
    if (on) {
      const hc = document.createElement('canvas'); hc.width = 2; hc.height = 2;
      gc.id = 'v2bench-gl'; hc.id = 'v2bench-hud';
      for (const [c, z] of [[gc, '1'], [hc, '2']]) { const st = c.style; st.position = 'absolute'; st.zIndex = z; st.pointerEvents = 'none'; st.display = 'block'; st.left = '0px'; st.top = '0px'; app.appendChild(c); }
      L.hud = hc; L.hctx = hc.getContext('2d'); L.key = '';
    } else {
      gc.remove(); if (L.hud) { L.hud.remove(); L.hud.width = 1; L.hud.height = 1; } L.hud = null; L.hctx = null;
    }
    L.on = on;
  }
  hideLayer() { this._setLayer(false); }
  get pixels() { const c = this.glr?.canvas; return c ? [c.width, c.height] : [0, 0]; }
  get tris() { return Math.round(this.glr?.stats.tris ?? 0); }
  get draws() { return this.glr?.stats.draws ?? 0; }

  // ── 카메라: 거리 구간의 틀(STAGE.sections[0].cam)을 그대로, 따라가기 지연 없이 ──
  _camera(t, Wv, Hv) {
    const R = STAGE.sections[0].cam, P = PATH;
    const hx = P.x0 + P.v * t, hz = P.z0 + P.zAmp * Math.sin(t * P.zHz * 6.283);
    const yaw = R.yaw + 0.03, pitch = R.pitch, dist = R.dist;
    const tx = hx + (R.leadX ?? 0), tz = 130 + (hz - 130) * (R.zFollow ?? 1) + (R.leadZ ?? 0);
    const tall = Math.max(0, Hv - 540), lx = tx, ly = R.lookY + tall * (R.tallK ?? 0.4), lz = tz;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const px = Math.max(R.minX ?? -1e5, lx - Math.sin(yaw) * cp * dist), py = ly + sp * dist, pz = lz - Math.cos(yaw) * cp * dist;
    let fx = lx - px, fy = ly - py, fz = lz - pz; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const m = this.vp, rl = Math.hypot(fz, fx) || 1, rx = fz / rl, rz = -fx / rl, ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;
    const F = FOCAL * (1 + Math.max(0, Hv - 540) / 540 * 0.3);
    const sx = F / (Wv / 2), sy = F / (Hv / 2), A = (FAR + NEAR) / (FAR - NEAR), B = -2 * FAR * NEAR / (FAR - NEAR);
    const rd = -(rx * px + rz * pz), ud = -(ux * px + uy * py + uz * pz), fd = -(fx * px + fy * py + fz * pz);
    m[0] = sx * rx; m[4] = 0; m[8] = sx * rz; m[12] = sx * rd;
    m[1] = sy * ux; m[5] = sy * uy; m[9] = sy * uz; m[13] = sy * ud;
    m[2] = A * fx; m[6] = A * fy; m[10] = A * fz; m[14] = A * fd + B;
    m[3] = fx; m[7] = fy; m[11] = fz; m[15] = fd;
    this.A = A; this.eye[0] = px; this.eye[1] = py; this.eye[2] = pz; this.fwd = [fx, fy, fz]; this.pitch = pitch;
    // 영웅과 들러리 자리
    const W = this.W, h = this.hero, gy = groundAt(W, hx, hz, 400);
    h.x = hx; h.z = hz; h.y = Number.isFinite(gy) ? gy : 0;
    for (const c of this.crowd) { c.x = hx + c.ox; c.z = clamp(hz + c.oz, 14, 246); const g = groundAt(W, c.x, c.z, 400); c.y = Number.isFinite(g) ? g : 0; }
  }
  /** 납작 그림 경로: v1 퍼펫 13명을 아틀라스에 그리고 텍스처로 올린다 (시범판 B 의 _chars + glr.update) */
  _cards(t) {
    const A = this.atlas, p = this.heroPup;
    A.begin();
    p.facing = 1; p.t = t; p.onGround = true; p.vy = 0; p.dashT = 0; p.vx = 275; p.move = null; p.moveT = 0; p.anim = 'run'; p.animT = t;
    this.hero.uv = A.hero(p);
    for (const c of this.crowd) {
      const q = c.pup, tt = t + c.ph;
      q.facing = c.face; q.t = tt; q.anim = c.kind === 'ranged' ? 'idle' : 'walk'; q.animT = tt; q.flashT = 0; q.stun = 0; q.state = 'chase'; q.vx = 0; q.dying = 0;
      c.uv = A.enemy(q);
    }
  }
  _draw3d(t) {
    const cr = this.cr, glr = this.glr, gl = glr.gl, W = this.W, L = W.light;
    if (this.c3restored !== glr.restored) { this.c3restored = glr.restored; cr.restore(); }
    const dt = this._animT < 0 || t < this._animT ? 0 : Math.min(0.1, t - this._animT); this._animT = t;
    cr.begin({ vp: this.vp, eye: this.eye, fog: W.fog, sunDir: L.moonDir, sun: [0.56, 0.56, 0.62], amb: [0.76, 0.77, 0.84] });
    const one = (o, dx) => {
      const ch = o.c3; ch.anim.update(dt);
      const l = lightAt(W, o.x, o.y + 50, o.z), tint = [clamp(0.5 + 0.7 * l[0], 0, 1.6), clamp(0.5 + 0.7 * l[1], 0, 1.6), clamp(0.5 + 0.7 * l[2], 0, 1.6)];
      ch.draw(ch.place(o.x, o.y, o.z, dx, 0), { tint });
    };
    one(this.hero, 1);
    for (const c of this.crowd) one(c, c.face);
    cr.end();
    glr.stats.draws += cr.stats.draws; glr.stats.tris += cr.stats.tris;
    gl.useProgram(glr.prog); gl.disableVertexAttribArray(4);
  }
  _sky(b) {
    const S = this.W.sky, e = this.eye, R = 9000, hw = R * Math.tan(S.span / 2), yb = e[1] + R * Math.tan(S.bottom), hh = hw * 2 * (940 * S.crop) / 2520;
    for (let i = -1; i <= 1; i++) {
      const x0 = e[0] + (i * 2 - 1) * hw, x1 = x0 + 2 * hw, z = e[2] + R;
      b.quad([x0, yb, z, x1, yb, z, x1, yb + hh, z, x0, yb + hh, z], i ? 1 : 0, 0.002, i ? 0 : 1, 0.998, 1, 1, 1, 1, 1, 0, 0, 0);
    }
  }
  _decals(b) {
    const W = this.W, S = this.spr, bl = S.blob;
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
    if (this.chars === 'none') return;
    const h = this.hero, gl = S.glow, r = 150;
    b.quad([h.x - r, h.y + 0.5, h.z - r * 0.7, h.x + r, h.y + 0.5, h.z - r * 0.7, h.x + r, h.y + 0.5, h.z + r * 0.7, h.x - r, h.y + 0.5, h.z + r * 0.7], gl.u0, gl.v0, gl.u1, gl.v1, 0.55, 0.62, 0.9, 0.16, 0, 0, 4, 1);
    shadow(h.x, h.z, h.y, 30, 0.95);
    for (const c of this.crowd) shadow(c.x, c.z, c.y, 26, 0.9);
  }
  _billboards(b, t) {
    const W = this.W, S = this.spr, L = this.list, e = this.eye, f = this.fwd;
    L.length = 0;
    const depth = (x, y, z) => (x - e[0]) * f[0] + (y - e[1]) * f[1] + (z - e[2]) * f[2];
    const hk = 1 / Math.max(0.8, Math.cos(this.pitch));
    const card = (tex, uv, x, y, z, left, right, down, up, col, a, mode, flash, bias, fog, dOff = 0) => {
      const d = depth(x, y, z) + dOff; if (d < NEAR * 0.5) return;
      L.push({ d, tex, uv, p: [x - left, y - down, z, x + right, y - down, z, x + right, y + up, z, x - left, y + up, z], col, a, mode, flash, bias, fog });
    };
    const tint = (x, y, z, lit = 1) => { const l = lightAt(W, x, y, z); return [clamp(0.5 + 0.7 * l[0], 0, 1.6) * lit, clamp(0.5 + 0.7 * l[1], 0, 1.6) * lit, clamp(0.5 + 0.7 * l[2], 0, 1.6) * lit]; };
    for (const s of W.sprites) {
      if (s.kind !== 'prop') continue;
      const im = S['p:' + s.img]; if (!im) continue;
      if (!s._bc) s._bc = tint(s.x, s.y + s.h * 0.4, s.z - 8, s.lit);
      const w = s.h * im.w / im.h, uv = s.flip ? { u0: im.u1, v0: im.v0, u1: im.u0, v1: im.v1 } : im;
      card(0, uv, s.x, s.y, s.z, w / 2, w / 2, 0, s.h * hk, s._bc, 1, 1, 0, 2, 1);
      if (s.glow) {
        const G = s.glow, r = G.r * (G.flicker ? 0.9 + 0.12 * Math.sin(t * 13 + s.x) + 0.06 * Math.sin(t * 31 + s.z) : 1), gy = s.y + s.h * hk * G.y;
        card(0, S.glow, s.x, gy, s.z - 3, r, r, r, r, G.c, 0.85, 0, 0, 12, 0.6, -6);
        card(0, S.glow, s.x, gy, s.z - 3, r * 2.6, r * 2.6, r * 2.6, r * 2.6, G.c, 0.22, 0, 0, 12, 0.6, -6);
      }
    }
    if (this.chars === 'card') {
      const h = this.hero, C = HERO_CELL, E = ENEMY_CELL;
      if (h.uv) card(1, h.uv, h.x, h.y, h.z, C.ox, C.w - C.ox, (C.h - C.oy) * hk, C.oy * hk, tint(h.x, h.y + 50, h.z), 1, 1, 0, 6, 1);
      for (const c of this.crowd) if (c.uv) card(1, c.uv, c.x, c.y, c.z, E.ox, E.w - E.ox, (E.h - E.oy) * hk, E.oy * hk, tint(c.x, c.y + 50, c.z), 1, 1, 0, 6, 1);
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
  /**
   * 한 프레임. ctx = 게임 캔버스의 2D 컨텍스트 (blit 일 때 여기에 옮긴다; null 이면 GL 만 그린다 — 데우기용).
   * t = 길 위의 시각(초). hud(c2d, Wv, Hv) = 진행 표시를 그리는 함수 (layer 면 HUD 캔버스에, blit 면 게임 캔버스에).
   */
  frame(ctx, t, hud) {
    const g = this.game, glr = this.glr, Wv = g.viewW, Hv = g.viewH, C = this.cost;
    if (!this.ready && !this.meshes) return false;
    if (glr.lost) return false;
    glr.resize(Math.max(2, Math.round(g.canvas.width * this.resK)), Math.max(2, Math.round(g.canvas.height * this.resK)));
    this._camera(t, Wv, Hv);
    if (this.chars === 'card') { const a = now(); this._cards(t); glr.update(this.charTex, this.atlas.canvas, this.atlas.used); C.upMs += now() - a; }
    const b = this.batch; b.reset();
    this._sky(b); const nSky = b.n;
    this._decals(b); const nDecal = b.n - nSky;
    const runs = this._billboards(b, t);
    glr.begin(this.vp, this.W.fog, this.W.sky.top, this.A);
    glr.uploadDyn(b.n);
    glr.drawDyn(this.skyTex, 0, nSky, false);
    for (const m of this.meshes) glr.drawMesh(m.mesh, m.tex);
    if (this.chars === '3d') this._draw3d(t);
    glr.gl.bindBuffer(glr.gl.ARRAY_BUFFER, glr.dyn.buf); glr._attribs();
    glr.drawDyn(this.propTex, nSky, nDecal, true);
    for (const r of runs) glr.drawDyn(r.t ? this.charTex : this.propTex, r.first, r.count, true);
    C.n++;
    if (!ctx) return true;
    const L = this.layer;
    if (L.on) {
      const r = g.canvas.getBoundingClientRect(), key = [r.left, r.top, r.width, r.height, g.canvas.width, g.canvas.height].join(',');
      if (key !== L.key) {
        L.key = key;
        for (const c of [glr.canvas, L.hud]) { const st = c.style; st.left = r.left + 'px'; st.top = r.top + 'px'; st.width = r.width + 'px'; st.height = r.height + 'px'; }
        L.hud.width = g.canvas.width; L.hud.height = g.canvas.height;
      }
      const o = L.hctx;
      o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, L.hud.width, L.hud.height); o.setTransform(g.scale, 0, 0, g.scale, 0, 0);
      if (hud) hud(o, Wv, Hv);
    } else {
      const a = now();
      ctx.drawImage(glr.canvas, 0, 0, Wv, Hv);
      C.blitMs += now() - a;
      if (hud) hud(ctx, Wv, Hv);
    }
    return true;
  }
  destroy() {
    this._setLayer(false);
    if (this.cr) { try { this.cr.destroy(); } catch { /* 무시 */ } this.cr = null; }
    if (this.glr) { this.glr.destroy(); this.glr = null; }
    if (this.atlas) { this.atlas.canvas.width = 1; this.atlas.canvas.height = 1; this.atlas = null; }
    for (const c of this._canvases ?? []) { c.width = 1; c.height = 1; }
    this._canvases = null; this.ready = false;
  }
}
