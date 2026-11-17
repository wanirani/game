// 환경 키트 검사 (docs/v2/ENV_KIT.md §6): 장면 v2c 를 fold_open · phone2 에서 열어
//   ① 저작 데이터 검증(B 의 validateStage — 충돌이 B 와 같은 규칙) ② 봇이 처음부터 마당까지 걸어 적을 모두 쓰러뜨림(무적 없음; B 검사와 같은 봇)
//   ③ 페이지 오류 0 ④ 구간별 숫자(삼각형·그리기 호출·텍스처·정점 버퍼)와 예산(보이는 삼각형 ≤ 60,000 · 그리기 호출 ≤ 40) ⑤ 프레임마다 캔버스 올리기가 늘지 않았는지
//   ⑥ 텍스처 파일 크기(장당 ≤ 150 KB) ⑦ 나가기(자원 정리).
//   node tools/v2/envkit_check.mjs [--devices fold_open,phone2] [--json out.json] [--base 1 = v2b 도 같이 재서 견준다] [--dist dist/<빌드 폴더> = 배포 빌드에서도 열어 본다]
// 주의: 헤드리스 Chromium 의 WebGL 은 소프트웨어 렌더러(SwiftShader)다 — 프레임 시간은 실제 기기 값이 아니다.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import STAGE from '../../src/v2/env/stage_slice0_env.js';
import { validateEnv, compileEnv } from '../../src/v2/env/build.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(',');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const BUDGET = { tris: 60000, draws: 40, texKB: 150 };
const fails = [], report = { stage: null, files: {}, devices: {} };
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

{ // ① 데이터
  const r = validateEnv(STAGE), W = compileEnv(STAGE); report.stage = { validate: r.stats, env: W.env.stats, boxes: W.boxes.length, lights: W.lights.length };
  console.log('[stage] ' + STAGE.id + ': part ' + STAGE.parts.length + '줄 → 상자 ' + W.boxes.length + ' · 빛 ' + W.lights.length + ' · 정적 삼각형 ' + W.env.stats.tris + ' · 정점 버퍼 ' + (W.env.stats.bytes / 1024 | 0) + ' KB');
  for (const [k, c] of Object.entries(W.env.stats.chunks)) console.log(`        덩어리 ${k}: 삼각형 ${c.tris} · 그리기 ${c.draws} · ${(c.bytes / 1024) | 0} KB`);
  if (r.errors.length) for (const e of r.errors) fail('stage: ' + e); else ok('스테이지 검증 오류 0 (경고 ' + r.warnings.length + ', 닿는 칸 ' + r.stats.reachCells + ')');
  for (const f of fs.readdirSync('assets/v2/env').filter((n) => n.endsWith('.webp'))) { const kb = fs.statSync('assets/v2/env/' + f).size / 1024; report.files[f] = Math.round(kb); if (kb > BUDGET.texKB) fail(`텍스처 ${f} ${kb | 0} KB > ${BUDGET.texKB} KB`); }
  ok('텍스처 파일 ' + Object.entries(report.files).map(([k, v]) => `${k} ${v}KB`).join(' · '));
}

const port = 8200 + Math.floor(Math.random() * 700);
const srv = await start(port);

/** 페이지 안에서 도는 봇 — tools/v2/proto_b_check.mjs 의 봇과 같은 것 (길을 따라 걷고, 가까운 적에게 깊이를 맞춰 벤다) */
function installBot() {
  const g = window.__game, v = window.__v2, input = g.input;
  const ROUTE = [[330, 120], [560, 182], [790, 190], [1230, 190], [1300, 182], [1480, 182], [1520, 130], [1720, 190], [1990, 190], [2190, 190], [2190, 420], [2190, 960], [2190, 1500], [2190, 1720], [2190, 1860]];
  const B = (window.__bot = { wp: 0, t: 0, act: {}, stuck: 0, lx: 0, lz: 0, side: 0, atk: 0, minHp: 100, jumpT: 0, dodge: 0, fs: 0, skipMap: {}, skips: 0, max: { draws: 0, tris: 0, world: 0, worldDraws: 0 } });
  input.setAutoSource(() => B.act);
  B.think = () => {
    const h = v.hero, E = v.enemies, a = (B.act = {});
    B.t++; B.minHp = Math.min(B.minHp, h.hp);
    if (h.dead || v.section === 'done') return;
    let tg = null, bd = 1e9;
    for (const e of E) { if (e.state === 'dead' || (B.skipMap[e.id] ?? 0) > B.t) continue; const d = Math.hypot(e.x - h.x, (e.z - h.z) * 1.5); if (Math.abs(e.y - h.y) > 110) continue; if (!(e.active ? d < 620 : d < 300)) continue; if (d < bd) { bd = d; tg = e; } }
    let tx, tz, fight = false;
    if (tg) {
      const side = h.x <= tg.x ? -1 : 1; tx = tg.x + side * 56; tz = tg.z; fight = true;
      const dx = tg.x - h.x, dz = tg.z - h.z;
      if (Math.abs(dx) < 96 && Math.abs(dx) > 18 && Math.abs(dz) < 20) { if (dx > 0) a.right = h.facing < 0; else a.left = h.facing > 0; B.atk++; if (B.atk % 7 < 3) a.attack = true; if ((dx > 0) === (h.facing > 0)) { tx = h.x; tz = tg.z; } }
    } else {
      let ni = B.wp, nd = 1e9;
      for (let i = B.wp; i < ROUTE.length; i++) { const d = Math.hypot(ROUTE[i][0] - h.x, ROUTE[i][1] - h.z); if (d < nd) { nd = d; ni = i; } }
      B.wp = ni; const w = ROUTE[B.wp];
      if (Math.hypot(w[0] - h.x, w[1] - h.z) < 26 && B.wp < ROUTE.length - 1) B.wp++;
      tx = ROUTE[B.wp][0]; tz = ROUTE[B.wp][1];
    }
    const dx = tx - h.x, dz = tz - h.z;
    if (dx > 7) a.right = true; else if (dx < -7) a.left = true;
    if (dz > 6) a.up = true; else if (dz < -6) a.down = true;
    for (const s of v.shots) { if (Math.hypot(s.x - h.x, s.z - h.z) < 80 && Math.abs(s.z - h.z) < 26 && B.dodge <= 0) { a.dash = true; a.up = h.z < 120 || (s.z <= h.z && h.z < 2000); a.down = !a.up; a.left = a.right = false; B.dodge = 30; } }
    B.dodge--;
    if (B.t % 6 === 0) { const moved = Math.hypot(h.x - B.lx, h.z - B.lz); B.lx = h.x; B.lz = h.z; if ((a.left || a.right || a.up || a.down) && !a.attack && moved < 3) B.stuck++; else B.stuck = Math.max(0, B.stuck - 1); }
    if (B.stuck >= 4) { if (fight && ++B.fs >= 3) { B.skipMap[tg.id] = B.t + 420; B.fs = 0; B.skips++; }   // 벽 모서리에 낀 적은 잠시 잊고 길을 따라간다 (B 의 봇에 더한 한 줄 — ENV_KIT.md §6)
      B.jumpT = 26; B.stuck = 0; B.side = h.z > 150 && h.z < 260 ? -1 : 1; if (fight && Math.random() < 0.5) B.side = -B.side; }
    if (B.jumpT > 0) { B.jumpT--; a.jump = B.jumpT > 12; if (B.side > 0) { a.up = true; a.down = false; } else { a.down = true; a.up = false; } }
  };
  B.run = (n, renderEvery) => {
    g._pageHidden = true;
    for (let i = 0; i < n; i++) {
      B.think(); g.tick(1 / 60);
      if (renderEvery && i % renderEvery === 0) { g.render(); const s = v.stats; const hd = s.hero3d?.draws ?? 0, ht = s.hero3d?.tris ?? 0; B.max.draws = Math.max(B.max.draws, s.gl.draws); B.max.tris = Math.max(B.max.tris, s.gl.tris); B.max.world = Math.max(B.max.world, s.gl.tris - ht); B.max.worldDraws = Math.max(B.max.worldDraws, s.gl.draws - hd); }
      if (v.section === 'done') break;
    }
    g.render();
    const h = v.hero;
    return { sec: v.section, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), hp: h.hp, left: v.enemies.length, yard: v.enemies.filter((e) => e.yard).length, wp: B.wp, t: B.t, deaths: v.scene.sim.deaths, minHp: B.minHp, max: B.max, skips: B.skips };
  };
  B.stop = () => { B.act = {}; input.setAutoSource(null); };
  return true;
}

async function open(device, scene) {
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
  const ctx = await browser.newContext(contextOptions(device));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=${scene}`);
  await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 }).catch(() => errs.push('준비 시간 초과'));
  return { browser, page, errs };
}
/** 구간별 숫자: 그 자리에 세워 두고 한 프레임 그린 값 */
const sample = (page) => page.evaluate(() => {
  const g = window.__game, v = window.__v2, out = {}; g._pageHidden = true;
  for (const s of ['street', 'platform', 'corner', 'alley', 'stairs', 'garden', 'yard']) {
    v.teleport(s); for (let i = 0; i < 40; i++) g.tick(1 / 60); g.render();
    const st = v.stats; out[s] = { draws: st.gl.draws, tris: st.gl.tris, staticTris: st.env?.visibleStaticTris ?? st.world.tris, staticDraws: st.env?.staticDraws ?? null, chunks: st.env?.visibleChunks ?? null, heroTris: st.hero3d?.tris ?? 0, sprites: st.sprites };
  }
  const st = v.stats; v.teleport('street');
  return { sections: out, texMB: +(st.gl.texBytes / 1048576).toFixed(1), bufKB: Math.round(st.gl.bufBytes / 1024), heroTexMB: +((st.hero3d?.texBytes ?? 0) / 1048576).toFixed(1), heroBufKB: Math.round((st.hero3d?.bufBytes ?? 0) / 1024), canvases: st.canvases, uploadPx: st.gl.uploadPx, env: st.env, api: st.gl.api, renderer: st.gl.renderer, canvas: st.gl.canvas, mode: st.mode, hero3d: !!st.hero3d?.on };
});

for (const dev of DEVICES) {
  console.log(`\n[${dev}] v2c`);
  const R = (report.devices[dev] = {});
  const { browser, page, errs } = await open(dev, 'v2c');
  try {
    const st = await page.evaluate(() => ({ id: window.__v2?.id, ready: window.__v2?.ready, err: window.__v2?.error }));
    if (st.id !== 'c' || !st.ready) { fail(`${dev}: 장면이 뜨지 않음 ${JSON.stringify(st)}`); continue; }
    ok('장면 v2c 준비됨');
    R.numbers = await sample(page);
    const N = R.numbers;
    console.log(`  ${N.api} · ${N.renderer.slice(0, 50)} · GL 캔버스 ${N.canvas.join('×')} · ${N.mode} · 입체 영웅 ${N.hero3d ? '있음' : '없음'}`);
    for (const [s, q] of Object.entries(N.sections)) console.log(`    ${s.padEnd(8)} 그리기 ${String(q.draws).padStart(2)} (정적 ${q.staticDraws}) · 삼각형 ${String(q.tris).padStart(5)} (정적 ${q.staticTris}, 영웅 ${q.heroTris}) · 덩어리 ${q.chunks}/${Object.keys(N.env.perChunk).length}`);
    console.log(`    텍스처 ${N.texMB} MB (그중 키트 ${(N.env.kitTexBytes / 1048576).toFixed(1)} MB) + 영웅 모델 ${N.heroTexMB} MB · 정점 버퍼 ${N.bufKB} KB + 영웅 ${N.heroBufKB} KB · 컴파일 ${N.env.compileMs} ms · 불러오기 ${N.env.loadMs} ms`);
    for (const [s, q] of Object.entries(N.sections)) { if (q.tris > BUDGET.tris) fail(`${dev} ${s}: 삼각형 ${q.tris} > ${BUDGET.tris}`); if (q.draws > BUDGET.draws) fail(`${dev} ${s}: 그리기 호출 ${q.draws} > ${BUDGET.draws}`); }
    await page.evaluate(() => { const sc = window.__v2.scene; sc.sim.reset(); sc.cam.snap = true; });   // 숫자를 재느라 깨운 적을 제자리로 (처음부터 시작)
    await page.evaluate(installBot);
    let r = null; const t0 = Date.now();
    for (let i = 0; i < 40 && Date.now() - t0 < 240000; i++) { r = await page.evaluate(() => window.__bot.run(300, 10)); if (r.sec === 'done') break; }
    R.bot = r;
    if (r?.sec === 'done') ok(`봇이 끝까지: ${(r.t / 60).toFixed(1)}초(게임 시간), 남은 체력 ${r.hp}, 최저 ${r.minHp}, 쓰러짐 ${r.deaths} · 도중 최대 그리기 ${r.max.draws} · 삼각형 ${r.max.tris}`);
    else fail(`${dev}: 봇이 끝까지 못 감 ${JSON.stringify(r)}`);
    // 예산은 '세계 + 스프라이트'(이 키트가 책임지는 몫)로 본다. 입체 영웅(char3d)은 따로 적는다 — 대시 잔상이 영웅 모델을 여러 번 다시 그려 순간 값이 튄다.
    if (r && r.max.worldDraws > BUDGET.draws) fail(`${dev}: 도중 그리기 호출(영웅 제외) ${r.max.worldDraws} > ${BUDGET.draws}`);
    if (r && r.max.world > BUDGET.tris) fail(`${dev}: 도중 삼각형(영웅 제외) ${r.max.world} > ${BUDGET.tris}`);
    if (r) console.log(`    도중 최대 (영웅 제외): 그리기 ${r.max.worldDraws} · 삼각형 ${r.max.world}` + (r.max.tris > BUDGET.tris || r.max.draws > BUDGET.draws ? `  ※ 영웅 포함 순간 최대 그리기 ${r.max.draws} · 삼각형 ${r.max.tris} (대시 잔상 — char3d 쪽 과제)` : '') + (r.skips ? ` · 낀 적 건너뛰기 ${r.skips}회` : ''));
    const ft = await page.evaluate(() => { const v = window.__v2, g = window.__game; window.__bot.stop(); v.teleport('street'); v.perfFinish(true); for (let i = 0; i < 90; i++) { g.tick(1 / 60); g.render(); } const s = v.stats; v.perfFinish(false); return { p50: s.frameMs.p50, p95: s.frameMs.p95, mode: s.mode, parts: s.parts }; });
    R.frame = ft; console.log(`    프레임 시간(소프트웨어 렌더러, 대표값 아님) ${ft.mode}: p50 ${ft.p50.toFixed(1)} · p95 ${ft.p95.toFixed(1)} ms`);
    // 나가기
    const ex = await page.evaluate(async () => { const g = window.__game; g.go('title', {}, { fade: false }); for (let i = 0; i < 5; i++) g.tick(1 / 60); await new Promise((r) => setTimeout(r, 300)); return { v2: typeof window.__v2, top: g.top?.constructor?.name, gl: !!document.getElementById('v2b-gl') }; });
    if (ex.v2 === 'undefined' && !ex.gl) ok('나가기: __v2 해제 · GL 캔버스 뗌'); else fail(`${dev}: 나간 뒤 남은 것 ${JSON.stringify(ex)}`);
    if (errs.length) fail(`${dev}: 페이지 오류 ${errs.length}건 — ${errs.slice(0, 3).join(' | ')}`); else ok('페이지 오류 0');
    R.errors = errs;
  } finally { await browser.close(); }
  if (args.base) {   // 견줄 값: 시범판 B 를 같은 방법으로
    const b = await open(dev, 'v2b');
    try { R.base = await sample(b.page); const N = R.base; console.log(`  [견줌] v2b: ` + Object.entries(N.sections).map(([s, q]) => `${s} ${q.draws}dc/${q.tris}tri`).join(' · ') + ` · 텍스처 ${N.texMB} MB · 버퍼 ${N.bufKB} KB`); } finally { await b.browser.close(); }
  }
}
// ── 배포 빌드 (번들 + CSP): --dist <폴더> — build_web.mjs 결과물에서 v2c 가 뜨고 키트 텍스처를 실제로 받는지 ──
if (args.dist) {
  console.log('\n[배포 빌드 ' + args.dist + ']');
  const http = await import('node:http'), path = await import('node:path');
  const root = path.resolve(String(args.dist));
  const toml = fs.readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
  const csp = (toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/) || [])[1] || "default-src 'self'";
  const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webp: 'image/webp', png: 'image/png', woff2: 'font/woff2', webmanifest: 'application/manifest+json', m4a: 'audio/mp4', ogg: 'audio/ogg', glb: 'model/gltf-binary' };
  const dsrv = http.createServer((req, res) => {
    let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
    const f = path.join(root, u); if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[f.split('.').pop()] || 'application/octet-stream', 'Content-Security-Policy': csp }); res.end(data); });
  });
  const dport = port + 1; await new Promise((r) => dsrv.listen(dport, r));
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
  try {
    const page = await (await browser.newContext(contextOptions(DEVICES[0]))).newPage(); const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://localhost:${dport}/index.html?scene=v2c`);
    await page.waitForFunction(() => window.__v2?.id === 'c' && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 }).catch(() => errs.push('준비 시간 초과'));
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => { const g = window.__game, v = window.__v2; if (!v) return { ready: false }; g._pageHidden = true; g.input.setAutoSource(() => ({ right: true })); for (let i = 0; i < 90; i++) g.tick(1 / 60); g.render(); g.input.setAutoSource(null); const s = v.stats; return { ready: v.ready, err: v.error, x: Math.round(v.hero.x), draws: s.gl?.draws, staticDraws: s.env?.staticDraws, kitTexMB: +((s.env?.kitTexBytes ?? 0) / 1048576).toFixed(1), build: window.__BN_BUILD?.ver ?? null }; });
    report.dist = { ...r, errors: errs.slice(0, 5) };
    if (r.ready && !r.err && r.x > 300 && r.staticDraws > 5 && r.kitTexMB > 5 && !errs.length) ok(`번들된 빌드가 CSP 아래에서 열리고 키트 텍스처를 받아 그린다: ${JSON.stringify(r)}`); else fail('배포 빌드 이상: ' + JSON.stringify(report.dist));
  } finally { await browser.close(); dsrv.close(); }
}
srv.close();
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
console.log(fails.length ? `\n실패 ${fails.length}건` : '\n모두 통과');
process.exit(fails.length ? 1 : 0);
