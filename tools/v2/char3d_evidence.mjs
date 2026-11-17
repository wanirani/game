// v2 char3d: 시범판 B 의 같은 자리에서 납작한 2D 영웅(?hero=2d)과 입체 영웅을 찍어 나란히 볼 수 있게 한다.
//   node tools/v2/char3d_evidence.mjs <outDir> [device=fold_open] [modes=2d,3d] [추가 쿼리]
//   → <outDir>/cmp_<자리>_<2d|3d>.png (영웅 둘레를 오린 것) + full_<자리>_<mode>.png (화면 전체) + evidence.json (프레임 시간 · 그리기 호출)
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
const [outDir = '/tmp/claude-0/v2/char3d', dev = 'fold_open', modes = '2d,3d', query = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
// 자리: [이름, 준비 JS, 누를 키, 틱 수, 그 뒤 JS]
const hold = (keys, n) => `g.input.setAutoSource(() => (${JSON.stringify(keys)})); for (let i = 0; i < ${n}; i++) g.tick(1/60); g.input.setAutoSource(null);`;
const quiet = `for (const e of sim.enemies) { e.active = false; e.state = 'idle'; e.cd = 9; } sim.shots.length = 0; sim.hero.hp = 100; sim.hero.ifr = 0;`;
const SPOTS = [
  ['street_idle', `v.teleport('street'); for (let i = 0; i < 50; i++) g.tick(1/60);`],
  ['street_run_right', `v.teleport('street'); ${hold({ right: true }, 34)}`],
  ['street_run_left', `v.teleport('pillar'); ${hold({ left: true }, 30)}`],
  ['alley_into_screen', `v.teleport('alley'); for (let i = 0; i < 30; i++) g.tick(1/60); ${quiet} ${hold({ up: true }, 37)}`],
  ['alley_toward_camera', `v.teleport('stairs'); for (let i = 0; i < 30; i++) g.tick(1/60); ${quiet} ${hold({ down: true }, 33)}`],
  ['alley_diagonal', `v.teleport('alley'); for (let i = 0; i < 30; i++) g.tick(1/60); ${quiet} ${hold({ up: true, left: true }, 26)}`],
  ['jump', `v.teleport('street'); ${hold({ right: true }, 20)} ${hold({ right: true, jump: true }, 13)}`],
  ['dash', `v.teleport('street'); ${hold({ right: true }, 20)} g.input.setAutoSource(() => ({ right: true, dash: true })); g.tick(1/60); ${hold({ right: true }, 7)}`],
  ['attack1', `v.teleport('street'); for (let i = 0; i < 20; i++) g.tick(1/60); g.input.setAutoSource(() => ({ attack: true })); g.tick(1/60); g.input.setAutoSource(null); for (let i = 0; i < 5; i++) g.tick(1/60);`],
  ['attack3', `v.teleport('street'); for (let i = 0; i < 20; i++) g.tick(1/60); for (let k = 0; k < 3; k++) { g.input.setAutoSource(() => ({ attack: true })); g.tick(1/60); g.input.setAutoSource(null); for (let i = 0; i < (k < 2 ? 10 : 7); i++) g.tick(1/60); }`],
  ['yard_fight', `v.teleport('yard'); sim.hero.z = 1700; for (let i = 0; i < 150; i++) g.tick(1/60); sim.hero.hp = 100; const e0 = sim.enemies.filter((e) => e.yard && !e.dead).sort((a, b) => Math.hypot(a.x - sim.hero.x, a.z - sim.hero.z) - Math.hypot(b.x - sim.hero.x, b.z - sim.hero.z))[0]; if (e0) { sim.hero.x = e0.x - 62; sim.hero.z = e0.z; sim.hero.facing = 1; } sim.hero.ifr = 2; g.tick(1/60); g.input.setAutoSource(() => ({ attack: true })); g.tick(1/60); g.input.setAutoSource(null); for (let i = 0; i < 5; i++) g.tick(1/60);`],
  ['hurt', `v.teleport('street'); for (let i = 0; i < 20; i++) g.tick(1/60); sim.hurtHero(5, -1, 0); for (let i = 0; i < 7; i++) g.tick(1/60);`],
];
const report = { device: dev, modes: {} };
for (const mode of modes.split(',')) {
  const ctx = await browser.newContext(contextOptions(dev));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=v2b&hero=${mode}${query ? '&' + query : ''}`);
  await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 });
  await page.waitForTimeout(1200);
  const R = (report.modes[mode] = { spots: {}, errors: errs });
  for (const [name, js] of SPOTS) {
    const r = await page.evaluate(([js]) => {
      const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim; g._pageHidden = true;
      sim.reset(); sc.cam.snap = true;
      (0, eval)(`(function(g, v, sc, sim){ ${js} })`)(g, v, sc, sim);
      g.render(); g.render();
      const h = sim.hero, p = v.project(h.x, (sc.visY ?? h.y) + 52, h.z), rc = g.canvas.getBoundingClientRect(), k = rc.width / g.viewW;
      return { cx: rc.left + p.x * k, cy: rc.top + p.y * k, k, anim: h.anim, hero3d: v.stats.hero3d, draws: v.stats.gl.draws, tris: v.stats.gl.tris, vw: innerWidth, vh: innerHeight };
    }, [js]);
    await page.waitForTimeout(120);
    const half = 150 * r.k, x = Math.max(0, Math.min(r.vw - half * 2, r.cx - half)), y = Math.max(0, Math.min(r.vh - half * 2, r.cy - half * 1.05));
    await page.screenshot({ path: `${outDir}/cmp_${name}_${mode}.png`, clip: { x, y, width: half * 2, height: half * 2 } });
    if (mode !== '2d' || /street_idle|yard/.test(name)) await page.screenshot({ path: `${outDir}/full_${name}_${mode}.png` });
    R.spots[name] = { anim: r.anim, draws: r.draws, tris: r.tris, hero3d: r.hero3d };
  }
  // 프레임 시간 (헤드리스 = 소프트웨어 렌더러): 거리에서 달리며 120프레임
  R.perf = await page.evaluate(() => {
    const g = window.__game, v = window.__v2, sim = v.scene.sim; sim.reset(); v.teleport('street'); v.perfFinish(true);
    g.input.setAutoSource(() => ({ right: true })); for (let i = 0; i < 120; i++) { g.tick(1 / 60); g.render(); if (sim.hero.x > 700) v.teleport('street'); } g.input.setAutoSource(null);
    const s = v.stats; v.perfFinish(false); return { frameMs: s.frameMs, parts: s.parts, mode: s.mode, draws: s.gl.draws, tris: s.gl.tris, texBytes: s.gl.texBytes, hero3d: s.hero3d };
  });
  await ctx.close();
}
writeFileSync(`${outDir}/evidence_${dev}.json`, JSON.stringify(report, null, 1));
for (const [m, R] of Object.entries(report.modes)) console.log(m, JSON.stringify(R.perf), R.errors.length ? R.errors.slice(0, 5).join(' | ') : 'NO ERRORS');
await browser.close(); srv.close();
