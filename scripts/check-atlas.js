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
const layers = load("data/atlas/layers.json");
const books = load("data/bible/books.json");
const app = fs.readFileSync(path.join(ROOT, "apps", "atlas", "app.js"), "utf8");
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

/* The map: land with area, rivers and borders as lines, cities as points, and a
   world set for when the view is wider than the region. A layer that arrived empty
   would leave the map a blank rectangle with dots on it, which is what it was. */
/* Land arrives as Polygon or MultiPolygon, rivers and borders as LineString or
   MultiLineString: Natural Earth uses both, and the map draws both. */
const EXPECTED = {
  "land-region": ["Polygon", "MultiPolygon"],
  "lakes-region": ["Polygon", "MultiPolygon"],
  "rivers-region": ["LineString", "MultiLineString"],
  "borders-region": ["LineString", "MultiLineString"],
  "cities-region": ["Point"],
  "land-world": ["Polygon", "MultiPolygon"],
  "lakes-world": ["Polygon", "MultiPolygon"]
};
const ringCounts = [];
Object.keys(EXPECTED).forEach(function (name) {
  const layer = layers[name];
  check("the atlas ships the " + name + " layer", !!(layer && layer.features && layer.features.length),
    layer ? layer.features.length + " features" : "missing");
  if (!layer || !layer.features) { return; }
  const wrong = layer.features.filter(function (f) { return EXPECTED[name].indexOf(f.t) === -1; });
  check(name + " holds the right kind of shape", wrong.length === 0,
    wrong.slice(0, 2).map(function (f) { return f.t; }).join(", "));
  let points = 0;
  layer.features.forEach(function (f) {
    points += (JSON.stringify(f.c).match(/\[/g) || []).length;
    if (EXPECTED[name].indexOf("Polygon") !== -1) {
      /* a Polygon is a list of rings; a MultiPolygon a list of those */
      const polys = f.t === "Polygon" ? [f.c] : f.c;
      polys.forEach(function (poly) {
        (poly || []).forEach(function (ring) { ringCounts.push(ring.length); });
      });
    }
  });
  check(name + " carries coordinates", points > 0, String(points));
});
check("the coastlines are polygons with area",
  ringCounts.length > 50 && ringCounts.every(function (n) { return n >= 4; }),
  ringCounts.length + " rings, shortest " + Math.min.apply(null, ringCounts));
check("the cities carry names to label them",
  (layers["cities-region"].features || []).every(function (f) { return f.n && f.n.length > 1; }),
  (layers["cities-region"].features || []).filter(function (f) { return !f.n; }).length + " unnamed");
notes.push(ringCounts.length + " land rings, " + Object.keys(EXPECTED).length + " layers");

/* The journeys: every stop has to be a place that exists, or the line would run
   through nothing, and each route has to say what it is — a reading of the
   narrative, not a surveyed path. */
const routeFile = load("data/atlas/routes.json");
const routeList = routeFile.routes || [];
const byPlaceName = {};
atlas.places.forEach(function (p) { byPlaceName[p.name] = p; });
check("the atlas ships journeys to follow", routeList.length >= 4,
  routeList.length + " routes");
check("every journey has stages", routeList.every(function (r) { return r.stops.length >= 3; }),
  routeList.map(function (r) { return r.stops.length; }).join(", "));
check("every stage is a place in the data", routeList.every(function (r) {
  return r.stops.every(function (st) { return !!byPlaceName[st.name]; });
}), routeList.map(function (r) {
  return r.stops.filter(function (st) { return !byPlaceName[st.name]; })
    .map(function (st) { return st.name; }).join("/");
}).filter(Boolean).join(", ") || "none missing");
check("every journey says it is a reading rather than a road",
  routeList.every(function (r) { return r.note && r.note.length > 30; }) &&
  /reading of the narrative/.test(routeFile.note || ""));

/* The interactivity the page offers, which is the point of it. */
check("clicking the map asks what is near the point",
  /function nearHere/.test(app) && /km\(/.test(app));
check("a chapter can be chosen and the other places dim",
  /function matchesFilter/.test(app) && /dim/.test(app) && /filter\.chapter/.test(app));
check("a journey can be drawn and followed",
  /route-line/.test(app) && /route-stops|route-stop/.test(app));
check("labels are placed so that they never overlap",
  /function makePlacer/.test(app));
check("the view can be linked to", /ST\.qs\("route"\)/.test(app) && /ST\.qs\("place"\)/.test(app));

/* The geometry itself, tested by asking it questions with known answers: Cairo is
   on land, and a point in the middle of the Mediterranean is not. This is what a
   clipped or mis-assembled coastline fails, and it is cheaper than looking. */
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) { inside = !inside; }
  }
  return inside;
}
function inLayer(name, lon, lat) {
  const layer = layers[name];
  return (layer.features || []).some(function (f) {
    const polys = f.t === "Polygon" ? [f.c] : f.c;
    return (polys || []).some(function (poly) {
      return (poly || []).some(function (ring) { return inRing(lon, lat, ring); });
    });
  });
}
check("the coastline has Cairo on it", inLayer("land-region", 31.24, 30.05));
check("and Jerusalem", inLayer("land-region", 35.23, 31.78));
check("and does not have the middle of the Mediterranean on it",
  !inLayer("land-region", 30, 34.5));
check("the rivers reach the sea, at least at one end",
  (layers["rivers-region"].features || []).some(function (f) {
    const lines = f.t === "LineString" ? [f.c] : f.c;
    return lines.some(function (line) {
      return line.length > 20;
    });
  }));

/* And the projection the page uses: Cairo has to land inside the box for the
   Bible-lands view. The first version of this put the whole map below the bottom
   edge, because the vertical scale was divided by the wrong span. */
const WINDOW = { lon: -12, lat: 45, width: 74 };
const boxAspect = 0.62;
function px(lon, lat) {
  const span = WINDOW.width * boxAspect;
  return [(lon - WINDOW.lon) / WINDOW.width * 1000,
          (WINDOW.lat - lat) / span * 1000 * boxAspect];
}
const cairo = px(31.24, 30.05);
const jeru = px(35.23, 31.78);
check("the projection puts the Bible lands inside the frame",
  cairo[0] > 0 && cairo[0] < 1000 && cairo[1] > 0 && cairo[1] < 1000 * boxAspect &&
  jeru[0] > cairo[0] && jeru[0] < 1000 && jeru[1] < cairo[1],
  "Cairo at " + cairo.map(function (n) { return Math.round(n); }) + ", Jerusalem at " +
  jeru.map(function (n) { return Math.round(n); }));
check("and the page uses that same projection",
  /span = view\.width \* aspect/.test(app) &&
  /\(view\.lat - lat\) \/ span \* 1000 \* aspect/.test(app));

/* The page the data is for. */
const page = fs.readFileSync(path.join(ROOT, "apps", "atlas", "index.html"), "utf8");
check("the atlas is a page that loads the map data",
  /data\/atlas\/places\.json/.test(app) && /data\/atlas\/layers\.json/.test(app));
check("it draws a graticule and a scale, so a reader can place themselves",
  /graticule/.test(app) && /km across/.test(app));
check("it says the borders are today's rather than any period's",
  /borders are today's|not of any biblical period/i.test(page) &&
  /borders are today's/.test(app));
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
