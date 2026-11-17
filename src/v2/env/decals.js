// 환경 키트 — 바닥 스티커 그림 8종 (코드로 그린다). docs/v2/ENV_KIT.md §12
// 되풀이 무늬를 깨는 싼 방법: 텍스처를 키우지 않고, 바닥에 반투명 얼룩을 드문드문 붙인다 (동적 묶음 1회에 같이 그려진다).
//   drawDecalSprites(ctx, ox, oy) → { 이름: [px, py] }  (칸 128², 4 × 2 줄 = 528 × 264 px)
//   이름: moss 이끼 · puddle 물웅덩이 · stain 때 · crack 금 · scorch 그을음 · ash 재 · leaves 낙엽 · straw 짚
export const DECAL_ALPHA = { moss: 0.55, puddle: 0.85, stain: 0.5, crack: 0.8, scorch: 0.8, ash: 0.6, leaves: 0.9, straw: 0.85 };
export const DECAL_NAMES = ['moss', 'puddle', 'stain', 'crack', 'scorch', 'ash', 'leaves', 'straw'];
export function drawDecalSprites(x, ox, oy) {
  const R = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
  const blob = (cx, cy, n, r0, col, seed, a0 = 0.5, spread = 40) => {   // 불규칙한 얼룩: 작은 부드러운 원 여러 개
    const r = R(seed);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * spread, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9, rr = r0 * (0.5 + r());
      const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, col.replace('A', String(a0 * (0.5 + 0.5 * r())))); g.addColorStop(1, col.replace('A', '0'));
      x.fillStyle = g; x.fillRect(px - rr, py - rr, rr * 2, rr * 2);
    }
  };
  const out = {}, cell = (i, name, draw) => { const px = ox + (i % 4) * 132, py = oy + ((i / 4) | 0) * 132; x.save(); x.beginPath(); x.rect(px, py, 128, 128); x.clip(); draw(px + 64, py + 64); x.restore(); out[name] = [px, py]; };
  cell(0, 'moss', (cx, cy) => { blob(cx, cy, 60, 20, 'rgba(96,128,70,A)', 7, 0.55); blob(cx, cy, 80, 5, 'rgba(150,180,96,A)', 9, 0.6); });
  cell(1, 'puddle', (cx, cy) => {   // 어두운 몸 + 하늘빛 + 반짝임
    blob(cx, cy, 26, 30, 'rgba(10,14,26,A)', 11, 0.9); blob(cx - 6, cy - 6, 10, 16, 'rgba(110,130,190,A)', 13, 0.35);
    x.globalAlpha = 0.5; x.fillStyle = '#dfe6ff'; x.beginPath(); x.ellipse(cx - 16, cy - 12, 14, 2.2, -0.2, 0, 7); x.fill(); x.beginPath(); x.ellipse(cx + 10, cy + 6, 9, 1.6, -0.2, 0, 7); x.fill();
  });
  cell(2, 'stain', (cx, cy) => blob(cx, cy, 40, 26, 'rgba(0,0,0,A)', 17, 0.4));
  cell(3, 'crack', (cx, cy) => {   // 갈라진 금: 가운데에서 뻗는 가지
    const r = R(23); x.lineCap = 'round';
    const walk = (px, py, a, len, w) => { x.strokeStyle = `rgba(6,6,10,${0.5 + 0.4 * r()})`; x.lineWidth = w; x.beginPath(); x.moveTo(px, py); for (let i = 0; i < len; i++) { a += (r() - 0.5) * 0.9; px += Math.cos(a) * 6; py += Math.sin(a) * 5; x.lineTo(px, py); if (w > 1.2 && r() < 0.22) { x.stroke(); walk(px, py, a + (r() < 0.5 ? 0.9 : -0.9), (len - i) >> 1, w * 0.6); x.strokeStyle = 'rgba(6,6,10,0.8)'; x.lineWidth = w; x.beginPath(); x.moveTo(px, py); } } x.stroke(); };
    for (let k = 0; k < 4; k++) walk(cx + (r() - 0.5) * 10, cy + (r() - 0.5) * 10, k * 1.6 + r(), 9, 2.4);
  });
  cell(4, 'scorch', (cx, cy) => { blob(cx, cy, 46, 26, 'rgba(0,0,0,A)', 31, 0.75, 34); blob(cx, cy, 30, 9, 'rgba(40,20,10,A)', 33, 0.6, 46); });
  cell(5, 'ash', (cx, cy) => { blob(cx, cy, 44, 18, 'rgba(176,172,168,A)', 41, 0.5); blob(cx, cy, 60, 3, 'rgba(30,28,28,A)', 43, 0.9, 46); blob(cx, cy, 30, 3, 'rgba(236,232,224,A)', 45, 0.8, 44); });
  cell(6, 'leaves', (cx, cy) => { const r = R(51); for (let i = 0; i < 30; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 52; x.fillStyle = ['rgba(150,84,34,0.95)', 'rgba(126,100,40,0.95)', 'rgba(96,56,30,0.95)', 'rgba(170,120,44,0.9)'][i % 4]; x.beginPath(); x.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, 5 + 3 * r(), 2.4 + r(), r() * 3.14, 0, 7); x.fill(); } });
  cell(7, 'straw', (cx, cy) => { const r = R(61); x.lineCap = 'round'; for (let i = 0; i < 90; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 50, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9, b = r() * 3.14, l = 6 + 9 * r(); x.strokeStyle = ['rgba(214,186,110,0.9)', 'rgba(170,140,80,0.9)', 'rgba(232,210,140,0.85)'][i % 3]; x.lineWidth = 1.4; x.beginPath(); x.moveTo(px - Math.cos(b) * l, py - Math.sin(b) * l * 0.8); x.lineTo(px + Math.cos(b) * l, py + Math.sin(b) * l * 0.8); x.stroke(); } });
  return out;
}
