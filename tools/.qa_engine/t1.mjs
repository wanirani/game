// 엔진 클러스터 수정 검증
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
const port = 8000 + Math.floor(Math.random() * 900);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const only = process.argv[2] ? process.argv[2].split(',') : null;
async function run(name, url, fn) {
  if (only && !only.includes(name)) return;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource/.test(t)) errs.push('CONSOLE ' + t.slice(0, 200)); } });
  await page.goto(`http://localhost:${port}/${url}`);
  await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  let res;
  try { res = await fn(page); } catch (e) { res = 'HARNESS ' + e.message; }
  console.log(`== ${name}:`, JSON.stringify(res), errs.length ? '\n   ERRS ' + errs.slice(0, 5).join('\n   ') : '');
  await ctx.close();
}
const W = (page, ms) => page.waitForTimeout(ms);
const top = (page) => page.evaluate(() => __game.scenes.map((s) => s.name).join('>'));

// 1) 보스 _post 대사 + 드롭 자동 획득 + 레벨업 토스트
await run('post', 'index.html?scene=stage&stage=s02&room=boss&char=bran', async (page) => {
  await page.evaluate(() => { const w = __game.world; w.player.x = w.arenaX + 48 * 2; w.startBoss(); });
  // pre 대사 / 보스 인트로 넘기기
  for (let i = 0; i < 40; i++) { const t = await top(page); if (!/dialogue|bossIntro/.test(t)) break; await page.keyboard.press('KeyX'); await W(page, 250); }
  const before = await page.evaluate(() => ({ inv: __game.state.inventory?.length ?? __game.state.bag?.length, gold: __game.state.gold, lives: __game.world.run.lives }));
  await page.evaluate(() => { const w = __game.world; w.player.x = w.arenaX + 20; w.boss.takeHit(w.boss.hp + 10, {}, w, {}); });
  let sawPost = false, t = '';
  for (let i = 0; i < 60; i++) {
    t = await top(page);
    const script = await page.evaluate(() => { const s = __game.scenes[__game.scenes.length - 1]; return s.name === 'dialogue' ? s.lines?.[0]?.text : null; });
    if (/dialogue/.test(t)) { sawPost = true; break; }
    if (/results/.test(t)) break;
    await W(page, 200);
  }
  const midPickups = await page.evaluate(() => __game.world.entities.filter((e) => e.kind === 'pickup' && !e.dead).map((e) => e.type));
  const seen = await page.evaluate(() => __game.state.progress.seenScripts.slice());
  for (let i = 0; i < 40; i++) { const tt = await top(page); if (!/dialogue/.test(tt)) break; await page.keyboard.press('KeyX'); await W(page, 200); }
  await W(page, 1500);
  const after = await page.evaluate(() => ({ inv: __game.state.inventory?.length ?? __game.state.bag?.length, gold: __game.state.gold, lives: __game.state.lives, flags: Object.keys(__game.state.progress.flags).filter((k) => k.startsWith('loot')), toasts: __game.toasts.map((x) => x.text) }));
  return { sawPost, sceneAtPost: t, seen, midPickups, before, after, final: await top(page) };
});

// 2) 관통 투사체: 같은 대상 1회
await run('pierce', 'index.html?scene=stage&stage=s05&room=r1&char=victor', async (page) => {
  return page.evaluate(async () => {
    const w = __game.world, p = w.player;
    const e = w.spawnEnemy('mummy', p.cx + 260, p.bottom, {});
    e.hp = e.stats.maxHp = 1e7; e.stats.hp = 1e7;
    let hits = 0; const orig = e.takeHit.bind(e); e.takeHit = (...a) => { hits++; return orig(...a); };
    w.spawnProjectile({ x: p.cx + 60, y: e.cy, vx: 300, vy: 0, w: 60, h: 40, life: 1.2, pierce: 99, owner: p, attack: p.makeAttack({ mv: 1 }, { tags: ['projectile'], hitId: undefined }) });
    await new Promise((r) => setTimeout(r, 1500));
    return { hits };
  });
});

// 3) A 보스 페이즈 리셋 (본 드래곤 쌍두)
await run('abossreset', 'index.html?scene=stage&stage=s05&room=boss&char=victor', async (page) => {
  await page.evaluate(() => { const w = __game.world; w.player.x = w.arenaX + 48 * 2; w.startBoss(); });
  for (let i = 0; i < 40; i++) { const t = await top(page); if (!/dialogue|bossIntro/.test(t)) break; await page.keyboard.press('KeyX'); await W(page, 250); }
  await page.evaluate(() => { const w = __game.world, b = w.boss; b.takeHit(Math.floor(b.hp * 0.8), {}, w, {}); });
  await W(page, 2500);
  const mid = await page.evaluate(() => { const b = __game.world.boss; return { hp: b.hp, max: b.stats.maxHp, phase: b.phase, twin: !!b.twin }; });
  await page.evaluate(() => { const w = __game.world, p = w.player; p.iframes = 0; p.hp = 1; p.takeHit(99999, { team: 'enemy', flat: 99999, dir: 1, kb: [0, 0] }, w, {}); });
  await W(page, 5000);
  const after = await page.evaluate(() => { const w = __game.world, b = w.boss; return { hp: b.hp, max: b.stats.maxHp, phase: b.phase, twin: !!b.twin, state: b.state, lives: w.run.lives, px: Math.round(w.player.x), x0: w.arena.x0, camx: Math.round(w.camera.x), bosses: w.entities.filter((e) => e.kind === 'boss' && !e.dead).length }; });
  return { mid, after };
});

// 4) 벽 틈 비전서 (s03 r2 H(1,12))
await run('doc', 'index.html?scene=stage&stage=s03&room=r2&char=bran', async (page) => {
  await page.evaluate(() => { const w = __game.world, p = w.player; p.x = 2 * 48 + 2; p.y = 13 * 48 - p.h; p.facing = -1; for (const e of w.enemies()) e.dead = true; });
  await W(page, 300);
  await page.keyboard.down('ArrowLeft'); await W(page, 200); await page.keyboard.up('ArrowLeft');
  for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyX'); await W(page, 350); }
  await page.keyboard.down('ArrowLeft'); await W(page, 1500); await page.keyboard.up('ArrowLeft');
  for (let i = 0; i < 5; i++) { const t = await top(page); if (!/document/.test(t)) break; await page.keyboard.press('KeyX'); await page.keyboard.press('Escape'); await W(page, 300); }
  return page.evaluate(() => ({ docs: __game.state.progress.docs.slice(), px: Math.round(__game.world.player.x), docEnt: __game.world.entities.filter((e) => e.kind === 'pickup').map((e) => [e.type, Math.round(e.x), Math.round(e.y)]) }));
});

// 5) 화면 흔들림 0
await run('shake', 'index.html?scene=stage&stage=s03&room=r1', async (page) => {
  return page.evaluate(async () => {
    const w = __game.world; __game.settings.screenShake = 0;
    const { explode } = await import('/src/game/projectiles.js');
    explode(w, w.player.cx + 300, w.player.cy, {});
    const a = w.camera.shakeMag;
    __game.settings.screenShake = 0.5; w.camera.shakeMag = 0; w.camera.shake(10, 0.3);
    const b = w.camera.shakeMag;
    __game.settings.screenShake = 1;
    return { off: a, half: b };
  });
});

// 6) 아케이드 1UP / 연습 저장 / 품질
await run('arcade', 'index.html?scene=stage&stage=s01&room=r1', async (page) => {
  return page.evaluate(() => {
    const w = __game.world;
    const l0 = w.run.lives; w.addScore(95000); const story = w.run.lives - l0;
    w.mode = 'survival'; const l1 = w.run.lives; w.addScore(200000); const surv = w.run.lives - l1;
    w.mode = 'practice';
    localStorage.removeItem('bloodnocturne_slot_0'); __game.state.slot = 0;
    w.useSavePoint({ x: w.player.x, bottom: w.player.bottom, cx: w.player.cx, cy: w.player.cy });
    const slot0 = !!localStorage.getItem('bloodnocturne_slot_0');
    w.mode = 'story';
    __game.settings.quality = 'low'; w.update(1 / 60);
    const q = { fxq: w.fx.quality, lres: w.lighting.res, max: w.fx.max };
    __game.settings.quality = 'high'; w.update(1 / 60);
    return { story, surv, slot0, q, qBack: w.fx.quality, toasts: __game.toasts.map((t) => t.text) };
  });
});

// 7) 구덩이 낙하 복귀 (s03 r1: col 19~34 땅, 35~ 구덩이)
await run('fall', 'index.html?scene=stage&stage=s03&char=lia', async (page) => {
  return page.evaluate(async () => {
    const w = __game.world, p = w.player, m = w.map;
    for (const e of w.enemies()) e.dead = true;
    for (const e of w.entities) if (e.kind === 'platform' || e.constructor.name === 'MovingPlatform') e.dead = true;
    w.platforms.length = 0;
    p.x = 30 * 48 + 4; p.y = 9 * 48 - p.h; p.vy = 0;
    await new Promise((r) => setTimeout(r, 500));
    const safe = p.safeSpot && { ...p.safeSpot };
    p.x = 37 * 48 + 6; p.y = 9 * 48 - p.h - 10; p.vx = 0;
    await new Promise((r) => setTimeout(r, 2000));
    return { safe: safe && Math.round(safe.x / 48), after: Math.round(p.x / 48), cp: Math.round(w.run.checkpoint.x / 48), hp: Math.round(p.hp), max: p.stats.hp };
  });
});

// 8) K 상자 (s02 r2 K(1,13))
await run('kchest', 'index.html?scene=stage&stage=s02&room=r2&char=bran', async (page) => {
  const r = [];
  for (let k = 0; k < 1; k++) {
    await page.evaluate(() => { const w = __game.world, p = w.player; for (const e of w.enemies()) e.dead = true; p.x = 2 * 48 + 2; p.y = 14 * 48 - p.h; p.facing = -1; });
    await W(page, 300);
    await page.keyboard.down('ArrowLeft'); await W(page, 200); await page.keyboard.up('ArrowLeft');
    for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyX'); await W(page, 350); }
    const chest = await page.evaluate(() => { const c = __game.world.entities.find((e) => e.hiddenNiche); const p = __game.world.player; return c ? { open: c.open, near: c.near, d: Math.round(Math.abs(p.cx - c.cx)) } : null; });
    await page.keyboard.press('ArrowUp'); await W(page, 200);
    const inv0 = await page.evaluate(() => (__game.state.inventory ?? __game.state.bag ?? []).length);
    await page.keyboard.down('ArrowLeft'); await W(page, 2500); await page.keyboard.up('ArrowLeft');
    r.push(await page.evaluate((inv0) => ({ inv0, inv: (__game.state.inventory ?? __game.state.bag ?? []).length, left: __game.world.entities.filter((e) => e.kind === 'pickup' && !e.dead).map((e) => [e.type, Math.round(e.x), Math.round(e.y)]) }), inv0));
    r.push(chest);
  }
  return r;
});
await browser.close(); srv.close();
