// v2 play — 움직임: 놀이 상태(sim.js 의 영웅 · 적) → 보는 방향 + 클립. docs/v2/PLAY_API.md §0 · docs/v2/ANIM_LIBRARY.md §4
// 규칙이 방향(dirX,dirZ)과 시간(moveT · animT · gait …)을 정하고, 여기서는 그것을 그림으로 옮기기만 한다:
//   · 방향은 부드럽게 따라 돈다. 스틱을 반대로 꺾어도 도는 쪽이 오락가락하지 않게 한번 정한 쪽으로 끝까지 돈다
//   · 달리기 · 걷기 클립의 시각은 규칙의 걸음 주기(gait)에서 온다 → 발 디딤과 땅 위 속도가 맞는다(발이 미끄러지지 않는다)
//   · 공격 클립은 "칼이 빠르게 지나가는 구간(strike)"이 규칙의 판정 구간(hit)과 겹치게 시간을 접는다
//   · 클립은 공용 라이브러리(assets/v2/char3d/clips/)를 처음 불릴 때 스스로 받아 붙인다. 받기 전에는 시범판의 클립으로 돈다
import { Rig, clipFromAnim, qmul, qconj, sampleClip, applyPose, CPose } from '../char3d/skel.js';
import { driveHero as driveHeroProto } from '../char3d/hero3d.js';
import { loadAnimLib } from './animlib.js';
import { TUNE } from './tune.js';
import { KINDS } from './enemies.js';

const GROUPS = ['locomotion', 'combat', 'reactions', 'magic', 'enemy'];
const LIB = { clips: null, promise: null, failed: false };
const LEGS = ['uplegL', 'uplegR', 'legL', 'legR', 'footL', 'footR', 'toeL', 'toeR'];
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** 사원수 정규화 (Math.hypot 은 부를 때마다 임시 배열을 만든다 — requests.md core-verify) */
const qnorm = (a) => { const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]) || 1; a[0] /= l; a[1] /= l; a[2] /= l; a[3] /= l; return a; };

const indexUrlOf = (asset) => String(asset?.url ?? 'assets/v2/char3d/kael.glb').replace(/[^/]*$/, 'clips/index.json');
/** 이미 받아 둔 클립 묶음을 쓴다 (node 검사 · 장면이 먼저 받았을 때) */
export function usePlayClips(clips) { LIB.clips = clips; }
export function playClipsReady() { return !!LIB.clips; }
/** 라이브러리를 받아(한 번만) asset.clips 에 붙인다. asset = loadCharAsset 결과, 또는 index.json 주소 */
export async function loadPlayClips(assetOrUrl) {
  if (!LIB.clips) {
    const url = typeof assetOrUrl === 'string' ? assetOrUrl : indexUrlOf(assetOrUrl);
    LIB.promise ??= loadAnimLib(url, { groups: GROUPS }).then((l) => { LIB.clips = l.clips; return l.clips; }, (e) => { LIB.failed = true; console.warn('[play] clip library not loaded:', e?.message ?? e); return null; });
    await LIB.promise;
  }
  if (assetOrUrl && typeof assetOrUrl === 'object') attach(assetOrUrl, true);
  return LIB.clips;
}
/**
 * 모델 파일에 든 클립 하나를 이름으로 찾아 asset.clips 에 더한다 (float_idle · fly 처럼 라이브러리에 없는 것만 — 필요한 이름만 만들어 첫 틱이 무겁지 않게).
 * 있으면(또는 만들었으면) true
 */
function ownClip(asset, name) {
  if (!name) return false;
  if (asset.clips[name]) return true;
  const miss = (asset._playMiss ??= new Set()); if (miss.has(name)) return false;
  const a = (asset.model.anims ?? []).find((q) => String(q.name).replace(/[^A-Za-z0-9_]/g, '_') === name);
  if (!a) { miss.add(name); return false; }
  const loop = /idle|walk|run|fly|float|flap/i.test(name);
  asset.clips[name] = clipFromAnim((asset._playRig ??= new Rig(asset.model)), a, { name, loop, inPlace: loop, rootRel: !loop });
  return true;
}
/** 캐릭터 자료에 라이브러리 클립을 붙인다. 붙었으면(또는 필요 없으면) true. 장면이 이미 붙여 두었으면 그대로 쓴다 (다시 받지 않는다) */
function attach(asset, useLib) {
  if (asset._play) return true;
  if (!useLib || (asset.clips.roll?.meta && asset.clips.atk3 && asset.clips.idle_combat)) { asset._play = true; return true; }
  if (!LIB.clips) {
    if (!LIB.promise && !LIB.failed && typeof fetch === 'function' && typeof location !== 'undefined') loadPlayClips(indexUrlOf(asset));
    return false;
  }
  Object.assign(asset.clips, LIB.clips);
  asset._play = true;
  return true;
}
/** 종류표가 이름으로 부르는 클립 가운데 모델 파일에만 있는 것을 꺼내 둔다 (자료마다 한 번) */
function attachKind(asset, D) {
  if (asset._playKind === D) return;
  asset._playKind = D;
  for (const k in D.clips) ownClip(asset, D.clips[k]);
  for (const a of D.attacks) ownClip(asset, a.clip);
}

/** 방향을 (tx,tz) 쪽으로 돌린다. k = 따라가는 빠르기(1/초), cap = 가장 빠른 회전(rad/초) */
function turn(ch, S, tx, tz, dt, k, cap) {
  const cur = Math.atan2(ch.dz, ch.dx); let d = wrapPi(Math.atan2(tz, tx) - cur);
  if (Math.abs(d) > 2.2 && S.turnDir && Math.sign(d) !== S.turnDir) d -= Math.sign(d) * Math.PI * 2;   // 거의 반대쪽: 이미 돌던 쪽으로 계속 돈다
  if (Math.abs(d) > 0.3) S.turnDir = Math.sign(d); else if (Math.abs(d) < 0.04) S.turnDir = 0;
  const a = cur + clamp(d * (1 - Math.exp(-dt * k)), -cap * dt, cap * dt);
  ch.dx = Math.cos(a); ch.dz = Math.sin(a);
}
/** 순환 걸음 클립에서 오른발이 닿는 시각(주기 비율): 규칙의 gait 0 = 오른발 */
function footOff(clip) {
  if (clip._offR != null) return clip._offR;
  const ev = clip.events?.find((e) => e[1] === 'footR');
  return (clip._offR = ev ? ev[0] / clip.duration : 0);
}
/**
 * 걸음 맞추기 표: 규칙의 걸음 주기 g(0…1, 나아간 거리에 비례)를 클립의 주기 비율로 바꾼다. 디딘 발이 뒤로 가는 빠르기가 클립 안에서 고르지 않아
 * (걷기 클립은 디딘 동안에도 27 % 쯤 흔들린다) 그대로 틀면 발이 땅에서 밀린다 → 디딘 발이 뒤로 간 거리가 g 에 비례하도록 클립 시각을 고른다.
 * 클립마다 한 번(처음 쓸 때) 뼈대에 자세를 입혀 재고, 그 뒤로는 표만 읽는다. 표가 없으면(발 뼈 없음) g 그대로.
 */
const GW_N = 48, _gwP = new CPose();
function gaitWarp(ch, clip) {
  if (clip._gw !== undefined) return clip._gw;
  clip._gw = null;
  const rig = ch.rig, jl = rig.key.get('footL'), jr = rig.key.get('footR'); if (jl == null || jr == null || !clip.loop) return null;
  const N = GW_N, off = footOff(clip), W = rig.world, zl = [], yl = [], zr = [], yr = [];
  for (let i = 0; i <= N; i++) { sampleClip(clip, ((off + i / N) % 1) * clip.duration, _gwP); applyPose(rig, _gwP); zl.push(W[jl * 16 + 14]); yl.push(W[jl * 16 + 13]); zr.push(W[jr * 16 + 14]); yr.push(W[jr * 16 + 13]); }
  const lowL = Math.min(...yl) + 0.035, lowR = Math.min(...yr) + 0.035, inc = []; let sum = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const cl = yl[i] < lowL && yl[i + 1] < lowL, cr = yr[i] < lowR && yr[i + 1] < lowR;
    const d = cl && cr ? (zl[i] - zl[i + 1] + zr[i] - zr[i + 1]) / 2 : cl ? zl[i] - zl[i + 1] : cr ? zr[i] - zr[i + 1] : -1;
    inc.push(d); if (d > 0) { sum += d; n++; }
  }
  if (n < N * 0.3) return null;
  const mean = sum / n; let tot = 0;
  for (let i = 0; i < N; i++) { inc[i] = inc[i] > 0 ? clamp(inc[i], mean * 0.5, mean * 1.9) : mean; tot += inc[i]; }   // 둘 다 뜬 구간은 평균 빠르기로 · 너무 급한 곳은 눌러 둔다(동작이 덜컹거리지 않게)
  const tb = new Float32Array(N + 1); let acc = 0, k = 1;
  for (let i = 0; i < N && k < N; i++) { const a0 = acc; acc += inc[i] / tot; while (k < N && k / N <= acc) { tb[k] = (i + (k / N - a0) / (acc - a0)) / N; k++; } }
  tb[N] = 1; clip._gw = tb; clip._gwStride = tot;
  return tb;
}
/** 걸음 주기 g → 그 클립의 시각 (g 0 = 오른발이 닿는 때) */
function gaitTime(ch, clip, g) {
  const tb = gaitWarp(ch, clip); let p = g;
  if (tb) { const x = g * GW_N, i = Math.min(GW_N - 1, x | 0); p = tb[i] + (tb[i + 1] - tb[i]) * (x - i); }
  return ((p + footOff(clip)) % 1) * clip.duration;
}
/**
 * 뼈 몇 개만 다른 자세(P)로 덮는다 (w = 섞는 비율). 자세를 입힌 뒤에 부르고 끝에 rig.pose() 를 부른다 — 준비 자세의 칼 든 팔처럼 "몸은 그대로, 팔만" 바꿀 때
 */
const _l1 = [0, 0, 0, 1], _l2 = [0, 0, 0, 1], _l3 = [0, 0, 0, 1], _l4 = [0, 0, 0, 1];
function layerBones(rig, P, keys, w) {
  const R = rig.R, PW = rig.parWR, RR = rig.restR;
  for (let i = 0; i < keys.length; i++) {
    const j = rig.key.get(keys[i]), d = P.rot.get(keys[i]); if (j == null || !d || !d.set) continue;
    const o = j * 4;
    _l1[0] = PW[o]; _l1[1] = PW[o + 1]; _l1[2] = PW[o + 2]; _l1[3] = PW[o + 3]; _l4[0] = RR[o]; _l4[1] = RR[o + 1]; _l4[2] = RR[o + 2]; _l4[3] = RR[o + 3];
    qmul(qconj(_l1, _l2), d, _l3); qmul(_l3, _l1, _l2); qmul(_l2, _l4, _l3); qnorm(_l3);   // applyPose 와 같은 식: P⁻¹ · d · P · rest
    const sg = R[o] * _l3[0] + R[o + 1] * _l3[1] + R[o + 2] * _l3[2] + R[o + 3] * _l3[3] < 0 ? -w : w;
    _l2[0] = R[o] * (1 - w) + _l3[0] * sg; _l2[1] = R[o + 1] * (1 - w) + _l3[1] * sg; _l2[2] = R[o + 2] * (1 - w) + _l3[2] * sg; _l2[3] = R[o + 3] * (1 - w) + _l3[3] * sg; qnorm(_l2);
    R[o] = _l2[0]; R[o + 1] = _l2[1]; R[o + 2] = _l2[2]; R[o + 3] = _l2[3];
  }
}
const READY_ARM = ['shoulderR', 'armR', 'forearmR', 'handR'];

/** 영웅 기술: 규칙 시간 t → 클립 시각. 클립의 strike 구간이 판정 구간 [h0,h1] 과 겹친다 */
export function warpMove(clip, t, mv) {
  const S = mv.strike ?? clip.meta?.strike; if (!S) return (t / mv.dur) * clip.duration;
  const h0 = mv.hit[0], h1 = mv.hit[1], lead = mv.lead ?? 0.2, tail = mv.tail ?? 0.35;
  if (t < h0) return Math.max(0, S[0] - lead * (1 - t / h0));
  if (t < h1) return S[0] + (S[1] - S[0]) * ((t - h0) / (h1 - h0));
  return Math.min(clip.duration - 0.01, S[1] + tail * ((t - h1) / Math.max(0.01, mv.dur - h1)));
}
/** 적 공격: 예고(windup) 동안 준비 동작을 천천히 올려 붙들고, 판정(strike) 동안 strike 구간을, 그 뒤는 마무리 */
export function warpAttack(clip, t, a) {
  const dur = clip.duration; let s0, s1;
  const SK = a.cut ?? clip.meta?.strike;   // (a.strike 는 판정 길이(초)다 — 클립 구간은 a.cut)
  if (SK) { s0 = SK[0]; s1 = SK[1]; }
  else { const r = clip.events?.find((e) => e[1] === 'release'); if (r) { s0 = r[0]; s1 = Math.min(dur, r[0] + 0.16); } else { s0 = dur * 0.4; s1 = dur * 0.62; } }
  const w = a.windup, st = a.strike;
  if (t < w) { const u = 1 - t / w, lead = Math.min(s0, w * 1.5); return s0 - lead * u * u; }
  if (t < w + st) return s0 + (s1 - s0) * ((t - w) / st);
  return Math.min(dur - 0.01, s1 + (t - w - st) * 1.1);
}
function pinLegs(rig) {   // 떠다니는 적: 다리 뼈를 쉬는 자세로 묶는다 (옷자락이 찢어지지 않게 — CAST_R1_ENEMIES §4)
  for (const b of LEGS) { const j = rig.key.get(b); if (j != null) for (let c = 0; c < 4; c++) rig.R[j * 4 + c] = rig.restR[j * 4 + c]; }
  rig.pose();
}
const _q = [0, 0, 0, 1], _a = [0, 0, 0, 1], _b = [0, 0, 0, 1], _c = [0, 0, 0, 1], _p = [0, 0, 0, 1];
/** 노드의 지금 세계 회전(모델 공간)을 사원수로. 크기는 버린다 */
function worldQuat(rig, n, o) {
  if (n < 0) { o[0] = o[1] = o[2] = 0; o[3] = 1; return o; }
  const W = rig.world, k = n * 16;
  const sx = 1 / (Math.hypot(W[k], W[k + 1], W[k + 2]) || 1), sy = 1 / (Math.hypot(W[k + 4], W[k + 5], W[k + 6]) || 1), sz = 1 / (Math.hypot(W[k + 8], W[k + 9], W[k + 10]) || 1);
  const m00 = W[k] * sx, m10 = W[k + 1] * sx, m20 = W[k + 2] * sx, m01 = W[k + 4] * sy, m11 = W[k + 5] * sy, m21 = W[k + 6] * sy, m02 = W[k + 8] * sz, m12 = W[k + 9] * sz, m22 = W[k + 10] * sz, t = m00 + m11 + m22;
  if (t > 0) { const r = Math.sqrt(t + 1) * 2; o[3] = r / 4; o[0] = (m21 - m12) / r; o[1] = (m02 - m20) / r; o[2] = (m10 - m01) / r; }
  else if (m00 > m11 && m00 > m22) { const r = Math.sqrt(1 + m00 - m11 - m22) * 2; o[3] = (m21 - m12) / r; o[0] = r / 4; o[1] = (m01 + m10) / r; o[2] = (m02 + m20) / r; }
  else if (m11 > m22) { const r = Math.sqrt(1 + m11 - m00 - m22) * 2; o[3] = (m02 - m20) / r; o[0] = (m01 + m10) / r; o[1] = r / 4; o[2] = (m12 + m21) / r; }
  else { const r = Math.sqrt(1 + m22 - m00 - m11) * 2; o[3] = (m10 - m01) / r; o[0] = (m02 + m20) / r; o[1] = (m12 + m21) / r; o[2] = r / 4; }
  return o;
}
/**
 * 뼈 하나를 모델 공간의 축으로 deg 만큼 더 돌린다. axis 0 = 옆 축(X: + 는 앞으로 숙임), 1 = 세로 축(Y: + 는 왼쪽으로 돌림), 2 = 앞 축(Z: + 는 오른쪽으로 기울임).
 * 자세를 입힌 뒤(Animator.update 뒤)에 부르고, 끝에 rig.pose() 를 한 번 부른다. 부모의 "지금" 세계 회전으로 옮겨 넣으므로 어떤 자세에서도 축이 맞는다
 */
function pitchBone(rig, key, deg, axis = 0) {
  const j = rig.key.get(key); if (j == null) return;
  const h = (deg * Math.PI) / 360, P = worldQuat(rig, rig.parent[j], _p), R = rig.R.subarray(j * 4, j * 4 + 4);
  _q[0] = 0; _q[1] = 0; _q[2] = 0; _q[axis] = Math.sin(h); _q[3] = Math.cos(h);
  qmul(qconj(P, _a), _q, _b); qmul(_b, P, _c); qmul(_c, R, _a); qnorm(_a);   // R' = P⁻¹ · q · P · R
  R[0] = _a[0]; R[1] = _a[1]; R[2] = _a[2]; R[3] = _a[3];
}
const _o = { fade: 0.12, time: null, speed: 1, restart: false };
/** Animator.play 에 줄 옵션 (틱마다 새 객체를 만들지 않게 하나를 돌려 쓴다) */
const PO = (fade, time = null, speed = 1, restart = false) => { _o.fade = fade; _o.time = time; _o.speed = speed; _o.restart = restart; return _o; };
const pick = (C, ...names) => { for (const n of names) if (n && C[n]) return n; return null; };

/**
 * 영웅 상태(sim.hero) → 방향 · 클립. ch = Char3D. 장면은 이 뒤에 ch.place(h.x, h.y, h.z) 로 놓고 그리면 된다.
 * 라이브러리 클립이 아직 없으면 시범판의 몰이(char3d/hero3d.js)로 돈다.
 */
export function driveHero(ch, h, dt, T = TUNE) {
  const C = ch.asset.clips;
  if (!attach(ch.asset, true) || !C.roll || !C.atk3) return driveHeroProto(ch, h, dt, T);
  const S = (ch._pm ??= { turnDir: 0, landC: null, wasDead: false, prev: '' }), A = ch.anim, st = h.anim;
  // ── 방향 ──
  if (h.dead || st === 'hurt') { /* 그대로 둔다: 맞고 밀리는 쪽으로 돌지 않는다 */ }
  else if (st === 'attack' || st === 'parry' || st === 'block') turn(ch, S, h.dirX, h.dirZ, dt, 42, 40);
  else if (st === 'roll') turn(ch, S, h.roll?.dx ?? h.dirX, h.roll?.dz ?? h.dirZ, dt, 34, 32);
  else if (st === 'guard') turn(ch, S, h.dirX, h.dirZ, dt, 22, 18);
  else turn(ch, S, h.dirX, h.dirZ, dt, 90, 40);   // 걷고 달리고 돌아설 때: 규칙이 몸의 방향을 이미 빠르기를 묶어 돌린다(sim._locomote) — 그림은 그대로 따른다 (속도와 몸이 어긋나지 않게)
  { const a1 = Math.atan2(ch.dz, ch.dx), w = dt > 0 ? wrapPi(a1 - (S.ang ?? a1)) / dt : 0; S.ang = a1; S.angV = (S.angV ?? 0) + (w - (S.angV ?? 0)) * Math.min(1, dt * 14); }   // 도는 빠르기 (rad/초, + = 왼쪽으로)
  // ── 클립 ──
  if (S.wasDead && !h.dead) A.play('idle', PO(0, null, 1, true));   // 다시 시작: 누운 자세에서 섞이지 않고 바로 선다
  S.wasDead = !!h.dead;
  if (st === 'land' && S.prev !== 'land') S.landC = 0;
  if (S.landC != null) { S.landC += dt; if ((st !== 'land' && st !== 'idle') || S.landC > 0.3) S.landC = null; }
  // 달리다 스틱을 놓으면: 뒤로 버티며 미끄러져 서는 동작 (run_stop 의 앞 0.55초를 0.3초에). 다시 밀거나 다른 동작이 오면 바로 끊긴다
  const sp = Math.hypot(h.vx, h.vz), ground = h.onGround && !h.move && h.dashT <= 0 && (st === 'run' || st === 'walk' || st === 'idle');
  if (S.wasPush && !h.pushed && ground && sp > (T.stopSkidAbove ?? 190) && C.run_stop) S.stopC = 0;
  if (S.stopC != null) { S.stopC += dt; if (h.pushed || !ground || S.stopC > 0.3) S.stopC = null; }
  S.wasPush = !!h.pushed;
  S.prev = st;
  if (h.dead) A.play(pick(C, 'knockdown', 'death'), PO(0.08, Math.min((h.deadT ?? h.animT) * 1.3, 2.45)));
  else if (st === 'hurt') A.play(h.heavyHurt && C.hit_heavy ? 'hit_heavy' : 'hit_light', PO(0.04, 0.02 + h.animT * 1.3));
  else if (st === 'parry') A.play('parry', PO(0.03, 0.28 + (T.parryT - h.parryOk) * 1.5));
  else if (st === 'block') A.play('block_hit', PO(0.03, 0.03 + (T.blockT - h.blockT) * 1.3));
  else if (st === 'guard') A.play('block', PO(0.08));
  else if (st === 'attack' && h.move) {
    const mv = h.move, clip = C[mv.clip] ?? C.atk1;
    // 내려베기: 떨어지는 동안은 칼을 머리 위로 든 자세(0.13초)로 버티다가, 땅에 닿기 0.12초 전부터 내리쳐 닿는 순간 칼이 몸 앞을 지난다(0.25초) → 웅크려 받는다
    if (mv.kind === 'plunge') A.play(clip.name, PO(0.05, h.plungeLand == null ? Math.min(0.13, 0.03 + h.moveT * 1.2) + 0.12 * (1 - clamp((h.plungeEta ?? 1) / 0.12, 0, 1)) : Math.min(clip.duration - 0.02, 0.25 + (h.moveT - h.plungeLand) * 1.5)));
    else A.play(clip.name, PO(0.05, warpMove(clip, h.moveT, mv)));
  }
  else if (st === 'roll') { const u = h.roll ? clamp(h.roll.t / h.roll.dur, 0, 1) : 0; A.play('roll', PO(0.05, 0.13 + u * 0.89)); }
  else if (st === 'jump') A.play('jump', PO(0.05, 0.1 + h.animT));
  else if (st === 'fall') A.play('air', PO(0.14));
  else if (S.landC != null) A.play('land', PO(0.04, 0.04 + S.landC * 1.5));
  else if (S.stopC != null) A.play('run_stop', PO(0.07, 0.07 + S.stopC * 1.85));
  else if (st === 'turn') {
    // 돌아서기: 달리던 것은 뒤로 버티며 낮게 미끄러지는 자세(run_stop 0.09–0.3초)로 멈추고, 반쯤 돌면 박차는 달리기 자세로 넘어간다. 걷던 것은 제자리걸음으로 돈다
    const total = Math.max(0.08, ((h.pivotA ?? 3.1) - (T.pivotEnd ?? 45) * 0.01745) / (T.pivotRate ?? 14.8)), u = (h.pivotT ?? 0) / total;
    if ((h.pivotV ?? 275) < 150 || !C.run_stop) { const c = C.walk; A.play('walk', PO(0.1, gaitTime(ch, c, (0.3 + (h.pivotT ?? 0) * 1.5) % 1))); }
    else if (u < 0.55) A.play('run_stop', PO(0.05, 0.09 + (h.pivotT ?? 0) * 1.7));
    else A.play('run', PO(0.09, gaitTime(ch, C.run, 0.86)));
  }
  else if (st === 'run' || st === 'walk') { const c = C[st]; A.play(st, PO(S.prev0 === 'turn' ? 0.06 : 0.14, gaitTime(ch, c, h.gait))); }
  else A.play(h.lock != null && C.idle_combat ? 'idle_combat' : 'idle', PO(0.2));
  S.prev0 = st;
  A.update(dt);
  // 준비 자세(락온한 채 서 있을 때): idle_combat 은 칼끝이 등 뒤를 본다 → 칼 든 팔만 겨눔 자세(guard_walk 의 팔: 칼끝이 앞)로 덮는다. 공격이 시작되면 0.1초에 풀려 준비 동작이 그대로 나온다
  const rdy = st === 'idle' && h.lock != null && !h.dead && A.cur === C.idle_combat && C.guard_walk ? 1 : 0;
  S.ready = (S.ready ?? 0) + (rdy - (S.ready ?? 0)) * Math.min(1, dt * (rdy ? 9 : 16));
  const readyOn = S.ready > 0.02;
  if (readyOn) layerBones(ch.rig, (ch.asset._readyPose ??= sampleClip(C.guard_walk, 0.3, new CPose())), READY_ARM, S.ready);
  // 달릴 때 윗몸을 조금 세운다: 달리기 클립은 26° 숙어 있어 위에서 비스듬히 보는 카메라에 얼굴이 묻힌다 → 골반–머리 선으로 19° 쯤
  S.lean = (S.lean ?? 0) + ((st === 'run' && !h.dead ? 1 : 0) - (S.lean ?? 0)) * Math.min(1, dt * 9);
  if (S.lean > 0.02) {
    pitchBone(ch.rig, 'spine', -(T.runLeanFix ?? 12) * 0.55 * S.lean); pitchBone(ch.rig, 'spine2', -(T.runLeanFix ?? 12) * 0.45 * S.lean);
    const bank = clamp(-(S.angV ?? 0) * (T.runBank ?? 1.1), -11, 11) * S.lean;   // 돌 때 도는 쪽으로 몸을 기울인다 (달리는 동안만)
    if (Math.abs(bank) > 0.3) { pitchBone(ch.rig, 'hips', bank * 0.5, 2); pitchBone(ch.rig, 'spine', bank * 0.5, 2); }
  }
  // 락온한 적을 고개로 본다 (서 있거나 걷고 달릴 때만; 공격 · 구르기 중에는 몸이 이미 그쪽을 본다)
  let look = 0;
  if (h.lock != null && !h.dead && (st === 'idle' || st === 'run' || st === 'walk' || st === 'guard' || st === 'land')) {
    const tx = h.lockX - h.x, tz = h.lockZ - h.z, f = tx * ch.dx + tz * ch.dz, l = tz * ch.dx - tx * ch.dz;   // 앞 · 왼쪽 성분 (모델의 +X = 왼쪽)
    if (f * f + l * l > 400) look = clamp(Math.atan2(l, f) * 57.3, -(T.lookMax ?? 58), T.lookMax ?? 58);
    if (Math.abs(Math.atan2(l, f)) > 2.4) look = 0;   // 등 뒤의 적까지 목을 꺾어 보지는 않는다
  }
  S.look = (S.look ?? 0) + (look - (S.look ?? 0)) * Math.min(1, dt * 8);
  const posed = S.lean > 0.02 || readyOn, looking = Math.abs(S.look) > 0.5;
  if (looking) { pitchBone(ch.rig, 'neck', S.look * 0.4, 1); pitchBone(ch.rig, 'head', S.look * 0.45, 1); pitchBone(ch.rig, 'spine2', S.look * 0.15, 1); }
  if (posed || looking) ch.rig.pose();
}

/**
 * 적 · 인물 상태 → 방향 · 클립. e 가 sim 의 적(e.def 또는 KINDS 에 있는 e.kind)이면 종류표의 클립 이름을 쓴다.
 * 그 밖의 것(말하는 인물 등)은 e.dirX/dirZ 를 보고, e.clip 또는 e.anim 과 같은 이름의 클립을 튼다(없으면 idle).
 */
export function driveActor(ch, e, dt) {
  const D = e.def ?? (e.kind != null ? KINDS[e.kind] : null);
  const S = (ch._pm ??= { turnDir: 0, init: false }), C = ch.asset.clips, A = ch.anim;
  if (!D) {
    attach(ch.asset, true);
    turn(ch, S, e.dirX ?? e.facing ?? 1, e.dirZ ?? 0, dt, 12, 14);
    if (e.clip && !C[e.clip]) ownClip(ch.asset, e.clip);   // 그 모델에만 든 클립 (마을 사람의 걸음 등)
    const want = e.state === 'dead' ? pick(C, 'death_back', 'death') : pick(C, e.clip, e.anim);
    A.play(want ?? pick(C, 'idle') ?? Object.keys(C)[0], PO(0.15));
    A.update(dt); return;
  }
  attach(ch.asset, D.lib !== false); attachKind(ch.asset, D);
  const K = D.clips, atk = e.state === 'attack' && e.atk;
  if (e.state !== 'dead' && !e.dead) turn(ch, S, e.dirX, e.dirZ, dt, atk ? 24 : 13, 22);
  let name = null, o = PO(0.14);   // (PO 는 하나를 돌려 쓴다 — 마지막에 부른 값이 남는다)
  if (e.state === 'dead' || e.dead) { name = pick(C, K.death, 'death'); if (name && !C[name].loop) o = PO(0.08, Math.min(Math.max(0, D.dieT - e.dying) * 1.25 + 0.02, C[name].duration - 0.02)); }
  else if (e.anim === 'buried' || e.state === 'rise') { name = pick(C, K.rise, 'rise'); if (name) o = PO(e.anim === 'buried' ? 0 : 0.1, e.anim === 'buried' ? 0.02 : Math.min(0.02 + e.stateT * (C[name].duration / (D.riseT ?? 1.25)), C[name].duration - 0.02)); }
  else if (e.state === 'stagger') { name = pick(C, e.staggerSide < 0 ? K.stagger + '_r' : null, K.stagger, K.hurt); if (name && !C[name].loop) o = PO(0.06, Math.min(0.02 + e.animT * 1.15, C[name].duration - 0.02)); }
  else if (e.anim === 'hurt') { name = pick(C, K.hurt); if (name && !C[name].loop) o = PO(0.04, 0.02 + e.animT * 1.3); }
  else if (atk) { name = pick(C, atk.clip); if (name) o = C[name].loop ? PO(0.08, null, e.phase === 'strike' ? 1.7 : 1.2) : PO(0.07, warpAttack(C[name], e.stateT, atk)); }
  else if (e.anim === 'walk') { name = pick(C, K.walk); if (name && D.stride && !D.floats && !D.fly) o = PO(0.16, ((e.gait + footOff(C[name])) % 1) * C[name].duration); }   // (적의 걸음은 stride 를 뼈대에서 재서 맞춰 두었다 — 표를 쓰지 않는다)
  if (!name) name = pick(C, K.idle, 'idle', 'run') ?? Object.keys(C)[0];
  A.play(name, o);
  if (!S.init) { S.init = true; if (!A.ext) A.t = (e.id * 0.37) % (C[name].duration || 1); }   // 떼로 나올 때 같은 박자로 움직이지 않게
  A.update(dt);
  // 숙임: 나는 것(박쥐)은 몸을 앞으로 숙여 날고 내리꽂을 때 더 숙인다. 떠다니는 것은 움직이는 만큼 숙여 자락이 뒤로 흐른다. (골반 뼈를 돌린다 → 장면은 ch.place 그대로)
  const strike = atk && e.phase === 'strike', want = D.pitch ? D.pitch + (strike ? 24 : 0) : D.floats ? (strike ? 20 : 12 * clamp((e.moved ?? 0) / (D.speed || 60), 0, 1)) : 0;
  S.pitch = (S.pitch ?? want) + (want - (S.pitch ?? want)) * Math.min(1, dt * 7);
  if (S.pitch > 0.5 && e.state !== 'dead') pitchBone(ch.rig, 'hips', S.pitch);
  if (D.floats) pinLegs(ch.rig); else if (S.pitch > 0.5 && e.state !== 'dead') ch.rig.pose();
  // 비침: 유령의 흐림 · 또렷함을 장면의 그리기 옵션에 바로 적는다 (장면이 e.alpha 를 스스로 읽으면 그 값이 이긴다 — 같은 값이다)
  if (ch.opt && D.fade != null) ch.opt.alpha = e.state === 'dead' ? 1 : clamp(e.alpha ?? 1, 0.05, 1);
}

/**
 * 놓기: ch.place(e.x, e.y, e.z) 와 같다 (옛 이름을 남겨 둔다). 박쥐의 숙임은 driveActor 가 골반 뼈에 넣으므로 장면은 그냥 ch.place 를 써도 된다.
 */
export function placeActor(ch, e) { return ch.place(e.x, e.y, e.z); }
