#!/usr/bin/env node
/* Checks the pages themselves: what each one loads, and what it says about itself.

   The bug this exists for: index.html does not load css/base.css — it has its own
   index.css — so a <button> on it with no class rendered as the browser's grey box
   next to a styled one. The page looked broken in a way no data check could see.
   Run with:

     node scripts/check-pages.js
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

const pages = ["index.html", "tools.html", "about.html"].concat(
  fs.readdirSync(path.join(ROOT, "apps"))
    .filter(function (name) { return fs.statSync(path.join(ROOT, "apps", name)).isDirectory(); })
    .map(function (name) { return "apps/" + name + "/index.html"; })
    .filter(function (rel) { return fs.existsSync(path.join(ROOT, rel)); }));

const noStylesheet = [], noTitle = [], noDescription = [], bareButton = [], noCommon = [];
pages.forEach(function (rel) {
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const css = (html.match(/<link[^>]+href="([^"]+\.css)"/g) || []).join(" ");
  if (!/\.css/.test(css)) { noStylesheet.push(rel); }
  if (!/<title>[^<]{3,}<\/title>/.test(html)) { noTitle.push(rel); }
  if (!/name="description"/.test(html)) { noDescription.push(rel); }
  const baseCss = /base\.css/.test(css);
  /* A page without base.css has to style a bare <button> itself, or the browser
     will do it — differently in every browser, and differently beside .btn. */
  if (!baseCss) {
    /* The page's own styles, wherever they are: index.html keeps them in
       index.css rather than in a <style> block, and looking only at the block
       said the fix was missing when it was there. */
    let own = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];
    (html.match(/<link[^>]+href="([^"]+\.css)"/g) || []).forEach(function (tag) {
      const href = (tag.match(/href="([^"]+)"/) || [])[1];
      const file = path.join(ROOT, href.replace(/^\.\.\//, "").replace(/^\.\//, ""));
      if (fs.existsSync(file)) { own += fs.readFileSync(file, "utf8"); }
    });
    if (!/(^|[\s,{])button\b/.test(own)) { bareButton.push(rel); }
  }
  /* Every app page mounts the shared top bar and helpers. */
  if (rel.indexOf("apps/") === 0 && !/js\/common\.js/.test(html)) { noCommon.push(rel); }
});

check("every page loads a stylesheet", noStylesheet.length === 0, noStylesheet.join(", "));
check("every page has a title", noTitle.length === 0, noTitle.join(", "));
check("every page describes itself", noDescription.length === 0, noDescription.join(", "));
check("every app page loads the shared client", noCommon.length === 0, noCommon.join(", "));
check("a page without base.css styles a bare <button> itself",
  bareButton.length === 0, bareButton.join(", "));
notes.push(pages.length + " pages checked, " + (pages.length - noStylesheet.length) +
  " with a stylesheet");

/* ---------- report ---------- */

notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked the pages: what they load and what they say; all checks passed");
