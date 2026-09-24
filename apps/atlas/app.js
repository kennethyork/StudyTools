/* The atlas: places, verses, and a map drawn from public-domain data.

   No tiles and no tile server: the ground is Natural Earth's shaded-relief raster
   shipped with the site as a JPEG, the coastlines, rivers and borders are Natural
   Earth GeoJSON, the places are OpenBible.info's representative points, and the
   whole thing is a plain equirectangular plot in one SVG. Pan by dragging, zoom
   with the buttons or the wheel, click a place for its verses. */
(function () {
  "use strict";

  var root = ST.siteRoot();
  var NS = "http://www.w3.org/2000/svg";
  var svg = document.getElementById("map");
  var side = document.getElementById("side");
  var hint = document.getElementById("hint");
  var find = document.getElementById("find");
  var els = {
    borders: document.getElementById("borders"),
    route: document.getElementById("route"),
    findBook: document.getElementById("find-book"),
    findChapter: document.getElementById("find-chapter")
  };

  /* The Bible lands: the ground this atlas is for, and what the "Bible lands"
     button frames — Egypt and the Nile, Canaan, Phoenicia, Syria, Anatolia,
     Mesopotamia and Persia, from Malta to Susa. The places run 14°E to 48°E and
     23°N to 41°N (first to ninety-ninth percentile), so this holds them with room
     to spare; the old window was 74° wide and left two-thirds of the panel empty
     desert and ocean. */
  var BIBLE_LANDS = { lon0: 12, lon1: 52, lat0: 14, lat1: 44 };
  var WORLD = { lon: -180, lat: 84, width: 360 };
  /* the window of the world on screen: lon/lat of the left/top corner, and how
     many degrees wide. fitBox() sets it before the first draw. */
  var view = { lon: BIBLE_LANDS.lon0, lat: BIBLE_LANDS.lat1, width: 40 };
  var layers = null, places = [], routes = [], chosen = null, route = null;
  /* The basemap, and the box in degrees the builder cropped it to: the two have to
     agree to the degree, or the ground lands beside the places. */
  var RELIEF = { file: "data/atlas/relief.jpg", lon0: -2, lon1: 66, lat0: -2, lat1: 60 };
  /* Natural Earth's 1:50m raster is about 30 pixels to the degree. Past that it is
     being stretched, and it is faded rather than switched off: a soft ground behind
     sharp coastlines and rivers reads better than a white plain with no ground. */
  var RELIEF_PX_PER_DEGREE = 30;
  var RELIEF_MIN_OPACITY = 0.3;

  /* The map's name sizes, in the map's own units, and the same numbers as the
     stylesheet: the collision boxes below are measured with them, and
     check-atlas.js compares the two sets. They are units, not pixels — the panel
     draws 1000 units across it, so 13 units is about 9 pixels on a 700-pixel map
     and the 7 this used to be was under 5, which nobody can read. */
  var LABEL_SIZE = { "place-label": 13, "sea-label": 14, "city-label": 12,
    "route-num": 11, "grat-label": 12, "scale-label": 12 };

  /* everything the map draws, in one group, so that a drag can move it as a picture
     and the map itself is redrawn once, when the pointer is let go */
  var scene = null;
  var reliefOk = true;          /* false if the basemap will not load */
  var bordersOn = false;        /* today's borders, off by default */
  var filter = { slug: "", chapter: "" };
  var aspect = 0.62;          /* height / width of the plot, changed on resize */

  function el(name, attrs) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  /* lon/lat to the viewBox's own units. The plot is 1000 wide and 1000 * aspect
     tall, so the vertical scale is the same span of degrees as the horizontal one:
     getting that wrong — dividing by the span and drawing as if it were the width —
     put the whole map below the bottom edge and left a sliver of coast on screen. */
  function px(lon, lat) {
    var span = view.width * aspect;
    return [(lon - view.lon) / view.width * 1000, (view.lat - lat) / span * 1000 * aspect];
  }

  /* The window that frames a box of the world in the panel as the panel is now:
     the box with a little room, widened when the panel is wider than the box. The
     panel's shape decides the vertical span, exactly as the projection assumes. */
  function fitBox(box) {
    var pad = 1.04;
    var w = (box.lon1 - box.lon0) * pad;
    var h = (box.lat1 - box.lat0) * pad;
    if (w < h / aspect) { w = h / aspect; }
    return { lon: (box.lon0 + box.lon1) / 2 - w / 2,
             lat: (box.lat0 + box.lat1) / 2 + w * aspect / 2,
             width: w };
  }

  /* put a point in the middle of the panel, at a given width in degrees */
  function centreOn(lon, lat, width) {
    view = { lon: lon - width / 2, lat: lat + width * aspect / 2, width: width };
  }

  /* Cities named at every zoom: the ones a reader of the Bible places himself by. */
  var ALWAYS = ["Jerusalem", "Damascus", "Baghdad", "Cairo", "Istanbul", "Amman", "Beirut",
    "Tehran", "Ankara", "Athens", "Alexandria", "Riyadh", "Mosul", "Sanaa", "Mecca",
    "Medina", "Gaziantep", "Adana", "Tabriz", "Isfahan"];

  /* The names a reader orients by that no dataset carries: seas, rivers and the
     regions of the Bible's own geography. Chosen here, positions approximate. */
  var NAMES = [
    ["Mediterranean Sea", 24, 34.5, 11], ["Black Sea", 34, 43, 8], ["Caspian Sea", 51, 42, 8],
    ["Red Sea", 37.5, 21, 9], ["Persian Gulf", 51, 27, 8], ["Gulf of Aden", 47, 12.5, 7],
    ["Dead Sea", 35.5, 31.5, 6], ["Sea of Galilee", 35.6, 32.8, 6], ["Lake Van", 43, 38.6, 6],
    ["Nile", 31.5, 25, 7], ["Euphrates", 42, 35, 7], ["Tigris", 43.5, 34, 7], ["Jordan", 35.6, 32, 6],
    ["Sinai", 33.8, 29, 7], ["Negev", 34.8, 30.6, 7], ["Judea", 35.1, 31.6, 6],
    ["Samaria", 35.2, 32.2, 6], ["Galilee", 35.4, 32.9, 6], ["Gilead", 35.8, 32.2, 6],
    ["Moab", 35.8, 31.4, 6], ["Edom", 35.4, 30.3, 6], ["Philistia", 34.5, 31.6, 6],
    ["Phoenicia", 35.3, 33.6, 6], ["Cyprus", 33.2, 35, 6], ["Crete", 24.9, 35.2, 6],
    ["Anatolia", 32, 39, 8], ["Mesopotamia", 43, 32, 8], ["Arabia", 45, 21, 9],
    ["Egypt", 30, 27, 8], ["Armenia", 44, 40, 7]
  ];

  /* The builder stores a Polygon as its list of rings and a MultiPolygon as a list
     of those, so this returns rings and nothing else: handing a list of rings to
     the path builder drew the land as fragments. */
  function ringsOf(feature) {
    var t = feature.t, c = feature.c;
    if (t === "Polygon") { return c; }
    if (t === "MultiPolygon") {
      var out = [];
      (c || []).forEach(function (poly) {
        (poly || []).forEach(function (ring) { out.push(ring); });
      });
      return out;
    }
    return [];
  }

  function pathOf(ring, close) {
    var d = ring.map(function (pt, i) {
      var p = px(pt[0], pt[1]);
      return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
    }).join(" ");
    return d + (close ? " Z" : "");
  }

  function linesOf(feature) {
    var t = feature.t, c = feature.c;
    if (t === "LineString") { return [c]; }
    if (t === "MultiLineString") { return c; }
    return [];
  }

  function draw() {
    if (!layers) { return; }
    var box = svg.getBoundingClientRect();
    aspect = box.width ? Math.max(0.35, Math.min(1.4, box.height / box.width)) : aspect;
    svg.setAttribute("viewBox", "0 0 1000 " + Math.round(1000 * aspect));
    svg.innerHTML = "";

    var world = view.width > 120;
    /* The basemap: the raster relief wherever the crop reaches, faded as it is
       stretched past its own resolution, drawn over the vector coastline and under
       the rivers. */
    var pxPerDegree = box.width ? box.width / view.width : 0;
    var showRelief = !world && reliefOk &&
      view.lon < RELIEF.lon1 && view.lon + view.width > RELIEF.lon0 &&
      view.lat > RELIEF.lat0 && view.lat - view.width * aspect < RELIEF.lat1;
    var stretch = pxPerDegree / RELIEF_PX_PER_DEGREE;   /* 1 is the raster's own size */
    var reliefOpacity = stretch <= 1.5 ? 1 :
      Math.max(RELIEF_MIN_OPACITY, 1 - (stretch - 1.5) / 5 * (1 - RELIEF_MIN_OPACITY));
    var land = layers[world ? "land-world" : "land-region"] || { features: [] };
    var lakes = layers[world ? "lakes-world" : "lakes-region"] || { features: [] };
    var rivers = layers[world ? "rivers-region" : "rivers-region"] || { features: [] };
    var borders = layers["borders-region"] || { features: [] };
    var cities = layers["cities-region"] || { features: [] };

    svg.appendChild(el("rect", { x: 0, y: 0, width: 1000, height: Math.round(1000 * aspect),
      class: "sea" }));
    scene = el("g", { class: "scene" });
    svg.appendChild(scene);

    /* the graticule: every degree when close, thirty when the whole world is on
       screen, with the degrees written on it, because a map with no scale of any
       kind is a picture of a coastline. Ten degrees to the world left a wall of
       numbers down the side of it. */
    var step = view.width < 6 ? 1 : (view.width < 20 ? 2 : (view.width < 45 ? 5 :
      (view.width < 120 ? 10 : 30)));
    var g = el("g", { class: "graticule" });
    for (var lon = Math.ceil(view.lon / step) * step; lon <= view.lon + view.width; lon += step) {
      var a = px(lon, view.lat + 1), b = px(lon, view.lat - view.width * aspect - 1);
      g.appendChild(el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
      var t = el("text", { x: a[0] + 2, y: 9, class: "grat-label" });
      t.textContent = Math.abs(lon) + "\u00b0" + (lon < 0 ? "W" : "E");
      g.appendChild(t);
    }
    for (var lat = Math.ceil((view.lat - view.width * aspect) / step) * step;
         lat <= view.lat; lat += step) {
      var c1 = px(view.lon, lat), c2 = px(view.lon + view.width, lat);
      g.appendChild(el("line", { x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1] }));
      var t2 = el("text", { x: 2, y: c1[1] - 2, class: "grat-label" });
      t2.textContent = Math.abs(lat) + "\u00b0" + (lat < 0 ? "S" : "N");
      g.appendChild(t2);
    }
    scene.appendChild(g);

    /* the coastline and the lakes go under the basemap: hidden where the raster is
       opaque, and there — crisp — where it is faded, off the edge of the crop, or
       failed to load, so no view is a blue rectangle. */
    land.features.forEach(function (f) {
      ringsOf(f).forEach(function (ring) {
        scene.appendChild(el("path", { class: "land", d: pathOf(ring, true) }));
      });
    });
    lakes.features.forEach(function (f) {
      ringsOf(f).forEach(function (ring) {
        scene.appendChild(el("path", { class: "lake", d: pathOf(ring, true) }));
      });
    });
    if (showRelief) {
      var tl = px(RELIEF.lon0, RELIEF.lat1);
      var br = px(RELIEF.lon1, RELIEF.lat0);
      var image = el("image", { class: "relief", x: tl[0], y: tl[1], width: br[0] - tl[0],
        height: br[1] - tl[1], preserveAspectRatio: "none", opacity: reliefOpacity,
        href: root + RELIEF.file });
      image.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", root + RELIEF.file);
      image.addEventListener("error", function () { reliefOk = false; draw(); });
      scene.appendChild(image);
    }
    /* the rivers are drawn whatever the borders are set to: they are geography,
       and the legend has always promised them. */
    if (!world) {
      rivers.features.forEach(function (f) {
        linesOf(f).forEach(function (line) {
          scene.appendChild(el("path", { class: "river", d: pathOf(line, false) }));
        });
      });
    }
    if (!world && bordersOn) {
      borders.features.forEach(function (f) {
        linesOf(f).forEach(function (line) {
          scene.appendChild(el("path", { class: "border", d: pathOf(line, false) }));
        });
      });
    }

    /* Modern cities, for a reader who knows where Cairo and Baghdad are. The size a
       city has to be grows with the view, and a few are named whatever the zoom,
       because they are the ones a reader of the Bible orients by. The marks are
       drawn here; the names wait for the label pass with every other name, or the
       same city is named twice — once past the collision placer, once through it. */
    var namedCities = [];
    if (!world) {
      cities.features.forEach(function (f) {
        var p = px(f.c[0], f.c[1]);
        if (p[0] < 0 || p[0] > 1000 || p[1] < 0 || p[1] > 1000 * aspect) { return; }
        var wanted = ALWAYS.indexOf(f.n) !== -1 ||
          (view.width <= 12 ? true : (f.p || 0) >= (view.width <= 30 ? 1000000 :
            (view.width <= 60 ? 3000000 : 6000000)));
        if (!wanted) { return; }
        scene.appendChild(el("circle", { class: "city", cx: p[0], cy: p[1], r: 2.2 }));
        namedCities.push({ x: p[0], y: p[1], name: f.n });
      });
    }

    /* The names of seas and regions, which no dataset here carries, are placed
       below with everything else that is a name. They used to be drawn twice — once
       here, past the collision placer, and once there — so every sea was drawn
       twice, at two heights, because the two passes measured y differently. */

    /* a journey, drawn stop to stop: the text gives stages, not a surveyed path */
    if (route) {
      var line = route.stops.map(function (stop) { return px(stop.lon, stop.lat); });
      scene.appendChild(el("path", { class: "route-line",
        d: line.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ") }));
      route.stops.forEach(function (stop, i) {
        var p = px(stop.lon, stop.lat);
        scene.appendChild(el("circle", { class: "route-stop", cx: p[0], cy: p[1], r: 3.4 }));
        var n = el("text", { class: "route-num", x: p[0] - 2, y: p[1] + 2.4 });
        n.textContent = String(i + 1);
        scene.appendChild(n);
      });
    }

    var drawn = 0;
    places.forEach(function (place) {
      if (place.lon < view.lon - 1 || place.lon > view.lon + view.width + 1) { return; }
      if (place.lat > view.lat + 1 || place.lat < view.lat - view.width * aspect - 1) { return; }
      var p = px(place.lon, place.lat);
      /* A dot the size of how often the place is named. A thousand dots all of one
         size is a smear with no way to find Jerusalem in it; this is the convention
         of the printed maps, where the city is a bigger mark than the village. */
      var base = view.width < 20 ? 3 : (view.width < 60 ? 2.2 : 1.7);
      var r = base * (0.72 + 0.68 * Math.min(1, Math.log(1 + (place.verses_total || 0)) /
        Math.log(60)));
      var hit = matchesFilter(place);
      var circle = el("circle", { class: "place" + (place.water ? " water" : "") +
        (chosen && chosen.name === place.name ? " on" : "") +
        ((filter.slug || filter.chapter) ? (hit ? " hit" : " dim") : ""),
        cx: p[0], cy: p[1], r: hit && (filter.slug || filter.chapter) ? r * 1.6 : r });
      circle.setAttribute("data-name", place.name);
      var title = el("title");
      title.textContent = place.name + " \u2014 " +
        ((place.verses_total || 0) ? place.verses_total + " verses" : "no verses attached");
      circle.appendChild(title);
      scene.appendChild(circle);
      drawn++;
    });

    /* The names, placed last and never overlapping. The seas and regions go first:
       they are the frame the reader hangs the places on, and a name that is worth
       printing at every zoom should not be crowded out by a village. */
    var labelPlacer = makePlacer();
    var cityPlacer = makePlacer();
    var regionNames = {};      /* the regions the map has already named itself */
    var printed = {};          /* the names already on the map, whoever put them there */
    if (view.width < 90) {
      NAMES.forEach(function (row) {
        /* a name has a size class, and it is drawn while the view is not too much
           wider than that: at the Bible-lands view the seas and regions are named,
           and at world scale only the largest are */
        if (view.width > row[3] * 10 || view.width < row[3] / 3) { return; }
        var at = px(row[1], row[2]);
        if (at[0] < 0 || at[0] > 1000 || at[1] < 0 || at[1] > 1000 * aspect) { return; }
        if (labelPlacer(at[0], at[1], row[0], "sea-label", "middle")) {
          regionNames[row[0].toLowerCase()] = true;
          printed[row[0].toLowerCase()] = true;
        }
      });
    }
    var named = places.slice().sort(function (a, b) {
      return (b.verses_total || 0) - (a.verses_total || 0);
    });
    var shown = 0;
    /* a journey is the subject of the map when one is chosen, so its stops are
       named before the crowd of ordinary places takes the room */
    if (route) {
      route.stops.forEach(function (stop) {
        if (stop.lon < view.lon || stop.lon > view.lon + view.width) { return; }
        if (stop.lat > view.lat || stop.lat < view.lat - view.width * aspect) { return; }
        var at = px(stop.lon, stop.lat);
        if (labelPlacer(at[0] + 5, at[1] - 4, stop.name, "place-label")) { shown++; }
      });
    }
    named.forEach(function (place) {
      if (view.width > 30 || shown > 40) { return; }
      if (regionNames[place.name.toLowerCase()]) { return; }
      if (place.lon < view.lon || place.lon > view.lon + view.width) { return; }
      if (place.lat > view.lat || place.lat < view.lat - view.width * aspect) { return; }
      var p = px(place.lon, place.lat);
      if (labelPlacer(p[0] + 5, p[1] - 4, place.name, "place-label")) {
        shown++;
        printed[place.name.toLowerCase()] = true;
      }
    });
    /* Jerusalem and Gaza are in both datasets — the place the Bible names and the
       city that stands there now — so a modern city whose name is already on the
       map does not get a second label beside the first */
    namedCities.forEach(function (c) {
      if (printed[c.name.toLowerCase()]) { return; }
      cityPlacer(c.x + 4, c.y + 3.5, c.name, "city-label");
    });
    /* a north arrow, because a map has one */
    var nx = 1000 - 26, ny = 22;
    svg.appendChild(el("path", { class: "north", d: "M" + nx + " " + (ny - 10) + " l5 14 l-5 -4 l-5 4 Z" }));
    var north = el("text", { x: nx, y: ny + 20, class: "north-label", "text-anchor": "middle" });
    north.textContent = "N";
    svg.appendChild(north);

    /* And a scale bar, drawn on the map in kilometres with a round number on it:
       "about 4,372 km across" says how wide the panel is, and what a reader wants
       to know is how far it is from Jerusalem to Babylon. Not the world view, where
       one scale bar cannot be right for the whole map. */
    if (!world) {
      var midLat = view.lat - view.width * aspect / 2;
      var kmPerDegree = 111.32 * Math.cos(midLat * Math.PI / 180);
      var want = view.width * kmPerDegree / 4;
      var barKm = 1;
      [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].forEach(function (n) {
        if (n <= want) { barKm = n; }
      });
      var barW = Math.max(24, barKm / kmPerDegree / view.width * 1000);
      var by = 1000 * aspect - 16;
      var bar = el("g", { class: "scalebar" });
      bar.appendChild(el("line", { class: "scale-line", x1: 16, y1: by, x2: 16 + barW, y2: by }));
      bar.appendChild(el("line", { class: "scale-line", x1: 16, y1: by - 5, x2: 16, y2: by + 5 }));
      bar.appendChild(el("line", { class: "scale-line", x1: 16 + barW, y1: by - 5, x2: 16 + barW, y2: by + 5 }));
      var bl = el("text", { class: "scale-label", x: 16, y: by - 8 });
      bl.textContent = barKm.toLocaleString() + " km";
      bar.appendChild(bl);
      svg.appendChild(bar);
    }

    /* a scale: the width of the plot in kilometres at this latitude */
    var kmPerDegree = 111.32;
    var midLat = view.lat - view.width * aspect / 2;
    var km = view.width * kmPerDegree * Math.cos(midLat * Math.PI / 180);
    hint.textContent = drawn + " of " + places.length + " places in view \u00b7 about " +
      Math.round(km).toLocaleString() + " km across, " + step + "\u00b0 of grid \u00b7 drag to move, " +
      "wheel, buttons or arrow keys. The ground, coasts, rivers and borders are Natural Earth " +
      "(public domain)" + (showRelief ? "; the ground is the terrain as it is now" +
      (reliefOpacity < 1 ? ", faded because the raster itself resolves about " +
        RELIEF_PX_PER_DEGREE + " pixels to the degree" : "") +
      ", and the borders of any period are not drawn" :
      (world ? "; at world scale the ground is drawn as a plain coastline" :
      "; the ground will not load, so this is the plain coastline")) + ".";
  }

  /* Labels are placed after everything else and never on top of one another: at a
     close zoom there are more names than room, and overlapping text is worse than
     a name left out. The most significant places are offered first. */
  function makePlacer() {
    var used = [];
    return function (x, y, text, className, anchor) {
      /* the room a name takes, measured with the size the stylesheet gives it: an
         average glyph is a little over half the font size, and the box has to be
         right or the map is either a pile of overlapping names or mostly empty */
      var size = LABEL_SIZE[className] || 12;
      var w = text.length * size * 0.56 + 4;
      var h = size;
      var box = [x - (anchor === "middle" ? w / 2 : 0), y - h, w, h * 1.15];
      for (var i = 0; i < used.length; i++) {
        var u = used[i];
        if (box[0] < u[0] + u[2] && box[0] + box[2] > u[0] &&
            box[1] < u[1] + u[3] && box[1] + box[3] > u[1]) {
          return false;
        }
      }
      used.push(box);
      var t = el("text", { x: x, y: y, class: className });
      if (anchor) { t.setAttribute("text-anchor", anchor); }
      t.textContent = text;
      if (scene) { scene.appendChild(t); }
      return true;
    };
  }

  function matchesFilter(place) {
    if (!filter.slug && !filter.chapter) { return true; }
    return (place.verses || []).some(function (v) {
      if (filter.slug && v[0] !== filter.slug) { return false; }
      return !filter.chapter || String(v[1]) === String(filter.chapter);
    });
  }

  /* kilometres between two points, for "what is near here" */
  function km(aLon, aLat, bLon, bLat) {
    var rad = Math.PI / 180;
    var dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function nearHere(lon, lat, box) {
    var found = [];
    places.forEach(function (place) {
      var d = km(lon, lat, place.lon, place.lat);
      if (d <= view.width * 1.4) { found.push({ place: place, km: Math.round(d) }); }
    });
    found.sort(function (a, b) { return a.km - b.km; });
    side.innerHTML = "";
    var card = ST.el("div", { class: "card place-card" }, [
      ST.el("h2", { class: "serif", text: "Near " + Math.abs(lon).toFixed(2) + "\u00b0" +
        (lon < 0 ? "W" : "E") + ", " + Math.abs(lat).toFixed(2) + "\u00b0" + (lat < 0 ? "S" : "N") }),
      ST.el("p", { class: "meta", text: found.length
        ? "the " + Math.min(found.length, 12) + " nearest of " + found.length + " places within " +
          Math.round(view.width * 1.4) + " km"
        : "no place in the dataset within " + Math.round(view.width * 1.4) + " km" })
    ]);
    var list = ST.el("div", { class: "place-verses" });
    found.slice(0, 12).forEach(function (item) {
      var a = ST.el("a", { href: "#", text: item.place.name + " \u00b7 " + item.km + " km \u00b7 " +
        (item.place.verses_total || 0) + " v" });
      a.addEventListener("click", function (e) { e.preventDefault(); show(item.place); });
      list.appendChild(a);
    });
    card.appendChild(list);
    side.appendChild(card);
  }

  function show(place) {
    chosen = place;
    side.innerHTML = "";
    var card = ST.el("div", { class: "card place-card" }, [
      ST.el("h2", { class: "serif", text: place.name }),
      ST.el("p", { class: "meta", text: [place.label !== place.name ? place.label : "",
        (place.types || []).join(", "), place.water ? "water" : "land",
        (place.verses_total || 0) + (place.verses_total === 1 ? " verse" : " verses") +
          ((place.verses_total || 0) > (place.verses || []).length ?
            ", first " + place.verses.length + " shown" : "")]
        .filter(Boolean).join(" \u00b7 ") })
    ]);
    if (!(place.verses || []).length) {
      card.appendChild(ST.el("p", { class: "muted small", style: "margin:0",
        text: "No verse is attached to this place in the dataset \u2014 it is mapped, not named." }));
      side.appendChild(card);
      draw();
      return;
    }
    var links = ST.el("div", { class: "place-verses" });
    place.verses.slice(0, 60).forEach(function (v) {
      var ref = labelOf(v[0], v[1], v[2]);
      links.appendChild(ST.el("a", { href: root + "apps/bible/?ref=" + encodeURIComponent(ref), text: ref }));
    });
    card.appendChild(links);
    if (place.verses.length > 60) {
      card.appendChild(ST.el("p", { class: "muted small", style: "margin:8px 0 0",
        text: "Showing the first 60 of " + place.verses_total + "." }));
    }
    side.appendChild(card);
    draw();
  }

  function showByName(name) {
    var hit = places.filter(function (p) { return p.name === name; })[0];
    if (hit) { show(hit); }
  }

  function labelOf(slug, chapter, verse) {
    var book = books.filter(function (b) { return b.slug === slug; })[0];
    return (book ? book.name : slug) + " " + chapter + ":" + verse;
  }

  function go(win) { view = { lon: win.lon, lat: win.lat, width: win.width }; draw(); }

  function lands() { go(fitBox(BIBLE_LANDS)); }

  /* Zoom about the middle of the panel. Changing the width alone holds the corner
     still, which slid the place you were looking at out of the frame — "zoom in"
     twice and the map was open sea. */
  function zoomBy(factor) {
    var width = Math.min(360, Math.max(1.2, view.width * factor));
    view.lon += (view.width - width) / 2;
    view.lat -= (view.width - width) * aspect / 2;
    view.width = width;
    draw();
  }

  /* frame a journey: its stops, in the middle of the panel */
  function frameRoute(journey) {
    var lons = journey.stops.map(function (s) { return s.lon; });
    var lats = journey.stops.map(function (s) { return s.lat; });
    go(fitBox({ lon0: Math.min.apply(null, lons) - 3, lon1: Math.max.apply(null, lons) + 3,
                lat0: Math.min.apply(null, lats) - 3, lat1: Math.max.apply(null, lats) + 3 }));
  }

  var books = [];

  /* Draw at most once a frame. The wheel fires a dozen events between two frames
     and each one used to rebuild three thousand nodes. */
  var frame = 0;
  function scheduleDraw() {
    if (frame) { return; }
    frame = requestAnimationFrame(function () { frame = 0; draw(); });
  }

  /* Panning moves the drawn map as a picture — one transform on the group — and
     redraws it once, when the pointer is let go. Redrawing on every pointermove
     rebuilt the whole map, dots and names and all, faster than the screen could
     show it; a drag is the one interaction where that is felt. */
  var dragging = null;
  function letGo() {
    if (dragging && (dragging.dx || dragging.dy)) {
      var box = svg.getBoundingClientRect();
      var perPixel = view.width / Math.max(1, box.width);
      view.lon = dragging.view.lon - dragging.dx * perPixel;
      view.lat = dragging.view.lat + dragging.dy * perPixel * aspect;
      dragging = null;
      draw();
    } else {
      dragging = null;
    }
    svg.classList.remove("dragging");
  }
  svg.addEventListener("pointerdown", function (e) {
    /* a frame the wheel left pending would redraw the map mid-drag, from a view the
       drag has not committed yet, and the picture would jump */
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    dragging = { x: e.clientX, y: e.clientY, dx: 0, dy: 0,
      view: { lon: view.lon, lat: view.lat } };
    svg.classList.add("dragging");
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", function (e) {
    if (!dragging) { return; }
    var box = svg.getBoundingClientRect();
    if (!box.width) { return; }
    dragging.dx = e.clientX - dragging.x;
    dragging.dy = e.clientY - dragging.y;
    if (scene) {
      var unit = 1000 / box.width;      /* user units to a pixel, both ways */
      scene.setAttribute("transform", "translate(" + (dragging.dx * unit).toFixed(2) + " " +
        (dragging.dy * unit).toFixed(2) + ")");
    }
  });
  svg.addEventListener("pointerup", letGo);
  svg.addEventListener("pointercancel", letGo);
  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    var factor = e.deltaY > 0 ? 1.15 : 0.87;
    var box = svg.getBoundingClientRect();
    var at = [(e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height];
    var width = Math.min(360, Math.max(1.2, view.width * factor));
    view.lon += (view.width - width) * at[0];
    view.lat -= (view.width - width) * at[1] * aspect;
    view.width = width;
    scheduleDraw();
  }, { passive: false });

  /* The keyboard, because a map you cannot nudge is a map you cannot use without a
     mouse: arrows move it, + and - zoom about the middle, 0 comes back to the
     Bible lands. */
  svg.addEventListener("keydown", function (e) {
    var step = view.width * 0.12;
    var key = e.key;
    if (key === "ArrowLeft") { view.lon -= step; }
    else if (key === "ArrowRight") { view.lon += step; }
    else if (key === "ArrowUp") { view.lat += step * aspect; }
    else if (key === "ArrowDown") { view.lat -= step * aspect; }
    else if (key === "+" || key === "=") { e.preventDefault(); zoomBy(0.7); return; }
    else if (key === "-" || key === "_") { e.preventDefault(); zoomBy(1 / 0.7); return; }
    else if (key === "0") { e.preventDefault(); lands(); return; }
    else { return; }
    e.preventDefault();
    draw();
  });

  document.getElementById("lands").addEventListener("click", lands);
  document.getElementById("world").addEventListener("click", function () { go(WORLD); });
  document.getElementById("zoom-in").addEventListener("click", function () { zoomBy(0.7); });
  document.getElementById("zoom-out").addEventListener("click", function () { zoomBy(1 / 0.7); });

  els.borders.addEventListener("change", function () {
    bordersOn = els.borders.checked;
    draw();
  });

  els.route.addEventListener("change", function () {
    route = null;
    routes.forEach(function (r) { if (r.name === els.route.value) { route = r; } });
    if (route && route.stops.length) {
      frameRoute(route);
      side.innerHTML = "";
      side.appendChild(ST.el("div", { class: "card place-card" }, [
        ST.el("h2", { class: "serif", text: route.name }),
        ST.el("p", { class: "meta", text: route.stops.length + " stops" }),
        ST.el("p", { class: "muted small", style: "margin:0", text: route.note })
      ]));
    }
    draw();
  });

  els.findBook.addEventListener("change", function () {
    filter.slug = els.findBook.value;
    fillChaptersFor();
    draw();
  });
  els.findChapter.addEventListener("change", function () {
    filter.chapter = els.findChapter.value;
    draw();
  });

  function fillChaptersFor() {
    var book = books.filter(function (b) { return b.slug === filter.slug; })[0];
    els.findChapter.innerHTML = "";
    var any = document.createElement("option");
    any.value = "";
    any.textContent = "any";
    els.findChapter.appendChild(any);
    if (!book) { return; }
    for (var c = 1; c <= book.chapters; c++) {
      var o = document.createElement("option");
      o.value = String(c);
      o.textContent = c;
      els.findChapter.appendChild(o);
    }
    filter.chapter = "";
  }

  function fillRoutes() {
    routes.forEach(function (r) {
      var o = document.createElement("option");
      o.value = r.name;
      o.textContent = r.name;
      els.route.appendChild(o);
    });
    books.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b.slug;
      o.textContent = b.name;
      els.findBook.appendChild(o);
    });
  }

  find.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") { return; }
    var want = find.value.trim().toLowerCase();
    if (!want) { return; }
    var hit = places.filter(function (p) { return p.name.toLowerCase().indexOf(want) === 0; })[0] ||
      places.filter(function (p) { return p.name.toLowerCase().indexOf(want) !== -1; })[0];
    if (!hit) {
      side.innerHTML = "";
      side.appendChild(ST.el("div", { class: "card" }, [
        ST.el("p", { style: "margin:0", text: "No place in the dataset begins \u201c" + find.value + "\u201d." }),
        ST.el("p", { class: "muted small", style: "margin:8px 0 0", text:
          "It holds " + places.length.toLocaleString() + " places with a position \u2014 try a " +
          "shorter spelling." })
      ]));
      return;
    }
    centreOn(hit.lon, hit.lat, 12);
    show(hit);
  });

  svg.addEventListener("click", function (e) {
    var name = e.target && e.target.getAttribute && e.target.getAttribute("data-name");
    if (name) {
      var place = places.filter(function (p) { return p.name === name; })[0];
      if (place) { show(place); return; }
    }
    /* empty water or empty land: what is near the point that was clicked? */
    var box = svg.getBoundingClientRect();
    if (!box.width) { return; }
    var fx = (e.clientX - box.left) / box.width;
    var fy = (e.clientY - box.top) / box.height;
    nearHere(view.lon + fx * view.width, view.lat - fy * view.width * aspect, box);
  });

  /* the panel's shape, which the projection and fitBox() both need. Kept apart from
     the draw so that the first view can be framed before anything is drawn. */
  function measure() {
    var box = svg.getBoundingClientRect();
    if (box.width) { aspect = Math.max(0.35, Math.min(1.4, box.height / box.width)); }
  }

  function fit() { measure(); draw(); }
  window.addEventListener("resize", fit);

  Promise.all([
    ST.loadJSON(root + "data/bible/books.json"),
    ST.loadJSON(root + "data/atlas/places.json"),
    ST.loadJSON(root + "data/atlas/layers.json"),
    ST.loadJSON(root + "data/atlas/routes.json")
  ]).then(function (loaded) {
    books = loaded[0] || [];
    places = (loaded[1] || {}).places || [];
    layers = loaded[2] || {};
    routes = ((loaded[3] || {}).routes) || [];
    fillRoutes();

    /* the view in the URL, so a journey or a chapter can be linked to */
    var qRoute = ST.qs("route");
    if (qRoute) {
      routes.forEach(function (r) { if (r.name.toLowerCase() === qRoute.toLowerCase()) { route = r; } });
      if (route) { els.route.value = route.name; }
    }
    var qBook = ST.qs("book");
    if (qBook) { filter.slug = qBook; els.findBook.value = qBook; fillChaptersFor(); }
    var qChapter = ST.qs("chapter");
    if (qChapter) { filter.chapter = String(qChapter); els.findChapter.value = String(qChapter); }
    var qPlace = ST.qs("place");
    if (qPlace) {
      var hit = places.filter(function (p) { return p.name.toLowerCase() === qPlace.toLowerCase(); })[0];
      if (hit) {
        centreOn(hit.lon, hit.lat, 12);
        chosen = hit;
      }
    }
    measure();
    if (route) {
      frameRoute(route);
      if (route.stops.length) { showByName(route.stops[0].name); }
    } else if (chosen) {
      show(chosen);
    } else {
      lands();
      var jerusalem = places.filter(function (p) { return p.name === "Jerusalem"; })[0];
      if (jerusalem) { show(jerusalem); }
    }
    if (filter.slug || filter.chapter) { draw(); }
  }).catch(function (err) {
    hint.textContent = "Could not load the map data: " + err.message;
  });
})();
