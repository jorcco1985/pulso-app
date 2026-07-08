/* Pulso Service Worker — v42
   Estratégia:
   - HTML / navegação: REDE PRIMEIRO (mostra sempre a versão publicada mais recente quando há
     internet). Só usa a cache como reserva quando estás offline.
   - Restantes ficheiros (imagens, ícones): cache primeiro, com atualização em segundo plano.
   Isto resolve o problema de a app mostrar uma versão antiga depois de um deploy. */
const CACHE = 'pulso-v42';
const CORE = ['/', '/index.html'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(CORE).catch(function () {}); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isHTML = req.mode === 'navigate' || accept.indexOf('text/html') !== -1;

  if (isHTML) {
    // Rede primeiro: mostra sempre a versão nova quando há net.
    e.respondWith((async function () {
      try {
        const net = await fetch(req, { cache: 'no-store' });
        const c = await caches.open(CACHE);
        c.put('/index.html', net.clone());
        return net;
      } catch (_) {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Resto: cache primeiro + atualização em segundo plano.
  e.respondWith((async function () {
    const cached = await caches.match(req);
    const network = fetch(req).then(function (net) {
      caches.open(CACHE).then(function (c) { c.put(req, net.clone()); });
      return net;
    }).catch(function () { return cached; });
    return cached || network;
  })());
});
