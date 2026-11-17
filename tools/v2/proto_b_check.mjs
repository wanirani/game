// 시범판 B 검사 (docs/v2/SLICE0.md §9): 헤드리스 Chromium(SwiftShader) 에서 fold_open · phone2 로 구간을 끝까지 걸어
// 마당의 적을 모두 쓰러뜨린다. 페이지 오류 0, 프레임 시간·그리기 호출·텍스처 메모리 보고, 캡처 저장.
//   node tools/v2/proto_b_check.mjs [--devices fold_open,phone2] [--shots /tmp/claude-0/v2/fold/b] [--no-shots] [--json out.json]
//                                  [--dist dist/<빌드 폴더>]  ← build_web.mjs 결과물을 배포용 CSP 머리말과 함께 열어 본다 (번들 + CSP)
// 함께 보는 것: 스테이지 데이터 검증(world.js validateStage) · WebGL 없음(안내만, 오류 0) · 컨텍스트 잃기→복구 · 장면 나가기(자원 정리).
// 주의: 헤드리스의 WebGL 은 소프트웨어 렌더러라 프레임 시간이 실제 기기를 대표하지 않는다 (GL→2D 옮기기가 ReadPixels 로 돈다).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, padLayout, pressButton, stickHold, ensureTouchMode } from '../qa/lib/touch.mjs';
import STAGE from '../../src/v2/b/stage_slice0.js';
import { validateStage } from '../../src/v2/b/world.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(',');
const SHOTS = args['no-shots'] ? null : String(args.shots || '/tmp/claude-0/v2/fold/b');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const fails = [], report = { stage: null, devices: {}, noWebgl: null };
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

// ── 0) 저작 데이터 검증 ──
{
  const r = validateStage(STAGE); report.stage = r;
  console.log('[stage] ' + STAGE.id + ': ' + JSON.stringify(r.stats));
  if (r.errors.length) for (const e of r.errors) fail('stage: ' + e); else ok('스테이지 검증 오류 0 (경고 ' + r.warnings.length + ')');
}

const port = 8200 + Math.floor(Math.random() * 700);
const srv = await start(port);
const PAGE_URL = `http://localhost:${port}/index.html?scene=v2b`;

/** 페이지 안에서 도는 봇: 길을 따라 걷고, 가까운 적을 쫓아가 깊이를 맞춘 뒤 벤다 */
function installBot() {
  const g = window.__game, v = window.__v2, input = g.input;
  const ROUTE = [[330, 120], [560, 182], [790, 190], [1230, 190], [1300, 182], [1480, 182], [1520, 130], [1720, 190], [1990, 190], [2190, 190], [2190, 420], [2190, 960], [2190, 1500], [2190, 1720], [2190, 1860]];
  const B = (window.__bot = { wp: 0, t: 0, act: {}, stuck: 0, lx: 0, lz: 0, side: 0, atk: 0, log: [], minHp: 100, hits: 0, jumpT: 0, dodge: 0 });
  input.setAutoSource(() => B.act);
  B.think = () => {
    const h = v.hero, E = v.enemies, a = (B.act = {});
    B.t++; B.minHp = Math.min(B.minHp, h.hp);
    if (h.dead) return;
    if (v.section === 'done') return;
    // 표적: 깨어 있거나 가까운 적 (높이 차가 작은 것)
    let tg = null, bd = 1e9;
    for (const e of E) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - h.x, (e.z - h.z) * 1.5);
      if (Math.abs(e.y - h.y) > 110) continue;
      if (!(e.active ? d < 620 : d < 300)) continue;
      if (d < bd) { bd = d; tg = e; }
    }
    let tx, tz, fight = false;
    if (tg) {
      const side = h.x <= tg.x ? -1 : 1;
      tx = tg.x + side * 56; tz = tg.z; fight = true;
      const dx = tg.x - h.x, dz = tg.z - h.z;
      if (Math.abs(dx) < 96 && Math.abs(dx) > 18 && Math.abs(dz) < 20) {
        if (dx > 0) a.right = h.facing < 0; else a.left = h.facing > 0;   // 돌아보기
        B.atk++; if (B.atk % 7 < 3) a.attack = true;
        if ((dx > 0) === (h.facing > 0)) { tx = h.x; tz = tg.z; }
      }
    } else {
      // 싸우느라 길에서 벗어났으면 가장 가까운 길목부터 다시
      let ni = B.wp, nd = 1e9;
      for (let i = B.wp; i < ROUTE.length; i++) { const d = Math.hypot(ROUTE[i][0] - h.x, ROUTE[i][1] - h.z); if (d < nd) { nd = d; ni = i; } }
      B.wp = ni;
      const w = ROUTE[B.wp];
      if (Math.hypot(w[0] - h.x, w[1] - h.z) < 26 && B.wp < ROUTE.length - 1) B.wp++;
      tx = ROUTE[B.wp][0]; tz = ROUTE[B.wp][1];
    }
    const dx = tx - h.x, dz = tz - h.z;
    if (dx > 7) a.right = true; else if (dx < -7) a.left = true;
    if (dz > 6) a.up = true; else if (dz < -6) a.down = true;
    // 탄 피하기: 가까이 오면 깊이 쪽으로 대시
    for (const s of v.shots) { if (Math.hypot(s.x - h.x, s.z - h.z) < 80 && Math.abs(s.z - h.z) < 26 && B.dodge <= 0) { a.dash = true; a.up = h.z < 120 || (s.z <= h.z && h.z < 2000); a.down = !a.up; a.left = a.right = false; B.dodge = 30; } }
    B.dodge--;
    // 막힘: 4/10초 넘게 못 움직이면 점프 + 옆걸음
    if (B.t % 6 === 0) {
      const moved = Math.hypot(h.x - B.lx, h.z - B.lz); B.lx = h.x; B.lz = h.z;
      if ((a.left || a.right || a.up || a.down) && !a.attack && moved < 3) B.stuck++; else B.stuck = Math.max(0, B.stuck - 1);
    }
    if (B.stuck >= 4) { B.jumpT = 26; B.stuck = 0; B.side = h.z > 150 && h.z < 260 ? -1 : 1; if (fight && Math.random() < 0.5) B.side = -B.side; }
    if (B.jumpT > 0) { B.jumpT--; a.jump = B.jumpT > 12; if (B.side > 0) { a.up = true; a.down = false; } else { a.down = true; a.up = false; } }
  };
  B.run = (n, renderEvery) => {
    g._pageHidden = true;
    for (let i = 0; i < n; i++) { B.think(); g.tick(1 / 60); if (renderEvery && i % renderEvery === 0) g.render(); if (v.section === 'done') break; }
    g.render();
    const h = v.hero;
    return { sec: v.section, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), hp: h.hp, left: v.enemies.length, yard: v.enemies.filter((e) => e.yard).length, wp: B.wp, t: B.t, deaths: v.scene.sim.deaths, minHp: B.minHp };
  };
  B.stop = () => { B.act = {}; input.setAutoSource(null); };
  return true;
}

async function open(device, extraArgs = GL_ARGS) {
  const browser = await chromium.launch({ executablePath: EXE, args: extraArgs });
  const ctx = await browser.newContext(contextOptions(device));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  await page.goto(PAGE_URL);
  await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 }).catch(() => errs.push('준비 시간 초과'));
  return { browser, page, errs };
}
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(120); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

for (const dev of DEVICES) {
  console.log(`\n[${dev}]`);
  const R = (report.devices[dev] = {});
  const { browser, page, errs } = await open(dev);
  try {
    await page.waitForTimeout(1200);   // 퍼펫·적 그림이 다 받아질 때까지
    await page.evaluate(installBot);
    const cap = dev === DEVICES[0];
    // ── 0.5) 터치: 가상 패드의 스틱·버튼이 실제로 영웅을 움직이는가 (실시간 루프) ──
    if (contextOptions(dev).hasTouch) {
      const cdp = await page.context().newCDPSession(page), T = new Touch(cdp, page);
      await ensureTouchMode(T, page);
      await page.waitForTimeout(300);
      const pad = await padLayout(page);
      const ids = Object.keys(pad.buttons ?? {});
      const h0 = await page.evaluate(() => window.__v2.hero);
      await stickHold(T, page, 46, -46, 1100);
      const h1 = await page.evaluate(() => window.__v2.hero);
      await page.evaluate(() => { for (const e of window.__v2.scene.sim.enemies) e.dead = true; });   // 조작만 본다 (맞아서 입력이 끊기지 않게)
      const until = (what, ms) => page.evaluate(async ([what, ms]) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { const h = window.__v2.hero; if (what === 'air' ? !h.onGround : h.anim === what) return true; await new Promise((r) => setTimeout(r, 8)); } return false; }, [what, ms]);
      const [, wa] = await Promise.all([pressButton(T, page, 'attack', 220), until('attack', 3000)]);
      await page.waitForTimeout(500);
      const [, wj] = await Promise.all([pressButton(T, page, 'jump', 220), until('air', 3000)]);
      await page.waitForTimeout(900);
      // 대시는 0.19초라 느린 헤드리스 프레임 하나에 통째로 지나갈 수 있다 → 자세 대신 밀려난 거리로 본다
      const dx0 = (await page.evaluate(() => window.__v2.hero)).x;
      await pressButton(T, page, 'dash', 220); await page.waitForTimeout(700);
      const wd = Math.abs((await page.evaluate(() => window.__v2.hero)).x - dx0) > 40;
      R.touch = { pad: ids, moved: [Math.round(h1.x - h0.x), Math.round(h1.z - h0.z)], attack: wa, jump: wj, dash: wd };
      const T_OK = R.touch.moved[0] > 40 && R.touch.moved[1] > 25 && R.touch.attack && R.touch.jump && R.touch.dash && ['attack', 'jump', 'dash'].every((b) => ids.includes(b));
      if (T_OK) ok('터치: 스틱 오른쪽·위 → 이동 ' + R.touch.moved.join(',') + ', 공격·점프·대시 버튼 동작 (패드 버튼: ' + ids.join(' ') + ')'); else fail(`${dev}: 터치 조작 이상 ${JSON.stringify(R.touch)}`);
      await page.evaluate(() => { const v = window.__v2; v.scene.sim.reset(); v.scene.cam.snap = true; });
    }
    // ── 1) 끝까지 걷기 ──
    let st = null, seen = new Set(), liveShots = { street: false, yard: false };
    const t0 = Date.now();
    for (let chunk = 0; chunk < 400; chunk++) {
      st = await page.evaluate(() => window.__bot.run(45, 5));
      seen.add(st.sec);
      if (cap && !liveShots.street && st.sec === 'street' && st.x > 520) { liveShots.street = true; await shot(page, 'live_street_fight'); }
      if (cap && !liveShots.yard && st.sec === 'yard' && st.yard <= 4) { liveShots.yard = true; await shot(page, 'live_yard_fight'); }
      if (st.sec === 'done' || st.t > 60 * 240) break;
    }
    R.run = { ...st, gameSec: +(st.t / 60).toFixed(1), wallSec: +((Date.now() - t0) / 1000).toFixed(1), sections: [...seen] };
    if (st.sec === 'done') ok(`구간 끝: ${R.run.gameSec}초(게임), 남은 체력 ${st.hp} (최저 ${st.minHp}), 쓰러짐 ${st.deaths}회, 지난 구간 ${[...seen].join('→')}`);
    else fail(`${dev}: 끝까지 가지 못함 ${JSON.stringify(st)}`);
    for (const s of ['street', 'corner', 'alley', 'yard']) if (!seen.has(s)) fail(`${dev}: 구간 ${s} 을 지나지 않음`);
    if (cap) { await page.evaluate(() => { const g = window.__game; for (let i = 0; i < 80; i++) g.tick(1 / 60); g.render(); }); await shot(page, '09_done_banner'); }
    R.restart = await page.evaluate(() => {
      const g = window.__game, v = window.__v2, input = g.input; window.__bot.stop();
      for (let i = 0; i < 90; i++) g.tick(1 / 60);
      const before = v.section;
      input.setAutoSource(() => ({ attack: true })); g.tick(1 / 60); input.setAutoSource(null); for (let i = 0; i < 5; i++) g.tick(1 / 60);
      return { before, after: v.section, enemies: v.enemies.length, hp: v.hero.hp, x: Math.round(v.hero.x) };
    });
    if (st.sec === 'done' && R.restart.before === 'done' && R.restart.after === 'street' && R.restart.enemies === 16) ok('끝 표시 뒤 공격 버튼 → 처음부터 다시 (적 16)'); else if (st.sec === 'done') fail(`${dev}: 다시 시작 이상 ${JSON.stringify(R.restart)}`);
    // ── 1.5) 규칙: 적의 공격 · 구덩이 · 계단 · 점프로 단상 오르기 · 깊이 판정 ──
    R.rules = await page.evaluate(() => {
      const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim, input = g.input; window.__bot.stop(); g._pageHidden = true;
      const run = (keys, n) => { input.setAutoSource(() => keys); for (let i = 0; i < n; i++) g.tick(1 / 60); input.setAutoSource(null); g.tick(1 / 60); };
      const out = {};
      // 적 근접 공격이 가만히 선 영웅에게 들어온다
      sim.reset(); v.teleport('pillar'); let e = sim.enemies[0]; e.x = sim.hero.x + 120; e.z = sim.hero.z; e.active = true; e.state = 'chase'; e.cd = 0;
      run({}, 150); out.meleeDmg = 100 - sim.hero.hp;
      // 원거리 탄이 날아와 맞는다
      sim.reset(); v.teleport('pillar'); e = sim.enemies[2]; e.x = sim.hero.x + 260; e.z = sim.hero.z + 30; e.y = 0; e.active = true; e.state = 'chase'; e.cd = 0;
      run({}, 200); out.shotDmg = 100 - sim.hero.hp;
      // 깊이 판정: z 가 40 어긋난 적은 맞지 않고(도움 범위 밖 80), 20 이면 맞는다
      const swing = (dz) => { sim.reset(); v.teleport('pillar'); const q = sim.enemies[0]; q.x = sim.hero.x + 60; q.z = sim.hero.z + dz; q.cd = 99; sim.hero.facing = 1; run({ attack: true }, 3); run({}, 20); return q.hpMax - q.hp; };
      out.hitDz20 = swing(20); out.hitDz80 = swing(80);
      // 구덩이: 떨어지면 체력이 깎이고 가장자리로 돌아온다
      sim.reset(); v.teleport('pit'); sim.hero.x = 1770; sim.hero.z = 70; run({}, 5); run({ right: true }, 70); run({}, 30);
      out.pit = { hp: sim.hero.hp, x: Math.round(sim.hero.x), y: Math.round(sim.hero.y) };
      // 계단으로 단상에 오른다 / 점프로 오른다
      sim.reset(); v.teleport('platform'); run({ right: true }, 60); out.stairsY = Math.round(sim.hero.y);
      sim.reset(); v.teleport('platform'); sim.hero.x = 1050; sim.hero.z = 95; run({}, 3); run({ up: true, jump: true }, 40); run({}, 20); out.jumpY = Math.round(sim.hero.y);
      // 골목 계단 +96
      sim.reset(); v.teleport('stairs'); run({ up: true }, 110); out.alleyStairsY = Math.round(sim.hero.y);
      // 대시는 스틱 방향(깊이 쪽)으로
      sim.reset(); v.teleport('alley'); const z0 = sim.hero.z; run({ up: true, dash: true }, 2); run({ up: true }, 10); out.dashDz = Math.round(sim.hero.z - z0);
      // 쓰러지면 구간 처음에서 다시
      sim.reset(); v.teleport('pillar'); e = sim.enemies[0]; e.x = sim.hero.x + 110; e.z = sim.hero.z; e.active = true; e.state = 'chase'; e.cd = 0; sim.hero.hp = 5; const d0 = sim.deaths;
      run({}, 140); const dead = sim.hero.dead; run({}, 130);
      out.death = { dead, deaths: sim.deaths - d0, hp: sim.hero.hp, x: Math.round(sim.hero.x) };
      sim.reset(); sc.cam.snap = true;
      return out;
    });
    {
      const q = R.rules, bad = [];
      if (!(q.meleeDmg > 0)) bad.push('근접 적 공격이 안 들어옴'); if (!(q.shotDmg > 0)) bad.push('탄이 안 맞음');
      if (!(q.hitDz20 > 0)) bad.push('깊이 20 에서 안 맞음'); if (q.hitDz80 !== 0) bad.push('깊이 80 에서 맞음');
      if (!(q.pit.hp < 100 && q.pit.x < 1800 && q.pit.y === 0)) bad.push('구덩이 처리 이상');
      if (q.stairsY !== 72) bad.push('계단으로 단상에 못 오름'); if (q.jumpY !== 72) bad.push('점프로 단상에 못 오름'); if (q.alleyStairsY !== 96) bad.push('골목 계단 높이 이상');
      if (!(q.dashDz > 60)) bad.push('깊이 방향 대시 이상');
      if (!(q.death.dead && q.death.deaths === 1 && q.death.hp === 100 && q.death.x === STAGE.start.x)) bad.push('쓰러짐 → 처음부터 이상');
      if (bad.length) fail(`${dev}: 규칙 ${bad.join(', ')} ${JSON.stringify(q)}`); else ok('규칙: ' + JSON.stringify(q));
    }
    await page.evaluate(installBot);
    // ── 2) 프레임 시간 (렌더 포함 연속 240프레임, gl.finish 포함) ──
    await page.evaluate(() => { const v = window.__v2, sc = v.scene; window.__bot.stop(); sc.sim.reset(); v.teleport('yard'); sc.cam.snap = true; v.perfFinish(true); });
    await page.evaluate(installBot);
    R.perf = await page.evaluate(() => {
      const g = window.__game, v = window.__v2, sc = v.scene; g._pageHidden = true; sc.resK = 1;
      const auto = v.stats.mode;
      const measure = (layer, n) => { v.setLayer(layer); v.perfFinish(true); for (let i = 0; i < n; i++) { window.__bot.think(); g.tick(1 / 60); g.render(); } const s = v.stats; return { frameMs: s.frameMs, parts: s.parts }; };
      const blit = measure(false, 90), layer = measure(true, 240);
      const s = v.stats; v.perfFinish(false);
      return { auto, blit, layer, gl: s.gl, atlas: s.atlas, world: s.world, sprites: s.sprites, canvases: s.canvases, dom: document.querySelectorAll('canvas').length, backing: [g.canvas.width, g.canvas.height], view: [g.viewW, g.viewH], scale: g.scale, tier: g.tier };
    });
    const P = R.perf, f1 = (x) => x.toFixed(1);
    console.log(`  프레임 시간 (SwiftShader 소프트웨어 렌더러 — 실제 기기 대표값 아님; 갱신+그리기+gl.finish)`);
    console.log(`    DOM 층 방식  p50 ${f1(P.layer.frameMs.p50)} ms · p95 ${f1(P.layer.frameMs.p95)} ms | 아틀라스 ${f1(P.layer.parts.atlasMs)} · GL ${f1(P.layer.parts.glMs)} · HUD ${f1(P.layer.parts.blitMs)} ms`);
    console.log(`    drawImage 방식 p50 ${f1(P.blit.frameMs.p50)} ms · p95 ${f1(P.blit.frameMs.p95)} ms | 아틀라스 ${f1(P.blit.parts.atlasMs)} · GL ${f1(P.blit.parts.glMs)} · 옮기기 ${f1(P.blit.parts.blitMs)} ms  (헤드리스에서는 ReadPixels 로 돌아 느리다 → 자동으로 고른 방식: ${P.auto})`);
    console.log(`  그리기 호출 ${P.gl.draws} · 삼각형 ${P.gl.tris} · 텍스처 ${(P.gl.texBytes / 1048576).toFixed(1)} MB · 버퍼 ${(P.gl.bufBytes / 1024).toFixed(0)} KB · GL 캔버스 ${P.gl.canvas.join('×')} · 게임 캔버스 ${P.backing.join('×')} (논리 ${P.view.join('×')}, 등급 ${P.tier}) · 캔버스 ${P.canvases}개(DOM ${P.dom}) · ${P.gl.api} ${P.gl.renderer.slice(0, 48)}`);
    // ── 3) 캐릭터 12명 아틀라스 비용 ──
    R.atlas12 = await page.evaluate(() => {
      const v = window.__v2, sc = v.scene, sim = sc.sim, g = window.__game; window.__bot.stop();
      sim.reset(); v.teleport('yard'); sim.hero.x = 2190; sim.hero.z = 1700;
      const E = sim.enemies.slice(0, 12); E.forEach((e, i) => { e.x = 1900 + (i % 6) * 110; e.z = 1800 + Math.floor(i / 6) * 120; e.y = 96; e.active = false; });
      sim.enemies.slice(12).forEach((e) => { e.dead = true; });
      for (let i = 0; i < 20; i++) { g.tick(1 / 60); g.render(); }
      const N = 60; let draw = 0, up = 0;
      for (let i = 0; i < N; i++) {
        g.tick(1 / 60);
        const a = performance.now(); sc._chars(); const b = performance.now();
        sc.glr.update(sc.charTex, sc.atlas.canvas, sc.atlas.used); sc.glr.finish(); const c = performance.now();
        draw += b - a; up += c - b;
      }
      g.render();
      const A = sc.atlas;
      return { cells: A.cells, hero3d: !!sc.h3, drawMs: draw / N, uploadMs: up / N, uploadPx: sc.glr.stats.uploadPx, atlas: [A.canvas.width, A.canvas.height], scale: A.S };
    });
    console.log(`  캐릭터 ${R.atlas12.cells}칸(${R.atlas12.hero3d ? '영웅은 입체 모델이라 칸 없음' : '영웅 1'} + 적 12): 퍼펫 그리기 ${R.atlas12.drawMs.toFixed(2)} ms + 텍스처 올리기 ${R.atlas12.uploadMs.toFixed(2)} ms (${(R.atlas12.uploadPx / 1e6).toFixed(2)} MP, 배율 ${R.atlas12.scale})`);
    { const need = R.atlas12.hero3d ? 12 : 13; if (R.atlas12.cells < need) fail(`${dev}: 아틀라스 칸이 모자람 (${R.atlas12.cells}/${need})`); }   // 입체 영웅(char3d)은 아틀라스를 쓰지 않는다
    if (cap) await shot(page, 'x_atlas_12_enemies');
    // ── 4) 연출 캡처 (첫 기기만) ──
    if (cap && SHOTS) {
      const stage = async (name, js, steps = 50) => {
        await page.evaluate(([js, steps]) => {
          const g = window.__game, v = window.__v2, sc = v.scene, sim = sc.sim; g._pageHidden = true;
          (0, eval)('(function(v,sc,sim,g){' + js + '})')(v, sc, sim, g);
          for (let i = 0; i < steps; i++) g.tick(1 / 60);
          g.render();
        }, [js, steps]);
        await shot(page, name);
      };
      const hold = (keys, n) => `window.__game.input.setAutoSource(() => (${JSON.stringify(keys)})); for (let i = 0; i < ${n}; i++) g.tick(1/60); window.__game.input.setAutoSource(null);`;
      await stage('01_street', `sim.reset(); sc.cam.snap = true; ${hold({ right: true }, 70)}`, 20);
      await stage('02_pillar_behind', `sim.reset(); v.teleport('pillar'); sim.hero.x = 688; sim.hero.z = 152; sim.enemies[0].x = 730; sim.enemies[0].z = 150;`, 30);
      await stage('02b_pillar_front', `sim.reset(); v.teleport('pillar'); sim.hero.x = 688; sim.hero.z = 70;`, 30);
      await stage('02c_lamp_behind', `sim.reset(); v.teleport('pillar'); sim.hero.x = 438; sim.hero.z = 176; sim.hero.facing = -1;`, 30);
      await stage('03_platform_top', `sim.reset(); v.teleport('platform'); ${hold({ right: true }, 62)}`, 12);
      await stage('03b_platform_jump', `sim.reset(); v.teleport('platform'); sim.hero.x = 1260; sim.hero.z = 190; sim.hero.facing = -1; ${hold({ left: true, jump: true }, 16)}`, 0);
      await stage('04_pit_side', `sim.reset(); v.teleport('pit'); sim.hero.x = 1770; sim.hero.z = 150;`, 40);
      await stage('04b_pit_fall', `sim.reset(); v.teleport('pit'); sim.hero.x = 1780; sim.hero.z = 70; ${hold({ right: true }, 22)}`, 0);
      await stage('05_corner_turning', `sim.reset(); v.teleport('pit'); sim.hero.x = 1840; sim.hero.z = 200; for (let i = 0; i < 40; i++) g.tick(1/60); ${hold({ right: true }, 52)}`, 0);
      await stage('05b_corner_turned', `${hold({ right: true, up: true }, 50)}`, 30);
      await stage('06_alley', `sim.reset(); v.teleport('alley');`, 50);
      await stage('07_stairs', `sim.reset(); v.teleport('stairs'); ${hold({ up: true }, 34)}`, 10);
      await stage('07b_garden', `sim.reset(); v.teleport('garden');`, 60);
      await page.evaluate(installBot);
      await stage('08_yard_battle', `sim.reset(); v.teleport('yard'); sim.hero.z = 1700; window.__bot.wp = 99; for (let i = 0; i < 330; i++) { window.__bot.think(); g.tick(1/60); if (i % 6 === 0) g.render(); }`, 0);
      await stage('08b_yard_battle2', `for (let i = 0; i < 150; i++) { window.__bot.think(); g.tick(1/60); if (i % 6 === 0) g.render(); }`, 0);
      await page.evaluate(() => window.__bot.stop());
      ok('캡처 저장: ' + SHOTS);
    }
    // ── 5) 컨텍스트 잃기 → 복구 ──
    R.ctxLoss = await page.evaluate(async () => {
      const g = window.__game, v = window.__v2; g._pageHidden = false;
      const okLose = v.loseContext();
      await new Promise((r) => setTimeout(r, 150));
      const mid = { lost: v.stats.gl.lost };
      await new Promise((r) => setTimeout(r, 1300));
      const s = v.stats;
      return { okLose, lostMid: mid.lost, lostAfter: s.gl.lost, restored: s.gl.restored, draws: s.gl.draws };
    });
    if (R.ctxLoss.okLose && R.ctxLoss.lostMid && !R.ctxLoss.lostAfter && R.ctxLoss.restored >= 1 && R.ctxLoss.draws > 0) ok('컨텍스트 잃기 → 복구 뒤 다시 그림 (' + JSON.stringify(R.ctxLoss) + ')');
    else fail(`${dev}: 컨텍스트 복구 실패 ${JSON.stringify(R.ctxLoss)}`);
    if (cap) { await page.evaluate(() => { const g = window.__game; g._pageHidden = true; for (let i = 0; i < 20; i++) g.tick(1 / 60); g.render(); }); await shot(page, 'x_after_context_restore'); }
    // ── 6) 나가기: 타이틀로 → 자원 정리, v1 장면 정상 ──
    R.exit = await page.evaluate(async () => {
      const g = window.__game; g._pageHidden = false;
      const before = document.querySelectorAll('canvas:not(#v2b-gl):not(#v2b-hud)').length;
      g.go('title', {}, { fade: false });
      await new Promise((r) => setTimeout(r, 900));
      return { top: g.top?.name, v2: typeof window.__v2, canvases: document.querySelectorAll('canvas').length, before };
    });
    if (R.exit.top === 'title' && R.exit.v2 === 'undefined' && R.exit.canvases === R.exit.before) ok('나가기: 타이틀로 돌아감, __v2 해제, DOM 캔버스 수 그대로 (' + R.exit.canvases + ')');
    else fail(`${dev}: 나가기 뒤 상태 이상 ${JSON.stringify(R.exit)}`);
    R.errors = errs.slice(0, 20);
    if (errs.length) fail(`${dev}: 페이지 오류 ${errs.length}건 — ${errs.slice(0, 3).join(' | ')}`); else ok('페이지 오류 0');
  } catch (e) { fail(`${dev}: 검사 스크립트 예외 ${e.message}`); } finally { await browser.close(); }
}

// ── 7) WebGL 없음: 안내만 뜨고 오류 없음 ──
{
  console.log('\n[WebGL 없음]');
  const { browser, page, errs } = await open(DEVICES[0], ['--disable-gpu', '--disable-3d-apis']);
  try {
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => ({ err: window.__v2?.error ?? null, ready: !!window.__v2?.ready, top: window.__game?.top?.name }));
    report.noWebgl = { ...r, errors: errs.slice(0, 5) };
    if (r.err && !r.ready && !errs.length) ok('WebGL 이 없으면 안내 문구만 (' + r.err + '), 페이지 오류 0'); else fail('WebGL 없음 처리 이상: ' + JSON.stringify(report.noWebgl));
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/x_no_webgl.png` }); }
  } finally { await browser.close(); }
}
// ── 8) 배포 빌드 (번들 + CSP): --dist <폴더> ──
if (args.dist) {
  console.log('\n[배포 빌드 ' + args.dist + ']');
  const root = path.resolve(String(args.dist));
  const toml = fs.readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
  const csp = (toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/) || [])[1] || "default-src 'self'";
  const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', webp: 'image/webp', png: 'image/png', woff2: 'font/woff2', webmanifest: 'application/manifest+json', m4a: 'audio/mp4', ogg: 'audio/ogg' };
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
    await page.goto(`http://localhost:${dport}/index.html?scene=v2b`);
    await page.waitForFunction(() => window.__v2?.id === 'b' && (window.__v2.ready || window.__v2.error), null, { timeout: 40000 }).catch(() => errs.push('준비 시간 초과'));
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const g = window.__game, v = window.__v2; g._pageHidden = true; g.input.setAutoSource(() => ({ right: true, attack: true })); for (let i = 0; i < 90; i++) g.tick(1 / 60); g.render(); g.input.setAutoSource(null); const s = v.stats; return { ready: v.ready, err: v.error, x: Math.round(v.hero.x), draws: s.gl?.draws, mode: s.mode, build: window.__BN_BUILD?.version ?? null }; });
    report.dist = { ...r, csp, errors: errs.slice(0, 5) };
    if (r.ready && !r.err && r.x > 300 && r.draws > 5 && !errs.length) ok(`번들된 빌드가 CSP(${csp.slice(0, 44)}…) 아래에서 열리고 그린다: ${JSON.stringify(r)}`); else fail('배포 빌드 이상: ' + JSON.stringify(report.dist));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/x_dist_build.png` });
  } finally { await browser.close(); dsrv.close(); }
}
srv.close();
report.fails = fails;
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(report, null, 1));
console.log(fails.length ? `\nFAIL ${fails.length}건` : '\nALL OK');
process.exit(fails.length ? 1 : 0);
