#!/usr/bin/env node
// 배포 확인 (스모크) — owner: DELIVERY-WEB (platform §9.2 post-deploy smoke, §11 WP-8 acceptance 6)
//
//   node tools/deploy/smoke_deployed.mjs https://blood-nocturne.netlify.app     # 배포된 사이트
//   node tools/deploy/smoke_deployed.mjs --local                               # dist/web 을 serve_dist 로 띄워 같은 검사
// 선택: --no-browser (HTTP 검사만) · --no-apk (APK 없는 배포) · --no-api (계정 API 검사 건너뜀; --local 은 기본으로 건너뜀)
//
// HTTP: 보안·캐시 헤더(netlify.toml 과 같은지, 겹쳐서 이어 붙은 값이 없는지), sw.js 에 빌드 정보, build.json·build-info.js 해시 일치,
//       미리 받기 목록 전부 200, 번들 1년 캐시·brotli, 그림 재검증, 공개 금지 파일 404 (키스토어·netlify.toml·package.json·docs·tools·.git…),
//       /apk → 302 → APK (형식·첨부), latest.json, /api/health (+ 앱 출처 CORS 사전 요청).
// 브라우저(Chromium, 비공개 창이 아닌 영구 프로필): 타이틀·마을·스테이지 s01·보스방 s04 페이지 오류 0, 서비스 워커 등록·제어,
//       설치 가능(Page.getInstallabilityErrors 비어 있음), /api/ 응답이 Cache Storage 에 없음.
// 보고: dist/smoke_<호스트>.json. 모두 통과하면 exit 0.
// 프록시: HTTPS_PROXY 가 있으면 HTTP 검사와 브라우저가 그 프록시를 쓴다 (이 작업 환경).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, request as pwRequest } from 'playwright-core';
import { ROOT, parseArgs, parseNetlifyToml, headersFor, mkdirp } from './lib/util.mjs';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IGNORE_CONSOLE = /Failed to load resource|ERR_CERT|ERR_INTERNET_DISCONNECTED/;
const APP_ORIGIN = 'https://appassets.androidplatform.net';
const PRIVATE = ['/tools/android/release.keystore', '/tools/android/keystore.properties', '/netlify.toml', '/package.json', '/package-lock.json',
  '/docs/ACCOUNTS.md', '/.git/config', '/.git/HEAD', '/netlify/functions/api.mts', '/netlify/lib/crypto.mts', '/node_modules/playwright-core/package.json',
  '/dist/web/index.html', '/android/AndroidManifest.xml', '/tools/deploy/build_web.mjs', '/.env', '/tools/.qa_accounts/x'];

export async function smoke(base, { browser = true, apk = true, api = true, quiet = false } = {}) {
  const origin = new URL(base).origin;
  const https = origin.startsWith('https:');
  const results = [];
  const say = (...a) => { if (!quiet) console.log(...a); };
  const check = async (id, title, fn) => {
    let r;
    try { r = await fn(); } catch (e) { r = { pass: false, detail: 'error: ' + (e?.message || e) }; }
    if (r === undefined || r === true) r = { pass: true };
    if (r === false) r = { pass: false };
    results.push({ id, title, ...r });
    say(`${r.skip ? '·' : r.pass ? '✓' : '✗'} ${id} — ${title}${r.detail ? `: ${r.detail}` : ''}${r.skip ? ` (건너뜀: ${r.skip})` : ''}`);
    return r;
  };
  const proxyEnv = process.env.HTTPS_PROXY || process.env.https_proxy;
  const useProxy = https && proxyEnv && !/^(localhost|127\.|\[::1\])/.test(new URL(origin).hostname);
  const proxy = useProxy ? { server: proxyEnv, bypass: 'localhost,127.0.0.1' } : undefined;
  const req = await pwRequest.newContext({ baseURL: origin, proxy, extraHTTPHeaders: { 'Accept-Encoding': 'br, gzip' }, timeout: 30000 });
  const tomlConf = parseNetlifyToml(fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8'));
  const get = (u, o = {}) => req.get(u, { maxRedirects: 0, failOnStatusCode: false, ...o });
  const hdr = (res, k) => res.headers()[k.toLowerCase()] ?? '';

  // ── HTTP ──
  let html = '', sw = '', build = null, swBuild = null;
  await check('http.index', '/ → 200 index.html + 보안 헤더', async () => {
    const res = await get('/');
    html = await res.text();
    const miss = [];
    if (res.status() !== 200) return { pass: false, detail: `status ${res.status()}` };
    if (!/text\/html/.test(hdr(res, 'content-type'))) miss.push('content-type');
    const csp = hdr(res, 'content-security-policy');
    if (!/script-src 'self'(;|$)/.test(csp)) miss.push(`CSP script-src (${/script-src[^;]*/.exec(csp)?.[0] || '없음'})`);
    if (/unsafe-eval/.test(csp)) miss.push('CSP unsafe-eval');
    if (!/connect-src 'self'/.test(csp)) miss.push('CSP connect-src');
    if (!/frame-ancestors/.test(csp)) miss.push('CSP frame-ancestors');
    if (hdr(res, 'x-content-type-options') !== 'nosniff') miss.push('nosniff');
    if (!hdr(res, 'referrer-policy')) miss.push('Referrer-Policy');
    const pp = hdr(res, 'permissions-policy');
    for (const f of ['gamepad', 'fullscreen', 'screen-wake-lock', 'autoplay']) if (!new RegExp(`${f}=\\(self\\)`).test(pp)) miss.push(`Permissions-Policy ${f}`);
    if (hdr(res, 'cross-origin-opener-policy') !== 'same-origin') miss.push('COOP');
    if (!hdr(res, 'x-frame-options')) miss.push('X-Frame-Options');
    if (https && !/max-age=\d+/.test(hdr(res, 'strict-transport-security'))) miss.push('HSTS');
    if (!/no-cache/.test(hdr(res, 'cache-control'))) miss.push(`Cache-Control no-cache (${hdr(res, 'cache-control')})`);
    if (!/<script src="build-info\.js\?v=/.test(html)) miss.push('build-info.js 스크립트');
    if (/<script>(?!\s*<\/script>)/.test(html)) miss.push('인라인 스크립트');
    return { pass: !miss.length, detail: miss.length ? '빠짐/틀림: ' + miss.join(', ') : 'ok' };
  });
  await check('http.headers.match', '헤더가 netlify.toml 규칙과 같고 겹친 값이 없음', async () => {
    const paths = ['/', '/index.html', '/sw.js', '/build.json', '/manifest.webmanifest', '/assets/bg/title.webp'];
    const main = /<script type="module" src="([^"]+)"/.exec(html)?.[1];
    if (main) paths.push('/' + main);
    const bad = [];
    for (const p of paths) {
      const res = await get(p);
      const want = headersFor(tomlConf.headers, p);
      for (const [k, v] of Object.entries(want)) {
        const got = hdr(res, k);
        if (k.toLowerCase() === 'content-type') { if (!got.startsWith(String(v).split(';')[0])) bad.push(`${p} ${k}: ${got}`); continue; }
        if (got !== v) bad.push(`${p} ${k}: "${got}" ≠ "${v}"`);
      }
      const cc = hdr(res, 'cache-control');
      if ((cc.match(/max-age=/g) || []).length > 1) bad.push(`${p} Cache-Control 이 겹침: ${cc}`);
    }
    return { pass: !bad.length, detail: bad.length ? bad.slice(0, 6).join(' | ') : `${paths.length}개 경로 일치` };
  });
  await check('http.sw', '/sw.js: 빌드 정보 주입, no-cache, Service-Worker-Allowed', async () => {
    const res = await get('/sw.js');
    sw = await res.text();
    const m = /\/\*BN_BUILD\*\/(.*?)\/\*BN_BUILD_END\*\//s.exec(sw);
    try { swBuild = m ? JSON.parse(m[1]) : null; } catch { swBuild = null; }
    const miss = [];
    if (res.status() !== 200) miss.push(`status ${res.status()}`);
    if (!/javascript/.test(hdr(res, 'content-type'))) miss.push('content-type');
    if (!/no-cache/.test(hdr(res, 'cache-control'))) miss.push('no-cache');
    if (hdr(res, 'service-worker-allowed') !== '/') miss.push('Service-Worker-Allowed');
    if (!swBuild?.hash) miss.push('BUILD 없음 (빌드하지 않은 sw.js)');
    return { pass: !miss.length, detail: miss.length ? miss.join(', ') : `bn-${swBuild.hash}, 미리 받기 ${swBuild.precache.length}개` };
  });
  await check('http.build', 'build.json·build-info.js 가 같은 빌드', async () => {
    const res = await get('/build.json');
    build = await res.json().catch(() => null);
    const info = /<script src="(build-info\.js\?v=[^"]+)"/.exec(html)?.[1];
    const infoText = info ? await (await get('/' + info)).text() : '';
    const miss = [];
    if (!/no-cache/.test(hdr(res, 'cache-control'))) miss.push('build.json no-cache');
    if (!build?.buildHash) miss.push('build.json');
    else if (swBuild && build.buildHash !== swBuild.hash) miss.push(`hash ${build.buildHash} ≠ sw ${swBuild.hash}`);
    if (build && !infoText.includes(`"hash":"${build.buildHash}"`)) miss.push('build-info.js 해시');
    return { pass: !miss.length, detail: miss.length ? miss.join(', ') : `${build.version}, 파일 ${Object.keys(build.files).length}개` };
  });
  await check('http.precache', '서비스 워커 미리 받기 목록이 모두 200', async () => {
    if (!swBuild) return { pass: false, detail: 'sw BUILD 없음' };
    const bad = [];
    for (const u of [...swBuild.precache, ...(swBuild.assets || [])]) {
      const res = await req.head('/' + u, { failOnStatusCode: false, maxRedirects: 0 });
      if (res.status() !== 200) bad.push(`${u} ${res.status()}`);
    }
    return { pass: !bad.length, detail: bad.length ? bad.slice(0, 6).join(', ') : `${swBuild.precache.length + (swBuild.assets || []).length}개` };
  });
  await check('http.bundle', 'main 조각: JS, 1년 캐시(immutable), brotli', async () => {
    const main = /<script type="module" src="([^"]+)"/.exec(html)?.[1];
    if (!main) return { pass: false, detail: 'index.html 에 모듈 스크립트 없음' };
    const res = await get('/' + main);
    const miss = [];
    if (res.status() !== 200) miss.push(`status ${res.status()}`);
    if (!/javascript/.test(hdr(res, 'content-type'))) miss.push('content-type ' + hdr(res, 'content-type'));
    if (/src\/bundle\//.test(main) && !/immutable/.test(hdr(res, 'cache-control'))) miss.push('Cache-Control ' + hdr(res, 'cache-control'));
    if (!/br|gzip/.test(hdr(res, 'content-encoding'))) miss.push('압축 없음 (' + (hdr(res, 'content-encoding') || '-') + ')');
    const pre = /<link rel="modulepreload" href="([^"]+)"/.exec(html)?.[1];
    if (pre !== main) miss.push('modulepreload');
    return { pass: !miss.length, detail: miss.length ? miss.join(', ') : `${main} (${hdr(res, 'content-encoding')})` };
  });
  await check('http.assets', '그림·매니페스트·robots', async () => {
    const miss = [];
    const t = await get('/assets/bg/title.webp');
    if (t.status() !== 200 || !/image\/webp/.test(hdr(t, 'content-type'))) miss.push(`bg/title ${t.status()} ${hdr(t, 'content-type')}`);
    if (!/must-revalidate|no-cache/.test(hdr(t, 'cache-control'))) miss.push('bg/title Cache-Control ' + hdr(t, 'cache-control'));
    const lo = build?.files?.['assets/lo/bg/title.webp'];
    if (lo) { const l = await req.head('/assets/lo/bg/title.webp', { failOnStatusCode: false }); if (l.status() !== 200) miss.push('lo/bg/title ' + l.status()); }
    const m = await get('/manifest.webmanifest');
    if (m.status() !== 200 || !/manifest\+json/.test(hdr(m, 'content-type'))) miss.push(`manifest ${m.status()} ${hdr(m, 'content-type')}`);
    const r = await get('/robots.txt');
    if (r.status() !== 200) miss.push('robots.txt ' + r.status());
    return { pass: !miss.length, detail: miss.length ? miss.join(', ') : 'ok' };
  });
  await check('http.private', '공개 금지 파일이 모두 404', async () => {
    const leaked = [];
    const all = [...PRIVATE];
    if (build?.bundle) all.push('/src/main.js', '/src/core/game.js');
    for (const p of all) {
      const res = await get(p);
      if (res.status() === 200) leaked.push(`${p} (200, ${hdr(res, 'content-length') || '?'} B)`);
    }
    return { pass: !leaked.length, detail: leaked.length ? '노출: ' + leaked.join(', ') : `${all.length}개 404` };
  });
  if (apk) {
    await check('http.apk', '/apk → 302 → APK (형식·첨부) + latest.json', async () => {
      const r = await get('/apk');
      const loc = hdr(r, 'location');
      if (r.status() !== 302 || !loc) return { pass: false, detail: `/apk ${r.status()} ${loc}` };
      const target = new URL(loc, origin);
      const a = await req.head(target.pathname, { failOnStatusCode: false, maxRedirects: 0 });
      const miss = [];
      if (a.status() !== 200) miss.push(`${target.pathname} ${a.status()}`);
      if (hdr(a, 'content-type') !== 'application/vnd.android.package-archive') miss.push('content-type ' + hdr(a, 'content-type'));
      if (!/attachment/.test(hdr(a, 'content-disposition'))) miss.push('content-disposition');
      const d = await get('/downloads/BloodNocturne.apk');
      if (![200, 301, 302].includes(d.status())) miss.push('/downloads/BloodNocturne.apk ' + d.status());
      const lj = await get('/downloads/latest.json');
      const j = await lj.json().catch(() => null);
      if (!j?.url || !j?.sha256) miss.push('latest.json');
      else if (new URL(j.url, origin + '/').pathname !== target.pathname) miss.push(`latest.json url ${j.url} ≠ ${target.pathname}`);
      return { pass: !miss.length, detail: miss.length ? miss.join(', ') : `${target.pathname} ${hdr(a, 'content-length')} B, ${j.versionName}/${j.versionCode}` };
    });
  }
  if (api) {
    await check('http.api', '/api/health = {ok:true}, no-store, 앱 출처 CORS', async () => {
      const r = await get('/api/health');
      const j = await r.json().catch(() => null);
      const miss = [];
      if (r.status() !== 200 || !j?.ok) miss.push(`health ${r.status()} ${JSON.stringify(j)?.slice(0, 80)}`);
      if (!/no-store/.test(hdr(r, 'cache-control'))) miss.push('no-store');
      const pre = await req.fetch('/api/health', { method: 'OPTIONS', headers: { Origin: APP_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' }, failOnStatusCode: false, maxRedirects: 0 });
      if (hdr(pre, 'access-control-allow-origin') !== APP_ORIGIN) miss.push(`CORS preflight ${pre.status()} ACAO=${hdr(pre, 'access-control-allow-origin') || '-'}`);
      return { pass: !miss.length, detail: miss.length ? miss.join(', ') : `api ${j.api ?? '?'}, CORS ${pre.status()}` };
    });
  }
  await req.dispose();

  // ── 브라우저 ──
  if (browser) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-smoke-'));
    let ctx;
    try {
      ctx = await chromium.launchPersistentContext(dir, { executablePath: CHROME, headless: true, proxy, viewport: { width: 1280, height: 720 }, args: ['--autoplay-policy=no-user-gesture-required'] });
      const open = async (u, wait = 0) => {
        const page = await ctx.newPage();
        const errs = [];
        const reqs = [];
        page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
        page.on('console', (m) => { if (m.type() === 'error' && !IGNORE_CONSOLE.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
        page.on('request', (r) => reqs.push(r.url()));
        await page.goto(origin + '/' + u, { timeout: 90000 });
        await page.waitForFunction(() => window.__game?.scenes?.length > 0 && !document.getElementById('boot'), null, { timeout: 90000, polling: 200 });
        if (wait) await page.waitForTimeout(wait);
        return { page, errs, reqs };
      };
      const t = await open('index.html', 1500);
      await check('page.title', '타이틀: 페이지 오류 0', async () => ({ pass: !t.errs.length, detail: t.errs.slice(0, 4).join(' | ') || `scene ${await t.page.evaluate(() => window.__game.top?.name)}` }));
      const swr = await t.page.evaluate(async () => {
        const reg = await Promise.race([navigator.serviceWorker?.ready, new Promise((r) => setTimeout(() => r(null), 60000))]);
        return reg ? { scope: reg.scope, active: !!reg.active } : null;
      });
      await check('page.sw', '서비스 워커 등록·활성', async () => ({ pass: !!swr?.active, detail: swr ? `scope ${swr.scope}` : '60초 안에 준비되지 않음' }));
      const cdp = await ctx.newCDPSession(t.page);
      const inst = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ installabilityErrors: [{ errorId: 'cdp:' + e.message }] }));
      const ierr = (inst.installabilityErrors || []).map((e) => e.errorId);
      await check('page.installable', '설치 가능 (매니페스트·아이콘·워커)', async () => ({ pass: ierr.length === 0, detail: ierr.join(', ') || '오류 없음' }));
      // 재방문: 워커가 페이지를 제어하고 /api/ 는 캐시에 없다
      await t.page.reload();
      await t.page.waitForFunction(() => window.__game?.scenes?.length > 0, null, { timeout: 90000 });
      const cacheInfo = await t.page.evaluate(async () => {
        try { await fetch('/api/qa-smoke-probe?x=1'); await fetch('/api/health'); } catch { /* 없음 */ }
        await new Promise((r) => setTimeout(r, 500));
        const hits = []; const names = await caches.keys();
        for (const k of names) { const c = await caches.open(k); for (const q of await c.keys()) if (/\/api\//.test(q.url)) hits.push(k + ' ' + q.url); }
        return { controlled: !!navigator.serviceWorker.controller, names, hits };
      });
      await check('page.sw.api', '재방문: 워커가 제어, /api/ 는 캐시에 없음', async () => ({ pass: cacheInfo.controlled && !cacheInfo.hits.length, detail: `controlled=${cacheInfo.controlled}, caches=[${cacheInfo.names.join(', ')}]${cacheInfo.hits.length ? ', /api 캐시: ' + cacheInfo.hits.join(', ') : ''}` }));
      await t.page.close();
      for (const [id, u, w] of [['page.hub', 'index.html?scene=hub', 2500], ['page.stage', 'index.html?scene=stage&stage=s01', 3000], ['page.boss', 'index.html?scene=stage&stage=s04&room=boss', 5000]]) {
        const p = await open(u, w).catch((e) => ({ errs: ['HARNESS ' + e.message], page: null, reqs: [] }));
        const lazy = p.reqs.filter((x) => /\/src\/bundle\/[^/]+\/lazy-\d+\.js/.test(x)).length;
        await check(id, `${u}: 페이지 오류 0`, async () => ({ pass: !p.errs.length, detail: p.errs.slice(0, 4).join(' | ') || (p.page ? `scene ${await p.page.evaluate(() => (window.__game?.scenes || []).map((s) => s.name).join('>'))}${lazy ? `, lazy 조각 ${lazy}개` : ''}` : '') }));
        await p.page?.close();
      }
    } finally {
      await ctx?.close().catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const failed = results.filter((r) => !r.pass && !r.skip);
  return { origin, when: new Date().toISOString(), pass: failed.length === 0, failed: failed.map((r) => r.id), results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs();
  let base = a._[0], srv = null;
  if (a.local || !base) {
    const { start } = await import('./serve_dist.mjs');
    srv = await start(0, { quiet: true, dir: a.dir ? path.resolve(ROOT, a.dir) : undefined });
    base = srv.origin;
  }
  let rep;
  try {
    rep = await smoke(base, { browser: !a['no-browser'], apk: !a['no-apk'], api: !(a['no-api'] || (srv && !a.api)) });
  } finally { await srv?.close(); }
  const host = new URL(base).host.replace(/[^a-z0-9.-]/gi, '_');
  mkdirp(path.join(ROOT, 'dist'));
  const out = path.join(ROOT, `dist/smoke_${srv ? 'local' : host}.json`);
  fs.writeFileSync(out, JSON.stringify(rep, null, 1) + '\n');
  console.log(`\n${rep.pass ? '통과' : '실패'}: ${rep.results.filter((r) => r.pass).length}/${rep.results.length}${rep.failed.length ? ' — ' + rep.failed.join(', ') : ''} (보고: ${path.relative(ROOT, out)})`);
  process.exit(rep.pass ? 0 : 1);
}
