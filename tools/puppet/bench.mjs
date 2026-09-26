// 영웅 그리기 시간 벤치마크: 채색 퍼펫 vs 벡터 인형 (같은 자세·같은 변환·역광 패스 포함)
// node tools/puppet/bench.mjs [--n 400] [--scale 2] [--cls kael_hunter]
// 게임 화면과 같은 조건: 1920×1080 캔버스, 논리→장치 배율 2 (1280×720 @ DPR 1.5), HERO_DRAW_SCALE, world 전달(역광 테두리 켬)
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const port = 9900 + Math.floor(Math.random() * 90);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${port}/tools/gallery_hero.html?sec=none`);
await page.waitForFunction('window.__ready', null, { timeout: 60000 });
const res = await page.evaluate(async ({ N, SC, cls }) => {
  const H = await import('/src/render/hero.js');
  const { CHARACTERS } = await import('/src/data/characters.js');
  const { classChain } = await import('/src/data/classes.js');
  const { MOVESETS } = await import('/src/data/movesets.js');
  const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080;
  const ctx = cv.getContext('2d');
  const look = structuredClone(CHARACTERS.kael.look);
  for (const c of classChain(cls)) Object.assign(look, structuredClone(c.look || {}));
  look.weapon = { type: 'whip', style: 3, level: 7, rarity: 2 };
  const world = { time: 0 };
  const mk = () => ({ look, ch: CHARACTERS.kael, facing: 1, anim: 'idle', animT: 0, move: null, moveT: 0, vx: 0, vy: 0, onGround: true, rig: {}, t: 0, stats: { reach: 0 }, charging: 0, muzzleT: 0, cx: 480, bottom: 400 });
  // 퍼펫 로드 대기
  H.preloadPuppet('kael', cls);
  for (let i = 0; i < 200; i++) { const s = H.puppetStatus()['kael/' + cls]; if (s && s.state === 1 && s.levels.every((x) => x.endsWith('✓'))) break; ctx.setTransform(SC, 0, 0, SC, 0, 0); H.drawHero(ctx, mk(), world, {}); await new Promise((r) => setTimeout(r, 30)); }
  const cases = {
    idle: (p, t) => { p.anim = 'idle'; p.animT = t; },
    run: (p, t) => { p.anim = 'run'; p.animT = t; p.vx = 275; },
    attack: (p, t) => { const m = MOVESETS.whip.ground[0]; p.move = m; p.moveT = (t * 0.7) % m.dur; p.anim = m.anim; },
    jump: (p, t) => { p.anim = 'jump'; p.onGround = false; p.vy = -400; },
  };
  const out = {};
  for (const mode of ['puppet', 'vector']) {
    H.setPuppetEnabled(mode === 'puppet');
    for (const [name, f] of Object.entries(cases)) {
      const p = mk();
      for (let i = 0; i < 40; i++) { f(p, i / 60); p.t = i / 60; ctx.setTransform(SC, 0, 0, SC, 0, 0); H.drawHero(ctx, p, world, {}); }
      const ts = [];
      for (let i = 0; i < N; i++) {
        f(p, 1 + i / 60); p.t = 1 + i / 60; world.time = p.t;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1920, 1080); ctx.setTransform(SC, 0, 0, SC, 0, 0);
        const t0 = performance.now(); H.drawHero(ctx, p, world, {}); ctx.getImageData(0, 0, 1, 1); ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      out[mode + ':' + name] = { avg: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(3), p50: +ts[ts.length >> 1].toFixed(3), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(3) };
    }
  }
  H.setPuppetEnabled(true);
  return out;
}, { N: Number(opt('n', 300)), SC: Number(opt('scale', 2)), cls: opt('cls', 'kael_hunter') });
console.table(res);
if (errs.length) console.log('ERRORS', errs);
await browser.close(); srv.close();
