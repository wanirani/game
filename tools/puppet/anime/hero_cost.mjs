// 애니풍 시범: 영웅 한 명 그리기 비용 (CPU) — 플래그 끔/켬을 같은 게임 상태에서 번갈아 잰다.
// node tools/puppet/anime/hero_cost.mjs [--vp desk|phone1low|phone1] [--n 300] [--reps 5]
//  · s01 에서 대본(대기 → 달리기 → 3연타 → 점프)을 정지 시계로 돌리다가 정해진 순간마다 멈추고 world.player 를 drawHero 로 n 번 그린다
//  · 시간 = CDP ThreadTime (메인 스레드 CPU) / n — 부하가 큰 기계에서도 벽시계보다 덜 흔들린다. 배치를 번갈아 reps 번, 최솟값
//  · 플래그 끔(예전 퍼펫)과 켬(?anime=1, 애니 퍼펫 + 메시)을 각각 새 페이지로 연다. 메시 삼각형 수(meshStats)도 함께
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import { freeze } from '../../qa/lib/step.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const VP = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, cores: 8 },
  phone1low: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, cores: 4 },   // 4코어 폰 = 시작 화질 low (메시 꺼짐)
  phone1: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, cores: 8 },      // 8코어 폰 = medium
};
const vp = String(opt('vp', 'desk')), N = Number(opt('n', 300)), REPS = Number(opt('reps', 5));
const port = 9500 + Math.floor(Math.random() * 300);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const KEY = { right: 'ArrowRight', jump: 'KeyZ', attack: 'KeyX' };
// 대본: [키, 프레임] … 'bench' 에서 잰다
const SCRIPT = [['wait', 60], ['bench', 'idle'], ['right', 30], ['bench', 'run'], ['wait', 20], ['attack', 3], ['bench', 'attack'], ['wait', 30], ['jump', 6], ['bench', 'jump']];
async function run(anime) {
  const { cores, ...ctxOpt } = VP[vp];
  const ctx = await browser.newContext(ctxOpt);
  await ctx.addInitScript((n) => { try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => n }); } catch {} }, cores);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s01&char=kael${anime ? '&anime=1' : ''}`);
  await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 60000 });
  await page.evaluate(async () => { const g = window.__game; g.autoQualityOn = () => false; window.__H = await import('/src/render/hero.js'); window.__M = await import('/src/render/puppet_mesh.js').catch(() => null); });
  for (let k = 0; k < 120; k++) {
    const ok = await page.evaluate((anime) => {
      const g = window.__game; while (/^(dialogue|bossIntro|story)$/.test(g.top?.name ?? '')) g.pop();
      return Object.entries(window.__H.puppetStatus()).some(([k2, v]) => k2.startsWith('kael/') && (anime ? k2.endsWith('@anime') : !k2.endsWith('@anime')) && v.state === 1);
    }, anime);
    if (ok && k > 8) break;
    await page.waitForTimeout(150);
  }
  await freeze(page);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const cpu = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'ThreadTime')?.value ?? NaN;
  const out = {};
  const tier = await page.evaluate(() => window.__game.tier);
  for (const [k, n] of SCRIPT) {
    if (k === 'bench') {
      // 같은 상태에서 n 번: 게임 화면과 같은 배율의 화면 밖 캔버스에 그린다 (예열 20번)
      const one = (n) => page.evaluate((n) => {
        const g = window.__game, w = g.world, p = w.player;
        const c = (window.__bc ||= document.createElement('canvas')); c.width = 512; c.height = 512;
        const x = c.getContext('2d'), s = g.scale * (w.camera?.zoom || 1);
        const ms = window.__M?.meshStats; const t0 = ms ? ms.tris : 0;
        for (let i = 0; i < n; i++) { x.setTransform(s, 0, 0, s, 256 - p.cx * s, 480 - p.bottom * s); window.__H.drawHero(x, p, w, {}); }
        x.getImageData(0, 0, 1, 1);
        return ms ? (ms.tris - t0) / n : 0;
      }, n);
      await one(20);
      const runs = []; let tris = 0;
      for (let r = 0; r < REPS; r++) { const c0 = await cpu(); tris = await one(N); runs.push(((await cpu()) - c0) * 1000 / N); }
      out[n] = { ms: +Math.min(...runs).toFixed(3), med: +runs.sort((a, b) => a - b)[runs.length >> 1].toFixed(3), tris: +tris.toFixed(1) };
      continue;
    }
    const keys = k === 'wait' ? [] : [KEY[k]];
    for (const kk of keys) await page.keyboard.down(kk);
    for (let i = 0; i < n; i++) await page.evaluate(() => window.__qaStep(1, false));
    for (const kk of keys) await page.keyboard.up(kk);
  }
  const pup = await page.evaluate(() => Object.keys(window.__H.puppetStatus()).filter((k) => k.startsWith('kael/kael_hunter')));
  await ctx.close();
  return { anime, tier, pup, errs, cost: out };
}
const off = await run(false), on = await run(true);
console.log(JSON.stringify({ vp, n: N, reps: REPS, off, on }, null, 1));
await browser.close(); srv.close();
