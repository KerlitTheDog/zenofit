/* Zenofit cloud client.
 *
 * Everything that talks to the API lives here, behind window.ZenofitCloud, so
 * app.js can call it without knowing anything about tokens, endpoints or the
 * push spec. Nothing here touches `state` or localStorage keys that app.js
 * owns, and nothing here is required for the app to run: if the API is down,
 * or the user never enables anything, every call fails softly and the app
 * behaves exactly as it did before.
 *
 * Storage keys are deliberately outside `state`, because backupText()
 * serialises all of `state` and a device token must never travel in a backup
 * file that gets shared or restored onto another phone.
 *
 *   zenofit:device   {userId, token}       this browser's identity
 *   zenofit:push     {endpoint}            what we last subscribed with
 *
 * (app.js keeps `zenofit:notify` beside these: whether this DEVICE wants
 * notifications at all and which kinds, which is a fact about the phone and
 * therefore not in `state` either.)
 */

(function () {
  "use strict";

  /* The deployed worker, unless somebody deliberately pointed this build at
     a local one first (window.ZENOFIT_API = "http://127.0.0.1:8787" before
     this script loads). That override exists so a change to the API can be
     driven from a real browser against `wrangler dev` before it is anywhere
     near the live database; nothing in the app ever sets it. */
  const API = (typeof window !== "undefined" && window.ZENOFIT_API) || "https://zenofit-api.kerlit.workers.dev";
  const DEVICE_KEY = "zenofit:device";
  const PUSH_KEY = "zenofit:push";

  /* ---- tiny storage helpers ---------------------------------------------- */
  /* Every read and write is guarded: private mode, a full quota and blocked
     site data all throw here, and none of them are worth breaking the app. */
  function read(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  /* ---- http -------------------------------------------------------------- */

  async function call(method, path, body, opts) {
    const headers = {};
    const device = read(DEVICE_KEY);
    if (device && device.token && !(opts && opts.noAuth)) {
      headers.Authorization = "Bearer " + device.token;
    }
    if (body !== undefined) headers["content-type"] = "application/json";

    const res = await fetch(API + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let data = null;
    try { data = await res.json(); } catch { /* empty or not json */ }

    if (!res.ok) {
      const err = new Error((data && data.message) || ("HTTP " + res.status));
      err.status = res.status;
      err.code = data && data.error;
      throw err;
    }
    return data;
  }

  /* ---- identity ----------------------------------------------------------- */

  /* Called once per browser, ever. The token it stores is this device's only
     credential; losing it means losing access to anything shared with it, so
     it is never cleared except by the user wiping site data. */
  async function ensureDevice() {
    const existing = read(DEVICE_KEY);
    if (existing && existing.token) return existing;

    const created = await call("POST", "/v1/devices", { displayName: null }, { noAuth: true });
    const device = { userId: created.userId, token: created.token };
    write(DEVICE_KEY, device);
    return device;
  }

  const hasDevice = () => !!(read(DEVICE_KEY) || {}).token;

  /* ---- accounts -----------------------------------------------------------
   * A username and a password, and the password never leaves this file.
   *
   * WHY THE BROWSER DOES THE EXPENSIVE PART. A password has to be slow to
   * check or a leaked table is a list of passwords, and the Worker running
   * the other end of this gets TEN MILLISECONDS of CPU per request on the
   * free plan — less than PBKDF2 needs at any honest iteration count. So the
   * stretching happens here, where the CPU is the user's and free, and what
   * goes over the wire is 256 bits of derived key. The server salts and
   * hashes that once more before storing it, which is cheap and sound
   * because the thing it is hashing is no longer guessable.
   *
   * THE SALT IS THE USERNAME, lower-cased. A random salt would have to be
   * fetched before a login could be attempted, which is a second round trip
   * and an endpoint that answers "does this account exist" to anybody who
   * asks. Deriving it from the username costs the ability to tell two
   * identical passwords apart across accounts, which is not a property worth
   * a round trip here, and usernames are unique so no two people share one.
   *
   * 210,000 iterations is OWASP's PBKDF2-SHA256 figure. It costs a phone
   * something like a third of a second, once, at sign-in. If this number
   * ever changes, test/smoke_auth.py has to change with it or every login
   * will fail while every test passes.                                     */

  const PBKDF2_ITERS = 210000;

  async function deriveKey(username, password) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc.encode("zenofit:" + String(username).toLowerCase()), iterations: PBKDF2_ITERS, hash: "SHA-256" },
      base, 256
    );
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* Whoever this browser currently is. `username` is null for a device that
     has never been claimed, which is every install before it signs up. */
  const account = () => {
    const d = read(DEVICE_KEY) || {};
    return d.token ? { userId: d.userId || null, username: d.username || null } : null;
  };
  const signedIn = () => !!(read(DEVICE_KEY) || {}).username;

  /* Claim THIS device if it already has one, otherwise make a new account.
     The difference matters: claiming keeps every profile already synced from
     this phone, and the server decides which happened from the token it is
     sent, so the app does not have to. */
  async function register(username, password) {
    const key = await deriveKey(username, password);
    const res = await call("POST", "/v1/auth/register", { username, key });
    /* a claim returns no token, because the one already stored still works */
    const now = read(DEVICE_KEY) || {};
    write(DEVICE_KEY, { userId: res.userId, token: res.token || now.token, username: res.username });
    return res;
  }

  async function signIn(username, password) {
    const key = await deriveKey(username, password);
    /* noAuth: signing in as somebody else must not be coloured by whoever
       this browser is at the moment */
    const res = await call("POST", "/v1/auth/login", { username, key }, { noAuth: true });
    write(DEVICE_KEY, { userId: res.userId, token: res.token, username: res.username });
    return res;
  }

  /* Forgets this browser's credential, and tells the server to forget it
     too. The account and everything in it stay exactly where they are;
     signing in again brings it all back. The app clears its own local
     copies.

     The server half used to be missing, so a logged-out token went on
     working for ever: anybody who had copied it off a borrowed phone still
     had the account. It is sent and not awaited — logging out in a basement
     must still log out — so a token that could not be revoked because there
     was no signal is the one case left, and nothing on this phone holds it
     any more. */
  function signOut() {
    const d = read(DEVICE_KEY);
    try { localStorage.removeItem(DEVICE_KEY); } catch { /* already gone */ }
    if (d && d.token) {
      try {
        fetch(API + "/v1/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + d.token } })
          .catch(() => { /* no signal: see above */ });
      } catch { /* no fetch at all */ }
    }
  }

  /* Does this password open this account? Answered without signing in:
     nothing is stored here and the server issues no token. Storage check
     asks it before handing out training that belongs to an account this
     phone is not signed in to. Resolves {userId, username}; a wrong pair
     throws 401 bad_login like signIn does. */
  async function verifyPassword(username, password) {
    const key = await deriveKey(username, password);
    return call("POST", "/v1/auth/verify", { username, key }, { noAuth: true });
  }

  const nameAvailable = (username) =>
    call("GET", "/v1/auth/available?username=" + encodeURIComponent(username), undefined, { noAuth: true });

  /* ---- environment checks ------------------------------------------------- */

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  const isIOS = () =>
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  /* Why push is unavailable, in words a person can act on. Returns null when
     everything needed is present. */
  function pushBlockedReason() {
    if (!("serviceWorker" in navigator)) return "unsupported";
    if (!("PushManager" in window)) return isIOS() && !isStandalone() ? "ios-needs-install" : "unsupported";
    if (!("Notification" in window)) return "unsupported";
    if (isIOS() && !isStandalone()) return "ios-needs-install";
    if (Notification.permission === "denied") return "denied";
    return null;
  }

  /* ---- push --------------------------------------------------------------- */

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /* MUST be called from a real tap. iOS rejects a permission prompt that was
     not triggered by a user gesture, and Chrome penalises sites that ask on
     load. Resolves {ok:true} or {ok:false, reason}. Never throws at the UI.

     opts.off is the kinds this device has said no to ("chat", "timer"),
     sent with the subscription so the server never pushes them here. */
  async function enablePush(opts) {
    const blocked = pushBlockedReason();
    if (blocked) return { ok: false, reason: blocked };

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };

      await ensureDevice();

      const cfg = await call("GET", "/v1/config", undefined, { noAuth: true });
      if (!cfg || !cfg.vapidPublicKey) return { ok: false, reason: "server-not-configured" };

      const reg = await navigator.serviceWorker.ready;

      /* An existing subscription made with a different key is useless: the
         push service will accept it and the server will never be able to
         encrypt for it. Drop it and make a new one. */
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        const current = sub.options && sub.options.applicationServerKey;
        const wanted = urlBase64ToUint8Array(cfg.vapidPublicKey);
        const same = current && new Uint8Array(current).every((b, i) => b === wanted[i]);
        if (!same) { await sub.unsubscribe().catch(() => {}); sub = null; }
      }

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey),
        });
      }

      const raw = sub.toJSON();
      await call("POST", "/v1/push/subscribe", {
        endpoint: raw.endpoint,
        keys: raw.keys,
        platform: isIOS() ? "ios" : /Android/.test(navigator.userAgent) ? "android" : "desktop",
        off: (opts && Array.isArray(opts.off)) ? opts.off : [],
      });

      write(PUSH_KEY, { endpoint: raw.endpoint });
      return { ok: true };
    } catch (e) {
      console.warn("enablePush failed", e);
      return { ok: false, reason: "error", error: e && e.message };
    }
  }

  async function disablePush() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await call("DELETE", "/v1/push/subscribe", { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      write(PUSH_KEY, null);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.message };
    }
  }

  async function pushEnabled() {
    if (!hasDevice() || pushBlockedReason()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return !!sub && Notification.permission === "granted";
    } catch { return false; }
  }

  const testPush = () => call("POST", "/v1/push/test", {});

  /* This browser's own subscription endpoint, or null. It is the handle the
     server files per-device preferences under. */
  async function pushEndpoint() {
    try {
      if (!("serviceWorker" in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? sub.endpoint : null;
    } catch { return null; }
  }

  /* Which kinds this device does not want. Fire-and-report: a device with
     no subscription has nothing to set, and says so. */
  async function setPushPrefs(off) {
    const endpoint = await pushEndpoint();
    if (!endpoint) return { ok: false, reason: "not-subscribed" };
    try {
      const res = await call("PUT", "/v1/push/prefs", { endpoint, off: Array.isArray(off) ? off : [] });
      return { ok: true, off: res.off };
    } catch (e) { return { ok: false, error: e && e.message, status: e && e.status }; }
  }

  /* What the server knows: devices on the account, and whether THIS one is
     among them. Throws, like the other diagnostics the window shows. */
  async function pushStatus() {
    const endpoint = await pushEndpoint();
    return call("GET", "/v1/push/status" + (endpoint ? "?endpoint=" + encodeURIComponent(endpoint) : ""));
  }

  /* ---- timers ------------------------------------------------------------- */

  /* Two ways to schedule, and for a rest timer only one of them is right.
   *
   *   scheduleTimer({ inMs: 90000 })      <- use this
   *   scheduleTimer({ fireAt: <ms> })     <- only for a real wall-clock moment
   *
   * Phones are routinely a few seconds off. Measured on a real device here:
   * 2.8 seconds. Sending an absolute time computed from Date.now() hands that
   * error straight to the server, and the alarm lands early or late by exactly
   * that much. Sending a duration lets the server resolve it against its own
   * clock, and the phone's is never consulted.
   *
   * lastDrift is kept for diagnostics only. Nothing depends on it. */
  let lastDrift = null;

  async function scheduleTimer(opts) {
    if (!hasDevice()) return null;

    const payload = {
      label: opts.label || null,
      title: opts.title || opts.label || "Timer done",
      body: opts.body || "",
    };

    if (Number.isFinite(opts.inMs)) payload.durationMs = opts.inMs;
    else if (Number.isFinite(opts.fireAt)) payload.fireAt = opts.fireAt;
    else return null;

    try {
      const res = await call("POST", "/v1/timers", payload);
      if (res && typeof res.serverNow === "number") lastDrift = res.serverNow - Date.now();
      return res;
    } catch (e) {
      console.warn("scheduleTimer failed", e);
      return null;
    }
  }

  /* Positive means the server is ahead of this device. Diagnostics only. */
  const clockDrift = () => lastDrift;

  async function cancelTimer(timerId) {
    if (!timerId || !hasDevice()) return false;
    try { await call("DELETE", "/v1/timers/" + encodeURIComponent(timerId)); return true; }
    catch { return false; }
  }

  /* ---- sync transport ------------------------------------------------------
   *
   * Deliberately dumb. These two move rows and nothing else: no merge policy,
   * no field knowledge, no retry queue. What a log entry means and which of
   * two edits wins belongs to app.js, and having a second answer to that here
   * is how the two halves end up disagreeing.
   *
   * Unlike the rest of this file these DO throw, because the caller has to be
   * able to tell the failures apart. The error carries .status and .code:
   *   403 read_only   a read grant tried to write
   *   404 not_found   no access, or the profile is gone
   *   400 bad_item    message names the collection and item
   *   413 too_large   too much in one push
   */

  /* since: pass the cursor from the previous pull. A bare millisecond is the
     entry point for a first pull only, because rows written in the same
     millisecond cannot be separated by one. */
  function pullChanges(profileId, since) {
    const q = new URLSearchParams();
    if (typeof since === "string" && since) q.set("cursor", since);
    else if (Number.isFinite(since) && since > 0) q.set("since", String(since));
    else if (since && typeof since === "object") {
      if (since.cursor) q.set("cursor", since.cursor);
      else if (Number.isFinite(since.since)) q.set("since", String(since.since));
      if (Number.isFinite(since.limit)) q.set("limit", String(since.limit));
    }
    const qs = q.toString();
    return call("GET", "/v1/profiles/" + profileId + "/changes" + (qs ? "?" + qs : ""));
  }

  /* items: [{collection, itemId, json, deleted?, clientUpdatedAt?}]
     The response reports `accepted`, and `staleItems` for anything refused
     because the stored copy carried a newer clientUpdatedAt.

     opts.allowWipe lifts the server's refusal of a batch that would delete
     most of the profile (409 wipe_refused). It is never set by the ordinary
     sync path: only by a restore or a reset, which are the user saying
     "replace what is there" behind a confirm. Passing it is app.js's
     decision, not this file's — see the block in syncPush. */
  function pushChanges(profileId, items, opts) {
    const body = { items: items };
    if (opts && opts.allowWipe) body.allowWipe = true;
    return call("POST", "/v1/profiles/" + profileId + "/items", body);
  }

  /* ---- photos ---------------------------------------------------------------
   *
   * A photo's id is the SHA-256 of its data URL, worked out here the same
   * way the server checks it, so the two can never disagree about what an
   * id names. Transport only: which photos a library needs, and when to
   * send or fetch them, is app.js's business (the PHOTOS block there).
   *
   * These throw, like the sync transport above, because the caller has to
   * tell "not there yet" (404) from "no signal".                          */
  async function photoId(dataUrl) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(dataUrl)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const photoHave = (ids) => call("POST", "/v1/photos/have", { ids });
  const photoPut  = (id, data) => call("PUT", "/v1/photos/" + id, { data });
  const photoGet  = (id) => call("GET", "/v1/photos/" + id);

  /* ---- profiles and seeds -------------------------------------------------- */

  /* ---- the roster -----------------------------------------------------------
   * listProfiles is not a listing any more, it is THE profile list: a second
   * device builds its whole roster from it, names and order included. So a
   * name travels with the moment it was typed (`nameUpdatedAt`, the client's
   * clock, compared only with itself) and a position travels with the profile
   * rather than living on whichever phone the list was dragged on.
   */
  const listProfiles   = () => call("GET", "/v1/profiles");
  /* opts.clientKey is this device's own id for the profile. Sent again after
     a reply that never arrived, it gets the SAME profile back rather than a
     second one (see POST /v1/profiles). */
  const createProfile  = (name, opts) =>
    call("POST", "/v1/profiles", { name, position: (opts || {}).position, nameUpdatedAt: (opts || {}).nameUpdatedAt,
      clientKey: (opts || {}).clientKey });
  /* The reply carries the name that WON, which is not always the one sent:
     a rename older than the stored one comes back `stale: true` with the
     newer name, and that is the answer, not an error to retry. */
  const renameProfile  = (id, name, nameUpdatedAt) =>
    call("PUT", "/v1/profiles/" + id, { name, nameUpdatedAt });
  /* One call for the whole list, because a drag renumbers every row after
     the one that moved and six round trips is how that lands half-applied. */
  const setProfileOrder = (ids) => call("POST", "/v1/profiles/order", { order: ids });
  const deleteProfile  = (id) => call("DELETE", "/v1/profiles/" + id);
  const listSeeds      = (id) => call("GET", "/v1/profiles/" + id + "/seeds");
  const createSeed     = (id, level) => call("POST", "/v1/profiles/" + id + "/seeds", { level: level || "write" });
  const rotateSeeds    = (id, level) => call("POST", "/v1/profiles/" + id + "/seeds", { level: level || "write", rotate: true });
  const revokeSeed     = (seed) => call("DELETE", "/v1/seeds/" + encodeURIComponent(seed));
  const joinWithSeed   = (seed) => call("POST", "/v1/join", { seed });
  const listGrants     = (id) => call("GET", "/v1/profiles/" + id + "/grants");
  const revokeGrant    = (id, userId) => call("DELETE", "/v1/profiles/" + id + "/grants/" + userId);
  /* Change somebody's level without evicting them. Revoking used to be the
     only way to take write access back, which costs the other person the
     profile and a new code just to be moved to read-only. */
  /* Give up your OWN access to a profile somebody shared with you. The
     counterpart of deleteProfile for a profile that is not yours: both mean
     "this is not in my account any more", and both therefore reach every
     device the account is signed in on, which a local unlink never could. */
  const leaveProfile   = (id) => call("DELETE", "/v1/profiles/" + id + "/grants/me");
  const setGrantLevel  = (id, userId, level) =>
    call("PUT", "/v1/profiles/" + id + "/grants/" + userId, { level: level === "write" ? "write" : "read" });

  /* ---- chat ----------------------------------------------------------------
   *
   * Transport only, like pullChanges/pushChanges above, and for the same
   * reason: what a thread looks like on screen, which messages are cached and
   * how a failed send is retried are app.js's business.
   *
   * These DO throw, because the caller has to tell the failures apart. The
   * error carries .status and .code:
   *   401 unauthorized  not signed in, or the token is gone
   *   403 blocked       they are not accepting messages from you
   *   409 you_blocked   you blocked them
   *   404 not_found     no such chat, or you are not in it
   *   429 too_fast      too many messages in a minute
   *
   * A CHAT NEEDS AN ACCOUNT, not just a device. A device token is enough to
   * search (so the screen works while somebody is still deciding to sign up)
   * but a person who has never registered has no username, so there is no
   * name for anybody to find them under and nothing to address a message to.
   * `signedIn()` above is the check the UI makes before offering any of this.
   */

  const searchUsers = (q) =>
    call("GET", "/v1/users/search?q=" + encodeURIComponent(q || ""));

  /* The whole list, with the last message and an unread count per thread.
     Small enough to be the poll: one request answers "is there anything
     new anywhere", which is what the badge on the nav is asking. */
  const listChats = () => call("GET", "/v1/chats");

  /* Find-or-create. Tapping a name means "take me to the conversation with
     this person", which is the same request whether or not it exists yet, so
     there is deliberately no separate create call to get wrong. */
  const openChat = (userId) => call("POST", "/v1/chats", { userId });

  /* opts: {since} for what is new, {before} to page back into history,
     {limit} for how much. Bare, it returns the tail of the thread. */
  function fetchMessages(threadId, opts) {
    const o = opts || {};
    const q = new URLSearchParams();
    if (Number.isFinite(o.since) && o.since > 0) q.set("since", String(o.since));
    else if (Number.isFinite(o.before) && o.before > 0) q.set("before", String(o.before));
    if (Number.isFinite(o.limit)) q.set("limit", String(o.limit));
    const qs = q.toString();
    return call("GET", "/v1/chats/" + threadId + "/messages" + (qs ? "?" + qs : ""));
  }

  /* `clientId` is the app's own id for a message it has ALREADY drawn on
     screen, and passing it is what makes a retry safe: the server lands the
     second attempt on the same row instead of sending twice. A send without
     one is a send that can duplicate itself on a flaky connection. */
  const sendMessage = (threadId, body, clientId, kind, payload) =>
    call("POST", "/v1/chats/" + threadId + "/messages",
      kind && kind !== "text" ? { body, clientId, kind, payload } : { body, clientId });

  /* Delete for everyone. Only the sender may, and the other phone drops its
     copy on its next poll (the server names it in `unsent`). */
  const unsendMessage = (threadId, messageId) =>
    call("DELETE", "/v1/chats/" + threadId + "/messages/" + encodeURIComponent(messageId));

  /* A picture for this conversation, uploaded before the message that
     shows it. Readable by the thread's members only, and deleted with the
     message if it is unsent. Resolves {photoId}. */
  const uploadChatPhoto = (threadId, data) =>
    call("POST", "/v1/chats/" + threadId + "/photos", { data });

  /* A photo uploaded for a message that then failed and was discarded:
     "delete" on the phone has to mean gone from the server too. Refused
     (409) while a message still shows it -- that is what unsending is for. */
  const discardChatPhoto = (threadId, photoId) =>
    call("DELETE", "/v1/chats/" + threadId + "/photos/" + encodeURIComponent(photoId));

  const markChatRead = (threadId, at) =>
    call("POST", "/v1/chats/" + threadId + "/read", Number.isFinite(at) ? { at } : {});

  const muteChat = (threadId, on) =>
    call(on === false ? "DELETE" : "POST", "/v1/chats/" + threadId + "/mute", {});

  /* Yours only: the other person keeps their copy, and writing to them again
     puts the same thread back rather than starting a second one. */
  const leaveChat = (threadId) => call("DELETE", "/v1/chats/" + threadId);

  const listBlocks   = () => call("GET", "/v1/chats/blocks");
  const blockUser    = (userId) => call("POST", "/v1/chats/blocks", { userId });
  const unblockUser  = (userId) => call("DELETE", "/v1/chats/blocks/" + userId);

  window.ZenofitCloud = {
    API,
    ensureDevice, hasDevice,
    deriveKey, register, signIn, signOut, account, signedIn, nameAvailable, verifyPassword,
    isStandalone, isIOS, pushBlockedReason,
    enablePush, disablePush, pushEnabled, testPush, pushEndpoint, setPushPrefs, pushStatus,
    photoId, photoHave, photoPut, photoGet,
    scheduleTimer, cancelTimer, clockDrift,
    pullChanges, pushChanges,
    listProfiles, createProfile, renameProfile, deleteProfile, setProfileOrder,
    listSeeds, createSeed, rotateSeeds, revokeSeed, joinWithSeed,
    listGrants, revokeGrant, setGrantLevel, leaveProfile,
    searchUsers, listChats, openChat, fetchMessages, sendMessage, unsendMessage, uploadChatPhoto, discardChatPhoto,
    markChatRead, muteChat, leaveChat, listBlocks, blockUser, unblockUser,
    _call: call,
  };
})();
