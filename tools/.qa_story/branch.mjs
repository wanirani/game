// 컷신(front/story.js)에서 ifChar/ifFlag 분기가 동작하는지 확인 (임시)
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/index.html?scene=stage&stage=s02&char=lia`);
await page.waitForTimeout(2500);
const first = async (script, flags = {}) => {
  await page.evaluate(({ script, flags }) => { const g = window.__game; Object.assign(g.state.progress.flags, flags); g.go('story', { script, then: 'title' }, { fade: false }); }, { script, flags });
  await page.waitForTimeout(700);
  const r = await page.evaluate(() => { const t = window.__game.scenes.at(-1); return { scene: t.name, i: t.i, text: (t.full ?? '').slice(0, 40) }; });
  return r;
};
console.log('lia s02_outro   ', JSON.stringify(await first('s02_outro')));
console.log('s08_outro trust1', JSON.stringify(await first('s08_outro', { carmilla_trust1: true })));
console.log(errors.length ? errors.join('\n') : 'NO PAGE ERRORS');
await browser.close(); srv.close();
