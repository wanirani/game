// v2 char3d — 손으로 쓴 절차 클립 (정규 자세로 쓴다: 어떤 사람형 뼈대에도 그대로 튼다). docs/v2/CHAR3D_PILOT.md §4
// 각도는 도. 축은 캐릭터 기준: x = 왼쪽 축(+ 로 돌리면 윗몸이 앞으로 숙는다 / 늘어뜨린 팔·다리는 뒤로 간다),
//   y = 위 축(+ = 왼쪽으로 비틂), z = 앞 축(+ = 윗몸이 오른쪽으로 기운다 / 왼팔이 올라가고 오른팔이 내려간다).
// 쉬는 자세는 A 자세(팔이 수평에서 약 45° 아래)라고 본다: 팔을 차렷으로 내리려면 왼팔 z −44, 오른팔 z +44.
import { clipFromAnim } from './skel.js';

const S = Math.sin, TAU = Math.PI * 2;
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, u) => a + (b - a) * u;

/** 자세 사전 {뼈:[x,y,z], root:[x,y,z]} 을 P 에 쓴다 */
function put(P, pose) {
  for (const k in pose) { const v = pose[k]; if (k === 'root') { P.root[0] = v[0]; P.root[1] = v[1]; P.root[2] = v[2]; } else P.e(k, v[0], v[1], v[2]); }
}
/** 두 자세 사전을 섞는다 (없는 뼈는 0) */
function mix(a, b, u) {
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const p = a[k] ?? [0, 0, 0], q = b[k] ?? [0, 0, 0]; o[k] = [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)]; }
  return o;
}
/** 키 자세 목록 [[u, pose], …] 에서 u 시점 자세 */
function keyed(keys, u) {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (u <= keys[i][0]) return mix(keys[i - 1][1], keys[i][1], ease((u - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  return keys[keys.length - 1][1];
}

// 기본 자세: 무기를 든 오른손을 앞에 두고 선 준비 자세
const READY = {
  armL: [10, 0, -40], forearmL: [-18, 0, 0], armR: [-12, -8, 38], forearmR: [-48, 0, 0], handR: [0, 0, 0],
  spine: [3, -6, 0], spine2: [2, -6, 0], head: [-3, 10, 0],
  uplegL: [-10, 0, 0], legL: [14, 0, 0], footL: [-4, 0, 0], uplegR: [6, -8, 0], legR: [10, 0, 0], footR: [-14, 0, 0], root: [0, -0.02, 0],
};
const P_JUMP = { ...READY, armL: [-45, 0, -25], forearmL: [-30, 0, 0], armR: [30, 0, 30], forearmR: [-35, 0, 0], spine: [8, 0, 0], spine2: [4, 0, 0], head: [-10, 0, 0], uplegL: [-62, 0, 0], legL: [86, 0, 0], footL: [20, 0, 0], uplegR: [18, 0, 0], legR: [38, 0, 0], footR: [30, 0, 0], root: [0, 0, 0] };
const P_FALL = { ...READY, armL: [-15, 0, -5], forearmL: [-25, 0, 0], armR: [-5, 0, 12], forearmR: [-40, 0, 0], spine: [-4, 0, 0], spine2: [-3, 0, 0], head: [8, 0, 0], uplegL: [-28, 0, 0], legL: [42, 0, 0], footL: [22, 0, 0], uplegR: [-6, 0, 0], legR: [30, 0, 0], footR: [26, 0, 0], root: [0, 0, 0] };
const P_LAND = { ...READY, armL: [-20, 0, -30], forearmL: [-40, 0, 0], armR: [10, 0, 34], forearmR: [-55, 0, 0], spine: [20, 0, 0], spine2: [10, 0, 0], head: [-18, 0, 0], uplegL: [-52, 0, 0], legL: [92, 0, 0], footL: [-38, 0, 0], uplegR: [-44, 0, 0], legR: [86, 0, 0], footR: [-40, 0, 0], root: [0, -0.2, 0] };
const P_DASH = { ...READY, armL: [58, 0, -28], forearmL: [-12, 0, 0], armR: [62, 0, 26], forearmR: [-14, 0, 0], spine: [30, 0, 0], spine2: [16, 0, 0], head: [-34, 0, 0], uplegL: [-70, 0, 0], legL: [64, 0, 0], footL: [-6, 0, 0], uplegR: [34, 0, 0], legR: [30, 0, 0], footR: [36, 0, 0], root: [0, -0.13, 0.04] };
const P_HURT = { ...READY, armL: [-30, 0, 18], forearmL: [-50, 0, 0], armR: [-10, 0, -8], forearmR: [-60, 0, 0], spine: [-18, 14, 6], spine2: [-12, 10, 0], head: [16, -10, 0], uplegL: [-20, 0, 0], legL: [30, 0, 0], uplegR: [12, 0, 0], legR: [16, 0, 0], root: [0, -0.04, -0.05] };
const P_DOWN = { ...READY, armL: [-60, 0, 30], forearmL: [-20, 0, 0], armR: [-50, 0, -30], forearmR: [-20, 0, 0], spine: [-10, 0, 0], spine2: [-8, 0, 0], head: [-10, 0, 0], hips: [-80, 0, 0], uplegL: [-10, 0, 0], legL: [16, 0, 0], uplegR: [4, 0, 0], legR: [8, 0, 0], root: [0, -0.86, -0.3] };
// 2타: 왼쪽에서 오른쪽으로 긋는 가로 베기 (백핸드)
const A2 = [
  [0.00, { ...READY, spine: [6, 34, 0], spine2: [4, 26, 0], head: [-4, -30, 0], armR: [-78, 78, 44], forearmR: [-52, 0, 0], armL: [20, 0, -34], forearmL: [-30, 0, 0], uplegL: [-16, 0, 0], legL: [22, 0, 0], root: [0, -0.05, 0] }],
  [0.20, { ...READY, spine: [8, 38, 0], spine2: [5, 30, 0], head: [-4, -34, 0], armR: [-82, 86, 44], forearmR: [-60, 0, 0], armL: [24, 0, -34], forearmL: [-30, 0, 0], uplegL: [-18, 0, 0], legL: [24, 0, 0], root: [0, -0.06, 0] }],
  [0.50, { ...READY, spine: [10, -30, 0], spine2: [6, -26, 0], head: [-4, 24, 0], armR: [-86, -56, 44], forearmR: [-6, 0, 0], armL: [34, 0, -30], forearmL: [-36, 0, 0], uplegL: [-26, 0, 0], legL: [32, 0, 0], uplegR: [14, 0, 0], legR: [14, 0, 0], root: [0, -0.07, 0.03] }],
  [1.00, { ...READY, spine: [6, -22, 0], spine2: [4, -18, 0], head: [-4, 18, 0], armR: [-60, -70, 44], forearmR: [-30, 0, 0], armL: [20, 0, -34], forearmL: [-30, 0, 0], root: [0, -0.04, 0.02] }],
];
// 3타: 앞으로 크게 내딛는 찌르기
const A3 = [
  [0.00, { ...READY, spine: [4, -30, 0], spine2: [2, -24, 0], head: [-4, 34, 0], armR: [34, -10, 34], forearmR: [-118, 0, 0], armL: [-58, 0, -30], forearmL: [-20, 0, 0], uplegL: [-20, 0, 0], legL: [30, 0, 0], uplegR: [10, 0, 0], legR: [16, 0, 0], root: [0, -0.07, -0.02] }],
  [0.23, { ...READY, spine: [6, -36, 0], spine2: [3, -28, 0], head: [-4, 40, 0], armR: [44, -10, 34], forearmR: [-128, 0, 0], armL: [-66, 0, -30], forearmL: [-16, 0, 0], uplegL: [-24, 0, 0], legL: [34, 0, 0], uplegR: [12, 0, 0], legR: [18, 0, 0], root: [0, -0.08, -0.03] }],
  [0.50, { ...READY, spine: [24, 22, 0], spine2: [10, 16, 0], head: [-26, -22, 0], armR: [-92, 8, 44], forearmR: [0, 0, 0], armL: [50, 0, -24], forearmL: [-20, 0, 0], uplegL: [-62, 0, 0], legL: [58, 0, 0], footL: [-4, 0, 0], uplegR: [30, 0, 0], legR: [10, 0, 0], footR: [30, 0, 0], root: [0, -0.15, 0.12] }],
  [1.00, { ...READY, spine: [16, 14, 0], spine2: [8, 10, 0], head: [-18, -14, 0], armR: [-80, 6, 44], forearmR: [-14, 0, 0], armL: [36, 0, -28], forearmL: [-24, 0, 0], uplegL: [-48, 0, 0], legL: [50, 0, 0], uplegR: [22, 0, 0], legR: [12, 0, 0], footR: [20, 0, 0], root: [0, -0.11, 0.09] }],
];
// 공중 베기: 위에서 아래로
const AA = [
  [0.00, { ...P_FALL, spine: [-14, -16, 0], armR: [-168, 0, 44], forearmR: [-50, 0, 0], armL: [-30, 0, -20] }],
  [0.22, { ...P_FALL, spine: [-18, -18, 0], armR: [-176, 0, 44], forearmR: [-60, 0, 0], armL: [-36, 0, -20] }],
  [0.52, { ...P_FALL, spine: [22, 12, 0], spine2: [10, 8, 0], armR: [-36, 10, 44], forearmR: [-4, 0, 0], armL: [40, 0, -24], uplegL: [-50, 0, 0], legL: [70, 0, 0] }],
  [1.00, { ...P_FALL, spine: [14, 8, 0], armR: [-20, 10, 44], forearmR: [-20, 0, 0], armL: [30, 0, -24] }],
];

/** 절차 클립 묶음 (뼈대와 무관) */
export function proceduralClips() {
  const C = {};
  const mk = (name, duration, loop, fn) => { C[name] = { name, duration, loop, fn, source: 'procedural' }; };
  mk('idle', 2.6, true, (t, P) => {
    const b = S((t / 2.6) * TAU), b2 = S((t / 2.6) * TAU + 1.1);
    put(P, READY);
    P.e('spine', 3 + 1.6 * b, -6, 0); P.e('spine2', 2 + 1.6 * b, -6, 0); P.e('head', -3 - 1.2 * b, 10 + 2 * b2, 0);
    P.e('armL', 10 + 1.5 * b2, 0, -40 + 1.2 * b); P.e('armR', -12 + 2 * b, -8, 38 - 1.2 * b); P.e('forearmR', -48 - 3 * b2, 0, 0);
    P.root[1] = -0.02 - 0.006 * b;
  });
  mk('jump', 0.24, false, (t, P, u) => put(P, mix(P_LAND, P_JUMP, ease(u / 0.5))));
  mk('fall', 1.2, true, (t, P) => { put(P, P_FALL); const w = S(t * 9); P.e('armL', -15 + 4 * w, 0, -5 + 3 * w); P.e('armR', -5 - 4 * w, 0, 12 - 3 * w); });
  mk('land', 0.14, false, (t, P, u) => put(P, mix(P_LAND, READY, ease(u))));
  mk('dash', 0.19, false, (t, P, u) => put(P, mix(READY, P_DASH, ease(u / 0.3))));
  mk('hurt', 0.3, false, (t, P, u) => put(P, u < 0.3 ? mix(READY, P_HURT, ease(u / 0.3)) : mix(P_HURT, READY, ease((u - 0.3) / 0.7) * 0.6)));
  mk('death_p', 0.9, false, (t, P, u) => put(P, u < 0.25 ? mix(READY, P_HURT, ease(u / 0.25)) : mix(P_HURT, P_DOWN, ease((u - 0.25) / 0.75))));
  mk('atk2', 0.26, false, (t, P, u) => put(P, keyed(A2, u)));
  mk('atk3', 0.3, false, (t, P, u) => put(P, keyed(A3, u)));
  mk('atk_air', 0.26, false, (t, P, u) => put(P, keyed(AA, u)));
  return C;
}

/** 모델에 든 라이브러리 클립(이름으로 찾는다) + 절차 클립 → 재생기용 묶음. 이름: run · atk1 · death + 절차 클립 */
export function buildClips(rig, anims) {
  const C = proceduralClips();
  const find = (re) => anims.find((a) => re.test(a.name));
  const run = find(/run/i), slash = find(/slash/i), down = find(/knock|dead|dying|fall/i);
  if (run) C.run = clipFromAnim(rig, run, { name: 'run', loop: true, inPlace: true });
  if (slash) C.atk1 = clipFromAnim(rig, slash, { name: 'atk1', loop: false, rootRel: true });
  if (down) C.death = clipFromAnim(rig, down, { name: 'death', loop: false, rootRel: true });
  if (!C.death) C.death = { ...C.death_p, name: 'death' };
  return C;
}
