#!/usr/bin/env node
// 서비스 워커 시험 — owner: DELIVERY-WEB (platform §9.3, §11 WP-8 acceptance 4·5, P-10)
//
//   node tools/deploy/test_sw.mjs [--dir dist/web]
//
// dist/web 을 serve_dist 로 띄워 헤드리스 Chromium 에서:
//  1. 첫 방문 → 워커 설치·활성, bn-<buildHash> 에 미리 받기 목록 전부, bn-assets-v1 에 타이틀 배경·리그 JSON (해시 표시 x-bn-h)
//  2. /api/ 요청은 어떤 캐시에도 들어가지 않는다 (P-10)
//  3. 오프라인 새로고침 (서버를 내려서 워커의 fetch 도 진짜로 실패하게 — context.setOffline 은 워커의 fetch 를 막지 않는다):
//     타이틀이 뜨고, 마을이 돌고, 스테이지 s01 이 돈다 (페이지 오류 0)
//  4. 새 빌드(내용이 바뀐 리그 JSON·fonts.json·build-info.js, 새 BUILD 해시)를 같은 주소에서 내보낸다:
//     페이지 이동은 네트워크 우선이라 새로고침한 페이지는 곧바로 새 빌드로 돈다 → 아직 제어 중인 옛 워커가 그 페이지에
//     옛 캐시의 리그·fonts.json 이 아니라 새 것을 준다 (새 코드 + 옛 그림 섞임 방지).
//     update(): 새 워커는 설치된 뒤 대기한다 (SKIP_WAITING 전에는 켜지지 않음, 옛 워커가 계속 제어) → platform.updateReady() true
//  5. game.platform.applyUpdate() → SKIP_WAITING → 새로고침 → 옛 bn-<hash> 캐시 삭제, 바뀐 그림(리그)은 옛 해시로 남지 않고,
//     바뀌지 않은 그림(타이틀 배경)은 캐시에 그대로 남는다 (다시 받지 않음)
// 보고: dist/test_sw.json
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { ROOT, walk, rmrf, mkdirp, parseArgs } from './lib/util.mjs';
import { start } from './serve_dist.mjs';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const IGNORE = /Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR_/;

const a = parseArgs();
const A = path.resolve(ROOT, a.dir || 'dist/web');
const B = path.join(ROOT, 'dist/.swtest-b');
const results = [];
const check = (id, pass, detail) => { results.push({ id, pass: !!pass, detail }); console.log(`${pass ? '✓' : '✗'} ${id}${detail ? ' — ' + detail : ''}`); };

// 새 배포에서 바뀌는 파일: 그림 쪽(assets/, 경로 키 캐시)과 해시 없는 주소로 부르는 글꼴 목록(fonts.json)
const RIG = 'assets/puppets/kael/kael_hunter/rig.json';
const FONTS = 'assets/fonts/fonts.json';
const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
function makeNextBuild() {
  rmrf(B);
  for (const rel of walk(A)) {
    const dst = path.join(B, rel);
    mkdirp(path.dirname(dst));
    try { fs.linkSync(path.join(A, rel), dst); } catch { fs.copyFileSync(path.join(A, rel), dst); }
  }
  const put = (rel, data) => { fs.rmSync(path.join(B, rel), { force: true }); fs.writeFileSync(path.join(B, rel), data); return { hash8: hash8(data), bytes: Buffer.byteLength(data) }; };
  const sw = fs.readFileSync(path.join(A, 'sw.js'), 'utf8');
  const m = /\/\*BN_BUILD\*\/(.*?)\/\*BN_BUILD_END\*\//s.exec(sw);
  const build = JSON.parse(m[1]);
  const hash = build.hash.slice(0, -4) + 'b0b0';
  const bj = JSON.parse(fs.readFileSync(path.join(A, 'build.json'), 'utf8'));
  bj.buildHash = hash;
  // 내용이 바뀐 파일 ("새 배포에서 다시 만든 리그", "글꼴 목록")
  const rigB = Buffer.from(JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(A, RIG), 'utf8')), __swtest: 'next' }));
  bj.files[RIG] = put(RIG, rigB);
  const fontsB = Buffer.from(JSON.stringify([...JSON.parse(fs.readFileSync(path.join(A, FONTS), 'utf8')), { __swtest: 'next' }]));
  bj.files[FONTS] = put(FONTS, fontsB);
  // 새 build-info.js (다른 해시) → index.html·미리 받기 목록의 주소도 바뀐다
  const infoB = fs.readFileSync(path.join(A, 'build-info.js'), 'utf8').replace(`"hash":"${build.hash}"`, `"hash":"${hash}"`);
  bj.files['build-info.js'] = put('build-info.js', infoB);
  const infoUrlA = build.precache.find((u) => /^build-info\.js\?v=/.test(u));
  const infoUrlB = `build-info.js?v=${hash8(infoB)}`;
  bj.files['index.html'] = put('index.html', fs.readFileSync(path.join(A, 'index.html'), 'utf8').replace(infoUrlA, infoUrlB));
  const next = { ...build, hash, manifest: `build.json?v=${hash}`, precache: build.precache.map((u) => (u === infoUrlA ? infoUrlB : u)) };
  bj.files['sw.js'] = put('sw.js', sw.replace(m[0], `/*BN_BUILD*/${JSON.stringify(next)}/*BN_BUILD_END*/`));
  put('build.json', JSON.stringify(bj));
  return { old: build, next, rigHash: bj.files[RIG].hash8 };
}

let srv = await start(0, { dir: A, quiet: true });
const port = srv.port;
const origin = srv.origin;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const errs = [];
const watch = (page) => {
  page.on('pageerror', (e) => errs.push(`${page.url().split('/').pop()} PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errs.push(`${page.url().split('/').pop()} CONSOLE ${m.text().slice(0, 200)}`); });
};
// 문자열 조건은 페이지에서 eval 되어 CSP(script-src 'self')에 막힌다 → 함수 + 인자로 넘긴다
const waitGame = (page, want = {}) => page.waitForFunction((w) => {
  const g = window.__game;
  if (!g || !g.scenes.length || document.getElementById('boot')) return false;
  if (w.top && g.top?.name !== w.top) return false;
  if (w.worldTime && !(g.world && g.world.time > w.worldTime)) return false;
  return true;
}, want, { timeout: 90000, polling: 200 });
let exit = 1;
try {
  const swText = fs.readFileSync(path.join(A, 'sw.js'), 'utf8');
  const build = JSON.parse(/\/\*BN_BUILD\*\/(.*?)\/\*BN_BUILD_END\*\//s.exec(swText)[1]);
  const page = await ctx.newPage();
  watch(page);
  await page.goto(`${origin}/index.html`);
  await waitGame(page);
  // 1. 설치·활성·미리 받기
  const st1 = await page.evaluate(async ([hash, rig]) => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 90000))]);
    for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100));
    const names = await caches.keys();
    const code = names.includes(`bn-${hash}`) ? (await (await caches.open(`bn-${hash}`)).keys()).map((r) => new URL(r.url).pathname + new URL(r.url).search) : [];
    const ac = await caches.open('bn-assets-v1');
    const title = await ac.match(new URL('assets/bg/title.webp', location.href).href);
    // 리그 JSON 을 한 번 받아 둔다 (이 빌드의 해시로 그림 캐시에 들어가야 한다 — 4·5 단계가 이것이 낡은 채 남지 않는지 본다)
    await (await fetch(rig)).text();
    let rigHit = null;
    for (let i = 0; i < 30 && !rigHit; i++) { await new Promise((r) => setTimeout(r, 100)); rigHit = await ac.match(new URL(rig, location.href).href); }
    return { active: !!reg?.active, controlled: !!navigator.serviceWorker.controller, names, code, titleHash: title?.headers.get('x-bn-h') || null, rigHash: rigHit?.headers.get('x-bn-h') || null };
  }, [build.hash, RIG]);
  check('install.active', st1.active && st1.controlled, `active=${st1.active}, controlled=${st1.controlled} (clients.claim)`);
  const missing = build.precache.filter((u) => !st1.code.includes('/' + u));
  check('install.precache', !missing.length && st1.code.includes('/build.json'), missing.length ? `빠짐: ${missing.slice(0, 5).join(', ')}` : `bn-${build.hash}: ${st1.code.length}개 (build.json 포함)`);
  const bj = JSON.parse(fs.readFileSync(path.join(A, 'build.json'), 'utf8'));
  check('install.assets', st1.titleHash && st1.titleHash === bj.files['assets/bg/title.webp']?.hash8 && st1.rigHash === bj.files[RIG]?.hash8,
    `bg/title x-bn-h=${st1.titleHash}, 리그 x-bn-h=${st1.rigHash} (build.json ${bj.files[RIG]?.hash8})`);
  // 2. /api 는 캐시하지 않는다
  const apiHits = await page.evaluate(async () => {
    for (const u of ['/api/qa-probe?x=1', '/api/health', '/api/auth/me']) { try { await fetch(u); await fetch(u); } catch { /* 404 */ } }
    await new Promise((r) => setTimeout(r, 400));
    const hits = [];
    for (const k of await caches.keys()) { const c = await caches.open(k); for (const q of await c.keys()) if (/\/api\//.test(q.url)) hits.push(k + ' ' + q.url); }
    return hits;
  });
  check('api.never-cached', apiHits.length === 0, apiHits.join(', ') || '어느 캐시에도 없음');
  // 재방문 (캐시 우선): 코드 요청이 네트워크로 가지 않는다
  const netCode = [];
  const onReq = (r) => { if (/\/src\/bundle\//.test(r.url()) && !r.serviceWorker?.()) netCode.push(r.url()); };
  srv.server.on('request', (req) => { if (/\/src\/bundle\//.test(req.url)) netCode.push(req.url); });
  await page.reload();
  await waitGame(page);
  check('revisit.cache-first', netCode.length === 0, netCode.length ? `서버로 간 번들 요청 ${netCode.length}개` : '번들은 모두 워커 캐시에서');
  void onReq;
  // 3. 오프라인: 서버를 내린다 (context.setOffline 만으로는 워커의 fetch 가 여전히 서버에 닿는다)
  await srv.close();
  await ctx.setOffline(true);
  const e0 = errs.length;
  await page.reload();
  await waitGame(page, { top: 'title' });
  check('offline.title', errs.length === e0, errs.slice(e0).join(' | ') || '타이틀 표시');
  await page.goto(`${origin}/index.html?scene=hub`);
  await waitGame(page, { top: 'hub' });
  await page.waitForTimeout(2500);
  const hub = await page.evaluate(() => ({ top: window.__game.top?.name, t: window.__game.world?.time ?? null }));
  check('offline.hub', hub.top === 'hub' && errs.length === e0, `${JSON.stringify(hub)} ${errs.slice(e0).join(' | ')}`);
  await page.goto(`${origin}/index.html?scene=stage&stage=s01`);
  await waitGame(page, { worldTime: 1 });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1200); await page.keyboard.up('ArrowRight');
  const stg = await page.evaluate(() => ({ top: window.__game.top?.name, room: window.__game.world?.roomId, x: Math.round(window.__game.world?.player?.x ?? -1) }));
  check('offline.stage', /stage|dialogue/.test(stg.top) && errs.length === e0, `${JSON.stringify(stg)} ${errs.slice(e0).join(' | ')}`);
  await ctx.setOffline(false);
  srv = await start(port, { dir: A, quiet: true });
  // 4. 새 빌드 → (옛 워커가 제어하는) 새 빌드 페이지 → 대기
  await page.goto(`${origin}/index.html`);
  await waitGame(page, { top: 'title' });
  const { next, rigHash: rigNextHash } = makeNextBuild();
  await srv.close();
  srv = await start(port, { dir: B, quiet: true });
  await page.reload();
  await waitGame(page, { top: 'title' });
  const st4a = await page.evaluate(async ([oldHash, rig, fonts]) => {
    const rigText = await (await fetch(rig)).text();
    const fontsText = await (await fetch(new URL(fonts, location.href).href)).text();
    const names = await caches.keys();
    return { build: window.__BN_BUILD?.hash, controlled: !!navigator.serviceWorker.controller, oldCache: names.includes(`bn-${oldHash}`), rigNext: rigText.includes('__swtest'), fontsNext: fontsText.includes('__swtest') };
  }, [build.hash, RIG, FONTS]);
  check('next.page', st4a.build === next.hash && st4a.controlled && st4a.oldCache && st4a.rigNext && st4a.fontsNext,
    `페이지 빌드 ${st4a.build} (새 ${next.hash}), 옛 워커 제어=${st4a.controlled}, 새 리그=${st4a.rigNext}, 새 fonts.json=${st4a.fontsNext}`);
  const st4 = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.update();
    for (let i = 0; i < 300 && !reg.waiting; i++) await new Promise((r) => setTimeout(r, 200));
    await new Promise((r) => setTimeout(r, 3000)); // 저절로 켜지지 않는지 3초 더 본다
    return { waiting: !!reg.waiting, activeUrl: reg.active?.scriptURL, names: await caches.keys(), ready: !!window.__game.platform?.updateReady?.() };
  });
  check('update.waiting', st4.waiting && st4.names.includes(`bn-${build.hash}`) && st4.names.includes(`bn-${next.hash}`), `waiting=${st4.waiting}, caches=[${st4.names.join(', ')}]`);
  check('update.prompt', st4.ready, `platform.updateReady()=${st4.ready} (타이틀 [업데이트])`);
  // 5. 적용
  const nav = page.waitForNavigation({ timeout: 30000 }).catch(() => null);
  await page.evaluate(() => window.__game.platform.applyUpdate());
  await nav;
  await waitGame(page);
  const st5 = await page.evaluate(async (rig) => {
    for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100));
    const names = await caches.keys();
    const ac = await caches.open('bn-assets-v1');
    const title = await ac.match(new URL('assets/bg/title.webp', location.href).href);
    const rigHit = await ac.match(new URL(rig, location.href).href);
    const rigText = await (await fetch(rig)).text();
    return { names, build: window.__BN_BUILD?.hash, titleHash: title?.headers.get('x-bn-h') || null, rigHash: rigHit?.headers.get('x-bn-h') || null, rigNext: rigText.includes('__swtest') };
  }, RIG);
  check('update.old-cache-deleted', st5.build === next.hash && !st5.names.includes(`bn-${build.hash}`) && st5.names.includes(`bn-${next.hash}`), `build ${st5.build}, caches=[${st5.names.join(', ')}]`);
  check('update.asset-invalidated', st5.rigNext && (st5.rigHash === null || st5.rigHash === rigNextHash),
    `바뀐 리그: 캐시 x-bn-h=${st5.rigHash} (새 ${rigNextHash}, 옛 ${st1.rigHash} 이면 낡은 그림), 받은 내용 새 것=${st5.rigNext}`);
  check('update.asset-kept', st5.titleHash === st1.titleHash, `바뀌지 않은 bg/title: x-bn-h=${st5.titleHash} (그대로 ${st1.titleHash} 이어야 다시 받지 않는다)`);
  check('errors', errs.length === 0, errs.slice(0, 6).join(' | ') || '페이지 오류 0');
  exit = results.every((r) => r.pass) ? 0 : 1;
} catch (e) {
  check('harness', false, e.stack || e.message);
} finally {
  await browser.close().catch(() => {});
  await srv.close().catch(() => {});
  rmrf(B);
}
fs.writeFileSync(path.join(ROOT, 'dist/test_sw.json'), JSON.stringify({ when: new Date().toISOString(), pass: exit === 0, results }, null, 1) + '\n');
console.log(`\n${exit === 0 ? '통과' : '실패'}: ${results.filter((r) => r.pass).length}/${results.length}`);
process.exit(exit);
