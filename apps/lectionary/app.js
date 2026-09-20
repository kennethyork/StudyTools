/* Sunday Lectionary: the psalms and lessons appointed for every Sunday of the
   Christian year in the Book of Common Prayer (1928), which is in the public
   domain in the United States. Each reading opens in Study a Passage, or goes
   to the lectern to be read aloud. Depends on js/common.js. */
(function () {
  "use strict";

  var ROOT = ST.siteRoot();
  var els = {
    out: document.getElementById("out"),
    seasons: document.getElementById("seasons")
  };

  var data = null;
  var filter = "all";

  /* the Prayer Book's own headings tell us which season a Sunday belongs to */
  function seasonOf(label) {
    var l = label.toUpperCase();
    if (l.indexOf("ADVENT") > -1) { return "Advent"; }
    if (l.indexOf("CHRISTMAS") > -1 || l.indexOf("NATIVITY") > -1 || l.indexOf("CIRCUMCISION") > -1
        || l.indexOf("EPIPHANY") > -1 || l.indexOf("NEW YEAR") > -1) { return "Christmas & Epiphany"; }
    if (l.indexOf("LENT") > -1 || l.indexOf("ASH") > -1 || l.indexOf("PALM") > -1 || l.indexOf("PASSION") > -1) { return "Lent"; }
    if (l.indexOf("EASTER") > -1) { return "Easter"; }
    if (l.indexOf("WHITSUN") > -1 || l.indexOf("PENTECOST") > -1) { return "Whitsunday & Trinity"; }
    if (l.indexOf("TRINITY") > -1) { return "Whitsunday & Trinity"; }
    return "After Trinity";
  }

  var SMALL = { in: 1, of: 1, the: 1, and: 1, after: 1, upon: 1, before: 1, on: 1, at: 1 };
  function titleCase(text) {
    return text.toLowerCase().replace(/\b[a-z][a-z']*/g, function (word, i) {
      if (i > 0 && SMALL[word]) { return word; }
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).replace(/^[a-z]/, function (c) { return c.toUpperCase(); });
  }

  function readingEl(kind, r) {
    var span = document.createElement("span");
    span.className = "reading";
    var k = document.createElement("span");
    k.className = "kind";
    k.textContent = kind;
    span.appendChild(k);
    var a = document.createElement("a");
    a.textContent = r.ref;
    a.href = ROOT + "apps/study/?ref=" + encodeURIComponent(r.link || r.ref);
    span.appendChild(a);
    var read = document.createElement("a");
    read.textContent = "\u25b6";
    read.title = "Read aloud in the lectern";
    read.href = ROOT + "apps/lectern/?ref=" + encodeURIComponent(r.link || r.ref);
    read.style.marginLeft = "5px";
    read.style.textDecoration = "none";
    span.appendChild(read);
    return span;
  }

  function officeBlock(office, title) {
    var wrap = document.createElement("div");
    wrap.className = "office";
    var h = document.createElement("div");
    h.className = "office-title";
    h.textContent = title;
    wrap.appendChild(h);
    var grid = document.createElement("div");
    grid.className = "readings";
    (office.psalms || []).forEach(function (p) { grid.appendChild(readingEl("psalm", p)); });
    (office.first || []).forEach(function (l) { grid.appendChild(readingEl("first", l)); });
    (office.second || []).forEach(function (l) { grid.appendChild(readingEl("second", l)); });
    wrap.appendChild(grid);
    return wrap;
  }

  function renderSeasons(seasons) {
    els.seasons.innerHTML = "";
    [{ id: "all", label: "All" }].concat(seasons.map(function (s) { return { id: s, label: s }; }))
      .forEach(function (o) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = o.label;
        b.setAttribute("aria-pressed", o.id === filter ? "true" : "false");
        b.addEventListener("click", function () { filter = o.id; render(); });
        els.seasons.appendChild(b);
      });
  }

  function render() {
    var seasons = [];
    data.weeks.forEach(function (w) {
      var s = seasonOf(w.label);
      if (seasons.indexOf(s) === -1) { seasons.push(s); }
    });
    renderSeasons(seasons);

    els.out.innerHTML = "";
    var card = document.createElement("section");
    card.className = "card";
    var head = document.createElement("div");
    head.className = "row";
    head.style.justifyContent = "space-between";
    head.style.alignItems = "baseline";
    var h2 = document.createElement("h2");
    h2.className = "serif";
    h2.style.margin = "0";
    h2.style.fontSize = "1.1rem";
    h2.textContent = "The Sundays of the Christian year";
    head.appendChild(h2);
    var count = document.createElement("span");
    count.className = "muted small";
    count.textContent = data.weeks.length + " Sundays";
    head.appendChild(count);
    card.appendChild(head);

    data.weeks.forEach(function (w) {
      var s = seasonOf(w.label);
      if (filter !== "all" && filter !== s) { return; }
      var day = document.createElement("div");
      day.className = "day";
      var h3 = document.createElement("h3");
      h3.textContent = titleCase(w.label);
      day.appendChild(h3);
      var when = document.createElement("div");
      when.className = "season";
      when.textContent = s;
      day.appendChild(when);
      if (w.morning) { day.appendChild(officeBlock(w.morning, "Morning Prayer")); }
      if (w.evening) { day.appendChild(officeBlock(w.evening, "Evening Prayer")); }
      card.appendChild(day);
    });
    els.out.appendChild(card);

    var foot = document.createElement("p");
    foot.className = "muted small";
    foot.style.marginTop = "12px";
    foot.textContent = data.source;
    els.out.appendChild(foot);
  }

  ST.loadJSON(ROOT + "data/liturgical/bcp1928.json").then(function (d) {
    data = d;
    render();
  }).catch(function () {
    els.out.appendChild(ST.el("div", { class: "card" }, [
      ST.el("div", { class: "notice error", text: "Could not load the lectionary. Serve the folder over HTTP." })
    ]));
  });
})();
