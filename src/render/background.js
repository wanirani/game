// 배경: Kling로 생성한 원경(assets/bg/*.webp)을 방 크기에 맞춘 동적 패럴랙스로 그리고,
// 그 위에 스테이지 테마별 절차적 중경 실루엣(기둥/아치/나무/톱니바퀴 등), 안개, 날씨(비/눈/불씨/재/포자, 공허의 별빛)를 얹는다.
// 날씨 입자 수는 world.fx.quality 로 줄이고, 번개 번쩍임은 settings.flashFx 를 따른다.
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

// ── 주인공 뒤 어둠 원 (THEMES.halo) ──
// 64px 방사형 스프라이트 하나를 페이지에서 한 번 굽고 늘여 쓴다 (프레임마다 그라데이션·캔버스를 만들지 않음, 스테이지 진입 때 생성)
let _halo = null;
function haloSprite() {
  if (_halo) return _halo;
  _halo = document.createElement('canvas');
  _halo.width = _halo.height = 64;
  const g = _halo.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.56)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return _halo;
}
// 원경 그림의 저해상도 밝기 격자 (그림마다 한 번, 공용 작은 캔버스 하나로 읽음) — 주인공 바로 뒤가 얼마나 밝은지 어림한다
const LG_W = 48, LG_H = 18;
const lumaGrids = new WeakMap();
let _lgc = null;
function lumaGrid(img) {
  let L = lumaGrids.get(img);
  if (L !== undefined) return L;
  L = null;
  try {
    _lgc ??= document.createElement('canvas');
    _lgc.width = LG_W; _lgc.height = LG_H;
    const g = _lgc.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';   // 큰 그림을 한 번에 줄일 때 점 몇 개만 집지 않게
    g.drawImage(img, 0, 0, LG_W, LG_H);
    const d = g.getImageData(0, 0, LG_W, LG_H).data;
    L = new Float32Array(LG_W * LG_H);
    for (let i = 0; i < L.length; i++) L[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  } catch { L = null; }
  lumaGrids.set(img, L);
  return L;
}
const HERO_LUMA = 64;   // 게임 화면에서 잰 영웅 퍼펫의 평균 밝기 (visual_review --contrast: 대개 58–70)
/** 원경 밝기 / 영웅 밝기 비 r → 어둠 원 세기 배율. 원경이 영웅과 비슷하면 1, 아주 어두우면 조금(0.35), 훨씬 밝으면 0 (누르면 같은 밝기로 만남) */
const haloWeight = (r) => (r <= 0.3 ? 0.35 : r < 0.6 ? 0.35 + ((r - 0.3) / 0.3) * 0.65 : r <= 1.1 ? 1 : r < 1.3 ? (1.3 - r) / 0.2 : 0);

// halo  = 주인공 분리 (2026-10 벤치마크 1): 주인공 몸 뒤 원경에만 까는 옅은 어둠 원의 중심 알파 (없거나 0 = 끔; 마을 town 은 끔).
//          실제 세기는 주인공 뒤 원경 그림의 밝기로 줄인다 (haloWeight) — 원경이 주인공보다 한참 밝으면 이미 어두운 실루엣으로 읽히고,
//          그때 누르면 둘이 같은 밝기에서 만나 오히려 묻힌다. 중간 밝기 원경(s02 묘지, s16 심해)이 가장 세다.
// haze/hazeK = 대기 원근 (벤치마크 9): 화면 위쪽 띠(30–45 % 높이)에만 차가운 대기색 [r,g,b] 을 최대 알파 hazeK 로 깔고 50 % 에서 0,
//          56 % 아래(주인공이 서는 줄)는 예전 12 % 누름 그대로. 원경 누름과 같은 한 번 칠하기라 칠하기 수는 늘지 않는다. 1부 바깥 테마만.
export const THEMES = {
  village:   { sky: ['#1a0610', '#3a0e10', '#120408'], fog: '#ff6a2a', mid: 'houses', weather: 'embers', moon: '#ff3a2a', halo: 0.4, haze: [96, 108, 160], hazeK: 0.2 },
  graveyard: { sky: ['#0a1418', '#12242a', '#05080a'], fog: '#6ad0c0', mid: 'trees', weather: 'fog', moon: '#e8f0e0', halo: 0.5, haze: [120, 140, 175], hazeK: 0.16 },
  gate:      { sky: ['#140a24', '#2a1a3a', '#08040e'], fog: '#8a6aaa', mid: 'towers', weather: 'rain', moon: null, halo: 0.45, haze: [110, 112, 170], hazeK: 0.18 },
  hall:      { sky: ['#1a0808', '#2a0e0e', '#0a0404'], fog: '#c04030', mid: 'pillars', weather: 'dust', moon: null, halo: 0.4 },
  catacombs: { sky: ['#0a0c08', '#141a10', '#040504'], fog: '#8ad06a', mid: 'arches', weather: 'drips', moon: null, halo: 0.4 },
  library:   { sky: ['#140c08', '#241410', '#080404'], fog: '#b98cff', mid: 'shelves', weather: 'pages', moon: null, halo: 0.4 },
  alchemy:   { sky: ['#081208', '#102010', '#040804'], fog: '#6aff6a', mid: 'pipes', weather: 'bubbles', moon: null, halo: 0.35 },
  waterway:  { sky: ['#040c18', '#0a1a2a', '#02060c'], fog: '#4ab0ff', mid: 'arches', weather: 'drips', moon: null, halo: 0.45 },
  clock:     { sky: ['#0a0e1a', '#1a1a2a', '#05060a'], fog: '#e8c872', mid: 'gears', weather: 'dust', moon: '#f0e8d0', halo: 0.45 },
  spire:     { sky: ['#06101c', '#12243a', '#02060c'], fog: '#bfe8ff', mid: 'towers', weather: 'snow', moon: '#e0f0ff', halo: 0.3, haze: [150, 180, 215], hazeK: 0.12 },
  chapel:    { sky: ['#1a0406', '#300810', '#0a0204'], fog: '#ff2a3a', mid: 'windows', weather: 'ash', moon: null, halo: 0.45 },
  throne:    { sky: ['#1a0206', '#3a0610', '#0a0103'], fog: '#ff1a2a', mid: 'pillars', weather: 'bats', moon: '#ff2020', halo: 0.3 },
  abyss:     { sky: ['#10041a', '#2a0830', '#06020a'], fog: '#ff5aff', mid: 'rocks', weather: 'embers', moon: null, halo: 0.45 },
  arena:     { sky: ['#1a0a08', '#3a1a10', '#0a0404'], fog: '#ff8a3a', mid: 'pillars', weather: 'dust', moon: '#f0e0d0', halo: 0.35 },
  town:      { sky: ['#0c0814', '#1c1224', '#06040a'], fog: '#ffb070', mid: 'houses', weather: 'fireflies', moon: '#ffe0c0' },
  // ── 2부 (world2 §4.1): 새 날씨 spores(포자) · stars(별빛, 원경에 그림). 선택 필드 bubble = bubbles 날씨 거품 색 ──
  mirror:    { sky: ['#0a0e18', '#1a2232', '#04060c'], fog: '#bfe8ff', mid: 'windows', weather: 'dust',    moon: '#e8f4ff', halo: 0.3 },
  forge:     { sky: ['#1a0602', '#3a1204', '#0a0200'], fog: '#ff7a2a', mid: 'pipes',   weather: 'embers',  moon: null, halo: 0.4 },
  sunken:    { sky: ['#01101a', '#06283a', '#00060c'], fog: '#3ad0c8', mid: 'arches',  weather: 'bubbles', moon: null, bubble: 'rgba(150,236,255,0.4)', halo: 0.5 },
  sky:       { sky: ['#1a2a44', '#4a6a8a', '#0a1422'], fog: '#dfe8ff', mid: 'towers',  weather: 'rain',    moon: '#fff4d0', halo: 0.25 },
  nightmare: { sky: ['#0c0210', '#24062a', '#040008'], fog: '#c060ff', mid: 'pillars', weather: 'ash',     moon: '#f0e0ff', halo: 0.35 },
  blight:    { sky: ['#0c1004', '#1e2a08', '#040602'], fog: '#b8e04a', mid: 'trees',   weather: 'spores',  moon: null, halo: 0.4 },
  void:      { sky: ['#000000', '#08040e', '#000000'], fog: '#ffffff', mid: 'rocks',   weather: 'stars',   moon: null, halo: 0.4 },
};
// 날씨 입자 수 (world.fx.quality 로 줄여 그림). spores = dust 의 60%
const WEATHER_N = { rain: 140, snow: 110, embers: 70, ash: 80, dust: 40, pages: 16, bubbles: 30, drips: 20, fog: 0, bats: 10, fireflies: 30, spores: 24, stars: 70 };
const STAR_COL = ['rgba(190,190,255,0.35)', 'rgba(225,225,255,0.6)', 'rgba(255,255,255,0.95)'];

export function createBackground(stage, map) {
  const theme = THEMES[stage.theme] || THEMES.hall;
  const rng = new RNG(hashStr(stage.id + (map?.w ?? 0)));
  const bg = {
    stage, theme, map,
    parts: [],
    weather: [],
    lightningT: rand(3, 8), lightning: 0,
    q: 1, wv: null, flashK: 1,        // 입자 품질 배율, 그릴 날씨 입자(품질 반영), 화면 번쩍임 배율(settings.flashFx)
    shoot: null, shootT: rand(3, 6),  // stars: 떨어지는 별똥별 하나
    world: null, haloA: 0,            // update 가 넣는 월드 (drawMid 가 주인공 위치를 읽음), 지금 그리는 어둠 원 알파 (목표값을 부드럽게 따라감)
    far: { ox: 0, oy: 0, iw: 0, ih: 0 }, // 마지막 drawFar 의 원경 배치 (화면 px) — 주인공 뒤 원경 밝기 찾기
  };
  if (theme.halo > 0) haloSprite();   // 스테이지 진입 때 굽는다 (진행 중에 캔버스를 만들지 않음)
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
  const wn = WEATHER_N[theme.weather] ?? 0;
  for (let i = 0; i < wn; i++) bg.weather.push({ x: rand(0, 1600), y: rand(0, 600), v: rand(0.6, 1.4), p: rand(0, TAU), s: rand(0.5, 1.5) });
  bg.wv = bg.weather;

  bg.update = (dt, world) => {
    const q = world.fx?.quality ?? 1;
    if (q !== bg.q) { bg.q = q; bg.wv = q < 1 ? bg.weather.slice(0, Math.ceil(bg.weather.length * q)) : bg.weather; }
    bg.flashK = clamp(Number(world.game?.settings?.flashFx ?? 1) || 0, 0, 1);
    if (theme.weather === 'rain') {
      bg.lightningT -= dt;
      if (bg.lightningT <= 0) { bg.lightningT = rand(5, 12); bg.lightning = 1; world.game.audio?.sfx('thunderclap', { vol: 0.6 }); }
    } else if (theme.weather === 'stars') {
      bg.shootT -= dt;
      if (bg.shootT <= 0) { bg.shootT = rand(3, 6); bg.shoot = { x: rand(0.2, 1.0), y: rand(0.04, 0.35), a: rand(2.35, 2.75), t: 0, life: rand(0.7, 1.1), len: rand(90, 170), v: rand(520, 720) }; }
      if (bg.shoot && (bg.shoot.t += dt) >= bg.shoot.life) bg.shoot = null;
    }
    bg.lightning = Math.max(0, bg.lightning - dt * 2.5);
    if (world.lighting) world.lighting.lightning = (bg.lightning > 0.5 ? bg.lightning : bg.lightning * 0.3) * bg.flashK;
  };

  // 그라데이션은 프레임마다 만들지 않는다 (MASTER_PLAN §5.2 새 그라데이션 16/10/6, R1-REQ-341R): 크기·색이 같으면 캐시를 다시 쓰고,
  // 위치만 바뀌는 것(긴 방의 하늘 이음새·달)은 원점 기준으로 한 번 만들어 translate 로 옮겨 그린다
  const G = { sky: null, skyH: 0, fog: null, fogH: 0, moon: null, sg: null, sgKey: '', fg: null, fgKey: '' };
  const skyGrad = (ctx, vh) => {
    if (G.sky && G.skyH === vh) return G.sky;
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, theme.sky[0]); g.addColorStop(0.55, theme.sky[1]); g.addColorStop(1, theme.sky[2]);
    G.sky = g; G.skyH = vh;
    return g;
  };
  bg.drawFar = (ctx, cam, vw, vh, t) => {
    const img = assets.get(stage.bg);
    // 하늘 그라데이션: 불투명한 원경이 화면 전체를 덮으면(긴 방이 아니고 가로도 모자라지 않음) 가려지므로 칠하지 않는다 (전체 화면 칠하기 1번 절약)
    const roomH0 = map ? map.pxH : vh;
    const covers = img && !(roomH0 > vh * 2) && img.width * ((vh * 1.08) / img.height) >= vw;
    if (!covers) { ctx.fillStyle = skyGrad(ctx, vh); ctx.fillRect(0, 0, vw, vh); }
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
          // 원경 위 하늘 이음새: (0, −1.5vh)→(0, 0) 그라데이션을 한 번 만들어 oy 로 옮겨 그린다
          const k = `${top}|${vh}`;
          if (G.sgKey !== k) {
            G.sg = ctx.createLinearGradient(0, -vh * 1.5, 0, 0);
            G.sg.addColorStop(0, rgbCss(top, 1, 0.5)); G.sg.addColorStop(1, rgbCss(top)); G.sgKey = k;
          }
          ctx.save(); ctx.translate(0, oy);
          ctx.fillStyle = G.sg; ctx.fillRect(0, -oy, vw, oy + 1);
          ctx.restore();
        }
        if (oy < vh) {
          ctx.drawImage(img, ox, oy, iw, ih);
          if (iw < vw) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(img, -ox, oy, iw, ih); ctx.restore(); }
          const k = `${top}|${fadeH}`;
          if (G.fgKey !== k) {
            G.fg = ctx.createLinearGradient(0, 0, 0, fadeH);
            G.fg.addColorStop(0, rgbCss(top)); G.fg.addColorStop(1, rgbCss(top, 0)); G.fgKey = k;
          }
          ctx.save(); ctx.translate(0, oy);
          ctx.fillStyle = G.fg; ctx.fillRect(0, 0, vw, fadeH);
          ctx.restore();
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
      if (!G.moon) {
        G.moon = ctx.createRadialGradient(0, 0, 10, 0, 0, 160);
        G.moon.addColorStop(0, rgba(theme.moon, 0.9)); G.moon.addColorStop(0.25, rgba(theme.moon, 0.35)); G.moon.addColorStop(1, rgba(theme.moon, 0));
      }
      ctx.translate(mx, my);
      ctx.fillStyle = G.moon; ctx.fillRect(-160, -160, 320, 320);
      ctx.restore();
    }
    // 별빛은 먼 하늘에 속하므로 원경에 그린다 (게임 층 앞을 가리지 않음)
    if (theme.weather === 'stars') drawStars(ctx, bg, cam, vw, vh, t);
    if (bg.lightning > 0 && bg.flashK > 0) { ctx.fillStyle = `rgba(200,210,255,${bg.lightning * 0.3 * bg.flashK})`; ctx.fillRect(0, 0, vw, vh); }
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
    if (!G.fog || G.fogH !== vh) {
      G.fog = []; G.fogH = vh;
      for (let i = 0; i < 3; i++) {
        const y = vh * (0.55 + i * 0.16), g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        g.addColorStop(0, rgba(theme.fog, 0)); g.addColorStop(0.5, rgba(theme.fog, 0.045)); g.addColorStop(1, rgba(theme.fog, 0));
        G.fog.push(g);
      }
    }
    for (let i = 0; i < 3; i++) {
      const y = vh * (0.55 + i * 0.16);
      const off = ((t * (8 + i * 6) - cam.x * (0.2 + i * 0.1)) % vw + vw) % vw;
      ctx.fillStyle = G.fog[i];
      ctx.fillRect(off - vw, y - 60, vw * 2, 120);
    }
    ctx.restore();
    // 날씨
    drawWeather(ctx, bg, cam, vw, vh, t);
    // 비네팅
    const q = ctx.imageSmoothingQuality; ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(vignetteSprite(vw, vh), 0, 0, vw, vh);
    ctx.imageSmoothingQuality = q;
  };
  return bg;
}

// 비네팅은 1/4 해상도로 한 번 그려 두고 늘여 쓴다 (매 프레임 전체 화면 방사형 그라데이션 생성 방지)
let _vig = null;
function vignetteSprite(vw, vh) {
  const w = Math.ceil(vw / 4), h = Math.ceil(vh / 4);
  if (_vig && _vig.width === w && _vig.height === h) return _vig;
  _vig ??= document.createElement('canvas');   // 화면 크기가 바뀌면 같은 캔버스를 다시 굽는다 (새 캔버스를 만들지 않음)
  _vig.width = w; _vig.height = h;
  const g = _vig.getContext('2d');
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, h * 1.0);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  return _vig;
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

/**
 * 'stars' 날씨 (공허): 화면 공간의 반짝이는 별(패럴랙스 0.1)을 밝기 3단계로 묶어 채우고, 3~6초마다 별똥별 하나.
 * drawFar 에서 원경 위에 그린다.
 */
function drawStars(ctx, bg, cam, vw, vh, t) {
  const W = bg.wv ?? bg.weather;
  const wrapX = (x) => ((x % (vw + 100)) + vw + 100) % (vw + 100) - 50;
  const wrapY = (y) => ((y % (vh + 100)) + vh + 100) % (vh + 100) - 50;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < 3; b++) {
    ctx.beginPath();
    for (const p of W) {
      const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + p.v) + p.p * 7);
      if ((tw > 0.78 ? 2 : tw > 0.4 ? 1 : 0) !== b) continue;
      const x = wrapX(p.x - cam.x * 0.1), y = wrapY(p.y - cam.y * 0.1);
      const s = p.s * (b === 2 ? 1.7 : 1.1);
      ctx.rect(x - s / 2, y - s / 2, s, s);
      if (b === 2 && p.s > 1.2) { ctx.rect(x - s * 2.2, y - 0.4, s * 4.4, 0.8); ctx.rect(x - 0.4, y - s * 2.2, 0.8, s * 4.4); } // 가장 밝은 별의 십자 빛
    }
    ctx.fillStyle = STAR_COL[b]; ctx.fill();
  }
  const s = bg.shoot;
  if (s) {
    const k = s.t / s.life, d = s.v * s.t;
    const hx = s.x * vw + Math.cos(s.a) * d, hy = s.y * vh + Math.sin(s.a) * d;
    const tx = hx - Math.cos(s.a) * s.len, ty = hy - Math.sin(s.a) * s.len;
    const a = Math.sin(Math.PI * Math.min(1, k)) * 0.9;
    // 꼬리 그라데이션은 별똥별마다 한 번 (머리 기준 −len→0 축에 만들어 회전해 그리고, 밝기는 globalAlpha 로)
    if (!s.g) { s.g = ctx.createLinearGradient(-s.len, 0, 0, 0); s.g.addColorStop(0, 'rgba(220,220,255,0)'); s.g.addColorStop(1, 'rgba(255,255,255,1)'); }
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(s.a); ctx.globalAlpha *= a;
    ctx.strokeStyle = s.g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s.len, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(hx, hy, 1.8, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawWeather(ctx, bg, cam, vw, vh, t) {
  const kind = bg.theme.weather;
  const W = bg.wv ?? bg.weather;
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
      ctx.strokeStyle = bg.theme.bubble ?? 'rgba(140,255,140,0.45)'; // 기본 = 연구소의 초록 거품, 심해(sunken)는 청록
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
    case 'spores': {
      // 천천히 흩날리며 내려앉는 황록색 포자 (큰 것은 옅은 번짐을 한 겹 더)
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      const halo = [];
      for (const p of W) {
        const x = wrapX(p.x - cam.x * 0.9 + Math.sin(t * 0.6 + p.p) * 36), y = wrapY(p.y + t * 16 * p.v - cam.y * 0.9);
        const r = 1.2 * p.s + 0.5;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
        if (p.s > 1.1) halo.push(x, y, r * 3.2);
      }
      ctx.fillStyle = 'rgba(200,255,106,0.42)'; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < halo.length; i += 3) { ctx.moveTo(halo[i] + halo[i + 2], halo[i + 1]); ctx.arc(halo[i], halo[i + 1], halo[i + 2], 0, TAU); }
      ctx.fillStyle = 'rgba(200,255,106,0.07)'; ctx.fill();
      break;
    }
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
