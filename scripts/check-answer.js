#!/usr/bin/env node
/* Checks the deterministic Ask: what it reads out of this site's own files, and
   what it says when they have nothing.

   This is the half of the reader's Ask panel that has no model in it, so the
   checks are the ordinary kind: a question becomes a plan, the plan becomes
   lookups, and the lookups return what the files say. Every answer here is run
   against the real data directory rather than a fixture, because the failure that
   matters is an answer that cites something the site does not have. Run with:

     node scripts/check-answer.js
*/
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
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
require(path.join(ROOT, "js", "common.js"));
const ST = global.ST;
const A = require(path.join(ROOT, "js", "answer.js"));

const failures = [];
function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

function load(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { return Promise.resolve(null); }
  try { return Promise.resolve(JSON.parse(fs.readFileSync(file, "utf8"))); }
  catch (e) { return Promise.resolve(null); }
}

const ctx = {
  parseRef: ST.parseRef,
  normalizeBook: ST.normalizeBook,
  books: function () { return books || []; },
  chapter: function (slug, tr, chapter) { return load("data/bible/" + slug + "." + tr + ".json"); },
  commentary: function (slug, chapter) { return load("data/commentary/" + slug + "/" + chapter + ".json"); },
  crossref: function (slug, chapter) { return load("data/crossref/" + slug + "/" + chapter + ".json"); },
  interlinear: function (slug, chapter) { return load("data/interlinear/" + slug + "/" + chapter + ".json"); },
  dictionary: function (letter) { return load("data/dictionary/" + letter + ".json"); },
  topical: function (source, letter) { return load("data/topical/" + source + "/" + letter + ".json"); },
  vocab: function (language) { return load("data/vocab/" + language + ".json"); },
  concordance: function (letter) { return load("data/concordance/" + letter.toLowerCase() + ".json"); }
};

let books = [];
const classify = function (q) { return A.classify(q, ST.parseRef, ST.normalizeBook); };

function texts(result) {
  const out = [];
  (result.blocks || []).forEach(function (b) {
    (b.lines || []).forEach(function (l) {
      out.push(String(l.text || ""));
      if (l.who) { out.push(String(l.who)); }      /* the count or the citation on the line */
    });
    if (b.source && b.source.who) { out.push(String(b.source.who)); }
    if (b.source && b.source.text) { out.push(String(b.source.text)); }
  });
  return out.join("\n");
}
function titles(result) {
  return (result.blocks || []).map(function (b) { return b.title; }).join(" | ");
}

/* ---------- reading the question ---------- */

check("a plain reference is read", classify("John 3:16").ref !== null &&
  classify("John 3:16").ref.book === "john", JSON.stringify(classify("John 3:16").ref));
check("a reference inside a sentence is read",
  (classify("what does John 3:16 say?").ref || {}).book === "john",
  JSON.stringify(classify("what does John 3:16 say?").ref));
check("a range is read", classify("Psalm 23:1-4").ref.verseEnd === 4,
  JSON.stringify(classify("Psalm 23:1-4").ref));
check("an abbreviation is read", classify("1 Cor 13").ref.book === "i-corinthians",
  JSON.stringify(classify("1 Cor 13").ref));
check("a Strong's number is read either way",
  classify("H7225").number === "H7225" && classify("Strong's 430").number === "H430",
  classify("H7225").number + " / " + classify("Strong's 430").number);
check("asking to compare is noticed", classify("compare John 1:1 in the translations").wantsComparison);
check("a word question becomes a lookup term", classify("what does grace mean").terms[0] === "grace",
  JSON.stringify(classify("what does grace mean").terms));
check("a person's name becomes a lookup term", classify("who was Melchizedek").terms[0] === "melchizedek");
check("nonsense has no reference and no number",
  !classify("asdfgh qwerty").ref && !classify("asdfgh qwerty").number);
check("an empty question is harmless", classify("").askedFor.length === 0);

/* ---------- what comes back ---------- */

/* The catalogue first: an answer about a reference needs the book list, which the
   page loads before it can ask anything. */
load("data/bible/books.json").then(function (data) {
  books = data || [];
  return A.answer("John 3:16", ctx);
}).then(function (result) {
  const body = texts(result);
  check("John 3:16 returns the passage", /For God so loved/.test(body), body.slice(0, 80));
  check("John 3:16 returns commentary", /JFB|Calvin/.test(titles(result) + body));
  check("John 3:16 returns cross-references", /Where else Scripture points/.test(titles(result)));
  check("John 3:16 returns the original words", /The words behind it/.test(titles(result)));
  check("every line of the passage is the verse text, not an object",
    (result.blocks || []).length > 0 && (result.blocks[0].lines || []).length > 0 &&
    (result.blocks[0].lines || []).every(function (l) {
      return typeof l.text === "string" && /[A-Za-z]{4}/.test(l.text) &&
        !/object Object/.test(l.text);
    }), JSON.stringify((result.blocks[0] || {}).lines && result.blocks[0].lines.slice(0, 1)));
  check("its links point at pages that exist",
    (result.blocks || []).every(function (b) {
      return (b.links || []).every(function (l) {
        const page = l.href.split("?")[0].replace(/\/$/, "/index.html");
        return fs.existsSync(path.join(ROOT, page));
      });
    }));
}).then(function () {
  return A.answer("what does grace mean", ctx);
}).then(function (result) {
  const body = texts(result);
  check("a word comes back from the dictionaries", /grace|favour|favor/i.test(body), body.slice(0, 100));
  check("a word answer names its dictionaries", /Dictionary/i.test(titles(result) + body));
}).then(function () {
  return A.answer("baptism", ctx);
}).then(function (result) {
  check("a topic comes back from the topical Bibles",
    /topical/i.test(titles(result) + texts(result)), titles(result));
}).then(function () {
  return A.answer("H7225", ctx);
}).then(function (result) {
  const body = texts(result);
  check("a Strong's number comes back with its word and count",
    /beginning/i.test(body) && /verses/.test(body), body.slice(0, 120));
  check("and offers the concordance view", /Every verse it appears in/.test(
    JSON.stringify(result.blocks)));
}).then(function () {
  return A.answer("compare John 1:1 in the translations", ctx);
}).then(function (result) {
  const who = (result.blocks || []).filter(function (b) {
    return /translation/i.test(b.title); }).map(function (b) {
    return (b.lines || []).length; }).sort(function (a, b) { return b - a; })[0];
  check("a comparison answers with several translations", who >= 3, String(who));
}).then(function () {
  return A.answer("asdfgh qwerty", ctx);
}).then(function (result) {
  check("nothing found says so, and says what it can answer",
    result.nothingFound === true && /What this can answer/.test(titles(result)), titles(result));
  check("and says plainly that it is not a model", /not a model/.test(texts(result)));
  check("its suggestions are names, not one-letter headwords",
    (result.blocks || []).every(function (b) {
      return (b.lines || []).every(function (l) { return String(l.text || "").length > 12; });
    }), JSON.stringify((result.blocks[0] || {}).lines || []).slice(0, 90));
}).then(function () {
  /* An answer may only cite a book the reader ships. */
  return A.answer("John 3:16", ctx).then(function () {
    check("the book list the answers read is the reader's own", books.length > 80,
      String(books.length));
    const shipped = {};
    books.forEach(function (b) { shipped[b.slug] = true; });
    return A.answer("baptism", ctx).then(function (result) {
      const cited = (titles(result) + " " + texts(result)).match(/[A-Z][a-z]+ \d+:\d+/g) || [];
      const unknown = cited.filter(function (ref) {
        const parsed = ST.parseRef(ref);
        return parsed && !shipped[parsed.book];
      });
      check("every reference quoted back is to a book that exists",
        unknown.length === 0, unknown.join(", "));
      return null;
    });
  });
}).then(function () {
  if (failures.length) {
    failures.forEach(function (f) { console.log("FAIL: " + f); });
    console.log(failures.length + " failure(s)");
    process.exit(1);
  }
  console.log("checked the deterministic Ask against the site's own files; all checks passed");
}).catch(function (err) {
  console.log("FAIL: the checks threw — " + err.message);
  console.log(err.stack);
  process.exit(1);
});
