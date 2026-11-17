#!/usr/bin/env node
// 시범판 A·B 심판 검사 (docs/v2/P0_COMPARE.md) — 두 시범판을 '같은 방법'으로 돌린다.
//   node tools/v2/p0_referee.mjs [--protos a,b] [--vp fold_open,phone2] [--shots <폴더>] [--json out.json] [--no-play]
//  1 진짜 터치(CDP 터치 이벤트 → 가상 패드)만으로: 스틱 8방향 · 죽은 구역 · 공격/점프/대시 단추 · 점프로 단상 · 구덩이
//  2 깊이 판정 훑기 (Δz 0…80 에서 한 번 휘둘러 맞는가)
//  3 처음부터 끝까지: 같은 봇이 터치 스틱 + 공격 단추로 걷고 싸운다 (루프를 얼리고 3틱씩; 마지막 틱은 그리고 읽어 내 시간을 잰다)
//  4 끝 표시 → 다시 시작(터치) → 일시정지 단추로 타이틀 → 다시 들어가기 → 자원 정리
//  5 v1 스테이지에서 v2 로 갔다가 돌아와도 v1 이 도는가
//  6 --shots: 같은 8자리 캡처 (화질 높음, fold_open) → <폴더>/<a|b>_<n>.png
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, padLayout, ensureTouchMode } from '../qa/lib/touch.mjs';
import { freeze, unfreeze } from '../qa/lib/step.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PROTOS = opt('--protos', 'a,b').split(',');
const VPS = opt('--vp', 'fold_open,phone2').split(',');
const SHOTS = opt('--shots', null);
const JSON_OUT = opt('--json', null);
const NO_PLAY = argv.includes('--no-play');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const IGNORE = /Failed to load resource|ERR_CERT|ERR_INTERNET_DISCONNECTED|fonts\.g/;
const port = 8900 + Math.floor(Math.random() * 600);
const srv = await start(port);
const report = {}, fails = [];
const ok = (c, m) => { console.log(`${c ? '  ok  ' : '  FAIL'} ${m}`); if (!c) fails.push(m); return c; };

async function open(url, vp, settings) {
  const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
  const ctx = await browser.newContext(contextOptions(vp));
  if (settings) await ctx.addInitScript((s) => { try { const cur = JSON.parse(localStorage.getItem('bloodnocturne_settings') || '{}'); localStorage.setItem('bloodnocturne_settings', JSON.stringify({ settingsVersion: 2, ...cur, ...s })); } catch { /* */ } }, settings);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push('[console] ' + m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${port}/${url}`);
  const cdp = await ctx.newCDPSession(page);
  return { browser, page, errs, cdp, close: () => browser.close() };
}
const ready = (page, id) => page.waitForFunction((id) => window.__v2?.id === id && (id === 'a' || window.__v2.ready || window.__v2.error), id, { timeout: 45000 });

// 시범판마다 다른 것(내부 이름)만 여기에 — 봇·측정은 공통
function installRef(id) {
  const v = window.__v2, g = window.__game, sc = v.scene;
  const A = id === 'a';
  const R = (window.__ref = {
    id, wp: 0, it: 0, lx: 0, lz: 0, sx: 0, sz: 0, esc: 0, escZ: 1, deaths: 0, wasDead: false, minHp: 100, seen: [], wall: [], kills0: 0,
    route: A ? [[380, 60], [1180, 52], [1440, 62], [1770, 62], [2190, 92], [2190, 420], [2190, 1500], [2190, 1660]]
      : [[330, 120], [560, 182], [790, 190], [1230, 190], [1300, 182], [1480, 182], [1520, 130], [1720, 190], [1990, 190], [2190, 190], [2190, 420], [2190, 960], [2190, 1500], [2190, 1720], [2190, 1860]],
    reach: A ? [22, 128] : [18, 94], stand: A ? 86 : 56,
    // 조작만 볼 때: 길 위의 적을 치운다 (마당의 적은 남긴다 — 다 없애면 '끝' 이 된다)
    neutral() { if (A) sc.play.enemies = sc.play.enemies.filter((e) => e.group === 'yard'); else for (const e of sc.sim.enemies) if (!e.yard) e.dead = true; },
    restart() { if (A) v.restart(); else { sc.sim.reset(); sc.cam.snap = true; } },
    place(x, z) { if (A) { sc.play.hero.place(x, z); sc._cam(1, true); } else { const h = sc.sim.hero; h.x = x; h.z = z; h.vx = h.vz = h.vy = 0; h.safe = { x, z, y: h.y }; sc.cam.snap = true; } },
    heroRaw() { return A ? sc.play.hero : sc.sim.hero; },
    pose() { const h = R.heroRaw(); return A ? (h.state === 'free' && !h.onGround ? 'air' : h.state) : (!h.onGround ? 'air' : h.anim); },
    step(n, render) { return window.__qaStep(n, render); },
    // 한 번 반복 = 3틱. 마지막 틱은 그리고(render) 읽어 내어(getImageData) 그 프레임을 끝까지 래스터하게 한 시간을 잰다
    iter() {
      window.__qaStep(2, false);
      if (!A) sc.resK = 1;   // B 의 해상도 조절기는 3틱에 한 번 그리는 이 검사를 '느린 기기' 로 읽는다 → 같은 화소 수로 재려고 고정
      const now = g.__qaRealNow, t = now();
      window.__qaStep(1, true);
      try { g.ctx.getImageData(0, 0, 1, 1); } catch { /* */ }
      R.wall.push(now() - t);
      return R.think();
    },
    think() {
      const h = v.hero, E = v.enemies, sec = v.section, raw = R.heroRaw();
      R.it++;
      if (R.seen[R.seen.length - 1] !== sec) R.seen.push(sec);
      if (h.hp < R.minHp) R.minHp = h.hp;
      const dead = raw.state === 'dead' || raw.dead === true;
      if (dead && !R.wasDead) R.deaths++;
      R.wasDead = dead;
      const out = { ax: 0, az: 0, atk: false, jump: false, sec, hp: h.hp, x: Math.round(h.x), z: Math.round(h.z), y: Math.round(h.y), n: E.length, it: R.it };
      if (sec === 'done' || dead) { R.lx = h.x; R.lz = h.z; return out; }
      if (Math.hypot(h.x - R.lx, h.z - R.lz) > 200) { let ni = 0, nd = 1e9; R.route.forEach((w, i) => { const d = Math.hypot(w[0] - h.x, w[1] - h.z); if (d < nd) { nd = d; ni = i; } }); R.wp = ni; }
      R.lx = h.x; R.lz = h.z;
      let tg = null, bd = 1e9;
      for (const e of E) {
        const aw = e.awake ?? e.active, d = Math.hypot(e.x - h.x, (e.z - h.z) * 1.4);
        if (Math.abs((e.y || 0) - h.y) > 110) continue;
        if (!(aw ? d < 600 : d < 260)) continue;
        if (d < bd) { bd = d; tg = e; }
      }
      let tx, tz;
      if (tg) {
        const dx = tg.x - h.x, dz = tg.z - h.z, adx = Math.abs(dx);
        if (Math.abs(dz) <= 14 && adx <= R.reach[1] && adx >= R.reach[0]) { out.atk = true; if ((h.facing > 0) !== (dx > 0)) { tx = h.x + Math.sign(dx) * 40; tz = h.z; } else { tx = h.x; tz = h.z; } }
        else { tx = tg.x - Math.sign(dx || 1) * R.stand; tz = tg.z; }
      } else {
        let w = R.route[R.wp];
        if (Math.hypot(w[0] - h.x, w[1] - h.z) < 40 && R.wp < R.route.length - 1) w = R.route[++R.wp];
        tx = w[0]; tz = w[1];
      }
      const ex = tx - h.x, ez = tz - h.z, m = Math.hypot(ex, ez);
      if (m > 5) { out.ax = ex / m; out.az = ez / m; if (m < 30) { out.ax *= Math.max(0.45, m / 30); out.az *= Math.max(0.45, m / 30); } }
      if (R.it % 10 === 0) { if (!out.atk && m > 30 && Math.hypot(h.x - R.sx, h.z - R.sz) < 8) { R.esc = 14; R.escZ = -R.escZ; } R.sx = h.x; R.sz = h.z; }
      if (R.esc > 0) { R.esc--; out.az = R.escZ; out.ax *= 0.5; out.jump = R.esc % 7 > 3; }
      return out;
    },
  });
  return true;
}

// 터치 스틱·단추 (CDP) — 손가락 21 = 스틱, 11 = 공격, 12 = 점프, 13 = 대시
class Pad {
  constructor(t, page) { this.t = t; this.page = page; this.stick = false; this.held = {}; }
  async init() {
    const [w, h] = await this.page.evaluate(() => [innerWidth, innerHeight]);
    this.x0 = Math.round(w * 0.2); this.y0 = Math.round(h * 0.68);
    this.L = await padLayout(this.page);
    return this.L;
  }
  async axis(ax, az, R = 70) {
    if (!ax && !az) { if (this.stick) { await this.t.up(21); this.stick = false; } return; }
    if (!this.stick) { await this.t.down(21, this.x0, this.y0); this.stick = true; }
    await this.t.move(21, this.x0 + ax * R, this.y0 - az * R);
  }
  async px(dx, dy) { if (!this.stick) { await this.t.down(21, this.x0, this.y0); this.stick = true; } await this.t.move(21, this.x0 + dx, this.y0 + dy); }
  async btn(id, on) {
    const f = { attack: 11, jump: 12, dash: 13, pause: 14 }[id], b = this.L.buttons[id];
    if (!b) throw new Error('pad button missing: ' + id);
    if (on && !this.held[id]) { await this.t.down(f, b.cx, b.cy); this.held[id] = true; }
    else if (!on && this.held[id]) { await this.t.up(f); this.held[id] = false; }
  }
  async release() { await this.axis(0, 0); for (const id of Object.keys(this.held)) await this.btn(id, false); }
}
const stepN = (page, n, render = false) => page.evaluate(([n, r]) => window.__qaStep(n, r), [n, render]);
const hero = (page) => page.evaluate(() => { const h = window.__v2.hero; return { x: h.x, y: h.y, z: h.z, hp: h.hp }; });
const pct = (a, k) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * k))].toFixed(2) : 0; };

for (const id of PROTOS) {
  report[id] = {};
  for (const vp of VPS) {
    console.log(`\n== ${id.toUpperCase()} · ${vp} ==`);
    const R = (report[id][vp] = {});
    const s = await open(`index.html?scene=v2${id}&nosw`, vp);
    const { page } = s;
    try {
      await ready(page, id);
      await page.waitForTimeout(1500);
      const t = new Touch(s.cdp, page), pad = new Pad(t, page);
      await ensureTouchMode(t, page);
      await page.waitForTimeout(300);
      const L = await pad.init();
      const ids = Object.keys(L.buttons);
      R.view = await page.evaluate(() => { const g = window.__game; return { vw: g.viewW, vh: g.viewH, q: g.quality, cv: [g.canvas.width, g.canvas.height], fps: g.fps | 0 }; });
      R.pad = ids;
      ok(L.visible && ['attack', 'jump', 'dash', 'pause'].every((b) => ids.includes(b)) && !ids.includes('skill1') && !ids.includes('ult'), `가상 패드 보임, 단추 = ${ids.join(' ')} (화면 ${R.view.vw}×${R.view.vh}, 캔버스 ${R.view.cv.join('×')}, 화질 ${R.view.q}, 실시간 ${R.view.fps} fps)`);
      await freeze(page);
      await page.evaluate(installRef, id);
      await page.evaluate(() => { window.__ref.restart(); window.__ref.neutral(); window.__qaStep(3, true); });
      // ── 1) 스틱 8방향 (진짜 터치) ──
      const dirs = [['→', 1, 0], ['←', -1, 0], ['↑', 0, 1], ['↓', 0, -1], ['↗', 0.707, 0.707], ['↙', -0.707, -0.707], ['↖', -0.707, 0.707], ['↘', 0.707, -0.707]];
      const base = id === 'a' ? [300, 120] : [300, 130];
      R.dirs = {};
      let dirOk = true;
      for (const [nm, ax, az] of dirs) {
        await page.evaluate(([x, z]) => { window.__ref.place(x, z); window.__qaStep(2, false); }, base);
        const h0 = await hero(page);
        await pad.axis(ax, az); await stepN(page, 24);
        const h1 = await hero(page);
        await pad.axis(0, 0); await stepN(page, 8);
        const dx = Math.round(h1.x - h0.x), dz = Math.round(h1.z - h0.z);
        R.dirs[nm] = [dx, dz];
        const good = (ax ? Math.sign(dx) === Math.sign(ax) && Math.abs(dx) > 25 : Math.abs(dx) < 12) && (az ? Math.sign(dz) === Math.sign(az) && Math.abs(dz) > 15 : Math.abs(dz) < 12);
        if (!good) dirOk = false;
      }
      ok(dirOk, `스틱 8방향 (24틱 이동 x,z): ${Object.entries(R.dirs).map(([k, d]) => `${k}${d.join(',')}`).join('  ')}`);
      // 360° 인가 8방향 고정인가: 20° 기울인 스틱
      { await page.evaluate(([x, z]) => { window.__ref.place(x, z); window.__qaStep(2, false); }, base);
        const h0 = await hero(page); await pad.axis(Math.cos(Math.PI / 9), Math.sin(Math.PI / 9)); await stepN(page, 24); const h1 = await hero(page); await pad.axis(0, 0); await stepN(page, 8);
        R.tilt20 = [Math.round(h1.x - h0.x), Math.round(h1.z - h0.z)];
        console.log(`   스틱 20° 기울임 → x ${R.tilt20[0]}, z ${R.tilt20[1]}  (${Math.abs(R.tilt20[1]) > 8 ? '360° 아날로그' : '8방향 구역에 붙음'})`); }
      // 죽은 구역·아날로그: 오른쪽으로 n px 민 채 20틱
      R.dead = {};
      for (const px of [4, 8, 14, 22, 34, 50, 70]) {
        await page.evaluate(([x, z]) => { window.__ref.place(x, z); window.__qaStep(2, false); }, base);
        const h0 = await hero(page); await pad.px(px, 0); await stepN(page, 20); const h1 = await hero(page); await pad.axis(0, 0); await stepN(page, 6);
        R.dead[px] = Math.round(h1.x - h0.x);
      }
      console.log(`   스틱을 n px 밀고 20틱: ${Object.entries(R.dead).map(([k, d]) => `${k}px→${d}`).join('  ')}`);
      ok(R.dead[70] > 40 && R.dead[4] === 0, `죽은 구역: 4 px 는 안 움직임(${R.dead[4]}), 70 px 는 달림(${R.dead[70]})`);
      // ── 2) 단추 (진짜 터치) ──
      const press = async (b, hold, watch) => {
        await page.evaluate(([x, z]) => { window.__ref.place(x, z); window.__qaStep(4, false); }, base);
        const h0 = await hero(page), seen = new Set(); let maxY = 0, maxDx = 0;
        await pad.btn(b, true);
        for (let i = 0; i < watch; i++) { if (i === hold) await pad.btn(b, false); const r = await page.evaluate(() => { window.__qaStep(1, false); const h = window.__v2.hero; return { p: window.__ref.pose(), y: h.y, x: h.x }; }); seen.add(r.p); maxY = Math.max(maxY, r.y - h0.y); maxDx = Math.max(maxDx, Math.abs(r.x - h0.x)); }
        await pad.btn(b, false);
        return { seen: [...seen], maxY: Math.round(maxY), maxDx: Math.round(maxDx) };
      };
      R.attack = await press('attack', 4, 30); R.jump = await press('jump', 10, 60); R.dash = await press('dash', 4, 30);
      ok(R.attack.seen.some((p) => /att|atk|slash|combo|sw/i.test(p)), `공격 단추 → 자세 ${R.attack.seen.join(',')}`);
      ok(R.jump.maxY > 40, `점프 단추 → 최고 높이 ${R.jump.maxY}`);
      ok(R.dash.maxDx > 50, `대시 단추 → ${R.dash.maxDx} px (자세 ${R.dash.seen.join(',')})`);
      // 점프로 단상 위 (스틱 ↑ + 점프 단추)
      { const from = id === 'a' ? [900, 112] : [1050, 95];
        await page.evaluate(([x, z]) => { window.__ref.place(x, z); window.__qaStep(4, false); }, from);
        await pad.axis(0, 1); await pad.btn('jump', true); await stepN(page, 14); await pad.btn('jump', false); await stepN(page, 34); await pad.axis(0, 0); await stepN(page, 24);
        const h = await hero(page); R.platform = { y: Math.round(h.y), z: Math.round(h.z) };
        ok(R.platform.y === 72, `점프로 단상 위 (터치: 스틱 ↑ + 점프) → 높이 ${R.platform.y}, z ${R.platform.z}`); }
      // 구덩이 (스틱으로 걸어 들어감)
      { const from = id === 'a' ? [1470, 195] : [1770, 70];
        await page.evaluate(([x, z]) => { window.__ref.place(x, z); const h = window.__ref.heroRaw(); h.hp = 100; window.__qaStep(4, false); }, from);
        await pad.axis(1, 0); let lost = 0, n = 0;
        for (; n < 120 && !lost; n++) { await stepN(page, 1); lost = 100 - (await hero(page)).hp; }
        await pad.axis(0, 0); await stepN(page, 90, true);
        if (process.env.REF_DEBUG) console.log('   [debug] after pit', JSON.stringify(await page.evaluate(() => { const g = window.__game, i = g.input, T = i._touchVec, h = window.__ref.heroRaw(); return { T: [T.x, T.y, T.mag], ax: [i.axisX, i.axisY], mode: i.mode, an: [i.analogX, i.analogY], v: [h.vx, h.vz], st: h.state, down: ['left','right','up','down','jump','dash','attack'].filter((a) => i.down(a)) }; })), 'active touches', [...t.active.keys()]);
        const h = await hero(page); R.pit = { lost, hp: h.hp, x: Math.round(h.x), y: Math.round(h.y), z: Math.round(h.z), ticks: n };
        ok(lost > 0 && lost <= 20 && h.y === 0 && h.hp === 100 - lost, `구덩이: 체력 −${lost}, 가장자리 (${R.pit.x},${R.pit.z}) 에서 다시, 그 뒤 체력 ${h.hp}`); }
      // ── 3) 깊이 판정 훑기 ──
      R.depth = await page.evaluate((id) => {
        const v = window.__v2, sc = v.scene, inp = window.__game.input, out = {};
        const swing = (dz, dx) => {
          let q, h;
          if (id === 'a') { v.restart(); const P = sc.play; h = P.hero; q = P.enemies.find((x) => x.kindId === 'skeleton'); const far = P.enemies.filter((x) => x.group === 'yard').slice(0, 1); P.enemies = [q, ...far]; q.awake = false; q.hp = q.maxHp; h.place(300, 100); h.facing = 1; q.x = 300 + dx; q.z = 100 + dz; q.vx = q.vz = 0; }
          else { sc.sim.reset(); v.teleport('pillar'); h = sc.sim.hero; q = sc.sim.enemies[0]; h.z = 100; q.x = h.x + dx; q.z = h.z + dz; q.cd = 99; h.facing = 1; }
          const hp0 = q.hp;
          for (let i = 0; i < 26; i++) { inp.touch.set('attack', i < 3); window.__qaStep(1, false); }
          inp.touch.set('attack', false);
          return Math.round(hp0 - q.hp);
        };
        for (const dz of [0, 12, 20, 28, 36, 44, 52, 60, 68, 80, -28, -44, -68]) out[dz] = swing(dz, 70);
        window.__ref.restart(); window.__qaStep(2, false);
        return out;
      }, id);
      const lim = Math.max(...Object.entries(R.depth).filter(([, d]) => d > 0).map(([k]) => Math.abs(+k)));
      R.depthLimit = lim;
      console.log(`   깊이 판정 (적이 x +70, Δz 마다 한 번 휘두름 → 피해): ${Object.entries(R.depth).map(([k, d]) => `${k}:${d}`).join('  ')}  → 맞는 한계 |Δz| ≈ ${lim}`);
      ok(R.depth[0] > 0 && R.depth[20] > 0 && R.depth[80] === 0, `깊이 판정: Δz 0·20 맞음, 80 빗나감`);
      // ── 4) 처음부터 끝까지 (터치 스틱 + 공격 단추) ──
      if (!NO_PLAY) {
        await page.evaluate((id) => { window.__ref.restart(); if (id === 'b') window.__v2.perfFinish?.(true); window.__qaStep(3, true); const r = window.__ref; r.wp = 0; r.wall = []; r.seen = []; r.deaths = 0; r.minHp = 100; r.it = 0; }, id);
        let d = await page.evaluate(() => window.__ref.think());
        let atkOn = false; const T0 = Date.now(); let shotStreet = false;
        const MAXIT = 3200;
        for (let i = 0; i < MAXIT && d.sec !== 'done'; i++) {
          await pad.axis(d.ax, d.az);
          const wantAtk = d.atk && i % 2 === 0;
          if (wantAtk !== atkOn) { await pad.btn('attack', wantAtk); atkOn = wantAtk; }
          await pad.btn('jump', !!d.jump);
          d = await page.evaluate(() => window.__ref.iter());
          if (i % 300 === 299) console.log(`   … ${(i + 1) * 3} 틱  ${d.sec}  영웅 ${d.x},${d.z},${d.y}  체력 ${Math.round(d.hp)}  남은 적 ${d.n}`);
          if (SHOTS && vp === 'fold_open' && !shotStreet && d.atk) { shotStreet = true; await page.screenshot({ path: `${SHOTS}/${id}_live_fight.png` }); }
        }
        await pad.release();
        const b = await page.evaluate(() => { const r = window.__ref, v = window.__v2; return { seen: r.seen, deaths: r.deaths, minHp: r.minHp, ticks: r.it * 3, wall: r.wall, left: v.enemies.length, sec: v.section, js: v.stats.frameMs, st: v.stats }; });
        const order = ['street', 'corner', 'alley', 'yard', 'done']; let oi = 0; for (const x of b.seen) if (x === order[oi]) oi++;
        R.play = { sec: b.sec, ticks: b.ticks, gameSec: +(b.ticks / 60).toFixed(1), wallSec: +((Date.now() - T0) / 1000).toFixed(1), deaths: b.deaths, minHp: Math.round(b.minHp), left: b.left, seen: b.seen };
        R.frame = { n: b.wall.length, p50: pct(b.wall, 0.5), p95: pct(b.wall, 0.95), max: pct(b.wall, 1), js: b.js };
        if (id === 'b') { const G = b.st.gl || {}; R.gl = { draws: G.draws, tris: G.tris, texMB: +(G.texBytes / 1048576).toFixed(1), bufKB: Math.round(G.bufBytes / 1024), canvas: G.canvas, mode: b.st.mode, canvases: b.st.canvases, parts: b.st.parts, atlas: b.st.atlas }; }
        else R.cv = await page.evaluate(() => { const c = window.__v2.scene.R.canvases; let n = 0; for (const x of c) n += x.width * x.height * 4; return { n: c.length, mb: +(n / 1048576).toFixed(1), strips: window.__v2.stats.strips, faces: window.__v2.stats.faces }; });
        ok(b.sec === 'done' && oi === order.length, `터치 봇이 끝까지: ${R.play.gameSec}초(게임) · 구간 ${b.seen.join('→')} · 쓰러짐 ${b.deaths} · 최저 체력 ${R.play.minHp} · 남은 적 ${b.left}`);
        console.log(`   프레임 시간 (틱 + 그리기 + 읽어 내기, 소프트웨어 렌더러, n ${R.frame.n}): p50 ${R.frame.p50} ms · p95 ${R.frame.p95} ms · 최대 ${R.frame.max} ms | 장면이 잰 값 p50 ${b.js.p50} / p95 ${b.js.p95}`);
        if (R.gl) console.log(`   B: 그리기 호출 ${R.gl.draws} · 삼각형 ${R.gl.tris} · 텍스처 ${R.gl.texMB} MB · 버퍼 ${R.gl.bufKB} KB · GL 캔버스 ${R.gl.canvas?.join('×')} · 방식 ${R.gl.mode}`);
        if (R.cv) console.log(`   A: 장면 캔버스 ${R.cv.n}장 ${R.cv.mb} MB · 띠 ${R.cv.strips} · 면 ${R.cv.faces}`);
        // 끝 표시 → 다시 시작 (터치)
        await stepN(page, 110, true);
        if (SHOTS && vp === 'fold_open') await page.screenshot({ path: `${SHOTS}/${id}_done_banner.png` });
        if (SHOTS && vp === 'phone2') await page.screenshot({ path: `${SHOTS}/${id}_done_banner_phone2.png` });
        if (id === 'a') { const bt = await page.evaluate(() => { const g = window.__game, r = window.__v2.scene.btns.again, c = g.canvasRect, k = g.cssScale; return r ? { x: c.x + (r.x + r.w * 0.3) * k, y: c.y + (r.y + r.h / 2) * k } : null; }); if (bt) { await t.down(31, bt.x, bt.y); await stepN(page, 3); await t.up(31); } }
        else { await pad.btn('attack', true); await stepN(page, 3); await pad.btn('attack', false); }
        await stepN(page, 12, true);
        const again = await page.evaluate(() => ({ sec: window.__v2.section, n: window.__v2.enemies.length, hp: window.__v2.hero.hp }));
        R.restart = again;
        ok(again.sec === 'street' && again.n >= 16 && again.hp === 100, `끝 표시 뒤 터치로 다시 시작 → ${again.sec}, 적 ${again.n}, 체력 ${again.hp}`);
      }
      // ── 5) 일시정지 단추(터치) → 타이틀 → 다시 들어가기 ──
      await pad.release();
      await unfreeze(page);
      await page.waitForTimeout(400);
      const cv0 = await page.evaluate(() => document.querySelectorAll('canvas').length);
      await pad.btn('pause', true); await page.waitForTimeout(120); await pad.btn('pause', false); await page.waitForTimeout(500);
      if (id === 'a') {
        const bt = await page.evaluate(() => { const g = window.__game, r = window.__v2?.scene?.btns?.title, c = g.canvasRect, k = g.cssScale; return r ? { x: c.x + (r.x + r.w / 2) * k, y: c.y + (r.y + r.h / 2) * k } : null; });
        ok(!!bt, 'A: 일시정지 화면에 [타이틀로] 단추');
        if (SHOTS && vp === 'fold_open') await page.screenshot({ path: `${SHOTS}/a_pause.png` });
        if (bt) await t.tap(bt.x, bt.y, 80);
      }
      await page.waitForTimeout(1800);
      const out1 = await page.evaluate(() => ({ v2: typeof window.__v2, top: window.__game.scenes[window.__game.scenes.length - 1]?.constructor?.name, cv: document.querySelectorAll('canvas').length, pad: !!window.__game.padShown }));
      R.exit = { ...out1, cvBefore: cv0 };
      ok(out1.v2 === 'undefined' && /Title/.test(out1.top || ''), `일시정지 단추(터치) → 타이틀 (맨 위 ${out1.top}, __v2 ${out1.v2}, DOM 캔버스 ${cv0} → ${out1.cv})`);
      const mem = async () => { try { await s.cdp.send('HeapProfiler.collectGarbage'); } catch { /* */ } return page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576)); };
      const heap0 = await mem();
      for (let k = 0; k < 3; k++) {
        await page.evaluate((id) => window.__game.go('v2' + id, {}, { fade: false }), id);
        await ready(page, id); await page.waitForTimeout(700);
        await page.evaluate(() => window.__game.go('title', {}, { fade: false })); await page.waitForTimeout(400);
      }
      const heap1 = await mem();
      const out2 = await page.evaluate(() => ({ v2: typeof window.__v2, cv: document.querySelectorAll('canvas').length, top: window.__game.scenes[window.__game.scenes.length - 1]?.constructor?.name }));
      R.reenter = { ...out2, heap0, heap1 };
      ok(out2.v2 === 'undefined' && out2.cv === out1.cv, `3번 다시 들어갔다 나오기: DOM 캔버스 ${out1.cv} → ${out2.cv}, JS 힙 ${heap0} → ${heap1} MB`);
    } catch (e) { ok(false, `${id}/${vp}: ${String(e.message).slice(0, 300)}`); }
    R.errs = s.errs.slice(0, 6);
    ok(s.errs.length === 0, `페이지 오류 0${s.errs.length ? ' — ' + s.errs.slice(0, 3).join(' / ') : ''}`);
    await s.close();
  }
  // ── v1 스테이지 → v2 → v1 스테이지 (같은 페이지) ──
  {
    console.log(`\n== ${id.toUpperCase()} · v1 s01 → v2${id} → v1 s01 ==`);
    const s = await open('index.html?scene=stage&stage=s01&nosw', 'fold_open');
    try {
      await s.page.waitForFunction(() => window.__game?.world?.player, null, { timeout: 45000 });
      await s.page.waitForTimeout(1200);
      await s.page.evaluate((id) => window.__game.go('v2' + id, {}, { fade: false }), id);
      await ready(s.page, id); await s.page.waitForTimeout(1500);
      await s.page.evaluate(() => window.__game.go('stage', { stageId: 's01', roomId: null }, { fade: false }));
      await s.page.waitForFunction(() => window.__game?.world?.player && typeof window.__v2 === 'undefined', null, { timeout: 30000 });
      await s.page.waitForTimeout(800);
      const x0 = await s.page.evaluate(() => window.__game.world.player.x);
      await s.page.keyboard.down('ArrowRight'); await s.page.waitForTimeout(900); await s.page.keyboard.up('ArrowRight');
      await s.page.keyboard.press('KeyX'); await s.page.waitForTimeout(400);
      const x1 = await s.page.evaluate(() => window.__game.world.player.x);
      report[id].v1after = { moved: Math.round(x1 - x0), errs: s.errs.slice(0, 4) };
      if (SHOTS) await s.page.screenshot({ path: `${SHOTS}/${id}_v1_after.png` });
      ok(x1 - x0 > 40 && s.errs.length === 0, `v2${id} 를 거친 뒤 v1 s01: 영웅 +${Math.round(x1 - x0)} px, 오류 ${s.errs.length}${s.errs.length ? ' — ' + s.errs[0] : ''}`);
    } catch (e) { ok(false, `v1 after v2${id}: ${String(e.message).slice(0, 200)} ${s.errs[0] || ''}`); }
    await s.close();
  }
}

// ── 6) 같은 8자리 캡처 (fold_open, 화질 높음) ──
if (SHOTS) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const SPOTS = {
    a: [
      ['1_street', 'P.hero.place(300,120); P.hero.facing=1;', 24],
      ['2_behind_pillar', 'P.hero.place(466,178); P.hero.facing=-1;', 24],
      ['3_on_platform', 'for(const e of P.enemies) if(e.x<1300) e.awake=false; P.hero.place(900,200); P.hero.facing=-1;', 6],
      ['4_by_pit', 'P.hero.place(1452,176); P.hero.facing=1;', 10],
      ['5_corner', 'P.hero.place(2150,250); P.hero.facing=1;', 10],
      ['6_alley', 'P.hero.place(2190,430); P.hero.facing=1;', 10],
      ['7_stairs', 'P.hero.place(2190,650); P.hero.facing=1;', 10],
      ['8_yard_fight', 'P.hero.place(2190,1700); P.hero.facing=1;', 100],
    ],
    b: [
      ['1_street', "sim.reset(); v.teleport('street');", 24],
      ['2_behind_pillar', "sim.reset(); v.teleport('pillar'); sim.hero.x = 688; sim.hero.z = 152; sim.hero.facing = -1;", 24],
      ['3_on_platform', "sim.reset(); v.teleport('platform'); hold({ right: true }, 62);", 10],
      ['4_by_pit', "sim.reset(); v.teleport('pit'); sim.hero.x = 1770; sim.hero.z = 150;", 30],
      ['5_corner', "sim.reset(); v.teleport('pit'); sim.hero.x = 1840; sim.hero.z = 200; step(40); hold({ right: true }, 52);", 0],
      ['6_alley', "sim.reset(); v.teleport('alley');", 50],
      ['7_stairs', "sim.reset(); v.teleport('stairs'); hold({ up: true }, 34);", 10],
      ['8_yard_fight', "sim.reset(); v.teleport('yard'); sim.hero.z = 1700;", 100],
    ],
  };
  for (const id of PROTOS) {
    console.log(`\n== shots ${id} (fold_open, 화질 높음) ==`);
    const s = await open(`index.html?scene=v2${id}&nosw`, 'fold_open', { quality: 'high' });
    try {
      await ready(s.page, id); await s.page.waitForTimeout(1800);
      const t = new Touch(s.cdp, s.page); await ensureTouchMode(t, s.page); await s.page.waitForTimeout(300);
      await freeze(s.page);
      await s.page.evaluate(() => window.__qaStep(20, true));
      for (const [name, js, n] of SPOTS[id]) {
        await s.page.evaluate(([id, js, n]) => {
          const g = window.__game, v = window.__v2, sc = v.scene, inp = g.input;
          const step = (k) => window.__qaStep(k, false);
          const hold = (keys, k) => { inp.setAutoSource(() => keys); step(k); inp.setAutoSource(null); step(1); };
          if (id === 'a') { (0, eval)(`(P,v)=>{${js}}`)(sc.play, v); sc._cam(1, true); }
          else { (0, eval)(`(sim,v,hold,step)=>{${js}}`)(sc.sim, v, hold, step); if (!/hold\(/.test(js)) sc.cam.snap = true; }
          for (let i = 0; i < n; i++) window.__qaStep(1, i % 4 === 0);
          window.__qaStep(1, true);
        }, [id, js, n]);
        await s.page.waitForTimeout(150);
        await s.page.evaluate(() => { const g = window.__game; g.__qaRender.call(g); });
        await s.page.waitForTimeout(80);
        await s.page.screenshot({ path: `${SHOTS}/${id}_${name}.png` });
        console.log('   shot', id, name);
      }
      const q = await s.page.evaluate(() => { const g = window.__game; return { q: g.quality, cv: [g.canvas.width, g.canvas.height] }; });
      report[id].shots = q;
      ok(s.errs.length === 0, `캡처 중 페이지 오류 0 (화질 ${q.q}, 캔버스 ${q.cv.join('×')})${s.errs.length ? ' — ' + s.errs[0] : ''}`);
    } catch (e) { ok(false, `shots ${id}: ${String(e.message).slice(0, 200)}`); }
    await s.close();
  }
}
await new Promise((r) => srv.close(() => r()));
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ at: new Date().toISOString(), fails, report }, null, 1));
console.log(fails.length ? `\nFAIL ${fails.length}\n - ` + fails.join('\n - ') : '\nPASS');
process.exit(fails.length ? 1 : 0);
