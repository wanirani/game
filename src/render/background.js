// 배경: Kling로 생성한 원경(assets/bg/*.webp)을 방 크기에 맞춘 동적 패럴랙스로 그리고,
// 그 위에 스테이지 테마별 절차적 중경 실루엣(기둥/아치/나무/톱니바퀴 등), 안개, 날씨(비/눈/불씨/재)를 얹는다.
// createBackground(stage, map) → { update(dt, world), drawFar(ctx, cam, vw, vh, t), drawMid(ctx, cam, t), drawFront(ctx, cam, vw, vh, t) }
import { assets } from '../core/assets.js';
import { rand, RNG, hashStr, rgba, hexToRgb, TAU, lerp, clamp } from '../core/math.js';

const TALL_PARALLAX = 0.35; // 세로로 긴 방: 카메라가 올라간 거리 대비 원경이 따라 내려가는 비율
const topColors = new WeakMap();
/** 원경 이미지 맨 위 띠의 평균색 [r,g,b] (캐시) — 긴 방에서 원경 위쪽 빈 하늘을 이어 칠할 색 */
function topColor(img, fallback) {
  let c = topColors.get(img);
  if (c) return c;
  try {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 4;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, img.width, Math.max(1, img.height * 0.03), 0, 0, 32, 4);
    const d = g.getImageData(0, 0, 32, 4).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    c = [r / n, gg / n, b / n];
  } catch { c = hexToRgb(fallback); }
  topColors.set(img, c);
  return c;
}
const rgbCss = (c, a = 1, k = 1) => `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;

export const THEMES = {
  village:   { sky: ['#1a0610', '#3a0e10', '#120408'], fog: '#ff6a2a', mid: 'houses', weather: 'embers', moon: '#ff3a2a' },
  graveyard: { sky: ['#0a1418', '#12242a', '#05080a'], fog: '#6ad0c0', mid: 'trees', weather: 'fog', moon: '#e8f0e0' },
  gate:      { sky: ['#140a24', '#2a1a3a', '#08040e'], fog: '#8a6aaa', mid: 'towers', weather: 'rain', moon: null },
  hall:      { sky: ['#1a0808', '#2a0e0e', '#0a0404'], fog: '#c04030', mid: 'pillars', weather: 'dust', moon: null },
  catacombs: { sky: ['#0a0c08', '#141a10', '#040504'], fog: '#8ad06a', mid: 'arches', weather: 'drips', moon: null },
  library:   { sky: ['#140c08', '#241410', '#080404'], fog: '#b98cff', mid: 'shelves', weather: 'pages', moon: null },
  alchemy:   { sky: ['#081208', '#102010', '#040804'], fog: '#6aff6a', mid: 'pipes', weather: 'bubbles', moon: null },
  waterway:  { sky: ['#040c18', '#0a1a2a', '#02060c'], fog: '#4ab0ff', mid: 'arches', weather: 'drips', moon: null },
  clock:     { sky: ['#0a0e1a', '#1a1a2a', '#05060a'], fog: '#e8c872', mid: 'gears', weather: 'dust', moon: '#f0e8d0' },
  spire:     { sky: ['#06101c', '#12243a', '#02060c'], fog: '#bfe8ff', mid: 'towers', weather: 'snow', moon: '#e0f0ff' },
  chapel:    { sky: ['#1a0406', '#300810', '#0a0204'], fog: '#ff2a3a', mid: 'windows', weather: 'ash', moon: null },
  throne:    { sky: ['#1a0206', '#3a0610', '#0a0103'], fog: '#ff1a2a', mid: 'pillars', weather: 'bats', moon: '#ff2020' },
  abyss:     { sky: ['#10041a', '#2a0830', '#06020a'], fog: '#ff5aff', mid: 'rocks', weather: 'embers', moon: null },
  arena:     { sky: ['#1a0a08', '#3a1a10', '#0a0404'], fog: '#ff8a3a', mid: 'pillars', weather: 'dust', moon: '#f0e0d0' },
  town:      { sky: ['#0c0814', '#1c1224', '#06040a'], fog: '#ffb070', mid: 'houses', weather: 'fireflies', moon: '#ffe0c0' },
};

export function createBackground(stage, map) {
  const theme = THEMES[stage.theme] || THEMES.hall;
  const rng = new RNG(hashStr(stage.id + (map?.w ?? 0)));
  const bg = {
    stage, theme, map,
    parts: [],
    weather: [],
    lightningT: rand(3, 8), lightning: 0,
  };
  // 중경 실루엣 요소 생성 (방 폭에 맞춰)
  const W = (map?.pxW ?? 2000) + 800;
  const H = map?.pxH ?? 540;
  const n = Math.ceil(W / 220);
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < n; i++) {
      bg.parts.push({ layer, x: i * 220 + rng.range(-60, 60), s: rng.range(0.7, 1.3), k: rng.int(0, 3), h: rng.range(0.5, 1) });
    }
  }
  // 날씨 입자
  const wn = { rain: 140, snow: 110, embers: 70, ash: 80, dust: 40, pages: 16, bubbles: 30, drips: 20, fog: 0, bats: 10, fireflies: 30 }[theme.weather] ?? 0;
  for (let i = 0; i < wn; i++) bg.weather.push({ x: rand(0, 1600), y: rand(0, 600), v: rand(0.6, 1.4), p: rand(0, TAU), s: rand(0.5, 1.5) });

  bg.update = (dt, world) => {
    if (theme.weather === 'rain') {
      bg.lightningT -= dt;
      if (bg.lightningT <= 0) { bg.lightningT = rand(5, 12); bg.lightning = 1; world.game.audio?.sfx('thunderclap', { vol: 0.6 }); }
    }
    bg.lightning = Math.max(0, bg.lightning - dt * 2.5);
    if (world.lighting) world.lighting.lightning = bg.lightning > 0.5 ? bg.lightning : bg.lightning * 0.3;
  };

  bg.drawFar = (ctx, cam, vw, vh, t) => {
    // 하늘 그라데이션
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, theme.sky[0]); g.addColorStop(0.55, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    const img = assets.get(stage.bg);
    if (img) {
      // 방 크기에 맞춰 원경이 끝에서 끝까지 이동하도록 패럴랙스 계수 산출
      const scale = (vh * 1.08) / img.height;
      const iw = img.width * scale, ih = img.height * scale;
      const roomW = map ? map.pxW : vw, roomH = map ? map.pxH : vh;
      const spanX = Math.max(1, roomW - cam.vw), spanY = Math.max(1, roomH - cam.vh);
      const px = clamp((cam.x - (cam.bounds?.x ?? 0)) / spanX, 0, 1);
      const py = clamp((cam.y - (cam.bounds?.y ?? 0)) / spanY, 0, 1);
      let ox = -(iw - vw) * px;
      if (iw < vw) ox = (vw - iw) / 2;
      let oy = -(ih - vh) * py;
      // 세로로 긴 방(화면 높이 2배 초과, 줌과 무관하게 판정): 같은 원경(지평선·바닥)이 층마다 반복되지 않도록
      // 원경은 방 바닥 근처에만 두고, 위로 올라갈수록 느린 패럴랙스로 아래로 빠지며 윗부분은 하늘/어둠으로 녹아든다
      const tall = roomH > vh * 2;
      if (tall) {
        const up = spanY * (1 - py); // 카메라가 가장 낮은 위치에서 올라간 거리
        oy = -(ih - vh) + up * TALL_PARALLAX;
        const top = topColor(img, theme.sky[0]);
        const fadeH = ih * 0.25;
        if (oy > 0) {
          const sg = ctx.createLinearGradient(0, oy - vh * 1.5, 0, oy);
          sg.addColorStop(0, rgbCss(top, 1, 0.5)); sg.addColorStop(1, rgbCss(top));
          ctx.fillStyle = sg; ctx.fillRect(0, 0, vw, oy + 1);
        }
        if (oy < vh) {
          ctx.drawImage(img, ox, oy, iw, ih);
          if (iw < vw) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(img, -ox, oy, iw, ih); ctx.restore(); }
          const fg = ctx.createLinearGradient(0, oy, 0, oy + fadeH);
          fg.addColorStop(0, rgbCss(top)); fg.addColorStop(1, rgbCss(top, 0));
          ctx.fillStyle = fg; ctx.fillRect(0, oy, vw, fadeH);
        }
      } else {
        ctx.drawImage(img, ox, oy, iw, ih);
        if (iw < vw) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(img, -ox, oy, iw, ih); ctx.restore(); }
      }
      // 어둡게 눌러서 게임 레이어와 분리
      ctx.fillStyle = rgba(theme.sky[2], 0.12);
      ctx.fillRect(0, 0, vw, vh);
    } else if (theme.moon) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const mx = vw * 0.72 - cam.x * 0.02, my = vh * 0.24;
      const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 160);
      mg.addColorStop(0, rgba(theme.moon, 0.9)); mg.addColorStop(0.25, rgba(theme.moon, 0.35)); mg.addColorStop(1, rgba(theme.moon, 0));
      ctx.fillStyle = mg; ctx.fillRect(mx - 160, my - 160, 320, 320);
      ctx.restore();
    }
    if (bg.lightning > 0) { ctx.fillStyle = `rgba(200,210,255,${bg.lightning * 0.3})`; ctx.fillRect(0, 0, vw, vh); }
  };

  // 월드 좌표에서 그리되, 카메라 이동보다 느리게 (패럴랙스)
  bg.drawMid = (ctx, cam, t) => {
    const vw = cam.vw, vh = cam.vh;
    // 클링 원경이 있으면 절차적 실루엣은 생략 (그림과 겹쳐 이질감이 생김)
    if (assets.get(stage.bg) && !stage.forceSilhouette) return;
    for (const layer of [0, 1]) {
      const f = layer === 0 ? 0.35 : 0.6;
      const painted = !!assets.get(stage.bg); // 클링 원경이 있으면 실루엣은 옅게
      const col = layer === 0 ? rgba(theme.sky[2], painted ? 0.18 : 0.55) : rgba('#000000', painted ? 0.32 : 0.55);
      ctx.save();
      ctx.translate(cam.x * f, cam.y * f * 0.5);
      ctx.fillStyle = col;
      const baseY = (map?.pxH ?? vh) - (layer === 0 ? 40 : 10);
      for (const p of bg.parts) {
        if (p.layer !== layer) continue;
        const sx = p.x - cam.x * f;
        if (sx < cam.x - cam.x * f - 300 || sx > cam.x - cam.x * f + vw + 300) { /* 대략 컬링 */ }
        drawSilhouette(ctx, theme.mid, p.x, baseY, p.s * (layer === 0 ? 1.4 : 1), p.k, t, p.h);
      }
      ctx.restore();
    }
  };

  bg.drawFront = (ctx, cam, vw, vh, t) => {
    // 안개 띠
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const y = vh * (0.55 + i * 0.16);
      const off = ((t * (8 + i * 6) - cam.x * (0.2 + i * 0.1)) % vw + vw) % vw;
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      g.addColorStop(0, rgba(theme.fog, 0)); g.addColorStop(0.5, rgba(theme.fog, 0.045)); g.addColorStop(1, rgba(theme.fog, 0));
      ctx.fillStyle = g;
      ctx.fillRect(off - vw, y - 60, vw * 2, 120);
    }
    ctx.restore();
    // 날씨
    drawWeather(ctx, bg, cam, vw, vh, t);
    // 비네팅
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.4, vw / 2, vh / 2, vh * 1.0);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
  };
  return bg;
}

function drawSilhouette(ctx, kind, x, by, s, k, t, h) {
  ctx.beginPath();
  switch (kind) {
    case 'pillars': {
      const w = 46 * s, ht = 520 * s;
      ctx.rect(x - w / 2, by - ht, w, ht);
      ctx.rect(x - w * 0.8, by - ht, w * 1.6, 18 * s);
      ctx.rect(x - w * 0.7, by - 30 * s, w * 1.4, 30 * s);
      break;
    }
    case 'arches': {
      const w = 180 * s, ht = 300 * s;
      ctx.moveTo(x - w / 2, by); ctx.lineTo(x - w / 2, by - ht); ctx.lineTo(x + w / 2, by - ht); ctx.lineTo(x + w / 2, by);
      ctx.lineTo(x + w / 2 - 26 * s, by); ctx.lineTo(x + w / 2 - 26 * s, by - ht * 0.55);
      ctx.arc(x, by - ht * 0.55, w / 2 - 26 * s, 0, Math.PI, true);
      ctx.lineTo(x - w / 2 + 26 * s, by); ctx.closePath();
      break;
    }
    case 'trees': {
      const ht = (220 + k * 60) * s;
      ctx.moveTo(x - 10 * s, by); ctx.lineTo(x - 5 * s, by - ht); ctx.lineTo(x + 5 * s, by - ht); ctx.lineTo(x + 12 * s, by);
      for (let i = 0; i < 5; i++) {
        const yy = by - ht * (0.35 + i * 0.13), d = i % 2 ? 1 : -1, L = (70 - i * 10) * s;
        ctx.moveTo(x, yy); ctx.lineTo(x + d * L, yy - L * 0.6); ctx.lineTo(x + d * L * 0.9, yy - L * 0.5); ctx.lineTo(x, yy + 6);
      }
      // 비석
      ctx.rect(x + 60 * s, by - 40 * s, 24 * s, 40 * s);
      ctx.moveTo(x + 60 * s, by - 40 * s); ctx.arc(x + 72 * s, by - 40 * s, 12 * s, Math.PI, 0);
      break;
    }
    case 'towers': {
      const w = (50 + k * 16) * s, ht = (360 + k * 90) * s * h;
      ctx.rect(x - w / 2, by - ht, w, ht);
      ctx.moveTo(x - w / 2 - 8 * s, by - ht); ctx.lineTo(x, by - ht - 110 * s); ctx.lineTo(x + w / 2 + 8 * s, by - ht);
      break;
    }
    case 'houses': {
      const w = (110 + k * 20) * s, ht = (90 + k * 20) * s;
      ctx.rect(x - w / 2, by - ht, w, ht);
      ctx.moveTo(x - w / 2 - 10, by - ht); ctx.lineTo(x, by - ht - 70 * s); ctx.lineTo(x + w / 2 + 10, by - ht);
      if (k === 2) { ctx.rect(x + w * 0.2, by - ht - 60 * s, 16 * s, 40 * s); }
      break;
    }
    case 'shelves': {
      const w = 150 * s, ht = 460 * s;
      ctx.rect(x - w / 2, by - ht, w, ht);
      break;
    }
    case 'gears': {
      const r = (70 + k * 30) * s, cy = by - 200 * s * h - k * 60;
      const a0 = t * (k % 2 ? 0.3 : -0.3);
      for (let i = 0; i < 12; i++) {
        const a = a0 + (i / 12) * TAU;
        ctx.moveTo(x + Math.cos(a - 0.12) * r, cy + Math.sin(a - 0.12) * r);
        ctx.lineTo(x + Math.cos(a - 0.08) * (r + 16 * s), cy + Math.sin(a - 0.08) * (r + 16 * s));
        ctx.lineTo(x + Math.cos(a + 0.08) * (r + 16 * s), cy + Math.sin(a + 0.08) * (r + 16 * s));
        ctx.lineTo(x + Math.cos(a + 0.12) * r, cy + Math.sin(a + 0.12) * r);
      }
      ctx.moveTo(x + r, cy); ctx.arc(x, cy, r, 0, TAU);
      ctx.fill('evenodd');
      ctx.beginPath(); ctx.rect(x - 4, cy, 8, by - cy);
      break;
    }
    case 'pipes': {
      const w = 26 * s;
      ctx.rect(x - w / 2, by - 480 * s, w, 480 * s);
      ctx.rect(x - 70 * s, by - 260 * s * h, 140 * s, w);
      ctx.moveTo(x + 50 * s, by); ctx.ellipse(x + 50 * s, by - 90 * s, 36 * s, 90 * s, 0, 0, TAU);
      break;
    }
    case 'windows': {
      const w = 90 * s, ht = 300 * s;
      ctx.rect(x - w / 2 - 20, by - ht - 140, w + 40, ht + 140);
      break;
    }
    case 'rocks': {
      const cy = by - (200 + k * 120) * s * h - Math.sin(t * 0.6 + x) * 12;
      ctx.moveTo(x - 70 * s, cy); ctx.lineTo(x + 70 * s, cy); ctx.lineTo(x + 30 * s, cy + 90 * s); ctx.lineTo(x - 10 * s, cy + 140 * s); ctx.lineTo(x - 40 * s, cy + 80 * s);
      break;
    }
    default:
      ctx.rect(x - 20, by - 200 * s, 40, 200 * s);
  }
  ctx.fill();
}

function drawWeather(ctx, bg, cam, vw, vh, t) {
  const kind = bg.theme.weather;
  const W = bg.weather;
  if (!W.length) return;
  ctx.save();
  const wrapX = (x) => ((x % (vw + 100)) + vw + 100) % (vw + 100) - 50;
  const wrapY = (y) => ((y % (vh + 100)) + vh + 100) % (vh + 100) - 50;
  switch (kind) {
    case 'rain':
      ctx.strokeStyle = 'rgba(170,190,230,0.35)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 1.1 - t * 180 * p.v), y = wrapY(p.y + t * 900 * p.v - cam.y);
        ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 18 * p.v);
      }
      ctx.stroke();
      break;
    case 'snow':
      ctx.fillStyle = 'rgba(240,248,255,0.85)';
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 1.1 + Math.sin(t * 1.5 + p.p) * 30 - t * 40), y = wrapY(p.y + t * 70 * p.v - cam.y);
        ctx.beginPath(); ctx.arc(x, y, 1.5 * p.s + 0.5, 0, TAU); ctx.fill();
      }
      break;
    case 'embers':
      ctx.globalCompositeOperation = 'lighter';
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 1.15 + Math.sin(t * 2 + p.p) * 20), y = wrapY(p.y - t * 60 * p.v - cam.y);
        ctx.fillStyle = `rgba(255,${120 + (p.p * 20) % 80},40,${0.5 + 0.5 * Math.sin(t * 6 + p.p)})`;
        ctx.fillRect(x, y, 2 * p.s, 2 * p.s);
      }
      break;
    case 'ash':
      ctx.fillStyle = 'rgba(80,70,70,0.6)';
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 1.1 + Math.sin(t + p.p) * 25), y = wrapY(p.y + t * 30 * p.v - cam.y);
        ctx.fillRect(x, y, 2.5 * p.s, 2.5 * p.s);
      }
      break;
    case 'dust': case 'fireflies':
      ctx.globalCompositeOperation = 'lighter';
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 0.9 + Math.sin(t * 0.7 + p.p) * 40), y = wrapY(p.y + Math.cos(t * 0.5 + p.p) * 30 - cam.y * 0.9);
        const a = kind === 'fireflies' ? 0.5 + 0.5 * Math.sin(t * 3 + p.p * 5) : 0.25;
        ctx.fillStyle = kind === 'fireflies' ? `rgba(200,255,120,${a})` : `rgba(255,230,200,${a})`;
        ctx.beginPath(); ctx.arc(x, y, 1.4 * p.s, 0, TAU); ctx.fill();
      }
      break;
    case 'pages':
      ctx.fillStyle = 'rgba(230,220,190,0.5)';
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 1.05 + Math.sin(t * 0.8 + p.p) * 60), y = wrapY(p.y + t * 25 * p.v - cam.y);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2 + p.p)); ctx.fillRect(-6, -4, 12, 8); ctx.restore();
      }
      break;
    case 'bubbles':
      ctx.strokeStyle = 'rgba(140,255,140,0.45)';
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 1.0 + Math.sin(t * 2 + p.p) * 8), y = wrapY(p.y - t * 50 * p.v - cam.y);
        ctx.beginPath(); ctx.arc(x, y, 3 * p.s, 0, TAU); ctx.stroke();
      }
      break;
    case 'drips':
      ctx.fillStyle = 'rgba(160,200,220,0.5)';
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 1.0), y = wrapY(p.y + ((t * 400 * p.v) % 700) - cam.y);
        ctx.fillRect(x, y, 1.5, 6);
      }
      break;
    case 'bats':
      ctx.fillStyle = 'rgba(10,0,4,0.85)';
      for (const p of W) {
        const x = wrapX(p.x - t * 120 * p.v - cam.x * 0.5), y = wrapY(p.y * 0.4 + Math.sin(t * 3 + p.p) * 20);
        const f = Math.sin(t * 18 + p.p) * 6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 10, y - f); ctx.lineTo(x - 4, y + 2); ctx.lineTo(x, y + 4); ctx.lineTo(x + 4, y + 2); ctx.lineTo(x + 10, y - f); ctx.fill();
      }
      break;
  }
  ctx.restore();
}
