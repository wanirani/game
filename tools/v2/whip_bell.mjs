// WHIP lane — THE BELL THAT WILL NOT ANSWER, measured: the refusal of a long ring at three bells, on two screens (one browser, game advanced by ticks).
//   node tools/v2/whip_bell.mjs [--tag after] [--devices fold_open,phone2] [--cases nofloor,sealed,held] [--out /tmp/claude-0/v2/whip2/bell] [--res 0.6]
//                               [--saves /tmp/claude-0/v2/pre13/chapter/saves] [--base <commit>: crossing.js, the feel table and motion.js of that commit under today's scene]
//   nofloor  no story: a bell of eshville_now whose other night is made to answer "nowhere to stand" (the crossing's own refusal)
//   sealed   the story from the bot's save after ev_knells_done (= before ev_bell_sealed): the sealed bell of the 1697 arena
//   held     the story from the bot's save after ev_boss_intro: the hall's bell tonight while the queen is in her first act - and awake, striking
// The hero is set beside the bell and the pad's bell button is HELD through the pad's own pointer handlers until the long ring is full. From that tick on,
// 40 ticks: every tick is drawn and compared - mean absolute change of the picture (0..255, all pixels of the 3D canvas, 480 px wide copy) against the tick
// before ("step") and against the last picture before the bell was full ("off"); a still of every sixth frame goes onto a sheet. Also read from the game:
// which sounds were asked for (the golden toll must stay out, the dull toll must come once), the vibration, the shake, the hero's recoil, the badge's two
// beats, the notice, when the hero is free again, and whether he was hurt in between. Writes <out>/<tag>_<device>_<case>.png and <out>/<tag>.json.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { launch, argsOf, install } from './whip_lib.mjs';

const args = argsOf(process.argv), TAG = String(args.tag || 'now'), OUT = String(args.out || '/tmp/claude-0/v2/whip2/bell'), RES = String(args.res || '0.6'), SAVES = String(args.saves || '/tmp/claude-0/v2/pre13/chapter/saves');
const DEVS = String(args.devices || 'fold_open,phone2').split(','), CASES = String(args.cases || 'nofloor,sealed,held').split(','), BASE = args.base ? String(args.base) : null;
const T0 = Date.now(), log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
let fails = 0; const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };
fs.mkdirSync(OUT, { recursive: true });

/** in the page: stand at the bell, hold the bell button, record 40 ticks from the full ring */
async function ring(o) {
  const v = window.__v2, sc = v.scene, W = window.__W, g = window.__game, sim = sc.sim, h = sim.hero, cx = sc.cx, { feel } = await import('/src/v2/feel/index.js');
  cx.shutNow ??= () => false; cx.refuse ??= () => false;   // (--base: an older crossing.js under today's scene)
  W.drawEvery = 0; W.keepHp = false;
  // the bell: by its story event, else the nearest one
  const S = sc.people.spots.filter((q) => q.def.kind === 'bell'); let bell = S.find((q) => o.event && q.def.event === o.event) ?? null;
  if (!bell && o.id) bell = S.find((q) => q.id === o.id || q.def.id === o.id) ?? null;
  if (!bell) { let best = 1e18; for (const q of S) { const d = (q.x - h.x) ** 2 + (q.z - h.z) ** 2; if (d < best) { best = d; bell = q; } } }
  if (!bell) return { skip: 'no bell in ' + v.area + ' (bells: ' + S.map((q) => q.def.event).join(',') + ')' };
  // a free spot beside it (on the hero's present level when there is one)
  let spot = null; for (const d of [56, 70, 44, 90]) { for (let k = 0; k < 12 && !spot; k++) { const a = (k * Math.PI) / 6 + 0.26, x = bell.x + Math.cos(a) * d, z = bell.z + Math.sin(a) * d, gy = W.ground(x, z); if (!Number.isFinite(gy) || Math.abs(gy - bell.y) > 30) continue; if (sim.clearLine && !sim.clearLine(x, z, bell.x + Math.cos(a) * (bell.r ?? 20), bell.z + Math.sin(a) * (bell.r ?? 20), gy + 40)) continue; spot = [x, z]; } if (spot) break; }
  if (!spot) return { skip: 'no free spot beside the bell' };
  for (let i = 0; i < 30 && (sc.hud.modal || (sc.host && sc.host.locks())); i++) g.tick(1 / 60);
  W.put(spot[0], spot[1], bell.x - spot[0], bell.z - spot[1]); h.bellCd = 0; h.hp = h.hpMax; h.ifr = 0;
  if (o.noFloor) { const b = cx._build; cx._build = async function () { await this._yield(); cx._build = b; return { pre: null, spot: null }; }; cx.early = null; }
  for (let i = 0; i < 12; i++) g.tick(1 / 60);
  // what the game is asked to do
  const rec = { snd: [], hap: [], fxn: [], toast: [], ring: -1 }; let ti = 0;
  const fire0 = feel.sound.play.bind(feel.sound); feel.sound.play = (name, ...r) => { rec.snd.push([ti, name]); return fire0(name, ...r); };
  const hap0 = feel.haptics.play.bind(feel.haptics); feel.haptics.play = (n) => { rec.hap.push([ti, n]); return hap0(n); };
  const toast0 = sc._toast.bind(sc); sc._toast = (t, k) => { rec.toast.push([ti, String(t)]); return toast0(t, k); };
  const ev0 = sim.hooks.event; sim.hooks.event = function (name, ...r) { if (name === 'ringLong' && rec.ring < 0) rec.ring = ti; return ev0.call(this, name, ...r); };
  const F = sc.fx.feel, glc = sc.glr.canvas, SW = 480, SH = Math.round(480 * glc.height / glc.width), sm = document.createElement('canvas'); sm.width = SW; sm.height = SH; const sx = sm.getContext('2d', { willReadFrequently: true });
  const grab = () => { g.alpha = 1; g.render(); sx.drawImage(glc, 0, 0, SW, SH); return sx.getImageData(0, 0, SW, SH).data; };
  const diff = (a, b) => { let s = 0, m = 0, n = 0; for (let i = 0; i < a.length; i += 4) { const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; s += d; if (d > m) m = d; if (d > 12) n++; } return [s / (a.length / 4), m, n / (a.length / 4)]; };
  const CW = 400, CH = Math.round(400 * glc.height / glc.width), sheet = document.createElement('canvas'); sheet.width = CW * 4; sheet.height = (CH + 16) * 2; const cs = sheet.getContext('2d'); cs.fillStyle = '#000'; cs.fillRect(0, 0, sheet.width, sheet.height);
  const hud = sc.layer && sc.layer.hud ? sc.layer.hud : g.canvas;
  // the long press: down, hold until the ring is full
  let foe = null; if (o.strike) { foe = sim.enemies.find((e) => e.def.boss && !e.dead) ?? null; }
  W.down('bell');
  let hp0 = h.hp, off = null, prev = null, rows = [], cells = 0, hurt = 0, freeAt = -1, hurtTicks = [];
  for (let i = 0; i < 150; i++) {
    ti = i; const hpB = h.hp;
    if (rec.ring < 0 && i % 6 === 0) { g.alpha = 1; g.render(); }
    if (rec.ring < 0) { h.hp = h.hpMax; h.ifr = Math.max(h.ifr, 0.1); }   // (nothing may break the wind-up of the test's ring; from the full ring on the hero is on his own)
    if (rec.ring < 0) off = (i % 2 === 0 && h.act === 'ring' && h.bellCharge > 0.8) ? grab() : off;
    g.tick(1 / 60);
    if (rec.ring >= 0) {
      if (i === rec.ring) { W.up('bell'); if (!off) off = grab(); prev = off; hp0 = h.hp; }
      const k = i - rec.ring; if (h.hp < hpB) { hurt += hpB - h.hp; hurtTicks.push(k); }
      const px = grab(), dS = diff(px, prev), dO = diff(px, off); prev = px;
      if (freeAt < 0 && k > 0 && !h.act && !sc.locked && !(sc.host && sc.host.locks()) && sc.hud.modal !== 'dialog') freeAt = k;
      rows.push({ k, step: +dS[0].toFixed(2), off: +dO[0].toFixed(2), offMax: Math.round(dO[1]), offArea: +(dO[2] * 100).toFixed(1), phase: cx.phase || '-', R: Math.round(cx.R), beat: +(sc.state.cross ? sc.state.cross.beat : 0).toFixed(2), no: +(sc.state.cross ? sc.state.cross.no ?? 0 : 0).toFixed(2), recoil: +(h.recoil ?? 0).toFixed(2), trauma: +(F.trauma ?? 0).toFixed(2), act: h.act, modal: sc.hud.modal ?? null, locked: !!sc.locked });
      if (k % 6 === 0 && cells < 8) { const X = (cells % 4) * CW, Y = Math.floor(cells / 4) * (CH + 16); cs.drawImage(glc, X, Y + 16, CW, CH); try { cs.drawImage(hud, X, Y + 16, CW, CH); } catch { /* no hud layer */ } cs.fillStyle = '#fff'; cs.font = '12px monospace'; cs.fillText(`+${k} ticks (${(k / 60).toFixed(2)} s)  change against "off" ${dO[0].toFixed(1)} / 255, ${(dO[2] * 100).toFixed(0)} % of the picture`, X + 4, Y + 12); cells++; }
      if (k >= 40) break;
    }
  }
  W.up('bell'); feel.sound.play = fire0; feel.haptics.play = hap0; sc._toast = toast0; sim.hooks.event = ev0;
  if (rec.ring < 0) return { skip: 'the long ring never became full (act ' + h.act + ', bellOk ' + h.bellOk + ', caps ' + JSON.stringify(sc._caps) + ')' };
  const R0 = rec.ring, rel = (a) => a.filter((q) => q[0] >= R0 - 1).map((q) => `+${q[0] - R0}:${q[1]}`);
  for (let i = 0; i < 30; i++) g.tick(1 / 60);
  return { area: v.area, bell: bell.def.event ?? bell.id, rows, snd: rel(rec.snd), hap: rel(rec.hap), toast: rel(rec.toast), freeAt, hurt, hurtTicks, foe: foe ? { state: foe.state, active: !!foe.active, d: Math.round(Math.hypot(foe.x - h.x, foe.z - h.z)) } : null, png: sheet.toDataURL('image/png'), size: [glc.width, glc.height] };
}

const CASE = {
  nofloor: { area: 'eshville_now', o: { id: 'big_bell', noFloor: true } },
  sealed: { save: '071_ev_knells_done.json', o: { event: 'bell.sealed' } },
  held: { save: '074_ev_boss_intro.json', o: { event: 'bell.ring', strike: true } },
};
let baseDir = null;
if (BASE) { baseDir = `${OUT}/base_${BASE}`; fs.rmSync(baseDir, { recursive: true, force: true }); fs.mkdirSync(baseDir, { recursive: true }); execSync(`git archive ${BASE} src/v2/game/crossing.js src/v2/feel src/v2/play/motion.js | tar -x -C ${baseDir}`, { cwd: new URL('../..', import.meta.url).pathname, shell: '/bin/bash' }); }
const L = await launch(OUT), all = {};
try {
  for (const dev of DEVS) {
    all[dev] = {};
    for (const c of CASES) {
      const C = CASE[c]; if (!C) continue;
      const page = await L.page(dev, { serviceWorkers: 'block' });
      if (BASE) await page.route(/\/src\/v2\/(game\/crossing\.js|feel\/[a-z]+\.js|play\/motion\.js)(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(baseDir + new URL(route.request().url()).pathname) }));
      try {
        if (C.area) await L.open(page, C.area, `&v2res=${RES}`);
        else {
          const sv = JSON.parse(fs.readFileSync(`${SAVES}/${C.save}`, 'utf8')).save;
          await page.addInitScript((s) => { try { if (window.top !== window) return; if (sessionStorage.getItem('__wb')) return; sessionStorage.setItem('__wb', '1'); localStorage.setItem('bn.v2.save', s); } catch { /* storage */ } }, JSON.stringify(sv));
          await page.goto(`http://localhost:${L.port}/index.html?scene=v2g&v2auto=0&v2res=${RES}`, { waitUntil: 'commit', timeout: 120000 });
          await page.waitForFunction(() => window.__v2 && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 }).catch(() => {});
          await page.waitForTimeout(1500);
          await page.evaluate(install);
          await page.evaluate(() => { const g = window.__game, sc = window.__v2.scene; for (let i = 0; i < 240 && (sc.hud.modal === 'dialog' || !sc.ready); i++) { try { sc.hud.tapDialog?.(); } catch { /* ui */ } g.tick(1 / 60); } });
        }
        await page.evaluate(`window.__ring = ${ring.toString()}`);
        const r = await page.evaluate((o) => window.__ring(o).catch((e) => ({ skip: 'error: ' + (e?.stack ?? e) })), C.o);
        if (r.skip) { log(`${dev} ${c}: skipped (${r.skip})`); all[dev][c] = r; }
        else {
          fs.writeFileSync(`${OUT}/${TAG}_${dev}_${c}.png`, Buffer.from(r.png.split(',')[1], 'base64')); delete r.png; all[dev][c] = r;
          const w = r.rows.filter((q) => q.k >= 1 && q.k <= 27), mx = (k) => Math.max(...w.map((q) => q[k])), dull = r.rows.filter((q) => q.phase === 'dull');
          log(`${dev} ${c} (${r.area}, bell ${r.bell}, 3D ${r.size.join('x')}): change per frame max ${mx('step')} / 255, against "off" max ${mx('off')} / 255 over ${mx('offArea')} % of the picture (strongest pixel ${mx('offMax')}) · dull phase ${dull.length} ticks (ring to ${Math.max(0, ...dull.map((q) => q.R))} px) · recoil max ${Math.max(...r.rows.map((q) => q.recoil))} · shake max ${Math.max(...r.rows.map((q) => q.trauma))} · badge beat max ${Math.max(...r.rows.map((q) => q.beat))} · free again +${r.freeAt} ticks (${(r.freeAt / 60).toFixed(2)} s) · hurt ${r.hurt}${r.foe ? ' · the queen: ' + r.foe.state + (r.foe.active ? ', awake' : ', asleep') + ', ' + r.foe.d + ' px away' : ''}`);
          log(`   sounds ${r.snd.join(' ')} · vibration ${r.hap.join(' ')} · notice ${r.toast.join(' ') || '-'}`);
          log(`   change against "off" by tick: ${r.rows.slice(0, 34).map((q) => q.off.toFixed(1)).join(' ')}`);
        }
      } catch (e) { L.errs.push(`[tool] ${dev} ${c}: ` + (e?.stack ?? e)); }
      await page.context().close();
    }
  }
} catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
await L.close();
fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(all, null, 1));
if (!BASE) for (const dev of DEVS) for (const c of CASES) {
  const r = all[dev]?.[c]; if (!r || r.skip) { ok(`${dev} ${c}: measured`, false, r?.skip ?? 'nothing'); continue; }
  const w = r.rows.filter((q) => q.k >= 1 && q.k <= 27), peak = Math.max(...w.map((q) => q.off)), n = r.snd.filter((q) => q.endsWith(':cross.dull')).length, toll = r.snd.some((q) => /^\+[0-3]:bell\.toll$/.test(q));
  ok(`${dev} ${c}: the refusal is seen - the picture changes by 6 of 255 or more against the moment before (it was under 2)`, peak >= 6, `peak ${peak}`);
  ok(`${dev} ${c}: one dull toll, the dull vibration, the hero thrown back, the shake, the badge's two beats`, n === 1 && r.hap.some((q) => q.endsWith(':dull')) && Math.max(...r.rows.map((q) => q.recoil)) >= 0.9 && Math.max(...r.rows.map((q) => q.trauma)) >= 0.2 && r.rows.filter((q, i) => i > 0 && q.beat > r.rows[i - 1].beat + 0.2).length + (r.rows[0].beat > 0.5 ? 1 : 0) >= 2, `dull tolls ${n} · golden toll with it: ${toll ? 'yes' : 'no'}`);
  ok(`${dev} ${c}: over inside 0.6 s - the dull phase is ended and nothing of it holds the hero`, r.rows.filter((q) => q.phase === 'dull').length <= 30 && !r.rows.some((q) => q.k > 36 && (q.phase === 'dull' || q.locked)), `free again +${r.freeAt} ticks`);
}
for (const e of L.errs) { console.log('ERR ' + e); fails++; }
console.log(fails ? `FAILED: ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
