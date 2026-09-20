#!/usr/bin/env node
/* Checks the Strong's concordance against the interlinear it was built from.

   The build reads 1,189 files and writes two shards; this reads them again by
   different code and compares. It catches the failures that would show up as a
   wrong answer to "where else does this word appear": a verse missing from a
   word's list, a verse listed that does not contain the word, a stale index
   after the interlinear was rebuilt, and a delta encoding that decodes to
   something other than the verses the build meant. Run with:

     node scripts/check-concordance.js
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INTERLINEAR = path.join(ROOT, "data", "interlinear");
const OUT = path.join(ROOT, "data", "concordance");

const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

const index = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
const shards = {};
index.books.forEach(function () {});
["H", "G"].forEach(function (letter) {
  shards[letter] = JSON.parse(
    fs.readFileSync(path.join(OUT, index.files[letter]), "utf8"));
});

/* ---------- the index agrees with its own shards ---------- */

check("both shards carry the same book table",
  JSON.stringify(shards.H.books) === JSON.stringify(shards.G.books) &&
  JSON.stringify(shards.H.books) === JSON.stringify(index.books),
  shards.H.books.length + " / " + shards.G.books.length + " / " + index.books.length);

let words = 0, entries = 0;
["H", "G"].forEach(function (letter) {
  Object.keys(shards[letter].words).forEach(function (number) {
    words++;
    const entry = shards[letter].words[number];
    entries += entry.n;
    if (!/^[HG]\d+$/.test(number)) { failures.push("a key that is not a Strong's number: " + number); }
    if (!number.startsWith(letter)) { failures.push(number + " is in the wrong shard"); }
  });
});
check("the shards hold the number of words the index claims", words === index.words,
  words + " against " + index.words);
check("the shards hold the number of entries the index claims", entries === index.occurrences,
  entries + " against " + index.occurrences);
notes.push(words.toLocaleString() + " words, " + entries.toLocaleString() +
  " word-in-verse entries");

/* ---------- every entry against the interlinear ---------- */

const bySlug = {};
shards.H.books.forEach(function (b, i) { bySlug[b.slug] = { index: i, book: b }; });

const truth = {};            /* "H430|slug|chapter|verse" -> true */
let seen = 0, skipped = 0;
Object.keys(bySlug).forEach(function (slug) {
  const dir = path.join(INTERLINEAR, slug);
  fs.readdirSync(dir).forEach(function (name) {
    if (!/^\d+\.json$/.test(name)) { return; }
    const chapter = Number(name.replace(/\.json$/, ""));
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    Object.keys(data.verses || {}).forEach(function (verse) {
      const here = {};
      (data.verses[verse] || []).forEach(function (word) {
        if (!/^[HG]\d+$/.test(String(word.s || ""))) { skipped++; return; }
        here[word.s] = true;
        seen++;
      });
      Object.keys(here).forEach(function (number) {
        truth[number + "|" + slug + "|" + chapter + "|" + verse] = true;
      });
    });
  });
});

function decode(postings) {
  const out = [];
  let previous = 0;
  String(postings).split(",").forEach(function (part) {
    previous += Number(part);
    out.push(previous);
  });
  return out;
}

let listed = 0, wrong = 0, missing = 0, ascending = 0, outOfRange = 0;
const wrongExamples = [];
["H", "G"].forEach(function (letter) {
  Object.keys(shards[letter].words).forEach(function (number) {
    const entry = shards[letter].words[number];
    const ids = decode(entry.ids);
    if (ids.length !== entry.n) { failures.push(number + " says " + entry.n + " but lists " + ids.length); }
    for (let i = 1; i < ids.length; i++) { if (ids[i] <= ids[i - 1]) { ascending++; } }
    ids.forEach(function (id) {
      listed++;
      const bookIndex = Math.floor(id / 1000000);
      const chapter = Math.floor((id % 1000000) / 1000);
      const verse = id % 1000;
      const book = index.books[bookIndex];
      if (!book || !chapter || !verse) { outOfRange++; return; }
      if (!truth[number + "|" + book.slug + "|" + chapter + "|" + verse]) {
        wrong++;
        if (wrongExamples.length < 3) {
          wrongExamples.push(number + " → " + book.name + " " + chapter + ":" + verse);
        }
      }
    });
  });
});

check("every verse list is in ascending order, as a delta encoding needs",
  ascending === 0, ascending + " out of order");
check("every id decodes to a book, chapter and verse that exist",
  outOfRange === 0, outOfRange + " out of range");
check("every verse a word is listed in does contain that word", wrong === 0,
  wrong + " wrong" + (wrongExamples.length ? ": " + wrongExamples.join("; ") : ""));
check("the count of listed entries matches a fresh read of the interlinear",
  listed === Object.keys(truth).length, listed + " listed against " +
    Object.keys(truth).length + " in the texts");
notes.push(seen.toLocaleString() + " words with a Strong's number read from the interlinear (" +
  skipped.toLocaleString() + " without one)");

/* ---------- what a reader will actually ask for ---------- */

function entry(number) { return (shards[number[0]] || { words: {} }).words[number]; }

const h7225 = entry("H7225");      /* רֵאשִׁית, "beginning": Genesis 1:1 */
check("H7225 exists and is the Hebrew for beginning", !!h7225 && /beginning/i.test(h7225.e || ""),
  h7225 ? JSON.stringify(h7225.e) : "absent");
check("H7225 is in Genesis 1:1", !!h7225 && decode(h7225.ids).indexOf(
  bySlug.genesis.index * 1000000 + 1 * 1000 + 1) !== -1);

const g26 = entry("G26");          /* ἀγάπη, the noun "love" */
check("G26 exists and is love", !!g26 && /love/i.test(g26.e || ""), g26 ? JSON.stringify(g26.e) : "absent");
/* 1 John 4:8, "God is love" — not John 3:16, which loves with the verb ἀγαπάω,
   G25. A concordance has to keep those apart, so the check does too. */
check("G26 is in 1 John 4:8", !!g26 && decode(g26.ids).indexOf(
  bySlug["i-john"].index * 1000000 + 4 * 1000 + 8) !== -1);
check("G25, the verb, is a different word from G26",
  !!entry("G25") && entry("G25").n !== (g26 || {}).n,
  JSON.stringify([(entry("G25") || {}).n, (g26 || {}).n]));

const g3588 = entry("G3588");      /* the article: the commonest word in the Greek */
/* Counted once per verse, not once per occurrence, so its ceiling is the number
   of verses in the Greek New Testament rather than the times the article is used. */
check("the commonest Greek word is in the concordance and is common",
  !!g3588 && g3588.n > 6000, g3588 ? String(g3588.n) : "absent");
check("its list is not rendered as one enormous reference list by accident",
  !!g3588 && String(g3588.ids).length > 1000);

check("a word in no verse does not exist", !entry("H99999") && !entry("G99999"));

/* ---------- report ---------- */

notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked the concordance against the interlinear; all checks passed");
