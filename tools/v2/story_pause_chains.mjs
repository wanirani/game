// STORY2 (2026-11-19): the pause button during a cut - chains for tools/v2/chapter_cuts.mjs (--chains tools/v2/story_pause_chains.mjs --only pause_open,pause_keepers,pause_leave).
// Touch = pointer events on the pad's own 「멈춤」 button and on the pause panel's rows; time = game ticks (the headless page runs at a few frames a second).
//   pause_open     a new game: the opening's camera cut (camera moon_bell, 3 s) - the still (the pause button and nothing else of the pad), the panel opened by a touch,
//                  two seconds of ticks with the panel open (nothing moves), closed by a touch on 「계속」, the shot runs out its remaining time, the first line follows;
//                  then 「나가기」 during the cut of a second new game: the chooser, and the save it left loads into the opening's start
//   pause_keepers  the two keepers' scene: the panel during Elise's walk (lockInput + moveActor) and during the wait step - she walks on from where she was, the
//                  wait runs out its rest, the next line is the promise's first
//   pause_leave    「나가기」 during Elise's walk: the chooser; the save left behind loads into the scene's first line with everyone at the start marks
// Lines: ok / FAIL in <out>/cuts.txt; the exit code of chapter_cuts.mjs does not count them - read the lines.
export default function (T) {
  const { C, boot, until, idle, P, ev, after, put, page, OUT, dev } = T;
  const ok = (c, t) => { put(`${c ? 'ok  ' : 'FAIL'} [pause] ${t}`); return c; };
  const install = () => ev(() => {
    const g = window.__game, v = window.__v2;
    const shotName = () => { const s = v.scene.host?.shot, SH = window.__cc.SH; if (!s) return null; for (const k in SH ?? {}) if (SH[k] === s) return k; return '?'; };
    const fire = (type, x, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: 31, pointerType: 'touch', isPrimary: false, clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
    const S = (window.__sp = {
      tick(n) { g._pageHidden = true; for (let i = 0; i < n; i++) g.tick(1 / 60); try { g.alpha = 1; g.render(); } catch { /* between areas */ } return S.st(); },
      st() {
        const sc = v.scene, H = sc.host, h = sc.sim?.hero, M = sc.hud.metrics?.() ?? {}, vis = [];
        for (const c of document.querySelectorAll('#v2pad canvas')) { const cs = getComputedStyle(c); if (cs.display !== 'none' && Number(cs.opacity) > 0.05 && getComputedStyle(c.parentNode).display !== 'none') vis.push(c.dataset.id ?? c.className); }
        const S2 = H.seen; let line = ''; for (let i = S2.length - 1; i >= 0; i--) if (S2[i][0] === 'line') { line = S2[i][1] + ': ' + S2[i][2]; break; }
        return { top: g.top?.constructor?.name ?? '', modal: sc.hud.modal ?? null, shot: shotName(), shotT: +(+H.shotT).toFixed(4), lock: !!H.locks(), inputLock: !!H.inputLock, busy: !!H.st.busy, waits: H.waits.map((w) => +(+w.t).toFixed(4)),
          moves: H.moves.map((m) => [m.p.id, +m.p.x.toFixed(2), +m.p.z.toFixed(2)]), seen: S2.length, simT: +(sc.sim?.time ?? 0).toFixed(4), hero: h ? [+h.x.toFixed(1), +h.z.toFixed(1)] : null, pad: M.pad ? { shown: M.pad.shown, cut: M.pad.cut, back: M.pad.back } : null, vis, pills: Array.from(sc.state.prompts ?? []).length, line,
          who: Object.fromEntries(sc.people.list.filter((p) => p.on).map((p) => [p.id, [Math.round(p.x), Math.round(p.z)]])) };
      },
      /** a finger on the pad's pause button */
      tapPause() { const b = (v.scene.hud.metrics().pad?.buttons ?? []).find((q) => q.id === 'pause'); if (!b || !(b.cx > 0)) return { err: 'no pause button' }; fire('pointerdown', b.cx, b.cy); fire('pointerup', b.cx, b.cy); return { x: Math.round(b.cx), y: Math.round(b.cy) }; },
      /** a finger on a row of the pause panel (by id: resume, leave) */
      tapRow(id) { try { g.alpha = 1; g.render(); } catch { /* */ } const m = v.scene.hud.metrics().pause; if (!m) return { err: 'no pause panel' }; const i = m.ids.indexOf(id); if (i < 0) return { err: 'no row ' + id + ' in ' + m.ids.join(' ') }; const r = m.rows[i], rc = g.canvasRect, x = rc.x + (r.x + r.w / 2) * g.cssScale, y = rc.y + (r.y + r.h / 2) * g.cssScale; fire('pointerdown', x, y); fire('pointerup', x, y); return { ids: m.ids, x: Math.round(x), y: Math.round(y) }; },
      /** tick until fn(state) holds (at most max ticks); returns the tick count and the state */
      until(src, max) { const fn = new Function('s', 'return (' + src + ')'); g._pageHidden = true; for (let i = 0; i < max; i++) { const s = S.st(); if (fn(s)) { try { g.alpha = 1; g.render(); } catch { /* */ } return { n: i, ...s }; } if (s.modal === 'dialog' && S.adv && ++S.d >= 6) { S.d = 0; v.scene.hud.advanceDialog(); } g.tick(1 / 60); } return { n: -1, ...S.st() }; },
      adv: false, d: 0,
    });
    return true;
  });
  const S = (name, ...a) => ev(([n, b]) => window.__sp[n](...b), [name, a]);
  /** the game was opened straight into the scene here; on a device the player comes through the 3D chooser, which is then registered - the same registration */
  const chooser = () => ev(async () => { const g = window.__game; if (!g.registry.v2pick) { const m = await import('/src/v2/chooser.js'); g.register('v2pick', m.default); } return true; });
  const shot = async (id) => { const f = `${OUT}/${dev()}/pause_${id}.png`; await page().screenshot({ path: f }); put(`     still ${f}`); };
  /** the panel opened by a touch, held for 120 ticks, closed by a touch: what moved meanwhile */
  async function pauseHere(what, keys) {
    await S('tick', 1);   // (a screenshot takes seconds here: the pad's watchdog has taken the pad off meanwhile - one game tick brings it back, as on a device where the game never stops ticking)
    const a = await S('st'), t = await S('tapPause'); const b = await S('tick', 1);
    ok(!t.err && b.modal === 'pause', `${what}: a touch on 「멈춤」 opens the pause panel (${JSON.stringify(t)}, modal ${b.modal})`);
    const c = await S('tick', 120);
    const same = keys.every((k) => JSON.stringify(a[k]) === JSON.stringify(c[k]));
    ok(c.modal === 'pause' && same, `${what}: two seconds with the panel open - nothing ran (${keys.map((k) => `${k} ${JSON.stringify(a[k])} -> ${JSON.stringify(c[k])}`).join('; ')})`);
    ok(c.vis.length === 0, `${what}: with the panel open nothing of the pad is on screen (${c.vis.join(' ') || 'none'})`);
    return { a, c };
  }
  const resume = async (what) => { const r = await S('tapRow', 'resume'); const d = await S('tick', 1); ok(!r.err && d.modal !== 'pause', `${what}: a touch on 「계속」 closes it (${JSON.stringify(r).slice(0, 90)}, modal ${d.modal})`); return d; };
  async function toKeepers() {
    await boot(after('ev_boss_sent')); await idle();
    const b = await ev(() => { const d = window.__v2.scene.area.interact.find((q) => q.id === 'bell_arena'); return { x: d.x, z: d.z, y: d.y ?? 0 }; });
    await P('putY', b.x, b.z - 44, b.y); await ev(() => window.__cc.until({ idle: true }, 30)); await P('ring', 'bell_arena'); await until({ area: 'ossuary_past' }, 160);
    await P('putY', 600, 3760, 0); const u = await P('use', 'oss_elise|elise'); if (u.err) throw new Error(u.err);
    const s = await until({ line: '찾았네요' }, 200); await install(); return s;
  }

  C('pause_open', 'the pause button during the opening cut (a timed camera shot), and 「나가기」 during it', async () => {
    await boot(null); await install();
    const s0 = await S('until', "s.shot === 'moon_bell' && s.lock && s.shotT > 0 && s.shotT < 2.6", 600);
    ok(s0.n >= 0 && s0.lock && s0.modal === null, `the opening's cut is on: camera moon_bell, ${s0.shotT} s left, the story holds the hero (lock ${s0.lock})`);
    ok(s0.pad && s0.pad.shown && s0.pad.cut && s0.vis.join(' ') === 'pause' && s0.pills === 0, `during the cut the pause button is on screen and nothing else of the pad, no pill (visible: ${s0.vis.join(' ') || 'none'}; pills ${s0.pills})`);
    await shot('opening_cut');
    const { a } = await pauseHere('camera shot', ['shotT', 'simT', 'seen', 'hero', 'waits']);
    await shot('opening_paused');
    const d = await resume('camera shot');
    const e = await S('until', "s.modal === 'dialog'", 600), want = Math.round(a.shotT * 60);
    ok(e.n >= 0 && Math.abs(e.n + 1 - want) <= 3, `the shot runs out its remaining time after the panel: ${a.shotT} s were left = ${want} ticks, the first line opened after ${e.n + 1} ticks (${e.line.replace(/\n/g, ' / ').slice(0, 40)})`);
    ok(e.seen === d.seen + 1, `nothing was skipped: exactly one new entry in what the player was shown (${d.seen} -> ${e.seen})`);
    // leave during the cut of a second new game
    await boot(null); await install();
    await chooser(); const l0 = await S('until', "s.shot === 'moon_bell' && s.lock && s.shotT > 0 && s.shotT < 2.6", 600); await S('tapPause'); const l1 = await S('tick', 1);
    const r = await S('tapRow', 'leave'); let top = '';
    for (let i = 0; i < 40 && top !== 'V2Chooser'; i++) { top = await ev(() => { const g = window.__game; g._pageHidden = true; for (let k = 0; k < 20; k++) g.tick(1 / 60); return g.top?.constructor?.name ?? ''; }); if (top !== 'V2Chooser') await page().waitForTimeout(200); }
    ok(l0.n >= 0 && l1.modal === 'pause' && !r.err && top === 'V2Chooser', `「나가기」 during the opening's cut: the 3D chooser is on top (rows ${r.ids?.join(' ')}, top ${top})`);
    const sv = await ev(() => localStorage.getItem('bn.v2.save')), o = sv ? JSON.parse(sv) : null;
    put(`     · the save left behind: ${o ? JSON.stringify({ why: o.why, area: o.area, done: o.story.done.length, pos: o.pos }) : 'none'}`);
    await boot(sv); await install();
    const z = await S('until', "s.shot === 'moon_bell' && (s.lock || s.modal === 'dialog')", 600), first = await ev(() => window.__v2.scene.host.seen.slice(0, 2).map((q) => q.join(' | ').replace(/\n/g, ' / ')));
    // (the page ticks by itself between the load and this tool's first tick, so the cut may be at any second of its three - or already at its first line)
    ok(z.n >= 0 && z.seen <= 2 && /서막/.test(first[0] ?? ''), `that save loads into the opening's start: the opening plays again from its banner (shown since the load: ${JSON.stringify(first)}; shot ${z.shot}, ${z.shotT} s left, modal ${z.modal}, hero at ${z.hero})`);
  });

  C('pause_keepers', "the pause button during Elise's walk (lockInput + moveActor) and during the wait step of the two keepers' scene", async () => {
    await toKeepers(); await ev(() => { window.__sp.adv = true; });
    const w0 = await S('until', "s.moves.length > 0 && s.moves[0][0] === 'elise' && s.moves[0][1] > 4040 && s.modal === null", 900);
    ok(w0.n >= 0 && w0.inputLock, `Elise walks (lockInput on, no camera lock: shot time ${w0.shotT}): she is at ${JSON.stringify(w0.moves[0])}`);
    ok(w0.pad && w0.pad.shown && w0.pad.cut && w0.vis.join(' ') === 'pause', `during the walk only the pause button is on screen (${w0.vis.join(' ') || 'none'})`);
    await shot('keepers_walk');
    const { a } = await pauseHere('the walk', ['moves', 'simT', 'seen', 'hero', 'waits', 'shotT']);
    await resume('the walk');
    const w1 = await S('tick', 10);
    ok(w1.moves.length > 0 && (Math.abs(w1.moves[0][1] - a.moves[0][1]) > 6 || Math.abs(w1.moves[0][2] - a.moves[0][2]) > 6) && Math.hypot(w1.moves[0][1] - a.moves[0][1], w1.moves[0][2] - a.moves[0][2]) < 40, `she walks on from where she was: ${JSON.stringify(a.moves[0])} -> ${JSON.stringify(w1.moves[0])} in 11 ticks (130 px/s = 24 px)`);
    const q0 = await S('until', 's.waits.length > 0 && s.moves.length === 0 && s.modal === null', 900);
    ok(q0.n >= 0, `the wait step is on: ${q0.waits[0]} s left; Elise ${JSON.stringify(q0.who.elise)}, Lotte ${JSON.stringify(q0.who.lotte)}`);
    const p2 = await pauseHere('the wait step', ['waits', 'simT', 'seen', 'hero', 'who']);
    await resume('the wait step');
    const q1 = await S('until', "s.modal === 'dialog'", 300), want = Math.round(p2.a.waits[0] * 60);
    ok(q1.n >= 0 && Math.abs(q1.n + 1 - want) <= 3 && q1.line.includes('엘리제예요'), `the wait runs out its rest (${p2.a.waits[0]} s = ${want} ticks; the next line after ${q1.n + 1} ticks) and the next line is the promise's first: ${q1.line.replace(/\n/g, ' / ').slice(0, 50)}`);
    ok(q1.vis.length === 0, `the dialogue hides the whole pad as before (${q1.vis.join(' ') || 'none'})`);
  });

  C('pause_leave', "「나가기」 from the pause panel during Elise's walk: the chooser, and the save loads into the scene's start", async () => {
    await toKeepers(); await ev(() => { window.__sp.adv = true; });
    const w0 = await S('until', "s.moves.length > 0 && s.moves[0][0] === 'elise' && s.moves[0][1] > 4040 && s.modal === null", 900);
    await chooser(); await S('tapPause'); const l1 = await S('tick', 1); const r = await S('tapRow', 'leave'); let top = '';
    for (let i = 0; i < 40 && top !== 'V2Chooser'; i++) { top = await ev(() => { const g = window.__game; g._pageHidden = true; for (let k = 0; k < 20; k++) g.tick(1 / 60); return g.top?.constructor?.name ?? ''; }); if (top !== 'V2Chooser') await page().waitForTimeout(200); }
    ok(w0.n >= 0 && l1.modal === 'pause' && !r.err && top === 'V2Chooser', `「나가기」 during the walk: the 3D chooser is on top (rows ${r.ids?.join(' ')}, top ${top})`);
    const sv = await ev(() => localStorage.getItem('bn.v2.save')), o = sv ? JSON.parse(sv) : null;
    put(`     · the save left behind: ${o ? JSON.stringify({ why: o.why, area: o.area, storyArea: o.story.area, spawn: o.story.spawn, promised: !!o.story.flags?.keepers_promised, found: !!o.story.flags?.elise_found, pos: o.pos }) : 'none'}`);
    await boot(sv); await install();
    const z = await S('until', "s.modal === 'dialog' && s.line.includes('찾았네요')", 900);
    ok(z.n >= 0 && z.who.elise && Math.abs(z.who.elise[0] - 3996) < 40 && Math.abs(z.hero[0] - 4044) < 60, `that save loads into the scene's first line (${z.line.slice(0, 20)}), the hero at the keepers' mark ${z.hero}, Elise beside him ${JSON.stringify(z.who.elise)}, Lotte ${JSON.stringify(z.who.lotte)}`);
  });
}
