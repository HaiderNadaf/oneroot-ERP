// Offline shell for the POS: app files are cached, page loads fall back to the cached copy.
// API calls are never cached here — the app keeps its own offline copies and a sales queue.
const CACHE = "oneroot-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Built assets are content-hashed: cache first
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Pages: network first, cached copy when offline
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        const c = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) c.put(req, res.clone());
          return res;
        } catch {
          return (await c.match(req)) || (await c.match("/sales/new")) || (await c.match("/")) || Response.error();
        }
      })(),
    );
  }
});
