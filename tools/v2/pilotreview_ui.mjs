// pilotreview: 인터페이스 시안 3종을 시안 스스로의 measure() 와 따로 따져 묻는다.  node tools/v2/pilotreview_ui.mjs [outDir]
//  1 눌리는 것: 포인터 커서가 붙은 모든 것의 최소 변 (시안의 선택자 목록에 기대지 않는다)
//  2 한글 문구: 잘리거나(overflow) 부모 밖으로 나간 글자
//  3 대비: 같은 화면을 어두운 밤 바탕 / 밝게 올린 바탕 / 거의 흰 바탕(섬광)에 찍어, 버튼 안 그림·HUD 글자가 바탕과 얼마나 갈리는가
//  4 가림: 시범판 B 를 실제로 돌려 영웅·적의 화면 자리를 뽑고 각 시안의 HUD 상자 안에 든 비율
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
const out = process.argv[2] || '/tmp/claude-0/v2/pilotreview/uix'; mkdirSync(out, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const STYLES = ['fieldkit', 'glass', 'silver'], DEVS = ['fold_open', 'phone2'], report = {};
// 4 먼저: 놀이에서 영웅·적이 화면 어디에 있나 (CSS px)
const tracks = {};
for (const dev of DEVS) {
  const ctx = await browser.newContext(contextOptions(dev)); const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/index.html?scene=v2b`);
  await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 });
  tracks[dev] = await page.evaluate(() => {
    const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim; g._pageHidden = true; const pts = { hero: [], enemy: [] };
    const rc = g.canvas.getBoundingClientRect(), s = rc.width / g.viewW; const P = (x, y, z) => { const p = v.project(x, y, z); return [rc.left + p.x * s, rc.top + p.y * s]; };
    for (const sec of ['street', 'alley', 'yard']) {
      sim.reset(); sc.cam.snap = true; v.teleport(sec); if (sec === 'yard') sim.hero.z = 1700;
      for (let i = 0; i < 600; i++) {
        const o = { right: i % 240 < 150, left: i % 240 > 200, up: i % 300 < 90, down: i % 300 > 240 }; if (i % 22 === 0) o.attack = true; if (i % 170 === 5) o.jump = true;
        g.input.setAutoSource(() => o); g.tick(1 / 60); sim.hero.hp = 100;
        if (i % 12 === 0) { g.render(); const h = sim.hero; pts.hero.push(P(h.x, h.y + 50, h.z)); for (const e of sim.enemies) if (!e.dead && e.active) pts.enemy.push(P(e.x, e.y + 40, e.z)); }
      }
    }
    g.input.setAutoSource(null); return pts;
  });
  await ctx.close();
}
for (const dev of DEVS) for (const st of STYLES) {
  const ctx = await browser.newContext(contextOptions(dev)); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const R = (report[`${st}_${dev}`] = { errs });
  await page.goto(`http://localhost:${port}/tools/v2/ui_mock/${st}/index.html?view=play&bg=yard&shot=1`);
  await page.waitForFunction(() => window.__ui && document.fonts.status === 'loaded'); await page.waitForTimeout(400);
  Object.assign(R, await page.evaluate((T) => {
    const app = document.getElementById('app'); const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const name = (e) => (e.id || e.className.toString().split(' ')[0]) + (e.dataset?.k ? ':' + e.dataset.k : '');
    // 1 포인터 커서가 붙은 가장 바깥 요소
    const ptr = [...app.querySelectorAll('*')].filter((e) => vis(e) && getComputedStyle(e).cursor === 'pointer' && getComputedStyle(e.parentElement).cursor !== 'pointer');
    const touch = ptr.map((e) => { const r = e.getBoundingClientRect(); return { id: name(e), w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: r.left, y: r.top }; });
    // 2 잘린 글자
    const clipped = [];
    for (const e of app.querySelectorAll('*')) { if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || !vis(e)) continue; const s = getComputedStyle(e);
      if ((e.scrollWidth > e.clientWidth + 1 && s.overflowX !== 'visible') || (e.scrollHeight > e.clientHeight + 2 && s.overflowY !== 'visible')) clipped.push(name(e) + ':' + e.textContent.trim().slice(0, 14));
      const r = e.getBoundingClientRect(); if (r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5 || r.left < -0.5 || r.top < -0.5) clipped.push('OUT ' + name(e) + ':' + e.textContent.trim().slice(0, 14)); }
    // 4 가림
    const blocks = [...app.querySelectorAll('#hero,#sys,#mini,#quest,#boss,#toast,#stick,.abtn')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: name(e), x: r.left, y: r.top, w: r.width, h: r.height, round: /abtn/.test(e.className) || e.id === 'stick' }; });
    const inside = (p) => blocks.find((b) => b.round ? Math.hypot(p[0] - b.x - b.w / 2, p[1] - b.y - b.h / 2) < b.w / 2 : p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h);
    const cover = {}; for (const k of ['hero', 'enemy']) { const on = T[k].filter((p) => p[0] >= 0 && p[1] >= 0 && p[0] <= innerWidth && p[1] <= innerHeight); const hit = {}; let n = 0; for (const p of on) { const b = inside(p); if (b) { n++; hit[b.id] = (hit[b.id] || 0) + 1; } } cover[k] = { samples: on.length, under: n, pct: on.length ? +(n / on.length * 100).toFixed(1) : 0, by: hit }; }
    const btn = [...app.querySelectorAll('.abtn')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: name(e), x: r.left, y: r.top, w: r.width, h: r.height }; });
    const texts = [...app.querySelectorAll('#hero *, #quest *, #boss *, #mini *, #sys *')].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)).map((e) => { const r = e.getBoundingClientRect(); return { id: name(e) + ':' + e.textContent.trim().slice(0, 8), x: r.left, y: r.top, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(e).fontSize) }; });
    return { minTouch: Math.min(...touch.map((t) => Math.min(t.w, t.h))), small: touch.filter((t) => Math.min(t.w, t.h) < 44).map((t) => `${t.id} ${t.w}x${t.h}`), nTouch: touch.length, clipped, cover, btn, texts, dpr: devicePixelRatio };
  }, tracks[dev]));
  // 3 대비: 세 바탕
  R.contrast = {};
  for (const [bgName, css] of [['night', ''], ['bright', '#bg{filter:brightness(2.6) contrast(.9) saturate(.8)!important}'], ['flash', '#bg{filter:brightness(0) invert(1) sepia(.25)!important}']]) {
    await page.evaluate((css) => { let s = document.getElementById('__pr'); if (!s) { s = document.createElement('style'); s.id = '__pr'; document.head.appendChild(s); } s.textContent = css; }, css);
    await page.waitForTimeout(150);
    const file = `${out}/${st}_${dev}_${bgName}.png`; await page.screenshot({ path: file });
    R.contrast[bgName] = file;
  }
  await ctx.close();
}
writeFileSync(`${out}/ui_review.json`, JSON.stringify({ report, tracks: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, { hero: v.hero.length, enemy: v.enemy.length }])) }, null, 1));
await browser.close(); srv.close();
for (const [k, R] of Object.entries(report)) console.log(k, 'minTouch', R.minTouch, 'n', R.nTouch, 'small', JSON.stringify(R.small), 'clipped', JSON.stringify(R.clipped), 'cover hero', R.cover.hero.pct + '%', JSON.stringify(R.cover.hero.by), 'enemy', R.cover.enemy.pct + '%', JSON.stringify(R.cover.enemy.by), 'errs', R.errs.length);
