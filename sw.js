/* Service worker: what makes this installable and usable with no connection.

   Three rules. The first two are about not serving yesterday's code, which this
   host makes very easy to do by accident: GitHub Pages sends
   `cache-control: max-age=600` on every file it serves, so for ten minutes after a
   deploy the browser — and any plain fetch the worker makes — is handed the copy
   from before it, and the worker then files that copy back into its own cache. A
   fix pushed five minutes ago would not be on the page, and reloading would not
   help. So pages, scripts and stylesheets are asked for with `cache: "no-store"`,
   which is a request that really goes to the network:

     - navigations and HTML: network first, cache only as a fallback
     - scripts and stylesheets: the same, so a deploy lands on the next load
     - everything else (data, images, fonts): revalidated, then the cache as a
       fallback — a large file that has not changed comes back as a 304, so
       keeping the data honest costs almost nothing

   Anything cross-origin is left alone — the local model's weights are fetched
   from Hugging Face by the browser itself, and caching gigabytes of that here
   is not this worker's business.

   Bump CACHE when the shell changes; old caches are deleted on activate. */
var CACHE = "studytools-shell-v23";

var SHELL = [
  "./",
  "./index.html",
  "./tools.html",
  "./about.html",
  "./css/base.css",
  "./index.css",
  "./js/theme.js",
  "./js/common.js",
  "./js/home.js",
  "./js/liturgy.js",
  "./js/notes.js",
  "./js/plan.js",
  "./js/search.js",
  "./js/versification.js",
  "./js/ask.js",
  "./js/data.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      /* one at a time: a single missing file should not fail the whole install */
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () { /* not fatal */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") { return; }

  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) { return; }   /* the model, or anything else */

  var isPage = request.mode === "navigate" ||
    (request.headers.get("accept") || "").indexOf("text/html") > -1;
  /* the code the page runs, whoever asked for it */
  var isCode = request.destination === "script" || request.destination === "style" ||
    /\.(?:js|css)$/.test(url.pathname);

  function remember(request, response) {
    var copy = response.clone();
    caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
  }

  if (isPage || isCode) {
    /* no-store, or this is a request through the browser's own cache and comes back
       as whatever the host let it keep for the next ten minutes */
    event.respondWith(
      fetch(request, { cache: "no-store" }).then(function (response) {
        remember(request, response);
        return response;
      }).catch(function () {
        return caches.match(request, { ignoreSearch: true }).then(function (cached) {
          if (cached) { return cached; }
          if (isPage) { return caches.match("./index.html"); }
          return new Response("", { status: 504, statusText: "offline" });
        });
      })
    );
    return;
  }

  /* the data: revalidate, so a file that has changed is fetched and one that has
     not costs a 304, and fall back to the cached copy when there is no network */
  event.respondWith(
    fetch(request, { cache: "no-cache" }).then(function (response) {
      if (response && response.ok) { remember(request, response); }
      return response;
    }).catch(function () {
      return caches.match(request, { ignoreSearch: true }).then(function (cached) {
        return cached || new Response("", { status: 504, statusText: "offline" });
      });
    })
  );
});
