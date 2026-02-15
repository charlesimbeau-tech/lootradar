const CACHE_NAME = 'lootradar-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/icons/logo.svg',
    '/manifest.json'
];

// Install — cache static assets, skip waiting immediately
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate — delete ALL old caches
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch — network first for everything, cache as fallback
self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request)
            .then(response => {
                // Cache successful GET responses
                if (e.request.method === 'GET' && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(e.request))
    );
});
