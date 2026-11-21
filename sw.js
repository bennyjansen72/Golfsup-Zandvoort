// Service worker: app-bestanden bewaren voor offline openen; gegevens altijd eerst van het netwerk.
const CACHE = "golfsup-v33";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./favicon-32.png", "./bg.jpg", "./alert2.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Eigen bestanden altijd bij de server controleren (geen verouderde kopie uit de browsercache).
  const url = new URL(e.request.url), same = url.origin === self.location.origin;
  // Eigen bestanden en de metingen zonder ?t=... bewaren, anders komt er bij elke verversing een nieuwe kopie van rws.json bij.
  const key = (same || url.hostname === "raw.githubusercontent.com") ? url.origin + url.pathname : e.request;
  e.respondWith(
    (same ? fetch(e.request.url, { cache: "no-cache" }) : fetch(e.request))
      .then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
