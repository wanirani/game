// 게임플레이 결정성 A/B: 같은 시드로 채색 / 벡터(?painted=0) 전투를 N 프레임 돌려 Math.random 호출 수와 보스 궤적이 같은지 본다.
// 채색 렌더러가 게임플레이 난수(Math.random, world.fx.emit/burst)를 쓰거나 로직 값을 바꾸면 여기서 갈라진다.
// 사용: node tools/painted/rng.mjs <bossId> [--frames 1500]
//   poses/<bossId>.mjs 의 STAGE 와 (있으면) RNG_SCRIPT(i, b, p, w) — 프레임별 대본(페이즈 전환 등). 없으면 700/1100 프레임에 체력을 깎아 페이즈를 넘긴다.
//   보스는 시작 전에 setup() 으로 다시 만든다(굽기 대기 동안 실제 루프가 돌아 초기 상태가 달라지므로).
import { open, startFight, freeze, waitPainted } from './lib.mjs';
const argv = process.argv.slice(2);
const id = argv[0];
if (!id) { console.log('usage: node tools/painted/rng.mjs <bossId> [--frames 1500]'); process.exit(1); }
const val = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const frames = +val('frames', 1500);
const mod = await import(`./poses/${id}.mjs`);
async function run(vector) {
  const s = await open({ url: `index.html?scene=stage&stage=${mod.STAGE}&room=boss${vector ? '&painted=0' : ''}`, dpr: 1 });
  await startFight(s.page);
  if (!vector) await waitPainted(s.page, id);
  await freeze(s.page);
  const r = await s.page.evaluate(([frames, script]) => {
    const g = window.__game, w = g.world, b = w.boss, p = w.player;
    const user = script ? eval(script) : null;
    let x = 777, calls = 0;
    Math.random = () => { calls++; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
    if (b.homeX !== undefined) b.x = b.homeX - b.w / 2;
    b.setup?.(); b.hp = b.stats.maxHp; b.phase = 0; b.inferno = false; b.setState('idle'); b.cool = 0.5; b.t = 0;
    p.hp = p.stats.hp = 1e9; p.x = (b.A?.x0 ?? b.x - 400) + 330; p.vx = 0; p.vy = 0;
    const rows = []; let h = 0;
    for (let i = 0; i < frames; i++) {
      p.iframes = 1e9; p.hp = 1e9;
      if (user) user(i, b, p, w);
      else if (i === Math.round(frames * 0.47)) b.takeHit(b.stats.maxHp * 0.45, { stats: p.stats }, w, {});
      else if (i === Math.round(frames * 0.73)) b.takeHit(b.stats.maxHp * 0.3, { stats: p.stats }, w, {});
      g.__tick(1 / 60); g.__render();
      const row = [b.state, +b.x.toFixed(3), +b.y.toFixed(3), +(b.hp).toFixed(2), calls];
      h = (Math.imul(h ^ Math.round(b.x * 100), 16777619) ^ Math.round(b.y * 100) ^ (calls << 3)) >>> 0;
      rows.push(row);
    }
    return { calls, hash: h, rows, painted: !!b._painted?.proxy && !b._painted.proxy.dead };
  }, [frames, mod.RNG_SCRIPT ?? null]);
  r.errors = s.errors;
  await s.close();
  return r;
}
const P = await run(false), V = await run(true);
let first = -1;
for (let i = 0; i < P.rows.length; i++) if (JSON.stringify(P.rows[i]) !== JSON.stringify(V.rows[i])) { first = i; break; }
console.log(JSON.stringify({ id, frames, painted: { calls: P.calls, hash: P.hash, proxy: P.painted }, vector: { calls: V.calls, hash: V.hash } }));
if (first >= 0) console.log('first difference at frame', first, JSON.stringify(P.rows[first]), 'vs', JSON.stringify(V.rows[first]));
console.log([...P.errors, ...V.errors].join('\n') || 'NO ERRORS');
console.log(first < 0 && P.calls === V.calls ? 'PASS: gameplay RNG and boss trajectory identical' : 'FAIL: painted path changes gameplay');
process.exit(first < 0 && P.calls === V.calls && P.painted ? 0 : 1);
