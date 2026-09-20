#!/usr/bin/env node
/* Checks the search index against the text it claims to index. Run with:

     node scripts/check-search.js

   The important ones here do not trust the index: they re-read the translation
   files, tokenise them with the JavaScript, and compare whole posting lists
   against it — so an index built with a different tokeniser, or one that has
   fallen behind the text, fails rather than quietly returning wrong verses. */
"use strict";

const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "js", "search.js"));

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data");
const failures = [];
const notes = [];

function check(name, condition, detail) {
  if (!condition) { failures.push(name + (detail ? " — " + detail : "")); }
}

const meta = JSON.parse(fs.readFileSync(path.join(DATA, "search", "index.json"), "utf8"));
const books = meta.books;
const indexOf = {};
books.forEach(function (b, i) { indexOf[b.slug] = i; });

/* ---------- the tokeniser, as the build wrote it and as this reads it ---------- */

const sample = JSON.parse(fs.readFileSync(path.join(DATA, "search", "tokens-sample.json"), "utf8")).tokenize;
let drift = 0;
Object.keys(sample).forEach(function (text) {
  const theirs = sample[text].slice().sort().join(" ");
  const ours = S.tokenize(text).sort().join(" ");
  if (theirs !== ours) {
    drift++;
    if (drift <= 3) { notes.push("tokeniser drift on " + JSON.stringify(text.slice(0, 50)) + ": " + theirs + " vs " + ours); }
  }
});
check("the JavaScript tokeniser agrees with the build's on every sampled verse", drift === 0, drift + " differ");

check("tokenising drops one-character words", S.tokenize("I am a man of God").join(" ") === "am man of god",
  S.tokenize("I am a man of God").join(" "));
check("tokenising keeps apostrophes inside words", S.tokenize("the LORD's house").join(" ") === "the lord's house",
  S.tokenize("the LORD's house").join(" "));
check("tokenising drops numbers with no letters", S.tokenize("144,000 sealed").join(" ") === "sealed",
  S.tokenize("144,000 sealed").join(" "));
check("tokenising folds curly apostrophes", S.tokenize("God\u2019s love").join(" ") === "god's love",
  S.tokenize("God\u2019s love").join(" "));

/* ---------- the ids round-trip ---------- */

check("ids decode to the verse that made them",
  S.idOf(0, 1, 1) === 1001 && S.idOf(1, 3, 16) === 1003016, String(S.idOf(1, 3, 16)));
const ref = S.refOf(books, S.idOf(indexOf["john"], 3, 16));
check("an id names its book, chapter and verse",
  ref.slug === "john" && ref.chapter === 3 && ref.verse === 16 && ref.label === "John 3:16", JSON.stringify(ref));
check("delta-encoding decodes in order",
  S.decode("5,1,2,10").join(",") === "5,6,8,18", S.decode("5,1,2,10").join(","));
check("an empty posting list decodes to nothing", S.decode("").length === 0 && S.decode(undefined).length === 0);

/* ---------- the index against the text ---------- */

function versesOf(slug, translation) {
  const file = path.join(DATA, "bible", slug + "." + translation + ".json");
  if (!fs.existsSync(file)) { return null; }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/* Whole-list comparison for words in one book: the index's postings for that
   book must be exactly the verses whose text contains the word. */
const WORDS = ["god", "shepherd", "light", "wilderness", "justification", "the", "created", "love"];
const BOOKS = ["psalms", "genesis", "romans", "john"];

meta.translations.forEach(function (t) {
  const file = path.join(DATA, "search", t.id + ".json");
  check(t.id + ": an index file exists", fs.existsSync(file));
  if (!fs.existsSync(file)) { return; }
  const index = JSON.parse(fs.readFileSync(file, "utf8"));
  notes.push(t.id + ": " + index.verses.toLocaleString() + " verses, " +
    index.words.toLocaleString() + " words");

  BOOKS.forEach(function (slug) {
    const data = versesOf(slug, t.id);
    if (!data) { return; }
    const bookIndex = indexOf[slug];

    WORDS.forEach(function (word) {
      const want = [];
      Object.keys(data.chapters || {}).forEach(function (chapter) {
        Object.keys(data.chapters[chapter]).forEach(function (verse) {
          if (S.tokenize(data.chapters[chapter][verse]).indexOf(word) > -1) {
            want.push(S.idOf(bookIndex, Number(chapter), Number(verse)));
          }
        });
      });
      want.sort(function (a, b) { return a - b; });
      const got = S.decode(index.postings[word]).filter(function (id) {
        return Math.floor(id / 1000000) === bookIndex;
      });
      check(t.id + ": " + word + " in " + slug + " matches the text",
        want.length === got.length && want.every(function (id, i) { return id === got[i]; }),
        want.length + " in the text, " + got.length + " indexed");
    });
  });

  /* Every verse that has text is in the index somewhere. */
  const covered = new Set();
  Object.keys(index.postings).forEach(function (word) {
    S.decode(index.postings[word]).forEach(function (id) { covered.add(id); });
  });
  let withText = 0;
  books.forEach(function (b) {
    const data = versesOf(b.slug, t.id);
    if (!data) { return; }
    Object.keys(data.chapters || {}).forEach(function (chapter) {
      Object.keys(data.chapters[chapter]).forEach(function (verse) {
        if (S.tokenize(data.chapters[chapter][verse]).length) { withText++; }
      });
    });
  });
  check(t.id + ": every verse with words in it is reachable",
    covered.size === withText, covered.size + " indexed, " + withText + " have text (" + index.verses + " claimed)");
  check(t.id + ": the verse count matches the text", index.verses === withText,
    index.verses + " vs " + withText);
});

/* ---------- queries ---------- */

const webu = JSON.parse(fs.readFileSync(path.join(DATA, "search", "WEBU.json"), "utf8"));

const psalm = S.search(webu, "shepherd");
check("a single word finds verses", psalm.ids.length > 0, String(psalm.ids.length));
check("the shepherd verses are the psalm 23 verses",
  S.search(webu, "shepherd").ids.map(function (id) { return S.refOf(books, id).label; })
    .indexOf("Psalms 23:1") > -1);

const both = S.search(webu, "god created");
const godOnly = S.search(webu, "god");
check("two words mean both words", both.ids.length > 0 && both.ids.length < godOnly.ids.length,
  both.ids.length + " of " + godOnly.ids.length);
check("the first verse of the Bible answers for both its words",
  both.ids.map(function (id) { return S.refOf(books, id).label; }).indexOf("Genesis 1:1") > -1);

const none = S.search(webu, "shepherd zzzzznotaword");
check("a word that is not in the text matches nothing",
  none.ids.length === 0 && none.missing.indexOf("zzzzznotaword") > -1, JSON.stringify(none.missing));

check("an empty query returns nothing rather than everything",
  S.search(webu, "  the  ").ids.length > 0 && S.search(webu, "").ids.length === 0);

const limited = S.search(webu, "the", { limit: 5 });
check("a limit truncates rather than lying", limited.ids.length === 5 && limited.truncated === true);

const inGenesis = S.search(webu, "god", { bookIndex: indexOf["genesis"] });
check("results can be narrowed to one book",
  inGenesis.ids.every(function (id) { return S.refOf(books, id).slug === "genesis"; }) && inGenesis.ids.length > 0);

/* ---------- marking ---------- */

const marked = S.mark("The LORD is my shepherd; I shall not want.", ["shepherd", "lord"]);
check("marking finds both words", marked.filter(function (p) { return p.hit; }).map(function (p) { return p.text; }).join(",") === "LORD,shepherd",
  JSON.stringify(marked));
check("marking keeps the whole verse", marked.map(function (p) { return p.text; }).join("") ===
  "The LORD is my shepherd; I shall not want.");
check("marking a word that is not there changes nothing",
  S.mark("The LORD is my shepherd.", ["zzz"]).every(function (p) { return !p.hit; }));

/* ---------- report ---------- */

notes.forEach(function (n) { console.log("note: " + n); });
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL: " + f); });
  console.log(failures.length + " failure(s)");
  process.exit(1);
}
console.log("checked " + meta.translations.length + " indexes against the text; all checks passed");
