// 블러드 녹턴 서비스 워커 — owner: DELIVERY-WEB (platform §9.3, P-10; MASTER_PLAN §1.20)
//
// 배포 빌드(tools/deploy/build_web.mjs)가 아래 BUILD 자리에 {hash, version, precache, assets, manifest} 를 넣는다.
// 자리가 비어 있으면(null) 개발 서버(tools/serve.mjs)에서 도는 개발용 워커: 코드가 늘 최신이도록 네트워크 우선, 오프라인일 때만 캐시.
//
// 배포 빌드 동작:
//  · install  : bn-<buildHash> 에 코드·CSS·글꼴·index.html 을 미리 받고(HTTP 캐시를 거치지 않고 다시 확인), build.json(파일별 해시)도 넣는다.
//               bn-assets-v1 에 타이틀 배경·앱 아이콘을 넣는다. skipWaiting() 은 하지 않는다 — 게임이 {type:'SKIP_WAITING'} 을 보낼 때만
//               (타이틀의 [업데이트], src/core/platform.js applyUpdate). 게임 중에 새 코드로 바뀌는 일이 없다.
//  · activate : bn-<buildHash>·bn-assets-v1 이 아닌 캐시를 모두 지우고, bn-assets-v1 에서 새 build.json 과 해시가 다른 그림을 지운 뒤 clients.claim().
//  · fetch    : GET·같은 출처만. /api/·/downloads/·build.json·sw.js·Range 요청은 건드리지 않는다 (계정 응답은 절대 캐시하지 않는다).
//               페이지 이동 = 네트워크 우선 3초, 실패·시간 초과면 캐시의 index.html.
//               /src/·/css/·/assets/fonts/·build-info.js = bn-<buildHash> 에서 캐시 우선 (주소에 내용 해시가 붙어 있어 섞이지 않는다).
//               /assets/** = bn-assets-v1 에서 캐시 우선. 키는 경로(쿼리 제외)이고 저장할 때 받은 내용의 sha256 앞 8자리를 x-bn-h 로
//               붙여 둔다 → build.json 의 해시와 다르면(새 배포에서 그림이 바뀜) 쓰지 않고 새로 받는다. 오래된 것부터 지워 최대 MAX_ASSETS 개.
//               /assets/audio/** = bn-audio-v1 (같은 해시 검증, 설치 때 미리 받지 않음 — 녹음 음악은 곡마다 1~3 MB). 바이트 상한 AUDIO_MAX_BYTES:
//               넘으면 오래된 음악부터 지운다 (효과음·목록은 작아서 마지막에). 크기는 저장할 때 x-bn-len 으로 붙인다.
//  · 새 배포 : 페이지 이동이 네트워크 우선이라 배포 뒤에는 페이지가 이미 새 빌드 코드로 도는데, 이 (옛) 워커는 새 워커가 SKIP_WAITING 을
//               받을 때까지 계속 제어한다. 그 페이지는 build-info.js?v= 가 이 빌드와 달라서 알아본다 → 새 build.json 을 받아(build.next.json
//               으로 보관) 그 페이지의 그림·해시 없는 파일(JS 글꼴·fonts.json)을 새 해시로 검증한다 (새 코드에 옛 리그·아틀라스를 주지 않게).
// 오프라인이면 캐시에 있는 것은 무엇이든 (낡았어도) 돌려준다.
'use strict';

const BUILD = /*BN_BUILD*/null/*BN_BUILD_END*/;
const CACHE = BUILD ? `bn-${BUILD.hash}` : 'bn-dev';
const ASSETS = 'bn-assets-v1';
const AUDIO = 'bn-audio-v1';
// 녹음 음악·효과음 캐시 바이트 상한 (곡 20~30개 분량 — 한 번 플레이에 듣는 곡은 오프라인에서도 다시 받지 않는다)
const AUDIO_MAX_BYTES = 64 * 1024 * 1024;
// 그림 캐시 상한: 한 번 플레이에 쓰는 그림(아이콘 120여 개, 영웅 퍼펫, 채색 괴물·보스 아틀라스, 배경)이 250개를 넘어
// 캐시가 계속 갈리지 않도록 넉넉히 잡는다. 경로당 하나(해시가 바뀌면 교체)라 게임 전체 그림 수를 넘지 않는다.
const MAX_ASSETS = 800;
const DEV_MAX = 400;
const NAV_TIMEOUT_MS = 3000;
const SCOPE = new URL(self.registration ? self.registration.scope : self.location.href);
const BASE = SCOPE.pathname.endsWith('/') ? SCOPE.pathname : SCOPE.pathname.replace(/[^/]*$/, '');

const abs = (u) => new URL(u, SCOPE).href;
const relOf = (url) => (url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname.replace(/^\//, ''));
// 이 빌드의 페이지가 부르는 build-info.js 주소 (?v= = build-info.js 내용 해시 = build.json 의 files['build-info.js'].hash8)
const OWN_INFO = BUILD ? (BUILD.precache || []).find((u) => /^build-info\.js\?v=/.test(u)) || null : null;

// ───────────────────────── install ─────────────────────────
self.addEventListener('install', (event) => {
  if (!BUILD) return; // 개발용: 미리 받지 않는다
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 코드·CSS·글꼴: HTTP 캐시를 믿지 않고 서버에 다시 확인해서 받는다 (cache: 'no-cache')
    await pool(BUILD.precache, 6, async (u) => {
      const res = await fetch(new Request(abs(u), { cache: 'no-cache', credentials: 'same-origin' }));
      if (!res.ok) throw new Error(`precache ${u}: ${res.status}`);
      await cache.put(abs(u), res);
    });
    // 파일별 해시 (그림 캐시 검증용)
    const man = await fetch(new Request(abs(BUILD.manifest), { cache: 'no-cache' }));
    if (!man.ok) throw new Error(`build.json: ${man.status}`);
    await cache.put(abs('build.json'), man.clone());
    manifestP = man.json().then((j) => (j && j.files) || {}, () => ({}));
    // 타이틀 배경·아이콘 (실패해도 설치는 계속)
    const files = await manifestP;
    const ac = await caches.open(ASSETS);
    await pool(BUILD.assets || [], 4, async (u) => {
      const want = files[u] && files[u].hash8;
      const hit = await ac.match(abs(u));
      if (hit && want && hit.headers.get('x-bn-h') === want) return;
      try {
        const res = await fetch(new Request(abs(u), { cache: 'no-cache' }));
        if (res.ok && res.status === 200) await ac.put(abs(u), await stamp(res));
      } catch (e) { /* 오프라인 등: 나중에 쓸 때 받는다 */ }
    });
  })());
});

// 대기 중인 새 워커는 게임이 요청할 때만 켠다 (타이틀 [업데이트] → platform.applyUpdate)
self.addEventListener('message', (event) => {
  const d = event.data;
  if (d && d.type === 'SKIP_WAITING') self.skipWaiting();
});

// ───────────────────────── activate ─────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CACHE, ASSETS, AUDIO]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    if (BUILD) {
      // 새 배포에서 바뀌었거나 사라진 그림·소리는 지운다 (낡은 그림을 새 코드와 섞어 쓰지 않도록)
      const files = await manifest();
      for (const name of [ASSETS, AUDIO]) {
        const ac = await caches.open(name);
        for (const req of await ac.keys()) {
          const res = await ac.match(req);
          const f = files[relOf(new URL(req.url))];
          if (!f || !res || res.headers.get('x-bn-h') !== f.hash8) await ac.delete(req);
        }
      }
    } else {
      await caches.delete(ASSETS); // 개발용 워커는 그림·소리 캐시를 따로 두지 않는다
      await caches.delete(AUDIO);
    }
    await self.clients.claim();
  })());
});

// ───────────────────────── fetch ─────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const rel = relOf(url);
  // 계정·클라우드 API, APK 내려받기, 빌드 정보, 워커 자신은 절대 가로채지 않는다
  if (/^(api|downloads|download)(\/|$)/.test(rel) || rel === 'build.json' || rel === 'sw.js' || rel === 'apk') return;
  if (req.headers.has('range')) return;
  if (req.mode === 'navigate') { event.respondWith(navigate(event)); return; }
  if (!BUILD) { event.respondWith(devFetch(event, req)); return; }
  if (rel === 'build-info.js') notePage(event, url);
  if (rel.startsWith('assets/audio/')) { event.respondWith(assetFetch(event, req, url, rel, AUDIO)); return; }
  if (rel.startsWith('assets/') && !rel.startsWith('assets/fonts/')) { event.respondWith(assetFetch(event, req, url, rel)); return; }
  event.respondWith(codeFetch(event, req, url, rel));
});

// 페이지 이동: 네트워크 우선 (배포 빌드는 3초, 개발용은 기다린다), 안 되면 캐시한 index.html
async function navigate(event) {
  const req = event.request;
  const net = fetch(req).catch(() => null);
  const res = BUILD ? await Promise.race([net, sleep(NAV_TIMEOUT_MS).then(() => undefined)]) : await net;
  if (res && (res.ok || res.status < 500)) {
    // 개발용 워커: 받은 index.html 을 오프라인 대비로 둔다 (배포 빌드는 미리 받은 이 빌드의 index.html 만 쓴다)
    if (!BUILD && res.ok && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(caches.open(CACHE).then((c) => c.put(abs('index.html'), copy)).catch(() => {}));
    }
    return res;
  }
  const cached = await caches.match(abs('index.html'), { cacheName: CACHE }) || await caches.match(abs('index.html'));
  if (cached) return cached;
  const late = res === undefined ? await net : res; // 캐시도 없으면 네트워크를 끝까지 기다린다
  return late || Response.error();
}

// 코드·CSS·글꼴: 이 빌드의 캐시 우선 (주소 그대로 — ?v= 내용 해시 포함)
async function codeFetch(event, req, url, rel) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit && !(await staleForPage(event.clientId, url, rel))) return hit;
  try {
    const res = await fetch(req);
    // 새 배포 페이지 때문에 네트워크로 간 것(hit 있음)은 이 빌드의 캐시에 넣지 않는다
    if (!hit && res.ok && res.status === 200 && /^(src|css|assets\/fonts)\//.test(rel)) event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
    return res;
  } catch (e) {
    const any = hit || await caches.match(req, { ignoreSearch: true });
    if (any) return any;
    throw e;
  }
}
// 주소에 내용 해시(?v=)가 없는 파일(JS 가 부르는 글꼴·fonts.json·매니페스트)을 새 배포의 페이지가 부르고, 새 배포에서 내용이 바뀌었으면 true
async function staleForPage(clientId, url, rel) {
  if (url.search || pageBuild.get(clientId) === 'own') return false;
  const next = await nextManifest();
  if (!next) return false;
  const own = (await manifest())[rel];
  return !own || !next[rel] || own.hash8 !== next[rel].hash8;
}

// 그림: 경로 키 + 빌드 해시 검증
let manifestP = null;
function manifest() {
  if (!manifestP) {
    manifestP = caches.open(CACHE).then((c) => c.match(abs('build.json'))).then((r) => (r ? r.json() : null)).then((j) => (j && j.files) || {}, () => ({}));
  }
  return manifestP;
}
async function assetFetch(event, req, url, rel, name = ASSETS) {
  const key = abs(rel);
  const [files, cache] = await Promise.all([filesFor(event.clientId), caches.open(name)]);
  const want = files[rel] && files[rel].hash8;
  const hit = await cache.match(key);
  if (hit && want && hit.headers.get('x-bn-h') === want) return hit;
  try {
    const res = await fetch(req);
    if (want && res.ok && res.status === 200) {
      // 표시는 받은 내용의 해시 (기대 해시가 아니라): 서버가 이미 다른 배포 것을 주었으면 다음 검증에서 걸러진다
      event.waitUntil(stamp(res.clone()).then((r) => cache.put(key, r)).then(() => (name === AUDIO ? trimBytes(cache, AUDIO_MAX_BYTES) : trim(cache, MAX_ASSETS))).catch(() => {}));
    }
    return res;
  } catch (e) {
    if (hit) return hit; // 오프라인: 낡았어도 있는 것을
    throw e;
  }
}

// ── 새 배포를 도는 페이지 (build-info.js?v= 가 이 빌드 것이 아님) ──
const pageBuild = new Map(); // clientId → 'own' | 'next'  (워커가 다시 시작되면 비고, 그때는 보관한 새 build.json 이 있으면 그것을 쓴다)
let nextP = null;            // Promise<새 배포 build.json 의 files | null>
let nextTag = null;
function notePage(event, url) {
  const tag = url.searchParams.get('v') || '';
  const own = OWN_INFO === `build-info.js?v=${tag}`;
  if (event.clientId) {
    pageBuild.set(event.clientId, own ? 'own' : 'next');
    if (pageBuild.size > 32) pageBuild.delete(pageBuild.keys().next().value);
  }
  if (!own && tag) event.waitUntil(refreshNext(tag).catch(() => null));
}
function refreshNext(tag) {
  if (nextP && nextTag === tag) return nextP;
  nextTag = tag;
  nextP = (async () => {
    const kept = await loadNext();
    if (kept && kept.tag === tag) return kept.files;
    try {
      const r = await fetch(new Request(abs('build.json'), { cache: 'no-cache' }));
      if (!r.ok) throw new Error(`build.json ${r.status}`);
      const j = await r.json();
      if (!j || !j.files) throw new Error('build.json files');
      const c = await caches.open(CACHE);
      await c.put(abs('build.next.json'), new Response(JSON.stringify({ tag, files: j.files }), { headers: { 'content-type': 'application/json' } }));
      return j.files;
    } catch (e) {
      return kept ? kept.files : null; // 오프라인: 보관한 것이라도
    }
  })();
  return nextP;
}
function loadNext() {
  return caches.open(CACHE).then((c) => c.match(abs('build.next.json'))).then((r) => (r ? r.json() : null)).then((j) => (j && j.files ? j : null), () => null);
}
function nextManifest() {
  if (!nextP) nextP = loadNext().then((j) => (j ? j.files : null));
  return nextP;
}
// 요청한 페이지의 빌드에 맞는 파일 해시 목록: 이 빌드 페이지 = 우리 build.json, 새 배포 페이지(또는 모름 + 새 배포를 본 적 있음) = 새 build.json
async function filesFor(clientId) {
  if (pageBuild.get(clientId) === 'own') return manifest();
  return (await nextManifest()) || manifest();
}

// 개발용: 네트워크 우선, 오프라인이면 캐시
async function devFetch(event, req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // (녹음 음악은 크므로 개발용 캐시에 넣지 않는다)
    if (res.ok && res.status === 200 && res.type === 'basic' && !/\/assets\/audio\/music\//.test(new URL(req.url).pathname)) event.waitUntil(cache.put(req, res.clone()).then(() => trim(cache, DEV_MAX)).catch(() => {}));
    return res;
  } catch (e) {
    const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

// ───────────────────────── 도우미 ─────────────────────────
// 캐시에 넣을 응답: 몸통의 sha256 앞 8자리(build.json 의 hash8 과 같은 계산)를 x-bn-h 로
async function stamp(res) {
  const h = new Headers(res.headers);
  h.delete('content-encoding'); h.delete('content-length'); // 몸통은 이미 풀린 바이트
  const body = await res.arrayBuffer();
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  let hex = '';
  for (let i = 0; i < 4; i++) hex += d[i].toString(16).padStart(2, '0');
  h.set('x-bn-h', hex);
  h.set('x-bn-len', String(body.byteLength));
  return new Response(body, { status: res.status, statusText: res.statusText, headers: h });
}
// 바이트 상한: 넘으면 음악(assets/audio/music/)부터, 그다음 나머지를 오래된 순으로 지운다
let trimmingB = null;
function trimBytes(cache, max) {
  if (trimmingB) return trimmingB;
  trimmingB = (async () => {
    const ents = [];
    let total = 0;
    for (const k of await cache.keys()) {
      const r = await cache.match(k);
      const n = Number(r && r.headers.get('x-bn-len')) || 0;
      ents.push([k, n, /\/assets\/audio\/music\//.test(new URL(k.url).pathname)]);
      total += n;
    }
    for (const pass of [true, false]) {
      for (const [k, n, music] of ents) {
        if (total <= max) return;
        if (music !== pass || !n) continue;
        await cache.delete(k); total -= n;
      }
    }
  })().finally(() => { trimmingB = null; });
  return trimmingB;
}
let trimming = null;
function trim(cache, max) {
  if (trimming) return trimming;
  trimming = (async () => {
    const keys = await cache.keys(); // 넣은 순서 (오래된 것 먼저)
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
  })().finally(() => { trimming = null; });
  return trimming;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function pool(list, n, fn) {
  const q = list.slice();
  const run = async () => { while (q.length) await fn(q.shift()); };
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, run));
}
