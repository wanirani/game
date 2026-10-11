// 애니풍 시범: 턴테이블 칸 PNG 뽑기 (tools/gallery_turntable.html 의 __tt.render16 = 메뉴와 같은 HeroView 경로)
// node tools/puppet/anime/turn16_shots.mjs <outDir> [--anime] [--hero kael] [--li 0] [--yaws 0,22.5,...] [--w 300 --h 360] [--zoom 1]
//  --anime 없으면 플래그 꺼짐(예전 8방향 경로). 출력: <outDir>/yaw_<deg>.png + 콘솔 JSON {errs, a16}
import { chromium } from 'playwright-core';
import { start } from '../../serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const out = argv[0] || '/tmp/claude-0/g3/art_scratch/t16';
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const anime = !!opt('anime', false), hero = opt('hero', 'kael'), li = Number(opt('li', 0));
const yaws = String(opt('yaws', Array.from({ length: 16 }, (_, i) => i * 22.5).join(','))).split(',').map(Number);
const W = Number(opt('w', 300)), H = Number(opt('h', 360)), zoom = Number(opt('zoom', 1));
fs.mkdirSync(out, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 600);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 900, height: 700 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/tools/gallery_turntable.html?heroes=${hero}${anime ? '&anime=1' : ''}`);
await page.waitForFunction('window.__ready', null, { timeout: 60000 });
let a16 = false;
if (anime) {
  for (let k = 0; k < 80 && !a16; k++) { a16 = await page.evaluate((li) => window.__tt.a16Ready(0, li), li); if (!a16) await page.waitForTimeout(250); }
}
// 한 번 그려 시트 로드를 기다린다 (첫 칸이 대체 그림이 되지 않게)
for (let k = 0; k < 3; k++) { await page.evaluate(([li, W, H, z]) => window.__tt.render16(0, li, 45, W, H, z), [li, W, H, zoom]); await page.waitForTimeout(300); }
for (const d of yaws) {
  const url = await page.evaluate(([li, d, W, H, z, a]) => (a ? window.__tt.render16(0, li, d, W, H, z) : window.__tt.render(0, li, d, W, H)).toDataURL('image/png'), [li, d, W, H, zoom, anime]);
  fs.writeFileSync(path.join(out, `yaw_${String(d).replace('.', '_')}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
console.log(JSON.stringify({ errs, a16, n: yaws.length }));
await browser.close(); srv.close();
