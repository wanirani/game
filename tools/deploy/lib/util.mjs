// 배포 도구 공용 함수 — owner: DELIVERY-WEB
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const posix = (p) => p.split(path.sep).join('/');
export const MB = 1048576;

// ── 공개 금지 (platform §9.1, MASTER_PLAN §1.20): 경로에 이 폴더가 있거나, 이런 확장자면 빌드 실패 ──
export const DENY_DIR = /(^|\/)(tools|docs|android|node_modules|netlify|dist|\.git|\.netlify)(\/|$)/;
export const DENY_EXT = /\.(keystore|jks|p12|pfx|pem|key|properties|env)$|(^|\/)\.env(\.|$)|(^|\/)keystore\.properties$/i;
/** 배포 폴더 안의 상대 경로가 금지 대상인지 → 이유 | null */
export function denyReason(rel) {
  if (DENY_DIR.test(rel)) return `개발용 폴더 (${DENY_DIR.exec(rel)[2]})`;
  if (DENY_EXT.test(rel)) return '비밀 파일 형식 (키스토어·인증서·설정·.env)';
  return null;
}

/** 디렉터리 아래 모든 파일 (상대 경로, posix, 정렬) */
export function walk(dir, { skip = null } = {}) {
  const out = [];
  const rec = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      const f = path.join(d, e.name);
      const rel = posix(path.relative(dir, f));
      if (skip && skip(rel, e)) continue;
      if (e.isDirectory()) rec(f);
      else if (e.isFile()) out.push(rel);
      else if (e.isSymbolicLink()) out.push(rel); // 심볼릭 링크도 목록에 (복사 단계에서 거부)
    }
  };
  rec(dir);
  return out;
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const fileHash = (f) => sha256(fs.readFileSync(f));

export function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
export function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

/** out 이 ROOT/dist 안인지 (지우기 전에 확인) */
export function assertInsideDist(p) {
  const rel = posix(path.relative(path.join(ROOT, 'dist'), path.resolve(p)));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`출력 폴더는 dist/ 아래여야 합니다: ${p}`);
}

const COMPRESSIBLE = /\.(html|js|mjs|css|json|webmanifest|svg|txt|xml|map)$/i;
export const isCompressible = (f) => COMPRESSIBLE.test(f);

/** 파일 전송 크기 (brotli q11 / gzip 9, 압축하지 않는 형식은 원래 크기) */
export function transferSizes(buf, name) {
  if (!isCompressible(name)) return { raw: buf.length, br: buf.length, gz: buf.length };
  const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }).length;
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  return { raw: buf.length, br, gz };
}

export const fmtMB = (n) => (n / MB).toFixed(2) + ' MB';
export const fmtKB = (n) => (n / 1024).toFixed(0) + ' KB';

/** 간단한 인자 읽기: --a --b=1 --c 2 → {a:true, b:'1', c:'2'} */
export function parseArgs(argv = process.argv.slice(2)) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (!s.startsWith('--')) { a._.push(s); continue; }
    const eq = s.indexOf('=');
    if (eq > 0) { a[s.slice(2, eq)] = s.slice(eq + 1); continue; }
    const k = s.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--') && VALUE_FLAGS.has(k)) a[k] = argv[++i];
    else a[k] = true;
  }
  return a;
}
const VALUE_FLAGS = new Set(['out', 'dir', 'apk', 'from', 'port', 'root', 'base', 'net', 'max-lazy', 'version', 'only', 'origin']);

// ── netlify.toml 의 [[headers]] / [[redirects]] 읽기 (serve_dist 와 smoke 가 같은 규칙을 쓴다) ──
/** 아주 작은 TOML 부분 해석기: [[headers]] for/values, [[redirects]] from/to/status/force, [build]·[functions] 키. */
export function parseNetlifyToml(text) {
  const out = { build: {}, functions: {}, headers: [], redirects: [], environment: {} };
  let cur = null, curValues = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s+|\s+$/g, '');
    if (!line || line.startsWith('#')) continue;
    let m;
    if ((m = /^\[\[(\w+)\]\]$/.exec(line))) {
      if (m[1] === 'headers') { cur = { for: null, values: {} }; out.headers.push(cur); curValues = null; }
      else if (m[1] === 'redirects') { cur = { from: null, to: null, status: 301, force: false }; out.redirects.push(cur); curValues = null; }
      else { cur = {}; curValues = null; }
      continue;
    }
    if ((m = /^\[([\w.]+)\]$/.exec(line))) {
      const k = m[1];
      if (k === 'headers.values' && cur) { curValues = cur.values; continue; }
      if (k === 'build') { cur = out.build; curValues = null; continue; }
      if (k === 'build.environment') { cur = out.environment; curValues = null; continue; }
      if (k === 'functions') { cur = out.functions; curValues = null; continue; }
      cur = {}; curValues = null;
      continue;
    }
    if ((m = /^([\w.-]+)\s*=\s*(.+)$/.exec(line))) {
      const key = m[1];
      let v = m[2].replace(/\s+#.*$/, '');
      let val;
      if (/^"/.test(v)) { try { val = JSON.parse(v.replace(/\s+$/, '')); } catch { val = v.slice(1, v.lastIndexOf('"')); } }
      else if (/^'/.test(v)) val = v.slice(1, v.lastIndexOf("'"));
      else if (v === 'true' || v === 'false') val = v === 'true';
      else if (/^\d+$/.test(v)) val = Number(v);
      else val = v;
      if (curValues) curValues[key] = val;
      else if (cur) cur[key] = val;
    }
  }
  return out;
}

/** Netlify 경로 규칙: '/assets/*' 는 접두, '/*' 는 모두, 그 밖은 정확히 */
export function netlifyPathMatch(pattern, p) {
  if (pattern === '/*') return true;
  if (pattern.endsWith('/*')) return p.startsWith(pattern.slice(0, -1)) || p === pattern.slice(0, -2);
  if (pattern.includes('*')) {
    const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return re.test(p);
  }
  return p === pattern;
}

/**
 * 경로에 붙는 헤더. Netlify 처럼 일치하는 규칙을 모두 합치고, 같은 이름이 둘 이상의 규칙에서 오면 값을 ', ' 로 이어 붙인다
 * (그래서 Cache-Control 규칙이 겹치면 안 된다 — dups 에 기록해 빌드·스모크가 잡는다).
 */
export function headersFor(rules, p, dups = null) {
  const h = {};
  const lower = {};
  for (const r of rules) {
    if (!r.for || !netlifyPathMatch(r.for, p)) continue;
    for (const [k, v] of Object.entries(r.values)) {
      const lk = k.toLowerCase();
      if (lower[lk] !== undefined) { h[lower[lk]] = `${h[lower[lk]]}, ${v}`; if (dups) dups.push({ path: p, header: k, rule: r.for }); }
      else { lower[lk] = k; h[k] = v; }
    }
  }
  return h;
}

/** _redirects 파일 읽기 → [{from, to, status}] */
export function parseRedirectsFile(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [from, to, status] = line.split(/\s+/);
    if (from && to) out.push({ from, to, status: Number(status || 301) || 301, force: /!$/.test(status || '') });
  }
  return out;
}

// ── APK 정보 (zip 안 AndroidManifest.xml 이진 XML 에서 versionCode/versionName) ──
export function apkInfo(file) {
  const buf = fs.readFileSync(file);
  const info = { bytes: buf.length, sha256: sha256(buf), versionName: null, versionCode: null, package: null, webBuildHash: null, webVersion: null, builtAt: null };
  try {
    const xml = zipEntry(buf, 'AndroidManifest.xml');
    if (xml) Object.assign(info, axmlManifestInfo(xml));
  } catch { /* 버전 정보 없이 */ }
  // APK 에 실은 웹 빌드 (PS-07): assets/app/apk.json 의 web.buildHash (tools/apk/pack_web.py), 없으면 assets/www/build-info.js 의 hash
  try {
    const cfg = zipEntry(buf, 'assets/app/apk.json');
    const w = cfg ? JSON.parse(cfg.toString('utf8'))?.web : null;
    if (w && typeof w === 'object') { info.webBuildHash = w.buildHash || w.hash || null; info.webVersion = w.version || null; }
  } catch { /* 없음 */ }
  if (!info.webBuildHash) {
    try {
      const bi = zipEntry(buf, 'assets/www/build-info.js')?.toString('utf8') || '';
      const m = /window\.__BN_BUILD\s*=\s*(\{.*\});?\s*$/m.exec(bi);
      const j = m ? JSON.parse(m[1]) : null;
      if (j) { info.webBuildHash = j.hash || null; info.webVersion = j.version || null; }
    } catch { /* 없음 */ }
  }
  // APK 를 만든 시각 = 서명된 파일의 수정 시각 (build_apk.sh 가 검사를 모두 통과한 뒤 dist/BloodNocturne.apk 로 옮긴다)
  try { info.builtAt = fs.statSync(file).mtime.toISOString(); } catch { /* 없음 */ }
  return info;
}
function zipEntry(buf, name) {
  // 중앙 디렉터리 끝 (EOCD) 찾기
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const fname = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (fname === name) {
      const lnlen = buf.readUInt16LE(lho + 26), lxlen = buf.readUInt16LE(lho + 28);
      const data = buf.subarray(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize);
      return method === 0 ? data : method === 8 ? zlib.inflateRawSync(data) : null;
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}
function axmlManifestInfo(x) {
  // 이진 XML: 문자열 풀(0x0001) → 리소스 맵 → 시작 태그(0x0102) 들. <manifest> 의 속성을 읽는다.
  const out = {};
  let strings = [];
  let p = 8;
  while (p + 8 <= x.length) {
    const type = x.readUInt16LE(p), hsize = x.readUInt16LE(p + 2), size = x.readUInt32LE(p + 4);
    if (size <= 0) break;
    if (type === 0x0001) {
      const count = x.readUInt32LE(p + 8), flags = x.readUInt32LE(p + 16), sstart = x.readUInt32LE(p + 20);
      const utf8 = (flags & 0x100) !== 0;
      strings = [];
      for (let i = 0; i < count; i++) {
        const off = p + sstart + x.readUInt32LE(p + hsize + i * 4);
        if (utf8) {
          let q = off;
          let u16len = x[q++]; if (u16len & 0x80) q++;
          let len = x[q++]; if (len & 0x80) { len = ((len & 0x7f) << 8) | x[q++]; }
          strings.push(x.toString('utf8', q, q + len));
        } else {
          let len = x.readUInt16LE(off); let q = off + 2;
          if (len & 0x8000) { len = ((len & 0x7fff) << 16) | x.readUInt16LE(q); q += 2; }
          strings.push(x.toString('utf16le', q, q + len * 2));
        }
      }
    } else if (type === 0x0102) {
      const tagName = strings[x.readUInt32LE(p + 16 + 4)];
      if (tagName === 'manifest') {
        const attrStart = x.readUInt16LE(p + 16 + 8), attrSize = x.readUInt16LE(p + 16 + 10), attrCount = x.readUInt16LE(p + 16 + 12);
        for (let i = 0; i < attrCount; i++) {
          const a = p + 16 + attrStart + i * attrSize;
          const an = strings[x.readUInt32LE(a + 4)];
          const rawIx = x.readInt32LE(a + 8);
          const dtype = x[a + 15], data = x.readUInt32LE(a + 16);
          const val = rawIx >= 0 ? strings[rawIx] : dtype === 0x10 || dtype === 0x11 ? data : dtype === 0x03 ? strings[data] : data;
          if (an === 'versionCode') out.versionCode = Number(val);
          else if (an === 'versionName') out.versionName = String(val);
          else if (an === 'package') out.package = String(val);
        }
        break;
      }
    }
    p += size;
  }
  return out;
}
