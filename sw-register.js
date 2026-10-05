(function () {
  if (!("serviceWorker" in navigator)) return;

  /* Phase 5 will read this: sw.js posts notification clicks here so the app
     can jump to the timer that fired. Queued until app.js claims it.
     `updated` says a newer build than the one running is ready (see
     updateReady), and `wantReload` that somebody asked for it — Refresh in
     app.js reads both. */
  window.__zenofitSW = { pendingClicks: [], onClick: null, updated: false, wantReload: false };
  navigator.serviceWorker.addEventListener("message", function (e) {
    if (e.data && e.data.type === "shell-updated") { updateReady(); return; }
    if (!e.data || e.data.type !== "notification-click") return;
    var h = window.__zenofitSW.onClick;
    if (typeof h === "function") h(e.data.data);
    else window.__zenofitSW.pendingClicks.push(e.data.data);
  });

  function banner() {
    if (document.getElementById("sw-update-bar")) return;
    var bar = document.createElement("div");
    bar.id = "sw-update-bar";
    bar.setAttribute("role", "status");
    bar.style.cssText =
      "position:fixed;left:12px;right:12px;z-index:99999;" +
      "bottom:calc(12px + env(safe-area-inset-bottom));" +
      "display:flex;gap:10px;align-items:center;justify-content:space-between;" +
      "padding:10px 12px;border-radius:12px;font:500 14px/1.3 system-ui,sans-serif;" +
      "background:#1e2027;color:#eaeaf0;box-shadow:0 6px 24px rgba(0,0,0,.45);";
    var msg = document.createElement("span");
    msg.textContent = "A new version is ready.";
    var btn = document.createElement("button");
    btn.textContent = "Reload";
    btn.style.cssText =
      "flex:0 0 auto;border:0;border-radius:9px;padding:8px 14px;" +
      "font:600 14px system-ui,sans-serif;background:#4f7cff;color:#fff;";
    btn.onclick = function () {
      btn.disabled = true;
      window.__zenofitSW.wantReload = true;
      if (reg && reg.waiting) reg.waiting.postMessage("skip-waiting");
      else reloadOnce();
    };
    var dismiss = document.createElement("button");
    dismiss.textContent = "Later";
    dismiss.setAttribute("aria-label", "Dismiss");
    dismiss.style.cssText =
      "flex:0 0 auto;border:0;background:none;color:#9aa0ad;" +
      "font:500 14px system-ui,sans-serif;padding:8px 4px;";
    dismiss.onclick = function () { bar.remove(); };
    bar.appendChild(msg); bar.appendChild(dismiss); bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  /* One reload only. Without the guard, skipWaiting plus controllerchange
     can bounce the page in a loop. */
  var reloading = false;
  function reloadOnce() {
    if (reloading) return;
    reloading = true;
    location.reload();
  }

  /* ── A NEW VERSION WAITS FOR A TAP, OR FOR NOBODY TO BE LOOKING ─────
     sw.js takes over the moment it installs (skipWaiting), and this used
     to reload the page on every controllerchange — so a deploy reloaded
     the app out from under whoever had it open, mid-set, keyboard up,
     and the banner below never got the chance to say anything. And on a
     phone's very FIRST visit, the new worker claiming the page fired the
     same event and reloaded it once for no reason.

     Now: a first install is ignored (this page IS the version that just
     installed). An update says so with the banner and reloads when
     somebody taps Reload or Refresh — or straight away if the app is not
     on screen, and otherwise the moment it leaves the screen, which is
     the one reload nobody sees. Either way an app that is never closed
     still ends up on the new build without anybody having to know. */
  var hadController = !!navigator.serviceWorker.controller;
  function updateReady() {
    window.__zenofitSW.updated = true;
    if (document.visibilityState === "hidden") { reloadOnce(); return; }
    banner();
  }
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (window.__zenofitSW.wantReload) { reloadOnce(); return; }
    if (!hadController) { hadController = true; return; }
    updateReady();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && window.__zenofitSW.updated) reloadOnce();
  });

  /* ── A DEPLOY HAS TO REACH AN APP THAT IS NEVER CLOSED ──────────────
     Everything above only starts once the browser has NOTICED a new
     sw.js, and it looks for one on navigation. An installed app is
     resumed far more often than it is launched, so it can sit on a
     version for days with nothing on screen saying so.

     That is invisible from the inside and it reads as "the fix you
     shipped does not work". It is worse than cosmetic for anything that
     travels: syncApply skips a collection this build has never heard
     of, by design and correctly, so an old copy quietly drops whatever
     the new version added rather than failing at it. One phone a
     version behind therefore looks exactly like a sync bug.

     So ask whenever the app comes back to the front. reg.update() is a
     conditional request against a file of a few kilobytes: unchanged, it
     is a 304 and nothing happens. Throttled so that flicking between
     apps is not a request each time, and never while offline. */
  var reg = null, lastLook = 0;
  function lookForUpdate() {
    if (!reg || document.visibilityState !== "visible") return;
    if (navigator.onLine === false) return;
    if (Date.now() - lastLook < 60000) return;
    lastLook = Date.now();
    reg.update().catch(function () { /* offline or blocked: the cached app stands */ });
  }
  document.addEventListener("visibilitychange", lookForUpdate);

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (r) {
      reg = r;
      lastLook = Date.now();          // registering IS this launch's look
      if (reg.waiting && navigator.serviceWorker.controller) updateReady();
      reg.addEventListener("updatefound", function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", function () {
          /* controller set means this is an update, not a first install */
          if (sw.state === "installed" && navigator.serviceWorker.controller) updateReady();
        });
      });
    }).catch(function (e) {
      console.warn("SW registration failed", e);
    });
  });
})();
