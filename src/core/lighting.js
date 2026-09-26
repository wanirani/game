// 동적 조명: 스테이지 어둠(ambient) 위에 광원(촛불, 횃불, 마법, 폭발, 캐릭터 주변광)을 뚫어 그린다.
// world.lighting.add(x, y, radius, color, intensity)  — 매 프레임 추가 (프레임 시작 시 비워짐)
import { rgba } from './math.js';

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
        const g = l.createRadialGradient(sx, sy, 0, sx, sy, r);
        g.addColorStop(0, `rgba(0,0,0,${Math.min(1, L.i)})`);
        g.addColorStop(0.5, `rgba(0,0,0,${Math.min(1, L.i) * 0.55})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        l.fillStyle = g;
        l.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
      ctx.drawImage(this.canvas, 0, 0, viewW, viewH);
    }
    // 색광 (가산 합성)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const zz = cam.zoom;
    for (const L of this.lights) {
      if (!L.glow) continue;
      const sx = (L.x - cam.x - cam.shakeX) * zz, sy = (L.y - cam.y - cam.shakeY) * zz, r = L.r * zz * 0.7;
      if (sx + r < 0 || sy + r < 0 || sx - r > viewW || sy - r > viewH) continue;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, rgba(L.color, 0.22 * L.i));
      g.addColorStop(1, rgba(L.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.restore();
    if (this.lightning > 0) {
      ctx.fillStyle = `rgba(220,230,255,${this.lightning * 0.35})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }
}
