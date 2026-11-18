// BREAK-VERIFY (11-18): adversarial check of the breakables (jars, pots, urns, crates, barrels), their drops, memory and cost in scene v2g.
//   node tools/v2/breakverify_touch.mjs --dev fold_open|phone2 --part touch|drops|hammer|strip|hud [--out /tmp/claude-0/v2/breakverify]
// touch  : TRUSTED touches (CDP) on the virtual stick and the attack / roll / jump buttons: every kind x c1 from eight directions, c2 / c3 /
//          charged whip / sweep / plunge, a roll through a row of jars and into a crate, three at once with the charged whip, an enemy beside
//          a jar, coins counted against the events, a heal piece at full health.
// drops  : every breakable of every area as placed, broken from eight directions with five coins each: where does every coin come to rest?
// hammer : 200 breaks in a row with re-entries: GPU buffers / textures, draw calls, live pieces, allocation per frame, the sound events.
// strip  : frame strips of a jar, a crate and a barrel breaking at the game camera in both nights.   hud: the coin chip against the other HUD boxes.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEV = String(args.dev || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/breakverify'), PART = String(args.part || 'touch'), QUICK = !!args.quick;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'];
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0; const errs = [], notes = [], res = { dev: DEV, part: PART, lines: [] };
const ok = (name, cond, extra = '') => { if (cond) pass++; else fail++; const l = (cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  (' + extra + ')' : ''); console.log(l); res.lines.push(l); };
const note = (s) => { console.log('  note ' + s); res.lines.push('  note ' + s); notes.push(s); };
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });

/** page side helpers (installed after every load) */
const INSTALL = () => {
  const v = window.__v2, sc = v.scene;
  const bv = (window.__bv = { ev: [], snd: [], log: [], on: false });
  bv.hooks = () => { const sim = sc.sim, H = sim.hooks; if (H.__bv) return; H.__bv = true;
    const w = (n, f) => { const o = H[n]; H[n] = function (...a) { try { bv.ev.push(f(...a)); } catch (e) { bv.ev.push({ n: 'err', e: String(e) }); } return o ? o.apply(this, a) : undefined; }; };
    w('break', (b, by, dx, dz) => ({ n: 'break', kind: b.kind, id: b.id, by, dx: +dx.toFixed(2), dz: +dz.toFixed(2), t: Math.round(performance.now()), hx: sim.hero.x, hz: sim.hero.z }));
    w('drop', (what, n, b) => ({ n: 'drop', what, k: n, id: b.id }));
    w('pickup', (what, n, p) => ({ n: 'pickup', what, k: n, age: +p.t.toFixed(3) }));
    w('heroHurt', (d) => ({ n: 'hurt', d })); };
  bv.sound = async () => { const { feel } = await import('/src/v2/feel/index.js'); if (feel.__bv) return true; feel.__bv = true; const o = feel.play.bind(feel);
    feel.play = (name, pos, vol, pitch) => { const s0 = feel.sound.starts, r = o(name, pos, vol, pitch); if (/^break\.|^pickup\./.test(name)) bv.snd.push({ name, vol: +(vol ?? 1).toFixed(3), pitch: +(pitch ?? 1).toFixed(3), started: feel.sound.starts - s0, hap: r ? r.haptic ?? null : null, t: Math.round(performance.now()) }); return r; }; return !!feel.sound.host?.eng; };
  bv.ground = (x, z, y) => { const sim = sc.sim; sim.qx = x; sim.qz = z; sim.qy = (y ?? 0) + 30; sim._gq(); return sim.g; };
  bv.hero = (x, z, y) => { const sim = sc.sim, h = sim.hero; h.x = x; h.z = z; h._px = x; h._pz = z; h.vx = 0; h.vz = 0; h.vy = 0; h.y = bv.ground(x, z, y); h.onGround = true; h.move = null; h.combo = 0; h.dashT = 0; h.hurtT = 0; h.ifr = 0; h.hp = h.hpMax; h.queued = 0; if (h.safe) { h.safe.x = x; h.safe.z = z; h.safe.y = h.y; } sc.cam.snap = true; };
  bv.face = (fx, fz) => { const h = sc.sim.hero, l = Math.hypot(fx, fz) || 1; h.dirX = fx / l; h.dirZ = fz / l; if (fx) h.facing = fx > 0 ? 1 : -1; if (sc.heroA) { sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ; } };
  bv.quiet = (far) => { for (const e of sc.sim.enemies ?? []) { e.active = false; if (far) { e.x = -4000; e.z = -4000; } } };
  /** put whole things of the given kinds at the given spots (the records and boxes of the area's own breakables are moved; the rest is parked broken) */
  bv.stand = (list, keepOthers) => { const sim = sc.sim, L = sim.breakables, used = new Set(), ids = [];
    if (!keepOthers) for (const q of L) { q.broken = true; q.box.solid = false; }
    for (const d of list) { const b = L.find((q) => q.kind === d.kind && !used.has(q.id)); if (!b) { ids.push(-1); continue; } used.add(b.id); ids.push(b.id);
      const y = bv.ground(d.x, d.z, d.y); b.x = d.x; b.z = d.z; b.y = y; b.drop = d.drop ?? 'none'; b.broken = false; b.by = null;
      const K = b.def, box = b.box; box.x0 = d.x - K.r; box.x1 = d.x + K.r; box.z0 = d.z - K.r; box.z1 = d.z + K.r; box.y0 = y - 20; box.y1 = y + K.h; box.solid = true; }
    sim.brkLive = L.filter((q) => !q.broken).length; sc.brk.broken.clear(); for (const q of L) if (q.broken) sc.brk.broken.add(sc.brk.key(q));
    for (const p of sim.pickups) p.on = false; sim.pickN = 0;
    sc.brk._bake(sc.area, L, sc.glr); return ids; };
  bv.open = (cands, R) => { for (const [x, z] of cands) { const g0 = bv.ground(x, z, 0); let good = Number.isFinite(g0) && g0 > -1e8; for (let a = 0; good && a < 16; a++) for (const r of [R * 0.5, R]) { const px = x + Math.cos(a * Math.PI / 8) * r, pz = z + Math.sin(a * Math.PI / 8) * r; if (!sc._spotOk({ x: px, z: pz, y: g0 }) || Math.abs(bv.ground(px, pz, g0) - g0) > 0.5) { good = false; break; } }
      if (good) { for (const b of sc.W.boxes) if (b.solid && !b.walk && b.brk === undefined && x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1 && b.y1 > g0 + 4 && b.y0 < g0 + 90) { good = false; break; } } if (good) return [x, z, g0]; } return null; };
  bv.state = () => { const sim = sc.sim, h = sim.hero; return { fx: +h.dirX.toFixed(2), fz: +h.dirZ.toFixed(2), x: +h.x.toFixed(1), z: +h.z.toFixed(1), y: +h.y.toFixed(1), move: h.move ? h.move.id : null, moveT: h.moveT, dashT: h.dashT, hp: h.hp, hpMax: h.hpMax, reso: h.reso, coins: sc.brk.coins, stateCoins: sc.state.coins, heroCoins: h.coins, charging: !!h.charging, onGround: h.onGround, live: sim.brkLive, pickN: sim.pickN, shN: sc.brk.shN }; };
  const loop = () => { if (bv.on) { const h = sc.sim.hero; bv.log.push([+h.x.toFixed(2), +h.z.toFixed(2), +h.y.toFixed(1), h.dashT > 0 ? 1 : 0, +Math.hypot(h.vx, h.vz).toFixed(1)]); } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  return true;
};
async function open(area, extra = '') {
  const ctx = await browser.newContext({ ...contextOptions(DEV), serviceWorkers: 'block' }), page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 240))); page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2story=0&v2auto=0&v2seed=7${extra}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(INSTALL); await page.evaluate(() => { window.__bv.hooks(); return window.__bv.sound(); });
  return { ctx, page };
}
const sleep = (page, ms) => page.waitForTimeout(ms);

try {
  // ───────────────────────── touch ─────────────────────────
  if (PART === 'touch') {
    const { ctx, page } = await open('eshville_now', '&v2res=0.4');
    const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page);
    await ensureTouchMode(T, page); await sleep(page, 300);
    const vp = await page.evaluate(() => [innerWidth, innerHeight]), sx = Math.round(vp[0] * 0.2), sy = Math.round(vp[1] * 0.66), R0 = 56;
    const pad = await page.evaluate(() => { const m = window.__v2?.scene?.hud?.metrics?.(); const B = {}; for (const b of m?.pad?.buttons ?? []) B[b.id] = { cx: b.cx, cy: b.cy }; return B; });
    ok(`pad buttons found by their place on screen (attack, roll, jump)`, !!(pad.attack && pad.roll && pad.jump), JSON.stringify(Object.keys(pad)));
    const P0 = await page.evaluate(() => { window.__bv.quiet(true); return window.__bv.open([[4060, 640], [4050, 660], [4040, 620], [3700, 560]], 130); });
    ok('an open flat test spot in eshville_now', !!P0, JSON.stringify(P0)); if (!P0) throw new Error('no open spot');
    const [X0, Z0] = P0;
    const stick = async (ux, uz, ms, id = 21, keep = false) => { await T.down(id, sx, sy); await sleep(page, 24); for (let i = 1; i <= 4; i++) { await T.move(id, Math.round(sx + ux * R0 * i / 4), Math.round(sy - uz * R0 * i / 4)); await sleep(page, 14); } await sleep(page, ms); if (!keep) await T.up(id); };
    const tap = async (b, ms = 60, id = 31) => { await T.down(id, pad[b].cx, pad[b].cy); await sleep(page, ms); await T.up(id); };
    const setup = (list, hx, hz, fx, fz) => page.evaluate(([list, hx, hz, fx, fz]) => { const bv = window.__bv; bv.quiet(true); const ids = bv.stand(list); bv.hero(hx, hz, 0); if (fx !== null) bv.face(fx, fz); bv.ev.length = 0; return ids; }, [list, hx, hz, fx ?? null, fz ?? null]);
    const evs = () => page.evaluate(() => ({ ev: window.__bv.ev.slice(), st: window.__bv.state() }));
    const KINDS = ['jar', 'pot', 'urn', 'crate', 'barrel'], KR = { jar: 17, pot: 19, urn: 11, crate: 27, barrel: 23 };
    // T1: c1 from eight directions, every kind
    console.log(`[${DEV}] c1 by a trusted tap from eight directions`);
    const t1 = {}; let t1bad = [];
    for (const kind of QUICK ? ['jar', 'crate'] : KINDS) { t1[kind] = [];
      for (let a = 0; a < 8; a++) { const ux = Math.cos(a * Math.PI / 4), uz = Math.sin(a * Math.PI / 4), D = (KR[kind] + 14) * (a % 2 ? Math.SQRT2 : 1) + 8;
        await setup([{ kind, x: X0, z: Z0 }], X0 - ux * D, Z0 - uz * D, ux, uz); await sleep(page, 150);
        await tap('attack', 90); await sleep(page, 520);
        const r = await evs(), br = r.ev.filter((e) => e.n === 'break'); const inside = Math.max(Math.abs(r.st.x - X0), Math.abs(r.st.z - Z0)) < KR[kind] + 14 - 1.5 && !br.length;
        t1[kind].push(br.length === 1 ? br[0].by : br.length ? 'x' + br.length : '-'); if (br.length !== 1 || br[0].by !== 'c1' || inside) t1bad.push(`${kind}@${a * 45}:${JSON.stringify(br)}${inside ? ' INSIDE' : ''} hero ${r.st.x - X0},${r.st.z - Z0} facing ${r.st.fx},${r.st.fz}`);
      } }
    ok(`c1 breaks every kind from all eight directions, exactly one break event each`, t1bad.length === 0, Object.entries(t1).map(([k, l]) => `${k} ${l.join(' ')}`).join(' · ') + (t1bad.length ? ' BAD ' + t1bad.slice(0, 4).join(' | ') : ''));
    // T2: the other attacks
    console.log(`[${DEV}] c2 / c3 / charged whip / sweep / plunge`);
    const hide = () => page.evaluate(() => { const sim = window.__v2.scene.sim; for (const q of sim.breakables) if (!q.broken) { q.broken = true; q.box.solid = false; q.__hid = true; } sim.brkLive = 0; });
    const show = () => page.evaluate(() => { const sim = window.__v2.scene.sim; let n = 0; for (const q of sim.breakables) if (q.__hid) { q.__hid = false; q.broken = false; q.box.solid = true; n++; } sim.brkLive = n; });
    const waitMove = async (id, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate((id) => window.__v2.scene.sim.hero.move?.id === id, id)) return true; await sleep(page, 12); } return false; };
    const t2 = {}, t2bad = [];
    for (const kind of QUICK ? ['jar', 'barrel'] : KINDS) { t2[kind] = {};
      for (const atk of ['c2', 'c3', 'whip', 'sweep', 'plunge']) { t2[kind][atk] = [];
        for (const a of (QUICK || atk === 'c2' || atk === 'c3') ? [0] : [0, 3]) { const ux = Math.cos(a * Math.PI / 4), uz = Math.sin(a * Math.PI / 4);
          const D = atk === 'whip' ? 200 : KR[kind] + 14 + (atk === 'sweep' ? 175 + 34 : atk === 'plunge' ? 30 : 10);
          if (atk === 'sweep' && kind !== 'crate' && kind !== 'barrel') { t2[kind][atk].push('skip'); continue; }   // (clay in the roll's way breaks by the roll itself - seen in the roll test)
          await setup([{ kind, x: X0, z: Z0 }], X0 - ux * D, Z0 - uz * D, ux, uz); await sleep(page, 150);
          let how = '';
          if (atk === 'c2' || atk === 'c3') { await hide(); let got = false; for (let k = 0; k < 14 && !got; k++) { await tap('attack', 90); got = await waitMove(atk, 160); }   // (taps in a row until the wanted step of the combo has started: the thing is stood up the moment it does)
            how = got ? '' : 'move ' + atk + ' never started'; await show(); await sleep(page, 700); }
          else if (atk === 'whip') { await T.down(32, pad.attack.cx, pad.attack.cy); await sleep(page, 1000); await T.up(32); await sleep(page, 800); }
          else if (atk === 'sweep') { await stick(ux, uz, 90, 21, true); await tap('roll', 70); await sleep(page, 330); await tap('attack', 60); await sleep(page, 120); await T.up(21); await sleep(page, 520); }
          else { await tap('jump', 120); const t0 = Date.now(); while (Date.now() - t0 < 900) { if (await page.evaluate(() => !window.__v2.scene.sim.hero.onGround)) break; await sleep(page, 10); } await sleep(page, 60); await tap('attack', 90); await sleep(page, 1300); }
          const r = await evs(), br = r.ev.filter((e) => e.n === 'break'); t2[kind][atk].push(br.length === 1 ? br[0].by : br.length ? 'x' + br.length : '-');
          const want = atk; if (br.length !== 1 || br[0].by !== want) t2bad.push(`${kind} ${atk}@${a * 45}: ${br.map((e) => e.by).join(',') || 'no break'} ${how}`);
        } } }
    ok(`every other hero attack breaks every kind (the break names the move)`, t2bad.length === 0, Object.entries(t2).map(([k, o]) => `${k}: ` + Object.entries(o).map(([m, l]) => `${m}=${l.join('/')}`).join(' ')).join(' · ') + (t2bad.length ? ' BAD ' + t2bad.join(' | ') : ''));
    // T3: the roll through a row of three jars keeps its speed; T4: the roll into a crate stops beside it
    console.log(`[${DEV}] the roll`);
    const roll = async (list, hx, hz, ux, uz) => { await setup(list, hx, hz); await sleep(page, 150); await page.evaluate(() => { window.__bv.log.length = 0; window.__bv.on = true; }); await stick(ux, uz, 110, 21, true); await tap('roll', 70); await sleep(page, 700); await T.up(21);
      const r = await page.evaluate(() => { const bv = window.__bv; bv.on = false; return { log: bv.log.slice(), ev: bv.ev.slice(), st: bv.state() }; }); const d = r.log.filter((l) => l[3] === 1); r.rollD = d.length ? +(Math.hypot(d[d.length - 1][0] - d[0][0], d[d.length - 1][1] - d[0][1])).toFixed(1) : 0; r.rollN = d.length; r.vmin = d.length ? Math.min(...d.slice(1).map((l) => l[4])) : 0; r.vmax = d.length ? Math.max(...d.map((l) => l[4])) : 0; return r; };
    const rA = await roll([], X0 - 200, Z0, 1, 0), rB = await roll([{ kind: 'jar', x: X0 - 110, z: Z0 }, { kind: 'jar', x: X0 - 60, z: Z0 + 6 }, { kind: 'pot', x: X0 - 10, z: Z0 - 6 }], X0 - 200, Z0, 1, 0);
    const brB = rB.ev.filter((e) => e.n === 'break');
    ok(`a roll through a row of two jars and a pot loses no speed and breaks what it meets`, brB.length >= 2 && brB.every((e) => e.by === 'roll') && Math.abs(rA.rollD - rB.rollD) < 8 && rB.vmin > rA.vmin - 25, `free roll ${rA.rollD} px in ${rA.rollN} frames (speed ${rA.vmin}..${rA.vmax}) · through the row ${rB.rollD} px in ${rB.rollN} frames (speed ${rB.vmin}..${rB.vmax}) · broke ${brB.map((e) => e.kind + ':' + e.by).join(',')}`);
    for (const kind of ['crate', 'barrel']) { const rC = await roll([{ kind, x: X0 + 70, z: Z0 }], X0 - 200, Z0, 1, 0), brC = rC.ev.filter((e) => e.n === 'break'), face = X0 + 70 - KR[kind], deep = Math.max(...rC.log.map((l) => l[0])) + 14 - face;
      ok(`a roll into a ${kind} stops at its side: not broken, the body never inside it`, brC.length === 0 && deep < 0.6 && rC.st.x < face, `deepest overlap ${deep.toFixed(2)} px · ended at x ${rC.st.x} (face ${face}) · rolled ${rC.rollD} px`); }
    // T5: three at once with the charged whip
    console.log(`[${DEV}] three at once, an enemy, coins, heal`);
    { await setup([{ kind: 'urn', x: X0 + 168, z: Z0 }, { kind: 'jar', x: X0 + 200, z: Z0 + 8 }, { kind: 'pot', x: X0 + 236, z: Z0 - 8 }], X0, Z0, 1, 0); await sleep(page, 150); await page.evaluate(() => { window.__bv.snd.length = 0; });
      await T.down(32, pad.attack.cx, pad.attack.cy); await sleep(page, 1000); await T.up(32); await sleep(page, 900);
      const r = await evs(), br = r.ev.filter((e) => e.n === 'break'), snd = await page.evaluate(() => window.__bv.snd.filter((s) => /^break\./.test(s.name)));
      ok(`the charged whip breaks three in one stroke`, br.length === 3 && br.every((e) => e.by === 'whip'), `${br.map((e) => e.kind + ':' + e.by + '@' + e.t).join(' ')} · sound events ${snd.map((s) => s.name + ' p' + s.pitch + (s.started ? '' : ' (not started)')).join(', ')}`);
      ok(`three breaks in one stroke: three sound events, no two with the same name and pitch`, snd.length === 3 && new Set(snd.map((s) => s.name + s.pitch)).size === 3, JSON.stringify(snd.map((s) => [s.name, s.pitch, s.vol, s.started])));
      res.audioEngine = snd.some((s) => s.started > 0); }
    // T6: an enemy beside a jar: its blows never break it; the hero breaks it while the enemy attacks
    { const r0 = await page.evaluate(([X0, Z0]) => { const bv = window.__bv, sc = window.__v2.scene, sim = sc.sim; bv.stand([{ kind: 'jar', x: X0 + 44, z: Z0 }, { kind: 'crate', x: X0 + 44, z: Z0 + 70 }, { kind: 'urn', x: X0 + 40, z: Z0 - 50 }]); bv.hero(X0, Z0, 0); bv.ev.length = 0;
        const E = sim.enemies.filter((e) => !e.dead).slice(0, 3); E.forEach((e, i) => { e.x = X0 + 96 + i * 8; e.z = Z0 + (i - 1) * 60; e.homeX = e.x; e.homeZ = e.z; e.active = true; if (e.gy !== undefined) { e.y = e.gy = bv.ground(e.x, e.z, 0); } }); window.__bvE = E; window.__bvAtk = 0; return E.map((e) => e.kind); }, [X0, Z0]);
      let hurts = 0, atkSeen = 0; for (let i = 0; i < 26; i++) { await sleep(page, 250); const q = await page.evaluate(() => { const h = window.__v2.scene.sim.hero; h.hp = h.hpMax; return { st: window.__bvE.map((e) => e.state), hurts: window.__bv.ev.filter((e) => e.n === 'hurt').length }; }); hurts = q.hurts; if (q.st.some((s) => /atk|attack|wind|strike|swing|lunge|cast/.test(String(s)))) atkSeen++; }
      const r1 = await evs(), br1 = r1.ev.filter((e) => e.n === 'break');
      ok(`three enemies (${r0.join(', ')}) fight beside a jar, a crate and an urn for 6.5 s: nothing breaks`, br1.length === 0 && (hurts > 0 || atkSeen > 0), `enemy blows that landed on the hero ${hurts} · polls with an enemy in an attack state ${atkSeen}/26 · break events ${br1.length}`);
      await page.evaluate(() => { window.__bv.ev.length = 0; }); await stick(1, 0, 110); await sleep(page, 30); await tap('attack'); await sleep(page, 450);
      const r2 = await evs(), br2 = r2.ev.filter((e) => e.n === 'break');
      ok(`the hero breaks the jar while the enemies are on him`, br2.length >= 1 && br2.some((e) => e.kind === 'jar'), JSON.stringify(br2.map((e) => [e.kind, e.by])));
      await page.evaluate(() => window.__bv.quiet(true)); }
    // T8: coins against the events; standing where the drop lands
    { await setup([{ kind: 'barrel', x: X0 + 50, z: Z0, drop: 'coin5' }, { kind: 'jar', x: X0 + 50, z: Z0 + 60, drop: 'coin4' }], X0, Z0); const c0 = (await evs()).st.coins; await sleep(page, 120);
      await stick(1, 0, 110); await sleep(page, 30); await tap('attack'); await sleep(page, 2600);   // he stands where the coins land: they come to him
      await stick(0.6, 0.8, 200); await sleep(page, 40); await tap('attack'); await sleep(page, 400); await stick(1, 0.3, 500); await stick(-1, -0.3, 400); await sleep(page, 1800);
      const r = await evs(), dr = r.ev.filter((e) => e.n === 'drop' && e.what === 'coin').reduce((s, e) => s + e.k, 0), pk = r.ev.filter((e) => e.n === 'pickup' && e.what === 'coin'), pkN = pk.reduce((s, e) => s + e.k, 0), left = await page.evaluate(() => window.__v2.scene.sim.pickups.filter((p) => p.on).length);
      ok(`coins: dropped ${dr}, picked ${pkN}, the count went up by exactly what the events say (HUD state and hero agree)`, r.st.coins - c0 === pkN && r.st.stateCoins === r.st.coins && r.st.heroCoins === r.st.coins && dr >= 5 && pkN + left === dr, `count ${c0} -> ${r.st.coins} · still lying ${left} · youngest coin taken at age ${Math.min(...pk.map((e) => e.age), 9)} s (never before 0.28)`);
      ok(`no coin is taken before its pop is seen (age >= 0.28 s)`, pk.length > 0 && pk.every((e) => e.age >= 0.28), pk.map((e) => e.age).join(' ')); }
    // T9: a heal piece at full health stays; taken once he is hurt (+12, never above the maximum)
    { await setup([{ kind: 'pot', x: X0 + 50, z: Z0, drop: 'heal' }], X0, Z0); await sleep(page, 120); await stick(1, 0, 110); await sleep(page, 30); await tap('attack'); await sleep(page, 900); await stick(1, 0, 420); await stick(-1, 0, 300); await sleep(page, 700);
      const r = await evs(), lying = await page.evaluate(() => window.__v2.scene.sim.pickups.filter((p) => p.on).map((p) => ({ what: p.what, rest: p.rest, pull: p.pull, d: +Math.hypot(p.x - window.__v2.scene.sim.hero.x, p.z - window.__v2.scene.sim.hero.z).toFixed(0) })));
      ok(`a heal piece at full health is not taken and not pulled: it stays on the ground`, r.ev.filter((e) => e.n === 'pickup').length === 0 && lying.length === 1 && lying[0].what === 1 && !lying[0].pull, JSON.stringify({ lying, hp: r.st.hp, hpMax: r.st.hpMax }));
      await page.evaluate(() => { const h = window.__v2.scene.sim.hero; h.hp = h.hpMax - 5; window.__bv.ev.length = 0; }); await sleep(page, 200); const d0 = lying[0]?.d ?? 0; if (d0 > 100) { await stick(1, 0, 300); } await sleep(page, 900);
      const r2 = await evs();
      ok(`hurt by 5: the heal piece comes to him and fills him to the maximum, not above`, r2.ev.filter((e) => e.n === 'pickup' && e.what === 'heal').length === 1 && r2.st.hp === r2.st.hpMax, `hp ${r2.st.hp}/${r2.st.hpMax}`); }
    await page.screenshot({ path: `${OUT}/touch_${DEV}_end.png` });
    await ctx.close();
  }
  // ───────────────────────── drops: every breakable as placed, eight directions, five coins ─────────────────────────
  if (PART === 'drops') {
    for (const id of ['eshville_now', 'eshville_past', 'graveyard_now', 'graveyard_past', 'belltower_now', 'ossuary_now', 'ossuary_past']) {
      const { ctx, page } = await open(id, '&v2res=0.4');
      const r = await page.evaluate(async () => { const sc = window.__v2.scene, g = window.__game; g._pageHidden = true; const sim = sc.sim, h = sim.hero, bv = window.__bv;
        const { tickPickups, breakOne } = await import('/src/v2/play/breakables.js'); const { reachGrid } = await import('/src/v2/world/reach.js');
        bv.quiet(true); const L = sim.breakables, W = sc.W, H = sim.hooks, keep = { break: H.break, drop: H.drop, pickup: H.pickup, pickupLand: H.pickupLand, event: H.event }; H.break = H.drop = H.pickup = H.pickupLand = H.event = null;
        const seeds = Object.values(sc.area.spawns).map((s) => [s.x, s.z]), sp = sc.area.spawns.default;
        const G1 = reachGrid(W, sp.x, sp.z, 14, { seeds, hooks: W.hookPoints ?? sc.area.stage?.hookPoints ?? [] });   // every breakable standing
        const out = { n: L.length, coins: 0, rest: 0, bad: [], notRest: 0, far: 0, inWhole: 0, lostCells: 0, maxD: 0, tight: 0, pulled: 0, pullFar: 0 };
        // 1) with every one standing: can the hero get next to each (to hit it)? is anything walkable cut off?
        const solid0 = L.map((b) => b.box.solid); for (const b of L) b.box.solid = false; const G0 = reachGrid(W, sp.x, sp.z, 14, { seeds, hooks: W.hookPoints ?? sc.area.stage?.hookPoints ?? [] }); L.forEach((b, i) => { b.box.solid = solid0[i]; });
        let lost = []; for (const q of W.boxes) if (q.walk && q.brk === undefined) for (let x = q.x0 + 10; x < q.x1; x += 20) for (let z = q.z0 + 10; z < q.z1; z += 20) if (G0.reachable(x, z) && !G1.reachable(x, z) && !L.some((b) => Math.abs(b.x - x) < b.r + 34 && Math.abs(b.z - z) < b.r + 34)) lost.push([x, z]);
        out.lostCells = lost.length; out.lostAt = lost.slice(0, 4);
        out.unhittable = L.filter((b) => !G1.near(b.x, b.z, b.r + 14 + 40)).map((b) => b.kind + '@' + b.x + ',' + b.z);
        // 2) pockets: a spot the hero can stand on only when things are broken (behind a jar): can he always hit a way out? (listed, with the size of the pocket)
        // 3) the coins
        const inSolid = (x, z, y, r) => { for (const b of W.boxes) if (b.solid && !b.walk && x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && b.y1 > y + 2 && b.y0 < y + 12) return b; return null; };
        for (let i = 0; i < L.length; i++) { const b = L[i], drop0 = b.drop;
          for (let a = 0; a < 8; a++) for (let rep = 0; rep < 3; rep++) { const dx = Math.cos(a * Math.PI / 4), dz = Math.sin(a * Math.PI / 4);
            for (const p of sim.pickups) p.on = false; sim.pickN = 0; b.drop = 'coin5'; b.broken = false; b.box.solid = true; sim.brkLive++; sim.brkSeed = (i * 7919 + a * 104729 + rep * 31337) | 0;
            const hx = h.x, hz = h.z, hy = h.y; h.x = -99999; h.z = -99999;   // nobody near: nothing is pulled
            breakOne(sim, b, 'c1', dx, dz, false); for (let k = 0; k < 260 && sim.pickN > 0; k++) { tickPickups(sim, 1 / 60); if (k > 200 && sim.pickups.every((p) => !p.on || p.rest)) break; }
            h.x = hx; h.z = hz; h.y = hy;
            for (const p of sim.pickups) { if (!p.on) continue; out.coins++; if (!p.rest) { out.notRest++; continue; } out.rest++;
              sim.qx = p.x; sim.qz = p.z; sim.qy = p.gy + 12; sim._gq(); const gnd = sim.g, w = inSolid(p.x, p.z, p.gy, 0), d = Math.hypot(p.x - b.x, p.z - b.z); if (d > out.maxD) out.maxD = d;
              const reach = G0.near(p.x, p.z, 24) || G1.near(p.x, p.z, 24), why = !(Number.isFinite(gnd) && gnd > -1e8) ? 'no floor under it' : Math.abs(gnd - p.gy) > 1 || Math.abs(p.y - p.gy) > 1 ? 'not on its floor (y ' + p.y.toFixed(1) + ' floor ' + gnd.toFixed(1) + ' gy ' + p.gy.toFixed(1) + ')' : w ? (w.brk !== undefined ? 'inside a whole breakable' : 'inside a solid box') : !reach ? 'the hero cannot get within 24 of it' : null;
              if (w && w.brk !== undefined) out.inWhole++;
              let got = null;
              if (why === 'the hero cannot get within 24 of it') {   // can he still take it? he stands on the reachable spots around it (nearest first): is it pulled out to him?
                out.tight++; const C = []; for (let ox = -120; ox <= 120; ox += 20) for (let oz = -120; oz <= 120; oz += 20) { const cx = p.x + ox, cz = p.z + oz, dd = Math.hypot(ox, oz); if (dd < 116 && G0.reachable(cx, cz)) C.push([dd, cx, cz]); } C.sort((u, v2) => u[0] - v2[0]);
                const keepP = sim.pickups.map((q) => q.on), sv = { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: p.vy, vz: p.vz, gy: p.gy, t: p.t, rest: p.rest, pull: p.pull }, h0 = { x: h.x, z: h.z, y: h.y, dead: h.dead };
                for (const q of sim.pickups) if (q !== p) q.on = false;
                for (let c = 0; c < Math.min(14, C.length) && !got; c++) { Object.assign(p, sv); p.on = true; h.x = C[c][1]; h.z = C[c][2]; sim.qx = h.x; sim.qz = h.z; sim.qy = p.gy + 60; sim._gq(); h.y = sim.g; h.dead = false; if (Math.abs(h.y - p.gy) >= 90) continue;
                  for (let k = 0; k < 200 && p.on; k++) { p.t = Math.min(p.t, 5); tickPickups(sim, 1 / 60); } if (!p.on) got = [Math.round(C[c][0]), C[c][1], C[c][2]]; }
                Object.assign(p, sv); p.on = true; sim.pickups.forEach((q, qi) => { q.on = keepP[qi]; }); h.x = h0.x; h.z = h0.z; h.y = h0.y; h.dead = h0.dead; sim.pickN = sim.pickups.filter((q) => q.on).length;
                if (got) { out.pulled++; if (got[0] > out.pullFar) out.pullFar = got[0]; }
              }
              if (why && !got && !(w && w.brk !== undefined)) { if (out.bad.length < 12) out.bad.push({ from: b.kind + '@' + b.x + ',' + b.z, dir: a * 45, at: [Math.round(p.x), Math.round(p.z), Math.round(p.y)], why }); out.far++; } }
            b.broken = true; b.box.solid = false; }
          b.drop = drop0; b.broken = false; b.box.solid = true; sim.brkLive = L.filter((q) => !q.broken).length; }
        for (const p of sim.pickups) p.on = false; sim.pickN = 0; Object.assign(H, keep); out.maxD = Math.round(out.maxD); return out; });
      ok(`${id}: ${r.n} breakables x 8 directions x 3 seeds: ${r.coins} coins, ${r.rest} at rest · lying where he cannot step (within 24) ${r.tight}, of those pulled out to him from a spot he can stand on ${r.pulled} (from up to ${r.pullFar} px) · LOST or badly resting ${r.far} · still moving after 4.3 s ${r.notRest} · inside another whole breakable ${r.inWhole} · farthest from its jar ${r.maxD} px · walkable spots cut off by standing things ${r.lostCells} · things the hero cannot get next to ${r.unhittable.length}`, r.far === 0 && r.notRest === 0 && r.unhittable.length === 0, (r.bad.length ? JSON.stringify(r.bad.slice(0, 6)) : '') + (r.lostAt?.length ? ' cut off: ' + JSON.stringify(r.lostAt) : ''));
      if (r.inWhole) note(`${id}: ${r.inWhole} coins came to rest inside the box of another whole breakable (they come out when it breaks or are pulled out within 118 px)`);
      res[id] = r; await ctx.close();
    }
  }
  // ───────────────────────── hammer ─────────────────────────
  if (PART === 'hammer') {
    const { ctx, page } = await open('eshville_now', '&v2res=0.5');
    const base = await page.evaluate(() => { const sc = window.__v2.scene, g = window.__game, gl = sc.glr.gl; g._pageHidden = true; window.__bv.quiet(true);
      const C = (window.__cnt = { buf: 0, tex: 0, bufMade: 0, texMade: 0 }); const cb = gl.createBuffer.bind(gl), db = gl.deleteBuffer.bind(gl), ct = gl.createTexture.bind(gl), dt = gl.deleteTexture.bind(gl);
      gl.createBuffer = () => { C.buf++; C.bufMade++; return cb(); }; gl.deleteBuffer = (b) => { if (b) C.buf--; return db(b); }; gl.createTexture = () => { C.tex++; C.texMade++; return ct(); }; gl.deleteTexture = (t) => { if (t) C.tex--; return dt(t); };
      for (let i = 0; i < 30; i++) g.tick(1 / 60); g.render(); const st = window.__v2.stats; return { draws: st.gl.draws, tris: st.gl.tris, texMB: st.gl.texMB, bufBytes: sc.glr.stats.bufBytes, brk: { ...sc.brk.stat } }; });
    const waitReady = async () => { for (let i = 0; i < 500; i++) { if (await page.evaluate(() => { const g = window.__game; g._pageHidden = true; g.tick(1 / 60); g.render(); const sc = window.__v2.scene; return sc.ready && !sc._go && sc.fadeA <= 0.01; })) return true; await page.waitForTimeout(30); } return false; };
    let total = 0, cyc = 0; const cycles = []; const route = ['eshville_now', 'graveyard_now', 'eshville_past', 'ossuary_now', 'eshville_now', 'graveyard_past', 'belltower_now', 'eshville_past', 'ossuary_past', 'eshville_now', 'graveyard_now', 'eshville_past', 'eshville_now'];
    while (total < 200 && cyc < route.length) {
      if (cyc > 0) { await page.evaluate((to) => window.__v2.scene.travelTo(to, 'default'), route[cyc]); await waitReady(); await page.evaluate(() => { window.__bv.hooks(); window.__bv.quiet(true); }); }
      const r = await page.evaluate((left) => { const sc = window.__v2.scene, g = window.__game, sim = sc.sim, bv = window.__bv, L = sim.breakables; let n = 0, peakSh = 0, peakPk = 0, peakDraw = 0, worst = 0;
        for (let i = 0; i < 20; i++) g.tick(1 / 60); g.render(); const whole0 = { ...sc.brk.stat }, fd0 = window.__v2.stats.gl.draws;
        for (const b of L) { if (n >= left) break; sim.breakAt(b.x, b.z, 2, ['c1', 'c2', 'c3', 'whip', 'sweep', 'plunge'][n % 6]); n++; for (let k = 0; k < 4; k++) { const t0 = performance.now(); g.tick(1 / 60); g.render(); worst = Math.max(worst, performance.now() - t0); peakSh = Math.max(peakSh, sc.brk.shN); peakPk = Math.max(peakPk, sim.pickN); peakDraw = Math.max(peakDraw, sc.brk.stat.draws); } }
        const allBroken = sim.brkLive === 0; for (const p of sim.pickups) p.on = false; sim.pickN = 0; for (let i = 0; i < 330; i++) g.tick(1 / 60); g.render();
        const st = window.__v2.stats; return { area: sc.area.id, n, of: L.length, allBroken, whole0, fd0, after: { ...sc.brk.stat }, fd1: st.gl.draws, peakSh, peakPk, peakDraw, worst: +worst.toFixed(1), cnt: { ...window.__cnt }, bufBytes: sc.glr.stats.bufBytes, texMB: st.gl.texMB, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; }, 200 - total);
      total += r.n; cycles.push(r); cyc++;
      console.log(`    visit ${cyc} ${r.area}: broke ${r.n}/${r.of} · whole +${r.whole0.draws} draw (frame ${r.fd0}) -> after ${r.after.draws} draws ${r.after.tris} tris (frame ${r.fd1}) · peak pieces ${r.peakSh} pickups ${r.peakPk} brk draws ${r.peakDraw} · worst frame ${r.worst} ms · GL buffers alive ${r.cnt.buf} (made ${r.cnt.bufMade}) textures alive ${r.cnt.tex} (made ${r.cnt.texMade}) · bufBytes ${r.bufBytes} texMB ${r.texMB}`);
    }
    const same = (a) => cycles.filter((c) => c.area === a);
    const e = same('eshville_now'), bufGrow = e.length > 1 ? e[e.length - 1].cnt.buf - e[0].cnt.buf : 0, texGrow = e.length > 1 ? e[e.length - 1].cnt.tex - e[0].cnt.tex : 0, bytesGrow = e.length > 1 ? e[e.length - 1].bufBytes - e[0].bufBytes : 0;
    ok(`${total} breaks over ${cycles.length} visits: every visit ends with 0 breakable draws and 0 triangles when all are broken`, total >= 200 && cycles.every((c) => !c.allBroken || (c.after.draws === 0 && c.after.tris === 0 && c.fd1 === c.fd0 - 1)), cycles.map((c) => `${c.area.replace('eshville', 'esh').replace('graveyard', 'grv')} ${c.fd0}->${c.fd1}`).join(' '));
    ok(`live pieces capped at the pool (128), pickups at 40`, cycles.every((c) => c.peakSh <= 128 && c.peakPk <= 40), `peak pieces ${Math.max(...cycles.map((c) => c.peakSh))} · peak pickups ${Math.max(...cycles.map((c) => c.peakPk))}`);
    ok(`GPU objects do not grow between the first and the last visit of the same area (eshville_now x${e.length})`, e.length > 1 && bufGrow <= 0 && texGrow <= 0 && bytesGrow <= 0, `GL buffers alive ${e.map((c) => c.cnt.buf).join(' -> ')} · textures alive ${e.map((c) => c.cnt.tex).join(' -> ')} · renderer bufBytes ${e.map((c) => c.bufBytes).join(' -> ')} · texMB ${e.map((c) => c.texMB).join(' -> ')}`);
    // sounds: one event per break, the right name for the material, no long run of one name + pitch
    const snd = await page.evaluate(() => ({ snd: window.__bv.snd.filter((s) => /^break\./.test(s.name)), br: window.__bv.ev.filter((e) => e.n === 'break').map((e) => e.kind) }));
    const want = (k) => k === 'crate' ? /^break\.crate$/ : k === 'barrel' ? /^break\.barrel$/ : /^break\.clay(\.b|\.c)?$/; let wrong = 0, run = 1, maxRun = 1, sameName = 1, maxName = 1;
    for (let i = 0; i < snd.br.length; i++) { if (!snd.snd[i] || !want(snd.br[i]).test(snd.snd[i].name)) wrong++; if (i && snd.snd[i] && snd.snd[i - 1]) { run = snd.snd[i].name === snd.snd[i - 1].name && Math.abs(snd.snd[i].pitch - snd.snd[i - 1].pitch) < 0.02 ? run + 1 : 1; maxRun = Math.max(maxRun, run); sameName = snd.snd[i].name === snd.snd[i - 1].name && /clay/.test(snd.snd[i].name) ? sameName + 1 : 1; maxName = Math.max(maxName, sameName); } }
    const names = {}; for (const s of snd.snd) names[s.name] = (names[s.name] ?? 0) + 1; const pit = snd.snd.map((s) => s.pitch), started = snd.snd.filter((s) => s.started > 0).length;
    ok(`sound: ${snd.br.length} breaks -> ${snd.snd.length} break sound events, each named for its material`, snd.snd.length === snd.br.length && wrong === 0 && snd.br.length >= 200, JSON.stringify(names) + ` · wrong ${wrong}`);
    ok(`sound: never the same name and pitch (within 2 %) more than twice running; the same clay set never twice running`, maxRun <= 2 && maxName === 1, `longest run of one name+pitch ${maxRun} · longest run of one clay set ${maxName} · pitch ${Math.min(...pit)}..${Math.max(...pit)} · started in the audio engine ${started}/${snd.snd.length}`);
    res.snd = { names, started, n: snd.snd.length };
    res.cycles = cycles; res.base = base; await ctx.close();
  }
  // ───────────────────────── alloc: bytes per frame, idle against pieces flying and coins lying ─────────────────────────
  if (PART === 'alloc') {
    const { ctx, page } = await open('eshville_now', '&v2res=0.5');
    await page.evaluate(() => { const g = window.__game; g._pageHidden = true; window.__bv.quiet(true); for (let i = 0; i < 60; i++) g.tick(1 / 60); g.render(); });
    const al = await page.evaluate(() => { const sc = window.__v2.scene, g = window.__game, sim = sc.sim, L = sim.breakables, M = performance.memory; if (!M || !window.gc) return null;
      const run = (n) => { for (let i = 0; i < 60; i++) { g.tick(1 / 60); g.render(); } gc(); gc(); const a = M.usedJSHeapSize; for (let i = 0; i < n; i++) { g.tick(1 / 60); g.render(); } const b = M.usedJSHeapSize; return Math.round((b - a) / n); };
      const idle = [run(240), run(240)]; for (let i = 0; i < 6; i++) { L[i].drop = 'coin5'; sim.breakAt(L[i].x, L[i].z, 2, 'c1'); } sim.hero.x += 0; const hx = sim.hero.x; for (let i = 0; i < 3; i++) { g.tick(1 / 60); g.render(); }
      const sh0 = sc.brk.shN, pk0 = sim.pickN; const busy = [run(100)]; const sh1 = sc.brk.shN, pk1 = sim.pickN; for (let i = 6; i < 12; i++) { L[i].drop = 'coin5'; sim.breakAt(L[i].x, L[i].z, 2, 'c1'); } for (let i = 0; i < 3; i++) { g.tick(1 / 60); g.render(); } busy.push(run(100));
      return { idle, busy, sh0, pk0, sh1, pk1 }; });
    if (al) ok(`allocation per frame with pieces flying and coins lying is no higher than standing idle (+1 KB tolerance)`, Math.min(...al.busy) <= Math.max(...al.idle) + 1024, `idle ${al.idle.join(' / ')} B per frame · busy ${al.busy.join(' / ')} B per frame (pieces ${al.sh0} -> ${al.sh1}, pickups ${al.pk0} -> ${al.pk1})`); else note('no precise heap numbers in this browser');
    res.alloc = al; await ctx.close();
  }
  // ───────────────────────── combo: c2 / c3 / plunge on every kind through the scene's own input latch (60 ticks a second, no touch) ─────────────────────────
  if (PART === 'combo') {
    const { ctx, page } = await open('eshville_now', '&v2res=0.4');
    const r = await page.evaluate(() => { const sc = window.__v2.scene, g = window.__game, sim = sc.sim, bv = window.__bv; g._pageHidden = true; bv.quiet(true); const X0 = 4060, Z0 = 640, out = {};
      const tick = (n) => { for (let i = 0; i < n; i++) g.tick(1 / 60); };
      for (const kind of ['jar', 'pot', 'urn', 'crate', 'barrel']) { out[kind] = {};
        for (const want of ['c2', 'c3']) { const ids = bv.stand([{ kind, x: X0, z: Z0 }]), b = sim.breakables[ids[0]]; bv.hero(X0 - b.r - 14 - 10 - (want === 'c3' ? 46 : 22), Z0, 0); bv.face(1, 0); tick(2); bv.ev.length = 0; b.broken = true; b.box.solid = false; sim.brkLive = 0;   // (he steps 20 + 22 forward in c1 and c2 while the thing is put away: he starts that much further back)
          let got = false; for (let i = 0; i < 240 && !got; i++) { sc.inp.attack = true; g.tick(1 / 60); got = sim.hero.move?.id === want; }
          b.broken = false; b.box.solid = true; sim.brkLive = 1; tick(50); out[kind][want] = bv.ev.filter((e) => e.n === 'break').map((e) => e.by).join(',') || (got ? 'no break' : 'move never started'); }
        { const ids = bv.stand([{ kind, x: X0, z: Z0 }]), b = sim.breakables[ids[0]], h = sim.hero; bv.hero(X0 - b.r - 14 - 30, Z0, 0); bv.face(1, 0); tick(2); bv.ev.length = 0; h.vy = 640; h.onGround = false; h.y += 4; tick(9); const air = !h.onGround; sc.inp.attack = true; tick(100); out[kind].plunge = bv.ev.filter((e) => e.n === 'break').map((e) => e.by).join(',') || (air ? 'no break' : 'not in the air'); }
        { const ids = bv.stand([{ kind, x: X0, z: Z0 }]), b = sim.breakables[ids[0]], h = sim.hero; bv.hero(X0 - b.r - 14 - 60, Z0, 0); bv.face(1, 0); tick(2); bv.ev.length = 0; h.vy = 640; h.onGround = false; h.y += 4; tick(9); h.dirX = 0; h.dirZ = -1; sc.inp.attack = true; tick(100); out[kind].ring = bv.ev.filter((e) => e.n === 'break').map((e) => e.by).join(',') || 'no break'; }   // (facing away: only the landing ring can reach it)
      } return out; });
    const bad = []; for (const [k, o] of Object.entries(r)) for (const m of ['c2', 'c3', 'plunge']) if (o[m] !== m) bad.push(`${k} ${m}: ${o[m]}`);
    ok(`c2, c3 and the plunge break every kind (rules driven through the scene's input latch at 60 ticks a second)`, bad.length === 0, Object.entries(r).map(([k, o]) => `${k}: c2=${o.c2} c3=${o.c3} plunge=${o.plunge} ring=${o.ring}`).join(' · '));
    res.combo = r; await ctx.close();
  }
  // ───────────────────────── strip: frames of a break at the game camera, both nights ─────────────────────────
  if (PART === 'strip') {
    for (const [area, picks] of [['eshville_now', ['jar', 'crate', 'barrel']], ['eshville_past', ['jar', 'crate', 'barrel']]]) {
      const { ctx, page } = await open(area, '');
      for (const kind of picks) {
        const info = await page.evaluate((kind) => { const sc = window.__v2.scene, g = window.__game, sim = sc.sim, bv = window.__bv; g._pageHidden = true; bv.quiet(true); const L = sim.breakables;
          const b = L.find((q) => q.kind === kind && !q.broken && q.z < 400) ?? L.find((q) => q.kind === kind && !q.broken); if (!b) return null; b.drop = kind === 'jar' ? 'coin4' : kind === 'crate' ? 'heal' : 'reso';
          bv.hero(b.x - 150, b.z - 70, b.y); const h = sim.hero; bv.face(0.9, 0.42); h.reso = 0; for (let i = 0; i < 50; i++) g.tick(1 / 60); g.render();
          const p = window.__v2.project(b.x, b.y + 30, b.z); return { id: b.id, x: b.x, z: b.z, y: b.y, p, vw: innerWidth, vh: innerHeight }; }, kind);
        if (!info) { note(`${area}: no whole ${kind} to capture`); continue; }
        const cw = Math.min(460, info.vw), ch = Math.min(340, info.vh), cx = Math.max(0, Math.min(info.vw - cw, Math.round(info.p.x - cw / 2))), cy = Math.max(0, Math.min(info.vh - ch, Math.round(info.p.y - ch * 0.6)));
        const shot = (n) => page.screenshot({ path: `${OUT}/strip_${DEV}_${area}_${kind}_${n}.png`, clip: { x: cx, y: cy, width: cw, height: ch } });
        await shot('00');
        await page.evaluate((id) => { const sc = window.__v2.scene, g = window.__game, sim = sc.sim, b = sim.breakables[id]; sim.breakAt(b.x - 10, b.z - 6, 1, 'c1'); g.tick(1 / 60); g.render(); }, info.id);   // (the hero stands 165 away: what drops lies to be seen)
        const steps = [[1, '01'], [2, '03'], [3, '06'], [4, '10'], [8, '18'], [12, '30'], [30, '60'], [60, '120'], [60, '180'], [45, '225']];
        for (const [n, tag] of steps) { await page.evaluate((n) => { const g = window.__game; for (let i = 0; i < n; i++) g.tick(1 / 60); g.render(); }, n); await shot(tag); }
      }
      await page.evaluate(() => { const g = window.__game; g._pageHidden = true; }); await ctx.close();
    }
  }
  // ───────────────────────── hud: the coin chip against everything else on screen ─────────────────────────
  if (PART === 'hud') {
    const { ctx, page } = await open('eshville_now', '');
    const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page); await ensureTouchMode(T, page); await sleep(page, 300);
    await page.evaluate(() => { const sc = window.__v2.scene, bv = window.__bv; bv.quiet(true); const b = sc.sim.breakables.find((q) => q.kind === 'barrel'); b.drop = 'coin5'; bv.hero(b.x - 60, b.z - 40, b.y); sc.sim.breakAt(b.x, b.z, 2, 'c1'); });
    await sleep(page, 1500); await page.screenshot({ path: `${OUT}/hud_${DEV}_coins.png` });
    const m = await page.evaluate(() => { const sc = window.__v2.scene, m = sc.hud.metrics?.() ?? {}; const keys = Object.keys(m); const flat = {}; for (const k of keys) { const v = m[k]; if (v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.w)) flat[k] = { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.w), h: Math.round(v.h) }; } return { keys, flat, coins: sc.state.coins, toasts: (m.toasts ?? []).length, vw: innerWidth, vh: innerHeight }; });
    console.log('    hud metrics keys: ' + m.keys.join(', ') + ' · boxes ' + JSON.stringify(m.flat)); res.hud = m;
    // toasts under the chip: push two toasts and look again
    await page.evaluate(() => { const sc = window.__v2.scene; try { sc.toast?.('은화를 주웠다'); sc.toast?.('문이 열렸다'); } catch { /* no toast call */ } const S = sc.state; if (Array.isArray(S.toasts)) { S.toasts.push({ text: '은화를 주웠다', t: 0 }); } });
    await sleep(page, 500); await page.screenshot({ path: `${OUT}/hud_${DEV}_coins_toast.png` });
    const m2 = await page.evaluate(() => { const sc = window.__v2.scene, m = sc.hud.metrics?.() ?? {}; const R = []; const walk = (k, v) => { if (!v || typeof v !== 'object') return; if (Array.isArray(v)) { v.forEach((q, i) => walk(k + '[' + i + ']', q)); return; } if (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.w) && Number.isFinite(v.h)) R.push({ k, x: v.x, y: v.y, w: v.w, h: v.h }); for (const [kk, vv] of Object.entries(v)) if (vv && typeof vv === 'object') walk(k + '.' + kk, vv); }; for (const [k, v] of Object.entries(m)) walk(k, v); return R.map((r) => ({ k: r.k, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) })); });
    const chip = m2.filter((r) => /coin|purse/i.test(r.k)), others = m2.filter((r) => !/coin|purse/i.test(r.k) && !/^pad\.stick|zone|safe|screen|view/i.test(r.k));
    const hit = []; for (const c of chip) for (const o of others) { const ox = Math.min(c.x + c.w, o.x + o.w) - Math.max(c.x, o.x), oy = Math.min(c.y + c.h, o.y + o.h) - Math.max(c.y, o.y); if (ox > 1 && oy > 1 && !(o.w * o.h > c.w * c.h * 12)) hit.push(`${c.k} x ${o.k} (${Math.round(ox)}x${Math.round(oy)})`); }
    ok(`${DEV}: the coin chip (${chip.map((c) => `${c.k} ${c.x},${c.y} ${c.w}x${c.h}`).join(' · ') || 'not in the metrics'}) overlaps no other HUD box`, chip.length > 0 && hit.length === 0, hit.join(' | ') + ` · ${others.length} other boxes`);
    res.hudBoxes = m2; await ctx.close();
  }
} catch (e) { console.error('FAILED', e); fail++; res.crash = String(e?.stack ?? e).slice(0, 600); } finally { await browser.close(); srv.close?.(); }
ok('0 page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
res.errs = errs; res.pass = pass; res.fail = fail;
fs.writeFileSync(`${OUT}/bv_${PART}_${DEV}.json`, JSON.stringify(res, null, 1));
console.log(`\n${fail ? 'FAIL' : 'ALL OK'} [${PART} ${DEV}]: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
