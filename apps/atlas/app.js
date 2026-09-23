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
  var land = null, water = null, places = [], chosen = null;
  var aspect = 0.62;          /* height / width of the plot, changed on resize */

  function el(name, attrs) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    return node;
  }

  function project(lon, lat) {
    var x = (lon - view.lon) / view.width;
    var y = (view.lat - lat) / (view.width * aspect);
    return [round(x), round(y)];
  }

  function round(n) { return Math.round(n * 1000) / 1000; }

  function draw() {
    if (!land) { return; }
    svg.setAttribute("viewBox", "0 0 1000 " + Math.round(1000 * aspect));
    svg.innerHTML = "";
    svg.appendChild(el("rect", { x: 0, y: 0, width: 1000, height: Math.round(1000 * aspect),
      fill: "transparent" }));
    land.features.forEach(function (f) {
      var geom = f.geometry || {};
      if (geom.type !== "Polygon") { return; }
      geom.coordinates.forEach(function (ring) {
        var d = ring.map(function (pt, i) {
          var p = project(pt[0], pt[1]);
          return (i ? "L" : "M") + p[0] * 1000 + " " + p[1] * 1000 * aspect / aspect;
        }).join(" ");
        svg.appendChild(el("path", { class: "land", d: d }));
      });
    });
    water.forEach(function (line) {
      if (line.length < 2) { return; }
      var d = line.map(function (pt, i) {
        var p = project(pt[0], pt[1]);
        return (i ? "L" : "M") + p[0] * 1000 + " " + p[1] * 1000;
      }).join(" ");
      svg.appendChild(el("path", { class: "water-line", d: d }));
    });

    var drawn = 0;
    var width = view.width * aspect;
    places.forEach(function (place) {
      if (place.lon < view.lon - 1 || place.lon > view.lon + view.width + 1) { return; }
      if (place.lat > view.lat + 1 || place.lat < view.lat - width - 1) { return; }
      var p = project(place.lon, place.lat);
      var r = view.width < 20 ? 2.6 : (view.width < 60 ? 2 : 1.4);
      var circle = el("circle", { class: "place" + (place.water ? " water" : ""),
        cx: p[0] * 1000, cy: p[1] * 1000, r: r });
      circle.setAttribute("data-name", place.name);
      if (chosen && chosen.name === place.name) { circle.setAttribute("class", "place on" + (place.water ? " water" : "")); }
      svg.appendChild(circle);
      drawn++;
      if (view.width < 14) {
        var label = el("text", { class: "place-label", x: p[0] * 1000 + 4, y: p[1] * 1000 - 3 });
        label.textContent = place.name;
        svg.appendChild(label);
      }
    });
    hint.textContent = drawn + " of " + places.length + " places in view \u00b7 drag to move, " +
      "wheel or the buttons to zoom. The coast is Natural Earth; positions are the dataset's " +
      "representative points.";
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
    ST.loadJSON(root + "data/atlas/land.json"),
    ST.loadJSON(root + "data/atlas/water.json")
  ]).then(function (loaded) {
    books = loaded[0] || [];
    places = (loaded[1] || {}).places || [];
    land = loaded[2];
    water = loaded[3] || [];
    fit();
    go(LAND_WINDOW);
    var jerusalem = places.filter(function (p) { return p.name === "Jerusalem"; })[0];
    if (jerusalem) { show(jerusalem); }
  }).catch(function (err) {
    hint.textContent = "Could not load the map data: " + err.message;
  });
})();
