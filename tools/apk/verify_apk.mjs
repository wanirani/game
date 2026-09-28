// APK 검증: APK 를 풀어서 assets/www 를 안드로이드 앱과 똑같은 가상 출처(https://appassets.androidplatform.net/…)로 제공하고,
// 실제 게임이 부팅·동작하는지, 네이티브 브리지·/api 프록시가 약속대로 동작하는지 확인한다 (platform §9.4, WP-9 acceptance).
//
//   node tools/apk/verify_apk.mjs [dist/BloodNocturne.apk] [--out 스크린샷폴더] [--web dist/web] [--keep] [--skip-java]
//
// 1. 내용물: APK assets/www = dist/web − sw.js − downloads/ − _redirects (해시 비교). 휴대폰 밀도(lo)면 빠진 원본마다 lo/ 사본이 있어야 한다.
//    assets/app/apk.json (계정 서버 주소·에셋 단계), 모든 파일 확장자가 AssetServer.java 의 MIME 표에 있는지.
// 2. 네이티브 소스 정적 검사: WebView 관문(98), 브리지(insets/ime/rumble/apiStash), 권한, head_inject 조각.
// 3. /api 프록시 (자바): ApiProxy.java 를 호스트 JVM 으로 컴파일해 로컬 API 서버(netlify/functions/api.mts + 메모리 저장소)에 대고
//    tools/apk/ApiProxyCheck.java 를 돌린다 — 헤더·본문 그대로, 상태 코드 그대로, no-store, 15초 제한 JSON 오류, 연결 실패.
// 4. 브라우저 (안드로이드 WebView 흉내, AssetServer.java 규칙 그대로):
//    - MIME 표는 AssetServer.java 의 MIME.put(...) 에서, 뒤로 버튼·안전 영역·키보드 스크립트는 MainActivity.java 의 상수에서 읽는다
//    - 쿼리 무시, 경로 정규화, 없는 파일 404, lo/ 사본 대체, index.html 에 head_inject 삽입({{VERSION}}, {{CONFIG}}=apk.json)
//    - /api/* 는 ApiProxy 와 같은 규칙으로 로컬 API 서버에 전달 (본문은 BNAndroid.apiStash 로 받은 것만 — WebView 처럼)
//    - window.BNAndroid 스텁, 외부 네트워크 차단(오프라인 기기와 같은 조건)
//    확인: 타이틀 부팅, 844×390 + __BN_INSETS={l:47,r:47,t:0,b:21} 에서 캔버스가 안전 영역 안, ⛶ 없음, 'bn-insets' 로 다시 배치,
//          __BN_IME, 진동·패드 진동 브리지, 서비스 워커 꺼짐, 세이브 유지, 뒤로 버튼, 계정 서버 흐름(가입·로그인)이 프록시로, 스테이지·허브,
//          채색 아틀라스(줄였으면 원본과 비교).
// 실패 항목이 있으면 종료 코드 1.
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const VALUE_OPTS = ['--out', '--web'];
const apkPath = path.resolve(argv.find((a, i) => !a.startsWith('--') && !VALUE_OPTS.includes(argv[i - 1])) || path.join(ROOT, 'dist/BloodNocturne.apk'));
const outDir = path.resolve(opt('--out') || path.join(os.tmpdir(), 'bn-apk-verify'));
const webDir = path.resolve(opt('--web') || process.env.WEB_DIR || path.join(ROOT, 'dist/web'));
const keep = argv.includes('--keep');
const skipJava = argv.includes('--skip-java');
const HOST = 'appassets.androidplatform.net';
const ORIGIN = `https://${HOST}`;
const JAVA_DIR = path.join(ROOT, 'android/app/src/main/java/com/bloodnocturne/game');
const RES_DIR = path.join(ROOT, 'android/app/src/main/res');
const CHROME = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LO_RE = /^assets\/((?:bg|cg|portraits)\/.+\.webp)$/;
const EXCLUDED = (rel) => rel === 'sw.js' || rel === '_redirects' || rel.startsWith('downloads/');

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };
const section = (t) => console.log(`\n── ${t} ──`);

if (!fs.existsSync(apkPath)) { console.error('APK 가 없습니다: ' + apkPath); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const relWalk = (d) => walk(d).map((f) => path.relative(d, f).split(path.sep).join('/')).sort();
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// ── 1. APK 풀기 · 설정 ──────────────────────────────────────────────
section('내용물');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-apk-'));
execFileSync('unzip', ['-q', '-o', apkPath, 'assets/*', '-d', tmp]);
const WWW = path.join(tmp, 'assets/www');
check('APK 에 assets/www/index.html 존재', fs.existsSync(path.join(WWW, 'index.html')));
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(tmp, 'assets/app/apk.json'), 'utf8')); } catch (e) { CFG = null; }
check('assets/app/apk.json (앱 설정)', CFG && typeof CFG === 'object', CFG ? `assets=${CFG.assets}, api=${CFG.api?.origin}, 빠진 원본 ${CFG.dropped ?? 0}개${CFG.modified ? `, 줄인 파일 ${CFG.modified.length}개` : ''}` : '없음/형식 오류');
CFG ||= {};
const LITE = String(CFG.assets || 'full').startsWith('lo');
check('계정 서버 주소 형식 (https://호스트)', /^https:\/\/[a-z0-9.-]+(:\d+)?$/.test(CFG.api?.origin || ''), CFG.api?.origin);
const originTxt = fs.readFileSync(path.join(ROOT, 'tools/apk/api_origin.txt'), 'utf8').split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('#'));
check('apk.json 의 서버 = tools/apk/api_origin.txt (또는 API_ORIGIN)', CFG.api?.origin === originTxt?.replace(/\/+$/, '').toLowerCase() || !!process.env.API_ORIGIN, `${CFG.api?.origin} / ${originTxt}`);
const files = relWalk(WWW);
const totalBytes = files.reduce((s, f) => s + fs.statSync(path.join(WWW, f)).size, 0);
console.log(`  게임 파일 ${files.length}개, ${(totalBytes / 1048576).toFixed(1)} MB (압축 전), APK ${(fs.statSync(apkPath).size / 1048576).toFixed(1)} MB (예산 ${CFG.budgetMB ?? 45} MB)`);
check('APK 크기 ≤ 예산', fs.statSync(apkPath).size <= (CFG.budgetMB ?? 45) * 1048576, `${(fs.statSync(apkPath).size / 1048576).toFixed(2)} MB`);
check('sw.js · _redirects · downloads/ 없음', !files.some(EXCLUDED));

// dist/web 과 비교 (platform WP-9 acceptance 3)
if (!fs.existsSync(path.join(webDir, 'index.html'))) {
  check('dist/web 과 파일·해시 비교', false, `${webDir} 가 없습니다 (node tools/deploy/build_web.mjs)`);
} else {
  let webHash = null;
  try { webHash = JSON.parse(fs.readFileSync(path.join(webDir, 'build.json'), 'utf8')).buildHash; } catch { /* 없음 */ }
  const sameBuild = !CFG.web?.buildHash || !webHash || CFG.web.buildHash === webHash;
  check('APK 를 만든 웹 빌드 = 지금 dist/web', sameBuild, `APK ${CFG.web?.buildHash ?? '?'} / dist/web ${webHash ?? '?'} (${CFG.web?.version ?? ''})`);
  const web = relWalk(webDir).filter((r) => !EXCLUDED(r));
  const inApk = new Set(files);
  const modified = new Set(CFG.modified || []);
  const problems = [];
  let dropped = 0, same = 0;
  for (const r of web) {
    const lo = LO_RE.exec(r);
    if (!inApk.has(r)) {
      if (LITE && lo && inApk.has(`assets/lo/${lo[1]}`)) { dropped++; continue; }
      problems.push(`빠짐: ${r}`);
      continue;
    }
    if (modified.has(r)) continue;
    if (sha(path.join(webDir, r)) !== sha(path.join(WWW, r))) problems.push(`내용 다름: ${r}`); else same++;
  }
  const webSet = new Set(web);
  for (const r of files) if (!webSet.has(r)) problems.push(`dist/web 에 없는 파일: ${r}`);
  if (LITE && CFG.dropped != null && dropped !== CFG.dropped) problems.push(`빠진 원본 수 ${dropped} ≠ apk.json ${CFG.dropped}`);
  if (!LITE && dropped) problems.push('full 단계인데 원본이 빠짐');
  check('APK assets/www = dist/web − sw.js − downloads/ − _redirects (해시)', problems.length === 0,
    problems.length ? problems.slice(0, 6).join(', ') + (problems.length > 6 ? ` … 외 ${problems.length - 6}건` : '') : `같은 파일 ${same}개${dropped ? `, lo/ 사본으로 대신한 원본 ${dropped}개` : ''}${modified.size ? `, 휴대폰 밀도로 줄인 파일 ${modified.size}개` : ''}`);
}

// ── 2. 네이티브 소스 정적 검사 ──────────────────────────────────────
section('네이티브 소스');
const serverSrc = fs.readFileSync(path.join(JAVA_DIR, 'AssetServer.java'), 'utf8');
const actSrc = fs.readFileSync(path.join(JAVA_DIR, 'MainActivity.java'), 'utf8');
const proxySrc = fs.readFileSync(path.join(JAVA_DIR, 'ApiProxy.java'), 'utf8');
const gateSrc = fs.readFileSync(path.join(JAVA_DIR, 'WebViewCheck.java'), 'utf8');
const manifestSrc = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const stringsSrc = fs.readFileSync(path.join(RES_DIR, 'values/strings.xml'), 'utf8');
const MIME = Object.fromEntries([...serverSrc.matchAll(/MIME\.put\("([\w]+)",\s*"([^"]+)"\)/g)].map((m) => [m[1], m[2]]));
check('AssetServer.java MIME 표 파싱', Object.keys(MIME).length > 20, `${Object.keys(MIME).length}개`);
check('.js → text/javascript', MIME.js === 'text/javascript');
const exts = [...new Set(files.map((f) => path.extname(f).slice(1).toLowerCase()))].sort();
const unknown = exts.filter((e) => !MIME[e]);
check('모든 파일 확장자에 MIME 지정', unknown.length === 0, `확장자 ${exts.join(', ')}${unknown.length ? ' / 미지정: ' + unknown.join(', ') : ''}`);
const javaConst = (src, name) => {
  const m = src.match(new RegExp(`String ${name}\\s*=\\s*([\\s\\S]*?);\\n`));
  if (!m) return null;
  return [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => JSON.parse(`"${x[1]}"`)).join('');
};
const javaArray = (src, name) => { const m = src.match(new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\};`)); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : null; };
const BACK_PROBE_JS = javaConst(actSrc, 'BACK_PROBE_JS');
const ESCAPE_JS = javaConst(actSrc, 'ESCAPE_JS');
const INSETS_JS = javaConst(actSrc, 'INSETS_JS');
const IME_JS = javaConst(actSrc, 'IME_JS');
check('MainActivity.java 스크립트 상수 파싱 (뒤로·Escape·안전 영역·키보드)', BACK_PROBE_JS && ESCAPE_JS && INSETS_JS?.includes('%s') && IME_JS?.includes('%s'));
const DROP_REQ = javaArray(proxySrc, 'DROP_REQUEST') || [];
const DROP_RES = javaArray(proxySrc, 'DROP_RESPONSE') || [];
const MSG = { network: javaConst(proxySrc, 'MSG_NETWORK'), timeout: javaConst(proxySrc, 'MSG_TIMEOUT'), unavailable: javaConst(proxySrc, 'MSG_UNAVAILABLE') };
check('ApiProxy.java 규칙 파싱 (헤더 목록·메시지)', DROP_REQ.includes('cookie') && DROP_RES.includes('set-cookie') && MSG.network && MSG.timeout);
check('WebView 관문: 최소 98, 관문 뒤에만 WebView 생성', /MIN_MAJOR\s*=\s*98\b/.test(gateSrc) && /WebViewCheck\.ok\(info\.major\)/.test(actSrc) && /showWebViewProblem\(info\)/.test(actSrc));
check('WebView 관문 안내 문구 (platform §9.4-1)', stringsSrc.includes('Android System WebView를 업데이트해 주세요 (Play 스토어)') && /market:\/\/details\?id=/.test(actSrc));
const bridgeMethods = ['insets', 'ime', 'rumble', 'apiStash', 'vibrate', 'exitApp', 'version', 'isApp'];
const missingBridge = bridgeMethods.filter((m) => !new RegExp(`@JavascriptInterface[\\s\\S]{0,120}public \\w+ ${m}\\(`).test(actSrc));
check('BNAndroid 브리지 메서드', missingBridge.length === 0, missingBridge.length ? '없음: ' + missingBridge.join(', ') : bridgeMethods.join(', '));
check('안전 영역: 컷아웃 + 시스템 바 → CSS px, bn-insets 이벤트', /Type\.displayCutout\(\)/.test(actSrc) && /Type\.systemBars\(\)/.test(actSrc) && /getDisplayCutout\(\)/.test(actSrc) && INSETS_JS.includes("'bn-insets'"));
check('화면 키보드: WindowInsets ime() → __BN_IME (API 30+)', /Type\.ime\(\)/.test(actSrc) && IME_JS.includes('__BN_IME'));
check('패드 진동: VibratorManager (API 31+) · InputDevice 진동', /getVibratorManager\(\)/.test(actSrc) && /CombinedVibration/.test(actSrc) && /dispatchGenericMotionEvent/.test(actSrc));
check('AssetServer: /api → ApiProxy, lo/ 사본 대체', /apiRel\.startsWith\("api\/"\)/.test(serverSrc) && /LO_TWIN/.test(serverSrc) && /\{\{CONFIG\}\}/.test(serverSrc));
const perms = [...manifestSrc.matchAll(/<uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
check('권한은 INTERNET · VIBRATE 만', perms.join(',') === 'android.permission.INTERNET,android.permission.VIBRATE', perms.join(', '));
check('화면 키보드 모드 adjustNothing 유지', /windowSoftInputMode="adjustNothing/.test(manifestSrc));
const injectRaw = fs.readFileSync(path.join(tmp, 'assets/app/head_inject.html'), 'utf8');
check('head_inject: #fsBtn 규칙 없음 (캔버스 패드가 ⛶ 를 숨긴다)', !/#fsBtn/.test(injectRaw));
check('head_inject: {{CONFIG}} · {{VERSION}} 자리표시', injectRaw.includes('{{CONFIG}}') && injectRaw.includes('{{VERSION}}'));
check('head_inject: 자리표시는 한 번씩 (주석 안에 없음)', (injectRaw.match(/\{\{CONFIG\}\}/g) || []).length === 1 && (injectRaw.match(/\{\{VERSION\}\}/g) || []).length === 1);
// AssetServer.injectIndex 와 같게 (Java String.replace = 모두 바꾸기)
const inject = injectRaw.replaceAll('{{VERSION}}', 'verify').replaceAll('{{CONFIG}}', JSON.stringify(CFG).replace(/<\//g, '<\\/'));
try { new Function(inject.replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '')); check('head_inject 스크립트 문법', true); } catch (e) { check('head_inject 스크립트 문법', false, e.message); }

// ── 3. 로컬 API 서버 + 자바 프록시 검사 ───────────────────────────────
section('/api 프록시');
async function startApiServer() {
  globalThis.Netlify = { context: null, env: { get: () => undefined, set() {}, has: () => false, delete() {}, toObject: () => ({}) } };
  const api = (await import(path.join(ROOT, 'netlify/functions/api.mts'))).default;
  const rt = await import(path.join(ROOT, 'netlify/lib/runtime.mts'));
  const scrypto = await import(path.join(ROOT, 'netlify/lib/crypto.mts'));
  const { createMemoryBackend } = await import(path.join(ROOT, 'tools/accounts/mem_store.mjs'));
  const backend = createMemoryBackend();
  rt.setStoreFactory((name, dc) => backend.factory(name, dc));
  scrypto.setHashCostForTests?.({ N: 1024, r: 8, p: 1 });
  const hanging = new Set();
  const log = [];
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    log.push({ method: req.method, path: u.pathname, body: body.length });
    if (u.pathname === '/api/__echo') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'set-cookie': 'a=b', 'x-echo': '1', 'cache-control': 'public, max-age=60' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: true, method: req.method, query: u.search.slice(1), headers: req.headers, body: body.toString('utf8') }));
    }
    if (u.pathname === '/api/__hang') { hanging.add(res); return; }
    if (u.pathname === '/api/__redirect') { res.writeHead(302, { location: '/api/health' }); return res.end(); }
    if (u.pathname === '/api/__status') {
      const code = Number(u.searchParams.get('code')) || 500;
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'retry-after': '7' });
      return res.end(JSON.stringify({ ok: false, error: 'rate_limited', message: '잠시 후 다시 시도해 주세요.', retryAfter: 7 }));
    }
    try {
      const h = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v != null) h.set(k, Array.isArray(v) ? v.join(', ') : v);
      const r = new Request(`https://api.test${req.url}`, { method: req.method, headers: h, body: body.length && !['GET', 'HEAD'].includes(req.method) ? body : undefined });
      const out = await api(r, { ip: '198.51.100.30', deploy: { context: 'production' } });
      const headers = {};
      out.headers.forEach((v, k) => { headers[k] = v; });
      res.writeHead(out.status, headers);
      res.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(e?.stack || e));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`, log,
    close: () => new Promise((r) => { for (const h of hanging) h.socket?.destroy(); server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
const runCmd = (cmd, args, { timeout = 120000 } = {}) => new Promise((resolve) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  const t = setTimeout(() => { p.kill('SIGKILL'); }, timeout);
  p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: err + String(e) }); });
  p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
});

let API = null;
try {
  API = await startApiServer();
  check('로컬 계정 API 서버 (netlify/functions/api.mts + 메모리 저장소)', true, API.url);
} catch (e) {
  check('로컬 계정 API 서버 (netlify/functions/api.mts + 메모리 저장소)', false, String(e?.message || e).split('\n')[0]);
}
if (API && !skipJava) {
  const jt = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-apiproxy-'));
  const jc = await runCmd('javac', ['-encoding', 'UTF-8', '-nowarn', '-d', jt,
    path.join(JAVA_DIR, 'ApiProxy.java'), path.join(JAVA_DIR, 'WebViewCheck.java'), path.join(ROOT, 'tools/apk/ApiProxyCheck.java')]);
  if (jc.code !== 0) check('ApiProxy.java 호스트 JVM 컴파일', false, (jc.err || jc.out).split('\n').filter((l) => !/JAVA_TOOL_OPTIONS/.test(l)).slice(0, 4).join(' | '));
  else {
    const jr = await runCmd('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', jt, 'com.bloodnocturne.game.ApiProxyCheck', API.url], { timeout: 120000 });
    const lines = jr.out.split('\n').filter((l) => /^(OK|FAIL) /.test(l));
    const fails = lines.filter((l) => l.startsWith('FAIL'));
    for (const l of fails) console.log('    ' + l);
    check('자바 ApiProxy · WebViewCheck (호스트 JVM, 로컬 API 서버)', jr.code === 0 && lines.length > 30 && fails.length === 0,
      `${lines.length - fails.length}/${lines.length} 통과${jr.code !== 0 && !lines.length ? ' — ' + (jr.err || '').split('\n').filter((l) => !/JAVA_TOOL_OPTIONS/.test(l)).slice(0, 3).join(' | ') : ''}`);
  }
  fs.rmSync(jt, { recursive: true, force: true });
}

// ── 4. AssetServer 흉내 ─────────────────────────────────────────────
const normalize = (p) => {
  const out = [];
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (!out.length) return null; out.pop(); continue; }
    if (seg.includes('\\') || seg.includes('\0')) return null;
    out.push(seg);
  }
  return out.join('/');
};
const isText = (m) => m.startsWith('text/') || m.endsWith('json') || m.endsWith('xml') || m === 'image/svg+xml';
const fwdReq = (k) => { const n = k.toLowerCase(); return !n.startsWith('sec-') && !n.startsWith('proxy-') && !DROP_REQ.includes(n); };
const fwdRes = (k) => { const n = k.toLowerCase(); return !n.startsWith('proxy-') && !DROP_RES.includes(n); };
const served = []; const missing = []; const external = []; const loServed = []; const apiLog = [];
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 BloodNocturneApp/verify';

async function proxyApi(route, req, apiPath, query) {
  let id = null;
  const kept = [];
  for (const part of (query || '').split('&')) {
    if (!part) continue;
    if (part.startsWith('__bnreq=')) { id = part.slice(8); continue; }
    kept.push(part);
  }
  let env = null;
  if (id) {
    try { env = await req.frame().page().evaluate((k) => { const s = window.__bnStash?.[k]; if (s) delete window.__bnStash[k]; return s || null; }, id); } catch { env = null; }
  }
  const method = env ? env.method : req.method();
  const pairs = env ? String(env.headers || '').split('\n').map((l) => { const c = l.indexOf(':'); return c > 0 ? [l.slice(0, c).trim(), l.slice(c + 1).trim()] : null; }).filter(Boolean) : Object.entries(await req.allHeaders());
  const headers = {};
  for (const [k, v] of pairs) if (fwdReq(k)) headers[k.toLowerCase()] = v;
  headers['user-agent'] ||= UA;
  apiLog.push({ method, path: apiPath, stash: !!env, id: !!id, bodyLen: env?.body?.length ?? 0, pageBody: (req.postDataBuffer()?.length ?? 0) });
  const fail = (status, code, pe) => route.fulfill({ status, headers: { 'cache-control': 'no-store', 'x-bn-proxy': '1', ...(pe ? { 'x-bn-proxy-error': pe } : {}) }, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ ok: false, error: code, message: MSG[code] || code }) });
  if (!CFG.api?.origin || !API) return fail(503, 'unavailable', 'unavailable');
  if (id && !env && !['GET', 'HEAD'].includes(method)) return fail(502, 'network', 'network'); // ApiProxy: 맡긴 본문이 없으면 보내지 않는다
  const upstream = apiPath === '/api/__down' ? 'http://127.0.0.1:1' : API.url; // 검증 전용: 서버에 닿지 못하는 경우
  const canBody = !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method);
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = canBody && (env?.body != null || needsBody) ? (env?.body ?? '') : undefined;
  let res;
  try {
    res = await fetch(upstream + apiPath + (kept.length ? '?' + kept.join('&') : ''), { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return e?.name === 'TimeoutError' ? fail(504, 'timeout', 'timeout') : fail(502, 'network', 'network');
  }
  if (res.status >= 300 && res.status < 400) return fail(502, 'network', 'network');
  const out = {};
  res.headers.forEach((v, k) => { if (fwdRes(k)) out[k] = v; });
  out['cache-control'] = 'no-store';
  out['x-bn-proxy'] = '1';
  return route.fulfill({ status: res.status, headers: out, contentType: res.headers.get('content-type') || 'application/octet-stream', body: method === 'HEAD' ? '' : Buffer.from(await res.arrayBuffer()) });
}

async function handle(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (u.protocol !== 'https:' || u.host !== HOST) { external.push(u.href); return route.abort('internetdisconnected'); }
  const apiRel = normalize(u.pathname);
  if (apiRel && (apiRel === 'api' || apiRel.startsWith('api/'))) return proxyApi(route, req, '/' + apiRel, u.search.slice(1));
  if (u.pathname.startsWith('/__dist/')) { // 검증 전용: 원본(dist/web) 비교용
    const f = path.join(webDir, normalize(decodeURIComponent(u.pathname.slice(8))) || '');
    if (!f.startsWith(webDir) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(f).slice(1)] || 'application/octet-stream', body: fs.readFileSync(f) });
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const rel = normalize(p);
  if (!rel) return route.fulfill({ status: 403, body: '403 Forbidden' });
  let f = path.join(WWW, rel);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
    const lo = LO_RE.exec(rel);
    const twin = lo ? path.join(WWW, 'assets/lo', lo[1]) : null;
    if (twin && fs.existsSync(twin)) { f = twin; loServed.push(rel); } else { missing.push(rel); return route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: '404 Not Found' }); }
  }
  const mime = MIME[path.extname(rel).slice(1).toLowerCase()] || 'application/octet-stream';
  let body = fs.readFileSync(f);
  if (rel === 'index.html') {
    const s = body.toString('utf8');
    const at = s.toLowerCase().indexOf('</head>');
    if (at >= 0) body = Buffer.from(s.slice(0, at) + inject + s.slice(at), 'utf8');
  }
  served.push(rel);
  return route.fulfill({ status: 200, contentType: isText(mime) ? `${mime}; charset=utf-8` : mime, headers: { 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' }, body });
}

// ── 5. 브라우저 (안드로이드 WebView 흉내: 모바일·터치·가로) ──────────────
const START = `${ORIGIN}/index.html${LITE ? '?lo=1' : ''}`; // MainActivity.startUrl
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
const bridgeStub = ({ insets, ime }) => {
  window.__bnCalls = [];
  window.__bnStash = {};
  window.BNAndroid = {
    isApp: () => true,
    version: () => 'verify',
    exitApp: () => window.__bnCalls.push(['exitApp']),
    vibrate: (j) => window.__bnCalls.push(['vibrate', j]),
    insets: () => (insets ? JSON.stringify(insets) : ''),
    ime: () => (ime ? JSON.stringify(ime) : ''),
    rumble: (s, w, ms) => window.__bnCalls.push(['rumble', s, w, ms]),
    apiStash: (id, method, headers, body) => { window.__bnStash[id] = { method, headers, body }; return true; },
  };
};
async function newCtx(opts, stub = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA, ...opts });
  await ctx.addInitScript(bridgeStub, { insets: null, ime: { bottom: 0 }, ...stub });
  await ctx.route('**/*', handle);
  return ctx;
}
async function openPage(ctx, url, tag) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(t)) return; // 404·외부 차단은 따로 집계
    errs.push('CONSOLE ' + t.slice(0, 300));
  });
  await page.goto(url, { timeout: 60000, waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.scenes && window.__game.scenes.length > 0, null, { timeout: 45000 });
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
const frames = (page, n = 3) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

let failed = false;
try {
  section('부팅 · 브리지 (휴대폰 915×412)');
  const phone = await newCtx({ viewport: { width: 915, height: 412 }, serviceWorkers: 'allow' });
  const t0 = Date.now();
  const page = await openPage(phone, START, 'title');
  const bootMs = Date.now() - t0;
  await page.waitForFunction(() => window.__game?.top?.name === 'title', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => ({
    scene: window.__game?.top?.name,
    app: window.__BN_APP,
    cls: document.documentElement.className,
    touch: !!window.__game?.input?.touchMode || document.body.classList.contains('touch'),
    origin: location.origin,
    secure: window.isSecureContext,
    fs: (window.__game?.input?.pad?.buttons?.({ all: true }) || []).map((b) => b.id),
    legacyTouch: !!document.getElementById('touch'),
  }));
  check('타이틀 장면까지 부팅', st.scene === 'title', `${bootMs}ms, scene=${st.scene}`);
  check('가상 https 출처 · 보안 컨텍스트', st.origin === ORIGIN && st.secure, st.origin);
  check('앱 전용 조각 (__BN_APP, bn-android, 에셋 단계, 프록시)', st.app?.platform === 'android' && /bn-android/.test(st.cls) && st.app?.assets === (CFG.assets || 'full') && st.app?.apiProxy === !!CFG.api?.origin && st.app?.apiBase === (CFG.api?.origin ? '/api' : null), JSON.stringify(st.app));
  check('전체화면 ⛶ 버튼 없음 (앱은 이미 전체화면)', !st.fs.includes('fullscreen') && !st.legacyTouch, `패드 버튼: ${st.fs.join(',') || '(없음)'}`);
  check('터치 모드 활성', st.touch);
  const cs = await canvasStats(page);
  check('캔버스에 그림이 그려짐', cs.litPct > 3 && cs.colors > 12, `${cs.w}x${cs.h}, 밝은 픽셀 ${cs.litPct}%, 색 ${cs.colors}`);
  await page.screenshot({ path: path.join(outDir, 'apk_title_phone.png') });

  const sw = await page.evaluate(async () => {
    if (!navigator.serviceWorker) return 'none';
    let err = null;
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { err = String(e.message || e); }
    const regs = await navigator.serviceWorker.getRegistrations();
    return { regs: regs.length, err };
  });
  check('서비스 워커 비활성 (파일 제공을 가로채지 않음)', sw === 'none' || (sw.regs === 0 && sw.err), JSON.stringify(sw));

  const vib = await page.evaluate(() => { navigator.vibrate(30); navigator.vibrate([10, 20, 30]); return window.__bnCalls.filter((c) => c[0] === 'vibrate').map((c) => c[1]); });
  check('navigator.vibrate → BNAndroid.vibrate', vib.length === 2 && vib[0] === '30' && vib[1] === '[10,20,30]', JSON.stringify(vib));

  // 화면 키보드 브리지 (MainActivity.IME_JS 그대로)
  const ime = await page.evaluate((js) => {
    let ev = 0;
    window.addEventListener('bn-ime', () => { ev++; }, { once: true });
    const first = window.__BN_IME ? { ...window.__BN_IME } : null;
    (0, eval)(js.replace('%s', JSON.stringify({ bottom: 180.5 })));
    return { first, now: window.__BN_IME, ev };
  }, IME_JS);
  check('__BN_IME: 부팅 값 + IME_JS 로 갱신 · bn-ime 이벤트', ime.first?.bottom === 0 && ime.now?.bottom === 180.5 && ime.ev === 1, JSON.stringify(ime));
  await page.evaluate((js) => (0, eval)(js.replace('%s', '{"bottom":0}')), IME_JS);

  // 패드 진동 → BNAndroid.rumble (WebView 의 Gamepad 에는 vibrationActuator 가 없다)
  await page.evaluate(() => {
    const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
    window.__vpad = pad;
    Navigator.prototype.getGamepads = function () { return [pad, null, null, null]; };
    const e = new Event('gamepadconnected'); Object.defineProperty(e, 'gamepad', { value: pad }); window.dispatchEvent(e);
  });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { const b = window.__vpad.buttons[12]; b.pressed = true; b.value = 1; window.__vpad.timestamp = performance.now(); });
    await frames(page, 4);
    await page.evaluate(() => { const b = window.__vpad.buttons[12]; b.pressed = false; b.value = 0; window.__vpad.timestamp = performance.now(); });
    await frames(page, 4);
    if ((await page.evaluate(() => window.__game?.input?.mode)) === 'pad') break;
  }
  const rum = await page.evaluate(() => {
    const before = window.__bnCalls.filter((c) => c[0] === 'rumble').length;
    window.__game?.input?.rumble?.(0.9, 0.6, 150);
    return { mode: window.__game?.input?.mode, calls: window.__bnCalls.filter((c) => c[0] === 'rumble').slice(before) };
  });
  check('패드 진동 → BNAndroid.rumble(strong, weak, ms)', rum.mode === 'pad' && rum.calls.some((c) => c[3] === 150 && c[1] > 0 && c[2] > 0), JSON.stringify(rum));
  await page.evaluate(() => { Navigator.prototype.getGamepads = function () { return [null, null, null, null]; }; const e = new Event('gamepaddisconnected'); Object.defineProperty(e, 'gamepad', { value: window.__vpad }); window.dispatchEvent(e); });

  await page.evaluate(() => localStorage.setItem('__bn_verify', 'ok'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.scenes.length > 0, null, { timeout: 45000 });
  check('새로고침 후 localStorage 유지', (await page.evaluate(() => localStorage.getItem('__bn_verify'))) === 'ok');
  await page.evaluate(() => localStorage.removeItem('__bn_verify'));
  check('새로고침해도 lo 모드 주소 유지', !LITE || (await page.evaluate(() => location.search)).includes('lo=1'));

  await page.waitForFunction(() => window.__game?.top?.name === 'title', null, { timeout: 30000 }).catch(() => {});
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

  // ── 계정 API: 같은 출처 /api 와 계정 서버 주소(APP_API_BASE) 모두 프록시로 ──
  section('계정 API (앱 조각의 fetch → 프록시)');
  const apiRes = await page.evaluate(async ({ origin }) => {
    const out = {};
    const h = await fetch('/api/health', { cache: 'no-store' });
    out.health = { status: h.status, proxy: h.headers.get('x-bn-proxy'), cc: h.headers.get('cache-control'), json: await h.json() };
    const e = await fetch(`${origin}/api/__echo?q=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t0k' }, body: JSON.stringify({ 한글: '본문 ✓' }) });
    out.echo = { status: e.status, json: await e.json(), cookie: e.headers.get('set-cookie') };
    out.down = await fetch('/api/__down').then(() => 'resolved', (x) => x?.name || String(x));
    // 동시에 여러 요청 (본문·쿼리·헤더가 서로 섞이지 않는지) · Request 객체 입력 · 배열 헤더 · 바이트 본문
    const multi = await Promise.all([0, 1, 2, 3, 4].map((i) => fetch(`/api/__echo?i=${i}`, { method: 'POST', headers: [['Content-Type', 'application/json'], ['X-I', String(i)]], body: JSON.stringify({ i }) }).then((r) => r.json())));
    out.multi = multi.map((j, i) => j.body === JSON.stringify({ i }) && j.query === `i=${i}` && j.headers?.['x-i'] === String(i));
    const rq = await fetch(new Request('/api/__echo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"r":"요청"}' })).then((r) => r.json());
    const bytes = await fetch('/api/__echo', { method: 'POST', body: new TextEncoder().encode('{"b":"바이트"}') }).then((r) => r.json());
    out.forms = { req: rq.method === 'PUT' && rq.body === '{"r":"요청"}', bytes: bytes.body === '{"b":"바이트"}' };
    const other = await fetch('build.json', { cache: 'no-store' });
    out.nonApi = other.status === 200 && !other.headers.get('x-bn-proxy');
    out.stashLeft = Object.keys(window.__bnStash).length;
    const c = window.__game.cloud;
    out.base = c?.base;
    out.probe = await c?.probe?.(true);
    out.state = c?.state;
    const id = 'apkv' + Math.random().toString(36).slice(2, 9);
    const su = await c?.signup?.(id, 'Crimson-Moon-7731', { remember: false });
    out.signup = { ok: su?.ok, error: su?.error, status: su?.status };
    out.loggedIn = c?.loggedIn;
    const me = await c?.me?.();
    out.me = { ok: me?.ok, id: me?.id };
    const lo = await c?.logout?.();
    out.logout = { ok: lo?.ok, remote: lo?.remote };
    const bad = await c?.login?.(id, 'Wrong-Pass-9921', { remember: false });
    out.badLogin = { ok: bad?.ok, error: bad?.error, message: bad?.message };
    return out;
  }, { origin: CFG.api?.origin || 'https://blood-nocturne.netlify.app' });
  check('GET /api/health → 프록시 → 200 (no-store, X-BN-Proxy)', apiRes.health.status === 200 && apiRes.health.json?.ok === true && apiRes.health.proxy === '1' && apiRes.health.cc === 'no-store', JSON.stringify(apiRes.health));
  const echoBody = apiRes.echo.json?.body;
  check('계정 서버 주소로 보낸 POST 도 프록시로 · 본문·헤더 그대로', apiRes.echo.status === 200 && echoBody === JSON.stringify({ 한글: '본문 ✓' }) && apiRes.echo.json?.headers?.authorization === 'Bearer t0k' && apiRes.echo.json?.query === 'q=1' && !apiRes.echo.cookie,
    JSON.stringify({ status: apiRes.echo.status, body: echoBody, q: apiRes.echo.json?.query, auth: apiRes.echo.json?.headers?.authorization }));
  check('서버에 닿지 못하면 fetch 가 네트워크 오류(TypeError)', apiRes.down === 'TypeError', apiRes.down);
  check('동시 요청 5건: 본문·쿼리·헤더가 각자 요청에 그대로', apiRes.multi.every(Boolean), JSON.stringify(apiRes.multi));
  check('Request 객체 · 바이트 본문도 프록시로 그대로, /api 밖 요청은 감싸지 않음', apiRes.forms.req && apiRes.forms.bytes && apiRes.nonApi, JSON.stringify({ ...apiRes.forms, nonApi: apiRes.nonApi }));
  check('맡긴 요청이 남지 않음', apiRes.stashLeft === 0, String(apiRes.stashLeft));
  check('cloud.js: 서버 확인 → ready (앱 주소 ' + (apiRes.base || '?') + ')', apiRes.probe === true && apiRes.state === 'ready', `${apiRes.probe} / ${apiRes.state}`);
  check('cloud.js: 가입 → 로그인 상태 → 내 정보 → 로그아웃', apiRes.signup.ok === true && apiRes.loggedIn === true && apiRes.me.ok === true && apiRes.logout.ok === true && apiRes.logout.remote === true, JSON.stringify({ s: apiRes.signup, me: apiRes.me, out: apiRes.logout }));
  check('cloud.js: 틀린 비밀번호 → invalid_credentials (서버 한국어 안내)', apiRes.badLogin.ok === false && apiRes.badLogin.error === 'invalid_credentials' && /[가-힣]/.test(apiRes.badLogin.message || ''), JSON.stringify(apiRes.badLogin));
  const bodyless = apiLog.filter((a) => ['POST', 'PUT', 'DELETE', 'PATCH'].includes(a.method) && !a.stash);
  check('본문 있는 /api 요청은 모두 apiStash 로 (WebView 는 본문을 넘겨주지 않는다)', bodyless.length === 0 && apiLog.some((a) => a.stash && a.bodyLen > 0) && apiLog.every((a) => a.pageBody === 0), `${apiLog.length}건, 맡김 ${apiLog.filter((a) => a.stash).length}건${bodyless.length ? ', 맡기지 않은 본문 요청: ' + bodyless.map((a) => a.path).join(',') : ''}`);
  await page.evaluate(() => window.__game.go('account', {}, { fade: false }));
  await page.waitForFunction(() => window.__game?.top?.name === 'account' && window.__game.top.screen && !window.__game.top.busy, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const acc = await page.evaluate(() => ({ name: window.__game?.top?.name, screen: window.__game?.top?.screen, state: window.__game?.cloud?.state, inputs: document.querySelectorAll('input').length }));
  check('계정 화면이 서버 연결 상태로 열림', acc.name === 'account' && acc.state === 'ready' && acc.screen && !/offline|unavailable|blocked/.test(acc.screen), JSON.stringify(acc));
  await page.screenshot({ path: path.join(outDir, 'apk_account_phone.png') });
  // 화면 키보드 브리지 → 계정 화면 (account.js 가 __BN_IME 만큼 패널을 올리고, 0 이 되면 내린다)
  const lift = await page.evaluate(async (js) => {
    const t = window.__game?.top;
    if (t?.name !== 'account' || typeof t.show !== 'function') return { skip: 'account scene' };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    t.show('login');
    await wait(700);
    const all = document.querySelectorAll('input');
    const inp = all[all.length - 1]; // 비밀번호 칸 (가장 아래)
    if (!inp) return { skip: 'input' };
    inp.focus();
    const IME = Math.round(window.innerHeight * 0.55);
    (0, eval)(js.replace('%s', JSON.stringify({ bottom: IME })));
    await wait(800);
    const up = t.lift;
    await new Promise((r) => requestAnimationFrame(r));
    const ir = inp.getBoundingClientRect();
    const visible = ir.bottom <= window.innerHeight - IME + 1;
    (0, eval)(js.replace('%s', '{"bottom":0}'));
    await wait(800);
    const down = t.lift;
    inp.blur();
    t.show('home');
    return { screen: 'login', ime: IME, up: Math.round(up), down: Math.round(down), visible, inputBottom: Math.round(ir.bottom), ih: window.innerHeight };
  }, IME_JS);
  check('__BN_IME → 계정 입력 칸이 키보드 위로 올라가고 닫히면 제자리 (account.js)', !lift.skip && lift.up > 1 && lift.down < 1 && lift.visible, JSON.stringify(lift));
  check('타이틀·계정 페이지 오류 없음', page.__errs.length === 0, page.__errs.slice(0, 5).join(' | '));
  const extHosts = [...new Set(external.map((u) => new URL(u).host))];
  check('계정 서버로 직접 나간 요청 없음 (모두 프록시)', !extHosts.includes(new URL(CFG.api?.origin || 'https://x.invalid').host), extHosts.join(', ') || '외부 요청 없음');
  await phone.close();

  // ── 안전 영역: 844×390 + __BN_INSETS={l:47,r:47,t:0,b:21} (WP-9 acceptance 4) ──
  section('안전 영역 (844×390, 컷아웃 47 · 제스처 21)');
  const INS = { l: 47, r: 47, t: 0, b: 21 };
  const nctx = await newCtx({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 }, { insets: INS });
  const np = await openPage(nctx, START, 'insets');
  await np.waitForFunction(() => window.__game?.top?.name === 'title', null, { timeout: 30000 }).catch(() => {});
  await np.waitForTimeout(1500);
  const rect = () => np.evaluate(() => { const r = document.getElementById('screen').getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height, vars: getComputedStyle(document.documentElement).getPropertyValue('--bn-safe-l').trim() + '/' + getComputedStyle(document.documentElement).getPropertyValue('--bn-safe-r').trim(), ins: window.__BN_INSETS, fs: (window.__game?.input?.pad?.buttons?.({ all: true }) || []).map((b) => b.id) }; });
  const r1 = await rect();
  const inside = (r, i, W, H) => r.x >= i.l - 0.5 && r.y >= i.t - 0.5 && r.r <= W - i.r + 0.5 && r.b <= H - i.b + 0.5 && r.w > 200;
  check('캔버스가 안전 영역 안 (브리지 값)', inside(r1, INS, 844, 390) && r1.ins?.l === 47, JSON.stringify(r1));
  check('⛶ 없음 (844×390)', !r1.fs.includes('fullscreen'), r1.fs.join(','));
  await np.screenshot({ path: path.join(outDir, 'apk_insets_844x390.png') });
  const INS2 = { l: 0, r: 60, t: 0, b: 0 };
  await np.evaluate((js) => (0, eval)(js), INSETS_JS.replace('%s', JSON.stringify(INS2)));
  await frames(np, 4); await np.waitForTimeout(300);
  const r2 = await rect();
  check("INSETS_JS 로 바뀐 값 + 'bn-insets' → 다시 배치", inside(r2, INS2, 844, 390) && r2.r <= 844 - 60 + 0.5 && Math.abs(r2.x - r1.x) > 1 && /60px$/.test(r2.vars), JSON.stringify(r2));
  check('안전 영역 페이지 오류 없음', np.__errs.length === 0, np.__errs.slice(0, 5).join(' | '));
  await nctx.close();

  // ── 스테이지 직접 진입 — 이동 · 공격 입력, 일시정지 메뉴 ──
  section('스테이지 · 허브');
  const phone2 = await newCtx({ viewport: { width: 915, height: 412 } });
  const sp = await openPage(phone2, `${ORIGIN}/index.html?scene=stage&stage=s01${LITE ? '&lo=1' : ''}`, 'stage');
  await sp.waitForFunction(() => !!window.__game?.world?.player, null, { timeout: 45000 }).catch(() => {});
  await sp.waitForTimeout(2500);
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
  const s1 = await sp.evaluate(() => ({ x: window.__game?.world?.player?.x, scene: window.__game?.top?.name }));
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
  await sp.evaluate(ESCAPE_JS);
  await sp.waitForTimeout(800);
  const resumed = await sp.evaluate(() => window.__game?.scenes.map((s) => s.name).join('>'));
  check('Escape 다시 → 게임으로 복귀', resumed === 'stage', resumed);
  check('스테이지 페이지 오류 없음', sp.__errs.length === 0, sp.__errs.slice(0, 5).join(' | '));
  await phone2.close();

  const tab = await newCtx({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const tp = await openPage(tab, `${ORIGIN}/index.html?scene=hub${LITE ? '&lo=1' : ''}`, 'hub');
  await tp.waitForTimeout(2500);
  const hub = await tp.evaluate(() => window.__game?.top?.name);
  check('허브(마을) 장면 로드 (태블릿)', hub === 'hub', hub);
  await tp.screenshot({ path: path.join(outDir, 'apk_hub_tablet.png') });
  check('허브 페이지 오류 없음', tp.__errs.length === 0, tp.__errs.slice(0, 5).join(' | '));

  // ── 휴대폰 밀도: 원본 경로 → lo/ 사본, 채색 아틀라스 ──
  section('에셋 (' + (CFG.assets || 'full') + ')');
  const droppedSample = LITE ? relWalk(path.join(WWW, 'assets/lo')).map((r) => `assets/${r}`).filter((r) => LO_RE.test(r) && !fs.existsSync(path.join(WWW, r))).slice(0, 3) : [];
  if (LITE) {
    const got = await tp.evaluate(async (list) => Promise.all(list.map(async (u) => { const r = await fetch(u); const b = await r.arrayBuffer(); return [u, r.status, b.byteLength]; })), droppedSample);
    const ok = got.length > 0 && got.every(([u, s, n]) => s === 200 && n === fs.statSync(path.join(WWW, 'assets/lo', LO_RE.exec(u)[1])).size);
    check('빠진 원본 경로 요청 → lo/ 사본 (AssetServer 대체)', ok, JSON.stringify(got));
  }
  const paintedDirs = [...new Set(files.filter((f) => /^assets\/painted\/.+\/(manifest|rig)\.json$/.test(f)).map((f) => f))];
  const modifiedSet = new Set(CFG.modified || []);
  const paint = await tp.evaluate(async ({ list, modified }) => {
    const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load ' + u)); i.src = u; });
    const cv = document.createElement('canvas'); const g = cv.getContext('2d', { willReadFrequently: true });
    const cover = (img, x, y, w, h) => { cv.width = w; cv.height = h; g.clearRect(0, 0, w, h); g.drawImage(img, x, y, w, h, 0, 0, w, h); const d = g.getImageData(0, 0, w, h).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 24) n++; return n / (w * h); };
    const out = { dirs: 0, parts: 0, empty: [], bad: [], compared: 0, drift: [] };
    for (const f of list) {
      const dir = f.replace(/\/[^/]+$/, '');
      try {
        const man = await (await fetch(f)).json();
        const isRig = f.endsWith('rig.json');
        const atlasFile = isRig ? (man.atlas || 'atlas.webp') : `${man.atlas?.file || 'atlas'}.webp`;
        const img = await load(`${dir}/${atlasFile}`);
        const W = img.naturalWidth, H = img.naturalHeight;
        const aw = isRig ? man.size?.[0] : man.atlas?.w, ah = isRig ? man.size?.[1] : man.atlas?.h;
        if ((aw && aw !== W) || (ah && ah !== H)) out.bad.push(`${f}: 아틀라스 ${W}x${H} ≠ ${aw}x${ah}`);
        const mod = modified.includes(f);
        let orig = null, oman = null;
        if (mod) { oman = await (await fetch('/__dist/' + f)).json(); orig = await load(`/__dist/${dir}/${atlasFile}`); }
        out.dirs++;
        for (const [name, p] of Object.entries(man.parts || {})) {
          const [x, y, w, h] = isRig ? p.rect : [p.x, p.y, p.w, p.h];
          out.parts++;
          if (x < 0 || y < 0 || x + w > W || y + h > H || w < 1 || h < 1) { out.bad.push(`${f}:${name} 이 아틀라스 밖`); continue; }
          const c = cover(img, x, y, w, h);
          if (c < 0.002) out.empty.push(`${f.replace('assets/painted/', '')}:${name}`);
          if (mod) {
            const q = oman.parts[name];
            const [ox, oy, ow, oh] = isRig ? q.rect : [q.x, q.y, q.w, q.h];
            const c0 = cover(orig, ox, oy, ow, oh);
            out.compared++;
            if (Math.abs(c - c0) > Math.max(0.06, c0 * 0.15)) out.drift.push(`${f}:${name} ${c0.toFixed(3)}→${c.toFixed(3)}`);
          }
        }
      } catch (e) { out.bad.push(`${f}: ${e.message}`); }
    }
    return out;
  }, { list: paintedDirs, modified: [...modifiedSet] });
  check('채색 아틀라스·매니페스트 (부품 사각형이 그림 안, 내용 있음)', paint.dirs === paintedDirs.length && paint.bad.length === 0 && paint.empty.length <= Math.max(2, paint.parts * 0.02),
    `${paint.dirs}종 · 부품 ${paint.parts}개${paint.empty.length ? ` · 빈 부품 ${paint.empty.length}: ${paint.empty.slice(0, 4).join(', ')}` : ''}${paint.bad.length ? ' · ' + paint.bad.slice(0, 3).join(', ') : ''}`);
  if (modifiedSet.size) check('줄인 아틀라스가 원본과 같은 부품을 가리킴 (불투명 비율 비교)', paint.compared > 0 && paint.drift.length <= Math.max(2, paint.compared * 0.02), `${paint.compared}개 비교${paint.drift.length ? ', 차이: ' + paint.drift.slice(0, 4).join(', ') : ''}`);
  check('에셋 페이지 오류 없음', tp.__errs.length === 0, tp.__errs.slice(0, 5).join(' | '));
  await tab.close();
} catch (e) {
  check('검증 실행', false, e.stack?.split('\n').slice(0, 3).join(' | ') || e.message);
}
await browser.close();
await API?.close?.();

const uniqMissing = [...new Set(missing)];
const uniqExternal = [...new Set(external.map((u) => new URL(u).host))];
console.log(`\n  제공한 요청 ${served.length}건 (lo/ 사본으로 대신 ${new Set(loServed).size}종), /api ${apiLog.length}건, 404 ${uniqMissing.length}종${uniqMissing.length ? ': ' + uniqMissing.slice(0, 12).join(', ') : ''}`);
console.log(`  차단한 외부 호스트: ${uniqExternal.join(', ') || '없음'}`);
const essential404 = uniqMissing.filter((p) => /\.(js|mjs|css|html|json|webmanifest)$/.test(p));
check('필수 코드 파일 404 없음 (.js/.css/.html/.json)', essential404.length === 0, essential404.join(', '));
const lo404 = uniqMissing.filter((p) => LO_RE.test(p));
check('배경·CG·초상화 404 없음', lo404.length === 0, lo404.slice(0, 6).join(', '));
fs.writeFileSync(path.join(outDir, 'apk_verify_report.json'), JSON.stringify({ apk: apkPath, config: CFG, results, missing: uniqMissing, external: uniqExternal, loServed: [...new Set(loServed)], api: apiLog }, null, 1));
if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
failed = results.some((r) => !r.ok);
console.log(failed ? `\n✗ 실패 ${results.filter((r) => !r.ok).length}건 (스크린샷·보고서: ${outDir})` : `\n✓ 전체 통과 ${results.length}건 (스크린샷·보고서: ${outDir})`);
process.exit(failed ? 1 : 0);
