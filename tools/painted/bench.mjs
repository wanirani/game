// A/B 그리기 비용 벤치마크 (한 페이지에서 프레임마다 번갈아: 채색 / 벡터 / 없음 → 실행 간 잡음 제거)
// 사용: node tools/painted/bench.mjs <bossId> [--dpr 1.5] [--mobile] [--frames 900] [--quality high|medium|low]
//   JS  = 보스 draw() 호출 시간 (명령 기록), frame = 전체 프레임 + 강제 flush(getImageData) 중앙값, raster = frame − 없음
//   --mobile : 844×390, dpr 3, 안드로이드 UA (폰 메모리 예산 경로)
import { open, startFight, freeze, waitPainted } from './lib.mjs';
const argv = process.argv.slice(2);
const id = argv[0];
const val = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const mobile = argv.includes('--mobile');
const dpr = +val('dpr', mobile ? 3 : 1.5), frames = +val('frames', 900), q = val('quality', null);
const setq = val('set', '');   // 예: --set halos=0,crackGlow=0,strands=0,particles=0 (렌더러 st.q 덮어쓰기 → 기능별 비용 분해)
const mod = await import(`./poses/${id}.mjs`);
const s = await open({ url: `index.html?scene=stage&stage=${mod.STAGE}&room=boss`, mobile, dpr });
if (mobile) await s.page.evaluate(() => {});
if (q) await s.page.evaluate((q) => { window.__game.settings.quality = q; window.__game.resize(); }, q);
await startFight(s.page);
const bake = await waitPainted(s.page, id);
await freeze(s.page);
const res = await s.page.evaluate(async ([script, frames, setq]) => {
  const g = window.__game, w = g.world, b = w.boss, p = w.player, A = b.A, H0 = { ...b.main.hole };
  p.hp = 1e9; p.stats.maxHp = 1e9;
  let x = 99; Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const run = eval(script);
  const vectorDraw = Object.getPrototypeOf(Object.getPrototypeOf(Object.getPrototypeOf(b))).draw;   // Boss.prototype.draw (벡터)
  let mode = 'none';
  const stats = { painted: { js: [], fr: [] }, vector: { js: [], fr: [] }, none: { js: [], fr: [] } };
  const ctx = g.ctx;
  const patch = () => {
    const pr = b._painted?.proxy;
    if (pr && setq && !pr.__q) {
      pr.__q = true;
      for (const kv of setq.split(',')) { const [k2, v] = kv.split('='); if (k2 === 'particles') { if (v === '0') pr.st.P.draw = () => {}; } else pr.st.q = { ...pr.st.q, [k2]: v === '0' ? 0 : v === '1' ? 1 : +v }; }
    }
    if (pr && !pr.__pt) { const od = pr.draw.bind(pr); pr.__pt = true; pr.draw = (c, wd) => { if (mode !== 'painted') return; const t0 = performance.now(); od(c, wd); stats.painted.js.push(performance.now() - t0); }; }
    b.draw = (c, wd) => { if (mode !== 'vector') return; const t0 = performance.now(); vectorDraw.call(b, c, wd); stats.vector.js.push(performance.now() - t0); };
  };
  const modes = ['painted', 'vector', 'none'];
  for (let i = 0; i < 90 + frames; i++) {
    run(i, b, p, A, H0);
    g.__tick(1 / 60);
    patch();
    mode = modes[i % 3];
    const t0 = performance.now();
    g.__render();
    ctx.getImageData(0, 0, 1, 1);
    const dt = performance.now() - t0;
    if (i >= 90) stats[mode].fr.push(dt); else stats[mode].js.length = 0;
  }
  const avg = (a) => a.reduce((s2, v) => s2 + v, 0) / Math.max(1, a.length);
  const pct = (a, qq) => { if (!a.length) return 0; const s2 = [...a].sort((u, v) => u - v); return s2[Math.floor(qq * (s2.length - 1))]; };
  const out = { canvas: [g.canvas.width, g.canvas.height], quality: g.settings.quality };
  for (const m of modes) out[m] = { n: stats[m].fr.length, jsAvg: +avg(stats[m].js).toFixed(3), jsP95: +pct(stats[m].js, 0.95).toFixed(3), frameMed: +pct(stats[m].fr, 0.5).toFixed(2), frameP95: +pct(stats[m].fr, 0.95).toFixed(2) };
  out.rasterPainted = +(out.painted.frameMed - out.none.frameMed).toFixed(2);
  out.rasterVector = +(out.vector.frameMed - out.none.frameMed).toFixed(2);
  return out;
}, [mod.BENCH, frames, setq]);
console.log(JSON.stringify({ id, dpr, mobile, set: setq, bake, ...res }, null, 1));
console.log(s.errors.join('\n') || 'NO ERRORS');
await s.close();
