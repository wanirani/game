// 성능 진단 장면(v2bench) 검사 — docs/v2/PERF_NOTES.md §6
// 헤드리스 Chromium 에서 index.html?scene=v2bench 를 fold_open · phone2 로 열어 끝까지 돌리고, 표를 찍고, 결과 화면의 단추를 눌러 본다.
//   node tools/v2/bench_check.mjs [--devices fold_open,phone2] [--sec 2] [--full] [--shots /tmp/claude-0/v2/bench] [--no-shots] [--json out.json]
//     --sec N   시험 하나의 길이(초). 기본 2 (앞 0.5초 버림) — 빨리 끝내려고 줄인 값이다. --full = 기기와 같은 4초(앞 1초 버림), 약 1분.
// ★ 주의: 헤드리스의 WebGL 은 소프트웨어 렌더러(SwiftShader)다. 여기 나오는 프레임 시간·끊김·추천 설정은 실제 기기의 값이 아니다.
//   이 도구가 확인하는 것은 "장면이 뜨고, 모든 시험을 돌고, 표와 단추가 동작하고, 페이지 오류가 없다" 뿐이다.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import { buildMatrix, pickBest, STORE_KEY } from '../../src/v2/bench/stats.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const DEVICES = String(args.devices || 'fold_open,phone2').split(',');
const SEC = args.full ? 4 : Number(args.sec || 2), SKIP = args.full ? 1 : Math.min(0.5, SEC / 3);
const SHOTS = args['no-shots'] ? null : String(args.shots || '/tmp/claude-0/v2/bench');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const fails = [], out = { sec: SEC, devices: {} };
const fail = (m) => { fails.push(m); console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// 순수 계산 한 번: 시험 목록과 고르기 규칙
{
  const a = buildMatrix(true), b = buildMatrix(false);
  if (a.length < 10 || a.length > 14) fail('시험 수(입체 있음)가 이상하다: ' + a.length); if (b.length < 6) fail('시험 수(입체 없음)가 이상하다: ' + b.length);
  const row = (present, resK, pace, uneven, fps) => ({ present, resK, pace, chars: '3d', pick: true, valid: true, draws: 100, uneven, fps });
  const p1 = pickBest([row('blit', 1, 'cap60', 0.12, 60), row('layer', 1, 'every', 0.01, 120), row('layer', 0.5, 'every', 0.0, 120)]);
  const p2 = pickBest([row('layer', 1, 'every', 0.3, 80), row('layer', 1, 'cap60', 0.01, 60), row('layer', 0.75, 'every', 0.01, 120)]);
  if (p1?.resK !== 1 || p1.pace !== 'every') fail('고르기 규칙 1: 같은 등급이면 높은 해상도를 골라야 한다'); if (p2?.resK !== 0.75) fail('고르기 규칙 2: 부드러운 것 가운데 초당 그림이 많은 것');
  if (!fails.length) ok(`시험 목록 ${a.length}줄(입체 있음) / ${b.length}줄(없음) · 고르기 규칙 확인`);
}

const port = 8300 + Math.floor(Math.random() * 600);
const srv = await start(port);
const browser = await chromium.launch({ executablePath: EXE, args: GL_ARGS });
console.log('★ 헤드리스 = 소프트웨어 렌더러. 아래 숫자는 실제 기기의 값이 아니다 (장면이 끝까지 도는지만 본다).');

for (const device of DEVICES) {
  console.log(`\n[${device}] 시험 길이 ${SEC}초 (앞 ${SKIP}초 버림)`);
  const ctx = await browser.newContext(contextOptions(device));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/index.html?scene=v2bench&benchsec=${SEC}&benchskip=${SKIP}`);
  await page.waitForFunction(() => window.__v2bench && window.__v2bench.phase !== 'load', null, { timeout: 60000 }).catch(() => fail(device + ': 준비 시간 초과'));
  let shotRun = false, last = -1;
  for (;;) {
    const st = await page.evaluate(() => (window.__v2bench ? { phase: window.__v2bench.phase, p: window.__v2bench.progress, layer: !!document.getElementById('v2bench-gl') } : null));
    if (!st) { fail(device + ': 장면이 사라졌다'); break; }
    if (st.phase === 'done') break;
    if (st.p[0] !== last) { last = st.p[0]; process.stdout.write(`\r  진행 ${st.p[0]}/${st.p[1]} `); }
    if (SHOTS && !shotRun && st.phase === 'run' && st.p[0] >= 4) { shotRun = true; await page.screenshot({ path: `${SHOTS}/${device}_run.png` }); }
    if (Date.now() - t0 > 60000 + SEC * 1000 * 40) { fail(device + ': 끝나지 않는다'); break; }
    await page.waitForTimeout(250);
  }
  process.stdout.write('\r');
  const rep = await page.evaluate(() => ({ report: window.__v2bench?.report ?? null, text: window.__v2bench?.text ?? '', layerLeft: !!document.getElementById('v2bench-gl') }));
  if (!rep.report) { fail(device + ': 결과가 없다'); await ctx.close(); continue; }
  const R = rep.report, valid = R.rows.filter((r) => r.valid).length;
  console.log(rep.text.split('\n').map((l) => '    ' + l).join('\n'));
  if (valid === R.rows.length && valid >= 6) ok(`시험 ${valid}/${R.rows.length} 줄 모두 잼 (${((Date.now() - t0) / 1000).toFixed(0)}초)`); else fail(`${device}: 잰 줄 ${valid}/${R.rows.length}`);
  if (R.best) ok(`추천: ${R.best.present} · ${R.best.resK} · ${R.best.pace} (${R.best.chars}) — 소프트웨어 렌더러 기준이라 뜻 없음`); else fail(device + ': 추천 설정이 없다');
  if (R.env.char3d === 'ok') ok('입체 캐릭터 시험 포함'); else console.log('  · 입체 캐릭터 시험은 건너뜀: ' + R.env.char3d);
  if (rep.layerLeft) fail(device + ': 결과 화면에 GL 층이 남아 있다');
  if (!/SwiftShader|llvmpipe|Software/i.test(R.env.gl.renderer)) console.log('  · 렌더러: ' + R.env.gl.renderer + ' (소프트웨어가 아님)');
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${device}_result.png` });
  // 단추: 논리 좌표 → 화면 좌표 (결과 화면의 배치와 같은 계산)
  const tapBtn = async (i) => {
    const p = await page.evaluate((idx) => {
      const g = window.__game, s = g.safe ?? { l: 0, r: 0, b: 0 }, Wv = g.viewW, Hv = g.viewH, tight = Hv < 620;
      const x0 = 18 + s.l, w = Wv - 18 - s.r - x0, btnH = tight ? 40 : 46, gap = 10, bw = Math.min(210, (w - gap * 3) / 4), bx = x0 + (w - (bw * 4 + gap * 3)) / 2, by = Hv - s.b - btnH - 10;
      const r = g.canvas.getBoundingClientRect();
      return { x: r.left + (bx + idx * (bw + gap) + bw / 2) * r.width / Wv, y: r.top + (by + btnH / 2) * r.height / Hv };
    }, i);
    await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(450);
  };
  await tapBtn(1);
  const stored = await page.evaluate((k) => localStorage.getItem(k), STORE_KEY);
  let sv = null; try { sv = JSON.parse(stored); } catch { sv = null; }
  if (sv && sv.v === 1 && (sv.present === 'layer' || sv.present === 'blit') && [1, 0.75, 0.5].includes(sv.resK) && (sv.cap === 0 || sv.cap === 60)) ok('「이 설정으로 하기」 → localStorage ' + STORE_KEY + ' = ' + stored); else fail(device + ': 설정이 저장되지 않았다: ' + stored);
  await tapBtn(0);
  const cp = await page.evaluate(async () => { let clip = null; try { clip = await navigator.clipboard.readText(); } catch { clip = null; } const ta = document.getElementById('v2bench-text'); return { clip, box: ta ? ta.value : null }; });
  if ((cp.clip && cp.clip.startsWith('[BN v2bench')) || (cp.box && cp.box.startsWith('[BN v2bench'))) ok('「결과 복사」 → ' + (cp.clip?.startsWith('[BN v2bench') ? '클립보드에 들어감' : '글 상자가 뜸 (클립보드 못 씀)')); else fail(device + ': 결과 복사가 동작하지 않는다');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${device}_copied.png` });
  // 클립보드를 못 쓰는 기기 흉내: writeText 를 막고 다시 누른다 → 글 상자가 떠야 한다
  await page.evaluate(() => { document.getElementById('v2bench-text')?.remove(); try { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); } catch { /* 무시 */ } document.execCommand = () => false; });
  if (cp.box) await tapBtn(0);   // 상자가 떠 있었으면 닫는다
  await tapBtn(0);
  const box = await page.evaluate(() => { const ta = document.getElementById('v2bench-text'); return ta ? { v: ta.value.slice(0, 12), ro: ta.readOnly, h: ta.getBoundingClientRect().height } : null; });
  if (box && box.v.startsWith('[BN v2bench') && box.ro && box.h > 50) ok('클립보드 없음 → 고를 수 있는 글 상자 (높이 ' + Math.round(box.h) + ' CSS px)'); else fail(device + ': 클립보드가 없을 때 글 상자가 뜨지 않는다');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${device}_box.png` });
  await tapBtn(0);
  // 나가기 → 자원 정리
  await tapBtn(3); await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({ api: !!window.__v2bench, gl: !!document.getElementById('v2bench-gl'), box: !!document.getElementById('v2bench-text'), top: window.__game?.scenes.map((s) => s.name).join('>') }));
  if (!after.api && !after.gl && !after.box) ok('나가기 → 정리됨 (지금 장면: ' + after.top + ')'); else fail(device + ': 나간 뒤 남은 것 ' + JSON.stringify(after));
  if (errs.length) for (const e of errs.slice(0, 8)) fail(device + ': ' + e); else ok('페이지 오류 0');
  out.devices[device] = { report: R, text: rep.text };
  await ctx.close();
}

// WebGL 없음 → 안내가 든 결과 화면 (예외 없음)
{
  const b2 = await chromium.launch({ executablePath: EXE, args: ['--disable-gpu', '--disable-3d-apis', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await b2.newContext(contextOptions(DEVICES[0]))).newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/index.html?scene=v2bench&benchsec=1`);
  await page.waitForFunction(() => window.__v2bench?.phase === 'done', null, { timeout: 40000 }).catch(() => errs.push('끝나지 않음'));
  const r = await page.evaluate(() => ({ note: window.__v2bench?.report?.note ?? '', api: window.__v2bench?.report?.env.gl.api, text: window.__v2bench?.text ?? '' }));
  if (!errs.length && r.api === 'none' && r.text.startsWith('[BN v2bench')) ok('\nWebGL 없음 → 결과 화면에 안내 (' + r.note + '), 오류 0'); else fail('WebGL 없음 처리: ' + JSON.stringify({ errs, r }).slice(0, 300));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/nowebgl.png` });
  await b2.close();
}

await browser.close(); srv.close();
if (args.json) fs.writeFileSync(String(args.json), JSON.stringify(out, null, 1));
console.log(fails.length ? `\n실패 ${fails.length}건` : '\n모두 통과 (숫자는 소프트웨어 렌더러의 값 — 기기 값은 기기에서 「결과 복사」로 받는다)');
process.exit(fails.length ? 1 : 0);
