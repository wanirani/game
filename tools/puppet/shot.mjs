// 퍼펫 QA 스크린샷: 갤러리/게임 페이지를 열어 (준비 신호를 기다린 뒤) 전체 페이지를 PNG 로 저장. 페이지 오류를 출력한다.
// node tools/puppet/shot.mjs "tools/gallery_hero.html?sec=pup" /tmp/out.png [--w 1300] [--h 900] [--dpr 1] [--full] [--wait "window.__ready"] [--clip x,y,w,h] [--timeout 120(초, 부하가 큰 기계에서는 늘릴 것)]
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
const argv = process.argv.slice(2);
const url = argv[0], out = argv[1];
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const port = 9100 + Math.floor(Math.random() * 700);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: Number(opt('w', 1300)), height: Number(opt('h', 900)) }, deviceScaleFactor: Number(opt('dpr', 1)) });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && /puppets/.test(r.url())) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
await page.goto(`http://localhost:${port}/${url}`);
const wait = opt('wait', 'window.__ready');
try { await page.waitForFunction(wait, null, { timeout: Number(opt('timeout', 120)) * 1000 }); } catch (e) { errs.push('WAIT TIMEOUT ' + wait); }
await page.waitForTimeout(Number(opt('delay', 300)));
const clip = opt('clip', null);
await page.screenshot({ path: out, fullPage: !!opt('full', false), ...(clip ? { clip: Object.fromEntries(clip.split(',').map(Number).map((v, i) => [['x', 'y', 'width', 'height'][i], v])) } : {}) });
const info = await page.evaluate(() => ({ status: window.__pupStatus || null, h: document.body.scrollHeight }));
console.log(JSON.stringify({ out, errs, pageH: info.h, status: info.status && Object.fromEntries(Object.entries(info.status).map(([k, v]) => [k, v.state + ' ' + v.levels.join(',')])) }));
await browser.close(); srv.close();
