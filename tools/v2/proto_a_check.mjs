#!/usr/bin/env node
// 시범판 A 검사 (docs/v2/SLICE0.md §9) — node tools/v2/proto_a_check.mjs [--vp fold_open,phone2] [--shots <폴더>] [--static] [--max 12000]
//  1 정적: 스테이지 자동 검증(src/v2/a/stage.js validate — node 에서 그대로 읽는다) + SLICE0 수치(적 수·구간)
//  2 실행(뷰포트마다): ?scene=v2a 를 열고 → 검사용 API(window.__v2) 모양 → 봇이 '가상 패드 입력'(input.touch.axis/set)만으로
//    거리 → 모퉁이 → 골목 → 마당을 걸어 마당의 적 5마리를 모두 쓰러뜨림 → 'done' · 페이지 오류 0 · 프레임 시간(p50/p95)
//    → 장면을 나가면 __v2 와 캔버스가 사라지는가
//  3 --shots: 폴드 화면 캡처 10장 (횡 구간·기둥 뒤·단상 위·구덩이 옆·모퉁이·종 구간·계단·마당 전투 …)
// 결정적 진행: 루프를 얼리고(tools/qa/lib/step.mjs freeze) 한 틱씩 직접 돌린다. 종료 코드 0 = 통과.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openEnv } from '../qa/lib/server.mjs';
import { freeze } from '../qa/lib/step.mjs';
import { buildSlice0 } from '../../src/v2/a/stage.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VPS = opt('--vp', 'fold_open,phone2').split(',').filter(Boolean);
const SHOTS = opt('--shots', null);
const MAX = Number(opt('--max', 12000));
const URL = 'index.html?scene=v2a&nosw';
const fails = [];
const ok = (cond, msg) => { console.log(`${cond ? '  ok  ' : '  FAIL'} ${msg}`); if (!cond) fails.push(msg); };

// ───────────────────────── 1. 정적 ─────────────────────────
console.log('== static ==');
{
  const st = buildSlice0(), v = st.validate();
  for (const e of v.errors) console.log('   error:', e);
  for (const w of v.warnings) console.log('   warn :', w);
  ok(v.errors.length === 0, `stage.validate 오류 0 (판 ${v.stats.slabs} · 소품 ${v.stats.props} · 적 ${v.stats.spawns} · 걷는 넓이 ${v.stats.walkArea})`);
  const path0 = st.spawns.filter((s) => s.group === 'path'), yard = st.spawns.filter((s) => s.group === 'yard');
  ok(path0.length >= 8, `길 위의 적 ${path0.length} ≥ 8`);
  ok(yard.length === 5, `마당의 적 ${yard.length} = 5`);
  ok(new Set(st.spawns.map((s) => s.kind)).size >= 2, '적 2종 (근접 · 원거리)');
  ok(['street', 'corner', 'alley', 'yard'].every((id) => st.sections.some((s) => s.id === id)), '구간 4개 (street corner alley yard)');
  ok(st.pits.length === 1 && st.pits[0].z1 - st.pits[0].z0 === 130, '구덩이 1개 — 깊이의 절반 (130 / 260)');
}
if (args.includes('--static')) process.exit(fails.length ? 1 : 0);

// ───────────────────────── 봇 (페이지 안에서 돈다) ─────────────────────────
// 가상 패드와 같은 입구(input.touch.axis · input.touch.set)만 쓴다. 적이 휘두르려 하면 깊이(z)로 비켜선다.
function installBot() {
  const WP = [[380, 60], [1180, 52], [1440, 62], [1770, 62], [2190, 92], [2190, 420], [2190, 1500], [2190, 1660]];
  const START = { street: 0, corner: 4, alley: 5, yard: 7, done: 7 };
  const B = { wi: 0, stuck: 0, lx: 0, lz: 0, ph: 0, esc: 0, escZ: 1, deaths: 0, pits: 0, lastHp: 100, seen: [], steps: 0, minHp: 100 };
  window.__botState = B;
  window.__bot = function () {
    const g = window.__game, inp = g.input, v = window.__v2, h = v.hero, es = v.enemies, sec = v.section;
    B.steps++;
    if (B.seen[B.seen.length - 1] !== sec) B.seen.push(sec);
    if (h.hp < B.minHp) B.minHp = h.hp;
    if (Math.hypot(h.x - B.lx, h.z - B.lz) > 200) { B.wi = START[sec] ?? 0; if (h.hp >= 100 && B.lastHp < 100 && B.steps > 5) B.deaths++; else if (B.steps > 5) B.pits++; }
    B.lastHp = h.hp;
    if (sec === 'done' || h.state === 'dead') { inp.touch.axis(0, 0); inp.touch.set('attack', false); inp.touch.set('jump', false); inp.touch.set('dash', false); B.lx = h.x; B.lz = h.z; return sec; }
    let ax = 0, az = 0, atk = false, jump = false;
    let best = null, bd = 1e9;
    for (const e of es) { if (!e.awake) continue; const d = Math.hypot(e.x - h.x, (e.z - h.z) * 1.4); if (d < bd) { bd = d; best = e; } }
    let threat = null;
    for (const e of es) if (e.kind === 'skeleton' && e.state === 'attack' && Math.abs(e.x - h.x) < 120 && Math.abs(e.z - h.z) < 40) threat = e;
    let tx, tz;
    if (threat) { tx = h.x; tz = h.z + (h.z >= threat.z ? 60 : -60); }
    else if (best && bd < 560) {
      const dx = best.x - h.x, dz = best.z - h.z;
      if (Math.abs(dz) <= 15 && Math.abs(dx) <= 138 && Math.abs(dx) >= 22) { atk = true; tx = h.x + Math.sign(dx) * 40; tz = h.z; if ((h.facing > 0) === (dx > 0)) { tx = h.x; } }
      else { tx = best.x - Math.sign(dx || 1) * 92; tz = best.z; }
    } else {
      let w = WP[B.wi];
      if (Math.hypot(w[0] - h.x, w[1] - h.z) < 46 && B.wi < WP.length - 1) w = WP[++B.wi];
      tx = w[0]; tz = w[1];
    }
    const ex = tx - h.x, ez = tz - h.z, m = Math.hypot(ex, ez);
    if (m > 5) { ax = ex / m; az = ez / m; if (m < 30) { ax *= m / 30; az *= m / 30; } }
    // 막혔으면: 뛰면서 깊이로 비켜 간다
    if (B.steps % 30 === 0) {
      if (!atk && m > 30 && Math.hypot(h.x - B.sx, h.z - B.sz) < 8) { B.esc = 40; B.escZ = -B.escZ; }
      B.sx = h.x; B.sz = h.z;
    }
    if (B.esc > 0) { B.esc--; az = B.escZ; ax *= 0.5; jump = B.esc % 20 > 10; }
    B.ph = (B.ph + 1) % 8;
    inp.touch.axis(ax, -az);
    inp.touch.set('attack', atk && B.ph < 4);
    inp.touch.set('jump', jump);
    B.lx = h.x; B.lz = h.z;
    return sec;
  };
}

const env = await openEnv();
const results = [];
try {
  for (const vp of VPS) {
    console.log(`== ${vp} ==`);
    const s = await env.page(vp, URL);
    const page = s.page;
    try {
      await page.waitForFunction(() => window.__v2 && window.__game && window.__game.started !== false, null, { timeout: 40000 });
      await page.waitForTimeout(1500);
      const shape = await page.evaluate(() => {
        const v = window.__v2, h = v.hero, e = v.enemies[0], f = v.stats.frameMs;
        return { id: v.id, hero: ['x', 'y', 'z', 'hp'].every((k) => typeof h[k] === 'number'), en: v.enemies.length, e0: e && ['x', 'y', 'z', 'hp'].every((k) => typeof e[k] === 'number') && typeof e.kind === 'string',
          cam: typeof v.cam === 'object' && typeof v.cam.x === 'number', sec: v.section, fm: typeof f.p50 === 'number' && typeof f.p95 === 'number', tp: typeof v.teleport === 'function',
          vw: window.__game.viewW, vh: window.__game.viewH, pad: !!window.__game.padShown, val: v.validate().errors.length };
      });
      ok(shape.id === 'a' && shape.hero && shape.e0 && shape.cam && shape.fm && shape.tp, `__v2 API 모양 (id·hero·enemies ${shape.en}·cam·stats.frameMs·teleport)`);
      ok(shape.sec === 'street', `시작 구간 = street (화면 ${shape.vw}×${shape.vh})`);
      ok(shape.val === 0, '브라우저 안 stage.validate 오류 0');
      await freeze(page);
      // teleport 왕복
      const tp = await page.evaluate(() => { const r = []; for (const id of ['yard', 'alley', 'corner', 'street']) { window.__v2.teleport(id); window.__qaStep(3, true); r.push(window.__v2.section); } window.__v2.restart(); window.__qaStep(2, true); return r.join(','); });
      ok(tp === 'yard,alley,corner,street', `teleport 4구간 (${tp})`);
      await page.evaluate(installBot);
      // 플레이: 240 틱씩. 틱마다 그리고, 그린 뒤 getImageData 로 래스터를 그 프레임에 끝내게 한다 →
      //   JS 시간(갱신 + 그리기 명령) = __v2.stats.frameMs,  래스터 포함 시간 = 여기서 잰 한 스텝의 실제 시간
      const fm = [], wall = [];
      let sec = 'street', steps = 0;
      while (steps < MAX && sec !== 'done') {
        const r = await page.evaluate(() => {
          const g = window.__game, now = g.__qaRealNow, ctx = g.ctx, w = [];
          let sec = '';
          for (let i = 0; i < 240; i++) { sec = window.__bot(); const t = now(); window.__qaStep(1, true); ctx.getImageData(0, 0, 1, 1); w.push(now() - t); if (sec === 'done') break; }
          return { sec, f: window.__v2.stats.frameMs, h: window.__v2.hero, w };
        });
        steps += 240; sec = r.sec; fm.push(r.f); for (const x of r.w) wall.push(x);
        if (steps % 1200 === 0) console.log(`   … ${steps} 틱  ${sec}  hero ${r.h.x | 0},${r.h.z | 0} hp ${r.h.hp | 0}  JS ${r.f.p50}/${r.f.p95} ms`);
      }
      const b = await page.evaluate(() => { for (let i = 0; i < 90; i++) window.__qaStep(1, true); const B = window.__botState; return { seen: B.seen, deaths: B.deaths, pits: B.pits, steps: B.steps, minHp: B.minHp, kills: window.__v2.stats.kills, left: window.__v2.enemies.length, yard: window.__v2.enemies.filter((e) => e.group === 'yard').length, sec: window.__v2.section, q: window.__game.quality, cv: [window.__game.canvas.width, window.__game.canvas.height] }; });
      const order = ['street', 'corner', 'alley', 'yard', 'done'];
      let oi = 0; for (const x of b.seen) if (x === order[oi]) oi++;
      ok(b.sec === 'done', `마당의 적을 모두 쓰러뜨리고 'done' (${b.steps} 틱 = ${(b.steps / 60).toFixed(1)} 초, 처치 ${b.kills}, 남은 길 위 적 ${b.left})`);
      ok(oi === order.length, `구간 순서 street → corner → alley → yard → done (${b.seen.join(' → ')})`);
      ok(b.yard === 0, '마당의 적 0');
      console.log(`   봇: 쓰러짐 ${b.deaths} · 구덩이 ${b.pits} · 최저 체력 ${b.minHp | 0}`);
      const p50 = fm.map((f) => f.p50).sort((x, y) => x - y), p95 = fm.map((f) => f.p95).sort((x, y) => x - y);
      const med = (a) => a[Math.floor(a.length / 2)] ?? 0;
      wall.sort((x, y) => x - y);
      const res = { vp, view: `${shape.vw}x${shape.vh}`, canvas: b.cv.join('x'), quality: b.q, steps: b.steps, kills: b.kills, deaths: b.deaths, pits: b.pits,
        js: { p50: med(p50), p95: med(p95), p95max: p95[p95.length - 1] ?? 0 },
        raster: { p50: +(wall[Math.floor(wall.length * 0.5)] ?? 0).toFixed(2), p95: +(wall[Math.floor(wall.length * 0.95)] ?? 0).toFixed(2), n: wall.length } };
      results.push(res);
      console.log(`   JS 프레임 시간(갱신 + 그리기 명령, 240틱 창 ${fm.length}개): p50 ${res.js.p50} ms · p95 ${res.js.p95} ms (창 최대 ${res.js.p95max} ms)`);
      console.log(`   래스터 포함(소프트웨어 렌더러, 캔버스 ${res.canvas}, 화질 ${res.quality}): p50 ${res.raster.p50} ms · p95 ${res.raster.p95} ms  ${res.raster.p95 > 8 ? '← 8 ms 넘음 (proto_a.md §9)' : ''}`);
      ok(res.js.p95 <= 8, `JS 프레임 시간 p95 ${res.js.p95} ms ≤ 8 ms`);
      // 다시 시작 → 처음 상태
      const again = await page.evaluate(() => { window.__v2.restart(); window.__qaStep(3, true); return { sec: window.__v2.section, n: window.__v2.enemies.length, hp: window.__v2.hero.hp }; });
      ok(again.sec === 'street' && again.n === 17 && again.hp === 100, `다시 시작 → 처음 상태 (적 ${again.n}, 체력 ${again.hp})`);
      // 캡처
      if (SHOTS && vp === 'fold_open') {
        fs.mkdirSync(SHOTS, { recursive: true });
        const shot = async (name, js, n = 24) => {
          await page.evaluate(([js, n]) => { const g = window.__game, P = window.__v2.scene.play, h = P.hero, inp = g.input; inp.touch.axis(0, 0); inp.touch.set('attack', false); (0, eval)(`(P,h,inp,v)=>{${js}}`)(P, h, inp, window.__v2); window.__v2.scene._cam(1, true); window.__qaStep(n, true); }, [js, n]);
          await page.waitForTimeout(40);
          await page.evaluate(() => window.__qaStep(1, true));
          await page.screenshot({ path: path.join(SHOTS, name + '.png') });
          console.log('   shot', name);
        };
        await page.evaluate(() => { window.__v2.restart(); window.__qaStep(2, true); });
        await shot('01_street', 'h.place(300,120); h.facing=1;');
        await shot('02_behind_pillar', 'h.place(432,170); h.facing=1;');
        await shot('03_front_of_pillar', 'h.place(446,100); h.facing=1;');
        await shot('04_on_platform', 'for(const e of P.enemies) if(e.x<1300) e.awake=false; h.place(900,200); h.facing=-1;', 6);
        await shot('05_by_pit', 'h.place(1470,150); h.facing=1;', 10);
        await shot('06_corner_turning', 'h.place(2150,250); h.facing=1;', 10);
        await shot('07_alley', 'h.place(2190,430); h.facing=1;', 10);
        await shot('08_alley_stairs', 'h.place(2190,650); h.facing=1;', 10);
        await shot('09_alley_upper', 'h.place(2190,1050); h.facing=1;', 10);
        await shot('10_yard_fight', 'h.place(2190,1700); h.facing=1;', 100);
      }
      // 장면을 나가면 자원을 놓는가
      const left = await page.evaluate(() => { const sc = window.__v2.scene, R = sc.R; window.__game.go('title', {}, { fade: false }); window.__qaStep(4, true); return { v2: typeof window.__v2, cv: R.canvases.length, top: window.__game.scenes[window.__game.scenes.length - 1]?.constructor?.name }; });
      ok(left.v2 === 'undefined' && left.cv === 0, `장면을 나가면 __v2 삭제 · 만든 캔버스 0 (맨 위 장면 ${left.top})`);
    } catch (e) { ok(false, `${vp}: ${e.message}`); }
    ok(s.errs.length === 0, `페이지 오류 0${s.errs.length ? ' — ' + s.errs.slice(0, 3).join(' / ') : ''}`);
    await s.close();
  }
} finally { await env.close(); }

console.log('== result ==');
for (const r of results) console.log(`  ${r.vp} (${r.view}, 캔버스 ${r.canvas}, 화질 ${r.quality}): ${r.steps} 틱 · 처치 ${r.kills} · 쓰러짐 ${r.deaths} · 구덩이 ${r.pits} · JS p50 ${r.js.p50} / p95 ${r.js.p95} ms · 래스터 포함 p50 ${r.raster.p50} / p95 ${r.raster.p95} ms`);
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..', 'docs/v2');
void out;
try { fs.mkdirSync('/tmp/claude-0/v2', { recursive: true }); fs.writeFileSync('/tmp/claude-0/v2/proto_a_check.json', JSON.stringify({ at: new Date().toISOString(), fails, results }, null, 1)); } catch { /* 보고 파일 없이 */ }
console.log(fails.length ? `FAIL ${fails.length}` : 'PASS');
process.exit(fails.length ? 1 : 0);
