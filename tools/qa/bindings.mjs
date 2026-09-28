// Binding collision and touch-layout check — MASTER_PLAN §1.4 ("Binding collision check"), §5.1 static row.
//
//   node tools/qa/bindings.mjs [--no-browser] [--quiet]
//
// Node part (src/data/controls.js + the real input.refreshBindings()/remap() from src/core/input.js, no browser):
//   keys.defaults / pad.<preset>.<confirm>   no key code / pad index maps to two gameplay actions, none maps to two menu
//                                            semantics; gameplay×menu overlaps are listed and must be documented dual uses
//   bound.<device>                           every remappable action (+ movement) has a binding, except the documented
//                                            unbound ones (pad: awaken in both presets, map in classic)
//   remap.fuzz.<device>                      remap(action, v) for every remappable action × every candidate never produces a
//                                            gameplay collision; an action left without a binding only when the remapped
//                                            action had none (documented, the options screen toasts it)
//   touch.ids                                every touch binding names a real touchpad button id
// Browser part (one page, fixed viewports; skipped with --no-browser):
//   runtime.bindings                         the page's input.bindings equal the Node model (arcade/classic × south/east)
//   glyphs.<mode>                            prompts.glyphFor(action, mode) exists for every gameplay action (awaken → ult on pad)
//   touch.<class>.<scale>[.left]             the canvas pad (touchpad.buttons({all:true})) at size classes S/M/L (+ tablet band)
//                                            × touchScale 0.8/1/1.3 × right/left-handed: every button ≥ 44 CSS px, circle gaps
//                                            ≥ 12 px, Ⅱ/가방 ≥ 44 px and clear of the pad, everything inside the safe rect
// Report: /tmp/claude-0/qa/tools/bindings.json (+ .md). Exit 1 on any red check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Checks, writeReport, parseFlags } from './lib/report.mjs';
import { ownerOf } from './lib/owners.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = parseFlags();
const C = new Checks(!!args.quiet);
const findings = [];
const fail = (id, title, file, detail, sev = 'S2') => findings.push({ id, sev, kind: 'bindings', title, file, detail, ...ownerOf(file) });

const CT = await import(path.join(ROOT, 'src/data/controls.js'));
const { input } = await import(path.join(ROOT, 'src/core/input.js'));

const MOVE = ['left', 'right', 'up', 'down'];
const GAMEPLAY = [...MOVE, 'jump', 'attack', 'dash', 'sub', 'skill1', 'skill2', 'ult', 'swap', 'awaken', 'mount', 'guard', 'map', 'menu'];
const MENU = ['confirm', 'cancel', 'prevTab', 'nextTab', 'alt', 'alt2', 'viewL', 'viewR', 'viewReset'];
// documented gameplay × menu dual uses (MASTER_PLAN §1.4 bindings table + rules); pad confirm/cancel sit on 0/1 by ctrlConfirm
const DUAL_KEY = new Set(['jump/confirm', 'attack/cancel', 'menu/confirm', 'menu/cancel', 'swap/prevTab', 'swap/nextTab', 'skill1/prevTab', 'skill2/nextTab', 'sub/alt', 'dash/alt2']);
const DUAL_PAD = new Set(['skill1/prevTab', 'skill2/nextTab', 'guard/viewReset', 'sub/alt', 'swap/alt2', 'dash/alt2']);
const padDual = (g, m, idx) => DUAL_PAD.has(`${g}/${m}`) || ((m === 'confirm' || m === 'cancel') && (idx === 0 || idx === 1));

/** code/index → actions, from a {action: [values]} map (only integer pad indices / string key codes). */
function invert(map, kind) {
  const inv = new Map();
  for (const [a, list] of Object.entries(map)) for (const v of list || []) {
    if (kind === 'pad' && !Number.isInteger(v)) continue;
    if (!inv.has(v)) inv.set(v, new Set());
    inv.get(v).add(a);
  }
  return inv;
}
/** { gg: [[v, acts]], mm: [...], gmUndoc: [...], gmDoc: [...] } */
function collisions(map, kind) {
  const out = { gg: [], mm: [], gmDoc: [], gmUndoc: [] };
  for (const [v, set] of invert(map, kind)) {
    const acts = [...set];
    const g = acts.filter((a) => GAMEPLAY.includes(a)), m = acts.filter((a) => MENU.includes(a));
    if (g.length > 1) out.gg.push([v, g]);
    if (m.length > 1) out.mm.push([v, m]);
    for (const a of g) for (const b of m) {
      const doc = kind === 'pad' ? padDual(a, b, v) : DUAL_KEY.has(`${a}/${b}`);
      (doc ? out.gmDoc : out.gmUndoc).push([v, `${a}/${b}`]);
    }
  }
  return out;
}
const fmtC = (l) => l.map(([v, a]) => `${v}:${Array.isArray(a) ? a.join('+') : a}`).join(', ');

function judgeMap(id, map, kind, file) {
  const c = collisions(map, kind);
  const red = c.gg.length || c.mm.length;
  if (c.gg.length) fail(`${id}.gameplay`, `${kind} value shared by two gameplay actions: ${fmtC(c.gg)}`, file, '');
  if (c.mm.length) fail(`${id}.menu`, `${kind} value shared by two menu semantics: ${fmtC(c.mm)}`, file, '');
  C.add(id, red ? 'fail' : c.gmUndoc.length ? 'warn' : 'pass',
    `${red ? `gameplay×gameplay ${fmtC(c.gg) || '-'}; menu×menu ${fmtC(c.mm) || '-'}; ` : 'no gameplay or menu collisions; '}documented dual uses ${c.gmDoc.length}${c.gmUndoc.length ? `; UNDOCUMENTED gameplay×menu ${fmtC(c.gmUndoc)}` : ''}`,
    { metrics: c });
}

// ── 1. defaults and presets (the real refreshBindings) ────────────────────────────────────────────────
input.game = { settings: { ctrlPreset: 'arcade', ctrlConfirm: 'south' } };
const snap = {};
for (const preset of ['arcade', 'classic']) for (const confirm of ['south', 'east']) {
  input.game.settings = { ctrlPreset: preset, ctrlConfirm: confirm, ctrlMap: null, keyMap: null };
  const b = input.refreshBindings();
  snap[`${preset}.${confirm}`] = JSON.parse(JSON.stringify({ key: b.key, pad: b.pad }));
  if (preset === 'arcade' && confirm === 'south') judgeMap('keys.defaults', b.key, 'key', 'src/data/controls.js');
  judgeMap(`pad.${preset}.${confirm}`, b.pad, 'pad', 'src/data/controls.js');
}

// ── 2. every action bound (documented exceptions) ─────────────────────────────────────────────────────
{
  const miss = [];
  const k = snap['arcade.south'].key;
  for (const a of [...MOVE, ...CT.REMAPPABLE, 'menu', ...MENU]) if (!(k[a] || []).length) miss.push(`key:${a}`);
  C.add('bound.key', miss.length ? 'fail' : 'pass', miss.length ? `unbound: ${miss.join(', ')}` : `all ${MOVE.length + CT.REMAPPABLE.length + 1 + MENU.length} keyboard actions bound`);
  if (miss.length) fail('bound.key', `keyboard actions without a key: ${miss.join(', ')}`, 'src/data/controls.js', '');
  const EXPECT_UNBOUND = { arcade: ['awaken'], classic: ['awaken', 'map'] };
  for (const preset of ['arcade', 'classic']) {
    const p = snap[`${preset}.south`].pad;
    const unbound = [...MOVE, ...CT.REMAPPABLE, 'menu', ...MENU.filter((m) => !['viewL', 'viewR'].includes(m))].filter((a) => !(p[a] || []).length);
    const extra = unbound.filter((a) => !EXPECT_UNBOUND[preset].includes(a));
    const gone = EXPECT_UNBOUND[preset].filter((a) => !unbound.includes(a));
    C.add(`bound.pad.${preset}`, extra.length ? 'fail' : 'pass', `unbound ${unbound.join(', ') || 'none'} (documented: ${EXPECT_UNBOUND[preset].join(', ')})${gone.length ? `; now bound: ${gone.join(', ')}` : ''}`);
    if (extra.length) fail(`bound.pad.${preset}`, `pad ${preset}: actions without a button: ${extra.join(', ')}`, 'src/data/controls.js', '');
    const view = ['viewL', 'viewR'].filter((a) => !(p[a] || []).some((v) => typeof v === 'string' && /^rsx/.test(v)));
    if (view.length) { C.add(`bound.pad.${preset}.view`, 'fail', `turntable actions without the right stick: ${view.join(', ')}`); fail(`bound.pad.${preset}.view`, `viewL/viewR not on the right stick X`, 'src/data/controls.js', ''); }
  }
}

// ── 3. remap fuzz: no collision ever; an action is left unbound only by the documented "nothing to swap" case ─
for (const dev of ['key', 'pad']) {
  const cands = dev === 'pad'
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 9, 12, 16, 17, 20]
    : ['KeyZ', 'Space', 'KeyX', 'KeyJ', 'KeyC', 'ShiftLeft', 'KeyK', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyQ', 'KeyE', 'KeyV', 'KeyR', 'KeyG', 'Tab', 'KeyM', 'KeyI',
      'KeyT', 'KeyY', 'KeyU', 'KeyH', 'KeyL', 'KeyB', 'KeyN', 'Digit1', 'Comma', 'Period', 'Slash', 'Escape', 'Enter', 'ArrowUp', 'KeyW', 'Backspace'];
  const bad = [], unboundOk = [], rejected = [];
  let n = 0;
  for (const preset of dev === 'pad' ? ['arcade', 'classic'] : ['arcade']) {
    for (const action of CT.REMAPPABLE) for (const v of cands) {
      input.game.settings = { ctrlPreset: preset, ctrlConfirm: 'south', ctrlMap: null, keyMap: null };
      input.refreshBindings();
      const before = JSON.parse(JSON.stringify(input.bindings[dev]));
      const r = input.remap(dev, action, v);
      n++;
      if (!r.ok) { rejected.push(`${action}←${v}:${r.reason}`); continue; }
      const map = input.bindings[dev];
      const c = collisions(map, dev);
      if (c.gg.length) bad.push(`${preset} ${action}←${v}: ${fmtC(c.gg)}`);
      if (!(map[action] || []).includes(v)) bad.push(`${preset} ${action}←${v}: not applied (${JSON.stringify(map[action])})`);
      for (const a of CT.REMAPPABLE) {
        if ((before[a] || []).length && !(map[a] || []).length) {
          if (!(before[action] || []).length && r.swapped === a) unboundOk.push(`${preset} ${action}←${v} leaves ${a} empty`);
          else bad.push(`${preset} ${action}←${v}: ${a} lost its binding (swapped ${r.swapped})`);
        }
      }
    }
  }
  // reserved values must be rejected (START/D-pad/Escape/Enter/arrows/W)
  const mustReject = dev === 'pad' ? [9, 12, 16] : ['Escape', 'Enter', 'ArrowUp', 'KeyW'];
  const leaked = mustReject.filter((v) => !rejected.some((x) => x.includes(`←${v}:`)));
  const red = bad.length || leaked.length;
  C.add(`remap.fuzz.${dev}`, red ? 'fail' : 'pass', `${n} remaps; ${bad.length} bad${bad.length ? ': ' + bad.slice(0, 5).join('; ') : ''}; reserved rejected ${leaked.length ? 'NOT for ' + leaked.join(',') : 'ok'}; documented empty-after-swap ${unboundOk.length}${unboundOk.length ? ' (e.g. ' + unboundOk.slice(0, 2).join('; ') + ')' : ''}`, { metrics: { bad, unboundOk: unboundOk.length } });
  if (red) fail(`remap.fuzz.${dev}`, `input.remap(${dev}) produced a collision or lost a binding: ${[...bad.slice(0, 3), ...leaked.map((v) => `reserved ${v} accepted`)].join('; ')}`, 'src/core/input.js', '');
}

// ── 4. touch binding ids exist on the canvas pad ─────────────────────────────────────────────────────
{
  const tsrc = fs.readFileSync(path.join(ROOT, 'src/core/touchpad.js'), 'utf8');
  const ids = new Set(['stick']);
  for (const re of [/export const PAD_IDS\s*=\s*\[([^\]]*)\]/, /export const SYS_IDS\s*=\s*\[([^\]]*)\]/]) {
    const m = tsrc.match(re);
    if (m) for (const x of m[1].matchAll(/'([^']+)'/g)) ids.add(x[1]);
  }
  const missing = [];
  for (const [a, list] of Object.entries(CT.TOUCH_BINDINGS)) for (const id of list) if (!ids.has(id)) missing.push(`${a}→${id}`);
  const noTouch = GAMEPLAY.filter((a) => !CT.TOUCH_BINDINGS[a]?.length);
  C.add('touch.ids', missing.length || noTouch.length ? 'fail' : 'pass', `${missing.length ? `unknown ids ${missing.join(', ')}; ` : ''}${noTouch.length ? `gameplay actions without a touch control ${noTouch.join(', ')}; ` : ''}pad ids ${[...ids].join(' ')}`);
  if (missing.length || noTouch.length) fail('touch.ids', `touch bindings do not match the canvas pad: ${[...missing, ...noTouch].join(', ')}`, 'src/data/controls.js', '');
}

// ── 5. browser: runtime bindings, glyphs, touch layout matrix ────────────────────────────────────────
if (!args['no-browser']) {
  const { openEnv } = await import('./lib/server.mjs');
  const { NOTCH_INSETS } = await import('./lib/viewports.mjs');
  const { minGap } = await import('./lib/touch.mjs');
  const env = await openEnv();
  try {
    // bindings + glyphs on a desktop page
    const s = await env.page('desk', 'index.html?scene=stage&stage=s01', { settings: { quality: 'low' } });
    await s.waitGame('!!g.world?.player');
    const rt = await s.eval(async () => {
      const g = window.__game, i = g.input, out = {};
      const st0 = { ...g.settings };
      for (const preset of ['arcade', 'classic']) for (const confirm of ['south', 'east']) {
        g.settings.ctrlPreset = preset; g.settings.ctrlConfirm = confirm; g.settings.ctrlMap = null; g.settings.keyMap = null;
        const b = i.refreshBindings();
        out[`${preset}.${confirm}`] = JSON.parse(JSON.stringify({ key: b.key, pad: b.pad }));
      }
      Object.assign(g.settings, st0); i.refreshBindings();
      const P = await import('/src/core/prompts.js');
      const acts = ['jump', 'attack', 'dash', 'sub', 'skill1', 'skill2', 'ult', 'swap', 'awaken', 'mount', 'guard', 'map', 'menu', 'confirm', 'cancel'];
      const glyphs = {};
      for (const mode of ['kb', 'pad', 'touch']) glyphs[mode] = Object.fromEntries(acts.map((a) => { let r = null; try { r = P.glyphFor(a, mode); } catch (e) { r = { err: e.message }; } return [a, r ? (r.label ?? r.code ?? r.id ?? '?') : null]; }));
      return { out, glyphs };
    });
    const diffs = Object.keys(snap).filter((k) => JSON.stringify(snap[k]) !== JSON.stringify(rt.out[k]));
    C.add('runtime.bindings', diffs.length ? 'fail' : 'pass', diffs.length ? `page bindings differ from the Node model for ${diffs.join(', ')}` : 'page input.bindings = model for arcade/classic × south/east');
    if (diffs.length) fail('runtime.bindings', `runtime bindings differ from controls.js for ${diffs.join(', ')}`, 'src/core/input.js', '');
    // touch has no confirm/cancel buttons of its own (tap / back): those are not required there
    const NEED = { kb: Object.keys(rt.glyphs.kb), pad: Object.keys(rt.glyphs.pad), touch: Object.keys(rt.glyphs.touch).filter((a) => !['confirm', 'cancel'].includes(a)) };
    for (const mode of ['kb', 'pad', 'touch']) {
      const miss = NEED[mode].filter((a) => !rt.glyphs[mode][a]);
      C.add(`glyphs.${mode}`, miss.length ? 'fail' : 'pass', miss.length ? `no glyph for ${miss.join(', ')}` : Object.entries(rt.glyphs[mode]).map(([a, l]) => `${a}=${l}`).join(' '));
      if (miss.length) fail(`glyphs.${mode}`, `prompts.glyphFor has no ${mode} glyph for ${miss.join(', ')}`, 'src/core/prompts.js', '');
    }
    await s.close();

    // touch layout matrix
    const CLASSES = [
      ['S', { viewport: { width: 740, height: 360 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, NOTCH_INSETS],
      ['S1', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, NOTCH_INSETS],
      ['M', { viewport: { width: 960, height: 540 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, { l: 0, r: 0, t: 0, b: 0 }],
      ['L', { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, { l: 0, r: 0, t: 0, b: 0 }],
    ];
    for (const [cls, ctx, insets] of CLASSES) {
      const t = await env.page(ctx, 'index.html?scene=stage&stage=s01', { insets, settings: { quality: 'low' } });
      await t.waitGame('!!g.world?.player');
      for (const left of [false, true]) for (const scale of [0.8, 1, 1.3]) {
        const L = await t.eval(async ({ scale, left }) => {
          const g = window.__game;
          g.settings.touchScale = scale; g.settings.touchLeftHanded = left;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const tp = (await import('/src/core/touchpad.js')).touchpad;
          const list = tp.buttons({ all: true }) || [];
          const info = tp.layoutInfo?.() ?? null;
          return { list, info, W: innerWidth, H: innerHeight };
        }, { scale, left });
        const pad = {}, sys = {};
        for (const b of L.list) (['pause', 'bag', 'fullscreen'].includes(b.id) ? sys : pad)[b.id] = b;
        const expect = ['attack', 'jump', 'dash', 'sub', 'skill1', 'skill2', 'ult', 'swap', 'mount', 'guard'];
        const missing = expect.filter((id) => !pad[id]);
        const small = [...Object.values(pad), ...Object.values(sys)].filter((b) => b.d < 43.5).map((b) => `${b.id} ${b.d.toFixed(1)}`);
        const g = minGap(pad);
        const sysHit = [];
        for (const sb of Object.values(sys)) for (const pb of Object.values(pad)) if (Math.hypot(sb.cx - pb.cx, sb.cy - pb.cy) < sb.d / 2 + pb.d / 2 + 4) sysHit.push(`${sb.id}×${pb.id}`);
        const out = L.list.filter((b) => b.cx - b.d / 2 < insets.l - 0.5 || b.cy - b.d / 2 < insets.t - 0.5 || b.cx + b.d / 2 > L.W - insets.r + 0.5 || b.cy + b.d / 2 > L.H - insets.b + 0.5).map((b) => b.id);
        const ok = !missing.length && !small.length && g.gap >= 12 && !out.length && !sysHit.length;
        const id = `touch.${cls}.${scale}${left ? '.left' : ''}`;
        C.add(id, ok ? 'pass' : 'fail', `${L.W}×${L.H}${L.info?.band ? ' band' : ''} k ${L.info?.kEff?.toFixed?.(2) ?? '?'}: min gap ${Number.isFinite(g.gap) ? g.gap.toFixed(1) : '-'} px (${g.a}–${g.b}); < 44 px ${small.join(', ') || 'none'}; missing ${missing.join(',') || 'none'}; outside safe rect ${out.join(',') || 'none'}; Ⅱ/가방 over pad ${sysHit.join(',') || 'none'}`);
        if (!ok) fail(id, `touch layout ${cls} × ${scale}${left ? ' left-handed' : ''} breaks the §1.4 rule`, 'src/core/touchpad.js', `gap ${g.gap?.toFixed?.(1)}, small ${small}, out ${out}, sys ${sysHit}`);
      }
      const errs = [...new Set(t.errs)];
      C.add(`touch.${cls}.errors`, errs.length ? 'fail' : 'pass', errs.length ? errs.slice(0, 3).join(' || ') : 'no page errors');
      if (errs.length) fail(`touch.${cls}.errors`, `page errors: ${errs[0]}`, 'src/core/touchpad.js', errs.join(' || '));
      await t.close();
    }
  } catch (e) {
    C.add('browser.harness', 'error', String(e?.message || e).split('\n')[0]);
  } finally {
    await env.close();
  }
}

const summary = { tool: 'bindings', when: new Date().toISOString(), counts: C.counts(), checks: C.list, findings, model: snap['arcade.south'] };
const out = writeReport('bindings', summary, { title: 'Bindings and touch layout', findings });
const c = C.counts();
console.log(`\nbindings: ${c.pass} pass, ${c.warn} warn, ${c.fail} fail, ${c.error} error — ${out.json}`);
process.exit(C.red.length ? 1 : 0);
