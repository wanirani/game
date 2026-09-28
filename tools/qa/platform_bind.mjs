// Awakening / mount / guardian bindings on every device and the canvas touch buttons — MASTER_PLAN §1.4 (bindings table,
// L3 rule, awakening hold), companions §6, feel §6.1, platform §5.2; QA-TOOLS "platform tests cover awaken/mount/guard
// bindings and the canvas touch buttons".
//
//   node tools/qa/platform_bind.mjs [--only kb,pad,touch,hide] [--shots]
//
// Deterministic: the game loop is frozen (lib/step.mjs) and every check advances game.tick by hand after real CDP input
// (keyboard, fake standard pad, CDP touch on the canvas pad), so a press lasts an exact number of game frames on a
// loaded machine. The hero gets a tier-1 class (awakening needs one) and full gauges only where a check needs them.
// Groups
//   kb     R → mount / R again → dismount; G → guardian skill; F tap (< 0.20 s) with both gauges full → normal ultimate;
//          F held 0.53 s → awakening; V → awakening
//   pad    L3 with the stick at rest → mount; L3 clicked while running (stick 0.9) → nothing; L3 held 0.33 s while
//          running → mount; R3 → guardian skill; RT tap → ultimate; RT held 0.53 s → awakening (arcade preset)
//   touch  each canvas button presses its action (attack jump dash sub skill1 skill2 swap ult mount guard; Ⅱ → pause,
//          가방 → menu inventory); holding 필살 with both gauges full shows the hold ring (awakenState.holdK) and awakens
//   hide   탑승/수호 buttons only with a mount/guardian equipped; in the hub the combat buttons and 수호 are hidden
// Report: /tmp/claude-0/qa/platform/platform_bind.json
import { Suite, fmt } from './lib/suite.mjs';
import { openEnv } from './lib/server.mjs';
import { fakePadInit, PAD_IDS, BTN, connect, setButton, axes } from './lib/fakepad.mjs';
import { Touch, padLayout } from './lib/touch.mjs';
import { freeze, step, stepUntil, settle, busRecorder } from './lib/step.mjs';

const suite = new Suite('platform_bind');
const env = await openEnv();
const EVENTS = ['mounted', 'dismounted', 'guardianSkill', 'awakenCast', 'ultimateCast'];
const CMP_Q = 'mount=mt_warhorse&guards=gd_fairy';

/** Stage page, frozen, prepared: no enemies/triggers, invulnerable, tier-1 class, companions in place. */
async function stagePage(vp, { stage = 's01', query = CMP_Q, pad = null, settings = {} } = {}) {
  const s = await env.page(vp, `index.html?scene=stage&stage=${stage}${query ? '&' + query : ''}`, { settings: { quality: 'low', ...settings }, initScripts: pad ? [fakePadInit(pad)] : [] });
  await s.waitGame('!!g.world?.player');
  if (pad) await connect(s.page);
  await freeze(s.page);
  await settle(s.page, 90);
  await s.eval(async () => {
    const g = window.__game, w = g.world, p = w.player;
    const { CLASSES } = await import('/src/data/classes.js');
    const t1 = Object.values(CLASSES).find((c) => c.charId === p.hero.charId && c.tier === 1);
    if (t1) { p.hero.classId = t1.id; p.refreshStats?.(); }
    p.buffs.invincible = 9999;
    for (const e of w.entities || []) if (e.kind === 'enemy' || e.kind === 'trigger' || e.constructor?.name === 'StoryTrigger') e.dead = true;
    w.run.hearts = 60;
  });
  await settle(s.page, 60);
  const bus = await busRecorder(s.page, EVENTS);
  return { s, bus };
}
const gauges = (s, full) => s.eval((full) => { const r = window.__game.world.run; r.sp = full ? 100 : 0; r.aw = full ? 100 : 0; }, full);
const readyGuards = (s) => s.eval(() => { for (const gd of window.__game.world.companions?.guards || []) { gd.skillCd = 0; } const c = window.__game.world.companions; if (c) c.autoT = 99; });
const backToStage = (s, max = 1800) => stepUntil(s.page, "!w.cutscene && g.top?.name === 'stage' && !(w.hitstop > 0)", max);
const evs = async (bus, name) => (await bus.read()).filter((e) => e.ev === name);
/** Hold a keyboard key for n frames, then release and run tail frames. */
async function keyFrames(s, code, n, tail = 30) { await s.page.keyboard.down(code); await step(s.page, n); await s.page.keyboard.up(code); await step(s.page, tail); }
async function padFrames(s, btn, n, tail = 30) { await setButton(s.page, btn, 1); await step(s.page, n); await setButton(s.page, btn, 0); await step(s.page, tail); }

try {
  // ── keyboard ──────────────────────────────────────────────────────────────────────────────────────
  await suite.group('kb', async () => {
    const { s, bus } = await stagePage('desk');
    // R → mount, R → dismount
    await bus.clear();
    await keyFrames(s, 'KeyR', 4, 90);
    const m1 = await evs(bus, 'mounted');
    await suite.check({ id: 'kb.mount', group: 'kb', issue: '§1.4', pkg: 'CMP-MOUNT', title: 'R summons the equipped mount', session: s }, async () => ({ pass: m1.length > 0, detail: m1.length ? `mounted ${fmt(m1[0].d)}` : `no 'mounted' (mount state ${await s.eval(() => window.__game.world.player.mount?.state ?? 'none')})` }));
    await bus.clear();
    await keyFrames(s, 'KeyR', 4, 90);
    const d1 = await evs(bus, 'dismounted');
    await suite.check({ id: 'kb.dismount', group: 'kb', issue: '§1.4', pkg: 'CMP-MOUNT', title: 'R again dismounts', session: s }, async () => ({ pass: d1.length > 0, detail: d1.length ? `dismounted` : `no 'dismounted' (state ${await s.eval(() => window.__game.world.player.mount?.state ?? 'none')})` }));
    // G → guardian skill (manual, not auto)
    await readyGuards(s); await bus.clear();
    await keyFrames(s, 'KeyG', 4, 20);
    const g1 = (await evs(bus, 'guardianSkill')).filter((e) => !e.d?.auto);
    await suite.check({ id: 'kb.guard', group: 'kb', issue: '§1.4', pkg: 'CMP-SYS', title: 'G casts the first ready guardian skill', session: s }, async () => ({ pass: g1.length > 0, detail: g1.length ? `guardianSkill ${fmt(g1[0].d)}` : `no manual guardianSkill (guards ${await s.eval(() => (window.__game.world.companions?.guards || []).map((x) => `${x.id} cd ${(+x.skillCd).toFixed(2)}`).join(','))})` }));
    await settle(s.page, 60);
    // F tap with both gauges full → normal ultimate (not an awakening)
    await gauges(s, true); await bus.clear();
    await keyFrames(s, 'KeyF', 5, 12);
    const u1 = await evs(bus, 'ultimateCast'), a1 = await evs(bus, 'awakenCast');
    await suite.check({ id: 'kb.ultTap', group: 'kb', issue: 'feel §6.1', pkg: 'AWAKEN-CORE', title: 'F tapped (5 frames) with both gauges full → normal ultimate on release', session: s }, async () => ({ pass: u1.length === 1 && a1.length === 0, detail: `ultimateCast ${u1.length}, awakenCast ${a1.length}` }));
    await backToStage(s);
    // F held 0.53 s → awakening
    await gauges(s, true); await bus.clear();
    await keyFrames(s, 'KeyF', 32, 12);
    const a2 = await evs(bus, 'awakenCast');
    await suite.check({ id: 'kb.ultHold', group: 'kb', issue: 'feel §6.1', pkg: 'AWAKEN-CORE', title: 'F held 32 frames (0.53 s) with both gauges full → awakening', session: s }, async () => ({ pass: a2.length === 1, detail: `awakenCast ${a2.length}${a2[0] ? ' ' + fmt(a2[0].d) : ''}, ultimateCast ${(await evs(bus, 'ultimateCast')).length}` }));
    await backToStage(s);
    // V → awakening at once
    await gauges(s, true); await bus.clear();
    await keyFrames(s, 'KeyV', 3, 12);
    const a3 = await evs(bus, 'awakenCast');
    await suite.check({ id: 'kb.awakenKey', group: 'kb', issue: '§1.4', pkg: 'AWAKEN-CORE', title: "V ('awaken') awakens at once when ready", session: s }, async () => ({ pass: a3.length === 1, detail: `awakenCast ${a3.length}` }));
    await backToStage(s);
    await suite.errors({ id: 'kb.errors', group: 'kb' }, s);
    await s.close();
  }, env);

  // ── controller (arcade preset) ────────────────────────────────────────────────────────────────────
  await suite.group('pad', async () => {
    const { s, bus } = await stagePage('desk', { pad: { id: PAD_IDS.xbox } });
    await bus.clear();
    await padFrames(s, BTN.L3, 4, 90);
    const m1 = await evs(bus, 'mounted');
    await suite.check({ id: 'pad.L3', group: 'pad', issue: '§1.4', pkg: 'PLAT-INPUT', title: 'L3 with the stick at rest summons the mount', session: s }, async () => ({ pass: m1.length > 0, detail: m1.length ? 'mounted' : `no 'mounted' (state ${await s.eval(() => window.__game.world.player.mount?.state ?? 'none')})` }));
    await padFrames(s, BTN.L3, 4, 90); // dismount again (checked on the keyboard)
    await bus.clear();
    // running with the stick pushed: a short L3 click must not toggle the mount (no accidental clicks while running)
    await axes(s.page, 0.9, 0); await step(s.page, 10);
    await padFrames(s, BTN.L3, 6, 60);
    const m2 = await evs(bus, 'mounted');
    await suite.check({ id: 'pad.L3run', group: 'pad', issue: '§1.4', pkg: 'PLAT-INPUT', title: 'L3 clicked for 0.1 s while running (stick 0.9) does nothing', session: s }, async () => ({ pass: m2.length === 0, detail: `mounted ${m2.length}` }));
    await bus.clear();
    await padFrames(s, BTN.L3, 20, 90);
    const m3 = await evs(bus, 'mounted');
    await axes(s.page, 0, 0); await step(s.page, 10);
    await suite.check({ id: 'pad.L3hold', group: 'pad', issue: '§1.4', pkg: 'PLAT-INPUT', title: 'L3 held 0.33 s while running summons the mount', session: s }, async () => ({ pass: m3.length > 0, detail: `mounted ${m3.length}` }));
    if (m3.length) await padFrames(s, BTN.L3, 4, 90);
    // R3 → guardian skill
    await readyGuards(s); await bus.clear();
    await padFrames(s, BTN.R3, 4, 20);
    const g1 = (await evs(bus, 'guardianSkill')).filter((e) => !e.d?.auto);
    await suite.check({ id: 'pad.R3', group: 'pad', issue: '§1.4', pkg: 'PLAT-INPUT', title: 'R3 casts the guardian skill', session: s }, async () => ({ pass: g1.length > 0, detail: `guardianSkill ${g1.length}` }));
    await settle(s.page, 60);
    // RT tap → ultimate; RT hold → awakening (pad 'awaken' is unbound by default: the hold is the only pad path)
    await gauges(s, true); await bus.clear();
    await padFrames(s, BTN.RT, 5, 12);
    const u1 = await evs(bus, 'ultimateCast'), a1 = await evs(bus, 'awakenCast');
    await suite.check({ id: 'pad.RTtap', group: 'pad', issue: 'feel §6.1', pkg: 'AWAKEN-CORE', title: 'RT tapped (5 frames) with both gauges full → normal ultimate', session: s }, async () => ({ pass: u1.length === 1 && a1.length === 0, detail: `ultimateCast ${u1.length}, awakenCast ${a1.length}` }));
    await backToStage(s);
    await gauges(s, true); await bus.clear();
    await padFrames(s, BTN.RT, 32, 12);
    const a2 = await evs(bus, 'awakenCast');
    await suite.check({ id: 'pad.RThold', group: 'pad', issue: 'feel §6.1', pkg: 'AWAKEN-CORE', title: 'RT held 0.53 s with both gauges full → awakening', session: s }, async () => ({ pass: a2.length === 1, detail: `awakenCast ${a2.length}, ultimateCast ${(await evs(bus, 'ultimateCast')).length}` }));
    await backToStage(s);
    await suite.errors({ id: 'pad.errors', group: 'pad' }, s);
    await s.close();
  }, env);

  // ── canvas touch buttons ──────────────────────────────────────────────────────────────────────────
  await suite.group('touch', async () => {
    const { s, bus } = await stagePage('phone1');
    const t = new Touch(s.cdp, s.page);
    // first touch puts the game in touch mode (the pad shows); tap an empty spot
    const [W, H] = await s.eval(() => [innerWidth, innerHeight]);
    await t.tap(W * 0.5, H * 0.3, 30); await step(s.page, 6);
    const L = await padLayout(s.page);
    const ACT = { attack: 'attack', jump: 'jump', dash: 'dash', sub: 'sub', skill1: 'skill1', skill2: 'skill2', swap: 'swap', mount: 'mount', guard: 'guard', ult: 'ult' };
    const rows = [];
    for (const [id, action] of Object.entries(ACT)) {
      const b = L.buttons[id];
      if (!b) { rows.push([id, false, 'not on screen']); continue; }
      if (id === 'guard') await readyGuards(s);
      if (id === 'ult') await s.eval(() => { const r = window.__game.world.run; r.sp = 100; r.aw = 0; });   // SP full, awakening gauge empty
      await bus.clear();
      await s.eval(() => { window.__qaSeen = {}; });
      const sample = () => s.eval((a) => { const i = window.__game.input; if (i.down(a) || i.pressed?.(a)) window.__qaSeen[a] = true; }, action);
      await t.down(61, b.cx, b.cy);
      for (let k = 0; k < 5; k++) { await step(s.page, 1, false); await sample(); }
      await t.up(61);
      for (let k = 0; k < 4; k++) { await step(s.page, 1, false); await sample(); }
      const seen = await s.eval((a) => !!window.__qaSeen[a], action);
      let effect = '';
      if (id === 'mount') { await step(s.page, 90); const m = await evs(bus, 'mounted'); effect = m.length ? 'mounted' : 'NOT mounted'; if (m.length) { await t.down(61, b.cx, b.cy); await step(s.page, 4); await t.up(61); await step(s.page, 90); } }
      if (id === 'guard') { const g = (await evs(bus, 'guardianSkill')).filter((e) => !e.d?.auto); effect = g.length ? 'guardianSkill' : 'NO guardianSkill'; }
      if (id === 'ult') { const u = await evs(bus, 'ultimateCast'); effect = u.length ? 'ultimateCast' : 'NO ultimateCast'; await backToStage(s); }
      rows.push([id, seen && !/NOT|NO /.test(effect), `${seen ? 'down' : 'never down'}${effect ? ', ' + effect : ''}`]);
      await settle(s.page, 20);
    }
    await suite.check({ id: 'touch.buttons', group: 'touch', issue: 'P-20', pkg: 'PLAT-TOUCH', title: 'every canvas action button presses its action (incl. 탑승 / 수호)', session: s }, async () => ({ pass: rows.every((r) => r[1]), detail: rows.map((r) => `${r[0]}: ${r[2]}`).join('; '), metrics: rows }));
    // ult hold with both gauges full: the ring fills (awakenState.holdK) and the hold awakens
    await gauges(s, true); await bus.clear();
    const U = (await padLayout(s.page)).buttons.ult;
    let holdK = 0;
    if (U) {
      await t.down(62, U.cx, U.cy);
      for (let k = 0; k < 32; k++) { await step(s.page, 1, false); if (k === 20) holdK = await s.eval(() => window.__game.world.awakenState?.holdK ?? 0); }
      await t.up(62); await step(s.page, 12);
    }
    const aw = await evs(bus, 'awakenCast');
    await suite.check({ id: 'touch.awaken', group: 'touch', issue: 'feel §6.1', pkg: 'PLAT-TOUCH', title: '필살 held 0.53 s with both gauges full: hold ring fills, then awakening', session: s }, async () => ({ pass: !!U && aw.length === 1 && holdK > 0.2, detail: U ? `holdK at 0.35 s ${(+holdK).toFixed(2)}, awakenCast ${aw.length}` : 'ult button not found' }));
    await backToStage(s);
    // system buttons: Ⅱ → pause, 가방 → menu on the inventory tab
    const sys = [];
    for (const [id, want] of [['pause', /pause$/], ['bag', /menu$/]]) {
      // after the pause scene is popped the pad shows its system buttons again on its own (real-time) redraw: poll for
      // the button (≤ ~2.5 s, stepping the game) instead of reading the layout once — a single read was flaky at load 12+
      let b = null;
      for (let k = 0; k < 25 && !b; k++) { b = (await padLayout(s.page)).buttons[id] || null; if (!b) { await step(s.page, 2); await s.wait(100); } }
      if (!b) { sys.push(`${id}: not on screen`); continue; }
      await t.down(63, b.cx, b.cy); await step(s.page, 3); await t.up(63); await step(s.page, 12);
      const r = await s.eval(async () => { const g = window.__game; let tab = null; try { const M = await import('/src/scenes/menu/menu.js'); tab = g.top?.name === 'menu' ? M.MENU_TABS?.[g.top.ti]?.id ?? null : null; } catch { /* */ } return { scenes: g.scenes.map((x) => x.name).join('>'), tab }; });
      sys.push(`${id}: ${r.scenes}${r.tab ? ' tab ' + r.tab : ''}${want.test(r.scenes) && (id !== 'bag' || r.tab === 'inventory') ? '' : ' ✗'}`);
      await s.eval(() => { const g = window.__game; for (let i = 0; i < 4 && g.top?.name !== 'stage'; i++) g.pop(); });
      await step(s.page, 6);
    }
    await suite.check({ id: 'touch.system', group: 'touch', issue: 'P-20', pkg: 'PLAT-TOUCH', title: 'Ⅱ opens pause, 가방 opens the menu on the inventory tab', session: s }, async () => ({ pass: sys.length === 2 && !sys.some((x) => /✗|not on screen/.test(x)), detail: sys.join('; ') }));
    await suite.errors({ id: 'touch.errors', group: 'touch' }, s);
    await s.close();
  }, env);

  // ── visibility of the companion buttons and the hub hide list ──────────────────────────────────────
  await suite.group('hide', async () => {
    const vis = async (s) => Object.keys((await padLayout(s.page)).buttons);
    const tapOnce = async (s) => { const t = new Touch(s.cdp, s.page); const [W, H] = await s.eval(() => [innerWidth, innerHeight]); await t.tap(W * 0.5, H * 0.3, 30); await step(s.page, 6); await s.wait(120); };
    const a = await stagePage('phone1', { query: '' });
    await tapOnce(a.s);
    const none = await vis(a.s);
    await suite.check({ id: 'hide.noCompanions', group: 'hide', issue: '§1.4', pkg: 'PLAT-TOUCH', title: 'no mount/guardian equipped → no 탑승/수호 buttons', session: a.s }, async () => ({ pass: !none.includes('mount') && !none.includes('guard') && none.includes('attack'), detail: none.join(' ') }));
    await suite.errors({ id: 'hide.stage.errors', group: 'hide' }, a.s);
    await a.s.close();
    const b = await stagePage('phone1');
    await tapOnce(b.s);
    const both = await vis(b.s);
    await suite.check({ id: 'hide.withCompanions', group: 'hide', issue: '§1.4', pkg: 'PLAT-TOUCH', title: 'mount + guardian equipped → 탑승 and 수호 shown', session: b.s }, async () => ({ pass: both.includes('mount') && both.includes('guard'), detail: both.join(' ') }));
    await b.s.close();
    const h = await env.page('phone1', `index.html?scene=hub&${CMP_Q}`, { settings: { quality: 'low' } });
    await h.waitGame('!!g.world?.player');
    await freeze(h.page); await settle(h.page, 60);
    await tapOnce(h);
    const hub = await vis(h);
    const HIDE = ['attack', 'sub', 'skill1', 'skill2', 'ult', 'swap', 'guard'];
    await suite.check({ id: 'hide.hub', group: 'hide', issue: '§1.4', pkg: 'PLAT-TOWN', title: 'hub: combat buttons and 수호 hidden, 탑승 and jump kept', session: h }, async () => ({ pass: !HIDE.some((x) => hub.includes(x)) && hub.includes('jump') && hub.includes('mount'), detail: hub.join(' ') }));
    await suite.errors({ id: 'hide.hub.errors', group: 'hide' }, h);
    await h.close();
  }, env);
} catch (e) {
  await suite.check({ id: 'harness', group: 'harness', title: 'suite ran to completion' }, async () => { throw e; });
} finally {
  await env.close();
}
process.exit(await suite.finish());
