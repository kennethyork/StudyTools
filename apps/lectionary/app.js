/* Sunday Lectionary: the Revised Common Lectionary, Years A, B and C.
   Each reading opens in Study a Passage, or goes to the lectern to be read
   aloud. Depends on js/common.js. */
(function () {
  "use strict";

  var ROOT = ST.siteRoot();
  var els = {
    years: document.getElementById("years"),
    out: document.getElementById("out")
  };

  var data = null;
  var year = null;

  function today() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function parseDate(text) {
    var d = new Date(text);
    return isNaN(d.getTime()) ? null : d;
  }

  /* the next day in the whole lectionary that has not yet passed */
  function nextEntry() {
    var t = today(), best = null;
    Object.keys(data.years).forEach(function (letter) {
      data.years[letter].sundays.forEach(function (s) {
        var d = parseDate(s.date);
        if (!d || d < t) { return; }
        if (!best || d < best.date) { best = { letter: letter, date: d, entry: s }; }
      });
    });
    return best;
  }

  function renderYears() {
    els.years.innerHTML = "";
    Object.keys(data.years).forEach(function (letter) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = data.years[letter].label;
      b.setAttribute("aria-pressed", letter === year ? "true" : "false");
      b.addEventListener("click", function () { year = letter; renderYears(); renderList(); });
      els.years.appendChild(b);
    });
  }

  function readingEl(r) {
    var span = document.createElement("span");
    span.className = "reading";
    var kind = document.createElement("span");
    kind.className = "kind";
    kind.textContent = r.type;
    span.appendChild(kind);
    var a = document.createElement("a");
    a.textContent = r.ref;
    a.href = ROOT + "apps/study/?ref=" + encodeURIComponent(r.link || r.ref);
    span.appendChild(a);
    span.appendChild(document.createTextNode("  "));
    var read = document.createElement("a");
    read.textContent = "\u25b6";
    read.title = "Read aloud in the lectern";
    read.href = ROOT + "apps/lectern/?ref=" + encodeURIComponent(r.link || r.ref);
    read.style.marginLeft = "4px";
    read.style.textDecoration = "none";
    span.appendChild(read);
    return span;
  }

  function renderList() {
    els.out.innerHTML = "";
    var upcoming = nextEntry();
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
    h2.textContent = data.years[year].label;
    head.appendChild(h2);
    var count = document.createElement("span");
    count.className = "muted small";
    count.textContent = data.years[year].sundays.length + " days";
    head.appendChild(count);
    card.appendChild(head);

    data.years[year].sundays.forEach(function (s) {
      var isNext = upcoming && upcoming.letter === year && upcoming.entry === s;
      var day = document.createElement("div");
      day.className = "day" + (isNext ? " next" : "");
      var when = document.createElement("div");
      when.className = "when";
      var h3 = document.createElement("h3");
      h3.textContent = s.liturgical + (isNext ? "  \u2014 next" : "");
      when.appendChild(h3);
      var dt = document.createElement("span");
      dt.className = "date";
      dt.textContent = s.date;
      when.appendChild(dt);
      day.appendChild(when);
      var readings = document.createElement("div");
      readings.className = "readings";
      s.readings.forEach(function (r) { readings.appendChild(readingEl(r)); });
      day.appendChild(readings);
      card.appendChild(day);
    });
    els.out.appendChild(card);

    var foot = document.createElement("p");
    foot.className = "muted small";
    foot.style.marginTop = "12px";
    foot.textContent = data.source;
    els.out.appendChild(foot);
  }

  ST.loadJSON(ROOT + "data/liturgical/rcl.json").then(function (d) {
    data = d;
    var up = nextEntry();
    year = up ? up.letter : Object.keys(data.years)[0];
    renderYears();
    renderList();
  }).catch(function () {
    els.out.appendChild(ST.el("div", { class: "card" }, [
      ST.el("div", { class: "notice error", text: "Could not load the lectionary. Serve the folder over HTTP." })
    ]));
  });
})();
