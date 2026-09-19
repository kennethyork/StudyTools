(function () {
  "use strict";

  var DAY = 86400000;

  var SEASONS = {
    advent: { key: "advent", name: "Advent", cls: "season-advent", color: "#4b3670", desc: "A season of waiting and preparation, beginning four Sundays before Christmas. The church remembers Israel's longing for the Messiah and looks for Christ's return." },
    christmas: { key: "christmas", name: "Christmas", cls: "season-christmas", color: "#9a2f2f", desc: "The twelve days from Christmas Eve to Epiphany, celebrating the Word made flesh." },
    epiphany: { key: "epiphany", name: "Epiphany", cls: "season-epiphany", color: "#356b6f", desc: "From January 6 until Ash Wednesday, the season of light and revelation: Christ shown to the Gentiles." },
    lent: { key: "lent", name: "Lent", cls: "season-lent", color: "#5d4370", desc: "Forty days of repentance and preparation from Ash Wednesday to Easter, walking with Christ toward the cross." },
    easter: { key: "easter", name: "Easter", cls: "season-easter", color: "#b8863b", desc: "Fifty days of resurrection joy from Easter Day to Pentecost, ending with the gift of the Holy Spirit." },
    pentecost: { key: "pentecost", name: "Pentecost", cls: "season-pentecost", color: "#a8442f", desc: "The birthday of the church: the risen Christ pours out the Holy Spirit on His people." },
    ordinary: { key: "ordinary", name: "Ordinary Time", cls: "season-ordinary", color: "#3f7a52", desc: "The growing season after Epiphany and after Pentecost, ordered by Trinity Sunday and Christ the King." }
  };

  var MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var HOLY_DAYS = null;
  var OFFICES = {};
  var HOLY_MAP = {};
  var FIXED_MAP = { 1: {}, 2: {} };
  var CREEDS = null;
  var CATECHISMS = {};

  var current = new Date();
  var selected = ST.todayISO();
  var viewYear = current.getFullYear();
  var viewMonth = current.getMonth();
  var activeSource = "heidelberg";

  function pad(n) { return String(n).padStart(2, "0"); }
  function isoOf(y, m, d) { return y + "-" + pad(m + 1) + "-" + pad(d); }
  function addDays(date, days) { var d = new Date(date.getTime()); d.setDate(d.getDate() + days); return d; }
  function dayName(date) { return DAY_NAMES[date.getDay()]; }
  function monthDay(date) { return MONTHS_SHORT[date.getMonth()] + " " + date.getDate(); }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  /* ---------- Movable feasts ---------- */

  function easterDate(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function advent1(year) {
    var christmas = new Date(year, 11, 25);
    var offset = christmas.getDay() === 0 ? 28 : 21 + christmas.getDay();
    var d = addDays(christmas, -offset);
    while (d.getDay() !== 0) d = addDays(d, -1);
    return d;
  }

  function seasonFor(date) {
    var year = date.getFullYear();
    var easter = easterDate(year);
    var ashWednesday = addDays(easter, -46);
    var pentecost = addDays(easter, 49);
    var epiphany = new Date(year, 0, 6);
    var christmasEve = new Date(year, 11, 24);
    var d = new Date(year, date.getMonth(), date.getDate());

    if (d >= advent1(year) && d < christmasEve) return SEASONS.advent;
    if (d >= christmasEve) return SEASONS.christmas;
    if (d < epiphany) return SEASONS.christmas;
    if (d >= epiphany && d < ashWednesday) return SEASONS.epiphany;
    if (d >= ashWednesday && d < easter) return SEASONS.lent;
    if (d >= easter && d < pentecost) return SEASONS.easter;
    if (d >= pentecost && d < addDays(pentecost, 1)) return SEASONS.pentecost;
    return SEASONS.ordinary;
  }

  function seasonRange(season, date) {
    var year = date.getFullYear();
    var easter = easterDate(year);
    switch (season.key) {
      case "advent": return [advent1(year), addDays(new Date(year, 11, 24), -1)];
      case "christmas": return [new Date(year, 11, 24), addDays(new Date(year, 0, 6), -1)];
      case "epiphany": return [new Date(year, 0, 6), addDays(easter, -47)];
      case "lent": return [addDays(easter, -46), addDays(easter, -1)];
      case "easter": return [easter, addDays(easter, 49)];
      case "pentecost": return [addDays(easter, 49), addDays(easter, 49)];
      default: return [addDays(easter, 50), addDays(advent1(year), -1)];
    }
  }

  /* ---------- Office lookup ---------- */

  function loadOffices() {
    return Promise.all([1, 2].map(function (n) {
      return ST.loadJSON(ST.siteRoot() + "data/liturgical/daily-office-year-" + n + ".json").then(function (data) {
        OFFICES[n] = data.entries;
        data.entries.forEach(function (e) {
          if (e.day && /^[A-Z][a-z]{2} \d+$/.test(e.day)) {
            FIXED_MAP[n][e.day] = e;
          }
        });
      });
    })).then(function () {
      return ST.loadJSON(ST.siteRoot() + "data/liturgical/daily-office-holy-days.json").then(function (data) {
        HOLY_DAYS = data.entries;
        data.entries.forEach(function (e) {
          if (e.day) HOLY_MAP[e.day] = e;
        });
      });
    });
  }

  function liturgicalYear(date) {
    var year = date.getFullYear();
    if (date >= advent1(year)) return year % 2 === 0 ? 1 : 2;
    return (year - 1) % 2 === 0 ? 1 : 2;
  }

  function find(entries, criteria) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (criteria.season !== undefined && e.season !== criteria.season) continue;
      if (criteria.week !== undefined && e.week !== criteria.week) continue;
      if (criteria.day !== undefined && e.day !== criteria.day) continue;
      if (criteria.title !== undefined && e.title !== criteria.title) continue;
      return e;
    }
    return null;
  }

  function officeFor(date) {
    var dow = dayName(date);
    var isSunday = date.getDay() === 0;
    var yearNum = liturgicalYear(date);
    var entries = OFFICES[yearNum] || [];
    var season = seasonFor(date);
    var md = monthDay(date);

    var seasonal = seasonalOffice(date, season, entries, dow);

    // Sundays take precedence over lesser holy days; the principal feasts
    // (Christmas, Epiphany, Easter, Pentecost, All Saints) are already
    // represented by the seasonal office for their dates.
    if (!isSunday && HOLY_MAP[md]) return { entry: HOLY_MAP[md], kind: "holy" };
    if (seasonal) return { entry: seasonal, kind: "office" };
    if (HOLY_MAP[md]) return { entry: HOLY_MAP[md], kind: "holy" };
    return null;
  }

  function seasonalOffice(date, season, entries, dow) {
    var isSunday = date.getDay() === 0;
    var year = date.getFullYear();
    var easter = easterDate(year);

    if (season.key === "advent") {
      var adventWeek = Math.floor((date - advent1(year)) / (7 * DAY)) + 1;
      return find(entries, { season: "Advent", week: "Week of " + adventWeek + " Advent", day: dow });
    }

    if (season.key === "christmas") {
      if (isSunday) {
        var anchorYear = date.getMonth() === 0 ? year - 1 : year;
        var ordinal = 1;
        var cursor = new Date(anchorYear, 11, 25);
        cursor = addDays(cursor, (7 - cursor.getDay()) % 7);
        while (cursor < date) { cursor = addDays(cursor, 7); ordinal += 1; }
        var title = ordinal === 1 ? "The First Sunday after Christmas" : "The Second Sunday after Christmas";
        return find(entries, { season: "Christmas", title: title }) ||
          find(entries, { season: "Christmas", week: "Christmas Day and Following", day: "Sunday" });
      }
      if (FIXED_MAP[liturgicalYear(date)][monthDay(date)]) {
        return FIXED_MAP[liturgicalYear(date)][monthDay(date)];
      }
      return find(entries, { season: "Christmas", week: "Christmas Day and Following", day: dow });
    }

    if (season.key === "epiphany") {
      var epiphany = new Date(year, 0, 6);
      var baptism = addDays(epiphany, ((7 - epiphany.getDay()) % 7) || 7);
      if (date < baptism) {
        if (FIXED_MAP[liturgicalYear(date)][monthDay(date)]) {
          return FIXED_MAP[liturgicalYear(date)][monthDay(date)];
        }
        return find(entries, { season: "Epiphany", week: "The Epiphany and Following", day: dow });
      }
      var weekNum = Math.floor((date - baptism) / (7 * DAY)) + 1;
      var week = find(entries, { season: "Epiphany", week: "Week of " + weekNum + " Epiphany", day: dow });
      if (week) return week;
      if (isSunday) {
        return find(entries, { season: "Epiphany", week: "Week of Last Epiphany", day: "Sunday" });
      }
      return null;
    }

    if (season.key === "lent") {
      var ashWednesday = addDays(easter, -46);
      var firstLentSunday = addDays(ashWednesday, 4);
      if (date < firstLentSunday) {
        return find(entries, { season: "Lent", week: "Ash Wednesday and Following", day: dow });
      }
      var lentWeek = Math.floor((date - firstLentSunday) / (7 * DAY)) + 1;
      var holyWeek = find(entries, { season: "Lent", week: "Holy Week", day: dow });
      if (holyWeek) return holyWeek;
      return find(entries, { season: "Lent", week: "Week of " + lentWeek + " Lent", day: dow });
    }

    if (season.key === "easter") {
      var daysAfter = Math.floor((date - easter) / DAY);
      if (daysAfter < 7) {
        return find(entries, { season: "Easter", week: "Easter Week", day: dow });
      }
      var weekNum2 = Math.floor(daysAfter / 7) + 1;
      var eWeek = find(entries, { season: "Easter", week: "Week of " + weekNum2 + " Easter", day: dow });
      if (eWeek) return eWeek;
      if (daysAfter >= 49) return find(entries, { season: "Easter", week: "Pentecost", day: "Sunday" });
      return null;
    }

    if (season.key === "pentecost") {
      return find(entries, { season: "Easter", week: "Pentecost", day: "Sunday" });
    }

    // Ordinary Time: after the Epiphany, or after Pentecost.
    if (date < easter) {
      var epiphany2 = new Date(year, 0, 6);
      var baptism2 = addDays(epiphany2, ((7 - epiphany2.getDay()) % 7) || 7);
      var wk = Math.floor((date - baptism2) / (7 * DAY)) + 1;
      var o1 = find(entries, { season: "Epiphany", week: "Week of " + wk + " Epiphany", day: dow });
      if (o1) return o1;
      if (isSunday) return find(entries, { season: "Epiphany", week: "Week of Last Epiphany", day: "Sunday" });
      return null;
    }

    var lastSaturday = addDays(advent1(date.getFullYear()), -1);
    var proper = 29 - Math.floor((lastSaturday - date) / (7 * DAY));
    proper = Math.max(1, Math.min(29, proper));
    var properEntry = find(entries, { season: "The Season after Pentecost", week: "Proper " + proper, day: dow });
    if (properEntry) return properEntry;
    if (isSunday) {
      var trinity = find(entries, { season: "The Season after Pentecost", title: "The First Sunday after Pentecost: Trinity Sunday" });
      if (trinity) return trinity;
      var properSunday = find(entries, { season: "The Season after Pentecost", week: "Proper " + proper, day: "Sunday" });
      if (properSunday) return properSunday;
    }
    return find(entries, { season: "The Season after Pentecost", week: "Proper 1", day: dow });
  }

  /* ---------- Rendering ---------- */

  function renderBanner() {
    var season = seasonFor(current);
    var range = seasonRange(season, current);
    var host = document.getElementById("banner");
    host.innerHTML = "";
    host.appendChild(ST.el("div", { class: "season-banner " + season.cls }, [
      ST.el("span", { class: "color-dot", style: "background:" + season.color }),
      ST.el("h2", { text: season.name }),
      ST.el("div", { class: "dates", text: ST.formatDate(isoOf(range[0].getFullYear(), range[0].getMonth(), range[0].getDate()), { month: "long", day: "numeric" }) + " – " + ST.formatDate(isoOf(range[1].getFullYear(), range[1].getMonth(), range[1].getDate()), { month: "long", day: "numeric", year: "numeric" }) }),
      ST.el("div", { class: "desc", text: season.desc })
    ]));
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
    var start = addDays(first, -first.getDay());
    var todayISO = ST.todayISO();

    for (var i = 0; i < 42; i++) {
      var d = addDays(start, i);
      var iso = isoOf(d.getFullYear(), d.getMonth(), d.getDate());
      var season = seasonFor(d);
      var holy = HOLY_MAP[monthDay(d)];
      var cls = "day";
      if (d.getMonth() !== viewMonth) cls += " outside";
      if (iso === todayISO) cls += " today";
      if (iso === selected) cls += " selected";
      var btn = ST.el("button", { type: "button", class: cls, "data-iso": iso });
      btn.appendChild(ST.el("span", { text: d.getDate() }));
      btn.appendChild(ST.el("span", { class: "dot", style: "background:" + (holy ? "#a8442f" : season.color) }));
      btn.appendChild(ST.el("span", { class: "feast", text: holy ? holy.title : "" }));
      btn.addEventListener("click", function () {
        selected = this.getAttribute("data-iso");
        var parts = selected.split("-").map(Number);
        current = new Date(parts[0], parts[1] - 1, parts[2]);
        renderBanner();
        renderCalendar();
        renderDay();
      });
      grid.appendChild(btn);
    }
  }

  function renderDay() {
    var parts = selected.split("-").map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    var season = seasonFor(date);
    document.getElementById("day-title").textContent = ST.formatDate(selected, { weekday: "long", month: "long", day: "numeric" });
    document.getElementById("day-season").textContent = season.name;

    var body = document.getElementById("day-body");
    body.innerHTML = "";

    var office = officeFor(date);
    if (!office) {
      body.appendChild(ST.el("p", { class: "muted", text: "No daily office selection is available for this date in the bundled lectionary." }));
    } else {
      var e = office.entry;
      if (office.kind === "holy" || e.title) {
        body.appendChild(ST.el("p", { class: "serif", style: "font-size:1.05rem;margin:0 0 10px", text: e.title || "Holy day" }));
      }
      if (e.psalms) {
        var psWrap = ST.el("div", { class: "office-block" }, [ST.el("h4", { text: "Psalms" })]);
        var tags = ST.el("div", { class: "psalm-tags" });
        if (e.psalms.morning) tags.appendChild(ST.el("span", { text: "Morning: " + e.psalms.morning.join(", ") }));
        if (e.psalms.evening) tags.appendChild(ST.el("span", { text: "Evening: " + e.psalms.evening.join(", ") }));
        if (!e.psalms.morning && Array.isArray(e.psalms)) tags.appendChild(ST.el("span", { text: e.psalms.join(", ") }));
        psWrap.appendChild(tags);
        body.appendChild(psWrap);
      }
      if (e.lessons) {
        var lessons = ST.el("div", { class: "office-block" }, [ST.el("h4", { text: "Lessons" })]);
        var list = ST.el("ul", { class: "lesson-list" });
        var flat = e.lessons;
        var addLesson = function (label, text) {
          list.appendChild(ST.el("li", {}, [ST.el("span", { class: "label", text: label }), ST.el("span", { text: String(text) })]));
        };
        if (flat.morning || flat.evening) {
          ["morning", "evening"].forEach(function (slot) {
            if (!flat[slot]) return;
            Object.keys(flat[slot]).forEach(function (kind) {
              addLesson(slot + " " + kind, flat[slot][kind]);
            });
          });
        } else {
          ["first", "second", "third", "gospel"].forEach(function (kind) {
            if (flat[kind]) addLesson(kind === "first" ? "Old Testament" : kind === "second" ? "Epistle" : kind, flat[kind]);
            var altKey = "alt" + kind.charAt(0).toUpperCase() + kind.slice(1);
            if (flat[altKey]) addLesson("alternative", flat[altKey]);
          });
          Object.keys(flat).forEach(function (kind) {
            var known = ["first", "second", "third", "gospel", "altFirst", "altSecond", "altThird", "altGospel", "morning", "evening"];
            if (known.indexOf(kind) === -1 && typeof flat[kind] === "string") addLesson(kind, flat[kind]);
          });
        }
        lessons.appendChild(list);
        body.appendChild(lessons);
      }
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
                var host = document.getElementById("source-body");
                host.appendChild(ST.el("h3", { class: "serif", style: "font-size:1rem;margin:14px 0 4px", text: "Lord's Day " + prev }));
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
    }).catch(function (err) {
      var host = document.getElementById("banner");
      host.innerHTML = "";
      host.appendChild(ST.el("div", { class: "notice error", text: "Could not load calendar data (" + err.message + "). Serve this folder over HTTP." }));
    });
  }

  bind();
  init();
})();
