// SCREENS lane check (docs/v2/UI_API.md 10): the chronicle book, the bag, the item and chronicle cards, the choice cards, Rook's shop.
//   node tools/v2/screens_check.mjs [--out /tmp/claude-0/v2/screens] [--devices fold_open,phone2] [--only node,pause,book,cards,bag,choice,shop,persist,cut,ending,alloc] [--saves <bot saves>] [--shots 1]
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
const PAGE_PARTS = ['pause', 'book', 'cards', 'bag', 'choice', 'shop', 'persist', 'cut', 'ending', 'alloc'];
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
    // (a still takes seconds of real time: the pad's watchdog has taken the pad off meanwhile - two game ticks bring it back, as on a device where the game never stops ticking)
    F.openPause = () => { F.tick(2, false); const p = F.pauseBtn(); if (!p) return false; F.tapCss(p[0], p[1]); F.tick(4); return sc.hud.modal === 'pause' && !!F.M().pause; };
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
      const open = async (sv, q = '', early = false) => {
        const o = typeof sv === 'number' ? saveOf(sv) : sv;
        await page.goto(`http://localhost:${port}/tools/v2/fx_view.css`).catch(() => {});
        if (o !== undefined) await ev((s) => { if (s === null) localStorage.removeItem('bn.v2.save'); else localStorage.setItem('bn.v2.save', JSON.stringify(s)); localStorage.removeItem('bn.v2.ui'); }, o ?? null);
        await page.goto(`http://localhost:${port}/index.html?scene=v2g&v2auto=0&v2res=0.5${q}`);
        if (early) {   // the game is stopped the moment the area stands and the new interface is in (a scene that begins at once - the opening's cut - is then met at its start)
          await page.waitForFunction(() => { const v = window.__v2; if (v?.id === 'g' && v.ready && v.stats?.hud === 'ui') { window.__game._pageHidden = true; return true; } return !!v?.error; }, null, { timeout: 180000, polling: 30 });
          const st = await ev(install); await ev(() => { const F = window.__F, c = window.__game.canvasRect; F.tapCss(c.x + c.w * 0.62, c.y + c.h * 0.36, 1, 60); F.tick(2); });
          return st;
        }
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
        // ───────────── the bag ─────────────
        if (want('bag')) {
          const g = await ev(() => { const F = window.__F, sc = window.__v2.scene; sc.brk.coins = 37; sc.state.coins = 37; F.tick(3); const okP = F.openPause(); F.tick(8); F.pauseRow('bag'); F.tick(12); const m = F.M(); return { okP, screen: sc.hud.screen, modal: sc.hud.modal, m: m.screen, safe: F.safe(), model: F.model(), pad: m.pad?.shown }; });
          const S = g.safe, m = g.m;
          ok(`${DEV}: the row 「가방」 (touch) opens the bag; the game is stopped the same way, the pad is gone`, g.okP && g.screen === 'bag' && g.modal === 'pause' && g.pad === false, `screen ${g.screen} modal ${g.modal}`);
          ok(`${DEV}: the bag lies inside the safe area, its close button is a 56 px target`, !!m && inside(m.frame, S) && inside(m.close, S) && inside(m.list, m.frame) && m.close.w * S.css >= 55.5, m ? `frame ${R(m.frame)} · close ${Math.round(m.close.w * S.css)} CSS px` : '');
          ok(`${DEV}: what he carries: four things of the story on the left, the bread among the things that are used up on the right`, g.model.bag === 'valkrein_knot wolfram_notice key_silver order_slip | lotte_bread' && !!m && m.n === 4, g.model.bag + ` · ${m?.n} rows`);
          ok(`${DEV}: the silver count stands on the bag (37), inside the frame, clear of the close button`, !!m && !!m.coins && m.coins.n === 37 && inside(m.coins, m.frame) && !hits(m.coins, m.close), m ? R(m.coins) + ' n ' + m.coins?.n : '');
          await shot('bag');
          const cl = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.closeBtn(); F.tick(10); const p = F.M().pause, a = { screen: sc.hud.screen, modal: sc.hud.modal, sel: p ? p.ids[p.sel] : null }; F.pauseRow('resume'); F.tick(6); const h0 = F.hero(); F.tick(30); return { a, modal: sc.hud.modal, h0, h1: F.hero() }; });
          ok(`${DEV}: closed by its button the panel is back on 「가방」; 「이어 하기」 (touch) and the game goes on with nothing carried over`, cl.a.screen === null && cl.a.modal === 'pause' && cl.a.sel === 'bag' && cl.modal === null && cl.h1.t > cl.h0.t && cl.h1.move === null && cl.h1.buf === '', JSON.stringify(cl.a));
        }
      }

      // ───────────── the chip and the cards ─────────────
      if (want('cards')) {
        await open(32);
        const c0 = await ev(() => { const F = window.__F; F.tick(20); const m = F.M(); return { chip: m.cards.chip, sounds: F.sounds.slice(), model: F.model(), pause: m.pad?.buttons?.find((q) => q.id === 'pause') ?? null, safe: F.safe(), rect: window.__game.canvasRect }; });
        const S = c0.safe;
        ok(`${DEV}: a save of an earlier build with written entries: the book chip is up after the load, without a chime`, !!c0.chip && c0.model.chip === true && !c0.sounds.includes('book.chime'), `model.chip ${c0.model.chip} sounds [${c0.sounds.join(' ')}]`);
        if (c0.chip && c0.pause) {
          const ch = c0.chip, px = (c0.pause.cx - c0.rect.x) / S.css, py = (c0.pause.cy - c0.rect.y) / S.css, pr = (c0.pause.d / 2 + 8) / S.css;
          const dx = Math.max(ch.x - px, 0, px - (ch.x + ch.w)), dy = Math.max(ch.y - py, 0, py - (ch.y + ch.h)), gap = Math.hypot(dx, dy) - pr;
          ok(`${DEV}: the chip is a 56 px target inside the safe area, clear of the pause button's touch circle`, ch.w * S.css >= 55.5 && ch.h * S.css >= 55.5 && inside(ch, S) && gap >= -0.01, `${Math.round(ch.w * S.css)} CSS px at ${R(ch)} · ${(gap * S.css).toFixed(1)} CSS px from the pause button's circle`);
        }
        await shot('chip');
        const c1 = await ev(() => { const F = window.__F, sc = window.__v2.scene, h0 = F.hero(); F.tapRect(F.M().cards.chip); F.tick(12); const a = { screen: sc.hud.screen, modal: sc.hud.modal, chip: F.model().chip, panel: !!F.M().pause }; F.closeBtn(); F.tick(10); const b = { screen: sc.hud.screen, modal: sc.hud.modal, panel: !!F.M().pause }; F.tick(30); return { a, b, h0, h1: F.hero(), chipNow: !!F.M().cards.chip }; });
        ok(`${DEV}: a touch on the chip opens the book and the chip is gone; closed, the game goes straight on (no panel) - no roll, no swing from either touch`, c1.a.screen === 'chronicle' && c1.a.modal === 'pause' && c1.a.chip === false && c1.b.screen === null && c1.b.modal === null && !c1.b.panel && !c1.chipNow && c1.h1.move === null && c1.h1.buf === '' && c1.h1.dashT <= 0, JSON.stringify({ a: c1.a, b: c1.b, move: c1.h1.move }));
        // the story writes: the grandson's drawer (the spot's interact is raised as its pill would; every page is turned by a touch)
        const run = await ev(() => {
          const F = window.__F, sc = window.__v2.scene, H = sc.host, d = sc.area.interact.find((q) => q.id === 'smithy_door'), seen0 = H.seen.length, t0 = sc.sim.time;
          const hitsR = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
          sc.emit('interact', { id: d.id, kind: d.kind, event: d.event ?? null, data: d.data ?? null, locked: d.locked ?? null, spot: d });
          const out = { maxUp: 0, maxWait: 0, onDialog: 0, onToast: 0, onBanner: 0, onPad: 0, outside: 0, left: 0, kinds: new Set(), cardWhilePlay: 0, tPlay0: 0, tPlay1: 0, pages: 0, rects: [], shotAt: -1 };
          const S = F.safe(), rc = window.__game.canvasRect;
          let dt = 0, tapT = null;
          for (let i = 0; i < 1500; i++) {
            const modal = sc.hud.modal;
            if (modal === 'dialog') { if (++dt >= 9) { dt = 0; F.tap(S.vw / 2, S.vh * 0.3, 1); out.pages++; continue; } }
            F.tick(1, i % 6 === 0);
            const m = F.M(), up = m.cards.up;
            out.maxUp = Math.max(out.maxUp, up.length); out.maxWait = Math.max(out.maxWait, m.cards.waiting);
            for (const c of up) {
              out.kinds.add(c.kind + (c.kind === 'item' ? ':' + c.icon : '')); if (out.rects.length < 6 && !out.rects.some((q) => q.text === c.text)) out.rects.push({ text: c.text, x: c.x, y: c.y, w: c.w, h: c.h });
              if (!(c.x >= S.x && c.y >= S.y && c.x + c.w <= S.x + S.w && c.y + c.h <= S.y + S.h)) out.outside++;
              if (c.x < S.vw * 0.5) out.left++;
              if (m.dialog && (hitsR(c, m.dialog.box) || (m.dialog.cards && m.dialog.cards.rects.some((q) => hitsR(c, q))))) out.onDialog++;
              for (const t of m.hud.toastRects ?? []) if (hitsR(c, t)) out.onToast++;
              if (m.hud.bannerRect && hitsR(c, m.hud.bannerRect)) out.onBanner++;
              if (m.pad && m.pad.shown) for (const b of m.pad.buttons) { if (m.pad.cut && b.id !== 'pause') continue; const bx = (b.cx - rc.x) / S.css, by = (b.cy - rc.y) / S.css, br = b.d / 2 / S.css; if (hitsR(c, { x: bx - br, y: by - br, w: br * 2, h: br * 2 })) out.onPad++; }
              if (!modal) { out.cardWhilePlay++; if (!out.tPlay0) out.tPlay0 = sc.sim.time; out.tPlay1 = sc.sim.time; if (out.shotAt < 0 && c.kind === 'item') out.shotAt = i; }
            }
            if (out.shotAt === i) break;   // (a still is taken here; the loop goes on in the next call)
          }
          return { ...out, kinds: [...out.kinds], seen: H.seen.slice(seen0).filter((e) => e[0] === 'notice').map((e) => e[1]), sounds: F.sounds.slice(), tapT, modal: sc.hud.modal, busy: H.st.busy, chip: F.model().chip, t0, t1: sc.sim.time };
        });
        if (run.shotAt >= 0) await shot('card_item');
        // go on until the card 「연대기에 적혔다」 can be pressed
        const run2 = await ev(() => { const F = window.__F, sc = window.__v2.scene, H = sc.host; let tapT = null, maxUp = 0, play = 0, tA = 0, tB = 0; for (let i = 0; i < 1500; i++) { if (sc.hud.modal === 'dialog') { if (i % 9 === 0) F.tap(F.safe().vw / 2, F.safe().vh * 0.3, 1); else F.tick(1, false); continue; } F.tick(1, i % 6 === 0); const up = F.M().cards.up; maxUp = Math.max(maxUp, up.length); if (!sc.hud.modal && up.length) { play++; if (!tA) tA = sc.sim.time; tB = sc.sim.time; } if (play >= 20 && !sc.hud.modal && !H.st.busy && up.some((c) => c.tap && c.t > 0.2)) { tapT = up.find((c) => c.tap); break; } } return { tapT, maxUp, play, tA, tB, chip: F.model().chip, seen: H.seen.filter((e) => e[0] === 'notice').map((e) => e[1]).slice(-8), sounds: F.sounds.slice() }; });
        const seen = [...new Set([...(run.seen ?? []), ...(run2.seen ?? [])])], sounds = run2.sounds ?? run.sounds;
        ok(`${DEV}: the story's give steps raise the cards 「얻었다 — …」 with the thing's own picture, its chronicle step the card 「연대기에 적혔다 — 묘지 문 열쇠」`, seen.includes('얻었다 — 낡은 은 열쇠') && seen.includes('얻었다 — 빈칸 주문서') && seen.includes('연대기에 적혔다 — 묘지 문 열쇠') && run.kinds.includes('item:key_silver'), seen.join(' · ') + ' · kinds ' + run.kinds.join(' '));
        ok(`${DEV}: the runner adds no second notice for a thing the card has shown (one line each)`, seen.filter((x) => x === '얻었다 — 낡은 은 열쇠').length === 1);
        ok(`${DEV}: the book's chime and the cards' rise go through the feel table`, sounds.includes('book.chime') && sounds.includes('card.rise'), sounds.join(' '));
        ok(`${DEV}: the cards stand at the right under the pause button, inside the safe area: never on the dialogue box, the choice cards, a toast, the banner or a pad button`, run.outside === 0 && run.left === 0 && run.onDialog === 0 && run.onToast === 0 && run.onBanner === 0 && run.onPad === 0 && run.rects.length > 0, `${run.rects.map((r) => R(r)).join(' | ')} · up at once ${Math.max(run.maxUp, run2.maxUp ?? 0)} · waiting at most ${run.maxWait}`);
        ok(`${DEV}: a card does not stop the game (cards were up in play while the rules' clock ran on, hud.modal null)`, run2.play >= 20 && run2.tB - run2.tA > 0.25, `${run2.play} ticks with a card up in play, the rules' clock ${run2.tA.toFixed(2)} -> ${run2.tB.toFixed(2)}`);
        ok(`${DEV}: the chip is up again`, run2.chip === true);
        const T = run2.tapT;
        ok(`${DEV}: the card 「연대기에 적혔다」 is up in play and its touch area is 56 px high`, !!T && T.hitH * S.css >= 55.5, T ? `${T.text} · ${R(T)} · touch ${Math.round(T.hitH * S.css)} CSS px` : 'never up');
        if (T) {
          await shot('card_chronicle');
          const o = await ev((T) => { const F = window.__F, sc = window.__v2.scene, h0 = F.hero(); F.tap(T.x + T.w / 2, T.y + T.h / 2, 2); F.tick(12); const m = F.M().screen, row = m ? m.rows.find((r) => r.id === 'graveyard_key') : null; const a = { screen: sc.hud.screen, modal: sc.hud.modal, row, list: m ? m.list : null, chip: F.model().chip, cards: F.M().cards.up.filter((c) => c.tap).length }; return { a, h0, h1: F.hero() }; }, T);
          const row = o.a.row, L = o.a.list;
          ok(`${DEV}: a touch on that card opens the book AT that entry (its row in the window, new, a pair), the chip goes, the card is gone`, o.a.screen === 'chronicle' && !!row && row.on && row.kind === 'pair' && row.isNew && row.y >= L.y - 1 && row.y + row.h <= L.y + L.h + 1 && o.a.chip === false && o.a.cards === 0, row ? `row ${R(row)} in list ${R(L)}` : 'no row');
          ok(`${DEV}: …and the touch did nothing in the game (no roll, no swing, the hero where he was)`, o.h1.x === o.h0.x && o.h1.move === null && o.h1.buf === '' && o.h1.dashT <= 0);
          await shot('book_at_entry');
          await ev(() => { const F = window.__F; F.closeBtn(); F.tick(10); });
        }
      }

      // ───────────── a choice as cards ─────────────
      if (want('choice')) {
        await open(28);
        const c = await ev(() => {
          const F = window.__F, sc = window.__v2.scene, H = sc.host, S = F.safe();
          const def = sc.area.actors.find((a) => a.talk === 'hadwin1.smithy') ?? { id: 'hadwin1', talk: 'hadwin1.smithy' };
          sc.emit('talk', { id: def.id, talk: 'hadwin1.smithy', actor: def });
          const flags = () => Object.keys(H.st.state.flags).filter((k) => k.startsWith('key_')).join(' ');
          let n = 0, pages = 0; while (n++ < 1200) { const d = F.M().dialog; if (d && d.cards) break; if (sc.hud.modal === 'dialog' && n % 9 === 0) { F.tap(S.vw / 2, S.vh * 0.3, 1); pages++; } else F.tick(1, false); }
          const d0 = F.M().dialog, r = d0.choiceRects;
          // a stray tap meant for the dialogue, on the very place a card has come up, in the tick it came up
          F.tap(r[0].x + r[0].w / 2, r[0].y + r[0].h / 2, 1); const stray = { sel: F.M().dialog?.sel, armed: F.M().dialog?.cards?.armed, flags: flags(), modal: sc.hud.modal };
          F.tick(30); const d1 = F.M().dialog, box = d1.box, top = d1.box.top;
          const lay = { rects: d1.choiceRects, box, top, big: d1.cards.big, safe: S, labels: d1.choices };
          F.tap(r[1].x + r[1].w / 2, r[1].y + r[1].h / 2, 1); F.tick(2); const one = { sel: F.M().dialog?.sel, flags: flags(), modal: sc.hud.modal }; F.draw();
          return { pages, stray, lay, one };
        });
        const S = c.lay.safe, rs = c.lay.rects;
        ok(`${DEV}: the smith's question shows two cards (은 열쇠 · 쇠 열쇠) with picture and line`, rs.length === 2 && c.lay.big === true && c.lay.labels.join(' ') === '은 열쇠 쇠 열쇠', c.lay.labels.join(' / '));
        ok(`${DEV}: a tap meant for the dialogue, landing on a card in the tick the cards come up, chooses nothing`, c.stray.sel === -1 && c.stray.flags === '' && c.stray.modal === 'dialog' && c.stray.armed === false, JSON.stringify(c.stray));
        ok(`${DEV}: each card is 56 px or more both ways, inside the safe area, above the dialogue box, side by side`, rs.every((r) => r.w * S.css >= 56 && r.h * S.css >= 56 && inside(r, S) && r.y + r.h <= c.lay.top + 0.5) && rs[0].x + rs[0].w <= rs[1].x, rs.map((r) => `${Math.round(r.w * S.css)}x${Math.round(r.h * S.css)} CSS at ${R(r)}`).join(' | ') + ` · box top ${Math.round(c.lay.top)}`);
        ok(`${DEV}: the first tap on a card only chooses it (the story has decided nothing)`, c.one.sel === 1 && c.one.flags === '' && c.one.modal === 'dialog', JSON.stringify(c.one));
        await shot('choice');
        const c2 = await ev(() => {
          const F = window.__F, sc = window.__v2.scene, H = sc.host, S = F.safe(), r = F.M().dialog.choiceRects;
          const flags = () => Object.keys(H.st.state.flags).filter((k) => k.startsWith('key_')).join(' ');
          F.tap(S.vw / 2, S.y + 6, 1); F.tick(2); const off = { sel: F.M().dialog?.sel, flags: flags() };
          F.tap(r[0].x + r[0].w / 2, r[0].y + r[0].h / 2, 1); F.tick(9); const a = { sel: F.M().dialog?.sel, flags: flags() };
          F.tap(r[0].x + r[0].w / 2, r[0].y + r[0].h / 2, 1); F.tick(3); let line = ''; for (let i = H.seen.length - 1; i >= 0; i--) if (H.seen[i][0] === 'line') { line = H.seen[i][2]; break; } const b = { flags: flags(), modal: sc.hud.modal, cards: F.M().dialog?.cards ?? null, line };
          let n = 0; while (n++ < 900 && (sc.hud.modal === 'dialog' || H.st.busy)) { if (sc.hud.modal === 'dialog' && n % 9 === 0) F.tap(S.vw / 2, S.vh * 0.3, 1); else F.tick(1, false); }
          return { off, a, b, end: { flags: flags(), modal: sc.hud.modal, busy: H.st.busy, h: F.hero() } };
        });
        ok(`${DEV}: a tap beside the cards lets go of the chosen one`, c2.off.sel === -1 && c2.off.flags === '', JSON.stringify(c2.off));
        ok(`${DEV}: a second tap on the same card decides - 은 열쇠: the cards go and the smith answers the silver (「은이라. …」)`, c2.a.sel === 0 && c2.a.flags === '' && c2.b.cards === null && c2.b.modal === 'dialog' && /^은이라/.test(c2.b.line), JSON.stringify(c2.a) + ' -> ' + c2.b.line.replace(/\n/g, ' / '));
        ok(`${DEV}: the scene ends as written (key_entrusted), nothing of the taps reaches the rules`, c2.end.flags === 'key_order_silver key_entrusted' && c2.end.modal === null && c2.end.h.move === null && c2.end.h.buf === '', JSON.stringify(c2.end.flags));
        // the old pad's built-in HUD shows the same cards
        const st = await open(28, '&v2ui=0');
        const o = await ev(() => {
          const F = window.__F, g = window.__game, sc = window.__v2.scene, H = sc.host, S = F.safe(), cv = g.canvas;
          const cvTap = (lx, ly) => { const c = F.toClient(lx, ly), o = { pointerId: 44, pointerType: 'touch', isPrimary: true, clientX: c[0], clientY: c[1], bubbles: true, cancelable: true, button: 0, buttons: 1 }; cv.dispatchEvent(new PointerEvent('pointerdown', o)); F.tick(1, false); window.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 })); F.tick(1, false); };
          const flags = () => Object.keys(H.st.state.flags).filter((k) => k.startsWith('key_')).join(' ');
          const def = sc.area.actors.find((a) => a.talk === 'hadwin1.smithy') ?? { id: 'hadwin1', talk: 'hadwin1.smithy' };
          sc.emit('talk', { id: def.id, talk: 'hadwin1.smithy', actor: def });
          let n = 0; while (n++ < 2400 && !(sc.hud.choiceCards && sc.hud.choiceCards.open)) { if (sc.hud.modal === 'dialog' && n % 20 === 0) cvTap(S.vw / 2, S.vh * 0.3); else F.tick(1, false); }
          const C = sc.hud.choiceCards; if (!C || !C.open) return { err: 'the cards did not come up on the built-in HUD', kind: sc.hudKind, modal: sc.hud.modal, flags: flags() };
          F.tick(2); const r = C.rects(); cvTap(r[1].x + r[1].w / 2, r[1].y + r[1].h / 2); const stray = { sel: C.sel, flags: flags() };
          F.tick(30); F.draw(); cvTap(r[1].x + r[1].w / 2, r[1].y + r[1].h / 2); F.tick(2); const one = { sel: C.sel, flags: flags(), modal: sc.hud.modal };
          return { kind: sc.hudKind, rects: r, stray, one, safe: S };
        });
        if (o.err) ok(`${DEV}: the old pad's built-in HUD shows the same cards`, false, JSON.stringify(o));
        else {
          await shot('choice_oldpad');
          const o2 = await ev(() => { const F = window.__F, g = window.__game, sc = window.__v2.scene, H = sc.host, C = sc.hud.choiceCards, r = C.rects(), cv = g.canvas;
            const cvTap = (lx, ly) => { const c = F.toClient(lx, ly), o = { pointerId: 44, pointerType: 'touch', isPrimary: true, clientX: c[0], clientY: c[1], bubbles: true, cancelable: true, button: 0, buttons: 1 }; cv.dispatchEvent(new PointerEvent('pointerdown', o)); F.tick(1, false); window.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 })); F.tick(1, false); };
            F.tick(9); cvTap(r[1].x + r[1].w / 2, r[1].y + r[1].h / 2); F.tick(3); const open = C.open, S = F.safe(); let n = 0; while (n++ < 2400 && (sc.hud.modal === 'dialog' || H.st.busy)) { if (sc.hud.modal === 'dialog' && n % 20 === 0) cvTap(S.vw / 2, S.vh * 0.3); else F.tick(1, false); }
            return { open, flags: Object.keys(H.st.state.flags).filter((k) => k.startsWith('key_')).join(' '), modal: sc.hud.modal }; });
          ok(`${DEV}: the old pad's built-in HUD (v2ui=0) asks on the same two cards: an early tap chooses nothing, the first tap chooses, the second decides (쇠 열쇠 -> key_order_iron)`, o.kind === 'builtin' && o.rects.length === 2 && o.stray.sel === -1 && o.stray.flags === '' && o.one.sel === 1 && o.one.flags === '' && o.one.modal === 'dialog' && !o2.open && o2.flags === 'key_order_iron key_entrusted' && o2.modal === null, JSON.stringify({ stray: o.stray, one: o.one, two: o2 }));
          ok(`${DEV}: …cards of 56 px inside the safe area there too`, o.rects.every((r) => r.w * o.safe.css >= 56 && r.h * o.safe.css >= 56 && inside(r, o.safe)), o.rects.map((r) => R(r)).join(' | '));
        }
      }
      // ───────────── Rook's shop ─────────────
      if (want('shop') || want('persist')) {
        await open(33);
        const s0 = await ev(() => { const F = window.__F, sc = window.__v2.scene; sc.brk.coins = 5; sc.state.coins = 5; F.put(3476, 150, -1, 0); F.tick(40); const P = F.M().prompts, p = P.find((q) => q.action === 'confirm') ?? null, t = sc.people.target; return { pill: p, target: t ? t.def.id : null, safe: F.safe() }; });
        const S = s0.safe;
        ok(`${DEV}: before Rook's pack the pill offers his spot (rook_shop)`, !!s0.pill && s0.target === 'rook_shop', `target ${s0.target}`);
        const s1 = await ev((p) => { const F = window.__F, sc = window.__v2.scene; F.tapRect(p); F.tick(16); const m = F.M(); return { screen: sc.hud.screen, modal: sc.hud.modal, m: m.screen, running: sc.host.st.running, pad: m.pad?.shown, sounds: F.sounds.slice() }; }, s0.pill);
        const m = s1.m, SH = (await import(ROOT + 'src/v2/data/shop.js')).SHOP.rook;
        ok(`${DEV}: a touch on the pill opens Rook's shop (the story's step shop: ev_rook_shop waits behind it); the game is stopped, the pad is gone`, s1.screen === 'shop' && s1.modal === 'pause' && s1.running === 'ev_rook_shop' && s1.pad === false, `screen ${s1.screen} modal ${s1.modal} running ${s1.running}`);
        if (m) {
          ok(`${DEV}: the shop lies inside the safe area; close and every good are targets of 56 px or more`, inside(m.frame, S) && inside(m.close, S) && m.close.w * S.css >= 55.5 && m.rows.length === 3 && m.rows.every((r) => r.h * S.css >= 55.5 && r.on && r.y >= m.list.y - 1 && r.y + r.h <= m.list.y + m.list.h + 1), m.rows.map((r) => `${r.id} ${Math.round(r.w * S.css)}x${Math.round(r.h * S.css)}`).join(' · ') + ' CSS px');
          ok(`${DEV}: Rook, his line of tonight, his three goods with a price; the hero's silver (5) stands on it`, m.keeper === '로크' && m.line === SH.line.now && !!m.coins && m.coins.n === 5 && !!m.side && inside(m.side, m.frame) && !hits(m.side, m.list), `${m.keeper}: ${String(m.line).replace(/\n/g, ' / ')} · silver ${m.coins?.n}`);
        }
        await ev(() => window.__F.tick(20)); await shot('shop');
        const bust = await ev(() => window.__F.M().screen?.side?.bust);
        ok(`${DEV}: his bust is drawn from an image that has arrived (it was loaded with the scene)`, bust === true);
        const s2 = await ev(() => { const F = window.__F, sc = window.__v2.scene, n0 = F.sounds.length; F.tapRect(F.M().screen.rows[0]); F.tick(3); const a = F.M().screen; return { say: a.say, sel: a.sel, model: F.model(), sounds: F.sounds.slice(n0) }; });
        ok(`${DEV}: a good he cannot afford (성수 20, silver 5): Rook says so, nothing is chosen or sold, the refusal sounds`, s2.say === SH.say.poor && s2.sel === -1 && s2.model.dr === 0 && s2.model.coins === 5 && s2.sounds.includes('shop.deny'), `${s2.say} · sounds ${s2.sounds.join(' ')}`);
        await shot('shop_poor');
        const s3 = await ev(() => {
          const F = window.__F, sc = window.__v2.scene, M = sc.host.model, row = (i) => F.M().screen.rows[i], coins = (n) => { sc.brk.coins = n; sc.state.coins = n; M.touch(); F.tick(2); };
          coins(45); const n0 = F.sounds.length;
          F.tapRect(row(0)); F.tick(3); const one = { sel: F.M().screen.sel, dr: M.dr, coins: M.coins() }; F.draw();
          return { one, n0 };
        });
        ok(`${DEV}: with 45 silver the first touch on 성수 한 병 only chooses it (「한 번 더 누르면 산다」)`, s3.one.sel === 0 && s3.one.dr === 0 && s3.one.coins === 45, JSON.stringify(s3.one));
        await shot('shop_chosen');
        const s4 = await ev((n0) => {
          const F = window.__F, sc = window.__v2.scene, M = sc.host.model, row = (i) => F.M().screen.rows[i], coins = (n) => { sc.brk.coins = n; sc.state.coins = n; M.touch(); F.tick(2); };
          F.tick(8); F.tapRect(row(0)); F.tick(3); const two = { sel: F.M().screen.sel, dr: M.dr, coins: M.coins(), say: F.M().screen.say, sounds: F.sounds.slice(n0) };
          F.tick(10); F.tapRect(row(0)); F.tick(10); F.tapRect(row(0)); F.tick(3); const three = { dr: M.dr, coins: M.coins(), state: row(0).state };
          coins(45); F.tapRect(row(0)); F.tick(3); const full = { say: F.M().screen.say, dr: M.dr, coins: M.coins(), state: row(0).state };
          sc.sim.hero.reso = 0; M.touch(); F.tick(2); F.tapRect(row(1)); F.tick(10); F.tapRect(row(1)); F.tick(3); const oil = { reso: sc.sim.hero.reso, max: sc.sim.hero.resoMax, coins: M.coins(), state: row(1).state };
          F.tapRect(row(2)); F.tick(3); const guide = { state: row(2).state, say: F.M().screen.say, guide: M.guide, coins: M.coins() };
          return { two, three, full, oil, guide };
        }, s3.n0);
        ok(`${DEV}: a second touch buys: one draught, 20 silver less, Rook thanks, the purchase sounds`, s4.two.dr === 1 && s4.two.coins === 25 && s4.two.say === SH.say.bought && s4.two.sounds.includes('shop.buy') && s4.two.sel === -1, JSON.stringify(s4.two));
        ok(`${DEV}: a second draught (two touches again), then no more: two at most - the row says so and Rook refuses`, s4.three.dr === 2 && s4.three.coins === 5 && s4.three.state === 'full' && s4.full.dr === 2 && s4.full.coins === 45 && s4.full.say === SH.say.full, JSON.stringify(s4.three) + ' ' + JSON.stringify(s4.full));
        ok(`${DEV}: 종 기름 fills the resonance gauge at once (12 silver) and is refused while it is full`, s4.oil.reso === s4.oil.max && s4.oil.max > 0 && s4.oil.coins === 33 && s4.oil.state === 'fullReso', JSON.stringify(s4.oil));
        ok(`${DEV}: 길잡이 초 is refused while no blank can be filled (this save): nothing is taken`, s4.guide.state === 'noBlank' && s4.guide.guide === null && s4.guide.coins === 33 && s4.guide.say === SH.say.none, JSON.stringify(s4.guide));
        const s5 = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.closeBtn(); F.tick(12); const a = { screen: sc.hud.screen, modal: sc.hud.modal, busy: sc.host.st.busy }; const h0 = F.hero(); F.tick(40); const m = F.M(); return { a, h0, h1: F.hero(), pad: m.pad?.shown, dr: m.hud.draughts, coinsChip: m.hud.coins, safe: F.safe(), statusR: m.hud.statusR, boss: null }; });
        ok(`${DEV}: closed by its button the story's step is over and the game goes on - nothing carried over, the pad is back`, s5.a.screen === null && s5.a.modal === null && s5.a.busy === false && s5.h1.t > s5.h0.t && s5.h1.move === null && s5.h1.buf === '' && s5.pad === true, JSON.stringify(s5.a));
        ok(`${DEV}: the HUD shows the two draughts beside the candles (inside the safe area), the rules carry them (hero.draughts 2)`, !!s5.dr && s5.dr.n === 2 && inside(s5.dr, s5.safe) && s5.h1.draughts === 2, s5.dr ? `${R(s5.dr)} n ${s5.dr.n} · hero.draughts ${s5.h1.draughts}` : 'no mark');
        await shot('hud_draught');

        // ───────────── a save and load, a crossing and a fall with the screens' state ─────────────
        if (want('persist')) {
          const p0 = await ev(() => { const F = window.__F, sc = window.__v2.scene; const a = F.openPause(), b = F.pauseRow('chronicle'), c = sc.hud.screen; F.tick(70); F.closeBtn(); F.tick(8); F.pauseRow('resume'); F.tick(6); const ok = sc.host.saveNow('test'); const o = JSON.parse(localStorage.getItem('bn.v2.save')); return { ok, dbg: [a, b, c, sc.hud.modal, F.pauseBtn()], scr: o.scr, coins: o.coins, why: o.why, model: F.model() }; });
          ok(`${DEV}: the save keeps what the screens remember (save.scr: read rows, the chip, the draughts, the guide candle) and the silver`, p0.ok && p0.scr && p0.scr.dr === 2 && p0.scr.chip === false && p0.scr.read.length === 3 && p0.coins === 33, JSON.stringify(p0.scr) + ' coins ' + p0.coins + ' why ' + p0.why + ' dbg ' + JSON.stringify(p0.dbg));
          await open(undefined);
          const p1 = await ev(() => { const F = window.__F; F.tick(10); const m = F.M(); return { model: F.model(), hero: F.hero(), dr: m.hud.draughts, chip: !!m.cards.chip }; });
          ok(`${DEV}: after the load everything is as it was: the book's rows and marks, the bag, two draughts (HUD and rules), 33 silver, no chip`, p1.model.book === p0.model.book && p1.model.bag === p0.model.bag && p1.model.dr === 2 && p1.model.coins === 33 && p1.model.unread === 0 && !p1.chip && p1.hero.draughts === 2 && !!p1.dr && p1.dr.n === 2, `${p1.model.book} | ${p1.model.bag} | dr ${p1.model.dr} coins ${p1.model.coins}`);
          // a crossing (the scene's own, as a long ring at the big bell without a sequence listening would)
          const x0 = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.put(4200, 1392, 0, -1); F.tick(20); return { ok: sc.cross({}), area: window.__v2.area }; });
          let x1 = null; for (let i = 0; i < 90; i++) { x1 = await ev(() => { const F = window.__F, sc = window.__v2.scene; try { for (let k = 0; k < 20; k++) window.__game.tick(1 / 60); F.draw(); } catch { /* between areas */ } return { area: window.__v2.area, ready: window.__v2.ready, xing: !!sc.xing, go: !!sc._go }; }).catch(() => null); if (x1 && x1.ready && !x1.xing && !x1.go && x1.area !== x0.area) break; await page.waitForTimeout(120); }
          const x2 = await ev(() => { const F = window.__F; F.tick(90); const m = F.M(); return { model: F.model(), hero: F.hero(), dr: m.hud.draughts, area: window.__v2.area, busy: window.__v2.scene.host.st.busy }; });
          ok(`${DEV}: after a bell crossing (to ${x2.area}) the screens' state is the same - rows, marks, bag, silver - and the new rules object carries the draughts again`, x0.ok === true && x2.area === 'eshville_past' && x2.model.bag === p0.model.bag && x2.model.dr === 2 && x2.model.coins === 33 && x2.model.unread === 0 && x2.hero.draughts === 2 && !!x2.dr && x2.dr.n === 2, `${x2.model.book} | dr ${x2.model.dr} hero.draughts ${x2.hero.draughts}`);
          // the draught saves the hero once, is gone; with none left he falls; the fall leaves the screens' state alone
          const d1 = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero, n0 = F.sounds.length, seen0 = sc.host.seen.length, deaths0 = sim.deaths, scD = sc._deaths, x0 = h.x, z0 = h.z;
            h.ifr = 0; sc._graceT = 0; h.hp = 3; const r = sim.hurtHero(50, -1, 0, {}); const a = { r, dead: h.dead, hp: h.hp, ifr: h.ifr, draughts: h.draughts, deaths: sim.deaths - deaths0, moved: Math.round(Math.hypot(h.x - x0, h.z - z0)) };
            F.tick(30); const m = F.M(); return { a, modelDr: sc.host.model.dr, hud: m.hud.draughts, sounds: F.sounds.slice(n0), notices: sc.host.seen.slice(seen0).filter((e) => e[0] === 'notice').map((e) => e[1]), scDeaths: sc._deaths === scD, cards: m.cards.up.map((c) => c.text), candle: Math.round(sim.hero.hpMax / (sc.state.candles?.max ?? 3)), modal: sc.hud.modal }; });
          ok(`${DEV}: the draught saves the hero once: he stands with one candle of health, untouchable for 1.2 s, where he was struck`, d1.a.r === 'hurt' && d1.a.dead === false && Math.abs(d1.a.hp - d1.candle) <= 1 && d1.a.ifr >= 1.19 && d1.a.moved < 300, JSON.stringify(d1.a) + ` · a candle = ${d1.candle}`);
          ok(`${DEV}: …it is no fall (sim.deaths unchanged, scene.ch not told), one draught is gone from the HUD, the bag and the rules, and a card says what happened`, d1.a.deaths === 0 && d1.scDeaths && d1.modelDr === 1 && d1.a.draughts === 1 && !!d1.hud && d1.hud.n === 1 && d1.sounds.includes('draught.use') && d1.notices.some((t) => t.startsWith('성수가 쓰였다')) && d1.modal === null, `notices ${d1.notices.join(' · ')} · sounds ${d1.sounds.join(' ')}`);
          await shot('draught_used');
          const d2 = await ev(() => { const F = window.__F, sc = window.__v2.scene, sim = sc.sim, h = sim.hero; F.tick(80); h.ifr = 0; h.hp = 3; sim.hurtHero(50, -1, 0, {}); F.tick(80); const one = { dead: h.dead, dr: sc.host.model.dr }; sim.hero.ifr = 0; sim.hero.hp = 3; const d0 = sim.deaths; sim.hurtHero(50, -1, 0, {}); const fell = sim.hero.dead; let n = 0; while (n++ < 600 && sim.deaths === d0) F.tick(1, false); F.tick(60); return { one, fell, deaths: sc.sim.deaths - d0, model: F.model(), hero: F.hero(), hud: F.M().hud.draughts }; });
          ok(`${DEV}: the second draught saves him again and is gone; the next blow fells him as before (the fall is counted)`, d2.one.dead === false && d2.one.dr === 0 && d2.fell === true && d2.deaths === 1 && d2.hud === null && d2.hero.draughts === 0, JSON.stringify(d2.one) + ` fell ${d2.fell} deaths +${d2.deaths}`);
          ok(`${DEV}: after the fall the screens' state is as it was (rows, marks, bag, silver)`, d2.model.bag === p0.model.bag.replace(' draughtx2', '') && d2.model.book === x2.model.book && d2.model.coins === 33 && d2.model.unread === 0 && d2.hero.dead === false, `${d2.model.book} | ${d2.model.bag} | coins ${d2.model.coins}`);
        }

        // ───────────── the guide candle (a save in which a blank can be filled: the two keepers, 082) ─────────────
        await open(82);
        const g0 = await ev(() => { const F = window.__F, sc = window.__v2.scene; sc.brk.coins = 20; sc.state.coins = 20; F.put(3476, 150, -1, 0); F.tick(40); const P = F.M().prompts, p = P.find((q) => q.action === 'confirm') ?? null, t = sc.people.target; return { pill: p, target: t ? t.def.id : null, area: window.__v2.area, left: sc.state.left }; });
        if (!g0.pill || g0.target !== 'rook_shop') ok(`${DEV}: (1697) the pill at Rook's pack`, false, JSON.stringify({ target: g0.target, area: g0.area, awake: g0.left }));
        else {
          const g1 = await ev((p) => { const F = window.__F, sc = window.__v2.scene, M = sc.host.model; F.tapRect(p); F.tick(16); const m0 = F.M().screen, row = () => F.M().screen.rows[2]; const st0 = row().state; F.tapRect(row()); F.tick(10); F.tapRect(row()); F.tick(4); const a = { line: m0.line, st0, state: row().state, guide: M.guide, coins: M.coins() }; F.draw(); return a; }, g0.pill);
          const SH = (await import(ROOT + 'src/v2/data/shop.js')).SHOP.rook, CH = (await import(ROOT + 'src/v2/data/chronicle.js')).CHRONICLE;
          ok(`${DEV}: in 1697 Rook has that night's line; 길잡이 초 can be bought now (a blank can be filled: 두 종지기) - 8 silver, lit`, g1.line === SH.line.past && g1.st0 === 'ok' && g1.state === 'lit' && g1.guide === 'eshville' && g1.coins === 12, JSON.stringify(g1).slice(0, 200));
          await shot('shop_guide');
          const g2 = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.closeBtn(); F.tick(30); const m = F.M(); return { guide: m.hud.guide, obj: m.hud.objective, toasts: m.hud.toastRects, line: F.model().guideLine, safe: F.safe(), objective: sc.host.objective }; });
          ok(`${DEV}: the objective keeps its own line and a second line under it names where the nearest blank is filled (「${g2.line}」), inside the safe area, on nothing`, g2.line === '빈칸 — ' + CH.two_keepers.place.at && !!g2.guide && inside(g2.guide, g2.safe) && (!g2.obj || !hits(g2.guide, g2.obj)) && g2.toasts.every((t) => !hits(t, g2.guide)), `objective "${g2.objective}" ${R(g2.obj)} · guide ${R(g2.guide)}`);
          await shot('hud_guide');
          if (want('persist')) {
            await ev(() => window.__v2.scene.host.saveNow('test')); await open(undefined);
            const g3 = await ev(() => { const F = window.__F; F.tick(20); return { line: F.model().guideLine, guide: F.M().hud.guide, coins: F.model().coins }; });
            ok(`${DEV}: the guide candle burns on through a save and load`, g3.line === g2.line && !!g3.guide && g3.coins === 12, g3.line);
          }
        }
      }
      // ───────────── a screen opened from the panel during a story cut; 「나가기」 from there ─────────────
      if (want('cut')) {
        const reg = () => ev(async () => { const g = window.__game; if (!g.registry.v2pick) { const m = await import('/src/v2/chooser.js'); g.register('v2pick', m.default); } return true; });
        const toCut = () => ev(() => { const F = window.__F, sc = window.__v2.scene, H = sc.host; let n = 0; while (n++ < 900 && !(H.shot && H.shotLock && H.shotT > 0.5 && H.shotT < 2.7 && !sc.hud.modal)) F.tick(1, false); F.draw(); const m = F.M(); return { n, shotT: H.shotT, lock: H.locks(), modal: sc.hud.modal, pad: m.pad ? { shown: m.pad.shown, cut: m.pad.cut } : null, pills: (sc.state.prompts ?? []).length }; });
        await open(null, '', true);
        const c0 = await toCut();
        ok(`${DEV}: a new game: the opening's camera cut holds the hero (${c0.shotT.toFixed(2)} s left), the pad shows the pause button only, no pill`, c0.lock && c0.modal === null && !!c0.pad && c0.pad.shown && c0.pad.cut && c0.pills === 0, JSON.stringify(c0));
        const c1 = await ev(() => { const F = window.__F, sc = window.__v2.scene; const a = F.openPause(), ids = F.M().pause?.ids.join(' ') ?? '', w0 = F.world(); F.pauseRow('chronicle'); F.tick(12); const s1 = sc.hud.screen, rows = F.M().screen?.rows.map((r) => r.kind).join(' '); F.tick(120); const w1 = F.world(); F.draw(); return { a, ids, s1, rows, w0, w1, modal: sc.hud.modal }; });
        const same = (a, b) => a.t === b.t && a.shotT === b.shotT && a.waits === b.waits && a.seen === b.seen && a.hero === b.hero && a.moves === b.moves && a.walk === b.walk && a.E === b.E;
        ok(`${DEV}: during the cut the pause button (touch) opens the panel and 「연대기」 the book (nothing written yet: one line says so)`, c1.a && c1.ids.includes('chronicle bag') && c1.s1 === 'chronicle' && c1.rows === 'empty' && c1.modal === 'pause', `${c1.ids} · ${c1.s1} · rows ${c1.rows}`);
        ok(`${DEV}: two seconds with the book open in the cut: the shot's timer, the rules' clock and what was shown stand still`, same(c1.w0, c1.w1), `shotT ${c1.w0.shotT.toFixed(4)} -> ${c1.w1.shotT.toFixed(4)} · clock ${c1.w0.t.toFixed(3)} -> ${c1.w1.t.toFixed(3)} · seen ${c1.w0.seen} -> ${c1.w1.seen}`);
        await shot('cut_book');
        const c2 = await ev(() => { const F = window.__F, sc = window.__v2.scene, H = sc.host, w0 = F.world(); F.closeBtn(); F.tick(10); const p = F.M().pause, back = { modal: sc.hud.modal, sel: p ? p.ids[p.sel] : null }; F.pauseRow('bag'); F.tick(12); const s1 = sc.hud.screen; F.tick(120); const w1 = F.world(); F.closeBtn(); F.tick(10); F.pauseRow('resume'); F.tick(1); const modal = sc.hud.modal, left = H.shotT, seenA = H.seen.length; let n = 0; while (n++ < 600 && sc.hud.modal !== 'dialog') F.tick(1, false); F.draw(); const m = F.M(); return { back, s1, w0, w1, modal, left, n, seenA, seenB: H.seen.length, pad: m.pad?.shown, line: H.seen[H.seen.length - 1] }; });
        ok(`${DEV}: closed, the panel is back; 「가방」 opens the bag in the same cut and two more seconds pass without the scene moving`, c2.back.modal === 'pause' && c2.back.sel === 'chronicle' && c2.s1 === 'bag' && same(c2.w0, c2.w1), `shotT ${c2.w0.shotT.toFixed(4)} -> ${c2.w1.shotT.toFixed(4)}`);
        const want2 = Math.round(c2.left * 60);
        ok(`${DEV}: 「이어 하기」: the shot runs out exactly its remaining time (${c2.left.toFixed(2)} s = ${want2} ticks) and the first line follows; nothing was skipped`, c2.modal === null && Math.abs(c2.n - want2) <= 3 && c2.seenB === c2.seenA + 1, `the line opened after ${c2.n} ticks · seen ${c2.seenA} -> ${c2.seenB}`);
        // 「나가기」 from the panel in the cut, after a screen was opened and closed there
        await open(null, '', true); await reg();
        const l0 = await toCut();
        const l1 = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.openPause(); F.pauseRow('chronicle'); F.tick(20); F.closeBtn(); F.tick(10); const a = sc.hud.modal; F.pauseRow('leave'); return { a, lock: sc.host.locks() }; });
        let top = ''; for (let i = 0; i < 60 && top !== 'V2Chooser'; i++) { top = await ev(() => { const g = window.__game; g._pageHidden = true; try { for (let k = 0; k < 20; k++) g.tick(1 / 60); g.alpha = 1; g.render(); } catch { /* between scenes */ } return g.top?.constructor?.name ?? ''; }).catch(() => ''); if (top !== 'V2Chooser') await page.waitForTimeout(150); }
        const sv = await ev(() => localStorage.getItem('bn.v2.save'));
        ok(`${DEV}: 「나가기」 from the panel in the cut (after the book was opened and closed there): the 3D chooser is on top`, l0.lock && l1.a === 'pause' && top === 'V2Chooser', `top ${top} · the save left behind: ${sv ? JSON.stringify((({ why, area, story }) => ({ why, area, done: story.done.length }))(JSON.parse(sv))) : 'none (nothing had happened yet)'}`);
      }

      // ───────────── the ending: a screen during its walk, the crossing in the cut, the card, the book, a reload, the way out ─────────────
      if (want('ending')) {
        await open(82);
        const reg = () => ev(async () => { const g = window.__game; if (!g.registry.v2pick) { const m = await import('/src/v2/chooser.js'); g.register('v2pick', m.default); } return true; });
        await ev(() => {
          const F = window.__F, g = window.__game, v = window.__v2;
          /** ticks with the dialogue pages turned by touch; stops when pred(name) holds */
          F.go = (max, pred) => { let n = 0, d = 0; for (; n < max; n++) { const sc = v.scene, H = sc.host; if (pred && F.preds[pred](sc, H)) break; if (sc.hud.modal === 'dialog') { if (++d >= 9) { d = 0; const S = F.safe(); F.tap(S.vw / 2, S.vh * 0.3, 1); continue; } } try { g.tick(1 / 60); } catch { /* between areas */ } } try { F.draw(); } catch { /* */ } const sc = v.scene, H = sc.host, m = sc.hud.metrics(); return { n, area: v.area, ready: v.ready, modal: sc.hud.modal, busy: H.st.busy, running: H.st.running, xing: !!sc.xing, walk: H.walk ? H.walk.t : -1, lock: H.locks(), end: m.end, screen: sc.hud.screen, endT: sc.ch.endT }; };
          F.preds = { walk: (sc, H) => H.walk !== null && H.walk.t > 0.1, xing: (sc) => !!sc.xing, home: (sc) => v.ready && !sc.xing && !sc._go && v.area === 'eshville_now', end: (sc) => sc.hud.modal === 'end' && !!sc.hud.metrics().end?.ready, card: (sc) => sc.hud.metrics().cards.up.some((c) => c.kind === 'chronicle') };
          F.vis = () => { const out = []; for (const c of document.querySelectorAll('#v2pad canvas')) { const cs = getComputedStyle(c); if (cs.display !== 'none' && Number(cs.opacity) > 0.05 && getComputedStyle(c.parentNode).display !== 'none') out.push(c.dataset.id ?? c.className); } return out; };
        });
        const e0 = await ev(() => { const F = window.__F, sc = window.__v2.scene; F.put(4320, 1400, -1, 0); F.tick(30); sc._ringLong(null); return F.go(600, 'walk'); });
        ok(`${DEV}: the ending begins (the long ring at the big bell in 1697): the story walks the hero to his mark`, e0.running === 'ev_ending' && e0.walk > 0 && e0.lock, JSON.stringify({ running: e0.running, walk: e0.walk, lock: e0.lock }));
        const e1 = await ev(() => { const F = window.__F, sc = window.__v2.scene, H = sc.host, vis = F.vis().join(' '); const a = F.openPause(), w0 = F.world(); F.pauseRow('chronicle'); F.tick(12); const s1 = sc.hud.screen; F.tick(90); const w1 = F.world(); F.closeBtn(); F.tick(8); F.pauseRow('resume'); F.tick(2); const w2 = F.world(); return { a, vis, s1, w0, w1, w2, modal: sc.hud.modal }; });
        ok(`${DEV}: during his walk (moveHero) the pause button is the only thing of the pad on screen; the panel and the book open by touch and the walk stands still (walk time, his place, the people's walks)`, e1.vis === 'pause' && e1.a && e1.s1 === 'chronicle' && e1.w0.walk === e1.w1.walk && e1.w0.hero === e1.w1.hero && e1.w0.moves === e1.w1.moves && e1.w0.t === e1.w1.t, `walk ${e1.w0.walk.toFixed(3)} -> ${e1.w1.walk.toFixed(3)} · hero ${e1.w0.hero} -> ${e1.w1.hero}`);
        ok(`${DEV}: …and goes on from there when the panel is closed`, e1.modal === null && e1.w2.walk > e1.w1.walk, `walk ${e1.w1.walk.toFixed(3)} -> ${e1.w2.walk.toFixed(3)}`);
        // the last crossing, inside the cut: is the pause button there, and does it answer?
        const x0 = await ev(() => window.__F.go(2400, 'xing'));
        const X = []; let home = null;
        for (let i = 0; i < 140; i++) {
          const q = await ev((i) => { const F = window.__F, sc = window.__v2.scene, g = window.__game; let tapped = null, touched = false; if (sc.xing && (i === 2 || i === 8)) { touched = true; const b = F.pauseBtn(); if (b) { F.fire('pointerdown', 46, b[0], b[1]); try { g.tick(1 / 60); } catch { /* */ } F.fire('pointerup', 46, b[0], b[1]); try { g.tick(1 / 60); } catch { /* */ } tapped = sc.hud.modal; if (sc.hud.modal === 'pause') { sc.hud.closePause(); } } } const r = F.go(6, null); const m = sc.hud.metrics(); return { ...r, vis: F.vis().join(' '), pad: m.pad ? { shown: m.pad.shown, cut: m.pad.cut, back: m.pad.back } : null, phase: sc.cx?.phase ?? null, tapped, touched }; }, i).catch(() => null);
          if (!q) { await page.waitForTimeout(150); continue; }
          if (q.xing) X.push(q); else if (q.ready && q.area === 'eshville_now') { home = q; break; }
          await page.waitForTimeout(60);
        }
        const seenBtn = X.filter((q) => q.vis.split(' ').includes('pause')).length, taps = X.filter((q) => q.tapped !== null);
        console.log(`     the crossing in the cut: ${X.length} samples · phases ${[...new Set(X.map((q) => q.phase))].join(' ')} · pause button visible in ${seenBtn} · pad ${JSON.stringify(X[0]?.pad)} · touches where it stands: ${X.filter((q) => q.tapped !== undefined && q.touched).length} -> opened ${taps.length ? taps.map((q) => String(q.tapped)).join(', ') : 'nothing'}`);
        ok(`${DEV}: while the last crossing runs inside the cut the pause button is not on screen (it could not answer there: the scene takes no pause during a crossing)`, x0.xing && X.length > 0 && seenBtn === 0 && taps.length === 0 && X.some((q) => q.touched), `${seenBtn} of ${X.length} samples showed it`);
        ok(`${DEV}: the crossing lands tonight and the last scene plays`, !!home && home.area === 'eshville_now', JSON.stringify(home && { area: home.area, running: home.running }));
        // tonight's side: the chronicle card rises in the scene, the ending card, then the book
        const h1 = await ev(() => { const F = window.__F; const a = F.go(3000, 'card'); const m = F.M(); return { a, cards: m.cards.up, chip: !!m.cards.chip, vis: F.vis().join(' '), banner: m.hud.bannerRect, toasts: m.hud.toastRects }; });
        const cc = h1.cards.find((c) => c.kind === 'chronicle');
        ok(`${DEV}: in the last scene the story's chronicle step raises its card (「${cc?.text ?? ''}」) clear of the banner and the toasts`, !!cc && (!h1.banner || !hits(cc, h1.banner)) && h1.toasts.every((t) => !hits(cc, t)), cc ? R(cc) + ` · banner ${R(h1.banner)}` : JSON.stringify(h1.a));
        await shot('ending_card_chronicle');
        const h2 = await ev(() => window.__F.go(4000, 'end'));
        ok(`${DEV}: the ending card comes up and is ready`, h2.modal === 'end' && h2.end?.ready, JSON.stringify(h2.end));
        await shot('end_card');
        await reg();
        const b1 = await ev(() => { const F = window.__F, sc = window.__v2.scene, S = F.safe(); F.tap(S.vw / 2, S.vh / 2, 1); F.tick(14); const m = F.M(), row = m.screen?.rows.find((r) => r.id === 'two_keepers') ?? null; const o = JSON.parse(localStorage.getItem('bn.v2.save') ?? 'null'); return { screen: sc.hud.screen, modal: sc.hud.modal, row, list: m.screen?.list, top: window.__game.top?.constructor?.name, save: o ? { why: o.why, card: o.ch?.card ?? null, done: o.story.done.includes('ev_ending_home') } : null, book: sc.host.seen.filter((e) => e[0] === 'book').length, endT: sc.ch.endT }; });
        ok(`${DEV}: a touch on the ending card opens the chronicle by itself on what the chapter wrote (두 종지기 in the window, cause and consequence joined); the scene has not left`, b1.screen === 'chronicle' && b1.modal === 'pause' && !!b1.row && b1.row.on && b1.row.kind === 'pair' && b1.top === 'V2Game' && b1.book === 1, b1.row ? `row ${R(b1.row)} in ${R(b1.list)}` : JSON.stringify(b1));
        ok(`${DEV}: nothing was saved by the card's touch: the stored save still says the card was not dismissed`, !!b1.save && b1.save.done === true && !b1.save.card && b1.save.why !== 'end', JSON.stringify(b1.save));
        await ev(() => window.__F.tick(60)); await shot('end_book');
        // a reload with the book open: the card again (then the book) - never a free hero at the bell
        await open(undefined); await reg();
        await ev(() => { const F = window.__F, g = window.__game, v = window.__v2; F.go2 = (max) => { let n = 0, free = 0, firstLock = -1; for (; n < max; n++) { const sc = v.scene, H = sc.host; if (sc.hud.modal === 'end' && sc.hud.metrics().end?.ready) break; const held = H.locks() || !!sc.hud.modal || sc.ch.endT >= 0 || !!sc.ch.pend || !!H.ended; if (held && firstLock < 0) firstLock = n; if (!held) free++; g.tick(1 / 60); } F.draw(); const sc = v.scene; return { n, free, firstLock, modal: sc.hud.modal, end: sc.hud.metrics().end, pend: sc.ch.pend, endT: sc.ch.endT }; }; });
        const r1 = await ev(() => window.__F.go2(1500));
        ok(`${DEV}: reloaded with the book open: the ending card comes back (the hero is never free: the story holds him from the first tick)`, r1.modal === 'end' && r1.end?.ready && r1.free === 0, JSON.stringify({ ticks: r1.n, free: r1.free, modal: r1.modal }));
        const r2 = await ev(() => { const F = window.__F, sc = window.__v2.scene, S = F.safe(); F.tap(S.vw / 2, S.vh / 2, 1); F.tick(40); const a = { screen: sc.hud.screen, rows: F.M().screen?.n }; F.closeBtn(); return a; });
        let top = ''; for (let i = 0; i < 80 && top !== 'V2Chooser'; i++) { top = await ev(() => { const g = window.__game; g._pageHidden = true; try { for (let k = 0; k < 12; k++) g.tick(1 / 60); g.alpha = 1; g.render(); } catch { /* between scenes */ } return g.top?.constructor?.name ?? ''; }).catch(() => ''); if (top !== 'V2Chooser') await page.waitForTimeout(150); }
        const sv = await ev(() => { const o = JSON.parse(localStorage.getItem('bn.v2.save') ?? 'null'); return o ? { why: o.why, card: o.ch?.card ?? null, read: o.scr?.read?.length ?? 0, chip: o.scr?.chip } : null; });
        ok(`${DEV}: the card again, the book again; closed by its button the game leaves as it always did - the 3D chooser, the save written with the card dismissed`, r2.screen === 'chronicle' && top === 'V2Chooser' && !!sv && (sv.why === 'end' || sv.why === 'leave') && sv.card === true && sv.chip === false, `book rows ${r2.rows} · top ${top} · save ${JSON.stringify(sv)}`);
      }

      // ───────────── allocation per frame with each screen open and still; thirty entries flung ─────────────
      if (want('alloc')) {
        await open(33);
        const cdp = await ctx.newCDPSession(page);
        await ev(() => { const F = window.__F, sc = window.__v2.scene; const cv = document.createElement('canvas'), S = sc.state; cv.width = Math.round(S.viewW * 2); cv.height = Math.round(S.viewH * 2); const c = cv.getContext('2d');
          F.frames = (n) => { const S = sc.state; for (let i = 0; i < n; i++) { sc.hud.update(1 / 60, S); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.setTransform(2, 0, 0, 2, 0, 0); sc.hud.draw(c, S); } };
          F.timed = (n) => { const S = sc.state, T = new Float32Array(n); for (let i = 0; i < n; i++) { const t0 = performance.now(); sc.hud.update(1 / 60, S); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height); c.setTransform(2, 0, 0, 2, 0, 0); sc.hud.draw(c, S); T[i] = performance.now() - t0; } return Array.from(T); }; });
        const MINE = /\/src\/v2\/ui\/(screens|cards|choice|model|icons)\.js/;
        const measure = async (label, N = 1500) => {
          await ev(() => window.__F.frames(300));
          await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
          await ev((n) => window.__F.frames(n), N);
          const { profile } = await cdp.send('HeapProfiler.stopSampling');
          let total = 0, mine = 0; const rows = [];
          (function walk(n) { const f = n.callFrame; if (n.selfSize > 0) { total += n.selfSize; const own = MINE.test(f.url); if (own) mine += n.selfSize; rows.push([n.selfSize, `${f.functionName || '(anon)'} ${f.url.split('/').slice(-1)[0]}:${f.lineNumber + 1}`, own]); } for (const c of n.children || []) walk(c); })(profile.head);
          rows.sort((a, b) => b[0] - a[0]);
          const top = rows.filter((r) => r[2]).slice(0, 3).map((r) => `${(r[0] / N).toFixed(0)} B ${r[1]}`).join(' · ');
          console.log(`     ${label}: ${(total / N).toFixed(0)} B/frame in all, ${(mine / N).toFixed(0)} B/frame in the screens' own files${top ? ' (' + top + ')' : ''}`);
          return { total: total / N, mine: mine / N };
        };
        const base = await measure('the HUD alone (no screen)');
        const A = {};
        await ev(() => { const F = window.__F; F.openPause(); F.pauseRow('chronicle'); F.tick(90); }); A.book = await measure('the book open and still');
        await ev(() => { const F = window.__F; F.closeBtn(); F.tick(8); F.pauseRow('bag'); F.tick(60); }); A.bag = await measure('the bag open and still');
        await ev(() => { const F = window.__F, sc = window.__v2.scene; F.closeBtn(); F.tick(8); F.pauseRow('resume'); F.tick(6); sc.hud.openScreen('shop', { shop: 'rook' }); F.tick(60); }); A.shop = await measure('the shop open and still');
        await ev(() => { const F = window.__F, sc = window.__v2.scene; F.closeBtn(); F.tick(8); for (let i = 0; i < 3; i++) sc.hud.card('item', { name: '낡은 은 열쇠', icon: 'key_silver', time: 600 }); F.tick(30); }); A.cards = await measure('three cards up, the chip up');
        await ev(() => { const F = window.__F, sc = window.__v2.scene; sc.hud.showDialog({ speaker: '하드윈 1세', text: '쇠로 하겠소, 은으로 하겠소?', choices: ['은 열쇠', '쇠 열쇠'], choiceMeta: [{ icon: 'key_silver', line: '은은 백 년 뒤에도 그대로다' }, { icon: 'key_iron', line: '쇠는 백 년이면 녹슬어 굳는다' }], onChoice() {} }); F.tick(90); }); A.choice = await measure('the choice cards up and still');
        for (const k of Object.keys(A)) ok(`${DEV}: ${k} open and still - the screens' own code makes no objects per frame (sampled bytes in its files: boxed numbers handed to canvas calls at most)`, A[k].mine <= 400, `${A[k].mine.toFixed(0)} B/frame in screens.js · cards.js · choice.js · model.js · icons.js; the whole HUD ${A[k].total.toFixed(0)} B/frame against ${base.total.toFixed(0)} alone`);
        // thirty entries: drag, let go, momentum
        const perf = await ev(() => {
          const F = window.__F, sc = window.__v2.scene, M = sc.host.model, real = M.book(), R30 = [];
          sc.hud.closeDialog(); F.tick(4);
          for (let i = 0; i < 30; i++) { const src = real[i % real.length], k = i % 3; R30.push(k === 0 ? { id: 'p' + i, kind: 'pair', era: 'past', title: '묘지 문 열쇠 ' + (i + 1), hint: '', L: { title: '대장간에 맡긴 열쇠', text: '하드윈 1세에게 묘지 문 열쇠를 맡겼다.' }, R: { title: '손자의 서랍', text: '손자 하드윈의 서랍에 은 열쇠와 빈칸 주문서가 있었다.' }, key: 'p' + i, isNew: i < 3 } : k === 1 ? { id: 'l' + i, kind: 'line', era: i % 2 ? 'now' : 'past', title: '넷째 붉은 달 ' + (i + 1), hint: '', L: i % 2 ? null : { title: '넷째 붉은 달', text: '1697년 붉은 달 밤, 에드문트 발크레인이 수녀 일곱과 총잡이 울프람을 데리고 성에 올랐다. 백작은 쓰러졌다. 일행은 돌아오지 못했다.' }, R: i % 2 ? { title: '금 간 종', text: '1797년 붉은 달 밤, 박쥐 떼가 성당의 종에 금을 냈다. 종지기 엘리제와 사냥꾼 한 사람이 금 사이로 떨어졌다.' } : null, key: 'l' + i, isNew: false } : { id: 'b' + i, kind: 'blank', era: 'past', title: '식탁의 빈 의자 ' + (i + 1), hint: '그 밤 주막의 식탁에는 의자가 하나 비어 있었다. 누구의 자리였는지 적혀 있지 않다.', L: null, R: null, key: 'b' + i, isNew: false }); }
          M.book = () => R30; M.touch();
          F.openPause(); F.pauseRow('chronicle'); F.tick(20);
          const m0 = F.M().screen, L = m0.list, cx = L.x + L.w * 0.3, cy = L.y + L.h * 0.7, id = 71, c0 = F.toClient(cx, cy);
          F.fire('pointerdown', id, c0[0], c0[1]); F.frames(1);
          const T = []; for (let k = 1; k <= 6; k++) { const c = F.toClient(cx, cy - k * 80); F.fire('pointermove', id, c[0], c[1]); T.push(...F.timed(1)); }
          const c1 = F.toClient(cx, cy - 480); F.fire('pointerup', id, c1[0], c1[1]);
          const m1 = F.M().screen, drag = m1.scroll, v0 = m1.v;
          let unbaked = 0, maxV = 0; for (let k = 0; k < 300; k++) { T.push(...F.timed(1)); const m = F.M().screen; if (m.rows.some((r) => r.on && !r.baked)) unbaked++; maxV = Math.max(maxV, Math.abs(m.v)); }
          const m2 = F.M().screen; T.sort((a, b) => a - b);
          const still = F.timed(120).sort((a, b) => a - b);
          return { n: m0.n, max: m0.max, drag, v0, end: m2.scroll, vEnd: m2.v, maxV, unbaked, baked: m2.baked, ms: { p50: T[T.length >> 1], p95: T[Math.floor(T.length * 0.95)], max: T[T.length - 1], over8: T.filter((t) => t > 8).length, over16: T.filter((t) => t > 16.7).length, frames: T.length }, still: { p50: still[60], max: still[119] } };
        });
        ok(`${DEV}: thirty entries: a drag moves the list with the finger, letting go keeps it moving and it comes to rest (momentum on the game's clock)`, perf.n === 30 && perf.max > 0 && perf.drag > 300 && perf.v0 > 500 && perf.end > perf.drag + 100 && perf.vEnd === 0 && perf.end <= perf.max + 0.5, `dragged ${Math.round(perf.drag)} px, let go at ${Math.round(perf.v0)} px/s, came to rest at ${Math.round(perf.end)} of ${Math.round(perf.max)}`);
        ok(`${DEV}: …no row in the window was ever without its picture, and no frame of the fling took a 60 Hz frame's time (HUD update + draw; this machine, software canvas)`, perf.unbaked === 0 && perf.ms.over16 === 0, `${perf.ms.frames} frames: median ${perf.ms.p50.toFixed(2)} ms · p95 ${perf.ms.p95.toFixed(2)} · longest ${perf.ms.max.toFixed(2)} · over 8 ms ${perf.ms.over8} · at rest median ${perf.still.p50.toFixed(2)} ms · rows kept baked ${perf.baked}`);
        await shot('book30');
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
