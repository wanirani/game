// STORY2 (2026-11-19): the ending seen from where the hero rang - chains for tools/v2/chapter_cuts.mjs (its stills and its numbers per person: frame, seen).
//   node tools/v2/chapter_cuts.mjs --saves <bot saves> --out <dir> --devices fold_open --chains tools/v2/story_end_chains.mjs --only end_west,end_east,end_south,end_far
// end_<pos>: the save after ev_keepers, the hero put at <pos> beside the big bell, the bell's interact event raised (as the tool's own `ending` chain does), then a
// still at Lotte's bread question, at tonight's first line, in the middle of the widening ring, at the town's first line, at its last line in the bell's picture and
// at the narrator's last line. NOT honest play (the hero is put, the ring is raised); the scenes are the story's own.
export default function (T) {
  const { C, boot, until, idle, P, ev, still, after, put } = T;
  // dx, dz from the bell's spot (4200, 1408; the long ring reaches r + 60 = 140 px): west and east of it, south of it at the rail, and the farthest points a ring still counts from
  const POS = { west: [-70, -6], east: [70, -6], south: [0, -72], mid: [0, -18], far: [-134, 30], farE: [120, 66], farS: [-40, -128] };
  const who = () => ev(() => { const sc = window.__v2.scene, h = sc.sim.hero, o = { hero: [Math.round(h.x), Math.round(h.z), +(h.dirX ?? 0).toFixed(2), +(h.dirZ ?? 0).toFixed(2)] }; for (const p of sc.people.list) if (p.on) o[p.id] = [Math.round(p.x), Math.round(p.z)]; return o; });
  for (const tag of Object.keys(POS)) C('end_' + tag, `the ending, rung from ${tag} of the bell (${POS[tag]})`, async () => {
    const [dx, dz] = POS[tag];
    await boot(after('ev_keepers')); await idle();
    const b = await ev(() => { const d = window.__v2.scene.area.interact.find((q) => q.id === 'big_bell'); return { x: d.x, z: d.z, y: d.y ?? 0 }; });
    const at = await P('putY', b.x + dx, b.z + dz, b.y); await ev(() => window.__cc.until({ idle: true }, 30));
    put(`     · ${tag}: the hero rings from ${JSON.stringify(at)} (wanted ${b.x + dx}, ${b.z + dz}); ${Math.round(Math.hypot(at[0] - b.x, at[1] - b.z))} px from the bell's spot`);
    await P('ring', 'big_bell');
    await until({ line: '빵은' }, 200); await still(`${tag}_bread`, '로테의 물음 — 「참, 빵은 맛있었어요?」 (ev_ending)', ['hero', 'lotte', 'elise'], 'ev_ending'); put('       who ' + JSON.stringify(await who()));
    await until({ line: '엘리제가 답한다' }, 300); await still(`${tag}_home_first`, '오늘 밤의 첫 줄 (ev_ending_home)', ['hero', 'elise'], 'ev_ending_home'); put('       who ' + JSON.stringify(await who()));
    await until({ shot: 'ring_widen', mid: true }, 300); await still(`${tag}_ring`, '종소리가 넓어진다 (camera ring_widen, middle)', [], 'ev_ending_home');
    const about = await ev(() => (window.__v2.scene.people.byId('marta')?.on ? 1 : 0));
    await until({ line: '엘리제! 이 녀석' }, 400); const A = ['hero', 'elise', 'alberto', ...((await ev(() => { const p = window.__v2.scene.people.byId('marta'), c = window.__v2.scene.cam; return !!p && p.on && Math.abs(p.x - c.tx) < 400 && Math.abs(p.z - c.tz) < 400; })) ? ['marta'] : [])]; void about;
    await still(`${tag}_marta`, '마을의 첫 줄 — 마르타 (ev_ending_home)', A, 'ev_ending_home'); put('       who ' + JSON.stringify(await who()));
    await until({ line: '아닐세' }, 300); await still(`${tag}_town_last`, '마을의 마지막 줄 — 종 앞 (ev_ending_home)', A, 'ev_ending_home');
    await until({ line: '까마귀' }, 300); await still(`${tag}_feather`, '해설의 마지막 줄 — 까마귀 깃털 (ev_ending_home)', [], 'ev_ending_home');
  });
}
