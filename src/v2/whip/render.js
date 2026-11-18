// v2 whip - WebGL2 renderer: one program, one VAO, one dynamic vertex buffer. The whole whip (handle, braided lash, ferrules, bell shard)
// is ONE draw call; the shard's glow is a second, tiny additive call (opts.glow = false turns it off). docs/v2/WHIP.md §3
// Rides on the scene's GL context: after draw() the caller re-binds its own program and buffers (VAO is left null, blending
// (ONE, ONE_MINUS_SRC_ALPHA), depth test and depth write on, culling off).
import { meshInfo, writeWhipMesh, WHIP_VERT } from './mesh.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aAux; layout(location=2) in vec4 aP;
uniform mat4 uVP; uniform vec3 uEye; uniform vec3 uCamR; uniform vec3 uCamU; uniform vec4 uView; uniform vec3 uFog;
uniform vec4 uLP[4]; uniform vec4 uLC[4];
out vec3 vWP; out vec3 vA; out vec3 vB; out vec3 vT; out vec4 vP; out float vFog; out vec3 vLit;
void main() {
  vec3 wp = aPos; vec3 A = aAux; vec3 B = vec3(0.0); float kind = aP.w; float rr = aP.z;
  if (kind < 1.5) {
    vec3 te = normalize(uEye - aPos);
    vec3 side = cross(aAux, te); float sl = length(side); side = sl > 0.0001 ? side / sl : uCamR;
    vec4 c0 = uVP * vec4(aPos, 1.0); vec4 c1 = uVP * vec4(aPos + uCamU, 1.0);
    float ppu = length((c1.xy / c1.w - c0.xy / c0.w) * uView.xy) * 0.5;
    rr = max(aP.z, uView.z * 0.5 / max(ppu, 0.0001)) + 0.6 / max(ppu, 0.0001);   // never thinner than uView.z px; + a soft edge of about half a pixel
    wp = aPos + side * (aP.y * rr);
    A = side; B = te;
  } else if (kind > 5.0) {
    wp = aPos + (uCamR * aP.x + uCamU * aP.y) * aP.z;
  }
  vec3 lit = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 d = uLP[i].xyz - aPos; float q = dot(d, d) / (uLP[i].w * uLP[i].w + 0.0001);
    float a = max(0.0, 1.0 - q); lit += uLC[i].rgb * (a * a);
  }
  vWP = wp; vA = A; vB = B; vT = aAux; vP = vec4(aP.x, aP.y, rr, kind); vLit = lit;
  vec4 c = uVP * vec4(wp, 1.0);
  float f = clamp((c.w - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  vFog = f * (2.0 - f) * uFog.z;
  gl_Position = c;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vWP; in vec3 vA; in vec3 vB; in vec3 vT; in vec4 vP; in float vFog; in vec3 vLit;
uniform vec3 uEye; uniform vec3 uSunDir; uniform vec3 uSun; uniform vec3 uAmb; uniform vec3 uFogCol;
uniform vec4 uGlow; uniform vec4 uFx; uniform vec4 uTone;   // uFx: taut, time, flash, alpha   uTone: leather tint rgb, rim strength
out vec4 o;
void main() {
  float kind = vP.w;
  if (kind > 5.0) {
    float d = length(vP.xy); float a = pow(max(0.0, 1.0 - d), 2.4);
    float g = max(0.0, 1.0 - abs(vP.x) * 10.0) * max(0.0, 1.0 - abs(vP.y) * 1.15) + max(0.0, 1.0 - abs(vP.y) * 10.0) * max(0.0, 1.0 - abs(vP.x) * 1.15);
    o = vec4(uGlow.rgb * ((a * 0.9 + g * 0.55) * uGlow.a * uFx.w), 0.0); return;
  }
  vec3 V = normalize(uEye - vWP); vec3 n; vec3 base; float spec; float sh; float edge = 1.0; vec3 emis = vec3(0.0); float rimK = uTone.a;
  if (kind < 1.5) {
    float v = vP.y; float av = abs(v);
    float w = max(fwidth(v) * 1.3, 0.02); edge = 1.0 - smoothstep(1.0 - w, 1.0, av);
    float hgt = sqrt(max(0.0, 1.0 - v * v));
    vec3 side = normalize(vA); vec3 te = normalize(vB); vec3 T = normalize(vT);
    n = side * v + te * hgt;
    float ang = asin(clamp(v, -1.0, 1.0)) * 0.6366;             // -1..1 around the visible half
    float ch = fract(vP.x * 0.30 + abs(ang) * 0.85);             // plait: chevrons pointing down the lash
    float strand = smoothstep(0.0, 0.2, ch) * (1.0 - smoothstep(0.78, 1.0, ch));
    float seam = smoothstep(0.02, 0.16, abs(ang));
    float bump = strand * (0.45 + 0.55 * seam);
    float mt = clamp(kind, 0.0, 1.0);
    n = normalize(n + T * ((ch - 0.5) * 0.8 * (1.0 - mt)));
    vec3 leather = mix(uTone.rgb * 0.34, uTone.rgb, bump);
    float wire = step(0.5, fract(vP.x * 0.9));                   // metal parts: fine wire binding
    vec3 metal = mix(vec3(0.42, 0.40, 0.38), vec3(0.80, 0.77, 0.70), wire);
    base = mix(leather, metal, mt); spec = mix(0.35, 1.5, mt); sh = mix(16.0, 54.0, mt);
    float tip = exp(-vP.x * 0.06);
    emis = vec3(1.0, 0.93, 0.78) * (uFx.z * tip * 1.6) + uGlow.rgb * (uGlow.a * tip * 0.25);
    float sm = pow(0.5 + 0.5 * sin(vP.x * 0.085 - uFx.y * 27.0), 12.0);
    emis += vec3(0.75, 0.88, 1.0) * (uFx.x * (0.10 + 0.9 * sm));   // taut: a glint runs down the line
  } else {
    n = normalize(vA); if (dot(n, V) < 0.0) n = -n;
    if (kind < 2.5) {
      float st = fract(vP.x * 0.42 + vP.y);                      // wrapped grip
      float wrapb = smoothstep(0.0, 0.16, st) * (1.0 - smoothstep(0.8, 1.0, st));
      base = mix(vec3(0.07, 0.03, 0.025), vec3(0.33, 0.13, 0.085), wrapb); spec = 0.3; sh = 18.0;
    } else if (kind < 3.5) {
      base = vec3(0.70, 0.52, 0.24); spec = 1.5; sh = 46.0;       // bronze guard, pommel, ferrule
    } else {
      base = vec3(0.62, 0.50, 0.30); spec = 2.6; sh = 80.0; rimK *= 2.0;   // the bell shard
      float fr = pow(1.0 - max(dot(n, V), 0.0), 2.0);
      emis = uGlow.rgb * (uGlow.a * (0.35 + 0.9 * fr)) + vec3(1.0, 0.95, 0.8) * uFx.z;
    }
  }
  float nd = dot(n, uSunDir); float wrap = clamp(nd * 0.6 + 0.4, 0.0, 1.0);
  vec3 H = normalize(uSunDir + V); float s = pow(max(dot(n, H), 0.0), sh) * spec;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.4) * clamp(n.y * 0.5 + 0.8, 0.0, 1.0);
  vec3 light = uAmb + uSun * wrap + vLit;
  vec3 rgb = base * light + (uSun + vLit * 0.8 + uAmb * 0.4) * s + vec3(0.62, 0.72, 0.95) * (rim * rimK) + emis;
  rgb = mix(rgb, uFogCol, vFog * (1.0 - min(1.0, dot(emis, vec3(0.5)))));
  float a = edge * uFx.w;
  if (a < 0.015) discard;
  o = vec4(rgb * a, a);
}`;

const UNI = ['uVP', 'uEye', 'uCamR', 'uCamU', 'uView', 'uFog', 'uLP', 'uLC', 'uSunDir', 'uSun', 'uAmb', 'uFogCol', 'uGlow', 'uFx', 'uTone'];
const ZERO16 = new Float32Array(16);

export class WhipRenderer {
  /** gl: WebGL2. opts: { glow (true), minPx (1.8 = thinnest on-screen lash, px), tone [r,g,b] leather colour, rim (0.5) } */
  constructor(gl, opts = {}) {
    this.gl = gl; this.glow = opts.glow !== false; this.minPx = opts.minPx ?? 1.8; this.rim = opts.rim ?? 0.5; this.alpha = 1;
    this.tone = new Float32Array(opts.tone ?? [0.50, 0.30, 0.17]);
    this.stats = { draws: 0, tris: 0, bufBytes: 0, verts: 0 };
    this.info = null; this.vtx = null; this.tmp = null; this._r = new Float32Array(3); this._u = new Float32Array(3); this._key = '';
    this._init();
  }
  _init() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('whip GLSL: ' + gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('whip link: ' + gl.getProgramInfoLog(pr));
    this.prog = pr; this.u = {};
    for (const n of UNI) this.u[n] = gl.getUniformLocation(pr, n === 'uLP' || n === 'uLC' ? n + '[0]' : n);
    this.vao = gl.createVertexArray(); this.vbo = gl.createBuffer(); this.ibo = gl.createBuffer(); this._key = '';
  }
  _size(whip) {   // buffers for this whip's tier (once per tier)
    const key = whip.n + ':' + whip.sub + ':' + whip.sides; if (key === this._key) return;
    const gl = this.gl, I = meshInfo(whip); this._key = key; this.info = I;
    this.vtx = new Float32Array(I.floats); this.tmp = new Float32Array(whip.n * 3);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferData(gl.ARRAY_BUFFER, this.vtx.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, I.idx, gl.STATIC_DRAW);
    const S = WHIP_VERT * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24);
    gl.bindVertexArray(null);
    this.stats.bufBytes = this.vtx.byteLength + I.idx.byteLength; this.stats.verts = I.verts;
  }
  /** after a context restore */
  restore() { this._init(); }
  /**
   * env: { vp(16), eye[3], fog:{near,far,max,color[3]}, sunDir[3], sun[3], amb[3], viewport:[w,h] (px), lightPos?, lightCol? (4 x vec4, fx.lights.pos/.col) }
   * alpha: display interpolation between the last two ticks, 0..1 (default 1)
   */
  draw(whip, env, alpha) {
    const gl = this.gl, u = this.u;
    this._size(whip);
    writeWhipMesh(whip, this.vtx, alpha, this.tmp);
    gl.useProgram(this.prog); gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vtx);
    const vp = env.vp, R = this._r, U = this._u;
    let l = Math.hypot(vp[0], vp[4], vp[8]) || 1; R[0] = vp[0] / l; R[1] = vp[4] / l; R[2] = vp[8] / l;
    l = Math.hypot(vp[1], vp[5], vp[9]) || 1; U[0] = vp[1] / l; U[1] = vp[5] / l; U[2] = vp[9] / l;
    gl.uniformMatrix4fv(u.uVP, false, vp); gl.uniform3fv(u.uEye, env.eye); gl.uniform3fv(u.uCamR, R); gl.uniform3fv(u.uCamU, U);
    const vw = env.viewport ? env.viewport[0] : gl.drawingBufferWidth, vh = env.viewport ? env.viewport[1] : gl.drawingBufferHeight;
    gl.uniform4f(u.uView, vw, vh, this.minPx, whip.time);
    const f = env.fog; if (f) { gl.uniform3f(u.uFog, f.near, f.far, f.max); gl.uniform3fv(u.uFogCol, f.color); } else { gl.uniform3f(u.uFog, 1e9, 2e9, 0); gl.uniform3f(u.uFogCol, 0, 0, 0); }
    const d = env.sunDir, dl = Math.hypot(d[0], d[1], d[2]) || 1;
    gl.uniform3f(u.uSunDir, d[0] / dl, d[1] / dl, d[2] / dl); gl.uniform3fv(u.uSun, env.sun); gl.uniform3fv(u.uAmb, env.amb);
    gl.uniform4fv(u.uLP, env.lightPos ? (env.lightPos.length > 16 ? env.lightPos.subarray(0, 16) : env.lightPos) : ZERO16);
    gl.uniform4fv(u.uLC, env.lightCol ? (env.lightCol.length > 16 ? env.lightCol.subarray(0, 16) : env.lightCol) : ZERO16);
    const gc = whip.glowCol; gl.uniform4f(u.uGlow, gc[0], gc[1], gc[2], whip.glow + whip.flash * 1.5);
    gl.uniform4f(u.uFx, whip.taut, whip.time, whip.flash, this.alpha);
    gl.uniform4f(u.uTone, this.tone[0], this.tone[1], this.tone[2], this.rim);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const I = this.info;
    gl.drawElements(gl.TRIANGLES, I.nMain, gl.UNSIGNED_SHORT, 0);
    this.stats.draws = 1; this.stats.tris = I.nMain / 3;
    if (this.glow) { gl.depthMask(false); gl.drawElements(gl.TRIANGLES, I.nGlow, gl.UNSIGNED_SHORT, I.nMain * 2); gl.depthMask(true); this.stats.draws = 2; this.stats.tris += 2; }
    gl.bindVertexArray(null);
  }
  destroy() {
    const gl = this.gl;
    try { gl.deleteBuffer(this.vbo); gl.deleteBuffer(this.ibo); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.prog); } catch { /* context already gone */ }
    this._key = '';
  }
}
