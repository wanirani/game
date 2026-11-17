// v2g — the real game scene (P1, milestone M1). docs/v2/ENGINE_API.md is the contract for the other lanes.
//   glr.js     world renderer (static meshes + dynamic ground decals)     charr.js  skinned characters (flash, dissolve, fx lights)
//   cast.js    one GPU model per kind, one Rig + Animator per instance    magic.js  enemy shots as 3D effects
//   area.js    area loading seam    hud.js  built-in minimal HUD    perf.js  saved performance settings    seams.js  lane switches
// Rules come only from src/v2/play (Sim, TUNE, KINDS, driveHero, driveActor). Effects: src/v2/fx. Sound + feel table: src/v2/feel.
// Nothing flat: every character is a 3D model, shots are effects, prop cards of the stage are not drawn.
// Picture layers: WebGL canvas UNDER the (alpha) game canvas when the shell allows it ('under'); otherwise the B way ('layer').
// 60 Hz ticks, drawn on every display frame with interpolation (game.alpha). No allocation in the tick / draw paths.
import { Scene, STEP } from '../../core/game.js';
import { input } from '../../core/input.js';
import { assets, ASSET_ROOT } from '../../core/assets.js';
import { groundAt, sectionAt } from '../b/world.js';
import { KIT_TEX } from '../env/mats.js';
import { Sim, TUNE, KINDS, driveHero, driveActor } from '../play/index.js';
import { driveHero as PLACEHOLDER_DRIVE_HERO } from '../char3d/hero3d.js';
import { createFx, PRESET_IDS, hurtFlash, dissolveK } from '../fx/index.js';
import { TRAIL } from '../fx/presets.js';
import { RB } from '../fx/engine.js';
import { feel, FLAG } from '../feel/index.js';
import { GLR, SpriteBatch } from './glr.js';
import { CharRenderer } from './charr.js';
import { Cast } from './cast.js';
import { loadArea, roomOf, DEFAULT_AREA } from './area.js';
import { createBuiltinHud } from './hud.js';
import { readPerf } from './perf.js';
import { UI_LOADER } from './seams.js';
import { elementOf, shotAttach, shotMove, shotDetach, shotImpact } from './magic.js';

const FOCAL = 880, NEAR = 60, FAR = 24000, DIE_T = 0.9, HERO_MODEL = 'kael';
const TEX_SRC = {
  flag: { src: 'tex/tex_mossy_stone', desat: 0.35 }, block: { src: 'tex/tex_castle_stone' }, brick: { src: 'tex/tex_wet_stone', desat: 0.8 },
  wood: { src: 'tex/tex_wood' }, dirt: { src: 'tex/tex_dirt' },
};
const HIDE_BTNS = ['sub', 'skill1', 'skill2', 'ult', 'swap', 'mount', 'guard', 'lock'];
const DASH_TRAIL = RB({ mode: 1, life: 0.24, width: 58, col: [0.45, 0.8, 2.2, 0.5] });
const SUN = [0.56, 0.56, 0.62], AMB = [0.76, 0.77, 0.84], RIM_HERO = [0.6, 0.7, 1, 0.5], RIM_WARN = [1.7, 0.35, 0.2, 0.85], RIM_ENEMY = [0.55, 0.65, 0.9, 0.35];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const PX = new Uint8Array(4);

/** stain decals drawn once into the small atlas (same pictures as the v2c scene) */
function drawDecalSprites(x, ox, oy) {
  const R = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  const blob = (cx, cy, n, r0, col, seed, a0 = 0.5) => {
    const r = R(seed);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 40, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9, rr = r0 * (0.5 + r());
      const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, col.replace('A', String(a0 * (0.5 + 0.5 * r())))); g.addColorStop(1, col.replace('A', '0'));
      x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    }
  };
  x.save(); x.beginPath(); x.rect(ox, oy, 128, 128); x.clip(); blob(ox + 64, oy + 64, 60, 20, 'rgba(96,128,70,A)', 7, 0.55); blob(ox + 64, oy + 64, 80, 5, 'rgba(150,180,96,A)', 9, 0.6); x.restore();
  x.save(); x.beginPath(); x.rect(ox + 132, oy, 128, 128); x.clip();
  blob(ox + 196, oy + 64, 26, 30, 'rgba(10,14,26,A)', 11, 0.9); blob(ox + 190, oy + 58, 10, 16, 'rgba(110,130,190,A)', 13, 0.35);
  x.globalAlpha = 0.5; x.fillStyle = '#dfe6ff'; x.beginPath(); x.ellipse(ox + 180, oy + 52, 14, 2.2, -0.2, 0, 7); x.fill(); x.beginPath(); x.ellipse(ox + 206, oy + 70, 9, 1.6, -0.2, 0, 7); x.fill(); x.restore();
  x.save(); x.beginPath(); x.rect(ox + 264, oy, 128, 128); x.clip(); blob(ox + 328, oy + 64, 40, 26, 'rgba(0,0,0,A)', 17, 0.4); x.restore();
  return { moss: [ox, oy], puddle: [ox + 132, oy], stain: [ox + 264, oy] };
}

export default class V2Game extends Scene {
  constructor(game) {
    super(game);
    this.showPad = true; this.padHideButtons = HIDE_BTNS;
    this.glUnder = true;          // game.render() clears instead of filling black when the shell canvas has alpha
    this.everyFrame = true;       // draw on every display frame (core/game.js flag)
    this.ready = false; this.glError = null; this.glr = null;
  }
  // ───────────────────────── enter / exit ─────────────────────────
  enter(params) {
    const g = this.game;
    this.perf = readPerf(); this.everyFrame = this.perf.everyFrame;
    this.mode = g.canvasAlpha ? 'under' : 'layer';
    try { globalThis.localStorage?.setItem('bn.v2.under', '1'); } catch { /* private mode */ }   // next launch boots with an alpha canvas
    this.story = typeof params?.story === 'function' ? params.story : null; this.ui = { dialog: null }; this.locked = false;
    this.area = null; this.W = null; this.sim = null; this.fx = null; this.cr = null; this.cast = null; this.hud = createBuiltinHud();
    this.heroA = null; this.actors = []; this.pool = new Map(); this._ERef = null;
    this.shotL = new Array(32).fill(null); this.shotN = 0;
    this.cam = { yaw: 0, pitch: 0.35, dist: 800, lookY: 60, leadX: 0, leadZ: 0, face: 1, tx: 0, ty: 0, tz: 0, px: 0, py: 300, pz: -700, snap: true, fx: 0, fy: -0.3, fz: 0.95, zf: null, ck: 0, tallK: 0.4, minX: -1e5, maxX: 1e5, lastCenter: null };
    this.camP = { px: 0, py: 300, pz: -700, fx: 0, fy: -0.3, fz: 0.95 };
    this.vp = new Float32Array(16); this.eye = new Float32Array(3); this.eye0 = new Float32Array(3); this.camR = new Float32Array(3); this.camU = new Float32Array(3); this.camF = new Float32Array(3);
    this.fxCam = { vp: this.vp, eye: this.eye, right: this.camR, up: this.camU, fwd: this.camF };
    this.env = { vp: this.vp, eye: this.eye, fog: null, sunDir: new Float32Array(3), sun: SUN, amb: AMB };
    this.A = 1; this.focal = FOCAL;
    this.samples = new Float32Array(300); this.sampleN = 0; this.sorted = new Float32Array(300); this.updMs = 0;
    this.inp = { mx: 0, mz: 0, jump: false, jumpHeld: false, attack: false, attackHeld: false, dash: false, guard: false, lockNext: false, jumpUsed: false };
    this.numbers = []; for (let i = 0; i < 16; i++) this.numbers.push({ on: false, x: 0, y: 0, z: 0, str: '', color: '#fff', t: 0, big: false });
    this.P12 = new Float32Array(12); this.tmpA = new Float32Array(3); this.tmpB = new Float32Array(3); this.tint = new Float32Array(3); this.pos = { x: 0, y: 0, z: 0 }; this.pr = { x: 0, y: 0, w: 0 };
    this.visY = 0; this.visYP = 0; this.stride = 0; this._mv = null; this._rb = -1; this._swung = false; this._dashRb = -1; this._secId = ''; this._deaths = 0; this._ts = 1; this.doneT = 0; this._restored = 0;
    this.c3 = { draws: 0, tris: 0, drawn: 0, culled: 0 }; this.envStat = { chunks: 0, tris: 0, draws: 0 };
    this.layer = { hud: null, hctx: null, timer: 0, shown: true, cw: 0, ch: 0, iw: 0, ih: 0, force: true };
    this.fired = new Set();
    const sc = this;
    this.state = {
      viewW: g.viewW, viewH: g.viewH, safe: g.safe ?? { l: 0, t: 0, r: 0, b: 0 }, scale: g.scale, time: 0, hero: null, heroHpMax: TUNE.heroHp ?? 100,
      area: { id: '', name: '' }, section: { id: '', label: '' }, enemies: [], enemiesLeft: 0, yardLeft: 0, numbers: this.numbers, numberN: 0,
      project: (x, y, z, out) => sc.project(x, y, z, out), done: false, doneT: 0, loading: true, message: '', message2: '', debug: this.perf.debug,
      debugLine: () => sc._debugLine(), stats: () => sc.stats(), dialog: null,
    };
    try { this.glr = new GLR({}); } catch (e) { this.glError = String(e?.message ?? e); console.warn('[v2g]', this.glError); }
    if (this.glr) {
      this._attach();
      this._load(params?.area ?? DEFAULT_AREA).catch((e) => { this.glError = String(e?.message ?? e); console.error('[v2g] load failed', e); });
    }
    if (UI_LOADER) UI_LOADER().then((m) => { if (this.glr && typeof m.createHud === 'function') { const h = m.createHud(g); if (h) { this.hud = h; if (h.padHideButtons) this.padHideButtons = h.padHideButtons; if (h.hidePad) { this.showPad = false; this.hidePad = true; } } } }).catch((e) => console.warn('[v2g] ui module failed to load, using the built-in HUD:', String(e?.message ?? e)));
    try { feel.preload(); } catch { /* no audio yet */ }
    this._api();
  }
  exit() {
    this._detach();
    try { feel.setTimeScale(1); feel.release(); } catch { /* no audio */ }
    try { this.hud?.dispose?.(); } catch { /* ui lane */ }
    if (this.fx) { try { this.fx.dispose(); } catch { /* lost context */ } this.fx = null; }
    if (this.cr) { this.cr.destroy(); this.cr = null; }
    if (this.glr) { this.glr.destroy(); this.glr = null; }
    for (const c of this._canvases ?? []) { c.width = 1; c.height = 1; }
    this._canvases = null; this.ready = false; this.actors.length = 0; this.pool.clear(); this.heroA = null; this.cast = null; this.sim = null; this.W = null;
    if (globalThis.__v2?.scene === this) delete globalThis.__v2;
  }
  setStory(fn) { this.story = typeof fn === 'function' ? fn : null; }
  /** story / event seam: the scene calls story(name, data, api) on triggers */
  emit(name, data) {
    if (!this.story) return;
    if (!this._sapi) {
      const sc = this;
      this._sapi = {
        scene: sc, get sim() { return sc.sim; }, lock(on) { sc.locked = !!on; }, toast(t) { sc.game.toast?.(t); }, teleport(id) { return globalThis.__v2?.teleport(id); },
        gotoArea(id, spawn) { return sc.gotoArea(id, spawn); }, fx(n, o) { sc.fx?.play(n, o); }, sound(n, pos) { try { feel.play(n, pos ?? null); } catch { /* no audio */ } }, setDialog(d) { sc.ui.dialog = d ?? null; },
      };
    }
    try { this.story(name, data, this._sapi); } catch (e) { console.error('[v2g] story handler failed:', name, e); }
  }
  /** leave this area for another one (black fade by the caller is optional; resources of the old area are released) */
  async gotoArea(id, spawn) {
    if (!this.glr) return false;
    this.ready = false; this.state.loading = true;
    this._releaseArea();
    await this._load(id, spawn);
    return this.ready;
  }
  // ───────────────────────── DOM layers ─────────────────────────
  _attach() {
    const cv = this.game.canvas, app = cv?.parentNode, gc = this.glr.canvas, L = this.layer; if (!app) return;
    gc.id = 'v2g-gl'; const st = gc.style; st.position = 'absolute'; st.pointerEvents = 'none'; st.display = 'block'; st.left = '0px'; st.top = '0px';
    if (this.mode === 'under') {
      st.zIndex = '0'; this._cvStyle = [cv.style.position, cv.style.zIndex]; cv.style.position = 'relative'; cv.style.zIndex = '1';
      app.insertBefore(gc, cv);
    } else {
      const hc = document.createElement('canvas'); hc.width = 2; hc.height = 2; hc.id = 'v2g-hud';
      const hs = hc.style; hs.position = 'absolute'; hs.pointerEvents = 'none'; hs.display = 'block'; hs.left = '0px'; hs.top = '0px'; hs.zIndex = '2'; st.zIndex = '1';
      app.appendChild(gc); app.appendChild(hc); L.hud = hc; L.hctx = hc.getContext('2d');
      L.timer = setInterval(() => this._show(this.game.top === this), 200);   // another scene on top: hide the layers
    }
    L.force = true;
  }
  _detach() {
    const L = this.layer, cv = this.game.canvas; if (!L) return;
    if (L.timer) { clearInterval(L.timer); L.timer = 0; }
    if (this.glr) this.glr.canvas.remove();
    if (L.hud) { L.hud.remove(); L.hud.width = 1; L.hud.height = 1; L.hud = null; L.hctx = null; }
    if (this._cvStyle && cv) { cv.style.position = this._cvStyle[0]; cv.style.zIndex = this._cvStyle[1]; this._cvStyle = null; }
  }
  _show(v) { const L = this.layer; if (!this.glr || L.shown === v) return; L.shown = v; const d = v ? 'block' : 'none'; this.glr.canvas.style.display = d; if (L.hud) L.hud.style.display = d; }
  _place() {
    const g = this.game, cv = g.canvas, L = this.layer, iw = globalThis.innerWidth | 0, ih = globalThis.innerHeight | 0;
    if (!L.force && L.cw === cv.width && L.ch === cv.height && L.iw === iw && L.ih === ih) return;
    L.force = false; L.cw = cv.width; L.ch = cv.height; L.iw = iw; L.ih = ih;
    const r = cv.getBoundingClientRect(), st = this.glr.canvas.style;
    st.left = r.left + 'px'; st.top = r.top + 'px'; st.width = r.width + 'px'; st.height = r.height + 'px';
    if (L.hud) { const hs = L.hud.style; hs.left = st.left; hs.top = st.top; hs.width = st.width; hs.height = st.height; L.hud.width = cv.width; L.hud.height = cv.height; }
  }
  resize() { if (this.layer) this.layer.force = true; }
  // ───────────────────────── loading ─────────────────────────
  _releaseArea() {
    const glr = this.glr, gl = glr.gl;
    if (this.fx) this.fx.clear();
    for (const m of this.envMeshes ?? []) { if (m.mesh.buf) { gl.deleteBuffer(m.mesh.buf); glr.stats.bufBytes -= m.mesh.data.byteLength; } const i = glr.meshList.indexOf(m.mesh); if (i >= 0) glr.meshList.splice(i, 1); }
    this.envMeshes = null; this.sim = null; this._ERef = null; this.shotN = 0;
    for (const a of this.actors) this._free(a);
    this.actors.length = 0;
  }
  async _load(areaId, spawn) {
    const t0 = performance.now(), glr = this.glr, first = !this.tex;
    const area = await loadArea(areaId), W = area.W, E = W.env;
    if (!this.glr) return;
    const cvs = this._canvases ?? (this._canvases = []);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; cvs.push(c); return c; };
    this.urls = this.urls ?? new Set();
    // 1) world textures: v1 stone/wood files + env kit files, only the ones this area uses
    const need = E.stats.textures.filter((n) => !(this.tex && this.tex[n]));
    const imgs = {}, jobs = [];
    for (const n of need) {
      if (TEX_SRC[n]) jobs.push(assets.load(TEX_SRC[n].src).then((im) => { imgs[n] = im && im.width > 1 ? im : null; }, () => { imgs[n] = null; }));
      else jobs.push(new Promise((res) => { const im = new Image(); im.onload = () => { imgs[n] = im; res(); }; im.onerror = () => { imgs[n] = null; console.warn('[v2g] texture failed to load:', n); res(); }; im.src = `${ASSET_ROOT}v2/env/${n}.webp`; this.urls.add(`assets/v2/env/${n}.webp`); }));
    }
    if (first) jobs.push(assets.load(W.sky.img).then((im) => { imgs.__sky = im && im.width > 1 ? im : null; }, () => { imgs.__sky = null; }));
    await Promise.all(jobs);
    if (!this.glr) return;
    this.tex = this.tex ?? {};
    for (const n of need) {
      const im = imgs[n], T = TEX_SRC[n], c = mk(T ? 512 : im?.width ?? 64, T ? 512 : im?.height ?? 64), x = c.getContext('2d');
      if (im) x.drawImage(im, 0, 0, c.width, c.height); else { x.fillStyle = '#6a6a72'; x.fillRect(0, 0, c.width, c.height); }
      if (T?.desat) { x.globalCompositeOperation = 'saturation'; x.globalAlpha = T.desat; x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
      this.tex[n] = glr.texture(() => c, { repeat: T ? true : KIT_TEX[n]?.repeat ?? true, mip: true });
    }
    if (first) {
      {   // sky backdrop: the top of the painted background, melted into the fog colour at the bottom
        const c = mk(2048, 512), x = c.getContext('2d'), im = imgs.__sky;
        if (im) x.drawImage(im, 0, 0, im.width, im.height * W.sky.crop, 0, 0, 2048, 512);
        else { const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#0a1018'); g.addColorStop(1, '#2a1a26'); x.fillStyle = g; x.fillRect(0, 0, 2048, 512); }
        const g = x.createLinearGradient(0, 380, 0, 512); g.addColorStop(0, 'rgba(18,24,34,0)'); g.addColorStop(1, 'rgba(18,24,34,1)'); x.fillStyle = g; x.fillRect(0, 380, 2048, 132);
        this.skyTex = glr.texture(() => c, {});
      }
      {   // small atlas for ground decals and lamp glows (no prop cards)
        const c = mk(1024, 256), x = c.getContext('2d'), R = (this.spr = {});
        const put = (name, px, w, h, draw) => { x.save(); x.translate(px, 2); draw(x); x.restore(); R[name] = { u0: (px + 0.5) / 1024, v0: 2.5 / 256, u1: (px + w - 0.5) / 1024, v1: (2 + h - 0.5) / 256 }; };
        const radial = (stops) => (q) => { const g = q.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [o, col] of stops) g.addColorStop(o, col); q.fillStyle = g; q.fillRect(0, 0, 128, 128); };
        put('glow', 2, 128, 128, radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]));
        put('blob', 134, 128, 128, radial([[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]));
        const d = drawDecalSprites(x, 266, 2), uv = ([px, py]) => ({ u0: (px + 1) / 1024, v0: (py + 1) / 256, u1: (px + 127) / 1024, v1: (py + 127) / 256 });
        R.moss = uv(d.moss); R.puddle = uv(d.puddle); R.stain = uv(d.stain);
        this.sprTex = glr.texture(() => c, {});
      }
      this.batch = new SpriteBatch(glr);
    }
    // 2) static meshes (chunk x texture) and what hangs on the ground
    this.envMeshes = E.meshes.map((m) => ({ chunk: m.chunk, mesh: glr.mesh(m.data, m.count), tex: this.tex[m.tex], tris: m.count / 3, on: true })).filter((m) => m.tex);
    this.envChunks = [...E.bounds.entries()].map(([id, b]) => ({ id, b, on: true }));
    for (const m of this.envMeshes) m.c = this.envChunks.find((q) => q.id === m.chunk) ?? null;
    for (const d of E.decals) { this._tintAt(W, d.x, (d.y ?? 0) + 4, d.z, 1, 1.8, this.tint); d._c = [this.tint[0], this.tint[1], this.tint[2]]; }
    // 3) characters: the hero + only the kinds this area spawns
    const kinds = [...new Set(W.spawns.map((s) => s.kind))].filter((k) => KINDS[k]);
    const missing = [...new Set(W.spawns.map((s) => s.kind))].filter((k) => !KINDS[k]);
    if (missing.length) console.warn('[v2g] spawn kinds without a KINDS entry are not drawn:', missing.join(', '));
    if (!this.cr) { this.cr = new CharRenderer(glr.gl, { maxJoints: 24 }); this.cast = new Cast(this.cr); this._restored = glr.restored; }
    await this.cast.load([{ model: HERO_MODEL, hero: true }, ...kinds.map((k) => ({ model: KINDS[k].model }))], ['blade', ...kinds.map((k) => KINDS[k].weapon)], { texCap: this.perf.texCap, libWins: driveHero !== PLACEHOLDER_DRIVE_HERO });
    if (!this.glr) return;
    if (!this.heroA) this.heroA = this.cast.actor(HERO_MODEL, 'blade', {});
    // 4) effects
    if (!this.fx) this._makeFx();
    // 5) rules
    this.area = area; this.W = W; this.env.fog = W.fog;
    { const d = W.light.moonDir, l = Math.hypot(d[0], d[1], d[2]) || 1; this.env.sunDir[0] = d[0] / l; this.env.sunDir[1] = d[1] / l; this.env.sunDir[2] = d[2] / l; }
    this.sim = new Sim(W, this._hooks());
    if (spawn && this.sim.teleport) this.sim.teleport(spawn);
    this._deaths = this.sim.deaths ?? 0; this._secId = ''; this.cam.snap = true; this.doneT = 0; this.fired.clear();
    this.state.area.id = area.id; this.state.area.name = area.name;
    // 6) warm everything behind the loading screen, then wait for the GPU
    for (const k of kinds) for (let i = this._poolOf(KINDS[k].model).length; i < Math.min(4, W.spawns.length); i++) { const a = this._newActor(k); if (a) this._free(a); }
    this._tick0();
    this._warm();
    this.loadMs = Math.round(performance.now() - t0);
    this.ready = true; this.state.loading = false; this.sampleN = 0;
    this.emit('area.enter', { area: area.id });
  }
  _makeFx() {
    const p = this.perf;
    try { this.fx = createFx(this.glr.gl, { tier: p.tier, post: p.post, groundY: 0, lightPools: true, feel: false }); }
    catch (e) { console.warn('[v2g] effects are off:', String(e?.message ?? e)); this.fx = null; }
    this._rb = -1; this._dashRb = -1; this._mv = null;
    for (let i = 0; i < this.shotN; i++) this.shotL[i]._rb = undefined;   // handles of a lost context are dead
    this.shotN = 0;
  }
  /** draw every model, texture and effect once and block until the GPU has really done it (no hitch in the first fight) */
  _warm() {
    const glr = this.glr, gl = glr.gl, fx = this.fx, g = this.game, h = this.sim.hero;
    this._camera(1 / 60);
    if (fx) {
      const P = PRESET_IDS, x = h.x + 60, y = h.y, z = h.z;
      for (const n of ['hit.slash.light', 'hit.slash.heavy', 'hit.crit', 'hit.finisher', 'hit.guard', 'swing.light', 'swing.heavy', 'move.dash', 'move.land', 'move.step', 'move.jump', 'enemy.hurt', 'enemy.death.bone', 'enemy.death.ash']) if (P[n] !== undefined) fx.playAt(P[n], x, y + 50, z, 1, 0, 1, x + 200, y, z);
      const el = elementOf(this.pos, null); shotImpact(fx, el, x, y + 50, z, y);
      const rb = fx.ribbons.start(TRAIL.blade); fx.ribbons.push(rb, x, y + 20, z, x, y + 80, z); fx.update(0.02); fx.ribbons.push(rb, x + 30, y + 20, z, x + 30, y + 80, z); fx.ribbons.end(rb);
      fx.feel.flash(1, 1, 1, 0.2); fx.update(0.03);
    }
    this._gl(g.viewW, g.viewH, 1, true);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PX);
    if (fx) { fx.clear(); this._gl(g.viewW, g.viewH, 1, false); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PX); }
  }
  // ───────────────────────── characters ─────────────────────────
  _poolOf(model) { let p = this.pool.get(model); if (!p) { p = []; this.pool.set(model, p); } return p; }
  _newActor(kind) { const K = KINDS[kind]; if (!K) return null; const a = this.cast.actor(K.model, K.weapon, { height: K.height, grip: K.grip, scale: K.scale }); if (a) { a.kind = kind; a.e = null; } return a; }
  _take(e) {
    const K = KINDS[e.kind]; if (!K) return null;
    const p = this._poolOf(K.model); let a = p.length ? p.pop() : this._newActor(e.kind); if (!a) return null;
    a.kind = e.kind; a.e = e; a.hitAge = 9; a.dieAge = -1; a.vis = true; a.kbT = 0; a.wasDead = false; a.seed = Math.random() * 7;
    const fx = e.dirX ?? e.facing ?? -1, fz = e.dirZ ?? 0, l = Math.hypot(fx, fz) || 1; a.dx = fx / l; a.dz = fz / l;
    a.anim.play(a.asset.clips.idle ? 'idle' : Object.keys(a.asset.clips)[0], { fade: 0, restart: true }); a.anim.update(0);
    e._a3 = a; this.actors.push(a);
    return a;
  }
  _free(a) { if (a.e && a.e._a3 === a) a.e._a3 = null; a.e = null; this._poolOf(a.asset.id).push(a); }
  /** baked light of the stage at a point -> out[0..2] (same formula as world.js lightAt without a normal; allocation-free) */
  _tintAt(W, x, y, z, k0, max, out) {
    const L = W.light; let r = L.ambient[0] + L.moon[0] * 0.55, g = L.ambient[1] + L.moon[1] * 0.55, b = L.ambient[2] + L.moon[2] * 0.55;
    const PL = W.lights;
    for (let i = 0; i < PL.length; i++) {
      const p = PL[i], dx = p.x - x, dy = p.y - y, dz = p.z - z, d2 = dx * dx + dy * dy + dz * dz; if (d2 > p.r * p.r) continue;
      const q = 1 - Math.sqrt(d2) / p.r, k = q * q * 0.7 * p.i; r += p.c[0] * k; g += p.c[1] * k; b += p.c[2] * k;
    }
    if (k0 === 1) { out[0] = clamp(r, 0, max); out[1] = clamp(g, 0, max); out[2] = clamp(b, 0, max); }
    else { out[0] = clamp(0.5 + 0.7 * r, 0, max); out[1] = clamp(0.5 + 0.7 * g, 0, max); out[2] = clamp(0.5 + 0.7 * b, 0, max); }
    return out;
  }
  // ───────────────────────── rule hooks -> feel + effects ─────────────────────────
  _hooks() {
    const sc = this, P = PRESET_IDS;
    const play = (id, x, y, z, dx, dz, pow) => { if (sc.fx && id !== undefined) sc.fx.playAt(id, x, y, z, dx, dz, pow, x + dx * 320, y, z + dz * 320); };
    const snd = (name, pos) => { try { return feel.play(name, pos); } catch { return null; } };
    const number = (x, y, z, str, color, big) => { const N = sc.numbers; let n = N[0]; for (let i = 0; i < N.length; i++) { if (!N[i].on) { n = N[i]; break; } if (N[i].t > n.t) n = N[i]; } n.on = true; n.x = x; n.y = y; n.z = z; n.str = str; n.color = color; n.t = 0; n.big = !!big; };
    return {
      hit(e, dmg, mv, x, y, z) {
        const h = sc.sim.hero, K = KINDS[e.kind], kill = e.hp <= 0;
        const st = mv?.strength ?? (mv?.finisher || mv?.id === 'sw3' ? 'H' : 'M');
        let flags = mv?.crit ? FLAG.crit : 0;
        if (kill) { flags |= FLAG.kill; let left = 0; const E = sc.sim.enemies; for (let i = 0; i < E.length; i++) if (E[i] !== e && !E[i].dead && E[i].state !== 'dead' && E[i].hp > 0 && (E[i].yard || !e.yard)) left++; if (e.yard && left === 0) flags |= FLAG.finisher; }
        let r = null; try { r = feel.hit(mv?.weapon ?? 'sword', K?.material ?? 'bone', st, flags, e); } catch { r = null; }
        const dx = h.dirX ?? h.facing ?? 1, dz = h.dirZ ?? 0, F = sc.fx?.feel;
        if (F && r) {
          F.hitStop(r.stop, !!r.big); sc.fx.trauma(r.shake, dx, 0, dz); if (r.kick) F.kick(dx, 0, dz, r.kick);
          if (r.zoom > 1) F.zoomPunch(r.zoom - 1, (r.zoomT ?? 0) * 0.5);
          if (r.slow) F.slowMo(r.slow[1], r.slow[0]);
          if (flags & FLAG.finisher) { F.flash(1, 0.92, 0.75, 0.42); F.vignette(1, 0.45, 0.1, 0.3); }
        }
        play(flags & FLAG.finisher ? P['hit.finisher'] : flags & FLAG.crit ? P['hit.crit'] : st === 'H' || st === 'F' ? P['hit.slash.heavy'] : P['hit.slash.light'], x, y, z, dx, dz, 1);
        play(P['enemy.hurt'], x, y, z, dx, dz, 1);
        if (e._a3) e._a3.hitAge = 0;
        number(e.x, e.y + (e.h ?? 80) + 14, e.z, String(dmg), st === 'H' || st === 'F' ? '#ffd870' : '#ffffff', st === 'F' || !!(flags & FLAG.crit));
        try { input.rumble?.(0.3, 0.5, 40); } catch { /* no pad */ }
      },
      kill(e) {
        const K = KINDS[e.kind], h = sc.sim.hero, dx = h.dirX ?? h.facing ?? 1, dz = h.dirZ ?? 0, a = e._a3;
        if (a && a.dieAge < 0) a.dieAge = 0;
        if ((K?.death ?? (K?.material === 'bone' ? 'bone' : 'ash')) === 'bone') play(P['enemy.death.bone'], e.x, e.y, e.z, dx, dz, 1);
        play(P['enemy.death.ash'], e.x, e.y, e.z, dx, dz, 1);
        sc.emit('enemy.kill', { enemy: e });
      },
      heroHurt(dmg, pit) {
        const h = sc.sim.hero, r = snd('hero.hurt', h), F = sc.fx?.feel;
        if (F) { F.hitStop(r?.stop ?? 0.07); F.addTrauma(r?.shake ?? 0.4); F.vignette(1, 0, 0.12, 0.5, 2.5); } else sc.game.vignette?.('#ff0020', 0.5, 2.5);
        if (!pit) play(P['enemy.hurt'], h.x, h.y + 55, h.z, -(h.dirX ?? 1), -(h.dirZ ?? 0), 1.4);
      },
      sfx(name) {
        const h = sc.sim.hero, dx = h.dirX ?? h.facing ?? 1, dz = h.dirZ ?? 0;
        if (name === 'dash') { snd('move.dash', h); play(P['move.dash'], h.x, h.y, h.z, dx, dz, 1); }
        else if (name === 'jump') { snd('move.jump', h); play(P['move.jump'], h.x, h.y, h.z, dx, dz, 1); }
        else if (name === 'land') { const hard = sc._fallV < -900; snd(hard ? 'move.land_heavy' : 'move.land', h); play(P['move.land'], h.x, h.y, h.z, dx, dz, hard ? 1.4 : 0.8); }
        else if (name === 'swing') { try { feel.swing('blunt', 'M', null); } catch { /* no audio */ } }
        else if (name === 'cast') snd('enemy.mage.chant', null);
        else if (name === 'parry') { try { feel.parry('sword', h); } catch { /* no audio */ } play(P['hit.guard'], h.x + dx * 50, h.y + 55, h.z + dz * 50, dx, dz, 1.3); const F = sc.fx?.feel; if (F) { F.hitStop(0.07); F.addTrauma(0.14); } }
        else if (name === 'die') { snd('hero.hurt', h); sc.emit('hero.dead', {}); }
        else { const mv = h.move; try { feel.swing(mv?.weapon ?? 'sword', mv?.strength ?? (h.combo >= 2 ? 'H' : 'M'), h); } catch { /* no audio */ } }
      },
      spark(x, y, z, kind) {
        if (kind === 'shot') { const el = elementOf(sc.pos, null); if (sc.fx) { const gy = groundAt(sc.W, x, z, y + 20); shotImpact(sc.fx, el, x, y, z, Number.isFinite(gy) ? gy : y - 50); } sc.pos.x = x; sc.pos.y = y; sc.pos.z = z; try { feel.magic(el.sound, 'impact', sc.pos); } catch { /* no audio */ } }
        else if (kind === 'hit') play(P['enemy.hurt'], x, y, z, 1, 0, 1);
      },
      number(x, y, z, str, color) { number(x, y, z, str, color, false); },
      shake(px) { sc.fx?.feel.addTrauma(clamp(px / 40, 0, 0.6)); },
      done() { sc.doneT = 0; try { feel.bell('dawn'); } catch { /* no audio */ } sc.emit('area.clear', { area: sc.area?.id }); },
      fx(name, x, y, z, dx = 1, dz = 0, pow = 1, tx = x + dx * 320, ty = y, tz = z + dz * 320) { const id = P[name]; if (sc.fx && id !== undefined) sc.fx.playAt(id, x, y, z, dx, dz, pow, tx, ty, tz); },
      event(name, data) { sc.emit(name, data); },
      sound(name, pos) { snd(name, pos ?? null); },
    };
  }
  // ───────────────────────── tick ─────────────────────────
  update(dt) {
    const t0 = performance.now(), g = this.game;
    if (input.pressed('menu') && g.registry.title) { if (g.registry.v2pick) g.go('v2pick', {}, { fade: true }); else g.go('title', {}, { fade: true }); return; }
    if (!this.ready || !this.glr || this.glr.lost) return;
    const sim = this.sim, inp = this.inp, fx = this.fx;
    let mx = input.analogX || input.axisX, mz = -(input.analogY || input.axisY);
    { const T = input.touchStick ?? input._touchVec; if (input.mode === 'touch' && T && T.mag > 0.1) { mx = T.x; mz = -T.y; } }   // touch stick: raw 360 degrees
    if (this.locked) { mx = 0; mz = 0; }
    inp.mx = mx; inp.mz = mz; inp.jump = !this.locked && input.buffered('jump', 0.12); inp.jumpHeld = input.down('jump'); inp.jumpUsed = false;
    inp.attackHeld = input.down('attack'); inp.guard = input.down('guard');
    if (!this.locked) { if (input.pressed('attack')) inp.attack = true; if (input.pressed('dash')) inp.dash = true; if (input.pressed('lock')) inp.lockNext = true; }   // latched until a rule step consumes them (hit-stop)
    if (sim.done) {
      this.doneT += dt;
      if (this.doneT > 1.2 && (inp.attack || input.pressed('confirm') || input.pointer.tapped)) { sim.reset(); this.cam.snap = true; fx?.clear(); this._makeFxHandles(); for (const n of this.numbers) n.on = false; inp.attack = false; g.flash?.('#000', 0.6, 3); this.emit('hero.respawn', {}); return; }
    }
    this._savePrev();
    const pdt = fx ? fx.update(dt) : dt;
    if (fx) { const F = fx.feel, ts = F.stop <= 0 && F.slowT > 0 ? F.slowScale : 1; if (ts !== this._ts) { this._ts = ts; try { feel.setTimeScale(ts); } catch { /* no audio */ } } }
    if (pdt > 0) {
      this._fallV = sim.hero.vy ?? 0;
      sim.update(pdt, inp);
      if (inp.jumpUsed) input.consume('jump');
      inp.attack = false; inp.dash = false; inp.lockNext = false;
      if (sim.stop > 0) sim.stop = 0;   // hit-stop is owned by the feel table (ENGINE_API 1)
    }
    this._sync(pdt, dt);
    this._camera(dt);
    for (let i = 0; i < this.numbers.length; i++) { const n = this.numbers[i]; if (n.on && (n.t += dt) >= 0.8) n.on = false; }
    this._state(); this.hud.update(dt, this.state);
    const c = this.cam;
    try { feel.setListener(c.px, c.py, c.pz, c.fx, c.fy, c.fz, c.dist, (g.viewW / 2) / this.focal); feel.update(); } catch { /* no audio */ }
    this.updMs += performance.now() - t0;
  }
  _makeFxHandles() { this._rb = -1; this._dashRb = -1; this._mv = null; this.shotN = 0; }
  _savePrev() {
    const sim = this.sim, h = sim.hero, c = this.cam, q = this.camP;
    h._px = h.x; h._py = h.y; h._pz = h.z; this.visYP = this.visY;
    const E = sim.enemies; for (let i = 0; i < E.length; i++) { const e = E[i]; e._px = e.x; e._py = e.y; e._pz = e.z; }
    const S = sim.shots; for (let i = 0; i < S.length; i++) { const s = S[i]; s._px = s.x; s._py = s.y; s._pz = s.z; }
    q.px = c.px; q.py = c.py; q.pz = c.pz; q.fx = c.fx; q.fy = c.fy; q.fz = c.fz;
  }
  /** first positions after (re)loading: nothing to interpolate from */
  _tick0() { const h = this.sim.hero; this.visY = h.y; this._savePrev(); this._sync(0, 0); this._state(); }
  /** after a rule step: turn rule state into actors, effects and sound */
  _sync(pdt, dt) {
    const sim = this.sim, h = sim.hero, fx = this.fx, W = this.W, ha = this.heroA, P = PRESET_IDS;
    // respawn / reset
    if ((sim.deaths ?? 0) !== this._deaths) { this._deaths = sim.deaths ?? 0; this.cam.snap = true; this.game.flash?.('#000', 0.7, 2.5); ha.dx = 1; ha.dz = 0; fx?.clear(); this._makeFxHandles(); this.emit('hero.respawn', {}); }
    if (h._px === undefined) { h._px = h.x; h._py = h.y; h._pz = h.z; this.visY = this.visYP = h.y; }
    // section -> room reverb + story
    if (sim.section !== this._secId) { const from = this._secId; this._secId = sim.section; if (sim.section !== 'done') { try { feel.setRoom(roomOf(this.area, sim.section)); } catch { /* no audio */ } this.emit('section.enter', { id: sim.section, from }); } }
    const TR = this.area.triggers;
    for (let i = 0; i < TR.length; i++) { const t = TR[i]; if (!this.fired.has(t.id) && h.x >= t.x0 && h.x < t.x1 && h.z >= t.z0 && h.z < t.z1) { this.fired.add(t.id); this.emit('trigger', { id: t.id, trigger: t }); } }
    // hero: animation, blade trail, dash trail, steps
    if (pdt > 0) driveHero(ha, h, pdt, TUNE);
    this.visY = h.onGround && Math.abs(this.visY - h.y) < 40 && dt > 0 ? this.visY + (h.y - this.visY) * (1 - Math.exp(-dt * 28)) : h.y;   // stairs: do not pop
    if (pdt > 0) { this._tintAt(W, h.x, h.y + 50, h.z, 0, 1.6, ha.opt.tint); ha.opt.flash = Math.max(h.flash > 0 ? h.flash * 0.6 : 0, h.ifr > 0 && !h.dead && !(h.hurtT > 0) && !(h.dashT > 0) && Math.floor(h.t * 22) % 2 === 0 ? 0.3 : 0); }
    if (fx) {
      const mv = h.dead ? null : h.move ?? null;
      if (mv !== this._mv) {
        if (this._rb >= 0) { fx.ribbons.end(this._rb); this._rb = -1; }
        this._mv = mv; this._swung = false;
        if (mv) this._rb = fx.ribbons.start(h.combo >= 2 || mv.finisher ? TRAIL.bladeHeavy : TRAIL.blade);
      }
      if (mv && pdt > 0) {
        if (ha.weaponMatrix(ha.place(h.x, this.visY, h.z))) { const a = ha.weaponPoint(ha.grip.base ?? 20, this.tmpA), b = ha.weaponPoint(ha.grip.tip ?? 76, this.tmpB); fx.ribbons.push(this._rb, a[0], a[1], a[2], b[0], b[1], b[2]); }
        if (!this._swung && (!mv.hit || h.moveT >= mv.hit[0])) { this._swung = true; const heavy = h.combo >= 2 || !!mv.finisher, id = heavy ? P['swing.heavy'] : P['swing.light']; if (id !== undefined) fx.playAt(id, h.x, h.y, h.z, h.dirX ?? ha.dx, h.dirZ ?? ha.dz, (h.combo & 1 ? -1 : 1) * (heavy ? 1.15 : 1), h.x, h.y, h.z); }
      }
      if (h.dashT > 0 && !h.dead) { if (this._dashRb < 0) this._dashRb = fx.ribbons.start(DASH_TRAIL); if (pdt > 0) fx.ribbons.push(this._dashRb, h.x, h.y + 50, h.z, 0, 0, 0); }
      else if (this._dashRb >= 0) { fx.ribbons.end(this._dashRb); this._dashRb = -1; }
      fx.setProtect(0, h.x, h.y + 55, h.z, 46);
    }
    if (pdt > 0 && h.onGround && !h.dead && !h.move && !(h.dashT > 0) && !(h.hurtT > 0)) {
      const sp = Math.hypot(h.vx ?? 0, h.vz ?? 0);
      if (sp > 60) { this.stride += sp * pdt; if (this.stride > 96) { this.stride = 0; try { feel.step(sp, h); } catch { /* no audio */ } if (fx && P['move.step'] !== undefined) fx.playAt(P['move.step'], h.x, h.y, h.z, ha.dx, ha.dz, 1, h.x, h.y, h.z); } } else this.stride = 60;
    }
    // enemies
    const E = sim.enemies, L = this.actors;
    if (E !== this._ERef) { for (let i = L.length - 1; i >= 0; i--) { this._free(L[i]); } L.length = 0; this._ERef = E; }
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (!e._a3 && !e.dead && e.state !== 'dead') this._take(e); }
    const fdt = fx ? dt * fx.feel.fxScale : dt;
    for (let i = L.length - 1; i >= 0; i--) {
      const a = L[i], e = a.e;
      a.hitAge += fdt;
      if (a.dieAge < 0 && (e.state === 'dead' || e.dead)) a.dieAge = e.dead ? DIE_T : 0;
      if (a.dieAge >= 0) { a.dieAge += fdt; if (a.dieAge >= DIE_T) { this._free(a); L[i] = L[L.length - 1]; L.length--; continue; } }
      if (pdt <= 0 || (!a.vis && a.dieAge < 0)) continue;   // off-screen: no animation work
      if (e.dead) a.anim.update(pdt);
      else {
        const ox = a.dx, oz = a.dz;
        driveActor(a, e, pdt);
        if (e.dirX === undefined) {   // rules without a 360 degree facing: look at the hero while awake (characters face where they act)
          let tx = e.facing ?? ox, tz = 0;
          if (e.active && e.state !== 'dead' && !h.dead) { const d = Math.hypot(h.x - e.x, h.z - e.z); if (d > 8) { tx = (h.x - e.x) / d; tz = (h.z - e.z) / d; } }
          const cur = Math.atan2(oz, ox), ang = cur + wrapPi(Math.atan2(tz, tx) - cur) * (1 - Math.exp(-pdt * 10)); a.dx = Math.cos(ang); a.dz = Math.sin(ang);
        }
      }
      this._tintAt(W, e.x, e.y + 50, e.z, 0, 1.6, a.opt.tint);
    }
    // shots: 3D magic that follows the rule's projectile
    const S = sim.shots;
    if (fx) {
      for (let i = 0; i < S.length; i++) { const s = S[i]; if (s.dead || s._rb !== undefined || this.shotN >= this.shotL.length) continue; const el = elementOf(s, null); shotAttach(fx, s, el); this.shotL[this.shotN++] = s; try { feel.magic(el.sound, 'release', s); } catch { /* no audio */ } }
      for (let i = this.shotN - 1; i >= 0; i--) {
        const s = this.shotL[i];
        if (s.dead || S.indexOf(s) < 0) { shotDetach(fx, s); this.shotL[i] = this.shotL[--this.shotN]; this.shotL[this.shotN] = null; continue; }
        if (pdt > 0) { const gy = groundAt(W, s.x, s.z, s.y + 20); shotMove(fx, s, elementOf(s, null), Number.isFinite(gy) ? gy : s.y - 50, pdt); }
      }
    }
  }
  _state() {
    const s = this.state, g = this.game, sim = this.sim, W = this.W;
    s.viewW = g.viewW; s.viewH = g.viewH; s.safe = g.safe ?? s.safe; s.scale = g.scale; s.time = sim.time ?? 0; s.hero = sim.hero; s.heroHpMax = sim.hero.hpMax ?? TUNE.heroHp ?? 100;
    s.enemies = sim.enemies; s.done = !!sim.done; s.doneT = this.doneT; s.dialog = this.ui.dialog; s.message = ''; s.message2 = '';
    const id = sim.section === 'done' ? s.section.id || 'yard' : sim.section;
    if (id !== s.section.id) { s.section.id = id; let lab = ''; for (let i = 0; i < W.sections.length; i++) if (W.sections[i].id === id) lab = W.sections[i].label ?? ''; s.section.label = lab; }
    let left = 0, yard = 0; const E = sim.enemies;
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.dead || e.state === 'dead') continue; left++; if (e.yard) yard++; }
    s.enemiesLeft = left; s.yardLeft = yard;
  }
  // ───────────────────────── camera (section rigs, as in prototype B) ─────────────────────────
  _camera(dt) {
    const c = this.cam, h = this.sim.hero, W = this.W;
    const sec = sectionAt(W, h.x, h.z) ?? this._sec ?? W.sections[0]; this._sec = sec;
    const R = sec.cam, snap = c.snap;
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.3), kt = snap ? 1 : 1 - Math.exp(-dt * 5.5), kf = snap ? 1 : 1 - Math.exp(-dt * 1.5);
    c.face += (clamp(h.dirX ?? h.facing ?? 1, -1, 1) - c.face) * kf;   // lead follows the facing continuously (no flip when the stick reverses)
    c.yaw += (R.yaw + (R.yawLead ?? 0.03) * c.face - c.yaw) * k;
    c.pitch += (R.pitch - c.pitch) * k; c.dist += (R.dist - c.dist) * k; c.lookY += (R.lookY - c.lookY) * k;
    c.leadX += ((R.leadX ?? 0) * c.face - c.leadX) * k; c.leadZ += ((R.leadZ ?? 0) - c.leadZ) * k;
    if (c.zf == null) c.zf = R.zFollow; c.zf += (R.zFollow - c.zf) * k;
    let tx = h.x + c.leadX, tz = 130 + (h.z - 130) * c.zf + c.leadZ;
    c.ck += ((R.center?.k ?? 0) - c.ck) * k;
    if (c.ck > 0.001) { const C = R.center ?? c.lastCenter; if (C) { c.lastCenter = C; tx += (C.x - tx) * c.ck; tz += (C.z - tz) * c.ck; } }
    const gy = h.onGround ? h.y : Math.min(h.y, c.ty + 40 > h.y ? c.ty : h.y - 40);
    c.tx += (tx - c.tx) * kt; c.tz += (tz - c.tz) * kt; c.ty += (gy - c.ty) * (snap ? 1 : 1 - Math.exp(-dt * 4));
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const tall = Math.max(0, this.game.viewH - 540);
    c.tallK += ((R.tallK ?? 0.4) - c.tallK) * k;
    const lx = c.tx, ly = c.ty + c.lookY + tall * c.tallK, lz = c.tz;
    let px = lx - Math.sin(c.yaw) * cp * c.dist; const py = ly + sp * c.dist, pz = lz - Math.cos(c.yaw) * cp * c.dist;
    const kx = snap ? 1 : 1 - Math.exp(-dt * 3);
    c.minX += ((R.minX ?? -1e5) - c.minX) * kx; c.maxX += ((R.maxX ?? 1e5) - c.maxX) * kx;
    px = clamp(px, c.minX, c.maxX);
    const kp = snap ? 1 : 1 - Math.exp(-dt * 14);
    c.px += (px - c.px) * kp; c.py += (py - c.py) * kp; c.pz += (pz - c.pz) * kp;
    const fx = lx - c.px, fy = ly - c.py, fz = lz - c.pz, fl = Math.hypot(fx, fy, fz) || 1;
    c.fx = fx / fl; c.fy = fy / fl; c.fz = fz / fl;
    if (snap) { const q = this.camP; q.px = c.px; q.py = c.py; q.pz = c.pz; q.fx = c.fx; q.fy = c.fy; q.fz = c.fz; }
    c.snap = false;
  }
  /** view-projection for a moment `a` (0..1) between the last two ticks */
  _matrix(Wv, Hv, a) {
    const c = this.cam, q = this.camP, m = this.vp, e0 = this.eye0, e = this.eye, R = this.camR, U = this.camU, Fw = this.camF;
    let fx = q.fx + (c.fx - q.fx) * a, fy = q.fy + (c.fy - q.fy) * a, fz = q.fz + (c.fz - q.fz) * a; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const rl = Math.hypot(fz, fx) || 1, rx = fz / rl, rz = -fx / rl;          // r = up x f
    const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;                  // u = f x r
    R[0] = rx; R[1] = 0; R[2] = rz; U[0] = ux; U[1] = uy; U[2] = uz; Fw[0] = fx; Fw[1] = fy; Fw[2] = fz;
    e0[0] = q.px + (c.px - q.px) * a; e0[1] = q.py + (c.py - q.py) * a; e0[2] = q.pz + (c.pz - q.pz) * a;
    let zoom = 1;
    if (this.fx) { this.fx.feel.applyToEye(e0, R, U, e); zoom = this.fx.feel.cam.zoom; } else { e[0] = e0[0]; e[1] = e0[1]; e[2] = e0[2]; }
    const px = e[0], py = e[1], pz = e[2];
    const F = FOCAL * (1 + Math.max(0, Hv - 540) / 540 * 0.3) * zoom; this.focal = F;
    const sx = F / (Wv / 2), sy = F / (Hv / 2), A = (FAR + NEAR) / (FAR - NEAR), B = -2 * FAR * NEAR / (FAR - NEAR);
    const rd = -(rx * px + rz * pz), ud = -(ux * px + uy * py + uz * pz), fd = -(fx * px + fy * py + fz * pz);
    m[0] = sx * rx; m[4] = 0; m[8] = sx * rz; m[12] = sx * rd;
    m[1] = sy * ux; m[5] = sy * uy; m[9] = sy * uz; m[13] = sy * ud;
    m[2] = A * fx; m[6] = A * fy; m[10] = A * fz; m[14] = A * fd + B;
    m[3] = fx; m[7] = fy; m[11] = fz; m[15] = fd;
    this.A = A;
    return m;
  }
  /** world point -> logical screen {x, y, w(depth)} */
  project(x, y, z, out = {}) {
    const m = this.vp, W = this.game.viewW, H = this.game.viewH;
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    out.w = cw; if (cw <= 1) { out.x = -9999; out.y = -9999; return out; }
    out.x = W / 2 + (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw * W / 2;
    out.y = H / 2 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw * H / 2;
    return out;
  }
  // ───────────────────────── draw ─────────────────────────
  render(ctx) {
    const g = this.game, Wv = g.viewW, Hv = g.viewH, s = this.state, t0 = performance.now(), L = this.layer;
    const hctx = this.mode === 'layer' && L.hctx ? L.hctx : ctx;
    s.viewW = Wv; s.viewH = Hv; s.safe = g.safe ?? s.safe;
    const off = this.glError || !this.glr ? 1 : !this.ready ? 2 : this.glr.lost ? 3 : 0;
    if (off) {
      if (this.mode === 'layer') this._show(false);
      s.message = off === 1 ? 'WebGL 을 쓸 수 없어 게임을 열 수 없습니다' : off === 2 ? '불러오는 중…' : '화면을 되살리는 중…'; s.message2 = off === 1 ? String(this.glError || '') : '';
      this.hud.draw(ctx, s); s.message = '';
      return;
    }
    if (this.mode === 'layer') this._show(g.top === this);
    const glr = this.glr;
    if (this._restored !== glr.restored) { this._restored = glr.restored; this.cr.restore(); try { this.fx?.dispose(); } catch { /* dead objects */ } this._makeFx(); this._warm(); }   // context came back
    this._place();
    const a = this.everyFrame ? clamp(g.alpha ?? 1, 0, 1) : 1;
    this._gl(Wv, Hv, a, false);
    if (hctx !== ctx) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, L.hud.width, L.hud.height); hctx.setTransform(g.scale, 0, 0, g.scale, 0, 0); }
    this.hud.draw(hctx, s);
    const ms = performance.now() - t0 + this.updMs; this.updMs = 0;
    this.samples[this.sampleN % 300] = ms; this.sampleN++;
  }
  /** one WebGL frame. a = interpolation between the last two ticks. warm = also draw every loaded model once */
  _gl(Wv, Hv, a, warm) {
    const g = this.game, glr = this.glr, gl = glr.gl, W = this.W, fx = this.fx, cr = this.cr, sim = this.sim, b = this.batch, k = this.perf.resK;
    const w = Math.max(2, Math.round(g.canvas.width * k)), hgt = Math.max(2, Math.round(g.canvas.height * k));
    glr.resize(w, hgt);
    const vp = this._matrix(Wv, Hv, a);
    this._cull(vp);
    // dynamic quads: sky, ground decals, lamp glows
    b.reset();
    this._sky(b); const nSky = b.n;
    this._decals(b, a); const nDecal = b.n - nSky;
    this._glows(b); const nGlow = b.n - nSky - nDecal;
    if (fx) fx.post.begin(w, hgt);
    glr.begin(vp, W.fog, W.sky.top, this.A);
    glr.uploadDyn(b.n);
    glr.drawDyn(this.skyTex, 0, nSky, false);
    const M = this.envMeshes; let tris = 0, draws = 0;
    for (let i = 0; i < M.length; i++) { const m = M[i]; if (m.c && !m.c.on) continue; glr.drawMesh(m.mesh, m.tex); tris += m.tris; draws++; }
    this.envStat.tris = tris; this.envStat.draws = draws;
    gl.bindBuffer(gl.ARRAY_BUFFER, glr.dyn.buf); glr._attribs();
    glr.drawDyn(this.sprTex, nSky, nDecal, true);
    // characters
    cr.begin(this.env, fx ? fx.tex.noise : null, fx ? fx.lights.pos : null, fx ? fx.lights.col : null);
    this._chars(a, vp);
    if (warm) { const ha = this.heroA, Mx = ha.place(sim.hero.x, sim.hero.y, sim.hero.z); for (const as of this.cast.assets.values()) { ha.opt.dis = 0.3; cr.draw(as.gpu, null, Mx, ha.opt); } for (const wp of this.cast.weapons.values()) cr.draw(wp.gpu, null, Mx, ha.opt); ha.opt.dis = 0; ha.opt.alpha = 0.5; cr.draw(ha.gpu, ha.rig.jm, Mx, ha.opt); ha.opt.alpha = 1; }
    cr.end();
    this.c3.draws = cr.stats.draws; this.c3.tris = cr.stats.tris;
    gl.useProgram(glr.prog); gl.bindBuffer(gl.ARRAY_BUFFER, glr.dyn.buf); glr._attribs();
    glr.drawDyn(this.sprTex, nSky + nDecal, nGlow, true);
    glr.stats.draws += cr.stats.draws; glr.stats.tris += cr.stats.tris;
    if (fx) { fx.draw(this.fxCam); fx.post.end(fx.feel.screen); }
  }
  /** visible chunks only (bounding box against the view frustum) */
  _cull(m) {
    const far = (this.W.fog.far ?? 3300) * 1.15, C = this.envChunks; let on = 0;
    for (let j = 0; j < C.length; j++) {
      const c = C[j], bb = c.b; let l = 0, r = 0, t = 0, bt = 0, bh = 0, fa = 0;
      for (let i = 0; i < 8; i++) {
        const x = bb[i & 1 ? 3 : 0], y = bb[i & 2 ? 4 : 1], z = bb[i & 4 ? 5 : 2];
        const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (cx < -cw) l++; if (cx > cw) r++; if (cy < -cw) bt++; if (cy > cw) t++; if (cw < 1) bh++; if (cw > far) fa++;
      }
      c.on = !(l === 8 || r === 8 || t === 8 || bt === 8 || bh === 8 || fa === 8); if (c.on) on++;
    }
    this.envStat.chunks = on;
  }
  /** is a character at (x,y,z) with height hgt inside the view (with a margin)? */
  _seen(m, x, y, z, hgt) {
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15]; if (cw < 30 || cw > (this.W.fog.far ?? 3300)) return false;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], mg = 130 * m[0] + 60;   // margin: about 130 units sideways
    if (cx < -cw - mg || cx > cw + mg) return false;
    const cy0 = m[1] * x + m[5] * y + m[9] * z + m[13], cy1 = cy0 + m[5] * (hgt + 40);
    return !(cy1 < -cw - 20 || cy0 > cw + 60);
  }
  _chars(a, m) {
    const sim = this.sim, h = sim.hero, cr = this.cr, ha = this.heroA, L = this.actors; let drawn = 0, culled = 0;
    // hero (no afterimage copies: the dash is a ribbon)
    { const snap = Math.abs(h.x - h._px) > 250 || Math.abs(h.z - h._pz) > 250, k = snap ? 1 : a; const y = this.visYP + (this.visY - this.visYP) * k;
      ha.opt.rim = RIM_HERO; ha.draw(cr, ha.place(h._px + (h.x - h._px) * k, snap ? h.y : y, h._pz + (h.z - h._pz) * k)); drawn++; }
    for (let i = 0; i < L.length; i++) {
      const ac = L[i], e = ac.e, k = e._px === undefined || Math.abs(e.x - e._px) > 250 ? 1 : a;
      const x = e._px === undefined ? e.x : e._px + (e.x - e._px) * k, y = e._py === undefined ? e.y : e._py + (e.y - e._py) * k, z = e._pz === undefined ? e.z : e._pz + (e.z - e._pz) * k;
      ac.vis = this._seen(m, x, y, z, ac.height);
      if (!ac.vis) { culled++; continue; }
      const o = ac.opt; o.flash = hurtFlash(ac.hitAge) * 0.85; o.dis = ac.dieAge >= 0 ? dissolveK(ac.dieAge, DIE_T) : 0; o.seed = ac.seed;
      o.rim = e.state === 'attack' || e.state === 'cast' ? RIM_WARN : RIM_ENEMY;
      ac.draw(cr, ac.place(x, y + (KINDS[ac.kind]?.float ?? 0), z)); drawn++;
    }
    this.c3.drawn = drawn; this.c3.culled = culled;
  }
  _sky(b) {
    const S = this.W.sky, e = this.eye, R = 9000, hw = R * Math.tan(S.span / 2), yb = e[1] + R * Math.tan(S.bottom), hh = hw * 2 * (940 * S.crop) / 2520, P = this.P12;
    for (let i = -1; i <= 1; i++) {
      const x0 = e[0] + (i * 2 - 1) * hw, x1 = x0 + 2 * hw, z = e[2] + R;
      P[0] = x0; P[1] = yb; P[2] = z; P[3] = x1; P[4] = yb; P[5] = z; P[6] = x1; P[7] = yb + hh; P[8] = z; P[9] = x0; P[10] = yb + hh; P[11] = z;
      b.quad(P, i ? 1 : 0, 0.002, i ? 0 : 1, 0.998, 1, 1, 1, 1, 1, 0, 0, 0);
    }
  }
  _flat(x, y, z, rx, rz) { const P = this.P12; P[0] = x - rx; P[1] = y; P[2] = z - rz; P[3] = x + rx; P[4] = y; P[5] = z - rz; P[6] = x + rx; P[7] = y; P[8] = z + rz; P[9] = x - rx; P[10] = y; P[11] = z + rz; return P; }
  _shadow(b, x, z, y, rx, al) {
    const gy = groundAt(this.W, x, z, y + 20); if (!Number.isFinite(gy)) return;
    const k = clamp(1 - (y - gy) / 260, 0.35, 1), r = rx * (0.7 + 0.3 * k), bl = this.spr.blob;
    b.quad(this._flat(x, gy + 0.9, z, r, r * 0.62), bl.u0, bl.v0, bl.u1, bl.v1, 0, 0, 0, al * k, 1, 0, 4, 1);
  }
  /** things that lie on the ground: stains, light pools, prop shadows, character shadows, attack warnings */
  _decals(b, a) {
    const W = this.W, E = W.env, S = this.spr, c = this.cam, sim = this.sim, t = sim.time ?? 0, g = S.glow, bl = S.blob, tx = c.tx, tz = c.tz;
    const D = E.decals;
    for (let i = 0; i < D.length; i++) {
      const d = D[i]; if (Math.abs(d.x - tx) > 1500 || d.z - tz < -700 || d.z - tz > 2600) continue;
      const uv = S[d.k]; if (!uv) continue;
      const l = d._c, al = d.a ?? (d.k === 'stain' ? 0.5 : d.k === 'moss' ? 0.55 : 0.85);
      b.quad(this._flat(d.x, (d.y ?? 0) + 0.6, d.z, d.rx, d.rz), uv.u0, uv.v0, uv.u1, uv.v1, l[0], l[1], l[2], al, 1, 0, 3, 1);
    }
    const PL = E.fx.pools;
    for (let i = 0; i < PL.length; i++) {
      const p = PL[i]; if (Math.abs(p.x - tx) > 1500 || p.z - tz < -700 || p.z - tz > 2600) continue;
      const f = p.flicker ? 0.86 + 0.14 * Math.sin(t * 11 + p.x) : 1, r = p.r * (p.flicker ? 0.96 + 0.05 * Math.sin(t * 7 + p.z) : 1);
      b.quad(this._flat(p.x, p.y + 0.8, p.z, r, r * 0.8), g.u0, g.v0, g.u1, g.v1, p.c[0], p.c[1], p.c[2], p.a * f, 0, 0, 4, 0.8);
    }
    const SH = E.fx.shadows;
    for (let i = 0; i < SH.length; i++) { const s = SH[i]; if (Math.abs(s.x - tx) > 1500 || s.z - tz < -700 || s.z - tz > 2600) continue; b.quad(this._flat(s.x, s.y + 0.9, s.z, s.rx, s.rz), bl.u0, bl.v0, bl.u1, bl.v1, 0, 0, 0, s.a, 1, 0, 4, 1); }
    const h = sim.hero, hx = h._px + (h.x - h._px) * a, hz = h._pz + (h.z - h._pz) * a;
    { const gy = groundAt(W, hx, hz, h.y + 20), r = 150; if (Number.isFinite(gy)) b.quad(this._flat(hx, gy + 0.5, hz, r, r * 0.7), g.u0, g.v0, g.u1, g.v1, 0.55, 0.62, 0.9, 0.16, 0, 0, 4, 1); }   // faint light under the hero: reads position and depth on dark ground
    this._shadow(b, hx, hz, h.y, 30, 0.95);
    const L = this.actors;
    for (let i = 0; i < L.length; i++) {
      const ac = L[i], e = ac.e; if (!ac.vis) continue;
      const ex = e._px === undefined ? e.x : e._px + (e.x - e._px) * a, ez = e._pz === undefined ? e.z : e._pz + (e.z - e._pz) * a;
      this._shadow(b, ex, ez, e.y, 26, 0.9 * (ac.dieAge >= 0 ? clamp(1 - ac.dieAge / DIE_T, 0, 1) : 1));
      const T = TUNE[e.kind];
      if (e.state === 'attack' && T && T.windup && e.stateT < T.windup + 0.08) {   // where the swing will land (line up in depth to dodge)
        const k = clamp(e.stateT / T.windup, 0, 1), cx = ex + ac.dx * 46, cz = ez + ac.dz * 46, rr = 34 + 26 * k;
        b.quad(this._flat(cx, e.y + 0.6, cz, rr, Math.max(rr * 0.6, (T.reachZ ?? 30) * 0.9)), g.u0, g.v0, g.u1, g.v1, 1.5, 0.25, 0.12, 0.2 + 0.5 * k, 0, 0, 5, 1);
      }
    }
    const SS = sim.shots;
    for (let i = 0; i < SS.length; i++) { const s = SS[i]; if (!s.dead) this._shadow(b, s._px === undefined ? s.x : s._px + (s.x - s._px) * a, s._pz === undefined ? s.z : s._pz + (s.z - s._pz) * a, s.y, 15, 0.7); }
  }
  /** lamp halos (camera facing, additive); without effects (WebGL1) the shots are drawn here too */
  _glows(b) {
    const E = this.W.env, R = this.camR, U = this.camU, g = this.spr.glow, c = this.cam, t = this.sim.time ?? 0, P = this.P12, G = E.fx.glows;
    for (let n = 0; n < G.length; n++) {
      const s = G[n]; if (Math.abs(s.x - c.tx) > 1700 || s.z - c.tz < -700 || s.z - c.tz > 2600) continue;
      const k = s.flicker ? 0.9 + 0.12 * Math.sin(t * 13 + s.x) + 0.06 * Math.sin(t * 31 + s.z) : 1;
      for (let j = 0; j < 2; j++) {
        const rr = s.r * k * (j ? 2.6 : 1);
        for (let i = 0; i < 4; i++) { const su = i === 0 || i === 3 ? -rr : rr, sv = i < 2 ? -rr : rr; P[i * 3] = s.x + R[0] * su + U[0] * sv; P[i * 3 + 1] = s.y + R[1] * su + U[1] * sv; P[i * 3 + 2] = s.z + R[2] * su + U[2] * sv; }
        b.quad(P, g.u0, g.v0, g.u1, g.v1, s.c[0], s.c[1], s.c[2], j ? 0.2 : 0.8, 0, 0, 14, 0.6);
      }
    }
    if (!this.fx) {
      const SS = this.sim.shots;
      for (let n = 0; n < SS.length; n++) { const s = SS[n]; if (s.dead) continue; for (let j = 0; j < 2; j++) { const rr = j ? 44 : 16; for (let i = 0; i < 4; i++) { const su = i === 0 || i === 3 ? -rr : rr, sv = i < 2 ? -rr : rr; P[i * 3] = s.x + R[0] * su + U[0] * sv; P[i * 3 + 1] = s.y + R[1] * su + U[1] * sv; P[i * 3 + 2] = s.z + R[2] * su + U[2] * sv; } b.quad(P, g.u0, g.v0, g.u1, g.v1, j ? 0.75 : 1.6, j ? 0.3 : 1.2, j ? 1.1 : 1.9, j ? 0.7 : 1, 0, 0, 10, 0.5); } }
    }
  }
  // ───────────────────────── numbers for the checks ─────────────────────────
  stats() {
    const n = Math.min(300, this.sampleN), a = this.sorted.subarray(0, n); a.set(this.samples.subarray(0, n)); a.sort();
    const pc = (k) => (n ? a[Math.min(n - 1, Math.floor(n * k))] : 0), G = this.glr, cr = this.cr, fx = this.fx, cast = this.cast;
    const tex = (G?.stats.texBytes ?? 0) + (cr?.stats.texBytes ?? 0) + (fx ? fx.gpuBytes : 0);
    return {
      frameMs: { p50: pc(0.5), p95: pc(0.95), n },
      gl: G ? { ...G.info(), draws: G.stats.draws + (fx?.stats.draws ?? 0), tris: Math.round(G.stats.tris), texBytes: tex, texMB: +(tex / 1048576).toFixed(1), bufBytes: G.stats.bufBytes + (cr?.stats.bufBytes ?? 0), canvas: [G.canvas.width, G.canvas.height], lost: G.lost, restored: G.restored } : null,
      world: { tris: Math.round(this.envStat.tris), draws: this.envStat.draws, chunks: this.envStat.chunks, texBytes: G?.stats.texBytes ?? 0, flatPropsDropped: this.area?.flatProps.length ?? 0 },
      chars: cr ? { draws: this.c3.draws, tris: Math.round(this.c3.tris), drawn: this.c3.drawn, culled: this.c3.culled, texBytes: cr.stats.texBytes, bufBytes: cr.stats.bufBytes, models: cast ? [...cast.assets.keys()] : [], weapons: cast ? [...cast.weapons.keys()] : [], clips: cast?.lib ? Object.keys(cast.lib.clips).length : 0, libError: cast?.libError ?? null, actors: this.actors.length, heroClip: this.heroA?.anim.cur?.name ?? '' } : null,
      fx: fx ? { tier: fx.tier, post: fx.postOn, bytes: fx.gpuBytes, particles: fx.particles.drawn ?? 0, lights: fx.lights.count } : null,
      mode: this.mode, resK: this.perf.resK, everyFrame: this.everyFrame, perfSaved: this.perf.saved, loadMs: this.loadMs ?? 0,
      canvases: (this._canvases?.length ?? 0) + (G ? 1 : 0) + (this.layer.hud ? 1 : 0), assets: this.assetList(),
    };
  }
  /** every assets/v2 file this scene has loaded (for tools/deploy/v2_ship.txt) */
  assetList() { const out = [...(this.urls ?? [])]; for (const u of this.cast?.urls ?? []) out.push(String(u).replace(/^.*?assets\//, 'assets/')); return [...new Set(out)].sort(); }
  _debugLine() {
    const st = this.stats(), g = this.game;
    return `v2g · ${st.gl.api} · ${st.mode} · ${Math.round(st.resK * 100)}% · ${g.fps | 0}fps · ${st.frameMs.p50.toFixed(1)}/${st.frameMs.p95.toFixed(1)}ms · ${st.gl.draws}dc ${st.gl.tris}tri · ${st.gl.texMB}MB · ${st.chars.drawn}+${st.chars.culled}`;
  }
  _api() {
    const sc = this;
    globalThis.__v2 = {
      id: 'g', scene: sc,
      get ready() { return sc.ready; }, get error() { return sc.glError; },
      get hero() { const h = sc.sim?.hero; return h ? { x: h.x, y: h.y, z: h.z, hp: h.hp, facing: h.facing, dirX: h.dirX, dirZ: h.dirZ, onGround: h.onGround, anim: h.anim, dead: h.dead, face: [sc.heroA?.dx ?? 0, sc.heroA?.dz ?? 0], clip: sc.heroA?.anim.cur?.name ?? '' } : null; },
      get enemies() { return (sc.sim?.enemies ?? []).filter((e) => !e.dead).map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z, hp: e.hp, yard: e.yard, state: e.state, active: e.active, model: KINDS[e.kind]?.model ?? null, clip: e._a3?.anim.cur?.name ?? null, drawn: !!e._a3?.vis })); },
      get cam() { const c = sc.cam; return { x: c.px, y: c.py, z: c.pz, yaw: Math.atan2(c.fx, c.fz), pitch: -Math.asin(c.fy), dist: c.dist }; },
      get section() { return sc.sim?.section ?? ''; }, get area() { return sc.area?.id ?? ''; },
      get stats() { return sc.stats(); },
      get shots() { return (sc.sim?.shots ?? []).filter((s) => !s.dead).map((s) => ({ x: s.x, y: s.y, z: s.z })); },
      teleport(sec) { const ok = sc.sim?.teleport?.(sec) ?? false; sc.cam.snap = true; return ok; },
      project(x, y, z) { return sc.project(x, y, z, {}); },
      loseContext() { const e = sc.glr?.gl.getExtension('WEBGL_lose_context'); if (!e) return false; e.loseContext(); setTimeout(() => e.restoreContext(), 300); return true; },
    };
  }
}
