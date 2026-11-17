// 눌리는지 검사: 공격 · 기술 · 조준 · 가방 · 칸 · 닫기 · 대화 넘기기를 실제 터치로 눌러 본다.  node tools/v2/ui_mock2/uiink/tap_check.mjs
import { chromium } from 'playwright-core';
import { start } from '../../../serve.mjs';
import { contextOptions } from '../../../qa/lib/viewports.mjs';
const port = 8100 + Math.floor(Math.random() * 800), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let bad = 0;
for (const dev of ['fold_open', 'phone2']) {
  const page = await (await browser.newContext(contextOptions(dev))).newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://localhost:${port}/tools/v2/ui_mock2/uiink/index.html`); await page.waitForFunction(() => window.__ui);
  const centre = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const tap = async (sel) => { const [x, y] = await centre(sel); await page.touchscreen.tap(x, y); await page.waitForTimeout(60); };
  const hash = (sel) => page.evaluate((s) => { const c = document.querySelector(s); return c.toDataURL().length + ':' + c.toDataURL().slice(-64); }, sel);
  const r = {};
  let h0 = await hash('#b-attack canvas'); await tap('#b-attack'); r.attackPressed = (await hash('#b-attack canvas')) !== h0; await page.waitForTimeout(260); r.attackReleased = (await hash('#b-attack canvas')) === h0;
  h0 = await hash('#b-s1 canvas'); await tap('#b-s1'); await page.waitForTimeout(300); r.skillCooling = (await hash('#b-s1 canvas')) !== h0;
  h0 = await hash('#b-lock canvas'); await tap('#b-lock'); await page.waitForTimeout(260); r.lockToggled = (await hash('#b-lock canvas')) !== h0;
  h0 = await hash('#b-mount canvas'); await tap('#b-mount'); await page.waitForTimeout(260); r.lockedStaysLocked = (await hash('#b-mount canvas')) === h0;
  await tap('#s-bag'); r.menuOpens = await page.evaluate(() => document.getElementById('app').classList.contains('v-menu'));
  await tap('.cell:nth-child(3)'); r.cellSelects = await page.evaluate(() => document.querySelector('.cell:nth-child(3)').classList.contains('sel'));
  await tap('.mclose'); r.menuCloses = await page.evaluate(() => document.getElementById('app').classList.contains('v-play'));
  await page.evaluate(() => window.__ui.setView('dialog')); const t0 = await page.textContent('.dt'); await tap('.dbox'); r.dialogAdvances = (await page.textContent('.dt')) !== t0;
  await tap('.dskip'); r.skipWorks = await page.evaluate(() => document.getElementById('app').classList.contains('v-play'));
  const fail = Object.entries(r).filter(([, v]) => !v).map(([k]) => k); if (fail.length || errs.length) bad++;
  console.log(dev, fail.length ? 'FAIL ' + fail.join(',') : 'ok', JSON.stringify(r), errs.length ? 'ERR ' + errs.join(' | ') : '');
}
console.log(bad ? 'CHECK' : 'ALL OK'); await browser.close(); srv.close();
