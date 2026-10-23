/* privacy.html and terms.html: switching language REPLACES the address
   rather than adding to the history, so one back press leaves the page
   instead of walking back through every language looked at. A fragment
   navigation still happens, so CSS :target still picks the section, and
   each section opens with its own language links at its top. Without
   this file the pages still work; each switch is then a history entry. */
document.addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  location.replace(a.getAttribute("href"));
});
