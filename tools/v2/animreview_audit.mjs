// v2 animreview: 공용 클립 라이브러리의 독립 검수 (그리지 않고 숫자로). docs/v2/ANIM_LIBRARY.md §11 검수
//   node tools/v2/animreview_audit.mjs [모델.glb …] [--json=out.json] [--all]
// animlib_check.mjs 가 보지 않는 것을 본다 (만든 쪽의 측정 방법을 다시 쓰지 않고 60fps 로 따로 잰다):
//   ① 순환 이음의 "속도" 튐 (자세가 같아도 속도가 꺾이면 톡 튄다) · 끝을 억지로 맞춘 구간의 급가속
//   ② 제자리인가: 골반 수평 위치의 처음 ↔ 끝 차이, 가장 멀리 벗어난 거리
//   ③ 발 미끄러짐: 디딘 발의 수평 속도. 제자리 순환은 "이 클립이 뜻하는 이동 속도"(m/s)를 내고, 한 번짜리는 travel/moveT 로 움직여 줬을 때 디딘 발이 미끄러진 거리
//   ④ 이벤트: hit 이 무기 끝 속도 봉우리에 있는가 · 그때 무기 끝이 몸 앞에 있는가 / 발 이벤트가 실제 디딤과 맞는가 · 빠진 디딤
//   ⑤ 관절: 손목 꺾임 · 손목 비틀림 · 팔꿈치 비틀림의 최대각, 뼈 각속도의 튐(뒤집힘)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGLB } from './char3d_glbio.mjs';
import { buildModel } from '../../src/v2/char3d/glb.js';
import { Rig, CPose, sampleClip, applyPose } from '../../src/v2/char3d/skel.js';
import { clipsFromGroup } from './animlib_load.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(root, 'assets/v2/char3d/clips');
const args = process.argv.slice(2), models = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), '1'] : [a.slice(2, i), a.slice(i + 1)]; }));
if (!models.length) models.push(path.join(root, 'assets/v2/char3d/kael.glb'), path.join(root, 'assets/v2/char3d/skeleton_soldier.glb'));
const index = JSON.parse(fs.readFileSync(path.join(DIR, opt.index ?? 'index.json'), 'utf8'));
const clips = {};
for (const g of index.groups) Object.assign(clips, clipsFromGroup(buildModel(readGLB(path.join(DIR, g.file))), index));
const FPS = 60, JN = ['hips', 'head', 'handL', 'handR', 'forearmL', 'forearmR', 'armL', 'armR', 'footL', 'footR', 'toeL', 'toeR'], QN = ['armL', 'armR', 'forearmL', 'forearmR', 'handL', 'handR', 'spine2', 'uplegL', 'uplegR', 'legL', 'legR', 'footL', 'footR', 'head', 'neck', 'hips'];
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const qang = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180) / Math.PI;
const qmulc = (a, b) => [-a[0] * b[3] + a[3] * b[0] - a[1] * b[2] + a[2] * b[1], -a[1] * b[3] + a[3] * b[1] - a[2] * b[0] + a[0] * b[2], -a[2] * b[3] + a[3] * b[2] - a[0] * b[1] + a[1] * b[0], a[3] * b[3] + a[0] * b[0] + a[1] * b[1] + a[2] * b[2]];   // conj(a) * b
const pct = (arr, p) => { const s = Array.from(arr).sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };

const all = [];
for (const mp of models) {
  const rig = new Rig(buildModel(readGLB(mp))), name = path.basename(mp), P = new CPose();
  const rest = {}; for (const j of JN) { const w = rig.key.get(j) * 16; rest[j] = [rig.world[w + 12], rig.world[w + 13], rig.world[w + 14]]; }
  const axis = (a, b) => { const d = [rest[b][0] - rest[a][0], rest[b][1] - rest[a][1], rest[b][2] - rest[a][2]], l = Math.hypot(...d) || 1; return d.map((x) => x / l); };
  const AX = { foreL: axis('forearmL', 'handL'), foreR: axis('forearmR', 'handR'), armL: axis('armL', 'forearmL'), armR: axis('armR', 'forearmR') };
  const out = { name, clips: {} };
  for (const m of index.clips) {
    const c = clips[m.n]; if (!c) { out.clips[m.n] = { missing: true }; continue; }
    const n = Math.max(3, Math.round(c.duration * FPS) + 1), dt = c.duration / (n - 1), cc = { ...c, loop: false };
    const pos = {}, Q = {}; for (const j of JN) pos[j] = new Float64Array(n * 3); for (const j of QN) Q[j] = new Float64Array(n * 4);
    let nan = false;
    for (let k = 0; k < n; k++) {
      applyPose(rig, sampleClip(cc, Math.min(c.duration, k * dt), P));
      for (const j of JN) { const w = rig.key.get(j) * 16; for (let a = 0; a < 3; a++) { const v = rig.world[w + 12 + a]; if (!Number.isFinite(v)) nan = true; pos[j][k * 3 + a] = v; } }
      for (const j of QN) { const q = P.rot.get(j); if (q && q.set) Q[j].set(q, k * 4); else Q[j][k * 4 + 3] = 1; }
    }
    const R = { g: m.g, loop: m.loop, dur: m.dur, nan, flags: [] };
    const V = (j, k) => [(pos[j][k * 3] - pos[j][k * 3 - 3]) / dt, (pos[j][k * 3 + 1] - pos[j][k * 3 - 2]) / dt, (pos[j][k * 3 + 2] - pos[j][k * 3 - 1]) / dt];
    // ① 순환 이음
    if (m.loop) {
      let dp = 0, worst = 0, wj = '';
      for (const j of ['hips', 'head', 'handL', 'handR', 'footL', 'footR']) {
        dp = Math.max(dp, Math.hypot(pos[j][0] - pos[j][(n - 1) * 3], pos[j][1] - pos[j][(n - 1) * 3 + 1], pos[j][2] - pos[j][(n - 1) * 3 + 2]));
        const acc = []; for (let k = 2; k < n; k++) { const a = V(j, k), b = V(j, k - 1); acc.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); }
        const ve = V(j, n - 1), vs = V(j, 1), seam = Math.hypot(ve[0] - vs[0], ve[1] - vs[1], ve[2] - vs[2]), ref = Math.max(0.05, pct(acc, 0.95));
        // 끝을 맞춘 구간(마지막 0.2초)의 가속이 다른 곳보다 얼마나 큰가
        const tailN = Math.round(0.2 / dt), tail = Math.max(...acc.slice(-tailN)), body = Math.max(0.05, pct(acc.slice(0, -tailN), 0.95));
        const ratio = Math.max(seam / ref, tail / body);
        if (ratio > worst) { worst = ratio; wj = `${j} 이음 속도차 ${r2(seam)} m/s (평소 ${r2(ref)}) · 끝 0.2초 가속 ${r2(tail)} (평소 ${r2(body)})`; }
        R.seamVel = Math.max(R.seamVel ?? 0, seam);
      }
      R.seamPos = r3(dp); R.seamRatio = r2(worst); R.seamVel = r2(R.seamVel);
      if (dp > 0.01) R.flags.push(`순환 이음에서 자세가 ${r3(dp)} m 어긋남`);
      if (worst > 3 && R.seamVel > 0.5) R.flags.push(`순환 이음이 튈 수 있음: ${wj}`);
    }
    // ② 제자리
    { let mx = 0; const h = pos.hips; for (let k = 0; k < n; k++) mx = Math.max(mx, Math.hypot(h[k * 3] - h[0], h[k * 3 + 2] - h[2])); const end = Math.hypot(h[(n - 1) * 3] - h[0], h[(n - 1) * 3 + 2] - h[2]);
      R.hipEnd = r2(end); R.hipMax = r2(mx);
      if (end > 0.12) R.flags.push(`골반이 끝에서 ${r2(end)} m 옮겨져 있음 (다음 클립으로 넘어갈 때 미끄러짐)`); }
    // ③ 발
    const foot = {};
    for (const s of ['L', 'R']) {
      const h = new Float64Array(n); let mn = 1e9, mxh = -1e9; for (let k = 0; k < n; k++) { h[k] = Math.min(pos['foot' + s][k * 3 + 1] - rest['foot' + s][1], pos['toe' + s][k * 3 + 1] - rest['toe' + s][1]); mn = Math.min(mn, h[k]); mxh = Math.max(mxh, h[k]); }
      const planted = new Uint8Array(n); for (let k = 0; k < n; k++) planted[k] = h[k] < Math.max(0.03, mn + 0.03) && h[k] < 0.06 ? 1 : 0;
      const contacts = []; let up = h[0] > mn + 0.05; for (let k = 1; k < n; k++) { if (up && h[k] < mn + 0.025) { up = false; contacts.push(r2(k * dt)); } else if (!up && h[k] > mn + 0.05) up = true; }
      foot[s] = { h, mn, range: mxh - mn, planted, contacts };
    }
    const tr = m.travel ?? [0, 0], mt = m.moveT ?? [0, m.dur], gv = (t) => (m.loop ? [tr[0] / m.dur, tr[1] / m.dur] : t >= mt[0] && t <= mt[1] ? [tr[0] / Math.max(0.01, mt[1] - mt[0]), tr[1] / Math.max(0.01, mt[1] - mt[0])] : [0, 0]);
    { let slide = 0, slide0 = 0, sz = 0, cnt = 0; const vz = [];
      for (const s of ['L', 'R']) { let a = 0, b = 0; for (let k = 1; k < n; k++) if (foot[s].planted[k] && foot[s].planted[k - 1]) { const v = V('foot' + s, k), g = gv(k * dt); a += Math.hypot(v[0] + g[0], v[2] + g[1]) * dt; b += Math.hypot(v[0], v[2]) * dt; vz.push(v[2]); sz += v[2]; cnt++; } slide = Math.max(slide, a); slide0 = Math.max(slide0, b); }
      R.slide = r2(slide); R.slideNoMove = r2(slide0);
      if (m.loop && cnt > 4 && Math.max(foot.L.range, foot.R.range) > 0.04) { const mean = sz / cnt, sd = Math.sqrt(vz.reduce((q, v) => q + (v - mean) ** 2, 0) / cnt); R.impliedSpeed = r2(-mean); R.plantSd = r2(sd); if (m.travel) R.travelSpeed = r2(Math.hypot(tr[0], tr[1]) / m.dur); } }
    // ④ 이벤트
    { const tip = (s, k) => { const h = pos['hand' + s], f = pos['forearm' + s], d = [h[k * 3] - f[k * 3], h[k * 3 + 1] - f[k * 3 + 1], h[k * 3 + 2] - f[k * 3 + 2]], l = Math.hypot(...d) || 1; return [h[k * 3] + (d[0] / l) * 0.55, h[k * 3 + 1] + (d[1] / l) * 0.55, h[k * 3 + 2] + (d[2] / l) * 0.55]; };
      const sp = new Float64Array(n), spH = new Float64Array(n);
      for (let k = 1; k < n; k++) { const a = tip('R', k), b = tip('R', k - 1), a2 = tip('L', k), b2 = tip('L', k - 1); const vR = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / dt, vL = Math.hypot(a2[0] - b2[0], a2[1] - b2[1], a2[2] - b2[2]) / dt; sp[k] = m.g === 'magic' || /heavy|ground_slam|scream/.test(m.n) ? Math.max(vR, vL) : vR; const hv = V('handR', k); spH[k] = Math.hypot(...hv); }
      const sm = new Float64Array(n); for (let k = 0; k < n; k++) { let s = 0, c2 = 0; for (let i = -2; i <= 2; i++) if (k + i >= 0 && k + i < n) { s += sp[k + i]; c2++; } sm[k] = s / c2; }
      const mx = Math.max(...sm), pk = []; for (let k = 2; k < n - 2; k++) if (sm[k] > mx * 0.45 && sm[k] >= sm[k - 1] && sm[k] >= sm[k + 1] && sm[k] >= sm[k - 2] && sm[k] >= sm[k + 2]) pk.push(k);
      R.tipPeaks = pk.map((k) => [r2(k * dt), r2(sm[k])]); R.tipMax = r2(mx);
      const ev = [];
      for (const e of m.ev) {
        const k = Math.max(0, Math.min(n - 1, Math.round(e[0] / dt)));
        if (e[1] === 'hit' || e[1] === 'release') { let best = 1e9, bk = -1; for (const p of pk) if (Math.abs(p - k) < best) { best = Math.abs(p - k); bk = p; }
          const t = tip('R', k), hz = pos.hips[k * 3 + 2], o = { ev: e[1], t: e[0], peakAt: bk >= 0 ? r2(bk * dt) : null, off: bk >= 0 ? r2((k - bk) * dt) : null, vAt: r2(sm[k]), tipFwd: r2(t[2] - hz), tipY: r2(t[1]), tipSide: r2(t[0] - pos.hips[k * 3]) };
          ev.push(o);
          if (e[1] === 'hit') { if (o.off == null || Math.abs(o.off) > 0.07) R.flags.push(`hit@${e[0]} 가 무기 끝 속도 봉우리(${o.peakAt})에서 ${o.off}초 벗어남`); if (o.tipFwd < -0.15) R.flags.push(`hit@${e[0]} 때 무기 끝이 몸 뒤쪽(${o.tipFwd} m)`); }
        } else if (/^foot[LR]$/.test(e[1])) { const s = e[1].slice(-1), f = foot[s]; let best = 1e9; for (const ct of f.contacts) best = Math.min(best, Math.abs(ct - e[0])); if (m.loop) for (const ct of f.contacts) best = Math.min(best, Math.abs(ct - e[0] - m.dur), Math.abs(ct - e[0] + m.dur));
          const o = { ev: e[1], t: e[0], h: r3(f.h[k] - f.mn), off: best < 1e8 ? r2(best) : null }; ev.push(o);
          if (o.h > 0.06) R.flags.push(`${e[1]}@${e[0]} 때 발이 바닥에서 ${r2(o.h)} m 떠 있음`); }
      }
      R.ev = ev;
      // 빠진 디딤 (걷는 · 뛰는 클립만)
      if (/walk|run|sprint|shamble|limp|push|carry|backstep|run_stop/.test(m.n)) for (const s of ['L', 'R']) for (const ct of foot[s].contacts) { if (foot[s].range < 0.05) continue; const hit = m.ev.some((e) => e[1] === 'foot' + s && (Math.abs(e[0] - ct) < 0.12 || (m.loop && Math.abs(Math.abs(e[0] - ct) - m.dur) < 0.12))); if (!hit) R.flags.push(`발 디딤 foot${s}@${ct} 에 이벤트가 없음`); }
      R.contacts = { L: foot.L.contacts, R: foot.R.contacts };
    }
    // ⑤ 관절
    { let wb = 0, wt = 0, et = 0, kb = 0, av = 0, avj = '';
      for (let k = 0; k < n; k++) for (const s of ['L', 'R']) {
        const qa = Q['arm' + s].subarray(k * 4, k * 4 + 4), qf = Q['forearm' + s].subarray(k * 4, k * 4 + 4), qh = Q['hand' + s].subarray(k * 4, k * 4 + 4);
        wb = Math.max(wb, qang(qf, qh));
        const dh = qmulc(qf, qh), ax = AX['fore' + s]; wt = Math.max(wt, Math.abs((2 * Math.atan2(dh[0] * ax[0] + dh[1] * ax[1] + dh[2] * ax[2], dh[3]) * 180) / Math.PI) % 360);
        const df = qmulc(qa, qf); let tw = Math.abs((2 * Math.atan2(df[0] * ax[0] + df[1] * ax[1] + df[2] * ax[2], df[3]) * 180) / Math.PI); if (tw > 180) tw = 360 - tw; et = Math.max(et, tw);
        kb = Math.max(kb, qang(Q['upleg' + s].subarray(k * 4, k * 4 + 4), Q['leg' + s].subarray(k * 4, k * 4 + 4)));
      }
      for (const j of QN) for (let k = 1; k < n; k++) { const w = qang(Q[j].subarray(k * 4, k * 4 + 4), Q[j].subarray(k * 4 - 4, k * 4)) / dt; if (w > av) { av = w; avj = `${j}@${r2(k * dt)}`; } }
      if (wt > 180) wt = 360 - wt;
      R.wristBend = Math.round(wb); R.wristTwist = Math.round(wt); R.elbowTwist = Math.round(et); R.knee = Math.round(kb); R.maxAngVel = Math.round(av); R.maxAngVelAt = avj;
      if (wb > 100) R.flags.push(`손목이 ${Math.round(wb)}° 꺾임`);
      if (et > 110) R.flags.push(`팔꿈치(아래팔) 비틀림 ${Math.round(et)}°`);
      if (av > 3000) R.flags.push(`뼈가 한 프레임에 튐: ${avj} ${Math.round(av)}°/s`);
    }
    if (nan) R.flags.push('NaN');
    out.clips[m.n] = R;
  }
  all.push(out);
}
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify(all, (k, v) => (v instanceof Float64Array || v instanceof Uint8Array ? undefined : v), 1));
for (const o of all) {
  console.log(`\n=== ${o.name} ===`);
  let nf = 0;
  for (const [n, R] of Object.entries(o.clips)) {
    if (R.missing) { console.log(`${n}: 없음`); nf++; continue; }
    const line = `${n.padEnd(17)} ${R.loop ? 'L' : ' '} hipEnd ${String(R.hipEnd).padStart(4)} hipMax ${String(R.hipMax).padStart(4)} slide ${String(R.slide).padStart(4)}(${String(R.slideNoMove).padStart(4)})${R.impliedSpeed != null ? ` v=${R.impliedSpeed}±${R.plantSd}${R.travelSpeed != null ? '/tr ' + R.travelSpeed : ''}` : ''}${R.loop ? ` seam ${R.seamPos}/${R.seamVel}m/s x${R.seamRatio}` : ''} wrist ${R.wristBend}/${R.wristTwist} elbTw ${R.elbowTwist} w ${R.maxAngVel}`;
    if (opt.all || R.flags.length) console.log(line);
    for (const f of R.flags) { console.log(`    ! ${f}`); nf++; }
    if (opt.all && R.ev?.length) console.log('    ev ' + R.ev.map((e) => (e.ev === 'hit' || e.ev === 'release' ? `${e.ev}@${e.t}(peak ${e.peakAt} off ${e.off} v ${e.vAt} fwd ${e.tipFwd} y ${e.tipY})` : `${e.ev}@${e.t}(h ${e.h} off ${e.off})`)).join(' '));
  }
  console.log(`-- ${o.name}: 표시 ${nf}건`);
}
