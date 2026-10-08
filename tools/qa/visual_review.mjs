// Visual review — contact sheets for human review (MASTER_PLAN §5.1 "visual review"): stages, bosses × phases, every enemy
// (91, in its home stage), the 20 companions (9 mounts ridden, 11 guardians idle + skill), heroes × 3 tiers in game and
// × 8 turntable yaws, ult/awakening cut-ins, ending cards, menus, the HUD matrix and every tools/gallery_*.html page, at
// desktop and phone sizes. Each shot is also checked automatically: a flat (blank/black) game frame and every page/console
// error are reported; an enemy that is gone or off screen at its shot, and a mount that is not ridden / a guardian that is
// not out, is labelled on its tile and listed.
//
//   node tools/qa/visual_review.mjs [--only stages,bosses,enemies,companions,heroes,cutins,endings,menus,hud,galleries]
//                                   [--vp desk,phone1] [--quick] [--stages s01,s14] [--heroes kael,lia]
//   --quick: fewer stages/heroes, one boss phase, 2 enemies per stage, 2 mounts + 2 guardians, tier-2 yaws 0/90/180 only
//   --contrast [--stages s01,s02,s16,hub] [--contrast-out f.json] [--contrast-base f.json]: hero figure/ground contrast
//     (opt-in group 'contrast', alone unless --only names other groups too): per stage r1 (and 'hub') the hero standing
//     after a short walk and at a jump apex; hero luma vs the luma behind it as a WCAG-style ratio, warn < 1.4 (report
//     only), plus top/middle/bottom band luma of the frame (haze check). --contrast-base prints the change per row.
//
// Pages run frozen (lib/step.mjs): every shot is "N game steps, then one render", so the machine load does not change
// what is on screen. Shots are page screenshots (the DOM touch overlay #tpadcv is included on phones).
// Output: /tmp/claude-0/qa/visual/<group>_<vp>.png contact sheets (one tile per shot, red outline = flagged) and
// /tmp/claude-0/qa/tools/visual_review.json (+ .md) with the sheet list, flagged shots and errors. Exit 1 on a red check.
import fs from 'node:fs';
import path from 'node:path';
import { openEnv, ROOT } from './lib/server.mjs';
import { VIEWPORTS } from './lib/viewports.mjs';
import { freeze, step, settle, stepUntil } from './lib/step.mjs';
import { gotoRoom, waitBakes, enterFight, prepWorld, idleFlush } from './lib/rooms.mjs';
import { Checks, writeReport, parseFlags, list, QA_DIR } from './lib/report.mjs';
import { ownerOf } from './lib/owners.mjs';

const args = parseFlags();
const QUICK = !!args.quick;
const ALL = ['stages', 'bosses', 'enemies', 'companions', 'heroes', 'cutins', 'endings', 'menus', 'hud', 'galleries'];
const OPT_IN = ['contrast'];   // not in the default run (it renders every stage twice more); --contrast or --only contrast
const GROUPS = args.contrast ? [...new Set([...list(args.only, []), 'contrast'])] : list(args.only, ALL);
const VPS = list(args.vp, ['desk', 'phone1']);
{
  // an unknown group or viewport must not turn into a vacuous green run
  const badG = GROUPS.filter((g) => !ALL.includes(g) && !OPT_IN.includes(g)), badV = VPS.filter((v) => v !== 'w960' && !VIEWPORTS[v]);
  if (badG.length || badV.length || !GROUPS.length) { console.error(`${badG.length ? `unknown --only ${badG.join(', ')} (${[...ALL, ...OPT_IN].join(', ')}) ` : ''}${badV.length ? `unknown --vp ${badV.join(', ')} (${Object.keys(VIEWPORTS).join(', ')}, w960)` : ''}`.trim() || 'no groups'); process.exit(2); }
}
const OUT = path.join(QA_DIR, 'visual');
fs.mkdirSync(OUT, { recursive: true });
const C = new Checks(true);
const findings = [];
const sheets = [];
const flagged = [];
const contrastRows = [];   // --contrast: { vp, stage, pose, ratio, hero, behind, bands, … }

const { STAGES } = await import(path.join(ROOT, 'src/data/stages.js'));
const { BOSSES } = await import(path.join(ROOT, 'src/data/bosses.js'));
const { CLASSES } = await import(path.join(ROOT, 'src/data/classes.js'));
const STAGE_IDS = list(args.stages, QUICK ? ['s01', 's05', 's10', 's14', 's17', 's20'] : Object.keys(STAGES).filter((k) => /^s\d\d$/.test(k)));
const HEROES = list(args.heroes, QUICK ? ['kael', 'lia'] : ['kael', 'sera', 'victor', 'bran', 'lia', 'azel', 'isolde']);
const BOSS_FILES = fs.readdirSync(path.join(ROOT, 'src/game/bosses'));
const bossFile = (id) => { const f = BOSS_FILES.find((x) => x.endsWith(`_${String(id).replace(/^b_/, '')}.js`)); return f ? `src/game/bosses/${f}` : 'src/game/bosses/boss.js'; };

// ── in-page helpers ─────────────────────────────────────────────────────────────────────────────────────────────────────
const KEYFN = `const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, key: c, bubbles: true }));`;
const POP = /^(dialogue|companionJoin|story|bossIntro|document)$/;
/** n frozen steps with an optional drive script (g, w, p, i, key), then one render; releases the usual keys.
 *  pop: close dialogue/story/intro overlays after every step (boss intros run their onDone so the fight starts). */
function play(s, n, drive = '', { pop = true } = {}) {
  const popSrc = pop ? `for (let k = 0; k < 4 && ${POP}.test(g.top?.name ?? ''); k++) { const t = g.top; if (t.name === 'bossIntro') t.onDone?.(); g.pop(); }` : '';
  return s.page.evaluate(`(() => { const g = window.__game; ${KEYFN}
  const drive = ${drive ? `(g, w, p, i, key) => { ${drive} }` : 'null'};
  for (let i = 0; i < ${n}; i++) {
    const w = g.world, p = w?.player; if (drive) { try { drive(g, w, p, i, key); } catch (e) { console.warn('[visual drive]', e?.message); } }
    window.__qaStep(1, false);
    ${popSrc}
  }
  for (const c of ['KeyX', 'ArrowRight', 'ArrowLeft', 'KeyZ', 'KeyF', 'KeyV']) key(c, false);
  window.__qaStep(1, true); return g.top?.name ?? null; })()`);
}
const FIGHT = `if (p) { p.buffs.invincible = 9999; p.hp = Math.max(p.hp, 1); }
  if (i % 12 === 0) key('KeyX', true); if (i % 12 === 4) key('KeyX', false);
  const b = w?.boss; if (p && b) { const far = Math.abs(b.cx - p.cx) > 150; key('ArrowRight', far && b.cx > p.cx); key('ArrowLeft', far && b.cx < p.cx); }`;
const WALK = `if (p) p.buffs.invincible = 9999; if (i === 0) key('ArrowRight', true); if (i === 24) key('ArrowRight', false); if (i === 30 || i === 42) key('KeyX', true); if (i === 34 || i === 46) key('KeyX', false);`;

/** Flat-frame test on the game canvas (48×27 luminance): blank = almost no variation. */
const frameStats = (s) => s.eval(() => {
  const g = window.__game;
  const c = window.__vrC || (window.__vrC = document.createElement('canvas'));
  c.width = 48; c.height = 27;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.clearRect(0, 0, 48, 27);
  try { x.drawImage(g.canvas, 0, 0, 48, 27); } catch { return { mean: -1, sd: -1 }; }
  const d = x.getImageData(0, 0, 48, 27).data;
  let n = 0, sum = 0, sq = 0;
  for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; sq += l * l; n++; }
  const mean = sum / n;
  return { mean: +mean.toFixed(1), sd: +Math.sqrt(Math.max(0, sq / n - mean * mean)).toFixed(1), top: g.top?.name ?? null };
});

/** Hero figure/ground contrast (--contrast; the 2026-10 benchmark metric, ported from its shots.mjs): renders the frame with
 *  the hero, then again with only the hero body left out — Player.drawBacking keeps the contact shadow and the background
 *  halo reads world.player, so what is "behind" includes them (older code without drawBacking: the whole player hidden).
 *  Pixels above the feet that change are the hero mask; mean hero luma vs mean luma behind it → WCAG-style ratio on the
 *  mean lumas. Also the top/middle/bottom thirds' mean luma of the frame (haze check). The QA invincibility ring and
 *  the hurt blink are switched off for the two renders. */
const heroContrast = (s) => s.eval(() => {
  const g = window.__game, w = g.world, cam = w?.camera, p = w?.player;
  if (!p || !cam) return null;
  const lum = (r, gg, b) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  const cv = g.canvas, z = cam.zoom || 1, sx = cv.width / g.viewW, sy = cv.height / g.viewH;
  const inv = p.buffs.invincible, ifr = p.iframes;
  p.buffs.invincible = 0; p.iframes = 0;
  const k = window.__vrK || (window.__vrK = document.createElement('canvas'));
  const kx = k.getContext('2d', { willReadFrequently: true });
  const grab = (x0, y0, cw, ch) => { k.width = cw; k.height = ch; kx.drawImage(cv, x0, y0, cw, ch, 0, 0, cw, ch); return kx.getImageData(0, 0, cw, ch).data; };
  try {
    window.__qaStep(0, true);
    const bands = [];
    k.width = 192; k.height = 108; kx.drawImage(cv, 0, 0, 192, 108);   // thirds of a 192×108 copy, as in the benchmark
    const band = kx.getImageData(0, 0, 192, 108).data;
    for (let t = 0; t < 3; t++) {
      let L = 0;
      for (let i = t * 36 * 192 * 4; i < (t + 1) * 36 * 192 * 4; i += 4) L += lum(band[i], band[i + 1], band[i + 2]);
      bands.push(+(L / (36 * 192)).toFixed(1));
    }
    const x0 = Math.max(0, Math.floor((p.x - 50 - cam.x) * z * sx)), y0 = Math.max(0, Math.floor((p.y - 50 - cam.y) * z * sy));
    const x1 = Math.min(cv.width, Math.ceil((p.x + p.w + 50 - cam.x) * z * sx)), y1 = Math.min(cv.height, Math.ceil((p.y + p.h + 8 - cam.y) * z * sy));
    const cw = x1 - x0, ch = y1 - y0;
    if (cw < 4 || ch < 4) return { bands, off: true };
    const A = grab(x0, y0, cw, ch);
    const backing = typeof p.drawBacking === 'function';
    if (backing) p.draw = function (ctx, world) { this.drawBacking(ctx, world); }; else p.hidden = true;
    window.__qaStep(0, true);
    const Bk = grab(x0, y0, cw, ch);
    if (backing) delete p.draw; else p.hidden = false;
    let n = 0, La = 0, Lb = 0;
    const feet = Math.floor((p.bottom - 3 - cam.y) * z * sy) - y0;   // rows at/below the feet = contact shadow, not the figure
    for (let i = 0; i < A.length; i += 4) {
      if (Math.floor(i / 4 / cw) >= feet) continue;
      if (Math.abs(A[i] - Bk[i]) + Math.abs(A[i + 1] - Bk[i + 1]) + Math.abs(A[i + 2] - Bk[i + 2]) > 30) { n++; La += lum(A[i], A[i + 1], A[i + 2]); Lb += lum(Bk[i], Bk[i + 1], Bk[i + 2]); }
    }
    const rel = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const hl = La / Math.max(1, n), bl = Lb / Math.max(1, n);
    const ratio = (Math.max(rel(hl), rel(bl)) + 0.05) / (Math.min(rel(hl), rel(bl)) + 0.05);
    return { bands, maskPx: n, hero: +hl.toFixed(1), behind: +bl.toFixed(1), ratio: +ratio.toFixed(2), backing,
      heroY: +(((p.y - cam.y) * z) / g.viewH).toFixed(2), theme: w.bg?.stage?.theme ?? null };
  } finally {
    p.buffs.invincible = inv; p.iframes = ifr;
    window.__qaStep(0, true);
  }
});
const CONTRAST_WARN = 1.4;

/** CSS-px clip (16:9, about half the game canvas) centred on the hero, or on the hero–enemy midpoint for 'enemy', so a
 *  creature stays readable in its sheet tile. null when there is no world. */
const focusClip = (s, which = 'hero') => s.eval((which) => {
  const g = window.__game, w = g.world, cam = w?.camera, p = w?.player;
  if (!cam || !p) return null;
  const e = which === 'enemy' && w.__vrEnemy && !w.__vrEnemy.dead ? w.__vrEnemy : null;
  const wx = e ? (p.cx + e.cx) / 2 : p.cx, wy = e ? (p.cy + e.cy) / 2 : p.cy;
  const r = g.canvas.getBoundingClientRect();
  const k = r.width / (cam.w || r.width);
  const W = Math.round(Math.min(r.width, Math.max(420, r.width * 0.55))), H = Math.round(Math.min(r.height, (W * 9) / 16));
  let x = r.left + (wx - cam.x) * k - W / 2, y = r.top + (wy - cam.y) * k - H * 0.6;
  x = Math.max(r.left, Math.min(r.left + r.width - W, x)); y = Math.max(r.top, Math.min(r.top + r.height - H, y));
  return { x: Math.round(x), y: Math.round(y), width: W, height: H };
}, which).catch(() => null);

/** CSS-px clip of the menu turntable stage (HeroView.rect, UI px of a uiScale scene) plus a margin; null → whole page. */
const viewClip = (s) => s.eval(() => {
  const g = window.__game, r = g.top?.cur?.view?.rect;
  if (!r || !(r.w > 0)) return null;
  const c = g.canvas.getBoundingClientRect();
  const k = c.width / (g.top?.uiScale ? (g.uiW || g.viewW) : g.viewW);
  const pad = 16;
  const x = Math.max(c.left, c.left + (r.x - pad) * k), y = Math.max(c.top, c.top + (r.y - pad) * k);
  const w = Math.min(c.left + c.width - x, (r.w + 2 * pad) * k), h = Math.min(c.top + c.height - y, (r.h + 2 * pad) * k);
  return w > 40 && h > 40 ? { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) } : null;
}).catch(() => null);

/** One shot of the current page: screenshot + flat-frame check. meta.file = owner file for a finding; meta.clip = CSS-px
 *  region of the page (focusClip) instead of the whole viewport. */
let CUR_VP = 'desk';
async function shot(s, shots, label, meta = {}) {
  // phones: the scripted keyboard input switched the pad to keyboard mode; show the touch pad as a player would see it
  if (VIEWPORTS[CUR_VP]?.touch) {
    await s.eval(() => { const g = window.__game; g.input?.setMode?.('touch'); window.__qaStep(1, true); }).catch(() => {});
    await s.wait(150);
  }
  const st = await frameStats(s).catch(() => ({ mean: -1, sd: -1 }));
  const buf = await s.page.screenshot({ type: 'jpeg', quality: 70, ...(meta.clip ? { clip: meta.clip } : {}) });
  const blank = st.sd >= 0 && st.sd < (meta.flatOk ? 0 : 3.5);
  const r = { label, img: buf.toString('base64'), ...st, blank, errs: s.errs.length, file: meta.file || null };
  shots.push(r);
  if (blank) flagged.push({ label, why: `flat frame (luma mean ${st.mean}, sd ${st.sd})`, file: meta.file || null, top: st.top });
  return r;
}

/** Contact sheet: every shot as a tile with its label; flagged tiles outlined in red. */
async function sheet(env, name, title, shots, tileW) {
  if (!shots.length) return null;
  const cols = Math.max(2, Math.min(5, Math.floor(1800 / (tileW + 8))));
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#101014;color:#ddd;font:12px/1.35 'Noto Sans KR',sans-serif}
    h1{font-size:15px;margin:8px 10px;color:#e8c872} .g{display:grid;grid-template-columns:repeat(${cols},${tileW}px);gap:8px;padding:0 10px 10px}
    figure{margin:0} img{width:${tileW}px;display:block;background:#000} figcaption{padding:2px 0;color:#bbb}
    .bad img{outline:3px solid #ff3040} .bad figcaption{color:#ff7080}</style>
    <h1>${esc(title)} — ${shots.length} shots</h1><div class="g">${shots.map((x) => `<figure class="${x.blank || x.err ? 'bad' : ''}"><img src="data:image/jpeg;base64,${x.img}"><figcaption>${esc(x.label)}${x.blank ? ' · FLAT' : ''}${x.err ? ` · ${esc(x.err)}` : ''}</figcaption></figure>`).join('')}</div>`;
  const page = await env.browser.newPage({ viewport: { width: cols * (tileW + 8) + 12, height: 400 } });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true, type: 'png' });
    sheets.push({ name, file, title, shots: shots.length, flagged: shots.filter((x) => x.blank).length });
    return file;
  } finally { await page.close(); }
}

const tileOf = (vp) => (vp.startsWith('phone') ? 340 : 320);
const VPOPT = (vp) => (vp === 'w960' ? { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 } : vp);

async function stagePage(env, vp, url = 'index.html?scene=stage&stage=s01&room=r1') {
  const s = await env.page(VPOPT(vp), url, { settings: { quality: vp.startsWith('phone') ? 'medium' : 'high' } });
  await s.waitGame('!!g.world?.player');
  await freeze(s.page);
  await settle(s.page, 30);
  return s;
}

function closeGroup(group, vp, s, shots, harness = []) {
  const errs = s ? [...new Set(s.errs)] : [];
  const flat = shots.filter((x) => x.blank);
  const id = `${group}.${vp}`;
  for (const h of harness) C.add(`${id}.harness`, 'error', h);
  C.add(`${id}.shots`, shots.length ? (flat.length ? (group === 'cutins' || group === 'endings' ? 'warn' : 'fail') : 'pass') : 'fail',
    `${shots.length} shot(s)${flat.length ? `, ${flat.length} flat frame(s): ${flat.map((x) => x.label).slice(0, 8).join(', ')}` : ', no flat frames'}`);
  C.add(`${id}.errors`, errs.length ? 'fail' : 'pass', errs.length ? `${errs.length} page/console error(s): ${errs.slice(0, 3).join(' || ')}` : 'no page/console errors');
  if (errs.length) {
    const file = shots.find((x) => x.errs > 0)?.file || 'src/game/world.js';
    findings.push({ id: `visual.errors.${id}`, sev: 'S2', kind: 'errors', title: `page/console errors while capturing ${group} (${vp})`, detail: errs.slice(0, 5).join(' || '), file, ...ownerOf(file), repro: `node tools/qa/visual_review.mjs --only ${group} --vp ${vp}` });
  }
  for (const f of flat) if (group !== 'cutins' && group !== 'endings') findings.push({ id: `visual.flat.${id}.${f.label}`, sev: 'S2', kind: 'visual', title: `flat/blank game frame: ${f.label} (${vp})`, detail: `luma mean ${f.mean}, sd ${f.sd}, top scene ${f.top}`, file: f.file || 'src/render/background.js', ...ownerOf(f.file || 'src/render/background.js'), repro: `node tools/qa/visual_review.mjs --only ${group} --vp ${vp}` });
}

// ── groups ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const GROUP_FNS = {
  /** P1 stages: r1 + boss arena; P2 stages: every room. */
  async stages(env, vp) {
    const s = await stagePage(env, vp);
    const parts = { p1: [], p2: [] };
    const harness = [];
    for (const st of STAGE_IDS) {
      const def = STAGES[st];
      if (!def) continue;
      const p2 = Number(st.slice(1)) >= 14;
      const rooms = Object.keys(def.rooms || {});
      const pick = QUICK ? rooms.slice(0, 1) : p2 ? rooms : [rooms[0], 'boss'].filter((r) => rooms.includes(r));
      for (const room of pick) {
        try {
          await gotoRoom(s, st, room);
          await prepWorld(s);
          await play(s, 170, WALK);   // the chapter title card is gone by then
          await shot(s, parts[p2 ? 'p2' : 'p1'], `${st}/${room}`, { file: `src/data/maps/${st}.js` });
        } catch (e) { harness.push(`${st}/${room}: ${String(e?.message || e).split('\n')[0]}`); }
      }
    }
    await sheet(env, `stages_p1_${vp}`, `Part 1 stages (${vp})`, parts.p1, tileOf(vp));
    await sheet(env, `stages_p2_${vp}`, `Part 2 stages, every room (${vp})`, parts.p2, tileOf(vp));
    closeGroup('stages', vp, s, [...parts.p1, ...parts.p2], harness);
    await s.close();
  },

  /** Every boss: fight start, just after each phase threshold, low HP. */
  async bosses(env, vp) {
    const s = await stagePage(env, vp);
    const shots = [];
    const harness = [];
    for (const st of STAGE_IDS) {
      const bid = STAGES[st]?.boss;
      if (!bid) continue;
      const file = bossFile(bid);
      try {
        await gotoRoom(s, st, 'boss');
        await prepWorld(s);
        const f = await enterFight(s);
        if (!f.boss) { harness.push(`${st}: boss ${bid} never appeared`); continue; }
        await play(s, 60, FIGHT);
        await shot(s, shots, `${bid} start`, { file });
        const phases = (BOSSES[bid]?.phases || [0.5]).filter((x) => x > 0 && x < 1);
        for (const [k, th] of (QUICK ? phases.slice(0, 1) : phases).entries()) {
          const ok = await s.eval((th) => {
            const w = window.__game.world, b = w?.boss;
            if (!b || b.dying > 0) return false;
            const max = b.stats?.maxHp ?? b.maxHp ?? b.hp;
            b.invuln = false;
            b.hp = Math.ceil(max * th) + 2;
            try { b.takeHit(4, { team: 'player', dir: 1, kb: [0, 0], tags: [] }, w, {}); } catch (e) { console.warn('[visual phase]', e?.message); }
            return true;
          }, th);
          if (!ok) break;
          await play(s, 100, FIGHT);
          await shot(s, shots, `${bid} phase ${k + 2} (≤${Math.round(th * 100)} %)`, { file });
        }
        if (!QUICK) {
          await s.eval(() => { const w = window.__game.world, b = w?.boss; if (b && !(b.dying > 0)) { const max = b.stats?.maxHp ?? b.hp; b.hp = Math.max(1, Math.ceil(max * 0.05)); } });
          await play(s, 60, FIGHT);
          await shot(s, shots, `${bid} low HP`, { file });
        }
      } catch (e) { harness.push(`${st}/${bid}: ${String(e?.message || e).split('\n')[0]}`); }
    }
    await sheet(env, `bosses_${vp}`, `Bosses × phases (${vp})`, shots, tileOf(vp));
    closeGroup('bosses', vp, s, shots, harness);
    await s.close();
  },

  /** Every enemy (§5.1 "91 enemies") in the first room of its home stage (the first stage that lists it, else s01): spawned
   *  150 px in front of the idle hero, 30 frames of its own AI, one shot. render 'none' (spawner-only ids) is listed, not shot. */
  async enemies(env, vp) {
    const s = await stagePage(env, vp);
    const shots = [];
    const harness = [];
    const { ENEMIES } = await import(path.join(ROOT, 'src/data/enemies.js'));
    const home = {};
    for (const [sid, def] of Object.entries(STAGES)) {
      if (!/^s\d\d$/.test(sid)) continue;
      for (const e of def.enemies || []) { const id = typeof e === 'string' ? e : e?.id; if (id && !home[id]) home[id] = sid; }
    }
    const byStage = {};
    const noDraw = [];
    for (const [id, d] of Object.entries(ENEMIES)) {
      if ((d.render ?? id) === 'none') { noDraw.push(id); continue; }
      (byStage[home[id] || 's01'] ||= []).push(id);
    }
    const fileOf = (id) => { const r = ENEMIES[id]?.render ?? id; return fs.existsSync(path.join(ROOT, `src/render/painted/enemies/${r}.js`)) ? `src/render/painted/enemies/${r}.js` : 'src/render/enemies.js'; };
    const clear = () => s.eval(() => { const w = window.__game.world; for (const e of w.entities || []) if (e.kind === 'enemy' || e.kind === 'projectile' || e.kind === 'hitbox') e.dead = true; w.__vrEnemy = null; });
    for (const st of Object.keys(byStage).sort().filter((x) => STAGE_IDS.includes(x))) {
      try {
        await gotoRoom(s, st, Object.keys(STAGES[st]?.rooms || {})[0] || 'r1');
        await prepWorld(s);
        await clear();
        await play(s, 150, 'if (p) p.buffs.invincible = 9999;');   // the chapter title card is gone by then
      } catch (e) { harness.push(`${st}: ${String(e?.message || e).split('\n')[0]}`); continue; }
      for (const id of QUICK ? byStage[st].slice(0, 2) : byStage[st]) {
        try {
          await s.eval((id) => {
            const w = window.__game.world, p = w.player, f = p.facing || 1;
            w.__vrEnemy = w.spawnEnemy(id, p.cx + f * 150, p.bottom - 2, { elite: false, facing: -f });
          }, id);
          await play(s, 1);                 // first draw requests the painted rig
          await waitBakes(s, 4000);
          await play(s, 30, 'if (p) { p.buffs.invincible = 9999; p.hp = Math.max(p.hp, 1); }');
          const where = await s.eval(() => {
            const w = window.__game.world, e = w.__vrEnemy, c = w.camera;
            if (!e || e.dead || !w.entities.includes(e)) return 'gone';
            return e.cx > c.x - 16 && e.cx < c.x + c.w + 16 && e.cy > c.y - 16 && e.cy < c.y + c.h + 16 ? 'ok' : 'off screen';
          });
          const r = await shot(s, shots, `${id} (${st})${where === 'ok' ? '' : ` · ${where}`}`, { file: fileOf(id), clip: await focusClip(s, 'enemy') });
          if (where !== 'ok') { r.err = where; flagged.push({ label: `${id} (${st}, ${vp})`, why: `enemy ${where} at its shot (review by hand; not counted red)`, file: fileOf(id), top: r.top }); }
          await clear();
          await play(s, 2);
        } catch (e) { harness.push(`${id}: ${String(e?.message || e).split('\n')[0]}`); }
      }
    }
    if (noDraw.length) C.add(`enemies.${vp}.nodraw`, 'pass', `render 'none' (not shot): ${noDraw.join(', ')}`);
    await sheet(env, `enemies_${vp}`, `Enemies in their home stage (${vp})`, shots, tileOf(vp));
    closeGroup('enemies', vp, s, shots, harness);
    await s.close();
  },

  /** The 20 companions (§5.1): each mount ridden (debug ride=1, a few steps of gait), each guardian idle beside the hero and
   *  casting its skill (companions.debug.skill) at a spawned skeleton. */
  async companions(env, vp) {
    const s = await stagePage(env, vp, 'index.html?scene=stage&stage=s04&room=r1');
    const shots = [];
    const harness = [];
    const CD = await import(path.join(ROOT, 'src/data/companions.js'));
    const all = CD.COMPANION_ORDER;
    const ids = QUICK ? [...all.filter((x) => CD.isMountId(x)).slice(0, 2), ...all.filter((x) => !CD.isMountId(x)).slice(0, 2)] : all;
    const fileOf = (id, mount) => (fs.existsSync(path.join(ROOT, `src/render/painted/companions/${id}.js`)) ? `src/render/painted/companions/${id}.js` : mount ? 'src/render/mounts.js' : 'src/render/guardians.js');
    const bad = [];
    for (const id of ids) {
      const mount = CD.isMountId(id);
      const file = fileOf(id, mount);
      try {
        await s.eval(async ({ id, mount }) => {
          const g = window.__game;
          const E = await import('/src/game/companion_events.js');
          E.applyCompanionDebug(g.state, mount ? `cmp=${id}&mount=${id}&guards=&ride=1` : `cmp=${id}&guards=${id}&mount=none`);
        }, { id, mount });
        await gotoRoom(s, 's04', 'r1');
        await prepWorld(s);
        await s.eval(() => { const w = window.__game.world; for (const e of w.entities || []) if (e.kind === 'enemy') e.dead = true; });
        await play(s, 150, 'if (p) p.buffs.invincible = 9999;');   // title card gone, summon done
        await s.wait(600); await waitBakes(s, 4000); await play(s, 10, 'if (p) p.buffs.invincible = 9999;');   // painted atlas loads in real time
        if (mount) {
          await play(s, 24, `if (p) p.buffs.invincible = 9999; key('ArrowRight', i < 20);`);
          const st = await s.eval(() => window.__game.world.player?.mount?.state ?? 'none');
          const ok = st === 'riding';
          const r = await shot(s, shots, `${id} ridden${ok ? '' : ` · mount state ${st}`}`, { file, clip: await focusClip(s) });
          if (!ok) { r.err = `not ridden (${st})`; bad.push(`${id}: mount state ${st}`); }
        } else {
          const out = await s.eval((id) => (window.__game.world.companions?.guards || []).some((g) => g.id === id && !g.dead), id);
          const r = await shot(s, shots, `${id} idle${out ? '' : ' · not out'}`, { file, clip: await focusClip(s) });
          if (!out) { r.err = 'not out'; bad.push(`${id}: guardian not out`); continue; }
          await s.eval(() => { const w = window.__game.world, p = w.player, f = p.facing || 1; w.spawnEnemy('skeleton', p.cx + f * 180, p.bottom - 2, { elite: false, facing: -f }); });
          await play(s, 6, 'if (p) p.buffs.invincible = 9999;');
          const cast = await s.eval(() => !!window.__game.world.companions?.debug?.skill?.(0));
          await play(s, 14, 'if (p) p.buffs.invincible = 9999;');
          const r2 = await shot(s, shots, `${id} skill${cast ? '' : ' · skill not cast'}`, { file, clip: await focusClip(s) });
          if (!cast) { r2.err = 'skill not cast'; bad.push(`${id}: skill not cast`); }
        }
      } catch (e) { harness.push(`${id}: ${String(e?.message || e).split('\n')[0]}`); }
    }
    C.add(`companions.${vp}.state`, bad.length ? 'fail' : 'pass', bad.length ? `companions not shown as asked: ${bad.join('; ')}` : `${ids.length} companions shown (mounts ridden, guardians out and casting)`);
    if (bad.length) findings.push({ id: `visual.companions.${vp}`, sev: 'S2', kind: 'visual', title: `companions not shown as asked (${vp}): ${bad.join('; ')}`, file: 'src/game/companions.js', ...ownerOf('src/game/companions.js'), repro: `node tools/qa/visual_review.mjs --only companions --vp ${vp}` });
    await sheet(env, `companions_${vp}`, `Companions: mounts ridden, guardians + skill (${vp})`, shots, tileOf(vp));
    closeGroup('companions', vp, s, shots, harness);
    await s.close();
  },

  /** Heroes: one class per tier in game (mid-attack), then the status-tab turntable at 8 yaws (tier-2 class). */
  async heroes(env, vp) {
    const s = await stagePage(env, vp, 'index.html?scene=stage&stage=s04&room=r1');
    const shots = [];
    const harness = [];
    for (const hero of HEROES) {
      const tiers = [0, 1, 2].map((t) => Object.values(CLASSES).find((c) => c.charId === hero && c.tier === t)).filter(Boolean);
      try {
        await gotoRoom(s, 's04', 'r1', { hero });
        await prepWorld(s);
        await play(s, 150);   // the chapter title card is gone by then
        for (const cls of tiers) {
          await s.eval((id) => { const p = window.__game.world.player; p.hero.classId = id; p.refreshStats?.(); for (const e of window.__game.world.entities || []) if (e.kind === 'enemy') e.dead = true; }, cls.id);
          await play(s, 20); await s.wait(500); await waitBakes(s, 3000);
          await play(s, 24, `if (p) p.buffs.invincible = 9999; if (i === 10) key('KeyX', true); if (i === 13) key('KeyX', false);`);
          await shot(s, shots, `${hero} T${cls.tier} ${cls.id} attack`, { file: 'src/render/hero.js', clip: await focusClip(s) });
        }
        // status-tab turntable: every tier × 8 yaws (§5.1 "6 heroes × 3 tiers × 8 yaws"); --quick: tier 2 at 0/90/180°
        for (const cls of QUICK ? tiers.slice(-1) : tiers) {
          await s.eval((id) => { const p = window.__game.world.player; p.hero.classId = id; p.refreshStats?.(); }, cls.id);
          await s.eval(() => { const g = window.__game; g.push('menu', { world: g.world, tab: 'status' }); });
          await play(s, 30); await s.wait(600); await play(s, 10);   // the class turn atlas loads in real time
          for (const deg of QUICK ? [0, 90, 180] : [0, 45, 90, 135, 180, 225, 270, 315]) {
            const ok = await s.eval((a) => {
              const m = window.__game.top, v = m?.cur?.view;
              if (!v) return false;
              // beginUser cancels a running pose demo (the demo draws the side-profile card flip on purpose, platform §7.3)
              v.beginUser?.(); v.autoSpin = false; v.stopSpin?.(false); v.tweenTo?.(a, 0.05, { user: true });
              return true;
            }, (deg * Math.PI) / 180);
            await play(s, 16);
            await shot(s, shots, `${hero} T${cls.tier} ${cls.id} yaw ${deg}°${ok ? '' : ' (no turntable view)'}`, { file: 'src/scenes/menu/hero_view.js', clip: await viewClip(s) });
          }
          await s.eval(() => { const g = window.__game; for (let i = 0; i < 3 && g.top?.name === 'menu'; i++) g.pop(); });
          await play(s, 5);
        }
      } catch (e) { harness.push(`${hero}: ${String(e?.message || e).split('\n')[0]}`); }
    }
    await sheet(env, `heroes_${vp}`, `Heroes × tiers × yaws (${vp})`, shots, tileOf(vp));
    closeGroup('heroes', vp, s, shots, harness);
    await s.close();
  },

  /** Ultimate and awakening cut-ins (tier-2 class) per hero, two moments each. vp list adds 960×540. */
  async cutins(env, vp) {
    const s = await stagePage(env, vp, 'index.html?scene=stage&stage=s04&room=r1');
    const shots = [];
    const harness = [];
    for (const hero of HEROES) {
      try {
        await gotoRoom(s, 's04', 'r1', { hero });
        await prepWorld(s);
        for (const kind of ['ult', 'awaken']) {
          await s.eval(async (kind) => {
            const { CLASSES } = await import('/src/data/classes.js');
            const g = window.__game, w = g.world, p = w.player;
            const t2 = Object.values(CLASSES).find((c) => c.charId === p.hero.charId && c.tier === 2);
            if (t2) { p.hero.classId = t2.id; p.refreshStats?.(); }
            for (const e of w.entities || []) if (e.kind === 'enemy') e.dead = true;
            w.run.sp = 100; w.run.aw = kind === 'awaken' ? 100 : 0;
          }, kind);
          await play(s, 10); await s.wait(300); await waitBakes(s, 3000);
          const k = kind === 'ult' ? 'KeyF' : 'KeyV';
          await play(s, 4, `if (i === 0) key('${k}', true); if (i === 3) key('${k}', false);`);
          await stepUntil(s.page, "g.top?.name === 'ultCutin' || g.top?.name === 'awakenCutin'", 40).catch(() => 0);
          const moments = kind === 'ult' ? [8, 18] : [20, 30];
          for (const n of moments) {
            await play(s, n, 'if (p) p.buffs.invincible = 9999;');
            await shot(s, shots, `${hero} ${kind} +${n}`, { file: kind === 'ult' ? 'src/scenes/overlays.js' : 'src/scenes/awaken_cutin.js' });
          }
          await stepUntil(s.page, "!w || (!w.cutscene && g.top?.name === 'stage')", 900).catch(() => 0);
          await play(s, 30, 'if (p) p.buffs.invincible = 9999;');
        }
      } catch (e) { harness.push(`${hero}: ${String(e?.message || e).split('\n')[0]}`); }
    }
    await sheet(env, `cutins_${vp}`, `Ult / awakening cut-ins (${vp})`, shots, tileOf(vp));
    closeGroup('cutins', vp, s, shots, harness);
    await s.close();
  },

  /** Ending title cards (all 5 kinds) + credits. */
  async endings(env, vp) {
    const s = await stagePage(env, vp);
    const shots = [];
    const harness = [];
    for (const kind of ['bad', 'normal', 'true', 'p2', 'p2true']) {
      try {
        await s.eval((kind) => window.__game.go('ending', { kind }, { fade: false }), kind);
        await play(s, 20); await s.wait(400);
        await play(s, 100);
        await shot(s, shots, `ending ${kind}`, { file: 'src/scenes/front/ending.js' });
      } catch (e) { harness.push(`ending ${kind}: ${String(e?.message || e).split('\n')[0]}`); }
    }
    for (const kind of ['true', 'p2true']) {
      try {
        await s.eval((kind) => window.__game.go('credits', { kind }, { fade: false }), kind);
        await play(s, 20); await s.wait(300); await play(s, 240);
        await shot(s, shots, `credits ${kind}`, { file: 'src/scenes/front/ending.js' });
      } catch (e) { harness.push(`credits ${kind}: ${String(e?.message || e).split('\n')[0]}`); }
    }
    await sheet(env, `endings_${vp}`, `Ending cards + credits (${vp})`, shots, tileOf(vp));
    closeGroup('endings', vp, s, shots, harness);
    await s.close();
  },

  /** Front scenes, hub, world map, pause, options pages, every menu tab. */
  async menus(env, vp) {
    const s = await stagePage(env, vp, 'index.html?scene=stage&stage=s04&room=r1&cmp=mt_warhorse,gd_fairy&mount=mt_warhorse&guards=gd_fairy');
    const shots = [];
    const harness = [];
    const cap = async (label, fn, file, frames = 40) => {
      try { await s.eval(fn); await play(s, 10); await s.wait(250); await play(s, frames); await shot(s, shots, label, { file }); } catch (e) { harness.push(`${label}: ${String(e?.message || e).split('\n')[0]}`); }
    };
    const back = () => s.eval(() => { const g = window.__game; for (let i = 0; i < 4 && g.top?.name !== 'stage' && g.scenes.length > 1; i++) g.pop(); });
    const { MENU_TABS } = await import(path.join(ROOT, 'src/scenes/menu/menu.js')).catch(() => ({ MENU_TABS: [] }));
    for (const t of MENU_TABS) {
      await cap(`menu ${t.id}`, `(() => { const g = window.__game; g.push('menu', { world: g.world, tab: '${t.id}' }); })()`, `src/scenes/menu/tab_${t.id}.js`, 30);
      await back(); await play(s, 4);
    }
    await cap('pause', `(() => { const g = window.__game; g.push('pause', { world: g.world }); })()`, 'src/scenes/pause.js', 20);
    await back(); await play(s, 4);
    for (const page of ['sound', 'screen', 'controls', 'touch', 'etc']) {
      await cap(`options ${page}`, `(() => { const g = window.__game; g.push('options', { page: '${page}' }); })()`, 'src/scenes/front/options.js', 20);
      await back(); await play(s, 4);
    }
    await cap('hub', `window.__game.go('hub', {}, { fade: false })`, 'src/scenes/town/hub.js', 60);
    await cap('stable', `window.__game.push('stable', {})`, 'src/scenes/town/stable.js', 30);
    await cap('worldmap', `window.__game.go('worldmap', {}, { fade: false })`, 'src/scenes/town/worldmap.js', 40);
    await cap('worldmap P2', `window.__game.go('worldmap', { page: 1 }, { fade: false })`, 'src/scenes/town/worldmap.js', 40);
    await cap('title', `window.__game.go('title', {}, { fade: false })`, 'src/scenes/title.js', 90);
    await cap('slots', `window.__game.go('slots', { mode: 'new' }, { fade: false })`, 'src/scenes/front/slots.js', 30);
    await cap('charselect', `window.__game.go('charselect', { slot: 1, difficulty: 'normal' }, { fade: false })`, 'src/scenes/front/charselect.js', 60);
    await cap('arcade', `window.__game.go('arcade', {}, { fade: false })`, 'src/scenes/front/arcade.js', 30);
    await sheet(env, `menus_${vp}`, `Menus, front, town (${vp})`, shots, tileOf(vp));
    closeGroup('menus', vp, s, shots, harness);
    await s.close();
  },

  /** HUD matrix: base (mount + 2 guardians), full gauges + combo, mounted — at this viewport. */
  async hud(env, vp) {
    const s = await stagePage(env, vp, 'index.html?scene=stage&stage=s04&room=r1&cmp=mt_warhorse,gd_fairy,gd_imp&mount=mt_warhorse&guards=gd_fairy,gd_imp');
    const shots = [];
    const harness = [];
    try {
      await prepWorld(s); await waitBakes(s, 4000);
      await play(s, 170, WALK);   // the chapter title card is gone by then
      await shot(s, shots, 'hud base', { file: 'src/render/hud.js' });
      await s.eval(() => { const w = window.__game.world; w.run.sp = 100; w.run.aw = 100; if (w.combo) { w.combo.n = 42; w.combo.t = 3; } w.player.hp = Math.ceil((w.player.stats?.hp ?? 100) * 0.3); });
      await play(s, 30, 'if (i % 8 === 0) key("KeyX", true); if (i % 8 === 3) key("KeyX", false); if (p) p.buffs.invincible = 9999;');
      await shot(s, shots, 'hud full gauges + combo', { file: 'src/render/feel_hud.js' });
      // R through the real keyboard (like tools/qa/platform_bind.mjs), 4 frames held
      await s.page.keyboard.down('KeyR'); await step(s.page, 4, false); await s.page.keyboard.up('KeyR');
      await play(s, 75, 'if (p) p.buffs.invincible = 9999;');
      await s.wait(700); await waitBakes(s, 3000); await play(s, 20, 'if (p) p.buffs.invincible = 9999;');   // painted mount atlas loads in real time
      const rode = await s.eval(() => ['riding', 'summoning'].includes(window.__game.world?.player?.mount?.state));
      await shot(s, shots, `hud mounted${rode ? '' : ' (mount did not happen)'}`, { file: 'src/render/companion_hud.js' });
    } catch (e) { harness.push(String(e?.message || e).split('\n')[0]); }
    await sheet(env, `hud_${vp}`, `HUD matrix (${vp})`, shots, tileOf(vp));
    closeGroup('hud', vp, s, shots, harness);
    await s.close();
  },

  /** --contrast: hero figure/ground contrast in each stage's first room (and the town with 'hub'): standing after a short
   *  walk, then at a jump apex. Report only (warn < CONTRAST_WARN); rows go to --contrast-out for before/after diffs. */
  async contrast(env, vp) {
    const s = await stagePage(env, vp);
    const shots = [];
    const harness = [];
    const ids = list(args.stages, QUICK ? ['s01', 's02', 's16', 'hub'] : [...Object.keys(STAGES).filter((k) => /^s\d\d$/.test(k)), 'hub']);
    const WALKC = `if (p) p.buffs.invincible = 9999; if (i === 0) key('ArrowRight', true); if (i === WALK_N) key('ArrowRight', false);`;
    const row = (st, pose, m, r) => {
      if (!m || m.off) { harness.push(`${st} ${pose}: hero off screen`); return; }
      contrastRows.push({ vp, stage: st, pose, ...m });
      r.label = `${st} ${pose} · ${m.ratio} (hero ${m.hero} / behind ${m.behind})`;
      if (m.ratio < CONTRAST_WARN) r.err = `contrast ${m.ratio}`;
      C.add(`contrast.${vp}.${st}.${pose}`, m.ratio < CONTRAST_WARN ? 'warn' : 'pass', `ratio ${m.ratio} (hero luma ${m.hero}, behind ${m.behind}, ${m.maskPx} px); bands ${m.bands.join(' / ')}${m.backing ? '' : ' (no drawBacking: player hidden)'}`);
    };
    for (const st of ids) {
      try {
        const hub = st === 'hub';
        if (hub) {
          await s.eval(() => window.__game.go('hub', {}, { fade: false }));
          for (let i = 0; i < 60; i++) {
            if (await s.eval(() => window.__game.top?.name === 'hub' && !!window.__game.world?.player).catch(() => false)) break;
            await step(s.page, 2, false); await s.wait(100);
          }
          await waitBakes(s); await idleFlush(s);
        } else {
          if (!STAGES[st]) { harness.push(`${st}: unknown stage`); continue; }
          await gotoRoom(s, st, Object.keys(STAGES[st].rooms || {})[0] || 'r1');
          await prepWorld(s);
        }
        // the QA invincibility ring and the hurt blink are not part of the scene (the measurement turns them off too)
        const calm = () => s.eval(() => { const p = window.__game.world?.player; if (p) { p.buffs.invincible = 0; p.iframes = 0; } window.__qaStep(0, true); });
        await play(s, hub ? 200 : 170, WALKC.replace('WALK_N', hub ? '60' : '40'));   // the chapter title card is gone by then
        await calm();
        let r = await shot(s, shots, st, { file: 'src/render/background.js' });
        row(st, 'stand', await heroContrast(s), r);
        await s.eval(() => { const p = window.__game.world?.player; if (p) p.buffs.invincible = 9999; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'KeyZ', bubbles: true })); });
        await step(s.page, 2, false);
        await stepUntil(s.page, '!p.onGround && p.vy >= -40', 90);
        await calm();
        r = await shot(s, shots, st, { file: 'src/render/background.js' });
        row(st, 'jump', await heroContrast(s), r);
        await s.eval(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ', key: 'KeyZ', bubbles: true })));
        await play(s, 40);
      } catch (e) { harness.push(`${st}: ${String(e?.message || e).split('\n')[0]}`); }
    }
    await sheet(env, `contrast_${vp}`, `Hero figure/ground contrast (${vp}; red = ratio < ${CONTRAST_WARN})`, shots, tileOf(vp));
    closeGroup('contrast', vp, s, shots, harness);
    await s.close();
  },

  /** Every tools/gallery_*.html (smoke: loads without page errors, draws something), first screen at this viewport. */
  async galleries(env, vp) {
    const shots = [];
    const harness = [];
    const errsAll = [];
    const files = fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => /^gallery_.*\.html$/.test(f)).sort();
    for (const f of files) {
      let s;
      try {
        s = await env.page(VPOPT(vp), `tools/${f}`, { wait: false });   // galleries have no window.__game
        await s.page.waitForLoadState('load');
        await s.wait(QUICK ? 1500 : 3000);
        // a very tall single-canvas gallery (gallery_items) can make the screenshot slow on this box: no tile then
        const buf = await s.page.screenshot({ type: 'jpeg', quality: 70, timeout: 90000 }).catch(() => null);
        const drawn = await s.eval(() => [...document.querySelectorAll('canvas')].filter((c) => c.width > 8 && c.height > 8).length);
        const errs = [...new Set(s.errs)];
        for (const e of errs) errsAll.push(`${f}: ${e}`);
        if (buf) shots.push({ label: `${f}${errs.length ? ` (${errs.length} error(s))` : ''}`, img: buf.toString('base64'), blank: false, err: errs.length ? 'errors' : '', file: `tools/${f}` });
        C.add(`galleries.${vp}.${f}`, errs.length ? 'fail' : drawn && buf ? 'pass' : 'warn', errs.length ? `${errs.length} page/console error(s): ${errs.slice(0, 2).join(' || ')}` : `${drawn} canvas(es) drawn${buf ? '' : ', screenshot timed out (no tile)'}`);
        if (errs.length) findings.push({ id: `visual.gallery.${f}.${vp}`, sev: 'S3', kind: 'errors', title: `${f} logs page/console errors (${vp})`, detail: errs.slice(0, 4).join(' || '), file: `tools/${f}`, ...ownerOf(`tools/${f}`), repro: `node tools/qa/visual_review.mjs --only galleries --vp ${vp}` });
      } catch (e) { harness.push(`${f}: ${String(e?.message || e).split('\n')[0]}`); }
      finally { if (s) await s.close().catch(() => {}); }
    }
    await sheet(env, `galleries_${vp}`, `Galleries (${vp})`, shots, tileOf(vp));
    for (const h of harness) C.add(`galleries.${vp}.harness`, 'error', h);
  },
};

// ── run ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const env = await openEnv();
const t0 = Date.now();
try {
  for (const group of GROUPS) {
    const vps = group === 'cutins' ? [...new Set([...VPS, ...(QUICK ? [] : ['w960'])])] : group === 'hud' && !args.vp ? ['desk', 'phone1', 'phone2', 'tablet'] : VPS;
    for (const vp of vps) {
      const t = Date.now();
      CUR_VP = vp;
      try { await GROUP_FNS[group](env, vp); } catch (e) { C.add(`${group}.${vp}.harness`, 'error', String(e?.message || e).split('\n')[0]); }
      console.log(`${group} ${vp}: ${((Date.now() - t) / 1000).toFixed(0)} s`);
      await env.closeSessions();
    }
  }
} finally {
  await env.close();
}

for (const r of C.list) if (r.status !== 'pass') console.log(`${r.status.padEnd(5)} ${r.id} — ${r.detail}`);
const c = C.counts();
let contrastMd = '';
if (contrastRows.length) {
  const file = typeof args['contrast-out'] === 'string' ? args['contrast-out'] : path.join(QA_DIR, 'tools', 'visual_contrast.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), rows: contrastRows }, null, 1));
  let base = null;
  if (typeof args['contrast-base'] === 'string') { try { base = JSON.parse(fs.readFileSync(args['contrast-base'], 'utf8')).rows; } catch (e) { console.log(`contrast base unreadable: ${e.message}`); } }
  const key = (r) => `${r.vp}|${r.stage}|${r.pose}`;
  const B = new Map((base || []).map((r) => [key(r), r]));
  const lines = contrastRows.map((r) => {
    const b = B.get(key(r));
    const d = (v, w) => (b ? ` (${v - w >= 0 ? '+' : ''}${(v - w).toFixed(2)})` : '');
    return `| ${r.vp} | ${r.stage} | ${r.pose} | ${r.theme ?? ''} | ${r.ratio}${d(r.ratio, b?.ratio)} | ${r.hero} | ${r.behind}${d(r.behind, b?.behind)} | ${r.bands.join(' / ')}${b ? ` (top ${(r.bands[0] - b.bands[0] >= 0 ? '+' : '') + (r.bands[0] - b.bands[0]).toFixed(1)}, mid ${(r.bands[1] - b.bands[1] >= 0 ? '+' : '') + (r.bands[1] - b.bands[1]).toFixed(1)})` : ''} |`;
  });
  contrastMd = `\n## Hero figure/ground contrast (warn < ${CONTRAST_WARN})${base ? ` — change vs ${args['contrast-base']}` : ''}\n\n| vp | stage | pose | theme | ratio | hero luma | behind luma | band luma top / mid / bottom |\n|---|---|---|---|---|---|---|---|\n${lines.join('\n')}\n\nrows: \`${file}\`\n`;
  console.log(contrastMd);
}
const md = `\n## Contact sheets\n\n${sheets.map((x) => `- ${x.title}: \`${x.file}\` (${x.shots} shots${x.flagged ? `, ${x.flagged} flagged` : ''})`).join('\n')}\n\n## Flagged shots\n\n${flagged.map((f) => `- ${f.label}: ${f.why}${f.file ? ` — ${f.file}` : ''}`).join('\n') || '(none)'}\n${contrastMd}`;
const out = writeReport('visual_review', { tool: 'visual_review', when: new Date().toISOString(), durationMs: Date.now() - t0, groups: GROUPS, vps: VPS, quick: QUICK, counts: c, checks: C.list, sheets, flagged, findings }, { title: 'Visual review', findings, extraMd: md });
console.log(`\nvisual_review: ${sheets.length} sheet(s) in ${OUT}; ${c.pass} pass, ${c.warn} warn, ${c.fail} fail, ${c.error} error — ${out.json}`);
process.exit(C.red.length ? 1 : 0);
