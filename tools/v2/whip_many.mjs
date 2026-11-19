// WHIP2 lane — many things struck in ONE tick: how many sounds the game asks for, how many the audio engine starts, when, how loud,
// and the peak of the mix at the loudest moment of the game (a finishing hit through six soldiers with seven breakables in the same tick).
//   node tools/v2/whip_many.mjs [--out /tmp/claude-0/v2/whip2] [--tag after]
// Offline and exact: the game's own audio engine (src/core/audio.js Engine: mixer, compressor, limiter, room) in an OfflineAudioContext with the
// feel table's real samples, as tools/v2/sound_check.mjs renders it; every ask of one tick is made at one instant of the audio clock (what a
// device does: a rule tick takes well under one audio quantum). The engine's own budget is set per quality as the game sets it (10 / 8 / 6
// feel starts per 100 ms). Nothing here depends on how the spread is written - it calls FeelSound.hit / play / swing as the scene does and
// records FeelSound.fire - so the same file measures the tree before and after a change.
//   struck   things struck in the tick (calls of hit() or play())      asked  calls that reached the engine      started  voices it started
//   at ms    start of each voice after the tick       level  its level factor       peak / pre  the mix after / before compressor and limiter (dBFS)
// Pass (the last lines): at every quality the flurry starts min(struck, FLURRY cap of that quality) voices per bus in rising time and falling
// level, a finishing blow sounds at once and at full level, and the loudest moment stays under -0.1 dBFS with no clipped sample.
// Writes <out>/many_<tag>.json. Exit 1 on a failed line.
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { m4aToWav } from '../audio/m4a_route.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const OUT = opt('out', '/tmp/claude-0/v2/whip2'), TAG = opt('tag', 'after');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (!cond) fails++; };

const T = await import(path.join(root, 'src/v2/feel/table.js'));
const { LISTENER } = await import(path.join(root, 'tools/v2/sound_demos.js'));
const used = T.usedSources(), F = T.FLAG;
const at = (i, n) => ({ x: -90 + (240 * i) / Math.max(1, n - 1), y: 50, z: 20 + (i % 3) * 22 });   // an arc in front of the hero
const hits = (n, st, fl, last = fl) => Array.from({ length: n }, (_, i) => ({ c: 'hit', a: ['whip', 'bone', st, i === n - 1 ? last : fl], pos: at(i, n) }));
const JARS = ['break.clay', 'break.clay.b', 'break.clay.c', 'break.crate', 'break.clay', 'break.barrel', 'break.clay.b'];
const jars = (n) => Array.from({ length: n }, (_, i) => ({ c: 'play', a: [JARS[i % JARS.length]], pos: at(i, n) }));
const wake = (A) => A.flatMap((h) => [h, { c: 'play', a: ['enemy.skel.rattle'], pos: h.pos }]);   // a sleeping soldier struck: its hit, then its rattle
const SC = [
  { id: 'light6', what: 'first hit (light) through 6 soldiers', ticks: [{ t: 0, asks: [{ c: 'swing', a: ['whip', 'L'], pos: at(0, 1) }] }, { t: 0.1, asks: hits(6, 'L', 0) }], dur: 1.4 },
  { id: 'light6wake', what: 'first hit (light) through 6 sleeping soldiers (hit + rattle each)', ticks: [{ t: 0, asks: [{ c: 'swing', a: ['whip', 'L'], pos: at(0, 1) }] }, { t: 0.1, asks: wake(hits(6, 'L', 0)) }], dur: 1.6 },
  { id: 'light10', what: 'first hit (light) through 10 soldiers', ticks: [{ t: 0.1, asks: hits(10, 'L', 0) }], dur: 1.4 },
  { id: 'jars7', what: '7 breakables broken in one tick', ticks: [{ t: 0.1, asks: jars(7) }], dur: 1.8 },
  { id: 'two_ticks', what: '3 breakables, 3 more one tick (16.7 ms) later', ticks: [{ t: 0.1, asks: jars(3) }, { t: 0.1 + 1 / 60, asks: jars(3) }], dur: 1.8 },
  { id: 'loudest', what: 'finishing third hit through 6 soldiers (5 killed + the finisher) + 7 breakables, same tick', loud: true,
    ticks: [{ t: 0, asks: [{ c: 'swing', a: ['whip', 'F'], pos: at(0, 1) }] }, { t: 0.1, asks: [...hits(6, 'F', F.kill, F.kill | F.finisher), ...jars(7)] }], dur: 3.2 },
  { id: 'loudest_first', what: 'the same, the finisher struck first', loud: true,
    ticks: [{ t: 0, asks: [{ c: 'swing', a: ['whip', 'F'], pos: at(0, 1) }] }, { t: 0.1, asks: [...hits(6, 'F', F.kill, F.kill | F.finisher).reverse(), ...jars(7)] }], dur: 3.2 },
];

const srv = await start(0), port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
let rows = [], caps = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await ctx.addInitScript(() => { window.__BN_AUDIO_CODECS = ['m4a']; });
  await ctx.route(/\/assets\/(audio|v2\/audio)\/.+\.m4a(\?.*)?$/, (r) => {
    const file = path.join(root, decodeURIComponent(new URL(r.request().url()).pathname));
    if (!file.startsWith(path.join(root, 'assets')) || !fs.existsSync(file)) return r.fulfill({ status: 404, body: '' });
    try { return r.fulfill({ status: 200, contentType: 'audio/wav', body: m4aToWav(file).wav }); } catch (e) { return r.fulfill({ status: 500, body: String(e.message || e) }); }
  });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route('**/__many__.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>many</title>' }));
  await page.goto(`http://localhost:${port}/__many__.html`);
  caps = await page.evaluate(async ({ oldNames }) => {
    const A = await import('/src/core/audio.js'), Fm = await import('/src/v2/feel/index.js'), S = await import('/src/v2/feel/sound.js');
    const SR = 48000, WARM = 0.3, dc = new OfflineAudioContext(2, SR, SR);
    const v2 = new A.V2Bank(); v2.ctx = dc; v2.rate = 32000; v2.lazyRate = 24000; await v2.index(); await v2.load(oldNames);   // as a phone decodes them
    const bank = new A.V2Bank(Fm.NEW_DIR); bank.ctx = dc; bank.rate = 32000; bank.lazyRate = 24000; const ix = await bank.index(); if (ix) await bank.load(ix.names);
    const CAP = { high: 10, medium: 8, low: 6 }, db = (v) => (v > 1e-9 ? 20 * Math.log10(v) : -180);
    window.__many = async ({ ticks, dur, q, listener }) => {
      const oc = new OfflineAudioContext(4, Math.ceil(SR * (dur + WARM)), SR);
      const eng = new A.Engine(oc); eng.setVolumes(0.6, 0.8); eng.v2 = v2; eng.v2Quality = q;
      const sp = oc.createChannelSplitter(2), mg = oc.createChannelMerger(4); eng.master.connect(sp); sp.connect(mg, 0, 2); sp.connect(mg, 1, 3); mg.connect(oc.destination);   // channels 2 and 3 = before the master compressor
      const host = { eng, quality: q, sfx(n, o) { eng.feelCap = CAP[q]; eng.sfx(n, o); }, duck(a, t) { eng.duck(a, t); } };
      const fsnd = new Fm.FeelSound(host); fsnd.bank = bank; fsnd.bankP = Promise.resolve(); fsnd.setListener(...listener); fsnd.setRoom('courtyard');
      const rec = []; let cur = null; const fire0 = fsnd.fire.bind(fsnd);
      fsnd.fire = (r, bus, pos, vol = 1, pitch = 1, delay = 0) => { const st = fire0(r, bus, pos, vol, pitch, delay); rec.push({ bus, ms: Math.round((oc.currentTime - WARM - ticks[cur.i].t0 + delay) * 1000), vol: +(+vol).toFixed(2), started: st, tick: cur.i, ask: cur.k, big: !!r.big }); return st; };
      const struck = { f3_hit: 0, f3_enemy: 0, other: 0 };
      ticks.forEach((tk, i) => { const k = Math.max(1, Math.round((WARM + tk.t) * SR / 128)); tk.t0 = tk.t;
        oc.suspend(k * 128 / SR).then(() => { cur = { i, k: 0 };
          for (const e of tk.asks) { cur.k++; try { if (e.c === 'hit') { struck.f3_hit++; fsnd.hit(e.a[0], e.a[1], e.a[2], e.a[3], e.pos); } else if (e.c === 'play') { struck.f3_enemy++; fsnd.play(e.a[0], e.pos); } else { struck.other++; fsnd.swing(e.a[0], e.a[1], e.pos); } } catch (err) { console.error(String(err && err.message)); } }
          oc.resume(); }); });
      const buf = await oc.startRendering(), skip = Math.round(WARM * SR), Lc = buf.getChannelData(0).subarray(skip), Rc = buf.getChannelData(1).subarray(skip), P0 = buf.getChannelData(2).subarray(skip), P1 = buf.getChannelData(3).subarray(skip);
      let pk = 0, pre = 0, clip = 0; for (let i = 0; i < Lc.length; i++) { const m = Math.max(Math.abs(Lc[i]), Math.abs(Rc[i])); if (m > pk) pk = m; if (m >= 0.999) clip++; const p = Math.max(Math.abs(P0[i]), Math.abs(P1[i])); if (p > pre) pre = p; }
      return { rec, struck, peak: +db(pk).toFixed(2), pre: +db(pre).toFixed(2), clip, eng: { ...eng.stats } };
    };
    return S.FLURRY ? JSON.parse(JSON.stringify(S.FLURRY)) : null;
  }, { oldNames: used.old });
  for (const s of SC) for (const q of ['high', 'medium', 'low']) { const r = await page.evaluate((a) => window.__many(a), { ticks: s.ticks, dur: s.dur, q, listener: LISTENER }); rows.push({ id: s.id, what: s.what, q, loud: !!s.loud, ...r }); }
  if (errs.length) { console.log('page errors:', errs.slice(0, 3).join(' | ')); fails++; }
} finally { await browser.close(); srv.close(); }

const QI = { low: 0, medium: 1, high: 2 }, bus = (r, re) => r.rec.filter((x) => re.test(x.bus));
console.log(`\nmany at once (${TAG}) — struck / reached the engine / started, start after the tick in ms (level)`);
for (const r of rows) {
  const line = (label, re, n) => { const A = bus(r, re); if (!n && !A.length) return ''; const st = A.filter((x) => x.started); return `${label} ${n} / ${A.length} / ${st.length}  at ${st.map((x) => `${x.ms}${x.big ? '!' : ''}(${x.vol})`).join(' ')}`; };
  console.log(`${r.id.padEnd(14)} ${r.q.padEnd(6)} ${line('hits', /f3_hit|f3_big/, r.struck.f3_hit)}${r.struck.f3_enemy ? '\n' + ' '.repeat(22) + line('enemy bus', /f3_enemy/, r.struck.f3_enemy) : ''}\n${' '.repeat(22)}peak ${r.peak} dBFS · before the limiter ${r.pre} dBFS · clipped samples ${r.clip} · engine dropped ${r.eng.dropped}`);
}
console.log('');
for (const r of rows) {
  const H = bus(r, /f3_hit|f3_big/).filter((x) => x.started), E = bus(r, /f3_enemy/).filter((x) => x.started), qi = QI[r.q];
  if (caps) {
    const wantH = Math.min(r.struck.f3_hit, caps.hit[qi] + (H.some((x) => x.big) ? 1 : 0)), wantE = Math.min(r.struck.f3_enemy, caps.enemy[qi]);
    if (r.struck.f3_hit) ok(`${r.id} ${r.q}: ${r.struck.f3_hit} struck start ${H.length} hit sounds`, H.length === wantH, `cap ${caps.hit[qi]} a flurry at ${r.q}`);
    if (r.struck.f3_enemy && r.id !== 'two_ticks') ok(`${r.id} ${r.q}: ${r.struck.f3_enemy} things start ${E.length} sounds on the enemy bus`, E.length === wantE, `cap ${caps.enemy[qi]}`);
    if (r.id === 'two_ticks') ok(`${r.id} ${r.q}: six breaks over two ticks start ${E.length} (the queue holds ${caps.enemy[qi]} slots ahead), one slot apart`, E.length === 3 + Math.min(3, caps.enemy[qi] - 2) && E.every((x, i) => i === 0 || x.ms + (x.tick ? 17 : 0) - (E[i - 1].ms + (E[i - 1].tick ? 17 : 0)) >= 20), E.map((x) => x.ms + (x.tick ? 17 : 0)).join(' / ') + ' ms');
    const small = H.filter((x) => !x.big);
    if (small.length > 1) ok(`${r.id} ${r.q}: the hit sounds are spread and each quieter`, small.every((x, i) => i === 0 || (x.ms > small[i - 1].ms && x.vol < small[i - 1].vol)), small.map((x) => `${x.ms} ms x${x.vol}`).join(', '));
    const big = H.find((x) => x.big); if (big) ok(`${r.id} ${r.q}: the finishing blow sounds on the tick at full level`, big.ms <= 1 && big.vol >= 1, `${big.ms} ms x${big.vol}`);
  }
  if (r.loud) ok(`${r.id} ${r.q}: the loudest moment does not clip`, r.clip === 0 && r.peak < -0.1, `peak ${r.peak} dBFS, ${r.pre} dBFS before the limiter`);
}
if (!caps) console.log('(no FLURRY export in src/v2/feel/sound.js: the tree before the change - table only, the caps are not judged)');
fs.writeFileSync(path.join(OUT, `many_${TAG}.json`), JSON.stringify({ tag: TAG, caps, rows }, null, 1));
console.log(fails ? `\n${fails} FAILED` : '\nALL OK'); process.exit(fails ? 1 : 0);
