/* Church Calendar Tracker: where a date falls in the Christian year, and the
   psalms and lessons the Book of Common Prayer (1928) appoints for its morning
   and evening office. The date arithmetic lives in js/liturgy.js; the tables
   come from data/liturgical/bcp1928-daily.json. */
(function () {
  "use strict";

  var L = STLiturgy;
  var DAY_NAMES = L.DAY_NAMES;

  var SEASONS = {
    advent: { key: "advent", name: "Advent", cls: "season-advent", color: "#4b3670", desc: "A season of waiting and preparation, beginning four Sundays before Christmas. The church remembers Israel's longing for the Messiah and looks for Christ's return." },
    christmas: { key: "christmas", name: "Christmas", cls: "season-christmas", color: "#9a2f2f", desc: "The twelve days from Christmas Eve to Epiphany, celebrating the Word made flesh." },
    epiphany: { key: "epiphany", name: "Epiphany", cls: "season-epiphany", color: "#356b6f", desc: "From January 6 until Ash Wednesday, the season of light and revelation: Christ shown to the Gentiles." },
    lent: { key: "lent", name: "Lent", cls: "season-lent", color: "#5d4370", desc: "Forty days of repentance and preparation from Ash Wednesday to Easter, walking with Christ toward the cross." },
    easter: { key: "easter", name: "Easter", cls: "season-easter", color: "#b8863b", desc: "Fifty days of resurrection joy from Easter Day to Whitsunday, ending with the gift of the Holy Spirit." },
    pentecost: { key: "pentecost", name: "Whitsunday", cls: "season-pentecost", color: "#a8442f", desc: "The birthday of the church: the risen Christ pours out the Holy Spirit on His people." },
    ordinary: { key: "ordinary", name: "After Trinity", cls: "season-ordinary", color: "#3f7a52", desc: "The long green season after Whitsunday, counted by the Sundays after Trinity and closing with the three Sundays before Advent." }
  };

  var OFFICE = null;              /* the 1928 tables, indexed for lookup */
  var SOURCE = "";
  var CREEDS = null;
  var CATECHISMS = {};

  var current = new Date();
  var selected = ST.todayISO();
  var viewYear = current.getFullYear();
  var viewMonth = current.getMonth();
  var activeSource = "heidelberg";

  /* ?date=YYYY-MM-DD opens the calendar on a particular day, so a date can be
     linked to and checked. */
  (function () {
    var wanted = /(?:^|[?&])date=(\d{4}-\d{2}-\d{2})/.exec(location.search);
    if (!wanted) { return; }
    var p = wanted[1].split("-").map(Number);
    if (isNaN(p[0]) || isNaN(p[1]) || isNaN(p[2])) { return; }
    selected = wanted[1];
    current = new Date(p[0], p[1] - 1, p[2]);
    viewYear = p[0];
    viewMonth = p[1] - 1;
  })();

  function isoOf(date) { return L.iso(date); }

  var SMALL_WORDS = { in: 1, of: 1, the: 1, and: 1, after: 1, before: 1, next: 1, upon: 1 };
  function titleCase(text) {
    return text.toLowerCase().replace(/\b[a-z][a-z']*/g, function (w, i) {
      if (i > 0 && SMALL_WORDS[w]) { return w; }
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).replace(/^[a-z]/, function (c) { return c.toUpperCase(); });
  }

  /* ---------- the season banner ---------- */

  function seasonSpan(date) {
    var key = L.season(date);
    var y = date.getFullYear();
    var eve = L.addDays(L.christmas(y), -1);
    var january = date.getMonth() === 0;
    switch (key) {
      case "advent": return [L.advent1(y), L.addDays(eve, -1)];
      case "christmas":
        return january
          ? [new Date(y - 1, 11, 24), L.addDays(L.epiphany(y), -1)]
          : [eve, new Date(y, 0, 5)];
      case "epiphany": return [L.epiphany(y), L.addDays(L.ashWednesday(y), -1)];
      case "lent": return [L.ashWednesday(y), L.addDays(L.easter(y), -1)];
      case "easter": return [L.easter(y), L.addDays(L.easter(y), 48)];
      case "pentecost": return [L.pentecost(y), L.pentecost(y)];
      default: return [L.addDays(january ? L.pentecost(y - 1) : L.pentecost(y), 1), L.addDays(L.advent1(y), -1)];
    }
  }

  function renderBanner() {
    var season = SEASONS[L.season(current)];
    var span = seasonSpan(current);
    var host = document.getElementById("banner");
    host.innerHTML = "";
    host.appendChild(ST.el("div", { class: "season-banner " + season.cls }, [
      ST.el("span", { class: "color-dot", style: "background:" + season.color }),
      ST.el("h2", { text: season.name }),
      ST.el("div", { class: "dates", text: ST.formatDate(isoOf(span[0]), { month: "long", day: "numeric" }) +
        " \u2013 " + ST.formatDate(isoOf(span[1]), { month: "long", day: "numeric", year: "numeric" }) }),
      ST.el("div", { class: "desc", text: season.desc })
    ]));
  }

  /* ---------- the month grid ---------- */

  function feastName(entry) {
    if (!entry) { return ""; }
    return entry.name || entry.eveningName || "";
  }

  function renderCalendar() {
    var grid = document.getElementById("calendar");
    grid.innerHTML = "";
    document.getElementById("month-label").textContent = new Date(viewYear, viewMonth, 1)
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });

    DAY_NAMES.map(function (d) { return d.slice(0, 3); }).forEach(function (d) {
      grid.appendChild(ST.el("div", { class: "dow", text: d }));
    });

    var first = new Date(viewYear, viewMonth, 1);
    var start = L.addDays(first, -first.getDay());
    var todayISO = ST.todayISO();

    for (var i = 0; i < 42; i++) {
      var d = L.addDays(start, i);
      var iso = isoOf(d);
      var season = SEASONS[L.season(d)];
      var feast = feastName(L.feastOn(d, OFFICE));
      var cls = "day";
      if (d.getMonth() !== viewMonth) cls += " outside";
      if (iso === todayISO) cls += " today";
      if (iso === selected) cls += " selected";
      var btn = ST.el("button", { type: "button", class: cls, "data-iso": iso });
      btn.appendChild(ST.el("span", { text: d.getDate() }));
      btn.appendChild(ST.el("span", { class: "dot", style: "background:" + (feast ? "#a8442f" : season.color) }));
      btn.appendChild(ST.el("span", { class: "feast", text: feast }));
      btn.addEventListener("click", function () {
        selected = this.getAttribute("data-iso");
        var parts = selected.split("-").map(Number);
        current = new Date(parts[0], parts[1] - 1, parts[2]);
        if (window.history && history.replaceState) { history.replaceState(null, "", "?date=" + selected); }
        renderBanner();
        renderCalendar();
        renderDay();
      });
      grid.appendChild(btn);
    }
  }

  /* ---------- the day's office ---------- */

  /* Every reading opens in Study a Passage, the same way the Sunday Lectionary
     does it. */
  function reading(kind, r) {
    var span = ST.el("span", { class: "reading" });
    if (kind) { span.appendChild(ST.el("span", { class: "kind", text: kind })); }
    span.appendChild(ST.el("a", {
      href: ST.siteRoot() + "apps/study/?ref=" + encodeURIComponent(r.link || r.ref), text: r.ref
    }));
    return span;
  }

  function slotBlock(slot, officeSlots) {
    var readings = officeSlots[slot];
    if (!readings || !readings.office) { return null; }
    var o = readings.office;
    var wrap = ST.el("div", { class: "office-block" });
    var heading = slot === "morning" ? "Morning Prayer" : "Evening Prayer";
    if (readings.feast) { heading += " \u00b7 " + readings.feast; }
    wrap.appendChild(ST.el("h4", { text: heading }));

    if (o.psalms && o.psalms.length) {
      var tags = ST.el("div", { class: "psalm-tags" });
      o.psalms.forEach(function (p) { tags.appendChild(reading("psalm", p)); });
      wrap.appendChild(tags);
    }
    /* The Prayer Book prints more than one lesson for some days (alternatives
       marked with an asterisk, and the older tables run several); they are
       shown in the order printed, as the old calendar app did. */
    var lessons = ST.el("ul", { class: "lesson-list" });
    [["first", "First lesson"], ["second", "Second lesson"]].forEach(function (pair) {
      var set = o[pair[0]] || [];
      if (!set.length) { return; }
      var cell = ST.el("li", {}, [ST.el("span", { class: "label", text: pair[1] })]);
      set.forEach(function (l, i) {
        if (i) { cell.appendChild(document.createTextNode(", ")); }
        cell.appendChild(reading(null, l));
      });
      lessons.appendChild(cell);
    });
    if (lessons.childNodes.length) { wrap.appendChild(lessons); }
    return wrap;
  }

  function renderDay() {
    var parts = selected.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    var season = SEASONS[L.season(date)];
    document.getElementById("day-title").textContent = ST.formatDate(selected, { weekday: "long", month: "long", day: "numeric" });
    document.getElementById("day-season").textContent = season.name;

    var body = document.getElementById("day-body");
    body.innerHTML = "";

    var office = L.officeFor(date, OFFICE);
    if (!office) {
      body.appendChild(ST.el("p", { class: "muted", text: "No daily office selection is available for this date in the bundled lectionary." }));
    } else {
      var heading = office.feast || (office.week ? titleCase(office.week) + " \u00b7 " + office.weekday : office.weekday);
      body.appendChild(ST.el("p", { class: "serif", style: "font-size:1.05rem;margin:0 0 10px", text: heading }));
      if (office.transferred) {
        body.appendChild(ST.el("p", { class: "muted small", style: "margin:0 0 10px", text: titleCase(office.transferred) +
          " falls on this Sunday, and the Prayer Book transfers it: the Sunday's own service is said." }));
      }
      ["morning", "evening"].forEach(function (slot) {
        var block = slotBlock(slot, office);
        if (block) { body.appendChild(block); }
      });
    }

    body.appendChild(ST.el("div", { class: "notice", style: "margin-top:12px", text: "Liturgical color: " + seasonColor(season) + ". " + season.desc }));
  }

  function seasonColor(season) {
    if (season.key === "advent" || season.key === "lent") return "purple or blue";
    if (season.key === "christmas" || season.key === "easter") return "white or gold";
    if (season.key === "pentecost") return "red";
    if (season.key === "epiphany") return "green, white on Epiphany";
    return "green";
  }

  /* ---------- creeds and catechisms ---------- */

  function renderSource() {
    var body = document.getElementById("source-body");
    body.innerHTML = "";

    if (activeSource === "heidelberg" && CATECHISMS.heidelberg) {
      var hc = CATECHISMS.heidelberg;
      body.appendChild(ST.el("p", { class: "muted small", text: hc.title + " · " + hc.edition + " · " + hc.count + " questions" }));
      hc.items.slice(0, 20).forEach(function (item, i) {
        if (i === 0 || item.lordsDay !== hc.items[i - 1].lordsDay) {
          body.appendChild(ST.el("h3", { class: "serif", style: "font-size:1rem;margin:14px 0 4px", text: "Lord's Day " + item.lordsDay }));
        }
        body.appendChild(ST.el("div", { class: "qa-item" }, [
          ST.el("div", { class: "q", text: "Q" + item.number + ". " + item.question }),
          ST.el("div", { class: "a", text: item.answer })
        ]));
      });
      body.appendChild(ST.el("p", { class: "muted small", style: "margin-top:12px" }, [
        document.createTextNode("Showing the first 20 of " + hc.count + " questions. "),
        ST.el("button", { class: "ghost", style: "font-size:.78rem", text: "Show all",
          onclick: function () {
            body.innerHTML = "";
            var prev = null;
            hc.items.forEach(function (item) {
              if (item.lordsDay !== prev) {
                prev = item.lordsDay;
                document.getElementById("source-body").appendChild(
                  ST.el("h3", { class: "serif", style: "font-size:1rem;margin:14px 0 4px", text: "Lord's Day " + prev }));
              }
              document.getElementById("source-body").appendChild(ST.el("div", { class: "qa-item" }, [
                ST.el("div", { class: "q", text: "Q" + item.number + ". " + item.question }),
                ST.el("div", { class: "a", text: item.answer })
              ]));
            });
          } })
      ]));
    } else if (activeSource === "wsc" && CATECHISMS.wsc) {
      var wsc = CATECHISMS.wsc;
      body.appendChild(ST.el("p", { class: "muted small", text: wsc.title + " · " + wsc.edition + " · " + wsc.count + " questions" }));
      wsc.items.slice(0, 25).forEach(function (item) {
        body.appendChild(ST.el("div", { class: "qa-item" }, [
          ST.el("div", { class: "q", text: "Q" + item.number + ". " + item.question }),
          ST.el("div", { class: "a", text: item.answer })
        ]));
      });
      body.appendChild(ST.el("p", { class: "muted small", style: "margin-top:12px", text: "Showing the first 25 of " + wsc.count + " questions." }));
    } else if (CREEDS) {
      var creed = CREEDS.filter(function (c) { return c.id === activeSource; })[0];
      if (creed) {
        body.appendChild(ST.el("p", { class: "muted small", text: creed.source }));
        body.appendChild(ST.el("div", { class: "creed-text", text: creed.text }));
      }
    }
  }

  function bind() {
    document.getElementById("prev-month").addEventListener("click", function () {
      viewMonth -= 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      renderCalendar();
    });
    document.getElementById("next-month").addEventListener("click", function () {
      viewMonth += 1;
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      renderCalendar();
    });
    document.getElementById("today-btn").addEventListener("click", function () {
      current = new Date();
      viewYear = current.getFullYear();
      viewMonth = current.getMonth();
      selected = ST.todayISO();
      renderBanner();
      renderCalendar();
      renderDay();
    });
    document.getElementById("print-cal").addEventListener("click", function () { window.print(); });

    document.getElementById("source-tabs").addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      activeSource = btn.getAttribute("data-source");
      this.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      renderSource();
    });
  }

  function loadOffices() {
    return ST.loadJSON(ST.siteRoot() + "data/liturgical/bcp1928-daily.json").then(function (data) {
      OFFICE = L.indexData(data);
      SOURCE = data.source || "";
    });
  }

  function init() {
    Promise.all([
      loadOffices(),
      ST.loadJSON(ST.siteRoot() + "data/creeds/creeds.json").then(function (d) { CREEDS = d.creeds; }),
      ST.loadJSON(ST.siteRoot() + "data/catechism/heidelberg.json").then(function (d) { CATECHISMS.heidelberg = d; }),
      ST.loadJSON(ST.siteRoot() + "data/catechism/westminster-shorter.json").then(function (d) { CATECHISMS.wsc = d; })
    ]).then(function () {
      renderBanner();
      renderCalendar();
      renderDay();
      renderSource();
      var footer = document.querySelector("footer.site");
      if (footer && SOURCE) { footer.appendChild(ST.el("p", { class: "muted small", text: SOURCE })); }
    }).catch(function (err) {
      var host = document.getElementById("banner");
      host.innerHTML = "";
      host.appendChild(ST.el("div", { class: "notice error", text: "Could not load calendar data (" + err.message + "). Serve this folder over HTTP." }));
    });
  }

  bind();
  init();
})();
