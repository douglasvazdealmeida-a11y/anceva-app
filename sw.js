// Keeps the app working without internet. Data sync goes straight to the Google Sheet (not cached).
const CACHE = "anceva-v2";
const ARQUIVOS = ["./", "index.html", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "jspdf.umd.min.js", "jspdf.plugin.autotable.min.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if(e.request.method !== "GET" || url.origin !== location.origin) return;
  // network first, so updates arrive; cache when offline
  e.respondWith(
    fetch(e.request).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia));
      return res;
    }).catch(() => caches.match(e.request, {ignoreSearch:true}).then(r => r || caches.match("index.html")))
  );
});
