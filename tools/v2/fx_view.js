// v2 fx — 시험 화면 (tools/v2/fx_view.html). 게임과 같은 투영(초점 880 · 내려보는 각 20° · 거리 790)으로
// 달빛 받은 돌바닥과 인형 몇 개를 그리고, 그 위에 src/v2/fx 의 효과를 낸다. 게임 코드는 건드리지 않는다.
//   ?tier=low|mid|high  ?ui=0 (단추 숨김)  ?dpr=1 (배율 상한)  ?post=0
// window.__fx = 검사·캡처용 손잡이 (tools/v2/fx_check.mjs 가 쓴다).
import { createFx, FX_LIGHT_GLSL, FX_DISSOLVE_GLSL, hurtFlash, hurtShake, dissolveK, PRESET_LIST, PRESET_IDS, TIERS } from '../../src/v2/fx/index.js';
import { program } from '../../src/v2/fx/engine.js';
import { TRAIL } from '../../src/v2/fx/presets.js';

const qs = new URLSearchParams(location.search);
const cv = document.getElementById('c'), statsEl = document.getElementById('stats');
if (qs.get('ui') === '0') document.body.classList.add('noui');
const gl = cv.getContext('webgl2', { alpha: false, antialias: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
if (!gl) { statsEl.textContent = 'WebGL2 를 쓸 수 없습니다'; throw new Error('no webgl2'); }

const sfxSeen = new Set();
const fx = createFx(gl, { tier: qs.get('tier') || 'mid', post: qs.get('post') !== '0', onEvent: (name) => { sfxSeen.add(name); } });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ───────── 카메라 (src/v2/b/index.js _camera·_matrix 와 같은 식) ─────────
const FOCAL = 880, NEAR = 60, FAR = 24000;
const view = { W: 960, H: 726, dpr: 1 };
const camS = { yaw: 0.21, pitch: 0.349, dist: 790, lookY: 60, tx: 130, ty: 0, tz: 50 };
const cam = { vp: new Float32Array(16), eye: new Float32Array(3), right: new Float32Array(3), up: new Float32Array(3), fwd: new Float32Array(3) };
const eye0 = new Float32Array(3);
function resize() {
  const cw = Math.max(1, window.innerWidth), ch = Math.max(1, window.innerHeight), asp = cw / ch;
  view.W = clamp(Math.round(540 * asp), 960, 1280); view.H = clamp(Math.round(view.W / asp), 540, 760);
  view.dpr = Math.min(window.devicePixelRatio || 1, Number(qs.get('dpr')) || 1.5);
  const small = window.__fx && window.__fx.small;   // 측정용: 아주 작은 캔버스 (개수·CPU 시간은 해상도와 무관하다)
  const bw = small ? 160 : Math.round(cw * view.dpr), bh = small ? 120 : Math.round(ch * view.dpr);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
}
function camera() {
  const c = camS, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), tall = Math.max(0, view.H - 540);
  const lx = c.tx, ly = c.ty + c.lookY + tall * 0.4, lz = c.tz;
  eye0[0] = lx - Math.sin(c.yaw) * cp * c.dist; eye0[1] = ly + sp * c.dist; eye0[2] = lz - Math.cos(c.yaw) * cp * c.dist;
  let fxx = lx - eye0[0], fy = ly - eye0[1], fz = lz - eye0[2]; const fl = Math.hypot(fxx, fy, fz); fxx /= fl; fy /= fl; fz /= fl;
  const rl = Math.hypot(fz, fxx) || 1, rx = fz / rl, rz = -fxx / rl, ux = fy * rz, uy = fz * rx - fxx * rz, uz = -fy * rx;
  cam.right[0] = rx; cam.right[1] = 0; cam.right[2] = rz; cam.up[0] = ux; cam.up[1] = uy; cam.up[2] = uz; cam.fwd[0] = fxx; cam.fwd[1] = fy; cam.fwd[2] = fz;
  fx.feel.applyToEye(eye0, cam.right, cam.up, cam.eye);                       // 흔들림·밀림
  const px = cam.eye[0], py = cam.eye[1], pz = cam.eye[2];
  const F = FOCAL * (1 + tall / 540 * 0.3) * fx.feel.cam.zoom;                // 줌 펀치
  const sx = F / (view.W / 2), sy = F / (view.H / 2), A = (FAR + NEAR) / (FAR - NEAR), B = -2 * FAR * NEAR / (FAR - NEAR);
  const rd = -(rx * px + rz * pz), ud = -(ux * px + uy * py + uz * pz), fd = -(fxx * px + fy * py + fz * pz), m = cam.vp;
  m[0] = sx * rx; m[4] = 0; m[8] = sx * rz; m[12] = sx * rd;
  m[1] = sy * ux; m[5] = sy * uy; m[9] = sy * uz; m[13] = sy * ud;
  m[2] = A * fxx; m[6] = A * fy; m[10] = A * fz; m[14] = A * fd + B;
  m[3] = fxx; m[7] = fy; m[11] = fz; m[15] = fd;
}

// ───────── 장면: 돌바닥 · 뒷벽 · 인형 ─────────
const SVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV;
uniform mat4 uVP; uniform vec4 uMove;   // (x, y, z, 좌우 뒤집기)
out vec3 vW; out vec3 vN; out vec2 vUV;
void main() { vec3 p = vec3(aPos.x * uMove.w, aPos.y, aPos.z) + uMove.xyz; vW = p; vN = vec3(aN.x * uMove.w, aN.y, aN.z); vUV = aUV; gl_Position = uVP * vec4(p, 1.0); }`;
const SFS = `#version 300 es
precision highp float;
#define TEX texture
${FX_LIGHT_GLSL}
${FX_DISSOLVE_GLSL}
uniform sampler2D uTex; uniform vec3 uEye; uniform vec4 uTint; uniform vec4 uFlash; uniform vec4 uSh[14]; uniform vec3 uFogC;
in vec3 vW; in vec3 vN; in vec2 vUV; out vec4 o;
void main() {
  vec3 n = normalize(vN);
  float de = fxDissolve(vW); if (de < 0.0) discard;
  vec3 alb = mix(vec3(1.0), texture(uTex, vUV).rgb, uTint.a) * uTint.rgb;
  vec3 L = normalize(vec3(-0.45, 0.8, -0.4));
  vec3 lit = vec3(0.13, 0.16, 0.27) + vec3(0.36, 0.43, 0.62) * max(dot(n, L), 0.0);
  vec3 d1 = vec3(-300.0, 170.0, 330.0) - vW, d2 = vec3(520.0, 170.0, 330.0) - vW;        // 벽등 두 개 (고정)
  lit += vec3(1.0, 0.62, 0.3) * (pow(max(0.0, 1.0 - dot(d1, d1) / 250000.0), 2.0) * max(dot(n, normalize(d1)), 0.0) + pow(max(0.0, 1.0 - dot(d2, d2) / 250000.0), 2.0) * max(dot(n, normalize(d2)), 0.0)) * 0.9;
  lit += fxLights(vW, n) * 1.5;                                                         // 효과의 빛
  float sh = 1.0;
  if (uTint.a > 0.5 && vW.y < 1.0) for (int i = 0; i < 14; i++) sh *= 1.0 - uSh[i].z * smoothstep(uSh[i].w, uSh[i].w * 0.25, length((vW.xz - uSh[i].xy) * vec2(1.0, 1.5)));
  vec3 c = alb * lit * sh;
  vec3 v = normalize(uEye - vW);
  if (uTint.a < 0.5) c += pow(1.0 - max(dot(n, v), 0.0), 3.0) * vec3(0.1, 0.15, 0.26);
  c = mix(c, vec3(0.92, 0.94, 1.0), uFlash.x * 0.85);
  c += vec3(3.0, 1.2, 0.3) * de * step(0.001, uFxDis.x);
  float f = clamp((length(uEye - vW) - 760.0) / 2540.0, 0.0, 1.0);
  o = vec4(mix(c, uFogC, f * (2.0 - f) * 0.85), 1.0);
}`;
const sp = program(gl, SVS, SFS, 'view.scene');
function buildScene() {
  const v = [];
  const quad = (a, b, c, d, n, us) => { const P = [a, b, c, a, c, d]; for (const p of P) v.push(p[0], p[1], p[2], n[0], n[1], n[2], (us ? p[0] : p[0]) / 256, (us ? p[2] : p[1]) / 256); };
  quad([-1700, 0, -700], [1900, 0, -700], [1900, 0, 480], [-1700, 0, 480], [0, 1, 0], true);          // 바닥
  const floorN = v.length / 8;
  quad([-1700, 0, 480], [1900, 0, 480], [1900, 340, 480], [-1700, 340, 480], [0, 0, -1], false);     // 뒷벽
  const wallN = v.length / 8 - floorN;
  // 인형: 회전체 (몸통 + 머리), 앞뒤로 조금 납작하게
  const prof = [[0.5, 0], [10, 0], [11.5, 12], [10, 40], [15, 46], [17.5, 62], [19.5, 76], [14, 84], [7, 88], [11.5, 92.5], [13.5, 100], [11.5, 107.5], [6, 112], [0.5, 114]], SEG = 12, first = v.length / 8;
  const P = (i, j) => { const a = i / SEG * 6.2832, r = prof[j][0], y = prof[j][1], j0 = Math.max(0, j - 1), j1 = Math.min(prof.length - 1, j + 1), dr = prof[j1][0] - prof[j0][0], dy = prof[j1][1] - prof[j0][1], l = Math.hypot(dr, dy) || 1; return [Math.cos(a) * r, y, Math.sin(a) * r * 0.72, Math.cos(a) * dy / l, -dr / l, Math.sin(a) * dy / l, 0, 0]; };
  for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < SEG; i++) for (const p of [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j), P(i + 1, j + 1), P(i, j + 1)]) v.push(...p);
  const dummyN = v.length / 8 - first;
  const buf = gl.createBuffer(), vao = gl.createVertexArray();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  gl.bindVertexArray(null);
  return { vao, floorN, wallN, first, dummyN, tris: v.length / 24 };
}
const scene = buildScene();
// 바닥 텍스처: 게임의 성 돌바닥 타일. 못 읽으면 단색 (1×1)
const floorTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, floorTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([120, 122, 132, 255]));
{ const img = new Image(); img.onload = () => { gl.bindTexture(gl.TEXTURE_2D, floorTex); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT); api.texReady = true; }; img.onerror = () => { api.texReady = true; }; img.src = '../../assets/tex/tex_castle_stone.webp'; }

// 인형: 0 = 영웅, 1–4 = 늘 보이는 적, 5–12 = '난전' 때만
const D = [];
const mk = (x, z, tint, face) => D.push({ x, z, tint, face, hitT: -9, stop: 0, deadT: -9, ash: 0, off: 0, show: true });
mk(-60, 30, [0.3, 0.46, 0.85], 1); mk(40, 30, [0.82, 0.8, 0.72], -1); mk(300, -40, [0.62, 0.26, 0.26], -1); mk(380, 130, [0.82, 0.8, 0.72], -1); mk(170, 190, [0.5, 0.42, 0.62], -1);
for (let i = 0; i < 8; i++) mk(110 + (i % 4) * 130 + (i > 3 ? 60 : 0), i > 3 ? -120 : 110 + (i % 2) * 90, i % 2 ? [0.82, 0.8, 0.72] : [0.62, 0.26, 0.26], -1);
let showAll = false;
const shArr = new Float32Array(14 * 4), FOG = [0.035, 0.045, 0.085];
function drawScene() {
  const u = sp.u, now = fx.feel.t;
  gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.CULL_FACE);
  gl.clearColor(FOG[0], FOG[1], FOG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(sp.p); gl.bindVertexArray(scene.vao);
  gl.uniformMatrix4fv(u.uVP, false, cam.vp); gl.uniform3fv(u.uEye, cam.eye); gl.uniform3f(u.uFogC, FOG[0], FOG[1], FOG[2]);
  fx.uploadLights(u.uFxLP, u.uFxLC);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fx.tex.noise); gl.uniform1i(u.uFxNoise, 2);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, floorTex); gl.uniform1i(u.uTex, 0);
  for (let i = 0; i < 14; i++) { const d = D[i], o = i * 4, vis = d && d.show && (showAll || i < 5) && now - d.deadT > 1.6; shArr[o] = d ? d.x + d.off : 0; shArr[o + 1] = d ? d.z : 0; shArr[o + 2] = vis ? 0.62 : 0; shArr[o + 3] = 34; }
  gl.uniform4fv(u.uSh, shArr); gl.uniform4f(u.uFlash, 0, 0, 0, 0); gl.uniform4f(u.uFxDis, 0, 0.12, 0.012, 0); gl.uniform4f(u.uMove, 0, 0, 0, 1);
  gl.uniform4f(u.uTint, 0.92, 0.94, 1.02, 1); gl.drawArrays(gl.TRIANGLES, 0, scene.floorN);
  gl.uniform4f(u.uTint, 0.6, 0.62, 0.72, 1); gl.drawArrays(gl.TRIANGLES, scene.floorN, scene.wallN);
  let n = 2;
  for (let i = 0; i < D.length; i++) {
    const d = D[i]; if (!d.show || (!showAll && i >= 5)) continue;
    const dead = now - d.deadT; if (dead >= 0 && dead < 1.6 && !(d.ash && dead < 0.9)) continue;
    const age = now - d.hitT;
    gl.uniform4f(u.uMove, d.x + d.off + hurtShake(age, d.stop, 3), 0, d.z, d.face);
    gl.uniform4f(u.uTint, d.tint[0], d.tint[1], d.tint[2], 0); gl.uniform4f(u.uFlash, hurtFlash(age), 0, 0, 0);
    gl.uniform4f(u.uFxDis, d.ash && dead >= 0 && dead < 0.9 ? dissolveK(dead, 0.9) : 0, 0.12, 0.012, i * 0.37);
    gl.drawArrays(gl.TRIANGLES, scene.first, scene.dummyN); n++;
  }
  gl.bindVertexArray(null);
  return n;
}

// ───────── 효과 쏘기 ─────────
const ID = PRESET_IDS, hero = D[0];
const hurt = (d, stop) => { d.hitT = fx.feel.t; d.stop = stop; };
function fire(name, target) {
  const p = PRESET_LIST[ID[name]]; if (!p) return;
  const e = target || (p.args === 'aim' || name.startsWith('enemy.death') ? D[2] : D[1]);
  if (name === 'enemy.breath') { const b = D[2]; fx.playAt(p.id, b.x, 0, b.z, -1, 0, 1, 0, 0, 0); return; }
  if (name === 'ult.bloodmoon') { fx.playAt(p.id, 150, 0, 60, 1, 0, 1, 0, 0, 0); return; }
  if (p.args === 'hit') { fx.playAt(p.id, e.x - 12, 62, e.z - 4, 1, 0, name === 'hit.guard' && (api.alt = !api.alt) ? 1.5 : 1, 0, 0, 0); hurt(e, name.includes('heavy') || name === 'hit.blunt' ? 0.1 : name === 'hit.finisher' ? 0.13 : 0.06); return; }
  if (name.startsWith('enemy.death')) { fx.playAt(p.id, e.x, 0, e.z, 1, 0, 1, 0, 0, 0); e.deadT = fx.feel.t; e.ash = name.endsWith('ash') ? 1 : 0; return; }
  if (name === 'pickup') { api.pk = ((api.pk | 0) % 3) + 1; fx.playAt(p.id, 150, 0, 110, 1, 0, api.pk, 0, 0, 0); return; }
  if (name === 'swing.light' || name === 'swing.heavy') { api.alt = !api.alt; fx.playAt(p.id, hero.x, 0, hero.z, 1, 0, api.alt ? 1 : -1, 0, 0, 0); return; }
  fx.playAt(p.id, hero.x, 0, hero.z, 1, 0, 1.4, e.x, 0, e.z);
}

// 칼 궤적 시범: 가짜 칼(손목에서 24–88 떨어진 두 점)을 0.09초 동안 휘둘러 띠에 넣는다
const sw = { on: false, t: 0, dur: 0.09, roll: 0, h: -1, heavy: false };
function swing(roll, heavy) { sw.on = true; sw.t = 0; sw.roll = roll; sw.heavy = heavy; sw.dur = heavy ? 0.12 : 0.09; sw.h = fx.ribbons.start(heavy ? TRAIL.bladeHeavy : TRAIL.blade); }
function swingStep(dt) {
  if (!sw.on) return; sw.t += dt; const k = Math.min(1, sw.t / sw.dur), th = -1.35 + 2.7 * k, s = Math.sin(sw.roll), c = Math.cos(sw.roll);
  // 기준틀: X = (1,0,0), Y = (0, c, s) → Z = X×Y = (0, −s, c)
  const cx = Math.cos(th), sz = Math.sin(th), px = hero.x + hero.off + 10, py = 62, pz = hero.z, r0 = 24, r1 = sw.heavy ? 104 : 88;
  fx.ribbons.push(sw.h, px + cx * r0, py + sz * -s * r0, pz + sz * c * r0, px + cx * r1, py + sz * -s * r1, pz + sz * c * r1);
  if (k >= 1) { sw.on = false; fx.ribbons.end(sw.h); }
}

// ───────── 시범 (시간표는 놀이 시간으로 흐른다 → 타격 멈춤·슬로모션이 그대로 걸린다) ─────────
const DEMOS = {
  combo: [
    [0.10, () => { swing(0.5, false); fx.sfx('swing.light', hero.x, 0, hero.z, 1); hero.off = 8; }], [0.16, () => fire('hit.slash.light')],
    [0.42, () => { swing(-0.6, false); fx.sfx('swing.light', hero.x, 0, hero.z, 1); hero.off = 14; }], [0.48, () => fire('hit.slash.light')],
    [0.76, () => { swing(1.2, true); fx.playAt(ID['swing.heavy'], hero.x + 14, 0, hero.z, 1, 0, 1, 0, 0, 0); hero.off = 22; }], [0.84, () => fire('hit.slash.heavy')],
    [1.18, () => { fx.playAt(ID['move.dash'], hero.x + 10, 0, hero.z, 1, 0, 1, 0, 0, 0); hero.off = 40; }],
    [1.3, () => { swing(-1.25, true); fx.playAt(ID['swing.heavy'], hero.x + 40, 0, hero.z, 1, 0, -1.25, 0, 0, 0); }],
    [1.39, () => { fire('hit.finisher'); }], [1.42, () => fire('enemy.death.bone', D[1])],
    [2.3, () => { hero.off = 0; }], [3.2, () => {}],
  ],
  spells: [
    [0.1, () => fire('fire.bolt')], [0.95, () => fire('ice.lance')], [1.75, () => fire('lightning.chain')], [2.5, () => fire('holy.pillar', D[3])],
    [3.7, () => fire('blood.orb')], [4.9, () => fire('shadow.claws', D[1])], [5.7, () => fire('fire.pillar')], [7.0, () => fire('ice.nova')],
    [8.0, () => fire('lightning.strike', D[4])], [8.9, () => fire('holy.wave')], [9.7, () => fire('holy.bell')], [11.3, () => fire('fire.meteor')],
    [13.2, () => fire('ult.bloodmoon')], [17.2, () => {}],
  ],
};
const demo = { name: '', t: 0, i: 0 };
function startDemo(name) { fx.clear(); for (const d of D) { d.deadT = -9; d.hitT = -9; d.off = 0; } demo.t = 0; demo.i = 0; H.t = 0; H.nh = H.ns = H.nm = H.nb = H.nd = H.nv = 0; H.k = 0; demo.name = name; showAll = name === 'heavy'; }
function demoStep(gdt, realDt) {
  if (!demo.name) return;
  if (demo.name === 'heavy') { heavyStep(realDt); return; }   // 난전은 실제 시간으로 (타격 멈춤과 무관하게 적힌 빈도 그대로)
  const L = DEMOS[demo.name]; demo.t += gdt;
  while (demo.i < L.length && demo.t >= L[demo.i][0]) L[demo.i++][1]();
  if (demo.i >= L.length) demo.name = '';
}
// 난전: 적 12 · 초당 타격 6 · 발걸음 24 · 마법 2.5개(늘 3개쯤 떠 있다) · 큰 마법 2.4초마다 · 죽음 1.5초마다. 할당 없이 숫자만 넘긴다.
const H = { t: 0, nh: 0, ns: 0, nm: 0, nb: 0, nd: 0, nv: 0, k: 0 };
const SPELL = [ID['fire.bolt'], ID['ice.lance'], ID['blood.orb'], ID['fire.bolt'], ID['lightning.chain'], ID['blood.orb']];
const BIG = [ID['fire.pillar'], ID['lightning.strike'], ID['holy.pillar'], ID['ice.nova'], ID['shadow.claws'], ID['holy.bell']];
const HITS = [ID['hit.slash.light'], ID['hit.slash.light'], ID['hit.blunt'], ID['hit.pierce'], ID['hit.slash.heavy'], ID['hit.slash.light'], ID['hit.crit'], ID['hit.guard']];
function heavyStep(gdt) {
  H.t += gdt; const t = H.t;
  while (t >= H.nh) { H.nh += 1 / 6; const k = H.k++, e = D[1 + (k % 12)]; fx.playAt(HITS[k & 7], e.x - 12, 62, e.z, 1, 0, 1, 0, 0, 0); fx.playAt(ID['swing.light'], e.x - 90, 0, e.z, 1, 0, k & 1 ? 1 : -1, 0, 0, 0); e.hitT = fx.feel.t; e.stop = 0.06; }
  while (t >= H.ns) { H.ns += 1 / 24; const e = D[1 + ((H.k * 7 + ((t * 24) | 0)) % 12)]; fx.playAt(ID['move.step'], e.x, 0, e.z, 1, 0, 1, 0, 0, 0); }
  while (t >= H.nm) { H.nm += 0.4; const k = (t / 0.4) | 0, e = D[1 + ((k * 5) % 12)]; fx.playAt(SPELL[k % 6], e.x, 0, e.z, -1, 0, 1, hero.x + (k % 3) * 40, 0, hero.z + ((k % 5) - 2) * 30); }
  while (t >= H.nb) { H.nb += 2.4; const k = (t / 2.4) | 0, e = D[1 + ((k * 3) % 12)]; fx.playAt(BIG[k % 6], hero.x, 0, hero.z, 1, 0, 1, e.x, 0, e.z); }
  while (t >= H.nd) { H.nd += 1.5; const k = (t / 1.5) | 0, e = D[1 + ((k * 7) % 12)]; fx.playAt(k & 1 ? ID['enemy.death.ash'] : ID['enemy.death.bone'], e.x, 0, e.z, 1, 0, 1, 0, 0, 0); e.deadT = fx.feel.t; e.ash = k & 1; }
  while (t >= H.nv) { H.nv += 1.0; const k = (t | 0); fx.playAt(k & 1 ? ID['move.dash'] : ID['move.land'], hero.x, 0, hero.z, 1, 0, 1.3, 0, 0, 0); }
}

// ───────── 프레임 ─────────
let sceneDraws = 0, speed = 1;
function frame(realDt, render = true) {
  const gdt = fx.update(realDt);
  demoStep(gdt, realDt); swingStep(gdt);
  fx.setProtect(0, hero.x + hero.off, 55, hero.z, 46);       // 읽기 규칙: 영웅 앞을 지나는 큰 입자는 옅게
  camera();
  if (!render) return;
  fx.post.begin(cv.width, cv.height, null);
  sceneDraws = drawScene();
  fx.draw(cam);
  fx.post.end(fx.feel.screen);
}
let last = 0, fcount = 0, ema = 16.7;
function loop(now) {
  requestAnimationFrame(loop);
  if (api.manual) return;
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; ema += (dt * 1000 - ema) * 0.05;
  resize(); frame(dt * speed);
  if ((fcount++ % 8) === 0 && !document.body.classList.contains('noui')) hud();
}
function hud() {
  const s = fx.stats, T = TIERS[fx.tier], F = fx.feel;
  statsEl.textContent =
    `단계 ${fx.tier} · 후처리 ${fx.post.enabled ? '켬(' + fx.post.levels + ')' : '끔'} · ${cv.width}×${cv.height} (논리 ${view.W}×${view.H})\n` +
    `그리기: 효과 ${s.draws} + 장면 ${sceneDraws} + 후처리 ${s.postPasses}\n` +
    `입자 ${s.particles}/${T.particles} · 문양 ${s.quads}/${T.quads} · 띠 ${s.ribbons} (${s.ribbonVerts}v) · 메시 ${s.meshes} (${s.meshTris}△) · 빛 ${s.lights}/${T.lights} · 시퀀스 ${s.seqs}\n` +
    `덧칠 ${s.coverage.toFixed(2)}화면 · 밝기 ${s.gain.toFixed(2)} · 줄인 입자 ${s.dropped}\n` +
    `CPU 효과 ${(s.cpuUpdate + s.cpuDraw).toFixed(2)} ms · 프레임 ${ema.toFixed(1)} ms\n` +
    `시간 배율 ${F.timeScale.toFixed(2)} · 흔들림 ${F.trauma.toFixed(2)} · 소리 사건 ${s.sfx}\n` +
    `최근 소리: ${fx.sfxLog.filter(Boolean).slice(-4).join(' · ')}`;
}

// ───────── 단추 ─────────
const listEl = document.getElementById('list');
{ const G = { hit: '타격', move: '이동', enemy: '적 · 줍기', fire: '불', ice: '얼음', lightning: '번개', holy: '성', blood: '피 · 그림자', ult: '궁극기' }; let g = '';
  for (const p of PRESET_LIST) { if (p.group !== g) { g = p.group; const h = document.createElement('h4'); h.textContent = G[g] || g; listEl.appendChild(h); } const b = document.createElement('button'); b.textContent = p.ko; const sm = document.createElement('small'); sm.textContent = p.name; b.appendChild(sm); b.dataset.fx = p.name; b.addEventListener('click', () => fire(p.name)); listEl.appendChild(b); } }
document.getElementById('tgl').addEventListener('click', () => listEl.classList.toggle('hide'));
if (window.innerHeight < 480) listEl.classList.add('hide');
const tierEl = document.getElementById('tier'); tierEl.value = fx.tier; tierEl.addEventListener('change', () => fx.setTier(tierEl.value));
document.getElementById('post').checked = fx.postOn; document.getElementById('post').addEventListener('change', (e) => fx.setPost(e.target.checked));
document.getElementById('feel').addEventListener('change', (e) => { fx.feelOn = e.target.checked; });
document.getElementById('half').addEventListener('click', () => { speed = speed === 1 ? 0.5 : speed === 0.5 ? 0.2 : 1; document.getElementById('half').textContent = speed === 1 ? '½ 속도' : speed === 0.5 ? '⅕ 속도' : '제 속도'; });
for (const b of document.querySelectorAll('[data-demo]')) b.addEventListener('click', () => startDemo(b.dataset.demo));
window.addEventListener('resize', resize);

// ───────── 검사·캡처용 손잡이 ─────────
const api = window.__fx = {
  fx, fire, startDemo, frame, view, cam, D, presets: PRESET_LIST.map((p) => ({ name: p.name, group: p.group, ko: p.ko, args: p.args, sfx: p.sfx, feel: p.feel })), sfxSeen, manual: false, small: false, texReady: false, alt: false, pk: 0,
  get demoName() { return demo.name; },
  reset(tier) { if (tier) { fx.setTier(tier); tierEl.value = tier; } fx.clear(); fx.time = 0; for (const d of D) { d.deadT = -9; d.hitT = -9; d.off = 0; } demo.name = ''; showAll = false; sw.on = false; },
  /** dt 씩 n 프레임 (동기) */
  steps(n, dt, render = true) { resize(); for (let i = 0; i < n; i++) frame(dt, render); },
  /** 프리셋 하나의 비용: 혼자 쏘고 끝날 때까지 돌려 최댓값을 잰다 */
  cost(name, tier) {
    api.reset(tier); fx.feelOn = false; resize(); frame(1 / 60);
    const s0 = fx.particles.spawned; fire(name);
    const r = { name, emitted: 0, peakParticles: 0, peakDraws: 0, peakOverdraw: 0, peakQuads: 0, peakMeshes: 0, peakRibbons: 0, peakLights: 0, dur: 0 };
    for (let i = 0; i < 60 * 9; i++) {
      frame(1 / 60); const m = fx.measure(), s = fx.stats;
      r.peakParticles = Math.max(r.peakParticles, m.particles); r.peakDraws = Math.max(r.peakDraws, s.draws); r.peakOverdraw = Math.max(r.peakOverdraw, m.overdraw); r.peakQuads = Math.max(r.peakQuads, m.quads); r.peakMeshes = Math.max(r.peakMeshes, m.meshes); r.peakRibbons = Math.max(r.peakRibbons, m.ribbons); r.peakLights = Math.max(r.peakLights, m.lights);
      if (i > 20 && m.particles === 0 && m.meshes === 0 && m.ribbons === 0 && m.lights === 0 && fx.stats.seqs === 0 && (m.quads === 0 || i > 150)) { r.dur = i / 60; break; }
    }
    r.emitted = fx.particles.spawned - s0; r.peakOverdraw = Math.round(r.peakOverdraw * 1000) / 1000; fx.feelOn = true; return r;
  },
  /** 난전 seconds 초 (60 Hz): 프레임별 최댓값·평균 */
  heavy(tier, seconds) {
    api.reset(tier); startDemo('heavy'); resize();
    const r = { tier, frames: 0, draws: { max: 0, avg: 0 }, particles: { max: 0, avg: 0 }, live: { max: 0, avg: 0 }, overdraw: { max: 0, avg: 0 }, quads: { max: 0 }, meshes: { max: 0 }, meshTris: { max: 0 }, ribbons: { max: 0 }, ribbonVerts: { max: 0 }, lights: { max: 0 }, seqs: { max: 0 }, cpu: { max: 0, avg: 0, p95: 0 }, postPasses: 0, sceneDraws: 0, gainMin: 1, dropped: 0, spawned: 0 };
    const n = Math.round(seconds * 60), cpu = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      frame(1 / 60); const s = fx.stats, m = fx.measure(), c = s.cpuUpdate + s.cpuDraw; cpu[i] = c;
      const acc = (o, v) => { if (v > o.max) o.max = v; if (o.avg !== undefined) o.avg += v / n; };
      acc(r.draws, s.draws); acc(r.particles, s.particles); acc(r.live, m.particles); acc(r.overdraw, m.overdraw); acc(r.quads, s.quads); acc(r.meshes, s.meshes); acc(r.meshTris, s.meshTris); acc(r.ribbons, s.ribbons); acc(r.ribbonVerts, s.ribbonVerts); acc(r.lights, s.lights); acc(r.seqs, s.seqs); acc(r.cpu, c);
      r.gainMin = Math.min(r.gainMin, s.gain);
    }
    cpu.sort(); r.cpu.p95 = cpu[Math.floor(n * 0.95)]; r.frames = n; r.postPasses = fx.stats.postPasses; r.sceneDraws = sceneDraws; r.dropped = fx.stats.dropped; r.spawned = fx.stats.spawned;
    for (const k of ['draws', 'particles', 'live', 'overdraw', 'cpu']) { r[k].avg = Math.round(r[k].avg * 1000) / 1000; r[k].max = Math.round(r[k].max * 1000) / 1000; } r.cpu.p95 = Math.round(r.cpu.p95 * 1000) / 1000;
    demo.name = ''; return r;
  },
  /** 할당 검사: 난전을 warm 프레임 돌린 뒤 n 프레임 동안 JS 힙이 얼마나 느는지 (정밀 메모리 정보 + gc 가 켜진 크롬에서만 뜻이 있다) */
  alloc(tier, warm, n, mode) {
    api.reset(tier); startDemo(mode === 'idle' ? '' : 'heavy'); resize();
    if (mode === 'idle') { for (const p of PRESET_LIST) fire(p.name); }
    for (let i = 0; i < warm; i++) frame(1 / 60);
    if (mode === 'idle') { fx.clear(); for (const nm of ['fire.pillar', 'holy.bell', 'ice.nova']) fire(nm); }
    const mem = !!performance.memory; if (window.gc) window.gc();   // performance.memory 는 읽을 때마다 새로 재야 한다 (객체를 잡아 두면 옛 값)
    const a = mem ? performance.memory.usedJSHeapSize : 0, t0 = performance.now();
    if (mode === 'control') { const keep = []; for (let i = 0; i < n; i++) { frame(1 / 60); keep.push(new Float64Array(16)); } api._keep = keep; }   // 대조: 프레임마다 일부러 128바이트 + 를 잡는다
    else if (mode === 'fxonly') { for (let i = 0; i < n; i++) { fx.update(1 / 60); heavyStep(1 / 60); fx.draw(cam); } }
    else for (let i = 0; i < n; i++) frame(1 / 60);
    const ms = (performance.now() - t0) / n, b = mem ? performance.memory.usedJSHeapSize : 0;
    demo.name = ''; return { mode, frames: n, ms, bytes: b - a, perFrame: (b - a) / n, hasMemory: !!mem, hasGc: !!window.gc };
  },
  /** 할당을 조각별로: 이름 붙은 조각을 n 번 돌린 앞뒤의 힙 차이 (어디서 새는지 찾는 용도) */
  probe(n) {
    api.reset('mid'); startDemo('heavy'); resize(); for (let i = 0; i < 2400; i++) frame(1 / 60);
    const P = {
      'performance.now ×2': () => { const a = performance.now(); return performance.now() - a; },
      'feel.update': () => fx.feel.update(1 / 60),
      'fx.update (난전 진행 없음)': () => fx.update(1 / 60),
      'heavyStep + fx.update': () => { heavyStep(1 / 60); fx.update(1 / 60); },
      'fx.draw': () => fx.draw(cam),
      'camera()': () => camera(),
      'drawScene': () => drawScene(),
      'post.begin+end': () => { fx.post.begin(cv.width, cv.height, null); fx.post.end(fx.feel.screen); },
      'particles.draw': () => fx.particles.draw(fx.cam, 1, fx.protect, 0.4),
      'quads.draw': () => fx.quads.draw(fx.cam, 1),
      'ribbons.draw': () => fx.ribbons.draw(fx.cam, 1),
      'meshes.draw': () => fx.meshes.draw(fx.cam, 1),
      'lights.update': () => fx.lights.update(fx.time),
      'seqs.update': () => fx.seqs.update(fx, 1 / 60),
    };
    const out = {};
    for (const k in P) { const f = P[k]; for (let i = 0; i < 300; i++) f(); if (window.gc) window.gc(); const a = performance.memory.usedJSHeapSize; for (let i = 0; i < n; i++) f(); out[k] = (performance.memory.usedJSHeapSize - a) / n; }
    demo.name = ''; return out;
  },
  /** 접촉 시트: rows = [[이름, t1, t2, t3, 표적 번호?]]. 각 효과를 세 순간에 찍어 한 장으로. 돌려주는 값 = JPEG data URL */
  sheet(rows, tier, crop, title) {
    resize(); const cw = 460, ch = Math.round(cw * cv.height / cv.width), pad = 4, head = 26;
    const sh = document.createElement('canvas'); sh.width = pad + (cw + pad) * 3; sh.height = head + (ch + pad) * rows.length + pad;
    const g = sh.getContext('2d'); g.fillStyle = '#0b0d14'; g.fillRect(0, 0, sh.width, sh.height);
    g.font = '600 15px system-ui, sans-serif'; g.fillStyle = '#cfd6ee'; g.textBaseline = 'middle'; g.fillText(`${title} — 단계 ${tier} · 왼쪽부터 세 순간`, 8, head / 2);
    rows.forEach((row, ri) => {
      api.reset(tier); frame(1 / 60); let t = 0;
      const p = PRESET_LIST[ID[row[0]]]; fire(row[0], row[4] != null ? D[row[4]] : undefined);
      for (let j = 0; j < 3; j++) {
        while (t < row[1 + j] - 1e-6) { frame(1 / 120, false); t += 1 / 120; }
        frame(0, true);
        const x = pad + j * (cw + pad), y = head + ri * (ch + pad), k = crop || 1, sw2 = cv.width * k, sh2 = cv.height * k, cxp = row[5] != null ? row[5] : 0.5, cyp = row[6] != null ? row[6] : 0.56;
        const sx = clamp(cv.width * cxp - sw2 / 2, 0, cv.width - sw2), sy = clamp(cv.height * cyp - sh2 / 2, 0, cv.height - sh2);
        g.drawImage(cv, sx, sy, sw2, sh2, x, y, cw, ch);
        g.fillStyle = 'rgba(5,6,10,0.6)'; g.fillRect(x, y, cw, 20); g.fillStyle = '#e6eaf8'; g.font = '12px system-ui, sans-serif';
        g.fillText(j === 0 ? `${p.ko} · ${p.name}  t=${row[1].toFixed(2)}s` : `t=${row[1 + j].toFixed(2)}s`, x + 6, y + 10);
      }
    });
    return sh.toDataURL('image/jpeg', 0.9);
  },
  /** 한 프레임 그리고 JPEG 로 (영상용) */
  shot(dt, sub, q) { const n = sub || 1; for (let i = 0; i < n; i++) frame(dt / n, i === n - 1); return cv.toDataURL('image/jpeg', q || 0.85); },
};
resize(); camera();
requestAnimationFrame(loop);
api.ready = true;
