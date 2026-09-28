// Performance budgets — MASTER_PLAN §5.2 (mobile settings first), feel §8, platform §5.2/§6.4, request #59.
//
//   node tools/qa/perf_budget.mjs [--profiles desk,phone1low,phone1,phone2,tablet,fhd2x] [--quick] [--scenes s05,s17r1,…]
//                                 [--frames 60] [--throttle 4]
//
// Deterministic counts: each page runs with the game loop frozen (lib/step.mjs); every measured frame is one game step
// followed by one counted render (lib/perfprobe.mjs). Counts do not depend on the machine load; real render times are
// reported for information only (this QA box runs at load 10–60).
// Scenes (full run): every stage s01–s20 (room r1: idle + scripted combat) and its boss room (direct entry, walk in, fight
// with attacks), s05 stress (12 enemies + bursts), s16 r2 (deep), one ultimate and one awakening per hero (tier-2 class),
// hub with a mount + 2 guardians, menu equip tab. --quick: s01, s05 stress, s16 r2, s17 r1, s20 r1, s14 boss, s20 boss,
// kael ultimate + awakening, hub.
// Checks per scene and profile (tier budgets high / medium / low):
//   grad        new gradients per rendered frame p95 ≤ 16 / 10 / 6 (max reported)                                  feel §8
//   canvas      canvases created after stage start = 0 (sites listed; painted bakes belong to load / boss intro)  feel §8
//   particles   live particles ≤ fx max 1400 / 900 / 500; ult/awakening peak ≤ 600/400/220 and 700/450/250           feel §8
//   passes      full-screen passes + special composites during ult/awakening ≤ 3 / 2 / 1 per frame                 feel §8
//   drawfx      no FX spawned while rendering (spawn rate would follow the render rate)                           R12
//   rng         Math.random consumed while rendering (listed, S4)                                                  #218
//   textures    assets.stats(): total ≤ budget (160 MB touch / 400 MB desktop), painted ≤ paintedBudget (24 / 64 MB)  #59
//   backing     game canvas backing store ≤ 1.0 / 1.6 / 3.7 MP                                                     platform §6.4
//   tpadcv      touch overlay backing DPR ≤ the game's DPR cap (1.0 low, 1.5 medium) and ≤ game.dpr; idle redraws ≤ 30 Hz
//   livecanvas  canvases alive (WeakRef, after gc) ≤ 20 MB on phone1 with the menu open                            platform §6.7
// Report: /tmp/claude-0/qa/tools/perf_budget.json (+ .md): per scene × profile table, top gradient / canvas / RNG sites,
// findings grouped by W4 bucket (by the file of the top call site). Exit 1 on any red check.
import { openEnv } from './lib/server.mjs';
import { freeze, step, stepUntil, settle } from './lib/step.mjs';
import { perfProbeInit, measureFrames, stats } from './lib/perfprobe.mjs';
import { Checks, writeReport, parseFlags, list } from './lib/report.mjs';
import { ownerOf } from './lib/owners.mjs';

const args = parseFlags();
const C = new Checks(false);
const findings = [];
const FR = Number(args.frames) || 60;
const QUICK = !!args.quick;

const PROFILES = {
  desk: { vp: 'desk', tier: 'high', quality: 'high', touch: false },
  phone1low: { vp: 'phone1', tier: 'low', quality: 'low', touch: true },
  phone1: { vp: 'phone1', tier: 'medium', quality: 'medium', touch: true },
  phone2: { vp: 'phone2', tier: 'medium', quality: 'medium', touch: true },
  tablet: { vp: 'tablet', tier: 'medium', quality: 'medium', touch: true },
  fhd2x: { vp: 'fhd2x', tier: 'high', quality: 'high', touch: false },
};
const BUDGET = {
  grad: { high: 16, medium: 10, low: 6 },
  parts: { high: 1400, medium: 900, low: 500 },
  ultParts: { high: 600, medium: 400, low: 220 },
  awkParts: { high: 700, medium: 450, low: 250 },
  passes: { high: 3, medium: 2, low: 1 },
  mp: { high: 3.7, medium: 1.6, low: 1.0 },
  dprCap: { high: 2.0, medium: 1.5, low: 1.0 },
};
const profiles = list(args.profiles, ['desk', 'phone1low']).filter((p) => PROFILES[p]);
const STAGES = Array.from({ length: 20 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`);
const HEROES = ['kael', 'sera', 'victor', 'bran', 'lia', 'azel'];

/** Scene list: {id, kind: 'room'|'boss'|'stress'|'ult'|'awaken'|'hub'|'menu', stage, room, hero} */
function sceneList() {
  const out = [];
  if (QUICK) {
    out.push({ id: 's01r1', kind: 'room', stage: 's01', room: 'r1' }, { id: 's05stress', kind: 'stress', stage: 's05', room: 'r1' },
      { id: 's16r2', kind: 'room', stage: 's16', room: 'r2' }, { id: 's17r1', kind: 'room', stage: 's17', room: 'r1' }, { id: 's20r1', kind: 'room', stage: 's20', room: 'r1' },
      { id: 's14boss', kind: 'boss', stage: 's14', room: 'boss' }, { id: 's20boss', kind: 'boss', stage: 's20', room: 'boss' },
      { id: 'ult.kael', kind: 'ult', stage: 's01', room: 'r1', hero: 'kael' }, { id: 'awaken.kael', kind: 'awaken', stage: 's01', room: 'r1', hero: 'kael' },
      { id: 'hub', kind: 'hub' }, { id: 'menu', kind: 'menu' });
  } else {
    for (const s of STAGES) out.push({ id: `${s}r1`, kind: 'room', stage: s, room: 'r1' }, { id: `${s}boss`, kind: 'boss', stage: s, room: 'boss' });
    out.push({ id: 's05stress', kind: 'stress', stage: 's05', room: 'r1' }, { id: 's16r2', kind: 'room', stage: 's16', room: 'r2' });
    for (const h of HEROES) out.push({ id: `ult.${h}`, kind: 'ult', stage: 's01', room: 'r1', hero: h }, { id: `awaken.${h}`, kind: 'awaken', stage: 's01', room: 'r1', hero: h });
    out.push({ id: 'hub', kind: 'hub' }, { id: 'menu', kind: 'menu' });
  }
  const only = list(args.scenes, null);
  return only ? out.filter((s) => only.includes(s.id)) : out;
}

// per-frame driver scripts (run in the page before each step; key(code, down) dispatches keyboard events)
const COMBAT = `
  if (i % 14 === 0) key('KeyX', true); if (i % 14 === 4) key('KeyX', false);
  if (i === 0) key('ArrowRight', true); if (i === 40) key('ArrowRight', false);
  if (i === 45) key('ArrowLeft', true); if (i === 60) key('ArrowLeft', false);
  if (p) { p.buffs.invincible = 9999; p.hp = Math.max(p.hp, 1); }`;
const BOSSFIGHT = `
  if (i % 12 === 0) key('KeyX', true); if (i % 12 === 4) key('KeyX', false);
  if (p) { p.buffs.invincible = 9999; if (w.boss && Math.abs(w.boss.cx - p.cx) > 160) { key(w.boss.cx > p.cx ? 'ArrowRight' : 'ArrowLeft', true); } else { key('ArrowRight', false); key('ArrowLeft', false); } }`;

/** Prepared stage page (frozen) for a profile. */
async function openProfile(env, prof) {
  const P = PROFILES[prof];
  const s = await env.page(P.vp, 'index.html?scene=stage&stage=s01&room=r1', { settings: { quality: P.quality }, initScripts: [perfProbeInit()] });
  await s.waitGame('!!g.world?.player');
  await freeze(s.page);
  await settle(s.page, 30);
  return s;
}

/** Go to a stage room inside the same page and wait until it runs; enemies/triggers kept (real rooms). */
async function gotoRoom(s, stage, room, { hero = null } = {}) {
  await s.eval(async ({ stage, room, hero }) => {
    const g = window.__game;
    if (hero && g.state?.hero?.charId !== hero) {
      const { newGameState } = await import('/src/game/state.js');
      g.state = newGameState({ slot: 1, difficulty: 'normal', charId: hero });
    }
    window.__perf.armed = false;
    g.go('stage', { stageId: stage, roomId: room }, { fade: false });
  }, { stage, room, hero });
  // let the async stage load (assets, painted bakes) finish: real time passes between these evaluates
  for (let i = 0; i < 80; i++) {
    const ok = await s.eval(({ stage }) => { const g = window.__game, w = g.world; return !!(w?.player && (w.stageId ?? w.stage?.id ?? w.def?.id) === stage && g.top?.world === w); }, { stage }).catch(() => false);
    if (ok) break;
    await step(s.page, 2, false);
    await s.wait(100);
  }
  await settle(s.page, 20);
  await waitBakes(s);
}

/** Waits (real time, ≤ 8 s) until no painted rig / painted boss / enemy rig is still loading or baking. */
async function waitBakes(s, maxMs = 8000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < maxMs) {
    last = await s.eval(async () => {
      let n = 0;
      try { const E = await import('/src/render/painted/enemy_kit.js'); n += Object.values(E.rigStats()).filter((r) => !r.ready && !r.failed).length; } catch { /* */ }
      try { const R = await import('/src/render/painted/registry.js'); n += R.paintedIds().filter((id) => R.paintedState(id) === 'loading').length; } catch { /* */ }
      return n;
    });
    if (!last) break;
    await step(s.page, 1, true);
    await s.wait(150);
  }
  await settle(s.page, 5);
  return last;
}

/** Boss room: walk right until the boss exists, close intro/dialogues, wait for the fight. */
async function enterFight(s) {
  await s.page.keyboard.down('ArrowRight');
  const n = await stepUntil(s.page, '!!w.boss', 900);
  await s.page.keyboard.up('ArrowRight');
  for (let i = 0; i < 120; i++) {
    const st = await s.eval(() => { const g = window.__game, w = g.world; return { top: g.top?.name, cut: !!w?.cutscene, active: !!w?.bossActive, boss: !!w?.boss }; });
    if (st.top === 'stage' && !st.cut && (st.active || i > 60)) return { boss: st.boss, n };
    if (st.top === 'dialogue') { await s.page.keyboard.down('Enter'); await step(s.page, 2, false); await s.page.keyboard.up('Enter'); }
    else if (st.top === 'bossIntro') { await s.page.keyboard.down('KeyZ'); await step(s.page, 2, false); await s.page.keyboard.up('KeyZ'); }
    await step(s.page, 10, false);
  }
  return { boss: await s.eval(() => !!window.__game.world?.boss), n };
}

/** Makes the current world safe to measure: invulnerable hero, story triggers off (enemies stay). */
const prepWorld = (s) => s.eval(() => {
  const w = window.__game.world, p = w?.player;
  if (!p) return;
  p.buffs.invincible = 9999;
  for (const e of w.entities || []) if (e.kind === 'trigger' || e.constructor?.name === 'StoryTrigger') e.dead = true;
});

const envInfo = (s) => s.eval(() => {
  const g = window.__game, c = g.canvas, st = g.assets?.stats?.() ?? null;
  return {
    backing: { w: c.width, h: c.height, mp: +((c.width * c.height) / 1e6).toFixed(3), dpr: g.dpr ?? null },
    tier: g.tier ?? g.qualityTier ?? g.quality ?? g.settings?.quality, fxMax: g.world?.fx?.max ?? null, fxQ: g.world?.fx?.quality ?? null,
    tex: st ? { total: st.total, budget: st.budget, painted: st.painted, paintedBudget: st.paintedBudget, groups: st.groups, evictions: st.evictions } : null,
  };
});

const MB = (b) => +(b / 1048576).toFixed(1);
/** file that owns a call site; for "creator ← caller" chains a generic canvas helper hands the blame to its caller */
const HELPERS = /^src\/render\/painted\/(enemy_kit|kit)\.js:/;
const siteFile = (site) => {
  const parts = String(site || '').replace(/^[a-z]+ ← /, '').split(' ← ');
  const pick = parts.length > 1 && HELPERS.test(parts[0]) ? parts[1] : parts[0];
  return pick.split(':')[0];
};

/** Evaluate one measured scene against the budgets; records checks + findings. */
function judge(prof, sc, m, info, extra = {}) {
  const T = PROFILES[prof].tier;
  const id = `${prof}.${sc.id}`;
  const fr = m.frames;
  const grad = stats(fr.map((f) => f.grad)), parts = stats(fr.map((f) => f.parts)), ms = stats(fr.map((f) => f.ms));
  const canv = fr.reduce((a, f) => a + f.canv, 0) + (extra.canvArmed || 0);
  const fx = fr.reduce((a, f) => a + f.fx, 0), rng = fr.reduce((a, f) => a + f.rng, 0);
  const passes = stats(fr.map((f) => f.full + f.special));
  const row = { prof, scene: sc.id, kind: sc.kind, tier: T, frames: fr.length, grad, parts, ms, canv, fx, rng, passes, draws: stats(fr.map((f) => f.draw)), mainDraw: stats(fr.map((f) => f.mainDraw)), sites: m.sites, info, ...extra };
  const topGrad = m.sites.grad.map(([k, n]) => `${k} ×${n}`).slice(0, 4).join(', ');
  // gradients
  const gOk = grad.p95 <= BUDGET.grad[T];
  C.add(`${id}.grad`, gOk ? (grad.max > BUDGET.grad[T] ? 'warn' : 'pass') : 'fail', `new gradients/frame p50 ${grad.p50} p95 ${grad.p95} max ${grad.max} (budget ${BUDGET.grad[T]}, ${T})${topGrad ? ` · top ${topGrad}` : ''}`);
  if (!gOk) findings.push({ id: `perf.grad.${prof}.${sc.id}`, sev: 'S3', kind: 'perf', title: `${grad.p95} new gradients per frame (p95) in ${sc.id} at ${T} — budget ${BUDGET.grad[T]}`, detail: `top sites: ${topGrad}`, file: siteFile(m.sites.grad[0]?.[0]) || 'src/render/background.js', ...ownerOf(siteFile(m.sites.grad[0]?.[0]) || 'src/render/background.js'), repro: `node tools/qa/perf_budget.mjs --profiles ${prof} --scenes ${sc.id}` });
  // canvases after stage start
  const canvSites = (extra.canvSites || m.sites.canv).map(([k, n]) => `${k} ×${n}`);
  C.add(`${id}.canvas`, canv === 0 ? 'pass' : 'fail', canv === 0 ? 'no canvas created after stage start' : `${canv} canvas(es) created after stage start: ${canvSites.slice(0, 5).join(', ')}`);
  if (canv) {
    const byFile = {};
    for (const [k, n] of (extra.canvSites || m.sites.canv)) (byFile[siteFile(k)] ||= []).push(`${k} ×${n}`);
    for (const [file, ss] of Object.entries(byFile)) findings.push({ id: `perf.canvas.${prof}.${sc.id}.${file}`, sev: 'S3', kind: 'perf', title: `canvas created after stage start in ${sc.id} (${prof}) — pool it at init / bake during load or the boss intro`, detail: ss.join(', '), file, ...ownerOf(file), repro: `node tools/qa/perf_budget.mjs --profiles ${prof} --scenes ${sc.id}` });
  }
  // particles
  const pMax = sc.kind === 'ult' ? BUDGET.ultParts[T] : sc.kind === 'awaken' ? BUDGET.awkParts[T] : BUDGET.parts[T];
  C.add(`${id}.particles`, parts.max <= pMax ? 'pass' : 'fail', `live particles max ${parts.max} (budget ${pMax}; fx.max ${info.fxMax}, fx.quality ${info.fxQ})`);
  if (parts.max > pMax) findings.push({ id: `perf.parts.${prof}.${sc.id}`, sev: 'S3', kind: 'perf', title: `${parts.max} live particles in ${sc.id} at ${T} (budget ${pMax})`, file: sc.kind === 'room' || sc.kind === 'stress' ? 'src/core/particles.js' : 'src/game/skills.js', ...ownerOf(sc.kind === 'room' || sc.kind === 'stress' ? 'src/core/particles.js' : 'src/game/skills.js') });
  // full-screen passes during ult / awakening
  if (sc.kind === 'ult' || sc.kind === 'awaken') {
    const ok = passes.p95 <= BUDGET.passes[T];
    C.add(`${id}.passes`, ok ? 'pass' : 'fail', `full-screen passes + special composites per frame p95 ${passes.p95} max ${passes.max} (budget ${BUDGET.passes[T]})`);
    if (!ok) findings.push({ id: `perf.passes.${prof}.${sc.id}`, sev: 'S3', kind: 'perf', title: `${passes.p95} full-screen passes per frame (p95) during ${sc.id} at ${T} (budget ${BUDGET.passes[T]})`, file: 'src/render/ultfx.js', ...ownerOf('src/render/ultfx.js') });
  }
  // FX spawned while rendering
  const fxSites = m.sites.fx.map(([k, n]) => `${k} ×${n}`);
  C.add(`${id}.drawfx`, fx === 0 ? 'pass' : 'fail', fx === 0 ? 'no FX spawned while rendering' : `${fx} FX spawn(s) while rendering: ${fxSites.slice(0, 4).join(', ')}`);
  if (fx) { const f = siteFile(m.sites.fx[0]?.[0]); findings.push({ id: `perf.drawfx.${prof}.${sc.id}`, sev: 'S3', kind: 'perf', title: `FX spawned from a draw path in ${sc.id}: the spawn rate follows the render rate`, detail: fxSites.join(', '), file: f, ...ownerOf(f) }); }
  // RNG while rendering (S4, listed)
  C.add(`${id}.rng`, rng === 0 ? 'pass' : 'warn', rng === 0 ? 'rendering consumed no Math.random' : `${rng} Math.random call(s) while rendering ${fr.length} frames: ${m.sites.rng.map(([k, n]) => `${k} ×${n}`).slice(0, 4).join(', ')}`);
  // textures (#59)
  if (info.tex) {
    const t = info.tex, okT = t.total <= t.budget, okP = t.painted <= t.paintedBudget;
    C.add(`${id}.textures`, okT && okP ? 'pass' : 'fail', `decoded ${MB(t.total)} / ${MB(t.budget)} MB, painted ${MB(t.painted)} / ${MB(t.paintedBudget)} MB (evictions ${t.evictions})`);
    if (!okT || !okP) findings.push({ id: `perf.tex.${prof}.${sc.id}`, sev: 'S3', kind: 'perf', title: `texture budget exceeded in ${sc.id} (${prof}): decoded ${MB(t.total)}/${MB(t.budget)} MB, painted ${MB(t.painted)}/${MB(t.paintedBudget)} MB`, file: 'src/core/assets.js', ...ownerOf('src/core/assets.js') });
  } else C.add(`${id}.textures`, 'fail', 'assets.stats() unavailable');
  // backing store
  const okB = info.backing.mp <= BUDGET.mp[T] + 0.005;
  C.add(`${id}.backing`, okB ? 'pass' : 'fail', `${info.backing.w}×${info.backing.h} = ${info.backing.mp} MP (budget ${BUDGET.mp[T]} MP, dpr ${info.backing.dpr})`);
  if (!okB) findings.push({ id: `perf.backing.${prof}.${sc.id}`, sev: 'S3', kind: 'perf', title: `backing store ${info.backing.mp} MP over the ${T} budget ${BUDGET.mp[T]} MP`, file: 'src/core/game.js', ...ownerOf('src/core/game.js') });
  return row;
}

const env = await openEnv({ browserArgs: ['--js-flags=--expose-gc'] });
const rows = [];
const t0 = Date.now();
try {
  for (const prof of profiles) {
    const P = PROFILES[prof];
    let s;
    try { s = await openProfile(env, prof); } catch (e) { C.add(`${prof}.harness`, 'error', String(e?.message || e).split('\n')[0]); continue; }
    if (args.throttle) { try { await s.cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(args.throttle) }); } catch { /* */ } }
    for (const sc of sceneList()) {
      try {
        let script = '';
        let extra = {};
        if (sc.kind === 'hub') {
          await s.eval(async () => {
            const g = window.__game;
            const S = await import('/src/game/companion_state.js');
            const E = await import('/src/game/companion_events.js');
            E.applyCompanionDebug?.(g.state, 'cmp=mt_warhorse,gd_fairy,gd_imp&mount=mt_warhorse&guards=gd_fairy,gd_imp&ch=8');
            window.__perf.armed = false;
            g.go('hub', {}, { fade: false });
            return !!S;
          });
          await stepUntil(s.page, "g.top?.name === 'hub' && !!w?.player", 300);
          await settle(s.page, 60); await s.wait(400); await settle(s.page, 10);
          script = `if (i === 0) key('ArrowRight', true); if (i === 30) { key('ArrowRight', false); key('ArrowLeft', true); } if (i === 55) key('ArrowLeft', false);`;
        } else if (sc.kind === 'menu') {
          await s.eval(() => { window.__perf.armed = false; });
          await gotoRoom(s, 's04', 'r1');
          await s.eval(() => { const g = window.__game; g.push('menu', { world: g.world, tab: 'equip' }); });
          await settle(s.page, 20); await s.wait(300); await settle(s.page, 10);
        } else {
          await gotoRoom(s, sc.stage, sc.room, { hero: sc.hero });
          await prepWorld(s);
          if (sc.kind === 'boss') {
            const f = await enterFight(s);
            extra.boss = f.boss;
            if (!f.boss) C.add(`${prof}.${sc.id}.boss`, 'fail', 'the boss never appeared (walked right 15 s, closed intro/dialogues)');
            script = BOSSFIGHT;
          } else if (sc.kind === 'stress') {
            await s.eval(async () => {
              const { STAGES } = await import('/src/data/stages.js');
              const g = window.__game, w = g.world, p = w.player;
              const ids = (STAGES.s05.enemies || []).map((e) => (typeof e === 'string' ? e : e.id)).filter(Boolean);
              for (let k = 0; k < 12; k++) { const id = ids[k % Math.max(1, ids.length)] || 'skeleton'; try { w.spawnEnemy(id, p.cx + (k % 2 ? 1 : -1) * (120 + 40 * k), p.bottom - 4); } catch { /* */ } }
            });
            await waitBakes(s);
            script = `${COMBAT}
              if (i % 20 === 10 && w?.fx) { w.fx.burst('blood', p.cx + 60, p.cy, 18); w.fx.burst('spark', p.cx + 80, p.cy - 10, 18); }`;
          } else if (sc.kind === 'ult' || sc.kind === 'awaken') {
            await s.eval(async (kind) => {
              const { CLASSES } = await import('/src/data/classes.js');
              const g = window.__game, w = g.world, p = w.player;
              const t2 = Object.values(CLASSES).find((c) => c.charId === p.hero.charId && c.tier === 2);
              if (t2) { p.hero.classId = t2.id; p.refreshStats?.(); }
              for (const e of w.entities || []) if (e.kind === 'enemy') e.dead = true;
              w.run.sp = 100; w.run.aw = kind === 'awaken' ? 100 : 0;
            }, sc.kind);
            await settle(s.page, 10);
            script = sc.kind === 'ult' ? `if (i === 0) key('KeyF', true); if (i === 3) key('KeyF', false); if (p) p.buffs.invincible = 9999;`
              : `if (i === 0) key('KeyV', true); if (i === 3) key('KeyV', false); if (p) p.buffs.invincible = 9999;`;
          } else script = COMBAT;
        }
        // canvases created from here on (after stage start) count against the "0 after stage start" budget
        await s.eval(() => { window.__perf.clearSites(); window.__perf.armed = true; });
        const nFrames = sc.kind === 'ult' || sc.kind === 'awaken' ? Math.max(FR, 150) : sc.kind === 'boss' ? Math.max(FR, 120) : FR;
        const m = await measureFrames(s.page, nFrames, script);
        const armed = await s.eval(() => { const P = window.__perf; P.armed = false; return [...P.sites.canv.entries()].sort((a, b) => b[1] - a[1]); });
        await s.eval(() => { for (const k of ['KeyX', 'ArrowRight', 'ArrowLeft', 'KeyF', 'KeyV']) window.dispatchEvent(new KeyboardEvent('keyup', { code: k, key: k, bubbles: true })); });
        extra.canvArmed = Math.max(0, armed.reduce((a, [, n]) => a + n, 0) - m.frames.reduce((a, f) => a + f.canv, 0));
        extra.canvSites = armed;
        const info = await envInfo(s);
        if (sc.kind === 'ult' || sc.kind === 'awaken') {
          const ev = await s.eval(() => ({ ult: window.__game.world?.run?.sp, aw: window.__game.world?.run?.aw }));
          extra.gauges = ev;
          const fired = m.frames.some((f) => f.top === 'ultCutin' || f.top === 'awakenCutin') || (ev.ult ?? 100) < 100;
          if (!fired) C.add(`${prof}.${sc.id}.cast`, 'fail', `${sc.kind} did not start (gauges ${JSON.stringify(ev)})`);
        }
        rows.push(judge(prof, sc, m, info, extra));
        // let the ult/awakening/cut-in end before the next scene
        await stepUntil(s.page, "!w || (!w.cutscene && (g.top?.name === 'stage' || g.top?.name === 'hub' || g.top?.name === 'menu'))", 1200);
        if (sc.kind === 'menu') await s.eval(() => { const g = window.__game; for (let i = 0; i < 3 && g.top?.name !== 'stage'; i++) g.pop(); });
      } catch (e) {
        C.add(`${prof}.${sc.id}.harness`, 'error', String(e?.message || e).split('\n')[0].slice(0, 300));
      }
    }
    // #tpadcv (touch profiles): backing DPR and idle redraw rate in real time
    if (P.touch) {
      try {
        await gotoRoom(s, 's01', 'r1');
        const { Touch } = await import('./lib/touch.mjs');
        const { unfreeze } = await import('./lib/step.mjs');
        await unfreeze(s.page);
        const t = new Touch(s.cdp, s.page);
        const [W, H] = await s.eval(() => [innerWidth, innerHeight]);
        await t.tap(W * 0.5, H * 0.3, 40);
        await s.wait(800);
        const r = await s.eval(async () => {
          const cv = document.getElementById('tpadcv'), g = window.__game;
          if (!cv) return null;
          const css = cv.getBoundingClientRect();
          const dpr = css.width ? cv.width / css.width : 0;
          const ctx = cv.getContext('2d');
          let n = 0; const o = ctx.clearRect.bind(ctx); ctx.clearRect = (...a) => { n++; return o(...a); };
          const run = g.world?.run; if (run) { run.sp = 0; run.aw = 0; }
          await new Promise((res) => setTimeout(res, 2000));
          ctx.clearRect = o;
          return { dpr: +dpr.toFixed(3), gameDpr: g.dpr ?? null, w: cv.width, h: cv.height, cssW: css.width, cssH: css.height, redraws2s: n, visible: getComputedStyle(cv).display !== 'none' };
        });
        await freeze(s.page);
        if (!r) C.add(`${prof}.tpadcv`, 'fail', 'no #tpadcv canvas');
        else {
          const cap = Math.min(BUDGET.dprCap[P.tier], r.gameDpr ?? 99);
          const okD = r.dpr <= cap + 0.02, okR = r.redraws2s / 2 <= 30;
          C.add(`${prof}.tpadcv.dpr`, okD ? 'pass' : 'fail', `#tpadcv ${r.w}×${r.h} for ${r.cssW.toFixed(0)}×${r.cssH.toFixed(0)} CSS px: DPR ${r.dpr} (cap ${cap}: tier ${BUDGET.dprCap[P.tier]}, game ${r.gameDpr})`);
          C.add(`${prof}.tpadcv.redraw`, okR ? (r.redraws2s > 4 ? 'warn' : 'pass') : 'fail', `${r.redraws2s} redraws in 2 s idle (≤ 30 Hz; ideally only on state change)`);
          if (!okD) findings.push({ id: `perf.tpadcv.dpr.${prof}`, sev: 'S3', kind: 'perf', title: `#tpadcv backing DPR ${r.dpr} above the cap ${cap} (${prof})`, file: 'src/core/touchpad.js', ...ownerOf('src/core/touchpad.js') });
          if (!okR) findings.push({ id: `perf.tpadcv.redraw.${prof}`, sev: 'S3', kind: 'perf', title: `#tpadcv redraws ${r.redraws2s / 2} Hz while idle (${prof})`, file: 'src/core/touchpad.js', ...ownerOf('src/core/touchpad.js') });
          rows.push({ prof, scene: 'tpadcv', kind: 'tpadcv', ...r });
        }
      } catch (e) { C.add(`${prof}.tpadcv.harness`, 'error', String(e?.message || e).split('\n')[0]); }
    }
    // live canvases with the menu open (phone1 budget ≤ 20 MB; reported for every profile)
    try {
      await s.eval(() => { const g = window.__game; if (g.world && g.top?.name !== 'menu') g.push('menu', { world: g.world, tab: 'equip' }); });
      await settle(s.page, 20); await s.wait(300); await settle(s.page, 5);
      const live = await s.eval(() => { try { window.gc?.(); } catch { /* */ } return window.__perf.live(); });
      const lim = prof.startsWith('phone1') ? 20 : null;
      C.add(`${prof}.livecanvas`, lim && MB(live.bytes) > lim ? 'fail' : 'pass', `${live.n} live canvases, ${MB(live.bytes)} MB with the menu open${lim ? ` (budget ${lim} MB)` : ''}`);
      if (lim && MB(live.bytes) > lim) findings.push({ id: `perf.livecanvas.${prof}`, sev: 'S3', kind: 'perf', title: `${MB(live.bytes)} MB of live canvases with the menu open on ${prof} (budget ${lim} MB)`, file: 'src/scenes/menu/common.js', ...ownerOf('src/scenes/menu/common.js') });
      rows.push({ prof, scene: 'livecanvas', kind: 'mem', live });
    } catch (e) { C.add(`${prof}.livecanvas.harness`, 'error', String(e?.message || e).split('\n')[0]); }
    const errs = [...new Set(s.errs)];
    C.add(`${prof}.errors`, errs.length ? 'fail' : 'pass', errs.length ? `${errs.length} page/console error(s): ${errs.slice(0, 3).join(' || ')}` : 'no page/console errors');
    if (errs.length) findings.push({ id: `perf.errors.${prof}`, sev: 'S2', kind: 'errors', title: `page/console errors during the perf walk (${prof})`, detail: errs.slice(0, 5).join(' || '), file: 'src/game/world.js', ...ownerOf('src/game/world.js') });
    await s.close();
  }
} finally {
  await env.close();
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────────
const table = rows.filter((r) => r.grad).map((r) => `| ${r.prof} | ${r.scene} | ${r.grad.p50}/${r.grad.p95}/${r.grad.max} | ${r.canv} | ${r.parts.max} | ${r.passes.p95} | ${r.fx} | ${r.rng} | ${r.mainDraw.p50} | ${r.ms.p50}/${r.ms.p95} | ${r.info?.tex ? `${MB(r.info.tex.total)}/${MB(r.info.tex.painted)}` : '-'} |`).join('\n');
const gradSites = {};
for (const r of rows) for (const [k, n] of r.sites?.grad || []) gradSites[k] = (gradSites[k] || 0) + n;
const md = `\n## Scenes\n\n| profile | scene | grad p50/p95/max | canvases | particles max | passes p95 | draw-fx | render RNG | main draws p50 | ms p50/p95 (info) | tex MB decoded/painted |\n|---|---|---|---|---|---|---|---|---|---|---|\n${table}\n\n## Top gradient sites (all scenes)\n\n${Object.entries(gradSites).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `- ${k} ×${n}`).join('\n')}\n`;
const c = C.counts();
const out = writeReport('perf_budget', { tool: 'perf_budget', when: new Date().toISOString(), durationMs: Date.now() - t0, profiles, quick: QUICK, frames: FR, counts: c, checks: C.list, rows, findings }, { title: 'Performance budgets (§5.2)', findings, extraMd: md });
console.log(`\nperf_budget: ${c.pass} pass, ${c.warn} warn, ${c.fail} fail, ${c.error} error — ${rows.length} rows in ${((Date.now() - t0) / 60000).toFixed(1)} min — ${out.json}`);
process.exit(C.red.length ? 1 : 0);
