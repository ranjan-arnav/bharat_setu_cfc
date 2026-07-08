const CACHE_NAME = 'bharat-setu-v3';
const SCREENS_CACHE = 'bharat-setu-screens-v2';

// Core app shell to cache
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/screens/home.html',
  '/screens/voice.html',
  '/screens/civic.html',
  '/screens/health.html',
  '/screens/welfare.html',
  '/screens/finance.html',
  '/screens/legal.html',
  '/screens/cases.html',
  '/screens/sos.html',
  '/screens/scheme-scanner.html',
  '/screens/xray-tracker.html',
  '/screens/community.html',
  '/screens/karma.html',
];

// CDN resources to cache for offline
const CDN_URLS = [
  'https://cdn.tailwindcss.com?plugins=forms,container-queries',
  'https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)),
      caches.open(SCREENS_CACHE).then((cache) => {
        // Best-effort cache CDN resources
        return Promise.allSettled(CDN_URLS.map((url) => cache.add(url)));
      }),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== SCREENS_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-http(s) schemes (chrome-extension, etc.)
  if (!url.protocol.startsWith('http')) return;

  // API calls: network-only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline - कृपया इंटरनेट कनेक्शन जांचें' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        });
      })
    );
    return;
  }

  // Screens: cache-first (they're static Stitch HTML)
  if (url.pathname.startsWith('/screens/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(SCREENS_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // CDN resources: cache-first
  if (!url.pathname.startsWith('/') || url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SCREENS_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached || new Response('', { status: 408 }));
      })
    );
    return;
  }

  // App shell: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      return cached || fetchPromise;
    })
  );
});

// Handle push notifications (for grievance updates, scheme deadlines)
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'भारत सेतु से नई सूचना',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    data: data.url || '/',
    actions: [
      { action: 'open', title: 'खोलें' },
      { action: 'dismiss', title: 'बंद करें' },
    ],
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'भारत सेतु', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(clients.openWindow(event.notification.data || '/'));
  }
});
