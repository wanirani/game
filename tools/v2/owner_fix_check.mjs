// Main-session check of the owner's three reports of 2026-11-18 (scene v2g, ?area=<id>, no story, Fold size, one browser):
//   1 + 3  "항아리를 깼는데 안 먹어져": a heal piece at full health and a mote at full resonance are taken and turn to silver; the mote reads as a crystal
//   2      "다 한 방향을 보고 있는 이유가 있어?": sleepers face their own ways, and an arena group wakes when the hero comes close from any side
//   also   three taps on the attack button chain the three hits, through the pad's own pointer handlers in game time
//   node tools/v2/owner_fix_check.mjs [--out /tmp/claude-0/v2/main/ownerfix] [--device fold_open] [--tier mid]
// The hero is put on spots by the tool (this is a check of rules and scene glue, not of touch - tools/v2/breakverify_touch.mjs --part touch does the
// honest-touch version of the pickup). Stills: <out>/square_asleep.png, square_awake.png, mote.png, heal.png. Exit 1 on any failed line or page error.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/main/ownerfix'), TIER = String(args.tier || 'mid');
fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; let fails = 0;
const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };

function install() {
  const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
  const F = (window.__F = { n: 0, keepHp: true });
  F.tick = (n = 1) => { for (let i = 0; i < n; i++) { const h = sc.sim?.hero; if (h && F.keepHp) h.hp = h.hpMax ?? h.hp; g.tick(1 / 60); F.n++; if (F.n % 6 === 0) g.render(); } g.render(); };
  F.put = (x, z, dx = 1, dz = 0) => {
    const sim = sc.sim, h = sim.hero, B = sc.W.boxes; let gy = -Infinity;
    for (const b of B) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 > gy && b.y1 < 2000) gy = b.y1; }
    h.x = x; h.z = z; if (Number.isFinite(gy)) h.y = gy; h.vx = 0; h.vz = 0; h.vy = 0; h.onGround = true; h.move = null; h.act = null; h.dashT = 0;
    const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; if (h.wishX !== undefined) { h.wishX = 0; h.wishZ = 0; } if (sc.heroA) { sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ; }
    if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; if (sc.cam) sc.cam.snap = true; sc._whipReset = true;
  };
  F.group = (g2) => sc.sim.enemies.filter((e) => e.group === g2).map((e) => ({ x: Math.round(e.x), z: Math.round(e.z), active: !!e.active, dead: !!e.dead, yard: !!e.yard, ang: Math.round(Math.atan2(e.dirZ, e.dirX) * 180 / Math.PI) }));
  F.sleepers = () => sc.sim.enemies.filter((e) => !e.active && !e.dead).map((e) => Math.round(Math.atan2(e.dirZ, e.dirX) * 180 / Math.PI));
  F.fired = () => [...sc.fired];
  F.lost = () => sc.glr.gl.isContextLost();
  return { ready: v.ready, area: v.area };
}
async function open(page, area) {
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2auto=0&v2tier=${TIER}&v2story=0`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 }).catch(() => {});
  const st = await page.evaluate(() => ({ ready: window.__v2?.ready, error: String(window.__v2?.error ?? '') }));
  if (!st.ready) throw new Error('scene not ready: ' + st.error);
  await page.evaluate(install);
}
const spread = (a) => { let m = 0; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { let d = Math.abs(a[i] - a[j]) % 360; if (d > 180) d = 360 - d; if (d > m) m = d; } return m; };

try {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });

  // ── 2: the 1697 square, reached from the church side (as after ringing the big bell) ──
  console.log('[the 1697 square, coming down from the church]');
  await open(page, 'eshville_past');
  await page.evaluate(() => { const F = window.__F; F.put(4200, 1390, 0, -1); F.tick(40); });
  let g = await page.evaluate(() => window.__F.group('sq_p'));
  ok('at the big bell: the three corpses of the square sleep', g.length === 3 && g.every((e) => !e.active), JSON.stringify(g));
  ok('they do not all look one way (largest angle between two of them)', spread(g.map((e) => e.ang)) >= 25, `angles ${g.map((e) => e.ang).join(' ')} · spread ${spread(g.map((e) => e.ang))}°`);
  const all = await page.evaluate(() => window.__F.sleepers());
  ok('all sleepers of the area: facings are spread', spread(all) >= 60 && new Set(all.map((a) => Math.round(a / 10))).size >= Math.min(5, all.length), `${all.length} sleepers · angles ${all.join(' ')}`);
  await page.evaluate(() => { const F = window.__F; F.put(3900, 860, 0, -1); F.tick(60); });
  g = await page.evaluate(() => window.__F.group('sq_p'));
  ok('at the foot of the church steps (300+ px from each): still asleep', g.every((e) => !e.active), JSON.stringify(g.map((e) => e.active)));
  await page.screenshot({ path: `${OUT}/square_asleep.png` });
  await page.evaluate(() => { const F = window.__F; F.put(3900, 640, 0, -1); F.tick(40); });
  g = await page.evaluate(() => window.__F.group('sq_p'));
  let fired = await page.evaluate(() => window.__F.fired());
  ok('160 px from the nearest corpse: the whole group wakes and the square trigger has gone off', g.every((e) => e.active) && fired.includes('square_enter'), JSON.stringify({ active: g.map((e) => e.active), fired }));
  await page.evaluate(() => window.__F.tick(50));
  await page.screenshot({ path: `${OUT}/square_awake.png` });
  ok('no WebGL context lost', !(await page.evaluate(() => window.__F.lost())));

  // ── 2: the grave field tonight, reached behind the trigger line (as after a crossing at Edmund's grave) ──
  console.log('[the grave field tonight, arriving behind the trigger line]');
  await open(page, 'graveyard_now');
  await page.evaluate(() => { const F = window.__F; F.put(600, 300, 0, 1); F.tick(30); });
  let gh = await page.evaluate(() => window.__F.group('ghosts'));
  ok('on the road: the ghosts of the field sleep', gh.length >= 2 && gh.every((e) => !e.active), JSON.stringify(gh));
  await page.evaluate(() => { const F = window.__F; F.put(600, 1590, 0, 1); F.tick(40); });
  gh = await page.evaluate(() => window.__F.group('ghosts')); fired = await page.evaluate(() => window.__F.fired());
  ok('put down in the field 110 px from a ghost (north of the trigger line): the group wakes, the trigger has gone off', gh.every((e) => e.active) && fired.includes('echo_hint'), JSON.stringify({ active: gh.map((e) => e.active), fired }));

  // ── 1 + 3: pieces at a full gauge ──
  console.log('[a heal piece at full health, a mote at full resonance]');
  await open(page, 'belltower_now');
  const r = await page.evaluate(async () => {
    const { spawnPickup, PICK } = await import('/src/v2/play/breakables.js');
    const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero, out = { spare: PICK.spare };
    F.tick(20); h.hp = h.hpMax; h.reso = h.resoMax; out.c0 = sc.brk.coins;
    spawnPickup(sim, 2, h.x + 40, h.y + 30, h.z, 0, 200, 0, h.y); F.tick(120);
    out.afterMote = { coins: sc.brk.coins, live: sim.pickups.filter((p) => p.on).length, reso: h.reso, resoMax: h.resoMax, hud: sc.state.coins };
    spawnPickup(sim, 1, h.x + 40, h.y + 30, h.z, 0, 200, 0, h.y); F.tick(120);
    out.afterHeal = { coins: sc.brk.coins, live: sim.pickups.filter((p) => p.on).length, hp: h.hp, hpMax: h.hpMax, hud: sc.state.coins };
    F.keepHp = false; h.hp = h.hpMax - 30; h.reso = 0; const c1 = sc.brk.coins;
    spawnPickup(sim, 1, h.x + 40, h.y + 30, h.z, 0, 200, 0, h.y); spawnPickup(sim, 2, h.x - 40, h.y + 30, h.z, 0, 200, 0, h.y); F.tick(140);
    out.hurt = { coins: sc.brk.coins - c1, live: sim.pickups.filter((p) => p.on).length, hp: h.hp, hpMax: h.hpMax, reso: +h.reso.toFixed(2), heal: PICK.heal, resoStep: PICK.reso };
    F.keepHp = true;
    // two pieces resting out of reach, for the look
    spawnPickup(sim, 2, h.x + 150, h.y + 30, h.z + 10, 0, 200, 0, h.y); spawnPickup(sim, 1, h.x + 190, h.y + 30, h.z - 20, 0, 200, 0, h.y); spawnPickup(sim, 0, h.x + 170, h.y + 30, h.z + 40, 0, 200, 0, h.y); F.tick(70);
    out.resting = sim.pickups.filter((p) => p.on).map((p) => ({ what: p.what, rest: p.rest }));
    return out;
  });
  ok('full resonance: the mote is taken and turns to silver', r.afterMote.live === 0 && r.afterMote.coins === r.c0 + r.spare && r.afterMote.hud === r.afterMote.coins && r.afterMote.reso === r.afterMote.resoMax, JSON.stringify(r.afterMote));
  ok('full health: the heal piece is taken and turns to silver', r.afterHeal.live === 0 && r.afterHeal.coins === r.c0 + 2 * r.spare && r.afterHeal.hud === r.afterHeal.coins && r.afterHeal.hp === r.afterHeal.hpMax, JSON.stringify(r.afterHeal));
  ok('hurt and empty: the same pieces heal and fill, and give no silver', r.hurt.live === 0 && r.hurt.coins === 0 && r.hurt.hp === r.hurt.hpMax - 30 + r.hurt.heal && Math.abs(r.hurt.reso - r.hurt.resoStep) < 0.02, JSON.stringify(r.hurt));
  ok('three pieces rest out of reach for the still', r.resting.length === 3, JSON.stringify(r.resting));
  await page.screenshot({ path: `${OUT}/pieces.png` });
  for (let k = 0; k < 3; k++) { await page.evaluate(() => window.__F.tick(9)); await page.screenshot({ path: `${OUT}/pieces_${k}.png` }); }
  ok('no WebGL context lost', !(await page.evaluate(() => window.__F.lost())));

  // ── the combo through the pad's own pointer handlers, in game time (the real-time touch test cannot tell on this slow machine: it taps every
  //    quarter second while the game crawls at a few frames a second) ──
  console.log('[three taps on the attack button]');
  const combo = await page.evaluate(() => {
    const sc = window.__v2.scene, F = window.__F, h = sc.sim.hero, bt = sc.hud.metrics().pad.buttons.find((q) => q.id === 'attack');
    const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
    const seen = [], note = () => { const id = h.move?.id ?? null; if (id && seen[seen.length - 1] !== id) seen.push(id); };
    const tap = (gap) => { fire('pointerdown', 21, bt.cx, bt.cy); F.tick(3); note(); fire('pointerup', 21, bt.cx, bt.cy); for (let i = 0; i < gap; i++) { F.tick(1); note(); } };
    const out = {};
    for (const gap of [8, 12, 16]) { F.put(360, 80, 1, 0); F.tick(40); seen.length = 0; tap(gap); tap(gap); tap(gap); for (let i = 0; i < 70; i++) { F.tick(1); note(); } out['every ' + (gap + 3) + ' ticks'] = seen.join(' > '); }
    return out;
  });
  ok('three taps chain the first, second and third hit (taps 11, 15 and 19 ticks apart)', Object.values(combo).every((q) => q.startsWith('c1 > c2 > c3')), JSON.stringify(combo));
  await ctx.close();
} catch (e) { errs.push('[tool] ' + (e?.stack ?? e)); }
await browser.close(); srv.close?.();
for (const e of errs) console.log('ERR ' + e);
console.log(fails || errs.length ? `FAILED: ${fails} line(s), ${errs.length} error(s)` : 'ALL OK');
process.exit(fails || errs.length ? 1 : 0);
