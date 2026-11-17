// v2 fx — 효과용 그림: 전부 코드로 한 번만 그린다 (생성 이미지·플립북 없음). docs/v2/FX.md §2
//   · 입자 아틀라스 512² (4×4 칸, 칸 128px): 흰색 + 알파만 담고 색은 정점에서 곱한다.
//   · 바닥 문양 아틀라스 512² (2×2 칸, 칸 256px): 성스러운 마법진 · 피의 마법진 · 균열 · 종 문양.
//   · 잡음 64² (반복, RGB 세 겹): 셰이더가 hash 를 계산하지 않고 이것을 읽는다.
// 움직임은 전부 셰이더가 만든다 — 프레임마다 텍스처를 올리는 일은 없다.

export const SPR = {
  GLOW: 0, CORE: 1, STREAK: 2, STAR: 3, SMOKE: 4, SHARD: 5, RING: 6, FLAME: 7,
  DROP: 8, BONE: 9, CRESCENT: 10, SNOW: 11, RUNE: 12, EMBER: 13, DUST: 14, FLAKE: 15,
};
export const DECAL = { HOLY: 0, BLOOD: 1, CRACK: 2, BELL: 3 };

// 결정적 난수 (그림이 실행마다 같도록)
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function radial(g, cx, cy, r, stops) {
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.fill();
}

export function makeParticleAtlas() {
  const S = 128, cv = canvas(S * 4, S * 4), g = cv.getContext('2d');
  const R = rng(7);
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * S + S / 2, ((i / 4) | 0) * S + S / 2); g.beginPath(); g.rect(-S / 2 + 2, -S / 2 + 2, S - 4, S - 4); g.clip(); fn(); g.restore(); };
  // 0 부드러운 빛
  cell(SPR.GLOW, () => radial(g, 0, 0, 58, [[0, 1], [0.18, 0.62], [0.45, 0.2], [0.75, 0.045], [1, 0]]));
  // 1 단단한 핵 + 옅은 후광
  cell(SPR.CORE, () => { radial(g, 0, 0, 56, [[0, 0.5], [0.4, 0.12], [1, 0]]); radial(g, 0, 0, 22, [[0, 1], [0.55, 0.95], [1, 0]]); });
  // 2 불티 줄 (가로로 긴 쐐기, 머리가 오른쪽)
  cell(SPR.STREAK, () => {
    const gr = g.createLinearGradient(-58, 0, 58, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.93, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-58, 0); g.quadraticCurveTo(10, -9, 54, -3); g.lineTo(58, 0); g.lineTo(54, 3); g.quadraticCurveTo(10, 9, -58, 0); g.fill();
    g.globalAlpha = 0.35; g.filter = 'blur(5px)'; g.fill(); g.filter = 'none'; g.globalAlpha = 1;
  });
  // 3 네 갈래 별빛
  cell(SPR.STAR, () => {
    radial(g, 0, 0, 40, [[0, 0.9], [0.3, 0.3], [1, 0]]);
    g.fillStyle = '#fff';
    for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 2); g.beginPath(); g.moveTo(0, -5); g.quadraticCurveTo(14, -1.5, k % 2 ? 44 : 58, 0); g.quadraticCurveTo(14, 1.5, 0, 5); g.fill(); g.restore(); }
    g.globalAlpha = 0.5; for (let k = 0; k < 4; k++) { g.save(); g.rotate(Math.PI / 4 + k * Math.PI / 2); g.beginPath(); g.moveTo(0, -3); g.lineTo(26, 0); g.lineTo(0, 3); g.fill(); g.restore(); } g.globalAlpha = 1;
  });
  // 4 연기 뭉치 (여러 덩어리)
  const puff = (n, rad, spread, a) => { for (let i = 0; i < n; i++) { const an = R() * 6.283, d = Math.sqrt(R()) * spread; radial(g, Math.cos(an) * d, Math.sin(an) * d, rad * (0.55 + R() * 0.6), [[0, a], [0.55, a * 0.55], [1, 0]]); } };
  cell(SPR.SMOKE, () => { puff(16, 26, 26, 0.34); radial(g, 0, 0, 40, [[0, 0.5], [0.6, 0.3], [1, 0]]); });
  // 5 날 선 조각 (얼음·돌 파편)
  cell(SPR.SHARD, () => {
    const gr = g.createLinearGradient(-30, -30, 30, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.72)'); gr.addColorStop(1, 'rgba(255,255,255,0.4)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-8, -46); g.lineTo(24, -6); g.lineTo(10, 44); g.lineTo(-22, 12); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-8, -46); g.lineTo(10, 44); g.stroke();
  });
  // 6 고리
  cell(SPR.RING, () => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 50, 0, 6.2832); g.stroke(); g.globalAlpha = 0.35; g.lineWidth = 12; g.filter = 'blur(4px)'; g.stroke(); g.filter = 'none'; g.globalAlpha = 1; });
  // 7 불꽃 혀 (위로 뾰족한 물방울 + 덩어리)
  cell(SPR.FLAME, () => {
    radial(g, 0, 14, 40, [[0, 0.9], [0.5, 0.5], [1, 0]]);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.moveTo(0, -56); g.bezierCurveTo(10, -30, 34, -6, 26, 22); g.bezierCurveTo(20, 44, -20, 44, -26, 22); g.bezierCurveTo(-34, -4, -8, -24, 0, -56); g.filter = 'blur(3px)'; g.fill(); g.filter = 'none';
    radial(g, -8, 20, 20, [[0, 0.6], [1, 0]]); radial(g, 10, 6, 16, [[0, 0.5], [1, 0]]);
  });
  // 8 방울 (머리가 오른쪽)
  cell(SPR.DROP, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-54, 0); g.quadraticCurveTo(0, -5, 26, -16); g.arc(34, 0, 18, -2.2, 2.2); g.quadraticCurveTo(0, 5, -54, 0); g.fill(); radial(g, 38, -5, 7, [[0, 0.0], [1, 0]]); });
  // 9 뼛조각 (울퉁불퉁한 긴 조각, 음영)
  cell(SPR.BONE, () => {
    const gr = g.createLinearGradient(0, -20, 0, 20); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0.55)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-44, -8); g.lineTo(-30, -16); g.lineTo(-18, -9); g.lineTo(20, -11); g.lineTo(36, -18); g.lineTo(46, -6); g.lineTo(40, 6); g.lineTo(44, 14); g.lineTo(30, 18); g.lineTo(18, 9); g.lineTo(-22, 10); g.lineTo(-34, 17); g.lineTo(-46, 8); g.closePath(); g.fill();
  });
  // 10 작은 초승달 (베기 조각)
  cell(SPR.CRESCENT, () => { g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 30, 62, -2.45, -0.69); g.arc(0, 44, 66, -0.82, -2.32, true); g.closePath(); g.fill(); g.globalAlpha = 0.4; g.filter = 'blur(5px)'; g.fill(); g.filter = 'none'; g.globalAlpha = 1; });
  // 11 눈 결정 (여섯 갈래)
  cell(SPR.SNOW, () => {
    g.strokeStyle = '#fff'; g.lineCap = 'round'; radial(g, 0, 0, 30, [[0, 0.5], [1, 0]]);
    for (let k = 0; k < 6; k++) { g.save(); g.rotate(k * Math.PI / 3); g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(50, 0); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(26, 0); g.lineTo(38, 11); g.moveTo(26, 0); g.lineTo(38, -11); g.stroke(); g.restore(); }
  });
  // 12 룬 글자 (각진 획)
  cell(SPR.RUNE, () => { g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(-18, 44); g.lineTo(-18, -44); g.lineTo(22, -14); g.lineTo(-18, 10); g.moveTo(-18, 10); g.lineTo(26, 44); g.stroke(); g.globalAlpha = 0.4; g.lineWidth = 16; g.filter = 'blur(5px)'; g.stroke(); g.filter = 'none'; g.globalAlpha = 1; });
  // 13 불씨 (마름모 핵)
  cell(SPR.EMBER, () => { radial(g, 0, 0, 44, [[0, 0.55], [0.5, 0.14], [1, 0]]); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -20); g.lineTo(15, 0); g.lineTo(0, 20); g.lineTo(-15, 0); g.closePath(); g.fill(); });
  // 14 흙먼지 (더 넓고 옅은 뭉치)
  cell(SPR.DUST, () => { puff(22, 20, 34, 0.22); radial(g, 0, 4, 48, [[0, 0.34], [0.7, 0.16], [1, 0]]); });
  // 15 재 부스러기
  cell(SPR.FLAKE, () => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-30, -6); g.lineTo(-6, -26); g.lineTo(22, -18); g.lineTo(34, 4); g.lineTo(8, 26); g.lineTo(-20, 18); g.closePath(); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(6, -2, 7, 0, 6.2832); g.fill(); g.globalCompositeOperation = 'source-over'; });
  return cv;
}

export function makeDecalAtlas() {
  const S = 256, cv = canvas(S * 2, S * 2), g = cv.getContext('2d');
  const R = rng(31);
  const cell = (i, fn) => { g.save(); g.translate((i % 2) * S + S / 2, ((i / 2) | 0) * S + S / 2); g.beginPath(); g.rect(-S / 2 + 2, -S / 2 + 2, S - 4, S - 4); g.clip(); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; fn(); g.restore(); };
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.stroke(); };
  const glowPass = (fn) => { g.save(); g.globalAlpha = 0.22; g.filter = 'blur(3px)'; fn(2.2); g.restore(); fn(1); };
  const poly = (n, r, skip, rot = -Math.PI / 2) => { g.beginPath(); for (let i = 0; i <= n; i++) { const a = rot + (i * skip) * 6.2832 / n; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); };
  const ticks = (n, r0, r1, w, every = 0, r2 = r1) => { g.lineWidth = w; g.beginPath(); for (let i = 0; i < n; i++) { const a = i * 6.2832 / n, rr = every && i % every === 0 ? r2 : r1; g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); };
  const glyphs = (n, r, size) => { for (let i = 0; i < n; i++) { const a = i * 6.2832 / n; g.save(); g.rotate(a); g.translate(0, -r); g.lineWidth = 2.2; g.beginPath(); const k = 2 + ((R() * 3) | 0); let x = (R() - 0.5) * size, y = -size / 2; g.moveTo(x, y); for (let j = 0; j < k; j++) { x = (R() - 0.5) * size; y += size / k; g.lineTo(x, y); } g.stroke(); g.restore(); } };
  // 0 성스러운 마법진: 겹고리 + 눈금 + 육각별 + 룬 띠
  cell(DECAL.HOLY, () => glowPass((m) => {
    ring(120, 3.2 * m); ring(111, 1.4 * m); ring(88, 1.6 * m); ring(46, 1.6 * m);
    ticks(48, 112, 119, 1.4 * m); g.lineWidth = 2.2 * m; poly(3, 86, 1); poly(3, 86, 1, Math.PI / 2); poly(6, 46, 1);
    if (m === 1) glyphs(18, 99.5, 12);
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 6.2832 / 6 + 0.5236; g.moveTo(Math.cos(a) * 60 + 5, Math.sin(a) * 60); g.arc(Math.cos(a) * 60, Math.sin(a) * 60, 5, 0, 6.2832); } g.lineWidth = 1.6 * m; g.stroke();
  }));
  // 1 피의 마법진: 가시 고리 + 오각별 + 초승달
  cell(DECAL.BLOOD, () => glowPass((m) => {
    ring(120, 3.6 * m); ring(104, 1.4 * m); g.lineWidth = 2.6 * m; poly(5, 103, 2);
    ring(40, 2 * m);
    g.lineWidth = 2 * m; g.beginPath(); for (let i = 0; i < 30; i++) { const a = i * 6.2832 / 30; g.moveTo(Math.cos(a) * 120, Math.sin(a) * 120); g.lineTo(Math.cos(a + 0.07) * (i % 3 ? 112 : 106), Math.sin(a + 0.07) * (i % 3 ? 112 : 106)); } g.stroke();
    g.beginPath(); g.arc(0, 0, 26, 0.9, 5.4); g.arc(7, 0, 20, 5.1, 1.2, true); g.closePath(); if (m === 1) g.fill(); else g.stroke();
  }));
  // 2 균열: 가운데서 뻗는 들쭉날쭉한 금
  cell(DECAL.CRACK, () => glowPass((m) => {
    const R2 = rng(99);   // 두 번의 패스가 같은 금을 그리도록
    for (let i = 0; i < 9; i++) {
      let a = i * 6.2832 / 9 + (R2() - 0.5) * 0.5, x = 0, y = 0, len = 60 + R2() * 58, w = (3.6 - (i % 3) * 0.7) * m;
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const nx = x + Math.cos(a) * len / steps, ny = y + Math.sin(a) * len / steps;
        g.lineWidth = Math.max(0.8, w * (1 - s / steps)); g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        if (s === 2 || s === 4) { const b = a + (R2() > 0.5 ? 0.8 : -0.8), bl = len * 0.28; g.lineWidth = Math.max(0.7, w * 0.4); g.beginPath(); g.moveTo(nx, ny); g.lineTo(nx + Math.cos(b) * bl, ny + Math.sin(b) * bl); g.stroke(); }
        x = nx; y = ny; a += (R2() - 0.5) * 0.7;
      }
    }
    g.beginPath(); g.arc(0, 0, 9 * (m > 1 ? 1.4 : 1), 0, 6.2832); g.fill();
  }));
  // 3 종 문양: 열두 눈금(시계) + 종 실루엣 + 울림 호
  cell(DECAL.BELL, () => glowPass((m) => {
    ring(120, 3 * m); ring(108, 1.2 * m); ticks(60, 109, 114, 1.2 * m, 5, 98); ring(74, 1.4 * m);
    g.lineWidth = 2.4 * m; g.beginPath(); g.moveTo(-6, -40); g.bezierCurveTo(-26, -34, -22, 0, -40, 26); g.lineTo(40, 26); g.bezierCurveTo(22, 0, 26, -34, 6, -40); g.closePath(); g.stroke();
    g.beginPath(); g.arc(0, -46, 7, 0, 6.2832); g.stroke(); g.beginPath(); g.arc(0, 36, 6, 0, 6.2832); g.fill();
    g.lineWidth = 1.8 * m; for (const s of [-1, 1]) { g.beginPath(); g.arc(0, 0, 56, s > 0 ? -0.5 : Math.PI - 0.5, s > 0 ? 0.5 : Math.PI + 0.5); g.stroke(); g.beginPath(); g.arc(0, 0, 66, s > 0 ? -0.35 : Math.PI - 0.35, s > 0 ? 0.35 : Math.PI + 0.35); g.stroke(); }
  }));
  return cv;
}

/** 반복되는 값 잡음 64², RGB = 서로 다른 세 겹(R 굵게 · G 중간 · B 잘게). Uint8Array(64·64·4) */
export function makeNoise() {
  const N = 64, out = new Uint8Array(N * N * 4), R = rng(1234);
  const layer = (cells) => {
    const gv = new Float32Array(cells * cells); for (let i = 0; i < gv.length; i++) gv[i] = R();
    const f = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * cells, fy = y / N * cells, x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const a = gv[y0 * cells + x0], b = gv[y0 * cells + x1], c = gv[y1 * cells + x0], d = gv[y1 * cells + x1];
      f[y * N + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
    return f;
  };
  const a4 = layer(4), a8 = layer(8), a16 = layer(16), a32 = layer(32);
  for (let i = 0; i < N * N; i++) {
    out[i * 4] = Math.min(255, (a4[i] * 0.55 + a8[i] * 0.3 + a16[i] * 0.15) * 255) | 0;
    out[i * 4 + 1] = Math.min(255, (a8[i] * 0.55 + a16[i] * 0.3 + a32[i] * 0.15) * 255) | 0;
    out[i * 4 + 2] = Math.min(255, (a16[i] * 0.6 + a32[i] * 0.4) * 255) | 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}
