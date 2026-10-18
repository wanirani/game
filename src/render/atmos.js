// 「숨쉬는 원경」 (Stage 5 P2): 원경 그림을 살아 있게 — 그림 속 불·창·달의 일렁이는 빛, 두 겹의 안개, 흔들리는 빛줄기,
// 그리고 그림 속 불이 플레이 층(주인공·적)을 비추는 광원 하나 (world.lighting.add).
// 데이터: src/data/atmos.js (tools/atmos/find_lights.py 가 그림에서 찾고 손으로 확인한 값). 이 파일은 그리기만 한다.
//
//   createAtmos(stage) → atm | null      background.js 가 createBackground 에서 부른다 (항목이 없거나 ?atmos=0 이면 null → 예전 그대로)
//   atm.update(dt, world)                bg.update 에서 (품질 단계·동작 줄이기·광원 넘김 예약)
//   atm.drawFar(ctx, cam, vw, vh, F)     bg.drawFar 에서 원경 그림·누름 바로 뒤 (F = bg.far: 그림 배치 ox/oy/iw/ih)
//   atm.drawFront(ctx, cam, vw, vh)      bg.drawFront 에서 안개 띠 뒤, 날씨 앞 (인물 앞 안개)
//
// 성능 규칙 (MASTER_PLAN §5.2): 스프라이트는 방을 불러올 때 굽고(캔버스는 페이지에 한 벌만 만들어 다시 칠함), 프레임마다
// 그라데이션·캔버스를 만들지 않는다. 한 프레임의 drawImage: 빛 1 + 원경 안개 1 (중간) · + 앞 안개 1 + 빛줄기 1 (높음) — 최대 4.
// 그 밖에 플레이 층 광원 하나를 world.lighting 에 넘긴다 (중간·높음; 조명 층이 원래 하던 그리기 2번: 어둠 구멍 + 색광).
// 단계: 낮음 = 이 층은 아무것도 그리지 않음 (창문 빛깔·바닥 안착은 render/tiles.js 가 굽는다) · 중간 = 빛 + 원경 안개 + 광원 ·
// 높음 = + 앞 안개 + 빛줄기. 동작 줄이기(settings.reduceMotion) = 일렁임·흔들림·흐름을 25 % 빠르기로.
// 앞 안개는 HUD 아래(월드 렌더 안)에서만 그리고, 화면 어디서도 알파 0.18 을 넘지 않는다 (스프라이트 알파 ≤ 1 × fog.near ≤ 0.18;
// 보스전에서는 그 55 %) — 예고 표시·탄의 대비를 지킨다.
// URL ?atmos=0 = 이 층 + 새 창문 빛깔 + 바닥 안착을 모두 끔 (전후 비교 캡처). setAtmosEnabled(false) 는 QA 도구용 실행 중 끄기.
import { ATMOS } from '../data/atmos.js';
import { rgba, clamp } from '../core/math.js';

const URL_OFF = (() => { try { return typeof location !== 'undefined' && /[?&]atmos=0(?:&|$)/.test(location.search || ''); } catch { return false; } })();
let enabled = true;
/** ?atmos=0 (전후 비교): 원경 층·새 창문 빛깔·바닥 안착을 모두 예전대로 */
export const atmosLegacy = () => URL_OFF;
/** QA 도구용: 실행 중 원경 층만 끄고 켠다 (구운 타일·창문은 그대로) */
export function setAtmosEnabled(on) { enabled = !!on; }
/** 원경 그림 키(stage.bg) → 데이터 항목 | null */
export function atmosEntry(bgKey) { return (bgKey && Object.prototype.hasOwnProperty.call(ATMOS, bgKey)) ? ATMOS[bgKey] : null; }
/** render/tiles.js 창문 대체 빛깔 [유리 위, 유리 아래, 빛줄기] | null */
export function atmosWindowTint(bgKey) { const e = atmosEntry(bgKey); return Array.isArray(e?.windowTint) && e.windowTint.length === 3 ? e.windowTint : null; }

/** 항목이 없는 원경의 창문 빛깔: 그림을 16×8 로 줄여 가장 밝은 1/4 칸의 평균색 → [유리 위, 유리 아래, 빛줄기] (그림마다 한 번, 캐시) */
const _tints = new WeakMap();
let _tc = null;
export function paintingTint(img) {
  if (!img || !(img.width > 0) || typeof document === 'undefined') return null;
  if (_tints.has(img)) return _tints.get(img);
  let out = null;
  try {
    _tc ??= document.createElement('canvas');
    _tc.width = 16; _tc.height = 8;
    const g = _tc.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 16, 8);
    const d = g.getImageData(0, 0, 16, 8).data, px = [];
    for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2], 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]]);
    px.sort((p, q) => q[3] - p[3]);
    const top = px.slice(0, Math.max(1, px.length >> 2));
    const c = [0, 1, 2].map((k) => top.reduce((s, p) => s + p[k], 0) / top.length);
    const m = Math.max(1, ...c), k = Math.min(1.6, 235 / m);   // 밝기를 창 빛 정도로 끌어올림
    const r = Math.round(c[0] * k), gg = Math.round(c[1] * k), b = Math.round(c[2] * k);
    out = [`rgba(${r},${gg},${b},0.5)`, `rgba(${Math.round(r * 0.4)},${Math.round(gg * 0.4)},${Math.round(b * 0.4)},0.25)`, `rgba(${r},${gg},${b},0.12)`];
  } catch { out = null; }
  _tints.set(img, out);
  return out;
}

const GLOW_PX = 320;   // 그림 폭 전체 = 빛 스프라이트 320 px (부드러운 빛이라 늘여 그려도 충분)
const VARS = 3;        // 빛 스프라이트 변형 수 (불빛 세기를 저마다 다르게 구운 것 — 초당 7번 골라 그려 따로따로 일렁이게)
const FOG_W = 512, FOG_H = 64;   // 안개 한 칸 (가로로 이어지는 잡음), 아틀라스 = 두 번 이어 붙인 1024 × (먼 64 + 앞 64)
const RAY_W = 128, RAY_H = 256;
const MAX_GLOW_H = 160;

// 페이지에 한 벌만 두는 캔버스 (방·스테이지가 바뀌면 같은 캔버스에 다시 칠한다 → 스테이지 도중 새 캔버스 0)
const C = { glow: null, fog: null, ray: null, glowKey: '', fogKey: '', rayKey: '' };
const mkCanvas = () => { const c = document.createElement('canvas'); c.width = 0; c.height = 0; return c; };
function canvases() {
  if (typeof document === 'undefined' || !document.createElement) return false;
  C.glow ??= mkCanvas(); C.fog ??= mkCanvas(); C.ray ??= mkCanvas();
  return true;
}

// 결정적 잡음 (Math.random 을 쓰지 않음: 같은 그림은 늘 같은 안개·같은 일렁임)
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
const sstep = (x) => x * x * (3 - 2 * x);

/** 그림 기준 빛들이 차지하는 상자 (u0,v0,u1,v1) — 빛 스프라이트는 이 상자만 굽고 그린다 (채우기 면적 절약) */
function lightBox(lights, aspect) {
  let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
  for (const l of lights) {
    const ru = (l.r * 1.05) / aspect, rv = l.r * 1.05;
    u0 = Math.min(u0, l.u - ru); u1 = Math.max(u1, l.u + ru); v0 = Math.min(v0, l.v - rv); v1 = Math.max(v1, l.v + rv);
  }
  return { u0: clamp(u0, 0, 1), v0: clamp(v0, 0, 1), u1: clamp(u1, 0, 1), v1: clamp(v1, 0, 1) };
}

/** 빛 스프라이트: 상자 영역을 VARS 개 세로로 쌓은 캔버스. 변형마다 일렁이는 빛(flicker)의 세기를 저마다 조금씩 낮춰 굽는다 */
function bakeGlow(key, e, aspect) {
  const box = lightBox(e.lights, aspect);
  const pxU = GLOW_PX, pxV = GLOW_PX / aspect;
  const gw = Math.max(8, Math.ceil((box.u1 - box.u0) * pxU)), gh = Math.max(8, Math.min(MAX_GLOW_H, Math.ceil((box.v1 - box.v0) * pxV)));
  const sy = gh / Math.max(1e-3, (box.v1 - box.v0) * pxV);   // MAX_GLOW_H 로 줄였으면 세로만 조금 눌러 굽는다 (그릴 때 다시 늘어남)
  const c = C.glow;
  if (C.glowKey !== key || c.width !== gw || c.height !== gh * VARS) {
    c.width = gw; c.height = gh * VARS;
    const g = c.getContext('2d');
    g.clearRect(0, 0, gw, gh * VARS);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < VARS; k++) {
      e.lights.forEach((l, i) => {
        const fl = clamp(l.flicker ?? 1, 0, 1);
        const m = k === 0 ? 1 : 1 - fl * (0.18 + 0.42 * hash(i * 131 + k * 977 + 7));
        const x = (l.u - box.u0) * pxU, y = ((l.v - box.v0) * pxV) * sy + k * gh, R = Math.max(2, l.r * pxV);
        g.save(); g.translate(x, y); g.scale(1, sy);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
        gr.addColorStop(0, rgba(l.color, 0.62 * m)); gr.addColorStop(0.3, rgba(l.color, 0.3 * m)); gr.addColorStop(0.65, rgba(l.color, 0.09 * m)); gr.addColorStop(1, rgba(l.color, 0));
        g.fillStyle = gr; g.fillRect(-R, -R, R * 2, R * 2);
        g.restore();
      });
    }
    g.globalCompositeOperation = 'source-over';
    C.glowKey = key;
  }
  return { box, gw, gh };
}

/** 안개 아틀라스: 가로로 이어지는 값 잡음(fbm) 512×64 두 장 (먼 안개 = 가운데가 짙은 띠, 앞 안개 = 아래가 짙은 띠), 각각 두 번 이어 붙임 */
function bakeFog(color) {
  const c = C.fog;
  if (C.fogKey === color && c.width === FOG_W * 2) return;
  c.width = FOG_W * 2; c.height = FOG_H * 2;
  const g = c.getContext('2d');
  const img = g.createImageData(FOG_W, FOG_H * 2);
  const d = img.data;
  const hex = String(color || '#ffffff').replace('#', '');
  const cr = parseInt(hex.slice(0, 2), 16) || 255, cg = parseInt(hex.slice(2, 4), 16) || 255, cb = parseInt(hex.slice(4, 6), 16) || 255;
  // 값 잡음: 가로 주기 = 격자 칸 수 (이음매 없음)
  const vnoise = (x, y, cells, seed) => {
    const fx = x * cells, fy = y * cells * (FOG_H / FOG_W) * 4;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = sstep(fx - ix), ty = sstep(fy - iy);
    const h = (a, b) => hash(((((a % cells) + cells) % cells) * 73856093) ^ (b * 19349663) ^ seed);
    const a = h(ix, iy), b = h(ix + 1, iy), cc = h(ix, iy + 1), dd = h(ix + 1, iy + 1);
    return (a + (b - a) * tx) * (1 - ty) + (cc + (dd - cc) * tx) * ty;
  };
  for (let band = 0; band < 2; band++) {
    for (let y = 0; y < FOG_H; y++) {
      const yy = y / (FOG_H - 1);
      // 세로 모양: 먼 안개 = 위아래로 부드럽게 사라지는 띠, 앞 안개 = 아래에서 짙고 위로 옅어짐
      const prof = band === 0 ? Math.pow(Math.sin(Math.PI * yy), 1.6) : Math.pow(yy, 1.4) * Math.min(1, (1 - yy) * 6 + 0.35);
      for (let x = 0; x < FOG_W; x++) {
        const xx = x / FOG_W;
        let n = 0, amp = 0.55, tot = 0;
        for (let o = 0; o < 4; o++) { n += vnoise(xx, yy, 4 << o, band * 1013 + o * 97) * amp; tot += amp; amp *= 0.5; }
        n /= tot;
        const a = clamp((n - 0.32) / 0.5, 0, 1);
        const i = ((band * FOG_H + y) * FOG_W + x) * 4;
        d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = Math.round(255 * sstep(a) * prof);
      }
    }
  }
  g.putImageData(img, 0, 0);
  g.putImageData(img, FOG_W, 0);
  C.fogKey = color;
}

/** 빛줄기 스프라이트: 꼭짓점(위 가운데)에서 아래로 퍼지는 부드러운 빛살 5가닥 (한 번 굽고 흐림) */
function bakeRay(color) {
  const c = C.ray;
  if (C.rayKey === color && c.width === RAY_W) return;
  c.width = RAY_W; c.height = RAY_H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, RAY_W, RAY_H);
  g.globalCompositeOperation = 'lighter';
  const beams = [[-0.42, 0.10, 0.55], [-0.2, 0.07, 0.8], [0.0, 0.12, 1], [0.18, 0.06, 0.7], [0.38, 0.09, 0.5]];
  try { g.filter = 'blur(3px)'; } catch { /* 흐림을 못 쓰면 그대로 */ }
  for (const [off, wd, k] of beams) {
    const gr = g.createLinearGradient(0, 0, 0, RAY_H);
    gr.addColorStop(0, rgba(color, 0.9 * k)); gr.addColorStop(0.45, rgba(color, 0.42 * k)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    const cx = RAY_W / 2, bx = cx + off * RAY_W, bw = wd * RAY_W;
    g.beginPath(); g.moveTo(cx - 3, 0); g.lineTo(cx + 3, 0); g.lineTo(bx + bw, RAY_H); g.lineTo(bx - bw, RAY_H); g.closePath(); g.fill();
  }
  try { g.filter = 'none'; } catch { /* */ }
  g.globalCompositeOperation = 'source-over';
  C.rayKey = color;
}

export function createAtmos(stage) {
  if (URL_OFF) return null;
  const key = stage?.bg;
  const e = atmosEntry(key);
  if (!e || !canvases()) return null;
  const atm = {
    key, e, t: 0, tier: 'high', rm: false, pending: false, bossK: 1, world: null,
    glow: null, aspect: 0, baked: false,
    stats: { draws: 0, fed: 0 },   // 이번 프레임의 이 층 drawImage 수 · 넘긴 광원 수 (QA: tools/qa/atmos_perf.mjs)
  };
  const feedLights = e.lights.filter((l) => l.feed);
  /** 그림 비율을 알게 되면(그림이 오면) 굽는다 — 보통 방을 불러올 때. 낮음 단계에서는 굽지 않다가 중간 이상이 되면 그때 한 번 */
  const ensure = (aspect) => {
    if (atm.baked && Math.abs(aspect - atm.aspect) < 1e-3) return true;
    atm.aspect = aspect;
    try {
      atm.glow = e.lights.length ? bakeGlow(`${key}|${aspect.toFixed(3)}`, e, aspect) : null;
      bakeFog(e.fog?.color);
      if (e.rays) bakeRay(e.rays.color);
      atm.baked = true;
    } catch (err) { console.warn('[atmos] bake', err); atm.baked = false; atm.broken = true; }
    return atm.baked;
  };
  atm.prewarm = (img) => { if (img?.width > 0 && img.height > 0) ensure(img.width / img.height); };

  /** img = 원경 그림 (있으면): 중간 이상 단계에서 아직 안 구웠으면 여기서(갱신 단계, 그리기 밖) 한 번 굽는다 */
  atm.update = (dt, world, img = null) => {
    atm.world = world;
    const q = world?.qualityNow?.() ?? 'high';
    atm.tier = q === 'low' || q === 'medium' ? q : 'high';
    if (!atm.baked && !atm.broken && atm.tier !== 'low' && img) atm.prewarm(img);
    atm.rm = !!world?.game?.settings?.reduceMotion;
    atm.t += dt * (atm.rm ? 0.25 : 1);
    atm.pending = true;   // 이번 갱신의 조명 수집(world.lighting.begin) 뒤 첫 그리기에서 광원 하나를 넘긴다
    const bk = world?.bossActive ? 0.55 : 1;
    atm.bossK += (bk - atm.bossK) * Math.min(1, dt * 2);
  };
  const live = () => enabled && !atm.broken && atm.tier !== 'low';

  atm.drawFar = (ctx, cam, vw, vh, F) => {
    atm.stats.draws = 0; atm.stats.fed = 0;
    if (!live() || !(F?.iw > 0) || !(F.ih > 0)) { atm.pending = false; return; }
    if (!ensure(F.iw / F.ih)) return;
    const t = atm.t, high = atm.tier === 'high';
    const op = ctx.globalCompositeOperation, a0 = ctx.globalAlpha;
    // 1) 그림 속 빛: 변형을 초당 7번 골라 (불마다 따로 일렁임) + 느린 숨쉬기
    const G = atm.glow;
    if (G) {
      const vi = Math.floor(hash(Math.floor(t * 7) * 2654435761) * VARS) % VARS;
      const breathe = 0.86 + 0.14 * Math.sin(t * 1.3);
      const b = G.box;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a0 * 0.8 * breathe;
      ctx.drawImage(C.glow, 0, vi * G.gh, G.gw, G.gh, F.ox + b.u0 * F.iw, F.oy + b.v0 * F.ih, (b.u1 - b.u0) * F.iw, (b.v1 - b.v0) * F.ih);
      atm.stats.draws++;
    }
    // 2) 빛줄기 (높음): 꼭짓점에서 천천히 흔들림
    const R = e.rays;
    if (high && R && C.rayKey) {
      const ax = F.ox + R.u * F.iw, ay = F.oy + R.v * F.ih, len = R.len * F.ih, w = R.w * F.ih;
      const sway = Math.sin(t * 0.23) * 0.05 + Math.sin(t * 0.61) * 0.015;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a0 * clamp(R.a, 0, 0.3) * (0.85 + 0.15 * Math.sin(t * 0.4));
      ctx.translate(ax, ay); ctx.rotate(-(R.angle + sway));
      ctx.drawImage(C.ray, -w / 2, 0, w, len);
      ctx.restore();
      atm.stats.draws++;
    }
    // 3) 먼 안개: 그림의 아래쪽 절반(지평선 언저리)에 붙어 천천히 흐르는 한 장
    const far = clamp(e.fog?.far ?? 0, 0, 0.35);
    if (far > 0.005) {
      const y0 = F.oy + F.ih * 0.42, h = F.ih * 0.5;
      if (y0 < vh && y0 + h > 0) {
        const off = ((((t * 9 + cam.x * 0.18) * FOG_W) / Math.max(1, vw)) % FOG_W + FOG_W) % FOG_W;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a0 * far;
        ctx.drawImage(C.fog, off, 0, FOG_W, FOG_H, 0, y0, vw, h);
        atm.stats.draws++;
      }
    }
    ctx.globalCompositeOperation = op; ctx.globalAlpha = a0;
    feed(cam, vw, vh, F);
  };

  /** 그림 속 불빛 하나를 플레이 층 광원으로: 화면 안의 feed 빛 중 주인공에게 가장 가까운 것 (가까울수록 세게) */
  const feed = (cam, vw, vh, F) => {
    const w = atm.world;
    if (!atm.pending || !w?.lighting || !feedLights.length) { atm.pending = false; return; }
    atm.pending = false;
    const z = cam.zoom || 1, p = w.player, flip = !!w.gimmick?.bgFlip;
    const px = p ? (p.cx - cam.x) * z : vw / 2, py = p ? (p.cy - cam.y) * z : vh / 2;
    let best = null, bw = 0, bx = 0, by = 0;
    for (const l of feedLights) {
      let sx = F.ox + l.u * F.iw;
      const sy = F.oy + l.v * F.ih;
      if (flip) sx = vw - sx;
      if (sx < -80 || sx > vw + 80 || sy < -80 || sy > vh + 80) continue;
      const d = Math.hypot(sx - px, (sy - py) * 1.4);
      const wt = clamp(1 - d / (vh * 0.95), 0, 1) * (0.6 + l.r * 4);
      if (wt > bw) { bw = wt; best = l; bx = sx; by = sy; }
    }
    if (!best) return;
    const fl = clamp(best.flicker ?? 1, 0, 1);
    const flick = 1 - fl * 0.25 * (0.5 + 0.5 * Math.sin(atm.t * 9.1 + best.u * 40) * Math.sin(atm.t * 5.3 + best.v * 31));
    const radius = Math.max(150, best.r * F.ih * 2.8) / z;
    w.lighting.add(cam.x + (cam.shakeX || 0) + bx / z, cam.y + (cam.shakeY || 0) + by / z, radius, best.color, clamp(bw, 0, 1) * 0.95 * flick, true);
    atm.stats.fed = 1;
  };

  /** 인물 앞 안개 (높음): 화면 아래 30 % 띠, 세상보다 조금 빠르게 흐름. 알파 ≤ fog.near (≤ 0.18), 보스전 55 % */
  atm.drawFront = (ctx, cam, vw, vh) => {
    if (!live() || atm.tier !== 'high' || !atm.baked || !C.fogKey) return;
    const near = clamp(e.fog?.near ?? 0, 0, 0.18) * atm.bossK;
    if (near < 0.005) return;
    const off = ((((atm.t * 16 + cam.x * 1.15) * FOG_W) / Math.max(1, vw)) % FOG_W + FOG_W) % FOG_W;
    const a0 = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a0 * near;
    ctx.drawImage(C.fog, off, FOG_H, FOG_W, FOG_H, 0, vh * 0.7, vw, vh * 0.3);
    ctx.globalAlpha = a0; ctx.globalCompositeOperation = op;
    atm.stats.draws++;
  };
  return atm;
}

/** QA: 구운 캔버스 (tools/test_atmos.mjs 가 앞 안개 띠의 최대 알파를 읽는다) */
export const atmosCanvases = () => ({ glow: C.glow, fog: C.fog, ray: C.ray, fogH: FOG_H });
/** QA: 지금 구워 둔 스프라이트 바이트 (메모리 예산 확인, ≤ 1.5 MB) */
export function atmosBytes() {
  let b = 0;
  for (const c of [C.glow, C.fog, C.ray]) if (c) b += (c.width || 0) * (c.height || 0) * 4;
  return b;
}
