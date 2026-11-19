// WHIP2-VERIFY lane — THE BELL THAT WILL NOT ANSWER, looked at: real screenshots of the whole page (3D + HUD + notice, as the player's screen shows it)
// around the refusal of a long ring, at the three bells, on two screens. Not the lane's whip_bell: no numbers from the game's own state decide anything
// here - the stills are for eyes; the page's pixels are compared by this tool (mean absolute change against the still just before the ring was full).
//   node tools/v2/whip_v2bell.mjs [--devices fold_open,phone2] [--cases nofloor,sealed,held] [--out /tmp/claude-0/v2/whip2verify/bell] [--res 0.75]
// Staging (which bell, which save) is the same as tools/v2/whip_bell.mjs: nofloor = eshville_now, the other night answers "nowhere to stand";
// sealed = the bot's save before ev_bell_sealed; held = the bot's save after ev_boss_intro, the hall's bell with the queen awake.
import fs from 'node:fs';
import { launch, argsOf, install } from './whip_lib.mjs';

const args = argsOf(process.argv), OUT = String(args.out || '/tmp/claude-0/v2/whip2verify/bell'), RES = String(args.res || '0.75'), SAVES = String(args.saves || '/tmp/claude-0/v2/pre13/chapter/saves');
const DEVS = String(args.devices || 'fold_open,phone2').split(','), CASES = String(args.cases || 'nofloor,sealed,held').split(',');
const T0 = Date.now(), log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
fs.mkdirSync(OUT, { recursive: true });

async function stage(o) {
  const v = window.__v2, sc = v.scene, W = window.__W, g = window.__game, sim = sc.sim, h = sim.hero, cx = sc.cx, { feel } = await import('/src/v2/feel/index.js');
  W.drawEvery = 0; W.keepHp = false;
  const S = sc.people.spots.filter((q) => q.def.kind === 'bell'), boss = sim.enemies.find((e) => e.def.boss && !e.dead) ?? null; let bell = S.find((q) => o.event && q.def.event === o.event) ?? null;
  if (o.strike && boss) { let best = 1e18; for (const q of S) { if (o.event && q.def.event !== o.event) continue; const d = (q.x - boss.homeX) ** 2 + (q.z - boss.homeZ) ** 2; if (d < best) { best = d; bell = q; } } }
  if (!bell && o.id) bell = S.find((q) => q.id === o.id || q.def.id === o.id) ?? null;
  if (!bell) { let best = 1e18; for (const q of S) { const d = (q.x - h.x) ** 2 + (q.z - h.z) ** 2; if (d < best) { best = d; bell = q; } } }
  if (!bell) return { skip: 'no bell in ' + v.area };
  let spot = null; for (const d of [56, 70, 44, 90]) { for (let k = 0; k < 12 && !spot; k++) { const a = (k * Math.PI) / 6 + 0.26, x = bell.x + Math.cos(a) * d, z = bell.z + Math.sin(a) * d, gy = W.ground(x, z); if (!Number.isFinite(gy) || Math.abs(gy - bell.y) > 30) continue; if (sim.clearLine && !sim.clearLine(x, z, bell.x + Math.cos(a) * (bell.r ?? 20), bell.z + Math.sin(a) * (bell.r ?? 20), gy + 40)) continue; spot = [x, z]; } if (spot) break; }
  if (!spot) return { skip: 'no free spot beside the bell' };
  for (let i = 0; i < 30 && (sc.hud.modal || (sc.host && sc.host.locks())); i++) g.tick(1 / 60);
  W.put(spot[0], spot[1], bell.x - spot[0], bell.z - spot[1]);
  h.bellCd = 0; h.hp = h.hpMax; h.ifr = 0; h.act = null; h.hurtT = 0;
  const B = (window.__B = { ring: -1, ti: 0, snd: [], hap: [], toast: [], hurt: 0, freeAt: -1, bell: bell.def.event ?? bell.id });
  if (o.noFloor) { const b = cx._build; cx.early = null; cx._build = async function () { await this._yield(); cx._build = b; return { pre: null, spot: null }; }; }
  for (let i = 0; i < 12; i++) g.tick(1 / 60);
  const play0 = feel.sound.play.bind(feel.sound); feel.sound.play = (name, ...r) => { B.snd.push([B.ti, name]); return play0(name, ...r); };
  const hap0 = feel.haptics.play.bind(feel.haptics); feel.haptics.play = (n) => { B.hap.push([B.ti, n]); return hap0(n); };
  const toast0 = sc._toast.bind(sc); sc._toast = (t, k) => { B.toast.push([B.ti, String(t)]); return toast0(t, k); };
  const ev0 = sim.hooks.event; sim.hooks.event = function (name, ...r) { if (name === 'ringLong' && B.ring < 0) B.ring = B.ti; return ev0.call(this, name, ...r); };
  W.down('bell');
  /** one tick (+ a turn for the twin night's build tasks), drawn. Before the ring is full the hero is kept whole; after it he is on his own */
  window.__step = async () => {
    const hp = h.hp; await new Promise((r) => setTimeout(r, 1));
    if (B.ring < 0) { h.hp = h.hpMax; h.ifr = Math.max(h.ifr, 0.1); }
    g.tick(1 / 60); B.ti++;
    if (B.ring >= 0 && B.ti - 1 === B.ring) W.up('bell');
    if (B.ring >= 0 && h.hp < hp) B.hurt += hp - h.hp;
    const k = B.ring >= 0 ? B.ti - 1 - B.ring : -1;
    if (B.freeAt < 0 && k > 0 && !h.act && !sc.locked && !(sc.host && sc.host.locks()) && sc.hud.modal !== 'dialog') B.freeAt = k;
    g.alpha = 1; g.render();
    return { k, ring: B.ring, charge: +(h.bellCharge ?? 0).toFixed(2), act: h.act, phase: cx.phase || '-', modal: sc.hud.modal ?? null, snd: B.snd.length, freeAt: B.freeAt, hurt: B.hurt };
  };
  return { area: v.area, bell: B.bell, spot };
}

const CASE = {
  nofloor: { area: 'eshville_now', o: { id: 'big_bell', noFloor: true } },
  sealed: { save: '071_ev_knells_done.json', o: { event: 'bell.sealed' } },
  held: { save: '074_ev_boss_intro.json', o: { event: 'bell.ring', strike: true } },
};
const L = await launch(OUT), all = {};
try {
  for (const dev of DEVS) for (const c of CASES) {
    const C = CASE[c]; if (!C) continue;
    const page = await L.page(dev, { serviceWorkers: 'block' });
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
      await page.evaluate(`window.__stage = ${stage.toString()}`);
      const st = await page.evaluate((o) => window.__stage(o).catch((e) => ({ skip: 'error: ' + (e?.stack ?? e) })), C.o);
      if (st.skip) { log(`${dev} ${c}: skipped (${st.skip})`); all[`${dev}_${c}`] = st; await page.context().close(); continue; }
      const shot = async (name) => { const f = `${OUT}/${dev}_${c}_${name}.jpg`; await page.screenshot({ path: f, type: 'jpeg', quality: 82, scale: 'css' }); return f; };
      let r = null, pre = null, n = 0;
      for (; n < 200; n++) { r = await page.evaluate(() => window.__step()); if (r.ring >= 0) break; if (r.charge > 0.8 && n % 3 === 0) pre = await shot('pre'); }
      if (!r || r.ring < 0) { log(`${dev} ${c}: the long ring never became full (${JSON.stringify(r)})`); all[`${dev}_${c}`] = { skip: 'never full', r }; await page.context().close(); continue; }
      if (!pre) pre = await shot('pre');
      const files = [pre], ks = [-1], WANT = new Set([0, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 30, 36, 45, 60]);
      for (let k = 0; k <= 60; k++) { if (k > 0) r = await page.evaluate(() => window.__step()); if (WANT.has(k)) { files.push(await shot('k' + String(k).padStart(2, '0'))); ks.push(k); } }
      const info = await page.evaluate(() => { const B = window.__B, R = B.ring, rel = (a) => a.filter((q) => q[0] >= R - 1).map((q) => `+${q[0] - R}:${q[1]}`); return { snd: rel(B.snd), hap: rel(B.hap), toast: rel(B.toast), hurt: B.hurt, freeAt: B.freeAt, bell: B.bell }; });
      all[`${dev}_${c}`] = { ...st, ...info, files, ks };
      log(`${dev} ${c} (${st.area}, bell ${st.bell}): sounds ${info.snd.join(' ')} | vibration ${info.hap.join(' ')} | notice ${info.toast.join(' ') || '-'} | free again +${info.freeAt} ticks | hurt ${info.hurt}`);
    } catch (e) { L.errs.push(`[tool] ${dev} ${c}: ` + (e?.stack ?? e)); }
    await page.context().close();
  }
} catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
await L.close();
fs.writeFileSync(`${OUT}/bell.json`, JSON.stringify(all, null, 1));
for (const e of L.errs) console.log('ERR ' + e);
console.log(L.errs.length ? `FAILED: ${L.errs.length}` : 'DONE');
process.exit(L.errs.length ? 1 : 0);
