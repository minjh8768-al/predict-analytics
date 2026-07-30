// PWA 설치 조건 충족용 최소 서비스워커. 이 사이트는 실시간 시세/뉴스가 핵심이라
// HTML이나 API 응답을 캐싱하면 오히려 옛날 데이터를 보여주는 문제가 생김 —
// 그래서 정적 파일(아이콘, 라이브러리 번들)만 캐싱하고, 나머지는 전부 네트워크로.
const CACHE_NAME = 'factorysignal-static-v1';
const STATIC_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isStatic = STATIC_ASSETS.some((p) => url.pathname === p) || url.pathname.startsWith('/vendor/');

  if (!isStatic) return; // 정적 파일이 아니면 서비스워커가 관여하지 않고 그냥 네트워크로

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
