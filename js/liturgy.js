/* Liturgical calendar arithmetic for the StudyTools apps: the order of the
   Christian year as the Book of Common Prayer (1928) of the Episcopal Church
   keeps it. The 1928 book is in the public domain in the United States since
   1 January 2024.

   Dates are worked out rather than tabulated: Easter by the usual computus, and
   the rest of the year from it. The Prayer Book's year is a fixed sequence of
   Sundays, "The First Sunday in Advent" through "The Sunday next before
   Advent", and every date belongs to the week of the Sunday at its head.

   That Sunday is named first, and the week is then looked up by name. It cannot
   be found by counting weeks from Advent: the Prayer Book's sequence has room
   for six Sundays after the Epiphany and twenty-four after Trinity, and a given
   year uses fewer than the table holds, so counting runs ahead of the names and
   lands on a later Sunday's table — three weeks out in a year with only three
   Sundays after the Epiphany, as 2026 has.

   Loaded with a plain <script>, exposing window.STLiturgy; under node it sets
   module.exports, which is how scripts/check-liturgical.js tests it. */
(function () {
  "use strict";

  var DAY = 86400000;
  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var ADVENT = ["FIRST SUNDAY IN ADVENT", "SECOND SUNDAY IN ADVENT",
                "THIRD SUNDAY IN ADVENT", "FOURTH SUNDAY IN ADVENT"];
  var AFTER_CHRISTMAS = ["FIRST SUNDAY AFTER CHRISTMAS", "SECOND SUNDAY AFTER CHRISTMAS"];
  var AFTER_EPIPHANY = ["FIRST SUNDAY AFTER EPIPHANY", "SECOND SUNDAY AFTER EPIPHANY",
                        "THIRD SUNDAY AFTER EPIPHANY", "FOURTH SUNDAY AFTER EPIPHANY",
                        "FIFTH SUNDAY AFTER EPIPHANY", "SIXTH SUNDAY AFTER EPIPHANY"];
  var BEFORE_LENT = ["SEPTUAGESIMA SUNDAY", "SEXAGESIMA SUNDAY", "QUINQUAGESIMA SUNDAY"];
  var IN_LENT = ["FIRST SUNDAY IN LENT", "SECOND SUNDAY IN LENT", "THIRD SUNDAY IN LENT",
                 "FOURTH SUNDAY IN LENT", "FIFTH SUNDAY IN LENT", "SIXTH SUNDAY IN LENT"];
  var AFTER_EASTER = ["FIRST SUNDAY AFTER EASTER", "SECOND SUNDAY AFTER EASTER",
                      "THIRD SUNDAY AFTER EASTER", "FOURTH SUNDAY AFTER EASTER",
                      "FIFTH SUNDAY AFTER EASTER"];
  var AFTER_TRINITY = ["FIRST SUNDAY AFTER TRINITY", "SECOND SUNDAY AFTER TRINITY",
                       "THIRD SUNDAY AFTER TRINITY", "FOURTH SUNDAY AFTER TRINITY",
                       "FIFTH SUNDAY AFTER TRINITY", "SIXTH SUNDAY AFTER TRINITY",
                       "SEVENTH SUNDAY AFTER TRINITY", "EIGHTH SUNDAY AFTER TRINITY",
                       "NINTH SUNDAY AFTER TRINITY", "TENTH SUNDAY AFTER TRINITY",
                       "ELEVENTH SUNDAY AFTER TRINITY", "TWELFTH SUNDAY AFTER TRINITY",
                       "THIRTEENTH SUNDAY AFTER TRINITY", "FOURTEENTH SUNDAY AFTER TRINITY",
                       "FIFTEENTH SUNDAY AFTER TRINITY", "SIXTEENTH SUNDAY AFTER TRINITY",
                       "SEVENTEENTH SUNDAY AFTER TRINITY", "EIGHTEENTH SUNDAY AFTER TRINITY",
                       "NINETEENTH SUNDAY AFTER TRINITY", "TWENTIETH SUNDAY AFTER TRINITY",
                       "TWENTY-FIRST SUNDAY AFTER TRINITY", "TWENTY-SECOND SUNDAY AFTER TRINITY",
                       "TWENTY-THIRD SUNDAY AFTER TRINITY", "TWENTY-FOURTH SUNDAY AFTER TRINITY"];
  var BEFORE_ADVENT = ["THIRD SUNDAY BEFORE ADVENT", "SECOND SUNDAY BEFORE ADVENT",
                       "SUNDAY NEXT BEFORE ADVENT"];

  var CHRISTMAS_DAY = "CHRISTMAS DAY";
  var EPIPHANY = "EPIPHANY";
  var EASTER_DAY = "EASTER DAY";
  var SUNDAY_AFTER_ASCENSION = "SUNDAY AFTER ASCENSION";
  var WHITSUNDAY = "WHITSUNDAY";
  var TRINITY_SUNDAY = "TRINITY SUNDAY";

  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }
  function midnight(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
  function addDays(date, n) { var d = new Date(date.getTime()); d.setDate(d.getDate() + n); return d; }
  function sundayOnOrBefore(date) { var d = midnight(date); return addDays(d, -d.getDay()); }
  function weeksBetween(a, b) { return Math.round((midnight(b) - midnight(a)) / (7 * DAY)); }
  function mmdd(date) { return pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }
  function sameDay(a, b) { return midnight(a).getTime() === midnight(b).getTime(); }

  /* ---------- the movable dates ---------- */

  /* Easter by the usual computus: the first Sunday after the full moon that
     falls on or next after 21 March. */
  function easter(year) {
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

  function ashWednesday(year) { return addDays(easter(year), -46); }
  function goodFriday(year) { return addDays(easter(year), -2); }
  function ascensionDay(year) { return addDays(easter(year), 39); }
  function pentecost(year) { return addDays(easter(year), 49); }
  function trinitySunday(year) { return addDays(easter(year), 56); }

  function christmas(year) { return new Date(year, 11, 25); }
  function epiphany(year) { return new Date(year, 0, 6); }

  /* Advent Sunday: the fourth Sunday before Christmas Day, which is the Sunday
     falling on or next after 27 November (the Sunday nearest St. Andrew). */
  function advent1(year) {
    var nov27 = new Date(year, 10, 27);
    return addDays(nov27, (7 - nov27.getDay()) % 7);
  }

  /* The Sunday next after the Epiphany, which opens the Sundays after Epiphany. */
  function firstSundayAfterEpiphany(year) { return addDays(sundayOnOrBefore(epiphany(year)), 7); }

  /* The liturgical year a date belongs to, named for the Advent that began it. */
  function liturgicalYear(date) {
    var y = date.getFullYear();
    return midnight(date) >= advent1(y) ? y : y - 1;
  }

  /* ---------- naming the Sunday at the head of a week ---------- */

  /* The Prayer Book's own heading for a Sunday. Pass a Sunday. */
  function cycleLabel(sunday) {
    var s = midnight(sunday);
    var y = s.getFullYear();
    var a1 = advent1(y);

    if (s >= a1) {
      var n = weeksBetween(a1, s);
      if (n <= 3) { return ADVENT[n]; }
      /* else s is Christmas Day itself, or a Sunday within its octave */
    }

    var christmasYear = s >= christmas(y) ? y : y - 1;
    var jan1 = new Date(christmasYear + 1, 0, 1);
    var ep = epiphany(christmasYear + 1);
    var e = easter(christmasYear + 1);
    var ash = ashWednesday(christmasYear + 1);
    var qq = sundayOnOrBefore(ash);                 /* Quinquagesima */
    var first = firstSundayAfterEpiphany(christmasYear + 1);
    var lent1 = addDays(ash, 4);
    var whitsun = pentecost(christmasYear + 1);
    var trinity = trinitySunday(christmasYear + 1);
    var a1next = advent1(christmasYear + 1);

    if (sameDay(s, christmas(christmasYear))) { return CHRISTMAS_DAY; }
    if (s <= jan1) { return AFTER_CHRISTMAS[0]; }
    if (s < ep) { return AFTER_CHRISTMAS[1]; }
    if (sameDay(s, ep)) { return EPIPHANY; }

    if (s < ash) {
      var back = weeksBetween(s, qq);
      if (back < 3) { return BEFORE_LENT[2 - back]; }
      return AFTER_EPIPHANY[weeksBetween(first, s)];
    }
    if (s < e) { return IN_LENT[weeksBetween(lent1, s)]; }
    if (sameDay(s, e)) { return EASTER_DAY; }
    if (s < whitsun) {
      var after = weeksBetween(e, s);
      return after === 6 ? SUNDAY_AFTER_ASCENSION : AFTER_EASTER[after - 1];
    }
    if (sameDay(s, whitsun)) { return WHITSUNDAY; }
    if (sameDay(s, trinity)) { return TRINITY_SUNDAY; }

    var last = addDays(a1next, -7);                 /* the Sunday next before Advent */
    var back3 = weeksBetween(s, last);
    if (back3 < 3) { return BEFORE_ADVENT[2 - back3]; }
    return AFTER_TRINITY[weeksBetween(trinity, s) - 1];
  }

  /* ---------- the seasons ---------- */

  /* The season a date falls in, in this app's rough division of the year. */
  function season(date) {
    var d = midnight(date);
    var y = d.getFullYear();
    var eve = addDays(christmas(y), -1);
    var ep = epiphany(y);
    var e = easter(y);
    var ash = ashWednesday(y);
    var whitsun = pentecost(y);

    if (d >= advent1(y) && d < eve) { return "advent"; }
    if (d >= eve) { return "christmas"; }
    if (d < ep) { return "christmas"; }
    if (d < ash) { return "epiphany"; }
    if (d < e) { return "lent"; }
    if (d < whitsun) { return "easter"; }
    if (sameDay(d, whitsun)) { return "pentecost"; }
    return "ordinary";
  }

  /* The year's chief movable days, in order. */
  function movableFeasts(year) {
    return [
      { label: "Ash Wednesday", date: ashWednesday(year) },
      { label: "Easter Day", date: easter(year) },
      { label: "Ascension Day", date: ascensionDay(year) },
      { label: "Whitsunday", date: pentecost(year) },
      { label: "Trinity Sunday", date: trinitySunday(year) },
      { label: "First Sunday in Advent", date: advent1(year) }
    ];
  }

  /* ---------- readings, as the Prayer Book prints them ---------- */

  /* One printed reading — "Isa. 61:1-3,10-11", "1 Kings 8:22-30,54-63" or a
     psalm's bare number — as the book, chapter and first verse range it names.
     The Prayer Book prints alternatives after a comma and whole chapters
     without verses; the first range is taken, which is what such a reference
     means. `resolve` turns "Isa 61" into the site's book slug (the caller
     passes ST.parseRef, so the aliases live in one place). */
  function parseReading(ref, resolve) {
    var text = String(ref && ref.ref ? ref.ref : ref || "").trim()
      .replace(/^\*/, "").replace(/[\u2013\u2014]/g, "-");
    if (!text) { return null; }

    var psalm = /^(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(text);
    if (psalm) {
      return {
        slug: "psalms", chapter: Number(psalm[1]),
        from: psalm[2] ? Number(psalm[2]) : null,
        to: psalm[3] ? Number(psalm[3]) : (psalm[2] ? Number(psalm[2]) : null)
      };
    }

    if (typeof resolve !== "function") { return null; }
    var m = /^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?/.exec(text);
    if (!m) { return null; }
    var parsed = resolve(m[1] + " " + m[2]);
    if (!parsed) { return null; }
    return {
      slug: parsed.book, chapter: parsed.chapter,
      from: m[3] ? Number(m[3]) : null,
      to: m[4] ? Number(m[4]) : (m[3] ? Number(m[3]) : null)
    };
  }

  /* Where every reading in the 1928 tables falls, so a verse can be looked up:
     "John 1:1 is the second lesson on Trinity Sunday". Keyed by chapter, then
     walked verse by verse.

     The daily tables already carry the Sunday of each week, so the Sunday
     Lectionary file adds nothing here and would only list everything twice. */
  function readingIndex(daily, resolve) {
    var index = {};

    function add(reading, where, slot, kind) {
      var r = parseReading(reading, resolve);
      if (!r) { return; }
      var key = r.slug + " " + r.chapter;
      (index[key] = index[key] || []).push({
        where: where, slot: slot, kind: kind, from: r.from, to: r.to
      });
    }

    function addOffice(office, where, slot) {
      if (!office) { return; }
      (office.psalms || []).forEach(function (p) { add(p, where, slot, "psalm"); });
      (office.first || []).forEach(function (l) { add(l, where, slot, "first lesson"); });
      (office.second || []).forEach(function (l) { add(l, where, slot, "second lesson"); });
    }

    ((daily && daily.weeks) || []).forEach(function (w) {
      Object.keys(w.days || {}).forEach(function (dow) {
        ["morning", "evening"].forEach(function (slot) {
          addOffice((w.days[dow] || {})[slot], w.label + " \u00b7 " + dow, slot);
        });
      });
    });
    ((daily && daily.fixed) || []).forEach(function (f) {
      ["morning", "evening"].forEach(function (slot) {
        addOffice(f[slot], (f.name || "Holy day") + " (" + f.date + ")", slot);
      });
    });
    ((daily && daily.movable) || []).forEach(function (m) {
      ["morning", "evening"].forEach(function (slot) {
        addOffice(m[slot], m.name + " (Easter " + (m.offset >= 0 ? "+" : "\u2212") + Math.abs(m.offset) + ")", slot);
      });
    });
    return index;
  }

  /* The places a verse is read, from a readingIndex. */
  function readingsFor(index, slug, chapter, verse) {
    var hits = (index || {})[slug + " " + chapter] || [];
    return hits.filter(function (h) {
      if (h.from == null) { return true; }                 /* a whole chapter */
      if (verse == null) { return true; }
      var to = h.to == null ? h.from : h.to;
      return verse >= h.from && verse <= to;
    });
  }

  /* ---------- the daily office ---------- */

  /* Index a loaded bcp1928-daily.json for lookup. */
  function indexData(data) {
    var byLabel = {}, byDate = {};
    (data.weeks || []).forEach(function (w) {
      byLabel[String(w.label).toUpperCase()] = w.days || {};
    });
    (data.fixed || []).forEach(function (f) { byDate[f.date] = f; });
    return {
      weeks: data.weeks || [],
      movable: data.movable || [],
      byLabel: byLabel,
      byDate: byDate,
      source: data.source || ""
    };
  }

  /* The office a movable day appoints for a date, if any. */
  function movableOn(date, index) {
    var d = midnight(date);
    var e = easter(d.getFullYear());
    var found = null;
    (index.movable || []).forEach(function (m) {
      if (sameDay(addDays(e, m.offset), d)) { found = m; }
    });
    return found;
  }

  /* The day's own table: a movable day first, then a fixed one. A day often has
     only one of the two offices — an Eve keeps its first evensong in the
     evening — and the two can name the day differently (Rogation Wednesday in
     the morning of 30 April, when that is also Ascension Eve). */
  function feastOn(date, index) {
    var d = midnight(date);
    return movableOn(d, index) || index.byDate[mmdd(d)] || null;
  }

  function nameOf(entry, slot) {
    if (!entry) { return null; }
    return (slot === "evening" && entry.eveningName) || entry.name || null;
  }

  /* The office for a date, morning and evening.

     A day's own table is said when the Prayer Book gives it one, and otherwise
     the week's table for that weekday. On a Sunday the Sunday's service stands
     unless the day is one of the greater holy days, which the Prayer Book keeps
     and the Sunday gives way to. (Its table of precedence: "When two Holy-days
     fall upon the same day, then shall be said the whole Service Proper to the
     Day named in the left-hand column" — and the left-hand column holds the
     Feasts of our Lord and every holy day from St. Barnabas to All Saints.)

     The movable days come before the fixed ones, because the Prayer Book
     transfers the lesser holy days out of Holy Week, Easter Week, Ascensiontide
     and Whitsuntide: "Palm Sunday to Low Sunday: Annunciation, St. Mark,
     St. Philip and St. James, transferred to Tuesday after Low Sunday". So
     Easter Monday is kept on 24 April when it falls there, not the Eve of
     St. Mark; Ash Wednesday is kept when it falls on St. Matthias's Eve; and
     Whitsun week is kept over St. Barnabas. */
  function officeFor(date, index) {
    var d = midnight(date);
    var dow = DAY_NAMES[d.getDay()];
    var sunday = d.getDay() === 0;
    var movable = movableOn(d, index);
    var fixed = index.byDate[mmdd(d)] || null;
    var own = [movable, fixed].filter(Boolean);
    var label = cycleLabel(sundayOnOrBefore(d));
    var week = index.byLabel[label] || null;
    var ofWeek = (week && week[dow]) || null;

    var passedOver = null;      /* a holy day with an office of its own that the Sunday displaced */

    function slot(name) {
      for (var i = 0; i < own.length; i++) {
        if (!own[i][name]) { continue; }
        if (sunday && own[i].rank !== "greater") {
          if (nameOf(own[i], name)) { passedOver = nameOf(own[i], name); }
          continue;
        }
        return { office: own[i][name], feast: nameOf(own[i], name) };
      }
      if (ofWeek && ofWeek[name]) { return { office: ofWeek[name], feast: null }; }
      /* the week's table has nothing for this day: a lesser holy day fills the
         gap rather than leaving the day empty */
      for (var j = 0; j < own.length; j++) {
        if (own[j][name]) { return { office: own[j][name], feast: nameOf(own[j], name) }; }
      }
      return null;
    }

    var morning = slot("morning");
    var evening = slot("evening");
    if (!morning && !evening) { return null; }
    return {
      date: iso(d),
      weekday: dow,
      label: label,
      week: week ? label : null,
      feast: (morning && morning.feast) || (evening && evening.feast) || null,
      transferred: passedOver,
      morning: morning,
      evening: evening
    };
  }

  var api = {
    DAY: DAY,
    DAY_NAMES: DAY_NAMES,
    LABELS: {
      advent: ADVENT, afterChristmas: AFTER_CHRISTMAS, afterEpiphany: AFTER_EPIPHANY,
      beforeLent: BEFORE_LENT, lent: IN_LENT, afterEaster: AFTER_EASTER,
      afterTrinity: AFTER_TRINITY, beforeAdvent: BEFORE_ADVENT,
      christmasDay: CHRISTMAS_DAY, epiphany: EPIPHANY, easterDay: EASTER_DAY,
      sundayAfterAscension: SUNDAY_AFTER_ASCENSION, whitsunday: WHITSUNDAY,
      trinitySunday: TRINITY_SUNDAY
    },
    pad: pad,
    iso: iso,
    midnight: midnight,
    addDays: addDays,
    sundayOnOrBefore: sundayOnOrBefore,
    weeksBetween: weeksBetween,
    sameDay: sameDay,
    easter: easter,
    ashWednesday: ashWednesday,
    goodFriday: goodFriday,
    ascensionDay: ascensionDay,
    pentecost: pentecost,
    trinitySunday: trinitySunday,
    christmas: christmas,
    epiphany: epiphany,
    advent1: advent1,
    firstSundayAfterEpiphany: firstSundayAfterEpiphany,
    liturgicalYear: liturgicalYear,
    cycleLabel: cycleLabel,
    season: season,
    movableFeasts: movableFeasts,
    indexData: indexData,
    feastOn: feastOn,
    officeFor: officeFor,
    parseReading: parseReading,
    readingIndex: readingIndex,
    readingsFor: readingsFor
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { window.STLiturgy = api; }
})();
