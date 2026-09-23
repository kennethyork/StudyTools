#!/usr/bin/env node
/* Checks the atlas: the places, the verses they claim, and the map they are drawn on.

   Two datasets are stitched together here — OpenBible.info's places and verses, and
   Natural Earth's coastline — and the failure that matters is a place pointing at a
   verse that does not exist, or a coastline that draws nothing. Run with:

     node scripts/check-atlas.js
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "atlas");
const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}
function load(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }

const atlas = load("data/atlas/places.json");
const land = load("data/atlas/land.json");
const water = load("data/atlas/water.json");
const books = load("data/bible/books.json");
const bySlug = {};
books.forEach(function (b) { bySlug[b.slug] = b; });

check("the atlas says where its data came from",
  !!(atlas.source || {}).places && /OpenBible|CC BY/.test(atlas.source.places),
  JSON.stringify(atlas.source));
check("it holds the places and the count it claims",
  atlas.count > 1000 && atlas.places.length === atlas.count,
  atlas.places.length + " places against a claimed " + atlas.count);

const noPosition = atlas.places.filter(function (p) {
  return typeof p.lon !== "number" || typeof p.lat !== "number" ||
    p.lon < -180 || p.lon > 180 || p.lat < -90 || p.lat > 90;
});
check("every place has a position inside the world", noPosition.length === 0,
  noPosition.slice(0, 3).map(function (p) { return p.name; }).join(", "));

const named = atlas.places.filter(function (p) { return (p.verses || []).length; });
check("most places carry the verses they are named in", named.length > 1000,
  named.length + " of " + atlas.places.length);

/* Every verse a place claims has to be a verse the reader can open. The atlas is
   the only place on the site where a reference arrives from outside the site. */
const verseCache = {};
function versesOf(slug, chapter) {
  const key = slug + "|" + chapter;
  if (key in verseCache) { return verseCache[key]; }
  const numbers = new Set();
  const book = bySlug[slug];
  ((book && book.translations) || []).forEach(function (t) {
    const file = path.join(ROOT, "data", "bible", slug + "." + t + ".json");
    if (!fs.existsSync(file)) { return; }
    let data;
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return; }
    Object.keys(((data.chapters || {})[String(chapter)]) || {}).forEach(function (v) {
      numbers.add(Number(v));
    });
  });
  verseCache[key] = numbers;
  return numbers;
}

let refs = 0;
const badRefs = [];
const unknownBooks = new Set();
atlas.places.forEach(function (place) {
  (place.verses || []).forEach(function (v) {
    refs++;
    const slug = v[0];
    if (!bySlug[slug]) { unknownBooks.add(slug); return; }
    const have = versesOf(slug, v[1]);
    if (have.size && !have.has(v[2])) {
      if (badRefs.length < 5) { badRefs.push(slug + " " + v[1] + ":" + v[2]); }
    }
  });
});
check("every place's verses are to books the reader has", unknownBooks.size === 0,
  Array.from(unknownBooks).join(", "));
check("every verse a place claims exists in the reader", badRefs.length === 0,
  badRefs.join("; "));
notes.push(refs.toLocaleString() + " place-verses checked against the text");

/* The map: a coastline that draws, and water lines that have a shape. */
const landRings = [];
(land.features || []).forEach(function (f) {
  const geom = f.geometry || {};
  if (geom.type !== "Polygon") { return; }
  geom.coordinates.forEach(function (ring) { landRings.push(ring.length); });
});
check("the coastline is a set of polygons with area",
  landRings.length > 50 && landRings.every(function (n) { return n >= 4; }),
  landRings.length + " rings, shortest " + Math.min.apply(null, landRings));
check("the water lines are lines", water.length > 50 && water.every(function (l) {
  return Array.isArray(l) && l.length >= 2 && l.every(function (pt) {
    return pt.length === 2 && Math.abs(pt[0]) <= 180 && Math.abs(pt[1]) <= 90;
  });
}), water.length + " lines");
notes.push(landRings.length + " land rings, " + water.length + " water lines");

/* The page the data is for. */
const page = fs.readFileSync(path.join(ROOT, "apps", "atlas", "index.html"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "apps", "atlas", "app.js"), "utf8");
check("the atlas is a page that loads the map data",
  /data\/atlas\/places\.json/.test(app) && /data\/atlas\/land\.json/.test(app));
check("it says no tiles are fetched", /no map tiles|No tiles/i.test(page));
check("it does not hard-code a count of places", !/1,3\d\d/.test(app + page));
check("it is registered and carded",
  /id: "atlas"/.test(fs.readFileSync(path.join(ROOT, "js", "common.js"), "utf8")) &&
  /apps\/atlas\//.test(fs.readFileSync(path.join(ROOT, "tools.html"), "utf8")));

notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked the atlas: places, verses and coastline; all checks passed");
