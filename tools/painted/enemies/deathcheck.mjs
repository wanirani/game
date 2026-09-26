// Death-path QA for painted enemies: kills enemies in the air (launcher juggle), over a pit edge and on the ground,
// with a busy particle list (the corpse/dissolve must not inherit another particle's alpha), and films the result.
//   node tools/painted/enemies/deathcheck.mjs [--stage s01] [--ids skeleton,armor_knight,gravedigger,bat,ghost] [--mobile] [--out dir]
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import fs from 'node:fs';

const A = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; A[k] = v; }
const out = A.out ?? '/tmp/claude-0/enemy_review/death';
fs.mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const mobile = !!A.mobile;
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=${A.stage ?? 's01'}`);
await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
await page.waitForTimeout(1500);
for (let i = 0; i < 6; i++) {
  const top = await page.evaluate(() => { const g = window.__game; return g.scenes[g.scenes.length - 1]?.constructor?.name; });
  if (/Stage/.test(top)) break;
  await page.keyboard.press('Enter'); await page.waitForTimeout(350);
}
const ids = (A.ids ?? 'skeleton,armor_knight,gravedigger,bat,ghost').split(',');
const res = await page.evaluate(async ({ ids }) => {
  const kit = await import('/src/render/painted/enemy_kit.js');
  const g = window.__game, w = g.world, p = w.player;
  p.takeHit = () => false; p.hp = 9999;
  for (const e of w.enemies()) if (Math.abs(e.cx - p.cx) < 1400) e.dead = true;
  const { PAINTED_ENEMIES } = await import('/src/render/painted/enemies/index.js');
  for (const id of ids) kit.requestRig(PAINTED_ENEMIES[id].spec);
  for (let k = 0; k < 80 && !ids.every((id) => kit.rigStats()[id]?.ready); k++) await new Promise((r) => setTimeout(r, 100));
  const L = [];
  ids.forEach((id, i) => {
    const e = w.spawnEnemy(id, p.cx + 110 + i * 85, p.bottom - 150, { facing: -1, elite: false });
    e.awake = true; e.update0 = e.update;
    L.push(e);
  });
  // launch them all (juggle) → they are in the air
  for (const e of L) { e.vy = -520; e.onGround = false; e.y -= 20; if (e.def.flying) e.y -= 0; }
  window.__L = L;
  return { n: L.length, ground: p.bottom };
}, { ids });
await page.waitForTimeout(260);            // near the apex
// fill the particle list with dim particles so the next ghost callback would inherit a low globalAlpha
await page.evaluate(() => {
  const w = window.__game.world;
  for (const e of window.__L) {
    w.fx.emit('dust', e.cx, e.cy - 200, { life: 30, alpha: 0.02, layer: 'back' });
    w.fx.emit('dust', e.cx, e.cy - 200, { life: 30, alpha: 0.02, layer: 'front' });
  }
  window.__airY = window.__L.map((e) => Math.round(e.bottom));
  for (const e of window.__L) if (!e.dead && e.dying <= 0) e.takeHit(e.hp + 1, { dir: 1, kb: [120, -100] }, w, {});
  // keep dim particles between every other ghost entry too
  for (let i = 0; i < 6; i++) { w.fx.emit('dust', 0, -999, { life: 30, alpha: 0.02, layer: 'back' }); w.fx.emit('dust', 0, -999, { life: 30, alpha: 0.02, layer: 'front' }); }
});
const shots = [];
for (const [i, ms] of [[0, 60], [1, 200], [2, 450], [3, 700]]) {
  await page.waitForTimeout(ms);
  const f = `${out}/${A.tag ?? 'death'}${mobile ? '_m' : ''}_${i}.png`;
  await page.screenshot({ path: f });
  shots.push(f);
}
const info = await page.evaluate(() => ({ airY: window.__airY, fx: window.__game.world.fx.list.filter((p) => p.shape === 'ghost').length }));
// alpha-inheritance probe: a T1 dissolve and a T2 corpse drawn by fx.draw right after a nearly transparent particle must
// look the same as when drawn after an opaque one (fx.draw leaves globalAlpha at the previous particle's value)
const probe = await page.evaluate(async () => {
  const g = window.__game, w = g.world, p = w.player;
  const kit = await import('/src/render/painted/enemy_kit.js');
  const { PAINTED_ENEMIES } = await import('/src/render/painted/enemies/index.js');
  const out = {};
  for (const id of ['bat', 'skeleton']) {
    const rig = kit.requestRig(PAINTED_ENEMIES[id].spec);
    const e = w.spawnEnemy(id, p.cx + 200, p.bottom - (id === 'bat' ? 60 : 0), { facing: 1, elite: false });
    e.awake = true; e.state = 'fly'; e.anim = id === 'bat' ? 'fly' : 'idle';
    e.dying = 0.3; e.hp = 0;
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const cg = c.getContext('2d', { willReadFrequently: true });
    // record the ghost the renderer spawns on its first dying frame
    const n0 = w.fx.list.length;
    cg.setTransform(1, 0, 0, 1, 200 - e.cx, 260 - e.bottom);
    PAINTED_ENEMIES[id].draw(cg, e, w, { flash: false, cam: cg.getTransform() }, rig);
    const gh = w.fx.list.slice(n0).find((q) => q.shape === 'ghost');
    w.fx.list = w.fx.list.filter((q) => q !== gh);
    e.dead = true;
    const sum = (prevAlpha) => {
      const Pfx = Object.getPrototypeOf(w.fx).constructor;
      const fx = new Pfx(10);
      fx.list.push({ shape: 'circle', x: -999, y: -999, vx: 0, vy: 0, size: 1, life: 1, max: 1, alpha: prevAlpha / 1.4, color: '#000', layer: gh.layer });
      fx.list.push(gh);
      cg.setTransform(1, 0, 0, 1, 0, 0); cg.globalAlpha = 1; cg.clearRect(0, 0, 400, 300);
      cg.setTransform(1, 0, 0, 1, 200 - e.cx, 260 - e.bottom);
      fx.draw(cg, gh.layer);
      const d = cg.getImageData(0, 0, 400, 300).data; let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i];
      return a;
    };
    const opaque = sum(1), dim = sum(0.03);
    out[id] = { opaque, dim, ratio: +(dim / Math.max(1, opaque)).toFixed(3) };
  }
  return out;
});
console.log(JSON.stringify({ res, info, shots }));
console.log('alpha probe (ratio should be ~1):', JSON.stringify(probe));
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
