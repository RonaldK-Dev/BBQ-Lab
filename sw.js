// BBQ Lab Service Worker
// Strategie:
//   - App-Shell (HTML, Icons, Manifest): Stale-While-Revalidate
//     → Start aus Cache (instant), Update im Hintergrund
//   - Supabase API: Network-First mit Cache-Fallback
//     → Frische Daten wenn online, letzter Stand wenn offline
//   - Supabase Storage (Fotos): Cache-First (Fotos aendern sich nicht)
//
// Seit 2026-07-31 liegen Fonts und supabase-js im Repo statt an fremden CDNs.
// Damit sind alle Shell-Dateien gleicher Herkunft und die App startet offline
// vollstaendig - vorher haingen Schriften und das Supabase-SDK am Netz.

const CACHE = "bbq-lab-v7";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.png",
  "./favicon.png",
  "./favicon-16.png",
  "./vendor/supabase-js-2.111.0.min.js",
  "./fonts/bebas-neue-latin.woff2",
  "./fonts/bebas-neue-latin-ext.woff2",
  "./fonts/dm-sans-latin.woff2",
  "./fonts/dm-sans-latin-ext.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Supabase REST-API: Network-First (frische Daten bevorzugen)
  if (url.hostname.includes("supabase.co") && url.pathname.startsWith("/rest/")) {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Supabase Storage (Fotos): Cache-First
  if (url.hostname.includes("supabase.co") && url.pathname.includes("/storage/")) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // App-Shell (inkl. Fonts und supabase-js, alle lokal): Stale-While-Revalidate
  e.respondWith(
    caches.match(req).then(cached => {
      const networkFetch = fetch(req)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
