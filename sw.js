/* Zenofit service worker.
   Two jobs:
   1. Cache the app shell so it opens instantly and works offline.
   2. Receive web pushes, so a timer can fire and a message can arrive while
      the app is closed. Those two want opposite things from a notification
      and the push handler below says which is which.

   Scope note: this file must stay in the repo root. A service worker can only
   control pages at or below its own URL, and the app lives at /zenofit/.       */

const VERSION = "zenofit-v32";
/* Fetched photos, keyed by id (see the PHOTOS block in app.js). Not part of
   the shell and not versioned with it: a photo's id IS its content, so a
   new build has nothing to invalidate, and clearing it on every deploy
   would re-download every picture on the next launch. */
const PHOTO_CACHE = "zenofit-photos";
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
  e.waitUntil(Promise.all([
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== PHOTO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
    closeUnmatchedTimers(),
  ]));
});

/* A timer notification from a build before v32 carries no `ref` (see the
   push handler), so nothing can ever match it to the rest it announced and
   take it down: it would sit in the shade, and as the dot on the app's
   icon, until swiped away by hand — which is the bug v32 fixes. A new
   worker activates while the app is open, where the rest itself is on
   screen, so these are cleared then. The Notifications window's test
   timer has no `ref` either, and goes the same way if it is still there. */
function closeUnmatchedTimers() {
  return self.registration.getNotifications()
    .then((list) => list.forEach((n) => { const d = n.data || {}; if (d.kind === "timer" && !d.ref) n.close(); }))
    .catch(() => {});
}

/* Stale-while-revalidate for our own files: the app paints from cache at once,
   and the next launch has the fresh copy. Cross-origin (fonts, lucide) is left
   to the browser.

   ── AND THE PAGE IS TOLD WHEN WHAT IT IS RUNNING IS NO LONGER CURRENT ──
   The re-fetch behind a launch quietly put the new bytes in the cache, so by
   the time somebody pressed Refresh, refreshShell compared the network with a
   cache that already matched it, answered "nothing changed", and the page
   carried on running the old build. When a re-fetched SHELL file comes back
   different from the copy just served, every window hears so (shell-updated,
   see updateReady in index.html), which is the one moment anything knows. */
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.location.href).href));

function tellWindows(msg) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((list) => list.forEach((c) => c.postMessage(msg)))
    .catch(() => {});
}

/* ── A CACHE THAT FAILS IS A CACHE THAT IS NOT THERE, NOT A DEAD APP ────
   Keeping a copy is the extra; the response is the job. `cache.put` used to
   sit inside the chain that produced the response, so when it threw — a
   full phone's QuotaExceededError, or Cache Storage broken outright — the
   perfectly good response fell through to `.catch(() => hit)`, and with
   nothing cached (which is exactly the state a failed install leaves) the
   page got a network error instead of the app: it would not open at all,
   on the very phone with no room to spare. So a failure to KEEP a copy is
   swallowed where it happens, and a cache that will not even open or
   answer means straight to the network, as if there were no worker. */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const shell = SHELL_URLS.has(url.href);

  const work = caches.open(VERSION).then((cache) =>
    cache.match(req).then((hit) => {
      /* cloned now: the hit itself is handed to the page and read there */
      const served = hit && shell ? hit.clone() : null;
      /* A shell file is asked for with `no-cache`, which is a conditional
         request (an unchanged file is a 304 of a few hundred bytes), because
         a plain fetch is answered from the browser's own HTTP cache — GitHub
         Pages allows it ten minutes — and would hand back the very bytes it
         is meant to be checking against. */
      const net = (shell ? fetch(url.href, { cache: "no-cache" }) : fetch(req))
        .then(async (res) => {
          if (res && res.ok) {
            if (served && !(await sameBytes(served, res.clone()))) tellWindows({ type: "shell-updated" });
            try { await cache.put(req, res.clone()); }
            catch { /* no copy kept this time; the response is still good */ }
          }
          return res;
        })
        .catch(() => hit);     // offline: whatever the cache had
      return { hit, net };
    })
  ).catch(() => ({ hit: null, net: fetch(req) }));
  e.respondWith(work.then(({ hit, net }) => hit || net));
  e.waitUntil(work.then(({ net }) => net).catch(() => {}));
});

/* ---- Web push -------------------------------------------------------------
   The page is frozen or gone by the time this runs. A visible notification is
   mandatory: skip it and Chrome eventually revokes push permission.

   ONE EXCEPTION: somebody LOOKING AT THAT CONVERSATION right now. A
   notification for a message you are watching arrive is noise, so the push
   is handed to the page instead, which draws it. Only the page knows what is
   on its screen, so the service worker ASKS it (chatShowing in app.js) and
   waits a moment for the answer; a page that does not answer — frozen, or a
   build from before this — gets the notification, because a message nobody
   was told about is the worse of the two mistakes.

   It used to be "any window of the app is focused", and that silenced far
   too much: the app open on Home in the middle of a workout is focused, and
   a message from somebody else arrived with nothing but a small count on
   the nav, which is not being told. Nor is it "a window exists": an
   installed app behind the lock screen still has its window, and that is
   exactly when a message has to ring.

   AND ON WEBKIT THERE IS NO EXCEPTION AT ALL. Safari, and every web app
   installed on an iPhone, counts a push that shows nothing as a silent push
   whatever the app was doing, and after a handful revokes the subscription —
   notifications then simply stop, for every kind, until somebody turns them
   on again. Chrome has the focused-window allowance; WebKit does not. So on
   WebKit even the conversation you are reading gets a notification, shown
   silently and closed at once: shown because it must be, gone because
   nobody needs it. (A real iPhone is the only thing that can prove what
   that looks like; see CLAUDE.md.)

   A timer is deliberately not treated any of these ways. It already rings
   locally when the page is alive (fireTimer cancels the server's copy on the
   way past) so a timer push arriving at all means the page did NOT get
   there, and it must be shown whatever any window claims.

   ── A REST IS ONE NOTIFICATION, AND IT GOES WHEN THE REST IS DEALT WITH ──
   The push and the page's own notification for the same timer share a tag
   ("pbt-<the app's timer id>", which the server is handed as `ref`), so a
   rest announced by both is one line in the shade. One that is already
   there is replaced WITHOUT a second alert: the page got there first, or
   the cancel that should have stopped this push was still on its way.
   And every window hears about the push afterwards, because the one thing
   the worker cannot know is whether that rest has already been dealt with
   in the app — Done, Reset, started again — in which case the page takes
   the notification straight back down (timerNotifsTidy in app.js). It
   used to stay in the shade, and as the dot on the app's icon, until it
   was swiped away by hand.                                                  */
const UA = (self.navigator && self.navigator.userAgent) || "";
const STRICT_PUSH = /AppleWebKit/.test(UA) && !/Chrome|Chromium|Android|Edg\//.test(UA);
const ASK_MS = 1500;

/* Every window hears about the message, the one behind the lock screen
   included — it wants the message waiting when it comes back, and it costs
   nothing to say so now. The ones on screen are also asked whether that
   conversation is what they are showing. Resolves true if one says yes AND
   is focused: Chrome only forgives a push that shows nothing while a window
   of the site has focus, and otherwise puts up a notice of its own saying
   the site "has been updated in the background". */
function tellAndAsk(live, d) {
  const msg = { type: "chat-push", data: { threadId: d.id || null, from: d.title || null, at: d.at || Date.now() } };
  const asks = [];
  for (const c of live) {
    if (c.visibilityState !== "visible") { c.postMessage(msg); continue; }
    asks.push(new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), ASK_MS);
      try {
        const ch = new MessageChannel();
        ch.port1.onmessage = (ev) => { clearTimeout(timer); resolve(!!(ev.data && ev.data.showing) && c.focused); };
        c.postMessage(msg, [ch.port2]);
      } catch { clearTimeout(timer); resolve(false); }
    }));
  }
  return Promise.all(asks).then((all) => all.some(Boolean));
}

const closeTagged = (tag) => self.registration.getNotifications({ tag })
  .then((list) => list.forEach((n) => n.close()))
  .catch(() => {});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Zenofit" }; }

  e.waitUntil((async () => {
    const kind = d.kind || "generic";
    const tag = d.tag || "zenofit";
    let watching = false;
    /* this rest is already in the shade: replaced, not rung twice */
    let again = false;

    if (kind === "timer") {
      again = await self.registration.getNotifications({ tag })
        .then((list) => list.length > 0).catch(() => false);
    }

    if (kind === "chat") {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const live = clients.filter((c) => c.url.startsWith(self.registration.scope));
      watching = await tellAndAsk(live, d);
      if (watching && !STRICT_PUSH) return;
      /* One notification per conversation rather than one per message, so a
         burst of five replies is one line in the shade and not five — but
         each of them still has to ALERT. `renotify` says so and only
         Chrome listens: Safari and Firefox swap a same-tag notification in
         without a sound, so the second message of a conversation arrived in
         silence. Taking the old one down first makes every message a new
         notification, everywhere, and still leaves one line. */
      await closeTagged(tag);
    }

    const quiet = watching || again;
    await self.registration.showNotification(d.title || "Zenofit", {
      body: d.body || "",
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      tag,
      renotify: !quiet,
      silent: quiet,
      /* A timer waits to be acknowledged because missing it ends the set.
         A message does not: it is still there when you pick the phone up,
         and a notification that refuses to go away is a notification
         people turn off. The server says which this is. */
      requireInteraction: d.requireInteraction !== false,
      vibrate: quiet ? undefined : kind === "chat" ? [120, 80, 120] : [250, 120, 250, 120, 400],
      /* `at` is the server's stamp on the message, which is what lets the
         page take this down once the conversation is read on ANY device
         (chatCloseRead) without taking down a newer one by mistake.
         `ref` is the app's id for a timer, which is how the page finds
         this one again (timerNotifsTidy). */
      data: { url: d.url || "./", kind, id: d.id || null, at: d.at || null, ref: d.ref || null },
    });
    if (watching) await closeTagged(tag);
    /* after it is shown, never instead: see the block above */
    if (kind === "timer") await tellWindows({ type: "timer-push", data: { ref: d.ref || null, tag } });
  })());
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
