const CACHE_NAME = "laziz-offline-v2";

const APP_FILES = [
  "./offline-pos.html",
  "./offline-manifest.json",
  "./offline-icon.svg",
  "./supabase-config.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key =>
            key.startsWith("laziz-offline-") &&
            key !== CACHE_NAME
          )
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  const isAppFile = url.origin === self.location.origin;
  const isSupabaseLibrary =
    url.hostname === "cdn.jsdelivr.net" &&
    url.pathname.includes("/@supabase/supabase-js/");

  if (!isAppFile && !isSupabaseLibrary) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        if (request.mode === "navigate") {
          return caches.match("./offline-pos.html");
        }
        return new Response("", { status: 503 });
      });
    })
  );
});
