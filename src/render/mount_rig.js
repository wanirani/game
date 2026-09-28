// 탈것 공용 리그 — owner: CMP-MOUNT-ART-A (companions §11.1; MASTER_PLAN §1.2 · §1.15)
// 순수 수학 (ctx 없음, Math.random 없음). 업데이트마다 한 번 계산한 포즈를 그리기·안장·피격 판정이 함께 쓴다.
//
//  mountPose(m, dt) → pose | null     m = MountRider · MountGhost · mountView 가 공유하는 필드 (mount.js 머리말 참고).
//                                     m.rig(없으면 m.def.rig) 의 템플릿이 없으면 null → mount.js 의 대체 그림을 쓴다.
//                                     같은 m 에서는 포즈 객체를 재사용한다 (m.pose; 잔상은 structuredClone 사본).
//  seatOf(pose, out) → {x, y, lean}   안장점 (월드) + 기수 기울기 (rad, + 앞으로)
//  registerTemplate(name, tpl)        리그 템플릿 등록 (CMP-MOUNT-ART-B: wolf · wyvern · bat · griffin).
//      tpl = { kind: 'quad', ...치수 }  → 이 파일의 네발 엔진 (quadPose) 이 푼다 (늑대: gallop 'bound')
//      tpl = { kind: <무엇이든>, pose(m, dt, P, T) }  → 직접 푼다 (P 는 재사용 포즈 객체, T = 치수가 합쳐진 템플릿)
//  templateFor(m) → 템플릿 (MOUNT_TUNE[id] 로 개체별 치수를 덮어쓴 것, 한 번 합쳐 캐시)
//  quadPose · ik2 · footCycle · GAIT   B 패키지·갤러리용 도우미
//
// ── 좌표 ────────────────────────────────────────────────────────────────────────────────────────
//  포즈의 모든 점은 '지역' 좌표: 원점 = 발 중앙 (m.cx, m.bottom), 오른쪽을 본다, y 는 아래가 +. 그리는 쪽이
//  translate(cx, bottom) · scale(facing, 1) 뒤에 그대로 쓴다. seat 만 월드 좌표.
//  네발 다리 순서: 0 먼 뒷다리 · 1 먼 앞다리 · 2 가까운 뒷다리 · 3 가까운 앞다리 (mount.js 대체 그림과 같음)
//
// ── 포즈 필드 (네발) ─────────────────────────────────────────────────────────────────────────────
//  tpl, id, kind:'quad', gait('stand'|'walk'|'trot'|'gallop'|'air'|'swim'|'rear'|'knocked'), t
//  pitch (몸 회전, 뒷발 축 px,0; 앞들기 = 음수) · bob (+ = 아래) · px (회전 축 x) · stretch (질주 가로 늘임, px 기준) · sq (착지 찌그러짐 0..1)
//  turnK (0..1, 1 = 돌기 끝)
//  bx, by, ba            몸통 중심 · 각도 (= pitch)
//  legs[i] = { rx, ry, kx, ky, fx, fy, a1, a2, up }   관절(어깨·엉덩이) → 무릎(비절) → 발굽 바닥, a1/a2 = 두 마디 각도, up = 발이 뜬 정도 0..1
//  nx, ny, na            목 뿌리 · 목 각도 (−x 위쪽)     hx, hy, ha   머리 뿌리(목 끝) · 머리 각도
//  jaw (0..1 입 벌림) · ear (0..1 귀 젖힘) · blink (0..1 눈 감김) · snort (0..1 콧김) · look (머리 좌우 흔들 −1..1)
//  tx, ty, ta[n], tl     꼬리 뿌리 · 마디별 절대 각도 · 마디 길이      mane (갈기 흩날림 0..1)
//  seat {x, y, lean} (월드) · sl {x, y} (지역 안장점)
//  paw (0..1 앞발 긁기, 대기 특수 동작) · dig (0..1 땅 파기) · howl (0..1) · charge (0..1) · hurt (0..1) · fire (0..1 불꽃 세기 가산)
//  s  (내부 스프링 상태 — 그리는 쪽은 읽지 않는다)

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
/** 결정론적 잡음 0..1 (정수 시드) */
const h1 = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ───────────────────────── 템플릿 ─────────────────────────
export const TEMPLATES = Object.create(null);
const MERGED = new Map();   // rig|id → 합쳐진 템플릿
/** 템플릿 등록 (같은 이름이면 교체). 합쳐 둔 캐시도 비운다 */
export function registerTemplate(name, tpl) {
  if (!name || !tpl || typeof tpl !== 'object') return null;
  TEMPLATES[name] = { name, ...tpl };
  MERGED.clear();
  return TEMPLATES[name];
}
export function getTemplate(name) { return TEMPLATES[name] ?? null; }

/**
 * 네발 치수 (지역 px). 다리: l1 = 윗마디 (앞: 어깨→무릎, 뒤: 엉덩이→비절), l2 = 아랫마디 (무릎/비절 → 발굽 바닥).
 * sh/hp = 가까운 다리 뿌리 (쉴 때), far = 먼 다리의 어긋남 [dx, dy]. neck = 목 뿌리·각도·길이, head = 머리 각도·길이.
 * tail = 뿌리·마디 수·마디 길이·쉴 때 각도. seat = 안장점 (데이터 def.seat 가 있으면 그것).
 * gallop: 'rotary'(말) | 'trot'(멧돼지: 빠른 속보) | 'bound'(늑대·사슴 도약). lift = 발 드는 높이 [걷기, 달리기].
 */
registerTemplate('horse', {
  kind: 'quad',
  body: { x: -2, y: -50, rx: 34, ry: 13 },
  sh: [19, -47], hp: [-23, -47], far: [4, -1.5],
  l1f: 22, l2f: 26, l1h: 23, l2h: 26,
  neck: { x: 23, y: -56, a: -1.02, len: 30 }, head: { a: 0.62, len: 25 },
  tail: { x: -35, y: -57, n: 5, len: 6.4, a: 1.9 },
  seat: [-4, -56],
  gallop: 'rotary', lift: [9, 16], bob: [1.4, 3, 4.6], pump: 0.12, stretch: 0.04,
  duty: { walk: 0.62, trot: 0.5, gallop: 0.36 },
});
registerTemplate('boar', {
  kind: 'quad',
  body: { x: -2, y: -35, rx: 37, ry: 16 },
  sh: [20, -27], hp: [-24, -27], far: [4, -1],
  l1f: 13, l2f: 15.5, l1h: 13.5, l2h: 15.5,
  neck: { x: 26, y: -38, a: -0.18, len: 10 }, head: { a: 0.32, len: 26 },
  tail: { x: -39, y: -42, n: 3, len: 4, a: 2.2 },
  seat: [-6, -48],
  gallop: 'trot', lift: [6, 10], bob: [1.2, 2.2, 3.2], pump: 0.07, stretch: 0.03,
  duty: { walk: 0.62, trot: 0.46, gallop: 0.44 },
});
registerTemplate('stag', {
  kind: 'quad',
  body: { x: -2, y: -49, rx: 31, ry: 11 },
  sh: [18, -47], hp: [-21, -47], far: [4, -1.5],
  l1f: 23, l2f: 26, l1h: 24, l2h: 26,
  neck: { x: 21, y: -54, a: -1.12, len: 27 }, head: { a: 0.55, len: 21 },
  tail: { x: -32, y: -55, n: 3, len: 4.2, a: 2.5 },
  seat: [-4, -54],
  gallop: 'bound', lift: [10, 18], bob: [1.4, 3, 5.2], pump: 0.1, stretch: 0.05,
  duty: { walk: 0.62, trot: 0.5, gallop: 0.34 },
});

/**
 * 개체별 치수 조정 (얕은 합침; 객체 값은 그 객체 안에서 한 단계 더 합친다).
 * 채색 퍼핏의 관절이 이 값에 맞춰 놓이므로 그림과 벡터가 같은 안장·같은 발 위치를 쓴다.
 */
export const MOUNT_TUNE = {
  // tools/painted/companions/mt_warhorse/mounts_build.py tune <id> 의 출력 (채색 그림 관절에서 잰 값, 게임 px)
  mt_warhorse: { sh: [12.93, -32.91], hp: [-27.14, -31.0], far: [4, -1.5], l1f: 14.32, l2f: 18.84, l1h: 12.84, l2h: 18.77, footF: 2.53, footH: -0.81, sink: 1.2, neck: { x: 17.46, y: -51.99, a: -0.862, len: 24.19 }, head: { a: 1.067, len: 18.79 }, tail: { x: -31.57, y: -49.37, n: 5, len: 9.07, a: 1.806 }, seat: [-4.0, -56.05], body: { x: -1.1, y: -44.1, rx: 31.0, ry: 14.1 } },
  mt_skelsteed: { sh: [11.1, -33.85], hp: [-22.66, -31.27], far: [4, -1.5], l1f: 14.77, l2f: 19.45, l1h: 14.82, l2h: 21.15, footF: 4.12, footH: -7.83, sink: 1.2, neck: { x: 13.35, y: -47.44, a: -0.797, len: 29.5 }, head: { a: 1.062, len: 18.79 }, tail: { x: -28.47, y: -50.26, n: 5, len: 7.86, a: 1.947 }, seat: [-4.0, -54.01], body: { x: -8.0, y: -43.5, rx: 24.1, ry: 14.3 } },
  mt_ignis: { sh: [11.89, -31.77], hp: [-24.32, -32.04], far: [4, -1.5], l1f: 12.77, l2f: 19.04, l1h: 12.18, l2h: 20.95, footF: 1.56, footH: -2.6, sink: 1.2, neck: { x: 11.63, y: -49.23, a: -0.71, len: 29.55 }, head: { a: 1.164, len: 16.45 }, tail: { x: -26.4, y: -49.23, n: 5, len: 8.22, a: 2.102 }, seat: [-4.0, -56.0], body: { x: -4.5, y: -43.8, rx: 25.0, ry: 13.8 } },
  mt_boar: { sh: [12.53, -20.13], hp: [-27.55, -19.91], far: [4, -1], l1f: 11.0, l2f: 9.22, l1h: 8.66, l2h: 11.39, footF: 0.87, footH: 0.65, sink: 0.8, neck: { x: 26.33, y: -40.6, a: -1.064, len: 8.88 }, head: { a: 0.661, len: 24.57 }, tail: { x: -30.05, y: -36.94, n: 3, len: 7.85, a: 1.91 }, seat: [-6.0, -48.01], body: { x: -2.6, y: -31.3, rx: 29.7, ry: 17.1 } },
  mt_silva: { sh: [10.84, -30.81], hp: [-16.99, -31.42], far: [4, -1.5], l1f: 14.57, l2f: 16.46, l1h: 14.49, l2h: 22.33, footF: 3.41, footH: -8.35, sink: 1.0, neck: { x: 15.17, y: -49.98, a: -1.342, len: 27.31 }, head: { a: 0.635, len: 14.6 }, tail: { x: -25.65, y: -50.6, n: 1, len: 13.74, a: -2.516 }, seat: [-4.0, -54.0], body: { x: -0.9, y: -45.7, rx: 26.0, ry: 17.9 } },
};
function merge(base, over) {
  if (!over) return base;
  const o = { ...base };
  for (const [k, v] of Object.entries(over)) o[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) ? { ...base[k], ...v } : v;
  return o;
}
/** m → 합쳐진 템플릿 (id · rig 별 캐시) */
export function templateFor(m) {
  const rig = m?.rig ?? m?.def?.rig;
  const base = rig ? TEMPLATES[rig] : null;
  if (!base) return null;
  const id = m?.id ?? '';
  const key = rig + '|' + id;
  let T = MERGED.get(key);
  if (!T) {
    T = merge(base, MOUNT_TUNE[id]);
    const ds = m?.def?.seat;
    if (ds && Number.isFinite(ds.x) && Number.isFinite(ds.y) && !MOUNT_TUNE[id]?.seat) T = { ...T, seat: [ds.x, ds.y] };   // 그림에서 잰 안장이 있으면 그것
    MERGED.set(key, T);
  }
  return T;
}

// ───────────────────────── 도우미 ─────────────────────────
/**
 * 두 마디 IK. 뿌리 (ax, ay) → 목표 (tx, ty), 길이 l1, l2. bend = −1 무릎이 앞(+x)으로, +1 뒤로 (아래를 향한 다리 기준).
 * out = {kx, ky, fx, fy, a1, a2} (닿지 않으면 쭉 편 채로 목표 방향)
 */
export function ik2(ax, ay, tx, ty, l1, l2, bend, out) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const dmax = l1 + l2 - 0.01, dmin = Math.abs(l1 - l2) + 0.01;
  if (d < 1e-6) { dx = 0; dy = 1; d = 1e-6; }
  const dc = clamp(d, dmin, dmax);
  const a = Math.atan2(dy, dx);
  const c = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1);
  const k = a + bend * Math.acos(c);
  out.kx = ax + Math.cos(k) * l1; out.ky = ay + Math.sin(k) * l1;
  out.a1 = k;
  const fx = ax + Math.cos(a) * dc, fy = ay + Math.sin(a) * dc;
  out.a2 = Math.atan2(fy - out.ky, fx - out.kx);
  out.fx = out.kx + Math.cos(out.a2) * l2; out.fy = out.ky + Math.sin(out.a2) * l2;
  return out;
}
/**
 * 발 궤적 (쉴 자리 기준). u = 위상 0..1, duty = 딛는 비율, sweep = 딛는 동안 몸이 나아가는 거리 (= 보폭 × duty, 발이 미끄러지지 않게),
 * lift = 드는 높이. → [dx, dy, up(0..1)]
 */
const FC = [0, 0, 0];
export function footCycle(u, duty, sweep, lift, out = FC) {
  u = ((u % 1) + 1) % 1;
  if (u < duty) { out[0] = sweep * (0.5 - u / duty); out[1] = 0; out[2] = 0; return out; }
  const k = (u - duty) / (1 - duty);
  out[0] = sweep * (-0.5 + smooth(k));
  const s = Math.sin(k * Math.PI);
  out[1] = -lift * s * (0.75 + 0.25 * Math.sin(k * Math.PI * 0.5 + 0.3));
  out[2] = s;
  return out;
}
/** 발걸음 위상 차 (다리 순서: 먼 뒤 · 먼 앞 · 가까운 뒤 · 가까운 앞) */
export const GAIT = {
  walk: [0, 0.25, 0.5, 0.75],          // 4박자 옆걸음 (LH 0, LF .25, RH .5, RF .75)
  trot: [0, 0.5, 0.5, 0],              // 대각선 쌍
  rotary: [0, 0.55, 0.12, 0.45],       // 질주 (LH 0, RH .12, RF .45, LF .55)
  bound: [0, 0.58, 0.08, 0.5],         // 도약 (앞 한 쌍 · 뒤 한 쌍)
};

// ───────────────────────── 공개 API ─────────────────────────
export function mountPose(m, dt) {
  if (!m) return null;
  const T = templateFor(m);
  if (!T) return null;
  let P = m.pose;
  if (!P || P.tpl !== T.name || P.id !== (m.id ?? null) || !P.s) P = newPose(T, m);
  dt = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
  if (T.kind === 'quad' && typeof T.pose !== 'function') quadPose(m, dt, P, T);
  else if (typeof T.pose === 'function') T.pose(m, dt, P, T);
  else return null;
  return P;
}
export function seatOf(pose, out = { x: 0, y: 0, lean: 0 }) {
  out.x = pose?.seat?.x ?? 0;
  out.y = pose?.seat?.y ?? 0;
  out.lean = pose?.seat?.lean ?? 0;
  return out;
}

function newPose(T, m) {
  const leg = () => ({ rx: 0, ry: 0, kx: 0, ky: 0, fx: 0, fy: 0, a1: Math.PI / 2, a2: Math.PI / 2, up: 0 });
  const n = T.tail?.n ?? 4;
  return {
    tpl: T.name, id: m.id ?? null, kind: T.kind, gait: 'stand', t: 0,
    pitch: 0, bob: 0, px: T.hp?.[0] ?? 0, stretch: 1, sq: 0, turnK: 1,
    bx: 0, by: 0, ba: 0,
    legs: [leg(), leg(), leg(), leg()],
    nx: 0, ny: 0, na: 0, hx: 0, hy: 0, ha: 0, jaw: 0, ear: 0, blink: 0, snort: 0, look: 0,
    tx: 0, ty: 0, ta: new Array(n).fill(T.tail?.a ?? 2), tl: T.tail?.len ?? 5, mane: 0,
    seat: { x: 0, y: 0, lean: 0 }, sl: { x: 0, y: 0 },
    paw: 0, dig: 0, howl: 0, charge: 0, hurt: 0, fire: 0,
    s: { na: T.neck?.a ?? -1, nav: 0, ha: T.head?.a ?? 0.5, hav: 0, ta: new Array(n).fill(T.tail?.a ?? 2), tav: new Array(n).fill(0), bob: 0, sq: 0, lastAnim: '', idleSeed: (hashId(m.id) % 97) + 1 },
  };
}
function hashId(s) { let h = 7; s = String(s ?? ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

// 스프링 (임계 감쇠에 가깝게): x → 목표, v 속도
function spring(s, kx, kv, target, dt, k = 90, c = 16) {
  if (dt <= 0) return;
  const a = (target - s[kx]) * k - s[kv] * c;
  s[kv] += a * dt; s[kx] += s[kv] * dt;
}

const _ik = { kx: 0, ky: 0, fx: 0, fy: 0, a1: 0, a2: 0 };
const AIR = new Set(['jump', 'fall', 'flap', 'glide', 'hover', 'dive', 'wall', 'takeoff']);

/**
 * 네발 엔진: 걸음새 · 공중 · 헤엄 · 앞들기 · 비틀거림 · 특수 동작. m 의 필드만 읽는다.
 */
export function quadPose(m, dt, P, T) {
  const S = P.s;
  const a = m.anim ?? 'idle', at = m.animT ?? 0, t = m.t ?? 0;
  const ground = m.onGround !== false && !AIR.has(a);
  const speedK = clamp(m.speedK ?? Math.abs(m.vx ?? 0) / 400, 0, 1.6);
  const run = a === 'run' || a === 'charge' || a === 'flee' || (a === 'turn' && speedK > 0.5);
  const walk = !run && (a === 'walk' || (a === 'turn' && speedK > 0.05));
  const swim = a === 'swim' || (!!m.inWater && !ground);
  const rearK = clamp(m.rearK ?? 0, 0, 1);
  P.t = t;
  // 걸음새 선택
  let gait = 'stand';
  if (swim) gait = 'swim';
  else if (a === 'knocked') gait = 'knocked';
  else if (!ground) gait = 'air';
  else if (rearK > 0.05 || a === 'rear') gait = 'rear';
  else if (run) gait = 'gallop';
  else if (walk) gait = speedK > 0.55 ? 'trot' : 'walk';
  P.gait = gait;
  const ph = m.phase ?? 0;
  const duty = gait === 'gallop' ? T.duty.gallop : gait === 'trot' ? T.duty.trot : T.duty.walk;
  const strideLen = gait === 'gallop' ? 110 : 70;
  const sweep = strideLen * duty * (gait === 'gallop' && T.gallop === 'trot' ? 0.8 : 1);
  const lift = gait === 'gallop' ? T.lift[1] : T.lift[0];
  const offs = gait === 'gallop' ? GAIT[T.gallop === 'trot' ? 'trot' : T.gallop === 'bound' ? 'bound' : 'rotary'] : gait === 'trot' ? GAIT.trot : GAIT.walk;
  // 들썩임 (+ = 아래): 걸음은 두 번 오르내림, 질주는 체공 때 높다
  let bob = 0;
  const cyc = ph * TAU;
  if (gait === 'walk') bob = -Math.abs(Math.sin(cyc * 2)) * T.bob[0] + T.bob[0] * 0.5;
  else if (gait === 'trot') bob = Math.cos(cyc * 4) * T.bob[1] * 0.5;
  else if (gait === 'gallop') bob = Math.sin(cyc + (T.gallop === 'rotary' ? 0.9 : 0.4)) * T.bob[2];
  else if (gait === 'stand') bob = Math.sin(t * 2.2 + S.idleSeed) * 0.6;          // 숨쉬기
  else if (gait === 'swim') bob = 6 + Math.sin(t * 3.2) * 1.5;                      // 물속으로 가라앉음
  else if (gait === 'knocked') bob = 6 * clamp(at / 0.18, 0, 1);
  // 착지 찌그러짐 (land · special 내리찍기)
  let sq = 0;
  if (a === 'land') sq = Math.max(0, 1 - at / 0.22);
  else if (a === 'special' && !rearK) sq = Math.max(0, 1 - at / 0.2) * 0.9;
  S.sq = dt > 0 ? lerp(S.sq, sq, clamp(dt * 30, 0, 1)) : sq;
  bob += S.sq * 5;
  // 몸 기울기: 런타임 pitch (앞들기·공중·피격) + 걸음 흔들림
  let pitch = m.pitch ?? -0.7 * rearK;
  if (gait === 'walk') pitch += Math.sin(cyc * 2) * 0.02;
  else if (gait === 'gallop' && m.pitch == null) pitch += Math.sin(cyc) * 0.07;
  if (gait === 'swim') pitch -= 0.1;
  if (a === 'charge') pitch += 0.035;
  if (a === 'dig') pitch += 0.08 * Math.min(1, at / 0.08);
  if (gait === 'knocked') pitch += 0.12 * clamp(at / 0.2, 0, 1);
  P.pitch = pitch; P.bob = bob; P.sq = S.sq;
  P.turnK = a === 'turn' ? clamp(at / 0.18, 0, 1) : 1;
  P.charge = a === 'charge' ? 1 : 0;
  P.hurt = a === 'hurt' ? Math.max(0, 1 - at / 0.25) : 0;
  P.fire = (a === 'charge' ? 0.6 : 0) + (a === 'special' || a === 'rear' ? 0.5 : 0) + (gait === 'gallop' ? 0.25 : 0);
  // 회전 (뒷발 축) + 들썩임 + 속도 늘임
  const px = T.hp[0], c = Math.cos(pitch), s = Math.sin(pitch);
  const stretch = 1 + (gait === 'gallop' ? T.stretch * (0.5 + 0.5 * Math.sin(cyc * 2)) : 0) + (a === 'charge' ? T.stretch : 0);
  P.px = px; P.stretch = stretch;
  bob += T.sink ?? 0;                                   // 쉴 때 다리를 살짝 굽혀 들썩임 여유를 둔다 (그림 다리는 곧게 펴져 있다)
  const X = (x, y) => px + ((x - px) * stretch) * c - y * s;
  const Y = (x, y) => ((x - px) * stretch) * s + y * c + bob;
  const B = T.body;
  P.bx = X(B.x, B.y); P.by = Y(B.x, B.y); P.ba = pitch;
  // 안장
  const sx0 = T.seat[0], sy0 = T.seat[1];
  P.sl.x = X(sx0, sy0); P.sl.y = Y(sx0, sy0);
  const f = (m.facing ?? 1) < 0 ? -1 : 1;
  P.seat.x = (m.cx ?? 0) + f * P.sl.x; P.seat.y = (m.bottom ?? 0) + P.sl.y;
  P.seat.lean = clamp(pitch * 0.55, -0.45, 0.25) + (gait === 'gallop' ? Math.sin(cyc * 2) * 0.02 : 0);
  // ── 다리 ──
  for (let i = 0; i < 4; i++) {
    const fore = i === 1 || i === 3, near = i >= 2;
    const root = fore ? T.sh : T.hp;
    const rx0 = root[0] + (near ? 0 : T.far[0]), ry0 = root[1] + (near ? 0 : T.far[1]);
    const L = P.legs[i];
    L.rx = X(rx0, ry0); L.ry = Y(rx0, ry0);
    const l1 = fore ? T.l1f : T.l1h, l2 = fore ? T.l2f : T.l2h, len = l1 + l2;
    const restX = rx0 + (fore ? T.footF ?? 1 : T.footH ?? 1.5);
    let tx = restX, ty = 0, up = 0;
    if (gait === 'walk' || gait === 'trot' || gait === 'gallop') {
      const fc = footCycle(ph + offs[i], duty, sweep, lift);
      tx = restX + fc[0]; ty = fc[1]; up = fc[2];
      if (fore && up > 0) tx += up * (gait === 'gallop' ? 6 : 3);          // 앞다리는 들 때 앞으로 뻗는다
    } else if (gait === 'air') {
      const rising = (m.vy ?? 0) < 0;
      if (fore) { tx = L.rx + (rising ? 11 : 10); ty = L.ry + (rising ? len * 0.52 : len * 0.8); }
      else { tx = L.rx + (rising ? -13 : -4); ty = L.ry + (rising ? len * 0.85 : len * 0.62); }
      up = 1;
    } else if (gait === 'swim') {
      const k = (t * 2.6 + i * 0.27 + (fore ? 0 : 0.5)) * TAU;
      tx = L.rx + (fore ? 6 : -4) + Math.cos(k) * 9; ty = L.ry + len * 0.7 + Math.sin(k) * 6;
      up = 1;
    } else if (gait === 'rear') {
      if (fore) {   // 앞발 허우적
        const k = t * 16 + i * 1.7;
        tx = L.rx + 9 + Math.sin(k) * 5 * rearK; ty = L.ry + len * lerp(0.95, 0.5, rearK) + Math.cos(k) * 3 * rearK;
        up = rearK;
      } else { tx = restX + 3 * rearK; ty = 0; }
    } else if (gait === 'knocked') {
      const k = clamp(at / 0.2, 0, 1);
      tx = restX + (fore ? 7 : -3) * k + Math.sin(t * 22 + i) * 2 * (1 - k); ty = 0;
    } else {
      // 서 있기: 무게 옮기기 + 특수 대기 동작
      tx = restX + (i === 0 ? -1 : i === 1 ? 1.5 : 0) + Math.sin(t * 0.9 + i * 1.3) * 0.35;
      ty = 0;
      if (a === 'land' || (a === 'special' && !rearK)) tx = restX + (fore ? 2.5 : -2.5);
      if (a === 'hurt') tx = restX + (fore ? 4 : -3);
    }
    // 대기 특수: 앞발 긁기 (그림메인 · 이그니스) / 땅 파기 (바르그 dig)
    if (i === 3 && (P.paw > 0.01 || a === 'dig')) {
      const k = a === 'dig' ? (at * 18) : (t * 11);
      const amp = a === 'dig' ? 1 : P.paw;
      tx += (Math.sin(k) * 7 - 2) * amp; ty = Math.min(ty, -Math.max(0, Math.cos(k)) * 7 * amp); up = Math.max(up, amp * 0.8);
    }
    ik2(L.rx, L.ry, tx, ty, l1, l2, fore ? -1 : 1, _ik);
    L.kx = _ik.kx; L.ky = _ik.ky; L.fx = _ik.fx; L.fy = _ik.fy; L.a1 = _ik.a1; L.a2 = _ik.a2; L.up = up;
    // 발이 땅 밑으로 들어가지 않게 (닿지 않는 경우 IK 가 목표 방향으로 쭉 뻗는다)
    if (L.fy > 0.5 && ground) { const d = L.fy; L.fy -= d; L.ky -= d * 0.5; }
  }
  // ── 대기 특수 동작 타이머 (결정론적: 시간과 개체 시드) ──
  let paw = 0, snort = 0, look = 0, ear = 0, blink = 0;
  if (gait === 'stand' && a === 'idle') {
    const cycT = 6.5 + (S.idleSeed % 5) * 0.4, u = (t + S.idleSeed) % cycT;
    if (T.name === 'horse' && u < 1.2) paw = Math.sin(clamp(u / 1.2, 0, 1) * Math.PI);        // 앞발 긁기
    const v = (t * 0.37 + S.idleSeed * 0.13) % 1;
    if (v < 0.12) snort = Math.sin(v / 0.12 * Math.PI);                                        // 콧김
    look = Math.sin(t * 0.45 + S.idleSeed) * 0.5 + Math.sin(t * 1.3) * 0.15;
  }
  { const e = (t * 0.83 + S.idleSeed * 0.07) % 3.1; ear = e < 0.25 ? Math.sin(e / 0.25 * Math.PI) : 0; }
  { const b = (t + S.idleSeed * 0.3) % 3.7; blink = b < 0.12 ? Math.sin(b / 0.12 * Math.PI) : 0; }
  P.paw = dt > 0 ? lerp(P.paw, paw, clamp(dt * 8, 0, 1)) : paw;
  P.snort = snort; P.look = look; P.ear = Math.max(ear, a === 'hurt' || a === 'charge' ? 1 : 0); P.blink = blink;
  P.dig = a === 'dig' ? Math.min(1, at / 0.06) : 0;
  P.howl = a === 'howl' ? Math.sin(clamp(at / 0.5, 0, 1) * Math.PI) : 0;
  // ── 목 · 머리 ──
  const N = T.neck, H = T.head;
  let na = N.a, ha = H.a, jaw = 0;
  if (gait === 'walk') na += Math.sin(cyc * 2 + 0.6) * 0.05;
  else if (gait === 'trot') na += Math.sin(cyc * 4) * 0.04;
  else if (gait === 'gallop') { na += 0.22 + Math.sin(cyc + 0.3) * T.pump; ha += Math.sin(cyc + 1.2) * 0.06; }
  else if (gait === 'stand') { na += look * 0.05; ha += Math.sin(t * 0.7 + S.idleSeed) * 0.04; }
  else if (gait === 'air') na += (m.vy ?? 0) < 0 ? -0.1 : 0.12;
  else if (gait === 'swim') { na -= 0.25; ha -= 0.15; }
  if (gait === 'rear') { na -= 0.35 * rearK; ha -= 0.3 * rearK; jaw = 0.6 * rearK; }
  if (a === 'charge') { na += T.name === 'boar' ? 0.25 : 0.42; ha += T.name === 'boar' ? 0.25 : 0.15; jaw = T.name === 'boar' ? 0.3 : 0; }
  if (a === 'hurt') { na -= 0.3 * P.hurt; ha -= 0.25 * P.hurt; jaw = 0.5 * P.hurt; }
  if (a === 'dig') { na += 0.45; ha += 0.45; }
  if (a === 'howl') { na -= 0.55 * P.howl; ha -= 0.75 * P.howl; jaw = 0.8 * P.howl; }
  if (a === 'breath' || a === 'screech') { na -= 0.2; ha -= 0.3; jaw = 0.9; }
  if (a === 'special' && !rearK) { na += 0.15; ha += 0.1; }
  if (a === 'knocked') { na += 0.35 * clamp(at / 0.2, 0, 1); ha += 0.2; }
  if (a === 'turn') { na -= 0.18; }
  if (m.skid) { na -= 0.2; ha -= 0.1; }
  if (P.paw > 0.1) na += 0.1 * P.paw;
  if (dt > 0 && S.lastAnim) { spring(S, 'na', 'nav', na, dt, 140, 20); spring(S, 'ha', 'hav', ha, dt, 160, 22); }
  else { S.na = na; S.ha = ha; S.nav = 0; S.hav = 0; }
  S.lastAnim = a;
  P.jaw = jaw;
  P.nx = X(N.x, N.y); P.ny = Y(N.x, N.y); P.na = S.na + pitch;
  P.hx = P.nx + Math.cos(P.na) * N.len; P.hy = P.ny + Math.sin(P.na) * N.len; P.ha = S.ha + pitch;
  // ── 꼬리 (마디 스프링: 뿌리는 목표를, 나머지는 앞 마디를 따라간다) ──
  const TL = T.tail, n = TL.n;
  P.tx = X(TL.x, TL.y); P.ty = Y(TL.x, TL.y); P.tl = TL.len;
  let base = TL.a;
  if (gait === 'gallop') base += 0.75 + (a === 'charge' ? 0.2 : 0);
  else if (gait === 'trot') base += 0.35;
  else if (gait === 'walk') base += 0.15;
  else if (gait === 'air') base += (m.vy ?? 0) < 0 ? 0.3 : 0.9;
  else if (gait === 'swim') base += 1.0;
  else if (gait === 'rear') base -= 0.25 * rearK;
  if (a === 'hurt') base += 0.5 * P.hurt;
  const sway = gait === 'stand' ? Math.sin(t * 1.6 + S.idleSeed) * 0.12 : Math.sin(t * (gait === 'gallop' ? 9 : 5)) * 0.08;
  for (let k = 0; k < n; k++) {
    const want = (k === 0 ? base + pitch : S.ta[k - 1]) + sway * (0.4 + k * 0.3) + (k > 0 ? 0.06 : 0);
    if (dt > 0) { const kk = 220 - k * 25, cc = 18 - k; const acc = (want - S.ta[k]) * kk - S.tav[k] * cc; S.tav[k] += acc * dt; S.ta[k] += S.tav[k] * dt; }
    else { S.ta[k] = want; S.tav[k] = 0; }
    P.ta[k] = S.ta[k];
  }
  P.mane = clamp(speedK * 0.8 + (gait === 'air' ? 0.4 : 0) + (a === 'charge' ? 0.3 : 0), 0, 1);
  return P;
}
