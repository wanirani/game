// In-game QA for painted enemies: a frozen "pose line" in the real stage (lighting, backdrop, camera, elite scale) plus
// a live melee where the god-mode player kills them (death corpses / dissolves), desktop or 844x390 mobile.
//   node tools/painted/enemies/ingame.mjs --stage s01 --line skeleton:idle,skeleton:walk,skeleton:attack@0.3,bat:fly,bat:hang \
//        [--mobile] [--vec] [--out dir] [--live 1] [--zoom 2] [--debug (hurtbox overlay)] [--elite] [--facing 1|-1|both]
//        [--quality low|medium|high (persisted setting, applied before the rigs bake)] [--dpr 1.5]
//   pose spec: id:anim[~state][@t][#facing] — '@t' freezes the pose at t s into the anim (animT = stateT = t, any anim: attack@0.3,
//   cast@0.5, pray@0.6, shiver@0.3 …); without '@' the anim plays live (attack/slam/fling: frozen at 0). '~state' also sets e.state (snow_wolf:wind~crouch@0.2);
//   hang / fly / dive set the matching state by themselves. Special: hurt (flash + stun), dmg50 / dmg20 (HP-damage variants).
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import fs from 'node:fs';

const A = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; A[k] = v; }
const out = A.out ?? '/tmp/claude-0/enemy_painted/ingame';
fs.mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const mobile = !!A.mobile;
const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: Number(A.dpr ?? 1.5) });
if (A.quality) await ctx.addInitScript((q) => { try { const k = 'bloodnocturne_settings'; const s = JSON.parse(localStorage.getItem(k) || '{}'); s.quality = q; localStorage.setItem(k, JSON.stringify(s)); } catch { /* ignore */ } }, String(A.quality));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=${A.stage ?? 's01'}${A.room ? `&room=${A.room}` : ''}`);
await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
await page.waitForTimeout(1500);
for (let i = 0; i < 6; i++) {
  const top = await page.evaluate(() => { const g = window.__game; return g.scenes[g.scenes.length - 1]?.constructor?.name; });
  if (/Stage/.test(top)) break;
  await page.keyboard.press('Enter'); await page.waitForTimeout(350);
}
const tag = (A.tag ?? (A.vec ? 'vec' : 'painted')) + (mobile ? '_m' : '');
const info = await page.evaluate(async ({ line, vec, gap, px, debug, elite, facing }) => {
  const kit = await import('/src/render/painted/enemy_kit.js');
  const { ENEMIES } = await import('/src/data/enemies.js');
  window.__rigStats = kit.rigStats;
  const g = window.__game, w = g.world, p = w.player;
  if (vec) globalThis.__paintedEnemies = false;
  if (debug) g.debug = true;
  p.takeHit = () => false; p.hp = 9999;
  // clear existing enemies near the player so the line reads
  for (const e of w.enemies()) if (Math.abs(e.cx - p.cx) < 1400) e.dead = true;
  if (px) p.x += Number(px);
  let items = line.split(',').filter(Boolean);
  if (facing === 'both') items = items.flatMap((s) => [s + '#1', s + '#-1']);
  const spawned = [];
  items.forEach((s, i) => {
    const [spec0, fc] = s.split('#');
    const [idAnim, at] = spec0.split('@');
    const [id, animSt = 'idle'] = idAnim.split(':');
    const [anim, st] = animSt.split('~');
    const d = ENEMIES[id];
    if (!d) throw new Error(`ingame: unknown enemy id '${id}' in --line`);
    const fx = p.cx + 120 + i * Number(gap ?? 90);
    let fy = p.bottom;
    if (d.flying) fy -= anim === 'hang' ? 150 : 70;
    const e = w.spawnEnemy(id, fx, fy, { facing: Number(fc ?? (facing && facing !== 'both' ? facing : -1)), elite: !!elite });
    e.awake = true;
    e._pose = { anim, st: st || null, fixed: at !== undefined || anim === 'attack' || anim === 'slam' || anim === 'fling', at: Number(at ?? 0) };   // attack/slam/fling without '@' = frozen at 0 (as before)
    e.update = function (dt) {
      this.t += dt;
      const P = this._pose;
      if (this.dying > 0) { this.dying -= dt; if (this.dying <= 0) this.dead = true; return; }
      if (this.flashT > 0) this.flashT -= dt;
      if (P.anim === 'hurt') { this.flashT = 0.1; this.stun = 0.2; this.anim = 'walk'; return; }
      this.anim = P.anim;
      this.state = P.st ?? (P.anim === 'hang' || P.anim === 'fly' || P.anim === 'dive' ? P.anim : this.state);
      // '@t' freezes any anim at t (renderers read animT, some stateT); no '@' = live loop
      if (P.fixed) { this.animT = P.at; this.stateT = P.at; } else { this.animT += dt; this.stateT = (this.stateT ?? 0) + dt; }
      if (P.anim === 'dive') { this.vx = -220; this.vy = 160; } else if (!this.def.flying) { this.vx = 0; this.onGround = true; }
      if (P.anim === 'dmg50') { this.hp = this.stats.maxHp * 0.5; this.anim = 'idle'; }
      if (P.anim === 'dmg20') { this.hp = this.stats.maxHp * 0.2; this.anim = 'idle'; }
    };
    spawned.push(e);
  });
  window.__line = spawned;
  return { n: spawned.length, cam: [w.camera.x, w.camera.y], p: [p.cx, p.bottom] };
}, { line: A.line ?? 'skeleton:idle', vec: !!A.vec, gap: A.gap, px: A.px, debug: !!A.debug, elite: !!A.elite, facing: A.facing });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/${tag}_line.png` });
// zoomed crop around the line
const box = await page.evaluate(() => {
  const g = window.__game, w = g.world, cam = w.camera, L = window.__line;
  const xs = L.map((e) => e.cx), ys = L.map((e) => e.bottom);
  const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 70, y0 = Math.min(...L.map((e) => e.y)) - 60, y1 = Math.max(...ys) + 20;
  const c = g.canvas.getBoundingClientRect(), sx = c.width / g.viewW, sy = c.height / g.viewH;
  const tx = (x) => c.left + (x - cam.x) * cam.zoom * sx, ty = (y) => c.top + (y - cam.y) * cam.zoom * sy;
  return { x: Math.max(0, tx(x0)), y: Math.max(0, ty(y0)), width: tx(x1) - tx(x0), height: ty(y1) - ty(y0) };
});
if (box.width > 10) await page.screenshot({ path: `${out}/${tag}_line_crop.png`, clip: { x: box.x, y: box.y, width: Math.min(box.width, (mobile ? 844 : 1280) - box.x), height: Math.min(box.height, (mobile ? 390 : 720) - box.y) } });
if (A.live) {
  // let them loose: restore AI, the god-mode player walks in swinging; capture deaths/corpses
  await page.evaluate(() => { for (const e of window.__line) delete e.update; });
  const K = { right: 'ArrowRight', attack: 'KeyX', jump: 'KeyZ' };
  let n = 0;
  for (let i = 0; i < Number(A.live === true ? 14 : A.live); i++) {
    await page.keyboard.down(K.right); await page.waitForTimeout(90); await page.keyboard.up(K.right);
    await page.keyboard.down(K.attack); await page.waitForTimeout(80); await page.keyboard.up(K.attack);
    await page.waitForTimeout(160);
    if (i % 2 === 1) await page.screenshot({ path: `${out}/${tag}_live_${n++}.png` });
  }
  // finish everything off and catch the corpses mid-fall
  await page.evaluate(() => { const w = window.__game.world; for (const e of window.__line) if (!e.dead && e.dying <= 0) e.takeHit(e.hp + 1, { dir: 1, kb: [200, -200] }, w, {}); });
  await page.waitForTimeout(120); await page.screenshot({ path: `${out}/${tag}_death_0.png` });
  await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${tag}_death_1.png` });
  await page.waitForTimeout(450); await page.screenshot({ path: `${out}/${tag}_death_2.png` });
}
if (A.kill) {
  // kill the whole line in place (no player movement → no story triggers) and film the corpses/dissolves
  await page.evaluate(() => { const w = window.__game.world; for (const e of window.__line) { delete e.update; if (!e.dead && e.dying <= 0) { e.vx = 120; e.takeHit(e.hp + 1, { dir: 1, kb: [200, -200] }, w, {}); } } });
  for (const [i, ms] of [[0, 90], [1, 200], [2, 300], [3, 500]]) {
    await page.waitForTimeout(ms);
    if (box.width > 10) await page.screenshot({ path: `${out}/${tag}_kill_${i}.png`, clip: { x: box.x, y: Math.max(0, box.y - 40), width: Math.min(box.width, (mobile ? 844 : 1280) - box.x), height: Math.min(box.height + 60, (mobile ? 390 : 720) - Math.max(0, box.y - 40)) } });
  }
}
const res = await page.evaluate(() => ({ fps: Math.round(window.__game.fps), rigs: window.__rigStats?.() }));
console.log(JSON.stringify({ info, ...res }));
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await browser.close(); srv.close();
