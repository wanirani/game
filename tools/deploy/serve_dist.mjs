#!/usr/bin/env node
// dist/web 로컬 서버 (Netlify 흉내) — owner: DELIVERY-WEB (platform §9.1 serve_dist, §11 WP-8 acceptance)
//
//   node tools/deploy/serve_dist.mjs [--port 8090] [--dir dist/web] [--quiet]
//   import { start } from './serve_dist.mjs';  const s = await start(0, { dir, quiet: true });  s.port … await s.close();
//
// · netlify.toml 의 [[headers]] 를 Netlify 처럼 붙인다 (겹치는 규칙의 같은 헤더는 값을 이어 붙임 — 설정 실수를 그대로 드러낸다)
// · dist/web/_redirects 의 리디렉트 (정확한 경로, 끝의 /* 는 :splat)
// · brotli / gzip (Accept-Encoding 에 따라, 텍스트 형식만, 미리 압축해 메모리에 둔다), ETag + If-None-Match → 304
// · /api/* 는 함수가 없으므로 404 JSON (게임은 계정 기능을 숨긴다)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, parseNetlifyToml, headersFor, parseRedirectsFile, netlifyPathMatch, isCompressible, parseArgs } from './lib/util.mjs';

export const MIME = {
  '.html': 'text/html; charset=UTF-8', '.js': 'application/javascript; charset=UTF-8', '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8', '.json': 'application/json; charset=UTF-8', '.webmanifest': 'application/manifest+json; charset=UTF-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=UTF-8', '.xml': 'application/xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.apk': 'application/vnd.android.package-archive', '.bin': 'application/octet-stream',
};

export async function start(port = 0, { dir = path.join(ROOT, 'dist/web'), toml = path.join(ROOT, 'netlify.toml'), quiet = false, host = undefined } = {}) {
  const root = path.resolve(dir);
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`${root}/index.html 이 없습니다 — node tools/deploy/build_web.mjs 먼저`);
  const conf = fs.existsSync(toml) ? parseNetlifyToml(fs.readFileSync(toml, 'utf8')) : { headers: [], redirects: [] };
  const redirectsFile = path.join(root, '_redirects');
  const redirects = [...(fs.existsSync(redirectsFile) ? parseRedirectsFile(fs.readFileSync(redirectsFile, 'utf8')) : []), ...conf.redirects];
  const cache = new Map(); // file → {mtime, etag, raw, br, gz}

  const load = (f) => {
    const st = fs.statSync(f);
    let c = cache.get(f);
    if (c && c.mtime === st.mtimeMs && c.size === st.size) return c;
    const raw = fs.readFileSync(f);
    c = { mtime: st.mtimeMs, size: st.size, raw, etag: '"' + crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"', br: null, gz: null };
    if (isCompressible(f)) {
      c.br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      c.gz = zlib.gzipSync(raw, { level: 6 });
    }
    cache.set(f, c);
    return c;
  };

  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end('bad url'); return; }
    const done = (code) => { if (!quiet) console.log(`${code} ${req.method} ${req.url}`); };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); done(405); return; }
    // /api/* : 함수 없음
    if (/^\/api(\/|$)/.test(pathname)) {
      const body = JSON.stringify({ ok: false, error: 'not_found', message: '로컬 서버에는 계정 API 가 없습니다' });
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
      res.end(req.method === 'HEAD' ? undefined : body); done(404); return;
    }
    // 파일 찾기 (Netlify: 파일이 있으면 리디렉트보다 먼저 — force 가 아니면)
    let rel = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    let file = path.join(root, rel);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); done(403); return; }
    let exists = false;
    try { exists = fs.statSync(file).isFile(); } catch { exists = false; }
    if (!exists || redirects.some((r) => r.force && netlifyPathMatch(r.from, pathname))) {
      for (const r of redirects) {
        if (!netlifyPathMatch(r.from, pathname)) continue;
        if (exists && !r.force) break;
        const splat = r.from.endsWith('/*') ? pathname.slice(r.from.length - 1) : '';
        const to = r.to.replace(':splat', splat);
        if (r.status === 200) { rel = to; file = path.join(root, to); try { exists = fs.statSync(file).isFile(); } catch { exists = false; } break; }
        if (r.status === 404) { exists = false; break; }
        res.writeHead(r.status, { Location: to, 'Cache-Control': 'no-cache' });
        res.end(); done(r.status); return;
      }
    }
    if (!exists) {
      const nf = path.join(root, '404.html');
      const body = fs.existsSync(nf) ? fs.readFileSync(nf) : Buffer.from('Not Found');
      res.writeHead(404, { 'Content-Type': fs.existsSync(nf) ? MIME['.html'] : 'text/plain; charset=UTF-8', 'Cache-Control': 'no-cache', ...headersFor(conf.headers, pathname) });
      res.end(req.method === 'HEAD' ? undefined : body); done(404); return;
    }
    const c = load(file);
    const ext = path.extname(file).toLowerCase();
    const h = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: c.etag, Vary: 'Accept-Encoding', 'Cache-Control': 'public, max-age=0, must-revalidate', ...headersFor(conf.headers, pathname) };
    // 헤더 규칙이 Cache-Control 을 주면 기본값을 덮는다 (Netlify 기본값도 max-age=0, must-revalidate)
    if (req.headers['if-none-match'] === c.etag) { res.writeHead(304, h); res.end(); done(304); return; }
    const ae = String(req.headers['accept-encoding'] || '');
    let body = c.raw;
    if (c.br && /\bbr\b/.test(ae)) { body = c.br; h['Content-Encoding'] = 'br'; }
    else if (c.gz && /\bgzip\b/.test(ae)) { body = c.gz; h['Content-Encoding'] = 'gzip'; }
    h['Content-Length'] = body.length;
    res.writeHead(200, h);
    res.end(req.method === 'HEAD' ? undefined : body);
    done(200);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const p = server.address().port;
  if (!quiet) console.log(`dist 서버: http://localhost:${p}/ (${path.relative(ROOT, root) || root})`);
  return { port: p, origin: `http://localhost:${p}`, server, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs();
  await start(Number(a.port || 8090), { dir: a.dir ? path.resolve(ROOT, a.dir) : undefined, quiet: !!a.quiet });
}
