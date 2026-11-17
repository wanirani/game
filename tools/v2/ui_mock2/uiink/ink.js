// 「먹과 달빛」 붓 엔진 + 아이콘.
// 전부 Canvas 2D 호출뿐이다(필터는 번짐 한 번) → 게임에서는 시작할 때(또는 빌드 때) 한 번 구워 스프라이트로 쓴다.
// 좌표는 100×100 칸. 획 = 스플라인 + 굵기 곡선 + 붓털(마른 붓 자국) + 먹 번짐 + 튄 먹.
export const INK = '#f3f1ea', CRIM = '#e8283f', GOLD = '#e8c56c';

export const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const vnoise = (seed) => { const r = rng(seed), tab = Array.from({ length: 256 }, r); return (x) => { const i = Math.floor(x), f = x - i, a = tab[i & 255], b = tab[(i + 1) & 255]; return a + (b - a) * f * f * (3 - 2 * f); }; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// 굵기 곡선: t = 0(붓을 댄 곳) → 1(뗀 곳)
const PROF = {
  press: (t) => (0.55 + 0.45 * sm(0, 0.1, t)) * (1 - 0.82 * sm(0.5, 1, t)),   // 눌러 시작해 마르며 빠진다
  taper: (t) => 0.08 + 0.92 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.8),   // 초승달 베기
  even: (t) => 0.78 + 0.22 * sm(0, 0.12, t) - 0.3 * sm(0.86, 1, t),
  limb: (t) => 1 - 0.5 * t,
  swell: (t) => 0.35 + 0.65 * sm(0, 0.8, t),
};

function sample(pts, step, closed) {
  const n = pts.length, get = (i) => { const p = closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]; return p; };
  const out = [], segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2), m = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < m; k++) { const t = k / m, t2 = t * t, t3 = t2 * t, c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3); out.push({ x: c(p0[0], p1[0], p2[0], p3[0]), y: c(p0[1], p1[1], p2[1], p3[1]) }); }
  }
  if (!closed) out.push({ x: pts[n - 1][0], y: pts[n - 1][1] });
  let L = 0; out[0].s = 0;
  for (let i = 1; i < out.length; i++) { L += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y); out[i].s = L; }
  for (let i = 0; i < out.length; i++) { const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; out[i].tx = (b.x - a.x) / d; out[i].ty = (b.y - a.y) / d; out[i].nx = -out[i].ty; out[i].ny = out[i].tx; out[i].t = L ? out[i].s / L : 0; }
  return { S: out, L };
}

// 붓 한 획. o: w 굵기 · p 굵기 곡선 · dry 마름(0–1) · ds 마르기 시작하는 곳 · c 색 · a 불투명 · sp 튄 먹 개수 · cut 파내기
export function stroke(ctx, pts, o = {}) {
  const w = o.w ?? 5, prof = typeof o.p === 'function' ? o.p : PROF[o.p || 'press'], dry = o.dry ?? 0.55, seed = o.seed ?? hash(JSON.stringify(pts));
  const r = rng(seed), nz = vnoise(seed + 11), { S, L } = sample(pts, 0.7);
  ctx.save(); ctx.fillStyle = ctx.strokeStyle = o.c || INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.globalAlpha = o.a ?? 1;
  if (o.cut) ctx.globalCompositeOperation = 'destination-out';
  // 1) 먹이 진한 몸통
  const bodyEnd = 1 - dry * 0.5, le = [], ri = [];
  for (const q of S) { if (q.t > bodyEnd) break; const hw = 0.5 * w * prof(q.t) * (1 - sm(bodyEnd - 0.25, bodyEnd, q.t)) * (0.86 + 0.14 * nz(q.s * 0.5)); le.push([q.x + q.nx * hw, q.y + q.ny * hw]); ri.push([q.x - q.nx * hw, q.y - q.ny * hw]); }
  if (le.length > 1) { ctx.beginPath(); ctx.moveTo(le[0][0], le[0][1]); for (const p of le) ctx.lineTo(p[0], p[1]); for (let i = ri.length - 1; i >= 0; i--) ctx.lineTo(ri[i][0], ri[i][1]); ctx.closePath(); ctx.fill(); const h0 = 0.5 * w * prof(0) * 0.9; ctx.beginPath(); ctx.arc(S[0].x, S[0].y, h0, 0, 7); ctx.fill();
    if (!o.cut && w >= 6) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; const M = Math.round(w / 3.2); for (let i = 0; i < M; i++) { const u = (r() * 2 - 1) * 0.8, ph = r() * 999; ctx.globalAlpha = 0.3 + r() * 0.5; ctx.lineWidth = 0.3 + r() * 0.5; let pen = false; ctx.beginPath(); for (const q of S) { if (q.t > bodyEnd) break; const on = q.t > 0.16 && nz(ph + q.s * 0.2) > 0.52 - 0.3 * q.t; const off = u * w * prof(q.t) * 0.5, x = q.x + q.nx * off, y = q.y + q.ny * off; if (on) { if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); } else pen = false; } ctx.stroke(); } ctx.restore(); } }
  // 2) 붓털: 끝으로 갈수록, 가장자리일수록 먹이 끊긴다(비백)
  const N = Math.max(4, Math.min(28, Math.round(w * 1.8)));
  for (let i = 0; i < N; i++) {
    const u = (i / (N - 1)) * 2 - 1, ph = r() * 999, lw = (w / N) * (1.25 + r() * 0.9), bias = 0.5 + 0.5 * Math.abs(u), wob = (r() - 0.5) * 0.12, last = 0.9 + r() * 0.1;
    let pen = false; ctx.beginPath();
    for (const q of S) {
      const W = w * prof(q.t), g = dry * sm(o.ds ?? 0.28, 1, q.t) * bias * 1.3, on = q.t <= last && nz(ph + q.s * 0.38) > g;
      const off = (u * 0.94 + wob * Math.sin(q.s * 0.31 + ph)) * W * 0.5, x = q.x + q.nx * off, y = q.y + q.ny * off;
      if (on) { if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); } else pen = false;
    }
    ctx.lineWidth = Math.max(0.35, lw * 0.62); ctx.stroke();
  }
  // 3) 튄 먹
  if (o.sp) { const e = S[S.length - 1], ang = Math.atan2(e.ty, e.tx); for (let k = 0; k < o.sp; k++) { const d = 1.5 + r() * (w * 0.9 + 6), a = ang + (r() - 0.5) * 1.3, rad = 0.35 + r() * r() * (o.spr ?? 1.5); ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, rad, 0, 7); ctx.fill(); } }
  ctx.restore();
}

// 채운 면(먹을 넓게 바른 곳). o.sharp 직선 다각형 · o.streak 붓결 각도(도) · o.a 불투명
export function shape(ctx, pts, o = {}) {
  const seed = o.seed ?? hash(JSON.stringify(pts)), r = rng(seed);
  ctx.save(); ctx.fillStyle = ctx.strokeStyle = o.c || INK; ctx.globalAlpha = o.a ?? 1;
  if (o.cut) ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  if (o.sharp) { pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); } else { const { S } = sample(pts, 1.2, true); S.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); }
  ctx.closePath(); ctx.fill();
  if (o.streak != null) {
    ctx.clip(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round';
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.75, an = o.streak * Math.PI / 180, dx = Math.cos(an), dy = Math.sin(an);
    for (let k = 0; k < (o.n ?? 16); k++) { const off = (r() * 2 - 1) * R, a0 = (r() * 2 - 1) * R, len = R * (0.3 + r() * 0.9); ctx.globalAlpha = 0.18 + r() * 0.5; ctx.lineWidth = 0.35 + r() * 1.1; ctx.beginPath(); ctx.moveTo(cx - dy * off + dx * a0, cy + dx * off + dy * a0); ctx.lineTo(cx - dy * off + dx * (a0 + len), cy + dx * off + dy * (a0 + len)); ctx.stroke(); }
  }
  ctx.restore();
}
const ell = (cx, cy, rx, ry, rot = 0, n = 14, seed = 1) => { const r = rng(seed + cx * 7 + cy * 13), c = Math.cos(rot * Math.PI / 180), s = Math.sin(rot * Math.PI / 180); return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, j = 0.94 + r() * 0.12, x = Math.cos(a) * rx * j, y = Math.sin(a) * ry * j; return [cx + x * c - y * s, cy + x * s + y * c]; }); };
const arc = (cx, cy, rad, a0, a1, n = 9) => Array.from({ length: n }, (_, i) => { const a = (a0 + (a1 - a0) * i / (n - 1)) * Math.PI / 180; return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]; });

// 아이콘 정의에 쓰는 붓 묶음
function kit(ctx, name) {
  let i = 0; const sd = () => hash(name) + (i++) * 977;
  const k = {
    S: (pts, o = {}) => stroke(ctx, pts, { seed: sd(), ...o }),
    F: (pts, o = {}) => shape(ctx, pts, { seed: sd(), ...o }),
    B: (cx, cy, rx, ry = rx, o = {}) => shape(ctx, ell(cx, cy, rx, ry, o.rot || 0, 14, sd()), o),
    A: (cx, cy, rad, a0, a1, o = {}) => stroke(ctx, arc(cx, cy, rad, a0, a1, o.n || 9), { seed: sd(), ...o }),
    head: (x, y, tail, r0 = 6) => { k.B(x, y, r0, r0 * 1.08); if (tail) k.S(tail, { w: 3.6, p: 'press', dry: 0.8 }); },
    tip: (x, y, deg, s = 7, o = {}) => { const a = deg * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a); k.F([[x + c * s, y + sn * s], [x - sn * s * 0.62 - c * s * 0.35, y + c * s * 0.62 - sn * s * 0.35], [x + sn * s * 0.62 - c * s * 0.35, y - c * s * 0.62 - sn * s * 0.35]], { sharp: 1, ...o }); },
    rot: (deg, cx, cy, fn) => { ctx.save(); ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180); ctx.translate(-cx, -cy); fn(); ctx.restore(); },
    ctx,
  };
  return k;
}
const C = { c: CRIM }, G = { c: GOLD };

// ── 아이콘 ──────────────────────────────────────────────────────────────
export const ICONS = {
  // 공격: 길게 찌르며 크게 베는 사냥꾼 + 초승달 베기 획
  attack(k) {
    k.S([[18,36],[48,10],[84,16],[93,54],[80,90]], { w: 10, p: 'taper', dry: 0.5, a: 0.2 });
    k.S([[26,20],[56,7],[84,20],[92,52],[74,86]], { w: 17, p: 'taper', dry: 0.8, ds: 0.35, sp: 7 });
    k.S([[40,22],[60,16],[78,28],[82,52],[72,72]], { w: 3.4, p: 'taper', dry: 0.3, ...C });
    k.S([[36,56],[22,62],[6,58]], { w: 10, dry: 0.9 });                       // 외투 자락
    k.S([[40,48],[37,56],[32,64]], { w: 12, p: 'even', dry: 0.1 });            // 몸통
    k.S([[32,64],[47,71],[49,88]], { w: 6.5, p: 'limb', dry: 0.2 }); k.S([[49,88],[58,89]], { w: 4, dry: 0.3 });
    k.S([[30,64],[19,76],[6,86]], { w: 6.5, p: 'limb', dry: 0.5 });
    k.S([[42,49],[54,45],[63,39]], { w: 5.5, p: 'limb', dry: 0.1 });
    k.S([[60,41],[74,31],[87,22]], { w: 3, p: 'even', dry: 0.15 });
    k.head(38, 41, [[34,39],[24,34],[13,38]]);
  },
  // 점프: 무릎을 접고 솟는 사냥꾼, 아래로 흩날리는 자락, 뒤의 초승달
  jump(k) {
    k.S([[50,96],[46,78],[50,58]], { w: 26, p: 'taper', dry: 0.6, a: 0.16 });
    k.A(64, 34, 30, -78, 62, { w: 6.5, p: 'taper', dry: 0.5, a: 0.85 });
    k.S([[45,50],[35,66],[28,90]], { w: 10, dry: 0.9, sp: 4 }); k.S([[52,50],[58,68],[62,88]], { w: 8, dry: 0.9 });
    k.S([[49,31],[50,41],[48,51]], { w: 12, p: 'even', dry: 0.1 });
    k.S([[50,33],[60,25],[67,12]], { w: 5.5, p: 'limb', dry: 0.25 }); k.S([[47,33],[37,27],[28,18]], { w: 5.5, p: 'limb', dry: 0.25 });
    k.S([[49,51],[62,56],[56,68]], { w: 6.5, p: 'limb', dry: 0.2 }); k.S([[46,51],[38,61],[46,71]], { w: 6.5, p: 'limb', dry: 0.2 });
    k.head(48, 24, [[45,27],[39,34],[38,44]]);
    k.S([[18,95],[50,90],[84,95]], { w: 4, p: 'taper', dry: 0.5, ...C });
  },
  // 대시: 낮게 파고드는 사냥꾼 + 뒤로 끌리는 바람 획
  dash(k) {
    k.S([[62,60],[36,62],[8,58]], { w: 24, p: 'press', dry: 0.85, a: 0.15 });
    k.S([[52,20],[30,19],[6,22]], { w: 4.5, dry: 0.95 }); k.S([[60,88],[36,87],[10,90]], { w: 4.5, dry: 0.95 });
    k.S([[44,32],[28,31],[12,33]], { w: 3.4, dry: 0.7, ...C });
    k.S([[54,49],[36,50],[10,44]], { w: 11, dry: 0.95, sp: 3 });
    k.S([[66,41],[58,48],[50,55]], { w: 12, p: 'even', dry: 0.1 });
    k.S([[50,55],[63,64],[58,80]], { w: 6.5, p: 'limb', dry: 0.2 }); k.S([[58,80],[67,82]], { w: 4, dry: 0.3 });
    k.S([[48,56],[35,62],[20,72]], { w: 6.5, p: 'limb', dry: 0.5 });
    k.S([[64,44],[75,50],[84,45]], { w: 5.5, p: 'limb', dry: 0.2 }); k.S([[60,43],[50,38],[42,42]], { w: 5, p: 'limb', dry: 0.3 });
    k.head(69, 35, [[65,33],[55,30],[44,33]]);
  },
  // 막기: 버티고 선 사냥꾼, 세운 검, 앞을 감싸는 큰 호
  guard(k) {
    k.S([[76,6],[95,30],[95,64],[78,93]], { w: 7, p: 'taper', dry: 0.5, a: 0.22 });
    k.S([[66,6],[90,26],[92,62],[70,92]], { w: 15, p: 'taper', dry: 0.7, ds: 0.4, sp: 4 });
    k.S([[70,22],[80,46],[72,74]], { w: 3.2, p: 'taper', dry: 0.3, ...C });
    k.S([[37,42],[26,60],[18,84]], { w: 10, dry: 0.9 });
    k.S([[40,33],[41,45],[40,56]], { w: 13, p: 'even', dry: 0.1 });
    k.S([[39,56],[31,70],[27,90]], { w: 6.5, p: 'limb', dry: 0.25 }); k.S([[43,56],[51,70],[55,90]], { w: 6.5, p: 'limb', dry: 0.25 });
    k.S([[43,37],[53,41],[60,46]], { w: 5.5, p: 'limb', dry: 0.1 });
    k.S([[62,14],[62,44],[61,72]], { w: 3.4, p: 'even', dry: 0.2 }); k.S([[55,50],[69,50]], { w: 3, p: 'even', dry: 0.1 });
    k.head(39, 25, [[36,27],[30,34],[27,43]]);
  },
  // 조준: 맹수의 눈 + 네 방향 눈금
  lock(k) {
    k.S([[18,52],[36,35],[62,33],[82,50]], { w: 8, p: 'taper', dry: 0.5 }); k.S([[18,52],[40,66],[64,64],[82,50]], { w: 5.5, p: 'taper', dry: 0.5 });
    k.A(50, 49.5, 11, -200, 150, { w: 3, p: 'even', dry: 0.3, n: 12 });
    k.B(50, 49.5, 3.6, 9.5, C);
    k.S([[50,3],[50,18]], { w: 5, dry: 0.5 }); k.S([[50,97],[50,82]], { w: 5, dry: 0.5 }); k.S([[3,50],[13,50]], { w: 5, dry: 0.5 }); k.S([[97,50],[87,50]], { w: 5, dry: 0.5 });
  },
  // 교대: 엇갈린 검과 단검 + 서로 쫓는 두 화살 획
  swap(k) {
    k.A(50, 50, 40, 200, 330, { w: 7, p: 'press', dry: 0.5, n: 10 }); k.tip(86.5, 31, 62, 9);
    k.A(50, 50, 40, 20, 150, { w: 7, p: 'press', dry: 0.5, n: 10, ...C }); k.tip(13.5, 69, 242, 9, C);
    k.S([[28,72],[50,50],[72,28]], { w: 5, p: 'even', dry: 0.15 }); k.S([[32,58],[42,68]], { w: 3.4, p: 'even', dry: 0.1 });
    k.S([[70,70],[54,54],[40,40]], { w: 4.4, p: 'limb', dry: 0.2 }); k.S([[58,68],[68,58]], { w: 3.4, p: 'even', dry: 0.1 });
  },
  // 탑승: 달리는 말과 사냥꾼
  mount(k) {
    k.S([[60,92],[30,90],[4,84]], { w: 12, p: 'press', dry: 0.85, a: 0.18 });
    k.S([[30,50],[16,44],[3,54]], { w: 8, dry: 0.95, sp: 3 });
    k.S([[30,55],[50,50],[68,54]], { w: 16, p: 'even', dry: 0.1 });
    k.S([[66,52],[76,40],[82,29]], { w: 10, p: 'limb', dry: 0.1 }); k.S([[81,28],[90,33],[96,41]], { w: 6.5, p: 'limb', dry: 0.15 });
    k.S([[80,24],[82,18]], { w: 3, dry: 0.2 });
    k.S([[82,30],[72,34],[62,42]], { w: 4.5, dry: 0.8 });
    k.S([[68,58],[81,64],[92,59]], { w: 5, p: 'limb', dry: 0.35 }); k.S([[63,60],[70,74],[65,88]], { w: 5, p: 'limb', dry: 0.35 });
    k.S([[32,58],[21,69],[7,67]], { w: 5.5, p: 'limb', dry: 0.4 }); k.S([[37,60],[35,75],[26,88]], { w: 5, p: 'limb', dry: 0.35 });
    k.S([[52,30],[50,40],[49,48]], { w: 9.5, p: 'even', dry: 0.1 }); k.S([[54,34],[62,40],[71,42]], { w: 4.2, p: 'limb', dry: 0.2 });
    k.S([[50,30],[38,27],[24,20]], { w: 5, dry: 0.8, ...C });
    k.head(53, 22, null, 5.4);
  },
  // 기술 1 「채찍 감기」: 채찍이 크게 감겨 나간다
  s1(k) {
    k.S([[46,40],[58,16],[82,12],[95,40],[88,70],[60,76]], { w: 7, p: 'taper', dry: 0.5, a: 0.18 });
    k.S([[40,44],[54,26],[78,20],[92,40],[84,64],[62,68],[51,54],[60,41],[73,44]], { w: 7, p: 'limb', dry: 0.35, ds: 0.6, sp: 5 });
    k.S([[66,33],[80,36],[82,50]], { w: 2.6, p: 'taper', dry: 0.3, ...C }); k.B(74, 45, 2.6, 2.6, C);
    k.S([[21,62],[12,74],[5,88]], { w: 8, dry: 0.9 });
    k.S([[24,56],[25,66],[24,75]], { w: 11, p: 'even', dry: 0.1 });
    k.S([[23,75],[16,86],[12,96]], { w: 6, p: 'limb', dry: 0.3 }); k.S([[26,75],[33,86],[37,96]], { w: 6, p: 'limb', dry: 0.3 });
    k.S([[26,58],[34,51],[40,44]], { w: 5, p: 'limb', dry: 0.1 });
    k.head(23, 49, [[20,50],[14,54],[10,61]], 5.4);
  },
  // 기술 2 「세 갈래 베기」: 발톱 자국 같은 세 획
  s2(k) {
    k.S([[8,52],[28,28],[54,13],[82,6]], { w: 8, p: 'taper', dry: 0.6, a: 0.2 });
    k.S([[10,66],[34,38],[62,20],[92,12]], { w: 13, p: 'taper', dry: 0.75, ds: 0.4, sp: 4 });
    k.S([[14,82],[42,58],[70,44],[96,40]], { w: 14, p: 'taper', dry: 0.75, ds: 0.4, sp: 5, ...C });
    k.S([[24,95],[52,78],[76,70],[96,69]], { w: 12, p: 'taper', dry: 0.75, ds: 0.4, sp: 4 });
  },
  // 기술 3 「종 울림」: 흔들리는 교회 종과 퍼지는 울림
  s3(k) {
    k.B(50, 46, 30, 30, { a: 0.1 });
    k.A(50, 50, 44, 150, 210, { w: 6, p: 'taper', dry: 0.5, n: 7 }); k.A(50, 50, 44, -30, 30, { w: 6, p: 'taper', dry: 0.5, n: 7 });
    k.A(50, 50, 33, 160, 200, { w: 3.6, p: 'taper', dry: 0.4, n: 6, a: 0.8 }); k.A(50, 50, 33, -20, 20, { w: 3.6, p: 'taper', dry: 0.4, n: 6, a: 0.8 });
    k.rot(-14, 50, 22, () => {
      k.F([[50,20],[58,23],[62,40],[66,56],[74,65],[50,69],[26,65],[34,56],[38,40],[42,23]], { streak: 80, n: 12 });
      k.S([[24,66],[50,71],[76,66]], { w: 4.5, p: 'even', dry: 0.2, ...G });
      k.A(50, 15, 5, 150, 390, { w: 3, p: 'even', dry: 0.1, n: 8 });
      k.B(50, 78, 4.6, 4.6, C);
    });
  },
  // 궁극기: 붉은 달 앞으로 뛰어오른 사냥꾼
  ult(k) {
    k.A(52, 48, 42, -200, 150, { w: 4, p: 'taper', dry: 0.5, a: 0.3, n: 16, c: CRIM });
    k.B(52, 48, 37, 37, { ...C, streak: 18, n: 26, a: 0.95 });
    k.S([[6,78],[38,86],[94,74]], { w: 7, p: 'taper', dry: 0.8, a: 0.9 });
    k.S([[45,52],[33,60],[20,76]], { w: 9.5, dry: 0.9, sp: 3 });
    k.S([[50,40],[48,49],[44,57]], { w: 11.5, p: 'even', dry: 0.1 });
    k.S([[44,57],[53,66],[47,78]], { w: 6.2, p: 'limb', dry: 0.25 }); k.S([[42,57],[33,62],[23,59]], { w: 6.2, p: 'limb', dry: 0.3 });
    k.S([[51,41],[58,32],[61,24]], { w: 5.2, p: 'limb', dry: 0.1 });
    k.S([[58,27],[70,14],[82,3]], { w: 3.4, p: 'even', dry: 0.25 });
    k.head(50, 33, [[46,34],[40,38],[36,45]], 5.6);
  },
  // 지도: 양끝을 만 두루마리, 길과 탑, 붉은 표
  map(k) {
    k.F([[17,27],[50,22],[83,28],[84,72],[50,78],[17,71]], { a: 0.26 });
    k.S([[18,26],[50,21],[82,27]], { w: 3.4, p: 'even', dry: 0.3 }); k.S([[18,72],[50,79],[82,73]], { w: 3.4, p: 'even', dry: 0.3 });
    k.S([[15,16],[13,48],[16,82]], { w: 8, p: 'even', dry: 0.25 }); k.S([[85,18],[88,50],[85,82]], { w: 8, p: 'even', dry: 0.25 });
    k.S([[28,64],[38,52],[50,58],[60,46]], { w: 2.8, p: 'even', dry: 0.5 });
    k.S([[34,34],[34,44]], { w: 4.5, p: 'even', dry: 0.1 }); k.tip(34, 31, -90, 5);
    k.B(66, 40, 4.6, 4.6, C); k.S([[60,34],[72,46]], { w: 2, p: 'even', dry: 0.1, ...C }); k.S([[72,34],[60,46]], { w: 2, p: 'even', dry: 0.1, ...C });
  },
  // 가방: 덮개와 죔쇠가 있는 사냥꾼의 가죽 가방
  bag(k) {
    k.S([[32,38],[36,16],[64,16],[68,38]], { w: 5.5, p: 'even', dry: 0.3 });
    k.F([[21,40],[79,40],[85,82],[50,88],[15,82]], { a: 0.3 });
    k.S([[21,40],[15,82],[50,88],[85,82],[79,40]], { w: 4.2, p: 'even', dry: 0.3 });
    k.F([[19,38],[81,38],[74,60],[50,67],[26,60]], { streak: 8, n: 10 });
    k.S([[50,58],[50,76]], { w: 5, p: 'even', dry: 0.1, ...G }); k.B(50, 72, 4, 4, { c: GOLD });
  },
  // 메뉴: 사냥 수첩 (책등 · 죔쇠 · 초승달 문장 · 책갈피)
  menu(k) {
    k.F([[28,14],[78,16],[78,84],[28,86]], { a: 0.3, sharp: 1 });
    k.S([[30,14],[78,16]], { w: 3.6, p: 'even', dry: 0.3 }); k.S([[78,16],[78,84]], { w: 3.6, p: 'even', dry: 0.3 }); k.S([[78,84],[30,86]], { w: 3.6, p: 'even', dry: 0.3 });
    k.S([[26,10],[25,50],[26,90]], { w: 9, p: 'even', dry: 0.2 });
    k.A(57, 44, 12, 60, 300, { w: 5, p: 'taper', dry: 0.3, n: 10, ...C });
    k.S([[78,50],[88,50]], { w: 5, p: 'even', dry: 0.1, ...G });
    k.S([[62,86],[64,97]], { w: 4, dry: 0.4, ...C });
    k.S([[36,68],[68,68]], { w: 2.2, p: 'even', dry: 0.5 });
  },
  // 자동: 스스로 도는 붓 고리 + 가운데 엇갈린 두 검
  auto(k) {
    k.A(50, 50, 38, -60, 250, { w: 8.5, p: 'press', dry: 0.7, ds: 0.5, n: 14 }); k.tip(72, 15.5, -150, 10);
    k.S([[36,64],[50,50],[64,36]], { w: 4.6, p: 'even', dry: 0.15 }); k.S([[36,36],[50,50],[64,64]], { w: 4.6, p: 'even', dry: 0.15 });
    k.B(50, 50, 3.4, 3.4, C);
  },
  // 임무 · 표식: 창에 단 붉은 깃발
  quest(k) {
    k.S([[32,12],[32,50],[33,92]], { w: 4.6, p: 'even', dry: 0.25 }); k.tip(32, 9, -90, 6);
    k.F([[35,16],[86,24],[62,36],[84,48],[35,50]], { ...C, streak: 12, n: 14, sharp: 1 });
    k.S([[16,93],[34,91],[56,93]], { w: 4, p: 'taper', dry: 0.5 });
  },
  // ── 물건 · 곁들이 ──
  potion(k) {
    k.F([[42,40],[58,40],[74,70],[66,86],[34,86],[26,70]], { ...C, a: 0.9, streak: 0, n: 8 });
    k.S([[43,14],[43,38],[25,70],[34,87],[66,87],[75,70],[57,38],[57,14]], { w: 4, p: 'even', dry: 0.2 });
    k.S([[38,13],[62,13]], { w: 5, p: 'even', dry: 0.1 });
  },
  fang(k) { k.F([[30,14],[58,12],[70,28],[62,56],[44,90],[40,60],[28,36]], { streak: 70, n: 10 }); k.S([[28,14],[60,11]], { w: 5, p: 'even', dry: 0.2, ...C }); },
  skull(k) {
    k.F([[22,40],[30,18],[50,11],[70,18],[78,40],[74,58],[64,64],[62,80],[38,80],[36,64],[26,58]], { streak: 75, n: 8 });
    k.B(39, 43, 7, 8, { cut: 1 }); k.B(61, 43, 7, 8, { cut: 1 }); k.F([[50,54],[54,62],[46,62]], { cut: 1, sharp: 1 });
    k.S([[44,70],[44,80]], { w: 2, cut: 1, p: 'even', dry: 0 }); k.S([[50,70],[50,80]], { w: 2, cut: 1, p: 'even', dry: 0 }); k.S([[56,70],[56,80]], { w: 2, cut: 1, p: 'even', dry: 0 });
    k.B(39, 43, 2.4, 2.4, C); k.B(61, 43, 2.4, 2.4, C);
  },
  coin(k) { k.A(50, 50, 34, 0, 360, { w: 7, p: 'even', dry: 0.3, n: 16, ...G }); k.F([[42,42],[58,42],[58,58],[42,58]], { sharp: 1, ...G }); },
  moon(k) { k.F([[62,10],[40,22],[30,46],[38,72],[62,88],[84,82],[60,70],[50,48],[56,26],[74,14]], { ...C, streak: 60, n: 10 }); },
  whip(k) { k.S([[20,84],[32,72]], { w: 9, p: 'even', dry: 0.1 }); k.S([[32,72],[40,50],[62,38],[80,50],[76,68],[60,70],[54,58],[62,52]], { w: 6, p: 'limb', dry: 0.4, sp: 3 }); k.S([[17,87],[23,81]], { w: 10, p: 'even', dry: 0, ...G }); },
  helm(k) { k.F([[20,62],[24,34],[50,16],[76,34],[80,62],[62,62],[60,50],[40,50],[38,62]], { streak: 80, n: 8 }); k.S([[50,16],[50,4]], { w: 4, dry: 0.4, ...C }); k.S([[18,66],[40,66]], { w: 4, p: 'even', dry: 0.2 }); k.S([[60,66],[82,66]], { w: 4, p: 'even', dry: 0.2 }); },
  armor(k) { k.F([[30,14],[50,24],[70,14],[88,30],[76,42],[76,86],[24,86],[24,42],[12,30]], { streak: 85, n: 10, sharp: 1 }); k.S([[50,26],[50,84]], { w: 2.4, cut: 1, p: 'even', dry: 0 }); k.S([[34,54],[44,54]], { w: 3, p: 'even', dry: 0, ...G }); k.S([[56,54],[66,54]], { w: 3, p: 'even', dry: 0, ...G }); },
  pauldron(k) { k.A(50, 66, 36, 180, 360, { w: 9, p: 'even', dry: 0.3, n: 12 }); k.A(50, 66, 23, 190, 350, { w: 6, p: 'even', dry: 0.4, n: 10 }); k.S([[14,70],[86,70]], { w: 6, p: 'even', dry: 0.2 }); k.tip(50, 24, -90, 8, C); },
  boot(k) { k.F([[32,12],[56,12],[56,56],[84,70],[86,86],[32,86]], { streak: 85, n: 9, sharp: 1 }); k.S([[30,90],[88,90]], { w: 4.5, p: 'even', dry: 0.3 }); k.S([[34,26],[54,26]], { w: 3, cut: 1, p: 'even', dry: 0 }); k.S([[34,36],[54,36]], { w: 3, p: 'even', dry: 0, ...G }); },
  ring(k) { k.A(50, 60, 24, 0, 360, { w: 7.5, p: 'even', dry: 0.3, n: 16 }); k.F([[50,10],[62,24],[50,38],[38,24]], { sharp: 1, ...C }); },
  herb(k) { k.S([[50,92],[50,60],[52,36]], { w: 4.5, p: 'limb', dry: 0.3 }); k.F([[48,62],[30,60],[16,40],[36,40]], { streak: 30, n: 6 }); k.F([[52,44],[58,24],[80,12],[76,34]], { streak: -40, n: 6 }); k.B(54, 30, 2.6, 2.6, C); },
  key(k) { k.A(34, 32, 14, 0, 360, { w: 6.5, p: 'even', dry: 0.2, n: 14, ...G }); k.S([[44,42],[82,82]], { w: 6, p: 'even', dry: 0.2 }); k.S([[66,66],[76,56]], { w: 4.5, p: 'even', dry: 0.2 }); k.S([[76,76],[86,66]], { w: 4.5, p: 'even', dry: 0.2 }); },
  bone(k) { k.S([[30,70],[70,30]], { w: 9, p: 'even', dry: 0.3 }); k.B(24, 68, 7); k.B(32, 76, 7); k.B(68, 24, 7); k.B(76, 32, 7); },
  gem(k) { k.F([[30,18],[70,18],[90,42],[50,90],[10,42]], { sharp: 1, a: 0.32 }); k.S([[30,18],[70,18],[90,42],[50,90],[10,42],[30,18]].map((p) => p), { w: 4, p: 'even', dry: 0.2 }); k.S([[10,42],[90,42]], { w: 3, p: 'even', dry: 0.3 }); k.S([[38,42],[50,88]], { w: 2.4, p: 'even', dry: 0.3 }); k.S([[62,42],[50,88]], { w: 2.4, p: 'even', dry: 0.3 }); k.B(50, 30, 4, 4, C); },
  x(k) { k.S([[22,22],[78,78]], { w: 9, dry: 0.6 }); k.S([[78,22],[22,78]], { w: 9, dry: 0.6 }); },
  padlock(k) { k.A(50, 42, 17, 180, 360, { w: 7, p: 'even', dry: 0.1, n: 10 }); k.F([[24,44],[76,44],[76,86],[24,86]], { sharp: 1 }); k.B(50, 62, 5, 7, { cut: 1 }); },
  next(k) { k.S([[24,34],[50,62],[76,34]], { w: 10, p: 'taper', dry: 0.4 }); },
};

// ── 구워 내기 ──────────────────────────────────────────────────────────────
const cache = new Map();
export function iconCanvas(name, px = 192) {
  const key = name + '@' + px; if (cache.has(key)) return cache.get(key);
  const layer = document.createElement('canvas'); layer.width = layer.height = px;
  const lc = layer.getContext('2d'); lc.scale(px / 100, px / 100);
  (ICONS[name] || ICONS.x)(kit(lc, name));
  const out = document.createElement('canvas'); out.width = out.height = px; const oc = out.getContext('2d');
  oc.filter = `blur(${(px * 0.07).toFixed(2)}px)`; oc.globalAlpha = 0.26; oc.drawImage(layer, 0, 0);   // 넓은 달빛 번짐
  oc.filter = `blur(${(px * 0.02).toFixed(2)}px)`; oc.globalAlpha = 0.5; oc.drawImage(layer, 0, 0);   // 가까운 먹 번짐
  oc.filter = 'none'; oc.globalAlpha = 1; oc.drawImage(layer, 0, 0);
  cache.set(key, out); return out;
}
export const iconURL = (name, px = 192) => iconCanvas(name, px).toDataURL('image/png');

// 재질용 붓 자국: 가로로 긴 한 획(막대 · 밑줄 · 이름표), 붓 고리(엔소), 먹 얼룩
export function strokeSprite(w, h, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const k = h / 20; x.scale(k, k); const W = w / k;
  const layer = document.createElement('canvas'); layer.width = w; layer.height = h; const lc = layer.getContext('2d'); lc.scale(k, k);
  stroke(lc, [[5, 10.5], [W * 0.3, 9.5], [W * 0.7, 10.6], [W - 4, 9.8]], { w: o.w ?? 15, p: o.p || ((t) => (0.62 + 0.38 * sm(0, 0.04, t)) * (1 - 0.5 * sm(0.72, 1, t))), dry: o.dry ?? 0.65, ds: o.ds ?? 0.78, c: o.c || INK, seed: o.seed ?? 5, sp: o.sp ?? 0 });
  x.setTransform(1, 0, 0, 1, 0, 0); x.filter = `blur(${(h * 0.05).toFixed(2)}px)`; x.globalAlpha = 0.45; x.drawImage(layer, 0, 0); x.filter = 'none'; x.globalAlpha = 1; x.drawImage(layer, 0, 0);
  return c;
}
export function ensoSprite(px, o = {}) {
  const layer = document.createElement('canvas'); layer.width = layer.height = px; const lc = layer.getContext('2d'); lc.scale(px / 100, px / 100);
  stroke(lc, arc(50, 50, o.r ?? 44, o.a0 ?? -112, o.a1 ?? 236, 22), { w: o.w ?? 5, p: o.p || 'press', dry: o.dry ?? 0.75, ds: o.ds ?? 0.45, c: o.c || INK, seed: o.seed ?? 3, sp: o.sp ?? 0 });
  const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d');
  x.filter = `blur(${(px * 0.015).toFixed(2)}px)`; x.globalAlpha = 0.5; x.drawImage(layer, 0, 0); x.filter = 'none'; x.globalAlpha = 1; x.drawImage(layer, 0, 0);
  return c;
}
export function splatSprite(px, col = INK, seed = 9) {
  const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d'); x.scale(px / 100, px / 100); const r = rng(seed);
  for (let i = 0; i < 9; i++) { const a = r() * 6.283, l = 16 + r() * 26; stroke(x, [[50 + Math.cos(a) * 6, 50 + Math.sin(a) * 6], [50 + Math.cos(a) * l, 50 + Math.sin(a) * l]], { w: 5 + r() * 9, p: 'press', dry: 0.8, c: col, seed: seed + i, sp: 3 }); }
  shape(x, ell(50, 50, 15, 13, 0, 14, seed), { c: col });
  return c;
}
// 먹이 물에 풀린 듯한 구름 결(그을린 유리 속 연기)
export function smokeSprite(px, seed = 4) {
  const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d'), r = rng(seed);
  x.filter = `blur(${px * 0.05}px)`;
  for (let i = 0; i < 26; i++) { const g = r() * 255 | 0; x.globalAlpha = 0.1 + r() * 0.2; x.fillStyle = r() < 0.5 ? '#fff' : '#000'; x.beginPath(); x.ellipse(r() * px, r() * px, px * (0.08 + r() * 0.22), px * (0.03 + r() * 0.1), r() * 3.14, 0, 7); x.fill(); }
  return c;
}
