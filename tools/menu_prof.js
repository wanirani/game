// 캔버스 API 별 시간 합산 프로파일: eval=import('/tools/menu_prof.js?tab=system&n=1')
const g = window.__game;
const q = new URL(import.meta.url).searchParams;
const P = CanvasRenderingContext2D.prototype;
const acc = {};
const names = ['fillText', 'strokeText', 'drawImage', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'createRadialGradient', 'createLinearGradient', 'measureText', 'save', 'restore', 'clip', 'arc', 'ellipse'];
const orig = {};
for (const n of names) {
  orig[n] = P[n];
  P[n] = function (...a) { const t = performance.now(); const r = orig[n].apply(this, a); acc[n] = (acc[n] || 0) + performance.now() - t; return r; };
}
while (g.scenes.length > 1) g.pop();
g.push('menu', { world: g.world, tab: q.get('tab') || 'system' });
for (let i = 0; i < 5; i++) { g.top.t += 0.5; g.render(); }
for (const k in acc) acc[k] = 0;
const a = performance.now();
for (let i = 0; i < 10; i++) { g.top.cur.t += 1 / 60; g.render(); }
const tot = (performance.now() - a) / 10;
for (const n of names) P[n] = orig[n];
while (g.scenes.length > 1) g.pop();
console.warn(`[prof ${q.get('tab')}] total ${tot.toFixed(1)}ms ` + Object.entries(acc).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k} ${(v / 10).toFixed(2)}`).join(' | '));
