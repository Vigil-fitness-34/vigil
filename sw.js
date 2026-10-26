/* VIGIL Service Worker – macht die App offline-fähig.
   Version erhöhen, wenn index.html geändert wurde, damit Handys das Update laden. */
const CACHE = 'vigil-v19';
const FONTS = 'vigil-fonts';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('vigil-') && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Die Seite selbst: erst frisch vom Netz (an der Browser-Zwischenablage vorbei), damit Updates
  // sofort ankommen. Ohne Netz oder nach 3 Sekunden (schlechter Empfang im Gym) aus dem Cache.
  if (url.origin === location.origin && req.mode === 'navigate') {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const network = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res && res.ok) cache.put('./index.html', res.clone());
        return res;
      });
      const timeout = new Promise(r => setTimeout(r, 3000));
      try {
        const res = await Promise.race([network, timeout]);
        if (res) return res;
      } catch (err) {}
      e.waitUntil(network.catch(() => {}));
      return (await cache.match('./index.html')) || network;
    }));
    return;
  }

  // Übrige App-Dateien: sofort aus dem Cache, im Hintergrund aktualisieren.
  if (url.origin === location.origin) {
    const key = req.mode === 'navigate' ? './index.html' : req;
    e.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(key, { ignoreSearch: true });
      const network = fetch(req).then(res => {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(network); return cached; }
      return (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
    }));
    return;
  }

  // Google Fonts: einmal laden, danach offline aus dem Cache.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async cache => {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response('', { status: 504 });
      }
    }));
  }
});
