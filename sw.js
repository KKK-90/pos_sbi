const CACHE = "pos-tracker-v1";
const ASSETS = [
  "/", "/index.html",
  "/assets/css/styles.css",
  "/assets/js/tracker.js", "/assets/js/bridge.js",
  "/data/sample-data.json", "/data/seed-backup.json",
  "/manifest.webmanifest",
  "/404.html", "/robots.txt"
];
// CDN libs to cache after first fetch
const RUNTIME_CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k!==CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Cache-first for our assets
  if (ASSETS.includes(url.pathname) || RUNTIME_CDN.some(cdn => e.request.url.startsWith(cdn))) {
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request).then(resp => {
      return caches.open(CACHE).then(c => { c.put(e.request, resp.clone()); return resp; });
    })));
    return;
  }
  // Network-first for others
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
