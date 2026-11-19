// MAGIC lane — the LOOK of every magic moment of chapter 1, from the game camera, one contact sheet per moment.
//   node tools/v2/magic_look.mjs --tag before [--moments echo,lantern,...] [--device fold_open] [--res 0.5] [--tier mid] [--saves <dir of bot saves>] [--out /tmp/claude-0/v2/magic/look]
// A moment = a bot save (tools/v2/chapter_audit.mjs writes one after every story event) loaded by the game's own load, a setup that puts the hero and
// the enemy where the moment happens (NOT honest play: the hero is put, an enemy is set on a spot, the queen's attack is started by name, her health is
// set - the effect itself is the game's own: the rules ask for it through their hooks), then the game is advanced by rule ticks (g.tick(1/60)) and every
// tick is drawn by the tool (g.alpha = 1) = 60 samples a second. The sheet shows the samples of the moment's plan ([from, to, every] tick ranges) with
// the tick and its time in milliseconds after the trigger tick (t0). Marks drawn over a cell when the moment asks for them:
//   green ring on the floor = the radius the rules use (echo reach, lantern hold, the queen's hit shape) · red box = fx.protect spots
// Numbers per moment (magic.json): live particles / quads / meshes / lights at the worst sample, overdraw in screens (fx.measure), the mean brightness
// of every sample (0..255), flash peak. Writes <out>/<tag>_<moment>.png and <out>/<tag>.json. Exit 1 on a page error.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';
import { install as installW, argsOf } from './whip_lib.mjs';

const args = argsOf(process.argv), TAG = String(args.tag || 'now'), DEV = String(args.device || 'fold_open'), OUT = String(args.out || '/tmp/claude-0/v2/magic/look'), RES = String(args.res || '0.5');
const TIER = args.tier ? String(args.tier) : '', SAVES = String(args.saves || '/tmp/claude-0/v2/pre14/chapter/saves'), FIX = new URL('./fixtures/saves_apk14/', import.meta.url).pathname;
const T0 = Date.now(), log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const saveOf = (id) => { for (const d of [SAVES, FIX]) { if (!fs.existsSync(d)) continue; const f = fs.readdirSync(d).filter((x) => x.replace(/^\d+_/, '').replace(/\.json$/, '') === id).pop(); if (f) { const o = JSON.parse(fs.readFileSync(`${d}/${f}`, 'utf8')); return JSON.stringify(o.save ?? o); } } throw new Error('no save for ' + id); };

/** in the page: helpers of this tool (window.__M) on top of whip_lib's window.__W */
function install() {
  const v = window.__v2, g = window.__game, W = window.__W, M = (window.__M = { adv: 0 });
  W.drawEvery = 0; W.keepHp = true;
  M.sc = () => v.scene;
  M.queen = () => v.scene.sim?.enemies.find((x) => x.def?.boss && !x.dead && x.state !== 'dead') ?? null;
  M.idle = () => { const sc = v.scene, H = sc.host; return !!v.ready && !!sc.sim && !sc.hud.modal && !(H && (H.st.busy || H.locks())) && !sc._go && !sc.xing && sc.fadeA <= 0.01; };
  /** tick until the story lets go of the hero (dialogue pages are turned) */
  M.settle = (max = 900) => { let d = 0; for (let i = 0; i < max; i++) { const sc = v.scene; if (v.ready && sc.sim) { if (i > 8 && M.idle()) return true; if (sc.hud?.modal === 'dialog' && ++d >= 6) { d = 0; sc.hud.advanceDialog(); } } g.tick(1 / 60); } return false; };
  M.putY = (x, z, y) => { const sc = v.scene; sc._enterAt(null, { x, z, y }); sc.cam.snap = true; const h = sc.sim.hero; h._px = h.x; h._py = h.y; h._pz = h.z; return [Math.round(h.x), Math.round(h.z), Math.round(h.y)]; };
  /** a free spot `dist` away from (x, z): the first of eight directions the scene accepts */
  M.near = (x, z, y, dist) => { const sc = v.scene; for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 4 * (k % 2 ? 1 : -1), px = x + Math.cos(a) * dist, pz = z + Math.sin(a) * dist; if (sc._spotOk({ x: px, z: pz, y })) return [px, pz]; } return null; };
  M.face = (x, z) => { const sc = v.scene, h = sc.sim.hero, dx = x - h.x, dz = z - h.z, l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; if (h.wishX !== undefined) { h.wishX = h.dirX; h.wishZ = h.dirZ; } if (sc.heroA) { sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ; } };
  /** every enemy but the kept ones: asleep and far away */
  M.clear = (keep) => { for (const e of v.scene.sim.enemies) { if (keep && keep.includes(e)) continue; e.wakeBy = 'trigger'; e.active = false; e.state = 'idle'; e.atk = null; e.x = e.homeX = -99999; e.z = e.homeZ = -99999; e._px = e.x; e._pz = e.z; } };
  /** an enemy of a kind on a spot (taken from the area or added), asleep unless o.awake */
  M.enemy = (kind, x, z, o = {}) => { const e = W.enemy(kind, x, z, o); if (o.hidden) { e.revealT = 0; e.solidT = 0; e.alpha = e.def.fade ?? 1; e.solid = false; } return e; };
  M.press = (id, ticks) => { W.down(id); M._up = { id, at: ticks }; };
  /**
   * one moment: P = { n, plan: [[from, to, every], ...], t0, ring: [x, z, r] | null, steps: { tick: code } }. Draws every tick, puts the planned samples on the sheet.
   */
  M.run = (P) => {
    const sc = v.scene, fx = sc.fx, glc = sc.glr.canvas, hc = g.canvas, CW = 320, CH = Math.round((320 * g.viewH) / g.viewW), COLS = 8;
    const want = []; for (const [a, b, s] of P.plan) for (let i = a; i <= b && i < P.n; i += s) want.push(i);
    const cv = document.createElement('canvas'); cv.width = CW * COLS; cv.height = CH * Math.ceil(want.length / COLS); const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height);
    const sm = document.createElement('canvas'); sm.width = 64; sm.height = 48; const sx = sm.getContext('2d', { willReadFrequently: true });
    const rows = [], Q = {}; let cell = 0, worst = { particles: 0, quads: 0, meshes: 0, lights: 0, overdraw: 0, flash: 0, tick: 0 };
    const steps = P.steps || {};
    for (let i = 0; i < P.n; i++) {
      if (steps[i]) { try { (0, eval)(steps[i]); } catch (e) { rows.push({ tick: i, err: String(e) }); } }
      if (M._up && i >= M._up.at) { W.up(M._up.id); M._up = null; }
      const h = sc.sim?.hero; if (h && W.keepHp) h.hp = h.hpMax ?? h.hp;
      if (sc.hud?.modal === 'dialog' && P.turn && i % 8 === 7) sc.hud.advanceDialog();
      g.tick(1 / 60); g.alpha = 1; g.render();
      const f = v.scene.fx; let m = null; try { m = f ? f.measure() : null; } catch { m = null; }
      const fl = f ? f.feel.screen.flash[3] : 0;
      if (m) { if (m.overdraw > worst.overdraw) { worst.overdraw = +m.overdraw.toFixed(3); worst.tick = i; } worst.particles = Math.max(worst.particles, m.particles); worst.quads = Math.max(worst.quads, m.quads); worst.meshes = Math.max(worst.meshes, m.meshes); worst.lights = Math.max(worst.lights, m.lights); worst.flash = Math.max(worst.flash, +fl.toFixed(3)); }
      if (!want.includes(i)) continue;
      const X0 = (cell % COLS) * CW, Y0 = Math.floor(cell / COLS) * CH; cell++;
      cx.drawImage(v.scene.glr.canvas ?? glc, 0, 0, glc.width, glc.height, X0, Y0, CW, CH);
      if (!P.nohud) cx.drawImage(hc, 0, 0, hc.width, hc.height, X0, Y0, CW, CH);
      sx.drawImage(v.scene.glr.canvas ?? glc, 0, 0, 64, 48); const d = sx.getImageData(0, 0, 64, 48).data; let s = 0; for (let q = 0; q < d.length; q += 4) s += d[q] * 0.3 + d[q + 1] * 0.59 + d[q + 2] * 0.11;
      const k = CW / g.viewW, mark = P.ring ? (typeof P.ring === 'string' ? (0, eval)(P.ring) : P.ring) : null;
      if (mark) { cx.strokeStyle = 'rgba(80,255,120,0.9)'; cx.lineWidth = 1; cx.beginPath(); const [mx, mz, mr, my, a0, a1] = mark; const A0 = a0 ?? 0, A1 = a1 ?? Math.PI * 2;
        for (let j = 0; j <= 48; j++) { const a = A0 + ((A1 - A0) * j) / 48; v.scene.project(mx + Math.cos(a) * mr, my ?? (h ? h.y : 0), mz + Math.sin(a) * mr, Q); if (j === 0) cx.moveTo(X0 + Q.x * k, Y0 + Q.y * k); else cx.lineTo(X0 + Q.x * k, Y0 + Q.y * k); } cx.stroke(); }
      if (P.protect && f) { cx.strokeStyle = 'rgba(255,60,60,0.9)'; for (let j = 0; j < 4; j++) { const r = f.protect[j * 4 + 3]; if (!(r > 0)) continue; v.scene.project(f.protect[j * 4], f.protect[j * 4 + 1], f.protect[j * 4 + 2], Q); const rp = (r * v.scene.focal) / Math.max(1, Q.w) * k; cx.strokeRect(X0 + Q.x * k - rp, Y0 + Q.y * k - rp, rp * 2, rp * 2); } }
      const ms = Math.round(((i - (P.t0 ?? 0)) * 1000) / 60);
      cx.fillStyle = 'rgba(0,0,0,0.6)'; cx.fillRect(X0, Y0, 118, 15); cx.fillStyle = '#fff'; cx.font = '11px monospace'; cx.fillText(`t${i} ${ms >= 0 ? '+' : ''}${ms}ms`, X0 + 3, Y0 + 11);
      rows.push({ tick: i, ms, lum: +(s / (64 * 48)).toFixed(1), p: m ? m.particles : 0, od: m ? +m.overdraw.toFixed(2) : 0, flash: +fl.toFixed(2) });
    }
    return { png: cv.toDataURL('image/png'), cells: cell, rows, worst, area: v.area };
  };
}

const TAP = (id, at = 2, len = 4) => ({ [at]: `window.__M.press('${id}', ${at + len})` });
// each moment: save (story event id), pre (page code: returns a note or throws), n ticks, plan, t0 (the tick the effect is expected on), steps, ring (page code -> [x, z, r, y, a0, a1])
const MOMENTS = {
  echo: { what: 'THE ECHO at a hidden ghost (graveyard, after ev_echo_first)', save: 'ev_echo_first', n: 300, t0: 14, plan: [[8, 56, 2], [70, 290, 20]],
    pre: `const M = window.__M, sc = M.sc(), sim = sc.sim, h = sim.hero; const p = M.near(h.x, h.z, h.y, 0) || [h.x, h.z]; M.clear([]); const g1 = M.enemy('grave_ghost', h.x + 150, h.z + 40, { hidden: true }), g2 = M.enemy('grave_ghost', h.x - 120, h.z + 150, { hidden: true, fresh: true }); M.face(g1.x, g1.z); h.bellCd = 0; window.__mk = [h.x, h.z]; 'ghosts at 155 and 192 px'`,
    steps: TAP('bell'), ring: `[window.__mk[0], window.__mk[1], 260]` },
  echo_none: { what: 'THE ECHO that finds nothing', save: 'ev_echo_first', n: 80, t0: 14, plan: [[8, 70, 2]],
    pre: `const M = window.__M, sc = M.sc(), h = sc.sim.hero; M.clear([]); h.bellCd = 0; window.__mk = [h.x, h.z]; 'no ghost'`, steps: TAP('bell'), ring: `[window.__mk[0], window.__mk[1], 260]` },
  lantern: { what: "SERA'S LANTERN over two ghosts (ossuary, after ev_oss_sera)", save: 'ev_oss_sera', n: 400, t0: 21, plan: [[10, 72, 2], [90, 390, 20]],
    pre: `const M = window.__M, sc = M.sc(), sim = sc.sim, h = sim.hero; M.clear([]); if (!sim.caller) sim.setCaller('sera'); h.reso = h.resoMax; h.callCd = 0; const g1 = M.enemy('grave_ghost', h.x + 150, h.z + 30, { hidden: true, awake: true, cd: 9 }), g2 = M.enemy('grave_ghost', h.x + 40, h.z + 170, { hidden: true, fresh: true, awake: true, cd: 9 }); M.face(g1.x, g1.z); 'caller ' + sim.caller`,
    steps: TAP('skill'), ring: `(() => { const L = window.__M.sc().sim.lights[0]; return L ? [L.x, L.z, L.r, L.y] : null; })()` },
  knell_queen: { what: 'THE KNELL that sends the queen off (after ev_boss_kneel)', save: 'ev_boss_kneel', n: 330, t0: 68, plan: [[60, 300, 6]], turn: false,
    pre: `const M = window.__M, sc = M.sc(), sim = sc.sim, h = sim.hero, e = M.queen(); if (!e) throw new Error('no queen'); if (!e.active) sim.wake(e); e.fled = false; e.fleeHold = false; e.alpha = 1; e.hp = 1; for (let i = 0; i < 30; i++) window.__game.tick(1 / 60); M.settle(600); const p = M.near(e.x, e.z, h.y, 130); if (p) M.putY(p[0], p[1], h.y); M.face(e.x, e.z); h.bellCd = 0; for (let i = 0; i < 20; i++) window.__game.tick(1 / 60); 'kneel ' + e.kneel + ' dist ' + Math.round(Math.hypot(e.x - h.x, e.z - h.z))`,
    steps: { 2: `window.__M.press('bell', 75)` } },
  knell_post: { what: 'A KNELL HUNG on a bell post (ossuary_past, after ev_knell_take)', save: 'ev_knell_take', n: 150, t0: 6, plan: [[2, 60, 2], [70, 140, 10]], turn: true,
    pre: `const M = window.__M, sc = M.sc(), h = sc.sim.hero, d = sc.area.interact.find((q) => q.event === 'oss.knell'); if (!d) throw new Error('no knell post here: ' + sc.area.id); M.clear([]); const p = M.near(d.x, d.z, d.y ?? h.y, 50) || [d.x, d.z - 50]; M.putY(p[0], p[1], d.y ?? h.y); M.face(d.x, d.z); window.__post = d; 'post ' + d.id + ' at ' + [d.x, d.z]`,
    steps: { 4: `{ const sc = window.__M.sc(), d = window.__post; sc.emit('interact', { id: d.id, kind: d.kind, event: d.event ?? null, data: d.data ?? null, locked: d.locked ?? null, spot: d }); }` } },
  queen_sweep: { what: "THE QUEEN'S 울음 물결 (sweep; first act, after ev_boss_intro)", save: 'ev_boss_intro', n: 150, t0: 58, plan: [[4, 52, 6], [54, 100, 2], [104, 140, 6]], protect: true,
    pre: `const M = window.__M; await window.__M.queenAtk('Q_SWEEP', 150)`, steps: { 4: `window.__M.startAtk()` },
    ring: `(() => { const e = window.__M.queen(); if (!e) return null; const a = Math.atan2(e.dirZ, e.dirX), d = (105 * Math.PI) / 180; return [e.x, e.z, 205, e.gy, a - d, a + d]; })()` },
  queen_scream: { what: "THE QUEEN'S 비명 (scream, cannot be guarded)", save: 'ev_boss_intro', n: 170, t0: 73, plan: [[4, 66, 8], [68, 116, 2], [120, 160, 8]], protect: true,
    pre: `const M = window.__M; await window.__M.queenAtk('Q_SCREAM', 170)`, steps: { 4: `window.__M.startAtk()` },
    ring: `(() => { const e = window.__M.queen(); return e ? [e.x, e.z, 235, e.gy] : null; })()` },
  queen_wail: { what: "THE QUEEN'S 울음 탄 (three shots)", save: 'ev_boss_intro', n: 170, t0: 49, plan: [[4, 44, 8], [46, 150, 4]], protect: true,
    pre: `const M = window.__M; await window.__M.queenAtk('Q_WAIL', 330)`, steps: { 4: `window.__M.startAtk()` } },
  queen_flee: { what: "THE QUEEN'S FLIGHT into 1697 (half health)", save: 'ev_boss_intro', n: 200, t0: 6, plan: [[2, 190, 6]],
    pre: `const M = window.__M; await window.__M.queenAtk('Q_SWEEP', 200)`, steps: { 4: `{ const e = window.__M.queen(); e.cd = 9; e.hp = Math.floor(e.def.hp * e.def.phaseAt) - 1; }` } },
  queen_kneel: { what: 'HER SONG IS BROKEN: the kneel (second act tonight)', save: 'ev_boss_kneel', n: 120, t0: 30, plan: [[4, 110, 4]], protect: true,
    pre: `const M = window.__M, sc = M.sc(), sim = sc.sim, h = sim.hero, e = M.queen(); if (!e) throw new Error('no queen'); if (!e.active) sim.wake(e); e.fled = false; e.fleeHold = false; e.alpha = 1; e.kneel = 0; e.hp = 200; e.bphase = 2; const p = M.near(e.x, e.z, h.y, 170); if (p) M.putY(p[0], p[1], h.y); M.face(e.x, e.z); for (let i = 0; i < 20; i++) window.__game.tick(1 / 60); const { ATTACKS } = await import('/src/v2/play/enemies.js'); window.__atk = ATTACKS.Q_SONG; 'song then kneel'`,
    steps: { 4: `window.__M.startAtk()`, 30: `{ const e = window.__M.queen(); e.hp = 1; }` } },
  mage: { what: "THE SKELETON MAGE'S SHOT: cast, flight, impact on the hero", save: 'ev_oss_arena', n: 200, t0: 50, plan: [[4, 196, 6]], protect: true,
    pre: `const M = window.__M, sc = M.sc(), sim = sc.sim, h = sim.hero; M.clear([]); const p = M.near(h.x, h.z, h.y, 300) || [h.x + 300, h.z]; const e = M.enemy('skeleton_mage', p[0], p[1], { awake: true, cd: 0.05 }); window.__W.keepHp = true; M.face(e.x, e.z); 'mage at ' + Math.round(Math.hypot(e.x - h.x, e.z - h.z))` },
  deaths: { what: 'DEATHS: skeleton soldier, plague corpse, ghost, armor, bat, mage - felled one after another (0.9 s apart)', save: 'ev_oss_arena', n: 420, t0: 6, plan: [[6, 414, 8]],
    pre: `const M = window.__M, sc = M.sc(), sim = sc.sim, h = sim.hero; M.clear([]); const K = ['skeleton_soldier', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat', 'skeleton_mage']; window.__dead = K.map((k, i) => { const a = -2.4 + i * 0.75, e = M.enemy(k, h.x + Math.cos(a) * 190, h.z + 120 + Math.sin(a) * 120, { fresh: true, hp: 5 }); return e; }); 'six kinds in a fan'`,
    steps: Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [6 + i * 54, `{ const sim = window.__M.sc().sim, e = window.__dead[${i}], h = sim.hero; e.hp = 0; try { sim.hooks.hit?.(e, 12, { id: 'sw3', strength: 'H' }, e.x, e.y + 60, e.z, {}); } catch {} sim._kill(e); }`])) },
  ghost: { what: 'A GHOST APPEARS (the wind-up of its swoop) and fades again', save: 'ev_echo_first', n: 220, t0: 20, plan: [[10, 210, 6]], protect: true,
    pre: `const M = window.__M, sc = M.sc(), sim = sc.sim, h = sim.hero; M.clear([]); const e = M.enemy('grave_ghost', h.x + 140, h.z + 30, { hidden: true, awake: true, cd: 0.15 }); e.revealT = 0; M.face(e.x, e.z); 'ghost awake'` },
  parry: { what: 'A PERFECT PARRY (the slash of a soldier)', save: 'ev_oss_arena', n: 110, t0: 30, plan: [[20, 80, 2]], protect: true,
    pre: `const M = window.__M, sc = M.sc(), sim = sc.sim, h = sim.hero; M.clear([]); const e = M.enemy('skeleton_soldier', h.x + 70, h.z, { awake: true, cd: 0.05, fresh: true }); M.face(e.x, e.z); window.__pe = e; 'soldier at 70'`,
    steps: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [i + 4, `{ const e = window.__pe; if (!window.__pd && e.state === 'attack' && e.atk && e.stateT >= e.atk.windup - 0.07) { window.__pd = 1; window.__M.press('roll', ${i + 4 + 30}); } }`])) },
  ending: { what: "THE ENDING'S RING over the roofs (ev_ending_home, camera ring_widen)", save: 'ev_keepers', n: 300, t0: 0, plan: [[0, 290, 10]], nohud: false, turn: true,
    pre: `const M = window.__M, sc = M.sc(), d = sc.area.interact.find((q) => q.id === 'big_bell'); if (!d) throw new Error('no big bell in ' + sc.area.id); M.putY(d.x - 70, d.z - 6, d.y ?? 0); for (let i = 0; i < 20; i++) window.__game.tick(1 / 60); sc.emit('interact', { id: d.id, kind: d.kind, event: d.event ?? null, data: d.data ?? null, locked: d.locked ?? null, spot: d, ring: true }); const SH = (await import('/src/v2/game/storyhost.js')).SHOTS; let ok = false; for (let i = 0; i < 9000 && !ok; i++) { const s = M.sc(); if (s.host?.shot === SH.ring_widen) { ok = true; break; } if (s.hud?.modal === 'dialog' && i % 6 === 5) s.hud.advanceDialog(); window.__game.tick(1 / 60); if (i % 400 === 399) await new Promise((r) => setTimeout(r, 30)); } if (!ok) throw new Error('camera ring_widen not reached'); 'at ring_widen in ' + window.__v2.area` },
};

fs.mkdirSync(OUT, { recursive: true });
const port = 8950 + Math.floor(Math.random() * 600), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = [], all = fs.existsSync(`${OUT}/${TAG}.json`) ? JSON.parse(fs.readFileSync(`${OUT}/${TAG}.json`, 'utf8')) : {};
const LIST = args.moments ? String(args.moments).split(',') : Object.keys(MOMENTS);
let ctx = null, lastSave = null;
try {
  for (const id of LIST) {
    const S = MOMENTS[id]; if (!S) { log(`${id}: unknown moment`); continue; }
    if (ctx) await ctx.close();
    ctx = await browser.newContext({ ...contextOptions(DEV) }); const page = await ctx.newPage(); lastSave = S.save;
    page.on('pageerror', (e) => errs.push(`[${id}] ${String(e).slice(0, 300)}`));
    await page.addInitScript((s) => { try { if (window.top !== window) return; if (sessionStorage.getItem('__ml_seeded')) return; sessionStorage.setItem('__ml_seeded', '1'); localStorage.setItem('bn.v2.save', s); } catch { /* storage */ } }, saveOf(S.save));
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=${RES}${TIER ? '&v2tier=' + TIER : ''}`);
    await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
    await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 30000 }).catch(() => {});
    try { const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page); await ensureTouchMode(T, page); await page.waitForTimeout(300); } catch (e) { log('touch mode: ' + String(e).slice(0, 100)); }
    await page.evaluate(installW); await page.evaluate(install);
    await page.evaluate(() => {   // the queen: an attack by name with the hero `dist` away, in front of her
      const M = window.__M;
      M.queenAtk = async (name, dist) => { const sc = M.sc(), sim = sc.sim, h = sim.hero, e = M.queen(); if (!e) throw new Error('no queen in ' + window.__v2.area); const { ATTACKS } = await import('/src/v2/play/enemies.js'); window.__atk = ATTACKS[name];
        if (!e.active) sim.wake(e); e.cd = 99; M.settle(600); const p = M.near(e.x, e.z, h.y, dist); if (p) M.putY(p[0], p[1], h.y); M.face(e.x, e.z); for (let i = 0; i < 24; i++) { e.cd = 99; window.__game.tick(1 / 60); } return name + ' from ' + Math.round(Math.hypot(e.x - h.x, e.z - h.z)) + ' px, queen hp ' + Math.round(e.hp); };
      M.startAtk = () => { const sim = M.sc().sim, e = M.queen(), h = sim.hero, dx = h.x - e.x, dz = h.z - e.z, l = Math.hypot(dx, dz) || 1; e.dirX = dx / l; e.dirZ = dz / l; e.cd = 0; e.lastAtk = window.__atk.id; sim.startAttack(e, window.__atk); };
    });
    const ok = await page.evaluate(() => window.__M.settle(1500));
    let note = '';
    try { note = await page.evaluate(`(async () => { ${S.pre.replace(/;\s*('[^']*'|[^;]+)$/, '; return $1')} })()`); } catch (e) { log(`${id}: setup failed - ${String(e.message).slice(0, 200)}`); all[id] = { skip: String(e.message).slice(0, 200) }; continue; }
    const r = await page.evaluate((P) => window.__M.run(P), { n: S.n, plan: S.plan, t0: S.t0, steps: S.steps ?? {}, ring: S.ring ?? null, protect: !!S.protect, nohud: !!S.nohud, turn: !!S.turn });
    fs.writeFileSync(`${OUT}/${TAG}_${id}.png`, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png;
    const lum = r.rows.filter((q) => q.lum != null).map((q) => q.lum);
    all[id] = { what: S.what, save: S.save, settled: ok, note, device: DEV, tier: TIER || 'default', ...r, lumMin: Math.min(...lum), lumMax: Math.max(...lum) };
    log(`${id.padEnd(12)} ${r.area} · ${note} · ${r.cells} cells · worst: ${r.worst.particles} particles, ${r.worst.quads} quads, ${r.worst.meshes} meshes, ${r.worst.lights} lights, overdraw ${r.worst.overdraw} screens (t${r.worst.tick}), flash ${r.worst.flash} · brightness ${Math.min(...lum)}..${Math.max(...lum)}`);
    fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(all, null, 1));
  }
} catch (e) { errs.push('[tool] ' + (e?.stack ?? e)); }
if (ctx) await ctx.close();
await browser.close(); srv.close?.();
for (const e of errs) console.log('ERR ' + e);
console.log(errs.length ? `FAILED: ${errs.length} errors` : 'ALL OK');
process.exit(errs.length ? 1 : 0);
