// v2g cast — every character is a 3D model. One GPU model per model id (shared by all instances),
// one Rig + Animator per instance (Actor3D). Animation comes from the shared clip library
// (assets/v2/char3d/clips/, docs/v2/ANIM_LIBRARY.md); play's driveHero / driveActor pick the clips.
// Actor3D has the same public fields as char3d's Char3D (asset.clips, rig, anim, dx, dz, kbT, kbSp, place, weaponMatrix).
import { loadGLB } from '../char3d/glb.js';
import { Rig, Animator } from '../char3d/skel.js';
import { buildClips } from '../char3d/clips.js';
import { boxModel } from '../char3d/render.js';
import { UNIT } from '../char3d/hero3d.js';
import { ASSET_ROOT } from '../../core/assets.js';
import { loadAnimLib } from './animlib.js';
import { drawOpts } from './charr.js';

export const CHAR_DIR = ASSET_ROOT + 'v2/char3d/';
export const LIB_GROUPS = ['locomotion', 'combat', 'reactions', 'magic', 'enemy'];
/** hero's sword (hand-bone space, cm; +Y = towards the tip) — the pilot blade until a modelled one exists */
const BLADE = [
  { min: [-1.6, -9, -1.6], max: [1.6, 9, 1.6], color: [0.32, 0.2, 0.12] },
  { min: [-7, 9, -2.2], max: [7, 11.5, 2.2], color: [0.78, 0.66, 0.36] },
  { min: [-2.6, 11.5, -0.7], max: [2.6, 68, 0.7], color: [0.62, 0.68, 0.8] },
  { min: [-1.5, 68, -0.5], max: [1.5, 76, 0.5], color: [0.72, 0.78, 0.9] },
  { min: [-2.2, -12, -2.2], max: [2.2, -9, 2.2], color: [0.78, 0.66, 0.36] },
];
/** weapon id -> grip pose in the hand bone (docs/v2/CAST_R1_ENEMIES.md) + blade span along +Y (cm) for trails */
export const GRIPS = {
  blade: { pos: [0, 7, 3], rotX: -80, rotY: 0, rotZ: 0, base: 20, tip: 76 },
  w_rusty_sword: { pos: [0, 7, 3], rotX: -80, rotY: 0, rotZ: 0, base: 18, tip: 76 },
  w_crystal_staff: { pos: [0, 7, 3], rotX: 100, rotY: 0, rotZ: 0, base: 60, tip: 100 },
  w_grave_spade: { pos: [0, 9, 4], rotX: -80, rotY: 0, rotZ: 0, base: 90, tip: 142 },
};
/** aliases for old state names used by the placeholder driveActor (only added when no clip of that name exists) */
const ALIAS = { attack: 'atk2_fore', cast: 'cast_quick', hurt: 'hit_light', death: 'death_back', dash: 'roll', fall: 'air' };

const mul4 = (a, b, o) => {   // o = a*b (column-major 4x4, affine)
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3; o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3; o[c * 4 + 3] = b3;
  }
  return o;
};
function trs(g, o) {   // R = Ry * Rx * Rz (degrees), then translate
  const k = Math.PI / 180, cx = Math.cos((g.rotX ?? 0) * k), sx = Math.sin((g.rotX ?? 0) * k), cy = Math.cos((g.rotY ?? 0) * k), sy = Math.sin((g.rotY ?? 0) * k), cz = Math.cos((g.rotZ ?? 0) * k), sz = Math.sin((g.rotZ ?? 0) * k);
  o[0] = cy * cz + sy * sx * sz; o[1] = cx * sz; o[2] = -sy * cz + cy * sx * sz; o[3] = 0;
  o[4] = -cy * sz + sy * sx * cz; o[5] = cx * cz; o[6] = sy * sz + cy * sx * cz; o[7] = 0;
  o[8] = sy * cx; o[9] = -sx; o[10] = cy * cx; o[11] = 0;
  o[12] = g.pos[0]; o[13] = g.pos[1]; o[14] = g.pos[2]; o[15] = 1;
  return o;
}

export class Actor3D {
  constructor(asset, weapon, o = {}) {
    this.asset = asset; this.rig = new Rig(asset.model); this.anim = new Animator(this.rig, asset.clips);
    this.gpu = asset.gpu; this.weapon = weapon ? weapon.gpu : null;
    this.grip = o.grip ?? (weapon ? weapon.grip : GRIPS.blade);
    this.scale = o.scale ?? UNIT * (o.height ? o.height / Math.max(0.2, asset.height) : 1);
    this.height = asset.height * this.scale;          // world units, head top
    this.dx = 1; this.dz = 0; this.kbT = 0; this.kbSp = 0;
    this.M = new Float32Array(16); this.WM = new Float32Array(16); this._g = trs(this.grip, new Float32Array(16)); this._t = new Float32Array(16);
    this.opt = drawOpts(); this.wopt = drawOpts(); this.wopt.rim[0] = 0.7; this.wopt.rim[1] = 0.8; this.wopt.rim[2] = 1; this.wopt.rim[3] = 0.5;
    this.hitAge = 9; this.dieAge = -1; this.dieHold = 0; this.accDt = 0; this.seed = Math.random() * 7; this.vis = false; this.far = 0; this.stride = 0; this.kind = ''; this.e = null; this.wasDead = false;
    this.anim.play(asset.clips.idle ? 'idle' : Object.keys(asset.clips)[0], { fade: 0 }); this.anim.update(0);
  }
  /** world matrix for the play world (x right, y up, z into the screen); the model's +Z looks along (dx,dz) */
  place(x, y, z, dx = this.dx, dz = this.dz, s = this.scale) {
    const M = this.M;
    M[0] = -dz * s; M[1] = 0; M[2] = dx * s; M[3] = 0;
    M[4] = 0; M[5] = s; M[6] = 0; M[7] = 0;
    M[8] = dx * s; M[9] = 0; M[10] = dz * s; M[11] = 0;
    M[12] = x; M[13] = y; M[14] = z; M[15] = 1;
    return M;
  }
  /** hand bone -> weapon world matrix (after place()) */
  weaponMatrix(M = this.M) {
    const b = this.rig.boneWorld('handR'); if (!b) return null;
    mul4(b, this._g, this._t);
    return mul4(M, this._t, this.WM);
  }
  /** world position of a point `cm` along the weapon's +Y axis (after weaponMatrix()) -> out[0..2] */
  weaponPoint(cm, out) { const W = this.WM; out[0] = W[4] * cm + W[12]; out[1] = W[5] * cm + W[13]; out[2] = W[6] * cm + W[14]; return out; }
  draw(cr, M = this.M) {
    cr.draw(this.gpu, this.rig.jm, M, this.opt);
    if (this.weapon) {
      const W = this.weaponMatrix(M);
      if (W) { const a = this.opt, b = this.wopt; b.tint[0] = a.tint[0]; b.tint[1] = a.tint[1]; b.tint[2] = a.tint[2]; b.flash = a.flash; b.alpha = a.alpha; b.dis = a.dis; b.seed = a.seed; cr.draw(this.weapon, null, W, b); }
    }
  }
}

export class Cast {
  /** cr: CharRenderer of the scene */
  constructor(cr) { this.cr = cr; this.assets = new Map(); this.weapons = new Map(); this.lib = null; this.libError = null; this.urls = []; }
  /**
   * models: [{ model, hero? }], weapons: [id] ('blade' = built-in box sword). opts: { texCap, libWins(hero) }
   * Throws when a character model cannot be loaded (the scene shows the error; there is no flat fallback).
   */
  async load(models, weapons, opts = {}) {
    const texCap = opts.texCap ?? 1024;
    const libP = this.lib ? Promise.resolve(this.lib) : loadAnimLib(CHAR_DIR + 'clips/index.json', { groups: LIB_GROUPS }).then((l) => { this.urls.push(CHAR_DIR + 'clips/index.json', ...l.files); return l; }, (e) => { this.libError = String(e?.message ?? e); console.warn('[v2g] clip library failed to load; falling back to built-in clips:', this.libError); return null; });
    const need = models.filter((m) => !this.assets.has(m.model));
    const [lib, loaded] = await Promise.all([libP, Promise.all(need.map((m) => loadGLB(CHAR_DIR + m.model + '.glb')))]);
    this.lib = lib;
    need.forEach((m, i) => {
      const model = loaded[i], rig = new Rig(model); this.urls.push(CHAR_DIR + m.model + '.glb');
      const hand = buildClips(rig, model.anims), clips = {};
      if (m.hero) { for (const k of Object.keys(hand)) clips['hand_' + k] = hand[k]; if (opts.libWins) Object.assign(clips, hand, lib?.clips); else Object.assign(clips, lib?.clips, hand); }
      else if (lib) Object.assign(clips, lib.clips); else Object.assign(clips, hand);
      for (const a of Object.keys(ALIAS)) if (!clips[a] && clips[ALIAS[a]]) clips[a] = clips[ALIAS[a]];
      const gpu = this.cr.add(model, { maxTex: texCap });
      this.assets.set(m.model, { id: m.model, model, clips, gpu, height: rig.maxY - rig.minY, joints: model.stats?.joints ?? 0, tris: gpu.tris });
    });
    const wl = weapons.filter((w) => w && !this.weapons.has(w));
    const wm = await Promise.all(wl.map((w) => (w === 'blade' ? Promise.resolve(boxModel(BLADE)) : loadGLB(CHAR_DIR + w + '.glb').catch((e) => { console.warn('[v2g] weapon model failed to load:', w, String(e?.message ?? e)); return null; }))));
    wl.forEach((w, i) => {
      if (!wm[i]) return;
      if (w !== 'blade') this.urls.push(CHAR_DIR + w + '.glb');
      const gpu = this.cr.add(wm[i], { maxTex: Math.min(512, texCap), mip: w !== 'blade' });
      this.weapons.set(w, { id: w, gpu, grip: GRIPS[w] ?? GRIPS.blade, tris: gpu.tris });
    });
  }
  actor(modelId, weaponId, o) { const a = this.assets.get(modelId); if (!a) return null; return new Actor3D(a, weaponId ? this.weapons.get(weaponId) ?? null : null, o); }
}
