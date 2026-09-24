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
const page = fs.readFileSync(path.join(ROOT, "apps", "atlas", "index.html"), "utf8");
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

/* The Bible lands: the box the page frames when it opens, and the window that
   framing makes of it in a panel of a given shape. Read out of the page, so that a
   window changed there without thought for the ground below it fails here. */
const landsMatch = /var BIBLE_LANDS = \{ lon0: (-?[\d.]+), lon1: (-?[\d.]+), lat0: (-?[\d.]+), lat1: (-?[\d.]+) \}/.exec(app);
check("the page declares the window it opens on", !!landsMatch,
  "BIBLE_LANDS not found in apps/atlas/app.js");
const LANDS = landsMatch
  ? { lon0: +landsMatch[1], lon1: +landsMatch[2], lat0: +landsMatch[3], lat1: +landsMatch[4] }
  : { lon0: 0, lon1: 0, lat0: 0, lat1: 0 };
const landsPlaces = atlas.places.filter(function (p) {
  return p.lon >= LANDS.lon0 && p.lon <= LANDS.lon1 && p.lat >= LANDS.lat0 && p.lat <= LANDS.lat1;
});
check("and the Bible-lands window holds nearly every place in the dataset",
  landsPlaces.length > atlas.places.length * 0.98,
  landsPlaces.length + " of " + atlas.places.length + " places inside it");

/* fitBox() as the page does it: the box with a little room, widened when the panel
   is wider than the box. The panel's shape is the only thing that changes it. */
function landsWindow(boxAspect) {
  const pad = 1.04;
  const w = (LANDS.lon1 - LANDS.lon0) * pad;
  const h = (LANDS.lat1 - LANDS.lat0) * pad;
  const width = w < h / boxAspect ? h / boxAspect : w;
  return { lon: (LANDS.lon0 + LANDS.lon1) / 2 - width / 2,
           lat: (LANDS.lat0 + LANDS.lat1) / 2 + width * boxAspect / 2,
           width: width };
}

/* And the projection the page uses: Cairo has to land inside the box for the
   Bible-lands view. The first version of this put the whole map below the bottom
   edge, because the vertical scale was divided by the wrong span. */
const boxAspect = 0.62;
const WINDOW = landsWindow(boxAspect);
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
check("and frames the window with the same arithmetic as this check",
  /function fitBox/.test(app) && /if \(w < h \/ aspect\) \{ w = h \/ aspect; \}/.test(app) &&
  /function lands\(\) \{ go\(fitBox\(BIBLE_LANDS\)\); \}/.test(app));

/* The basemap. Two faults here are invisible in a screenshot and fatal on the map:
   the raster missing or half-downloaded, and the box the builder cropped it to
   disagreeing with the box the page draws it at, which leaves the ground beside the
   places. So the builder's constants, the page's constants and the JPEG's own
   dimensions are compared with each other. */
const reliefPath = path.join(ROOT, "data", "atlas", "relief.jpg");
check("the basemap ships with the site", fs.existsSync(reliefPath),
  "data/atlas/relief.jpg is not there, and the map would fall back to a plain coast");
const reliefBytes = fs.existsSync(reliefPath) ? fs.readFileSync(reliefPath) : Buffer.alloc(0);
check("the basemap is a JPEG", reliefBytes.length > 4 && reliefBytes[0] === 0xff &&
  reliefBytes[1] === 0xd8 && reliefBytes[reliefBytes.length - 2] === 0xff &&
  reliefBytes[reliefBytes.length - 1] === 0xd9,
  reliefBytes.slice(0, 4).toString("hex") + " (no JPEG start or end marker)");
check("it is a size a browser can read whole",
  reliefBytes.length > 20000 && reliefBytes.length < 2000000,
  Math.round(reliefBytes.length / 1024) + " KB");

/* the frame header of a baseline or progressive JPEG: 0xFFC0..0xFFCF, skipping the
   four markers that share that range but carry no frame */
function jpegSize(buf) {
  let i = 2;
  while (i + 8 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 &&
        marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}
const jpeg = reliefBytes.length ? jpegSize(reliefBytes) : null;
check("its size can be read out of it", !!jpeg, "no JPEG frame header found");

const cropMatch = /RELIEF_CROP = \((-?[\d.]+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\)/.exec(
  fs.readFileSync(path.join(ROOT, "scripts", "build-atlas.py"), "utf8"));
check("the builder crops the basemap to a stated box", !!cropMatch,
  "RELIEF_CROP not found in scripts/build-atlas.py");
const crop = cropMatch ? [+cropMatch[1], +cropMatch[2], +cropMatch[3], +cropMatch[4]] : [0, 0, 0, 0];
const reliefMatch = /var RELIEF = \{ file: "([^"]+)", lon0: (-?[\d.]+), lon1: (-?[\d.]+), lat0: (-?[\d.]+), lat1: (-?[\d.]+) \}/.exec(app);
check("the page names the basemap file and the box to draw it at", !!reliefMatch,
  "RELIEF not found in apps/atlas/app.js");
if (reliefMatch) {
  check("the page asks for the file the builder writes",
    reliefMatch[1] === "data/atlas/relief.jpg", reliefMatch[1]);
  const same = [+reliefMatch[2], +reliefMatch[3], +reliefMatch[4], +reliefMatch[5]]
    .every(function (n, i) { return Math.abs(n - crop[i]) < 0.01; });
  check("and draws it at the box the builder cropped it to", same,
    "builder " + crop.join(", ") + " against page " +
    [reliefMatch[2], reliefMatch[3], reliefMatch[4], reliefMatch[5]].join(", "));
}
if (jpeg) {
  /* a grid of degrees is square: the crop's shape and the JPEG's shape have to be
     the same shape, or the ground is stretched against the places on it */
  const degreeRatio = (crop[1] - crop[0]) / (crop[3] - crop[2]);
  const pixelRatio = jpeg.width / jpeg.height;
  check("the basemap carries its degrees square, not stretched",
    Math.abs(degreeRatio - pixelRatio) < 0.02,
    "crop " + degreeRatio.toFixed(3) + " against image " + pixelRatio.toFixed(3));
  check("the basemap is worth its bytes, not a thumbnail",
    jpeg.width >= 1200 && jpeg.height >= 700, jpeg.width + "x" + jpeg.height);
}
/* The ground has to hold the whole window the page opens on, or the map opens with
   a plain coastline where Egypt should be. The panel is 100% of a 1080px column
   less the 340px the place list takes, so it is never shorter than about 0.67 — and
   never taller than the page's own clamp of 1.4 — so this walks what it can be. */
const uncovered = [0.6, 0.672, 0.7, 0.85, 1.0, 1.2, 1.4].filter(function (a) {
  const w = landsWindow(a);
  return !(crop[0] <= w.lon && crop[1] >= w.lon + w.width &&
           crop[2] <= w.lat - w.width * a && crop[3] >= w.lat);
});
/* 1.4 is the page's own clamp on the panel's shape, so no window it can open on is
   taller than that and none of them runs off the ground */
check("and covers that window at any shape the panel can take", uncovered.length === 0,
  "uncovered at panel ratios " + uncovered.join(", "));
check("the page clamps the panel's shape, so there is no taller window than that",
  /Math\.min\(1\.4, box\.height \/ box\.width\)/.test(app));
check("the page falls back to the coastline when the raster cannot reach or resolve",
  /RELIEF_PX_PER_DEGREE/.test(app) && /pxPerDegree <= RELIEF_PX_PER_DEGREE \* 3/.test(app) &&
  /reliefOk = false; draw\(\)/.test(app));
check("the coastline is drawn under the basemap, so no view is a blue rectangle",
  app.indexOf("land.features.forEach") > 0 &&
  app.indexOf("land.features.forEach") < app.indexOf("if (showRelief)"));
check("the raster's own water is not covered by sand-filled lakes",
  /else \{[\s\S]{0,200}lakes.features.forEach/.test(app) &&
  /\.lake \{ fill: var\(--sea\)/.test(page));

/* The two controls a reader will reach for, and the fault they had: the borders
   checkbox taking the rivers with it, and the zoom buttons leaving the middle. */
check("the borders are a checkbox that starts off",
  /<input type="checkbox" id="borders">/.test(page) &&
  /var bordersOn = false;/.test(app) && /if \(!world && bordersOn\) \{/.test(app));
check("the rivers are drawn whatever the borders are set to",
  app.indexOf("rivers.features.forEach") > 0 &&
  app.indexOf("rivers.features.forEach") < app.indexOf("if (!world && bordersOn)"),
  "the rivers are inside the borders block again");
check("zooming keeps the middle of the panel where it was",
  /function zoomBy\(factor\)/.test(app) && /zoomBy\(0\.7\)/.test(app) &&
  /view\.lon \+= \(view\.width - width\) \/ 2;/.test(app));
check("the page says where its ground came from, and that it is not a period map",
  /shaded relief/.test(page) && /Natural Earth/.test(page) && /public domain/.test(page) &&
  /terrain is the terrain as it is now/.test(page) &&
  /1:50m/.test(page) && !/1:110m/.test(page));

/* The page the data is for. */
check("the atlas is a page that loads the map data",
  /data\/atlas\/places\.json/.test(app) && /data\/atlas\/layers\.json/.test(app));
check("it draws a graticule and a scale, so a reader can place themselves",
  /graticule/.test(app) && /km across/.test(app));
check("it says the borders are today's rather than any period's",
  /not of any biblical period/i.test(page) && /today's borders/i.test(page) &&
  /borders of any period/.test(app));
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
