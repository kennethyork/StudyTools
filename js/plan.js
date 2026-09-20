/* Reading plans for the StudyTools apps.

   A plan is worked out from the canon rather than tabulated: books.json says
   how many chapters each book has, the plan says how many days it should take,
   and the days are cut from the chapter list. Nothing here is a stored table,
   so a plan cannot drift out of step with the books the site actually carries,
   and a new length costs one line.

   The cut is the even one: day d takes the chapters between the d-th and the
   (d+1)-th division of the chapter count, so the days differ in length by at
   most one chapter, every chapter appears exactly once, in order, and no day
   is left empty. scripts/check-plan.js checks all of that.

   Loaded with a plain <script>, exposing window.STPlan; under node it sets
   module.exports, which is how that check runs it. */
(function () {
  "use strict";

  /* scope: which books a plan reads — the 66-book canon, everything the site
     carries (with the Apocrypha), or one testament. */
  var PLANS = [
    { id: "bible", name: "The whole Bible in a year", days: 365, scope: "canon" },
    { id: "bible-apocrypha", name: "The whole Bible with the Apocrypha in a year", days: 365, scope: "all" },
    { id: "nt-90", name: "The New Testament in 90 days", days: 90, scope: "nt" },
    { id: "ot-180", name: "The Old Testament in half a year", days: 180, scope: "ot" }
  ];

  function byId(id) {
    for (var i = 0; i < PLANS.length; i++) { if (PLANS[i].id === id) return PLANS[i]; }
    return null;
  }

  function inScope(book, scope) {
    if (scope === "all") { return true; }
    if (scope === "canon") { return book.testament !== "DC"; }
    if (scope === "nt") { return book.testament === "NT"; }
    if (scope === "ot") { return book.testament === "OT"; }
    return false;
  }

  /* Every chapter a plan reads, in canonical order. */
  function chapters(books, planId) {
    var plan = byId(planId) || PLANS[0];
    var out = [];
    (books || []).forEach(function (b) {
      if (!inScope(b, plan.scope)) { return; }
      for (var c = 1; c <= b.chapters; c++) {
        out.push({ slug: b.slug, name: b.name, chapter: c });
      }
    });
    return out;
  }

  /* The plan's days: an array of chapter lists, one per day. */
  function build(books, planId) {
    var plan = byId(planId) || PLANS[0];
    var all = chapters(books, plan.id);
    var days = [];
    for (var d = 0; d < plan.days; d++) {
      var from = Math.floor(d * all.length / plan.days);
      var to = Math.floor((d + 1) * all.length / plan.days);
      days.push(all.slice(from, to));
    }
    return { id: plan.id, name: plan.name, days: days, chapters: all.length };
  }

  /* "Genesis 1-4; Exodus 3" — consecutive chapters of one book run together. */
  function format(day) {
    var parts = [];
    var i = 0;
    while (day && i < day.length) {
      var j = i;
      while (j + 1 < day.length && day[j + 1].slug === day[i].slug &&
             day[j + 1].chapter === day[j].chapter + 1) {
        j++;
      }
      parts.push(day[i].name + " " + (j > i ? day[i].chapter + "\u2013" + day[j].chapter : day[i].chapter));
      i = j + 1;
    }
    return parts.join("; ");
  }

  /* The dates a plan's days fall on: its start date, then the days after it. */
  function isoToDate(iso) {
    var p = String(iso || "").split("-").map(Number);
    if (p.length !== 3 || isNaN(p[0]) || isNaN(p[1]) || isNaN(p[2])) { return null; }
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function dateToISO(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") +
      "-" + String(date.getDate()).padStart(2, "0");
  }

  function addDays(iso, n) {
    var d = isoToDate(iso);
    if (!d) { return iso; }
    d.setDate(d.getDate() + n);
    return dateToISO(d);
  }

  /* Which day of the plan a date is (0-based), negative before the start. */
  function dayIndex(startISO, iso) {
    var s = isoToDate(startISO), t = isoToDate(iso);
    if (!s || !t) { return 0; }
    return Math.round((t - s) / 86400000);
  }

  /* ---------- progress ----------

     Ticks are kept by date, not by day number: a tick says "I did the reading
     that was down for that date", which stays true if the plan or its start
     date is later changed. Everything below is a question about those dates. */

  function doneIndexes(plan, startISO, done) {
    var out = [];
    for (var i = 0; i < plan.days.length; i++) {
      if (done && done[addDays(startISO, i)]) { out.push(i); }
    }
    return out;
  }

  function chaptersRead(plan, startISO, done) {
    return doneIndexes(plan, startISO, done).reduce(function (n, i) {
      return n + plan.days[i].length;
    }, 0);
  }

  /* Days read in a row, counting back from today. Today may not be read yet
     without breaking the run; any earlier unread day ends it. */
  function streak(plan, startISO, done, todayISO) {
    var today = dayIndex(startISO, todayISO);
    var run = 0;
    for (var i = Math.min(today, plan.days.length - 1); i >= 0; i--) {
      if (isDone(plan, startISO, done, i)) { run++; continue; }
      if (i === today) { continue; }
      break;
    }
    return run;
  }

  /* Days already appointed and not read — what a reader has to catch up on. */
  function behind(plan, startISO, done, todayISO) {
    var today = Math.min(Math.max(dayIndex(startISO, todayISO), 0), plan.days.length);
    var n = 0;
    for (var i = 0; i < today; i++) {
      if (!isDone(plan, startISO, done, i)) { n++; }
    }
    return n;
  }

  function isDone(plan, startISO, done, index) {
    return !!(done && done[addDays(startISO, index)]);
  }

  /* Where a reader has got to: everything the plan page and the home page show. */
  function progress(plan, startISO, done, todayISO) {
    var today = dayIndex(startISO, todayISO);
    var read = doneIndexes(plan, startISO, done).length;
    return {
      day: today,                                  /* 0-based; negative before the start */
      starts: today < 0,
      finished: today >= plan.days.length,
      daysRead: read,
      days: plan.days.length,
      chaptersRead: chaptersRead(plan, startISO, done),
      chapters: plan.chapters,
      percent: Math.round(read / plan.days.length * 100),
      streak: today < 0 ? 0 : streak(plan, startISO, done, todayISO),
      behind: behind(plan, startISO, done, todayISO),
      todayPortion: today >= 0 && today < plan.days.length ? plan.days[today] : null
    };
  }

  var api = {
    PLANS: PLANS,
    byId: byId,
    chapters: chapters,
    build: build,
    format: format,
    dateToISO: dateToISO,
    isoToDate: isoToDate,
    addDays: addDays,
    dayIndex: dayIndex,
    doneIndexes: doneIndexes,
    chaptersRead: chaptersRead,
    isDone: isDone,
    streak: streak,
    behind: behind,
    progress: progress
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = api; }
  else { window.STPlan = api; }
})();
