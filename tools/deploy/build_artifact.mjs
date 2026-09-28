#!/usr/bin/env node
// claude.ai 아티팩트 묶음 — owner: DELIVERY-WEB (MASTER_PLAN §1.20 artifact)
//
//   node tools/deploy/build_artifact.mjs            # dist/web → dist/artifact (없거나 낡았으면 먼저 build_web 을 부르지 않는다: 안내 후 실패)
//   node tools/deploy/build_artifact.mjs --check    # dist/artifact 가 없거나 dist/web 과 다르면 만든 뒤, 한도 검사만 (위반하면 exit 1)
//   node tools/deploy/build_artifact.mjs --smoke    # 만든 뒤 헤드리스 Chromium 으로 타이틀·마을·스테이지·보스방 + 휴대폰 스테이지를 열어 페이지 오류 0·장면별 팩 바이트 확인
//   [--from dist/web] [--pack-mb 4]   (팩 하나의 목표 크기; 팩 수가 40 을 넘으면 알아서 키운다)
//
// 아티팩트 한 판(version)은 파일 511개·256 MB, 한 번 올리기(publish)는 파일 255개·64 MB, 파일 하나는 텍스트 16 MB·그 밖 15 MB 까지다.
// 게임 파일이 1000개를 넘으므로:
//  · 페이지: dist/web/index.html 에서 만든 조각 (문서 뼈대는 올릴 때 씌워진다). 매니페스트·아이콘 링크는 뺀다 (PWA 아님).
//  · build-info.js: window.__BN_BUILD = {…, sw:false (서비스 워커 등록 안 함), pack:'assets/packs/index.json'} → assets.js 가 팩에서 읽는다.
//  · 코드: dist/web 의 번들 조각 그대로 (≤ 8개, build_web 이 lazy 조각을 7개 이하로 묶는다).
//  · 그림: assets/packs/<n>.bin (파일 바이트를 이어 붙임, 머리말 없음, ≤ 40개) + index.json {v:1, packs, files:{경로:[팩, 오프셋, 길이]}, complete:true}.
//    assets.js 는 파일 하나가 필요해도 그 팩 전체를 받고 팩 조각을 최대 6개 메모리에 들고 있으므로, 팩은 작게(기본 4 MB) 하고
//    한 화면이 함께 쓰는 그림끼리 묶는다: 0 = 타이틀(배경·UI, 작게 → 타이틀이 빨리 뜬다), 다음 = 캐릭터 고르기(영웅 초상화·기본 직업 퍼펫·아이콘),
//    마을, 그다음은 종류별(텍스처·소품 / 배경 / 채색 보스 / 초상화 / 영웅별 퍼펫 / CG), lo/ (휴대폰만 씀) 는 맨 뒤에 따로.
//  · 파일로 남기는 것: 글꼴(ui.js 가 주소로 부른다)과 OFL.txt·fonts.json, 그리고 assets.js 를 거치지 않고 직접 받는 채색 파일
//    (painted/enemies/** — enemy_kit.js, painted/**/manifest.json — kit.js loadManifest). 계정은 CSP 로 막혀 숨겨지고 저장은 기기에만.
// 결과: dist/artifact/ (올릴 파일만) + dist/artifact_publish.json (올리기 계획: 묶음별 파일·형식, DELIVER-ARTIFACT 가 쓴다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, posix, walk, sha256, rmrf, mkdirp, assertInsideDist, denyReason, fmtMB, parseArgs, MB } from './lib/util.mjs';

export const LIMITS = {
  versionFiles: 511, versionBytes: 256 * MB,
  batchFiles: 255, batchBytes: 64 * MB,
  textFileBytes: 16 * MB, binFileBytes: 15 * MB,
  chunks: 8, packs: 40,
};
const TEXT = /\.(html|js|mjs|css|json|txt|svg|md)$/i;
const CONTENT_TYPE = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain',
  '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream',
};
// assets.js 를 거치지 않고 주소로 직접 받는 파일 → 팩에 넣지 않고 파일로 둔다
const LOOSE = [/^fonts\//, /^painted\/enemies\//, /^painted\/.+\/manifest\.json$/];
// 첫 팩: 타이틀 화면이 곧바로 쓰는 것만 (이 팩을 다 받아야 타이틀 배경이 뜨므로 작게)
const TITLE = [/^(lo\/)?bg\/title\.webp$/, /^ui\//];
// 다음 팩: 캐릭터 고르기·메뉴 (영웅 초상화, 여섯 영웅의 기본 직업 퍼펫, 아이템 아이콘)
const BOOT = [/^(lo\/)?portraits\/(kael|sera|victor|bran|lia|azel)\.webp$/, /^icons\//,
  /^puppets\/(_shared|kael\/kael_hunter|sera\/sera_exorcist|victor\/victor_gunslinger|bran\/bran_knight|lia\/lia_assassin|azel\/azel_dhampir)\//];
// 다음 팩: 마을(허브)에 들어가자마자 필요한 것
const HUB = [/^(lo\/)?bg\/(hub|worldmap|shop|smith|inn|church)\.webp$/, /^(lo\/)?portraits\/npc_/, /^puppets\/npc\//, /^tex\/tex_(wood|dirt)\./, /^props\/(prop_crate|deco_village_)/];
// 나머지의 묶음 순서 (한 화면이 함께 쓰는 것끼리). 묶음이 바뀌면 새 팩을 연다 (지금 팩이 minFill 보다 작으면 이어 담는다)
function restGroup(r) {
  let m;
  if ((m = /^lo\/([^/]+)\//.exec(r))) return [90, 'lo/' + m[1]];      // 휴대폰(저사양)만 쓴다 → 데스크톱은 받지 않는다
  if (/^(tex|props)\//.test(r)) return [10, 'deco'];                  // 스테이지마다 쓰는 질감·소품
  if (/^bg\//.test(r)) return [20, 'bg'];
  if (/^painted\/bosses\//.test(r)) return [30, 'bosses'];
  if (/^painted\/companions\//.test(r)) return [35, 'companions'];   // 탈것·수호신 채색 아틀라스
  if (/^portraits\//.test(r)) return [40, 'portraits'];
  if ((m = /^puppets\/([^/]+)\//.exec(r))) return [50, 'puppets/' + m[1]]; // 영웅별 (그 영웅을 고른 사람만)
  if (/^cg\//.test(r)) return [60, 'cg'];                             // 스토리 장면
  return [70, r.split('/')[0]];
}

class ArtifactError extends Error {}

export function buildArtifact({ from = path.join(ROOT, 'dist/web'), out = path.join(ROOT, 'dist/artifact'), packMB = 4, quiet = false } = {}) {
  const say = (...a) => { if (!quiet) console.log(...a); };
  const WEB = path.resolve(from), OUT = path.resolve(out);
  assertInsideDist(OUT);
  const bjPath = path.join(WEB, 'build.json');
  if (!fs.existsSync(bjPath)) throw new ArtifactError(`${posix(path.relative(ROOT, WEB))}/build.json 이 없습니다 — node tools/deploy/build_web.mjs 먼저`);
  const bj = JSON.parse(fs.readFileSync(bjPath, 'utf8'));
  if (!bj.bundle?.chunks?.length) throw new ArtifactError('dist/web 이 번들 빌드가 아닙니다 (--no-bundle 로 만든 것은 아티팩트 파일 수 한도를 넘는다)');
  rmrf(OUT);
  mkdirp(OUT);
  const files = new Map(); // rel → bytes
  const put = (rel, data) => { const p = path.join(OUT, rel); mkdirp(path.dirname(p)); fs.writeFileSync(p, data); files.set(rel, Buffer.byteLength(data)); };
  const cp = (rel, fromRel = rel) => { const p = path.join(OUT, rel); mkdirp(path.dirname(p)); fs.copyFileSync(path.join(WEB, fromRel), p); files.set(rel, fs.statSync(p).size); };
  const stripV = (s) => s.replace(/\?v=[0-9a-f]+/g, '');

  // ── 코드·CSS ──
  for (const c of bj.bundle.chunks) cp(c);
  cp('src/boot-gate.js');
  for (const css of ['css/style.css', 'css/touchpad.css']) if (fs.existsSync(path.join(WEB, css))) put(css, stripV(fs.readFileSync(path.join(WEB, css), 'utf8')));

  // ── 그림: 파일로 둘 것과 팩 ──
  const all = walk(path.join(WEB, 'assets'));
  const loose = all.filter((r) => LOOSE.some((re) => re.test(r)));
  const packed = all.filter((r) => !LOOSE.some((re) => re.test(r)));
  for (const r of loose) cp(`assets/${r}`);
  const inAny = (res, r) => res.some((re) => re.test(r));
  const title = packed.filter((r) => inAny(TITLE, r));
  const boot = packed.filter((r) => !inAny(TITLE, r) && inAny(BOOT, r));
  const hub = packed.filter((r) => !inAny(TITLE, r) && !inAny(BOOT, r) && inAny(HUB, r));
  const rest = packed.filter((r) => !inAny(TITLE, r) && !inAny(BOOT, r) && !inAny(HUB, r));
  // 나머지: 묶음 순서 → 경로 순서 (같은 묶음은 가까이, 같은 폴더는 이어서)
  const restGroups = new Map();
  for (const r of rest.map((r) => [restGroup(r), r]).sort((a, b) => a[0][0] - b[0][0] || (a[0][1] < b[0][1] ? -1 : a[0][1] > b[0][1] ? 1 : 0) || (a[1] < b[1] ? -1 : 1))) {
    const k = r[0][1];
    if (!restGroups.has(k)) restGroups.set(k, []);
    restGroups.get(k).push(r[1]);
  }
  let cap = packMB * MB;
  let packs = [];
  const pack = () => {
    packs = [];
    const minFill = cap / 4; // 묶음이 바뀔 때 지금 팩이 이보다 작으면 새로 열지 않고 이어 담는다 (자잘한 팩 방지)
    let cur = null;
    const addGroup = (list, { fresh = false } = {}) => {
      if (!list.length) return;
      if (cur && (fresh || cur.size >= minFill)) cur = null;
      const sizes = list.map((r) => {
        const size = fs.statSync(path.join(WEB, 'assets', r)).size;
        if (size > LIMITS.binFileBytes) throw new ArtifactError(`팩에 넣을 수 없는 큰 파일: assets/${r} (${fmtMB(size)})`);
        return size;
      });
      // 묶음 전체가 목표의 1.25 배 안이면 한 팩에 (끝자락만 따로 떨어진 자잘한 팩을 만들지 않는다)
      const total = sizes.reduce((s, b) => s + b, 0);
      const soft = Math.min(LIMITS.binFileBytes, cap * 1.25);
      const limit = total + (cur ? cur.size : 0) <= soft ? soft : cap;
      list.forEach((r, i) => {
        if (!cur || (cur.size + sizes[i] > limit && cur.list.length)) { cur = { list: [], size: 0 }; packs.push(cur); }
        cur.list.push([r, sizes[i]]); cur.size += sizes[i];
      });
    };
    addGroup(title, { fresh: true });
    addGroup(boot, { fresh: true });
    addGroup(hub, { fresh: true });
    let loStarted = false;
    for (const [k, list] of restGroups) {
      // lo/ 는 휴대폰만 쓰므로 데스크톱이 받는 팩과 섞지 않는다
      const lo = k.startsWith('lo/');
      addGroup(list, { fresh: lo && !loStarted });
      if (lo) loStarted = true;
    }
  };
  pack();
  // 그림이 늘어 팩 수 한도를 넘으면 팩을 키운다 (명시한 --pack-mb 는 최소값)
  while (packs.length > LIMITS.packs && cap < LIMITS.binFileBytes) { cap = Math.min(LIMITS.binFileBytes, cap * 1.5); pack(); }
  if (packs.length > LIMITS.packs) throw new ArtifactError(`팩이 ${packs.length}개로 한도 ${LIMITS.packs}개를 넘습니다 (--pack-mb 를 키운다)`);
  const index = { v: 1, packs: [], files: {}, complete: true };
  packs.forEach((pk, n) => {
    const name = `${n}.bin`;
    const bufs = [];
    let off = 0;
    for (const [r, size] of pk.list) {
      const b = fs.readFileSync(path.join(WEB, 'assets', r));
      index.files[r] = [n, off, size];
      bufs.push(b); off += size;
    }
    put(`assets/packs/${name}`, Buffer.concat(bufs));
    index.packs.push(name);
  });
  put('assets/packs/index.json', JSON.stringify(index));

  // ── build-info.js (아티팩트용) ──
  const infoSrc = fs.readFileSync(path.join(WEB, 'build-info.js'), 'utf8');
  const m = /window\.__BN_BUILD = (\{.*\});/s.exec(infoSrc);
  const info = { ...(m ? JSON.parse(m[1]) : {}), sw: false, pack: 'assets/packs/index.json', artifact: true };
  put('build-info.js', `/* claude.ai 아티팩트 빌드 정보 — tools/deploy/build_artifact.mjs 가 만든다. 서비스 워커 없음, 그림은 assets/packs 에서 */\nwindow.__BN_BUILD = ${JSON.stringify(info)};\n`);

  // ── 페이지 조각 ──
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const head = /<head>([\s\S]*?)<\/head>/.exec(html)?.[1] ?? '';
  const body = /<body>([\s\S]*?)<\/body>/.exec(html)?.[1] ?? '';
  const keepHead = head.split('\n').filter((l) => {
    const t = l.trim();
    if (!t) return false;
    if (/^<meta charset/i.test(t)) return false;                                   // 뼈대가 준다
    if (/rel="(manifest|icon|apple-touch-icon)"/.test(t)) return false;            // PWA·파비콘 없음
    if (/name="(apple-mobile-web-app-[^"]*|mobile-web-app-capable|application-name|theme-color|format-detection)"/.test(t)) return false;
    return true;
  }).map(stripV);
  const page = [
    '<!-- 블러드 녹턴 — claude.ai 아티팩트 페이지 (tools/deploy/build_artifact.mjs 가 dist/web/index.html 에서 만든다. 손으로 고치지 말 것) -->',
    ...keepHead,
    '<style>:root { color-scheme: dark; background: #050207; } html, body { background: #050207; color: #efe4cf; margin: 0; }</style>',
    stripV(body.trim()),
    '',
  ].join('\n');
  put('index.html', page);

  // 페이지가 부르는 파일이 모두 있는지
  const refs = [...page.matchAll(/(?:src|href)="([^"#?]+)/g)].map((x) => x[1]).filter((u) => !/^(https?:|data:)/.test(u));
  const missing = refs.filter((u) => !files.has(u));
  if (missing.length) throw new ArtifactError('페이지가 부르는 파일이 없습니다: ' + missing.join(', '));
  // css 의 글꼴
  for (const css of ['css/style.css', 'css/touchpad.css']) {
    if (!files.has(css)) continue;
    for (const [, u] of fs.readFileSync(path.join(OUT, css), 'utf8').matchAll(/url\(["']?\.\.\/([^"')?]+)/g)) if (!files.has(u)) missing.push(`${css} → ${u}`);
  }
  if (missing.length) throw new ArtifactError('CSS 가 부르는 파일이 없습니다: ' + missing.join(', '));
  const bad = [...files.keys()].filter((r) => denyReason(r));
  if (bad.length) throw new ArtifactError('공개 금지 파일: ' + bad.join(', '));

  const meta = { from: posix(path.relative(ROOT, WEB)), buildHash: bj.buildHash, version: bj.version, built: new Date().toISOString(), chunks: bj.bundle.chunks.length, packs: packs.map((p, i) => ({ file: `assets/packs/${i}.bin`, files: p.list.length, bytes: p.size })), loose: loose.length };
  const rep = check(OUT, meta);
  say(`아티팩트: ${posix(path.relative(ROOT, OUT))}/ — 파일 ${rep.files}개 ${fmtMB(rep.bytes)} (조각 ${meta.chunks}, 팩 ${packs.length}개 [${packs.map((p) => fmtMB(p.size)).join(', ')}], 파일로 둔 그림·글꼴 ${loose.length}개), 올리기 ${rep.batches.length}번`);
  return rep;
}

/** 한도 검사 + 올리기 계획 (dist/artifact_publish.json). 위반은 ArtifactError */
export function check(OUT = path.join(ROOT, 'dist/artifact'), meta = null) {
  if (!fs.existsSync(path.join(OUT, 'index.html'))) throw new ArtifactError('dist/artifact/index.html 이 없습니다');
  const planPath = path.join(ROOT, 'dist/artifact_publish.json');
  if (!meta) { try { meta = JSON.parse(fs.readFileSync(planPath, 'utf8')).meta; } catch { meta = {}; } }
  const list = walk(OUT).map((rel) => ({ rel, bytes: fs.statSync(path.join(OUT, rel)).size }));
  const problems = [];
  const bytes = list.reduce((s, f) => s + f.bytes, 0);
  if (list.length > LIMITS.versionFiles) problems.push(`파일 ${list.length}개 > 한 판 ${LIMITS.versionFiles}개`);
  if (bytes > LIMITS.versionBytes) problems.push(`${fmtMB(bytes)} > 한 판 ${fmtMB(LIMITS.versionBytes)}`);
  for (const f of list) {
    const lim = TEXT.test(f.rel) ? LIMITS.textFileBytes : LIMITS.binFileBytes;
    if (f.bytes > lim) problems.push(`${f.rel} ${fmtMB(f.bytes)} > 파일 하나 ${fmtMB(lim)}`);
    const ext = path.extname(f.rel).toLowerCase();
    if (!CONTENT_TYPE[ext]) problems.push(`${f.rel}: 알 수 없는 형식 (${ext})`);
    if (denyReason(f.rel)) problems.push(`${f.rel}: 공개 금지`);
  }
  const chunks = list.filter((f) => /^src\/bundle\/[^/]+\/[^/]+\.js$/.test(f.rel)).length;
  const packs = list.filter((f) => /^assets\/packs\/\d+\.bin$/.test(f.rel)).length;
  if (chunks > LIMITS.chunks) problems.push(`코드 조각 ${chunks}개 > ${LIMITS.chunks}`);
  if (packs > LIMITS.packs) problems.push(`팩 ${packs}개 > ${LIMITS.packs}`);
  // 올리기 묶음: 첫 묶음 = 페이지 + 작은 파일들, 큰 파일은 뒤로. 한 묶음 ≤ 255개·64 MB (페이지 포함)
  const page = list.find((f) => f.rel === 'index.html');
  const others = list.filter((f) => f !== page).sort((a, b) => a.bytes - b.bytes || (a.rel < b.rel ? -1 : 1));
  const batches = [];
  let cur = { page: 'index.html', files: [], bytes: page.bytes, count: 1 };
  for (const f of others) {
    if (cur.count + 1 > LIMITS.batchFiles || cur.bytes + f.bytes > LIMITS.batchBytes) { batches.push(cur); cur = { page: null, files: [], bytes: 0, count: 0 }; }
    if (f.bytes > LIMITS.batchBytes) problems.push(`${f.rel} 가 한 번 올리기 한도보다 큽니다`);
    cur.files.push({ path: f.rel, bytes: f.bytes, contentType: CONTENT_TYPE[path.extname(f.rel).toLowerCase()] });
    cur.bytes += f.bytes; cur.count++;
  }
  batches.push(cur);
  for (const [i, b] of batches.entries()) if (b.count > LIMITS.batchFiles || b.bytes > LIMITS.batchBytes) problems.push(`올리기 ${i + 1}: ${b.count}개 ${fmtMB(b.bytes)} (한도 ${LIMITS.batchFiles}개·${fmtMB(LIMITS.batchBytes)})`);
  const rep = { ok: problems.length === 0, files: list.length, bytes, chunks, packs, batches: batches.map((b, i) => ({ n: i + 1, count: b.count, bytes: b.bytes, page: b.page, files: b.files })), limits: LIMITS, problems, meta };
  fs.writeFileSync(planPath, JSON.stringify(rep, null, 1) + '\n');
  if (problems.length) throw new ArtifactError('아티팩트 한도 위반:\n  ' + problems.join('\n  '));
  return rep;
}

/** 로컬 확인: 조각 페이지를 문서 뼈대로 감싸 띄우고 타이틀·마을·스테이지·보스방 (데스크톱) + 스테이지 (휴대폰 844×390 터치) 를 연다.
 *  장면마다 받은 팩 수와 바이트(packMB)를 보고한다 — 팩 묶음이 나쁘면 한 장면이 수십 MB 를 받는다 */
export async function smokeArtifact({ dir = path.join(ROOT, 'dist/artifact'), quiet = false } = {}) {
  const { chromium } = await import('playwright-core');
  const { start } = await import('./serve_dist.mjs');
  const tmp = path.join(ROOT, 'dist/.artifact-smoke');
  rmrf(tmp);
  for (const rel of walk(dir)) { const d = path.join(tmp, rel); mkdirp(path.dirname(d)); try { fs.linkSync(path.join(dir, rel), d); } catch { fs.copyFileSync(path.join(dir, rel), d); } }
  const frag = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  fs.rmSync(path.join(tmp, 'index.html'));
  fs.writeFileSync(path.join(tmp, 'index.html'), `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>\n${frag}\n</body></html>\n`);
  const srv = await start(0, { dir: tmp, toml: path.join(tmp, '__none__.toml'), quiet: true });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
  const results = [];
  try {
    const PHONE = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
    const packSize = (p) => { try { return fs.statSync(path.join(dir, p.replace(/^\//, ''))).size; } catch { return 0; } };
    for (const [id, u, wait, dev] of [['title', 'index.html', 2500], ['hub', 'index.html?scene=hub', 3000], ['stage', 'index.html?scene=stage&stage=s01', 3500],
      ['boss', 'index.html?scene=stage&stage=s04&room=boss', 5000], ['phone.stage', 'index.html?scene=stage&stage=s01', 3500, PHONE]]) {
      const ctx = await browser.newContext(dev || { viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      const errs = [], miss = [], net = [];
      page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 200)); });
      page.on('response', (r) => { const p = new URL(r.url()).pathname; if (r.status() >= 400 && !/^\/(api|downloads)\//.test(p)) miss.push(`${r.status()} ${p}`); });
      page.on('request', (r) => net.push(new URL(r.url()).pathname));
      let info = null;
      try {
        await page.goto(`${srv.origin}/${u}`, { timeout: 60000 });
        await page.waitForFunction(() => window.__game?.scenes?.length > 0 && !document.getElementById('boot'), null, { timeout: 90000, polling: 200 });
        await page.waitForTimeout(wait);
        info = await page.evaluate(() => ({ scenes: window.__game.scenes.map((s) => s.name).join('>'), packs: window.__game.assets?.stats?.().packs?.map((p) => `${p.files}:${p.loaded}`).join(',') ?? null, sw: !!navigator.serviceWorker?.controller }));
      } catch (e) { errs.push('HARNESS ' + e.message); }
      const packReqs = [...new Set(net.filter((p) => /^\/assets\/packs\/\d+\.bin$/.test(p)))];
      if (info) info.packMB = +(packReqs.reduce((s, p) => s + packSize(p), 0) / MB).toFixed(1);
      const looseAssetReqs = net.filter((p) => /^\/assets\/(bg|cg|portraits|puppets|icons|props|tex|ui|lo)\//.test(p));
      const r = { id, pass: !errs.length && !miss.length && !looseAssetReqs.length && !info?.sw, info, errs, miss: [...new Set(miss)], looseAssetReqs: [...new Set(looseAssetReqs)].slice(0, 10) };
      results.push(r);
      if (!quiet) console.log(`${r.pass ? '✓' : '✗'} artifact.${id} ${JSON.stringify(info)}${r.errs.length ? '\n    ' + r.errs.slice(0, 4).join('\n    ') : ''}${r.miss.length ? '\n    404: ' + r.miss.slice(0, 6).join(', ') : ''}${r.looseAssetReqs.length ? '\n    팩 밖 그림 요청: ' + r.looseAssetReqs.join(', ') : ''}`);
      await ctx.close();
    }
  } finally {
    await browser.close().catch(() => {});
    await srv.close();
    rmrf(tmp);
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs();
  const from = path.resolve(ROOT, a.from || 'dist/web');
  const OUT = path.join(ROOT, 'dist/artifact');
  try {
    let rep;
    if (a.check) {
      // 있으면 그대로 검사, 없거나 dist/web 과 다른 빌드면 새로 만든 뒤 검사
      let fresh = false;
      try {
        const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/artifact_publish.json'), 'utf8'));
        const bj = JSON.parse(fs.readFileSync(path.join(from, 'build.json'), 'utf8'));
        fresh = fs.existsSync(path.join(OUT, 'index.html')) && plan.meta?.buildHash === bj.buildHash;
      } catch { fresh = false; }
      rep = fresh ? check(OUT) : buildArtifact({ from, packMB: Number(a['pack-mb'] || 4) });
      console.log(`검사 통과: 파일 ${rep.files}/${LIMITS.versionFiles}개, ${fmtMB(rep.bytes)}/${fmtMB(LIMITS.versionBytes)}, 조각 ${rep.chunks}/${LIMITS.chunks}, 팩 ${rep.packs}/${LIMITS.packs}, 올리기 ${rep.batches.length}번 (${rep.batches.map((b) => `${b.count}개 ${fmtMB(b.bytes)}`).join(' · ')}) — 계획: dist/artifact_publish.json`);
    } else {
      rep = buildArtifact({ from, packMB: Number(a['pack-mb'] || 4) });
    }
    if (a.smoke) {
      const res = await smokeArtifact({});
      if (!res.every((r) => r.pass)) { console.error('아티팩트 확인 실패'); process.exit(1); }
    }
    process.exit(0);
  } catch (e) {
    console.error(e instanceof ArtifactError ? `아티팩트 실패: ${e.message}` : e.stack || e);
    process.exit(1);
  }
}
