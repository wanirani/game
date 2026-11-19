// WHIP lane — shared page harness of tools/v2/whip_press.mjs and tools/v2/whip_feel.mjs (scene v2g, ?area=<id>, no story, one browser).
// The game is advanced by ticks (g.tick) and drawn on demand (g.render) - the headless page runs at a few frames a second, so nothing here
// judges timing in real time. Touches go through the pad's own pointer handlers (window PointerEvents on a button's centre).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

export const argsOf = (argv) => Object.fromEntries(argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));

export async function launch(out) {
  if (out) fs.mkdirSync(out, { recursive: true });
  const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });
  const errs = [];
  const page = async (dev = 'fold_open', extra = {}) => {   // extra: { serviceWorkers: 'block' } when a page.route must see the module requests (the app's service worker hides them from routes)
    const ctx = await browser.newContext(contextOptions(dev, extra)), p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
    return p;
  };
  const open = async (p, area, extra = '') => {
    await p.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2auto=0&v2story=0${extra}`, { waitUntil: 'commit', timeout: 120000 });   // 'commit': with a route in place the page's load event can take longer than the default wait
    await p.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 }).catch(() => {});
    const st = await p.evaluate(() => ({ ready: window.__v2?.ready, error: String(window.__v2?.error ?? '') }));
    if (!st.ready) throw new Error('scene not ready: ' + st.error);
    await p.evaluate(install);
  };
  const close = async () => { await browser.close(); srv.close?.(); };
  return { browser, page, open, close, errs, port };
}

/** in the page: window.__W = ticks, hero placement, pad taps, enemy placement */
export function install() {
  const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
  const W = (window.__W = { n: 0, keepHp: true, drawEvery: 6 });
  /** n rule ticks; each(i) after every tick. The picture is drawn every W.drawEvery ticks (the pad lets go of touches when the HUD is not drawn for a second) */
  W.tick = (n = 1, each = null) => { for (let i = 0; i < n; i++) { const h = sc.sim?.hero; if (h && W.keepHp) h.hp = h.hpMax ?? h.hp; g.tick(1 / 60); W.n++; if (W.drawEvery && W.n % W.drawEvery === 0) { g.alpha = 1; g.render(); } if (each) each(i); } };
  W.ground = (x, z) => { let gy = -Infinity; for (const b of sc.W.boxes) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 > gy && b.y1 < 2000) gy = b.y1; } return gy; };
  W.put = (x, z, dx = 1, dz = 0) => {
    const sim = sc.sim, h = sim.hero, gy = W.ground(x, z);
    h.x = x; h.z = z; if (Number.isFinite(gy)) h.y = gy; h.vx = 0; h.vz = 0; h.vy = 0; h.onGround = true; h.move = null; h.act = null; h.dashT = 0; h.hurtT = 0; h.ifr = 0; h.rollCd = 0; h.charging = false; h.charge = 0; h.atkHold = 0; h.guard = false; h.guardTap = 0; h.sweepWin = 0; h.combo = 0; h.dead = false;
    sim.dropPresses?.();
    const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; if (h.wishX !== undefined) { h.wishX = h.dirX; h.wishZ = h.dirZ; } if (sc.heroA) { sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ; }
    if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; if (sc.cam) sc.cam.snap = true; sc._whipReset = true;
  };
  /** an enemy of that kind (taken from the area, or added) set on a spot, awake or asleep, facing the hero */
  W.enemy = (kind, x, z, o = {}) => {
    const sim = sc.sim, h = sim.hero; let e = o.fresh ? null : sim.enemies.find((q) => q.kid === kind && !q.dead && q.state !== 'dead' && !q._used);
    if (!e) e = sim.addEnemy({ kind, x, z, active: false });
    const gy = W.ground(x, z); e._used = true; e.x = x; e.z = z; if (Number.isFinite(gy)) { e.gy = gy; e.y = gy + (e.hover ?? 0); } e._px = e.x; e._py = e.y; e._pz = e.z; e.homeX = x; e.homeZ = z;
    const dx = h.x - x, dz = h.z - z, l = Math.hypot(dx, dz) || 1; e.dirX = dx / l; e.dirZ = dz / l; e.hp = e.hpMax = o.hp ?? 99999; e.kx = e.kz = 0; e.stun = 0; e.stagger = 0; e.state = 'idle'; e.atk = null; e.phase = null; e.active = false; e.wakeBy = 'trigger'; e.solid = true; e.alpha = 1; e.revealT = 99999;
    if (o.awake) { e.wakeBy = null; sim.wake(e); e.cd = o.cd ?? 0.2; } else e.cd = 99999;
    return e;
  };
  /** every other enemy of the area: asleep and far away (they must not walk into a measurement) */
  W.clear = () => { for (const e of sc.sim.enemies) { if (e._used) continue; e.wakeBy = 'trigger'; e.active = false; e.state = 'idle'; e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e._px = e.x; e._pz = e.z; } };
  const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  W.btn = (id) => sc.hud.metrics().pad.buttons.find((q) => q.id === id);
  const FING = { attack: 31, roll: 32, jump: 33, skill: 34, bell: 35 };
  W.down = (id) => { const b = W.btn(id); fire('pointerdown', FING[id], b.cx, b.cy); };
  W.up = (id) => { const b = W.btn(id); fire('pointerup', FING[id], b.cx, b.cy); };
  /** the stick held in a direction (dx right, dz into the screen), 0,0 = let go */
  W.stick = (dx, dz) => { const s = sc.hud.metrics().pad.stick, x0 = s.cx ?? s.x, y0 = s.cy ?? s.y, R = 56; if (!dx && !dz) { if (W._st) { fire('pointerup', 30, x0, y0); W._st = false; } return; } if (!W._st) { fire('pointerdown', 30, x0, y0); W._st = true; } fire('pointermove', 30, x0 + dx * R, y0 - dz * R); };
  /** a straight of 300 px on one level with nothing solid in it, from the spot nearest to (x0, z0) that has one: across the screen first (+x, -x), into it only when
   *  there is none within 700 px. Returns { x, z, dx, dz } (the sweep's roll needs the room; an attack along +x from a start spot often ends in a wall or a grave) */
  W.straight = (x0, z0) => {
    const sim = sc.sim, y0 = W.ground(x0, z0);
    const free = (x, z, d) => { for (let r = 0; r <= 300; r += 30) { const gy = W.ground(x + d[0] * r, z + d[1] * r); if (!(Math.abs(gy - y0) < 3)) return false; } for (const sd of [-18, 0, 18]) if (sim.clearLine && !sim.clearLine(x - d[1] * sd, z + d[0] * sd, x + d[0] * 300 - d[1] * sd, z + d[1] * 300 + d[0] * sd, y0 + 40)) return false; return true; };
    for (const D of [[[1, 0], [-1, 0]], [[0.7071, 0.7071], [-0.7071, 0.7071], [0, 1], [0, -1]]]) for (let R = 0; R <= 700; R += 50) for (let k = 0; k < (R ? 12 : 1); k++) {
      const a = (k * Math.PI) / 6, x = x0 + Math.cos(a) * R, z = z0 + Math.sin(a) * R; if (!(Math.abs(W.ground(x, z) - y0) < 3)) continue;
      for (const d of D) if (free(x, z, d)) return { x, z, dx: d[0], dz: d[1] };
    }
    return { x: x0, z: z0, dx: 1, dz: 0 };
  };
  W.lost = () => sc.glr.gl.isContextLost();
  return { ready: v.ready, area: v.area };
}
