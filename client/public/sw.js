// DiveOps™ Service Worker
// Caching strategies: cache-first for static assets, network-first for API responses
const CACHE_VERSION = 'diveops-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;

// Static assets to pre-cache (app shell)
const APP_SHELL = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/shield-logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
];

// Install event — pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('diveops-') && name !== STATIC_CACHE && name !== API_CACHE && name !== FONT_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Helper: is this a navigation request?
function isNavigationRequest(request) {
  return request.mode === 'navigate' || 
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

// Helper: is this an API request?
function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

// Helper: is this a static asset?
function isStaticAsset(url) {
  const ext = url.pathname.split('.').pop()?.toLowerCase();
  return ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'eot', 'webp'].includes(ext);
}

// Helper: is this a Google Fonts request?
function isFontRequest(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

// Fetch event — apply caching strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip WebSocket and HMR requests
  if (url.pathname.includes('vite-hmr') || url.pathname.includes('__vite')) return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Strategy 1: Google Fonts — cache-first (they rarely change)
  if (isFontRequest(url)) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Strategy 2: API requests — network-first, fall back to cache
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache successful GET responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // Return a JSON error for API requests when offline
            return new Response(
              JSON.stringify({ error: 'You are offline. Please check your connection.' }),
              { 
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        })
    );
    return;
  }

  // Strategy 3: Navigation requests — network-first, fall back to cached page or offline page
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache the latest HTML
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // Try the root cached page (SPA)
            return caches.match('/').then((rootCached) => {
              if (rootCached) return rootCached;
              // Last resort: offline page
              return caches.match('/offline.html');
            });
          });
        })
    );
    return;
  }

  // Strategy 4: Static assets — cache-first, fall back to network
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            // Return nothing for failed static asset loads
            return new Response('', { status: 408, statusText: 'Offline' });
          });
        });
      })
    );
    return;
  }

  // Default: network-first for everything else
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
