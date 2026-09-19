/* Apply the saved (or system) theme before first paint to avoid a flash.
   Kept tiny and synchronous; loaded in <head> of every page. */
(function () {
  try {
    var stored = localStorage.getItem("studytools.theme");
    var dark = stored === "dark" ||
      (stored !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
