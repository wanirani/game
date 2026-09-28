// Command techniques on every device — MASTER_PLAN §1.21 (d21 fix, facing fix, d14 vs sprint dash attack), §1.4 rules,
// platform §5.5 P1 (touch: 8-way sectors, 0.8 s window); §5.1 "runtime commands" row.
//
//   node tools/qa/commands.mjs [--only kb,pad,touch] [--tech d05,d19] [--quick] [--verbose]
//
// Every technique of data/lore.js (d02 … d27 that carry a tech) is entered on the keyboard, a fake standard pad (left stick
// sectors) and the canvas touch stick, from a standstill and while running, facing right and facing left. The game loop is
// frozen and stepped by hand (lib/step.mjs): each direction is held 3 game frames, attack 3 frames, so timing is exact on a
// loaded machine. A case passes when exactly that technique is cast (SKILL_IMPL[tech.id] called once) and the hero casts
// toward the facing it had at the first direction of the command (§1.21: d05 ↓↙← and d19 →↓←↑ from a standstill).
// d14 timing (§1.4): → → then attack 5 frames after the second press = 수룡참; attack 30 frames later while sprinting = the
// sprint dash attack (never 수룡참), on every device.
// --quick: standstill + facing right only (≈ 1/4 of the cases).
// Report: /tmp/claude-0/qa/tools/commands.json (+ .md), findings grouped by W4 bucket. Exit 1 on any failed case.
import { openEnv } from './lib/server.mjs';
import { fakePadInit, PAD_IDS, BTN, connect, setButton, axes } from './lib/fakepad.mjs';
import { Touch, padLayout } from './lib/touch.mjs';
import { freeze, step, stepUntil, settle } from './lib/step.mjs';
import { Checks, writeReport, parseFlags, list } from './lib/report.mjs';
import { ownerOf } from './lib/owners.mjs';
import { DOCS } from '../../src/data/lore.js';

const args = parseFlags();
const C = new Checks(!args.verbose);
const DEVICES = list(args.only, ['kb', 'pad', 'touch']);
const ONLY_TECH = list(args.tech, null);
const TECHS = Object.values(DOCS).filter((d) => d.tech?.cmd && (!ONLY_TECH || ONLY_TECH.includes(d.id))).map((d) => ({ doc: d.id, ...d.tech }));
const VARIANTS = args.quick ? [['still', 1]] : [['still', 1], ['still', -1], ['run', 1], ['run', -1]];
const HOLD = 3;              // frames per direction
const RUN = 14;              // frames of running before a 'run' case (≈ 0.23 s at full speed)
const findings = [];
const results = [];
const t0 = Date.now();

/** Relative token (f, b, uf, db…) → absolute dir code (r, l, ur, dl…) for facing F. */
const absDir = (tok, F) => tok.replace(/f/g, F > 0 ? 'r' : 'l').replace(/b/g, F > 0 ? 'l' : 'r');
const relative = (cmd) => cmd.some((s) => !s.startsWith('btn:') && /[fb]/.test(s));

// ── device drivers: dir(code) sets the held direction ('n' = neutral), atk(on) the attack button ──────────
function kbDriver(page) {
  const KEY = { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight' };
  let held = new Set();
  return {
    name: 'kb',
    async dir(code) {
      const want = new Set(code === 'n' ? [] : [...code].map((c) => KEY[c]));
      for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
      for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
      held = want;
    },
    async atk(on) { if (on) await page.keyboard.down('KeyX'); else await page.keyboard.up('KeyX'); },
    async reset() { await this.dir('n'); await page.keyboard.up('KeyX'); },
  };
}
function padDriver(page) {
  const V = { n: [0, 0], u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0], ul: [-0.707, -0.707], ur: [0.707, -0.707], dl: [-0.707, 0.707], dr: [0.707, 0.707] };
  return {
    name: 'pad',
    async dir(code) { const [x, y] = V[code]; await axes(page, x * 0.95, y * 0.95); },
    async atk(on) { await setButton(page, BTN.X, on ? 1 : 0); },
    async reset() { await axes(page, 0, 0); await setButton(page, BTN.X, 0); },
  };
}
function touchDriver(page, t, origin, attackAt, R) {
  const U = { n: [0, 0], u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0], ul: [-0.707, -0.707], ur: [0.707, -0.707], dl: [-0.707, 0.707], dr: [0.707, 0.707] };
  const STICK = 71, ATK = 72;
  let down = false;
  return {
    name: 'touch',
    async dir(code) {
      const [ux, uy] = U[code];
      if (!down) { await t.down(STICK, origin[0], origin[1]); down = true; }
      await t.move(STICK, origin[0] + ux * 0.75 * R, origin[1] + uy * 0.75 * R);
    },
    async atk(on) { if (on) await t.down(ATK, attackAt[0], attackAt[1]); else await t.up(ATK); },
    async reset() { if (down) { await t.up(STICK); down = false; } await t.up(ATK); },
  };
}

/** Page setup: stage s01, frozen, cleared, all technique docs learned, tech implementations wrapped to record casts. */
async function openStage(env, vp, pad) {
  const s = await env.page(vp, 'index.html?scene=stage&stage=s01', { settings: { quality: 'low', autoSprint: false }, initScripts: pad ? [fakePadInit({ id: PAD_IDS.xbox })] : [] });
  await s.waitGame('!!g.world?.player');
  if (pad) await connect(s.page);
  await freeze(s.page);
  await settle(s.page, 90);
  await s.eval(async (docIds) => {
    const g = window.__game, w = g.world, p = w.player;
    const S = await import('/src/game/skills.js');
    const { DOCS } = await import('/src/data/lore.js');
    p.buffs.invincible = 9999;
    for (const e of w.entities || []) if (e.kind === 'enemy' || e.kind === 'trigger' || e.constructor?.name === 'StoryTrigger') e.dead = true;
    const prog = (p.state ?? w.state).progress;
    prog.docs = docIds.slice();
    window.__qaTech = [];
    for (const id of docIds) {
      const tid = DOCS[id]?.tech?.id;
      const f = tid && S.SKILL_IMPL[tid];
      if (!f || f.__qa) continue;
      const wrap = function (pl, world, ...rest) { window.__qaTech.push({ id: tid, frame: g.frame, facing: pl.facing, x: pl.x }); return f.call(this, pl, world, ...rest); };
      wrap.__qa = true;
      S.SKILL_IMPL[tid] = wrap;
    }
    window.__qaHome = { x: p.x, y: p.y };
  }, TECHS.map((x) => x.doc));
  await settle(s.page, 30);
  return s;
}

/** Sets the learned technique documents (acquisition order = array order). */
const learn = (s, docIds) => s.eval((ids) => { const w = window.__game.world, p = w.player; (p.state ?? w.state).progress.docs = ids.slice(); }, docIds);

/** Hero back home, idle, facing F, resources full, input history empty. */
async function resetHero(s, drv, F) {
  await drv.reset();
  await step(s.page, 2, false);
  await stepUntil(s.page, "!p.move && !(p.castT > 0) && !w.cutscene && g.top?.name === 'stage' && !(w.hitstop > 0)", 400);
  await s.eval((F) => {
    const g = window.__game, w = g.world, p = w.player, H = window.__qaHome;
    p.x = H.x; p.y = H.y; p.vx = 0; p.vy = 0; p.move = null; p.dashT = 0; p.sprinting = false;
    p.facing = F; p.faceNoted = F; if (p.faceRing) p.faceRing.length = 0;
    p.mp = p.stats?.mp ?? 999; p.hurtT = 0;
    for (const k of Object.keys(p.skillCd || {})) p.skillCd[k] = 0;
    if (p.fm) { p.fm.tapAt = -99; p.fm.sprintAt = -9; p.fm.tapDir = 0; }
    g.input.history.length = 0;
    window.__qaTech.length = 0;
    for (const e of w.entities || []) if (e.kind === 'enemy') e.dead = true;
  }, F);
  await settle(s.page, 12);
  await s.eval(() => { window.__qaTech.length = 0; window.__game.input.history.length = 0; });
}

/** Enters one technique; → { fired: [ids], facing, ok, detail }. hold = frames per direction. */
async function runTech(s, drv, tech, variant, F, hold = HOLD) {
  await resetHero(s, drv, F);
  const fwd = F > 0 ? 'r' : 'l';
  if (variant === 'run') { await drv.dir(fwd); await step(s.page, RUN, false); }
  let prev = variant === 'run' ? fwd : 'n';
  const seq = tech.cmd.filter((x) => !x.startsWith('btn:')).map((x) => absDir(x, F));
  for (const d of seq) {
    if (d === prev) { await drv.dir('n'); await step(s.page, 2, false); }
    await drv.dir(d); await step(s.page, hold, false); prev = d;
  }
  await drv.atk(true); await step(s.page, HOLD, false);
  await drv.atk(false); await drv.dir('n');
  await step(s.page, 24, false);
  const fired = await s.eval(() => window.__qaTech.slice());
  const ids = fired.map((x) => x.id);
  const want = relative(tech.cmd) ? F : null;
  const hit = fired.filter((x) => x.id === tech.id);
  const ok = hit.length === 1 && ids.length === 1 && (want === null || hit[0].facing === want);
  return { ok, ids, facing: hit[0]?.facing ?? null, want };
}

/** d14 timing: →→ then attack `gap` frames after the second press. → { tech, dash, sprinting } */
async function runSprint(s, drv, F, gap) {
  await resetHero(s, drv, F);
  const fwd = F > 0 ? 'r' : 'l';
  await drv.dir(fwd); await step(s.page, 4, false);
  await drv.dir('n'); await step(s.page, 4, false);
  await drv.dir(fwd); await step(s.page, gap, false);
  const sprinting = await s.eval(() => !!window.__game.world.player.sprinting);
  await drv.atk(true); await step(s.page, 1, false);
  const r = await s.eval(() => { const p = window.__game.world.player; return { dash: !!(p.move && p.move === p.moveSet?.dash) }; });
  await step(s.page, 2, false);
  await drv.atk(false); await drv.dir('n'); await step(s.page, 20, false);
  const r2 = await s.eval(() => ({ tech: window.__qaTech.map((x) => x.id) }));
  return { sprinting, dash: r.dash, tech: r2.tech };
}

const env = await openEnv();
try {
  for (const dev of DEVICES) {
    const vp = dev === 'touch' ? 'phone1' : 'desk';
    let s;
    try { s = await openStage(env, vp, dev === 'pad'); } catch (e) { C.add(`${dev}.harness`, 'error', String(e?.message || e).split('\n')[0]); continue; }
    let drv;
    if (dev === 'kb') drv = kbDriver(s.page);
    else if (dev === 'pad') drv = padDriver(s.page);
    else {
      const t = new Touch(s.cdp, s.page);
      const [W, H] = await s.eval(() => [innerWidth, innerHeight]);
      await t.tap(W * 0.5, H * 0.3, 30); await step(s.page, 6);   // touch mode on (pad shows)
      const L = await padLayout(s.page);
      const A = L.buttons.attack;
      const R = await s.eval(async () => { try { const tp = (await import('/src/core/touchpad.js')).touchpad; return (tp.layoutInfo?.()?.R) ?? 60; } catch { return 60; } });
      drv = touchDriver(s.page, t, [Math.round(W * 0.2), Math.round(H * 0.68)], [A?.cx ?? W - 108, A?.cy ?? H - 58], Number(R) || 60);
      const mode = await s.eval(() => window.__game.input.mode);
      if (mode !== 'touch') C.add('touch.mode', 'fail', `input.mode ${mode} after the first tap`);
    }
    for (const tech of TECHS) {
      for (const [variant, F] of VARIANTS) {
        let r;
        try { r = await runTech(s, drv, tech, variant, F); } catch (e) { r = { ok: false, ids: [], err: String(e?.message || e).split('\n')[0] }; }
        // a failure with every technique learned is retried with only this one learned: passing alone means another
        // technique that was learned earlier matches the same input first (priority), failing alone means input/facing
        let alone = null;
        if (!r.ok && !r.err) {
          await learn(s, [tech.doc]);
          try { alone = await runTech(s, drv, tech, variant, F); } catch (e) { alone = { ok: false, ids: [], err: String(e?.message || e).split('\n')[0] }; }
          await learn(s, TECHS.map((x) => x.doc));
        }
        const id = `${dev}.${tech.doc}.${variant}.${F > 0 ? 'R' : 'L'}`;
        results.push({ dev, doc: tech.doc, tech: tech.id, name: tech.name, cmd: tech.cmd.join(' '), variant, F, ...r, alone: alone ? { ok: alone.ok, ids: alone.ids, facing: alone.facing } : null });
        const why = alone ? (alone.ok ? ` — alone it works: shadowed by ${r.ids.filter((x) => x !== tech.id).join(',') || '?'} (learned earlier, tried first)` : ` — alone: cast ${alone.ids.join(',') || 'nothing'}${alone.facing != null ? ` facing ${alone.facing}` : ''}`) : '';
        C.add(id, r.ok ? 'pass' : 'fail', `${tech.name} [${tech.cmd.join(' ')}] ${variant} facing ${F > 0 ? '→' : '←'}: ${r.err ? 'HARNESS ' + r.err : `cast ${r.ids.join(',') || 'nothing'}${r.want !== null && r.facing !== null ? `, facing ${r.facing} (want ${r.want})` : ''}`}${why}`);
      }
    }
    // command window: 파동참 entered slowly (13 frames per direction ≈ 0.65 s to the attack) — outside the 0.6 s window on
    // keyboard/pad, inside the 0.8 s touch window (platform §5.5 P1)
    const hadou = TECHS.find((x) => x.id === 'tech_hadou');
    if (hadou) {
      const w = await runTech(s, drv, hadou, 'still', 1, 13);
      const want = dev === 'touch';
      const fired = w.ids.includes('tech_hadou');
      results.push({ dev, doc: 'd02', tech: 'window', variant: 'slow', ok: fired === want, ids: w.ids });
      C.add(`${dev}.window`, fired === want ? 'pass' : 'fail', `파동참 entered over ≈ 0.65 s: ${fired ? 'cast' : 'not cast'} (want ${want ? 'cast: touch window 0.8 s' : 'not cast: window 0.6 s'})`);
    }
    // d14 vs the sprint dash attack
    const d14 = DOCS.d14?.tech;
    if (d14 && (!ONLY_TECH || ONLY_TECH.includes('d14'))) {
      for (const F of args.quick ? [1] : [1, -1]) {
        const q = await runSprint(s, drv, F, 5);
        const l = await runSprint(s, drv, F, 30);
        const okQ = q.tech.length === 1 && q.tech[0] === 'tech_hydro';
        const okL = l.sprinting && l.dash && !l.tech.includes('tech_hydro');
        results.push({ dev, doc: 'd14', tech: 'sprint', variant: `quick.${F}`, ok: okQ, q }, { dev, doc: 'd14', tech: 'sprint', variant: `late.${F}`, ok: okL, l });
        C.add(`${dev}.d14.quick.${F > 0 ? 'R' : 'L'}`, okQ ? 'pass' : 'fail', `→→ + attack 5 frames after the 2nd press → ${q.tech.join(',') || 'no technique'} (want tech_hydro)`);
        C.add(`${dev}.d14.late.${F > 0 ? 'R' : 'L'}`, okL ? 'pass' : 'fail', `→→ + attack 30 frames later: sprinting ${l.sprinting}, dash attack ${l.dash}, techniques ${l.tech.join(',') || 'none'} (want the dash attack, no 수룡참)`);
      }
    }
    const errs = [...new Set(s.errs)];
    C.add(`${dev}.errors`, errs.length ? 'fail' : 'pass', errs.length ? errs.slice(0, 3).join(' || ') : 'no page/console errors');
    if (errs.length) findings.push({ id: `commands.${dev}.errors`, sev: 'S2', kind: 'commands', title: `page errors while entering commands (${dev})`, detail: errs.slice(0, 3).join(' || '), file: 'src/game/player.js', ...ownerOf('src/game/player.js') });
    await s.close();
  }
} finally {
  await env.close();
}

// findings: a technique failing on every device → the command/technique code; on some devices → the input layer
const fails = results.filter((r) => !r.ok);
const byTech = {};
for (const r of fails) (byTech[`${r.doc}:${r.variant}:${r.F ?? ''}`] ||= []).push(r);
for (const [k, rs] of Object.entries(byTech)) {
  const devs = [...new Set(rs.map((r) => r.dev))];
  const all = DEVICES.every((d) => devs.includes(d));
  const shadowed = rs.every((r) => r.alone?.ok);
  const file = rs[0].tech === 'sprint' ? 'src/game/feel_move.js' : (all || shadowed) ? 'src/game/player.js' : devs.includes('touch') && devs.length === 1 ? 'src/core/touchpad.js' : 'src/core/input.js';
  const r0 = rs[0];
  findings.push({
    id: `commands.${k}`, sev: 'S2', kind: 'commands', file, ...ownerOf(file),
    title: `${r0.doc} ${r0.name ?? r0.tech} ${r0.variant}${r0.F ? (r0.F > 0 ? ' facing →' : ' facing ←') : ''} fails on ${devs.join('/')}${shadowed ? ` — shadowed by ${[...new Set(rs.flatMap((r) => r.ids || []))].filter((x) => x !== r0.tech).join(',')} (an earlier-learned technique whose command is a subsequence wins; the longest matching command should win)` : ''}`,
    detail: rs.map((r) => `${r.dev}: cast ${r.ids?.join(',') || 'nothing'}${r.facing != null ? ` facing ${r.facing}` : ''}${r.l ? ` ${JSON.stringify(r.l)}` : ''}${r.q ? ` ${JSON.stringify(r.q)}` : ''}${r.err ? ' ' + r.err : ''}`).join('; '),
    repro: `node tools/qa/commands.mjs --only ${devs.join(',')} --tech ${r0.doc}`,
  });
}
const c = C.counts();
const matrix = {};
for (const r of results) { const k = `${r.doc} ${r.name ?? r.tech}`; (matrix[k] ||= {})[`${r.dev}.${r.variant}${r.F ? (r.F > 0 ? '.R' : '.L') : ''}`] = r.ok ? 'ok' : 'FAIL'; }
const md = `\n## Matrix\n\n${Object.entries(matrix).map(([k, v]) => `- ${k}: ${Object.entries(v).map(([a, b]) => `${a} ${b}`).join(' · ')}`).join('\n')}\n`;
const out = writeReport('commands', { tool: 'commands', when: new Date().toISOString(), durationMs: Date.now() - t0, devices: DEVICES, quick: !!args.quick, counts: c, checks: C.list, results, findings }, { title: 'Command techniques (keyboard, pad, touch)', findings, extraMd: md });
console.log(`\ncommands: ${c.pass} pass, ${c.fail} fail, ${c.error} error over ${results.length} cases in ${((Date.now() - t0) / 1000).toFixed(0)} s — ${out.json}`);
for (const f of findings) console.log(`  FAIL ${f.title} — ${String(f.detail).slice(0, 200)}`);
process.exit(C.red.length ? 1 : 0);
