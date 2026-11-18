// 불 보기 (SPEED-FIRE): 본 게임 장면(v2g)을 띄워 불 자리 옆에 영웅을 세우고, 효과가 차오른 뒤 그 자리를 잘라 찍는다 + 효과 숫자(입자 · 그리기 · 빛).
//   node tools/v2/speedfire_fire.mjs [--out /tmp/claude-0/v2/speedfire/fire_now] [--tier mid] [--only esh_roof,brazier] [--stats 1 (지역마다 low/mid/high 숫자만)]
// 브라우저 하나 · 페이지 하나. 헤드리스 WebGL 은 소프트웨어 렌더링이라 느리다.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/speedfire/fire'), TIER = String(args.tier || 'mid'), ONLY = args.only ? String(args.only).split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
// --before <commit>: serve the fire code of that commit (anchors · static flames · area anchors) through page routes — the rest is today's tree
const BEFORE = args.before ? String(args.before) : null, BEFORE_FILES = ['src/v2/game/anchors.js', 'src/v2/env/props2.js', 'src/v2/env/build.js', 'src/v2/world/index.js'];
const OLD = BEFORE ? Object.fromEntries(BEFORE_FILES.map((f) => [f, execFileSync('git', ['show', BEFORE + ':' + f], { encoding: 'utf8', maxBuffer: 1 << 26 })])) : {};
// 자리: 영웅을 (hx, hz) 에 세우고 (dx, dz) 쪽을 보게 → 불(fx, fy, fz) 둘레를 자른다
const SPOTS = [
  { n: 'esh_roof', area: 'eshville_now', hx: 300, hz: 150, f: [200, 250, 300], crop: [620, 420], label: '에쉬빌 — 지붕 · 담 위의 불' },
  { n: 'esh_wreck', area: 'eshville_now', hx: 470, hz: 140, f: [450, 50, 244], crop: [560, 400], label: '에쉬빌 — 불탄 잔해' },
  { n: 'brazier', area: 'eshville_now', hx: 2640, hz: 180, f: [2700, 100, 262], crop: [460, 380], label: '에쉬빌 — 화로' },
  { n: 'ossuary_past', area: 'ossuary_past', hx: 600, hz: 2880, f: [450, 110, 2980], crop: [560, 400], label: '1697 납골당 — 문 앞 불그릇' },
  { n: 'ossuary_now', area: 'ossuary_now', hx: 600, hz: 2880, f: [450, 110, 2980], crop: [560, 400], label: '오늘 밤 납골당 — 문 앞 불그릇' },
  { n: 'tower_brazier', area: 'belltower_now', hx: 180, hz: 1140, f: [70, 790, 1204], crop: [520, 400], label: '종탑 — 화로' },
  { n: 'past_brazier', area: 'eshville_past', hx: 2640, hz: 180, f: [2700, 100, 262], crop: [460, 380], label: '1697 에쉬빌 — 화로' },
  { n: 'slice0_brazier', area: 'slice0', hx: 1730, hz: 1540, f: [1790, 100, 1624], crop: [460, 380], label: '시범 구간 — 화로' },
  { n: 'past_lamp', area: 'eshville_past', hx: 1700, hz: 200, f: [1760, 150, 266], crop: [460, 380], label: '1697 에쉬빌 — 등불' },
].filter((s) => !ONLY || ONLY.includes(s.n));
const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errs = []; const rows = [];
function install() {
  const sc = window.__v2.scene, g = window.__game; g._pageHidden = true;
  window.__S = {
    put(x, z, dx, dz) { const h = sc.sim.hero, B = sc.W.boxes; let gy = -Infinity; for (const b of B) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 > gy) gy = b.y1; }
      h.x = x; h.z = z; if (Number.isFinite(gy)) h.y = gy; h.vx = h.vz = h.vy = 0; h.onGround = true; const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ;
      if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; sc.cam.snap = true;
      for (const e of sc.sim.enemies) { e.active = false; e.x += 5000; } },   // 적은 치운다 (불만 본다)
    tick(n) { for (let i = 0; i < n; i++) { const h = sc.sim.hero; h.hp = h.hpMax ?? 100; g.tick(1 / 60); if (i % 6 === 0) g.render(); } },
    shot(fx, fy, fz) { g.alpha = 1; g.render(); const p = sc.project(fx, fy, fz, {}), W = g.viewW, H = g.viewH, cv = document.querySelector('canvas'), r = cv.getBoundingClientRect();
      const st = sc.stats(); return { css: [r.left + (p.x / W) * r.width, r.top + (p.y / H) * r.height], fx: st.fx, draws: st.gl?.draws, worldDraws: st.world?.draws, anchors: st.anchors, tier: st.fx?.tier, hero: [Math.round(sc.sim.hero.x), Math.round(sc.sim.hero.y), Math.round(sc.sim.hero.z)] }; },
  };
  return { area: window.__v2.area, tier: sc.perf.tier };
}
let page = null, cur = '';
const open = async (area, tier) => {
  const key = area + ':' + tier; if (cur === key) return; cur = key;
  if (page) await page.context().close();
  const ctx = await browser.newContext(contextOptions('fold_open')); page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  if (BEFORE) for (const f of BEFORE_FILES) await page.route('**/' + f, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: OLD[f] }));   // --before <commit>: the fire files as they were then
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&area=${area}&v2auto=0&v2tier=${tier}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 120000 }).catch(() => {});
  const ok = await page.evaluate(() => !!window.__v2?.ready); if (!ok) throw new Error('scene not ready: ' + area);
  await page.evaluate(install); await page.evaluate((n) => { window.__TICKS = n; }, Number(args.ticks ?? 330));   // 지역 이름 띠가 사라질 때까지
};
try {
  if (args.stats) {   // 지역마다 effect tier 별 숫자: 불 자리 둘레 세 곳 평균이 아니라 대표 자리 하나
    const T = ['low', 'mid', 'high'];
    for (const s of SPOTS) for (const t of T) {
      await open(s.area, t);
      const i = await page.evaluate(([s]) => { window.__S.put(s.hx, s.hz, s.f[0] - s.hx, s.f[2] - s.hz); window.__S.tick(150); return window.__S.shot(s.f[0], s.f[1], s.f[2]); }, [s]);
      rows.push({ spot: s.n, tier: t, particles: i.fx?.particles, lights: i.fx?.lights, draws: i.draws, worldDraws: i.worldDraws, anchorsLive: i.anchors?.live, anchorsLit: i.anchors?.lit });
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
    fs.writeFileSync(`${OUT}/stats.json`, JSON.stringify(rows, null, 1));
  } else for (const s of SPOTS) {
    await open(s.area, TIER);
    let fy = s.f[1];
    const i = await page.evaluate(([s]) => { window.__S.put(s.hx, s.hz, s.f[0] - s.hx, s.f[2] - s.hz); window.__S.tick(Number(window.__TICKS ?? 150)); return window.__S.shot(s.f[0], s.f[1], s.f[2]); }, [s]);
    const vp = page.viewportSize(), w = Math.min(s.crop[0], vp.width), h = Math.min(s.crop[1], vp.height);
    const clip = { x: Math.max(0, Math.min(vp.width - w, i.css[0] - w / 2)), y: Math.max(0, Math.min(vp.height - h, i.css[1] - h * 0.55)), width: w, height: h };
    const f = `${OUT}/${s.n}.png`; await page.screenshot({ path: f, clip }); await page.screenshot({ path: `${OUT}/${s.n}_full.jpg`, type: 'jpeg', quality: 70 });
    rows.push({ spot: s.n, file: f, hero: i.hero, particles: i.fx?.particles, lights: i.fx?.lights, draws: i.draws, anchors: i.anchors }); console.log(JSON.stringify(rows[rows.length - 1])); void fy;
  }
} catch (e) { errs.push('exception: ' + (e?.stack ?? e)); }
console.log(errs.length ? errs.slice(0, 8).join('\n') : 'NO ERRORS');
await browser.close(); srv.close?.();
process.exit(errs.some((e) => /pageerror|exception/.test(e)) ? 1 : 0);
