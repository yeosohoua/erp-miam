// Service worker du mode hors-ligne : il ne touche que la page /service et les fichiers /_next/static/.
// Les appels serveur (actions, API) ne passent jamais par ici.
const CACHE = "miam-service-v1"
const cle = (url) => url.origin + url.pathname + url.search

self.addEventListener("install", () => self.skipWaiting())

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) {
        if (k.startsWith("miam-service-") && k !== CACHE) await caches.delete(k)
      }
      await self.clients.claim()
    })(),
  )
})

async function page(event) {
  const req = event.request
  const url = new URL(req.url)
  const c = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res.ok && !res.redirected && res.type === "basic") event.waitUntil(c.put(cle(url), res.clone()).catch(() => {}))
    return res
  } catch {
    const exact = await c.match(cle(url), { ignoreVary: true })
    if (exact) return exact
    for (const k of await c.keys()) {
      if (new URL(k.url).pathname === "/service") {
        const r = await c.match(k, { ignoreVary: true })
        if (r) return r
      }
    }
    return new Response("Hors-ligne : ouvrez d'abord la page Service avec une connexion, puis appuyez sur Préparer le hors-ligne.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
}

async function statique(req) {
  const c = await caches.open(CACHE)
  const trouve = await c.match(req, { ignoreVary: true })
  if (trouve) return trouve
  const res = await fetch(req)
  if (res.ok) await c.put(req, res.clone()).catch(() => {})
  return res
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === "navigate" && url.pathname === "/service") {
    event.respondWith(page(event))
    return
  }
  if (url.pathname.startsWith("/_next/static/")) event.respondWith(statique(req))
})