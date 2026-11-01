// 전경 (Stage 6 FORE): 플레이 층 "앞"에 그리는 가까운 실루엣 — 사슬·덩굴·깃발(성), 묘비·마른 가지(묘지), 관(연금술 연구소),
// 산호·다시마(물), 잔해(2부 균열). 데이터는 src/data/foreground.js (스테이지 s01–s26 + 투기장, 테마 기본값). 이 파일은 굽고 그리기만 한다.
//
//   createForeground(stage, map, theme) → fg | null    background.js createBackground 가 부른다 (마을·?fg=0 이면 null)
//   fg.update(dt, world)                              bg.update 에서 (품질 단계·동작 줄이기·보스전 정도)
//   fg.draw(ctx, cam, vw, vh, world)                  bg.drawFront 안, 날씨 뒤·비네팅 앞 (화면 좌표, HUD 아래)
//
// 규칙 (Stage 6 과제):
//  · 주인공·적·보스·탄·줍는 것·HUD 를 가리지 않는다: 조각마다 화면 상자가 그것들(+여유)과 겹치면 알파를 HIDE_K 로 낮춘다
//    (부드럽게, 초당 ~8). 보스전에서는 위 조각은 위로, 아래 조각은 아래로 밀어 가장자리에만 남기고 알파도 낮춘다.
//  · 패럴랙스 배율 > 1 (data: par). 위 조각은 화면 위끝에 매달리고 아래 조각은 화면 아래끝에서 솟는다.
//  · 스프라이트는 방을 불러올 때 페이지에 한 벌인 아틀라스 캔버스에 굽는다 (스테이지 도중 새 캔버스·그라데이션 0, 프레임마다 그라데이션 0).
//  · 단계: 낮음 = 아무것도 그리지 않음 · 중간 = 조각 drawImage(화면에 보통 3–6) · 높음 = + 매달린 조각의 느린 흔들림.
//    설정 '동작 줄이기'(settings.reduceMotion) 이면 끈다 (가까운 층이 빨리 흐르는 것이 어지러울 수 있어서).
//  · URL ?fg=0 = 끔 (전후 비교 캡처). setForegroundEnabled(false) = QA 도구용 실행 중 끄기.
import { fgSpec } from '../data/foreground.js';
import { rgba, clamp } from '../core/math.js';
import * as HL from './hud_layout.js';

const URL_OFF = (() => { try { return typeof location !== 'undefined' && /[?&]fg=0(?:&|$)/.test(location.search || ''); } catch { return false; } })();
let enabled = true;
/** QA 도구용: 실행 중 전경을 끄고 켠다 */
export function setForegroundEnabled(on) { enabled = !!on; }
export const foregroundEnabled = () => enabled && !URL_OFF;

// 테스트용 캔버스 공장 (node 에는 document 가 없다). null = document.createElement('canvas')
let mk = null;
/** tools/test_foreground.mjs: 가짜 캔버스로 굽기·그리기를 센다 */
export function setForegroundCanvasFactory(fn) { mk = typeof fn === 'function' ? fn : null; ATLAS.c = null; ATLAS.key = ''; }

const BAKE = 0.75;                  // 굽는 해상도 (논리 px 대비) — 가까운 층이라 조금 흐린 편이 깊이감에 맞다
const TOP_W = 96, TOP_H = 210;      // 위 조각 칸 (굽는 px) → 그리면 128 × 280 논리 px
const BOT_W = 168, BOT_H = 112;     // 아래 조각 칸 → 224 × 150
const VARS = 2;                     // 모양마다 변형 수
const PER_CYCLE = 6;                // 한 주기(가로로 되풀이)의 조각 수 (위·아래 번갈아)
const HIDE_K = 0.14;                // 가릴 것과 겹친 조각의 알파 배율
const HUD_K = 0.55;                 // HUD 상자와만 겹친 조각의 알파 배율
const HERO_PAD = 56, BOSS_PAD = 28, ENT_PAD = 14;   // 겹침 여유 (화면 px)
const BOSS_LIFT = 0.5;              // 보스전: 조각 높이의 이만큼을 화면 밖으로 민다
const BOSS_ALPHA = 0.6;             // 보스전 알파 배율
const PROTECT = new Set(['player', 'enemy', 'boss', 'projectile', 'pickup']);
export const FG_STATS = { bakes: 0 };

// 페이지에 한 벌인 아틀라스 (방·스테이지가 바뀌면 같은 캔버스에 다시 칠한다)
const ATLAS = { c: null, key: '', cells: [] };
function newCanvas() {
  if (mk) return mk();
  if (typeof document === 'undefined' || !document.createElement) return null;
  return document.createElement('canvas');
}

// 결정적 잡음 (같은 방은 늘 같은 배치)
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const mkRnd = (seed) => { let i = 0; return () => hash(seed + (i++) * 7919); };
const hexRgb = (hex) => { const h = String(hex || '#000000').replace('#', ''); const v = (k) => { const n = parseInt(h.slice(k, k + 2), 16); return Number.isFinite(n) ? n : 0; }; return [v(0), v(2), v(4)]; };

// ── 모양 (굽기 전용, g = 아틀라스 컨텍스트, 칸 (0,0)–(w,h) 로 옮겨 둔 상태). hang = 위에서 매달림, 아니면 바닥에서 솟음 ──
// 몸은 C.body(아주 어두운 테마색), 한쪽 가장자리에 C.rim(안개색 옅게) — 원경 그림의 어두운 실루엣과 같은 결.
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
const SHAPES = {
  chain(g, w, h, r, C, hang) {
    const x = w * (0.35 + r() * 0.3), L = h * (hang ? 0.55 + r() * 0.4 : 0.6), y0 = hang ? 0 : h - L;
    g.lineWidth = 4.5; g.strokeStyle = C.body;
    for (let y = y0, k = 0; y < y0 + L; y += 13, k++) {
      g.beginPath();
      if (k % 2) g.ellipse(x, y + 7, 2.2, 8, 0, 0, Math.PI * 2); else g.ellipse(x, y + 7, 6, 9, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = 1.2; g.strokeStyle = C.rim;
    for (let y = y0; y < y0 + L; y += 26) { g.beginPath(); g.arc(x + 1.5, y + 7, 6, -1.2, 0.4); g.stroke(); }
    if (hang && r() < 0.6) { g.fillStyle = C.body; g.beginPath(); g.arc(x, y0 + L + 10, 9, 0, Math.PI * 2); g.fill(); g.fillRect(x - 2, y0 + L + 16, 4, 12); }
  },
  vine(g, w, h, r, C, hang) {
    for (let s = 0; s < 3; s++) {
      const x0 = w * (0.2 + 0.3 * s + r() * 0.1), L = h * (0.45 + r() * 0.5), sw = (r() - 0.5) * 30;
      const y0 = hang ? -2 : h + 2, dir = hang ? 1 : -1;
      g.lineWidth = 3.5 - s * 0.6; g.strokeStyle = C.body; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + sw, y0 + dir * L * 0.35, x0 - sw, y0 + dir * L * 0.7, x0 + sw * 0.5, y0 + dir * L); g.stroke();
      g.fillStyle = C.body;
      for (let t = 0.15; t < 1; t += 0.13) {
        const lx = x0 + sw * 0.5 * Math.sin(t * 6), ly = y0 + dir * L * t, side = (t * 10) % 2 < 1 ? 1 : -1;
        g.beginPath(); g.ellipse(lx + side * 6, ly, 6, 3, side * 0.6, 0, Math.PI * 2); g.fill();
      }
      g.lineWidth = 1; g.strokeStyle = C.rim; g.beginPath(); g.moveTo(x0 + 1.5, y0); g.bezierCurveTo(x0 + sw + 1.5, y0 + dir * L * 0.35, x0 - sw + 1.5, y0 + dir * L * 0.7, x0 + sw * 0.5 + 1.5, y0 + dir * L); g.stroke();
    }
  },
  banner(g, w, h, r, C, hang) {
    const bw = w * (0.55 + r() * 0.3), x0 = (w - bw) / 2, L = h * (hang ? 0.5 + r() * 0.35 : 0.8), y0 = hang ? 10 : h - L;
    g.fillStyle = C.body; g.fillRect(x0 - 8, y0 - 4, bw + 16, 6);   // 깃대
    const pts = [x0, y0, x0 + bw, y0, x0 + bw * 0.97, y0 + L * 0.9];
    const n = 5;
    for (let i = 1; i < n; i++) pts.push(x0 + bw * (1 - i / n), y0 + L * (0.78 + r() * 0.22));   // 찢어진 아래끝
    pts.push(x0 + bw * 0.03, y0 + L * 0.95);
    poly(g, pts); g.fill();
    g.fillStyle = C.fold; for (let i = 1; i < 3; i++) g.fillRect(x0 + bw * (i / 3) - 2, y0 + 4, 4, L * 0.7);   // 주름
    g.strokeStyle = C.rim; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 + bw, y0); g.lineTo(x0 + bw * 0.97, y0 + L * 0.9); g.stroke();
    // 문장 (가운데 둥근 빛 하나)
    g.strokeStyle = C.rim; g.lineWidth = 1.2; g.beginPath(); g.arc(x0 + bw / 2, y0 + L * 0.35, bw * 0.16, 0, Math.PI * 2); g.stroke();
  },
  branch(g, w, h, r, C, hang) {
    const limb = (x, y, a, len, wd, d) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = wd; g.strokeStyle = C.body; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      if (d > 0) { limb(x2, y2, a + 0.4 + r() * 0.35, len * 0.66, wd * 0.62, d - 1); limb(x2, y2, a - 0.4 - r() * 0.35, len * 0.62, wd * 0.6, d - 1); }
    };
    g.lineCap = 'round';
    if (hang) limb(w * (r() < 0.5 ? 0.1 : 0.9), 0, Math.PI / 2 + (r() - 0.5) * 0.9, h * 0.32, 9, 3);
    else limb(w * (0.35 + r() * 0.3), h, -Math.PI / 2 + (r() - 0.5) * 0.6, h * 0.42, 11, 3);
    g.strokeStyle = C.rim; g.lineWidth = 1; g.beginPath(); g.moveTo(w * 0.5, hang ? 0 : h); g.stroke();
  },
  grave(g, w, h, r, C) {
    const n = 1 + (r() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const gw = w * (0.24 + r() * 0.14), gh = h * (0.5 + r() * 0.35), x = w * (0.18 + i * 0.42 + r() * 0.1), tilt = (r() - 0.5) * 0.25;
      g.save(); g.translate(x + gw / 2, h); g.rotate(tilt);
      g.fillStyle = C.body;
      if (r() < 0.35) { g.fillRect(-4, -gh, 8, gh); g.fillRect(-gw * 0.35, -gh * 0.78, gw * 0.7, 8); }   // 십자
      else { g.beginPath(); g.moveTo(-gw / 2, 0); g.lineTo(-gw / 2, -gh + gw / 2); g.arc(0, -gh + gw / 2, gw / 2, Math.PI, 0); g.lineTo(gw / 2, 0); g.closePath(); g.fill(); }
      g.strokeStyle = C.rim; g.lineWidth = 1.4; g.beginPath(); g.moveTo(gw / 2 - 1, -4); g.lineTo(gw / 2 - 1, -gh * 0.7); g.stroke();
      g.restore();
    }
    g.fillStyle = C.body; for (let x = 0; x < w; x += 7) { const th = 6 + r() * 14; poly(g, [x, h, x + 3, h - th, x + 7, h]); g.fill(); }   // 풀
  },
  rubble(g, w, h, r, C) {
    g.fillStyle = C.body;
    if (r() < 0.6) { g.save(); g.translate(w * (0.3 + r() * 0.4), h * 0.75); g.rotate(-0.3 - r() * 0.5); g.fillRect(-w * 0.32, -6, w * 0.64, 12); g.restore(); }   // 부러진 들보
    for (let i = 0; i < 7; i++) {
      const cx = w * (0.1 + r() * 0.8), s = 10 + r() * 22, cy = h - s * 0.4 - r() * 8, pts = [];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r() * 0.5, rr = s * (0.6 + r() * 0.5); pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7); }
      poly(g, pts); g.fill();
    }
    g.fillRect(0, h - 10, w, 10);
    g.strokeStyle = C.rim; g.lineWidth = 1.2; g.beginPath(); g.moveTo(w * 0.1, h - 11); g.lineTo(w * 0.9, h - 13); g.stroke();
  },
  pipe(g, w, h, r, C, hang) {
    const n = 1 + (r() < 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const pw = 14 + r() * 10, x = w * (0.25 + i * 0.4 + r() * 0.1), L = (hang ? h * (0.4 + r() * 0.5) : h * (0.6 + r() * 0.4));
      const y0 = hang ? 0 : h - L;
      g.fillStyle = C.body; g.fillRect(x - pw / 2, y0, pw, L);
      for (let y = y0 + 18 + r() * 20; y < y0 + L - 8; y += 46 + r() * 20) g.fillRect(x - pw / 2 - 4, y, pw + 8, 7);   // 이음 테
      if (hang && r() < 0.6) { g.beginPath(); g.arc(x + pw, y0 + L, pw, Math.PI / 2, Math.PI); g.lineWidth = pw; g.strokeStyle = C.body; g.stroke(); }   // 굽은 끝
      if (!hang && r() < 0.5) { g.lineWidth = 3; g.strokeStyle = C.body; g.beginPath(); g.arc(x, y0 + 14, pw * 0.9, 0, Math.PI * 2); g.stroke(); }   // 밸브 바퀴
      g.fillStyle = C.rim; g.fillRect(x + pw / 2 - 3, y0, 1.5, L);
    }
  },
  coral(g, w, h, r, C) {
    const limb = (x, y, a, len, wd, d) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = wd; g.strokeStyle = C.body; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - 0.5) * 12, (y + y2) / 2, x2, y2); g.stroke();
      if (d > 0) { limb(x2, y2, a + 0.5 + r() * 0.3, len * 0.7, wd * 0.72, d - 1); limb(x2, y2, a - 0.5 - r() * 0.3, len * 0.7, wd * 0.72, d - 1); }
      else { g.fillStyle = C.body; g.beginPath(); g.arc(x2, y2, wd * 0.8, 0, Math.PI * 2); g.fill(); }
    };
    g.lineCap = 'round';
    limb(w * (0.3 + r() * 0.15), h, -Math.PI / 2 - 0.2, h * 0.3, 10, 3);
    limb(w * (0.65 + r() * 0.15), h, -Math.PI / 2 + 0.25, h * 0.24, 8, 2);
    g.fillStyle = C.body; g.beginPath(); g.ellipse(w * 0.5, h, w * 0.42, 12, 0, Math.PI, 0); g.fill();
  },
  kelp(g, w, h, r, C, hang) {
    for (let s = 0; s < 3; s++) {
      const x0 = w * (0.2 + s * 0.28 + r() * 0.08), L = h * (0.55 + r() * 0.45), dir = hang ? 1 : -1, y0 = hang ? -2 : h + 2, A = 8 + r() * 8;
      g.fillStyle = C.body; g.beginPath(); g.moveTo(x0 - 4, y0);
      const N = 10;
      for (let i = 1; i <= N; i++) { const t = i / N; g.lineTo(x0 + Math.sin(t * 5 + s) * A - 4 * (1 - t), y0 + dir * L * t); }
      for (let i = N; i >= 0; i--) { const t = i / N; g.lineTo(x0 + Math.sin(t * 5 + s) * A + 4 * (1 - t) + 2, y0 + dir * L * t); }
      g.closePath(); g.fill();
      g.strokeStyle = C.rim; g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 3, y0);
      for (let i = 1; i <= N; i++) { const t = i / N; g.lineTo(x0 + Math.sin(t * 5 + s) * A + 3 * (1 - t) + 1, y0 + dir * L * t); }
      g.stroke();
    }
  },
  gear(g, w, h, r, C) {
    const R = h * (0.55 + r() * 0.25), cx = w * (0.4 + r() * 0.2), cy = h + R * 0.25, T = 12;
    g.fillStyle = C.body; g.beginPath();
    for (let i = 0; i < T * 2; i++) { const a = (i / (T * 2)) * Math.PI * 2, rr = i % 2 ? R : R * 0.86; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(cx, cy, R * 0.32, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over';
    g.strokeStyle = C.rim; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, R * 0.8, -2.4, -1.2); g.stroke();
  },
  rock(g, w, h, r, C, hang) {
    const cx = w / 2, rw = w * (0.35 + r() * 0.12), rh = h * (hang ? 0.22 : 0.4), cy = hang ? rh * 0.6 : h - rh * 0.5, pts = [];
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, rr = 0.75 + r() * 0.35; pts.push(cx + Math.cos(a) * rw * rr, cy + Math.sin(a) * rh * rr); }
    g.fillStyle = C.body; poly(g, pts); g.fill();
    if (hang) { for (let i = 0; i < 3; i++) { const x = cx + (r() - 0.5) * rw, L = 20 + r() * 50; poly(g, [x - 7, cy + rh * 0.4, x + 7, cy + rh * 0.4, x, cy + rh * 0.4 + L]); g.fill(); } }   // 종유석
    g.strokeStyle = C.rim; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, rw * 0.8, -2.2, -0.9); g.stroke();
  },
};
/** 데이터의 모양 이름이 모두 여기 있는지 (tools/test_foreground.mjs) */
export const FG_SHAPE_NAMES = Object.keys(SHAPES);

/** 아틀라스 굽기: 위 모양 × VARS (윗줄), 아래 모양 × VARS (아랫줄). key 가 같으면 다시 굽지 않는다 */
function bake(key, spec, theme) {
  if (ATLAS.c && ATLAS.key === key) return true;
  const c = ATLAS.c ?? newCanvas();
  if (!c) return false;
  ATLAS.c = c;
  const nt = spec.top.length * VARS, nb = spec.bottom.length * VARS;
  const W = Math.max(nt * TOP_W, nb * BOT_W, 8), H = TOP_H + BOT_H;
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return false;
  g.clearRect(0, 0, W, H);
  const sky = hexRgb(theme?.sky?.[2] || '#050406'), fog = theme?.fog || '#8080a0';
  const body = `rgb(${Math.round(sky[0] * 0.55 + 4)},${Math.round(sky[1] * 0.55 + 3)},${Math.round(sky[2] * 0.55 + 5)})`;
  const C = { body, fold: 'rgba(0,0,0,0.35)', rim: rgba(fog, 0.22) };
  const cells = [];
  const seed = strHash(key);
  const put = (shape, v, top, x, y, w, h) => {
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    g.scale(BAKE, BAKE);
    try { g.filter = 'blur(0.8px)'; } catch { /* 지원 안 하면 또렷하게 */ }
    try { SHAPES[shape]?.(g, w / BAKE, h / BAKE, mkRnd(seed + v * 131 + (top ? 7 : 3) * 977 + strHash(shape)), C, top); } catch (e) { console.warn('[fg] shape', shape, e); }
    g.restore();
    cells.push({ shape, top, sx: x, sy: y, sw: w, sh: h });
  };
  spec.top.forEach((s, i) => { for (let v = 0; v < VARS; v++) put(s, v, true, (i * VARS + v) * TOP_W, 0, TOP_W, TOP_H); });
  spec.bottom.forEach((s, i) => { for (let v = 0; v < VARS; v++) put(s, v, false, (i * VARS + v) * BOT_W, TOP_H, BOT_W, BOT_H); });
  try { g.filter = 'none'; } catch { /* */ }
  ATLAS.key = key; ATLAS.cells = cells;
  FG_STATS.bakes++;
  return true;
}
/** 구운 아틀라스 바이트 (QA) */
export function foregroundBytes() { const c = ATLAS.c; return c ? (c.width | 0) * (c.height | 0) * 4 : 0; }

/**
 * stage = createBackground 의 stage (방 테마 덮어쓰기 포함), map = 방 지도, theme = background.js THEMES 항목 (색).
 * 굽기는 첫 그리기 전 update 에서 한 번 (그리기 밖) — 중간 이상 단계에서만.
 */
export function createForeground(stage, map, theme) {
  if (URL_OFF) return null;
  const spec = fgSpec(stage?.id, stage?.theme);
  if (!spec || !(spec.top.length + spec.bottom.length)) return null;
  const key = `${stage?.id}|${stage?.theme}|${spec.top.join(',')}|${spec.bottom.join(',')}`;
  const seed = strHash(`${stage?.id}|${map?.w ?? 0}|${map?.h ?? 0}`);
  const rnd = mkRnd(seed);
  // 한 주기의 조각: 위·아래 번갈아 (가끔 같은 쪽 둘), 간격 = gap ± 35 %
  const pieces = [];
  let x = rnd() * spec.gap;
  for (let i = 0; i < PER_CYCLE; i++) {
    const top = spec.top.length && spec.bottom.length ? (i % 2 === 0) !== (rnd() < 0.2) : spec.top.length > 0;
    const list = top ? spec.top : spec.bottom;
    const si = Math.floor(rnd() * list.length) % list.length, v = Math.floor(rnd() * VARS) % VARS;
    pieces.push({ x, top, cell: -1, si, v, s: 0.85 + rnd() * 0.35, ph: rnd() * 6.283, a: 1 });
    x += spec.gap * (0.65 + rnd() * 0.7);
  }
  const P = Math.max(x, spec.gap * PER_CYCLE * 0.8);
  const fg = {
    spec, key, pieces, period: P, par: spec.par, alpha: spec.alpha,
    tier: 'medium', rm: false, t: 0, bossK: 0, baked: false, theme,
    hud: [], hudT: 0, prot: [], nProt: 0, nEnt: 0, world: null, dt: 1 / 60,
    stats: { draws: 0, visible: 0, hidden: 0 },
  };
  const live = () => enabled && !URL_OFF && fg.tier !== 'low' && !fg.rm;
  fg.live = live;

  fg.update = (dt, world) => {
    fg.world = world; fg.dt = dt;
    const q = world?.qualityNow?.() ?? 'high';
    fg.tier = q === 'low' || q === 'medium' ? q : 'high';
    fg.rm = !!world?.game?.settings?.reduceMotion;
    fg.t += dt;
    const bk = world?.bossActive ? 1 : 0;
    fg.bossK += (bk - fg.bossK) * Math.min(1, dt * 2.5);
    if (live() && (!fg.baked || ATLAS.key !== key)) {
      try {
        fg.baked = bake(key, spec, theme);
        if (fg.baked) for (const p of pieces) {
          const want = (p.top ? spec.top : spec.bottom)[p.si];
          p.cell = ATLAS.cells.findIndex((c) => c.top === p.top && c.shape === want) + p.v;
        }
      } catch (e) { console.warn('[fg] bake', e); fg.baked = false; }
    }
    // HUD 상자 (화면 좌표) — 0.5 초마다 다시 잰다 (위 조각이 HUD 뒤에 짙게 깔리지 않게)
    fg.hudT -= dt;
    if (live() && fg.hudT <= 0 && world) {
      fg.hudT = 0.5; fg.hud.length = 0;
      try {
        const L = world.hudHidden ? null : HL.hudLayout?.(world, world.game?.viewW, world.game?.viewH);
        if (L) for (const r of [L.portrait, L.vitals, L.hearts, L.skills, L.ult, L.score, L.combo, L.bossShown ? L.bossBar : null]) if (r && r.w > 0 && r.h > 0) fg.hud.push(r);
      } catch { fg.hud.length = 0; }
    }
  };

  /** 이번 프레임에 가리면 안 되는 것들의 화면 상자 (조각이 있는 위·아래 띠에 걸친 것만) */
  function collect(world, cam, vw, vh, bandTop, bandBot) {
    const R = fg.prot;
    let n = 0;
    const z = cam.zoom || 1, ox = cam.x + (cam.shakeX || 0), oy = cam.y + (cam.shakeY || 0);
    const add = (e, pad) => {
      const x0 = (e.x - ox) * z - pad, y0 = (e.y - oy) * z - pad, x1 = (e.x + (e.w || 0) - ox) * z + pad, y1 = (e.y + (e.h || 0) - oy) * z + pad;
      if (x1 < 0 || x0 > vw || y1 < 0 || y0 > vh) return;
      if (!(y0 < bandTop || y1 > vh - bandBot)) return;   // 조각 띠에 걸치지 않음
      const d = (R[n++] ??= { x0: 0, y0: 0, x1: 0, y1: 0 });
      d.x0 = x0; d.y0 = y0; d.x1 = x1; d.y1 = y1;
    };
    const P = world?.player;
    if (P && !P.dead) add(P, HERO_PAD);
    const B = world?.boss;
    if (B && !B.dead && world.bossActive) add(B, BOSS_PAD);
    const L = world?.entities;
    if (L) for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e === P || e === B || e.dead || e.hidden || !PROTECT.has(e.kind)) continue;
      add(e, ENT_PAD);
    }
    fg.nEnt = n;   // 여기까지 = 가릴 수 없는 것 (HIDE_K), 뒤 = HUD 상자 (HUD_K: HUD 는 늘 위에 그려지니 글자 뒤만 조금 옅게)
    for (const r of fg.hud) {
      const d = (R[n++] ??= { x0: 0, y0: 0, x1: 0, y1: 0 });
      d.x0 = r.x - 6; d.y0 = r.y - 6; d.x1 = r.x + r.w + 6; d.y1 = r.y + r.h + 6;
    }
    fg.nProt = n;
  }
  /** 조각 상자와 겹친 것 → 알파 배율 (1 = 겹침 없음, HUD_K = HUD 만, HIDE_K = 주인공·적·보스·탄·줍는 것) */
  const hits = (x0, y0, x1, y1) => {
    const R = fg.prot;
    let k = 1;
    for (let i = 0; i < fg.nProt; i++) {
      const r = R[i];
      if (x0 < r.x1 && x1 > r.x0 && y0 < r.y1 && y1 > r.y0) { if (i < fg.nEnt) return HIDE_K; k = HUD_K; }
    }
    return k;
  };

  fg.draw = (ctx, cam, vw, vh, world = fg.world, dt = fg.dt ?? 1 / 60) => {
    fg.stats.draws = 0; fg.stats.visible = 0; fg.stats.hidden = 0;
    if (!live() || !fg.baked || ATLAS.key !== key || !ATLAS.c || !cam) return;
    const cells = ATLAS.cells, img = ATLAS.c, k = 1 / BAKE;
    const z = cam.zoom || 1, scroll = (cam.x + (cam.shakeX || 0)) * z * fg.par;
    const bk = fg.bossK, aMax = fg.alpha * (1 - (1 - BOSS_ALPHA) * bk);
    const bandTop = TOP_H * k * 1.2 * (1 - BOSS_LIFT * bk), bandBot = BOT_H * k * 1.2 * (1 - BOSS_LIFT * bk);
    collect(world, cam, vw, vh, bandTop, bandBot);
    const sway = fg.tier === 'high';
    const fade = Math.min(1, dt * 8);
    const a0 = ctx.globalAlpha;
    for (const p of pieces) {
      const c = cells[p.cell];
      if (!c) continue;
      const dw = c.sw * k * p.s, dh = c.sh * k * p.s;
      const sx = ((p.x - scroll) % P + P) % P - dw;   // [-dw, P-dw): 주기가 화면보다 넓어 한 조각은 화면에 한 번만
      if (sx > vw) continue;
      const dy = p.top ? -dh * BOSS_LIFT * bk : vh - dh + dh * BOSS_LIFT * bk;
      fg.stats.visible++;
      const hk = hits(sx + dw * 0.15, dy, sx + dw * 0.85, dy + dh * 0.92);
      if (hk === HIDE_K) fg.stats.hidden++;
      p.a += (hk - p.a) * fade;
      const a = aMax * p.a;
      if (!(a > 0.01)) continue;
      ctx.globalAlpha = a0 * a;
      if (sway && p.top) {
        const rot = Math.sin(fg.t * 0.7 + p.ph) * 0.025;
        ctx.save(); ctx.translate(sx + dw / 2, dy); ctx.rotate(rot);
        ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, -dw / 2, 0, dw, dh);
        ctx.restore();
      } else ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, sx, dy, dw, dh);
      fg.stats.draws++;
    }
    ctx.globalAlpha = a0;
  };
  return fg;
}
