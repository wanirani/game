import { launch } from './whip_lib.mjs';
import { execFileSync } from 'node:child_process';
const L = await launch(null);
const page = await L.page('phone2');
const old = {}; for (const f of ['src/v2/play/sim.js', 'src/v2/play/tune.js']) old[f] = execFileSync('git', ['show', `9468e00:${f}`], { cwd: '/home/user/game', maxBuffer: 1 << 26 }).toString();
page.on('console', (m) => console.log('console', m.type(), m.text().slice(0, 200)));
let n = 0, done = 0; page.on('request', () => n++); page.on('requestfinished', () => done++); page.on('requestfailed', (r) => console.log('reqfail', r.url().slice(-50), r.failure()?.errorText));
if (process.argv[2] !== 'noroute') for (const f of Object.keys(old)) await page.route('**/' + f, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: old[f] }));
const t0 = Date.now();
await page.goto(`http://localhost:${L.port}/index.html?scene=v2g&area=graveyard_now&v2auto=0&v2story=0`, { waitUntil: 'commit', timeout: 120000 });
for (let i = 0; i < 6; i++) { await page.waitForTimeout(10000); console.log(Math.round((Date.now() - t0) / 1000), 's requests', n, 'finished', done, JSON.stringify(await page.evaluate(() => ({ v2: !!window.__v2, ready: window.__v2?.ready, err: String(window.__v2?.error ?? ''), scene: window.__game?.sceneName ?? window.__game?.scene?.constructor?.name })))); }
for (const e of L.errs) console.log('ERR', e);
await L.close();
