// 메뉴 탭별 렌더 비용 측정: eval=import('/tools/menu_perf.js?n=1') → console.warn 으로 결과 출력
const g = window.__game;
const q = new URL(import.meta.url).searchParams;
const tabs = (q.get('tabs') || 'status,equip,inventory,skills,class,quests,docs,bestiary,system').split('.');
const out = [];
const t0 = performance.now(); for (let i = 0; i < 30; i++) g.render(); const base = (performance.now() - t0) / 30;
out.push(`현재장면 ${base.toFixed(2)}ms`);
const run = (id, patch) => {
  while (g.scenes.length > 1) g.pop();
  g.push('menu', { world: g.world, tab: id });
  for (let i = 0; i < 5; i++) { g.top.t += 0.5; g.render(); }
  if (patch) patch(g.top);
  const a = performance.now();
  for (let i = 0; i < 30; i++) { g.top.cur.t += 1 / 60; g.render(); }
  return ((performance.now() - a) / 30).toFixed(2);
};
out.push(`빈탭 ${run('status', (m) => { m.cur.render = () => {}; })}ms`);
for (const id of tabs) out.push(`${id} ${run(id)}ms`);
out.push(`status-림없음 ${run('status', (m) => { const v = m.cur.view; const d = v.draw.bind(v); v.draw = (ctx, a, b, c) => d(ctx, a, b, c, { rim: false }); })}ms`);
out.push(`status-영웅없음 ${run('status', (m) => { m.cur.view.draw = () => {}; })}ms`);
out.push(`status-무대없음 ${run('status', (m) => { m.cur.view.draw = () => {}; m.cur.stage.draw = () => {}; })}ms`);
while (g.scenes.length > 1) g.pop();
console.warn('[perf] ' + out.join(' | '));
