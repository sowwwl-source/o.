self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(name) {
        return caches.delete(name);
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(e) {
    // START DESTROYER MODE
    // Do not return anything from cache, ever.
    // Fetch from network, if fails, fallback to nothing.
    e.respondWith(
        fetch(e.request).catch(function() {
            return new Response('Cache cleared. Please refresh.', {
                headers: { 'Content-Type': 'text/plain' }
            });
        })
    );
});
