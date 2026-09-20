#!/usr/bin/env node
/* Checks reference parsing (js/common.js) and the verse-to-office lookup in
   js/liturgy.js against the real 1928 data — the two things the reader's verse
   panel rests on. Run with:

     node scripts/check-refs.js

   common.js expects a document at load, so this gives it a stub that reports no
   topbar and then reads ST off the global. No dependencies. */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

global.window = global;
global.document = {
  readyState: "complete",
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  createElement: function () { return {}; },
  body: { getAttribute: function () { return null; } }
};
global.localStorage = {
  getItem: function () { return null; },
  setItem: function () {}
};

require(path.join(ROOT, "js", "common.js"));
const ST = global.ST;
const L = require(path.join(ROOT, "js", "liturgy.js"));

const daily = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "liturgical", "bcp1928-daily.json"), "utf8"));

const failures = [];
function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

/* ---------- references, as the reader and the apps write them ---------- */

check("plain reference", JSON.stringify(ST.parseRef("John 3:16")) ===
  JSON.stringify({ book: "john", chapter: 3, verseStart: 16, verseEnd: 16 }));
check("a range", ST.parseRef("Psalm 23:1-4").verseStart === 1 && ST.parseRef("Psalm 23:1-4").verseEnd === 4);
check("an abbreviation", ST.parseRef("Isa 61").book === "isaiah" && ST.parseRef("Isa 61").chapter === 61);
check("numbered books", ST.parseRef("1 Kings 8").book === "i-kings" && ST.parseRef("2 Cor. 5").book === "ii-corinthians");
check("the Apocrypha", ST.parseRef("Ecclus 39").book === "sirach", String(ST.parseRef("Ecclus 39")));
check("a bare chapter", ST.parseRef("Jude 1").book === "jude");
check("nonsense is refused", ST.parseRef("not a reference") === null);

/* ---------- readings, as the Prayer Book prints them ---------- */

const R = function (text) { return L.parseReading(text, ST.parseRef); };

check("a reading with a verse range", JSON.stringify(R("Isa. 61:1\u20133,10\u201311")) ===
  JSON.stringify({ slug: "isaiah", chapter: 61, from: 1, to: 3 }));
check("a whole chapter is open at both ends",
  R("Isa. 62").from === null && R("Isa. 62").to === null && R("Isa. 62").chapter === 62);
check("a psalm is a bare number", JSON.stringify(R("46")) ===
  JSON.stringify({ slug: "psalms", chapter: 46, from: null, to: null }));
check("a psalm with verses", JSON.stringify(R("18:1-20")) ===
  JSON.stringify({ slug: "psalms", chapter: 18, from: 1, to: 20 }));
check("a starred alternative is read the same", R("*Isa. 28:14-22").chapter === 28);
check("a numbered book", R("1 Kings 8:22-30,54-63").slug === "i-kings" && R("1 Kings 8:22-30,54-63").from === 22);
check("a reading that names no book is refused", R("read") === null);

/* ---------- where a verse is read ---------- */

const index = L.readingIndex(daily, ST.parseRef);
const keyCount = Object.keys(index).length;
check("the index covers the tables", keyCount > 200, keyCount + " chapters indexed");

/* verses the 1928 tables certainly carry */
const john1 = L.readingsFor(index, "john", 1, 1);          /* Trinity Sunday, morning second lesson */
check("John 1:1 is the second lesson on Trinity Sunday", john1.some(function (h) {
  return h.where === "TRINITY SUNDAY \u00b7 Sunday" && h.slot === "morning" && h.kind === "second lesson";
}), JSON.stringify(john1.slice(0, 3)));
check("the Sunday of every week is indexed, and only once", john1.filter(function (h) {
  return h.where.indexOf("TRINITY SUNDAY") === 0;
}).length === 1, JSON.stringify(john1.slice(0, 4)));

/* a reading that names a book needs a resolver; a bare psalm does not */
check("a reading that names a book is refused without a resolver",
  L.parseReading("Isa. 61:1", undefined) === null);
check("a psalm needs no resolver", L.parseReading("46", undefined) !== null);
check("an index without a resolver holds only the psalms",
  Object.keys(L.readingIndex(daily, undefined)).every(function (k) { return k.indexOf("psalms ") === 0; }));

const matt18 = L.readingsFor(index, "matthew", 18, 13);    /* Holy Innocents, morning second lesson */
check("Matthew 18:13 is read on Holy Innocents", matt18.some(function (h) {
  return h.where.indexOf("The Holy Innocents") === 0;
}), JSON.stringify(matt18.slice(0, 3)));

const psalm46 = L.readingsFor(index, "psalms", 46, 1);     /* First Sunday in Advent, morning psalm */
check("Psalm 46 is read on the First Sunday in Advent", psalm46.some(function (h) {
  return h.where.indexOf("FIRST SUNDAY IN ADVENT") === 0 && h.kind === "psalm";
}), JSON.stringify(psalm46.slice(0, 3)));

const luke2 = L.readingsFor(index, "luke", 2, 8);          /* Christmas Day morning, verses 1-20 */
check("Luke 2:8 falls inside the Christmas Day range", luke2.some(function (h) {
  return h.where.indexOf("Christmas Day") === 0;
}), JSON.stringify(luke2.slice(0, 3)));

/* a verse outside a range is not claimed by it: Revelation 21 is not in the
   All Saints reading of 21:1-4,22:5, but Revelation 19 is a whole chapter */
const rev19 = L.readingsFor(index, "revelation-of-john", 19, 1);
check("a whole-chapter reading claims its verses", rev19.some(function (h) {
  return h.where.indexOf("All Saints") === 0;
}), JSON.stringify(rev19.slice(0, 3)));

/* every entry points at a chapter the site actually carries */
const books = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "bible", "books.json"), "utf8"));
const known = {};
books.forEach(function (b) { known[b.slug] = b.chapters; });
let bad = 0;
Object.keys(index).forEach(function (key) {
  const parts = key.split(" ");
  const slug = parts.slice(0, -1).join(" ");
  const chapter = Number(parts[parts.length - 1]);
  if (!known[slug] || chapter < 1 || chapter > known[slug]) { bad++; }
});
check("every reading names a book and chapter the site carries", bad === 0, bad + " bad");

/* the index says nothing about a chapter no table appoints */
check("a chapter with no reading comes back empty",
  L.readingsFor(index, "psalms", 999, 1).length === 0);
check("a chapter that is not in the tables comes back empty",
  L.readingsFor(index, "leviticus", 27, 34).length === 0);

/* ---------- report ---------- */

console.log("indexed " + keyCount + " chapters of appointed readings from " +
  (daily.weeks || []).length + " weeks, " + (daily.fixed || []).length + " fixed days and " +
  (daily.movable || []).length + " movable days");
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("all checks passed");
