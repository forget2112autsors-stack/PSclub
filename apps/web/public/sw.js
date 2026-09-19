// PS Klub PWA Service Worker (QM-7 & TZ 7.3)
const CACHE_NAME = 'psklub-shell-v1';
const PRECACHE = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API so'rovlari va SSE/Stream keshlanmaydi — ular faqat tirik server bilan ishlaydi
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Sahifa navigatsiyasi va statik fayllar (Network-first with cache fallback)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Internet aloqasi yo\'q', { status: 503, statusText: 'Offline' });
      })
  );
});
