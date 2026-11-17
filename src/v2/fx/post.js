// v2 fx — 후처리 (선택). docs/v2/FX.md §5
// post.begin(w, h) → 장면과 효과를 그린다 → post.end(feel.screen).
//   켜짐(mid·high): 장면을 내 프레임버퍼(RGBA8 + 깊이)에 그리게 하고, 밝은 픽셀만 1/4 → 1/8 (→ 1/16) 로 줄였다 되올려 번짐(bloom)을 만든 뒤
//                   합성 1회(번짐 + 부드러운 톤 + 비네트 + 번쩍임 + 가장자리 색 + 채도)로 화면에 낸다.
//   꺼짐(low·off):  begin 은 화면(또는 준 대상)을 그대로 묶고, end 는 번쩍임·가장자리 색이 있을 때만 사각형 한 장을 덧그린다.
// 프레임버퍼·텍스처는 크기가 바뀔 때만 다시 만든다 (프레임마다 만들거나 올리는 것 없음).
import { program } from './engine.js';

const VS = `#version 300 es
out vec2 vUV;
void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUV = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
// 밝은 부분만 뽑으며 1/4 로 줄인다 (2×2 쌍선형 4번 = 4×4 상자)
const FS_BRIGHT = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uTex; uniform vec4 uTP; out vec4 o;   // uTP = (텍셀 x, 텍셀 y, 문턱, 무릎)
void main() {
  vec3 c = texture(uTex, vUV + uTP.xy * vec2(-1.0, -1.0)).rgb + texture(uTex, vUV + uTP.xy * vec2(1.0, -1.0)).rgb + texture(uTex, vUV + uTP.xy * vec2(-1.0, 1.0)).rgb + texture(uTex, vUV + uTP.xy * vec2(1.0, 1.0)).rgb;
  c *= 0.25; float l = max(c.r, max(c.g, c.b)); float w = smoothstep(uTP.z, uTP.z + uTP.w, l);
  o = vec4(c * w, 1.0);
}`;
const FS_DOWN = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uTex; uniform vec4 uTP; out vec4 o;
void main() {
  vec3 c = texture(uTex, vUV + uTP.xy * vec2(-0.5, -0.5)).rgb + texture(uTex, vUV + uTP.xy * vec2(0.5, -0.5)).rgb + texture(uTex, vUV + uTP.xy * vec2(-0.5, 0.5)).rgb + texture(uTex, vUV + uTP.xy * vec2(0.5, 0.5)).rgb;
  o = vec4(c * 0.25, 1.0);
}`;
// 되올리기: 넓은 텐트 4번 (더하기로 섞는다)
const FS_UP = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uTex; uniform vec4 uTP; out vec4 o;
void main() {
  vec3 c = texture(uTex, vUV + uTP.xy * vec2(-1.0, -1.0)).rgb + texture(uTex, vUV + uTP.xy * vec2(1.0, -1.0)).rgb + texture(uTex, vUV + uTP.xy * vec2(-1.0, 1.0)).rgb + texture(uTex, vUV + uTP.xy * vec2(1.0, 1.0)).rgb;
  o = vec4(c * 0.25 * uTP.z, 1.0);
}`;
const FS_COMP = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uScene; uniform sampler2D uBloom;
uniform vec4 uK;      // (번짐 세기, 기본 비네트, 채도 빼기, 어둡게)
uniform vec4 uFlash; uniform vec4 uVig; uniform vec4 uTP; out vec4 o;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  vec3 b = texture(uBloom, vUV + uTP.xy * vec2(-1.0, -1.0)).rgb + texture(uBloom, vUV + uTP.xy * vec2(1.0, 1.0)).rgb;
#ifdef TENT
  b += texture(uBloom, vUV + uTP.xy * vec2(1.0, -1.0)).rgb + texture(uBloom, vUV + uTP.xy * vec2(-1.0, 1.0)).rgb; b *= 0.5;
#endif
  c *= 1.0 - uK.w;                     // 필살기: 장면만 어둡게, 번짐은 그대로
  c += b * (0.26 * uK.x);
  vec3 x = max(c - 0.6, 0.0); c = c - x + x / (1.0 + x * 0.85);   // 밝은 쪽만 부드럽게 눌러 흰색으로 날아가지 않게
  float l = dot(c, vec3(0.3, 0.59, 0.11)); c = mix(c, vec3(l) * vec3(0.92, 0.97, 1.08), uK.z);
  vec2 q = vUV - 0.5; float e = smoothstep(0.38, 0.98, length(q) * 1.28);
  c *= 1.0 - uK.y * e;
  c = mix(c, uVig.rgb, uVig.a * e);
  c = mix(c, uFlash.rgb, uFlash.a);
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;   // 띠 방지
  o = vec4(c, 1.0);
}`;
// 후처리가 꺼졌을 때의 덧칠 (알파 섞기)
const FS_OVER = `#version 300 es
precision mediump float;
in vec2 vUV; uniform vec4 uFlash; uniform vec4 uVig; uniform vec4 uK; out vec4 o;
void main() {
  vec2 q = vUV - 0.5; float e = smoothstep(0.38, 0.98, length(q) * 1.28);
  float av = uVig.a * e, af = uFlash.a, ad = uK.w;
  float a = 1.0 - (1.0 - av) * (1.0 - af) * (1.0 - ad);
  vec3 c = (uVig.rgb * av * (1.0 - af) + uFlash.rgb * af) / max(a, 0.001);
  o = vec4(c * a, a);
}`;

export class Post {
  /** levels: 번짐 단계 수 (0 = 후처리 끔, 2 = mid, 3 = high) */
  constructor(gl, levels) {
    this.gl = gl; this.levels = levels; this.enabled = levels > 0; this.w = 0; this.h = 0; this.target = null;
    this.bloom = 1; this.threshold = 0.68; this.knee = 0.32; this.baseVig = 0.2; this.gain = 1;
    this.scene = null; this.depth = null; this.sceneTex = null; this.lv = []; this.bytes = 0; this.passes = 0; this.active = false;
    this.pBright = program(gl, VS, FS_BRIGHT, 'post.bright'); this.pDown = program(gl, VS, FS_DOWN, 'post.down'); this.pUp = program(gl, VS, FS_UP, 'post.up');
    this.pComp = program(gl, VS, FS_COMP, 'post.comp'); this.pCompT = program(gl, VS, FS_COMP.replace('precision mediump float;', 'precision mediump float;\n#define TENT'), 'post.compT');
    this.pOver = program(gl, VS, FS_OVER, 'post.over');
    for (const p of [this.pComp, this.pCompT]) { gl.useProgram(p.p); gl.uniform1i(p.u.uScene, 0); gl.uniform1i(p.u.uBloom, 1); }
    this._v = new Float32Array(4);
    this.vao = gl.createVertexArray();   // 속성 없음 (gl_VertexID 로 화면을 덮는 삼각형)
  }
  setLevels(levels) { if (levels === this.levels) return; this.levels = levels; this.enabled = levels > 0; this._free(); this.w = 0; }
  _tex(w, h) { const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); this.bytes += w * h * 4; return t; }
  _fbo(tex, depth) { const gl = this.gl, f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); if (depth) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth); return f; }
  _free() {
    const gl = this.gl;
    if (this.scene) { gl.deleteFramebuffer(this.scene); gl.deleteTexture(this.sceneTex); gl.deleteRenderbuffer(this.depth); this.scene = null; }
    for (const l of this.lv) { gl.deleteFramebuffer(l.fbo); gl.deleteTexture(l.tex); }
    this.lv.length = 0; this.bytes = 0;
  }
  _alloc(w, h) {
    const gl = this.gl; this._free(); this.w = w; this.h = h;
    this.sceneTex = this._tex(w, h);
    this.depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); this.bytes += w * h * 4;
    this.scene = this._fbo(this.sceneTex, this.depth);
    let lw = Math.max(2, w >> 2), lh = Math.max(2, h >> 2);
    for (let i = 0; i < this.levels; i++) { const tex = this._tex(lw, lh); this.lv.push({ tex, fbo: this._fbo(tex, null), w: lw, h: lh }); lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  /** 장면을 그리기 전에. w,h = 그릴 크기(px), target = 마지막에 낼 프레임버퍼(null = 화면). 돌려주는 값 = 지금 묶인 프레임버퍼 */
  begin(w, h, target = null) {
    const gl = this.gl; this.target = target; this.active = this.enabled; this.bw = w; this.bh = h;
    if (!this.enabled) { gl.bindFramebuffer(gl.FRAMEBUFFER, target); gl.viewport(0, 0, w, h); return target; }
    if (w !== this.w || h !== this.h) this._alloc(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene); gl.viewport(0, 0, w, h);
    return this.scene;
  }
  /** 장면·효과를 다 그린 뒤에. screen = feel.screen */
  end(screen) {
    const gl = this.gl, F = screen.flash, Vg = screen.vig, V = this._v; this.passes = 0;   // V: 실수 유니폼은 배열로 올린다 (숫자 상자를 만들지 않게)
    gl.bindVertexArray(this.vao); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    if (!this.active) {
      if (F[3] > 0.004 || Vg[3] > 0.004 || screen.dark > 0.004) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        const p = this.pOver; gl.useProgram(p.p); gl.uniform4fv(p.u.uFlash, F); gl.uniform4fv(p.u.uVig, Vg); V[0] = 0; V[1] = 0; V[2] = 0; V[3] = screen.dark; gl.uniform4fv(p.u.uK, V);
        gl.drawArrays(gl.TRIANGLES, 0, 3); this.passes = 1;
      }
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.bindVertexArray(null); return;
    }
    gl.disable(gl.BLEND); gl.activeTexture(gl.TEXTURE0);
    const L = this.lv, n = L.length;
    // 1) 밝은 부분 → 1/4
    gl.bindFramebuffer(gl.FRAMEBUFFER, L[0].fbo); gl.viewport(0, 0, L[0].w, L[0].h);
    gl.useProgram(this.pBright.p); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); V[0] = 1 / this.w; V[1] = 1 / this.h; V[2] = this.threshold; V[3] = this.knee; gl.uniform4fv(this.pBright.u.uTP, V);
    gl.drawArrays(gl.TRIANGLES, 0, 3); this.passes++;
    // 2) 더 줄이기
    gl.useProgram(this.pDown.p);
    for (let i = 1; i < n; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, L[i].fbo); gl.viewport(0, 0, L[i].w, L[i].h); gl.bindTexture(gl.TEXTURE_2D, L[i - 1].tex); V[0] = 1 / L[i - 1].w; V[1] = 1 / L[i - 1].h; V[2] = 0; V[3] = 0; gl.uniform4fv(this.pDown.u.uTP, V); gl.drawArrays(gl.TRIANGLES, 0, 3); this.passes++; }
    // 3) 되올리며 더하기
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(this.pUp.p);
    for (let i = n - 1; i > 0; i--) { gl.bindFramebuffer(gl.FRAMEBUFFER, L[i - 1].fbo); gl.viewport(0, 0, L[i - 1].w, L[i - 1].h); gl.bindTexture(gl.TEXTURE_2D, L[i].tex); V[0] = 1 / L[i].w; V[1] = 1 / L[i].h; V[2] = 1.0; V[3] = 0; gl.uniform4fv(this.pUp.u.uTP, V); gl.drawArrays(gl.TRIANGLES, 0, 3); this.passes++; }
    gl.disable(gl.BLEND);
    // 4) 합성
    const p = this.levels >= 3 ? this.pCompT : this.pComp;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target); gl.viewport(0, 0, this.bw, this.bh);
    gl.useProgram(p.p); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L[0].tex); gl.activeTexture(gl.TEXTURE0);
    V[0] = this.bloom * this.gain; V[1] = this.baseVig; V[2] = screen.desat; V[3] = screen.dark; gl.uniform4fv(p.u.uK, V); gl.uniform4fv(p.u.uFlash, F); gl.uniform4fv(p.u.uVig, Vg); V[0] = 1 / L[0].w; V[1] = 1 / L[0].h; V[2] = 0; V[3] = 0; gl.uniform4fv(p.u.uTP, V);
    gl.drawArrays(gl.TRIANGLES, 0, 3); this.passes++;
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.bindVertexArray(null);
  }
  dispose() { const gl = this.gl; this._free(); for (const p of [this.pBright, this.pDown, this.pUp, this.pComp, this.pCompT, this.pOver]) gl.deleteProgram(p.p); gl.deleteVertexArray(this.vao); }
}
