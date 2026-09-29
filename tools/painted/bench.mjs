// A/B 그리기 비용 벤치마크 (한 페이지에서 프레임마다 번갈아: 채색 / 벡터 / 없음 → 실행 간 잡음 제거)
// 사용: node tools/painted/bench.mjs <bossId> [--dpr 1.5] [--mobile] [--frames 900] [--quality high|medium|low]
//   JS  = 보스 draw() 호출 시간 (명령 기록), frame = 전체 프레임 + 강제 flush(getImageData) 중앙값, raster = frame − 없음
//   --mobile : 844×390, dpr 3, 안드로이드 UA (폰 메모리 예산 경로)
//   --gpu    : SwiftShader GL 가속 캔버스 (텍스처 블릿 경로). 기본은 CPU 래스터 (그림 면적에 비례, 더 비관적)
import { open, startFight, freeze, waitPainted } from './lib.mjs';
const argv = process.argv.slice(2);
const id = argv[0];
const val = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const mobile = argv.includes('--mobile');
const dpr = +val('dpr', mobile ? 3 : 1.5), frames = +val('frames', 900), q = val('quality', null);
const setq = val('set', '');   // 예: --set halos=0,crackGlow=0,strands=0,particles=0 (렌더러 st.q 덮어쓰기 → 기능별 비용 분해)
const mod = await import(`./poses/${id}.mjs`);
const gpu = argv.includes('--gpu');
const s = await open({ url: `index.html?scene=stage&stage=${mod.STAGE}&room=boss`, mobile, dpr, gpu });
if (q) await s.page.evaluate((q) => { window.__game.settings.quality = q; window.__game.resize(); }, q);
await startFight(s.page);
const bake = await waitPainted(s.page, id);
await freeze(s.page);
const res = await s.page.evaluate(async ([script, frames, setq]) => {
  const g = window.__game, w = g.world, b = w.boss, p = w.player, A = b.A, H0 = { ...(b.main?.hole ?? {}) };   // b.main = 뼈 용 전용 (굴 구멍)
  p.hp = 1e9; p.stats.maxHp = 1e9;
  let x = 99; Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  const run = eval(script);
  // 벡터 그리기 = Boss.prototype.draw (ABoss/BossB.draw 는 채색 대리 개체가 있으면 일찍 돌아가므로 쓰면 안 된다; BossC 는 한 단계 더 깊다)
  let vectorDraw = null;
  for (let pr = Object.getPrototypeOf(b); pr && pr !== Object.prototype; pr = Object.getPrototypeOf(pr)) {
    if (pr.constructor?.name === 'Boss' && Object.prototype.hasOwnProperty.call(pr, 'draw')) { vectorDraw = pr.draw; break; }
  }
  if (!vectorDraw) throw new Error('bench: Boss.prototype.draw 를 찾지 못함');
  let mode = 'none';
  const stats = { painted: { js: [], fr: [] }, vector: { js: [], fr: [] }, none: { js: [], fr: [] } };
  const ctx = g.ctx;
  const patch = () => {
    const pr = b._painted?.proxy;
    if (pr && setq && !pr.__q) {
      pr.__q = true; pr.st.qLock = true;
      for (const kv of setq.split(',')) { const [k2, v] = kv.split('='); if (k2 === 'particles') { if (v === '0') pr.st.P.draw = () => {}; } else pr.st.q = { ...pr.st.q, [k2]: v === '0' ? 0 : v === '1' ? 1 : +v }; }
    }
    if (pr && !pr.__pt) { const od = pr.draw.bind(pr); pr.__pt = true; pr.draw = (c, wd) => { if (mode !== 'painted') return; const t0 = performance.now(); od(c, wd); stats.painted.js.push(performance.now() - t0); }; }
    b.draw = (c, wd) => { if (mode !== 'vector') return; const t0 = performance.now(); vectorDraw.call(b, c, wd); stats.vector.js.push(performance.now() - t0); };
  };
  const modes = ['painted', 'vector', 'none'];
  for (let i = 0; i < 90 + frames; i++) {
    const top = g.scenes[g.scenes.length - 1];
    if (top?.name === 'dialogue') top.finish?.();   // 전투 중 대사(페이즈 대사 등)는 넘긴다 — 위에 뜨면 스테이지가 멈춘다
    p.hp = 1e6;                                     // 한 방이 최대 체력보다 커도 죽지 않게 (죽으면 world.respawn 이 보스를 되돌린다)
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
console.log(JSON.stringify({ id, dpr, mobile, gpu, set: setq, bake, ...res }, null, 1));
console.log(s.errors.join('\n') || 'NO ERRORS');
await s.close();
process.exit(s.errors.length ? 1 : 0);
