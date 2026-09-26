// 실시간 전투 검증: 실제 게임 루프(고정 60Hz)에서 보스전을 처음부터 사망까지 진행하며 상태 커버리지·오류·FPS·스크린샷을 모은다.
// 사용: node tools/painted/fight.mjs <bossId> [--mobile] [--vector] [--secs 70] [--out 폴더]
//   플레이어는 무적(체력 보충)으로 보스 쪽으로 다가가 공격 키를 누른다. 전투가 끝나도록 일정 간격으로 보스 체력을 깎는다.
//   출력: <out>/fight_<tag>_<n>.png, 상태 방문 목록, 채색 활성 비율, FPS(중앙값/최저), 페이지 오류
import { open, startFight, waitPainted } from './lib.mjs';
import fs from 'node:fs';
const argv = process.argv.slice(2);
const id = argv[0];
const val = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const mobile = argv.includes('--mobile'), vector = argv.includes('--vector');
const secs = +val('secs', 70);
const out = val('out', `/tmp/claude-0/painted/fight_${id}`);
fs.mkdirSync(out, { recursive: true });
const mod = await import(`./poses/${id}.mjs`);
const s = await open({ url: `index.html?scene=stage&stage=${mod.STAGE}&room=boss${vector ? '&painted=0' : ''}`, mobile, dpr: mobile ? 3 : 1.5 });
const tag = (vector ? 'V' : 'P') + (mobile ? 'm' : '');
await startFight(s.page);
if (!vector) console.log('bake', JSON.stringify(await waitPainted(s.page, id)));
// 페이지 쪽 감시: 상태 방문, 채색 활성, FPS
await s.page.evaluate(() => {
  const g = window.__game;
  window.__fight = { states: {}, twin: {}, painted: 0, frames: 0, fps: [], died: false, maxDeathT: 0, phases: [] };
  const F = window.__fight;
  setInterval(() => {
    const w = g.world, b = w?.boss, p = w?.player;
    if (!b) return;
    if (p && !p.dead) { p.hp = p.stats.hp; }
    F.frames++;
    F.states[b.state] = (F.states[b.state] ?? 0) + 1;
    if (b.twin) F.twin[b.twin.st] = (F.twin[b.twin.st] ?? 0) + 1;
    if (b._painted?.proxy && !b._painted.proxy.dead) F.painted++;
    if (!F.phases.includes(b.phase)) F.phases.push(b.phase);
    if (b.dying > 0) { F.died = true; F.maxDeathT = Math.max(F.maxDeathT, b.deathT ?? 0); }
    F.fps.push(g.fps);
  }, 100);
});
const KEY = { left: 'ArrowLeft', right: 'ArrowRight', attack: 'KeyX', jump: 'KeyZ' };
const t0 = Date.now();
let shot = 0, lastShot = -99, lastDmg = 0;
const snap = async (why) => { const f = `${out}/fight_${tag}_${String(shot++).padStart(2, '0')}_${why}.png`; await s.page.screenshot({ path: f }); return f; };
while ((Date.now() - t0) / 1000 < secs) {
  const el = (Date.now() - t0) / 1000;
  const st = await s.page.evaluate(() => {
    const w = window.__game.world, b = w.boss, p = w.player;
    if (!b) return { gone: true, cleared: w.cleared };
    const h = b.main, hx = h.hx;
    return { dx: hx - p.cx, hp: b.hp / b.stats.maxHp, state: b.state, dying: b.dying > 0, dead: b.dead, phase: b.phase, twin: !!b.twin };
  });
  if (st.gone || st.dead) { await snap('cleared'); break; }
  // 접근 + 공격
  const dir = st.dx > 60 ? 'right' : st.dx < -60 ? 'left' : null;
  if (dir) await s.page.keyboard.down(KEY[dir]);
  await s.page.keyboard.press(KEY.attack);
  await s.page.waitForTimeout(160);
  if (dir) await s.page.keyboard.up(KEY[dir]);
  if (Math.random() < 0.15) await s.page.keyboard.press(KEY.jump);
  // 진행: 3초마다 보스 체력 8% 감소 (페이즈 1 → 2(쌍두) → 사망)
  if (el - lastDmg > 3 && !st.dying) {
    lastDmg = el;
    await s.page.evaluate(() => { const w = window.__game.world, b = w.boss; if (b && !b.invuln && !(b.dying > 0)) b.takeHit(Math.ceil(b.stats.maxHp * 0.08), { stats: w.player.stats }, w, {}); });
  }
  if (el - lastShot > (st.dying ? 0.5 : 6)) { lastShot = el; await snap(`${st.state}${st.twin ? '_twin' : ''}${st.dying ? '_dying' : ''}`); }
}
const F = await s.page.evaluate(() => window.__fight);
const fps = [...F.fps].filter((v) => v > 0).sort((a, b) => a - b);
console.log(JSON.stringify({
  tag, secs: Math.round((Date.now() - t0) / 1000), states: F.states, twinStates: F.twin, phases: F.phases, died: F.died, maxDeathT: +F.maxDeathT.toFixed(2),
  paintedShare: +(F.painted / Math.max(1, F.frames)).toFixed(3), fpsMed: Math.round(fps[fps.length >> 1] ?? 0), fpsP10: Math.round(fps[Math.floor(fps.length * 0.1)] ?? 0),
}, null, 1));
console.log(s.errors.join('\n') || 'NO ERRORS');
await s.close();
