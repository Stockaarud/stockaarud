/* Stockaarud : fonctionnement hors ligne.
   Garde l'appli en cache pour qu'elle s'ouvre même sans réseau.
   Les données passent toujours par Supabase (et par la file d'attente de l'appli hors ligne). */
const CACHE = "stockaarud-v5";
const SHELL = ["./", "index.html", "backend.js", "config.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.hostname.endsWith("supabase.co") || u.hostname.endsWith("supabase.in")) return;
  // Pages et fichiers de l'appli : réseau d'abord (pour avoir les mises à jour), cache si hors ligne
  e.respondWith(fetch(e.request).then(r => { if (r.ok && (u.origin === location.origin || SHELL.includes(e.request.url) || u.hostname.includes("fonts.g"))) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
