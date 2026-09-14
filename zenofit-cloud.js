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
 */

(function () {
  "use strict";

  const API = "https://zenofit-api.kerlit.workers.dev";
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
     load. Resolves {ok:true} or {ok:false, reason}. Never throws at the UI. */
  async function enablePush() {
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
     because the stored copy carried a newer clientUpdatedAt. */
  function pushChanges(profileId, items) {
    return call("POST", "/v1/profiles/" + profileId + "/items", { items: items });
  }

  /* ---- profiles and seeds -------------------------------------------------- */

  const listProfiles   = () => call("GET", "/v1/profiles");
  const createProfile  = (name) => call("POST", "/v1/profiles", { name });
  const renameProfile  = (id, name) => call("PUT", "/v1/profiles/" + id, { name });
  const deleteProfile  = (id) => call("DELETE", "/v1/profiles/" + id);
  const listSeeds      = (id) => call("GET", "/v1/profiles/" + id + "/seeds");
  const createSeed     = (id, level) => call("POST", "/v1/profiles/" + id + "/seeds", { level: level || "write" });
  const rotateSeeds    = (id, level) => call("POST", "/v1/profiles/" + id + "/seeds", { level: level || "write", rotate: true });
  const revokeSeed     = (seed) => call("DELETE", "/v1/seeds/" + encodeURIComponent(seed));
  const joinWithSeed   = (seed) => call("POST", "/v1/join", { seed });
  const listGrants     = (id) => call("GET", "/v1/profiles/" + id + "/grants");
  const revokeGrant    = (id, userId) => call("DELETE", "/v1/profiles/" + id + "/grants/" + userId);

  window.ZenofitCloud = {
    API,
    ensureDevice, hasDevice,
    isStandalone, isIOS, pushBlockedReason,
    enablePush, disablePush, pushEnabled, testPush,
    scheduleTimer, cancelTimer, clockDrift,
    pullChanges, pushChanges,
    listProfiles, createProfile, renameProfile, deleteProfile,
    listSeeds, createSeed, rotateSeeds, revokeSeed, joinWithSeed,
    listGrants, revokeGrant,
    _call: call,
  };
})();
