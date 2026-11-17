// v2 fx — 검수용 심술 검사 (fxverify): node tools/v2/fx_verify.mjs [state|tiers|ctx|alloc|all]  → /dev/shm/fxverify/adv_<part>.json
//   state = 궁극기 도중 단계 바꾸기·풀 넘침·상한 / tiers = 단계별 그리기·후처리 끔 / ctx = GL 컨텍스트 잃기·되찾기 / alloc = 할당 반복 측정 + 긴 난전 누수
// 헤드리스 Chromium(SwiftShader) — 프레임 시간은 기기 값이 아니다. 개수·바이트만 옮겨 읽는다.
import { chromium } from 'playwright-core';
import { start } from '../serve.mjs';
import { contextOptions } from '../qa/lib/viewports.mjs';
import fs from 'node:fs';
const port = 8990 + (process.pid % 9); const srv = await start(port);
const launch = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const part = process.argv[2] || 'all'; const out = {};
async function open(preset, q = '') {
  const browser = await launch(); const page = await (await browser.newContext({ ...contextOptions(preset), deviceScaleFactor: 1 })).newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('console: ' + m.text()); });
  await page.goto(`http://localhost:${port}/tools/v2/fx_view.html?ui=0${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fx && window.__fx.ready && window.__fx.texReady, null, { timeout: 60000 });
  await page.evaluate(() => { window.__fx.manual = true; });
  return { browser, page, errs };
}
if (part === 'all' || part === 'state') {
  const { browser, page, errs } = await open('fold_open', '&tier=mid');
  out.state = await page.evaluate(() => {
    const a = window.__fx, fx = a.fx, r = {};
    // A1: 궁극기 도중 setTier
    a.reset('mid'); a.steps(2, 1 / 60); a.fire('ult.bloodmoon'); a.steps(40, 1 / 60, false); r.darkDuringUlt = fx.feel.screen.dark;
    fx.setTier('low'); a.steps(600, 1 / 60, false); r.darkAfterSetTierMidUlt = fx.feel.screen.dark; r.seqsAfter = fx.seqs.live;
    // A2: 시퀀스 풀이 찬 뒤 궁극기
    a.reset('low'); a.steps(2, 1 / 60); for (let i = 0; i < 40; i++) a.fire('fire.meteor'); r.seqLiveFull = fx.seqs.live; a.fire('ult.bloodmoon'); a.steps(2, 1 / 60, false); r.darkAfterUltOnFullPool = fx.feel.screen.dark; a.steps(900, 1 / 60, false); r.darkLaterFullPool = fx.feel.screen.dark; r.seqsLater = fx.seqs.live;
    // A3: 궁극기 도중 setPost(false) → 끝난 뒤 dark
    a.reset('mid'); a.fire('ult.bloodmoon'); a.steps(40, 1 / 60, false); fx.setPost(false); a.steps(600, 1 / 60, false); r.darkAfterPostOffMidUlt = fx.feel.screen.dark; fx.setPost(true);
    // A4: 궁극기 두 번 겹침
    a.reset('mid'); a.fire('ult.bloodmoon'); a.steps(120, 1 / 60, false); a.fire('ult.bloodmoon'); a.steps(900, 1 / 60, false); r.darkAfterDoubleUlt = fx.feel.screen.dark; r.slowAfter = fx.feel.timeScale;
    // A5: 타격 멈춤 상한: 1초에 20번 강타 → 멈춘 시간 합
    a.reset('mid'); let frozen = 0; for (let i = 0; i < 120; i++) { if (i % 6 === 0) a.fire('hit.slash.heavy'); const dt = fx.update(1 / 120); if (dt === 0) frozen += 1 / 120; } r.frozenIn1s = Math.round(frozen * 1000) / 1000;
    // A6: 번쩍임 상한
    a.reset('mid'); let mf = 0; for (let i = 0; i < 60; i++) { a.fire('hit.finisher'); a.fire('ult.bloodmoon'); fx.update(1 / 60); mf = Math.max(mf, fx.feel.screen.flash[3]); } r.maxFlash = mf;
    // A7: NaN/이상 입력
    a.reset('mid'); try { fx.play('hit.slash.light', {}); fx.play('fire.bolt', { x: 0, z: 0, tx: 0, tz: 0 }); fx.playAt(0, NaN, 0, 0, 0, 0, 1, 0, 0, 0); fx.play('nope', {}); fx.update(0); fx.update(5); a.steps(30, 1 / 60); r.weirdOk = true; } catch (e) { r.weirdOk = 'threw: ' + e.message; }
    r.glErr = fx.gl.getError();
    return r;
  });
  out.state.errs = errs; await browser.close();
}
if (part === 'all' || part === 'tiers') {
  for (const vp of ['fold_open', 'phone2']) {
    const { browser, page, errs } = await open(vp, '&tier=mid');
    out['tiers_' + vp] = await page.evaluate(() => {
      const a = window.__fx, fx = a.fx, gl = fx.gl, r = {}; fx.profile = true;
      const lum = () => { const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0, mx = 0; for (let i = 0; i < px.length; i += 4 * 7) { const l = px[i] + px[i + 1] + px[i + 2]; s += l; if (l > mx) mx = l; } return [Math.round(s / (px.length / 28) / 3 * 10) / 10, mx]; };
      for (const [tier, post] of [['low', true], ['mid', true], ['mid', false], ['high', true], ['high', false]]) {
        a.reset(tier); fx.setPost(post); a.steps(3, 1 / 60); a.fire('fire.pillar'); a.fire('hit.slash.heavy'); let md = 0, mp = 0; for (let i = 0; i < 54; i++) { a.steps(1, 1 / 60); md = Math.max(md, fx.stats.draws); mp = Math.max(mp, fx.stats.postPasses); }
        r[tier + (post ? '' : '_postoff')] = { draws: md, postPasses: mp, postBytes: fx.post.bytes, gpuBytes: fx.gpuBytes, lum: lum(), glErr: gl.getError() };
      }
      fx.setPost(true); return r;
    });
    out['tiers_' + vp].errs = errs; await browser.close();
  }
}
if (part === 'all' || part === 'ctx') {
  const { browser, page, errs } = await open('fold_open', '&tier=mid');
  out.ctx = await page.evaluate(async () => {
    const a = window.__fx, fx = a.fx, gl = fx.gl, r = {}; const ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return { skipped: 'no WEBGL_lose_context' };
    const cv = gl.canvas; let lostEv = 0, restEv = 0; cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lostEv++; }); cv.addEventListener('webglcontextrestored', () => { restEv++; });
    a.fire('fire.pillar'); a.steps(5, 1 / 60);
    ext.loseContext(); await new Promise((res) => setTimeout(res, 100)); r.lost = gl.isContextLost(); r.lostEv = lostEv;
    try { fx.update(1 / 60); fx.play('hit.slash.heavy', { x: 0, y: 60, z: 0 }); fx.play('ult.bloodmoon', { x: 0, y: 0, z: 0 }); for (let i = 0; i < 30; i++) { fx.update(1 / 60); fx.post.begin(cv.width, cv.height); fx.draw(a.cam); fx.post.end(fx.feel.screen); } r.whileLost = 'no throw'; } catch (e) { r.whileLost = 'threw: ' + e.message; }
    try { fx.dispose(); r.disposeLost = 'no throw'; } catch (e) { r.disposeLost = 'threw: ' + e.message; }
    let made = null; try { const m = await import('/src/v2/fx/index.js'); made = m.createFx(gl, { tier: 'mid' }); r.createWhileLost = made ? 'returned object' : 'null'; } catch (e) { r.createWhileLost = 'threw: ' + e.message; }
    ext.restoreContext(); await new Promise((res) => setTimeout(res, 300)); r.restored = !gl.isContextLost(); r.restEv = restEv;
    try {
      const m = await import('/src/v2/fx/index.js'); const f2 = m.createFx(gl, { tier: 'mid', profile: true }); r.created = !!f2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height);
      f2.play('fire.pillar', { x: 0, y: 0, z: 60, tx: 0, tz: 60 }); f2.play('hit.finisher', { x: 0, y: 60, z: 60 });
      let lit = 0;
      for (let i = 0; i < 70; i++) { f2.update(1 / 60); f2.post.begin(cv.width, cv.height); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); f2.draw(a.cam); f2.post.end(f2.feel.screen);
        if (i % 10 === 9) { const px = new Uint8Array(cv.width * cv.height * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px); let n = 0; for (let k = 0; k < px.length; k += 16) if (px[k] + px[k + 1] + px[k + 2] > 60) n++; lit = Math.max(lit, n); } }
      r.litPixelsAfterRestore = lit; r.drawsAfterRestore = f2.stats.draws; r.glErr = gl.getError(); r.gpuBytes = f2.gpuBytes;
    } catch (e) { r.afterRestore = 'threw: ' + e.message; }
    return r;
  });
  out.ctx.errs = errs; await browser.close();
}
if (part === 'all' || part === 'alloc') {
  const { browser, page, errs } = await open('fold_open', '&tier=mid');
  out.alloc = {};
  for (const [mode, warm, n] of [['fxidle', 2400, 1200], ['fxidle', 2400, 1200], ['fxidle', 6000, 1200], ['fxidle', 6000, 4800], ['fxonly', 2400, 1200], ['fxonly', 6000, 4800], ['control', 2400, 1200]]) {
    const r = await page.evaluate(([mode, warm, n]) => { window.__fx.small = true; return window.__fx.alloc('mid', warm, n, mode); }, [mode, warm, n]);
    (out.alloc[mode] ??= []).push({ warm, n, r });
  }
  // 긴 난전: 누수(끝난 뒤 gc 하고 남는 힙)
  out.leak = await page.evaluate(() => { const a = window.__fx; a.small = true; a.reset('mid'); gc(); const h0 = performance.memory.usedJSHeapSize; a.startDemo('heavy'); a.steps(60 * 90, 1 / 60, false); a.reset('mid'); gc(); const h1 = performance.memory.usedJSHeapSize; a.startDemo('heavy'); a.steps(60 * 90, 1 / 60, false); a.reset('mid'); gc(); const h2 = performance.memory.usedJSHeapSize; return { h0, h1, h2, grow1: h1 - h0, grow2: h2 - h1, spawned: a.fx.particles.spawned }; });
  out.alloc.errs = errs; await browser.close();
}
fs.mkdirSync('/dev/shm/fxverify', { recursive: true }); fs.writeFileSync(`/dev/shm/fxverify/adv_${part}.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); srv.close(); process.exit(0);
