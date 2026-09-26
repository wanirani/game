// 마을 QA 스크린샷 도우미: node shoot.mjs <outDir> <scenario...>
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import fs from 'node:fs';
const out = process.argv[2];
const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const wait = (p, s) => p.waitForTimeout(s * 1000);
async function open(url, mobile = false) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${url}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${url}] pageerror ${e.message}\n${e.stack}`));
  await page.goto(`http://localhost:${port}/${url}`);
  await wait(page, 2.2);
  return { page, ctx };
}
const key = async (page, k, s = 0.1) => { await page.keyboard.down(k); await wait(page, s); await page.keyboard.up(k); await wait(page, 0.05); };
const SC = {
  async worldmap() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(() => { const g = window.__game, P = g.state.progress; for (const id of ['s01','s02','s03','s04','s05','s06','s07','s08','s09','s10','s11','s12']) { if (!P.unlocked.includes(id)) P.unlocked.push(id); P.cleared[id] = { rank: 'S', time: 300, score: 12345 }; } P.relics = ['k_relic_1','k_relic_2','k_relic_3']; g.push('worldmap', { world: g.world }); });
    await wait(page, 1.2);
    await page.screenshot({ path: `${out}/worldmap.png` });
    await ctx.close();
  },
  async wmfresh() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(() => { const g = window.__game, P = g.state.progress; for (const id of ['s01','s02','s03','s04','s05','s06','s07','s08','s09','s10']) { if (!P.unlocked.includes(id)) P.unlocked.push(id); if (id !== 's10') P.cleared[id] = { rank: 'SS', time: 300, score: 12345 }; } g.push('worldmap', { world: g.world }); });
    await wait(page, 1.2);
    await page.screenshot({ path: `${out}/wm_s10.png` });
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight']) { await key(page, k); await wait(page, 0.9); await page.screenshot({ path: `${out}/wm_next_${Math.random().toString(36).slice(2,5)}.png` }); }
    await ctx.close();
  },
  async party() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(() => { const g = window.__game; g.meta.unlockedChars = ['kael', 'sera', 'lia', 'victor', 'iris', 'ren']; g.push('party', { world: g.world }); });
    await wait(page, 0.8); await key(page, 'ArrowRight'); await wait(page, 0.5);
    await page.screenshot({ path: `${out}/party.png` });
    await ctx.close();
  },
  async church() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(() => { const g = window.__game; g.state.gold = 5000; g.push('church', { world: g.world }); });
    await wait(page, 0.8);
    await page.screenshot({ path: `${out}/church_class.png` });
    await key(page, 'KeyD'); await wait(page, 0.3); await key(page, 'KeyZ'); await wait(page, 3.2);
    await page.screenshot({ path: `${out}/church_pray.png` });
    await page.evaluate(() => { const c = window.__game.top; c.talk('「금단의 대도서관」에는 아직 찾지 못한 비전서가 2권 남아 있네. 수상한 벽은 무기로 두드려 보게. 그리고 하나 더 — 금빛 박쥐를 놓치지 말게나.'); c.say.shown = 999; });
    await wait(page, 0.3);
    await page.screenshot({ path: `${out}/church_long.png` });
    await key(page, 'KeyD'); await wait(page, 0.4);
    const g0 = await page.evaluate(() => window.__game.state.gold);
    await key(page, 'KeyZ'); await wait(page, 0.4); await page.screenshot({ path: `${out}/church_reset.png` }); await key(page, 'KeyZ'); await wait(page, 0.4);
    const g1 = await page.evaluate(() => window.__game.state.gold);
    console.log('reset gold', g0, '->', g1);
    await key(page, 'KeyD'); await wait(page, 0.4);
    await page.screenshot({ path: `${out}/church_save.png` });
    await ctx.close();
  },
  async shop() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(async () => {
      const g = window.__game, st = g.state;
      const Items = await import('/src/data/items.js'); const Inv = await import('/src/game/inventory.js');
      const w = Items.makeItem('w_whip_2', { rarity: 2 }); w.level = 6; Inv.addItem(st, w);
      g.push('shop', { world: g.world });
    });
    await wait(page, 0.8);
    await page.screenshot({ path: `${out}/shop0.png` });
    // 판매 탭 찾기
    const tabs = await page.evaluate(() => window.__game.top.tabs.map((t) => t.id));
    const si = tabs.indexOf('sell');
    for (let i = 0; i < si; i++) { await key(page, 'KeyD'); await wait(page, 0.2); }
    await wait(page, 0.4);
    await page.evaluate(() => { const s = window.__game.top; const i = s.entries?.findIndex((e) => (e.inst?.level ?? 0) > 0); if (i >= 0) s.list.index = i; });
    await wait(page, 0.4);
    await page.screenshot({ path: `${out}/shop_sell.png` });
    await ctx.close();
  },
  async smith() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(() => { const g = window.__game; g.push('smith', { world: g.world }); });
    await wait(page, 0.8); await key(page, 'KeyA'); await wait(page, 0.3);
    await page.screenshot({ path: `${out}/smith.png` });
    await ctx.close();
  },
  async hub() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(() => { const g = window.__game, st = g.state; st.progress.relics = ['k_relic_1','k_relic_2','k_relic_3','k_relic_4','k_relic_5']; const h = st.heroes[st.charId]; h.level = 99; h.exp = 0; });
    await wait(page, 0.6);
    await page.screenshot({ path: `${out}/hub_top.png`, clip: { x: 0, y: 0, width: 1280, height: 200 } });
    await ctx.close();
  },
  async hubfrom() {
    for (const from of ['prologue', 'load', 's01', 'inn']) {
      const { page, ctx } = await open('index.html?scene=hub');
      await page.evaluate((f) => window.__game.go('hub', { from: f }, { fade: false }), from);
      await wait(page, 0.8);
      const px = await page.evaluate(() => { const p = window.__game.world.player; return [Math.round(p.x), p.facing]; });
      console.log('hub from', from, px);
      await page.screenshot({ path: `${out}/hub_from_${from}.png` });
      await ctx.close();
    }
  },
  async forge() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(() => { const p = window.__game.world.player; p.x = 2150; });
    await wait(page, 1.0);
    await page.screenshot({ path: `${out}/forge.png` });
    await page.screenshot({ path: `${out}/forge_zoom.png`, clip: { x: 560, y: 440, width: 280, height: 220 } });
    await ctx.close();
  },
  async talk() {
    const { page, ctx } = await open('index.html?scene=hub');
    await page.evaluate(() => { const w = window.__game.world; const h = w.entities.find((e) => e.npcId === 'npc_hadwin'); w.player.x = h.x - 40; });
    await wait(page, 0.8);
    await key(page, 'ArrowUp'); await wait(page, 1.2);
    await page.screenshot({ path: `${out}/talk.png` });
    await ctx.close();
  },
  async mobile() {
    const { page, ctx } = await open('index.html?scene=hub', true);
    await page.touchscreen.tap(400, 100); await wait(page, 0.6);
    const before = await page.evaluate(() => { const w = window.__game.world; return { hearts: w.run.hearts, mp: w.player.mp }; });
    for (const sel of ['#btns .sub', '#btns .sk1']) { const vis = await page.locator(sel).isVisible(); console.log(sel, 'visible', vis); if (vis) { await page.locator(sel).tap(); await wait(page, 0.4); } }
    await page.evaluate(() => { const i = window.__input; });
    await page.keyboard.down('KeyA'); await wait(page, 0.1); await page.keyboard.up('KeyA'); await wait(page, 0.3);
    await page.keyboard.down('KeyS'); await wait(page, 0.1); await page.keyboard.up('KeyS'); await wait(page, 0.5);
    const after = await page.evaluate(() => { const w = window.__game.world; return { hearts: w.run.hearts, mp: w.player.mp }; });
    console.log('mobile hub', JSON.stringify(before), '->', JSON.stringify(after));
    await page.screenshot({ path: `${out}/mobile_hub.png` });
    await ctx.close();
  },
};
for (const k of only.length ? only : Object.keys(SC)) { try { await SC[k](); } catch (e) { console.log('FAIL', k, e.message); } }
console.log(errors.length ? errors.join('\n') : 'NO ERRORS');
await browser.close();
srv.close();
