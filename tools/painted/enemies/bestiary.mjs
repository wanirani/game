// Bestiary QA for painted enemies (world === null, big scale): opens the in-game bestiary on each painted enemy and
// screenshots the art card, desktop or 844x390 phone.
//   node tools/painted/enemies/bestiary.mjs [--mobile] [--ids skeleton,bat,...] [--out dir] [--vec]
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import fs from 'node:fs';

const A = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; A[k] = v; }
const out = A.out ?? '/tmp/claude-0/enemy_review/bestiary';
fs.mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const mobile = !!A.mobile;
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s02`);
await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const ids = (A.ids ?? 'bat,ghost,skeleton,armor_knight,gravedigger').split(',');
await page.evaluate(({ ids, vec }) => {
  const g = window.__game;
  if (vec) globalThis.__paintedEnemies = false;
  const st = g.world.state ?? g.state;
  for (const id of ids) { if (st?.bestiary) st.bestiary[id] = 5; if (g.meta?.bestiary) g.meta.bestiary[id] = 5; }
  g.push('menu', { world: g.world, tab: 'bestiary' });
}, { ids, vec: !!A.vec });
await page.waitForTimeout(600);
for (const id of ids) {
  await page.evaluate((id) => {
    const g = window.__game, m = g.scenes[g.scenes.length - 1];
    const tab = m.tabs.bestiary;
    tab.i = tab.entries.findIndex((r) => r.id === id);
  }, id);
  await page.waitForTimeout(1600);   // rig bake on demand + crossfade
  await page.screenshot({ path: `${out}/${A.vec ? 'vec_' : ''}${id}${mobile ? '_m' : ''}.png` });
}
const rigs = await page.evaluate(async () => (await import('/src/render/painted/enemy_kit.js')).rigStats());
console.log(JSON.stringify(rigs));
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
