// 환경 키트 비교 캡처: 같은 여섯 자리를 시범판 B(v2b)와 꾸민 배경(v2c)에서 찍는다 → <out>/b_<n>_<이름>.png · c_<n>_<이름>.png
//   node tools/v2/envkit_compare.mjs [out=/tmp/claude-0/v2/envkit] [device=fold_open]   (나란히 붙이기: tools/v2/envkit_compare.py)
// 적은 치워 두고(배경 비교가 목적) 영웅만 세운다. 헤드리스는 소프트웨어 WebGL 이다.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
const [out = '/tmp/claude-0/v2/envkit', dev = 'fold_open'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
// [이름, x, z, 카메라 거리(없으면 구간 값), 보는 쪽]
const SPOTS = [['street', 300, 130, 0, 1], ['front', 610, 200, 430, -1], ['props', 1470, 186, 0, 1], ['alley', 2190, 400, 0, 1], ['stairs', 2190, 640, 0, 1], ['yard', 2190, 1640, 0, 1]];
const port = 8100 + Math.floor(Math.random() * 800), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
for (const [tag, scene] of [['b', 'v2b'], ['c', 'v2c']]) {
  const ctx = await browser.newContext(contextOptions(dev)), page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=${scene}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 });
  await page.waitForTimeout(1200);
  let i = 0;
  for (const [name, x, z, dist, face] of SPOTS) {
    i++;
    const r = await page.evaluate(([x, z, dist, face]) => {
      const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim; g._pageHidden = true;
      for (const e of sim.enemies) { e.dead = true; e.hp = 0; }   // 배경만 본다
      sim.time = 20;                                              // 조작 안내 글자를 지운다
      const h = sim.hero; h.x = x; h.z = z; h.y = 400; h.vy = 0; h.facing = face; h.hp = 100; h.ifr = 0;
      const sec = sc.W.sections.find((s) => x >= s.x0 && x < s.x1 && z >= s.z0 && z < s.z1), old = sec.cam.dist;
      if (dist) sec.cam.dist = dist;
      sc.cam.snap = true;
      for (let k = 0; k < 150; k++) { h.hp = 100; g.tick(1 / 60); }
      g.render(); g.render();
      sec.cam.dist = old;
      const st = v.stats; return { draws: st.gl.draws, tris: st.gl.tris, hero: [Math.round(h.x), Math.round(h.y), Math.round(h.z)] };
    }, [x, z, dist, face]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${out}/${tag}_${i}_${name}.png` });
    console.log(tag, name, JSON.stringify(r));
  }
  console.log(tag, errs.length ? errs.join(' | ') : 'NO ERRORS');
  await ctx.close();
}
await browser.close(); srv.close();
