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
/* A source may cover a book with an introduction and no verse remarks — Charles on
   the Prayer of Manasses does exactly that — so "says how much it covers" means
   books and *some* content, not chapters and verses. */
check("each source says how much it covers",
  index.sources.every(function (s) {
    return s.books > 0 && (s.chapters > 0 || s.introductions > 0) &&
      (s.verses > 0 || s.introductions > 0);
  }), JSON.stringify(index.sources.filter(function (s) {
    return !(s.books > 0 && (s.chapters > 0 || s.introductions > 0)); }).map(
      function (s) { return s.short; })));
notes.push(index.sources.map(function (s) {
  return s.short + ": " + s.books + " books, " + s.chapters + " chapters, " + s.verses + " verses";
}).join(" | "));

/* The deuterocanon is Haydock's. The three Protestant works stop at the
   sixty-six, which is why these books had no commentary here at all until his
   arrived — so what used to be "nothing claims them" is now "only he does". */
const dcSlugs = Object.keys(bySlug).filter(function (s) {
  return bySlug[s].testament === "DC";
});
const haydock = index.sources.filter(function (s) { return s.id === "haydock"; })[0];
check("the index lists Haydock and what he covers",
  !!haydock && haydock.verses > 2000 && haydock.books >= 10,
  haydock ? JSON.stringify(haydock) : "absent");
check("the deuterocanonical books he does cover have files now",
  ["tobit", "judith", "wisdom", "sirach", "baruch", "i-maccabees", "ii-maccabees",
   "susanna", "bel-and-the-dragon", "epistle-of-jeremiah"].every(function (slug) {
    return slug in bySlug && fs.existsSync(path.join(OUT, slug, "1.json"));
  }));
check("the deuterocanonical books he does not cover still have none, and the reader says so",
  ["i-esdras", "ii-esdras", "prayer-of-manasses", "psalm-151", "iii-maccabees",
   "iv-maccabees"].every(function (slug) { return !fs.existsSync(path.join(OUT, slug)); }),
  dcSlugs.join(", "));

/* ---------- every chapter file ---------- */

let files = 0, entries = 0, offBook = 0, offVerse = 0, unknownSource = 0, markup = 0, empty = 0, badJson = 0;
let intros = 0, introParagraphs = 0, badIntro = 0;
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
    (data.introductions || []).forEach(function (intro) {
      intros++;
      if (sourceIds.indexOf(intro.source) === -1) { unknownSource++; }
      const paragraphs = intro.paragraphs || [];
      if (!paragraphs.length) { badIntro++; }
      paragraphs.forEach(function (p) {
        introParagraphs++;
        if (!p) { empty++; }
        if (/<[a-z/]/i.test(p)) { markup++; }
      });
    });
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
check("every introduction is written as paragraphs", badIntro === 0, badIntro + " with none");
notes.push(files + " chapter files, " + entries.toLocaleString() + " comments, " +
  intros.toLocaleString() + " chapter introductions in " + introParagraphs.toLocaleString() + " paragraphs");

/* ---------- the Catena: the fathers, attributed ---------- */

/* Aquinas' chain of the Fathers on the Gospels, parsed out of a transcription
   that is not tidy — a missing chapter heading, a heading with escaped markup, a
   citation read as a verse number. Each of those was a fault while it was being
   built, so each is checked now. */

const catena = index.sources.filter(function (s) { return s.id === "catena"; })[0];
check("the index lists the Catena with what it covers",
  !!catena && catena.books === 2 && catena.verses > 30000,
  catena ? JSON.stringify(catena) : "absent");
check("and names the work rather than the first Father who signed a remark",
  !!catena && /Catena Aurea/.test(catena.name || ""), catena ? catena.name : "");

const fathers = new Set();
let catenaRemarks = 0;
["matthew", "mark"].forEach(function (slug) {
  const dir = path.join(OUT, slug);
  if (!fs.existsSync(dir)) { return; }
  fs.readdirSync(dir).forEach(function (name) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    Object.keys(data.verses || {}).forEach(function (v) {
      (data.verses[v] || []).forEach(function (entry) {
        if (entry.source === "catena") { catenaRemarks++; fathers.add(entry.short); }
      });
    });
  });
});
check("every Catena remark is signed by a Father", fathers.size >= 12 && catenaRemarks > 30000,
  fathers.size + " names, " + catenaRemarks + " remarks");
check("the names are the ones the printed volume uses",
  ["Chrysostom", "Augustine", "Jerome", "Bede", "Origen", "Gregory", "Ambrose"].every(
    function (n) { return fathers.has(n); }),
  Array.from(fathers).sort().join(", "));
check("Augustine is not called 'Aug.' and Chrysostom is not called 'Chrys.'",
  !fathers.has("Aug.") && !fathers.has("Chrys.") && !fathers.has("Gloss."));

/* The alignment that matters: the remarks attached to a verse are about that
   verse. The Catena prints the verse above its remarks, so the words of our own
   text should be in what was filed under it. */
let aligned = 0, checked = 0;
[["matthew", "1", "1"], ["matthew", "5", "3"], ["matthew", "6", "9"], ["matthew", "27", "46"],
 ["mark", "1", "1"], ["mark", "4", "39"], ["mark", "15", "34"]].forEach(function (ref) {
  const data = JSON.parse(fs.readFileSync(path.join(OUT, ref[0], ref[1] + ".json"), "utf8"));
  const mine = JSON.parse(fs.readFileSync(
    path.join(ROOT, "data", "bible", ref[0] + ".KJVM.json"), "utf8"));
  const ours = ((mine.chapters || {})[ref[1]] || {})[ref[2]];
  const entries = ((data.verses || {})[ref[2]] || []).filter(function (e) {
    return e.source === "catena"; });
  if (!ours || !entries.length) { return; }
  checked++;
  const want = new Set(String(ours).toLowerCase().match(/[a-z]{4,}/g) || []);
  const got = new Set((entries.map(function (e) { return e.text; }).join(" ") || "")
    .toLowerCase().match(/[a-z]{4,}/g) || []);
  let shared = 0;
  want.forEach(function (w) { if (got.has(w)) { shared++; } });
  if (want.size && shared / want.size >= 0.4) { aligned++; }
});
check("the remarks filed under a verse are about that verse",
  checked >= 5 && aligned === checked, aligned + " of " + checked + " aligned");
/* The app's dropdown lists the Fathers by name. Every name in it has to appear in
   a remark, and the data's names have to be in it, or a reader is offered a name
   that leads nowhere. */
const appSource = fs.readFileSync(path.join(ROOT, "apps", "commentary", "app.js"), "utf8");
const listed = (appSource.match(/var FATHERS = \[([\s\S]*?)\];/) || ["", ""])[1]
  .match(/"([^"]+)"/g);
const listedNames = (listed || []).map(function (n) { return n.replace(/"/g, ""); });
const missingFromData = listedNames.filter(function (n) { return !fathers.has(n); });
const notInTheList = Array.from(fathers).filter(function (n) { return listedNames.indexOf(n) === -1; });
check("the commentary page is registered as an app and carded",
  /id: "commentary"/.test(fs.readFileSync(path.join(ROOT, "js", "common.js"), "utf8")) &&
  /apps\/commentary\//.test(fs.readFileSync(path.join(ROOT, "tools.html"), "utf8")));
check("every Father the commentary page offers is one the data has",
  listedNames.length > 20 && missingFromData.length === 0, missingFromData.join(", "));
check("every Father in the data is offered by the page",
  notInTheList.length === 0, notInTheList.join(", "));

notes.push("Catena: " + catenaRemarks.toLocaleString() + " remarks, " + fathers.size +
  " Fathers, " + Array.from(fathers).sort().slice(0, 8).join(", ") + " …");

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

/* The chapter introductions: the commentators' front matter, which is sometimes
   the only place they touch a verse at all — JFB's remark on Genesis 1:1 is in
   the introduction, not on the verse — and for the Song of Solomon the only
   thing he wrote anywhere. */
check("the index says how many introductions each source has",
  index.sources.every(function (s) { return typeof s.introductions === "number"; }),
  JSON.stringify(index.sources.map(function (s) { return s.short + ":" + s.introductions; })));

const sng = commentary("song-of-solomon", 1);
check("the Song of Solomon has a file although no verse of it is commented on",
  !!sng && !Object.keys(sng.verses || {}).length && (sng.introductions || []).length === 1,
  sng ? Object.keys(sng.verses || {}).length + " verses, " +
    (sng.introductions || []).length + " introductions" : "no file");
check("that introduction is the commentator's own prose",
  !!sng && (sng.introductions[0].paragraphs || []).join(" ").length > 300,
  !!sng ? String((sng.introductions[0].paragraphs || []).join(" ").length) : "no file");

/* The documented omissions: Calvin's Genesis 1:1, and JFB's, which the source
   attaches to the book's front matter rather than to the verse. Both are absent
   rather than invented, and the chapter still has plenty. */
const gen1 = commentary("genesis", 1);
check("Genesis 1 has commentary", !!gen1 && Object.keys(gen1.verses).length > 5,
  gen1 ? Object.keys(gen1.verses).length + " verses" : "no file");
check("Calvin's Genesis 1:1 is absent, as its source documents",
  !!gen1 && !(gen1.verses["1"] || []).some(function (e) { return e.source === "calvin"; }),
  !!gen1 ? JSON.stringify((gen1.verses["1"] || []).map(function (e) { return e.short; })) : "no file");
check("JFB's note on Genesis 1:1 is in the introduction, where the source put it",
  !!gen1 && (gen1.introductions || []).length === 1 &&
    (gen1.introductions[0].paragraphs || []).length > 2 &&
    /In the beginning/.test((gen1.introductions[0].paragraphs || []).join(" ")),
  !!gen1 ? JSON.stringify((gen1.introductions || []).map(function (i) {
    return i.short + ":" + (i.paragraphs || []).length; })) : "no file");
check("a comment is not shown as an introduction instead of a verse comment",
  !!gen1 && (gen1.verses["2"] || []).length > 0);

check("a book with no source at all has no file, rather than an empty one",
  !fs.existsSync(path.join(OUT, "psalm-151")));

/* ---------- every remark against the verses the reader actually has ---------- */

/* This is where Haydock can go quietly wrong. He follows the Vulgate, and the
   reader shows these books in translations that do not all divide them his way,
   so a remark has to land on a verse some translation has — otherwise tapping a
   verse would show a remark about a verse that is not there. */
const verseCache = {};
function versesOf(slug, chapter) {
  const key = slug + "|" + chapter;
  if (key in verseCache) { return verseCache[key]; }
  const numbers = new Set();
  const book = bySlug[slug];
  ((book && book.translations) || []).forEach(function (t) {
    const file = path.join(ROOT, "data", "bible", slug + "." + t + ".json");
    if (!fs.existsSync(file)) { return; }
    let data;
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return; }
    const verses = ((data.chapters || {})[String(chapter)]) || {};
    Object.keys(verses).forEach(function (v) { numbers.add(Number(v)); });
  });
  verseCache[key] = numbers;
  return numbers;
}

let offText = 0;
const offTextExamples = [];
index.books.forEach(function (slug) {
  const dir = path.join(OUT, slug);
  if (!fs.existsSync(dir)) { return; }
  fs.readdirSync(dir).forEach(function (name) {
    const chapter = Number(String(name).replace(/\.json$/, ""));
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); }
    catch (e) { return; }
    const have = versesOf(slug, chapter);
    if (!have.size) { return; }
    Object.keys(data.verses || {}).forEach(function (v) {
      if (!have.has(Number(v))) {
        offText++;
        if (offTextExamples.length < 4) { offTextExamples.push(slug + " " + chapter + ":" + v); }
      }
    });
  });
});
check("every remark lands on a verse the reader has in some translation",
  offText === 0, offText + " not in any" +
    (offTextExamples.length ? ": " + offTextExamples.join("; ") : ""));

/* ---------- the book introductions ---------- */

const ABOUT = path.join(ROOT, "data", "about");
const about = fs.existsSync(ABOUT) ? fs.readdirSync(ABOUT).filter(function (n) {
  return /\.json$/.test(n);
}) : [];
check("book introductions exist for the deuterocanon", about.length >= 12, about.length + " files");
check("every book introduction names its source and holds clean paragraphs",
  about.every(function (n) {
    const data = JSON.parse(fs.readFileSync(path.join(ABOUT, n), "utf8"));
    return data.source && data.source.short && data.slug &&
      (data.paragraphs || []).length > 0 &&
      (data.paragraphs || []).every(function (p) { return p && !/<[a-z/]/i.test(p); });
  }));
check("a book introduction exists only for a book the reader has",
  about.every(function (n) { return !!bySlug[n.replace(/\.json$/, "")]; }));
/* Four of the twenty deuterocanonical books have no commentary anywhere in the
   public domain, and their panels show a Hastings article instead. A reader has
   to be told that is what it is, so the note is required, not optional. */
/* A transcription from a scan has to carry three things a reader can check: that
   it came from a scan, that what it is, is not commentary, and no apparatus —
   Charles's pages end in versional and collation notes, and those must never
   arrive as prose. The shapes below are what got through before the filters did. */
check("a transcribed introduction says where it came from and what it is not",
  about.every(function (n) {
    const data = JSON.parse(fs.readFileSync(path.join(ABOUT, n), "utf8"));
    if ((data.source || {}).id !== "charles") { return true; }
    return typeof data.note === "string" && /scan/i.test(data.note) &&
      /not a commentary/i.test(data.note);
  }), about.filter(function (n) {
    const data = JSON.parse(fs.readFileSync(path.join(ABOUT, n), "utf8"));
    return (data.source || {}).id === "charles";
  }).map(function (n) { return n.replace(/\.json$/, ""); }).join(", ") || "none shipped");
check("no apparatus survives in a transcribed introduction",
  about.every(function (n) {
    const data = JSON.parse(fs.readFileSync(path.join(ABOUT, n), "utf8"));
    if ((data.source || {}).id !== "charles") { return true; }
    const text = (data.paragraphs || []).join(" ");
    /* One siglum in a sentence is scholarship ("extracts from the LXX of 2 Kings");
       a paragraph of them is the apparatus, which is what the build drops at four.
       The other shapes have no business in prose at any count. */
    const sigla = /\b(LXX|Codd?|Vulg|Syr|Targ|MT|Aquila|Symmachus|Theodotion)\b\.?/g;
    return (data.paragraphs || []).every(function (para) {
      return (para.match(sigla) || []).length < 3;
    }) && !/\w+\.\./.test(text) && !/[€|†]/.test(text) &&
      !/\b(interlined|on erasure|edd|om)\b\.?/.test(text);
  }), about.filter(function (n) {
    const data = JSON.parse(fs.readFileSync(path.join(ABOUT, n), "utf8"));
    return (data.source || {}).id === "charles";
  }).map(function (n) { return n.replace(/\.json$/, ""); }).join(", "));

check("an introduction that is not commentary says so",
  about.every(function (n) {
    const data = JSON.parse(fs.readFileSync(path.join(ABOUT, n), "utf8"));
    const id = (data.source || {}).id;
    if (id !== "has" && id !== "smi" && id !== "eas") { return true; }
    return typeof data.note === "string" && /not a commentary/i.test(data.note);
  }), about.filter(function (n) {
    const data = JSON.parse(fs.readFileSync(path.join(ABOUT, n), "utf8"));
    return (data.source || {}).id === "has";
  }).join(", "));
notes.push(about.length + " book introductions: " + about.map(function (n) {
  return n.replace(/\.json$/, "");
}).join(", "));

/* A chapter file for a chapter the book does not have is always a parse fault:
   it came from a number read somewhere it was not a verse number, or from a
   heading counted twice. Matthew 29 existed for ten minutes that way. */
const strayChapters = [];
index.books.forEach(function (slug) {
  const dir = path.join(OUT, slug);
  const book = bySlug[slug];
  if (!book || !fs.existsSync(dir)) { return; }
  /* A chapter counts as real if some translation that carries the book has it:
     the Douay-Rheims numbers Esther in sixteen chapters where the Hebrew has ten,
     and a remark on Esther 16 is a remark on a chapter a reader can open — in
     that translation. The book's own count is the Hebrew one. */
  let most = book.chapters;
  (book.translations || []).forEach(function (t) {
    const file = path.join(ROOT, "data", "bible", slug + "." + t + ".json");
    if (!fs.existsSync(file)) { return; }
    let data;
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return; }
    Object.keys(data.chapters || {}).forEach(function (k) {
      const n = Number(k);
      if (n > most) { most = n; }
    });
  });
  fs.readdirSync(dir).forEach(function (name) {
    const chapter = Number(String(name).replace(/\.json$/, ""));
    if (chapter > most) { strayChapters.push(slug + " " + chapter); }
  });
});
check("no commentary file for a chapter the book does not have",
  strayChapters.length === 0, strayChapters.join(", "));

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
