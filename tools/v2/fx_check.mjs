// v2 fx — 자동 검사 + 숫자 + 캡처. docs/v2/FX.md §8
//   node tools/v2/fx_check.mjs              검사 (fold_open · phone2: 부팅, 모든 프리셋, 오류 0) + 프리셋별 비용 + 난전 예산 + 할당 검사
//   node tools/v2/fx_check.mjs --sheets     + 접촉 시트 (계열마다 한 장; 효과마다 세 순간)   → /tmp/claude-0/v2/fxcore/sheet_*.jpg
//   node tools/v2/fx_check.mjs --video      + 시범 두 개(콤보 · 마법 순회) 영상              → /tmp/claude-0/v2/fxcore/fx_demos.mp4
//   node tools/v2/fx_check.mjs --quick      부팅·프리셋 검사만
//   node tools/v2/fx_check.mjs --doc        + docs/v2/FX.md 의 숫자 칸을 이번 측정으로 바꿔 쓴다
// 헤드리스 Chromium 은 소프트웨어 렌더러(SwiftShader)다 → 프레임 시간은 기기 값이 아니다. 개수(그리기 호출·입자·삼각형·바이트)와
// JS 쪽 CPU 시간(효과 엔진의 update+draw)만 옮겨 읽는다.
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const OUT = '/tmp/claude-0/v2/fxcore', TMP = '/dev/shm/fxcore';
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const port = 8900 + (process.pid % 90);
const srv = await start(port);
const launch = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const fails = [], report = { date: new Date().toISOString(), views: {}, cost: {}, heavy: {}, alloc: {} };
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

async function open(preset, query = '') {
  const browser = await launch();   // 화면마다 새 브라우저 (같은 브라우저에서 두 번째 WebGL 페이지가 멈추는 일이 있었다)
  const ctx = { close: () => browser.close() };
  const page = await (await browser.newContext({ ...contextOptions(preset), deviceScaleFactor: 1 })).newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('console: ' + m.text()); });
  const url = `http://localhost:${port}/tools/v2/fx_view.html?ui=0${query}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }));
  await page.waitForFunction(() => window.__fx && window.__fx.ready && window.__fx.texReady, null, { timeout: 60000 }).catch(() => errs.push('부팅 시간 초과'));
  await page.evaluate(() => { if (window.__fx) window.__fx.manual = true; });
  return { ctx, page, errs };
}

// ── 1. 부팅 + 모든 프리셋 (두 화면) ──
for (const vp of ['fold_open', 'phone2']) {
  console.log(`\n[${vp}]`);
  const { ctx, page, errs } = await open(vp, '&tier=mid');
  const r = await page.evaluate(() => {
    const a = window.__fx, out = { n: 0, bad: [], view: a.view, canvas: [0, 0], glErr: 0, sfxMissing: [] };
    for (const p of a.presets) {
      a.reset('mid'); a.steps(2, 1 / 60); const s0 = a.fx.particles.spawned, e0 = a.fx.stats.sfx;
      a.fire(p.name); let peak = 0, any = 0;
      for (let i = 0; i < 100; i++) { a.steps(1, 1 / 30, i % 12 === 3); const m = a.fx.measure(); peak = Math.max(peak, m.particles); any = Math.max(any, m.particles + m.quads + m.meshes + m.ribbons); }
      out.n++;
      if (any === 0) out.bad.push(p.name + ': 아무것도 그리지 않음');
      if (a.fx.stats.sfx === e0) out.bad.push(p.name + ': 소리 사건 없음');
      for (const s of p.sfx) if (!a.sfxSeen.has(s) && !['hit.parry', 'pickup.heal', 'pickup.mana', 'hit.guard'].includes(s)) out.sfxMissing.push(p.name + ' → ' + s);
    }
    // 단계 바꾸기 · 후처리 끄기 · 시범 두 개가 끝까지 도는지
    for (const t of ['low', 'high', 'mid']) { a.reset(t); a.fire('fire.pillar'); a.steps(40, 1 / 60, false); a.steps(2, 1 / 60); }
    a.fx.setPost(false); a.fire('hit.finisher'); a.steps(4, 1 / 60); a.fx.setPost(true); a.steps(2, 1 / 60);
    for (const d of ['combo', 'spells']) { a.startDemo(d); let n = 0; while (a.demoName && n++ < 60 * 30) a.steps(1, 1 / 60, n % 40 === 0); if (a.demoName) out.bad.push('시범 ' + d + ' 가 끝나지 않음'); }
    const c = document.getElementById('c'); out.canvas = [c.width, c.height]; out.glErr = a.fx.gl.getError(); out.gpuBytes = a.fx.gpuBytes; out.texBytes = a.fx.tex.bytes; out.postBytes = a.fx.post.bytes;
    return out;
  });
  report.views[vp] = r;
  if (errs.length) fail(`${vp}: 페이지 오류 ${errs.length}건 — ${errs.slice(0, 3).join(' | ')}`); else ok('페이지 오류 0');
  if (r.bad.length) fail(`${vp}: ${r.bad.join(' · ')}`); else ok(`프리셋 ${r.n}개 모두 그려지고 소리 사건을 냄`);
  if (r.sfxMissing.length) fail(`${vp}: 선언했지만 나오지 않은 소리 사건 — ${r.sfxMissing.join(', ')}`);
  if (r.glErr) fail(`${vp}: gl.getError() = ${r.glErr}`); else ok('GL 오류 0');
  console.log(`  캔버스 ${r.canvas.join('×')} · 논리 ${r.view.W}×${r.view.H} · GPU 메모리(효과) ${(r.gpuBytes / 1048576).toFixed(2)} MB (텍스처 ${(r.texBytes / 1048576).toFixed(2)} · 후처리 버퍼 ${(r.postBytes / 1048576).toFixed(2)})`);
  await ctx.close();
}

if (!args.has('--quick')) {
  const { ctx, page, errs } = await open('fold_open', '&tier=mid');
  await page.evaluate(() => { window.__fx.small = true; });
  report.presets = await page.evaluate(() => window.__fx.presets);   // 측정은 160×120 캔버스로 (개수·JS 시간은 해상도와 무관)
  // ── 2. 프리셋별 비용 (세 단계) ──
  console.log('\n[프리셋별 비용 — fold_open; 입자 = 뿜은 수/동시에 산 최댓값, 덧칠 = 화면(960×726) 대비 배수의 최댓값]');
  for (const tier of ['low', 'mid', 'high']) {
    report.cost[tier] = await page.evaluate((tier) => window.__fx.presets.map((p) => window.__fx.cost(p.name, tier)), tier);
  }
  console.log('프리셋'.padEnd(20) + ['low', 'mid', 'high'].map((t) => `| ${t}: 뿜음/동시 그리기 덧칠`.padEnd(34)).join(''));
  report.cost.mid.forEach((c, i) => {
    console.log(c.name.padEnd(20) + ['low', 'mid', 'high'].map((t) => { const x = report.cost[t][i]; return `| ${String(x.emitted).padStart(4)}/${String(x.peakParticles).padEnd(4)} ${String(x.peakDraws).padStart(2)}회 ${x.peakOverdraw.toFixed(2).padStart(5)}  문양${x.peakQuads} 메시${x.peakMeshes} 빛${x.peakLights}`.padEnd(34); }).join(''));
  });
  // ── 3. 난전 예산 ──
  console.log('\n[난전 15초 — 적 12 · 초당 타격 6 · 마법 2.5/초(3개쯤 떠 있음) · 큰 마법 2.4초마다]');
  for (const tier of ['low', 'mid', 'high']) {
    const h = await page.evaluate((tier) => window.__fx.heavy(tier, 15), tier); report.heavy[tier] = h;
    console.log(`  ${tier.padEnd(4)} 그리기(효과) 최대 ${h.draws.max} 평균 ${h.draws.avg} + 후처리 ${h.postPasses} + 장면 ${h.sceneDraws} · 입자 제출 최대 ${h.particles.max} (실제 산 것 최대 ${h.live.max} 평균 ${h.live.avg}) · 문양 ${h.quads.max} · 메시 ${h.meshes.max} (${h.meshTris.max}△) · 띠 ${h.ribbons.max} (${h.ribbonVerts.max}v) · 빛 ${h.lights.max} · 덧칠 최대 ${h.overdraw.max} 평균 ${h.overdraw.avg} 화면 · 밝기 최저 ${h.gainMin.toFixed(2)} · CPU(효과 JS) 평균 ${h.cpu.avg} p95 ${h.cpu.p95} 최대 ${h.cpu.max} ms`);
  }
  // ── 4. 할당 검사 ──
  console.log('\n[프레임당 할당 — performance.memory (정밀) · 미리 2400프레임 돌려 JIT 를 데운 뒤 1200프레임 동안 JS 힙 증가]');
  for (const mode of ['idle', 'fxonly', 'page']) {
    const a = await page.evaluate((mode) => window.__fx.alloc('mid', 2400, 1200, mode), mode); report.alloc[mode] = a;
    console.log(`  ${mode.padEnd(7)} ${a.bytes} 바이트 / ${a.frames} 프레임 = ${a.perFrame.toFixed(1)} 바이트/프레임 · 프레임당 ${a.ms.toFixed(3)} ms ${a.hasMemory && a.hasGc ? '' : '(메모리 정보 없음)'}`);
  }
  if (report.alloc.idle.bytes > 2048) fail(`정상 상태(새 효과 없음)에서 할당이 있다: ${report.alloc.idle.bytes} 바이트`); else ok('정상 상태(새 효과 없음) 할당 0');
  if (errs.length) fail(`측정 중 페이지 오류: ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

// ── 5. 접촉 시트 ──
if (args.has('--sheets')) {
  console.log('\n[접촉 시트]');
  const { ctx, page } = await open('fold_open', '&tier=high');
  const SHEETS = [
    ['hits', '타격', 0.5, [['hit.slash.light', 0.04, 0.1, 0.2, null, 0.37, 0.62], ['hit.slash.heavy', 0.05, 0.16, 0.3, null, 0.37, 0.62], ['hit.blunt', 0.05, 0.16, 0.34, null, 0.37, 0.62], ['hit.pierce', 0.04, 0.12, 0.22, null, 0.37, 0.62], ['hit.crit', 0.05, 0.2, 0.36, null, 0.37, 0.62], ['hit.guard', 0.04, 0.12, 0.24, null, 0.37, 0.62], ['hit.finisher', 0.06, 0.3, 0.6, null, 0.37, 0.62], ['swing.light', 0.04, 0.08, 0.13, null, 0.3, 0.62], ['swing.heavy', 0.05, 0.11, 0.18, null, 0.3, 0.62]]],
    ['move_enemy', '이동 · 적 · 줍기', 0.5, [['move.dash', 0.04, 0.12, 0.26, null, 0.27, 0.66], ['move.land', 0.04, 0.14, 0.3, null, 0.27, 0.66], ['move.step', 0.04, 0.12, 0.24, null, 0.27, 0.66], ['move.jump', 0.04, 0.12, 0.24, null, 0.27, 0.66], ['enemy.hurt', 0.03, 0.08, 0.16, null, 0.37, 0.62], ['enemy.death.bone', 0.08, 0.3, 0.7, null, 0.68, 0.6], ['enemy.death.ash', 0.15, 0.45, 0.85, null, 0.68, 0.6], ['pickup', 0.05, 0.18, 0.36, null, 0.5, 0.56], ['enemy.breath', 0.4, 0.75, 1.0, null, 0.55, 0.6], ['buff.shield', 0.1, 0.45, 0.85, null, 0.27, 0.62]]],
    ['fire', '불', 1, [['fire.bolt', 0.16, 0.42, 0.66], ['fire.pillar', 0.5, 0.84, 1.15], ['fire.meteor', 0.5, 0.98, 1.3]]],
    ['ice', '얼음', 1, [['ice.lance', 0.14, 0.32, 0.6], ['ice.nova', 0.35, 0.66, 1.1]]],
    ['lightning', '번개', 1, [['lightning.chain', 0.14, 0.24, 0.42], ['lightning.strike', 0.45, 0.66, 0.9, 4]]],
    ['holy', '성', 1, [['holy.pillar', 0.45, 0.78, 1.15, 3], ['holy.wave', 0.3, 0.52, 0.72], ['holy.bell', 0.22, 0.62, 1.05]]],
    ['blood', '피 · 그림자', 1, [['blood.orb', 0.25, 0.75, 1.12], ['shadow.claws', 0.28, 0.5, 0.68, 1]]],
    ['ult', '궁극기 「붉은 달의 종」', 1, [['ult.bloodmoon', 0.5, 1.3, 2.0], ['ult.bloodmoon', 2.6, 3.4, 3.9]]],
  ];
  for (const [file, title, crop, rows] of SHEETS) {
    const url = await page.evaluate(([rows, crop, title]) => window.__fx.sheet(rows, 'high', crop, title), [rows, crop, title]);
    const f = `${OUT}/sheet_${file}.jpg`; fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('  ' + f);
  }
  // 단계 비교 한 장 (난전의 같은 순간)
  for (const tier of ['low', 'mid', 'high']) {
    const url = await page.evaluate((tier) => { const a = window.__fx; a.reset(tier); a.startDemo('heavy'); a.steps(60 * 4 + 20, 1 / 60, false); a.steps(1, 0); return document.getElementById('c').toDataURL('image/jpeg', 0.88); }, tier);
    fs.writeFileSync(`${OUT}/heavy_${tier}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`  ${OUT}/heavy_{low,mid,high}.jpg`);
  await ctx.close();
}

// ── 6. 시범 영상 (프레임을 하나씩 찍어 ffmpeg 로 묶는다 → 소프트웨어 렌더러의 느린 속도와 무관하게 30 fps) ──
if (args.has('--video')) {
  console.log('\n[영상]');
  const { ctx, page } = await open('fold_open', '&tier=high');
  const dir = `${TMP}/frames`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const shoot = async () => { const url = await page.evaluate(() => window.__fx.shot(1 / 30, 2, 0.82)); fs.writeFileSync(`${dir}/f_${String(n++).padStart(5, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64')); };
  for (const [d, loops] of [['combo', 1], ['spells', 1]]) {
    for (let l = 0; l < loops; l++) {
      await page.evaluate((d) => { window.__fx.reset('high'); window.__fx.startDemo(d); }, d);
      let guard = 0; while (guard++ < 30 * 26) { await shoot(); if (!(await page.evaluate(() => window.__fx.demoName))) break; }
      for (let i = 0; i < 12; i++) await shoot();
    }
  }
  const mp4 = `${OUT}/fx_demos.mp4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/f_%05d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-movflags', '+faststart', mp4]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`  ${mp4} (${n} 프레임, ${(n / 30).toFixed(1)}초, ${(fs.statSync(mp4).size / 1048576).toFixed(2)} MB)`);
  await ctx.close();
}

// ── 7. 문서의 숫자 칸 갱신 (docs/v2/FX.md 의 <!-- numbers:begin --> … <!-- numbers:end -->) ──
if (args.has('--doc') && report.cost.mid) {
  const P = report.presets, L = [];
  const mb = (b) => (b / 1048576).toFixed(2);
  L.push(`측정: ${report.date.slice(0, 16).replace('T', ' ')} UTC · 헤드리스 Chromium 1194 + SwiftShader(소프트웨어 렌더러) — **프레임 시간은 기기 값이 아니다.** 아래는 옮겨 읽을 수 있는 값(개수·바이트·JS 시간)만 적었다.`, '');
  L.push('**프리셋 목록 (연결 계약)**', '', '| 이름 | 뜻 | 자리 | 소리 사건 | 손맛 호출 |', '|---|---|---|---|---|');
  for (const p of P) L.push(`| \`${p.name}\` | ${p.ko} | ${p.args === 'hit' ? '맞은 점 + 방향' : p.args === 'aim' ? '쏘는 쪽 발밑 → 표적 발밑' : '발밑 (+방향)'} | ${p.sfx.map((x) => '`' + x + '`').join(' ')} | ${p.feel} |`);
  L.push('', '**프리셋별 비용** (혼자 냈을 때의 최댓값. 덧칠 = 효과가 덮는 넓이 ÷ 폴드 화면 960×726; 겹쳐 그린 넓이의 합이라 1 을 넘을 수 있다)', '', '| 프리셋 | 뿜는 입자 low / mid / high | 동시에 산 입자 (mid) | 그리기 호출 (mid) | 덧칠 low / mid / high | 문양 · 메시 · 띠 · 빛 (mid) |', '|---|---|---|---|---|---|');
  report.cost.mid.forEach((c, i) => { const lo = report.cost.low[i], hi = report.cost.high[i]; L.push(`| \`${c.name}\` | ${lo.emitted} / ${c.emitted} / ${hi.emitted} | ${c.peakParticles} | ${c.peakDraws} | ${lo.peakOverdraw.toFixed(2)} / ${c.peakOverdraw.toFixed(2)} / ${hi.peakOverdraw.toFixed(2)} | ${c.peakQuads} · ${c.peakMeshes} · ${c.peakRibbons} · ${c.peakLights} |`); });
  L.push('', '**난전 한 프레임의 예산** (15초 = 900프레임, 사건은 실제 시간 기준: 적 12, 초당 타격 6회 + 휘두르기, 발걸음 초당 24, 마법 초당 2.5개(늘 3개쯤 떠 있음), 큰 마법 2.4초마다, 죽음 1.5초마다)', '', '| 단계 | 효과 그리기 호출 최대 (평균) | + 후처리 패스 | 입자: 제출 최대 / 실제 산 것 최대 (평균) / 상한 | 문양 최대 | 메시 최대 (삼각형) | 띠 최대 (정점) | 빛 최대 | 덧칠 최대 (평균) | 밝기 조절 최저 | 효과 JS 시간 평균 · p95 · 최대 (ms) |', '|---|---|---|---|---|---|---|---|---|---|---|');
  const CAP = { low: 1024, mid: 2048, high: 4096 };
  for (const t of ['low', 'mid', 'high']) { const h = report.heavy[t]; L.push(`| ${t} | ${h.draws.max} (${h.draws.avg.toFixed(1)}) | ${h.postPasses} | ${h.particles.max} / ${h.live.max} (${Math.round(h.live.avg)}) / ${CAP[t]} | ${h.quads.max} | ${h.meshes.max} (${h.meshTris.max}) | ${h.ribbons.max} (${h.ribbonVerts.max}) | ${h.lights.max} | ${h.overdraw.max.toFixed(2)} (${h.overdraw.avg.toFixed(2)}) | ${h.gainMin.toFixed(2)} | ${h.cpu.avg.toFixed(2)} · ${h.cpu.p95.toFixed(2)} · ${h.cpu.max.toFixed(2)} |`); }
  L.push('', `- 장면(시험 화면의 바닥·벽·인형)은 따로 ${report.heavy.mid.sceneDraws}회. 효과 JS 시간 = \`fx.update\` + \`fx.draw\` 안에서 잰 \`performance.now()\` 차이(헤드리스·다른 작업과 CPU 를 나눠 쓰는 기계에서 잰 값; GPU 시간은 들어 있지 않다).`);
  L.push('', '**프레임당 할당** (`performance.memory.usedJSHeapSize`, `--enable-precise-memory-info` · 시작 전에 `gc()`; 2,400프레임을 먼저 돌려 JIT 를 데운 뒤 1,200프레임 동안 힙이 는 양)', '', '| 경우 | 1,200프레임 동안 는 힙 | 프레임당 | 프레임당 JS 시간 (1,200프레임 평균) |', '|---|---|---|---|');
  const AN = { idle: '정상 상태: 살아 있는 효과만 돌고 새로 내지 않음 (시험 화면 프레임 전체)', fxonly: '난전: 효과 엔진만 (`fx.update` + 프리셋 호출 + `fx.draw`)', page: '난전: 시험 화면 프레임 전체 (장면 그리기 · 후처리 포함)' };
  for (const m of ['idle', 'fxonly', 'page']) { const a = report.alloc[m]; L.push(`| ${AN[m]} | ${a.bytes} 바이트 | ${a.perFrame.toFixed(1)} 바이트 | ${a.ms.toFixed(3)} ms |`); }
  L.push('', '**메모리**', '');
  for (const v of ['fold_open', 'phone2']) { const r = report.views[v]; L.push(`- ${v} (캔버스 ${r.canvas.join('×')}): 효과 GPU 메모리 ${mb(r.gpuBytes)} MB = 텍스처 ${mb(r.texBytes)} (입자 512² + 문양 512² + 잡음 64², 밉맵 포함) + 후처리 버퍼 ${mb(r.postBytes)} (장면 색 + 깊이 + 번짐 단계) + 정점 버퍼 ${mb(r.gpuBytes - r.texBytes - r.postBytes)}`); }
  L.push('- 후처리 버퍼는 캔버스 크기에 비례한다: 폴드 실기 medium(1455×1100)이면 약 13 MB, high(2000×1512)면 약 25 MB. low 단계는 후처리를 꺼서 0.');
  const f = 'docs/v2/FX.md'; let md = fs.readFileSync(f, 'utf8');
  const i0 = md.indexOf('<!-- numbers:begin -->'), i1 = md.indexOf('<!-- numbers:end -->');
  if (i0 >= 0 && i1 > i0) { md = md.slice(0, i0 + 22) + '\n' + L.join('\n') + '\n' + md.slice(i1); fs.writeFileSync(f, md); console.log('\ndocs/v2/FX.md 숫자 칸 갱신'); } else console.log('\ndocs/v2/FX.md 에 numbers 표시가 없다');
}

report.fails = fails;
fs.writeFileSync(`${OUT}/fx_check.json`, JSON.stringify(report, null, 1));
srv.close();
console.log(fails.length ? `\n실패 ${fails.length}건` : '\n모두 통과');
process.exit(fails.length ? 1 : 0);
