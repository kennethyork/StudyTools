/* Parallel Passages: one passage from each tradition side by side, so every
   comparison is 1:1 - Bible, Tanakh, Qur'an and Book of Mormon.
   The Bible is read live from the site's translations; the other traditions
   are the passages frozen into data/compare/parallels.json. The full texts of
   those traditions are not part of this site. Depends on js/common.js. */
(function () {
  "use strict";

  var ROOT = ST.siteRoot();
  var STORE_KEY = "parallels-translation.v1";
  var MAX_VERSES = 14;

  var ORDER = ["bible", "judaism", "islam", "mormon"];
  var els = {
    filters: document.getElementById("filters"),
    tr: document.getElementById("tr"),
    list: document.getElementById("list"),
    count: document.getElementById("count"),
    detail: document.getElementById("detail")
  };

  var entries = [];
  var labels = {};
  var translations = [];
  var tr = null;
  var filter = "all";

  function verseLine(num, text) {
    var row = document.createElement("div");
    row.className = "verse-line";
    var n = document.createElement("span");
    n.className = "n";
    n.textContent = String(num);
    var p = document.createElement("p");
    p.textContent = text;
    row.appendChild(n);
    row.appendChild(p);
    return row;
  }

  /* the Bible side: read live, so the translation switcher works */
  function bibleBody(side) {
    var body = document.createElement("div");
    if (!tr) {
      body.appendChild(ST.el("div", { class: "muted small", text: "Loading\u2026" }));
      return body;
    }
    var holder = ST.el("div", { class: "muted small", text: "Loading\u2026" });
    body.appendChild(holder);
    var parsed = ST.parseRef(side.ref);
    if (!parsed) {
      body.innerHTML = "";
      body.appendChild(ST.el("div", { class: "muted small", text: "Could not read that reference." }));
      return body;
    }
    ST.loadTranslation(parsed.book, tr).then(function (data) {
      holder.remove();
      var ch = data.chapters[String(parsed.chapter)] || {};
      var from = parsed.verseStart || 1, to = parsed.verseEnd || from;
      var nums = Object.keys(ch).map(Number).filter(function (n) { return n >= from && n <= to; })
        .sort(function (a, b) { return a - b; });
      if (!nums.length) { nums = Object.keys(ch).map(Number).sort(function (a, b) { return a - b; }); }
      nums.slice(0, MAX_VERSES).forEach(function (n) { body.appendChild(verseLine(n, ch[String(n)])); });
      if (nums.length > MAX_VERSES) {
        body.appendChild(ST.el("div", { class: "also",
          text: "Showing the first " + MAX_VERSES + " of " + nums.length + " verses." }));
      }
      var link = ST.el("a", { class: "btn secondary", style: "margin-top:10px",
        href: ROOT + "apps/matrix/?ref=" + encodeURIComponent(side.ref),
        text: "Open in the Verse Matrix \u2192" });
      body.appendChild(link);
    }).catch(function () {
      holder.textContent = "Could not load " + side.ref + ".";
    });
    return body;
  }

  /* the other traditions: the passage frozen into the data file */
  function frozenBody(side) {
    var body = document.createElement("div");
    if (side.arabic) {
      var ar = document.createElement("p");
      ar.className = "ar";
      ar.setAttribute("lang", "ar");
      ar.textContent = side.arabic;
      body.appendChild(ar);
    }
    var p = document.createElement("p");
    p.className = "frozen";
    p.textContent = side.text || "";
    body.appendChild(p);
    return body;
  }

  function column(side) {
    var col = document.createElement("section");
    col.className = "card col-" + side.tradition;
    var head = document.createElement("div");
    head.className = "src-head";
    var h3 = document.createElement("h3");
    h3.textContent = side.label || side.tradition;
    head.appendChild(h3);
    var r = document.createElement("span");
    r.className = "ref";
    r.textContent = side.ref;
    head.appendChild(r);
    col.appendChild(head);
    col.appendChild(side.tradition === "bible" ? bibleBody(side) : frozenBody(side));
    if (side.source && side.tradition !== "bible") {
      col.appendChild(ST.el("div", { class: "also", text: side.source }));
    }
    return col;
  }

  function renderDetail(entry) {
    els.detail.innerHTML = "";
    var head = document.createElement("section");
    head.className = "card";
    var h2 = document.createElement("h2");
    h2.className = "serif";
    h2.style.margin = "0 0 6px";
    h2.style.fontSize = "1.25rem";
    h2.textContent = entry.title;
    head.appendChild(h2);
    if (entry.note) {
      head.appendChild(ST.el("p", { class: "small", style: "margin:0", text: entry.note }));
    }
    head.appendChild(ST.el("div", { class: "row", style: "margin-top:8px",
      text: entry.sides.map(function (s) { return s.label; }).join("  \u00b7  ") }));
    els.detail.appendChild(head);

    var cols = document.createElement("div");
    cols.className = "cols cols-" + entry.sides.length;
    entry.sides.slice().sort(function (a, b) {
      return ORDER.indexOf(a.tradition) - ORDER.indexOf(b.tradition);
    }).forEach(function (side) { cols.appendChild(column(side)); });
    els.detail.appendChild(cols);

    Array.prototype.forEach.call(els.list.querySelectorAll(".par-item"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-id") === entry.id);
    });
  }

  function selectEntry(entry) {
    renderDetail(entry);
    try { history.replaceState(null, "", "?entry=" + encodeURIComponent(entry.id)); } catch (e) { /* file:// */ }
  }

  function shown() {
    return entries.filter(function (e) {
      if (filter === "all") { return true; }
      return e.sides.some(function (s) { return s.tradition === filter; });
    });
  }

  function renderList() {
    els.list.innerHTML = "";
    var list = shown();
    els.count.textContent = list.length + " of " + entries.length;
    list.forEach(function (entry) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "par-item";
      b.setAttribute("data-id", entry.id);
      b.textContent = entry.title;
      var tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = entry.sides.map(function (s) { return s.label; }).join(" \u00b7 ");
      b.appendChild(tag);
      b.addEventListener("click", function () { selectEntry(entry); });
      els.list.appendChild(b);
    });
  }

  function renderFilters() {
    els.filters.innerHTML = "";
    var options = [{ id: "all", label: "All" }].concat(ORDER.map(function (t) {
      return { id: t, label: (labels[t] && labels[t].label) || t };
    }));
    options.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = o.label;
      b.setAttribute("aria-pressed", o.id === filter ? "true" : "false");
      b.addEventListener("click", function () {
        filter = o.id;
        renderFilters();
        renderList();
        var first = shown()[0];
        if (first) { selectEntry(first); }
      });
      els.filters.appendChild(b);
    });
  }

  function init() {
    var stored = ST.store(STORE_KEY);
    ST.loadTranslations().then(function (list) {
      translations = list;
      els.tr.innerHTML = "";
      translations.forEach(function (t) {
        var o = document.createElement("option");
        o.value = t.id;
        o.textContent = t.name;
        els.tr.appendChild(o);
      });
      tr = (stored && translations.some(function (t) { return t.id === stored; })) ? stored : translations[0].id;
      els.tr.value = tr;
      return ST.loadJSON(ROOT + "data/compare/parallels.json");
    }).then(function (d) {
      entries = d.entries || [];
      labels = d.traditions || {};
      renderFilters();
      renderList();
      var wanted = ST.qs("entry");
      var start = null;
      entries.forEach(function (e) { if (e.id === wanted) { start = e; } });
      if (start) { selectEntry(start); }
      else if (entries.length) { selectEntry(entries[0]); }
    }).catch(function () {
      els.detail.appendChild(ST.el("div", { class: "card" }, [
        ST.el("div", { class: "notice error", text: "Could not load the comparison data. Serve the folder over HTTP." })
      ]));
    });

    els.tr.addEventListener("change", function () {
      tr = els.tr.value;
      ST.store(STORE_KEY, tr);
      var active = els.list.querySelector(".par-item.active");
      var id = active && active.getAttribute("data-id");
      entries.forEach(function (e) { if (e.id === id) { renderDetail(e); } });
    });
  }

  init();
})();
