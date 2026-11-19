// WHIP2-VERIFY lane — why does a hook pressed early in a roll under the graveyard ring sometimes not come out? (the page, one browser, pad handlers)
//   node tools/v2/whip_v2ringprobe.mjs [--device fold_open] [--n 60] [--keeper 1]
// Stages what tools/v2/whipverify_page.mjs --part press does under the ring (a grave-keeper awake 70 px ahead, the roll goes toward him), presses the
// skill d ticks after the roll, and keeps a record per tick: roll, stun, ground, hook lit, the carried press and its hold. Prints every trial without a hook.
import { launch, argsOf } from './whip_lib.mjs';
const args = argsOf(process.argv), DEV = String(args.device || 'fold_open'), N = Number(args.n ?? 60), KEEPER = args.keeper !== '0';
const L = await launch();
try {
  const page = await L.page(DEV); await L.open(page, 'graveyard_now', '&v2res=0.5');
  const r = await page.evaluate(([N, KEEPER]) => {
    const sc = window.__v2.scene, W = window.__W, sim = sc.sim, h = sim.hero; W.drawEvery = 10; W.clear();
    for (const x of sc.area.exits ?? []) { x.locked = true; if (x._box) x._box.solid = true; }
    const P = sim.hookPoints[0]; let S = null;
    for (const d of [120, 90, 150, 60, 180, 210]) { for (let k = 0; k < 8 && !S; k++) { const a = (k * Math.PI) / 4, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d; if (!Number.isFinite(W.ground(x, z))) continue; W.put(x, z, 1, 0); W.tick(3); if (h.hookId != null && h.onGround) S = { x, z }; } if (S) break; }
    if (!S) return { skip: 'no spot' };
    if (KEEPER) W.enemy('gravekeeper_armor', S.x + 70, S.z + 30, { awake: true, hp: 99999 });
    const out = { spot: S, ring: [P.x, P.y, P.z, P.to], trials: [], n: 0, thrown: 0 };
    const ev0 = sim.hooks.event; let acts = [];
    sim.hooks.event = function (name, a, b, ...r) { if (name === 'act') acts.push(b); if (name === 'heroHurt') acts.push('HURT'); if (name === 'deny') acts.push('deny'); return ev0.call(this, name, a, b, ...r); };
    for (let i = 0; i < N; i++) {
      const d = i % 15;
      W.put(S.x, S.z, 1, 0); W.tick(4 + ((i * 7) % 30)); acts = [];
      W.stick(1, 0); W.tick(1); W.down('roll'); W.tick(2); W.up('roll'); W.stick(0, 0); W.tick(d);
      const at0 = { roll: h.dashT > 0, hurt: h.hurtT > 0, hook: h.hookId != null, air: !h.onGround };
      W.down('skill'); const tr = [];
      for (let k = 0; k < 40; k++) { W.tick(1); if (k === 2) W.up('skill'); tr.push(`${h.dashT > 0 ? 'R' : '-'}${h.hurtT > 0 ? 'H' : '-'}${h.onGround ? 'g' : 'A'}${h.hookId != null ? 'k' : '.'}${h.bufS > 0 ? 's' : '.'}${h.bufSH > 0 ? 'h' : '.'}${h.act ? '+' + h.act : ''}${h.move ? '+' + h.move.id : ''}`); if (h.act === 'hook') break; }
      out.n++; const ok = acts.includes('hook'); if (ok) out.thrown++;
      if (!ok) out.trials.push({ i, d, at0, acts: acts.join(','), x: Math.round(h.x - S.x), z: Math.round(h.z - S.z), y: Math.round(h.y), tr: tr.slice(0, 30).join(' ') });
      let k = 0; while (h.act && k++ < 90) W.tick(1);
    }
    sim.hooks.event = ev0;
    return out;
  }, [N, KEEPER]);
  if (r.skip) console.log('skipped: ' + r.skip);
  else { console.log(`ring ${JSON.stringify(r.ring)} spot ${JSON.stringify(r.spot)} keeper ${KEEPER}: hook thrown ${r.thrown} of ${r.n} roll+skill trials`); for (const t of r.trials) console.log(`  NOT thrown: trial ${t.i} skill ${t.d} ticks after the roll press · at press ${JSON.stringify(t.at0)} · events ${t.acts || '-'} · ends at dx ${t.x} dz ${t.z} y ${t.y}\n     ${t.tr}`); }
} catch (e) { L.errs.push('[tool] ' + (e?.stack ?? e)); }
await L.close();
for (const e of L.errs) console.log('ERR ' + e);
process.exit(L.errs.length ? 1 : 0);
