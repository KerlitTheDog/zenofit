/* Stamp the saved theme before first paint to avoid a flash of the
   wrong palette. app.js writes `zenofit:theme` every time it applies one
   (applyTheme); the old single-save key is only read for a phone that
   has not run a build that writes it yet. */
(function () {
  try {
    var t = localStorage.getItem("zenofit:theme");
    if (t !== "light" && t !== "dark") {
      var s = JSON.parse(localStorage.getItem("powerbuild-tracker:v1"));
      t = s && s.settings && s.settings.theme;
    }
    document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
