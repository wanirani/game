// ui2review — 두 2차 시안을 같은 조건으로 다시 재는 독립 검사.
//   node tools/v2/ui_mock2/ui2review/review.mjs [outDir=/tmp/claude-0/v2/ui2review]
// 시안이 스스로 잰 값(measure())을 쓰지 않는다: 눌림 크기는 DOM 네모, 가림·투명도는 흰 바탕/검은 바탕 두 장의 픽셀 차로 잰다
//   (HUD 픽셀의 불투명도 a = 1 - (흰 바탕 값 - 검은 바탕 값) / 255).
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../../../serve.mjs';
import { contextOptions } from '../../../qa/lib/viewports.mjs';
const out = process.argv[2] || '/tmp/claude-0/v2/ui2review';
mkdirSync(out, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const rep = {};
for (const name of ['uigem', 'uiink']) for (const dev of ['fold_open', 'phone2']) {
  const ctx = await browser.newContext(contextOptions(dev));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(r.status() + ' ' + r.url()); });
  const key = `${name}_${dev}`;
  for (const [view, bg] of [['play', 'yard'], ['play', 'street'], ['play', 'alley'], ['dialog', 'street'], ['menu', 'yard']]) {
    await page.goto(`http://localhost:${port}/tools/v2/ui_mock2/${name}/index.html?view=${view}&bg=${bg}&shot=1`);
    await page.waitForFunction(() => window.__ui, null, { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const tag = `${key}_${view}${view === 'play' ? '_' + bg : ''}`;
    await page.screenshot({ path: `${out}/${tag}.png` });
    if (view === 'play' && bg === 'yard') {
      rep[key] = await page.evaluate(() => {
        const app = document.getElementById('app');
        const vis = (e) => { for (let p = e; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; };
        const els = [...app.querySelectorAll('.abtn,.sbtn,#stick')].filter(vis);
        const rects = els.map((e) => { const r = e.getBoundingClientRect(); const c = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { id: e.id || e.className, x: r.left, y: r.top, w: r.width, h: r.height, round: getComputedStyle(e).borderRadius, hitOk: !!c && (c === e || e.contains(c)) }; });
        let minGap = 1e9, gapWho = '';
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], b = rects[j]; if (a.id === 'stick' || b.id === 'stick') continue; const d = Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2) - (Math.min(a.w, a.h) + Math.min(b.w, b.h)) / 2; if (d < minGap) { minGap = d; gapWho = a.id + '/' + b.id; } }
        return { W: innerWidth, H: innerHeight, dpr: devicePixelRatio, rects, minGap: +minGap.toFixed(1), gapWho };
      });
      for (const [c, col] of [['w', '#fff'], ['k', '#000']]) {
        await page.addStyleTag({ content: `#bg{background:${col} !important;filter:none !important;transform:none !important}` });
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${out}/${key}_alpha_${c}.png` });
      }
    }
  }
  rep[key].errors = [...new Set(errs)];
  console.log(key, 'done', errs.length ? errs.slice(0, 3) : '');
  await ctx.close();
}
writeFileSync(`${out}/dom.json`, JSON.stringify(rep, null, 1));
await browser.close(); srv.close();
