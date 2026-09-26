// 동적 조명: 스테이지 어둠(ambient) 위에 광원(촛불, 횃불, 마법, 폭발, 캐릭터 주변광)을 뚫어 그린다.
// world.lighting.add(x, y, radius, color, intensity)  — 매 프레임 추가 (프레임 시작 시 비워짐)
import { rgba } from './math.js';

// 광원 스프라이트 캐시: 매 프레임 방사형 그라데이션을 새로 만드는 대신 미리 그린 원을 늘여 그린다 (모바일 성능)
const SPR = 128;
let _hole = null;
const _glow = new Map();
function radialSprite(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = SPR;
  const g = c.getContext('2d'), h = SPR / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, SPR, SPR);
  return c;
}
/** 어둠에 구멍을 내는 검은 원 (세기 1 기준, globalAlpha 로 조절) */
function holeSprite() {
  return (_hole ??= radialSprite([[0, 'rgba(0,0,0,1)'], [0.5, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]));
}
/** 색광 원 (세기 2 기준 알파 0.44 — globalAlpha = 세기/2) */
function glowSprite(color) {
  let c = _glow.get(color);
  if (!c) {
    if (_glow.size > 48) _glow.clear();
    c = radialSprite([[0, rgba(color, 0.44)], [1, rgba(color, 0)]]);
    _glow.set(color, c);
  }
  return c;
}

export class Lighting {
  constructor() {
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
        l.drawImage(holeSprite(), sx - r, sy - r, r * 2, r * 2);
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
      ctx.drawImage(glowSprite(L.color), sx - r, sy - r, r * 2, r * 2);
    }
    ctx.restore();
    if (this.lightning > 0) {
      ctx.fillStyle = `rgba(220,230,255,${this.lightning * 0.35})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }
}
