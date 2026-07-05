// Pulso — Service Worker
// IMPORTANTE: sobe este número sempre que fizeres um deploy que deva limpar a cache
// (ex.: v3, v4...). Só assim o browser reinstala o service worker e apaga a cache antiga.
const CACHE_NAME = "pulso-v2";

const FILES_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
];

// Instala e pré-carrega os ficheiros base. skipWaiting => ativa já a nova versão.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

// Ao ativar, apaga as caches de versões antigas e assume o controlo das páginas abertas.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Só tratamos pedidos GET do PRÓPRIO site. Tudo o resto — Firebase, Google APIs,
  // pedidos POST, streaming do Firestore — passa direto para a rede sem o service
  // worker interferir. Isto mantém a autenticação e a sincronização a funcionar.
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // HTML / navegação: REDE PRIMEIRO. Mostra sempre a app mais recente; se estiver
  // offline, cai para a versão em cache.
  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Restantes ficheiros do site (ícones, manifest): cache primeiro, rede a seguir.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
