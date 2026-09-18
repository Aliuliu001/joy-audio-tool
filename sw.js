// Service Worker - removed to allow direct fetch with Google Translate proxy
const CACHE_NAME = 'joy-audio-cache-v2';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  // Clear old cache
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Do NOT intercept fetch requests - let app.js handle with Google Translate proxy
// This allows fetchBytes() to properly download audio files for zip
self.addEventListener('fetch', function(event) {
  // Pass through - don't intercept
});
