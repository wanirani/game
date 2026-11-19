// v2g — the bell crossing as a staged moment (CROSSING lane). docs/v2/ENGINE_API.md 12.3, docs/v2/FX.md 14, docs/v2/SOUND_FEEL.md 15
// One template at every bell, both directions (GDD 2.2 건넘 · 2.4 rule 8 · 9.2 cut scene 5 "백 년이 흐르는 3초"):
//   gather   the bell's light gathers while the twin night is built (>= 0.1 s) - the answer decides: the ring, or the dull toll
//   ring     the toll, the world slows, a ring of light runs outward over ground, walls and people (0.5 s; from the frame's depth)
//   passage  the last picture of the night being left stays as a frozen copy and time runs over it while the twin loads
//            (>= 1.2 s, 3 s with the year count for `years`); one full-screen pass, nothing of the world is drawn
//   reveal   the new night opens as a ring from the bell: old picture outside, live night inside (0.9 s), then the second toll
//   glow     the badge turns over, the controls come back, light settles on hero and bell
//   dull     the refusal - THE BELL THAT WILL NOT ANSWER (WHIP2, 2026-11-19): a thick grey ring that rises from the foot of the bell and gutters within two
//            metres, the colour drained inside it, the hero thrown back from the bell with the shard gone dark, one heavy thump of the camera, the dull toll
//            with no tail and its dull haptic, the night badge beating twice - 0.45 s, nothing changes. It is also staged ALONE (refuse()): when the story
//            answers a long ring with the dull toll (its sound call 'cross.dull' is the cue - the queen holds her hall's bell) and at a sealed bell
// Picture: while gather / ring / reveal run, the scene is drawn into a copy of the frame (colour + depth texture) and one pass
// composes the screen from it. The textures exist only while a crossing runs (allocated in begin(), freed when it has ended).
// Nothing is allocated per frame: uniforms are written into arrays made once, the HUD reads one object (state.cross).
// WebGL1 has none of this: scene.cross() keeps the old pale veil there.
import { program } from '../fx/engine.js';
import { PRESET_IDS } from '../fx/index.js';
import { feel } from '../feel/index.js';
import { input } from '../../core/input.js';
import { loadArea, freeSpot } from './area.js';

export const CROSS_T = { gather: 0.1, ring: 0.5, dull: 0.45, pass: 1.2, years: 3.0, reveal: 0.9, glow: 1.1, back: 0.22, turn: 0.7 };
const YEAR = { past: 1697, now: 1797 };
const BUDGET = 22;         // ms of loading work in one go before the load lets a frame through (breath()): short enough for 40 frames a second, long enough that drawing those frames does not double the load on a slow GPU
const R_END = 6600;        // world units: a ring this wide has left every picture
const GLOW_PAST = new Float32Array([1.0, 0.8, 0.5]), GLOW_NOW = new Float32Array([0.7, 0.86, 1.0]), DRAW2 = [0x8ce0, 0x8ce1];   // (COLOR_ATTACHMENT0, 1)
/** radius of a ring k (0..1) of its time after it left the bell: `near` units in the first four fifths (the part of the world the camera sees
 *  around the bell - the eye can follow it there), then out past everything */
const ringR = (k, near) => (k < 0.8 ? near * k / 0.8 : near + (R_END - near) * ((k - 0.8) / 0.2) * ((k - 0.8) / 0.2));

const VS = `#version 300 es
out vec2 vUV;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUV = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
// What time does to the frozen picture — in two steps, so that a full-size pixel costs next to nothing (the passage must stay fluid on slow GPUs):
//   FS_FIELD  a quarter-size "time field" drawn every frame into two small textures:
//             field  R how far the colour has drained · G shadow · B push along the bell's radius (0.5 = none) · A how far the edge is eaten
//             light  what is added: cloud streaks, rain / sparks, dust, the glow where the bell hangs
//   aged()    full size: three texture reads (field, light, the frozen picture pushed by the field), the grade, the bell's rings as thin lines, grain
const FS_NOISE = `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;
const FS_FIELD = (low) => `#version 300 es
precision highp float;${low ? '\n#define LOW' : ''}
in vec2 vUV; layout(location = 0) out vec4 o0; layout(location = 1) out vec4 o1;
uniform vec4 uT;        // x seconds of the passage · y how far the change has come 0..1 · z +1 towards tonight, -1 towards 1697
uniform vec4 uBellS;    // the bell on the screen (uv, y up) · z width / height · w how flat a ring on the ground lies (1 / sin pitch)
uniform vec4 uPulse;    // ages in seconds of the last three rings from the bell (< 0 = none) · w their brightness
uniform vec3 uGlow;     // the bell's light
uniform vec3 uTo;       // the tint of the night ahead
${FS_NOISE}
void main() {
  vec2 uv = vUV;
  float t = uT.x, g = uT.y, dir = uT.z;
  vec2 q = (uv - uBellS.xy) * vec2(uBellS.z, uBellS.w);
  float r = length(q), push = 0.0;
  for (int i = 0; i < 3; i++) {   // each ring from the bell pushes the picture outward as it passes
    float a = uPulse[i];
    if (a < 0.0) continue;
    float rr = 0.03 + a * (1.25 - a * 0.22), wd = 0.03 + a * 0.05, x = (r - rr) / wd;
    push += exp(-x * x) * exp(-a * 1.5) * (x > 0.0 ? 1.0 : -0.6);
  }
  float off = push * 0.022 + (vn(uv * 3.1 + vec2(t * 0.9, 0.0)) - 0.5) * (0.006 + 0.016 * g);   // ... and it breathes: the picture never stands still
  // the colour of one night drains into the other, as a tide running out from the bell
  float tide = smoothstep(-0.3, 0.3, g * 2.3 - r - 0.15 + (vn(uv * 5.0 + t * 0.35) - 0.5) * 0.35) * min(1.0, g * 3.0 + 0.2);
  // shadows sweep across as if the moon raced over the sky - faster and faster
  float sp = t * (1.3 + t * 1.1) * dir, k3 = min(1.0, t * 2.5);
  float band = vn(vec2(uv.x * 1.7 + uv.y * 0.8 - sp, uv.y * 1.1 + 3.0)) * 0.65 + vn(vec2(uv.x * 4.3 - sp * 2.1, uv.y * 2.6 + 9.0)) * 0.35;
  float sh = smoothstep(0.38, 0.7, band);
  vec3 add = (1.0 - sh) * k3 * 0.07 * uTo * vec3(0.8, 0.84, 0.95);
#ifndef LOW
  // streaks of cloud rush past (thicker towards the top); rain towards tonight, sparks towards 1697; dust settles / lifts
  float cy = smoothstep(0.2, 1.0, uv.y);
  float cl = vn(vec2(uv.x * 2.4 - sp * 2.4, uv.y * 13.0 + 1.7)) * vn(vec2(uv.x * 1.1 - sp * 1.3, uv.y * 4.0 + 5.0));
  add += cl * cl * (0.25 + cy) * k3 * 0.7 * uTo * vec3(0.72, 0.74, 0.8);
  vec2 rp = vec2(uv.x * uBellS.z * 64.0 + uv.y * 8.0, uv.y * 1.5 + dir * t * 4.6);
  float rn = h21(vec2(floor(rp.x), 3.0)), ry = fract(rp.y + rn * 9.0), rx = abs(fract(rp.x) - 0.5);
  add += step(0.86, rn) * smoothstep(0.5, 0.1, rx) * smoothstep(0.0, 0.1, ry) * smoothstep(0.7, 0.15, ry) * k3 * 0.3 * mix(uGlow, uTo, 0.5);
  for (int i = 0; i < 2; i++) {
    float fi = float(i), n = 8.0 + fi * 6.0;
    vec2 gp = vec2(uv.x * uBellS.z, uv.y) * n; gp.y += dir * t * (1.5 - fi * 0.6) * n * 0.16; gp.x += sin(t * 1.3 + fi * 2.0) * 0.3;
    vec2 cell = floor(gp), f = fract(gp) - 0.5;
    float rd = h21(cell + fi * 17.0), d = length(f - (vec2(rd, fract(rd * 7.3)) - 0.5) * 0.6);
    add += (dir > 0.0 ? vec3(0.5, 0.54, 0.62) : uGlow) * smoothstep(0.12 - fi * 0.03, 0.0, d) * step(0.5, fract(rd * 13.7)) * k3 * (0.4 - fi * 0.12);
  }
#endif
  // the edges erode: the frame is eaten inward by a ragged front
  vec2 e2 = min(uv, 1.0 - uv);
  float er = smoothstep(0.0, 0.15, min(e2.x * uBellS.z, e2.y) + (vn(uv * 8.0 + t * 0.5) - 0.5) * 0.16 - g * 0.06 + 0.035);
  add += uGlow * exp(-r * r * 90.0) * (0.14 + 0.1 * sin(t * 9.0)) * uPulse.w;
  o0 = vec4(tide, 1.0 - sh * k3 * (0.26 + 0.2 * g), clamp(0.5 + off * 12.0, 0.0, 1.0), (1.0 - er) * min(1.0, 0.25 + g * 1.2) * 0.86 * k3);
  o1 = vec4(add, 1.0);
}`;
const FS_AGED = `
uniform sampler2D uFrozen; uniform sampler2D uField; uniform sampler2D uLight;
uniform vec4 uT;        // x seconds of the passage · w 1 = a frozen picture exists
uniform vec4 uBellS;    // the bell on the screen (uv, y up) · z width / height · w how flat a ring on the ground lies
uniform vec3 uPR; uniform vec3 uPW; uniform vec3 uPF;   // the three rings from the bell: radius, 1 / width, brightness
uniform vec3 uBase;     // colour that stands in when the frozen picture is gone (context lost)
uniform vec3 uGlow;     // the bell's light
uniform vec3 uTo;       // the tint of the night ahead (from its fog colour) · uFog: that colour itself, dark
uniform vec3 uFog;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec3 gradeTo(vec3 c) { float l = dot(c, vec3(0.3, 0.59, 0.11)); return (vec3(l) * 0.8 + c * 0.2) * uTo + uFog * 0.16; }
vec3 aged(vec2 uv) {
  vec4 f = texture(uField, uv);
  vec2 q = (uv - uBellS.xy) * vec2(uBellS.z, uBellS.w);
  float r = length(q);
  vec2 u2 = uv - q / (max(r, 1e-4) * vec2(uBellS.z, uBellS.w)) * ((f.b - 0.5) / 12.0);
  vec3 c = uT.w > 0.5 ? texture(uFrozen, clamp(u2, 0.001, 0.999)).rgb : uBase * (0.5 + 0.9 * f.g);
  c = mix(c, gradeTo(c), 0.35 + 0.6 * f.r);
  c = mix(c * f.g, uFog * 0.22, f.a) + texture(uLight, uv).rgb;
  vec3 x = (vec3(r) - uPR) * uPW, e = 1.0 / (1.0 + x * x * 9.0);
  c += uGlow * dot(e * e, uPF) * 0.6;
#ifndef LOW
  c += (h21(uv * 431.0 + fract(uT.x * 7.3) * 61.0) - 0.5) * 0.07 * min(1.0, uT.x * 2.5);   // grain
#endif
  return c;
}`;
const FS_HEAD = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;`;
const FS_PASS = (low) => `${FS_HEAD}${low ? '\n#define LOW' : ''}${FS_AGED}
void main() { o = vec4(aged(vUV), 1.0); }`;
// ring (mode 0) and reveal (mode 1): where every pixel of the frame lies in the world comes from its depth
const FS_WORLD = (low) => `${FS_HEAD}${low ? '\n#define LOW' : ''}${FS_AGED}
uniform sampler2D uScene; uniform sampler2D uDepth;
uniform vec3 uEye; uniform vec3 uR; uniform vec3 uU; uniform vec3 uF; uniform vec2 uAB;
uniform vec4 uBellW;   // the bell in the world · w radius of the ring
uniform vec4 uRing;    // x 0 = the ring over the night being left, 1 = the reveal of the new night · y strength · z time (flicker) · w 1 = guttering (refused)
void main() {
  float z = texture(uDepth, vUV).r;
  vec2 n = vUV * 2.0 - 1.0;
  float w = uAB.y / (z * 2.0 - 1.0 - uAB.x);
  vec3 P = uEye + uF * w + uR * (n.x * w) + uU * (n.y * w);
  float d = distance(P, uBellW.xyz);
  vec2 sq = (vUV - uBellS.xy) * vec2(uBellS.z, 1.0);
  bool sky = z > 0.99999;
  if (sky) d = 1500.0 + length(sq) * 2600.0;      // the sky has no place in the world: the ring reaches it last, from the bell's side
  float fw = sky ? 30.0 : min(fwidth(d), 30.0);
  float R = uBellW.w, x = d - R, wd = 6.0 + R * 0.02, wl = clamp(fw * 3.5, 2.5, wd);   // a line a few pixels wide on any surface (a wall the ring only grazes does not flood)
  if (uRing.w > 0.5) { wd = 9.0; wl = clamp(fw * 6.0, 5.0, 12.0); }   // the refusal: a short ring, a thick dull band (it was the crossing's hairline in grey: under 2 of 255 on a phone)
  float rim = exp(-x * x / (wl * wl)), halo = exp(-abs(x) / (wd * 6.0)) * 0.22, tail = x < 0.0 ? exp(x / (40.0 + R * 0.06)) : 0.0;
  float x2 = x + 230.0, x3 = x + 460.0;           // two fainter rings follow the first, as from a bell
  float echo = (R > 230.0 ? exp(-x2 * x2 / (wl * wl)) * 0.5 : 0.0) + (R > 460.0 ? exp(-x3 * x3 / (wl * wl)) * 0.28 : 0.0);
  vec2 dirS = normalize(sq + 1e-5) / vec2(uBellS.z, 1.0);
  vec3 c = texture(uScene, clamp(vUV - dirS * rim * 0.012 * uRing.y, 0.001, 0.999)).rgb;
  float tw = step(0.84, h21(floor(P.xz / 9.0) + floor(P.y / 9.0) * 3.1 + floor(uRing.z * 26.0)));
  vec3 add;
  if (uRing.x < 0.5) {
    float fl = 1.0 - uRing.w * (0.3 + 0.3 * sin(uRing.z * 53.0) * sin(uRing.z * 31.0 + 1.3));
    vec3 gl = mix(uGlow, vec3(0.66, 0.68, 0.74), uRing.w);
    float behind = smoothstep(wd * 3.0, -wd * 3.0, x) * (1.0 - uRing.w);
    c = mix(c, gradeTo(c), behind * 0.35 * min(1.0, uRing.y));       // what the ring leaves behind has begun to turn
    if (uRing.w > 0.5) { float ins = smoothstep(wd * 2.0, -wd * 2.0, x) * min(1.0, uRing.y * 1.4), lum = dot(c, vec3(0.3, 0.59, 0.11)); c = mix(c, vec3(lum * 0.6, lum * 0.61, lum * 0.66), ins * 0.72); }   // inside the refusal's ring the colour drains and the picture sinks for a blink
    add = gl * (rim * (1.0 + tw * 0.9) * (1.0 - uRing.w * 0.25) + (echo + tail * 0.16) * (1.0 - uRing.w) + halo) * uRing.y * fl;   // (the refusal's band is wide, not bright: grey on stone, never white)
  } else {
    c = mix(aged(vUV), c, smoothstep(wl, -wl, x));
    add = uGlow * (rim * (1.15 + tw * 1.3) + echo * 0.8 + halo * 0.6 + tail * 0.14) * uRing.y;
  }
  c += min(add, vec3(1.1)) * (1.0 - 0.5 * clamp(c, 0.0, 1.0));       // light on stone, never a flat white
  o = vec4(c, 1.0);
}`;

export class Crossing {
  constructor(sc) {
    this.sc = sc; this.on = false; this.phase = ''; this.t = 0; this.gen = 0;
    this.pre = undefined; this.spot = null; this.early = null; this.to = ''; this.dir = 1; this.years = false; this.minT = CROSS_T.pass;
    this.tintTo = new Float32Array([1, 1, 1]); this.fogTo = new Float32Array([0.08, 0.08, 0.1]);
    this.bell = new Float32Array(3); this.bellH = 120; this.bellS = new Float32Array([0.5, 0.4, 1, 2.6]); this.R = 0; this.base = new Float32Array([0.1, 0.1, 0.14]);
    this.pulse = new Float32Array([-1, -1, -1, 1]); this.nextPulse = 0; this.beat = 0.4; this.pulseN = 0;
    this.hud = { on: false, k: 1, back: false, turn: 0, year: 0, from: 'now', to: 'past', beat: 0, no: 0 };   // what the HUD reads (state.cross): k = how much of the controls is shown · no = 0..1 through a refusal (the badge's shake of the head - the HUD may read it; today it sees the two beats)
    this.solo = false; this.shutAt = -1e9; this._own = false; this._no2 = false;   // the refusal staged alone · when the bell last stayed shut (performance.now) · this object is playing the dull toll itself
    feel.tap('cross.dull', () => { if (!this._own) this.refuse(false); });   // whoever plays the dull toll (the story's refusal of a crossing) gets the bell that stays shut
    this.kTo = 1; this.turnOn = false; this.padHid = false;
    // GL (made in begin(), gone after the crossing; the two programs stay until the scene is left)
    this.pPass = null; this.pWorld = null; this.pField = null; this.vao = null; this.glGen = -1;
    this.texF = null; this.texL = null; this.fboF = null; this.qw = 0; this.qh = 0;   // the quarter-size time field and its light
    this.texA = null; this.texB = null; this.depth = null; this.fboA = null; this.fboB = null; this.w = 0; this.h = 0; this.fw = 0; this.fh = 0; this.frozen = false; this.bytes = 0;
    this.tk = 0; this.shotTk = -9;   // ticks of this crossing · the tick the frame copy was last filled by a drawn frame
    this.mode = 0;            // what the next scene draw is for: 0 compose to the screen · 1 the frozen copy · 2 nothing (warm-up while loading)
    this._v4 = new Float32Array(4); this._v3 = new Float32Array(3); this._v2 = new Float32Array(2); this._p = { x: 0, y: 0, w: 0 };
    this._pr = new Float32Array(3); this._pw = new Float32Array(3); this._pf = new Float32Array(3);
    this.loopId = 0; this.sparkT = 0; this._holdRes = null; this._t0 = 0; this.slicing = false; this.prof = new Float64Array(12);
    this._yq = []; this._ch = new MessageChannel(); this._ch.port1.onmessage = () => { const r = this._yq.shift(); if (r) { this._t0 = performance.now(); r(); } };
    // what a tool can read afterwards (performance.now() stamps of the last crossing, frames drawn and the longest gap between two of them during the passage)
    this.log = { begin: 0, answer: 0, toll: 0, freeze: 0, loaded: 0, reveal: 0, land: 0, end: 0, refused: false, frames: 0, gap: 0, last: 0, yields: 0, n: 0 };
  }
  /** can the staged crossing run here? (WebGL2 with the effects engine's shader helper; the old veil otherwise) */
  get usable() { const g = this.sc.glr; return !!g && g.webgl2 && !g.lost; }
  /** a crossing holds the hero (gather ... reveal). `on` stays true a little longer for the after-glow. */
  get busy() { return this.on && this.phase !== 'glow'; }

  // ───────────────────────── GL objects ─────────────────────────
  /** compile the two programs behind a loading screen (called after an area has loaded): the first crossing does not pay for them */
  prepare() { this.early = null; if (this.usable) { try { this._programs(); } catch (e) { console.warn('[v2g] crossing shaders:', String(e?.message ?? e)); } } }
  _programs() {
    const glr = this.sc.glr, gl = glr.gl;
    if (this.glGen !== glr.restored) { this.glGen = glr.restored; this.pPass = this.pWorld = this.pField = this.vao = null; this._dropTex(false); }   // objects of a lost context are dead
    if (this.pPass) return true;
    const low = this.sc.perf.tier === 'low';
    this.pPass = program(gl, VS, FS_PASS(low), 'cross.pass'); this.pWorld = program(gl, VS, FS_WORLD(low), 'cross.world'); this.pField = program(gl, VS, FS_FIELD(low), 'cross.field');
    this.vao = gl.createVertexArray();
    for (const p of [this.pPass, this.pWorld]) { gl.useProgram(p.p); if (p.u.uScene) gl.uniform1i(p.u.uScene, 0); if (p.u.uDepth) gl.uniform1i(p.u.uDepth, 1); gl.uniform1i(p.u.uFrozen, 2); gl.uniform1i(p.u.uField, 3); gl.uniform1i(p.u.uLight, 4); }
    return true;
  }
  _tex(w, h, depth) {
    const gl = this.sc.glr.gl, t = gl.createTexture(), f = depth ? gl.NEAREST : gl.LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, depth ? gl.DEPTH_COMPONENT24 : gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bytes += w * h * 4; return t;
  }
  _fbo(col, depth) { const gl = this.sc.glr.gl, f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, col, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0); return f; }
  /** the frame copy for a picture of w x h. The frozen copy keeps its own size once it has been taken. */
  _alloc(w, h) {
    const gl = this.sc.glr.gl;
    if (this.texB && this.w === w && this.h === h) return;
    if (this.texB) { gl.deleteFramebuffer(this.fboB); gl.deleteTexture(this.texB); gl.deleteTexture(this.depth); this.bytes -= this.w * this.h * 8; if (!this.frozen && this.texA) { gl.deleteFramebuffer(this.fboA); gl.deleteTexture(this.texA); this.texA = null; this.fboA = null; this.bytes -= this.fw * this.fh * 4; } }
    gl.activeTexture(gl.TEXTURE0);
    this.w = w; this.h = h; this.texB = this._tex(w, h, false); this.depth = this._tex(w, h, true); this.fboB = this._fbo(this.texB, this.depth);
    if (!this.texA) { this.fw = w; this.fh = h; this.texA = this._tex(w, h, false); this.fboA = this._fbo(this.texA, this.depth); }
    if (!this.texF) {
      const qw = (this.qw = Math.max(2, Math.ceil(w / 4))), qh = (this.qh = Math.max(2, Math.ceil(h / 4)));
      this.texF = this._tex(qw, qh, false); this.texL = this._tex(qw, qh, false); this.fboF = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboF);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texF, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.texL, 0);
      gl.drawBuffers(DRAW2);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null);
  }
  _dropTex(del) {
    if (del && this.sc.glr && !this.sc.glr.lost) { const gl = this.sc.glr.gl; for (const f of [this.fboA, this.fboB, this.fboF]) if (f) gl.deleteFramebuffer(f); for (const t of [this.texA, this.texB, this.depth, this.texF, this.texL]) if (t) gl.deleteTexture(t); }
    this.texA = this.texB = this.depth = this.fboA = this.fboB = this.texF = this.texL = this.fboF = null; this.w = this.h = this.fw = this.fh = this.qw = this.qh = 0; this.frozen = false; this.bytes = 0;
  }

  // ───────────────────────── the moment ─────────────────────────
  /** scene.cross() has checked that a crossing may start. -> true (the answer of the other night comes later: the ring, or the dull toll) */
  begin(o, to) {
    const sc = this.sc, a = sc.area, h = sc.sim.hero, H = this.hud, L = this.log;
    this.gen++; this.on = true; this.phase = 'gather'; this.t = 0; this.to = to; this.years = !!o?.years; this.dir = a.era === 'past' ? 1 : -1; this.minT = this.years ? CROSS_T.years : CROSS_T.pass;
    this.pre = undefined; this.spot = null; this.frozen = false; this.mode = 0; this.R = 60; this.sparkT = 0; this._holdRes = null; this.slicing = false; this.tk = 0; this.shotTk = -9;
    this.pulse[0] = this.pulse[1] = this.pulse[2] = -1; this.pulse[3] = 1; this.pulseN = 0;
    { const T = this.tintTo, G = this.fogTo, c = this.dir > 0; T[0] = c ? 0.7 : 1.4; T[1] = c ? 0.88 : 0.8; T[2] = c ? 1.15 : 0.6; G[0] = c ? 0.06 : 0.12; G[1] = 0.08; G[2] = c ? 0.13 : 0.07; }
    sc.xing = { to, years: this.years, from: a.era }; sc._refused = false; sc.locked = true;
    // the bell: the nearest bell of the area within reach, otherwise the hand bell the hero carries
    this._findBell(h, 420);
    H.on = true; H.turn = 0; H.year = this.years ? YEAR[a.era] : 0; H.from = a.era; H.to = a.era === 'past' ? 'now' : 'past'; H.beat = 0; H.back = true; this.kTo = 0; this.turnOn = false; sc.state.cross = H;
    if (sc.hudKind !== 'ui' && sc.showPad) { sc.showPad = false; this.padHid = true; }   // the old pad steps back too
    L.begin = performance.now(); L.answer = L.toll = L.freeze = L.loaded = L.reveal = L.land = L.end = 0; L.refused = false; L.frames = 0; L.gap = 0; L.last = 0; L.yields = 0; L.n++;
    try { this._programs(); } catch (e) { console.warn('[v2g] crossing shaders:', String(e?.message ?? e)); }
    const gen = this.gen, E = this.early, near = E && E.to === to && E.flags === this._sig() && performance.now() - E.at < 20000 && (E.x - h.x) * (E.x - h.x) + (E.z - h.z) * (E.z - h.z) < 60 * 60;
    this.early = null;   // (the twin built while the hero wound up the long ring, when he still stands where he stood)
    if (near && E.res && E.res.pre === null) { this.pre = null; L.answer = L.begin; this._dullOn(true, true); return true; }   // the other night answered while he wound up the ring - nowhere to stand: the bell stays shut at once, without the gathering light
    this._play('cross.gather', 1);
    this._fx('cross.gather');
    (near ? E.job : this._build(to, h.x, h.z)).then((r) => { if (this.gen === gen && this.on) { this.pre = r.pre; this.spot = r.spot; this.log.answer = performance.now(); } });
    return true;
  }
  /** the area flags the twin is built from, as one string (made when a crossing or its early build starts - not per frame) */
  _sig() { return Object.keys(this.sc.worldFlags ?? {}).sort().join('+'); }
  /** the hero has begun the long ring in front of a bell: build the other night now, so that its answer is there when the bell sounds */
  prebuild() {
    const sc = this.sc, a = sc.area, h = sc.sim?.hero;
    if (this.on || !this.usable || !sc.ready || !a || a.test || !a.twin || !h || sc._go || sc.xing) return;
    const S = sc.people.spots; let near = false;
    for (let i = 0; i < S.length; i++) { const q = S[i]; if (q.def.kind !== 'bell') continue; const dx = q.x - h.x, dz = q.z - h.z; if (dx * dx + dz * dz < (q.r + 60) * (q.r + 60)) near = true; }
    if (!near) return;
    const E = this.early;
    if (E && E.to === a.twin && E.flags === this._sig() && performance.now() - E.at < 20000 && (E.x - h.x) * (E.x - h.x) + (E.z - h.z) * (E.z - h.z) < 60 * 60) return;
    const N = (this.early = { to: a.twin, flags: this._sig(), x: h.x, z: h.z, at: performance.now(), job: this._build(a.twin, h.x, h.z), res: null });
    N.job.then((r) => { N.res = r; });   // (begin() reads the answer when it is already there)
  }
  /** the twin night, built in steps (its definition | the compile | the free spot), each in a task of its own.
   *  -> { pre: area | null (nowhere to stand over there: refused), spot } */
  async _build(to, x, z) {
    const sc = this.sc; let pre = null, spot = null;
    try {
      await this._yield();
      pre = await loadArea(to, sc.worldFlags, () => this._yield());
      await this._yield();
      spot = pre.id === to ? await freeSpot(pre, x, z) : null;
      if (!spot) pre = null;
    } catch (e) { console.warn('[v2g] crossing: the twin did not build:', String(e?.message ?? e)); pre = null; }
    return { pre, spot };
  }
  /** end this task: the browser may draw a frame (when one is due) before the work goes on. A message task, not a timer and not the next frame:
   *  the work resumes at once when no frame is due, and it does not stall in a tab that draws no frames. */
  _yield() { this.log.yields++; return new Promise((res) => { this._yq.push(res); this._ch.port2.postMessage(0); }); }
  /** between two steps of the load: lets a frame through when this frame's share of loading time is used up (a crossing only) */
  breath(step) { if (!this.slicing) return null; const now = performance.now(); if (step) this.prof[step] = now; if (now - this._t0 < BUDGET) return null; return this._yield(); }
  /** a step of the load is reached (what a tool reads afterwards: scene.cx.prof - ms stamps; 1 textures 2 sky 3 meshes 4-6 models 7 effects 8 rules 9 people, pools 10 first warm-up 11 second) */
  mark(step) { if (this.slicing) this.prof[step] = performance.now(); }
  /** the load is done: wait until the passage has had its time (1.2 s, 3 s for `years`) */
  hold() { if (this.phase !== 'passage') return null; this.log.loaded = performance.now(); this.slicing = false; if (this.t >= this.minT) return null; return new Promise((res) => { this._holdRes = res; }); }

  /** the bell this crossing rings: the nearest bell of the area within reach (its foot + 1.2 m), otherwise the hand bell the hero carries */
  _findBell(h, reach) {
    const S = this.sc.people.spots, B = this.bell; let best = reach * reach;
    B[0] = h.x; B[1] = h.y; B[2] = h.z; this.bellH = 78;
    for (let i = 0; i < S.length; i++) { const q = S[i]; if (q.def.kind !== 'bell') continue; const dx = q.x - h.x, dz = q.z - h.z, d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; B[0] = q.x; B[1] = q.y; B[2] = q.z; this.bellH = 120; } }
  }
  _play(name, vol, pitch) { try { if (feel.has(name)) feel.play(name, null, vol ?? 1, pitch ?? 1); } catch { /* no audio */ } }
  /** WHIP2 - the bell stays shut: enter the dull phase (from the gather of a crossing, at once from begin(), or alone from refuse()). snd / puff: play the dull toll / the grey puff here (false when the story's own calls are the cue) */
  _dullOn(snd, puff) {
    const sc = this.sc, H = this.hud, fx = sc.fx, h = sc.sim?.hero, w = sc.whip;
    this.phase = 'dull'; this.t = 0; this.R = 16; this.log.refused = true; this.kTo = 1; H.back = false; H.beat = 1; H.no = 0; this._no2 = false; this.shutAt = performance.now();
    if (snd) { this._own = true; this._play('cross.dull', 1); this._own = false; }   // the dull toll: low, short, no tail - and its dull haptic (feel table)
    if (puff) this._fx('cross.dull');
    if (fx) { try { const F = fx.feel; F.kick(0, -1, 0, 9); F.addTrauma(0.3); F.vignette(0.3, 0.32, 0.38, 0.34, 4.5); } catch { /* effect */ } }   // one short heavy shake: a thump straight down; the edges of the picture go grey for a blink
    if (h) h.recoil = 1;                         // the hand and the body are thrown back from the bell (src/v2/play/motion.js)
    if (w) { w.pulse = 0; w.kick = 1; w.dull = 0.6; }   // the shard he rang with goes dark and drops out of its halo; its golden ring and chime stay out (src/v2/whip/sim.js: no ring event while dull)
  }
  /** has the bell just stayed shut (this tick's long ring was refused)? The scene keeps the golden toll and its light to itself then */
  shutNow() { return performance.now() - this.shutAt < 60; }
  /**
   * WHIP2 - the refusal staged alone: the same 0.45 s as the dull phase of a crossing, without a crossing (nothing is locked, nothing is loaded).
   * Cues: the story plays the dull toll (feel.tap in the constructor - snd false: its own sound and puff follow) · the scene, at a sealed bell (snd true).
   */
  refuse(snd = true) {
    const sc = this.sc, h = sc.sim?.hero, a = sc.area, now = performance.now();
    if (this.on || !h || !a || !sc.ready || now - this.shutAt < 700) return false;   // (a crossing being staged shows its own answer; one answer a ring)
    if (!this.usable) {   // WebGL1: no ring, the rest as it is
      this.shutAt = now; if (snd) { this._own = true; this._play('cross.dull', 1); this._own = false; this._fx('cross.dull'); }
      try { sc.fx?.feel.addTrauma(0.3); } catch { /* effect */ } return true;
    }
    const H = this.hud, L = this.log;
    try { this._programs(); } catch { /* the ring is left out */ }
    this.gen++; this.on = true; this.solo = true; this.pre = undefined; this.spot = null; this.frozen = false; this.mode = 0; this.slicing = false; this.years = false; this.tk = 0; this.shotTk = -9; this.dir = a.era === 'past' ? 1 : -1;
    this.pulse[0] = this.pulse[1] = this.pulse[2] = -1; this.pulse[3] = 1; this.pulseN = 0;
    this._findBell(h, 420);
    H.on = true; H.turn = 0; H.year = 0; H.from = a.era; H.to = a.era; H.k = 1; this.turnOn = false; sc.state.cross = H;
    L.begin = now; L.answer = now; L.toll = L.freeze = L.loaded = L.reveal = L.land = L.end = 0; L.frames = 0; L.gap = 0; L.last = 0;
    this._dullOn(snd, snd);
    return true;
  }
  /** an effect of the crossing at the foot of the bell (or at x, y, z); the presets read the direction of the crossing from dx and the bell's height from pow */
  _fx(name, x, y, z) { const fx = this.sc.fx, id = PRESET_IDS[name], B = this.bell; if (!fx || id === undefined) return; const px = x ?? B[0], py = y ?? B[1], pz = z ?? B[2]; try { fx.playAt(id, px, py, pz, this.dir, 0, this.bellH / 100, px, py, pz); } catch { /* effect */ } }

  /** every tick of the scene, before anything else */
  tick(dt) {
    if (!this.on) return;
    const sc = this.sc, H = this.hud, T = CROSS_T;
    this.t += dt; this.tk++;
    if (H.k !== this.kTo) H.k = this.kTo > H.k ? Math.min(this.kTo, H.k + dt / 0.3) : Math.max(this.kTo, H.k - dt / T.back);
    if (H.beat > 0) H.beat = Math.max(0, H.beat - dt * 3);
    if (this.turnOn && H.turn < 1) H.turn = Math.min(1, H.turn + dt / T.turn);
    switch (this.phase) {
      case 'gather': {
        this.R = 60 + 95 * (1 - Math.exp(-this.t * 9)) + 10 * Math.sin(this.t * 21);
        if (this.pre === undefined || this.t < T.gather) break;
        if (this.pre === null) { this._dullOn(true, true); break; }
        this.phase = 'ring'; this.t = 0; this.log.toll = performance.now(); this._tint(this.pre);
        { const fx = sc.fx, h = sc.sim?.hero; if (fx) { const F = fx.feel; F.slowMo(0.3, T.ring + 0.05); F.zoomPunch(0.07, 0.5); F.addTrauma(0.22); }
          this._fx('cross.ring'); if (h) this._fx('cross.lift', h.x, h.y, h.z);
          try { feel.play('bell.toll', h ?? null); } catch { /* no audio */ }
          try { input.rumble?.(0.6, 0.9, 420); } catch { /* no pad */ } }
        break;
      }
      case 'ring': {
        const k = Math.min(1, this.t / T.ring);
        this.R = 150 + ringR(k, 620);
        if (k >= 1) this._depart();
        break;
      }
      case 'dull': {   // the ring rises from the foot of the bell to two metres (116 px) in 0.3 s and gutters there; the badge beats a second time; the hero's recoil eases off
        const u = Math.min(1, this.t / 0.3), h = sc.sim?.hero;
        this.R = 16 + 100 * (1 - (1 - u) * (1 - u));
        H.no = Math.min(1, this.t / T.dull);
        if (!this._no2 && this.t >= 0.17) { this._no2 = true; H.beat = 0.85; }
        if (h) h.recoil = Math.max(0, 1 - this.t / 0.3);
        if (this.t >= T.dull) { const solo = this.solo; if (h) h.recoil = 0; this._end(); if (!solo) { sc._refused = true; sc._crossed(null, false); } }
        break;
      }
      case 'passage': {
        const P = this.pulse;
        for (let i = 0; i < 3; i++) if (P[i] >= 0) P[i] += dt;
        if (this.t >= this.nextPulse) { P[this.pulseN % 3] = 0; this.pulseN++; this.nextPulse += this.beat; this.beat += 0.07; H.beat = 1; this._play('cross.beat', Math.max(0.55, 1 - this.pulseN * 0.06), 1 + Math.min(6, this.pulseN) * 0.03); }
        if (this.years) { const k = Math.min(1, this.t / T.years), e = k * k * (3 - 2 * k), y0 = YEAR[H.from], y1 = YEAR[H.to]; H.year = Math.round(y0 + (y1 - y0) * e); }
        if (this._holdRes && this.t >= this.minT) { const r = this._holdRes; this._holdRes = null; r(); }
        if (!sc.ready) { try { sc.hud.update(dt, sc.state); } catch (e) { sc._hudFail(e); } try { feel.update(); } catch { /* no audio */ } }   // the scene's own tick stops while it loads: the badge and the pad still need theirs
        break;
      }
      case 'reveal': {
        const k = Math.min(1, this.t / T.reveal), P = this.pulse;
        for (let i = 0; i < 3; i++) if (P[i] >= 0) P[i] += dt;
        P[3] = 1 - k;
        this.R = ringR(k, 720);
        if ((this.sparkT -= dt) <= 0 && this.R < 1500) { this.sparkT = 0.05; this._ringSparks(); }
        if (k >= 1) this._land();
        break;
      }
      case 'glow': if (this.t >= T.glow && H.k >= 1 && H.turn >= 1) this._end(); break;
      default: break;
    }
  }
  /** the colour the picture drains into: the fog of the night ahead as a tint (its brightness taken out, pulled half way to neutral) */
  _tint(area) {
    const f = area?.W?.fog?.color, T = this.tintTo, G = this.fogTo; if (!f) return;
    const l = Math.max(0.02, 0.3 * f[0] + 0.59 * f[1] + 0.11 * f[2]);
    for (let i = 0; i < 3; i++) { T[i] = Math.max(0.5, Math.min(1.7, 1 + (f[i] / l - 1) * 0.72)); G[i] = f[i]; }
  }
  /** the ring has left the picture: keep the last frame of this night, let the old night go and load the other one under it */
  _depart() {
    const sc = this.sc, g = sc.game, P = this._p, B = this.bell, S = this.bellS, to = this.to, L = this.log;
    // where the bell is on the screen (the rings of the passage start there), how flat they lie, the colour to fall back on
    sc.project(B[0], B[1] + this.bellH, B[2], P);
    if (P.w > 1) { S[0] = Math.max(-0.3, Math.min(1.3, P.x / g.viewW)); S[1] = Math.max(-0.3, Math.min(1.3, 1 - P.y / g.viewH)); } else { S[0] = 0.5; S[1] = 0.42; }
    S[2] = g.viewW / g.viewH; S[3] = 1 / Math.max(0.3, Math.min(1, -sc.camF[1] + 0.05));
    { const f = sc.W?.fog?.color; if (f) { this.base[0] = f[0]; this.base[1] = f[1]; this.base[2] = f[2]; } }
    // the last picture of this night: the frame the ring was just composed from (the two copies change places - nothing is drawn again);
    // only when no frame was drawn in the last two ticks (a tool running ticks without frames) the scene is drawn once more for it
    if (this.texB && this.tk - this.shotTk <= 2 && this.usable) {
      const t = this.texA, f = this.fboA; this.texA = this.texB; this.fboA = this.fboB; this.texB = t; this.fboB = f; this.fw = this.w; this.fh = this.h; this.frozen = true;
    } else { try { if (this.usable && this.pPass) { this.mode = 1; sc._gl(g.viewW, g.viewH, 1, false); } } catch (e) { console.warn('[v2g] crossing: the last picture was not kept:', String(e?.message ?? e)); } }
    this.mode = 2;
    this.phase = 'passage'; this.t = 0; this.nextPulse = 0; this.beat = 0.4; this.pulseN = 0; L.freeze = performance.now(); L.last = 0;
    try { sc._ts = 1; feel.setTimeScale(1); } catch { /* no audio */ }
    try { this.loopId = feel.loopStart('loop.cross', null, 1); } catch { this.loopId = 0; }
    this._play(this.years ? 'cross.rush.long' : 'cross.rush', 1);
    this.slicing = true; this._t0 = performance.now(); this.prof.fill(0); this.prof[0] = this._t0;
    const go = { to, spawn: null, keep: true, night: true, cross: true }, gen = this.gen;
    sc.gotoArea(to, null, { keepPosition: true, cross: true, pre: this.pre, spot: this.spot }).then((ok) => {
      if (this.gen !== gen || !sc.glr) return;
      sc._exitBusy = false; this.pre = undefined;
      try { sc._crossed(go, ok); } catch (e) { this._end(); console.error('[v2g] crossing: the far side failed', e); }
    });
  }
  /** the other night is loaded and live (scene._crossed): open it as a ring from the bell */
  arrived(ok) {
    const sc = this.sc;
    if (!ok || !sc.ready || !sc.sim) { this._end(); return; }   // the load failed: the scene shows its own error
    this._findBell(sc.sim.hero, 620);
    this.phase = 'reveal'; this.t = 0; this.R = 0; this.mode = 0; this.sparkT = 0; this.log.reveal = performance.now();
    sc.locked = true;
    this._fx('cross.open');
  }
  /** sparks where the opening ring runs over the ground around the bell (drawn in the live night: they show inside the ring) */
  _ringSparks() {
    const sc = this.sc, fx = sc.fx, id = PRESET_IDS['cross.spark'], B = this.bell, h = sc.sim?.hero; if (!fx || id === undefined || !h) return;
    const R = Math.max(30, this.R - 24), a0 = Math.random() * 6.283;
    for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094, x = B[0] + Math.cos(a) * R, z = B[2] + Math.sin(a) * R; try { fx.playAt(id, x, h.y, z, Math.cos(a), Math.sin(a), this.dir, x, h.y, z); } catch { /* effect */ } }
  }
  /** the ring has left the screen: the second toll, the badge turns over, the banner, the controls come back, the after-glow */
  _land() {
    const sc = this.sc, x = sc.xing, era = sc.area.era, h = sc.sim.hero, T = sc.host?.STORY.TEXT?.night ?? null, fx = sc.fx;
    this.phase = 'glow'; this.t = 0; this.mode = 0; this.log.land = performance.now();
    sc.xing = null; sc.locked = false; this.kTo = 1; this.hud.back = false; this.turnOn = true; this.hud.year = this.years ? YEAR[era] : 0;
    if (this.loopId) { try { feel.loopStop(this.loopId, 0.1); } catch { /* no audio */ } this.loopId = 0; }
    try { feel.play(era === 'past' ? 'cross.arrive.past' : 'cross.arrive.now', h); } catch { /* no audio */ }
    try { input.rumble?.(0.3, 0.6, 260); } catch { /* no pad */ }
    if (fx) { fx.feel.zoomPunch(0.05, 0.5); fx.feel.addTrauma(0.12); }
    this._fx('cross.arrive'); this._fx('cross.glow', h.x, h.y, h.z);
    if (this.padHid) { sc.showPad = true; this.padHid = false; }
    if (!(x && x.years) && sc.hud.banner) { if (T && T[era]) { sc.host.note('banner', T[era]); sc.hud.banner('night', T[era]); } else sc.hud.banner('night'); }   // a changed tonight gets the story's own banner
    this._dropTex(true);   // the copies of the frame are not needed any more
  }
  /** everything back as it was (after the glow, after a refusal, when the far side failed) */
  _end() {
    const sc = this.sc, H = this.hud;
    this.on = false; this.phase = ''; this.mode = 0; this.pre = undefined; this.slicing = false; this.log.end = performance.now();
    if (this._holdRes) { const r = this._holdRes; this._holdRes = null; r(); }
    if (this.loopId) { try { feel.loopStop(this.loopId, 0.1); } catch { /* no audio */ } this.loopId = 0; }
    if (this.padHid) { sc.showPad = true; this.padHid = false; }
    if (sc.xing) { sc.xing = null; sc.locked = false; }
    H.on = false; H.k = 1; H.back = false; H.turn = 0; H.year = 0; H.beat = 0; H.no = 0; this.solo = false; this.kTo = 1; this.turnOn = false; if (sc.state) sc.state.cross = null;
    this._dropTex(true);
  }

  // ───────────────────────── drawing ─────────────────────────
  /** before the scene is drawn: the frame buffer this frame goes into (null = as always, straight to the screen / the post pass) */
  target(w, h) {
    if (!this.on || this.phase === 'glow' || !this.usable || !this.pWorld) return null;
    if (this.glGen !== this.sc.glr.restored) { try { this._programs(); } catch { return null; } }
    this._alloc(w, h);
    return this.mode === 1 ? this.fboA : this.fboB;
  }
  /** after the scene (and the post pass) has been drawn into target(): compose the screen from it */
  compose(w, h) {
    const sc = this.sc, gl = sc.glr.gl, fx = sc.fx, mode = this.mode;
    if (fx && fx.post.active && fx.post.scene) {   // the post pass kept the depth in its own buffer: copy it next to the colour
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fx.post.scene); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, mode === 1 ? this.fboA : this.fboB);
      gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (mode === 1) { this.frozen = true; this.fw = w; this.fh = h; return; }
    if (mode === 2) return;
    this.shotTk = this.tk;
    const p = this.pWorld, u = p.u, V = this._v4, V3 = this._v3, V2 = this._v2, B = this.bell, m = sc.vp, g = sc.game, ph = this.phase, reveal = ph === 'reveal', dull = ph === 'dull';
    if (reveal) { this._field(gl, this.minT + this.t, 1); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.viewport(0, 0, w, h);
    gl.bindVertexArray(this.vao); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.depth);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texB);
    const sx = sc.focal / (g.viewW / 2), sy = sc.focal / (g.viewH / 2), e = sc.eye, R = sc.camR, U = sc.camU, F = sc.camF, A = sc.A;
    gl.uniform3fv(u.uEye, e); V3[0] = R[0] / sx; V3[1] = R[1] / sx; V3[2] = R[2] / sx; gl.uniform3fv(u.uR, V3);
    V3[0] = U[0] / sy; V3[1] = U[1] / sy; V3[2] = U[2] / sy; gl.uniform3fv(u.uU, V3); gl.uniform3fv(u.uF, F);
    V2[0] = A; V2[1] = m[14] - A * m[15]; gl.uniform2fv(u.uAB, V2);
    V[0] = B[0]; V[1] = B[1] + (dull ? 12 : this.bellH); V[2] = B[2]; V[3] = this.R; gl.uniform4fv(u.uBellW, V);   // (the refusal's ring runs along the ground from the foot of the bell: a 2 m ring about the bell's head would never reach the floor)
    V[0] = reveal ? 1 : 0; V[1] = dull ? (this.t < 0.2 ? 1 : Math.max(0, 1 - (this.t - 0.2) / (CROSS_T.dull - 0.2))) : ph === 'gather' ? 0.55 + 0.25 * Math.min(1, this.t * 6) : 1; V[2] = this.t; V[3] = dull ? 1 : 0; gl.uniform4fv(u.uRing, V);
    if (!reveal) {   // the ring over the old night: where the bell is on the screen now (the sky needs it)
      const P = this._p, S = this.bellS; sc.project(B[0], B[1] + this.bellH, B[2], P);
      if (P.w > 1) { S[0] = P.x / g.viewW; S[1] = 1 - P.y / g.viewH; } S[2] = g.viewW / g.viewH;
    }
    this._aged(u, reveal ? this.minT + this.t : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this._done(gl);
  }
  /** the uniforms of aged() for the program in use (the field must have been drawn for this frame: _field) */
  _aged(u, t) {
    const gl = this.sc.glr.gl, V = this._v4, P = this.pulse, R = this._pr, W = this._pw, F = this._pf;
    V[0] = t; V[1] = 0; V[2] = this.dir; V[3] = this.frozen ? 1 : 0; gl.uniform4fv(u.uT, V);
    for (let i = 0; i < 3; i++) { const a = P[i]; if (a < 0) { R[i] = 9; W[i] = 1; F[i] = 0; } else { R[i] = 0.03 + a * (1.25 - a * 0.22); W[i] = 1 / (0.03 + a * 0.05); F[i] = Math.exp(-a * 1.5) * P[3]; } }
    gl.uniform3fv(u.uPR, R); gl.uniform3fv(u.uPW, W); gl.uniform3fv(u.uPF, F);
    gl.uniform4fv(u.uBellS, this.bellS); gl.uniform3fv(u.uBase, this.base); gl.uniform3fv(u.uGlow, this.dir > 0 ? GLOW_NOW : GLOW_PAST);
    gl.uniform3fv(u.uTo, this.tintTo); gl.uniform3fv(u.uFog, this.fogTo);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.texL); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.texF);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.frozen ? this.texA : null); gl.activeTexture(gl.TEXTURE0);
  }
  /** this frame's quarter-size time field (t = seconds of the passage, grade = how far the change has come). Leaves the vertex array bound. */
  _field(gl, t, grade) {
    const p = this.pField, u = p.u, V = this._v4;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboF); gl.viewport(0, 0, this.qw, this.qh);
    gl.bindVertexArray(this.vao); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(p.p);
    V[0] = t; V[1] = grade; V[2] = this.dir; V[3] = 0; gl.uniform4fv(u.uT, V);
    gl.uniform4fv(u.uBellS, this.bellS); gl.uniform4fv(u.uPulse, this.pulse); gl.uniform3fv(u.uGlow, this.dir > 0 ? GLOW_NOW : GLOW_PAST); gl.uniform3fv(u.uTo, this.tintTo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  _done(gl) {
    for (let i = 4; i >= 0; i--) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, null); }
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.bindVertexArray(null);
  }
  /** the scene is loading (scene.render): the frozen picture with time running over it, and the badge. -> false when nothing could be drawn */
  passage(ctx, hctx) {
    const sc = this.sc, g = sc.game, glr = sc.glr, L = sc.layer, lg = this.log, now = performance.now();
    if (lg.last > 0 && now - lg.last > lg.gap) lg.gap = now - lg.last; lg.last = now; lg.frames++;
    if (sc.mode === 'layer') sc._show(g.top === sc);
    sc._place();
    if (!glr.lost) {
      const gl = glr.gl;
      if (this.glGen !== glr.restored) { try { this._programs(); } catch { /* still lost */ } }
      if (this.pPass) {
        const p = this.pPass, w = glr.canvas.width, h = glr.canvas.height, k = Math.min(1, this.t / this.minT);
        if (!this.texF) this._alloc(w, h);   // (after a lost context: the field is made again; the picture of the old night is gone and uBase stands in)
        this._field(gl, this.t, k * k * (3 - 2 * k));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
        gl.useProgram(p.p);
        this._aged(p.u, this.t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this._done(gl);
      }
    }
    if (hctx !== ctx) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, L.hud.width, L.hud.height); hctx.setTransform(g.scale, 0, 0, g.scale, 0, 0); }
    if (sc.hudKind === 'ui') { try { sc.hud.draw(hctx, sc.state); } catch (e) { sc._hudFail(e); } }
    return true;
  }
  /** the GL context was lost: every object of this module is dead (the picture of the old night with them) */
  lost() { this.pPass = this.pWorld = this.pField = this.vao = null; this._dropTex(false); this.glGen = -1; }
  /** the scene is being left */
  release() {
    const sc = this.sc; this.gen++;
    if (this.on) this._end();
    if (sc.glr && !sc.glr.lost) { const gl = sc.glr.gl; try { for (const p of [this.pPass, this.pWorld, this.pField]) if (p) gl.deleteProgram(p.p); if (this.vao) gl.deleteVertexArray(this.vao); } catch { /* lost */ } }
    this.pPass = this.pWorld = this.pField = this.vao = null;
    try { this._ch.port1.onmessage = null; this._ch.port1.close(); this._ch.port2.close(); } catch { /* no channel */ }
    for (const r of this._yq.splice(0)) r();
  }
  info() { const L = this.log; return { on: this.on, phase: this.phase, t: +this.t.toFixed(3), bytes: this.bytes, frozen: this.frozen, size: [this.w, this.h], programs: !!this.pPass, log: { ...L } }; }
}
