// 동적 조명: 스테이지 어둠(ambient) 위에 광원(촛불, 횃불, 마법, 폭발, 캐릭터 주변광)을 뚫어 그린다.
// world.lighting.add(x, y, radius, color, intensity)  — 매 프레임 추가 (프레임 시작 시 비워짐)
import { rgba } from './math.js';

// 광원 스프라이트 캐시: 매 프레임 방사형 그라데이션을 새로 만드는 대신 미리 그린 원을 늘여 그린다 (모바일 성능)
// 색마다 캔버스를 만들던 것을 아틀라스 한 장(칸 64px × 64칸)으로 바꿨다: 아틀라스는 월드를 만들 때(스테이지 준비) 한 번 만들고,
// 처음 보는 색은 빈 칸에 그라데이션 한 번으로 칠한다 — 싸움 도중 캔버스 생성 0 (feel §8, R1-REQ-340E)
const SLOT = 64, COLS = 8, ROWS = 8, SLOTS = COLS * ROWS;
const ATL = { c: null, g: null, map: new Map(), next: 1 };   // 칸 0 = 어둠 구멍
function atlas() {
  if (ATL.c) return ATL;
  if (typeof document === 'undefined' || !document.createElement) return null;
  const c = document.createElement('canvas');
  c.width = SLOT * COLS; c.height = SLOT * ROWS;
  ATL.c = c; ATL.g = c.getContext('2d');
  paintSlot(0, [[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
  return ATL;
}
/** 칸 i 에 방사형 원을 칠한다 (가장자리 1px 여백: 이웃 칸이 보간으로 번지지 않게) */
function paintSlot(i, stops) {
  const g = ATL.g;
  if (!g) return;
  const x = (i % COLS) * SLOT, y = Math.floor(i / COLS) * SLOT, h = SLOT / 2;
  g.clearRect(x, y, SLOT, SLOT);
  const gr = g.createRadialGradient(x + h, y + h, 0, x + h, y + h, h - 1);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(x, y, SLOT, SLOT);
}
/** 색광 원의 칸 번호 (세기 2 기준 알파 0.44 — globalAlpha = 세기/2). 칸이 다 차면 처음부터 다시 쓴다 */
function glowSlot(color) {
  let i = ATL.map.get(color);
  if (i === undefined) {
    if (ATL.next >= SLOTS) { ATL.map.clear(); ATL.next = 1; }
    i = ATL.next++;
    ATL.map.set(color, i);
    paintSlot(i, [[0, rgba(color, 0.44)], [1, rgba(color, 0)]]);
  }
  return i;
}
/** 아틀라스 칸 i 를 (dx, dy) 에 d×d 로 그린다 */
function drawSlot(ctx, i, dx, dy, d) {
  ctx.drawImage(ATL.c, (i % COLS) * SLOT, Math.floor(i / COLS) * SLOT, SLOT, SLOT, dx, dy, d, d);
}
/** 방에 들어갈 때 알려진 광원 색을 미리 칠해 둔다 (world.loadRoom; 없어도 된다 — 처음 쓸 때 칠한다) */
export function prewarmLightColors(colors) {
  if (!atlas()) return;
  for (const c of colors || []) if (typeof c === 'string' && c) glowSlot(c);
}

export class Lighting {
  constructor() {
    atlas();   // 광원 아틀라스 (한 번만; 월드를 만들 때 = 스테이지 준비 단계)
    this.canvas = document.createElement('canvas');
    this.lctx = this.canvas.getContext('2d');
    this.lights = [];
    this.darkness = 0.5;       // 0(밝음) ~ 0.95(칠흑)
    this.color = '#06020c';    // 어둠 색
    this.res = 0.5;            // 오프스크린 해상도 배율
    this.enabled = true;
    this.lightning = 0;        // 번개 섬광 (0~1)
  }
  begin() { this.lights.length = 0; }
  add(x, y, radius, color = '#ffc98a', intensity = 1, glow = true) {
    if (this.lights.length < 64) this.lights.push({ x, y, r: radius, color, i: intensity, glow });
  }
  render(ctx, cam, viewW, viewH) {
    if (!this.enabled) return;
    const dark = Math.max(0, this.darkness - this.lightning * 0.8);
    const W = Math.ceil(viewW * this.res), H = Math.ceil(viewH * this.res);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    const l = this.lctx;
    const z = cam.zoom * this.res;
    if (dark > 0.01) {
      l.globalCompositeOperation = 'source-over';
      l.clearRect(0, 0, W, H);
      l.fillStyle = rgba(this.color, dark);
      l.fillRect(0, 0, W, H);
      l.globalCompositeOperation = 'destination-out';
      for (const L of this.lights) {
        const sx = (L.x - cam.x - cam.shakeX) * z, sy = (L.y - cam.y - cam.shakeY) * z, r = L.r * z;
        if (sx + r < 0 || sy + r < 0 || sx - r > W || sy - r > H) continue;
        l.globalAlpha = Math.min(1, L.i);
        drawSlot(l, 0, sx - r, sy - r, r * 2);
      }
      l.globalAlpha = 1;
      const q = ctx.imageSmoothingQuality; ctx.imageSmoothingQuality = 'low';
      ctx.drawImage(this.canvas, 0, 0, viewW, viewH);
      ctx.imageSmoothingQuality = q;
    }
    // 색광 (가산 합성)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingQuality = 'low'; // 흐린 원을 늘이는 것이라 저품질 보간으로 충분 (고품질은 매우 느림)
    const zz = cam.zoom;
    for (const L of this.lights) {
      if (!L.glow) continue;
      const sx = (L.x - cam.x - cam.shakeX) * zz, sy = (L.y - cam.y - cam.shakeY) * zz, r = L.r * zz * 0.7;
      if (sx + r < 0 || sy + r < 0 || sx - r > viewW || sy - r > viewH) continue;
      ctx.globalAlpha = Math.min(1, L.i / 2);
      drawSlot(ctx, glowSlot(L.color), sx - r, sy - r, r * 2);
    }
    ctx.restore();
    if (this.lightning > 0) {
      ctx.fillStyle = `rgba(220,230,255,${this.lightning * 0.35})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }
}
