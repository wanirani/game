// v2g ship list helper (INTEGRATE-A): which assets/v2 files does the scene really fetch?
//   node tools/v2/game_assets.mjs [--areas eshville_now,graveyard_now,...] [--out /tmp/claude-0/v2/integA/assets.json]
// Opens v2g once, walks through every area of the world module with scene.gotoArea(), opens one dialogue per person
// (portraits are fetched when the box opens) and lists every /assets/v2/ request the page made. Files that answered 404
// are listed apart (the scene has a fallback for them: say so in the report, do not ship a hole).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const OUT = String(args.out || '/tmp/claude-0/v2/integA/assets.json');
const port = 8300 + Math.floor(Math.random() * 500), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const got = new Map(), errs = [], per = {};
try {
  const page = await (await browser.newContext(contextOptions('fold_open'))).newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('response', (r) => { const u = r.url(), i = u.indexOf('/assets/v2/'); if (i >= 0) got.set(u.slice(i + 1).split('?')[0], r.status()); });
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=0.4`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 90000 }).catch(() => errs.push('ready timeout'));
  const ids = args.areas ? String(args.areas).split(',') : await page.evaluate(async () => Object.keys((await import('/src/v2/world/index.js')).AREAS));
  for (const id of ids) {
    const r = await page.evaluate(async (id) => {
      const v = window.__v2, sc = v.scene, g = window.__game; g._pageHidden = true;
      const ok = await sc.gotoArea(id, null); sc.fadeTo = 0; sc.fadeA = 0; sc.locked = false;
      if (!ok) return { ok: false, err: sc.glError ?? null };
      for (let i = 0; i < 20; i++) g.tick(1 / 60); g.alpha = 1; g.render();
      const ppl = [];
      for (const p of sc.people.list ?? []) { if (!p.a3) continue; try { sc.hud.showDialog({ speaker: p.name, portrait: p.portrait, side: 'left', text: '…' }); for (let i = 0; i < 6; i++) g.tick(1 / 60); g.render(); sc.hud.closeDialog?.(); ppl.push(p.id); } catch { /* next */ } }
      await new Promise((res) => setTimeout(res, 600));
      return { ok: true, area: v.area, kinds: [...new Set(v.enemies.map((e) => e.kind))], people: ppl, assets: v.stats.assets?.length ?? null };
    }, id).catch((e) => ({ ok: false, err: String(e.message).slice(0, 200) }));
    per[id] = r; console.log(id, JSON.stringify(r));
  }
} finally { await browser.close(); srv.close(); }
const files = [...got.keys()].sort(), ok = files.filter((f) => got.get(f) < 400), missing = files.filter((f) => got.get(f) >= 400);
fs.writeFileSync(OUT, JSON.stringify({ areas: per, files: ok, missing, errors: errs }, null, 1));
console.log(`\n${ok.length} assets/v2 files fetched (${missing.length} answered 404), page errors ${errs.length}`);
for (const f of ok) console.log(f);
if (missing.length) { console.log('\n404:'); for (const f of missing) console.log(f); }
if (errs.length) { console.log('\nerrors:'); for (const e of errs.slice(0, 5)) console.log(e); }
