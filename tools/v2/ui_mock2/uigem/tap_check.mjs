// uigem 시안이 실제로 눌리는지 확인 (폴드·휴대폰): 가방 → 메뉴 열림, 닫기, 기술 → 재사용 대기 시작, 조준 켜고 끄기, 칸 고르기, 스틱 끌기, 대화 넘기기.
//   node tools/v2/ui_mock2/uigem/tap_check.mjs
import { chromium } from 'playwright-core';
import { start } from '../../../serve.mjs';
import { contextOptions } from '../../../qa/lib/viewports.mjs';
const port = 8100 + Math.floor(Math.random() * 800);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
const ok = (dev, name, v) => { console.log(`${v ? 'ok  ' : 'FAIL'} ${dev} ${name}`); if (!v) bad++; };
for (const dev of ['fold_open', 'phone2']) {
  const page = await (await browser.newContext(contextOptions(dev))).newPage();
  await page.goto(`http://localhost:${port}/tools/v2/ui_mock2/uigem/index.html`);
  await page.waitForFunction(() => window.__ui && document.fonts.status === 'loaded');
  const cls = () => page.evaluate(() => document.getElementById('app').className);
  const has = (sel, c) => page.evaluate(([s, k]) => document.querySelector(s).classList.contains(k), [sel, c]);
  await page.locator('#b-s1').tap(); await page.waitForTimeout(150); ok(dev, '기술 1 → 재사용 대기', await has('#b-s1', 'cool'));
  const before = await has('#b-lock', 'on'); await page.locator('#b-lock').tap(); ok(dev, '조준 켜고 끄기', (await has('#b-lock', 'on')) !== before);
  const box = await page.locator('#stick').boundingBox();
  await page.evaluate(([x, y]) => { const s = document.getElementById('stick'); const ev = (t, dx) => s.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x + dx, clientY: y, bubbles: true })); ev('pointerdown', 0); ev('pointermove', 40); }, [box.x + box.width / 2, box.y + box.height / 2]);
  ok(dev, '스틱 끌기', /translate\((2|3|4)/.test(await page.evaluate(() => document.querySelector('#stick .knob').style.transform)));
  await page.evaluate(() => document.getElementById('stick').dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, bubbles: true })));
  await page.locator('#s-bag').tap(); ok(dev, '가방 → 메뉴', /v-menu/.test(await cls()));
  await page.locator('.cell').nth(2).tap(); ok(dev, '칸 고르기', await page.evaluate(() => document.querySelectorAll('.cell')[2].classList.contains('sel')));
  await page.locator('.mtabs button').nth(1).tap(); ok(dev, '탭 바꾸기', await page.evaluate(() => document.querySelectorAll('.mtabs button')[1].classList.contains('on')));
  await page.locator('.mclose').tap(); ok(dev, '닫기 → 전투', /v-play/.test(await cls()));
  await page.locator('#views button[data-v=dialog]').tap(); ok(dev, '대화 열기', /v-dialog/.test(await cls()));
  const t0 = await page.locator('.dt').textContent(); await page.locator('.dbox').tap({ position: { x: 300, y: 60 } }); ok(dev, '대화 넘기기', (await page.locator('.dt').textContent()) !== t0);
  await page.locator('.dskip').tap(); ok(dev, '건너뛰기 → 전투', /v-play/.test(await cls()));
}
console.log(bad ? `${bad} FAILED` : 'ALL OK');
await browser.close(); srv.close();
