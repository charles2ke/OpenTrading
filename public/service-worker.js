const CACHE = "opentrading-v2";
const ASSETS = ["./", "./index.html", "./learn.html", "./setup.html", "./banking.html", "./audit.html", "./assets/icon.svg", "./manifest.webmanifest"];

function isPrivatePath(pathname) {
  return /(^|\/)(api|auth)\//.test(pathname);
}

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))));
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && isPrivatePath(url.pathname)) return;
  event.respondWith(fetch(event.request).then((response) => {
    const cacheable = response.ok
      && url.origin === self.location.origin
      && !/no-store/i.test(response.headers.get("Cache-Control") || "");
    if (cacheable) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))));
});
