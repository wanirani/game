// pilotreview: 입체 영웅(char3d)을 시범판 B 에서 따져 묻는 검사.  node tools/v2/pilotreview_c3d.mjs [outDir] [devs=fold_open,phone2]
//  1 방향: 16방향으로 몰아 보는 방향이 속도 방향과 맞는가 (+ 8방향 캡처)
//  2 클립: 서기→달리기→점프→착지→대시→3연타→공중 베기→피격→쓰러짐 을 틱마다 읽어, 클립 이름과 뼈가 한 틱에 얼마나 튀는가
//  3 규칙: 같은 입력 · 같은 난수로 2D 와 입체를 돌려 놀이 상태가 같은가 (맞음/빗나감 포함)
//  4 나갔다 들어오기 6번: 살아 있는 GL 자원 · 컨텍스트 · 캔버스 수
//  5 프레임 시간: 2D ↔ 입체를 번갈아 3번씩
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
const [out = '/tmp/claude-0/v2/pilotreview/c3d', devs = 'fold_open,phone2'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const port = 8100 + Math.floor(Math.random() * 800), srv = await start(port);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const report = {};
const INIT = () => {
  const C = (window.__glc = { ctx: 0, live: {}, made: {} });
  for (const P of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!P) continue;
    for (const k of ['Buffer', 'Texture', 'Program', 'Shader', 'Framebuffer', 'Renderbuffer', 'VertexArray']) {
      const c = P.prototype['create' + k], d = P.prototype['delete' + k]; if (!c) continue;
      P.prototype['create' + k] = function (...a) { const o = c.apply(this, a); if (o) { C.live[k] = (C.live[k] || 0) + 1; C.made[k] = (C.made[k] || 0) + 1; } return o; };
      P.prototype['delete' + k] = function (o) { if (o && !o.__del) { o.__del = true; C.live[k] = (C.live[k] || 0) - 1; } return d.call(this, o); };
    }
  }
  const g = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, ...a) { const r = g.call(this, t, ...a); if (r && /webgl/.test(t) && !this.__counted) { this.__counted = true; C.ctx++; } return r; };
};
async function open(dev, mode, extra = '') {
  const ctx = await browser.newContext(contextOptions(dev)); await ctx.addInitScript(INIT);
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=v2b&hero=${mode}${extra}`);
  await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  return { ctx, page, errs };
}
// 놀이 상태만 뽑는다 (그리기와 무관한 값)
const SNAP = `const snap = () => { const h = sim.hero; return JSON.stringify({ h: [h.x, h.y, h.z, h.hp, h.facing, h.dead, h.anim].map((v) => typeof v === 'number' ? +v.toFixed(3) : v), e: sim.enemies.map((e) => [e.id, +e.x.toFixed(2), +e.z.toFixed(2), e.hp, !!e.dead]), kills: sim.kills, deaths: sim.deaths, done: sim.done }); };`;
const SEED = `let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };`;
const RULES = `(() => { const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim; g._pageHidden = true; ${SEED} ${SNAP}
  const res = {}; const key = (o) => g.input.setAutoSource(o ? () => o : null); const tick = (n) => { for (let i = 0; i < n; i++) g.tick(1 / 60); };
  // (가) 맞음: 적 왼쪽 62 에 서서 오른쪽을 보고 한 번  (나) 빗나감: 깊이 80 어긋남  (다) 빗나감: 등지고  (라) 마당에서 30초 싸우기
  const setup = (dx, dz, facing) => { sim.reset(); sc.cam.snap = true; v.teleport('yard'); sim.hero.z = 1700; tick(150); sim.hero.hp = 100;
    const e0 = sim.enemies.filter((e) => e.yard && !e.dead).sort((a, b) => Math.hypot(a.x - sim.hero.x, a.z - sim.hero.z) - Math.hypot(b.x - sim.hero.x, b.z - sim.hero.z))[0];
    for (const e of sim.enemies) { e.active = false; e.state = 'idle'; e.cd = 9; } sim.shots.length = 0;
    sim.hero.x = e0.x + dx; sim.hero.z = e0.z + dz; sim.hero.facing = facing; sim.hero.ifr = 2; tick(1); const hp0 = e0.hp;
    key({ attack: true }); tick(1); key(null); tick(24); return { dmg: hp0 - e0.hp, id: e0.id }; };
  res.hit = setup(-62, 0, 1); res.missDepth = setup(-62, 80, 1); res.missBack = setup(-62, 0, -1);
  sim.reset(); sc.cam.snap = true; v.teleport('yard'); tick(30);
  for (let i = 0; i < 1800; i++) { const o = { right: i % 240 < 150, up: i % 300 < 60, down: i % 300 > 240 }; if (i % 22 === 0) o.attack = true; if (i % 170 === 5) o.jump = true; if (i % 210 === 9) o.dash = true; key(o); tick(1); }
  key(null); res.fight = snap(); return res; })()`;
const CLIPS = `(() => { const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, ch = sc.h3; g._pageHidden = true; ${SEED}
  sim.reset(); sc.cam.snap = true; v.teleport('street'); for (const e of sim.enemies) { e.active = false; e.state = 'idle'; e.cd = 99; }
  const key = (o) => g.input.setAutoSource(o ? () => o : null); const rows = []; let prev = null, label = '';
  const BONES = ['head', 'handR', 'handL', 'footR', 'footL', 'hips'];
  const tick = (n, lab) => { label = lab; for (let i = 0; i < n; i++) { g.tick(1 / 60); const h = sim.hero, p = {}; for (const b of BONES) { const m = ch.rig.boneWorld(b); if (m) p[b] = [m[12], m[13], m[14]]; }
    const row = { lab, clip: ch.anim.cur?.name, prevClip: ch.anim.prev?.name ?? null, anim: h.anim, d: {} };
    if (prev) for (const b in p) if (prev[b]) row.d[b] = Math.hypot(p[b][0] - prev[b][0], p[b][1] - prev[b][1], p[b][2] - prev[b][2]);
    // 검이 손에 붙어 있나: 손 뼈 세계 위치 ↔ 검 손잡이 원점
    const M = ch.place(h.x, sc.visY ?? h.y, h.z), W = ch.weaponMatrix(M), hb = ch.rig.boneWorld('handR');
    if (W && hb) { const hx = M[0] * hb[12] + M[4] * hb[13] + M[8] * hb[14] + M[12], hy = M[1] * hb[12] + M[5] * hb[13] + M[9] * hb[14] + M[13], hz = M[2] * hb[12] + M[6] * hb[13] + M[10] * hb[14] + M[14]; row.grip = Math.hypot(W[12] - hx, W[13] - hy, W[14] - hz); }
    row.nan = [...ch.rig.jm].some((x) => !Number.isFinite(x));
    rows.push(row); prev = p; } };
  tick(40, 'idle'); key({ right: true }); tick(45, 'run'); key({ right: true, jump: true }); tick(10, 'jump'); key({ right: true }); tick(50, 'air→land'); key(null); tick(20, 'stop');
  key({ right: true }); tick(12, 'run2'); key({ right: true, dash: true }); tick(1, 'dash'); key({ right: true }); tick(24, 'dash'); key(null); tick(20, 'stop2');
  for (let k = 0; k < 3; k++) { key({ attack: true }); tick(1, 'atk' + (k + 1)); key(null); tick(k < 2 ? 11 : 30, 'atk' + (k + 1)); }
  tick(20, 'rest'); key({ jump: true }); tick(8, 'jump2'); key({ attack: true }); tick(1, 'airatk'); key(null); tick(50, 'airatk');
  tick(10, 'rest2'); sim.hero.ifr = 0; sim.hurtHero(5, -1, 0); tick(40, 'hurt'); sim.hero.ifr = 0; sim.hurtHero(9999, -1, 0); tick(140, 'death→respawn');
  const clips = [...new Set(rows.map((r) => r.clip))]; const out = { clips, have: Object.keys(ch.asset.clips), maxGrip: Math.max(...rows.map((r) => r.grip ?? 0)), nan: rows.some((r) => r.nan), top: {} };
  for (const b of BONES) out.top[b] = rows.map((r, i) => ({ i, lab: r.lab, clip: r.clip, from: rows[i - 1]?.clip, d: +(r.d[b] ?? 0).toFixed(1) })).sort((a, c) => c.d - a.d).slice(0, 4);
  out.seq = rows.map((r) => r.clip).reduce((a, c) => { if (a[a.length - 1] !== c) a.push(c); return a; }, []);
  return out; })()`;
for (const dev of devs.split(',')) {
  const R = (report[dev] = {});
  // ── 입체 ──
  let { ctx, page, errs } = await open(dev, '3d');
  R.on = await page.evaluate(() => window.__v2.stats.hero3d);
  // 1 방향
  R.facing = await page.evaluate(() => {
    const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, ch = sc.h3; g._pageHidden = true;
    const orig = sim.update.bind(sim); let F = null; sim.update = (dt, inp) => { if (F) { inp.mx = F[0]; inp.mz = F[1]; } return orig(dt, inp); };
    const res = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2; sim.reset(); sc.cam.snap = true; v.teleport('yard'); sim.hero.z = 1700; for (let i = 0; i < 5; i++) g.tick(1 / 60);
      for (const e of sim.enemies) { e.active = false; e.state = 'idle'; e.cd = 99; }
      F = [Math.cos(a), Math.sin(a)]; for (let i = 0; i < 40; i++) g.tick(1 / 60);
      const h = sim.hero, sp = Math.hypot(h.vx, h.vz), va = Math.atan2(h.vz, h.vx), fa = Math.atan2(ch.dz, ch.dx); let d = fa - va; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      res.push({ deg: Math.round((a * 180) / Math.PI), speed: Math.round(sp), errDeg: +((d * 180) / Math.PI).toFixed(1), clip: ch.anim.cur?.name }); F = null;
    }
    sim.update = orig; return res;
  });
  for (let k = 0; k < 8; k++) {   // 8방향 캡처 (같은 자리)
    const r = await page.evaluate((k) => {
      const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim; const a = (k / 8) * Math.PI * 2;
      const orig = sim.update.bind(sim); sim.update = (dt, inp) => { inp.mx = Math.cos(a); inp.mz = Math.sin(a); return orig(dt, inp); };
      sim.reset(); sc.cam.snap = true; v.teleport('yard'); sim.hero.z = 1700; sim.hero.x -= Math.cos(a) * 110; sim.hero.z -= Math.sin(a) * 110; for (const e of sim.enemies) { e.active = false; e.state = 'idle'; e.cd = 99; }
      for (let i = 0; i < 33; i++) g.tick(1 / 60); sim.update = orig; g.render(); g.render();
      const h = sim.hero, p = v.project(h.x, (sc.visY ?? h.y) + 52, h.z), rc = g.canvas.getBoundingClientRect(), s = rc.width / g.viewW;
      return { cx: rc.left + p.x * s, cy: rc.top + p.y * s, s, vw: innerWidth, vh: innerHeight };
    }, k);
    await page.waitForTimeout(100);
    const half = 110 * r.s, x = Math.max(0, Math.min(r.vw - half * 2, r.cx - half)), y = Math.max(0, Math.min(r.vh - half * 2, r.cy - half * 1.05));
    await page.screenshot({ path: `${out}/dir_${dev}_${k * 45}.png`, clip: { x, y, width: half * 2, height: half * 2 } });
  }
  R.clips = await page.evaluate(CLIPS);
  R.rules3d = await page.evaluate(RULES);
  // 4 나갔다 들어오기
  R.leak = [];
  for (let i = 0; i < 6; i++) {
    R.leak.push(await page.evaluate(async () => {
      const g = window.__game; g._pageHidden = false;
      g.go('title', {}, { fade: false }); await new Promise((r) => setTimeout(r, 500));
      const mid = { live: { ...window.__glc.live }, ctx: window.__glc.ctx, canvases: document.querySelectorAll('canvas').length, v2: typeof window.__v2 };
      g.go('v2b', {}, { fade: false });
      const t0 = performance.now(); while (!(window.__v2?.id === 'b' && window.__v2.ready) && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 300));
      return { mid, in: { live: { ...window.__glc.live }, ctx: window.__glc.ctx, canvases: document.querySelectorAll('canvas').length, hero3d: window.__v2?.stats?.hero3d?.on, heap: performance.memory?.usedJSHeapSize } };
    }));
  }
  R.errors3d = errs.slice(0, 20);
  await ctx.close();
  // ── 2D ──
  ({ ctx, page, errs } = await open(dev, '2d'));
  R.rules2d = await page.evaluate(RULES);
  R.heroUV2d = await page.evaluate(() => { const g = window.__game, sc = window.__v2.scene; g.render(); return { uv: !!sc.heroUV, hero3d: window.__v2.stats.hero3d }; });
  R.errors2d = errs.slice(0, 20);
  await ctx.close();
  R.rulesSame = JSON.stringify(R.rules3d) === JSON.stringify(R.rules2d);
  // 5 프레임 시간 (번갈아 3번씩)
  R.perf = { '2d': [], '3d': [] };
  for (let rep = 0; rep < 3; rep++) for (const mode of ['2d', '3d']) {
    ({ ctx, page, errs } = await open(dev, mode));
    R.perf[mode].push(await page.evaluate(() => {
      const g = window.__game, v = window.__v2, sim = v.scene.sim; g._pageHidden = true; sim.reset(); v.teleport('street'); v.perfFinish(true);
      g.input.setAutoSource(() => ({ right: true })); for (let i = 0; i < 120; i++) { g.tick(1 / 60); g.render(); if (sim.hero.x > 700) v.teleport('street'); } g.input.setAutoSource(null);
      const s = v.stats; v.perfFinish(false); return { p50: +s.frameMs.p50.toFixed(1), p95: +s.frameMs.p95.toFixed(1), draws: s.gl.draws, tris: s.gl.tris, texMB: +(((s.hero3d.texBytes ?? 0) + s.gl.texBytes) / 1048576).toFixed(1), c3dDrawMs: s.hero3d.drawMs, c3dAnimMs: s.hero3d.animMs, mode: s.mode };
    }));
    await ctx.close();
  }
  writeFileSync(`${out}/review.json`, JSON.stringify(report, null, 1));
  console.log(dev, 'done');
}
await browser.close(); srv.close();
const brief = {}; for (const [dev, R] of Object.entries(report)) brief[dev] = { on: R.on?.on, facingMaxErr: Math.max(...R.facing.map((f) => Math.abs(f.errDeg))), facingMinSpeed: Math.min(...R.facing.map((f) => f.speed)), clipsSeen: R.clips.clips, seq: R.clips.seq.join('>'), maxGrip: R.clips.maxGrip, nan: R.clips.nan, top: R.clips.top, rulesSame: R.rulesSame, hit: R.rules3d.hit, missDepth: R.rules3d.missDepth, missBack: R.rules3d.missBack, fight3d: R.rules3d.fight.slice(0, 80), leak: R.leak.map((l) => `${JSON.stringify(l.mid.live)}|ctx${l.mid.ctx}|cv${l.mid.canvases} → ${JSON.stringify(l.in.live)}|ctx${l.in.ctx}|cv${l.in.canvases}|${Math.round((l.in.heap ?? 0) / 1048576)}MB`), errors3d: R.errors3d, errors2d: R.errors2d, heroUV2d: R.heroUV2d, perf: R.perf };
console.log(JSON.stringify(brief, null, 1));
