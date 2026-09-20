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


  /* ---------- the liturgical year, computed ----------
     Dates are arithmetic, so the calendar can be worked out rather than
     copied: Easter by the usual computus, and everything else from it. */

  function easter(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function iso(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
      "-" + String(date.getDate()).padStart(2, "0");
  }

  function addDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function advent1(year) {
    /* the fourth Sunday before Christmas: the Sunday on or after 27 November */
    var nov27 = new Date(year, 10, 27);
    var shift = (7 - nov27.getDay()) % 7;
    return addDays(nov27, shift);
  }

  function liturgicalYear(date) {
    var y = date.getFullYear();
    return date >= advent1(y) ? y : y - 1;
  }

  function seasonOn(date) {
    var y = date.getFullYear();
    var thisChristmas = new Date(y, 11, 25);
    var a1 = advent1(y);

    /* Advent runs from Advent Sunday until Christmas Eve */
    if (date >= a1 && date < thisChristmas) { return { name: "Advent", start: a1 }; }

    /* Christmas runs from 25 December to 5 January */
    var lastChristmas = date >= thisChristmas ? thisChristmas : new Date(y - 1, 11, 25);
    var epiphany = new Date(lastChristmas.getFullYear() + 1, 0, 6);   /* Epiphany falls the January after */
    if (date < epiphany) { return { name: "Christmas", start: lastChristmas }; }

    /* from Epiphany to the next Advent */
    var e = easter(epiphany.getFullYear());
    var ash = addDays(e, -46), whitsun = addDays(e, 49), trinity = addDays(e, 56);
    if (date < ash) { return { name: "Epiphany", start: epiphany }; }
    if (date < e) { return { name: "Lent", start: ash }; }
    if (date < whitsun) { return { name: "Easter", start: e }; }
    if (date < trinity) { return { name: "Whitsunday & Trinity", start: whitsun }; }
    return { name: "After Trinity", start: trinity };
  }

  /* where today sits in the Prayer Book's cycle: the Sunday of its week */
  function sundayOf(date) {
    var d = new Date(date.getTime());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
  }

  function weekIndex(sunday, year) {
    var i = 0;
    var s = new Date(advent1(year).getTime());
    while (s < sunday) { s = addDays(s, 7); i++; }
    return i;                                   /* 0 = the first Sunday in Advent */
  }

  function upcomingDates() {
    var y = new Date().getFullYear();
    var e = easter(y);
    var a1 = advent1(y);
    return [
      { label: "Ash Wednesday", date: addDays(e, -46) },
      { label: "Easter Day", date: e },
      { label: "Ascension Day", date: addDays(e, 39) },
      { label: "Whitsunday", date: addDays(e, 49) },
      { label: "Trinity Sunday", date: addDays(e, 56) },
      { label: "First Sunday in Advent", date: a1 }
    ];
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

  function renderToday() {
    var host = document.getElementById("today");
    host.innerHTML = "";
    var today = new Date();
    var sunday = sundayOf(today);
    var ly = sunday >= advent1(sunday.getFullYear()) ? sunday.getFullYear() : sunday.getFullYear() - 1;
    var idx = weekIndex(sunday, ly);
    var week = data.weeks[idx] || null;
    var season = seasonOn(today);

    var card = document.createElement("section");
    card.className = "card";
    var h2 = document.createElement("h2");
    h2.className = "serif";
    h2.style.margin = "0 0 4px";
    h2.style.fontSize = "1.1rem";
    h2.textContent = "This week \u2014 " + ST.formatDate(iso(sunday), { weekday: "long", month: "long", day: "numeric" });
    card.appendChild(h2);
    var sub = document.createElement("p");
    sub.className = "sub";
    sub.textContent = "Season: " + season.name;
    card.appendChild(sub);
    if (week) {
      var h3 = document.createElement("h3");
      h3.style.fontFamily = "var(--serif)";
      h3.style.margin = "6px 0 2px";
      h3.textContent = titleCase(week.label);
      card.appendChild(h3);
      if (week.morning) { card.appendChild(officeBlock(week.morning, "Morning Prayer")); }
      if (week.evening) { card.appendChild(officeBlock(week.evening, "Evening Prayer")); }
    } else {
      card.appendChild(ST.el("p", { class: "muted small", text: "No office found for this week." }));
    }
    host.appendChild(card);

    var dates = document.createElement("section");
    dates.className = "card";
    var dh = document.createElement("h2");
    dh.className = "serif";
    dh.style.margin = "0 0 8px";
    dh.style.fontSize = "1.1rem";
    dh.textContent = "The moveable feasts this year";
    dates.appendChild(dh);
    var list = document.createElement("div");
    list.className = "readings";
    upcomingDates().forEach(function (f) {
      var span = document.createElement("span");
      span.className = "reading";
      span.appendChild(ST.el("span", { class: "kind", text: f.label }));
      span.appendChild(document.createTextNode(ST.formatDate(iso(f.date), { month: "long", day: "numeric" }) +
        (f.date < today ? " (past)" : "")));
      list.appendChild(span);
    });
    dates.appendChild(list);
    dates.appendChild(ST.el("p", { class: "muted small", style: "margin-top:8px",
      text: "Worked out from Easter by the usual computus \u2014 dates, not tables." }));
    host.appendChild(dates);
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
    renderToday();
  }).catch(function () {
    els.out.appendChild(ST.el("div", { class: "card" }, [
      ST.el("div", { class: "notice error", text: "Could not load the lectionary. Serve the folder over HTTP." })
    ]));
  });
})();
