
const CACHE_NAME = "laziz-offline-v4";

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

    // Cache the app's local files.
    await cache.addAll(APP_FILES);

    // Cache the Supabase library separately.
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

  // Supabase library.
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
        return new Response(
          "Supabase library is not available offline.",
          { status: 503 }
        );
      }
    })());

    return;
  }

  // LAZIZ app files.
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
        return await cache.match("./offline-pos.html") ||
          new Response("LAZIZ app is not cached yet.", {
            status: 503
          });
      }

      return new Response("", { status: 503 });
    }
  })());
});
