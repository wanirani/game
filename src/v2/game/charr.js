// v2g character renderer — skinned meshes on the scene's GL context (WebGL1/2, GLSL ES 1.00).
// Grown from src/v2/char3d/render.js (that file stays frozen for the prototypes). What is new here:
//   - draw() reads a caller-owned options object and never allocates (no spread, no default arrays)
//   - hurt flash, ash dissolve (fx noise texture) and up to 4 fx point lights (per vertex)
//   - textures are shrunk to the cap once at add() and the big decoded bitmaps are released
//   - skinned and rigid models share one program; rigid ones pass jm = null
// Vertex = 40 bytes: pos 3f, normal 3f, uv 2f, joints 4ub, weights 4ub (normalised).
// After draw()/end() the caller must re-bind its own program, buffers and attribute pointers.

const STRIDE = 40, NL = 4;
const VS = (maxJ) => `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUV; attribute vec4 aJ; attribute vec4 aW;
uniform mat4 uVP; uniform mat4 uM; uniform vec4 uJ[${maxJ * 3}]; uniform vec3 uFog;
uniform vec4 uLP[${NL}]; uniform vec4 uLC[${NL}];
varying vec2 vUV; varying vec3 vN; varying float vFog; varying vec3 vWP; varying vec3 vLit;
void main() {
  vec4 p = vec4(aPos, 1.0); vec3 sp = vec3(0.0); vec3 sn = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    int j = int(aJ[k] + 0.5) * 3; float w = aW[k];
    vec4 r0 = uJ[j]; vec4 r1 = uJ[j + 1]; vec4 r2 = uJ[j + 2];
    sp += w * vec3(dot(r0, p), dot(r1, p), dot(r2, p));
    sn += w * vec3(dot(r0.xyz, aNrm), dot(r1.xyz, aNrm), dot(r2.xyz, aNrm));
  }
  float ws = aW.x + aW.y + aW.z + aW.w; sp /= max(ws, 0.0001);
  vec4 wp = uM * vec4(sp, 1.0);
  vec3 n = normalize((uM * vec4(sn, 0.0)).xyz);
  vec3 lit = vec3(0.0);
  for (int i = 0; i < ${NL}; i++) {
    vec3 d = uLP[i].xyz - wp.xyz; float q = dot(d, d) / (uLP[i].w * uLP[i].w + 0.0001);
    float a = max(0.0, 1.0 - q); a *= a;
    lit += uLC[i].rgb * (a * (0.4 + 0.6 * max(dot(n, d * inversesqrt(dot(d, d) + 1.0)), 0.0)));
  }
  vN = n; vWP = wp.xyz; vUV = aUV; vLit = lit;
  vec4 c = uVP * wp;
  float f = clamp((c.w - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  vFog = f * (2.0 - f) * uFog.z;
  gl_Position = c;
}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform sampler2D uNoise;
uniform vec3 uFogCol; uniform vec3 uSunDir; uniform vec3 uSun; uniform vec3 uAmb; uniform vec3 uTint;
uniform vec3 uEye; uniform vec4 uRim; uniform vec4 uFx;   // uFx: flash, alpha, additive(1)/normal(0), solid mix
uniform vec4 uDis;                                        // dissolve 0..1, edge width, noise scale, seed
varying vec2 vUV; varying vec3 vN; varying float vFog; varying vec3 vWP; varying vec3 vLit;
void main() {
  vec4 t = texture2D(uTex, vUV);
  float edge = 0.0;
  if (uDis.x > 0.0) {
    float nz = texture2D(uNoise, vWP.xy * uDis.z + vec2(vWP.z * uDis.z, uDis.w)).r * 0.75 + texture2D(uNoise, vWP.xy * uDis.z * 3.1).b * 0.25;
    float th = uDis.x * 1.08 - (vWP.y * 0.0025);
    if (nz < th) discard;
    edge = 1.0 - smoothstep(th, th + uDis.y, nz);
  }
  vec3 n = normalize(vN);
  float wrap = clamp(dot(n, uSunDir) * 0.62 + 0.38, 0.0, 1.0);
  vec3 v = normalize(uEye - vWP);
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6) * clamp(n.y * 0.5 + 0.75, 0.0, 1.0);
  vec3 rgb = t.rgb * (uTint * (uAmb + uSun * wrap) + vLit) + uRim.rgb * rim * uRim.a;
  rgb = mix(rgb, vec3(1.0), uFx.x);
  rgb = mix(rgb, uTint, uFx.w);
  rgb = mix(rgb, uFogCol, vFog);
  rgb += vec3(2.4, 1.1, 0.35) * edge * edge;
  float a = uFx.y;
  gl_FragColor = vec4(rgb * a, a * (1.0 - uFx.z));
}`;

const UNI = ['uVP', 'uM', 'uJ', 'uFog', 'uTex', 'uNoise', 'uFogCol', 'uSunDir', 'uSun', 'uAmb', 'uTint', 'uEye', 'uRim', 'uFx', 'uDis', 'uLP', 'uLC'];
const WHITE3 = [1, 1, 1], RIM0 = [0.55, 0.65, 0.9, 0.35], ZERO16 = new Float32Array(NL * 4);
/** Reusable draw options (callers keep one and mutate it). */
export const drawOpts = () => ({ tint: [1, 1, 1], flash: 0, alpha: 1, add: false, solid: 0, rim: [0.55, 0.65, 0.9, 0.35], dis: 0, seed: 0, cull: 1 });

export class CharRenderer {
  constructor(gl, { maxJoints = 24 } = {}) {
    this.gl = gl; this.maxJ = maxJoints; this.models = []; this.stats = { draws: 0, tris: 0, texBytes: 0, bufBytes: 0 };
    this._id = new Float32Array(maxJoints * 12); for (let i = 0; i < maxJoints; i++) { this._id[i * 12] = 1; this._id[i * 12 + 5] = 1; this._id[i * 12 + 10] = 1; }
    this.gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.u32 = this.gl2 || !!gl.getExtension('OES_element_index_uint');
    this.noise = null; this.white = null;
    this._init();
  }
  _init() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('charr GLSL: ' + gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS(this.maxJ))); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    ['aPos', 'aNrm', 'aUV', 'aJ', 'aW'].forEach((n, i) => gl.bindAttribLocation(pr, i, n));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('charr link: ' + gl.getProgramInfoLog(pr));
    this.prog = pr; this.u = {};
    for (const n of UNI) this.u[n] = gl.getUniformLocation(pr, n === 'uJ' || n === 'uLP' || n === 'uLC' ? n + '[0]' : n);
    gl.useProgram(pr); gl.uniform1i(this.u.uTex, 0); gl.uniform1i(this.u.uNoise, 1);
    this.stats.texBytes = 0; this.stats.bufBytes = 0;
    this.white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.white);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    for (const m of this.models) this._upload(m);
  }
  /** after the context came back */
  restore() { this._init(); }
  /**
   * model (glb.js buildModel + bitmaps) -> GPU model. opts: {maxTex, mip}. The model's bitmaps are replaced by
   * canvases no larger than maxTex (kept for context restore); ImageBitmaps are closed.
   */
  add(model, opts = {}) {
    const m = { model, opts, prims: [], tex: [], srcs: [], tris: 0 };
    for (const p of model.prims) {
      const n = p.pos.length / 3, ab = new ArrayBuffer(n * STRIDE), f = new Float32Array(ab), u = new Uint8Array(ab);
      for (let i = 0; i < n; i++) {
        const o = i * 10, b = i * STRIDE + 32;
        f[o] = p.pos[i * 3]; f[o + 1] = p.pos[i * 3 + 1]; f[o + 2] = p.pos[i * 3 + 2];
        if (p.nrm) { f[o + 3] = p.nrm[i * 3]; f[o + 4] = p.nrm[i * 3 + 1]; f[o + 5] = p.nrm[i * 3 + 2]; } else f[o + 4] = 1;
        if (p.uv) { f[o + 6] = p.uv[i * 2]; f[o + 7] = p.uv[i * 2 + 1]; }
        if (p.joints) {
          let s = 0; for (let k = 0; k < 4; k++) s += p.weights[i * 4 + k];
          for (let k = 0; k < 4; k++) { u[b + k] = Math.min(this.maxJ - 1, p.joints[i * 4 + k]); u[b + 4 + k] = Math.round((p.weights[i * 4 + k] / (s || 1)) * 255); }
        } else { u[b + 4] = 255; }
      }
      m.prims.push({ data: ab, idx: p.idx, count: p.idx.length, image: p.image, color: [p.color[0], p.color[1], p.color[2]], vbo: null, ibo: null, u32: p.idx instanceof Uint32Array });
      m.tris += p.idx.length / 3;
    }
    const cap = Math.min(opts.maxTex ?? 1024, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) || 2048);
    for (const bm of model.bitmaps ?? []) {
      if (!bm) { m.srcs.push(null); continue; }
      const k = Math.min(1, cap / Math.max(bm.width, bm.height));
      if (k >= 1 && typeof HTMLCanvasElement !== 'undefined' && bm instanceof HTMLCanvasElement) { m.srcs.push(bm); continue; }
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bm.width * k)); c.height = Math.max(1, Math.round(bm.height * k));
      c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
      try { bm.close?.(); } catch { /* not an ImageBitmap */ }
      m.srcs.push(c);
    }
    model.bitmaps = null;
    this.models.push(m); this._upload(m);
    return m;
  }
  _upload(m) {
    const gl = this.gl;
    for (const p of m.prims) {
      p.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, p.vbo); gl.bufferData(gl.ARRAY_BUFFER, p.data, gl.STATIC_DRAW);
      p.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, p.idx, gl.STATIC_DRAW);
      this.stats.bufBytes += p.data.byteLength + p.idx.byteLength;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    const pm = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), fy = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    m.tex = m.srcs.map((src) => {
      if (!src) return null;
      const t = gl.createTexture(), w = src.width, h = src.height; gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0, mip = (m.opts.mip ?? true) && (pot || this.gl2);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      this.stats.texBytes += Math.round(w * h * 4 * (mip ? 1.34 : 1));
      return t;
    });
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, pm); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, fy);
  }
  /**
   * once per frame. env: {vp(16), eye[3], fog:{near,far,max,color[3]}, sunDir[3] (unit), sun[3], amb[3]},
   * noiseTex: fx.tex.noise or null, lp/lc: fx.lights.pos/.col (Float32Array, first 16 floats used) or null
   */
  begin(env, noiseTex = null, lp = null, lc = null) {
    const gl = this.gl, u = this.u;
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(u.uVP, false, env.vp);
    gl.uniform3f(u.uFog, env.fog.near, env.fog.far, env.fog.max);
    gl.uniform3fv(u.uFogCol, env.fog.color);
    gl.uniform3fv(u.uSunDir, env.sunDir); gl.uniform3fv(u.uSun, env.sun); gl.uniform3fv(u.uAmb, env.amb);
    gl.uniform3fv(u.uEye, env.eye);
    gl.uniform4fv(u.uLP, lp ? lp.subarray(0, NL * 4) : ZERO16); gl.uniform4fv(u.uLC, lc ? lc.subarray(0, NL * 4) : ZERO16);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, noiseTex ?? this.white); gl.activeTexture(gl.TEXTURE0);
    this.hasNoise = !!noiseTex;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    for (let k = 0; k < 5; k++) gl.enableVertexAttribArray(k);
    this.stats.draws = 0; this.stats.tris = 0;
  }
  /** one model. jm: joint matrices (Rig.jm) or null. M: world matrix. o: drawOpts() object (or null for defaults) */
  draw(m, jm, M, o) {
    const gl = this.gl, u = this.u;
    gl.uniform4fv(u.uJ, jm ?? this._id);
    gl.uniformMatrix4fv(u.uM, false, M);
    const tint = o ? o.tint : WHITE3, alpha = o ? o.alpha : 1, add = !!(o && o.add), blend = alpha < 1 || add, rim = o ? o.rim : RIM0;
    gl.uniform4f(u.uFx, o ? o.flash : 0, alpha, add ? 1 : 0, o ? o.solid : 0);
    gl.uniform4f(u.uRim, rim[0], rim[1], rim[2], rim[3]);
    gl.uniform4f(u.uDis, o && this.hasNoise ? o.dis : 0, 0.12, 0.012, o ? o.seed : 0);
    if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
    gl.depthMask(!blend);
    const cull = o ? o.cull : 1;
    if (!cull) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); }
    const P = m.prims;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (!p.vbo || (p.u32 && !this.u32)) continue;
      gl.bindTexture(gl.TEXTURE_2D, (p.image >= 0 && m.tex[p.image]) || this.white);
      gl.uniform3f(u.uTint, tint[0] * p.color[0], tint[1] * p.color[1], tint[2] * p.color[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.vbo); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, p.ibo);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE, 12);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, STRIDE, 24);
      gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, false, STRIDE, 32);
      gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, STRIDE, 36);
      gl.drawElements(gl.TRIANGLES, p.count, p.u32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
      this.stats.draws++; this.stats.tris += p.count / 3;
    }
  }
  /** back to the state the other renderers expect */
  end() { const gl = this.gl; gl.disableVertexAttribArray(4); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); gl.depthMask(true); gl.cullFace(gl.BACK); gl.disable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
  destroy() {
    const gl = this.gl;
    try {
      for (const m of this.models) { for (const p of m.prims) { if (p.vbo) gl.deleteBuffer(p.vbo); if (p.ibo) gl.deleteBuffer(p.ibo); } for (const t of m.tex) if (t) gl.deleteTexture(t); }
      if (this.white) gl.deleteTexture(this.white);
      if (this.prog) gl.deleteProgram(this.prog);
    } catch { /* context already gone */ }
    for (const m of this.models) for (const c of m.srcs) if (c && 'width' in c) { try { c.width = 1; c.height = 1; } catch { /* ImageBitmap */ } }
    this.models.length = 0; this.white = null;
  }
}
