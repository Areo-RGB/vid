const CACHE_NAME = "exercise-player-cache-v1";
const urlsToCache = [
  "/", // Caches index.html at the root
  "index.html",
  "style.css",
  "script.js",
  "data.json",
  "manifest.json",
  "icons/android/android-launchericon-192-192.png",
  "icons/android/android-launchericon-512-512.png",
];

// Install event: open a cache and add the app shell files to it
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      // addAll() is atomic. If one file fails, the whole operation fails.
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch event: serve cached content when offline
self.addEventListener("fetch", (event) => {
  // We only want to handle GET requests
  if (event.request.method !== "GET") {
    return;
  }

  // For video requests, always fetch from the network.
  // This prevents caching very large files which can fill up user storage.
  if (event.request.url.endsWith(".mp4")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // If the request is in the cache, return it.
      if (response) {
        return response;
      }
      // If the request is not in the cache, fetch it from the network.
      return fetch(event.request);
    })
  );
});

// Activate event: remove old caches
self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
