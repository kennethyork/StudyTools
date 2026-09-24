/* Service worker: what makes this installable and usable with no connection.

   Two rules, chosen so the worker can never serve stale data silently:

     - navigations and HTML: network first, cache only as a fallback, so a
       deploy is picked up the moment there is a connection
     - everything else on this origin: the cached copy straight away, with a
       background fetch to refresh it for next time

   Anything cross-origin is left alone — the local model's weights are fetched
   from Hugging Face by the browser itself, and caching gigabytes of that here
   is not this worker's business.

   Bump CACHE when the shell changes; old caches are deleted on activate. */
var CACHE = "studytools-shell-v20";

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

  if (isPage) {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        return response;
      }).catch(function () {
        return caches.match(request).then(function (cached) {
          return cached || caches.match("./index.html");
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
