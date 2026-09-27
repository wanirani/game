import { chromium } from 'playwright-core';
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', proxy: { server: proxy }, args: ['--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage(); let ok = 0, fail = 0; const errs = [];
p.on('requestfinished', () => ok++); p.on('requestfailed', (r) => { fail++; errs.push(r.url() + ' ' + r.failure()?.errorText); });
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
try { await p.goto('https://blood-nocturne.netlify.app/', { timeout: 60000, waitUntil: 'commit' }); } catch (e) { console.log('goto', e.message.split('\n')[0]); }
await p.waitForTimeout(25000);
console.log('proxy', proxy?.replace(/\/\/.*@/, '//***@'), 'ok', ok, 'fail', fail);
console.log(errs.slice(0, 6).join('\n'));
try { console.log(await p.evaluate(() => ({ scenes: window.__game?.scenes?.map((s) => s.name ?? s.constructor?.name).join('>') }))); } catch (e) { console.log('eval', e.message); }
await p.screenshot({ path: '/tmp/claude-0/deliver/live_desktop.png' });
await b.close();
