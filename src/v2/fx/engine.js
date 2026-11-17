// v2 fx — 엔진 (WebGL2). docs/v2/FX.md §2
// 네 가지 묶음 + 빛 목록. 전부 고정 크기 풀이고, 살아 있는 동안의 움직임은 셰이더가 시간으로 계산한다
// (입자·바닥 문양은 태어날 때 한 번만 버퍼에 쓴다 → 프레임마다 CPU 가 입자를 돌지 않는다).
//   Particles — 인스턴스 입자 (카메라 보기 · 속도 방향으로 늘이기 · 더하기/알파 · 중력 · 저항 · 회전 · 색/크기 변화) : 그리기 1–2회
//   Quads     — 바닥 문양·충격 고리·빛 웅덩이 (예고 원·부채꼴·선, 그을음, 마법진, 서리, 그림자)            : 그리기 1회
//   Ribbons   — 띠 (칼 궤적 = 날의 두 점, 탄 꼬리 = 카메라를 보는 띠, 번개 = 들쭉날쭉한 꺾은선)          : 그리기 1회
//   Meshes    — 움직이는 셰이더를 입힌 작은 메시 (초승달 베기·빛기둥/광선·원뿔·방패 구·얼음 가시·바위·종)   : 인스턴스당 1회
//   Lights    — 잠깐 사는 점광 목록 (장면 셰이더가 읽는다)
// 남의 GL 컨텍스트에 얹혀 돈다: 자기 VAO·프로그램만 쓰고 draw 가 끝나면 상태를 되돌린다 (index.js draw 참고).
import { makeParticleAtlas, makeDecalAtlas, makeNoise } from './sprites.js';

export function program(gl, vs, fs, name) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`[fx] GLSL ${name}: ${gl.getShaderInfoLog(s)}`); return s; };
  const p = gl.createProgram(), a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a); gl.attachShader(p, b); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`[fx] link ${name}: ${gl.getProgramInfoLog(p)}`);
  gl.deleteShader(a); gl.deleteShader(b);
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); if (!inf) continue; const nm = inf.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, inf.name); }
  return { p, u };
}

/** 공용 텍스처 3장 (입자 아틀라스 · 문양 아틀라스 · 잡음). 만들 때 한 번만 올린다. */
export function makeTextures(gl) {
  const prevPM = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL), prevFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const up = (src, repeat, w, h) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, src); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const wr = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    gl.generateMipmap(gl.TEXTURE_2D);
    return t;
  };
  const pa = makeParticleAtlas(), da = makeDecalAtlas();
  const T = { atlas: up(pa, false), decal: up(da, false), noise: null, bytes: 0 };
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  T.noise = up(makeNoise(), true, 64, 64);
  T.bytes = Math.round((512 * 512 * 4 * 2 + 64 * 64 * 4) * 1.34);
  pa.width = pa.height = 1; da.width = da.height = 1;   // 원본 캔버스는 바로 돌려준다
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, prevPM); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, prevFlip);
  return T;
}

function cornerBuffer(gl) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW); return b; }
const rnd = Math.random;

// ═════════════════════════ 입자 ═════════════════════════
const PF = 22, PB = PF * 4;   // 인스턴스당 float 22개 = 88바이트
const P_VS = `#version 300 es
layout(location=0) in vec4 aP; layout(location=1) in vec4 aV; layout(location=2) in vec4 aS; layout(location=3) in vec4 aM;
layout(location=4) in vec4 aF; layout(location=5) in vec4 aC0; layout(location=6) in vec4 aC1; layout(location=7) in vec2 aCorner;
uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd; uniform vec4 uTG; uniform vec4 uProt[4];
out vec2 vUV; out vec4 vCol; out float vAdd;
void main() {
  float age = uTG.x - aP.w; float k = age / aV.w;
  if (age < 0.0 || k >= 1.0) { gl_Position = vec4(0.0, 0.0, -9.0, 1.0); return; }
  float d = aM.y; float ex = exp(-d * age);
  float e = d > 0.001 ? (1.0 - ex) / d : age;
  float gq = d > 0.001 ? (age - e) / d : 0.5 * age * age;
  vec3 p = aP.xyz + aV.xyz * e; p.y -= aM.x * gq;
  vec3 vel = aV.xyz * ex; vel.y -= aM.x * e;
  if (aF.w > 0.5) { float h = p.y - aF.y; if (h < 0.0) { p.y = aF.y - h * (aF.w > 1.5 ? 0.32 : 0.0); vel.y = 0.0; } }
  float size = mix(aS.x, aS.y, 1.0 - (1.0 - k) * (1.0 - k));
  vec2 c = aCorner - 0.5; vec2 q;
  if (aM.z > 0.0) {
    vec2 sv = vec2(dot(vel, uRight), dot(vel, uUp)); float sp = length(sv); vec2 ax = sp > 1.0 ? sv / sp : vec2(1.0, 0.0);
    q = ax * (c.x * size * (1.0 + aM.z * sp * 0.002)) + vec2(-ax.y, ax.x) * (c.y * size);
  } else {
    float r = aS.z + aS.w * age; float cs = cos(r), sn = sin(r);
    q = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * size;
  }
  vec4 col = mix(aC0, aC1, k); col.rgb *= 4.0;
  float a = col.a * min(1.0, k / max(aF.z, 0.0001)) * (1.0 - smoothstep(0.85, 1.0, k));
  float dim = 1.0;   // 읽기 규칙: 영웅·예고 중인 적 앞을 지나는 큰 입자는 옅게
  for (int i = 0; i < 4; i++) {
    vec4 z = uProt[i];
    if (z.w > 0.0) {
      vec3 dv = p - z.xyz; float front = -dot(dv, uFwd);
      float dd = length(vec2(dot(dv, uRight), dot(dv, uUp) * 0.62));
      float m = smoothstep(z.w * 0.55, z.w + size * 0.5, dd);
      dim = min(dim, mix(1.0, mix(uTG.z, 1.0, m), smoothstep(-z.w * 0.4, z.w * 0.2, front)));
    }
  }
  a *= mix(1.0, dim, smoothstep(10.0, 34.0, size));
  vAdd = aF.x; vCol = vec4(col.rgb * mix(1.0, uTG.y, aF.x), a);
  float si = aM.w; vec2 cell = vec2(mod(si, 4.0), floor(si * 0.25));
  vUV = (cell + vec2(aCorner.x, 1.0 - aCorner.y) * 0.9375 + 0.03125) * 0.25;
  gl_Position = uVP * vec4(p + uRight * q.x + uUp * q.y, 1.0);
}`;
const P_FS = `#version 300 es
precision mediump float;
in vec2 vUV; in vec4 vCol; in float vAdd; uniform sampler2D uAtlas; out vec4 o;
void main() { vec4 t = texture(uAtlas, vUV); o = vec4(t.rgb * vCol.rgb * vCol.a, t.a * vCol.a * (1.0 - vAdd)); }`;

/** 방출 명세의 기본값을 채운다 (모듈을 읽을 때 한 번). 실행 중에는 명세를 새로 만들지 않는다. */
export function E(o) {
  const s = {
    sprite: 0, add: 1, n: 1, shape: 0, spread: 0.5, speed: [0, 0], vy: [0, 0], life: [0.3, 0.3], size: [10, 10], grow: 1,
    grav: 0, drag: 0, stretch: 0, spin: [0, 0], rot: 1, c0: [1, 1, 1, 1], c1: [1, 1, 1, 0], cv: 0, jit: 0, rad: 0, h: [0, 0],
    floor: 0, fadeIn: 0, pri: 0, useAngle: 0, rotJit: 0, min: 0, ...o,
  };
  const two = (v) => (Array.isArray(v) ? v : [v, v]);
  s.speed = two(s.speed); s.vy = two(s.vy); s.life = two(s.life); s.size = two(s.size); s.spin = two(s.spin); s.h = two(s.h);
  s._area = ((s.size[0] + s.size[1]) * 0.5 * (1 + s.grow) * 0.5) ** 2;
  return s;
}

export class Particles {
  constructor(gl, maxCap, tex) {
    this.gl = gl; this.max = maxCap; this.cap = maxCap; this.tex = tex;
    this.data = new Float32Array(maxCap * PF); this.u8 = new Uint8Array(this.data.buffer);
    this.death = new Float32Array(maxCap); this.area = new Float32Array(maxCap);
    this.head = 0; this.tail = 0; this.count = 0; this.dirtyA = 0; this.dirtyN = 0;
    this.liveArea = 0; this.scale = 1; this.gov = 1; this.angle = 0; this.time = 0;
    this.spawned = 0; this.dropped = 0; this.drawn = 0; this.draws = 0;
    this.pr = program(gl, P_VS, P_FS, 'particles');
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.corner = cornerBuffer(gl); gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 0, 0);
    this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 7; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribDivisor(i, 1); }
    this._point(0); gl.bindVertexArray(null);
    gl.useProgram(this.pr.p); gl.uniform1i(this.pr.u.uAtlas, 0);
  }
  _point(first) {
    const gl = this.gl, o = first * PB;
    for (let i = 0; i < 5; i++) gl.vertexAttribPointer(i, 4, gl.FLOAT, false, PB, o + i * 16);
    gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, PB, o + 80); gl.vertexAttribPointer(6, 4, gl.UNSIGNED_BYTE, true, PB, o + 84);
  }
  reset(cap) { this.cap = Math.min(this.max, cap); this.head = this.tail = this.count = 0; this.dirtyA = this.dirtyN = 0; this.liveArea = 0; }
  /**
   * 명세대로 n개를 뿜는다. (x,y,z) 자리, (dx,dy,dz) 방향(단위 벡터; 원뿔·늘이기용), k 개수 배율, floorY 바닥 높이.
   * shape: 0 원뿔 · 1 구 · 2 바닥 고리(바깥으로) · 3 기둥(원판 안에서 위로) · 4 모여들기(반지름 rad 에서 중심으로)
   */
  emit(s, x, y, z, dx, dy, dz, k, floorY) {
    let nf = s.n * k * (s.pri ? Math.max(this.scale, 0.6) : this.scale * this.gov);
    if (nf < s.min) nf = s.min;
    let n = nf | 0; if (rnd() < nf - n) n++;
    if (this.gov < 1 && !s.pri) this.dropped += s.n * k * this.scale * (1 - this.gov);
    if (n <= 0) return 0;
    const D = this.data, U = this.u8, cap = this.cap, t = this.time;
    // 방향 기준틀 (원뿔용)
    let ux = 0, uy = 0, uz = 0, wx = 0, wy = 0, wz = 0;
    if (s.shape === 0) {
      if (dy > 0.99 || dy < -0.99) { ux = 1; uy = 0; uz = 0; } else { const l = 1 / Math.sqrt(dx * dx + dz * dz); ux = -dz * l; uy = 0; uz = dx * l; }
      wx = dy * uz - dz * uy; wy = dz * ux - dx * uz; wz = dx * uy - dy * ux;
    }
    const c0 = s.c0, c1 = s.c1;
    for (let i = 0; i < n; i++) {
      const idx = this.head;
      if (this.count === cap) { this.liveArea -= this.area[this.tail]; this.tail = (this.tail + 1) % cap; this.count--; }
      this.head = (idx + 1) % cap; this.count++;
      const o = idx * PF, life = s.life[0] + (s.life[1] - s.life[0]) * rnd();
      const sp = s.speed[0] + (s.speed[1] - s.speed[0]) * rnd();
      let px = x, py = y, pz = z, vx = 0, vy = 0, vz = 0;
      if (s.jit) { px += (rnd() - 0.5) * 2 * s.jit; py += (rnd() - 0.5) * 2 * s.jit; pz += (rnd() - 0.5) * 2 * s.jit; }
      if (s.shape === 0) {
        const th = s.spread * Math.sqrt(rnd()), ph = rnd() * 6.2832, st = Math.sin(th), ct = Math.cos(th), cp = Math.cos(ph) * st, spn = Math.sin(ph) * st;
        vx = (dx * ct + ux * cp + wx * spn) * sp; vy = (dy * ct + uy * cp + wy * spn) * sp; vz = (dz * ct + uz * cp + wz * spn) * sp;
      } else if (s.shape === 1) {
        const cz = rnd() * 2 - 1, ph = rnd() * 6.2832, sr = Math.sqrt(1 - cz * cz);
        vx = Math.cos(ph) * sr * sp; vy = cz * sp; vz = Math.sin(ph) * sr * sp;
      } else if (s.shape === 2) {
        const ph = rnd() * 6.2832, cx = Math.cos(ph), sz = Math.sin(ph);
        px += cx * s.rad; pz += sz * s.rad; vx = cx * sp; vz = sz * sp;
      } else if (s.shape === 3) {
        const ph = rnd() * 6.2832, rr = Math.sqrt(rnd()) * s.rad;
        px += Math.cos(ph) * rr; pz += Math.sin(ph) * rr; py += s.h[0] + (s.h[1] - s.h[0]) * rnd();
        vx = (rnd() - 0.5) * sp * 0.25; vz = (rnd() - 0.5) * sp * 0.25; vy = sp;
      } else {
        const cz = rnd() * 1.4 - 0.4, ph = rnd() * 6.2832, sr = Math.sqrt(Math.max(0, 1 - cz * cz)), rr = s.rad * (0.7 + rnd() * 0.5);
        const ox = Math.cos(ph) * sr, oz = Math.sin(ph) * sr;
        px += ox * rr; py += cz * rr; pz += oz * rr; vx = -ox * rr / life; vy = -cz * rr / life; vz = -oz * rr / life;
      }
      vy += s.vy[0] + (s.vy[1] - s.vy[0]) * rnd();
      const sz0 = s.size[0] + (s.size[1] - s.size[0]) * rnd();
      D[o] = px; D[o + 1] = py; D[o + 2] = pz; D[o + 3] = t;
      D[o + 4] = vx; D[o + 5] = vy; D[o + 6] = vz; D[o + 7] = life;
      D[o + 8] = sz0; D[o + 9] = sz0 * s.grow; D[o + 10] = s.useAngle ? this.angle + (rnd() - 0.5) * s.rotJit : (s.rot ? rnd() * 6.2832 : 0); D[o + 11] = s.spin[0] + (s.spin[1] - s.spin[0]) * rnd();
      D[o + 12] = s.grav; D[o + 13] = s.drag; D[o + 14] = s.stretch; D[o + 15] = s.sprite;
      D[o + 16] = s.add; D[o + 17] = floorY + sz0 * 0.3; D[o + 18] = s.fadeIn; D[o + 19] = s.floor;
      const b = o * 4 + 80, m = (1 - s.cv * rnd()) * 63.75;
      U[b] = Math.min(255, c0[0] * m); U[b + 1] = Math.min(255, c0[1] * m); U[b + 2] = Math.min(255, c0[2] * m); U[b + 3] = c0[3] * 255;
      U[b + 4] = Math.min(255, c1[0] * m); U[b + 5] = Math.min(255, c1[1] * m); U[b + 6] = Math.min(255, c1[2] * m); U[b + 7] = c1[3] * 255;
      this.death[idx] = t + life; this.area[idx] = s._area; this.liveArea += s._area;
    }
    if (this.dirtyN === 0) this.dirtyA = (this.head - n + cap * 2) % cap;
    this.dirtyN += n; this.spawned += n;
    return n;
  }
  update(time) {
    this.time = time;
    const cap = this.cap;
    while (this.count > 0 && this.death[this.tail] <= time) { this.liveArea -= this.area[this.tail]; this.tail = (this.tail + 1) % cap; this.count--; }
    if (this.count === 0) this.liveArea = 0;
  }
  draw(cam, gain, protect, protMin) {
    this.draws = 0; this.drawn = this.count;
    const gl = this.gl;
    if (this.dirtyN > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      const cap = this.cap;
      if (this.dirtyN >= cap) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, cap * PF);
      else {
        const a = this.dirtyA, n1 = Math.min(this.dirtyN, cap - a);
        gl.bufferSubData(gl.ARRAY_BUFFER, a * PB, this.data, a * PF, n1 * PF);
        if (this.dirtyN > n1) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, (this.dirtyN - n1) * PF);
      }
      this.dirtyN = 0;
    }
    if (this.count === 0) return;
    const u = this.pr.u;
    gl.useProgram(this.pr.p); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uRight, cam.right); gl.uniform3fv(u.uUp, cam.up); gl.uniform3fv(u.uFwd, cam.fwd);
    gl.uniform4f(u.uTG, this.time, gain, protMin, 0); gl.uniform4fv(u.uProt, protect);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex.atlas);
    const n1 = Math.min(this.count, this.cap - this.tail);
    this._point(this.tail); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n1); this.draws++;
    if (this.count > n1) { this._point(0); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count - n1); this.draws++; }
  }
  /** 디버그용(프레임 밖): 지금 살아 있는 입자 수와 화면 덧칠 넓이(단위², 1단위≈1px) */
  measure() {
    let n = 0, area = 0; const D = this.data, t = this.time;
    for (let j = 0; j < this.count; j++) {
      const i = (this.tail + j) % this.cap, o = i * PF, age = t - D[o + 3], k = age / D[o + 7];
      if (k < 0 || k >= 1) continue;
      const sz = D[o + 8] + (D[o + 9] - D[o + 8]) * (1 - (1 - k) * (1 - k)); n++; area += sz * sz * (D[o + 14] > 0 ? 1.6 : 1);
    }
    return { n, area };
  }
  dispose() { const gl = this.gl; gl.deleteBuffer(this.buf); gl.deleteBuffer(this.corner); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.pr.p); }
}

// ═════════════════════════ 바닥 문양 · 고리 · 빛 웅덩이 ═════════════════════════
export const Q = { CIRCLE: 0, SECTOR: 1, LINE: 2, SCORCH: 3, RUNE: 4, RING: 5, GLOW: 6, CRACK: 7, FROST: 8, SHADOW: 9, BB: 32 };
const QF = 24, QB = QF * 4;
const Q_VS = `#version 300 es
layout(location=0) in vec4 aC; layout(location=1) in vec4 aU; layout(location=2) in vec4 aV; layout(location=3) in vec4 aCol;
layout(location=4) in vec4 aPr; layout(location=5) in vec4 aQ; layout(location=7) in vec2 aCorner;
uniform mat4 uVP; uniform vec3 uRight; uniform vec3 uUp; uniform vec4 uTG;
out vec2 vP; out vec4 vCol; out vec4 vA; out vec4 vB;
void main() {
  float age = uTG.x - aC.w; float k = age / aU.w;
  if (age < 0.0 || k >= 1.0) { gl_Position = vec4(0.0, 0.0, -9.0, 1.0); return; }
  float ty = aV.w; bool bb = ty >= 31.5; if (bb) ty -= 32.0;
  vec3 U = bb ? uRight * aU.x : aU.xyz; vec3 V = bb ? uUp * aU.x : aV.xyz;
  float g = mix(aPr.x, aPr.y, 1.0 - (1.0 - k) * (1.0 - k));
  vec2 c = aCorner * 2.0 - 1.0;
  float env = min(1.0, age / max(aQ.w, 0.0001));
  env *= abs(ty - 5.0) < 0.5 ? pow(1.0 - k, 1.5) : 1.0 - smoothstep(0.72, 1.0, k);
  float r = aQ.y * age; float cs = cos(r), sn = sin(r);
  vP = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  vCol = aCol; vA = vec4(ty, k, aPr.z > 0.0 ? clamp(age / aPr.z, 0.0, 1.0) : 1.0, aPr.w); vB = vec4(aQ.x, aQ.z, uTG.x, env);
  vec4 p = uVP * vec4(aC.xyz + (U * c.x + V * c.y) * g, 1.0);
  if (!bb) p.z -= 0.0006 * p.w;
  gl_Position = p;
}`;
const Q_FS = `#version 300 es
precision highp float;
in vec2 vP; in vec4 vCol; in vec4 vA; in vec4 vB;
uniform sampler2D uDecal; uniform sampler2D uNoise; uniform float uGain; out vec4 o;
void main() {
  int ty = int(vA.x + 0.5); float k = vA.y, f = vA.z, env = vB.w;
  float r = length(vP); vec3 c = vCol.rgb; float add = 0.0, al = 0.0; vec3 body = vec3(0.0);
  if (ty == 5) {
    float w = mix(0.2, 0.06, k); float b = smoothstep(w, 0.0, abs(r - (1.0 - w)));
    add = b + smoothstep(0.3, 1.0 - w, r) * step(r, 1.0 - w) * 0.2 * (1.0 - k);
  } else if (ty == 6) { float gq = max(0.0, 1.0 - r); add = gq * gq; }
  else if (ty == 9) { al = smoothstep(1.0, 0.25, r) * vCol.a; c = vec3(0.0); }
  else if (ty <= 2) {
    float inside, edge, dq;
    if (ty == 0) { inside = step(r, 1.0); edge = smoothstep(0.05, 0.0, abs(r - 0.95)); dq = r; }
    else if (ty == 1) {
      float aa = abs(atan(vP.y, vP.x)); float arc = vB.y; inside = step(r, 1.0) * step(aa, arc);
      edge = max(smoothstep(0.05, 0.0, abs(r - 0.95)) * step(aa, arc), smoothstep(0.035, 0.0, abs(aa - arc + 0.03) * r) * step(r, 1.0)); dq = r;
    } else {
      inside = 1.0; edge = max(smoothstep(0.12, 0.0, abs(abs(vP.y) - 0.86)), smoothstep(0.03, 0.0, abs(abs(vP.x) - 0.97))); dq = vP.x * 0.5 + 0.5;
    }
    float fm = step(dq, f); float front = smoothstep(0.07, 0.0, abs(dq - f)) * step(f, 0.995);
    float pulse = 0.82 + 0.18 * sin(vB.z * 16.0);
    add = (edge * 1.1 + inside * (fm * 0.34 + front * 1.0 + 0.05)) * pulse;
    al = inside * 0.42; body = c * 0.06;
  } else if (ty == 3) {
    float n = texture(uNoise, vP * 0.33 + vA.w).r; float m = smoothstep(1.0, 0.3, r + (n - 0.5) * 0.75);
    al = m * vCol.a; body = c; add = pow(1.0 - k, 8.0) * m * n * vB.y * 3.0; c = vec3(1.0, 0.42, 0.1);
  } else if (ty == 8) {
    float n = texture(uNoise, vP * 0.55 + vA.w).r; float n2 = texture(uNoise, vP * 1.6 - vA.w).g;
    float m = smoothstep(1.0, 0.5, r + (n - 0.5) * 0.55);
    add = m * (0.16 + 0.75 * smoothstep(0.5, 0.75, n2)); al = m * 0.3; body = c * 0.35;
  } else {
    float cell = floor(vA.w + 0.5); vec2 uv = (vec2(mod(cell, 2.0), floor(cell * 0.5)) + clamp(vP * 0.5 + 0.5, 0.01, 0.99)) * 0.5;
    float t = texture(uDecal, uv).a * step(r, 1.4);
    if (vB.x > 0.5) add = t * 1.25; else { al = t * vCol.a; body = c; }
  }
  o = vec4((c * add * vCol.a * uGain + body * al) * env, al * env);
}`;

export class Quads {
  constructor(gl, maxCap, tex) {
    this.gl = gl; this.max = maxCap; this.cap = maxCap; this.tex = tex;
    this.data = new Float32Array(maxCap * QF); this.death = new Float32Array(maxCap); this.gen = new Uint16Array(maxCap);
    this.hi = 0; this.cur = 0; this.time = 0; this.dirtyLo = maxCap; this.dirtyHi = -1; this.live = 0; this.draws = 0; this.areaNow = 0;
    this.pr = program(gl, Q_VS, Q_FS, 'quads');
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.corner = cornerBuffer(gl); gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 0, 0);
    this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 6; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribDivisor(i, 1); gl.vertexAttribPointer(i, 4, gl.FLOAT, false, QB, i * 16); }
    gl.bindVertexArray(null);
    gl.useProgram(this.pr.p); gl.uniform1i(this.pr.u.uDecal, 0); gl.uniform1i(this.pr.u.uNoise, 1);
  }
  reset(cap) { this.cap = Math.min(this.max, cap); this.death.fill(0); this.hi = 0; this.cur = 0; this.dirtyLo = this.max; this.dirtyHi = -1; }
  _slot() {
    const cap = this.cap, t = this.time; let best = -1, bd = 1e30;
    for (let j = 0; j < cap; j++) { const i = (this.cur + j) % cap; if (this.death[i] <= t) { best = i; break; } if (this.death[i] < bd) { bd = this.death[i]; best = i; } }
    this.cur = (best + 1) % cap; this.gen[best] = (this.gen[best] + 1) & 0x3ff;
    return best;
  }
  _dirty(i) { if (i < this.dirtyLo) this.dirtyLo = i; if (i > this.dirtyHi) this.dirtyHi = i; if (i >= this.hi) this.hi = i + 1; }
  /**
   * 바닥에 눕힌 문양. type = Q.*, (x,y,z) 중심, rx·rz 반지름(단위), yaw(라디안; +x 축에서 +z 쪽으로), life 초, col [r,g,b,a],
   * g0→g1 크기 배율, fill 채움 시간(초; 0 = 처음부터 참), par 종류별 값(문양 칸·잡음 씨앗), add 더하기 여부, spin 회전(rad/s), arc 부채꼴 반각/그을음 불씨, fadeIn 초.
   * 돌려주는 값 = 손잡이(옮기기·끄기용)
   */
  ground(type, x, y, z, rx, rz, yaw, life, col, g0, g1, fill, par, add, spin, arc, fadeIn) {
    const i = this._slot(), o = i * QF, D = this.data, cs = Math.cos(yaw), sn = Math.sin(yaw);
    D[o] = x; D[o + 1] = y + 0.8; D[o + 2] = z; D[o + 3] = this.time;
    D[o + 4] = cs * rx; D[o + 5] = 0; D[o + 6] = sn * rx; D[o + 7] = life;
    D[o + 8] = -sn * rz; D[o + 9] = 0; D[o + 10] = cs * rz; D[o + 11] = type;
    D[o + 12] = col[0]; D[o + 13] = col[1]; D[o + 14] = col[2]; D[o + 15] = col[3];
    D[o + 16] = g0; D[o + 17] = g1; D[o + 18] = fill; D[o + 19] = par;
    D[o + 20] = add; D[o + 21] = spin; D[o + 22] = arc; D[o + 23] = fadeIn;
    this.death[i] = this.time + life; this._dirty(i);
    return i | (this.gen[i] << 8);
  }
  /** 카메라를 보는 고리·빛 (type 은 Q.RING / Q.GLOW …) */
  billboard(type, x, y, z, r, life, col, g0, g1, fadeIn) {
    const i = this._slot(), o = i * QF, D = this.data;
    D[o] = x; D[o + 1] = y; D[o + 2] = z; D[o + 3] = this.time;
    D[o + 4] = r; D[o + 5] = 0; D[o + 6] = 0; D[o + 7] = life;
    D[o + 8] = 0; D[o + 9] = 0; D[o + 10] = 0; D[o + 11] = type + Q.BB;
    D[o + 12] = col[0]; D[o + 13] = col[1]; D[o + 14] = col[2]; D[o + 15] = col[3];
    D[o + 16] = g0; D[o + 17] = g1; D[o + 18] = 0; D[o + 19] = 0;
    D[o + 20] = 1; D[o + 21] = 0; D[o + 22] = 0; D[o + 23] = fadeIn;
    this.death[i] = this.time + life; this._dirty(i);
    return i | (this.gen[i] << 8);
  }
  _ok(h) { const i = h & 0xff; return h >= 0 && this.gen[i] === (h >> 8) && this.death[i] > this.time ? i : -1; }
  move(h, x, y, z) { const i = this._ok(h); if (i < 0) return; const o = i * QF; this.data[o] = x; this.data[o + 1] = y; this.data[o + 2] = z; this._dirty(i); }
  kill(h) { const i = this._ok(h); if (i < 0) return; this.death[i] = 0; this.data[i * QF + 7] = 0.0001; this._dirty(i); }
  update(time) { this.time = time; let n = 0, hi = 0; for (let i = 0; i < this.hi; i++) if (this.death[i] > time) { n++; hi = i + 1; } this.live = n; this.hi = hi; }
  draw(cam, gain) {
    this.draws = 0; const gl = this.gl;
    if (this.dirtyHi >= this.dirtyLo) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, this.dirtyLo * QB, this.data, this.dirtyLo * QF, (this.dirtyHi - this.dirtyLo + 1) * QF);
      this.dirtyLo = this.max; this.dirtyHi = -1;
    }
    if (!this.live) return;
    const u = this.pr.u;
    gl.useProgram(this.pr.p); gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uRight, cam.right); gl.uniform3fv(u.uUp, cam.up);
    gl.uniform4f(u.uTG, this.time, 0, 0, 0); gl.uniform1f(u.uGain, gain);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex.noise);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex.decal);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.hi); this.draws = 1;
  }
  /** 디버그용: 지금 살아 있는 문양의 화면 넓이 추정(단위²). 바닥 문양은 내려보는 각만큼 납작해진다(×0.4) */
  measure() {
    let area = 0; const D = this.data, t = this.time;
    for (let i = 0; i < this.hi; i++) {
      if (this.death[i] <= t) continue; const o = i * QF, k = (t - D[o + 3]) / D[o + 7], g = D[o + 16] + (D[o + 17] - D[o + 16]) * (1 - (1 - k) * (1 - k));
      const bb = D[o + 11] >= 31.5, ru = Math.hypot(D[o + 4], D[o + 6]) * g, rv = bb ? ru : Math.hypot(D[o + 8], D[o + 10]) * g;
      area += 4 * ru * rv * (bb ? 1 : 0.4);
    }
    return { n: this.live, area };
  }
  dispose() { const gl = this.gl; gl.deleteBuffer(this.buf); gl.deleteBuffer(this.corner); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.pr.p); }
}

// ═════════════════════════ 띠 (칼 궤적 · 꼬리 · 번개) ═════════════════════════
const R_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol; layout(location=3) in vec2 aSt;
uniform mat4 uVP; out vec2 vUV; out vec4 vCol; out vec2 vSt;
void main() { vUV = aUV; vCol = aCol; vSt = aSt; gl_Position = uVP * vec4(aPos, 1.0); }`;
const R_FS = `#version 300 es
precision mediump float;
in vec2 vUV; in vec4 vCol; in vec2 vSt; uniform sampler2D uNoise; uniform vec2 uTG; out vec4 o;
void main() {
  float u = vUV.x, v = vUV.y, e = 1.0 - abs(v * 2.0 - 1.0); vec3 rgb; float a;
  if (vSt.x < 0.5) {            // 칼 궤적: 날 끝(v=1) 쪽이 밝고 뒤로 갈수록 스러진다
    float st = texture(uNoise, vec2(u * 1.3, v * 2.5)).g;
    a = pow(1.0 - u, 1.6) * (v * v * 0.95 + 0.12) * (0.65 + 0.7 * st) * smoothstep(0.0, 0.06, 1.0 - v) * smoothstep(0.0, 0.08, u + 0.05);
    rgb = vCol.rgb + vec3(1.0) * smoothstep(0.78, 0.98, v) * (1.0 - u) * 0.9;
  } else if (vSt.x < 1.5) {     // 꼬리: 가운데가 밝은 띠
    a = pow(1.0 - u, 1.4) * e * e; rgb = vCol.rgb + vec3(1.0) * smoothstep(0.6, 1.0, e) * (1.0 - u) * 0.6;
  } else {                      // 번개: 흰 핵 + 색 후광
    float core = smoothstep(0.5, 0.9, e); a = e * e * 0.7 + core; rgb = vCol.rgb * (e * e) + vec3(1.0) * core;
  }
  a *= vCol.a;
  o = vec4(rgb * a * mix(1.0, uTG.y, vSt.y), a * (1.0 - vSt.y));
}`;
const RV = 11;   // 정점당 float: 위치 3 · uv 2 · 색 4 · 모양/더하기 2

/** 띠 명세 기본값. mode 0 = 칼(두 점) · 1 = 꼬리(중심 + 폭, 카메라를 본다) · 2 = 번개 */
export function RB(o) { return { mode: 1, life: 0.2, width: 12, col: [1, 1, 1, 1], add: 1, taper: 1, segs: 9, jitter: 16, regen: 0.045, ...o }; }

export class Ribbons {
  constructor(gl, maxR, maxPts, tex) {
    this.gl = gl; this.maxR = maxR; this.N = maxPts; this.cap = maxR; this.tex = tex;
    this.pts = new Float32Array(maxR * maxPts * 7);
    this.st = new Int16Array(maxR); this.cn = new Int16Array(maxR); this.on = new Uint8Array(maxR); this.ended = new Uint8Array(maxR);
    this.gen = new Uint16Array(maxR); this.spec = new Array(maxR).fill(null); this.ab = new Float32Array(maxR * 6); this.nextRe = new Float32Array(maxR); this.born = new Float32Array(maxR);
    this.maxVerts = maxR * (maxPts * 2 + 2);
    this.verts = new Float32Array(this.maxVerts * RV); this.nv = 0; this.time = 0; this.live = 0; this.draws = 0;
    this.pr = program(gl, R_VS, R_FS, 'ribbons');
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.DYNAMIC_DRAW);
    const S = RV * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 36);
    gl.bindVertexArray(null);
    gl.useProgram(this.pr.p); gl.uniform1i(this.pr.u.uNoise, 1);
  }
  reset(cap) { this.cap = Math.min(this.maxR, cap); this.on.fill(0); this.cn.fill(0); this.spec.fill(null); }
  /** 띠를 시작한다 → 손잡이 (-1 = 풀이 참) */
  start(spec) {
    for (let r = 0; r < this.cap; r++) if (!this.on[r]) {
      this.on[r] = 1; this.ended[r] = 0; this.st[r] = 0; this.cn[r] = 0; this.spec[r] = spec; this.gen[r] = (this.gen[r] + 1) & 0x3ff; this.born[r] = this.time;
      return r | (this.gen[r] << 8);
    }
    return -1;
  }
  _ok(h) { const r = h & 0xff; return h >= 0 && this.on[r] && this.gen[r] === (h >> 8) ? r : -1; }
  /** 새 점. 칼: (a = 날 밑동, b = 날 끝). 꼬리: a = 중심 (b 는 무시) */
  push(h, ax, ay, az, bx, by, bz) {
    const r = this._ok(h); if (r < 0 || this.ended[r]) return;
    const N = this.N, s = this.spec[r], minDt = s.life / (N - 2); let n = this.cn[r];
    const base = r * N * 7;
    if (n >= 2) { const prev = base + ((this.st[r] + n - 2) % N) * 7; if (this.time - this.pts[prev + 6] < minDt) n--; }   // 너무 촘촘하면 맨 끝 점을 옮긴다
    if (n >= N) { this.st[r] = (this.st[r] + 1) % N; n--; }
    const o = base + ((this.st[r] + n) % N) * 7, P = this.pts;
    P[o] = ax; P[o + 1] = ay; P[o + 2] = az; P[o + 3] = bx; P[o + 4] = by; P[o + 5] = bz; P[o + 6] = this.time;
    this.cn[r] = n + 1;
  }
  end(h) { const r = this._ok(h); if (r >= 0) this.ended[r] = 1; }
  /** 번개 한 줄기: a → b 사이를 들쭉날쭉하게. 스스로 끝난다 */
  bolt(spec, ax, ay, az, bx, by, bz) {
    const h = this.start(spec); if (h < 0) return -1; const r = h & 0xff, o = r * 6;
    this.ab[o] = ax; this.ab[o + 1] = ay; this.ab[o + 2] = az; this.ab[o + 3] = bx; this.ab[o + 4] = by; this.ab[o + 5] = bz;
    this.ended[r] = 1; this._jag(r); return h;
  }
  _jag(r) {
    const s = this.spec[r], N = Math.min(this.N, s.segs + 1), o = r * 6, A = this.ab, P = this.pts, base = r * this.N * 7;
    const dx = A[o + 3] - A[o], dy = A[o + 4] - A[o + 1], dz = A[o + 5] - A[o + 2], len = Math.hypot(dx, dy, dz) || 1, j = Math.min(s.jitter, len * 0.18);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), w = i === 0 || i === N - 1 ? 0 : j * (0.5 + 0.5 * Math.sin(t * 3.1416)), q = base + i * 7;
      P[q] = A[o] + dx * t + (rnd() - 0.5) * 2 * w; P[q + 1] = A[o + 1] + dy * t + (rnd() - 0.5) * 2 * w; P[q + 2] = A[o + 2] + dz * t + (rnd() - 0.5) * 2 * w; P[q + 6] = this.born[r];
    }
    this.st[r] = 0; this.cn[r] = N; this.nextRe[r] = this.time + s.regen;
  }
  update(time) {
    this.time = time; let live = 0; const N = this.N, P = this.pts;
    for (let r = 0; r < this.cap; r++) {
      if (!this.on[r]) continue; const s = this.spec[r];
      if (s.mode === 2) { if (time - this.born[r] >= s.life) { this.on[r] = 0; this.spec[r] = null; continue; } if (time >= this.nextRe[r]) this._jag(r); live++; continue; }
      const base = r * N * 7;
      while (this.cn[r] > 0 && time - P[base + this.st[r] * 7 + 6] >= s.life) { this.st[r] = (this.st[r] + 1) % N; this.cn[r]--; }
      if (this.ended[r] && this.cn[r] < 2) { this.on[r] = 0; this.spec[r] = null; continue; }
      live++;
    }
    this.live = live;
  }
  draw(cam, gain) {
    this.draws = 0; if (!this.live) { this.nv = 0; return; }
    const gl = this.gl, N = this.N, P = this.pts, V = this.verts, t = this.time, ex = cam.eye[0], ey = cam.eye[1], ez = cam.eye[2];
    let nv = 0;
    for (let r = 0; r < this.cap; r++) {
      if (!this.on[r]) continue; const n = this.cn[r]; if (n < 2) continue;
      const s = this.spec[r], base = r * N * 7, c = s.col, bolt = s.mode === 2, fade = bolt ? 1 - (t - this.born[r]) / s.life : 1, st0 = this.st[r];
      for (let i = 0; i < n; i++) {
        const o = base + ((st0 + i) % N) * 7;
        let lx, ly, lz, rx, ry, rz, u;
        if (s.mode === 0) { lx = P[o]; ly = P[o + 1]; lz = P[o + 2]; rx = P[o + 3]; ry = P[o + 4]; rz = P[o + 5]; u = (t - P[o + 6]) / s.life; }
        else {
          const oa = base + ((st0 + (i > 0 ? i - 1 : 0)) % N) * 7, ob = base + ((st0 + (i < n - 1 ? i + 1 : n - 1)) % N) * 7;
          const tx = P[ob] - P[oa], ty = P[ob + 1] - P[oa + 1], tz = P[ob + 2] - P[oa + 2], cx = ex - P[o], cy = ey - P[o + 1], cz = ez - P[o + 2];
          let sx = ty * cz - tz * cy, sy = tz * cx - tx * cz, sz = tx * cy - ty * cx; const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
          u = bolt ? 0 : (t - P[o + 6]) / s.life;
          const w = s.width * 0.5 * (bolt ? 1 : 1 - s.taper * u) / sl; sx *= w; sy *= w; sz *= w;
          lx = P[o] - sx; ly = P[o + 1] - sy; lz = P[o + 2] - sz; rx = P[o] + sx; ry = P[o + 1] + sy; rz = P[o + 2] + sz;
        }
        const a = c[3] * fade, reps = i === 0 ? 2 : 1;
        for (let q = 0; q < reps; q++) { const v = nv * RV; V[v] = lx; V[v + 1] = ly; V[v + 2] = lz; V[v + 3] = u; V[v + 4] = 0; V[v + 5] = c[0]; V[v + 6] = c[1]; V[v + 7] = c[2]; V[v + 8] = a; V[v + 9] = s.mode; V[v + 10] = s.add; nv++; }
        const reps2 = i === n - 1 ? 2 : 1;
        for (let q = 0; q < reps2; q++) { const v = nv * RV; V[v] = rx; V[v + 1] = ry; V[v + 2] = rz; V[v + 3] = u; V[v + 4] = 1; V[v + 5] = c[0]; V[v + 6] = c[1]; V[v + 7] = c[2]; V[v + 8] = a; V[v + 9] = s.mode; V[v + 10] = s.add; nv++; }
      }
    }
    this.nv = nv; if (!nv) return;
    gl.useProgram(this.pr.p); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, V, 0, nv * RV);
    gl.uniformMatrix4fv(this.pr.u.uVP, false, cam.vp); gl.uniform2f(this.pr.u.uTG, t, gain);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex.noise); gl.activeTexture(gl.TEXTURE0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, nv); this.draws = 1;
  }
  dispose() { const gl = this.gl; gl.deleteBuffer(this.buf); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.pr.p); }
}

// ═════════════════════════ 효과 메시 ═════════════════════════
export const MESH = { CRESCENT: 0, TUBE: 1, CONE: 2, SPHERE: 3, SHARDS: 4, BELL: 5 };
export const MODE = { SLASH: 0, BEAM: 1, CONE: 2, SHIELD: 3, SHARDS: 4, SOLID: 5, BELL: 6 };
const M_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV;
uniform mat4 uVP; uniform mat4 uM; uniform vec4 uPar; uniform highp int uMode;
out vec3 vN; out vec3 vW; out vec2 vUV;
void main() {
  vec3 p = aPos; float k = uPar.x;
  if (uMode == 0) { p *= mix(uPar.w, 1.0, 1.0 - (1.0 - k) * (1.0 - k)); }
  else if (uMode == 1) { float s = mix(1.8, 1.0, smoothstep(0.0, 0.14, k)) * (1.0 - smoothstep(0.55, 1.0, k) * 0.9); p.xz *= s; p.y *= smoothstep(0.0, 0.07, k); }
  else if (uMode == 4) { float ph = aUV.x; float g = smoothstep(ph * 0.3, ph * 0.3 + 0.14, k * 1.25); g += sin(g * 3.14159) * 0.2; p *= vec3(mix(0.45, 1.0, g), g, mix(0.45, 1.0, g)); }
  else if (uMode == 6) { float a = sin(uPar.y * uPar.w) * 0.42 * (1.0 - k * 0.6); float c = cos(a), s = sin(a); p.y -= 1.0; p = vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); p.y += 1.0; }
  vec4 w = uM * vec4(p, 1.0); vW = w.xyz; vN = mat3(uM) * aN; vUV = aUV; gl_Position = uVP * w;
}`;
const M_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec2 vUV;
uniform vec4 uCA; uniform vec4 uCB; uniform vec4 uPar; uniform highp int uMode; uniform vec3 uEye; uniform sampler2D uNoise; uniform vec3 uTAG; out vec4 o;
void main() {
  float k = uPar.x, tm = uTAG.x; vec3 n = normalize(vN); vec3 v = normalize(uEye - vW); float nv = abs(dot(n, v));
  vec3 rgb; float a; float env = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.6, 1.0, k));
  if (uMode == 0) {
    float u = vUV.x, w = vUV.y, head = k * 1.9;
    float m = smoothstep(head, head - 0.1, u) * smoothstep(head - 1.15, head - 0.45, u);
    float st = texture(uNoise, vec2(u * 0.7 + uPar.z, w * 2.6)).g;
    a = m * (w * w * 0.95 + 0.3 * st * w) * (1.0 - k * k) * smoothstep(0.0, 0.05, 1.0 - w);
    rgb = mix(uCB.rgb, uCA.rgb, w) + vec3(1.0) * smoothstep(0.72, 0.97, w) * 0.9;
  } else if (uMode == 1) {
    float sc = texture(uNoise, vec2(vUV.x * 2.0 + uPar.z, vUV.y * 1.3 - tm * 1.7)).r, sc2 = texture(uNoise, vec2(vUV.x * 4.0, vUV.y * 2.6 - tm * 2.9)).g;
    float core = pow(nv, 1.6);
    a = core * (0.3 + 1.7 * sc * sc2) * (1.0 - smoothstep(0.35, 1.0, vUV.y) * uPar.w) * env;
    rgb = mix(uCB.rgb, uCA.rgb, clamp(core * sc * 1.8, 0.0, 1.0)) + vec3(1.0) * pow(nv, 6.0) * 0.2;
  } else if (uMode == 2) {
    float sc = texture(uNoise, vec2(vUV.x * 3.0 + uPar.z, vUV.y * 1.1 - tm * 2.3)).r;
    a = pow(nv, 1.2) * (0.25 + 1.5 * sc) * smoothstep(0.0, 0.18, vUV.y) * (1.0 - smoothstep(0.55, 1.0, vUV.y)) * env; rgb = mix(uCB.rgb, uCA.rgb, sc);
  } else if (uMode == 3) {
    float fr = pow(1.0 - nv, 2.4), hx = texture(uNoise, vUV * vec2(7.0, 3.5) + vec2(tm * 0.06, 0.0)).b;
    float rip = smoothstep(0.08, 0.0, abs(vUV.y - fract(tm * 0.9 + uPar.z)));
    a = (fr * 1.25 + 0.07 + 0.3 * smoothstep(0.56, 0.62, hx) + rip * 0.35) * env; rgb = mix(uCB.rgb, uCA.rgb, fr);
  } else if (uMode == 6) {
    float fr = pow(1.0 - nv, 1.5); a = (0.16 + fr * 0.95 + 0.25 * smoothstep(0.9, 1.0, vUV.y)) * env; rgb = mix(uCB.rgb, uCA.rgb, fr);
  } else {
    float nz = texture(uNoise, vUV * vec2(3.0, 2.0) + uPar.z).r * 0.7 + texture(uNoise, vUV * vec2(9.0, 6.0)).b * 0.3;
    float dk = uMode == 4 ? smoothstep(0.7, 1.0, k) * 1.05 : uPar.w;
    if (nz < dk) discard;
    float edge = smoothstep(dk + 0.14, dk, nz) * step(0.001, dk);
    vec3 L = normalize(vec3(-0.4, 0.8, -0.45)); float d = max(dot(n, L), 0.0), sp = pow(max(dot(reflect(-L, n), v), 0.0), 20.0), fr = pow(1.0 - nv, 2.0);
    rgb = uCB.rgb * (0.4 + 0.6 * d) + uCA.rgb * (fr * 0.8 + sp * 1.3 + edge * 2.5); a = 1.0;
  }
  a = clamp(a, 0.0, 1.6) * uCA.a;
  o = vec4(rgb * a * mix(1.0, uTAG.z * 0.6, uTAG.y), min(a, 1.0) * (1.0 - uTAG.y));
}`;

function buildMeshes() {
  const v = []; const ranges = [];
  const tri = (a, b, c) => { for (const p of [a, b, c]) v.push(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]); };
  const begin = () => v.length / 8, end = (f) => ranges.push([f, v.length / 8 - f]);
  let f;
  // 0 초승달: XZ 평면, +x 가 가운데, 바깥 반지름 1. uv = (호를 따라, 안→밖)
  f = begin(); { const A = 1.25, S = 22; let prev = null;
    for (let i = 0; i <= S; i++) { const t = i / S, th = -A + 2 * A * t, w = 0.42 * Math.pow(Math.max(0, Math.cos((t - 0.5) * Math.PI)), 0.7) + 0.02, c = Math.cos(th), s = Math.sin(th);
      const cur = [[c * (1 - w), 0, s * (1 - w), 0, 1, 0, t, 0], [c, 0, s, 0, 1, 0, t, 1]];
      if (prev) { tri(prev[0], prev[1], cur[1]); tri(prev[0], cur[1], cur[0]); } prev = cur; } } end(f);
  // 1 원통: 반지름 1, y 0..1
  f = begin(); { const S = 16; for (let i = 0; i < S; i++) { const a0 = i / S * 6.2832, a1 = (i + 1) / S * 6.2832, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const p00 = [c0, 0, s0, c0, 0, s0, i / S, 0], p10 = [c1, 0, s1, c1, 0, s1, (i + 1) / S, 0], p01 = [c0, 1, s0, c0, 0, s0, i / S, 1], p11 = [c1, 1, s1, c1, 0, s1, (i + 1) / S, 1];
    tri(p00, p10, p11); tri(p00, p11, p01); } } end(f);
  // 2 원뿔: 꼭짓점 = 원점, +z 로 길이 1, 밑면 반지름 1
  f = begin(); { const S = 16; for (let i = 0; i < S; i++) { const a0 = i / S * 6.2832, a1 = (i + 1) / S * 6.2832, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), cm = Math.cos((a0 + a1) / 2), sm = Math.sin((a0 + a1) / 2);
    tri([0, 0, 0, cm * 0.7, sm * 0.7, -0.7, (i + 0.5) / S, 0], [c0, s0, 1, c0 * 0.7, s0 * 0.7, -0.7, i / S, 1], [c1, s1, 1, c1 * 0.7, s1 * 0.7, -0.7, (i + 1) / S, 1]); } } end(f);
  // 3 구: 반지름 1
  f = begin(); { const SU = 16, SV = 10; const P = (i, j) => { const th = i / SU * 6.2832, ph = j / SV * Math.PI, sp = Math.sin(ph), x = Math.cos(th) * sp, y = Math.cos(ph), z = Math.sin(th) * sp; return [x, y, z, x, y, z, i / SU, j / SV]; };
    for (let j = 0; j < SV; j++) for (let i = 0; i < SU; i++) { if (j > 0) tri(P(i, j), P(i + 1, j), P(i + 1, j + 1)); if (j < SV - 1) tri(P(i, j), P(i + 1, j + 1), P(i, j + 1)); } } end(f);
  // 4 얼음 가시 다발 (7개): uv.x = 솟는 순서, uv.y = 높이
  f = begin(); { const R = (() => { let s = 77; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
    const nrm = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2]; let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx; const l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; };
    const face = (a, b, c, ph) => { const n = nrm(a, b, c); tri([a[0], a[1], a[2], n[0], n[1], n[2], ph, a[1]], [b[0], b[1], b[2], n[0], n[1], n[2], ph, b[1]], [c[0], c[1], c[2], n[0], n[1], n[2], ph, c[1]]); };
    for (let sI = 0; sI < 7; sI++) {
      const ang = sI === 0 ? 0 : (sI - 1) / 6 * 6.2832 + R() * 0.5, dist = sI === 0 ? 0 : 0.42 + R() * 0.2, h = sI === 0 ? 1 : 0.5 + R() * 0.35, rb = sI === 0 ? 0.2 : 0.11 + R() * 0.06;
      const bx = Math.cos(ang) * dist, bz = Math.sin(ang) * dist, lx = Math.cos(ang) * dist * 0.55 * h, lz = Math.sin(ang) * dist * 0.55 * h, ph = sI / 7, rot = R() * 1.5;
      const base = [], mid = []; for (let q = 0; q < 4; q++) { const a = rot + q * Math.PI / 2; base.push([bx + Math.cos(a) * rb * 0.6, 0, bz + Math.sin(a) * rb * 0.6]); mid.push([bx + lx * 0.35 + Math.cos(a) * rb, h * 0.35, bz + lz * 0.35 + Math.sin(a) * rb]); }
      const tip = [bx + lx, h, bz + lz];
      for (let q = 0; q < 4; q++) { const q2 = (q + 1) % 4; face(base[q], mid[q2], base[q2], ph); face(base[q], mid[q], mid[q2], ph); face(mid[q], tip, mid[q2], ph); }
    } } end(f);
  // 5 종: 회전체, 꼭대기 y=1 (매단 점), 입 y=0, 반지름 최대 0.86
  f = begin(); { const prof = [[0.02, 1.0], [0.16, 0.985], [0.28, 0.92], [0.35, 0.74], [0.4, 0.5], [0.5, 0.26], [0.7, 0.07], [0.86, 0.0]], S = 14;
    const P = (i, j) => { const a = i / S * 6.2832, r = prof[j][0], y = prof[j][1], j0 = Math.max(0, j - 1), j1 = Math.min(prof.length - 1, j + 1), dr = prof[j1][0] - prof[j0][0], dy = prof[j1][1] - prof[j0][1], l = Math.hypot(dr, dy) || 1, nr = -dy / l, ny = dr / l; return [Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a) * nr, ny, Math.sin(a) * nr, i / S, 1 - y]; };
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < S; i++) { tri(P(i, j), P(i + 1, j), P(i + 1, j + 1)); tri(P(i, j), P(i + 1, j + 1), P(i, j + 1)); } } end(f);
  return { data: new Float32Array(v), ranges };
}

const MF = 32;   // 인스턴스당 float: 행렬 16 · 색A 4 · 색B 4 · (t0, life, seed, p1) · (mesh, mode, add, 0)
export class Meshes {
  constructor(gl, maxCap, tex) {
    this.gl = gl; this.max = maxCap; this.cap = maxCap; this.tex = tex;
    this.d = new Float32Array(maxCap * MF); this.death = new Float32Array(maxCap); this.gen = new Uint16Array(maxCap); this.mat = new Float32Array(16);
    this.time = 0; this.live = 0; this.draws = 0; this.tris = 0; this.hi = 0;
    const g = buildMeshes(); this.ranges = g.ranges; this.triTotal = g.data.length / 24;
    this.pr = program(gl, M_VS, M_FS, 'meshes');
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, g.data, gl.STATIC_DRAW); this.bytes = g.data.byteLength;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindVertexArray(null);
    gl.useProgram(this.pr.p); gl.uniform1i(this.pr.u.uNoise, 1);
  }
  reset(cap) { this.cap = Math.min(this.max, cap); this.death.fill(0); this.hi = 0; }
  /**
   * 메시 하나. 기준틀: X = 앞(fx,fy,fz 단위 벡터), Y = 위(ux,uy,uz), Z = X×Y. 크기 (sx, sy, sz).
   * colA = 밝은 색 [r,g,b,a], colB = 어두운 색, add 더하기(1)/보통(0), p1 = 방식별 값 (SLASH 시작 배율 · BEAM 위쪽 스러짐 · SOLID 분해 0..1 · BELL 흔들림 빠르기)
   */
  spawn(mesh, mode, x, y, z, fx, fy, fz, ux, uy, uz, sx, sy, sz, life, colA, colB, add, p1) {
    const cap = this.cap, t = this.time; let i = -1, bd = 1e30;
    for (let j = 0; j < cap; j++) { if (this.death[j] <= t) { i = j; break; } if (this.death[j] < bd) { bd = this.death[j]; i = j; } }
    this.gen[i] = (this.gen[i] + 1) & 0x3ff; if (i >= this.hi) this.hi = i + 1;
    const o = i * MF, D = this.d, zx = fy * uz - fz * uy, zy = fz * ux - fx * uz, zz = fx * uy - fy * ux;
    D[o] = fx * sx; D[o + 1] = fy * sx; D[o + 2] = fz * sx; D[o + 3] = 0;
    D[o + 4] = ux * sy; D[o + 5] = uy * sy; D[o + 6] = uz * sy; D[o + 7] = 0;
    D[o + 8] = zx * sz; D[o + 9] = zy * sz; D[o + 10] = zz * sz; D[o + 11] = 0;
    D[o + 12] = x; D[o + 13] = y; D[o + 14] = z; D[o + 15] = 1;
    D[o + 16] = colA[0]; D[o + 17] = colA[1]; D[o + 18] = colA[2]; D[o + 19] = colA[3];
    D[o + 20] = colB[0]; D[o + 21] = colB[1]; D[o + 22] = colB[2]; D[o + 23] = colB[3];
    D[o + 24] = t; D[o + 25] = life; D[o + 26] = rnd(); D[o + 27] = p1;
    D[o + 28] = mesh; D[o + 29] = mode; D[o + 30] = add; D[o + 31] = 0;
    this.death[i] = t + life;
    return i | (this.gen[i] << 8);
  }
  _ok(h) { const i = h & 0xff; return h >= 0 && this.gen[i] === (h >> 8) && this.death[i] > this.time ? i : -1; }
  move(h, x, y, z) { const i = this._ok(h); if (i < 0) return; const o = i * MF; this.d[o + 12] = x; this.d[o + 13] = y; this.d[o + 14] = z; }
  setP1(h, p) { const i = this._ok(h); if (i >= 0) this.d[i * MF + 27] = p; }
  kill(h) { const i = this._ok(h); if (i >= 0) this.death[i] = 0; }
  update(time) { this.time = time; let n = 0, hi = 0; for (let i = 0; i < this.hi; i++) if (this.death[i] > time) { n++; hi = i + 1; } this.live = n; this.hi = hi; }
  draw(cam, gain) {
    this.draws = 0; this.tris = 0; if (!this.live) return;
    const gl = this.gl, u = this.pr.u, D = this.d, t = this.time;
    gl.useProgram(this.pr.p); gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uEye, cam.eye);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tex.noise); gl.activeTexture(gl.TEXTURE0);
    for (let i = 0; i < this.hi; i++) {
      if (this.death[i] <= t) continue; const o = i * MF, age = t - D[o + 24];
      for (let q = 0; q < 16; q++) this.mat[q] = D[o + q];
      gl.uniformMatrix4fv(u.uM, false, this.mat);
      gl.uniform4f(u.uCA, D[o + 16], D[o + 17], D[o + 18], D[o + 19]); gl.uniform4f(u.uCB, D[o + 20], D[o + 21], D[o + 22], D[o + 23]);
      gl.uniform4f(u.uPar, age / D[o + 25], age, D[o + 26], D[o + 27]); gl.uniform1i(u.uMode, D[o + 29]); gl.uniform3f(u.uTAG, t, D[o + 30], gain);
      const rg = this.ranges[D[o + 28]];
      gl.drawArrays(gl.TRIANGLES, rg[0], rg[1]); this.draws++; this.tris += rg[1] / 3;
    }
  }
  /** 디버그용: 화면 넓이 추정(단위²) — 크기 벡터로 어림 */
  measure() {
    let area = 0; const D = this.d, t = this.time;
    for (let i = 0; i < this.hi; i++) { if (this.death[i] <= t) continue; const o = i * MF, sx = Math.hypot(D[o], D[o + 1], D[o + 2]), sy = Math.hypot(D[o + 4], D[o + 5], D[o + 6]), sz = Math.hypot(D[o + 8], D[o + 9], D[o + 10]);
      const m = D[o + 28]; area += m === MESH.CRESCENT ? sx * sz * 0.9 : m === MESH.TUBE ? 2 * sx * sy : m === MESH.CONE ? sx * sz : 3.2 * sx * Math.max(sy, sz) * (m === MESH.SHARDS ? 0.5 : 1); }
    return { n: this.live, area };
  }
  dispose() { const gl = this.gl; gl.deleteBuffer(this.buf); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.pr.p); }
}

// ═════════════════════════ 잠깐 사는 빛 ═════════════════════════
export const MAX_LIGHTS = 8;
/** 장면 셰이더에 붙여 쓰는 GLSL (ES 1.00 · 3.00 공용). uFxLP = (x,y,z,반지름) · uFxLC = (r,g,b,·) × 8. docs/v2/FX.md §3.4 */
export const FX_LIGHT_GLSL = `
uniform vec4 uFxLP[8]; uniform vec4 uFxLC[8];
vec3 fxLights(vec3 wp, vec3 n) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec3 d = uFxLP[i].xyz - wp; float q = dot(d, d) / (uFxLP[i].w * uFxLP[i].w + 0.0001);
    float a = max(0.0, 1.0 - q); a *= a;
    s += uFxLC[i].rgb * (a * (0.35 + 0.65 * max(dot(n, d * inversesqrt(dot(d, d) + 1.0)), 0.0)));
  }
  return s;
}`;
export class Lights {
  constructor(max) {
    this.max = max; this.cap = max; this.pos = new Float32Array(MAX_LIGHTS * 4); this.col = new Float32Array(MAX_LIGHTS * 4); this.count = 0;
    this.s = new Float32Array(max * 12);   // x y z r · cr cg cb i · t0 life flicker curve
    this.death = new Float32Array(max); this.gen = new Uint16Array(max); this.time = 0;
  }
  reset(cap) { this.cap = Math.min(this.max, cap); this.death.fill(0); this.count = 0; }
  /** 점광. col [r,g,b], inten 세기, life 초, flicker 0..1 (떨림), curve 0 = 스러짐 · 1 = 켜진 채(손잡이로 끈다) */
  add(x, y, z, radius, col, inten, life, flicker, curve) {
    const t = this.time; let i = -1, bd = 1e30;
    for (let j = 0; j < this.cap; j++) { if (this.death[j] <= t) { i = j; break; } if (this.death[j] < bd) { bd = this.death[j]; i = j; } }
    const o = i * 12, S = this.s; this.gen[i] = (this.gen[i] + 1) & 0x3ff;
    S[o] = x; S[o + 1] = y; S[o + 2] = z; S[o + 3] = radius; S[o + 4] = col[0]; S[o + 5] = col[1]; S[o + 6] = col[2]; S[o + 7] = inten; S[o + 8] = t; S[o + 9] = life; S[o + 10] = flicker; S[o + 11] = curve;
    this.death[i] = t + life; return i | (this.gen[i] << 8);
  }
  _ok(h) { const i = h & 0xff; return h >= 0 && this.gen[i] === (h >> 8) && this.death[i] > this.time ? i : -1; }
  move(h, x, y, z) { const i = this._ok(h); if (i < 0) return; const o = i * 12; this.s[o] = x; this.s[o + 1] = y; this.s[o + 2] = z; }
  kill(h) { const i = this._ok(h); if (i >= 0) this.death[i] = 0; }
  /** 프레임마다: 살아 있는 빛을 pos/col 배열(장면 셰이더용)에 채운다 */
  update(time) {
    this.time = time; let n = 0; const S = this.s, P = this.pos, C = this.col;
    for (let i = 0; i < this.cap; i++) {
      if (this.death[i] <= time) continue; const o = i * 12, k = (time - S[o + 8]) / S[o + 9];
      let a = S[o + 7] * (S[o + 11] > 0.5 ? Math.min(1, k * 12) * Math.min(1, (1 - k) * 6) : (1 - k) * (1 - k));
      if (S[o + 10] > 0) a *= 1 - S[o + 10] * (0.5 + 0.5 * Math.sin(time * 61 + i * 2.1) * Math.sin(time * 37 + i));
      const q = n * 4; P[q] = S[o]; P[q + 1] = S[o + 1]; P[q + 2] = S[o + 2]; P[q + 3] = S[o + 3]; C[q] = S[o + 4] * a; C[q + 1] = S[o + 5] * a; C[q + 2] = S[o + 6] * a; C[q + 3] = a; n++;
    }
    this.count = n;
    for (let q = n * 4; q < MAX_LIGHTS * 4; q++) { P[q] = 0; C[q] = 0; }
  }
}
