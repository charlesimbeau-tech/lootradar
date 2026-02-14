const CACHE_NAME = 'lootradar-v1';
const STATIC_ASSETS = [
    '/lootradar/',
    '/lootradar/index.html',
    '/lootradar/style.css',
    '/lootradar/app.js',
    '/lootradar/manifest.json'
];

// Install — cache static assets
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch — network first for API, cache first for static
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // API calls — always network
    if (url.hostname === 'www.cheapshark.com' || url.hostname === 'cdn.cloudflare.steamstatic.com') {
        e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
        );
        return;
    }

    // Static assets — cache first, fallback to network
    e.respondWith(
        caches.match(e.request).then(cached => {
            const fetched = fetch(e.request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                return response;
            });
            return cached || fetched;
        })
    );
});
