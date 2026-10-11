// 시범 비교 영상용 전투 녹화: 게임을 한 프레임씩 진행(tools/qa/lib/step.mjs)하며 스크린샷과 audio.sfx 호출 기록(프레임·이름·옵션)을 남긴다.
// 소리는 ab_render.mjs 가 이 기록을 게임 오디오 엔진으로 다시 울려 만든다 (지금 소리 / v2 — 같은 장면, 같은 호출).
//  node tools/audio/sfx_v2/capture_combat.mjs --url "index.html?scene=stage&stage=s01&char=kael" --frames 3600 --out log.json \
//       [--shots dir --every 2 --q 82] [--heal] [--vp 1280x720]
//  --heal  체력만 매 프레임 채운다 (무적 아님 → 맞으면 'hurt' 가 그대로 울린다)
// 봇: 가까운 적에게 다가가 공격, 가끔 점프·보조무기·기술·궁극기. 대화·컷인은 Enter 로 넘긴다.
import fs from 'node:fs';
import path from 'node:path';
import { openEnv } from '../../qa/lib/server.mjs';
import { freeze, step } from '../../qa/lib/step.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const URL_ = opt('url', 'index.html?scene=stage&stage=s01&char=kael');
const FRAMES = +opt('frames', 3600), OUT = opt('out', '/tmp/combat_log.json');
const SHOTS = opt('shots', null), EVERY = +opt('every', 2), Q = +opt('q', 82);
const VP = opt('vp', '1280x720').split('x').map(Number);
const env = await openEnv();
const s = await env.page({ viewport: { width: VP[0], height: VP[1] } }, URL_, { storage: flag('v2') ? { 'bn.sfx': 'v2' } : {} });
await s.page.waitForTimeout(1500);
await s.page.keyboard.press('KeyZ');           // 오디오 잠금 해제 (사용자 입력)
await s.skipDialogue(80);
await s.page.waitForTimeout(500);
await s.eval(async () => {
  const A = await import('/src/core/audio.js');
  const log = window.__sfxLog = [];
  const orig = A.audio.sfx.bind(A.audio);
  A.audio.sfx = (name, o) => { const g = window.__game; log.push({ f: g.frame, name, o: o ? JSON.parse(JSON.stringify(o)) : null }); return orig(name, o); };
});
await freeze(s.page);
const f0 = await s.eval(() => window.__game.frame);
const K = { right: 'ArrowRight', left: 'ArrowLeft', jump: 'KeyZ', attack: 'KeyX', sub: 'KeyA', skill1: 'KeyS', ult: 'KeyF' };
const held = new Set();
const set = async (k, on) => { const c = K[k]; if (on && !held.has(c)) { held.add(c); await s.page.keyboard.down(c); } else if (!on && held.has(c)) { held.delete(c); await s.page.keyboard.up(c); } };
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shots = [];
for (let i = 0; i < FRAMES; i++) {
  const st = await s.eval(() => { const w = window.__game.world, p = w?.player; if (!p) return null; const e = w.nearestEnemy(p.cx, p.cy, 700); return { px: p.cx, py: p.cy, f: p.facing, ex: e ? e.cx : null, ey: e ? e.cy : null }; });
  let goR = true, goL = false, atk = false, jmp = false;
  if (st && st.ex != null) {
    const dx = st.ex - st.px, dy = st.ey - st.py, near = Math.abs(dx) < 120 && Math.abs(dy) < 110;
    goR = !near && dx > 0; goL = !near && dx < 0;
    if (near && Math.sign(dx) !== st.f && Math.abs(dx) > 12) { goR = dx > 0; goL = dx < 0; }
    atk = near && (i % 10) < 3;
    jmp = dy < -70 && (i % 40) < 10;
  } else { jmp = (i % 120) >= 90 && (i % 120) < 100; }
  if ((i % 700) > 650) { goR = true; goL = false; }
  await set('right', goR); await set('left', goL); await set('attack', atk); await set('jump', jmp);
  await set('sub', (i % 600) >= 300 && (i % 600) < 304);
  await set('skill1', (i % 420) >= 200 && (i % 420) < 204);
  await set('ult', (i % 1500) >= 900 && (i % 1500) < 904);
  if (flag('heal')) await s.eval(() => { const p = window.__game.world?.player; if (p && p.maxHp) p.hp = p.maxHp; });
  const snap = !!SHOTS && i % EVERY === 0;
  await step(s.page, 1, snap);
  if (snap) { const fn = `f${String(shots.length).padStart(5, '0')}.jpg`; await s.page.screenshot({ path: path.join(SHOTS, fn), type: 'jpeg', quality: Q }); shots.push(i + 1); }
  if (i % 30 === 0) { const top = await s.eval(() => window.__game?.top?.name); if (top && /dialogue|story|document/.test(top)) await s.page.keyboard.press('Enter'); }
}
for (const c of held) await s.page.keyboard.up(c);
const res = await s.eval((f0) => ({ f0, frames: window.__game.frame - f0, log: window.__sfxLog, top: window.__game.top?.name, theme: window.__game.world?.stage?.theme, music: window.__game.world?.stage?.music }), f0);
res.shots = shots; res.every = EVERY; res.errs = s.errs; res.url = URL_;
fs.writeFileSync(OUT, JSON.stringify(res));
const cnt = {};
for (const e of res.log) cnt[e.name] = (cnt[e.name] || 0) + 1;
console.log(JSON.stringify({ frames: res.frames, calls: res.log.length, shots: shots.length, top: res.top, theme: res.theme, errs: res.errs.length }));
console.log(Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
await env.close();
