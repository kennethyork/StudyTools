/* The atlas: places, verses, and a map drawn from public-domain data.

   No tiles and no tile server: the coastline is Natural Earth GeoJSON shipped with
   the site, the places are OpenBible.info's representative points, and the whole
   thing is a plain equirectangular plot in one SVG. Pan by dragging, zoom with the
   buttons or the wheel, click a place for its verses. */
(function () {
  "use strict";

  var root = ST.siteRoot();
  var NS = "http://www.w3.org/2000/svg";
  var svg = document.getElementById("map");
  var side = document.getElementById("side");
  var hint = document.getElementById("hint");
  var find = document.getElementById("find");

  /* the window of the world on screen: lon/lat of the left/top corner, and how
     many degrees wide */
  var LAND_WINDOW = { lon: -12, lat: 45, width: 74 };
  var WORLD = { lon: -180, lat: 84, width: 360 };
  var view = { lon: LAND_WINDOW.lon, lat: LAND_WINDOW.lat, width: LAND_WINDOW.width };
  var layers = null, places = [], chosen = null;
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

  function project(lon, lat, box) {
    box = box || svg.getBoundingClientRect();
    var width = view.width * aspect;
    return [(lon - view.lon) / view.width, (view.lat - lat) / width];
  }

  function round(n) { return Math.round(n * 1000) / 1000; }

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
    var land = layers[world ? "land-world" : "land-region"] || { features: [] };
    var lakes = layers[world ? "lakes-world" : "lakes-region"] || { features: [] };
    var rivers = layers[world ? "rivers-region" : "rivers-region"] || { features: [] };
    var borders = layers["borders-region"] || { features: [] };
    var cities = layers["cities-region"] || { features: [] };

    svg.appendChild(el("rect", { x: 0, y: 0, width: 1000, height: Math.round(1000 * aspect),
      class: "sea" }));

    /* the graticule: every degree when close, five or ten when further out, with
       the degrees written on it, because a map with no scale of any kind is a
       picture of a coastline */
    var step = view.width < 6 ? 1 : (view.width < 40 ? 5 : 10);
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
    svg.appendChild(g);

    land.features.forEach(function (f) {
      ringsOf(f).forEach(function (ring) {
        svg.appendChild(el("path", { class: "land", d: pathOf(ring, true) }));
      });
    });
    lakes.features.forEach(function (f) {
      ringsOf(f).forEach(function (ring) {
        svg.appendChild(el("path", { class: "lake", d: pathOf(ring, true) }));
      });
    });
    if (!world) {
      borders.features.forEach(function (f) {
        linesOf(f).forEach(function (line) {
          svg.appendChild(el("path", { class: "border", d: pathOf(line, false) }));
        });
      });
      rivers.features.forEach(function (f) {
        linesOf(f).forEach(function (line) {
          svg.appendChild(el("path", { class: "river", d: pathOf(line, false) }));
        });
      });
    }

    /* modern cities, for a reader who knows where Cairo and Baghdad are. The size
       a city has to be grows with the view, and a few are named whatever the zoom,
       because they are the ones a reader of the Bible orients by. */
    if (!world) {
      cities.features.forEach(function (f) {
        var p = px(f.c[0], f.c[1]);
        if (p[0] < 0 || p[0] > 1000 || p[1] < 0 || p[1] > 1000 * aspect) { return; }
        var wanted = ALWAYS.indexOf(f.n) !== -1 ||
          (view.width <= 12 ? true : (f.p || 0) >= (view.width <= 30 ? 1000000 :
            (view.width <= 60 ? 3000000 : 6000000)));
        if (!wanted) { return; }
        svg.appendChild(el("circle", { class: "city", cx: p[0], cy: p[1], r: 1.8 }));
        var t = el("text", { x: p[0] + 3, y: p[1] + 2.5, class: "city-label" });
        t.textContent = f.n;
        svg.appendChild(t);
      });
    }

    /* the names of seas and regions, which no dataset here carries */
    if (view.width < 90) {
      NAMES.forEach(function (row) {
        var px = project(row[1], row[2], box);
        if (px[0] < 0 || px[0] > 1 || px[1] < 0 || px[1] > aspect) { return; }
        /* a name has a size class, and it is drawn while the view is not too much
           wider than that: at the Bible-lands view the seas and regions are named,
           and at world scale only the largest are */
        if (view.width > row[3] * 10) { return; }
        var t = el("text", { x: px[0] * 1000, y: px[1] * 1000, class: "sea-label",
          "text-anchor": "middle" });
        t.textContent = row[0];
        svg.appendChild(t);
      });
    }

    var drawn = 0;
    places.forEach(function (place) {
      if (place.lon < view.lon - 1 || place.lon > view.lon + view.width + 1) { return; }
      if (place.lat > view.lat + 1 || place.lat < view.lat - view.width * aspect - 1) { return; }
      var p = px(place.lon, place.lat);
      var r = view.width < 20 ? 2.8 : (view.width < 60 ? 2 : 1.5);
      var circle = el("circle", { class: "place" + (place.water ? " water" : "") +
        (chosen && chosen.name === place.name ? " on" : ""),
        cx: p[0], cy: p[1], r: r });
      circle.setAttribute("data-name", place.name);
      svg.appendChild(circle);
      drawn++;
      if (view.width < 16) {
        var label = el("text", { class: "place-label", x: p[0] + 5, y: p[1] - 4 });
        label.textContent = place.name;
        svg.appendChild(label);
      }
    });

    /* a scale: the width of the plot in kilometres at this latitude */
    var kmPerDegree = 111.32;
    var midLat = view.lat - view.width * aspect / 2;
    var km = view.width * kmPerDegree * Math.cos(midLat * Math.PI / 180);
    hint.textContent = drawn + " of " + places.length + " places in view \u00b7 about " +
      Math.round(km).toLocaleString() + " km across, " + step + "\u00b0 of grid \u00b7 drag to move, " +
      "wheel or the buttons to zoom. Coastlines, rivers and borders are Natural Earth (public domain): " +
      "the borders are today's, for orientation only.";
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

  function labelOf(slug, chapter, verse) {
    var book = books.filter(function (b) { return b.slug === slug; })[0];
    return (book ? book.name : slug) + " " + chapter + ":" + verse;
  }

  function go(win) { view = { lon: win.lon, lat: win.lat, width: win.width }; draw(); }

  var books = [];

  /* pan by dragging */
  var dragging = null;
  svg.addEventListener("pointerdown", function (e) {
    dragging = { x: e.clientX, y: e.clientY, view: { lon: view.lon, lat: view.lat } };
    svg.classList.add("dragging");
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", function (e) {
    if (!dragging) { return; }
    var box = svg.getBoundingClientRect();
    var perPixel = view.width / Math.max(1, box.width);
    view.lon = dragging.view.lon - (e.clientX - dragging.x) * perPixel;
    view.lat = dragging.view.lat + (e.clientY - dragging.y) * perPixel * aspect;
    draw();
  });
  svg.addEventListener("pointerup", function () {
    dragging = null;
    svg.classList.remove("dragging");
  });
  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    var factor = e.deltaY > 0 ? 1.15 : 0.87;
    var box = svg.getBoundingClientRect();
    var at = [(e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height];
    var width = Math.min(360, Math.max(1.2, view.width * factor));
    view.lon += (view.width - width) * at[0];
    view.lat -= (view.width - width) * at[1] * aspect;
    view.width = width;
    draw();
  }, { passive: false });

  document.getElementById("lands").addEventListener("click", function () { go(LAND_WINDOW); });
  document.getElementById("world").addEventListener("click", function () { go(WORLD); });
  document.getElementById("zoom-in").addEventListener("click", function () {
    view.width = Math.max(1.2, view.width * 0.7); draw();
  });
  document.getElementById("zoom-out").addEventListener("click", function () {
    view.width = Math.min(360, view.width / 0.7); draw();
  });

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
    go({ lon: hit.lon - 6, lat: hit.lat + 6 * aspect, width: 12 });
    show(hit);
  });

  svg.addEventListener("click", function (e) {
    var name = e.target && e.target.getAttribute && e.target.getAttribute("data-name");
    if (!name) { return; }
    var place = places.filter(function (p) { return p.name === name; })[0];
    if (place) { show(place); }
  });

  function fit() {
    var box = svg.getBoundingClientRect();
    if (box.width) { aspect = Math.max(0.35, Math.min(1.4, box.height / box.width)); }
    draw();
  }
  window.addEventListener("resize", fit);

  Promise.all([
    ST.loadJSON(root + "data/bible/books.json"),
    ST.loadJSON(root + "data/atlas/places.json"),
    ST.loadJSON(root + "data/atlas/layers.json")
  ]).then(function (loaded) {
    books = loaded[0] || [];
    places = (loaded[1] || {}).places || [];
    layers = loaded[2] || {};
    fit();
    go(LAND_WINDOW);
    var jerusalem = places.filter(function (p) { return p.name === "Jerusalem"; })[0];
    if (jerusalem) { show(jerusalem); }
  }).catch(function (err) {
    hint.textContent = "Could not load the map data: " + err.message;
  });
})();
