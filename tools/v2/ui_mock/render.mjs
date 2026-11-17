// 인터페이스 시안 캡처 + 크기·겹침 검사.
//   node tools/v2/ui_mock/render.mjs [styles=fieldkit,glass,silver] [outDir=/tmp/claude-0/v2/uipilot] [devs=fold_open,phone2]
// 스타일 × 기기 × 보기(전투·대화·가방)를 찍고, 눌리는 것의 최소 크기(44 CSS px)·겹침·화면 밖·엄지 거리를 measure.json 에 적는다.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../../serve.mjs';
import { contextOptions } from '../../qa/lib/viewports.mjs';
const styles = (process.argv[2] || 'fieldkit,glass,silver').split(',');
const out = process.argv[3] || '/tmp/claude-0/v2/uipilot';
const devs = (process.argv[4] || 'fold_open,phone2').split(',');
mkdirSync(out, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const report = {}; let bad = 0;
for (const dev of devs) {
  const ctx = await browser.newContext(contextOptions(dev));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('[console] ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[${r.status()}] ` + r.url()); });
  page.on('requestfailed', (r) => errs.push('[404] ' + r.url()));
  for (const st of styles) for (const [view, bg] of [['play', 'yard'], ['play', 'alley'], ['dialog', 'street'], ['menu', 'yard']]) {
    await page.goto(`http://localhost:${port}/tools/v2/ui_mock/${st}/index.html?view=${view}&bg=${bg}&shot=1`);
    await page.waitForFunction(() => window.__ui && document.fonts.status === 'loaded');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(350);
    const name = `${st}_${dev}_${view}${view === 'play' && bg !== 'yard' ? '_' + bg : ''}`;
    await page.screenshot({ path: `${out}/${name}.png` });
    const m = await page.evaluate(() => window.__ui.measure());
    report[name] = m;
    const flag = m.small.length || m.overlaps.length || m.out.length;
    if (flag) bad++;
    console.log(`${flag ? 'CHECK' : 'ok   '} ${name}: minTouch ${m.minTouch} · small ${JSON.stringify(m.small)} · overlaps ${JSON.stringify(m.overlaps)} · out ${JSON.stringify(m.out)} · reach ${m.reachMax}(${m.reachWho}) · centre ${m.centerCoverPct}% · hud ${m.hudAreaPct}%`);
  }
  if (errs.length) { console.log(dev, 'ERRORS', [...new Set(errs)].slice(0, 10).join('\n')); bad++; }
  await ctx.close();
}
writeFileSync(`${out}/measure.json`, JSON.stringify(report, null, 1));
console.log(bad ? `${bad} to check` : 'ALL OK');
await browser.close(); srv.close();
