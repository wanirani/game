// 통합 스모크: 여러 화면/스테이지를 차례로 열어 페이지 오류를 수집하고 스크린샷을 남긴다.
// 사용: node tools/integration.mjs [--only s03,hub,s14_boss] [--out dir] [--mobile] [--dist [dir]] [--list]
//   --dist [dir] : 원본 대신 빌드 결과(dist/web, CSP 적용)를 tools/deploy/serve_dist.mjs 로 띄워 검사 (build_web.mjs 먼저)
//   --list       : 케이스 id 만 출력
// 종료 코드: 0 = 모든 케이스 오류 없음, 1 = 오류가 난 케이스가 있음, 2 = --only 에 없는 케이스 id (조용히 통과하지 않게)
import { chromium } from 'playwright-core';
import { start } from './serve.mjs';
import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const out = args.out || '/tmp/claude-0/integ';
const mobile = !!args.mobile;
const KEY = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'KeyZ', attack: 'KeyX', dash: 'KeyC', sub: 'KeyA', skill1: 'KeyS', skill2: 'KeyD', ult: 'KeyF', menu: 'Escape', enter: 'Enter', swap: 'KeyQ' };
// 1부 s01–s13 + 2부 s14–s20 (P2-QA). 보스방 케이스 <id>_boss 는 끝에 world.boss 가 있어야 통과한다.
const STAGES = ['s01','s02','s03','s04','s05','s06','s07','s08','s09','s10','s11','s12','s13','s14','s15','s16','s17','s18','s19','s20'];
const CASES = [
  { id: 'title', url: 'index.html', steps: 'wait:1.5,shot,enter:0.1,wait:1,shot,down:0.1,down:0.1,wait:0.3,shot' },
  { id: 'hub', url: 'index.html?scene=hub', steps: 'wait:2,shot,right:2,shot,menu:0.1,wait:0.5,shot' },
  { id: 'worldmap', url: 'index.html?scene=worldmap', steps: 'wait:1.5,shot,right:0.1,wait:0.3,shot' },
  { id: 'inn', url: 'index.html?scene=inn', steps: 'wait:1.5,shot,down:0.1,enter:0.1,wait:1,shot' },
  { id: 'arcade', url: 'index.html?scene=arcade', steps: 'wait:1.5,shot' },
  ...STAGES.map((s) => ({ id: s, url: `index.html?scene=stage&stage=${s}`, steps: 'wait:3,shot,right:1.2,attack:0.15,wait:0.2,attack:0.15,jump:0.3,right:1,shot,menu:0.1,wait:0.6,shot,menu:0.1,wait:0.4,sub:0.1,skill1:0.1,wait:0.5' })),
  // rightboss:N = 보스가 나올 때까지(최대 N초) 오른쪽으로 걷기, intro:N = 보스 소개·대사를 넘겨 전투가 시작될 때까지(최대 N초).
  // 부하가 큰 기계에서도 고정 시간 대기에 기대지 않는다 (2부 보스방은 입구에서 경기장까지 15칸).
  ...STAGES.map((s) => ({ id: s + '_boss', url: `index.html?scene=stage&stage=${s}&room=boss`, boss: true, steps: 'wait:2.5,rightboss:8,intro:25,wait:1,shot,attack:0.2,attack:0.2,attack:0.2,wait:1,shot' })),
  { id: 'menu', url: 'index.html?scene=stage&stage=s02', steps: 'wait:2.5,menu:0.1,wait:0.5,down:0.1,enter:0.1,wait:1,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot,KeyE:0.1,wait:0.4,shot' },
];
if (args.list) { console.log(CASES.map((c) => c.id).join(' ')); process.exit(0); }
const only = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;
const unknown = (only || []).filter((id) => !CASES.some((c) => c.id === id));
if (unknown.length) { console.error(`✗ --only 에 없는 케이스: ${unknown.join(', ')}  (전체: node tools/integration.mjs --list)`); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const port = 8000 + Math.floor(Math.random() * 900);
let srv;
if (args.dist) {
  const { start: startDist } = await import('./deploy/serve_dist.mjs');
  const dir = args.dist === true ? undefined : path.resolve(String(args.dist));
  // 빌드가 없으면 스택 대신 한 줄로 알리고 2 (케이스 실패 1 과 구분 — 준비 오류)
  try { srv = await startDist(port, { quiet: true, ...(dir ? { dir } : {}) }); } catch (e) { console.error(`✗ --dist: ${e.message}`); process.exit(2); }
} else srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const report = [];
for (const c of CASES) {
  if (only && !only.includes(c.id)) continue;
  const ctx = await browser.newContext(mobile ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/Failed to load resource|ERR_CERT|fonts\.g/.test(t)) errs.push('CONSOLE ' + t.slice(0, 300)); } });
  try {
    await page.goto(`http://localhost:${port}/${c.url}`, { timeout: 30000 });
    let n = 0;
    for (const s of c.steps.split(',')) {
      const [k, d] = s.split(':');
      if (k === 'shot') { await page.screenshot({ path: `${out}/${c.id}_${n++}.png` }); continue; }
      if (k === 'wait') { await page.waitForTimeout(Number(d) * 1000); continue; }
      if (k === 'rightboss') {
        const t0 = Date.now();
        await page.keyboard.down(KEY.right);
        // 막히면(가로 이동 없음) 점프해서 계단·턱을 넘는다 (s01 보스방 입구의 2칸 턱 등)
        let lastX = null, jumpT = 0;
        while (Date.now() - t0 < Number(d) * 1000) {
          const st = await page.evaluate(() => { const g = window.__game, w = g?.world; return { boss: !!w?.boss, x: w?.player?.x ?? 0, top: g?.scenes?.[g.scenes.length - 1]?.name }; });
          if (st.boss) break;
          // 길목의 '!' 대사(예: s13 보스방 입구)는 넘긴다
          if (st.top === 'dialogue') { await page.keyboard.press(KEY.enter); await page.waitForTimeout(200); continue; }
          if (st.top === 'pause') { await page.keyboard.press(KEY.menu); await page.waitForTimeout(200); continue; }
          if (lastX != null && Math.abs(st.x - lastX) < 2 && Date.now() - jumpT > 700) {
            jumpT = Date.now();
            // 두 번 점프 (s01 보스방 입구의 벽은 4칸 — 한 번 점프로는 못 넘는다)
            await page.keyboard.down(KEY.jump); await page.waitForTimeout(260); await page.keyboard.up(KEY.jump);
            await page.waitForTimeout(90);
            await page.keyboard.down(KEY.jump); await page.waitForTimeout(260); await page.keyboard.up(KEY.jump);
          }
          lastX = st.x;
          await page.waitForTimeout(120);
        }
        await page.keyboard.up(KEY.right); await page.waitForTimeout(40);
        continue;
      }
      if (k === 'intro') {
        const t0 = Date.now();
        let st = null;
        while (Date.now() - t0 < Number(d) * 1000) {
          st = await page.evaluate(() => { const g = window.__game; const top = g?.scenes?.[g.scenes.length - 1]; return { top: top?.name, cut: !!g?.world?.cutscene, active: !!g?.world?.bossActive }; });
          if (st.top === 'stage' && st.active && !st.cut) { st.ok = true; break; }
          const key = st.top === 'dialogue' ? KEY.enter : st.top === 'bossIntro' ? KEY.jump : st.top === 'pause' ? KEY.menu : null;
          if (key) { await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); }
          await page.waitForTimeout(260);
        }
        if (!st?.ok) errs.push(`NOFIGHT ${d}초 안에 보스전이 시작되지 않음 (top=${st?.top}, cutscene=${st?.cut}, bossActive=${st?.active})`);
        continue;
      }
      const key = KEY[k] || k;
      await page.keyboard.down(key); await page.waitForTimeout(Number(d || 0.1) * 1000); await page.keyboard.up(key); await page.waitForTimeout(40);
    }
    const info = await page.evaluate(() => { const g = window.__game; return g ? { scenes: g.scenes.map((s) => s.name).join('>'), room: g.world?.roomId, hp: Math.round(g.world?.player?.hp ?? -1), boss: g.world?.boss?.def?.id, fps: Math.round(g.fps) } : null; });
    const fails = [...new Set(errs)];
    // 보스방 케이스는 보스가 실제로 나와야 한다 (없으면 방 id/보스 등록이 깨진 것 — 오류 없이 통과하지 않게)
    if (c.boss && !info?.boss) fails.push(`NOBOSS world.boss 가 없음 (room=${info?.room}, scenes=${info?.scenes})`);
    report.push({ id: c.id, info, errs: fails });
  } catch (e) { report.push({ id: c.id, info: null, errs: ['HARNESS ' + e.message] }); }
  await ctx.close();
  const r = report[report.length - 1];
  console.log(`${r.errs.length ? '✗' : '✓'} ${c.id} ${JSON.stringify(r.info)}${r.errs.length ? '\n    ' + r.errs.slice(0, 6).join('\n    ') : ''}`);
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
await browser.close(); await srv.close();
const bad = report.filter((r) => r.errs.length);
console.log(`${report.length - bad.length}/${report.length} 통과${bad.length ? ' — 실패: ' + bad.map((r) => r.id).join(', ') : ''}`);
if (bad.length) process.exitCode = 1;
