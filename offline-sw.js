/* LAZIZ offline service worker.
   Bump CACHE_NAME whenever offline-pos.html or its supporting files change.
   This cache update does not delete localStorage, IndexedDB, or pending sales.
*/
const CACHE_NAME = "laziz-offline-v6";

const SUPABASE_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

const APP_FILES = [
  "./offline-pos.html",
  "./offline-manifest.json",
  "./offline-icon.svg",
  "./supabase-config.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Install the current app files as one complete set.
    await cache.addAll(APP_FILES);

    // Keep the Supabase client available when the device is offline.
    const response = await fetch(SUPABASE_CDN, {
      mode: "cors",
      cache: "reload"
    });

    if (!response.ok || response.type === "opaque") {
      throw new Error("Could not cache the Supabase library.");
    }

    await cache.put(SUPABASE_CDN, response);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    // Remove only old LAZIZ service-worker caches. This does NOT touch
    // localStorage or IndexedDB, where the offline sales queue is stored.
    await Promise.all(
      keys
        .filter(key => key.startsWith("laziz-offline-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase JavaScript library: cache-first, then network.
  if (url.href === SUPABASE_CDN) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(SUPABASE_CDN);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok && response.type !== "opaque") {
          await cache.put(SUPABASE_CDN, response.clone());
        }
        return response;
      } catch (error) {
        return new Response("Supabase library is not available offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  // Only handle files served by this LAZIZ website.
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      if (request.mode === "navigate") {
        return (await cache.match("./offline-pos.html")) || new Response(
          "LAZIZ app is not cached yet.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      return new Response("", { status: 503 });
    }
  })());
});
