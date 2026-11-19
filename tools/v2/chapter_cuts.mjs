// STORY: every cut of chapter 1, seen. Brings up every camera step of the story and every scene in which people are shown or moved, from the
// saves of an honest bot run (tools/v2/chapter_audit.mjs writes one after every story event), and saves a still in the middle of each on
// fold_open and on phone2 - with a line per still: who the cut is about, where each of them stands, whether each is inside the picture and
// how much of each is covered.
//   node tools/v2/chapter_cuts.mjs --saves <dir of chapter_audit saves> --out <dir> [--devices fold_open,phone2] [--only keepers,opening] [--res 0.5]
// The numbers (per person on the stage, by an id pass of the scene's own renderer - no impression):
//   frame  how much of the person's box (feet to head, a body wide) lies inside the picture (1 = all of it)
//   seen   how many of the person's own pixels are not covered by anything drawn in front (the frame is drawn three times: as it is, without the
//          person, and with the person drawn in front of everything; seen = pixels the person changes in the real frame / in the in-front frame)
//   box    the person's head under the dialogue box (the speaker's face behind the text)
// and per still: is the touch pad on screen, how many prompt pills. A cut is WEAK when one of the people it is about has frame < 0.98, seen < 0.75,
// stands under 46 px tall, has the head under the dialogue box, or when the pad or a pill is on screen while the story holds the hero.
// NOT honest play: the tool puts the hero at a trigger or a spot, fells groups, sets the queen's health, raises the interact event of a bell the hero
// stands at. Honest: every load is the game's own load of a stored save, every scene is the story's own sequence run by the game.
// Result: <out>/cuts.json, <out>/cuts.txt, <out>/<device>/<nn>_<cut>.jpg ; the sheet: python3 tools/v2/chapter_cuts_sheet.py <out>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
if (!args.saves || args.saves === true || !args.out || args.out === true) { console.error('usage: node tools/v2/chapter_cuts.mjs --saves <dir of chapter_audit saves> --out <dir> [--devices fold_open,phone2] [--only chain,chain] [--res 0.5]'); process.exit(2); }
const DIR = String(args.saves), OUT = String(args.out), DEVS = String(args.devices || 'fold_open,phone2').split(','), ONLY = args.only && args.only !== true ? String(args.only).split(',') : null, RES = Number(args.res ?? 0.5);
fs.mkdirSync(OUT, { recursive: true });
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const port = 9100 + Math.floor(Math.random() * 600), srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
const lines = [], errors = [], CUTS = [];
const put = (l) => { lines.push(l); console.log(l); fs.writeFileSync(`${OUT}/cuts.txt`, lines.join('\n') + '\n'); };
const FILES = fs.readdirSync(DIR).filter((f) => /^\d+_.*\.json$/.test(f)).sort();
const idOf = (f) => f.replace(/^\d+_/, '').replace(/\.json$/, '');
const read = (f) => { const o = JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8')); return JSON.stringify(o.save ?? o); };
/** the save written after a story event · the save written just before it (the one after the event before it in the bot's own order) */
const after = (id) => { const f = FILES.filter((x) => idOf(x) === id).pop(); if (!f) throw new Error('no save for ' + id + ' in ' + DIR); return read(f); };
const before = (id) => { const i = FILES.findIndex((x) => idOf(x) === id); if (i < 1) throw new Error('no save before ' + id + ' in ' + DIR); return read(FILES[i - 1]); };

function install() {
  const g = window.__game, v = window.__v2, P = (window.__cc = { d: 0, adv: 6, SH: null, top: 0, mark: 0 });
  import('/src/v2/game/storyhost.js').then((m) => { P.SH = m.SHOTS; }, () => {});
  const queen = () => v.scene.sim?.enemies.find((x) => x.def?.boss && !x.dead && x.state !== 'dead') ?? null;
  const shotName = () => { const s = v.scene.host?.shot; if (!s) return null; for (const k in P.SH ?? {}) if (P.SH[k] === s) return k; return '?'; };
  const lastLine = () => { const S = v.scene.host.seen; for (let i = S.length - 1; i >= 0; i--) if (S[i][0] === 'line') return S[i][1] + ': ' + S[i][2]; return ''; };
  const step = () => { const sc = v.scene; if (sc.hud?.modal === 'dialog' && P.adv > 0 && ++P.d >= P.adv) { P.d = 0; sc.hud.advanceDialog(); } g.tick(1 / 60); };
  const fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
  const btn = (id) => { let b = (v.scene.hud.metrics?.().pad?.buttons ?? []).find((q) => q.id === id) ?? null; if (b && !(b.cx > 0)) { try { g.alpha = 1; g.render(); } catch { /* between areas */ } b = (v.scene.hud.metrics?.().pad?.buttons ?? []).find((q) => q.id === id) ?? null; } return b && b.cx > 0 ? b : null; };
  P.idle = () => { const sc = v.scene, H = sc.host; return !!v.ready && !!sc.sim && !sc.hud.modal && !H.st.busy && !H.locks() && !sc._go && !sc.xing && sc.fadeA <= 0.01; };
  P.state = () => {
    const sc = v.scene, sim = sc.sim, h = sim?.hero, H = sc.host, e = sim ? queen() : null, ready = !!v.ready && !!sim;
    return { ready, area: v.area, idle: ready && P.idle(), modal: sc.hud.modal ?? null, shot: ready ? shotName() : null, shotLock: !!H?.shotLock, lock: !!H?.locks?.(), x: h ? Math.round(h.x) : 0, z: h ? Math.round(h.z) : 0,
      line: H ? lastLine() : '', tear: !!sc.ch?.tear, queen: e ? { hp: Math.round(e.hp), active: !!e.active, alpha: +(+e.alpha).toFixed(2), kneel: e.kneel > 0, hold: !!e.fleeHold } : null, ended: H?.ended ?? null, obj: H?.objective ?? '', seen: H?.seen.length ?? 0 };
  };
  const hit = (i, wait) => { P.adv = 0; P.mark = v.scene.host?.seen.length ?? 0; for (let k = 0; k < (wait | 0); k++) step();   // (a dialogue page: the box has come up, the line is typed out, the fade of an arrival is over)
    try { g.alpha = 1; g.render(); } catch { /* between areas */ } return { ok: true, ticks: i, ...P.state() }; };
  /** tick (dialogue pages are turned) until the cut point: { shot, mid } a camera shot (mid: half of its seconds gone; else the dialogue after it is open) · { line } a dialogue page whose
   *  speaker and text contain this · { tear } seconds into the queen's tear · { kneel } · { modal } · { idle } */
  P.until = (spec, max) => {
    g._pageHidden = true; P.adv = 6;
    for (let i = 0; i < max; i++) {
      const sc = v.scene;
      if (v.ready && sc.sim) {
        const H = sc.host, m = sc.hud.modal ?? null;
        if (spec.shot && shotName() === spec.shot) { if (spec.mid) { if (H.shotLock) { if (H.shotT > P.top) P.top = H.shotT; if (H.shotT <= P.top * 0.5) return hit(i); } } else if (m === 'dialog') return hit(i, 70); }
        if (spec.line !== undefined && m === 'dialog' && H.seen.length > P.mark && lastLine().includes(spec.line)) return hit(i, 70);   // (a page shown since the last cut point)
        if (spec.tear && sc.ch.tear && sc.ch.tear.t >= spec.tear) return hit(i);
        if (spec.kneel && queen()?.kneel > 0) return hit(i, 40);
        if (spec.move && H.moves.length > 0 && ++P.mv >= spec.move) return hit(i);
        if (spec.modal && m === spec.modal && (spec.modal !== 'end' || (sc.hud.metrics().end?.t ?? 0) > 3)) return hit(i);
        if (spec.idle && i > 8 && P.idle()) return hit(i);
        if (spec.area && v.area === spec.area && P.idle()) return hit(i);
      }
      step();
    }
    try { g.alpha = 1; g.render(); } catch { /* between areas */ }
    return { ok: false, ...P.state() };
  };
  P.putY = (x, z, y) => { const sc = v.scene; sc._enterAt(null, { x, z, y }); sc.cam.snap = true; const h = sc.sim.hero; return [Math.round(h.x), Math.round(h.z), Math.round(h.y)]; };   // (the camera is there at once: its side limits ease over two seconds, a walk's time)
  /** the hero into a trigger (its middle), beside a person, at a spot */
  P.trig = (event, yOf) => { const sc = v.scene, t = (sc.area.triggers ?? []).find((q) => q.event === event); if (!t) return null; const q = yOf ? sc.people.byId(yOf) : null; return P.putY((t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2, q ? q.y : t.y ?? 0); };   // (yOf: a person who stands on the floor the trigger is on - the top of the tower)
  P.beside = (id, dz) => { const sc = v.scene, p = sc.people.byId(id) ?? sc.people.spots.find((q) => q.id === id); if (!p) return null; for (const [ox, oz] of [[0, dz ?? -56], [0, -70], [-56, 0], [56, 0], [-44, -44], [44, -44], [0, 56]]) if (sc._spotOk({ x: p.x + ox, z: p.z + oz, y: p.y })) return P.putY(p.x + ox, p.z + oz, p.y); return null; };
  P.use = (want) => { const sc = v.scene, W = want ? String(want).split('|') : null, okT = () => { const t = sc.people.target; return !!t && (!W || W.includes(t.id)); }; step(); step(); step(); for (let i = 0; i < 60 && !okT(); i++) step(); const t = sc.people.target; if (!okT()) return { err: 'the prompt on offer is ' + (t ? t.id : 'none') + (want ? ', not ' + want : '') }; v.use(); step(); step(); return { id: t.id }; };
  /** the long ring at the bell the hero stands at: the same event the scene raises (index.js _ringLong) */
  P.ring = (id) => { const sc = v.scene, d = sc.area.interact.find((q) => q.id === id); if (!d) return { err: 'no spot ' + id }; sc.emit('interact', { id: d.id, kind: d.kind, event: d.event ?? null, data: d.data ?? null, locked: d.locked ?? null, spot: d, ring: true }); return { id, event: d.event }; };
  P.hold = (id, nTicks) => { const b = btn(id); if (!b) return { err: 'no pad button ' + id }; const a0 = v.area; fire('pointerdown', 15, b.cx, b.cy); let i = 0; for (; i < nTicks; i++) { step(); const sc = v.scene; if (i > 3 && (sc.xing || sc._go || v.area !== a0 || sc.hud.modal)) break; } fire('pointerup', 15, b.cx, b.cy); return { held: i }; };
  P.fell = (group) => { const sim = v.scene.sim; let n = 0; for (const e of sim.enemies) if (e.group === group && !e.dead && e.state !== 'dead') { e.hp = 0; sim._kill(e); n++; } return n; };
  P.queenHp = (hp) => { const e = queen(); if (!e) return null; e.hp = hp; return Math.round(e.hp); };
  P.queenAt = (dist) => { const sc = v.scene, e = queen(); if (!e) return null; for (const [ox, oz] of [[0, -dist], [-dist, 0], [dist, 0], [0, dist]]) if (sc._spotOk({ x: e.x + ox, z: e.z + oz, y: 0 })) return P.putY(e.x + ox, e.z + oz, 0); return null; };
  P.travel = (id, spawn) => v.scene.travelTo(id, spawn);
  /** the numbers of a still (see the head of the tool) */
  P.measure = () => {
    const sc = v.scene, gl = sc.glr.gl, Wv = g.viewW, Hv = g.viewH, sim = sc.sim, h = sim.hero, S = [], M = sc.hud.metrics?.() ?? {}, dbox = M.dialog?.box ?? null;
    S.push({ id: 'hero', a3: sc.heroA, x: h.x, y: h.y, z: h.z });
    for (const p of sc.people.list) if (p.on) S.push({ id: p.id, a3: p.a3, x: p.x, y: p.y, z: p.z });
    for (const e of sim.enemies) if (e.def?.boss && e._a3 && !e.dead && e.state !== 'dead') S.push({ id: 'queen', a3: e._a3, x: e.x, y: e.y, z: e.z, alpha: e.alpha });
    const hid0 = sc._heroHid; sc._heroHid = false;
    const grab = () => { sc._gl(Wv, Hv, 1, false); gl.bindFramebuffer(gl.FRAMEBUFFER, null); const w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, px = new Uint8Array(w * hh * 4); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px); return { px, w, h: hh }; };
    const A = grab(), A2 = grab(), w = A.w, hh = A.h, kx = w / Wv, ky = hh / Hv, out = [];
    let noise = 0; for (let i = 0; i < A.px.length; i += 4) if (Math.abs(A.px[i] - A2.px[i]) + Math.abs(A.px[i + 1] - A2.px[i + 1]) + Math.abs(A.px[i + 2] - A2.px[i + 2]) > 30) noise++;
    for (const s of S) {
      const hgt = s.a3.height ?? 100, pf = sc.project(s.x, s.y, s.z, {}), ph = sc.project(s.x, s.y + hgt, s.z, {}), tall = pf.y - ph.y;
      const o = { id: s.id, x: Math.round(s.x), z: Math.round(s.z), y: Math.round(s.y), feet: [Math.round(pf.x), Math.round(pf.y)], head: [Math.round(ph.x), Math.round(ph.y)], tall: Math.round(tall), frame: 0, seen: 0, px: 0, box: false };
      if (pf.w > 1 && ph.w > 1 && tall > 2) {
        const bx0 = Math.min(pf.x, ph.x) - tall * 0.3, bx1 = Math.max(pf.x, ph.x) + tall * 0.3, by0 = ph.y, by1 = pf.y;
        const cx0 = Math.max(0, bx0), cx1 = Math.min(Wv, bx1), cy0 = Math.max(0, by0), cy1 = Math.min(Hv, by1);
        o.frame = cx1 > cx0 && cy1 > cy0 ? +(((cx1 - cx0) * (cy1 - cy0)) / ((bx1 - bx0) * (by1 - by0))).toFixed(2) : 0;
        o.box = !!dbox && ph.y + tall * 0.12 > dbox.y && ph.x > dbox.x && ph.x < dbox.x + dbox.w;
        if (o.frame > 0) {
          s.a3.draw = () => {}; const B = grab();
          s.a3.draw = function (cr, Mx) { gl.depthRange(0, 0.01); Object.getPrototypeOf(this).draw.call(this, cr, Mx); gl.depthRange(0, 1); }; const C = grab();
          delete s.a3.draw;
          const x0 = Math.max(0, Math.floor((bx0 - tall * 0.5) * kx)), x1 = Math.min(w, Math.ceil((bx1 + tall * 0.5) * kx)), y0 = Math.max(0, Math.floor((by0 - tall * 0.3) * ky)), y1 = Math.min(hh, Math.ceil((by1 + tall * 0.15) * ky));
          let full = 0, vis = 0;
          for (let y = y0; y < y1; y++) { const row = (hh - 1 - y) * w; for (let x = x0; x < x1; x++) { const i = (row + x) * 4; if (Math.abs(C.px[i] - B.px[i]) + Math.abs(C.px[i + 1] - B.px[i + 1]) + Math.abs(C.px[i + 2] - B.px[i + 2]) > 30) { full++; if (Math.abs(A.px[i] - B.px[i]) + Math.abs(A.px[i + 1] - B.px[i + 1]) + Math.abs(A.px[i + 2] - B.px[i + 2]) > 30) vis++; } } }
          o.px = full; o.seen = full > 0 ? +(vis / full).toFixed(2) : 0;
        }
      }
      if (s.alpha !== undefined) o.alpha = +(+s.alpha).toFixed(2);
      out.push(o);
    }
    sc._heroHid = hid0; sc._gl(Wv, Hv, 1, false);
    const H = sc.host, pr = sc.state.prompts ?? [], c = sc.cam;
    return { who: out, noise, view: [Wv, Hv], pad: !!M.pad?.shown && !M.pad?.back, pills: Array.from(pr).map((p) => p.label), lock: !!H.locks(), modal: sc.hud.modal ?? null, dialogTop: dbox ? Math.round(dbox.y) : null, shot: shotName(),
      cam: { x: Math.round(c.px), y: Math.round(c.py), z: Math.round(c.pz), look: [Math.round(c.tx), Math.round(c.tz)], pitch: +c.pitch.toFixed(2), dist: Math.round(c.dist) }, area: v.area, section: v.section, obj: H.objective, line: lastLine() };
  };
}

let page = null, ctx = null, DEV = '', chain = '', nShot = 0;
const ev = (fn, arg) => page.evaluate(fn, arg);
async function boot(saveStr) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ ...contextOptions(DEV) }); page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${DEV}/${chain}] ${String(e).slice(0, 300)}`));
  await page.addInitScript((s) => { try { if (window.top !== window) return; if (sessionStorage.getItem('__cc_seeded')) return; sessionStorage.setItem('__cc_seeded', '1'); if (s) localStorage.setItem('bn.v2.save', s); else localStorage.removeItem('bn.v2.save'); } catch { /* storage */ } }, saveStr);
  await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=${RES}`);
  await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
  await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 30000 }).catch(() => {});
  try { const cdp = await page.context().newCDPSession(page), T = new Touch(cdp, page); await ensureTouchMode(T, page); await page.waitForTimeout(300); } catch (e) { put('     · touch mode: ' + String(e).slice(0, 120)); }
  await ev(install); await page.waitForFunction(() => !!window.__cc?.SH, null, { timeout: 20000 });
}
/** tick until the cut point (returning to the page's own tasks while an area loads) */
async function until(spec, max = 60) {
  await ev(() => { window.__cc.top = 0; window.__cc.mv = 0; }); let s = null;
  for (let i = 0; i < max; i++) { s = await ev((q) => window.__cc.until(q, 45), spec); if (s.ok) return s; if (!s.ready) await page.waitForTimeout(250); }
  throw new Error(`cut point ${JSON.stringify(spec)} not reached: ${JSON.stringify(s)}`);
}
const idle = () => until({ idle: true }, 80);
const P = (name, ...a) => ev(([n, b]) => window.__cc[n](...b), [name, a]);
/** the still and its numbers. about = the people the cut is about */
async function still(id, title, about, what) {
  const dir = `${OUT}/${DEV}`; fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/${String(++nShot).padStart(2, '0')}_${id}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  const m = await ev(() => window.__cc.measure()), weak = [];
  for (const a of about) {
    const p = m.who.find((q) => q.id === a);
    if (!p) { weak.push(`${a} is not on the stage`); continue; }
    if (p.frame < 0.98) weak.push(`${a} is ${Math.round(p.frame * 100)}% inside the picture`);
    else if (p.seen < 0.75) weak.push(`${a} is ${Math.round((1 - p.seen) * 100)}% covered`);
    if (p.tall < 46) weak.push(`${a} is ${p.tall} px tall`);
    if (p.box) weak.push(`${a}'s head is under the dialogue box`);
  }
  if (m.lock && m.pad) weak.push('the pad is on screen while the story holds the hero');
  if ((m.lock || m.modal) && m.pills.length) weak.push(`pill on screen: ${m.pills.join(', ')}`);
  const rec = { device: DEV, chain, id, title, what, about, file, weak, ...m }; CUTS.push(rec);
  put(`${weak.length ? 'WEAK' : 'ok  '} [${DEV}] ${id} — ${title} (${m.area}/${m.section}${m.shot ? ', shot ' + m.shot : ''}; pad ${m.pad ? 'ON' : 'off'}, pills ${m.pills.length})`);
  for (const p of m.who) if (about.includes(p.id) || (p.frame > 0 && p.tall >= 20)) put(`       ${about.includes(p.id) ? '*' : ' '} ${p.id.padEnd(10)} at (${p.x}, ${p.z})  head ${p.head.join(',')}  ${p.tall} px tall  frame ${p.frame.toFixed(2)}  seen ${p.seen.toFixed(2)} of ${p.px} px${p.box ? '  UNDER THE BOX' : ''}`);
  for (const w of weak) put(`       ! ${w}`);
  if (m.line) put(`         line: ${m.line.replace(/\n/g, ' / ').slice(0, 110)}`);
  fs.writeFileSync(`${OUT}/cuts.json`, JSON.stringify({ t: new Date().toISOString(), cuts: CUTS }, null, 1));
  return rec;
}
const ringAt = async (bell) => { await P('beside', bell, -44); await ev(() => window.__cc.until({ idle: true }, 30)); return P('ring', bell); };
const bigBell = () => ev(() => (window.__v2.scene.area.interact.find((q) => q.kind === 'bell' && q.event === 'bell.ring') ?? {}).id ?? null);

const chains = [];
const C = (id, title, fn) => chains.push({ id, title, fn });

C('opening', 'the opening: the red moon and the cracked bell (a new game)', async () => {
  await boot(null);
  await until({ shot: 'moon_bell' }); await still('moon_bell', '서막 — 붉은 달과 종 (camera moon_bell)', [], 'ev_opening');
});
C('church', 'the church: Alberto and Elise, the promise', async () => {
  await boot(before('ev_church_arrive')); await idle(); await P('trig', 'church.arrive');
  await until({ line: '' }); await still('church_meet', '성당 앞 — 신부와 엘리제 (ev_church_arrive)', ['hero', 'alberto', 'elise'], 'ev_church_arrive');
});
C('tower', 'the bell tower: Elise at the rope, the crack, the fall, waking in 1697', async () => {
  await boot(before('ev_tower_top')); await idle(); await P('trig', 'tower.top', 'elise');
  await until({ line: '' }); await still('tower_top', '종탑 꼭대기 — 엘리제 (ev_tower_top)', ['hero', 'elise'], 'ev_tower_top');
  await idle(); await P('fell', 'tower_bats');
  await until({ shot: 'bell_crack' }); await still('bell_crack', '종에 금이 간다 (camera bell_crack)', ['hero', 'elise'], 'ev_tower_crack');
  await until({ shot: 'fall', mid: true }); await still('fall', '금 사이로 떨어진다 (camera fall)', ['hero'], 'ev_tower_crack');
  await until({ shot: 'wake_past' }); await still('wake_past', '그 밤에서 깨어난다 — 로테 (camera wake_past)', ['hero', 'lotte'], 'ev_past_wake');
});
C('table', "that night's table: Edmund, the knot, the smith, the first crossing", async () => {
  await boot(before('ev_table')); await idle(); await P('beside', 'edmund'); await P('use', 'edmund');
  await until({ shot: 'table' }); await still('table', '식탁 — 에드문트 (camera table)', ['hero', 'edmund'], 'ev_table');
  await idle(); await P('beside', 'edmund'); await P('use', 'edmund');
  await until({ shot: 'knot' }); await still('knot', '종 조각을 매 준다 (camera knot)', ['hero', 'edmund'], 'ev_knot');
  await idle(); await P('beside', 'hadwin1'); await P('use', 'hadwin1');
  await until({ line: '' }); await still('smith_past', '대장간 — 하드윈 1세 (ev_smithy_past)', ['hero', 'hadwin1'], 'ev_smithy_past');
  await idle(); const b = await bigBell(); await ringAt(b);
  await until({ line: '' }); await still('bell_first', '첫 건넘 앞 — 로테 (ev_bell_first)', ['hero', 'lotte'], 'ev_bell_first');
  await until({ shot: 'years', mid: true }); await still('years', '백 년이 흐른다 (camera years)', ['hero'], 'ev_bell_first');
  await until({ line: '' }); await still('return_first', '달라진 오늘 밤 (ev_return_first)', ['hero'], 'ev_return_first');
});
C('smith', "tonight's smith: the grandson's drawer", async () => {
  await boot(before('ev_smithy_now')); await idle(); await P('beside', 'smithy_door', -40); await P('use', 'smithy_door');
  await until({ line: '' }); await still('smith_now', '손자의 서랍 — 하드윈 (ev_smithy_now)', ['hero', 'hadwin'], 'ev_smithy_now');
});
C('keeper', "that night's graveyard: the keeper, Edmund at the grave, the road bell", async () => {
  await boot(before('ev_keeper_greets')); await idle();
  if ((await P('state')).area !== 'graveyard_past') { await P('travel', 'graveyard_past', 'from_eshville'); await until({ area: 'graveyard_past' }, 120); }
  await P('trig', 'keeper.greets');
  await until({ line: '' }); await still('keeper', '묘지기 (ev_keeper_greets)', ['hero', 'keeper'], 'ev_keeper_greets');
  await idle(); await P('trig', 'grave.edmund');
  await until({ line: '' }); await still('edmund_grave', '묘지의 에드문트 (ev_edmund_grave)', ['hero', 'edmund'], 'ev_edmund_grave');
});
C('sera', 'the ossuary: Sera at the lamp', async () => {
  await boot(before('ev_oss_sera')); await idle(); await P('trig', 'oss.lamp');
  await until({ line: '' }); await still('sera_lamp', '등불대의 세라 (ev_oss_sera)', ['hero', 'sera'], 'ev_oss_sera');
});
C('queen', "the queen: her entrance, the tear", async () => {
  await boot(before('ev_boss_intro')); await idle(); await P('putY', 600, 3150, 0);
  await until({ shot: 'banshee_song' }); await still('queen_entrance', '밴시 여왕의 등장 (camera banshee_song)', ['hero', 'queen'], 'ev_boss_intro');
  await idle(); await P('queenAt', 150); await P('queenHp', 448);
  await until({ tear: 0.3 }); await still('queen_tear', '여왕이 종을 찢고 달아난다 (chapter.js tear)', ['hero', 'queen'], 'ev_boss_flee');
  await until({ line: '' }); await still('queen_flee', '달아난 뒤 (ev_boss_flee)', ['hero'], 'ev_boss_flee');
});
C('chase', 'the chase in 1697: she waits, she is driven back', async () => {
  await boot(after('ev_boss_flee')); await idle(); await ringAt('bell_arena');
  await until({ line: '' }, 160); await still('queen_past', '그 밤의 여왕 (ev_boss_past)', ['hero', 'queen'], 'ev_boss_past');
  await idle(); await P('putY', 600, 3150, 0); await ev(() => window.__cc.until({ idle: true }, 40)); await P('queenAt', 150); await P('queenHp', 200);
  await until({ tear: 0.3 }); await still('queen_tear_back', '여왕이 오늘 밤으로 쫓겨난다 (chapter.js tear)', ['hero', 'queen'], 'ev_boss_driven');
});
C('kneel', 'the kneel and the knell', async () => {
  await boot(after('ev_boss_back')); await idle(); await P('putY', 600, 3150, 0); await ev(() => window.__cc.until({ idle: true }, 60)); await P('queenAt', 80); await P('queenHp', 36);
  await until({ kneel: true }); await ev(() => window.__cc.until({ idle: true }, 30)); await still('queen_kneel', '여왕이 무릎을 꿇는다', ['hero', 'queen'], 'ev_boss_kneel');
  await P('queenAt', 70); await P('hold', 'bell', 480);
  await until({ line: '' }, 160); await still('queen_sent', '조종 — 여왕을 보낸다 (ev_boss_sent)', ['hero'], 'ev_boss_sent');
});
C('keepers', 'the sleeping girl, the two keepers at the bell', async () => {
  await boot(after('ev_boss_sent')); await idle(); await ringAt('bell_arena'); await until({ area: 'ossuary_past' }, 160);
  if (args.verbose) put('     · ' + JSON.stringify(await P('state')));
  const at = await P('putY', 600, 3760, 0), u = await P('use', 'oss_elise|elise'); if (args.verbose) put('     · ' + JSON.stringify({ at, u, s: await P('state') }));
  await until({ line: '' }); await still('elise_asleep', '잠든 엘리제 (ev_elise_wake)', ['hero', 'elise'], 'ev_elise_wake');
  await until({ line: '찾았네요' }, 200); const s = await P('state');
  if (s.area === 'eshville_past') await still('keepers_found', '두 종지기가 만난다 (ev_keepers, first line)', ['hero', 'lotte', 'elise'], 'ev_keepers');
  const w = await until({ move: 50, shot: 'two_keepers' }, 60);
  if (w.modal !== 'dialog') { await still('keepers_walk', '엘리제가 종으로 걸어간다 (moveActor, lockInput)', ['hero', 'lotte', 'elise'], 'ev_keepers'); await until({ shot: 'two_keepers' }, 200); }
  await still('two_keepers', '두 종지기 — 종을 사이에 두고 (camera two_keepers)', ['hero', 'lotte', 'elise'], 'ev_keepers');
  await until({ line: '약속!' }); await still('keepers_promise', '두 종지기 — 「약속!」', ['hero', 'lotte', 'elise'], 'ev_keepers');
  await idle(); await still('keepers_after', '약속 뒤 — 놓여난 순간', ['hero', 'lotte', 'elise'], 'ev_keepers');
});
C('ending', "the ending: the bread, the last crossing, tonight's bell, the widening ring, the card", async () => {
  await boot(after('ev_keepers')); await idle(); const b = await bigBell(); await ringAt(b);
  await until({ line: '' }); await still('ending_bread', '마지막 건넘 앞 (ev_ending)', ['hero', 'lotte', 'elise'], 'ev_ending');
  await until({ shot: 'years', mid: true }); await still('years_last', '백 년이 흐른다 — 마지막 (camera years)', ['hero'], 'ev_ending');
  await until({ line: '' }, 200); await still('ending_bell', '오늘 밤의 종 — 엘리제 (ev_ending_home)', ['hero', 'elise'], 'ev_ending_home');
  await until({ shot: 'ring_widen', mid: true }, 200); await still('ring_widen', '종소리가 넓어진다 (camera ring_widen)', [], 'ev_ending_home');
  await until({ line: '' }); await still('ending_town', '맺음 — 마을 (ev_ending_home, last lines)', ['hero', 'elise'], 'ev_ending_home');
  await until({ line: '로테?' }); await still('ending_lotte', '맺음 — 「…로테?」 (ev_ending_home)', ['hero', 'elise', 'alberto'], 'ev_ending_home');
  await until({ modal: 'end' }, 200); await still('end_card', '맺음 카드', [], 'ev_ending_home');
});

const t00 = Date.now();
for (DEV of DEVS) {
  nShot = 0;
  for (const S of chains) {
    if (ONLY && !ONLY.includes(S.id)) continue;
    chain = S.id; const t0 = Date.now(); put(`── [${DEV}] ${S.id}: ${S.title}`);
    try { await S.fn(); } catch (e) { put(`STOP [${DEV}] ${S.id}: ${String(e?.message ?? e).slice(0, 600)}`); CUTS.push({ device: DEV, chain: S.id, id: S.id + '_stopped', title: 'not captured', weak: ['the chain stopped: ' + String(e?.message ?? e).slice(0, 200)], file: null, who: [], about: [] }); try { await page.screenshot({ path: `${OUT}/${DEV}_${S.id}_stopped.jpg`, type: 'jpeg', quality: 80 }); } catch { /* no page */ } }
    put(`   (${S.id}: ${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}
fs.writeFileSync(`${OUT}/cuts.json`, JSON.stringify({ t: new Date().toISOString(), cuts: CUTS, errors }, null, 1));
const weak = CUTS.filter((c) => c.weak.length), stopped = CUTS.filter((c) => !c.file);
put(`${CUTS.length - stopped.length} stills, ${weak.length - stopped.length} weak, ${stopped.length} chains stopped, page errors ${errors.length}${errors.length ? ' - ' + errors[0] : ''} (${Math.round((Date.now() - t00) / 1000)} s)`);
await browser.close(); srv.close?.();
process.exit(stopped.length || errors.length ? 1 : 0);
