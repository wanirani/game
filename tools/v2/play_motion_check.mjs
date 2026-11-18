// PLAY 구역 움직임 검사 (node, 그리지 않고 뼈대 숫자로): node tools/v2/play_motion_check.mjs [--stride]
// 보는 것: ① 공격마다 칼끝이 가장 빠른 순간이 규칙의 판정 구간 안에 있고 그때 칼이 몸 앞을 지나는가 (여덟 방향)
//          ② 달리기 · 걷기에서 디딘 발이 땅 위에서 미끄러지지 않는가 (TUNE.strideRun · strideWalk 가 클립 보폭과 맞는가)
//          ③ 스틱을 반대로 꺾을 때 몸이 한쪽으로만 돌고(오락가락 없음) 0.35초 안에 끝나는가
//          ④ 영웅 · 적 여섯 종을 규칙과 함께 돌려 NaN 이 없는가, 종류표의 클립 이름이 실제로 있는가
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, Animator } from '../../src/v2/char3d/skel.js';
import { buildClips } from '../../src/v2/char3d/clips.js';
import { Char3D, GRIP } from '../../src/v2/char3d/hero3d.js';
import { clipsFromGroup } from '../../src/v2/play/animlib.js';

const P = await import(process.env.PLAY_ENTRY || '../../src/v2/play/index.js');
const { Sim, TUNE, KINDS, MOVES, COMBO, flatArena, driveHero, driveActor, usePlayClips, UNIT } = P;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(root, 'assets/v2/char3d');
let pass = 0, fail = 0; const fails = [], realRandom = Math.random;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  (' + extra + ')' : '')); };
const DT = 1 / 60, ID = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// 라이브러리 + 모델을 node 에서 읽는다
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'clips/index.json'), 'utf8')), lib = {};
for (const g of index.groups) if (['locomotion', 'combat', 'reactions', 'magic', 'enemy'].includes(g.g)) Object.assign(lib, clipsFromGroup(buildModel(readGLB(path.join(DIR, 'clips', g.file))), index));
usePlayClips(lib);
function mkChar(id) {
  const model = buildModel(readGLB(path.join(DIR, id + '.glb'))), rig = new Rig(model), asset = { model, clips: buildClips(rig, model.anims), url: 'assets/v2/char3d/' + id + '.glb' };
  const ch = Object.create(Char3D.prototype);
  Object.assign(ch, { asset, rig: new Rig(model), dx: 1, dz: 0, scale: UNIT, kbT: 0, kbSp: 0, M: new Float32Array(16), WM: new Float32Array(16), _g: new Float32Array(16), _t: new Float32Array(16), grip: { ...GRIP } });
  ch.anim = new Animator(ch.rig, asset.clips); ch.anim.play('idle', { fade: 0 }); ch.anim.update(0);
  return ch;
}
const finiteRig = (ch) => { const W = ch.rig.world; for (let i = 0; i < W.length; i++) if (!Number.isFinite(W[i])) return false; return Number.isFinite(ch.dx) && Number.isFinite(ch.dz); };
/** 칼끝 (모델 공간: +Z 앞, +X 왼쪽, +Y 위) */
function tip(ch) { const W = ch.weaponMatrix(ID); return W ? [W[4] * 70 + W[12], W[5] * 70 + W[13], W[6] * 70 + W[14]] : null; }
const kael = mkChar('kael');
console.log(`kael: hip ${kael.rig.restHipY.toFixed(2)} · height ${(kael.rig.maxY - kael.rig.minY).toFixed(2)} (model units) · lib clips ${Object.keys(lib).length}`);

// ── ① 칼이 판정 구간 안에서 몸 앞을 지나는가 ──
for (const mv of [...COMBO, MOVES.sweep]) {
  for (const k of [0, 2, 5]) {   // 방향 셋(0° · 90° · 225°)에서: 결과가 같아야 한다 — 방향과 무관
    const a = (k * Math.PI) / 4, sim = new Sim(flatArena(520, 360, []), {}), h = sim.hero, ch = mkChar('kael');
    h.dirX = Math.cos(a); h.dirZ = Math.sin(a); ch.dx = h.dirX; ch.dz = h.dirZ;
    h.move = mv; h.moveT = 0; h.combo = mv.n ?? 0; h.hitIds = new Set(); h.stepDist = 0; h.swung = true; h.anim = 'attack';
    let prev = null, best = { v: 0, t: 0 }, front = 0, n = 0, zmax = -9, az = [];
    for (let t = 0; t < mv.dur; t += DT) {
      h.moveT = t; driveHero(ch, h, DT, TUNE);
      const p = tip(ch); if (!p) break;
      if (prev && t > 0.075) { const v = Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) / DT; if (v > best.v) best = { v, t }; }   // first 0.07 s = blend from the stance into the wind-up, not the cut
      if (t >= mv.hit[0] && t <= mv.hit[1]) { n++; if (p[2] > 0.25) front++; zmax = Math.max(zmax, p[2]); az.push(Math.round((Math.atan2(p[0], p[2]) * 180) / Math.PI)); }
      prev = p;
    }
    const facing = ch.dx * h.dirX + ch.dz * h.dirZ;
    ok(`${mv.id} @${k * 45}°: blade fastest inside hit window, passes in front, body faces the cut`,
      best.t >= mv.hit[0] - 0.035 && best.t <= mv.hit[1] + 0.035 && front >= 1 && zmax > 0.45 && facing > 0.98,
      `peak ${best.v.toFixed(1)} m/s at ${best.t.toFixed(3)}s · window ${mv.hit[0]}–${mv.hit[1]} · tip front ${front}/${n} · reach ${zmax.toFixed(2)} m · azimuth ${az[0]}°→${az[az.length - 1]}°`);
  }
}

// ── ①b 준비 자세(락온한 채 서 있기): 칼끝이 앞을 본다 · 그 자세에서 시작한 공격도 준비 동작(칼을 뒤로 당김)과 판정이 그대로다 ──
{ const sim = new Sim(flatArena(900, 600, [{ kind: 'skeleton_soldier', x: 150, z: 0, active: true }]), {}), h = sim.hero, ch = mkChar('kael'), e = sim.enemies[0];
  const hold = () => { e.cd = 99; e.x = 150; e.z = 0; e.hp = e.hpMax; e.state = 'chase'; };
  for (let i = 0; i < 70; i++) { hold(); sim.update(DT, {}); driveHero(ch, h, DT, TUNE); }
  const p = tip(ch), az = (Math.atan2(p[0], p[2]) * 180) / Math.PI;
  ok('ready stance (locked on, standing): the blade points forward, held in front of the body', ch.anim.cur?.name === 'idle_combat' && h.lock === e.id && p[2] > 0.45 && Math.abs(az) < 50 && p[1] > 0.6, `clip ${ch.anim.cur?.name} · tip ${p[2].toFixed(2)} m in front, azimuth ${az.toFixed(0)}°, height ${p[1].toFixed(2)} m (the clip alone: 0.8 m behind, azimuth −176°)`);
  let prev = null, best = { v: 0, t: 0 }, back = 9, t = 0; hold(); sim.update(DT, { attack: true }); driveHero(ch, h, DT, TUNE);
  while (h.move && t < 0.44) { const q = tip(ch); if (prev && t > 0.075) { const v = Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]) / DT; if (v > best.v) best = { v, t: h.moveT }; } if (t < 0.13) back = Math.min(back, q[2]); prev = q; hold(); sim.update(DT, {}); if (sim.stop > 0) { sim.stop = 0; } driveHero(ch, h, DT, TUNE); t += DT; }
  ok('attack from the ready stance: the blade is still drawn back in the wind-up and is fastest inside the hit window', back < 0.1 && best.t >= MOVES.c1.hit[0] - 0.035 && best.t <= MOVES.c1.hit[1] + 0.035, `tip farthest back ${back.toFixed(2)} m during the wind-up · peak ${best.v.toFixed(1)} m/s at ${best.t.toFixed(3)} s (window ${MOVES.c1.hit[0]}–${MOVES.c1.hit[1]})`); }
// ── ①c 내딛기: 공격이 몸을 앞으로 옮기는 동안 다리가 한 걸음을 딛는다 — 땅에 닿아 있는 발이 몸과 함께 미끄러지지 않는다 ──
{ const meas = (legacy) => { const sim = new Sim(flatArena(900, 600, [{ kind: 'skeleton_soldier', x: 150, z: 0, active: true }]), {}), h = sim.hero, ch = mkChar('kael'), e = sim.enemies[0]; e.cd = 99;
    for (let i = 0; i < 30; i++) { e.cd = 99; e.x = 150; e.z = 0; sim.update(DT, {}); driveHero(ch, h, DT, TUNE); }
    sim.update(DT, { attack: true }); const sd = h.stepDist; if (legacy) h.stepDist = 0;   // legacy = no leg overlay (the overlay keys on stepDist) but the same slide
    const foot = (k) => { const W = ch.rig.boneWorld(k); return [h.x + (ch.dx * W[14] - ch.dz * W[12]) * UNIT, W[13], h.z + (ch.dz * W[14] + ch.dx * W[12]) * UNIT]; };   // model +Z = forward, +X = left → world
    let pl = null, pr = null, sum = 0, n = 0, air = 0, tot = 0, x0 = h.x, floor = 9;
    const rows = [];
    for (let i = 0; i < 12; i++) { driveHero(ch, h, DT, TUNE); const L = foot('footL'), R = foot('footR'); floor = Math.min(floor, L[1], R[1]); rows.push([h.moveT, L, R]);
      if (legacy) h.stepDist = sd; e.cd = 99; sim.update(DT, {}); if (legacy) h.stepDist = 0; }
    const S0 = MOVES.c1.step[0], S1 = MOVES.c1.step[1];   // 내딛는 구간 (예전 0.02–0.17초 → 고정 0.03–0.175 · 0.15 로 쟀다; 이제 기술표를 따른다)
    for (let i = 1; i < rows.length; i++) { const [t, L, R] = rows[i], [, L0, R0] = rows[i - 1]; if (t < S0 + 0.01 || t > S1 + 0.005) continue; tot++;
      const cl = L[1] < floor + 0.045 && L0[1] < floor + 0.045, cr = R[1] < floor + 0.045 && R0[1] < floor + 0.045;
      if (!cl && !cr) { air++; continue; }
      const vl = Math.hypot(L[0] - L0[0], L[2] - L0[2]) / DT, vr = Math.hypot(R[0] - R0[0], R[2] - R0[2]) / DT; sum += cl && cr ? Math.min(vl, vr) : cl ? vl : vr; n++; }
    return { slip: n ? sum / n : 0, body: (h.x - x0) / (S1 - S0), sd, n, air, tot }; };
  const a = meas(false), b = meas(true);
  ok('attack lunge: while the body is carried forward a foot on the ground slides at less than half the body speed (the legs take a step)', a.sd > 30 && a.slip < a.body * 0.5,
    `lunge ${a.sd.toFixed(0)} px at ${a.body.toFixed(0)} px/s · foot on the ground ${a.slip.toFixed(0)} px/s (${Math.round((a.slip / a.body) * 100)}% of body speed; ${a.n} of ${a.tot} ticks with a foot down, ${a.air} with both lifted) · without the step overlay ${b.slip.toFixed(0)} px/s (${Math.round((b.slip / b.body) * 100)}%, ${b.n} of ${b.tot} ticks)`); }

// ── ② 발 미끄러짐 ──
function slip(mode, speedPx, stride) {
  const ch = mkChar('kael'), clip = ch.asset.clips[mode], h = { anim: mode, gait: 0, dirX: 0, dirZ: 1, onGround: true, vx: 0, vz: speedPx, lock: null };
  const N = 96, F = ['footL', 'footR'], pos = { footL: [], footR: [] };
  for (let i = 0; i <= N; i++) {
    h.gait = (i / N) % 1; ch.anim.fadeT = 9; driveHero(ch, h, 1, TUNE); driveHero(ch, h, 1, TUNE);   // 섞임 없이 그 시각의 자세
    for (const f of F) { const W = ch.rig.boneWorld(f); pos[f].push([W[12], W[13], W[14]]); }
  }
  const cyc = stride / speedPx, dt = cyc / N, v = speedPx / UNIT; let sum = 0, n = 0, lat = 0;   // 한 주기 시간(초) · 표본 간격 · 몸 속도(m/초)
  for (const f of F) {
    const ymin = Math.min(...pos[f].map((p) => p[1]));
    for (let i = 0; i < N; i++) {
      if (pos[f][i][1] > ymin + 0.035 || pos[f][i + 1][1] > ymin + 0.035) continue;   // 땅에 닿아 있는 동안만
      sum += Math.abs((pos[f][i + 1][2] - pos[f][i][2]) / dt + v); lat += Math.abs(pos[f][i + 1][0] - pos[f][i][0]) / dt; n++;
    }
  }
  return { slip: n ? sum / n : 9, lat: n ? lat / n : 9, n, v };
}
if (process.argv.includes('--stride')) {
  for (const [mode, sp] of [['run', TUNE.runX], ['run', TUNE.runZ], ['walk', 96]]) {
    let best = null; for (let s = 40; s <= 320; s += 5) { const r = slip(mode, sp, s); if (!best || r.slip < best.slip) best = { s, ...r }; }
    console.log(`  best stride for ${mode} at ${sp} px/s: ${best.s} px (slip ${best.slip.toFixed(2)} m/s over ${best.n} contact samples)`);
  }
}
if (process.argv.includes('--stride')) for (const m of ['run', 'walk']) { const c = lib[m]; console.log(`  ${m}: distance-matched stride of the clip ${c._gwStride ? (c._gwStride * UNIT).toFixed(1) + ' px' : '(no table)'} · TUNE ${m === 'run' ? TUNE.strideRun : TUNE.strideWalk}`); }
for (const [mode, sp, stride] of [['run', TUNE.runX, TUNE.strideRun], ['run', TUNE.runZ, TUNE.strideRun], ['walk', 96, TUNE.strideWalk]]) {   // (가장 빠른 달리기 좌우 · 앞뒤 — TUNE 을 따른다)
  const r = slip(mode, sp, stride);
  ok(`${mode} at ${sp} px/s: planted foot slides less than ${mode === 'walk' ? 20 : 15}% of body speed`, r.n >= 8 && r.slip < r.v * (mode === 'walk' ? 0.2 : 0.15), `slip ${r.slip.toFixed(2)} m/s vs body ${r.v.toFixed(2)} m/s (${Math.round((r.slip / r.v) * 100)}%) · sideways ${r.lat.toFixed(2)} · contact samples ${r.n}`);
}

// ── ③ 스틱 반전 ──
for (const [name, from, to] of [['right → left', [1, 0], [-1, 0]], ['up → down', [0, 1], [0, -1]], ['right → up-left', [1, 0], [-0.7, 0.7]]]) {
  const sim = new Sim(flatArena(900, 600, []), {}), ch = mkChar('kael'), ang = [];
  for (let i = 0; i < 40; i++) { sim.update(DT, { mx: from[0], mz: from[1] }); driveHero(ch, sim.hero, DT, TUNE); }
  for (let i = 0; i < 40; i++) { sim.update(DT, { mx: to[0], mz: to[1] }); driveHero(ch, sim.hero, DT, TUNE); ang.push(Math.atan2(ch.dz, ch.dx)); }
  let flips = 0, last = 0, done = -1, maxStep = 0; const target = Math.atan2(to[1], to[0]);
  for (let i = 1; i < ang.length; i++) {
    let d = ang[i] - ang[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) > 1e-4) { if (last && Math.sign(d) !== last) flips++; last = Math.sign(d); } maxStep = Math.max(maxStep, Math.abs(d));
    let e = ang[i] - target; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; if (done < 0 && Math.abs(e) < 0.12) done = i;
  }
  ok(`reverse ${name}: turns one way only, eased, done quickly`, flips === 0 && done > 0 && done * DT <= 0.35 && maxStep < 0.3, `direction flips ${flips} · done in ${(done * DT).toFixed(2)} s · biggest step ${((maxStep * 180) / Math.PI).toFixed(0)}°/frame`);
}
// ── ③b 속도와 몸: 달리는 동안(가장 빠른 속도의 30 % 넘게) 속도 방향과 몸이 보는 방향이 35° 넘게 벌어지지 않는가 (옆 · 뒤로 미끄러지지 않는다) ──
// 몸 = 그림의 방향(ch.dx, ch.dz) — 본 게임 장면이 거는 회전 묶음(TURN_RUN 17.5 rad/초)도 같이 흉내 낸다. 속도 = 규칙의 vx, vz
function slideCase(name, stick, ticks, o = {}) {
  const sim = new Sim(flatArena(4000, 4000, []), {}), ch = mkChar('kael'), h = sim.hero; let worst = 0, worstAt = -1, back = 0, flipT = -1, flipDone = -1, minSp = 1e9, bad = 0;
  for (let i = 0; i < ticks; i++) {
    const st = stick(i), a0 = Math.atan2(ch.dz, ch.dx); sim.update(DT, { mx: st[0], mz: st[1] }); driveHero(ch, h, DT, TUNE);
    { let d = Math.atan2(ch.dz, ch.dx) - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const mx = 17.5 * DT; if (Math.abs(d) > mx) { const a = a0 + Math.sign(d) * mx; ch.dx = Math.cos(a); ch.dz = Math.sin(a); } }   // the scene's cap
    if (!finiteRig(ch)) bad++;
    if (i < (o.from ?? 30)) continue;
    const sp = Math.hypot(h.vx, h.vz), n = Math.hypot(h.vx / TUNE.runX, h.vz / TUNE.runZ);
    if (o.rev != null && i >= o.rev) { if (flipT < 0) flipT = i; minSp = Math.min(minSp, sp); const along = (h.vx * st[0] + h.vz * st[1]) / (Math.hypot(st[0], st[1]) || 1); if (flipDone < 0 && along > 0.7 * Math.hypot(st[0] * TUNE.runX, st[1] * TUNE.runZ)) flipDone = i; }
    if (n > 0.3) { const ang = Math.acos(Math.max(-1, Math.min(1, (h.vx * ch.dx + h.vz * ch.dz) / sp))) * 57.2958; if (ang > worst) { worst = ang; worstAt = i; } if (ang > 90) back++; }
  }
  const t = flipDone >= 0 ? (flipDone - flipT + 1) * DT : -1;
  ok(`${name}: velocity stays within 35° of the body while moving (never sideways / backwards)`, worst < 35 && back === 0 && bad === 0 && (o.rev == null || (t > 0 && t <= (o.maxT ?? 0.32))),
    `worst ${worst.toFixed(1)}° at tick ${worstAt} · backwards ticks ${back}` + (o.rev != null ? ` · reversal: 70% speed the new way after ${t.toFixed(2)} s · slowest ${minSp.toFixed(0)} px/s` : ''));
  return { worst, t };
}
const D8 = (k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)];
for (const [nm, a, b] of [['x axis (right → left)', 0, 4], ['z axis (in → out)', 2, 6], ['diagonal (↗ → ↙)', 1, 5], ['diagonal (↖ → ↘)', 3, 7]]) slideCase('reversal on ' + nm, (i) => D8(i < 60 ? a : b), 110, { rev: 60 });
for (const [nm, a, b] of [['right → in', 0, 2], ['in → left', 2, 4], ['left → out', 4, 6], ['out → right-in diagonal (135°)', 6, 1]]) slideCase('sharp turn ' + nm, (i) => D8(i < 60 ? a : b), 110, { rev: 60 });
slideCase('quick left-right flips every 0.13 s', (i) => D8(Math.floor(i / 8) % 2 ? 4 : 0), 240);
slideCase('quick left-right flips every 0.25 s', (i) => D8(Math.floor(i / 15) % 2 ? 4 : 0), 240);
slideCase('in-out flips every 0.2 s', (i) => D8(Math.floor(i / 12) % 2 ? 6 : 2), 240);
slideCase('circle, 3.6 rad/s', (i) => [Math.cos(i * 0.06), Math.sin(i * 0.06)], 300);
slideCase('tight circle, 9 rad/s', (i) => [Math.cos(i * 0.15), Math.sin(i * 0.15)], 300);
slideCase('stick sweep back and forth across 200°', (i) => { const a = 1.75 * Math.sin(i * 0.11); return [Math.cos(a), Math.sin(a)]; }, 300);
slideCase('walk speed reversal (half stick)', (i) => (i < 60 ? [0.38, 0] : [-0.38, 0]), 130, { rev: 60, maxT: 0.4 });
{ // 방향이 한 프레임씩 번갈아 흔들려도(±179°) 몸이 떨지 않는다
  const sim = new Sim(flatArena(900, 600, []), {}), ch = mkChar('kael'); let flips = 0, last = 0, prev = Math.atan2(ch.dz, ch.dx);
  for (let i = 0; i < 30; i++) { const s = i % 2 ? 0.02 : -0.02; sim.update(DT, { mx: -1, mz: s }); driveHero(ch, sim.hero, DT, TUNE); const a = Math.atan2(ch.dz, ch.dx); let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(d) > 0.02) { if (last && Math.sign(d) !== last) flips++; last = Math.sign(d); } prev = a; }
  ok('jittery reverse input (±1°) does not make the body wobble', flips === 0, `flips ${flips}`); }

// ── ④ 전체를 함께 돌려 NaN · 클립 이름 ──
{ // 도구 · 보스: 새 상태가 라이브러리 클립으로 돌고 NaN 이 없다 (차례대로: 모아 휘감기 → 메아리 → 부름 → 채찍 걸기 → 길게 친 종, 그 뒤 여왕이 싸우다 무릎 꿇는다)
  { let sd = 4242; Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; }; }
  const sim = new Sim(flatArena(700, 500, [{ kind: 'banshee_queen', x: 220, z: 0, active: true, phase: 2 }, { kind: 'grave_ghost', x: 140, z: 60, active: true }]), {}), hero = mkChar('kael'), chars = new Map(), usedH = new Set(), usedB = new Set(); let bad = 0, stage = 0, st0 = 0, freeAt = -1;
  sim.hookPoints.push({ id: 'r', x: -260, y: 0, z: 0, to: [-320, 0] }); sim.hero.reso = 3;
  const plan = (i) => { const hh = sim.hero, t = i - st0, next = () => { stage++; st0 = i; };
    if (stage === 0) { if (t >= 100) next(); return { attack: t === 0, attackHeld: t < 60 }; }
    if (stage === 1) { if (hh.act === 'echo') next(); return { bell: true }; }
    if (stage === 2) { if (hh.act === 'call') next(); return hh.act ? {} : { skill: true }; }
    if (stage === 3) { if (hh.act === 'hook') next(); if (hh.act) return {}; const dx = -260 - hh.x, dz = -hh.z, d = Math.hypot(dx, dz); return d > 180 ? { mx: dx / d, mz: dz / d } : { skill: true }; }
    if (stage === 4) { if (hh.act === 'ring') next(); return hh.act ? {} : { bell: true, bellHeld: true }; }
    if (stage === 5) { if (t > 90) { next(); freeAt = i; } return { bellHeld: true }; }
    return {}; };
  for (let i = 0; i < 2400 && !(freeAt > 0 && i > freeAt + 900); i++) { const boss = sim.enemies[0]; if (stage < 6) { boss.cd = 99; boss.sumCd = 99; boss.songCd = 99; } else if (i === freeAt + 1) { boss.cd = 0.3; boss.sumCd = 0.3; boss.songCd = 4; } else if (i === freeAt + 700) boss.hp = 30;
    sim.hero.hp = sim.hero.hpMax; sim.update(DT, plan(i)); if (sim.stop > 0) sim.stop = 0;
    driveHero(hero, sim.hero, DT, TUNE); if (!finiteRig(hero)) bad++; usedH.add(hero.anim.cur?.name);
    for (const e of sim.enemies) { if (e.dead) continue; let ch = chars.get(e.id); if (!ch) { ch = mkChar(e.def.model); chars.set(e.id, ch); } driveActor(ch, e, DT); if (!finiteRig(ch)) bad++; if (e.def.boss) usedB.add(ch.anim.cur?.name); } }
  Math.random = realRandom;
  const needH = ['charged', 'cast_raise', 'point', 'thrust', 'cast_big'], needB = ['float_idle', 'stun'];
  ok('tools + boss driven with no NaN; hero used ' + needH.join(' ') + '; the queen used her clips', bad === 0 && stage === 6 && needH.every((n) => usedH.has(n)) && needB.every((n) => usedB.has(n)) && [...usedB].some((n) => /scream|cast_/.test(n)), `bad ${bad} · stages done ${stage}/6 · hero: ${[...usedH].join(' ')} · queen: ${[...usedB].join(' ')}`); }
{ const kinds = ['skeleton_soldier', 'skeleton_mage', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat'];
  const sim = new Sim(flatArena(520, 360, kinds.map((kind, i) => ({ kind, x: 160 + (i % 3) * 90, z: -120 + i * 50, active: true }))), {}), hero = mkChar('kael'), chars = new Map(), used = {};
  for (const e of sim.enemies) chars.set(e.id, mkChar(e.def.model));
  let bad = 0, seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 60 * 40; i++) {
    const a = Math.floor(i / 45) * 2.399, still = Math.floor(i / 100) % 4 === 0;   // every fourth 100 frames: stand still (idle · guard)
    sim.update(DT, { mx: still ? 0 : Math.cos(a), mz: still ? 0 : Math.sin(a), attack: rnd() < 0.07, dash: rnd() < 0.02, jump: rnd() < 0.012, jumpHeld: true, guard: Math.floor(i / 100) % 4 === 0 });
    sim.hero.hp = Math.max(sim.hero.hp, 40); for (const e of sim.enemies) if (!e.dead && e.state !== 'dead') e.hp = Math.max(e.hp, 6);
    driveHero(hero, sim.hero, DT, TUNE); if (!finiteRig(hero)) bad++;
    (used.hero ||= new Set()).add(hero.anim.cur?.name);
    for (const e of sim.enemies) { const ch = chars.get(e.id); driveActor(ch, e, DT); if (!finiteRig(ch)) bad++; (used[e.kid] ||= new Set()).add(ch.anim.cur?.name); }
  }
  ok('40 s of play: hero + six kinds driven with no NaN', bad === 0, `bad frames ${bad}`);
  for (const k of ['hero', ...kinds]) console.log(`  clips used by ${k}: ${[...(used[k] ?? [])].join(' ')}`);
  const heroNeed = ['idle_combat', 'run', 'roll', 'atk1', 'atk2', 'atk3', 'launcher', 'plunge', 'jump', 'air', 'block'];
  ok('hero used library clips: ' + heroNeed.join(' '), heroNeed.every((n) => used.hero.has(n)), 'missing ' + heroNeed.filter((n) => !used.hero.has(n)).join(','));
  for (const k of [...kinds, 'banshee_queen']) {
    const D = KINDS[k], ch = mkChar(D.model), e = { def: D, kind: k, id: 0, state: 'chase', anim: 'idle', animT: 0, dirX: 1, dirZ: 0, gait: 0, stateT: 0 }; driveActor(ch, e, DT);
    const names = [...Object.values(D.clips), ...D.attacks.map((a) => a.clip)], miss = names.filter((n) => !ch.asset.clips[n]);
    ok(`${k}: every clip named in KINDS exists on the model/library`, miss.length === 0, miss.length ? 'missing ' + miss.join(',') : names.length + ' names');
  }
}
// ── ⑤ 그림에만 얹는 것: 달리기 숙임 · 도는 쪽 기울임 · 락온한 적 보기 · 박쥐 숙임 ──
{ const lean = (fix) => { const T = { ...TUNE, runLeanFix: fix }, sim = new Sim(flatArena(3000, 3000, []), {}), ch = mkChar('kael'); let s = 0, n = 0;
    for (let i = 0; i < 150; i++) { sim.update(DT, { mx: 1, mz: 0 }); driveHero(ch, sim.hero, DT, T); if (i > 80) { const hd = ch.rig.boneWorld('head'), hp = ch.rig.boneWorld('hips'); s += (Math.atan2(hd[14] - hp[14], hd[13] - hp[13]) * 180) / Math.PI; n++; } } return s / n; };
  const raw = lean(0), fixed = lean(TUNE.runLeanFix);
  ok('run: torso is raised so the face shows from the raised camera (lean reduced by 5–12°)', raw - fixed > 5 && raw - fixed < 13 && fixed > 8, `clip lean ${raw.toFixed(1)}° → ${fixed.toFixed(1)}°`); }
{ const side = (sgn) => { const sim = new Sim(flatArena(3000, 3000, []), {}), ch = mkChar('kael'); let s = 0, n = 0;
    for (let i = 0; i < 240; i++) { const a = sgn * i * 0.06; sim.update(DT, { mx: Math.cos(a), mz: Math.sin(a) }); driveHero(ch, sim.hero, DT, TUNE); if (i > 120) { s += ch.rig.boneWorld('head')[12] - ch.rig.boneWorld('hips')[12]; n++; } } return s / n; };
  const L = side(1), R0 = side(-1), M = side(0);
  ok('run: banks into the turn (head shifts to the inside of the circle, both ways)', L > M + 0.012 && R0 < M - 0.012, `left turn ${L.toFixed(3)} m · straight ${M.toFixed(3)} · right turn ${R0.toFixed(3)} (model +X = left)`); }
{ const headFwd = (spawn) => { const sim = new Sim(flatArena(900, 900, [spawn]), {}), ch = mkChar('kael'); sim.enemies[0].def = { ...sim.enemies[0].def, attacks: [], speed: 0 };
    for (let i = 0; i < 90; i++) { sim.update(DT, {}); sim.enemies[0].x = spawn.x; sim.enemies[0].z = spawn.z; driveHero(ch, sim.hero, DT, TUNE); } return Array.from(ch.rig.boneWorld('head')); };
  const rel = (a, b) => { const col = (W, i) => { const v = [W[i * 4], W[i * 4 + 1], W[i * 4 + 2]], l = Math.hypot(...v); return v.map((x) => x / l); }, A = [col(a, 0), col(a, 1), col(a, 2)], B = [col(b, 0), col(b, 1), col(b, 2)], loc = A.map((c) => c[2]); return [0, 1, 2].map((k) => B[0][k] * loc[0] + B[1][k] * loc[1] + B[2][k] * loc[2]); };
  const base = headFwd({ kind: 'melee', x: 200, z: 0, active: true }), fl = rel(base, headFwd({ kind: 'melee', x: 120, z: 160, active: true })), fr = rel(base, headFwd({ kind: 'melee', x: 120, z: -160, active: true })), fb = rel(base, headFwd({ kind: 'melee', x: -200, z: 10, active: true }));
  const yaw = (f) => (Math.atan2(f[0], f[2]) * 180) / Math.PI;
  ok('lock-on: the head turns to look at the locked enemy (left / right), level, and not at one behind', yaw(fl) > 30 && yaw(fr) < -30 && Math.abs(fl[1]) < 0.08 && Math.abs(fr[1]) < 0.08 && Math.abs(yaw(fb)) < 3, `left ${yaw(fl).toFixed(0)}° · right ${yaw(fr).toFixed(0)}° · behind ${yaw(fb).toFixed(0)}° · tilt ${fl[1].toFixed(2)} / ${fr[1].toFixed(2)}`); }
{ const sim = new Sim(flatArena(3000, 3000, []), {}), ch = mkChar('kael'), seen = [];
  for (let i = 0; i < 60; i++) { sim.update(DT, { mx: 1, mz: 0 }); driveHero(ch, sim.hero, DT, TUNE); }
  for (let i = 0; i < 40; i++) { sim.update(DT, {}); driveHero(ch, sim.hero, DT, TUNE); seen.push(ch.anim.cur?.name); }
  const n = seen.filter((c) => c === 'run_stop').length;
  for (let i = 0; i < 20; i++) { sim.update(DT, { mx: 0.4, mz: 0 }); driveHero(ch, sim.hero, DT, TUNE); } let slow = 0; for (let i = 0; i < 30; i++) { sim.update(DT, {}); driveHero(ch, sim.hero, DT, TUNE); if (ch.anim.cur?.name === 'run_stop') slow++; }
  ok('letting go of the stick at run speed: brakes with the skid clip (about 0.3 s), then stands; not after a walk', seen[0] === 'run_stop' && n >= 14 && n <= 20 && /^idle/.test(seen[seen.length - 1]) && slow === 0 && finiteRig(ch), `run_stop for ${n} ticks, then ${seen[seen.length - 1]} · after a walk ${slow}`); }
{ // 돌아서며 버티는 자세: 미끄러지는 클립(run_stop)만으로도 뒤로 젖어 있다 — 달리기의 "세우기"가 겹치지 않고, 윗몸을 조금 앞으로 당긴다 (TUNE.pivotLean)
  const brace = (pl) => { const T = { ...TUNE, pivotLean: pl }, sim = new Sim(flatArena(3000, 3000, []), {}), ch = mkChar('kael'); let worst = 0, n = 0;
    for (let i = 0; i < 60; i++) { sim.update(DT, { mx: 1, mz: 0 }); driveHero(ch, sim.hero, DT, T); }
    for (let i = 0; i < 20; i++) { sim.update(DT, { mx: -1, mz: 0 }); driveHero(ch, sim.hero, DT, T); if (ch.anim.cur?.name === 'run_stop') { const hd = ch.rig.boneWorld('head'), hp = ch.rig.boneWorld('hips'); worst = Math.min(worst, (Math.atan2(hd[14] - hp[14], hd[13] - hp[13]) * 180) / Math.PI); n++; } }
    return [worst, n, finiteRig(ch)]; };
  const [now, n, fin] = brace(TUNE.pivotLean), [clipOnly] = brace(0);
  ok('reversal brace: the torso is pulled forward from the skid clip (leans back less than the clip alone, and less than 20°)', n >= 2 && fin && now > clipOnly + 3 && now > -20 && now < 2, `brace ticks ${n} · hips→head line ${now.toFixed(1)}° (clip alone ${clipOnly.toFixed(1)}°; − = back)`); }
{ const D = KINDS.bat, ch = mkChar(D.model), e = { def: D, kind: 'bat', id: 0, state: 'chase', anim: 'walk', animT: 0, dirX: 1, dirZ: 0, gait: 0, stateT: 0, moved: 100, alpha: 1 };
  for (let i = 0; i < 60; i++) driveActor(ch, e, DT);
  const W = ch.rig.boneWorld('hips'), up = [W[4], W[5], W[6]], l = Math.hypot(...up), tilt = (Math.atan2(up[2] / l, up[1] / l) * 180) / Math.PI;
  ok('bat: body is pitched forward by the pose itself (the scene can place it with a plain ch.place)', Math.abs(tilt - D.pitch) < 12, `tilt ${tilt.toFixed(0)}° (KINDS.bat.pitch ${D.pitch})`); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
