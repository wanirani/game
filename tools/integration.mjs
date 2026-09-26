// 통합 스모크: 여러 화면/스테이지를 차례로 열어 페이지 오류를 수집하고 스크린샷을 남긴다.
// 사용: node tools/integration.mjs [--only s03,hub] [--out dir] [--mobile]
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const out = args.out || '/tmp/claude-0/integ';
fs.mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const mobile = !!args.mobile;
const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC', sub: 'KeyA', skill1: 'KeyS', skill2: 'KeyD', ult: 'KeyF', menu: 'Escape', enter: 'Enter', swap: 'KeyQ' };
const STAGES = ['s01','s02','s03','s04','s05','s06','s07','s08','s09','s10','s11','s12','s13'];
const CASES = [
  { id: 'title', url: 'index.html', steps: 'wait:1.5,shot,enter:0.1,wait:1,shot,down:0.1,down:0.1,wait:0.3,shot' },
  { id: 'hub', url: 'index.html?scene=hub', steps: 'wait:2,shot,right:2,shot,menu:0.1,wait:0.5,shot' },
  { id: 'worldmap', url: 'index.html?scene=worldmap', steps: 'wait:1.5,shot,right:0.1,wait:0.3,shot' },
  { id: 'inn', url: 'index.html?scene=inn', steps: 'wait:1.5,shot,down:0.1,enter:0.1,wait:1,shot' },
  { id: 'arcade', url: 'index.html?scene=arcade', steps: 'wait:1.5,shot' },
  ...STAGES.map((s) => ({ id: s, url: `index.html?scene=stage&stage=${s}`, steps: 'wait:3,shot,right:1.2,attack:0.15,wait:0.2,attack:0.15,jump:0.3,right:1,shot,menu:0.1,wait:0.6,shot,menu:0.1,wait:0.4,sub:0.1,skill1:0.1,wait:0.5' })),
  ...STAGES.map((s) => ({ id: s + '_boss', url: `index.html?scene=stage&stage=${s}&room=boss`, steps: 'wait:2.5,right:2.5,wait:4.5,enter:0.1,wait:1.5,enter:0.1,wait:1.5,enter:0.1,wait:3,shot,attack:0.2,attack:0.2,attack:0.2,wait:1,shot' })),
  { id: 'menu', url: 'index.html?scene=stage&stage=s02', steps: 'wait:2.5,menu:0.1,wait:0.5,down:0.1,enter:0.1,wait:1,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot' },
];
const only = args.only ? String(args.only).split(',') : null;
const report = [];
for (const c of CASES) {
  if (only && !only.includes(c.id)) continue;
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|ERR_CERT|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  try {
    await page.goto(`http://localhost:${port}/${c.url}`, { timeout: 30000 });
    let n = 0;
    for (const s of c.steps.split(',')) {
      const [k, d] = s.split(':');
      if (k === 'shot') { await page.screenshot({ path: `${out}/${c.id}_${n++}.png` }); continue; }
      if (k === 'wait') { await page.waitForTimeout(Number(d) * 1000); continue; }
      const key = KEY[k] || k;
      await page.keyboard.down(key); await page.waitForTimeout(Number(d || 0.1) * 1000); await page.keyboard.up(key); await page.waitForTimeout(40);
    }
    const info = await page.evaluate(() => { const g = window.__game; return g ? { scenes: g.scenes.map((s) => s.name).join('>'), room: g.world?.roomId, hp: Math.round(g.world?.player?.hp ?? -1), boss: g.world?.boss?.def?.id, fps: Math.round(g.fps) } : null; });
    report.push({ id: c.id, info, errs: [...new Set(errs)] });
  } catch (e) { report.push({ id: c.id, info: null, errs: ['HARNESS ' + e.message] }); }
  await ctx.close();
  const r = report[report.length - 1];
  console.log(`${r.errs.length ? '✗' : '✓'} ${c.id} ${JSON.stringify(r.info)}${r.errs.length ? '\n    ' + r.errs.slice(0, 6).join('\n    ') : ''}`);
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
await browser.close(); srv.close();
