// 채색 보스 검증 도구 공용 함수 (playwright-core + tools/serve.mjs)
//  open({dpr,w,h,url,mobile})  → {page, errors, port, close}
//  startFight(page, bossId)    → 보스방 경기장 진입 → 대사/등장 연출 건너뛰기 → 보스 활성
//  freeze(page)                → 실제 루프 정지, window.__step(n, dt) 로 수동 진행 (결정론적 캡처용)
//  waitPainted(page, id)       → 채색 굽기 완료 대기 → {ms, memMB, td, bakeMs}
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';

export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** gpu=true: SwiftShader GL 로 가속 캔버스 경로(텍스처 블릿) 흉내 — 기본은 CPU 래스터(더 비관적) */
export async function open({ dpr = 1.5, w = 1280, h = 720, url = 'index.html?scene=stage&stage=s05&room=boss', mobile = false, log = false, gpu = false } = {}) {
  const port = 8000 + Math.floor(Math.random() * 900);
  const srv = await start(port);
  const args = ['--autoplay-policy=no-user-gesture-required'];
  if (gpu) args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-gpu-rasterization', '--ignore-gpu-blocklist');
  const browser = await chromium.launch({ executablePath: CHROME, args });
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: dpr ?? 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' }
    : { viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|ERR_CERT|fonts\.g/.test(t)) errors.push('CONSOLE ' + t.slice(0, 400)); }
    else if (log || m.text().includes('[painted]')) console.log('[page]', m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  await page.goto(`http://localhost:${port}/${url}`);
  await page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  return { port, srv, browser, page, errors, close: async () => { await browser.close(); srv.close(); } };
}

/** 경기장 진입 → 보스 생성 → 대사/등장 오버레이 닫기 */
export async function startFight(page, bossId = null) {
  await page.evaluate((bossId) => {
    const g = window.__game, w = g.world;
    const id = bossId ?? w.room.bossId ?? w.stage.boss;
    if (!w.state.progress.seenScripts.includes(id + '_pre')) w.state.progress.seenScripts.push(id + '_pre');
    const p = w.player;
    p.x = w.arenaX + 48 * 3; p.y -= 4;
  }, bossId);
  // 대사/등장 연출을 닫으며 진짜 보스를 기다린다: 보스 클래스는 늦게 받을 수 있어(bosses/lazy.js) world.boss 가 잠시
  // 대역(PendingBoss, pendingBoss=true)일 수 있다 — 대역은 스테이지가 돌아야 진짜로 바뀌므로 위에 뜬 연출부터 닫는다
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) {
    ready = await page.evaluate(() => {
      const g = window.__game, top = g.scenes[g.scenes.length - 1];
      if (top?.name === 'bossIntro' || top?.name === 'dialogue') {
        if (typeof top.finish === 'function') top.finish(); else { g.pop(); top.onDone?.(); top.onEnd?.(); }
        return false;
      }
      const b = g.world?.boss;
      return !!b && !b.pendingBoss && top?.name === 'stage';
    });
    if (!ready) await page.waitForTimeout(150);
  }
  if (!ready) throw new Error('startFight: 보스가 준비되지 않음 (world.boss 없음/대역 상태 또는 스테이지가 맨 위가 아님)');
  await page.evaluate(() => { const w = window.__game.world; w.cutscene = false; });
  await page.waitForTimeout(200);
}

export async function waitPainted(page, id, timeout = 20000) {
  await page.waitForFunction((id) => window.__painted?.[id], id, { timeout });
  return page.evaluate((id) => window.__painted[id], id);
}

/** 실제 루프 정지 → window.__step(n, dt) */
export async function freeze(page) {
  await page.evaluate(() => {
    const g = window.__game;
    if (g.__frozen) return;
    g.__frozen = true;
    g.__tick = g.tick.bind(g); g.__render = g.render.bind(g);
    g.tick = () => {}; g.render = () => {};
    window.__step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) g.__tick(dt); g.__render(); };
  });
}
/** 게임플레이 난수 고정 (포즈 캡처를 매번 같게) */
export async function seedRandom(page, seed = 12345) {
  await page.evaluate((seed) => { let x = seed >>> 0 || 1; Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }, seed);
}
