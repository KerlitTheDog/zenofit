/* Zenofit service worker.
   Two jobs:
   1. Cache the app shell so it opens instantly and works offline.
   2. Receive web pushes so a timer can fire while the app is closed.

   Scope note: this file must stay in the repo root. A service worker can only
   control pages at or below its own URL, and the app lives at /zenofit/.       */

const VERSION = "zenofit-v22";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./i18n.js",
  "./standards.js",
  "./zenofit-cloud.js",
  "./app.js",
  "./logoC.png",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // one missing file never blocks install
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Stale-while-revalidate for our own files: the app paints from cache at once,
   and the next launch has the fresh copy. Cross-origin (fonts, lucide) is left
   to the browser. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});

/* ---- Web push -------------------------------------------------------------
   The page is frozen or gone by the time this runs. A visible notification is
   mandatory: skip it and Chrome eventually revokes push permission.           */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Zenofit" }; }

  const title = d.title || "Zenofit";
  const opts = {
    body: d.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: d.tag || "zenofit",
    renotify: true,
    requireInteraction: d.requireInteraction !== false,   // timers should wait to be seen
    vibrate: [250, 120, 250, 120, 400],
    data: { url: d.url || "./", kind: d.kind || "generic", id: d.id || null },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || "./", self.location.href).href;

  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          c.postMessage({ type: "notification-click", data: e.notification.data });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

/* ---- refresh on demand ----------------------------------------------------
   The fetch handler above is stale-while-revalidate, which is the right
   default (the app paints instantly, offline included) and has one cost the
   user feels: a deploy shows the OLD app on the first open and the new one
   only on the second. Closing the app and opening it twice was the whole
   workaround, and people do not know that is what they are doing — they just
   know it takes a couple of goes.

   So the page can ask for the shell to be fetched from the NETWORK, past
   both caches, and is told whether anything actually came back different. It
   reloads only if something did, because a refresh that reloads every time
   is a refresh nobody dares press mid-session.

   `cache: "reload"` is what gets past the browser's own HTTP cache; without
   it this can happily re-store the same stale bytes it already had.       */
async function refreshShell() {
  const cache = await caches.open(VERSION);
  let changed = false;

  await Promise.all(SHELL.map(async (url) => {
    try {
      const fresh = await fetch(new Request(url, { cache: "reload" }));
      if (!fresh || !fresh.ok) return;
      const old = await cache.match(url);
      if (!(await sameBytes(old, fresh.clone()))) changed = true;
      await cache.put(url, fresh);
    } catch { /* offline, or that one file is gone: the cached copy stands */ }
  }));

  return changed;
}

/* ETag first, because that is what the header is FOR and every static host
   sends one; the body comparison is the fallback for a host that does not,
   and it is exact rather than a length check, since an edit that swaps two
   characters is still an edit. */
async function sameBytes(a, b) {
  if (!a) return false;
  const ea = a.headers.get("ETag"), eb = b.headers.get("ETag");
  if (ea && eb) return ea === eb;
  try { return (await a.text()) === (await b.text()); }
  catch { return false; }
}

/* Lets the page tell a waiting worker to take over immediately, and ask for
   the shell to be re-fetched. A port on the message is how the answer gets
   back; without one this is still a valid fire-and-forget request. */
self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") { self.skipWaiting(); return; }

  if (e.data && e.data.type === "refresh-shell") {
    const port = e.ports && e.ports[0];
    e.waitUntil(
      refreshShell()
        .then((changed) => port && port.postMessage({ ok: true, changed }))
        .catch(() => port && port.postMessage({ ok: false, changed: false }))
    );
  }
});
