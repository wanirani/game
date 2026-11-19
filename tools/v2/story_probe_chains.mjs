// STORY2 (2026-11-19): look at a camera shot before the story uses it - a chain for tools/v2/chapter_cuts.mjs.
//   node tools/v2/chapter_cuts.mjs --saves <bot saves> --out <dir> --devices fold_open --chains tools/v2/story_probe_chains.mjs --only probe --from ev_gate_now --probe <file.json>
// <file.json> = [{ name, shot: '<SHOTS name>' | { pitch, dist, lookY, at, yaw, tallK }, points?: [[x, y, z], …], put?: { id: [x, z] } }]: the save after --from is loaded
// (the hero free), each shot is laid on the camera for 240 ticks (the story's own camera path: scene.host.shot), a still is saved and every point is projected (screen x, y; in = inside
// the picture). put = people set down for the still (the tool's hand, not the story's).
import fs from 'node:fs';
export default function (T) {
  const { C, boot, idle, ev, after, put, page, OUT, dev, args } = T;
  C('probe', 'camera shots looked at', async () => {
    const L = JSON.parse(fs.readFileSync(String(args.probe), 'utf8'));
    await boot(after(String(args.from || 'ev_gate_now'))); await idle();
    for (const q of L) {
      const r = await ev(async (q) => {
        const g = window.__game, v = window.__v2, sc = v.scene, H = sc.host, m = await import('/src/v2/game/storyhost.js');
        H.shot = typeof q.shot === 'string' ? m.SHOTS[q.shot] : q.shot;
        for (const id in q.put ?? {}) { const p = sc.people.byId(id); if (p) { H._place(p, q.put[id][0], q.put[id][1]); sc.hidden.set(id, 'show'); } }
        g._pageHidden = true; for (let i = 0; i < 240; i++) g.tick(1 / 60); g.alpha = 1; g.render();
        const out = (q.points ?? []).map(([x, y, z]) => { const o = sc.project(x, y, z, {}); return [x, y, z, Math.round(o.x), Math.round(o.y), o.x >= 0 && o.x <= g.viewW && o.y >= 0 && o.y <= g.viewH && o.w > 1]; });
        return { view: [g.viewW, g.viewH], cam: [Math.round(sc.cam.px), Math.round(sc.cam.py), Math.round(sc.cam.pz)], out, who: Object.fromEntries(sc.people.list.filter((p) => p.on).map((p) => [p.id, [Math.round(p.x), Math.round(p.z), Math.round(p.y)]])) };
      }, q);
      const f = `${OUT}/${dev()}/probe_${q.name}.jpg`; fs.mkdirSync(`${OUT}/${dev()}`, { recursive: true }); await page().screenshot({ path: f, type: 'jpeg', quality: 88 });
      put(`     probe ${q.name}: view ${r.view} cam ${r.cam} -> ${f}`);
      for (const o of r.out) put(`       (${o[0]}, ${o[1]}, ${o[2]}) -> screen ${o[3]}, ${o[4]} ${o[5] ? 'in' : 'OUT'}`);
      if (q.who) put('       who ' + JSON.stringify(r.who));
    }
  });
}
