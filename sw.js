// Service Worker to cache audio files and bypass CORS for zip download
const CACHE_NAME = 'joy-audio-cache-v1';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
  const url = event.request.url;
  
  // Only intercept audio file requests (Oxford, Cambridge)
  if (url.indexOf('oxfordlearnersdictionaries.com') !== -1 || 
      url.indexOf('dictionary.cambridge.org') !== -1) {
    
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(response) {
          if (response) {
            return response;
          }
          
          // Fetch with no-cors mode
          return fetch(event.request.url, { mode: 'no-cors' }).then(function(networkResponse) {
            // Cache for future use
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }).catch(function() {
            // If fetch fails, return empty response
            return new Response(new Blob(), { status: 200, statusText: 'OK' });
          });
        });
      })
    );
  }
});

// Message handler for downloading audio data
self.addEventListener('message', function(event) {
  if (event.data.action === 'cacheAudio') {
    const { url } = event.data;
    
    fetch(url, { mode: 'no-cors' })
      .then(response => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(url, response.clone());
          return response.arrayBuffer();
        });
      })
      .then(buffer => {
        event.ports[0].postMessage({ success: true, buffer: buffer });
      })
      .catch(err => {
        event.ports[0].postMessage({ success: false, error: err.message });
      });
  }
});
