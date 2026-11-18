// v2g owner captures (INTEGRATE-A): staged stills of the real areas for the owner sheet — each enemy kind fighting, a townsperson
// with the prompt and the dialogue box, the graveyard elite, fire, and the same view at the old and the new render size.
//   node tools/v2/game_owner.mjs [--out /tmp/claude-0/v2/integA/owner] [--only soldier,mage,corpse,bat,elite,ghost,people,fire,sharp]
// Then: node tools/v2/coreverify_owner.mjs <spec.json> /tmp/claude-0/v2/owner_integA.png (the spec is written next to the stills).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { installBot } from './game_bot.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/integA/owner'), ONLY = args.only ? String(args.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port), info = {};
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
async function open(q) {
  const page = await (await browser.newContext(contextOptions('fold_open'))).newPage(); page._errs = [];
  page.on('pageerror', (e) => page._errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') page._errs.push(m.text()); });
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&${q}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 });
  await page.waitForFunction(() => window.__v2.stats.hud === 'ui' && window.__v2.scene.hud.ready, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(installBot, [[0, 0]]);
  return page;
}
/** put the hero next to the first enemy of a kind, wake its group, let the bot fight until that kind winds up an attack close by (or strikes land) */
const fight = (page, kind, o = {}) => page.evaluate(([kind, o]) => {
  const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, h = sim.hero, B = window.__bot; g._pageHidden = true;
  const E = sim.enemies.filter((e) => e.kind === kind && !e.dead); if (!E.length) return { none: true };
  const e0 = E[0], hx = o.x ?? e0.x - (o.dx ?? 150), hz = o.z ?? e0.z + (o.dz ?? 0);
  h.x = hx; h.z = hz; h.y = (e0.gy ?? e0.y) + 200; h.vx = h.vz = h.vy = 0; h.onGround = false; if (h.safe) { h.safe.x = hx; h.safe.z = hz; }
  h.dirX = 1; h.dirZ = 0; sc.heroA.dx = 1; sc.heroA.dz = 0; sc.cam.snap = true;
  for (const e of sim.enemies) if (e.group === e0.group && !e.dead) { if (sim.wake) sim.wake(e); e.active = true; }
  B.opt.giveUp = 100000; let best = null, hits0 = sc.feelN;
  for (let i = 0; i < (o.ticks ?? 900); i++) {
    B.think(); g.tick(1 / 60);
    if (i < (o.min ?? 50)) continue;
    let ok = false;
    for (const e of sim.enemies) { if (e.kind !== kind || e.dead || e.state === 'dead' || !e._a3?.vis) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < (o.near ?? 230) && (o.any || (e.tele > (o.tele ?? 0.45) && e.tele < 0.95) || (o.hit && sc.feelN > hits0 + 1 && h.move))) ok = true; }
    if (ok) { best = i; break; }
  }
  B.act = {}; g.alpha = 1; g.render(); g.render();
  return { kind, tick: best, hp: h.hp, drawn: sc.c3.drawn, left: v.enemies.filter((e) => e.kind === kind).length, tele: sim.enemies.filter((e) => e.kind === kind && !e.dead).map((e) => +(e.tele ?? 0).toFixed(2)), hero: [Math.round(h.x), Math.round(h.z)], sec: v.section };
}, [kind, o]);
const shot = async (page, name) => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${name}.png` }); };
try {
  if (want('soldier') || want('mage') || want('people') || want('fire')) {
    const page = await open('area=eshville_now');
    if (want('fire')) { await page.evaluate(() => { const g = window.__game, sc = window.__v2.scene, h = sc.sim.hero; g._pageHidden = true; h.x = 330; h.z = 170; h.dirX = 1; h.dirZ = 0.3; sc.cam.snap = true; for (let i = 0; i < 150; i++) g.tick(1 / 60); g.alpha = 1; g.render(); g.render(); }); await shot(page, 'fire'); info.fire = await page.evaluate(() => window.__v2.stats.anchors); }
    if (want('soldier')) { info.soldier = await fight(page, 'skeleton_soldier', { hit: true, tele: 0.4 }); await shot(page, 'soldier'); }
    if (want('mage')) { info.mage = await fight(page, 'skeleton_mage', { dx: 240, near: 420, tele: 0.55 }); await shot(page, 'mage'); }
    if (want('people')) {
      info.people = await page.evaluate(() => { const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, h = sim.hero; g._pageHidden = true; for (const e of sim.enemies) e.dead = true; const p = sc.people.byId('alberto'); h.x = p.x - 64; h.z = p.z - 30; h.y = p.y + 150; h.onGround = false; h.vx = h.vz = h.vy = 0; if (h.safe) { h.safe.x = h.x; h.safe.z = h.z; } h.dirX = 1; h.dirZ = 0.4; sc.cam.snap = true; for (let i = 0; i < 120; i++) g.tick(1 / 60); g.alpha = 1; g.render(); g.render(); return { prompt: v.prompt, people: v.people.filter((q) => q.drawn).map((q) => q.id + ':' + q.clip) }; });
      await shot(page, 'people_prompt');
      await page.evaluate(() => { const g = window.__game, v = window.__v2; v.use(); for (let i = 0; i < 8; i++) g.tick(1 / 60); g._pageHidden = false; });
      await page.waitForTimeout(2600);
      info.dialog = await page.evaluate(() => { const sc = window.__v2.scene; return { modal: sc.hud.modal, talking: sc.people.talking?.id ?? null }; });
      await shot(page, 'people_dialog');
    }
    info.errsNow = page._errs.slice(0, 3); await page.context().close();
  }
  if (want('corpse')) { const page = await open('area=eshville_past'); info.corpse = await fight(page, 'plague_corpse', { tele: 0.5, near: 240 }); await shot(page, 'corpse'); info.errsPast = page._errs.slice(0, 3); await page.context().close(); }
  if (want('bat') || want('elite') || want('ghost')) {
    const page = await open('area=graveyard_now');
    if (want('bat')) { info.bat = await fight(page, 'bat', { x: 600, z: 520, tele: 0.3, near: 260, ticks: 1200 }); await shot(page, 'bat'); }
    if (want('elite')) { info.elite = await fight(page, 'gravekeeper_armor', { dx: 170, tele: 0.5, near: 300, ticks: 1200 }); await shot(page, 'elite'); }
    if (want('ghost')) { info.ghost = await fight(page, 'grave_ghost', { x: 600, z: 1480, tele: 0.5, near: 300, ticks: 1500 }); await shot(page, 'ghost'); }
    info.errsGrave = page._errs.slice(0, 3); await page.context().close();
  }
  if (want('sharp')) {
    for (const [name, q] of [['sharp_after', 'area=eshville_now'], ['sharp_before', 'area=eshville_now&v2aa=0&v2res=0.5612']]) {
      const page = await open(q);
      info[name] = await page.evaluate(() => { const g = window.__game, v = window.__v2; g._pageHidden = true; for (let i = 0; i < 40; i++) g.tick(1 / 60); g.alpha = 1; g.render(); g.render(); return v.stats.res; });
      await shot(page, name); await page.context().close();
    }
  }
} finally { await browser.close(); srv.close(); }
fs.writeFileSync(`${OUT}/info.json`, JSON.stringify(info, null, 1));
console.log(JSON.stringify(info, null, 1));
