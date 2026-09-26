// APK 헤드리스 검증: APK 를 풀어서 assets/www 를 안드로이드 앱과 똑같은 가상 출처
// (https://appassets.androidplatform.net/…)로 제공하고, 실제 게임이 부팅·동작하는지 확인한다.
//
//   node tools/apk/verify_apk.mjs [dist/BloodNocturne.apk] [--out 스크린샷폴더] [--keep]
//
// 에뮬레이션 내용 (android/app/src/main/java/com/bloodnocturne/game/AssetServer.java 와 동일하게):
//   - MIME 표를 AssetServer.java 의 MIME.put(...) 에서 그대로 읽어 쓴다 (.js → text/javascript 등)
//   - 쿼리 문자열 무시, 경로 정규화, 없는 파일 404, index.html 에 assets/app/head_inject.html 삽입
//   - window.BNAndroid (JS 브리지) 스텁, 외부 네트워크 차단(오프라인 기기와 동일 조건)
//   - 뒤로 버튼 처리 스크립트(BACK_PROBE_JS / ESCAPE_JS)를 MainActivity.java 에서 읽어 실제로 실행해 본다
// 실패 항목이 있으면 종료 코드 1.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const apkPath = path.resolve(argv.find((a, i) => !a.startsWith('--') && !['--out'].includes(argv[i - 1])) || path.join(ROOT, 'dist/BloodNocturne.apk'));
const outDir = path.resolve(opt('--out') || path.join(os.tmpdir(), 'bn-apk-verify'));
const keep = argv.includes('--keep');
const HOST = 'appassets.androidplatform.net';
const ORIGIN = `https://${HOST}`;
const JAVA_DIR = path.join(ROOT, 'android/app/src/main/java/com/bloodnocturne/game');
const CHROME = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

if (!fs.existsSync(apkPath)) { console.error('APK 가 없습니다: ' + apkPath); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

// ── 1. APK 풀기 ──────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-apk-'));
execFileSync('unzip', ['-q', '-o', apkPath, 'assets/*', '-d', tmp]);
const WWW = path.join(tmp, 'assets/www');
check('APK 에 assets/www/index.html 존재', fs.existsSync(path.join(WWW, 'index.html')));

// ── 2. 자바 소스에서 MIME 표 · 뒤로 버튼 스크립트 읽기 ─────────────────
const serverSrc = fs.readFileSync(path.join(JAVA_DIR, 'AssetServer.java'), 'utf8');
const MIME = Object.fromEntries([...serverSrc.matchAll(/MIME\.put\("([\w]+)",\s*"([^"]+)"\)/g)].map((m) => [m[1], m[2]]));
check('AssetServer.java MIME 표 파싱', Object.keys(MIME).length > 20, `${Object.keys(MIME).length}개`);
check('.js → text/javascript', MIME.js === 'text/javascript');
const actSrc = fs.readFileSync(path.join(JAVA_DIR, 'MainActivity.java'), 'utf8');
const javaConst = (name) => {
  const m = actSrc.match(new RegExp(`String ${name}\\s*=\\s*([\\s\\S]*?);\\n`));
  if (!m) return null;
  return [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse(`"${x[1]}"`)).join('');
};
const BACK_PROBE_JS = javaConst('BACK_PROBE_JS');
const ESCAPE_JS = javaConst('ESCAPE_JS');
check('MainActivity.java 뒤로 버튼 스크립트 파싱', BACK_PROBE_JS && ESCAPE_JS);

// 모든 게임 파일 확장자가 MIME 표에 있는지 (없으면 WebView 가 application/octet-stream 으로 받음)
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(WWW);
const exts = [...new Set(files.map((f) => path.extname(f).slice(1).toLowerCase()))].sort();
const unknown = exts.filter((e) => !MIME[e]);
check('모든 파일 확장자에 MIME 지정', unknown.length === 0, `확장자 ${exts.join(', ')}${unknown.length ? ' / 미지정: ' + unknown.join(', ') : ''}`);
const totalBytes = files.reduce((s, f) => s + fs.statSync(f).size, 0);
console.log(`  게임 파일 ${files.length}개, ${(totalBytes / 1048576).toFixed(1)} MB`);

const injectRaw = fs.readFileSync(path.join(tmp, 'assets/app/head_inject.html'), 'utf8');
const inject = injectRaw.replace('{{VERSION}}', 'verify');

// AssetServer.serve() 와 같은 규칙
const normalize = (p) => {
  const out = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); continue; }
    out.push(seg);
  }
  return out.join('/');
};
const isText = (m) => m.startsWith('text/') || m.endsWith('json') || m.endsWith('xml') || m === 'image/svg+xml';
const served = []; const missing = []; const external = [];
async function handle(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (u.protocol !== 'https:' || u.host !== HOST) { external.push(u.href); return route.abort('internetdisconnected'); }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const rel = normalize(p);
  if (!rel) return route.fulfill({ status: 403, body: '403 Forbidden' });
  const f = path.join(WWW, rel);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { missing.push(rel); return route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: '404 Not Found' }); }
  const ext = path.extname(rel).slice(1).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  let body = fs.readFileSync(f);
  if (rel === 'index.html') {
    const s = body.toString('utf8');
    const at = s.toLowerCase().indexOf('</head>');
    if (at >= 0) body = Buffer.from(s.slice(0, at) + inject + s.slice(at), 'utf8');
  }
  served.push(rel);
  return route.fulfill({ status: 200, contentType: isText(mime) ? `${mime}; charset=utf-8` : mime, headers: { 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' }, body });
}

// ── 3. 브라우저 (안드로이드 WebView 흉내: 모바일·터치·가로) ──────────────
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 BloodNocturneApp/verify';
const bridgeStub = () => {
  window.__bnCalls = [];
  window.BNAndroid = {
    isApp: () => true,
    version: () => 'verify',
    exitApp: () => window.__bnCalls.push(['exitApp']),
    vibrate: (j) => window.__bnCalls.push(['vibrate', j]),
  };
};

async function openPage(ctx, url, tag) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_INTERNET_DISCONNECTED|fonts\.g/.test(t)) return; // 404 · 외부 폰트 차단은 별도 집계
    errs.push('CONSOLE ' + t.slice(0, 300));
  });
  await page.goto(url, { timeout: 45000, waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.scenes && window.__game.scenes.length > 0, null, { timeout: 30000 });
  page.__errs = errs; page.__tag = tag;
  return page;
}

const canvasStats = (page) => page.evaluate(() => {
  const c = document.getElementById('screen');
  const x = c.getContext('2d');
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let lit = 0, n = 0; const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) { n++; const s = d[i] + d[i + 1] + d[i + 2]; if (s > 40) lit++; seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4)); }
  return { w: c.width, h: c.height, litPct: Math.round((lit / n) * 100), colors: seen.size };
});

let failed = false;
try {
  // (a) 휴대폰 가로 화면 — 타이틀 부팅 · 앱 전용 조각 · 뒤로 버튼
  const phone = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA, serviceWorkers: 'allow' });
  await phone.addInitScript(bridgeStub);
  await phone.route('**/*', handle);
  const t0 = Date.now();
  const page = await openPage(phone, `${ORIGIN}/index.html`, 'title');
  const bootMs = Date.now() - t0;
  await page.waitForFunction(() => window.__game?.top?.name === 'title', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => ({
    scene: window.__game?.top?.name,
    app: window.__BN_APP,
    cls: document.documentElement.className,
    fsBtn: (() => { const b = document.getElementById('fsBtn'); return b ? getComputedStyle(b).display : 'absent'; })(),
    touch: !!window.__game?.input?.touchMode || document.body.classList.contains('touch'),
    origin: location.origin,
    secure: window.isSecureContext,
  }));
  check('타이틀 장면까지 부팅', st.scene === 'title', `${bootMs}ms, scene=${st.scene}`);
  check('가상 https 출처 · 보안 컨텍스트', st.origin === ORIGIN && st.secure, st.origin);
  check('앱 전용 조각 삽입 (__BN_APP, bn-android 클래스)', st.app?.platform === 'android' && /bn-android/.test(st.cls));
  check('브라우저 전체화면 버튼 숨김', st.fsBtn === 'none' || st.fsBtn === 'absent', st.fsBtn);
  check('터치 모드 활성', st.touch);
  const cs = await canvasStats(page);
  check('캔버스에 그림이 그려짐', cs.litPct > 3 && cs.colors > 12, `${cs.w}x${cs.h}, 밝은 픽셀 ${cs.litPct}%, 색 ${cs.colors}`);
  await page.screenshot({ path: path.join(outDir, 'apk_title_phone.png') });

  // 서비스 워커는 앱에서 등록되지 않아야 함
  const sw = await page.evaluate(async () => {
    if (!navigator.serviceWorker) return 'none';
    let err = null;
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { err = String(e.message || e); }
    const regs = await navigator.serviceWorker.getRegistrations();
    return { regs: regs.length, err };
  });
  check('서비스 워커 비활성 (파일 제공을 가로채지 않음)', sw === 'none' || (sw.regs === 0 && sw.err), JSON.stringify(sw));

  // 진동 → 네이티브 브리지
  const vib = await page.evaluate(() => { navigator.vibrate(30); navigator.vibrate([10, 20, 30]); return window.__bnCalls.filter((c) => c[0] === 'vibrate').map((c) => c[1]); });
  check('navigator.vibrate → BNAndroid.vibrate', vib.length === 2 && vib[0] === '30' && vib[1] === '[10,20,30]', JSON.stringify(vib));

  // localStorage (세이브) 가 같은 출처에서 유지되는지
  await page.evaluate(() => localStorage.setItem('__bn_verify', 'ok'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.scenes.length > 0, null, { timeout: 30000 });
  check('새로고침 후 localStorage 유지', (await page.evaluate(() => localStorage.getItem('__bn_verify'))) === 'ok');
  await page.evaluate(() => localStorage.removeItem('__bn_verify'));

  // 뒤로 버튼: 타이틀(인트로/대기) → 'exit', Escape 로 메뉴 진입 후 → 'esc'
  await page.waitForFunction(() => window.__game?.top?.name === 'title', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const probe1 = await page.evaluate(BACK_PROBE_JS);
  check('뒤로 버튼(타이틀) → 종료 확인', probe1 === 'exit', `probe=${probe1}`);
  let mode = null;
  for (let i = 0; i < 4 && mode !== 'menu'; i++) {
    await page.evaluate(ESCAPE_JS);
    await page.waitForTimeout(700);
    mode = await page.evaluate(() => window.__game?.top?.mode);
  }
  const probe2 = await page.evaluate(BACK_PROBE_JS);
  check('ESCAPE_JS 가 게임 입력에 전달됨 (타이틀 메뉴 열림)', mode === 'menu', `title.mode=${mode}`);
  check('뒤로 버튼(타이틀 메뉴) → Escape 전달', probe2 === 'esc', `probe=${probe2}`);
  await page.evaluate(ESCAPE_JS);
  await page.waitForTimeout(700);
  const mode2 = await page.evaluate(() => window.__game?.top?.mode);
  check('Escape 로 타이틀 메뉴 닫힘', mode2 !== 'menu', `title.mode=${mode2}`);
  await page.screenshot({ path: path.join(outDir, 'apk_title_menu_phone.png') });
  check('타이틀 페이지 오류 없음', page.__errs.length === 0, page.__errs.slice(0, 5).join(' | '));
  await phone.close();

  // (b) 스테이지 직접 진입 — 이동 · 공격 입력, 일시정지 메뉴
  const phone2 = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA });
  await phone2.addInitScript(bridgeStub);
  await phone2.route('**/*', handle);
  const sp = await openPage(phone2, `${ORIGIN}/index.html?scene=stage&stage=s01`, 'stage');
  await sp.waitForFunction(() => !!window.__game?.world?.player, null, { timeout: 30000 }).catch(() => {});
  await sp.waitForTimeout(2500);
  // 스토리 대화 넘기기 (맨 위 장면이 stage 가 될 때까지 확인 키)
  const clearDialogue = async () => {
    for (let i = 0; i < 40; i++) {
      const top = await sp.evaluate(() => window.__game?.top?.name);
      if (top === 'stage') return true;
      await sp.keyboard.down('Enter'); await sp.waitForTimeout(90); await sp.keyboard.up('Enter'); await sp.waitForTimeout(350);
    }
    return false;
  };
  await clearDialogue();
  await sp.waitForTimeout(600);
  const x0 = await sp.evaluate(() => window.__game?.world?.player?.x ?? null);
  for (const [k, ms] of [['ArrowRight', 900], ['KeyX', 120], ['KeyX', 120], ['KeyZ', 200], ['ArrowRight', 600]]) {
    await sp.keyboard.down(k); await sp.waitForTimeout(ms); await sp.keyboard.up(k); await sp.waitForTimeout(60);
  }
  const s1 = await sp.evaluate(() => ({ x: window.__game?.world?.player?.x, hp: window.__game?.world?.player?.hp, scene: window.__game?.top?.name, stage: window.__game?.world?.stage?.id }));
  check('스테이지 s01 로드 · 플레이어 이동', x0 != null && s1.x > x0 + 20, `x ${Math.round(x0)}→${Math.round(s1.x)}, scene=${s1.scene}`);
  await sp.screenshot({ path: path.join(outDir, 'apk_stage_phone.png') });
  await clearDialogue();
  await sp.waitForTimeout(500);
  const probe3 = await sp.evaluate(BACK_PROBE_JS);
  check('뒤로 버튼(스테이지) → Escape 전달', probe3 === 'esc', `probe=${probe3}`);
  await sp.evaluate(ESCAPE_JS);
  await sp.waitForTimeout(800);
  const paused = await sp.evaluate(() => window.__game?.scenes.map((s) => s.name).join('>'));
  check('Escape 로 일시정지 메뉴 열림', paused && paused.split('>').length > 1 && paused.startsWith('stage'), paused);
  await sp.screenshot({ path: path.join(outDir, 'apk_stage_pause_phone.png') });
  await sp.evaluate(ESCAPE_JS);
  await sp.waitForTimeout(800);
  const resumed = await sp.evaluate(() => window.__game?.scenes.map((s) => s.name).join('>'));
  check('Escape 다시 → 게임으로 복귀', resumed === 'stage', resumed);
  check('스테이지 페이지 오류 없음', sp.__errs.length === 0, sp.__errs.slice(0, 5).join(' | '));
  await phone2.close();

  // (c) 태블릿/크롬북 크기
  const tab = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA });
  await tab.addInitScript(bridgeStub);
  await tab.route('**/*', handle);
  const tp = await openPage(tab, `${ORIGIN}/index.html?scene=hub`, 'hub');
  await tp.waitForTimeout(2500);
  const hub = await tp.evaluate(() => window.__game?.top?.name);
  check('허브(마을) 장면 로드 (태블릿)', hub === 'hub', hub);
  await tp.screenshot({ path: path.join(outDir, 'apk_hub_tablet.png') });
  check('허브 페이지 오류 없음', tp.__errs.length === 0, tp.__errs.slice(0, 5).join(' | '));
  await tab.close();
} catch (e) {
  check('검증 실행', false, e.message);
}
await browser.close();

const uniqMissing = [...new Set(missing)];
const uniqExternal = [...new Set(external.map((u) => new URL(u).host))];
console.log(`  제공한 요청 ${served.length}건, 404 ${uniqMissing.length}종${uniqMissing.length ? ': ' + uniqMissing.slice(0, 12).join(', ') : ''}`);
console.log(`  차단한 외부 호스트: ${uniqExternal.join(', ') || '없음'}`);
const essential404 = uniqMissing.filter((p) => /\.(js|mjs|css|html|json|webmanifest)$/.test(p));
check('필수 코드 파일 404 없음 (.js/.css/.html/.json)', essential404.length === 0, essential404.join(', '));
fs.writeFileSync(path.join(outDir, 'apk_verify_report.json'), JSON.stringify({ apk: apkPath, results, missing: uniqMissing, external: uniqExternal }, null, 1));
if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
failed = results.some((r) => !r.ok);
console.log(failed ? `\n✗ 실패 ${results.filter((r) => !r.ok).length}건 (스크린샷·보고서: ${outDir})` : `\n✓ 전체 통과 ${results.length}건 (스크린샷·보고서: ${outDir})`);
process.exit(failed ? 1 : 0);
