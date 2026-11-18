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
import { sectionAt } from '../b/world.js';
// the scene's own copy of B's groundAt (the same loop). B's function also runs while the stage is compiled, on boxes of mixed key
// layouts, and stays on the engine's slow generic read afterwards (a number object per field read: about 10-20 KB a frame through the
// shadows). This copy only ever sees the uniform boxes made by area.js uniformBoxes().
function groundAt(W, x, z, yMax = Infinity) { let g = -Infinity; const B = W.boxes; for (let i = 0; i < B.length; i++) { const b = B[i]; if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 <= yMax && b.y1 > g) g = b.y1; } return g; }
import { KIT_TEX } from '../env/mats.js';
import { Sim, TUNE, KINDS, driveHero, driveActor } from '../play/index.js';
import { driveHero as PLACEHOLDER_DRIVE_HERO } from '../char3d/hero3d.js';
import { createFx, PRESET_IDS, hurtFlash, dissolveK } from '../fx/index.js';
import { createWhip, WhipRenderer, whipFx, driveWhip } from '../whip/index.js';
import { RB, Q } from '../fx/engine.js';
import { feel, FLAG } from '../feel/index.js';
import { bindFxSound } from '../feel/fxbridge.js';
import { GLR, SpriteBatch } from './glr.js';
import { CharRenderer } from './charr.js';
import { Cast } from './cast.js';
import { loadArea, hasArea, flagsThatOpen, roomOf, kitTexPath, DEFAULT_AREA } from './area.js';
import { drawDecalSprites as drawEnvDecals, DECAL_ALPHA } from '../env/decals.js';
import { People, LINES } from './people.js';
import { Anchors } from './anchors.js';
import { Res } from './res.js';
import { createBuiltinHud } from './hud.js';
import { readPerf } from './perf.js';
import { UI_LOADER, UI_DEFAULT } from './seams.js';
import { elementOf, shotAttach, shotMove, shotDetach, shotImpact } from './magic.js';

const FOCAL = 880, NEAR = 60, FAR = 24000, DIE_T = 0.9, HERO_MODEL = 'kael';
const ANIM_MID2 = 900 * 900, ANIM_FAR2 = 1700 * 1700;   // squared distances (from the camera target) where enemy poses drop to 30 Hz / 15 Hz
const TURN_RUN = 15, TURN_ACT = 34;   // rad/s: a full reversal takes about 0.21 s running, 0.09 s when an attack needs the body to face its hit box
const TEX_SRC = {
  flag: { src: 'tex/tex_mossy_stone', desat: 0.35 }, block: { src: 'tex/tex_castle_stone' }, brick: { src: 'tex/tex_wet_stone', desat: 0.8 },
  wood: { src: 'tex/tex_wood' }, dirt: { src: 'tex/tex_dirt' },
};
const HIDE_BTNS = ['sub', 'skill1', 'skill2', 'ult', 'swap', 'mount', 'guard', 'lock', 'auto', 'maptog', 'bag'];   // v1 pad buttons with no meaning here (pause = leave, fullscreen stay)
const DASH_TRAIL = RB({ mode: 1, life: 0.24, width: 58, col: [0.45, 0.8, 2.2, 0.5] });
const WARN_COL = [1.5, 0.3, 0.14, 0.5], WARN_BREAK = [1.2, 0.24, 1.4, 0.5], WARN_AIR = [1.5, 0.6, 1.7, 0.7];   // attack warnings on the ground: red = can be guarded, violet = cannot; the ring in the air of a scream
const CRACK_K = { L: 0.7, M: 1, H: 1.3, F: 1.6 };   // strength of the lash's crack by the move's strength (docs/v2/WHIP.md 7-3)
const SUN = [0.56, 0.56, 0.62], AMB = [0.76, 0.77, 0.84], RIM_HERO = [0.6, 0.7, 1, 0.5], RIM_WARN = [1.7, 0.35, 0.2, 0.85], RIM_ENEMY = [0.55, 0.65, 0.9, 0.35], RIM_PEOPLE = [0.6, 0.66, 0.85, 0.3], RIM_NONE = [0, 0, 0, 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = (x, y, z = 0) => Math.sqrt(x * x + y * y + z * z);   // Math.hypot makes a temporary array per call in V8
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const PX = new Uint8Array(4);

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
    this.perf = readPerf(); this.everyFrame = this.perf.everyFrame; this.res = new Res(this.perf); this._lastDraw = 0;
    this.mode = g.canvasAlpha ? 'under' : 'layer';
    try { globalThis.localStorage?.setItem('bn.v2.under', '1'); } catch { /* private mode */ }   // next launch boots with an alpha canvas
    this.story = typeof params?.story === 'function' ? params.story : null; this.ui = { dialog: null }; this.locked = false;
    this.area = null; this.W = null; this.sim = null; this.fx = null; this.cr = null; this.cast = null; this.hud = createBuiltinHud();
    this.people = new People(); this.anchors = new Anchors(); this.flags = new Set(); this.hidden = new Set(); this.lockOv = new Map(); this.storyFlag = null; this.worldFlags = {};
    this._use = false; this._ringTap = false; this._heroHid = false; this._occ = new Float32Array(0); this._occN = 0; this._caps = { skill: false, bell: false }; this._offT = 0; this._go = null; this.fadeA = 0; this.fadeTo = 0; this._flagFn = (n) => this.flag(n); this._useFn = () => { this._use = true; }; this._skyKey = ''; this._peopleN = 0;
    this.heroA = null; this.actors = []; this.pool = new Map(); this._ERef = null;
    this.bridge = bindFxSound(feel); this.feelN = 0; this.lastFeel = null; this._actE = null; this._simSteps = false;
    this.shotL = new Array(32).fill(null); this.shotN = 0;
    // the whip Vigilia (src/v2/whip, docs/v2/WHIP.md 7): simulated from the hero's hand every tick, drawn right after the characters
    this.whip = null; this.wr = null; this.whipLink = null; this._whipTier = ''; this._whipReset = true; this._whipVp = [0, 0];
    this.whipHand = { x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0, bx: 0, by: 0, bz: 0, br: 12, bh: 104, fx: 1, fz: 0, ground: 0 };
    this.whipPullE = null; this.whipPull = { x: 0, y: 0, z: 0, r: 12 }; this.whipCrack = { x: 0, y: 0, z: 0, strength: 1 };
    this._whipEv = (n, e) => { const L = this.whipLink; if (!L) return; if (n === 'ring') { const s = L.sound; L.sound = false; L.onEvent(n, e); L.sound = s; } else L.onEvent(n, e); };   // the bell's sound comes from the rules (holy.bell / bell.toll): only the picture of the whip's ring here
    this.cam = { yaw: 0, pitch: 0.35, dist: 800, lookY: 60, leadX: 0, leadZ: 0, face: 1, tx: 0, ty: 0, tz: 0, px: 0, py: 300, pz: -700, snap: true, fx: 0, fy: -0.3, fz: 0.95, zf: null, ck: 0, tallK: 0.4, minX: -1e5, maxX: 1e5, lastCenter: null };
    this.camP = { px: 0, py: 300, pz: -700, fx: 0, fy: -0.3, fz: 0.95 };
    this.vp = new Float32Array(16); this.eye = new Float32Array(3); this.eye0 = new Float32Array(3); this.camR = new Float32Array(3); this.camU = new Float32Array(3); this.camF = new Float32Array(3);
    this.fxCam = { vp: this.vp, eye: this.eye, right: this.camR, up: this.camU, fwd: this.camF };
    this.env = { vp: this.vp, eye: this.eye, fog: null, sunDir: new Float32Array(3), sun: SUN, amb: AMB };
    this.A = 1; this.focal = FOCAL;
    this.samples = new Float32Array(300); this.sampleN = 0; this.sorted = new Float32Array(300); this.updMs = 0;
    this.inp = { mx: 0, mz: 0, jump: false, jumpHeld: false, attack: false, attackHeld: false, dash: false, guard: false, lockNext: false, jumpUsed: false, skill: false, skillHeld: false, bell: false, bellHeld: false };
    this.people.prompt.onTap = this._useFn; this._talkT = 0;
    this.numbers = []; for (let i = 0; i < 16; i++) this.numbers.push({ on: false, x: 0, y: 0, z: 0, str: '', color: '#fff', t: 0, big: false });
    this.P12 = new Float32Array(12); this.tmpA = new Float32Array(3); this.tmpB = new Float32Array(3); this.tint = new Float32Array(3); this.pos = { x: 0, y: 0, z: 0 }; this.pr = { x: 0, y: 0, w: 0 };
    this.visY = 0; this.visYP = 0; this.stride = 0; this._mv = null; this._rb = -1; this._swung = false; this._turnDir = 0; this._turnHold = 0; this.tickN = 0; this._dashRb = -1; this._secId = ''; this._deaths = 0; this._ts = 1; this.doneT = 0; this._restored = 0;
    this.c3 = { draws: 0, tris: 0, drawn: 0, culled: 0 }; this.envStat = { chunks: 0, tris: 0, draws: 0 };
    this.layer = { hud: null, hctx: null, timer: 0, shown: true, cw: 0, ch: 0, iw: 0, ih: 0, force: true };
    this.fired = new Set();
    this._bossS = { id: 0, name: '', hp: 0, hpMax: 1, sub: '', stagger: 0, phase: 1, kneel: false, fled: false, staggered: false }; this._modelJobs = new Set();
    const sc = this;
    this.state = {
      viewW: g.viewW, viewH: g.viewH, safe: g.safe ?? { l: 0, t: 0, r: 0, b: 0 }, scale: g.scale, time: 0, hero: null, heroHpMax: TUNE.heroHp ?? 100,
      area: { id: '', name: '', era: 'now' }, night: 'now', section: { id: '', label: '' }, enemies: [], enemiesLeft: 0, yardLeft: 0, numbers: this.numbers, numberN: 0,
      project: (x, y, z, out) => sc.project(x, y, z, out), done: false, doneT: 0, loading: true, message: '', message2: '', debug: this.perf.debug,
      debugLine: () => sc._debugLine(), stats: () => sc.stats(), dialog: null,
      candles: { lit: 5, max: 5 }, resonance: { value: 0, cells: 3 }, left: 0, prompts: this.people.none, boss: null,
      pad: { skill: { mode: 'hook', cd: 0, disabled: true }, bell: { mode: 'short', charge: 0, cd: 0, disabled: true }, roll: { cd: 0, disabled: false }, attack: { disabled: false }, jump: { disabled: false }, lock: { disabled: false } },
    };
    try { this.glr = new GLR({ forceGL1: /[?&]v2gl=1(&|$)/.test(globalThis.location?.search ?? ''), antialias: this.res.aa }); } catch (e) { this.glError = String(e?.message ?? e); console.warn('[v2g]', this.glError); }
    if (this.glr) {
      this._attach();
      this._load(params?.area ?? this.perf.area ?? DEFAULT_AREA, params?.spawn ?? this.perf.spawn ?? null).catch((e) => { if (!this.glr) return; this.glError = String(e?.message ?? e); console.error('[v2g] load failed', e); });   // (left the scene while loading: nothing to report)
    }
    this.hudKind = 'builtin';
    if (UI_LOADER && (this.perf.ui ?? UI_DEFAULT)) this._loadUi();
    try { feel.preload(); } catch { /* no audio yet */ }
    this._api();
  }
  exit() {
    this._detach();
    try { feel.setTimeScale(1); feel.release(); } catch { /* no audio */ }
    try { const hd = this.hud; if (hd) (hd.release ?? hd.dispose)?.call(hd); } catch { /* ui lane */ }
    if (this.fx) { try { this.fx.dispose(); } catch { /* lost context */ } this.fx = null; }
    if (this.wr) { try { this.wr.destroy(); } catch { /* lost context */ } this.wr = null; } this.whip = null; this.whipLink = null; this.whipPullE = null;
    if (this.cr) { this.cr.destroy(); this.cr = null; }
    if (this.glr) { this.glr.destroy(); this.glr = null; }
    for (const c of this._canvases ?? []) { c.width = 1; c.height = 1; }
    this.people?.release(null); this._skyC = null; this.skyTex = null; this.tex = null;
    this._canvases = null; this.ready = false; this.actors.length = 0; this.pool.clear(); this.heroA = null; this.cast = null; this.sim = null; this.W = null;
    if (globalThis.__v2?.scene === this) delete globalThis.__v2;
  }
  /** the plugged-in HUD threw (or did not load): say so once and carry on with the built-in one — play never stops for the interface */
  _hudFail(e) {
    console.warn('[v2g] interface module failed, using the built-in HUD:', String(e?.stack ?? e?.message ?? e));
    const old = this.hud; this.hud = createBuiltinHud(); this.hudKind = 'builtin'; this.showPad = true; this.hidePad = false; this.padHideButtons = HIDE_BTNS;
    try { if (old && old !== this.hud) (old.release ?? old.dispose)?.call(old); } catch { /* already broken */ }
  }
  /** plug the story in: fn(name, data, api); opts.flag(name) answers the actors' `when` flags (otherwise the built-in ones) */
  setStory(fn, opts) { this.story = typeof fn === 'function' ? fn : null; this.storyFlag = typeof opts?.flag === 'function' ? opts.flag : null; if (opts?.flags && typeof opts.flags === 'object') this.setWorldFlags(opts.flags, { reload: false }); }
  /** the cut-glass interface (src/v2/ui): replaces the built-in HUD and hides the v1 pad */
  _loadUi() {
    const g = this.game;
    return UI_LOADER().then((m) => {
      if (!this.glr || g.top !== this || typeof m.createHud !== 'function') return;
      const h = m.createHud(g, { onPause: () => this._pause(), onDisabledPress: (id) => this._padOff(id) }); if (!h) return;
      const old = this.hud; this.hud = h; this.hudKind = 'ui';
      try { if (old && old !== h) (old.release ?? old.dispose)?.call(old); } catch { /* built-in */ }
      if (h.padHideButtons) this.padHideButtons = h.padHideButtons;
      if (h.hidePad) { this.showPad = false; this.hidePad = true; }
    }).catch((e) => this._hudFail(e));
  }
  /** switch between the new buttons and the old pad while playing (pause menu row). Remembered in localStorage 'bn.v2.ui'. */
  setUi(on) {
    try { globalThis.localStorage?.setItem('bn.v2.ui', on ? '1' : '0'); } catch { /* private mode */ }
    if (on) { if (this.hudKind !== 'ui' && UI_LOADER) this._loadUi(); return; }
    if (this.hudKind !== 'ui') return;
    const old = this.hud; this.hud = createBuiltinHud(); this.hudKind = 'builtin'; this.showPad = true; this.hidePad = false; this.padHideButtons = HIDE_BTNS;
    try { (old.release ?? old.dispose)?.call(old); } catch { /* ui lane */ }
  }
  _leave() { const g = this.game; if (g.registry.v2pick) g.go('v2pick', {}, { fade: true }); else g.go('title', {}, { fade: true }); }
  /** ESC / START / the pause button: the pause menu (resume, settings, new buttons <-> old pad, leave) */
  _pause() {
    const ui = this.hudKind === 'ui';
    if (!this.hud.openPause) { this._leave(); return; }
    this.hud.openPause({ onLeave: () => this._leave(), extra: [{ icon: 'next', label: ui ? '옛 단추로 바꾸기' : '새 단추로 바꾸기', onPick: () => this.setUi(!ui) }] });
  }
  /** a short notice through the HUD (the v1 toast only when the HUD has none) */
  _toast(t, kind) { const h = this.hud; if (h.toast) h.toast(t, kind ? { kind } : undefined); else this.game.toast?.(t); }
  /** a pad button the rules cannot use yet was pressed: say so (at most once every 1.5 s) */
  _padOff(id) {
    if (this._offT > 0) return; this._offT = 1.5;
    this._toast(id === 'bell' ? '종은 아직 울릴 수 없다' : id === 'skill' ? '솜씨는 아직 배우지 못했다' : '지금은 쓸 수 없다', 'info');
  }
  /** the rules refused the skill or the bell (PLAY: event deny): one short notice */
  _deny(what, why) {
    if (this._offT > 0 || why === 'busy') return; this._offT = 1.5;
    this._toast(why === 'reso' ? '울림이 모자라다' : why === 'cd' ? '아직 쓸 수 없다' : '지금은 쓸 수 없다', 'info');
  }
  /** the bell was rung long. Next to a bell of the area (interact kind bell) this is the crossing to the twin area — the same spot in the other night */
  _ringLong(boss) {
    const h = this.sim.hero, S = this.people.spots; let spot = null;
    for (let i = 0; i < S.length; i++) { const q = S[i]; if (q.def.kind !== 'bell') continue; const dx = q.x - h.x, dz = q.z - h.z; if (dx * dx + dz * dz < (q.r + 60) * (q.r + 60)) spot = q; }
    this.emit('bell.long', { boss, spot: spot ? spot.id : null, twin: this.area.twin ?? null });
    if (this.story || boss || !spot || !this.area.twin || this._go) return;   // the story decides when it is plugged in (api.bellCross)
    this._go = { to: this.area.twin, spawn: null, keep: true, night: true }; this.fadeTo = 1; this.locked = true;
  }
  /** the boss fight without a story plugged in: say what happened in one line (the story lane replaces these with its own events) */
  _bossNote(name, e, b) {
    if (name === 'kneel') { if (b === 'down') this._toast('여왕이 무릎을 꿇었다 — 곁에서 종을 길게 울려라', 'info'); }
    else if (name === 'bossFlee') this._toast('여왕이 그 밤으로 달아났다', 'warn');
    else if (name === 'bossReturn') this._toast('여왕이 돌아왔다', 'warn');
    else if (name === 'bossDown') { if (b) this._toast('조종이 울렸다 — 여왕이 잠들었다', 'info'); this.emit('boss.down', { boss: e, knelled: !!b }); }
  }
  /** story flag: the story's own answer when plugged in, otherwise the built-in ones ("<section or group>_clear", set by events) */
  flag(name) {
    if (this.storyFlag) { try { return !!this.storyFlag(name); } catch { return false; } }
    if (this.flags.has(name) || this.worldFlags[name]) return true;
    const i = name.length - 6;
    if (i > 0 && name.indexOf('_clear') === i && this.sim) {
      const E = this.sim.enemies; let seen = false;
      for (let k = 0; k < E.length; k++) { const e = E[k], hit = e._sec !== undefined && (name.startsWith(e._sec) && e._sec.length === i || (e.group && name.startsWith(e.group) && e.group.length === i)); if (!hit) continue; seen = true; if (!e.dead && e.state !== 'dead') return false; }
      return seen;
    }
    return false;
  }
  /**
   * story flags the areas are built from (AREA_FORMAT 13: a shut gate, a mended stair, who stands where). Kept for the whole visit
   * and handed to every AREAS[id](flags). When a flag changes, the area the hero stands in is rebuilt in place behind a short fade:
   * same spot, the fallen stay fallen, health as it was. -> true when a rebuild was started.
   */
  setWorldFlags(obj, opts) {
    let changed = false;
    for (const k of Object.keys(obj ?? {})) { const v = !!obj[k]; if (!!this.worldFlags[k] !== v) { if (v) this.worldFlags[k] = true; else delete this.worldFlags[k]; changed = true; } }
    if (!changed || opts?.reload === false || !this.ready || !this.area || this.area.test || this._go) return false;
    this._go = { to: this.area.id, spawn: null, keep: true, same: true }; this.fadeTo = 1; this.locked = true;
    return true;
  }
  /** open / close an exit (the story decides; overrides are kept for the whole visit of the scene). areaId defaults to this area. */
  unlockExit(id, areaId) { return this._setLock(id, areaId ?? this.area?.id, null); }
  lockExit(id, areaId, key = 'story') { return this._setLock(id, areaId ?? this.area?.id, key); }
  _setLock(id, areaId, v) {
    this.lockOv.set(areaId + '/' + id, v);
    if (this.area?.id !== areaId) return false;
    for (const x of this.area.exits) if (x.id === id) { x.locked = v; if (x._box) x._box.solid = !!v; x._near = false; return true; }
    return false;
  }
  hideActor(id) { this.hidden.add(id); }
  showActor(id) { this.hidden.delete(id); }
  /** the hero uses what the prompt offers: a person (event talk) or a spot (event interact) */
  _useTarget() {
    const t = this.people.target; if (!t) return;
    const d = t.def;
    if (t.a3) {
      this.people.talking = t;
      this.emit('talk', { id: t.id, talk: d.talk ?? null, actor: d });
      if (!this.story) this._say({ speaker: t.name, portrait: t.portrait, side: 'left', text: LINES[t.id] ?? LINES[d.model] ?? '……' });
    } else {
      this.emit('interact', { id: d.id, kind: d.kind, event: d.event ?? null, data: d.data ?? null, locked: d.locked ?? null, spot: d });
      if (d.kind === 'ring') { if (this._caps.skill && this.sim?.hero?.hookId != null) this._ringTap = true; else this._toast('채찍이 닿지 않는다', 'warn'); return; }   // a whip ring: the pill does what the skill button does here
      if (!this.story) {   // until the story is plugged in: name the spot, and remember what it would change
        if (d.event === 'door.pull') this.flags.add('door_pulled');
        if (d.kind === 'rest' && !d.locked && this.sim?.heal) {   // a rest spot: full health, and the hero stands up here after a fall (PLAY-2: sim.heal / sim.respawnAt)
          const got = this.sim.heal('full'); this.sim.respawnAt?.(d.x, d.z, d.y);
          this._toast(got > 0 ? '촛불 곁에서 쉬었다 — 기운이 돌아왔다' : '촛불 곁에서 쉬었다', 'info');
        } else
        this._toast(d.locked ? d.label + ' — 지금은 열리지 않는다' : d.label, d.locked ? 'warn' : 'info');
      }
    }
  }
  /** one dialogue box through the HUD (UI lane's box, or the built-in one) */
  _say(d) { const h = this.hud; if (h.showDialog) h.showDialog(d); else this.ui.dialog = d; }
  /** wake every enemy of a spawn group (area triggers `wake`, or the story) */
  wakeGroup(group) {
    const SP = this.W?.spawns ?? [], E = this.sim?.enemies ?? []; let n = 0;
    for (let i = 0; i < E.length; i++) { const e = E[i], g = e.group ?? (E.length === SP.length ? SP[i].group : null); if (g !== group || e.dead || e.state === 'dead') continue; if (this.sim.wake && !e.active) this.sim.wake(e); e.active = true; if (e.state === 'idle') { e.state = 'chase'; e.stateT = 0; } n++; }
    return n;
  }
  /** the hero stepped into an open exit: fade to black, load the target area at the named spawn, fade back in. A target that is not built says so. */
  _travel(x) {
    this._exitBusy = true;
    hasArea(x.to).then((ok) => {
      if (!this.glr) return;
      if (!ok) { this._exitBusy = false; this._toast((x.label ? x.label + ' — ' : '') + '아직 갈 수 없는 곳이다', 'warn'); this.emit('exit.missing', { id: x.id, to: x.to }); return; }
      this.emit('exit', { id: x.id, to: x.to, spawn: x.spawn ?? null });
      this._go = { to: x.to, spawn: x.spawn ?? null }; this.fadeTo = 1; this.locked = true;   // update() starts the load when the picture is black
    }).catch((e) => { this._exitBusy = false; console.error('[v2g] travel failed', e); });
  }
  /** a locked exit is a wall; the hero pushing against it is told why (once per approach). 'not_built' = the target does not exist yet */
  _lockedMsg(x) {
    const nb = x.locked === 'not_built', lab = x.label ? x.label + ' — ' : '';
    if (nb) this.emit('exit.missing', { id: x.id, to: x.to, exit: x }); else this.emit('exit.locked', { id: x.id, locked: x.locked, exit: x });
    if (nb) this._toast(lab + '아직 갈 수 없는 곳이다', 'warn');
    else if (!this.story) this._toast(lab + (this._autoKey(x) ? '잠겨 있다. 이곳의 적을 모두 쓰러뜨리면 열린다' : '지금은 열리지 않는다'), 'warn');
  }
  /** without a story: an exit locked by a key opens when the area's arena is cleared (the story lane replaces this rule) */
  _autoKey(x) { return !this.story && typeof x.locked === 'string' && x.locked !== 'not_built' && x.locked.indexOf('story:') !== 0; }
  /** story / event seam: the scene calls story(name, data, api) on triggers */
  emit(name, data) {
    if (!this.story) return;
    if (!this._sapi) {
      const sc = this;
      this._sapi = {
        scene: sc, get sim() { return sc.sim; }, lock(on) { sc.locked = !!on; }, teleport(id) { return globalThis.__v2?.teleport(id); },
        gotoArea(id, spawn, o) { return sc.gotoArea(id, spawn, o); }, fx(n, o) { sc.fx?.play(n, o); }, sound(n, pos) { try { feel.play(n, pos ?? null); } catch { /* no audio */ } }, setDialog(d) { sc.ui.dialog = d ?? null; },
        toast(t, kind) { sc._toast(t, kind); }, unlockExit(id, area) { return sc.unlockExit(id, area); }, lockExit(id, area, key) { return sc.lockExit(id, area, key); }, hideActor(id) { sc.hideActor(id); }, showActor(id) { sc.showActor(id); },
        setFlags(obj, o) { return sc.setWorldFlags(obj, o); }, heal(n) { return sc.sim?.heal ? sc.sim.heal(n ?? 'full') : 0; }, restAt(x, z, y) { sc.sim?.respawnAt?.(x, z, y); },
        wakeGroup(g) { return sc.wakeGroup(g); }, groupLeft(g) { return sc.groupLeft(g); }, bellCross(o) { if (!sc.area?.twin || sc._go) return false; sc._go = { to: sc.area.twin, spawn: null, keep: true, night: true }; sc.fadeTo = 1; sc.locked = true; return true; },
      };
    }
    try { this.story(name, data, this._sapi); } catch (e) { console.error('[v2g] story handler failed:', name, e); }
  }
  /** living enemies of a spawn group */
  groupLeft(group) { const E = this.sim?.enemies ?? []; let n = 0; for (let i = 0; i < E.length; i++) if (E[i].group === group && !E[i].dead && E[i].state !== 'dead') n++; return n; }
  /** leave this area for another one (resources of the old area are released). opts.keepPosition: stand at the same x, z (twin areas — the bell crossing) */
  async gotoArea(id, spawn, opts) {
    if (!this.glr) return false;
    const h = this.sim?.hero, keep = opts?.keepPosition && h ? { x: h.x, z: h.z, face: [h.dirX ?? 1, h.dirZ ?? 0] } : null;
    let was = null;   // the same area rebuilt in another state (opts.same): who had fallen, the hero's health, whether the arena was done
    if (opts?.same && this.sim && id === this.area?.id) { was = { dead: new Set(), hp: h.hp, reso: h.reso, done: !!this.sim.done }; for (const e of this.sim.enemies) if (e.dead || e.state === 'dead') was.dead.add(e.kind + '@' + Math.round(e.homeX ?? e.x) + ',' + Math.round(e.homeZ ?? e.z)); }
    this.ready = false; this.state.loading = true;
    this._releaseArea();
    try { await this._load(id, spawn, keep); } catch (e) { if (this.glr) { this.glError = String(e?.message ?? e); console.error('[v2g] area load failed', e); } }
    if (was && this.ready && this.sim) {
      const sim = this.sim, hh = sim.hero;
      for (const e of sim.enemies) if (was.dead.has(e.kind + '@' + Math.round(e.homeX ?? e.x) + ',' + Math.round(e.homeZ ?? e.z))) { e.dead = true; e.hp = 0; e.active = false; }
      if (was.hp > 0 && !hh.dead) hh.hp = Math.min(hh.hpMax ?? was.hp, was.hp);
      if (was.reso !== undefined && hh.reso !== undefined) hh.reso = was.reso;
      if (was.done) sim.done = true;   // the arena stays cleared: no second bell, no second "area.clear"
    }
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
  resize() { if (this.layer) this.layer.force = true; try { this.hud?.resize?.(); } catch { /* ui lane */ } }
  // ───────────────────────── loading ─────────────────────────
  _releaseArea() {
    const glr = this.glr, gl = glr.gl;
    if (this.fx) this.fx.clear();
    for (const m of this.envMeshes ?? []) { if (m.mesh.buf) { gl.deleteBuffer(m.mesh.buf); glr.stats.bufBytes -= m.mesh.data.byteLength; } const i = glr.meshList.indexOf(m.mesh); if (i >= 0) glr.meshList.splice(i, 1); }
    this.envMeshes = null; this.sim = null; this._ERef = null; this.shotN = 0;
    for (const a of this.actors) this._free(a);
    this.actors.length = 0;
    this.people.release(this); this.anchors.list.length = 0; this.state.prompts = this.people.none;
  }
  async _load(areaId, spawn, keep) {
    const t0 = performance.now(), glr = this.glr, first = !this.tex;
    const area = await loadArea(areaId, this.worldFlags), W = area.W, E = W.env;
    if (!this.glr) return;
    for (const x of area.exits) {   // exits: saved lock overrides, and the wall that stands in the box while it is locked
      const k = area.id + '/' + x.id; if (this.lockOv.has(k)) x.locked = this.lockOv.get(k);
      x._box = null; for (let i = 0; i < W.boxes.length; i++) if (W.boxes[i].gate === x.id) x._box = W.boxes[i];
      if (x._box) x._box.solid = !!x.locked; x._near = false;
    }
    const cvs = this._canvases ?? (this._canvases = []);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; cvs.push(c); return c; };
    this.urls = this.urls ?? new Set();
    // 1) world textures: v1 stone/wood files + env kit files, only the ones this area uses
    const need = E.stats.textures.filter((n) => !(this.tex && this.tex[n]));
    const imgs = {}, jobs = [];
    for (const n of need) {
      if (TEX_SRC[n]) jobs.push(assets.load(TEX_SRC[n].src).then((im) => { imgs[n] = im && im.width > 1 ? im : null; }, () => { imgs[n] = null; }));
      else jobs.push(new Promise((res) => { const im = new Image(); im.onload = () => { imgs[n] = im; res(); }; im.onerror = () => { imgs[n] = null; console.warn('[v2g] texture failed to load:', n); res(); }; im.src = ASSET_ROOT + kitTexPath(n); this.urls.add('assets/' + kitTexPath(n)); }));
    }
    const skyKey = W.sky.img + '|' + W.sky.crop + '|' + W.fog.color.join(','), newSky = skyKey !== this._skyKey;   // sky picture and its fog colour belong to the area and its night
    if (newSky) jobs.push(assets.load(W.sky.img).then((im) => { imgs.__sky = im && im.width > 1 ? im : null; }, () => { imgs.__sky = null; }));
    await Promise.all(jobs);
    if (!this.glr) return;
    this.tex = this.tex ?? {};
    for (const n of need) {
      const im = imgs[n], T = TEX_SRC[n], c = mk(T ? 512 : im?.width ?? 64, T ? 512 : im?.height ?? 64), x = c.getContext('2d');
      if (im) x.drawImage(im, 0, 0, c.width, c.height); else { x.fillStyle = '#6a6a72'; x.fillRect(0, 0, c.width, c.height); }
      if (T?.desat) { x.globalCompositeOperation = 'saturation'; x.globalAlpha = T.desat; x.fillStyle = '#808080'; x.fillRect(0, 0, 512, 512); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; }
      this.tex[n] = glr.texture(() => c, { repeat: T ? true : KIT_TEX[n]?.repeat ?? true, mip: true });
    }
    if (newSky) {   // sky backdrop: the top of the painted background, melted into this area's fog colour at the bottom (one canvas, one texture, redrawn per area)
      const c = this._skyC ?? (this._skyC = mk(2048, 512)), x = c.getContext('2d'), im = imgs.__sky, f = W.fog.color, fr = Math.round(f[0] * 255), fg = Math.round(f[1] * 255), fb = Math.round(f[2] * 255);
      x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, 2048, 512);
      if (im) x.drawImage(im, 0, 0, im.width, im.height * W.sky.crop, 0, 0, 2048, 512);
      else { const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#0a1018'); g.addColorStop(1, '#2a1a26'); x.fillStyle = g; x.fillRect(0, 0, 2048, 512); }
      const g = x.createLinearGradient(0, 380, 0, 512); g.addColorStop(0, `rgba(${fr},${fg},${fb},0)`); g.addColorStop(1, `rgba(${fr},${fg},${fb},1)`); x.fillStyle = g; x.fillRect(0, 380, 2048, 132);
      if (!this.skyTex) this.skyTex = glr.texture(() => c, {});
      else if (!glr.lost) { const gl = glr.gl; gl.bindTexture(gl.TEXTURE_2D, this.skyTex.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); }
      this._skyKey = skyKey;
    }
    if (first) {
      {   // small atlas for ground decals (all eight kinds of the env kit) and lamp glows (no prop cards)
        const c = mk(1024, 512), x = c.getContext('2d'), R = (this.spr = {});
        const put = (name, px, w, h, draw) => { x.save(); x.translate(px, 2); draw(x); x.restore(); R[name] = { u0: (px + 0.5) / 1024, v0: 2.5 / 512, u1: (px + w - 0.5) / 1024, v1: (2 + h - 0.5) / 512 }; };
        const radial = (stops) => (q) => { const g = q.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [o, col] of stops) g.addColorStop(o, col); q.fillStyle = g; q.fillRect(0, 0, 128, 128); };
        put('glow', 2, 128, 128, radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.14)'], [1, 'rgba(255,255,255,0)']]));
        put('blob', 134, 128, 128, radial([[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]));
        const d = drawEnvDecals(x, 270, 2);
        for (const k of Object.keys(d)) R[k] = { u0: (d[k][0] + 1) / 1024, v0: (d[k][1] + 1) / 512, u1: (d[k][0] + 127) / 1024, v1: (d[k][1] + 127) / 512 };
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
    for (const k of [...kinds]) for (const at of KINDS[k].attacks ?? []) if (at.summon && KINDS[at.summon.kind] && !kinds.includes(at.summon.kind)) kinds.push(at.summon.kind);   // what a boss calls in (the queen's grave ghosts) is loaded with the area
    const missing = [...new Set(W.spawns.map((s) => s.kind))].filter((k) => !KINDS[k]);
    if (missing.length) console.warn('[v2g] spawn kinds without a KINDS entry are not drawn:', missing.join(', '));
    if (!this.cr) { this.cr = new CharRenderer(glr.gl, { maxJoints: 32 }); this.cast = new Cast(this.cr); this._restored = glr.restored; }
    // models: the hero, the enemy kinds this area spawns, the people who live here. What the new area does not use is freed first
    // (GPU memory stays bounded by one area). People get half-size textures: they stand in the background of a fight.
    const eModels = [...new Set(kinds.map((k) => KINDS[k].model))], sword = !glr.webgl2, weapons = [...(sword ? ['blade'] : []), ...new Set(kinds.map((k) => KINDS[k].weapon).filter(Boolean))];   // WebGL1 has no whip renderer: the box sword stays there
    const pModels = People.models(area).filter((m) => m !== HERO_MODEL && !eModels.includes(m));
    this._dropModels(new Set([HERO_MODEL, ...eModels, ...pModels]), new Set(weapons));
    await this.cast.load([{ model: HERO_MODEL, hero: true }, ...eModels.map((m) => ({ model: m }))], weapons, { texCap: this.perf.texCap, libWins: driveHero !== PLACEHOLDER_DRIVE_HERO });
    if (!this.glr) return;
    if (pModels.length) { try { await this.cast.load(pModels.map((m) => ({ model: m })), [], { texCap: Math.min(512, this.perf.texCap) }); } catch (e) { console.warn('[v2g] a person model failed to load (that person is not drawn):', String(e?.message ?? e)); } }
    if (!this.glr) return;
    if (!this.heroA) this.heroA = this.cast.actor(HERO_MODEL, sword ? 'blade' : null, {});   // no sword: the hand (GRIPS.blade) holds the whip's handle
    // 4) effects
    if (!this.fx) this._makeFx();
    // 5) rules
    this.area = area; this.W = W; this.env.fog = W.fog;
    { const d = W.light.moonDir, l = hyp(d[0], d[1], d[2]) || 1; this.env.sunDir[0] = d[0] / l; this.env.sunDir[1] = d[1] / l; this.env.sunDir[2] = d[2] / l; }
    this.sim = new Sim(W, this._hooks());
    this._enterAt(spawn, keep);
    this.people.build(this, area, groundAt); this.anchors.build(area, this.perf.tier); this._peopleN = 19;
    { const B = W.boxes; let n = 0; for (let i = 0; i < B.length; i++) { const b = B[i]; if (b.solid && !b.walk && !b.gate && !b.actor) n++; }   // what can hide the hero: walls and props (not floors, not the scene's own gate / person boxes)
      const O = (this._occ = new Float32Array(n * 6)); n = 0; for (let i = 0; i < B.length; i++) { const b = B[i]; if (!b.solid || b.walk || b.gate || b.actor) continue; O[n] = b.x0; O[n + 1] = b.x1; O[n + 2] = b.y0; O[n + 3] = b.y1; O[n + 4] = b.z0; O[n + 5] = b.z1; n += 6; } this._occN = n; }
    { const c = this._caps, sim = this.sim, hh = sim.hero;   // what the rules can do today (PLAY lane lands skill and bell later): the pad shows the rest as not usable yet
      c.skill = !!(sim.caps?.skill ?? (hh.callCd !== undefined || hh.skillMode !== undefined || TUNE.callCd !== undefined));   // PLAY: skill = whip hook / call (hero.callCd, skillMode)
      c.bell = !!(sim.caps?.bell ?? (hh.bellCd !== undefined || TUNE.bellCd !== undefined)); }                                 //       bell = echo (tap) / long ring (hold), hero.bellCd, bellCharge
    this._deaths = this.sim.deaths ?? 0; this._secId = ''; this.cam.snap = true; this.doneT = 0; this.fired.clear();
    this.state.area.id = area.id; this.state.area.name = area.name; this.state.area.era = area.era; this.state.night = area.era;
    // 6) warm everything behind the loading screen, then wait for the GPU
    for (const k of kinds) for (let i = this._poolOf(KINDS[k].model).length; i < Math.min(4, W.spawns.length); i++) { const a = this._newActor(k); if (a) this._free(a); }
    this._tick0();
    this._warm();
    this.loadMs = Math.round(performance.now() - t0);
    this.ready = true; this.state.loading = false; this.sampleN = 0;
    this.emit('area.enter', { area: area.id, era: area.era });
  }
  /** put the hero at a named spawn of the area (docs/v2/AREA_FORMAT.md 3); a section id still works for the test route */
  _enterAt(spawn, keep) {
    const sim = this.sim, h = sim.hero, sp = keep ?? (spawn ? this.area.spawns?.[spawn] ?? null : null), ha = this.heroA;   // an unknown name: a section id of the test route (sim.teleport), else the default spawn the stage already used
    if (sp && Number.isFinite(sp.x) && Number.isFinite(sp.z)) {
      h.x = sp.x; h.z = sp.z; const gy = groundAt(this.W, h.x, h.z, sp.y != null ? sp.y + 40 : Infinity); if (Number.isFinite(gy)) h.y = gy;
      h.vx = 0; h.vz = 0; h.vy = 0; if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; }
      if (Array.isArray(sp.face)) { const l = hyp(sp.face[0], sp.face[1]) || 1; h.dirX = sp.face[0] / l; h.dirZ = sp.face[1] / l; if (h.facing !== undefined) h.facing = h.dirX < 0 ? -1 : 1; if (ha) { ha.dx = h.dirX; ha.dz = h.dirZ; } }
    } else if (spawn && sim.teleport) sim.teleport(spawn);
    if (!sp && ha && h.dirX !== undefined) { ha.dx = h.dirX; ha.dz = h.dirZ ?? 0; }
    this._exitIn = null; this._exitBusy = false;
  }
  _makeFx() {
    const p = this.perf;
    try { this.fx = createFx(this.glr.gl, { tier: p.tier, post: p.post, groundY: 0, lightPools: true, onEvent: this.bridge.onEvent }); }
    catch (e) { console.warn('[v2g] effects are off:', String(e?.message ?? e)); this.fx = null; }
    this._dashRb = -1;
    for (let i = 0; i < this.shotN; i++) this.shotL[i]._rb = undefined;   // handles of a lost context are dead
    this.shotN = 0;
    this._makeWhip();
  }
  /** the whip: chain (per performance tier), its own renderer (WebGL2 only) and the default wiring of its events to effects + feel */
  _makeWhip() {
    const glr = this.glr; if (!glr || !glr.webgl2) return;
    this.whipLink = whipFx(this.fx, feel);
    const tier = this.perf.tier;
    if (!this.whip || this._whipTier !== tier) { this.whip = createWhip({ tier, onEvent: this._whipEv }); this._whipTier = tier; this._whipReset = true; }
    if (!this.wr) { try { this.wr = new WhipRenderer(glr.gl); } catch (e) { console.warn('[v2g] the whip is not drawn:', String(e?.message ?? e)); this.wr = null; } }
  }
  /** draw every model, texture and effect once and block until the GPU has really done it (no hitch in the first fight) */
  _warm() {
    const glr = this.glr, gl = glr.gl, fx = this.fx, g = this.game, h = this.sim.hero;
    this._camera(1 / 60);
    if (fx) {
      const P = PRESET_IDS, x = h.x + 60, y = h.y, z = h.z, ev = fx.onEvent;
      fx.onEvent = null; fx.feelOn = false;   // warm-up is silent and must not leave a hit-stop or a flash behind
      for (const n of ['hit.slash.light', 'hit.slash.heavy', 'hit.crit', 'hit.finisher', 'hit.guard', 'move.dash', 'move.land', 'move.step', 'move.jump', 'enemy.hurt', 'enemy.death.bone', 'enemy.death.ash']) if (P[n] !== undefined) fx.playAt(P[n], x, y + 50, z, 1, 0, 1, x + 200, y, z);
      const el = elementOf(this.pos, null); shotImpact(fx, el, x, y + 50, z, y);
      const rb = fx.ribbons.start(DASH_TRAIL); fx.ribbons.push(rb, x, y + 50, z, 0, 0, 0); fx.update(0.02); fx.ribbons.push(rb, x + 30, y + 50, z, 0, 0, 0); fx.ribbons.end(rb);
      fx.feel.flash(1, 1, 1, 0.2); fx.update(0.03);
      fx.onEvent = ev; fx.feelOn = true;
    }
    this._gl(g.viewW, g.viewH, 1, true);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PX);
    if (fx) { fx.clear(); this._gl(g.viewW, g.viewH, 1, false); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PX); }
  }
  // ───────────────────────── characters ─────────────────────────
  _poolOf(model) { let p = this.pool.get(model); if (!p) { p = []; this.pool.set(model, p); } return p; }
  /** free the character and weapon models the next area does not use (their pooled actors go with them) */
  _dropModels(models, weapons) {
    const cast = this.cast, cr = this.cr; if (!cast || !cr) return;
    for (const [id, a] of [...cast.assets]) if (!models.has(id)) { cr.remove(a.gpu); cast.assets.delete(id); this.pool.delete(id); }
    for (const [id, w] of [...cast.weapons]) if (!weapons.has(id)) { cr.remove(w.gpu); cast.weapons.delete(id); }
  }
  /** the arena of this area is cleared and no story is plugged in: exits locked by a key open (the story lane owns this later) */
  _autoOpen() {
    for (const x of this.area?.exits ?? []) {
      if (!this._autoKey(x)) continue;
      const areaId = this.area.id;
      hasArea(x.to).then((ok) => (ok ? flagsThatOpen(areaId, this.worldFlags, x.id) : undefined)).then((fl) => {
        if (fl === undefined || !this.glr || this.area?.id !== areaId) return;
        this._toast((x.label ? x.label + ' — ' : '') + '길이 열렸다', 'info');
        if (fl) this.setWorldFlags(fl);          // the world has a state for it (the gate leaves swing open, the blocker goes): rebuild the area in that state
        else this._setLock(x.id, areaId, null);  // no such state: only the wall in the exit box goes
      });
    }
  }
  _newActor(kind) { const K = KINDS[kind]; if (!K) return null; const a = this.cast.actor(K.model, K.weapon, { height: K.height, grip: K.grip, scale: K.scale }); if (a) { a.kind = kind; a.e = null; } return a; }
  _take(e) {
    const K = KINDS[e.kind]; if (!K) return null;
    const p = this._poolOf(K.model); let a = p.length ? p.pop() : this._newActor(e.kind);
    if (!a) {   // a kind the area did not list (added by the rules or the story while playing): load its model once, the enemy is drawn when it has arrived
      const cast = this.cast, J = this._modelJobs;
      if (cast && !cast.assets.has(K.model) && !J.has(K.model)) { J.add(K.model); cast.load([{ model: K.model }], K.weapon ? [K.weapon] : [], { texCap: this.perf.texCap }).catch((er) => console.warn('[v2g] model failed to load:', K.model, String(er?.message ?? er))).then(() => { J.delete(K.model); if (!cast.assets.has(K.model)) J.add(K.model); }); }
      return null;
    }
    if (!a.warnH) a.warnH = new Int32Array(8); a.warnN = 0; a.warnAtk = null;
    a.kind = e.kind; a.e = e; a.hitAge = 9; a.dieAge = -1; a.dieHold = 0; a.accDt = 0; a.vis = true; a.kbT = 0; a.wasDead = false; a.seed = Math.random() * 7;
    const fx = e.dirX ?? e.facing ?? -1, fz = e.dirZ ?? 0, l = hyp(fx, fz) || 1; a.dx = fx / l; a.dz = fz / l;
    a.anim.play(a.asset.clips.idle ? 'idle' : Object.keys(a.asset.clips)[0], { fade: 0, restart: true }); a.anim.update(0);
    e._a3 = a; this.actors.push(a);
    return a;
  }
  /** an enemy starts to die: its death clip plays for the kind's own time (e.dying), the last DIE_T seconds dissolve to ash */
  _dying(a, e) { a.dieAge = 0; a.dieHold = Math.max(0, (e.dying > 0 ? e.dying : DIE_T) - DIE_T); }
  _free(a) { if (a.warnN && this.fx) { for (let i = 0; i < a.warnN; i++) this.fx.quads.kill(a.warnH[i]); } a.warnN = 0; a.warnAtk = null; if (a.e && a.e._a3 === a) a.e._a3 = null; a.e = null; this._poolOf(a.asset.id).push(a); }
  /**
   * Where a wound-up attack will land, for the shapes the plain disc cannot show (PLAY_API 7): a fan (atk.arc), lanes of shots
   * (atk.mark.box x fan), circles away from the body (atk.mark.radius + ring: where the called ghosts rise), the ring in the air
   * of a scream (atk.air). Laid once when the wind-up starts as ground marks of the effects engine that fill up until the strike;
   * taken away when the wind-up ends or is broken. A song (atk.pulse) keeps its circle for as long as it is sung.
   */
  _warn(a, e, fx) {
    const A = e.atk, on = !!A && !e.dead && e.state !== 'dead' && (e.tele > 0 || (!!A.pulse && e.state === 'attack' && a.warnAtk === A));
    if (!on) { if (a.warnN) { for (let i = 0; i < a.warnN; i++) fx.quads.kill(a.warnH[i]); a.warnN = 0; } a.warnAtk = null; return; }
    if (a.warnAtk === A) return;
    a.warnAtk = A;
    const M = A.mark ?? null; if (!A.arc && !M && !A.air) return;
    const Qd = fx.quads, H = a.warnH, gy = e._gy ?? e.gy ?? e.y, dx = e.dirX ?? a.dx, dz = e.dirZ ?? a.dz, yaw = Math.atan2(dz, dx);
    const T = Math.max(0.15, (A.windup ?? 0.8) * (1 - clamp(e.tele, 0, 1))), life = T + 0.14 + (A.pulse ? A.strike ?? 0 : 0), col = A.guard === 'break' ? WARN_BREAK : WARN_COL;
    let n = 0;
    if (A.arc) H[n++] = Qd.ground(Q.SECTOR, e.x, gy, e.z, A.arc.r, A.arc.r, yaw, life, col, 1, 1, T, 0, 1, 0, A.arc.deg * 0.5 * Math.PI / 180, 0.06);
    if (M && M.box) { const fan = M.fan ?? 1, sp = (M.spread ?? 0) * Math.PI / 180, f0 = M.box.f0, f1 = M.box.f1;
      for (let i = 0; i < fan && n < 6; i++) { const an = yaw + (i - (fan - 1) / 2) * sp, cx = Math.cos(an), cz = Math.sin(an), m = (f0 + f1) * 0.5; H[n++] = Qd.ground(Q.LINE, e.x + cx * m, gy, e.z + cz * m, (f1 - f0) * 0.5, Math.max(14, M.box.side * 1.5), an, life, col, 1, 1, T, 0, 1, 0, 0, 0.06); } }
    if (M && M.radius) {
      if (M.ring) { const k = A.summon ? A.summon.n : 2, t1 = (e.t ?? 0) + T; for (let i = 0; i < k && n < 7; i++) { const an = t1 * 1.7 + i * 6.2832 / k; H[n++] = Qd.ground(Q.CIRCLE, e.x + Math.cos(an) * M.ring, gy, e.z + Math.sin(an) * M.ring * 0.8, M.radius.r, M.radius.r, 0, life, col, 1, 1, T, 0, 1, 0, 0, 0.08); } }
      else H[n++] = Qd.ground(Q.CIRCLE, e.x + dx * (M.radius.fwd ?? 0), gy, e.z + dz * (M.radius.fwd ?? 0), M.radius.r, M.radius.r, 0, life, col, 1, 1, T, 0, 1, 0, 0, 0.08);
    }
    if (A.air && n < 8) { const r = A.radius?.r ?? M?.radius?.r ?? 200; H[n++] = Qd.ground(Q.RING, e.x, gy + 78, e.z, r, r, 0, life, WARN_AIR, 0.12, 1, 0, 0, 1, 0, 0, 0.06); }
    a.warnN = n;
  }
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
  /**
   * One-shot effect preset owned by the scene: picture + its sound event through the bridge, WITHOUT the preset's own
   * screen feel (hit-stop, shake, zoom come from the feel table once — see hit()). silent = picture only.
   * Without the effect engine (WebGL1) only the sound event is sent.
   */
  _fxp(name, x, y, z, dx, dz, pow, silent) {
    const fx = this.fx, id = PRESET_IDS[name]; if (id === undefined) return;
    if (!fx) { if (!silent) { try { this.bridge.onEvent(name, x, y, z, 1); } catch { /* no audio */ } } return; }
    const ev = fx.onEvent; fx.feelOn = false; if (silent) fx.onEvent = null;
    try { fx.playAt(id, x, y, z, dx, dz, pow, x + dx * 320, y, z + dz * 320); } catch { /* no audio */ }
    fx.feelOn = true; fx.onEvent = ev;
  }
  /** one melee contact: effect + sound + haptics in ONE call (bridge.strike); the screen feel is applied once from the table recipe */
  _strike(weapon, material, st, flags, x, y, z, dx, dz) {
    const fx = this.fx; let r = null;
    if (fx) fx.feelOn = false;
    try { r = this.bridge.strike(fx, weapon, material, st, flags, x, y, z, dx, dz); } catch { r = null; }
    if (fx) fx.feelOn = true;
    const F = fx ? fx.feel : null;
    if (F && r) {
      F.hitStop(r.stop, !!r.big); fx.trauma(r.shake, dx, 0, dz); if (r.kick) F.kick(dx, 0, dz, r.kick);
      if (r.zoom > 1) F.zoomPunch(r.zoom - 1, (r.zoomT ?? 0) * 0.5);
      if (r.slow) F.slowMo(r.slow[1], r.slow[0]);
      if (flags & FLAG.finisher) { F.flash(1, 0.92, 0.75, 0.42); F.vignette(1, 0.45, 0.1, 0.3); }
    }
    this.feelN++; this.lastFeel = r;
    return r;
  }
  _hooks() {
    const sc = this;
    const snd = (name, pos) => { try { return feel.play(name, pos); } catch { return null; } };
    const number = (x, y, z, str, color, big) => { const N = sc.numbers; let n = N[0]; for (let i = 0; i < N.length; i++) { if (!N[i].on) { n = N[i]; break; } if (N[i].t > n.t) n = N[i]; } n.on = true; n.x = x; n.y = y; n.z = z; n.str = str; n.color = color; n.t = 0; n.big = !!big; };
    return {
      hit(e, dmg, mv, x, y, z, info) {
        const h = sc.sim.hero, K = KINDS[e.kind], kill = e.hp <= 0, blocked = !!info?.blocked && !kill;
        const st = mv?.strength ?? mv?.str ?? (mv?.finisher || mv?.id === 'sw3' ? 'H' : 'M');
        let flags = (mv?.crit ? FLAG.crit : 0) | (blocked ? FLAG.guard : 0);
        if (kill) { flags |= FLAG.kill; let left = 0; const E = sc.sim.enemies; for (let i = 0; i < E.length; i++) if (E[i] !== e && !E[i].dead && E[i].state !== 'dead' && E[i].hp > 0 && (E[i].yard || !e.yard)) left++; if (e.yard && left === 0) flags |= FLAG.finisher; }
        const dx = info?.dirX ?? h.dirX ?? h.facing ?? 1, dz = info?.dirZ ?? h.dirZ ?? 0;
        const wpn = mv?.weapon ?? 'whip';
        if (sc.whip && wpn === 'whip') { const C = sc.whipCrack; C.x = x; C.y = y; C.z = z; C.strength = CRACK_K[st] ?? 1; sc.whip.set('crack', C); }   // the tip lands on the hit point in this tick; the hit-stop freezes it there
        const r = sc._strike(wpn, info?.material ?? K?.material ?? 'bone', st, flags, x, y, z, dx, dz);
        if (!blocked) sc._fxp('enemy.hurt', x, y, z, dx, dz, 1, true);
        if (e._a3) e._a3.hitAge = 0;
        number(e.x, e.y + (e.h ?? 80) + 14, e.z, String(dmg), blocked ? '#9fb4d8' : st === 'H' || st === 'F' ? '#ffd870' : '#ffffff', st === 'F' || !!(flags & FLAG.crit));
        try { input.rumble?.(0.3, 0.5, 40); } catch { /* no pad */ }
        return r;   // the rules may read r.stop (same table); the scene still owns the freeze
      },
      kill(e) {
        const K = KINDS[e.kind], h = sc.sim.hero, dx = h.dirX ?? h.facing ?? 1, dz = h.dirZ ?? 0, a = e._a3;
        if (a && a.dieAge < 0) sc._dying(a, e);
        const bone = (K?.death ?? (K?.material === 'bone' ? 'bone' : 'ash')) === 'bone';
        if (bone) sc._fxp('enemy.death.bone', e.x, e.y, e.z, dx, dz, 1, true);   // the kill layer of the hit sound already carries the collapse
        sc.emit('enemy.kill', { enemy: e });
        if (e.group && sc.groupLeft(e.group) === 0) sc.emit('group.clear', { group: e.group });
      },
      heroHurt(dmg, pit) {
        const h = sc.sim.hero, r = snd('hero.hurt', h), F = sc.fx?.feel;
        if (F) { F.hitStop(r?.stop ?? 0.07); F.addTrauma(r?.shake ?? 0.4); F.vignette(1, 0, 0.12, 0.5, 2.5); } else sc.game.vignette?.('#ff0020', 0.5, 2.5);
        if (!pit) sc._fxp('enemy.hurt', h.x, h.y + 55, h.z, -(h.dirX ?? 1), -(h.dirZ ?? 0), 1.4, true);
        sc.feelN++;
      },
      sfx(name) {
        const h = sc.sim.hero, dx = h.dirX ?? h.facing ?? 1, dz = h.dirZ ?? 0;
        if (name === 'dash') sc._fxp('move.dash', h.x, h.y, h.z, dx, dz, 1, false);
        else if (name === 'jump') sc._fxp('move.jump', h.x, h.y, h.z, dx, dz, 1, false);
        else if (name === 'land') { const hard = sc._fallV < -900; sc._fxp('move.land', h.x, h.y, h.z, dx, dz, hard ? 1.4 : 0.8, hard); if (hard) { snd('move.land_heavy', h); sc.fx?.feel.addTrauma(0.08); } }
        else if (name === 'swing') { try { feel.swing('blunt', 'M', sc._actE ?? null); } catch { /* no audio */ } sc._actE = null; }
        else if (name === 'cast') { snd('enemy.mage.chant', sc._actE ?? null); sc._actE = null; }
        else if (name === 'parry') { sc._strike('whip', 'armor', 'H', FLAG.parry, h.x + dx * 46, h.y + 58, h.z + dz * 46, dx, dz); sc.hud.callout?.(h.x + dx * 30, h.y + 118, h.z + dz * 30, '튕겨냄', 'parry'); }
        else if (name === 'guard') { sc._strike('whip', 'armor', 'M', FLAG.guard, h.x + dx * 40, h.y + 58, h.z + dz * 40, dx, dz); sc.hud.callout?.(h.x + dx * 30, h.y + 118, h.z + dz * 30, '막음', 'guard'); }
        else if (name === 'die') { snd('hero.hurt', h); sc.emit('hero.dead', {}); }
        else { const mv = h.move; try { feel.swing(mv?.weapon ?? 'whip', mv?.strength ?? mv?.str ?? (h.combo >= 2 ? 'H' : 'M'), h); } catch { /* no audio */ } }   // the picture is the lash itself (_sync)
      },
      spark(x, y, z, kind) {
        if (kind === 'shot') { const el = elementOf(sc.pos, null); if (sc.fx) { const gy = groundAt(sc.W, x, z, y + 20); shotImpact(sc.fx, el, x, y, z, Number.isFinite(gy) ? gy : y - 50); } sc.pos.x = x; sc.pos.y = y; sc.pos.z = z; try { feel.magic(el.sound, 'impact', sc.pos); } catch { /* no audio */ } }
        else if (kind === 'hit' || kind === 'wisp') sc._fxp('enemy.hurt', x, y, z, 1, 0, kind === 'wisp' ? 0.6 : 1, true);
        else if (kind === 'slam') { sc._fxp('move.land', x, y, z, 1, 0, 1.5, true); sc.fx?.feel.addTrauma(0.12); }
      },
      number(x, y, z, str, color) { number(x, y, z, str, color, false); },
      pull(e) { sc.whipPullE = e; },   // the charged whip caught something: the lash wraps it while it is pulled (WHIP.md 5)
      shake(px) { sc.fx?.feel.addTrauma(clamp(px / 40, 0, 0.6)); },
      done() { sc.doneT = 0; try { feel.bell('dawn'); } catch { /* no audio */ } sc.emit('area.clear', { area: sc.area?.id }); sc._autoOpen(); },
      // newer rule sets (docs/v2/PLAY_API.md 5) — optional calls
      step(side, speed, who) { if (who !== sc.sim.hero) return; sc._simSteps = true; sc.bridge.speed = speed; sc._fxp('move.step', who.x, who.y, who.z, 1, 0, 1, false); },
      enemySwing(e) { sc._actE = e; },
      cast(e, phase) { if (phase === 'charge') { try { feel.magic(elementOf(sc.pos, KINDS[e.kind]?.element).sound, 'charge', e); } catch { /* no audio */ } } },
      // a full effect preset by name (magic, shield, pickup ...): the preset brings its own sound events and screen feel
      fx(name, x, y, z, dx = 1, dz = 0, pow = 1, tx = x + dx * 320, ty = y, tz = z + dz * 320) { const id = PRESET_IDS[name]; if (sc.fx && id !== undefined) sc.fx.playAt(id, x, y, z, dx, dz, pow, tx, ty, tz); },
      event(name, a, b, c, d) {
        if (name === 'bell') sc.emit('bell.echo', { r: c });                       // short ring (echo)
        else if (name === 'ringLong') sc._ringLong(b ?? null);                     // long ring: b = the kneeling boss to be sent off, or null = the scene decides (crossing)
        else if (name === 'deny') sc._deny(b, c);                                  // a tool could not be used: say why
        else if (!sc.story && (name === 'kneel' || name === 'bossFlee' || name === 'bossReturn' || name === 'bossDown')) sc._bossNote(name, a, b);
        if (sc.story) sc.emit('play.' + name, [a, b, c, d]);
      },
      sound(name, pos) { snd(name, pos ?? null); },
    };
  }
  // ───────────────────────── tick ─────────────────────────
  update(dt) {
    const t0 = performance.now(), g = this.game;
    if (this._offT > 0) this._offT -= dt;
    if (this.fadeA !== this.fadeTo) this.fadeA = this.fadeTo > this.fadeA ? Math.min(this.fadeTo, this.fadeA + dt / 0.28) : Math.max(this.fadeTo, this.fadeA - dt / 0.5);   // area travel: to black, load, back
    if (this._go && this.fadeA >= 1) { const go = this._go; this._go = null; this.gotoArea(go.to, go.spawn, go.keep ? { keepPosition: true, same: !!go.same } : null).then(() => { this.locked = false; this.fadeTo = 0; this._exitBusy = false; if (go.night) this.hud.banner?.('night'); }); return; }
    if (input.pressed('menu') && g.registry.title && !this.hud.modal) { if (this.ready) this._pause(); else this._leave(); if (!this.hud.modal) return; }   // ESC / START: the pause menu (leaving is one of its rows)
    if (!this.ready || !this.glr || this.glr.lost) return;
    const sim = this.sim, inp = this.inp, fx = this.fx;
    let mx = input.analogX || input.axisX, mz = -(input.analogY || input.axisY);
    { const T = input.touchStick ?? input._touchVec; if (input.mode === 'touch' && T && T.mag > 0.1) { mx = T.x; mz = -T.y; } }   // touch stick: raw 360 degrees
    const modal = this.hud.modal ?? null, locked = this.locked || modal === 'dialog';   // UI_API 2: 'pause' freezes the rules, 'dialog' locks the hero
    if (modal === 'pause') { this._state(); try { this.hud.update(dt, this.state); } catch (e) { this._hudFail(e); } this.updMs += performance.now() - t0; return; }
    if (locked) { mx = 0; mz = 0; }
    inp.mx = mx; inp.mz = mz; inp.jump = !locked && input.buffered('jump', 0.12); inp.jumpHeld = input.down('jump'); inp.jumpUsed = false;
    inp.attackHeld = input.down('attack'); inp.guard = !locked && (input.down('guard') || input.down('dash'));
    if (!locked) { if (input.pressed('attack')) inp.attack = true; if (input.pressed('dash')) inp.dash = true; if (input.pressed('lock')) inp.lockNext = true; }   // latched until a rule step consumes them (hit-stop)
    // skill (skill1) and bell (ult): handed to the rules that read them; while the rules cannot use them the pad shows them as not usable and a press says so
    inp.skillHeld = !locked && input.down('skill1'); inp.bellHeld = !locked && input.down('ult');
    if (!locked) {
      if (input.pressed('skill1')) { if (this._caps.skill) inp.skill = true; else this._padOff('skill'); }
      if (this._ringTap) { this._ringTap = false; inp.skill = true; }
      if (input.pressed('ult')) { if (this._caps.bell) inp.bell = true; else this._padOff('bell'); }
      if (this.people.target && (this._use || input.pressed('confirm'))) { inp.attack = false; this._useTarget(); }   // the prompt: a tap on it, or the confirm key
    }
    this._use = false;
    if (sim.done) {
      this.doneT += dt;
      if (this.area.test && this.doneT > 1.2 && (inp.attack || input.pressed('confirm') || input.pointer.tapped)) { sim.reset(); this.cam.snap = true; fx?.clear(); this._makeFxHandles(); for (const n of this.numbers) n.on = false; inp.attack = false; g.flash?.('#000', 0.6, 3); this.emit('hero.respawn', {}); return; }
    }
    this._savePrev();
    const pdt = fx ? fx.update(dt) : dt;
    if (fx) { const F = fx.feel, ts = F.stop <= 0 && F.slowT > 0 ? F.slowScale : 1; if (ts !== this._ts) { this._ts = ts; try { feel.setTimeScale(ts); } catch { /* no audio */ } } }
    if (pdt > 0) {
      this._fallV = sim.hero.vy ?? 0;
      sim.update(pdt, inp);
      if (inp.jumpUsed) input.consume('jump');
      inp.attack = false; inp.dash = false; inp.lockNext = false; inp.skill = false; inp.bell = false;
      if (sim.stop > 0) sim.stop = 0;   // hit-stop is owned by the feel table (ENGINE_API 1)
    }
    this._sync(pdt, dt);
    this._camera(dt);
    for (let i = 0; i < this.numbers.length; i++) { const n = this.numbers[i]; if (n.on && (n.t += dt) >= 0.8) n.on = false; }
    this._state(); try { this.hud.update(dt, this.state); } catch (e) { this._hudFail(e); }
    const c = this.cam;
    try { feel.setListener(c.px, c.py, c.pz, c.fx, c.fy, c.fz, c.dist, (g.viewW / 2) / this.focal); feel.update(); } catch { /* no audio */ }
    this.updMs += performance.now() - t0;
  }
  _makeFxHandles() { this._dashRb = -1; this.shotN = 0; this._whipReset = true; }
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
    if ((sim.deaths ?? 0) !== this._deaths) { this._deaths = sim.deaths ?? 0; this.cam.snap = true; this.game.flash?.('#000', 0.7, 2.5); ha.dx = 1; ha.dz = 0; fx?.clear(); this._makeFxHandles(); this.emit('hero.respawn', {}); }   // (_makeFxHandles also asks the whip to start over)
    if (h._px === undefined) { h._px = h.x; h._py = h.y; h._pz = h.z; this.visY = this.visYP = h.y; }
    // section -> room reverb + story
    // real areas: the rules freeze their section at 'done' once the arena is cleared — the scene keeps reading the section under the hero's feet
    const secNow = this.area.test ? sim.section : (sectionAt(W, h.x, h.z)?.id ?? this._secId);
    if (secNow !== this._secId) { const from = this._secId; this._secId = secNow; if (secNow !== 'done') { try { feel.setRoom(roomOf(this.area, secNow)); } catch { /* no audio */ } this.emit('section.enter', { id: secNow, from }); } }
    const TR = this.area.triggers;
    for (let i = 0; i < TR.length; i++) {
      const t = TR[i], inside = h.x >= t.x0 && h.x < t.x1 && h.z >= t.z0 && h.z < t.z1;
      if (!inside) { if (t.once === false) this.fired.delete(t.id); continue; }
      if (this.fired.has(t.id)) continue;
      this.fired.add(t.id);
      if (t.wake) this.wakeGroup(t.wake);
      this.emit('trigger', { id: t.id, event: t.event ?? null, data: t.data ?? null, trigger: t });
    }
    const EX = this.area.exits;
    for (let i = 0; i < EX.length; i++) {
      const x = EX[i];
      if (x.locked) {   // a wall stands in the box (area.js): the hero pushing against it is told why, once per approach
        const m = x._near ? 96 : 36, near = h.x >= x.x0 - m && h.x < x.x1 + m && h.z >= x.z0 - m && h.z < x.z1 + m;
        if (near && !x._near && !h.dead) this._lockedMsg(x);
        x._near = near;
        continue;
      }
      const inside = h.x >= x.x0 && h.x < x.x1 && h.z >= x.z0 && h.z < x.z1;
      if (!inside) { if (this._exitIn === x) this._exitIn = null; continue; }
      if (this._exitIn === x || this._exitBusy || h.dead) continue;
      this._exitIn = x;
      this._travel(x);
    }
    // hero: animation, the whip, dash trail, steps
    if (pdt > 0) { const a0 = Math.atan2(ha.dz, ha.dx); driveHero(ha, h, pdt, TUNE); this._turn(ha, h, a0, pdt); }
    this.visY = h.onGround && Math.abs(this.visY - h.y) < 40 && dt > 0 ? this.visY + (h.y - this.visY) * (1 - Math.exp(-dt * 28)) : h.y;   // stairs: do not pop
    if (pdt > 0) { this._tintAt(W, h.x, h.y + 50, h.z, 0, 1.6, ha.opt.tint); ha.opt.flash = Math.max(h.flash > 0 ? h.flash * 0.6 : 0, h.ifr > 0 && !h.dead && !(h.hurtT > 0) && !(h.dashT > 0) && Math.floor(h.t * 22) % 2 === 0 ? 0.3 : 0); }
    // the whip: hand from the posed skeleton, rule state -> mode, one step with the play dt (0 in hit-stop: the lash freezes with the world)
    if (this.whip && ha.weaponMatrix(ha.place(h.x, this.visY, h.z))) {
      const wp = this.whip, H = this.whipHand, P = this.whipPull, pe = this.whipPullE; let pull = null;
      wp.handFromMatrix(ha.WM, H);
      H.bx = h.x; H.by = this.visY; H.bz = h.z; H.fx = h.dirX ?? ha.dx; H.fz = h.dirZ ?? ha.dz;
      if (h.onGround) H.ground = h.y; else { const gy = groundAt(W, h.x, h.z, h.y + 30); H.ground = Number.isFinite(gy) ? gy : h.y; }
      if (pe) { if (pe.pullT > 0 || h.pullT > 0) { P.x = pe.x; P.y = (pe.gy ?? pe.y) + (pe.h ?? 80) * 0.55; P.z = pe.z; P.r = Math.max(8, (pe.r ?? 15) * 0.55); pull = P; } else this.whipPullE = null; }
      wp.resonance = h.resoMax ? h.reso / h.resoMax : 0;
      if (this._whipReset) { this._whipReset = false; this.whipPullE = null; pull = null; wp.reset(H); }   // new area / respawn / new chain: hang from the hand, no speed
      driveWhip(wp, h, TUNE, pull);
      wp.update(pdt, H);
    }
    if (fx) {
      if (h.dashT > 0 && !h.dead) { if (this._dashRb < 0) this._dashRb = fx.ribbons.start(DASH_TRAIL); if (pdt > 0) fx.ribbons.push(this._dashRb, h.x, h.y + 50, h.z, 0, 0, 0); }
      else if (this._dashRb >= 0) { fx.ribbons.end(this._dashRb); this._dashRb = -1; }
      fx.setProtect(0, h.x, h.y + 55, h.z, 46);
    }
    if (pdt > 0 && h.onGround && !h.dead && !h.move && !(h.dashT > 0) && !(h.hurtT > 0)) {
      const sp = hyp(h.vx ?? 0, h.vz ?? 0);
      if (sp > 60 && !this._simSteps) { this.stride += sp * pdt; if (this.stride > 96) { this.stride = 0; this.bridge.speed = sp; this._fxp('move.step', h.x, h.y, h.z, ha.dx, ha.dz, 1, false); } } else this.stride = 60;
    }
    h._gy = groundAt(W, h.x, h.z, h.y + 20);
    if (pdt > 0) this._heroHid = this.perf.tier !== 'low' && this._hidden(h);
    // enemies
    const E = sim.enemies, L = this.actors;
    if (E !== this._ERef) {
      for (let i = L.length - 1; i >= 0; i--) { this._free(L[i]); } L.length = 0; this._ERef = E;
      const SP = W.spawns;   // home section + group of every enemy (built-in "<name>_clear" flags, event group.clear)
      for (let i = 0; i < E.length; i++) { const e = E[i], sp = E.length === SP.length ? SP[i] : null, sec = sectionAt(W, sp ? sp.x : e.x, sp ? sp.z : e.z); e._sec = sec ? sec.id : ''; if (e.group === undefined && sp) e.group = sp.group ?? null; }
    }
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (!e._a3 && !e.dead && e.state !== 'dead') this._take(e); }
    const fdt = fx ? dt * fx.feel.fxScale : dt, cam = this.cam, tickN = pdt > 0 ? ++this.tickN : this.tickN;
    for (let i = L.length - 1; i >= 0; i--) {
      const a = L[i], e = a.e;
      a.hitAge += fdt;
      if (fx && (e.tele > 0 || a.warnAtk)) this._warn(a, e, fx);
      if (a.dieAge < 0 && (e.state === 'dead' || e.dead)) { this._dying(a, e); if (e.dead) a.dieAge = a.dieHold + DIE_T; }
      if (a.dieAge >= 0) {
        const before = a.dieAge; a.dieAge += fdt;
        if (before <= a.dieHold && a.dieAge > a.dieHold && a.vis) this._fxp('enemy.death.ash', e.x, e.y, e.z, a.dx, a.dz, 1, true);   // the body starts to fall to ash
        if (a.dieAge >= a.dieHold + DIE_T) { this._free(a); L[i] = L[L.length - 1]; L.length--; continue; }
      }
      if (pdt <= 0 || (!a.vis && a.dieAge < 0)) { a.accDt = 0; continue; }   // off-screen: no animation work
      // animation rate by distance from where the camera looks: near = every tick, far = every 2nd, very far = every 4th tick
      // (a small distant figure does not need a 60 Hz pose; anything that was just hit, attacks or dies stays at full rate)
      a.accDt += pdt;
      if (a.dieAge < 0 && a.hitAge > 0.4 && e.state !== 'attack' && e.state !== 'cast') {
        const ddx = e.x - cam.tx, ddz = e.z - cam.tz, d2 = ddx * ddx + ddz * ddz, every = d2 > ANIM_FAR2 ? 4 : d2 > ANIM_MID2 ? 2 : 1;
        if (every > 1 && ((tickN + i) % every) !== 0) continue;
      }
      const adt = a.accDt; a.accDt = 0;
      if (e.dead) a.anim.update(adt);
      else {
        const ox = a.dx, oz = a.dz;
        driveActor(a, e, adt);
        if (e.dirX === undefined) {   // rules without a 360 degree facing: look at the hero while awake (characters face where they act)
          let tx = e.facing ?? ox, tz = 0;
          if (e.active && e.state !== 'dead' && !h.dead) { const d = hyp(h.x - e.x, h.z - e.z); if (d > 8) { tx = (h.x - e.x) / d; tz = (h.z - e.z) / d; } }
          const cur = Math.atan2(oz, ox), ang = cur + wrapPi(Math.atan2(tz, tx) - cur) * (1 - Math.exp(-adt * 10)); a.dx = Math.cos(ang); a.dz = Math.sin(ang);
        }
      }
      this._tintAt(W, e.x, e.y + 50, e.z, 0, 1.6, a.opt.tint);
      e._gy = e.gy !== undefined ? e.gy : groundAt(W, e.x, e.z, e.y - (e.hover ?? 0) + 20);   // ground under it, once per pose (shadow and warnings read it every drawn frame)
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
    // people and usable spots: who is here, who looks at the hero, the one prompt on offer (none while a fight is near)
    const modal = this.hud.modal ?? null;
    this.state.prompts = this.people.tick(this, pdt > 0 ? pdt : 0, h, E, this._flagFn, this.hidden, this.locked || !!modal || h.dead || !!this._go);
    if (this.people.talking) { if (modal === 'dialog' || this.ui.dialog) this._talkT = 0; else if ((this._talkT += dt) > 0.5) this.people.talking = null; }
    // fires, embers, smoke, mist of the area (effects engine), culled off screen
    if (fx) this.anchors.tick(this, fx, fdt, this.vp, cam.tx, cam.tz);
  }
  /**
   * Hero turning (ENGINE_API 2): the drive function decides where to look; the scene only shapes the way there.
   *  - turn rate limit: TURN_RUN rad/s while moving freely, TURN_ACT while a move / roll / hurt is on (the body must face where it acts)
   *  - a turn of more than ~115 degrees commits to its direction (kept 0.2 s after the goal last was that far), so a stick
   *    that flips or jitters around the opposite direction cannot make the body wobble back and forth
   * a0 = facing angle before the drive ran this tick.
   */
  _turn(ha, h, a0, dt) {
    const a1 = Math.atan2(ha.dz, ha.dx); let d = wrapPi(a1 - a0);
    const act = !!h.move || h.dashT > 0 || h.hurtT > 0 || h.dead, max = (act ? TURN_ACT : TURN_RUN) * dt;
    // where the rules look (the real goal of this turn); without it, the drive's own step tells the direction
    const gx = h.dirX ?? ha.dx, gz = h.dirZ ?? ha.dz, rem = wrapPi(Math.atan2(gz, gx) - a0), big = Math.abs(rem) > 2.0;
    if (big) { this._turnHold = 0.2; if (this._turnDir === 0 && Math.abs(d) > 1e-4) this._turnDir = d > 0 ? 1 : -1; }
    else if (this._turnDir !== 0 && (this._turnHold -= dt) <= 0) this._turnDir = 0;
    if (big && this._turnDir !== 0 && d * this._turnDir < 0) d = this._turnDir * max;   // the goal is still nearly behind: keep going the committed way
    if (d > max) d = max; else if (d < -max) d = -max;
    const a = a0 + d; ha.dx = Math.cos(a); ha.dz = Math.sin(a);
  }
  _state() {
    const s = this.state, g = this.game, sim = this.sim, W = this.W;
    s.viewW = g.viewW; s.viewH = g.viewH; s.safe = g.safe ?? s.safe; s.scale = g.scale; s.time = sim.time ?? 0; s.hero = sim.hero; s.heroHpMax = sim.hero.hpMax ?? TUNE.heroHp ?? 100;
    s.enemies = sim.enemies; s.done = !!sim.done && this.area.test; s.cleared = !!sim.done; s.doneT = this.doneT; s.dialog = this.ui.dialog; s.message = ''; s.message2 = '';
    const cur = this.area.test ? sim.section : this._secId, id = cur === 'done' ? s.section.id || 'yard' : cur;
    if (id !== s.section.id) { s.section.id = id; let lab = ''; for (let i = 0; i < W.sections.length; i++) if (W.sections[i].id === id) lab = W.sections[i].label ?? ''; s.section.label = lab; }
    let left = 0, yard = 0, awake = 0; const E = sim.enemies;
    for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.dead || e.state === 'dead') continue; left++; if (e.yard) yard++; if (e.active && !e.buried) awake++; }
    s.enemiesLeft = left; s.yardLeft = yard;
    // what the cut-glass HUD shows (docs/v2/UI_API.md 1): candles from health, enemies of the fight at hand, which pad buttons work
    { const hp = sim.hero.hp > 0 ? sim.hero.hp : 0, c = s.candles; c.lit = hp / (s.heroHpMax || 1) * c.max; }
    s.left = this.area.test ? 0 : awake;
    { const bs = sim.bossState ? sim.bossState() : null, B = this._bossS;   // the boss bar: name, health, stagger and act straight from the rules (PLAY_API 7)
      if (bs) { B.id = bs.id; B.name = bs.name; B.hp = bs.hp; B.hpMax = bs.hpMax; B.stagger = bs.stagger; B.phase = bs.phase; B.kneel = bs.kneel; B.fled = bs.fled; B.staggered = bs.staggered;
        B.sub = bs.kneel ? '종을 길게 울려라' : bs.fled ? '그 밤으로 달아났다' : bs.staggered ? '비틀거린다' : bs.sub || (bs.phase === 2 ? '둘째 막' : ''); s.boss = B; }
      else s.boss = null; }
    { const hh = sim.hero, pd = s.pad, sk = pd.skill, bl = pd.bell;
      sk.disabled = !this._caps.skill; bl.disabled = !this._caps.bell;
      sk.mode = hh.skillMode === 'call' ? 'call' : 'hook'; sk.cd = hh.callCdMax > 0 ? clamp(hh.callCd / hh.callCdMax, 0, 1) : 0;
      bl.charge = hh.bellCharge > 0 ? hh.bellCharge : 0; bl.mode = hh.bellCharge > 0 || hh.knellId != null ? 'long' : 'short'; bl.cd = hh.bellCdMax > 0 ? clamp(hh.bellCd / hh.bellCdMax, 0, 1) : 0;
      if (hh.reso !== undefined) { s.resonance.value = hh.reso; s.resonance.cells = clamp(hh.resoMax ?? 3, 3, 5); }
      if (pd.attack && hh.charge !== undefined) pd.attack.charge = hh.charge > 0 ? hh.charge : 0;                       // PLAY-2: the held attack charges the whip
      if (pd.roll && hh.rollCd !== undefined && TUNE.rollCd > 0) pd.roll.cd = hh.rollCd > 0 ? clamp(hh.rollCd / TUNE.rollCd, 0, 1) : 0; }
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
    const fx = lx - c.px, fy = ly - c.py, fz = lz - c.pz, fl = hyp(fx, fy, fz) || 1;
    c.fx = fx / fl; c.fy = fy / fl; c.fz = fz / fl;
    if (snap) { const q = this.camP; q.px = c.px; q.py = c.py; q.pz = c.pz; q.fx = c.fx; q.fy = c.fy; q.fz = c.fz; }
    c.snap = false;
  }
  /** view-projection for a moment `a` (0..1) between the last two ticks */
  _matrix(Wv, Hv, a) {
    const c = this.cam, q = this.camP, m = this.vp, e0 = this.eye0, e = this.eye, R = this.camR, U = this.camU, Fw = this.camF;
    let fx = q.fx + (c.fx - q.fx) * a, fy = q.fy + (c.fy - q.fy) * a, fz = q.fz + (c.fz - q.fz) * a; const fl = hyp(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const rl = hyp(fz, fx) || 1, rx = fz / rl, rz = -fx / rl;          // r = up x f
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
      try { this.hud.draw(ctx, s); } catch (e) { this._hudFail(e); } s.message = '';
      this._lastDraw = 0;
      return;
    }
    if (this.mode === 'layer') this._show(g.top === this);
    const glr = this.glr;
    if (this._restored !== glr.restored) { this._restored = glr.restored; this.cr.restore(); try { this.fx?.dispose(); } catch { /* dead objects */ } this._makeFx(); try { this.wr?.restore(); } catch { /* still lost */ } this._warm(); }   // context came back
    if (this._lastDraw > 0 && !this.hud.modal && this.res.frame(t0 - this._lastDraw)) L.force = true;   // render size governor (res.js): measured on real frame intervals
    this._lastDraw = t0;
    this._place();
    const a = this.everyFrame ? clamp(g.alpha ?? 1, 0, 1) : 1;
    this._gl(Wv, Hv, a, false);
    if (hctx !== ctx) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, L.hud.width, L.hud.height); hctx.setTransform(g.scale, 0, 0, g.scale, 0, 0); }
    try { this.hud.draw(hctx, s); } catch (e) { this._hudFail(e); }
    if (this.fadeA > 0.004) { hctx.globalAlpha = this.fadeA; hctx.fillStyle = '#000'; hctx.fillRect(0, 0, Wv, Hv); hctx.globalAlpha = 1; }
    const ms = performance.now() - t0 + this.updMs; this.updMs = 0;
    this.samples[this.sampleN % 300] = ms; this.sampleN++;
  }
  /** one WebGL frame. a = interpolation between the last two ticks. warm = also draw every loaded model once */
  _gl(Wv, Hv, a, warm) {
    const g = this.game, glr = this.glr, gl = glr.gl, W = this.W, fx = this.fx, cr = this.cr, sim = this.sim, b = this.batch;
    const CR = g.canvasRect, rs = this.res.size(CR ? CR.w : g.canvas.width, CR ? CR.h : g.canvas.height, globalThis.devicePixelRatio || 1), w = rs.w, hgt = rs.h;   // the 3D picture has its own pixel size (device pixel ratio with a cap per tier)
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
    if (this.wr && this.whip) {   // the whip: one draw (+ one additive for the shard glow and the tip streak), lit like the hero
      const wr = this.wr, o = this.heroA.opt, h = sim.hero, V = this._whipVp;
      wr.tint[0] = o.tint[0]; wr.tint[1] = o.tint[1]; wr.tint[2] = o.tint[2]; wr.flash = o.flash; wr.alpha = o.alpha ?? 1;
      this.env.lightPos = fx ? fx.lights.pos : null; this.env.lightCol = fx ? fx.lights.col : null; V[0] = w; V[1] = hgt; this.env.viewport = V;
      wr.draw(this.whip, this.env, Math.abs(h.x - h._px) > 250 || Math.abs(h.z - h._pz) > 250 ? 1 : a);
    }
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
  /** is most of the hero (two of feet, chest, head) hidden from the camera by a wall or prop box of the world? Once per tick.
   *  The boxes are a flat number array made at load (this._occ: x0 x1 y0 y1 z0 z1 per box) — plain arithmetic, nothing allocated. */
  _hidden(h) {
    const O = this._occ, n = this._occN, c = this.cam, ex = c.px, ey = c.py, ez = c.pz, top = h.y + 30; let hid = 0;
    for (let k = 0; k < 3; k++) {
      const dx = h.x - ex, dy = h.y + (k === 0 ? 14 : k === 1 ? 56 : 98) - ey, dz = h.z - ez;
      const ix = dx > 1e-6 || dx < -1e-6 ? 1 / dx : 0, iy = dy > 1e-6 || dy < -1e-6 ? 1 / dy : 0, iz = dz > 1e-6 || dz < -1e-6 ? 1 / dz : 0;
      for (let i = 0; i < n; i += 6) {
        if (O[i + 3] < top) continue;   // lower than the hero's knees: hides nothing
        let t0 = 0.02, t1 = 0.985, a = 0, q = 0;   // the segment camera -> point, a little short of both ends
        if (ix !== 0) { a = (O[i] - ex) * ix; q = (O[i + 1] - ex) * ix; if (a > q) { const w = a; a = q; q = w; } if (a > t0) t0 = a; if (q < t1) t1 = q; if (t0 > t1) continue; } else if (ex < O[i] || ex > O[i + 1]) continue;
        if (iy !== 0) { a = (O[i + 2] - ey) * iy; q = (O[i + 3] - ey) * iy; if (a > q) { const w = a; a = q; q = w; } if (a > t0) t0 = a; if (q < t1) t1 = q; if (t0 > t1) continue; } else if (ey < O[i + 2] || ey > O[i + 3]) continue;
        if (iz !== 0) { a = (O[i + 4] - ez) * iz; q = (O[i + 5] - ez) * iz; if (a > q) { const w = a; a = q; q = w; } if (a > t0) t0 = a; if (q < t1) t1 = q; if (t0 > t1) continue; } else if (ez < O[i + 4] || ez > O[i + 5]) continue;
        hid++; break;
      }
    }
    return hid >= 2;
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
      const HM = ha.place(h._px + (h.x - h._px) * k, snap ? h.y : y, h._pz + (h.z - h._pz) * k);
      if (this._heroHid) {   // the hero behind a wall, a gate post or a tall grave: the hidden part shows through as a faint cool silhouette (only on such frames: _hidden())
        const gl = this.glr.gl, o = ha.opt, t0 = o.tint[0], t1 = o.tint[1], t2 = o.tint[2], fl = o.flash;   // (reversed depth test against the world only: drawn before the hero's own body)
        gl.depthFunc(gl.GREATER); o.solid = 1; o.alpha = 0.34; o.flash = 0; o.tint[0] = 0.36; o.tint[1] = 0.56; o.tint[2] = 1; o.rim = RIM_NONE;
        cr.draw(ha.gpu, ha.rig.jm, HM, o);
        gl.depthFunc(gl.LEQUAL); o.solid = 0; o.alpha = 1; o.flash = fl; o.tint[0] = t0; o.tint[1] = t1; o.tint[2] = t2;
      }
      ha.opt.rim = RIM_HERO; ha.draw(cr, HM); drawn++; }
    // opaque bodies first, then the townspeople, then what is see-through (ghosts do not write depth: they must come last)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < L.length; i++) {
        const ac = L[i], e = ac.e, thin = e.alpha !== undefined && e.alpha < 0.995 && ac.dieAge < 0;
        if (thin !== (pass === 1)) continue;
        const k = e._px === undefined || Math.abs(e.x - e._px) > 250 ? 1 : a;
        const x = e._px === undefined ? e.x : e._px + (e.x - e._px) * k, y = e._py === undefined ? e.y : e._py + (e.y - e._py) * k, z = e._pz === undefined ? e.z : e._pz + (e.z - e._pz) * k;
        ac.vis = this._seen(m, x, y, z, ac.height);
        if (!ac.vis) { culled++; continue; }
        const o = ac.opt; o.flash = hurtFlash(ac.hitAge) * 0.85; o.dis = ac.dieAge > ac.dieHold ? dissolveK(ac.dieAge - ac.dieHold, DIE_T) : 0; o.seed = ac.seed;
        o.alpha = thin ? clamp(e.alpha, 0.12, 1) : 1;   // ghosts fade in and out by the rules
        o.rim = e.state === 'attack' || e.state === 'cast' || e.tele > 0 ? RIM_WARN : RIM_ENEMY;
        ac.draw(cr, ac.place(x, y + (KINDS[ac.kind]?.float ?? 0), z)); drawn++;
      }
      if (pass === 0) { this.people.draw(this, cr, m, RIM_PEOPLE); drawn += this.people.drawn; culled += this.people.culled; }
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
  _shadow(b, x, z, y, rx, al, gy = groundAt(this.W, x, z, y + 20)) {
    if (!Number.isFinite(gy)) return;
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
      const l = d._c, al = d.a ?? DECAL_ALPHA[d.k] ?? 0.7;
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
    { const gy = h._gy ?? groundAt(W, hx, hz, h.y + 20), r = 150; if (Number.isFinite(gy)) b.quad(this._flat(hx, gy + 0.5, hz, r, r * 0.7), g.u0, g.v0, g.u1, g.v1, 0.55, 0.62, 0.9, 0.16, 0, 0, 4, 1); }   // faint light under the hero: reads position and depth on dark ground
    this._shadow(b, hx, hz, h.y, 30, 0.95, h._gy);
    const L = this.actors;
    for (let i = 0; i < L.length; i++) {
      const ac = L[i], e = ac.e; if (!ac.vis) continue;
      const ex = e._px === undefined ? e.x : e._px + (e.x - e._px) * a, ez = e._pz === undefined ? e.z : e._pz + (e.z - e._pz) * a;
      this._shadow(b, ex, ez, e.y - (e.hover ?? 0), 26, 0.9 * (ac.dieAge > ac.dieHold ? clamp(1 - (ac.dieAge - ac.dieHold) / DIE_T, 0, 1) : 1) * (e.alpha ?? 1), e._gy);
      // where the attack will land. Newer rules give e.tele (0..1) and the attack's reach; the prototype rules give a wind-up time
      let k = 0, reach = 46, rad = 0, wide = 30;
      const A = e.atk;
      if (e.tele !== undefined) { if (e.tele > 0 && e.state !== 'dead' && A && !A.shot && !(this.fx && (A.arc || A.mark))) { k = clamp(e.tele, 0.02, 1); if (A.box) { reach = (A.box.f0 + A.box.f1) * 0.5; rad = Math.max((A.box.f1 - A.box.f0) * 0.5, A.box.side); } else if (A.radius) { reach = A.radius.fwd; rad = A.radius.r; } } }
      else { const T = TUNE[e.kind]; if (e.state === 'attack' && T && T.windup && e.stateT < T.windup + 0.08) { k = clamp(e.stateT / T.windup, 0.02, 1); wide = T.reachZ ?? 30; } }
      if (k > 0) {
        const cx = ex + ac.dx * reach, cz = ez + ac.dz * reach, rr = rad > 0 ? rad * (0.7 + 0.5 * k) : 34 + 26 * k;
        const brk = A && A.guard === 'break';   // cannot be guarded: violet instead of red
        b.quad(this._flat(cx, (e._gy ?? e.y - (e.hover ?? 0)) + 0.6, cz, rr, rad > 0 ? rr * 0.9 : Math.max(rr * 0.6, wide * 0.9)), g.u0, g.v0, g.u1, g.v1, brk ? 1.25 : 1.5, brk ? 0.2 : 0.25, brk ? 1.35 : 0.12, 0.2 + 0.5 * k, 0, 0, 5, 1);
      }
    }
    const PP = this.people.list;
    for (let i = 0; i < PP.length; i++) { const p = PP[i]; if (p.on && p.vis) this._shadow(b, p.x, p.z, p.y, 26, 0.9, p.y); }
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
      res: this.res.info(), area: this.area?.id ?? '', people: { n: this.people.list.length, drawn: this.people.drawn ?? 0, spots: this.people.spots.length }, anchors: { n: this.anchors.list.length, live: this.anchors.live, lit: this.anchors.lit },
      mode: this.mode, hud: this.hudKind, resK: this.perf.resK, everyFrame: this.everyFrame, perfSaved: this.perf.saved, loadMs: this.loadMs ?? 0,
      canvases: (this._canvases?.length ?? 0) + (G ? 1 : 0) + (this.layer.hud ? 1 : 0), assets: this.assetList(),
    };
  }
  /** every assets/v2 file this scene has loaded (for tools/deploy/v2_ship.txt) */
  assetList() { const out = [...(this.urls ?? [])]; for (const u of this.cast?.urls ?? []) out.push(String(u).replace(/^.*?assets\//, 'assets/')); return [...new Set(out)].sort(); }
  _debugLine() {
    const st = this.stats(), g = this.game;
    return `v2g · ${st.gl.api} · ${st.mode} · ${st.res.w}x${st.res.h}${st.res.level ? '(-' + st.res.level + ')' : ''} · ${g.fps | 0}fps · ${st.frameMs.p50.toFixed(1)}/${st.frameMs.p95.toFixed(1)}ms · ${st.gl.draws}dc ${st.gl.tris}tri · ${st.gl.texMB}MB · ${st.chars.drawn}+${st.chars.culled}`;
  }
  _api() {
    const sc = this;
    globalThis.__v2 = {
      id: 'g', scene: sc,
      get ready() { return sc.ready; }, get error() { return sc.glError; },
      get hero() { const h = sc.sim?.hero; return h ? { x: h.x, y: h.y, z: h.z, hp: h.hp, facing: h.facing, dirX: h.dirX, dirZ: h.dirZ, onGround: h.onGround, anim: h.anim, dead: h.dead, face: [sc.heroA?.dx ?? 0, sc.heroA?.dz ?? 0], clip: sc.heroA?.anim.cur?.name ?? '' } : null; },
      get enemies() { return (sc.sim?.enemies ?? []).filter((e) => !e.dead).map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z, hp: e.hp, yard: e.yard, state: e.state, active: e.active, model: KINDS[e.kind]?.model ?? null, clip: e._a3?.anim.cur?.name ?? null, drawn: !!e._a3?.vis, group: e.group ?? null, solid: e.solid, alpha: e.alpha, tele: e.tele })); },
      get cam() { const c = sc.cam; return { x: c.px, y: c.py, z: c.pz, yaw: Math.atan2(c.fx, c.fz), pitch: -Math.asin(c.fy), dist: c.dist }; },
      get section() { return (sc.area?.test ? sc.sim?.section : sc._secId) ?? ''; }, get area() { return sc.area?.id ?? ''; },
      get people() { return sc.people.list.map((p) => ({ id: p.id, model: p.def.model, x: p.x, y: p.y, z: p.z, on: p.on, drawn: p.vis, clip: p.a3.anim.cur?.name ?? '', solid: p.solid })); },
      get prompt() { const t = sc.people.target; return t && sc.state.prompts.length ? { id: t.id, label: t.label, person: !!t.a3 } : null; },
      get exits() { return (sc.area?.exits ?? []).map((x) => ({ id: x.id, to: x.to, locked: x.locked ?? null, x0: x.x0, x1: x.x1, z0: x.z0, z1: x.z1 })); },
      use() { sc._use = true; },
      get stats() { return sc.stats(); },
      get shots() { return (sc.sim?.shots ?? []).filter((s) => !s.dead).map((s) => ({ x: s.x, y: s.y, z: s.z })); },
      teleport(sec) { const ok = sc.sim?.teleport?.(sec) ?? false; sc.cam.snap = true; return ok; },
      project(x, y, z) { return sc.project(x, y, z, {}); },
      loseContext() { const e = sc.glr?.gl.getExtension('WEBGL_lose_context'); if (!e) return false; e.loseContext(); setTimeout(() => e.restoreContext(), 300); return true; },
    };
  }
}
