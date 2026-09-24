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

const LIT = require(path.join(ROOT, "js", "liturgy.js"));

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
  concordance: function (letter) { return load("data/concordance/" + letter.toLowerCase() + ".json"); },
  /* the lectionary, and how a reading is named. The answers that read the Prayer
     Book were built here without it at first, so nothing checked them — and one
     of them printed "[object Object]" where the reading should be. */
  readings: function (slug, chapter, verse) {
    if (!liturgyIndex) { return Promise.resolve([]); }
    return Promise.resolve(LIT.readingsFor(liturgyIndex, slug, chapter, verse) || []);
  },
  readingLabel: function (h) { return LIT.readingLabel(h, ST.titleCase); }
};

let liturgyIndex = null;

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
  return load("data/liturgical/bcp1928-daily.json");
}).then(function (daily) {
  liturgyIndex = daily ? LIT.readingIndex(daily, ST.parseRef) : null;
  check("the lectionary can be indexed for the answers that read it",
    !!(liturgyIndex && Object.keys(liturgyIndex).length > 100),
    liturgyIndex ? Object.keys(liturgyIndex).length + " passages" : "none");
  /* Naming a reading, and the day it falls on: the arithmetic the reader's verse
     panel and these answers both go through, against dates worked out by hand. */
  check("a fixed holy day is named with this year's date",
    JSON.stringify(LIT.readingWhen({ where: "Trinity Sunday (06-01)" }, 2026)) ===
      JSON.stringify({ where: "Trinity Sunday", date: "2026-06-01" }),
    JSON.stringify(LIT.readingWhen({ where: "Trinity Sunday (06-01)" }, 2026)));
  check("a movable one is counted from Easter (Whit Sunday 2026, Easter + 49)",
    LIT.readingWhen({ where: "Whit Sunday (Easter +49)" }, 2026).date === "2026-05-24",
    String(LIT.readingWhen({ where: "Whit Sunday (Easter +49)" }, 2026).date));
  check("a week's office has no single date on it",
    LIT.readingWhen({ where: "FIRST SUNDAY IN ADVENT \u00b7 Sunday" }, 2026).date === null);
  check("and a reading is named with its office and its lesson",
    LIT.readingLabel({ where: "FIRST SUNDAY IN ADVENT \u00b7 Sunday", slot: "morning",
      kind: "first lesson" }, ST.titleCase) ===
      "First Sunday in Advent \u00b7 Sunday \u00b7 morning \u00b7 first lesson",
    LIT.readingLabel({ where: "FIRST SUNDAY IN ADVENT \u00b7 Sunday", slot: "morning",
      kind: "first lesson" }, ST.titleCase));
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
  /* A passage the Prayer Book does read, taken out of the index rather than written
     down here, so this follows the data. The block that answers with these readings
     was built with no lectionary behind it in this check, so nothing ever looked at
     it — and it printed "[object Object]" for every one of them. */
  const keys = Object.keys(liturgyIndex || {}).filter(function (k) {
    return (liturgyIndex[k] || []).some(function (h) { return h.from === 1; }) &&
      books.some(function (b) { return b.slug === k.split(" ")[0]; });
  });
  check("the Prayer Book reads verses in the books this site ships", keys.length > 0,
    String(keys.length));
  if (!keys.length) { return null; }
  const parts = keys[0].split(" ");
  const book = books.filter(function (b) { return b.slug === parts[0]; })[0];
  const question = "is " + book.name + " " + parts[1] + " in the office?";
  return A.answer(question, ctx).then(function (result) {
    const rb = (result.blocks || []).filter(function (b) {
      return /Prayer Book/.test(b.title); })[0];
    check("a passage the office reads is answered with the readings", !!rb,
      question + " → " + titles(result));
    const lines = rb ? (rb.lines || []).map(function (l) { return String(l.text); }) : [];
    check("and each reading is named: the day, the office and which lesson",
      lines.length > 0 && lines.every(function (t) {
        return t.indexOf(" \u00b7 ") !== -1 && /\b(morning|evening)\b/.test(t) &&
          /(psalm|first lesson|second lesson)/.test(t) && !/object Object/.test(t);
      }), JSON.stringify(lines.slice(0, 3)));
    check("and the block names the Prayer Book as where they come from",
      rb && /Prayer Book/.test(rb.title), rb ? rb.title : "no block");
  });
}).then(function () {
  return A.answer("John 3:16", ctx);
}).then(function (result) {
  /* A citation names the book. This line used to paste the first 120 characters of
     each source's own text after its name, which is the remark printed above it. */
  check("the sources listed are works, not quotations",
    (result.citations || []).length > 0 && (result.citations || []).every(function (c) {
      return c.length <= 60 && c.indexOf("\u2014") === -1;
    }), JSON.stringify(result.citations));
}).then(function () {
  return A.answer("asdfgh qwerty", ctx);
}).then(function (result) {
  check("nothing found says so, and says what it can answer",
    result.nothingFound === true && /What this can answer/.test(titles(result)), titles(result));
  check("and says plainly that it is not a model", /not a model/.test(texts(result)));
  check("and that note is not listed as one of the sources",
    (result.citations || []).every(function (c) { return !/not a model/i.test(c); }),
    JSON.stringify(result.citations));
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
  /* Every question a reader is likely to ask, and every part of every answer looked
     at for a stringified object. Two faults of exactly this shape have been found in
     this file by hand — a chapter handed back where a verse was wanted, and a
     reading asked for a label it does not carry — so the sweep is here to catch the
     next one without anyone having to look at the screen. */
  const questions = ["John 3:16", "what does grace mean", "baptism", "H7225",
    "compare John 1:1 in the translations", "who was Melchizedek", "Psalm 23:1-4",
    "asdfgh qwerty", "Melchizedek", "grace", "is Psalm 23 in the office?",
    "where does the Prayer Book read Isaiah 40?"];
  let chain = Promise.resolve();
  const stringified = [];
  questions.forEach(function (q) {
    chain = chain.then(function () { return A.answer(q, ctx); }).then(function (r) {
      if (/object Object/.test(JSON.stringify(r))) { stringified.push(q); }
      return null;
    }).catch(function () { return null; });
  });
  return chain.then(function () {
    check("no answer hands back a stringified object", stringified.length === 0,
      stringified.join(", "));
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
