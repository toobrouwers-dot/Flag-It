const CACHE = 'flagit-v32';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './cloud.js',
  './social.js',
  './beta.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Chart.js, Supabase JS en Google Fonts komen van een CDN. De cache hieronder
// bewaart ze apart van de app-cache, zodat een versiebump van CACHE ze niet
// weggooit en een koude start zonder internet (gym-kelder) alsnog werkt.
// Deze origins ondersteunen CORS, dus hun responses zijn niet opaque en
// dus wel cachebaar — dat is precies waarom ze een eigen tak nodig hebben:
// de app-strategie hieronder cachet alleen res.status === 200.
const CDN_CACHE = 'flagit-cdn-v1';
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== CDN_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({type:'window'}).then(clients => {
        clients.forEach(c => c.postMessage({type:'SW_UPDATED'}));
      }))
  );
});

// Stale-while-revalidate voor de CDN's: direct uit cache serveren en op de
// achtergrond verversen. Offline valt hij terug op de cache; is die er nog
// niet, dan faalt het request zoals voorheen en tonen de render-functies
// hun offline-lege staat.
function cdnFetch(request) {
  return caches.open(CDN_CACHE).then(cache =>
    cache.match(request).then(cached => {
      const network = fetch(request).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          cache.put(request, res.clone()).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  let host = '';
  try { host = new URL(e.request.url).hostname; } catch (err) { host = ''; }
  if (CDN_HOSTS.includes(host)) {
    e.respondWith(cdnFetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      });
    })
  );
});
