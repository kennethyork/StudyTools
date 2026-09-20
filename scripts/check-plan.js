#!/usr/bin/env node
/* Checks the reading plans in js/plan.js against the books the site carries, so
   a plan cannot skip a chapter, repeat one, or leave a day empty. Run with:

     node scripts/check-plan.js

   It reads data/bible/books.json and needs no dependencies. */
"use strict";

const fs = require("fs");
const path = require("path");
const Plan = require(path.join(__dirname, "..", "js", "plan.js"));

const ROOT = path.join(__dirname, "..");
const books = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "bible", "books.json"), "utf8"));

const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

function key(c) { return c.slug + " " + c.chapter; }

/* how many chapters each scope should hold, counted from books.json itself */
const scopeTotals = { canon: 0, all: 0, nt: 0, ot: 0 };
books.forEach(function (b) {
  scopeTotals.all += b.chapters;
  if (b.testament === "NT") { scopeTotals.nt += b.chapters; }
  if (b.testament === "OT") { scopeTotals.ot += b.chapters; }
  if (b.testament !== "DC") { scopeTotals.canon += b.chapters; }
});

check("the 66-book canon is 1,189 chapters", scopeTotals.canon === 1189, String(scopeTotals.canon));
check("the New Testament is 260 chapters", scopeTotals.nt === 260, String(scopeTotals.nt));
check("the Old Testament is 929 chapters", scopeTotals.ot === 929, String(scopeTotals.ot));
check("everything the site carries is 1,413 chapters", scopeTotals.all === 1413, String(scopeTotals.all));

Plan.PLANS.forEach(function (definition) {
  const name = definition.name;
  const plan = Plan.build(books, definition.id);

  check(name + ": has its stated number of days", plan.days.length === definition.days,
    plan.days.length + " days");
  check(name + ": reads every chapter of its scope", plan.chapters === scopeTotals[definition.scope],
    plan.chapters + " of " + scopeTotals[definition.scope]);

  /* every chapter exactly once, in canonical order, no day empty */
  const seen = [];
  plan.days.forEach(function (day, i) {
    check(name + ": day " + (i + 1) + " is not empty", day.length > 0);
    day.forEach(function (c) { seen.push(c); });
  });
  const expected = Plan.chapters(books, definition.id);
  check(name + ": no chapter is missing or repeated",
    seen.length === expected.length && seen.every(function (c, i) { return key(c) === key(expected[i]); }),
    seen.length + " chapters taken, " + expected.length + " appointed");

  /* the days are cut evenly: the longest and the shortest differ by at most one */
  const sizes = plan.days.map(function (d) { return d.length; });
  const shortest = Math.min.apply(null, sizes);
  const longest = Math.max.apply(null, sizes);
  check(name + ": days differ by at most one chapter", longest - shortest <= 1,
    shortest + " to " + longest + " chapters a day");

  /* each day runs on from the last, with no chapter read twice */
  const unique = new Set(seen.map(key));
  check(name + ": every chapter appears once", unique.size === seen.length,
    seen.length - unique.size + " repeated");

  /* the same plan twice is the same plan */
  check(name + ": is worked out the same way each time",
    JSON.stringify(Plan.build(books, definition.id)) === JSON.stringify(plan));

  /* the shape of the first and last day, for the record */
  notes.push(name + ": " + plan.chapters + " chapters over " + definition.days +
    " days (" + shortest + "\u2013" + longest + " a day), opening " + Plan.format(plan.days[0]) +
    ", closing " + Plan.format(plan.days[plan.days.length - 1]));
});

/* an unknown plan id falls back to the first plan rather than throwing */
check("an unknown plan falls back to the year plan", Plan.build(books, "nonsense").id === Plan.PLANS[0].id);

/* dates: day numbering and the schedule it implies */
check("the first day of a plan is the day it starts",
  Plan.dayIndex("2026-01-01", "2026-01-01") === 0);
check("dates are numbered forwards", Plan.dayIndex("2026-01-01", "2026-01-05") === 4);
check("dates before the start count backwards", Plan.dayIndex("2026-01-05", "2026-01-01") === -4);
check("a day's date is the start plus its number",
  Plan.addDays("2026-12-30", 3) === "2027-01-02", Plan.addDays("2026-12-30", 3));
check("a year-long plan ends a year later",
  Plan.addDays("2026-01-01", 364) === "2026-12-31", Plan.addDays("2026-01-01", 364));

/* progress: ticks are kept by date, so the arithmetic is about dates */
const year = Plan.build(books, "bible");
const start = "2026-01-01";

let p = Plan.progress(year, start, {}, "2026-01-01");
check("a fresh plan on its first day is day 1", p.day === 0 && p.daysRead === 0 && p.chaptersRead === 0);
check("a fresh plan is not behind", p.behind === 0);
check("a fresh plan has no streak", p.streak === 0);

/* the first three days read, today the fourth */
const done = { "2026-01-01": true, "2026-01-02": true, "2026-01-03": true };
p = Plan.progress(year, start, done, "2026-01-04");
check("three days read is three days read", p.daysRead === 3);
check("the chapters read are those days' chapters",
  p.chaptersRead === year.days[0].length + year.days[1].length + year.days[2].length);
check("today unread does not break a streak", p.streak === 3, String(p.streak));
check("nothing is behind if only today is unread", p.behind === 0, String(p.behind));

/* a gap: two days have gone by unread */
p = Plan.progress(year, start, done, "2026-01-06");
check("a missed day ends the streak", p.streak === 0, String(p.streak));
check("the two days since are behind", p.behind === 2, String(p.behind));

/* reading today as well keeps the run going */
const withToday = { "2026-01-01": true, "2026-01-02": true, "2026-01-03": true, "2026-01-04": true };
check("reading today extends the run", Plan.progress(year, start, withToday, "2026-01-04").streak === 4);

/* before the plan starts, and after it ends */
p = Plan.progress(year, start, {}, "2025-12-25");
check("before the start the plan has not begun", p.starts && p.day < 0 && p.percent === 0);
check("a plan that has not started is not behind", p.behind === 0);
p = Plan.progress(year, start, done, Plan.addDays(start, 400));
check("after the last day the plan is finished", p.finished);

/* ticks belong to dates, so moving the start date moves what they answer for */
check("a tick belongs to its date", Plan.isDone(year, start, done, 0) && !Plan.isDone(year, start, done, 5));
check("the same date is a different day of the plan when the start moves",
  Plan.dayIndex("2026-01-01", "2026-01-03") === 2 && Plan.dayIndex("2026-01-03", "2026-01-03") === 0);
check("a tick follows its date when the start moves",
  Plan.isDone(year, "2026-01-03", done, 0) && !Plan.isDone(year, "2026-01-10", done, 0));

/* the portions are printed the way a reader says them */
check("consecutive chapters of one book run together",
  Plan.format([{ slug: "genesis", name: "Genesis", chapter: 1 }, { slug: "genesis", name: "Genesis", chapter: 2 },
    { slug: "genesis", name: "Genesis", chapter: 3 }]) === "Genesis 1\u20133",
  Plan.format([{ slug: "genesis", name: "Genesis", chapter: 1 }, { slug: "genesis", name: "Genesis", chapter: 2 }]));
check("a break between books is its own portion",
  Plan.format([{ slug: "genesis", name: "Genesis", chapter: 50 }, { slug: "exodus", name: "Exodus", chapter: 1 }]) ===
    "Genesis 50; Exodus 1",
  Plan.format([{ slug: "genesis", name: "Genesis", chapter: 50 }, { slug: "exodus", name: "Exodus", chapter: 1 }]));
check("a gap in the chapters does not run together",
  Plan.format([{ slug: "genesis", name: "Genesis", chapter: 1 }, { slug: "genesis", name: "Genesis", chapter: 3 }]) ===
    "Genesis 1; Genesis 3",
  Plan.format([{ slug: "genesis", name: "Genesis", chapter: 1 }, { slug: "genesis", name: "Genesis", chapter: 3 }]));

/* ---------- report ---------- */

notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked " + Plan.PLANS.length + " plans against " + books.length + " books; all checks passed");
