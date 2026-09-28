#!/usr/bin/env node
// 웹 배포 빌드 — owner: DELIVERY-WEB (platform §9.1–9.3, §6.7, P-08, P-10; MASTER_PLAN §1.20)
//
//   node tools/deploy/build_web.mjs                 # dist/web (+ dist/deploy 업로드 묶음) 만들기, 점검·크기 보고
//   node tools/deploy/build_web.mjs --selftest-deny # 허용 폴더에 가짜 키스토어를 넣은 트리로 빌드 → 반드시 실패해야 통과 (exit 0)
// 선택:
//   --out <dir>            출력 폴더 (기본 dist/web, dist/ 아래만)
//   --no-bundle            src/ 를 모듈 그대로 복사하고 <link rel=modulepreload> 로 모든 모듈을 미리 받게 한다 (번들러 문제 시 대체 경로)
//   --no-minify            번들을 줄이지 않는다
//   --max-lazy <n>         lazy 조각 수 상한 (기본 7 → main 포함 8개, 아티팩트 제한과 같게)
//   --allow-font-gaps      글꼴 검사(tools/fonts/build_fonts.py --check) 실패를 경고로만 (임시 빌드용)
//   --skip-validate        맵 검사(node tools/validate_maps.mjs)를 건너뛴다
//   --apk <file>           dist/web/downloads/ 에 넣을 서명된 APK (기본: dist/BloodNocturne.apk 가 있으면)
//   --no-apk               APK 를 넣지 않는다
//   --no-deploy-bundle     dist/deploy (Netlify 업로드 묶음) 를 만들지 않는다
//   --strict               첫 화면 크기 예산(1.6 MB brotli) 초과도 실패로
//   --quiet
//
// 하는 일 (순서):
//  1. 허용 목록만 복사: index.html, manifest.webmanifest, sw.js, robots.txt, css/, src/boot-gate.js (+ 번들 조각 또는 src/),
//     assets/ (lo/·fonts/ 포함, 원본 작업 파일·숨김 파일 제외), downloads/ (APK).
//  2. 공개 금지 검사 (치명적): tools|docs|android|node_modules|netlify|dist|.git 경로, *.keystore|*.jks|*.p12|*.properties|.env 등.
//     25 MB 넘는 파일(APK 제외)도 실패. 실패하면 출력 폴더를 지운다 (반쯤 만든 폴더가 배포되지 않게).
//  3. 번들: src/main.js 에서 닿는 모듈 전부 → src/bundle/<해시>/app.js (+ 동적 import 용 lazy-N.js). 해시 폴더라 1년 캐시.
//  4. index.html 고치기: build-info.js (window.__BN_BUILD = {version, hash, modules, lo, …}, CSP 때문에 외부 파일) 를 부팅 관문보다 먼저,
//     main 조각 modulepreload, CSS·부팅 관문·글꼴 주소에 ?v=<내용 해시>. css/style.css 의 @font-face 주소도 같은 값으로.
//  5. build.json = {version, buildHash, files:{경로:{hash8, bytes}}, moduleCount, …} (서비스 워커가 그림 캐시를 검증할 때 읽는다)
//  6. sw.js 에 BUILD (캐시 이름 bn-<buildHash>, 미리 받을 목록) 주입. _redirects (/apk, /download → APK).
//  7. 글꼴 검사, 맵 검사, 크기 보고 (brotli·gzip): 첫 화면 경로, dist/web ≤ 90 MB, APK 입력(dist/web − sw.js − downloads/) ≤ 45 MB.
//  8. dist/deploy/ = Netlify 업로드 묶음: web/ (dist/web 하드 링크) + netlify/functions·lib + package.json(개발 의존성 제외) +
//     netlify.toml (publish = "web", 빌드 명령 없음). 비밀 파일 검사. 배포 호출은 하지 않는다 (DELIVER-WEB 이 한다) — tools/deploy/README.md
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, posix, walk, sha256, rmrf, mkdirp, assertInsideDist, denyReason, transferSizes, fmtMB, fmtKB, parseArgs, apkInfo, MB, parseNetlifyToml, headersFor } from './lib/util.mjs';
import { bundleModules, verifyChunks } from './lib/bundle.mjs';
import { minify } from './lib/minify.mjs';

export const BUDGET = {
  siteBytes: 90 * MB,        // dist/web (downloads/ 제외) — MASTER_PLAN §1.20 (채색 그림 포함)
  apkInputBytes: 45 * MB,    // APK 에 들어갈 웹 파일 (dist/web − sw.js − downloads/ − build.json − _redirects)
  criticalBr: 1.6 * MB,      // 첫 화면 경로 brotli (platform §9.1) — 기본 경고, --strict 면 실패
  fileBytes: 25 * MB,        // 파일 하나 (APK 제외)
  apkBytes: 60 * MB,         // downloads/*.apk 하나 (APK 예산 45 MB 는 APK 담당이 지킨다; 여기서는 비정상 크기만 막는다)
};
const ROOT_FILES = ['index.html', 'manifest.webmanifest', 'sw.js', 'robots.txt'];
const COPY_DIRS = ['css', 'assets'];
// 허용 폴더 안에서도 옮기지 않는 파일 (작업 원본·임시·숨김). 이름은 보고에 남는다.
const SKIP_FILE = /(^|\/)\.[^/]+$|(^|\/)(Thumbs\.db|desktop\.ini)$|\.(psd|psb|kra|xcf|blend|blend1|ai|sketch|fig|py|pyc|md|log|tmp|bak|orig|swp)$|\.tmp\.\d+\.|~$/i;
const SKIP_EXACT = new Set(['assets/lo/index.json']);
// 첫 화면에 필요한 글꼴 (css/style.css 의 기본 글꼴 + ui.js 의 first) — 크기 보고용
const FIRST_FONTS = ['noto-sans-kr.woff2', 'hahmlet.woff2', 'grenze-gotisch.woff2', 'cinzel.woff2', 'cinzel-decorative-900.woff2', 'bn-num.woff2'];

const h8 = (s) => s.slice(0, 8);

function log(opts, ...a) { if (!opts.quiet) console.log(...a); }

class BuildError extends Error {}

/** 빌드 본체. 반환: 보고 객체 (실패하면 BuildError) */
export async function buildWeb(o = {}) {
  const opts = {
    src: ROOT, out: path.join(ROOT, 'dist/web'), bundle: true, minify: true, maxLazy: 7,
    fontsCheck: true, allowFontGaps: false, validate: true, apk: undefined, deployBundle: true, strict: false, quiet: false, sizes: true, variants: true,
    ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)),
  };
  const SRC = path.resolve(opts.src);
  const OUT = path.resolve(opts.out);
  assertInsideDist(OUT);
  const t0 = Date.now();
  const report = { ok: false, out: posix(path.relative(ROOT, OUT)), warnings: [], skipped: [], checks: {}, sizes: {}, budgets: {}, timings: {} };
  const warn = (m) => { report.warnings.push(m); log(opts, '  경고: ' + m); };
  const lap = (k, t) => { report.timings[k] = Date.now() - t; };

  // ── 0. 사전 점검: lo/ 변형, 글꼴, 맵 ──
  if (opts.variants && SRC === ROOT) {
    const t = Date.now();
    const chk = spawnSync('python3', ['tools/assets/make_variants.py', '--check', '--quiet'], { cwd: ROOT, encoding: 'utf8' });
    if (chk.status === 1) {
      log(opts, '· assets/lo 가 낡아 다시 만든다 (tools/assets/make_variants.py)');
      const mk = spawnSync('python3', ['tools/assets/make_variants.py', '--quiet'], { cwd: ROOT, encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit' });
      if (mk.status !== 0) warn(`assets/lo 를 다시 만들지 못했습니다 (PIL 필요): 있는 사본만 씁니다`);
    } else if (chk.status !== 0) warn(`assets/lo 검사를 돌리지 못했습니다 (${(chk.stderr || chk.error?.message || '').trim().split('\n').pop()})`);
    lap('variants', t);
  }
  if (opts.fontsCheck && fs.existsSync(path.join(SRC, 'tools/fonts/build_fonts.py'))) {
    const t = Date.now();
    const probe = spawnSync('python3', ['-c', 'import fontTools'], { encoding: 'utf8' });
    if (probe.status !== 0) { warn('글꼴 검사를 건너뜀: python3 fontTools 가 없습니다 (pip install fonttools)'); report.checks.fonts = 'skipped (no fontTools)'; }
    else {
      const r = spawnSync('python3', ['tools/fonts/build_fonts.py', '--check'], { cwd: SRC, encoding: 'utf8' });
      const tail = (r.stdout + r.stderr).trim().split('\n').slice(0, 12).join('\n');
      if (r.status === 0) report.checks.fonts = 'ok';
      else if (opts.allowFontGaps) { report.checks.fonts = 'FAILED (allowed)'; warn('글꼴 검사 실패 (--allow-font-gaps 로 계속):\n' + tail); }
      else throw new BuildError('글꼴 검사 실패 — python3 tools/fonts/build_fonts.py 로 글꼴을 다시 만들어야 합니다 (임시 빌드는 --allow-font-gaps):\n' + tail);
    }
    lap('fonts', t);
  }
  if (opts.validate && fs.existsSync(path.join(SRC, 'tools/validate_maps.mjs'))) {
    const t = Date.now();
    const r = spawnSync(process.execPath, ['tools/validate_maps.mjs'], { cwd: SRC, encoding: 'utf8' });
    if (r.status !== 0) throw new BuildError('맵 검사 실패 (node tools/validate_maps.mjs):\n' + (r.stdout + r.stderr).trim().split('\n').slice(-15).join('\n'));
    report.checks.maps = (r.stdout.trim().split('\n').pop() || 'ok').trim();
    lap('validate', t);
  }

  // ── 1. 허용 목록 복사 ──
  let t = Date.now();
  rmrf(OUT);
  mkdirp(OUT);
  const files = new Map(); // rel → { from | data }
  const copy = (rel, from) => {
    const dst = path.join(OUT, rel);
    mkdirp(path.dirname(dst));
    const st = fs.lstatSync(from);
    if (st.isSymbolicLink()) throw new BuildError(`심볼릭 링크는 배포하지 않습니다: ${rel}`);
    try { fs.copyFileSync(from, dst, fs.constants.COPYFILE_FICLONE); } catch { fs.copyFileSync(from, dst); }
    files.set(rel, true);
  };
  const write = (rel, data) => { const dst = path.join(OUT, rel); mkdirp(path.dirname(dst)); fs.writeFileSync(dst, data); files.set(rel, true); };
  try {
    for (const f of ROOT_FILES) {
      if (!fs.existsSync(path.join(SRC, f))) { if (f === 'robots.txt') { warn('robots.txt 가 없습니다'); continue; } throw new BuildError(`필수 파일이 없습니다: ${f}`); }
      copy(f, path.join(SRC, f));
    }
    for (const d of COPY_DIRS) {
      for (const rel0 of walk(path.join(SRC, d))) {
        const rel = `${d}/${rel0}`;
        if (SKIP_EXACT.has(rel) || SKIP_FILE.test(rel)) { if (!SKIP_EXACT.has(rel)) report.skipped.push(rel); continue; }
        copy(rel, path.join(SRC, rel));
      }
    }
    if (report.skipped.length) warn(`허용 폴더 안의 작업·숨김 파일 ${report.skipped.length}개는 옮기지 않았습니다: ${report.skipped.slice(0, 5).join(', ')}${report.skipped.length > 5 ? ' …' : ''}`);
    copy('src/boot-gate.js', path.join(SRC, 'src/boot-gate.js'));
    lap('copy', t);

    // ── 2. 공개 금지 검사 (복사 직후 — 뒤 단계가 무엇을 쓰든 마지막에 한 번 더) ──
    denyCheck(OUT, report);

    // ── 3. 코드: 번들 또는 모듈 그대로 ──
    t = Date.now();
    let scriptSrc, preloads = [], moduleCount, chunkFiles = [], bundleInfo = null;
    if (opts.bundle) {
      const tmpDir = 'src/bundle/x';
      const b = bundleModules({ root: SRC, entry: 'src/main.js', chunkDir: tmpDir, maxLazyChunks: opts.maxLazy });
      for (const w of b.warnings) warn('번들: ' + w);
      const probs = verifyChunks(b.chunks, b.allowedFree);
      if (probs.length) throw new BuildError('번들 점검 실패:\n  ' + probs.slice(0, 20).join('\n  '));
      const outChunks = b.chunks.map((c) => ({ ...c, code: opts.minify ? minify(c.code, { name: c.name }) : c.code }));
      const codeHash = h8(sha256(outChunks.map((c) => c.name + '\0' + c.code).join('\0')));
      const dir = `src/bundle/${codeHash}`;
      for (const c of outChunks) { write(`${dir}/${c.name}`, c.code); chunkFiles.push(`${dir}/${c.name}`); }
      scriptSrc = `${dir}/${outChunks[0].name}`;
      preloads = [scriptSrc];
      moduleCount = 2; // 부팅 때 받는 src/ 스크립트: boot-gate.js + main 조각 (boot-gate.js 의 진행률 분모)
      bundleInfo = { dir, chunks: outChunks.map((c) => ({ file: `${dir}/${c.name}`, kind: c.kind, modules: c.modules.length, bytes: Buffer.byteLength(c.code), entries: c.entries })), sourceModules: b.stats.modules, sourceBytes: b.stats.sourceBytes, minified: opts.minify };
      log(opts, `· 번들: 모듈 ${b.stats.modules}개 (${fmtMB(b.stats.sourceBytes)}) → 조각 ${outChunks.length}개 ${fmtMB(outChunks.reduce((s, c) => s + Buffer.byteLength(c.code), 0))} (${dir})`);
    } else {
      const mods = moduleOrder(SRC, 'src/main.js');
      for (const rel of walk(path.join(SRC, 'src'))) if (rel.endsWith('.js')) copy(`src/${rel}`, path.join(SRC, 'src', rel));
      scriptSrc = 'src/main.js';
      preloads = mods; // 깊은 것부터 (후위 순서)
      moduleCount = mods.length + 1;
      chunkFiles = mods;
      log(opts, `· 모듈 그대로: ${mods.length}개 + modulepreload`);
    }
    report.bundle = bundleInfo;
    lap('code', t);

    // ── 4. CSS 글꼴 주소·index.html ──
    t = Date.now();
    const fileHash8 = (rel) => h8(sha256(fs.readFileSync(path.join(OUT, rel))));
    const cssFonts = new Map(); // 'assets/fonts/x.woff2' → stamped url (사이트 기준)
    for (const css of ['css/style.css', 'css/touchpad.css']) {
      const p = path.join(OUT, css);
      if (!fs.existsSync(p)) continue;
      let text = fs.readFileSync(p, 'utf8');
      text = text.replace(/url\((["']?)(\.\.\/assets\/fonts\/([^"')?#]+\.woff2))\1\)/g, (m, q, u, name) => {
        const rel = `assets/fonts/${name}`;
        if (!files.has(rel)) throw new BuildError(`${css}: 없는 글꼴 ${rel}`);
        const v = fileHash8(rel);
        cssFonts.set(rel, `${rel}?v=${v}`);
        return `url(${q}${u}?v=${v}${q})`;
      });
      write(css, text);
    }
    let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const once = (re, fn, what) => {
      let n = 0;
      html = html.replace(re, (...m) => { n++; return fn(...m); });
      if (n !== 1) throw new BuildError(`index.html: ${what} 를 ${n}번 찾았습니다 (1번이어야 함) — index.html 구조가 바뀌었으면 build_web.mjs 를 맞춰 주세요`);
    };
    once(/<link rel="stylesheet" href="css\/style\.css">/, () => `<link rel="stylesheet" href="css/style.css?v=${fileHash8('css/style.css')}">`, 'css/style.css');
    if (files.has('css/touchpad.css')) once(/<link rel="stylesheet" href="css\/touchpad\.css">/, () => `<link rel="stylesheet" href="css/touchpad.css?v=${fileHash8('css/touchpad.css')}">`, 'css/touchpad.css');
    // 글꼴 preload: CSS 로 쓰는 글꼴은 CSS 와 같은 주소로 (다르면 두 번 받는다), JS(FontFace) 로 쓰는 글꼴은 그대로
    html = html.replace(/<link rel="preload" href="(assets\/fonts\/[^"?]+\.woff2)"/g, (m, rel) => {
      if (!files.has(rel)) throw new BuildError(`index.html: 없는 글꼴 preload ${rel}`);
      return `<link rel="preload" href="${cssFonts.get(rel) || rel}"`;
    });
    once(/<script src="src\/boot-gate\.js"><\/script>/, () => `<script src="build-info.js?v=__BN_INFO__"></script>\n<script src="src/boot-gate.js?v=${fileHash8('src/boot-gate.js')}"></script>`, 'src/boot-gate.js 스크립트');
    once(/<script type="module" src="src\/main\.js"><\/script>/, () => `<script type="module" src="${scriptSrc}"></script>`, 'src/main.js 모듈 스크립트');
    const preTags = preloads.map((u) => `<link rel="modulepreload" href="${u}">`).join('\n');
    once(/<link rel="manifest"[^>]*>/, (m) => `${m}\n${preTags}`, 'manifest 링크');
    write('index.html', html);
    lap('html', t);

    // ── APK (downloads/) ──
    let apk = null;
    const apkFile = opts.apk === false ? null : opts.apk ? path.resolve(opts.apk) : path.join(ROOT, 'dist/BloodNocturne.apk');
    if (apkFile && fs.existsSync(apkFile)) {
      const info = apkInfo(apkFile);
      const name = info.versionName && info.versionCode ? `BloodNocturne-${info.versionName}-${info.versionCode}.apk` : `BloodNocturne-${h8(info.sha256)}.apk`;
      copy(`downloads/${name}`, apkFile);
      apk = { file: `downloads/${name}`, from: posix(path.relative(ROOT, apkFile)), ...info };
      write('downloads/latest.json', JSON.stringify({ versionName: info.versionName, versionCode: info.versionCode, sha256: info.sha256, bytes: info.bytes, url: `downloads/${name}`, built: new Date().toISOString() }, null, 1) + '\n');
      log(opts, `· APK: ${apk.from} → ${apk.file} (${fmtMB(info.bytes)}, ${info.versionName ?? '?'} / ${info.versionCode ?? '?'})`);
    } else if (opts.apk) throw new BuildError(`APK 가 없습니다: ${opts.apk}`);
    else report.checks.apk = 'none (dist/BloodNocturne.apk 없음 — /apk 는 404)';
    report.apk = apk;
    // Netlify 리디렉트 (파일이 있으면 적용되지 않는다 — 그래서 downloads/BloodNocturne.apk 파일은 두지 않고 새 이름으로 보낸다)
    const apkTarget = apk ? `/${apk.file}` : '/downloads/BloodNocturne.apk';
    write('_redirects', [
      '# tools/deploy/build_web.mjs 가 만든다 (platform §9.2). /api/* 는 함수의 config.path 가 맡으므로 여기서 가리지 않는다.',
      `/apk                          ${apkTarget}   302`,
      `/download                     ${apkTarget}   302`,
      `/download/*                   ${apkTarget}   302`,
      ...(apk ? [`/downloads/BloodNocturne.apk   ${apkTarget}   302`] : []),
      '',
    ].join('\n'));

    // ── 5. build.json · build-info.js · sw.js ──
    t = Date.now();
    const loKeys = loKeysOf(OUT);
    const pkg = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'));
    const git = spawnSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: SRC, encoding: 'utf8' });
    const commit = git.status === 0 ? git.stdout.trim() : null;
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 13); // 20260927T2345
    const version = `${pkg.version}+${stamp}${commit ? '.' + commit : ''}`;
    // buildHash: build-info.js·sw.js·build.json 을 뺀 모든 파일 (index.html 은 자리표시 상태로)
    const hashed = {};
    for (const rel of walk(OUT)) {
      const buf = fs.readFileSync(path.join(OUT, rel));
      hashed[rel] = { hash8: h8(sha256(buf)), bytes: buf.length };
    }
    const buildHash = sha256(Object.entries(hashed).map(([k, v]) => `${k}:${v.hash8}:${v.bytes}`).join('\n')).slice(0, 12);
    const info = {
      version, hash: buildHash, built: now.toISOString(), modules: moduleCount, bundle: !!opts.bundle,
      lo: loKeys.length ? loKeys : null,
    };
    const infoJs = `/* 배포 빌드 정보 — tools/deploy/build_web.mjs 가 만든다 (CSP script-src 'self' 라 인라인이 아닌 파일). 부팅 관문(src/boot-gate.js)·assets.js 가 읽는다 */\nwindow.__BN_BUILD = ${JSON.stringify(info)};\n`;
    write('build-info.js', infoJs);
    html = html.replace('build-info.js?v=__BN_INFO__', `build-info.js?v=${h8(sha256(infoJs))}`);
    write('index.html', html);

    // 서비스 워커가 미리 받을 목록
    const refd = (re) => [...html.matchAll(re)].map((m) => m[1]);
    const precache = [
      'index.html',
      ...refd(/<script[^>]+src="([^"]+)"/g),
      ...refd(/<link rel="stylesheet" href="([^"]+)"/g),
      ...(opts.bundle ? chunkFiles : chunkFiles),
      ...[...cssFonts.values()],
      'manifest.webmanifest',
    ];
    // JS(FontFace) 글꼴: first·early (bn-brush 같은 lazy 는 처음 쓸 때 캐시), fonts.json 의 plus 조각
    for (const f of ['bn-num.woff2', 'bn-dmg.woff2', 'bn-seal.woff2']) if (files.has(`assets/fonts/${f}`)) precache.push(`assets/fonts/${f}`);
    if (files.has('assets/fonts/fonts.json')) {
      precache.push('assets/fonts/fonts.json');
      try { for (const e of JSON.parse(fs.readFileSync(path.join(OUT, 'assets/fonts/fonts.json'), 'utf8'))) if (e?.part === 'plus' && e.file && files.has(`assets/fonts/${e.file}`)) precache.push(`assets/fonts/${e.file}`); } catch { warn('assets/fonts/fonts.json 을 읽지 못했습니다'); }
    }
    const assetPre = ['assets/bg/title.webp', 'assets/lo/bg/title.webp', ...[...files.keys()].filter((f) => /^assets\/ui\/(icon-[^/]+|favicon-[^/]+)\.png$/.test(f))].filter((f) => files.has(f));
    const pre = [...new Set(precache)];
    for (const u of pre) { const p = u.split('?')[0]; if (!files.has(p)) throw new BuildError(`서비스 워커 미리 받기 목록에 없는 파일: ${u}`); }
    const swBuild = { hash: buildHash, version, precache: pre, assets: assetPre, manifest: `build.json?v=${buildHash}` };
    let sw = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
    const swRe = /\/\*BN_BUILD\*\/[\s\S]*?\/\*BN_BUILD_END\*\//;
    if (!swRe.test(sw)) throw new BuildError('sw.js 에 /*BN_BUILD*/ … /*BN_BUILD_END*/ 자리표시가 없습니다');
    sw = sw.replace(swRe, `/*BN_BUILD*/${JSON.stringify(swBuild)}/*BN_BUILD_END*/`);
    write('sw.js', sw);

    // build.json (자신 제외 모든 파일)
    const manifestFiles = {};
    for (const rel of walk(OUT)) {
      if (rel === 'build.json') continue;
      const buf = fs.readFileSync(path.join(OUT, rel));
      manifestFiles[rel] = { hash8: h8(sha256(buf)), bytes: buf.length };
    }
    const buildJson = { version, buildHash, built: now.toISOString(), commit, moduleCount, bundle: bundleInfo ? { dir: bundleInfo.dir, chunks: bundleInfo.chunks.map((c) => c.file) } : null, lo: loKeys.length, files: manifestFiles };
    write('build.json', JSON.stringify(buildJson) + '\n');
    report.version = version; report.buildHash = buildHash; report.moduleCount = moduleCount; report.precache = pre.length; report.assetPrecache = assetPre.length; report.lo = loKeys.length;
    lap('manifest', t);

    // ── 6. 마지막 공개 금지 검사 + 헤더 규칙 + 크기 ──
    denyCheck(OUT, report);
    headerLint(SRC, OUT, report);
    if (opts.sizes) sizeReport(OUT, report, { html, chunkFiles: opts.bundle ? [chunkFiles[0]] : chunkFiles, cssFonts, opts, warn });

    // ── 7. Netlify 업로드 묶음 ──
    if (opts.deployBundle) {
      t = Date.now();
      report.deploy = makeDeployBundle(SRC, OUT, deployDirFor(OUT), opts, warn);
      lap('deploy', t);
    }
  } catch (e) {
    rmrf(OUT); // 실패한 빌드는 남기지 않는다
    if (opts.deployBundle) rmrf(deployDirFor(OUT));
    throw e;
  }
  report.ok = true;
  report.timings.total = Date.now() - t0;
  return report;
}

/** 업로드 묶음 폴더: dist/web → dist/deploy, 그 밖의 --out X → X-deploy */
function deployDirFor(OUT) {
  return path.resolve(OUT) === path.join(ROOT, 'dist/web') ? path.join(ROOT, 'dist/deploy') : path.resolve(OUT) + '-deploy';
}

function denyCheck(OUT, report) {
  const bad = [];
  for (const rel of walk(OUT)) {
    const why = denyReason(rel);
    if (why) { bad.push(`${rel} — ${why}`); continue; }
    const st = fs.lstatSync(path.join(OUT, rel));
    if (st.isSymbolicLink()) bad.push(`${rel} — 심볼릭 링크`);
    else if (/^downloads\/[^/]+\.apk$/.test(rel) ? st.size > BUDGET.apkBytes : st.size > BUDGET.fileBytes) bad.push(`${rel} — ${fmtMB(st.size)} (파일 하나 상한 ${fmtMB(/\.apk$/.test(rel) ? BUDGET.apkBytes : BUDGET.fileBytes)})`);
  }
  if (bad.length) throw new BuildError(`공개 금지 파일이 배포 폴더에 들어갔습니다 (빌드 중단, 폴더 삭제):\n  ${bad.join('\n  ')}`);
  report.checks.deny = 'ok';
}

/** netlify.toml 헤더 규칙 점검: 같은 헤더를 주는 규칙이 겹치면 Netlify 가 값을 이어 붙인다 (Cache-Control 이 깨진다) */
function headerLint(SRC, OUT, report) {
  const tp = path.join(SRC, 'netlify.toml');
  if (!fs.existsSync(tp)) throw new BuildError('netlify.toml 이 없습니다');
  const conf = parseNetlifyToml(fs.readFileSync(tp, 'utf8'));
  if (conf.build.publish !== 'dist/web') throw new BuildError(`netlify.toml [build] publish 가 "dist/web" 이 아닙니다 (${conf.build.publish}) — 저장소 루트를 게시하면 안 된다`);
  const dups = [];
  const paths = ['/', ...walk(OUT).map((r) => '/' + r)];
  for (const p of paths) headersFor(conf.headers, p, dups);
  if (dups.length) {
    const uniq = [...new Set(dups.map((d) => `${d.header} (${d.rule} 이 다른 규칙과 겹침, 예: ${d.path})`))];
    throw new BuildError('netlify.toml 헤더 규칙이 겹칩니다 (Netlify 는 값을 이어 붙인다):\n  ' + uniq.slice(0, 10).join('\n  '));
  }
  const csp = headersFor(conf.headers, '/index.html')['Content-Security-Policy'] || '';
  if (!/script-src 'self'(;|$)/.test(csp)) throw new BuildError(`CSP script-src 가 'self' 만이어야 합니다 (인라인 스크립트 없음): ${csp}`);
  report.checks.headers = `ok (${conf.headers.length} rules)`;
}

/** src/main.js 에서 닿는 모듈 (깊은 것부터, --no-bundle 의 modulepreload 용) */
function moduleOrder(SRC, entry) {
  const re = /(?:^|[;\n])\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|(?:^|[;\n])\s*import\s*['"](\.[^'"]+)['"]/g;
  const out = []; const seen = new Set();
  const visit = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const code = fs.readFileSync(path.join(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    for (const m of code.matchAll(re)) visit(posix(path.join(path.dirname(rel), m[1] || m[2])));
    out.push(rel);
  };
  visit(entry);
  return out;
}

function loKeysOf(OUT) {
  const keys = [];
  for (const rel of walk(path.join(OUT, 'assets/lo'))) {
    const m = /^((?:bg|cg|portraits)\/.+)\.webp$/.exec(rel);
    if (m && fs.existsSync(path.join(OUT, 'assets', rel))) keys.push(m[1]);
  }
  return keys.sort();
}

function sizeReport(OUT, report, { html, chunkFiles, cssFonts, opts, warn }) {
  const t = Date.now();
  const all = walk(OUT);
  let site = 0, downloads = 0, apkInput = 0, count = 0;
  const byDir = {};
  let jsRaw = 0, jsBr = 0, jsGz = 0;
  for (const rel of all) {
    const b = fs.statSync(path.join(OUT, rel)).size;
    const top = rel.includes('/') ? rel.split('/').slice(0, rel.startsWith('assets/') ? 2 : 1).join('/') : '(root)';
    byDir[top] = (byDir[top] || 0) + b;
    if (rel.startsWith('downloads/')) { downloads += b; continue; }
    site += b; count++;
    if (!/^(sw\.js|build\.json|_redirects)$/.test(rel)) apkInput += b;
    if (/^src\/.*\.js$/.test(rel)) {
      const s = transferSizes(fs.readFileSync(path.join(OUT, rel)), rel);
      jsRaw += s.raw; jsBr += s.br; jsGz += s.gz;
    }
  }
  // 첫 화면 경로: html + css + build-info + boot-gate + main 조각 + 첫 화면 글꼴 + bg/title + index.html 이 부르는 ui 아이콘
  const crit = new Set(['index.html', 'build-info.js', 'src/boot-gate.js', 'css/style.css', 'css/touchpad.css', 'assets/bg/title.webp', ...chunkFiles]);
  for (const f of FIRST_FONTS) crit.add(`assets/fonts/${f}`);
  for (const m of html.matchAll(/href="(assets\/ui\/[^"?]+)"/g)) crit.add(m[1]);
  let critRaw = 0, critBr = 0;
  const critList = [];
  for (const rel of crit) {
    const p = path.join(OUT, rel);
    if (!fs.existsSync(p)) continue;
    const s = transferSizes(fs.readFileSync(p), rel);
    critRaw += s.raw; critBr += s.br;
    critList.push([rel, s.br]);
  }
  report.sizes = {
    siteBytes: site, siteFiles: count, downloadsBytes: downloads, apkInputBytes: apkInput,
    js: { raw: jsRaw, br: jsBr, gzip: jsGz }, critical: { raw: critRaw, br: critBr, files: critList.sort((a, b) => b[1] - a[1]) },
    byDir: Object.fromEntries(Object.entries(byDir).sort((a, b) => b[1] - a[1])),
  };
  report.budgets = {
    site: { bytes: site, budget: BUDGET.siteBytes, ok: site <= BUDGET.siteBytes },
    apkInput: { bytes: apkInput, budget: BUDGET.apkInputBytes, ok: apkInput <= BUDGET.apkInputBytes },
    criticalBr: { bytes: critBr, budget: BUDGET.criticalBr, ok: critBr <= BUDGET.criticalBr, fatal: !!opts.strict },
  };
  log(opts, `· 크기: 사이트 ${fmtMB(site)} (${count}개, 예산 ${fmtMB(BUDGET.siteBytes)}), APK 입력 ${fmtMB(apkInput)} (예산 ${fmtMB(BUDGET.apkInputBytes)}), 내려받기 ${fmtMB(downloads)}`);
  log(opts, `        JS ${fmtMB(jsRaw)} → brotli ${fmtMB(jsBr)} / gzip ${fmtMB(jsGz)}; 첫 화면 경로 brotli ${fmtMB(critBr)} (예산 ${fmtMB(BUDGET.criticalBr)})`);
  if (!report.budgets.site.ok) throw new BuildError(`dist/web 이 예산을 넘습니다: ${fmtMB(site)} > ${fmtMB(BUDGET.siteBytes)}`);
  if (!report.budgets.apkInput.ok) {
    // MASTER_PLAN §1.20: 45 MB 를 넘으면 APK 는 bg/cg/portraits 의 원본 대신 assets/lo 만 싣는다 (APK 담당). 그 경우의 크기도 보고한다.
    let full = 0;
    for (const rel of all) {
      const m = /^assets\/((?:bg|cg|portraits)\/.+)\.webp$/.exec(rel);
      if (m && fs.existsSync(path.join(OUT, 'assets/lo', m[1] + '.webp'))) full += fs.statSync(path.join(OUT, rel)).size;
    }
    const lite = apkInput - full;
    report.budgets.apkLite = { bytes: lite, budget: BUDGET.apkInputBytes, ok: lite <= BUDGET.apkInputBytes, note: 'APK 가 bg/cg/portraits 원본 대신 assets/lo 만 실을 때' };
    const m = `APK 입력(dist/web 전부)이 ${fmtMB(apkInput)} 로 예산 ${fmtMB(BUDGET.apkInputBytes)} 을 넘습니다 → APK 는 bg/cg/portraits 원본을 빼고 assets/lo 만 실어야 합니다 (그때 ${fmtMB(lite)}, MASTER_PLAN §1.20)`;
    if (!report.budgets.apkLite.ok) throw new BuildError(m + ' — 그래도 예산 초과');
    warn(m);
  }
  if (!report.budgets.criticalBr.ok) {
    const m = `첫 화면 경로가 brotli ${fmtMB(critBr)} 로 예산 ${fmtMB(BUDGET.criticalBr)} 을 넘습니다 (가장 큰 것: ${critList.slice(0, 3).map(([f, b]) => `${f} ${fmtKB(b)}`).join(', ')})`;
    if (opts.strict) throw new BuildError(m);
    warn(m);
  }
  report.timings.sizes = Date.now() - t;
}

/** dist/deploy: Netlify 업로드 묶음 (DELIVER-WEB 이 이 폴더를 올린다) */
function makeDeployBundle(SRC, WEB, DEP, opts, warn) {
  assertInsideDist(DEP);
  rmrf(DEP);
  mkdirp(DEP);
  // web/ = dist/web (하드 링크, 안 되면 복사)
  let linked = 0, copied = 0;
  for (const rel of walk(WEB)) {
    const dst = path.join(DEP, 'web', rel);
    mkdirp(path.dirname(dst));
    try { fs.linkSync(path.join(WEB, rel), dst); linked++; } catch { fs.copyFileSync(path.join(WEB, rel), dst); copied++; }
  }
  // 함수: netlify/functions, netlify/lib 의 소스만
  const fnFiles = [];
  for (const d of ['netlify/functions', 'netlify/lib']) {
    for (const rel of walk(path.join(SRC, d))) {
      if (!/\.(mts|ts|mjs|js|cjs|json)$/.test(rel) || /(^|\/)\./.test(rel)) continue;
      const dst = path.join(DEP, d, rel);
      mkdirp(path.dirname(dst));
      fs.copyFileSync(path.join(SRC, d, rel), dst);
      fnFiles.push(`${d}/${rel}`);
    }
  }
  if (!fnFiles.some((f) => f.startsWith('netlify/functions/'))) throw new BuildError('netlify/functions 가 비었습니다 (계정 API)');
  // package.json: 함수 의존성만
  const pkg = JSON.parse(fs.readFileSync(path.join(SRC, 'package.json'), 'utf8'));
  delete pkg.devDependencies;
  pkg.scripts = {};
  fs.writeFileSync(path.join(DEP, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  // netlify.toml: [build] 만 바꾼다 (publish = "web", 빌드 명령 없음 — 이미 만든 결과를 올린다)
  const toml = fs.readFileSync(path.join(SRC, 'netlify.toml'), 'utf8');
  const lines = toml.split('\n');
  const out = [];
  let inBuild = false, replaced = false;
  for (const line of lines) {
    const sec = /^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/.exec(line);
    if (sec) {
      inBuild = sec[1].trim() === 'build';
      if (inBuild) { out.push('[build]', '  # dist/deploy 묶음: tools/deploy/build_web.mjs 가 이미 만든 web/ 을 그대로 게시한다 (빌드 명령 없음)', '  publish = "web"'); replaced = true; continue; }
    } else if (inBuild) continue;
    out.push(line);
  }
  if (!replaced) throw new BuildError('netlify.toml 에 [build] 가 없습니다');
  fs.writeFileSync(path.join(DEP, 'netlify.toml'), out.join('\n'));
  // 비밀·개발 파일 검사 (web/ 은 이미 검사함)
  const bad = [];
  for (const rel of walk(DEP)) {
    if (rel.startsWith('web/')) { if (denyReason(rel.slice(4))) bad.push(rel); continue; }
    if (/\.(keystore|jks|p12|pfx|pem|key|properties)$|(^|\/)\.env/i.test(rel) || /(^|\/)(tools|docs|android|node_modules|\.git|\.netlify)\//.test(rel)) bad.push(rel);
  }
  if (bad.length) throw new BuildError('dist/deploy 에 비밀·개발 파일이 있습니다:\n  ' + bad.join('\n  '));
  const top = fs.readdirSync(DEP).sort();
  log(opts, `· 업로드 묶음: ${posix(path.relative(ROOT, DEP))}/ (${top.join(', ')}) — web/ 하드 링크 ${linked}개${copied ? `, 복사 ${copied}개` : ''}, 함수 파일 ${fnFiles.length}개`);
  return { dir: posix(path.relative(ROOT, DEP)), entries: top, functions: fnFiles.length };
}

// ───────────────────────── 자체 시험: 허용 폴더의 가짜 키스토어 ─────────────────────────
export async function selftestDeny({ quiet = false } = {}) {
  const say = (...a) => { if (!quiet) console.log(...a); };
  // 1. 규칙 단위 시험
  const cases = [
    ['tools/android/release.keystore', true], ['assets/lo/x.keystore', true], ['keystore.properties', true], ['css/app.properties', true],
    ['assets/.env', true], ['assets/.env.local', true], ['assets/ui/release.jks', true], ['assets/x.p12', true], ['docs/RELEASE.md', true],
    ['netlify/functions/api.mts', true], ['node_modules/x/index.js', true], ['android/app.gradle', true], ['dist/web/index.html', true], ['.git/config', true],
    ['assets/bg/title.webp', false], ['src/bundle/abc/app.js', false], ['index.html', false], ['downloads/BloodNocturne.apk', false], ['assets/fonts/OFL.txt', false],
  ];
  const wrong = cases.filter(([p, deny]) => !!denyReason(p) !== deny);
  if (wrong.length) { console.error('자체 시험 실패: 공개 금지 규칙이 틀렸습니다 — ' + wrong.map(([p, d]) => `${p} (기대 ${d ? '금지' : '허용'})`).join(', ')); return 1; }
  say(`· 규칙 시험 ${cases.length}건 통과`);
  // 2. 가짜 소스 트리 (dist/ 아래라 git·자동 저장에 섞이지 않는다): 진짜 index.html·css·boot-gate + 작은 main.js + 허용 폴더(assets/lo)의 가짜 키스토어
  const fake = path.join(ROOT, 'dist/.selftest-src');
  const out = path.join(ROOT, 'dist/.selftest-web');
  rmrf(fake); rmrf(out);
  try {
    mkdirp(path.join(fake, 'src')); mkdirp(path.join(fake, 'css')); mkdirp(path.join(fake, 'assets/lo')); mkdirp(path.join(fake, 'assets/fonts')); mkdirp(path.join(fake, 'assets/ui'));
    for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'robots.txt', 'package.json', 'netlify.toml']) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(fake, f));
    for (const f of ['css/style.css', 'css/touchpad.css', 'src/boot-gate.js']) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(fake, f));
    for (const f of fs.readdirSync(path.join(ROOT, 'assets/fonts'))) fs.copyFileSync(path.join(ROOT, 'assets/fonts', f), path.join(fake, 'assets/fonts', f));
    fs.writeFileSync(path.join(fake, 'src/main.js'), "console.log('selftest');\n");
    fs.writeFileSync(path.join(fake, 'assets/lo/selftest-dummy.keystore'), 'dummy keystore for tools/deploy/build_web.mjs --selftest-deny\n');
    mkdirp(path.join(fake, 'tools/android'));
    fs.writeFileSync(path.join(fake, 'tools/android/release.keystore'), 'dummy (not allowlisted: must not be copied at all)\n');
    let failed = null;
    try {
      await buildWeb({ src: fake, out, fontsCheck: false, validate: false, apk: false, deployBundle: false, sizes: false, variants: false, quiet: true });
    } catch (e) { failed = e; }
    if (!failed) { console.error('자체 시험 실패: 허용 폴더(assets/lo)에 키스토어가 있는데 빌드가 성공했습니다'); return 1; }
    if (!(failed instanceof BuildError) || !/selftest-dummy\.keystore/.test(failed.message)) { console.error('자체 시험 실패: 다른 이유로 실패했습니다 — ' + failed.message); return 1; }
    if (fs.existsSync(out)) { console.error('자체 시험 실패: 실패한 빌드의 출력 폴더가 남았습니다'); return 1; }
    say('· 가짜 키스토어 빌드: 예상대로 실패 →\n    ' + failed.message.split('\n').slice(0, 2).join('\n    '));
    say('자체 시험 통과 (공개 금지 검사가 빌드를 막는다)');
    return 0;
  } finally {
    rmrf(fake); rmrf(out);
  }
}

// ───────────────────────── 명령줄 ─────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs();
  if (a['selftest-deny']) process.exit(await selftestDeny({ quiet: !!a.quiet }));
  try {
    const rep = await buildWeb({
      out: a.out ? path.resolve(ROOT, a.out) : undefined,
      bundle: !a['no-bundle'], minify: !a['no-minify'], maxLazy: a['max-lazy'] ? Number(a['max-lazy']) : 7,
      allowFontGaps: !!a['allow-font-gaps'], validate: !a['skip-validate'],
      apk: a['no-apk'] ? false : a.apk || undefined, deployBundle: !a['no-deploy-bundle'], strict: !!a.strict, quiet: !!a.quiet,
    });
    const rp = path.resolve(rep.out ? path.join(ROOT, rep.out) : path.join(ROOT, 'dist/web')) === path.join(ROOT, 'dist/web') ? path.join(ROOT, 'dist/build_web_report.json') : path.join(ROOT, rep.out + '-report.json');
    fs.writeFileSync(rp, JSON.stringify(rep, null, 1) + '\n');
    console.log(`빌드 완료: ${rep.out} (${rep.version}, bn-${rep.buildHash}) — 경고 ${rep.warnings.length}개, ${(rep.timings.total / 1000).toFixed(1)}초. 보고: ${path.relative(ROOT, rp)}`);
    process.exit(0);
  } catch (e) {
    console.error(e instanceof BuildError ? `빌드 실패: ${e.message}` : e.stack || e);
    process.exit(1);
  }
}
