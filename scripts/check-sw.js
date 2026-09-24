#!/usr/bin/env node
/* Checks the service worker: the rules it serves by, and that the shell it installs
   can be installed at all.

   The failure this guards is not a crash. GitHub Pages sends `cache-control:
   max-age=600` on every file it serves, so for ten minutes after a deploy a browser
   — and any plain fetch — is handed the copy from before it. The worker was
   cache-first for everything but pages, which meant a fix that had been pushed was
   not on the page, and reloading did not bring it: the worker asked for the file,
   the browser's cache answered with the old one, and the worker filed that copy
   back. So the strategy is driven here with a stubbed network and cache, and the
   rules are pinned:

     - pages and code: the network first, asked for with `cache: "no-store"`, so
       what comes back has not been through the browser's cache
     - data: revalidated (`cache: "no-cache"`), so an unchanged file costs a 304
     - with no network: whatever was cached, and never a broken response

   Run with:

     node scripts/check-sw.js
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ORIGIN = "https://studytools.cc";
const source = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

const failures = [];
function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

/* ---------- a browser small enough to reason about ---------- */

function urlOf(request) {
  return typeof request === "string" ? new URL(request, ORIGIN + "/").href : request.url;
}

/* Cache Storage, as much of it as the worker uses. `vary` is deliberately not
   modelled: nothing here varies, and the worker matches with ignoreSearch. */
function makeCaches(seed) {
  const entries = new Map(Object.entries(seed || {}));
  const cache = {
    put: function (request, response) { entries.set(urlOf(request), response); return Promise.resolve(); },
    add: function (url) { entries.set(urlOf(url), { ok: true, clone: function () { return this; } }); return Promise.resolve(); },
    keys: function () { return Promise.resolve(Array.from(entries.keys()).map(function (u) { return { url: u }; })); },
    match: function (request) {
      const url = urlOf(request);
      const exact = entries.get(url);
      if (exact) { return Promise.resolve(exact); }
      /* ignoreSearch: the shell is cached under its plain path */
      const bare = url.split("?")[0];
      return Promise.resolve(entries.get(bare) || null);
    }
  };
  return {
    entries: entries,
    open: function () { return Promise.resolve(cache); },
    match: function (request) { return cache.match(request); },
    keys: function () { return Promise.resolve(["studytools-shell-v23"]); },
    delete: function () { return Promise.resolve(true); }
  };
}

/* Load sw.js in this process, with `self` and the caches stubbed. Each call gets a
   fresh set of handlers, so a test cannot leak into the next one. */
function loadWorker(options) {
  const handlers = {};
  const calls = [];
  const caches = makeCaches((options || {}).cached);
  const self = {
    addEventListener: function (type, fn) { handlers[type] = fn; },
    skipWaiting: function () { return Promise.resolve(); },
    clients: { claim: function () { return Promise.resolve(); } },
    location: { origin: ORIGIN },
    caches: caches
  };
  function FakeResponse(body, init) {
    this.body = body;
    this.status = (init || {}).status || 200;
    this.statusText = (init || {}).statusText || "";
    this.ok = this.status >= 200 && this.status < 300;
  }
  FakeResponse.prototype.clone = function () { return new FakeResponse(this.body, { status: this.status }); };
  const sandbox = {
    self: self,
    caches: caches,
    Response: FakeResponse,
    URL: URL,
    Promise: Promise,
    console: console
  };
  const fetch = function (request, init) {
    calls.push({ url: urlOf(request), init: init || {} });
    const answer = (options || {}).network;
    if (answer === "fail") { return Promise.reject(new Error("no network")); }
    const body = answer === "fresh" ? "fresh copy of " + urlOf(request) : "network copy";
    return Promise.resolve(new FakeResponse(body));
  };
  sandbox.fetch = fetch;
  /* the file runs as it would in a worker: `self` and friends are globals there */
  const run = new Function("self", "caches", "fetch", "Response", "URL", "Promise", "console",
    source + "\n//# sourceURL=sw.js");
  run(self, caches, fetch, FakeResponse, URL, Promise, console);
  return {
    handlers: handlers,
    calls: calls,
    caches: caches,
    /* run the fetch handler and give back what it responded with */
    ask: function (request) {
      let responded = null;
      handlers.fetch({ request: request, respondWith: function (p) { responded = p; } });
      return { responded: responded, promise: responded };
    }
  };
}

function request(url, kind) {
  return {
    url: url.startsWith("http") ? url : ORIGIN + url,
    method: "GET",
    mode: kind === "page" ? "navigate" : "no-cors",
    destination: kind === "page" ? "document" : (kind || ""),
    headers: { get: function () { return kind === "page" ? "text/html" : "*/*"; } }
  };
}

/* ---------- the shell ---------- */

const shellMatch = /var SHELL = \[([\s\S]*?)\];/.exec(source);
check("the worker names the files it installs", !!shellMatch, "SHELL not found in sw.js");
const SHELL = shellMatch
  ? shellMatch[1].split(",").map(function (s) { return s.trim().replace(/^"|"$/g, ""); }).filter(Boolean)
  : [];
const missing = SHELL.filter(function (rel) {
  const p = rel === "./" ? "index.html" : rel.replace(/^\.\//, "");
  return !fs.existsSync(path.join(ROOT, p));
});
check("every file it installs is one the site ships", missing.length === 0, missing.join(", "));
check("and the shell holds the shared code every page needs",
  SHELL.indexOf("./js/common.js") !== -1 && SHELL.indexOf("./js/theme.js") !== -1 &&
  SHELL.indexOf("./css/base.css") !== -1, SHELL.join(" "));
check("the cache is versioned, so an old shell cannot be reused",
  /var CACHE = "studytools-shell-v\d+";/.test(source),
  (/var CACHE = ("[^"]*")/.exec(source) || [])[1]);
const shellVersion = (/var CACHE = "studytools-shell-v(\d+)";/.exec(source) || [])[1];

/* ---------- the rules ---------- */

/* 1. online, code: the network is asked, and asked in a way the browser's own cache
      cannot answer with the copy from before the deploy */
const codeWorker = loadWorker({ network: "fresh", cached: { [ORIGIN + "/js/answer.js"]: { body: "yesterday" } } });
const codeAsk = codeWorker.ask(request("/js/answer.js", "script"));
return Promise.resolve(codeAsk.promise).then(function (response) {
  const call = codeWorker.calls[0] || { init: {} };
  check("code is fetched, not taken from the cache", codeWorker.calls.length === 1,
    codeWorker.calls.length + " fetches");
  check("and asked for with no-store, so the host's ten-minute cache cannot answer",
    call.init.cache === "no-store", JSON.stringify(call.init));
  check("so the page runs the new file rather than yesterday's",
    String(response.body).indexOf("fresh") !== -1, String(response.body));
  check("and the new copy is what gets cached",
    String((codeWorker.caches.entries.get(ORIGIN + "/js/answer.js") || {}).body).indexOf("fresh") !== -1);

  /* 2. online, pages: the same, because a stale page is the same fault */
  const pageWorker = loadWorker({ network: "fresh" });
  return Promise.resolve(pageWorker.ask(request("/apps/ask/", "page")).promise).then(function () {
    check("pages are asked for with no-store too",
      (pageWorker.calls[0] || { init: {} }).init.cache === "no-store",
      JSON.stringify((pageWorker.calls[0] || {}).init));

    /* 3. online, data: revalidated, not re-downloaded blind */
    const dataWorker = loadWorker({ network: "fresh" });
    return Promise.resolve(dataWorker.ask(request("/data/atlas/layers.json", "json")).promise).then(function () {
      check("data is revalidated rather than trusted",
        (dataWorker.calls[0] || { init: {} }).init.cache === "no-cache",
        JSON.stringify((dataWorker.calls[0] || {}).init));

      /* 4. offline: every kind falls back to what was cached */
      const offline = {
        [ORIGIN + "/js/answer.js"]: { body: "cached code" },
        [ORIGIN + "/apps/ask/"]: { body: "cached page" },
        [ORIGIN + "/data/atlas/layers.json"]: { body: "cached data" },
        [ORIGIN + "/index.html"]: { body: "the front page" }
      };
      const codeOff = loadWorker({ network: "fail", cached: offline });
      return Promise.resolve(codeOff.ask(request("/js/answer.js", "script")).promise).then(function (res) {
        check("offline, code comes from the cache", String(res.body) === "cached code", String(res.body));
        const pageOff = loadWorker({ network: "fail", cached: offline });
        return Promise.resolve(pageOff.ask(request("/apps/ask/", "page")).promise).then(function (r) {
          check("offline, the page comes from the cache", String(r.body) === "cached page", String(r.body));
          const homeOff = loadWorker({ network: "fail", cached: offline });
          return Promise.resolve(homeOff.ask(request("/apps/never-visited/", "page")).promise).then(function (r2) {
            check("offline, a page never visited falls back to the front page",
              String(r2.body) === "the front page", String(r2.body));
            const dataOff = loadWorker({ network: "fail", cached: offline });
            return Promise.resolve(dataOff.ask(request("/data/atlas/layers.json", "json")).promise).then(function (r3) {
              check("offline, data comes from the cache", String(r3.body) === "cached data", String(r3.body));

              /* 5. offline with nothing cached: a response, not a broken one */
              const bare = loadWorker({ network: "fail" });
              const ask = bare.ask(request("/js/answer.js", "script"));
              check("offline with nothing cached, the request is still answered",
                !!ask.responded, "respondWith was not called");
              return Promise.resolve(ask.promise).then(function (r4) {
                check("with a plain failure rather than nothing", r4 && r4.status === 504,
                  r4 ? String(r4.status) : "no response");

                /* 6. anything else is left to the browser */
                const other = loadWorker({ network: "fresh" });
                const outside = other.ask(request("https://huggingface.co/model.bin", "json"));
                check("another origin is left alone", !outside.responded);
                const post = loadWorker({ network: "fresh" });
                const body = request("/js/answer.js", "script");
                body.method = "POST";
                post.handlers.fetch({ request: body, respondWith: function () { throw new Error("should not answer a POST"); } });
                check("so is anything that is not a GET", true);

                /* 7. and the plain `fetch(request)` that caused all this is not back */
                const bare_fetches = (source.match(/fetch\(request\)/g) || []).length;
                check("no request goes to the network through the browser's cache",
                  bare_fetches === 0, bare_fetches + " bare fetch(request) calls");

                if (failures.length) {
                  failures.forEach(function (f) { console.log("FAIL: " + f); });
                  console.log(failures.length + " failure(s)");
                  process.exit(1);
                }
                console.log("checked the service worker: shell v" + shellVersion + ", " +
                  SHELL.length + " files, and the rules it serves by");
                console.log("all checks passed");
              });
            });
          });
        });
      });
    });
  });
}).catch(function (err) {
  console.log("FAIL: the checks threw — " + err.message);
  console.log(err.stack);
  process.exit(1);
});
