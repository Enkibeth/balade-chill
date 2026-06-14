/* Balades — vanilla service worker (no Workbox). */
const CACHE = 'balades-v6'

// Mapbox tiles/assets are large — never intercept them.
const MAPBOX_HOSTS = [
  'api.mapbox.com',
  'events.mapbox.com',
  'a.tiles.mapbox.com',
  'b.tiles.mapbox.com',
  'c.tiles.mapbox.com',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/login', '/manifest.json'])),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    const cached = await caches.match(request)
    if (cached) return cached
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Bypass map tile hosts entirely (Mapbox + Carto basemap) — let the browser handle them.
  if (MAPBOX_HOSTS.includes(url.hostname) || url.hostname.endsWith('basemaps.cartocdn.com')) return

  // API routes: network only, with a JSON offline fallback.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({ error: 'Hors ligne — action mise en file.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    )
    return
  }

  // Static build assets: cache first.
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/')
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Everything else (navigations, balade pages): network first, cache fallback.
  event.respondWith(networkFirst(request))
})
