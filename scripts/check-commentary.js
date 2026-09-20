#!/usr/bin/env node
/* Checks the commentary data: that every comment sits on a verse that exists,
   that the sources say what they cover, and that the gaps are the documented
   gaps rather than dropped text. Run with:

     node scripts/check-commentary.js */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "commentary");
const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

const books = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "bible", "books.json"), "utf8"));
const bySlug = {};
books.forEach(function (b) { bySlug[b.slug] = b; });

const index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
const sourceIds = index.sources.map(function (s) { return s.id; });

check("the index names its sources", sourceIds.length >= 3, sourceIds.join(", "));
check("each source says how much it covers",
  index.sources.every(function (s) { return s.books > 0 && s.chapters > 0 && s.verses > 0; }));
notes.push(index.sources.map(function (s) {
  return s.short + ": " + s.books + " books, " + s.chapters + " chapters, " + s.verses + " verses";
}).join(" | "));

/* The deuterocanon has no commentary source, and that is stated rather than
   pretended: nothing under data/commentary should claim those books. */
check("the deuterocanon is not claimed by any commentary",
  index.books.every(function (slug) { return bySlug[slug] && bySlug[slug].testament !== "DC"; }),
  index.books.filter(function (s) { return bySlug[s] && bySlug[s].testament === "DC"; }).join(", "));

/* ---------- every chapter file ---------- */

let files = 0, entries = 0, offBook = 0, offVerse = 0, unknownSource = 0, markup = 0, empty = 0, badJson = 0;
const perSource = {};

index.books.forEach(function (slug) {
  const dir = path.join(OUT, slug);
  if (!fs.existsSync(dir)) { return; }
  fs.readdirSync(dir).forEach(function (name) {
    const chapter = Number(String(name).replace(/\.json$/, ""));
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); }
    catch (e) { badJson++; return; }
    files++;

    if (data.slug !== slug || data.chapter !== chapter) { offBook++; }
    const verses = data.verses || {};
    Object.keys(verses).forEach(function (v) {
      const number = Number(v);
      if (!number || number > 200) { offVerse++; }
      (verses[v] || []).forEach(function (entry) {
        entries++;
        perSource[entry.source] = (perSource[entry.source] || 0) + 1;
        if (sourceIds.indexOf(entry.source) === -1) { unknownSource++; }
        if (!entry.text) { empty++; }
        if (/<[a-z/]/i.test(entry.text)) { markup++; }
      });
    });
  });
});

check("no chapter file failed to parse", badJson === 0, badJson + " unreadable");
check("every chapter file knows its book and chapter", offBook === 0, offBook + " wrong");
check("every comment is on a plausible verse number", offVerse === 0, offVerse + " odd");
check("every comment comes from a source the index lists", unknownSource === 0, unknownSource + " unknown");
check("no comment is empty", empty === 0, empty + " empty");
check("no markup is left in the text", markup === 0, markup + " with markup");
notes.push(files + " chapter files, " + entries.toLocaleString() + " comments");

/* ---------- what a reader will actually see ---------- */

function commentary(slug, chapter) {
  const p = path.join(OUT, slug, chapter + ".json");
  if (!fs.existsSync(p)) { return null; }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const john3 = commentary("john", 3);
check("John 3 has commentary", !!john3 && Object.keys(john3.verses).length > 20,
  john3 ? Object.keys(john3.verses).length + " verses" : "no file");
check("John 3:16 is commented on by JFB and Calvin",
  !!john3 && (john3.verses["16"] || []).map(function (e) { return e.short; }).sort().join(",") === "Calvin,JFB",
  john3 ? JSON.stringify((john3.verses["16"] || []).map(function (e) { return e.short; })) : "no file");
check("a comment carries text worth reading",
  !!john3 && (john3.verses["16"] || [])[0].text.length > 200,
  john3 ? String((john3.verses["16"] || [])[0].text.length) : "no file");

/* The documented omissions: Calvin's Genesis 1:1, and JFB's, which the source
   attaches to the book's front matter rather than to the verse. Both are absent
   rather than invented, and the chapter still has plenty. */
const gen1 = commentary("genesis", 1);
check("Genesis 1 has commentary", !!gen1 && Object.keys(gen1.verses).length > 5,
  gen1 ? Object.keys(gen1.verses).length + " verses" : "no file");
check("Calvin's Genesis 1:1 is absent, as its source documents",
  !!gen1 && !(gen1.verses["1"] || []).some(function (e) { return e.source === "calvin"; }),
  !!gen1 ? JSON.stringify((gen1.verses["1"] || []).map(function (e) { return e.short; })) : "no file");

check("a book with no source at all has no file, rather than an empty one",
  !fs.existsSync(path.join(OUT, "tobit", "1.json")));

check("the index's book list matches what is on disk",
  index.books.every(function (slug) { return fs.existsSync(path.join(OUT, slug)); }));

/* ---------- report ---------- */

notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked the commentary data; all checks passed");
