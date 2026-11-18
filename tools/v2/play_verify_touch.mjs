// PLAY2-VERIFY: scene v2g driven by trusted touches (CDP) on the real pad, tick-stepped. Measures turning per tick and tries every move.
//   node tools/v2/play_verify_touch.mjs [--devices fold_open,phone2] [--out /tmp/claude-0/v2/play2verify] [--only turn,slip,moves,break,boss] [--strips 1]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(','), OUT = String(args.out || '/tmp/claude-0/v2/play2verify');
const ONLY = args.only ? String(args.only).split(',') : null, want = (k) => !ONLY || ONLY.includes(k);
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const R = { devices: {} }, fails = [];
const fail = (m) => { fails.push(m); console.log('  FAIL ' + m); }, ok = (m) => console.log('  ok   ' + m), note = (m) => console.log('       ' + m);
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const DIRS = { R: [1, 0], UR: [1, -1], U: [0, -1], UL: [-1, -1], L: [-1, 0], DL: [-1, 1], D: [0, 1], DR: [1, 1] };   // screen (x right, y down); up on screen = into the screen (+z)
const DEG = 180 / Math.PI, ang = (x, z) => Math.atan2(z, x), dAng = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const world = (k) => { const [x, y] = DIRS[k], l = Math.hypot(x, y); return [x / l, -y / l]; };

function install() {
  const g = window.__game; g._pageHidden = true;
  const sc = window.__v2.scene, U = 58, r3 = (n) => +(Number(n) || 0).toFixed(3);
  const P = (window.__pv = {
    n: 0, ev: [], dm: {},
    hookEvents() { const sim = sc.sim, H = sim.hooks; if (H.__pv) return; const old = H.event; H.__pv = true; H.event = function (name, a, b, c) { const s = [a, b, c].map((v) => (typeof v === 'string' ? v : v && typeof v.id === 'string' ? v.id : '')).filter(Boolean).join(':'); if (name !== 'step' && name !== 'shake') P.ev.push([P.n, name, s]); return old ? old.apply(this, arguments) : undefined; }; },
    foot(k) { const ch = sc.heroA, h = sc.sim.hero; try { const W = ch.rig.boneWorld(k); return [r3(h.x + (ch.dx * W[14] - ch.dz * W[12]) * U), r3(W[13]), r3(h.z + (ch.dz * W[14] + ch.dx * W[12]) * U)]; } catch { return null; } },
    samp(feet) {
      const sim = sc.sim, h = sim.hero, a = sc.heroA;
      const o = { n: P.n, x: r3(h.x), y: r3(h.y), z: r3(h.z), vx: r3(h.vx), vz: r3(h.vz), dx: r3(h.dirX), dz: r3(h.dirZ), fx: r3(a?.dx), fz: r3(a?.dz), anim: h.anim, clip: a?.anim?.cur?.name ?? '', pivot: h.pivot, mv: h.move?.id ?? null, mt: r3(h.moveT), dashT: r3(h.dashT), guard: !!h.guard, act: h.act, charging: !!h.charging, charge: r3(h.charge), hurtT: r3(h.hurtT), og: !!h.onGround, lock: h.lock, hp: h.hp, dead: !!h.dead, bc: r3(h.bellCharge), reso: r3(h.reso), mode: h.gaitMode, parryOk: r3(h.parryOk), blockT: r3(h.blockT), sm: h.skillMode };
      if (feet) { o.fl = P.foot('footL'); o.fr = P.foot('footR'); }
      return o;
    },
    step(n, each, feet) { const out = []; for (let i = 0; i < n; i++) { g.tick(1 / 60); P.n++; if (each) g.render(); out.push(P.samp(feet)); } if (!each) g.render(); return out; },
    until(src, n) { const fn = (0, eval)(src), sim = sc.sim; for (let i = 0; i < n; i++) { g.tick(1 / 60); P.n++; if (fn(sim)) { g.render(); return i + 1; } } g.render(); return -1; },
    css() { const h = sc.sim.hero, p = window.__v2.project(h.x, h.y + 50, h.z), r = g.canvas.getBoundingClientRect(); return [r.left + p.x / g.viewW * r.width, r.top + p.y / g.viewH * r.height]; },
    hero(x, z) { const sim = sc.sim, h = sim.hero; h.x = x; h.z = z; h.y = sim.w.ground(x, z); h.vx = h.vz = h.vy = 0; h.onGround = true; h.move = null; h.dashT = 0; h.hurtT = 0; h.guard = false; h.hp = h.hpMax; h.dead = false; h.ifr = 0; h.act = null; h.charging = false; h.bellDown = false; h.bellCd = 0; h.callCd = 0; h.rollCd = 0; h.pivot = 0; h.dirX = 1; h.dirZ = 0; h.safe.x = x; h.safe.z = z; h.safe.y = h.y; sc.cam.snap = true; },
    clear() { const sim = sc.sim; P.dm = {}; for (const e of sim.enemies) { if (e.yard) continue; const k = e.def?.attacks?.[0]?.shot || /mage/.test(e.def?.model ?? '') ? 'ranged' : 'melee'; if (!P.dm[k]) { P.dm[k] = e; P.park(k); } else e.dead = true; } return Object.keys(P.dm); },
    park(k) { const e = P.dm[k]; if (!e) return; e.x = 330; e.z = 120; e.y = e.gy = sc.sim.w.ground(330, 120); e.active = false; e.state = 'idle'; e.stateT = 0; e.atk = null; e.phase = null; e.tele = 0; e.hp = e.hpMax = 9999; e.stun = 0; e.stagger = 0; e.wakeBy = 'trigger'; e.kx = e.kz = 0; },
    put(k, x, z, active) { const sim = sc.sim, e = P.dm[k]; if (!e) return null; e.x = x; e.z = z; e.gy = sim.w.ground(x, z); e.y = e.gy + (e.hover ?? 0); e.hp = e.hpMax = 9999; e.stun = 0; e.stagger = 0; e.atk = null; e.phase = null; e.tele = 0; e.cd = active ? 0.15 : 9; e.active = !!active; e.state = active ? 'chase' : 'idle'; e.stateT = 0; e.kx = e.kz = 0; return e.id; },
  });
  P.hookEvents();
  return { mode: g.input?.mode, caps: { ...(sc._caps ?? {}) }, simCaps: { ...(sc.sim.caps ?? {}) }, hud: window.__v2.stats.hud };
}

/** per-tick numbers from a run of samples (S[0] = the tick before) */
function an(S) {
  let maxAng = 0, back = 0, side = 0, maxTurn = 0, vmax = 0, minV = 1e9, maxRuleFace = 0; const rows = [];
  for (let i = 1; i < S.length; i++) {
    const a = S[i - 1], b = S[i], vx = (b.x - a.x) * 60, vz = (b.z - a.z) * 60, sp = Math.hypot(vx, vz), fa = ang(b.fx, b.fz), d = sp > 1 ? Math.abs(dAng(ang(vx, vz), fa)) * DEG : 0, turn = Math.abs(dAng(fa, ang(a.fx, a.fz))) * DEG;
    vmax = Math.max(vmax, sp); minV = Math.min(minV, sp); maxTurn = Math.max(maxTurn, turn); maxRuleFace = Math.max(maxRuleFace, Math.abs(dAng(fa, ang(b.dx, b.dz))) * DEG);
    if (sp > 82) { maxAng = Math.max(maxAng, d); if (d > 35) side++; } if (sp > 40 && d > 100) back++;
    rows.push({ n: b.n, sp: +sp.toFixed(0), d: +d.toFixed(1), turn: +turn.toFixed(1), anim: b.anim, clip: b.clip });
  }
  return { maxAng: +maxAng.toFixed(1), sideTicks: side, backTicks: back, maxTurn: +maxTurn.toFixed(1), vmax: +vmax.toFixed(0), minV: +minV.toFixed(0), ruleVsDrawn: +maxRuleFace.toFixed(1), rows };
}
/** foot slip: mean ground speed of a planted foot / body speed */
function slip(S) {
  let floor = 1e9; for (const s of S) for (const f of [s.fl, s.fr]) if (f) floor = Math.min(floor, f[1]);
  let sum = 0, n = 0, body = 0, bn = 0;
  for (let i = 1; i < S.length; i++) { const a = S[i - 1], b = S[i]; body += Math.hypot(b.x - a.x, b.z - a.z) * 60; bn++; for (const k of ['fl', 'fr']) { const p = a[k], q = b[k]; if (!p || !q) continue; if (p[1] < floor + 0.035 && q[1] < floor + 0.035) { sum += Math.hypot(q[0] - p[0], q[2] - p[2]) * 60; n++; } } }
  return { slipPx: n ? +(sum / n).toFixed(0) : -1, body: bn ? +(body / bn).toFixed(0) : 0, pct: n && body ? Math.round((sum / n) / (body / bn) * 100) : -1, contacts: n };
}

async function run(dev) {
  const D = (R.devices[dev] = {}), dir = `${OUT}/${dev}`; fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS }), errs = [];
  try {
    const ctx = await browser.newContext(contextOptions(dev)), page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
    await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=slice0&v2auto=0&v2aa=0&v2res=0.5612`);
    await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 });
    const ev = (fn, a) => page.evaluate(fn, a);
    const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page), vp = contextOptions(dev).viewport, SX = Math.round(vp.width * 0.2), SY = Math.round(vp.height * 0.68);
    await ev(() => { window.__game._pageHidden = true; });
    await T.tap(Math.round(vp.width * 0.5), Math.round(vp.height * 0.3), 40);
    await ev(() => { const g = window.__game; for (let i = 0; i < 6; i++) g.tick(1 / 60); g.render(); });
    await page.waitForFunction(() => window.__v2.stats.hud === 'ui', null, { timeout: 10000 }).catch(() => {});
    const info = await ev(install);
    const step = (n, each = false, feet = false) => ev(([n, e, f]) => window.__pv.step(n, e, f), [n, each, feet]);
    const until = (src, n) => ev(([s, n]) => window.__pv.until(s, n), [src, n]);
    const evs = (from) => ev((f) => window.__pv.ev.filter((e) => e[0] > f), from);
    const now = () => ev(() => window.__pv.n);
    const pad = await ev(() => { const m = window.__v2?.scene?.hud?.metrics?.(); if (!m?.pad?.buttons?.length) return null; const B = {}; for (const b of m.pad.buttons) B[b.id] = { cx: b.cx, cy: b.cy, d: b.d, label: b.label, disabled: b.disabled }; return { B, shown: m.pad.shown, stick: m.pad.stick }; });
    D.info = info; D.pad = pad ? Object.fromEntries(Object.entries(pad.B).map(([k, b]) => [k, `${Math.round(b.cx)},${Math.round(b.cy)} d${Math.round(b.d)}${b.disabled ? ' off' : ''}`])) : null;
    console.log(`[${dev}] ready · input ${info.mode} · hud ${info.hud} · scene caps ${JSON.stringify(info.caps)} · pad ${pad ? JSON.stringify(D.pad) : 'NONE (new pad metrics missing)'}`);
    if (!pad) { fail(`${dev}: scene.hud.metrics().pad has no buttons — cannot press the real pad`); return; }
    const FID = { attack: 11, jump: 12, roll: 13, skill: 14, bell: 15, lock: 16 };
    const down = (id) => T.down(FID[id], pad.B[id].cx, pad.B[id].cy), up = (id) => T.up(FID[id]);
    const tap = async (id, ticks = 3) => { await down(id); const s = await step(ticks); await up(id); return s; };
    const stick = async (d, mag = 52) => { const [dx, dy] = typeof d === 'string' ? DIRS[d] : d, l = Math.hypot(dx, dy) || 1; if (!T.active.has(21)) { await T.down(21, SX, SY); await T.move(21, SX + dx / l * mag * 0.5, SY + dy / l * mag * 0.5); } await T.move(21, SX + dx / l * mag, SY + dy / l * mag); };
    const stickUp = () => T.up(21);
    const kinds = await ev(() => window.__pv.clear());
    // a flat open spot
    const pick = await ev(() => { const w = window.__v2.scene.sim.w, out = []; for (const [x, z] of [[900, 190], [470, 110], [1130, 140], [1260, 120], [1420, 150], [2190, 900], [2190, 1250]]) { const g0 = w.ground(x, z); let flat = Number.isFinite(g0); for (let a = 0; a < 8 && flat; a++) for (const r of [60, 120, 180]) if (w.ground(x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r) !== g0) flat = false; out.push([x, z, flat]); } return out; });
    const BASE = (pick.find((q) => q[2]) ?? pick[0]).slice(0, 2); D.base = BASE; note(`test spot ${BASE} · dummies ${kinds.join(' ')}`);
    const home = async () => { await T.upAll(); await ev((b) => { window.__pv.hero(b[0], b[1]); window.__pv.park('melee'); window.__pv.park('ranged'); const s = window.__v2.scene.sim; s.shots.length = 0; s.lights.length = 0; }, BASE); await step(16); };
    const frames = {};   // name → [{ file, cx, cy, n }]
    const shot = async (set, n) => { if (!args.strips && dev !== 'fold_open') return; const [cx, cy] = await ev(() => window.__pv.css()); const file = `${dir}/f_${set}_${String(n).padStart(3, '0')}.jpg`; await page.screenshot({ path: file, type: 'jpeg', quality: 82, scale: 'css' }); (frames[set] ??= []).push({ file, cx, cy, n }); };
    /** run k ticks one at a time, a frame every `every` ticks */
    const film = async (set, k, every, pre) => { const S = []; for (let i = 0; i < k; i++) { if (pre) await pre(i); const s = (await step(1, true))[0]; S.push(s); if (every && i % every === 0) await shot(set, i); } return S; };

    if (want('turn')) {
      const V = (D.turn = {});
      // reversals on four axes
      for (const [a, b] of [['R', 'L'], ['U', 'D'], ['UR', 'DL'], ['UL', 'DR']]) {
        await home(); await stick(a); const pre = await step(45); await stick(b);
        const S = [pre[pre.length - 1], ...(await film(`rev_${a}_${b}`, 26, 2))]; await stickUp(); await step(12);
        const A = an(S), w = world(b), vm = Math.hypot(w[0] * 275, w[1] * 208); let t70 = -1; for (let i = 1; i < S.length; i++) { const vx = (S[i].x - S[i - 1].x) * 60, vz = (S[i].z - S[i - 1].z) * 60; if (vx * w[0] + vz * w[1] >= vm * 0.7) { t70 = i; break; } }
        V[`rev ${a}>${b}`] = { ...A, t70, clips: [...new Set(S.map((s) => s.clip))].join('>'), rows: undefined, seq: A.rows.map((r) => `${r.sp}/${r.d}`).join(' ') };
      }
      // 90-degree turns
      for (const [a, b] of [['R', 'U'], ['U', 'L'], ['L', 'D'], ['D', 'R']]) { await home(); await stick(a); const pre = await step(45); await stick(b); const S = [pre[pre.length - 1], ...(await step(26, true))]; await stickUp(); await step(10); const A = an(S); V[`turn90 ${a}>${b}`] = { ...A, rows: undefined }; }
      // 12 rapid flips, 8 ticks each (0.13 s)
      { await home(); await stick('R'); const pre = await step(30); const S = [pre[pre.length - 1]]; for (let i = 0; i < 12; i++) { await stick(i % 2 ? 'R' : 'L'); S.push(...(await film('flips', 8, i < 4 ? 2 : 0))); } await stickUp(); await step(12); V['flips 12 x 0.13 s'] = { ...an(S), rows: undefined, clips: [...new Set(S.map((s) => s.clip))].join('>') }; }
      // circles: slow (one lap in 2 s) and fast (one lap in 0.6 s), two laps each
      for (const [nm, lap] of [['circle slow', 120], ['circle fast', 36]]) { await home(); await stick('R'); const pre = await step(30); const S = [pre[pre.length - 1], ...(await film(nm.replace(' ', '_'), lap * 2, nm === 'circle fast' ? 3 : 0, (i) => stick([Math.cos(i / lap * 2 * Math.PI), Math.sin(i / lap * 2 * Math.PI)])))]; await stickUp(); await step(12); V[nm] = { ...an(S), rows: undefined }; }
      // turn while attacking: run right, flip the stick to the left and press attack on the same tick
      for (const [a, b] of [['R', 'L'], ['U', 'D'], ['R', 'U'], ['L', 'DR']]) {
        await home(); await stick(a); const pre = await step(40); await stick(b); await down('attack'); const S = [pre[pre.length - 1], ...(await film(`atkturn_${a}_${b}`, 30, 2, async (i) => { if (i === 3) await up('attack'); }))]; await stickUp(); await step(20);
        const w = world(b), hit = S.filter((s) => s.mv && s.mt >= 0.13 && s.mt <= 0.27), off = hit.length ? Math.max(...hit.map((s) => Math.abs(dAng(ang(s.fx, s.fz), ang(w[0], w[1]))) * DEG)) : -1, A = an(S);
        V[`attack + turn ${a}>${b}`] = { move: [...new Set(S.map((s) => s.mv).filter(Boolean))].join(','), bodyOffStickDuringHit: +off.toFixed(1), ruleOffStick: hit.length ? +(Math.abs(dAng(ang(hit[0].dx, hit[0].dz), ang(w[0], w[1]))) * DEG).toFixed(1) : -1, maxTurnPerTick: A.maxTurn, backTicks: A.backTicks, sideTicks: A.sideTicks };
      }
      // turn right after a roll
      for (const [a, b] of [['R', 'L'], ['U', 'D'], ['R', 'D']]) {
        await home(); await stick(a); await step(30); await down('roll'); await step(2); await up('roll'); const n0 = await until('(s)=>s.hero.dashT<=0.05', 40); await stick(b);
        const p0 = (await step(0, false)) ?? []; const first = await ev(() => window.__pv.samp()); const S = [first, ...(await film(`rollturn_${a}_${b}`, 26, 2))]; await stickUp(); await step(12);
        V[`roll then turn ${a}>${b}`] = { ...an(S), rows: undefined, rollTicks: n0, clips: [...new Set(S.map((s) => s.clip))].join('>') };
      }
      for (const [k, v] of Object.entries(V)) { const bad = (v.backTicks > 0 || v.sideTicks > 0 || (v.maxAng ?? 0) > 35); (bad ? fail : ok)(`${dev} ${k}: ` + JSON.stringify(v)); }
    }

    if (want('slip')) {
      const F = (D.slip = {});
      for (const [nm, d, mag] of [['run R', 'R', 52], ['run U', 'U', 52], ['run UR', 'UR', 52], ['walk R', 'R', 20]]) { await home(); await stick(d, mag); await step(30); const S = await step(72, true, true); await stickUp(); await step(10); F[nm] = { ...slip(S), gait: S[40].mode, anim: S[40].anim, clip: S[40].clip, feet: !!S[40].fl }; }
      ok(`${dev} foot slip (planted foot speed / body speed): ` + Object.entries(F).map(([k, v]) => `${k} ${v.pct}% (${v.slipPx}/${v.body} px/s, ${v.contacts} contact samples, ${v.clip})`).join(' · '));
      for (const [k, v] of Object.entries(F)) if (v.pct > (k.startsWith('walk') ? 25 : 20) || v.pct < 0) fail(`${dev} foot slip ${k}: ${JSON.stringify(v)}`);
    }

    const LATE = /^(attack|roll|act|jump|guardUp)$/;
    /** after a move: everything released, 70 ticks; nothing may start later than 30 ticks after the release */
    const quiet = async (label) => { await T.upAll(); const n0 = await now(); await step(70); const E = (await evs(n0 + 30)).filter((e) => LATE.test(e[1]) || (e[1] === 'charge' && /start/.test(e[2]))); if (E.length) fail(`${dev} ${label}: something started after the buttons were released: ${JSON.stringify(E)}`); return E.length === 0; };

    if (want('moves')) {
      const M = (D.moves = {});
      // combo in eight directions: stick + three taps; the drawn body must face the cut while the hit window is open
      { const C = {}; for (const k of Object.keys(DIRS)) {
          await home(); const n0 = await now(); await stick(k); await step(1); const S = []; for (let i = 0; i < 3; i++) { await down('attack'); S.push(...(await step(3, false))); await up('attack'); S.push(...(await step(i < 2 ? 15 : 34))); }
          const w = world(k), ids = (await evs(n0)).filter((e) => e[1] === 'attack').map((e) => e[2]).join(','); const hit = S.filter((s) => s.mv && s.mt >= 0.13 && s.mt <= 0.3);
          C[k] = { moves: ids, bodyOff: hit.length ? +Math.max(...hit.map((s) => Math.abs(dAng(ang(s.fx, s.fz), ang(w[0], w[1]))) * DEG)).toFixed(1) : -1, ruleOff: hit.length ? +Math.max(...hit.map((s) => Math.abs(dAng(ang(s.dx, s.dz), ang(w[0], w[1]))) * DEG)).toFixed(1) : -1 };
          const q = await quiet(`combo ${k}`); if (ids !== 'c1,c2,c3' || C[k].bodyOff > 25 || C[k].bodyOff < 0) fail(`${dev} combo ${k}: ${JSON.stringify(C[k])}`);
        } M.combo = C; ok(`${dev} combo x3 in eight directions (moves · body off the stick direction while the hit is open, deg): ` + Object.entries(C).map(([k, v]) => `${k} ${v.moves} ${v.bodyOff}`).join(' · ')); }
      // charged strike in eight directions
      { const C = {}; for (const k of Object.keys(DIRS)) { await home(); const n0 = await now(); await stick(k); await step(2); await stickUp(); await step(8); await down('attack'); const S = await step(70); await up('attack'); const S2 = await step(40); const E = (await evs(n0)).filter((e) => e[1] === 'charge' || e[1] === 'attack').map((e) => e[1] + ':' + e[2]).join(' '); const w = world(k), hit = S2.filter((s) => s.mv === 'whip' && s.mt >= 0.12 && s.mt <= 0.26);
          C[k] = { ev: E, peak: Math.max(...S.map((s) => s.charge)), bodyOff: hit.length ? +Math.max(...hit.map((s) => Math.abs(dAng(ang(s.fx, s.fz), ang(w[0], w[1]))) * DEG)).toFixed(1) : -1, clip: [...new Set(S.concat(S2).map((s) => s.clip))].join('>') }; await quiet(`charge ${k}`); if (!/charge:.*release/.test(E) || !/attack:whip/.test(E) || C[k].bodyOff > 25) fail(`${dev} charged strike ${k}: ${JSON.stringify(C[k])}`); }
        M.charge = C; ok(`${dev} charged strike (hold attack 70 ticks, release) in eight directions: ` + Object.entries(C).map(([k, v]) => `${k} off ${v.bodyOff}`).join(' · ') + ` · events ${C.R.ev} · clips ${C.R.clip}`); }
      // roll in eight directions
      { const C = {}; for (const k of Object.keys(DIRS)) { await home(); const a = (await step(1))[0]; await stick(k); await step(2); await down('roll'); await step(2); await up('roll'); const S = await step(34); await stickUp(); const b = (await step(8))[7]; const w = world(k), mid = S[20]; C[k] = { dist: +Math.hypot(mid.x - a.x, mid.z - a.z).toFixed(0), err: +(Math.abs(dAng(ang(mid.x - a.x, mid.z - a.z), ang(w[0], w[1]))) * DEG).toFixed(1), clip: S[10].clip, anim: S[10].anim, bodyOff: +(Math.abs(dAng(ang(S[10].fx, S[10].fz), ang(w[0], w[1]))) * DEG).toFixed(1) }; await quiet(`roll ${k}`); if (S[10].anim !== 'roll' || C[k].err > 15 || C[k].bodyOff > 25) fail(`${dev} roll ${k}: ${JSON.stringify(C[k])}`); }
        M.roll = C; ok(`${dev} roll in eight directions (px · path error deg · body off deg): ` + Object.entries(C).map(([k, v]) => `${k} ${v.dist}/${v.err}/${v.bodyOff}`).join(' · ')); }
      // guard: hold without the stick; released = down again. Tap, then push the stick: no roll
      { await home(); await down('roll'); const S = await step(30); await up('roll'); const S2 = await step(30); M.guard = { whileHeld: S[20].guard, anim: S[20].anim, clip: S[20].clip, after: S2[25].guard }; (S[20].guard && !S2[25].guard ? ok : fail)(`${dev} guard: held ${S[20].guard} (${S[20].anim}/${S[20].clip}), 25 ticks after release ${S2[25].guard}`); await quiet('guard');
        const res = []; for (const gap of [1, 4, 10, 16]) { await home(); const n0 = await now(); await tap('roll', 3); await step(gap); await stick('R'); await step(40); await stickUp(); const E = (await evs(n0)).filter((e) => e[1] === 'roll'); res.push(`${gap + 3}t:${E.length ? 'ROLLED' : 'no roll'}`); if (E.length) fail(`${dev} tap roll, stick ${gap} ticks after release: rolled`); await quiet('tap-roll then stick'); } M.tapRoll = res; ok(`${dev} tap the roll button, push the stick afterwards: ${res.join(' · ')}`); }
      // parry at five timings against the melee dummy's slash
      { const res = {}; for (const off of [-0.40, -0.25, -0.15, -0.05, 0.03]) {
          await home(); await ev((b) => { window.__pv.put('melee', b[0] + 62, b[1], true); }, BASE); const n0 = await now();
          const w = await until('(s)=>{const e=window.__pv.dm.melee;return e.state==="attack"&&e.phase==="windup"}', 240); if (w < 0) { res[off] = 'enemy never attacked'; continue; }
          const left = await ev(() => { const e = window.__pv.dm.melee; return e.atk.windup - e.stateT; }); const wait = Math.round((left + off) * 60);
          if (wait > 0) await step(wait); await down('roll'); await step(26); await up('roll'); await step(20);
          const E = (await evs(n0)).filter((e) => /^(parry|guard|heroHurt|dodge)$/.test(e[1])).map((e) => e[1]); res[off] = E[0] ?? 'nothing'; await ev(() => window.__pv.park('melee')); await quiet(`parry ${off}`); }
        M.parry = res; const good = res[-0.15] === 'parry' && res[-0.05] === 'parry' && res[-0.4] === 'guard'; (good ? ok : fail)(`${dev} parry: guard pressed at (hit time + offset s) → ` + Object.entries(res).map(([k, v]) => `${k}: ${v}`).join(' · ')); }
      // jump attack
      { await home(); const n0 = await now(); await tap('jump', 4); await step(8); await tap('attack', 3); const S = await step(50); const E = (await evs(n0)).filter((e) => /^(jump|attack|land)$/.test(e[1])).map((e) => e[1] + ':' + e[2]).join(' '); M.jumpAttack = E; (/attack:plunge/.test(E) && /land/.test(E) && S[49].og ? ok : fail)(`${dev} jump attack: ${E} · clip ${[...new Set(S.map((s) => s.clip))].join('>')}`); await quiet('jump attack'); }
      // skill button: call (resonance 2) · denied (resonance 0) · hook (a ring 160 px ahead)
      { const caps = await ev(() => ({ ...window.__v2.scene._caps })); M.caps = caps;
        await home(); await ev(() => { const sc = window.__v2.scene; sc._caps.skill = true; sc._caps.bell = true; sc.sim.hero.reso = 2; }); let n0 = await now(); await tap('skill', 3); let S = await step(50); let E = (await evs(n0)).filter((e) => /^(act|call|deny)$/.test(e[1])).map((e) => e[1] + ':' + e[2]).join(' '); const lights = await ev(() => window.__v2.scene.sim.lights.length); M.skillCall = E; (/act:.*call/.test(E) && lights === 1 ? ok : fail)(`${dev} skill (call mode, resonance 2): ${E} · lights ${lights} · clips ${[...new Set(S.map((s) => s.clip))].join('>')} · scene caps before the test ${JSON.stringify(caps)}`); await quiet('skill call');
        await home(); await ev(() => { window.__v2.scene.sim.hero.reso = 0; }); n0 = await now(); await tap('skill', 3); await step(30); E = (await evs(n0)).filter((e) => /^(act|call|deny)$/.test(e[1])).map((e) => e[1] + ':' + e[2]).join(' '); M.skillDeny = E; (/deny/.test(E) && !/act/.test(E) ? ok : fail)(`${dev} skill with an empty gauge: ${E}`); await quiet('skill deny');
        await home(); await ev((b) => { const s = window.__v2.scene.sim; s.hookPoints.push({ id: 'pv_ring', x: b[0] + 160, z: b[1], y: s.w.ground(b[0], b[1]), to: [b[0] + 150, b[1] + 40] }); }, BASE); await step(2); n0 = await now(); const sm = (await step(1))[0].sm; await tap('skill', 3); S = await step(60); E = (await evs(n0)).filter((e) => /^(act|hook|deny|land)$/.test(e[1])).map((e) => e[1] + ':' + e[2]).join(' '); await ev(() => { const s = window.__v2.scene.sim; s.hookPoints = s.hookPoints.filter((p) => p.id !== 'pv_ring'); }); M.skillHook = E; (sm === 'hook' && /hook:.*throw/.test(E) && /land/.test(E) ? ok : fail)(`${dev} skill (hook mode ${sm}): ${E} · moved ${Math.hypot(S[59].x - BASE[0], S[59].z - BASE[1]).toFixed(0)} px · clips ${[...new Set(S.map((s) => s.clip))].join('>')}`); await quiet('skill hook'); }
      // bell: tap = echo · hold = long ring
      { await home(); let n0 = await now(); await tap('bell', 4); let S = await step(50); let E = (await evs(n0)).filter((e) => /^(act|bell|ringLong)$/.test(e[1])).map((e) => e[1] + ':' + e[2]).join(' '); M.bellTap = E; (/act:.*echo/.test(E) && /bell/.test(E) ? ok : fail)(`${dev} bell tap: ${E} · clips ${[...new Set(S.map((s) => s.clip))].join('>')}`); await quiet('bell tap');
        await home(); n0 = await now(); await down('bell'); S = await step(90); await up('bell'); await step(40); E = (await evs(n0)).filter((e) => /^(act|bell|ringLong)$/.test(e[1])).map((e) => e[1] + ':' + e[2]).join(' '); M.bellHold = E; (/act:.*ring/.test(E) && /ringLong/.test(E) ? ok : fail)(`${dev} bell held 1.5 s: ${E} · charge peak ${Math.max(...S.map((s) => s.bc))} · clips ${[...new Set(S.map((s) => s.clip))].join('>')}`); await quiet('bell hold'); }
      // lock-on switching
      { await home(); await ev((b) => { window.__pv.put('melee', b[0] + 150, b[1] + 40, true); window.__pv.put('ranged', b[0] + 170, b[1] - 60, true); window.__pv.dm.melee.cd = 9; window.__pv.dm.ranged.cd = 9; }, BASE); const a = (await step(6))[5].lock; await tap('lock', 3); const b = (await step(4))[3].lock; await tap('lock', 3); const c = (await step(4))[3].lock; M.lock = [a, b, c]; (a != null && b != null && a !== b && c === a ? ok : fail)(`${dev} lock-on: auto ${a} → tap ${b} → tap ${c}`); await home(); }
    }

    if (want('break')) {
      const B = (D.break = {}); const rest = (s) => !s.mv && !s.act && !s.charging && s.dashT <= 0 && !s.guard && s.hurtT <= 0 && s.og;
      const combos = [['attack', 'roll'], ['attack', 'jump'], ['skill', 'bell'], ['roll', 'jump'], ['attack', 'bell'], ['attack', 'skill'], ['roll', 'bell'], ['attack', 'jump', 'roll', 'skill', 'bell', 'lock']];
      for (const st of ['stand', 'run', 'air']) for (const c of combos) {
        await home(); await ev(() => { window.__v2.scene.sim.hero.reso = 2; }); if (st !== 'stand') await stick('UR'); if (st === 'air') { await tap('jump', 3); await step(6); } else await step(10);
        for (const b of c) await down(b); await step(2); for (const b of c) await up(b); const S = await step(30); const okq = await quiet(`${st} + ${c.join('+')}`); const e = (await step(1))[0];
        B[`${st} ${c.join('+')}`] = [...new Set(S.map((s) => s.anim))].join('>'); if (!rest(e)) fail(`${dev} ${st} + ${c.join('+')}: not at rest afterwards: ${JSON.stringify(e)}`);
      }
      ok(`${dev} button pairs on the same tick (stand / run / air): ` + Object.entries(B).map(([k, v]) => `${k} → ${v}`).join(' · '));
      // during hurt and death: the melee dummy hits him while every button is mashed
      { await home(); await ev((b) => { window.__pv.put('melee', b[0] + 60, b[1], true); window.__v2.scene.sim.hero.hp = 12; }, BASE); let died = false, hurt = false; for (let i = 0; i < 60 && !died; i++) { const b = ['attack', 'roll', 'jump', 'skill', 'bell'][i % 5]; await down(b); const S = await step(4); await up(b); if (S.some((s) => s.hurtT > 0)) hurt = true; if (S.some((s) => s.dead)) died = true; }
        for (let i = 0; i < 12; i++) { const b = ['attack', 'roll', 'jump', 'skill', 'bell'][i % 5]; await down(b); await step(6); await up(b); } await T.upAll(); const S = await step(150); const e = S[S.length - 1]; B.death = { hurt, died, endAnim: e.anim, hp: e.hp, dead: e.dead }; (died && !e.dead && e.hp > 0 ? ok : fail)(`${dev} buttons mashed through hurt and death: hurt ${hurt} · died ${died} · afterwards ${e.anim} hp ${e.hp}`); await ev(() => window.__pv.clear()); }
    }

    if (want('boss')) {
      await home(); const B = (D.boss = {});
      const id = await ev((b) => { const s = window.__v2.scene.sim; const e = s.addEnemy({ kind: 'banshee_queen', x: b[0] + 250, z: b[1], active: true }); e.cd = 0.4; return e.id; }, BASE);
      const S = await step(90, false); await page.screenshot({ path: `${dir}/boss_1.jpg`, type: 'jpeg', quality: 82, scale: 'css' });
      const q = await ev((id) => { const v = window.__v2, sc = v.scene, e = v.enemies.find((x) => x.id === id), bs = sc.sim.bossState(); return { e, bossState: bs ? { ...bs } : null, hudBoss: sc.state?.boss ? { ...sc.state.boss } : null }; }, id);
      B.spawn = q; (q.e && q.e.drawn ? ok : fail)(`${dev} boss spawned through sim.addEnemy: drawn ${q.e?.drawn} · clip ${q.e?.clip} · model ${q.e?.model} · sim.bossState ${JSON.stringify(q.bossState)} · HUD state.boss ${JSON.stringify(q.hudBoss)}`);
      for (const a of ['Q_SWEEP', 'Q_SCREAM', 'Q_WAIL']) { const m = await import('../../src/v2/play/enemies.js').catch(() => null); const idx = { Q_WAIL: 0, Q_SWEEP: 1, Q_SCREAM: 2 }[a];
        await ev(([id, idx, b]) => { const s = window.__v2.scene.sim, e = s.byId(id); window.__pv.hero(b[0], b[1]); e.x = b[0] + 170; e.z = b[1]; s.startAttack(e, e.def.attacks[idx]); }, [id, idx, BASE]);
        const w = await ev(([id]) => { const e = window.__v2.scene.sim.byId(id); return Math.round(e.atk.windup * 60); }, [id]); await step(Math.round(w * 0.7)); await page.screenshot({ path: `${dir}/boss_${a}_windup.jpg`, type: 'jpeg', quality: 82, scale: 'css' }); const hp0 = (await step(1))[0].hp; const S2 = await step(w + 30); await page.screenshot({ path: `${dir}/boss_${a}_after.jpg`, type: 'jpeg', quality: 82, scale: 'css' }); B[a] = { windupTicks: w, heroHp: `${hp0} → ${S2[S2.length - 1].hp}`, clip: (await ev(([id]) => window.__v2.enemies.find((x) => x.id === id)?.clip, [id])) }; }
      ok(`${dev} boss attacks in v2g (hero stands still 170 px in front): ` + Object.entries(B).filter(([k]) => k !== 'spawn').map(([k, v]) => `${k} wind-up ${v.windupTicks} ticks, hero hp ${v.heroHp}`).join(' · '));
      await ev((id) => { const e = window.__v2.scene.sim.byId(id); if (e) { e.dead = true; } }, id); await step(4);
    }
    fs.writeFileSync(`${dir}/frames.json`, JSON.stringify(frames));
    D.errors = errs.slice(0, 12); (errs.length ? fail : ok)(`${dev} page errors: ${errs.length}${errs.length ? ' — ' + errs.slice(0, 3).join(' ‖ ') : ''}`);
  } catch (e) { fail(`${dev}: script stopped: ${String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')}`); D.errors = errs.slice(0, 12); if (errs.length) note('page errors: ' + errs.slice(0, 4).join(' ‖ ')); }
  finally { await browser.close(); }
}
try { for (const d of DEVICES) await run(d); } finally { srv.close(); }
fs.writeFileSync(`${OUT}/touch_result.json`, JSON.stringify(R, null, 1));
console.log(`\n${fails.length ? fails.length + ' FAILED:\n  ' + fails.join('\n  ') : 'ALL OK'}`);
process.exitCode = fails.length ? 1 : 0;
