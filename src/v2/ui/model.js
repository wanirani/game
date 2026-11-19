// v2 interface - the model of the screens: what the chronicle book, the bag, the shop, the cards and the HUD's small marks show.
// Everything is read from the story runner's state (src/v2/data/run.js) and the story's tables; what the screens themselves remember is five
// small things, kept in the save as `save.scr` (docs/v2/ENGINE_API.md 12.2): which entries have been on screen, whether the book chip is up,
// the draughts carried, the guide candle, and nothing else. docs/v2/UI_API.md 10.
// Pure: no DOM, no imports, no timers - `node tools/v2/screens_check.mjs --node` exercises it without a browser.
//
//   const model = createModel({ STORY, st, coins, setCoins, area, reso, fillReso });
//     st        the runner (createStory): st.state, st.chronicleList(), st.test(conds)
//     coins()   the silver the hero carries          setCoins(n)   after a purchase
//     area()    { id, era, twin } of where he stands (or null)
//     reso()    { v, max } the resonance gauge       fillReso()    Rook's bell oil
//   The story host owns one (storyhost.js `host.model`); the HUD reads it through createHud's `opts.model()`.

const strip = (s) => String(s ?? '').replace(/^(그 밤|오늘 밤) — /, '');
const place = (id) => String(id ?? '').replace(/_(now|past)$/, '');   // both nights of one place share a name

export function createModel(env) {
  const S = env.STORY ?? {}, C = S.CHRONICLE ?? {}, I = S.ITEMS ?? {}, SH = S.SHOP ?? {}, T = (S.TEXT && S.TEXT.screens) || {}, st = env.st;
  const read = new Set();
  const M = {
    rev: 1,            // changes whenever something a screen shows may have changed (the screens bake again)
    dr: 0,             // draughts carried
    guide: null,       // the place (both nights) the guide candle burns in, or null
    chip: false,       // something was written and the book has not been opened since
    T,
  };
  let bookC = null, bookRev = 0, bagC = null, bagRev = 0, guideC = '', guideRev = -1, guideArea = null;
  const test = (conds) => { try { return !conds || !conds.length ? true : !!st.test(conds); } catch { return false; } };
  const written = (id) => st.state.chronicle.indexOf(id) >= 0;
  const touch = () => { M.rev++; };

  /**
   * the rows of the book, in order. A row:
   *   { id, kind: 'line' | 'pair' | 'half' | 'blank' | 'sealed', era ('past' | 'now' - a line's page), title, isNew, key (its read mark),
   *     L: { title, text } | null   the page of that night (1697)        R: { title, text } | null   the page of tonight (1797)
   *     hint }                       a blank: the one line that hints without telling (the chronicle's own gap)
   *   line    a written line, on the page of its era          sealed   a line the chronicle has not finished yet (title only)
   *   blank   nothing done: an empty frame on the left, the hint on the right
   *   half    the deed of that night is done (L), tonight has not been seen (an empty frame on the right)
   *   pair    cause and consequence, joined across the fold
   */
  function book() {
    if (bookC && bookRev === M.rev) return bookC;
    const out = []; let list = [];
    try { list = st.chronicleList(); } catch { list = []; }
    for (const e of list) {
      const c = C[e.id] ?? {}, wr = written(e.id);
      let row;
      if (e.kind !== 'blank') {
        const era = c.era === 'past' ? 'past' : 'now', ok = wr || e.filled, cell = { title: e.title, text: ok ? e.body : '' };
        row = { id: e.id, kind: ok ? 'line' : 'sealed', era, title: e.title, L: era === 'past' ? cell : null, R: era === 'now' ? cell : null, hint: '', key: e.id };
      } else {
        const seen = wr || (e.filled && !c.did), did = seen || (c.did ? test(c.did) : false);
        const kind = seen ? 'pair' : did ? 'half' : 'blank';
        row = { id: e.id, kind, era: 'past', title: e.title, hint: e.body,
          L: did ? { title: c.pastTitle || e.title, text: strip(c.past) } : null,
          R: seen ? { title: c.nowTitle || e.title, text: strip(c.now) } : null, key: kind === 'half' ? e.id + '~' : e.id };
      }
      row.isNew = (row.kind === 'line' || row.kind === 'pair' || row.kind === 'half') && !read.has(row.key);
      out.push(row);
    }
    bookC = out; bookRev = M.rev;
    return out;
  }
  /** the bag: { story: [...], use: [...] } - a thing = { id, name, desc, icon, n, kind } */
  function bag() {
    if (bagC && bagRev === M.rev) return bagC;
    const story = [], use = [], it = st.state.items ?? {};
    for (const id in I) {
      const n = it[id] | 0; if (n <= 0) continue;
      const d = I[id], o = { id, name: d.name, desc: d.desc ?? '', icon: d.icon ?? 'pouch', n, kind: d.kind };
      (d.kind === 'food' ? use : story).push(o);
    }
    if (M.dr > 0) { const g = good('draught'); if (g) use.push({ id: g.id, name: g.name, desc: g.line, icon: g.icon, n: M.dr, kind: 'draught' }); }
    bagC = { story, use }; bagRev = M.rev;
    return bagC;
  }
  function good(use) { for (const k in SH) for (const g of SH[k].goods ?? []) if (g.use === use) return g; return null; }
  /** the blank the guide candle names: shown, its deed not done, and it can be done now - in this area first, then in its twin, then the first in order */
  function nearestBlank() {
    const a = env.area ? env.area() : null; let best = null, rank = 9;
    for (const r of book()) {
      if (r.kind !== 'blank') continue;
      const p = C[r.id] && C[r.id].place; if (!p || !p.at || !test(p.if)) continue;
      const k = a && p.area === a.id ? 0 : a && p.area === a.twin ? 1 : 2;
      if (k < rank) { rank = k; best = p; }
    }
    return best;
  }
  /** what a row of the shop says about itself: 'ok' or why it cannot be bought now */
  function goodState(g) {
    if (g.use === 'draught') { if (g.limit > 0 && M.dr >= g.limit) return 'full'; }
    else if (g.use === 'reso') { const r = env.reso ? env.reso() : null; if (!r || !(r.max > 0) || r.v >= r.max - 1e-6) return 'fullReso'; }
    else if (g.use === 'guide') { if (M.guide) return 'lit'; if (!nearestBlank()) return 'noBlank'; }
    return (env.coins ? env.coins() : 0) >= g.price ? 'ok' : 'poor';
  }
  /** what the shop screen shows (made when it opens and after every purchase, never per frame) */
  function shop(id) {
    const s = SH[id]; if (!s) return null;
    const a = env.area ? env.area() : null, p = (S.PEOPLE ?? {})[s.keeper] ?? {};
    return {
      id, title: s.title ?? '', keeper: p.name ?? '', portrait: p.portrait ?? null, line: (s.line && (s.line[a && a.era === 'past' ? 'past' : 'now'] ?? s.line.now)) || '', say: s.say ?? {},
      goods: (s.goods ?? []).map((g) => ({ id: g.id, name: g.name, line: g.line, price: g.price, icon: g.icon, limit: g.limit | 0, have: g.use === 'draught' ? M.dr : g.use === 'guide' ? (M.guide ? 1 : 0) : 0, state: goodState(g) })),
    };
  }
  /** buy one. -> { ok, why: 'ok' | 'poor' | 'full' | 'fullReso' | 'lit' | 'noBlank' | 'none', good } */
  function buy(id, goodId) {
    const s = SH[id], g = s && (s.goods ?? []).find((q) => q.id === goodId); if (!g) return { ok: false, why: 'none', good: null };
    const why = goodState(g); if (why !== 'ok') return { ok: false, why, good: g };
    env.setCoins((env.coins() | 0) - g.price);
    if (g.use === 'draught') M.dr++;
    else if (g.use === 'reso') env.fillReso();
    else if (g.use === 'guide') { const a = env.area ? env.area() : null; M.guide = a ? place(a.id) : null; }
    touch();
    return { ok: true, why: 'ok', good: g };
  }

  return Object.assign(M, {
    book, bag, shop, buy, touch,
    coins: () => (env.coins ? env.coins() | 0 : 0),
    /** the second line under the objective while the guide candle burns ('' = none) */
    guideLine() {
      if (!M.guide) return '';
      const a = env.area ? env.area() : null, id = a ? a.id : null;
      if (M.rev !== guideRev || id !== guideArea) { guideRev = M.rev; guideArea = id; const p = nearestBlank(); guideC = p ? String(T.guide ?? '{at}').replace('{at}', p.at) : ''; }   // (made again only when something changed: nothing is built per frame)
      return guideC;
    },
    /** a row has been on screen: it stops glowing */
    seen(row) { if (row && row.isNew) { row.isNew = false; read.add(row.key); } },
    unread() { let n = 0; for (const r of book()) if (r.isNew) n++; return n; },
    /** the story's chronicle step wrote an entry: the chip comes up (the HUD plays its chime) */
    wrote() { M.chip = true; touch(); },
    /** the book was opened */
    opened() { M.chip = false; },
    /** the rules used a draught (sim.js _die) */
    draughtUsed() { if (M.dr > 0) M.dr--; touch(); },
    /** the hero arrived somewhere: the guide candle goes out when he has left the place it was lit in */
    enterArea(id) { if (M.guide && place(id) !== M.guide) { M.guide = null; } touch(); },
    // ───── the save (save.scr) ─────
    out() { return { read: Array.from(read), chip: M.chip, dr: M.dr, guide: M.guide }; },
    /** o = save.scr; a save of an earlier build has none: the chip is up when anything was ever written (the book has never been opened) */
    load(o) {
      read.clear(); M.dr = 0; M.guide = null; M.chip = false;
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        if (Array.isArray(o.read)) for (const k of o.read) if (typeof k === 'string' && read.size < 400) read.add(k);
        M.dr = Number.isFinite(o.dr) && o.dr > 0 ? Math.min(9, Math.floor(o.dr)) : 0;
        M.guide = typeof o.guide === 'string' && o.guide ? o.guide : null;
        M.chip = !!o.chip;
      } else M.chip = (st.state.chronicle ?? []).length > 0;
      touch();
    },
    reset() { read.clear(); M.dr = 0; M.guide = null; M.chip = false; touch(); },
  });
}
