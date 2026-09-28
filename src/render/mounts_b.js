// 탈것 렌더러 B — owner: CMP-MOUNT-ART-B (companions §11.1–11.2; MASTER_PLAN §1.2 · §1.15; docs/specs/ART_DECISION.md)
//
//  이 모듈을 불러오면 (mounts.js 가 import 한다) mount_rig 의 템플릿 등록부에 네 리그가 등록된다:
//   wolf     스콜 mt_direwolf     네발 · 도약 질주 'bound' · 척추 늘임 ±6% · 꼬리 흩날림 · 송곳니 돌진 = 덮치기(앞발 뻗기) · 벽 차기 · 포효
//   wyvern   스칼렛 mt_wyvern     네발 비룡 + 날개 (그림이 네발 비룡이라 네발 엔진 + 날개; 명세의 두 발 걷기 대신) · 날갯짓 (내림 0.18 / 올림 0.22초)
//                                 · 활공 · 급강하 (몸이 내리꽂히는 각도로 기운다) · 화염 숨결 (입이 숨결 상자에 온다) · 긴 꼬리 3마디
//   bat      녹티스 mt_giantbat   전용 자세 (T.pose): 날개 손목을 딛고 기기 · 이륙 · 날갯짓 0.28초 · 정지 비행 잔 날갯짓 · 급강하 · 흡혈 급습 · 초음파
//   griffin  게일 mt_gale         네발 + 깃털 날개 · 활공 · 날갯짓 · 질풍 돌격 (8방향: 몸이 그 방향으로 기운다) · 뇌명 급강하 (도약 'jump' → 0.08초
//                                 날개를 치켜들고 멈칫 'dive' → 날개를 뒤로 접고 내리꽂힘 → 착지 'land' 0.26초 웅크림). 번개 입자는 mount_b.js 가 낸다.
//  치수는 채색 그림에서 잰 값 (python3 tools/painted/companions/mt_direwolf/mounts_b_build.py tune all) → 채색 퍼핏과 벡터가 같은 관절을 쓴다.
//
//  MOUNT_DRAW_B[id](ctx, m, world, layer, opts)   mounts.drawMount 가 먼저 부른다 (opts 계약은 mounts.js 와 같다).
//      채색 리그(registry 등록 + 구워짐 + 켜짐)가 있으면 퍼핏, 아니면 벡터 (굽는 중 · ?painted=0 · 실패).
//      back = 먼 날개 · 꼬리 · 먼 다리 · 몸 · (위로 든) 가까운 날개 · 머리 · 가까운 다리 · 등자 끈
//      front = (아래로 내려친) 가까운 날개 · 등자 · 고삐 — 기수 위에 겹친다
//  MOUNT_ICON_B[id](ctx, id, x, y, r)             절차적 머리 아이콘 (채색이 구워져 있으면 채색 머리)
//  MOUNT_PAL_B                                     탈것별 색
//
// ── 포즈에 더하는 필드 (mount_rig 네발 필드 외) ─────────────────────────────────────────────
//  wing / fwing = { rx, ry, wx, wy, tx, ty, e, fold, front }  가까운 / 먼 날개: 어깨 → 손목 → 날개 끝 (지역 좌표).
//      e = 들림 (1 = 그림처럼 치켜듦, 0 = 수평(옆에서 보면 얇다), −1 = 아래로 내려침), fold = 접힘 0..1, front = front 층에 그린다.
//      채색: 날개 부품 한 장을 root · wrist · tip 세 점이 이 세 점에 오도록 아핀 변환 (내려치면 저절로 뒤집힌다).
//  ta[i] = 꼬리 마디 절대 각도 (길이 T.tailSeg[i].len; 비룡·그리핀은 마디마다 부품 하나, 늑대는 부품 한 장을 띠로 잘라 굽힌다)
//  bat: legs[0] / [2] = 먼 / 가까운 뒷다리 (rx,ry 엉덩이 → fx,fy 발), legs[1] / [3] = 먼 / 가까운 날개 손목 (땅을 짚는 앞발)
//  s.b = 이 모듈의 스프링 상태 (그리는 쪽은 읽지 않는다). 포즈는 structuredClone 으로 복사된다 (잔상) → 함수·클래스를 넣지 않는다.
//
// 규칙: 그리기에서 Math.random · world.fx.emit 을 쓰지 않는다 (빛은 시간 함수). 그라디언트는 지역 좌표에서 한 번 만들어 캐시.
// 품질: high 전부 · medium 효과 절반 · low 눈빛만. 모든 그리기는 ctx.save/restore 안에서 (예외가 나도 상태가 새지 않는다).
import { clamp, lerp, TAU, shade } from '../core/math.js';
import { game } from '../core/game.js';
import * as RIG from './mount_rig.js';
import * as REG from './painted/registry.js';
import { puff, Drawer, pickVariant, silhouette } from './painted/kit.js';

const PI = Math.PI;
const OUT = '#0a0608';
const fin = (v, d) => (Number.isFinite(v) ? v : d);
const smooth = (t) => t * t * (3 - 2 * t);
const ease = (rate, dt) => (dt > 0 ? 1 - Math.exp(-rate * dt) : 1);
const AIR = new Set(['jump', 'fall', 'flap', 'glide', 'hover', 'dive', 'wall', 'takeoff']);
const RUN = new Set(['run', 'charge', 'flee']);

// ───────────────────────── 색 ─────────────────────────
export const MOUNT_PAL_B = {
  mt_direwolf: { coat: '#c8d8e8', hi: '#f4faff', dark: '#6a7a8a', deep: '#2a3440', patch: '#56708e', leather: '#4a2e1c', trim: '#e8e0d0', claw: '#22242c', nose: '#1a1c22', eye: '#8ae8ff', glow: '#8ae8ff', awake: '#d8fbff', breath: '#dff4ff' },
  mt_wyvern: { coat: '#a01828', hi: '#d8404a', dark: '#5a0a14', belly: '#ff9a4a', bellyHi: '#ffd070', horn: '#2a1418', membrane: '#8a1422', vein: '#4a0810', leather: '#6a3a1c', trim: '#c89040', claw: '#1a0c0e', eye: '#ffd070', glow: '#ff8a3a', awake: '#ffb060', breath: '#ff9a4a' },
  mt_giantbat: { coat: '#2a1e24', hi: '#4a3440', dark: '#141016', membrane: '#5a1422', vein: '#ff2a3a', ear: '#8a4a4a', silver: '#c8c8d0', leather: '#2a1a1e', trim: '#c8c8d0', claw: '#0c080a', fang: '#f0e8e0', eye: '#ff2a3a', glow: '#ff2a3a', awake: '#ff7a8a', breath: '#ff6a7a' },
  mt_gale: { coat: '#b8bcc4', hi: '#e8eaee', dark: '#6a6e78', feather: '#f4f4f0', featherDk: '#9aa0aa', gold: '#ffd060', beak: '#f0c040', scale: '#d8b060', leather: '#6a4424', trim: '#ffd060', claw: '#2a2420', eye: '#9fd0ff', glow: '#bfe0ff', awake: '#fff2a0', breath: '#dff0ff' },
};
const palOf = (id) => MOUNT_PAL_B[id] ?? MOUNT_PAL_B.mt_direwolf;

// ───────────────────────── 템플릿 도우미 ─────────────────────────
/** 날개 치수: 그림의 어깨·손목·날개 끝 (지역 px) + 접힘/뒤로 젖힘 벡터 (팔 길이 la · 손 길이 lh 배수) */
function wingT(root, wrist, tip, o) {
  const a = [wrist[0] - root[0], wrist[1] - root[1]], h = [tip[0] - wrist[0], tip[1] - wrist[1]];
  const la = Math.hypot(a[0], a[1]), lh = Math.hypot(h[0], h[1]);
  const V = (q) => ({ a: [la * q[0], la * q[1]], h: [lh * q[2], lh * q[3]] });
  return {
    x: root[0], y: root[1], a, h, la, lh, fold: V(o.fold), sweep: V(o.sweep),
    far: o.far ?? [5, -3], farK: o.farK ?? 0.92, period: o.period, down: o.down, glide: o.glide, hover: o.hover ?? { per: 0.2, amp: 0.45, bias: 0.4 },
    gx: o.gx ?? 18, feather: !!o.feather, fingers: o.fingers ?? 3,
  };
}
/** 꼬리 마디: 관절 점들 → [{len, abs, rel}] (rel = 앞 마디에 대한 쉴 때 굽힘, 풀린 각도) */
function tailT(pts) {
  const seg = [];
  let prev = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
    let a = Math.atan2(dy, dx);
    if (prev != null) { while (a - prev > PI) a -= TAU; while (a - prev < -PI) a += TAU; }
    seg.push({ len: Math.hypot(dx, dy), abs: a, rel: prev == null ? a : a - prev });
    prev = a;
  }
  return seg;
}
function tailLine(x, y, a, n, len) { const p = [[x, y]]; for (let i = 0; i < n; i++) { x += Math.cos(a) * len; y += Math.sin(a) * len; p.push([x, y]); } return p; }

// ───────────────────────── 포즈 도우미 ─────────────────────────
const QT = new WeakMap();
/** 네발 엔진용 파생 템플릿: 꼬리는 이 모듈이 푼다 (마디 길이가 제각각이고, 9마디 이상이면 엔진 스프링이 불안정) */
function quadT(T) { let q = QT.get(T); if (!q) { q = { ...T, tail: { ...T.tail, n: 0 } }; QT.set(T, q); } return q; }
function bs(P) {
  let S = P.s.b;
  if (!S) {
    S = P.s.b = { seed: P.s.idleSeed ?? 1, we: null, weh: 1, wf: 1, ws: 0, cw: 0, wph: 0, dp: 0, hd: 0, bb: 0, pt: 0, lg: 0, gw: 1, jw: 0, lift: 0, ta: null, tv: null };
  }
  return S;
}
/** 몸통 위 점 (쉴 때 지역 좌표) → 지금 지역 좌표 (네발: 가까운 뒷다리 뿌리 = 몸 부품의 'hp' 핀, 기울기 · 가로 늘임) */
function qBody(P, T, qx, qy, out) {
  const L2 = P.legs[2], c = Math.cos(P.pitch), s = Math.sin(P.pitch), st = P.stretch ?? 1;
  const dx = (qx - T.hp[0]) * st, dy = qy - T.hp[1];
  out[0] = L2.rx + c * dx - s * dy; out[1] = L2.ry + s * dx + c * dy;
  return out;
}
/** 포즈 전체를 (cx, cy) 둘레로 d 만큼 돌린다 (공중 기울기: 안장을 축으로 → 기수가 흔들리지 않는다) */
function rigidRot(P, cx, cy, d) {
  if (!d) return;
  const c = Math.cos(d), s = Math.sin(d);
  const rot = (o, kx, ky) => { const x = o[kx] - cx, y = o[ky] - cy; o[kx] = cx + c * x - s * y; o[ky] = cy + s * x + c * y; };
  rot(P, 'bx', 'by'); rot(P, 'nx', 'ny'); rot(P, 'hx', 'hy'); rot(P, 'tx', 'ty'); rot(P.sl, 'x', 'y');
  for (const L of P.legs) { rot(L, 'rx', 'ry'); rot(L, 'kx', 'ky'); rot(L, 'fx', 'fy'); L.a1 += d; L.a2 += d; }
  P.pitch += d; P.ba += d; P.na += d; P.ha += d;
  for (let k = 0; k < P.ta.length; k++) P.ta[k] += d;
}
function shift(P, dx, dy) {
  if (!dx && !dy) return;
  P.bx += dx; P.by += dy; P.nx += dx; P.ny += dy; P.hx += dx; P.hy += dy; P.tx += dx; P.ty += dy; P.sl.x += dx; P.sl.y += dy;
  for (const L of P.legs) { L.rx += dx; L.ry += dy; L.kx += dx; L.ky += dy; L.fx += dx; L.fy += dy; }
}
/** 머리 추가 각도 (스프링; 목 뿌리 둘레) */
function headAdj(P, T, d) {
  if (!d) return;
  P.na += d; P.ha += d;
  P.hx = P.nx + Math.cos(P.na) * T.neck.len; P.hy = P.ny + Math.sin(P.na) * T.neck.len;
}
function finishSeat(P, m) {
  const f = (m.facing ?? 1) < 0 ? -1 : 1;
  P.seat.x = fin(m.cx, 0) + f * P.sl.x; P.seat.y = fin(m.bottom, 0) + P.sl.y;
  P.seat.lean = clamp(P.pitch * 0.55, -0.45, 0.3);
}
/** 속도 방향 → 몸 기울기 (코 아래 = +) */
function velPitch(m, def, lo, hi) {
  const vx = Math.abs(fin(m.vx, 0)), vy = fin(m.vy, 0);
  if (vx + Math.abs(vy) < 120) return def;
  return clamp(Math.atan2(vy, vx + 1), lo, hi);
}
const _ik = { kx: 0, ky: 0, fx: 0, fy: 0, a1: 0, a2: 0 };
function setLeg(L, o) { L.kx = o.kx; L.ky = o.ky; L.fx = o.fx; L.fy = o.fy; L.a1 = o.a1; L.a2 = o.a2; }
/** 공중 다리 자세 (몸 기준 목표, 다리 길이 배수) — 앞: tuck 접기 · trail 뒤로 접기 · strike 발톱 앞으로 / 뒤: tuck · trail 뒤로 뻗기 · push 아래로 차기 */
const LEGM = {
  tuck: { f: [0.34, 0.5], h: [-0.16, 0.62] },
  trail: { f: [-0.1, 0.55], h: [-0.8, 0.42] },
  strike: { f: [0.72, 0.62], h: [-0.84, 0.3] },
  push: { f: [0.3, 0.46], h: [-0.28, 0.94] },
};
function airLegs(P, T, fm, hm, t, w = 1) {
  if (w <= 0.001) return;
  for (let i = 0; i < 4; i++) {
    const fore = i === 1 || i === 3, mode = LEGM[fore ? fm : hm];
    if (!mode) continue;
    const L = P.legs[i], l1 = fore ? T.l1f : T.l1h, l2 = fore ? T.l2f : T.l2h, len = l1 + l2;
    const q = fore ? mode.f : mode.h, far = i < 2 ? 0.07 : 0, wob = Math.sin(t * 4.3 + i * 1.7) * 0.03;
    const tx = L.rx + (q[0] - far + wob) * len, ty = L.ry + (q[1] + far * 0.5) * len;
    RIG.ik2(L.rx, L.ry, lerp(L.fx, tx, w), lerp(L.fy, ty, w), l1, l2, fore ? -1 : 1, _ik);
    setLeg(L, _ik); L.up = 1;
  }
}
/** 꼬리 사슬 (마디 스프링: 뿌리는 base 를, 나머지는 앞 마디 + 쉴 때 굽힘 × curl 을 따른다) */
function tailSolve(dt, P, T, base, sway, curl) {
  const segs = T.tailSeg, n = segs?.length ?? 0;
  if (!n) return;
  const S = P.s.b;
  if (!S.ta || S.ta.length !== n) {
    S.ta = new Array(n); S.tv = new Array(n).fill(0);
    let a = base;
    for (let k = 0; k < n; k++) { if (k) a += segs[k].rel * curl; S.ta[k] = a; }
  }
  for (let k = 0; k < n; k++) {
    const want = (k === 0 ? base : S.ta[k - 1] + segs[k].rel * curl) + sway * (0.35 + k * 0.3);
    if (dt > 0) { const kk = 170 - k * 16, cc = 17 - k; S.tv[k] += ((want - S.ta[k]) * kk - S.tv[k] * cc) * dt; S.ta[k] += S.tv[k] * dt; }
    else { S.ta[k] = want; S.tv[k] = 0; }
    if (!Number.isFinite(S.ta[k])) { S.ta[k] = want; S.tv[k] = 0; }
    P.ta[k] = S.ta[k];
  }
  P.tl = segs[0].len;
}

// ───────────────────────── 날개 ─────────────────────────
/** 한 번 치기 파형 (u = 위상): 1 (위) → −1 (아래, 내려치기 비율 down) → 1 */
function stroke(u, down) {
  u -= Math.floor(u);
  return u < down ? Math.cos(PI * u / down) : -Math.cos(PI * (u - down) / (1 - down));
}
const WS = { e: 1, eh: 1, fold: 1, sweep: 0, cyc: 0, per: 0.4, down: 0.45, amp: 1, bias: 0, phase: null };
/** 애니메이션 → 날개 목표 (정적 들림·접힘·젖힘 + 날갯짓 주기) */
function wingState(m, a, at, t, onG, T) {
  const W = T.wing, o = WS, bat = T.name === 'bat';
  o.e = 1; o.eh = 1; o.fold = 1; o.sweep = 0; o.cyc = 0; o.per = W.period; o.down = W.down; o.amp = 1; o.bias = 0; o.phase = null;
  if (a === 'summon' || a === 'dismiss') { o.fold = 0.1; o.cyc = 1; o.amp = 0.8; o.bias = 0.15; o.per = W.period * 1.3; return o; }
  if (a === 'swim') { o.e = 0.14; o.eh = 0.06; o.fold = 0.2; return o; }
  if (a === 'knocked') { o.fold = 0.3; o.cyc = 1; o.per = W.period * 0.6; o.amp = 0.45; o.bias = 0.35; return o; }
  if (onG) {
    if (a === 'charge') { o.fold = 0.05; o.e = 0.5; o.eh = 0.3; o.sweep = 0.4; return o; }   // 날개를 펴고 돌진
    if (a === 'rear' || a === 'special') { o.fold = 0.1; return o; }
    if (a === 'breath') { o.fold = 0.25; o.e = 0.9; o.eh = 0.8; return o; }
    if (a === 'screech') { o.fold = 0.05; o.e = 0.8; o.eh = 0.65; return o; }
    if (a === 'land') { const k = Math.max(0, 1 - at / 0.3); o.fold = 1 - 0.85 * k; return o; }
    if (a === 'hurt') { o.fold = 0.5; o.e = 0.85; return o; }
    if (RUN.has(a) && !bat) { o.fold = 0.72; o.e = 0.9 + Math.sin(t * 9) * 0.06; return o; }
    return o;
  }
  o.fold = 0;
  if (a === 'glide') { o.e = W.glide[0] + Math.sin(t * 2.3) * 0.04; o.eh = W.glide[1] + Math.sin(t * 2.3 - 0.6) * 0.05; return o; }
  if (a === 'dive') {
    if (T.name === 'griffin' && at < 0.1) { o.e = 1; o.eh = 1; return o; }   // 뇌명 급강하 멈칫: 날개를 치켜들어 번개를 모은다
    o.sweep = 1; return o;
  }
  if (a === 'charge') { o.sweep = 0.85; return o; }
  if (a === 'flap' || a === 'takeoff') { o.cyc = 1; if (!bat) o.phase = at / W.period; return o; }
  if (a === 'hover' || (bat && a === 'fall')) { const H = W.hover; o.cyc = 1; o.per = H.per; o.amp = H.amp; o.bias = H.bias; return o; }
  if (a === 'jump') {
    if (bat) { o.cyc = 1; return o; }
    if (at < W.period) { o.cyc = 1; o.phase = at / W.period; return o; }   // 도약: 한 번 힘껏 내려친다
    o.e = 0.85; o.eh = 0.75; return o;
  }
  if (a === 'fall') { o.e = 0.72 + Math.sin(t * 7) * 0.05; o.eh = 0.55 + Math.sin(t * 7 - 0.5) * 0.06; return o; }
  if (a === 'breath') { o.cyc = 1; o.per = W.period * 1.6; o.amp = 0.55; o.bias = 0.35; return o; }
  if (a === 'screech') { o.e = 0.85; o.eh = 0.75; return o; }
  if (a === 'hurt') { o.e = 0.3; o.eh = 0.1; o.fold = 0.2; return o; }
  o.e = 0.8; o.eh = 0.7;
  return o;
}
function newWing() { return { rx: 0, ry: 0, wx: 0, wy: 0, tx: 0, ty: 0, e: 1, fold: 1, front: false }; }
function wingVec(o, W, S, st, ph, rx, ry, pitch, sc) {
  let ea = S.we, eh = S.weh;
  if (S.cw > 0.002) {
    ea = lerp(ea, st.bias + st.amp * stroke(ph, st.down), S.cw);
    eh = lerp(eh, st.bias + st.amp * stroke(ph - 0.07, st.down), S.cw);
  }
  // 들림: 세로 성분에 e 를 곱한다 (내려치면 뒤집힌다) + 내려칠 때 손목·끝이 앞으로 (8자 궤적)
  let ax = W.a[0] + W.la * 0.18 * (1 - ea) * 0.5, ay = W.a[1] * ea;
  let hx = W.h[0] * (1 - 0.2 * (1 - eh) * 0.5), hy = W.h[1] * eh;
  const f = S.wf, sw = S.ws;
  if (f > 0.001) { ax = lerp(ax, W.fold.a[0], f); ay = lerp(ay, W.fold.a[1], f); hx = lerp(hx, W.fold.h[0], f); hy = lerp(hy, W.fold.h[1], f); }
  if (sw > 0.001) { ax = lerp(ax, W.sweep.a[0], sw); ay = lerp(ay, W.sweep.a[1], sw); hx = lerp(hx, W.sweep.h[0], sw); hy = lerp(hy, W.sweep.h[1], sw); }
  ax *= sc; ay *= sc; hx *= sc; hy *= sc;
  const c = Math.cos(pitch), s = Math.sin(pitch);
  o.rx = rx; o.ry = ry;
  o.wx = rx + c * ax - s * ay; o.wy = ry + s * ax + c * ay;
  o.tx = o.wx + c * hx - s * hy; o.ty = o.wy + s * hx + c * hy;
  o.e = ea; o.fold = f;
  o.front = f < 0.5 && (o.wy - o.ry) > 3;
  return o;
}
function wingSolve(dt, P, T, st, rx, ry, frx, fry) {
  const W = T.wing, S = P.s.b;
  if (S.we == null) { S.we = st.e; S.weh = st.eh; S.wf = st.fold; S.ws = st.sweep; S.cw = st.cyc; }
  const k = ease(12, dt);
  S.we += (st.e - S.we) * k; S.weh += (st.eh - S.weh) * k; S.wf += (st.fold - S.wf) * ease(st.fold < S.wf ? 16 : 9, dt);
  S.ws += (st.sweep - S.ws) * ease(st.sweep > S.ws ? 22 : 10, dt); S.cw += (st.cyc - S.cw) * ease(14, dt);
  if (dt > 0) S.wph = (S.wph + dt / Math.max(0.05, st.per)) % 1;
  const ph = st.phase ?? S.wph;
  P.wing = wingVec(P.wing ?? newWing(), W, S, st, ph, rx, ry, P.pitch, 1);
  P.fwing = wingVec(P.fwing ?? newWing(), W, S, st, ph - 0.04, frx, fry, P.pitch, W.farK);
}

// ───────────────────────── 포즈: 늑대 ─────────────────────────
function wolfPose(m, dt, P, T) {
  RIG.quadPose(m, dt, P, quadT(T));
  const S = bs(P);
  const a = m.anim ?? 'idle', at = fin(m.animT, 0), t = fin(m.t, 0), vy = fin(m.vy, 0);
  const onG = m.onGround !== false && !AIR.has(a);
  let dpT = 0, hdT = 0, lift = 0;
  if (a === 'charge' && onG) {
    // 송곳니 돌진 = 덮치기: 앞발을 앞으로 쭉 뻗고 뒷발로 박찬다, 몸이 떠오른다 (0.26초)
    const ext = smooth(clamp(at / 0.07, 0, 1)) * (1 - smooth(clamp((at - 0.2) / 0.08, 0, 1)));
    for (let i = 0; i < 4; i++) {
      const fore = i === 1 || i === 3, L = P.legs[i], l1 = fore ? T.l1f : T.l1h, l2 = fore ? T.l2f : T.l2h, len = l1 + l2;
      const ang = fore ? 0.62 + (i === 1 ? 0.14 : 0) : PI - 0.62 - (i === 0 ? 0.12 : 0), r = len * 0.96;
      RIG.ik2(L.rx, L.ry, lerp(L.fx, L.rx + Math.cos(ang) * r, ext), lerp(L.fy, L.ry + Math.sin(ang) * r - 4 * ext, ext), l1, l2, fore ? -1 : 1, _ik);
      setLeg(L, _ik); L.up = Math.max(L.up, ext);
    }
    lift = -6 * ext; hdT = -0.3 * ext;                                   // 엔진의 돌진 목 숙임(+0.42)을 줄인다: 채색 목덜미가 드러나지 않게
    P.jaw = at < 0.16 ? 0.85 * smooth(clamp(at / 0.06, 0, 1)) : 0.85 * Math.max(0, 1 - (at - 0.16) / 0.05);   // 물고 → 탁 닫는다
  } else if (a === 'wall') {
    const k = Math.max(0, 1 - at / 0.25);
    airLegs(P, T, 'tuck', 'trail', t, 1);
    dpT = -0.42 * k; hdT = -0.15 * k;
  } else if (!onG) {
    dpT = vy < 0 ? -0.14 : 0.1;
    airLegs(P, T, vy < 0 ? 'tuck' : 'strike', vy < 0 ? 'trail' : 'tuck', t, 0.8);
  }
  if (a === 'hurt') P.jaw = Math.max(P.jaw, 0.4 * P.hurt);
  S.dp += (dpT - S.dp) * ease(onG ? 22 : 12, dt);
  S.hd += (hdT - S.hd) * ease(14, dt);
  S.lift += (lift - S.lift) * ease(30, dt);
  if (Math.abs(S.dp) > 0.002) {
    rigidRot(P, P.sl.x, P.sl.y, S.dp);
    if (onG) { let mx = 0; for (const L of P.legs) mx = Math.max(mx, L.fy); if (mx > 0) shift(P, 0, -mx); }
  }
  shift(P, 0, S.lift);
  headAdj(P, T, S.hd);
  // 꼬리: 질주 = 뒤로 흩날림, 포효 = 치켜듦, 벽 차기 = 균형
  const gait = P.gait;
  let base = T.tailSeg[0].rel + P.pitch;
  if (gait === 'gallop') base += T.tailRun + (a === 'charge' ? 0.2 : 0);
  else if (gait === 'trot') base += 0.35; else if (gait === 'walk') base += 0.12;
  else if (gait === 'air') base += vy < 0 ? 0.6 : 0.9;
  else if (gait === 'swim') base += 0.9;
  if (a === 'howl') base += 0.45 * P.howl;
  if (a === 'hurt') base += 0.4 * P.hurt;
  const sway = gait === 'stand' ? Math.sin(t * 1.6 + S.seed) * 0.12 : Math.sin(t * (gait === 'gallop' ? 9 : 5)) * 0.08;
  tailSolve(dt, P, T, base, sway, gait === 'gallop' ? 0.4 : 1);
  finishSeat(P, m);
  return P;
}

// ───────────────────────── 포즈: 날개 달린 네발 (비룡 · 그리핀) ─────────────────────────
function flyQuadPose(m, dt, P, T) {
  RIG.quadPose(m, dt, P, quadT(T));
  const S = bs(P);
  const a = m.anim ?? 'idle', at = fin(m.animT, 0), t = fin(m.t, 0), vy = fin(m.vy, 0);
  const onG = m.onGround !== false && !AIR.has(a);
  const gri = T.name === 'griffin';
  let dpT = 0, hdT = 0, fm = null, hm = null;
  if (!onG) {
    if (a === 'glide') { dpT = 0.05; hdT = 0.1; fm = 'trail'; hm = 'trail'; }
    else if (a === 'dive') {
      if (gri && at < 0.08) { dpT = -0.28; fm = 'tuck'; hm = 'push'; }                      // 멈칫
      else { dpT = velPitch(m, T.diveA, 0.3, 1.25); hdT = 0.22; fm = 'strike'; hm = 'trail'; }
    } else if (a === 'charge') { dpT = velPitch(m, 0, -1.0, 1.1); hdT = 0.15; fm = 'strike'; hm = 'trail'; }
    else if (a === 'flap' || a === 'takeoff') { dpT = -0.1; fm = 'tuck'; hm = 'trail'; }
    else if (a === 'jump') { dpT = vy < 0 ? -0.22 : 0.02; fm = 'tuck'; hm = vy < 0 ? 'push' : 'trail'; }
    else if (a === 'fall') { dpT = 0.12; fm = 'tuck'; hm = 'trail'; }
    else if (a === 'hover') { dpT = 0; fm = 'tuck'; hm = 'trail'; }
    else if (a === 'breath') { dpT = -0.05; fm = 'tuck'; hm = 'trail'; }
    else if (a === 'hurt') { dpT = -0.14; }
    else if (a === 'swim') { dpT = 0; }
    else { dpT = 0.04; fm = 'tuck'; hm = 'trail'; }
  } else if (a === 'charge') { hdT = 0.2; }
  if (a === 'breath') hdT = -0.1;
  if (fm || hm) airLegs(P, T, fm, hm, t, 1);
  if (a === 'charge' && !gri) P.jaw = Math.max(P.jaw, 0.45);
  if (a === 'hurt') P.jaw = Math.max(P.jaw, 0.4 * P.hurt);
  const fast = a === 'dive' || a === 'charge';
  S.dp += (dpT - S.dp) * ease(onG ? 22 : fast ? 16 : 9, dt);
  S.hd += (hdT - S.hd) * ease(12, dt);
  if (Math.abs(S.dp) > 0.002) {
    rigidRot(P, P.sl.x, P.sl.y, S.dp);
    if (onG) { let mx = 0; for (const L of P.legs) mx = Math.max(mx, L.fy); if (mx > 0) shift(P, 0, -mx); }
  }
  headAdj(P, T, S.hd);
  // 꼬리: 비행 = 뒤로 곧게 흩날림 (말린 끝이 풀린다)
  const gait = P.gait, flying = !onG && a !== 'swim';
  let base = T.tailSeg[0].rel + P.pitch;
  if (flying) base += T.tailFly + (a === 'dive' || a === 'charge' ? 0.15 : 0);
  else if (gait === 'gallop') base += T.tailRun;
  else if (gait === 'trot') base += 0.2; else if (gait === 'walk') base += 0.08;
  else if (gait === 'swim') base += 0.4;
  if (a === 'hurt') base += 0.3 * P.hurt;
  const sway = gait === 'stand' ? Math.sin(t * 1.3 + S.seed) * 0.1 : Math.sin(t * (flying ? 4 : gait === 'gallop' ? 8 : 4.5) + S.seed) * (flying ? 0.07 : 0.09);
  tailSolve(dt, P, T, base, sway, flying ? 0.45 : gait === 'gallop' ? 0.6 : 1);
  // 날개
  const st = wingState(m, a, at, t, onG, T), W = T.wing;
  const r0 = qBody(P, T, W.x, W.y, _p0), r1 = qBody(P, T, W.x + W.far[0], W.y + W.far[1], _p1);
  wingSolve(dt, P, T, st, r0[0], r0[1], r1[0], r1[1]);
  finishSeat(P, m);
  return P;
}
const _p0 = [0, 0], _p1 = [0, 0];

// ───────────────────────── 포즈: 박쥐 ─────────────────────────
function batPose(m, dt, P, T) {
  const S = bs(P);
  const a = m.anim ?? 'idle', at = fin(m.animT, 0), t = fin(m.t, 0), vx = fin(m.vx, 0);
  const swim = a === 'swim' || (!!m.inWater && m.onGround === false);
  const inAir = !swim && (m.onGround === false || AIR.has(a) || a === 'summon' || a === 'dismiss');
  const ground = !inAir && !swim;
  const speedK = clamp(fin(m.speedK ?? Math.abs(vx) / 400, 0), 0, 1.6);
  const moving = ground && (RUN.has(a) || a === 'walk' || (a === 'turn' && speedK > 0.05));
  const run = moving && (RUN.has(a) || speedK > 0.6);
  P.t = t;
  P.gait = swim ? 'swim' : a === 'knocked' ? 'knocked' : !ground ? 'air' : run ? 'gallop' : moving ? 'walk' : 'stand';
  const ph = fin(m.phase, 0), cyc = ph * TAU;
  let bobT = 0, pitchT = 0, headT = 0, jaw = 0, legT = 0, gw = 0;
  if (ground) {
    // 손목을 딛고 긴다: 몸을 낮추고, 걸음마다 폴짝 (앞: 손목, 뒤: 뒷발)
    gw = 1;
    bobT = T.crawlSink + Math.sin(t * 2.1 + S.seed) * 0.6;
    pitchT = 0.08; headT = 0.14 + Math.sin(t * 0.7 + S.seed) * 0.05;
    if (moving) { bobT -= Math.abs(Math.sin(cyc)) * (run ? 7 : 3.5); pitchT += Math.sin(cyc) * 0.05; headT = 0.1 + Math.sin(cyc) * 0.04; }
    if (a === 'screech') { headT = -0.05; jaw = 1; pitchT = 0; }
    if (a === 'hurt') { headT = -0.25; jaw = 0.5; pitchT = -0.04; }
    if (a === 'land') bobT += 3 * Math.max(0, 1 - at / 0.2);
    if (a === 'idle') { const u = (t + S.seed) % 5.3; if (u < 0.5) jaw = Math.sin(u / 0.5 * PI) * 0.45; }   // 쉿 (이빨을 드러낸다)
  } else if (swim) {
    bobT = 8 + Math.sin(t * 3) * 1.2; pitchT = -0.05; headT = -0.1;
  } else {
    const hov = a === 'hover' || a === 'fall';
    bobT = -Math.sin(S.wph * TAU) * (hov ? 1.2 : 2.2);                           // 내려칠 때 몸이 떠오른다
    pitchT = a === 'flap' || a === 'jump' || a === 'takeoff' ? -0.12 : a === 'fall' ? 0.06 : a === 'glide' ? 0.04 : 0;
    legT = 0.3 + Math.sin(t * 3.1 + S.seed) * 0.12;
    if (a === 'dive') { pitchT = velPitch(m, 0.6, 0.3, 1.1); legT = 0.9; headT = 0.12; }
    if (a === 'charge') { pitchT = velPitch(m, 0, -1.0, 1.1); legT = 0.9; headT = 0.12; jaw = 0.9; }   // 흡혈 급습: 입을 벌리고
    if (a === 'screech') { headT = -0.05; jaw = 1; pitchT = -0.08; }
    if (a === 'hurt') { headT = -0.25; jaw = 0.5; pitchT = -0.2; }
    if (a === 'knocked') pitchT = 0.2 + Math.sin(t * 20) * 0.1;
  }
  if (a === 'turn') headT -= 0.15;
  const k1 = ease(12, dt), k2 = ease(9, dt);
  if (S.we == null) { S.bb = bobT; S.pt = pitchT; S.hd = headT; S.lg = legT; S.gw = gw; S.jw = jaw; }
  S.bb += (bobT - S.bb) * k1;
  S.pt += (pitchT - S.pt) * ease(a === 'dive' || a === 'charge' ? 18 : 10, dt);
  S.hd += (headT - S.hd) * k2; S.lg += (legT - S.lg) * k2; S.gw += (gw - S.gw) * ease(10, dt); S.jw += (jaw - S.jw) * ease(22, dt);
  const pitch = S.pt;
  P.pitch = pitch; P.ba = pitch; P.bob = S.bb; P.px = T.seat[0]; P.stretch = 1; P.sq = 0;
  P.turnK = a === 'turn' ? clamp(at / 0.18, 0, 1) : 1;
  // 몸: 안장점을 축으로 기운다 (기수가 흔들리지 않게)
  const c = Math.cos(pitch), s = Math.sin(pitch), sx = T.seat[0], sy = T.seat[1], oy = sy + S.bb;
  const BX = (x, y) => sx + c * (x - sx) - s * (y - sy), BY = (x, y) => oy + s * (x - sx) + c * (y - sy);
  P.bx = BX(T.bc[0], T.bc[1]); P.by = BY(T.bc[0], T.bc[1]);
  P.sl.x = sx; P.sl.y = oy;
  const N = T.neck;
  P.nx = BX(N.x, N.y); P.ny = BY(N.x, N.y);
  P.na = N.a + pitch + S.hd; P.ha = T.head.a + pitch + S.hd;
  P.hx = P.nx + Math.cos(P.na) * N.len; P.hy = P.ny + Math.sin(P.na) * N.len;
  P.jaw = S.jw;
  { const b = (t + S.seed * 0.3) % 3.4; P.blink = b < 0.12 ? Math.sin(b / 0.12 * PI) : 0; }
  P.ear = a === 'hurt' || a === 'charge' ? 1 : 0; P.look = 0; P.snort = 0; P.howl = 0; P.paw = 0; P.dig = 0; P.mane = 0; P.fire = 0;
  P.charge = a === 'charge' ? 1 : 0; P.hurt = a === 'hurt' ? Math.max(0, 1 - at / 0.25) : 0;
  P.tx = BX(T.tail.x, T.tail.y); P.ty = BY(T.tail.x, T.tail.y);
  // 뒷다리 (한 마디): 땅에서는 발이 바닥에 닿는 각도, 날 때는 뒤로 늘어진다
  const LG = T.leg, lrest = Math.atan2(LG.b[1] - LG.a[1], LG.b[0] - LG.a[0]), llen = Math.hypot(LG.b[0] - LG.a[0], LG.b[1] - LG.a[1]);
  for (const i of [0, 2]) {
    const far = i === 0, L = P.legs[i];
    const qx = LG.a[0] + (far ? T.far[0] : 0), qy = LG.a[1] + (far ? T.far[1] : 0);
    L.rx = BX(qx, qy); L.ry = BY(qx, qy);
    let ang = lrest + S.lg + pitch + (far ? 0.1 : 0);
    if (moving) ang += Math.sin(cyc + (far ? PI : 0)) * 0.14;
    if (S.gw > 0.01) {
      const need = -L.ry / llen;
      if (need < 0.999) ang = lerp(ang, PI - Math.asin(clamp(need, -0.999, 0.999)) + (far ? 0.06 : 0), S.gw);
    }
    L.fx = L.rx + Math.cos(ang) * llen; L.fy = L.ry + Math.sin(ang) * llen;
    L.kx = (L.rx + L.fx) / 2; L.ky = (L.ry + L.fy) / 2; L.a1 = ang; L.a2 = ang; L.up = ground ? 0 : 1;
  }
  // 날개 (+ 땅: 손목이 바닥을 짚는다)
  const W = T.wing, st = wingState(m, a, at, t, ground, T);
  wingSolve(dt, P, T, st, BX(W.x, W.y), BY(W.x, W.y), BX(W.x + W.far[0], W.y + W.far[1]), BY(W.x + W.far[0], W.y + W.far[1]));
  for (const [w, i, far] of [[P.wing, 3, false], [P.fwing, 1, true]]) {
    if (S.gw > 0.01) {
      const step = moving ? Math.sin(cyc + (far ? PI : 0)) : 0;
      const gx = w.rx + W.gx + (far ? 6 : 0) + step * (run ? 11 : 6), gy = -Math.max(0, step) * (run ? 6 : 3);
      const dx = (gx - w.wx) * S.gw, dy = (gy - w.wy) * S.gw;
      w.wx += dx; w.wy += dy; w.tx += dx * 0.6; w.ty += dy * 0.6;
    }
    const L = P.legs[i];
    L.rx = w.rx; L.ry = w.ry; L.kx = L.fx = w.wx; L.ky = L.fy = w.wy; L.a1 = L.a2 = Math.atan2(w.wy - w.ry, w.wx - w.rx); L.up = ground ? 0 : 1;
  }
  finishSeat(P, m);
  return P;
}

// ───────────────────────── 템플릿 등록 ─────────────────────────
// 게임 px 지역 좌표 (원점 = 발 중앙, 오른쪽을 본다). tools/painted/companions/mt_direwolf/mounts_b_build.py tune 의 출력.
RIG.registerTemplate('wolf', {
  kind: 'quad', pose: wolfPose,
  body: { x: 1.4, y: -32.3, rx: 29, ry: 11.2 },
  sh: [10.95, -24.65], hp: [-17.81, -22.94], far: [5, -1.5],
  l1f: 16.23, l2f: 8.61, l1h: 11.42, l2h: 12.79, footF: 2.67, footH: -3.05, sink: 1.0,
  neck: { x: 19.34, y: -39.7, a: -1.066, len: 18.42 }, head: { a: 0.78, len: 15.71 },
  tail: { x: -19.91, y: -35.13, n: 6, len: 5.74, a: 2.054 },
  tailSeg: tailT(tailLine(-19.91, -35.13, 2.054, 6, 5.74)), tailRun: 0.72, tailFly: 0.6,
  seat: [-2, -44.08],
  gallop: 'bound', lift: [7, 15], bob: [1.2, 2.6, 4.4], pump: 0.1, stretch: 0.06,
  duty: { walk: 0.62, trot: 0.5, gallop: 0.32 },
  jawMax: 0.5,
});
RIG.registerTemplate('wyvern', {
  kind: 'quad', pose: flyQuadPose,
  body: { x: 2.7, y: -46.2, rx: 38, ry: 20.4 },
  sh: [18.59, -34.72], hp: [-30.83, -36.77], far: [6, -2],
  l1f: 18.43, l2f: 18.13, l1h: 22.87, l2h: 17.83, footF: 11.03, footH: -9.4, sink: 1.4,
  neck: { x: 25.95, y: -54.33, a: -1.352, len: 30.13 }, head: { a: 0.58, len: 22.67 },
  tail: { x: -32.06, y: -42.08, n: 3, len: 37.7, a: 2.834 },
  tailSeg: tailT([[-32.06, -42.08], [-68.01, -30.64], [-103.96, -29.82], [-115.39, -90.28]]), tailParts: ['tail0', 'tail1', 'tail2'],
  tailRun: 0.14, tailFly: 0.18,
  seat: [-10, -58.01],
  gallop: 'rotary', lift: [8, 14], bob: [1.4, 2.8, 4], pump: 0.08, stretch: 0.03,
  duty: { walk: 0.64, trot: 0.5, gallop: 0.38 },
  wing: wingT([-7.55, -65.77], [7.97, -107.44], [-91.7, -128.68], {
    fold: [-0.15, -0.3, -0.47, 0.14], sweep: [-0.42, -0.62, -0.93, 0.06], far: [7, -3], period: 0.4, down: 0.45, glide: [0.5, 0.28], fingers: 3,
  }),
  jawMax: 0.5, diveA: 0.87,
});
RIG.registerTemplate('griffin', {
  kind: 'quad', pose: flyQuadPose,
  body: { x: -6, y: -41.5, rx: 37.6, ry: 14.6 },
  sh: [0.28, -31.71], hp: [-33.18, -28.93], far: [5, -2],
  l1f: 16.97, l2f: 16.89, l1h: 14.59, l2h: 16.72, footF: 11.85, footH: -5.92, sink: 1.2,
  neck: { x: 20.49, y: -40.77, a: -1.504, len: 20.96 }, head: { a: 0.736, len: 19.73 },
  tail: { x: -39.45, y: -42.17, n: 2, len: 18.96, a: 2.842 },
  tailSeg: tailT([[-39.45, -42.17], [-57.57, -36.59], [-55.48, -60.99]]), tailParts: ['tail0', 'tail1'],
  tailRun: 0.3, tailFly: 0.25,
  seat: [-5.99, -54.02],
  gallop: 'bound', lift: [8, 16], bob: [1.3, 2.8, 4.6], pump: 0.09, stretch: 0.05,
  duty: { walk: 0.62, trot: 0.5, gallop: 0.34 },
  wing: wingT([-0.77, -54.02], [-10.18, -86.08], [-76.39, -116.05], {
    fold: [-0.25, -0.4, -0.62, 0.18], sweep: [-0.45, -0.6, -0.95, 0.04], far: [6, -3], period: 0.42, down: 0.45, glide: [0.55, 0.3], feather: true,
  }),
  jawMax: 0.4, diveA: 1.2,
});
RIG.registerTemplate('bat', {
  kind: 'bat', pose: batPose,
  body: { x: 3.8, y: -37.2, rx: 44, ry: 17 }, bc: [-6.57, -34.56],
  sh: [-1.81, -53.57], hp: [-33.35, -22.29], far: [5, -2],
  neck: { x: 28.86, y: -38.88, a: -1.374, len: 17.62 }, head: { a: 0.6, len: 29.84 },
  tail: { x: -40, y: -36, n: 0, len: 0, a: 2.9 }, tailSeg: [],
  leg: { a: [-33.35, -22.29], b: [-53.22, -2.16] },
  seat: [-3.97, -52.27],
  wing: wingT([-1.81, -53.57], [1.21, -101.09], [-93.83, -128.74], {
    fold: [0.35, 0.85, -0.5, -0.4], sweep: [-0.35, -0.62, -0.95, -0.02], far: [6, -3], period: 0.28, down: 0.5, glide: [0.45, 0.25],
    hover: { per: 0.2, amp: 0.45, bias: 0.4 }, gx: 20, fingers: 4,
  }),
  crawlSink: 9, jawMax: 0.6,
});

// ───────────────────────── 품질 · 채색 리그 ─────────────────────────
function qTier(world) {
  const q = world?.fx?.quality;
  if (Number.isFinite(q)) return q >= 0.95 ? 2 : q >= 0.6 ? 1 : 0;
  const t = game?.quality ?? game?.settings?.quality;
  return t === 'low' ? 0 : t === 'medium' ? 1 : 2;
}
function paintedRig(id) {
  try {
    if (!id || !REG.hasPainted?.(id)) return null;
    if (!REG.paintedEnabled?.(game)) return null;
    const st = REG.paintedState(id);
    if (st === 'ready') return REG.paintedRig(id);
    if (st === 'idle') REG.preloadPainted(id, game);
  } catch { /* 채색 실패 → 벡터 */ }
  return null;
}

// ───────────────────────── 디스패처 ─────────────────────────
const O0 = { alpha: 1, tint: null, scale: 1, noFx: false, flash: false, rider: null };
const RIDERLESS = new Set(['summon', 'dismiss', 'knocked', 'ult', 'fade']);
const S0 = { m: null, P: null, T: null, pal: null, tint: null, flash: false, fx: true, q: 2, t: 0, aw: false, world: null, f: 1, ridden: true, rig: null, id: '' };
function drawB(ctx, m, world, layer = 'back', opts = O0) {
  if (!m) return;
  const P = m.pose;
  if (!P) throw new Error('mount pose missing');
  const T = RIG.templateFor(m);
  if (!T || P.tpl !== T.name) throw new Error('mount pose/template mismatch');
  const o = opts ?? O0;
  const alpha = clamp((o.alpha ?? 1) * (m.alpha ?? 1), 0, 1);
  if (alpha <= 0.01) return;
  const sc = (o.scale ?? 1) * (m.scale ?? 1);
  const f = (m.facing ?? 1) < 0 ? -1 : 1;
  const turn = P.turnK < 1 ? 0.45 + 0.55 * P.turnK : 1;
  const C = S0;
  ctx.save();
  try {
    if (alpha < 1) ctx.globalAlpha *= alpha;
    ctx.translate(fin(m.cx, 0), fin(m.bottom, 0));
    ctx.scale(f * sc * turn, sc);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const tint = o.tint ?? null;
    C.m = m; C.P = P; C.T = T; C.id = m.id; C.pal = palOf(m.id); C.tint = tint; C.flash = !tint && (o.flash || (m.flashT ?? 0) > 0);
    C.fx = !o.noFx && !tint; C.q = qTier(world); C.t = world?.time ?? m.t ?? 0; C.aw = !!m.awakened; C.world = world; C.f = f; C.rig = null;
    C.ridden = o.rider != null ? o.rider !== false : !RIDERLESS.has(m.state);
    const rig = paintedRig(m.id);
    if (rig && rig.mount && rig.parts?.body && rig.parts?.head) painted(ctx, C, layer, rig);
    else if (layer === 'front') vecFront(ctx, C);
    else vecBack(ctx, C);
  } finally {
    PD.unwind(ctx); LB = false;
    ctx.restore();
    C.m = null; C.P = null; C.world = null; C.rig = null;
  }
}
export const MOUNT_DRAW_B = { mt_direwolf: drawB, mt_wyvern: drawB, mt_giantbat: drawB, mt_gale: drawB };

// ───────────────────────── 공용 그리기 도우미 ─────────────────────────
const LIGHT = new Map();
function col(C, c) {
  if (C.tint) return C.tint;
  if (C.flash && typeof c === 'string' && c[0] === '#') { let v = LIGHT.get(c); if (!v) { v = shade(c, 0.62); LIGHT.set(c, v); } return v; }
  return c;
}
const DEEP = new Map();
function deep(c) { if (typeof c !== 'string' || c[0] !== '#') return c; let v = DEEP.get(c); if (!v) { v = shade(c, -0.4); DEEP.set(c, v); } return v; }
let LB = false;
function glow(ctx, x, y, r, color, a) {
  if (a <= 0.01 || r < 0.5 || !Number.isFinite(x) || !Number.isFinite(y)) return;
  if (LB) { const g0 = ctx.globalAlpha; ctx.globalAlpha = g0 * Math.min(1, a); ctx.drawImage(puff(color, true), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = g0; return; }
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(puff(color, true), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
const flick = (t, s) => 0.5 + 0.5 * Math.sin(t * 13 + s * 7.1) * Math.sin(t * 7.3 + s * 3.3);
function limb(ctx, x0, y0, x1, y1, w0, w1, bulge = 0) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, a = Math.atan2(dy, dx);
  const h0 = w0 / 2, h1 = w1 / 2, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * h0, y0 + ny * h0);
  ctx.quadraticCurveTo(mx + nx * ((h0 + h1) / 2 + bulge), my + ny * ((h0 + h1) / 2 + bulge), x1 + nx * h1, y1 + ny * h1);
  ctx.arc(x1, y1, h1, a + PI / 2, a - PI / 2, true);
  ctx.quadraticCurveTo(mx - nx * ((h0 + h1) / 2 + bulge * 0.4), my - ny * ((h0 + h1) / 2 + bulge * 0.4), x0 - nx * h0, y0 - ny * h0);
  ctx.arc(x0, y0, h0, a - PI / 2, a + PI / 2, true);
  ctx.closePath();
}
const GRAD = new Map();
function grad(ctx, key, make) { let g = GRAD.get(key); if (!g) { g = make(ctx); GRAD.set(key, g); } return g; }
/** 꼬리 관절 점 (지역) → TP[0..n] */
const TP = new Float32Array(32);
function tailPts(C) {
  const { P, T } = C, n = Math.min(P.ta.length, T.tailSeg.length, 15);
  let x = P.tx, y = P.ty;
  TP[0] = x; TP[1] = y;
  for (let k = 0; k < n; k++) { x += Math.cos(P.ta[k]) * T.tailSeg[k].len; y += Math.sin(P.ta[k]) * T.tailSeg[k].len; TP[k * 2 + 2] = x; TP[k * 2 + 3] = y; }
  return n;
}
/** 머리 지역 점 (벡터): (hx,hy) 에서 머리 각도 ha 방향으로 u, 수직 v */
function hp(C, u, v, out) { const P = C.P, c = Math.cos(P.ha), s = Math.sin(P.ha); out[0] = P.hx + c * u - s * v; out[1] = P.hy + s * u + c * v; return out; }

// ───────────────────────── 벡터: back 층 ─────────────────────────
function vecBack(ctx, C) {
  const { P, T, m } = C, bat = T.name === 'bat';
  if (!C.tint && m.onGround !== false) {
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.32; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(-2, 0, (bat ? 34 : T.body.rx + 8), 4, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = ga;
  }
  if (P.fwing) vWing(ctx, C, P.fwing, true);
  if (bat) {
    vBatLeg(ctx, C, P.legs[0], true);
    vBatBody(ctx, C);
    if (P.wing && !P.wing.front) vWing(ctx, C, P.wing, false);
    vBatLeg(ctx, C, P.legs[2], false);
    vBatHead(ctx, C);
  } else {
    vTail(ctx, C);
    vLeg(ctx, C, 0, true); vLeg(ctx, C, 1, true);
    vBody(ctx, C);
    if (P.wing && !P.wing.front) vWing(ctx, C, P.wing, false);
    vNeck(ctx, C); vHead(ctx, C);
    vLeg(ctx, C, 2, false); vLeg(ctx, C, 3, false);
  }
  tackBack(ctx, C, null);
  if (C.fx) { const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter'; LB = true; try { fxB(ctx, C, vecAnchors(C)); } finally { LB = false; ctx.globalCompositeOperation = op; } }
}
function vecFront(ctx, C) {
  const P = C.P;
  if (P.wing && P.wing.front) vWing(ctx, C, P.wing, false);
  frontTack(ctx, C, null);
}

// ── 다리 ──
function vLeg(ctx, C, i, far) {
  const { P, T, pal } = C, L = P.legs[i], fore = i === 1 || i === 3;
  const wolf = T.name === 'wolf', gri = T.name === 'griffin', wyv = T.name === 'wyvern';
  const w0 = wolf ? (fore ? 8 : 10) : wyv ? (fore ? 10 : 13) : (fore ? 9 : 11), w1 = wolf ? 5.2 : wyv ? 6.5 : 5.5;
  let c = pal.coat;
  if (gri && fore) c = pal.feather;
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
  ctx.fillStyle = col(C, far ? deep(c) : c);
  limb(ctx, L.rx, L.ry, L.kx, L.ky, w0, w0 * 0.75, fore ? 2 : 3); ctx.fill(); ctx.stroke();
  const lc = gri && fore ? pal.scale : wyv ? pal.dark : c;
  ctx.fillStyle = col(C, far ? deep(lc) : lc);
  limb(ctx, L.kx, L.ky, L.fx, L.fy - 2.5, w0 * 0.62, w1, 0); ctx.fill(); ctx.stroke();
  // 발: 늑대 = 털 발 + 검은 발톱 · 그리핀 앞 = 독수리 발톱 · 뒤 = 사자 발 · 비룡 = 갈고리 발톱
  const fx = L.fx, fy = L.fy;
  ctx.fillStyle = col(C, far ? deep(gri && fore ? pal.scale : wyv ? pal.dark : pal.coat) : (gri && fore ? pal.scale : wyv ? pal.dark : pal.coat));
  ctx.beginPath(); ctx.ellipse(fx + 1.5, fy - 2.4, wolf ? 4.6 : 4.2, 2.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = col(C, pal.claw); ctx.lineWidth = gri && fore || wyv ? 1.4 : 1;
  ctx.beginPath();
  const n = gri && fore ? 3 : wyv ? 3 : 3, cl = gri && fore ? 4.5 : wyv ? 4 : 2.2;
  for (let k = 0; k < n; k++) { const x = fx + 2 + k * 1.8; ctx.moveTo(x, fy - 1.5); ctx.quadraticCurveTo(x + cl * 0.7, fy - 1, x + cl * 0.8, fy + (gri || wyv ? 0.5 : 0)); }
  ctx.stroke();
}
function vBatLeg(ctx, C, L, far) {
  const pal = C.pal;
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.1;
  ctx.fillStyle = col(C, far ? deep(pal.coat) : pal.coat);
  limb(ctx, L.rx, L.ry, L.fx, L.fy, 7, 3.4, 1.5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = col(C, pal.claw); ctx.lineWidth = 1.3;
  const a = L.a1;
  ctx.beginPath();
  for (let k = -1; k <= 1; k++) { const b = a + k * 0.35; ctx.moveTo(L.fx, L.fy); ctx.quadraticCurveTo(L.fx + Math.cos(b) * 4, L.fy + Math.sin(b) * 4, L.fx + Math.cos(b + 0.9) * 5, L.fy + Math.sin(b + 0.9) * 5); }
  ctx.stroke();
}

// ── 몸 ──
function vBody(ctx, C) {
  const { P, T, pal, id } = C, B = T.body, rx = B.rx, ry = B.ry;
  const wolf = T.name === 'wolf', gri = T.name === 'griffin', wyv = T.name === 'wyvern';
  ctx.save();
  try {
    ctx.translate(P.bx, P.by); ctx.rotate(P.ba);
    ctx.beginPath();
    ctx.moveTo(rx + 2, 0);
    ctx.quadraticCurveTo(rx - 1, -ry - 4, rx - 12, -ry - 1);
    ctx.quadraticCurveTo(-2, -ry + 4, -rx + 9, -ry);
    ctx.quadraticCurveTo(-rx - 4, -ry + 2, -rx - 1, 3);
    ctx.quadraticCurveTo(-rx + 3, ry + 1, -rx + 12, ry);
    ctx.quadraticCurveTo(0, ry + (wyv ? 6 : 3), rx - 8, ry);
    ctx.quadraticCurveTo(rx + 4, ry - 2, rx + 2, 0);
    ctx.closePath();
    if (C.tint || C.flash) ctx.fillStyle = col(C, pal.coat);
    else ctx.fillStyle = grad(ctx, id + ':body', (g) => {
      const gr = g.createLinearGradient(0, -ry - 5, 0, ry + 5);
      gr.addColorStop(0, pal.hi); gr.addColorStop(0.4, pal.coat); gr.addColorStop(1, pal.dark);
      return gr;
    });
    ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    if (!C.tint) {
      if (wolf) {
        // 푸른 등 털 · 가슴 갈기 · 털 결
        ctx.fillStyle = col(C, pal.patch); ctx.globalAlpha *= 0.8;
        ctx.beginPath(); ctx.moveTo(rx - 14, -ry + 1); ctx.quadraticCurveTo(-4, -ry + 3, -rx + 8, -ry + 1); ctx.quadraticCurveTo(-4, -ry + 9, rx - 14, -ry + 1); ctx.fill();
        ctx.globalAlpha /= 0.8;
        ctx.fillStyle = col(C, pal.hi); ctx.strokeStyle = OUT; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(rx - 6, -ry + 1); ctx.quadraticCurveTo(rx + 9, 0, rx + 3, ry + 5); ctx.lineTo(rx - 1, ry + 1); ctx.lineTo(rx - 4, ry + 5); ctx.quadraticCurveTo(rx - 10, 2, rx - 6, -ry + 1); ctx.fill(); ctx.stroke();
        if (C.q > 0) { ctx.strokeStyle = col(C, pal.dark); ctx.lineWidth = 0.9; ctx.beginPath(); for (let k = 0; k < 6; k++) { const x = -rx + 8 + k * 7; ctx.moveTo(x, ry - 3); ctx.lineTo(x - 3, ry + 1); } ctx.stroke(); }
      } else if (wyv) {
        // 배 비늘판 · 등 가시
        ctx.fillStyle = col(C, pal.belly);
        ctx.beginPath(); ctx.moveTo(rx + 1, 2); ctx.quadraticCurveTo(0, ry + 9, -rx + 10, ry - 1); ctx.quadraticCurveTo(0, ry - 5, rx + 1, 2); ctx.fill();
        ctx.strokeStyle = col(C, shade(pal.belly, -0.3)); ctx.lineWidth = 0.9; ctx.beginPath();
        for (let k = 0; k < 7; k++) { const x = rx - 6 - k * 8; ctx.moveTo(x, ry - 4 + Math.abs(k - 3) * 0.3); ctx.lineTo(x - 2, ry + 3 - Math.abs(k - 3) * 0.6); }
        ctx.stroke();
        ctx.fillStyle = col(C, pal.horn); ctx.beginPath();
        for (let k = 0; k < 7; k++) { const x = rx - 10 - k * 9, y = -ry - 1 + Math.abs(k - 2) * 0.4; ctx.moveTo(x + 3, y + 1); ctx.lineTo(x - 1, y - 6); ctx.lineTo(x - 3, y + 1.5); }
        ctx.fill();
      } else if (gri) {
        // 앞 절반 = 흰 깃털 (가슴) · 뒤 = 사자 몸
        ctx.fillStyle = col(C, pal.feather);
        ctx.beginPath(); ctx.moveTo(rx + 2, 0); ctx.quadraticCurveTo(rx - 1, -ry - 4, rx - 12, -ry - 1); ctx.quadraticCurveTo(rx - 22, 0, rx - 16, ry); ctx.quadraticCurveTo(rx + 4, ry - 2, rx + 2, 0); ctx.fill();
        if (C.q > 0) { ctx.strokeStyle = col(C, pal.featherDk); ctx.lineWidth = 0.8; ctx.beginPath(); for (let k = 0; k < 5; k++) { const y = -ry + 3 + k * 5; ctx.moveTo(rx - 14 + k, y); ctx.quadraticCurveTo(rx - 10, y + 2, rx - 6 + k * 0.5, y + 1); } ctx.stroke(); }
      }
    }
    // 마구: 안장 천 · 안장 · 배띠 (+ 늑대 가슴 끈 · 박쥐 은 안장)
    tackVec(ctx, C, rx, ry);
  } finally { ctx.restore(); }
}
function tackVec(ctx, C, rx, ry) {
  const { T, pal } = C, B = T.body;
  const sx = T.seat[0] - B.x, sy = T.seat[1] - B.y;
  if (T.name === 'wolf') {
    ctx.strokeStyle = col(C, pal.leather); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx + 8, sy + 1); ctx.lineTo(rx - 2, ry - 2); ctx.moveTo(sx + 2, sy + 2); ctx.lineTo(sx + 1, ry + 1); ctx.stroke();
    if (!C.tint) { ctx.fillStyle = col(C, pal.trim); ctx.beginPath(); ctx.arc(rx - 5, ry - 4, 1.8, 0, TAU); ctx.fill(); }
  }
  // 안장
  ctx.fillStyle = col(C, T.name === 'bat' ? pal.silver : pal.leather); ctx.strokeStyle = OUT; ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(sx - 10, sy + 1); ctx.quadraticCurveTo(sx - 11, sy - 5, sx - 8, sy - 5.5);
  ctx.quadraticCurveTo(sx, sy - 1, sx + 7, sy - 4);
  ctx.quadraticCurveTo(sx + 10, sy - 7, sx + 10.5, sy - 3);
  ctx.lineTo(sx + 9, sy + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (!C.tint) { ctx.strokeStyle = col(C, pal.trim); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(sx - 7, sy - 3.5); ctx.quadraticCurveTo(sx, sy + 0.2, sx + 7, sy - 2.5); ctx.stroke(); }
  if (T.name !== 'bat') {
    ctx.fillStyle = col(C, shade(pal.leather, -0.15));
    ctx.beginPath(); ctx.moveTo(sx - 9, sy + 1); ctx.lineTo(sx + 8, sy + 1); ctx.lineTo(sx + 7, sy + 11); ctx.lineTo(sx - 8, sy + 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.strokeStyle = col(C, T.name === 'bat' ? pal.silver : pal.leather); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx + 3, sy); ctx.lineTo(sx + 2, ry + 1); ctx.stroke();
}
function vBatBody(ctx, C) {
  const { P, T, pal, id } = C, rx = T.body.rx * 0.62, ry = T.body.ry;
  ctx.save();
  try {
    ctx.translate(P.bx, P.by); ctx.rotate(P.ba);
    ctx.beginPath();
    ctx.moveTo(rx + 6, -2);
    ctx.quadraticCurveTo(rx, -ry - 3, 4, -ry - 1);
    ctx.quadraticCurveTo(-rx + 4, -ry + 2, -rx - 4, 2);
    ctx.quadraticCurveTo(-rx + 2, ry + 3, 0, ry + 2);
    ctx.quadraticCurveTo(rx + 2, ry, rx + 6, -2);
    ctx.closePath();
    if (C.tint || C.flash) ctx.fillStyle = col(C, pal.coat);
    else ctx.fillStyle = grad(ctx, id + ':body', (g) => { const gr = g.createLinearGradient(0, -ry, 0, ry); gr.addColorStop(0, pal.hi); gr.addColorStop(0.5, pal.coat); gr.addColorStop(1, pal.dark); return gr; });
    ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    if (!C.tint && C.q > 0) {   // 털 결
      ctx.strokeStyle = col(C, pal.hi); ctx.lineWidth = 0.9; ctx.beginPath();
      for (let k = 0; k < 9; k++) { const x = -rx + 4 + k * (rx * 2 - 6) / 9, y = -ry + 2 + Math.abs(k - 4) * 0.8; ctx.moveTo(x, y); ctx.lineTo(x - 3, y - 2.5); }
      ctx.stroke();
    }
    // 은 안장 · 사슬
    const sx = T.seat[0] - T.bc[0], sy = T.seat[1] - T.bc[1];
    ctx.fillStyle = col(C, pal.silver); ctx.strokeStyle = OUT; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(sx - 9, sy + 2); ctx.quadraticCurveTo(sx - 10, sy - 5, sx - 7, sy - 5); ctx.quadraticCurveTo(sx, sy - 1, sx + 6, sy - 4); ctx.quadraticCurveTo(sx + 10, sy - 9, sx + 10, sy - 2); ctx.lineTo(sx + 8, sy + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (!C.tint) {
      ctx.strokeStyle = col(C, pal.silver); ctx.lineWidth = 1.2; ctx.setLineDash([2, 1.6]);
      ctx.beginPath(); ctx.moveTo(sx + 8, sy + 2); ctx.quadraticCurveTo(sx + 11, ry - 2, sx + 12, ry + 10); ctx.moveTo(sx + 5, sy + 3); ctx.quadraticCurveTo(sx + 8, ry, sx + 7, ry + 6); ctx.stroke();
      ctx.setLineDash([]);
    }
  } finally { ctx.restore(); }
}

// ── 목 · 머리 ──
function vNeck(ctx, C) {
  const { P, T, pal } = C, wolf = T.name === 'wolf', gri = T.name === 'griffin';
  const w0 = wolf ? 17 : gri ? 16 : 14, w1 = wolf ? 12 : gri ? 11 : 9;
  ctx.fillStyle = col(C, gri ? pal.feather : pal.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4;
  limb(ctx, P.nx, P.ny, P.hx, P.hy, w0, w1, 3); ctx.fill(); ctx.stroke();
  if (C.tint) return;
  const nx = Math.sin(P.na), ny = -Math.cos(P.na);
  if (T.name === 'wyvern') {   // 목 가시 · 목 아래 비늘
    ctx.fillStyle = col(C, pal.horn); ctx.beginPath();
    for (let k = 0; k < 5; k++) { const u = 0.1 + k * 0.2, x = lerp(P.nx, P.hx, u) + nx * (lerp(w0, w1, u) / 2), y = lerp(P.ny, P.hy, u) + ny * (lerp(w0, w1, u) / 2); ctx.moveTo(x - ny * 2, y + nx * 2); ctx.lineTo(x + nx * 5 - ny * 2.5, y + ny * 5 + nx * 2.5); ctx.lineTo(x + ny * 2, y - nx * 2); }
    ctx.fill();
    ctx.strokeStyle = col(C, pal.belly); ctx.lineWidth = 2.2; ctx.beginPath();
    ctx.moveTo(P.nx - nx * (w0 / 2 - 2), P.ny - ny * (w0 / 2 - 2)); ctx.lineTo(P.hx - nx * (w1 / 2 - 1.5), P.hy - ny * (w1 / 2 - 1.5)); ctx.stroke();
  } else {   // 털 · 깃털 갈기
    ctx.strokeStyle = col(C, gri ? pal.featherDk : pal.hi); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let k = 0; k < 5; k++) { const u = 0.08 + k * 0.2, x = lerp(P.nx, P.hx, u) + nx * (lerp(w0, w1, u) / 2 - 1), y = lerp(P.ny, P.hy, u) + ny * (lerp(w0, w1, u) / 2 - 1); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 3 - P.mane * 3, y - 1, x - 5 - P.mane * 6, y + 3); }
    ctx.stroke();
  }
}
function vHead(ctx, C) {
  const { P, T, pal } = C, L = T.head.len, jaw = P.jaw ?? 0;
  ctx.save();
  try {
    ctx.translate(P.hx, P.hy); ctx.rotate(P.ha);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
    if (T.name === 'wolf') {
      // 아래턱 (돌려 벌린다)
      ctx.save(); ctx.translate(L * 0.3, 3); ctx.rotate(jaw * 0.5);
      ctx.fillStyle = col(C, pal.dark); ctx.beginPath(); ctx.moveTo(-1, -0.5); ctx.lineTo(L * 0.7, 0); ctx.lineTo(L * 0.66, 2.5); ctx.quadraticCurveTo(L * 0.3, 4, -2, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (jaw > 0.1 && !C.tint) { ctx.fillStyle = '#3a0a10'; ctx.beginPath(); ctx.moveTo(L * 0.3, 2.5); ctx.lineTo(L, 1.2); ctx.lineTo(L * 0.3 + Math.cos(jaw * 0.5) * L * 0.7, 3 + Math.sin(jaw * 0.5) * L * 0.7); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = col(C, pal.coat);
      ctx.beginPath(); ctx.moveTo(-5, -5); ctx.quadraticCurveTo(L * 0.3, -8, L * 0.55, -4); ctx.quadraticCurveTo(L * 0.8, -3, L + 1.5, -1); ctx.lineTo(L + 1, 1.8); ctx.quadraticCurveTo(L * 0.5, 3.4, -3, 5.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col(C, pal.coat); ctx.beginPath(); ctx.moveTo(-1, -5.5); ctx.lineTo(-4 - P.ear * 3, -14 + P.ear * 4); ctx.lineTo(3.5, -6.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!C.tint) {
        ctx.fillStyle = col(C, pal.nose); ctx.beginPath(); ctx.ellipse(L + 0.6, -0.6, 1.7, 1.3, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = col(C, pal.hi); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, 5); ctx.quadraticCurveTo(-6, 9, -9, 8); ctx.moveTo(-1, 5.5); ctx.quadraticCurveTo(-3, 10, -6, 10.5); ctx.stroke();
      }
      eyeV(ctx, C, L * 0.36, -2.6, 1.5);
    } else if (T.name === 'wyvern') {
      // 뿔 (뒤로 휜다)
      ctx.fillStyle = col(C, pal.horn);
      for (const [ox, s] of [[1.5, 0.85], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(ox + 1, -5); ctx.quadraticCurveTo(ox - 8 * s, -12 * s, ox - 16 * s, -10 * s); ctx.quadraticCurveTo(ox - 8 * s, -8 * s, ox - 2, -2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.save(); ctx.translate(L * 0.25, 3); ctx.rotate(jaw * 0.55);
      ctx.fillStyle = col(C, pal.dark); ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(L * 0.78, 0); ctx.lineTo(L * 0.7, 3); ctx.quadraticCurveTo(L * 0.3, 5, -3, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!C.tint) { ctx.fillStyle = '#f4e8d0'; ctx.beginPath(); for (let x = L * 0.2; x < L * 0.72; x += 3) { ctx.moveTo(x, -0.5); ctx.lineTo(x + 1, -2.5); ctx.lineTo(x + 2, -0.5); } ctx.fill(); }
      ctx.restore();
      if (jaw > 0.1 && !C.tint) { ctx.fillStyle = C.fx && C.m.anim === 'breath' ? '#ff9a3a' : '#4a0a0a'; ctx.beginPath(); ctx.moveTo(L * 0.25, 2); ctx.lineTo(L, 1); ctx.lineTo(L * 0.25 + Math.cos(jaw * 0.55) * L * 0.78, 3 + Math.sin(jaw * 0.55) * L * 0.78); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = col(C, pal.coat);
      ctx.beginPath(); ctx.moveTo(-5, -6); ctx.quadraticCurveTo(L * 0.3, -9, L * 0.55, -5); ctx.lineTo(L + 1, -2.5); ctx.lineTo(L + 0.5, 1.5); ctx.quadraticCurveTo(L * 0.5, 3.5, -4, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!C.tint) {
        ctx.fillStyle = '#f4e8d0'; ctx.beginPath(); for (let x = L * 0.3; x < L; x += 3) { ctx.moveTo(x, 2); ctx.lineTo(x + 1, 4.2); ctx.lineTo(x + 2, 2); } ctx.fill();
        ctx.strokeStyle = col(C, pal.dark); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(L * 0.25, -6.5); ctx.lineTo(L * 0.5, -4.5); ctx.stroke();
      }
      eyeV(ctx, C, L * 0.38, -3.4, 1.7);
    } else if (T.name === 'griffin') {
      // 독수리 머리: 둥근 정수리 · 갈고리 금빛 부리
      ctx.fillStyle = col(C, pal.beak);
      ctx.save(); ctx.translate(L * 0.55, 2); ctx.rotate(jaw * 0.4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.3, 0.5, L * 0.42, 1); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(L * 0.45, -4); ctx.quadraticCurveTo(L + 3, -4.5, L + 3, 1.5); ctx.quadraticCurveTo(L + 2.5, 4, L + 1, 3.5); ctx.quadraticCurveTo(L * 0.8, 1, L * 0.5, 2.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col(C, pal.feather);
      ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(-3, -10, L * 0.35, -8); ctx.quadraticCurveTo(L * 0.6, -6, L * 0.55, -2); ctx.quadraticCurveTo(L * 0.55, 3, L * 0.4, 4.5); ctx.quadraticCurveTo(L * 0.1, 8, -7, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!C.tint) { ctx.strokeStyle = col(C, pal.featherDk); ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-11, -2); ctx.moveTo(-6, 3); ctx.lineTo(-11, 3.5); ctx.moveTo(-5, 5.5); ctx.lineTo(-9, 8); ctx.stroke(); }
      eyeV(ctx, C, L * 0.33, -3, 1.6);
    }
  } finally { ctx.restore(); }
}
function vBatHead(ctx, C) {
  const { P, T, pal } = C;
  // 목 (짧고 굵은 털)
  ctx.fillStyle = col(C, pal.coat); ctx.strokeStyle = OUT; ctx.lineWidth = 1.3;
  limb(ctx, P.nx, P.ny, P.hx, P.hy, 18, 14, 2); ctx.fill(); ctx.stroke();
  const L = T.head.len, jaw = P.jaw ?? 0;
  ctx.save();
  try {
    ctx.translate(P.hx, P.hy); ctx.rotate(P.ha);
    // 귀 두 개 (크고 뾰족, 안은 분홍빛)
    for (const [ox, s] of [[L * 0.12, 0.9], [-L * 0.05, 1]]) {
      ctx.fillStyle = col(C, pal.coat); ctx.beginPath(); ctx.moveTo(ox + 1, 4); ctx.quadraticCurveTo(ox - 8 * s, -8 * s, ox - 7 * s - P.ear * 3, -20 * s); ctx.quadraticCurveTo(ox + 6 * s, -10 * s, ox + 9 * s, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (!C.tint) { ctx.fillStyle = col(C, pal.ear); ctx.beginPath(); ctx.moveTo(ox + 2, 2); ctx.quadraticCurveTo(ox - 4 * s, -6 * s, ox - 5 * s - P.ear * 2, -15 * s); ctx.quadraticCurveTo(ox + 4 * s, -8 * s, ox + 6.5 * s, 2); ctx.closePath(); ctx.fill(); }
    }
    // 아래턱 · 송곳니
    ctx.save(); ctx.translate(L * 0.4, 9); ctx.rotate(jaw * 0.6);
    ctx.fillStyle = col(C, pal.dark); ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(L * 0.5, 0.5); ctx.lineTo(L * 0.45, 3.5); ctx.quadraticCurveTo(L * 0.2, 5, -3, 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (jaw > 0.1 && !C.tint) { ctx.fillStyle = '#5a0a14'; ctx.beginPath(); ctx.moveTo(L * 0.4, 8.5); ctx.lineTo(L * 0.92, 7.5); ctx.lineTo(L * 0.4 + Math.cos(jaw * 0.6) * L * 0.5, 9 + Math.sin(jaw * 0.6) * L * 0.5); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = col(C, pal.coat);
    ctx.beginPath(); ctx.ellipse(L * 0.45, 4, L * 0.45, 7.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // 들창코 주둥이
    ctx.fillStyle = col(C, pal.ear); ctx.beginPath(); ctx.ellipse(L * 0.92, 5, 3.4, 3, 0, 0, TAU); ctx.fill(); ctx.stroke();
    if (!C.tint) {
      ctx.fillStyle = col(C, pal.fang); ctx.beginPath(); ctx.moveTo(L * 0.72, 9); ctx.lineTo(L * 0.74, 13 + jaw * 2); ctx.lineTo(L * 0.78, 9); ctx.moveTo(L * 0.82, 8.6); ctx.lineTo(L * 0.84, 12.4 + jaw * 2); ctx.lineTo(L * 0.87, 8.6); ctx.fill();
    }
    eyeV(ctx, C, L * 0.58, 1.5, 1.8);
  } finally { ctx.restore(); }
}
function eyeV(ctx, C, x, y, r) {
  if (C.tint) return;
  const ec = C.aw ? C.pal.awake : C.pal.eye;
  ctx.fillStyle = ec;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * Math.max(0.15, 1 - (C.P.blink ?? 0)), 0, 0, TAU); ctx.fill();
}

// ── 꼬리 ──
function vTail(ctx, C) {
  const { T, pal } = C, n = tailPts(C);
  if (!n) return;
  const wolf = T.name === 'wolf', gri = T.name === 'griffin';
  // 가늘어지는 띠 (늑대: 굵은 털 꼬리 · 비룡: 긴 꼬리 + 삽 끝 · 그리핀: 사자 꼬리 + 흰 털 뭉치)
  const w0 = wolf ? 9 : gri ? 6 : 13, w1 = wolf ? 6 : gri ? 3 : 3;
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.2;
  ctx.fillStyle = col(C, wolf ? pal.coat : gri ? pal.coat : pal.coat);
  for (let k = 0; k < n; k++) {
    const u0 = k / n, u1 = (k + 1) / n;
    let wa = lerp(w0, w1, u0), wb = lerp(w0, w1, u1);
    if (wolf) { wa *= 1 + Math.sin(u0 * PI) * 0.5; wb *= 1 + Math.sin(u1 * PI) * 0.5; }
    limb(ctx, TP[k * 2], TP[k * 2 + 1], TP[k * 2 + 2], TP[k * 2 + 3], wa, wb, 0); ctx.fill();
  }
  if (!C.tint) {
    ctx.strokeStyle = col(C, wolf ? pal.hi : pal.dark); ctx.lineWidth = 1; ctx.beginPath();
    for (let k = 1; k <= n; k++) { const x = TP[k * 2], y = TP[k * 2 + 1]; ctx.moveTo(x, y - 1); ctx.lineTo(x - 3, y + 2); }
    ctx.stroke();
  }
  const ex = TP[n * 2], ey = TP[n * 2 + 1], ea = C.P.ta[n - 1];
  if (T.name === 'wyvern') {   // 삽 모양 끝
    ctx.fillStyle = col(C, pal.dark); ctx.strokeStyle = OUT; ctx.lineWidth = 1.1;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(ea);
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(4, -6); ctx.lineTo(12, 0); ctx.lineTo(4, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  } else if (gri) {
    ctx.fillStyle = col(C, pal.feather); ctx.strokeStyle = OUT; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(ex + Math.cos(ea) * 3, ey + Math.sin(ea) * 3, 6, 4, ea, 0, TAU); ctx.fill(); ctx.stroke();
  }
}

// ── 날개 (막 / 깃털) ──
const WP = new Float32Array(24);
function vWing(ctx, C, w, far) {
  const { P, T, pal } = C, W = T.wing, feather = W.feather;
  // 뒤쪽 끝 (몸통 위, 어깨 뒤) → 막의 뒷전이 여기로 모인다
  const c = Math.cos(P.pitch), s = Math.sin(P.pitch), back = W.la * 0.9;
  const bx = w.rx - c * back * (1 - w.fold * 0.5), by = w.ry - s * back * (1 - w.fold * 0.5) + 4;
  const N = W.fingers ?? 3, n = feather ? 6 : N;
  // 손가락(깃) 끝: 날개 끝 → 뒤쪽 끝 사이를 손목에서 바깥으로 부풀린 점
  for (let k = 0; k <= n; k++) {
    const u = k / (n + 0.6);
    let x = lerp(w.tx, bx, u), y = lerp(w.ty, by, u);
    const dx = x - w.wx, dy = y - w.wy, d = Math.hypot(dx, dy) || 1;
    const bul = Math.sin(u * PI) * (W.lh * 0.12);
    x += dx / d * bul; y += dy / d * bul;
    WP[k * 2] = x; WP[k * 2 + 1] = y;
  }
  const mc = feather ? (far ? deep(pal.featherDk) : pal.feather) : (far ? deep(pal.membrane) : pal.membrane);
  ctx.save();
  try {
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.fillStyle = col(C, mc);
    ctx.beginPath();
    ctx.moveTo(w.rx, w.ry); ctx.lineTo(w.wx, w.wy); ctx.lineTo(WP[0], WP[1]);
    for (let k = 1; k <= n; k++) {
      const x0 = WP[k * 2 - 2], y0 = WP[k * 2 - 1], x1 = WP[k * 2], y1 = WP[k * 2 + 1];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const cx = lerp(mx, w.wx, feather ? -0.05 : 0.22), cy = lerp(my, w.wy, feather ? -0.05 : 0.22);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
    }
    ctx.quadraticCurveTo(lerp(WP[n * 2], bx, 0.5), lerp(WP[n * 2 + 1], by, 0.5) + (feather ? 0 : -3), bx, by);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (C.tint) return;
    if (feather) {
      // 깃: 손목 → 가장자리 긴 깃 · 금빛 끝 · 덮깃 띠
      ctx.lineWidth = 1; ctx.strokeStyle = col(C, far ? deep(pal.featherDk) : pal.featherDk); ctx.beginPath();
      for (let k = 0; k <= n; k++) { ctx.moveTo(lerp(w.wx, w.rx, k / (n + 2)), lerp(w.wy, w.ry, k / (n + 2))); ctx.lineTo(WP[k * 2], WP[k * 2 + 1]); }
      ctx.stroke();
      if (!far) { ctx.fillStyle = col(C, C.aw ? pal.awake : pal.gold); for (let k = 0; k < Math.min(3, n); k++) { ctx.beginPath(); ctx.arc(WP[k * 2], WP[k * 2 + 1], 2, 0, TAU); ctx.fill(); } }
      ctx.strokeStyle = col(C, far ? deep(pal.feather) : pal.hi); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(w.rx, w.ry); ctx.lineTo(w.wx, w.wy); ctx.lineTo(lerp(w.wx, w.tx, 0.35), lerp(w.wy, w.ty, 0.35)); ctx.stroke();
    } else {
      // 손가락 뼈 · 핏줄
      ctx.strokeStyle = col(C, far ? deep(pal.dark ?? pal.coat) : (pal.dark ?? pal.coat)); ctx.lineWidth = 2.2; ctx.beginPath();
      ctx.moveTo(w.rx, w.ry); ctx.lineTo(w.wx, w.wy);
      for (let k = 0; k < n; k++) { ctx.moveTo(w.wx, w.wy); ctx.lineTo(WP[k * 2], WP[k * 2 + 1]); }
      ctx.stroke();
      if (C.q > 0) {
        const ga = ctx.globalAlpha;
        ctx.strokeStyle = col(C, far ? deep(pal.vein) : pal.vein); ctx.lineWidth = 0.7; ctx.globalAlpha = ga * 0.7; ctx.beginPath();
        for (let k = 0; k < n; k++) { const x = WP[k * 2], y = WP[k * 2 + 1], x2 = WP[k * 2 + 2], y2 = WP[k * 2 + 3]; ctx.moveTo(lerp(w.wx, x, 0.4), lerp(w.wy, y, 0.4)); ctx.quadraticCurveTo(lerp(x, x2, 0.5), lerp(y, y2, 0.5), lerp(w.wx, x2, 0.7), lerp(w.wy, y2, 0.7)); }
        ctx.stroke();
        ctx.globalAlpha = ga;
      }
      // 엄지 발톱
      ctx.fillStyle = col(C, pal.claw); ctx.beginPath(); ctx.moveTo(w.wx, w.wy); ctx.lineTo(w.wx + 3, w.wy - 4); ctx.lineTo(w.wx + 1, w.wy + 1); ctx.fill();
    }
  } finally { ctx.restore(); }
}

// ───────────────────────── 마구 (등자 · 고삐) ─────────────────────────
const _bit = [0, 0];
function bitPt(C, R) {
  const { P, T } = C;
  const H = R?.head;
  if (H) {
    const hr = P.na - T.neck.a;
    if (H.bit) return PD.pt(H.base[0], H.base[1], H.bit[0], H.bit[1], P.nx, P.ny, hr, H.k, H.k, _bit);
    if (H.hinge) { const qx = lerp(H.base[0], H.hinge[0], 0.45), qy = lerp(H.base[1], H.hinge[1], 0.45); return PD.pt(H.base[0], H.base[1], qx, qy, P.nx, P.ny, hr, H.k, H.k, _bit); }
  }
  if (T.name === 'wolf') { _bit[0] = lerp(P.nx, P.hx, 0.55); _bit[1] = lerp(P.ny, P.hy, 0.55) + 4; return _bit; }   // 늑대: 목줄
  if (T.name === 'bat') return hp(C, T.head.len * 0.15, 8, _bit);
  return hp(C, T.head.len * 0.72, 3, _bit);
}
function stirrupIron(ctx, C, fx, fy) {
  const pal = C.pal, iron = C.T.name === 'bat' ? pal.silver : C.T.name === 'wolf' ? '#8a929e' : pal.trim;
  ctx.strokeStyle = C.tint ? C.tint : OUT; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(fx - 4.5, fy); ctx.lineTo(fx - 2.5, fy - 3.5); ctx.lineTo(fx + 2.5, fy - 3.5); ctx.lineTo(fx + 4.5, fy); ctx.closePath(); ctx.stroke();
  ctx.strokeStyle = col(C, iron); ctx.lineWidth = 1.2; ctx.stroke();
}
function reinStyle(ctx, C) {
  const chain = C.T.name === 'bat';
  ctx.strokeStyle = col(C, chain ? C.pal.silver : '#3a2418'); ctx.lineWidth = chain ? 1.3 : 1.1;
  if (chain) ctx.setLineDash([2, 1.5]);
  return chain;
}
function frontTack(ctx, C, R) {
  if (!C.ridden) return;
  const { P, m } = C, sx = P.sl.x, sy = P.sl.y;
  stirrupIron(ctx, C, sx + 9, sy + (m.def?.footY ?? 22) + 4);
  const [bx, by] = bitPt(C, R), rx = sx + 12, ry = sy - 14;
  const chain = reinStyle(ctx, C);
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + rx) / 2, Math.max(by, ry) + 8, rx, ry); ctx.stroke();
  if (chain) ctx.setLineDash([]);
}
function tackBack(ctx, C, R) {
  const { P, m, pal } = C, sx = P.sl.x, sy = P.sl.y;
  const drop = C.ridden ? (m.def?.footY ?? 22) + 4 : ((m.def?.footY ?? 22) + 4) * 0.62;
  const fx = sx + (C.ridden ? 9 : 3), fy = sy + drop;
  ctx.strokeStyle = C.tint ? C.tint : OUT; ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.moveTo(sx + 2, sy + 1); ctx.lineTo(fx, fy - 3.5); ctx.stroke();
  ctx.strokeStyle = col(C, C.T.name === 'bat' ? pal.silver : pal.leather); ctx.lineWidth = 1.5; ctx.stroke();
  if (C.ridden) return;
  stirrupIron(ctx, C, fx, fy);
  const [bx, by] = bitPt(C, R), rx = sx + 9, ry = sy - 2;
  const chain = reinStyle(ctx, C);
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + rx) / 2, Math.max(by, ry) + 6, rx, ry); ctx.stroke();
  if (chain) ctx.setLineDash([]);
}

// ───────────────────────── 효과 (가산; 시간 함수) ─────────────────────────
// 앵커: 눈 · 코 · 입 · 목구멍 (지역). 채색은 부품 점, 벡터는 머리 좌표계.
const AN = { eye: [0, 0], nose: [0, 0], mouth: [0, 0], throat: [0, 0], has: { eye: false, nose: false, mouth: false, throat: false } };
function vecAnchors(C) {
  const { T } = C, L = T.head.len;
  const h = AN.has;
  h.eye = h.nose = h.mouth = true; h.throat = T.name === 'wyvern';
  if (T.name === 'wolf') { hp(C, L * 0.36, -2.6, AN.eye); hp(C, L + 1, -0.6, AN.nose); hp(C, L * 0.85, 2.5, AN.mouth); }
  else if (T.name === 'wyvern') { hp(C, L * 0.38, -3.4, AN.eye); hp(C, L, -1.5, AN.nose); hp(C, L * 0.9, 2.5, AN.mouth); hp(C, L * 0.1, 6, AN.throat); }
  else if (T.name === 'griffin') { hp(C, L * 0.33, -3, AN.eye); hp(C, L, 0, AN.nose); hp(C, L * 0.8, 2.5, AN.mouth); }
  else { hp(C, L * 0.58, 1.5, AN.eye); hp(C, L * 0.95, 5, AN.nose); hp(C, L * 0.8, 9, AN.mouth); }
  return AN;
}
function fxB(ctx, C, A) {
  const { P, pal, t, q, m } = C, a = m.anim;
  const ec = C.aw ? pal.awake : pal.eye;
  if (A.has.eye) {
    glow(ctx, A.eye[0], A.eye[1], 3 + (P.hurt ?? 0) * 1.5, ec, 0.75 * (1 - (P.blink ?? 0) * 0.8));
    if (q > 0) glow(ctx, A.eye[0], A.eye[1], 7, ec, 0.22);
  }
  if (q === 0) return;
  const id = C.id;
  if (id === 'mt_direwolf') {
    // 서리 숨 (콧김 · 포효) · 각성: 서리 기운
    const s = Math.max(P.snort ?? 0, P.howl ?? 0);
    if (s > 0.05 && A.has.nose) for (let k = 0; k < (q === 2 ? 3 : 2); k++) glow(ctx, A.nose[0] + 3 + k * 4 * s, A.nose[1] + 1 - k * 2, 2.5 + k * 2.2 * s, pal.breath, 0.4 * s * (1 - k * 0.25));
    if (a === 'charge' && A.has.mouth) glow(ctx, A.mouth[0], A.mouth[1], 6, pal.glow, 0.35);
  } else if (id === 'mt_wyvern') {
    // 목구멍 불씨 (늘) · 숨결: 입에 불빛
    if (A.has.throat) glow(ctx, A.throat[0], A.throat[1], 6 + 2 * flick(t, 2), C.aw ? pal.awake : pal.glow, 0.22 + 0.12 * flick(t * 0.7, 5));
    if ((a === 'breath' || P.jaw > 0.4) && A.has.mouth) { const k = a === 'breath' ? 1 : P.jaw; glow(ctx, A.mouth[0], A.mouth[1], 7 + 4 * k, pal.breath, 0.5 * k); if (q === 2) glow(ctx, A.mouth[0] + 6, A.mouth[1], 10 * k, '#ffd070', 0.3 * k); }
  } else if (id === 'mt_giantbat') {
    if ((a === 'screech' || a === 'charge') && A.has.mouth) glow(ctx, A.mouth[0], A.mouth[1], 8, pal.breath, 0.45);
  } else if (id === 'mt_gale') {
    if ((a === 'dive' || a === 'charge') && P.wing) glow(ctx, P.wing.wx, P.wing.wy, 8, pal.glow, 0.3 + 0.2 * flick(t, 4));
  }
}

// ───────────────────────── 채색 퍼핏 ─────────────────────────
// 부품 (manifest; tools/painted/companions/<id>/config.json): body · head(목+머리, base 핀) · jaw(hinge) · foreU/foreL · hindU/hindL (a → b) ·
// tail(늑대: 띠로 굽힘) / tail0.. (비룡·그리핀: 마디마다 하나) · wing (root · wrist · tip · mem · mid · f1..f3) · leg (박쥐 뒷다리 a → b).
// 먼 다리·먼 날개 = 가까운 것의 어두운 변형 (deep). 날개는 root·wrist·tip 세 점 아핀 (내려치면 저절로 뒤집힌다).
const PD = new Drawer();
const _q = [0, 0], _j = [0, 0], _jt = [0, 0], _aff = [0, 0, 0, 0, 0, 0];
function partGeo(p) {
  if (p._g) return p._g;
  const a = p.a ?? [0, 0], b = p.b ?? [0, p.h];
  p._g = { ang: Math.atan2(b[1] - a[1], b[0] - a[0]), len: Math.hypot(b[0] - a[0], b[1] - a[1]) * p.k };
  return p._g;
}
const SIL_MAX = 8;
function silOf(C, p) {
  const t = C.tint, v = p.v;
  if (t === C.rig?.def?.glow && v.glow) return v.glow;
  const cache = p._sil ??= new Map();
  let im = cache.get(t);
  if (im === undefined) {
    const src = v.flash ?? v.glow;
    im = null;
    if (src && cache.size < SIL_MAX) {
      try {
        im = silhouette(src, t);
        if (typeof createImageBitmap === 'function') createImageBitmap(im).then((b) => { if (cache.get(t) === im) cache.set(t, b); }, () => { /* 캔버스 유지 */ });
      } catch { im = null; }
    }
    im ??= v.glow ?? v.flash ?? null;
    cache.set(t, im);
  }
  return im;
}
function pput(D, C, p, pv, x, y, rot, sx, sy, deepV, tk) {
  if (!p) return;
  if (rot > -0.012 && rot < 0.012) rot = 0;
  if (C.tint) { const im = silOf(C, p); if (im) { const q = typeof pv === 'string' ? p[pv] : pv; D.img(im, q[0], q[1], x, y, rot, sx, sy, 1); } return; }
  D.part(p, pickVariant(p, 0, deepV, tk), pv, x, y, rot, sx, sy, 1);
}
function pLeg(D, C, U, Lw, L, len1, len2, deepV, tk) {
  if (!U || !Lw) return;
  const gu = partGeo(U), gl = partGeo(Lw);
  const s1 = U.k * clamp(len1 / (gu.len || len1), 0.8, 1.25), s2 = Lw.k * clamp(len2 / (gl.len || len2), 0.8, 1.25);
  pput(D, C, Lw, 'a', L.kx, L.ky, L.a2 - gl.ang, s2, s2, deepV, tk);
  pput(D, C, U, 'a', L.rx, L.ry, L.a1 - gu.ang, s1, s1, deepV, tk);
}
/** 아핀 변환 (지역 → 캔버스): Drawer 의 기준 변환과 합성 */
function setAff(D, a, b, c, d, e, f) {
  const m = D.m;
  D.ctx.setTransform(m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]);
}
/** 날개 부품 텍셀 → 지역: root → w.r, wrist → w.w, tip → w.t */
function wingAff(Wp, w, out) {
  const R = Wp.root, Wr = Wp.wrist, Tt = Wp.tip;
  if (!R || !Wr || !Tt) return null;
  const ux = Wr[0] - R[0], uy = Wr[1] - R[1], vx = Tt[0] - Wr[0], vy = Tt[1] - Wr[1];
  const det = ux * vy - uy * vx;
  if (Math.abs(det) < 1e-6) return null;
  const Ax = w.wx - w.rx, Ay = w.wy - w.ry, Hx = w.tx - w.wx, Hy = w.ty - w.wy;
  const i00 = vy / det, i01 = -vx / det, i10 = -uy / det, i11 = ux / det;
  const a = Ax * i00 + Hx * i10, c = Ax * i01 + Hx * i11, b = Ay * i00 + Hy * i10, d = Ay * i01 + Hy * i11;
  if (!Number.isFinite(a + b + c + d)) return null;
  out[0] = a; out[1] = b; out[2] = c; out[3] = d;
  out[4] = w.rx - (a * R[0] + c * R[1]); out[5] = w.ry - (b * R[0] + d * R[1]);
  return out;
}
function affPt(A, q, out) { out[0] = A[0] * q[0] + A[2] * q[1] + A[4]; out[1] = A[1] * q[0] + A[3] * q[1] + A[5]; return out; }
function pWing(D, ctx, C, Wp, w, far, tk) {
  if (!Wp || !w) return;
  const img = C.tint ? silOf(C, Wp) : pickVariant(Wp, 0, far, tk);
  if (!img) return;
  const A = wingAff(Wp, w, _aff);
  if (!A) return;
  setAff(D, A[0], A[1], A[2], A[3], A[4], A[5]);
  ctx.drawImage(img, 0, 0);
  // 피격 번쩍임: 아핀 부품은 Drawer 기록을 거치지 않는다 → 흰 실루엣을 바로 가산으로
  if (C.flash && Wp.v.flash) {
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * (far ? 0.4 : 0.62);
    ctx.drawImage(Wp.v.flash, 0, 0);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
}
/** 늑대 꼬리: 부품을 a→b 가로 띠로 잘라 사슬 각도대로 이어 붙인다 (mounts.js 의 말꼬리와 같은 방법) */
function pTailBands(D, ctx, C, Tp, tk) {
  if (!Tp) return;
  const img = C.tint ? silOf(C, Tp) : pickVariant(Tp, 0, false, tk);
  if (!img) return;
  tailBands(D, ctx, C, Tp, img, ctx.globalAlpha < 0.98 ? 0 : 1);
  if (C.flash && Tp.v.flash) {
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * 0.62;
    tailBands(D, ctx, C, Tp, Tp.v.flash, 0);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
}
function tailBands(D, ctx, C, Tp, img, ov) {
  const P = C.P, n = P.ta.length;
  if (!n) return;
  const g = partGeo(Tp), a = Tp.a, b = Tp.b, k = Tp.k;
  const H = img.height, W = img.width;
  const bend = n > 1 ? Math.abs(P.ta[n - 1] - P.ta[0]) : 0;
  const lo = Math.min(n, C.q === 0 || bend < 0.3 ? 2 : 3);
  let wx = P.tx, wy = P.ty;
  for (let i = 0; i < lo; i++) {
    const u0 = i / lo, u1 = (i + 1) / lo;
    const ax = a[0] + (b[0] - a[0]) * u0, ay = a[1] + (b[1] - a[1]) * u0;
    const ang = P.ta[Math.min(n - 1, Math.round(i * n / lo))];
    const nx = i < lo - 1 ? P.ta[Math.min(n - 1, Math.round((i + 1) * n / lo))] : ang;
    const wedge = Math.min(H * 0.25, Math.ceil(Math.abs(nx - ang) * W * 0.5));
    const y0 = i === 0 ? 0 : Math.floor(ay) - ov, y1 = i === lo - 1 ? H : Math.min(H, Math.floor(a[1] + (b[1] - a[1]) * u1) + ov + wedge);
    D.set(ax, ay, wx, wy, ang - g.ang, k, k);
    if (y1 > y0) ctx.drawImage(img, 0, y0, W, y1 - y0, 0, y0, W, y1 - y0);
    const seg = g.len / lo;
    wx += Math.cos(ang) * seg; wy += Math.sin(ang) * seg;
  }
}
/** 비룡·그리핀 꼬리: 마디마다 부품 하나 (끝 → 뿌리 순서로 그려 굵은 쪽이 이음매를 덮는다) */
const TJ = new Float32Array(16);
function pTailPieces(D, C, R, tk) {
  const { P, T } = C, names = T.tailParts, n = Math.min(names.length, P.ta.length, 7);
  let x = P.tx, y = P.ty;
  for (let i = 0; i < n; i++) { TJ[i * 2] = x; TJ[i * 2 + 1] = y; x += Math.cos(P.ta[i]) * T.tailSeg[i].len; y += Math.sin(P.ta[i]) * T.tailSeg[i].len; }
  for (let i = n - 1; i >= 0; i--) {
    const p = R[names[i]];
    if (!p) continue;
    pput(D, C, p, 'a', TJ[i * 2], TJ[i * 2 + 1], P.ta[i] - partGeo(p).ang, p.k, p.k, false, tk);
  }
}
function headPt(D, C, H, name, hr, out) {
  const q = H?.[name];
  if (!q) return null;
  return D.pt(H.base[0], H.base[1], q[0], q[1], C.P.nx, C.P.ny, hr, H.k, H.k, out);
}
/** 머리 (+ 아래턱: 벌어진 틈에 입속을 먼저 칠한다) */
function pHead(D, ctx, C, R, tk) {
  const { P, T } = C, H = R.head, J = R.jaw, hr = P.na - T.neck.a, k = H.k;
  if (J && H.hinge && J.hinge) {
    headPt(D, C, H, 'hinge', hr, _j);
    const jr = hr + (P.jaw ?? 0) * (T.jawMax ?? 0.5);
    if (!C.tint && (P.jaw ?? 0) > 0.05 && J.tip) {
      D.pt(J.hinge[0], J.hinge[1], J.tip[0], J.tip[1], _j[0], _j[1], jr, J.k, J.k, _jt);
      const up = headPt(D, C, H, H.mouth ? 'mouth' : 'muzzle', hr, _q) ?? _q;
      D.end();
      ctx.fillStyle = C.flash ? '#ff9a9a' : T.name === 'wyvern' && C.m.anim === 'breath' ? '#ff8a2a' : '#3a080c';
      ctx.beginPath(); ctx.moveTo(_j[0], _j[1]); ctx.lineTo(up[0], up[1]); ctx.lineTo(_jt[0], _jt[1]); ctx.closePath(); ctx.fill();
    }
    pput(D, C, J, 'hinge', _j[0], _j[1], jr, J.k, J.k, false, tk);
  }
  pput(D, C, H, 'base', P.nx, P.ny, hr, k, k, false, tk);
  return hr;
}
function painted(ctx, C, layer, rig) {
  C.rig = rig;
  const { P, T, m } = C, R = rig.parts, D = PD;
  const tk = C.aw && rig.mount.tint && rig.tintKeys?.includes(rig.mount.tint) ? rig.mount.tint : null;
  if (layer === 'front') {
    if (P.wing && P.wing.front && R.wing) { D.begin(ctx); pWing(D, ctx, C, R.wing, P.wing, false, tk); D.end(); }
    frontTack(ctx, C, R);
    return;
  }
  const bat = T.name === 'bat';
  if (!C.tint && m.onGround !== false) {
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.34; ctx.fillStyle = '#000';
    if (bat) { ctx.beginPath(); ctx.ellipse(-8, 0, 36, 3.6, 0, 0, TAU); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse((T.sh[0] + T.hp[0]) / 2, 0, (T.sh[0] - T.hp[0]) / 2 + 12, 3.6, 0, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = ga;
  }
  D.begin(ctx);
  if (C.flash) D.startFlash();
  if (R.wing && P.fwing) pWing(D, ctx, C, R.wing, P.fwing, true, tk);
  let hr;
  if (bat) {
    const Lg = R.leg;
    if (Lg) { const g = partGeo(Lg); pput(D, C, Lg, 'a', P.legs[0].rx, P.legs[0].ry, P.legs[0].a1 - g.ang, Lg.k, Lg.k, true, tk); }
    const B = R.body;
    pput(D, C, B, 'c', P.bx, P.by, P.ba, B.k, B.k, false, tk);
    if (R.wing && P.wing && !P.wing.front) pWing(D, ctx, C, R.wing, P.wing, false, tk);
    if (Lg) { const g = partGeo(Lg); pput(D, C, Lg, 'a', P.legs[2].rx, P.legs[2].ry, P.legs[2].a1 - g.ang, Lg.k, Lg.k, false, tk); }
    hr = pHead(D, ctx, C, R, tk);
  } else {
    if (T.tailParts) pTailPieces(D, C, R, tk); else pTailBands(D, ctx, C, R.tail, tk);
    pLeg(D, C, R.hindU, R.hindL, P.legs[0], T.l1h, T.l2h, true, tk);
    pLeg(D, C, R.foreU, R.foreL, P.legs[1], T.l1f, T.l2f, true, tk);
    const B = R.body, L2 = P.legs[2];
    pput(D, C, B, 'hp', L2.rx, L2.ry, P.pitch, B.k * (P.stretch ?? 1), B.k, false, tk);
    if (R.wing && P.wing && !P.wing.front) pWing(D, ctx, C, R.wing, P.wing, false, tk);
    hr = pHead(D, ctx, C, R, tk);
    pLeg(D, C, R.hindU, R.hindL, P.legs[2], T.l1h, T.l2h, false, tk);
    pLeg(D, C, R.foreU, R.foreL, P.legs[3], T.l1f, T.l2f, false, tk);
  }
  if (C.flash) D.flash(0.62);
  D.end();
  tackBack(ctx, C, R);
  if (!C.tint && C.fx) {
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter'; LB = true;
    try { fxB(ctx, C, paintedAnchors(D, C, R, hr)); if (C.q > 0) paintedFxExtra(ctx, C, rig, D); } finally { LB = false; ctx.globalCompositeOperation = op; }
  } else if (!C.tint) {
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter'; LB = true;
    try { const A = paintedAnchors(D, C, R, hr); if (A.has.eye) glow(ctx, A.eye[0], A.eye[1], 3, C.aw ? C.pal.awake : C.pal.eye, 0.7 * (1 - (P.blink ?? 0) * 0.8)); } finally { LB = false; ctx.globalCompositeOperation = op; }
  }
}
function paintedAnchors(D, C, R, hr) {
  const H = R.head, h = AN.has;
  h.eye = !!headPt(D, C, H, 'eye', hr, AN.eye);
  h.nose = !!(headPt(D, C, H, 'nose', hr, AN.nose) ?? headPt(D, C, H, 'muzzle', hr, AN.nose));
  h.mouth = !!(headPt(D, C, H, 'mouth', hr, AN.mouth) ?? headPt(D, C, H, 'muzzle', hr, AN.mouth));
  h.throat = !!headPt(D, C, H, 'throat', hr, AN.throat);
  return AN;
}
function bodyPtP(D, C, B, name, out) {
  const q = B?.[name];
  if (!q) return null;
  const P = C.P;
  if (C.T.name === 'bat') return D.pt(B.c[0], B.c[1], q[0], q[1], P.bx, P.by, P.ba, B.k, B.k, out);
  const L2 = P.legs[2];
  return D.pt(B.hp[0], B.hp[1], q[0], q[1], L2.rx, L2.ry, P.pitch, B.k * (P.stretch ?? 1), B.k, out);
}
/** 모듈 fx 표: body / awBody = [[몸 점, 반지름, 세기]], awWing = [날개 점…] (각성 때 날개 핏줄·깃 끝 빛) */
function paintedFxExtra(ctx, C, rig, D) {
  const fx = rig.mount.fx ?? {}, R = rig.parts, pal = C.pal, t = C.t, gc = C.aw ? pal.awake : pal.glow;
  const bodyGlows = C.aw && fx.awBody ? fx.awBody : fx.body;
  if (bodyGlows) for (const [name, r, a0] of bodyGlows) { if (bodyPtP(D, C, R.body, name, _q)) glow(ctx, _q[0], _q[1], r, gc, a0 * (0.75 + 0.25 * flick(t, r))); }
  if (C.aw && fx.awWing && R.wing && C.P.wing && C.q === 2) {
    for (const w of [C.P.wing]) {
      const A = wingAff(R.wing, w, _aff);
      if (!A) continue;
      let i = 0;
      for (const name of fx.awWing) { const q = R.wing[name]; if (!q) continue; affPt(A, q, _q); glow(ctx, _q[0], _q[1], 7, gc, 0.3 * (0.6 + 0.4 * flick(t, ++i))); }
    }
  }
}

// ───────────────────────── 아이콘 ─────────────────────────
const ICON_V = new Map();
const S1 = { ...S0 };
function iconDraw(ctx, id, x, y, r) {
  if (!(r > 0)) return;
  const rig = paintedRig(id), H = rig?.parts?.head;
  ctx.save();
  try {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    if (H?.eye && H?.muzzle && H?.poll) {
      const hl = Math.hypot(H.muzzle[0] - H.poll[0], H.muzzle[1] - H.poll[1]) || 1;
      const s = (r * (id === 'mt_giantbat' ? 1.05 : 1.3)) / hl;
      const cx = (H.poll[0] + H.muzzle[0]) / 2 - (H.muzzle[0] - H.poll[0]) * 0.12, cy = (H.poll[1] + H.muzzle[1]) / 2;
      PD.begin(ctx);
      PD.part(H, pickVariant(H, 0, false, null), [cx, cy], x, y, 0, s, s, 1);
      PD.end();
      return;
    }
    const rigName = { mt_direwolf: 'wolf', mt_wyvern: 'wyvern', mt_giantbat: 'bat', mt_gale: 'griffin' }[id];
    if (!rigName) return;
    let v = ICON_V.get(id);
    if (!v) {
      v = { id, rig: rigName, def: null, anim: 'idle', animT: 0, t: 1.3, cx: 0, bottom: 0, facing: 1, onGround: true, speedK: 0, phase: 0, pitch: 0, rearK: 0, vx: 0, vy: 0, pose: null, awakened: false };
      v.pose = RIG.mountPose(v, 0);
      ICON_V.set(id, v);
    }
    const P = v.pose, T = RIG.templateFor(v);
    if (!P || !T) return;
    const s = r / (rigName === 'bat' ? 30 : 24);
    const L = T.head.len;
    const hcx = P.hx + Math.cos(P.ha) * L * 0.45, hcy = P.hy + Math.sin(P.ha) * L * 0.45 + (rigName === 'bat' ? 0 : -2);
    ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-hcx, -hcy);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const C = S1;
    C.m = v; C.P = P; C.T = T; C.id = id; C.pal = palOf(id); C.tint = null; C.flash = false; C.fx = true; C.q = 1; C.t = 1.3; C.aw = false; C.world = null; C.f = 1; C.rig = null; C.ridden = false;
    if (rigName === 'bat') vBatHead(ctx, C); else { vNeck(ctx, C); vHead(ctx, C); }
    C.m = null; C.P = null;
  } finally { ctx.restore(); }
}
export const MOUNT_ICON_B = { mt_direwolf: iconDraw, mt_wyvern: iconDraw, mt_giantbat: iconDraw, mt_gale: iconDraw };
