// 오프라인 캐시 서비스 워커: 한 번 접속하면 네트워크 없이도 플레이 가능 (홈 화면에 추가 지원)
const CACHE = 'blood-nocturne-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  // 계정·클라우드 저장 API 는 절대 캐시하지 않는다 (로그인한 사람마다 응답이 다르고, 오프라인 때 옛 응답을 돌려주면 안 된다)
  if (new URL(req.url).pathname.startsWith('/api/')) return;
  // 네트워크 우선, 실패 시 캐시 (개발 중 최신 코드 유지)
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
