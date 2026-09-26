// Screenshot harness for painted enemies (QA). Run from the repo root:
//   node tools/painted/enemies/shot.mjs gallery --ids skeleton,bat [--t 1.2] [--vec] [--zoom 2] [--out /tmp/x.png] [--bg bg/s02_graveyard]
//   node tools/painted/enemies/shot.mjs stage --stage s01 [--room r1] [--spawn skeleton:4,bat:3] [--mobile] [--steps 'wait:1,shot,...'] [--out dir]
// stage mode: god-mode player, enemies spawned around the player, screenshots + page errors + fps + rig stats.
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const mode = argv[0];
const A = {};
for (let i = 1; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; A[k] = v; }
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const mobile = !!A.mobile;
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: Number(A.w ?? 1280), height: Number(A.h ?? 720) }, deviceScaleFactor: Number(A.dpr ?? 1) });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/Failed to load resource|fonts\.g/.test(t)) errs.push(m.type().toUpperCase() + ' ' + t.slice(0, 300)); } });
const out = A.out ?? '/tmp/claude-0/enemy_painted';

if (mode === 'gallery') {
  const q = new URLSearchParams({ ids: A.ids ?? 'skeleton', ...(A.t ? { t: A.t } : {}), ...(A.vec ? { vec: 1 } : {}), zoom: A.zoom ?? 2, ...(A.bg ? { bg: A.bg } : {}), ...(A.td ? { td: A.td } : {}), ...(A.cellw ? { cellw: A.cellw } : {}), ...(A.cellh ? { cellh: A.cellh } : {}) });
  await page.goto(`http://localhost:${port}/tools/painted/enemies/gallery.html?${q}`);
  await page.waitForFunction(() => window.__galleryReady, null, { timeout: 20000 }).catch(() => errs.push('HARNESS gallery not ready'));
  await page.waitForTimeout(Number(A.wait ?? 400));
  const f = out.endsWith('.png') ? out : `${out}/gallery.png`;
  fs.mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true });
  await page.locator('#c').screenshot({ path: f });
  console.log(f, JSON.stringify(await page.evaluate(() => document.getElementById('info').textContent)));
} else if (mode === 'stage') {
  fs.mkdirSync(out, { recursive: true });
  const url = `index.html?scene=stage&stage=${A.stage ?? 's01'}${A.room ? `&room=${A.room}` : ''}`;
  await page.goto(`http://localhost:${port}/${url}`);
  await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  // close any dialogue/story overlays
  for (let i = 0; i < 6; i++) {
    const top = await page.evaluate(() => { const g = window.__game; return g.scenes[g.scenes.length - 1]?.constructor?.name; });
    if (/Stage/.test(top)) break;
    await page.keyboard.press('Enter'); await page.waitForTimeout(350);
  }
  await page.evaluate(async () => {
    window.__ENEMIES = (await import('/src/data/enemies.js')).ENEMIES;
    const kit = await import('/src/render/painted/enemy_kit.js');
    window.__rigStats = kit.rigStats;
  });
  await page.evaluate(({ spawn, vec, frozen }) => {
    const g = window.__game, w = g.world, p = w.player;
    if (vec) globalThis.__paintedEnemies = false;
    p.takeHit = () => false; p.hp = 9999;
    const list = (spawn || '').split(',').filter(Boolean);
    let k = 0;
    for (const s of list) {
      const [id, n = 1] = s.split(':');
      for (let i = 0; i < Number(n); i++) {
        const d = window.__ENEMIES?.[id];
        const dx = (k % 2 ? 1 : -1) * (140 + 70 * Math.floor(k / 2));
        const e = w.spawnEnemy(id, p.cx + dx, p.bottom - (d?.flying ? 120 : 0), { facing: dx > 0 ? -1 : 1 });
        if (e) { e.awake = true; if (frozen) e.update = function (dt) { this.t += dt; this.animT += dt; this.stateT += dt; if (this.flashT > 0) this.flashT -= dt; if (this.dying > 0) { this.dying -= dt; if (this.dying <= 0) this.dead = true; } }; }
        k++;
      }
    }
  }, { spawn: A.spawn ?? '', vec: !!A.vec, frozen: !!A.frozen });
  const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC' };
  let n = 0;
  for (const s of (A.steps ?? 'wait:1.5,shot,wait:0.5,shot').split(',')) {
    const [k, d] = s.split(':');
    if (k === 'shot') { await page.screenshot({ path: `${out}/${A.tag ?? 'shot'}_${n++}.png` }); continue; }
    if (k === 'wait') { await page.waitForTimeout(Number(d) * 1000); continue; }
    if (k.startsWith('eval=')) { await page.evaluate(k.slice(5)); continue; }
    const key = KEY[k] || k;
    await page.keyboard.down(key); await page.waitForTimeout(Number(d || 0.1) * 1000); await page.keyboard.up(key); await page.waitForTimeout(30);
  }
  const info = await page.evaluate(() => { const g = window.__game, w = g.world; return { fps: Math.round(g.fps), enemies: w.enemies().length, rigs: window.__rigStats?.() }; });
  console.log(JSON.stringify(info));
}
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
