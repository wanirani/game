// v2 fx — 3D 효과 엔진의 문. docs/v2/FX.md (연결 계약 §3)
//
//   import { createFx } from './fx/index.js';
//   const fx = createFx(gl, { tier: 'mid', onEvent: (name, x, y, z, vol) => 소리.play(name, …) });
//   매 프레임:
//     const dt = fx.update(realDt);            // 손맛(타격 멈춤·슬로모션)이 반영된 놀이용 dt 를 돌려준다
//     fx.feel.applyToEye(eye, right, up, eye2) // 카메라 눈 위치에 흔들림·밀림을 더한다, 초점 거리 × fx.feel.cam.zoom
//     fx.post.begin(w, h);                     // (선택) 후처리
//     … 장면·캐릭터를 그린다 (장면 셰이더는 fx.lights.pos / .col 을 읽는다) …
//     fx.draw(cam);                            // cam = { vp, eye, right, up, fwd }
//     fx.post.end(fx.feel.screen);
//   사건이 날 때:  fx.play('hit.slash.heavy', { x, y, z, dx, dz })  또는 할당 없는 fx.playAt(id, x, y, z, dx, dz, pow, tx, ty, tz)
//
// 남의 GL 컨텍스트에 얹힌다: draw/post 는 자기 VAO·프로그램을 쓰고 끝나면 VAO = null, 섞기 = (ONE, ONE_MINUS_SRC_ALPHA),
// 깊이 쓰기 켬, 뒷면 제거 끔, 텍스처 단위 0 으로 돌려놓는다. 프로그램·ARRAY_BUFFER 는 부른 쪽이 다시 잡는다 (glr 은 그릴 때마다 잡는다).
import { makeTextures, Particles, Quads, Ribbons, Meshes, Lights, Q, MAX_LIGHTS, FX_LIGHT_GLSL } from './engine.js';
import { Feel, hurtFlash, hurtShake, dissolveK, FX_DISSOLVE_GLSL } from './feel.js';
import { Post } from './post.js';
import { PRESETS, PRESET_IDS, PRESET_LIST, Seqs } from './presets.js';

export { FX_LIGHT_GLSL, FX_DISSOLVE_GLSL, hurtFlash, hurtShake, dissolveK, PRESETS, PRESET_LIST, PRESET_IDS, MAX_LIGHTS };

/** 품질 단계별 고정 상한. 버퍼는 high 크기로 한 번만 잡고, 단계는 쓰는 양만 줄인다 (단계를 바꿔도 다시 할당하지 않는다). */
export const TIERS = {
  low:  { particles: 1024, quads: 48,  ribbons: 8,  meshes: 10, lights: 3, seqs: 24, pScale: 0.42, bloom: 0, coverSoft: 0.35, coverHard: 0.9 },
  mid:  { particles: 2048, quads: 96,  ribbons: 14, meshes: 18, lights: 5, seqs: 36, pScale: 0.7,  bloom: 2, coverSoft: 0.5,  coverHard: 1.3 },
  high: { particles: 4096, quads: 128, ribbons: 20, meshes: 28, lights: 8, seqs: 48, pScale: 1.0,  bloom: 3, coverSoft: 0.7,  coverHard: 1.8 },
};
const REF_AREA = 960 * 726;   // 폴드를 편 논리 화면 넓이 (덧칠 넓이의 기준)

class Fx {
  constructor(gl, opts) {
    this.gl = gl; this.ok = true;
    this.tex = makeTextures(gl);
    const H = TIERS.high;
    this.particles = new Particles(gl, H.particles, this.tex);
    this.quads = new Quads(gl, H.quads, this.tex);
    this.ribbons = new Ribbons(gl, H.ribbons, 24, this.tex);
    this.meshes = new Meshes(gl, H.meshes, this.tex);
    this.lights = new Lights(MAX_LIGHTS);
    this.feel = new Feel();
    this.post = new Post(gl, 0);
    this.seqs = new Seqs(H.seqs);
    this.time = 0; this.groundY = opts.groundY ?? 0; this.onEvent = opts.onEvent ?? null; this.lightPools = !!opts.lightPools;
    this.postOn = opts.post !== false;
    this.feelOn = opts.feel !== false;                            // false 면 프리셋이 손맛(멈춤·흔들림·번쩍임)을 내지 않는다
    this.protect = new Float32Array(16); this.protMin = 0.4;      // 가리면 안 되는 자리 4곳 (x,y,z,반지름)
    this.chain = new Float32Array(12); this.chainN = 0;            // 연쇄 번개 표적 (최대 4)
    this.last = -1;                                                // 마지막 프리셋이 만든 '따라다닐 것'의 손잡이 (보호막)
    this.gain = 1;                                                 // 밝기 조절기 (덧칠이 많으면 더하기 색을 낮춘다)
    this.cam = { vp: new Float32Array(16), eye: new Float32Array(3), right: new Float32Array([1, 0, 0]), up: new Float32Array([0, 1, 0]), fwd: new Float32Array([0, 0, 1]) };
    this.stats = { draws: 0, particles: 0, quads: 0, ribbons: 0, ribbonVerts: 0, meshes: 0, meshTris: 0, lights: 0, seqs: 0, coverage: 0, gain: 1, cpuUpdate: 0, cpuDraw: 0, spawned: 0, dropped: 0, sfx: 0, postPasses: 0 };
    this.sfxLog = new Array(8).fill(''); this.sfxN = 0;
    this.setTier(opts.tier ?? 'mid');
  }
  /** 품질 단계 바꾸기 ('low' | 'mid' | 'high'). 살아 있는 효과는 지운다. */
  setTier(name) {
    const T = TIERS[name] ?? TIERS.mid; this.tier = TIERS[name] ? name : 'mid'; this.T = T;
    this.particles.reset(T.particles); this.particles.scale = T.pScale; this.quads.reset(T.quads); this.ribbons.reset(T.ribbons); this.meshes.reset(T.meshes); this.lights.reset(T.lights); this.seqs.reset(T.seqs);
    this.post.setLevels(this.postOn ? T.bloom : 0);
  }
  /** 후처리 켜기/끄기 (끄면 번쩍임·가장자리 색만 덧그린다) */
  setPost(on) { this.postOn = !!on; this.post.setLevels(this.postOn ? this.T.bloom : 0); }
  /** 가리면 안 되는 자리 (i = 0..3): 영웅, 예고 동작 중인 적. r = 0 이면 해제. 그 앞을 지나는 큰 입자는 protMin 까지 옅어진다 */
  setProtect(i, x, y, z, r) { const o = i * 4; this.protect[o] = x; this.protect[o + 1] = y; this.protect[o + 2] = z; this.protect[o + 3] = r; }

  /** 프레임마다 한 번. realDt = 실제 흐른 초. 돌려주는 값 = 놀이용 dt (타격 멈춤 중 0) */
  update(realDt) {
    const t0 = performance.now();
    const gdt = this.feel.update(realDt);
    this.time += realDt * this.feel.fxScale;
    const t = this.time;
    this.particles.update(t); this.quads.update(t); this.ribbons.update(t); this.meshes.update(t);
    this.seqs.update(this, realDt * this.feel.fxScale);
    this.lights.update(t);
    // 밝기·개수 조절기: 살아 있는 입자의 덧칠 넓이가 화면의 soft 배를 넘으면 장식 입자를 줄이고 더하기 색을 낮춘다
    const cov = this.particles.liveArea / REF_AREA, T = this.T;
    const over = Math.min(1, Math.max(0, (cov - T.coverSoft) / (T.coverHard - T.coverSoft)));
    this.particles.gov = 1 - over * 0.75; this.gain += ((1 - over * 0.45) - this.gain) * Math.min(1, realDt * 8); this.post.gain = this.gain;
    const S = this.stats; S.coverage = cov; S.gain = this.gain; S.seqs = this.seqs.live; S.lights = this.lights.count; S.spawned = this.particles.spawned; S.dropped = this.particles.dropped;
    S.cpuUpdate = performance.now() - t0;
    return gdt;
  }
  /** 효과를 그린다 (불투명 장면·캐릭터 뒤에). cam = { vp: Float32Array(16) 열 우선 view·projection, eye, right, up, fwd: [x,y,z] } */
  draw(cam) {
    const t0 = performance.now(), gl = this.gl, C = this.cam;
    C.vp.set(cam.vp); C.eye.set(cam.eye); C.right.set(cam.right); C.up.set(cam.up); C.fwd.set(cam.fwd);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    this.quads.draw(C, this.gain);
    this.meshes.draw(C, this.gain);
    this.ribbons.draw(C, this.gain);
    this.particles.draw(C, this.gain, this.protect, this.protMin);
    gl.bindVertexArray(null); gl.depthMask(true); gl.activeTexture(gl.TEXTURE0);
    const S = this.stats;
    S.draws = this.quads.draws + this.meshes.draws + this.ribbons.draws + this.particles.draws;
    S.particles = this.particles.drawn; S.quads = this.quads.live; S.ribbons = this.ribbons.live; S.ribbonVerts = this.ribbons.nv; S.meshes = this.meshes.live; S.meshTris = this.meshes.tris; S.postPasses = this.post.passes;
    S.cpuDraw = performance.now() - t0;
  }
  // ── 사건 ──
  /** 이름으로 효과를 낸다. o = { x, y, z, dx, dz, pow, tx, ty, tz } (없는 값은 기본값). 편한 쪽 — 호출마다 작은 객체 1개 */
  play(name, o) {
    const id = PRESET_IDS[name]; if (id === undefined) { if (!this._warned) { this._warned = true; console.warn('[fx] 없는 효과:', name); } return; }
    const x = o.x ?? 0, y = o.y ?? this.groundY, z = o.z ?? 0, dx = o.dx ?? 1, dz = o.dz ?? 0;
    this.playAt(id, x, y, z, dx, dz, o.pow ?? 1, o.tx ?? x + dx * 320, o.ty ?? y, o.tz ?? z + dz * 320);
  }
  /** 번호로 효과를 낸다 (할당 없음). id = PRESET_IDS[이름] */
  playAt(id, x, y, z, dx, dz, pow, tx, ty, tz) { PRESET_LIST[id].fn(this, x, y, z, dx, dz, pow, tx, ty, tz); }
  /** 소리 사건을 내보낸다 (소리 담당이 onEvent 로 받는다) */
  sfx(name, x, y, z, vol) { this.stats.sfx++; this.sfxLog[this.sfxN++ & 7] = name; if (this.onEvent) this.onEvent(name, x, y, z, vol); }
  /** 잠깐 사는 빛. lightPools 가 켜져 있으면 바닥에 빛 웅덩이도 깐다 (장면 셰이더가 빛 목록을 읽지 못할 때) */
  light(x, y, z, radius, col, inten, life, flicker, curve) {
    if (this.lightPools) { _lc[0] = col[0]; _lc[1] = col[1]; _lc[2] = col[2]; _lc[3] = Math.min(1, inten * 0.5); this.quads.ground(Q.GLOW, x, this.groundY, z, radius * 0.75, radius * 0.75, 0, life, _lc, 1, 1, 0, 0, 1, 0, 0, 0.03); }
    return this.lights.add(x, y, z, radius, col, inten, life, flicker, curve);
  }
  /** 흔들림을 세계 방향으로 (카메라 평면 성분으로 바꿔 넘긴다) */
  trauma(amount, dx, dy, dz) { const C = this.cam; this.feel.addTrauma(amount, dx * C.right[0] + dy * C.right[1] + dz * C.right[2], dx * C.up[0] + dy * C.up[1] + dz * C.up[2]); }
  /** 장면 셰이더에 빛 목록을 올린다 (FX_LIGHT_GLSL 의 uFxLP · uFxLC 위치) */
  uploadLights(locPos, locCol) { this.gl.uniform4fv(locPos, this.lights.pos); this.gl.uniform4fv(locCol, this.lights.col); }
  /** 모든 효과 지우기 (방을 옮길 때) */
  clear() { this.setTier(this.tier); this.feel.reset(); }
  /** 디버그용: 지금 화면 덧칠 넓이(화면 대비 배수)와 개수 */
  measure() { const p = this.particles.measure(), q = this.quads.measure(), m = this.meshes.measure(); return { particles: p.n, quads: q.n, meshes: m.n, ribbons: this.ribbons.live, lights: this.lights.count, overdraw: (p.area + q.area + m.area) / REF_AREA }; }
  get gpuBytes() { return this.tex.bytes + this.particles.data.byteLength + this.quads.data.byteLength + this.ribbons.verts.byteLength + this.meshes.bytes + this.post.bytes; }
  dispose() { const gl = this.gl; this.particles.dispose(); this.quads.dispose(); this.ribbons.dispose(); this.meshes.dispose(); this.post.dispose(); gl.deleteTexture(this.tex.atlas); gl.deleteTexture(this.tex.decal); gl.deleteTexture(this.tex.noise); this.ok = false; }
}
const _lc = [0, 0, 0, 0];

/** WebGL2 컨텍스트에 효과 엔진을 만든다. WebGL1 이면 null (부르는 쪽은 효과 없이 돈다). */
export function createFx(gl, opts = {}) {
  if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) return null;
  return new Fx(gl, opts);
}
