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
//               /assets/** = bn-assets-v1 에서 캐시 우선. 키는 경로(쿼리 제외)이고 저장할 때 build.json 의 해시를 x-bn-h 로 붙여 둔다 →
//               해시가 다르면(새 배포에서 그림이 바뀜) 쓰지 않고 새로 받는다. 오래된 것부터 지워 최대 MAX_ASSETS 개.
// 오프라인이면 캐시에 있는 것은 무엇이든 (낡았어도) 돌려준다.
'use strict';

const BUILD = /*BN_BUILD*/null/*BN_BUILD_END*/;
const CACHE = BUILD ? `bn-${BUILD.hash}` : 'bn-dev';
const ASSETS = 'bn-assets-v1';
// 그림 캐시 상한: 한 번 플레이에 쓰는 그림(아이콘 120여 개, 영웅 퍼펫, 채색 괴물·보스 아틀라스, 배경)이 250개를 넘어
// 캐시가 계속 갈리지 않도록 넉넉히 잡는다. 경로당 하나(해시가 바뀌면 교체)라 게임 전체 그림 수를 넘지 않는다.
const MAX_ASSETS = 800;
const DEV_MAX = 400;
const NAV_TIMEOUT_MS = 3000;
const SCOPE = new URL(self.registration ? self.registration.scope : self.location.href);
const BASE = SCOPE.pathname.endsWith('/') ? SCOPE.pathname : SCOPE.pathname.replace(/[^/]*$/, '');

const abs = (u) => new URL(u, SCOPE).href;
const relOf = (url) => (url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname.replace(/^\//, ''));

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
        if (res.ok && res.status === 200) await ac.put(abs(u), await stamp(res, want));
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
    const keep = new Set([CACHE, ASSETS]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    if (BUILD) {
      // 새 배포에서 바뀌었거나 사라진 그림은 지운다 (낡은 그림을 새 코드와 섞어 쓰지 않도록)
      const files = await manifest();
      const ac = await caches.open(ASSETS);
      for (const req of await ac.keys()) {
        const res = await ac.match(req);
        const f = files[relOf(new URL(req.url))];
        if (!f || !res || res.headers.get('x-bn-h') !== f.hash8) await ac.delete(req);
      }
    } else {
      await caches.delete(ASSETS); // 개발용 워커는 그림 캐시를 따로 두지 않는다
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
  if (rel.startsWith('assets/') && !rel.startsWith('assets/fonts/')) { event.respondWith(assetFetch(event, req, url, rel)); return; }
  event.respondWith(codeFetch(event, req, rel));
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
async function codeFetch(event, req, rel) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200 && /^(src|css|assets\/fonts)\//.test(rel)) event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
    return res;
  } catch (e) {
    const any = await caches.match(req, { ignoreSearch: true });
    if (any) return any;
    throw e;
  }
}

// 그림: 경로 키 + 빌드 해시 검증
let manifestP = null;
function manifest() {
  if (!manifestP) {
    manifestP = caches.open(CACHE).then((c) => c.match(abs('build.json'))).then((r) => (r ? r.json() : null)).then((j) => (j && j.files) || {}, () => ({}));
  }
  return manifestP;
}
async function assetFetch(event, req, url, rel) {
  const key = abs(rel);
  const [files, cache] = await Promise.all([manifest(), caches.open(ASSETS)]);
  const want = files[rel] && files[rel].hash8;
  const hit = await cache.match(key);
  if (hit && want && hit.headers.get('x-bn-h') === want) return hit;
  try {
    const res = await fetch(req);
    if (want && res.ok && res.status === 200) {
      event.waitUntil(stamp(res.clone(), want).then((r) => cache.put(key, r)).then(() => trim(cache, MAX_ASSETS)).catch(() => {}));
    }
    return res;
  } catch (e) {
    if (hit) return hit; // 오프라인: 낡았어도 있는 것을
    throw e;
  }
}

// 개발용: 네트워크 우선, 오프라인이면 캐시
async function devFetch(event, req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200 && res.type === 'basic') event.waitUntil(cache.put(req, res.clone()).then(() => trim(cache, DEV_MAX)).catch(() => {}));
    return res;
  } catch (e) {
    const hit = await cache.match(req) || await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

// ───────────────────────── 도우미 ─────────────────────────
async function stamp(res, hash8) {
  const h = new Headers(res.headers);
  h.delete('content-encoding'); h.delete('content-length'); // 몸통은 이미 풀린 바이트
  if (hash8) h.set('x-bn-h', hash8);
  const body = await res.arrayBuffer();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: h });
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
