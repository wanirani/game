// v2g staged captures (INTEGRATE-B1): drive the real scene with forced rule inputs and save stills / strips of named moments —
// the whip in every move and facing, in hit-stop, on a whip ring, ringing the bell; the boss hall; the tower climb.
//   node tools/v2/game_shot.mjs --plan street|facings|moves|ring|bell|boss|tower|past [--area eshville_now] [--device fold_open] [--out /tmp/claude-0/v2/integB1]
// One browser, one page per run. Every picture is checked for a lost WebGL context before it is written (software WebGL on a busy machine).
// Prints one JSON line per picture: what the rules and the whip said at that moment (mode, move, tip distance to the hit point ...).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/integB1'), PLAN = String(args.plan || 'street');
const AREA = String(args.area || ({ ring: 'graveyard_now', boss: 'ossuary_now', tower: 'belltower_now', past: 'eshville_past' }[PLAN] ?? 'eshville_now'));
fs.mkdirSync(OUT, { recursive: true });
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; let code = 0;

/** in the page: forced inputs at sim.update, tick / wait helpers, placing the hero */
function install() {
  const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
  const F = (window.__F = { hold: {}, once: {}, god: true, n: 0, hitAt: -1, hitP: null, ev: {} });
  F.hook = () => {
    const sim = sc.sim; if (!sim || sim.__f) return; sim.__f = true;
    const u0 = sim.update.bind(sim); sim.update = (dt, inp) => { if (inp) { for (const k in F.hold) inp[k] = F.hold[k]; for (const k in F.once) inp[k] = F.once[k]; F.once = {}; } return u0(dt, inp); };
    const H = sim.hooks, h0 = H.hit, e0 = H.event; H.hit = function (e, dmg, mv, x, y, z) { F.hitAt = F.n; F.hitP = [x, y, z]; F.hits = (F.hits || 0) + 1; return h0.apply(this, arguments); };
    H.event = function (name) { F.ev[name] = (F.ev[name] || 0) + 1; return e0.apply(this, arguments); };
  };
  F.tick = (n = 1) => { for (let i = 0; i < n; i++) { F.hook(); const h = sc.sim?.hero; if (F.god && h && h.hp < (h.hpMax ?? 100) * 0.7) h.hp = h.hpMax ?? 100; g.tick(1 / 60); F.n++; if (F.n % 8 === 0) g.render(); } };   // (a drawn frame now and then: what is on screen decides which enemies are animated)
  F.until = (fn, max) => { for (let k = 0; k < max; k++) { F.tick(1); if (fn()) return k; } return -1; };
  F.frozen = () => !!sc.fx && sc.fx.feel.stop > 0;
  F.put = (x, z, dx = 1, dz = 0, y) => {
    const sim = sc.sim, h = sim.hero, B = sc.W.boxes; let gy = -Infinity; const top = y != null ? y + 40 : Infinity;
    for (const b of B) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 <= top && b.y1 > gy) gy = b.y1; }
    h.x = x; h.z = z; if (Number.isFinite(gy)) h.y = gy; h.vx = 0; h.vz = 0; h.vy = 0; h.onGround = true; h.move = null; h.act = null; h.dashT = 0;
    const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; if (h.wishX !== undefined) { h.wishX = 0; h.wishZ = 0; } sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ;
    if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; sc.cam.snap = true; sc._whipReset = true;
  };
  F.near = (pred) => { const h = sc.sim.hero; let best = null, bd = 1e9; for (const e of sc.sim.enemies) { if (e.dead || e.state === 'dead' || (pred && !pred(e))) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd) { bd = d; best = e; } } return best; };
  /** stand `d` px from enemy e on the side (sx, sz), facing it; the enemy is held still and asleep-proof (hp kept) */
  F.face = (e, d, sx, sz) => { F.put(e.x + sx * d, e.z + sz * d, -sx, -sz, e.gy ?? e.y); };
  F.info = () => {
    const h = sc.sim.hero, w = sc.whip, p = v.project(h.x, h.y + 55, h.z), r = g.canvas.getBoundingClientRect(), tip = w ? w.tip : null;
    const tp = tip ? v.project(tip.x, tip.y, tip.z) : null, hand = sc.whipHand, hp = v.project(hand.x, hand.y, hand.z);
    const css = (q) => (q ? [Math.round(r.left + q.x / g.viewW * r.width), Math.round(r.top + q.y / g.viewH * r.height)] : null);
    return { n: F.n, mode: w?.mode ?? null, move: h.move?.id ?? null, moveT: h.move ? +h.moveT.toFixed(3) : null, act: h.act ?? null, anim: h.anim, frozen: F.frozen(), ext: w ? +w.ext.toFixed(2) : null, len: w ? Math.round(w.len) : null,
      tipToHit: F.hitP && tip && F.hitAt >= F.n - 8 ? +Math.hypot(tip.x - F.hitP[0], tip.y - F.hitP[1], tip.z - F.hitP[2]).toFixed(1) : null, hits: F.hits || 0,
      rootToHand: w ? +Math.hypot(w.root.x - hand.x, w.root.y - hand.y, w.root.z - hand.z).toFixed(1) : null,
      heroCss: css(p), tipCss: css(tp), handCss: css(hp), lost: sc.glr.gl.isContextLost(), whipStats: sc.wr ? { ...sc.wr.stats } : null, weapons: v.stats.chars?.weapons ?? null, area: v.area, boss: sc.state.boss ? { ...sc.state.boss } : null, hero: [Math.round(h.x), Math.round(h.y), Math.round(h.z)], reso: h.reso ?? null };
  };
  return { ready: v.ready, area: v.area, tier: sc.perf.tier, whip: !!sc.whip, wr: !!sc.wr };
}

try {
  const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${AREA}&v2auto=0${args.q ? '&' + args.q : ''}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 }).catch(() => {});
  const st = await page.evaluate(() => ({ ready: window.__v2?.ready, error: String(window.__v2?.error ?? '') }));
  if (!st.ready) throw new Error('scene v2g is not ready: ' + st.error);
  console.log('open:', JSON.stringify(await page.evaluate(install)));
  const vp = page.viewportSize();
  /** save a picture: full frame, or a crop of w x h CSS px around the hero (or the point `at` = 'tip' | 'hand') */
  const shot = async (name, crop, at) => {
    const i = await page.evaluate(() => { window.__game.alpha = 1; window.__game.render(); return window.__F.info(); });   // alpha 1: the picture is the tick the numbers describe (a real frame lies between two ticks)
    if (i.lost) { errs.push('[context lost] ' + name); code = 1; return i; }
    const f = `${OUT}/${PLAN}_${DEV}_${name}.png`; let clip;
    if (crop) { const c = (at === 'tip' ? i.tipCss : at === 'hand' ? i.handCss : i.heroCss) ?? i.heroCss ?? [vp.width / 2, vp.height / 2]; const w = Math.min(crop[0], vp.width), h = Math.min(crop[1], vp.height); clip = { x: Math.max(0, Math.min(vp.width - w, c[0] - w / 2 + (crop[2] ?? 0))), y: Math.max(0, Math.min(vp.height - h, c[1] - h / 2 + (crop[3] ?? 0))), width: w, height: h }; }
    await page.screenshot({ path: f, ...(clip ? { clip } : {}) });
    console.log(JSON.stringify({ shot: name, file: f, mode: i.mode, move: i.move, moveT: i.moveT, act: i.act, anim: i.anim, frozen: i.frozen, ext: i.ext, len: i.len, tipToHit: i.tipToHit, rootToHand: i.rootToHand, hits: i.hits, hero: i.hero, boss: i.boss, weapons: i.weapons }));
    return i;
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const CROP = [460, 330, 0, -30];
  if (PLAN === 'ring' || PLAN === 'bell' || PLAN === 'facings' || PLAN === 'moves') await ev(() => { const F = window.__F, sc = window.__v2.scene; for (const e of sc.sim.enemies) { e.active = false; e.sight = 0; } F.tick(420); });   // let the area title fade first
  /** stand next to the nearest enemy on a side and strike until the hit-stop frame; -> pictures name_hit (frozen) */
  const strike = async (name, sx, sz, presses = 1, d = 84) => {
    const ok = await ev(([sx, sz, d]) => { const F = window.__F, sc = window.__v2.scene; F.hook(); const e = F.near((q) => !q.fled && q.kind !== 'bat'); if (!e) return 'no enemy'; F.tgt = e; e.active = true; F.face(e, d, sx, sz); F.tick(2); return e.kind; }, [sx, sz, d]);
    if (ok === 'no enemy') { console.log(name + ': no enemy to strike'); return; }
    for (let p = 0; p < presses; p++) {
      const k = await ev(() => { const F = window.__F, sc = window.__v2.scene, n0 = F.hitAt; F.once.attack = true; const k = F.until(() => F.hitAt > n0 && F.frozen(), 70); return k; });
      await shot(`${name}_${p + 1}${k < 0 ? '_nohit' : ''}`, CROP);
      if (p === 0 && name === 'hit_right' && k >= 0) await shot('fight_full');   // the whole screen on a hit-stop frame: the fight with the interface around it
      await ev(() => { const F = window.__F, e = F.tgt; if (e && e.hp < e.hpMax * 0.5 && !e.dead && e.state !== 'dead') e.hp = e.hpMax; F.until(() => !F.frozen(), 30); F.tick(6); });
    }
    await ev(() => { window.__F.tick(50); });
  };
  /** a move in the air (no enemy needed): pictures every `step` ticks from the press */
  const swingStrip = async (name, pre, frames, step = 3) => {
    await ev(pre);
    for (let i = 0; i < frames; i++) { await ev((s) => window.__F.tick(s), step); await shot(`${name}_f${i}`, CROP); }
    await ev(() => window.__F.tick(50));
  };

  if (PLAN === 'street' || PLAN === 'past') {
    await ev(() => window.__F.tick(30));
    await shot('0_idle_full');
    await shot('0_idle', CROP);
    await strike('hit_right', -1, 0, 3);          // hero left of the enemy, facing right: c1 c2 c3
    await strike('hit_left', 1, 0, 2);            // facing left
    await strike('hit_away', 0, -1, 2);           // facing into the screen (+z)
    await strike('hit_toward', 0, 1, 2);          // facing the camera (-z)
    await shot('1_after_full');
  }
  if (PLAN === 'moves') {
    await ev(() => { const F = window.__F, sc = window.__v2.scene, h = sc.sim.hero; for (const e of sc.sim.enemies) { e.active = false; e.x += 4000; } F.tick(20); });   // nobody near: the lash in the air
    for (const [nm, dx, dz] of [['r', 1, 0], ['l', -1, 0], ['away', 0, 1], ['toward', 0, -1]]) {
      await swingStrip(`c1_${nm}`, ([dx, dz]) => { const F = window.__F, h = window.__v2.scene.sim.hero; F.put(h.x, h.z, dx, dz, h.y); F.tick(20); F.once.attack = true; F.tick(1); }, 6, 3).catch(() => {});
    }
  }
  if (PLAN === 'facings') {
    // every move, in the air, facing right; then the charged whip, the plunge, the sweep after a roll
    await ev(() => { const F = window.__F, sc = window.__v2.scene; for (const e of sc.sim.enemies) { e.active = false; e.x += 6000; } F.tick(20); });
    const dirs = [['r', 1, 0], ['l', -1, 0], ['away', 0, 1], ['toward', 0, -1]];
    for (const [nm, dx, dz] of dirs) {
      await ev(([dx, dz]) => { const F = window.__F, h = window.__v2.scene.sim.hero; F.put(h.x, h.z, dx, dz, h.y); F.tick(25); }, [dx, dz]);
      await shot(`rest_${nm}`, CROP);
      for (const id of ['c1', 'c2', 'c3']) {
        const k = await ev((id) => { const F = window.__F, h = window.__v2.scene.sim.hero; let k = -1; for (let i = 0; i < 90 && k < 0; i++) { if (i % 8 === 0) F.once.attack = true; F.tick(1); if (h.move && h.move.id === id && h.moveT >= h.move.hit[0] + 0.02) k = i; } return k; }, id);
        await shot(`${id}_${nm}${k < 0 ? '_missed' : ''}`, CROP);
        if (id === 'c1' && nm === 'r') { for (let i = 1; i <= 4; i++) { await ev(() => window.__F.tick(3)); await shot(`c1_r_plus${i * 3}`, CROP); } }
      }
      await ev(() => window.__F.tick(70));
    }
    // charged whip: hold, spin, release
    await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.put(h.x, h.z, 1, 0, h.y); F.tick(20); F.once.attack = true; F.hold.attackHeld = true; F.until(() => h.charge > 0.5, 120); });
    await shot('charge_spin', CROP);
    await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.until(() => h.charge >= 1, 120); delete F.hold.attackHeld; F.hold.attackHeld = false; F.until(() => h.move && h.move.id === 'whip' && h.moveT >= h.move.hit[0] + 0.02, 60); });
    await shot('charge_release', [640, 330, 120, -30]);
    await ev(() => { window.__F.tick(4); }); await shot('charge_release_plus4', [640, 330, 120, -30]);
    await ev(() => { const F = window.__F; F.hold = {}; F.tick(60); });
    // plunge
    await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.once.jump = true; F.hold.jumpHeld = true; F.tick(14); F.once.attack = true; F.until(() => h.move && h.move.id === 'plunge', 20); F.tick(3); });
    await shot('plunge_air', CROP);
    await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.hold = {}; F.until(() => h.onGround, 60); F.tick(2); });
    await shot('plunge_land', CROP);
    await ev(() => window.__F.tick(60));
    // sweep right after a roll
    await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.hold.mx = 1; F.once.dash = true; F.tick(1); F.until(() => !(h.dashT > 0), 60); F.once.attack = true; F.until(() => h.move && h.moveT >= h.move.hit[0] + 0.02, 30); F.hold = {}; });
    await shot('sweep_after_roll', CROP);
    await ev(() => window.__F.tick(60));
  }
  if (PLAN === 'dbg') {   // numbers behind one picture: the third hit facing away from the camera
    await ev(() => { const F = window.__F, sc = window.__v2.scene; for (const e of sc.sim.enemies) { e.active = false; e.sight = 0; e.x += 6000; } F.tick(60); const h = sc.sim.hero; F.put(h.x, h.z, 0, 1, h.y); F.tick(25); });
    for (const id of ['c1', 'c2', 'c3']) {
      const r = await ev((id) => { const F = window.__F, sc = window.__v2.scene, h = sc.sim.hero, w = sc.whip; let k = -1; for (let i = 0; i < 90 && k < 0; i++) { if (i % 8 === 0) F.once.attack = true; F.tick(1); if (h.move && h.move.id === id && h.moveT >= h.move.hit[0] + 0.02) k = i; }
        const N = []; for (let i = 0; i < w.n; i++) N.push([Math.round(w.nodes[i * 3] - h.x), Math.round(w.nodes[i * 3 + 1] - h.y), Math.round(w.nodes[i * 3 + 2] - h.z)]);
        const H = sc.whipHand; return { id, k, dir: [+h.dirX.toFixed(2), +h.dirZ.toFixed(2)], face: [+sc.heroA.dx.toFixed(2), +sc.heroA.dz.toFixed(2)], hand: [Math.round(H.x - h.x), Math.round(H.y - h.y), Math.round(H.z - h.z)], handDir: [+H.dx.toFixed(2), +H.dy.toFixed(2), +H.dz.toFixed(2)], tip: [Math.round(w.tip.x - h.x), Math.round(w.tip.y - h.y), Math.round(w.tip.z - h.z)], nodes: N, cam: [Math.round(sc.cam.px - h.x), Math.round(sc.cam.py - h.y), Math.round(sc.cam.pz - h.z)] }; }, id);
      console.log(JSON.stringify(r));
      await shot(`${id}_away`, CROP);
    }
  }
  if (PLAN === 'exits') {   // the new areas through their exits: find the area flag that opens the exit, set it (the area is rebuilt), walk in
    for (const [from, exit] of String(args.exits || 'eshville_now:to_belltower,graveyard_now:to_ossuary').split(',').map((q) => q.split(':'))) {
      const r = await page.evaluate(async ([from, exit]) => {
        const v = window.__v2, sc = v.scene, g = window.__game, F = window.__F, A = await import('/src/v2/game/area.js');
        const wait = async (fn, max) => { for (let i = 0; i < max; i++) { F.tick(4); await new Promise((r) => setTimeout(r, 15)); if (fn()) return i; } return -1; };
        if (v.area !== from) { await sc.gotoArea(from, null); F.tick(10); }
        const x0 = sc.area.exits.find((q) => q.id === exit); if (!x0) return { from, exit, error: 'no such exit', exits: sc.area.exits.map((q) => q.id) };
        const before = x0.locked ?? null, fl = before ? await A.flagsThatOpen(from, sc.worldFlags, exit) : {};
        if (before && !fl) return { from, exit, locked: before, error: 'no area flag opens it' };
        if (before) { sc.setWorldFlags(fl); await wait(() => v.ready && !sc._go && sc.fadeA < 0.05, 400); }
        const x = sc.area.exits.find((q) => q.id === exit), h = sc.sim.hero;
        for (const e of sc.sim.enemies) { e.active = false; e.sight = 0; }
        h.x = (x.x0 + x.x1) / 2; h.z = (x.z0 + x.z1) / 2; { let gy = -Infinity; for (const b of sc.W.boxes) { if (h.x < b.x0 || h.x > b.x1 || h.z < b.z0 || h.z > b.z1 || !b.walk) continue; if (b.y1 > gy) gy = b.y1; } if (Number.isFinite(gy)) h.y = gy; } sc.cam.snap = true;
        const k = await wait(() => v.ready && v.area !== from && !sc._go && sc.fadeA < 0.05, 600);
        return { from, exit, lockedBefore: before, flag: fl, lockedAfter: x.locked ?? null, to: x.to, arrived: v.area, waited: k, hero: [Math.round(sc.sim.hero.x), Math.round(sc.sim.hero.y), Math.round(sc.sim.hero.z)], kinds: [...new Set(sc.sim.enemies.map((e) => e.kind))], models: v.stats.chars.models, flags: { ...sc.worldFlags } };
      }, [from, exit]);
      console.log('exit:', JSON.stringify(r));
      await ev(() => window.__F.tick(60));
      await shot(`${from}_${exit}_arrived_full`);
    }
  }
  if (PLAN === 'ring') {
    const r = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero, P = (sim.hookPoints ?? sc.W.hookPoints ?? [])[0]; if (!P) return null; for (const e of sim.enemies) { e.active = false; e.x += 6000; } F.put(P.x - 40, P.z - 150, 0, 1, P.y - 200); F.tick(30); return { P: { id: P.id, x: P.x, y: P.y, z: P.z, h: P.h, to: P.to }, hookId: h.hookId, hero: [h.x, h.y, h.z] }; });
    console.log('ring:', JSON.stringify(r));
    await shot('0_before_full');
    const k = await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.once.skill = true; const a = F.until(() => h.act === 'hook', 20); F.tick(3); return a; });
    await shot(`1_throw${k < 0 ? '_NOHOOK' : ''}`, [520, 520, 0, -120]);
    await ev(() => { const F = window.__F, sc = window.__v2.scene; F.until(() => sc.whip.mode === 'hook' && sc.whip.taut > 0.8, 40); F.tick(1); });
    await shot('2_latched', [520, 520, 0, -120]);
    await ev(() => { window.__F.tick(8); });
    await shot('3_flight', [520, 520, 0, -120]);
    await shot('3_flight_full');
    await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.until(() => h.act !== 'hook', 120); F.tick(20); });
    await shot('4_landed_full');
    console.log('ring events:', JSON.stringify(await ev(() => window.__F.ev)));
  }
  if (PLAN === 'bell') {
    await ev(() => { const F = window.__F, sc = window.__v2.scene, h = sc.sim.hero; for (const e of sc.sim.enemies) { e.active = false; e.x += 6000; } F.put(h.x, h.z, 1, 0, h.y); h.reso = h.resoMax ?? 3; F.tick(25); });
    const k = await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.once.bell = true; F.hold.bellHeld = false; const a = F.until(() => h.act === 'echo', 30); F.tick(6); return a; });
    await shot(`echo_1${k < 0 ? '_NOECHO' : ''}`, CROP);
    await ev(() => window.__F.tick(6)); await shot('echo_2', CROP);
    await ev(() => window.__F.tick(8)); await shot('echo_3_full');
    await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero; F.tick(120); h.bellCd = 0; h.reso = h.resoMax ?? 3; F.once.bell = true; F.hold.bellHeld = true; F.until(() => h.act === 'ring' && h.bellCharge > 0.5, 200); });
    await shot('long_1_charging', CROP);
    await ev(() => { const F = window.__F, h = window.__v2.scene.sim.hero, sc = window.__v2.scene; F.until(() => h.actDone || h.act !== 'ring', 240); F.tick(4); });
    await shot('long_2_full', CROP);
    await ev(() => window.__F.tick(8)); await shot('long_3_full');
    console.log('bell events:', JSON.stringify(await ev(() => window.__F.ev)));
    await ev(() => { const F = window.__F; F.hold = {}; F.tick(40); });
  }
  if (PLAN === 'boss') {
    const b = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim; F.hook(); const q = sim.enemies.find((e) => e.kind === 'banshee_queen'); if (!q) return null; F.put(q.x, q.z - 420, 0, 1, q.gy ?? q.y); sim.wake?.(q); q.active = true; F.tick(40); return { x: q.x, z: q.z, hp: q.hp, drawn: !!q._a3?.vis, clip: q._a3?.anim.cur?.name ?? null, state: sc.state.boss ? { ...sc.state.boss } : null, models: window.__v2.stats.chars.models }; });
    console.log('boss:', JSON.stringify(b));
    if (b) {
      await shot('0_hall_full');
      for (const id of ['wail', 'sweep', 'scream']) {
        const k = await ev((id) => { const F = window.__F, sc = window.__v2.scene, q = sc.sim.enemies.find((e) => e.kind === 'banshee_queen'), h = sc.sim.hero; F.put(q.x + (id === 'wail' ? 0 : 30), q.z - (id === 'wail' ? 380 : 150), 0, 1, q.gy ?? q.y); return F.until(() => q.atk && q.atk.id === id && q.tele > 0.55, 900); }, id);
        await shot(`warn_${id}${k < 0 ? '_NOTSEEN' : ''}_full`);
      }
      // fight: stand next to her and strike; then the kneel and the long ring
      await strike('hit', 0, -1, 3, 90);
      await shot('1_fight_full');
      const kn = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, q = sim.enemies.find((e) => e.kind === 'banshee_queen'), h = sim.hero; q.hp = Math.max(1, q.hpMax * 0.045); q.bphase = 2; F.face(q, 90, 0, -1); let k = -1; for (let i = 0; i < 400 && k < 0; i++) { if (i % 9 === 0) F.once.attack = true; F.tick(1); if (q.kneel) k = i; if (Math.hypot(q.x - h.x, q.z - h.z) > 120 && !h.move) F.face(q, 90, 0, -1); } F.tick(30); return { k, kneel: !!q.kneel, knellId: h.knellId ?? null, boss: sc.state.boss ? { ...sc.state.boss } : null }; });
      console.log('kneel:', JSON.stringify(kn));
      await shot('2_kneel_full');
      const sent = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, q = sim.enemies.find((e) => e.kind === 'banshee_queen'), h = sim.hero; F.face(q, 120, 0, -1); F.tick(10); h.bellCd = 0; F.once.bell = true; F.hold.bellHeld = true; const a = F.until(() => h.act === 'ring' && h.bellCharge > 0.6, 240); return { a, act: h.act, charge: h.bellCharge }; });
      console.log('knell start:', JSON.stringify(sent));
      await shot('3_knell_charging_full');
      const end = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, q = sim.enemies.find((e) => e.kind === 'banshee_queen'), h = sim.hero; const a = F.until(() => (F.ev.knell || 0) > 0 || (F.ev.bossDown || 0) > 0, 400); F.tick(20); return { a, ev: F.ev, dead: q.dead, state: q.state, done: sim.done, boss: sc.state.boss ? { ...sc.state.boss } : null }; });
      console.log('knell end:', JSON.stringify(end));
      await shot('4_knell_full');
      await ev(() => { const F = window.__F; F.hold = {}; F.tick(150); });
      await shot('5_after_full');
    }
  }
  if (PLAN === 'tower') {
    const t = await ev(() => { const sc = window.__v2.scene, W = sc.W; return { sections: W.sections.map((s) => ({ id: s.id, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, y0: s.y0 ?? null, y1: s.y1 ?? null, cam: s.cam })), spawns: sc.area.spawns, enemies: sc.sim.enemies.map((e) => [e.kind, Math.round(e.x), Math.round(e.y), Math.round(e.z)]), hooks: sc.sim.hookPoints ?? W.hookPoints ?? null, hero: [sc.sim.hero.x, sc.sim.hero.y, sc.sim.hero.z] }; });
    console.log('tower:', JSON.stringify(t).slice(0, 3000));
    await ev(() => window.__F.tick(30));
    await shot('0_entry_full');
    // the floors: walkable tops by height; stand on the bats' floor, fight them, then the top, then step off an edge and land below
    const fl = await ev(() => { const sc = window.__v2.scene, m = {}; for (const b of sc.W.boxes) if (b.walk) m[Math.round(b.y1)] = (m[Math.round(b.y1)] || 0) + 1; return m; });
    console.log('walkable tops by height:', JSON.stringify(fl));
    const mid = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero, bt = sim.enemies.find((e) => e.kind === 'bat'); F.put(bt.x, bt.z - 110, 0, 1, 272); F.tick(40); for (const e of sim.enemies) if (Math.abs(e.y - bt.y) < 60) { sim.wake?.(e); e.active = true; } F.tick(50); return { hero: [h.x, h.y, h.z], camY: Math.round(sc.cam.ty), sec: window.__v2.section, bats: sim.enemies.filter((e) => e.active).map((e) => [e.kind, Math.round(e.x), Math.round(e.y), Math.round(e.z), e.state, !!e._a3?.vis, e._a3?.anim.cur?.name ?? null]) }; });
    console.log('mid floor:', JSON.stringify(mid));
    await shot('1_mid_bats_full');
    const fight = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero; const n0 = F.hits || 0; let froze = -1; for (let i = 0; i < 600 && froze < 0; i++) { const e = F.near((q) => q.active && Math.abs(q.gy - h.y) < 80); if (!e) break; const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz) || 1; F.hold.mx = d > 70 ? dx / d : 0; F.hold.mz = d > 70 ? dz / d : 0; if (d < 110 && i % 7 === 0) F.once.attack = true; F.tick(1); if ((F.hits || 0) > n0 && F.frozen()) froze = i; } F.hold = {}; return { froze, hits: (F.hits || 0) - n0, hp: h.hp, kinds: sim.enemies.filter((e) => !e.dead && e.state !== 'dead').length }; });
    console.log('bat fight:', JSON.stringify(fight));
    await shot('2_bat_hit', CROP);
    await shot('2_bat_hit_full');
    const top = await ev(() => { const F = window.__F, sc = window.__v2.scene, h = sc.sim.hero, sp = sc.area.spawns.top; F.hold = {}; F.put(sp.x, sp.z, 0, 1, 680); F.tick(60); return { hero: [h.x, h.y, h.z], camY: Math.round(sc.cam.ty), sec: window.__v2.section }; });
    console.log('top:', JSON.stringify(top));
    await shot('3_top_full');
    const fall = await ev(() => {
      const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero, W = sc.W; F.god = false;
      const gAt = (x, z, top) => { let g = -Infinity; for (const b of W.boxes) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 <= top && b.y1 > g) g = b.y1; } return g; };
      const out = [];
      for (const y0 of [272, 680]) {   // from each upper floor: the nearest spot whose ground is at least 120 lower (an edge / the stair well)
        let best = null; for (let x = 60; x <= 660; x += 20) for (let z = 60; z <= 1300; z += 20) { const g = gAt(x, z, y0 + 40); if (g > y0 - 20 && g < y0 + 20) { for (const [ox, oz] of [[40, 0], [-40, 0], [0, 40], [0, -40]]) { const g2 = gAt(x + ox, z + oz, y0 + 40); if (!(g2 > y0 - 120) ) { best = best ?? { x, z, ox, oz, g2: Number.isFinite(g2) ? g2 : null }; } } } }
        if (!best) { out.push({ from: y0, edge: null }); continue; }
        F.put(best.x, best.z, best.ox / 40, best.oz / 40, y0); F.tick(10); const hp0 = h.hp, d0 = sim.deaths ?? 0; F.hold.mx = best.ox / 40; F.hold.mz = best.oz / 40; let air = 0, minY = h.y;
        for (let i = 0; i < 400; i++) { F.tick(1); if (!h.onGround) air++; minY = Math.min(minY, h.y); if (air > 5 && h.onGround) break; } F.hold = {}; F.tick(40);
        out.push({ from: y0, edge: best, airTicks: air, landedY: Math.round(h.y), minY: Math.round(minY), hp: [hp0, h.hp], deaths: (sim.deaths ?? 0) - d0, camY: Math.round(sc.cam.ty), onGround: h.onGround, hero: [Math.round(h.x), Math.round(h.z)] });
      }
      return out;
    });
    console.log('fall:', JSON.stringify(fall));
    await shot('4_after_fall_full');
  }
  console.log('events:', JSON.stringify(await ev(() => window.__F.ev)));
} catch (e) { errs.push('[exception] ' + e.message); code = 1; }
console.log(errs.length ? errs.slice(0, 12).join('\n') : 'NO PAGE ERRORS');
await browser.close(); srv.close?.();
process.exit(code || (errs.some((e) => /pageerror|exception/.test(e)) ? 1 : 0));
