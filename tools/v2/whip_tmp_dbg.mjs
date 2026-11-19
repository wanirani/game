import { launch } from './whip_lib.mjs';
import { execFileSync } from 'node:child_process';
const L = await launch(null);
const page = await L.page('phone2');
const old = {}; for (const f of ['src/v2/play/sim.js', 'src/v2/play/tune.js']) old[f] = execFileSync('git', ['show', `9468e00:${f}`], { cwd: '/home/user/game', maxBuffer: 1 << 26 }).toString();
page.on('requestfailed', (r) => console.log('reqfail', r.url(), r.failure()?.errorText));
page.on('request', (r) => { if (/play\//.test(r.url())) console.log('req', r.url().slice(-30)); });
for (const f of Object.keys(old)) await page.route('**/' + f, (r) => { console.log('routed', r.request().url().slice(-30), old[f].length); return r.fulfill({ status: 200, contentType: 'text/javascript', body: old[f] }); });
const t0 = Date.now();
try { await page.goto(`http://localhost:${L.port}/index.html?scene=v2g&area=graveyard_now&v2auto=0&v2story=0`, { timeout: 40000 }); console.log('goto ok', Date.now() - t0); } catch (e) { console.log('goto fail', String(e).slice(0, 200)); }
console.log(await page.evaluate(() => ({ v2: !!window.__v2, ready: window.__v2?.ready, err: String(window.__v2?.error ?? '') })));
for (const e of L.errs) console.log('ERR', e);
await L.close();
