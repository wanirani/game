// 채색 크리처 런타임 키트 (Painted-creature runtime kit)
// Kling 으로 그린 부품(컷아웃 퍼핏)을 보스·적·NPC·동료에 공통으로 쓰기 위한 도구 모음.
// 무거운 일은 전부 로딩 때 한 번(굽기), 매 프레임은 setTransform + drawImage 와 값싼 절차적 VFX 만 한다.
//
// ── 구성 ─────────────────────────────────────────────────────────────────────────
//  quality(game) / textureDensity(game, zoom)      품질 플래그(low/medium/high)와 텍셀 밀도(기기 px / 논리 px)
//  RenderRNG, rr, hash1                            그리기 전용 난수 (게임플레이 Math.random 을 절대 소비하지 않는다)
//  loadRig(dir, def, env)                          assets/<dir>/manifest.json + atlas.webp → 부품별 변형을 구운 Rig
//     변형: base(외곽선 포함) · deep(어둡게, 뒤쪽 부품) · dmg1/dmg2(균열·그을림·찢김·깨짐) · flash(흰 실루엣) ·
//           glow(영혼색 실루엣, 잔상) · 틴트(예: 쌍두의 서리색) · 균열 발광 오버레이(gl)
//  Drawer                                          부품 한 장 = setTransform 한 번 + drawImage 한 번 (save/restore 없음)
//  Chain                                           점 체인(척추·꼬리·촉수)의 호 길이/점/각도 + 굽힘에 따른 겹침 보정
//  ik2                                             2관절 팔다리 (어깨→팔꿈치→손) 해석해
//  Strand                                          verlet 줄 (힘줄·침·찢긴 막·사슬)
//  Particles + PRESET                              풀링된 입자 (ash ember boneDust ichor(바닥 튐) smoke spore spark chip), 묶음 그리기
//  puff / halo / glowSprite                        부드러운 발광 퍼프 (가산)
//  DamageState                                     체력 비율 → 손상 단계 0..2, 단계가 오를 때 한 번 true (파편 폭발용)
//  Shards                                          사망 붕괴용 강체 파편 (부품 이미지가 튀어 떨어지고 바닥에서 튕김)
//  texMemMB(rig)                                   구운 텍스처 메모리 추정
//
// ── 규칙 (docs/art/BOSS_PIPELINE.md 참고) ───────────────────────────────────────
//  1) 그리기 코드는 Math.random / world.fx.emit·burst 를 쓰지 않는다 (fx.emit 은 내부에서 Math.random 사용). rr 과 Particles 를 쓴다.
//  2) 굽기는 로딩 페이드·보스 등장 연출 뒤에서 (registry.preloadPainted). 첫 전투 프레임에 굽지 않는다.
//  3) 큰 스프라이트는 ctx.imageSmoothingQuality = 'low' (텍스처를 기기 해상도 근처로 구웠으므로 쌍선형이면 충분).
//  4) 메모리 예산: 보스 1체 데스크톱 ≈15MB / 폰 ≈6MB (텍셀 밀도를 예산에 맞춰 자동으로 낮춘다).
import { assets, ASSET_ROOT } from '../../core/assets.js';
import { rgba } from '../../core/math.js';

export const PAD = 4;              // 외곽선 여유 (텍셀)
const TAU = Math.PI * 2;

// ───────────────────────── 품질 / 기기 ─────────────────────────
export const QUALITY = {
  high: { name: 'high', particles: 420, strands: 1, crackGlow: true, smear: true, halos: true, tdMul: 1, ambient: 1 },
  medium: { name: 'medium', particles: 260, strands: 0.6, crackGlow: true, smear: true, halos: true, tdMul: 0.9, ambient: 0.7 },
  low: { name: 'low', particles: 120, strands: 0, crackGlow: false, smear: false, halos: false, tdMul: 0.75, ambient: 0.4 },
};
export function quality(game) {
  const q = game?.settings?.quality ?? 'high';
  return QUALITY[q] ?? QUALITY.high;
}
/** 폰/태블릿(터치 위주·메모리 적음) 여부 */
export function isPhone() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  try { return !!(window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820); } catch { return false; }
}
/** 텍스처 굽기 밀도 (텍셀 / 논리 px) = 캔버스 배율 × 카메라 줌 (약간 과표본), 품질 배율 적용 */
export function textureDensity(game, zoom = 1, { min = 0.7, max = 2, over = 1.1 } = {}) {
  const s = (game?.scale ?? 1) * Math.max(0.6, zoom) * over * quality(game).tdMul;
  return Math.min(max, Math.max(min, s));
}
export function memoryBudgetMB(game) {
  if (isPhone() || quality(game).name === 'low') return 6;
  return 15;
}

// ───────────────────────── 그리기 전용 난수 ─────────────────────────
/** xorshift32. 게임플레이 난수와 분리 (AI 결정·리플레이가 그리기 빈도에 영향을 받지 않게) */
export class RenderRNG {
  constructor(seed = 0x2545f491) { this.s = (seed >>> 0) || 1; }
  seed(v) { this.s = (v >>> 0) || 1; return this; }
  next() { let s = this.s; s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; this.s = s; return s / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(n) { return Math.floor(this.next() * n); }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}
export const rr = new RenderRNG(0x9e3779b9);
/** 결정론적 해시 0..1 */
export function hash1(i) { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
/** 시드 고정 생성기 (굽기용) */
export function seeded(seed) { return new RenderRNG(Math.imul((seed | 0) + 1, 2654435761) ^ 0x9e3779b9); }

// ───────────────────────── 캔버스 도우미 ─────────────────────────
export function makeCanvas(w, h) {
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
function ctx2d(c) { return c.getContext('2d', { willReadFrequently: false }); }
export function silhouette(src, color) {
  const c = makeCanvas(src.width, src.height), g = ctx2d(c);
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
/** 얇은 어두운 외곽선 (채색 배경 위 가독성). pad 만큼 캔버스를 키운다 */
export function outlined(img, { width = 2.2, color = 'rgba(10,5,6,0.9)', pad = PAD } = {}) {
  const c = makeCanvas(img.width + pad * 2, img.height + pad * 2), g = ctx2d(c);
  if (width > 0) {
    const sil = silhouette(img, color);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.drawImage(sil, pad + Math.cos(a) * width, pad + Math.sin(a) * width); }
  }
  g.drawImage(img, pad, pad);
  return c;
}
/** 곱하기로 어둡게 (먼 쪽 팔다리·몸통 덩어리) */
export function darkened(src, k, tint = null) {
  const c = makeCanvas(src.width, src.height), g = ctx2d(c);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = tint ?? `rgb(${k * 255 | 0},${k * 255 | 0},${k * 255 | 0})`; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  return c;
}
function scaledCopy(img, sx, sy, sw, sh, w, h) {
  const c = makeCanvas(w, h), g = ctx2d(c);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

// ───────────────────────── 색 바꾸기 (틴트 변형) ─────────────────────────
// 규칙 목록: 각 픽셀의 HSL 을 보고 첫 번째로 맞는 규칙을 적용한다. {when:(h,s,l)=>bool, h:목표 색상(도)|null, dh:회전, s:배율, s0:더함, l:배율, l0:더함}
// 전체를 회색으로 식히는 대신 '영혼불/살/뼈/그림자' 를 따로 옮겨야 탁해지지 않는다 (프로토타입 쌍두의 탁한 색 문제).
export const RECOLOR = {
  // 서리: 영혼불 녹색 → 얼음빛 청색, 썩은 살 → 짙은 남보라, 뼈 → 창백한 냉백색, 그림자 → 푸른 먹색
  frost: [
    { when: (h, s, l) => h > 70 && h < 175 && s > 0.22 && l > 0.12, h: 203, s: 1.05, l: 1.06, l0: 0.04 },
    { when: (h, s, l) => (h < 28 || h > 320) && s > 0.28 && l < 0.62, h: 262, s: 0.62, l: 0.82 },
    { when: (h, s, l) => l < 0.14, h: 222, s: 0.6, s0: 0.08, l: 1 },
    { when: () => true, h: 208, s: 0.3, s0: 0.05, l: 1.08, l0: 0.03 },
  ],
  // 피: 영혼불 → 선홍, 뼈 → 약간 따뜻하고 어둡게
  blood: [
    { when: (h, s, l) => h > 70 && h < 175 && s > 0.22 && l > 0.12, h: 356, s: 1.1, l: 0.95 },
    { when: () => true, dh: -6, s: 1.05, l: 0.93 },
  ],
  // 공허: 영혼불 → 보라, 뼈 → 잿빛 보라
  void: [
    { when: (h, s, l) => h > 70 && h < 175 && s > 0.22 && l > 0.12, h: 282, s: 1.0, l: 1.0 },
    { when: () => true, h: 270, s: 0.25, s0: 0.03, l: 0.9 },
  ],
};
export function recolor(src, rules) {
  if (typeof rules === 'string') rules = RECOLOR[rules];
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    const r = p[i] / 255, gg = p[i + 1] / 255, b = p[i + 2] / 255;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), L = (mx + mn) / 2, dd = mx - mn;
    let H = 0, S = 0;
    if (dd > 1e-5) {
      S = L > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
      H = mx === r ? ((gg - b) / dd + (gg < b ? 6 : 0)) : mx === gg ? ((b - r) / dd + 2) : ((r - gg) / dd + 4);
      H *= 60;
    }
    let rule = null;
    for (const ru of rules) if (ru.when(H, S, L)) { rule = ru; break; }
    if (!rule) continue;
    let h2 = rule.h ?? H; if (rule.dh) h2 += rule.dh;
    const s2 = Math.min(1, Math.max(0, S * (rule.s ?? 1) + (rule.s0 ?? 0)));
    const l2 = Math.min(1, Math.max(0, L * (rule.l ?? 1) + (rule.l0 ?? 0)));
    const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2, pp = 2 * l2 - q, hk = (((h2 % 360) + 360) % 360) / 360;
    p[i] = hue2rgb(pp, q, hk + 1 / 3) * 255; p[i + 1] = hue2rgb(pp, q, hk) * 255; p[i + 2] = hue2rgb(pp, q, hk - 1 / 3) * 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

// ───────────────────────── 절차적 손상 굽기 ─────────────────────────
/** 가지 치는 균열 보행 → 평면 배열 [x,y,...] (NaN,NaN = 펜 들기) */
export function crackWalk(R, x, y, len, a, inside, out = []) {
  out.push(x, y); let d = 0;
  while (d < len) {
    const st = 2.2 + R.next() * 4.2;
    a += (R.next() - 0.5) * 0.8; x += Math.cos(a) * st; y += Math.sin(a) * st; d += st;
    if (inside && !inside(x, y)) break;
    out.push(x, y);
    if (R.next() < 0.1 && out.length > 8) {
      out.push(NaN, NaN);
      crackWalk(R, x, y, (len - d) * 0.5, a + R.sign() * (0.6 + R.next() * 0.6), inside, out);
      out.push(NaN, NaN, x, y);
    }
  }
  return out;
}
function tracePts(g, pts, dx = 0, dy = 0) {
  g.beginPath(); let pen = false;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i], y = pts[i + 1];
    if (Number.isNaN(x)) { pen = false; continue; }
    if (!pen) { g.moveTo(x + dx, y + dy); pen = true; } else g.lineTo(x + dx, y + dy);
  }
}
/**
 * 손상 단계 굽기. src(캔버스, 외곽선 없음) 위에 누적: 그을림(곱하기) → 새김 균열(밝은 입술+어두운 선) → 가장자리 깨짐 / 막 찢김 / 얼룩.
 * opts: {cracks, char, holes, membrane(막: 어두운 곳에 찢긴 구멍), chips(가장자리 깨짐), stain(얼룩 색), glow(균열 발광색), crackMinLum(균열 시작 밝기)}
 * 반환 {canvas, glow(반 해상도 발광 오버레이|null), sparks:[[x,y]...] 균열 중심점}
 */
export function bakeDamage(src, level, seed, opts = {}, withGlow = true) {
  const w = src.width, h = src.height;
  const R = seeded(seed * 7919 + level * 131);
  const sg = src.getContext('2d', { willReadFrequently: true });
  const data = sg.getImageData(0, 0, w, h).data;
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : data[((y | 0) * w + (x | 0)) * 4 + 3];
  const Lm = (x, y) => { const i = ((y | 0) * w + (x | 0)) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3; };
  const pick = (pred) => { for (let t = 0; t < 500; t++) { const x = R.next() * w, y = R.next() * h; if (A(x, y) > 200 && (!pred || pred(x, y))) return [x, y]; } return null; };
  const scale = Math.max(0.6, Math.sqrt(w * h) / 260);
  const c = makeCanvas(w, h), g = ctx2d(c);
  g.drawImage(src, 0, 0);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // 1) 그을림·썩은 얼룩 (곱하기 → 원래 알파로 자름)
  const tmp = makeCanvas(w, h), tg = ctx2d(tmp);
  tg.drawImage(src, 0, 0);
  tg.globalCompositeOperation = 'multiply';
  const nChar = Math.round((opts.char ?? 2) * level);
  for (let i = 0; i < nChar; i++) {
    const p = pick(); if (!p) break;
    const r = (14 + R.next() * 24) * scale;
    const gr = tg.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    const st = opts.stain;
    // 그을림은 부드럽게 (너무 검으면 손상 단계에서 몸 전체가 탁해진다)
    gr.addColorStop(0, st ? st : 'rgb(78,52,36)'); gr.addColorStop(0.45, st ? rgba(st, 0.5) : 'rgb(150,118,92)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    tg.fillStyle = gr; tg.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
  }
  tg.globalCompositeOperation = 'destination-in'; tg.drawImage(src, 0, 0);
  g.drawImage(tmp, 0, 0);
  // 2) 새김 균열 (밝은 뼈 픽셀에서 시작, 불투명한 곳 안에서만)
  const cracks = [];
  const inside = (x, y) => A(x, y) > 120;
  const nCr = Math.round((opts.cracks ?? 3) * level + (level > 1 ? 2 : 0));
  const minL = opts.crackMinLum ?? 140;
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < nCr; i++) {
    const p = pick((x, y) => Lm(x, y) > minL); if (!p) break;
    const len = (14 + R.next() * 28) * scale * (0.8 + level * 0.3);
    const pts = crackWalk(R, p[0], p[1], len, R.next() * TAU, inside);
    if (pts.length < 6) continue;
    cracks.push(pts);
    const lw = (1.2 + level * 0.45) * Math.max(0.8, scale);
    tracePts(g, pts, 0.6, 0.8); g.strokeStyle = 'rgba(255,238,205,0.4)'; g.lineWidth = lw * 0.6; g.stroke();
    tracePts(g, pts); g.strokeStyle = 'rgba(22,12,6,0.93)'; g.lineWidth = lw; g.stroke();
  }
  // 3) 구멍/깨짐 (destination-out)
  g.globalCompositeOperation = 'destination-out';
  const nHole = Math.round((opts.holes ?? 2) * level);
  for (let i = 0; i < nHole; i++) {
    const e = 6 * scale;
    const p = opts.membrane ? pick((x, y) => Lm(x, y) < 95) : pick((x, y) => A(x + e, y) < 30 || A(x - e, y) < 30 || A(x, y - e) < 30 || A(x, y + e) < 30);
    if (!p) continue;
    const r = (opts.membrane ? 6 + R.next() * 13 : 2.5 + R.next() * 5.5) * scale;
    g.beginPath();
    const n = opts.membrane ? 11 : 8;
    for (let j = 0; j < n; j++) {
      const aa = j / n * TAU, rr2 = r * (0.5 + R.next() * 0.75) * (opts.membrane && j % 3 === 0 ? 1.5 : 1);
      const x = p[0] + Math.cos(aa) * rr2, y = p[1] + Math.sin(aa) * rr2 * (opts.membrane ? 1.4 : 1);
      j ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fillStyle = '#000'; g.fill();
    // 막 찢김: 구멍 가장자리에 너덜한 줄무늬 (가는 슬릿)
    if (opts.membrane) {
      g.lineWidth = 1.2 * scale; g.strokeStyle = '#000';
      for (let j = 0; j < 3; j++) { const aa = R.next() * TAU, l2 = r * (1.2 + R.next()); g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + Math.cos(aa) * l2, p[1] + Math.sin(aa) * l2 * 1.3); g.stroke(); }
    }
  }
  g.globalCompositeOperation = 'source-over';
  // 4) 균열 발광 오버레이 (반 해상도, 흐림, 부품 알파 안으로 자름) — 런타임에 가산으로 맥동
  let glow = null;
  if (withGlow && cracks.length && opts.glow) {
    const k = 0.5, gw = makeCanvas(w * k, h * k), gg = ctx2d(gw);
    gg.scale(k, k); gg.lineCap = 'round'; gg.lineJoin = 'round';
    for (const pts of cracks) {
      let n = pts.length; for (let i = 0; i < pts.length; i += 2) if (Number.isNaN(pts[i])) { n = i; break; }
      if (n < 8) continue;
      gg.beginPath(); gg.moveTo(pts[0], pts[1]); for (let i = 2; i < n; i += 2) gg.lineTo(pts[i], pts[i + 1]);
      gg.shadowColor = opts.glow; gg.shadowBlur = 10 * scale; gg.strokeStyle = rgba(opts.glow, 0.6); gg.lineWidth = 4 * scale; gg.stroke();
      gg.shadowBlur = 0; gg.strokeStyle = rgba(opts.glow, 0.95); gg.lineWidth = 1.6 * scale; gg.stroke();
      gg.strokeStyle = 'rgba(235,255,235,0.8)'; gg.lineWidth = 0.6 * scale; gg.stroke();
    }
    gg.setTransform(1, 0, 0, 1, 0, 0);
    gg.globalCompositeOperation = 'destination-in'; gg.drawImage(c, 0, 0, gw.width, gw.height);
    glow = gw;
  }
  const sparks = cracks.map((pts) => [pts[Math.min(pts.length - 2, (pts.length >> 2) * 2)], pts[Math.min(pts.length - 1, (pts.length >> 2) * 2 + 1)]]).filter((q) => !Number.isNaN(q[0]));
  return { canvas: c, glow, sparks };
}

// ───────────────────────── 리그 로딩 / 굽기 ─────────────────────────
/** 굽기 양보: 한 조각(sliceMs)을 넘게 일했으면 다음 매크로태스크로 넘긴다 (한 프레임을 길게 막지 않게).
 *  requestIdleCallback 은 게임 루프가 바쁘면 timeout 까지 기다리므로 쓰지 않는다 (굽기가 수 초로 늘어남) */
let _slice = 0;
export function nextIdle(sliceMs = 8) {
  const now = performance.now();
  if (now - _slice < sliceMs) return null;
  return new Promise((res) => {
    if (typeof MessageChannel !== 'undefined') { const ch = new MessageChannel(); ch.port1.onmessage = () => { _slice = performance.now(); res(); }; ch.port2.postMessage(0); }
    else setTimeout(() => { _slice = performance.now(); res(); }, 0);
  });
}
export function sliceStart() { _slice = performance.now(); }
export async function loadManifest(dir) {
  const r = await fetch(`${ASSET_ROOT}${dir}/manifest.json?v=${assets.version}`);
  if (!r.ok) throw new Error(`painted manifest ${dir}: ${r.status}`);
  return r.json();
}
/** 부품 이미지 확보: 아틀라스(assets.js 키 '<dir>/atlas') 또는 부품별 파일 */
async function loadAtlas(dir, man) {
  const key = `${dir}/${man.atlas?.file ?? 'atlas'}`;
  const img = await assets.load(key);
  if (!img) throw new Error('painted atlas missing ' + key);
  return { img, key };
}
function isPt(v) { return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number'; }
function isPts(v) { return Array.isArray(v) && v.length && isPt(v[0]); }

/**
 * loadRig(dir, def, env) → Rig
 *  dir: 'painted/bosses/b_bonedragon' (assets/ 아래)
 *  def: { glow:'#7dff9a', outline:{width,color}, parts:{ <name>: {deep, deepOnly, flash, glow, membrane, cracks, char, holes, chips, stain, noDmg, levels} },
 *         tints:{ <key>: { rules:'frost'|[...], levels:['dmg2'], glow:'#8ac8ff', parts:[...]|null } } }
 *  env: { td (텍셀/논리px), budgetMB, quality, onProgress(k) }
 *  Part: { name, w, h, k(=1/td 월드px/텍셀), <pivot>:[x,y] (텍셀, 외곽선 패드 포함), v:{base,dmg1,dmg2,deep_*,flash,glow,<tint>_*}, gl:{dmg1,dmg2}, sparks:[[x,y]] }
 */
export async function loadRig(dir, def = {}, env = {}) {
  const t0 = performance.now();
  const man = await loadManifest(dir);
  const { img, key } = await loadAtlas(dir, man);
  const srcTd = man.td;
  // 예산: 변형 수를 세어 목표 밀도에서의 메모리를 추정 → 넘으면 밀도를 낮춘다
  let td = Math.min(srcTd, env.td ?? srcTd);
  const nVar = (name) => {
    const o = { ...(def.defaults ?? {}), ...prefixOpts(def, name), ...(def.parts?.[name] ?? {}) };
    let n = o.noDmg ? 1 : 3; if (o.deep && !o.deepOnly) n += o.noDmg ? 1 : 3;
    if (o.flash) n += 2 + Object.keys(def.tints ?? {}).length; // 흰/발광 실루엣(가산용) + 틴트별 발광
    if (!o.noDmg && (def.glow)) n += 2 * 0.25;
    for (const t of Object.values(def.tints ?? {})) if ((!t.parts || t.parts.includes(name)) && !(t.skip ?? []).some((p) => name.startsWith(p))) n += (o.noDmg ? 1 : (t.levels?.length ?? 1)) * (o.deep && !o.deepOnly ? 2 : 1);
    if (!o.noDmg && budget < 8) n -= 1 + (def.glow ? 0.25 : 0);
    return n;
  };
  const memAt = (tdx) => { let b = 0; for (const [n, e] of Object.entries(man.parts)) { const f = tdx / srcTd; b += (e.w * f + PAD * 2) * (e.h * f + PAD * 2) * 4 * nVar(n); } return b / 1048576; };
  const budget = env.budgetMB ?? 15;
  const m0 = memAt(td);
  if (m0 > budget) td = Math.max(0.55, td * Math.sqrt(budget / m0) * 0.98);
  const f = td / srcTd;
  const lite = env.lite ?? budget < 8;
  const rig = { dir, man, td, parts: {}, def, bakeMs: 0, memMB: 0, key, tintKeys: Object.keys(def.tints ?? {}) };
  const outline = def.outline ?? {};
  const names = Object.keys(man.parts);
  const tm = { load: performance.now() - t0, outline: 0, dmg: 0, tint: 0, wait: 0 };
  const lap = (k, t1) => { const n2 = performance.now(); tm[k] += n2 - t1; return n2; };
  const yieldNow = async () => { const t1 = performance.now(), w = nextIdle(); if (w) { await w; lap('wait', t1); } };
  sliceStart();
  let i = 0;
  for (const name of names) {
    const e = man.parts[name];
    const o = { ...(def.defaults ?? {}), ...prefixOpts(def, name), ...(def.parts?.[name] ?? {}) };
    const raw = scaledCopy(img, e.x, e.y, e.w, e.h, e.w * f, e.h * f);
    const part = { name, e, o, k: 1 / td, v: {}, gl: {}, sparks: [], pad: PAD, rawW: raw.width, rawH: raw.height, flashOK: !!o.flash };
    const ol = (c) => outlined(c, { width: (o.outline ?? outline.width ?? 2.2) * Math.min(1.4, Math.max(0.6, td / 1.6)), color: outline.color, pad: PAD });
    let t1 = performance.now();
    part.v.base = ol(raw);
    t1 = lap('outline', t1);
    if (!o.noDmg) {
      const seed = hashName(dir + name);
      const d1 = bakeDamage(raw, 1, seed, { glow: def.glow, ...o }, !!def.glow);
      const d2 = bakeDamage(d1.canvas, 2, seed + 17, { glow: def.glow, ...o }, !!def.glow);
      t1 = lap('dmg', t1);
      // 예산이 작으면(폰) 중간 단계를 생략: dmg1 은 base 로 대체된다 (pickVariant)
      if (!lite) { part.v.dmg1 = ol(d1.canvas); part.gl.dmg1 = d1.glow; }
      part.v.dmg2 = ol(d2.canvas); part.gl.dmg2 = d2.glow ?? d1.glow;
      t1 = lap('outline', t1);
      part.sparks = [...d1.sparks, ...d2.sparks].map((q) => [q[0] + PAD, q[1] + PAD]);
    }
    if (o.flash) { part.v.flash = silhouette(part.v.base, '#fff6ee'); part.v.glow = silhouette(part.v.base, def.glow ?? '#ffffff'); }
    if (o.deep) for (const lv of ['base', 'dmg1', 'dmg2']) { if (!part.v[lv]) continue; part.v['deep_' + lv] = darkened(part.v[lv], o.deep); if (o.deepOnly) delete part.v[lv]; }
    // 피벗/점: 원본 아틀라스 텍셀 → 구운 텍셀(+패드)
    for (const [k2, v] of Object.entries(e)) {
      if (k2 === 'x' || k2 === 'y' || k2 === 'w' || k2 === 'h') continue;
      if (isPt(v)) part[k2] = [v[0] * f + PAD, v[1] * f + PAD];
      else if (isPts(v)) part[k2] = v.map((q) => [q[0] * f + PAD, q[1] * f + PAD]);
      else if (!(k2 in part)) part[k2] = v;
    }
    part.w = part.v.base?.width ?? part.v.deep_base.width; part.h = part.v.base?.height ?? part.v.deep_base.height;
    part._raw = raw;
    rig.parts[name] = part;
    env.onProgress?.(++i / names.length);
    await yieldNow();
  }
  // 틴트 변형 (예: 쌍두의 서리색) — 로딩 때 함께 굽는다 (전투 중 굽기 금지)
  for (const [tk, t] of Object.entries(def.tints ?? {})) {
    for (const part of Object.values(rig.parts)) {
      if (t.parts && !t.parts.includes(part.name)) continue;
      if ((t.skip ?? []).some((p) => part.name.startsWith(p))) continue;
      const lvs = part.o.noDmg ? ['base'] : (t.levels ?? ['base']);
      const t1 = performance.now();
      for (const lv of lvs) {
        const src = part.v[lv] ?? part.v['deep_' + lv];
        if (!src) continue;
        const tc = recolor(src, t.rules);
        if (part.v[lv]) part.v[tk + '_' + lv] = tc;
        if (part.o.deep) part.v[tk + '_deep_' + lv] = part.v[lv] ? darkened(tc, part.o.deep) : tc;
      }
      if (part.o.flash) part.v[tk + '_glow'] = silhouette(part.v.base ?? part.v.deep_base, t.glow ?? '#ffffff');
      for (const lv of lvs) if (part.gl[lv]) part.gl[tk + '_' + lv] = recolor(part.gl[lv], t.rules);   // 균열 발광도 틴트 색으로
      lap('tint', t1);
      await yieldNow();
    }
  }
  for (const part of Object.values(rig.parts)) delete part._raw;
  // 아틀라스 원본은 굽기 후 필요 없다 (디코딩된 비트맵을 붙잡지 않도록 캐시에서 뺀다)
  try { assets.cache?.delete?.(key); } catch { /* 무시 */ }
  rig.memMB = texMemMB(rig);
  rig.bakeMs = performance.now() - t0;
  rig.timing = Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, Math.round(v)]));
  return rig;
}
/** def.prefix = { 'va': {...}, 'deb': {...} } → 이름이 접두사로 시작하는 부품의 기본 옵션 (가장 긴 접두사 우선) */
function prefixOpts(def, name) {
  let best = null, bl = -1;
  for (const [p, o] of Object.entries(def.prefix ?? {})) if (name.startsWith(p) && p.length > bl) { best = o; bl = p.length; }
  return best ?? {};
}
function hashName(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }
export function texMemMB(rig) {
  let b = 0;
  for (const p of Object.values(rig.parts)) {
    for (const c of Object.values(p.v)) b += c.width * c.height * 4;
    for (const c of Object.values(p.gl)) if (c) b += c.width * c.height * 4;   // (틴트 발광 포함)
  }
  return b / 1048576;
}
const LV = ['base', 'dmg1', 'dmg2'];
/** 변형 선택 (없으면 낮은 단계 → 틴트 없음 → deep/비deep 순으로 대체) */
export function pickVariant(part, level = 0, deep = false, tint = null) {
  const cache = part._pk ??= new Map();
  const ck = (tint ?? '') + (deep ? 'D' : 'N') + level;
  let v = cache.get(ck);
  if (v) return v;
  const v2 = part.v;
  for (let lv = level; lv >= 0 && !v; lv--) {
    const L = LV[lv];
    if (tint) v = v2[tint + '_' + (deep ? 'deep_' : '') + L] ?? v2[tint + '_' + L];
    if (!v) v = v2[(deep ? 'deep_' : '') + L] ?? v2[L] ?? v2['deep_' + L];
  }
  v ??= v2.base ?? v2.deep_base;
  cache.set(ck, v);
  return v;
}

// ───────────────────────── 그리기 (변환 합성) ─────────────────────────
/** 모든 부품을 ctx.setTransform(카메라 × 지역) 한 번 + drawImage 한 번으로 그린다 */
export class Drawer {
  constructor() { this.m = [1, 0, 0, 1, 0, 0]; this.ctx = null; this.log = []; this.rec = false; }
  begin(ctx) { const t = ctx.getTransform(); const m = this.m; m[0] = t.a; m[1] = t.b; m[2] = t.c; m[3] = t.d; m[4] = t.e; m[5] = t.f; this.ctx = ctx; }
  /** 기준(카메라) 변환으로 되돌림 — 일반 경로 그리기 전에 호출 */
  end() { const m = this.m; this.ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }
  /** 이미지의 텍셀 (px,py) 가 월드 (x,y) 에 오도록, rot 회전, sx/sy (월드px/텍셀, 음수 = 뒤집기) */
  img(img, px, py, x, y, rot, sx, sy, alpha = 1) {
    if (alpha <= 0.004 || !sx || !sy || !img) return;
    this.set(px, py, x, y, rot, sx, sy);
    const ctx = this.ctx;
    if (alpha !== 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha; ctx.drawImage(img, 0, 0); ctx.globalAlpha = ga; }
    else ctx.drawImage(img, 0, 0);
  }
  /** 변환만 설정 (텍셀 좌표계에서 직접 경로를 그릴 때) */
  set(px, py, x, y, rot, sx, sy) {
    const m = this.m, c = Math.cos(rot), s = Math.sin(rot);
    const a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
    const e = x - (a * px + cc * py), f = y - (b * px + d * py);
    this.ctx.setTransform(m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * cc + m[2] * d, m[1] * cc + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]);
  }
  /** 부품 그리기: pivot 이름(또는 [x,y]) 을 (x,y) 에 */
  part(part, img, pivot, x, y, rot, sx, sy, alpha = 1) {
    const pv = typeof pivot === 'string' ? part[pivot] : pivot;
    this.img(img, pv[0], pv[1], x, y, rot, sx, sy, alpha);
    if (this.rec && part.flashOK) this.log.push(part, pv[0], pv[1], x, y, rot, sx, sy, alpha);
  }
  /** 같은 배치로 놓인 부품의 텍셀 점 q 의 월드 좌표 */
  pt(px, py, qx, qy, x, y, rot, sx, sy, out = [0, 0]) {
    const c = Math.cos(rot), s = Math.sin(rot), lx = (qx - px) * sx, ly = (qy - py) * sy;
    out[0] = x + c * lx - s * ly; out[1] = y + s * lx + c * ly; return out;
  }
  /** 피격 섬광: 기록된 부품을 흰 실루엣으로 가산 덧그림 */
  startFlash() { this.log.length = 0; this.rec = true; }
  flash(alpha, key = 'flash') {
    this.rec = false;
    if (!this.log.length || alpha <= 0.01) return;
    const ctx = this.ctx, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const L = this.log;
    for (let j = 0; j < L.length; j += 9) { const p = L[j], im = p.v[key] ?? p.v.flash; if (im) this.img(im, L[j + 1], L[j + 2], L[j + 3], L[j + 4], L[j + 5], L[j + 6], L[j + 7], L[j + 8] * alpha); }
    ctx.globalCompositeOperation = op;
    this.log.length = 0;
  }
}

// ───────────────────────── 체인 (척추·꼬리·촉수) ─────────────────────────
/**
 * 점 목록 P[0..n] (머리 → 뿌리) 을 받아 뿌리에서부터의 누적 호 길이를 계산.
 *  at(d) → 뿌리에서 d 만큼 떨어진 점, frames() → 마디별 {x,y,a,len,bend}
 * bend = 이웃 마디와의 각도 차이 (굽힘이 클수록 타일을 늘려 바깥쪽 틈을 덮는다)
 */
export class Chain {
  constructor(max = 64) { this.arc = new Float32Array(max + 1); this.P = null; this.n = 0; this.F = []; for (let i = 0; i < max; i++) this.F.push({ x: 0, y: 0, a: 0, len: 0, bend: 0, i }); }
  set(P, n) {
    this.P = P; this.n = n;
    const arc = this.arc; arc[n] = 0;
    for (let i = n - 1; i >= 0; i--) arc[i] = arc[i + 1] + Math.hypot(P[i].x - P[i + 1].x, P[i].y - P[i + 1].y);
    return this;
  }
  get length() { return this.arc[0]; }
  at(d, o = { x: 0, y: 0, a: 0 }) {
    const P = this.P, arc = this.arc, n = this.n;
    for (let i = n - 1; i >= 0; i--) {
      if (arc[i] >= d) {
        const seg = arc[i] - arc[i + 1] || 1, u = (d - arc[i + 1]) / seg;
        o.x = P[i + 1].x + (P[i].x - P[i + 1].x) * u; o.y = P[i + 1].y + (P[i].y - P[i + 1].y) * u;
        o.a = Math.atan2(P[i].y - P[i + 1].y, P[i].x - P[i + 1].x); return o;
      }
    }
    o.x = P[0].x; o.y = P[0].y; o.a = n > 0 ? Math.atan2(P[0].y - P[1].y, P[0].x - P[1].x) : 0; return o;
  }
  /** 마디 프레임 (i = 0 이 머리 쪽). 각도는 뿌리→머리 방향 */
  frames() {
    const P = this.P, n = this.n, F = this.F;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[i + 1], f = F[i];
      f.x = (a.x + b.x) / 2; f.y = (a.y + b.y) / 2; f.a = Math.atan2(a.y - b.y, a.x - b.x); f.len = Math.hypot(a.x - b.x, a.y - b.y);
    }
    for (let i = 0; i < n; i++) {
      const f = F[i];
      const d0 = i > 0 ? angDiff(F[i - 1].a, f.a) : 0, d1 = i < n - 1 ? angDiff(f.a, F[i + 1].a) : 0;
      f.bend = Math.max(Math.abs(d0), Math.abs(d1));
      f.turn = (d0 + d1) / 2;   // 부호 있는 굽힘 (관절 원판 방향용)
    }
    return F;
  }
}
export function angDiff(a, b) { let d = a - b; d = Math.atan2(Math.sin(d), Math.cos(d)); return d; }

// ───────────────────────── 2관절 팔다리 ─────────────────────────
/** 어깨 (ax,ay) → 목표 (tx,ty), 위팔 l1, 아래팔 l2, bend=±1 (팔꿈치 방향). out = {ex,ey, a1, a2, reach(0..1)} */
export function ik2(ax, ay, tx, ty, l1, l2, bend = 1, out = {}) {
  let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy) || 1e-6;
  const maxD = (l1 + l2) * 0.999, minD = Math.abs(l1 - l2) * 1.001 + 1e-6;
  const dc = Math.min(maxD, Math.max(minD, d));
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const a1 = base - bend * A;
  out.ex = ax + Math.cos(a1) * l1; out.ey = ay + Math.sin(a1) * l1;
  out.hx = ax + Math.cos(base) * dc; out.hy = ay + Math.sin(base) * dc;
  out.a1 = a1; out.a2 = Math.atan2(out.hy - out.ey, out.hx - out.ex); out.reach = dc / (l1 + l2);
  return out;
}

// ───────────────────────── verlet 줄 ─────────────────────────
export class Strand {
  constructor(n, seg, o = {}) {
    this.n = n; this.seg = seg; this.p = new Float32Array(n * 2); this.q = new Float32Array(n * 2);
    this.g = o.g ?? 900; this.damp = o.damp ?? 0.94; this.pinB = !!o.pinB; this.init = false; this.wx = 0;
  }
  /** a = 고정점, b = 두 번째 고정점 (pinB 일 때) */
  step(dt, ax, ay, bx = 0, by = 0, re = false) {
    const p = this.p, q = this.q, n = this.n;
    if (!this.init) { for (let i = 0; i < n; i++) { const u = i / (n - 1); p[i * 2] = q[i * 2] = this.pinB ? ax + (bx - ax) * u : ax; p[i * 2 + 1] = q[i * 2 + 1] = this.pinB ? ay + (by - ay) * u : ay + i * this.seg; } this.init = true; }
    const d2 = dt * dt * this.g, w2 = dt * dt * this.wx;
    for (let i = 1; i < n; i++) {
      const x = p[i * 2], y = p[i * 2 + 1];
      p[i * 2] += (x - q[i * 2]) * this.damp + w2 * (i / n); p[i * 2 + 1] += (y - q[i * 2 + 1]) * this.damp + d2;
      q[i * 2] = x; q[i * 2 + 1] = y;
    }
    p[0] = ax; p[1] = ay;
    const seg = this.seg;
    for (let it = 0; it < 3; it++) {
      if (this.pinB) { p[(n - 1) * 2] = bx; p[(n - 1) * 2 + 1] = by; }
      for (let i = 1; i < n; i++) {
        const dx = p[i * 2] - p[i * 2 - 2], dy = p[i * 2 + 1] - p[i * 2 - 1], d = Math.hypot(dx, dy) || 1, k = (d - seg) / d;
        if (this.pinB && d < seg) continue;
        if (i === 1) { p[2] -= dx * k; p[3] -= dy * k; }
        else { p[i * 2 - 2] += dx * k * 0.5; p[i * 2 - 1] += dy * k * 0.5; p[i * 2] -= dx * k * 0.5; p[i * 2 + 1] -= dy * k * 0.5; }
      }
      p[0] = ax; p[1] = ay;
    }
    if (this.pinB) { p[(n - 1) * 2] = bx; p[(n - 1) * 2 + 1] = by; }
    // 고정점이 순간이동하면(구멍 이동 등) 늘어진 줄을 그리지 않도록 다시 매단다
    for (let i = 1; i < n; i++) {
      const dx = p[i * 2] - p[i * 2 - 2], dy = p[i * 2 + 1] - p[i * 2 - 1];
      if (dx * dx + dy * dy > (seg * 3) ** 2) { if (!re) { this.init = false; this.step(0, ax, ay, bx, by, true); } break; }
    }
  }
  tip(o = {}) { o.x = this.p[(this.n - 1) * 2]; o.y = this.p[(this.n - 1) * 2 + 1]; return o; }
}
/** 줄 그리기: 어두운 테 → 살색 → 가는 하이라이트 (한 경로, 세 번 획) */
export function drawStrand(ctx, st, w, cols = ['#1a0605', '#5e1c12', '#b0604a'], alpha = 1) {
  const p = st.p, n = st.n;
  ctx.beginPath(); ctx.moveTo(p[0], p[1]);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(p[i * 2], p[i * 2 + 1], (p[i * 2] + p[i * 2 + 2]) / 2, (p[i * 2 + 1] + p[i * 2 + 3]) / 2);
  ctx.lineTo(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = cols[0]; ctx.lineWidth = w; ctx.stroke();
  ctx.strokeStyle = cols[1]; ctx.lineWidth = w * 0.6; ctx.stroke();
  if (cols[2]) { ctx.strokeStyle = cols[2]; ctx.lineWidth = Math.max(0.6, w * 0.18); ctx.stroke(); }
  ctx.globalAlpha = ga;
}

// ───────────────────────── 발광 퍼프 ─────────────────────────
const _puff = new Map();
/** 부드러운 원형 퍼프 스프라이트 (색별 1회 생성). core=true 면 흰 심 */
export function puff(color, core = false) {
  const k = color + (core ? '*' : '');
  let cv = _puff.get(k);
  if (!cv) {
    cv = makeCanvas(64, 64);
    const c = ctx2d(cv), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (core) { g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.16, rgba(color, 0.9)); }
    else g.addColorStop(0, rgba(color, 0.9));
    g.addColorStop(0.45, rgba(color, 0.4)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); _puff.set(k, cv);
  }
  return cv;
}
/** 가산 발광 (x,y 중심, 반지름 r) */
export function halo(ctx, x, y, r, color, a = 1, core = false) {
  if (a <= 0.01 || r < 1) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(puff(color, core), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}
export const glowSprite = (color) => puff(color, true);

// ───────────────────────── 입자 (풀링 · 묶음 그리기) ─────────────────────────
// 모든 값은 월드 좌표. layer 0 = 몸 뒤, 1 = 몸 앞.
// preset: {draw:'flake'|'dot'|'puff'|'drop'|'splat'|'streak'|'chip', g 중력, drag(프레임당 60Hz 기준), life:[a,b], size:[a,b], color, add, sway, floor:'splat'|'bounce'|null}
export const PRESET = {
  ash: { draw: 'flake', g: 30, drag: 0.985, life: [1.6, 3], size: [1.4, 3], color: 'rgba(28,24,22,0.85)', sway: 16 },
  ashLight: { draw: 'flake', g: 20, drag: 0.985, life: [1.4, 2.6], size: [1.2, 2.6], color: 'rgba(170,160,140,0.6)', sway: 14 },
  ember: { draw: 'dot', g: -90, drag: 0.975, life: [0.7, 1.6], size: [1, 2.4], color: '#ff9a3a', add: true, sway: 10 },
  boneDust: { draw: 'puff', g: -18, drag: 0.93, life: [0.5, 1.1], size: [5, 12], color: '#b8a98c', alpha: 0.5 },
  smoke: { draw: 'puff', g: -40, drag: 0.95, life: [1, 2], size: [10, 22], color: '#1d2a1f', alpha: 0.5 },
  spore: { draw: 'dot', g: -12, drag: 0.99, life: [2, 4], size: [1.2, 2.2], color: '#c8ff9a', add: true, sway: 22 },
  spark: { draw: 'streak', g: 900, drag: 0.97, life: [0.18, 0.4], size: [1.2, 2], color: '#fff0c0', add: true },
  ichor: { draw: 'drop', g: 1500, drag: 1, life: [2, 3], size: [1.4, 2.6], color: '#0e1a0b', hi: '#7dff9a', floor: 'splat' },
  blood: { draw: 'drop', g: 1500, drag: 1, life: [2, 3], size: [1.4, 2.8], color: '#4a0608', hi: '#ff6a5a', floor: 'splat' },
  splat: { draw: 'splat', g: 0, drag: 1, life: [1.6, 2.6], size: [4, 8], color: '#0e1a0b', hi: '#7dff9a' },
  chip: { draw: 'chip', g: 1600, drag: 0.995, life: [1, 1.8], size: [2, 4.5], color: '#d6c7a4', floor: 'bounce' },
};
const _presetNames = Object.keys(PRESET);
const _presetIdx = Object.fromEntries(_presetNames.map((n, i) => [n, i]));
export class Particles {
  constructor(max = 400) {
    this.max = max; this.n = 0;
    const F = () => new Float32Array(max);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.life0 = F(); this.s = F(); this.r = F(); this.hang = F(); this.lay = new Uint8Array(max);
    this.k = new Uint8Array(max); this.c = new Array(max); this.h = new Array(max);
    this.floorY = 1e9; this.t = 0;
  }
  /** preset 이름, 위치, 속도. o: {color, hi, size, life, layer, hang(매달림 초)} */
  emit(preset, x, y, vx = 0, vy = 0, o = null) {
    if (this.n >= this.max) return -1;
    const P = PRESET[preset]; if (!P) return -1;
    const i = this.n++;
    this.k[i] = _presetIdx[preset]; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    const life = o?.life ?? rr.range(P.life[0], P.life[1]);
    this.life[i] = this.life0[i] = life; this.s[i] = o?.size ?? rr.range(P.size[0], P.size[1]); this.r[i] = rr.next() * 6.283;
    this.c[i] = o?.color ?? P.color; this.h[i] = o?.hi ?? P.hi; this.lay[i] = o?.layer ?? 1; this.hang[i] = o?.hang ?? 0;
    return i;
  }
  /** 원형 퍼짐: 속도 speed, 각도 angle±spread (없으면 전방향) */
  burst(preset, x, y, n, { speed = 120, angle = null, spread = 3.14, jitter = 0, ...o } = {}) {
    for (let j = 0; j < n; j++) {
      const a = angle == null ? rr.next() * 6.283 : angle + (rr.next() - 0.5) * 2 * spread, sp = speed * rr.range(0.45, 1.1);
      this.emit(preset, x + (rr.next() - 0.5) * 2 * jitter, y + (rr.next() - 0.5) * 2 * jitter, Math.cos(a) * sp, Math.sin(a) * sp, o);
    }
  }
  update(dt, floorY = this.floorY) {
    this.floorY = floorY; this.t += dt;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      if (this.hang[i] > 0) { this.hang[i] -= dt; i++; continue; }
      const P = PRESET[_presetNames[this.k[i]]];
      if (P.drag !== 1) { const d = Math.pow(P.drag, dt * 60); this.vx[i] *= d; this.vy[i] *= d; }
      this.vy[i] += P.g * dt;
      const sway = P.sway ? Math.sin(this.t * 2 + this.r[i]) * P.sway : 0;
      this.x[i] += (this.vx[i] + sway) * dt; this.y[i] += this.vy[i] * dt;
      if (P.floor && this.y[i] >= floorY - 1) {
        if (P.floor === 'splat') {
          const x = this.x[i], s = this.s[i], c = this.c[i], h = this.h[i];
          this.kill(i);
          this.emit('splat', x, floorY - 1, 0, 0, { size: s * rr.range(2.2, 3.6), color: c, hi: h, layer: 1 });
          continue;
        }
        this.y[i] = floorY - 1; this.vy[i] *= -0.28; this.vx[i] *= 0.55;
      }
      if (P.draw === 'chip') this.r[i] += dt * (8 + Math.abs(this.vx[i]) * 0.02);
      i++;
    }
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.k[i] = this.k[j]; this.x[i] = this.x[j]; this.y[i] = this.y[j]; this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j];
    this.life[i] = this.life[j]; this.life0[i] = this.life0[j]; this.s[i] = this.s[j]; this.r[i] = this.r[j];
    this.c[i] = this.c[j]; this.h[i] = this.h[j]; this.lay[i] = this.lay[j]; this.hang[i] = this.hang[j];
  }
  clear() { this.n = 0; }
  /** 월드 변환이 걸린 ctx 에 그리기. layer 0/1 */
  draw(ctx, layer = 1) {
    const N = this.n; if (!N) return;
    const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    for (let pk = 0; pk < _presetNames.length; pk++) {
      const P = PRESET[_presetNames[pk]];
      let any = false;
      for (let i = 0; i < N; i++) if (this.k[i] === pk && this.lay[i] === layer) { any = true; break; }
      if (!any) continue;
      ctx.globalCompositeOperation = P.add ? 'lighter' : 'source-over';
      switch (P.draw) {
        case 'flake': this._flakes(ctx, pk, layer); break;
        case 'dot': this._dots(ctx, pk, layer, ga); break;
        case 'puff': for (let i = 0; i < N; i++) {
          if (this.k[i] !== pk || this.lay[i] !== layer) continue;
          const u = this.life[i] / this.life0[i], s = this.s[i] * (1.6 - u * 0.9);
          ctx.globalAlpha = ga * u * (P.alpha ?? 0.5);
          ctx.drawImage(puff(this.c[i]), this.x[i] - s, this.y[i] - s, s * 2, s * 2);
        } break;
        case 'drop': this._drops(ctx, pk, layer, ga); break;
        case 'splat': for (let i = 0; i < N; i++) {
          if (this.k[i] !== pk || this.lay[i] !== layer) continue;
          const u = this.life[i] / this.life0[i], grow = Math.min(1, (1 - u) * 10 + 0.2), s = this.s[i] * grow;
          ctx.globalAlpha = ga * Math.min(1, u * 2.2) * 0.85;
          ctx.fillStyle = this.c[i]; ctx.beginPath(); ctx.ellipse(this.x[i], this.y[i], s, s * 0.24, 0, 0, TAU); ctx.fill();
          if (this.h[i]) { ctx.globalAlpha *= 0.55; ctx.fillStyle = this.h[i]; ctx.beginPath(); ctx.ellipse(this.x[i] - s * 0.25, this.y[i] - s * 0.05, s * 0.3, s * 0.06, 0, 0, TAU); ctx.fill(); }
        } break;
        case 'streak': ctx.beginPath(); for (let i = 0; i < N; i++) {
          if (this.k[i] !== pk || this.lay[i] !== layer) continue;
          ctx.moveTo(this.x[i], this.y[i]); ctx.lineTo(this.x[i] - this.vx[i] * 0.03, this.y[i] - this.vy[i] * 0.03);
        } ctx.globalAlpha = ga; ctx.lineCap = 'round'; ctx.strokeStyle = P.color; ctx.lineWidth = 1.6; ctx.stroke(); break;
        case 'chip': ctx.beginPath(); for (let i = 0; i < N; i++) {
          if (this.k[i] !== pk || this.lay[i] !== layer) continue;
          const s = this.s[i], x = this.x[i], y = this.y[i], a = this.r[i], c = Math.cos(a) * s, sn = Math.sin(a) * s;
          ctx.moveTo(x - c, y - sn); ctx.lineTo(x + sn * 0.6, y - c * 0.6); ctx.lineTo(x + c, y + sn); ctx.lineTo(x - sn * 0.5, y + c * 0.5); ctx.closePath();
        } ctx.globalAlpha = ga; ctx.fillStyle = P.color; ctx.fill(); ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(40,26,14,0.9)'; ctx.stroke(); break;
      }
    }
    ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
  }
  _flakes(ctx, pk, layer) {
    ctx.beginPath();
    let col = null;
    for (let i = 0; i < this.n; i++) {
      if (this.k[i] !== pk || this.lay[i] !== layer) continue;
      col ??= this.c[i];
      const s = this.s[i], x = this.x[i], y = this.y[i], a = this.r[i] + this.life[i] * 3, cx = Math.cos(a) * s, sy = Math.sin(a) * s * 0.5;
      ctx.moveTo(x - cx, y - sy); ctx.lineTo(x + sy, y - cx * 0.4); ctx.lineTo(x + cx, y + sy); ctx.lineTo(x - sy * 0.5, y + cx * 0.4); ctx.closePath();
    }
    ctx.fillStyle = col; ctx.fill();
  }
  _dots(ctx, pk, layer, ga) {
    // 색별 묶음 (보통 1~2색)
    const cols = this._cols ??= [];
    cols.length = 0;
    for (let i = 0; i < this.n; i++) if (this.k[i] === pk && this.lay[i] === layer && !cols.includes(this.c[i])) cols.push(this.c[i]);
    for (const col of cols) {
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i < this.n; i++) {
          if (this.k[i] !== pk || this.lay[i] !== layer || this.c[i] !== col) continue;
          const u = this.life[i] / this.life0[i], s = this.s[i] * (pass ? 1 : 3) * (0.35 + u * 0.65);
          ctx.moveTo(this.x[i] + s, this.y[i]); ctx.arc(this.x[i], this.y[i], s, 0, TAU);
        }
        ctx.globalAlpha = ga * (pass ? 0.95 : 0.3);
        ctx.fillStyle = pass ? '#f4fff0' : col; ctx.fill();
      }
    }
    ctx.globalAlpha = ga;
  }
  _drops(ctx, pk, layer, ga) {
    const cols = this._cols ??= [];
    cols.length = 0;
    for (let i = 0; i < this.n; i++) if (this.k[i] === pk && this.lay[i] === layer && !cols.includes(this.c[i])) cols.push(this.c[i]);
    ctx.lineCap = 'round';
    for (const col of cols) {
      let hi = null;
      ctx.beginPath();
      for (let i = 0; i < this.n; i++) {
        if (this.k[i] !== pk || this.lay[i] !== layer || this.c[i] !== col) continue;
        hi ??= this.h[i];
        const st = this.hang[i] > 0 ? 2.2 : Math.min(5, 1 + this.vy[i] * 0.01), r = this.s[i];
        ctx.moveTo(this.x[i], this.y[i] - r * st * 1.5); ctx.lineTo(this.x[i], this.y[i]);
      }
      ctx.globalAlpha = ga; ctx.strokeStyle = col; ctx.lineWidth = 3.2; ctx.stroke();
      if (hi) {
        ctx.beginPath();
        for (let i = 0; i < this.n; i++) { if (this.k[i] !== pk || this.lay[i] !== layer || this.c[i] !== col) continue; ctx.moveTo(this.x[i] + 0.8, this.y[i] - 0.6); ctx.arc(this.x[i] - 0.3, this.y[i] - 0.6, 0.9, 0, TAU); }
        ctx.globalAlpha = ga * 0.75; ctx.fillStyle = hi; ctx.fill();
      }
    }
    ctx.globalAlpha = ga;
  }
}

// ───────────────────────── 손상 단계 추적 ─────────────────────────
/** 체력 비율 → 단계 (thresholds 내림차순, 예: [0.6, 0.3] → 0,1,2). update() 는 단계가 오른 순간에만 새 단계를, 아니면 -1 */
export class DamageState {
  constructor(thresholds = [0.6, 0.3]) { this.th = thresholds; this.level = -1; this.t = 0; }
  levelOf(ratio) { let l = 0; for (const t of this.th) if (ratio < t) l++; return Math.min(2, l); }
  update(ratio, dt = 0) {
    this.t += dt;
    const l = this.levelOf(ratio);
    if (this.level < 0) { this.level = l; return -1; }       // 첫 호출 (중간 단계로 시작해도 폭발 없음)
    if (l > this.level) { this.level = l; this.t = 0; return l; }
    if (l < this.level) this.level = l;                       // 부활 등으로 회복
    return -1;
  }
}

// ───────────────────────── 사망 붕괴 파편 (강체) ─────────────────────────
/** 부품 이미지(또는 조각)가 떨어져 튕기고 굴러 멈춘다. draw 는 Drawer 로 */
export class Shards {
  constructor(max = 48) { this.list = []; this.max = max; }
  spawn(img, px, py, x, y, rot, sx, sy, vx, vy, vr, o = {}) {
    if (this.list.length >= this.max) return null;
    const s = { img, px, py, x, y, rot, sx, sy, vx, vy, vr, t: 0, rest: 0, fade: o.fade ?? 2.6, bounce: o.bounce ?? 0.32, r: o.r ?? 10, glow: o.glow ?? null, a: 1 };
    this.list.push(s); return s;
  }
  update(dt, floorY) {
    for (const s of this.list) {
      s.t += dt;
      s.vy += 1700 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      if (s.y + s.r > floorY) {
        s.y = floorY - s.r;
        if (s.vy > 60) { s.vy *= -s.bounce; s.vx *= 0.6; s.vr *= 0.5; } else { s.vy = 0; s.vx *= 0.85; s.vr *= 0.8; s.rest += dt; }
      }
      s.a = Math.max(0, Math.min(1, (s.fade - s.t) / 0.5));
    }
    this.list = this.list.filter((s) => s.a > 0);
  }
  draw(D) { for (const s of this.list) D.img(s.img, s.px, s.py, s.x, s.y, s.rot, s.sx, s.sy, s.a); }
  clear() { this.list.length = 0; }
}
