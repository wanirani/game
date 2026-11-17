// uigem 시안 캡처 + 크기·겹침 검사 + 잰 값용 캡처(HUD 숨김 / 아이콘·글자 숨김).
//   node tools/v2/ui_mock2/uigem/render.mjs [outDir=/tmp/claude-0/v2/uigem] [devs=fold_open,phone2]
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../../../serve.mjs';
import { contextOptions } from '../../../qa/lib/viewports.mjs';
const out = process.argv[2] || '/tmp/claude-0/v2/uigem';
const devs = (process.argv[3] || 'fold_open,phone2').split(',');
mkdirSync(out, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const report = {}; let bad = 0;
const base = `http://localhost:${port}/tools/v2/ui_mock2/uigem`;
for (const dev of devs) {
  const ctx = await browser.newContext(contextOptions(dev));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('[console] ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[${r.status()}] ` + r.url()); });
  const go = async (url) => { await page.goto(url); await page.waitForFunction(() => (window.__ui || window.__ready) && document.fonts.status === 'loaded'); await page.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => 0))])); await page.waitForTimeout(300); };
  for (const [view, bg, extra] of [['play', 'yard'], ['play', 'alley'], ['play', 'street'], ['dialog', 'street'], ['menu', 'yard'], ['menu', 'yard', 'noblur=1']]) {
    const name = `${dev}_${view}${view === 'play' && bg !== 'yard' ? '_' + bg : ''}${extra ? '_noblur' : ''}`;
    await go(`${base}/index.html?view=${view}&bg=${bg}&shot=1${extra ? '&' + extra : ''}`);
    await page.screenshot({ path: `${out}/${name}.png` });
    const m = await page.evaluate(() => window.__ui.measure());
    report[name] = m;
    const flag = m.small.length || m.overlaps.length || m.out.length;
    if (flag) bad++;
    console.log(`${flag ? 'CHECK' : 'ok   '} ${name}: minTouch ${m.minTouch} · small ${JSON.stringify(m.small)} · overlaps ${JSON.stringify(m.overlaps)} · out ${JSON.stringify(m.out)} · reach ${m.reachMax}(${m.reachWho}) · centre ${m.centerCoverPct}% · hud ${m.hudAreaPct}% · minFont ${m.minFont}(${m.minFontWho})`);
    if (view === 'play') for (const h of ['hud', 'ink']) { await go(`${base}/index.html?view=${view}&bg=${bg}&shot=1&hide=${h}`); await page.screenshot({ path: `${out}/_${name}__no${h}.png` }); }
  }
  if (errs.length) { console.log(dev, 'ERRORS', [...new Set(errs)].slice(0, 10).join('\n')); bad++; }
  await ctx.close();
}
writeFileSync(`${out}/measure.json`, JSON.stringify(report, null, 1));
console.log(bad ? `${bad} to check` : 'ALL OK');
await browser.close(); srv.close();
