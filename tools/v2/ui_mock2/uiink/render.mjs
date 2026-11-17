// 「먹과 달빛」 시안 캡처 + 크기 · 겹침 검사.
//   node tools/v2/ui_mock2/uiink/render.mjs [outDir=/tmp/claude-0/v2/uiink] [only=play,dialog,menu,...]
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../../../serve.mjs';
import { contextOptions } from '../../../qa/lib/viewports.mjs';
const out = process.argv[2] || '/tmp/claude-0/v2/uiink';
const only = process.argv[3] ? process.argv[3].split(',') : null;
mkdirSync(out, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const report = {}; let bad = 0; const strings = new Set();
const SHOTS = [['play', 'yard', ''], ['play', 'alley', ''], ['play', 'street', ''], ['dialog', 'street', ''], ['menu', 'yard', ''], ['play', 'yard', '&press=attack&ult=80']];
for (const dev of ['fold_open', 'phone2']) {
  const ctx = await browser.newContext(contextOptions(dev));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[${r.status()}] ` + r.url()); });
  for (const [view, bg, extra] of SHOTS) {
    const name = `${dev}_${view}${view === 'play' && bg !== 'yard' ? '_' + bg : ''}${extra ? '_press' : ''}`;
    if (only && !only.some((o) => name.includes(o))) continue;
    await page.goto(`http://localhost:${port}/tools/v2/ui_mock2/uiink/index.html?view=${view}&bg=${bg}&shot=1${extra}`);
    await page.waitForFunction(() => window.__ui, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${out}/${name}.png` });
    const m = await page.evaluate(() => window.__ui.measure());
    report[name] = m;
    for (const l of (await page.evaluate(() => document.getElementById('app').innerText)).split('\n')) { const t = l.trim(); if (/[가-힣]/.test(t)) strings.add(t); }
    const flag = m.small.length || m.overlaps.length || m.out.length; if (flag) bad++;
    console.log(`${flag ? 'CHECK' : 'ok   '} ${name}: minTouch ${m.minTouch} · small ${JSON.stringify(m.small)} · overlaps ${JSON.stringify(m.overlaps)} · out ${JSON.stringify(m.out)} · reach ${m.reachMax}(${m.reachWho}) · centre ${m.centerCoverPct}% · hud ${m.hudAreaPct}% (drawn ${m.hudDrawnPct}%) · minFont ${m.minFont}(${m.minFontWho})`);
  }
  if (errs.length) { console.log(dev, 'ERRORS', [...new Set(errs)].slice(0, 10).join('\n')); bad++; }
  await ctx.close();
}
if (!only) { writeFileSync(`${out}/measure.json`, JSON.stringify(report, null, 1)); writeFileSync(`${out}/strings.txt`, [...strings].sort().join('\n') + '\n'); }
console.log(bad ? `${bad} to check` : 'ALL OK');
await browser.close(); srv.close();
