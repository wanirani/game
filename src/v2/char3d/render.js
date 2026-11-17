// v2 char3d — 스킨 메시 그리기 (WebGL1/2 공용, GLSL ES 1.00). 라이브러리 없음. docs/v2/CHAR3D_PILOT.md §4
// 남의 GL 컨텍스트(시범판 B 의 glr)에 얹혀 돈다: 자기 프로그램·버퍼만 쓰고, draw 가 끝나면 켠 속성 배열(4번)을 끄고 돌아간다.
//   호출한 쪽은 draw 뒤에 자기 프로그램·버퍼·속성 포인터를 다시 잡아야 한다 (glr: useProgram + _attribs).
// 정점 40바이트: 위치 3f · 법선 3f · uv 2f · 뼈 번호 4ub · 가중치 4ub(정규화).
// 뼈 행렬은 3×4(행 우선) vec4 3개씩 uniform 배열로 올린다 (뼈 24개 = vec4 72개; WebGL 최소 보장 안쪽).

const STRIDE = 40;
const VS = (maxJ) => `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUV; attribute vec4 aJ; attribute vec4 aW;
uniform mat4 uVP; uniform mat4 uM; uniform vec4 uJ[${maxJ * 3}]; uniform vec3 uFog;
varying vec2 vUV; varying vec3 vN; varying float vFog; varying vec3 vWP;
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
  vN = (uM * vec4(sn, 0.0)).xyz; vWP = wp.xyz; vUV = aUV;
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
uniform sampler2D uTex; uniform vec3 uFogCol; uniform vec3 uSunDir; uniform vec3 uSun; uniform vec3 uAmb; uniform vec3 uTint;
uniform vec3 uEye; uniform vec4 uRim; uniform vec4 uFx;   // uFx: 번쩍임, 알파, 더하기(1)·보통(0), 단색 섞기
varying vec2 vUV; varying vec3 vN; varying float vFog; varying vec3 vWP;
void main() {
  vec4 t = texture2D(uTex, vUV);
  vec3 n = normalize(vN);
  float nd = dot(n, uSunDir);
  float wrap = clamp(nd * 0.62 + 0.38, 0.0, 1.0);                 // 부드럽게 감기는 빛 (그림에 이미 음영이 들어 있다)
  vec3 v = normalize(uEye - vWP);
  float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.6) * clamp(n.y * 0.5 + 0.75, 0.0, 1.0);
  vec3 rgb = t.rgb * uTint * (uAmb + uSun * wrap) + uRim.rgb * rim * uRim.a;
  rgb = mix(rgb, vec3(1.0), uFx.x);
  rgb = mix(rgb, uTint, uFx.w);
  rgb = mix(rgb, uFogCol, vFog);
  float a = uFx.y;
  gl_FragColor = vec4(rgb * a, a * (1.0 - uFx.z));
}`;

const UNI = ['uVP', 'uM', 'uJ', 'uFog', 'uTex', 'uFogCol', 'uSunDir', 'uSun', 'uAmb', 'uTint', 'uEye', 'uRim', 'uFx'];

export class CharRenderer {
  /** gl: WebGL1/2 컨텍스트. maxJoints: 뼈 수 상한 (기본 32) */
  constructor(gl, { maxJoints = 32 } = {}) {
    this.gl = gl; this.maxJ = maxJoints; this.models = []; this.stats = { draws: 0, tris: 0, texBytes: 0, bufBytes: 0 };
    this._id = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
    this._init();
  }
  _init() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('char3d GLSL: ' + gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS(this.maxJ))); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    ['aPos', 'aNrm', 'aUV', 'aJ', 'aW'].forEach((n, i) => gl.bindAttribLocation(pr, i, n));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('char3d link: ' + gl.getProgramInfoLog(pr));
    this.prog = pr; this.u = {};
    for (const n of UNI) this.u[n] = gl.getUniformLocation(pr, n === 'uJ' ? 'uJ[0]' : n);
    this.stats.texBytes = 0; this.stats.bufBytes = 0;
    for (const m of this.models) this._upload(m);
  }
  /** 컨텍스트를 되찾은 뒤 부른다 */
  restore() { this._init(); }
  /**
   * 모델(glb.js buildModel + bitmaps) → GPU 자원. opts: {maxTex(텍스처 한 변 상한), mip}
   * 스킨이 없는 모델도 된다 (뼈 0번 = 단위 행렬).
   */
  add(model, opts = {}) {
    const m = { model, opts, prims: [], tex: [] };
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
      m.prims.push({ data: ab, idx: p.idx, count: p.idx.length, image: p.image, color: p.color, vbo: null, ibo: null, u32: p.idx instanceof Uint32Array });
    }
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
    const maxGL = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048, cap = Math.min(m.opts.maxTex ?? 2048, maxGL);
    m.tex = (m.model.bitmaps ?? []).map((bm) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      let src = bm, w = bm ? bm.width : 1, h = bm ? bm.height : 1;
      if (bm && (w > cap || h > cap) && typeof document !== 'undefined') {   // 너무 크면 줄여서 올린다
        const k = cap / Math.max(w, h), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height;
      }
      const pm = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), fy = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, pm); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, fy);
      const pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0, gl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      const mip = (m.opts.mip ?? true) && (pot || gl2);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      if (mip) gl.generateMipmap(gl.TEXTURE_2D);
      this.stats.texBytes += Math.round(w * h * 4 * (mip ? 1.34 : 1));
      return { tex: t, w, h };
    });
    if (!this.white) {
      this.white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.white);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
  }
  /** 한 프레임에 한 번: 카메라 · 빛 · 안개. env: {vp(16), eye[3], fog:{near,far,max,color[3]}, sunDir[3], sun[3], amb[3]} */
  begin(env) {
    const gl = this.gl, u = this.u;
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(u.uVP, false, env.vp);
    gl.uniform3f(u.uFog, env.fog.near, env.fog.far, env.fog.max);
    gl.uniform3fv(u.uFogCol, env.fog.color);
    const d = env.sunDir, l = Math.hypot(d[0], d[1], d[2]) || 1;
    gl.uniform3f(u.uSunDir, d[0] / l, d[1] / l, d[2] / l);
    gl.uniform3fv(u.uSun, env.sun); gl.uniform3fv(u.uAmb, env.amb);
    gl.uniform3fv(u.uEye, env.eye);
    gl.uniform1i(u.uTex, 0); gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    this.stats.draws = 0; this.stats.tris = 0;
  }
  /**
   * 모델 하나. jm: 뼈 행렬(Rig.jm, 12n) 또는 null(단위). M: 세계 행렬 16칸.
   * o: {tint[3], flash, alpha, add(더하기 섞기), solid(단색 비율), rim[4], cull:'back'|'front'|'none', depthWrite}
   */
  draw(m, jm, M, o = {}) {
    const gl = this.gl, u = this.u;
    const j = jm ?? this._id;
    gl.uniform4fv(u.uJ, j.length > this.maxJ * 12 ? j.subarray(0, this.maxJ * 12) : j);
    gl.uniformMatrix4fv(u.uM, false, M);
    const tint = o.tint ?? [1, 1, 1], alpha = o.alpha ?? 1, blend = alpha < 1 || !!o.add;
    gl.uniform4f(u.uFx, o.flash ?? 0, alpha, o.add ? 1 : 0, o.solid ?? 0);
    const rim = o.rim ?? [0.55, 0.65, 0.9, 0.35]; gl.uniform4f(u.uRim, rim[0], rim[1], rim[2], rim[3]);
    if (blend) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
    gl.depthMask(o.depthWrite ?? !blend);
    const cull = o.cull ?? 'back';
    if (cull === 'none') gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(cull === 'front' ? gl.FRONT : gl.BACK); }
    for (let k = 0; k < 5; k++) gl.enableVertexAttribArray(k);
    for (const p of m.prims) {
      if (!p.vbo) continue;
      if (p.u32 && !this._u32ok()) continue;
      gl.bindTexture(gl.TEXTURE_2D, (p.image >= 0 && m.tex[p.image]?.tex) || this.white);
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
    gl.disableVertexAttribArray(4);
  }
  _u32ok() { if (this._u32 == null) { const gl = this.gl; this._u32 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) || !!gl.getExtension('OES_element_index_uint'); } return this._u32; }
  /** 그리기를 끝낸다: 다른 렌더러가 기대하는 기본 상태로 */
  end() { const gl = this.gl; gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); gl.depthMask(true); gl.cullFace(gl.BACK); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
  destroy() {
    const gl = this.gl;
    try {
      for (const m of this.models) { for (const p of m.prims) { if (p.vbo) gl.deleteBuffer(p.vbo); if (p.ibo) gl.deleteBuffer(p.ibo); } for (const t of m.tex) if (t.tex) gl.deleteTexture(t.tex); }
      if (this.white) gl.deleteTexture(this.white);
      if (this.prog) gl.deleteProgram(this.prog);
    } catch { /* 이미 잃은 컨텍스트 */ }
    this.models.length = 0; this.white = null;
  }
}

/** 단색 상자들로 만든 작은 소품 모델 (무기 등). parts: [{min[3], max[3], color[3]}] → buildModel 과 같은 모양 (텍스처 없음: 정점색 대신 부품별 프림) */
export function boxModel(parts) {
  const prims = [];
  for (const b of parts) {
    const [x0, y0, z0] = b.min, [x1, y1, z1] = b.max, pos = [], nrm = [], idx = [];
    const face = (n, a, c, d, e) => { const o = pos.length / 3; pos.push(...a, ...c, ...d, ...e); for (let k = 0; k < 4; k++) nrm.push(...n); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
    face([0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); face([0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    face([1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); face([-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    face([0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); face([0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    prims.push({ pos: new Float32Array(pos), nrm: new Float32Array(nrm), uv: null, joints: null, weights: null, idx: new Uint16Array(idx), image: -1, color: [...b.color, 1] });
  }
  return { nodes: [], order: [], skin: null, prims, images: [], bitmaps: [], anims: [], stats: {} };
}
