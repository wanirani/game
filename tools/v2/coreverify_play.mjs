// CORE-VERIFY: plays scene v2g with trusted touches (CDP) on the virtual pad, tick-stepped, and saves stills + numbers.
//   node tools/v2/coreverify_play.mjs [--oldpad 1 = fallback run on the v1 pad (v2ui=0)] [--devices fold_open,phone2] [--out /tmp/claude-0/v2/coreverify] [--only walk,rev,atk,combo,roll,guard,parry,jump,plunge,bolt,die,spots,v2c]
// The page's own frame loop is paused (game._pageHidden) and the script steps game.tick(1/60) + game.render() itself,
// so input timing is exact although the software renderer is slow. Touches are real touch events on the pad.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, padLayout } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(',');
const OUT = String(args.out || '/tmp/claude-0/v2/coreverify');
const ONLY = args.only ? String(args.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', '--js-flags=--expose-gc'];
const R = { devices: {} }, fails = [];
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const note = (m) => console.log('       ' + m);
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const DIRS = { R: [1, 0], UR: [1, -1], U: [0, -1], UL: [-1, -1], L: [-1, 0], DL: [-1, 1], D: [0, 1], DR: [1, 1] };   // screen (x right, y down); up on screen = into the screen (+z)
const ang = (x, z) => Math.atan2(z, x), dAng = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function install() {
  const g = window.__game;
  g._pageHidden = true;
  const C = (window.__cv = {
    snap() {
      const v = window.__v2, sc = v.scene, sim = sc.sim, h = sim.hero, a = sc.heroA, r3 = (n) => +(Number(n) || 0).toFixed(3);
      const p = v.project(h.x, h.y + 46, h.z);
      return { x: r3(h.x), y: r3(h.y), z: r3(h.z), hp: h.hp, dx: r3(h.dirX ?? h.facing), dz: r3(h.dirZ), fx: r3(a?.dx), fz: r3(a?.dz), vx: r3(h.vx), vz: r3(h.vz), anim: h.anim, clip: a?.anim?.cur?.name ?? '',
        move: h.move?.id ?? null, combo: h.combo, dashT: r3(h.dashT), guard: !!h.guard, parryOk: r3(h.parryOk), blockT: r3(h.blockT), hurtT: r3(h.hurtT), ifr: r3(h.ifr), dead: !!h.dead, onGround: !!h.onGround,
        stop: r3(sc.fx?.feel?.stop), sec: sim.section, deaths: sim.deaths ?? 0, px: r3(p.x), py: r3(p.y), vw: g.viewW, vh: g.viewH, mode: g.input?.mode };
    },
    step(n, render = true) { for (let i = 0; i < n; i++) g.tick(1 / 60); if (render) g.render(); return C.snap(); },
    /** step until fn(sim) is true (max n ticks); returns ticks used or -1 */
    until(src, n) { const fn = (0, eval)(src), sim = window.__v2.scene.sim; for (let i = 0; i < n; i++) { g.tick(1 / 60); if (fn(sim)) { g.render(); return i + 1; } } g.render(); return -1; },
    hero(x, z) { const sim = window.__v2.scene.sim, h = sim.hero; h.x = x; h.z = z; h.y = sim.w?.ground ? sim.w.ground(x, z) : h.y; h.vx = h.vz = h.vy = 0; h.onGround = true; h.move = null; h.dashT = 0; h.hurtT = 0; h.guard = false; h.hp = 100; h.dead = false; h.ifr = 0; h.safe = { x, z, y: h.y }; window.__v2.scene.cam.snap = true; },
    /** keep one enemy of the kind alive as a test dummy, everything else outside the yard is removed */
    clear() { const sim = window.__v2.scene.sim; C.dm = {}; for (const e of sim.enemies) { if (e.yard) continue; const k = e.def?.shot || e.kind === 'ranged' || /mage/.test(e.def?.model ?? '') ? 'ranged' : 'melee'; if (!C.dm[k]) { C.dm[k] = e; C.park(k); } else e.dead = true; } return Object.keys(C.dm); },
    park(k) { const e = C.dm[k]; if (!e) return; e.x = 330; e.z = 120; e.y = e.gy = window.__v2.scene.sim.w.ground(330, 120); e.active = false; e.state = 'idle'; e.stateT = 0; e.atk = null; e.tele = 0; e.hp = e.hpMax = 9999; e.vx = e.vz = 0; e.stun = 0; e.stagger = 0; },
    put(k, x, z, active) { const sim = window.__v2.scene.sim, e = C.dm[k]; if (!e) return null; e.x = x; e.z = z; e.gy = sim.w.ground(x, z); e.y = e.gy + (e.hover ?? 0); e.hp = e.hpMax = 9999; e.vx = e.vz = 0; e.stun = 0; e.stagger = 0; e.atk = null; e.tele = 0; e.cd = active ? 0.2 : 9; e.active = !!active; e.state = active ? 'chase' : 'idle'; e.stateT = 0; return e.id; },
    dmHp(k) { return C.dm[k]?.hp ?? -1; },
    dm: {},
  });
  return C.snap();
}

async function run(dev) {
  const D = (R.devices[dev] = {}), dir = `${OUT}/${dev}`; fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
  const errs = [];
  try {
    const ctx = await browser.newContext(contextOptions(dev)), page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
    const open = async (scene) => {
      await page.goto(`http://localhost:${port}/index.html?scene=${scene}${scene === 'v2g' ? '&area=slice0&v2auto=0' + (args.oldpad ? '&v2ui=0' : '') : ''}`);   // v2g: the test route, fixed render size; --oldpad 1 = the fallback run on the v1 pad
      await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 });
      return page.evaluate(install);
    };
    const ev = (fn, a) => page.evaluate(fn, a);
    const step = (n, render = true) => ev(([n, r]) => window.__cv.step(n, r), [n, render]);
    const until = (src, n) => ev(([s, n]) => window.__cv.until(s, n), [src, n]);
    const shot = async (name) => { await page.screenshot({ path: `${dir}/${name}.jpg`, type: 'jpeg', quality: 84, scale: 'css' }); };
    const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page);
    const vp = contextOptions(dev).viewport, SX = Math.round(vp.width * 0.2), SY = Math.round(vp.height * 0.68);
    let pad = null;
    const stick = async (d, mag = 52) => { const [dx, dy] = typeof d === 'string' ? DIRS[d] : d, l = Math.hypot(dx, dy) || 1; if (!T.active.has(21)) { await T.down(21, SX, SY); await T.move(21, SX + dx / l * mag * 0.5, SY + dy / l * mag * 0.5); } await T.move(21, SX + dx / l * mag, SY + dy / l * mag); };
    const stickUp = () => T.up(21);
    const btnDown = (id, f) => T.down(f ?? ({ attack: 11, jump: 12, dash: 13 })[id], pad.buttons[id].cx, pad.buttons[id].cy);
    const btnUp = (id, f) => T.up(f ?? ({ attack: 11, jump: 12, dash: 13 })[id]);
    const press = async (id, ticks = 3) => { await btnDown(id); const s = await step(ticks); await btnUp(id); return s; };
    let BASE = [900, 190];
    const home = async () => { await T.upAll(); await ev((b) => { window.__cv.hero(b[0], b[1]); window.__cv.park('melee'); window.__cv.park('ranged'); }, BASE); await step(14); };

    // ───────── v2g ─────────
    const s0 = await open('v2g');
    await T.tap(Math.round(vp.width * 0.5), Math.round(vp.height * 0.3), 40); await step(4);
    // the new pad (cut-glass interface, the default): button centres from scene.hud.metrics(); the v1 pad only with --oldpad 1
    await page.waitForFunction((old) => old || window.__v2.stats.hud === 'ui', !!args.oldpad, { timeout: 10000 }).catch(() => {});
    await step(2);
    const np = await page.evaluate(() => { const m = window.__v2?.scene?.hud?.metrics?.(); if (!m?.pad?.buttons?.length) return null; const B = {}; for (const b of m.pad.buttons) B[b.id === 'roll' ? 'dash' : b.id] = { cx: b.cx, cy: b.cy, d: b.d }; return { source: 'v2 pad (scene.hud.metrics)', buttons: B }; });
    pad = np ?? (await padLayout(page));
    D.pad = { source: pad.source, buttons: Object.keys(pad.buttons ?? {}) };
    const kinds = await ev(() => window.__cv.clear());
    D.mode = (await step(2)).mode; D.dummies = kinds;
    console.log(`[${dev}] v2g ready, input mode ${D.mode}, pad ${D.pad.source}: ${D.pad.buttons.join(' ')}, dummies ${kinds.join(' ')}`);
    if (!pad.buttons?.attack || !pad.buttons?.dash || !pad.buttons?.jump) fail(`${dev}: pad has no attack / dash / jump button`);
    await shot('00_start');
    {   // a flat open spot for the tests: the same ground 150 px around in eight directions
      const pick = await ev(() => { const w = window.__v2.scene.sim.w, out = []; for (const [x, z] of [[470, 110], [430, 90], [1130, 140], [1260, 120], [1420, 150], [2190, 900], [2190, 1250]]) { const g0 = w.ground(x, z); let flat = Number.isFinite(g0), free = true; for (let a = 0; a < 8 && flat; a++) for (const r of [50, 100, 150]) { const px = x + Math.cos(a * Math.PI / 4) * r, pz = z + Math.sin(a * Math.PI / 4) * r; if (w.ground(px, pz) !== g0) flat = false; } out.push([x, z, g0, flat]); } return out; });
      const f = pick.find((q) => q[3]); if (f) BASE = [f[0], f[1]]; D.base = { BASE, flat: !!f, tried: pick };
      note(`test spot ${BASE.join(',')} ${f ? '(flat 150 px around)' : '(NO flat spot found: ' + JSON.stringify(pick) + ')'}`);
    }

    if (want('walk')) {
      const W = (D.walk = {});
      for (const k of Object.keys(DIRS)) {
        await home(); const a = await step(1);
        await stick(k); const b = await step(36); await shot('walk_' + k);
        await stickUp(); const c = await step(24);
        const want = ang(DIRS[k][0], -DIRS[k][1]), mv = ang(b.x - a.x, b.z - a.z), dist = Math.hypot(b.x - a.x, b.z - a.z);
        W[k] = { dist: +dist.toFixed(0), moveErr: +dAng(mv, want).toFixed(2), dirErr: +dAng(ang(b.dx, b.dz), want).toFixed(2), faceErr: +dAng(ang(b.fx, b.fz), want).toFixed(2), anim: b.anim, clip: b.clip, stopAnim: c.anim, stopClip: c.clip, coast: +Math.hypot(c.x - b.x, c.z - b.z).toFixed(0) };
        if (dist < 60 || Math.abs(W[k].moveErr) > 0.2 || Math.abs(W[k].faceErr) > 0.25) fail(`${dev} walk ${k}: ${JSON.stringify(W[k])}`);
      }
      ok(`${dev} walk 8 directions by touch stick: ` + Object.entries(W).map(([k, v]) => `${k} ${v.dist}px/face ${v.faceErr}`).join(' · ')); note('clips: ' + [...new Set(Object.values(W).map((v) => v.clip))].join(',') + ' stop: ' + [...new Set(Object.values(W).map((v) => v.stopClip))].join(','));
    }

    if (want('rev')) {
      const V = (D.rev = {});
      for (const [name, a, b] of [['RL', 'R', 'L'], ['UD', 'U', 'D'], ['LR', 'L', 'R'], ['DU', 'D', 'U']]) {
        await home(); await stick(a); await step(40); await stick(b);
        const seq = []; let prev = await step(0);
        for (let i = 0; i < 24; i++) { const s = await step(1); seq.push({ t: i + 1, face: +ang(s.fx, s.fz).toFixed(3), dir: +ang(s.dx, s.dz).toFixed(3), turn: +dAng(ang(s.fx, s.fz), ang(prev.fx, prev.fz)).toFixed(3), v: +Math.hypot(s.vx, s.vz).toFixed(0), vAng: +ang(s.vx, s.vz).toFixed(2), clip: s.clip, px: s.px, py: s.py }); prev = s; if ((name === 'RL' || name === 'UD') && i % 2 === 1 && i < 20) await shot(`rev_${name}_${String(i + 1).padStart(2, '0')}`); }
        await stickUp(); await step(10);
        const turns = seq.map((q) => q.turn).filter((t) => Math.abs(t) > 0.004), signs = new Set(turns.map((t) => Math.sign(t)));
        const done = seq.find((q) => Math.abs(dAng(q.face, ang(DIRS[b][0], -DIRS[b][1]))) < 0.12)?.t ?? -1;
        // sliding: ticks in which the body moves faster than 60 px/s in a direction more than 100 degrees away from where it faces
        const slide = seq.filter((q) => q.v > 60 && Math.abs(dAng(q.vAng, q.face)) > 1.75).length;
        V[name] = { done, maxTurn: +Math.max(0, ...turns.map(Math.abs)).toFixed(3), oneWay: signs.size <= 1, slideTicks: slide, clips: [...new Set(seq.map((q) => q.clip))], seq };
        if (done < 0 || done > 20 || !V[name].oneWay || V[name].maxTurn > 0.6) fail(`${dev} reversal ${name}: done ${done} ticks, one way ${V[name].oneWay}, max turn ${V[name].maxTurn}`);
      }
      ok(`${dev} stick reversals: ` + Object.entries(V).map(([k, v]) => `${k} faces in ${v.done} ticks, max ${v.maxTurn} rad/tick, ${v.oneWay ? 'one direction' : 'WOBBLE'}, moving-backwards ticks ${v.slideTicks}, clips ${v.clips.join('>')}`).join(' | '));
      // rapid alternation: 12 flips, 5 ticks each
      await home(); let prev = await step(0), wob = 0, maxT = 0; const x0 = prev.x, z0 = prev.z;
      for (let i = 0; i < 12; i++) { await stick(i % 2 ? 'L' : 'R'); let sg = 0; for (let t = 0; t < 5; t++) { const s = await step(1, t === 4), d = dAng(ang(s.fx, s.fz), ang(prev.fx, prev.fz)); maxT = Math.max(maxT, Math.abs(d)); if (Math.abs(d) > 0.004) { if (sg && Math.sign(d) !== sg) wob++; sg = Math.sign(d); } prev = s; } }
      await shot('rev_rapid'); await stickUp(); const e = await step(20);
      D.rapid = { wobbleFlips: wob, maxTurn: +maxT.toFixed(3), drift: +Math.hypot(e.x - x0, e.z - z0).toFixed(0), endAnim: e.anim, endClip: e.clip };
      (wob === 0 && maxT <= 0.6 ? ok : fail)(`${dev} rapid left/right 12 flips: direction changes inside a flip ${wob}, max turn ${D.rapid.maxTurn} rad/tick, drift ${D.rapid.drift}px, ends ${e.anim}/${e.clip}`);
    }

    if (want('atk')) {
      const A = (D.atk = {}), A0 = (D.atkFree = {});
      for (const k of Object.keys(DIRS)) {
        await home(); const u = DIRS[k], l = Math.hypot(u[0], u[1]), wx = u[0] / l, wz = -u[1] / l;
        await ev(([x, z]) => window.__cv.put('melee', x, z, false), [BASE[0] + wx * 66, BASE[1] + wz * 66]); await step(2);
        await stick(k); await step(7); await stickUp(); await step(1);
        await btnDown('attack'); await step(2); await btnUp('attack');
        const n = await until('(sim) => window.__cv.dmHp("melee") < 9999', 40), s = await step(0);
        await shot('atk_' + k);
        A[k] = { hitTick: n, move: s.move, clip: s.clip, dirErr: +dAng(ang(s.dx, s.dz), ang(wx, wz)).toFixed(2), faceErr: +dAng(ang(s.fx, s.fz), ang(wx, wz)).toFixed(2), stop: s.stop };
        if (n < 0 || Math.abs(A[k].faceErr) > 0.45) fail(`${dev} attack ${k} at a dummy 66px away: ${JSON.stringify(A[k])}`);
        await step(40);
      }
      ok(`${dev} attack in 8 directions hits a dummy placed that way: ` + Object.entries(A).map(([k, v]) => `${k} t${v.hitTick} face ${v.faceErr} stop ${v.stop}`).join(' · '));
      for (const k of ['R', 'U', 'L', 'D']) {   // no target: where does the swing go?
        await home(); const u = DIRS[k], wx = u[0], wz = -u[1];
        await stick(k); await step(7); await stickUp(); await step(1);
        await btnDown('attack'); await step(2); await btnUp('attack');
        const f = [];
        for (const t of [4, 8, 12, 16]) { const s = await step(4); f.push({ t: t + 2, clip: s.clip, faceErr: +dAng(ang(s.fx, s.fz), ang(wx, wz)).toFixed(2), px: s.px, py: s.py }); await shot(`atkfree_${k}_${String(t + 2).padStart(2, '0')}`); }
        A0[k] = f; if (f.some((q) => Math.abs(q.faceErr) > 0.3)) fail(`${dev} free attack ${k}: body turned away ${JSON.stringify(f.map((q) => q.faceErr))}`);
        await step(30);
      }
      ok(`${dev} free swings (no target) keep facing the stick direction: ` + Object.entries(A0).map(([k, v]) => `${k} ${v.map((q) => q.faceErr).join('/')}`).join(' · '));
    }

    if (want('combo')) {
      await home(); await ev(([x, z]) => window.__cv.put('melee', x, z, false), [BASE[0] + 70, BASE[1]]); await stick('R'); await step(5); await stickUp(); await step(1);
      const seq = [], moves = []; let hp = 9999, hits = 0, stops = [];
      for (let t = 0; t < 96; t++) {
        if (t % 10 === 0 && t < 60) await btnDown('attack'); if (t % 10 === 3 && t < 64) await btnUp('attack');
        const s = await step(1, t % 3 === 2); const h2 = await ev(() => window.__cv.dmHp('melee'));
        if (h2 < hp) { hits++; stops.push(s.stop); hp = h2; await step(0); await shot(`combo_hit${hits}`); }
        if (s.move && moves[moves.length - 1] !== s.move) moves.push(s.move);
        if (t % 3 === 2) { seq.push({ t, move: s.move, clip: s.clip, px: s.px, py: s.py }); await shot(`combo_${String(t).padStart(2, '0')}`); }
      }
      D.combo = { moves, hits, stops, damage: 9999 - hp, seq };
      (moves.join('>') === 'c1>c2>c3' && hits >= 3 ? ok : fail)(`${dev} three-hit combo by the attack button: moves ${moves.join('>')}, hits ${hits}, hit-stop ${stops.join('/')}, damage ${9999 - hp}`);
    }

    if (want('roll')) {
      await home(); const a = await step(0); await stick('R'); await step(6);
      await btnDown('dash'); const f = [];
      for (let t = 0; t < 36; t++) { const s = await step(1, t % 3 === 2); if (t === 2) await btnUp('dash'); if (t % 3 === 2) { f.push({ t, anim: s.anim, clip: s.clip, dashT: s.dashT, x: s.x, px: s.px, py: s.py }); if (t < 33) await shot(`roll_${String(t).padStart(2, '0')}`); } }
      await stickUp(); const b = await step(20);
      D.roll = { rolled: f.some((q) => q.dashT > 0), dist: +(b.x - a.x).toFixed(0), clips: [...new Set(f.map((q) => q.clip))], f };
      (D.roll.rolled ? ok : fail)(`${dev} roll (stick + roll button): rolled ${D.roll.rolled}, moved ${D.roll.dist}px, clips ${D.roll.clips.join('>')}`);
      // roll into walls: walk into the screen until blocked, then roll into the wall 6 times; same toward the camera
      const walls = {};
      for (const k of ['U', 'D', 'L']) {
        await home(); if (k === 'L') await ev(() => window.__cv.hero(140, 150)); await stick(k); let p = await step(90, false), q = await step(30, false);
        const blocked = Math.hypot(q.x - p.x, q.z - p.z) < 3; let worst = 0, bad = false;
        for (let i = 0; i < 6; i++) { await btnDown('dash'); await step(3, false); await btnUp('dash'); const s = await step(45, i === 5); worst = Math.max(worst, Math.hypot(s.x - q.x, s.z - q.z)); if (!Number.isFinite(s.x + s.y + s.z) || s.y < -60 || s.dead) bad = true; }
        await shot('rollwall_' + k); await stickUp(); const e = await step(10);
        walls[k] = { blocked, at: [q.x, q.y, q.z], pushedPast: +worst.toFixed(0), bad, end: [e.x, e.y, e.z], hp: e.hp, deaths: e.deaths };
        if (bad || worst > 60) fail(`${dev} roll into wall ${k}: ${JSON.stringify(walls[k])}`);
      }
      D.rollWalls = walls; ok(`${dev} rolling into walls: ` + Object.entries(walls).map(([k, v]) => `${k} blocked ${v.blocked} moved past ${v.pushedPast}px hp ${v.hp}`).join(' · '));
    }

    if (want('guard')) {
      await home(); await btnDown('dash'); const a = await step(30); await shot('guard_hold'); const b = await step(60); await btnUp('dash'); const c = await step(30);
      D.guard = { at30: [a.guard, a.anim, a.clip], at90: [b.guard, b.anim, b.clip], released: [c.guard, c.anim, c.clip], moved: +Math.hypot(b.x - BASE[0], b.z - BASE[1]).toFixed(0) };
      (a.guard && b.guard && !c.guard ? ok : fail)(`${dev} guard = roll button held without the stick: 0.5 s ${a.guard}/${a.clip}, 1.5 s ${b.guard}/${b.clip}, after release ${c.guard}/${c.clip}`);
    }

    if (want('parry')) {
      const P = (D.parry = []); let got = null, blocked = null;
      for (const thr of [0.8, 0.9, 0.65, 0.95, 0.5]) {
        await home(); await ev(([x, z]) => window.__cv.put('melee', x, z, true), [BASE[0] + 62, BASE[1]]);
        await stick('R'); await step(3); await stickUp();
        const n1 = await until(`(sim) => { const e = window.__cv.dm.melee; return e.atk && !e.atk.shot && e.tele >= ${thr}; }`, 400);
        if (n1 < 0) { P.push({ thr, windup: false }); continue; }
        await btnDown('dash');
        const n2 = await until('(sim) => { const h = sim.hero; return h.parryOk > 0 || h.blockT > 0 || h.hurtT > 0; }', 90), s = await step(0);
        const res = s.parryOk > 0 ? 'parry' : s.blockT > 0 ? 'block' : s.hurtT > 0 ? 'hurt' : 'none';
        await step(1); await shot(`parry_try_${String(thr).replace('.', '')}_${res}`);
        const e1 = await ev(() => { const e = window.__cv.dm.melee; return { state: e.state, stagger: e.stagger, stun: e.stun }; });
        await step(6); await shot(`parry_try_${String(thr).replace('.', '')}_${res}_b`); await btnUp('dash');
        P.push({ thr, waited: n1, after: n2, res, hp: s.hp, clip: s.clip, stop: s.stop, enemy: e1 });
        if (res === 'parry' && !got) { got = thr; } if (res === 'block' && !blocked) blocked = thr;
        if (got && blocked) break;
      }
      (got ? ok : fail)(`${dev} parry by pressing the roll button late in an enemy wind-up: ` + P.map((p) => `tele>=${p.thr}: ${p.res ?? 'no wind-up'}${p.enemy ? ' enemy ' + p.enemy.state : ''}`).join(' · '));
    }

    if (want('jump')) {
      await home(); const a = await step(0); await btnDown('jump'); const b = await step(3); await btnUp('jump'); const c = await step(6); await shot('jump_09'); const d = await step(8); await shot('jump_17'); const e = await step(40);
      D.jump = { before: [a.anim, a.clip, a.onGround, a.dashT, a.guard], t3: [b.anim, b.clip, b.onGround, b.y], t9: [c.anim, c.clip, c.onGround, c.y], t17: [d.anim, d.clip, d.onGround, d.y], end: [e.anim, e.clip, e.onGround, e.y] };
      (!c.onGround && c.y > a.y + 20 ? ok : fail)(`${dev} jump button standing still: ${JSON.stringify(D.jump)}`);
      // jump right after releasing the stick (the hero is still coasting)
      await home(); await stick('R'); await step(10); await stickUp(); await step(1); await btnDown('jump'); const b2 = await step(3); await btnUp('jump'); const c2 = await step(6); const e2 = await step(40);
      D.jumpCoast = { t3: [b2.anim, b2.clip, b2.onGround, b2.dashT, b2.guard], t9: [c2.anim, c2.clip, c2.onGround, c2.y] };
      (!c2.onGround ? ok : fail)(`${dev} jump button just after releasing the stick: ${JSON.stringify(D.jumpCoast)}`);
      // jump while running (stick held)
      await home(); await stick('R'); await step(10); await btnDown('jump'); const b3 = await step(3); await btnUp('jump'); const c3 = await step(6); await shot('jump_run_09'); await stickUp(); await step(40);
      D.jumpRun = { t3: [b3.anim, b3.clip, b3.onGround, b3.dashT, b3.guard], t9: [c3.anim, c3.clip, c3.onGround, c3.y] };
      (!c3.onGround ? ok : fail)(`${dev} jump button while running: ${JSON.stringify(D.jumpRun)}`);
    }

    if (want('plunge')) {
      await home(); await ev(([x, z]) => window.__cv.put('melee', x, z, false), [BASE[0] + 56, BASE[1]]); await stick('R'); await step(4); await stickUp(); await step(1);
      await btnDown('jump'); const j3 = await step(3); await btnUp('jump'); const up = await step(9); await shot('plunge_00_air'); D.plungeDbg = { t3: [j3.anim, j3.clip, j3.onGround, j3.dashT, j3.guard, j3.y], t12: [up.anim, up.clip, up.onGround, up.dashT, up.guard, up.y] };
      await btnDown('attack'); await step(2); await btnUp('attack'); const f = []; let landed = -1;
      for (let t = 0; t < 14; t++) { const s = await step(3); f.push({ t: t * 3, move: s.move, clip: s.clip, y: s.y, onGround: s.onGround, stop: s.stop }); await shot(`plunge_${String(t * 3 + 3).padStart(2, '0')}`); if (s.onGround && landed < 0) landed = t * 3; }
      const hp = await ev(() => window.__cv.dmHp('melee'));
      D.plunge = { air: !up.onGround, moves: [...new Set(f.map((q) => q.move))], clips: [...new Set(f.map((q) => q.clip))], landed, damage: 9999 - hp };
      (D.plunge.moves.includes('plunge') && hp < 9999 ? ok : fail)(`${dev} jump attack: in the air ${!up.onGround}, moves ${D.plunge.moves.join('>')}, clips ${D.plunge.clips.join('>')}, landed at tick ${landed}, damage ${9999 - hp}`);
    }

    if (want('bolt') && kinds.includes('ranged')) {
      await home(); await ev(([x, z]) => window.__cv.put('ranged', x, z, true), [BASE[0] + 250, BASE[1]]);
      const n1 = await until('(sim) => sim.shots.some((s) => !s.dead)', 600); await step(8); await shot('bolt_fly');
      const hp0 = (await step(0)).hp;
      const n2 = await until(`(sim) => sim.hero.hp < ${hp0}`, 240); const s = await step(0); await shot('bolt_hit_0'); await step(2); await shot('bolt_hit_2'); await step(4); await shot('bolt_hit_6');
      D.bolt = { castAfter: n1, hitAfter: n2, hp: s.hp, hurtT: s.hurtT, clip: s.clip, stop: s.stop };
      (n1 > 0 && n2 > 0 ? ok : fail)(`${dev} mage bolt: cast after ${n1} ticks, reached the hero after ${n2} more, hp ${hp0} > ${s.hp}, hero clip ${s.clip}`);
      // cut a bolt in flight with the blade / parry it back
      await home(); await ev(([x, z]) => window.__cv.put('ranged', x, z, true), [BASE[0] + 250, BASE[1]]);
      await until('(sim) => sim.shots.some((s) => !s.dead)', 600); await until('(sim) => sim.shots.some((s) => !s.dead && Math.hypot(s.x - sim.hero.x, s.z - sim.hero.z) < 70)', 240);
      await btnDown('dash'); const n3 = await until('(sim) => sim.hero.parryOk > 0 || sim.hero.hurtT > 0 || sim.hero.blockT > 0', 60), p = await step(1); await shot('bolt_parry'); await step(8); await shot('bolt_parry_b'); await btnUp('dash');
      D.boltParry = { after: n3, res: p.parryOk > 0 ? 'parry' : p.blockT > 0 ? 'block' : p.hurtT > 0 ? 'hurt' : 'none' }; note(`bolt met with guard at 70px: ${D.boltParry.res}`);
    }

    if (want('die')) {
      await home(); await ev(([x, z]) => { window.__cv.put('melee', x, z, true); window.__v2.scene.sim.hero.hp = 14; }, [BASE[0] + 60, BASE[1]]);
      const n1 = await until('(sim) => sim.hero.hurtT > 0', 600); const h1 = await step(1); await shot('hurt_0'); await step(5); await shot('hurt_6');
      await ev(() => { window.__v2.scene.sim.hero.hp = Math.min(window.__v2.scene.sim.hero.hp, 4); });
      const n2 = await until('(sim) => sim.hero.dead', 900); const d0 = await step(6); await shot('dead_06'); await step(40); await shot('dead_46'); await step(50); const d1 = await step(0); await shot('dead_96');
      const n3 = await until('(sim) => !sim.hero.dead && sim.hero.hp >= 100', 400); const r = await step(20); await shot('respawn');
      D.die = { hurtAfter: n1, hurtClip: h1.clip, hurtStop: h1.stop, deadAfter: n2, deadClip: d0.clip, deadClip2: d1.clip, respawnAfter: n3, hp: r.hp, at: [r.x, r.z], sec: r.sec, deaths: r.deaths, anim: r.anim };
      (n1 > 0 && n2 > 0 && n3 > 0 && r.hp === 100 ? ok : fail)(`${dev} hurt > death > restart: hurt clip ${h1.clip}, death clip ${d0.clip}, back after ${n3} ticks at ${r.x},${r.z} (${r.sec}) hp ${r.hp}, deaths ${r.deaths}`);
      await ev(() => window.__cv.clear());
    }

    // fights at the three spots with a small page-side bot (auto source), stills at the moment of a hit — same code for v2g and v2c
    const spots = async (tag) => {
      const out = {};
      for (const [name, sec, face] of [['street', 'street', null], ['alley', 'alley', 'U'], ['yard', 'yard', null]]) {
        await T.upAll();
        const st = await ev(([sec]) => {
          const g = window.__game, v = window.__v2, sim = v.scene.sim; sim.reset(); v.teleport(sec); v.scene.cam.snap = true;
          const B = (window.__sb = { act: {}, n: 0, hits: 0, hp: new Map() });
          g.input.setAutoSource(() => B.act);
          B.think = () => {
            const h = sim.hero, a = (B.act = {}); B.n++; if (h.dead) return;
            let tg = null, bd = 1e9; for (const e of sim.enemies) { if (e.dead || e.state === 'dead' || Math.abs(e.y - h.y) > 110) continue; const d = Math.hypot(e.x - h.x, e.z - h.z); if (d < bd && d < 700) { bd = d; tg = e; } }
            if (!tg) { a.up = sec !== 'street'; a.right = sec === 'street'; return; }
            const dx = tg.x - h.x, dz = tg.z - h.z;
            if (bd > 74) { if (dx > 12) a.right = true; else if (dx < -12) a.left = true; if (dz > 10) a.up = true; else if (dz < -10) a.down = true; }
            else { if (Math.abs(dx) > Math.abs(dz) * 0.5) { if (dx > 0) a.right = true; else a.left = true; } if (Math.abs(dz) > Math.abs(dx) * 0.5) { if (dz > 0) a.up = true; else a.down = true; } if (B.n % 9 < 2) a.attack = true; }
          };
          B.tick = () => { B.think(); g.tick(1 / 60); let hit = false; for (const e of sim.enemies) { const p = B.hp.get(e.id); if (p !== undefined && e.hp < p) hit = true; B.hp.set(e.id, e.hp); } return hit; };
          return { hero: [sim.hero.x, sim.hero.z], n: sim.enemies.length };
        }, [sec]);
        let shots = 0, ticks = 0, hits = 0, hurt = 0; await step(1);
        while (ticks < 1500 && shots < 4) {
          const r = await ev(() => { const B = window.__sb, g = window.__game, sim = window.__v2.scene.sim; let n = 0, hit = false, hp0 = sim.hero.hp; while (n < 240 && !hit) { hit = B.tick(); n++; } if (hit) { g.tick(1 / 60); B.think(); } g.render(); let near = 0; for (const e of sim.enemies) if (!e.dead && e.state !== 'dead' && Math.hypot(e.x - sim.hero.x, e.z - sim.hero.z) < 260) near++; return { n, hit, near, hurt: sim.hero.hp < hp0, dead: sim.hero.dead, dz: sim.hero.dirZ ?? 0 }; });
          ticks += r.n; if (r.hurt) hurt++;
          if (r.hit) { hits++; if ((name !== 'yard' || r.near >= 2 || hits > 6) && (name !== 'alley' || r.dz > 0.5 || hits > 5)) { shots++; await shot(`${tag}_${name}_${shots}`); await ev(() => window.__cv.step(3)); await shot(`${tag}_${name}_${shots}b`); } }
          if (r.dead) break;
        }
        out[name] = { ticks, hits, shots, hurt, start: st };
        await ev(() => { window.__game.input.setAutoSource(null); });
      }
      return out;
    };
    if (want('spots')) { D.spots = await spots('g'); ok(`${dev} v2g fights at street / alley / yard: ` + Object.entries(D.spots).map(([k, v]) => `${k} ${v.hits} hits in ${v.ticks} ticks, ${v.shots} stills`).join(' · ')); }
    D.statsG = await ev(() => { const s = window.__v2.stats; if (s?.assets) delete s.assets; return s; });

    // ───────── v2c (before) ─────────
    if (want('v2c') && dev === 'fold_open') {
      await T.upAll(); await open('v2c');
      D.spotsC = await spots('c'); ok(`${dev} v2c (before) fights: ` + Object.entries(D.spotsC).map(([k, v]) => `${k} ${v.hits} hits in ${v.ticks} ticks, ${v.shots} stills`).join(' · '));
      // roll (B: dash) and a mage bolt in v2c
      await ev(() => { const g = window.__game, v = window.__v2, sim = v.scene.sim; sim.reset(); for (const e of sim.enemies) if (!e.yard) e.dead = true; sim.hero.x = 470; sim.hero.z = 110; v.scene.cam.snap = true; window.__ca = {}; g.input.setAutoSource(() => window.__ca); });
      await step(10); await ev(() => { window.__ca = { right: true }; }); await step(8); await ev(() => { window.__ca = { right: true, dash: true }; }); await step(2); await ev(() => { window.__ca = { right: true }; });
      for (const t of [5, 11, 17]) { await step(t === 5 ? 3 : 6); await shot(`c_roll_${String(t).padStart(2, '0')}`); }
      // a mage bolt reaching the hero in v2c
      const cb = await ev(() => { const g = window.__game, v = window.__v2, sim = v.scene.sim; sim.reset(); window.__ca = {}; const m = sim.enemies.find((e) => e.kind === 'ranged'); if (!m) return { none: true }; sim.hero.x = m.x - 230; sim.hero.z = m.z; v.scene.cam.snap = true; let hp = sim.hero.hp, n = 0, fly = -1; for (; n < 1500; n++) { g.tick(1 / 60); sim.hero.x = m.x - 230; if (fly < 0 && sim.shots.some((q) => !q.dead)) fly = n; if (sim.hero.hp < hp) break; } g.render(); return { n, fly, hp0: hp, hp: sim.hero.hp }; });
      D.boltC = cb; await shot('c_bolt_hit_0'); await step(2); await shot('c_bolt_hit_2'); await step(4); await shot('c_bolt_hit_6'); note('v2c bolt: ' + JSON.stringify(cb));
      D.statsC = await ev(() => { const s = window.__v2.stats; if (s?.assets) delete s.assets; return s; });
    }
    D.errors = errs.slice(0, 20);
    (errs.length ? fail : ok)(`${dev} page errors ${errs.length}${errs.length ? ': ' + errs.slice(0, 4).join(' || ') : ''}`);
  } catch (e) { fail(`${dev}: script stopped: ${String(e?.stack ?? e).slice(0, 600)}`); D.errors = errs.slice(0, 20); if (errs.length) note('page errors: ' + errs.slice(0, 4).join(' || ')); }
  finally { await browser.close(); }
}

for (const dev of DEVICES) await run(dev);
srv.close();
fs.writeFileSync(`${OUT}/play_${DEVICES.join('_')}${ONLY ? '_' + ONLY.join('_') : ''}.json`, JSON.stringify(R, null, 1));
console.log(fails.length ? `\n${fails.length} FAIL` : '\nall ok');
process.exit(fails.length ? 1 : 0);
