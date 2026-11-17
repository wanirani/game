// 시범판 B — 작은 WebGL 렌더러 (손으로 쓴 것, 라이브러리 없음). docs/v2/proto_b.md §2
// 셰이더 1개 · 정점 형식 1개(28바이트: 위치 3f, uv 2f, 색 4ub(×2), 부가 4ub[섞기, 번쩍임, 깊이 당김, 안개]).
// 텍스처는 모두 미리 곱한 알파 → blendFunc(ONE, ONE_MINUS_SRC_ALPHA) 하나로 보통 그림과 더하기 빛을 같이 그린다.
// WebGL2 를 먼저 시도하고 없으면 WebGL1 (GLSL ES 1.00 만 쓴다). 컨텍스트를 잃으면 lost = true, 돌아오면 자원을 다시 만든다.
import { VERT_BYTES } from './world.js';

const VS = `
attribute vec3 aPos; attribute vec2 aUV; attribute vec4 aCol; attribute vec4 aExt;
uniform mat4 uVP; uniform vec3 uFog; uniform float uBiasK;
varying vec2 vUV; varying vec4 vCol; varying vec3 vExt;
void main() {
  vec4 p = uVP * vec4(aPos, 1.0);
  float f = clamp((p.w - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  p.z -= aExt.z * 255.0 * uBiasK;
  gl_Position = p; vUV = aUV; vCol = aCol * 1.9921875;
  vExt = vec3(aExt.x, aExt.y, f * (2.0 - f) * uFog.z * aExt.w);
}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform vec3 uFogCol;
varying vec2 vUV; varying vec4 vCol; varying vec3 vExt;
void main() {
  vec4 t = texture2D(uTex, vUV);
  vec3 rgb = mix(t.rgb * vCol.rgb, vec3(t.a), vExt.y) * vCol.a;
  float a = t.a * vCol.a * vExt.x;
  gl_FragColor = vec4(mix(rgb, uFogCol * a, vExt.z), a);
}`;

export class GLR {
  /** 실패하면 예외 (WebGL 없음) */
  constructor() {
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    const opts = { alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', desynchronized: false };
    let gl = null, v2 = false;
    try { gl = cv.getContext('webgl2', opts); v2 = !!gl; } catch { gl = null; }
    if (!gl) { try { gl = cv.getContext('webgl', opts) || cv.getContext('experimental-webgl', opts); } catch { gl = null; } }
    if (!gl) throw new Error('WebGL 을 쓸 수 없습니다');
    this.canvas = cv; this.gl = gl; this.webgl2 = v2; this.lost = false; this.restored = 0;
    this.texList = [];        // {tex, src(), w, h, opts, bytes} — 컨텍스트 복구 때 src() 로 다시 올린다
    this.meshList = [];       // {buf, data, count}
    this.stats = { draws: 0, tris: 0, texBytes: 0, bufBytes: 0, uploads: 0, uploadPx: 0 };
    this._onLost = (e) => { e.preventDefault(); this.lost = true; };
    this._onRestored = () => { try { this._initGL(); this.lost = false; this.restored++; } catch (err) { console.error('[v2b] GL 복구 실패', err); } };
    cv.addEventListener('webglcontextlost', this._onLost, false);
    cv.addEventListener('webglcontextrestored', this._onRestored, false);
    this.dyn = { cap: 0, buf: null, ab: null, f: null, u: null };
    this._growDyn(900 * 6);
    this._initGL();
  }
  _growDyn(verts) {
    const d = this.dyn; d.cap = verts; d.ab = new ArrayBuffer(verts * VERT_BYTES); d.f = new Float32Array(d.ab); d.u = new Uint8Array(d.ab);
    if (d.buf && !this.lost) { const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, d.buf); gl.bufferData(gl.ARRAY_BUFFER, d.ab.byteLength, gl.DYNAMIC_DRAW); }
  }
  _initGL() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('GLSL: ' + gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    ['aPos', 'aUV', 'aCol', 'aExt'].forEach((n, i) => gl.bindAttribLocation(pr, i, n));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('GL link: ' + gl.getProgramInfoLog(pr));
    this.prog = pr;
    this.u = { vp: gl.getUniformLocation(pr, 'uVP'), fog: gl.getUniformLocation(pr, 'uFog'), fogCol: gl.getUniformLocation(pr, 'uFogCol'), bias: gl.getUniformLocation(pr, 'uBiasK'), tex: gl.getUniformLocation(pr, 'uTex') };
    gl.useProgram(pr); gl.uniform1i(this.u.tex, 0);
    for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.frontFace(gl.CCW); gl.cullFace(gl.BACK);
    this.dyn.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dyn.buf); gl.bufferData(gl.ARRAY_BUFFER, this.dyn.ab.byteLength, gl.DYNAMIC_DRAW);
    this.stats.texBytes = 0; this.stats.bufBytes = this.dyn.ab.byteLength;
    for (const m of this.meshList) this._uploadMesh(m);
    for (const t of this.texList) this._uploadTex(t);
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  }
  info() {
    const gl = this.gl; let r = '';
    try { const e = gl.getExtension('WEBGL_debug_renderer_info'); r = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { r = '?'; }
    return { api: this.webgl2 ? 'webgl2' : 'webgl1', renderer: String(r), maxTex: this.maxTex };
  }
  // ── 자원 ──
  mesh(data, count) { const m = { buf: null, data, count }; this.meshList.push(m); if (!this.lost) this._uploadMesh(m); return m; }
  _uploadMesh(m) { const gl = this.gl; m.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.buf); gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW); this.stats.bufBytes += m.data.byteLength; }
  /** src: () => 캔버스·이미지 (복구 때 다시 부른다). opts: {repeat, mip, w, h(빈 텍스처 크기), dynamic} */
  texture(src, opts = {}) { const t = { tex: null, src, opts, w: 0, h: 0, bytes: 0 }; this.texList.push(t); if (!this.lost) this._uploadTex(t); return t; }
  _uploadTex(t) {
    const gl = this.gl, o = t.opts;
    t.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t.tex);
    const s = t.src ? t.src() : null;
    if (o.w) { t.w = o.w; t.h = o.h; gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, o.w, o.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); if (s) this.update(t, s, s.height); } else { t.w = s.width; t.h = s.height; gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, s); }
    const wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    if (o.mip) gl.generateMipmap(gl.TEXTURE_2D);
    t.bytes = Math.round(t.w * t.h * 4 * (o.mip ? 1.34 : 1)); this.stats.texBytes += t.bytes;
  }
  /** 동적 텍스처 갱신: 캔버스의 위쪽 usedH 줄만 올린다 (WebGL1 은 통째로) */
  update(t, canvas, usedH) {
    if (this.lost || !t.tex) return;
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t.tex);
    const h = Math.max(1, Math.min(canvas.height, Math.ceil(usedH)));
    if (this.webgl2) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, canvas.width, h, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    this.stats.uploads++; this.stats.uploadPx = canvas.width * (this.webgl2 ? h : canvas.height);
  }
  // ── 프레임 ──
  resize(w, h) { const cv = this.canvas; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
  begin(vp, fog, clear, A = 1) {
    const gl = this.gl, cv = this.canvas;
    this.stats.draws = 0; this.stats.tris = 0; this.stats.uploads = 0;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.clearColor(clear[0], clear[1], clear[2], 1); gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.vp, false, vp);
    gl.uniform3f(this.u.fog, fog.near, fog.far, fog.max);
    gl.uniform3f(this.u.fogCol, fog.color[0], fog.color[1], fog.color[2]);
    gl.uniform1f(this.u.bias, A);   // 깊이 당김: 클립 z = A·(뷰 깊이) + B 이므로 d 만큼 당기려면 A·d 를 뺀다
    gl.activeTexture(gl.TEXTURE0);
  }
  _attribs() {
    const gl = this.gl;
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, VERT_BYTES, 0);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, VERT_BYTES, 12);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, VERT_BYTES, 20);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, VERT_BYTES, 24);
  }
  /** 불투명 세계 메시 */
  drawMesh(m, t) {
    const gl = this.gl; if (!m.buf || !t.tex) return;
    gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE); gl.depthMask(true);
    gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.bindBuffer(gl.ARRAY_BUFFER, m.buf); this._attribs();
    gl.drawArrays(gl.TRIANGLES, 0, m.count);
    this.stats.draws++; this.stats.tris += m.count / 3;
  }
  /** 동적 스프라이트 묶음 (dyn 버퍼의 first..first+count 정점). depth: 깊이 시험 여부 */
  uploadDyn(verts) { const gl = this.gl, d = this.dyn; gl.bindBuffer(gl.ARRAY_BUFFER, d.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, d.u.subarray(0, verts * VERT_BYTES)); this._attribs(); }
  drawDyn(t, first, count, depthTest = true) {
    const gl = this.gl; if (!count || !t.tex) return;
    gl.enable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.depthMask(false);
    if (depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.drawArrays(gl.TRIANGLES, first, count);
    if (!depthTest) gl.enable(gl.DEPTH_TEST);
    this.stats.draws++; this.stats.tris += count / 3;
  }
  finish() { this.gl.finish(); }
  destroy() {
    const gl = this.gl, cv = this.canvas;
    cv.removeEventListener('webglcontextlost', this._onLost, false); cv.removeEventListener('webglcontextrestored', this._onRestored, false);
    try {
      for (const t of this.texList) if (t.tex) gl.deleteTexture(t.tex);
      for (const m of this.meshList) if (m.buf) gl.deleteBuffer(m.buf);
      if (this.dyn.buf) gl.deleteBuffer(this.dyn.buf);
      if (this.prog) gl.deleteProgram(this.prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();   // 드로잉 버퍼·컨텍스트를 바로 돌려준다
    } catch { /* 이미 잃은 컨텍스트 */ }
    this.texList.length = 0; this.meshList.length = 0;
    cv.width = 1; cv.height = 1;
    this.lost = true;
  }
}

/** 동적 정점 쓰기 (스프라이트 한 장 = 정점 6개) */
export class SpriteBatch {
  constructor(glr) { this.glr = glr; this.n = 0; }
  reset() { this.n = 0; }
  /** 네 꼭짓점(왼아래, 오른아래, 오른위, 왼위) 세계 좌표 + uv 사각형 + 색 */
  quad(p, u0, v0, u1, v1, r, g, b, a, mode = 1, flash = 0, bias = 0, fog = 1) {
    const d = this.glr.dyn;
    if (this.n + 6 > d.cap) { const old = d.u; this.glr._growDyn(d.cap * 2); this.glr.dyn.u.set(old); }
    const f = this.glr.dyn.f, u = this.glr.dyn.u;
    const q = (k) => (k <= 0 ? 0 : k >= 2 ? 255 : (k * 127.5 + 0.5) | 0), q1 = (k) => (k <= 0 ? 0 : k >= 1 ? 255 : (k * 255 + 0.5) | 0);
    const cr = q(r), cg = q(g), cb = q(b), ca = q(a), e0 = q1(mode), e1 = q1(flash), e2 = bias | 0, e3 = q1(fog);
    const put = (i, uu, vv) => {
      const o = this.n * 7, c = this.n * VERT_BYTES + 20;
      f[o] = p[i * 3]; f[o + 1] = p[i * 3 + 1]; f[o + 2] = p[i * 3 + 2]; f[o + 3] = uu; f[o + 4] = vv;
      u[c] = cr; u[c + 1] = cg; u[c + 2] = cb; u[c + 3] = ca; u[c + 4] = e0; u[c + 5] = e1; u[c + 6] = e2; u[c + 7] = e3;
      this.n++;
    };
    put(0, u0, v1); put(1, u1, v1); put(2, u1, v0); put(0, u0, v1); put(2, u1, v0); put(3, u0, v0);
  }
}
