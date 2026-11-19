// STORY2-VERIFY (2026-11-19): the second verifier's own chains for tools/v2/chapter_cuts.mjs (its boot, its stills and its numbers per person).
//   node tools/v2/chapter_cuts.mjs --saves <bot saves> --out <dir> --devices fold_open --chains tools/v2/story_verify2_chains.mjs --only v_end_west,v_pause,…
// v_end_<pos>   the ending rung from <pos>: west = every moment (Lotte's question, the years, tonight's first line, the ring shot at three moments, Marta walking in at
//               two, each of the town's lines, the feather line, the card); east (from the PUBLISHED build's own save after the promise, fixtures/saves_apk12/080),
//               south, nw = the bread line, tonight's first line, the town's first line
// v_pause       the pause panel by touch, held open 300 ticks: the opening's timed camera shot; the two keepers' timed shot, Elise's walk under lockInput, the wait
//               step; each scene played to its end afterwards; then 「나가기」 during the two keepers' cut and the save it leaves, loaded and played to the promise
// v_pause_end   the panel during the hero's own walk to the mark (rung from the far west: a way round Lotte) and during the ring shot (Marta and Alberto walking)
// v_hidden      the page hidden (the game's own visibilitychange save) in the middle of the hero's walk and while Marta walks; both saves loaded and played to the
//               card; and the second save with what the published build would have written (no bells_answered, the hero where he rang) - synthesized, said so
// v_fast        rung from behind the bell's posts with a finger on the stick pushing away, every page and every cut tapped at every second tick, to the card
// v_busts       a fresh page load: the first page of each first-time speaker of the ending, 9 ticks after its box opened; what the preload cost
// NOT honest play: the hero is put at a spot and the bell's interact event is raised (as chapter_cuts.mjs does). Honest: touches are pointer events on the pad's own
// button, the pause panel's rows, the dialogue box and the stick zone; time is game ticks; every load is the game's own load of a stored save.
import fs from 'node:fs';
import { contextOptions } from '../qa/lib/viewports.mjs';
export default function (T) {
  const { C, boot, until, idle, P, ev, still, after, put, page, OUT, dev } = T;
  const ok = (c, t) => { put(`${c ? 'ok  ' : 'FAIL'} [sv] ${t}`); return c; };
  const note = (t) => put('     · ' + t);
  const J = (o) => JSON.stringify(o);
  const install = () => ev(() => {
    const g = window.__game, v = window.__v2;
    const fire = (type, x, y, id) => window.dispatchEvent(new PointerEvent(type, { pointerId: id ?? 41, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
    const shotName = () => { const s = v.scene.host?.shot, SH = window.__cc?.SH; if (!s) return null; for (const k in SH ?? {}) if (SH[k] === s) return k; return '?'; };
    const render = () => { try { g.alpha = 1; g.render(); } catch { /* between areas */ } };
    const css = (r) => { const rc = g.canvasRect; return { x: rc.x + (r.x + r.w / 2) * g.cssScale, y: rc.y + (r.y + r.h / 2) * g.cssScale }; };
    const S = (window.__sv = {
      spk: {}, log: [], last: '',
      st() {
        const sc = v.scene, H = sc.host, sim = sc.sim, h = sim?.hero, ready = !!v.ready && !!sim; let M = {}; try { M = sc.hud.metrics?.() ?? {}; } catch { /* */ } const vis = [];
        for (const c of document.querySelectorAll('#v2pad canvas')) { const cs = getComputedStyle(c); if (cs.display !== 'none' && Number(cs.opacity) > 0.05 && getComputedStyle(c.parentNode).display !== 'none') vis.push(c.dataset.id ?? c.className); }
        const S2 = H?.seen ?? []; let line = '', spk = ''; for (let i = S2.length - 1; i >= 0; i--) if (S2[i][0] === 'line') { spk = S2[i][1]; line = S2[i][1] + ': ' + S2[i][2]; break; }
        const w = H?.walk ?? null, who = {};
        if (ready) for (const p of sc.people.list) if (p.on) who[p.id] = [Math.round(p.x), Math.round(p.z), Math.round(p.y), +(+p.a3.dx).toFixed(1), +(+p.a3.dz).toFixed(1), p.clip ?? ''];
        return { top: g.top?.constructor?.name ?? '', ready, area: v.area, modal: sc.hud.modal ?? null, shot: ready ? shotName() : null, shotT: +(+(H?.shotT ?? 0)).toFixed(4), lock: !!H?.locks?.(), inputLock: !!H?.inputLock, busy: !!H?.st?.busy,
          waits: (H?.waits ?? []).map((q) => +(+q.t).toFixed(4)), moves: (H?.moves ?? []).map((m) => [m.p.id, +m.p.x.toFixed(1), +m.p.z.toFixed(1)]), walk: w ? { t: +w.t.toFixed(3), cap: +(+w.cap).toFixed(2), at: +w.at.toFixed(3), n: w.path ? w.path.length : 0, turns: w.turns } : null,
          seen: S2.length, simT: +(sim?.time ?? 0).toFixed(4), hero: h ? [+h.x.toFixed(1), +h.z.toFixed(1), Math.round(h.y)] : null, face: h ? [+(h.dirX ?? 0).toFixed(2), +(h.dirZ ?? 0).toFixed(2)] : null, hp: h ? Math.round(h.hp) : null,
          pad: M.pad ? { shown: M.pad.shown, cut: M.pad.cut, back: M.pad.back } : null, vis, pills: Array.from(sc.state?.prompts ?? []).length, line, spk, newSpk: !!spk && sc.hud.modal === 'dialog' && !S.spk[spk],
          banner: M.hud?.banner ?? null, bannerTitle: M.hud?.bannerTitle ?? '', who, warn: H?.warnings?.length ?? 0, ended: H?.ended ?? null, go: sc._go ? (sc._go.same ? 'same' : 'go') : null, fade: +(+(sc.fadeA ?? 0)).toFixed(2), msg: sc.state?.message ?? '' };
      },
      tick(n) { g._pageHidden = true; for (let i = 0; i < n; i++) g.tick(1 / 60); render(); return S.st(); },
      /** tick until fn(state) holds (at most max ticks). adv: 0 = no page is turned · n = a page every n ticks (hud.advanceDialog) · 'tap' = a finger on the dialogue box
       *  (or, during a cut, on the place of the attack button) every second tick */
      until(src, max, adv) {
        const fn = new Function('s', 'return (' + src + ')'); g._pageHidden = true; let d = 0;
        for (let i = 0; i < max; i++) {
          const s = S.st();
          if (s.line !== S.last) { S.last = s.line; S.log.push([s.line.replace(/\n/g, ' / ').slice(0, 26), s.hero, s.who.marta ?? null, s.who.alberto ?? null, s.who.elise ?? null, s.moves.length]); }
          if (fn(s)) { render(); return { n: i, ...s }; }
          if (adv === 'tap') { if ((i & 1) === 0) S.tapAny(s); } else if (adv > 0 && s.modal === 'dialog' && ++d >= adv) { d = 0; v.scene.hud.advanceDialog(); }
          g.tick(1 / 60);
        }
        return { n: -1, ...S.st() };
      },
      taps: 0, tapsOnBox: 0,
      tapAny(s) {
        let M = {}; try { M = v.scene.hud.metrics?.() ?? {}; } catch { /* */ }
        if (s.modal === 'dialog' && M.dialog?.box) { const p = css(M.dialog.box); fire('pointerdown', p.x, p.y, 43); fire('pointerup', p.x, p.y, 43); S.tapsOnBox++; }
        else { const b = (M.pad?.buttons ?? []).find((q) => q.id === 'attack') ?? (M.pad?.buttons ?? []).find((q) => q.id !== 'pause'); const x = b && b.cx > 0 ? b.cx : innerWidth * 0.8, y = b && b.cy > 0 ? b.cy : innerHeight * 0.7; fire('pointerdown', x, y, 43); fire('pointerup', x, y, 43); }
        S.taps++;
      },
      tapPause() { const b = (v.scene.hud.metrics().pad?.buttons ?? []).find((q) => q.id === 'pause'); if (!b || !(b.cx > 0)) return { err: 'no pause button' }; fire('pointerdown', b.cx, b.cy); fire('pointerup', b.cx, b.cy); return { x: Math.round(b.cx), y: Math.round(b.cy) }; },
      tapRow(id) { render(); const m = v.scene.hud.metrics().pause; if (!m) return { err: 'no pause panel' }; const i = m.ids.indexOf(id); if (i < 0) return { err: 'no row ' + id + ' in ' + m.ids.join(' ') }; const p = css(m.rows[i]); fire('pointerdown', p.x, p.y); fire('pointerup', p.x, p.y); return { ids: m.ids, x: Math.round(p.x), y: Math.round(p.y) }; },
      /** a finger down on the stick, pushed (ux, uy) of its radius - and kept down */
      stickDown(ux, uy) { const m = v.scene.hud.metrics().pad?.stick; if (!m) return { err: 'no stick' }; fire('pointerdown', m.cx, m.cy, 42); fire('pointermove', m.cx + ux * m.r, m.cy + uy * m.r, 42); return { cx: Math.round(m.cx), cy: Math.round(m.cy), r: Math.round(m.r) }; },
      stickUp() { const m = v.scene.hud.metrics().pad?.stick; fire('pointerup', m?.cx ?? 0, m?.cy ?? 0, 42); return true; },
      /** the hero's walk to the mark, tick by tick: when it began, how long, the longest step of one tick (a pop), whether he was set down */
      walk(max, tap) {
        g._pageHidden = true; const H = v.scene.host, h = v.scene.sim.hero; let i = 0, began = -1, n = 0, maxStep = 0, px = h.x, pz = h.z, len = 0; const from = [Math.round(h.x), Math.round(h.z)], n0 = H.seen.length;
        for (; i < max; i++) { if (H.walk !== null && began < 0) began = i; if (began >= 0 && H.walk === null) break; if (tap && (i & 1) === 0) S.tapAny(S.st()); g.tick(1 / 60); const d = Math.hypot(h.x - px, h.z - pz); if (began >= 0) { n++; len += d; if (d > maxStep) maxStep = d; } px = h.x; pz = h.z; if (v.scene.hud.modal === 'dialog' && began < 0) break; }
        render();
        return { began, ticks: n, len: Math.round(len), maxStep: +maxStep.toFixed(1), from, to: [+h.x.toFixed(1), +h.z.toFixed(1)], face: [+(h.dirX ?? 0).toFixed(2), +(h.dirZ ?? 0).toFixed(2)], notes: H.seen.slice(n0).filter((q) => q[0] === 'hero' || q[0] === 'placed').map((q) => q[0] + ' ' + q[1]), over: H.walk === null };
      },
      hide() { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return localStorage.getItem('bn.v2.save'); },
      show() { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); g._pageHidden = true; return true; },
      busts() { const sc = v.scene, R = performance.getEntriesByType('resource').filter((e) => /portraits\//.test(e.name)); let a = 1e12, b = 0, bytes = 0; for (const e of R) { if (e.startTime < a) a = e.startTime; if (e.responseEnd > b) b = e.responseEnd; bytes += e.encodedBodySize || e.transferSize || 0; }
        return { pre: sc.hud.portraitsReady ?? null, waitMs: sc.bustsWaitMs ?? null, loadMs: sc.loadMs ?? null, files: R.length, firstStart: Math.round(a), lastEnd: Math.round(b), bytes, now: Math.round(performance.now()) }; },
    });
    return true;
  });
  const S = (name, ...a) => ev(([n, b]) => window.__sv[n](...b), [name, a]);
  /** tick until the condition (a string over the state) holds; goes back to the page's own tasks between chunks (an area load needs them) */
  const U = async (src, max = 40, adv = 6) => { let s = null; for (let i = 0; i < max; i++) { s = await ev(([a, b]) => window.__sv.until(a, 45, b), [src, adv]); if (s.n >= 0) { s.ticks = i * 45 + s.n; return s; } if (!s.ready) await page().waitForTimeout(250); } s.ticks = -1; return s; };
  const shot = async (id) => { const d = `${OUT}/${dev()}`; fs.mkdirSync(d, { recursive: true }); const f = `${d}/sv_${id}.png`; await ev(() => { try { window.__game.alpha = 1; window.__game.render(); } catch { /* */ } }); await page().screenshot({ path: f }); put(`     still ${f}`); return f; };
  const chooser = () => ev(async () => { const g = window.__game; if (!g.registry.v2pick) { const m = await import('/src/v2/chooser.js'); g.register('v2pick', m.default); } return true; });
  const FREE = "s.ready && !s.lock && !s.busy && s.modal === null && !s.go";
  const near = (p, x, z, r) => !!p && Math.hypot(p[0] - x, p[1] - z) <= (r ?? 6);

  async function pauseHold(what, n, keys) {
    await S('tick', 1);
    const a = await S('st'), t = await S('tapPause'), b = await S('tick', 1);
    ok(!t.err && b.modal === 'pause', `${what}: a touch on 「멈춤」 opens the pause panel (${J(t)}, modal ${b.modal}; before the touch: lock ${a.lock}, on screen ${a.vis.join(' ') || 'none'})`);
    const c = await S('tick', n), diff = keys.filter((k) => J(a[k]) !== J(c[k]));
    ok(c.modal === 'pause' && diff.length === 0, `${what}: ${n} ticks with the panel open - nothing ran (${keys.map((k) => `${k} ${J(a[k])}`).join('; ').slice(0, 330)}${diff.length ? ' — CHANGED: ' + diff.map((k) => `${k} -> ${J(c[k])}`).join('; ').slice(0, 300) : ''})`);
    ok(c.vis.length === 0, `${what}: with the panel open nothing of the pad is on screen (${c.vis.join(' ') || 'none'})`);
    return { a, c };
  }
  const resume = async (what) => { const r = await S('tapRow', 'resume'), d = await S('tick', 1); ok(!r.err && d.modal !== 'pause' && d.lock, `${what}: a touch on 「계속」 closes it and the story still holds the hero (modal ${d.modal}, lock ${d.lock}, busy ${d.busy})`); return d; };
  async function toKeepers() {
    await boot(after('ev_boss_sent')); await idle();
    const b = await ev(() => { const d = window.__v2.scene.area.interact.find((q) => q.id === 'bell_arena'); return { x: d.x, z: d.z, y: d.y ?? 0 }; });
    await P('putY', b.x, b.z - 44, b.y); await ev(() => window.__cc.until({ idle: true }, 30)); await P('ring', 'bell_arena'); await until({ area: 'ossuary_past' }, 160);
    await P('putY', 600, 3760, 0); const u = await P('use', 'oss_elise|elise'); if (u.err) throw new Error(u.err);
    const s = await until({ line: '찾았네요' }, 200); await install(); return s;
  }
  const BELL = () => ev(() => { const d = window.__v2.scene.area.interact.find((q) => q.id === 'big_bell'); return { x: d.x, z: d.z, y: d.y ?? 0 }; });
  async function toRing(dx, dz, saveStr) {
    await boot(saveStr ?? after('ev_keepers')); await idle(); await install();
    const s0 = await S('st'), b = await BELL();
    const at = await P('putY', b.x + dx, b.z + dz, b.y); await ev(() => window.__cc.until({ idle: true }, 30));
    return { b, at, s0 };
  }
  const keepersEnd = async (what) => {
    const z = await U(FREE, 60, 6), z2 = await S('tick', 90), fl = await ev(() => { try { return JSON.parse(localStorage.getItem('bn.v2.save')).story.flags ?? {}; } catch { return {}; } });
    ok(z.ticks >= 0 && near(z.who.elise, 4296, 1436) && near(z.who.lotte, 4104, 1436) && z.pad && z.pad.shown && !z.pad.cut && z.vis.length >= 6, `${what}: the scene ends as written - Elise ${J(z.who.elise)}, Lotte ${J(z.who.lotte)}, the hero free at ${J(z.hero)} with the whole pad back (${z.vis.length} pieces), last line ${z.line.replace(/\n/g, ' / ').slice(0, 30)}`);
    ok(z2.ready && !z2.go && !z2.msg && z2.vis.length >= 6 && !!fl.keepers_promised, `${what}: 1.5 s later nothing is built again, no message, the pad stays; the save has keepers_promised (${!!fl.keepers_promised}); host warnings ${z2.warn}`);
    return z2;
  };

  // ───────── the ending from where he rang ─────────
  const POS = { west: [-70, -6], east: [70, -6], south: [0, -72], nw: [-96, 96] };
  for (const tag of Object.keys(POS)) C('v_end_' + tag, `the ending rung from ${tag} of the bell (${POS[tag]})${tag === 'east' ? " - from the published build's own save (apk12 080)" : ''}`, async () => {
    const [dx, dz] = POS[tag]; let sv = null;
    if (tag === 'east') { const o = JSON.parse(fs.readFileSync('tools/v2/fixtures/saves_apk12/080_ev_keepers.json', 'utf8')); sv = JSON.stringify(o.save ?? o); }
    const { b, at, s0 } = await toRing(dx, dz, sv);
    ok(near(s0.who.lotte, 4104, 1436) && near(s0.who.elise, 4296, 1436) && s0.who.lotte[3] > 0.5 && s0.who.elise[3] < -0.5, `the load after the promise: Lotte ${J(s0.who.lotte)} and Elise ${J(s0.who.elise)} stand on their marks and look at each other (x, z, y, facing dx, dz, clip); the hero ${J(s0.hero)}; banner ${s0.banner ?? 'none'} ${s0.bannerTitle}`);
    note(`${tag}: he rings from ${J(at)}, ${Math.round(Math.hypot(at[0] - b.x, at[1] - b.z))} px from the bell's spot`);
    await P('ring', 'big_bell');
    const w = await S('walk', 500);
    ok(w.began >= 0 && w.over && !w.notes.some((q) => q.startsWith('placed')) && w.maxStep < 9 && near(w.to, 4200, 1390, 10), `${tag}: he walks to the mark - ${w.ticks} ticks, ${w.len} px, longest step of a tick ${w.maxStep} px, ${J(w.from)} -> ${J(w.to)}, facing ${J(w.face)}; ${J(w.notes)}`);
    await until({ line: '빵은' }, 200); await still(`${tag}_bread`, '로테의 물음 (ev_ending)', ['hero', 'lotte', 'elise'], 'ev_ending'); note('who ' + J((await S('st')).who));
    if (tag === 'west') { await until({ shot: 'years', mid: true }, 200); await still(`${tag}_years`, '백 년이 흐른다 (camera years)', ['hero'], 'ev_ending'); }
    await until({ line: '엘리제가 답한다' }, 300); await still(`${tag}_home_first`, '오늘 밤의 첫 줄 (ev_ending_home)', ['hero', 'elise'], 'ev_ending_home'); { const s = await S('st'); note('who ' + J(s.who) + ' hero ' + J(s.hero) + ' facing ' + J(s.face) + ' banner ' + (s.banner ?? 'none') + ' ' + s.bannerTitle); }
    if (tag === 'west') {
      await until({ shot: 'ring_widen', mid: true }, 300); await still(`${tag}_ring_1s0`, '종소리가 넓어진다 - 1.0 s', [], 'ev_ending_home'); note('who ' + J((await S('st')).who));
      await S('tick', 66); await still(`${tag}_ring_2s1`, '종소리가 넓어진다 - 2.1 s', [], 'ev_ending_home'); note('who ' + J((await S('st')).who));
      await S('tick', 84); await still(`${tag}_ring_3s5`, '종소리가 넓어진다 - 3.5 s', [], 'ev_ending_home'); note('who ' + J((await S('st')).who));
      const m1 = await S('tick', 42); await still(`${tag}_marta_in_4s2`, `마르타가 들어온다 - 4.2 s (shot ${m1.shot})`, ['hero', 'elise', 'alberto'], 'ev_ending_home'); note('who ' + J(m1.who));
      const m2 = await S('tick', 24); await still(`${tag}_marta_in_4s6`, `마르타가 들어온다 - 4.6 s (shot ${m2.shot})`, ['hero', 'elise', 'alberto'], 'ev_ending_home'); note('who ' + J(m2.who));
    }
    const A = ['hero', 'elise', 'alberto', 'marta'];
    await until({ line: '엘리제! 이 녀석' }, 400); await still(`${tag}_town1`, '마을 1 — 마르타 「엘리제! 이 녀석」', A, 'ev_ending_home'); note('who ' + J((await S('st')).who));
    if (tag !== 'west') return;
    await until({ line: '이모!' }, 300); await still(`${tag}_town2`, '마을 2 — 엘리제 「이모!」', A, 'ev_ending_home');
    await until({ line: '수프 식겠다' }, 300); await still(`${tag}_town3`, '마을 3 — 마르타 「수프 식겠다, 가자」', A, 'ev_ending_home');
    await until({ line: '…로테?' }, 300); await still(`${tag}_town4`, '마을 4 — 알베르토 「…로테?」', A, 'ev_ending_home');
    await until({ line: '아닐세' }, 300); await still(`${tag}_town5`, '마을 5 — 알베르토 「…아닐세」', A, 'ev_ending_home');
    await until({ line: '까마귀' }, 300); await still(`${tag}_feather`, '해설의 마지막 줄 — 여관 창 (camera inn_window)', [], 'ev_ending_home');
    await until({ modal: 'end' }, 200); await still(`${tag}_card`, '맺음 카드', [], 'ev_ending_home'); const z = await S('st'); note(`at the card: ended ${z.ended}, host warnings ${z.warn}, banner ${z.banner ?? 'none'} ${z.bannerTitle}, pad pieces ${z.vis.length}`);
  });

  // ───────── the pause panel during cuts ─────────
  C('v_pause', 'the pause panel by touch, 300 ticks open: the opening shot; the two keepers (timed shot, walk, wait); leave during the keepers cut and load', async () => {
    await boot(null); await install();
    const s0 = await U("s.shot === 'moon_bell' && s.lock && s.shotT > 0 && s.shotT < 2.6", 20, 0);
    ok(s0.ticks >= 0 && s0.vis.join(' ') === 'pause' && s0.pills === 0, `the opening's cut: camera moon_bell, ${s0.shotT} s left; on screen of the pad: ${s0.vis.join(' ') || 'none'}; pills ${s0.pills}; banner ${s0.banner ?? 'none'} ${s0.bannerTitle}`);
    await shot('opening_cut');
    const A = await pauseHold('opening shot', 300, ['shotT', 'simT', 'seen', 'hero', 'waits', 'moves', 'who']); await shot('opening_paused');
    await resume('opening shot');
    const e = await U("s.modal === 'dialog'", 20, 0), want = Math.round(A.a.shotT * 60);
    ok(e.ticks >= 0 && Math.abs(e.ticks + 1 - want) <= 3, `opening shot: it runs out its rest (${A.a.shotT} s = ${want} ticks; the first line after ${e.ticks + 1}): ${e.line.replace(/\n/g, ' / ').slice(0, 40)}`);
    const f = await U("s.ready && !s.lock && s.modal === null && !s.go && !!s.pad && s.pad.shown && !s.pad.cut", 80, 6);
    ok(f.ticks >= 0 && f.pad && f.pad.shown && !f.pad.cut && f.vis.length >= 6, `the opening ends: the hero free at ${J(f.hero)}, the whole pad back (${f.vis.length} pieces), ${f.seen} entries shown, host warnings ${f.warn}`);
    // the two keepers
    await toKeepers();
    const c0 = await U("s.shot === 'two_keepers' && s.shotT > 0.2 && s.modal === null", 30, 6);
    ok(c0.ticks >= 0 && c0.vis.join(' ') === 'pause' && c0.pills === 0 && !(c0.banner === 'area'), `the two keepers' timed shot: ${c0.shotT} s left; on screen of the pad: ${c0.vis.join(' ') || 'none'}; pills ${c0.pills}; banner ${c0.banner ?? 'none'} ${c0.bannerTitle}`);
    await shot('keepers_cut');
    const K = await pauseHold('keepers timed shot', 300, ['shotT', 'simT', 'seen', 'hero', 'waits', 'moves', 'who']); await resume('keepers timed shot');
    const w0 = await U("s.moves.length > 0 && s.moves[0][0] === 'elise' && s.moves[0][1] > 4060 && s.modal === null", 30, 6);
    ok(w0.ticks >= 0 && w0.inputLock, `Elise walks under lockInput: ${J(w0.moves[0])} (shot time left ${w0.shotT})`);
    const W = await pauseHold("Elise's walk", 300, ['moves', 'simT', 'seen', 'hero', 'waits', 'who']); await shot('keepers_walk_paused'); await resume("Elise's walk");
    const w1 = await S('tick', 10);
    ok(w1.moves.length > 0 && Math.hypot(w1.moves[0][1] - W.a.moves[0][1], w1.moves[0][2] - W.a.moves[0][2]) > 12 && Math.hypot(w1.moves[0][1] - W.a.moves[0][1], w1.moves[0][2] - W.a.moves[0][2]) < 40, `she walks on from where she was: ${J(W.a.moves[0])} -> ${J(w1.moves[0])} in 11 ticks`);
    const q0 = await U("s.waits.length > 0 && s.moves.length === 0 && s.modal === null", 30, 6);
    ok(q0.ticks >= 0, `the wait step: ${q0.waits[0]} s left`);
    const Q = await pauseHold('the wait step', 300, ['waits', 'simT', 'seen', 'hero', 'who']); await resume('the wait step');
    const q1 = await U("s.modal === 'dialog'", 20, 0), wq = Math.round(Q.a.waits[0] * 60);
    ok(q1.ticks >= 0 && Math.abs(q1.ticks + 1 - wq) <= 3 && q1.line.includes('엘리제예요'), `the wait runs out its rest (${wq} ticks; next line after ${q1.ticks + 1}): ${q1.line.replace(/\n/g, ' / ').slice(0, 40)}`);
    void K; await keepersEnd('after three pauses');
    // leave during the keepers' cut, load the save it leaves, play the scene to its end
    await toKeepers(); await chooser();
    const l0 = await U("s.shot === 'two_keepers' && s.shotT > 0.2 && s.modal === null", 30, 6); await S('tapPause'); const l1 = await S('tick', 1), r = await S('tapRow', 'leave'); let top = '';
    for (let i = 0; i < 40 && top !== 'V2Chooser'; i++) { top = await ev(() => { const g = window.__game; g._pageHidden = true; for (let k = 0; k < 20; k++) g.tick(1 / 60); return g.top?.constructor?.name ?? ''; }); if (top !== 'V2Chooser') await page().waitForTimeout(200); }
    ok(l0.ticks >= 0 && l1.modal === 'pause' && !r.err && top === 'V2Chooser', `「나가기」 during the two keepers' timed shot: the 3D chooser is on top (rows ${r.ids?.join(' ')}, top ${top})`);
    const sv = await ev(() => localStorage.getItem('bn.v2.save')), o = sv ? JSON.parse(sv) : null;
    note(`the save left behind: ${o ? J({ why: o.why, area: o.area, promised: !!o.story.flags?.keepers_promised, found: !!o.story.flags?.elise_found, pos: o.pos }) : 'none'}`);
    await boot(sv); await install();
    const z = await U("s.modal === 'dialog' && s.line.includes('찾았네요')", 40, 0);
    ok(z.ticks >= 0 && near(z.who.lotte, 4104, 1436, 80) && !!z.who.elise, `that save loads into the scene's first line: the hero ${J(z.hero)}, Elise ${J(z.who.elise)}, Lotte ${J(z.who.lotte)}; banner ${z.banner ?? 'none'} ${z.bannerTitle}`);
    await shot('keepers_loaded_first_line');
    await keepersEnd('the loaded save, played on');
  });

  C('v_pause_end', "the pause panel during the hero's own walk to the mark and during the ring shot; the ending to its card", async () => {
    const { at } = await toRing(-137, 0); note(`rung from ${J(at)} (the far west: Lotte stands in the straight way)`);
    await P('ring', 'big_bell');
    const w = await U('s.walk !== null && s.walk.t > 0.25', 20, 0);
    ok(w.ticks >= 0 && w.vis.join(' ') === 'pause', `the hero walks to the mark: ${J(w.walk)}, at ${J(w.hero)}; on screen of the pad: ${w.vis.join(' ') || 'none'}`);
    const A = await pauseHold("the hero's walk", 300, ['hero', 'walk', 'simT', 'seen', 'who', 'shotT']); await shot('herowalk_paused'); await resume("the hero's walk");
    const a1 = await S('walk', 500);
    ok(a1.over && !a1.notes.some((q) => q.startsWith('placed')) && near(a1.to, 4200, 1390, 10) && a1.maxStep < 9, `after the pause he walks on to the mark: ${J(A.a.hero)} -> ${J(a1.to)} in ${a1.ticks} more ticks, longest step ${a1.maxStep} px, ${J(a1.notes)}`);
    const b1 = await U("s.modal === 'dialog' && s.line.includes('빵은')", 20, 0); ok(b1.ticks >= 0, `Lotte's question follows (${b1.ticks} ticks later); the hero ${J(b1.hero)} facing ${J(b1.face)}`); await shot('farwest_bread');
    const r0 = await U("s.shot === 'ring_widen' && s.shotT > 0 && s.shotT < 1.6 && s.moves.length > 0", 200, 6);
    ok(r0.ticks >= 0 && r0.vis.join(' ') === 'pause', `the ring shot: ${r0.shotT} s left, walking ${J(r0.moves)}; on screen of the pad: ${r0.vis.join(' ') || 'none'}; banner ${r0.banner ?? 'none'} ${r0.bannerTitle}`);
    await pauseHold('the ring shot', 300, ['moves', 'who', 'shotT', 'simT', 'seen', 'hero']); await shot('ring_paused'); await resume('the ring shot');
    const m = await U("s.modal === 'dialog' && s.line.includes('이 녀석')", 40, 0);
    ok(m.ticks >= 0 && near(m.who.marta, 4046, 1396) && m.moves.length === 0, `Marta stands on her mark when she speaks: ${J(m.who.marta)}; Alberto ${J(m.who.alberto)}; nobody walking (${m.moves.length})`);
    const z = await U("s.modal === 'end'", 200, 6);
    ok(z.ticks >= 0 && z.ended === 'r1' && z.warn === 0, `the ending card is reached: ended ${z.ended}, host warnings ${z.warn}; Alberto ${J(z.who.alberto)}`);
  });

  C('v_hidden', "the page hidden in the middle of the hero's walk and while Marta walks; both saves loaded and played to the card", async () => {
    const { at } = await toRing(96, 96); note(`rung from ${J(at)} (the north-east corner behind the bell)`);
    await P('ring', 'big_bell');
    const w = await U('s.walk !== null && s.walk.t > 0.3', 20, 0), sv1 = await S('hide'), h1 = await S('st'); await S('show');
    const o1 = sv1 ? JSON.parse(sv1) : null;
    ok(w.ticks >= 0 && !!o1, `hidden in the middle of his walk (${J(w.walk)}, at ${J(w.hero)}): the game saved - ${o1 ? J({ why: o1.why, area: o1.area, pos: o1.pos, home: !!o1.story.flags?.elise_home, answered: !!o1.story.flags?.bells_answered }) : 'no save'}; lock ${h1.lock}`);
    const a1 = await S('walk', 500);
    ok(a1.over && near(a1.to, 4200, 1390, 10), `shown again: he walks on to the mark ${J(a1.to)} (${a1.ticks} ticks, longest step ${a1.maxStep} px, ${J(a1.notes)})`);
    const r0 = await U("s.shot === 'ring_widen' && s.shotT > 0 && s.shotT < 1.2 && s.moves.some((q) => q[0] === 'marta')", 200, 6), sv2 = await S('hide'); await S('show');
    const o2 = sv2 ? JSON.parse(sv2) : null;
    ok(r0.ticks >= 0 && !!o2, `hidden while Marta walks (${J(r0.moves)}): the game saved - ${o2 ? J({ why: o2.why, area: o2.area, pos: o2.pos, home: !!o2.story.flags?.elise_home, answered: !!o2.story.flags?.bells_answered, promised: !!o2.story.flags?.keepers_promised }) : 'no save'}`);
    const m = await U("s.modal === 'dialog' && s.line.includes('이 녀석')", 40, 0);
    ok(m.ticks >= 0 && near(m.who.marta, 4046, 1396), `shown again: Marta walks on and stands on her mark when she speaks ${J(m.who.marta)}`);
    const z = await U("s.modal === 'end'", 200, 6); ok(z.ticks >= 0 && z.ended === 'r1', `this session reaches the card (ended ${z.ended}, warnings ${z.warn})`);
    // the save from the middle of his walk
    await boot(sv1); await idle(); await install();
    const p1 = await S('st');
    ok(p1.area === 'eshville_past' && !p1.lock && near(p1.who.lotte, 4104, 1436) && near(p1.who.elise, 4296, 1436), `save 1 loads: ${p1.area}, the hero free at ${J(p1.hero)}, Lotte ${J(p1.who.lotte)}, Elise ${J(p1.who.elise)}`);
    await P('ring', 'big_bell'); const a2 = await S('walk', 500); note(`rung again where the save put him: ${J(a2)}`);
    const z1 = await U("s.modal === 'end'", 260, 6); ok(z1.ticks >= 0 && z1.ended === 'r1', `save 1 played on reaches the card (ended ${z1.ended}, warnings ${z1.warn})`);
    // the save made while Marta walked
    await boot(sv2); await install();
    const f2 = await U("s.modal === 'dialog' && s.line.includes('엘리제가 답한다')", 140, 0);
    ok(f2.ticks >= 0 && near(f2.hero, 4200, 1390, 12), `save 2 loads into tonight's first line: the hero ${J(f2.hero)}, Elise ${J(f2.who.elise)}, Marta ${J(f2.who.marta)}, Alberto ${J(f2.who.alberto)}; banner ${f2.banner ?? 'none'} ${f2.bannerTitle}`);
    const z2 = await U("s.modal === 'end'", 240, 6); ok(z2.ticks >= 0 && z2.ended === 'r1', `save 2 played on reaches the card (ended ${z2.ended}, warnings ${z2.warn}); Marta spoke from ${J((await ev(() => window.__sv.log)).find((q) => q[0].includes('이 녀석'))?.[2] ?? null)}`);
    // what the published build would have written in the middle of tonight's scene: bells_answered not yet set, the hero wherever he rang (synthesized from save 2)
    if (o2) {
      const o3 = JSON.parse(sv2); if (o3.story?.flags) delete o3.story.flags.bells_answered; if (Array.isArray(o3.story?.world)) o3.story.world = o3.story.world.filter((q) => q !== 'bells_answered');
      if (o3.pos && typeof o3.pos === 'object' && !Array.isArray(o3.pos)) { o3.pos.x = 4130; o3.pos.z = 1402; } else if (Array.isArray(o3.pos)) { o3.pos[0] = 4130; o3.pos[1] = 1402; }
      await boot(JSON.stringify(o3)); await install();
      const f3 = await U("s.modal === 'dialog' && s.line.includes('엘리제가 답한다')", 140, 0);
      ok(f3.ticks >= 0 && near(f3.hero, 4200, 1390, 12), `the old-build shape of that save (no bells_answered, pos ${J(o3.pos)}): tonight's first line with the hero at ${J(f3.hero)}, Elise ${J(f3.who.elise)}`);
      await shot('oldshape_home_first');
      const z3 = await U("s.modal === 'end'", 240, 6); ok(z3.ticks >= 0 && z3.ended === 'r1' && !z3.msg, `it reaches the card (ended ${z3.ended}, warnings ${z3.warn}, message "${z3.msg}")`); await shot('oldshape_card');
    }
  });

  C('v_fast', "rung from behind the bell's posts with the stick held away, everything tapped at every second tick, to the card", async () => {
    const { at } = await toRing(0, 137); note(`rung from ${J(at)} (behind the bell's posts)`);
    const k = await S('stickDown', 0, -1), k1 = await S('tick', 12); note(`a finger on the stick, pushed up: ${J(k)}; after 12 ticks the hero is at ${J(k1.hero)}`);
    await P('ring', 'big_bell');
    const w = await S('walk', 600, true);
    ok(w.began >= 0 && w.over && near(w.to, 4200, 1390, 10), `with the stick held and taps at every second tick he reaches the mark: ${w.ticks} ticks, ${w.len} px, longest step ${w.maxStep} px, ${J(w.from)} -> ${J(w.to)}; ${J(w.notes)}`);
    const z = await U("s.modal === 'end'", 320, 'tap'), L = await ev(() => ({ log: window.__sv.log, taps: window.__sv.taps, box: window.__sv.tapsOnBox }));
    ok(z.ticks >= 0 && z.ended === 'r1', `tapped through to the card in ${z.ticks} ticks (${L.taps} taps, ${L.box} on the dialogue box): ended ${z.ended}, host warnings ${z.warn}`);
    for (const q of L.log) note(`line ${q[0]} · hero ${J(q[1])} · marta ${J(q[2])} · alberto ${J(q[3])} · walking ${q[5]}`);
    const mt = L.log.find((q) => q[0].includes('이 녀석')), al = L.log.find((q) => q[0].includes('…로테?'));
    ok(!!mt && near(mt[2], 4046, 1396) && !!al && near(al[3], 4104, 1436), `Marta stands on her mark at her first line (${J(mt?.[2])}), Alberto on his when he asks after Lotte (${J(al?.[3])})`);
    await S('stickUp'); await shot('fast_card');
  });

  C('v_busts', 'a fresh page load: the first page of each first-time speaker of the ending, 9 ticks after its box opened; the cost of the preload', async () => {
    const { at } = await toRing(-70, -6); void at;
    const B = await S('busts');
    ok(!!B.pre && B.pre.n >= 13, `busts ready before the first line: ${J(B)} (firstStart / lastEnd = ms after navigation of the first request / the last response; loadMs = the area's load)`);
    await P('ring', 'big_bell'); const got = [];
    for (let i = 0; i < 8 && got.length < 6; i++) {
      const s = await U("s.newSpk || s.modal === 'end'", 200, 6); if (s.ticks < 0 || s.modal === 'end') break;
      await ev((k) => { window.__sv.spk[k] = 1; }, s.spk); await S('tick', 9); got.push(s.spk); await shot('bust_' + s.spk);
    }
    ok(got.length >= 5, `first pages of first-time speakers captured: ${got.join(', ')}`);
  });

  // ───────── the continuation (the second run of this lane, 09:04 UTC): more places to ring from, Elise at the years shot, the whole card, the busts' cost ─────────
  /** free cells (the scene's own _spotOk, 8 px lattice) within the bell spot's own reach r + the hero's 14 px */
  const reach = () => ev(() => { const sc = window.__v2.scene, d = sc.area.interact.find((q) => q.id === 'big_bell'), R = (d.r ?? 60) + 14, L = []; for (let x = d.x - R; x <= d.x + R; x += 8) for (let z = d.z - R; z <= d.z + R; z += 8) if (Math.hypot(x - d.x, z - d.z) <= R && sc._spotOk({ x, z, y: d.y ?? 0 })) L.push([x, z]); return { R, d: [d.x, d.z, d.y ?? 0], L }; });
  const PICK = {
    rail: (L) => L.filter((q) => Math.abs(q[0] - 4200) <= 8).sort((a, b) => a[1] - b[1])[0],                                   // the southmost free cell before the bell: at the terrace rail
    lotte: (L) => L.slice().sort((a, b) => Math.hypot(a[0] - 4104, a[1] - 1436) - Math.hypot(b[0] - 4104, b[1] - 1436))[0],      // the free cell nearest to Lotte: he touches her
    elise: (L) => L.slice().sort((a, b) => Math.hypot(a[0] - 4296, a[1] - 1436) - Math.hypot(b[0] - 4296, b[1] - 1436))[0],      // nearest to Elise (and to the jar behind her)
    north: (L) => L.slice().sort((a, b) => b[1] - a[1] || Math.abs(a[0] - 4200) - Math.abs(b[0] - 4200))[0],                     // the northmost free cell: behind the bell, between its posts and the church wall
    se: (L) => L.slice().sort((a, b) => (a[1] - a[0]) - (b[1] - b[0]))[0],                                                       // the south-east corner of the reach: the rail's corner on Elise's side
  };
  for (const tag of Object.keys(PICK)) C('w_end_' + tag, `the ending rung from the reach's own edge: ${tag}`, async () => {
    await boot(after('ev_keepers')); await idle(); await install();
    const R = await reach(), p = PICK[tag](R.L); if (!p) throw new Error('no free cell for ' + tag);
    const at = await P('putY', p[0], p[1], R.d[2]); await ev(() => window.__cc.until({ idle: true }, 30));
    note(`${tag}: ${R.L.length} free cells within ${R.R} px of the bell's spot ${J(R.d)}; he stands at ${J(at)} (${Math.round(Math.hypot(at[0] - R.d[0], at[1] - R.d[1]))} px from the spot; Lotte ${Math.round(Math.hypot(at[0] - 4104, at[1] - 1436))} px, Elise ${Math.round(Math.hypot(at[0] - 4296, at[1] - 1436))} px away)`);
    await still(`${tag}_before`, `종을 울리기 전 (${tag})`, ['hero', 'lotte', 'elise'], 'ev_ending');
    await P('ring', 'big_bell');
    const w = await S('walk', 500);
    ok(w.began >= 0 && w.over && !w.notes.some((q) => q.startsWith('placed')) && w.maxStep < 9 && near(w.to, 4200, 1390, 10), `${tag}: he walks to the mark - ${w.ticks} ticks, ${w.len} px, longest step of a tick ${w.maxStep} px, ${J(w.from)} -> ${J(w.to)}, facing ${J(w.face)}; ${J(w.notes)}`);
    await until({ line: '빵은' }, 200); await still(`${tag}_bread`, '로테의 물음 (ev_ending)', ['hero', 'lotte', 'elise'], 'ev_ending');
    if (tag === 'rail') {
      // the last page of Lotte's lines, then the camera rises for the hundred years: who is in the picture while it is still close?
      await U("s.modal === 'dialog' && s.line.includes('거짓말')", 20, 6);
      const y0 = await U("s.shot === 'years'", 20, 6), y1 = await S('tick', 2);
      await still(`${tag}_years_t2`, '백 년이 흐른다 - 마지막 줄을 넘긴 뒤 2틱', ['hero', 'lotte', 'elise'], 'ev_ending');
      const y2 = await S('tick', 28); await still(`${tag}_years_t30`, '백 년이 흐른다 - 30틱', ['hero', 'lotte', 'elise'], 'ev_ending');
      ok(!!y1.who.elise && !!y2.who.elise, `the years shot: Elise is in the 1697 picture until the crossing (2 ticks in: ${J(y1.who.elise ?? null)}; 30 ticks in: ${J(y2.who.elise ?? null)}; shot time left ${y0.shotT} -> ${y2.shotT})`);
    }
    await until({ line: '엘리제가 답한다' }, 300); await still(`${tag}_home_first`, '오늘 밤의 첫 줄 (ev_ending_home)', ['hero', 'elise'], 'ev_ending_home');
    await until({ line: '엘리제! 이 녀석' }, 400); await still(`${tag}_town1`, '마을 1 — 마르타 「엘리제! 이 녀석」', ['hero', 'elise', 'alberto', 'marta'], 'ev_ending_home');
    if (tag !== 'rail') return;
    const z = await U("s.modal === 'end'", 200, 6); await shot('card_t0'); const z1 = await S('tick', 150); await shot('card_t150'); const z2 = await S('tick', 300); await shot('card_t450');
    const M = await ev(() => { try { return window.__v2.scene.hud.metrics().end ?? null; } catch { return null; } });
    note(`the card: reached ${z.ticks >= 0}, ended ${z.ended}; 150 ticks later modal ${z1.modal}, 450 ticks later modal ${z2.modal}, pad pieces ${z2.vis.length}, banner ${z2.banner ?? 'none'} ${z2.bannerTitle}; metrics ${J(M).slice(0, 500)}`);
  });

  /** tick (pages turned every 6 ticks) until the crossing itself is under way (scene.xing), then n ticks more */
  const intoCrossing = (n) => ev((k) => { const g = window.__game, v = window.__v2; g._pageHidden = true; let d = 0, at = -1; for (let i = 0; i < 3000; i++) { if (v.scene.xing) { at = i; break; } if (v.scene.hud.modal === 'dialog' && ++d >= 6) { d = 0; v.scene.hud.advanceDialog(); } g.tick(1 / 60); } if (at < 0) return null; for (let i = 0; i < k; i++) g.tick(1 / 60); const x = v.scene.xing; return { at, still: !!x, keys: x ? Object.keys(x).slice(0, 14) : [], area: v.area, ready: !!v.ready }; }, n);
  C('w_pause_xing', 'the pause panel by touch in the middle of the last crossing itself: held 300 ticks, closed, played to the card; then 「나가기」 there and the save it leaves', async () => {
    await toRing(-70, -6); await P('ring', 'big_bell');
    const x = await intoCrossing(12), a = await S('st');
    ok(!!x && x.still, `the last crossing is under way (12 ticks in): ${J(x)}; area ${a.area}, on screen of the pad: ${a.vis.join(' ') || 'none'}, lock ${a.lock}, modal ${a.modal}`);
    await shot('xing_12');
    const t = await S('tapPause'), b = await S('tick', 1);
    note(`a touch on 「멈춤」 in the crossing: ${J(t)} -> modal ${b.modal}, area ${b.area}, ready ${b.ready}`);
    if (b.modal === 'pause') {
      const c = await S('tick', 300); await shot('xing_paused');
      ok(c.modal === 'pause' && c.area === b.area && J(c.hero) === J(b.hero) && c.seen === b.seen, `300 ticks with the panel open in the crossing: nothing ran (area ${b.area} -> ${c.area}, hero ${J(b.hero)} -> ${J(c.hero)}, shown ${b.seen} -> ${c.seen})`);
      const r = await S('tapRow', 'resume'), d = await S('tick', 1); ok(!r.err && d.modal !== 'pause', `「계속」 closes it (modal ${d.modal}, lock ${d.lock}, area ${d.area})`);
    }
    const f = await U("s.modal === 'dialog' && s.line.includes('엘리제가 답한다')", 200, 6);
    ok(f.ticks >= 0 && near(f.hero, 4200, 1390, 12) && f.area === 'eshville_now', `tonight's first line follows: area ${f.area}, the hero ${J(f.hero)}, Elise ${J(f.who.elise ?? null)}, banner ${f.banner ?? 'none'} ${f.bannerTitle}`);
    const z = await U("s.modal === 'end'", 240, 6); ok(z.ticks >= 0 && z.ended === 'r1' && z.warn === 0, `the card is reached (ended ${z.ended}, host warnings ${z.warn})`);
    // leave from the panel in the middle of the crossing
    await toRing(-70, -6); await chooser(); await P('ring', 'big_bell');
    const x2 = await intoCrossing(12); await S('tapPause'); const l1 = await S('tick', 1);
    if (l1.modal !== 'pause') { note(`second run: no pause panel in the crossing (modal ${l1.modal}) - 「나가기」 not tried here`); return; }
    const r2 = await S('tapRow', 'leave'); let top = '';
    for (let i = 0; i < 40 && top !== 'V2Chooser'; i++) { top = await ev(() => { const g = window.__game; g._pageHidden = true; for (let k = 0; k < 20; k++) g.tick(1 / 60); return g.top?.constructor?.name ?? ''; }); if (top !== 'V2Chooser') await page().waitForTimeout(200); }
    const sv = await ev(() => localStorage.getItem('bn.v2.save')), o = sv ? JSON.parse(sv) : null;
    ok(!!x2 && !r2.err && top === 'V2Chooser' && !!o, `「나가기」 in the middle of the crossing: the chooser is on top (${top}); the save: ${o ? J({ why: o.why, area: o.area, pos: o.pos, promised: !!o.story.flags?.keepers_promised, home: !!o.story.flags?.elise_home, answered: !!o.story.flags?.bells_answered }) : 'none'}`);
    await boot(sv); await install();
    const g1 = await U("(s.ready && !s.lock && !s.busy && s.modal === null && !s.go) || (s.modal === 'dialog')", 80, 0);
    note(`that save loads: area ${g1.area}, modal ${g1.modal}, lock ${g1.lock}, the hero ${J(g1.hero)}, line ${g1.line.replace(/\n/g, ' / ').slice(0, 40)}, Lotte ${J(g1.who.lotte ?? null)}, Elise ${J(g1.who.elise ?? null)}`);
    await shot('xing_leave_loaded');
    if (g1.area === 'eshville_past' && g1.modal === null) await P('ring', 'big_bell');
    const z2 = await U("s.modal === 'end'", 400, 6); ok(z2.ticks >= 0 && z2.ended === 'r1', `played on from that save the card is reached (ended ${z2.ended}, host warnings ${z2.warn}, area ${z2.area})`);
  });

  // (the first try of this chain reloaded the harness page with a route on the busts: a reload takes them from the page's cache and the route sees nothing - 0 files in
  //  every mode. Now: a new context of the same browser per load = a cold cache, the route set before the first request.)
  C('w_busts_cost', "the busts at load, measured at the network with a cold cache: a plain load, a load without them, a load where each takes 3 s - and Lotte's first page then", async () => {
    await boot(after('ev_keepers')); await idle();
    const url = page().url(), br = page().context().browser(), sv = after('ev_keepers'), dir = `${OUT}/${dev()}`; fs.mkdirSync(dir, { recursive: true });
    const load = async (mode, then) => {
      const cx = await br.newContext({ ...contextOptions(dev()) }), pg = await cx.newPage(), F = [];
      try {
        await pg.addInitScript((s) => { try { if (window.top !== window) return; if (sessionStorage.getItem('__sv_seeded')) return; sessionStorage.setItem('__sv_seeded', '1'); localStorage.setItem('bn.v2.save', s); } catch { /* storage */ } }, sv);
        await pg.route('**/portraits/**', async (route) => { const q = { f: route.request().url().split('/').pop(), t0: Date.now() }; F.push(q); try { if (mode === 'none') { await route.abort(); q.t1 = Date.now(); return; } if (mode === 'slow') await new Promise((r) => setTimeout(r, 3000)); const r = await route.fetch(), b = await r.body(); q.bytes = b.length; await route.fulfill({ response: r, body: b }); q.t1 = Date.now(); } catch (e) { q.err = String(e).slice(0, 60); } });
        const t0 = Date.now(); await pg.goto(url);
        await pg.waitForFunction(() => window.__v2?.id === 'g' && (window.__v2.ready || window.__v2.error), null, { timeout: 180000 }); const t1 = Date.now();
        await pg.waitForFunction(() => window.__v2?.stats?.hud === 'ui', null, { timeout: 30000 }).catch(() => {});
        const B = await pg.evaluate(() => { const sc = window.__v2.scene; return { pre: sc.hud.portraitsReady ?? null, waitMs: sc.bustsWaitMs ?? null, loadMs: sc.loadMs ?? null }; });
        const done = F.filter((q) => q.t1), R = { mode, readyMs: t1 - t0, files: F.length, bytes: F.reduce((a, q) => a + (q.bytes ?? 0), 0), firstReqMs: F.length ? Math.min(...F.map((q) => q.t0)) - t0 : null, lastDoneMs: done.length ? Math.max(...done.map((q) => q.t1)) - t0 : null, ...B };
        if (then) await then(pg, R);
        return R;
      } finally { await cx.close(); }
    };
    const firstPage = (tag) => async (pg, R) => {
      const n = await pg.evaluate(() => { const g = window.__game, v = window.__v2, sc = v.scene, d = sc.area.interact.find((q) => q.id === 'big_bell'); g._pageHidden = true; for (let i = 0; i < 240 && (sc.hud.modal || sc.host.locks() || sc._go || sc.fadeA > 0.01); i++) g.tick(1 / 60); sc.emit('interact', { id: d.id, kind: d.kind, event: d.event ?? null, data: d.data ?? null, locked: d.locked ?? null, spot: d, ring: true }); for (let i = 0; i < 1500; i++) { if (sc.hud.modal === 'dialog') { try { g.alpha = 1; g.render(); } catch { /* */ } return i; } g.tick(1 / 60); } return -1; });
      R.firstPageAfterTicks = n; R.firstPageMsAfterReady = null; await pg.screenshot({ path: `${dir}/sv_${tag}_t0.png` });
      await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 3; i++) g.tick(1 / 60); try { g.alpha = 1; g.render(); } catch { /* */ } }); await pg.screenshot({ path: `${dir}/sv_${tag}_t3.png` });
      R.preAtFirstPage = await pg.evaluate(() => window.__v2.scene.hud.portraitsReady ?? null);
      if (tag === 'slowbust') { await pg.waitForTimeout(3600); await pg.evaluate(() => { const g = window.__game; for (let i = 0; i < 2; i++) g.tick(1 / 60); try { g.alpha = 1; g.render(); } catch { /* */ } }); await pg.screenshot({ path: `${dir}/sv_${tag}_later.png` }); R.preLater = await pg.evaluate(() => window.__v2.scene.hud.portraitsReady ?? null); }
      put(`     still ${dir}/sv_${tag}_t0.png · _t3.png${tag === 'slowbust' ? ' · _later.png' : ''}`);
    };
    const A1 = await load('plain', firstPage('plainbust')), N1 = await load('none'), A2 = await load('plain'), N2 = await load('none');
    note(`plain load (cold): ${J(A1)}`); note(`without the busts: ${J(N1)}`); note(`plain load again: ${J(A2)}`); note(`without again: ${J(N2)}`);
    ok(A1.files >= 13 && A2.files >= 13, `a plain cold load asks for ${A1.files} / ${A2.files} bust files (${A1.bytes} bytes): first request ${A1.firstReqMs} / ${A2.firstReqMs} ms, last one done ${A1.lastDoneMs} / ${A2.lastDoneMs} ms after the navigation began; the game ready after ${A1.readyMs} / ${A2.readyMs} ms against ${N1.readyMs} / ${N2.readyMs} ms without them; the scene's own wait for them: ${A1.waitMs} / ${A2.waitMs} ms`);
    const SL = await load('slow', firstPage('slowbust')); note(`each bust 3 s late: ${J(SL)}`);
    ok(SL.files >= 13 && SL.readyMs < A1.readyMs + 2500, `with every bust 3 s late the game is ready after ${SL.readyMs} ms (the scene waited ${SL.waitMs} ms: its cap is 1.2 s); Lotte's first page opened ${SL.firstPageAfterTicks} ticks after the ring; busts ready then: ${J(SL.preAtFirstPage)}, 3.6 s later: ${J(SL.preLater)}`);
  });
}
