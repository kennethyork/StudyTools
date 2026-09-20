#!/usr/bin/env node
/* Checks the liturgical calendar arithmetic in js/liturgy.js against the Prayer
   Book data, so that a change to either cannot quietly start reading the wrong
   Sunday's table. Run with:

     node scripts/check-liturgical.js

   It reads data/liturgical/bcp1928-daily.json and needs no dependencies. */
"use strict";

const fs = require("fs");
const path = require("path");
const L = require(path.join(__dirname, "..", "js", "liturgy.js"));

const ROOT = path.join(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "liturgical", "bcp1928-daily.json"), "utf8"));
const index = L.indexData(data);

const FIRST_YEAR = 1900;
const LAST_YEAR = 2100;
const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}
function date(y, m, d) { return new Date(y, m - 1, d); }
function officeOn(dateString) {
  const p = dateString.split("-").map(Number);
  return L.officeFor(new Date(p[0], p[1] - 1, p[2]), index);
}

/* ---------- Easter and the dates that hang off it ---------- */

const KNOWN_EASTERS = {
  2022: "2022-04-17", 2024: "2024-03-31", 2025: "2025-04-20", 2026: "2026-04-05",
  2027: "2027-03-28", 2028: "2028-04-16", 2038: "2038-04-25"
};
Object.keys(KNOWN_EASTERS).forEach(function (year) {
  check("Easter " + year, L.iso(L.easter(Number(year))) === KNOWN_EASTERS[year],
    "got " + L.iso(L.easter(Number(year))));
});

for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
  const e = L.easter(y);
  check("Easter between 22 March and 25 April, " + y, e >= date(y, 3, 22) && e <= date(y, 4, 25), L.iso(e));
  check("Easter on a Sunday, " + y, e.getDay() === 0, L.iso(e));
  const a = L.advent1(y);
  check("Advent Sunday on a Sunday, " + y, a.getDay() === 0, L.iso(a));
  check("Advent Sunday next to St. Andrew, " + y,
    a >= date(y, 11, 27) && a <= date(y, 12, 3), L.iso(a));
  check("Ash Wednesday is 46 days before Easter, " + y,
    L.iso(L.ashWednesday(y)) === L.iso(L.addDays(e, -46)));
  check("Whitsunday is seven weeks after Easter, " + y,
    L.iso(L.pentecost(y)) === L.iso(L.addDays(e, 49)));
  check("Trinity Sunday is eight weeks after Easter, " + y,
    L.iso(L.trinitySunday(y)) === L.iso(L.addDays(e, 56)));
  check("the Epiphany is 6 January, " + y, L.iso(L.epiphany(y)) === y + "-01-06");
}

/* ---------- naming the Sunday at the head of a week ---------- */

const weekLabels = new Set(data.weeks.map(function (w) { return w.label; }));
const order = {};
data.weeks.forEach(function (w, i) { order[w.label] = i; });
const FEAST_LABELS = [L.LABELS.christmasDay, L.LABELS.epiphany];
const used = {};

for (let y = FIRST_YEAR; y <= LAST_YEAR; y++) {
  let sunday = L.advent1(y);
  let previous = -1;
  let weeks = 0;
  while (sunday < L.advent1(y + 1)) {
    const label = L.cycleLabel(sunday);
    if (FEAST_LABELS.indexOf(label) === -1) {
      check("week label is one the Prayer Book has: " + L.iso(sunday) + " → " + label, weekLabels.has(label));
      if (weekLabels.has(label)) {
        used[label] = true;
        /* the year's Sundays run through the Prayer Book's order, never back */
        check("week labels keep their order: " + L.iso(sunday) + " → " + label,
          order[label] > previous, "after index " + previous);
        previous = order[label];
      }
    } else {
      /* Christmas Day and the Epiphany keep their own service when they fall on
         a Sunday, so those two Sundays are not a week of the cycle */
      check("a feast Sunday is Christmas Day or the Epiphany: " + L.iso(sunday),
        (label === L.LABELS.christmasDay && sunday.getMonth() === 11 && sunday.getDate() === 25) ||
        (label === L.LABELS.epiphany && sunday.getMonth() === 0 && sunday.getDate() === 6), label);
    }
    weeks++;
    check("a cycle is not longer than the table, " + y, weeks <= 57);
    sunday = L.addDays(sunday, 7);
  }
  check("the cycle opens on Advent Sunday, " + y,
    L.cycleLabel(L.advent1(y)) === "FIRST SUNDAY IN ADVENT");
  check("the cycle closes on the Sunday next before Advent, " + y,
    L.cycleLabel(L.addDays(L.advent1(y + 1), -7)) === "SUNDAY NEXT BEFORE ADVENT");
}

const unused = data.weeks.map(function (w) { return w.label; }).filter(function (l) { return !used[l]; });
if (unused.length) {
  notes.push("no year from " + FIRST_YEAR + " to " + LAST_YEAR +
    " uses these weeks: " + unused.join(", "));
}

/* ---------- every date has both offices ---------- */

let gaps = 0;
for (let d = date(FIRST_YEAR, 1, 1); d <= date(LAST_YEAR, 12, 31); d = L.addDays(d, 1)) {
  const office = L.officeFor(d, index);
  if (!office || !office.morning || !office.morning.office || !office.evening || !office.evening.office) {
    gaps++;
    if (gaps <= 10) {
      notes.push("no office for " + L.iso(d) + " (week: " +
        L.cycleLabel(L.sundayOnOrBefore(d)) + ")");
    }
  }
}
check("every date from " + FIRST_YEAR + " to " + LAST_YEAR + " has a morning and an evening office",
  gaps === 0, gaps + " date(s) short");

/* ---------- the day's own service, and Sundays ---------- */

/* The greater holy days are kept when they fall on a Sunday. */
[
  ["2022-12-25", "Christmas Day"],
  ["2021-12-26", "St. Stephen"],
  ["2023-01-01", "The Circumcision of Christ"],
  ["2030-01-06", "The Epiphany"],
  ["2025-09-21", "St. Matthew"],
  ["2026-08-06", "Transfiguration of our Lord"]
].forEach(function (pair) {
  const office = officeOn(pair[0]);
  check("kept when it falls on a Sunday: " + pair[1], office && office.feast === pair[1],
    office ? String(office.feast) : "no office");
});

/* St. Andrew's Day falls on Advent Sunday in 2025: the Sunday stands, and the
   holy day is transferred. */
const adventSunday = officeOn("2025-11-30");
check("St. Andrew gives way to Advent Sunday in 2025",
  adventSunday && adventSunday.feast === null && adventSunday.transferred === "St. Andrew" &&
  adventSunday.label === "FIRST SUNDAY IN ADVENT",
  adventSunday ? [adventSunday.feast, adventSunday.transferred, adventSunday.label].join(" / ") : "no office");

/* An Eve keeps the first evensong of the feast, and nothing else. */
const paulEve = officeOn("2024-01-24");
check("St. Paul's Eve keeps its first evensong",
  paulEve && paulEve.evening.feast === "The Eve of St. Paul" && paulEve.morning.feast === null,
  paulEve ? String(paulEve.evening.feast) + " / " + String(paulEve.morning.feast) : "no office");
check("St. Paul's Eve falls in the week of the Third Sunday after the Epiphany",
  L.cycleLabel(L.sundayOnOrBefore(date(2024, 1, 24))) === "THIRD SUNDAY AFTER EPIPHANY");

/* ---------- the movable days ---------- */

[
  ["2026-02-18", "Ash Wednesday"],
  ["2026-03-30", "Monday before Easter"],
  ["2026-04-02", "Maundy Thursday"],
  ["2026-04-03", "Good Friday"],
  ["2026-04-04", "Easter Even"],
  ["2026-04-06", "Easter Monday"],
  ["2026-05-11", "Rogation Monday"],
  ["2026-05-14", "Ascension Day"],
  ["2026-05-25", "Whit Monday"],
  ["2019-04-22", "Easter Monday"],
  ["2019-05-27", "Rogation Monday"],
  /* the movable days the Prayer Book keeps over a lesser holy day */
  ["1944-02-23", "Ash Wednesday"],          /* St. Matthias's Eve */
  ["1902-03-24", "Monday before Easter"],    /* the Eve of the Annunciation */
  ["1905-04-24", "Easter Monday"],           /* the Eve of St. Mark */
  ["1919-06-10", "Whit Tuesday"]             /* the Eve of St. Barnabas */
].forEach(function (pair) {
  const office = officeOn(pair[0]);
  check("movable day " + pair[0] + ": " + pair[1], office && office.feast === pair[1],
    office ? String(office.feast) + " (week: " + String(office.label) + ")" : "no office");
});

/* Rogation Wednesday and Ascension Eve are the same day, one office each. On
   30 April 1913 they also displace the Eve of St. Philip and St. James. */
[ "2026-05-13", "1913-04-30" ].forEach(function (day) {
  const office = officeOn(day);
  check(day + " keeps Rogation Wednesday in the morning, Ascension Eve in the evening",
    office && office.morning.feast === "Rogation Wednesday" &&
    office.evening.feast === "Ascension Eve",
    office ? String(office.morning.feast) + " / " + String(office.evening.feast) : "no office");
});

/* Whitsun Eve is the evening of the Saturday in Whitsun week; its morning is
   the Ember Saturday of that week. */
const whitsunEve = officeOn("2026-05-23");
check("Whitsun Eve is the evening of that Saturday",
  whitsunEve && whitsunEve.evening.feast === "Whitsun Eve" && whitsunEve.morning.feast === null &&
  whitsunEve.label === "SUNDAY AFTER ASCENSION",
  whitsunEve ? String(whitsunEve.evening.feast) + " / " + String(whitsunEve.morning.feast) : "no office");

/* Easter Day is a Sunday and a week of its own. */
const easterDay = officeOn("2026-04-05");
check("Easter Day reads the Easter Day table",
  easterDay && easterDay.label === "EASTER DAY" && easterDay.morning.office.psalms,
  easterDay ? easterDay.label : "no office");

/* ---------- the week that counting would have got wrong ---------- */

/* The Sundays after the Epiphany are three in 2026 and the table has room for
   six, so counting weeks from Advent lands three weeks early. The Fifteenth
   Sunday after Trinity is 13 September 2026. */
check("13 September 2026 is the Fifteenth Sunday after Trinity",
  L.cycleLabel(L.sundayOnOrBefore(date(2026, 9, 13))) === "FIFTEENTH SUNDAY AFTER TRINITY",
  L.cycleLabel(L.sundayOnOrBefore(date(2026, 9, 13))));
const counted = Math.round((L.sundayOnOrBefore(date(2026, 9, 13)) - L.advent1(2025)) / (7 * 86400000));
check("counting weeks from Advent would have been wrong in 2026",
  data.weeks[counted].label !== "FIFTEENTH SUNDAY AFTER TRINITY",
  "counting gives " + data.weeks[counted].label);

/* ---------- report ---------- */

console.log("checked " + (LAST_YEAR - FIRST_YEAR + 1) + " years: " + data.weeks.length + " weeks, " +
  (data.fixed || []).length + " fixed days, " + (data.movable || []).length + " movable days");
notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("all checks passed");
