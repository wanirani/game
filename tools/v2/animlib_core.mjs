// v2 animlib — 산 클립(GLB) → 정규 프레임 → 자르기 · 제자리 만들기 · 순환 닫기 · 이벤트 찾기 · 다시 쓰기. docs/v2/ANIM_LIBRARY.md
// 런타임(src/v2/char3d/skel.js)의 정규 클립 형식을 그대로 쓴다: 뼈 이름 → "쉬는 자세에서 캐릭터 축으로 얼마나 돌았나" + 골반 이동(골반 높이 = 1).
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, CPose, clipFromAnim, sampleClip, applyPose, qmul, qconj, qnorm } from '../../src/v2/char3d/skel.js';

export const KEYS = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'shoulderL', 'armL', 'forearmL', 'handL', 'shoulderR', 'armR', 'forearmR', 'handR', 'uplegL', 'legL', 'footL', 'toeL', 'uplegR', 'legR', 'footR', 'toeR'];
export const SRC_FPS = 30;

export function loadRig(path) { const g = readGLB(path), model = buildModel(g); return { g, model, rig: new Rig(model) }; }

/** 산 GLB 의 첫 애니메이션 → 30fps 정규 프레임 {n, dt, rot: {key: Float32Array(n*4)}, root: Float32Array(n*3)} */
export function rawFrames(path) {
  const { model, rig } = loadRig(path);
  if (!model.anims.length) throw new Error('애니메이션이 없습니다: ' + path);
  const clip = clipFromAnim(rig, model.anims[0], { loop: false });
  const dt = 1 / SRC_FPS, n = Math.max(2, Math.round(clip.duration / dt) + 1);
  const F = newFrames(n, dt), P = new CPose();
  for (let k = 0; k < n; k++) {
    sampleClip(clip, Math.min(clip.duration, k * dt), P);
    for (const key of KEYS) { const q = P.rot.get(key); if (q && q.set) F.rot[key].set(q, k * 4); else F.rot[key][k * 4 + 3] = 1; }
    F.root.set(P.root, k * 3);
  }
  for (const key of KEYS) fixSigns(F.rot[key], n);
  F.srcName = model.anims[0].name.replace(/^Armature\|/, '').replace(/\|baselayer$/, ''); F.srcDur = clip.duration;
  return F;
}
export function newFrames(n, dt) { const rot = {}; for (const k of KEYS) rot[k] = new Float32Array(n * 4); return { n, dt, rot, root: new Float32Array(n * 3) }; }
function fixSigns(r, n) { for (let k = 1; k < n; k++) { const a = (k - 1) * 4, b = k * 4; if (r[a] * r[b] + r[a + 1] * r[b + 1] + r[a + 2] * r[b + 2] + r[a + 3] * r[b + 3] < 0) for (let c = 0; c < 4; c++) r[b + c] = -r[b + c]; } }

/** 프레임 [a, b] (포함) 을 잘라 새 프레임으로. reverse 면 거꾸로 */
export function slice(F, a, b, reverse = false) {
  a = Math.max(0, Math.min(F.n - 2, a)); b = Math.max(a + 1, Math.min(F.n - 1, b));
  const n = b - a + 1, G = newFrames(n, F.dt);
  for (let k = 0; k < n; k++) {
    const s = reverse ? b - k : a + k;
    for (const key of KEYS) G.rot[key].set(F.rot[key].subarray(s * 4, s * 4 + 4), k * 4);
    G.root.set(F.root.subarray(s * 3, s * 3 + 3), k * 3);
  }
  for (const key of KEYS) fixSigns(G.rot[key], n);
  return G;
}

/** 좌우 거울상: 왼쪽·오른쪽 뼈를 맞바꾸고 회전을 캐릭터의 가운데 면에 비춘다 (쉬는 자세가 좌우 대칭이라 가능) */
export function mirror(F) {
  const G = newFrames(F.n, F.dt), sw = (k) => (/L$/.test(k) ? k.slice(0, -1) + 'R' : /R$/.test(k) ? k.slice(0, -1) + 'L' : k);
  for (const key of KEYS) { const src = F.rot[sw(key)], dst = G.rot[key]; for (let k = 0; k < F.n; k++) { dst[k * 4] = src[k * 4]; dst[k * 4 + 1] = -src[k * 4 + 1]; dst[k * 4 + 2] = -src[k * 4 + 2]; dst[k * 4 + 3] = src[k * 4 + 3]; } }
  for (let k = 0; k < F.n; k++) { G.root[k * 3] = -F.root[k * 3]; G.root[k * 3 + 1] = F.root[k * 3 + 1]; G.root[k * 3 + 2] = F.root[k * 3 + 2]; }
  return G;
}

/** 프레임 사이 "움직임 양" (뼈 회전 각속도 합 rad/s + 골반 속도) — 죽은 구간 찾기용 */
export function energy(F) {
  const e = new Float32Array(F.n);
  for (let k = 1; k < F.n; k++) {
    let s = 0;
    for (const key of KEYS) { const r = F.rot[key], a = (k - 1) * 4, b = k * 4; const d = Math.abs(r[a] * r[b] + r[a + 1] * r[b + 1] + r[a + 2] * r[b + 2] + r[a + 3] * r[b + 3]); s += 2 * Math.acos(Math.min(1, d)); }
    const dx = F.root[k * 3] - F.root[k * 3 - 3], dy = F.root[k * 3 + 1] - F.root[k * 3 - 2], dz = F.root[k * 3 + 2] - F.root[k * 3 - 1];
    e[k] = (s + 4 * Math.hypot(dx, dy, dz)) / F.dt;
  }
  e[0] = e[1] ?? 0;
  return e;
}
/** 앞뒤의 죽은 프레임을 뺀 [a, b]. head/tail: 문턱(상위 10% 움직임의 비율) */
export function autoTrim(F, head = 0.12, tail = 0.07, pad = 2) {
  const e = energy(F), s = Array.from(e).sort((x, y) => x - y), ref = s[Math.floor(s.length * 0.9)] || 1;
  let a = 0, b = F.n - 1;
  while (a < F.n - 3 && e[a + 1] < ref * head) a++;
  while (b > a + 3 && e[b] < ref * tail) b--;
  return [Math.max(0, a - pad), Math.min(F.n - 1, b + pad)];
}

const gauss = (arr, n, stride, off, sigma) => {   // 반사 채움 가우시안 저역 통과
  const R = Math.max(1, Math.ceil(sigma * 3)), w = []; let ws = 0;
  for (let i = -R; i <= R; i++) { const v = Math.exp(-0.5 * (i / sigma) ** 2); w.push(v); ws += v; }
  const out = new Float32Array(n);
  for (let k = 0; k < n; k++) { let s = 0; for (let i = -R; i <= R; i++) { let j = k + i; if (j < 0) j = -j; if (j > n - 1) j = 2 * (n - 1) - j; j = Math.max(0, Math.min(n - 1, j)); s += arr[j * stride + off] * w[i + R]; } out[k] = s / ws; }
  return out;
};
/**
 * 골반 이동 다듬기. xz: 'loop'(직선 성분 + 평균 제거) | 'auto'(느린 이동만 빼고 빠른 흔들림은 남김) | 'keep'(첫 프레임 기준).
 * y: 'keep' | 'detrend' | 'zero'. 돌려주는 값: 뺀 이동 {travel:[x,z](골반 높이 단위), moveT:[t0,t1]}
 */
export function fixRoot(F, xz = 'auto', y = 'keep', sigmaSec = 0.18) {
  const n = F.n, r = F.root, T = n - 1;
  const x0 = r[0], z0 = r[2], x1 = r[T * 3], z1 = r[T * 3 + 2];
  const info = { travel: [x1 - x0, z1 - z0], moveT: [0, T * F.dt] };
  if (xz === 'loop') {
    let mx = 0, mz = 0;
    for (let k = 0; k < n; k++) { const u = k / T; r[k * 3] -= x0 + (x1 - x0) * u; r[k * 3 + 2] -= z0 + (z1 - z0) * u; mx += r[k * 3]; mz += r[k * 3 + 2]; }
    for (let k = 0; k < n; k++) { r[k * 3] -= mx / n; r[k * 3 + 2] -= mz / n; }
  } else if (xz === 'auto') {
    const sx = gauss(r, n, 3, 0, sigmaSec / F.dt), sz = gauss(r, n, 3, 2, sigmaSec / F.dt);
    // 이동의 5% ~ 95% 가 일어나는 시간
    const tot = Math.hypot(sx[T] - sx[0], sz[T] - sz[0]);
    if (tot > 0.05) { const ax = (sx[T] - sx[0]) / tot, az = (sz[T] - sz[0]) / tot; let a = 0, b = T; for (let k = 0; k < n; k++) { const p = ((sx[k] - sx[0]) * ax + (sz[k] - sz[0]) * az) / tot; if (p < 0.05) a = k; if (p < 0.95) b = Math.min(T, k + 1); } info.moveT = [a * F.dt, b * F.dt]; }
    for (let k = 0; k < n; k++) { r[k * 3] -= sx[k]; r[k * 3 + 2] -= sz[k]; }
    const a0 = r[0], c0 = r[2], a1 = r[T * 3], c1 = r[T * 3 + 2];
    for (let k = 0; k < n; k++) { const u = k / T; r[k * 3] -= a0 + (a1 - a0) * u; r[k * 3 + 2] -= c0 + (c1 - c0) * u; }
  } else { for (let k = 0; k < n; k++) { r[k * 3] -= x0; r[k * 3 + 2] -= z0; } }
  if (y === 'detrend') { const y0 = r[1], y1 = r[T * 3 + 1]; let m = 0; for (let k = 0; k < n; k++) { r[k * 3 + 1] -= (y1 - y0) * (k / T); m += r[k * 3 + 1]; } }
  else if (y === 'zero') for (let k = 0; k < n; k++) r[k * 3 + 1] = 0;
  return info;
}

const poseDist = (F, a, b) => { let s = 0; for (const key of KEYS) { const r = F.rot[key], d = Math.abs(r[a * 4] * r[b * 4] + r[a * 4 + 1] * r[b * 4 + 1] + r[a * 4 + 2] * r[b * 4 + 2] + r[a * 4 + 3] * r[b * 4 + 3]); s += 1 - Math.min(1, d); } return s + 2 * Math.abs(F.root[a * 3 + 1] - F.root[b * 3 + 1]); };
/** 가장 잘 이어지는 순환 구간 [a, b] (길이 minSec ~ maxSec). 돌려주는 값 [a, b, 어긋남] */
export function findLoop(F, minSec, maxSec, from = 0, to = F.n - 1) {
  const lo = Math.round(minSec / F.dt), hi = Math.round(maxSec / F.dt); let best = [from, Math.min(to, from + lo), 1e9];
  for (let a = from; a + lo <= to - 1; a++) for (let b = a + lo; b <= Math.min(to - 1, a + hi); b++) {
    const c = poseDist(F, a, b) + poseDist(F, a + 1, b + 1);
    if (c < best[2]) best = [a, b, c];
  }
  return best;
}
/** 끝 자세를 첫 자세와 같게 만든다 (끝의 W 프레임에 걸쳐 차이를 나눠 넣음) */
export function closeLoop(F, W = 6) {
  const n = F.n, T = n - 1; W = Math.min(W, T);
  const q = [0, 0, 0, 1], D = [0, 0, 0, 1], c = [0, 0, 0, 1];
  for (const key of KEYS) {
    const r = F.rot[key]; qmul(r.subarray(0, 4), qconj(r.subarray(T * 4, T * 4 + 4), c), D); qnorm(D);
    if (D[3] < 0) { D[0] = -D[0]; D[1] = -D[1]; D[2] = -D[2]; D[3] = -D[3]; }
    for (let k = T - W + 1; k <= T; k++) {
      const u = (k - (T - W)) / W, w = u * u * (3 - 2 * u);
      const Dw = qnorm([D[0] * w, D[1] * w, D[2] * w, 1 - w + D[3] * w]);
      qmul(Dw, r.subarray(k * 4, k * 4 + 4), q); qnorm(q); r.set(q, k * 4);
    }
    fixSigns(r, n);
  }
  for (let ch = 0; ch < 3; ch++) { const d = F.root[ch] - F.root[T * 3 + ch]; for (let k = T - W + 1; k <= T; k++) { const u = (k - (T - W)) / W; F.root[k * 3 + ch] += d * u * u * (3 - 2 * u); } }
  return poseDist(F, 0, T);
}

/** 다른 fps 로 다시 뽑는다 (길이는 그대로) */
export function resample(F, fps) {
  const dur = (F.n - 1) * F.dt, M = Math.max(1, Math.round(dur * fps)), G = newFrames(M + 1, dur / M);
  for (let i = 0; i <= M; i++) {
    const t = (i / M) * (F.n - 1), k = Math.min(F.n - 2, Math.floor(t)), u = t - k;
    for (const key of KEYS) {
      const r = F.rot[key], a = k * 4, b = a + 4, o = G.rot[key];
      const s = r[a] * r[b] + r[a + 1] * r[b + 1] + r[a + 2] * r[b + 2] + r[a + 3] * r[b + 3] < 0 ? -u : u;
      const q = qnorm([r[a] * (1 - u) + r[b] * s, r[a + 1] * (1 - u) + r[b + 1] * s, r[a + 2] * (1 - u) + r[b + 2] * s, r[a + 3] * (1 - u) + r[b + 3] * s]);
      o.set(q, i * 4);
    }
    for (let c = 0; c < 3; c++) G.root[i * 3 + c] = F.root[k * 3 + c] * (1 - u) + F.root[k * 3 + 3 + c] * u;
  }
  for (const key of KEYS) fixSigns(G.rot[key], G.n);
  return G;
}

/** 프레임 k 를 정규 자세 P 에 */
export function poseAt(F, k, P) { P.clear(); for (const key of KEYS) P.q(key).splice(0, 4, ...F.rot[key].subarray(k * 4, k * 4 + 4)); P.root[0] = F.root[k * 3]; P.root[1] = F.root[k * 3 + 1]; P.root[2] = F.root[k * 3 + 2]; return P; }
/** 기준 뼈대에서 프레임마다 관절 위치(m): {handR, handL, tipR, tipL, footL, footR, toeL, toeR, hips, head} 각 Float32Array(n*3) */
export function fk(F, rig, reach = 0.55) {
  const names = ['handR', 'handL', 'forearmR', 'forearmL', 'footL', 'footR', 'toeL', 'toeR', 'hips', 'head'], out = {}, P = new CPose();
  for (const nm of [...names, 'tipR', 'tipL']) out[nm] = new Float32Array(F.n * 3);
  for (let k = 0; k < F.n; k++) {
    applyPose(rig, poseAt(F, k, P));
    for (const nm of names) { const j = rig.key.get(nm); for (let c = 0; c < 3; c++) out[nm][k * 3 + c] = rig.world[j * 16 + 12 + c]; }
    for (const s of ['R', 'L']) { const h = out['hand' + s], f = out['forearm' + s]; const dx = h[k * 3] - f[k * 3], dy = h[k * 3 + 1] - f[k * 3 + 1], dz = h[k * 3 + 2] - f[k * 3 + 2], l = Math.hypot(dx, dy, dz) || 1; out['tip' + s][k * 3] = h[k * 3] + (dx / l) * reach; out['tip' + s][k * 3 + 1] = h[k * 3 + 1] + (dy / l) * reach; out['tip' + s][k * 3 + 2] = h[k * 3 + 2] + (dz / l) * reach; }
  }
  return out;
}
export const speedOf = (pos, n, dt) => { const v = new Float32Array(n); for (let k = 1; k < n; k++) v[k] = Math.hypot(pos[k * 3] - pos[k * 3 - 3], pos[k * 3 + 1] - pos[k * 3 - 2], pos[k * 3 + 2] - pos[k * 3 - 1]) / dt; v[0] = v[1] ?? 0; return v; };
/** 봉우리 찾기: 값이 thr 넘고 좌우 w 프레임 안에서 가장 큰 곳 */
export function peaks(v, thr, w = 5) { const out = []; for (let k = 1; k < v.length - 1; k++) { if (v[k] < thr) continue; let ok = true; for (let i = Math.max(0, k - w); i <= Math.min(v.length - 1, k + w); i++) if (v[i] > v[k]) { ok = false; break; } if (ok) out.push(k); } return out; }
/** 발 닿는 순간들 (발목·발끝 가운데 낮은 쪽이 바닥 가까이로 내려오는 프레임) */
export function footDowns(J, n, side, lift = 0.045) {
  const h = new Float32Array(n); let mn = 1e9;
  for (let k = 0; k < n; k++) { h[k] = Math.min(J['foot' + side][k * 3 + 1] - 0.07, J['toe' + side][k * 3 + 1]); if (h[k] < mn) mn = h[k]; }
  const out = []; let down = h[0] < mn + lift;
  for (let k = 1; k < n; k++) { if (!down && h[k] < mn + lift * 0.6) { down = true; out.push(k); } else if (down && h[k] > mn + lift * 1.6) down = false; }
  return { downs: out, h, mn };
}

/** 정규 프레임 → 기준 뼈대의 glTF 애니메이션 조각 {times, tracks:[{node, q:Int16Array}], root:{node, v:Float32Array}} */
export function toLocal(F, rig, eps = 1e-5) {
  const tracks = [], q = [0, 0, 0, 1], a = [0, 0, 0, 1], b = [0, 0, 0, 1];
  for (const key of KEYS) {
    const j = rig.key.get(key); if (j == null) continue;
    const r = F.rot[key]; let moved = false;
    for (let k = 0; k < F.n && !moved; k++) if (1 - Math.abs(r[k * 4 + 3]) > eps) moved = true;   // 쉬는 자세에서 약 0.5° 넘게 벗어난 적이 있나
    if (!moved) continue;
    const Pw = rig.parWR.subarray(j * 4, j * 4 + 4), Lr = rig.restR.subarray(j * 4, j * 4 + 4), out = new Int16Array(F.n * 4);
    for (let k = 0; k < F.n; k++) { qmul(qconj(Pw, a), r.subarray(k * 4, k * 4 + 4), b); qmul(b, Pw, a); qmul(a, Lr, q); qnorm(q); for (let c = 0; c < 4; c++) out[k * 4 + c] = Math.round(q[c] * 32767); }
    tracks.push({ node: j, key, q: out });
  }
  const j = rig.key.get('hips'), v = new Float32Array(F.n * 3), k0 = rig.restHipY / (rig.restWS[j] || 1), Pc = qconj(rig.parWR.subarray(j * 4, j * 4 + 4), [0, 0, 0, 1]);
  for (let k = 0; k < F.n; k++) {
    const p = [F.root[k * 3] * k0, F.root[k * 3 + 1] * k0, F.root[k * 3 + 2] * k0];
    const tx = 2 * (Pc[1] * p[2] - Pc[2] * p[1]), ty = 2 * (Pc[2] * p[0] - Pc[0] * p[2]), tz = 2 * (Pc[0] * p[1] - Pc[1] * p[0]);
    v[k * 3] = rig.restT[j * 3] + p[0] + Pc[3] * tx + Pc[1] * tz - Pc[2] * ty; v[k * 3 + 1] = rig.restT[j * 3 + 1] + p[1] + Pc[3] * ty + Pc[2] * tx - Pc[0] * tz; v[k * 3 + 2] = rig.restT[j * 3 + 2] + p[2] + Pc[3] * tz + Pc[0] * ty - Pc[1] * tx;
  }
  const times = new Float32Array(F.n); for (let k = 0; k < F.n; k++) times[k] = +(k * F.dt).toFixed(5);
  return { times, tracks, root: { node: j, v } };
}
