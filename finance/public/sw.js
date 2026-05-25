/* Ledger service worker.
   Deliberately tiny. We only do two things:
     1. Cache the app shell so installs work offline-ish (404-resilient launch).
     2. Network-first for everything API and HTML — never serve stale financial
        data from cache. Cached responses are only used for static assets.
   No background sync, no push, no scope-creeping fetch interception. */

const VERSION = "ledger-v1";
const SHELL = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Same-origin only.
  if (url.origin !== self.location.origin) return;

  // Never cache HTML, API responses, or auth flows — financial data must be live.
  const accept = req.headers.get("accept") || "";
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    accept.includes("text/html")
  ) {
    return; // let the network handle it
  }

  // Cache-first for static assets in the shell list and Next.js static chunks.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && (url.pathname.startsWith("/_next/static/") || SHELL.includes(url.pathname))) {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached || Response.error());
    }),
  );
});
