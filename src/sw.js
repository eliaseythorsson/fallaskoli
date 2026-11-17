/* Fallaskóli's service worker (item 54).

   What it is for: once the program has been opened from a web host or from
   server/server.mjs, it opens again without a network, and a phone or a
   Chromebook can keep it on the home screen.

   What it caches, and nothing else: the program itself (index.html), the
   manifest and the icons — the files tools/pwa.mjs lists into ASSETS below.
   Every other request — /auth/…, /state/…, the board, duels, assignments,
   anything a server answers about a pupil — is not touched: the worker does
   not answer it and does not keep it, the browser goes to the network as if
   there were no worker. Pupils' data is never in this cache.

   How a new version arrives, never silently:
     1. The page registers this file on every visit; the browser compares it
        byte for byte with the one it has. BUILD below is a hash of the exact
        program served (tools/pwa.mjs), so a new program is a new worker.
     2. The new worker fills its own cache next to the old one and WAITS.
        The page sees it waiting and shows "Ný útgáfa er tilbúin — endurhlaða"
        (src/js/ui/pwa.js). Nothing changes under a pupil mid-question.
     3. The pupil presses it: the page asks the worker to take over
        ("skip-waiting"), the page reloads into the new version, and the old
        cache is deleted.
   The first visit has no old worker, so the first one takes over at once
   (clients.claim) — that is what makes the very next reload work offline.

   Opened from a file (`file:`) there is no worker at all.

   tools/pwa.mjs fills in BUILD and ASSETS; this file is never served as
   it stands.                                                              */

const BUILD = "@@BUILD@@";
const ASSETS = [/*@@ASSETS@@*/];
const APP = "index.html";

const SCOPE = new URL(self.registration.scope);
/* The cache's name carries the scope: two copies of the program in two
   folders of one host (say /v6.12/ and /v6.13/) must not delete each
   other's cache when they update. */
const PREFIX = "fallaskoli:" + SCOPE.pathname + ":";
const CACHE = PREFIX + BUILD;
const at = (p) => new URL(p, SCOPE).href;

/** What this worker answers for: "app" (the program, for a page being
    opened), "asset" (manifest, icon, this folder's own files), or null —
    not ours, the network answers. */
function route(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return null;
  const rest = url.pathname.slice(SCOPE.pathname.length);
  /* A page being opened at the start of the scope, with or without a query
     (the server sends ?bid=1 after a request for an account). */
  if (request.mode === "navigate") return rest === "" || rest === APP ? "app" : null;
  if (!url.search && ASSETS.includes(rest)) return "asset";
  return null;
}

self.addEventListener("install", (event) => {
  /* `cache: "reload"`: past the browser's own HTTP cache, straight from the
     host, so the new worker never caches the previous program. */
  event.waitUntil(caches.open(CACHE).then((c) =>
    c.addAll([APP, ...ASSETS].map((p) => new Request(at(p), { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys())
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const kind = route(event.request);
  if (!kind) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(kind === "app" ? at(APP) : event.request.url);
    /* Not in the cache (it was cleared under us): the network, and it is not
       put back here — only `install` fills the cache, so what is cached is
       always exactly the version BUILD names. */
    return hit || fetch(event.request);
  })());
});
