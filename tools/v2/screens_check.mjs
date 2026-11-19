// SCREENS lane check (docs/v2/UI_API.md 10): the chronicle book, the bag, the item and chronicle cards, the choice cards, Rook's shop.
//   node tools/v2/screens_check.mjs [--out /tmp/claude-0/v2/screens] [--devices fold_open,phone2] [--only node,pause,book,cards,bag,choice,shop,persist,cut,alloc] [--saves <bot saves>] [--shots 1]
// NODE (no browser): the model on the story's own saves (rows of the book: blank -> half -> pair, the marks of new rows, the bag, the shop's states
//   and purchases, the guide candle), the draught in the rules (sim.js _die), the silver of the village's jars against the prices.
// PAGE (scene v2g with the story, one browser, each device in turn): every screen and card is opened BY TOUCH through the pointer handlers in game
//   time (the game is advanced by ticks: a headless page runs at a few frames a second) - layout inside the safe area, nothing on the HUD's boxes,
//   targets of 56 px, the game standing still behind a screen, no touch falling through, back / ESC, a save and load, a crossing and a fall with each
//   screen's state, a purchase, an unaffordable one, the draught saving the hero once, a screen opened during a story cut, allocation per frame.
// The hero is put on spots by the tool where walking is not what is being checked. Exit 1 on any failed line or page error.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { Touch, ensureTouchMode } from '../qa/lib/touch.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/screens'), DEVICES = String(args.devices || 'fold_open,phone2').split(','), SAVES = String(args.saves || '/tmp/claude-0/v2/screens/saves'), SHOTS = args.shots !== '0';
const ONLY = args.only ? new Set(String(args.only).split(',')) : null, want = (p) => !ONLY || ONLY.has(p);
const ROOT = new URL('../..', import.meta.url).pathname, DT = 1 / 60;
fs.mkdirSync(OUT, { recursive: true });
let fails = 0, passes = 0; const failed = [];
const ok = (name, cond, note = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${note ? '  (' + note + ')' : ''}`); if (cond) passes++; else { fails++; failed.push(name); } };
const saveOf = (n) => { const f = fs.readdirSync(SAVES).find((x) => x.startsWith(String(n).padStart(3, '0') + '_') || x.includes('_' + n + '.json')); if (!f) throw new Error('no bot save ' + n + ' in ' + SAVES); const o = JSON.parse(fs.readFileSync(SAVES + '/' + f, 'utf8')); return o.save ?? o; };

// ════════════════════════════ NODE ════════════════════════════
if (want('node')) {
  console.log('[node] the model on the story\'s saves');
  const { STORY, createStory } = await import(ROOT + 'src/v2/data/index.js');
  const { createModel } = await import(ROOT + 'src/v2/ui/model.js');
  const mk = (n, o = {}) => {
    const st = createStory(STORY, { warn: () => {} }), sv = n ? saveOf(n) : null; if (sv) st.load(sv.story);
    const E = { coins: o.coins ?? (sv ? sv.coins ?? 0 : 0), area: o.area ?? (sv ? { id: sv.area, era: sv.era, twin: sv.area.replace(/_(now|past)$/, (m, e) => (e === 'now' ? '_past' : '_now')) } : null), reso: { v: o.reso ?? 0, max: 3 }, filled: 0 };
    const M = createModel({ STORY, st, coins: () => E.coins, setCoins: (v) => { E.coins = v; }, area: () => E.area, reso: () => E.reso, fillReso: () => { E.reso.v = E.reso.max; E.filled++; } });
    M.load(sv ? sv.scr ?? null : null);
    return { M, st, E, sv };
  };
  const kinds = (M) => M.book().map((r) => r.id + ':' + r.kind).join(' ');
  { const { M } = mk(0); ok('a new game: the book is empty, no chip, nothing carried', M.book().length === 0 && !M.chip && M.dr === 0 && M.bag().story.length === 0 && M.guideLine() === ''); }
  { const { M } = mk(13); ok('before the fall (bot save 013): no row yet, no chip', M.book().length === 0 && !M.chip, kinds(M)); }
  { const { M } = mk(29); const r = M.book().find((q) => q.id === 'graveyard_key');
    ok('the key left with the smith (029): the row is a HALF - that night written, tonight an empty frame', !!r && r.kind === 'half' && !!r.L && !r.R && r.L.title === STORY.CHRONICLE.graveyard_key.pastTitle && !/^그 밤 — /.test(r.L.text), kinds(M)); }
  { const { M } = mk(33); const B = M.book(), r = B.find((q) => q.id === 'graveyard_key'), l = B.filter((q) => q.kind === 'line');
    ok('the grandson\'s drawer (033): cause and consequence are a PAIR on one row', !!r && r.kind === 'pair' && !!r.L && !!r.R && r.R.title === STORY.CHRONICLE.graveyard_key.nowTitle, kinds(M));
    ok('written lines stand on the page of their night (금 간 종: tonight · 넷째 붉은 달: that night)', l.length === 2 && l.find((q) => q.id === 'bell_cracked').R && !l.find((q) => q.id === 'bell_cracked').L && l.find((q) => q.id === 'fourth_moon').L && !l.find((q) => q.id === 'fourth_moon').R);
    ok('a blank is listed with its hint and no text of either night', B.filter((q) => q.kind === 'blank').every((q) => !q.L && !q.R && q.hint.length > 4), B.filter((q) => q.kind === 'blank').map((q) => q.id).join(' '));
    ok('a save of an earlier build (no scr): the chip is up, every written row is new', M.chip === true && B.filter((q) => q.kind !== 'blank').every((q) => q.isNew) && M.unread() === 3, 'unread ' + M.unread());
    for (const q of B) M.seen(q); M.opened(); const o = JSON.parse(JSON.stringify(M.out()));
    const st2 = createStory(STORY, { warn: () => {} }); st2.load(saveOf(33).story); const M2 = createModel({ STORY, st: st2, coins: () => 0, setCoins() {}, area: () => null, reso: () => null, fillReso() {} }); M2.load(o);
    ok('rows that have been on screen stay read through the save (save.scr.read), the chip stays down', M2.unread() === 0 && M2.chip === false && o.read.length === 3, JSON.stringify(o));
    M2.wrote(); ok('the chronicle step raises the chip again', M2.chip === true);
    const bag = M.bag(); ok('the bag (033): story things and things that are used up are two lists', bag.story.map((q) => q.id).join(' ') === 'valkrein_knot wolfram_notice key_silver order_slip' && bag.use.map((q) => q.id).join(' ') === 'lotte_bread' && bag.story.every((q) => q.icon && q.name && q.desc), bag.story.map((q) => q.id + '/' + q.icon).join(' ') + ' | ' + bag.use.map((q) => q.id).join(' ')); }
  { const { M } = mk(50); const r = M.book().find((q) => q.id === 'nameless_graves'); ok('both names carved, the stones not yet seen tonight (050): a half', !!r && r.kind === 'half', kinds(M)); }
  { const { M } = mk(84); const B = M.book(), n = (k) => B.filter((q) => q.kind === k).length;
    // (the bot's line of play does not go back to look at the two stones tonight: 이름 없는 무덤 둘 stays a half - the deed done, tonight not seen)
    ok('the end of the chapter (084): five rows of deeds (pairs, or a half where tonight was not looked at), three written lines, five blanks stay open', n('pair') + n('half') === 5 && n('pair') >= 4 && n('line') === 3 && n('blank') === 5 && n('sealed') === 0, kinds(M)); }
  { const { M } = mk(55); const r = M.book().find((q) => q.id === 'banshee'); ok('a line the chronicle has not finished (배웅하는 노래 before the queen is sent) shows its title only', !!r && r.kind === 'sealed' && r.R && r.R.text === '', r ? r.kind : 'not listed'); }
  // the shop
  { const { M, E } = mk(33, { coins: 0, reso: 0 }); let s = M.shop('rook');
    ok('Rook\'s goods: three rows with a price in silver, his line of tonight', s.goods.length === 3 && s.goods.every((g) => g.price > 0 && g.name && g.line && g.icon) && s.line === STORY.SHOP.rook.line.now && s.keeper === '로크', s.goods.map((g) => g.id + ' ' + g.price + ' ' + g.state).join(' · '));
    ok('no silver: the draught and the oil say 「은화가 모자라다」', s.goods[0].state === 'poor' && s.goods[1].state === 'poor');
    let r = M.buy('rook', 'draught'); ok('…and nothing is sold', !r.ok && r.why === 'poor' && E.coins === 0 && M.dr === 0);
    E.coins = 50; r = M.buy('rook', 'draught'); const r2 = M.buy('rook', 'draught'), r3 = M.buy('rook', 'draught');
    ok('50 silver: two draughts are bought (20 each), the third is refused - two at most', r.ok && r2.ok && !r3.ok && r3.why === 'full' && M.dr === 2 && E.coins === 10, `dr ${M.dr} coins ${E.coins} third ${r3.why}`);
    ok('the draughts stand in the bag among the things that are used up, with their count', M.bag().use.some((q) => q.id === 'draught' && q.n === 2));
    E.coins = 12; r = M.buy('rook', 'bell_oil'); ok('bell oil: the gauge is filled at once, 12 silver', r.ok && E.filled === 1 && E.reso.v === 3 && E.coins === 0);
    E.coins = 12; r = M.buy('rook', 'bell_oil'); ok('…and is refused while the gauge is full (no silver taken)', !r.ok && r.why === 'fullReso' && E.coins === 12);
    r = M.buy('rook', 'guide_candle'); ok('the guide candle is refused while no blank can be filled (033: none)', !r.ok && r.why === 'noBlank' && E.coins === 12, r.why);
    M.draughtUsed(); ok('a draught used: one left', M.dr === 1);
    const o = M.out(); ok('the save keeps the draughts (save.scr.dr)', o.dr === 1); }
  { const { M, E } = mk(41, { coins: 30 }); const r = M.buy('rook', 'guide_candle');
    ok('the guide candle (041: the ghosts were seen): bought for 8, the line names where the nearest blank is filled', r.ok && E.coins === 22 && M.guideLine() === '빈칸 — ' + STORY.CHRONICLE.nameless_graves.place.at, M.guideLine());
    const r2 = M.buy('rook', 'guide_candle'); ok('…one burns at a time', !r2.ok && r2.why === 'lit');
    M.enterArea('graveyard_past'); const keep = M.guideLine(); M.enterArea('eshville_now');
    ok('it burns on in the other night of the same place and goes out when he leaves the place', keep !== '' && M.guideLine() === '' && M.guide === null, `twin "${keep}" · elsewhere "${M.guideLine()}"`); }

  console.log('[node] the draught in the rules (src/v2/play/sim.js _die)');
  const { Sim, TUNE, flatArena } = await import(ROOT + 'src/v2/play/index.js');
  const mkS = () => { const log = []; const sim = new Sim(flatArena(520, 360, []), { event: (n, ...a) => log.push(n) }); sim.log = log; sim.update(DT, {}); return sim; };   // (no enemy: every blow is the test's own)
  const run = (sim, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) sim.update(DT, {}); };
  { const s = mkS(), h = s.hero; h.draughts = 1; h.hp = 5; const x0 = h.x, z0 = h.z; const r = s.hurtHero(50, -1, 0, {});
    ok('a draught is used by itself when he would fall: he lives with one candle of health', !h.dead && h.hp === Math.round(TUNE.heroHp / 3) && h.draughts === 0 && s.log.includes('draught') && !s.log.includes('heroDie'), `hp ${h.hp} (a candle = ${Math.round(TUNE.heroHp / 3)}) draughts ${h.draughts} answer ${r}`);
    ok('…untouchable for 1.2 s', h.ifr >= 1.2 - 1e-6 && s.hurtHero(50, -1, 0, {}) === false && !h.dead, 'ifr ' + h.ifr.toFixed(2));
    run(s, 1.0); const still = s.hurtHero(50, -1, 0, {}) === false; run(s, 0.3);
    ok('…for 1.2 s and no longer (still untouchable after 1.0 s, struck after 1.3 s)', still && s.hurtHero(10, -1, 0, {}) !== false, 'ifr now ' + h.ifr.toFixed(2));
    ok('a draught used is no fall: sim.deaths is 0 and he stands where he was struck (the blow\'s push aside)', s.deaths === 0 && Math.hypot(h.x - x0, h.z - z0) < 260, `moved ${Math.hypot(h.x - x0, h.z - z0).toFixed(0)} px`);
    run(s, 2); h.hp = 1; s.hurtHero(50, -1, 0, {}); ok('with none left he falls as before', h.dead && s.log.includes('heroDie')); }
  { const s = mkS(), h = s.hero; h.draughts = 2; h.hp = 1; s.hurtHero(50, -1, 0, {}); run(s, 1.4); h.hp = 1; s.hurtHero(50, -1, 0, {}); const two = !h.dead && h.draughts === 0; run(s, 1.4); h.hp = 1; s.hurtHero(50, -1, 0, {});
    ok('two draughts save him twice, the third blow fells him', two && h.dead && s.log.filter((n) => n === 'draught').length === 2); }
  { const s = mkS(), h = s.hero; h.hp = 1; s.hurtHero(50, -1, 0, {}); ok('without a draught nothing changed: he falls, heroDie is raised', h.dead && s.log.includes('heroDie') && !s.log.includes('draught')); }
  { const s = mkS(), h = s.hero; h.draughts = 1; h.hpMax = 30; h.hp = 1; s.hurtHero(50, -1, 0, {}); ok('never more than his whole health', !h.dead && h.hp <= 30 && h.hp >= 1, 'hp ' + h.hp); }

  console.log('[node] the silver of the jars against the prices');
  const { AREAS } = await import(ROOT + 'src/v2/world/index.js'), { DROP_TABLE, PICK } = await import(ROOT + 'src/v2/play/breakables.js');
  const ow = console.warn; console.warn = () => {};
  let line = [], village = 0, villageN = 0, spare = 0;
  for (const id of ['eshville_now', 'eshville_past', 'belltower_now', 'graveyard_now', 'graveyard_past', 'ossuary_now', 'ossuary_past']) {
    const a = await AREAS[id]({}); let exp = 0, sp = 0;
    for (const b of a.breakables ?? []) { const T = DROP_TABLE[b.kind]; if (!T || b.drop) continue; exp += T.share[1] / 100 * (T.coins[0] + T.coins[1]) / 2; sp += (T.share[2] + T.share[3]) / 100 * PICK.spare; }
    line.push(`${id} ${(a.breakables ?? []).length} things ≈ ${exp.toFixed(1)}`); if (id.startsWith('eshville')) { village += exp; villageN += (a.breakables ?? []).length; spare += sp; }
  }
  console.warn = ow;
  const G = STORY.SHOP.rook.goods, all = G.reduce((s, g) => s + g.price, 0), cheap2 = G.map((g) => g.price).sort((a, b) => a - b).slice(0, 2).reduce((s, v) => s + v, 0);
  console.log('  ' + line.join(' · '));
  console.log(`  the village (both nights, one pass): ${villageN} things ≈ ${village.toFixed(1)} silver from coin drops (+ up to ${spare.toFixed(1)} when every heal / resonance piece is taken while full)`);
  console.log(`  prices: ${G.map((g) => g.name + ' ' + g.price).join(' · ')} — all three ${all}, the two cheapest ${cheap2}`);
  ok('a careful player who breaks every jar of the village can afford two or three goods', village >= cheap2 && village >= all * 0.95 && village < all * 2.2, `≈ ${village.toFixed(1)} silver against ${cheap2} (two) and ${all} (all three)`);
}

// ════════════════════════════ PAGE ════════════════════════════
const PAGE_PARTS = ['pause', 'book', 'cards', 'bag', 'choice', 'shop', 'persist', 'cut', 'alloc'];
if (PAGE_PARTS.some(want)) {
  const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const port = 8200 + Math.floor(Math.random() * 700), srv = await start(port);
  const browser = await chromium.launch({ executablePath: EXE, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc'] });
  const errs = [];
  /** in the page: touches on the pointer handlers, ticks, measures */
  function install() {
    const g = window.__game, v = window.__v2, sc = v.scene; g._pageHidden = true;
    const F = (window.__F = { n: 0, sounds: [] });
    F.fire = (type, id, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
    F.toClient = (lx, ly) => { const r = g.canvasRect, s = sc.state; return [r.x + lx / s.viewW * r.w, r.y + ly / s.viewH * r.h]; };
    F.draw = () => { g.alpha = 1; g.render(); };
    F.tick = (n = 1, draw = true) => { for (let i = 0; i < n; i++) { g.tick(1 / 60); F.n++; } if (draw) F.draw(); };
    /** a tap at a logical point: down, `hold` ticks, up, one tick */
    F.tap = (lx, ly, hold = 2, id = 41) => { const c = F.toClient(lx, ly); F.fire('pointerdown', id, c[0], c[1]); F.tick(hold, false); F.fire('pointerup', id, c[0], c[1]); F.tick(1); };
    F.tapCss = (x, y, hold = 2, id = 42) => { F.fire('pointerdown', id, x, y); F.tick(hold, false); F.fire('pointerup', id, x, y); F.tick(1); };
    F.mid = (r) => [r.x + r.w / 2, r.y + r.h / 2];
    F.tapRect = (r, hold = 2) => { const m = F.mid(r); F.tap(m[0], m[1], hold); };
    F.key = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); F.tick(1, false); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); F.tick(1); };
    F.M = () => sc.hud.metrics();
    F.pauseBtn = () => { const b = F.M().pad?.buttons?.find((q) => q.id === 'pause'); return b ? [b.cx, b.cy] : null; };
    F.btn = (id) => { const b = F.M().pad?.buttons?.find((q) => q.id === id); return b ? [b.cx, b.cy] : null; };
    /** the pause button, then a row of the panel by id - all by touch */
    F.openPause = () => { const p = F.pauseBtn(); if (!p) return false; F.tapCss(p[0], p[1]); F.tick(4); return sc.hud.modal === 'pause' && !!F.M().pause; };
    F.pauseRow = (id) => { const m = F.M().pause; if (!m) return false; const i = m.ids.indexOf(id); if (i < 0) return false; F.tapRect(m.rows[i]); F.tick(3); return true; };
    F.closeBtn = () => { const m = F.M().screen; if (!m) return false; F.tapRect(m.close); F.tick(2); return true; };
    F.put = (x, z, dx = 1, dz = 0) => {
      const sim = sc.sim, h = sim.hero, B = sc.W.boxes; let gy = -Infinity;
      for (const b of B) { if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1 || !b.walk) continue; if (b.y1 > gy && b.y1 < 2000) gy = b.y1; }
      h.x = x; h.z = z; if (Number.isFinite(gy)) h.y = gy; h.vx = 0; h.vz = 0; h.vy = 0; h.onGround = true; h.move = null; h.act = null; h.dashT = 0;
      const l = Math.hypot(dx, dz) || 1; h.dirX = dx / l; h.dirZ = dz / l; if (sc.heroA) { sc.heroA.dx = h.dirX; sc.heroA.dz = h.dirZ; }
      if (h.safe) { h.safe.x = h.x; h.safe.y = h.y; h.safe.z = h.z; } h._px = h.x; h._py = h.y; h._pz = h.z; sc.visY = sc.visYP = h.y; if (sc.cam) sc.cam.snap = true; sc._whipReset = true;
    };
    /** what the rules hold of the hero: moves, presses carried, where he is */
    F.hero = () => { const h = sc.sim.hero, B = sc.sim._buf ?? {}; return { x: Math.round(h.x * 10) / 10, z: Math.round(h.z * 10) / 10, hp: h.hp, dead: !!h.dead, move: h.move ? h.move.id ?? String(h.move) : null, dashT: h.dashT, act: h.act ?? null, queued: h.queued, buf: (B.attack ? 'a' : '') + (B.dash ? 'd' : '') + (B.jump ? 'j' : '') + (B.skill ? 's' : '') + (B.bell ? 'b' : ''), inp: (sc.inp.attack ? 'a' : '') + (sc.inp.dash ? 'd' : '') + (sc.inp.jump ? 'j' : ''), draughts: h.draughts, coins: h.coins, reso: h.reso, t: sc.sim.time }; };
    F.world = () => { const s = sc.sim, E = s.enemies; let q = ''; for (const e of E) q += Math.round(e.x * 10) + ',' + Math.round(e.z * 10) + ',' + (e.state ?? '') + ';'; const H = sc.host; return { t: s.time, hero: Math.round(s.hero.x * 100) + ',' + Math.round(s.hero.z * 100), E: q, waits: H ? H.waits.map((w) => w.t.toFixed(4)).join(',') : '', shotT: H ? H.shotT : 0, moves: H ? H.moves.length : 0, walk: H && H.walk ? H.walk.t : -1, busy: !!H?.st.busy, running: H?.st.running ?? null, seen: H ? H.seen.length : 0 }; };
    F.model = () => { const M = sc.host?.model; return M ? { rev: M.rev, dr: M.dr, guide: M.guide, chip: M.chip, unread: M.unread(), out: M.out(), coins: M.coins(), book: M.book().map((r) => r.id + ':' + r.kind + (r.isNew ? '*' : '')).join(' '), bag: M.bag().story.map((q) => q.id + (q.n > 1 ? 'x' + q.n : '')).join(' ') + ' | ' + M.bag().use.map((q) => q.id + (q.n > 1 ? 'x' + q.n : '')).join(' '), guideLine: M.guideLine() } : null; };
    if (sc.host?.model) { const M = sc.host.model, s0 = M.sound; M.sound = (n) => { F.sounds.push(n); s0(n); }; }
    F.safe = () => { const s = sc.state, sf = s.safe ?? { l: 0, t: 0, r: 0, b: 0 }; return { x: sf.l, y: sf.t, w: s.viewW - sf.l - sf.r, h: s.viewH - sf.t - sf.b, css: g.cssScale, vw: s.viewW, vh: s.viewH }; };
    return { ready: v.ready, area: v.area, hud: v.stats?.hud };
  }
  const inside = (r, s, e = 0.5) => r.x >= s.x - e && r.y >= s.y - e && r.x + r.w <= s.x + s.w + e && r.y + r.h <= s.y + s.h + e;
  const hits = (a, b, e = 0.01) => a.x < b.x + b.w - e && b.x < a.x + a.w - e && a.y < b.y + b.h - e && b.y < a.y + a.h - e;
  const R = (r) => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}` : 'none');

  try {
    for (const DEV of DEVICES) {
      console.log(`\n════ ${DEV} ════`);
      const ctx = await browser.newContext(contextOptions(DEV)), page = await ctx.newPage();
      page.on('pageerror', (e) => errs.push(`[${DEV} pageerror] ` + e.message + ' ' + (e.stack ?? '').split('\n').slice(1, 3).join(' | ')));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`[${DEV} console] ` + m.text().slice(0, 300)); });
      page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[${DEV} http ${r.status()}] ` + r.url()); });
      const ev = (fn, a) => page.evaluate(fn, a);
      const shot = async (name) => { if (!SHOTS) return; await ev(() => window.__F.draw()); await page.screenshot({ path: `${OUT}/${DEV}_${name}.png` }); };
      /** open the game on a save (a bot save number, an object, or null = whatever the page has stored) */
      const open = async (sv, q = '') => {
        const o = typeof sv === 'number' ? saveOf(sv) : sv;
        await page.goto(`http://localhost:${port}/tools/v2/fx_view.css`).catch(() => {});
        if (o !== undefined) await ev((s) => { if (s === null) localStorage.removeItem('bn.v2.save'); else localStorage.setItem('bn.v2.save', JSON.stringify(s)); localStorage.removeItem('bn.v2.ui'); }, o ?? null);
        await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=0.5${q}`);
        await page.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 });
        await page.waitForFunction(() => window.__v2?.stats?.hud === 'ui' || /v2ui=0/.test(location.search), null, { timeout: 20000 }).catch(() => {});
        const cdp = await ctx.newCDPSession(page), T = new Touch(cdp, page);
        await ensureTouchMode(T, page); await page.waitForTimeout(250);
        const st = await ev(install); await ev(() => window.__F.tick(30));
        return st;
      };
      // back to touch after a key (the shell's input follows the last device): one touch on an empty part of the screen, through the same handlers
      const touchMode = () => ev(() => { const F = window.__F, c = window.__game.canvasRect; F.tapCss(c.x + c.w * 0.62, c.y + c.h * 0.36, 1, 60); F.tick(6); return window.__game.input.mode; });

      // ───────────── the pause panel: 「연대기」 「가방」 ─────────────
      if (want('pause') || want('book') || want('bag')) {
        await open(33);
        const p = await ev(() => { const F = window.__F; const okP = F.openPause(); const m = F.M(); return { okP, pause: m.pause, safe: F.safe(), modal: m.modal, pad: m.pad?.shown }; });
        if (want('pause')) {
          const P = p.pause, S = p.safe;
          ok(`${DEV}: the pause button (touch) opens the panel with 「연대기」 and 「가방」 under 「이어 하기」, 「나가기」 last`, p.okP && P.ids.join(' ') === 'resume chronicle bag settings extra extra leave', P ? P.ids.join(' ') + ` · ${P.cols} column(s)` : 'no panel');
          ok(`${DEV}: every row is a target of 56 px or more, inside the safe area, none on another`, P.rows.every((r) => r.h * S.css >= 55.5 && r.w * S.css >= 56 && inside(r, S)) && P.rows.every((a, i) => P.rows.every((b, j) => i === j || !hits(a, b))), P.rows.map((r) => Math.round(r.w * S.css) + 'x' + Math.round(r.h * S.css)).join(' ') + ' CSS px');
          ok(`${DEV}: the pad is gone while the panel is open`, p.pad === false && p.modal === 'pause');
          await shot('pause');
        }
        // ───────────── the chronicle ─────────────
        if (want('book')) {
          const w0 = await ev(() => window.__F.world());
          const b = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.pauseRow('chronicle'); F.tick(12); const m = F.M(); return { screen: sc.hud.screen, modal: sc.hud.modal, m: m.screen, pad: m.pad?.shown, pause: !!m.pause, safe: F.safe(), model: F.model() }; });
          const S = b.safe, m = b.m;
          ok(`${DEV}: the row 「연대기」 (touch) opens the book; hud.modal stays 'pause', the panel is gone, the pad is gone`, b.screen === 'chronicle' && b.modal === 'pause' && !b.pause && b.pad === false, `screen ${b.screen} modal ${b.modal}`);
          ok(`${DEV}: the book lies inside the safe area`, !!m && inside(m.frame, S) && inside(m.close, S) && inside(m.list, m.frame), m ? `frame ${R(m.frame)} of ${S.w}x${S.h}` : '');
          ok(`${DEV}: the close button is a 56 px target`, !!m && m.close.w * S.css >= 55.5 && m.close.h * S.css >= 55.5, m ? `${Math.round(m.close.w * S.css)} CSS px` : '');
          const rows = m ? m.rows : [], pair = rows.find((r) => r.id === 'graveyard_key');
          ok(`${DEV}: the rows of the save are there, the key's cause and consequence on one row`, rows.length === (b.model.book.split(' ').length) && !!pair && pair.kind === 'pair' && pair.on, b.model.book);
          ok(`${DEV}: two pages of equal width with the fold between`, !!m && m.colW > 100 && Math.abs(m.colW * 2 + m.fold - m.list.w) < 1, m ? `page ${Math.round(m.colW)} · fold ${Math.round(m.fold)}` : '');
          await shot('book');
          // the game stands still behind it
          const w1 = await ev(() => { const F = window.__F; F.tick(120); return F.world(); });
          ok(`${DEV}: the game stands still behind the book (120 ticks: clock, hero, enemies, the story's timers)`, w1.t === w0.t && w1.hero === w0.hero && w1.E === w0.E && w1.waits === w0.waits && w1.seen === w0.seen, `t ${w0.t.toFixed(3)} -> ${w1.t.toFixed(3)}`);
          // no touch falls through: where the attack button and the stick are
          const ft = await ev(() => { const F = window.__F, sc = window.__v2.scene, h0 = F.hero(); const s = sc.state, c = window.__game.canvasRect; F.tapCss(c.x + c.w * 0.9, c.y + c.h * 0.88, 3); F.fire('pointerdown', 51, c.x + c.w * 0.15, c.y + c.h * 0.8); F.tick(3, false); F.fire('pointermove', 51, c.x + c.w * 0.25, c.y + c.h * 0.8); F.tick(8, false); F.fire('pointerup', 51, c.x + c.w * 0.25, c.y + c.h * 0.8); F.tick(4);
            return { h0, h1: F.hero(), screen: sc.hud.screen, stick: sc.game.input.touchStick?.mag ?? sc.game.input._touchVec?.mag ?? 0, atk: sc.game.input.down('attack') }; });
          ok(`${DEV}: touches where the attack button and the stick would be go nowhere (no press, no stick, the hero as he was)`, ft.screen === 'chronicle' && ft.h1.x === ft.h0.x && ft.h1.move === null && ft.h1.buf === '' && ft.h1.inp === '' && !ft.atk && !(ft.stick > 0), JSON.stringify({ move: ft.h1.move, buf: ft.h1.buf, stick: ft.stick }));
          // new rows glow until they have been on screen
          const gl = await ev(() => { const F = window.__F; F.tick(70); return { rows: F.M().screen.rows.filter((r) => r.kind !== 'blank').map((r) => r.isNew), model: F.model() }; });
          ok(`${DEV}: a new entry stops glowing once it has been on screen (0.8 s), and is marked read`, gl.rows.every((x) => x === false) && gl.model.unread === 0 && gl.model.out.read.length >= 3, `read ${gl.model.out.read.join(' ')}`);
          // close: by the button, back to the panel; the closing tap swings nothing
          const cl = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.closeBtn(); F.tick(10); const a = { screen: sc.hud.screen, modal: sc.hud.modal, pause: F.M().pause }; return a; });
          ok(`${DEV}: the close button (touch) closes the book within 0.2 s and the panel is back with 「연대기」 chosen`, cl.screen === null && cl.modal === 'pause' && !!cl.pause && cl.pause.ids[cl.pause.sel] === 'chronicle', `screen ${cl.screen} modal ${cl.modal} sel ${cl.pause?.sel}`);
          // back / ESC closes the top screen first, then the panel
          const esc = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.pauseRow('chronicle'); F.tick(12); const a = sc.hud.screen; F.key('Escape'); F.tick(3); const b = { screen: sc.hud.screen, modal: sc.hud.modal, pause: !!F.M().pause }; F.tick(12); F.key('Escape'); F.tick(3); return { a, b, c: { modal: sc.hud.modal, pause: !!F.M().pause }, h: F.hero() }; });
          ok(`${DEV}: back / ESC closes the book first (the panel stays), a second one closes the panel`, esc.a === 'chronicle' && esc.b.screen === null && esc.b.modal === 'pause' && esc.b.pause && esc.c.modal === null, JSON.stringify(esc.b) + ' -> ' + JSON.stringify(esc.c));
          await touchMode();
          const after = await ev(() => { const F = window.__F; const h0 = F.hero(); F.tick(30); return { h0, h1: F.hero(), pad: F.M().pad?.shown }; });
          ok(`${DEV}: after the last close the game goes on, nothing was carried over (no swing, no roll, no jump)`, after.h1.t > after.h0.t && after.h1.move === null && after.h1.buf === '' && after.pad === true, JSON.stringify({ move: after.h1.move, buf: after.h1.buf, pad: after.pad }));
        }
      }
      await ctx.close();
    }
  } catch (e) { errs.push('[tool] ' + String(e?.stack ?? e).slice(0, 600)); }
  finally { await browser.close(); srv.close(); }
  for (const e of errs) console.log('ERROR ' + e);
  if (errs.length) fails += errs.length;
}
console.log(`\n${fails ? 'FAILED' : 'OK'}: ${passes} passed, ${fails} failed${failed.length ? ' — ' + failed.slice(0, 12).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);
