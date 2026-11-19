// STORY2 (2026-11-19): proofs of the smaller ending items - chains for tools/v2/chapter_cuts.mjs
//   node tools/v2/chapter_cuts.mjs --saves <bot saves> --out <dir> --devices fold_open --chains tools/v2/story_more_chains.mjs --only promise_after,rebuild_real,busts,banners,held_bell2
//   promise_after  the two keepers' scene: no place name over its first line; stills 0.3 / 0.8 / 1.3 s after its last line (no rebuild, no 「불러오는 중…」, the pad back);
//                  the save its last step wrote, loaded: where both girls stand and look
//   rebuild_real   a real rebuild in place (the trapped woman's door: flag door_pulled): the veil with no text and no pad while the area is built
//   busts          the very first page of a first-time speaker right after a fresh page load (Lotte's bread line from a save; Alberto at the church): the bust is in its frame
//   banners        the first line of ev_return_first (a crossing): no place name over it
//   held_bell2     the hall's bell in the queen's first act: three long rings (the hero made untouchable by the tool for the 2nd and 3rd), a tap, and the verifier's
//                  own second hold with the rules' state logged tick by tick - why it raised nothing
// Lines: ok / FAIL in <out>/cuts.txt; the exit code of chapter_cuts.mjs does not count them - read the lines.
import fs from 'node:fs';
export default function (T) {
  const { C, boot, until, idle, P, ev, still, after, before, put, page, OUT, dev } = T;
  const ok = (c, t) => { put(`${c ? 'ok  ' : 'FAIL'} [more] ${t}`); return c; };
  const install = () => ev(() => {
    const g = window.__game, v = window.__v2;
    const S = (window.__sm = {
      adv: false, d: 0,
      st() {
        const sc = v.scene, H = sc.host, h = sc.sim?.hero, M = sc.ready ? sc.hud.metrics?.() ?? {} : {}, vis = [];
        for (const c of document.querySelectorAll('#v2pad canvas')) { const cs = getComputedStyle(c); if (cs.display !== 'none' && Number(cs.opacity) > 0.05 && getComputedStyle(c.parentNode).display !== 'none') vis.push(c.dataset.id ?? c.className); }
        const S2 = H.seen; let line = ''; for (let i = S2.length - 1; i >= 0; i--) if (S2[i][0] === 'line') { line = S2[i][1] + ': ' + S2[i][2]; break; }
        return { ready: !!sc.ready, go: sc._go ? (sc._go.same ? 'same' : 'journey') : null, fade: +(+sc.fadeA).toFixed(2), loading: !!sc.state.loading, msg: sc.state.message || '', modal: sc.ready ? sc.hud.modal ?? null : null, lock: !!H.locks(), busy: !!H.st.busy, dirty: !!H.dirty,
          banner: M.hud?.banner ?? null, bannerTitle: M.hud?.bannerTitle ?? '', pad: vis.length, vis: vis.join(' '), pills: sc.ready ? Array.from(sc.state.prompts ?? []).length : 0, seen: S2.length, warn: H.warnings.length, line, hero: h ? [Math.round(h.x), Math.round(h.z)] : null, hp: h ? Math.round(h.hp) : 0, area: v.area };
      },
      tick(n) { g._pageHidden = true; for (let i = 0; i < n; i++) g.tick(1 / 60); try { g.alpha = 1; g.render(); } catch { /* between areas */ } return S.st(); },
      until(src, max) { const fn = new Function('s', 'return (' + src + ')'); g._pageHidden = true; for (let i = 0; i < max; i++) { const s = S.st(); if (fn(s)) { try { g.alpha = 1; g.render(); } catch { /* */ } return { n: i, ...s }; } if (s.modal === 'dialog' && S.adv && ++S.d >= 6) { S.d = 0; v.scene.hud.advanceDialog(); } g.tick(1 / 60); } try { g.alpha = 1; g.render(); } catch { /* */ } return { n: -1, ...S.st() }; },
      people(ids) { const sc = v.scene, o = {}; for (const id of ids) { const p = sc.people.byId(id); o[id] = p ? { on: p.on, at: [Math.round(p.x), Math.round(p.z)], look: p.look ? (p.look.hero ? 'hero' : [p.look.x, p.look.z]) : null, faces: [+p.a3.dx.toFixed(2), +p.a3.dz.toFixed(2)] } : null; } return o; },
    });
    return true;
  });
  const S = (name, ...a) => ev(([n, b]) => window.__sm[n](...b), [name, a]);
  const shot = async (id, note) => { const d = `${OUT}/${dev()}`; fs.mkdirSync(d, { recursive: true }); const f = `${d}/more_${id}.png`; await page().screenshot({ path: f }); put(`     still ${f}${note ? ' — ' + note : ''}`); return f; };
  async function toKeepers() {
    await boot(after('ev_boss_sent')); await idle();
    const b = await ev(() => { const d = window.__v2.scene.area.interact.find((q) => q.id === 'bell_arena'); return { x: d.x, z: d.z, y: d.y ?? 0 }; });
    await P('putY', b.x, b.z - 44, b.y); await ev(() => window.__cc.until({ idle: true }, 30)); await P('ring', 'bell_arena'); await until({ area: 'ossuary_past' }, 160);
    await P('putY', 600, 3760, 0); const u = await P('use', 'oss_elise|elise'); if (u.err) throw new Error(u.err);
    const s = await until({ line: '찾았네요' }, 200); await install(); return s;
  }

  C('promise_after', "after the two keepers' promise: no loading text, no rebuild; the save builds the girls where the scene left them", async () => {
    await toKeepers();
    const a = await S('st'); await shot('keepers_first_line', 'ev_keepers, first line');
    ok(a.banner !== 'area', `the first line of ev_keepers (arrived by a journey): no place name over the scene (banner on screen: ${a.banner ? a.banner + ' 「' + a.bannerTitle + '」' : 'none'})`);
    await ev(() => { window.__sm.adv = true; });
    const z = await S('until', "!s.lock && !s.busy && s.modal === null && s.seen > 8", 2400); await ev(() => { window.__sm.adv = false; });
    ok(z.n >= 0, `the scene ends, the story lets go (${z.line.replace(/\n/g, ' / ').slice(0, 40)}); the rebuild flag of the host is ${z.dirty ? 'SET' : 'clear'}`);
    const rows = [];
    let done = 0;
    for (const [t, n] of [[0.3, 18], [0.8, 30], [1.3, 30]]) { const s = await S('tick', n); done += n; rows.push(s); await shot(`promise_after_${String(t).replace('.', '')}s`, `${t} s after the story let go`); ok(s.ready && !s.go && !s.msg && s.fade < 0.02 && s.pad >= 6, `${t} s after: the area stands (ready ${s.ready}, rebuild ${s.go ?? 'none'}, veil ${s.fade}, message "${s.msg}"), the pad is on screen (${s.pad} pieces), banner ${s.banner ? s.banner + ' 「' + s.bannerTitle + '」' : 'none'}`); }
    const who = await S('people', ['elise', 'lotte']); put('     · after the scene: ' + JSON.stringify(who));
    const sv = await ev(() => localStorage.getItem('bn.v2.save')), o = sv ? JSON.parse(sv) : null;
    ok(!!o && o.why === 'story' && !!o.story.flags.keepers_promised, `the scene's save step stored the promise (why ${o?.why}, keepers_promised ${!!o?.story.flags.keepers_promised}, area ${o?.area})`);
    await boot(sv); await install(); await S('tick', 90);
    const w2 = await S('people', ['elise', 'lotte']), s2 = await S('st'); await shot('promise_loaded', 'that save, loaded');
    put('     · loaded: ' + JSON.stringify(w2));
    ok(s2.area === 'eshville_past' && w2.elise?.on && w2.elise.at[0] === 4296 && w2.elise.at[1] === 1436 && JSON.stringify(w2.elise.look) === '[4104,1436]' && w2.elise.faces[0] < -0.9, `loaded: the area is built from the flag - Elise right of the bell ${JSON.stringify(w2.elise?.at)}, looking at Lotte's place ${JSON.stringify(w2.elise?.look)} (facing ${JSON.stringify(w2.elise?.faces)})`);
    ok(w2.lotte?.on && w2.lotte.at[0] === 4104 && w2.lotte.at[1] === 1436 && JSON.stringify(w2.lotte.look) === '[4296,1436]' && w2.lotte.faces[0] > 0.9, `loaded: Lotte left of the bell ${JSON.stringify(w2.lotte?.at)}, looking at Elise ${JSON.stringify(w2.lotte?.look)} (facing ${JSON.stringify(w2.lotte?.faces)})`);
  });

  C('rebuild_real', 'a real rebuild in place (the trapped door: door_pulled): the veil, no text, no pad', async () => {
    await boot(before('ev_door_pull')); await idle(); await install();
    await P('beside', 'trapped_door', -40); const u = await P('use', 'trapped_door'); if (u.err) throw new Error(u.err);
    await ev(() => { window.__sm.adv = true; });
    const f = await S('until', "s.go === 'same'", 1200); await ev(() => { window.__sm.adv = false; });
    ok(f.n >= 0, `the door is pulled, the scene is over, the rebuild begins (the area is built from door_pulled): go ${f.go}`);
    const f1 = await S('tick', 8); await shot('rebuild_1_fade', 'the veil rises (8 ticks in)'); ok(f1.pad === 0, `as the veil rises the pad is off (${f1.pad} pieces: ${f1.vis || 'none'}; veil ${f1.fade})`);
    const b = await S('until', '!s.ready', 60); const file = await shot('rebuild_2_building', 'the area is being built');
    ok(b.n >= 0 && b.pad === 0 && !b.msg, `while the area is built: not ready, the pad is off (${b.pad}), no message in the HUD state ("${b.msg}")`);
    await page().waitForFunction(() => !!window.__v2?.ready && !!window.__v2.scene?.sim, null, { timeout: 60000 });
    const z = await S('tick', 50); await shot('rebuild_3_after', 'built again'); ok(z.ready && z.pad >= 6 && z.fade < 0.2, `built again: ready, the pad back (${z.pad} pieces), veil ${z.fade}`);
    put('     · the building still: ' + file + ' (its darkest / brightest pixel is read by the sheet script)');
  });

  C('busts', "the very first page of a first-time speaker after a fresh page load: the bust is in its frame", async () => {
    await boot(after('ev_keepers')); await install();
    const pr = await ev(() => ({ pre: window.__v2.scene.hud.portraitsReady ?? null, wait: window.__v2.scene.bustsWaitMs ?? null, loadMs: window.__v2.scene.loadMs }));
    ok(!!pr.pre && pr.pre.n >= 13, `the busts were loaded and decoded while the area loaded: ${JSON.stringify(pr.pre)}; the load waited ${pr.wait} ms for them; the area's load took ${pr.loadMs} ms`);
    await idle(); await P('putY', 4130, 1402, 84); await ev(() => window.__cc.until({ idle: true }, 30)); await P('ring', 'big_bell');
    const a = await S('until', "s.modal === 'dialog'", 600); await S('tick', 9); await shot('bust_lotte_first_tick', 'Lotte\'s bread line, 0.15 s after the box opened (the box has faded in)'); ok(a.n >= 0 && a.line.includes('빵은'), `Lotte's first line of this session is open (${a.line.slice(0, 30)})`);
    await boot(before('ev_church_arrive')); await install(); await idle(); await P('trig', 'church.arrive');
    const b = await S('until', "s.modal === 'dialog'", 600); await S('tick', 9); await shot('bust_alberto_first_tick', 'the church: the first page, 0.15 s after the box opened'); ok(b.n >= 0, `the church scene's first page is open (${b.line.replace(/\n/g, ' / ').slice(0, 40)})`);
  });

  C('banners', 'the first line of ev_return_first (the first crossing back): no place name over it', async () => {
    await boot(before('ev_bell_first')); await idle(); await install();
    const bell = await ev(() => (window.__v2.scene.area.interact.find((q) => q.kind === 'bell' && q.event === 'bell.ring') ?? {}).id ?? null);
    await P('beside', bell, -44); await ev(() => window.__cc.until({ idle: true }, 30)); await P('ring', bell);
    await until({ line: '' }); await until({ shot: 'years', mid: true });
    const r = await until({ line: '' }, 300); await install(); const s = await S('st'); await shot('return_first_line', 'ev_return_first, first line');
    ok(r.area === 'eshville_now' && s.banner !== 'area', `the first line of ev_return_first in ${r.area}: banner on screen ${s.banner ? s.banner + ' 「' + s.bannerTitle + '」' : 'none'} (the story's own night banner, never the place name)`);
  });

  C('held_bell2', "the hall's bell in the queen's first act answers every long ring", async () => {
    await boot(after('ev_boss_intro')); await install(); await S('tick', 180);
    const b = await ev(() => { const d = window.__v2.scene.area.interact.find((q) => q.id === 'bell_arena'); return { x: d.x, z: d.z, y: d.y ?? 0 }; });
    await P('putY', b.x, b.z - 44, b.y); await S('tick', 40);
    // what the test listens to: the sounds played, the notices, the rules' bell events
    await ev(async () => {
      const m = await import('/src/v2/feel/index.js'), f = m.feel, v = window.__v2, sc = v.scene, L = (window.__hb = { snd: [], ev: [], log: [] });
      const play = f.play.bind(f); f.play = (n, ...a) => { L.snd.push(n); return play(n, ...a); };
      const emit = sc.emit.bind(sc); sc.emit = (n, d) => { if (n === 'play.ringLong' || n === 'play.deny' || n === 'bell.long' || n === 'bell.echo' || n === 'play.hurt' || n === 'play.hit') L.ev.push(n); return emit(n, d); };
    });
    const q0 = await ev(() => { const e = window.__v2.scene.sim.enemies.find((x) => x.def?.boss); return e ? { hp: Math.round(e.hp), active: !!e.active, phase: e.bphase } : null; });
    put('     · in the hall: queen ' + JSON.stringify(q0));
    const hold = (n, guard) => ev(([n, guard]) => {
      const g = window.__game, v = window.__v2, sc = v.scene, h = sc.sim.hero, L = window.__hb, b = (sc.hud.metrics().pad?.buttons ?? []).find((q) => q.id === 'bell');
      const fire = (type) => window.dispatchEvent(new PointerEvent(type, { pointerId: 15, pointerType: 'touch', isPrimary: false, clientX: b.cx, clientY: b.cy, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, width: 12, height: 12, pressure: type === 'pointerup' ? 0 : 0.5 }));
      const s0 = { snd: L.snd.length, ev: L.ev.length, seen: sc.host.seen.length, hp: Math.round(h.hp) }; let last = '', rows = [];
      g._pageHidden = true; g.tick(1 / 60); fire('pointerdown'); let i = 0;
      for (; i < n; i++) { if (guard) h.ifr = 1; g.tick(1 / 60); const k = `${h.act ?? '-'}|cd${h.bellCd > 0 ? 1 : 0}|down${h.bellDown ? 1 : 0}|wait${h.bellWait ? 1 : 0}|hurt${h.hurtT > 0 ? 1 : 0}|ok${h.bellOk ? 1 : 0}|hp${Math.round(h.hp)}`; if (k !== last) { rows.push(i + ':' + k); last = k; } if (sc.hud.modal === 'dialog') break; }
      fire('pointerup'); g.tick(1 / 60);
      return { held: i, rows: rows.slice(0, 24), snd: L.snd.slice(s0.snd), ev: L.ev.slice(s0.ev), shown: sc.host.seen.slice(s0.seen).map((q) => q[0] + ' ' + String(q[2] || q[1]).replace(/\n/g, ' / ').slice(0, 34)), hp0: s0.hp, hp: Math.round(h.hp), modal: sc.hud.modal ?? null, warn: sc.host.warnings.length, area: v.area };
    }, [n, guard]);
    const closeLine = async () => { await ev(() => { window.__sm.adv = true; }); const z = await S('until', "s.modal === null && !s.busy && !s.lock", 400); await ev(() => { window.__sm.adv = false; }); return z; };
    // 1) the first long ring
    const h1 = await hold(320, false); put('     · hold 1: ' + JSON.stringify(h1));
    ok(h1.ev.includes('play.ringLong') && h1.snd.includes('cross.dull') && h1.shown.some((l) => l.startsWith('notice') && l.includes('둔하게')) && h1.shown.some((l) => l.includes('붙들고')) && h1.area === 'ossuary_now', `1st long ring: the dull toll (${h1.snd.filter((n) => /dull|toll/.test(n)).join(', ')}), the notice, and the line that says why`);
    await closeLine();
    // 2) the verifier's sequence: a tap, then a hold straight after - logged
    const t = await hold(4, false); put('     · a tap: ' + JSON.stringify({ ev: t.ev, snd: t.snd.filter((n) => /bell|dull|toll/.test(n)), rows: t.rows })); await S('tick', 50);
    const h2 = await hold(320, false); put('     · hold 2 (straight after the tap, the queen free to strike): ' + JSON.stringify(h2));
    const rang2 = h2.ev.includes('play.ringLong');
    ok(true, `2nd hold, as the verifier did it: ${rang2 ? 'the ring completed and was answered: ' + h2.snd.filter((n) => /dull/.test(n)).join(', ') : 'the ring did NOT complete - the rules\' own states, tick: ' + h2.rows.join('  ')}; health ${h2.hp0} -> ${h2.hp}`);
    if (h2.modal === 'dialog') await closeLine();
    await S('tick', 160);
    // 3) and 4) two more long rings with the hero untouchable (the tool's hand), so that the rules let each ring complete
    for (const k of [3, 4]) {
      // (the hero is made untouchable first and the tool waits until the rules have him standing free: a press that begins while he is knocked back is dropped by the rules - see hold 2's log and the report)
      await ev(() => { const g = window.__game, h = window.__v2.scene.sim.hero; g._pageHidden = true; for (let i = 0; i < 400; i++) { h.ifr = 1; g.tick(1 / 60); if (i > 30 && !(h.hurtT > 0) && h.bellOk) break; } });
      const h3 = await hold(320, true); put(`     · hold ${k} (the hero untouchable): ` + JSON.stringify(h3));
      ok(h3.ev.includes('play.ringLong') && h3.snd.includes('cross.dull') && h3.shown.filter((l) => l.startsWith('notice') && l.includes('둔하게')).length === 1 && !h3.shown.some((l) => l.includes('붙들고')) && h3.modal === null && h3.area === 'ossuary_now', `long ring ${k}: the dull toll and the notice again, the line not again (sounds ${h3.snd.filter((n) => /dull|toll/.test(n)).join(', ')}; shown ${JSON.stringify(h3.shown)})`);
      await S('tick', 200);
    }
    const z = await S('st'); const q1 = await ev(() => { const e = window.__v2.scene.sim.enemies.find((x) => x.def?.boss); return e ? { hp: Math.round(e.hp), phase: e.bphase } : null; });
    ok(z.warn === 0, `scene.host.warnings is empty after all of it (${z.warn}); queen ${JSON.stringify(q1)} (was ${JSON.stringify(q0)})`);
  });
}
