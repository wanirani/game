import { chromium } from 'playwright-core';
import { start } from '/home/user/game/tools/serve.mjs';
import fs from 'node:fs';
const OUT = process.argv[2] || '/tmp/claude-0/qa_menugames';
fs.mkdirSync(OUT, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const res = {};
async function newPage(mobile) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
  return page;
}
const go = async (page, q, w = 2200) => { await page.goto(`http://localhost:${port}/index.html?${q}`); await page.waitForTimeout(w); };
const key = async (page, k, d = 80) => { await page.keyboard.down(k); await page.waitForTimeout(d); await page.keyboard.up(k); await page.waitForTimeout(60); };
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png` });
const which = process.argv[3] || 'all';
const on = (k) => which === 'all' || which.split(',').includes(k);

const page = await newPage(false);
if (on('inn')) {
  await go(page, 'scene=inn', 3000);
  res.inn = await page.evaluate(() => { const s = window.__game.top; const h = s.hits.rects; return { b1000: h.get('bet:1000'), start: h.get('start'), vw: window.__game.viewW }; });
  await shot(page, 'inn_dice');
  for (let i = 0; i < 3; i++) await key(page, 'ArrowRight');
  await page.waitForTimeout(300);
  await shot(page, 'inn_duel');
}
if (on('bj')) {
  await go(page, 'scene=minigame_blackjack', 2500);
  await shot(page, 'bj_ready');
}
if (on('slot')) {
  await go(page, 'scene=minigame_slot', 2500);
  await page.evaluate(() => { const s = window.__game.top; s.free = false; });
  await key(page, 'KeyZ');
  await page.waitForTimeout(250); await shot(page, 'slot_spin_a');
  await page.waitForTimeout(500); await shot(page, 'slot_spin_b');
  res.slot = await page.evaluate(() => { const s = window.__game.top; return { stop0: s.hits.rects.get('stop0'), betPop: s.betPop }; });
}
if (on('dice')) {
  await go(page, 'scene=minigame_dice', 2500);
  await page.evaluate(() => {
    const g = window.__game, s = g.top;
    g.state.gold = 30;
    s.free = true; s.takeBet();
    s.streak = 1; s.mult = 1.02; s.history.push({ s: 10, r: 0 }, { s: 12, r: 1 }); s.cur = 12; s.phase = 'done';
    s.settle({ win: true, payout: 51, tier: 'win', title: '거두기 성공!', sub: '1연승', cy: 232, delay: 0 });
  });
  await page.waitForTimeout(700);
  await key(page, 'KeyZ');
  await page.waitForTimeout(400);
  res.dice = await page.evaluate(() => { const s = window.__game.top; return { phase: s.phase, streak: s.streak, mult: s.mult, hist: s.history.length, result: !!s.result, bet: s.bet, gold: window.__game.state.gold }; });
  await shot(page, 'dice_again_poor');
  // 다시: 준비 단계에서 금화 부족으로 시작 실패 시 판 정보 초기화 확인
  res.dice2 = await page.evaluate(() => { const s = window.__game.top; s.result = null; s.phase = 'ready'; s.streak = 3; s.history.push({ s: 5, r: 1 }); s.startRound(); return { phase: s.phase, streak: s.streak, hist: s.history.length }; });
}
if (on('duel')) {
  await go(page, 'scene=minigame_duel', 2500);
  res.duel = await page.evaluate(async () => {
    const { session } = await import('/src/scenes/games/common.js');
    const g = window.__game, s = g.top; const out = [];
    for (const fi of [0, 1, 3]) {
      g.state.gold = 5000; g.state.innGames.duelRank = 4;
      s.result = null; s.phase = 'ready'; s.foeIdx = fi; s.makeFoe(); s.free = false; s.bet = 100;
      s.startRound(); s.score = [2, 0]; s.fouls = 0; s.times = [0.25, 0.26]; s.phase = 'shot';
      s.endRound();
      out.push({ fi, tier: session.last.tier, perfect: session.last.perfect, payout: session.last.payout });
    }
    return out;
  });
  await page.evaluate(() => { const s = window.__game.top; s.result = null; s.phase = 'ready'; });
  await page.waitForTimeout(300);
  await shot(page, 'duel_ready');
}
if (on('menu')) {
  await go(page, 'scene=stage&stage=s01', 3500);
  await page.evaluate(() => import('/tools/menu_seed.js?tab=status&seed=1'));
  await page.waitForTimeout(600);
  await key(page, 'ArrowDown');
  await page.waitForTimeout(300);
  await shot(page, 'menu_status');
  await page.evaluate(() => { const g = window.__game; while (g.top.name !== 'stage') g.pop(); });
  await page.evaluate(() => import('/tools/menu_seed.js?tab=skills&x=2'));
  await page.waitForTimeout(600);
  await shot(page, 'menu_skills');
  await page.evaluate(() => { const g = window.__game; while (g.top.name !== 'stage') g.pop(); });
  await page.evaluate(async () => { const inv = await import('/src/game/inventory.js'); inv.addByBase(window.__game.state, 'k_relic_1', 1); });
  await page.evaluate(() => import('/tools/menu_seed.js?tab=inventory&x=3'));
  await page.waitForTimeout(500);
  res.inv = await page.evaluate(() => { const m = window.__game.top; const t = m.cur; t.fi = 6; t.i = 0; t.rebuild(); m.focus = 'content'; return { n: t.items.length, sel: t.sel?.b.id, acts: t.actions(t.sel).map((a) => a.id), hints: t.hints() }; });
  await page.waitForTimeout(300);
  await shot(page, 'menu_inv_key');
  await key(page, 'KeyC');
  res.invLock = await page.evaluate(() => { const t = window.__game.top.cur; return !!t.sel?.inst.locked; });
}
// 모바일
if (on('mobile')) {
  const mp = await newPage(true);
  await go(mp, 'scene=inn', 3000);
  await mp.evaluate(() => { window.__game.top; });
  res.mInn = await mp.evaluate(() => { const g = window.__game; return { vw: g.viewW, touch: (g.top.hits.rects.get('bet:50')) }; });
  await shot(mp, 'm_inn');
  for (const sc of ['minigame_slot', 'minigame_duel', 'minigame_blackjack', 'minigame_dice', 'minigame_memory']) {
    await go(mp, `scene=${sc}`, 2500);
    // 터치 모드 강제 (탭 한 번)
    await mp.touchscreen.tap(600, 30); await mp.waitForTimeout(200);
    if (sc === 'minigame_slot') { await mp.evaluate(() => { const s = window.__game.top; s.free = false; s.spin(); }); await mp.waitForTimeout(400); }
    res['m_' + sc] = await mp.evaluate(() => { const g = window.__game, s = g.top; const k = g.viewW / innerWidth; const o = { touch: (window.__input ?? null) }; for (const [id, r] of s.hits.rects) o[id] = `${(r.w / k).toFixed(0)}x${(r.h / k).toFixed(0)}`; return o; });
    await shot(mp, 'm_' + sc);
  }
}
fs.writeFileSync(`${OUT}/res.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1));
console.log(errors.length ? errors.join('\n') : 'NO ERRORS');
await browser.close();
srv.close();
