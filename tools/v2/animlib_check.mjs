// v2 animlib: 라이브러리 검사 (그리지 않고 숫자로). docs/v2/ANIM_LIBRARY.md §6
//   node tools/v2/animlib_check.mjs [모델.glb …]      (기본: assets/v2/char3d/kael.glb, tools/v2/char3d_samples/skeleton.glb)
// 보는 것: ① 묶음 GLB 가 런타임 그대로 읽히는가 (glb.js → skel.js clipFromAnim), index 와 개수 · 길이가 맞는가, 전체 크기 ≤ 1.2 MB
//          ② 순환 클립의 처음과 끝이 이어지는가  ③ 이벤트 시각이 클립 안에 있는가
//          ④ 모델마다 모든 클립을 30fps 로 틀어: NaN 없음 · 발/손/머리가 바닥 아래로 꺼지지 않음 · 걷는 순환에서 발이 뜨지 않음
//          ⑤ 모델 사이 비교: 골반 높이로 나눈 관절 위치가 첫 모델과 얼마나 다른가 (체형 차이를 넘는 어긋남 = 리타깃이 깨진 것)
// 끝에 한 줄 요약. 문제가 있으면 종료 코드 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, CPose, sampleClip, applyPose } from '../../src/v2/char3d/skel.js';
import { buildClips } from '../../src/v2/char3d/clips.js';
import { clipsFromGroup } from './animlib_load.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(root, 'assets/v2/char3d/clips');
const models = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!models.length) models.push(path.join(root, 'assets/v2/char3d/kael.glb'), path.join(root, 'tools/v2/char3d_samples/skeleton.glb'));
const json = process.argv.find((a) => a.startsWith('--json='))?.slice(7);
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const problems = [], notes = [];
let total = fs.statSync(path.join(DIR, 'index.json')).size;
const clips = {};
for (const g of index.groups) {
  const f = path.join(DIR, g.file); total += fs.statSync(f).size;
  const model = buildModel(readGLB(f));
  if (model.anims.length !== g.clips) problems.push(`${g.file}: 애니메이션 ${model.anims.length}개 ≠ index ${g.clips}개`);
  Object.assign(clips, clipsFromGroup(model, index));
  const old = buildClips(new Rig(model), model.anims);   // 뷰어의 ?clips= 가 하는 일 그대로 — 오류 없이 지나가야 한다
  notes.push(`${g.file} ${(fs.statSync(f).size / 1024).toFixed(0)} KB · 옛 뷰어(?clips=)가 고르는 것: ${['run', 'atk1', 'death'].filter((k) => old[k]?.source === 'library').join(', ') || '없음'}`);
}
if (total > 1.2 * 1024 * 1024) problems.push(`전체 ${(total / 1024).toFixed(0)} KB > 1.2 MB`);
for (const m of index.clips) {
  const c = clips[m.n]; if (!c) { problems.push(`${m.n}: 묶음 GLB 에 없음`); continue; }
  if (Math.abs(c.duration - m.dur) > 0.02) problems.push(`${m.n}: 길이 ${c.duration.toFixed(3)} ≠ index ${m.dur}`);
  for (const e of m.ev) if (e[0] < 0 || e[0] > m.dur + 0.001) problems.push(`${m.n}: 이벤트 ${e[1]}@${e[0]} 가 클립 밖`);
  if (m.loop) { const A = new CPose(), B = new CPose(); sampleClip({ ...c, loop: false }, 0, A); sampleClip({ ...c, loop: false }, c.duration, B); let d = 0; for (const [k, q] of A.rot) { const p = B.rot.get(k); if (q.set && p?.set) d = Math.max(d, 1 - Math.abs(q[0] * p[0] + q[1] * p[1] + q[2] * p[2] + q[3] * p[3])); } if (d > 1e-4) problems.push(`${m.n}: 순환 이음 어긋남 ${d.toExponential(1)}`); }
}
const JOINTS = ['head', 'handL', 'handR', 'footL', 'footR', 'hips', 'toeL', 'toeR'];
const per = [];
for (const mp of models) {
  const rig = new Rig(buildModel(readGLB(mp))), P = new CPose(), hip = rig.restHipY, name = path.basename(mp);
  const rest = {}; for (const j of JOINTS) rest[j] = rig.world[rig.key.get(j) * 16 + 13];
  const out = { name, hip, clips: {} };
  for (const m of index.clips) {
    const c = clips[m.n]; if (!c) continue;
    const n = Math.max(2, Math.round(c.duration * 30) + 1), pos = new Float32Array(n * JOINTS.length * 3); let nan = false, sinkF = 0, sinkH = 0, minFoot = 1e9;
    for (let k = 0; k < n; k++) {
      applyPose(rig, sampleClip(c, (k / (n - 1)) * c.duration * 0.9999, P));
      for (let i = 0; i < rig.jm.length; i++) if (!Number.isFinite(rig.jm[i])) nan = true;
      JOINTS.forEach((j, ji) => { const w = rig.key.get(j) * 16; for (let a = 0; a < 3; a++) pos[(k * JOINTS.length + ji) * 3 + a] = rig.world[w + 12 + a] / hip; });
      const fy = Math.min(rig.world[rig.key.get('footL') * 16 + 13] - rest.footL, rig.world[rig.key.get('footR') * 16 + 13] - rest.footR, rig.world[rig.key.get('toeL') * 16 + 13] - rest.toeL, rig.world[rig.key.get('toeR') * 16 + 13] - rest.toeR);
      minFoot = Math.min(minFoot, fy);   // 쉬는 자세보다 얼마나 떠 있나 (걷는 순환용)
      sinkF = Math.max(sinkF, -(Math.min(rig.world[rig.key.get('footL') * 16 + 13], rig.world[rig.key.get('footR') * 16 + 13], rig.world[rig.key.get('toeL') * 16 + 13] + 0.03, rig.world[rig.key.get('toeR') * 16 + 13] + 0.03) - rig.minY));   // 발목 · 발끝 뼈가 바닥(메시의 가장 낮은 곳) 아래로
      sinkH = Math.max(sinkH, -Math.min(rig.world[rig.key.get('handL') * 16 + 13], rig.world[rig.key.get('handR') * 16 + 13], rig.world[rig.key.get('head') * 16 + 13] - 0.08));
    }
    out.clips[m.n] = { pos, n, nan, sinkF: sinkF / hip, sinkH: sinkH / hip, minFoot: minFoot / hip };
    if (nan) problems.push(`${name} · ${m.n}: NaN`);
  }
  per.push(out);
}
const rows = [];
for (const m of index.clips) {
  const a = per[0].clips[m.n]; if (!a) continue;
  const r = { n: m.n, g: m.g, sinkF: per.map((p) => +p.clips[m.n].sinkF.toFixed(3)), sinkH: per.map((p) => +p.clips[m.n].sinkH.toFixed(3)), float: per.map((p) => +p.clips[m.n].minFoot.toFixed(3)), dev: [] };
  for (let i = 1; i < per.length; i++) { const b = per[i].clips[m.n]; let d = 0, sum = 0; for (let k = 0; k < a.pos.length; k += 3) { const e = Math.hypot(a.pos[k] - b.pos[k], a.pos[k + 1] - b.pos[k + 1], a.pos[k + 2] - b.pos[k + 2]); d = Math.max(d, e); sum += e; } r.dev.push([+d.toFixed(3), +(sum / (a.pos.length / 3)).toFixed(3)]); }
  rows.push(r);
}
// 문턱 (골반 높이 단위): 발목 · 발끝 뼈가 바닥 아래 0.03 / 손·머리가 바닥 아래 0.08 / 걷는 순환에서 발이 0.06 넘게 뜸 / 모델 사이 관절 위치 차이 최대 0.45
const flag = [];
for (const r of rows) {
  const m = index.clips.find((c) => c.n === r.n), f = [];
  r.sinkF.forEach((v, i) => { if (v > 0.03) f.push(`${per[i].name}: 발 뼈가 바닥 아래로 ${(v * per[i].hip * 100).toFixed(0)} cm`); });
  r.sinkH.forEach((v, i) => { if (v > 0.08) f.push(`${per[i].name}: 손/머리가 바닥 아래로 ${(v * per[i].hip * 100).toFixed(0)} cm`); });
  if (m.loop && /walk|run|sprint|shamble|limp|push|carry/.test(m.n)) r.float.forEach((v, i) => { if (v > 0.06) f.push(`${per[i].name}: 발이 ${(v * per[i].hip * 100).toFixed(0)} cm 떠 있음`); });
  r.dev.forEach((d, i) => { if (d[0] > 0.45) f.push(`${per[i + 1].name}: ${per[0].name} 와 관절 위치 차이 최대 ${d[0]} (골반 높이 단위)`); });
  if (f.length) flag.push({ n: r.n, f });
}
for (const s of notes) console.log(s);
console.log(`클립 ${index.clips.length}개 · 전체 ${(total / 1024).toFixed(0)} KB (${total} B) · 모델 ${per.map((p) => `${p.name}(골반 ${p.hip.toFixed(2)} m)`).join(', ')}`);
if (per.length > 1) { const worst = rows.slice().sort((a, b) => b.dev[0][0] - a.dev[0][0]).slice(0, 6); console.log('모델 사이 차이가 큰 순: ' + worst.map((r) => `${r.n} ${r.dev[0][0]}(평균 ${r.dev[0][1]})`).join(' · ')); const avg = rows.reduce((s, r) => s + r.dev[0][1], 0) / rows.length; console.log(`평균 차이 ${avg.toFixed(3)} (골반 높이 단위) — 체형이 달라서 생기는 값`); }
for (const x of flag) console.log(`살펴볼 것  ${x.n}: ${x.f.join(' / ')}`);
for (const p of problems) console.log('문제  ' + p);
if (json) fs.writeFileSync(json, JSON.stringify({ total, rows, flag, problems, notes }, null, 1));
console.log(problems.length ? `실패: 문제 ${problems.length}건` : `통과: 문제 0건 · 살펴볼 것 ${flag.length}건`);
process.exit(problems.length ? 1 : 0);
